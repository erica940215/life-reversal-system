-- =========================================================
-- 序光計畫：☢️ 末世：🌟 每月限定、🏅 美食成就、🧑‍🍳 居民廚師、🍂 季節作物、🌈 夢幻料理
-- 要在「2026-10-30_末世_料理可搜刮.sql」之後執行（末世的檔全部跑過）。可以重複執行。
--
--   🌟 每月限定：每個月一位限定夥伴＋3 種限定美食
--       這個月專注滿 10 小時就能把限定夥伴帶回家；限定美食這個月搜刮時比較容易撿到
--       過了那個月就進「復刻」：花 5 張搜刮券抽一次，還沒有的優先
--   🏅 美食成就：每一類集齊、吃過 20／50／100／150／200 種、傳說美食家…有精核、搜刮券，部分幸運永久 +1
--   🧑‍🍳 居民廚師：挑最多 3 道最愛料理，爐子空了就自動做（打開末世、忙碌模式跑的時候）
--   🍂 季節作物：當季作物種得快 20%、收成 +1；每季兩道季節料理只有那一季做得出來
--   🌈 夢幻料理：用傳說料理合成，享用之後一整天幸運、收成、精核加倍
--   這個檔會覆蓋 doom_food_cat、doom_farm_cat、doom_pantry_roll、doom_luck、doom_zombies、
--   doom_farm_plant、doom_farm_harvest、doom_farm_cook、doom_buddy_daily、doom_status；
--   之後如果重跑前面的末世檔，最後要再跑一次這個檔
-- =========================================================

alter table public.doom_state
  add column if not exists fgot jsonb not null default '{}'::jsonb,
  add column if not exists chef jsonb not null default '{}'::jsonb,
  add column if not exists dream jsonb not null default '{}'::jsonb,
  add column if not exists ltd jsonb not null default '{}'::jsonb;

create or replace function public.doom_food_cat()
returns jsonb language sql immutable
as $function$ select $json${"cats":[{"id":"staple","name":"主食","emoji":"🍚","zones":["market","night_market","subway"]},{"id":"can","name":"罐頭","emoji":"🥫","zones":["bunker","military","market"]},{"id":"instant","name":"即食","emoji":"🍜","zones":["subway","military","street"]},{"id":"bakery","name":"麵包烘焙","emoji":"🥐","zones":["market","street","library"]},{"id":"sweet","name":"零食甜點","emoji":"🍰","zones":["night_market","market","library"]},{"id":"fruit","name":"水果","emoji":"🍎","zones":["rooftop","market","waterworks"]},{"id":"meat","name":"熟食肉類","emoji":"🍗","zones":["night_market","military","hardware"]},{"id":"drink","name":"飲料","emoji":"🥤","zones":["market","waterworks","street"]},{"id":"hot","name":"熱飲","emoji":"☕","zones":["library","hospital","observatory"]},{"id":"rare","name":"珍品","emoji":"🌟","zones":["observatory","bunker","rooftop"]},{"id":"med","name":"藥品","emoji":"💊","zones":["hospital","bunker","military"]},{"id":"home","name":"家常菜","emoji":"🏠","zones":[]},{"id":"skill","name":"拿手菜","emoji":"👨‍🍳","zones":[]},{"id":"sig","name":"招牌菜","emoji":"⭐","zones":[]},{"id":"legend","name":"傳說料理","emoji":"👑","zones":[]},{"id":"fishd","name":"魚料理","emoji":"🐟","zones":[]},{"id":"season","name":"季節料理","emoji":"🍂","zones":[]},{"id":"ltd","name":"每月限定","emoji":"🌟","zones":[]},{"id":"dream","name":"夢幻料理","emoji":"🌈","zones":[]}],"items":[{"c":"staple","k":"food","t":"c","id":"onigiri","name":"鮭魚飯糰","text":"包裝有點皺，裡面還是很香。","emoji":"🍙"},{"c":"staple","k":"food","t":"c","id":"friedrice","name":"蛋炒飯","text":"粒粒分明，吃得到鍋氣。","emoji":"🍳"},{"c":"staple","k":"food","t":"c","id":"potsticker","name":"煎餃","text":"底部煎得酥脆。","emoji":"🥟"},{"c":"staple","k":"food","t":"r","id":"lurou","name":"滷肉飯","text":"台灣的味道，吃了會想家。","emoji":"🍚"},{"c":"staple","k":"food","t":"r","id":"curry","name":"咖哩飯","text":"辣得剛剛好。","emoji":"🍛"},{"c":"staple","k":"food","t":"r","id":"beefnoodle","name":"牛肉麵","text":"湯頭熬了很久。","emoji":"🍜"},{"c":"staple","k":"food","t":"l","id":"ramen","name":"豚骨拉麵","text":"濃郁到喝完整碗湯。","emoji":"🍥"},{"c":"staple","k":"food","t":"x","id":"sushi","name":"綜合壽司","text":"末世裡還能吃到生魚片？","emoji":"🍣"},{"c":"can","k":"food","t":"c","id":"corned","name":"鹹牛肉罐","text":"鹹，但很下飯。","emoji":"🥫"},{"c":"can","k":"food","t":"c","id":"sardine","name":"沙丁魚罐","text":"整整齊齊排好的小魚。","emoji":"🐟"},{"c":"can","k":"food","t":"c","id":"beans","name":"茄汁焗豆","text":"甜甜鹹鹹。","emoji":"🫘"},{"c":"can","k":"food","t":"c","id":"cornsoup","name":"玉米濃湯罐","text":"加熱一下就暖起來。","emoji":"🌽"},{"c":"can","k":"food","t":"r","id":"currycan","name":"咖哩雞罐","text":"配什麼都好吃。","emoji":"🍲"},{"c":"can","k":"food","t":"l","id":"crabcan","name":"蟹肉罐","text":"高級罐頭，捨不得吃。","emoji":"🦀"},{"c":"instant","k":"food","t":"c","id":"cupnoodle","name":"杯麵","text":"三分鐘的幸福。","emoji":"🍜"},{"c":"instant","k":"food","t":"c","id":"spicynoodle","name":"辣味泡麵","text":"辣到流汗，但停不下來。","emoji":"🌶️"},{"c":"instant","k":"food","t":"c","id":"porridge","name":"即食粥","text":"生病的時候最需要它。","emoji":"🥣"},{"c":"instant","k":"food","t":"r","id":"hotpot","name":"自熱火鍋","text":"倒水就會自己冒煙。","emoji":"🫕"},{"c":"instant","k":"food","t":"r","id":"mre","name":"軍用即食餐","text":"熱量很高，夠撐一整天。","emoji":"🎖️"},{"c":"instant","k":"food","t":"l","id":"hotbento","name":"自熱便當","text":"有飯有菜有肉。","emoji":"🍱"},{"c":"bakery","k":"food","t":"c","id":"toast","name":"厚片吐司","text":"塗上奶油剛剛好。","emoji":"🍞"},{"c":"bakery","k":"food","t":"c","id":"bagel","name":"貝果","text":"很有嚼勁。","emoji":"🥯"},{"c":"bakery","k":"food","t":"r","id":"croissant","name":"可頌","text":"一層一層酥到掉屑。","emoji":"🥐"},{"c":"bakery","k":"food","t":"r","id":"donut","name":"甜甜圈","text":"糖霜還是粉紅色的。","emoji":"🍩"},{"c":"bakery","k":"food","t":"l","id":"pizza","name":"披薩","text":"起司拉得好長。","emoji":"🍕"},{"c":"bakery","k":"food","t":"x","id":"cheesecake","name":"起司蛋糕","text":"濃郁綿密。","emoji":"🍰"},{"c":"sweet","k":"food","t":"c","id":"cookie","name":"巧克力餅乾","text":"一片接一片。","emoji":"🍪"},{"c":"sweet","k":"food","t":"c","id":"popcorn","name":"爆米花","text":"少了電影院，還是好吃。","emoji":"🍿"},{"c":"sweet","k":"food","t":"c","id":"gummy","name":"小熊軟糖","text":"五顏六色的小熊。","emoji":"🐻"},{"c":"sweet","k":"food","t":"r","id":"pudding","name":"雞蛋布丁","text":"焦糖的部分最好吃。","emoji":"🍮"},{"c":"sweet","k":"food","t":"r","id":"icecream","name":"冰淇淋","text":"找到還沒融化的，運氣真好。","emoji":"🍦"},{"c":"sweet","k":"food","t":"l","id":"macaron","name":"馬卡龍","text":"小小一顆，好精緻。","emoji":"🧁"},{"c":"sweet","k":"food","t":"l","id":"honeycake","name":"蜂蜜蛋糕","text":"鬆軟又香甜。","emoji":"🍯"},{"c":"sweet","k":"food","t":"x","id":"chocobox","name":"巧克力禮盒","text":"一整盒，每顆口味都不一樣。","emoji":"🎁"},{"c":"fruit","k":"food","t":"c","id":"apple","name":"蘋果","text":"一天一蘋果。","emoji":"🍎"},{"c":"fruit","k":"food","t":"c","id":"banana","name":"香蕉","text":"補充體力最快。","emoji":"🍌"},{"c":"fruit","k":"food","t":"c","id":"orange","name":"橘子","text":"剝開滿手香。","emoji":"🍊"},{"c":"fruit","k":"food","t":"r","id":"strawberry","name":"草莓","text":"酸酸甜甜。","emoji":"🍓"},{"c":"fruit","k":"food","t":"r","id":"mango","name":"芒果","text":"夏天的味道。","emoji":"🥭"},{"c":"fruit","k":"food","t":"r","id":"watermelon","name":"西瓜","text":"一大顆，大家一起分。","emoji":"🍉"},{"c":"fruit","k":"food","t":"l","id":"grapes","name":"巨峰葡萄","text":"一串都是大顆的。","emoji":"🍇"},{"c":"fruit","k":"food","t":"s","id":"goldpeach","name":"金色仙桃","text":"傳說吃了會帶來好運。","emoji":"🍑"},{"c":"meat","k":"food","t":"c","id":"sausage","name":"烤香腸","text":"夜市的靈魂。","emoji":"🌭"},{"c":"meat","k":"food","t":"r","id":"friedchicken","name":"炸雞","text":"外酥內嫩。","emoji":"🍗"},{"c":"meat","k":"food","t":"r","id":"skewer","name":"烤肉串","text":"刷上醬汁再烤一下。","emoji":"🍢"},{"c":"meat","k":"food","t":"l","id":"steak","name":"牛排","text":"七分熟，剛剛好。","emoji":"🥩"},{"c":"meat","k":"food","t":"x","id":"roastduck","name":"烤鴨","text":"皮脆到會發出聲音。","emoji":"🦆"},{"c":"drink","k":"drink","t":"c","id":"mineral","name":"冰礦泉水","text":"冰涼透心。","emoji":"💧"},{"c":"drink","k":"drink","t":"c","id":"cola","name":"可樂","text":"氣泡還很足。","emoji":"🥤"},{"c":"drink","k":"drink","t":"c","id":"oj","name":"柳橙汁","text":"滿滿維他命 C。","emoji":"🧃"},{"c":"drink","k":"drink","t":"c","id":"lemontea","name":"檸檬紅茶","text":"古早味。","emoji":"🍋"},{"c":"drink","k":"drink","t":"c","id":"sportsdrink","name":"運動飲料","text":"流完汗最需要。","emoji":"⚡"},{"c":"drink","k":"drink","t":"r","id":"bubbletea","name":"珍珠奶茶","text":"珍珠 QQ 的。","emoji":"🧋"},{"c":"drink","k":"drink","t":"r","id":"coconut","name":"椰子水","text":"天然的運動飲料。","emoji":"🥥"},{"c":"drink","k":"drink","t":"l","id":"smoothie","name":"綜合果昔","text":"打得綿綿的。","emoji":"🍹"},{"c":"hot","k":"drink","t":"c","id":"coffee","name":"黑咖啡","text":"讀書的好夥伴。","emoji":"☕"},{"c":"hot","k":"drink","t":"c","id":"greentea","name":"熱綠茶","text":"清香回甘。","emoji":"🍵"},{"c":"hot","k":"drink","t":"c","id":"gingertea","name":"黑糖薑茶","text":"冷天喝最暖。","emoji":"🫚"},{"c":"hot","k":"drink","t":"r","id":"latte","name":"拿鐵","text":"奶泡上還有拉花。","emoji":"🥛"},{"c":"hot","k":"drink","t":"r","id":"cocoa","name":"熱可可","text":"上面漂著棉花糖。","emoji":"🍫"},{"c":"hot","k":"drink","t":"r","id":"honeylemon","name":"蜂蜜檸檬","text":"喉嚨痛的時候喝。","emoji":"🍯"},{"c":"rare","k":"food","t":"x","id":"grandmasoup","name":"奶奶的雞湯","text":"喝一口就想哭。","emoji":"🍲"},{"c":"rare","k":"drink","t":"x","id":"starsoda","name":"星光汽水","text":"氣泡裡有小小的星星。","emoji":"✨"},{"c":"rare","k":"drink","t":"s","id":"auroratea","name":"極光花茶","text":"顏色會一直變。","emoji":"🌌"},{"c":"rare","k":"food","t":"s","id":"feast","name":"滿漢全席","text":"末世裡最奢侈的一餐。","emoji":"🏮"},{"c":"med","k":"med","t":"c","id":"bandage","name":"彈性繃帶","text":"擦傷扭傷都用得到。","emoji":"🩹"},{"c":"med","k":"med","t":"c","id":"coldmed","name":"感冒藥","text":"發燒咳嗽的救星。","emoji":"💊"},{"c":"med","k":"med","t":"c","id":"vitamin","name":"綜合維他命","text":"每天一顆，保持健康。","emoji":"🧴"},{"c":"med","k":"med","t":"r","id":"painkiller","name":"止痛藥","text":"頭痛牙痛都有效。","emoji":"💉"},{"c":"med","k":"med","t":"r","id":"ointment","name":"燙傷藥膏","text":"清涼止痛。","emoji":"🫙"},{"c":"med","k":"med","t":"l","id":"antibiotic","name":"抗生素","text":"末世裡最珍貴的藥。","emoji":"🧪"},{"c":"med","k":"med","t":"x","id":"serum","name":"抗病毒血清","text":"據說能抵抗喪屍病毒。","emoji":"🧬"},{"c":"home","k":"food","t":"c","id":"f_scallionegg","cook":true,"name":"蔥花蛋","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_congee","cook":true,"name":"地瓜粥","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_peaegg","cook":true,"name":"豌豆炒蛋","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_tomatoegg","cook":true,"name":"番茄炒蛋","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_onionpork","cook":true,"name":"蔥爆豬肉","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_grilledcorn","cook":true,"name":"烤玉米","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_tomatobeef","cook":true,"name":"番茄牛肉湯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_steamegg","cook":true,"name":"香菇蒸蛋","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_cornsoup","cook":true,"name":"玉米濃湯","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_cabbagepork","cook":true,"name":"高麗菜炒肉","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_lemonchicken","cook":true,"name":"檸檬烤雞","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_carrotegg","cook":true,"name":"紅蘿蔔炒蛋","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"r","id":"f_cherrymilk","cook":true,"name":"櫻桃牛奶","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_pancake","cook":true,"name":"鬆餅","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_cucumbersalad","cook":true,"name":"涼拌小黃瓜","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_fishfragrant","cook":true,"name":"魚香茄子","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_bamboosoup","cook":true,"name":"竹筍排骨湯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_threecup","cook":true,"name":"三杯雞","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_pepperpork","cook":true,"name":"青椒炒肉絲","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"c","id":"f_steak","cook":true,"name":"奶油牛排","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_daikonsoup","cook":true,"name":"蘿蔔排骨湯","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_onionrings","cook":true,"name":"洋蔥圈","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"r","id":"f_honeylemon","cook":true,"name":"蜂蜜檸檬茶","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_woodearsalad","cook":true,"name":"涼拌木耳","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_sesamechicken","cook":true,"name":"麻油雞","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"r","id":"f_gingerduck","cook":true,"name":"薑母鴨","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_mintlemonade","cook":true,"name":"薄荷檸檬水","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_pumpkinsoup","cook":true,"name":"南瓜濃湯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"drink","t":"r","id":"f_roastduck","cook":true,"name":"蜜汁烤鴨","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_applepie","cook":true,"name":"蘋果派","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_orangejelly","cook":true,"name":"橘子果凍","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_strawberrycake","cook":true,"name":"草莓蛋糕","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"r","id":"f_lambpot","cook":true,"name":"羊肉爐","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"c","id":"f_bananamilk","cook":true,"name":"香蕉牛奶","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_homestyletofu","cook":true,"name":"家常豆腐","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"c","id":"f_saltysoymilk","cook":true,"name":"鹹豆漿","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_enokiroll","cook":true,"name":"金針菇肉捲","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"c","id":"f_hotpot","cook":true,"name":"星露火鍋","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_peanutsoup","cook":true,"name":"花生湯","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_cheeseomelet","cook":true,"name":"起司歐姆蛋","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_kungpao","cook":true,"name":"宮保雞丁","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_spinachegg","cook":true,"name":"菠菜炒蛋","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_goatpudding","cook":true,"name":"羊奶布丁","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"r","id":"f_melonmilk","cook":true,"name":"哈密瓜牛奶","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"c","id":"f_trufflerisotto","cook":true,"name":"松露燉飯","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"r","id":"f_peachsmoothie","cook":true,"name":"蜜桃冰沙","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_pineapplecake","cook":true,"name":"鳳梨酥","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"c","id":"f_lambchop","cook":true,"name":"迷迭香烤羊排","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"r","id":"f_watermelonmilk","cook":true,"name":"西瓜牛奶","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_okraegg","cook":true,"name":"秋葵炒蛋","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_taroball","cook":true,"name":"芋圓湯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"r","id":"f_buddhajump","cook":true,"name":"佛跳牆","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_butteroyster","cook":true,"name":"奶油杏鮑菇","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"l","id":"f_giantpudding","cook":true,"name":"巨蛋布丁","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_mangoice","cook":true,"name":"芒果冰","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_bitterchicken","cook":true,"name":"鳳梨苦瓜雞湯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_saltedbitter","cook":true,"name":"金沙苦瓜","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_butterasparagus","cook":true,"name":"奶油蘆筍","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_yamsoup","cook":true,"name":"山藥排骨湯","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_grapetart","cook":true,"name":"葡萄塔","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_potatogratin","cook":true,"name":"焗烤馬鈴薯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_lotussoup","cook":true,"name":"蓮藕排骨湯","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_lavendercookie","cook":true,"name":"薰衣草餅乾","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"l","id":"f_lycheeice","cook":true,"name":"荔枝冰沙","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"r","id":"f_tiramisu","cook":true,"name":"提拉米蘇","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"l","id":"f_dragonmilk","cook":true,"name":"火龍果牛奶","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"r","id":"f_blackforest","cook":true,"name":"黑森林蛋糕","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"l","id":"f_vanillaicecream","cook":true,"name":"香草冰淇淋","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"l","id":"f_fruitplatter","cook":true,"name":"豐收水果拼盤","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"l","id":"f_lingzhisoup","cook":true,"name":"靈芝雞湯","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"l","id":"f_coconutsago","cook":true,"name":"椰奶芋頭西米露","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"l","id":"f_tropicaltart","cook":true,"name":"熱帶水果塔","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"legend","k":"food","t":"x","id":"f_starfeast","cook":true,"name":"星露盛宴","text":"星露島的傳說料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_goldonigiri","cook":true,"name":"金穗飯糰","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_rainbowsoup","cook":true,"name":"彩虹玉米濃湯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"x","id":"f_starpudding","cook":true,"name":"星露草布丁","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"legend","k":"drink","t":"s","id":"f_moonlotustea","cook":true,"name":"月光蓮花茶","text":"星露島的傳說料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"r","id":"f_blueberrymilk","cook":true,"name":"藍莓牛奶","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_blueberrypancake","cook":true,"name":"藍莓鬆餅","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_pepperchicken","cook":true,"name":"彩椒炒雞丁","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_stuffedpepper","cook":true,"name":"彩椒鑲肉","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_radishsalad","cook":true,"name":"櫻桃蘿蔔沙拉","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_purpleballs","cook":true,"name":"紫薯球","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_gooseeggrice","cook":true,"name":"鵝蛋炒飯","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"sig","k":"drink","t":"r","id":"f_honeygoose","cook":true,"name":"蜜汁燒鵝","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_turkeyleg","cook":true,"name":"烤火雞腿","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_turkeysandwich","cook":true,"name":"火雞三明治","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_goldfriedrice","cook":true,"name":"金穗炒飯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"l","id":"f_rainbowpopcorn","cook":true,"name":"彩虹爆米花","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"l","id":"f_whitestrawberrymilk","cook":true,"name":"白草莓牛奶","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_daifuku","cook":true,"name":"白草莓大福","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"l","id":"f_blacktomatosalad","cook":true,"name":"黑番茄沙拉","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"l","id":"f_driedpersimmon","cook":true,"name":"柿餅","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"x","id":"f_amberrisotto","cook":true,"name":"琥珀南瓜燉飯","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"x","id":"f_cottoncocoa","cook":true,"name":"棉花糖可可","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"x","id":"f_goldapplejuice","cook":true,"name":"金蘋果汁","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"x","id":"f_goldomelet","cook":true,"name":"黃金蛋捲","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"s","id":"f_phoenixchicken","cook":true,"name":"鳳凰辣子雞","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"s","id":"f_peachjelly","cook":true,"name":"仙桃凍","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"s","id":"f_aurorajuice","cook":true,"name":"極光葡萄汁","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"s","id":"f_moontangyuan","cook":true,"name":"月兔湯圓","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"x","id":"f_goldtart","cook":true,"name":"黃金蛋塔","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"x","id":"f_amberpie","cook":true,"name":"琥珀南瓜派","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"legend","k":"food","t":"x","id":"f_starlayercake","cook":true,"name":"星空千層","text":"星露島的傳說料理。","emoji":"🍽️"},{"c":"legend","k":"food","t":"s","id":"f_peachfeast","cook":true,"name":"仙桃壽宴","text":"星露島的傳說料理。","emoji":"🍽️"},{"c":"legend","k":"food","t":"s","id":"f_moonricecake","cook":true,"name":"月兔年糕","text":"星露島的傳說料理。","emoji":"🍽️"},{"c":"legend","k":"drink","t":"s","id":"f_aurorasoda","cook":true,"name":"極光氣泡飲","text":"星露島的傳說料理。","emoji":"🍽️"},{"c":"legend","k":"food","t":"s","id":"f_phoenixpot","cook":true,"name":"鳳凰麻辣鍋","text":"星露島的傳說料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_grainrice","cook":true,"name":"秋收五穀飯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_gingerbreadman","cook":true,"name":"薑餅人","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_turnipcake","cook":true,"name":"蘿蔔糕","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_fagao","cook":true,"name":"發糕","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"l","id":"f_durianpuff","cook":true,"name":"榴槤酥","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"l","id":"f_mangoshake","cook":true,"name":"芒果冰沙","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"r","id":"f_waxappletea","cook":true,"name":"蓮霧青茶","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_mangosteenbowl","cook":true,"name":"山竹甜湯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"x","id":"f_dragoneyestew","cook":true,"name":"龍眼燉雞","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"legend","k":"food","t":"s","id":"f_starstarfeast","cook":true,"name":"星光燉鍋","text":"星露島的傳說料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_buffalopudding","cook":true,"name":"水牛奶布丁","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_sunflowercookie","cook":true,"name":"葵花籽餅乾","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"l","id":"f_passiontea","cook":true,"name":"百香果綠茶","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"l","id":"f_avocadomilk","cook":true,"name":"酪梨牛奶","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"l","id":"f_figtart","cook":true,"name":"無花果塔","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"l","id":"f_blacktealatte","cook":true,"name":"紅茶拿鐵","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"drink","t":"x","id":"f_starfruitjuice","cook":true,"name":"楊桃汁","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"x","id":"f_fruitsundae","cook":true,"name":"水果聖代","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"x","id":"f_roastchestnut","cook":true,"name":"糖炒栗子","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"sweet","k":"food","t":"c","id":"candy","name":"水果糖","scav":true,"text":"一顆一顆用玻璃紙包著，含很久。","emoji":"🍬"},{"c":"instant","k":"food","t":"c","id":"biscuit","name":"壓縮餅乾","scav":true,"text":"乾到要配水，但一塊就很飽。","emoji":"🍘"},{"c":"instant","k":"food","t":"c","id":"packnoodle","name":"袋裝泡麵","scav":true,"text":"乾吃捏碎撒調味粉也行。","emoji":"🍜"},{"c":"staple","k":"food","t":"c","id":"teaegg","name":"茶葉蛋","scav":true,"text":"超商電鍋裡最後幾顆，滷得很入味。","emoji":"🥚"},{"c":"drink","k":"drink","t":"c","id":"longmilk","name":"保久乳","scav":true,"text":"不用冰也放很久，小時候的味道。","emoji":"🥛"},{"c":"bakery","k":"food","t":"c","id":"pineapplebun","name":"菠蘿麵包","scav":true,"text":"酥皮掉滿地也要吃完。","emoji":"🍞"},{"c":"staple","k":"food","t":"c","id":"dumpling","name":"冷凍水餃","scav":true,"text":"冰櫃斷電前搶救出來的。","emoji":"🥟"},{"c":"staple","k":"food","t":"r","id":"mwbento","name":"微波便當","scav":true,"text":"排骨、滷蛋、三樣配菜，奢侈的一餐。","emoji":"🍱"},{"c":"meat","k":"food","t":"c","id":"bigsausage","name":"大腸包小腸","scav":true,"text":"夜市攤車上最後一份，糯米腸還溫的。","emoji":"🌭"},{"c":"sweet","k":"food","t":"r","id":"honey","name":"野生蜂蜜","scav":true,"text":"頂樓蜂箱割下來的，抹什麼都好吃。","emoji":"🍯"},{"c":"sweet","k":"food","t":"c","id":"chocobar","name":"巧克力棒","scav":true,"text":"融了又凝固，形狀怪怪的但很甜。","emoji":"🍫"},{"c":"sweet","k":"food","t":"c","id":"chips","name":"洋芋片","scav":true,"text":"袋子鼓鼓的，打開那聲最療癒。","emoji":"🥔"},{"c":"sweet","k":"food","t":"c","id":"caramel","name":"牛奶糖","scav":true,"text":"黏牙，但會讓人想起以前。","emoji":"🍮"},{"c":"bakery","k":"food","t":"c","id":"cracker","name":"蘇打餅乾","scav":true,"text":"鹹鹹脆脆，配什麼都可以。","emoji":"🍪"},{"c":"drink","k":"drink","t":"c","id":"soda","name":"汽水","scav":true,"text":"搖一搖打開會噴，記得慢慢轉。","emoji":"🥤"},{"c":"sweet","k":"food","t":"r","id":"jelly","name":"果凍","scav":true,"text":"吸的那種，一口一個顏色。","emoji":"🍮"},{"c":"sweet","k":"food","t":"r","id":"eggroll","name":"蛋捲","scav":true,"text":"鐵盒裝的，過年才拆的那種。","emoji":"🥠"},{"c":"sweet","k":"food","t":"r","id":"lollipop","name":"棒棒糖","scav":true,"text":"大大一支，舔到舌頭變色。","emoji":"🍭"},{"c":"can","k":"food","t":"c","id":"tuna","name":"鮪魚罐頭","scav":true,"text":"拌飯、夾麵包都行，萬用。","emoji":"🐟"},{"c":"can","k":"food","t":"c","id":"corncan","name":"玉米罐","scav":true,"text":"甜甜的玉米粒，直接吃也可以。","emoji":"🌽"},{"c":"can","k":"food","t":"c","id":"congee","name":"八寶粥","scav":true,"text":"附湯匙的那罐，冷吃也香。","emoji":"🥣"},{"c":"can","k":"food","t":"r","id":"peachcan","name":"水蜜桃罐頭","scav":true,"text":"糖水也要喝完，一滴都不浪費。","emoji":"🍑"},{"c":"can","k":"food","t":"r","id":"spam","name":"午餐肉","scav":true,"text":"煎得焦焦的最好吃。","emoji":"🥓"},{"c":"sweet","k":"food","t":"l","id":"candyjar","name":"彩虹糖罐","scav":true,"text":"整罐五顏六色，捨不得一次吃完。","emoji":"🌈"},{"c":"bakery","k":"food","t":"x","id":"bdaycake","name":"生日蛋糕","scav":true,"text":"奇蹟般完好的蛋糕，今天就當作誰的生日吧。","emoji":"🎂"},{"c":"can","k":"food","t":"s","id":"goldcan","name":"黃金罐頭","scav":true,"text":"傳說中的罐頭，打開會發光。","emoji":"🥫"},{"c":"fishd","k":"food","t":"c","id":"fd_scallion_minnow","cook":true,"name":"蔥燒小鯽","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"c","id":"fd_fish_fried_rice","cook":true,"name":"魚片炒飯","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"c","id":"fd_tomato_carp","cook":true,"name":"番茄魚湯","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"c","id":"fd_sweet_perch","cook":true,"name":"地瓜烤鱸魚","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"c","id":"fd_bubble_egg","cook":true,"name":"泡泡炒蛋","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"c","id":"fd_reed_bamboo","cook":true,"name":"竹筍炒鰍","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"c","id":"fd_chili_snapper","cook":true,"name":"辣椒烤鯛","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"c","id":"fd_daikon_catfish","cook":true,"name":"蘿蔔燉鯰魚","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"c","id":"fd_pumpkin_congee","cook":true,"name":"南瓜露珠粥","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"c","id":"fd_bean_catfish","cook":true,"name":"豆芽炒青椒","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"c","id":"fd_cucumber_slipper","cook":true,"name":"涼拌拖鞋魚","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"c","id":"fd_strawberry_salad","cook":true,"name":"草莓魚沙拉","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"r","id":"fd_mushroom_rain","cook":true,"name":"香菇雨滴蒸鯛","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"r","id":"fd_apple_maple","cook":true,"name":"蘋果烤紅鯉","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"r","id":"fd_onion_eel","cook":true,"name":"薑蔥鈴鰻","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"r","id":"fd_mint_guppy","cook":true,"name":"薄荷涼魚","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"r","id":"fd_coriander_goby","cook":true,"name":"香菜炸蝦虎","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"r","id":"fd_woodear_carpenter","cook":true,"name":"木耳燒木匠魚","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"r","id":"fd_cherry_trout","cook":true,"name":"櫻桃鱒魚","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"r","id":"fd_cabbage_hotpot","cook":true,"name":"高麗菜鯰魚鍋","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"r","id":"fd_lemon_chime","cook":true,"name":"檸檬風鈴鱸","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"r","id":"fd_orange_snapper","cook":true,"name":"柚香蒸鯛","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"r","id":"fd_tea_porcelain","cook":true,"name":"茶燻陶瓷鯉","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"r","id":"fd_carrot_lantern","cook":true,"name":"燈籠蘿蔔湯","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"r","id":"fd_corn_cloud","cook":true,"name":"雲朵玉米濃湯","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"l","id":"fd_melon_jelly","cook":true,"name":"燈籠水母冰","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"l","id":"fd_woodear_ink","cook":true,"name":"墨硯燉木耳","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"l","id":"fd_ginger_mackerel","cook":true,"name":"薑絲玻璃鯖","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"l","id":"fd_yam_clay","cook":true,"name":"陶鍋山藥鱷","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"l","id":"fd_soy_whale","cook":true,"name":"鐘乳豆漿鍋","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"l","id":"fd_sugar_fish","cook":true,"name":"糖霜魚排","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"l","id":"fd_rosemary_salmon","cook":true,"name":"迷迭香烤鮭","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"l","id":"fd_crystal_mango","cook":true,"name":"水晶蝦芒果沙拉","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"l","id":"fd_pumpkin_amber","cook":true,"name":"琥珀南瓜鱸","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"l","id":"fd_taro_nebula","cook":true,"name":"星雲芋頭鍋","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"l","id":"fd_lotus_bell","cook":true,"name":"蓮藕銅鈴排骨","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"l","id":"fd_okra_armor","cook":true,"name":"秋葵鎧鯊","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"x","id":"fd_clock_butter","cook":true,"name":"時鐘奶油鯉","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"x","id":"fd_grape_aurora","cook":true,"name":"極光葡萄鰩","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"x","id":"fd_banana_mirror","cook":true,"name":"鏡面香蕉酥","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"x","id":"fd_coconut_turtle","cook":true,"name":"星海椰子湯","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"x","id":"fd_ginger_frost","cook":true,"name":"霜紋龍鯉鍋","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"x","id":"fd_vanilla_backlight","cook":true,"name":"香草逆光鯨","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"x","id":"fd_dragonfruit_wing","cook":true,"name":"火龍果烤鯖","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"s","id":"fd_moonlotus_rice","cook":true,"name":"序光蓮飯","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"s","id":"fd_lingzhi_broth","cook":true,"name":"龍骨高湯","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"s","id":"fd_lychee_counter","cook":true,"name":"逆流荔枝鯉","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"s","id":"fd_vanilla_mirror","cook":true,"name":"天鏡葡萄鯨","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"s","id":"fd_peach_white","cook":true,"name":"仙桃白鯉湯","text":"星露島的魚料理。","emoji":"🐟"},{"c":"fishd","k":"food","t":"s","id":"fd_coffee_cloud","cook":true,"name":"雲巔咖啡鮫","text":"星露島的魚料理。","emoji":"🐟"},{"id":"springroll","name":"潤餅捲","emoji":"🌯","c":"season","t":"r","k":"food","text":"清明節一定要捲一卷。","cook":true,"season":"spring"},{"id":"bambooshootsoup","name":"春筍排骨湯","emoji":"🍲","c":"season","t":"l","k":"food","text":"春天剛冒出來的筍最甜。","cook":true,"season":"spring"},{"id":"watermelonslush","name":"西瓜冰沙","emoji":"🍉","c":"season","t":"r","k":"drink","text":"整顆西瓜打成冰沙，消暑。","cook":true,"season":"summer"},{"id":"coldnoodle","name":"麻醬涼麵","emoji":"🍜","c":"season","t":"l","k":"food","text":"夏天的早餐就是要這個。","cook":true,"season":"summer"},{"id":"pumpkinnoodle","name":"南瓜炒米粉","emoji":"🎃","c":"season","t":"r","k":"food","text":"秋天的南瓜又鬆又甜。","cook":true,"season":"autumn"},{"id":"sweetpotatochicken","name":"地瓜燒雞","emoji":"🍗","c":"season","t":"l","k":"food","text":"天氣轉涼，來一鍋熱呼呼的。","cook":true,"season":"autumn"},{"id":"tangyuan","name":"冬至湯圓","emoji":"🍡","c":"season","t":"r","k":"food","text":"吃了湯圓就長一歲。","cook":true,"season":"winter"},{"id":"winechicken","name":"燒酒雞","emoji":"🍲","c":"season","t":"l","k":"food","text":"寒流來的晚上，全基地都在排隊。","cook":true,"season":"winter"},{"id":"dream_rainbow","name":"彩虹夢幻宴","emoji":"🌈","c":"dream","t":"s","k":"dream","text":"三道傳說料理做成的夢，吃了一整天運氣爆棚。","cook":true,"dream":true},{"id":"dream_moon","name":"月光夢境湯","emoji":"🌙","c":"dream","t":"s","k":"dream","text":"喝下去，今晚的喪屍都會變成精核。","cook":true,"dream":true},{"id":"dream_galaxy","name":"星河滿漢席","emoji":"⭐","c":"dream","t":"s","k":"dream","text":"末世裡最奢侈的一餐，所有加成全部翻倍。","cook":true,"dream":true},{"id":"pumpkincan","name":"南瓜濃湯罐","emoji":"🎃","c":"ltd","t":"r","k":"food","text":"秋天限定的罐頭，打開還是暖的。","ltd":"2026-11"},{"id":"chestnutcake","name":"栗子蛋糕","emoji":"🌰","c":"ltd","t":"l","k":"food","text":"一層栗子泥一層蛋糕，秋天的味道。","ltd":"2026-11"},{"id":"maplepancake","name":"楓糖鬆餅","emoji":"🥞","c":"ltd","t":"l","k":"food","text":"淋上楓糖漿的厚鬆餅。","ltd":"2026-11"},{"id":"applecider","name":"熱蘋果茶","emoji":"🍎","c":"ltd","t":"r","k":"drink","text":"加了肉桂的熱蘋果茶。","ltd":"2026-12"},{"id":"yulelog","name":"樹幹蛋糕","emoji":"🎄","c":"ltd","t":"l","k":"food","text":"聖誕夜才會出現的巧克力樹幹蛋糕。","ltd":"2026-12"},{"id":"gingercookie","name":"薑餅餅乾","emoji":"🍪","c":"ltd","t":"r","k":"food","text":"小人形狀的薑餅，捨不得先咬頭。","ltd":"2026-12"},{"id":"niangao","name":"甜年糕","emoji":"🍘","c":"ltd","t":"r","k":"food","text":"年年高升，煎得焦焦的最好吃。","ltd":"2027-01"},{"id":"changnian","name":"長年菜雞湯","emoji":"🥬","c":"ltd","t":"l","k":"food","text":"吃了長命百歲的長年菜。","ltd":"2027-01"},{"id":"pineapplebox","name":"鳳梨酥禮盒","emoji":"🍍","c":"ltd","t":"l","k":"food","text":"過年送禮第一名，一整盒都是你的。","ltd":"2027-01"}],"effects":{"c":{"hp":0,"luck":0,"morale":3},"l":{"hp":5,"luck":3,"morale":8},"r":{"hp":3,"luck":1,"morale":5},"s":{"hp":12,"luck":8,"morale":18},"x":{"hp":8,"luck":5,"morale":12}}}$json$::jsonb; $function$;
grant execute on function public.doom_food_cat() to authenticated;

create or replace function public.doom_farm_cat()
returns jsonb language sql immutable
as $function$ select $json${"areas":[{"id":"field","cap":"plots","name":"田","note":"蔬菜、穀物、菇類。種一次收一次，用水。","verb":"種","emoji":"🌱"},{"id":"orchard","cap":"orchard","name":"果園","note":"果樹、茶樹、咖啡樹。種下去會一直結果，熟了就收，收完自己再長（種的時候用 3 倍的水）。","verb":"種","emoji":"🌳"},{"id":"herb","cap":"herb","name":"香草園","note":"九層塔、薄荷、迷迭香、蔥薑蒜辣椒這些香草和辛香料，長得快，用水。","verb":"種","emoji":"🌿"},{"id":"ranch","cap":"ranch","name":"牧場","note":"養一次會一直產蛋、奶、蜂蜜（買小動物用 3 倍食物）；肉是一次性的。","verb":"養","emoji":"🐔"},{"id":"pond","cap":"pond","name":"魚塭","note":"星露島的 50 種魚，用食物當飼料，養大收一次。","verb":"養","emoji":"🐟"}],"crops":[{"a":"field","id":"potato","lv":1,"min":30,"name":"馬鈴薯","emoji":"🥔","water":2,"yield":3},{"a":"field","id":"wheat","lv":1,"min":30,"name":"小麥","emoji":"🌾","water":2,"yield":3},{"a":"field","id":"rice","lv":1,"min":40,"name":"稻米","emoji":"🌾","water":3,"yield":3},{"a":"herb","id":"scallion","lv":1,"min":20,"name":"青蔥","emoji":"🧅","water":1,"yield":3},{"a":"field","id":"corn","lv":2,"min":45,"name":"玉米","emoji":"🌽","water":2,"yield":3},{"a":"field","id":"cabbage","lv":2,"min":40,"name":"高麗菜","emoji":"🥬","water":2,"yield":2},{"a":"field","id":"carrot","lv":2,"min":35,"name":"紅蘿蔔","emoji":"🥕","water":2,"yield":3},{"a":"orchard","id":"apple","lv":2,"min":90,"keep":true,"name":"蘋果樹","emoji":"🍎","fruit":"apple","water":3,"yield":2},{"a":"field","id":"tomato","lv":3,"min":50,"name":"番茄","emoji":"🍅","water":2,"yield":3},{"a":"field","id":"soybean","lv":3,"min":60,"name":"大豆","emoji":"🫘","water":2,"yield":3},{"a":"orchard","id":"banana","lv":3,"min":90,"keep":true,"name":"香蕉樹","emoji":"🍌","fruit":"banana","water":3,"yield":2},{"a":"orchard","id":"orange","lv":3,"min":100,"keep":true,"name":"橘子樹","emoji":"🍊","fruit":"orange","water":3,"yield":2},{"a":"field","id":"sugarcane","lv":4,"min":60,"name":"甘蔗","emoji":"🎋","water":3,"yield":3},{"a":"herb","id":"chili","lv":4,"min":45,"name":"辣椒","emoji":"🌶️","water":2,"yield":3},{"a":"field","id":"strawberry","lv":4,"min":120,"name":"草莓","emoji":"🍓","fruit":"strawberry","water":3,"yield":2},{"a":"orchard","id":"tea","lv":5,"min":90,"keep":true,"name":"茶樹","emoji":"🍃","water":2,"yield":3},{"a":"herb","id":"ginger","lv":5,"min":60,"name":"薑","emoji":"🫚","water":2,"yield":3},{"a":"orchard","id":"mango","lv":5,"min":150,"keep":true,"name":"芒果樹","emoji":"🥭","fruit":"mango","water":4,"yield":2},{"a":"orchard","id":"coffee","lv":6,"min":120,"keep":true,"name":"咖啡樹","emoji":"☕","water":3,"yield":3},{"a":"field","id":"watermelon","lv":6,"min":180,"name":"西瓜","emoji":"🍉","fruit":"watermelon","water":5,"yield":1},{"a":"orchard","id":"cocoa","lv":7,"min":150,"keep":true,"name":"可可樹","emoji":"🍫","water":3,"yield":3},{"a":"orchard","id":"grape","lv":8,"min":240,"keep":true,"name":"葡萄藤","emoji":"🍇","fruit":"grapes","water":4,"yield":1},{"a":"orchard","id":"peach","lv":10,"min":720,"keep":true,"name":"仙桃樹","emoji":"🍑","fruit":"goldpeach","water":10,"yield":1},{"a":"field","id":"sweetpotato","lv":1,"min":30,"name":"地瓜","emoji":"🍠","water":2,"yield":3},{"a":"field","id":"pea","lv":1,"min":30,"name":"豌豆","emoji":"🫛","water":2,"yield":3},{"a":"field","id":"shiitake","lv":1,"min":60,"name":"香菇","emoji":"🍄","water":3,"yield":3},{"a":"orchard","id":"lemon","lv":1,"min":120,"keep":true,"name":"檸檬","emoji":"🍋","water":4,"yield":3},{"a":"herb","id":"basil","lv":2,"min":20,"name":"九層塔","emoji":"🌿","water":2,"yield":3},{"a":"field","id":"cucumber","lv":2,"min":30,"name":"小黃瓜","emoji":"🥒","water":2,"yield":3},{"a":"herb","id":"garlic","lv":2,"min":45,"name":"大蒜","emoji":"🧄","water":2,"yield":3},{"a":"field","id":"eggplant","lv":2,"min":60,"name":"茄子","emoji":"🍆","water":3,"yield":3},{"a":"field","id":"bellpepper","lv":2,"min":60,"name":"青椒","emoji":"🫑","water":3,"yield":3},{"a":"field","id":"bamboo","lv":2,"min":90,"name":"竹筍","emoji":"🎋","water":3,"yield":3},{"a":"orchard","id":"cherry","lv":2,"min":120,"keep":true,"name":"櫻桃","emoji":"🍒","water":4,"yield":3},{"a":"herb","id":"mint","lv":3,"min":30,"name":"薄荷","emoji":"🌿","water":2,"yield":3},{"a":"field","id":"daikon","lv":3,"min":60,"name":"白蘿蔔","emoji":"🥕","water":3,"yield":3},{"a":"field","id":"yellowonion","lv":3,"min":60,"name":"洋蔥","emoji":"🧅","water":3,"yield":3},{"a":"field","id":"woodear","lv":3,"min":60,"name":"木耳","emoji":"🍄","water":3,"yield":3},{"a":"field","id":"pumpkin","lv":3,"min":120,"name":"南瓜","emoji":"🎃","water":4,"yield":3},{"a":"herb","id":"coriander","lv":4,"min":30,"name":"香菜","emoji":"🌿","water":2,"yield":3},{"a":"field","id":"enoki","lv":4,"min":75,"name":"金針菇","emoji":"🍄","water":3,"yield":3},{"a":"field","id":"peanut","lv":4,"min":75,"name":"花生","emoji":"🥜","water":3,"yield":3},{"a":"field","id":"spinach","lv":5,"min":45,"name":"菠菜","emoji":"🥬","water":2,"yield":3},{"a":"herb","id":"rosemary","lv":5,"min":45,"name":"迷迭香","emoji":"🌿","water":2,"yield":3},{"a":"field","id":"okra","lv":5,"min":60,"name":"秋葵","emoji":"🫛","water":3,"yield":3},{"a":"field","id":"taro","lv":5,"min":120,"name":"芋頭","emoji":"🥔","water":4,"yield":3},{"a":"field","id":"melon","lv":5,"min":150,"name":"哈密瓜","emoji":"🍈","water":4,"yield":3},{"a":"field","id":"pineapple","lv":5,"min":150,"name":"鳳梨","emoji":"🍍","water":4,"yield":3},{"a":"field","id":"kingoyster","lv":6,"min":90,"name":"杏鮑菇","emoji":"🍄","water":3,"yield":3},{"a":"field","id":"bittermelon","lv":6,"min":90,"name":"苦瓜","emoji":"🥒","water":3,"yield":3},{"a":"field","id":"asparagus","lv":6,"min":120,"name":"蘆筍","emoji":"🥦","water":4,"yield":3},{"a":"field","id":"yam","lv":6,"min":120,"name":"山藥","emoji":"🍠","water":4,"yield":3},{"a":"herb","id":"lavender","lv":7,"min":45,"name":"薰衣草","emoji":"💜","water":2,"yield":3},{"a":"field","id":"lotusroot","lv":7,"min":120,"name":"蓮藕","emoji":"🪷","water":4,"yield":3},{"a":"orchard","id":"lychee","lv":7,"min":180,"keep":true,"name":"荔枝","emoji":"🍒","water":5,"yield":3},{"a":"orchard","id":"dragonfruit","lv":7,"min":180,"keep":true,"name":"火龍果","emoji":"🐉","water":5,"yield":3},{"a":"orchard","id":"vanilla","lv":7,"min":240,"keep":true,"name":"香草莢","emoji":"🌼","water":6,"yield":3},{"a":"orchard","id":"coconut","lv":7,"min":240,"keep":true,"name":"椰子","emoji":"🥥","water":6,"yield":3},{"a":"field","id":"lingzhi","lv":7,"min":360,"name":"靈芝","emoji":"🍄","water":6,"yield":3},{"a":"field","id":"cherryradish","lv":8,"min":60,"name":"櫻桃蘿蔔","emoji":"🔴","water":3,"yield":2},{"a":"field","id":"goldrice","lv":8,"min":90,"name":"金穗稻","emoji":"✨","water":3,"yield":2},{"a":"field","id":"blueberry","lv":8,"min":90,"name":"藍莓","emoji":"🫐","water":3,"yield":2},{"a":"field","id":"colorpepper","lv":8,"min":90,"name":"彩椒","emoji":"🫑","water":3,"yield":2},{"a":"field","id":"purplepotato","lv":8,"min":90,"name":"紫地瓜","emoji":"🍠","water":3,"yield":2},{"a":"field","id":"rainbowcorn","lv":8,"min":120,"name":"彩虹玉米","emoji":"🌈","water":4,"yield":2},{"a":"field","id":"whitestrawberry","lv":8,"min":120,"name":"白草莓","emoji":"🍓","water":4,"yield":2},{"a":"field","id":"blacktomato","lv":8,"min":120,"name":"黑番茄","emoji":"🍅","water":4,"yield":2},{"a":"orchard","id":"waxapple","lv":8,"min":150,"keep":true,"name":"蓮霧","emoji":"🍐","water":4,"yield":3},{"a":"orchard","id":"persimmon","lv":8,"min":180,"keep":true,"name":"柿子","emoji":"🟠","water":5,"yield":2},{"a":"orchard","id":"durian","lv":8,"min":210,"keep":true,"name":"榴槤","emoji":"🍈","water":5,"yield":3},{"a":"field","id":"sunflower","lv":9,"min":120,"name":"向日葵","emoji":"🌻","water":4,"yield":3},{"a":"field","id":"amberpumpkin","lv":9,"min":180,"name":"琥珀南瓜","emoji":"🎃","water":5,"yield":2},{"a":"field","id":"cottoncandy","lv":9,"min":180,"name":"棉花糖花","emoji":"🍭","water":5,"yield":2},{"a":"orchard","id":"goldapple","lv":9,"min":210,"keep":true,"name":"金蘋果","emoji":"🍏","water":5,"yield":2},{"a":"orchard","id":"passionfruit","lv":9,"min":210,"keep":true,"name":"百香果","emoji":"🟡","water":5,"yield":3},{"a":"field","id":"phoenixpepper","lv":9,"min":240,"name":"鳳凰椒","emoji":"🌶️","water":6,"yield":2},{"a":"orchard","id":"auroragrape","lv":9,"min":240,"keep":true,"name":"極光葡萄","emoji":"🍇","water":6,"yield":2},{"a":"orchard","id":"mangosteen","lv":9,"min":240,"keep":true,"name":"山竹","emoji":"🟣","water":6,"yield":3},{"a":"orchard","id":"avocado","lv":9,"min":240,"keep":true,"name":"酪梨","emoji":"🥑","water":6,"yield":3},{"a":"orchard","id":"fig","lv":9,"min":240,"keep":true,"name":"無花果","emoji":"🟪","water":6,"yield":3},{"a":"herb","id":"starherb","lv":9,"min":360,"name":"星露草","emoji":"⭐","water":6,"yield":2},{"a":"field","id":"moonlotus","lv":9,"min":360,"name":"月光蓮","emoji":"🌙","water":6,"yield":2},{"a":"orchard","id":"starfruit","lv":10,"min":300,"keep":true,"name":"楊桃","emoji":"⭐","water":6,"yield":3},{"a":"orchard","id":"dragoneye","lv":10,"min":360,"keep":true,"name":"龍眼","emoji":"🟤","water":6,"yield":3},{"a":"orchard","id":"chestnut","lv":10,"min":360,"keep":true,"name":"栗子","emoji":"🌰","water":6,"yield":3},{"a":"ranch","g":"ranch","t":"c","id":"egg","lv":1,"min":60,"src":"🐔 養雞","feed":2,"keep":true,"name":"雞蛋","emoji":"🥚","yield":2},{"a":"ranch","g":"ranch","t":"c","id":"milk","lv":1,"min":60,"src":"🐄 養乳牛","feed":2,"keep":true,"name":"牛奶","emoji":"🥛","yield":2},{"a":"ranch","g":"ranch","t":"c","id":"chickenmeat","lv":1,"min":180,"src":"🐔 養雞（肉）","feed":4,"name":"雞肉","emoji":"🍗","yield":2},{"a":"ranch","g":"ranch","t":"c","id":"beef","lv":1,"min":180,"src":"🐄 養乳牛（肉）","feed":4,"name":"牛肉","emoji":"🥩","yield":4},{"a":"ranch","g":"ranch","t":"c","id":"truffle","lv":2,"min":120,"src":"🐖 養豬","feed":2,"keep":true,"name":"松露","emoji":"🟤","yield":2},{"a":"ranch","g":"ranch","t":"c","id":"pork","lv":2,"min":180,"src":"🐖 養豬（肉）","feed":4,"name":"豬肉","emoji":"🥓","yield":4},{"a":"ranch","g":"ranch","t":"c","id":"duckegg","lv":3,"min":60,"src":"🦆 養鴨","feed":2,"keep":true,"name":"鴨蛋","emoji":"🥚","yield":2},{"a":"ranch","g":"ranch","t":"r","id":"honey","lv":3,"min":60,"src":"🐝 養蜜蜂","feed":2,"keep":true,"name":"蜂蜜","emoji":"🍯","yield":2},{"a":"ranch","g":"ranch","t":"c","id":"duckmeat","lv":3,"min":180,"src":"🦆 養鴨（肉）","feed":4,"name":"鴨肉","emoji":"🍗","yield":2},{"a":"ranch","g":"ranch","t":"r","id":"goatmilk","lv":4,"min":60,"src":"🐐 養山羊","feed":2,"keep":true,"name":"羊奶","emoji":"🥛","yield":2},{"a":"ranch","g":"ranch","t":"c","id":"lamb","lv":4,"min":180,"src":"🐑 養綿羊（肉）","feed":4,"name":"羊肉","emoji":"🍖","yield":3},{"a":"ranch","g":"ranch","t":"r","id":"gooseegg","lv":5,"min":120,"src":"🪿 養鵝","feed":2,"keep":true,"name":"鵝蛋","emoji":"🪿","yield":2},{"a":"ranch","g":"ranch","t":"r","id":"goosemeat","lv":5,"min":240,"src":"🪿 養鵝（肉）","feed":4,"name":"鵝肉","emoji":"🍖","yield":2},{"a":"ranch","g":"ranch","t":"l","id":"ostrichegg","lv":6,"min":180,"src":"🦤 養鴕鳥","feed":4,"keep":true,"name":"鴕鳥蛋","emoji":"🥚","yield":1},{"a":"ranch","g":"ranch","t":"l","id":"turkeymeat","lv":7,"min":240,"src":"🦃 養火雞（肉）","feed":4,"name":"火雞肉","emoji":"🍖","yield":2},{"a":"ranch","g":"ranch","t":"r","id":"buffalomilk","lv":9,"min":120,"src":"🐃 養水牛","feed":2,"keep":true,"name":"水牛奶","emoji":"🥛","yield":2},{"a":"ranch","g":"ranch","t":"x","id":"goldegg","lv":9,"min":300,"src":"🐓 養金雞","feed":4,"keep":true,"name":"金蛋","emoji":"🥚","yield":1},{"a":"ranch","g":"ranch","t":"s","id":"osmanthus","lv":10,"min":420,"src":"🐇 養月兔","feed":4,"keep":true,"name":"月桂粉","emoji":"🐇","yield":1},{"a":"pond","g":"fish","t":"c","id":"moon_minnow","lv":2,"min":60,"feed":2,"name":"月光小鯽","emoji":"🐟","yield":3},{"a":"pond","g":"fish","t":"c","id":"paper_boat_fish","lv":2,"min":60,"feed":2,"name":"紙船魚","emoji":"🐟","yield":3},{"a":"pond","g":"fish","t":"c","id":"cotton_carp","lv":2,"min":60,"feed":2,"name":"棉花鯉","emoji":"🐟","yield":3},{"a":"pond","g":"fish","t":"c","id":"honey_perch","lv":2,"min":60,"feed":2,"name":"蜂蜜鱸","emoji":"🐟","yield":3},{"a":"pond","g":"fish","t":"c","id":"bubble_fish","lv":2,"min":60,"feed":2,"name":"小泡泡魚","emoji":"🐟","yield":3},{"a":"pond","g":"fish","t":"c","id":"reed_loach","lv":2,"min":60,"feed":2,"name":"蘆葦鰍","emoji":"🐟","yield":3},{"a":"pond","g":"fish","t":"c","id":"match_snapper","lv":2,"min":60,"feed":2,"name":"火柴鯛","emoji":"🐟","yield":3},{"a":"pond","g":"fish","t":"c","id":"bun_catfish","lv":2,"min":60,"feed":2,"name":"饅頭鯰","emoji":"🐟","yield":3},{"a":"pond","g":"fish","t":"c","id":"dew_carp","lv":2,"min":60,"feed":2,"name":"露珠鯉","emoji":"🐟","yield":3},{"a":"pond","g":"fish","t":"c","id":"bean_sprout_catfish","lv":2,"min":60,"feed":2,"name":"豆芽鯰","emoji":"🐟","yield":3},{"a":"pond","g":"fish","t":"c","id":"slipper_fish","lv":2,"min":60,"feed":2,"name":"拖鞋魚","emoji":"🐟","yield":3},{"a":"pond","g":"fish","t":"c","id":"strawberry_snapper","lv":2,"min":60,"feed":2,"name":"草莓鯛","emoji":"🐟","yield":3},{"a":"pond","g":"fish","t":"r","id":"rain_snapper","lv":5,"min":120,"feed":3,"name":"雨滴鯛","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"r","id":"maple_carp","lv":5,"min":120,"feed":3,"name":"紅楓鯉","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"r","id":"bell_eel","lv":5,"min":120,"feed":3,"name":"鈴鐺鰻","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"r","id":"mint_guppy","lv":5,"min":120,"feed":3,"name":"薄荷鱂","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"r","id":"star_goby","lv":5,"min":120,"feed":3,"name":"星沙蝦虎","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"r","id":"carpenter_fish","lv":5,"min":120,"feed":3,"name":"木匠魚","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"r","id":"sakura_trout","lv":5,"min":120,"feed":3,"name":"櫻花鱒","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"r","id":"snail_catfish","lv":5,"min":120,"feed":3,"name":"蝸牛鰭鯰","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"r","id":"wind_chime_perch","lv":5,"min":120,"feed":3,"name":"風鈴鱸","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"r","id":"honey_pomelo_snapper","lv":5,"min":120,"feed":3,"name":"蜜柚鯛","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"r","id":"porcelain_carp","lv":5,"min":120,"feed":3,"name":"陶瓷鯉","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"r","id":"paper_lantern_loach","lv":5,"min":120,"feed":3,"name":"紙燈籠鰍","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"r","id":"cloud_guppy","lv":5,"min":120,"feed":3,"name":"雲朵鱂","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"l","id":"lantern_jelly","lv":7,"min":240,"feed":4,"name":"燈籠水母魚","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"l","id":"ink_shark","lv":7,"min":240,"feed":4,"name":"墨硯鯊","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"l","id":"glass_mackerel","lv":7,"min":240,"feed":4,"name":"玻璃鯖","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"l","id":"clay_gator","lv":7,"min":240,"feed":4,"name":"陶土鱷","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"l","id":"stalactite_whale","lv":7,"min":240,"feed":4,"name":"鐘乳鯨苗","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"l","id":"sugar_snapper","lv":7,"min":240,"feed":4,"name":"糖霜鯛","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"l","id":"spruce_salmon","lv":7,"min":240,"feed":4,"name":"雲杉鮭","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"l","id":"crystal_shrimp","lv":7,"min":240,"feed":4,"name":"水晶蝦","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"l","id":"amber_perch","lv":7,"min":240,"feed":4,"name":"琥珀鱸","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"l","id":"nebula_anglerfish","lv":7,"min":240,"feed":4,"name":"星雲鮟鱇","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"l","id":"bronze_bell_whale","lv":7,"min":240,"feed":4,"name":"銅鈴鯨","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"l","id":"coral_armor_shark","lv":7,"min":240,"feed":4,"name":"珊瑚鎧鯊","emoji":"🐟","yield":2},{"a":"pond","g":"fish","t":"x","id":"clock_carp","lv":9,"min":360,"feed":6,"name":"時鐘鯉","emoji":"🐟","yield":1},{"a":"pond","g":"fish","t":"x","id":"aurora_ray","lv":9,"min":360,"feed":6,"name":"極光鰩","emoji":"🐟","yield":1},{"a":"pond","g":"fish","t":"x","id":"mirror_fish","lv":9,"min":360,"feed":6,"name":"鏡面魚","emoji":"🐟","yield":1},{"a":"pond","g":"fish","t":"x","id":"starsea_turtle","lv":9,"min":360,"feed":6,"name":"星海龜","emoji":"🐟","yield":1},{"a":"pond","g":"fish","t":"x","id":"frost_dragon_carp","lv":9,"min":360,"feed":6,"name":"霜紋龍鯉","emoji":"🐟","yield":1},{"a":"pond","g":"fish","t":"x","id":"backlight_whale","lv":9,"min":360,"feed":6,"name":"逆光鯨","emoji":"🐟","yield":1},{"a":"pond","g":"fish","t":"x","id":"wing_mackerel","lv":9,"min":360,"feed":6,"name":"羽翼鯖","emoji":"🐟","yield":1},{"a":"pond","g":"fish","t":"s","id":"xuguang_fish","lv":10,"min":480,"feed":8,"name":"序光魚","emoji":"🐟","yield":1},{"a":"pond","g":"fish","t":"s","id":"dragon_bone_whale","lv":10,"min":480,"feed":8,"name":"龍骨鯨","emoji":"🐟","yield":1},{"a":"pond","g":"fish","t":"s","id":"counter_king","lv":10,"min":480,"feed":8,"name":"逆流之王","emoji":"🐟","yield":1},{"a":"pond","g":"fish","t":"s","id":"sky_mirror_whale","lv":10,"min":480,"feed":8,"name":"天鏡鯨","emoji":"🐟","yield":1},{"a":"pond","g":"fish","t":"s","id":"nameless_white_carp","lv":10,"min":480,"feed":8,"name":"無名白鯉","emoji":"🐟","yield":1},{"a":"pond","g":"fish","t":"s","id":"cloud_peak_shark","lv":10,"min":480,"feed":8,"name":"雲巔鮫","emoji":"🐟","yield":1},{"g":"goods","t":"c","id":"flour","lv":2,"min":20,"name":"麵粉","emoji":"🌾"},{"g":"goods","t":"c","id":"butter","lv":2,"min":30,"name":"奶油","emoji":"🧈"},{"g":"goods","t":"c","id":"sugar","lv":4,"min":20,"name":"砂糖","emoji":"🍬"},{"g":"goods","t":"c","id":"tofu","lv":4,"min":30,"name":"豆腐","emoji":"⬜"},{"g":"goods","t":"c","id":"soymilk","lv":4,"min":10,"name":"豆漿","emoji":"🥛"},{"g":"goods","t":"c","id":"cheese","lv":4,"min":60,"name":"起司","emoji":"🧀"},{"g":"goods","t":"c","id":"chocolate","lv":7,"min":60,"name":"巧克力","emoji":"🍫"},{"g":"goods","t":"r","id":"jam_strawberry","lv":8,"min":60,"name":"草莓果醬","emoji":"🍓"},{"g":"goods","t":"r","id":"jam_mango","lv":8,"min":60,"name":"芒果果醬","emoji":"🥭"},{"g":"goods","t":"l","id":"ice_mango","lv":9,"min":90,"name":"芒果冰淇淋","emoji":"🍨"},{"g":"goods","t":"l","id":"ice_matcha","lv":9,"min":90,"name":"抹茶冰淇淋","emoji":"🍵"},{"g":"goods","t":"r","id":"oolong","lv":10,"min":120,"name":"烏龍茶","emoji":"🫖"},{"g":"goods","t":"r","id":"blacktea","lv":10,"min":90,"name":"紅茶","emoji":"☕"}],"levels":[{"lv":1,"herb":2,"pond":1,"plots":3,"ranch":2,"stoves":1,"orchard":2},{"lv":2,"cost":{"food":15,"cores":10,"parts":30},"herb":2,"pond":2,"plots":4,"ranch":3,"stoves":1,"orchard":2},{"lv":3,"cost":{"food":30,"cores":25,"parts":60},"herb":2,"pond":3,"plots":5,"ranch":3,"stoves":2,"orchard":3},{"lv":4,"cost":{"food":50,"cores":45,"parts":100},"herb":3,"pond":3,"plots":6,"ranch":4,"stoves":2,"orchard":3},{"lv":5,"cost":{"food":75,"cores":70,"parts":150},"herb":3,"pond":4,"plots":7,"ranch":4,"stoves":2,"orchard":4},{"lv":6,"cost":{"food":100,"cores":100,"parts":210},"herb":4,"pond":4,"plots":8,"ranch":5,"stoves":3,"orchard":4},{"lv":7,"cost":{"food":130,"cores":140,"parts":280},"herb":4,"pond":5,"plots":9,"ranch":6,"stoves":3,"orchard":5},{"lv":8,"cost":{"food":160,"cores":190,"parts":360},"herb":5,"pond":6,"plots":10,"ranch":6,"stoves":3,"orchard":6},{"lv":9,"cost":{"food":200,"cores":250,"parts":450},"herb":5,"pond":6,"plots":11,"ranch":7,"stoves":4,"orchard":7},{"lv":10,"cost":{"food":250,"cores":320,"parts":550},"herb":6,"pond":7,"plots":12,"ranch":8,"stoves":4,"orchard":8}],"recipes":[{"lv":2,"ing":true,"min":20,"out":"flour","need":{"wheat":2}},{"lv":2,"ing":true,"min":30,"out":"butter","need":{"milk":2}},{"lv":4,"ing":true,"min":20,"out":"sugar","need":{"sugarcane":1}},{"lv":4,"ing":true,"min":30,"out":"tofu","need":{"soybean":2}},{"lv":4,"ing":true,"min":10,"out":"soymilk","need":{"soybean":1}},{"lv":4,"ing":true,"min":60,"out":"cheese","need":{"milk":2}},{"lv":7,"ing":true,"min":60,"out":"chocolate","need":{"cocoa":1,"sugar":1}},{"lv":8,"ing":true,"min":60,"out":"jam_strawberry","need":{"sugar":1,"strawberry":3}},{"lv":8,"ing":true,"min":60,"out":"jam_mango","need":{"mango":3,"sugar":1}},{"lv":9,"ing":true,"min":90,"out":"ice_mango","need":{"milk":2,"mango":1,"sugar":1}},{"lv":9,"ing":true,"min":90,"out":"ice_matcha","need":{"tea":2,"milk":2,"sugar":1}},{"lv":10,"ing":true,"min":120,"out":"oolong","need":{"tea":3}},{"lv":10,"ing":true,"min":90,"out":"blacktea","need":{"tea":3}},{"lv":1,"min":10,"out":"onigiri","need":{"rice":2}},{"lv":1,"min":10,"out":"toast","need":{"wheat":2}},{"lv":1,"min":10,"out":"porridge","res":{"water":2},"need":{"rice":1}},{"lv":1,"min":15,"out":"friedrice","need":{"rice":2,"scallion":1}},{"lv":2,"min":15,"out":"bagel","need":{"wheat":2,"scallion":1}},{"lv":2,"min":10,"out":"popcorn","need":{"corn":2}},{"lv":2,"min":20,"out":"cornsoup","res":{"water":2},"need":{"corn":2,"potato":1}},{"lv":2,"min":20,"out":"potsticker","need":{"wheat":2,"cabbage":1,"scallion":1}},{"lv":3,"min":30,"out":"curry","res":{"food":3},"need":{"rice":2,"carrot":1,"potato":1}},{"lv":3,"min":30,"out":"lurou","res":{"food":4},"need":{"rice":2,"soybean":1}},{"lv":3,"min":15,"out":"beans","need":{"tomato":1,"soybean":2}},{"lv":3,"min":10,"out":"oj","need":{"orange":2},"fruitneed":true},{"lv":4,"min":40,"out":"beefnoodle","res":{"food":6},"need":{"wheat":2,"tomato":1,"scallion":1}},{"lv":4,"min":15,"out":"spicynoodle","need":{"chili":1,"wheat":2}},{"lv":4,"min":20,"out":"cookie","need":{"wheat":1,"sugarcane":1}},{"lv":4,"min":25,"out":"pudding","res":{"food":3,"water":1},"need":{"sugarcane":1}},{"lv":5,"min":10,"out":"lemontea","res":{"water":1},"need":{"tea":1,"sugarcane":1}},{"lv":5,"min":10,"out":"greentea","res":{"water":1},"need":{"tea":1}},{"lv":5,"min":15,"out":"gingertea","res":{"water":1},"need":{"ginger":1,"sugarcane":1}},{"lv":5,"min":30,"out":"croissant","res":{"food":2},"need":{"wheat":3}},{"lv":5,"min":25,"out":"donut","need":{"wheat":2,"sugarcane":1}},{"lv":5,"min":40,"out":"hotpot","res":{"food":5},"need":{"chili":1,"tomato":1,"cabbage":1}},{"lv":6,"min":10,"out":"coffee","res":{"water":1},"need":{"coffee":1}},{"lv":6,"min":15,"out":"latte","res":{"food":2,"water":1},"need":{"coffee":1}},{"lv":6,"min":30,"out":"icecream","res":{"water":2},"need":{"sugarcane":1,"strawberry":1},"fruitneed":true},{"lv":6,"min":45,"out":"pizza","res":{"food":4},"need":{"wheat":2,"tomato":2}},{"lv":6,"min":60,"out":"ramen","res":{"food":8},"need":{"wheat":3,"soybean":1,"scallion":1}},{"lv":7,"min":20,"out":"bubbletea","res":{"food":2},"need":{"tea":1,"potato":1,"sugarcane":1}},{"lv":7,"min":15,"out":"cocoa","res":{"food":1},"need":{"cocoa":1,"sugarcane":1}},{"lv":7,"min":20,"out":"smoothie","need":{"mango":1,"banana":1,"strawberry":1},"fruitneed":true},{"lv":7,"min":45,"out":"honeycake","res":{"food":2},"need":{"wheat":2,"sugarcane":2}},{"lv":8,"min":50,"out":"macaron","need":{"wheat":1,"sugarcane":2,"strawberry":1},"fruitneed":true},{"lv":8,"min":60,"out":"cheesecake","res":{"food":5},"need":{"wheat":2,"sugarcane":1,"strawberry":1},"fruitneed":true},{"lv":9,"min":90,"out":"chocobox","need":{"cocoa":3,"sugarcane":2}},{"lv":9,"min":120,"out":"grandmasoup","res":{"food":10,"water":5},"need":{"carrot":1,"ginger":1,"scallion":1}},{"lv":10,"min":240,"out":"feast","res":{"food":40,"water":20},"need":{"rice":5,"cocoa":1,"ginger":2,"tomato":2,"cabbage":2}},{"lv":1,"min":10,"out":"f_scallionegg","need":{"egg":1,"scallion":2}},{"lv":1,"min":10,"out":"f_congee","need":{"rice":1,"sweetpotato":1}},{"lv":1,"min":10,"out":"f_peaegg","need":{"egg":1,"pea":2}},{"lv":2,"min":10,"out":"f_onionpork","need":{"pork":1,"scallion":2}},{"lv":1,"min":10,"out":"f_steamegg","need":{"egg":2,"shiitake":1}},{"lv":1,"min":30,"out":"f_lemonchicken","need":{"lemon":1,"chickenmeat":1}},{"lv":2,"min":30,"out":"f_pancake","need":{"egg":1,"milk":1,"flour":1,"butter":1}},{"lv":4,"min":30,"out":"f_potatogratin","need":{"butter":1,"cheese":1,"potato":2}},{"lv":4,"min":60,"out":"f_trufflerisotto","need":{"rice":1,"butter":1,"cheese":1,"truffle":1}},{"lv":2,"min":10,"out":"f_grilledcorn","need":{"corn":2}},{"lv":2,"min":10,"out":"f_cornsoup","need":{"corn":2,"milk":1}},{"lv":2,"min":10,"out":"f_cabbagepork","need":{"pork":1,"cabbage":1}},{"lv":2,"min":10,"out":"f_carrotegg","need":{"egg":1,"carrot":2}},{"lv":2,"min":10,"out":"f_cucumbersalad","need":{"garlic":1,"cucumber":2}},{"lv":2,"min":10,"out":"f_pepperpork","need":{"pork":1,"bellpepper":2}},{"lv":2,"min":30,"out":"f_fishfragrant","need":{"pork":1,"garlic":1,"eggplant":2}},{"lv":2,"min":30,"out":"f_bamboosoup","need":{"pork":1,"bamboo":2}},{"lv":2,"min":30,"out":"f_threecup","need":{"basil":1,"garlic":1,"chickenmeat":1}},{"lv":2,"min":60,"out":"f_steak","need":{"beef":2,"butter":1,"garlic":1}},{"lv":3,"min":10,"out":"f_tomatoegg","need":{"egg":1,"tomato":2}},{"lv":3,"min":10,"out":"f_cherrymilk","need":{"milk":1,"cherry":2}},{"lv":3,"min":10,"out":"f_daikonsoup","need":{"pork":1,"daikon":1}},{"lv":3,"min":10,"out":"f_onionrings","need":{"egg":1,"flour":1,"yellowonion":2}},{"lv":3,"min":10,"out":"f_honeylemon","need":{"honey":1,"lemon":1}},{"lv":3,"min":10,"out":"f_woodearsalad","need":{"garlic":1,"woodear":2}},{"lv":3,"min":10,"out":"f_mintlemonade","need":{"mint":1,"honey":1,"lemon":1}},{"lv":3,"min":10,"out":"f_bananamilk","need":{"milk":1,"banana":1}},{"lv":4,"min":10,"out":"f_homestyletofu","need":{"pork":1,"tofu":1,"scallion":1}},{"lv":5,"min":10,"out":"f_gooseeggrice","need":{"rice":2,"gooseegg":1,"scallion":1}},{"lv":3,"min":10,"out":"f_turnipcake","need":{"rice":2,"daikon":2}},{"lv":3,"min":30,"out":"f_tomatobeef","need":{"beef":1,"tomato":2}},{"lv":3,"min":30,"out":"f_pumpkinsoup","need":{"milk":1,"butter":1,"pumpkin":1}},{"lv":4,"min":30,"out":"f_cheeseomelet","need":{"egg":2,"cheese":1,"tomato":1}},{"lv":3,"min":60,"out":"f_roastduck","need":{"honey":1,"duckmeat":2}},{"lv":4,"min":60,"out":"f_hotpot","need":{"corn":1,"pork":1,"tofu":1,"cabbage":1,"shiitake":1}},{"lv":5,"min":60,"out":"f_honeygoose","need":{"honey":1,"goosemeat":1}},{"lv":4,"min":10,"out":"f_orangejelly","need":{"sugar":1,"orange":2}},{"lv":4,"min":10,"out":"f_saltysoymilk","need":{"soymilk":1,"scallion":1,"coriander":1}},{"lv":4,"min":10,"out":"f_enokiroll","need":{"pork":1,"enoki":1}},{"lv":4,"min":10,"out":"f_peanutsoup","need":{"sugar":1,"peanut":2}},{"lv":4,"min":10,"out":"f_fagao","need":{"flour":2,"sugar":1}},{"lv":4,"min":30,"out":"f_applepie","need":{"apple":2,"flour":1,"sugar":1,"butter":1}},{"lv":4,"min":30,"out":"f_strawberrycake","need":{"egg":2,"flour":1,"sugar":1,"strawberry":2}},{"lv":4,"min":30,"out":"f_kungpao","need":{"chili":1,"peanut":1,"chickenmeat":1}},{"lv":4,"min":30,"out":"f_goatpudding","need":{"egg":1,"sugar":1,"goatmilk":1}},{"lv":5,"min":10,"out":"f_spinachegg","need":{"egg":1,"spinach":2}},{"lv":5,"min":10,"out":"f_okraegg","need":{"egg":1,"okra":2}},{"lv":5,"min":10,"out":"f_gingerbreadman","need":{"flour":1,"honey":1,"ginger":1}},{"lv":5,"min":30,"out":"f_sesamechicken","need":{"ginger":2,"chickenmeat":1}},{"lv":5,"min":30,"out":"f_melonmilk","need":{"milk":1,"melon":1}},{"lv":5,"min":30,"out":"f_pineapplecake","need":{"flour":1,"sugar":1,"butter":1,"pineapple":2}},{"lv":5,"min":30,"out":"f_taroball","need":{"taro":2,"sugar":1,"sweetpotato":1}},{"lv":5,"min":30,"out":"f_mangoice","need":{"milk":1,"mango":2,"sugar":1}},{"lv":7,"min":30,"out":"f_turkeyleg","need":{"rosemary":1,"turkeymeat":1}},{"lv":7,"min":30,"out":"f_turkeysandwich","need":{"flour":1,"cabbage":1,"turkeymeat":1}},{"lv":5,"min":30,"out":"f_mangoshake","need":{"milk":1,"mango":1,"sugar":1}},{"lv":9,"min":30,"out":"f_buffalopudding","need":{"egg":1,"sugar":1,"buffalomilk":1}},{"lv":10,"min":30,"out":"f_blacktealatte","need":{"milk":1,"blacktea":1}},{"lv":5,"min":60,"out":"f_gingerduck","need":{"ginger":2,"duckmeat":2}},{"lv":5,"min":60,"out":"f_lambpot","need":{"lamb":2,"ginger":1,"cabbage":1}},{"lv":5,"min":60,"out":"f_lambchop","need":{"lamb":2,"garlic":1,"rosemary":1}},{"lv":5,"min":60,"out":"f_buddhajump","need":{"pork":2,"taro":1,"bamboo":2,"shiitake":2,"chickenmeat":1}},{"lv":6,"min":60,"out":"f_giantpudding","need":{"milk":2,"sugar":1,"ostrichegg":1}},{"lv":6,"min":10,"out":"f_watermelonmilk","need":{"milk":1,"watermelon":1}},{"lv":6,"min":10,"out":"f_butteroyster","need":{"butter":1,"kingoyster":2}},{"lv":6,"min":10,"out":"f_saltedbitter","need":{"duckegg":1,"bittermelon":2}},{"lv":6,"min":10,"out":"f_butterasparagus","need":{"butter":1,"asparagus":2}},{"lv":6,"min":10,"out":"f_yamsoup","need":{"yam":1,"pork":1}},{"lv":6,"min":30,"out":"f_bitterchicken","need":{"pineapple":1,"bittermelon":1,"chickenmeat":1}},{"lv":7,"min":10,"out":"f_lotussoup","need":{"pork":1,"lotusroot":1}},{"lv":7,"min":10,"out":"f_dragonmilk","need":{"milk":1,"dragonfruit":1}},{"lv":7,"min":30,"out":"f_lavendercookie","need":{"flour":1,"sugar":1,"butter":1,"lavender":1}},{"lv":7,"min":30,"out":"f_lycheeice","need":{"sugar":1,"lychee":2}},{"lv":7,"min":30,"out":"f_coconutsago","need":{"milk":1,"taro":1,"sugar":1,"coconut":1}},{"lv":9,"min":30,"out":"f_goldomelet","need":{"goldegg":1,"scallion":1}},{"lv":7,"min":60,"out":"f_tiramisu","need":{"egg":2,"cheese":1,"coffee":1,"chocolate":1}},{"lv":7,"min":60,"out":"f_blackforest","need":{"egg":2,"flour":1,"butter":1,"cherry":2,"chocolate":2}},{"lv":7,"min":60,"out":"f_vanillaicecream","need":{"egg":1,"milk":2,"sugar":1,"vanilla":1}},{"lv":7,"min":60,"out":"f_lingzhisoup","need":{"ginger":1,"lingzhi":1,"chickenmeat":1}},{"lv":7,"min":60,"out":"f_tropicaltart","need":{"flour":1,"mango":1,"butter":1,"coconut":1,"strawberry":2}},{"lv":9,"min":60,"out":"f_goldtart","need":{"flour":1,"sugar":1,"butter":1,"goldegg":1}},{"lv":9,"min":60,"out":"f_fruitsundae","need":{"banana":1,"ice_mango":1,"strawberry":1}},{"lv":8,"min":10,"out":"f_blueberrymilk","need":{"milk":1,"blueberry":2}},{"lv":8,"min":10,"out":"f_pepperchicken","need":{"chickenmeat":1,"colorpepper":2}},{"lv":8,"min":10,"out":"f_radishsalad","need":{"cucumber":1,"cherryradish":2}},{"lv":8,"min":10,"out":"f_purpleballs","need":{"sugar":1,"purplepotato":2}},{"lv":8,"min":10,"out":"f_rainbowpopcorn","need":{"butter":1,"rainbowcorn":2}},{"lv":8,"min":10,"out":"f_whitestrawberrymilk","need":{"milk":1,"whitestrawberry":2}},{"lv":8,"min":10,"out":"f_blacktomatosalad","need":{"cheese":1,"blacktomato":2}},{"lv":8,"min":10,"out":"f_driedpersimmon","need":{"persimmon":3}},{"lv":8,"min":30,"out":"f_grapetart","need":{"flour":1,"grape":2,"sugar":1,"butter":1}},{"lv":8,"min":30,"out":"f_goldonigiri","need":{"egg":1,"goldrice":2}},{"lv":8,"min":30,"out":"f_rainbowsoup","need":{"milk":1,"butter":1,"rainbowcorn":2}},{"lv":8,"min":30,"out":"f_blueberrypancake","need":{"egg":1,"flour":1,"blueberry":2}},{"lv":8,"min":30,"out":"f_stuffedpepper","need":{"pork":1,"colorpepper":2,"yellowonion":1}},{"lv":8,"min":30,"out":"f_goldfriedrice","need":{"egg":1,"goldrice":2,"scallion":1}},{"lv":8,"min":30,"out":"f_daifuku","need":{"rice":2,"sugar":1,"whitestrawberry":1}},{"lv":8,"min":30,"out":"f_grainrice","need":{"corn":1,"wheat":1,"soybean":1,"goldrice":1,"sweetpotato":1}},{"lv":8,"min":30,"out":"f_waxappletea","need":{"tea":1,"waxapple":1}},{"lv":8,"min":60,"out":"f_fruitplatter","need":{"grape":1,"melon":1,"lychee":1,"watermelon":1}},{"lv":8,"min":60,"out":"f_durianpuff","need":{"flour":1,"butter":1,"durian":1}},{"lv":9,"min":10,"out":"f_goldapplejuice","need":{"goldapple":2}},{"lv":9,"min":30,"out":"f_cottoncocoa","need":{"milk":1,"chocolate":1,"cottoncandy":1}},{"lv":9,"min":30,"out":"f_aurorajuice","need":{"auroragrape":2}},{"lv":9,"min":30,"out":"f_mangosteenbowl","need":{"honey":1,"sugar":1,"mangosteen":1}},{"lv":9,"min":30,"out":"f_sunflowercookie","need":{"flour":1,"butter":1,"sunflower":1}},{"lv":9,"min":30,"out":"f_passiontea","need":{"tea":1,"passionfruit":1}},{"lv":9,"min":30,"out":"f_avocadomilk","need":{"milk":1,"avocado":1}},{"lv":9,"min":60,"out":"f_starpudding","need":{"egg":1,"milk":1,"sugar":1,"starherb":1}},{"lv":9,"min":60,"out":"f_amberrisotto","need":{"rice":2,"cheese":1,"amberpumpkin":1}},{"lv":9,"min":60,"out":"f_phoenixchicken","need":{"chickenmeat":2,"phoenixpepper":1}},{"lv":10,"min":60,"out":"f_moontangyuan","need":{"rice":2,"sugar":1,"osmanthus":1}},{"lv":9,"min":60,"out":"f_amberpie","need":{"milk":1,"flour":1,"butter":1,"amberpumpkin":1}},{"lv":9,"min":60,"out":"f_figtart","need":{"fig":1,"flour":1,"butter":1}},{"lv":9,"min":120,"out":"f_starfeast","need":{"truffle":1,"vanilla":1,"starherb":1,"ostrichegg":1}},{"lv":9,"min":120,"out":"f_moonlotustea","need":{"tea":1,"honey":1,"moonlotus":1}},{"lv":9,"min":120,"out":"f_starlayercake","need":{"milk":1,"flour":1,"starherb":1,"whitestrawberry":2}},{"lv":10,"min":120,"out":"f_moonricecake","need":{"rice":3,"sugar":1,"osmanthus":1}},{"lv":9,"min":120,"out":"f_aurorasoda","need":{"honey":1,"lemon":1,"auroragrape":2}},{"lv":9,"min":120,"out":"f_phoenixpot","need":{"beef":1,"tofu":1,"garlic":1,"phoenixpepper":2}},{"lv":10,"min":30,"out":"f_peachsmoothie","need":{"milk":1,"honey":1,"peach":2}},{"lv":10,"min":30,"out":"f_peachjelly","need":{"peach":1,"sugar":1}},{"lv":10,"min":60,"out":"f_dragoneyestew","need":{"honey":1,"dragoneye":1,"chickenmeat":1}},{"lv":10,"min":60,"out":"f_starfruitjuice","need":{"honey":1,"starfruit":1}},{"lv":10,"min":60,"out":"f_roastchestnut","need":{"sugar":1,"chestnut":2}},{"lv":10,"min":120,"out":"f_peachfeast","need":{"honey":1,"peach":2,"goldrice":2,"goosemeat":1}},{"lv":10,"min":120,"out":"f_starstarfeast","need":{"chestnut":1,"starherb":1,"dragoneye":1,"moonlotus":1}},{"lv":2,"min":15,"out":"fd_scallion_minnow","need":{"scallion":2,"moon_minnow":1}},{"lv":2,"min":15,"out":"fd_fish_fried_rice","need":{"egg":1,"rice":1,"paper_boat_fish":1}},{"lv":3,"min":15,"out":"fd_tomato_carp","need":{"tomato":2,"cotton_carp":1}},{"lv":2,"min":15,"out":"fd_sweet_perch","need":{"corn":1,"honey_perch":1,"sweetpotato":1}},{"lv":5,"min":15,"out":"fd_bubble_egg","need":{"egg":1,"spinach":1,"bubble_fish":1}},{"lv":2,"min":15,"out":"fd_reed_bamboo","need":{"bamboo":1,"scallion":1,"reed_loach":1}},{"lv":4,"min":15,"out":"fd_chili_snapper","need":{"chili":1,"garlic":1,"match_snapper":1}},{"lv":3,"min":15,"out":"fd_daikon_catfish","need":{"daikon":2,"bun_catfish":1}},{"lv":3,"min":15,"out":"fd_pumpkin_congee","need":{"rice":1,"pumpkin":1,"dew_carp":1}},{"lv":3,"min":15,"out":"fd_bean_catfish","need":{"soybean":1,"bellpepper":1,"bean_sprout_catfish":1}},{"lv":2,"min":15,"out":"fd_cucumber_slipper","need":{"garlic":1,"cucumber":2,"slipper_fish":1}},{"lv":5,"min":15,"out":"fd_strawberry_salad","need":{"spinach":1,"strawberry":1,"strawberry_snapper":1}},{"lv":5,"min":20,"out":"fd_mushroom_rain","need":{"ginger":1,"shiitake":2,"rain_snapper":1}},{"lv":5,"min":20,"out":"fd_apple_maple","need":{"apple":1,"sugarcane":1,"maple_carp":1}},{"lv":5,"min":20,"out":"fd_onion_eel","need":{"ginger":1,"bell_eel":1,"yellowonion":1}},{"lv":5,"min":20,"out":"fd_mint_guppy","need":{"mint":1,"cucumber":1,"mint_guppy":1}},{"lv":5,"min":20,"out":"fd_coriander_goby","need":{"wheat":1,"coriander":1,"star_goby":1}},{"lv":5,"min":20,"out":"fd_woodear_carpenter","need":{"garlic":1,"woodear":1,"carpenter_fish":1}},{"lv":5,"min":20,"out":"fd_cherry_trout","need":{"cherry":2,"sakura_trout":1}},{"lv":5,"min":20,"out":"fd_cabbage_hotpot","need":{"daikon":1,"cabbage":1,"snail_catfish":1}},{"lv":5,"min":20,"out":"fd_lemon_chime","need":{"basil":1,"lemon":1,"wind_chime_perch":1}},{"lv":5,"min":20,"out":"fd_orange_snapper","need":{"ginger":1,"orange":2,"honey_pomelo_snapper":1}},{"lv":5,"min":20,"out":"fd_tea_porcelain","need":{"tea":1,"rice":1,"porcelain_carp":1}},{"lv":5,"min":20,"out":"fd_carrot_lantern","need":{"carrot":1,"yellowonion":1,"paper_lantern_loach":1}},{"lv":5,"min":20,"out":"fd_corn_cloud","need":{"corn":2,"milk":1,"cloud_guppy":1}},{"lv":7,"min":30,"out":"fd_melon_jelly","need":{"mint":1,"melon":1,"lantern_jelly":1}},{"lv":7,"min":30,"out":"fd_woodear_ink","need":{"soybean":1,"woodear":2,"ink_shark":1}},{"lv":7,"min":30,"out":"fd_ginger_mackerel","need":{"ginger":1,"spinach":1,"glass_mackerel":1}},{"lv":7,"min":30,"out":"fd_yam_clay","need":{"yam":1,"chili":1,"clay_gator":1}},{"lv":7,"min":30,"out":"fd_soy_whale","need":{"milk":1,"soybean":2,"stalactite_whale":1}},{"lv":7,"min":30,"out":"fd_sugar_fish","need":{"sugarcane":1,"strawberry":1,"sugar_snapper":1}},{"lv":7,"min":30,"out":"fd_rosemary_salmon","need":{"potato":1,"rosemary":1,"spruce_salmon":1}},{"lv":7,"min":30,"out":"fd_crystal_mango","need":{"mint":1,"mango":1,"crystal_shrimp":1}},{"lv":7,"min":30,"out":"fd_pumpkin_amber","need":{"pumpkin":1,"sugarcane":1,"amber_perch":1}},{"lv":7,"min":30,"out":"fd_taro_nebula","need":{"tea":1,"taro":2,"nebula_anglerfish":1}},{"lv":7,"min":30,"out":"fd_lotus_bell","need":{"pork":1,"lotusroot":1,"bronze_bell_whale":1}},{"lv":7,"min":30,"out":"fd_okra_armor","need":{"okra":1,"garlic":1,"coral_armor_shark":1}},{"lv":9,"min":45,"out":"fd_clock_butter","need":{"milk":1,"wheat":2,"clock_carp":1}},{"lv":9,"min":45,"out":"fd_grape_aurora","need":{"grape":1,"coconut":1,"aurora_ray":1}},{"lv":9,"min":45,"out":"fd_banana_mirror","need":{"mango":1,"banana":1,"mirror_fish":1}},{"lv":9,"min":45,"out":"fd_coconut_turtle","need":{"coconut":1,"lingzhi":1,"starsea_turtle":1}},{"lv":9,"min":45,"out":"fd_ginger_frost","need":{"ginger":1,"lingzhi":1,"frost_dragon_carp":1}},{"lv":9,"min":45,"out":"fd_vanilla_backlight","need":{"milk":1,"vanilla":1,"backlight_whale":1}},{"lv":9,"min":45,"out":"fd_dragonfruit_wing","need":{"chili":1,"dragonfruit":1,"wing_mackerel":1}},{"lv":10,"min":60,"out":"fd_moonlotus_rice","need":{"goldrice":1,"moonlotus":1,"xuguang_fish":1}},{"lv":10,"min":60,"out":"fd_lingzhi_broth","need":{"daikon":2,"lingzhi":1,"dragon_bone_whale":1}},{"lv":10,"min":60,"out":"fd_lychee_counter","need":{"lychee":1,"goldapple":1,"counter_king":1}},{"lv":10,"min":60,"out":"fd_vanilla_mirror","need":{"vanilla":1,"auroragrape":1,"sky_mirror_whale":1}},{"lv":10,"min":60,"out":"fd_peach_white","need":{"peach":1,"ginger":1,"nameless_white_carp":1}},{"lv":10,"min":60,"out":"fd_coffee_cloud","need":{"cocoa":1,"coffee":1,"cloud_peak_shark":1}},{"out":"springroll","lv":4,"min":20,"need":{"cabbage":1,"carrot":1,"peanut":1},"season":"spring"},{"out":"bambooshootsoup","lv":2,"min":30,"need":{"bamboo":2,"pork":1},"season":"spring"},{"out":"watermelonslush","lv":6,"min":15,"need":{"watermelon":2,"sugar":1},"season":"summer"},{"out":"coldnoodle","lv":4,"min":20,"need":{"flour":1,"cucumber":1,"peanut":1},"season":"summer"},{"out":"pumpkinnoodle","lv":3,"min":20,"need":{"pumpkin":1,"rice":1,"shiitake":1},"season":"autumn"},{"out":"sweetpotatochicken","lv":1,"min":30,"need":{"sweetpotato":2,"chickenmeat":1},"season":"autumn"},{"out":"tangyuan","lv":4,"min":20,"need":{"rice":2,"sugar":1,"peanut":1},"season":"winter"},{"out":"winechicken","lv":5,"min":40,"need":{"chickenmeat":1,"ginger":2,"shiitake":1},"season":"winter"}]}$json$::jsonb; $function$;
grant execute on function public.doom_farm_cat() to authenticated;

create or replace function public.doom_buddy_new()
returns jsonb language sql immutable
as $function$ select $json$[{"id":"chef","name":"廚師阿姨","perk":"末世廚房做菜快 25%","emoji":"🧑‍🍳"},{"id":"shepherd","name":"牧羊女","perk":"牧場每次收成 +1","emoji":"👧"},{"id":"gardener","name":"園丁爺爺","perk":"果園和香草園收成 +1","emoji":"👴"},{"id":"fisher","name":"漁夫阿伯","perk":"魚塭養魚快 25%","emoji":"🎣"},{"id":"hunter","name":"獵人","perk":"殺喪屍拿到的精核 +25%","emoji":"🏹"},{"id":"nurse","name":"小護士","perk":"每天送你 1 份藥品","emoji":"👩‍⚕️"},{"id":"courier","name":"外送員","perk":"每天外送 1 份美食給你","emoji":"🛵"},{"id":"blackcat","name":"黑貓","perk":"幸運 +2","emoji":"🐈‍⬛"},{"id":"fox","name":"小狐狸","perk":"每天叼回 2 顆精核","emoji":"🦊"},{"id":"teacher","name":"退休老師","perk":"專注搜刮更容易撿到美食","emoji":"👩‍🏫"},{"id":"radio","name":"無線電少年","perk":"每天換回 💧3 和 🔩3","emoji":"📻"},{"id":"chick","name":"小雞嗶嗶","perk":"每天下 1 顆蛋（進作物倉庫）","emoji":"🐥"},{"id":"scarecrow","name":"稻草人阿秋","emoji":"🎃","perk":"每天送 3 份當季作物到作物倉庫","ltd":true},{"id":"snowball","name":"小雪人雪球","emoji":"⛄","perk":"每天送 1 張搜刮券","ltd":true},{"id":"luckycat","name":"招財貓","emoji":"🐱","perk":"每天送 💠3 精核和 🔩5 零件","ltd":true}]$json$::jsonb; $function$;

create or replace function public.doom_buddy_ex()
returns jsonb language sql immutable
as $function$ select $json${"talk":{"fox":["嗷嗚！（放下一顆亮晶晶）","（尾巴蓬蓬地掃過你的腳）","嘰？（歪頭）"],"chef":["吃飽了沒？沒吃飽不准出門。","今天的湯我多放了一點肉，噓。","讀書跟煮菜一樣，火候到了就好。"],"chick":["嗶嗶！","（跳到你的課本上）","嗶！（今天也下蛋了）"],"nurse":["量一下體溫……嗯，正常！","藥我放在你的櫃子裡了。","累了就休息，這是護理師的命令。"],"radio":["滋……滋……今天的訊號很清楚！","我用舊零件換了點水回來。","有人在聽嗎？……有，你在聽。"],"fisher":["魚不急，你也別急。","今天水色不錯，魚很有精神。","阿伯年輕時也考過試，考完就去捕魚了，哈哈。"],"hunter":["……外面安全了。","你專注的時候，喪屍都不敢靠近。","精核收好，別亂花。"],"courier":["您的外送到囉！","今天跑了三個區，路況還行。","五星好評記得給我喔～"],"teacher":["今天讀到哪裡了？","專心的人，運氣都不會太差。","老師以前也熬夜，後來學會早睡了。"],"blackcat":["喵。（今天運氣不錯）","……（盯著你看）","呼嚕。"],"gardener":["樹不會一天長大，人也是。","今天的檸檬特別酸，很好。","修剪是為了長得更好，不是懲罰。"],"shepherd":["小白今天多產了一點奶喔！","動物知道誰對牠們好。","你今天有好好吃飯嗎？羊都吃了喔。"],"scarecrow":["今年的收成，一定很好。","烏鴉？交給我。","你專心的樣子，跟稻穗一樣好看。"],"snowball":["下雪了！出去玩嗎？","我幫你在門口掃好雪了。","冷冷的，但心是暖的。"],"luckycat":["新年快樂！今年也發大財！","（招手）（招手）","紅包我先幫你收著。"]},"stories":{"fox":"小狐狸不知道從哪裡學會了撿亮晶晶的東西。牠把精核當成寶石，每天叼幾顆放在你門口。","chef":"阿姨以前在巷口開了二十年的自助餐。斷電那天，她用最後一桶瓦斯煮了一大鍋滷肉，分給整條街的人。","chick":"牠是從孵蛋器裡意外孵出來的，睜開眼第一個看到的是你，從此就把你當成媽媽。","nurse":"她是醫學院的實習生，末世來的那天剛好輪值。她背著整個藥櫃逃出醫院。","radio":"少年每天晚上都在頂樓調頻，想找到其他倖存者。他的對講機裡有幾十個城市的頻道。","fisher":"阿伯在港口捕了一輩子的魚。海變了顏色之後，他是第一個想到在頂樓水塔養魚的人。","hunter":"她沉默寡言，弓上刻著一排小小的記號。後來你才知道，那不是獵物的數量，是她救下的人。","courier":"他的機車箱裡永遠有一份還熱的便當。沒有人知道他是從哪裡弄來的。","teacher":"她教了四十年的書，退休那天，學生送她一整面牆的卡片。末世來了，她只帶走那些卡片。","blackcat":"大家都說黑貓會帶來厄運。牠來了以後，你的運氣反而越來越好。","gardener":"爺爺以前是植物園的園丁。植物園倒了，他只帶出一盆薄荷和一把剪刀。","shepherd":"她是從山上的牧場一路走下來的，身後跟著三隻羊，一隻都沒丟。","scarecrow":"阿秋本來只是田裡的稻草人。有一天你經過時跟他說了聲「辛苦了」，隔天他就跟著你回基地了。","snowball":"那年冬天第一場雪，你在基地門口堆了一個小雪人。第二天早上，它自己走進來取暖了。","luckycat":"招財貓是從廢墟裡的雜貨店救出來的，手還一直在招，好像在說「快進來」。"},"stories2":{"cat":"有一天牠叼回一塊舊的店員名牌。牠以前的家人沒有回來，但牠找到了新的家。","dog":"牠的項圈上刻著一個名字，不是牠的，是以前主人的。現在牠每天傍晚等的人，是你。","fox":"你發現牠在床底下藏了一整窩寶貝，最上面放著一張你弄丟的書籤。原來牠收藏的不是寶石，是跟你有關的東西。","owl":"貓頭鷹說牠數過了：你每多專注一天，天上就多亮一顆星。","chef":"她說她不怕末世，只怕有人沒飯吃。所以她每天都會攔住你問：「吃飽了沒？」你發現自己開始期待這句話。","chick":"牠長大了，還是每天跟在你腳邊。每天早上那顆蛋，是牠能給你最好的禮物。","nurse":"醫生說她是他見過最勇敢的實習生。她紅著臉說：「我只是不想讓任何人，因為缺一顆藥而難過。」","radio":"有一晚他衝進來大喊：「我聯絡到另一個基地了！他們也有一個每天專注的人！」你們都笑了，原來不是只有你在努力。","robot":"你終於找到那句話的作者：一個每天熬夜念書的學生寫給自己的。小機器人說：「現在換你了。」","doctor":"醫生終於睡了一個整覺。他說：「因為我知道，有人會把基地顧好。」","farmer":"父親的種子發芽了。農夫把第一顆番茄塞給你：「這是新世界的第一個收成，給你。」","fisher":"他說釣魚最重要的不是技術，是能等。「你等得了一條魚，就等得了你自己。」說完他把最大的那條魚留給你。","hunter":"有一天她把弓遞給你看，上面多了一道新的記號。她說：「這一道是你。是你讓我有地方可以回來。」","courier":"末世前他一天送一百單，從來沒看清楚客人的臉。現在他每天只送一單，送到你手上，看著你吃完才走。","teacher":"她開始在基地教小朋友認字，也在你讀書的時候安靜地陪著你。她說：「我最喜歡看學生專心的樣子，你現在就是。」","blackcat":"橘貓跟黑貓現在會一起睡在你的枕頭上，一邊一隻。你猜牠們以前就認識。","engineer":"工程師把那把螺絲起子送給你：「世界我修得差不多了，接下來，修你自己的人生吧。」","gardener":"那盆薄荷現在長滿了一整面牆。爺爺說：「你看，只要每天澆一點水，什麼都會長回來的。人也是。」","merchant":"老商人說他不走了。「走過那麼多城市，最後想停下來的，是有你在的這一座。」","shepherd":"她幫每隻動物都取了名字。她說，被叫名字的人（和羊）就不會走丟。最近，她也開始叫你的名字了。","scarecrow":"他說他守過很多季的稻田，只有這一季，他不再是一個人站在風裡。","snowball":"雪球說它不怕融化，因為就算變成水，也會變成你明天喝的那杯水。","luckycat":"你發現它招手的方向，永遠是基地大門。它在招的不是財，是每一個還在外面的倖存者。"},"bond_perk":{"fox":"每天叼回 4 顆精核","chef":"做菜改成快 40%","chick":"每天下 2 顆蛋","nurse":"每天送 2 份藥品","radio":"每天換回 💧6 和 🔩6","fisher":"養魚改成快 40%","hunter":"精核改成 +50%","courier":"每天外送 2 份美食","teacher":"撿到美食的機率再提高","blackcat":"幸運再 +2","gardener":"果園和香草園收成改成 +2","shepherd":"牧場收成改成 +2","scarecrow":"每天改送 6 份當季作物","snowball":"每天改送 2 張搜刮券","luckycat":"每天改送 💠6 精核和 🔩10 零件"}}$json$::jsonb; $function$;

create or replace function public.doom_ltd_cat()
returns jsonb language sql immutable
as $function$ select $json${"2026-11":{"name":"金秋豐收","emoji":"🍁","comp":"scarecrow","foods":["pumpkincan","chestnutcake","maplepancake"]},"2026-12":{"name":"星夜慶典","emoji":"🎄","comp":"snowball","foods":["applecider","yulelog","gingercookie"]},"2027-01":{"name":"新春","emoji":"🧧","comp":"luckycat","foods":["niangao","changnian","pineapplebox"]}}$json$::jsonb; $function$;
grant execute on function public.doom_ltd_cat() to authenticated;

create or replace function public.doom_season_cat()
returns jsonb language sql immutable
as $function$ select $json${"names":{"spring":"春天","summer":"夏天","autumn":"秋天","winter":"冬天"},"emoji":{"spring":"🌸","summer":"☀️","autumn":"🍁","winter":"❄️"},"crops":{"spring":["strawberry","bamboo","cabbage","pea","cherry","asparagus"],"summer":["watermelon","mango","cucumber","corn","lychee","bittermelon"],"autumn":["pumpkin","chestnut","persimmon","sweetpotato","taro"],"winter":["daikon","ginger","spinach","orange","garlic","cabbage"]}}$json$::jsonb; $function$;
grant execute on function public.doom_season_cat() to authenticated;

create or replace function public.doom_fach_cat()
returns jsonb language sql immutable
as $function$ select $json$[{"id":"cat_staple","name":"🍚 集齊主食","desc":"主食的 11 種都拿過","kind":"cat","cat":"staple","need":11,"gain":{"cores":25,"scav":3},"luck":0},{"id":"cat_can","name":"🥫 集齊罐頭","desc":"罐頭的 12 種都拿過","kind":"cat","cat":"can","need":12,"gain":{"cores":25,"scav":3},"luck":0},{"id":"cat_instant","name":"🍜 集齊即食","desc":"即食的 8 種都拿過","kind":"cat","cat":"instant","need":8,"gain":{"cores":25,"scav":3},"luck":0},{"id":"cat_bakery","name":"🥐 集齊麵包烘焙","desc":"麵包烘焙的 9 種都拿過","kind":"cat","cat":"bakery","need":9,"gain":{"cores":25,"scav":3},"luck":0},{"id":"cat_sweet","name":"🍰 集齊零食甜點","desc":"零食甜點的 17 種都拿過","kind":"cat","cat":"sweet","need":17,"gain":{"cores":25,"scav":3},"luck":0},{"id":"cat_fruit","name":"🍎 集齊水果","desc":"水果的 8 種都拿過","kind":"cat","cat":"fruit","need":8,"gain":{"cores":25,"scav":3},"luck":0},{"id":"cat_meat","name":"🍗 集齊熟食肉類","desc":"熟食肉類的 6 種都拿過","kind":"cat","cat":"meat","need":6,"gain":{"cores":25,"scav":3},"luck":0},{"id":"cat_drink","name":"🥤 集齊飲料","desc":"飲料的 10 種都拿過","kind":"cat","cat":"drink","need":10,"gain":{"cores":25,"scav":3},"luck":0},{"id":"cat_hot","name":"☕ 集齊熱飲","desc":"熱飲的 6 種都拿過","kind":"cat","cat":"hot","need":6,"gain":{"cores":25,"scav":3},"luck":0},{"id":"cat_rare","name":"🌟 集齊珍品","desc":"珍品的 4 種都拿過","kind":"cat","cat":"rare","need":4,"gain":{"cores":25,"scav":3},"luck":0},{"id":"cat_med","name":"💊 集齊藥品","desc":"藥品的 7 種都拿過","kind":"cat","cat":"med","need":7,"gain":{"cores":25,"scav":3},"luck":0},{"id":"cat_home","name":"🏠 集齊家常菜","desc":"家常菜的 46 種都拿過","kind":"cat","cat":"home","need":46,"gain":{"cores":60,"scav":5},"luck":1},{"id":"cat_skill","name":"👨‍🍳 集齊拿手菜","desc":"拿手菜的 45 種都拿過","kind":"cat","cat":"skill","need":45,"gain":{"cores":60,"scav":5},"luck":1},{"id":"cat_sig","name":"⭐ 集齊招牌菜","desc":"招牌菜的 28 種都拿過","kind":"cat","cat":"sig","need":28,"gain":{"cores":60,"scav":5},"luck":1},{"id":"cat_legend","name":"👑 集齊傳說料理","desc":"傳說料理的 8 種都拿過","kind":"cat","cat":"legend","need":8,"gain":{"cores":25,"scav":3},"luck":0},{"id":"cat_fishd","name":"🐟 集齊魚料理","desc":"魚料理的 50 種都拿過","kind":"cat","cat":"fishd","need":50,"gain":{"cores":60,"scav":5},"luck":1},{"id":"cat_season","name":"🍂 集齊季節料理","desc":"季節料理的 8 種都拿過","kind":"cat","cat":"season","need":8,"gain":{"cores":25,"scav":3},"luck":0},{"id":"cat_ltd","name":"🌟 集齊每月限定","desc":"每月限定的 9 種都拿過","kind":"cat","cat":"ltd","need":9,"gain":{"cores":25,"scav":3},"luck":0},{"id":"eat_20","name":"🍽️ 吃過 20 種","desc":"不同的美食吃過 20 種","kind":"eat","need":20,"gain":{"cores":30,"scav":1},"luck":0},{"id":"eat_50","name":"🍽️ 吃過 50 種","desc":"不同的美食吃過 50 種","kind":"eat","need":50,"gain":{"cores":60,"scav":2},"luck":1},{"id":"eat_100","name":"🍽️ 吃過 100 種","desc":"不同的美食吃過 100 種","kind":"eat","need":100,"gain":{"cores":100,"scav":5},"luck":1},{"id":"eat_150","name":"🍽️ 吃過 150 種","desc":"不同的美食吃過 150 種","kind":"eat","need":150,"gain":{"cores":150,"scav":7},"luck":1},{"id":"eat_200","name":"🍽️ 吃過 200 種","desc":"不同的美食吃過 200 種","kind":"eat","need":200,"gain":{"cores":200,"scav":10},"luck":2},{"id":"legend_all","name":"👑 傳說美食家","desc":"傳說料理和傳說珍品 10 種全部吃過","kind":"list","list":["auroratea","feast","f_starfeast","f_moonlotustea","f_starlayercake","f_peachfeast","f_moonricecake","f_aurorasoda","f_phoenixpot","f_starstarfeast"],"need":10,"gain":{"cores":300,"scav":15},"luck":2},{"id":"dream_1","name":"🌈 第一道夢幻料理","desc":"做出任何一道夢幻料理","kind":"list","list":["dream_rainbow","dream_moon","dream_galaxy"],"need":1,"gain":{"cores":50},"luck":1}]$json$::jsonb; $function$;
grant execute on function public.doom_fach_cat() to authenticated;

create or replace function public.doom_dream_cat()
returns jsonb language sql immutable
as $function$ select $json$[{"id":"dream_rainbow","need":[{"cat":"legend","n":3}],"res":{"food":20},"eff":["luck","harvest"],"desc":"今天幸運 +10、農場收成每格 +1"},{"id":"dream_moon","need":[{"cat":"legend","n":2},{"cat":"rare","n":1}],"res":{"food":20},"eff":["cores"],"desc":"今天殺喪屍的精核 ×2"},{"id":"dream_galaxy","need":[{"id":"feast","n":1},{"cat":"legend","n":2}],"res":{"food":30,"water":30},"eff":["luck","harvest","cores","big"],"desc":"今天幸運 +10、收成 +1、精核 ×2，再加士氣 30、基地 20"}]$json$::jsonb; $function$;
grant execute on function public.doom_dream_cat() to authenticated;

-- 現在是哪一季
create or replace function public.doom_season()
returns text language sql stable
as $function$
  select case when extract(month from public.app_today())::int in (3, 4, 5) then 'spring'
              when extract(month from public.app_today())::int in (6, 7, 8) then 'summer'
              when extract(month from public.app_today())::int in (9, 10, 11) then 'autumn' else 'winter' end;
$function$;

create or replace function public.doom_in_season(p_crop text)
returns boolean language sql stable
as $function$ select coalesce(public.doom_season_cat()->'crops'->public.doom_season() ? p_crop, false); $function$;

-- 今天有沒有夢幻料理的效果
create or replace function public.doom_dream_on(st public.doom_state, p_eff text)
returns boolean language sql stable
as $function$
  select coalesce(st.dream->>'day' = public.app_today()::text and (st.dream->'eff') ? p_eff, false);
$function$;

-- 限定夥伴不會從隨機的「新同伴」出現
do $do$ begin
  if to_regprocedure('public.doom_apply_base(uuid, jsonb, text)') is null then
    alter function public.doom_apply(uuid, jsonb, text) rename to doom_apply_base;
  end if;
end $do$;
revoke all on function public.doom_apply_base(uuid, jsonb, text) from public, authenticated, anon;

create or replace function public.doom_apply(u uuid, g jsonb, src text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare st public.doom_state%rowtype; pick text;
begin
  if g ? 'companion' and g->>'companion' = 'random' then
    select * into st from public.doom_state where user_id = u;
    select el->>'id' into pick from jsonb_array_elements(public.doom_catalog()->'companions') el
      where not coalesce((el->>'ltd')::boolean, false) and not st.companions ? (el->>'id') order by random() limit 1;
    if pick is not null then g := g || jsonb_build_object('companion', pick); end if;
  end if;
  return public.doom_apply_base(u, g, src);
end;
$function$;
revoke all on function public.doom_apply(uuid, jsonb, text) from public, authenticated, anon;

-- 🍀 幸運：黑貓＋美食成就＋夢幻料理
create or replace function public.doom_luck(u uuid)
returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare st public.doom_state%rowtype;
begin
  select * into st from public.doom_state where user_id = u;
  if not found then return public.doom_luck_base(u); end if;
  return public.doom_luck_base(u) + public.doom_buddy(st, 'blackcat') * 2
    + coalesce((st.rewards->>'fach_luck')::int, 0)
    + case when public.doom_dream_on(st, 'luck') then 10 else 0 end;
end;
$function$;
revoke all on function public.doom_luck(uuid) from public, authenticated, anon;

-- 🧟 喪屍：獵人加成＋夢幻料理精核 ×2
create or replace function public.doom_zombies(u uuid, p_min integer)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare st public.doom_state%rowtype; r jsonb; b integer; base integer; bonus integer := 0;
begin
  r := public.doom_zombies_base(u, p_min);
  if r is null then return r; end if;
  select * into st from public.doom_state where user_id = u;
  base := coalesce((r->>'cores')::int, 0);
  b := public.doom_buddy(st, 'hunter');
  if b > 0 then bonus := ceil(base * case b when 2 then 0.5 else 0.25 end)::int; end if;
  if public.doom_dream_on(st, 'cores') then bonus := bonus + base; end if;
  if bonus > 0 then update public.doom_state set cores = cores + bonus where user_id = u; end if;
  return r || jsonb_build_object('cores', base + bonus, 'hunter', bonus);
end;
$function$;
revoke all on function public.doom_zombies(uuid, integer) from public, authenticated, anon;

-- 🎲 撿美食：30% 料理（季節料理、夢幻料理不會掉）；這個月的限定美食 15%
create or replace function public.doom_pantry_roll(u uuid, p_zone text, p_chance numeric)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  cat jsonb := public.doom_food_cat();
  tier text; e jsonb := null; have integer; r numeric;
  mon text := to_char(public.app_today(), 'YYYY-MM');
begin
  if random() >= p_chance then return null; end if;
  tier := public.doom_roll_tier(public.doom_luck(u));
  r := random();
  if r < 0.15 then
    select el into e from jsonb_array_elements(cat->'items') el where el->>'ltd' = mon order by random() limit 1;
  elsif r < 0.45 then
    select el into e from jsonb_array_elements(cat->'items') el
      where el ? 'cook' and not (el ? 'season') and not (el ? 'dream') and el->>'t' = tier order by random() limit 1;
    if e is null then
      select el into e from jsonb_array_elements(cat->'items') el
        where el ? 'cook' and not (el ? 'season') and not (el ? 'dream') and position(el->>'t' in 'crlxs') <= position(tier in 'crlxs')
        order by position(el->>'t' in 'crlxs') desc, random() limit 1;
    end if;
  end if;
  if e is null and p_zone is not null and random() < 0.6 then
    select el into e from jsonb_array_elements(cat->'items') el
      where not (el ? 'cook') and not (el ? 'scav') and not (el ? 'ltd') and el->>'t' = tier
        and exists (select 1 from jsonb_array_elements(cat->'cats') c where c->>'id' = el->>'c' and c->'zones' ? p_zone)
      order by random() limit 1;
  end if;
  if e is null then select el into e from jsonb_array_elements(cat->'items') el where not (el ? 'cook') and not (el ? 'scav') and not (el ? 'ltd') and el->>'t' = tier order by random() limit 1; end if;
  if e is null then select el into e from jsonb_array_elements(cat->'items') el where not (el ? 'cook') and not (el ? 'scav') and not (el ? 'ltd') and el->>'t' = 'c' order by random() limit 1; end if;
  select coalesce((pantry->>(e->>'id'))::int, 0) into have from public.doom_state where user_id = u;
  update public.doom_state set pantry = pantry || jsonb_build_object(e->>'id', have + 1),
    fgot = fgot || jsonb_build_object(e->>'id', 1) where user_id = u;
  return jsonb_build_object('id', e->>'id', 'name', e->>'name', 'emoji', e->>'emoji', 'tier', e->>'t', 'new', have = 0
    and not exists (select 1 from public.doom_state where user_id = u and eaten ? (e->>'id')));
end;
$function$;
revoke all on function public.doom_pantry_roll(uuid, text, numeric) from public, authenticated, anon;

-- 🌱 種／養：當季作物快 20%
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
  if public.doom_in_season(p_crop) then mins := mins * 0.8; end if;
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

-- 🧺 收：當季 +1、夢幻料理 +1
create or replace function public.doom_farm_harvest()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  cat jsonb := public.doom_farm_cat();
  st public.doom_state%rowtype;
  p jsonb; c jsonb; keep jsonb := '[]'::jsonb; got jsonb := '{}'::jsonb; q integer; bonus integer; fmin integer;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint; k text; area text; b_shep integer; b_gard integer; dr integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  select coalesce(sum(duration_seconds), 0) / 60 into fmin from public.focus_sessions where user_id = u and session_date = public.app_today();
  bonus := case when fmin >= 60 then 1 else 0 end;
  dr := case when public.doom_dream_on(st, 'harvest') then 1 else 0 end;
  b_shep := public.doom_buddy(st, 'shepherd');
  b_gard := public.doom_buddy(st, 'gardener');
  for p in select x from jsonb_array_elements(coalesce(st.dfarm->'plots', '[]'::jsonb)) x loop
    if (p->>'t1')::bigint > now_ms then keep := keep || p; continue; end if;
    select el into c from jsonb_array_elements(cat->'crops') el where el->>'id' = p->>'crop';
    if c is null then continue; end if;
    area := coalesce(c->>'a', 'field');
    q := (c->>'yield')::int + bonus + dr
      + case when area = 'ranch' then b_shep when area in ('orchard', 'herb') then b_gard else 0 end
      + case when public.doom_in_season(c->>'id') then 1 else 0 end;
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

-- 🍳 做菜：季節料理只有當季做得出來
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
  if r ? 'season' and r->>'season' <> public.doom_season() then
    raise exception '這是%的季節料理，現在做不出來', public.doom_season_cat()->'names'->>(r->>'season');
  end if;
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

-- 🎁 夥伴每天的禮物（加上限定夥伴）
create or replace function public.doom_buddy_daily(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  st public.doom_state%rowtype; today date := public.app_today(); gifts jsonb := '[]'::jsonb;
  b integer; i integer; x jsonb; n integer; k text;
begin
  select * into st from public.doom_state where user_id = u for update;
  if not found or st.buddy_day = today then return gifts; end if;
  update public.doom_state set buddy_day = today where user_id = u;
  b := public.doom_buddy(st, 'nurse');
  for i in 1..b loop
    select el into x from jsonb_array_elements(public.doom_food_cat()->'items') el where el->>'c' = 'med' and el->>'t' in ('c', 'r') order by random() limit 1;
    if x is not null then
      perform public.doom_pantry_add(u, x->>'id', 1);
      gifts := gifts || jsonb_build_object('who', 'nurse', 'id', x->>'id', 'name', x->>'name', 'emoji', x->>'emoji', 'n', 1);
    end if;
  end loop;
  b := public.doom_buddy(st, 'courier');
  for i in 1..b loop
    x := public.doom_pantry_roll(u, null, 1.0);
    if x is not null then gifts := gifts || (x || jsonb_build_object('who', 'courier', 'n', 1)); end if;
  end loop;
  b := public.doom_buddy(st, 'fox');
  if b > 0 then
    update public.doom_state set cores = cores + 2 * b where user_id = u;
    gifts := gifts || jsonb_build_object('who', 'fox', 'name', '精核', 'emoji', '💠', 'n', 2 * b);
  end if;
  b := public.doom_buddy(st, 'radio');
  if b > 0 then
    perform public.doom_apply(u, jsonb_build_object('water', 3 * b, 'parts', 3 * b), 'doom-buddy:radio:' || today);
    gifts := gifts || jsonb_build_object('who', 'radio', 'name', '水', 'emoji', '💧', 'n', 3 * b);
    gifts := gifts || jsonb_build_object('who', 'radio', 'name', '零件', 'emoji', '🔩', 'n', 3 * b);
  end if;
  b := public.doom_buddy(st, 'chick');
  if b > 0 then
    update public.doom_state set dcrops = dcrops || jsonb_build_object('egg', coalesce((dcrops->>'egg')::int, 0) + b) where user_id = u;
    gifts := gifts || jsonb_build_object('who', 'chick', 'name', '雞蛋', 'emoji', '🥚', 'n', b);
  end if;
  -- 🎃 稻草人阿秋：當季作物
  b := public.doom_buddy(st, 'scarecrow');
  for i in 1..(3 * b) loop
    select value #>> '{}' into k from jsonb_array_elements(public.doom_season_cat()->'crops'->public.doom_season()) order by random() limit 1;
    if k is not null then
      update public.doom_state set dcrops = dcrops || jsonb_build_object(k, coalesce((dcrops->>k)::int, 0) + 1) where user_id = u;
      gifts := gifts || jsonb_build_object('who', 'scarecrow', 'name', coalesce((select el->>'name' from jsonb_array_elements(public.doom_farm_cat()->'crops') el where el->>'id' = k), k), 'emoji', '🌾', 'n', 1);
    end if;
  end loop;
  -- ⛄ 小雪人：搜刮券
  b := public.doom_buddy(st, 'snowball');
  if b > 0 then
    perform public.doom_apply(u, jsonb_build_object('scav', b), 'doom-buddy:snowball:' || today);
    gifts := gifts || jsonb_build_object('who', 'snowball', 'name', '搜刮券', 'emoji', '🎟️', 'n', b);
  end if;
  -- 🐱 招財貓：精核和零件
  b := public.doom_buddy(st, 'luckycat');
  if b > 0 then
    update public.doom_state set cores = cores + 3 * b where user_id = u;
    perform public.doom_apply(u, jsonb_build_object('parts', 5 * b), 'doom-buddy:luckycat:' || today);
    gifts := gifts || jsonb_build_object('who', 'luckycat', 'name', '精核', 'emoji', '💠', 'n', 3 * b);
    gifts := gifts || jsonb_build_object('who', 'luckycat', 'name', '零件', 'emoji', '🔩', 'n', 5 * b);
  end if;
  return gifts;
end;
$function$;
revoke all on function public.doom_buddy_daily(uuid) from public, authenticated, anon;

-- 🧑‍🍳 居民廚師：爐子空了就做最愛料理
create or replace function public.doom_chef_run(u uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare st public.doom_state%rowtype; favs jsonb; d text; made jsonb := '[]'::jsonb; tries integer := 0; r json; anyc boolean;
begin
  select * into st from public.doom_state where user_id = u;
  if not found or not coalesce((st.chef->>'on')::boolean, false) then return made; end if;
  favs := coalesce(st.chef->'dishes', '[]'::jsonb);
  if jsonb_array_length(favs) = 0 then return made; end if;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('test.uid', u::text, true);
  <<outer>>
  loop
    tries := tries + 1;
    exit when tries > 6;
    anyc := false;
    for d in select value #>> '{}' from jsonb_array_elements(favs) loop
      begin
        r := public.doom_farm_cook(d, 5);
        made := made || jsonb_build_object('out', d, 'n', (r->>'n')::int);
        anyc := true;
      exception when others then
        if sqlerrm like '%爐子都在用%' then exit outer; end if;
      end;
    end loop;
    exit when not anyc;
  end loop;
  if jsonb_array_length(made) > 0 then
    update public.doom_state set chef = chef || jsonb_build_object('last', jsonb_build_object('at', now(), 'made', made)) where user_id = u;
  end if;
  return made;
end;
$function$;
revoke all on function public.doom_chef_run(uuid) from public, authenticated, anon;

create or replace function public.doom_chef_save(p jsonb)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); o jsonb; d jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  d := coalesce(p->'dishes', null);
  if d is not null and jsonb_array_length(d) > 3 then raise exception '最多 3 道'; end if;
  update public.doom_state set chef = chef || jsonb_strip_nulls(jsonb_build_object('on', (p->>'on')::boolean, 'dishes', d))
    where user_id = u returning chef into o;
  perform public.doom_chef_run(u);
  return o::json;
end;
$function$;
grant execute on function public.doom_chef_save(jsonb) to authenticated;

-- 🌈 夢幻料理：合成
create or replace function public.doom_dream_make(p_id text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid(); st public.doom_state%rowtype; d jsonb; nd jsonb; cat jsonb := public.doom_food_cat();
  take jsonb := '{}'::jsonb; e record; need integer; k text; v int;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  select el into d from jsonb_array_elements(public.doom_dream_cat()) el where el->>'id' = p_id;
  if d is null then raise exception '沒有這道夢幻料理'; end if;
  for nd in select x from jsonb_array_elements(d->'need') x loop
    need := (nd->>'n')::int;
    if nd ? 'id' then
      if coalesce((st.pantry->>(nd->>'id'))::int, 0) - coalesce((take->>(nd->>'id'))::int, 0) < need then
        raise exception '缺少%', (select el->>'name' from jsonb_array_elements(cat->'items') el where el->>'id' = nd->>'id');
      end if;
      take := take || jsonb_build_object(nd->>'id', coalesce((take->>(nd->>'id'))::int, 0) + need);
    else
      -- 這一類裡挑不同的料理，先用數量最多的
      for e in select el->>'id' as id from jsonb_array_elements(cat->'items') el
               where el->>'c' = nd->>'cat' and coalesce((st.pantry->>(el->>'id'))::int, 0) - coalesce((take->>(el->>'id'))::int, 0) > 0
               order by coalesce((st.pantry->>(el->>'id'))::int, 0) desc loop
        exit when need <= 0;
        take := take || jsonb_build_object(e.id, coalesce((take->>e.id)::int, 0) + 1);
        need := need - 1;
      end loop;
      if need > 0 then raise exception '%不夠（還差 % 道）', (select c->>'name' from jsonb_array_elements(cat->'cats') c where c->>'id' = nd->>'cat'), need; end if;
    end if;
  end loop;
  for k, v in select key, value::int from jsonb_each_text(coalesce(d->'res', '{}'::jsonb)) loop
    if (case k when 'food' then st.food when 'water' then st.water else 0 end) < v then raise exception '%不夠', case k when 'food' then '食物' else '水' end; end if;
  end loop;
  for k, v in select key, value::int from jsonb_each_text(take) loop
    update public.doom_state set pantry = case when (pantry->>k)::int <= v then pantry - k else pantry || jsonb_build_object(k, (pantry->>k)::int - v) end where user_id = u;
  end loop;
  if d ? 'res' then perform public.doom_apply(u, public.doom_neg(d->'res'), 'doom-dream:' || gen_random_uuid()); end if;
  perform public.doom_pantry_add(u, p_id, 1);
  update public.doom_state set fgot = fgot || jsonb_build_object(p_id, 1) where user_id = u;
  perform public.doom_log_add(u, 'draw', 's', '做出了夢幻料理：' || (select el->>'name' from jsonb_array_elements(cat->'items') el where el->>'id' = p_id) || '！');
  return json_build_object('id', p_id, 'used', take);
end;
$function$;
grant execute on function public.doom_dream_make(text) to authenticated;

-- 🌈 夢幻料理：享用（今天一整天有效）
create or replace function public.doom_dream_use(p_id text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); st public.doom_state%rowtype; d jsonb; eff jsonb; today text := public.app_today()::text;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  select el into d from jsonb_array_elements(public.doom_dream_cat()) el where el->>'id' = p_id;
  if d is null then raise exception '這不是夢幻料理'; end if;
  if coalesce((st.pantry->>p_id)::int, 0) < 1 then raise exception '食物櫃裡沒有這道'; end if;
  update public.doom_state set pantry = case when (pantry->>p_id)::int <= 1 then pantry - p_id else pantry || jsonb_build_object(p_id, (pantry->>p_id)::int - 1) end,
    eaten = eaten || jsonb_build_object(p_id, coalesce((eaten->>p_id)::int, 0) + 1) where user_id = u;
  eff := d->'eff';
  if st.dream->>'day' = today then
    eff := (select jsonb_agg(distinct x) from (select jsonb_array_elements(coalesce(st.dream->'eff', '[]'::jsonb)) x union select jsonb_array_elements(d->'eff')) q);
  end if;
  update public.doom_state set dream = jsonb_build_object('day', today, 'eff', eff, 'last', p_id) where user_id = u;
  if (d->'eff') ? 'big' then perform public.doom_apply(u, '{"morale":30,"hp":20}'::jsonb, 'doom-dream-use:' || gen_random_uuid()); end if;
  return json_build_object('id', p_id, 'eff', eff);
end;
$function$;
grant execute on function public.doom_dream_use(text) to authenticated;

-- 🏅 美食成就：進度
create or replace function public.doom_fach_progress(st public.doom_state, a jsonb)
returns integer language sql stable
as $function$
  select case a->>'kind'
    when 'cat' then (select count(*)::int from jsonb_array_elements(public.doom_food_cat()->'items') el
                     where el->>'c' = a->>'cat' and (st.fgot ? (el->>'id') or st.eaten ? (el->>'id') or coalesce((st.pantry->>(el->>'id'))::int, 0) > 0))
    when 'eat' then (select count(*)::int from jsonb_object_keys(st.eaten))
    when 'list' then (select count(*)::int from jsonb_array_elements_text(a->'list') x where st.eaten ? x or (a->>'id' = 'dream_1' and st.fgot ? x))
    else 0 end;
$function$;

create or replace function public.doom_fach_claim(p_id text)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); st public.doom_state%rowtype; a jsonb; applied jsonb; key text := 'fach:' || p_id;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  select el into a from jsonb_array_elements(public.doom_fach_cat()) el where el->>'id' = p_id;
  if a is null then raise exception '沒有這個成就'; end if;
  if st.rewards ? key then raise exception '已經領過了'; end if;
  if public.doom_fach_progress(st, a) < (a->>'need')::int then raise exception '還沒達成'; end if;
  update public.doom_state set rewards = rewards || jsonb_build_object(key, public.app_today(),
    'fach_luck', coalesce((rewards->>'fach_luck')::int, 0) + coalesce((a->>'luck')::int, 0)) where user_id = u;
  if a->'gain' ? 'cores' then update public.doom_state set cores = cores + (a->'gain'->>'cores')::int where user_id = u; end if;
  applied := public.doom_apply(u, (a->'gain') - 'cores'::text, 'doom-fach:' || p_id);
  perform public.doom_log_add(u, 'draw', 'x', '達成美食成就「' || (a->>'name') || '」！');
  return json_build_object('id', p_id, 'gains', applied, 'cores', a->'gain'->'cores', 'luck', a->'luck');
end;
$function$;
grant execute on function public.doom_fach_claim(text) to authenticated;

-- 🌟 每月限定：這個月專注滿 10 小時，帶限定夥伴回家
create or replace function public.doom_ltd_claim()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); st public.doom_state%rowtype; mon text := to_char(public.app_today(), 'YYYY-MM'); m jsonb; mins integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  m := public.doom_ltd_cat()->mon;
  if m is null then raise exception '這個月沒有限定夥伴'; end if;
  if st.companions ? (m->>'comp') then raise exception '已經帶回家了'; end if;
  select coalesce(sum(duration_seconds), 0) / 60 into mins from public.focus_sessions
    where user_id = u and to_char(session_date, 'YYYY-MM') = mon;
  if mins < 600 then raise exception '這個月專注還差 % 分鐘', 600 - mins; end if;
  update public.doom_state set companions = companions || to_jsonb(m->>'comp') where user_id = u;
  perform public.doom_log_add(u, 'draw', 's', '本月限定夥伴加入了！');
  return json_build_object('id', m->>'comp');
end;
$function$;
grant execute on function public.doom_ltd_claim() to authenticated;

-- 🔁 末世復刻：5 張搜刮券抽一次過去月份的限定（夥伴、限定美食，還沒有的優先）
create or replace function public.doom_ltd_retro()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid(); st public.doom_state%rowtype; mon text := to_char(public.app_today(), 'YYYY-MM');
  comps text[]; foods text[]; pick text; kind text; cat jsonb := public.doom_food_cat(); have integer;
begin
  if u is null then raise exception '尚未登入'; end if;
  select * into st from public.doom_state where user_id = u for update;
  select array_agg(m.value->>'comp') filter (where not st.companions ? (m.value->>'comp')) into comps
    from jsonb_each(public.doom_ltd_cat()) m where m.key < mon;
  select array_agg(f) into foods from jsonb_each(public.doom_ltd_cat()) m, jsonb_array_elements_text(m.value->'foods') f where m.key < mon;
  if foods is null then raise exception '還沒有過期的月份，下個月開始就能復刻'; end if;
  if st.scav < 5 then raise exception '搜刮券不夠（要 5 張）'; end if;
  update public.doom_state set scav = scav - 5 where user_id = u;
  if comps is not null and random() < 0.2 then
    pick := comps[1 + floor(random() * array_length(comps, 1))::int]; kind := 'companion';
    update public.doom_state set companions = companions || to_jsonb(pick) where user_id = u;
    perform public.doom_log_add(u, 'draw', 's', '復刻帶回了限定夥伴！');
  else
    -- 還沒拿過的優先
    select f into pick from unnest(foods) f order by (st.fgot ? f or st.eaten ? f), random() limit 1;
    kind := 'food';
    have := coalesce((st.pantry->>pick)::int, 0);
    perform public.doom_pantry_add(u, pick, 2);
    update public.doom_state set fgot = fgot || jsonb_build_object(pick, 1) where user_id = u;
  end if;
  return json_build_object('kind', kind, 'id', pick, 'n', case when kind = 'food' then 2 else 1 end);
end;
$function$;
grant execute on function public.doom_ltd_retro() to authenticated;

-- 📋 一次拿齊：季節、廚師、夢幻料理、美食成就、每月限定
create or replace function public.doom_fextra_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid(); st public.doom_state%rowtype; mon text := to_char(public.app_today(), 'YYYY-MM'); mins integer; ach jsonb;
begin
  if u is null then raise exception '尚未登入'; end if;
  perform public.doom_ensure(u);
  update public.doom_state set fgot = fgot || coalesce((select jsonb_object_agg(key, 1) from jsonb_each_text(pantry) where value::int > 0), '{}'::jsonb)
    where user_id = u;
  select * into st from public.doom_state where user_id = u;
  select coalesce(sum(duration_seconds), 0) / 60 into mins from public.focus_sessions where user_id = u and to_char(session_date, 'YYYY-MM') = mon;
  select coalesce(jsonb_agg(a || jsonb_build_object('prog', least((a->>'need')::int, public.doom_fach_progress(st, a)), 'claimed', st.rewards ? ('fach:' || (a->>'id')))), '[]'::jsonb)
    into ach from jsonb_array_elements(public.doom_fach_cat()) a;
  return json_build_object(
    'season', public.doom_season(), 'season_cat', public.doom_season_cat(),
    'chef', st.chef, 'dream', st.dream, 'dream_cat', public.doom_dream_cat(), 'today', public.app_today(),
    'ach', ach, 'fach_luck', coalesce((st.rewards->>'fach_luck')::int, 0),
    'ltd', json_build_object('month', mon, 'cat', public.doom_ltd_cat(), 'focus_min', mins,
      'retro', exists (select 1 from jsonb_each(public.doom_ltd_cat()) m where m.key < mon)),
    'fgot', st.fgot);
end;
$function$;
grant execute on function public.doom_fextra_status() to authenticated;

-- 打開末世時：夥伴禮物、居民廚師
create or replace function public.doom_status()
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare u uuid := auth.uid(); gifts jsonb := '[]'::jsonb; chef jsonb := '[]'::jsonb; st public.doom_state%rowtype;
begin
  if u is not null then
    perform public.doom_ensure(u);
    gifts := public.doom_buddy_daily(u);
    begin chef := public.doom_chef_run(u); exception when others then chef := '[]'::jsonb; end;
  end if;
  select * into st from public.doom_state where user_id = u;
  return (public.doom_status_base()::jsonb || jsonb_build_object('buddy_gifts', gifts, 'chef_made', chef,
    'auto', coalesce(st.auto, '{}'::jsonb), 'auto_last', st.auto_last))::json;
end;
$function$;
grant execute on function public.doom_status() to authenticated;
