-- =========================================================
-- 序光計畫：☢️ 末世：⚡ 異能、🧟 喪屍、💠 精核、🏠 居民
-- 要先執行末世的其他檔（末世、專注搜刮、擴充、城市、美食）。可以重複執行。
--
--   專注搜刮時會殺喪屍：普通喪屍 1 顆精核、變異喪屍 3 顆、喪屍王 12 顆（專注滿 60 分才會遇到）
--   精核拿來升級 7 種異能（每種 Lv1～10）：火焰、雷電、木系、水系、金屬、精神、空間
--   住在基地的居民（倖存者）每人每天繳 1 顆精核當住宿費
--   居民每天會提出請求（食物、指定美食、藥品、物資），幫忙就付精核；不想幫可以拒絕，不會扣任何東西
--   食物櫃多了「藥品」一類（7 種），搜刮時撿得到，醫院、碉堡、軍事基地比較多
-- =========================================================

alter table public.doom_state
  add column if not exists cores integer not null default 0,
  add column if not exists kills integer not null default 0,
  add column if not exists zkills jsonb not null default '{}'::jsonb,
  add column if not exists powers jsonb not null default '{}'::jsonb,
  add column if not exists reqs jsonb not null default '[]'::jsonb,
  add column if not exists req_day date;

-- 美食目錄加上藥品（其他不變）
create or replace function public.doom_food_cat()
returns jsonb language sql immutable
as $function$
select $json${
"cats": [
  {"id":"staple","name":"主食","emoji":"🍚","zones":["market","night_market","subway"]},
  {"id":"can","name":"罐頭","emoji":"🥫","zones":["bunker","military","market"]},
  {"id":"instant","name":"即食","emoji":"🍜","zones":["subway","military","street"]},
  {"id":"bakery","name":"麵包烘焙","emoji":"🥐","zones":["market","street","library"]},
  {"id":"sweet","name":"零食甜點","emoji":"🍰","zones":["night_market","market","library"]},
  {"id":"fruit","name":"水果","emoji":"🍎","zones":["rooftop","market","waterworks"]},
  {"id":"meat","name":"熟食肉類","emoji":"🍗","zones":["night_market","military","hardware"]},
  {"id":"drink","name":"飲料","emoji":"🥤","zones":["market","waterworks","street"]},
  {"id":"hot","name":"熱飲","emoji":"☕","zones":["library","hospital","observatory"]},
  {"id":"rare","name":"珍品","emoji":"🌟","zones":["observatory","bunker","rooftop"]},
  {"id":"med","name":"藥品","emoji":"💊","zones":["hospital","bunker","military"]}
],
"effects": {
  "c":{"morale":3,"hp":0,"luck":0},
  "r":{"morale":5,"hp":3,"luck":1},
  "l":{"morale":8,"hp":5,"luck":3},
  "x":{"morale":12,"hp":8,"luck":5},
  "s":{"morale":18,"hp":12,"luck":8}
},
"items": [
  {"id":"onigiri","c":"staple","k":"food","t":"c","name":"鮭魚飯糰","emoji":"🍙","text":"包裝有點皺，裡面還是很香。"},
  {"id":"friedrice","c":"staple","k":"food","t":"c","name":"蛋炒飯","emoji":"🍳","text":"粒粒分明，吃得到鍋氣。"},
  {"id":"potsticker","c":"staple","k":"food","t":"c","name":"煎餃","emoji":"🥟","text":"底部煎得酥脆。"},
  {"id":"lurou","c":"staple","k":"food","t":"r","name":"滷肉飯","emoji":"🍚","text":"台灣的味道，吃了會想家。"},
  {"id":"curry","c":"staple","k":"food","t":"r","name":"咖哩飯","emoji":"🍛","text":"辣得剛剛好。"},
  {"id":"beefnoodle","c":"staple","k":"food","t":"r","name":"牛肉麵","emoji":"🍜","text":"湯頭熬了很久。"},
  {"id":"ramen","c":"staple","k":"food","t":"l","name":"豚骨拉麵","emoji":"🍥","text":"濃郁到喝完整碗湯。"},
  {"id":"sushi","c":"staple","k":"food","t":"x","name":"綜合壽司","emoji":"🍣","text":"末世裡還能吃到生魚片？"},

  {"id":"corned","c":"can","k":"food","t":"c","name":"鹹牛肉罐","emoji":"🥫","text":"鹹，但很下飯。"},
  {"id":"sardine","c":"can","k":"food","t":"c","name":"沙丁魚罐","emoji":"🐟","text":"整整齊齊排好的小魚。"},
  {"id":"beans","c":"can","k":"food","t":"c","name":"茄汁焗豆","emoji":"🫘","text":"甜甜鹹鹹。"},
  {"id":"cornsoup","c":"can","k":"food","t":"c","name":"玉米濃湯罐","emoji":"🌽","text":"加熱一下就暖起來。"},
  {"id":"currycan","c":"can","k":"food","t":"r","name":"咖哩雞罐","emoji":"🍲","text":"配什麼都好吃。"},
  {"id":"crabcan","c":"can","k":"food","t":"l","name":"蟹肉罐","emoji":"🦀","text":"高級罐頭，捨不得吃。"},

  {"id":"cupnoodle","c":"instant","k":"food","t":"c","name":"杯麵","emoji":"🍜","text":"三分鐘的幸福。"},
  {"id":"spicynoodle","c":"instant","k":"food","t":"c","name":"辣味泡麵","emoji":"🌶️","text":"辣到流汗，但停不下來。"},
  {"id":"porridge","c":"instant","k":"food","t":"c","name":"即食粥","emoji":"🥣","text":"生病的時候最需要它。"},
  {"id":"hotpot","c":"instant","k":"food","t":"r","name":"自熱火鍋","emoji":"🫕","text":"倒水就會自己冒煙。"},
  {"id":"mre","c":"instant","k":"food","t":"r","name":"軍用即食餐","emoji":"🎖️","text":"熱量很高，夠撐一整天。"},
  {"id":"hotbento","c":"instant","k":"food","t":"l","name":"自熱便當","emoji":"🍱","text":"有飯有菜有肉。"},

  {"id":"toast","c":"bakery","k":"food","t":"c","name":"厚片吐司","emoji":"🍞","text":"塗上奶油剛剛好。"},
  {"id":"bagel","c":"bakery","k":"food","t":"c","name":"貝果","emoji":"🥯","text":"很有嚼勁。"},
  {"id":"croissant","c":"bakery","k":"food","t":"r","name":"可頌","emoji":"🥐","text":"一層一層酥到掉屑。"},
  {"id":"donut","c":"bakery","k":"food","t":"r","name":"甜甜圈","emoji":"🍩","text":"糖霜還是粉紅色的。"},
  {"id":"pizza","c":"bakery","k":"food","t":"l","name":"披薩","emoji":"🍕","text":"起司拉得好長。"},
  {"id":"cheesecake","c":"bakery","k":"food","t":"x","name":"起司蛋糕","emoji":"🍰","text":"濃郁綿密。"},

  {"id":"cookie","c":"sweet","k":"food","t":"c","name":"巧克力餅乾","emoji":"🍪","text":"一片接一片。"},
  {"id":"popcorn","c":"sweet","k":"food","t":"c","name":"爆米花","emoji":"🍿","text":"少了電影院，還是好吃。"},
  {"id":"gummy","c":"sweet","k":"food","t":"c","name":"小熊軟糖","emoji":"🐻","text":"五顏六色的小熊。"},
  {"id":"pudding","c":"sweet","k":"food","t":"r","name":"雞蛋布丁","emoji":"🍮","text":"焦糖的部分最好吃。"},
  {"id":"icecream","c":"sweet","k":"food","t":"r","name":"冰淇淋","emoji":"🍦","text":"找到還沒融化的，運氣真好。"},
  {"id":"macaron","c":"sweet","k":"food","t":"l","name":"馬卡龍","emoji":"🧁","text":"小小一顆，好精緻。"},
  {"id":"honeycake","c":"sweet","k":"food","t":"l","name":"蜂蜜蛋糕","emoji":"🍯","text":"鬆軟又香甜。"},
  {"id":"chocobox","c":"sweet","k":"food","t":"x","name":"巧克力禮盒","emoji":"🎁","text":"一整盒，每顆口味都不一樣。"},

  {"id":"apple","c":"fruit","k":"food","t":"c","name":"蘋果","emoji":"🍎","text":"一天一蘋果。"},
  {"id":"banana","c":"fruit","k":"food","t":"c","name":"香蕉","emoji":"🍌","text":"補充體力最快。"},
  {"id":"orange","c":"fruit","k":"food","t":"c","name":"橘子","emoji":"🍊","text":"剝開滿手香。"},
  {"id":"strawberry","c":"fruit","k":"food","t":"r","name":"草莓","emoji":"🍓","text":"酸酸甜甜。"},
  {"id":"mango","c":"fruit","k":"food","t":"r","name":"芒果","emoji":"🥭","text":"夏天的味道。"},
  {"id":"watermelon","c":"fruit","k":"food","t":"r","name":"西瓜","emoji":"🍉","text":"一大顆，大家一起分。"},
  {"id":"grapes","c":"fruit","k":"food","t":"l","name":"巨峰葡萄","emoji":"🍇","text":"一串都是大顆的。"},
  {"id":"goldpeach","c":"fruit","k":"food","t":"s","name":"金色仙桃","emoji":"🍑","text":"傳說吃了會帶來好運。"},

  {"id":"sausage","c":"meat","k":"food","t":"c","name":"烤香腸","emoji":"🌭","text":"夜市的靈魂。"},
  {"id":"friedchicken","c":"meat","k":"food","t":"r","name":"炸雞","emoji":"🍗","text":"外酥內嫩。"},
  {"id":"skewer","c":"meat","k":"food","t":"r","name":"烤肉串","emoji":"🍢","text":"刷上醬汁再烤一下。"},
  {"id":"steak","c":"meat","k":"food","t":"l","name":"牛排","emoji":"🥩","text":"七分熟，剛剛好。"},
  {"id":"roastduck","c":"meat","k":"food","t":"x","name":"烤鴨","emoji":"🦆","text":"皮脆到會發出聲音。"},

  {"id":"mineral","c":"drink","k":"drink","t":"c","name":"冰礦泉水","emoji":"💧","text":"冰涼透心。"},
  {"id":"cola","c":"drink","k":"drink","t":"c","name":"可樂","emoji":"🥤","text":"氣泡還很足。"},
  {"id":"oj","c":"drink","k":"drink","t":"c","name":"柳橙汁","emoji":"🧃","text":"滿滿維他命 C。"},
  {"id":"lemontea","c":"drink","k":"drink","t":"c","name":"檸檬紅茶","emoji":"🍋","text":"古早味。"},
  {"id":"sportsdrink","c":"drink","k":"drink","t":"c","name":"運動飲料","emoji":"⚡","text":"流完汗最需要。"},
  {"id":"bubbletea","c":"drink","k":"drink","t":"r","name":"珍珠奶茶","emoji":"🧋","text":"珍珠 QQ 的。"},
  {"id":"coconut","c":"drink","k":"drink","t":"r","name":"椰子水","emoji":"🥥","text":"天然的運動飲料。"},
  {"id":"smoothie","c":"drink","k":"drink","t":"l","name":"綜合果昔","emoji":"🍹","text":"打得綿綿的。"},

  {"id":"coffee","c":"hot","k":"drink","t":"c","name":"黑咖啡","emoji":"☕","text":"讀書的好夥伴。"},
  {"id":"greentea","c":"hot","k":"drink","t":"c","name":"熱綠茶","emoji":"🍵","text":"清香回甘。"},
  {"id":"gingertea","c":"hot","k":"drink","t":"c","name":"黑糖薑茶","emoji":"🫚","text":"冷天喝最暖。"},
  {"id":"latte","c":"hot","k":"drink","t":"r","name":"拿鐵","emoji":"🥛","text":"奶泡上還有拉花。"},
  {"id":"cocoa","c":"hot","k":"drink","t":"r","name":"熱可可","emoji":"🍫","text":"上面漂著棉花糖。"},
  {"id":"honeylemon","c":"hot","k":"drink","t":"r","name":"蜂蜜檸檬","emoji":"🍯","text":"喉嚨痛的時候喝。"},

  {"id":"grandmasoup","c":"rare","k":"food","t":"x","name":"奶奶的雞湯","emoji":"🍲","text":"喝一口就想哭。"},
  {"id":"starsoda","c":"rare","k":"drink","t":"x","name":"星光汽水","emoji":"✨","text":"氣泡裡有小小的星星。"},
  {"id":"auroratea","c":"rare","k":"drink","t":"s","name":"極光花茶","emoji":"🌌","text":"顏色會一直變。"},
  {"id":"feast","c":"rare","k":"food","t":"s","name":"滿漢全席","emoji":"🏮","text":"末世裡最奢侈的一餐。"},

  {"id":"bandage","c":"med","k":"med","t":"c","name":"彈性繃帶","emoji":"🩹","text":"擦傷扭傷都用得到。"},
  {"id":"coldmed","c":"med","k":"med","t":"c","name":"感冒藥","emoji":"💊","text":"發燒咳嗽的救星。"},
  {"id":"vitamin","c":"med","k":"med","t":"c","name":"綜合維他命","emoji":"🧴","text":"每天一顆，保持健康。"},
  {"id":"painkiller","c":"med","k":"med","t":"r","name":"止痛藥","emoji":"💉","text":"頭痛牙痛都有效。"},
  {"id":"ointment","c":"med","k":"med","t":"r","name":"燙傷藥膏","emoji":"🫙","text":"清涼止痛。"},
  {"id":"antibiotic","c":"med","k":"med","t":"l","name":"抗生素","emoji":"🧪","text":"末世裡最珍貴的藥。"},
  {"id":"serum","c":"med","k":"med","t":"x","name":"抗病毒血清","emoji":"🧬","text":"據說能抵抗喪屍病毒。"}
]
}$json$::jsonb
$function$;

-- ---------- 📚 異能資料 ----------
create or replace function public.doom_power_cat()
returns jsonb language sql immutable
as $function$
select $json${
"powers": [
  {"id":"fire","name":"火焰異能","emoji":"🔥","desc":"專注搜刮時殺更多喪屍","per":"殺喪屍 +15%"},
  {"id":"thunder","name":"雷電異能","emoji":"⚡","desc":"運氣跟著電流一起跑","per":"幸運 +1"},
  {"id":"wood","name":"木系異能","emoji":"🌱","desc":"讓植物在廢墟裡長出來","per":"每天食物 +3；Lv5 起每天多一份水果"},
  {"id":"water","name":"水系異能","emoji":"💧","desc":"憑空凝聚乾淨的水","per":"每天水 +3"},
  {"id":"metal","name":"金屬異能","emoji":"🛡️","desc":"用金屬築起防線","per":"夜襲防禦 +10"},
  {"id":"mind","name":"精神異能","emoji":"👁️","desc":"感應到躲起來的倖存者","per":"救人機率 +5%、居民報酬 +10%"},
  {"id":"space","name":"空間異能","emoji":"🌀","desc":"縮短遠方的距離","per":"遠征時間 -6%"}
],
"max": 10,
"zombies": [
  {"id":"walker","name":"普通喪屍","emoji":"🧟","cores":1},
  {"id":"mutant","name":"變異喪屍","emoji":"🧟‍♂️","cores":3},
  {"id":"king","name":"喪屍王","emoji":"👹","cores":12}
],
"residents": [
  {"name":"王阿姨","emoji":"👵"},{"name":"小明","emoji":"🧒"},{"name":"老李","emoji":"👴"},{"name":"護士小美","emoji":"👩‍⚕️"},
  {"name":"工程師阿哲","emoji":"👷"},{"name":"學生小安","emoji":"🧑‍🎓"},{"name":"廚師阿忠","emoji":"👨‍🍳"},{"name":"獵人阿虎","emoji":"🧔"},
  {"name":"小花","emoji":"👧"},{"name":"老張","emoji":"🎖️"},{"name":"畫家小雨","emoji":"👩‍🎨"},{"name":"陳醫師","emoji":"🧑‍⚕️"},
  {"name":"阿土伯","emoji":"👨‍🌾"},{"name":"工程師小凱","emoji":"🧑‍💻"},{"name":"歌手小晴","emoji":"👩‍🎤"},{"name":"貓奴阿姨","emoji":"🐱"}
]
}$json$::jsonb
$function$;
grant execute on function public.doom_power_cat() to authenticated;

create or replace function public.doom_pw(st public.doom_state, p_id text)
returns integer language sql immutable
as $function$ select coalesce((st.powers->>p_id)::int, 0); $function$;

-- 升到下一級要幾個精核：Lv1 15、Lv2 45、Lv3 90 … Lv10 825
create or replace function public.doom_pw_cost(p_lv integer)
returns integer language sql immutable
as $function$ select 15 * (p_lv + 1) * (p_lv + 2) / 2; $function$;

create or replace function public.doom_pantry_add(u uuid, p_id text, p_n integer default 1)
returns void language sql security definer set search_path to 'public'
as $function$
  update public.doom_state set pantry = pantry || jsonb_build_object(p_id, coalesce((pantry->>p_id)::int, 0) + p_n)
  where user_id = u and p_id is not null;
$function$;
revoke all on function public.doom_pantry_add(uuid, text, integer) from public, authenticated, anon;


-- ---------- 🧟 專注搜刮時殺喪屍 ----------
create or replace function public.doom_zombies(u uuid, p_min integer)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  st public.doom_state%rowtype;
  walker integer; mutant integer := 0; king integer := 0; i integer; v_cores integer;
begin
  if p_min < 5 then return null; end if;
  select * into st from public.doom_state where user_id = u;
  walker := round(p_min / 5.0 * (0.6 + random() * 0.8) * (1 + 0.15 * public.doom_pw(st, 'fire')))::int;
  for i in 1..(p_min / 10) loop
    if random() < 0.12 + 0.01 * public.doom_pw(st, 'fire') then mutant := mutant + 1; end if;
  end loop;
  if p_min >= 60 and random() < least(0.6, 0.15 * p_min / 60.0) then king := 1; end if;
  v_cores := walker + mutant * 3 + king * 12;
  update public.doom_state set cores = cores + v_cores, kills = kills + walker + mutant + king,
    zkills = jsonb_build_object('walker', coalesce((zkills->>'walker')::int, 0) + walker,
                                'mutant', coalesce((zkills->>'mutant')::int, 0) + mutant,
                                'king', coalesce((zkills->>'king')::int, 0) + king)
    where user_id = u;
  if king > 0 then perform public.doom_log_add(u, 'zombie', 'x', '搜刮時遇到喪屍王，把牠打倒了！拿到 12 顆精核。'); end if;
  return jsonb_build_object('walker', walker, 'mutant', mutant, 'king', king, 'cores', v_cores);
end;
$function$;
revoke all on function public.doom_zombies(uuid, integer) from public, authenticated, anon;


-- ---------- ⬆️ 升級異能 ----------
create or replace function public.doom_power_up(p_id text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  st public.doom_state%rowtype;
  lv integer; cost integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  if not exists (select 1 from jsonb_array_elements(public.doom_power_cat()->'powers') p where p->>'id' = p_id) then raise exception '沒有這個異能'; end if;
  select * into st from public.doom_state where user_id = u for update;
  lv := public.doom_pw(st, p_id);
  if lv >= 10 then raise exception '已經滿級了'; end if;
  cost := public.doom_pw_cost(lv);
  if st.cores < cost then raise exception '精核不夠（要 % 顆，有 % 顆）', cost, st.cores; end if;
  update public.doom_state set cores = cores - cost, powers = powers || jsonb_build_object(p_id, lv + 1) where user_id = u;
  perform public.doom_log_add(u, 'power', case when lv + 1 >= 10 then 's' when lv + 1 >= 5 then 'x' else 'l' end,
    case when lv = 0 then '覺醒了' else '升級了' end || (select p->>'name' from jsonb_array_elements(public.doom_power_cat()->'powers') p where p->>'id' = p_id) || '（Lv' || (lv + 1) || '）！');
  return json_build_object('id', p_id, 'lv', lv + 1, 'cost', cost);
end;
$function$;
grant execute on function public.doom_power_up(text) to authenticated;


-- ---------- 🙋 居民的請求（每天換新；居民越多請求越多） ----------
create or replace function public.doom_req_make(u uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  st public.doom_state%rowtype;
  fc jsonb := public.doom_food_cat();
  pc jsonb := public.doom_power_cat();
  n integer; i integer; r jsonb; list jsonb := '[]'::jsonb;
  who jsonb; kind integer; it jsonb; c jsonb; qty integer; reward integer;
  mult numeric;
begin
  select * into st from public.doom_state where user_id = u;
  if st.req_day = public.app_today() then return; end if;
  n := least(4, case when st.survivors <= 0 then 0 else 1 + st.survivors / 3 end);
  mult := 1 + 0.1 * public.doom_pw(st, 'mind');
  for i in 1..n loop
    who := pc->'residents'->(floor(random() * jsonb_array_length(pc->'residents')))::int;
    kind := floor(random() * 4)::int;
    if kind = 0 then
      select el into c from jsonb_array_elements(fc->'cats') el where el->>'id' not in ('rare', 'med') order by random() limit 1;
      qty := 1 + floor(random() * 2)::int;
      reward := 6 * qty;
      r := jsonb_build_object('type', 'cat', 'cat', c->>'id', 'qty', qty,
        'text', '最近好想吃' || (c->>'name') || '類的東西…能分我 ' || qty || ' 份嗎？');
    elsif kind = 1 then
      select el into it from jsonb_array_elements(fc->'items') el where el->>'k' in ('food', 'drink') and el->>'t' in ('c', 'r') order by random() limit 1;
      qty := 1;
      reward := case it->>'t' when 'c' then 8 else 15 end;
      r := jsonb_build_object('type', 'item', 'id', it->>'id', 'qty', qty, 'text', '可以給我一份' || (it->>'name') || '嗎？我會付精核的！');
    elsif kind = 2 then
      select el into it from jsonb_array_elements(fc->'items') el where el->>'k' = 'med' and el->>'t' in ('c', 'r', 'l') order by random() limit 1;
      qty := 1;
      reward := case it->>'t' when 'c' then 10 when 'r' then 18 else 30 end;
      r := jsonb_build_object('type', 'item', 'id', it->>'id', 'qty', qty, 'text', '身體不太舒服…有' || (it->>'name') || '嗎？');
    else
      c := (array['{"food":20}', '{"water":20}', '{"parts":15}'])[1 + floor(random() * 3)::int]::jsonb;
      reward := 6;
      r := jsonb_build_object('type', 'res', 'cost', c,
        'text', case when c ? 'food' then '家裡快沒糧食了，能借 20 份食物嗎？' when c ? 'water' then '想跟你換 20 份水。' else '想修房子，需要 15 個零件。' end);
    end if;
    list := list || (r || jsonb_build_object('name', who->>'name', 'emoji', who->>'emoji', 'reward', round(reward * mult)::int, 'state', 'open'));
  end loop;
  update public.doom_state set reqs = list, req_day = public.app_today() where user_id = u;
end;
$function$;
revoke all on function public.doom_req_make(uuid) from public, authenticated, anon;

create or replace function public.doom_req_answer(p_i integer, p_accept boolean)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  st public.doom_state%rowtype;
  fc jsonb := public.doom_food_cat();
  r jsonb; need integer; e record; take integer; used jsonb := '[]'::jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  r := st.reqs->p_i;
  if r is null or r->>'state' <> 'open' then raise exception '這個請求已經處理過了'; end if;
  if not p_accept then
    update public.doom_state set reqs = jsonb_set(reqs, array[p_i::text, 'state'], '"no"') where user_id = u;
    return json_build_object('ok', true, 'accepted', false);
  end if;

  if r->>'type' = 'cat' then
    need := (r->>'qty')::int;
    -- 從那一類裡，先用最普通、最多的
    for e in select el->>'id' as id, (st.pantry->>(el->>'id'))::int as n from jsonb_array_elements(fc->'items') el
             where el->>'c' = r->>'cat' and coalesce((st.pantry->>(el->>'id'))::int, 0) > 0
             order by position(el->>'t' in 'crlxs'), (st.pantry->>(el->>'id'))::int desc loop
      exit when need <= 0;
      take := least(need, e.n);
      need := need - take;
      used := used || jsonb_build_object('id', e.id, 'n', take);
    end loop;
    if need > 0 then raise exception '食物櫃裡這一類的東西不夠'; end if;
  elsif r->>'type' = 'item' then
    if coalesce((st.pantry->>(r->>'id'))::int, 0) < (r->>'qty')::int then raise exception '食物櫃裡沒有這個'; end if;
    used := jsonb_build_array(jsonb_build_object('id', r->>'id', 'n', (r->>'qty')::int));
  else
    if not public.doom_can_pay(st, r->'cost') then raise exception '物資不夠'; end if;
    perform public.doom_apply(u, public.doom_neg(r->'cost'), 'doom-req-pay:' || gen_random_uuid());
  end if;

  for e in select x->>'id' as id, (x->>'n')::int as n from jsonb_array_elements(used) x loop
    update public.doom_state set pantry = case when (pantry->>e.id)::int <= e.n then pantry - e.id
      else pantry || jsonb_build_object(e.id, (pantry->>e.id)::int - e.n) end where user_id = u;
  end loop;
  update public.doom_state set cores = cores + (r->>'reward')::int,
    reqs = jsonb_set(reqs, array[p_i::text, 'state'], '"done"') where user_id = u;
  perform public.doom_apply(u, '{"morale":2}'::jsonb, 'doom-req:' || gen_random_uuid());
  perform public.doom_log_add(u, 'resident', null, (r->>'name') || '收到東西很開心，付了 ' || (r->>'reward') || ' 顆精核。');
  return json_build_object('ok', true, 'accepted', true, 'cores', (r->>'reward')::int, 'used', used);
end;
$function$;
grant execute on function public.doom_req_answer(integer, boolean) to authenticated;


-- ---------- ⚡ 異能頁的狀態 ----------
create or replace function public.doom_power_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); st public.doom_state%rowtype; notes jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_ensure(u);
  notes := public.doom_city_tick(u);
  perform public.doom_req_make(u);
  select * into st from public.doom_state where user_id = u;
  return json_build_object('cores', st.cores, 'kills', st.kills, 'zkills', st.zkills, 'powers', st.powers,
    'survivors', st.survivors, 'reqs', st.reqs, 'notes', notes,
    'costs', (select jsonb_agg(public.doom_pw_cost(i)) from generate_series(0, 9) i));
end;
$function$;
grant execute on function public.doom_power_status() to authenticated;


-- ---------- 🔗 把異能效果接上去（城市、遠征、救人、幸運、專注搜刮） ----------
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
      'food', 4 * public.doom_proj(st, 'greenhouse') + 3 * public.doom_pw(st, 'wood') - eat,
      'water', 4 * public.doom_proj(st, 'waterplant') + 3 * public.doom_pw(st, 'water') - drink,
      'parts', st.survivors / 3 + 4 * public.doom_proj(st, 'powerplant'),
      'hp', 5 * public.doom_proj(st, 'clinic'),
      'morale', 2 * public.doom_proj(st, 'clinic'),
      'stardust', 5 * public.doom_proj(st, 'lighthouse'),
      'scav', public.doom_proj(st, 'lighthouse'));
    applied := public.doom_apply(u, g, 'doom-city:' || d);
    -- 🏠 居民繳住宿費：每人每天 1 顆精核
    if st.survivors > 0 then
      update public.doom_state set cores = cores + st.survivors where user_id = u;
      applied := applied || jsonb_build_object('k', 'cores', 'n', st.survivors);
    end if;
    -- 🌱 木系 Lv5 起：每天多一份水果
    if public.doom_pw(st, 'wood') >= 5 then
      perform public.doom_pantry_add(u, (select el->>'id' from jsonb_array_elements(public.doom_food_cat()->'items') el
        where el->>'c' = 'fruit' and el->>'t' in ('c', 'r') order by random() limit 1));
    end if;
    if jsonb_array_length(applied) > 0 then
      notes := notes || jsonb_build_object('kind', 'city', 'title', '🏙️ 城市的一天（' || to_char(d, 'MM/DD') || '）', 'gains', applied);
    end if;

    -- 🌙 夜襲：第 3 天之後，每晚 30%
    if st.day_no >= 3 and random() < 0.30 then
      atk := 20 + (d - st.started_on) * 3 + floor(random() * 20)::int;
      def := 25 * public.doom_proj(st, 'citywall') + 8 * coalesce((st.facilities->>'wall')::int, 0) + st.survivors * 2 + 10 + 10 * public.doom_pw(st, 'metal');
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
    'defense', 25 * public.doom_proj(st, 'citywall') + 8 * coalesce((st.facilities->>'wall')::int, 0) + st.survivors * 2 + 10 + 10 * public.doom_pw(st, 'metal'),
    'threat', 20 + (public.app_today() - st.started_on) * 3,
    'raids', st.raids, 'crafted', st.crafted,
    'slots', 1 + public.doom_proj(st, 'radiotower'),
    'expeditions', exps, 'notes', notes,
    'res', jsonb_build_object('food', st.food, 'water', st.water, 'parts', st.parts, 'scav', st.scav),
    'companions', st.companions, 'trinkets', st.trinkets, 'now', now());
end;
$function$;

create or replace function public.doom_exp_end(e public.doom_expeditions)
returns timestamptz language sql stable security definer set search_path to 'public'
as $function$
  select greatest(e.started_at + interval '10 minutes',
    e.started_at + make_interval(secs => e.hours * 3600 * (1 - 0.06 * coalesce((select (s.powers->>'space')::int from public.doom_state s where s.user_id = e.user_id), 0))) - make_interval(secs => coalesce((
      select sum(f.duration_seconds) from public.focus_sessions f
      where f.user_id = e.user_id and f.ended_at > e.started_at), 0)));
$function$;

create or replace function public.doom_rescue(u uuid, p_minutes integer)
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare n integer := 0; p numeric := least(0.95, p_minutes / 120.0 + 0.05 * coalesce((select (powers->>'mind')::int from public.doom_state where user_id = u), 0));
begin
  if random() < p then n := 1; end if;
  if p_minutes >= 120 and random() < 0.35 then n := n + 1; end if;
  if n > 0 then update public.doom_state set survivors = survivors + n where user_id = u; end if;
  return n;
end;
$function$;

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
  l := l + coalesce((dd.meal->>'luck')::int, 0);
  l := l + public.doom_pw(st, 'thunder');
  return greatest(0, l);
end;
$function$;

create or replace function public.doom_run_claim(p_session bigint, p_zone text, p_drops integer default null)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  res jsonb;
  n integer;
  i integer;
  mins integer;
  pk jsonb := '[]'::jsonb;
  x jsonb;
  zb jsonb;
begin
  res := public.doom_run_claim_base(p_session, p_zone, p_drops)::jsonb;
  if u is null or coalesce((res->>'already')::boolean, false) or res ? 'rescued' then return res; end if;
  mins := coalesce((res->>'minutes')::int, 0);
  n := public.doom_rescue(u, mins);
  for i in 1..least(6, mins / 10) loop
    x := public.doom_pantry_roll(u, res->>'zone', 0.4);
    if x is not null then pk := pk || x; end if;
  end loop;
  zb := public.doom_zombies(u, mins);
  res := res || jsonb_build_object('rescued', n, 'pantry', pk, 'zombies', zb);
  update public.doom_runs set result = result || jsonb_build_object('rescued', n, 'pantry', pk, 'zombies', zb) where user_id = u and session_id = p_session;
  if n > 0 then perform public.doom_log_add(u, 'city', 'r', '搜刮時救回了 ' || n || ' 個倖存者，帶他們回城市。'); end if;
  return res;
end;
$function$;
revoke all on function public.doom_city_tick(uuid) from public, authenticated, anon;
revoke all on function public.doom_rescue(uuid, integer) from public, authenticated, anon;
revoke all on function public.doom_luck(uuid) from public, authenticated, anon;
grant execute on function public.doom_city_status() to authenticated;
grant execute on function public.doom_run_claim(bigint, text, integer) to authenticated;
