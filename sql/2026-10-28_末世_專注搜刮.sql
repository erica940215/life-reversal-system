-- =========================================================
-- 序光計畫：☢️ 末世：專注搜刮
-- 要先執行「2026-10-28_末世.sql」。可以重複執行。
--
--   專注前選一個區域，專注時每 5～10 分鐘撿到一樣東西（計時器旁顯示「已搜刮 n 樣」），
--   結束時一次開箱。越久後面撿到的越好；照計畫完成有「平安歸來」寶箱。
--   原本「專注每 30 分鐘 +2 零件、每小時 +1 搜刮券」拿掉，改由這裡發。
--
--   doom_zones()                         區域清單（前端用）
--   doom_run_claim(session, zone, drops) 專注結束後開箱（同一段專注只會開一次）
--   沒有選區域的專注，進末世頁時會自動在「街頭」開箱
-- =========================================================

create table if not exists public.doom_runs (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id bigint not null,
  zone text not null,
  minutes integer not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, session_id)
);
alter table public.doom_runs enable row level security;
drop policy if exists doom_runs_own on public.doom_runs;
create policy doom_runs_own on public.doom_runs for select using (user_id = auth.uid());


-- ---------- 🗺️ 區域 ----------
create or replace function public.doom_zones()
returns jsonb language sql immutable
as $zones$
select $j${
"zones": [
  {"id":"street","name":"街頭","emoji":"🏙️","desc":"什麼都可能撿到，最平均。","chapter":1,"min_min":0,"luck":0,"danger":0.03,"items":[]},
  {"id":"market","name":"超市","emoji":"🏪","desc":"食物最多。","chapter":1,"min_min":0,"luck":0,"danger":0.02,"items":[
    {"id":"z_rice","tier":"c","name":"一袋米","emoji":"🍚","gain":{"food":3}},
    {"id":"z_snack","tier":"c","name":"零食","emoji":"🍿","gain":{"food":2,"morale":2}},
    {"id":"z_dumpling","tier":"c","name":"冷凍水餃","emoji":"🥟","gain":{"food":4}},
    {"id":"z_cart","tier":"r","name":"一整車貨","emoji":"🛒","gain":{"food":6,"water":3}},
    {"id":"z_coffee","tier":"r","name":"咖啡豆","emoji":"☕","gain":{"morale":8,"food":1}},
    {"id":"z_storeroom","tier":"l","name":"超市倉庫","emoji":"📦","gain":{"food":12,"water":6,"scav":1}}]},
  {"id":"waterworks","name":"水廠","emoji":"🚰","desc":"水最多。","chapter":1,"min_min":0,"luck":0,"danger":0.02,"items":[
    {"id":"w_jug","tier":"c","name":"水壺","emoji":"🫗","gain":{"water":3}},
    {"id":"w_filter","tier":"c","name":"濾芯","emoji":"🧽","gain":{"water":2,"parts":1}},
    {"id":"w_bottles","tier":"c","name":"一箱瓶裝水","emoji":"🍶","gain":{"water":4}},
    {"id":"w_tank","tier":"r","name":"儲水桶","emoji":"🛢️","gain":{"water":8}},
    {"id":"w_pump","tier":"r","name":"手搖幫浦","emoji":"⛽","gain":{"water":4,"parts":4}},
    {"id":"w_reservoir","tier":"l","name":"地下蓄水池","emoji":"🌊","gain":{"water":15,"scav":1}}]},
  {"id":"hardware","name":"五金行","emoji":"🔧","desc":"零件最多，蓋設施就靠這裡。","chapter":1,"min_min":0,"luck":0,"danger":0.03,"items":[
    {"id":"h_nails","tier":"c","name":"一盒釘子","emoji":"📌","gain":{"parts":3}},
    {"id":"h_tape","tier":"c","name":"強力膠帶","emoji":"🎞️","gain":{"parts":2,"hp":2}},
    {"id":"h_pipe","tier":"c","name":"水管","emoji":"🪠","gain":{"parts":3,"water":1}},
    {"id":"h_drill","tier":"r","name":"電鑽","emoji":"🪛","gain":{"parts":8}},
    {"id":"h_solar","tier":"r","name":"小太陽能板","emoji":"☀️","gain":{"parts":6,"morale":3}},
    {"id":"h_crate","tier":"l","name":"一整箱建材","emoji":"🏗️","gain":{"parts":20}},
    {"id":"h_plan","tier":"l","name":"施工藍圖","emoji":"📐","gain":{"facility":"random"}}]},
  {"id":"hospital","name":"醫院","emoji":"🏥","desc":"修基地、補士氣。","chapter":2,"min_min":0,"luck":2,"danger":0.04,"items":[
    {"id":"m_bandage","tier":"c","name":"繃帶","emoji":"🩹","gain":{"hp":5}},
    {"id":"m_vitamin","tier":"c","name":"維他命","emoji":"💊","gain":{"hp":3,"morale":2}},
    {"id":"m_mask","tier":"c","name":"口罩","emoji":"😷","gain":{"hp":2,"parts":1}},
    {"id":"m_kit","tier":"r","name":"醫療包","emoji":"🧰","gain":{"hp":12}},
    {"id":"m_bed","tier":"r","name":"病床零件","emoji":"🛏️","gain":{"parts":5,"hp":5}},
    {"id":"m_pharmacy","tier":"l","name":"藥局庫存","emoji":"💉","gain":{"hp":25,"morale":10}}]},
  {"id":"library","name":"圖書館","emoji":"📚","desc":"星屑多，有機會找到收藏品。讀書時最適合。","chapter":1,"min_min":0,"luck":3,"danger":0.01,"items":[
    {"id":"l_book","tier":"c","name":"一本好書","emoji":"📖","gain":{"morale":3,"stardust":2}},
    {"id":"l_notes","tier":"c","name":"前人的筆記","emoji":"📝","gain":{"stardust":4}},
    {"id":"l_candle","tier":"c","name":"蠟燭","emoji":"🕯️","gain":{"morale":2,"parts":1}},
    {"id":"l_atlas","tier":"r","name":"地圖集","emoji":"🗺️","gain":{"scav":2}},
    {"id":"l_rare","tier":"r","name":"絕版書","emoji":"📚","gain":{"stardust":12}},
    {"id":"l_wish","tier":"l","name":"夾在書裡的星願券","emoji":"🎫","gain":{"wish_normal":1}},
    {"id":"l_archive","tier":"l","name":"秘密檔案室","emoji":"🗄️","gain":{"relic":"x"}}]},
  {"id":"subway","name":"地鐵站","emoji":"🚇","desc":"什麼都有、稀有率高，但有點危險。","chapter":3,"min_min":0,"luck":10,"danger":0.10,"items":[
    {"id":"s_token","tier":"c","name":"舊車票","emoji":"🎟️","gain":{"gold":15}},
    {"id":"s_bag","tier":"c","name":"遺落的包包","emoji":"👜","gain":{"food":2,"water":2}},
    {"id":"s_vending","tier":"c","name":"月台販賣機","emoji":"🥤","gain":{"water":3,"food":1}},
    {"id":"s_locker","tier":"r","name":"置物櫃","emoji":"🔐","gain":{"parts":5,"food":3,"water":3}},
    {"id":"s_cash","tier":"r","name":"收銀機","emoji":"💰","gain":{"gold":40}},
    {"id":"s_tunnel","tier":"l","name":"隧道深處","emoji":"🔦","gain":{"scav":4,"stardust":15}}]},
  {"id":"military","name":"軍事基地","emoji":"🪖","desc":"史詩、傳說機率最高。專注要滿 60 分鐘才走得到，危險。","chapter":4,"min_min":60,"luck":20,"danger":0.15,"items":[
    {"id":"x_mre","tier":"c","name":"軍糧","emoji":"🍱","gain":{"food":4,"water":2}},
    {"id":"x_ammo","tier":"c","name":"空彈藥箱","emoji":"🗃️","gain":{"parts":5}},
    {"id":"x_radio","tier":"c","name":"軍用無線電","emoji":"📻","gain":{"parts":3,"morale":3}},
    {"id":"x_armor","tier":"r","name":"防彈板","emoji":"🛡️","gain":{"hp":15,"parts":5}},
    {"id":"x_generator","tier":"r","name":"軍用發電機","emoji":"⚡","gain":{"parts":15}},
    {"id":"x_depot","tier":"l","name":"補給庫","emoji":"🪖","gain":{"food":10,"water":10,"parts":15,"scav":2}}]}
],
"danger": [
  {"text":"被一群流浪狗追了一條街","emoji":"🐕‍🦺","gain":{"hp":-5}},
  {"text":"踩到碎玻璃","emoji":"🩸","gain":{"hp":-4}},
  {"text":"背包破了一個洞，掉了些東西","emoji":"🎒","gain":{"food":-2}},
  {"text":"遇到掠奪者，丟下零件逃跑","emoji":"🏴‍☠️","gain":{"parts":-4}},
  {"text":"天花板塌了一角，差點被砸到","emoji":"🧱","gain":{"hp":-8}},
  {"text":"迷路了好一陣子，心情很差","emoji":"🌀","gain":{"morale":-5}}
],
"meet": {"text":"遇到一個願意跟你走的倖存者","emoji":"🤝","gain":{"companion":"random"}}
}$j$::jsonb
$zones$;
grant execute on function public.doom_zones() to authenticated;


-- ---------- 開箱（內部） ----------
create or replace function public.doom_run_do(u uuid, p_session bigint, p_zone text, p_drops integer)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  zs jsonb := public.doom_zones();
  st public.doom_state%rowtype;
  s public.focus_sessions%rowtype;
  v_old jsonb;
  z jsonb;
  minutes integer;
  cnt integer;
  lo integer; hi integer;
  week integer;
  lk integer;
  i integer;
  t integer;
  L integer;
  x double precision;
  tier text;
  e jsonb;
  src text;
  applied jsonb;
  drops jsonb := '[]'::jsonb;
  bonus jsonb := null;
  completed boolean;
  downgraded text := null;
  res jsonb;
  n_rare integer := 0;
begin
  select result into v_old from public.doom_runs where user_id = u and session_id = p_session;
  if found then return v_old || jsonb_build_object('already', true); end if;

  select * into st from public.doom_state where user_id = u;
  if not found then raise exception '還沒進入末世'; end if;
  select * into s from public.focus_sessions where id = p_session and user_id = u;
  if not found then raise exception '找不到這段專注'; end if;
  if s.session_date < st.started_on then raise exception '末世開始前的專注不算'; end if;

  minutes := s.duration_seconds / 60;
  week := (public.app_today() - st.started_on) / 7 + 1;

  select el into z from jsonb_array_elements(zs->'zones') el where el->>'id' = p_zone;
  if z is null then z := zs->'zones'->0; end if;
  if (z->>'chapter')::integer > week then
    downgraded := (z->>'name') || '還沒開放（第 ' || (z->>'chapter') || ' 章），改去街頭';
    z := zs->'zones'->0;
  elsif minutes < (z->>'min_min')::integer then
    downgraded := '專注不到 ' || (z->>'min_min') || ' 分鐘，走不到' || (z->>'name') || '，在街頭撿了一些';
    z := zs->'zones'->0;
  end if;

  -- 每 5～10 分鐘一樣：數量以前端顯示的為準，但要在合理範圍內
  lo := minutes / 10;
  hi := minutes / 5;
  cnt := least(40, greatest(lo, least(hi, coalesce(p_drops, minutes * 2 / 15))));

  lk := public.doom_luck(u) + (z->>'luck')::integer;

  for i in 1..cnt loop
    t := greatest(1, round(minutes::numeric * i / cnt)::integer);
    src := 'doom-run:' || p_session || ':' || i;

    -- 危險
    if random() < (z->>'danger')::numeric then
      e := (select el from jsonb_array_elements(zs->'danger') el order by random() limit 1);
      applied := public.doom_apply(u, e->'gain', src);
      drops := drops || jsonb_build_object('t', t, 'kind', 'danger', 'name', e->>'text', 'emoji', e->>'emoji', 'gains', applied);
      continue;
    end if;
    -- 奇遇
    if random() < 0.03 then
      e := zs->'meet';
      applied := public.doom_apply(u, e->'gain', src);
      drops := drops || jsonb_build_object('t', t, 'kind', 'meet', 'tier', 'l', 'name', e->>'text', 'emoji', e->>'emoji', 'gains', applied);
      n_rare := n_rare + 1;
      continue;
    end if;

    -- 越久越好：每 15 分鐘幸運 +3（最多 +30）
    L := lk + least(30, (t / 15) * 3);
    x := random() * 10000;
    tier := case
      when x < 50 + 2 * L then 's'
      when x < 300 + 10 * L then 'x'
      when x < 1200 + 30 * L then 'l'
      when x < 4000 + 60 * L then 'r'
      else 'c' end;

    e := null;
    if tier in ('c', 'r') or (tier = 'l' and random() < 0.6) then
      select el into e from jsonb_array_elements(z->'items') el where el->>'tier' = tier order by random() limit 1;
    end if;
    if e is null then
      select el into e from jsonb_array_elements(public.doom_catalog()->'loot') el where el->>'tier' = tier order by random() limit 1;
      e := e || jsonb_build_object('src', 'loot');
    else
      e := e || jsonb_build_object('src', 'zone');
    end if;

    applied := public.doom_apply(u, e->'gain', src);
    drops := drops || jsonb_build_object('t', t, 'kind', 'item', 'tier', tier, 'id', e->>'id', 'src', e->>'src',
      'name', e->>'name', 'emoji', e->>'emoji', 'gains', applied);
    if tier in ('l', 'x', 's') then
      n_rare := n_rare + 1;
      perform public.doom_log_add(u, 'draw', tier, '在' || (z->>'name') || '搜刮到' || (e->>'name') || '！');
    end if;
  end loop;

  -- 平安歸來：倒計時照計畫完成，或正計時滿 25 分鐘
  completed := cnt > 0 and (
    (s.mode = 'down' and s.planned_minutes is not null and s.duration_seconds >= s.planned_minutes * 60 - 30)
    or (s.mode = 'up' and minutes >= 25));
  if completed then
    x := random() * 10000;
    L := lk + 10;
    tier := case when x < 100 + 2 * L then 's' when x < 600 + 10 * L then 'x' when x < 2500 + 30 * L then 'l' else 'r' end;
    select el into e from jsonb_array_elements(public.doom_catalog()->'loot') el where el->>'tier' = tier order by random() limit 1;
    applied := public.doom_apply(u, (e->'gain') || '{"scav":2}'::jsonb, 'doom-run:' || p_session || ':bonus');
    bonus := jsonb_build_object('tier', tier, 'id', e->>'id', 'src', 'loot', 'name', e->>'name', 'emoji', e->>'emoji', 'gains', applied);
  end if;

  res := jsonb_build_object('session', p_session, 'zone', z->>'id', 'zone_name', z->>'name', 'zone_emoji', z->>'emoji',
    'minutes', minutes, 'drops', drops, 'bonus', bonus, 'downgraded', downgraded, 'rare', n_rare);
  insert into public.doom_runs (user_id, session_id, zone, minutes, result) values (u, p_session, z->>'id', minutes, res);
  perform public.doom_log_add(u, 'run', null,
    '在' || (z->>'name') || '專注 ' || minutes || ' 分鐘，帶回 ' || cnt || ' 樣' || case when completed then '，平安歸來' else '' end || '。');
  return res;
end;
$function$;
revoke all on function public.doom_run_do(uuid, bigint, text, integer) from public, authenticated, anon;

create or replace function public.doom_run_claim(p_session bigint, p_zone text, p_drops integer default null)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_ensure(u);
  return public.doom_run_do(u, p_session, p_zone, p_drops)::json;
end;
$function$;
grant execute on function public.doom_run_claim(bigint, text, integer) to authenticated;


-- ---------- 沒選區域的專注：進頁面時自動在街頭開箱 ----------
create or replace function public.doom_run_auto(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  st public.doom_state%rowtype;
  r record;
  res jsonb;
  out jsonb := '[]'::jsonb;
begin
  select * into st from public.doom_state where user_id = u;
  for r in
    select f.id from public.focus_sessions f
    where f.user_id = u
      and f.session_date >= greatest(st.started_on, public.app_today() - 2)
      and f.ended_at < now() - interval '3 minutes'
      and f.created_at >= st.created_at
      and not exists (select 1 from public.doom_runs d where d.user_id = u and d.session_id = f.id)
    order by f.id limit 10
  loop
    res := public.doom_run_do(u, r.id, 'street', null);
    out := out || jsonb_build_array(res);
  end loop;
  return out;
end;
$function$;
revoke all on function public.doom_run_auto(uuid) from public, authenticated, anon;


-- ---------- 收成果：專注不再直接給零件和搜刮券（改由專注搜刮發） ----------
create or replace function public.doom_harvest(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  today date := public.app_today();
  st public.doom_state%rowtype;
  d date;
  a record;
  dd public.doom_days%rowtype;
  t_new integer; s_new integer;
  dt integer; ds integer;
  food integer := 0; water integer := 0; scav integer := 0;
  n_tasks integer := 0; n_steps integer := 0;
  applied jsonb;
begin
  select * into st from public.doom_state where user_id = u;
  d := greatest(st.started_on, today - 2);
  while d <= today loop
    perform public.doom_day(u, d, false);
    select * into dd from public.doom_days where user_id = u and day = d for update;
    select * into a from public.doom_activity(u, d);
    t_new := least(a.tasks, 15);
    s_new := least(a.steps, 20);

    dt := greatest(0, t_new - dd.tasks_n);
    food := food + dt; water := water + dt; scav := scav + dt;
    n_tasks := n_tasks + dt;

    if s_new > dd.steps_n then
      ds := s_new / 2 - dd.steps_n / 2;
      food := food + ds; water := water + ds; scav := scav + ds;
      n_steps := n_steps + (s_new - dd.steps_n);
    end if;

    update public.doom_days set tasks_n = greatest(tasks_n, t_new), steps_n = greatest(steps_n, s_new),
      focus_s = greatest(focus_s, a.focus_s)
      where user_id = u and day = d;
    d := d + 1;
  end loop;

  if food + water + scav = 0 then return null; end if;
  applied := public.doom_apply(u, jsonb_strip_nulls(jsonb_build_object(
    'food', nullif(food, 0), 'water', nullif(water, 0), 'scav', nullif(scav, 0))),
    'doom-harvest:' || gen_random_uuid());
  return jsonb_build_object('tasks', n_tasks, 'steps', n_steps, 'focus_min', 0, 'gains', applied);
end;
$function$;
revoke all on function public.doom_harvest(uuid) from public, authenticated, anon;


-- ---------- 📺 進頁面（加上自動開箱、最近的搜刮） ----------
create or replace function public.doom_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  today date := public.app_today();
  fresh boolean;
  settle jsonb;
  harvest jsonb;
  auto jsonb;
  st public.doom_state%rowtype;
  dd public.doom_days%rowtype;
  wk jsonb;
  v_last jsonb := null;
  logs jsonb;
  runs jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  fresh := public.doom_ensure(u);
  settle := public.doom_settle(u);
  perform public.doom_day(u, today, true);
  harvest := public.doom_harvest(u);
  auto := public.doom_run_auto(u);

  select * into st from public.doom_state where user_id = u;
  select * into dd from public.doom_days where user_id = u and day = today;
  wk := public.doom_week(u);
  if (wk->>'week')::integer > 1 then
    v_last := public.doom_week(u, (wk->>'week')::integer - 1);
    if (v_last->>'report_seen')::boolean then v_last := null; end if;
  end if;
  select coalesce(jsonb_agg(x order by x.id desc), '[]'::jsonb) into logs from (
    select id, day, kind, tier, body from public.doom_log where user_id = u order by id desc limit 20) x;
  select coalesce(jsonb_agg(x.result order by x.created_at desc), '[]'::jsonb) into runs from (
    select result, created_at from public.doom_runs where user_id = u order by created_at desc limit 5) x;

  return json_build_object(
    'fresh', fresh, 'settle', settle, 'harvest', harvest, 'auto', auto,
    'state', to_jsonb(st) - 'user_id',
    'today', to_jsonb(dd) - 'user_id',
    'luck', public.doom_luck(u),
    'week', wk, 'lastWeek', v_last, 'logs', logs, 'runs', runs, 'date', today);
end;
$function$;
grant execute on function public.doom_status() to authenticated;
