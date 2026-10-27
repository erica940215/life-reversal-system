-- =========================================================
-- 序光計畫：☢️ 末世：序光（遊戲的新一層）
-- 可以重複執行。要先執行過「簽到發券與背包」（grant_item）、「專案」（project_steps / project_step_logs）。
--
-- 玩法：
--   開局直接發一包「開局行李」，末世已經開始。
--   真實行為 → 物資：
--     完成任務      → 🥫+1 💧+1 🎟️+1（一天最多算 15 個）
--     專案打勾      → 每 2 個：🥫+1 💧+1 🎟️+1（一天最多算 20 個）
--     專注          → 每 30 分鐘 🔩+2；每 1 小時 🎟️+1（一天最多 12 張）
--   每天：晨間廣播（有時帶今日加成）、撿物資、一件隨機事件、一位訪客
--   搜刮：用搜刮券抽，十連，10 抽保底稀有以上；今天做越多事，幸運越高
--   基地：6 種設施（最高 10 級），每天自動生產；每天吃 1 食物 1 水
--   每週一章：達成本週目標領章節寶箱，超額完成再領一次；每章一次抉擇；週報
--
--   doom_status()            進頁面：建立存檔、跨日結算、收今天的成果、今日事件
--   doom_pickup()            每日撿物資
--   doom_resolve(slot, opt)  處理今日事件（slot = 'event' / 'visitor'）
--   doom_draw(n)             搜刮 1 或 10 次
--   doom_build(fac)          升級設施
--   doom_repair()            修理基地
--   doom_trade()             食物＋水換搜刮券（一天 5 次）
--   doom_week_claim()        領本週章節寶箱
--   doom_dilemma(opt)        本章抉擇
--   doom_report_seen()       週報看過了
-- =========================================================


-- ---------- 資料表 ----------
create table if not exists public.doom_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_on date not null,
  last_settle date not null,
  day_no integer not null default 1,
  food integer not null default 0,
  water integer not null default 0,
  parts integer not null default 0,
  scav integer not null default 0,
  hp integer not null default 80,
  morale integer not null default 60,
  pity integer not null default 0,
  draws_total integer not null default 0,
  facilities jsonb not null default '{"bed":1}'::jsonb,
  companions jsonb not null default '[]'::jsonb,
  relics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.doom_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  tasks_n integer not null default 0,
  steps_n integer not null default 0,
  focus_s integer not null default 0,
  broadcast text,
  event_id text,
  event_done jsonb,
  visitor_id text,
  visitor_done jsonb,
  picked jsonb,
  draws integer not null default 0,
  traded integer not null default 0,
  primary key (user_id, day)
);

create table if not exists public.doom_weeks (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_no integer not null,
  claimed integer not null default 0,
  choice jsonb,
  report_seen boolean not null default false,
  primary key (user_id, week_no)
);

create table if not exists public.doom_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  kind text not null,
  tier text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists doom_log_user_idx on public.doom_log (user_id, id desc);

alter table public.doom_state enable row level security;
alter table public.doom_days enable row level security;
alter table public.doom_weeks enable row level security;
alter table public.doom_log enable row level security;

drop policy if exists doom_state_own on public.doom_state;
create policy doom_state_own on public.doom_state for select using (user_id = auth.uid());
drop policy if exists doom_days_own on public.doom_days;
create policy doom_days_own on public.doom_days for select using (user_id = auth.uid());
drop policy if exists doom_weeks_own on public.doom_weeks;
create policy doom_weeks_own on public.doom_weeks for select using (user_id = auth.uid());
drop policy if exists doom_log_own on public.doom_log;
create policy doom_log_own on public.doom_log for select using (user_id = auth.uid());


-- ---------- 📚 圖鑑（所有內容都在這裡，前端也用這份） ----------
create or replace function public.doom_catalog()
returns jsonb language sql immutable
as $catalog$
select $j${
"tiers": {"c":"普通","r":"精良","l":"稀有","x":"史詩","s":"傳說"},
"res": {
  "food":   {"name":"食物","emoji":"🥫"},
  "water":  {"name":"水","emoji":"💧"},
  "parts":  {"name":"零件","emoji":"🔩"},
  "scav":   {"name":"搜刮券","emoji":"🎟️"},
  "hp":     {"name":"基地耐久","emoji":"🛡️"},
  "morale": {"name":"士氣","emoji":"🔥"},
  "stardust": {"name":"星屑","emoji":"✨"},
  "gold":   {"name":"金幣","emoji":"🪙"},
  "wish_normal": {"name":"星願券","emoji":"🎫"},
  "wish_rare": {"name":"稀有星願券","emoji":"🌠"},
  "wish_limited": {"name":"限定星願瓶","emoji":"🍾"},
  "ticket_normal": {"name":"召喚券","emoji":"🎟️"},
  "ticket_special": {"name":"特殊召喚券","emoji":"🎫"}
},
"loot": [
  {"id":"can","tier":"c","name":"罐頭","emoji":"🥫","gain":{"food":2},"text":"標籤被撕掉了，希望是鳳梨。"},
  {"id":"bottle","tier":"c","name":"礦泉水","emoji":"💧","gain":{"water":2},"text":"瓶蓋還沒開過，太好了。"},
  {"id":"screws","tier":"c","name":"一袋螺絲","emoji":"🔩","gain":{"parts":3},"text":"大小不一，但總會用上。"},
  {"id":"noodle","tier":"c","name":"泡麵","emoji":"🍜","gain":{"food":3},"text":"過期三天，問題不大。"},
  {"id":"rainbucket","tier":"c","name":"雨水桶","emoji":"🪣","gain":{"water":3},"text":"昨晚的雨，剛好接滿。"},
  {"id":"wire","tier":"c","name":"一捆電線","emoji":"🔌","gain":{"parts":2,"water":1},"text":"捲起來的時候順便找到半瓶水。"},
  {"id":"candy","tier":"c","name":"水果糖","emoji":"🍬","gain":{"morale":3,"food":1},"text":"甜的東西讓人想起以前。"},
  {"id":"newspaper","tier":"c","name":"舊報紙","emoji":"📰","gain":{"morale":2,"parts":1},"text":"頭條：「專家表示一切正常」。"},
  {"id":"pinch","tier":"c","name":"一小撮星屑","emoji":"✨","gain":{"stardust":3},"text":"在瓦礫縫裡閃閃發亮。"},
  {"id":"coins","tier":"c","name":"零錢","emoji":"🪙","gain":{"gold":10},"text":"末世了，錢還是有人收。"},
  {"id":"battery","tier":"c","name":"電池","emoji":"🔋","gain":{"parts":2,"morale":1},"text":"還有一格電。"},
  {"id":"biscuit","tier":"c","name":"壓縮餅乾","emoji":"🍪","gain":{"food":2,"water":1},"text":"硬得可以當磚頭。"},
  {"id":"pack","tier":"r","name":"補給背包","emoji":"🎒","gain":{"food":3,"water":3,"parts":3},"text":"有人收拾好了，卻沒來得及帶走。"},
  {"id":"toolbox","tier":"r","name":"工具箱","emoji":"🧰","gain":{"parts":8},"text":"扳手、鉗子、膠帶，一應俱全。"},
  {"id":"medkit","tier":"r","name":"急救包","emoji":"🩹","gain":{"hp":15},"text":"順手把基地的裂縫也補了。"},
  {"id":"chain","tier":"r","name":"幸運連鎖","emoji":"🍀","gain":{"scav":2},"text":"又多了兩次搜刮機會！"},
  {"id":"dustbag","tier":"r","name":"星屑袋","emoji":"✨","gain":{"stardust":10},"text":"沉甸甸的一袋。"},
  {"id":"goldbag","tier":"r","name":"金幣袋","emoji":"💰","gain":{"gold":30},"text":"不知道是誰藏的私房錢。"},
  {"id":"cooler","tier":"r","name":"冷藏箱","emoji":"🧊","gain":{"food":5,"water":5},"text":"居然還是冰的。"},
  {"id":"guitar","tier":"r","name":"舊吉他","emoji":"🎸","gain":{"morale":10},"text":"少了一根弦，還是能彈。"},
  {"id":"generator","tier":"l","name":"發電機零件","emoji":"⚙️","gain":{"parts":18},"text":"這可是好東西。"},
  {"id":"ration","tier":"l","name":"軍用口糧箱","emoji":"📦","gain":{"food":8,"water":8},"text":"夠吃好幾天。"},
  {"id":"blueprint","tier":"l","name":"設施藍圖","emoji":"📐","gain":{"facility":"random"},"text":"照著做，某個設施直接升一級！"},
  {"id":"buddy","tier":"l","name":"新同伴","emoji":"🤝","gain":{"companion":"random"},"text":"有人在廢墟裡對你揮手。"},
  {"id":"dustjar","tier":"l","name":"星屑罐","emoji":"🫙","gain":{"stardust":30},"text":"整罐都在發光。"},
  {"id":"wish","tier":"l","name":"星願券","emoji":"🎫","gain":{"wish_normal":1},"text":"可以拿去星願池抽。"},
  {"id":"ticket","tier":"l","name":"召喚券","emoji":"🎟️","gain":{"ticket_normal":1},"text":"冒險那邊用得到。"},
  {"id":"jackpot","tier":"l","name":"搜刮大豐收","emoji":"🎰","gain":{"scav":5},"text":"這一帶還沒被人翻過！"},
  {"id":"relicx","tier":"x","name":"奇異收藏品","emoji":"🔮","gain":{"relic":"x"},"text":"這東西不該出現在這裡。"},
  {"id":"dustchest","tier":"x","name":"星屑寶箱","emoji":"💎","gain":{"stardust":80},"text":"打開的瞬間整個房間都亮了。"},
  {"id":"wishrare","tier":"x","name":"稀有星願券","emoji":"🌠","gain":{"wish_rare":1},"text":"摸起來是溫的。"},
  {"id":"ticketsp","tier":"x","name":"特殊召喚券","emoji":"🎫","gain":{"ticket_special":1},"text":"背面印著看不懂的符號。"},
  {"id":"airdrop","tier":"x","name":"空投補給","emoji":"🪂","gain":{"food":15,"water":15,"parts":30,"scav":3},"text":"天上掉下來的禮物。"},
  {"id":"relics","tier":"s","name":"傳說收藏品","emoji":"🌟","gain":{"relic":"s"},"text":"你知道，這是命運。"},
  {"id":"treasure","tier":"s","name":"末世寶藏","emoji":"👑","gain":{"stardust":200,"wish_limited":1},"text":"前世的你，一定很羨慕現在的你。"}
],
"relics": [
  {"id":"singing_radio","tier":"x","name":"會唱歌的收音機","emoji":"📻","text":"沒插電，卻一直在唱一首你沒聽過的歌。"},
  {"id":"pocket_watch","tier":"x","name":"不會停的懷錶","emoji":"⌚","text":"指針永遠指著末世開始前十分鐘。"},
  {"id":"half_map","tier":"x","name":"半張藏寶圖","emoji":"🗺️","text":"另一半在誰手上？"},
  {"id":"my_diary","tier":"x","name":"寫著你名字的日記","emoji":"📔","text":"字跡是你的，但你不記得寫過。"},
  {"id":"warm_flask","tier":"x","name":"永遠溫熱的保溫杯","emoji":"🧋","text":"裡面的茶，永遠剛好入口。"},
  {"id":"family_photo","tier":"x","name":"一張全家福","emoji":"🖼️","text":"每個人都笑得很用力。"},
  {"id":"no_ticket","tier":"x","name":"沒有號碼的車票","emoji":"🎫","text":"終點站寫著「明天」。"},
  {"id":"teddy","tier":"x","name":"小熊玩偶","emoji":"🧸","text":"少了一隻眼睛，多了很多勇氣。"},
  {"id":"rust_medal","tier":"x","name":"生鏽的勳章","emoji":"🎖️","text":"「頒給：撐過今天的人」。"},
  {"id":"snow_globe","tier":"x","name":"星空雪花球","emoji":"🔮","text":"搖一搖，裡面下起星星。"},
  {"id":"glow_can","tier":"s","name":"會發光的罐頭","emoji":"🥫","text":"沒有人敢打開，但大家都覺得很安心。"},
  {"id":"ai_core","tier":"s","name":"人工智慧的殘骸","emoji":"🤖","text":"它最後一句話是：「請繼續努力」。"},
  {"id":"last_letter","tier":"s","name":"末日前的最後一封信","emoji":"✉️","text":"收件人是未來的你。"},
  {"id":"time_capsule","tier":"s","name":"時間膠囊","emoji":"⏳","text":"裡面裝著你以前的夢想，還沒過期。"},
  {"id":"black_phone","tier":"s","name":"還有訊號的黑色手機","emoji":"📱","text":"螢幕上只有一則未讀訊息：「我也還在」。"},
  {"id":"dawn_seed","tier":"s","name":"序光之種","emoji":"🌱","text":"據說種下去，世界就會重新開始。"}
],
"companions": [
  {"id":"dog","name":"流浪狗","emoji":"🐕","perk":"每天撿物資多 2 樣"},
  {"id":"cat","name":"橘貓","emoji":"🐈","perk":"士氣每天 +3"},
  {"id":"doctor","name":"醫生","emoji":"🧑‍⚕️","perk":"基地耐久每天 +3"},
  {"id":"engineer","name":"工程師","emoji":"🧑‍🔧","perk":"升級設施的零件少 15%"},
  {"id":"farmer","name":"農夫","emoji":"🧑‍🌾","perk":"每天 +1 食物"},
  {"id":"merchant","name":"老商人","emoji":"🧔","perk":"換搜刮券只要 6 食物＋6 水"},
  {"id":"robot","name":"小機器人","emoji":"🤖","perk":"每天 +1 搜刮券"},
  {"id":"owl","name":"貓頭鷹","emoji":"🦉","perk":"幸運 +3"}
],
"facilities": [
  {"id":"bed","name":"床鋪","emoji":"🛏️","desc":"每級：基地耐久每天 +2"},
  {"id":"purifier","name":"淨水器","emoji":"🚰","desc":"每級：每天 +1 水"},
  {"id":"garden","name":"菜園","emoji":"🥬","desc":"每級：每天 +1 食物"},
  {"id":"bench","name":"工作台","emoji":"🛠️","desc":"每級：每天 +1 零件"},
  {"id":"wall","name":"圍牆","emoji":"🧱","desc":"每級：壞事件的傷害 -8%"},
  {"id":"radio","name":"收音機","emoji":"📡","desc":"每級：幸運 +2"}
],
"broadcasts": [
  {"id":"b01","text":"這裡是序光電台。今天天氣晴，適合出門搜刮。","buff":"luck"},
  {"id":"b02","text":"插播：東區超市的貨架還沒被搬空，有人看到成箱的罐頭。","buff":"pick2"},
  {"id":"b03","text":"氣象預報：午後陣雨。記得把桶子放到屋外。","buff":"rain"},
  {"id":"b04","text":"今天很安靜。安靜得有點不習慣。","buff":"calm"},
  {"id":"b05","text":"有個推著推車的老人在附近出沒，聽說什麼都賣。","buff":"trader"},
  {"id":"b06","text":"早安，倖存者。你昨天做得很好。","buff":null},
  {"id":"b07","text":"今天的播放清單：第一首，〈明天會更好〉。","buff":null},
  {"id":"b08","text":"提醒：喝水。真的，喝水。","buff":"rain"},
  {"id":"b09","text":"聽眾來信：「我今天把一本書讀完了。」主持人：「了不起。」","buff":"luck"},
  {"id":"b10","text":"北邊的橋斷了。南邊的路還通。","buff":null},
  {"id":"b11","text":"有人在廣場用粉筆畫了一個大大的笑臉。","buff":"calm"},
  {"id":"b12","text":"今天是好日子。不為什麼，就是這樣決定的。","buff":"luck"},
  {"id":"b13","text":"小道消息：廢棄的學校裡還有完整的工具間。","buff":"pick2"},
  {"id":"b14","text":"電台訊號不太穩……滋……專注……滋……就會有收穫……","buff":"luck"},
  {"id":"b15","text":"昨晚有人看到流星。許願了嗎？","buff":null},
  {"id":"b16","text":"警告：今晚風很大，門窗關好。","buff":null},
  {"id":"b17","text":"有隻狗在電台門口睡了一整晚。牠看起來很友善。","buff":"pick2"},
  {"id":"b18","text":"商隊今天會經過你那一帶。準備好要交換的東西。","buff":"trader"},
  {"id":"b19","text":"今日格言：一次只做一件事，然後做完它。","buff":"luck"},
  {"id":"b20","text":"雨季來了。水不會是問題，屋頂可能會。","buff":"rain"},
  {"id":"b21","text":"沒有新消息。沒有消息就是好消息。","buff":"calm"},
  {"id":"b22","text":"主持人今天心情很好，因為找到了一包咖啡豆。","buff":null},
  {"id":"b23","text":"有人說在地鐵站看到了發光的東西。是真的嗎？","buff":"luck"},
  {"id":"b24","text":"今天適合整理基地，然後好好睡一覺。","buff":"calm"}
],
"buffs": {
  "luck":{"name":"今日幸運 +5","emoji":"🍀"},
  "pick2":{"name":"今天撿物資 ×2","emoji":"🧺"},
  "rain":{"name":"今天下雨：+3 水","emoji":"🌧️"},
  "calm":{"name":"今天不會有壞事件","emoji":"🕊️"},
  "trader":{"name":"今天的訪客是商人","emoji":"🛒"}
},
"events": [
  {"id":"g_basement","kind":"good","emoji":"🏚️","title":"地下室的補給","text":"隔壁的地下室裡，有一箱沒人動過的補給。","opts":[{"label":"搬回家","outs":[{"text":"整箱搬回來了！","gain":{"food":4,"water":4}}]}]},
  {"id":"g_rainbow","kind":"good","emoji":"🌈","title":"雨後彩虹","text":"雨停了，天邊掛著一道彩虹。","opts":[{"label":"看一會兒","outs":[{"text":"好久沒有這麼平靜了。","gain":{"morale":8,"water":3}}]}]},
  {"id":"g_drone","kind":"good","emoji":"🛸","title":"墜落的無人機","text":"一台無人機掉在屋頂上，螺旋槳還在轉。","opts":[{"label":"拆零件","outs":[{"text":"拆出一大堆好東西。","gain":{"parts":10}}]}]},
  {"id":"g_greens","kind":"good","emoji":"🥬","title":"路邊的野菜","text":"人行道的縫隙裡長出一整片野菜。","opts":[{"label":"摘回去","outs":[{"text":"今晚加菜。","gain":{"food":5}}]}]},
  {"id":"g_signal","kind":"good","emoji":"📡","title":"求救訊號有回應了","text":"你發出去的訊號，有人回了：「座標收到，補給放在老地方」。","opts":[{"label":"去老地方","outs":[{"text":"真的有一包東西在那裡。","gain":{"morale":5,"scav":2}}]}]},
  {"id":"g_vending","kind":"good","emoji":"🥤","title":"還有電的販賣機","text":"街角的販賣機居然還亮著燈。","opts":[{"label":"踹一腳","outs":[{"w":6,"text":"掉出一堆飲料！","gain":{"water":5,"food":1}},{"w":4,"text":"腳好痛，什麼都沒掉。","gain":{"hp":-3}}]},{"label":"拆開它","cost":{"parts":2},"outs":[{"text":"穩穩拿到全部。","gain":{"water":5,"food":3}}]}]},
  {"id":"g_library","kind":"good","emoji":"📚","title":"廢棄的圖書館","text":"書架倒了一半，另一半還站得好好的。","opts":[{"label":"坐下來讀一本","outs":[{"text":"你讀完了一整本，覺得自己又強大了一點。","gain":{"morale":6,"stardust":5}}]}]},
  {"id":"g_starfall","kind":"good","emoji":"🌠","title":"流星雨","text":"今晚的天空，下起了星星。","opts":[{"label":"許願","outs":[{"text":"願望好像被聽見了。","gain":{"scav":3,"morale":5}}]}]},
  {"id":"b_leak","kind":"bad","emoji":"💦","title":"屋頂漏水","text":"半夜被滴在臉上的水叫醒。","opts":[{"label":"修補","cost":{"parts":3},"outs":[{"text":"修好了，還順便接了一桶雨水。","gain":{"water":2}}]},{"label":"先不管","outs":[{"text":"漏了一整晚。","gain":{"hp":-8,"morale":-3}}]}]},
  {"id":"b_rats","kind":"bad","emoji":"🐀","title":"老鼠來了","text":"儲藏室傳來窸窸窣窣的聲音。","opts":[{"label":"設陷阱","cost":{"parts":2},"outs":[{"text":"抓到三隻，糧食保住了。","gain":{"morale":2}}]},{"label":"不管牠","outs":[{"text":"牠們吃得很開心。","gain":{"food":-4}}]}]},
  {"id":"b_blackout","kind":"bad","emoji":"🔌","title":"停電","text":"所有的燈一起熄了。","opts":[{"label":"修電箱","cost":{"parts":4},"outs":[{"text":"燈亮了，大家都歡呼。","gain":{"morale":3}}]},{"label":"點蠟燭過夜","outs":[{"text":"黑暗讓人心情低落。","gain":{"morale":-6}}]}]},
  {"id":"b_storm","kind":"bad","emoji":"🌪️","title":"沙塵暴","text":"遠方的天空變成了土黃色。","opts":[{"label":"加固門窗","cost":{"parts":5},"outs":[{"text":"擋住了。","gain":{}}]},{"label":"躲進地下室","outs":[{"text":"出來時，基地被吹壞了一些。","gain":{"hp":-12}}]}]},
  {"id":"b_fever","kind":"bad","emoji":"🤒","title":"發燒了","text":"頭很燙，全身沒力。","opts":[{"label":"吃東西休息","cost":{"food":2,"water":2},"outs":[{"text":"睡一覺就好多了。","gain":{"hp":5}}]},{"label":"硬撐","outs":[{"text":"撐過去了，但很辛苦。","gain":{"hp":-10,"morale":-5}}]}]},
  {"id":"b_thief","kind":"bad","emoji":"🦹","title":"小偷","text":"一個人影抱著你的零件箱跑了！","opts":[{"label":"追上去","outs":[{"w":5,"text":"搶回來了，他還掉了自己的東西。","gain":{"parts":6}},{"w":5,"text":"跌了一跤，沒追到。","gain":{"hp":-6,"parts":-3}}]},{"label":"算了","outs":[{"text":"少了一些零件。","gain":{"parts":-5}}]}]},
  {"id":"b_quake","kind":"bad","emoji":"🫨","title":"餘震","text":"地面又晃了起來。","opts":[{"label":"檢查結構","cost":{"parts":6},"outs":[{"text":"補強了幾根樑，比之前更穩。","gain":{"hp":5}}]},{"label":"祈禱","outs":[{"w":3,"text":"運氣不錯，沒事。","gain":{}},{"w":7,"text":"牆裂開了。","gain":{"hp":-15}}]}]},
  {"id":"w_radio","kind":"weird","emoji":"📻","title":"收音機傳來密碼","text":"「三、七、二、九……重複……三、七、二、九……」","opts":[{"label":"試著解碼","outs":[{"w":5,"text":"是補給點的座標！","gain":{"scav":4}},{"w":5,"text":"只是摩斯版的天氣預報。","gain":{"morale":-2}}]},{"label":"關掉","outs":[{"text":"有些事情不知道比較好。","gain":{"morale":1}}]}]},
  {"id":"w_dream","kind":"weird","emoji":"💭","title":"夢見前世","text":"夢裡的你，在末世開始的那天放棄了。","opts":[{"label":"把夢寫下來","outs":[{"text":"這一次，你不會放棄。","gain":{"morale":6,"stardust":5}}]},{"label":"忘掉它","outs":[{"text":"好好睡了一覺。","gain":{"hp":3}}]}]},
  {"id":"w_map","kind":"weird","emoji":"🗺️","title":"奇怪的地圖","text":"門縫下塞進一張地圖，上面有一個紅色的叉。","opts":[{"label":"照著走","cost":{"food":2,"water":2},"outs":[{"w":4,"text":"叉的位置埋著一個奇怪的東西。","gain":{"relic":"x"}},{"w":6,"text":"挖到一箱零件。","gain":{"parts":8}}]},{"label":"收起來","outs":[{"text":"地圖背面黏著一點星屑。","gain":{"stardust":3}}]}]},
  {"id":"w_box","kind":"weird","emoji":"🧳","title":"上鎖的箱子","text":"一個很重的箱子，鎖已經生鏽了。","opts":[{"label":"撬開","cost":{"parts":3},"outs":[{"w":3,"text":"滿滿的搜刮券！","gain":{"scav":6}},{"w":5,"text":"是一整箱物資。","gain":{"food":4,"water":4}},{"w":2,"text":"空的，只有一張紙條：「哈哈」。","gain":{}}]},{"label":"不開","outs":[{"text":"有些箱子就讓它繼續神秘吧。","gain":{"morale":1}}]}]},
  {"id":"w_blackcat","kind":"weird","emoji":"🐈‍⬛","title":"黑貓盯著你","text":"牠一動也不動，好像在等你。","opts":[{"label":"跟著牠","outs":[{"w":5,"text":"牠帶你找到一個藏起來的倉庫。","gain":{"parts":6,"food":3}},{"w":5,"text":"牠決定跟你回家。","gain":{"companion":"cat"}}]},{"label":"不理牠","outs":[{"text":"牠打了個哈欠走了。","gain":{}}]}]},
  {"id":"w_mirror","kind":"weird","emoji":"🪞","title":"鏡子裡的你","text":"鏡子裡的你，比你晚了一秒才眨眼。","opts":[{"label":"對他笑","outs":[{"text":"他也笑了。你覺得自己沒那麼孤單。","gain":{"morale":8}}]},{"label":"打破它","outs":[{"w":5,"text":"碎片後面藏著搜刮券。","gain":{"scav":3}},{"w":5,"text":"七年的霉運……應該不算數吧？","gain":{"morale":-5}}]}]},
  {"id":"w_mushroom","kind":"weird","emoji":"🍄","title":"發光的蘑菇","text":"牆角長出一叢發著藍光的蘑菇。","opts":[{"label":"吃一口","outs":[{"w":4,"text":"感覺好極了！","gain":{"hp":15,"morale":5}},{"w":6,"text":"你看見了好多顏色。","gain":{"hp":-5,"morale":6}}]},{"label":"拿去種","outs":[{"text":"菜園多了一點特別的東西。","gain":{"food":3}}]}]}
],
"visitors": [
  {"id":"v_dog","emoji":"🐕","title":"流浪狗","text":"一隻瘦瘦的狗在門口搖尾巴。","opts":[{"label":"餵牠","cost":{"food":2},"outs":[{"w":7,"text":"牠決定留下來了！","gain":{"companion":"dog"}},{"w":3,"text":"吃完就跑了，但回頭看了你一眼。","gain":{"morale":4}}]},{"label":"摸摸頭","outs":[{"text":"牠很開心。","gain":{"morale":2}}]}]},
  {"id":"v_doctor","emoji":"🧑‍⚕️","title":"受傷的醫生","text":"一個背著藥箱的人倒在門口。","opts":[{"label":"幫他包紮","cost":{"food":2,"water":2},"outs":[{"w":6,"text":"他說要留下來報答你。","gain":{"companion":"doctor"}},{"w":4,"text":"他留下一些藥就走了。","gain":{"hp":10}}]},{"label":"給他水","cost":{"water":1},"outs":[{"text":"他道謝後離開了。","gain":{"morale":3}}]}]},
  {"id":"v_engineer","emoji":"🧑‍🔧","title":"迷路的工程師","text":"「請問……這附近有能借住的地方嗎？」","opts":[{"label":"讓他借住","cost":{"food":3},"outs":[{"w":6,"text":"他看了看你的基地：「這裡我可以幫忙。」","gain":{"companion":"engineer"}},{"w":4,"text":"他幫你修好了一些東西才走。","gain":{"parts":10}}]},{"label":"幫他指路","outs":[{"text":"他留下一把螺絲當謝禮。","gain":{"parts":2}}]}]},
  {"id":"v_farmer","emoji":"🧑‍🌾","title":"帶著種子的農夫","text":"「我有種子，你有地嗎？」","opts":[{"label":"拿水交換","cost":{"water":3},"outs":[{"w":6,"text":"他決定在你的菜園住下。","gain":{"companion":"farmer"}},{"w":4,"text":"他分了你一袋收成。","gain":{"food":6}}]},{"label":"謝謝不用","outs":[{"text":"他笑著離開了。","gain":{}}]}]},
  {"id":"v_merchant","emoji":"🧔","title":"推著推車的老商人","text":"「年輕人，看看嘛，什麼都有。」","opts":[{"label":"買補給（10 零件）","cost":{"parts":10},"outs":[{"text":"一大袋食物和水。","gain":{"food":6,"water":6}}]},{"label":"買情報（5 食物）","cost":{"food":5},"outs":[{"w":5,"text":"情報很準，你找到一個補給點。","gain":{"scav":4}},{"w":3,"text":"他塞給你一個奇怪的東西。","gain":{"relic":"x"}},{"w":2,"text":"「我老了，跟著你吧。」","gain":{"companion":"merchant"}}]},{"label":"賣東西（5 食物 5 水）","cost":{"food":5,"water":5},"outs":[{"text":"換到一袋金幣。","gain":{"gold":40}}]}]},
  {"id":"v_kid","emoji":"🧒","title":"迷路的小孩","text":"一個小孩抱著書包，站在路中間哭。","opts":[{"label":"送他回家","cost":{"food":2},"outs":[{"text":"他的家人一直跟你道謝，還送你一些東西。","gain":{"morale":12,"stardust":10}}]},{"label":"給他糖果","outs":[{"text":"他不哭了。","gain":{"morale":5}}]}]},
  {"id":"v_robot","emoji":"🤖","title":"故障的機器人","text":"「系統……錯誤……請……修……理……」","opts":[{"label":"修理它","cost":{"parts":8},"outs":[{"w":7,"text":"「重新啟動完成。主人，請下指令。」","gain":{"companion":"robot"}},{"w":3,"text":"它把自己拆給你當零件了。","gain":{"parts":12}}]},{"label":"關掉它","outs":[{"text":"拆下幾個能用的零件。","gain":{"parts":4}}]}]},
  {"id":"v_owl","emoji":"🦉","title":"窗邊的貓頭鷹","text":"一雙圓圓的眼睛在窗外看著你。","opts":[{"label":"留一扇窗","cost":{"food":1},"outs":[{"w":6,"text":"牠飛進來，停在書架上不走了。","gain":{"companion":"owl"}},{"w":4,"text":"牠吃完就飛走了，留下一根羽毛。","gain":{"morale":5}}]},{"label":"關上窗","outs":[{"text":"牠歪了歪頭，飛走了。","gain":{}}]}]},
  {"id":"v_raider","emoji":"🏴‍☠️","title":"掠奪者","text":"三個人拿著鐵棍站在門外。","opts":[{"label":"交出物資","cost":{"food":4,"water":4},"outs":[{"text":"他們拿了東西就走了。","gain":{}}]},{"label":"對峙","outs":[{"w":5,"text":"他們退走了，還丟下一些東西。","gain":{"parts":8,"morale":5}},{"w":5,"text":"打了一架，基地受損。","gain":{"hp":-15,"food":-3}}]},{"label":"躲起來","outs":[{"w":7,"text":"他們沒發現你。","gain":{}},{"w":3,"text":"他們翻走了一些糧食。","gain":{"food":-6}}]}]},
  {"id":"v_cat","emoji":"🐈","title":"橘貓","text":"一隻胖胖的橘貓跳上你的窗台。","opts":[{"label":"摸摸牠","outs":[{"w":6,"text":"牠躺下來，露出肚子。看來牠住下了。","gain":{"companion":"cat"}},{"w":4,"text":"牠呼嚕呼嚕地走了。","gain":{"morale":6}}]},{"label":"讓牠走","outs":[{"text":"牠回頭喵了一聲。","gain":{}}]}]}
],
"chapters": [
  {"n":1,"title":"安頓","intro":"醒來的第一週。先讓這裡像個家。","dilemma":{"text":"隔壁的鄰居敲門，想借一些糧食。","opts":[{"label":"借他","text":"他很感激，答應有消息會告訴你。","gain":{"food":-4,"morale":10,"scav":2}},{"label":"不開門","text":"你守住了糧食，但心裡有點不舒服。","gain":{"food":3,"morale":-5}}]}},
  {"n":2,"title":"探索","intro":"附近的街區，還有東西可以撿。","dilemma":{"text":"你發現一棟倒塌一半的超市。","opts":[{"label":"進去搜刮","text":"滿載而歸，但被掉下來的招牌砸到。","gain":{"parts":15,"food":6,"hp":-8}},{"label":"繞路走","text":"安全第一，路上撿到幾張券。","gain":{"scav":3}}]}},
  {"n":3,"title":"建設","intro":"該讓基地更堅固了。","dilemma":{"text":"材料只夠修一樣：圍牆，還是水塔？","opts":[{"label":"修圍牆","text":"圍牆加高了。","gain":{"facility":"wall"}},{"label":"修水塔","text":"淨水器升級了。","gain":{"facility":"purifier"}}]}},
  {"n":4,"title":"危機","intro":"停電、缺水，壞消息一個接一個。","dilemma":{"text":"倉庫裡的水只剩一半。","opts":[{"label":"實施配給","text":"大家都渴，但撐得住。","gain":{"water":6,"morale":-6}},{"label":"冒險去河邊","text":"帶回很多水，但路上很危險。","gain":{"water":15,"hp":-10}}]}},
  {"n":5,"title":"訊號","intro":"收音機裡，第一次聽到其他倖存者的聲音。","dilemma":{"text":"要回應他們嗎？","opts":[{"label":"回應","text":"有人循著訊號找來了。","gain":{"companion":"random","morale":5}},{"label":"保持安靜","text":"你默默記下了他們的頻率。","gain":{"parts":12,"scav":3}}]}},
  {"n":6,"title":"寒潮","intro":"氣溫一夜之間降到零下。","dilemma":{"text":"柴火不夠了。","opts":[{"label":"拆家具來燒","text":"暖和了，但家裡空了一些。","gain":{"hp":10,"parts":-10,"morale":5}},{"label":"大家擠在一起睡","text":"很冷，但很溫暖。","gain":{"morale":12,"hp":-5}}]}},
  {"n":7,"title":"遷徙","intro":"一群人經過，邀你一起往南走。","dilemma":{"text":"要跟他們走，還是留下來？","opts":[{"label":"留下來守家","text":"你決定把這裡變得更好。","gain":{"facility":"random","morale":5}},{"label":"跟他們交換物資","text":"臨走前，他們留下很多東西。","gain":{"scav":6,"food":-5}}]}},
  {"n":8,"title":"序光","intro":"遠方的地平線上，第一次出現了光。","dilemma":{"text":"那道光，是什麼？","opts":[{"label":"朝光走去","text":"你在光的盡頭找到一樣東西。","gain":{"relic":"s"}},{"label":"點燃信號回應","text":"光閃了三下，像是在回答你。","gain":{"stardust":150,"morale":15}}]}}
]
}$j$::jsonb
$catalog$;
grant execute on function public.doom_catalog() to authenticated;


-- ---------- 小工具 ----------

-- 依照 w（權重，預設 1）隨機選一個
create or replace function public.doom_wpick(arr jsonb)
returns jsonb language plpgsql volatile
as $function$
declare tot numeric; x numeric; e jsonb;
begin
  select coalesce(sum(coalesce((el->>'w')::numeric, 1)), 0) into tot from jsonb_array_elements(arr) el;
  if tot <= 0 then return null; end if;
  x := random() * tot;
  for e in select el from jsonb_array_elements(arr) el loop
    x := x - coalesce((e->>'w')::numeric, 1);
    if x < 0 then return e; end if;
  end loop;
  return arr -> -1;
end;
$function$;

create or replace function public.doom_find(p_list text, p_id text)
returns jsonb language sql stable
as $function$
  select el from jsonb_array_elements(public.doom_catalog() -> p_list) el where el->>'id' = p_id limit 1;
$function$;

-- 某一天的真實行為
create or replace function public.doom_activity(u uuid, d date, out tasks integer, out steps integer, out focus_s integer)
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  select count(*) into tasks from public.tasks
    where user_id = u and completed and completed_at is not null
      and (completed_at at time zone 'Asia/Taipei' - interval '2 hours')::date = d;
  select (select count(*) from public.project_step_logs where user_id = u and day = d and done)
       + (select count(*) from public.project_steps s join public.projects p on p.id = s.project_id
            where s.user_id = u and p.kind <> 'daily' and s.done and s.done_at is not null
              and (s.done_at at time zone 'Asia/Taipei' - interval '2 hours')::date = d)
    into steps;
  select coalesce(sum(duration_seconds), 0) into focus_s from public.focus_sessions
    where user_id = u and session_date = d;
end;
$function$;

create or replace function public.doom_log_add(u uuid, p_kind text, p_tier text, p_body text)
returns void language sql security definer set search_path to 'public'
as $function$
  insert into public.doom_log (user_id, day, kind, tier, body) values (u, public.app_today(), p_kind, p_tier, p_body);
$function$;

-- 套用獲得 / 失去：回傳實際變動的清單
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
      update public.profiles set gold = gold + n where id = u;
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
    end if;
  end loop;

  update public.doom_state set food = st.food, water = st.water, parts = st.parts, scav = st.scav,
    hp = st.hp, morale = st.morale, companions = st.companions, relics = st.relics, facilities = st.facilities
    where user_id = u;
  return out;
end;
$function$;

-- 幸運值
create or replace function public.doom_luck(u uuid)
returns integer language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  st public.doom_state%rowtype;
  dd public.doom_days%rowtype;
  l integer := 0;
begin
  select * into st from public.doom_state where user_id = u;
  select * into dd from public.doom_days where user_id = u and day = public.app_today();
  l := 2 * coalesce((st.facilities->>'radio')::integer, 0);
  if st.companions ? 'owl' then l := l + 3; end if;
  l := l + (st.morale - 50) / 10;
  l := l + least(10, coalesce(dd.tasks_n, 0) + coalesce(dd.steps_n, 0) / 2);
  if dd.broadcast is not null and public.doom_find('broadcasts', dd.broadcast)->>'buff' = 'luck' then l := l + 5; end if;
  if st.hp <= 0 then l := l - 5; end if;
  return greatest(0, l);
end;
$function$;


-- ---------- 建立存檔：開局行李 ----------
create or replace function public.doom_ensure(u uuid)
returns boolean language plpgsql security definer set search_path to 'public'
as $function$
declare today date := public.app_today();
begin
  if exists (select 1 from public.doom_state where user_id = u) then return false; end if;
  insert into public.doom_state (user_id, started_on, last_settle, food, water, parts, scav, hp, morale)
    values (u, today, today, 12, 12, 25, 5, 80, 60);
  -- 今天之前做的事不算，從今天開始累積
  perform public.doom_log_add(u, 'story', null, '末世的第一天。你背著一包行李，走進這間小屋。');
  return true;
end;
$function$;


-- ---------- 跨日結算：每天吃 1 食物 1 水，設施和同伴生產 ----------
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
    prod_food  := coalesce((st.facilities->>'garden')::integer, 0) + case when st.companions ? 'farmer' then 1 else 0 end;
    prod_water := coalesce((st.facilities->>'purifier')::integer, 0);
    prod_parts := coalesce((st.facilities->>'bench')::integer, 0);
    prod_scav  := case when st.companions ? 'robot' then 1 else 0 end;
    heal  := 2 * coalesce((st.facilities->>'bed')::integer, 0) + case when st.companions ? 'doctor' then 3 else 0 end;
    cheer := case when st.companions ? 'cat' then 3 else 0 end;
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


-- ---------- 今天的廣播、事件、訪客 ----------
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
begin
  insert into public.doom_days (user_id, day) values (u, d) on conflict do nothing;
  if not p_picks then return; end if;
  select * into dd from public.doom_days where user_id = u and day = d for update;
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

  -- 下雨天：直接 +3 水
  if b->>'buff' = 'rain' then
    perform public.doom_apply(u, '{"water":3}'::jsonb, 'doom-rain:' || d);
  end if;
end;
$function$;


-- ---------- 收成果：任務、專案、專注 → 物資 ----------
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
  food integer := 0; water integer := 0; parts integer := 0; scav integer := 0;
  n_tasks integer := 0; n_steps integer := 0; n_focus integer := 0;
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

    if a.focus_s > dd.focus_s then
      parts := parts + 2 * (a.focus_s / 1800 - dd.focus_s / 1800);
      scav := scav + least(12, a.focus_s / 3600) - least(12, dd.focus_s / 3600);
      n_focus := n_focus + (a.focus_s - dd.focus_s) / 60;
    end if;

    update public.doom_days set tasks_n = greatest(tasks_n, t_new), steps_n = greatest(steps_n, s_new),
      focus_s = greatest(focus_s, a.focus_s)
      where user_id = u and day = d;
    d := d + 1;
  end loop;

  if food + water + parts + scav = 0 then return null; end if;
  applied := public.doom_apply(u, jsonb_strip_nulls(jsonb_build_object(
    'food', nullif(food, 0), 'water', nullif(water, 0), 'parts', nullif(parts, 0), 'scav', nullif(scav, 0))),
    'doom-harvest:' || gen_random_uuid());
  return jsonb_build_object('tasks', n_tasks, 'steps', n_steps, 'focus_min', n_focus, 'gains', applied);
end;
$function$;


-- ---------- 每週章節 ----------
create or replace function public.doom_week(u uuid, p_week integer default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  today date := public.app_today();
  st public.doom_state%rowtype;
  w integer;
  ws date; we date;
  d date;
  a record;
  acts integer := 0; fmin integer := 0;
  ch jsonb;
  wk public.doom_weeks%rowtype;
  g_act integer; g_focus integer;
  n_draws integer; n_rare integer;
begin
  select * into st from public.doom_state where user_id = u;
  w := coalesce(p_week, (today - st.started_on) / 7 + 1);
  ws := st.started_on + 7 * (w - 1);
  we := ws + 6;
  d := ws;
  while d <= least(we, today) loop
    select * into a from public.doom_activity(u, d);
    acts := acts + a.tasks + a.steps;
    fmin := fmin + a.focus_s / 60;
    d := d + 1;
  end loop;

  ch := public.doom_catalog()->'chapters'->(case when w <= 8 then w - 1 else 1 + (w - 9) % 7 end);
  g_act := least(60, 30 + 5 * (w - 1));
  g_focus := least(1200, 600 + 60 * (w - 1));

  insert into public.doom_weeks (user_id, week_no) values (u, w) on conflict do nothing;
  select * into wk from public.doom_weeks where user_id = u and week_no = w;
  select coalesce(sum(draws), 0) into n_draws from public.doom_days where user_id = u and day between ws and we;
  select count(*) into n_rare from public.doom_log where user_id = u and kind = 'draw' and day between ws and we;

  return jsonb_build_object('week', w, 'start', ws, 'end', we, 'chapter', ch,
    'title', case when w <= 8 then '第 ' || w || ' 章：' || (ch->>'title') else '第 ' || w || ' 章：' || (ch->>'title') || '・再臨' end,
    'actions', acts, 'focus_min', fmin, 'goal_actions', g_act, 'goal_focus', g_focus,
    'met', acts >= g_act and fmin >= g_focus, 'double', acts >= 2 * g_act and fmin >= 2 * g_focus,
    'claimed', wk.claimed, 'choice', wk.choice, 'report_seen', wk.report_seen,
    'draws', n_draws, 'rare', n_rare);
end;
$function$;


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
  st public.doom_state%rowtype;
  dd public.doom_days%rowtype;
  wk jsonb;
  v_last jsonb := null;
  logs jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  fresh := public.doom_ensure(u);
  settle := public.doom_settle(u);
  perform public.doom_day(u, today, true);
  harvest := public.doom_harvest(u);

  select * into st from public.doom_state where user_id = u;
  select * into dd from public.doom_days where user_id = u and day = today;
  wk := public.doom_week(u);
  if (wk->>'week')::integer > 1 then
    v_last := public.doom_week(u, (wk->>'week')::integer - 1);
    if (v_last->>'report_seen')::boolean then v_last := null; end if;
  end if;
  select coalesce(jsonb_agg(x order by x.id desc), '[]'::jsonb) into logs from (
    select id, day, kind, tier, body from public.doom_log where user_id = u order by id desc limit 20) x;

  return json_build_object(
    'fresh', fresh, 'settle', settle, 'harvest', harvest,
    'state', to_jsonb(st) - 'user_id',
    'today', to_jsonb(dd) - 'user_id',
    'luck', public.doom_luck(u),
    'week', wk, 'lastWeek', v_last, 'logs', logs, 'date', today);
end;
$function$;
grant execute on function public.doom_status() to authenticated;


-- ---------- 🧺 每日撿物資 ----------
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

  c := 3 + case when st.companions ? 'dog' then 2 else 0 end;
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


-- ---------- 📜 處理今日事件 / 訪客 ----------
create or replace function public.doom_resolve(p_slot text, p_opt integer)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  today date := public.app_today();
  st public.doom_state%rowtype;
  dd public.doom_days%rowtype;
  e jsonb; opt jsonb; o jsonb;
  cost jsonb;
  r record;
  have integer;
  paid jsonb := '[]'::jsonb;
  applied jsonb;
  res jsonb;
  neg jsonb := '{}'::jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  if p_slot not in ('event', 'visitor') then raise exception '不認得的事件'; end if;
  perform public.doom_day(u, today, true);
  select * into dd from public.doom_days where user_id = u and day = today for update;
  if p_slot = 'event' then
    if dd.event_done is not null then raise exception '今天的事件已經處理過了'; end if;
    e := public.doom_find('events', dd.event_id);
  else
    if dd.visitor_done is not null then raise exception '今天的訪客已經離開了'; end if;
    e := public.doom_find('visitors', dd.visitor_id);
  end if;
  opt := e->'opts'->p_opt;
  if opt is null then raise exception '沒有這個選項'; end if;

  cost := coalesce(opt->'cost', '{}'::jsonb);
  select * into st from public.doom_state where user_id = u;
  for r in select key, value from jsonb_each(cost) loop
    have := case r.key when 'food' then st.food when 'water' then st.water when 'parts' then st.parts when 'scav' then st.scav else 0 end;
    if have < (r.value #>> '{}')::integer then
      raise exception '材料不夠：需要 % %', (r.value #>> '{}'), (public.doom_catalog()->'res'->r.key->>'name');
    end if;
    neg := neg || jsonb_build_object(r.key, -(r.value #>> '{}')::integer);
  end loop;
  if neg <> '{}'::jsonb then paid := public.doom_apply(u, neg, 'doom-cost'); end if;

  o := public.doom_wpick(opt->'outs');
  applied := public.doom_apply(u, o->'gain', 'doom-' || p_slot || ':' || gen_random_uuid());
  res := jsonb_build_object('opt', p_opt, 'label', opt->>'label', 'text', o->>'text', 'gains', applied, 'paid', paid);

  if p_slot = 'event' then update public.doom_days set event_done = res where user_id = u and day = today;
  else update public.doom_days set visitor_done = res where user_id = u and day = today;
  end if;
  perform public.doom_log_add(u, p_slot, null, (e->>'title') || '：' || (o->>'text'));
  return res::json;
end;
$function$;
grant execute on function public.doom_resolve(text, integer) to authenticated;


-- ---------- 🎟️ 搜刮 ----------
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
  x double precision;
  tier text;
  v_pity integer;
  e jsonb;
  applied jsonb;
  results jsonb := '[]'::jsonb;
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
    x := random() * 10000;
    if v_pity >= 9 then
      x := random() * 1200;
      tier := case when x < 50 then 's' when x < 300 then 'x' else 'l' end;
    else
      tier := case
        when x < 50 + 2 * lk then 's'
        when x < 300 + 10 * lk then 'x'
        when x < 1200 + 30 * lk then 'l'
        when x < 4000 + 60 * lk then 'r'
        else 'c' end;
    end if;
    v_pity := case when tier in ('l', 'x', 's') then 0 else v_pity + 1 end;

    select el into e from jsonb_array_elements(public.doom_catalog()->'loot') el
      where el->>'tier' = tier order by random() limit 1;
    applied := public.doom_apply(u, e->'gain', 'doom-draw:' || gen_random_uuid());
    results := results || jsonb_build_object('id', e->>'id', 'tier', tier, 'gains', applied);
    if tier in ('l', 'x', 's') then
      perform public.doom_log_add(u, 'draw', tier, '搜刮到' || (e->>'name') || '！');
    end if;
  end loop;

  update public.doom_state set pity = v_pity where user_id = u;
  update public.doom_days set draws = draws + n where user_id = u and day = today;
  return json_build_object('results', results, 'luck', lk, 'pity', v_pity);
end;
$function$;
grant execute on function public.doom_draw(integer) to authenticated;


-- ---------- 🏗️ 升級設施 ----------
create or replace function public.doom_build_cost(u uuid, p_fac text)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare st public.doom_state%rowtype; lv integer; parts integer;
begin
  select * into st from public.doom_state where user_id = u;
  lv := coalesce((st.facilities->>p_fac)::integer, 0);
  parts := 20 + 20 * lv;
  if st.companions ? 'engineer' then parts := round(parts * 0.85)::integer; end if;
  return jsonb_build_object('parts', parts, 'food', 2 * lv, 'lv', lv);
end;
$function$;

create or replace function public.doom_build(p_fac text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  st public.doom_state%rowtype;
  c jsonb;
  f jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  f := public.doom_find('facilities', p_fac);
  if f is null then raise exception '沒有這個設施'; end if;
  select * into st from public.doom_state where user_id = u for update;
  c := public.doom_build_cost(u, p_fac);
  if (c->>'lv')::integer >= 10 then raise exception '已經滿級了'; end if;
  if st.parts < (c->>'parts')::integer then raise exception '零件不夠：需要 %', c->>'parts'; end if;
  if st.food < (c->>'food')::integer then raise exception '食物不夠：需要 %', c->>'food'; end if;
  update public.doom_state set parts = parts - (c->>'parts')::integer, food = food - (c->>'food')::integer,
    facilities = facilities || jsonb_build_object(p_fac, (c->>'lv')::integer + 1)
    where user_id = u;
  perform public.doom_log_add(u, 'build', null, (f->>'name') || '升到 ' || ((c->>'lv')::integer + 1) || ' 級。');
  return json_build_object('fac', p_fac, 'lv', (c->>'lv')::integer + 1);
end;
$function$;
grant execute on function public.doom_build(text) to authenticated;


-- ---------- 🔧 修理基地：15 零件 → 耐久 +25 ----------
create or replace function public.doom_repair()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); st public.doom_state%rowtype; applied jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  if st.hp >= 100 then raise exception '基地好好的，不用修'; end if;
  if st.parts < 15 then raise exception '零件不夠：需要 15'; end if;
  applied := public.doom_apply(u, '{"parts":-15,"hp":25}'::jsonb, 'doom-repair');
  return json_build_object('gains', applied);
end;
$function$;
grant execute on function public.doom_repair() to authenticated;


-- ---------- 🔁 食物＋水 → 搜刮券（一天 5 次） ----------
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
  k := case when st.companions ? 'merchant' then 6 else 8 end;
  if st.food < k or st.water < k then raise exception '需要 % 食物和 % 水', k, k; end if;
  applied := public.doom_apply(u, jsonb_build_object('food', -k, 'water', -k, 'scav', 1), 'doom-trade');
  update public.doom_days set traded = traded + 1 where user_id = u and day = today;
  return json_build_object('gains', applied, 'left', 4 - dd.traded);
end;
$function$;
grant execute on function public.doom_trade() to authenticated;


-- ---------- 🎁 本週章節寶箱 ----------
create or replace function public.doom_week_claim()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  wk jsonb;
  w integer;
  g jsonb;
  applied jsonb;
  lvl integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  wk := public.doom_week(u);
  w := (wk->>'week')::integer;
  lvl := (wk->>'claimed')::integer;
  if lvl = 0 and (wk->>'met')::boolean then
    g := jsonb_build_object('food', 10, 'water', 10, 'parts', 40, 'scav', 10, 'stardust', 60, 'wish_normal', 1);
  elsif lvl = 1 and (wk->>'double')::boolean then
    g := jsonb_build_object('scav', 10, 'parts', 30, 'stardust', 80, 'ticket_normal', 1, 'relic', 'x');
  elsif lvl >= 2 then raise exception '這週的寶箱都領完了';
  else raise exception '本週目標還沒達成';
  end if;
  update public.doom_weeks set claimed = lvl + 1 where user_id = u and week_no = w;
  applied := public.doom_apply(u, g, 'doom-week:' || w || ':' || (lvl + 1));
  perform public.doom_log_add(u, 'week', null, case when lvl = 0 then '打開了本章寶箱。' else '超額完成！打開了第二個寶箱。' end);
  return json_build_object('gains', applied, 'claimed', lvl + 1);
end;
$function$;
grant execute on function public.doom_week_claim() to authenticated;


-- ---------- ⚖️ 本章抉擇 ----------
create or replace function public.doom_dilemma(p_opt integer)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  wk jsonb;
  opt jsonb;
  applied jsonb;
  res jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  wk := public.doom_week(u);
  if wk->'choice' is not null and wk->'choice' <> 'null'::jsonb then raise exception '這一章已經做過選擇了'; end if;
  opt := wk->'chapter'->'dilemma'->'opts'->p_opt;
  if opt is null then raise exception '沒有這個選項'; end if;
  applied := public.doom_apply(u, opt->'gain', 'doom-dilemma:' || (wk->>'week'));
  res := jsonb_build_object('opt', p_opt, 'label', opt->>'label', 'text', opt->>'text', 'gains', applied);
  update public.doom_weeks set choice = res where user_id = u and week_no = (wk->>'week')::integer;
  perform public.doom_log_add(u, 'choice', null, (wk->>'title') || '：' || (opt->>'label') || '。' || (opt->>'text'));
  return res::json;
end;
$function$;
grant execute on function public.doom_dilemma(integer) to authenticated;


-- ---------- 📰 週報看過了 ----------
create or replace function public.doom_report_seen()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); st public.doom_state%rowtype; w integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u;
  w := (public.app_today() - st.started_on) / 7;
  update public.doom_weeks set report_seen = true where user_id = u and week_no = w;
  return json_build_object('ok', true);
end;
$function$;
grant execute on function public.doom_report_seen() to authenticated;


-- 內部用的函式不開放給前端
revoke all on function public.doom_apply(uuid, jsonb, text) from public, authenticated, anon;
revoke all on function public.doom_activity(uuid, date) from public, authenticated, anon;
revoke all on function public.doom_log_add(uuid, text, text, text) from public, authenticated, anon;
revoke all on function public.doom_luck(uuid) from public, authenticated, anon;
revoke all on function public.doom_ensure(uuid) from public, authenticated, anon;
revoke all on function public.doom_settle(uuid) from public, authenticated, anon;
revoke all on function public.doom_day(uuid, date, boolean) from public, authenticated, anon;
revoke all on function public.doom_harvest(uuid) from public, authenticated, anon;
revoke all on function public.doom_week(uuid, integer) from public, authenticated, anon;
revoke all on function public.doom_build_cost(uuid, text) from public, authenticated, anon;
