-- =========================================================
-- 序光計畫：🗓️ 月報 ＋ 💱 現實 ↔ 遊戲換算
-- 要先跑過「2026-11-02_生活打卡.sql」「2026-11-01_冒險_競技場.sql」。可以重複執行。
--
--   life_month(p_offset)：0 = 這個月、-1 = 上個月…
--   📊 專注（總時數、各科、最長一天、每天平均）、任務、簽到、習慣、生活打卡全勤天數
--   ⚔️ 遊戲：每週王、競技場、新裝備
--   💱 這個月拿到的東西，依「是做了什麼真實的事換來的」分類：專注／任務／簽到／生活打卡／競技場／其他遊戲內
--   跟上個月比
-- =========================================================

create or replace function public.month_src_cat(src text)
returns text language sql immutable as $$
  select case
    when src like 'focus%' or src like 'doom-run%' or src like 'map%' or src like 'coop%' then 'focus'
    when src like 'task%' or src = 'exp' or src like 'tq%' then 'task'
    when src like 'checkin%' or src like 'ltd-checkin%' or src like 'month%' then 'checkin'
    when src like 'proj%' or src like 'life%' then 'life'
    when src like 'arena%' then 'arena'
    else 'game' end
$$;

create or replace function public.month_stats(u uuid, m date)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with r as (select m d0, (m + interval '1 month - 1 day')::date d1),
  f as (select session_date d, subject, sum(duration_seconds) s from public.focus_sessions, r
         where user_id = u and session_date between r.d0 and r.d1 group by 1, 2)
  select jsonb_build_object(
    'focus_h', round(coalesce((select sum(s) from f), 0) / 3600.0, 1),
    'focus_days', (select count(distinct d) from f),
    'focus_best', (select jsonb_build_object('d', d, 'h', round(t / 3600.0, 1)) from (select d, sum(s) t from f group by d order by t desc limit 1) x),
    'subjects', coalesce((select jsonb_agg(jsonb_build_object('name', subject, 'h', h) order by h desc) from (select subject, round(sum(s) / 3600.0, 1) h from f group by 1) x where h > 0), '[]'::jsonb),
    'tasks_done', (select count(*) from public.tasks, r where user_id = u and task_date between r.d0 and r.d1 and completed),
    'tasks_total', (select count(*) from public.tasks, r where user_id = u and task_date between r.d0 and r.d1),
    'checkins', (select count(*) from public.checkins, r where user_id = u and checkin_date between r.d0 and r.d1),
    'habit_logs', (select count(*) from public.habit_logs, r where user_id = u and log_date between r.d0 and r.d1),
    'life_steps', (select count(*) from public.project_step_logs l join public.projects p on p.id = l.project_id, r
                    where l.user_id = u and p.domain is not null and l.done and l.day between r.d0 and r.d1),
    'life_all', (select count(*) from r, generate_series(r.d0, least(r.d1, public.app_today()), interval '1 day') x where public.life_all_clear(u, x::date)),
    'boss_kills', (select count(*) from public.rpg_boss_runs, r where user_id = u and killed_at is not null and week_start between r.d0 - 6 and r.d1),
    'arena_w', (select count(*) from public.arena_duels, r where user_id = u and win and day between r.d0 and r.d1),
    'arena_l', (select count(*) from public.arena_duels, r where user_id = u and not win and day between r.d0 and r.d1),
    'days', (select least(r.d1, public.app_today()) - r.d0 + 1 from r)
  )
$$;
revoke all on function public.month_stats(uuid, date) from public, anon, authenticated;

create or replace function public.life_month(p_offset integer default 0)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  u uuid := auth.uid(); m date := (date_trunc('month', public.app_today()) + make_interval(months => least(p_offset, 0)))::date;
  t0 timestamptz; t1 timestamptz; earn jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  t0 := (m::timestamp + interval '6 hours') at time zone 'Asia/Taipei';
  t1 := ((m + interval '1 month')::timestamp + interval '6 hours') at time zone 'Asia/Taipei';
  -- 💱 這個月拿到的東西（只算增加的），依來源分類
  select coalesce(jsonb_object_agg(cat, items), '{}'::jsonb) into earn from (
    select cat, jsonb_object_agg(item_key, q) items from (
      select public.month_src_cat(split_part(source_key, ':', 1)) cat, item_key, sum(delta)::int q
        from public.item_events where user_id = u and delta > 0 and created_at >= t0 and created_at < t1
       group by 1, 2) x group by cat) y;
  return json_build_object(
    'month', m, 'offset', least(p_offset, 0),
    'now', public.month_stats(u, m),
    'prev', public.month_stats(u, (m - interval '1 month')::date),
    'earn', earn,
    'gear_new', (select count(*) from public.rpg_gear where user_id = u and created_at >= t0 and created_at < t1));
exception when undefined_column then
  return json_build_object('month', m, 'offset', least(p_offset, 0), 'now', public.month_stats(u, m),
    'prev', public.month_stats(u, (m - interval '1 month')::date), 'earn', earn, 'gear_new', null);
end; $$;
revoke all on function public.life_month(integer) from public, anon;
grant execute on function public.life_month(integer) to authenticated;
