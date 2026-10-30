-- =========================================================
-- 序光計畫：☢️ 末世：🤝 新夥伴 12 位 ＋ 🌳 末世農場分區（田／果園／香草園／牧場／魚塭）
-- 要在「2026-10-30_末世_星露島食材.sql」之後執行。可以重複執行。
--
--   🤝 新夥伴：廚師阿姨、牧羊女、園丁爺爺、漁夫阿伯、獵人、小護士、外送員、黑貓、小狐狸、退休老師、無線電少年、小雞嗶嗶
--      每位都有能力、好感 3 級故事、好感 5 級能力加倍；所有夥伴（含原本 8 位）好感 5 級多一段故事
--      新夥伴一樣從搜刮的「新同伴」、訪客、事件遇到
--   🌳 農場分 5 區，各自有格子，農場升級格子變多：
--      田（蔬菜穀物）、果園（果樹種一次一直結果）、香草園（香草和辛香料）、牧場（動物養一次一直產）、魚塭
--   這個檔會覆蓋 doom_farm_cat、doom_farm_plant、doom_farm_harvest、doom_farm_cook、doom_run_claim；
--   之後如果重跑前面的末世檔，最後要再跑一次這個檔
-- =========================================================

alter table public.doom_state add column if not exists buddy_day date;

-- ---------- 🤝 夥伴目錄（包一層，原本的 8 位不動） ----------
do $do$ begin
  if not exists (select 1 from pg_proc where proname = 'doom_catalog_base' and pronamespace = 'public'::regnamespace) then
    alter function public.doom_catalog() rename to doom_catalog_base;
  end if;
  if not exists (select 1 from pg_proc where proname = 'doom_extra_base' and pronamespace = 'public'::regnamespace) then
    alter function public.doom_extra() rename to doom_extra_base;
  end if;
  if not exists (select 1 from pg_proc where proname = 'doom_luck_base' and pronamespace = 'public'::regnamespace) then
    alter function public.doom_luck(uuid) rename to doom_luck_base;
  end if;
  if not exists (select 1 from pg_proc where proname = 'doom_zombies_base' and pronamespace = 'public'::regnamespace) then
    alter function public.doom_zombies(uuid, integer) rename to doom_zombies_base;
  end if;
  if not exists (select 1 from pg_proc where proname = 'doom_status_base' and pronamespace = 'public'::regnamespace) then
    alter function public.doom_status() rename to doom_status_base;
  end if;
end $do$;
revoke all on function public.doom_luck_base(uuid) from public, authenticated, anon;
revoke all on function public.doom_zombies_base(uuid, integer) from public, authenticated, anon;
revoke all on function public.doom_status_base() from public, authenticated, anon;

create or replace function public.doom_buddy_new()
returns jsonb language sql immutable
as $function$ select $json$[{"id": "chef", "name": "廚師阿姨", "emoji": "🧑‍🍳", "perk": "末世廚房做菜快 25%"}, {"id": "shepherd", "name": "牧羊女", "emoji": "👧", "perk": "牧場每次收成 +1"}, {"id": "gardener", "name": "園丁爺爺", "emoji": "👴", "perk": "果園和香草園收成 +1"}, {"id": "fisher", "name": "漁夫阿伯", "emoji": "🎣", "perk": "魚塭養魚快 25%"}, {"id": "hunter", "name": "獵人", "emoji": "🏹", "perk": "殺喪屍拿到的精核 +25%"}, {"id": "nurse", "name": "小護士", "emoji": "👩‍⚕️", "perk": "每天送你 1 份藥品"}, {"id": "courier", "name": "外送員", "emoji": "🛵", "perk": "每天外送 1 份美食給你"}, {"id": "blackcat", "name": "黑貓", "emoji": "🐈‍⬛", "perk": "幸運 +2"}, {"id": "fox", "name": "小狐狸", "emoji": "🦊", "perk": "每天叼回 2 顆精核"}, {"id": "teacher", "name": "退休老師", "emoji": "👩‍🏫", "perk": "專注搜刮更容易撿到美食"}, {"id": "radio", "name": "無線電少年", "emoji": "📻", "perk": "每天換回 💧3 和 🔩3"}, {"id": "chick", "name": "小雞嗶嗶", "emoji": "🐥", "perk": "每天下 1 顆蛋（進作物倉庫）"}]$json$::jsonb; $function$;

create or replace function public.doom_buddy_ex()
returns jsonb language sql immutable
as $function$ select $json${"stories": {"chef": "阿姨以前在巷口開了二十年的自助餐。斷電那天，她用最後一桶瓦斯煮了一大鍋滷肉，分給整條街的人。", "shepherd": "她是從山上的牧場一路走下來的，身後跟著三隻羊，一隻都沒丟。", "gardener": "爺爺以前是植物園的園丁。植物園倒了，他只帶出一盆薄荷和一把剪刀。", "fisher": "阿伯在港口捕了一輩子的魚。海變了顏色之後，他是第一個想到在頂樓水塔養魚的人。", "hunter": "她沉默寡言，弓上刻著一排小小的記號。後來你才知道，那不是獵物的數量，是她救下的人。", "nurse": "她是醫學院的實習生，末世來的那天剛好輪值。她背著整個藥櫃逃出醫院。", "courier": "他的機車箱裡永遠有一份還熱的便當。沒有人知道他是從哪裡弄來的。", "blackcat": "大家都說黑貓會帶來厄運。牠來了以後，你的運氣反而越來越好。", "fox": "小狐狸不知道從哪裡學會了撿亮晶晶的東西。牠把精核當成寶石，每天叼幾顆放在你門口。", "teacher": "她教了四十年的書，退休那天，學生送她一整面牆的卡片。末世來了，她只帶走那些卡片。", "radio": "少年每天晚上都在頂樓調頻，想找到其他倖存者。他的對講機裡有幾十個城市的頻道。", "chick": "牠是從孵蛋器裡意外孵出來的，睜開眼第一個看到的是你，從此就把你當成媽媽。"}, "stories2": {"cat": "有一天牠叼回一塊舊的店員名牌。牠以前的家人沒有回來，但牠找到了新的家。", "dog": "牠的項圈上刻著一個名字，不是牠的，是以前主人的。現在牠每天傍晚等的人，是你。", "owl": "貓頭鷹說牠數過了：你每多專注一天，天上就多亮一顆星。", "robot": "你終於找到那句話的作者：一個每天熬夜念書的學生寫給自己的。小機器人說：「現在換你了。」", "doctor": "醫生終於睡了一個整覺。他說：「因為我知道，有人會把基地顧好。」", "farmer": "父親的種子發芽了。農夫把第一顆番茄塞給你：「這是新世界的第一個收成，給你。」", "engineer": "工程師把那把螺絲起子送給你：「世界我修得差不多了，接下來，修你自己的人生吧。」", "merchant": "老商人說他不走了。「走過那麼多城市，最後想停下來的，是有你在的這一座。」", "chef": "她說她不怕末世，只怕有人沒飯吃。所以她每天都會攔住你問：「吃飽了沒？」你發現自己開始期待這句話。", "shepherd": "她幫每隻動物都取了名字。她說，被叫名字的人（和羊）就不會走丟。最近，她也開始叫你的名字了。", "gardener": "那盆薄荷現在長滿了一整面牆。爺爺說：「你看，只要每天澆一點水，什麼都會長回來的。人也是。」", "fisher": "他說釣魚最重要的不是技術，是能等。「你等得了一條魚，就等得了你自己。」說完他把最大的那條魚留給你。", "hunter": "有一天她把弓遞給你看，上面多了一道新的記號。她說：「這一道是你。是你讓我有地方可以回來。」", "nurse": "醫生說她是他見過最勇敢的實習生。她紅著臉說：「我只是不想讓任何人，因為缺一顆藥而難過。」", "courier": "末世前他一天送一百單，從來沒看清楚客人的臉。現在他每天只送一單，送到你手上，看著你吃完才走。", "blackcat": "橘貓跟黑貓現在會一起睡在你的枕頭上，一邊一隻。你猜牠們以前就認識。", "fox": "你發現牠在床底下藏了一整窩寶貝，最上面放著一張你弄丟的書籤。原來牠收藏的不是寶石，是跟你有關的東西。", "teacher": "她開始在基地教小朋友認字，也在你讀書的時候安靜地陪著你。她說：「我最喜歡看學生專心的樣子，你現在就是。」", "radio": "有一晚他衝進來大喊：「我聯絡到另一個基地了！他們也有一個每天專注的人！」你們都笑了，原來不是只有你在努力。", "chick": "牠長大了，還是每天跟在你腳邊。每天早上那顆蛋，是牠能給你最好的禮物。"}, "talk": {"chef": ["吃飽了沒？沒吃飽不准出門。", "今天的湯我多放了一點肉，噓。", "讀書跟煮菜一樣，火候到了就好。"], "shepherd": ["小白今天多產了一點奶喔！", "動物知道誰對牠們好。", "你今天有好好吃飯嗎？羊都吃了喔。"], "gardener": ["樹不會一天長大，人也是。", "今天的檸檬特別酸，很好。", "修剪是為了長得更好，不是懲罰。"], "fisher": ["魚不急，你也別急。", "今天水色不錯，魚很有精神。", "阿伯年輕時也考過試，考完就去捕魚了，哈哈。"], "hunter": ["……外面安全了。", "你專注的時候，喪屍都不敢靠近。", "精核收好，別亂花。"], "nurse": ["量一下體溫……嗯，正常！", "藥我放在你的櫃子裡了。", "累了就休息，這是護理師的命令。"], "courier": ["您的外送到囉！", "今天跑了三個區，路況還行。", "五星好評記得給我喔～"], "blackcat": ["喵。（今天運氣不錯）", "……（盯著你看）", "呼嚕。"], "fox": ["嗷嗚！（放下一顆亮晶晶）", "（尾巴蓬蓬地掃過你的腳）", "嘰？（歪頭）"], "teacher": ["今天讀到哪裡了？", "專心的人，運氣都不會太差。", "老師以前也熬夜，後來學會早睡了。"], "radio": ["滋……滋……今天的訊號很清楚！", "我用舊零件換了點水回來。", "有人在聽嗎？……有，你在聽。"], "chick": ["嗶嗶！", "（跳到你的課本上）", "嗶！（今天也下蛋了）"]}, "bond_perk": {"chef": "做菜改成快 40%", "shepherd": "牧場收成改成 +2", "gardener": "果園和香草園收成改成 +2", "fisher": "養魚改成快 40%", "hunter": "精核改成 +50%", "nurse": "每天送 2 份藥品", "courier": "每天外送 2 份美食", "blackcat": "幸運再 +2", "fox": "每天叼回 4 顆精核", "teacher": "撿到美食的機率再提高", "radio": "每天換回 💧6 和 🔩6", "chick": "每天下 2 顆蛋"}}$json$::jsonb; $function$;

create or replace function public.doom_catalog()
returns jsonb language sql immutable
as $function$
  select b || jsonb_build_object('companions', (select jsonb_agg(x) from (
      select x from jsonb_array_elements(b->'companions') x
      union all
      select x from jsonb_array_elements(public.doom_buddy_new()) x
        where not exists (select 1 from jsonb_array_elements(b->'companions') y where y->>'id' = x->>'id')) q))
  from (select public.doom_catalog_base() b) s;
$function$;
grant execute on function public.doom_catalog() to authenticated;

create or replace function public.doom_extra()
returns jsonb language sql immutable
as $function$
  select b || jsonb_build_object(
    'stories', (b->'stories') || (e->'stories'),
    'stories2', e->'stories2',
    'talk', (b->'talk') || (e->'talk'),
    'bond_perk', (b->'bond_perk') || (e->'bond_perk'))
  from (select public.doom_extra_base() b, public.doom_buddy_ex() e) s;
$function$;
grant execute on function public.doom_extra() to authenticated;

-- 夥伴能力用：有沒有、好感 5 級了沒（0／1／2）
create or replace function public.doom_buddy(st public.doom_state, p_id text)
returns integer language sql immutable
as $function$
  select case when not st.companions ? p_id then 0 when public.doom_bond_lv(st, p_id) >= 5 then 2 else 1 end;
$function$;

-- 🐈‍⬛ 黑貓：幸運
create or replace function public.doom_luck(u uuid)
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare st public.doom_state%rowtype;
begin
  select * into st from public.doom_state where user_id = u;
  return public.doom_luck_base(u) + case when found then public.doom_buddy(st, 'blackcat') * 2 else 0 end;
end;
$function$;
revoke all on function public.doom_luck(uuid) from public, authenticated, anon;

-- 🏹 獵人：精核加成
create or replace function public.doom_zombies(u uuid, p_min integer)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare st public.doom_state%rowtype; r jsonb; b integer; bonus integer;
begin
  r := public.doom_zombies_base(u, p_min);
  if r is null then return r; end if;
  select * into st from public.doom_state where user_id = u;
  b := public.doom_buddy(st, 'hunter');
  if b = 0 then return r; end if;
  bonus := ceil(coalesce((r->>'cores')::int, 0) * case b when 2 then 0.5 else 0.25 end)::int;
  if bonus > 0 then update public.doom_state set cores = cores + bonus where user_id = u; end if;
  return r || jsonb_build_object('cores', coalesce((r->>'cores')::int, 0) + bonus, 'hunter', bonus);
end;
$function$;
revoke all on function public.doom_zombies(uuid, integer) from public, authenticated, anon;

-- 每天第一次打開末世：夥伴送的禮物
create or replace function public.doom_buddy_daily(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  st public.doom_state%rowtype; today date := public.app_today(); gifts jsonb := '[]'::jsonb;
  b integer; i integer; x jsonb; n integer;
begin
  select * into st from public.doom_state where user_id = u for update;
  if not found or st.buddy_day = today then return gifts; end if;
  update public.doom_state set buddy_day = today where user_id = u;
  -- 👩‍⚕️ 小護士：藥品
  b := public.doom_buddy(st, 'nurse');
  for i in 1..b loop
    select el into x from jsonb_array_elements(public.doom_food_cat()->'items') el where el->>'c' = 'med' and el->>'t' in ('c', 'r') order by random() limit 1;
    if x is not null then
      perform public.doom_pantry_add(u, x->>'id', 1);
      gifts := gifts || jsonb_build_object('who', 'nurse', 'id', x->>'id', 'name', x->>'name', 'emoji', x->>'emoji', 'n', 1);
    end if;
  end loop;
  -- 🛵 外送員：美食
  b := public.doom_buddy(st, 'courier');
  for i in 1..b loop
    x := public.doom_pantry_roll(u, null, 1.0);
    if x is not null then gifts := gifts || (x || jsonb_build_object('who', 'courier', 'n', 1)); end if;
  end loop;
  -- 🦊 小狐狸：精核
  b := public.doom_buddy(st, 'fox');
  if b > 0 then
    n := 2 * b;
    update public.doom_state set cores = cores + n where user_id = u;
    gifts := gifts || jsonb_build_object('who', 'fox', 'name', '精核', 'emoji', '💠', 'n', n);
  end if;
  -- 📻 無線電少年：水和零件
  b := public.doom_buddy(st, 'radio');
  if b > 0 then
    n := 3 * b;
    perform public.doom_apply(u, jsonb_build_object('water', n, 'parts', n), 'doom-buddy:radio:' || today);
    gifts := gifts || jsonb_build_object('who', 'radio', 'name', '水', 'emoji', '💧', 'n', n);
    gifts := gifts || jsonb_build_object('who', 'radio', 'name', '零件', 'emoji', '🔩', 'n', n);
  end if;
  -- 🐥 小雞：雞蛋進作物倉庫
  b := public.doom_buddy(st, 'chick');
  if b > 0 then
    update public.doom_state set dcrops = dcrops || jsonb_build_object('egg', coalesce((dcrops->>'egg')::int, 0) + b) where user_id = u;
    gifts := gifts || jsonb_build_object('who', 'chick', 'name', '雞蛋', 'emoji', '🥚', 'n', b);
  end if;
  return gifts;
end;
$function$;
revoke all on function public.doom_buddy_daily(uuid) from public, authenticated, anon;

create or replace function public.doom_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); gifts jsonb := '[]'::jsonb;
begin
  if u is not null then
    perform public.doom_ensure(u);
    gifts := public.doom_buddy_daily(u);
  end if;
  return (public.doom_status_base()::jsonb || jsonb_build_object('buddy_gifts', gifts))::json;
end;
$function$;
grant execute on function public.doom_status() to authenticated;

-- 👩‍🏫 退休老師：專注搜刮撿到美食機率提高
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
  st public.doom_state%rowtype;
  chance numeric := 0.4;
begin
  perform set_config('doom.scavfood', '[]', true);
  res := public.doom_run_claim_base(p_session, p_zone, p_drops)::jsonb;
  if u is null or coalesce((res->>'already')::boolean, false) or res ? 'rescued' then return res; end if;
  mins := coalesce((res->>'minutes')::int, 0);
  n := public.doom_rescue(u, mins);
  select * into st from public.doom_state where user_id = u;
  chance := chance + 0.15 * public.doom_buddy(st, 'teacher');
  pk := coalesce(nullif(current_setting('doom.scavfood', true), ''), '[]')::jsonb;
  for i in 1..least(6, mins / 10) loop
    x := public.doom_pantry_roll(u, res->>'zone', chance);
    if x is not null then pk := pk || x; end if;
  end loop;
  zb := public.doom_zombies(u, mins);
  res := res || jsonb_build_object('rescued', n, 'pantry', pk, 'zombies', zb);
  update public.doom_runs set result = result || jsonb_build_object('rescued', n, 'pantry', pk, 'zombies', zb) where user_id = u and session_id = p_session;
  if n > 0 then perform public.doom_log_add(u, 'city', 'r', '搜刮時救回了 ' || n || ' 個倖存者，帶他們回城市。'); end if;
  return res;
end;
$function$;
grant execute on function public.doom_run_claim(bigint, text, integer) to authenticated;


-- ---------- 🌳 末世農場分區 ----------
create or replace function public.doom_farm_cat()
returns jsonb language sql immutable
as $function$
select $json${"crops":[{"id":"potato","lv":1,"min":30,"name":"馬鈴薯","emoji":"🥔","water":2,"yield":3,"a":"field"},{"id":"wheat","lv":1,"min":30,"name":"小麥","emoji":"🌾","water":2,"yield":3,"a":"field"},{"id":"rice","lv":1,"min":40,"name":"稻米","emoji":"🌾","water":3,"yield":3,"a":"field"},{"id":"scallion","lv":1,"min":20,"name":"青蔥","emoji":"🧅","water":1,"yield":3,"a":"herb"},{"id":"corn","lv":2,"min":45,"name":"玉米","emoji":"🌽","water":2,"yield":3,"a":"field"},{"id":"cabbage","lv":2,"min":40,"name":"高麗菜","emoji":"🥬","water":2,"yield":2,"a":"field"},{"id":"carrot","lv":2,"min":35,"name":"紅蘿蔔","emoji":"🥕","water":2,"yield":3,"a":"field"},{"id":"apple","lv":2,"min":90,"name":"蘋果樹","emoji":"🍎","fruit":"apple","water":3,"yield":2,"keep":true,"a":"orchard"},{"id":"tomato","lv":3,"min":50,"name":"番茄","emoji":"🍅","water":2,"yield":3,"a":"field"},{"id":"soybean","lv":3,"min":60,"name":"大豆","emoji":"🫘","water":2,"yield":3,"a":"field"},{"id":"banana","lv":3,"min":90,"name":"香蕉樹","emoji":"🍌","fruit":"banana","water":3,"yield":2,"keep":true,"a":"orchard"},{"id":"orange","lv":3,"min":100,"name":"橘子樹","emoji":"🍊","fruit":"orange","water":3,"yield":2,"keep":true,"a":"orchard"},{"id":"sugarcane","lv":4,"min":60,"name":"甘蔗","emoji":"🎋","water":3,"yield":3,"a":"field"},{"id":"chili","lv":4,"min":45,"name":"辣椒","emoji":"🌶️","water":2,"yield":3,"a":"herb"},{"id":"strawberry","lv":4,"min":120,"name":"草莓","emoji":"🍓","fruit":"strawberry","water":3,"yield":2,"a":"field"},{"id":"tea","lv":5,"min":90,"name":"茶樹","emoji":"🍃","water":2,"yield":3,"keep":true,"a":"orchard"},{"id":"ginger","lv":5,"min":60,"name":"薑","emoji":"🫚","water":2,"yield":3,"a":"herb"},{"id":"mango","lv":5,"min":150,"name":"芒果樹","emoji":"🥭","fruit":"mango","water":4,"yield":2,"keep":true,"a":"orchard"},{"id":"coffee","lv":6,"min":120,"name":"咖啡樹","emoji":"☕","water":3,"yield":3,"keep":true,"a":"orchard"},{"id":"watermelon","lv":6,"min":180,"name":"西瓜","emoji":"🍉","fruit":"watermelon","water":5,"yield":1,"a":"field"},{"id":"cocoa","lv":7,"min":150,"name":"可可樹","emoji":"🍫","water":3,"yield":3,"keep":true,"a":"orchard"},{"id":"grape","lv":8,"min":240,"name":"葡萄藤","emoji":"🍇","fruit":"grapes","water":4,"yield":1,"keep":true,"a":"orchard"},{"id":"peach","lv":10,"min":720,"name":"仙桃樹","emoji":"🍑","fruit":"goldpeach","water":10,"yield":1,"keep":true,"a":"orchard"},{"id":"sweetpotato","lv":1,"min":30,"name":"地瓜","emoji":"🍠","water":2,"yield":3,"a":"field"},{"id":"pea","lv":1,"min":30,"name":"豌豆","emoji":"🫛","water":2,"yield":3,"a":"field"},{"id":"shiitake","lv":1,"min":60,"name":"香菇","emoji":"🍄","water":3,"yield":3,"a":"field"},{"id":"lemon","lv":1,"min":120,"name":"檸檬","emoji":"🍋","water":4,"yield":3,"keep":true,"a":"orchard"},{"id":"basil","lv":2,"min":20,"name":"九層塔","emoji":"🌿","water":2,"yield":3,"a":"herb"},{"id":"cucumber","lv":2,"min":30,"name":"小黃瓜","emoji":"🥒","water":2,"yield":3,"a":"field"},{"id":"garlic","lv":2,"min":45,"name":"大蒜","emoji":"🧄","water":2,"yield":3,"a":"herb"},{"id":"eggplant","lv":2,"min":60,"name":"茄子","emoji":"🍆","water":3,"yield":3,"a":"field"},{"id":"bellpepper","lv":2,"min":60,"name":"青椒","emoji":"🫑","water":3,"yield":3,"a":"field"},{"id":"bamboo","lv":2,"min":90,"name":"竹筍","emoji":"🎋","water":3,"yield":3,"a":"field"},{"id":"cherry","lv":2,"min":120,"name":"櫻桃","emoji":"🍒","water":4,"yield":3,"keep":true,"a":"orchard"},{"id":"mint","lv":3,"min":30,"name":"薄荷","emoji":"🌿","water":2,"yield":3,"a":"herb"},{"id":"daikon","lv":3,"min":60,"name":"白蘿蔔","emoji":"🥕","water":3,"yield":3,"a":"field"},{"id":"yellowonion","lv":3,"min":60,"name":"洋蔥","emoji":"🧅","water":3,"yield":3,"a":"field"},{"id":"woodear","lv":3,"min":60,"name":"木耳","emoji":"🍄","water":3,"yield":3,"a":"field"},{"id":"pumpkin","lv":3,"min":120,"name":"南瓜","emoji":"🎃","water":4,"yield":3,"a":"field"},{"id":"coriander","lv":4,"min":30,"name":"香菜","emoji":"🌿","water":2,"yield":3,"a":"herb"},{"id":"enoki","lv":4,"min":75,"name":"金針菇","emoji":"🍄","water":3,"yield":3,"a":"field"},{"id":"peanut","lv":4,"min":75,"name":"花生","emoji":"🥜","water":3,"yield":3,"a":"field"},{"id":"spinach","lv":5,"min":45,"name":"菠菜","emoji":"🥬","water":2,"yield":3,"a":"field"},{"id":"rosemary","lv":5,"min":45,"name":"迷迭香","emoji":"🌿","water":2,"yield":3,"a":"herb"},{"id":"okra","lv":5,"min":60,"name":"秋葵","emoji":"🫛","water":3,"yield":3,"a":"field"},{"id":"taro","lv":5,"min":120,"name":"芋頭","emoji":"🥔","water":4,"yield":3,"a":"field"},{"id":"melon","lv":5,"min":150,"name":"哈密瓜","emoji":"🍈","water":4,"yield":3,"a":"field"},{"id":"pineapple","lv":5,"min":150,"name":"鳳梨","emoji":"🍍","water":4,"yield":3,"a":"field"},{"id":"kingoyster","lv":6,"min":90,"name":"杏鮑菇","emoji":"🍄","water":3,"yield":3,"a":"field"},{"id":"bittermelon","lv":6,"min":90,"name":"苦瓜","emoji":"🥒","water":3,"yield":3,"a":"field"},{"id":"asparagus","lv":6,"min":120,"name":"蘆筍","emoji":"🥦","water":4,"yield":3,"a":"field"},{"id":"yam","lv":6,"min":120,"name":"山藥","emoji":"🍠","water":4,"yield":3,"a":"field"},{"id":"lavender","lv":7,"min":45,"name":"薰衣草","emoji":"💜","water":2,"yield":3,"a":"herb"},{"id":"lotusroot","lv":7,"min":120,"name":"蓮藕","emoji":"🪷","water":4,"yield":3,"a":"field"},{"id":"lychee","lv":7,"min":180,"name":"荔枝","emoji":"🍒","water":5,"yield":3,"keep":true,"a":"orchard"},{"id":"dragonfruit","lv":7,"min":180,"name":"火龍果","emoji":"🐉","water":5,"yield":3,"keep":true,"a":"orchard"},{"id":"vanilla","lv":7,"min":240,"name":"香草莢","emoji":"🌼","water":6,"yield":3,"keep":true,"a":"orchard"},{"id":"coconut","lv":7,"min":240,"name":"椰子","emoji":"🥥","water":6,"yield":3,"keep":true,"a":"orchard"},{"id":"lingzhi","lv":7,"min":360,"name":"靈芝","emoji":"🍄","water":6,"yield":3,"a":"field"},{"id":"cherryradish","lv":8,"min":60,"name":"櫻桃蘿蔔","emoji":"🔴","water":3,"yield":2,"a":"field"},{"id":"goldrice","lv":8,"min":90,"name":"金穗稻","emoji":"✨","water":3,"yield":2,"a":"field"},{"id":"blueberry","lv":8,"min":90,"name":"藍莓","emoji":"🫐","water":3,"yield":2,"a":"field"},{"id":"colorpepper","lv":8,"min":90,"name":"彩椒","emoji":"🫑","water":3,"yield":2,"a":"field"},{"id":"purplepotato","lv":8,"min":90,"name":"紫地瓜","emoji":"🍠","water":3,"yield":2,"a":"field"},{"id":"rainbowcorn","lv":8,"min":120,"name":"彩虹玉米","emoji":"🌈","water":4,"yield":2,"a":"field"},{"id":"whitestrawberry","lv":8,"min":120,"name":"白草莓","emoji":"🍓","water":4,"yield":2,"a":"field"},{"id":"blacktomato","lv":8,"min":120,"name":"黑番茄","emoji":"🍅","water":4,"yield":2,"a":"field"},{"id":"waxapple","lv":8,"min":150,"name":"蓮霧","emoji":"🍐","water":4,"yield":3,"keep":true,"a":"orchard"},{"id":"persimmon","lv":8,"min":180,"name":"柿子","emoji":"🟠","water":5,"yield":2,"keep":true,"a":"orchard"},{"id":"durian","lv":8,"min":210,"name":"榴槤","emoji":"🍈","water":5,"yield":3,"keep":true,"a":"orchard"},{"id":"sunflower","lv":9,"min":120,"name":"向日葵","emoji":"🌻","water":4,"yield":3,"a":"field"},{"id":"amberpumpkin","lv":9,"min":180,"name":"琥珀南瓜","emoji":"🎃","water":5,"yield":2,"a":"field"},{"id":"cottoncandy","lv":9,"min":180,"name":"棉花糖花","emoji":"🍭","water":5,"yield":2,"a":"field"},{"id":"goldapple","lv":9,"min":210,"name":"金蘋果","emoji":"🍏","water":5,"yield":2,"keep":true,"a":"orchard"},{"id":"passionfruit","lv":9,"min":210,"name":"百香果","emoji":"🟡","water":5,"yield":3,"keep":true,"a":"orchard"},{"id":"phoenixpepper","lv":9,"min":240,"name":"鳳凰椒","emoji":"🌶️","water":6,"yield":2,"a":"field"},{"id":"auroragrape","lv":9,"min":240,"name":"極光葡萄","emoji":"🍇","water":6,"yield":2,"keep":true,"a":"orchard"},{"id":"mangosteen","lv":9,"min":240,"name":"山竹","emoji":"🟣","water":6,"yield":3,"keep":true,"a":"orchard"},{"id":"avocado","lv":9,"min":240,"name":"酪梨","emoji":"🥑","water":6,"yield":3,"keep":true,"a":"orchard"},{"id":"fig","lv":9,"min":240,"name":"無花果","emoji":"🟪","water":6,"yield":3,"keep":true,"a":"orchard"},{"id":"starherb","lv":9,"min":360,"name":"星露草","emoji":"⭐","water":6,"yield":2,"a":"herb"},{"id":"moonlotus","lv":9,"min":360,"name":"月光蓮","emoji":"🌙","water":6,"yield":2,"a":"field"},{"id":"starfruit","lv":10,"min":300,"name":"楊桃","emoji":"⭐","water":6,"yield":3,"keep":true,"a":"orchard"},{"id":"dragoneye","lv":10,"min":360,"name":"龍眼","emoji":"🟤","water":6,"yield":3,"keep":true,"a":"orchard"},{"id":"chestnut","lv":10,"min":360,"name":"栗子","emoji":"🌰","water":6,"yield":3,"keep":true,"a":"orchard"},{"g":"ranch","t":"c","id":"egg","lv":1,"min":60,"src":"🐔 養雞","feed":2,"name":"雞蛋","emoji":"🥚","yield":2,"keep":true,"a":"ranch"},{"g":"ranch","t":"c","id":"milk","lv":1,"min":60,"src":"🐄 養乳牛","feed":2,"name":"牛奶","emoji":"🥛","yield":2,"keep":true,"a":"ranch"},{"g":"ranch","t":"c","id":"chickenmeat","lv":1,"min":180,"src":"🐔 養雞（肉）","feed":4,"name":"雞肉","emoji":"🍗","yield":2,"a":"ranch"},{"g":"ranch","t":"c","id":"beef","lv":1,"min":180,"src":"🐄 養乳牛（肉）","feed":4,"name":"牛肉","emoji":"🥩","yield":4,"a":"ranch"},{"g":"ranch","t":"c","id":"truffle","lv":2,"min":120,"src":"🐖 養豬","feed":2,"name":"松露","emoji":"🟤","yield":2,"keep":true,"a":"ranch"},{"g":"ranch","t":"c","id":"pork","lv":2,"min":180,"src":"🐖 養豬（肉）","feed":4,"name":"豬肉","emoji":"🥓","yield":4,"a":"ranch"},{"g":"ranch","t":"c","id":"duckegg","lv":3,"min":60,"src":"🦆 養鴨","feed":2,"name":"鴨蛋","emoji":"🥚","yield":2,"keep":true,"a":"ranch"},{"g":"ranch","t":"r","id":"honey","lv":3,"min":60,"src":"🐝 養蜜蜂","feed":2,"name":"蜂蜜","emoji":"🍯","yield":2,"keep":true,"a":"ranch"},{"g":"ranch","t":"c","id":"duckmeat","lv":3,"min":180,"src":"🦆 養鴨（肉）","feed":4,"name":"鴨肉","emoji":"🍗","yield":2,"a":"ranch"},{"g":"ranch","t":"r","id":"goatmilk","lv":4,"min":60,"src":"🐐 養山羊","feed":2,"name":"羊奶","emoji":"🥛","yield":2,"keep":true,"a":"ranch"},{"g":"ranch","t":"c","id":"lamb","lv":4,"min":180,"src":"🐑 養綿羊（肉）","feed":4,"name":"羊肉","emoji":"🍖","yield":3,"a":"ranch"},{"g":"ranch","t":"r","id":"gooseegg","lv":5,"min":120,"src":"🪿 養鵝","feed":2,"name":"鵝蛋","emoji":"🪿","yield":2,"keep":true,"a":"ranch"},{"g":"ranch","t":"r","id":"goosemeat","lv":5,"min":240,"src":"🪿 養鵝（肉）","feed":4,"name":"鵝肉","emoji":"🍖","yield":2,"a":"ranch"},{"g":"ranch","t":"l","id":"ostrichegg","lv":6,"min":180,"src":"🦤 養鴕鳥","feed":4,"name":"鴕鳥蛋","emoji":"🥚","yield":1,"keep":true,"a":"ranch"},{"g":"ranch","t":"l","id":"turkeymeat","lv":7,"min":240,"src":"🦃 養火雞（肉）","feed":4,"name":"火雞肉","emoji":"🍖","yield":2,"a":"ranch"},{"g":"ranch","t":"r","id":"buffalomilk","lv":9,"min":120,"src":"🐃 養水牛","feed":2,"name":"水牛奶","emoji":"🥛","yield":2,"keep":true,"a":"ranch"},{"g":"ranch","t":"x","id":"goldegg","lv":9,"min":300,"src":"🐓 養金雞","feed":4,"name":"金蛋","emoji":"🥚","yield":1,"keep":true,"a":"ranch"},{"g":"ranch","t":"s","id":"osmanthus","lv":10,"min":420,"src":"🐇 養月兔","feed":4,"name":"月桂粉","emoji":"🐇","yield":1,"keep":true,"a":"ranch"},{"g":"fish","t":"c","id":"moon_minnow","lv":2,"min":60,"feed":2,"name":"月光小鯽","emoji":"🐟","yield":3,"a":"pond"},{"g":"fish","t":"c","id":"paper_boat_fish","lv":2,"min":60,"feed":2,"name":"紙船魚","emoji":"🐟","yield":3,"a":"pond"},{"g":"fish","t":"c","id":"cotton_carp","lv":2,"min":60,"feed":2,"name":"棉花鯉","emoji":"🐟","yield":3,"a":"pond"},{"g":"fish","t":"c","id":"honey_perch","lv":2,"min":60,"feed":2,"name":"蜂蜜鱸","emoji":"🐟","yield":3,"a":"pond"},{"g":"fish","t":"c","id":"bubble_fish","lv":2,"min":60,"feed":2,"name":"小泡泡魚","emoji":"🐟","yield":3,"a":"pond"},{"g":"fish","t":"c","id":"reed_loach","lv":2,"min":60,"feed":2,"name":"蘆葦鰍","emoji":"🐟","yield":3,"a":"pond"},{"g":"fish","t":"c","id":"match_snapper","lv":2,"min":60,"feed":2,"name":"火柴鯛","emoji":"🐟","yield":3,"a":"pond"},{"g":"fish","t":"c","id":"bun_catfish","lv":2,"min":60,"feed":2,"name":"饅頭鯰","emoji":"🐟","yield":3,"a":"pond"},{"g":"fish","t":"c","id":"dew_carp","lv":2,"min":60,"feed":2,"name":"露珠鯉","emoji":"🐟","yield":3,"a":"pond"},{"g":"fish","t":"c","id":"bean_sprout_catfish","lv":2,"min":60,"feed":2,"name":"豆芽鯰","emoji":"🐟","yield":3,"a":"pond"},{"g":"fish","t":"c","id":"slipper_fish","lv":2,"min":60,"feed":2,"name":"拖鞋魚","emoji":"🐟","yield":3,"a":"pond"},{"g":"fish","t":"c","id":"strawberry_snapper","lv":2,"min":60,"feed":2,"name":"草莓鯛","emoji":"🐟","yield":3,"a":"pond"},{"g":"fish","t":"r","id":"rain_snapper","lv":5,"min":120,"feed":3,"name":"雨滴鯛","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"r","id":"maple_carp","lv":5,"min":120,"feed":3,"name":"紅楓鯉","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"r","id":"bell_eel","lv":5,"min":120,"feed":3,"name":"鈴鐺鰻","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"r","id":"mint_guppy","lv":5,"min":120,"feed":3,"name":"薄荷鱂","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"r","id":"star_goby","lv":5,"min":120,"feed":3,"name":"星沙蝦虎","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"r","id":"carpenter_fish","lv":5,"min":120,"feed":3,"name":"木匠魚","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"r","id":"sakura_trout","lv":5,"min":120,"feed":3,"name":"櫻花鱒","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"r","id":"snail_catfish","lv":5,"min":120,"feed":3,"name":"蝸牛鰭鯰","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"r","id":"wind_chime_perch","lv":5,"min":120,"feed":3,"name":"風鈴鱸","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"r","id":"honey_pomelo_snapper","lv":5,"min":120,"feed":3,"name":"蜜柚鯛","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"r","id":"porcelain_carp","lv":5,"min":120,"feed":3,"name":"陶瓷鯉","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"r","id":"paper_lantern_loach","lv":5,"min":120,"feed":3,"name":"紙燈籠鰍","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"r","id":"cloud_guppy","lv":5,"min":120,"feed":3,"name":"雲朵鱂","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"l","id":"lantern_jelly","lv":7,"min":240,"feed":4,"name":"燈籠水母魚","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"l","id":"ink_shark","lv":7,"min":240,"feed":4,"name":"墨硯鯊","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"l","id":"glass_mackerel","lv":7,"min":240,"feed":4,"name":"玻璃鯖","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"l","id":"clay_gator","lv":7,"min":240,"feed":4,"name":"陶土鱷","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"l","id":"stalactite_whale","lv":7,"min":240,"feed":4,"name":"鐘乳鯨苗","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"l","id":"sugar_snapper","lv":7,"min":240,"feed":4,"name":"糖霜鯛","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"l","id":"spruce_salmon","lv":7,"min":240,"feed":4,"name":"雲杉鮭","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"l","id":"crystal_shrimp","lv":7,"min":240,"feed":4,"name":"水晶蝦","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"l","id":"amber_perch","lv":7,"min":240,"feed":4,"name":"琥珀鱸","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"l","id":"nebula_anglerfish","lv":7,"min":240,"feed":4,"name":"星雲鮟鱇","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"l","id":"bronze_bell_whale","lv":7,"min":240,"feed":4,"name":"銅鈴鯨","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"l","id":"coral_armor_shark","lv":7,"min":240,"feed":4,"name":"珊瑚鎧鯊","emoji":"🐟","yield":2,"a":"pond"},{"g":"fish","t":"x","id":"clock_carp","lv":9,"min":360,"feed":6,"name":"時鐘鯉","emoji":"🐟","yield":1,"a":"pond"},{"g":"fish","t":"x","id":"aurora_ray","lv":9,"min":360,"feed":6,"name":"極光鰩","emoji":"🐟","yield":1,"a":"pond"},{"g":"fish","t":"x","id":"mirror_fish","lv":9,"min":360,"feed":6,"name":"鏡面魚","emoji":"🐟","yield":1,"a":"pond"},{"g":"fish","t":"x","id":"starsea_turtle","lv":9,"min":360,"feed":6,"name":"星海龜","emoji":"🐟","yield":1,"a":"pond"},{"g":"fish","t":"x","id":"frost_dragon_carp","lv":9,"min":360,"feed":6,"name":"霜紋龍鯉","emoji":"🐟","yield":1,"a":"pond"},{"g":"fish","t":"x","id":"backlight_whale","lv":9,"min":360,"feed":6,"name":"逆光鯨","emoji":"🐟","yield":1,"a":"pond"},{"g":"fish","t":"x","id":"wing_mackerel","lv":9,"min":360,"feed":6,"name":"羽翼鯖","emoji":"🐟","yield":1,"a":"pond"},{"g":"fish","t":"s","id":"xuguang_fish","lv":10,"min":480,"feed":8,"name":"序光魚","emoji":"🐟","yield":1,"a":"pond"},{"g":"fish","t":"s","id":"dragon_bone_whale","lv":10,"min":480,"feed":8,"name":"龍骨鯨","emoji":"🐟","yield":1,"a":"pond"},{"g":"fish","t":"s","id":"counter_king","lv":10,"min":480,"feed":8,"name":"逆流之王","emoji":"🐟","yield":1,"a":"pond"},{"g":"fish","t":"s","id":"sky_mirror_whale","lv":10,"min":480,"feed":8,"name":"天鏡鯨","emoji":"🐟","yield":1,"a":"pond"},{"g":"fish","t":"s","id":"nameless_white_carp","lv":10,"min":480,"feed":8,"name":"無名白鯉","emoji":"🐟","yield":1,"a":"pond"},{"g":"fish","t":"s","id":"cloud_peak_shark","lv":10,"min":480,"feed":8,"name":"雲巔鮫","emoji":"🐟","yield":1,"a":"pond"},{"g":"goods","t":"c","id":"flour","lv":2,"min":20,"name":"麵粉","emoji":"🌾"},{"g":"goods","t":"c","id":"butter","lv":2,"min":30,"name":"奶油","emoji":"🧈"},{"g":"goods","t":"c","id":"sugar","lv":4,"min":20,"name":"砂糖","emoji":"🍬"},{"g":"goods","t":"c","id":"tofu","lv":4,"min":30,"name":"豆腐","emoji":"⬜"},{"g":"goods","t":"c","id":"soymilk","lv":4,"min":10,"name":"豆漿","emoji":"🥛"},{"g":"goods","t":"c","id":"cheese","lv":4,"min":60,"name":"起司","emoji":"🧀"},{"g":"goods","t":"c","id":"chocolate","lv":7,"min":60,"name":"巧克力","emoji":"🍫"},{"g":"goods","t":"r","id":"jam_strawberry","lv":8,"min":60,"name":"草莓果醬","emoji":"🍓"},{"g":"goods","t":"r","id":"jam_mango","lv":8,"min":60,"name":"芒果果醬","emoji":"🥭"},{"g":"goods","t":"l","id":"ice_mango","lv":9,"min":90,"name":"芒果冰淇淋","emoji":"🍨"},{"g":"goods","t":"l","id":"ice_matcha","lv":9,"min":90,"name":"抹茶冰淇淋","emoji":"🍵"},{"g":"goods","t":"r","id":"oolong","lv":10,"min":120,"name":"烏龍茶","emoji":"🫖"},{"g":"goods","t":"r","id":"blacktea","lv":10,"min":90,"name":"紅茶","emoji":"☕"}],"levels":[{"lv":1,"plots":3,"stoves":1,"orchard":2,"herb":2,"ranch":2,"pond":1},{"lv":2,"cost":{"food":15,"cores":10,"parts":30},"plots":4,"stoves":1,"orchard":2,"herb":2,"ranch":3,"pond":2},{"lv":3,"cost":{"food":30,"cores":25,"parts":60},"plots":5,"stoves":2,"orchard":3,"herb":2,"ranch":3,"pond":3},{"lv":4,"cost":{"food":50,"cores":45,"parts":100},"plots":6,"stoves":2,"orchard":3,"herb":3,"ranch":4,"pond":3},{"lv":5,"cost":{"food":75,"cores":70,"parts":150},"plots":7,"stoves":2,"orchard":4,"herb":3,"ranch":4,"pond":4},{"lv":6,"cost":{"food":100,"cores":100,"parts":210},"plots":8,"stoves":3,"orchard":4,"herb":4,"ranch":5,"pond":4},{"lv":7,"cost":{"food":130,"cores":140,"parts":280},"plots":9,"stoves":3,"orchard":5,"herb":4,"ranch":6,"pond":5},{"lv":8,"cost":{"food":160,"cores":190,"parts":360},"plots":10,"stoves":3,"orchard":6,"herb":5,"ranch":6,"pond":6},{"lv":9,"cost":{"food":200,"cores":250,"parts":450},"plots":11,"stoves":4,"orchard":7,"herb":5,"ranch":7,"pond":6},{"lv":10,"cost":{"food":250,"cores":320,"parts":550},"plots":12,"stoves":4,"orchard":8,"herb":6,"ranch":8,"pond":7}],"recipes":[{"lv":2,"ing":true,"min":20,"out":"flour","need":{"wheat":2}},{"lv":2,"ing":true,"min":30,"out":"butter","need":{"milk":2}},{"lv":4,"ing":true,"min":20,"out":"sugar","need":{"sugarcane":1}},{"lv":4,"ing":true,"min":30,"out":"tofu","need":{"soybean":2}},{"lv":4,"ing":true,"min":10,"out":"soymilk","need":{"soybean":1}},{"lv":4,"ing":true,"min":60,"out":"cheese","need":{"milk":2}},{"lv":7,"ing":true,"min":60,"out":"chocolate","need":{"cocoa":1,"sugar":1}},{"lv":8,"ing":true,"min":60,"out":"jam_strawberry","need":{"sugar":1,"strawberry":3}},{"lv":8,"ing":true,"min":60,"out":"jam_mango","need":{"mango":3,"sugar":1}},{"lv":9,"ing":true,"min":90,"out":"ice_mango","need":{"milk":2,"mango":1,"sugar":1}},{"lv":9,"ing":true,"min":90,"out":"ice_matcha","need":{"tea":2,"milk":2,"sugar":1}},{"lv":10,"ing":true,"min":120,"out":"oolong","need":{"tea":3}},{"lv":10,"ing":true,"min":90,"out":"blacktea","need":{"tea":3}},{"lv":1,"min":10,"out":"onigiri","need":{"rice":2}},{"lv":1,"min":10,"out":"toast","need":{"wheat":2}},{"lv":1,"min":10,"out":"porridge","res":{"water":2},"need":{"rice":1}},{"lv":1,"min":15,"out":"friedrice","need":{"rice":2,"scallion":1}},{"lv":2,"min":15,"out":"bagel","need":{"wheat":2,"scallion":1}},{"lv":2,"min":10,"out":"popcorn","need":{"corn":2}},{"lv":2,"min":20,"out":"cornsoup","res":{"water":2},"need":{"corn":2,"potato":1}},{"lv":2,"min":20,"out":"potsticker","need":{"wheat":2,"cabbage":1,"scallion":1}},{"lv":3,"min":30,"out":"curry","res":{"food":3},"need":{"rice":2,"carrot":1,"potato":1}},{"lv":3,"min":30,"out":"lurou","res":{"food":4},"need":{"rice":2,"soybean":1}},{"lv":3,"min":15,"out":"beans","need":{"tomato":1,"soybean":2}},{"lv":3,"min":10,"out":"oj","need":{"orange":2},"fruitneed":true},{"lv":4,"min":40,"out":"beefnoodle","res":{"food":6},"need":{"wheat":2,"tomato":1,"scallion":1}},{"lv":4,"min":15,"out":"spicynoodle","need":{"chili":1,"wheat":2}},{"lv":4,"min":20,"out":"cookie","need":{"wheat":1,"sugarcane":1}},{"lv":4,"min":25,"out":"pudding","res":{"food":3,"water":1},"need":{"sugarcane":1}},{"lv":5,"min":10,"out":"lemontea","res":{"water":1},"need":{"tea":1,"sugarcane":1}},{"lv":5,"min":10,"out":"greentea","res":{"water":1},"need":{"tea":1}},{"lv":5,"min":15,"out":"gingertea","res":{"water":1},"need":{"ginger":1,"sugarcane":1}},{"lv":5,"min":30,"out":"croissant","res":{"food":2},"need":{"wheat":3}},{"lv":5,"min":25,"out":"donut","need":{"wheat":2,"sugarcane":1}},{"lv":5,"min":40,"out":"hotpot","res":{"food":5},"need":{"chili":1,"tomato":1,"cabbage":1}},{"lv":6,"min":10,"out":"coffee","res":{"water":1},"need":{"coffee":1}},{"lv":6,"min":15,"out":"latte","res":{"food":2,"water":1},"need":{"coffee":1}},{"lv":6,"min":30,"out":"icecream","res":{"water":2},"need":{"sugarcane":1,"strawberry":1},"fruitneed":true},{"lv":6,"min":45,"out":"pizza","res":{"food":4},"need":{"wheat":2,"tomato":2}},{"lv":6,"min":60,"out":"ramen","res":{"food":8},"need":{"wheat":3,"soybean":1,"scallion":1}},{"lv":7,"min":20,"out":"bubbletea","res":{"food":2},"need":{"tea":1,"potato":1,"sugarcane":1}},{"lv":7,"min":15,"out":"cocoa","res":{"food":1},"need":{"cocoa":1,"sugarcane":1}},{"lv":7,"min":20,"out":"smoothie","need":{"mango":1,"banana":1,"strawberry":1},"fruitneed":true},{"lv":7,"min":45,"out":"honeycake","res":{"food":2},"need":{"wheat":2,"sugarcane":2}},{"lv":8,"min":50,"out":"macaron","need":{"wheat":1,"sugarcane":2,"strawberry":1},"fruitneed":true},{"lv":8,"min":60,"out":"cheesecake","res":{"food":5},"need":{"wheat":2,"sugarcane":1,"strawberry":1},"fruitneed":true},{"lv":9,"min":90,"out":"chocobox","need":{"cocoa":3,"sugarcane":2}},{"lv":9,"min":120,"out":"grandmasoup","res":{"food":10,"water":5},"need":{"carrot":1,"ginger":1,"scallion":1}},{"lv":10,"min":240,"out":"feast","res":{"food":40,"water":20},"need":{"rice":5,"cocoa":1,"ginger":2,"tomato":2,"cabbage":2}},{"lv":1,"min":10,"out":"f_scallionegg","need":{"egg":1,"scallion":2}},{"lv":1,"min":10,"out":"f_congee","need":{"rice":1,"sweetpotato":1}},{"lv":1,"min":10,"out":"f_peaegg","need":{"egg":1,"pea":2}},{"lv":2,"min":10,"out":"f_onionpork","need":{"pork":1,"scallion":2}},{"lv":1,"min":10,"out":"f_steamegg","need":{"egg":2,"shiitake":1}},{"lv":1,"min":30,"out":"f_lemonchicken","need":{"lemon":1,"chickenmeat":1}},{"lv":2,"min":30,"out":"f_pancake","need":{"egg":1,"milk":1,"flour":1,"butter":1}},{"lv":4,"min":30,"out":"f_potatogratin","need":{"butter":1,"cheese":1,"potato":2}},{"lv":4,"min":60,"out":"f_trufflerisotto","need":{"rice":1,"butter":1,"cheese":1,"truffle":1}},{"lv":2,"min":10,"out":"f_grilledcorn","need":{"corn":2}},{"lv":2,"min":10,"out":"f_cornsoup","need":{"corn":2,"milk":1}},{"lv":2,"min":10,"out":"f_cabbagepork","need":{"pork":1,"cabbage":1}},{"lv":2,"min":10,"out":"f_carrotegg","need":{"egg":1,"carrot":2}},{"lv":2,"min":10,"out":"f_cucumbersalad","need":{"garlic":1,"cucumber":2}},{"lv":2,"min":10,"out":"f_pepperpork","need":{"pork":1,"bellpepper":2}},{"lv":2,"min":30,"out":"f_fishfragrant","need":{"pork":1,"garlic":1,"eggplant":2}},{"lv":2,"min":30,"out":"f_bamboosoup","need":{"pork":1,"bamboo":2}},{"lv":2,"min":30,"out":"f_threecup","need":{"basil":1,"garlic":1,"chickenmeat":1}},{"lv":2,"min":60,"out":"f_steak","need":{"beef":2,"butter":1,"garlic":1}},{"lv":3,"min":10,"out":"f_tomatoegg","need":{"egg":1,"tomato":2}},{"lv":3,"min":10,"out":"f_cherrymilk","need":{"milk":1,"cherry":2}},{"lv":3,"min":10,"out":"f_daikonsoup","need":{"pork":1,"daikon":1}},{"lv":3,"min":10,"out":"f_onionrings","need":{"egg":1,"flour":1,"yellowonion":2}},{"lv":3,"min":10,"out":"f_honeylemon","need":{"honey":1,"lemon":1}},{"lv":3,"min":10,"out":"f_woodearsalad","need":{"garlic":1,"woodear":2}},{"lv":3,"min":10,"out":"f_mintlemonade","need":{"mint":1,"honey":1,"lemon":1}},{"lv":3,"min":10,"out":"f_bananamilk","need":{"milk":1,"banana":1}},{"lv":4,"min":10,"out":"f_homestyletofu","need":{"pork":1,"tofu":1,"scallion":1}},{"lv":5,"min":10,"out":"f_gooseeggrice","need":{"rice":2,"gooseegg":1,"scallion":1}},{"lv":3,"min":10,"out":"f_turnipcake","need":{"rice":2,"daikon":2}},{"lv":3,"min":30,"out":"f_tomatobeef","need":{"beef":1,"tomato":2}},{"lv":3,"min":30,"out":"f_pumpkinsoup","need":{"milk":1,"butter":1,"pumpkin":1}},{"lv":4,"min":30,"out":"f_cheeseomelet","need":{"egg":2,"cheese":1,"tomato":1}},{"lv":3,"min":60,"out":"f_roastduck","need":{"honey":1,"duckmeat":2}},{"lv":4,"min":60,"out":"f_hotpot","need":{"corn":1,"pork":1,"tofu":1,"cabbage":1,"shiitake":1}},{"lv":5,"min":60,"out":"f_honeygoose","need":{"honey":1,"goosemeat":1}},{"lv":4,"min":10,"out":"f_orangejelly","need":{"sugar":1,"orange":2}},{"lv":4,"min":10,"out":"f_saltysoymilk","need":{"soymilk":1,"scallion":1,"coriander":1}},{"lv":4,"min":10,"out":"f_enokiroll","need":{"pork":1,"enoki":1}},{"lv":4,"min":10,"out":"f_peanutsoup","need":{"sugar":1,"peanut":2}},{"lv":4,"min":10,"out":"f_fagao","need":{"flour":2,"sugar":1}},{"lv":4,"min":30,"out":"f_applepie","need":{"apple":2,"flour":1,"sugar":1,"butter":1}},{"lv":4,"min":30,"out":"f_strawberrycake","need":{"egg":2,"flour":1,"sugar":1,"strawberry":2}},{"lv":4,"min":30,"out":"f_kungpao","need":{"chili":1,"peanut":1,"chickenmeat":1}},{"lv":4,"min":30,"out":"f_goatpudding","need":{"egg":1,"sugar":1,"goatmilk":1}},{"lv":5,"min":10,"out":"f_spinachegg","need":{"egg":1,"spinach":2}},{"lv":5,"min":10,"out":"f_okraegg","need":{"egg":1,"okra":2}},{"lv":5,"min":10,"out":"f_gingerbreadman","need":{"flour":1,"honey":1,"ginger":1}},{"lv":5,"min":30,"out":"f_sesamechicken","need":{"ginger":2,"chickenmeat":1}},{"lv":5,"min":30,"out":"f_melonmilk","need":{"milk":1,"melon":1}},{"lv":5,"min":30,"out":"f_pineapplecake","need":{"flour":1,"sugar":1,"butter":1,"pineapple":2}},{"lv":5,"min":30,"out":"f_taroball","need":{"taro":2,"sugar":1,"sweetpotato":1}},{"lv":5,"min":30,"out":"f_mangoice","need":{"milk":1,"mango":2,"sugar":1}},{"lv":7,"min":30,"out":"f_turkeyleg","need":{"rosemary":1,"turkeymeat":1}},{"lv":7,"min":30,"out":"f_turkeysandwich","need":{"flour":1,"cabbage":1,"turkeymeat":1}},{"lv":5,"min":30,"out":"f_mangoshake","need":{"milk":1,"mango":1,"sugar":1}},{"lv":9,"min":30,"out":"f_buffalopudding","need":{"egg":1,"sugar":1,"buffalomilk":1}},{"lv":10,"min":30,"out":"f_blacktealatte","need":{"milk":1,"blacktea":1}},{"lv":5,"min":60,"out":"f_gingerduck","need":{"ginger":2,"duckmeat":2}},{"lv":5,"min":60,"out":"f_lambpot","need":{"lamb":2,"ginger":1,"cabbage":1}},{"lv":5,"min":60,"out":"f_lambchop","need":{"lamb":2,"garlic":1,"rosemary":1}},{"lv":5,"min":60,"out":"f_buddhajump","need":{"pork":2,"taro":1,"bamboo":2,"shiitake":2,"chickenmeat":1}},{"lv":6,"min":60,"out":"f_giantpudding","need":{"milk":2,"sugar":1,"ostrichegg":1}},{"lv":6,"min":10,"out":"f_watermelonmilk","need":{"milk":1,"watermelon":1}},{"lv":6,"min":10,"out":"f_butteroyster","need":{"butter":1,"kingoyster":2}},{"lv":6,"min":10,"out":"f_saltedbitter","need":{"duckegg":1,"bittermelon":2}},{"lv":6,"min":10,"out":"f_butterasparagus","need":{"butter":1,"asparagus":2}},{"lv":6,"min":10,"out":"f_yamsoup","need":{"yam":1,"pork":1}},{"lv":6,"min":30,"out":"f_bitterchicken","need":{"pineapple":1,"bittermelon":1,"chickenmeat":1}},{"lv":7,"min":10,"out":"f_lotussoup","need":{"pork":1,"lotusroot":1}},{"lv":7,"min":10,"out":"f_dragonmilk","need":{"milk":1,"dragonfruit":1}},{"lv":7,"min":30,"out":"f_lavendercookie","need":{"flour":1,"sugar":1,"butter":1,"lavender":1}},{"lv":7,"min":30,"out":"f_lycheeice","need":{"sugar":1,"lychee":2}},{"lv":7,"min":30,"out":"f_coconutsago","need":{"milk":1,"taro":1,"sugar":1,"coconut":1}},{"lv":9,"min":30,"out":"f_goldomelet","need":{"goldegg":1,"scallion":1}},{"lv":7,"min":60,"out":"f_tiramisu","need":{"egg":2,"cheese":1,"coffee":1,"chocolate":1}},{"lv":7,"min":60,"out":"f_blackforest","need":{"egg":2,"flour":1,"butter":1,"cherry":2,"chocolate":2}},{"lv":7,"min":60,"out":"f_vanillaicecream","need":{"egg":1,"milk":2,"sugar":1,"vanilla":1}},{"lv":7,"min":60,"out":"f_lingzhisoup","need":{"ginger":1,"lingzhi":1,"chickenmeat":1}},{"lv":7,"min":60,"out":"f_tropicaltart","need":{"flour":1,"mango":1,"butter":1,"coconut":1,"strawberry":2}},{"lv":9,"min":60,"out":"f_goldtart","need":{"flour":1,"sugar":1,"butter":1,"goldegg":1}},{"lv":9,"min":60,"out":"f_fruitsundae","need":{"banana":1,"ice_mango":1,"strawberry":1}},{"lv":8,"min":10,"out":"f_blueberrymilk","need":{"milk":1,"blueberry":2}},{"lv":8,"min":10,"out":"f_pepperchicken","need":{"chickenmeat":1,"colorpepper":2}},{"lv":8,"min":10,"out":"f_radishsalad","need":{"cucumber":1,"cherryradish":2}},{"lv":8,"min":10,"out":"f_purpleballs","need":{"sugar":1,"purplepotato":2}},{"lv":8,"min":10,"out":"f_rainbowpopcorn","need":{"butter":1,"rainbowcorn":2}},{"lv":8,"min":10,"out":"f_whitestrawberrymilk","need":{"milk":1,"whitestrawberry":2}},{"lv":8,"min":10,"out":"f_blacktomatosalad","need":{"cheese":1,"blacktomato":2}},{"lv":8,"min":10,"out":"f_driedpersimmon","need":{"persimmon":3}},{"lv":8,"min":30,"out":"f_grapetart","need":{"flour":1,"grape":2,"sugar":1,"butter":1}},{"lv":8,"min":30,"out":"f_goldonigiri","need":{"egg":1,"goldrice":2}},{"lv":8,"min":30,"out":"f_rainbowsoup","need":{"milk":1,"butter":1,"rainbowcorn":2}},{"lv":8,"min":30,"out":"f_blueberrypancake","need":{"egg":1,"flour":1,"blueberry":2}},{"lv":8,"min":30,"out":"f_stuffedpepper","need":{"pork":1,"colorpepper":2,"yellowonion":1}},{"lv":8,"min":30,"out":"f_goldfriedrice","need":{"egg":1,"goldrice":2,"scallion":1}},{"lv":8,"min":30,"out":"f_daifuku","need":{"rice":2,"sugar":1,"whitestrawberry":1}},{"lv":8,"min":30,"out":"f_grainrice","need":{"corn":1,"wheat":1,"soybean":1,"goldrice":1,"sweetpotato":1}},{"lv":8,"min":30,"out":"f_waxappletea","need":{"tea":1,"waxapple":1}},{"lv":8,"min":60,"out":"f_fruitplatter","need":{"grape":1,"melon":1,"lychee":1,"watermelon":1}},{"lv":8,"min":60,"out":"f_durianpuff","need":{"flour":1,"butter":1,"durian":1}},{"lv":9,"min":10,"out":"f_goldapplejuice","need":{"goldapple":2}},{"lv":9,"min":30,"out":"f_cottoncocoa","need":{"milk":1,"chocolate":1,"cottoncandy":1}},{"lv":9,"min":30,"out":"f_aurorajuice","need":{"auroragrape":2}},{"lv":9,"min":30,"out":"f_mangosteenbowl","need":{"honey":1,"sugar":1,"mangosteen":1}},{"lv":9,"min":30,"out":"f_sunflowercookie","need":{"flour":1,"butter":1,"sunflower":1}},{"lv":9,"min":30,"out":"f_passiontea","need":{"tea":1,"passionfruit":1}},{"lv":9,"min":30,"out":"f_avocadomilk","need":{"milk":1,"avocado":1}},{"lv":9,"min":60,"out":"f_starpudding","need":{"egg":1,"milk":1,"sugar":1,"starherb":1}},{"lv":9,"min":60,"out":"f_amberrisotto","need":{"rice":2,"cheese":1,"amberpumpkin":1}},{"lv":9,"min":60,"out":"f_phoenixchicken","need":{"chickenmeat":2,"phoenixpepper":1}},{"lv":10,"min":60,"out":"f_moontangyuan","need":{"rice":2,"sugar":1,"osmanthus":1}},{"lv":9,"min":60,"out":"f_amberpie","need":{"milk":1,"flour":1,"butter":1,"amberpumpkin":1}},{"lv":9,"min":60,"out":"f_figtart","need":{"fig":1,"flour":1,"butter":1}},{"lv":9,"min":120,"out":"f_starfeast","need":{"truffle":1,"vanilla":1,"starherb":1,"ostrichegg":1}},{"lv":9,"min":120,"out":"f_moonlotustea","need":{"tea":1,"honey":1,"moonlotus":1}},{"lv":9,"min":120,"out":"f_starlayercake","need":{"milk":1,"flour":1,"starherb":1,"whitestrawberry":2}},{"lv":10,"min":120,"out":"f_moonricecake","need":{"rice":3,"sugar":1,"osmanthus":1}},{"lv":9,"min":120,"out":"f_aurorasoda","need":{"honey":1,"lemon":1,"auroragrape":2}},{"lv":9,"min":120,"out":"f_phoenixpot","need":{"beef":1,"tofu":1,"garlic":1,"phoenixpepper":2}},{"lv":10,"min":30,"out":"f_peachsmoothie","need":{"milk":1,"honey":1,"peach":2}},{"lv":10,"min":30,"out":"f_peachjelly","need":{"peach":1,"sugar":1}},{"lv":10,"min":60,"out":"f_dragoneyestew","need":{"honey":1,"dragoneye":1,"chickenmeat":1}},{"lv":10,"min":60,"out":"f_starfruitjuice","need":{"honey":1,"starfruit":1}},{"lv":10,"min":60,"out":"f_roastchestnut","need":{"sugar":1,"chestnut":2}},{"lv":10,"min":120,"out":"f_peachfeast","need":{"honey":1,"peach":2,"goldrice":2,"goosemeat":1}},{"lv":10,"min":120,"out":"f_starstarfeast","need":{"chestnut":1,"starherb":1,"dragoneye":1,"moonlotus":1}},{"lv":2,"min":15,"out":"fd_scallion_minnow","need":{"scallion":2,"moon_minnow":1}},{"lv":2,"min":15,"out":"fd_fish_fried_rice","need":{"egg":1,"rice":1,"paper_boat_fish":1}},{"lv":3,"min":15,"out":"fd_tomato_carp","need":{"tomato":2,"cotton_carp":1}},{"lv":2,"min":15,"out":"fd_sweet_perch","need":{"corn":1,"honey_perch":1,"sweetpotato":1}},{"lv":5,"min":15,"out":"fd_bubble_egg","need":{"egg":1,"spinach":1,"bubble_fish":1}},{"lv":2,"min":15,"out":"fd_reed_bamboo","need":{"bamboo":1,"scallion":1,"reed_loach":1}},{"lv":4,"min":15,"out":"fd_chili_snapper","need":{"chili":1,"garlic":1,"match_snapper":1}},{"lv":3,"min":15,"out":"fd_daikon_catfish","need":{"daikon":2,"bun_catfish":1}},{"lv":3,"min":15,"out":"fd_pumpkin_congee","need":{"rice":1,"pumpkin":1,"dew_carp":1}},{"lv":3,"min":15,"out":"fd_bean_catfish","need":{"soybean":1,"bellpepper":1,"bean_sprout_catfish":1}},{"lv":2,"min":15,"out":"fd_cucumber_slipper","need":{"garlic":1,"cucumber":2,"slipper_fish":1}},{"lv":5,"min":15,"out":"fd_strawberry_salad","need":{"spinach":1,"strawberry":1,"strawberry_snapper":1}},{"lv":5,"min":20,"out":"fd_mushroom_rain","need":{"ginger":1,"shiitake":2,"rain_snapper":1}},{"lv":5,"min":20,"out":"fd_apple_maple","need":{"apple":1,"sugarcane":1,"maple_carp":1}},{"lv":5,"min":20,"out":"fd_onion_eel","need":{"ginger":1,"bell_eel":1,"yellowonion":1}},{"lv":5,"min":20,"out":"fd_mint_guppy","need":{"mint":1,"cucumber":1,"mint_guppy":1}},{"lv":5,"min":20,"out":"fd_coriander_goby","need":{"wheat":1,"coriander":1,"star_goby":1}},{"lv":5,"min":20,"out":"fd_woodear_carpenter","need":{"garlic":1,"woodear":1,"carpenter_fish":1}},{"lv":5,"min":20,"out":"fd_cherry_trout","need":{"cherry":2,"sakura_trout":1}},{"lv":5,"min":20,"out":"fd_cabbage_hotpot","need":{"daikon":1,"cabbage":1,"snail_catfish":1}},{"lv":5,"min":20,"out":"fd_lemon_chime","need":{"basil":1,"lemon":1,"wind_chime_perch":1}},{"lv":5,"min":20,"out":"fd_orange_snapper","need":{"ginger":1,"orange":2,"honey_pomelo_snapper":1}},{"lv":5,"min":20,"out":"fd_tea_porcelain","need":{"tea":1,"rice":1,"porcelain_carp":1}},{"lv":5,"min":20,"out":"fd_carrot_lantern","need":{"carrot":1,"yellowonion":1,"paper_lantern_loach":1}},{"lv":5,"min":20,"out":"fd_corn_cloud","need":{"corn":2,"milk":1,"cloud_guppy":1}},{"lv":7,"min":30,"out":"fd_melon_jelly","need":{"mint":1,"melon":1,"lantern_jelly":1}},{"lv":7,"min":30,"out":"fd_woodear_ink","need":{"soybean":1,"woodear":2,"ink_shark":1}},{"lv":7,"min":30,"out":"fd_ginger_mackerel","need":{"ginger":1,"spinach":1,"glass_mackerel":1}},{"lv":7,"min":30,"out":"fd_yam_clay","need":{"yam":1,"chili":1,"clay_gator":1}},{"lv":7,"min":30,"out":"fd_soy_whale","need":{"milk":1,"soybean":2,"stalactite_whale":1}},{"lv":7,"min":30,"out":"fd_sugar_fish","need":{"sugarcane":1,"strawberry":1,"sugar_snapper":1}},{"lv":7,"min":30,"out":"fd_rosemary_salmon","need":{"potato":1,"rosemary":1,"spruce_salmon":1}},{"lv":7,"min":30,"out":"fd_crystal_mango","need":{"mint":1,"mango":1,"crystal_shrimp":1}},{"lv":7,"min":30,"out":"fd_pumpkin_amber","need":{"pumpkin":1,"sugarcane":1,"amber_perch":1}},{"lv":7,"min":30,"out":"fd_taro_nebula","need":{"tea":1,"taro":2,"nebula_anglerfish":1}},{"lv":7,"min":30,"out":"fd_lotus_bell","need":{"pork":1,"lotusroot":1,"bronze_bell_whale":1}},{"lv":7,"min":30,"out":"fd_okra_armor","need":{"okra":1,"garlic":1,"coral_armor_shark":1}},{"lv":9,"min":45,"out":"fd_clock_butter","need":{"milk":1,"wheat":2,"clock_carp":1}},{"lv":9,"min":45,"out":"fd_grape_aurora","need":{"grape":1,"coconut":1,"aurora_ray":1}},{"lv":9,"min":45,"out":"fd_banana_mirror","need":{"mango":1,"banana":1,"mirror_fish":1}},{"lv":9,"min":45,"out":"fd_coconut_turtle","need":{"coconut":1,"lingzhi":1,"starsea_turtle":1}},{"lv":9,"min":45,"out":"fd_ginger_frost","need":{"ginger":1,"lingzhi":1,"frost_dragon_carp":1}},{"lv":9,"min":45,"out":"fd_vanilla_backlight","need":{"milk":1,"vanilla":1,"backlight_whale":1}},{"lv":9,"min":45,"out":"fd_dragonfruit_wing","need":{"chili":1,"dragonfruit":1,"wing_mackerel":1}},{"lv":10,"min":60,"out":"fd_moonlotus_rice","need":{"goldrice":1,"moonlotus":1,"xuguang_fish":1}},{"lv":10,"min":60,"out":"fd_lingzhi_broth","need":{"daikon":2,"lingzhi":1,"dragon_bone_whale":1}},{"lv":10,"min":60,"out":"fd_lychee_counter","need":{"lychee":1,"goldapple":1,"counter_king":1}},{"lv":10,"min":60,"out":"fd_vanilla_mirror","need":{"vanilla":1,"auroragrape":1,"sky_mirror_whale":1}},{"lv":10,"min":60,"out":"fd_peach_white","need":{"peach":1,"ginger":1,"nameless_white_carp":1}},{"lv":10,"min":60,"out":"fd_coffee_cloud","need":{"cocoa":1,"coffee":1,"cloud_peak_shark":1}}],"areas":[{"id":"field","name":"田","emoji":"🌱","cap":"plots","verb":"種","note":"蔬菜、穀物、菇類。種一次收一次，用水。"},{"id":"orchard","name":"果園","emoji":"🌳","cap":"orchard","verb":"種","note":"果樹、茶樹、咖啡樹。種下去會一直結果，熟了就收，收完自己再長（種的時候用 3 倍的水）。"},{"id":"herb","name":"香草園","emoji":"🌿","cap":"herb","verb":"種","note":"九層塔、薄荷、迷迭香、蔥薑蒜辣椒這些香草和辛香料，長得快，用水。"},{"id":"ranch","name":"牧場","emoji":"🐔","cap":"ranch","verb":"養","note":"養一次會一直產蛋、奶、蜂蜜（買小動物用 3 倍食物）；肉是一次性的。"},{"id":"pond","name":"魚塭","emoji":"🐟","cap":"pond","verb":"養","note":"星露島的 50 種魚，用食物當飼料，養大收一次。"}]}$json$::jsonb;
$function$;
grant execute on function public.doom_farm_cat() to authenticated;

create or replace function public.doom_farm_area(p_crop text)
returns text language sql immutable
as $function$
  select coalesce((select el->>'a' from jsonb_array_elements(public.doom_farm_cat()->'crops') el where el->>'id' = p_crop), 'field');
$function$;

-- 種／養：每一區有自己的格子；果樹和牧場動物種一次會一直產（下手時花 3 倍）
create or replace function public.doom_farm_plant(p_crop text, p_n integer default 1)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  cat jsonb := public.doom_farm_cat();
  st public.doom_state%rowtype;
  c jsonb; lvrow jsonb; free integer; n integer; plots jsonb; i integer; now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  usefeed boolean; cost integer; have integer; area text; cap integer; used integer; mins numeric; keep boolean; b integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  select el into c from jsonb_array_elements(cat->'crops') el where el->>'id' = p_crop;
  if c is null then raise exception '沒有這種作物'; end if;
  if c->>'g' = 'goods' then raise exception '這個要在廚房做'; end if;
  if (st.dfarm->>'lv')::int < (c->>'lv')::int then raise exception '農場 Lv% 才能種', c->>'lv'; end if;
  area := coalesce(c->>'a', 'field');
  keep := c ? 'keep';
  usefeed := c ? 'feed';
  cost := greatest(1, coalesce((c->>'feed')::int, (c->>'water')::int, 1)) * case when keep then 3 else 1 end;
  have := case when usefeed then st.food else st.water end;
  lvrow := cat->'levels'->((st.dfarm->>'lv')::int - 1);
  cap := coalesce((lvrow->>(case area when 'field' then 'plots' else area end))::int, 0);
  plots := coalesce(st.dfarm->'plots', '[]'::jsonb);
  select count(*) into used from jsonb_array_elements(plots) p where public.doom_farm_area(p->>'crop') = area;
  free := cap - used;
  if free <= 0 then raise exception '這一區滿了（% 格）', cap; end if;
  n := least(greatest(1, coalesce(p_n, 1)), free, have / cost);
  if n <= 0 then raise exception '%不夠（一格要 % 份）', case when usefeed then '食物' else '水' end, cost; end if;
  mins := (c->>'min')::numeric;
  if area = 'pond' then
    b := public.doom_buddy(st, 'fisher');
    mins := mins * case b when 2 then 0.6 when 1 then 0.75 else 1 end;
  end if;
  for i in 1..n loop
    plots := plots || (jsonb_build_object('crop', p_crop, 't0', now_ms, 't1', now_ms + ceil(mins)::bigint * 60000)
      || case when keep then '{"keep":true}'::jsonb else '{}'::jsonb end);
  end loop;
  if usefeed then
    update public.doom_state set food = food - n * cost, dfarm = jsonb_set(dfarm, '{plots}', plots) where user_id = u;
  else
    update public.doom_state set water = water - n * cost, dfarm = jsonb_set(dfarm, '{plots}', plots) where user_id = u;
  end if;
  return json_build_object('n', n, 'crop', p_crop, 'cost', n * cost, 'feed', usefeed, 'area', area);
end;
$function$;
grant execute on function public.doom_farm_plant(text, integer) to authenticated;

-- 🧺 收：全部熟的一起收。果樹和動物收完留著繼續長；今天專注滿 60 分鐘每格多 1 份；牧羊女、園丁爺爺再加
create or replace function public.doom_farm_harvest()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  cat jsonb := public.doom_farm_cat();
  st public.doom_state%rowtype;
  p jsonb; c jsonb; keep jsonb := '[]'::jsonb; got jsonb := '{}'::jsonb; q integer; bonus integer; fmin integer;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint; k text; area text; b_shep integer; b_gard integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  select coalesce(sum(duration_seconds), 0) / 60 into fmin from public.focus_sessions where user_id = u and session_date = public.app_today();
  bonus := case when fmin >= 60 then 1 else 0 end;
  b_shep := public.doom_buddy(st, 'shepherd');
  b_gard := public.doom_buddy(st, 'gardener');
  for p in select x from jsonb_array_elements(coalesce(st.dfarm->'plots', '[]'::jsonb)) x loop
    if (p->>'t1')::bigint > now_ms then keep := keep || p; continue; end if;
    select el into c from jsonb_array_elements(cat->'crops') el where el->>'id' = p->>'crop';
    if c is null then continue; end if;
    area := coalesce(c->>'a', 'field');
    q := (c->>'yield')::int + bonus
      + case when area = 'ranch' then b_shep when area in ('orchard', 'herb') then b_gard else 0 end;
    k := coalesce(c->>'fruit', c->>'id');
    got := got || jsonb_build_object(k, coalesce((got->>k)::int, 0) + q);
    if c ? 'fruit' then perform public.doom_pantry_add(u, c->>'fruit', q);
    else update public.doom_state set dcrops = dcrops || jsonb_build_object(c->>'id', coalesce((dcrops->>(c->>'id'))::int, 0) + q) where user_id = u; end if;
    if p ? 'keep' then
      keep := keep || (p || jsonb_build_object('t0', now_ms, 't1', now_ms + (c->>'min')::bigint * 60000));
    end if;
  end loop;
  if got = '{}'::jsonb then raise exception '還沒有熟的'; end if;
  update public.doom_state set dfarm = jsonb_set(dfarm, '{plots}', keep) where user_id = u;
  return json_build_object('got', got, 'bonus', bonus);
end;
$function$;
grant execute on function public.doom_farm_harvest() to authenticated;

-- 移除一格（砍掉果樹、把動物放生），空出位置
create or replace function public.doom_farm_remove(p_i integer)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); st public.doom_state%rowtype; plots jsonb; p jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  plots := coalesce(st.dfarm->'plots', '[]'::jsonb);
  p := plots->p_i;
  if p is null then raise exception '這格是空的'; end if;
  update public.doom_state set dfarm = jsonb_set(dfarm, '{plots}', plots - p_i) where user_id = u;
  return json_build_object('removed', p->>'crop');
end;
$function$;
grant execute on function public.doom_farm_remove(integer) to authenticated;

-- 🍳 做菜（🧑‍🍳 廚師阿姨：快 25%／40%）
create or replace function public.doom_farm_cook(p_out text, p_n integer default 1)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  cat jsonb := public.doom_farm_cat();
  st public.doom_state%rowtype;
  r jsonb; lvrow jsonb; n integer; k text; v int; maxn integer := 20; stoves jsonb; pk text; fromc integer; mins integer; b integer;
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
    fromc := least(coalesce((st.dcrops->>k)::int, 0), v * n);
    if fromc > 0 then
      update public.doom_state set dcrops = dcrops || jsonb_build_object(k, (dcrops->>k)::int - fromc) where user_id = u;
    end if;
    if v * n > fromc then
      pk := case k when 'grape' then 'grapes' when 'peach' then 'goldpeach' else k end;
      update public.doom_state set pantry = case when (pantry->>pk)::int <= v * n - fromc then pantry - pk
        else pantry || jsonb_build_object(pk, (pantry->>pk)::int - (v * n - fromc)) end where user_id = u;
    end if;
  end loop;
  if r ? 'res' then perform public.doom_apply(u, public.doom_neg((select jsonb_object_agg(key, value::int * n) from jsonb_each_text(r->'res'))), 'doom-cook:' || gen_random_uuid()); end if;
  b := public.doom_buddy(st, 'chef');
  mins := ceil((r->>'min')::int * n * case b when 2 then 0.6 when 1 then 0.75 else 1 end)::int;
  stoves := stoves || (jsonb_build_object('out', p_out, 'n', n, 't0', now_ms, 't1', now_ms + mins::bigint * 60000)
    || case when r ? 'ing' then '{"ing":true}'::jsonb else '{}'::jsonb end);
  update public.doom_state set dfarm = jsonb_set(dfarm, '{stoves}', stoves) where user_id = u;
  return json_build_object('out', p_out, 'n', n, 'min', mins);
end;
$function$;
grant execute on function public.doom_farm_cook(text, integer) to authenticated;
