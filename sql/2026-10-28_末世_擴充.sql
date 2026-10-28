-- =========================================================
-- 序光計畫：☢️ 末世：擴充（快速回饋、未知、抽獎、累積）
-- 要先執行「2026-10-28_末世.sql」和「2026-10-28_末世_專注搜刮.sql」。可以重複執行。
--
--   連擊：30 分鐘內連續完成事情，每連到 3 的倍數 +1 搜刮券
--   今日生存度：任務 10 分、專案打勾 5 分、專注每分鐘 1 分；滿 100 / 200 / 300 開銅 / 銀 / 金箱
--   同伴好感度：每天摸一次 +5，送食物 +12；3 級解鎖故事、5 級能力加倍
--   隱藏區域：夜市廢墟、天台花園、地下碉堡、天文台
--   神秘訊號：專注搜刮的時間慢慢解開密碼，解開後通往隱藏區域
--   未鑑定物品：搜刮時有時撿到「？？？」，再專注 30 分鐘就能鑑定
--   前世記憶碎片 12 片、每日轉盤、神秘商人限時貨架、翻倍卡、銅銀金補給箱
--   生存天數里程碑、區域熟練度、基地等級、收藏組合、專注紀念碑
--   倖存者日記（最近 7 天）
--   生活小物 38 種、6 個系列（搜刮、抽獎時額外撿到）
--   區域物資擴充：街頭 8、超市 6、其他區域各 4（共 118 樣）
-- =========================================================

alter table public.doom_state
  add column if not exists bond jsonb not null default '{}'::jsonb,
  add column if not exists unid jsonb not null default '[]'::jsonb,
  add column if not exists focus_total integer not null default 0,
  add column if not exists mastery jsonb not null default '{}'::jsonb,
  add column if not exists double_cards integer not null default 0,
  add column if not exists boxes jsonb not null default '{"bronze":0,"silver":0,"gold":0}'::jsonb,
  add column if not exists memories jsonb not null default '[]'::jsonb,
  add column if not exists zones_unlocked jsonb not null default '[]'::jsonb,
  add column if not exists signal_no integer not null default 0,
  add column if not exists signal_min integer not null default 0,
  add column if not exists seen jsonb not null default '{}'::jsonb,
  add column if not exists rewards jsonb not null default '{}'::jsonb,
  add column if not exists combo_best integer not null default 0;

alter table public.doom_days
  add column if not exists spin jsonb,
  add column if not exists shop jsonb,
  add column if not exists shop_bought jsonb not null default '[]'::jsonb,
  add column if not exists chests integer not null default 0,
  add column if not exists bonded jsonb not null default '[]'::jsonb,
  add column if not exists combo integer not null default 0,
  add column if not exists combo_n integer not null default 0;


-- ---------- 📚 擴充圖鑑 ----------
create or replace function public.doom_extra()
returns jsonb language sql immutable
as $extra$
select $j${
"memories": [
  {"id":"m01","title":"那一天","text":"前世的末世第一天，你躲在房間裡滑手機，以為一切很快就會結束。"},
  {"id":"m02","title":"沒寫完的計畫","text":"書桌上有一張寫了一半的計畫表。你總是說「明天再開始」。"},
  {"id":"m03","title":"錯過的訊號","text":"收音機曾經傳來救援的座標，但你那時睡著了。"},
  {"id":"m04","title":"空蕩的倉庫","text":"第十天，倉庫裡只剩一瓶水。你後悔沒有早一點出門。"},
  {"id":"m05","title":"朋友的背影","text":"有人邀你一起走，你說「再等等」。那是最後一次見到他。"},
  {"id":"m06","title":"圖書館","text":"你曾經在圖書館讀完一整本書，那是前世少數覺得自己很強大的時刻。"},
  {"id":"m07","title":"第一道光","text":"前世的最後，你看見遠方有光。你一直想知道那是什麼。"},
  {"id":"m08","title":"重來的機會","text":"醒來的時候，你發現自己回到了起點。這一次，你決定不再等。"},
  {"id":"m09","title":"一個習慣","text":"前世的你學到一件事：每天做一點點，比一次做很多更能活下去。"},
  {"id":"m10","title":"手寫的信","text":"你曾經寫信給未來的自己：「希望你比我勇敢」。"},
  {"id":"m11","title":"同伴","text":"前世你一直是一個人。這一次，身邊有了會等你回家的夥伴。"},
  {"id":"m12","title":"序光","text":"你終於明白，那道光不是遠方的救援，而是你每天點亮的一點點努力。"}
],
"stories": {
  "dog":"牠以前有個家，主人每天傍晚帶牠散步。現在，牠每天傍晚都會坐在門口等你回來。",
  "cat":"橘貓其實是附近便利商店的店貓。店關了，牠選了最溫暖的地方：你的身邊。",
  "doctor":"醫生在末世前是急診室的夜班醫師。他說：「能救一個是一個」，然後繼續包紮下一個人。",
  "engineer":"工程師的口袋裡永遠有一把螺絲起子。他說世界壞掉了，但還能修。",
  "farmer":"農夫帶著的種子是他父親留下的。他想看它們在新世界發芽。",
  "merchant":"老商人走過很多城市。他說最值錢的東西不是金幣，是願意每天出門的人。",
  "robot":"小機器人的記憶體裡存著一句話：「請繼續努力」。它不知道是誰寫的。",
  "owl":"貓頭鷹晚上不睡覺，因為牠在幫你看著星星。牠說今晚的星星比昨天亮。"
},
"bond_perk": {
  "dog":"每天撿物資再多 2 樣","cat":"士氣每天再 +3","doctor":"基地耐久每天再 +3","engineer":"升級設施的零件改成少 25%",
  "farmer":"每天再 +1 食物","merchant":"換搜刮券只要 5 食物＋5 水","robot":"每天再 +1 搜刮券","owl":"幸運再 +3"
},
"talk": {
  "dog":["汪！今天也要出門嗎？","我在門口等你很久了。","你回來啦！尾巴停不下來！"],
  "cat":["喵。（你今天很努力，可以摸我了）","我把最暖的位置留給你。","呼嚕呼嚕……"],
  "doctor":["記得喝水，也記得休息。","專注很好，但眼睛要讓它放鬆一下。","今天的你，比昨天健康一點。"],
  "engineer":["工作台我調好了，隨時可以升級。","一顆螺絲一顆螺絲來，世界就會修好。","今天做得不錯，效率很高。"],
  "farmer":["菜園的芽又長高了。","一天澆一次水，一天做一件事。","收成是給有耐心的人的。"],
  "merchant":["年輕人，今天的貨架看過了嗎？","努力是最好的本錢。","我走過很多城市，你是最認真的倖存者。"],
  "robot":["系統檢查完畢。今日目標：繼續努力。","偵測到你的專注值上升。","嗶嗶。我會記住你今天做的事。"],
  "owl":["今晚的星星比昨天亮。","夜深了，記得早點睡。","咕咕。我替你看著外面。"]
},
"spin": [
  {"id":"s3","name":"搜刮券 ×3","emoji":"🎟️","w":24,"gain":{"scav":3}},
  {"id":"s5","name":"搜刮券 ×5","emoji":"🎟️","w":12,"gain":{"scav":5}},
  {"id":"double","name":"翻倍卡","emoji":"✖️","w":12,"gain":{"double":1}},
  {"id":"bronze","name":"銅補給箱","emoji":"📦","w":16,"gain":{"box_bronze":1}},
  {"id":"silver","name":"銀補給箱","emoji":"🎁","w":8,"gain":{"box_silver":1}},
  {"id":"unid","name":"未鑑定物品","emoji":"❓","w":10,"gain":{"unid":1}},
  {"id":"dust","name":"星屑 ×20","emoji":"✨","w":10,"gain":{"stardust":20}},
  {"id":"supply","name":"食物＋水 ×5","emoji":"🥫","w":10,"gain":{"food":5,"water":5}},
  {"id":"gold","name":"金補給箱","emoji":"👑","w":3,"gain":{"box_gold":1}},
  {"id":"ten","name":"免費十連","emoji":"🎰","w":2,"gain":{"scav":10}}
],
"shop": [
  {"id":"p_wish","name":"星願券","emoji":"🎫","price":{"parts":40},"gain":{"wish_normal":1}},
  {"id":"p_wishr","name":"稀有星願券","emoji":"🌠","price":{"parts":120},"gain":{"wish_rare":1}},
  {"id":"p_ticket","name":"召喚券","emoji":"🎟️","price":{"parts":45},"gain":{"ticket_normal":1}},
  {"id":"p_double","name":"翻倍卡","emoji":"✖️","price":{"parts":30},"gain":{"double":1}},
  {"id":"p_unid","name":"未鑑定物品","emoji":"❓","price":{"food":15},"gain":{"unid":1}},
  {"id":"p_bronze","name":"銅補給箱","emoji":"📦","price":{"water":15},"gain":{"box_bronze":1}},
  {"id":"p_silver","name":"銀補給箱","emoji":"🎁","price":{"gold":120},"gain":{"box_silver":1}},
  {"id":"p_gold","name":"金補給箱","emoji":"👑","price":{"gold":350},"gain":{"box_gold":1}},
  {"id":"p_scav","name":"搜刮券 ×5","emoji":"🎟️","price":{"food":12,"water":12},"gain":{"scav":5}},
  {"id":"p_relic","name":"奇異收藏品","emoji":"🔮","price":{"gold":500},"gain":{"relic":"x"}},
  {"id":"p_blueprint","name":"設施藍圖","emoji":"📐","price":{"parts":90},"gain":{"facility":"random"}},
  {"id":"p_memory","name":"前世記憶碎片","emoji":"🧩","price":{"gold":250},"gain":{"memory":"random"}}
],
"boxes": {
  "bronze":{"name":"銅補給箱","emoji":"📦","n":3,"min":"c","luck":0},
  "silver":{"name":"銀補給箱","emoji":"🎁","n":4,"min":"r","luck":10},
  "gold":{"name":"金補給箱","emoji":"👑","n":5,"min":"l","luck":25}
},
"days": [
  {"d":3,"title":"撐過三天","gain":{"box_bronze":2}},
  {"d":7,"title":"第一個星期","gain":{"box_silver":1,"scav":10}},
  {"d":14,"title":"兩週倖存者","gain":{"box_silver":2,"memory":"random"}},
  {"d":30,"title":"一個月的堅持","gain":{"box_gold":1,"relic":"x"}},
  {"d":50,"title":"半百","gain":{"box_gold":1,"double":3}},
  {"d":100,"title":"百日倖存者","gain":{"box_gold":2,"relic":"s"}},
  {"d":200,"title":"老練的倖存者","gain":{"box_gold":3,"memory":"random"}},
  {"d":365,"title":"末世一週年","gain":{"box_gold":5,"relic":"s","wish_limited":1}}
],
"monument": [
  {"h":10,"name":"木頭紀念碑","emoji":"🪵","gain":{"box_silver":1}},
  {"h":50,"name":"石頭紀念碑","emoji":"🪨","gain":{"box_gold":1}},
  {"h":100,"name":"銅像紀念碑","emoji":"🗿","gain":{"box_gold":2,"memory":"random"}},
  {"h":200,"name":"白銀紀念碑","emoji":"🏛️","gain":{"box_gold":3}},
  {"h":500,"name":"序光之塔","emoji":"🗼","gain":{"box_gold":5,"relic":"s"}}
],
"sets": [
  {"id":"loot_c","name":"末世日常","emoji":"🥫","src":"loot","tier":"c","gain":{"box_silver":1}},
  {"id":"loot_r","name":"好東西","emoji":"🎒","src":"loot","tier":"r","gain":{"box_gold":1}},
  {"id":"zone_street","name":"街頭全收集","emoji":"🏙️","src":"zone","zone":"street","gain":{"box_silver":1}},
  {"id":"zone_market","name":"超市全收集","emoji":"🏪","src":"zone","zone":"market","gain":{"box_silver":1}},
  {"id":"zone_waterworks","name":"水廠全收集","emoji":"🚰","src":"zone","zone":"waterworks","gain":{"box_silver":1}},
  {"id":"zone_hardware","name":"五金行全收集","emoji":"🔧","src":"zone","zone":"hardware","gain":{"box_silver":1}},
  {"id":"zone_hospital","name":"醫院全收集","emoji":"🏥","src":"zone","zone":"hospital","gain":{"box_silver":1}},
  {"id":"zone_library","name":"圖書館全收集","emoji":"📚","src":"zone","zone":"library","gain":{"box_silver":1}},
  {"id":"zone_subway","name":"地鐵站全收集","emoji":"🚇","src":"zone","zone":"subway","gain":{"box_gold":1}},
  {"id":"zone_military","name":"軍事基地全收集","emoji":"🪖","src":"zone","zone":"military","gain":{"box_gold":1}},
  {"id":"zone_night_market","name":"夜市全收集","emoji":"🏮","src":"zone","zone":"night_market","gain":{"box_gold":1}},
  {"id":"zone_rooftop","name":"天台全收集","emoji":"🌻","src":"zone","zone":"rooftop","gain":{"box_gold":1}},
  {"id":"zone_bunker","name":"碉堡全收集","emoji":"🔐","src":"zone","zone":"bunker","gain":{"box_gold":1}},
  {"id":"zone_observatory","name":"天文台全收集","emoji":"🔭","src":"zone","zone":"observatory","gain":{"box_gold":1}},
  {"id":"relic_x","name":"奇異收藏家","emoji":"🔮","src":"relic","tier":"x","gain":{"box_gold":2}},
  {"id":"relic_s","name":"傳說收藏家","emoji":"🌟","src":"relic","tier":"s","gain":{"box_gold":3,"wish_limited":1}},
  {"id":"comp","name":"一家人","emoji":"🏡","src":"companion","gain":{"box_gold":2,"relic":"s"}}
],
"signals": [
  {"need":180,"cipher":"三七二九……地下……入口在公園的雕像下面……","unlock":"bunker","gain":{"box_silver":1}},
  {"need":300,"cipher":"這裡是山頂的天文台。我們看得到星星，也看得到你的光。","unlock":"observatory","gain":{"box_gold":1}},
  {"need":480,"cipher":"倖存者，你不是一個人。每一個努力的人，都是一道光。我們在序光等你。","unlock":null,"gain":{"box_gold":2,"memory":"random"}}
],
"hidden": {
  "night_market":"在深夜 10 點到凌晨 4 點之間開始一段專注",
  "rooftop":"連續 7 天都有做事（任務、專案或專注）",
  "bunker":"解開第一段神秘訊號",
  "observatory":"解開第二段神秘訊號"
},
"progress": {"task":10,"step":5,"focus":1,"tiers":[100,200,300],"boxes":["bronze","silver","gold"]},
"mastery": [60,180,420,900,1800]
}$j$::jsonb
$extra$;
grant execute on function public.doom_extra() to authenticated;


-- ---------- 🗺️ 區域（加上隱藏區域） ----------
create or replace function public.doom_zones()
returns jsonb language sql immutable
as $zones$
select $j${
"zones": [
  {"id":"street","name":"街頭","emoji":"🏙️","desc":"什麼都可能撿到，最平均。","chapter":1,"min_min":0,"luck":0,"danger":0.03,"items":[
    {"id":"t_umbrella","tier":"c","name":"破雨傘","emoji":"☂️","gain":{"morale":2,"parts":1}},
    {"id":"t_bike","tier":"c","name":"腳踏車鈴","emoji":"🔔","gain":{"parts":2}},
    {"id":"t_sign","tier":"c","name":"路牌","emoji":"🪧","gain":{"parts":2,"stardust":1}},
    {"id":"t_cone","tier":"c","name":"三角錐","emoji":"🚧","gain":{"parts":1,"morale":1}},
    {"id":"t_scooter","tier":"r","name":"機車零件","emoji":"🛵","gain":{"parts":6}},
    {"id":"t_vending","tier":"r","name":"路邊販賣機","emoji":"🥤","gain":{"water":3,"food":2}},
    {"id":"t_mailbox","tier":"r","name":"郵筒","emoji":"📮","gain":{"morale":6,"stardust":5}},
    {"id":"t_car","tier":"l","name":"廢棄轎車","emoji":"🚗","gain":{"food":5,"water":5,"parts":8,"scav":1}}]},
  {"id":"market","name":"超市","emoji":"🏪","desc":"食物最多。","chapter":1,"min_min":0,"luck":0,"danger":0.02,"items":[
    {"id":"z_onigiri","tier":"c","name":"御飯糰","emoji":"🍙","gain":{"food":2}},
    {"id":"z_teaegg","tier":"c","name":"茶葉蛋","emoji":"🥚","gain":{"food":2,"morale":1}},
    {"id":"z_milk","tier":"c","name":"保久乳","emoji":"🥛","gain":{"food":1,"water":1}},
    {"id":"z_bread","tier":"c","name":"菠蘿麵包","emoji":"🍞","gain":{"food":2,"morale":1}},
    {"id":"z_bento","tier":"r","name":"微波便當","emoji":"🍱","gain":{"food":5,"morale":3}},
    {"id":"z_fridge","tier":"l","name":"飲料冰櫃","emoji":"🧊","gain":{"water":10,"morale":6}},
    {"id":"z_rice","tier":"c","name":"一袋米","emoji":"🍚","gain":{"food":3}},
    {"id":"z_snack","tier":"c","name":"零食","emoji":"🍿","gain":{"food":2,"morale":2}},
    {"id":"z_dumpling","tier":"c","name":"冷凍水餃","emoji":"🥟","gain":{"food":4}},
    {"id":"z_cart","tier":"r","name":"一整車貨","emoji":"🛒","gain":{"food":6,"water":3}},
    {"id":"z_coffee","tier":"r","name":"咖啡豆","emoji":"☕","gain":{"morale":8,"food":1}},
    {"id":"z_storeroom","tier":"l","name":"超市倉庫","emoji":"📦","gain":{"food":12,"water":6,"scav":1}}]},
  {"id":"waterworks","name":"水廠","emoji":"🚰","desc":"水最多。","chapter":1,"min_min":0,"luck":0,"danger":0.02,"items":[
    {"id":"w_hose","tier":"c","name":"消防水帶","emoji":"🧯","gain":{"water":2,"parts":1}},
    {"id":"w_valve","tier":"c","name":"大閥門","emoji":"🔴","gain":{"parts":2,"water":1}},
    {"id":"w_tablet","tier":"r","name":"淨水錠","emoji":"💊","gain":{"water":6}},
    {"id":"w_tower","tier":"l","name":"水塔","emoji":"🗼","gain":{"water":15,"parts":3}},
    {"id":"w_jug","tier":"c","name":"水壺","emoji":"🫗","gain":{"water":3}},
    {"id":"w_filter","tier":"c","name":"濾芯","emoji":"🧽","gain":{"water":2,"parts":1}},
    {"id":"w_bottles","tier":"c","name":"一箱瓶裝水","emoji":"🍶","gain":{"water":4}},
    {"id":"w_tank","tier":"r","name":"儲水桶","emoji":"🛢️","gain":{"water":8}},
    {"id":"w_pump","tier":"r","name":"手搖幫浦","emoji":"⛽","gain":{"water":4,"parts":4}},
    {"id":"w_reservoir","tier":"l","name":"地下蓄水池","emoji":"🌊","gain":{"water":15,"scav":1}}]},
  {"id":"hardware","name":"五金行","emoji":"🔧","desc":"零件最多，蓋設施就靠這裡。","chapter":1,"min_min":0,"luck":0,"danger":0.03,"items":[
    {"id":"h_hammer","tier":"c","name":"鐵鎚","emoji":"🔨","gain":{"parts":2}},
    {"id":"h_paint","tier":"c","name":"油漆桶","emoji":"🪣","gain":{"parts":1,"morale":2}},
    {"id":"h_ladder","tier":"r","name":"鋁梯","emoji":"🪜","gain":{"parts":6}},
    {"id":"h_welder","tier":"l","name":"電焊機","emoji":"⚡","gain":{"parts":15,"stardust":5}},
    {"id":"h_nails","tier":"c","name":"一盒釘子","emoji":"📌","gain":{"parts":3}},
    {"id":"h_tape","tier":"c","name":"強力膠帶","emoji":"🎞️","gain":{"parts":2,"hp":2}},
    {"id":"h_pipe","tier":"c","name":"水管","emoji":"🪠","gain":{"parts":3,"water":1}},
    {"id":"h_drill","tier":"r","name":"電鑽","emoji":"🪛","gain":{"parts":8}},
    {"id":"h_solar","tier":"r","name":"小太陽能板","emoji":"☀️","gain":{"parts":6,"morale":3}},
    {"id":"h_crate","tier":"l","name":"一整箱建材","emoji":"🏗️","gain":{"parts":20}},
    {"id":"h_plan","tier":"l","name":"施工藍圖","emoji":"📐","gain":{"facility":"random"}}]},
  {"id":"hospital","name":"醫院","emoji":"🏥","desc":"修基地、補士氣。","chapter":2,"min_min":0,"luck":2,"danger":0.04,"items":[
    {"id":"m_thermo","tier":"c","name":"體溫計","emoji":"🌡️","gain":{"hp":2,"morale":1}},
    {"id":"m_crutch","tier":"c","name":"拐杖","emoji":"🦯","gain":{"hp":3}},
    {"id":"m_wheelchair","tier":"r","name":"輪椅","emoji":"♿","gain":{"hp":8,"parts":3}},
    {"id":"m_defib","tier":"l","name":"電擊器","emoji":"💓","gain":{"hp":20,"morale":8}},
    {"id":"m_bandage","tier":"c","name":"繃帶","emoji":"🩹","gain":{"hp":5}},
    {"id":"m_vitamin","tier":"c","name":"維他命","emoji":"💊","gain":{"hp":3,"morale":2}},
    {"id":"m_mask","tier":"c","name":"口罩","emoji":"😷","gain":{"hp":2,"parts":1}},
    {"id":"m_kit","tier":"r","name":"醫療包","emoji":"🧰","gain":{"hp":12}},
    {"id":"m_bed","tier":"r","name":"病床零件","emoji":"🛏️","gain":{"parts":5,"hp":5}},
    {"id":"m_pharmacy","tier":"l","name":"藥局庫存","emoji":"💉","gain":{"hp":25,"morale":10}}]},
  {"id":"library","name":"圖書館","emoji":"📚","desc":"星屑多，有機會找到收藏品。讀書時最適合。","chapter":1,"min_min":0,"luck":3,"danger":0.01,"items":[
    {"id":"l_glasses","tier":"c","name":"老花眼鏡","emoji":"👓","gain":{"stardust":3}},
    {"id":"l_globe","tier":"r","name":"地球儀","emoji":"🌍","gain":{"stardust":8,"morale":3}},
    {"id":"l_typewriter","tier":"r","name":"打字機","emoji":"⌨️","gain":{"stardust":6,"parts":3}},
    {"id":"l_encyclo","tier":"l","name":"百科全書","emoji":"📚","gain":{"stardust":20}},
    {"id":"l_book","tier":"c","name":"一本好書","emoji":"📖","gain":{"morale":3,"stardust":2}},
    {"id":"l_notes","tier":"c","name":"前人的筆記","emoji":"📝","gain":{"stardust":4}},
    {"id":"l_candle","tier":"c","name":"蠟燭","emoji":"🕯️","gain":{"morale":2,"parts":1}},
    {"id":"l_atlas","tier":"r","name":"地圖集","emoji":"🗺️","gain":{"scav":2}},
    {"id":"l_rare","tier":"r","name":"絕版書","emoji":"📚","gain":{"stardust":12}},
    {"id":"l_wish","tier":"l","name":"夾在書裡的星願券","emoji":"🎫","gain":{"wish_normal":1}},
    {"id":"l_archive","tier":"l","name":"秘密檔案室","emoji":"🗄️","gain":{"relic":"x"}}]},
  {"id":"subway","name":"地鐵站","emoji":"🚇","desc":"什麼都有、稀有率高，但有點危險。","chapter":3,"min_min":0,"luck":10,"danger":0.10,"items":[
    {"id":"s_card","tier":"c","name":"悠遊卡","emoji":"💳","gain":{"stardust":2,"morale":1}},
    {"id":"s_poster","tier":"c","name":"舊海報","emoji":"📜","gain":{"morale":3}},
    {"id":"s_lostfound","tier":"r","name":"失物招領箱","emoji":"📦","gain":{"food":3,"water":3,"stardust":4}},
    {"id":"s_train","tier":"l","name":"停駛的車廂","emoji":"🚃","gain":{"scav":3,"parts":8}},
    {"id":"s_token","tier":"c","name":"舊車票","emoji":"🎟️","gain":{"gold":15}},
    {"id":"s_bag","tier":"c","name":"遺落的包包","emoji":"👜","gain":{"food":2,"water":2}},
    {"id":"s_vending","tier":"c","name":"月台販賣機","emoji":"🥤","gain":{"water":3,"food":1}},
    {"id":"s_locker","tier":"r","name":"置物櫃","emoji":"🔐","gain":{"parts":5,"food":3,"water":3}},
    {"id":"s_cash","tier":"r","name":"收銀機","emoji":"💰","gain":{"gold":40}},
    {"id":"s_tunnel","tier":"l","name":"隧道深處","emoji":"🔦","gain":{"scav":4,"stardust":15}}]},
  {"id":"military","name":"軍事基地","emoji":"🪖","desc":"史詩、傳說機率最高。專注要滿 60 分鐘才走得到，危險。","chapter":4,"min_min":60,"luck":20,"danger":0.15,"items":[
    {"id":"x_helmet","tier":"c","name":"鋼盔","emoji":"⛑️","gain":{"hp":3,"parts":1}},
    {"id":"x_canteen","tier":"c","name":"軍用水壺","emoji":"🫗","gain":{"water":3}},
    {"id":"x_tent","tier":"r","name":"軍用帳篷","emoji":"⛺","gain":{"hp":6,"morale":4}},
    {"id":"x_jeep","tier":"l","name":"吉普車","emoji":"🚙","gain":{"parts":15,"scav":2}},
    {"id":"x_mre","tier":"c","name":"軍糧","emoji":"🍱","gain":{"food":4,"water":2}},
    {"id":"x_ammo","tier":"c","name":"空彈藥箱","emoji":"🗃️","gain":{"parts":5}},
    {"id":"x_radio","tier":"c","name":"軍用無線電","emoji":"📻","gain":{"parts":3,"morale":3}},
    {"id":"x_armor","tier":"r","name":"防彈板","emoji":"🛡️","gain":{"hp":15,"parts":5}},
    {"id":"x_generator","tier":"r","name":"軍用發電機","emoji":"⚡","gain":{"parts":15}},
    {"id":"x_depot","tier":"l","name":"補給庫","emoji":"🪖","gain":{"food":10,"water":10,"parts":15,"scav":2}}]},
  {"id":"night_market","name":"夜市廢墟","emoji":"🏮","desc":"深夜才找得到的地方，什麼都有一點，常有好運。","chapter":1,"hidden":true,"min_min":0,"luck":8,"danger":0.05,"items":[
    {"id":"n_sausage","tier":"c","name":"大腸包小腸","emoji":"🌭","gain":{"food":3,"morale":1}},
    {"id":"n_balloon","tier":"c","name":"射氣球攤","emoji":"🎈","gain":{"morale":3,"stardust":1}},
    {"id":"n_doll","tier":"r","name":"夾娃娃機","emoji":"🧸","gain":{"morale":8,"stardust":4}},
    {"id":"n_ferris","tier":"l","name":"小摩天輪","emoji":"🎡","gain":{"morale":15,"scav":2}},
    {"id":"n_skewer","tier":"c","name":"烤串攤","emoji":"🍢","gain":{"food":3,"morale":1}},
    {"id":"n_lantern","tier":"c","name":"紙燈籠","emoji":"🏮","gain":{"morale":3,"parts":1}},
    {"id":"n_tea","tier":"r","name":"珍珠奶茶","emoji":"🧋","gain":{"food":3,"water":3,"morale":4}},
    {"id":"n_game","tier":"r","name":"夜市遊戲攤","emoji":"🎯","gain":{"scav":3}},
    {"id":"n_fortune","tier":"l","name":"算命攤的籤","emoji":"🧧","gain":{"memory":"random"}}]},
  {"id":"rooftop","name":"天台花園","emoji":"🌻","desc":"安靜又安全，食物和水都多，偶爾有種子保險箱。","chapter":1,"hidden":true,"min_min":0,"luck":6,"danger":0.01,"items":[
    {"id":"r_tomato","tier":"c","name":"小番茄盆","emoji":"🍅","gain":{"food":3}},
    {"id":"r_chair","tier":"c","name":"躺椅","emoji":"🪑","gain":{"morale":3}},
    {"id":"r_pigeon","tier":"r","name":"鴿子籠","emoji":"🕊️","gain":{"morale":6,"food":2}},
    {"id":"r_greenhouse","tier":"l","name":"迷你溫室","emoji":"🌱","gain":{"food":12,"water":4}},
    {"id":"r_herb","tier":"c","name":"香草盆栽","emoji":"🌿","gain":{"food":2,"hp":2}},
    {"id":"r_rain","tier":"c","name":"雨水收集桶","emoji":"🛢️","gain":{"water":4}},
    {"id":"r_bee","tier":"r","name":"蜂箱","emoji":"🐝","gain":{"food":5,"morale":3}},
    {"id":"r_solar","tier":"r","name":"太陽能陣列","emoji":"🔆","gain":{"parts":10}},
    {"id":"r_seed","tier":"l","name":"種子保險箱","emoji":"🌱","gain":{"facility":"garden"}}]},
  {"id":"bunker","name":"地下碉堡","emoji":"🔐","desc":"神秘訊號指向的地方，金幣和補給箱很多。","chapter":1,"hidden":true,"min_min":0,"luck":15,"danger":0.08,"items":[
    {"id":"b_bunkbed","tier":"c","name":"上下舖","emoji":"🛏️","gain":{"hp":3,"morale":1}},
    {"id":"b_gasmask","tier":"c","name":"防毒面具","emoji":"😷","gain":{"hp":3}},
    {"id":"b_periscope","tier":"r","name":"潛望鏡","emoji":"🔭","gain":{"parts":5,"stardust":4}},
    {"id":"b_blastdoor","tier":"l","name":"防爆門","emoji":"🚪","gain":{"hp":15,"parts":10}},
    {"id":"k_canned","tier":"c","name":"一整排罐頭","emoji":"🥫","gain":{"food":5}},
    {"id":"k_filter","tier":"c","name":"軍規濾水器","emoji":"🚰","gain":{"water":5}},
    {"id":"k_map","tier":"r","name":"作戰地圖","emoji":"🗺️","gain":{"scav":4}},
    {"id":"k_vault","tier":"r","name":"保險庫","emoji":"🏦","gain":{"gold":60,"parts":8}},
    {"id":"k_core","tier":"l","name":"碉堡能源核心","emoji":"⚛️","gain":{"box_gold":1}}]},
  {"id":"observatory","name":"天文台","emoji":"🔭","desc":"離星星最近的地方，星屑最多，傳說機率最高。","chapter":1,"hidden":true,"min_min":0,"luck":25,"danger":0.03,"items":[
    {"id":"o_planisphere","tier":"c","name":"星座盤","emoji":"🌌","gain":{"stardust":4}},
    {"id":"o_moonrock","tier":"r","name":"月球岩石","emoji":"🌑","gain":{"stardust":10}},
    {"id":"o_orrery","tier":"r","name":"太陽系儀","emoji":"🪐","gain":{"stardust":8,"morale":3}},
    {"id":"o_comet","tier":"l","name":"彗星碎片","emoji":"☄️","gain":{"stardust":25,"morale":5}},
    {"id":"o_lens","tier":"c","name":"望遠鏡鏡片","emoji":"🔭","gain":{"stardust":6}},
    {"id":"o_chart","tier":"c","name":"星圖","emoji":"🌌","gain":{"stardust":4,"morale":2}},
    {"id":"o_meteor","tier":"r","name":"隕石碎片","emoji":"☄️","gain":{"stardust":20,"parts":5}},
    {"id":"o_log","tier":"r","name":"觀測日誌","emoji":"📓","gain":{"unid":1}},
    {"id":"o_star","tier":"l","name":"墜落的星星","emoji":"🌠","gain":{"wish_rare":1}}]}
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


-- ---------- 小工具 ----------

create or replace function public.doom_bond_lv(st public.doom_state, p_id text)
returns integer language sql stable
as $function$
  select case when st.companions ? p_id then least(5, coalesce((st.bond->>p_id)::integer, 0) / 20) else 0 end;
$function$;

-- 依幸運擲稀有度，可以指定最低稀有度
create or replace function public.doom_roll_tier(p_luck integer, p_min text default 'c')
returns text language plpgsql volatile
as $function$
declare x double precision := random() * 10000; t text; ord text := 'crlxs';
begin
  t := case
    when x < 50 + 2 * p_luck then 's'
    when x < 300 + 10 * p_luck then 'x'
    when x < 1200 + 30 * p_luck then 'l'
    when x < 4000 + 60 * p_luck then 'r'
    else 'c' end;
  if position(t in ord) < position(p_min in ord) then
    -- 低於最低稀有度：在最低稀有度以上重擲
    x := random() * 10000;
    t := case
      when p_min = 's' then 's'
      when p_min = 'x' then case when x < 1500 then 's' else 'x' end
      when p_min = 'l' then case when x < 400 + 3 * p_luck then 's' when x < 2400 + 10 * p_luck then 'x' else 'l' end
      else case when x < 150 then 's' when x < 900 then 'x' when x < 3500 + 30 * p_luck then 'l' else 'r' end end;
  end if;
  return t;
end;
$function$;

create or replace function public.doom_loot(p_tier text)
returns jsonb language sql volatile
as $function$
  select el from jsonb_array_elements(public.doom_catalog()->'loot') el where el->>'tier' = p_tier order by random() limit 1;
$function$;

create or replace function public.doom_seen(u uuid, p_id text)
returns void language sql security definer set search_path to 'public'
as $function$
  update public.doom_state set seen = seen || jsonb_build_object(p_id, coalesce((seen->>p_id)::integer, 0) + 1) where user_id = u;
$function$;


-- ---------- 套用獲得（加上補給箱、翻倍卡、未鑑定、記憶碎片） ----------
create or replace function public.doom_apply(u uuid, g jsonb, src text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  st public.doom_state%rowtype;
  cat jsonb := public.doom_catalog();
  out jsonb := '[]'::jsonb;
  r record;
  n integer;
  pick jsonb;
  fac text;
  lv integer;
  later jsonb := '{}'::jsonb;
begin
  if g is null or g = '{}'::jsonb then return out; end if;
  select * into st from public.doom_state where user_id = u for update;

  for r in select key, value from jsonb_each(g) loop
    if r.key in ('food', 'water', 'parts', 'scav', 'hp', 'morale') then
      n := (r.value #>> '{}')::integer;
      if r.key = 'hp' and n < 0 then
        n := least(-1, round(n * (1 - 0.08 * coalesce((st.facilities->>'wall')::integer, 0)))::integer);
      end if;
      case r.key
        when 'food'   then n := greatest(n, -st.food);   st.food := st.food + n;
        when 'water'  then n := greatest(n, -st.water);  st.water := st.water + n;
        when 'parts'  then n := greatest(n, -st.parts);  st.parts := st.parts + n;
        when 'scav'   then n := greatest(n, -st.scav);   st.scav := st.scav + n;
        when 'hp'     then n := greatest(least(n, 100 - st.hp), -st.hp); st.hp := st.hp + n;
        when 'morale' then n := greatest(least(n, 100 - st.morale), -st.morale); st.morale := st.morale + n;
      end case;
      if n <> 0 then out := out || jsonb_build_object('k', r.key, 'n', n); end if;

    elsif r.key = 'gold' then
      n := (r.value #>> '{}')::integer;
      update public.profiles set gold = greatest(0, gold + n) where id = u;
      out := out || jsonb_build_object('k', 'gold', 'n', n);

    elsif r.key in ('stardust', 'wish_normal', 'wish_rare', 'wish_limited', 'ticket_normal', 'ticket_special') then
      n := (r.value #>> '{}')::integer;
      if public.grant_item(u, r.key, n, src || ':' || r.key) then
        out := out || jsonb_build_object('k', r.key, 'n', n);
      end if;

    elsif r.key = 'companion' then
      if r.value #>> '{}' = 'random' then
        select el into pick from jsonb_array_elements(cat->'companions') el
          where not st.companions ? (el->>'id') order by random() limit 1;
      else
        pick := public.doom_find('companions', r.value #>> '{}');
        if st.companions ? (pick->>'id') then pick := null; end if;
      end if;
      if pick is null then
        st.scav := st.scav + 3;
        out := out || jsonb_build_object('k', 'scav', 'n', 3, 'note', '同伴已經到齊，改送搜刮券');
      else
        st.companions := st.companions || to_jsonb(pick->>'id');
        out := out || jsonb_build_object('k', 'companion', 'id', pick->>'id');
      end if;

    elsif r.key = 'relic' then
      select el into pick from jsonb_array_elements(cat->'relics') el
        where el->>'tier' = r.value #>> '{}' and not st.relics ? (el->>'id') order by random() limit 1;
      if pick is null then
        n := case when r.value #>> '{}' = 's' then 150 else 40 end;
        if public.grant_item(u, 'stardust', n, src || ':relic') then
          out := out || jsonb_build_object('k', 'stardust', 'n', n, 'note', '這一級的收藏品都收齊了');
        end if;
      else
        st.relics := st.relics || jsonb_build_object(pick->>'id', 1);
        st.morale := least(100, st.morale + 10);
        out := out || jsonb_build_object('k', 'relic', 'id', pick->>'id');
      end if;

    elsif r.key = 'facility' then
      fac := r.value #>> '{}';
      if fac = 'random' then
        select el->>'id' into fac from jsonb_array_elements(cat->'facilities') el
          where coalesce((st.facilities->>(el->>'id'))::integer, 0) < 10 order by random() limit 1;
      end if;
      lv := coalesce((st.facilities->>fac)::integer, 0);
      if fac is null or lv >= 10 then
        st.parts := st.parts + 20;
        out := out || jsonb_build_object('k', 'parts', 'n', 20, 'note', '設施已經滿級，改送零件');
      else
        st.facilities := st.facilities || jsonb_build_object(fac, lv + 1);
        out := out || jsonb_build_object('k', 'facility', 'id', fac, 'lv', lv + 1);
      end if;

    elsif r.key in ('box_bronze', 'box_silver', 'box_gold', 'double', 'unid', 'memory') then
      later := later || jsonb_build_object(r.key, r.value);
    end if;
  end loop;

  update public.doom_state set food = st.food, water = st.water, parts = st.parts, scav = st.scav,
    hp = st.hp, morale = st.morale, companions = st.companions, relics = st.relics, facilities = st.facilities
    where user_id = u;

  -- 新的獎勵種類：分開更新，不會蓋掉別的欄位
  for r in select key, value from jsonb_each(later) loop
    if r.key like 'box_%' then
      n := (r.value #>> '{}')::integer;
      update public.doom_state set boxes = boxes || jsonb_build_object(substr(r.key, 5),
        coalesce((boxes->>substr(r.key, 5))::integer, 0) + n) where user_id = u;
      out := out || jsonb_build_object('k', r.key, 'n', n);
    elsif r.key = 'double' then
      n := (r.value #>> '{}')::integer;
      update public.doom_state set double_cards = double_cards + n where user_id = u;
      out := out || jsonb_build_object('k', 'double', 'n', n);
    elsif r.key = 'unid' then
      n := (r.value #>> '{}')::integer;
      for lv in 1..n loop
        update public.doom_state set unid = unid || jsonb_build_array(jsonb_build_object(
          'uid', substr(md5(random()::text), 1, 8), 'at', focus_total, 'need', 30)) where user_id = u;
      end loop;
      out := out || jsonb_build_object('k', 'unid', 'n', n);
    elsif r.key = 'memory' then
      select st2.memories into pick from public.doom_state st2 where st2.user_id = u;
      select el->>'id' into fac from jsonb_array_elements(public.doom_extra()->'memories') el
        where not pick ? (el->>'id') order by el->>'id' limit 1;
      if fac is null then
        if public.grant_item(u, 'stardust', 50, src || ':memory') then
          out := out || jsonb_build_object('k', 'stardust', 'n', 50, 'note', '記憶碎片都收齊了');
        end if;
      else
        update public.doom_state set memories = memories || to_jsonb(fac) where user_id = u;
        out := out || jsonb_build_object('k', 'memory', 'id', fac);
      end if;
    end if;
  end loop;
  return out;
end;
$function$;
revoke all on function public.doom_apply(uuid, jsonb, text) from public, authenticated, anon;


-- ---------- 幸運（加上收藏組合、貓頭鷹好感） ----------
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
  return greatest(0, l);
end;
$function$;
revoke all on function public.doom_luck(uuid) from public, authenticated, anon;


-- ---------- 跨日結算（加上同伴好感加倍） ----------
create or replace function public.doom_settle(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  today date := public.app_today();
  st public.doom_state%rowtype;
  d date;
  days integer := 0;
  cons integer;
  prod_food integer; prod_water integer; prod_parts integer; prod_scav integer; heal integer; cheer integer;
  tot jsonb := jsonb_build_object('food', 0, 'water', 0, 'parts', 0, 'scav', 0, 'hp', 0, 'morale', 0, 'short', 0);
  short integer;
  half boolean;
begin
  select * into st from public.doom_state where user_id = u for update;
  if st.last_settle >= today then return null; end if;

  d := greatest(st.last_settle + 1, today - 13);
  while d <= today loop
    days := days + 1;
    half := st.hp <= 0;
    prod_food  := coalesce((st.facilities->>'garden')::integer, 0)
      + case when st.companions ? 'farmer' then 1 else 0 end
      + case when public.doom_bond_lv(st, 'farmer') >= 5 then 1 else 0 end;
    prod_water := coalesce((st.facilities->>'purifier')::integer, 0);
    prod_parts := coalesce((st.facilities->>'bench')::integer, 0);
    prod_scav  := case when st.companions ? 'robot' then 1 else 0 end
      + case when public.doom_bond_lv(st, 'robot') >= 5 then 1 else 0 end;
    heal  := 2 * coalesce((st.facilities->>'bed')::integer, 0)
      + case when st.companions ? 'doctor' then 3 else 0 end
      + case when public.doom_bond_lv(st, 'doctor') >= 5 then 3 else 0 end;
    cheer := case when st.companions ? 'cat' then 3 else 0 end
      + case when public.doom_bond_lv(st, 'cat') >= 5 then 3 else 0 end;
    if half then
      prod_food := prod_food / 2; prod_water := prod_water / 2; prod_parts := prod_parts / 2;
    end if;

    cons := 1 + jsonb_array_length(st.companions) / 3;
    st.food := st.food + prod_food - cons;
    st.water := st.water + prod_water - cons;
    st.parts := st.parts + prod_parts;
    st.scav := st.scav + prod_scav;
    short := 0;
    if st.food < 0 then short := short + 1; st.food := 0; end if;
    if st.water < 0 then short := short + 1; st.water := 0; end if;

    st.hp := greatest(0, least(100, st.hp + heal - 8 * short));
    st.morale := greatest(0, least(100, st.morale + cheer - 5 * short));
    st.day_no := st.day_no + 1;

    tot := jsonb_build_object(
      'food', (tot->>'food')::integer + prod_food - cons,
      'water', (tot->>'water')::integer + prod_water - cons,
      'parts', (tot->>'parts')::integer + prod_parts,
      'scav', (tot->>'scav')::integer + prod_scav,
      'hp', (tot->>'hp')::integer + heal - 8 * short,
      'morale', (tot->>'morale')::integer + cheer - 5 * short,
      'short', (tot->>'short')::integer + short);
    d := d + 1;
  end loop;

  update public.doom_state set food = st.food, water = st.water, parts = st.parts, scav = st.scav,
    hp = st.hp, morale = st.morale, day_no = st.day_no, last_settle = today
    where user_id = u;

  perform public.doom_log_add(u, 'day', null,
    '撐過了第 ' || st.day_no || ' 天' ||
    case when (tot->>'short')::integer > 0 then '，但物資不夠，基地受了點傷' else '' end || '。');
  return tot || jsonb_build_object('days', days, 'day_no', st.day_no);
end;
$function$;
revoke all on function public.doom_settle(uuid) from public, authenticated, anon;


-- ---------- 今天的廣播、事件、訪客、商人貨架 ----------
create or replace function public.doom_day(u uuid, d date, p_picks boolean)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  cat jsonb := public.doom_catalog();
  dd public.doom_days%rowtype;
  b jsonb;
  kind text;
  ev text;
  vi text;
  v_shop jsonb;
begin
  insert into public.doom_days (user_id, day) values (u, d) on conflict do nothing;
  if not p_picks then return; end if;
  select * into dd from public.doom_days where user_id = u and day = d for update;

  if dd.shop is null then
    select coalesce(jsonb_agg(x.el), '[]'::jsonb) into v_shop from (
      select el from jsonb_array_elements(public.doom_extra()->'shop') el order by random() limit 3) x;
    update public.doom_days set shop = v_shop where user_id = u and day = d;
  end if;

  if dd.broadcast is not null then return; end if;

  select el into b from jsonb_array_elements(cat->'broadcasts') el order by random() limit 1;

  kind := (public.doom_wpick(case when b->>'buff' = 'calm'
    then '[{"k":"good","w":6},{"k":"weird","w":4}]'::jsonb
    else '[{"k":"good","w":45},{"k":"weird","w":25},{"k":"bad","w":30}]'::jsonb end))->>'k';
  select el->>'id' into ev from jsonb_array_elements(cat->'events') el where el->>'kind' = kind order by random() limit 1;

  if b->>'buff' = 'trader' then vi := 'v_merchant';
  else select el->>'id' into vi from jsonb_array_elements(cat->'visitors') el order by random() limit 1;
  end if;

  update public.doom_days set broadcast = b->>'id', event_id = ev, visitor_id = vi where user_id = u and day = d;

  if b->>'buff' = 'rain' then
    perform public.doom_apply(u, '{"water":3}'::jsonb, 'doom-rain:' || d);
  end if;
end;
$function$;
revoke all on function public.doom_day(uuid, date, boolean) from public, authenticated, anon;


-- ---------- 收成果（加上連擊） ----------
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
  ev timestamptz[];
  n_ev integer;
  i integer;
  chain integer := 0;
  best integer := 0;
  combo_bonus integer := 0;
  cur integer := 0;
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

  -- 🔥 連擊：今天完成的事，彼此相隔 30 分鐘內就算連擊
  select array_agg(t order by t) into ev from (
    select completed_at t from public.tasks
      where user_id = u and completed and completed_at is not null
        and (completed_at at time zone 'Asia/Taipei' - interval '2 hours')::date = today
    union all
    select created_at from public.project_step_logs where user_id = u and day = today and done
    union all
    select s.done_at from public.project_steps s join public.projects p on p.id = s.project_id
      where s.user_id = u and p.kind <> 'daily' and s.done and s.done_at is not null
        and (s.done_at at time zone 'Asia/Taipei' - interval '2 hours')::date = today) x;
  n_ev := coalesce(array_length(ev, 1), 0);
  select * into dd from public.doom_days where user_id = u and day = today for update;
  for i in 1..n_ev loop
    if i > 1 and ev[i] - ev[i - 1] <= interval '30 minutes' then chain := chain + 1; else chain := 1; end if;
    best := greatest(best, chain);
    if i > dd.combo_n and chain >= 3 and chain % 3 = 0 then combo_bonus := combo_bonus + 1; end if;
  end loop;
  if n_ev > 0 and now() - ev[n_ev] <= interval '30 minutes' then cur := chain; end if;
  update public.doom_days set combo_n = n_ev, combo = greatest(combo, best) where user_id = u and day = today;
  update public.doom_state set combo_best = greatest(combo_best, best) where user_id = u;
  scav := scav + combo_bonus;

  if food + water + scav = 0 then
    return case when cur > 1 then jsonb_build_object('combo', cur, 'gains', '[]'::jsonb) else null end;
  end if;
  applied := public.doom_apply(u, jsonb_strip_nulls(jsonb_build_object(
    'food', nullif(food, 0), 'water', nullif(water, 0), 'scav', nullif(scav, 0))),
    'doom-harvest:' || gen_random_uuid());
  return jsonb_build_object('tasks', n_tasks, 'steps', n_steps, 'focus_min', 0, 'gains', applied,
    'combo', cur, 'combo_bonus', combo_bonus);
end;
$function$;
revoke all on function public.doom_harvest(uuid) from public, authenticated, anon;


-- ---------- 🧺 撿物資（狗狗好感加倍） ----------
create or replace function public.doom_pickup()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  today date := public.app_today();
  st public.doom_state%rowtype;
  dd public.doom_days%rowtype;
  c integer;
  i integer;
  x double precision;
  food integer := 0; water integer := 0; parts integer := 0; scav integer := 0;
  applied jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_ensure(u);
  perform public.doom_day(u, today, true);
  select * into st from public.doom_state where user_id = u;
  select * into dd from public.doom_days where user_id = u and day = today for update;
  if dd.picked is not null then raise exception '今天已經撿過了，明天再來'; end if;

  c := 3 + case when st.companions ? 'dog' then 2 else 0 end + case when public.doom_bond_lv(st, 'dog') >= 5 then 2 else 0 end;
  if public.doom_find('broadcasts', dd.broadcast)->>'buff' = 'pick2' then c := c * 2; end if;
  for i in 1..c loop
    x := random();
    if x < 0.32 then food := food + 1 + floor(random() * 2)::integer;
    elsif x < 0.64 then water := water + 1 + floor(random() * 2)::integer;
    elsif x < 0.92 then parts := parts + 1 + floor(random() * 3)::integer;
    else scav := scav + 1;
    end if;
  end loop;

  applied := public.doom_apply(u, jsonb_strip_nulls(jsonb_build_object(
    'food', nullif(food, 0), 'water', nullif(water, 0), 'parts', nullif(parts, 0), 'scav', nullif(scav, 0))),
    'doom-pick:' || today);
  update public.doom_days set picked = applied where user_id = u and day = today;
  return json_build_object('gains', applied, 'count', c);
end;
$function$;
grant execute on function public.doom_pickup() to authenticated;


create or replace function public.doom_build_cost(u uuid, p_fac text)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare st public.doom_state%rowtype; lv integer; parts integer;
begin
  select * into st from public.doom_state where user_id = u;
  lv := coalesce((st.facilities->>p_fac)::integer, 0);
  parts := 20 + 20 * lv;
  if public.doom_bond_lv(st, 'engineer') >= 5 then parts := round(parts * 0.75)::integer;
  elsif st.companions ? 'engineer' then parts := round(parts * 0.85)::integer; end if;
  return jsonb_build_object('parts', parts, 'food', 2 * lv, 'lv', lv);
end;
$function$;
revoke all on function public.doom_build_cost(uuid, text) from public, authenticated, anon;


create or replace function public.doom_trade()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  today date := public.app_today();
  st public.doom_state%rowtype;
  dd public.doom_days%rowtype;
  k integer;
  applied jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_day(u, today, true);
  select * into st from public.doom_state where user_id = u for update;
  select * into dd from public.doom_days where user_id = u and day = today for update;
  if dd.traded >= 5 then raise exception '今天換夠了，明天再來'; end if;
  k := case when public.doom_bond_lv(st, 'merchant') >= 5 then 5 when st.companions ? 'merchant' then 6 else 8 end;
  if st.food < k or st.water < k then raise exception '需要 % 食物和 % 水', k, k; end if;
  applied := public.doom_apply(u, jsonb_build_object('food', -k, 'water', -k, 'scav', 1), 'doom-trade');
  update public.doom_days set traded = traded + 1 where user_id = u and day = today;
  return json_build_object('gains', applied, 'left', 4 - dd.traded);
end;
$function$;
grant execute on function public.doom_trade() to authenticated;


-- ---------- 🎟️ 搜刮（記錄看過的東西） ----------
create or replace function public.doom_draw(p_n integer)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  today date := public.app_today();
  n integer := case when p_n >= 10 then 10 else 1 end;
  st public.doom_state%rowtype;
  lk integer;
  i integer;
  tier text;
  v_pity integer;
  e jsonb;
  applied jsonb;
  results jsonb := '[]'::jsonb;
  trk jsonb := '[]'::jsonb;
  tk jsonb;
  v_first boolean;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_ensure(u);
  perform public.doom_day(u, today, true);
  select * into st from public.doom_state where user_id = u for update;
  if st.scav < n then raise exception '搜刮券不夠（有 % 張）', st.scav; end if;
  update public.doom_state set scav = scav - n, draws_total = draws_total + n where user_id = u;
  lk := public.doom_luck(u);
  v_pity := st.pity;

  for i in 1..n loop
    tier := public.doom_roll_tier(lk, case when v_pity >= 9 then 'l' else 'c' end);
    v_pity := case when tier in ('l', 'x', 's') then 0 else v_pity + 1 end;
    e := public.doom_loot(tier);
    applied := public.doom_apply(u, e->'gain', 'doom-draw:' || gen_random_uuid());
    perform public.doom_seen(u, e->>'id');
    results := results || jsonb_build_object('id', e->>'id', 'tier', tier, 'gains', applied);
    if tier in ('l', 'x', 's') then
      perform public.doom_log_add(u, 'draw', tier, '搜刮到' || (e->>'name') || '！');
    end if;
  end loop;

  update public.doom_state set pity = v_pity where user_id = u;
  update public.doom_days set draws = draws + n where user_id = u and day = today;
  -- 🧸 生活小物
  v_first := public.doom_trinket_first(u);
  for i in 1..n loop
    tk := public.doom_trinket(u, 'doom-draw-trk:' || gen_random_uuid(), null, v_first and i = 1);
    if tk is not null then trk := trk || tk; end if;
  end loop;
  return json_build_object('results', results, 'luck', lk, 'pity', v_pity, 'trinkets', trk, 'rewards', public.doom_rewards_check(u));
end;
$function$;


-- ---------- 🏆 累積獎勵：生存天數、紀念碑、基地等級、收藏組合、天台解鎖 ----------
create or replace function public.doom_rewards_check(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  today date := public.app_today();
  st public.doom_state%rowtype;
  ex jsonb := public.doom_extra();
  cat jsonb := public.doom_catalog();
  zs jsonb := public.doom_zones();
  notes jsonb := '[]'::jsonb;
  e jsonb;
  key text;
  applied jsonb;
  blv integer;
  L integer;
  ok boolean;
  d date;
  a record;
  streak integer;
begin
  select * into st from public.doom_state where user_id = u;

  -- 生存天數
  for e in select el from jsonb_array_elements(ex->'days') el loop
    key := 'day:' || (e->>'d');
    if st.day_no >= (e->>'d')::integer and not st.rewards ? key then
      update public.doom_state set rewards = rewards || jsonb_build_object(key, today) where user_id = u;
      applied := public.doom_apply(u, e->'gain', 'doom-rw:' || key);
      notes := notes || jsonb_build_object('kind', 'day', 'title', '生存第 ' || (e->>'d') || ' 天：' || (e->>'title'), 'gains', applied);
    end if;
  end loop;

  -- 專注紀念碑
  for e in select el from jsonb_array_elements(ex->'monument') el loop
    key := 'mon:' || (e->>'h');
    if st.focus_total >= (e->>'h')::integer * 60 and not st.rewards ? key then
      update public.doom_state set rewards = rewards || jsonb_build_object(key, today) where user_id = u;
      applied := public.doom_apply(u, e->'gain', 'doom-rw:' || key);
      notes := notes || jsonb_build_object('kind', 'monument', 'title', (e->>'emoji') || ' 紀念碑升級：' || (e->>'name') || '（專注 ' || (e->>'h') || ' 小時）', 'gains', applied);
    end if;
  end loop;

  -- 基地等級：所有設施等級加總，每 4 級升一級
  select * into st from public.doom_state where user_id = u;
  select 1 + coalesce(sum((v)::integer), 0) / 4 into blv from jsonb_each_text(st.facilities) as f(k, v);
  for L in 2..blv loop
    key := 'base:' || L;
    if not st.rewards ? key then
      update public.doom_state set rewards = rewards || jsonb_build_object(key, today) where user_id = u;
      applied := public.doom_apply(u, jsonb_build_object(
        case when L % 5 = 0 then 'box_gold' when L % 2 = 0 then 'box_silver' else 'box_bronze' end, 1), 'doom-rw:' || key);
      notes := notes || jsonb_build_object('kind', 'base', 'title', '🏚️ 基地升到 ' || L || ' 級', 'gains', applied);
    end if;
  end loop;

  -- 收藏組合
  select * into st from public.doom_state where user_id = u;
  for e in select el from jsonb_array_elements(ex->'sets') el loop
    key := 'set:' || (e->>'id');
    continue when st.rewards ? key;
    ok := case e->>'src'
      when 'loot' then not exists (select 1 from jsonb_array_elements(cat->'loot') x
        where x->>'tier' = e->>'tier' and not st.seen ? (x->>'id'))
      when 'zone' then not exists (select 1 from jsonb_array_elements(zs->'zones') z, jsonb_array_elements(z->'items') x
        where z->>'id' = e->>'zone' and not st.seen ? (x->>'id'))
      when 'relic' then not exists (select 1 from jsonb_array_elements(cat->'relics') x
        where x->>'tier' = e->>'tier' and not st.relics ? (x->>'id'))
      when 'companion' then not exists (select 1 from jsonb_array_elements(cat->'companions') x
        where not st.companions ? (x->>'id'))
      else false end;
    if ok then
      update public.doom_state set rewards = rewards || jsonb_build_object(key, today) where user_id = u;
      applied := public.doom_apply(u, e->'gain', 'doom-rw:' || key);
      notes := notes || jsonb_build_object('kind', 'set', 'title', (e->>'emoji') || ' 收藏組合完成：' || (e->>'name') || '（幸運永久 +2）', 'gains', applied);
    end if;
  end loop;

  -- 天台花園：連續 7 天都有做事（一天檢查一次）
  select * into st from public.doom_state where user_id = u;
  if not st.zones_unlocked ? 'rooftop' and coalesce(st.rewards->>'roof_check', '') <> today::text then
    update public.doom_state set rewards = rewards || jsonb_build_object('roof_check', today::text) where user_id = u;
    streak := 0;
    d := today;
    select * into a from public.doom_activity(u, d);
    if a.tasks + a.steps + a.focus_s = 0 then d := d - 1; end if;
    loop
      select * into a from public.doom_activity(u, d);
      exit when a.tasks + a.steps + a.focus_s = 0;
      streak := streak + 1;
      exit when streak >= 7;
      d := d - 1;
    end loop;
    if streak >= 7 then
      update public.doom_state set zones_unlocked = zones_unlocked || '"rooftop"'::jsonb where user_id = u;
      perform public.doom_log_add(u, 'zone', 'l', '連續 7 天沒有放棄，發現了天台花園！');
      notes := notes || jsonb_build_object('kind', 'zone', 'title', '🌻 發現隱藏區域：天台花園', 'gains', '[]'::jsonb);
    end if;
  end if;

  return notes;
end;
$function$;
revoke all on function public.doom_rewards_check(uuid) from public, authenticated, anon;
grant execute on function public.doom_draw(integer) to authenticated;


-- ---------- ⏱️ 專注搜刮（熟練度、翻倍卡、未鑑定、記憶碎片、神秘訊號、夜市） ----------
create or replace function public.doom_run_do(u uuid, p_session bigint, p_zone text, p_drops integer)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  zs jsonb := public.doom_zones();
  ex jsonb := public.doom_extra();
  st public.doom_state%rowtype;
  s public.focus_sessions%rowtype;
  v_old jsonb;
  z jsonb;
  minutes integer;
  cnt integer;
  extra integer := 0;
  lo integer; hi integer;
  week integer;
  lk integer;
  i integer;
  t integer;
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
  mins integer;
  mlv integer;
  thresholds jsonb := ex->'mastery';
  used_double boolean := false;
  hr integer;
  unlocked text := null;
  sig jsonb := null;
  sg jsonb;
  label text;
  trk jsonb := '[]'::jsonb;
  tk jsonb;
  v_first boolean;
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
  if coalesce((z->>'hidden')::boolean, false) and not st.zones_unlocked ? (z->>'id') then
    downgraded := (z->>'name') || '還沒找到，改去街頭';
    z := zs->'zones'->0;
  elsif (z->>'chapter')::integer > week then
    downgraded := (z->>'name') || '還沒開放（第 ' || (z->>'chapter') || ' 章），改去街頭';
    z := zs->'zones'->0;
  elsif minutes < (z->>'min_min')::integer then
    downgraded := '專注不到 ' || (z->>'min_min') || ' 分鐘，走不到' || (z->>'name') || '，在街頭撿了一些';
    z := zs->'zones'->0;
  end if;

  -- 區域熟練度
  mins := coalesce((st.mastery->>(z->>'id'))::integer, 0);
  select count(*) into mlv from jsonb_array_elements_text(thresholds) as th(v) where mins >= th.v::integer;

  lo := minutes / 10;
  hi := minutes / 5;
  cnt := least(40, greatest(lo, least(hi, coalesce(p_drops, minutes * 2 / 15))));
  if mlv >= 3 and cnt >= 5 then extra := greatest(1, cnt / 10); end if;
  if st.double_cards > 0 and cnt > 0 then
    used_double := true;
    extra := extra + cnt;
    update public.doom_state set double_cards = double_cards - 1 where user_id = u;
  end if;

  lk := public.doom_luck(u) + (z->>'luck')::integer + 3 * mlv;

  -- 先累積（這趟撿到的未鑑定物品，要從這之後再專注 30 分鐘）：專注總時數、區域熟練度、神秘訊號
  update public.doom_state set
    focus_total = focus_total + minutes,
    mastery = mastery || jsonb_build_object(z->>'id', mins + minutes),
    signal_min = case when signal_no < 3 then signal_min + minutes else signal_min end
    where user_id = u;

  for i in 1..(cnt + extra) loop
    t := case when i <= cnt then greatest(1, round(minutes::numeric * i / cnt)::integer) else minutes end;
    label := case when i <= cnt then null when used_double and i > cnt + extra - cnt then '翻倍卡' else '熟練加成' end;
    src := 'doom-run:' || p_session || ':' || i;

    if i <= cnt and random() < (z->>'danger')::numeric then
      e := (select el from jsonb_array_elements(zs->'danger') el order by random() limit 1);
      applied := public.doom_apply(u, e->'gain', src);
      drops := drops || jsonb_build_object('t', t, 'kind', 'danger', 'name', e->>'text', 'emoji', e->>'emoji', 'gains', applied);
      continue;
    end if;
    if i <= cnt and random() < 0.03 then
      e := zs->'meet';
      applied := public.doom_apply(u, e->'gain', src);
      drops := drops || jsonb_build_object('t', t, 'kind', 'meet', 'tier', 'l', 'name', e->>'text', 'emoji', e->>'emoji', 'gains', applied);
      n_rare := n_rare + 1;
      continue;
    end if;
    -- ❓ 未鑑定物品
    if random() < 0.10 then
      applied := public.doom_apply(u, '{"unid":1}'::jsonb, src);
      drops := drops || jsonb_build_object('t', t, 'kind', 'unid', 'tier', 'r', 'name', '未鑑定物品', 'emoji', '❓', 'label', label, 'gains', applied);
      continue;
    end if;

    tier := public.doom_roll_tier(lk + least(30, (t / 15) * 3));
    e := null;
    if tier in ('c', 'r') or (tier = 'l' and random() < 0.6) then
      select el into e from jsonb_array_elements(z->'items') el where el->>'tier' = tier order by random() limit 1;
    end if;
    if e is null then e := public.doom_loot(tier) || jsonb_build_object('src', 'loot');
    else e := e || jsonb_build_object('src', 'zone');
    end if;

    applied := public.doom_apply(u, e->'gain', src);
    perform public.doom_seen(u, e->>'id');
    drops := drops || jsonb_build_object('t', t, 'kind', 'item', 'tier', tier, 'id', e->>'id', 'src', e->>'src',
      'name', e->>'name', 'emoji', e->>'emoji', 'label', label, 'gains', applied);
    if tier in ('l', 'x', 's') then
      n_rare := n_rare + 1;
      perform public.doom_log_add(u, 'draw', tier, '在' || (z->>'name') || '搜刮到' || (e->>'name') || '！');
    end if;
  end loop;

  -- 🧩 記憶碎片：每趟 4%
  if cnt > 0 and random() < 0.04 then
    applied := public.doom_apply(u, '{"memory":"random"}'::jsonb, 'doom-run:' || p_session || ':mem');
    drops := drops || jsonb_build_object('t', minutes, 'kind', 'memory', 'tier', 'x', 'name', '前世記憶碎片', 'emoji', '🧩', 'gains', applied);
    n_rare := n_rare + 1;
  end if;
  -- 熟練 5 級：每趟必出一個稀有以上
  if mlv >= 5 and cnt > 0 then
    tier := public.doom_roll_tier(lk, 'l');
    e := public.doom_loot(tier);
    applied := public.doom_apply(u, e->'gain', 'doom-run:' || p_session || ':master');
    perform public.doom_seen(u, e->>'id');
    drops := drops || jsonb_build_object('t', minutes, 'kind', 'item', 'tier', tier, 'id', e->>'id', 'src', 'loot',
      'name', e->>'name', 'emoji', e->>'emoji', 'label', '熟練 5 級', 'gains', applied);
    n_rare := n_rare + 1;
  end if;

  completed := cnt > 0 and (
    (s.mode = 'down' and s.planned_minutes is not null and s.duration_seconds >= s.planned_minutes * 60 - 30)
    or (s.mode = 'up' and minutes >= 25));
  if completed then
    tier := public.doom_roll_tier(lk + 10, 'r');
    e := public.doom_loot(tier);
    applied := public.doom_apply(u, (e->'gain') || '{"scav":2}'::jsonb, 'doom-run:' || p_session || ':bonus');
    perform public.doom_seen(u, e->>'id');
    bonus := jsonb_build_object('tier', tier, 'id', e->>'id', 'src', 'loot', 'name', e->>'name', 'emoji', e->>'emoji', 'gains', applied);
  end if;

  -- 🧸 生活小物：每 15 分鐘擲一次，一趟最多 4 個；今天第一次搜刮一定有
  if cnt > 0 then
    v_first := public.doom_trinket_first(u);
    for i in 1..greatest(1, minutes / 15) loop
      exit when jsonb_array_length(trk) >= 4;
      tk := public.doom_trinket(u, 'doom-run:' || p_session || ':t' || i, z->>'id', v_first and i = 1);
      if tk is not null then trk := trk || tk; end if;
    end loop;
  end if;

  -- 🏮 夜市廢墟：深夜 10 點到凌晨 4 點開始的專注
  hr := extract(hour from (s.started_at at time zone 'Asia/Taipei'))::integer;
  if (hr >= 22 or hr < 4) and not st.zones_unlocked ? 'night_market' then
    update public.doom_state set zones_unlocked = zones_unlocked || '"night_market"'::jsonb where user_id = u;
    unlocked := 'night_market';
    perform public.doom_log_add(u, 'zone', 'l', '深夜專注時，發現了夜市廢墟！');
  end if;

  -- 📡 神秘訊號
  select * into st from public.doom_state where user_id = u;
  if st.signal_no < 3 then
    sg := ex->'signals'->st.signal_no;
    if st.signal_min >= (sg->>'need')::integer then
      update public.doom_state set signal_no = signal_no + 1, signal_min = 0 where user_id = u;
      if sg->>'unlock' is not null then
        update public.doom_state set zones_unlocked = zones_unlocked || to_jsonb(sg->>'unlock') where user_id = u;
      end if;
      applied := public.doom_apply(u, sg->'gain', 'doom-signal:' || st.signal_no);
      sig := jsonb_build_object('no', st.signal_no + 1, 'cipher', sg->>'cipher', 'unlock', sg->>'unlock', 'gains', applied);
      perform public.doom_log_add(u, 'signal', 'x', '解開了第 ' || (st.signal_no + 1) || ' 段神秘訊號！');
    end if;
  end if;

  res := jsonb_build_object('session', p_session, 'zone', z->>'id', 'zone_name', z->>'name', 'zone_emoji', z->>'emoji',
    'minutes', minutes, 'drops', drops, 'bonus', bonus, 'downgraded', downgraded, 'rare', n_rare,
    'mastery', jsonb_build_object('lv', mlv, 'minutes', mins + minutes), 'double', used_double,
    'unlocked', unlocked, 'signal', sig, 'trinkets', trk);
  insert into public.doom_runs (user_id, session_id, zone, minutes, result) values (u, p_session, z->>'id', minutes, res);
  perform public.doom_log_add(u, 'run', null,
    '在' || (z->>'name') || '專注 ' || minutes || ' 分鐘，帶回 ' || jsonb_array_length(drops) || ' 樣' || case when completed then '，平安歸來' else '' end || '。');
  return res || jsonb_build_object('rewards', public.doom_rewards_check(u));
end;
$function$;
revoke all on function public.doom_run_do(uuid, bigint, text, integer) from public, authenticated, anon;


-- ---------- 📊 今日生存度 ----------
create or replace function public.doom_progress(u uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare a record; p jsonb := public.doom_extra()->'progress'; dd public.doom_days%rowtype; pts integer;
begin
  select * into a from public.doom_activity(u, public.app_today());
  select * into dd from public.doom_days where user_id = u and day = public.app_today();
  pts := a.tasks * (p->>'task')::integer + a.steps * (p->>'step')::integer + (a.focus_s / 60) * (p->>'focus')::integer;
  return jsonb_build_object('pts', pts, 'tasks', a.tasks, 'steps', a.steps, 'focus_min', a.focus_s / 60,
    'tiers', p->'tiers', 'boxes', p->'boxes', 'chests', coalesce(dd.chests, 0));
end;
$function$;
revoke all on function public.doom_progress(uuid) from public, authenticated, anon;

create or replace function public.doom_daily_chest()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); today date := public.app_today(); p jsonb; c integer; applied jsonb; kind text;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_day(u, today, true);
  p := public.doom_progress(u);
  c := (p->>'chests')::integer;
  if c >= 3 then raise exception '今天的寶箱都開完了'; end if;
  if (p->>'pts')::integer < (p->'tiers'->>c)::integer then raise exception '生存度還不夠（% / %）', p->>'pts', p->'tiers'->>c; end if;
  kind := p->'boxes'->>c;
  update public.doom_days set chests = chests + 1 where user_id = u and day = today;
  applied := public.doom_apply(u, jsonb_build_object('box_' || kind, 1, 'scav', 2), 'doom-chest:' || today || ':' || c);
  return json_build_object('gains', applied, 'kind', kind, 'chests', c + 1);
end;
$function$;
grant execute on function public.doom_daily_chest() to authenticated;


-- ---------- 🐾 同伴好感度 ----------
create or replace function public.doom_pet(p_id text, p_gift boolean default false)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid(); today date := public.app_today();
  st public.doom_state%rowtype; dd public.doom_days%rowtype;
  v_add integer; v_before integer; v_after integer; lv0 integer; lv1 integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_day(u, today, true);
  select * into st from public.doom_state where user_id = u for update;
  select * into dd from public.doom_days where user_id = u and day = today for update;
  if not st.companions ? p_id then raise exception '還沒有這個同伴'; end if;
  if dd.bonded ? p_id then raise exception '今天已經陪過牠了，明天再來'; end if;
  if p_gift then
    if st.food < 3 then raise exception '食物不夠：需要 3'; end if;
    update public.doom_state set food = food - 3 where user_id = u;
  end if;
  v_add := case when p_gift then 12 else 5 end;
  v_before := coalesce((st.bond->>p_id)::integer, 0);
  v_after := least(100, v_before + v_add);
  lv0 := least(5, v_before / 20); lv1 := least(5, v_after / 20);
  update public.doom_state set bond = bond || jsonb_build_object(p_id, v_after) where user_id = u;
  update public.doom_days set bonded = bonded || to_jsonb(p_id) where user_id = u and day = today;
  if lv1 > lv0 then
    perform public.doom_log_add(u, 'bond', null, (public.doom_find('companions', p_id)->>'name') || '的好感度升到 ' || lv1 || ' 級。');
  end if;
  return json_build_object('id', p_id, 'bond', v_after, 'lv', lv1, 'up', lv1 > lv0, 'story', lv1 >= 3 and lv0 < 3, 'perk', lv1 >= 5 and lv0 < 5);
end;
$function$;
grant execute on function public.doom_pet(text, boolean) to authenticated;


-- ---------- ❓ 鑑定 ----------
create or replace function public.doom_identify(p_uid text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  st public.doom_state%rowtype;
  it jsonb;
  x double precision;
  tier text;
  e jsonb;
  applied jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  select el into it from jsonb_array_elements(st.unid) el where el->>'uid' = p_uid;
  if it is null then raise exception '找不到這個物品'; end if;
  if st.focus_total < (it->>'at')::integer + (it->>'need')::integer then
    raise exception '還要再專注 % 分鐘才能鑑定', (it->>'at')::integer + (it->>'need')::integer - st.focus_total;
  end if;
  update public.doom_state set unid = (select coalesce(jsonb_agg(el), '[]'::jsonb) from jsonb_array_elements(unid) el where el->>'uid' <> p_uid)
    where user_id = u;
  x := random() * 100;
  tier := case when x < 3 then 's' when x < 15 then 'x' when x < 35 then 'l' when x < 65 then 'r' else 'c' end;
  e := public.doom_loot(tier);
  applied := public.doom_apply(u, e->'gain', 'doom-unid:' || p_uid);
  perform public.doom_seen(u, e->>'id');
  if tier in ('l', 'x', 's') then perform public.doom_log_add(u, 'draw', tier, '鑑定出' || (e->>'name') || '！'); end if;
  return json_build_object('id', e->>'id', 'tier', tier, 'name', e->>'name', 'emoji', e->>'emoji', 'gains', applied);
end;
$function$;
grant execute on function public.doom_identify(text) to authenticated;


-- ---------- 🎡 每日轉盤：完成今天第一件事後轉一次 ----------
create or replace function public.doom_spin()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); today date := public.app_today(); dd public.doom_days%rowtype; a record; p jsonb; applied jsonb; res jsonb; idx integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_ensure(u);
  perform public.doom_day(u, today, true);
  select * into dd from public.doom_days where user_id = u and day = today for update;
  if dd.spin is not null then raise exception '今天已經轉過了'; end if;
  select * into a from public.doom_activity(u, today);
  if a.tasks + a.steps + a.focus_s / 1500 = 0 then raise exception '先完成今天第一件事（任務、專案打勾或專注 25 分鐘）'; end if;
  p := public.doom_wpick(public.doom_extra()->'spin');
  select i - 1 into idx from jsonb_array_elements(public.doom_extra()->'spin') with ordinality as t(el, i) where el->>'id' = p->>'id';
  applied := public.doom_apply(u, p->'gain', 'doom-spin:' || today);
  res := jsonb_build_object('id', p->>'id', 'name', p->>'name', 'emoji', p->>'emoji', 'index', idx, 'gains', applied);
  update public.doom_days set spin = res where user_id = u and day = today;
  return res::json;
end;
$function$;
grant execute on function public.doom_spin() to authenticated;


-- ---------- 🛒 神秘商人限時貨架 ----------
create or replace function public.doom_shop_buy(p_i integer)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid(); today date := public.app_today();
  st public.doom_state%rowtype; dd public.doom_days%rowtype;
  o jsonb; r record; have integer; neg jsonb := '{}'::jsonb; v_gold integer; applied jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_day(u, today, true);
  select * into dd from public.doom_days where user_id = u and day = today for update;
  o := dd.shop->p_i;
  if o is null then raise exception '沒有這個商品'; end if;
  if dd.shop_bought ? p_i::text then raise exception '這個今天已經買過了'; end if;
  select * into st from public.doom_state where user_id = u for update;
  for r in select key, value from jsonb_each(o->'price') loop
    if r.key = 'gold' then
      select p.gold into v_gold from public.profiles p where p.id = u;
      if coalesce(v_gold, 0) < (r.value #>> '{}')::integer then raise exception '金幣不夠：需要 %', r.value #>> '{}'; end if;
      update public.profiles set gold = gold - (r.value #>> '{}')::integer where id = u;
    else
      have := case r.key when 'food' then st.food when 'water' then st.water when 'parts' then st.parts else 0 end;
      if have < (r.value #>> '{}')::integer then
        raise exception '不夠：需要 % %', r.value #>> '{}', public.doom_catalog()->'res'->r.key->>'name';
      end if;
      neg := neg || jsonb_build_object(r.key, -(r.value #>> '{}')::integer);
    end if;
  end loop;
  if neg <> '{}'::jsonb then perform public.doom_apply(u, neg, 'doom-shop-pay'); end if;
  update public.doom_days set shop_bought = shop_bought || to_jsonb(p_i::text) where user_id = u and day = today;
  applied := public.doom_apply(u, o->'gain', 'doom-shop:' || today || ':' || p_i);
  return json_build_object('gains', applied, 'name', o->>'name');
end;
$function$;
grant execute on function public.doom_shop_buy(integer) to authenticated;


-- ---------- 📦 開補給箱 ----------
create or replace function public.doom_box_open(p_kind text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  st public.doom_state%rowtype;
  b jsonb := public.doom_extra()->'boxes'->p_kind;
  lk integer; i integer; tier text; e jsonb; applied jsonb; results jsonb := '[]'::jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  if b is null then raise exception '沒有這種箱子'; end if;
  select * into st from public.doom_state where user_id = u for update;
  if coalesce((st.boxes->>p_kind)::integer, 0) < 1 then raise exception '沒有%', b->>'name'; end if;
  update public.doom_state set boxes = boxes || jsonb_build_object(p_kind, (boxes->>p_kind)::integer - 1) where user_id = u;
  lk := public.doom_luck(u) + (b->>'luck')::integer;
  for i in 1..(b->>'n')::integer loop
    tier := public.doom_roll_tier(lk, case when i = 1 then b->>'min' else 'c' end);
    e := public.doom_loot(tier);
    applied := public.doom_apply(u, e->'gain', 'doom-box:' || gen_random_uuid());
    perform public.doom_seen(u, e->>'id');
    results := results || jsonb_build_object('id', e->>'id', 'tier', tier, 'gains', applied);
    if tier in ('l', 'x', 's') then perform public.doom_log_add(u, 'draw', tier, '從' || (b->>'name') || '開出' || (e->>'name') || '！'); end if;
  end loop;
  return json_build_object('results', results, 'kind', p_kind, 'rewards', public.doom_rewards_check(u));
end;
$function$;
grant execute on function public.doom_box_open(text) to authenticated;


-- ---------- 📔 倖存者日記：最近 7 天 ----------
create or replace function public.doom_diary()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); today date := public.app_today(); st public.doom_state%rowtype; d date; a record; out jsonb := '[]'::jsonb; runs jsonb; logs jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u;
  if not found then return '[]'::json; end if;
  d := today;
  while d >= greatest(st.started_on, today - 6) loop
    select * into a from public.doom_activity(u, d);
    select coalesce(jsonb_agg(jsonb_build_object('zone', r.result->>'zone_name', 'emoji', r.result->>'zone_emoji',
        'min', r.minutes, 'n', jsonb_array_length(r.result->'drops'), 'rare', r.result->'rare')), '[]'::jsonb) into runs
      from public.doom_runs r where r.user_id = u and (r.created_at at time zone 'Asia/Taipei' - interval '2 hours')::date = d;
    select coalesce(jsonb_agg(jsonb_build_object('kind', l.kind, 'tier', l.tier, 'body', l.body) order by l.id), '[]'::jsonb) into logs
      from public.doom_log l where l.user_id = u and l.day = d and l.kind in ('draw', 'event', 'visitor', 'choice', 'zone', 'signal', 'bond', 'build');
    out := out || jsonb_build_object('day', d, 'day_no', st.day_no - (today - d), 'tasks', a.tasks, 'steps', a.steps,
      'focus_min', a.focus_s / 60, 'runs', runs, 'logs', logs);
    d := d - 1;
  end loop;
  return out::json;
end;
$function$;
grant execute on function public.doom_diary() to authenticated;


-- ---------- 📺 進頁面 ----------
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
  rewards jsonb;
  st public.doom_state%rowtype;
  dd public.doom_days%rowtype;
  wk jsonb;
  v_last jsonb := null;
  logs jsonb;
  runs jsonb;
  v_gold integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  fresh := public.doom_ensure(u);
  settle := public.doom_settle(u);
  perform public.doom_day(u, today, true);
  harvest := public.doom_harvest(u);
  auto := public.doom_run_auto(u);
  rewards := public.doom_rewards_check(u);

  select * into st from public.doom_state where user_id = u;
  select * into dd from public.doom_days where user_id = u and day = today;
  select p.gold into v_gold from public.profiles p where p.id = u;
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
    'fresh', fresh, 'settle', settle, 'harvest', harvest, 'auto', auto, 'rewards', rewards,
    'state', to_jsonb(st) - 'user_id',
    'today', to_jsonb(dd) - 'user_id',
    'luck', public.doom_luck(u),
    'progress', public.doom_progress(u),
    'gold', coalesce(v_gold, 0),
    'week', wk, 'lastWeek', v_last, 'logs', logs, 'runs', runs, 'date', today);
end;
$function$;
grant execute on function public.doom_status() to authenticated;

revoke all on function public.doom_seen(uuid, text) from public, authenticated, anon;


-- =========================================================
-- 🧸 生活小物：搜刮、抽獎時有機會額外撿到的收藏（不影響原本的掉落）
--   每次抽獎 20%；專注搜刮每 15 分鐘擲一次 20%（一趟最多 4 個）；每天第一次搜刮一定有
--   重複的換士氣 +2、星屑 +3；集滿一個系列送補給箱、幸運永久 +1
-- =========================================================
alter table public.doom_state add column if not exists trinkets jsonb not null default '{}'::jsonb;
alter table public.doom_days add column if not exists trinket_first boolean not null default false;

create or replace function public.doom_trinket_cat()
returns jsonb language sql immutable
as $function$
select $json${
"series": [
  {"id":"snack","name":"零食櫃","emoji":"🍬","zones":["market","night_market","subway"],"gain":{"box_silver":1}},
  {"id":"can","name":"罐頭架","emoji":"🥫","zones":["bunker","military","market"],"gain":{"box_silver":1}},
  {"id":"memory","name":"回憶小物","emoji":"🧸","zones":["library","subway","rooftop"],"gain":{"box_gold":1}},
  {"id":"tool","name":"生存工具","emoji":"🔦","zones":["hardware","military","bunker"],"gain":{"box_silver":1}},
  {"id":"fun","name":"舊時代娛樂","emoji":"🎮","zones":["library","night_market","subway"],"gain":{"box_gold":1}},
  {"id":"rare","name":"稀有珍品","emoji":"🌟","zones":["observatory","rooftop"],"gain":{"box_gold":2,"wish_limited":1}}
],
"items": [
  {"id":"choco","s":"snack","tier":"c","name":"巧克力棒","emoji":"🍫","text":"融化過又凝固，還是很好吃。"},
  {"id":"chips","s":"snack","tier":"c","name":"洋芋片","emoji":"🥔","text":"袋子還鼓鼓的，裡面有空氣跟希望。"},
  {"id":"caramel","s":"snack","tier":"c","name":"牛奶糖","emoji":"🍬","text":"小時候的味道。"},
  {"id":"cracker","s":"snack","tier":"c","name":"蘇打餅乾","emoji":"🍘","text":"配什麼都可以。"},
  {"id":"soda","s":"snack","tier":"c","name":"汽水","emoji":"🥤","text":"打開的那聲「嘶」，好久沒聽到了。"},
  {"id":"jelly","s":"snack","tier":"r","name":"果凍","emoji":"🍮","text":"五顏六色，看了心情就好。"},
  {"id":"eggroll","s":"snack","tier":"r","name":"蛋捲","emoji":"🥠","text":"鐵盒裡排得整整齊齊。"},
  {"id":"lollipop","s":"snack","tier":"r","name":"棒棒糖","emoji":"🍭","text":"大到可以吃一個禮拜。"},
  {"id":"tuna","s":"can","tier":"c","name":"鮪魚罐頭","emoji":"🐟","text":"拉環一拉就開，太方便了。"},
  {"id":"corncan","s":"can","tier":"c","name":"玉米罐","emoji":"🌽","text":"甜甜的玉米粒。"},
  {"id":"congee","s":"can","tier":"c","name":"八寶粥","emoji":"🥣","text":"還附了一支小湯匙。"},
  {"id":"peach","s":"can","tier":"r","name":"水蜜桃罐頭","emoji":"🍑","text":"糖水是最好喝的部分。"},
  {"id":"spam","s":"can","tier":"r","name":"午餐肉","emoji":"🥩","text":"煎一下香到整個基地都聞得到。"},
  {"id":"goldcan","s":"can","tier":"s","name":"黃金罐頭","emoji":"✨","text":"沒人知道裡面裝什麼，但它在發光。"},
  {"id":"postcard","s":"memory","tier":"c","name":"明信片","emoji":"💌","text":"寄不出去的信，被綁成一疊。"},
  {"id":"hairclip","s":"memory","tier":"c","name":"髮夾","emoji":"🌸","text":"某個人很喜歡的小東西。"},
  {"id":"teddy","s":"memory","tier":"r","name":"泰迪熊","emoji":"🧸","text":"耳朵補過好幾次。"},
  {"id":"watch","s":"memory","tier":"r","name":"舊手錶","emoji":"⌚","text":"停在某一天的某個時間。"},
  {"id":"photo","s":"memory","tier":"l","name":"全家福","emoji":"🖼️","text":"玻璃裂了，笑容還在。"},
  {"id":"musicbox","s":"memory","tier":"x","name":"音樂盒","emoji":"🎶","text":"轉一轉，還會唱歌。"},
  {"id":"torch","s":"tool","tier":"c","name":"手電筒","emoji":"🔦","text":"晚上最可靠的朋友。"},
  {"id":"lighter","s":"tool","tier":"c","name":"打火機","emoji":"🔥","text":"一打就著。"},
  {"id":"whistle","s":"tool","tier":"c","name":"哨子","emoji":"📯","text":"走散的時候吹三聲。"},
  {"id":"rope","s":"tool","tier":"c","name":"繩索","emoji":"🪢","text":"什麼都綁得住。"},
  {"id":"knife","s":"tool","tier":"r","name":"瑞士刀","emoji":"🔪","text":"一把抵十把。"},
  {"id":"compass","s":"tool","tier":"l","name":"指南針","emoji":"🧭","text":"指針一直指著回家的方向。"},
  {"id":"cards","s":"fun","tier":"c","name":"撲克牌","emoji":"🃏","text":"少了一張紅心 7。"},
  {"id":"comic","s":"fun","tier":"c","name":"漫畫書","emoji":"📕","text":"停在最精彩的那一集。"},
  {"id":"marbles","s":"fun","tier":"c","name":"彈珠","emoji":"🔮","text":"一袋玻璃做的星球。"},
  {"id":"cassette","s":"fun","tier":"r","name":"卡帶","emoji":"📼","text":"上面手寫著「最愛的歌」。"},
  {"id":"cube","s":"fun","tier":"r","name":"魔術方塊","emoji":"🧊","text":"只差最後一層。"},
  {"id":"gameboy","s":"fun","tier":"x","name":"掌上遊戲機","emoji":"🎮","text":"螢幕裂了，但還能玩。"},
  {"id":"candyjar","s":"rare","tier":"l","name":"彩虹糖罐","emoji":"🍬","text":"整罐都是彩色的。"},
  {"id":"cake","s":"rare","tier":"x","name":"生日蛋糕","emoji":"🎂","text":"完整的一個，還插著一根蠟燭。"},
  {"id":"ring","s":"rare","tier":"x","name":"戒指","emoji":"💍","text":"絨布盒裡，一個約定。"},
  {"id":"pocketwatch","s":"rare","tier":"s","name":"金色懷錶","emoji":"⏱️","text":"秒針又開始走了。"},
  {"id":"starbottle","s":"rare","tier":"s","name":"星星玻璃瓶","emoji":"🌟","text":"一瓶摺好的紙星星，會發光。"},
  {"id":"snowglobe","s":"rare","tier":"s","name":"雪花球","emoji":"❄️","text":"裡面的小鎮，永遠在下雪。"}
]}$json$::jsonb
$function$;
grant execute on function public.doom_trinket_cat() to authenticated;

-- 擲一個小物：p_force 為 true 時一定給；回傳撿到的東西，沒撿到回傳 null
create or replace function public.doom_trinket(u uuid, p_src text, p_zone text, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  cat jsonb := public.doom_trinket_cat();
  lk integer := public.doom_luck(u);
  x double precision;
  tier text;
  e jsonb := null;
  have integer;
  applied jsonb;
  ser jsonb;
  key text;
  st public.doom_state%rowtype;
  done jsonb := null;
begin
  if not p_force and random() >= 0.20 then return null; end if;
  x := random() * 100;
  tier := case
    when x < 1.5 + lk * 0.05 then 's'
    when x < 5 + lk * 0.15 then 'x'
    when x < 13 + lk * 0.3 then 'l'
    when x < 40 + lk * 0.5 then 'r'
    else 'c' end;
  -- 區域偏好：60% 先從這個區域常見的系列挑
  if p_zone is not null and random() < 0.6 then
    select el into e from jsonb_array_elements(cat->'items') el
      where el->>'tier' = tier and exists (select 1 from jsonb_array_elements(cat->'series') s
        where s->>'id' = el->>'s' and s->'zones' ? p_zone)
      order by random() limit 1;
  end if;
  if e is null then
    select el into e from jsonb_array_elements(cat->'items') el where el->>'tier' = tier order by random() limit 1;
  end if;
  if e is null then return null; end if;

  select * into st from public.doom_state where user_id = u for update;
  have := coalesce((st.trinkets->>(e->>'id'))::integer, 0);
  update public.doom_state set trinkets = trinkets || jsonb_build_object(e->>'id', have + 1) where user_id = u;
  applied := public.doom_apply(u, case when have > 0 then '{"morale":2,"stardust":3}' else '{"morale":3}' end::jsonb, p_src || ':trk');
  if tier in ('x', 's') then perform public.doom_log_add(u, 'draw', tier, '撿到了生活小物：' || (e->>'name') || '！'); end if;

  -- 這個系列集滿了沒
  ser := (select s from jsonb_array_elements(cat->'series') s where s->>'id' = e->>'s');
  key := 'tset:' || (e->>'s');
  select * into st from public.doom_state where user_id = u;
  if not st.rewards ? key and not exists (select 1 from jsonb_array_elements(cat->'items') it
      where it->>'s' = e->>'s' and not st.trinkets ? (it->>'id')) then
    update public.doom_state set rewards = rewards || jsonb_build_object(key, public.app_today()) where user_id = u;
    done := jsonb_build_object('kind', 'set', 'title', (ser->>'emoji') || ' 小物系列集滿：' || (ser->>'name') || '（幸運永久 +1）',
      'gains', public.doom_apply(u, ser->'gain', 'doom-rw:' || key));
    perform public.doom_log_add(u, 'draw', 'x', '集滿了生活小物「' || (ser->>'name') || '」！');
  end if;

  return jsonb_build_object('id', e->>'id', 'name', e->>'name', 'emoji', e->>'emoji', 'tier', tier,
    'new', have = 0, 'count', have + 1, 'gains', applied, 'set', done);
end;
$function$;
revoke all on function public.doom_trinket(uuid, text, text, boolean) from public, authenticated, anon;

-- 今天第一次搜刮：回傳 true 並記下來
create or replace function public.doom_trinket_first(u uuid)
returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare n integer;
begin
  update public.doom_days set trinket_first = true
    where user_id = u and day = public.app_today() and not trinket_first;
  get diagnostics n = row_count;
  return n > 0;
end;
$function$;
revoke all on function public.doom_trinket_first(uuid) from public, authenticated, anon;
