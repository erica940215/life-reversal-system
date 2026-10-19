/* 星露島：釣魚資料（魚、魚料理、釣竿、魚餌）。放在 farm-data.js 後面、farm.js 前面載入 */
(function () {
  const D = window.FARM_DATA;
  if (!D) return;

  /* 稀有度：c 普通、r 少見、l 稀有、x 史詩、s 傳說 */
  const TIER = {
    c: { name: "普通", fish: 15, dish: 60, exp: 2, dexp: 20, min: 10 },
    r: { name: "少見", fish: 40, dish: 120, exp: 4, dexp: 35, min: 15 },
    l: { name: "稀有", fish: 90, dish: 200, exp: 8, dexp: 60, min: 20 },
    x: { name: "史詩", fish: 200, dish: 380, exp: 15, dexp: 100, min: 30 },
    s: { name: "傳說", fish: 500, dish: 650, exp: 30, dexp: 160, min: 45 }
  };

  /* 魚：key, 名稱, 稀有度, 設定, 料理 key, 料理名稱, 料理材料（魚以外） */
  const FISH = [
    ["moon_minnow", "月光小鯽", "c", "身上有小亮點，夜裡會發光", "dish_scallion_minnow", "蔥燒小鯽", { onion: 2 }],
    ["paper_boat_fish", "紙船魚", "c", "扁平的，像摺紙船", "dish_fish_fried_rice", "魚片炒飯", { rice: 1, egg: 1 }],
    ["cotton_carp", "棉花鯉", "c", "胖胖的白色鯉魚，游得很慢", "dish_tomato_carp", "番茄魚湯", { tomato: 2 }],
    ["honey_perch", "蜂蜜鱸", "c", "身上有琥珀色紋路", "dish_sweet_perch", "地瓜烤鱸魚", { sweetpotato: 1, corn: 1 }],
    ["bubble_fish", "小泡泡魚", "c", "嘴巴吐泡泡", "dish_bubble_egg", "泡泡炒蛋", { egg: 1, spinach: 1 }],
    ["reed_loach", "蘆葦鰍", "c", "常躲在水草裡", "dish_reed_bamboo", "竹筍炒鰍", { bamboo: 1, onion: 1 }],
    ["match_snapper", "火柴鯛", "c", "尾巴像小火苗", "dish_chili_snapper", "辣椒烤鯛", { chili: 1, garlic: 1 }],
    ["bun_catfish", "饅頭鯰", "c", "圓滾滾的，很呆", "dish_daikon_catfish", "蘿蔔燉鯰魚", { daikon: 2 }],
    ["dew_carp", "露珠鯉", "c", "身上掛著小露珠", "dish_pumpkin_congee", "南瓜露珠粥", { pumpkin: 1, rice: 1 }],
    ["bean_sprout_catfish", "豆芽鯰", "c", "細長白色，像豆芽", "dish_bean_catfish", "豆芽炒青椒", { soybean: 1, bellpepper: 1 }],
    ["slipper_fish", "拖鞋魚", "c", "扁平寬大，像一隻拖鞋", "dish_cucumber_slipper", "涼拌拖鞋魚", { cucumber: 2, garlic: 1 }],
    ["strawberry_snapper", "草莓鯛", "c", "紅色小斑點，很可愛", "dish_strawberry_salad", "草莓魚沙拉", { strawberry: 1, spinach: 1 }],

    ["rain_snapper", "雨滴鯛", "r", "背上有藍色水滴紋", "dish_mushroom_rain", "香菇雨滴蒸鯛", { shiitake: 2, ginger: 1 }],
    ["maple_carp", "紅楓鯉", "r", "紅色鰭，像楓葉", "dish_apple_maple", "蘋果烤紅鯉", { apple: 1, sugarcane: 1 }],
    ["bell_eel", "鈴鐺鰻", "r", "游動時會發出叮噹聲", "dish_onion_eel", "薑蔥鈴鰻", { ginger: 1, yellowonion: 1 }],
    ["mint_guppy", "薄荷鱂", "r", "聞起來有薄荷味", "dish_mint_guppy", "薄荷涼魚", { mint: 1, cucumber: 1 }],
    ["star_goby", "星沙蝦虎", "r", "躲在沙裡，身上有星點", "dish_coriander_goby", "香菜炸蝦虎", { coriander: 1, wheat: 1 }],
    ["carpenter_fish", "木匠魚", "r", "牙齒像鋸子", "dish_woodear_carpenter", "木耳燒木匠魚", { woodear: 1, garlic: 1 }],
    ["sakura_trout", "櫻花鱒", "r", "粉色的鱒魚", "dish_cherry_trout", "櫻桃鱒魚", { cherry: 2 }],
    ["snail_catfish", "蝸牛鰭鯰", "r", "背上有殼", "dish_cabbage_hotpot", "高麗菜鯰魚鍋", { cabbage: 1, daikon: 1 }],
    ["wind_chime_perch", "風鈴鱸", "r", "背鰭像風鈴，會輕輕響", "dish_lemon_chime", "檸檬風鈴鱸", { lemon: 1, basil: 1 }],
    ["honey_pomelo_snapper", "蜜柚鯛", "r", "金黃色，像柚子果肉", "dish_orange_snapper", "柚香蒸鯛", { orange: 2, ginger: 1 }],
    ["porcelain_carp", "陶瓷鯉", "r", "白底藍紋，像青花瓷", "dish_tea_porcelain", "茶燻陶瓷鯉", { tea: 1, rice: 1 }],
    ["paper_lantern_loach", "紙燈籠鰍", "r", "身體半透明，裡面有光", "dish_carrot_lantern", "燈籠蘿蔔湯", { carrot: 1, yellowonion: 1 }],
    ["cloud_guppy", "雲朵鱂", "r", "身體鬆軟，像一朵小雲", "dish_corn_cloud", "雲朵玉米濃湯", { corn: 2, milk: 1 }],

    ["lantern_jelly", "燈籠水母魚", "l", "會自己亮起來", "dish_melon_jelly", "燈籠水母冰", { melon: 1, mint: 1 }],
    ["ink_shark", "墨硯鯊", "l", "身上像潑了墨", "dish_woodear_ink", "墨硯燉木耳", { woodear: 2, soybean: 1 }],
    ["glass_mackerel", "玻璃鯖", "l", "身體透明，看得見心臟跳動", "dish_ginger_mackerel", "薑絲玻璃鯖", { ginger: 1, spinach: 1 }],
    ["clay_gator", "陶土鱷", "l", "渾身像陶器，裂開一片片", "dish_yam_clay", "陶鍋山藥鱷", { yam: 1, chili: 1 }],
    ["stalactite_whale", "鐘乳鯨苗", "l", "小型鯨魚，只在深水出現", "dish_soy_whale", "鐘乳豆漿鍋", { soybean: 2, milk: 1 }],
    ["sugar_snapper", "糖霜鯛", "l", "像裹了一層糖霜", "dish_sugar_fish", "糖霜魚排", { strawberry: 1, sugarcane: 1 }],
    ["spruce_salmon", "雲杉鮭", "l", "背上有像雪松的枝葉", "dish_rosemary_salmon", "迷迭香烤鮭", { rosemary: 1, potato: 1 }],
    ["crystal_shrimp", "水晶蝦", "l", "透明的水晶殼，裡面有光", "dish_crystal_mango", "水晶蝦芒果沙拉", { mango: 1, mint: 1 }],
    ["amber_perch", "琥珀鱸", "l", "整條魚像琥珀，裡面有小氣泡", "dish_pumpkin_amber", "琥珀南瓜鱸", { pumpkin: 1, sugarcane: 1 }],
    ["nebula_anglerfish", "星雲鮟鱇", "l", "頭上的燈像一小片星雲", "dish_taro_nebula", "星雲芋頭鍋", { taro: 2, tea: 1 }],
    ["bronze_bell_whale", "銅鈴鯨", "l", "背上有銅色的鈴鐺", "dish_lotus_bell", "蓮藕銅鈴排骨", { lotusroot: 1, pork: 1 }],
    ["coral_armor_shark", "珊瑚鎧鯊", "l", "背上長著珊瑚狀的鎧甲", "dish_okra_armor", "秋葵鎧鯊", { okra: 1, garlic: 1 }],

    ["clock_carp", "時鐘鯉", "x", "身上的花紋會隨時間變化", "dish_clock_butter", "時鐘奶油鯉", { wheat: 2, milk: 1 }],
    ["aurora_ray", "極光鰩", "x", "游過的水面留下彩虹光", "dish_grape_aurora", "極光葡萄鰩", { grape: 1, coconut: 1 }],
    ["mirror_fish", "鏡面魚", "x", "能映出釣魚人的倒影", "dish_banana_mirror", "鏡面香蕉酥", { mango: 1, banana: 1 }],
    ["starsea_turtle", "星海龜", "x", "背上長著小型星空", "dish_coconut_turtle", "星海椰子湯", { coconut: 1, lingzhi: 1 }],
    ["frost_dragon_carp", "霜紋龍鯉", "x", "身上有冰晶般的紋路", "dish_ginger_frost", "霜紋龍鯉鍋", { lingzhi: 1, ginger: 1 }],
    ["backlight_whale", "逆光鯨", "x", "背對光時會發出金邊", "dish_vanilla_backlight", "香草逆光鯨", { vanilla: 1, milk: 1 }],
    ["wing_mackerel", "羽翼鯖", "x", "胸鰭像一對翅膀", "dish_dragonfruit_wing", "火龍果烤鯖", { dragonfruit: 1, chili: 1 }],

    ["xuguang_fish", "序光魚", "s", "島上的傳說，據說是光的來源", "dish_moonlotus_rice", "序光蓮飯", { goldrice: 1, moonlotus: 1 }],
    ["dragon_bone_whale", "龍骨鯨", "s", "身上有古老的龍骨骨架", "dish_lingzhi_broth", "龍骨高湯", { lingzhi: 1, daikon: 2 }],
    ["counter_king", "逆流之王", "s", "逆著水流游，釣到的人會得到好運", "dish_lychee_counter", "逆流荔枝鯉", { lychee: 1, goldapple: 1 }],
    ["sky_mirror_whale", "天鏡鯨", "s", "身體像一面鏡子，映出天空", "dish_vanilla_mirror", "天鏡葡萄鯨", { auroragrape: 1, vanilla: 1 }],
    ["nameless_white_carp", "無名白鯉", "s", "沒有名字的白色鯉魚，傳說最古老", "dish_peach_white", "仙桃白鯉湯", { immortalpeach: 1, ginger: 1 }],
    ["cloud_peak_shark", "雲巔鮫", "s", "住在雲層裡的鯊魚，很少落到水面", "dish_coffee_cloud", "雲巔咖啡鮫", { coffee: 1, cacao: 1 }]
  ];

  /* 已經有圖的魚（img/farm/fish/<key>.webp）；沒有圖的先用表情符號 */
  const HAS_IMG = new Set([
    "moon_minnow","paper_boat_fish","cotton_carp","honey_perch","bubble_fish","reed_loach","match_snapper","bun_catfish",
    "rain_snapper","maple_carp","bell_eel","mint_guppy","star_goby","carpenter_fish","sakura_trout","snail_catfish",
    "lantern_jelly","ink_shark","glass_mackerel","clay_gator","stalactite_whale","sugar_snapper","spruce_salmon",
    "clock_carp","aurora_ray","mirror_fish","starsea_turtle",
    "xuguang_fish","dragon_bone_whale","counter_king"
  ]);

  D.fishTiers = TIER;
  D.fish = {};
  for (const [k, name, t, desc, dk, dname, need] of FISH) {
    const T = TIER[t];
    D.fish[k] = { name, tier: t, desc, dish: dk, exp: T.exp };
    D.items[k] = { name, sell: T.fish, emoji: "🐟", kind: "fish", tier: t, desc };
    if (HAS_IMG.has(k)) D.items[k].img = `fish/${k}.webp`;
    D.dishes[dk] = { name: dname, tier: "魚料理", lv: 15, need: Object.assign({ [k]: 1 }, need), sell: T.dish, exp: T.dexp, minutes: T.min, img: HAS_IMG.has(dk), gacha: true, fish: k, rar: t };
    D.items[dk] = { name: dname, sell: T.dish, emoji: "🍲", kind: "dish", tier: t };
    if (HAS_IMG.has(dk)) D.items[dk].img = `fish/${dk}.webp`;
  }

  /* 釣竿：每一級稀有度的機率（普通、少見、稀有、史詩、傳說） */
  D.rods = {
    bamboo: { name: "竹竿", price: 0, lv: 15, rate: [50, 25, 15, 7, 3], emoji: "🎋" },
    wood: { name: "木竿", price: 300, lv: 15, rate: [45, 25, 18, 9, 3], emoji: "🪵" },
    steel: { name: "鋼竿", price: 1500, lv: 25, rate: [38, 25, 21, 12, 4], emoji: "🎣" },
    starsand: { name: "星砂竿", price: 5000, lv: 35, rate: [30, 24, 24, 15, 7], emoji: "✨" }
  };
  for (const k of Object.keys(D.rods)) if (HAS_IMG.has("rod_" + k)) D.rods[k].img = `../ui/rod_${k}.webp`;

  /* 魚餌：飼料機旁邊的第二條生產線，10 分鐘做 5 個，最多排 5 輪，做好自動收 */
  D.items.bait = { name: "魚餌", emoji: "🪱", kind: "goods", tier: "c", desc: "釣一次魚用 1 個" };
  if (HAS_IMG.has("bait")) D.items.bait.img = "../ui/bait.webp";
  D.machines.baitline = { name: "魚餌線", lv: 15, where: "ranch", emoji: "🪱", queue: 5, fixed: true, auto: true };
  if (HAS_IMG.has("bait")) D.machines.baitline.img = "../ui/bait.webp";
  D.recipes.bait = { out: "bait", qty: 5, need: { feed: 2, wheat: 1 }, minutes: 10, machine: "baitline", lv: 15 };
})();
