-- =========================================================
-- 序光計畫：🌱 生活打卡：🏅 徽章 ＋ 🟩 熱力圖
-- 要先跑過「2026-11-02_生活打卡.sql」。可以重複執行。
--
--   🏅 連續全勤徽章（每個每日領域）：3／7／14／30／60／100 天
--      每週領域：連續 2／4／8／12／26／52 週
--   🏅 等級徽章：Lv 5／10／20／30／50
--   🏅 五領域連續全勤：3／7／14／30 天
--   第一次拿到發星屑；30 天起加送限定星願瓶，100 天再加星光寶箱
--   🟩 熱力圖：最近 28 天每個領域完成幾 %（每週領域看最近 8 週）
-- =========================================================

create table if not exists public.life_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge text not null,
  got_at timestamptz not null default now(),
  primary key (user_id, badge)
);
alter table public.life_badges enable row level security;
drop policy if exists "own select" on public.life_badges;
create policy "own select" on public.life_badges for select using (auth.uid() = user_id);
revoke insert, update, delete on public.life_badges from authenticated, anon;

-- 那天（每週領域：那一週）完成幾 %
create or replace function public.life_pct(u uuid, dom text, d date)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select case when count(ps.id) = 0 then null else round(count(ps.id) filter (where l.done) * 100.0 / count(ps.id)) end
    from public.projects pr
    join public.project_steps ps on ps.project_id = pr.id
      and ((ps.created_at at time zone 'Asia/Taipei') - interval '6 hours')::date <= case when dom = 'weekly' then public.life_week(d) + 6 else d end
    left join public.project_step_logs l on l.step_id = ps.id and l.day = case when dom = 'weekly' then public.life_week(d) else d end
   where pr.user_id = u and pr.domain = dom and pr.status = 'active'
$$;
revoke all on function public.life_pct(uuid, text, date) from public, anon, authenticated;

-- 目前連續幾天（每週領域：幾週）全勤；今天還沒勾完不算斷
create or replace function public.life_streak(u uuid, dom text)
returns integer language plpgsql stable security definer set search_path to 'public' as $$
declare t date := public.app_today(); d date; n integer := 0; step integer := case when dom = 'weekly' then 7 else 1 end;
begin
  d := case when dom = 'weekly' then public.life_week(t) else t end;
  if not (case when dom = 'all' then public.life_all_clear(u, d) else public.life_clear(u, dom, d) end) then d := d - step; end if;
  while n < 400 and (case when dom = 'all' then public.life_all_clear(u, d) else public.life_clear(u, dom, d) end) loop
    n := n + 1; d := d - step;
  end loop;
  return n;
end; $$;
revoke all on function public.life_streak(uuid, text) from public, anon, authenticated;

create or replace function public.life_badge_defs()
returns jsonb language sql immutable as $$ select $j${
  "doms": {"sleep":"🛏️ 作息","care":"🧴 清潔保養","health":"💧 健康","food":"🍱 飲食","life":"🧹 生活","weekly":"📅 每週","all":"🌟 五領域"},
  "streak": [3, 7, 14, 30, 60, 100],
  "weekly": [2, 4, 8, 12, 26, 52],
  "all": [3, 7, 14, 30],
  "level": [5, 10, 20, 30, 50],
  "names": {"3":"起步","7":"一週不斷","14":"兩週達人","30":"一個月傳說","60":"兩個月鋼鐵","100":"百日神話",
            "2":"兩週","4":"一個月","8":"兩個月","12":"一季","26":"半年","52":"一整年"}
}$j$::jsonb $$;

-- 發新徽章（每個只發一次），回傳這次新拿到的
create or replace function public.life_badge_check(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  defs jsonb := public.life_badge_defs(); dom text; s integer; lv integer; x integer; key text; got jsonb := '[]'::jsonb; dust integer;
begin
  foreach dom in array array['sleep', 'care', 'health', 'food', 'life', 'weekly', 'all'] loop
    continue when dom <> 'all' and not exists (select 1 from public.projects where user_id = u and domain = dom and status = 'active');
    s := public.life_streak(u, dom);
    for x in select value::int from jsonb_array_elements_text(defs->(case dom when 'weekly' then 'weekly' when 'all' then 'all' else 'streak' end)) loop
      exit when s < x;
      key := dom || ':s' || x;
      insert into public.life_badges (user_id, badge) values (u, key) on conflict do nothing;
      if found then
        dust := case when dom = 'weekly' then 40 * x else 15 * x end + case when dom = 'all' then 15 * x else 0 end;
        perform public.grant_item(u, 'stardust', dust, 'life-badge:' || key);
        if (dom = 'weekly' and x >= 12) or (dom <> 'weekly' and x >= 30) then perform public.grant_item(u, 'wish_limited', 1, 'life-badge-w:' || key); end if;
        if (dom = 'weekly' and x >= 52) or (dom <> 'weekly' and x >= 100) then perform public.grant_item(u, 'chest_star', 1, 'life-badge-c:' || key); end if;
        got := got || jsonb_build_object('badge', key, 'stardust', dust);
      end if;
    end loop;
    continue when dom = 'all';
    lv := public.life_level(u, dom);
    for x in select value::int from jsonb_array_elements_text(defs->'level') loop
      exit when lv < x;
      key := dom || ':lv' || x;
      insert into public.life_badges (user_id, badge) values (u, key) on conflict do nothing;
      if found then
        perform public.grant_item(u, 'stardust', 20 * x, 'life-badge:' || key);
        got := got || jsonb_build_object('badge', key, 'stardust', 20 * x);
      end if;
    end loop;
  end loop;
  return got;
end; $$;
revoke all on function public.life_badge_check(uuid) from public, anon, authenticated;

-- life_status 多帶：連續天數、徽章、熱力圖
do $$ begin
  if to_regprocedure('public.life_status_base()') is null then alter function public.life_status() rename to life_status_base; end if;
end $$;
revoke all on function public.life_status_base() from public, anon, authenticated;

create or replace function public.life_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  u uuid := auth.uid(); t date := public.app_today(); b jsonb := public.life_status_base()::jsonb;
  newb jsonb; streaks jsonb := '{}'::jsonb; heat jsonb := '{}'::jsonb; dom text;
begin
  newb := public.life_badge_check(u);
  foreach dom in array array['sleep', 'care', 'health', 'food', 'life', 'weekly', 'all'] loop
    streaks := streaks || jsonb_build_object(dom, public.life_streak(u, dom));
    continue when dom = 'all';
    heat := heat || jsonb_build_object(dom, (
      select jsonb_agg(jsonb_build_object('d', d, 'p', public.life_pct(u, dom, d)) order by d)
        from (select case when dom = 'weekly' then public.life_week(t) - 7 * g else t - g end d from generate_series(case when dom = 'weekly' then 7 else 27 end, 0, -1) g) x));
  end loop;
  return (b || jsonb_build_object(
    'streaks', streaks, 'heat', heat, 'new_badges', newb, 'badge_defs', public.life_badge_defs(),
    'badges', coalesce((select jsonb_agg(jsonb_build_object('badge', badge, 'at', got_at) order by got_at) from public.life_badges where user_id = u), '[]'::jsonb)))::json;
end; $$;
revoke all on function public.life_status() from public, anon;
grant execute on function public.life_status() to authenticated;
