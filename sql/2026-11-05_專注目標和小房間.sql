-- =========================================================
-- 序光計畫：🎯 專注前的一句話（說到做到率）＋ 🏠 我的小房間
-- 要先跑過「2026-11-05_專注DNA_事件_掉落_陪讀_博物館.sql」「2026-11-05_夢境和人生之樹.sql」。可以重複執行。
--
--   🎯 開始專注前寫「這次要完成什麼」，結束時選 ✅ 完成／🌗 一半／❌ 沒有
--      專注 DNA 多一項「說到做到率」（完成 1、一半 0.5）
--   🏠 小房間：最近 3 天「🧹 生活」和「🧴 清潔保養」的完成度決定房間乾不乾淨
--      （越亂地上越多襪子、紙團、衣服）；牆上、架上、地上 6 個位置可以擺你的夢境收藏
--      好友可以來參觀
-- =========================================================

alter table public.focus_sessions add column if not exists goal text;
alter table public.focus_sessions add column if not exists goal_result text;
do $$ begin
  alter table public.focus_sessions add constraint focus_sessions_goal_check check (goal is null or char_length(goal) <= 80);
  alter table public.focus_sessions add constraint focus_sessions_goal_result_check check (goal_result is null or goal_result in ('done', 'half', 'no'));
exception when duplicate_object then null; end $$;

-- 🧬 DNA 多帶說到做到率
do $$ begin
  if to_regprocedure('public.focus_dna_base(integer)') is null then alter function public.focus_dna(integer) rename to focus_dna_base; end if;
end $$;
revoke all on function public.focus_dna_base(integer) from public, anon, authenticated;
create or replace function public.focus_dna(p_offset integer default 0)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); m date := (date_trunc('month', public.app_today()) + make_interval(months => least(p_offset, 0)))::date; g jsonb;
begin
  select jsonb_build_object('goal_n', count(*) filter (where goal_result is not null),
      'goal_done', count(*) filter (where goal_result = 'done'), 'goal_half', count(*) filter (where goal_result = 'half'),
      'goal_rate', round(100.0 * (count(*) filter (where goal_result = 'done') + 0.5 * count(*) filter (where goal_result = 'half')) / nullif(count(*) filter (where goal_result is not null), 0)),
      'goal_recent', coalesce((select jsonb_agg(jsonb_build_object('goal', goal, 'r', goal_result, 'subject', subject) order by started_at desc)
          from (select * from public.focus_sessions where user_id = u and goal is not null and session_date between m and (m + interval '1 month - 1 day')::date order by started_at desc limit 6) q), '[]'::jsonb))
    into g from public.focus_sessions where user_id = u and session_date between m and (m + interval '1 month - 1 day')::date;
  return (public.focus_dna_base(p_offset)::jsonb || g)::json;
end; $$;
revoke all on function public.focus_dna(integer) from public, anon;
grant execute on function public.focus_dna(integer) to authenticated;


-- 🏠 小房間
-- 舊版本叫 room_status(uuid)／room_place，會跟「讀書房」的 room_status() 撞名，先刪掉
drop function if exists public.room_status(uuid);
drop function if exists public.room_place(text, text);
create table if not exists public.room_layout (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slots jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.room_layout enable row level security;
drop policy if exists "own select" on public.room_layout;
create policy "own select" on public.room_layout for select using (auth.uid() = user_id);
revoke insert, update, delete on public.room_layout from authenticated, anon;

create or replace function public.home_status(p_user uuid default null)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  me uuid := auth.uid(); u uuid := coalesce(p_user, auth.uid()); t date := public.app_today(); clean numeric; lastclean integer;
begin
  if me is null then raise exception '尚未登入'; end if;
  if u <> me and not exists (select 1 from public.arena_friends(me) f where f = u) then raise exception '只能參觀好友的房間'; end if;
  select round(avg(p)) into clean from (
    select public.life_pct(u, dom, (t - g)::date) p from generate_series(0, 2) g, unnest(array['life', 'care']) dom) x where p is not null;
  select coalesce(t - max(l.day), 99) into lastclean from public.project_step_logs l join public.project_steps s on s.id = l.step_id
   where l.user_id = u and l.done and s.title like '%整理房間%';
  return json_build_object(
    'mine', u = me, 'name', public.arena_name(u), 'clean', clean, 'last_room', lastclean,
    'hour', extract(hour from now() at time zone 'Asia/Taipei')::int,
    'slots', coalesce((select slots from public.room_layout where user_id = u), '{}'::jsonb),
    'owned', case when u = me then coalesce((select jsonb_agg(item) from public.dream_items where user_id = u), '[]'::jsonb) end,
    'catalog', public.dream_catalog(),
    'friends', case when u = me then coalesce((select jsonb_agg(jsonb_build_object('id', f, 'name', public.arena_name(f))) from public.arena_friends(me) f), '[]'::jsonb) end);
end; $$;
revoke all on function public.home_status(uuid) from public, anon;
grant execute on function public.home_status(uuid) to authenticated;

create or replace function public.home_place(p_slot text, p_item text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_slot not in ('wall1', 'wall2', 'shelf1', 'shelf2', 'floor1', 'floor2') then raise exception '沒有這個位置'; end if;
  if p_item is not null and not exists (select 1 from public.dream_items where user_id = u and item = p_item) then raise exception '你還沒有這個收藏'; end if;
  insert into public.room_layout (user_id, slots) values (u, '{}'::jsonb) on conflict do nothing;
  update public.room_layout set slots = case when p_item is null then slots - p_slot else slots || jsonb_build_object(p_slot, p_item) end, updated_at = now() where user_id = u;
  return public.home_status(null);
end; $$;
revoke all on function public.home_place(text, text) from public, anon;
grant execute on function public.home_place(text, text) to authenticated;
