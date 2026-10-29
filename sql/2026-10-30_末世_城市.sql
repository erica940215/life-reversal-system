-- =========================================================
-- 序光計畫：☢️ 末世：🏙️ 重建城市、🛠️ 合成工坊、🧭 遠征
-- 要先執行三個末世檔（末世、專注搜刮、擴充）。可以重複執行。
--
--   倖存者：專注搜刮時救回來（專注越久越容易）、遠征也會帶回來
--           每天每 4 個人吃 1 份食物、喝 1 份水；每 3 個人每天做出 1 個零件（囤貨不會被吃光，最多吃掉 5%）
--   大型工程：8 個，每個 3 階段，投入物資完成後永久加成（幸運、每日產出、遠征隊伍、防禦…）
--   城市等級：工程階段 + 倖存者 / 5
--   夜襲：每天晚上有機會被掠奪者襲擊；防禦夠 → 打贏拿戰利品；不夠 → 被搶走一小部分（最多 5%）
--   合成工坊：把物資和搜刮券做成補給箱、翻倍卡、星願券、召喚券…；重複的生活小物可以回收
--   遠征：派同伴帶物資去遠方，幾小時後帶回倖存者和稀有東西；遠征期間你專注的時間，遠征會加倍快
-- =========================================================

alter table public.doom_state
  add column if not exists survivors integer not null default 0,
  add column if not exists projects jsonb not null default '{}'::jsonb,      -- {"clinic":2}
  add column if not exists city_day date,
  add column if not exists raids jsonb not null default '{"win":0,"lose":0}'::jsonb,
  add column if not exists crafted integer not null default 0;

create table if not exists public.doom_expeditions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  dest text not null,
  companion text not null,
  started_at timestamptz not null default now(),
  hours numeric not null,
  claimed_at timestamptz,
  result jsonb
);
create index if not exists doom_exp_user on public.doom_expeditions (user_id, claimed_at);
alter table public.doom_expeditions enable row level security;
drop policy if exists "doom_exp_select_own" on public.doom_expeditions;
create policy "doom_exp_select_own" on public.doom_expeditions for select using (user_id = auth.uid());


-- ---------- 📚 資料 ----------
create or replace function public.doom_city_cat()
returns jsonb language sql immutable
as $function$
select $json${
"projects": [
  {"id":"clinic","name":"社區診所","emoji":"🏥","desc":"照顧大家的身體。","lv":1,
   "stages":[{"cost":{"food":20,"water":30,"parts":40},"need":3},{"cost":{"food":40,"water":60,"parts":90},"need":8},{"cost":{"food":80,"water":120,"parts":180},"need":15}],
   "perk":"每階段：每天 HP +5、士氣 +2"},
  {"id":"greenhouse","name":"溫室農場","emoji":"🌱","desc":"自己種出食物。","lv":1,
   "stages":[{"cost":{"water":40,"parts":50},"need":3},{"cost":{"water":80,"parts":110},"need":8},{"cost":{"water":150,"parts":220},"need":15}],
   "perk":"每階段：每天食物 +4"},
  {"id":"waterplant","name":"淨水廠","emoji":"🚰","desc":"乾淨的水源源不絕。","lv":1,
   "stages":[{"cost":{"food":30,"parts":50},"need":3},{"cost":{"food":60,"parts":110},"need":8},{"cost":{"food":120,"parts":220},"need":15}],
   "perk":"每階段：每天水 +4"},
  {"id":"powerplant","name":"發電廠","emoji":"⚡","desc":"讓城市重新亮起來。","lv":2,
   "stages":[{"cost":{"food":30,"water":30,"parts":80},"need":5},{"cost":{"food":60,"water":60,"parts":160},"need":10},{"cost":{"food":120,"water":120,"parts":300},"need":20}],
   "perk":"每階段：每天零件 +4"},
  {"id":"school","name":"學校","emoji":"🏫","desc":"孩子們又能上課了。","lv":2,
   "stages":[{"cost":{"food":50,"water":50,"parts":60},"need":5},{"cost":{"food":100,"water":100,"parts":120},"need":12},{"cost":{"food":200,"water":200,"parts":240},"need":20}],
   "perk":"每階段：幸運 +3"},
  {"id":"radiotower","name":"無線電塔","emoji":"📡","desc":"聯絡更遠的倖存者。","lv":3,
   "stages":[{"cost":{"food":40,"water":40,"parts":100},"need":6},{"cost":{"food":80,"water":80,"parts":200},"need":12},{"cost":{"food":160,"water":160,"parts":350},"need":20}],
   "perk":"每階段：遠征隊伍 +1"},
  {"id":"citywall","name":"城牆","emoji":"🧱","desc":"擋住夜裡的掠奪者。","lv":2,
   "stages":[{"cost":{"food":20,"water":20,"parts":90},"need":4},{"cost":{"food":40,"water":40,"parts":180},"need":10},{"cost":{"food":80,"water":80,"parts":320},"need":18}],
   "perk":"每階段：防禦 +25"},
  {"id":"lighthouse","name":"星光燈塔","emoji":"🗼","desc":"在廢墟中央點亮希望。","lv":4,
   "stages":[{"cost":{"food":100,"water":100,"parts":150},"need":10},{"cost":{"food":200,"water":200,"parts":300},"need":20},{"cost":{"food":400,"water":400,"parts":600},"need":35}],
   "perk":"每階段：每天星屑 +5、搜刮券 +1"}
],
"recipes": [
  {"id":"r_bronze","name":"銅補給箱","emoji":"📦","icon":"ui/box_bronze","cost":{"parts":30,"food":10},"gain":{"box_bronze":1}},
  {"id":"r_silver","name":"銀補給箱","emoji":"🎁","icon":"ui/box_silver","cost":{"parts":60,"water":20,"scav":3},"gain":{"box_silver":1}},
  {"id":"r_gold","name":"金補給箱","emoji":"💰","icon":"ui/box_gold","cost":{"parts":120,"food":40,"water":40,"scav":6},"gain":{"box_gold":1}},
  {"id":"r_double","name":"翻倍卡","emoji":"✖️","icon":"craft/double","cost":{"parts":40,"scav":5},"gain":{"double":1}},
  {"id":"r_unid","name":"未鑑定物品","emoji":"❓","icon":"ui/unid","cost":{"food":10,"scav":2},"gain":{"unid":1}},
  {"id":"r_wish","name":"星願券","emoji":"🎫","icon":"craft/wish","cost":{"parts":40,"scav":4},"gain":{"wish_normal":1}},
  {"id":"r_ticket","name":"召喚券","emoji":"🎟️","icon":"craft/ticket","cost":{"parts":50,"scav":4},"gain":{"ticket_normal":1}},
  {"id":"r_scav","name":"搜刮券 ×2","emoji":"🎟️","icon":"ui/scav","cost":{"food":15,"water":15,"parts":10},"gain":{"scav":2}},
  {"id":"r_medkit","name":"急救包","emoji":"🩹","icon":"craft/medkit","cost":{"water":10,"parts":15},"gain":{"hp":20,"morale":5}},
  {"id":"r_party","name":"營火晚會","emoji":"🔥","icon":"craft/party","cost":{"food":20,"water":10},"gain":{"morale":20}},
  {"id":"r_dust","name":"星屑 ×15","emoji":"✨","icon":"craft/dust","cost":{"parts":30,"water":10},"gain":{"stardust":15}},
  {"id":"r_recruit","name":"招募倖存者","emoji":"🧑‍🤝‍🧑","icon":"craft/recruit","cost":{"food":30,"water":30},"gain":{"survivor":1}},
  {"id":"r_rest","name":"休息券","emoji":"🛌","icon":"craft/rest","cost":{"food":60,"water":60,"parts":40},"gain":{"item":"rest_extra"}}
],
"dests": [
  {"id":"farmland","name":"郊外農場","emoji":"🌾","desc":"安全，帶回很多食物。","city":1,"hours":1,"cost":{"food":5,"water":5},
   "gain":{"food":[12,25],"water":[4,10]},"survivor":0.3,"rare":0.05},
  {"id":"harbor","name":"廢棄港口","emoji":"⚓","desc":"零件和水很多。","city":2,"hours":3,"cost":{"food":10,"water":10},
   "gain":{"parts":[15,35],"water":[10,20]},"survivor":0.5,"rare":0.1},
  {"id":"station","name":"山區氣象站","emoji":"🏔️","desc":"可能有無線電訊號和星屑。","city":4,"hours":4,"cost":{"food":15,"water":15},
   "gain":{"stardust":[8,20],"parts":[10,25],"scav":[1,3]},"survivor":0.6,"rare":0.15},
  {"id":"undercity","name":"地下城市","emoji":"🚇","desc":"很多倖存者躲在這裡，但很危險。","city":7,"hours":6,"cost":{"food":25,"water":25},
   "gain":{"food":[15,30],"parts":[20,40],"scav":[2,4]},"survivor":1.5,"rare":0.2},
  {"id":"starfall","name":"星落之地","emoji":"🌠","desc":"傳說星星墜落的地方，寶物最多。","city":10,"hours":8,"cost":{"food":40,"water":40,"parts":20},
   "gain":{"stardust":[30,60],"scav":[3,6],"gold":[50,150]},"survivor":1,"rare":0.4}
]
}$json$::jsonb
$function$;
grant execute on function public.doom_city_cat() to authenticated;

create or replace function public.doom_city_lv(st public.doom_state)
returns integer language sql immutable
as $function$
  select 1 + coalesce((select sum(value::int) from jsonb_each_text(st.projects)), 0)::int + st.survivors / 5;
$function$;

create or replace function public.doom_proj(st public.doom_state, p_id text)
returns integer language sql immutable
as $function$ select coalesce((st.projects->>p_id)::int, 0); $function$;

-- 夠不夠付：cost {"food":10,...}
create or replace function public.doom_can_pay(st public.doom_state, cost jsonb)
returns boolean language sql immutable
as $function$
  select not exists (select 1 from jsonb_each_text(cost) c where
    (c.key = 'food' and st.food < c.value::int) or (c.key = 'water' and st.water < c.value::int) or
    (c.key = 'parts' and st.parts < c.value::int) or (c.key = 'scav' and st.scav < c.value::int));
$function$;

create or replace function public.doom_neg(cost jsonb)
returns jsonb language sql immutable
as $function$ select coalesce(jsonb_object_agg(key, -(value::int)), '{}'::jsonb) from jsonb_each_text(cost); $function$;


-- ---------- 🍀 幸運（加上學校） ----------
create or replace function public.doom_luck(u uuid)
returns integer language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  st public.doom_state%rowtype;
  dd public.doom_days%rowtype;
  l integer := 0;
  sets integer;
begin
  select * into st from public.doom_state where user_id = u;
  select * into dd from public.doom_days where user_id = u and day = public.app_today();
  l := 2 * coalesce((st.facilities->>'radio')::integer, 0);
  if st.companions ? 'owl' then l := l + 3; end if;
  if public.doom_bond_lv(st, 'owl') >= 5 then l := l + 3; end if;
  l := l + (st.morale - 50) / 10;
  l := l + least(10, coalesce(dd.tasks_n, 0) + coalesce(dd.steps_n, 0) / 2);
  if dd.broadcast is not null and public.doom_find('broadcasts', dd.broadcast)->>'buff' = 'luck' then l := l + 5; end if;
  if st.hp <= 0 then l := l - 5; end if;
  select count(*) into sets from jsonb_object_keys(st.rewards) k where k like 'set:%';
  l := l + 2 * sets;
  select count(*) into sets from jsonb_object_keys(st.rewards) k where k like 'tset:%';
  l := l + sets;
  l := l + 3 * public.doom_proj(st, 'school');
  return greatest(0, l);
end;
$function$;
revoke all on function public.doom_luck(uuid) from public, authenticated, anon;


-- ---------- 🌙 每天結算一次：倖存者吃喝、產出、夜襲 ----------
create or replace function public.doom_city_tick(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  st public.doom_state%rowtype;
  today date := public.app_today();
  d date;
  days integer;
  g jsonb;
  eat integer; drink integer;
  atk integer; def integer;
  notes jsonb := '[]'::jsonb;
  applied jsonb;
  i integer := 0;
begin
  select * into st from public.doom_state where user_id = u for update;
  if not found then return notes; end if;
  if st.city_day is null then
    update public.doom_state set city_day = today where user_id = u;
    return notes;
  end if;
  if st.city_day >= today then return notes; end if;

  d := st.city_day;
  while d < today and i < 7 loop       -- 很久沒來，最多補 7 天
    d := d + 1; i := i + 1;
    select * into st from public.doom_state where user_id = u;
    -- 吃喝（最多吃掉 5%，囤貨不會被吃光）
    eat := least(ceil(st.survivors / 4.0)::int, greatest(1, st.food / 20));
    drink := least(ceil(st.survivors / 4.0)::int, greatest(1, st.water / 20));
    if st.survivors = 0 then eat := 0; drink := 0; end if;
    g := jsonb_build_object(
      'food', 4 * public.doom_proj(st, 'greenhouse') - eat,
      'water', 4 * public.doom_proj(st, 'waterplant') - drink,
      'parts', st.survivors / 3 + 4 * public.doom_proj(st, 'powerplant'),
      'hp', 5 * public.doom_proj(st, 'clinic'),
      'morale', 2 * public.doom_proj(st, 'clinic'),
      'stardust', 5 * public.doom_proj(st, 'lighthouse'),
      'scav', public.doom_proj(st, 'lighthouse'));
    applied := public.doom_apply(u, g, 'doom-city:' || d);
    if jsonb_array_length(applied) > 0 then
      notes := notes || jsonb_build_object('kind', 'city', 'title', '🏙️ 城市的一天（' || to_char(d, 'MM/DD') || '）', 'gains', applied);
    end if;

    -- 🌙 夜襲：第 3 天之後，每晚 30%
    if st.day_no >= 3 and random() < 0.30 then
      atk := 20 + (d - st.started_on) * 3 + floor(random() * 20)::int;
      def := 25 * public.doom_proj(st, 'citywall') + 8 * coalesce((st.facilities->>'wall')::int, 0) + st.survivors * 2 + 10;
      if def >= atk then
        applied := public.doom_apply(u, jsonb_build_object('parts', 5 + atk / 4, 'stardust', 3 + atk / 10, 'scav', 1), 'doom-raid:' || d);
        update public.doom_state set raids = jsonb_set(raids, '{win}', to_jsonb(coalesce((raids->>'win')::int, 0) + 1)) where user_id = u;
        perform public.doom_log_add(u, 'raid', 'r', '夜裡掠奪者來襲（攻擊 ' || atk || '），城市守住了，還撿到他們丟下的東西！');
        notes := notes || jsonb_build_object('kind', 'raid', 'title', '🛡️ 夜襲擊退！攻擊 ' || atk || ' vs 防禦 ' || def, 'gains', applied);
      else
        applied := public.doom_apply(u, jsonb_build_object('food', -least(st.food / 20, 15), 'water', -least(st.water / 20, 15), 'parts', -least(st.parts / 20, 15)), 'doom-raid:' || d);
        update public.doom_state set raids = jsonb_set(raids, '{lose}', to_jsonb(coalesce((raids->>'lose')::int, 0) + 1)) where user_id = u;
        perform public.doom_log_add(u, 'raid', null, '夜裡掠奪者來襲（攻擊 ' || atk || '），被搶走了一些物資。蓋城牆可以擋住他們。');
        notes := notes || jsonb_build_object('kind', 'raid', 'title', '🌙 夜襲！攻擊 ' || atk || ' vs 防禦 ' || def || '，被搶走一點東西', 'gains', applied);
      end if;
    end if;
  end loop;

  update public.doom_state set city_day = today where user_id = u;
  return notes;
end;
$function$;
revoke all on function public.doom_city_tick(uuid) from public, authenticated, anon;


-- ---------- 🏙️ 城市狀態 ----------
create or replace function public.doom_city_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  st public.doom_state%rowtype;
  notes jsonb;
  exps jsonb;
  busy jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_ensure(u);
  notes := public.doom_city_tick(u);
  select * into st from public.doom_state where user_id = u;
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'dest', e.dest, 'companion', e.companion,
           'started_at', e.started_at, 'hours', e.hours, 'end_at', public.doom_exp_end(e)) order by e.id), '[]'::jsonb)
    into exps from public.doom_expeditions e where e.user_id = u and e.claimed_at is null;
  return json_build_object(
    'survivors', st.survivors, 'projects', st.projects, 'city_lv', public.doom_city_lv(st),
    'defense', 25 * public.doom_proj(st, 'citywall') + 8 * coalesce((st.facilities->>'wall')::int, 0) + st.survivors * 2 + 10,
    'threat', 20 + (public.app_today() - st.started_on) * 3,
    'raids', st.raids, 'crafted', st.crafted,
    'slots', 1 + public.doom_proj(st, 'radiotower'),
    'expeditions', exps, 'notes', notes,
    'res', jsonb_build_object('food', st.food, 'water', st.water, 'parts', st.parts, 'scav', st.scav),
    'companions', st.companions, 'trinkets', st.trinkets, 'now', now());
end;
$function$;
grant execute on function public.doom_city_status() to authenticated;


-- ---------- 🏗️ 投入工程（一次蓋完一個階段） ----------
create or replace function public.doom_build_project(p_id text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  st public.doom_state%rowtype;
  p jsonb;
  lv integer;
  stg jsonb;
  applied jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  select el into p from jsonb_array_elements(public.doom_city_cat()->'projects') el where el->>'id' = p_id;
  if p is null then raise exception '沒有這個工程'; end if;
  if public.doom_city_lv(st) < (p->>'lv')::int then raise exception '城市等級 % 才能蓋', p->>'lv'; end if;
  lv := public.doom_proj(st, p_id);
  if lv >= 3 then raise exception '這個工程已經蓋好了'; end if;
  stg := p->'stages'->lv;
  if st.survivors < (stg->>'need')::int then raise exception '需要 % 個倖存者一起蓋（現在 % 個）', stg->>'need', st.survivors; end if;
  if not public.doom_can_pay(st, stg->'cost') then raise exception '物資不夠'; end if;
  applied := public.doom_apply(u, public.doom_neg(stg->'cost'), 'doom-proj:' || p_id || ':' || lv);
  update public.doom_state set projects = projects || jsonb_build_object(p_id, lv + 1) where user_id = u;
  perform public.doom_log_add(u, 'city', case when lv + 1 = 3 then 'x' else 'l' end,
    (p->>'name') || case when lv + 1 = 3 then '完工了！' else '蓋到第 ' || (lv + 1) || ' 階段。' end);
  return json_build_object('id', p_id, 'lv', lv + 1, 'paid', applied, 'rewards', public.doom_rewards_check(u));
end;
$function$;
grant execute on function public.doom_build_project(text) to authenticated;


-- ---------- 🛠️ 合成 ----------
create or replace function public.doom_craft(p_id text, p_n integer default 1)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  st public.doom_state%rowtype;
  r jsonb;
  n integer := greatest(1, least(coalesce(p_n, 1), 20));
  i integer;
  done integer := 0;
  out jsonb := '[]'::jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  select el into r from jsonb_array_elements(public.doom_city_cat()->'recipes') el where el->>'id' = p_id;
  if r is null then raise exception '沒有這個配方'; end if;
  for i in 1..n loop
    select * into st from public.doom_state where user_id = u for update;
    exit when not public.doom_can_pay(st, r->'cost');
    perform public.doom_apply(u, public.doom_neg(r->'cost'), 'doom-craft-pay:' || gen_random_uuid());
    if r->'gain' ? 'item' then
      perform public.grant_item(u, r->'gain'->>'item', 1, 'doom-craft-item:' || gen_random_uuid());
      out := out || jsonb_build_object('k', r->'gain'->>'item', 'n', 1);
    elsif r->'gain' ? 'survivor' then
      update public.doom_state set survivors = survivors + (r->'gain'->>'survivor')::int where user_id = u;
      out := out || jsonb_build_object('k', 'survivor', 'n', 1);
    else
      out := out || public.doom_apply(u, r->'gain', 'doom-craft:' || gen_random_uuid());
    end if;
    done := done + 1;
  end loop;
  if done = 0 then raise exception '材料不夠'; end if;
  update public.doom_state set crafted = crafted + done where user_id = u;
  return json_build_object('id', p_id, 'n', done, 'gains', out);
end;
$function$;
grant execute on function public.doom_craft(text, integer) to authenticated;

-- ♻️ 回收重複的生活小物：每多一個換 星屑 4、零件 3（每種留 1 個）
create or replace function public.doom_recycle()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  st public.doom_state%rowtype;
  extra integer;
  applied jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  select coalesce(sum(greatest(0, value::int - 1)), 0) into extra from jsonb_each_text(st.trinkets);
  if extra = 0 then raise exception '沒有重複的小物'; end if;
  update public.doom_state set trinkets = (select coalesce(jsonb_object_agg(key, least(1, value::int)), '{}'::jsonb) from jsonb_each_text(st.trinkets))
    where user_id = u;
  applied := public.doom_apply(u, jsonb_build_object('stardust', extra * 4, 'parts', extra * 3), 'doom-recycle:' || gen_random_uuid());
  return json_build_object('n', extra, 'gains', applied);
end;
$function$;
grant execute on function public.doom_recycle() to authenticated;


-- ---------- 🧭 遠征 ----------
-- 回來的時間：出發時間 + 時數，但遠征期間每專注 1 分鐘，就再提早 1 分鐘（專注時遠征加倍快）
create or replace function public.doom_exp_end(e public.doom_expeditions)
returns timestamptz language sql stable security definer set search_path to 'public'
as $function$
  select greatest(e.started_at + interval '10 minutes',
    e.started_at + make_interval(secs => e.hours * 3600) - make_interval(secs => coalesce((
      select sum(f.duration_seconds) from public.focus_sessions f
      where f.user_id = e.user_id and f.ended_at > e.started_at), 0)));
$function$;

create or replace function public.doom_exp_start(p_dest text, p_companion text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  st public.doom_state%rowtype;
  d jsonb;
  busy integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  select el into d from jsonb_array_elements(public.doom_city_cat()->'dests') el where el->>'id' = p_dest;
  if d is null then raise exception '沒有這個地方'; end if;
  if public.doom_city_lv(st) < (d->>'city')::int then raise exception '城市等級 % 才能去', d->>'city'; end if;
  if not st.companions ? p_companion then raise exception '還沒有這個同伴'; end if;
  if exists (select 1 from public.doom_expeditions where user_id = u and claimed_at is null and companion = p_companion) then
    raise exception '這個同伴已經在遠征了';
  end if;
  select count(*) into busy from public.doom_expeditions where user_id = u and claimed_at is null;
  if busy >= 1 + public.doom_proj(st, 'radiotower') then raise exception '遠征隊伍都出去了（蓋無線電塔可以多派）'; end if;
  if not public.doom_can_pay(st, d->'cost') then raise exception '帶的物資不夠'; end if;
  perform public.doom_apply(u, public.doom_neg(d->'cost'), 'doom-exp-pay:' || gen_random_uuid());
  insert into public.doom_expeditions (user_id, dest, companion, hours) values (u, p_dest, p_companion, (d->>'hours')::numeric);
  return public.doom_city_status();
end;
$function$;
grant execute on function public.doom_exp_start(text, text) to authenticated;

create or replace function public.doom_exp_claim(p_id bigint)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  e public.doom_expeditions%rowtype;
  d jsonb;
  g jsonb := '{}'::jsonb;
  r record;
  lo integer; hi integer;
  surv integer := 0;
  applied jsonb;
  extra jsonb := '[]'::jsonb;
  tk jsonb;
  res jsonb;
  bonus numeric;
  st public.doom_state%rowtype;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into e from public.doom_expeditions where id = p_id and user_id = u for update;
  if not found then raise exception '找不到這趟遠征'; end if;
  if e.claimed_at is not null then return e.result; end if;
  if now() < public.doom_exp_end(e) then raise exception '還在路上'; end if;
  select el into d from jsonb_array_elements(public.doom_city_cat()->'dests') el where el->>'id' = e.dest;
  select * into st from public.doom_state where user_id = u;
  bonus := 1 + 0.1 * public.doom_bond_lv(st, e.companion);   -- 好感越高帶回越多

  for r in select key, value from jsonb_each(d->'gain') loop
    lo := (r.value->>0)::int; hi := (r.value->>1)::int;
    g := g || jsonb_build_object(r.key, round((lo + floor(random() * (hi - lo + 1))) * bonus)::int);
  end loop;
  applied := public.doom_apply(u, g, 'doom-exp:' || e.id);

  surv := floor((d->>'survivor')::numeric)::int + case when random() < ((d->>'survivor')::numeric % 1) then 1 else 0 end;
  if surv > 0 then
    update public.doom_state set survivors = survivors + surv where user_id = u;
    applied := applied || jsonb_build_object('k', 'survivor', 'n', surv);
  end if;
  if random() < (d->>'rare')::numeric then
    extra := extra || public.doom_apply(u, jsonb_build_object('relic', case when random() < 0.2 then 'x' else 'l' end), 'doom-exp-relic:' || e.id);
  end if;
  tk := public.doom_trinket(u, 'doom-exp-trk:' || e.id, null, random() < 0.5);
  if tk is not null then extra := extra || jsonb_build_array(jsonb_build_object('k', 'trinket', 'name', tk->>'name', 'emoji', tk->>'emoji', 'id', tk->>'id', 'tier', tk->>'tier')); end if;

  res := jsonb_build_object('id', e.id, 'dest', e.dest, 'name', d->>'name', 'emoji', d->>'emoji', 'companion', e.companion,
    'gains', applied || extra, 'survivors', surv);
  update public.doom_expeditions set claimed_at = now(), result = res where id = e.id;
  perform public.doom_log_add(u, 'exp', case when surv > 0 then 'l' else 'r' end,
    '遠征隊從' || (d->>'name') || '回來了' || case when surv > 0 then '，還帶回 ' || surv || ' 個倖存者' else '' end || '！');
  return res || jsonb_build_object('rewards', public.doom_rewards_check(u));
end;
$function$;
grant execute on function public.doom_exp_claim(bigint) to authenticated;


-- ---------- 🧑‍🤝‍🧑 專注搜刮時救到倖存者（每趟：分鐘 / 120 的機率，最多 2 個） ----------
create or replace function public.doom_rescue(u uuid, p_minutes integer)
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare n integer := 0; p numeric := least(0.95, p_minutes / 120.0);
begin
  if random() < p then n := 1; end if;
  if p_minutes >= 120 and random() < 0.35 then n := n + 1; end if;
  if n > 0 then update public.doom_state set survivors = survivors + n where user_id = u; end if;
  return n;
end;
$function$;
revoke all on function public.doom_rescue(uuid, integer) from public, authenticated, anon;

-- 包一層 doom_run_claim：原本的搜刮照舊，再加上救倖存者
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'doom_run_claim_base') then
    alter function public.doom_run_claim(bigint, text, integer) rename to doom_run_claim_base;
  end if;
end $$;
revoke all on function public.doom_run_claim_base(bigint, text, integer) from public, authenticated, anon;

create or replace function public.doom_run_claim(p_session bigint, p_zone text, p_drops integer default null)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  res jsonb;
  n integer;
begin
  res := public.doom_run_claim_base(p_session, p_zone, p_drops)::jsonb;
  if u is null or coalesce((res->>'already')::boolean, false) or res ? 'rescued' then return res; end if;
  n := public.doom_rescue(u, coalesce((res->>'minutes')::int, 0));
  res := res || jsonb_build_object('rescued', n);
  update public.doom_runs set result = result || jsonb_build_object('rescued', n) where user_id = u and session_id = p_session;
  if n > 0 then perform public.doom_log_add(u, 'city', 'r', '搜刮時救回了 ' || n || ' 個倖存者，帶他們回城市。'); end if;
  return res;
end;
$function$;
grant execute on function public.doom_run_claim(bigint, text, integer) to authenticated;
