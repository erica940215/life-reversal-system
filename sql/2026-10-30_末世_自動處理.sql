-- =========================================================
-- 序光計畫：☢️ 末世：⚡ 忙碌模式（一鍵自動處理）
-- 要在「2026-10-30_末世_夥伴與農場分區.sql」之後執行。可以重複執行。
--
--   一個按鈕幫你把末世該做的事做完：撿物資、轉盤、寶箱、補給箱、鑑定、摸夥伴、修基地、
--   遠征（領回來＋派出去）、農場（收成＋把空格種滿）、廚房（爐子做最好的菜）、
--   建設（農場升級、設施、城市工程、異能，會留安全庫存）、（可選）用搜刮券抽獎
--   打開「每天自動處理」之後，沒上線也會每 3 小時幫你跑一次
--   居民請求、事件選擇這種「要你決定」的不會自動處理
-- =========================================================

alter table public.doom_state
  add column if not exists auto jsonb not null default '{}'::jsonb,
  add column if not exists auto_last jsonb;

create or replace function public.doom_auto_do(u uuid, o jsonb)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_keep constant integer := 30;            -- 食物／水／零件至少留這麼多
  lines jsonb := '[]'::jsonb;
  st public.doom_state%rowtype;
  fcat jsonb := public.doom_farm_cat();
  food jsonb := public.doom_food_cat();
  cat jsonb := public.doom_catalog();
  cc jsonb := public.doom_city_cat();
  i integer; n integer; cnt integer; k text; x jsonb; c jsonb; a jsonb; e record;
  lvrow jsonb; nx jsonb; cap integer; used integer; free integer; have integer; cost integer;
  best jsonb; bscore numeric; sc numeric; planted jsonb; maxn integer; v integer; names text;
  stoves integer;
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('test.uid', u::text, true);
  begin perform public.doom_status(); exception when others then null; end;

  -- 📦 每日：撿物資、轉盤、生存寶箱、本章寶箱
  begin perform public.doom_pickup(); lines := lines || to_jsonb('🧺 撿了今天的物資'::text); exception when others then null; end;
  begin perform public.doom_spin(); lines := lines || to_jsonb('🎡 轉了今天的轉盤'::text); exception when others then null; end;
  cnt := 0;
  for i in 1..3 loop
    begin perform public.doom_daily_chest(); cnt := cnt + 1; exception when others then exit; end;
  end loop;
  if cnt > 0 then lines := lines || to_jsonb('🎁 開了 ' || cnt || ' 個生存寶箱'); end if;
  cnt := 0;
  for i in 1..2 loop
    begin perform public.doom_week_claim(); cnt := cnt + 1; exception when others then exit; end;
  end loop;
  if cnt > 0 then lines := lines || to_jsonb('📖 領了本章寶箱 ×' || cnt); end if;

  -- 🎁 補給箱、鑑定
  select * into st from public.doom_state where user_id = u;
  cnt := 0;
  for k, v in select key, value::int from jsonb_each_text(coalesce(st.boxes, '{}'::jsonb)) loop
    for i in 1..least(v, 30) loop
      begin perform public.doom_box_open(k); cnt := cnt + 1; exception when others then exit; end;
    end loop;
  end loop;
  if cnt > 0 then lines := lines || to_jsonb('📦 打開了 ' || cnt || ' 個補給箱'); end if;
  cnt := 0;
  for x in select el from jsonb_array_elements(coalesce(st.unid, '[]'::jsonb)) el loop
    begin perform public.doom_identify(x->>'uid'); cnt := cnt + 1; exception when others then null; end;
  end loop;
  if cnt > 0 then lines := lines || to_jsonb('🔍 鑑定了 ' || cnt || ' 個物品'); end if;

  -- 🤝 摸摸每個夥伴（不花食物）
  cnt := 0;
  for k in select jsonb_array_elements_text(st.companions) loop
    begin perform public.doom_pet(k, false); cnt := cnt + 1; exception when others then null; end;
  end loop;
  if cnt > 0 then lines := lines || to_jsonb('🤝 陪了 ' || cnt || ' 個夥伴'); end if;

  -- 🔧 基地太破就修
  select * into st from public.doom_state where user_id = u;
  if st.hp < 60 and st.parts >= 15 + v_keep then
    begin perform public.doom_repair(); lines := lines || to_jsonb('🔧 修了基地'::text); exception when others then null; end;
  end if;

  -- 🧭 遠征：領回來，再派空閒的夥伴去最好的地方
  cnt := 0;
  for e in select x2.id from public.doom_expeditions x2 where x2.user_id = u and x2.claimed_at is null and now() >= public.doom_exp_end(x2) loop
    begin perform public.doom_exp_claim(e.id); cnt := cnt + 1; exception when others then null; end;
  end loop;
  if cnt > 0 then lines := lines || to_jsonb('🧭 ' || cnt || ' 支遠征隊回來了'); end if;
  cnt := 0;
  <<sendloop>>
  for k in select t.cid from jsonb_array_elements_text(st.companions) as t(cid)
      where not exists (select 1 from public.doom_expeditions x3 where x3.user_id = u and x3.claimed_at is null and x3.companion = t.cid)
      order by coalesce((st.bond->>t.cid)::int, 0) desc loop
    select * into st from public.doom_state where user_id = u;
    best := null;
    for c in select el from jsonb_array_elements(cc->'dests') el where public.doom_city_lv(st) >= (el->>'city')::int
        order by (el->>'city')::int desc loop
      if coalesce((c->'cost'->>'food')::int, 0) + v_keep <= st.food and coalesce((c->'cost'->>'water')::int, 0) + v_keep <= st.water
         and coalesce((c->'cost'->>'parts')::int, 0) + v_keep <= st.parts then best := c; exit; end if;
    end loop;
    exit sendloop when best is null;
    begin
      perform public.doom_exp_start(best->>'id', k);
      cnt := cnt + 1;
    exception when others then exit sendloop;
    end;
  end loop;
  if cnt > 0 then lines := lines || to_jsonb('🧭 派出 ' || cnt || ' 支遠征隊'); end if;

  -- 🌾 農場：收成，再把每一區的空格種滿（挑倉庫最少、又用得到的）
  begin
    perform public.doom_farm_harvest();
    lines := lines || to_jsonb('🧺 農場收成了'::text);
  exception when others then null; end;
  select * into st from public.doom_state where user_id = u;
  lvrow := fcat->'levels'->((st.dfarm->>'lv')::int - 1);
  planted := '{}'::jsonb;
  for a in select el from jsonb_array_elements(fcat->'areas') el loop
    cap := coalesce((lvrow->>(a->>'cap'))::int, 0);
    select count(*) into used from jsonb_array_elements(coalesce(st.dfarm->'plots', '[]'::jsonb)) p where public.doom_farm_area(p->>'crop') = a->>'id';
    free := cap - used;
    for i in 1..greatest(free, 0) loop
      select * into st from public.doom_state where user_id = u;
      best := null; bscore := null;
      for c in select el from jsonb_array_elements(fcat->'crops') el
          where coalesce(el->>'a', 'field') = a->>'id' and coalesce(el->>'g', '') <> 'goods' and (el->>'lv')::int <= (st.dfarm->>'lv')::int loop
        cost := greatest(1, coalesce((c->>'feed')::int, (c->>'water')::int, 1)) * case when c ? 'keep' then 3 else 1 end;
        have := case when c ? 'feed' then st.food else st.water end;
        continue when have - cost < v_keep;
        -- 分數越低越先種：倉庫存量（算上這次已經種的），用不到的作物往後排，等級高的優先
        sc := public.doom_farm_have(st, c->>'id') + coalesce((planted->>(c->>'id'))::int, 0) * (c->>'yield')::int
          + case when exists (select 1 from jsonb_array_elements(fcat->'recipes') r where r->'need' ? (c->>'id')) then 0 else 1000 end
          - (c->>'lv')::int * 0.5;
        if bscore is null or sc < bscore then best := c; bscore := sc; end if;
      end loop;
      exit when best is null;
      begin
        perform public.doom_farm_plant(best->>'id', 1);
        planted := planted || jsonb_build_object(best->>'id', coalesce((planted->>(best->>'id'))::int, 0) + 1);
      exception when others then exit;
      end;
    end loop;
  end loop;
  if planted <> '{}'::jsonb then
    select string_agg(coalesce((select el->>'name' from jsonb_array_elements(fcat->'crops') el where el->>'id' = key), key) || '×' || value, '、')
      into names from jsonb_each_text(planted);
    lines := lines || to_jsonb('🌱 種／養了：' || names);
  end if;

  -- 🍳 廚房：空的爐子做「現在做得出來、稀有度最高」的菜（一次最多 5 份）
  names := null;
  begin perform public.doom_farm_collect(u); exception when others then null; end;
  loop
    select * into st from public.doom_state where user_id = u;
    lvrow := fcat->'levels'->((st.dfarm->>'lv')::int - 1);
    stoves := jsonb_array_length(coalesce(st.dfarm->'stoves', '[]'::jsonb));
    exit when stoves >= (lvrow->>'stoves')::int;
    best := null; maxn := 0;
    for c in select r from jsonb_array_elements(fcat->'recipes') r
        left join lateral (select el from jsonb_array_elements(food->'items') el where el->>'id' = r->>'out') f on true
        where (r->>'lv')::int <= (st.dfarm->>'lv')::int
        order by case when r ? 'ing' then 0 else 1 end desc, position(coalesce(f.el->>'t', 'c') in 'crlxs') desc, (r->>'lv')::int desc loop
      n := 5;
      for k, v in select key, value::int from jsonb_each_text(c->'need') loop
        n := least(n, public.doom_farm_have(st, k) / v);
      end loop;
      for k, v in select key, value::int from jsonb_each_text(coalesce(c->'res', '{}'::jsonb)) loop
        n := least(n, greatest(0, (case k when 'food' then st.food when 'water' then st.water else 0 end) - v_keep) / v);
      end loop;
      if n >= 1 then best := c; maxn := n; exit; end if;
    end loop;
    exit when best is null;
    begin
      perform public.doom_farm_cook(best->>'out', maxn);
      names := coalesce(names || '、', '') || coalesce((select el->>'name' from jsonb_array_elements(food->'items') el where el->>'id' = best->>'out'),
        (select el->>'name' from jsonb_array_elements(fcat->'crops') el where el->>'id' = best->>'out'), best->>'out') || '×' || maxn;
    exception when others then exit;
    end;
  end loop;
  if names is not null then lines := lines || to_jsonb('🍳 開始做：' || names); end if;

  -- 🏗️ 建設（留安全庫存）
  if coalesce((o->>'build')::boolean, true) then
    select * into st from public.doom_state where user_id = u;
    nx := fcat->'levels'->((st.dfarm->>'lv')::int);
    if nx is not null and nx ? 'cost'
       and st.food - coalesce((nx->'cost'->>'food')::int, 0) >= v_keep and st.water - coalesce((nx->'cost'->>'water')::int, 0) >= v_keep
       and st.parts - coalesce((nx->'cost'->>'parts')::int, 0) >= v_keep and st.cores >= coalesce((nx->'cost'->>'cores')::int, 0) then
      begin perform public.doom_farm_upgrade(); lines := lines || to_jsonb('🌾 農場升級了'::text); exception when others then null; end;
    end if;
    -- 城市工程：挑最便宜的一個
    select * into st from public.doom_state where user_id = u;
    best := null; bscore := null;
    for c in select el from jsonb_array_elements(cc->'projects') el
        where public.doom_city_lv(st) >= (el->>'lv')::int and public.doom_proj(st, el->>'id') < 3 loop
      x := c->'stages'->public.doom_proj(st, c->>'id');
      continue when st.survivors < (x->>'need')::int;
      continue when st.food - coalesce((x->'cost'->>'food')::int, 0) < v_keep or st.water - coalesce((x->'cost'->>'water')::int, 0) < v_keep
        or st.parts - coalesce((x->'cost'->>'parts')::int, 0) < v_keep;
      sc := coalesce((x->'cost'->>'food')::int, 0) + coalesce((x->'cost'->>'water')::int, 0) + coalesce((x->'cost'->>'parts')::int, 0);
      if bscore is null or sc < bscore then best := c; bscore := sc; end if;
    end loop;
    if best is not null then
      begin perform public.doom_build_project(best->>'id'); lines := lines || to_jsonb('🏙️ 蓋了' || (best->>'name')); exception when others then null; end;
    end if;
    -- 基地設施：等級最低的先升，最多 2 次
    cnt := 0; names := null;
    for i in 1..2 loop
      select * into st from public.doom_state where user_id = u;
      best := null;
      for c in select el from jsonb_array_elements(cat->'facilities') el
          order by coalesce((st.facilities->>(el->>'id'))::int, 0), random() loop
        x := public.doom_build_cost(u, c->>'id');
        continue when (x->>'lv')::int >= 10;
        if st.parts - (x->>'parts')::int >= v_keep and st.food - (x->>'food')::int >= v_keep then best := c; exit; end if;
      end loop;
      exit when best is null;
      begin perform public.doom_build(best->>'id'); names := coalesce(names || '、', '') || (best->>'name'); exception when others then exit; end;
    end loop;
    if names is not null then lines := lines || to_jsonb('🏚️ 升級了：' || names); end if;
    -- 異能：最便宜的一個（精核留 10 顆）
    select * into st from public.doom_state where user_id = u;
    best := null; bscore := null;
    for c in select el from jsonb_array_elements(public.doom_power_cat()->'powers') el loop
      continue when public.doom_pw(st, c->>'id') >= 10;
      sc := public.doom_pw_cost(public.doom_pw(st, c->>'id'));
      if st.cores - sc >= 10 and (bscore is null or sc < bscore) then best := c; bscore := sc; end if;
    end loop;
    if best is not null then
      begin perform public.doom_power_up(best->>'id'); lines := lines || to_jsonb('⚡ ' || (best->>'name') || '升級了'); exception when others then null; end;
    end if;
  end if;

  -- 🎟️ 抽獎（要打開才會用）
  if coalesce((o->>'draw')::boolean, false) then
    cnt := 0;
    for i in 1..10 loop
      select * into st from public.doom_state where user_id = u;
      exit when st.scav < 1;
      begin perform public.doom_draw(case when st.scav >= 10 then 10 else 1 end); cnt := cnt + case when st.scav >= 10 then 10 else 1 end;
      exception when others then exit; end;
    end loop;
    if cnt > 0 then lines := lines || to_jsonb('🎟️ 用掉 ' || cnt || ' 張搜刮券'); end if;
  end if;

  if jsonb_array_length(lines) = 0 then lines := lines || to_jsonb('今天該做的都做完了，沒有新的事'::text); end if;
  update public.doom_state set auto_last = jsonb_build_object('at', now(), 'lines', lines) where user_id = u;
  return lines;
end;
$function$;
revoke all on function public.doom_auto_do(uuid, jsonb) from public, authenticated, anon;

-- 按鈕：一鍵自動處理
create or replace function public.doom_auto()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); o jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_ensure(u);
  select auto into o from public.doom_state where user_id = u;
  return json_build_object('lines', public.doom_auto_do(u, coalesce(o, '{}'::jsonb)));
end;
$function$;
grant execute on function public.doom_auto() to authenticated;

-- 設定：每天自動處理、要不要建設、要不要抽獎
create or replace function public.doom_auto_save(p jsonb)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); o jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_ensure(u);
  update public.doom_state set auto = auto || jsonb_strip_nulls(jsonb_build_object(
    'daily', (p->>'daily')::boolean, 'build', (p->>'build')::boolean, 'draw', (p->>'draw')::boolean))
    where user_id = u returning auto into o;
  return o::json;
end;
$function$;
grant execute on function public.doom_auto_save(jsonb) to authenticated;

-- 狀態裡帶上設定和上次的報告
create or replace function public.doom_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); gifts jsonb := '[]'::jsonb; st public.doom_state%rowtype;
begin
  if u is not null then
    perform public.doom_ensure(u);
    gifts := public.doom_buddy_daily(u);
  end if;
  select * into st from public.doom_state where user_id = u;
  return (public.doom_status_base()::jsonb || jsonb_build_object('buddy_gifts', gifts, 'auto', coalesce(st.auto, '{}'::jsonb), 'auto_last', st.auto_last))::json;
end;
$function$;
grant execute on function public.doom_status() to authenticated;

-- 排程用：幫打開「每天自動處理」的人跑
create or replace function public.doom_auto_cron()
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare r record; n integer := 0;
begin
  for r in select user_id, auto from public.doom_state where coalesce((auto->>'daily')::boolean, false) loop
    begin
      perform public.doom_auto_do(r.user_id, r.auto);
      n := n + 1;
    exception when others then null;
    end;
  end loop;
  return n;
end;
$function$;
revoke all on function public.doom_auto_cron() from public, authenticated, anon;

-- 每 3 小時跑一次（台北時間 0:17、3:17、6:17…）
do $do$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'doom-auto';
    perform cron.schedule('doom-auto', '17 */3 * * *', 'select public.doom_auto_cron()');
  end if;
end $do$;
