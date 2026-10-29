-- =========================================================
-- 序光計畫：☢️ 末世：🍱 美食物資（食物櫃）
-- 要先執行末世的其他檔（末世、專注搜刮、擴充、城市）。可以重複執行。
--
--   65 種美食，分 10 類：主食、罐頭、即食、麵包烘焙、零食甜點、水果、熟食肉類、飲料、熱飲、珍品
--   專注搜刮每 10 分鐘有 40% 機率撿到一份（一趟最多 6 份）；抽獎每張 35%
--   區域會影響撿到什麼：超市主食多、夜市熟食甜點多、天台水果多…
--   每天吃一餐：一份食物＋一份飲料，自己選；沒選的話過了這天系統幫你挑（只挑普通、精良裡最多的，稀有的不會被吃掉）
--   吃了有效果：士氣、基地、今天的幸運（稀有度越高越好）
--   原本的 🍞 食物、💧 水不受影響
-- =========================================================

alter table public.doom_state
  add column if not exists pantry jsonb not null default '{}'::jsonb,   -- {"curry":3}
  add column if not exists eaten jsonb not null default '{}'::jsonb;    -- 吃過幾次（收藏用）
alter table public.doom_days add column if not exists meal jsonb;       -- {"food":"curry","drink":"cola","auto":false,"luck":2}


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
  {"id":"rare","name":"珍品","emoji":"🌟","zones":["observatory","bunker","rooftop"]}
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
  {"id":"feast","c":"rare","k":"food","t":"s","name":"滿漢全席","emoji":"🏮","text":"末世裡最奢侈的一餐。"}
]
}$json$::jsonb
$function$;
grant execute on function public.doom_food_cat() to authenticated;


-- ---------- 🎲 撿到一份美食 ----------
create or replace function public.doom_pantry_roll(u uuid, p_zone text, p_chance numeric)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  cat jsonb := public.doom_food_cat();
  tier text;
  e jsonb := null;
  have integer;
begin
  if random() >= p_chance then return null; end if;
  tier := public.doom_roll_tier(public.doom_luck(u));
  if p_zone is not null and random() < 0.6 then
    select el into e from jsonb_array_elements(cat->'items') el
      where el->>'t' = tier and exists (select 1 from jsonb_array_elements(cat->'cats') c where c->>'id' = el->>'c' and c->'zones' ? p_zone)
      order by random() limit 1;
  end if;
  if e is null then select el into e from jsonb_array_elements(cat->'items') el where el->>'t' = tier order by random() limit 1; end if;
  if e is null then select el into e from jsonb_array_elements(cat->'items') el where el->>'t' = 'c' order by random() limit 1; end if;
  select coalesce((pantry->>(e->>'id'))::int, 0) into have from public.doom_state where user_id = u;
  update public.doom_state set pantry = pantry || jsonb_build_object(e->>'id', have + 1) where user_id = u;
  return jsonb_build_object('id', e->>'id', 'name', e->>'name', 'emoji', e->>'emoji', 'tier', e->>'t', 'new', have = 0
    and not exists (select 1 from public.doom_state where user_id = u and eaten ? (e->>'id')));
end;
$function$;
revoke all on function public.doom_pantry_roll(uuid, text, numeric) from public, authenticated, anon;


-- ---------- 🍽️ 吃一餐（選的，或是系統幫你挑的） ----------
create or replace function public.doom_meal_eat(u uuid, p_day date, p_food text, p_drink text, p_auto boolean)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  cat jsonb := public.doom_food_cat();
  st public.doom_state%rowtype;
  f jsonb; d jsonb;
  eff jsonb := '{}'::jsonb;
  mor integer := 0; hp integer := 0; luck integer := 0;
  e jsonb;
  applied jsonb;
  v_meal jsonb;
begin
  select * into st from public.doom_state where user_id = u for update;
  -- 系統挑：只挑普通、精良裡數量最多的（稀有以上留給你自己決定）
  if p_food is null then
    select el->>'id' into p_food from jsonb_array_elements(cat->'items') el
      where el->>'k' = 'food' and coalesce((st.pantry->>(el->>'id'))::int, 0) > 0 and el->>'t' in ('c', 'r')
      order by position(el->>'t' in 'crlxs'), (st.pantry->>(el->>'id'))::int desc limit 1;
  end if;
  if p_drink is null then
    select el->>'id' into p_drink from jsonb_array_elements(cat->'items') el
      where el->>'k' = 'drink' and coalesce((st.pantry->>(el->>'id'))::int, 0) > 0 and el->>'t' in ('c', 'r')
      order by position(el->>'t' in 'crlxs'), (st.pantry->>(el->>'id'))::int desc limit 1;
  end if;
  if p_food is null and p_drink is null then return null; end if;

  select el into f from jsonb_array_elements(cat->'items') el where el->>'id' = p_food and el->>'k' = 'food';
  select el into d from jsonb_array_elements(cat->'items') el where el->>'id' = p_drink and el->>'k' = 'drink';
  if p_food is not null and (f is null or coalesce((st.pantry->>p_food)::int, 0) < 1) then raise exception '食物櫃裡沒有這個食物'; end if;
  if p_drink is not null and (d is null or coalesce((st.pantry->>p_drink)::int, 0) < 1) then raise exception '食物櫃裡沒有這個飲料'; end if;

  for e in select x from (values (f), (d)) v(x) where x is not null loop
    eff := cat->'effects'->(e->>'t');
    mor := mor + (eff->>'morale')::int; hp := hp + (eff->>'hp')::int; luck := luck + (eff->>'luck')::int;
    update public.doom_state set
      pantry = case when (pantry->>(e->>'id'))::int <= 1 then pantry - (e->>'id') else pantry || jsonb_build_object(e->>'id', (pantry->>(e->>'id'))::int - 1) end,
      eaten = eaten || jsonb_build_object(e->>'id', coalesce((eaten->>(e->>'id'))::int, 0) + 1)
      where user_id = u;
  end loop;
  -- 一餐有吃有喝：再加士氣 2
  if f is not null and d is not null then mor := mor + 2; end if;

  applied := public.doom_apply(u, jsonb_build_object('morale', mor, 'hp', hp), 'doom-meal:' || p_day);
  v_meal := jsonb_build_object('food', p_food, 'drink', p_drink, 'auto', p_auto, 'luck', luck, 'gains', applied);
  update public.doom_days set meal = v_meal where user_id = u and day = p_day;
  perform public.doom_log_add(u, 'meal', case when luck >= 5 then 'x' when luck >= 3 then 'l' else null end,
    case when p_auto then '沒空選，隨便吃了' else '今天吃了' end
    || coalesce(f->>'name', '') || case when f is not null and d is not null then '配' else '' end || coalesce(d->>'name', '') || '。');
  return v_meal;
end;
$function$;
revoke all on function public.doom_meal_eat(uuid, date, text, text, boolean) from public, authenticated, anon;

-- 自己選今天的餐（一天一次）
create or replace function public.doom_meal_choose(p_food text, p_drink text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  today date := public.app_today();
  m jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_ensure(u);
  perform public.doom_day(u, today, true);
  if (select meal from public.doom_days where user_id = u and day = today) is not null then raise exception '今天已經吃過了'; end if;
  if nullif(p_food, '') is null and nullif(p_drink, '') is null then raise exception '至少選一樣'; end if;
  m := public.doom_meal_eat(u, today, nullif(p_food, ''), nullif(p_drink, ''), false);
  if nullif(p_food, '') is null or nullif(p_drink, '') is null then
    -- 只選一樣：另一樣不吃
    null;
  end if;
  return m;
end;
$function$;
grant execute on function public.doom_meal_choose(text, text) to authenticated;

-- 過去沒選的日子：系統幫你吃（最多補 3 天）
create or replace function public.doom_meal_auto(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare r record; m jsonb; out jsonb := '[]'::jsonb;
begin
  for r in select day from public.doom_days where user_id = u and day < public.app_today() and meal is null
           and day >= public.app_today() - 3 order by day loop
    m := public.doom_meal_eat(u, r.day, null, null, true);
    if m is null then
      update public.doom_days set meal = '{"none":true}'::jsonb where user_id = u and day = r.day;
    else
      out := out || (m || jsonb_build_object('day', r.day));
    end if;
  end loop;
  return out;
end;
$function$;
revoke all on function public.doom_meal_auto(uuid) from public, authenticated, anon;

-- 食物櫃狀態
create or replace function public.doom_pantry_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); st public.doom_state%rowtype; auto jsonb; today date := public.app_today();
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_ensure(u);
  perform public.doom_day(u, today, true);
  auto := public.doom_meal_auto(u);
  select * into st from public.doom_state where user_id = u;
  return json_build_object('pantry', st.pantry, 'eaten', st.eaten, 'auto', auto,
    'today', (select meal from public.doom_days where user_id = u and day = today));
end;
$function$;
grant execute on function public.doom_pantry_status() to authenticated;


-- ---------- 🍀 幸運（加上今天這一餐） ----------
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
  return greatest(0, l);
end;
$function$;
revoke all on function public.doom_luck(uuid) from public, authenticated, anon;


-- ---------- 🔗 接到搜刮和抽獎上 ----------
-- 專注搜刮：原本的（含救倖存者）照舊，再加美食
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
begin
  res := public.doom_run_claim_base(p_session, p_zone, p_drops)::jsonb;
  if u is null or coalesce((res->>'already')::boolean, false) or res ? 'rescued' then return res; end if;
  mins := coalesce((res->>'minutes')::int, 0);
  n := public.doom_rescue(u, mins);
  for i in 1..least(6, mins / 10) loop
    x := public.doom_pantry_roll(u, res->>'zone', 0.4);
    if x is not null then pk := pk || x; end if;
  end loop;
  res := res || jsonb_build_object('rescued', n, 'pantry', pk);
  update public.doom_runs set result = result || jsonb_build_object('rescued', n, 'pantry', pk) where user_id = u and session_id = p_session;
  if n > 0 then perform public.doom_log_add(u, 'city', 'r', '搜刮時救回了 ' || n || ' 個倖存者，帶他們回城市。'); end if;
  return res;
end;
$function$;
grant execute on function public.doom_run_claim(bigint, text, integer) to authenticated;

-- 抽獎：包一層，每張 35% 多撿一份美食
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'doom_draw_base') then
    alter function public.doom_draw(integer) rename to doom_draw_base;
  end if;
end $$;
revoke all on function public.doom_draw_base(integer) from public, authenticated, anon;

create or replace function public.doom_draw(p_n integer)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  res jsonb;
  i integer;
  pk jsonb := '[]'::jsonb;
  x jsonb;
begin
  res := public.doom_draw_base(p_n)::jsonb;
  for i in 1..jsonb_array_length(coalesce(res->'results', '[]'::jsonb)) loop
    x := public.doom_pantry_roll(u, null, 0.35);
    if x is not null then pk := pk || x; end if;
  end loop;
  return res || jsonb_build_object('pantry', pk);
end;
$function$;
grant execute on function public.doom_draw(integer) to authenticated;
