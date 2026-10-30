-- =========================================================
-- 序光計畫：☢️ 末世：🔎 搜刮到的食物也放進食物櫃
-- 要在「2026-10-30_末世_星露島料理.sql」之後執行（它和之前的美食／異能／農場檔都要先跑過）。可以重複執行。
--
--   搜刮、抽獎、補給箱、鑑定撿到的食物類物資，和生活小物裡的零食、罐頭，現在都會「多一份」放進食物櫃
--   （原本給的資源、收藏一樣照給）
--   跟食物櫃重複的（礦泉水、御飯糰、軍糧、珍珠奶茶…）直接加到原本那一項；沒有的新增 26 種
--   冰櫃、販賣機、罐頭架、藥局這類「一整批」的，會從那個分類隨機給好幾份
--   米、番茄、香草、溫室給的是末世農場的作物（可以拿去廚房做菜）
--   這個檔會覆蓋 doom_food_cat、doom_pantry_roll、doom_seen、doom_run_claim、doom_draw；
--   之後如果重跑前面的末世檔，最後要再跑一次這個檔
-- =========================================================

create or replace function public.doom_food_cat()
returns jsonb language sql immutable
as $function$
select $json${"cats":[{"id":"staple","name":"主食","emoji":"🍚","zones":["market","night_market","subway"]},{"id":"can","name":"罐頭","emoji":"🥫","zones":["bunker","military","market"]},{"id":"instant","name":"即食","emoji":"🍜","zones":["subway","military","street"]},{"id":"bakery","name":"麵包烘焙","emoji":"🥐","zones":["market","street","library"]},{"id":"sweet","name":"零食甜點","emoji":"🍰","zones":["night_market","market","library"]},{"id":"fruit","name":"水果","emoji":"🍎","zones":["rooftop","market","waterworks"]},{"id":"meat","name":"熟食肉類","emoji":"🍗","zones":["night_market","military","hardware"]},{"id":"drink","name":"飲料","emoji":"🥤","zones":["market","waterworks","street"]},{"id":"hot","name":"熱飲","emoji":"☕","zones":["library","hospital","observatory"]},{"id":"rare","name":"珍品","emoji":"🌟","zones":["observatory","bunker","rooftop"]},{"id":"med","name":"藥品","emoji":"💊","zones":["hospital","bunker","military"]},{"id":"home","name":"家常菜","emoji":"🏠","zones":[]},{"id":"skill","name":"拿手菜","emoji":"👨‍🍳","zones":[]},{"id":"sig","name":"招牌菜","emoji":"⭐","zones":[]},{"id":"legend","name":"傳說料理","emoji":"👑","zones":[]}],"items":[{"c":"staple","k":"food","t":"c","id":"onigiri","name":"鮭魚飯糰","text":"包裝有點皺，裡面還是很香。","emoji":"🍙"},{"c":"staple","k":"food","t":"c","id":"friedrice","name":"蛋炒飯","text":"粒粒分明，吃得到鍋氣。","emoji":"🍳"},{"c":"staple","k":"food","t":"c","id":"potsticker","name":"煎餃","text":"底部煎得酥脆。","emoji":"🥟"},{"c":"staple","k":"food","t":"r","id":"lurou","name":"滷肉飯","text":"台灣的味道，吃了會想家。","emoji":"🍚"},{"c":"staple","k":"food","t":"r","id":"curry","name":"咖哩飯","text":"辣得剛剛好。","emoji":"🍛"},{"c":"staple","k":"food","t":"r","id":"beefnoodle","name":"牛肉麵","text":"湯頭熬了很久。","emoji":"🍜"},{"c":"staple","k":"food","t":"l","id":"ramen","name":"豚骨拉麵","text":"濃郁到喝完整碗湯。","emoji":"🍥"},{"c":"staple","k":"food","t":"x","id":"sushi","name":"綜合壽司","text":"末世裡還能吃到生魚片？","emoji":"🍣"},{"c":"can","k":"food","t":"c","id":"corned","name":"鹹牛肉罐","text":"鹹，但很下飯。","emoji":"🥫"},{"c":"can","k":"food","t":"c","id":"sardine","name":"沙丁魚罐","text":"整整齊齊排好的小魚。","emoji":"🐟"},{"c":"can","k":"food","t":"c","id":"beans","name":"茄汁焗豆","text":"甜甜鹹鹹。","emoji":"🫘"},{"c":"can","k":"food","t":"c","id":"cornsoup","name":"玉米濃湯罐","text":"加熱一下就暖起來。","emoji":"🌽"},{"c":"can","k":"food","t":"r","id":"currycan","name":"咖哩雞罐","text":"配什麼都好吃。","emoji":"🍲"},{"c":"can","k":"food","t":"l","id":"crabcan","name":"蟹肉罐","text":"高級罐頭，捨不得吃。","emoji":"🦀"},{"c":"instant","k":"food","t":"c","id":"cupnoodle","name":"杯麵","text":"三分鐘的幸福。","emoji":"🍜"},{"c":"instant","k":"food","t":"c","id":"spicynoodle","name":"辣味泡麵","text":"辣到流汗，但停不下來。","emoji":"🌶️"},{"c":"instant","k":"food","t":"c","id":"porridge","name":"即食粥","text":"生病的時候最需要它。","emoji":"🥣"},{"c":"instant","k":"food","t":"r","id":"hotpot","name":"自熱火鍋","text":"倒水就會自己冒煙。","emoji":"🫕"},{"c":"instant","k":"food","t":"r","id":"mre","name":"軍用即食餐","text":"熱量很高，夠撐一整天。","emoji":"🎖️"},{"c":"instant","k":"food","t":"l","id":"hotbento","name":"自熱便當","text":"有飯有菜有肉。","emoji":"🍱"},{"c":"bakery","k":"food","t":"c","id":"toast","name":"厚片吐司","text":"塗上奶油剛剛好。","emoji":"🍞"},{"c":"bakery","k":"food","t":"c","id":"bagel","name":"貝果","text":"很有嚼勁。","emoji":"🥯"},{"c":"bakery","k":"food","t":"r","id":"croissant","name":"可頌","text":"一層一層酥到掉屑。","emoji":"🥐"},{"c":"bakery","k":"food","t":"r","id":"donut","name":"甜甜圈","text":"糖霜還是粉紅色的。","emoji":"🍩"},{"c":"bakery","k":"food","t":"l","id":"pizza","name":"披薩","text":"起司拉得好長。","emoji":"🍕"},{"c":"bakery","k":"food","t":"x","id":"cheesecake","name":"起司蛋糕","text":"濃郁綿密。","emoji":"🍰"},{"c":"sweet","k":"food","t":"c","id":"cookie","name":"巧克力餅乾","text":"一片接一片。","emoji":"🍪"},{"c":"sweet","k":"food","t":"c","id":"popcorn","name":"爆米花","text":"少了電影院，還是好吃。","emoji":"🍿"},{"c":"sweet","k":"food","t":"c","id":"gummy","name":"小熊軟糖","text":"五顏六色的小熊。","emoji":"🐻"},{"c":"sweet","k":"food","t":"r","id":"pudding","name":"雞蛋布丁","text":"焦糖的部分最好吃。","emoji":"🍮"},{"c":"sweet","k":"food","t":"r","id":"icecream","name":"冰淇淋","text":"找到還沒融化的，運氣真好。","emoji":"🍦"},{"c":"sweet","k":"food","t":"l","id":"macaron","name":"馬卡龍","text":"小小一顆，好精緻。","emoji":"🧁"},{"c":"sweet","k":"food","t":"l","id":"honeycake","name":"蜂蜜蛋糕","text":"鬆軟又香甜。","emoji":"🍯"},{"c":"sweet","k":"food","t":"x","id":"chocobox","name":"巧克力禮盒","text":"一整盒，每顆口味都不一樣。","emoji":"🎁"},{"c":"fruit","k":"food","t":"c","id":"apple","name":"蘋果","text":"一天一蘋果。","emoji":"🍎"},{"c":"fruit","k":"food","t":"c","id":"banana","name":"香蕉","text":"補充體力最快。","emoji":"🍌"},{"c":"fruit","k":"food","t":"c","id":"orange","name":"橘子","text":"剝開滿手香。","emoji":"🍊"},{"c":"fruit","k":"food","t":"r","id":"strawberry","name":"草莓","text":"酸酸甜甜。","emoji":"🍓"},{"c":"fruit","k":"food","t":"r","id":"mango","name":"芒果","text":"夏天的味道。","emoji":"🥭"},{"c":"fruit","k":"food","t":"r","id":"watermelon","name":"西瓜","text":"一大顆，大家一起分。","emoji":"🍉"},{"c":"fruit","k":"food","t":"l","id":"grapes","name":"巨峰葡萄","text":"一串都是大顆的。","emoji":"🍇"},{"c":"fruit","k":"food","t":"s","id":"goldpeach","name":"金色仙桃","text":"傳說吃了會帶來好運。","emoji":"🍑"},{"c":"meat","k":"food","t":"c","id":"sausage","name":"烤香腸","text":"夜市的靈魂。","emoji":"🌭"},{"c":"meat","k":"food","t":"r","id":"friedchicken","name":"炸雞","text":"外酥內嫩。","emoji":"🍗"},{"c":"meat","k":"food","t":"r","id":"skewer","name":"烤肉串","text":"刷上醬汁再烤一下。","emoji":"🍢"},{"c":"meat","k":"food","t":"l","id":"steak","name":"牛排","text":"七分熟，剛剛好。","emoji":"🥩"},{"c":"meat","k":"food","t":"x","id":"roastduck","name":"烤鴨","text":"皮脆到會發出聲音。","emoji":"🦆"},{"c":"drink","k":"drink","t":"c","id":"mineral","name":"冰礦泉水","text":"冰涼透心。","emoji":"💧"},{"c":"drink","k":"drink","t":"c","id":"cola","name":"可樂","text":"氣泡還很足。","emoji":"🥤"},{"c":"drink","k":"drink","t":"c","id":"oj","name":"柳橙汁","text":"滿滿維他命 C。","emoji":"🧃"},{"c":"drink","k":"drink","t":"c","id":"lemontea","name":"檸檬紅茶","text":"古早味。","emoji":"🍋"},{"c":"drink","k":"drink","t":"c","id":"sportsdrink","name":"運動飲料","text":"流完汗最需要。","emoji":"⚡"},{"c":"drink","k":"drink","t":"r","id":"bubbletea","name":"珍珠奶茶","text":"珍珠 QQ 的。","emoji":"🧋"},{"c":"drink","k":"drink","t":"r","id":"coconut","name":"椰子水","text":"天然的運動飲料。","emoji":"🥥"},{"c":"drink","k":"drink","t":"l","id":"smoothie","name":"綜合果昔","text":"打得綿綿的。","emoji":"🍹"},{"c":"hot","k":"drink","t":"c","id":"coffee","name":"黑咖啡","text":"讀書的好夥伴。","emoji":"☕"},{"c":"hot","k":"drink","t":"c","id":"greentea","name":"熱綠茶","text":"清香回甘。","emoji":"🍵"},{"c":"hot","k":"drink","t":"c","id":"gingertea","name":"黑糖薑茶","text":"冷天喝最暖。","emoji":"🫚"},{"c":"hot","k":"drink","t":"r","id":"latte","name":"拿鐵","text":"奶泡上還有拉花。","emoji":"🥛"},{"c":"hot","k":"drink","t":"r","id":"cocoa","name":"熱可可","text":"上面漂著棉花糖。","emoji":"🍫"},{"c":"hot","k":"drink","t":"r","id":"honeylemon","name":"蜂蜜檸檬","text":"喉嚨痛的時候喝。","emoji":"🍯"},{"c":"rare","k":"food","t":"x","id":"grandmasoup","name":"奶奶的雞湯","text":"喝一口就想哭。","emoji":"🍲"},{"c":"rare","k":"drink","t":"x","id":"starsoda","name":"星光汽水","text":"氣泡裡有小小的星星。","emoji":"✨"},{"c":"rare","k":"drink","t":"s","id":"auroratea","name":"極光花茶","text":"顏色會一直變。","emoji":"🌌"},{"c":"rare","k":"food","t":"s","id":"feast","name":"滿漢全席","text":"末世裡最奢侈的一餐。","emoji":"🏮"},{"c":"med","k":"med","t":"c","id":"bandage","name":"彈性繃帶","text":"擦傷扭傷都用得到。","emoji":"🩹"},{"c":"med","k":"med","t":"c","id":"coldmed","name":"感冒藥","text":"發燒咳嗽的救星。","emoji":"💊"},{"c":"med","k":"med","t":"c","id":"vitamin","name":"綜合維他命","text":"每天一顆，保持健康。","emoji":"🧴"},{"c":"med","k":"med","t":"r","id":"painkiller","name":"止痛藥","text":"頭痛牙痛都有效。","emoji":"💉"},{"c":"med","k":"med","t":"r","id":"ointment","name":"燙傷藥膏","text":"清涼止痛。","emoji":"🫙"},{"c":"med","k":"med","t":"l","id":"antibiotic","name":"抗生素","text":"末世裡最珍貴的藥。","emoji":"🧪"},{"c":"med","k":"med","t":"x","id":"serum","name":"抗病毒血清","text":"據說能抵抗喪屍病毒。","emoji":"🧬"},{"c":"home","k":"food","t":"c","id":"f_scallionegg","cook":true,"name":"蔥花蛋","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_congee","cook":true,"name":"地瓜粥","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_peaegg","cook":true,"name":"豌豆炒蛋","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_tomatoegg","cook":true,"name":"番茄炒蛋","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_onionpork","cook":true,"name":"蔥爆豬肉","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_grilledcorn","cook":true,"name":"烤玉米","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_tomatobeef","cook":true,"name":"番茄牛肉湯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_steamegg","cook":true,"name":"香菇蒸蛋","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_cornsoup","cook":true,"name":"玉米濃湯","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_cabbagepork","cook":true,"name":"高麗菜炒肉","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_lemonchicken","cook":true,"name":"檸檬烤雞","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_carrotegg","cook":true,"name":"紅蘿蔔炒蛋","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"r","id":"f_cherrymilk","cook":true,"name":"櫻桃牛奶","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_pancake","cook":true,"name":"鬆餅","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_cucumbersalad","cook":true,"name":"涼拌小黃瓜","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_fishfragrant","cook":true,"name":"魚香茄子","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_bamboosoup","cook":true,"name":"竹筍排骨湯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_threecup","cook":true,"name":"三杯雞","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_pepperpork","cook":true,"name":"青椒炒肉絲","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"c","id":"f_steak","cook":true,"name":"奶油牛排","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_daikonsoup","cook":true,"name":"蘿蔔排骨湯","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_onionrings","cook":true,"name":"洋蔥圈","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"r","id":"f_honeylemon","cook":true,"name":"蜂蜜檸檬茶","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_woodearsalad","cook":true,"name":"涼拌木耳","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_sesamechicken","cook":true,"name":"麻油雞","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"r","id":"f_gingerduck","cook":true,"name":"薑母鴨","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_mintlemonade","cook":true,"name":"薄荷檸檬水","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_pumpkinsoup","cook":true,"name":"南瓜濃湯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"drink","t":"r","id":"f_roastduck","cook":true,"name":"蜜汁烤鴨","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_applepie","cook":true,"name":"蘋果派","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_orangejelly","cook":true,"name":"橘子果凍","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_strawberrycake","cook":true,"name":"草莓蛋糕","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"r","id":"f_lambpot","cook":true,"name":"羊肉爐","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"c","id":"f_bananamilk","cook":true,"name":"香蕉牛奶","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_homestyletofu","cook":true,"name":"家常豆腐","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"c","id":"f_saltysoymilk","cook":true,"name":"鹹豆漿","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_enokiroll","cook":true,"name":"金針菇肉捲","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"c","id":"f_hotpot","cook":true,"name":"星露火鍋","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_peanutsoup","cook":true,"name":"花生湯","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_cheeseomelet","cook":true,"name":"起司歐姆蛋","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_kungpao","cook":true,"name":"宮保雞丁","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_spinachegg","cook":true,"name":"菠菜炒蛋","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_goatpudding","cook":true,"name":"羊奶布丁","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"r","id":"f_melonmilk","cook":true,"name":"哈密瓜牛奶","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"c","id":"f_trufflerisotto","cook":true,"name":"松露燉飯","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"r","id":"f_peachsmoothie","cook":true,"name":"蜜桃冰沙","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_pineapplecake","cook":true,"name":"鳳梨酥","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"c","id":"f_lambchop","cook":true,"name":"迷迭香烤羊排","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"r","id":"f_watermelonmilk","cook":true,"name":"西瓜牛奶","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_okraegg","cook":true,"name":"秋葵炒蛋","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_taroball","cook":true,"name":"芋圓湯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"r","id":"f_buddhajump","cook":true,"name":"佛跳牆","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_butteroyster","cook":true,"name":"奶油杏鮑菇","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"l","id":"f_giantpudding","cook":true,"name":"巨蛋布丁","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_mangoice","cook":true,"name":"芒果冰","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_bitterchicken","cook":true,"name":"鳳梨苦瓜雞湯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_saltedbitter","cook":true,"name":"金沙苦瓜","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_butterasparagus","cook":true,"name":"奶油蘆筍","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_yamsoup","cook":true,"name":"山藥排骨湯","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_grapetart","cook":true,"name":"葡萄塔","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"c","id":"f_potatogratin","cook":true,"name":"焗烤馬鈴薯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_lotussoup","cook":true,"name":"蓮藕排骨湯","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_lavendercookie","cook":true,"name":"薰衣草餅乾","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"l","id":"f_lycheeice","cook":true,"name":"荔枝冰沙","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"r","id":"f_tiramisu","cook":true,"name":"提拉米蘇","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"l","id":"f_dragonmilk","cook":true,"name":"火龍果牛奶","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"r","id":"f_blackforest","cook":true,"name":"黑森林蛋糕","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"l","id":"f_vanillaicecream","cook":true,"name":"香草冰淇淋","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"l","id":"f_fruitplatter","cook":true,"name":"豐收水果拼盤","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"l","id":"f_lingzhisoup","cook":true,"name":"靈芝雞湯","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"l","id":"f_coconutsago","cook":true,"name":"椰奶芋頭西米露","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"l","id":"f_tropicaltart","cook":true,"name":"熱帶水果塔","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"legend","k":"food","t":"x","id":"f_starfeast","cook":true,"name":"星露盛宴","text":"星露島的傳說料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_goldonigiri","cook":true,"name":"金穗飯糰","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_rainbowsoup","cook":true,"name":"彩虹玉米濃湯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"x","id":"f_starpudding","cook":true,"name":"星露草布丁","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"legend","k":"drink","t":"s","id":"f_moonlotustea","cook":true,"name":"月光蓮花茶","text":"星露島的傳說料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"r","id":"f_blueberrymilk","cook":true,"name":"藍莓牛奶","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_blueberrypancake","cook":true,"name":"藍莓鬆餅","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_pepperchicken","cook":true,"name":"彩椒炒雞丁","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_stuffedpepper","cook":true,"name":"彩椒鑲肉","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_radishsalad","cook":true,"name":"櫻桃蘿蔔沙拉","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_purpleballs","cook":true,"name":"紫薯球","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_gooseeggrice","cook":true,"name":"鵝蛋炒飯","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"sig","k":"drink","t":"r","id":"f_honeygoose","cook":true,"name":"蜜汁燒鵝","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_turkeyleg","cook":true,"name":"烤火雞腿","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_turkeysandwich","cook":true,"name":"火雞三明治","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_goldfriedrice","cook":true,"name":"金穗炒飯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"l","id":"f_rainbowpopcorn","cook":true,"name":"彩虹爆米花","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"l","id":"f_whitestrawberrymilk","cook":true,"name":"白草莓牛奶","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_daifuku","cook":true,"name":"白草莓大福","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"l","id":"f_blacktomatosalad","cook":true,"name":"黑番茄沙拉","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"l","id":"f_driedpersimmon","cook":true,"name":"柿餅","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"x","id":"f_amberrisotto","cook":true,"name":"琥珀南瓜燉飯","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"x","id":"f_cottoncocoa","cook":true,"name":"棉花糖可可","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"drink","t":"x","id":"f_goldapplejuice","cook":true,"name":"金蘋果汁","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"x","id":"f_goldomelet","cook":true,"name":"黃金蛋捲","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"s","id":"f_phoenixchicken","cook":true,"name":"鳳凰辣子雞","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"s","id":"f_peachjelly","cook":true,"name":"仙桃凍","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"s","id":"f_aurorajuice","cook":true,"name":"極光葡萄汁","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"s","id":"f_moontangyuan","cook":true,"name":"月兔湯圓","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"x","id":"f_goldtart","cook":true,"name":"黃金蛋塔","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"x","id":"f_amberpie","cook":true,"name":"琥珀南瓜派","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"legend","k":"food","t":"x","id":"f_starlayercake","cook":true,"name":"星空千層","text":"星露島的傳說料理。","emoji":"🍽️"},{"c":"legend","k":"food","t":"s","id":"f_peachfeast","cook":true,"name":"仙桃壽宴","text":"星露島的傳說料理。","emoji":"🍽️"},{"c":"legend","k":"food","t":"s","id":"f_moonricecake","cook":true,"name":"月兔年糕","text":"星露島的傳說料理。","emoji":"🍽️"},{"c":"legend","k":"drink","t":"s","id":"f_aurorasoda","cook":true,"name":"極光氣泡飲","text":"星露島的傳說料理。","emoji":"🍽️"},{"c":"legend","k":"food","t":"s","id":"f_phoenixpot","cook":true,"name":"鳳凰麻辣鍋","text":"星露島的傳說料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_grainrice","cook":true,"name":"秋收五穀飯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"r","id":"f_gingerbreadman","cook":true,"name":"薑餅人","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_turnipcake","cook":true,"name":"蘿蔔糕","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"home","k":"food","t":"c","id":"f_fagao","cook":true,"name":"發糕","text":"星露島的家常料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"l","id":"f_durianpuff","cook":true,"name":"榴槤酥","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"l","id":"f_mangoshake","cook":true,"name":"芒果冰沙","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"r","id":"f_waxappletea","cook":true,"name":"蓮霧青茶","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_mangosteenbowl","cook":true,"name":"山竹甜湯","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"x","id":"f_dragoneyestew","cook":true,"name":"龍眼燉雞","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"legend","k":"food","t":"s","id":"f_starstarfeast","cook":true,"name":"星光燉鍋","text":"星露島的傳說料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"l","id":"f_buffalopudding","cook":true,"name":"水牛奶布丁","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"food","t":"r","id":"f_sunflowercookie","cook":true,"name":"葵花籽餅乾","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"l","id":"f_passiontea","cook":true,"name":"百香果綠茶","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"l","id":"f_avocadomilk","cook":true,"name":"酪梨牛奶","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"l","id":"f_figtart","cook":true,"name":"無花果塔","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"skill","k":"drink","t":"l","id":"f_blacktealatte","cook":true,"name":"紅茶拿鐵","text":"星露島的拿手料理。","emoji":"🍽️"},{"c":"sig","k":"drink","t":"x","id":"f_starfruitjuice","cook":true,"name":"楊桃汁","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"x","id":"f_fruitsundae","cook":true,"name":"水果聖代","text":"星露島的招牌料理。","emoji":"🍽️"},{"c":"sig","k":"food","t":"x","id":"f_roastchestnut","cook":true,"name":"糖炒栗子","text":"星露島的招牌料理。","emoji":"🍽️"},{"id":"candy","name":"水果糖","emoji":"🍬","c":"sweet","t":"c","k":"food","text":"一顆一顆用玻璃紙包著，含很久。","scav":true},{"id":"biscuit","name":"壓縮餅乾","emoji":"🍘","c":"instant","t":"c","k":"food","text":"乾到要配水，但一塊就很飽。","scav":true},{"id":"packnoodle","name":"袋裝泡麵","emoji":"🍜","c":"instant","t":"c","k":"food","text":"乾吃捏碎撒調味粉也行。","scav":true},{"id":"teaegg","name":"茶葉蛋","emoji":"🥚","c":"staple","t":"c","k":"food","text":"超商電鍋裡最後幾顆，滷得很入味。","scav":true},{"id":"longmilk","name":"保久乳","emoji":"🥛","c":"drink","t":"c","k":"drink","text":"不用冰也放很久，小時候的味道。","scav":true},{"id":"pineapplebun","name":"菠蘿麵包","emoji":"🍞","c":"bakery","t":"c","k":"food","text":"酥皮掉滿地也要吃完。","scav":true},{"id":"dumpling","name":"冷凍水餃","emoji":"🥟","c":"staple","t":"c","k":"food","text":"冰櫃斷電前搶救出來的。","scav":true},{"id":"mwbento","name":"微波便當","emoji":"🍱","c":"staple","t":"r","k":"food","text":"排骨、滷蛋、三樣配菜，奢侈的一餐。","scav":true},{"id":"bigsausage","name":"大腸包小腸","emoji":"🌭","c":"meat","t":"c","k":"food","text":"夜市攤車上最後一份，糯米腸還溫的。","scav":true},{"id":"honey","name":"野生蜂蜜","emoji":"🍯","c":"sweet","t":"r","k":"food","text":"頂樓蜂箱割下來的，抹什麼都好吃。","scav":true},{"id":"chocobar","name":"巧克力棒","emoji":"🍫","c":"sweet","t":"c","k":"food","text":"融了又凝固，形狀怪怪的但很甜。","scav":true},{"id":"chips","name":"洋芋片","emoji":"🥔","c":"sweet","t":"c","k":"food","text":"袋子鼓鼓的，打開那聲最療癒。","scav":true},{"id":"caramel","name":"牛奶糖","emoji":"🍮","c":"sweet","t":"c","k":"food","text":"黏牙，但會讓人想起以前。","scav":true},{"id":"cracker","name":"蘇打餅乾","emoji":"🍪","c":"bakery","t":"c","k":"food","text":"鹹鹹脆脆，配什麼都可以。","scav":true},{"id":"soda","name":"汽水","emoji":"🥤","c":"drink","t":"c","k":"drink","text":"搖一搖打開會噴，記得慢慢轉。","scav":true},{"id":"jelly","name":"果凍","emoji":"🍮","c":"sweet","t":"r","k":"food","text":"吸的那種，一口一個顏色。","scav":true},{"id":"eggroll","name":"蛋捲","emoji":"🥠","c":"sweet","t":"r","k":"food","text":"鐵盒裝的，過年才拆的那種。","scav":true},{"id":"lollipop","name":"棒棒糖","emoji":"🍭","c":"sweet","t":"r","k":"food","text":"大大一支，舔到舌頭變色。","scav":true},{"id":"tuna","name":"鮪魚罐頭","emoji":"🐟","c":"can","t":"c","k":"food","text":"拌飯、夾麵包都行，萬用。","scav":true},{"id":"corncan","name":"玉米罐","emoji":"🌽","c":"can","t":"c","k":"food","text":"甜甜的玉米粒，直接吃也可以。","scav":true},{"id":"congee","name":"八寶粥","emoji":"🥣","c":"can","t":"c","k":"food","text":"附湯匙的那罐，冷吃也香。","scav":true},{"id":"peachcan","name":"水蜜桃罐頭","emoji":"🍑","c":"can","t":"r","k":"food","text":"糖水也要喝完，一滴都不浪費。","scav":true},{"id":"spam","name":"午餐肉","emoji":"🥓","c":"can","t":"r","k":"food","text":"煎得焦焦的最好吃。","scav":true},{"id":"candyjar","name":"彩虹糖罐","emoji":"🌈","c":"sweet","t":"l","k":"food","text":"整罐五顏六色，捨不得一次吃完。","scav":true},{"id":"bdaycake","name":"生日蛋糕","emoji":"🎂","c":"bakery","t":"x","k":"food","text":"奇蹟般完好的蛋糕，今天就當作誰的生日吧。","scav":true},{"id":"goldcan","name":"黃金罐頭","emoji":"🥫","c":"can","t":"s","k":"food","text":"傳說中的罐頭，打開會發光。","scav":true}],"effects":{"c":{"hp":0,"luck":0,"morale":3},"l":{"hp":5,"luck":3,"morale":8},"r":{"hp":3,"luck":1,"morale":5},"s":{"hp":12,"luck":8,"morale":18},"x":{"hp":8,"luck":5,"morale":12}}}$json$::jsonb;
$function$;
grant execute on function public.doom_food_cat() to authenticated;

-- 搜刮物資 id → 給哪些食物。p＝固定食物、pick＝從分類隨機、crop＝末世農場作物
create or replace function public.doom_scav_map()
returns jsonb language sql immutable
as $function$
select $json${"can": {"pick": [["can", 1]]}, "bottle": {"p": [["mineral", 1]]}, "noodle": {"p": [["packnoodle", 1]]}, "candy": {"p": [["candy", 2]]}, "biscuit": {"p": [["biscuit", 1]]}, "pack": {"p": [["mineral", 1]], "pick": [["instant", 1]]}, "medkit": {"p": [["bandage", 1]], "pick": [["med", 1]]}, "cooler": {"pick": [["drink", 1], ["sweet", 1]]}, "ration": {"p": [["mre", 3]]}, "airdrop": {"pick": [["can", 1], ["instant", 1], ["drink", 1]]}, "z_onigiri": {"p": [["onigiri", 1]]}, "z_teaegg": {"p": [["teaegg", 2]]}, "z_milk": {"p": [["longmilk", 1]]}, "z_bread": {"p": [["pineapplebun", 1]]}, "z_bento": {"p": [["mwbento", 1]]}, "z_fridge": {"pick": [["drink", 3]]}, "z_rice": {"crop": [["rice", 5]]}, "z_snack": {"pick": [["sweet", 2]]}, "z_dumpling": {"p": [["dumpling", 2]]}, "z_cart": {"pick": [["staple", 1], ["instant", 1], ["can", 1]]}, "z_coffee": {"p": [["coffee", 2]]}, "z_storeroom": {"pick": [["staple", 1], ["instant", 1], ["can", 1], ["sweet", 1], ["drink", 1]]}, "w_bottles": {"p": [["mineral", 4]]}, "t_vending": {"pick": [["drink", 1], ["sweet", 1]]}, "s_vending": {"pick": [["drink", 1], ["sweet", 1]]}, "m_bandage": {"p": [["bandage", 1]]}, "m_vitamin": {"p": [["vitamin", 1]]}, "m_kit": {"pick": [["med", 2]]}, "m_pharmacy": {"pick": [["med", 4]]}, "x_mre": {"p": [["mre", 1]]}, "x_depot": {"p": [["mre", 2]], "pick": [["can", 2]]}, "n_sausage": {"p": [["bigsausage", 1]]}, "n_skewer": {"p": [["skewer", 2]]}, "n_tea": {"p": [["bubbletea", 1]]}, "r_tomato": {"crop": [["tomato", 3]]}, "r_herb": {"crop": [["basil", 2], ["mint", 1]]}, "r_bee": {"p": [["honey", 1]]}, "r_greenhouse": {"crop": [["strawberry", 3], ["tomato", 3]]}, "k_canned": {"pick": [["can", 3]]}, "choco": {"p": [["chocobar", 1]]}, "chips": {"p": [["chips", 1]]}, "caramel": {"p": [["caramel", 1]]}, "cracker": {"p": [["cracker", 1]]}, "soda": {"p": [["soda", 1]]}, "jelly": {"p": [["jelly", 1]]}, "eggroll": {"p": [["eggroll", 1]]}, "lollipop": {"p": [["lollipop", 1]]}, "tuna": {"p": [["tuna", 1]]}, "corncan": {"p": [["corncan", 1]]}, "congee": {"p": [["congee", 1]]}, "peach": {"p": [["peachcan", 1]]}, "spam": {"p": [["spam", 1]]}, "goldcan": {"p": [["goldcan", 1]]}, "candyjar": {"p": [["candyjar", 1]]}, "cake": {"p": [["bdaycake", 1]]}}$json$::jsonb;
$function$;
grant execute on function public.doom_scav_map() to authenticated;

-- 隨機掉落不會掉這些「搜刮專屬」的食物（它們跟著物資來）
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
      where not (el ? 'cook') and not (el ? 'scav') and el->>'t' = tier and exists (select 1 from jsonb_array_elements(cat->'cats') c where c->>'id' = el->>'c' and c->'zones' ? p_zone)
      order by random() limit 1;
  end if;
  if e is null then select el into e from jsonb_array_elements(cat->'items') el where not (el ? 'cook') and not (el ? 'scav') and el->>'t' = tier order by random() limit 1; end if;
  if e is null then select el into e from jsonb_array_elements(cat->'items') el where not (el ? 'cook') and not (el ? 'scav') and el->>'t' = 'c' order by random() limit 1; end if;
  select coalesce((pantry->>(e->>'id'))::int, 0) into have from public.doom_state where user_id = u;
  update public.doom_state set pantry = pantry || jsonb_build_object(e->>'id', have + 1) where user_id = u;
  return jsonb_build_object('id', e->>'id', 'name', e->>'name', 'emoji', e->>'emoji', 'tier', e->>'t', 'new', have = 0
    and not exists (select 1 from public.doom_state where user_id = u and eaten ? (e->>'id')));
end;
$function$;
revoke all on function public.doom_pantry_roll(uuid, text, numeric) from public, authenticated, anon;

-- 撿到一樣物資 → 放對應的食物進食物櫃，順便記在這次交易的清單裡（給開箱畫面顯示）
create or replace function public.doom_scav_give(u uuid, p_id text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  m jsonb := public.doom_scav_map()->p_id;
  cat jsonb;
  fc jsonb;
  outl jsonb := '[]'::jsonb;
  x jsonb;
  e jsonb;
  j integer;
  n integer;
  have integer;
  tier text;
  lk integer;
begin
  if m is null or u is null then return outl; end if;
  cat := public.doom_food_cat();
  -- 固定的食物
  for x in select * from jsonb_array_elements(coalesce(m->'p', '[]'::jsonb)) loop
    select el into e from jsonb_array_elements(cat->'items') el where el->>'id' = x->>0;
    continue when e is null;
    n := (x->>1)::int;
    select coalesce((pantry->>(e->>'id'))::int, 0) into have from public.doom_state where user_id = u;
    update public.doom_state set pantry = pantry || jsonb_build_object(e->>'id', have + n) where user_id = u;
    outl := outl || jsonb_build_object('id', e->>'id', 'name', e->>'name', 'emoji', e->>'emoji', 'tier', e->>'t', 'n', n,
      'new', have = 0 and not exists (select 1 from public.doom_state where user_id = u and eaten ? (e->>'id')));
  end loop;
  -- 從分類隨機
  if m ? 'pick' then lk := public.doom_luck(u); end if;
  for x in select * from jsonb_array_elements(coalesce(m->'pick', '[]'::jsonb)) loop
    for j in 1..(x->>1)::int loop
      tier := public.doom_roll_tier(lk);
      select el into e from jsonb_array_elements(cat->'items') el where el->>'c' = x->>0 and not (el ? 'cook') and el->>'t' = tier order by random() limit 1;
      if e is null then select el into e from jsonb_array_elements(cat->'items') el where el->>'c' = x->>0 and not (el ? 'cook') and el->>'t' in ('c', 'r') order by random() limit 1; end if;
      continue when e is null;
      select coalesce((pantry->>(e->>'id'))::int, 0) into have from public.doom_state where user_id = u;
      update public.doom_state set pantry = pantry || jsonb_build_object(e->>'id', have + 1) where user_id = u;
      outl := outl || jsonb_build_object('id', e->>'id', 'name', e->>'name', 'emoji', e->>'emoji', 'tier', e->>'t', 'n', 1,
        'new', have = 0 and not exists (select 1 from public.doom_state where user_id = u and eaten ? (e->>'id')));
    end loop;
  end loop;
  -- 末世農場作物
  if m ? 'crop' then fc := public.doom_farm_cat(); end if;
  for x in select * from jsonb_array_elements(coalesce(m->'crop', '[]'::jsonb)) loop
    select el into e from jsonb_array_elements(fc->'crops') el where el->>'id' = x->>0;
    continue when e is null;
    n := (x->>1)::int;
    update public.doom_state set dcrops = dcrops || jsonb_build_object(e->>'id', coalesce((dcrops->>(e->>'id'))::int, 0) + n) where user_id = u;
    outl := outl || jsonb_build_object('id', e->>'id', 'name', e->>'name', 'emoji', e->>'emoji', 'tier', 'c', 'n', n, 'crop', true);
  end loop;
  if jsonb_array_length(outl) > 0 then
    perform set_config('doom.scavfood', (coalesce(nullif(current_setting('doom.scavfood', true), ''), '[]')::jsonb || outl)::text, true);
  end if;
  return outl;
end;
$function$;
revoke all on function public.doom_scav_give(uuid, text) from public, authenticated, anon;

-- 每撿到一樣搜刮物資都會經過 doom_seen（抽獎、專注搜刮、補給箱、鑑定）
create or replace function public.doom_seen(u uuid, p_id text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  update public.doom_state set seen = seen || jsonb_build_object(p_id, coalesce((seen->>p_id)::integer, 0) + 1) where user_id = u;
  perform public.doom_scav_give(u, p_id);
end;
$function$;
revoke all on function public.doom_seen(uuid, text) from public, authenticated, anon;

-- 生活小物（零食、罐頭）也一起放進食物櫃
do $do$ begin
  if not exists (select 1 from pg_proc where proname = 'doom_trinket_base' and pronamespace = 'public'::regnamespace) then
    alter function public.doom_trinket(uuid, text, text, boolean) rename to doom_trinket_base;
  end if;
end $do$;
revoke all on function public.doom_trinket_base(uuid, text, text, boolean) from public, authenticated, anon;

create or replace function public.doom_trinket(u uuid, p_src text, p_zone text, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare r jsonb;
begin
  r := public.doom_trinket_base(u, p_src, p_zone, p_force);
  if r is not null then perform public.doom_scav_give(u, r->>'id'); end if;
  return r;
end;
$function$;
revoke all on function public.doom_trinket(uuid, text, text, boolean) from public, authenticated, anon;

-- 專注搜刮：結果裡的 pantry 多了搜刮物資帶來的食物
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
  perform set_config('doom.scavfood', '[]', true);
  res := public.doom_run_claim_base(p_session, p_zone, p_drops)::jsonb;
  if u is null or coalesce((res->>'already')::boolean, false) or res ? 'rescued' then return res; end if;
  mins := coalesce((res->>'minutes')::int, 0);
  n := public.doom_rescue(u, mins);
  pk := coalesce(nullif(current_setting('doom.scavfood', true), ''), '[]')::jsonb;
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
grant execute on function public.doom_run_claim(bigint, text, integer) to authenticated;

create or replace function public.doom_draw(p_n integer)
returns json language plpgsql security definer set search_path to 'public'
as $function$
declare
  u uuid := auth.uid();
  res jsonb;
  i integer;
  pk jsonb;
  x jsonb;
begin
  perform set_config('doom.scavfood', '[]', true);
  res := public.doom_draw_base(p_n)::jsonb;
  pk := coalesce(nullif(current_setting('doom.scavfood', true), ''), '[]')::jsonb;
  for i in 1..jsonb_array_length(coalesce(res->'results', '[]'::jsonb)) loop
    x := public.doom_pantry_roll(u, null, 0.35);
    if x is not null then pk := pk || x; end if;
  end loop;
  return res || jsonb_build_object('pantry', pk);
end;
$function$;
grant execute on function public.doom_draw(integer) to authenticated;
