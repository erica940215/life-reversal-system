-- =========================================================
-- 序光計畫：📚 每科今天學到什麼＋遺忘曲線複習
--   每科寫幾個「今天學到的標題」（可加一句重點），
--   之後在 1、2、4、7、15、30、60 天後排回來複習：看標題回想內容，記得就往後排，忘了回到第 1 天
-- 可以重複執行。
-- =========================================================
create table if not exists public.learn_notes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  subject text not null check (char_length(subject) between 1 and 30),
  title text not null check (char_length(title) between 1 and 120),
  note text check (note is null or char_length(note) <= 1000),
  stage integer not null default 0,
  due date not null,
  reviews integer not null default 0,
  lapses integer not null default 0,
  last_review date,
  created_at timestamptz not null default now()
);
create index if not exists learn_notes_due on public.learn_notes (user_id, due);
alter table public.learn_notes enable row level security;
drop policy if exists "own select" on public.learn_notes;
create policy "own select" on public.learn_notes for select using (auth.uid() = user_id);
revoke insert, update, delete on public.learn_notes from authenticated, anon;

create or replace function public.learn_gaps() returns integer[] language sql immutable as $$ select array[1, 2, 4, 7, 15, 30, 60] $$;

create or replace function public.learn_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today();
begin
  if u is null then raise exception '尚未登入'; end if;
  return json_build_object('today', t,
    'today_notes', coalesce((select json_agg(json_build_object('id', id, 'subject', subject, 'title', title, 'note', note) order by subject, id) from public.learn_notes where user_id = u and day = t), '[]'),
    'due', coalesce((select json_agg(json_build_object('id', id, 'subject', subject, 'title', title, 'note', note, 'day', day, 'stage', stage, 'lapses', lapses) order by due, id)
        from public.learn_notes where user_id = u and due <= t and day < t), '[]'),
    'subjects', coalesce((select json_agg(s order by n desc) from (select subject s, count(*) n from (
        select subject from public.focus_sessions where user_id = u and session_date > t - 30 and coalesce(btrim(subject), '') <> ''
        union all select subject from public.learn_notes where user_id = u) x group by 1 limit 12) y), '[]'),
    'total', (select count(*) from public.learn_notes where user_id = u),
    'mastered', (select count(*) from public.learn_notes where user_id = u and stage >= 5),
    'reviewed_today', (select count(*) from public.learn_notes where user_id = u and last_review = t),
    'by_subject', coalesce((select json_object_agg(subject, n) from (select subject, count(*) n from public.learn_notes where user_id = u group by 1) z), '{}'));
end; $$;

create or replace function public.learn_add(p_subject text, p_title text, p_note text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today();
begin
  if u is null then raise exception '尚未登入'; end if;
  insert into public.learn_notes (user_id, day, subject, title, note, due) values (u, t, btrim(p_subject), btrim(p_title), nullif(btrim(p_note), ''), t + 1);
  if (select count(*) from public.learn_notes where user_id = u and day = t) = 3 then perform public.grant_item(u, 'stardust', 15, 'learn-day:' || t); end if;
  return public.learn_status();
end; $$;

create or replace function public.learn_edit(p_id bigint, p_title text, p_note text)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  update public.learn_notes set title = btrim(p_title), note = nullif(btrim(p_note), '') where id = p_id and user_id = auth.uid();
  return public.learn_status();
end; $$;

create or replace function public.learn_delete(p_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  delete from public.learn_notes where id = p_id and user_id = auth.uid();
  return public.learn_status();
end; $$;

-- p_grade：0 忘了（回到第 1 天）、1 模糊（同一階再來）、2 記得（往後一階）
create or replace function public.learn_review(p_id bigint, p_grade integer)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); n public.learn_notes; st integer; g integer[] := public.learn_gaps();
begin
  select * into n from public.learn_notes where id = p_id and user_id = u for update;
  if not found then raise exception '找不到這則'; end if;
  st := case p_grade when 0 then 0 when 1 then n.stage else least(n.stage + 1, array_length(g, 1) - 1) end;
  update public.learn_notes set stage = st, due = t + g[st + 1], reviews = reviews + 1, lapses = lapses + case when p_grade = 0 then 1 else 0 end, last_review = t where id = p_id;
  if (select count(*) from public.learn_notes where user_id = u and last_review = t) = 5 then perform public.grant_item(u, 'stardust', 10, 'learn-rev:' || t); end if;
  return json_build_object('next_days', g[st + 1], 'stage', st);
end; $$;

do $$ declare f text; begin
  foreach f in array array['learn_status()', 'learn_add(text,text,text)', 'learn_edit(bigint,text,text)', 'learn_delete(bigint)', 'learn_review(bigint,integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
