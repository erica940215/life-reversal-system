-- =========================================================
-- 序光計畫：💰 時間預算
-- 可以重複執行。
--   每週一分配時間（例如讀書 20 小時、休息 10 小時），像記帳一樣看實際花多少
--   有綁專注科目的類別 → 自動算專注時數；沒綁的（休息、娛樂…）→ 自己按 +30 分 記
--   這週沒設定時，自動沿用上週的預算
-- =========================================================

create table if not exists public.time_budget (
  user_id uuid not null references auth.users(id) on delete cascade,
  week date not null,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, week)
);
create table if not exists public.time_spend (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  k text not null,
  minutes integer not null check (minutes between -600 and 1440),
  note text check (note is null or char_length(note) <= 60),
  created_at timestamptz not null default now()
);
create index if not exists time_spend_user_day on public.time_spend (user_id, day);
alter table public.time_budget enable row level security;
alter table public.time_spend enable row level security;
drop policy if exists "own select" on public.time_budget;
create policy "own select" on public.time_budget for select using (auth.uid() = user_id);
drop policy if exists "own select" on public.time_spend;
create policy "own select" on public.time_spend for select using (auth.uid() = user_id);
revoke insert, update, delete on public.time_budget, public.time_spend from authenticated, anon;

create or replace function public.budget_default() returns jsonb language sql immutable as $$ select '[
 {"k":"study","name":"讀書","emoji":"📚","hours":20,"subjects":[]},
 {"k":"project","name":"專題／網站","emoji":"💻","hours":6,"subjects":["計畫","App 開發"]},
 {"k":"rest","name":"休息娛樂","emoji":"🎮","hours":10,"manual":true},
 {"k":"workout","name":"運動","emoji":"🏃","hours":3,"manual":true}]'::jsonb $$;

-- p_offset：0 = 這週，-1 = 上週…
create or replace function public.budget_status(p_offset integer default 0)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); w date := public.life_week(public.app_today()) + 7 * least(p_offset, 0);
  items jsonb; prev jsonb; res jsonb := '[]'::jsonb; it jsonb; subs text[]; claimed text[] := '{}'; act integer; d integer;
  focus jsonb; days integer; catchall text;
begin
  if u is null then raise exception '尚未登入'; end if;
  select b.items into items from public.time_budget b where b.user_id = u and b.week = w;
  if items is null then
    select b.items into prev from public.time_budget b where b.user_id = u and b.week < w order by b.week desc limit 1;
    items := coalesce(prev, public.budget_default());
  end if;
  -- 這週每個科目的專注分鐘
  select coalesce(jsonb_object_agg(subject, m), '{}'::jsonb) into focus from (
    select coalesce(nullif(btrim(subject), ''), '未分類') subject, round(sum(coalesce(duration_seconds, 0)) / 60.0)::int m
    from public.focus_sessions where user_id = u and session_date between w and w + 6 group by 1) x;
  -- 有指定科目的類別先認領，「科目空白、不是手動」的類別吃剩下的全部專注
  for it in select * from jsonb_array_elements(items) loop
    if not coalesce((it->>'manual')::boolean, false) and jsonb_array_length(coalesce(it->'subjects', '[]')) > 0 then
      claimed := claimed || array(select jsonb_array_elements_text(it->'subjects'));
    end if;
  end loop;
  select it2->>'k' into catchall from jsonb_array_elements(items) it2
   where not coalesce((it2->>'manual')::boolean, false) and jsonb_array_length(coalesce(it2->'subjects', '[]')) = 0 limit 1;
  for it in select * from jsonb_array_elements(items) loop
    act := 0;
    if not coalesce((it->>'manual')::boolean, false) then
      if it->>'k' = catchall then
        select coalesce(sum(value::int), 0) into act from jsonb_each_text(focus) where not (key = any(claimed));
      else
        select coalesce(sum(value::int), 0) into act from jsonb_each_text(focus) where key = any(array(select jsonb_array_elements_text(coalesce(it->'subjects', '[]'))));
      end if;
    end if;
    select act + coalesce(sum(minutes), 0) into act from public.time_spend where user_id = u and k = it->>'k' and day between w and w + 6;
    res := res || jsonb_build_array(it || jsonb_build_object('actual', act,
      'by_day', (select jsonb_agg(coalesce((select sum(minutes) from public.time_spend s where s.user_id = u and s.k = it->>'k' and s.day = w + g), 0) order by g) from generate_series(0, 6) g)));
  end loop;
  days := least(greatest(t - w + 1, 0), 7);
  return json_build_object('week', w, 'today', t, 'days_passed', case when p_offset < 0 then 7 else days end, 'items', res,
    'set_this_week', exists (select 1 from public.time_budget where user_id = u and week = w),
    'focus', focus,
    'subjects', coalesce((select jsonb_agg(distinct subject) from public.focus_sessions where user_id = u and session_date > t - 60 and coalesce(btrim(subject), '') <> ''), '[]'),
    'logs', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'day', day, 'k', k, 'minutes', minutes, 'note', note) order by created_at desc)
      from (select * from public.time_spend where user_id = u and day between w and w + 6 order by created_at desc limit 30) l), '[]'));
end; $$;

create or replace function public.budget_save(p_items jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); w date := public.life_week(public.app_today());
begin
  if u is null then raise exception '尚未登入'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 12 then raise exception '類別最多 12 個'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) e where coalesce(e->>'k', '') = '' or coalesce(btrim(e->>'name'), '') = ''
      or (e->>'hours')::numeric not between 0 and 168) then raise exception '每個類別都要有名稱，時數 0～168'; end if;
  insert into public.time_budget (user_id, week, items) values (u, w, p_items)
    on conflict (user_id, week) do update set items = excluded.items, updated_at = now();
  return public.budget_status(0);
end; $$;

create or replace function public.budget_log(p_k text, p_minutes integer, p_note text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_minutes = 0 or p_minutes not between -600 and 1440 then raise exception '分鐘數不對'; end if;
  insert into public.time_spend (user_id, day, k, minutes, note) values (u, public.app_today(), p_k, p_minutes, nullif(btrim(p_note), ''));
  return public.budget_status(0);
end; $$;

create or replace function public.budget_undo(p_id bigint)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  delete from public.time_spend where id = p_id and user_id = auth.uid();
  return public.budget_status(0);
end; $$;

do $$ declare f text; begin
  foreach f in array array['budget_status(integer)', 'budget_save(jsonb)', 'budget_log(text,integer,text)', 'budget_undo(bigint)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
