-- =========================================================
-- 序光計畫：☢️ 末世：🌾 末世農場＋🍳 廚房
-- 要先執行末世的其他檔（末世、專注搜刮、擴充、城市、美食、異能）。可以重複執行。
--
--   農場等級 Lv1～10：每升一級多一塊田（Lv1 有 3 塊、Lv10 有 12 塊），解鎖新作物、新食譜、多一個爐子
--   種作物用水；時間到就能收。蔬菜穀物收進「作物倉庫」，水果直接收進食物櫃
--   廚房：用作物（有些還要一點食物、水）做出食物櫃裡的美食，做好自動放進食物櫃
--   當天專注滿 60 分鐘：收成多 1 份（專注越多，農場越豐收）
-- =========================================================

alter table public.doom_state
  add column if not exists dfarm jsonb not null default '{"lv":1,"plots":[],"stoves":[]}'::jsonb,
  add column if not exists dcrops jsonb not null default '{}'::jsonb;

create or replace function public.doom_farm_cat()
returns jsonb language sql immutable
as $function$
select $json${
"levels": [
  {"lv":1,"plots":3,"stoves":1},
  {"lv":2,"plots":4,"stoves":1,"cost":{"parts":30,"food":15,"cores":10}},
  {"lv":3,"plots":5,"stoves":2,"cost":{"parts":60,"food":30,"cores":25}},
  {"lv":4,"plots":6,"stoves":2,"cost":{"parts":100,"food":50,"cores":45}},
  {"lv":5,"plots":7,"stoves":2,"cost":{"parts":150,"food":75,"cores":70}},
  {"lv":6,"plots":8,"stoves":3,"cost":{"parts":210,"food":100,"cores":100}},
  {"lv":7,"plots":9,"stoves":3,"cost":{"parts":280,"food":130,"cores":140}},
  {"lv":8,"plots":10,"stoves":3,"cost":{"parts":360,"food":160,"cores":190}},
  {"lv":9,"plots":11,"stoves":4,"cost":{"parts":450,"food":200,"cores":250}},
  {"lv":10,"plots":12,"stoves":4,"cost":{"parts":550,"food":250,"cores":320}}
],
"crops": [
  {"id":"potato","name":"馬鈴薯","emoji":"🥔","lv":1,"min":30,"yield":3,"water":2},
  {"id":"wheat","name":"小麥","emoji":"🌾","lv":1,"min":30,"yield":3,"water":2},
  {"id":"rice","name":"稻米","emoji":"🌾","lv":1,"min":40,"yield":3,"water":3},
  {"id":"scallion","name":"青蔥","emoji":"🧅","lv":1,"min":20,"yield":3,"water":1},
  {"id":"corn","name":"玉米","emoji":"🌽","lv":2,"min":45,"yield":3,"water":2},
  {"id":"cabbage","name":"高麗菜","emoji":"🥬","lv":2,"min":40,"yield":2,"water":2},
  {"id":"carrot","name":"紅蘿蔔","emoji":"🥕","lv":2,"min":35,"yield":3,"water":2},
  {"id":"apple","name":"蘋果樹","emoji":"🍎","lv":2,"min":90,"yield":2,"water":3,"fruit":"apple"},
  {"id":"tomato","name":"番茄","emoji":"🍅","lv":3,"min":50,"yield":3,"water":2},
  {"id":"soybean","name":"大豆","emoji":"🫘","lv":3,"min":60,"yield":3,"water":2},
  {"id":"banana","name":"香蕉樹","emoji":"🍌","lv":3,"min":90,"yield":2,"water":3,"fruit":"banana"},
  {"id":"orange","name":"橘子樹","emoji":"🍊","lv":3,"min":100,"yield":2,"water":3,"fruit":"orange"},
  {"id":"sugarcane","name":"甘蔗","emoji":"🎋","lv":4,"min":60,"yield":3,"water":3},
  {"id":"chili","name":"辣椒","emoji":"🌶️","lv":4,"min":45,"yield":3,"water":2},
  {"id":"strawberry","name":"草莓","emoji":"🍓","lv":4,"min":120,"yield":2,"water":3,"fruit":"strawberry"},
  {"id":"tea","name":"茶樹","emoji":"🍃","lv":5,"min":90,"yield":3,"water":2},
  {"id":"ginger","name":"薑","emoji":"🫚","lv":5,"min":60,"yield":3,"water":2},
  {"id":"mango","name":"芒果樹","emoji":"🥭","lv":5,"min":150,"yield":2,"water":4,"fruit":"mango"},
  {"id":"coffee","name":"咖啡樹","emoji":"☕","lv":6,"min":120,"yield":3,"water":3},
  {"id":"watermelon","name":"西瓜","emoji":"🍉","lv":6,"min":180,"yield":1,"water":5,"fruit":"watermelon"},
  {"id":"cocoa","name":"可可樹","emoji":"🍫","lv":7,"min":150,"yield":3,"water":3},
  {"id":"grape","name":"葡萄藤","emoji":"🍇","lv":8,"min":240,"yield":1,"water":4,"fruit":"grapes"},
  {"id":"peach","name":"仙桃樹","emoji":"🍑","lv":10,"min":720,"yield":1,"water":10,"fruit":"goldpeach"}
],
"recipes": [
  {"out":"onigiri","lv":1,"min":10,"need":{"rice":2}},
  {"out":"toast","lv":1,"min":10,"need":{"wheat":2}},
  {"out":"porridge","lv":1,"min":10,"need":{"rice":1},"res":{"water":2}},
  {"out":"friedrice","lv":1,"min":15,"need":{"rice":2,"scallion":1}},
  {"out":"bagel","lv":2,"min":15,"need":{"wheat":2,"scallion":1}},
  {"out":"popcorn","lv":2,"min":10,"need":{"corn":2}},
  {"out":"cornsoup","lv":2,"min":20,"need":{"corn":2,"potato":1},"res":{"water":2}},
  {"out":"potsticker","lv":2,"min":20,"need":{"wheat":2,"cabbage":1,"scallion":1}},
  {"out":"curry","lv":3,"min":30,"need":{"rice":2,"potato":1,"carrot":1},"res":{"food":3}},
  {"out":"lurou","lv":3,"min":30,"need":{"rice":2,"soybean":1},"res":{"food":4}},
  {"out":"beans","lv":3,"min":15,"need":{"soybean":2,"tomato":1}},
  {"out":"oj","lv":3,"min":10,"need":{"orange":2},"fruitneed":true},
  {"out":"beefnoodle","lv":4,"min":40,"need":{"wheat":2,"tomato":1,"scallion":1},"res":{"food":6}},
  {"out":"spicynoodle","lv":4,"min":15,"need":{"wheat":2,"chili":1}},
  {"out":"cookie","lv":4,"min":20,"need":{"wheat":1,"sugarcane":1}},
  {"out":"pudding","lv":4,"min":25,"need":{"sugarcane":1},"res":{"food":3,"water":1}},
  {"out":"lemontea","lv":5,"min":10,"need":{"tea":1,"sugarcane":1},"res":{"water":1}},
  {"out":"greentea","lv":5,"min":10,"need":{"tea":1},"res":{"water":1}},
  {"out":"gingertea","lv":5,"min":15,"need":{"ginger":1,"sugarcane":1},"res":{"water":1}},
  {"out":"croissant","lv":5,"min":30,"need":{"wheat":3},"res":{"food":2}},
  {"out":"donut","lv":5,"min":25,"need":{"wheat":2,"sugarcane":1}},
  {"out":"hotpot","lv":5,"min":40,"need":{"cabbage":1,"chili":1,"tomato":1},"res":{"food":5}},
  {"out":"coffee","lv":6,"min":10,"need":{"coffee":1},"res":{"water":1}},
  {"out":"latte","lv":6,"min":15,"need":{"coffee":1},"res":{"food":2,"water":1}},
  {"out":"icecream","lv":6,"min":30,"need":{"sugarcane":1,"strawberry":1},"res":{"water":2},"fruitneed":true},
  {"out":"pizza","lv":6,"min":45,"need":{"wheat":2,"tomato":2},"res":{"food":4}},
  {"out":"ramen","lv":6,"min":60,"need":{"wheat":3,"scallion":1,"soybean":1},"res":{"food":8}},
  {"out":"bubbletea","lv":7,"min":20,"need":{"tea":1,"sugarcane":1,"potato":1},"res":{"food":2}},
  {"out":"cocoa","lv":7,"min":15,"need":{"cocoa":1,"sugarcane":1},"res":{"food":1}},
  {"out":"smoothie","lv":7,"min":20,"need":{"strawberry":1,"mango":1,"banana":1},"fruitneed":true},
  {"out":"honeycake","lv":7,"min":45,"need":{"wheat":2,"sugarcane":2},"res":{"food":2}},
  {"out":"macaron","lv":8,"min":50,"need":{"wheat":1,"sugarcane":2,"strawberry":1},"fruitneed":true},
  {"out":"cheesecake","lv":8,"min":60,"need":{"wheat":2,"sugarcane":1,"strawberry":1},"res":{"food":5},"fruitneed":true},
  {"out":"chocobox","lv":9,"min":90,"need":{"cocoa":3,"sugarcane":2}},
  {"out":"grandmasoup","lv":9,"min":120,"need":{"ginger":1,"carrot":1,"scallion":1},"res":{"food":10,"water":5}},
  {"out":"feast","lv":10,"min":240,"need":{"rice":5,"cabbage":2,"tomato":2,"ginger":2,"cocoa":1},"res":{"food":40,"water":20}}
]
}$json$::jsonb
$function$;
grant execute on function public.doom_farm_cat() to authenticated;

-- 某樣東西有幾個：作物看作物倉庫，水果（fruitneed 的食譜）看食物櫃
create or replace function public.doom_farm_have(st public.doom_state, p_id text)
returns integer language sql immutable
as $function$
  select coalesce((st.dcrops->>p_id)::int, 0)
    + coalesce((st.pantry->>(case p_id when 'grape' then 'grapes' when 'peach' then 'goldpeach' else p_id end))::int, 0)
      * (case when p_id in ('apple', 'banana', 'orange', 'strawberry', 'mango', 'watermelon', 'grape', 'peach') then 1 else 0 end);
$function$;

-- 做好的料理放進食物櫃
create or replace function public.doom_farm_collect(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare st public.doom_state%rowtype; s jsonb; keep jsonb := '[]'::jsonb; got jsonb := '[]'::jsonb; now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select * into st from public.doom_state where user_id = u for update;
  for s in select x from jsonb_array_elements(coalesce(st.dfarm->'stoves', '[]'::jsonb)) x loop
    if (s->>'t1')::bigint <= now_ms then
      perform public.doom_pantry_add(u, s->>'out', (s->>'n')::int);
      got := got || jsonb_build_object('id', s->>'out', 'n', (s->>'n')::int);
    else keep := keep || s; end if;
  end loop;
  if jsonb_array_length(got) > 0 then
    update public.doom_state set dfarm = jsonb_set(dfarm, '{stoves}', keep) where user_id = u;
  end if;
  return got;
end;
$function$;
revoke all on function public.doom_farm_collect(uuid) from public, authenticated, anon;

create or replace function public.doom_farm_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); st public.doom_state%rowtype; got jsonb; fmin integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_ensure(u);
  got := public.doom_farm_collect(u);
  select * into st from public.doom_state where user_id = u;
  select coalesce(sum(duration_seconds), 0) / 60 into fmin from public.focus_sessions where user_id = u and session_date = public.app_today();
  return json_build_object('farm', st.dfarm, 'crops', st.dcrops, 'pantry', st.pantry, 'collected', got,
    'res', jsonb_build_object('food', st.food, 'water', st.water, 'parts', st.parts, 'cores', st.cores),
    'focus_today', fmin, 'now', (extract(epoch from now()) * 1000)::bigint);
end;
$function$;
grant execute on function public.doom_farm_status() to authenticated;

-- 🌱 種：把作物種進 n 塊空田
create or replace function public.doom_farm_plant(p_crop text, p_n integer default 1)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  cat jsonb := public.doom_farm_cat();
  st public.doom_state%rowtype;
  c jsonb; lvrow jsonb; free integer; n integer; plots jsonb; i integer; now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  select el into c from jsonb_array_elements(cat->'crops') el where el->>'id' = p_crop;
  if c is null then raise exception '沒有這種作物'; end if;
  if (st.dfarm->>'lv')::int < (c->>'lv')::int then raise exception '農場 Lv% 才能種', c->>'lv'; end if;
  lvrow := cat->'levels'->((st.dfarm->>'lv')::int - 1);
  plots := coalesce(st.dfarm->'plots', '[]'::jsonb);
  free := (lvrow->>'plots')::int - jsonb_array_length(plots);
  n := least(greatest(1, coalesce(p_n, 1)), free, st.water / greatest(1, (c->>'water')::int));
  if free <= 0 then raise exception '田都種滿了'; end if;
  if n <= 0 then raise exception '水不夠（一塊要 % 份水）', c->>'water'; end if;
  for i in 1..n loop
    plots := plots || jsonb_build_object('crop', p_crop, 't0', now_ms, 't1', now_ms + (c->>'min')::bigint * 60000);
  end loop;
  update public.doom_state set water = water - n * (c->>'water')::int, dfarm = jsonb_set(dfarm, '{plots}', plots) where user_id = u;
  return json_build_object('n', n, 'crop', p_crop, 'water', n * (c->>'water')::int);
end;
$function$;
grant execute on function public.doom_farm_plant(text, integer) to authenticated;

-- 🧺 收：全部熟的一起收；今天專注滿 60 分鐘，每塊多 1 份
create or replace function public.doom_farm_harvest()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  cat jsonb := public.doom_farm_cat();
  st public.doom_state%rowtype;
  p jsonb; c jsonb; keep jsonb := '[]'::jsonb; got jsonb := '{}'::jsonb; q integer; bonus integer; fmin integer;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint; k text;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  select coalesce(sum(duration_seconds), 0) / 60 into fmin from public.focus_sessions where user_id = u and session_date = public.app_today();
  bonus := case when fmin >= 60 then 1 else 0 end;
  for p in select x from jsonb_array_elements(coalesce(st.dfarm->'plots', '[]'::jsonb)) x loop
    if (p->>'t1')::bigint > now_ms then keep := keep || p; continue; end if;
    select el into c from jsonb_array_elements(cat->'crops') el where el->>'id' = p->>'crop';
    q := (c->>'yield')::int + bonus;
    k := coalesce(c->>'fruit', c->>'id');
    got := got || jsonb_build_object(k, coalesce((got->>k)::int, 0) + q);
    if c ? 'fruit' then perform public.doom_pantry_add(u, c->>'fruit', q);
    else update public.doom_state set dcrops = dcrops || jsonb_build_object(c->>'id', coalesce((dcrops->>(c->>'id'))::int, 0) + q) where user_id = u; end if;
  end loop;
  if got = '{}'::jsonb then raise exception '還沒有熟的'; end if;
  update public.doom_state set dfarm = jsonb_set(dfarm, '{plots}', keep) where user_id = u;
  return json_build_object('got', got, 'bonus', bonus);
end;
$function$;
grant execute on function public.doom_farm_harvest() to authenticated;

-- ⬆️ 升級農場
create or replace function public.doom_farm_upgrade()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); cat jsonb := public.doom_farm_cat(); st public.doom_state%rowtype; lv integer; nx jsonb; cost jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  lv := (st.dfarm->>'lv')::int;
  if lv >= 10 then raise exception '農場已經滿級了'; end if;
  nx := cat->'levels'->lv; cost := nx->'cost';
  if st.cores < coalesce((cost->>'cores')::int, 0) then raise exception '精核不夠'; end if;
  if not public.doom_can_pay(st, cost - 'cores') then raise exception '物資不夠'; end if;
  perform public.doom_apply(u, public.doom_neg(cost - 'cores'), 'doom-farm-up:' || (lv + 1));
  update public.doom_state set cores = cores - coalesce((cost->>'cores')::int, 0), dfarm = jsonb_set(dfarm, '{lv}', to_jsonb(lv + 1)) where user_id = u;
  perform public.doom_log_add(u, 'farm', 'l', '末世農場升到 Lv' || (lv + 1) || '！');
  return json_build_object('lv', lv + 1);
end;
$function$;
grant execute on function public.doom_farm_upgrade() to authenticated;

-- 🍳 做菜：一個爐子做 n 份
create or replace function public.doom_farm_cook(p_out text, p_n integer default 1)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  cat jsonb := public.doom_farm_cat();
  st public.doom_state%rowtype;
  r jsonb; lvrow jsonb; n integer; k text; v int; maxn integer := 20; stoves jsonb; pk text;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_farm_collect(u);
  select * into st from public.doom_state where user_id = u for update;
  select el into r from jsonb_array_elements(cat->'recipes') el where el->>'out' = p_out;
  if r is null then raise exception '沒有這道食譜'; end if;
  if (st.dfarm->>'lv')::int < (r->>'lv')::int then raise exception '農場 Lv% 才會做', r->>'lv'; end if;
  lvrow := cat->'levels'->((st.dfarm->>'lv')::int - 1);
  stoves := coalesce(st.dfarm->'stoves', '[]'::jsonb);
  if jsonb_array_length(stoves) >= (lvrow->>'stoves')::int then raise exception '爐子都在用'; end if;
  for k, v in select key, value::int from jsonb_each_text(r->'need') loop
    maxn := least(maxn, public.doom_farm_have(st, k) / v);
  end loop;
  for k, v in select key, value::int from jsonb_each_text(coalesce(r->'res', '{}'::jsonb)) loop
    maxn := least(maxn, case k when 'food' then st.food when 'water' then st.water else 0 end / v);
  end loop;
  n := least(greatest(1, coalesce(p_n, 1)), maxn);
  if n <= 0 then raise exception '材料不夠'; end if;
  for k, v in select key, value::int from jsonb_each_text(r->'need') loop
    if coalesce((st.dcrops->>k)::int, 0) >= v * n then
      update public.doom_state set dcrops = dcrops || jsonb_build_object(k, (dcrops->>k)::int - v * n) where user_id = u;
    else
      pk := case k when 'grape' then 'grapes' when 'peach' then 'goldpeach' else k end;
      update public.doom_state set pantry = case when (pantry->>pk)::int <= v * n then pantry - pk else pantry || jsonb_build_object(pk, (pantry->>pk)::int - v * n) end where user_id = u;
    end if;
  end loop;
  if r ? 'res' then perform public.doom_apply(u, public.doom_neg((select jsonb_object_agg(key, value::int * n) from jsonb_each_text(r->'res'))), 'doom-cook:' || gen_random_uuid()); end if;
  stoves := stoves || jsonb_build_object('out', p_out, 'n', n, 't0', now_ms, 't1', now_ms + (r->>'min')::bigint * 60000 * n);
  update public.doom_state set dfarm = jsonb_set(dfarm, '{stoves}', stoves) where user_id = u;
  return json_build_object('out', p_out, 'n', n, 'min', (r->>'min')::int * n);
end;
$function$;
grant execute on function public.doom_farm_cook(text, integer) to authenticated;
