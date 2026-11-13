-- =========================================================
-- 序光計畫：🎯 改善清單 ＋ 📋 今日預設任務選擇（已經在線上套用過；可以重複執行）
--
-- ① 改善清單（取代原本「只追蹤一天」的改善打卡）
--   improvements：每一條改善（反省裡「明天要改善」一行一條，或自己新增）
--     status：active 進行中（每天打卡）／done 徹底改善了／dropped 不追蹤了／archived 舊紀錄
--   improve_marks：每天做到的打卡紀錄
--   improve_today()：把昨天反省寫的新改善加進清單，回傳所有進行中的改善＋今天做到沒
--   improve_toggle(id, done)、improve_end(id, status)、improve_add(text)
--   獎勵：當天進行中的改善全部做到 ✨+15；按「徹底改善」每條 ✨+30（一條只給一次）
--
-- ② 今日預設任務選擇
--   原本：一打開任務就自動把「重複任務範本」全部加進今天。
--   現在：每天第一次要先選「今天要加哪些」，沒選之前不會自動加；選了之後照選的加，沒選的今天不出現。
--   task_day_plan：每天的選擇；day_plan_status()、day_plan_set(keep)
-- =========================================================

/* ---------- ① 改善清單 ---------- */
create table if not exists public.improvements (
  id bigserial primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null, source_date date, status text not null default 'active', note text,
  created_at timestamptz not null default now(), ended_at timestamptz);
create unique index if not exists improvements_src on public.improvements (user_id, source_date, text);
create table if not exists public.improve_marks (
  improvement_id bigint not null references public.improvements(id) on delete cascade, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null, created_at timestamptz not null default now(), primary key (improvement_id, day));
do $$ declare t text; begin
  foreach t in array array['improvements','improve_marks'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'own all') then
      execute format('create policy "own all" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    end if;
  end loop;
end $$;
grant select, insert, update, delete on public.improvements, public.improve_marks to authenticated;
grant usage, select on sequence public.improvements_id_seq to authenticated;

/* 一段反省文字 → 一行一條 */
create or replace function public.improve_lines(txt text) returns text[] language sql immutable as $$
  select coalesce(array(select left(btrim(regexp_replace(x, '^\s*([0-9]+[.、)](?![0-9])|[-・•*])\s*', '')), 120) from regexp_split_to_table(coalesce(txt, ''), '[\n；;]') x
    where btrim(regexp_replace(x, '^\s*([0-9]+[.、)](?![0-9])|[-・•*])\s*', '')) <> ''), '{}'::text[]);
$$;

/* 舊資料搬家（只做一次）：所有反省寫過的改善都進清單；最近 7 天的設成進行中，更早的設成舊紀錄；原本的打卡也搬過來 */
do $$ begin
  if not exists (select 1 from public.improvements) then
    insert into public.improvements (user_id, text, source_date, status, created_at)
    select r.user_id, l, r.reflect_date, case when r.reflect_date >= public.app_today() - 7 then 'active' else 'archived' end, (r.reflect_date + 1)::timestamptz
    from public.daily_reflections r, unnest(public.improve_lines(r.improvement)) l
    where coalesce(btrim(r.improvement), '') <> '' on conflict do nothing;
    insert into public.improve_marks (improvement_id, user_id, day)
    select i.id, c.user_id, c.day from public.improve_checks c join public.improvements i on i.user_id = c.user_id and i.text = c.text and i.source_date = c.day - 1
    where c.done on conflict do nothing;
  end if;
end $$;

/* 連續做到幾天（今天還沒打卡不算斷） */
create or replace function public.improve_streak(p bigint, t date) returns integer language plpgsql stable as $$
declare d date := t; n integer := 0;
begin
  if not exists (select 1 from public.improve_marks where improvement_id = p and day = t) then d := t - 1; end if;
  while n < 400 and exists (select 1 from public.improve_marks where improvement_id = p and day = d) loop n := n + 1; d := d - 1; end loop;
  return n;
end; $$;

create or replace function public.improve_today()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); txt text; l text;
begin
  if u is null then raise exception '尚未登入'; end if;
  /* 昨天（和更早還沒收進來的最近 3 天）反省寫的改善，加進清單 */
  for txt, l in select r.improvement, r.reflect_date::text from public.daily_reflections r where r.user_id = u and r.reflect_date between t - 3 and t - 1 and coalesce(btrim(r.improvement), '') <> '' loop
    insert into public.improvements (user_id, text, source_date)
    select u, x, l::date from unnest(public.improve_lines(txt)) x
    where not exists (select 1 from public.improvements i where i.user_id = u and i.text = x and i.status = 'active')
    on conflict do nothing;
  end loop;
  return json_build_object('day', t,
    'items', coalesce((select json_agg(json_build_object('id', i.id, 'text', i.text, 'since', coalesce(i.source_date + 1, i.created_at::date),
        'done', exists (select 1 from public.improve_marks m where m.improvement_id = i.id and m.day = t),
        'days', (select count(*) from public.improve_marks m where m.improvement_id = i.id),
        'streak', public.improve_streak(i.id, t),
        'last7', (select json_agg(exists (select 1 from public.improve_marks m where m.improvement_id = i.id and m.day = t - k) order by k desc) from generate_series(0, 6) k)
      ) order by i.created_at, i.id) from public.improvements i where i.user_id = u and i.status = 'active'), '[]'),
    'week', coalesce((select json_agg(json_build_object('day', d, 'n', n, 'd', dn) order by d) from (
        select d::date d, (select count(*) from public.improvements i where i.user_id = u and coalesce(i.source_date + 1, i.created_at::date) <= d and (i.status in ('active') or i.ended_at::date >= d) and i.status <> 'archived') n,
          (select count(*) from public.improve_marks m where m.user_id = u and m.day = d) dn
        from generate_series(t - 6, t, interval '1 day') d) x where n > 0), '[]'),
    'tonight', (select improvement from public.daily_reflections where user_id = u and reflect_date = t),
    'ended', (select count(*) from public.improvements where user_id = u and status = 'done'));
end; $$;

drop function if exists public.improve_toggle(integer, boolean);
create or replace function public.improve_toggle(p_id bigint, p_done boolean)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today();
begin
  if u is null then raise exception '尚未登入'; end if;
  if not exists (select 1 from public.improvements where id = p_id and user_id = u) then raise exception '找不到這條改善'; end if;
  if p_done then insert into public.improve_marks (improvement_id, user_id, day) values (p_id, u, t) on conflict do nothing;
  else delete from public.improve_marks where improvement_id = p_id and day = t; end if;
  if p_done and not exists (select 1 from public.improvements i where i.user_id = u and i.status = 'active' and not exists (select 1 from public.improve_marks m where m.improvement_id = i.id and m.day = t)) then
    perform public.grant_item(u, 'stardust', 15, 'improve-all:' || t);
  end if;
  return public.improve_today();
end; $$;

create or replace function public.improve_end(p_id bigint, p_status text, p_note text default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); g boolean := false;
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_status not in ('active', 'done', 'dropped') then raise exception '狀態不對'; end if;
  update public.improvements set status = p_status, ended_at = case when p_status = 'active' then null else now() end, note = coalesce(p_note, note) where id = p_id and user_id = u;
  if not found then raise exception '找不到這條改善'; end if;
  if p_status = 'done' then g := public.grant_item(u, 'stardust', 30, 'improve-done:' || p_id); end if;
  return json_build_object('granted', g, 'today', public.improve_today());
end; $$;

create or replace function public.improve_add(p_text text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '尚未登入'; end if;
  if coalesce(btrim(p_text), '') = '' then raise exception '寫一下要改善什麼'; end if;
  insert into public.improvements (user_id, text) values (u, left(btrim(p_text), 120));
  return public.improve_today();
end; $$;
revoke all on function public.improve_today(), public.improve_toggle(bigint, boolean), public.improve_end(bigint, text, text), public.improve_add(text) from public, anon;
grant execute on function public.improve_today(), public.improve_toggle(bigint, boolean), public.improve_end(bigint, text, text), public.improve_add(text) to authenticated;

/* ---------- ② 今日預設任務選擇 ---------- */
create table if not exists public.task_day_plan (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, day date not null,
  keep bigint[] not null default '{}', decided_at timestamptz not null default now(), primary key (user_id, day));
alter table public.task_day_plan enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'task_day_plan' and policyname = 'own all') then
    create policy "own all" on public.task_day_plan for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
grant select, insert, update, delete on public.task_day_plan to authenticated;

/* 今天輪到哪些範本 */
create or replace function public.templates_due(u uuid, d date)
returns setof public.task_templates language sql stable security definer set search_path to 'public' as $$
  select * from public.task_templates t where t.user_id = u and t.repeat_enabled and (t.repeat_end_date is null or t.repeat_end_date >= d)
    and (t.repeat_type = 'daily' or (t.repeat_type = 'weekly' and extract(isodow from d)::int = any(t.repeat_days)))
  order by t.created_at, t.id;
$$;
revoke all on function public.templates_due(uuid, date) from public, anon, authenticated;

/* 每天產生任務：還沒選之前不加；選了之後只加選的 */
create or replace function public.generate_daily_tasks()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); p public.task_day_plan; v record; n integer := 0;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into p from public.task_day_plan where user_id = u and day = t;
  if not found then
    return json_build_object('success', true, 'created', 0, 'date', t, 'pending', (select count(*) from public.templates_due(u, t) x where not exists (select 1 from public.tasks k where k.user_id = u and k.task_date = t and k.template_id = x.id)));
  end if;
  for v in select * from public.templates_due(u, t) x where x.id = any(p.keep) loop
    if not exists (select 1 from public.tasks where user_id = u and task_date = t and template_id = v.id) then
      insert into public.tasks (user_id, title, category, difficulty, exp_reward, gold_reward, completed, task_date, repeat_type, repeat_days, repeat_enabled, repeat_end_date, template_id)
      values (u, v.title, v.category, v.difficulty, v.exp_reward, v.gold_reward, false, t, v.repeat_type, v.repeat_days, true, v.repeat_end_date, v.id);
      n := n + 1;
    end if;
  end loop;
  return json_build_object('success', true, 'created', n, 'date', t, 'pending', 0);
end; $$;

create or replace function public.day_plan_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today();
begin
  if u is null then raise exception '尚未登入'; end if;
  return json_build_object('day', t, 'decided', exists (select 1 from public.task_day_plan where user_id = u and day = t),
    'other_today', (select count(*) from public.tasks where user_id = u and task_date = t and template_id is null),
    'yesterday', (select json_build_object('n', count(*), 'done', count(*) filter (where completed)) from public.tasks where user_id = u and task_date = t - 1),
    'templates', coalesce((select json_agg(json_build_object('id', x.id, 'title', x.title, 'category', x.category, 'difficulty', x.difficulty, 'exp', x.exp_reward, 'gold', x.gold_reward,
        'exists', k.id is not null, 'completed', coalesce(k.completed, false),
        'kept', exists (select 1 from public.task_day_plan p where p.user_id = u and p.day = t and x.id = any(p.keep)),
        'rate', (select round(avg(case when kk.completed then 1 else 0 end)::numeric, 2) from public.tasks kk where kk.user_id = u and kk.template_id = x.id and kk.task_date between t - 14 and t - 1))
      order by x.created_at, x.id) from public.templates_due(u, t) x left join public.tasks k on k.user_id = u and k.task_date = t and k.template_id = x.id), '[]'));
end; $$;

/* 決定今天的預設任務：留下的加進今天；沒留的，今天如果已經加了又還沒完成，就拿掉 */
create or replace function public.day_plan_set(p_keep bigint[])
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); removed integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  insert into public.task_day_plan (user_id, day, keep, decided_at) values (u, t, coalesce(p_keep, '{}'), now())
  on conflict (user_id, day) do update set keep = excluded.keep, decided_at = now();
  delete from public.tasks k where k.user_id = u and k.task_date = t and k.template_id is not null and not k.completed and not (k.template_id = any(coalesce(p_keep, '{}')));
  get diagnostics removed = row_count;
  return json_build_object('removed', removed, 'gen', public.generate_daily_tasks());
end; $$;
revoke all on function public.day_plan_status(), public.day_plan_set(bigint[]) from public, anon;
grant execute on function public.day_plan_status(), public.day_plan_set(bigint[]) to authenticated;
