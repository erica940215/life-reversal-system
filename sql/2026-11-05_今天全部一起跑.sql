-- 序光計畫：2026-11-05 新功能，一次跑完（內容就是下面 5 個檔案照順序接起來）

-- ================= sql/2026-11-05_生活打卡_徽章熱力圖.sql =================
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

-- ================= sql/2026-11-05_競技商店擴充.sql =================
-- =========================================================
-- 序光計畫：🪙 競技商店擴充：稱號、頭像框、競技限定裝備
-- 要先跑過「2026-11-01_冒險_競技場.sql」「2026-10-23_成長系統.sql」「2026-10-22_驚喜.sql」。可以重複執行。
--
--   稱號（永久，買一次）：⚔️ 競技場常客 300、🔥 宿敵 500、🏆 競技傳說 1200
--   頭像框（永久）：🌿 月桂框 600、🔥 烈焰框 900、🏟️ 競技冠軍框 800（原本就有）
--   競技限定裝備（買到重複會升級，最多 +5，每月各 1 件）：
--     🗡️ 鬥士之劍 700、🛡️ 冠軍鎧甲 700、🏅 榮耀勳章 1500
--   原本的券、星願瓶、寶箱照舊（每月重置數量）
-- =========================================================

-- 稱號：加進稱號圖鑑
do $$ begin
  if to_regprocedure('public.title_catalog_arena()') is null then alter function public.title_catalog() rename to title_catalog_arena; end if;
end $$;
create or replace function public.title_catalog()
returns jsonb language sql immutable as $$
  select public.title_catalog_arena() || '[
    {"key":"arena_regular", "name":"競技場常客", "emoji":"⚔️", "how":"競技商店 300 競技幣"},
    {"key":"arena_rival",   "name":"宿敵",       "emoji":"🔥", "how":"競技商店 500 競技幣"},
    {"key":"arena_legend",  "name":"競技傳說",   "emoji":"🏆", "how":"競技商店 1200 競技幣"}
  ]'::jsonb
$$;

-- 裝備：加進裝備圖鑑（競技限定）
do $$ begin
  if to_regprocedure('public.rpg_catalog_arena()') is null then alter function public.rpg_catalog() rename to rpg_catalog_arena; end if;
end $$;
create or replace function public.rpg_catalog()
returns jsonb language sql immutable as $$
  select c || jsonb_build_object(
      'gear', (c->'gear') || $j${
        "arena_sword": {"name":"鬥士之劍","slot":"weapon","tier":"x","pool":"arena","emoji":"🗡️","stat":{"str":16,"vit":8}},
        "arena_armor": {"name":"冠軍鎧甲","slot":"armor","tier":"x","pool":"arena","emoji":"🛡️","stat":{"vit":16,"wil":8}},
        "arena_medal": {"name":"榮耀勳章","slot":"accessory","tier":"s","pool":"arena","emoji":"🏅","stat":{"str":15,"int":15,"vit":15,"wil":15}}
      }$j$::jsonb)
  from (select public.rpg_catalog_arena() c) b
$$;
grant execute on function public.rpg_catalog() to authenticated;

create or replace function public.arena_shop()
returns jsonb language sql immutable as $$ select $json$[
  {"item":"ticket_normal","name":"普通召喚券","emoji":"🎫","price":60,"limit":3},
  {"item":"ticket_special","name":"特殊召喚券","emoji":"🎟️","price":150,"limit":2},
  {"item":"ticket_limited","name":"限定召喚券","emoji":"🌟","price":300,"limit":1},
  {"item":"wish_limited","name":"限定星願瓶","emoji":"🌠","price":200,"limit":2},
  {"item":"gacha_coin","name":"扭蛋幣","emoji":"🪙","price":30,"limit":5},
  {"item":"chest_star","name":"星光寶箱","emoji":"✨","price":250,"limit":1},
  {"item":"arena_regular","name":"稱號：競技場常客","emoji":"⚔️","price":300,"limit":1,"kind":"title","sec":"look"},
  {"item":"arena_rival","name":"稱號：宿敵","emoji":"🔥","price":500,"limit":1,"kind":"title","sec":"look"},
  {"item":"arena_legend","name":"稱號：競技傳說","emoji":"🏆","price":1200,"limit":1,"kind":"title","sec":"look"},
  {"item":"frame_laurel","name":"月桂框","emoji":"🌿","price":600,"limit":1,"kind":"frame","sec":"look"},
  {"item":"frame_flame","name":"烈焰框","emoji":"🔥","price":900,"limit":1,"kind":"frame","sec":"look"},
  {"item":"frame_arena","name":"競技冠軍框","emoji":"🏟️","price":800,"limit":1,"kind":"frame","sec":"look"},
  {"item":"arena_sword","name":"鬥士之劍（武器）","emoji":"🗡️","price":700,"limit":1,"kind":"gear","sec":"gear"},
  {"item":"arena_armor","name":"冠軍鎧甲（防具）","emoji":"🛡️","price":700,"limit":1,"kind":"gear","sec":"gear"},
  {"item":"arena_medal","name":"榮耀勳章（飾品）","emoji":"🏅","price":1500,"limit":1,"kind":"gear","sec":"gear"}
]$json$::jsonb $$;
grant execute on function public.arena_shop() to authenticated;

-- 有沒有已經擁有（稱號、頭像框買過就不能再買；裝備滿 +5 就不能再買）
create or replace function public.arena_owned(u uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce((select jsonb_object_agg(title, true) from public.user_titles where user_id = u and title like 'arena_%'), '{}'::jsonb)
      || coalesce((select jsonb_object_agg(frame_key, true) from public.fun_frames where user_id = u and frame_key in ('frame_laurel', 'frame_flame', 'frame_arena')), '{}'::jsonb)
      || coalesce((select jsonb_object_agg(gear_key, level) from public.rpg_gear where user_id = u and gear_key like 'arena_%'), '{}'::jsonb)
$$;
revoke all on function public.arena_owned(uuid) from public, anon, authenticated;

create or replace function public.arena_buy(p_item text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); o jsonb; n integer; lv integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  select x into o from jsonb_array_elements(public.arena_shop()) x where x->>'item' = p_item;
  if o is null then raise exception '沒有這個東西'; end if;
  if o->>'kind' = 'title' and exists (select 1 from public.user_titles where user_id = u and title = p_item) then raise exception '已經有這個稱號了'; end if;
  if o->>'kind' = 'frame' and exists (select 1 from public.fun_frames where user_id = u and frame_key = p_item) then raise exception '已經有這個頭像框了'; end if;
  if o->>'kind' = 'gear' then
    select level into lv from public.rpg_gear where user_id = u and gear_key = p_item;
    if lv >= 5 then raise exception '這件已經 +5 滿了'; end if;
  end if;
  select count(*) into n from public.item_events where user_id = u and source_key like 'arena-buy:' || p_item || ':%' and delta < 0 and created_at >= date_trunc('month', now());
  if n >= (o->>'limit')::int then raise exception '這個月已經換到上限了'; end if;
  perform public.fun_take(u, 'arena_coin', (o->>'price')::int, 'arena-buy:' || p_item || ':' || gen_random_uuid());
  if o->>'kind' = 'frame' then perform public.fun_frame_grant(u, p_item);
  elsif o->>'kind' = 'title' then insert into public.user_titles (user_id, title) values (u, p_item) on conflict do nothing;
  elsif o->>'kind' = 'gear' then
    if lv is null then insert into public.rpg_gear (user_id, gear_key) values (u, p_item);
    else update public.rpg_gear set level = level + 1 where user_id = u and gear_key = p_item; end if;
  else perform public.grant_item(u, p_item, 1, 'arena-get:' || gen_random_uuid()); end if;
  return json_build_object('success', true, 'kind', o->>'kind');
end; $$;
revoke all on function public.arena_buy(text) from public, anon;
grant execute on function public.arena_buy(text) to authenticated;

-- 狀態多帶「已擁有」
do $$ begin
  if to_regprocedure('public.arena_status_shop()') is null then alter function public.arena_status() rename to arena_status_shop; end if;
end $$;
revoke all on function public.arena_status_shop() from public, anon, authenticated;
create or replace function public.arena_status()
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  return (public.arena_status_shop()::jsonb || jsonb_build_object('owned', public.arena_owned(auth.uid())))::json;
end; $$;
revoke all on function public.arena_status() from public, anon;
grant execute on function public.arena_status() to authenticated;

-- ================= sql/2026-11-05_兩人共同目標.sql =================
-- =========================================================
-- 序光計畫：🤝 兩人共同目標（每週，跟每個好友各一組）
-- 要先跑過「2026-11-05_競技商店擴充.sql」。可以重複執行。
--
--   這週（週一～週日）兩個人的專注時間加起來（不算補記）：
--     🥉 20 小時：競技幣 60＋星屑 100
--     🥈 40 小時：競技幣 100＋限定星願瓶 1
--     🥇 60 小時：限定召喚券 1＋星光寶箱 1
--   兩個人都拿得到（各自打開競技場時領）；上週沒領到的，這週打開也會補發
-- =========================================================

create table if not exists public.coop_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  claim text not null,
  at timestamptz not null default now(),
  primary key (user_id, claim)
);
alter table public.coop_claims enable row level security;
revoke all on public.coop_claims from anon, authenticated;

create or replace function public.coop_tiers()
returns jsonb language sql immutable as $$ select $j$[
  {"h":20,"name":"🥉 銅","reward":{"arena_coin":60,"stardust":100}},
  {"h":40,"name":"🥈 銀","reward":{"arena_coin":100,"wish_limited":1}},
  {"h":60,"name":"🥇 金","reward":{"ticket_limited":1,"chest_star":1}}
]$j$::jsonb $$;

create or replace function public.coop_hours(u uuid, ws date)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select round(coalesce(sum(duration_seconds), 0) / 3600.0, 1) from public.focus_sessions
   where user_id = u and session_date between ws and ws + 6 and not coalesce(is_manual, false)
$$;
revoke all on function public.coop_hours(uuid, date) from public, anon, authenticated;

create or replace function public.coop_week(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  t date := public.app_today(); ws date := public.life_week(t); w date; f uuid; tier jsonb; k text; v integer;
  out jsonb := '[]'::jsonb; got jsonb := '[]'::jsonb; me numeric; them numeric; tot numeric;
begin
  for f in select * from public.arena_friends(u) loop
    -- 上週、這週達標就發（每個人自己領自己的）
    foreach w in array array[ws - 7, ws] loop
      tot := public.coop_hours(u, w) + public.coop_hours(f, w);
      for tier in select * from jsonb_array_elements(public.coop_tiers()) loop
        exit when tot < (tier->>'h')::numeric;
        insert into public.coop_claims (user_id, claim) values (u, f || ':' || w || ':' || (tier->>'h')) on conflict do nothing;
        if found then
          for k, v in select key, value::int from jsonb_each_text(tier->'reward') loop
            perform public.grant_item(u, k, v, 'coop:' || f || ':' || w || ':' || (tier->>'h') || ':' || k);
          end loop;
          got := got || jsonb_build_object('why', '🤝 和 ' || public.arena_name(f) || ' 一起專注 ' || (tier->>'h') || ' 小時', 'reward', tier->'reward');
        end if;
      end loop;
    end loop;
    me := public.coop_hours(u, ws); them := public.coop_hours(f, ws);
    out := out || jsonb_build_object('friend', public.arena_name(f), 'me', me, 'them', them, 'total', me + them,
      'days_left', ws + 6 - t + 1,
      'daily', (select jsonb_agg(jsonb_build_object('d', d::date,
                  'me', round(coalesce((select sum(duration_seconds) from public.focus_sessions where user_id = u and session_date = d::date and not coalesce(is_manual, false)), 0) / 3600.0, 1),
                  'them', round(coalesce((select sum(duration_seconds) from public.focus_sessions where user_id = f and session_date = d::date and not coalesce(is_manual, false)), 0) / 3600.0, 1)) order by d)
                from generate_series(ws, ws + 6, interval '1 day') d));
  end loop;
  return jsonb_build_object('week', ws, 'tiers', public.coop_tiers(), 'pairs', out, 'got', got);
end; $$;
revoke all on function public.coop_week(uuid) from public, anon, authenticated;

create or replace function public.arena_status()
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  return (public.arena_status_shop()::jsonb || jsonb_build_object('owned', public.arena_owned(auth.uid()), 'coop', public.coop_week(auth.uid())))::json;
end; $$;
revoke all on function public.arena_status() from public, anon;
grant execute on function public.arena_status() to authenticated;

-- ================= sql/2026-11-05_月報.sql =================
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

-- ================= sql/2026-11-05_星露島擴建.sql =================
-- =========================================================
-- 序光計畫：🏝️ 星露島擴建：等級上限 99、碼頭市場、島嶼評分週獎、Lv 51 以上的等級星願瓶
-- 要先跑過「2026-10-16_星露島.sql」。可以重複執行。
-- =========================================================

-- 存檔：等級上限 70 → 99
do $$ declare d text; begin
  d := pg_get_functiondef('public.farm_save(jsonb, integer)'::regprocedure);
  if position('v_lv > 70' in d) > 0 then execute replace(d, 'v_lv > 70', 'v_lv > 99'); end if;
end $$;

-- 等級星願瓶：Lv 50 以後每 5 級稀有 1、每 10 級限定 1、Lv 99 限定 2
create or replace function public.farm_claim_levels()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_lv integer; v_items jsonb := '[]'::jsonb; v_key text; v_qty integer; l integer;
begin
  if v_user is null then raise exception '尚未登入'; end if;
  select least(coalesce((state->>'lv')::integer, 1), 99) into v_lv from public.farm_saves where user_id = v_user;
  if not found or v_lv < 5 then return v_items; end if;
  for l in select generate_series(5, v_lv, 5) union all select 99 where v_lv >= 99 loop
    if l = 99 then v_key := 'wish_limited'; v_qty := 2;
    elsif l = 50 then v_key := 'wish_rare'; v_qty := 3;
    elsif l > 50 and l % 10 = 0 then v_key := 'wish_limited'; v_qty := 1;
    elsif l > 50 then v_key := 'wish_rare'; v_qty := 1;
    elsif l % 10 = 0 then v_key := 'wish_rare'; v_qty := 1;
    else v_key := 'wish_normal'; v_qty := 1; end if;
    if public.grant_item(v_user, v_key, v_qty, 'farm-lv:' || l) then
      v_items := v_items || jsonb_build_object('key', v_key, 'qty', v_qty, 'lv', l);
    end if;
  end loop;
  return v_items;
end; $$;
revoke all on function public.farm_claim_levels() from public, anon;
grant execute on function public.farm_claim_levels() to authenticated;

-- ⚓ 碼頭市場：用星露（網頁端先扣）換道具，每樣每天 1 個，要 Lv 80
create or replace function public.farm_dock_buy(p_item text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); lv integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_item not in ('wish_normal', 'gacha_coin', 'scratch_card', 'wish_rare', 'ticket_normal', 'chest_gold', 'ticket_special', 'wish_limited') then
    raise exception '碼頭沒有賣這個';
  end if;
  select (state->>'lv')::int into lv from public.farm_saves where user_id = u;
  if coalesce(lv, 0) < 80 then raise exception '島嶼 Lv 80 才開碼頭市場'; end if;
  if not public.grant_item(u, p_item, 1, 'farm-dock:' || public.app_today() || ':' || p_item) then
    return json_build_object('ok', false, 'msg', '這個今天已經買過了');
  end if;
  return json_build_object('ok', true);
end; $$;
revoke all on function public.farm_dock_buy(text) from public, anon;
grant execute on function public.farm_dock_buy(text) to authenticated;

-- 🏝️ 島嶼評分：每週依評分發一次（拿這週最高的那一級；升級了可以補領差額）
create or replace function public.farm_score_tiers()
returns jsonb language sql immutable as $$ select $j$[
  {"min":500, "g":"C", "reward":{"stardust":100}},
  {"min":1000,"g":"B", "reward":{"wish_rare":1}},
  {"min":2000,"g":"A", "reward":{"wish_rare":2,"gacha_coin":2}},
  {"min":3500,"g":"S", "reward":{"wish_limited":1,"chest_star":1}},
  {"min":6000,"g":"SS","reward":{"wish_limited":2,"ticket_limited":1}}
]$j$::jsonb $$;
grant execute on function public.farm_score_tiers() to authenticated;

create or replace function public.farm_score_claim(p_score integer)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); t date := public.app_today(); ws date := t - (extract(isodow from t)::int - 1); x jsonb; k text; v integer; got jsonb := '[]'::jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  for x in select * from jsonb_array_elements(public.farm_score_tiers()) loop
    exit when p_score < (x->>'min')::int;
    for k, v in select key, value::int from jsonb_each_text(x->'reward') loop
      if public.grant_item(u, k, v, 'farm-score:' || ws || ':' || (x->>'g') || ':' || k) then
        got := got || jsonb_build_object('g', x->>'g', 'item', k, 'qty', v);
      end if;
    end loop;
  end loop;
  return json_build_object('week', ws, 'got', got,
    'claimed', (select coalesce(jsonb_agg(distinct split_part(source_key, ':', 3)), '[]'::jsonb) from public.item_events where user_id = u and source_key like 'farm-score:' || ws || ':%'));
end; $$;
revoke all on function public.farm_score_claim(integer) from public, anon;
grant execute on function public.farm_score_claim(integer) to authenticated;
