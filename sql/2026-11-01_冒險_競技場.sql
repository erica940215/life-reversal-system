-- =========================================================
-- 序光計畫：⚔️ 冒險：🏟️ 競技場
-- 要先跑過「2026-10-22_每週王.sql」「2026-10-19_好友.sql」。可以重複執行。
--
--   分數全部來自真實行動（不算運動）：簽到、專注、完成任務、習慣打卡 → 每天的「競技分」
--   🗡️ 每日決鬥：每天跟好友比一場，那天結束後用整天的競技分＋戰力比輸贏（沒有電腦對手）
--       贏 +3 聯賽點、30 競技幣；輸 +1 點、10 競技幣
--   🏆 每週聯賽：一週的聯賽點決定段位（青銅／白銀／黃金／鑽石／傳說），下週領獎
--   🎯 每週主題：專注週／任務週／習慣週／早起週輪流，跟好友和電腦比排名，第 1 名有獎
--   👑 每月錦標賽：每月最後 7 天，跟好友三戰兩勝（倒數第 6、4、2 天各一場），贏的拿頭像框和大獎
--   🌟 賽季（每月）：這個月最高的週段位，月底發賽季獎
--   🪙 競技商店：用競技幣換券、星願瓶、寶箱、頭像框
-- =========================================================

create table if not exists public.arena_duels (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  slot integer not null,
  opp_kind text not null,
  opp_id text not null,
  my_score numeric not null,
  opp_score numeric not null,
  win boolean not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day, slot)
);
alter table public.arena_duels enable row level security;
drop policy if exists "own select" on public.arena_duels;
create policy "own select" on public.arena_duels for select using (auth.uid() = user_id);
revoke insert, update, delete on public.arena_duels from authenticated, anon;

-- 電腦對手
create or replace function public.arena_bots()
returns jsonb language sql immutable as $$ select $json$[
  {"id":"b1","name":"晨跑的小明","emoji":"🧑‍🎓","base":40},{"id":"b2","name":"圖書館常客","emoji":"📚","base":55},
  {"id":"b3","name":"番茄鐘大師","emoji":"🍅","base":70},{"id":"b4","name":"清單女王","emoji":"📝","base":60},
  {"id":"b5","name":"夜貓子阿傑","emoji":"🦉","base":50},{"id":"b6","name":"習慣收集家","emoji":"🌱","base":45},
  {"id":"b7","name":"自律騎士","emoji":"🛡️","base":85},{"id":"b8","name":"考前衝刺生","emoji":"🔥","base":95},
  {"id":"b9","name":"慢慢來的貓","emoji":"🐈","base":30},{"id":"b10","name":"早起鳥","emoji":"🐦","base":65},
  {"id":"b11","name":"專注狂魔","emoji":"⚡","base":110},{"id":"b12","name":"傳說挑戰者","emoji":"👑","base":130}
]$json$::jsonb $$;

create or replace function public.arena_h(p text)
returns numeric language sql immutable as $$ select (abs(hashtext(p)) % 10000) / 10000.0 $$;

-- 一天的競技分（真實行動）
create or replace function public.arena_day_score(u uuid, d date)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select
    (case when exists (select 1 from public.checkins where user_id = u and checkin_date = d) then 5 else 0 end)
    + coalesce((select sum(duration_seconds) / 180.0 from public.focus_sessions where user_id = u and session_date = d and not coalesce(is_manual, false)), 0)
    + coalesce((select sum(case difficulty when 'easy' then 3 when 'hard' then 8 when 'epic' then 12 else 5 end) from public.tasks
                where user_id = u and completed and ((completed_at at time zone 'Asia/Taipei') - interval '2 hours')::date = d), 0)
    + coalesce((select count(*) * 4 from public.habit_logs where user_id = u and log_date = d and not is_makeup), 0)
$$;

create or replace function public.arena_bot_score(b jsonb, d date)
returns numeric language sql immutable as $$
  select round(((b->>'base')::numeric * (0.3 + 0.8 * public.arena_h((b->>'id') || ':' || d)))::numeric, 1)
$$;

create or replace function public.arena_power(u uuid)
returns numeric language plpgsql stable security definer set search_path to 'public' as $$
begin
  return coalesce((public.rpg_power_of(u)->>'power')::numeric, 0);
exception when others then return 0;
end; $$;

create or replace function public.arena_friends(u uuid)
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select case when user_a = u then user_b else user_a end from public.friendships where status = 'accepted' and (user_a = u or user_b = u)
$$;

create or replace function public.arena_name(u uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce((select nullif(username, '') from public.profiles where id = u), '好友')
$$;

-- 結算還沒結算的決鬥（到昨天為止，往回最多 14 天）
create or replace function public.arena_settle(u uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  d date; t date := public.app_today(); s integer; n integer := 0; bots jsonb := public.arena_bots();
  fr uuid; my numeric; op numeric; pw numeric := public.arena_power(u); b jsonb; okind text; oid text; opw numeric;
begin
  for d in select generate_series(t - 14, t - 1, interval '1 day')::date loop
    continue when exists (select 1 from public.arena_duels where user_id = u and day = d);
    my := public.arena_day_score(u, d);
    -- 那天什麼都沒做就不打（不算輸）
    continue when my <= 0;
    s := 0;
    for fr in select f from public.arena_friends(u) f loop
      s := s + 1;
      okind := 'friend'; oid := fr::text; op := public.arena_day_score(fr, d); opw := public.arena_power(fr);
      insert into public.arena_duels (user_id, day, slot, opp_kind, opp_id, my_score, opp_score, win)
        values (u, d, s, okind, oid, round(my + pw * 0.02, 1), round(op + opw * 0.02, 1), my + pw * 0.02 >= op + opw * 0.02)
        on conflict do nothing;
      perform public.grant_item(u, 'arena_coin', case when my + pw * 0.02 >= op + opw * 0.02 then 30 else 10 end, 'arena-duel:' || d || ':' || s);
      n := n + 1;
    end loop;
  end loop;
  return n;
end; $$;
revoke all on function public.arena_settle(uuid) from public, anon, authenticated;

-- 一週的聯賽點：決鬥（贏 3、輸 1）＋這週競技分每 20 分 1 點
create or replace function public.arena_week_points(u uuid, ws date)
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce((select sum(case when win then 3 else 1 end) from public.arena_duels where user_id = u and day between ws and ws + 6), 0)::int
    + floor(coalesce((select sum(public.arena_day_score(u, d::date)) from generate_series(ws, least(ws + 6, public.app_today()), interval '1 day') d), 0) / 20)::int
$$;
create or replace function public.arena_bot_week(b jsonb, ws date, upto date)
returns integer language sql immutable as $$
  select (select coalesce(sum(case when public.arena_h((b->>'id') || 'w' || d::date) < 0.15 + (b->>'base')::numeric / 300 then 3 else 1 end) * 3, 0)
          + floor(sum(public.arena_bot_score(b, d::date)) / 20)
          from generate_series(ws, least(ws + 6, upto), interval '1 day') d)::int
$$;

create or replace function public.arena_tier(p integer)
returns text language sql immutable as $$
  select case when p >= 40 then 'legend' when p >= 30 then 'diamond' when p >= 20 then 'gold' when p >= 10 then 'silver' else 'bronze' end
$$;

-- 週主題
create or replace function public.arena_theme(ws date)
returns text language sql immutable as $$
  select (array['focus', 'task', 'habit', 'early'])[1 + (extract(week from ws)::int % 4)]
$$;
create or replace function public.arena_theme_score(u uuid, th text, ws date)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select case th
    when 'focus' then coalesce((select sum(duration_seconds) / 60.0 from public.focus_sessions where user_id = u and session_date between ws and ws + 6 and not coalesce(is_manual, false)), 0)
    when 'task' then coalesce((select count(*) from public.tasks where user_id = u and completed and ((completed_at at time zone 'Asia/Taipei') - interval '2 hours')::date between ws and ws + 6), 0)
    when 'habit' then coalesce((select count(*) from public.habit_logs where user_id = u and log_date between ws and ws + 6 and not is_makeup), 0)
    else coalesce((select count(*) from public.tasks where user_id = u and completed and ((completed_at at time zone 'Asia/Taipei') - interval '2 hours')::date between ws and ws + 6
                   and extract(hour from completed_at at time zone 'Asia/Taipei') between 5 and 8), 0)
       + coalesce((select count(*) from public.focus_sessions where user_id = u and session_date between ws and ws + 6
                   and extract(hour from started_at at time zone 'Asia/Taipei') between 5 and 8), 0)
  end
$$;
create or replace function public.arena_bot_theme(b jsonb, th text, ws date)
returns numeric language sql immutable as $$
  select round((b->>'base')::numeric * (case th when 'focus' then 5 when 'task' then 0.25 when 'habit' then 0.25 else 0.08 end) * (0.5 + public.arena_h((b->>'id') || th || ws)), 0)
$$;

-- 錦標賽：每月最後 7 天，倒數第 6、4、2 天各一輪
create or replace function public.arena_cup(u uuid, mon date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  last date := (date_trunc('month', mon) + interval '1 month - 1 day')::date;
  rdays date[] := array[last - 5, last - 3, last - 1];
  bots jsonb := public.arena_bots();
  fr uuid; pending boolean := false; i integer; r integer; alive boolean := true; t date := public.app_today();
  opp jsonb; my numeric; op numeric; rounds jsonb := '[]'::jsonb; pw numeric := public.arena_power(u);
begin
  select f into fr from public.arena_friends(u) f limit 1;
  for r in 1..3 loop
    if fr is null then exit; end if;
    opp := jsonb_build_object('kind', 'friend', 'id', fr, 'name', public.arena_name(fr), 'emoji', '🧑');
    if not alive or pending then
      rounds := rounds || jsonb_build_object('round', r, 'day', rdays[r], 'opp', opp, 'state', case when pending then 'later' else 'out' end);
      continue;
    end if;
    if rdays[r] >= t then
      rounds := rounds || jsonb_build_object('round', r, 'day', rdays[r], 'opp', opp, 'state', case when rdays[r] = t then 'today' else 'later' end,
        'my', case when rdays[r] = t then round(public.arena_day_score(u, t) + pw * 0.02, 1) end);
      pending := true; continue;
    end if;
    my := public.arena_day_score(u, rdays[r]) + pw * 0.02;
    op := case when opp->>'kind' = 'friend' then public.arena_day_score(fr, rdays[r]) + public.arena_power(fr) * 0.02
               else public.arena_bot_score((select e from jsonb_array_elements(bots) e where e->>'id' = opp->>'id'), rdays[r]) * (1 + 0.15 * r) + pw * 0.02 end;
    rounds := rounds || jsonb_build_object('round', r, 'day', rdays[r], 'opp', opp, 'my', round(my, 1), 'op', round(op, 1), 'state', case when my >= op then 'win' else 'lose' end);
  end loop;
  return jsonb_build_object('start', last - 6, 'end', last, 'rounds', rounds,
    'champion', (select count(*) from jsonb_array_elements(rounds) x where x->>'state' = 'win') >= 2);
end; $$;
revoke all on function public.arena_cup(uuid, date) from public, anon, authenticated;

-- 領獎（上週聯賽、上週主題、上個月錦標賽、上個月賽季），每項只領一次
create or replace function public.arena_rewards(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  t date := public.app_today(); ws date := t - (extract(isodow from t)::int - 1); pws date := ws - 7;
  p integer; tier text; got jsonb := '[]'::jsonb; g jsonb; k text; v integer; rank integer; th text; my numeric;
  pm date := (date_trunc('month', t) - interval '1 month')::date; cup jsonb; best text;
  R jsonb := '{"bronze":{"arena_coin":30},"silver":{"arena_coin":60,"ticket_normal":1},"gold":{"arena_coin":100,"ticket_special":1,"wish_rare":1},
               "diamond":{"arena_coin":150,"ticket_limited":1,"wish_limited":1},"legend":{"arena_coin":250,"ticket_limited":1,"wish_limited":2,"chest_star":1}}'::jsonb;
  TN jsonb := '{"bronze":"青銅","silver":"白銀","gold":"黃金","diamond":"鑽石","legend":"傳說"}'::jsonb;
begin
  -- 🏆 上週聯賽
  p := public.arena_week_points(u, pws);
  if p > 0 then
    tier := public.arena_tier(p);
    for k, v in select key, value::int from jsonb_each_text(R->tier) loop
      if public.grant_item(u, k, v, 'arena-league:' || pws || ':' || k) and k = 'arena_coin' then
        got := got || jsonb_build_object('why', '上週聯賽' || (TN->>tier) || '段', 'reward', R->tier);
      end if;
    end loop;
  end if;
  -- 🎯 上週主題
  th := public.arena_theme(pws);
  my := public.arena_theme_score(u, th, pws);
  if my > 0 then
    select 1 + count(*) into rank from (
      select public.arena_theme_score(f, th, pws) s from public.arena_friends(u) f) x where x.s > my;
    if rank = 1 and exists (select 1 from public.arena_friends(u)) then
      g := case rank when 1 then '{"arena_coin":80,"chest_gold":1}' when 2 then '{"arena_coin":50,"gacha_coin":2}' else '{"arena_coin":30,"gacha_coin":1}' end::jsonb;
      if public.grant_item(u, 'arena_coin', (g->>'arena_coin')::int, 'arena-theme:' || pws) then
        for k, v in select key, value::int from jsonb_each_text(g - 'arena_coin') loop perform public.grant_item(u, k, v, 'arena-theme:' || pws || ':' || k); end loop;
        got := got || jsonb_build_object('why', '上週主題挑戰第 ' || rank || ' 名', 'reward', g);
      end if;
    end if;
  end if;
  -- 👑 上個月錦標賽
  cup := public.arena_cup(u, pm);
  if (cup->>'champion')::boolean and public.grant_item(u, 'arena_coin', 300, 'arena-cup:' || pm) then
    perform public.grant_item(u, 'chest_star', 1, 'arena-cup-chest:' || pm);
    perform public.grant_item(u, 'ticket_limited', 2, 'arena-cup-ticket:' || pm);
    begin perform public.fun_frame_grant(u, 'frame_arena'); exception when others then null; end;
    got := got || jsonb_build_object('why', '錦標賽冠軍！', 'reward', '{"arena_coin":300,"chest_star":1,"ticket_limited":2,"frame":"競技冠軍框"}'::jsonb);
  end if;
  -- 🌟 上個月賽季：當月最高的週段位
  select case when max(public.arena_week_points(u, w::date)) > 0 then public.arena_tier(max(public.arena_week_points(u, w::date))) end into best
    from generate_series(pm - (extract(isodow from pm)::int - 1), (date_trunc('month', t) - interval '1 day')::date, interval '7 days') w;
  if best is not null and public.arena_week_points(u, pws) is not null
     and public.grant_item(u, 'arena_coin', case best when 'legend' then 200 when 'diamond' then 120 when 'gold' then 80 when 'silver' then 40 else 20 end, 'arena-season:' || pm) then
    got := got || jsonb_build_object('why', to_char(pm, 'FMMM') || ' 月賽季：最高' || (TN->>best) || '段', 'reward', '{}'::jsonb);
  end if;
  return got;
end; $$;
revoke all on function public.arena_rewards(uuid) from public, anon, authenticated;

create or replace function public.arena_shop()
returns jsonb language sql immutable as $$ select $json$[
  {"item":"ticket_normal","name":"普通召喚券","emoji":"🎫","price":60,"limit":3},
  {"item":"ticket_special","name":"特殊召喚券","emoji":"🎟️","price":150,"limit":2},
  {"item":"ticket_limited","name":"限定召喚券","emoji":"🌟","price":300,"limit":1},
  {"item":"wish_limited","name":"限定星願瓶","emoji":"🌠","price":200,"limit":2},
  {"item":"gacha_coin","name":"扭蛋幣","emoji":"🪙","price":30,"limit":5},
  {"item":"chest_star","name":"星光寶箱","emoji":"✨","price":250,"limit":1},
  {"item":"frame_arena","name":"競技冠軍框","emoji":"🏟️","price":800,"limit":1,"kind":"frame"}
]$json$::jsonb $$;
grant execute on function public.arena_shop() to authenticated;

create or replace function public.arena_status()
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  u uuid := auth.uid(); t date := public.app_today(); ws date := t - (extract(isodow from t)::int - 1);
  bots jsonb := public.arena_bots(); th text := public.arena_theme(ws); fr uuid; rewards jsonb; pw numeric;
  board jsonb; tboard jsonb; today jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.arena_settle(u);
  perform public.arena_settle(f) from public.arena_friends(u) f;
  rewards := public.arena_rewards(u);
  pw := public.arena_power(u);
  -- 今天的對手：好友
  select jsonb_agg(jsonb_build_object('slot', 1, 'kind', 'friend', 'name', public.arena_name(f), 'emoji', '🧑', 'score', round(public.arena_day_score(f, t), 1))) into today
    from public.arena_friends(u) f;
  -- 聯賽排行：你、好友、8 個電腦
  select jsonb_agg(x order by (x->>'p')::int desc) into board from (
    select jsonb_build_object('name', '你', 'emoji', '⭐', 'me', true, 'p', public.arena_week_points(u, ws)) x
    union all select jsonb_build_object('name', public.arena_name(f), 'emoji', '🧑', 'p', public.arena_week_points(f, ws)) from public.arena_friends(u) f) z;
  select jsonb_agg(x order by (x->>'s')::numeric desc) into tboard from (
    select jsonb_build_object('name', '你', 'emoji', '⭐', 'me', true, 's', round(public.arena_theme_score(u, th, ws), 0)) x
    union all select jsonb_build_object('name', public.arena_name(f), 'emoji', '🧑', 's', round(public.arena_theme_score(f, th, ws), 0)) from public.arena_friends(u) f) z;
  return json_build_object(
    'today', t, 'week_start', ws, 'power', pw,
    'score_today', round(public.arena_day_score(u, t), 1),
    'opponents', today,
    'recent', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'slot', d.slot, 'kind', d.opp_kind,
        'name', case when d.opp_kind = 'friend' then public.arena_name(d.opp_id::uuid) else (select b->>'name' from jsonb_array_elements(bots) b where b->>'id' = d.opp_id) end,
        'emoji', case when d.opp_kind = 'friend' then '🧑' else (select b->>'emoji' from jsonb_array_elements(bots) b where b->>'id' = d.opp_id) end,
        'my', d.my_score, 'op', d.opp_score, 'win', d.win) order by d.day desc, d.slot)
        from (select * from public.arena_duels where user_id = u order by day desc, slot limit 12) d), '[]'::jsonb),
    'record', (select jsonb_build_object('win', count(*) filter (where win), 'lose', count(*) filter (where not win)) from public.arena_duels where user_id = u),
    'week_points', public.arena_week_points(u, ws), 'tier', public.arena_tier(public.arena_week_points(u, ws)),
    'board', board, 'theme', th, 'theme_board', tboard,
    'cup', public.arena_cup(u, t),
    'coins', coalesce((select qty from public.player_items where user_id = u and item_key = 'arena_coin'), 0),
    'shop', public.arena_shop(),
    'bought', coalesce((select jsonb_object_agg(item, n) from (select split_part(source_key, ':', 2) item, count(*) n from public.item_events
        where user_id = u and source_key like 'arena-buy:%' and delta < 0 and created_at >= date_trunc('month', now()) group by 1) x), '{}'::jsonb),
    'rewards', rewards);
end; $$;
revoke all on function public.arena_status() from public, anon;
grant execute on function public.arena_status() to authenticated;

-- 競技商店（每個月重置購買上限）
create or replace function public.arena_buy(p_item text)
returns json language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); o jsonb; n integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  select x into o from jsonb_array_elements(public.arena_shop()) x where x->>'item' = p_item;
  if o is null then raise exception '沒有這個東西'; end if;
  select count(*) into n from public.item_events where user_id = u and source_key like 'arena-buy:' || p_item || ':%' and delta < 0 and created_at >= date_trunc('month', now());
  if n >= (o->>'limit')::int then raise exception '這個月已經換到上限了'; end if;
  perform public.fun_take(u, 'arena_coin', (o->>'price')::int, 'arena-buy:' || p_item || ':' || gen_random_uuid());
  if o->>'kind' = 'frame' then perform public.fun_frame_grant(u, p_item);
  else perform public.grant_item(u, p_item, 1, 'arena-get:' || gen_random_uuid()); end if;
  return json_build_object('success', true);
end; $$;
revoke all on function public.arena_buy(text) from public, anon;
grant execute on function public.arena_buy(text) to authenticated;
