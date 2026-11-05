/* 星露島：擴充資料（Lv 71–99、季節限定作物和料理、島嶼擴建）。放在 farm-fish.js 後面、farm.js 前面 */
(function () {
  const D = window.FARM_DATA;
  if (!D) return;

  /* ---------- 🆙 等級 71–99 ---------- */
  const L70 = D.levels[69];
  L70.need = 3640;
  L70.unlocks = (L70.unlocks || []).concat(["等級上限開到 99"]);
  const UNLOCK = {
    71: ["新區域：♨️ 溫泉（島嶼擴建）"],
    75: ["新區域：🌷 花園（島嶼擴建）"],
    80: ["新區域：⚓ 碼頭市場（島嶼擴建）"],
    85: ["溫泉可以升到 15 級"],
    90: ["花園可以種稀有花"],
    99: ["稱號「星露之神」"]
  };
  for (let lv = 71; lv <= 99; lv++) {
    const wish = lv === 99 ? ["wish_limited", 2] : lv % 10 === 0 ? ["wish_limited", 1] : lv % 5 === 0 ? ["wish_rare", 1] : null;
    D.levels.push({ lv, need: lv === 99 ? null : 3640 + (lv - 70) * 90, dew: 2100 + (lv - 70) * 40, wish, unlocks: UNLOCK[lv] || ["星露 +" + (2100 + (lv - 70) * 40)] });
  }

  /* ---------- 🗓️ 季節限定作物（只有那個月能種）＋季節料理 ---------- */
  const SEASON = [
    [1, "kumquat", "金桔", "🍊", "dish_kumquat_tea", "金桔檸檬茶", { lemon: 1 }],
    [2, "ume", "梅子", "🟢", "dish_ume", "紫蘇梅", {}],
    [3, "loquat", "枇杷", "🟡", "dish_loquat", "枇杷膏", {}],
    [4, "mulberry", "桑椹", "🫐", "dish_mulberry_jam", "桑椹果醬", {}],
    [5, "waxberry", "楊梅", "🔴", "dish_waxberry", "楊梅汁", {}],
    [6, "plum", "李子", "🟣", "dish_plum", "李子蜜餞", {}],
    [7, "rambutan", "紅毛丹", "🔴", "dish_rambutan", "紅毛丹冰沙", {}],
    [8, "sugarapple", "釋迦", "🍏", "dish_sugarapple", "釋迦冰淇淋", { milk: 1 }],
    [9, "pomelo", "文旦", "🟢", "dish_pomelo", "文旦柚香茶", {}],
    [10, "waterchestnut", "菱角", "🖤", "dish_waterchestnut", "菱角排骨湯", {}],
    [11, "roselle", "洛神花", "🌺", "dish_roselle", "洛神花茶", {}],
    [12, "yacon", "雪蓮果", "🤍", "dish_yacon", "雪蓮果沙拉", {}]
  ];
  const ART = {"kumquat": {"mw": 0.567, "cx": 0.504, "bot": 0.0, "ar": 1.217}, "ume": {"mw": 0.922, "cx": 0.494, "bot": 0.0, "ar": 1.138}, "loquat": {"mw": 0.746, "cx": 0.492, "bot": 0.0, "ar": 1.098}, "mulberry": {"mw": 0.784, "cx": 0.436, "bot": 0.0, "ar": 1.035}, "waxberry": {"mw": 0.798, "cx": 0.426, "bot": 0.0, "ar": 1.042}, "plum": {"mw": 0.94, "cx": 0.509, "bot": 0.0, "ar": 1.132}, "rambutan": {"mw": 0.766, "cx": 0.431, "bot": 0.0, "ar": 1.04}, "sugarapple": {"mw": 0.552, "cx": 0.437, "bot": 0.0, "ar": 0.851}, "pomelo": {"mw": 0.453, "cx": 0.529, "bot": 0.0, "ar": 0.818}, "waterchestnut": {"mw": 0.788, "cx": 0.514, "bot": 0.0, "ar": 0.699}, "roselle": {"mw": 0.45, "cx": 0.45, "bot": 0.0, "ar": 0.84}, "yacon": {"mw": 0.779, "cx": 0.525, "bot": 0.0, "ar": 0.828}};
  D.season = {};
  for (const [m, k, name, emoji, dk, dname, extra] of SEASON) {
    D.crops[k] = { name, zone: "菜田", lv: 1, hours: 2, baseHours: 8, rarity: "l", qty: 2, sell: 90, exp: 20, seed: 30, emoji, month: m, art: ART[k], icon: true };
    D.items[k] = { name, sell: 90, emoji, kind: "crop", tier: "l", img: `crop/${k}_i.webp` };
    const need = Object.assign({ [k]: 3 }, extra);
    D.dishes[dk] = { name: dname, tier: "季節限定", lv: 1, need, sell: 520, exp: 60, minutes: 10, img: true, gacha: false, rar: "l", month: m, emoji: "🍹" };
    D.items[dk] = { name: dname, sell: 520, emoji: "🍹", kind: "dish", tier: "l", img: `dish/${dk}.webp` };
    D.season[m] = { crop: k, dish: dk };
  }

  /* ---------- 🏝️ 島嶼擴建 ---------- */
  D.island = {
    spring: { lv: 71, max: 10, max85: 15, cost: n => 1500 * n * n, eff: 0.02 },     // 每級動物產出快 2%
    garden: {
      lv: 75,
      flowers: [
        ["f_daisy", "雛菊", "🌼", 800, 2, 0],
        ["f_tulip", "鬱金香", "🌷", 2000, 5, 0],
        ["f_rose", "玫瑰", "🌹", 5000, 12, 0],
        ["f_sunflower", "向日葵花海", "🌻", 9000, 22, 0],
        ["f_hibiscus", "扶桑花", "🌺", 15000, 35, 0],
        ["f_lotus", "金蓮花", "🪷", 30000, 70, 90],
        ["f_aurora", "極光花", "💠", 60000, 140, 90]
      ],
      max: 20
    },
    dock: {
      lv: 80,
      offers: [
        ["wish_normal", "🫙 普通星願瓶", 4000, 30],
        ["gacha_coin", "🪙 扭蛋幣", 3000, 30],
        ["scratch_card", "🎫 刮刮樂", 2500, 30],
        ["wish_rare", "💎 稀有星願瓶", 12000, 18],
        ["ticket_normal", "🎫 普通召喚券", 8000, 18],
        ["chest_gold", "🧰 金寶箱", 15000, 12],
        ["ticket_special", "🎟️ 特殊召喚券", 20000, 8],
        ["wish_limited", "🌠 限定星願瓶", 40000, 3]
      ]
    }
  };
})();
