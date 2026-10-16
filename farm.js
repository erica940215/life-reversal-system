/* =========================================================
   🏝️ 序光計畫：星露島（生活線農場）
   只在主頁「遊戲模式：開」的時候出現（導覽列多一個「星露島」分頁）。

   需要先載入：script.js（db、currentUser、getToday、shiftDate…）、
   game.js（遊戲模式開關）、farm-data.js（作物、動物、料理、等級資料）。

   存檔：Supabase 的 farm_saves（sql/2026-10-16_星露島.sql）。
   資料庫還沒設定時先存在這台裝置的瀏覽器，設定好之後會自動搬上去。
========================================================= */

const FARM_JS_VERSION = "2026-10-16 v3";

(function () {

  "use strict";

  const D = window.FARM_DATA;

  if (!D) {
    console.warn("星露島：找不到 farm-data.js");
    return;
  }

  const IMG = "img/farm/";
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;

  /* 地圖座標（1 單位 ≈ 手機上 0.7px） */
  const MAP_W = 1500;
  const MAP_H = 1480;
  const FX = 750;          // 菜田 8×8 的中心（湖的南邊）
  const FY = 800;
  const HOME = { x: 750, y: 640 };   // 一打開畫面的中心：湖和菜田之間
  const TW = 36;           // 田格半寬
  const TH = 18;           // 田格半高
  const TT = 7;            // 田格厚度
  const FIELD_MAX = 8;

  /* 建築圖的原始大小（算比例用） */
  const BLD = {
    hut: [520, 483], kitchen: [520, 447], restaurant: [516, 520], bistro: [520, 400],
    waterwheel: [520, 435], barn: [520, 409], ranchgate: [520, 386], market: [520, 413], pier: [520, 337]
  };

  const RARITY_NAME = { c: "普通", r: "稀有", l: "傳說", x: "限定" };
  const TIER_CLASS = { 家常: "r-c", 拿手: "r-r", 招牌: "r-l", 傳說: "r-x" };


  /* =========================================================
     1. 小工具
  ========================================================= */

  const now = () => Date.now();

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function num(n) {
    return Number(n || 0).toLocaleString("en-US");
  }

  function f1(n) {
    return Math.round(n * 10) / 10;
  }

  function dur(ms) {
    if (ms <= 0) return "好了";
    const s = Math.ceil(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h >= 24) return `${Math.floor(h / 24)}天${h % 24}時`;
    if (h > 0) return `${h}時${String(m).padStart(2, "0")}分`;
    if (m > 0) return `${m}分${String(sec).padStart(2, "0")}秒`;
    return `${sec}秒`;
  }

  function hoursText(h) {
    if (h >= 24 && h % 24 === 0) return `${h / 24} 天`;
    if (h < 1) return `${Math.round(h * 60)} 分鐘`;
    return `${h} 小時`;
  }

  function capRow(table, lv) {
    let row = table[0];
    for (const t of table) if (t[0] <= lv) row = t;
    return row;
  }

  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function todayKey() {
    return typeof getToday === "function" ? getToday() : new Date().toISOString().slice(0, 10);
  }

  function shiftDay(dateText, n) {
    if (typeof shiftDate === "function") return shiftDate(dateText, n);
    const d = new Date(dateText + "T12:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function uid() {
    return (typeof currentUser !== "undefined" && currentUser) ? currentUser.id : null;
  }

  function storeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function storeSet(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) { /* 存不了就算了 */ }
  }


  /* ---------- 圖片 ---------- */

  function itemName(key) {
    return D.items[key]?.name || D.dishes[key]?.name || key;
  }

  function itemSrc(key) {
    const it = D.items[key];
    return it && it.img ? IMG + it.img : null;
  }

  function itemIcon(key, cls = "") {
    const src = itemSrc(key);
    if (src) return `<img class="${cls}" src="${src}" alt="" loading="lazy" draggable="false">`;
    const emo = D.items[key]?.emoji || "📦";
    return `<span class="fm-emo ${cls}">${emo}</span>`;
  }

  function cropStageSrc(key, stage) {
    const c = D.crops[key];
    return c && c.art ? `${IMG}crop/${key}_${stage}.webp` : null;
  }

  function animalSrc(sp, adult) {
    const a = D.animals[sp];
    if (!a) return null;
    if (adult && a.img.adult) return `${IMG}animal/${sp}_adult.webp`;
    if (!adult && a.img.baby) return `${IMG}animal/${sp}_baby.webp`;
    return null;
  }

  function animalIcon(sp, adult, cls = "") {
    const src = animalSrc(sp, adult);
    if (src) return `<img class="${cls}" src="${src}" alt="" loading="lazy" draggable="false">`;
    return `<span class="fm-emo ${cls}">${D.animals[sp]?.emoji || "🐾"}</span>`;
  }

  function rarityClass(key) {
    if (D.dishes[key]) return TIER_CLASS[D.dishes[key].tier] || "r-d";
    const c = D.crops[key];
    if (c) return "r-" + c.rarity;
    if (key && key.startsWith("seed_")) return "r-r";
    return "r-c";
  }


  /* =========================================================
     2. 規則：等級、容量
  ========================================================= */

  let S = null;            // 存檔（整個農場的狀態）

  const lvNeed = lv => (D.levels[lv - 1] && D.levels[lv - 1].need) || 0;

  function waterCap(lv = S.lv) {
    const row = capRow(D.caps.water, lv);
    return { buckets: row[1], per: row[2], max: row[1] * row[2] };
  }

  function fieldMaxSize(lv = S.lv) {
    return capRow(D.caps.field, lv)[1];
  }

  function fieldNextExpand() {
    return D.caps.field.find(r => r[1] === S.field.size + 1) || null;
  }

  function storageCap(lv = S.lv) {
    return capRow(D.caps.storage, lv)[1];
  }

  function sprinklerCap(lv = S.lv) {
    return lv >= D.caps.sprinkler[0][0] ? capRow(D.caps.sprinkler, lv)[1] : 0;
  }

  function orchardSlots(lv = S.lv) {
    return lv >= D.caps.orchard[0][0] ? capRow(D.caps.orchard, lv)[1] : 0;
  }

  function logSlots(lv = S.lv) {
    return lv >= D.caps.logs[0][0] ? capRow(D.caps.logs, lv)[1] : 0;
  }

  function kitchenTier() {
    return D.caps.kitchen[S.kitchen.tier] || D.caps.kitchen[0];
  }

  function kitchenNext() {
    return D.caps.kitchen[S.kitchen.tier + 1] || null;
  }

  function animalCap(sp) {
    const base = D.animals[sp].cap;
    return S.lv >= D.caps.animalDouble ? base * 2 : base;
  }

  function zoneLv(zone) {
    return D.zones[zone] ? D.zones[zone].lv : 1;
  }

  function zoneUnlocked(zone) {
    return S.lv >= zoneLv(zone);
  }

  /* 有花錢開墾的區域 */
  const ZONE_KEY = { 菇棚: "logs", 果園: "orchard", 香草園: "herb", 茶園: "tea", 溫室: "green", 加工坊: "workshop" };

  function zoneOpen(zone) {
    if (!zoneUnlocked(zone)) return false;
    const key = ZONE_KEY[zone];
    if (!key) return true;
    return !!(S[key] && S[key].open);
  }

  function isRainDay(dateText = todayKey()) {
    return hash(dateText + ":rain") % 7 === 0;
  }

  function machineMinutes(rec) {
    return S.lv >= D.caps.workshopHalf ? Math.max(1, Math.round(rec.minutes / 2)) : rec.minutes;
  }


  /* =========================================================
     3. 存檔的樣子
  ========================================================= */

  function newState() {

    const t = now();

    return {
      v: 1,
      created: t,
      lv: 1,
      exp: 0,
      dew: 200,
      water: waterCapFor(1).max,
      inv: { egg: 3, feed: 10, fert: 3 },
      field: { size: 3, plots: {} },
      herb: { open: false, plots: {} },
      green: { open: false, plots: {} },
      orchard: { open: false, trees: {} },
      logs: { open: false, slots: {} },
      tea: { open: false, bushes: {} },
      bamboo: { last: t },
      workshop: { open: false },
      kitchen: { tier: 0, jobs: [] },
      mach: {},
      ranch: {
        next: 3,
        animals: [
          { id: 1, sp: "chicken", adult: true, fed: false, t1: null },
          { id: 2, sp: "chicken", adult: true, fed: false, t1: null }
        ],
        breed: {},
        inc: []
      },
      known: { crops: {}, dishes: {}, recipes: {}, animals: { chicken: 1 } },
      goals: null,
      orders: null,
      day: null,
      wcred: {},
      seenLv: 1,
      title: null,
      stats: { harvest: 0, cook: 0, plant: 0 }
    };

  }

  function waterCapFor(lv) {
    const row = capRow(D.caps.water, lv);
    return { max: row[1] * row[2] };
  }

  /* 舊存檔缺的欄位補上 */
  function fixState(st) {

    const base = newState();

    for (const key of Object.keys(base)) {
      if (st[key] === undefined) st[key] = base[key];
    }

    for (const key of ["field", "herb", "green", "orchard", "logs", "tea", "bamboo", "workshop", "kitchen", "ranch", "known", "stats"]) {
      if (!st[key] || typeof st[key] !== "object") st[key] = base[key];
      for (const sub of Object.keys(base[key])) {
        if (st[key][sub] === undefined) st[key][sub] = base[key][sub];
      }
    }

    if (!st.inv || typeof st.inv !== "object") st.inv = {};
    if (!Array.isArray(st.kitchen.jobs)) st.kitchen.jobs = [];
    if (!Array.isArray(st.ranch.animals)) st.ranch.animals = [];
    if (!Array.isArray(st.ranch.inc)) st.ranch.inc = [];

    st.lv = Math.min(50, Math.max(1, st.lv | 0));

    return st;

  }


  /* =========================================================
     4. 倉庫
  ========================================================= */

  const NOT_STORED = key => key === "fert" || key.startsWith("seed_");

  function invUsed() {
    let n = 0;
    for (const [key, qty] of Object.entries(S.inv)) {
      if (qty > 0 && !NOT_STORED(key)) n += qty;
    }
    return n;
  }

  function invSpace() {
    return Math.max(0, storageCap() - invUsed());
  }

  function have(key) {
    return S.inv[key] || 0;
  }

  /* 放進倉庫，回傳實際放進幾個（倉庫滿了會少放） */
  function addItem(key, qty) {
    if (qty <= 0) return 0;
    const room = NOT_STORED(key) ? qty : Math.min(qty, invSpace());
    if (room > 0) S.inv[key] = have(key) + room;
    return room;
  }

  function takeItem(key, qty) {
    if (have(key) < qty) return false;
    S.inv[key] = have(key) - qty;
    if (S.inv[key] <= 0) delete S.inv[key];
    return true;
  }

  function hasAll(need, times = 1) {
    return Object.entries(need).every(([k, q]) => have(k) >= q * times);
  }

  function takeAll(need) {
    if (!hasAll(need)) return false;
    for (const [k, q] of Object.entries(need)) takeItem(k, q);
    return true;
  }


  /* =========================================================
     5. 經驗、星露、等級
  ========================================================= */

  let pendingLevelClaim = false;

  function addDew(n) {
    S.dew = Math.max(0, Math.round(S.dew + n));
  }

  function addExp(n) {

    if (n <= 0 || S.lv >= 50) return;

    S.exp += Math.round(n);

    let up = false;

    while (S.lv < 50 && S.exp >= lvNeed(S.lv)) {

      S.exp -= lvNeed(S.lv);
      S.lv += 1;
      up = true;

      const info = D.levels[S.lv - 1];
      addDew(info.dew);

      if (info.wish) pendingLevelClaim = true;

      if (S.lv === 50) {
        S.title = "星露島主";
        if (!S.ranch.animals.some(a => a.sp === "deer")) {
          S.ranch.animals.push({ id: S.ranch.next++, sp: "deer", adult: true, fed: true, t1: now() + D.animals.deer.every * HOUR });
          S.known.animals.deer = 1;
        }
      }

    }

    if (S.lv >= 50) S.exp = 0;

    if (up) {
      /* 水車變大就順便裝滿多出來的那部分 */
      S.water = Math.min(waterCap().max, S.water);
      saveSoon(true);
    }

  }

  function spend(n) {
    if (S.dew < n) {
      toast(`星露不夠：需要 ${num(n)}，你有 ${num(S.dew)}`);
      return false;
    }
    addDew(-n);
    return true;
  }


  /* =========================================================
     6. 每日：小目標、餐廳點餐、水車每日一桶
  ========================================================= */

  const GOAL_TYPES = [
    { k: "harvest", name: "收成作物", icon: "🌾", lv: 1, n: lv => 5 + Math.floor(lv / 4) },
    { k: "plant", name: "種下作物", icon: "🌱", lv: 1, n: lv => 6 + Math.floor(lv / 4) },
    { k: "animal", name: "收畜產品", icon: "🥚", lv: 1, n: lv => 3 + Math.floor(lv / 10) },
    { k: "feed", name: "餵動物", icon: "🐔", lv: 1, n: lv => 2 + Math.floor(lv / 10) },
    { k: "cook", name: "做料理", icon: "🍳", lv: 1, n: lv => 1 + Math.floor(lv / 15) },
    { k: "sell", name: "在市集賣東西", icon: "🪙", lv: 3, n: () => 3 },
    { k: "process", name: "加工", icon: "⚙️", lv: 10, n: () => 2 }
  ];

  const GOAL_EXP = 20;
  const GOAL_DEW = 30;

  function makeGoals(day) {
    const pool = GOAL_TYPES.filter(g => S.lv >= g.lv);
    const seed = hash(day + ":" + (uid() || ""));
    const picked = [];
    let i = 0;
    while (picked.length < 3 && i < 40) {
      const g = pool[(seed + i * 7919) % pool.length];
      if (!picked.includes(g)) picked.push(g);
      i++;
    }
    return { day, list: picked.map(g => ({ k: g.k, n: g.n(S.lv), got: 0, claimed: false })) };
  }

  function goalAdd(k, amount = 1) {
    if (!S.goals) return;
    for (const g of S.goals.list) {
      if (g.k === k && !g.claimed) g.got = Math.min(g.n, g.got + amount);
    }
  }

  function makeOrders(day) {
    const known = Object.keys(D.dishes).filter(k => dishKnown(k) && !D.dishes[k].gacha);
    if (!known.length) return { day, list: [] };
    const seed = hash(day + ":orders");
    const list = [];
    for (let i = 0; i < 3; i++) {
      const k = known[(seed + i * 104729) % known.length];
      list.push({ d: k, done: false });
    }
    return { day, list };
  }

  function newDayCheck() {

    const day = todayKey();

    if (S.day === day) return false;

    const firstEver = S.day === null;
    S.day = day;
    S.goals = makeGoals(day);
    S.orders = kitchenTier()[1] === "restaurant" || kitchenTier()[1] === "bistro" ? makeOrders(day) : null;

    /* Lv45：水車每天自己送 1 桶 */
    if (!firstEver && S.lv >= D.caps.dailyBucket) {
      const cap = waterCap();
      S.water = Math.min(cap.max, S.water + cap.per);
    }

    /* 只留最近 3 天的習慣澆水紀錄 */
    const keep = [day, shiftDay(day, -1), shiftDay(day, -2)];
    for (const d of Object.keys(S.wcred)) if (!keep.includes(d)) delete S.wcred[d];

    return true;

  }


  /* =========================================================
     7. 田地（菜田、香草園、溫室）
  ========================================================= */

  /* 菜田的格子：8×8 的左上角 size×size 是開墾好的田 */
  function fieldKeys() {
    const keys = [];
    for (let r = 0; r < S.field.size; r++) for (let c = 0; c < S.field.size; c++) keys.push(r + "_" + c);
    return keys;
  }

  function plotZone(zone) {
    if (zone === "field") return { store: S.field.plots, keys: fieldKeys(), cropZone: "菜田", water: true, name: "菜田" };
    if (zone === "herb") return { store: S.herb.plots, keys: [...Array(D.caps.herbPlots).keys()].map(String), cropZone: "香草園", water: true, name: "香草園" };
    if (zone === "green") return { store: S.green.plots, keys: [...Array(D.caps.greenPlots).keys()].map(String), cropZone: "溫室", water: false, name: "溫室" };
    return null;
  }

  /* 灑水器旁邊 8 格不用澆水 */
  function nearSprinkler(key) {
    const [r, c] = key.split("_").map(Number);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const p = S.field.plots[(r + dr) + "_" + (c + dc)];
        if (p && p.s) return true;
      }
    }
    return false;
  }

  function needsWater(zone, key) {
    const z = plotZone(zone);
    if (!z.water) return false;
    if (isRainDay()) return false;
    if (zone === "field" && nearSprinkler(key)) return false;
    return true;
  }

  function plotState(p) {
    if (!p) return "empty";
    if (p.s) return "sprinkler";
    if (!p.t1) return "thirsty";
    return now() >= p.t1 ? "ripe" : "growing";
  }

  function cropsForZone(cropZone) {
    return Object.entries(D.crops)
      .filter(([k, c]) => c.zone === cropZone)
      .map(([k]) => k);
  }

  function cropAvailable(k) {
    const c = D.crops[k];
    if (c.lv === 0) return have("seed_" + k) > 0;
    return S.lv >= c.lv;
  }

  function seedCost(k) {
    const c = D.crops[k];
    return c.lv === 0 ? 0 : (c.seed || 0);
  }

  /* 種一格：回傳 "ok" / "thirsty"（種下但沒水） / 錯誤訊息 */
  function plantOne(zone, key, crop) {

    const z = plotZone(zone);
    const c = D.crops[crop];

    if (!c || c.zone !== z.cropZone) return "這裡不能種這個";
    if (!cropAvailable(crop)) return "還沒解鎖";
    if (z.store[key]) return "這格已經有東西了";

    if (c.lv === 0) {
      if (!takeItem("seed_" + crop, 1)) return "種子不夠";
    } else if (S.dew < seedCost(crop)) {
      return "星露不夠";
    } else {
      addDew(-seedCost(crop));
    }

    const p = { c: crop, t0: now(), t1: null, f: false };

    if (!needsWater(zone, key)) {
      p.t1 = now() + c.hours * HOUR;
    } else if (S.water > 0) {
      S.water -= 1;
      p.t1 = now() + c.hours * HOUR;
    }

    z.store[key] = p;
    S.stats.plant = (S.stats.plant || 0) + 1;
    goalAdd("plant");

    return p.t1 ? "ok" : "thirsty";

  }

  function waterOne(zone, key) {
    const z = plotZone(zone);
    const p = z.store[key];
    if (!p || p.s || p.t1) return false;
    if (needsWater(zone, key)) {
      if (S.water <= 0) return false;
      S.water -= 1;
    }
    p.t1 = now() + D.crops[p.c].hours * HOUR;
    return true;
  }

  function fertOne(zone, key) {
    const p = plotZone(zone).store[key];
    if (!p || p.s || p.f || plotState(p) !== "growing") return false;
    if (!takeItem("fert", 1)) return false;
    p.f = true;
    p.t1 = now() + (p.t1 - now()) / 2;
    return true;
  }

  /* 收成一格：回傳拿到的東西，倉庫滿了回傳 null */
  function harvestOne(zone, key) {

    const z = plotZone(zone);
    const p = z.store[key];

    if (plotState(p) !== "ripe") return null;

    const c = D.crops[p.c];

    if (invSpace() < c.qty) return null;

    addItem(p.c, c.qty);
    addExp(c.exp * c.qty);

    S.known.crops[p.c] = (S.known.crops[p.c] || 0) + c.qty;
    S.stats.harvest = (S.stats.harvest || 0) + 1;
    goalAdd("harvest");

    let seedBack = false;
    if (c.lv === 0 && Math.random() < 0.3) {
      addItem("seed_" + p.c, 1);
      seedBack = true;
    }

    delete z.store[key];

    return { crop: p.c, qty: c.qty, exp: c.exp * c.qty, seedBack };

  }


  /* =========================================================
     8. 果園、菇棚、竹林、茶園
  ========================================================= */

  const TREE_GROW = 24 * HOUR;

  function treeState(t) {
    if (!t) return "empty";
    if (now() < t.grown) return "growing";
    return now() >= t.next ? "ripe" : "waiting";
  }

  function plantTree(slot, crop) {
    const c = D.crops[crop];
    if (!c || c.zone !== "果園" || !cropAvailable(crop)) return "不能種";
    if (S.orchard.trees[slot]) return "這裡已經有樹了";
    if (!spend(c.seed)) return "星露不夠";
    const t0 = now();
    S.orchard.trees[slot] = { c: crop, t0, grown: t0 + TREE_GROW, next: t0 + TREE_GROW + c.hours * HOUR };
    goalAdd("plant");
    return "ok";
  }

  function harvestTree(slot) {
    const t = S.orchard.trees[slot];
    if (treeState(t) !== "ripe") return null;
    const c = D.crops[t.c];
    if (invSpace() < c.qty) return null;
    addItem(t.c, c.qty);
    addExp(c.exp * c.qty);
    S.known.crops[t.c] = (S.known.crops[t.c] || 0) + c.qty;
    goalAdd("harvest");
    t.next = now() + c.hours * HOUR;
    return { crop: t.c, qty: c.qty, exp: c.exp * c.qty };
  }

  function logState(l) {
    if (!l) return "empty";
    return now() >= l.next ? "ripe" : "growing";
  }

  function plantLog(slot, crop) {
    const c = D.crops[crop];
    if (!c || c.zone !== "菇棚" || !cropAvailable(crop)) return "不能放";
    if (S.logs.slots[slot]) return "這裡已經有菇木了";
    if (!spend(c.seed)) return "星露不夠";
    S.logs.slots[slot] = { c: crop, next: now() + c.hours * HOUR, left: 4 };
    goalAdd("plant");
    return "ok";
  }

  function harvestLog(slot) {
    const l = S.logs.slots[slot];
    if (logState(l) !== "ripe") return null;
    const c = D.crops[l.c];
    if (invSpace() < c.qty) return null;
    addItem(l.c, c.qty);
    addExp(c.exp * c.qty);
    S.known.crops[l.c] = (S.known.crops[l.c] || 0) + c.qty;
    goalAdd("harvest");
    l.left -= 1;
    const crop = l.c;
    if (l.left <= 0) delete S.logs.slots[slot];
    else l.next = now() + c.hours * HOUR;
    return { crop, qty: c.qty, exp: c.exp * c.qty, used: l.left <= 0 };
  }

  function bambooReady() {
    if (!zoneUnlocked("竹林")) return 0;
    const every = D.caps.bambooEvery * HOUR;
    return Math.min(D.caps.bambooMax, Math.floor((now() - S.bamboo.last) / every));
  }

  function bambooNextAt() {
    const every = D.caps.bambooEvery * HOUR;
    return S.bamboo.last + (bambooReady() + 1) * every;
  }

  function harvestBamboo() {
    const n = bambooReady();
    if (n <= 0) return null;
    const c = D.crops.bamboo;
    const qty = n * c.qty;
    if (invSpace() < qty) return null;
    addItem("bamboo", qty);
    addExp(c.exp * qty);
    S.known.crops.bamboo = (S.known.crops.bamboo || 0) + qty;
    goalAdd("harvest", n);
    const every = D.caps.bambooEvery * HOUR;
    S.bamboo.last = n >= D.caps.bambooMax ? now() : S.bamboo.last + n * every;
    return { crop: "bamboo", qty, exp: c.exp * qty };
  }

  function teaState(b) {
    if (!b) return "empty";
    if (now() < b.grown) return "growing";
    return now() >= b.next ? "ripe" : "waiting";
  }

  function plantTea(slot) {
    const c = D.crops.tea;
    if (S.tea.bushes[slot]) return "這裡已經有茶樹了";
    if (!spend(c.seed)) return "星露不夠";
    const t0 = now();
    S.tea.bushes[slot] = { t0, grown: t0 + TREE_GROW, next: t0 + TREE_GROW + c.hours * HOUR };
    goalAdd("plant");
    return "ok";
  }

  function harvestTea(slot) {
    const b = S.tea.bushes[slot];
    if (teaState(b) !== "ripe") return null;
    const c = D.crops.tea;
    if (invSpace() < c.qty) return null;
    addItem("tea", c.qty);
    addExp(c.exp * c.qty);
    S.known.crops.tea = (S.known.crops.tea || 0) + c.qty;
    goalAdd("harvest");
    b.next = now() + c.hours * HOUR;
    return { crop: "tea", qty: c.qty, exp: c.exp * c.qty };
  }


  /* =========================================================
     9. 料理
  ========================================================= */

  function dishKnown(k) {
    const d = D.dishes[k];
    if (!d) return false;
    if (d.gacha) return !!S.known.recipes[k];
    return S.lv >= d.lv;
  }

  function stoveCount() {
    return kitchenTier()[3];
  }

  function freeStoves() {
    return stoveCount() - S.kitchen.jobs.length;
  }

  function cookDish(k) {
    const d = D.dishes[k];
    if (!dishKnown(k)) return "還沒學會這道菜";
    if (freeStoves() <= 0) return "爐子都在用";
    if (!takeAll(d.need)) return "食材不夠";
    S.kitchen.jobs.push({ d: k, t1: now() + d.minutes * MIN });
    return "ok";
  }

  function collectDish(i) {
    const job = S.kitchen.jobs[i];
    if (!job || now() < job.t1) return null;
    if (invSpace() < 1) return null;
    const d = D.dishes[job.d];
    addItem(job.d, 1);
    addExp(d.exp);
    S.known.dishes[job.d] = (S.known.dishes[job.d] || 0) + 1;
    S.stats.cook = (S.stats.cook || 0) + 1;
    goalAdd("cook");
    S.kitchen.jobs.splice(i, 1);
    return { dish: job.d, exp: d.exp };
  }

  function serveOrder(i) {
    const o = S.orders && S.orders.list[i];
    if (!o || o.done) return false;
    if (!takeItem(o.d, 1)) return false;
    const d = D.dishes[o.d];
    o.done = true;
    addDew(Math.round(d.sell * 1.5));
    addExp(10);
    return true;
  }


  /* =========================================================
     10. 加工（飼料機在牧場，其他在加工坊）
  ========================================================= */

  const QUEUE_MAX = 3;

  function machineOpen(m) {
    const info = D.machines[m];
    if (S.lv < info.lv) return false;
    return info.where === "ranch" || S.workshop.open;
  }

  function machineQueue(m) {
    if (!S.mach[m]) S.mach[m] = [];
    return S.mach[m];
  }

  function startRecipe(rk) {
    const r = D.recipes[rk];
    if (!r || S.lv < r.lv) return "還沒解鎖";
    if (!machineOpen(r.machine)) return "機器還沒開";
    const q = machineQueue(r.machine);
    if (q.length >= QUEUE_MAX) return "排隊滿了";
    if (!takeAll(r.need)) return "材料不夠";
    const start = q.length ? Math.max(now(), q[q.length - 1].t1) : now();
    q.push({ r: rk, t1: start + machineMinutes(r) * MIN });
    return "ok";
  }

  function collectMachine(m) {
    const q = machineQueue(m);
    let got = 0;
    const out = [];
    while (q.length && now() >= q[0].t1) {
      const r = D.recipes[q[0].r];
      if (invSpace() < r.qty) break;
      addItem(r.out, r.qty);
      addExp(3);
      goalAdd("process");
      out.push(r.out);
      q.shift();
      got++;
    }
    return got ? out : null;
  }

  function machineReadyCount(m) {
    return machineQueue(m).filter(j => now() >= j.t1).length;
  }


  /* =========================================================
     11. 牧場
  ========================================================= */

  function animalsOf(sp) {
    return S.ranch.animals.filter(a => a.sp === sp);
  }

  function animalState(a) {
    const info = D.animals[a.sp];
    if (!a.adult) {
      if (!a.fed) return "hungry";
      return now() >= a.t1 ? "grown" : "growing";
    }
    if (info.feed > 0 && !a.fed) return "hungry";
    return a.t1 && now() >= a.t1 ? "ready" : "working";
  }

  function feedAnimal(a) {
    const info = D.animals[a.sp];
    if (animalState(a) !== "hungry") return false;
    const n = info.feed;
    if (n > 0 && !takeItem("feed", n)) return false;
    a.fed = true;
    a.t1 = now() + (a.adult ? info.every : info.grow) * HOUR;
    goalAdd("feed");
    return true;
  }

  function collectAnimal(a) {
    if (animalState(a) !== "ready") return null;
    const info = D.animals[a.sp];
    if (invSpace() < 1) return null;
    addItem(info.product, 1);
    addExp(info.exp);
    S.known.crops[info.product] = (S.known.crops[info.product] || 0) + 1;
    goalAdd("animal");
    if (info.feed > 0) {
      a.fed = false;
      a.t1 = null;
    } else {
      a.t1 = now() + info.every * HOUR;
    }
    return { item: info.product, exp: info.exp };
  }

  function slaughter(a) {
    const info = D.animals[a.sp];
    if (!a.adult || !info.meat) return null;
    const [meat, qty] = info.meat;
    if (invSpace() < qty) return null;
    addItem(meat, qty);
    S.ranch.animals = S.ranch.animals.filter(x => x.id !== a.id);
    return { item: meat, qty };
  }

  function buyAnimal(sp, adult) {
    const info = D.animals[sp];
    if (S.lv < info.lv) return "還沒解鎖";
    if (animalsOf(sp).length >= animalCap(sp)) return "住處滿了";
    const price = adult ? info.adultPrice : info.babyPrice;
    if (!price) return "不能買";
    if (!spend(price)) return "星露不夠";
    addAnimal(sp, adult);
    return "ok";
  }

  function addAnimal(sp, adult) {
    const info = D.animals[sp];
    const a = { id: S.ranch.next++, sp, adult, fed: false, t1: null };
    if (adult && info.feed === 0) {
      a.fed = true;
      a.t1 = now() + info.every * HOUR;
    }
    S.ranch.animals.push(a);
    S.known.animals[sp] = (S.known.animals[sp] || 0) + 1;
    return a;
  }

  /* 孵蛋器 */
  const EGG_SPECIES = { egg: "chicken", duckegg: "duck", ostrichegg: "ostrich" };

  function incubate(egg) {
    const sp = EGG_SPECIES[egg];
    if (!sp || S.lv < D.zones["孵蛋器"].lv || S.lv < D.animals[sp].lv) return "不能孵";
    if (S.ranch.inc.length >= D.caps.incubator) return "孵蛋器滿了";
    if (!takeItem(egg, 1)) return "沒有蛋";
    S.ranch.inc.push({ egg, t1: now() + D.animals[sp].hatchHours * HOUR });
    return "ok";
  }

  /* 時間到了要自動發生的事：幼崽長大、生小寶寶、孵蛋、自動餵食 */
  function processTimers() {

    let changed = newDayCheck();
    const t = now();

    for (const a of S.ranch.animals) {
      if (!a.adult && a.fed && a.t1 && t >= a.t1) {
        a.adult = true;
        a.fed = false;
        a.t1 = null;
        if (D.animals[a.sp].feed === 0) {
          a.fed = true;
          a.t1 = t + D.animals[a.sp].every * HOUR;
        }
        changed = true;
      }
    }

    for (const [sp, info] of Object.entries(D.animals)) {
      if (info.breed !== "pair" || S.lv < info.lv) continue;
      const hours = info.breedHours * HOUR;
      let guard = 0;
      while (guard++ < 20) {
        const list = animalsOf(sp);
        const eligible = list.filter(a => a.adult).length >= 2 && list.length < animalCap(sp);
        if (!eligible) {
          if (S.ranch.breed[sp]) { delete S.ranch.breed[sp]; changed = true; }
          break;
        }
        if (!S.ranch.breed[sp]) {
          S.ranch.breed[sp] = t + hours;
          changed = true;
          break;
        }
        if (t < S.ranch.breed[sp]) break;
        addAnimal(sp, false);
        S.ranch.breed[sp] += hours;
        changed = true;
      }
    }

    for (let i = S.ranch.inc.length - 1; i >= 0; i--) {
      const slot = S.ranch.inc[i];
      const sp = EGG_SPECIES[slot.egg];
      if (t >= slot.t1 && animalsOf(sp).length < animalCap(sp)) {
        addAnimal(sp, false);
        S.ranch.inc.splice(i, 1);
        changed = true;
      }
    }

    if (S.lv >= D.caps.autoFeed) {
      for (const a of S.ranch.animals) {
        if (animalState(a) === "hungry" && have("feed") >= D.animals[a.sp].feed) {
          feedAnimal(a);
          changed = true;
        }
      }
    }

    return changed;

  }


  /* =========================================================
     12. 市集
  ========================================================= */

  function sellPrice(key) {
    const it = D.items[key];
    if (!it || !it.sell) return 0;
    if (it.kind === "dish") return it.sell;
    return Math.max(1, Math.round(it.sell * D.market.sellRate));
  }

  function sellItem(key, qty) {
    const price = sellPrice(key);
    if (!price || have(key) < qty || qty <= 0) return 0;
    takeItem(key, qty);
    addDew(price * qty);
    goalAdd("sell", qty);
    return price * qty;
  }

  function buyItem(key, qty = 1) {
    const price = D.market.buy[key];
    if (!price) return "不能買";
    if (!NOT_STORED(key) && invSpace() < qty) return "倉庫滿了";
    if (!spend(price * qty)) return "星露不夠";
    addItem(key, qty);
    return "ok";
  }


  /* =========================================================
     13. 星願瓶
     資料庫扣一個瓶子、回傳 0–1 的亂數，這裡決定抽到什麼。
  ========================================================= */

  const WISH_NAMES = { wish_normal: "普通星願瓶", wish_rare: "稀有星願瓶", wish_limited: "限定星願瓶" };
  const WISH_JARS = { wish_normal: "🫙", wish_rare: "🔮", wish_limited: "🌙" };

  const WISH_POOLS = {
    wish_normal: [
      [0.35, { dew: [60, 150] }],
      [0.55, { item: "fert", qty: 3 }],
      [0.70, { item: "feed", qty: 10 }],
      [0.85, { crop5: true }],
      [0.93, { item: "seed_goldrice", qty: 3 }],
      [0.97, { item: "seed_rainbowcorn", qty: 3 }],
      [0.99, { recipe: "goldonigiri", fallback: 300 }],
      [1.00, { item: "seed_starherb", qty: 1 }]
    ],
    wish_rare: [
      [0.25, { dew: [300, 600] }],
      [0.40, { item: "fert", qty: 8 }],
      [0.55, { item: "seed_goldrice", qty: 5 }],
      [0.68, { item: "seed_rainbowcorn", qty: 5 }],
      [0.78, { recipe: "goldonigiri", fallback: 400 }],
      [0.86, { recipe: "rainbowsoup", fallback: 500 }],
      [0.93, { item: "seed_starherb", qty: 2 }],
      [0.97, { recipe: "starpudding", fallback: 700 }],
      [1.00, { item: "seed_moonlotus", qty: 1 }]
    ],
    wish_limited: [
      [0.25, { item: "seed_moonlotus", qty: 3 }],
      [0.40, { recipe: "moonlotustea", fallback: 1000 }],
      [0.55, { item: "seed_starherb", qty: 3 }],
      [0.80, { dew: [800, 800] }],
      [1.00, { item: "fert", qty: 15 }]
    ]
  };

  function wishReward(kind, roll) {

    const pool = WISH_POOLS[kind];
    let prev = 0;

    for (const [edge, reward] of pool) {

      if (roll < edge || edge === 1) {

        const t = (roll - prev) / Math.max(0.0001, edge - prev);

        if (reward.dew) {
          const n = Math.round(reward.dew[0] + (reward.dew[1] - reward.dew[0]) * t);
          addDew(n);
          return { text: `${num(n)} 星露`, icon: "🌟" };
        }

        if (reward.crop5) {
          const list = Object.keys(D.crops).filter(k => D.crops[k].lv > 0 && D.crops[k].lv <= S.lv && D.crops[k].zone === "菜田");
          const k = list[Math.floor(t * list.length) % list.length];
          const got = addItem(k, 5);
          if (got <= 0) { addDew(60); return { text: "倉庫滿了，換成 60 星露", icon: "🌟" }; }
          return { text: `${itemName(k)} ×${got}`, item: k };
        }

        if (reward.recipe) {
          if (S.known.recipes[reward.recipe]) {
            addDew(reward.fallback);
            return { text: `已經會「${D.dishes[reward.recipe].name}」了，換成 ${num(reward.fallback)} 星露`, icon: "🌟" };
          }
          S.known.recipes[reward.recipe] = 1;
          return { text: `新食譜：${D.dishes[reward.recipe].name}`, dish: reward.recipe, rare: true };
        }

        const got = addItem(reward.item, reward.qty);
        if (got <= 0) { addDew(60); return { text: "倉庫滿了，換成 60 星露", icon: "🌟" }; }
        return { text: `${itemName(reward.item)} ×${got}`, item: reward.item, rare: reward.item.startsWith("seed_") };

      }

      prev = edge;

    }

    return { text: "什麼都沒有", icon: "❔" };

  }


  /* =========================================================
     14. 存檔：Supabase（farm_saves），還沒設定就先存在瀏覽器
  ========================================================= */

  const net = {
    loaded: false,
    loading: false,
    userId: null,
    rev: 0,
    mode: "server",        // server / local
    saving: false,
    dirty: false,
    timer: null,
    error: null,
    wish: {}                // 星願瓶數量
  };

  const localKey = () => "fm_save_" + (uid() || "guest");

  function isMissingTable(error) {
    if (!error) return false;
    const code = String(error.code || "");
    const msg = String(error.message || "");
    return code === "42P01" || code === "PGRST205" || code === "PGRST202" || code === "42883" ||
      /farm_saves|farm_save|does not exist|schema cache/i.test(msg);
  }

  async function loadSave() {

    net.loading = true;

    let state = null;
    let rev = 0;
    let mode = "server";

    const local = (() => {
      try { return JSON.parse(storeGet(localKey()) || "null"); } catch (e) { return null; }
    })();

    try {
      const { data, error } = await db
        .from("farm_saves")
        .select("state, rev")
        .eq("user_id", uid())
        .maybeSingle();

      if (error) throw error;

      if (data && data.state && Object.keys(data.state).length) {
        state = data.state;
        rev = data.rev || 0;
      }

    } catch (error) {
      if (isMissingTable(error)) {
        mode = "local";
      } else {
        console.warn("星露島存檔載入失敗：", error);
        net.error = error.message || String(error);
      }
    }

    /* 之前只存在瀏覽器、現在資料庫好了 → 用比較新的那份 */
    if (local && local.state && (!state || (local.state.saved || 0) > (state.saved || 0))) {
      state = local.state;
      if (mode === "server") net.dirty = true;
    }

    S = fixState(state || newState());
    net.rev = rev;
    net.mode = mode;
    net.loaded = true;
    net.loading = false;
    net.userId = uid();

    processTimers();

    if (!state) net.dirty = true;

  }

  async function loadWishCounts() {
    try {
      const { data, error } = await db
        .from("player_items")
        .select("item_key, qty")
        .eq("user_id", uid())
        .in("item_key", ["wish_normal", "wish_rare", "wish_limited"]);
      if (error) throw error;
      net.wish = {};
      for (const row of data || []) net.wish[row.item_key] = row.qty;
    } catch (error) {
      console.warn("星願瓶數量載入失敗：", error);
    }
  }

  function saveSoon(now_ = false) {
    if (!S) return;
    net.dirty = true;
    clearTimeout(net.timer);
    net.timer = setTimeout(() => saveNow(), now_ ? 50 : 1500);
  }

  async function saveNow() {

    if (!S || !net.dirty || !uid() || net.userId !== uid()) return;

    if (net.saving) {
      clearTimeout(net.timer);
      net.timer = setTimeout(() => saveNow(), 600);
      return;
    }

    net.saving = true;
    net.dirty = false;
    S.saved = now();

    const snapshot = JSON.parse(JSON.stringify(S));

    storeSet(localKey(), JSON.stringify({ state: snapshot }));

    if (net.mode === "local") {
      net.saving = false;
      afterSave();
      return;
    }

    try {
      const { data, error } = await db.rpc("farm_save", { p_state: snapshot, p_rev: net.rev });
      if (error) throw error;

      if (data && data.ok) {
        net.rev = data.rev;
        net.error = null;
      } else if (data && data.conflict) {
        await reloadAfterConflict();
      }

    } catch (error) {
      if (isMissingTable(error)) {
        net.mode = "local";
        renderHud();
      } else {
        console.warn("星露島存檔失敗：", error);
        net.dirty = true;
        net.error = error.message || String(error);
      }
    }

    net.saving = false;
    afterSave();

  }

  async function reloadAfterConflict() {
    const { data } = await db.from("farm_saves").select("state, rev").eq("user_id", uid()).maybeSingle();
    if (data && data.state) {
      S = fixState(data.state);
      net.rev = data.rev;
      toast("別的裝置或分頁存過更新的進度，已經換成那一份");
      renderAll();
    }
  }

  /* 升級時資料庫要發星願瓶（看存檔裡的等級） */
  async function afterSave() {
    if (!pendingLevelClaim || net.mode !== "server" || net.dirty) return;
    pendingLevelClaim = false;
    try {
      const { data, error } = await db.rpc("farm_claim_levels");
      if (error) throw error;
      const items = data || [];
      if (items.length) {
        for (const it of items) net.wish[it.key] = (net.wish[it.key] || 0) + it.qty;
        if (typeof gameCheckinState !== "undefined" && gameCheckinState.items) {
          for (const it of items) gameCheckinState.items[it.key] = (gameCheckinState.items[it.key] || 0) + it.qty;
        }
        toast("🌠 拿到 " + items.map(it => `${WISH_NAMES[it.key]} ×${it.qty}`).join("、"));
        renderHud();
      }
    } catch (error) {
      console.warn("等級星願瓶領取失敗：", error);
      pendingLevelClaim = true;
    }
  }


  /* =========================================================
     15. 習慣打卡 → 水車裝水
     同一個習慣同一天只算一次（取消再打卡不會重複裝水）
  ========================================================= */

  async function creditHabitWater(showToast_ = true) {

    if (!S || !uid()) return { buckets: 0, wasted: 0 };

    const day = todayKey();
    const yesterday = shiftDay(day, -1);

    let rows = [];

    try {
      const { data, error } = await db
        .from("habit_logs")
        .select("habit_id, log_date, is_makeup")
        .eq("user_id", uid())
        .gte("log_date", yesterday)
        .limit(500);
      if (error) throw error;
      rows = data || [];
    } catch (error) {
      console.warn("讀取習慣打卡失敗：", error);
      return { buckets: 0, wasted: 0 };
    }

    const cap = waterCap();
    let buckets = 0;
    let wasted = 0;

    for (const row of rows) {
      if (row.is_makeup) continue;
      const list = S.wcred[row.log_date] || (S.wcred[row.log_date] = []);
      if (list.includes(row.habit_id)) continue;
      list.push(row.habit_id);
      if (S.water + cap.per <= cap.max) {
        S.water += cap.per;
        buckets++;
      } else if (S.water < cap.max) {
        S.water = cap.max;
        buckets++;
      } else {
        wasted++;
      }
    }

    if (buckets || wasted) {
      saveSoon();
      renderAll();
      if (showToast_) {
        if (buckets) toast(`💧 完成習慣，水車裝了 ${buckets} 桶水`);
        else toast("💧 水車已經滿了，這次的水裝不下");
      }
    }

    return { buckets, wasted };

  }


  /* =========================================================
     16. 畫面骨架
  ========================================================= */

  const UI = {
    root: null,
    view: null,
    map: null,
    scale: 1,
    zoom: 1,
    tx: 0,
    ty: 0,
    centered: false,
    pop: null,
    sheet: null,
    modal: null,
    tick: null,
    nextEventAt: 0,
    toastTimer: null,
    wishResult: null,
    kitchenPick: null
  };

  const ZOOMS = [0.62, 1, 1.4];

  function ensurePage() {

    if (!document.querySelector('.tab-btn[data-page="farm"]')) {
      const nav = document.getElementById("tab-nav");
      if (nav) {
        const btn = document.createElement("button");
        btn.className = "tab-btn farm-tab";
        btn.dataset.page = "farm";
        btn.type = "button";
        btn.innerHTML = '<span class="tab-icon">🏝️</span><span class="tab-label">星露島</span>';
        btn.addEventListener("click", () => showPage("farm"));
        const lifeBtn = nav.querySelector('.tab-btn[data-page="life"]');
        if (lifeBtn) lifeBtn.after(btn);
        else nav.appendChild(btn);
      }
    }

    let page = document.querySelector('.page[data-page="farm"]');

    if (!page) {
      const container = document.querySelector("#app-section > .container");
      if (!container) return null;
      page = document.createElement("div");
      page.className = "page";
      page.dataset.page = "farm";
      const lifePage = container.querySelector('.page[data-page="life"]');
      if (lifePage) lifePage.after(page);
      else container.appendChild(page);
    }

    if (!page.querySelector("#fm-root")) {
      page.innerHTML = `
        <div class="fm-off-note card"><h2>🏝️ 星露島</h2><p>到「今日」頁打開 🎲 遊戲模式，就能玩星露島。</p>
          <button type="button" class="btn btn-primary" onclick="showPage('today')">回今日</button></div>
        <div class="fm" id="fm-root"><div class="fm-loading">🏝️ 星露島載入中...</div></div>`;
    }

    if (typeof PAGES !== "undefined" && Array.isArray(PAGES) && !PAGES.includes("farm")) {
      PAGES.push("farm");
    }

    return page;

  }

  function buildRoot() {

    const root = document.getElementById("fm-root");
    if (!root) return;

    root.innerHTML = `
      <div class="fm-view" id="fm-view">
        <div class="fm-waves"></div>
        <svg class="fm-map" id="fm-map" viewBox="0 0 ${MAP_W} ${MAP_H}" width="${MAP_W}" height="${MAP_H}" role="group" aria-label="星露島">
          ${svgDefs()}
          <g id="fm-static">${staticIsland()}</g>
          <g id="fm-dyn"></g>
        </svg>
      </div>
      <div class="fm-rain" id="fm-rain" hidden></div>
      <div class="fm-hud" id="fm-hud"></div>
      <div class="fm-prof" id="fm-prof"></div>
      <div class="fm-banner" id="fm-banner"></div>
      <div class="fm-zoom">
        <button type="button" data-act="zoom" data-z="1" aria-label="放大">＋</button>
        <button type="button" data-act="zoom" data-z="-1" aria-label="縮小">－</button>
        <button type="button" data-act="home" aria-label="回到菜田">🏠</button>
      </div>
      <button type="button" class="fm-goal" id="fm-goal" data-act="goals"></button>
      <nav class="fm-dock" id="fm-dock" aria-label="星露島選單"></nav>
      <div class="fm-pop" id="fm-pop" hidden role="dialog"></div>
      <div class="fm-floats" id="fm-floats"></div>
      <div class="fm-toast" id="fm-toast" role="status" aria-live="polite"></div>
      <section class="fm-sheet" id="fm-sheet" hidden role="dialog" aria-modal="true"></section>
      <section class="fm-modal" id="fm-modal" hidden role="dialog" aria-modal="true"></section>
    `;

    UI.root = root;
    UI.view = root.querySelector("#fm-view");
    UI.map = root.querySelector("#fm-map");
    UI.centered = false;

    root.addEventListener("click", onClick);
    setupPan();

    if (window.ResizeObserver) {
      new ResizeObserver(() => layoutMap()).observe(root);
    }

  }

  function renderAll() {
    if (!UI.root || !S) return;
    renderHud();
    renderScene();
    renderGoal();
    renderDock();
    renderRain();
    if (UI.sheet) renderSheet();
    if (UI.pop) renderPop();
  }


  /* ---------- 上方資源 ---------- */

  function wishTotal() {
    return (net.wish.wish_normal || 0) + (net.wish.wish_rare || 0) + (net.wish.wish_limited || 0);
  }

  function renderHud() {

    if (!UI.root || !S) return;

    const cap = waterCap();

    UI.root.querySelector("#fm-hud").innerHTML = `
      <button type="button" class="fm-cap" data-act="water" aria-label="水 ${S.water} / ${cap.max} 滴">
        <span class="fm-cap-ic">${ICON.drop}</span>${S.water}<small>/${cap.max}</small><span class="fm-plus">+</span>
      </button>
      <button type="button" class="fm-cap" data-act="market" aria-label="星露 ${S.dew}">
        <span class="fm-cap-ic">${ICON.dew}</span>${num(S.dew)}<span class="fm-plus">+</span>
      </button>
      <button type="button" class="fm-cap" data-act="wish" aria-label="星願瓶 ${wishTotal()} 個">
        <span class="fm-cap-ic">🌠</span>${wishTotal()}
      </button>`;

    const need = lvNeed(S.lv);
    const pct = S.lv >= 50 ? 100 : Math.floor((S.exp / need) * 100);
    const name = S.title ? `星露島・${S.title}` : "星露島";

    UI.root.querySelector("#fm-prof").innerHTML = `
      <div class="fm-ava"><img src="${IMG}crop/onion_3.webp" alt=""></div>
      <div class="fm-prof-r">
        <div class="fm-lvrow">
          <div class="fm-lv ol">${S.lv}</div>
          <div class="fm-exp"><i style="width:${pct}%"></i><span>${S.lv >= 50 ? "MAX" : `${num(S.exp)} / ${num(need)}`}</span></div>
        </div>
        <div class="fm-pname ol">${esc(name)}</div>
      </div>`;

    const banners = [];
    if (isRainDay()) banners.push(`<div>🌧️ 今天下雨，種下去的作物不用澆水</div>`);
    if (net.mode === "local") banners.push(`<div class="warn" data-act="setup">⚠️ 存檔目前只在這台裝置（點我看怎麼設定）</div>`);
    else if (net.error) banners.push(`<div class="warn" data-act="retry">⚠️ 存檔失敗，點我重試</div>`);
    UI.root.querySelector("#fm-banner").innerHTML = banners.join("");

  }

  function renderRain() {
    const el = UI.root && UI.root.querySelector("#fm-rain");
    if (!el) return;
    const rain = isRainDay();
    el.hidden = !rain;
    if (rain && !el.childElementCount) {
      let s = "";
      for (let i = 0; i < 26; i++) {
        s += `<i style="left:${(i * 37) % 100}%;animation-delay:-${(i * 0.37) % 1}s;animation-duration:${0.8 + (i % 5) * 0.12}s"></i>`;
      }
      el.innerHTML = s;
    }
  }


  /* ---------- 今日小目標 ---------- */

  function renderGoal() {

    const el = UI.root.querySelector("#fm-goal");
    if (!S.goals) { el.hidden = true; return; }

    const list = S.goals.list;
    const claimable = list.filter(g => !g.claimed && g.got >= g.n).length;
    const open = list.find(g => !g.claimed && g.got < g.n);
    const done = list.every(g => g.claimed);

    el.hidden = false;
    el.classList.toggle("ready", claimable > 0);

    if (done) {
      el.innerHTML = `<span class="fm-goal-ic">🏅</span><span>今天的小目標都完成了</span>`;
    } else if (claimable) {
      el.innerHTML = `<span class="fm-goal-ic">🎁</span><span>小目標完成，點我領獎勵！</span>`;
    } else {
      const t = GOAL_TYPES.find(x => x.k === open.k);
      el.innerHTML = `<span class="fm-goal-ic">${t.icon}</span><span>今日小目標：${t.name} ${open.n} 次 <em>(${open.got}/${open.n})</em></span>`;
    }

  }


  /* ---------- 下方選單 ---------- */

  function renderDock() {

    const cookable = Object.keys(D.dishes).some(k => dishKnown(k) && hasAll(D.dishes[k].need));
    const kitchenDone = S.kitchen.jobs.filter(j => now() >= j.t1).length;
    const ripe = countRipe();

    UI.root.querySelector("#fm-dock").innerHTML = `
      <button type="button" data-act="storage"><span class="fm-dk-ic">📦</span><span>倉庫</span></button>
      <button type="button" data-act="kitchen"><span class="fm-dk-ic"><img src="${IMG}dish/tomatoegg.webp" alt=""></span><span>料理</span>${kitchenDone ? `<i class="fm-dot">${kitchenDone}</i>` : (cookable ? `<i class="fm-dot"></i>` : "")}</button>
      <button type="button" data-act="harvestall"><span class="fm-dk-ic"><img src="${IMG}crop/corn_i.webp" alt=""></span><span>一鍵收成</span>${ripe ? `<i class="fm-dot">${ripe}</i>` : ""}</button>
      <button type="button" data-act="book"><span class="fm-dk-ic">📖</span><span>圖鑑</span></button>`;

  }

  function countRipe() {
    let n = 0;
    for (const zone of ["field", "herb", "green"]) {
      const z = plotZone(zone);
      for (const key of z.keys) if (plotState(z.store[key]) === "ripe") n++;
    }
    for (const t of Object.values(S.orchard.trees)) if (treeState(t) === "ripe") n++;
    for (const l of Object.values(S.logs.slots)) if (logState(l) === "ripe") n++;
    for (const b of Object.values(S.tea.bushes)) if (teaState(b) === "ripe") n++;
    if (bambooReady() > 0) n++;
    return n;
  }


  /* =========================================================
     17. 小島（SVG）
  ========================================================= */

  const ICON = {
    drop: '<svg viewBox="-14 -14 28 28"><path d="M0 -12 C6 -4 10 1 10 5 A10 10 0 0 1 -10 5 C-10 1 -6 -4 0 -12Z" fill="url(#fmDrop)" stroke="#2b86cc" stroke-width="1.4"/><ellipse cx="-4" cy="1" rx="2.4" ry="4" fill="#fff" opacity=".85" transform="rotate(-20 -4 1)"/></svg>',
    dew: '<svg viewBox="-14 -14 28 28"><circle r="12" fill="url(#fmCoin)" stroke="#d48e16" stroke-width="1.4"/><path d="M0 -7 L2 -2 L7 -2 L3 1.5 L4.5 6.5 L0 3.6 L-4.5 6.5 L-3 1.5 L-7 -2 L-2 -2Z" fill="#fff8d6" stroke="#e0a22a" stroke-width=".8" stroke-linejoin="round"/></svg>'
  };

  function svgDefs() {
    return `<defs>
      <linearGradient id="fmSand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f9e8c0"/><stop offset="1" stop-color="#ecd19b"/></linearGradient>
      <linearGradient id="fmGrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3e486"/><stop offset=".6" stop-color="#a8d86f"/><stop offset="1" stop-color="#93ca5d"/></linearGradient>
      <radialGradient id="fmGrassLight" cx=".5" cy=".48" r=".5"><stop offset="0" stop-color="#eefabb" stop-opacity=".55"/><stop offset="1" stop-color="#eefabb" stop-opacity="0"/></radialGradient>
      <linearGradient id="fmSoil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c88e5a"/><stop offset="1" stop-color="#a66e3e"/></linearGradient>
      <linearGradient id="fmSoilWet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8c5d3c"/><stop offset="1" stop-color="#6c4429"/></linearGradient>
      <linearGradient id="fmWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dca66b"/><stop offset="1" stop-color="#a66f3e"/></linearGradient>
      <linearGradient id="fmLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#aeec80"/><stop offset="1" stop-color="#4f9f3a"/></linearGradient>
      <linearGradient id="fmLeafD" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#82d15e"/><stop offset="1" stop-color="#3a8530"/></linearGradient>
      <radialGradient id="fmDrop" cx=".38" cy=".55" r=".7"><stop offset="0" stop-color="#e5f8ff"/><stop offset=".45" stop-color="#63c8f6"/><stop offset="1" stop-color="#2b86cc"/></radialGradient>
      <radialGradient id="fmCoin" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#fff4b4"/><stop offset=".55" stop-color="#ffc93f"/><stop offset="1" stop-color="#d48e16"/></radialGradient>
      <radialGradient id="fmRock" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#f0ede7"/><stop offset="1" stop-color="#a7a196"/></radialGradient>
      <linearGradient id="fmBang" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4aa"/><stop offset="1" stop-color="#ffc93f"/></linearGradient>
      <linearGradient id="fmGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9fbff" stop-opacity=".9"/><stop offset="1" stop-color="#9fd8ee" stop-opacity=".75"/></linearGradient>
      <linearGradient id="fmRoofG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fc46a"/><stop offset="1" stop-color="#4a8f3e"/></linearGradient>
      <linearGradient id="fmRoofR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f29470"/><stop offset="1" stop-color="#c9573c"/></linearGradient>
      <linearGradient id="fmWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff7e6"/><stop offset="1" stop-color="#e8d0a6"/></linearGradient>
      <radialGradient id="fmLake" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#bdeaf7"/><stop offset=".6" stop-color="#7fd0ee"/><stop offset="1" stop-color="#4fb3dc"/></radialGradient>
    </defs>`;
  }

  function palm(x, y, s = 1) {
    let leaves = "";
    ["rotate(-12)", "rotate(28)", "scale(-1 1) rotate(-12)", "scale(-1 1) rotate(28)", "rotate(-62)", "scale(-1 1) rotate(-62)"].forEach((t, k) => {
      leaves += `<path transform="${t}" d="M0 0 Q20 -14 44 4 Q20 -3 0 0Z" fill="url(#${k % 2 ? "fmLeafD" : "fmLeaf"})"/>`;
    });
    return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="2" cy="2" rx="18" ry="6" fill="#000" opacity=".12"/>
      <path d="M0 0 C-2 -24 2 -48 10 -70" stroke="#a77546" stroke-width="9" fill="none" stroke-linecap="round"/>
      <path d="M0 0 C-2 -24 2 -48 10 -70" stroke="#cf9d66" stroke-width="3" fill="none" stroke-dasharray="2 6" stroke-linecap="round"/>
      <g transform="translate(10 -70) scale(1.15)">${leaves}<circle cx="-3" cy="3" r="3.6" fill="#8a5a37"/><circle cx="3" cy="4" r="3.6" fill="#7a4f2a"/></g></g>`;
  }

  /* 方圓形的小島（超橢圓），邊緣稍微不規則 */
  function squirclePath(cx, cy, a, bTop, bBottom, p, n = 40) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const c = Math.cos(t), sn = Math.sin(t);
      const w = 1 + 0.018 * Math.sin(i * 2.7) + 0.012 * Math.cos(i * 1.3);
      pts.push([
        cx + a * w * Math.sign(c) * Math.pow(Math.abs(c), 2 / p),
        cy + (sn < 0 ? bTop : bBottom) * w * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p)
      ]);
    }
    return smoothPath(pts);
  }

  function smoothPath(pts) {
    const n = pts.length;
    let d = "";
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      if (i === 0) d += `M${f1(p1[0])} ${f1(p1[1])}`;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`;
    }
    return d + "Z";
  }

  /* 湖：建築在北岸、菜田在南岸 */
  const LAKE = { x: 750, y: 470, rx: 470, ry: 74 };
  const BRIDGE_X = 662;

  function staticIsland() {

    /* 北邊收窄一點，讓一排建築靠著海 */
    const sand = squirclePath(750, 735, 738, 622, 688, 4);
    const grass = squirclePath(750, 728, 690, 575, 640, 4);
    let s = "";

    s += `<path d="${sand}" fill="#8fdcea" stroke="#8fdcea" stroke-width="50" stroke-linejoin="round" opacity=".45"/>`;
    s += `<path d="${sand}" fill="url(#fmSand)" stroke="#fffaf0" stroke-width="4" stroke-opacity=".75"/>`;
    s += `<path d="${grass}" transform="translate(0 8)" fill="#84bb50"/>`;
    s += `<path d="${grass}" fill="url(#fmGrass)"/>`;
    s += `<ellipse cx="750" cy="860" rx="520" ry="380" fill="url(#fmGrassLight)"/>`;

    /* 小路：北岸步道、橋、菜田往牧場／果園／碼頭 */
    const road = (d, w = 22) => `<path d="${d}" stroke="#e7cf9c" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>`;
    s += road("M210 378 C450 392 1050 392 1300 372", 26);
    s += road(`M${BRIDGE_X} 560 C${BRIDGE_X + 6} 600 730 625 750 652`);
    s += road("M470 805 C420 830 380 870 330 892");
    s += road("M750 950 C750 1100 752 1250 750 1330");
    s += road("M880 880 C930 980 960 1060 985 1120");
    s += road("M1000 860 C1100 920 1180 990 1205 1020");

    /* 湖 */
    const { x: lx, y: ly, rx, ry } = LAKE;
    s += `<ellipse cx="${lx}" cy="${ly + 6}" rx="${rx + 20}" ry="${ry + 16}" fill="#e9d9a6"/>`;
    s += `<ellipse cx="${lx}" cy="${ly}" rx="${rx + 6}" ry="${ry + 6}" fill="#6cc5e4"/>`;
    s += `<ellipse cx="${lx}" cy="${ly + 4}" rx="${rx}" ry="${ry}" fill="url(#fmLake)"/>`;
    for (const [x, y, w] of [[520, 452, 40], [880, 492, 52], [1050, 458, 34], [420, 492, 30], [760, 440, 46]]) {
      s += `<path d="M${x} ${y} q${w / 4} -6 ${w / 2} 0 t${w / 2} 0" fill="none" stroke="#e4f7ff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`;
    }
    for (const [x, y, r] of [[470, 470, 13], [492, 486, 9], [990, 500, 12], [1012, 488, 8], [1140, 470, 11], [360, 478, 10]]) {
      s += `<path d="M${x} ${y} m${r} 0 a${r} ${r * 0.55} 0 1 1 -${r * 0.4} -${r * 0.45} L${x} ${y}Z" fill="#6fbf4c" stroke="#4f9334" stroke-width="1"/>`;
    }
    s += `<circle cx="478" cy="466" r="5" fill="#ffb3c9"/><circle cx="478" cy="466" r="2" fill="#fff3a0"/>`;
    s += `<circle cx="996" cy="496" r="5" fill="#fff"/><circle cx="996" cy="496" r="2" fill="#fff3a0"/>`;
    for (const [x, y] of [[300, 440], [318, 448], [1190, 448], [1206, 440], [1180, 520]]) {
      s += `<path d="M${x} ${y} v-34 M${x + 6} ${y} v-26 M${x - 6} ${y} v-22" stroke="#5f9a3a" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="${x}" cy="${y - 36}" rx="3" ry="8" fill="#8a5a37"/>`;
    }

    /* 木橋 */
    const by0 = ly - ry - 18, by1 = ly + ry + 22;
    s += `<rect x="${BRIDGE_X - 24}" y="${by0}" width="48" height="${by1 - by0}" rx="4" fill="#b98352"/>`;
    for (let y = by0 + 6; y < by1; y += 12) s += `<rect x="${BRIDGE_X - 24}" y="${y}" width="48" height="7" rx="2" fill="#d9a46b"/>`;
    s += `<path d="M${BRIDGE_X - 26} ${by0} V${by1} M${BRIDGE_X + 26} ${by0} V${by1}" stroke="#8a5a37" stroke-width="5" stroke-linecap="round"/>`;

    /* 草叢、小花、石頭 */
    const tufts = [[160, 700], [420, 640], [1080, 640], [1390, 760], [130, 1060], [380, 1200], [600, 1270], [920, 1290], [1300, 1180], [470, 1050], [1000, 640], [230, 1180]];
    for (const [x, y] of tufts) {
      s += `<path d="M${x} ${y} l3 -8 l3 8 l3 -9 l3 9" fill="none" stroke="#7cb64b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    const flowers = [[180, 720, "#ff9fb6"], [192, 728, "#ffd36b"], [440, 660, "#b9a3ff"], [1060, 660, "#ff9fb6"], [150, 1080, "#fff"], [1320, 1200, "#ff9fb6"], [620, 1290, "#ffd36b"], [1395, 780, "#fff"], [400, 1220, "#b9a3ff"], [900, 1310, "#ff9fb6"], [480, 1070, "#fff"], [250, 1200, "#ffd36b"]];
    for (const [x, y, c] of flowers) {
      s += `<circle cx="${x}" cy="${y}" r="4.5" fill="${c}"/><circle cx="${x}" cy="${y}" r="1.6" fill="#fff3a0"/>`;
    }
    s += `<ellipse cx="1360" cy="1302" rx="16" ry="5" fill="#000" opacity=".12"/><ellipse cx="1355" cy="1294" rx="15" ry="10" fill="url(#fmRock)"/><ellipse cx="1372" cy="1299" rx="10" ry="7" fill="url(#fmRock)"/>`;
    s += `<ellipse cx="420" cy="1320" rx="14" ry="5" fill="#000" opacity=".12"/><ellipse cx="416" cy="1313" rx="13" ry="9" fill="url(#fmRock)"/>`;

    s += palm(130, 900, 1.05) + palm(170, 1240, 1) + palm(1420, 1060, 1) + palm(1440, 420, .9) + palm(70, 420, .9) + palm(420, 1100, .85);

    return s;

  }


  /* ---------- 共用小圖 ---------- */

  function mark(x, y, text = "!") {
    return `<g transform="translate(${x} ${y})" pointer-events="none"><g class="bob">
      <path d="M-6 -7 L0 4 L6 -7Z" fill="#ffc93f" stroke="#e0a22a" stroke-width="1.4" stroke-linejoin="round"/>
      <circle cx="0" cy="-18" r="15" fill="url(#fmBang)" stroke="#e0a22a" stroke-width="1.6"/>
      <text x="0" y="-11" text-anchor="middle" font-size="${text.length > 1 ? 15 : 20}" font-family="Huninn, sans-serif" fill="#8a5a1e">${text}</text></g></g>`;
  }

  function bubble(x, y, inner) {
    return `<g transform="translate(${x} ${y})" pointer-events="none"><g class="bob">
      <circle r="17" fill="#fffdf6" stroke="#ffd36b" stroke-width="2"/>${inner}</g></g>`;
  }

  function bubbleItem(x, y, key) {
    const src = itemSrc(key);
    const inner = src
      ? `<image href="${src}" x="-13" y="-13" width="26" height="26"/>`
      : `<text y="7" text-anchor="middle" font-size="18">${D.items[key]?.emoji || "📦"}</text>`;
    return bubble(x, y, inner);
  }

  function thirstyBubble(x, y, anim = true) {
    return `<g transform="translate(${x} ${y})" pointer-events="none"><g class="${anim ? "bob" : ""}"><circle r="11" fill="#fffdf6" stroke="#9fd3ee" stroke-width="1.6"/>
      <g transform="scale(.6)"><path d="M0 -12 C6 -4 10 1 10 5 A10 10 0 0 1 -10 5 C-10 1 -6 -4 0 -12Z" fill="url(#fmDrop)" stroke="#2b86cc" stroke-width="1.4"/></g></g></g>`;
  }

  function sparkle(x, y, r) {
    return `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z" fill="#fff6b0"/>`;
  }

  function sign(x, y, text, opts = {}) {
    const w = Math.max(70, text.length * 15 + 26);
    const lock = opts.lock ? `<g transform="translate(${-w / 2 + 14} -22)"><rect x="-6" y="-1" width="12" height="10" rx="2" fill="#d9a03a"/><path d="M-3.5 -1 v-3.5 a3.5 3.5 0 0 1 7 0 v3.5" fill="none" stroke="#d9a03a" stroke-width="2"/></g>` : "";
    return `<g transform="translate(${x} ${y})">
      <rect x="-3" y="-8" width="6" height="26" fill="#8a5a37"/>
      <rect x="${-w / 2}" y="-36" width="${w}" height="28" rx="9" fill="${opts.bright ? "#fff3c4" : "url(#fmWood)"}" stroke="#8a5a37" stroke-width="2"/>
      ${lock}
      <text x="${opts.lock ? 9 : 0}" y="-16" text-anchor="middle" font-size="15" fill="#5a3a20" font-family="Huninn, sans-serif">${esc(text)}</text></g>`;
  }

  function nameplate(x, y, text) {
    const w = text.length * 14 + 20;
    return `<g transform="translate(${x} ${y})" pointer-events="none"><rect x="${-w / 2}" y="-12" width="${w}" height="22" rx="11" fill="#fffaf0" stroke="#d9b577" stroke-width="1.6" opacity=".95"/>
      <text x="0" y="4" text-anchor="middle" font-size="13" fill="#7a4b26" font-family="Huninn, sans-serif">${esc(text)}</text></g>`;
  }

  /* 建築圖：底部中心放在 (x, y)，寬 w */
  function building(key, x, y, w) {
    const [iw, ih] = BLD[key];
    const h = w * ih / iw;
    return `<ellipse cx="${x}" cy="${y - 6}" rx="${w * 0.42}" ry="${w * 0.1}" fill="#3f6b25" opacity=".18"/>
      <image href="${IMG}bld/${key}.webp" x="${f1(x - w / 2)}" y="${f1(y - h)}" width="${f1(w)}" height="${f1(h)}"/>`;
  }

  /* 還沒有圖的區域：先畫一個小平台＋招牌 */
  function pad(x, y, rx, ry, fill = "#d8c08a") {
    return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" opacity=".55"/>
      <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="none" stroke="#fffaf0" stroke-width="2.5" stroke-dasharray="8 7" opacity=".9"/>`;
  }

  /* 作物圖：土堆中心在 (x, y)，土堆寬 mw */
  function cropArt(key, stage, x, y, moundW) {

    const c = D.crops[key];
    const src = cropStageSrc(key, stage);

    if (src) {
      const a = c.art;
      const w = moundW / a.mw;
      const h = w * a.ar;
      const left = x - a.cx * w;
      const top = y - h * (1 - a.bot);
      return `<image href="${src}" x="${f1(left)}" y="${f1(top)}" width="${f1(w)}" height="${f1(h)}"/>`;
    }

    /* 沒有圖：土堆＋小芽，成熟時頂上放 emoji */
    const r = moundW / 2;
    let s = `<ellipse cx="${x}" cy="${y - 2}" rx="${f1(r)}" ry="${f1(r * 0.38)}" fill="#8d5b36"/><ellipse cx="${x}" cy="${y - 5}" rx="${f1(r * 0.86)}" ry="${f1(r * 0.3)}" fill="#a8703f"/>`;
    const k = stage === 1 ? 0.5 : stage === 2 ? 0.85 : 1;
    s += `<path d="M${x} ${y - 6} q-2 ${-14 * k} ${-12 * k} ${-20 * k} q${12 * k} ${-2 * k} ${12 * k} ${16 * k} q0 ${-18 * k} ${12 * k} ${-24 * k} q${2 * k} ${14 * k} ${-12 * k} ${26 * k}Z" fill="url(#fmLeaf)" stroke="#3a8530" stroke-width="1"/>`;
    if (stage === 3) s += `<text x="${x}" y="${y - 20}" text-anchor="middle" font-size="${f1(moundW * 0.55)}">${c.emoji}</text>`;
    return s;

  }


  /* ---------- 菜田 ---------- */

  function fieldOrigin() {
    return { x: FX, y: FY - FIELD_MAX * TH };
  }

  function tileXY(r, c) {
    const o = fieldOrigin();
    return { x: o.x + (c - r) * TW, y: o.y + (r + c + 1) * TH };
  }

  function tilePoly(x, y, tw = TW, th = TH) {
    return `${x},${y - th} ${x + tw},${y} ${x},${y + th} ${x - tw},${y}`;
  }

  function soilTile(x, y, wet, sel, tw = TW, th = TH, tt = TT) {
    const L = [x - tw, y], B = [x, y + th], R = [x + tw, y], T = [x, y - th];
    let s = `<polygon points="${L} ${B} ${B[0]},${B[1] + tt} ${L[0]},${L[1] + tt}" fill="${wet ? "#5e3c26" : "#8d5b36"}"/>`;
    s += `<polygon points="${B} ${R} ${R[0]},${R[1] + tt} ${B[0]},${B[1] + tt}" fill="${wet ? "#4c301e" : "#74482a"}"/>`;
    s += `<polygon points="${T} ${R} ${B} ${L}" fill="url(#${wet ? "fmSoilWet" : "fmSoil"})" stroke="${sel ? "#ffe066" : (wet ? "#5a3a24" : "#9c693f")}" stroke-width="${sel ? 4 : 1.2}" stroke-linejoin="round"/>`;
    for (const t of [0.25, 0.5, 0.75]) {
      const a = [L[0] + (B[0] - L[0]) * t, L[1] + (B[1] - L[1]) * t];
      const b = [T[0] + (R[0] - T[0]) * t, T[1] + (R[1] - T[1]) * t];
      s += `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${wet ? "#4f3220" : "#8f5d36"}" stroke-width="2.6" stroke-linecap="round" opacity=".8"/>`;
    }
    return s;
  }

  function plotSvg(zone, key, x, y, tw, th, tt) {

    const z = plotZone(zone);
    const p = z.store[key];
    const st = plotState(p);
    const sel = UI.pop && UI.pop.zone === zone && UI.pop.key === key;
    const wet = !!(p && p.t1 && st !== "ripe");

    /* 點擊範圍只有田格本身（放在最上層），前面長高的作物不會擋到後面的田 */
    HITS.push({ y, svg: `<polygon class="tap fm-hit" data-act="plot" data-zone="${zone}" data-key="${key}" role="button" tabindex="0" aria-label="${esc(plotLabel(zone, key))}" points="${tilePoly(x, y + 2, tw + 1, th + 1)}" fill="#fff" fill-opacity="0" pointer-events="all"/>` });

    let s = `<g pointer-events="none">`;
    s += soilTile(x, y, wet, sel, tw, th, tt);

    if (p && p.s) {
      s += sprinklerArt(x, y);
    } else if (p) {
      let stage = 1;
      if (st === "ripe") stage = 3;
      else if (p.t1) stage = (now() - p.t0) / (p.t1 - p.t0) >= 0.5 ? 2 : 1;
      if (st === "ripe") s += `<ellipse cx="${x}" cy="${y + 2}" rx="${tw * 0.75}" ry="${th * 0.6}" fill="#fff4a8" opacity=".55"/>`;
      s += cropArt(p.c, stage, x, y + th * 0.45, tw * 1.64);
      if (p.f && st !== "ripe") s += sparkle(x - tw * 0.6, y - 4, 5) + sparkle(x + tw * 0.55, y + 4, 4);
      if (st === "ripe") s += sparkle(x - tw * 0.55, y - 34, 6) + sparkle(x + tw * 0.6, y - 48, 5);
      else if (st === "thirsty") s += thirstyBubble(x + tw * 0.7, y - 18, false);
    }

    return s + "</g>";

  }

  function plotLabel(zone, key) {
    const z = plotZone(zone);
    const p = z.store[key];
    const st = plotState(p);
    if (st === "empty") return `${z.name}空地，點一下選種子`;
    if (st === "sprinkler") return "灑水器";
    const name = D.crops[p.c].name;
    if (st === "ripe") return `${name}成熟了，點一下收成`;
    if (st === "thirsty") return `${name}口渴了，點一下澆水`;
    return `${name}，還要 ${dur(p.t1 - now())}`;
  }

  function sprinklerArt(x, y) {
    return `<g transform="translate(${x} ${y + 4})"><ellipse rx="16" ry="6" fill="#000" opacity=".15"/>
      <rect x="-3" y="-30" width="6" height="30" rx="2" fill="#9aa6b2"/>
      <circle cy="-32" r="8" fill="#c7d2dc" stroke="#7f8a96" stroke-width="1.5"/>
      <g><path d="M-14 -32 h28 M0 -46 v28" stroke="#7fd6f2" stroke-width="2.5" stroke-linecap="round" opacity=".8"/></g></g>`;
  }

  function fieldSvg(items) {

    const n = S.field.size;

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const { x, y } = tileXY(r, c);
        items.push({ y, svg: plotSvg("field", r + "_" + c, x, y, TW, TH, TT) });
      }
    }

    /* 下一次擴建的範圍（虛線） */
    const next = fieldNextExpand();

    if (next && n < FIELD_MAX) {
      const can = S.lv >= next[0];
      let ring = `<g class="tap" data-act="expand" role="button" tabindex="0" aria-label="${can ? `擴建菜田成 ${n + 1}×${n + 1}，${num(next[2])} 星露` : `Lv${next[0]} 可以擴建菜田`}">`;
      const ringCells = new Map();
      for (let i = 0; i <= n; i++) {
        ringCells.set(n + "_" + i, [n, i]);
        ringCells.set(i + "_" + n, [i, n]);
      }
      for (const [r, c] of ringCells.values()) {
        {
          const { x, y } = tileXY(r, c);
          ring += `<polygon points="${tilePoly(x, y + TT)}" fill="#fff" fill-opacity="${can ? 0.28 : 0.14}" stroke="#fff" stroke-opacity=".85" stroke-width="2" stroke-dasharray="7 6" stroke-linejoin="round"/>`;
        }
      }
      const corner = tileXY(n, n);
      ring += sign(corner.x, corner.y + TH + 52, can ? `擴建 ${n + 1}×${n + 1}・${num(next[2])}` : `Lv${next[0]} 擴建菜田`, { lock: !can, bright: can });
      ring += "</g>";
      items.push({ y: tileXY(n, n).y, svg: ring });
    }

  }


  /* ---------- 建築與各區 ---------- */

  /* 北岸一排建築（背後是海、前面是湖），南岸是菜田；左邊牧場，右邊果園和各種小區域 */
  const POS = {
    barn: [300, 345, 190],
    kitchen: [530, 350, 215],
    workshop: [790, 345],
    market: [1000, 350, 175],
    green: [1210, 345],
    wheel: [228, 575, 190],
    gate: [255, 905, 185],
    bamboo: [1335, 660],
    orchard: [1205, 860],
    herb: [1255, 1015],
    logs: [1000, 1160],
    tea: [1190, 1255],
    pier: [750, 1460, 200]
  };

  function lockedZone(zone, x, y, rx, ry) {
    const lv = zoneLv(zone);
    let s = `<g class="tap" data-act="zone" data-zone="${zone}" role="button" tabindex="0" aria-label="${zone}：Lv${lv} 開放">`;
    s += pad(x, y, rx, ry, "#c9d8a0");
    s += `<g opacity=".85"><ellipse cx="${x - rx * 0.3}" cy="${y - ry * 0.4}" rx="${rx * 0.38}" ry="${ry * 0.55}" fill="#fff"/><ellipse cx="${x + rx * 0.15}" cy="${y - ry * 0.65}" rx="${rx * 0.42}" ry="${ry * 0.7}" fill="#fff"/><ellipse cx="${x + rx * 0.45}" cy="${y - ry * 0.35}" rx="${rx * 0.32}" ry="${ry * 0.5}" fill="#fff"/></g>`;
    s += sign(x, y + ry * 0.2, `${zone} Lv${lv}`, { lock: true });
    return s + "</g>";
  }

  function buyZone(zone, x, y, rx, ry) {
    const cost = D.zones[zone].cost;
    let s = `<g class="tap" data-act="zone" data-zone="${zone}" role="button" tabindex="0" aria-label="開墾${zone}，${num(cost)} 星露">`;
    s += pad(x, y, rx, ry);
    s += sparkle(x - rx * 0.6, y - ry * 0.6, 8) + sparkle(x + rx * 0.5, y - ry, 7);
    s += sign(x, y + ry * 0.2, `開墾${zone}・${num(cost)}`, { bright: true });
    return s + "</g>";
  }

  function zoneSvg(items) {

    const t = now();

    /* 倉庫 */
    {
      const [x, y, w] = POS.barn;
      const full = invSpace() <= 0;
      let s = `<g class="tap" data-act="storage" role="button" tabindex="0" aria-label="倉庫 ${invUsed()} / ${storageCap()}">${building("barn", x, y, w)}${nameplate(x, y + 16, `倉庫 ${invUsed()}/${storageCap() > 9999 ? "∞" : storageCap()}`)}`;
      if (full) s += mark(x, y - 150, "滿");
      items.push({ y, svg: s + "</g>" });
    }

    /* 料理小屋 → 廚房 → 餐廳 → 星露餐館 */
    {
      const [x, y, w] = POS.kitchen;
      const tier = kitchenTier();
      const done = S.kitchen.jobs.some(j => t >= j.t1);
      const busy = S.kitchen.jobs.length > 0;
      let s = `<g class="tap" data-act="kitchen" role="button" tabindex="0" aria-label="${tier[2]}${done ? "，有料理做好了" : ""}">${building(tier[1], x, y, tier[1] === "restaurant" ? w * 0.9 : w)}`;
      if (busy && !done) s += `<g fill="#fff" opacity=".8" pointer-events="none"><circle cx="${x + 40}" cy="${y - 200}" r="7"/><circle cx="${x + 46}" cy="${y - 214}" r="8"/><circle cx="${x + 38}" cy="${y - 228}" r="6"/></g>`;
      if (done) s += mark(x - 20, y - 205);
      else if (kitchenNext() && S.lv >= kitchenNext()[0]) s += mark(x - 20, y - 205, "⬆");
      s += nameplate(x, y + 16, tier[2]);
      items.push({ y, svg: s + "</g>" });
    }

    /* 水車 */
    {
      const [x, y, w] = POS.wheel;
      const cap = waterCap();
      let s = `<g class="tap" data-act="water" role="button" tabindex="0" aria-label="水車：${S.water} / ${cap.max} 滴">${building("waterwheel", x, y, w)}`;
      s += nameplate(x, y + 16, `💧 ${S.water}/${cap.max}`);
      items.push({ y, svg: s + "</g>" });
    }

    /* 牧場大門 */
    {
      const [x, y, w] = POS.gate;
      const ready = S.ranch.animals.some(a => animalState(a) === "ready") || machineReadyCount("feedmill") > 0;
      const hungry = S.ranch.animals.some(a => animalState(a) === "hungry");
      let s = `<g class="tap" data-act="ranch" role="button" tabindex="0" aria-label="牧場${ready ? "，有東西可以收" : ""}${hungry ? "，動物餓了" : ""}">${building("ranchgate", x, y, w)}`;
      if (ready) s += mark(x, y - 140);
      else if (hungry) s += mark(x, y - 140, "🍽");
      s += nameplate(x, y + 16, "牧場");
      items.push({ y, svg: s + "</g>" });
    }

    /* 市集 */
    {
      const [x, y, w] = POS.market;
      if (zoneUnlocked("市集")) {
        items.push({ y, svg: `<g class="tap" data-act="market" role="button" tabindex="0" aria-label="市集">${building("market", x, y, w)}${nameplate(x, y + 16, "市集")}</g>` });
      } else {
        items.push({ y, svg: lockedZone("市集", x, y - 50, 90, 50) });
      }
    }

    /* 碼頭（釣魚之後做） */
    {
      const [x, y, w] = POS.pier;
      const open = zoneUnlocked("碼頭");
      items.push({ y, svg: `<g class="tap" data-act="pier" role="button" tabindex="0" aria-label="碼頭">${building("pier", x, y, w)}${nameplate(x, y - 20, open ? "碼頭・釣魚準備中" : `碼頭 Lv${zoneLv("碼頭")}`)}</g>` });
    }

    /* 加工坊 */
    {
      const [x, y] = POS.workshop;
      if (!zoneUnlocked("加工坊")) items.push({ y, svg: lockedZone("加工坊", x, y - 40, 80, 42) });
      else if (!S.workshop.open) items.push({ y, svg: buyZone("加工坊", x, y - 40, 80, 42) });
      else {
        const ready = Object.keys(D.machines).some(m => D.machines[m].where === "workshop" && machineReadyCount(m) > 0);
        let s = `<g class="tap" data-act="workshop" role="button" tabindex="0" aria-label="加工坊">${workshopArt(x, y)}`;
        if (ready) s += mark(x, y - 140);
        s += nameplate(x, y + 14, "加工坊");
        items.push({ y, svg: s + "</g>" });
      }
    }

    /* 菇棚 */
    {
      const [x, y] = POS.logs;
      if (!zoneUnlocked("菇棚")) items.push({ y, svg: lockedZone("菇棚", x, y - 30, 100, 45) });
      else if (!S.logs.open) items.push({ y, svg: buyZone("菇棚", x, y - 30, 100, 45) });
      else logsSvg(items, x, y);
    }

    /* 果園 */
    {
      const [x, y] = POS.orchard;
      if (!zoneUnlocked("果園")) items.push({ y, svg: lockedZone("果園", x, y - 40, 110, 55) });
      else if (!S.orchard.open) items.push({ y, svg: buyZone("果園", x, y - 40, 110, 55) });
      else orchardSvg(items, x, y);
    }

    /* 竹林 */
    {
      const [x, y] = POS.bamboo;
      if (!zoneUnlocked("竹林")) items.push({ y, svg: lockedZone("竹林", x, y - 30, 75, 40) });
      else items.push({ y, svg: bambooSvg(x, y) });
    }

    /* 香草園 */
    {
      const [x, y] = POS.herb;
      if (!zoneUnlocked("香草園")) items.push({ y, svg: lockedZone("香草園", x, y - 20, 80, 40) });
      else if (!S.herb.open) items.push({ y, svg: buyZone("香草園", x, y - 20, 80, 40) });
      else herbSvg(items, x, y);
    }

    /* 茶園 */
    {
      const [x, y] = POS.tea;
      if (!zoneUnlocked("茶園")) items.push({ y, svg: lockedZone("茶園", x, y - 20, 90, 40) });
      else if (!S.tea.open) items.push({ y, svg: buyZone("茶園", x, y - 20, 90, 40) });
      else teaSvg(items, x, y);
    }

    /* 溫室 */
    {
      const [x, y] = POS.green;
      if (!zoneUnlocked("溫室")) items.push({ y, svg: lockedZone("溫室", x, y - 30, 80, 42) });
      else if (!S.green.open) items.push({ y, svg: buyZone("溫室", x, y - 30, 80, 42) });
      else {
        const z = plotZone("green");
        const ripe = z.keys.some(k => plotState(z.store[k]) === "ripe");
        const empty = z.keys.some(k => !z.store[k]);
        let s = `<g class="tap" data-act="green" role="button" tabindex="0" aria-label="溫室">${greenhouseArt(x, y)}`;
        if (ripe) s += mark(x, y - 120);
        else if (empty) s += mark(x, y - 120, "＋");
        s += nameplate(x, y + 14, "溫室");
        items.push({ y, svg: s + "</g>" });
      }
    }

  }

  function workshopArt(x, y) {
    return `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="-4" rx="72" ry="16" fill="#3f6b25" opacity=".2"/>
      <polygon points="-62,-30 0,0 0,-60 -62,-90" fill="url(#fmWall)" stroke="#b08655" stroke-width="1.5"/>
      <polygon points="0,0 62,-30 62,-90 0,-60" fill="#e2c595" stroke="#b08655" stroke-width="1.5"/>
      <polygon points="-72,-86 0,-50 0,-128" fill="#b77e49" stroke="#8a5a33" stroke-width="1.5"/>
      <polygon points="0,-50 72,-86 0,-128" fill="#9a6538" stroke="#8a5a33" stroke-width="1.5"/>
      <rect x="-44" y="-62" width="22" height="22" rx="3" fill="#bfe6f7" stroke="#fff" stroke-width="2" transform="skewY(26)"/>
      <path d="M20 -12 L20 -46 L44 -58 L44 -24Z" fill="#a8703f" stroke="#7a4f2a" stroke-width="1.5"/>
      <g transform="translate(30 -110)"><g><circle r="16" fill="#c7d2dc" stroke="#7f8a96" stroke-width="2"/><circle r="6" fill="#7f8a96"/>
      ${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<rect x="-4" y="-21" width="8" height="8" rx="2" fill="#c7d2dc" stroke="#7f8a96" stroke-width="1.5" transform="rotate(${a})"/>`).join("")}</g></g></g>`;
  }

  function greenhouseArt(x, y) {
    return `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="-4" rx="78" ry="16" fill="#3f6b25" opacity=".2"/>
      <polygon points="-70,-28 0,6 0,-50 -70,-84" fill="url(#fmGlass)" stroke="#fff" stroke-width="2"/>
      <polygon points="0,6 70,-28 70,-84 0,-50" fill="url(#fmGlass)" stroke="#fff" stroke-width="2"/>
      <polygon points="-76,-82 0,-46 0,-104 -40,-124" fill="#d5f1fb" stroke="#fff" stroke-width="2" opacity=".95"/>
      <polygon points="0,-46 76,-82 40,-124 0,-104" fill="#bfe6f5" stroke="#fff" stroke-width="2" opacity=".95"/>
      <path d="M-35 -66 V-12 M35 -66 V-12 M0 -48 V4" stroke="#fff" stroke-width="2"/>
      <g fill="#5fb840"><circle cx="-46" cy="-26" r="9"/><circle cx="-24" cy="-16" r="10"/><circle cx="24" cy="-16" r="9"/><circle cx="48" cy="-28" r="10"/></g></g>`;
  }

  function logsSvg(items, x, y) {
    const n = logSlots();
    let shed = `<g class="tap" data-act="logs" role="button" tabindex="0" aria-label="菇棚">
      <g transform="translate(${x - 110} ${y - 30})"><ellipse cx="0" cy="4" rx="46" ry="10" fill="#3f6b25" opacity=".2"/>
      <rect x="-34" y="-50" width="5" height="54" fill="#8a5a37"/><rect x="29" y="-50" width="5" height="54" fill="#8a5a37"/>
      <path d="M-46 -48 Q0 -76 46 -48 L40 -40 Q0 -64 -40 -40Z" fill="url(#fmRoofG)" stroke="#3f7a32" stroke-width="1.5"/></g>
      ${nameplate(x - 110, y + 2, "菇棚")}</g>`;
    items.push({ y: y - 40, svg: shed });
    for (let i = 0; i < n; i++) {
      const lx = x - 40 + (i % 4) * 52 + (i >= 4 ? 26 : 0);
      const ly = y - 32 + (i >= 4 ? 30 : 0) + (i % 4) * 6;
      const l = S.logs.slots[i];
      const st = logState(l);
      HITS.push({ y: ly, svg: `<ellipse class="tap fm-hit" data-act="log" data-key="${i}" role="button" tabindex="0" aria-label="${l ? `${D.crops[l.c].name}菇木，${st === "ripe" ? "可以採" : `還要 ${dur(l.next - now())}`}` : "空的菇木位置，點一下放菇木"}" cx="${lx}" cy="${ly - 8}" rx="24" ry="18" fill="#fff" fill-opacity="0" pointer-events="all"/>` });
      let s = `<g pointer-events="none">`;
      s += `<ellipse cx="${lx}" cy="${ly}" rx="24" ry="9" fill="#7a5a3a" opacity=".35"/>`;
      if (!l) {
        s += `<ellipse cx="${lx}" cy="${ly - 2}" rx="20" ry="7" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="5 4"/><text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="16" fill="#fff">＋</text>`;
      } else {
        s += cropArt(l.c, st === "ripe" ? 3 : 1, lx, ly + 4, 40);
        if (st === "ripe") s += sparkle(lx + 18, ly - 40, 6);
      }
      items.push({ y: ly, svg: s + "</g>" });
    }
  }

  function orchardSvg(items, x, y) {
    const n = orchardSlots();
    const cols = 4;
    const tw = 34, th = 17;
    let fence = `<g pointer-events="none">${pad(x, y - 40, 150, 72, "#b9dc8a")}</g>`;
    items.push({ y: y - 120, svg: fence + nameplate(x - 120, y - 2, "果園") });
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const tx = x + (c - r) * tw * 1.25 - 20;
      const ty = y - 110 + (r + c) * th * 1.25 + 10;
      const tr = S.orchard.trees[i];
      const st = treeState(tr);
      HITS.push({ y: ty, svg: `<ellipse class="tap fm-hit" data-act="tree" data-key="${i}" role="button" tabindex="0" aria-label="${tr ? `${D.crops[tr.c].name}樹，${st === "ripe" ? "結果了" : st === "growing" ? "樹苗長大中" : "等結果"}` : "空的樹位，點一下種樹"}" cx="${tx}" cy="${ty - 14}" rx="${tw * 0.85}" ry="${th * 1.6}" fill="#fff" fill-opacity="0" pointer-events="all"/>` });
      let s = `<g pointer-events="none">`;
      s += `<ellipse cx="${tx}" cy="${ty}" rx="${tw * 0.8}" ry="${th * 0.8}" fill="#8fbf5a" stroke="#fff" stroke-width="1.5" ${tr ? "" : 'stroke-dasharray="5 4"'}/>`;
      if (!tr) {
        s += `<text x="${tx}" y="${ty + 5}" text-anchor="middle" font-size="16" fill="#fff">＋</text>`;
      } else {
        const stage = st === "growing" ? 1 : st === "ripe" ? 3 : 2;
        const scale = st === "growing" ? 46 : 64;
        s += cropArt(tr.c, stage, tx, ty + 4, scale);
        if (st === "ripe") s += sparkle(tx + 22, ty - 60, 6);
      }
      items.push({ y: ty, svg: s + "</g>" });
    }
  }

  function bambooSvg(x, y) {
    const n = bambooReady();
    let s = `<g class="tap" data-act="bamboo" role="button" tabindex="0" aria-label="竹林${n ? `，有 ${n} 批竹筍可以撿` : ""}">`;
    s += `<ellipse cx="${x}" cy="${y - 4}" rx="80" ry="20" fill="#3f6b25" opacity=".2"/>`;
    const stalks = [[-50, 110], [-30, 140], [-8, 125], [14, 150], [36, 118], [56, 100]];
    for (const [dx, h] of stalks) {
      s += `<rect x="${x + dx - 5}" y="${y - h}" width="10" height="${h}" rx="4" fill="#7ec25a" stroke="#4f9334" stroke-width="1.5"/>`;
      for (let k = 1; k < h / 28; k++) s += `<rect x="${x + dx - 6}" y="${y - k * 28}" width="12" height="3" rx="1.5" fill="#4f9334"/>`;
      s += `<path d="M${x + dx} ${y - h + 10} q16 -6 26 4 q-14 0 -26 -4Z M${x + dx} ${y - h + 22} q-16 -6 -26 4 q14 0 26 -4Z" fill="url(#fmLeaf)"/>`;
    }
    for (let i = 0; i < n; i++) {
      s += `<g pointer-events="none">${cropArt("bamboo", 3, x - 36 + i * 24, y + 6, 26)}</g>`;
    }
    if (n) s += mark(x, y - 160);
    s += nameplate(x, y + 18, "竹林");
    return s + "</g>";
  }

  function herbSvg(items, x, y) {
    const z = plotZone("herb");
    let frame = `<g pointer-events="none"><polygon points="${tilePoly(x, y - 30, 100, 50)}" fill="#a77546" stroke="#8a5a33" stroke-width="2"/></g>`;
    items.push({ y: y - 80, svg: frame + nameplate(x, y + 34, "香草園") });
    z.keys.forEach((key, i) => {
      const r = Math.floor(i / 3), c = i % 3;
      const tx = x + (c - r - 0.5) * 24;
      const ty = y - 30 + (r + c - 1.5) * 12;
      items.push({ y: ty, svg: plotSvg("herb", key, tx, ty, 24, 12, 4) });
    });
  }

  function teaSvg(items, x, y) {
    for (let i = 0; i < D.caps.teaBushes; i++) {
      const bx = x - 75 + (i % 3) * 60 + (i >= 3 ? 30 : 0);
      const by = y - 40 + (i >= 3 ? 34 : 0);
      const b = S.tea.bushes[i];
      const st = teaState(b);
      HITS.push({ y: by, svg: `<ellipse class="tap fm-hit" data-act="teabush" data-key="${i}" role="button" tabindex="0" aria-label="${b ? `茶樹，${st === "ripe" ? "可以採茶" : st === "growing" ? "茶苗長大中" : "等新芽"}` : "空的茶樹位置"}" cx="${bx}" cy="${by - 10}" rx="26" ry="18" fill="#fff" fill-opacity="0" pointer-events="all"/>` });
      let s = `<g pointer-events="none">`;
      s += `<ellipse cx="${bx}" cy="${by}" rx="26" ry="10" fill="#7a5a3a" opacity=".3"/>`;
      if (!b) {
        s += `<text x="${bx}" y="${by + 5}" text-anchor="middle" font-size="16" fill="#fff">＋</text>`;
      } else {
        const k = st === "growing" ? 0.6 : 1;
 s += `<g><ellipse cx="${bx}" cy="${by - 14 * k}" rx="${24 * k}" ry="${16 * k}" fill="#4f9f3a"/><ellipse cx="${bx - 6}" cy="${by - 20 * k}" rx="${16 * k}" ry="${11 * k}" fill="#6cc152"/>`;
        if (st === "ripe") s += `<circle cx="${bx - 8}" cy="${by - 26}" r="4" fill="#c8f59a"/><circle cx="${bx + 8}" cy="${by - 22}" r="4" fill="#c8f59a"/><circle cx="${bx}" cy="${by - 30}" r="4" fill="#c8f59a"/>`;
        s += `</g>`;
        if (st === "ripe") s += sparkle(bx + 20, by - 38, 6);
      }
      items.push({ y: by, svg: s + "</g>" });
    }
    items.push({ y: y + 10, svg: nameplate(x, y + 26, "茶園") });
  }

  let HITS = [];

  function renderScene() {

    const dyn = UI.root && UI.root.querySelector("#fm-dyn");
    if (!dyn) return;

    const items = [];
    HITS = [];
    fieldSvg(items);
    zoneSvg(items);
    items.sort((a, b) => a.y - b.y);
    HITS.sort((a, b) => a.y - b.y);

    dyn.innerHTML = items.map(it => it.svg).join("") + `<g class="fm-hits">${HITS.map(it => it.svg).join("")}</g>`;
    UI.nextEventAt = nextEvent();

    if (!UI.centered) layoutMap(true);

  }

  /* 下一次畫面會變的時間（作物成熟、料理好了…） */
  function nextEvent() {
    const t = now();
    let next = Infinity;
    const consider = ts => { if (ts && ts > t && ts < next) next = ts; };
    for (const zone of ["field", "herb", "green"]) {
      const z = plotZone(zone);
      for (const key of z.keys) {
        const p = z.store[key];
        if (p && p.t1) { consider(p.t1); consider(p.t0 + (p.t1 - p.t0) / 2); }
      }
    }
    for (const tr of Object.values(S.orchard.trees)) { consider(tr.grown); consider(tr.next); }
    for (const l of Object.values(S.logs.slots)) consider(l.next);
    for (const b of Object.values(S.tea.bushes)) { consider(b.grown); consider(b.next); }
    if (zoneUnlocked("竹林") && bambooReady() < D.caps.bambooMax) consider(bambooNextAt());
    for (const j of S.kitchen.jobs) consider(j.t1);
    for (const q of Object.values(S.mach)) for (const j of q) consider(j.t1);
    for (const a of S.ranch.animals) consider(a.t1);
    for (const ts of Object.values(S.ranch.breed)) consider(ts);
    for (const slot of S.ranch.inc) consider(slot.t1);
    return next;
  }


  /* ---------- 拖曳與縮放 ---------- */

  function layoutMap(center = false) {

    if (!UI.view || !UI.map) return;

    const vw = UI.view.clientWidth;
    const vh = UI.view.clientHeight;
    if (!vw || !vh) return;

    const old = UI.scale;
    UI.scale = (vw / 520) * UI.zoom;

    UI.map.style.width = MAP_W * UI.scale + "px";
    UI.map.style.height = MAP_H * UI.scale + "px";

    if (center || !UI.centered) {
      UI.tx = vw / 2 - HOME.x * UI.scale;
      UI.ty = vh * 0.5 - HOME.y * UI.scale;
      UI.centered = true;
    } else if (old && old !== UI.scale) {
      /* 縮放時保持畫面中心 */
      const cx = (vw / 2 - UI.tx) / old;
      const cy = (vh / 2 - UI.ty) / old;
      UI.tx = vw / 2 - cx * UI.scale;
      UI.ty = vh / 2 - cy * UI.scale;
    }

    clampPan();
    applyPan();

  }

  function clampPan() {
    const vw = UI.view.clientWidth;
    const vh = UI.view.clientHeight;
    const mw = MAP_W * UI.scale;
    const mh = MAP_H * UI.scale;
    const slackX = vw * 0.35;
    const slackY = vh * 0.3;
    UI.tx = Math.min(slackX, Math.max(vw - mw - slackX, UI.tx));
    UI.ty = Math.min(slackY, Math.max(vh - mh - slackY, UI.ty));
  }

  function applyPan() {
    UI.map.style.transform = `translate3d(${Math.round(UI.tx)}px, ${Math.round(UI.ty)}px, 0)`;
  }

  let drag = null;
  let suppressClick = false;
  let panFrame = 0;

  function setupPan() {

    const view = UI.view;

    view.addEventListener("pointerdown", e => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: UI.tx, ty: UI.ty, moved: false };
    });

    view.addEventListener("pointermove", e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 8) return;
      if (!drag.moved) {
        drag.moved = true;
        view.classList.add("dragging");
        try { view.setPointerCapture(e.pointerId); } catch (err) { /* 沒關係 */ }
        closePop();
      }
      UI.tx = drag.tx + dx;
      UI.ty = drag.ty + dy;
      clampPan();
      if (!panFrame) panFrame = requestAnimationFrame(() => { panFrame = 0; applyPan(); });
    });

    const end = e => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      if (drag.moved) {
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 60);
      }
      view.classList.remove("dragging");
      drag = null;
    };

    view.addEventListener("pointerup", end);
    view.addEventListener("pointercancel", end);
    /* 手指按下時瀏覽器會先把觸控綁在被按到的小元件上，搬到 view 時那個元件會發出
       lostpointercapture 並冒泡上來；只有 view 自己失去綁定才算結束，不然滑一下就停 */
    view.addEventListener("lostpointercapture", e => { if (e.target === view) end(e); });

    view.addEventListener("wheel", e => {
      e.preventDefault();
      if (e.ctrlKey) {
        setZoom(e.deltaY < 0 ? 1 : -1);
        return;
      }
      UI.tx -= e.deltaX;
      UI.ty -= e.deltaY;
      clampPan();
      applyPan();
      closePop();
    }, { passive: false });

  }

  function setZoom(dir) {
    const i = ZOOMS.indexOf(UI.zoom);
    const j = Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 1 : i) + dir));
    if (ZOOMS[j] === UI.zoom) return;
    UI.zoom = ZOOMS[j];
    closePop();
    layoutMap(false);
  }


  /* =========================================================
     18. 點擊
  ========================================================= */

  function onClick(e) {

    if (suppressClick) return;

    const el = e.target.closest("[data-act]");

    if (!el || !UI.root.contains(el)) {
      if (UI.pop && !e.target.closest("#fm-pop")) closePop();
      return;
    }

    const act = el.dataset.act;
    const fn = ACTS[act];

    if (!fn) return;

    e.preventDefault();

    if (!S) return;

    if (act !== "pop" && !el.closest("#fm-pop") && UI.pop && act !== "plot") closePop();

    fn(el, e);

  }

  function after(saveNow_ = false) {
    processTimers();
    saveSoon(saveNow_);
    renderAll();
    checkLevelPopup();
  }

  const ACTS = {

    zoom: el => setZoom(Number(el.dataset.z)),
    home: () => { UI.zoom = 1; closePop(); layoutMap(true); },
    retry: () => { net.dirty = true; saveNow(); },
    setup: () => openModal("setup"),

    water: () => openModal("water"),
    goals: () => openSheet("goals"),
    storage: () => openSheet("storage"),
    kitchen: () => openSheet("kitchen"),
    book: () => openSheet("book"),
    wish: () => openSheet("wish"),
    ranch: () => openSheet("ranch"),
    green: () => openSheet("green"),
    workshop: () => openSheet("workshop"),

    market: () => {
      if (!zoneUnlocked("市集")) return toast(`市集 Lv${zoneLv("市集")} 開放`);
      openSheet("market");
    },

    pier: () => toast(zoneUnlocked("碼頭") ? "🎣 釣魚還在準備中，之後會開放" : `碼頭 Lv${zoneLv("碼頭")} 開放，釣魚之後加入`),

    zone: el => {
      const zone = el.dataset.zone;
      if (!zoneUnlocked(zone)) return toast(`${zone} Lv${zoneLv(zone)} 開放`);
      openModal("zone", { zone });
    },

    expand: () => {
      const next = fieldNextExpand();
      if (!next) return;
      if (S.lv < next[0]) return toast(`Lv${next[0]} 可以把菜田擴建成 ${next[1]}×${next[1]}`);
      openModal("expand");
    },

    plot: el => {
      const zone = el.dataset.zone;
      const key = el.dataset.key;
      const p = plotZone(zone).store[key];
      const st = plotState(p);
      if (st === "ripe") {
        const res = harvestOne(zone, key);
        if (!res) return toast("倉庫滿了，先去賣掉或用掉一些東西");
        floatAt(el, `+${res.qty} ${itemIconInline(res.crop)} <small>+${res.exp} EXP</small>${res.seedBack ? " 🌰" : ""}`);
        closePop();
        return after();
      }
      if (st === "empty") {
        closePop();
        return openSheet("seeds", { zone, key });
      }
      openPop({ type: "plot", zone, key, el });
    },

    log: el => {
      const i = Number(el.dataset.key);
      const l = S.logs.slots[i];
      if (!l) return openSheet("seeds", { zone: "logs", key: i });
      if (logState(l) === "ripe") {
        const res = harvestLog(i);
        if (!res) return toast("倉庫滿了");
        floatAt(el, `+${res.qty} ${itemIconInline(res.crop)} <small>+${res.exp} EXP</small>`);
        if (res.used) toast("這根菇木採完了，可以放新的");
        return after();
      }
      openPop({ type: "log", key: i, el });
    },

    tree: el => {
      const i = Number(el.dataset.key);
      const tr = S.orchard.trees[i];
      if (!tr) return openSheet("seeds", { zone: "orchard", key: i });
      if (treeState(tr) === "ripe") {
        const res = harvestTree(i);
        if (!res) return toast("倉庫滿了");
        floatAt(el, `+${res.qty} ${itemIconInline(res.crop)} <small>+${res.exp} EXP</small>`);
        return after();
      }
      openPop({ type: "tree", key: i, el });
    },

    teabush: el => {
      const i = Number(el.dataset.key);
      const b = S.tea.bushes[i];
      if (!b) return openModal("tea", { slot: i });
      if (teaState(b) === "ripe") {
        const res = harvestTea(i);
        if (!res) return toast("倉庫滿了");
        floatAt(el, `+${res.qty} ${itemIconInline("tea")} <small>+${res.exp} EXP</small>`);
        return after();
      }
      openPop({ type: "tea", key: i, el });
    },

    bamboo: el => {
      const res = harvestBamboo();
      if (!res) {
        if (bambooReady() > 0) return toast("倉庫滿了");
        return toast(`竹筍還沒冒出來，${dur(bambooNextAt() - now())} 後會有`);
      }
      floatAt(el, `+${res.qty} ${itemIconInline("bamboo")} <small>+${res.exp} EXP</small>`);
      after();
    },

    logs: () => {
      const empty = [...Array(logSlots()).keys()].find(i => !S.logs.slots[i]);
      if (empty !== undefined) openSheet("seeds", { zone: "logs", key: empty });
      else toast("菇木都放滿了，點菇木可以採收");
    },

    harvestall: el => {
      const res = harvestAll();
      if (!res.count) {
        if (res.full) return toast("倉庫滿了，先去賣掉或用掉一些東西");
        return toast("現在沒有成熟的作物");
      }
      toast(`🌾 收成 ${res.count} 次，+${res.exp} EXP${res.full ? "（倉庫滿了，有些沒收）" : ""}`);
      after();
    },

    pop: (el) => doPop(el.dataset.opt),

    sheetclose: () => closeSheet(),
    modalclose: () => closeModal(),

    tab: el => {
      if (!UI.sheet) return;
      UI.sheet.tab = el.dataset.tab;
      renderSheet();
    },

    plant: el => {
      const t = UI.sheet;
      if (!t) return;
      const crop = el.dataset.crop;
      const all = el.dataset.all === "1";
      doPlant(t.zone, t.key, crop, all);
    },

    sprinkler: () => {
      const t = UI.sheet;
      if (!t || t.zone !== "field") return;
      const placed = Object.values(S.field.plots).filter(p => p.s).length;
      if (placed >= sprinklerCap()) return toast("灑水器都放好了");
      S.field.plots[t.key] = { s: 1 };
      closeSheet();
      toast("💦 放好灑水器了，旁邊 8 格不用澆水");
      after();
    },

    cook: el => {
      const res = cookDish(el.dataset.dish);
      if (res !== "ok") return toast(res);
      toast(`🍳 開始做「${D.dishes[el.dataset.dish].name}」`);
      after();
    },

    pickdish: el => {
      UI.kitchenPick = el.dataset.dish;
      renderSheet();
    },

    collectdish: el => {
      const i = Number(el.dataset.i);
      const res = collectDish(i);
      if (!res) return toast(invSpace() < 1 ? "倉庫滿了" : "還沒做好");
      toast(`✨ ${D.dishes[res.dish].name} 做好了！+${res.exp} EXP`);
      after();
    },

    serve: el => {
      if (!serveOrder(Number(el.dataset.i))) return toast("倉庫裡沒有這道菜");
      toast("😋 客人很滿意！");
      after();
    },

    upgradekitchen: () => openModal("kitchenup"),

    startrecipe: el => {
      const res = startRecipe(el.dataset.r);
      if (res !== "ok") return toast(res);
      after();
    },

    collectmach: el => {
      const out = collectMachine(el.dataset.m);
      if (!out) return toast(invSpace() < 1 ? "倉庫滿了" : "還沒做好");
      toast(`⚙️ 拿到 ${out.map(itemName).join("、")}`);
      after();
    },

    feedall: () => {
      let n = 0, lack = false;
      for (const a of S.ranch.animals) {
        if (animalState(a) !== "hungry") continue;
        if (feedAnimal(a)) n++;
        else lack = true;
      }
      if (!n) return toast(lack ? "飼料不夠了，用飼料機做一些" : "動物都吃飽了");
      toast(`🌾 餵了 ${n} 隻${lack ? "（飼料不夠，還有沒餵到的）" : ""}`);
      after();
    },

    collectall: () => {
      let n = 0, exp = 0;
      for (const a of S.ranch.animals) {
        const res = collectAnimal(a);
        if (res) { n++; exp += res.exp; }
      }
      if (!n) return toast(invSpace() < 1 ? "倉庫滿了" : "現在沒有可以收的");
      toast(`🧺 收了 ${n} 個畜產品，+${exp} EXP`);
      after();
    },

    animal: el => openModal("animal", { id: Number(el.dataset.id) }),

    buyanimal: el => openModal("buyanimal", { sp: el.dataset.sp }),

    incubate: el => {
      const res = incubate(el.dataset.egg);
      if (res !== "ok") return toast(res);
      toast("🥚 放進孵蛋器了");
      after();
    },

    buy: el => {
      const res = buyItem(el.dataset.item, Number(el.dataset.qty || 1));
      if (res !== "ok") return toast(res);
      toast(`🛒 買了 ${itemName(el.dataset.item)} ×${el.dataset.qty || 1}`);
      after();
    },

    sell: el => {
      const key = el.dataset.item;
      const qty = el.dataset.qty === "all" ? have(key) : Number(el.dataset.qty || 1);
      const got = sellItem(key, qty);
      if (!got) return;
      toast(`🪙 賣出 ${itemName(key)} ×${qty}，+${num(got)} 星露`);
      after();
    },

    pickitem: el => {
      if (!UI.sheet) return;
      UI.sheet.item = UI.sheet.item === el.dataset.item ? null : el.dataset.item;
      renderSheet();
    },

    claimgoal: el => {
      const g = S.goals && S.goals.list[Number(el.dataset.i)];
      if (!g || g.claimed || g.got < g.n) return;
      g.claimed = true;
      addDew(GOAL_DEW);
      addExp(GOAL_EXP);
      toast(`🎁 +${GOAL_EXP} EXP、+${GOAL_DEW} 星露`);
      after();
    },

    openwish: el => openWish(el.dataset.kind),

    confirm: el => {
      const m = UI.modal;
      if (!m) return;
      confirmModal(m, el.dataset.v);
    }

  };

  function itemIconInline(key) {
    const src = itemSrc(key);
    return src ? `<img src="${src}" alt="">` : (D.items[key]?.emoji || "");
  }

  function harvestAll() {
    let count = 0, exp = 0, full = false;
    for (const zone of ["field", "herb", "green"]) {
      const z = plotZone(zone);
      for (const key of z.keys) {
        if (plotState(z.store[key]) !== "ripe") continue;
        const res = harvestOne(zone, key);
        if (res) { count++; exp += res.exp; } else full = true;
      }
    }
    if (S.lv >= D.caps.orchardAll) {
      for (const i of Object.keys(S.orchard.trees)) {
        if (treeState(S.orchard.trees[i]) !== "ripe") continue;
        const res = harvestTree(i);
        if (res) { count++; exp += res.exp; } else full = true;
      }
    }
    for (const i of Object.keys(S.logs.slots)) {
      if (logState(S.logs.slots[i]) !== "ripe") continue;
      const res = harvestLog(i);
      if (res) { count++; exp += res.exp; } else full = true;
    }
    for (const i of Object.keys(S.tea.bushes)) {
      if (teaState(S.tea.bushes[i]) !== "ripe") continue;
      const res = harvestTea(i);
      if (res) { count++; exp += res.exp; } else full = true;
    }
    if (bambooReady() > 0) {
      const res = harvestBamboo();
      if (res) { count++; exp += res.exp; } else full = true;
    }
    return { count, exp, full };
  }

  function doPlant(zone, key, crop, all) {

    if (zone === "orchard") {
      const res = plantTree(key, crop);
      if (res !== "ok") return toast(res);
      closeSheet();
      toast(`🌳 種下${D.crops[crop].name}樹苗，明天長大`);
      return after();
    }

    if (zone === "logs") {
      const res = plantLog(key, crop);
      if (res !== "ok") return toast(res);
      closeSheet();
      toast(`🍄 放好${D.crops[crop].name}菇木`);
      return after();
    }

    const z = plotZone(zone);
    const keys = all ? [key, ...z.keys.filter(k => k !== key && !z.store[k])] : [key];
    let planted = 0, thirsty = 0, err = null;

    for (const k of keys) {
      if (z.store[k]) continue;
      const res = plantOne(zone, k, crop);
      if (res === "ok") planted++;
      else if (res === "thirsty") { planted++; thirsty++; }
      else { err = res; break; }
    }

    if (!planted) return toast(err || "種不下去");

    if (zone === "green") openSheet("green");
    else closeSheet();

    let msg = `🌱 種了 ${planted} 格${D.crops[crop].name}`;
    if (thirsty) msg += `，${thirsty} 格沒水（完成習慣裝水後點它澆水）`;
    else if (err) msg += `（${err}）`;
    toast(msg);
    after();

  }


  /* =========================================================
     19. 小選單（點還在長的作物）
  ========================================================= */

  function openPop(info) {
    UI.pop = info;
    renderScene();
    renderPop();
  }

  function closePop() {
    if (!UI.pop) return;
    UI.pop = null;
    const el = UI.root && UI.root.querySelector("#fm-pop");
    if (el) el.hidden = true;
    renderScene();
  }

  function popOpt(opt, icon, label, disabled = false) {
    return `<button type="button" class="fm-pop-opt" data-act="pop" data-opt="${opt}" ${disabled ? "disabled" : ""}>
      <span class="fm-pop-ic">${icon}</span><span class="fm-pop-lab ol">${label}</span></button>`;
  }

  function renderPop() {

    const pop = UI.root.querySelector("#fm-pop");
    const info = UI.pop;
    if (!info) { pop.hidden = true; return; }

    let title = "", sub = "", opts = "";

    if (info.type === "plot") {
      const p = plotZone(info.zone).store[info.key];
      const st = plotState(p);
      if (!p || st === "empty" || st === "ripe") { closePop(); return; }
      if (st === "sprinkler") {
        title = "灑水器";
        sub = "旁邊 8 格種下去不用澆水";
        opts = popOpt("remove", "🧰", "收起來");
      } else {
        const c = D.crops[p.c];
        title = c.name;
        sub = st === "thirsty" ? "口渴了，澆水才會開始長" : `還要 <span data-until="${p.t1}">${dur(p.t1 - now())}</span>`;
        opts = popOpt("water", ICON.drop, `澆水`, st !== "thirsty" || S.water <= 0) +
          popOpt("waterall", "🚿", "全部澆水", S.water <= 0 || !anyThirsty()) +
          popOpt("fert", "🧪", `施肥 ${have("fert")}`, st !== "growing" || p.f || have("fert") <= 0) +
          popOpt("remove", "🧹", "剷掉");
      }
    } else if (info.type === "tree") {
      const tr = S.orchard.trees[info.key];
      if (!tr) { closePop(); return; }
      const st = treeState(tr);
      title = `${D.crops[tr.c].name}樹`;
      sub = st === "growing" ? `樹苗長大還要 <span data-until="${tr.grown}">${dur(tr.grown - now())}</span>` : `下次結果 <span data-until="${tr.next}">${dur(tr.next - now())}</span>`;
      opts = popOpt("removetree", "🪓", "砍掉");
    } else if (info.type === "log") {
      const l = S.logs.slots[info.key];
      if (!l) { closePop(); return; }
      title = `${D.crops[l.c].name}菇木`;
      sub = `下次可採 <span data-until="${l.next}">${dur(l.next - now())}</span>・還能採 ${l.left} 次`;
      opts = popOpt("removelog", "🧹", "移走");
    } else if (info.type === "tea") {
      const b = S.tea.bushes[info.key];
      if (!b) { closePop(); return; }
      const st = teaState(b);
      title = "茶樹";
      sub = st === "growing" ? `茶苗長大還要 <span data-until="${b.grown}">${dur(b.grown - now())}</span>` : `下次採茶 <span data-until="${b.next}">${dur(b.next - now())}</span>`;
      opts = popOpt("removetea", "🪓", "移走");
    }

    pop.innerHTML = `<div class="fm-pop-title">${esc(title)}</div><div class="fm-pop-sub">${sub}</div><div class="fm-pop-opts">${opts}</div>`;
    pop.hidden = false;
    placePop(pop, info);

  }

  function anyThirsty() {
    for (const zone of ["field", "herb"]) {
      const z = plotZone(zone);
      for (const key of z.keys) if (plotState(z.store[key]) === "thirsty") return true;
    }
    return false;
  }

  function placePop(pop, info) {
    const sel = info.type === "plot"
      ? `[data-act="plot"][data-zone="${info.zone}"][data-key="${info.key}"]`
      : `[data-act="${info.type === "tea" ? "teabush" : info.type}"][data-key="${info.key}"]`;
    const target = UI.root.querySelector(sel);
    if (!target) return;
    const rr = UI.root.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    let x = tr.left + tr.width / 2 - rr.left;
    let y = tr.top - rr.top + 4;
    const half = pop.offsetWidth / 2;
    const cx = Math.min(rr.width - half - 8, Math.max(half + 8, x));
    pop.style.setProperty("--tail", `${50 + ((x - cx) / pop.offsetWidth) * 100}%`);
    pop.classList.remove("below");
    if (y - pop.offsetHeight < 60) {
      y = tr.bottom - rr.top + 10;
      pop.classList.add("below");
    }
    pop.style.left = cx + "px";
    pop.style.top = y + "px";
  }

  function doPop(opt) {

    const info = UI.pop;
    if (!info) return;

    if (info.type === "plot") {
      const z = plotZone(info.zone);
      if (opt === "water") {
        if (!waterOne(info.zone, info.key)) return toast("水不夠了：完成習慣可以裝水");
        toast("💧 澆好了，開始長大");
      } else if (opt === "waterall") {
        let n = 0;
        for (const zone of ["field", "herb"]) {
          const zz = plotZone(zone);
          for (const key of zz.keys) if (plotState(zz.store[key]) === "thirsty" && waterOne(zone, key)) n++;
        }
        toast(n ? `💧 澆了 ${n} 格` : "水不夠了：完成習慣可以裝水");
      } else if (opt === "fert") {
        if (!fertOne(info.zone, info.key)) return toast("不能施肥");
        toast("🧪 施肥了，剩下的時間減半");
      } else if (opt === "remove") {
        delete z.store[info.key];
        toast("清掉了");
      }
    } else if (opt === "removetree") {
      return openModal("confirmremove", { kind: "tree", key: info.key });
    } else if (opt === "removelog") {
      delete S.logs.slots[info.key];
    } else if (opt === "removetea") {
      return openModal("confirmremove", { kind: "tea", key: info.key });
    }

    closePop();
    after();

  }


  /* =========================================================
     20. 面板
  ========================================================= */

  const BACK_SVG = `<svg viewBox="0 0 50 36" aria-hidden="true"><path d="M20 3 L3 18 L20 33 L20 24 L44 24 Q48 24 48 20 L48 16 Q48 12 44 12 L20 12Z" fill="#ffd34d" stroke="#e0a22a" stroke-width="2.5" stroke-linejoin="round"/></svg>`;

  function openSheet(name, opts = {}) {
    closePop();
    const keepTab = UI.sheet && UI.sheet.name === name ? UI.sheet.tab : null;
    UI.sheet = Object.assign({ name, tab: keepTab }, opts);
    const el = UI.root.querySelector("#fm-sheet");
    el.scrollTop = 0;
    renderSheet();
  }

  function closeSheet() {
    UI.sheet = null;
    UI.kitchenPick = null;
    UI.wishResult = null;
    const el = UI.root.querySelector("#fm-sheet");
    el.hidden = true;
    el.innerHTML = "";
    el.className = "fm-sheet";
  }

  function sheetTop(title, right = "") {
    return `<div class="fm-sh-top"><button type="button" class="fm-back" data-act="sheetclose" aria-label="返回">${BACK_SVG}</button>
      <h2 class="fm-sh-title ol">${esc(title)}</h2>${right ? `<div class="fm-sh-right">${right}</div>` : ""}</div>`;
  }

  function tabs(list, current) {
    return `<div class="fm-tabs" role="tablist">${list.map(([k, label]) =>
      `<button type="button" class="fm-tab ol" role="tab" aria-selected="${k === current}" data-act="tab" data-tab="${k}">${label}</button>`).join("")}</div>`;
  }

  function renderSheet() {

    const el = UI.root.querySelector("#fm-sheet");
    const t = UI.sheet;
    if (!t) { el.hidden = true; return; }

    const scroll = el.scrollTop;
    const fn = SHEETS[t.name];
    if (!fn) return;

    el.className = "fm-sheet " + (t.name === "kitchen" ? "kitchen" : t.name === "ranch" ? "ranch" : t.name === "wish" ? "wish" : "");
    el.innerHTML = fn(t);
    el.hidden = false;
    el.scrollTop = scroll;

  }

  function ingsHtml(need, times = 1) {
    return `<span class="fm-ings">${Object.entries(need).map(([k, q]) => {
      const ok = have(k) >= q * times;
      return `<span class="fm-ing ${ok ? "" : "lack"}">${itemIcon(k)}${esc(itemName(k))} ${have(k)}/${q * times}</span>`;
    }).join("")}</span>`;
  }

  function tagHtml(rarity) {
    if (!rarity || rarity === "c") return "";
    return `<span class="fm-tag ${rarity}">${RARITY_NAME[rarity]}</span>`;
  }

  const SHEETS = {

    /* ---------- 選種子 ---------- */
    seeds(t) {

      const zone = t.zone;
      let cropZone, title, emptyCount = 0;

      if (zone === "orchard") { cropZone = "果園"; title = "種果樹"; }
      else if (zone === "logs") { cropZone = "菇棚"; title = "放菇木"; }
      else {
        const z = plotZone(zone);
        cropZone = z.cropZone;
        title = `${z.name}・選種子`;
        emptyCount = z.keys.filter(k => !z.store[k]).length;
      }

      const list = cropsForZone(cropZone);
      const avail = list.filter(cropAvailable);
      const locked = list.filter(k => !cropAvailable(k) && D.crops[k].lv > S.lv).slice(0, 3);

      const rows = avail.map(k => {
        const c = D.crops[k];
        const gacha = c.lv === 0;
        const cost = gacha ? 0 : (c.seed || 0);
        const afford = gacha || S.dew >= cost;
        let sub;
        if (zone === "orchard") sub = `樹苗 ${num(cost)} 星露・明天長大，之後每 ${hoursText(c.hours)}結 ${c.qty} 個`;
        else if (zone === "logs") sub = `菇木 ${num(cost)} 星露・每 ${hoursText(c.hours)}採 ${c.qty} 朵，可採 4 次`;
        else sub = `${hoursText(c.hours)}・${gacha ? `種子 ${have("seed_" + k)} 顆` : `種子 ${num(cost)} 星露`}・收成 ${c.sell} 星露、${c.exp} EXP`;
        const maxN = gacha ? Math.min(emptyCount, have("seed_" + k)) : (cost ? Math.min(emptyCount, Math.floor(S.dew / cost)) : emptyCount);
        const btns = `<button type="button" class="fm-btn small green" data-act="plant" data-crop="${k}" ${afford ? "" : "disabled"}>種這格</button>` +
          (emptyCount > 1 && maxN > 1 ? `<button type="button" class="fm-btn small" data-act="plant" data-crop="${k}" data-all="1">種 ${maxN} 格</button>` : "");
        return `<div class="fm-row ${rarityClass(k)}">
          <div class="fm-row-art">${c.icon ? `<img src="${IMG}crop/${k}_i.webp" alt="">` : `<span class="fm-emo">${c.emoji}</span>`}</div>
          <div><div class="fm-row-name">${esc(c.name)}${tagHtml(c.rarity)}</div><div class="fm-row-sub">${sub}</div></div>
          <div class="fm-row-btns">${btns}</div></div>`;
      }).join("");

      const lockedRows = locked.map(k => {
        const c = D.crops[k];
        return `<div class="fm-row dim"><div class="fm-row-art"><span class="fm-emo" style="filter:grayscale(1)">${c.emoji}</span></div>
          <div><div class="fm-row-name">${esc(c.name)}</div><div class="fm-row-sub">Lv${c.lv} 解鎖</div></div><div></div></div>`;
      }).join("");

      let extra = "";
      if (zone === "field") {
        const placed = Object.values(S.field.plots).filter(p => p.s).length;
        const cap = sprinklerCap();
        if (cap > placed) extra = `<div class="fm-row r-r"><div class="fm-row-art">💦</div><div><div class="fm-row-name">灑水器</div><div class="fm-row-sub">放在這格，旁邊 8 格種下去不用澆水（還能放 ${cap - placed} 台）</div></div><div class="fm-row-btns"><button type="button" class="fm-btn small blue" data-act="sprinkler">放這裡</button></div></div>`;
      }

      const water = (zone === "field" || zone === "herb")
        ? `<div class="fm-note" style="margin:0 4px 8px">💧 水 <b>${S.water}</b> 滴・每種一格用 1 滴${isRainDay() ? "（今天下雨不用水）" : ""}</div>` : "";

      return sheetTop(title, `🌟 ${num(S.dew)}`) + `<div class="fm-panel">${water}<div class="fm-list">${extra}${rows || `<div class="fm-empty">還沒有可以種的</div>`}${lockedRows}</div></div>`;

    },

    /* ---------- 倉庫 ---------- */
    storage(t) {

      const tab = t.tab || "crop";
      const kinds = { crop: ["crop"], animal: ["animal", "meat"], goods: ["goods"], dish: ["dish"], other: ["tool", "seed"] };
      const keys = Object.keys(S.inv).filter(k => have(k) > 0 && kinds[tab].includes(D.items[k]?.kind));
      const market = zoneUnlocked("市集");
      const used = invUsed();
      const cap = storageCap();

      const cards = keys.map(k => `<button type="button" class="fm-card ${rarityClass(k)}" data-act="pickitem" data-item="${k}" aria-pressed="${t.item === k}">
        <span class="fm-card-n">${have(k)}</span><div class="fm-card-art">${itemIcon(k)}</div><div class="fm-card-name ol">${esc(itemName(k))}</div></button>`).join("");

      let detail = "";
      if (t.item && have(t.item) > 0) {
        const k = t.item;
        const price = sellPrice(k);
        detail = `<div class="fm-row" style="margin-top:10px"><div class="fm-row-art ${rarityClass(k)}">${itemIcon(k)}</div>
          <div><div class="fm-row-name">${esc(itemName(k))} ×${have(k)}</div><div class="fm-row-sub">${market ? (price ? `市集收購 ${price} 星露一個` : "不能賣") : `市集 Lv${zoneLv("市集")} 開放後可以賣`}</div></div>
          <div class="fm-row-btns">${market && price ? `<button type="button" class="fm-btn small" data-act="sell" data-item="${k}" data-qty="1">賣 1 個</button><button type="button" class="fm-btn small" data-act="sell" data-item="${k}" data-qty="all">全部賣 ${num(price * have(k))}</button>` : ""}</div></div>`;
      }

      return sheetTop("倉庫", `${used} / ${cap > 9999 ? "∞" : cap}`) +
        tabs([["crop", "作物"], ["animal", "畜產"], ["goods", "加工"], ["dish", "料理"], ["other", "其他"]], tab) +
        `<div class="fm-panel"><div class="fm-bar" style="margin-bottom:10px"><i style="width:${Math.min(100, (used / cap) * 100)}%"></i></div>
        <div class="fm-grid">${cards || `<div class="fm-empty">這裡還是空的</div>`}</div>${detail}
        ${market ? "" : `<p class="fm-note" style="margin-top:10px">倉庫 ${cap} 格，Lv15 變 200 格。東西太多可以做成料理，或等市集開放後賣掉。</p>`}</div>`;

    },

    /* ---------- 料理 ---------- */
    kitchen(t) {

      const tier = kitchenTier();
      const next = kitchenNext();
      const n = stoveCount();

      let stoves = "";
      for (let i = 0; i < n; i++) {
        const job = S.kitchen.jobs[i];
        if (!job) {
          stoves += `<div class="fm-stove free"><span class="fm-emo">🍳</span><span>空爐子</span></div>`;
        } else {
          const done = now() >= job.t1;
          stoves += `<div class="fm-stove">${itemIcon(job.d)}<span>${esc(D.dishes[job.d].name)}</span>
            ${done ? `<button type="button" class="fm-btn small green" data-act="collectdish" data-i="${i}">收取</button>` : `<span class="t" data-until="${job.t1}">${dur(job.t1 - now())}</span>`}</div>`;
        }
      }

      const known = Object.keys(D.dishes).filter(dishKnown);
      const can = known.filter(k => hasAll(D.dishes[k].need));
      const order = [...can, ...known.filter(k => !can.includes(k)).reverse()];
      const pick = UI.kitchenPick && dishKnown(UI.kitchenPick) ? UI.kitchenPick : (can[0] || known[known.length - 1]);

      let feature = "";
      if (pick) {
        const d = D.dishes[pick];
        const ok = hasAll(d.need);
        feature = `<div class="fm-panel" style="text-align:center">
          <div style="display:flex;align-items:center;gap:12px;text-align:left">
            <div class="fm-row-art ${TIER_CLASS[d.tier]}" style="width:96px;height:96px">${itemIcon(pick)}</div>
            <div style="flex:1;min-width:0"><div class="fm-row-name" style="font-size:19px">${esc(d.name)}<span class="fm-tag ${d.tier === "家常" ? "" : d.tier === "拿手" ? "r" : d.tier === "招牌" ? "l" : "x"}">${d.tier}</span></div>
            ${ingsHtml(d.need)}
            <div class="fm-row-sub">⏱ ${d.minutes} 分鐘・賣 ${num(d.sell)} 星露・${d.exp} EXP</div></div></div>
          <div style="margin-top:10px"><button type="button" class="fm-btn green" data-act="cook" data-dish="${pick}" ${ok && freeStoves() > 0 ? "" : "disabled"}>${freeStoves() > 0 ? (ok ? "開始做" : "食材不夠") : "爐子都在用"}</button></div></div>`;
      }

      const cards = order.map(k => {
        const d = D.dishes[k];
        const ok = hasAll(d.need);
        return `<button type="button" class="fm-card ${TIER_CLASS[d.tier]}" data-act="pickdish" data-dish="${k}" aria-pressed="${k === pick}">
          ${S.known.dishes[k] ? `<span class="fm-card-n">${S.known.dishes[k]}</span>` : ""}<div class="fm-card-art" style="${ok ? "" : "opacity:.55"}">${itemIcon(k)}</div><div class="fm-card-name ol">${esc(d.name)}</div></button>`;
      }).join("");

      const upcoming = Object.entries(D.dishes).filter(([k, d]) => !d.gacha && d.lv > S.lv).slice(0, 3)
        .map(([k, d]) => `<span class="fm-tag gray">${esc(d.name)} Lv${d.lv}</span>`).join(" ");

      let orders = "";
      if (S.orders && S.orders.list.length) {
        orders = `<div class="fm-panel"><div class="fm-sec ol">今日客人點餐</div><div class="fm-list">${S.orders.list.map((o, i) => {
          const d = D.dishes[o.d];
          return `<div class="fm-row ${TIER_CLASS[d.tier]}"><div class="fm-row-art">${itemIcon(o.d)}</div><div><div class="fm-row-name">${esc(d.name)}</div>
            <div class="fm-row-sub">付 ${num(Math.round(d.sell * 1.5))} 星露・+10 EXP・倉庫有 ${have(o.d)} 份</div></div>
            <div class="fm-row-btns">${o.done ? "✅" : `<button type="button" class="fm-btn small" data-act="serve" data-i="${i}" ${have(o.d) ? "" : "disabled"}>上菜</button>`}</div></div>`;
        }).join("")}</div></div>`;
      }

      const up = next ? (S.lv >= next[0]
        ? `<button type="button" class="fm-btn small" data-act="upgradekitchen">⬆ 升級成${next[2]}</button>`
        : `<span class="fm-note">Lv${next[0]} 可以升級成${next[2]}</span>`) : "";

      return sheetTop(tier[2], up) +
        `<div class="fm-panel"><div class="fm-stoves" style="grid-template-columns:repeat(${Math.max(2, n)},minmax(0,1fr))">${stoves}</div></div>
        ${feature}${orders}
        <div class="fm-panel"><div class="fm-sec ol">食譜 ${known.length}</div><div class="fm-grid">${cards}</div>
        ${upcoming ? `<p class="fm-note" style="margin-top:10px">之後會學到：${upcoming}</p>` : ""}</div>`;

    },

    /* ---------- 市集 ---------- */
    market(t) {

      const tab = t.tab || "buy";

      if (tab === "sell") {
        const keys = Object.keys(S.inv).filter(k => have(k) > 0 && sellPrice(k) > 0);
        const rows = keys.map(k => `<div class="fm-row ${rarityClass(k)}"><div class="fm-row-art">${itemIcon(k)}</div>
          <div><div class="fm-row-name">${esc(itemName(k))} ×${have(k)}</div><div class="fm-row-sub">一個 ${sellPrice(k)} 星露</div></div>
          <div class="fm-row-btns"><button type="button" class="fm-btn small" data-act="sell" data-item="${k}" data-qty="1">賣 1</button>
          <button type="button" class="fm-btn small" data-act="sell" data-item="${k}" data-qty="all">全部 ${num(sellPrice(k) * have(k))}</button></div></div>`).join("");
        return sheetTop("市集", `🌟 ${num(S.dew)}`) + tabs([["buy", "買東西"], ["sell", "賣東西"]], tab) +
          `<div class="fm-panel"><p class="fm-note" style="margin:0 0 8px">作物和材料用原價 6 成收購，料理照原價。</p><div class="fm-list">${rows || `<div class="fm-empty">倉庫裡沒有可以賣的</div>`}</div></div>`;
      }

      const rows = Object.entries(D.market.buy).map(([k, price]) => {
        const note = k === "feed" ? "動物每次產出前要吃" : k === "fert" ? "作物剩下的時間減半" : "自己養之前可以先買來做菜";
        return `<div class="fm-row ${rarityClass(k)}"><div class="fm-row-art">${itemIcon(k)}</div>
          <div><div class="fm-row-name">${esc(itemName(k))}</div><div class="fm-row-sub">${price} 星露・${note}・有 ${have(k)}</div></div>
          <div class="fm-row-btns"><button type="button" class="fm-btn small" data-act="buy" data-item="${k}" data-qty="1" ${S.dew >= price ? "" : "disabled"}>買 1</button>
          ${S.dew >= price * 5 ? `<button type="button" class="fm-btn small" data-act="buy" data-item="${k}" data-qty="5">買 5</button>` : ""}</div></div>`;
      }).join("");

      return sheetTop("市集", `🌟 ${num(S.dew)}`) + tabs([["buy", "買東西"], ["sell", "賣東西"]], tab) + `<div class="fm-panel"><div class="fm-list">${rows}</div></div>`;

    },

    /* ---------- 加工坊 ---------- */
    workshop() {
      const machines = Object.keys(D.machines).filter(m => D.machines[m].where === "workshop");
      return sheetTop("加工坊", `📦 ${invUsed()}/${storageCap() > 9999 ? "∞" : storageCap()}`) +
        machines.map(m => machineHtml(m)).join("") +
        (S.lv >= D.caps.workshopHalf ? "" : `<p class="fm-note" style="margin:0 14px 14px">Lv${D.caps.workshopHalf} 加工時間減半。</p>`);
    },

    /* ---------- 溫室 ---------- */
    green() {
      const z = plotZone("green");
      const tiles = z.keys.map(key => {
        const p = z.store[key];
        const st = plotState(p);
        if (!p) return `<button type="button" class="fm-card" data-act="greenplot" data-key="${key}"><div class="fm-card-art">＋</div><div class="fm-card-name ol">空位</div></button>`;
        return `<button type="button" class="fm-card ${rarityClass(p.c)}" data-act="greenplot" data-key="${key}"><div class="fm-card-art">${itemIcon(p.c)}</div>
          <div class="fm-card-name ol">${st === "ripe" ? "可以收" : `<span data-until="${p.t1}">${dur(p.t1 - now())}</span>`}</div></button>`;
      }).join("");
      return sheetTop("溫室") + `<div class="fm-panel"><p class="fm-note" style="margin:0 0 10px">溫室不用澆水，共 6 格。</p><div class="fm-grid three">${tiles}</div></div>`;
    },

    /* ---------- 牧場 ---------- */
    ranch() {

      const feedRow = `<div class="fm-pen"><div class="fm-pen-head"><h3 class="ol" style="--olc:#4f8f35">🌾 飼料 ${have("feed")}</h3>
        <button type="button" class="fm-btn small green" data-act="feedall">全部餵食</button>
        <button type="button" class="fm-btn small" data-act="collectall">全部收成</button></div>
        <p class="fm-note" style="margin:0">動物每次產出前要吃飼料；幼崽吃飽才會長大。${S.lv >= D.caps.autoFeed ? "自動餵食器運作中。" : `Lv${D.caps.autoFeed} 開自動餵食器。`}</p></div>`;

      const mill = machineHtml("feedmill", true);

      let inc = "";
      if (S.lv >= D.zones["孵蛋器"].lv) {
        const slots = [];
        for (let i = 0; i < D.caps.incubator; i++) {
          const slot = S.ranch.inc[i];
          if (!slot) { slots.push(`<div class="fm-stove free"><span class="fm-emo">🪺</span><span>空的</span></div>`); continue; }
          const sp = EGG_SPECIES[slot.egg];
          const done = now() >= slot.t1;
          slots.push(`<div class="fm-stove">${itemIcon(slot.egg)}<span>${esc(D.animals[sp].baby)}</span><span class="t">${done ? "住處滿了，空出位子就孵出來" : `<span data-until="${slot.t1}">${dur(slot.t1 - now())}</span>`}</span></div>`);
        }
        const eggs = Object.keys(EGG_SPECIES).filter(e => S.lv >= D.animals[EGG_SPECIES[e]].lv);
        const btns = eggs.map(e => `<button type="button" class="fm-btn small" data-act="incubate" data-egg="${e}" ${have(e) && S.ranch.inc.length < D.caps.incubator ? "" : "disabled"}>放${esc(itemName(e))}（${have(e)}）</button>`).join(" ");
        inc = `<div class="fm-pen"><div class="fm-pen-head"><h3 class="ol" style="--olc:#a8641e">🥚 孵蛋器</h3></div>
          <div class="fm-stoves" style="grid-template-columns:repeat(2,minmax(0,1fr))">${slots.join("")}</div><div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${btns}</div></div>`;
      }

      const pens = Object.entries(D.animals).filter(([sp, a]) => sp !== "deer" || animalsOf("deer").length).map(([sp, info]) => {
        if (S.lv < info.lv) return null;
        const list = animalsOf(sp);
        const cap = animalCap(sp);
        const tiles = list.map(a => animalTile(a)).join("");
        const canBuy = list.length < cap && (info.babyPrice || info.adultPrice);
        const empty = canBuy ? `<button type="button" class="fm-animal empty" data-act="buyanimal" data-sp="${sp}" aria-label="買${info.name}">＋</button>` : "";
        const breedTxt = info.breed === "pair"
          ? (S.ranch.breed[sp] ? `下一隻寶寶 <span data-until="${S.ranch.breed[sp]}">${dur(S.ranch.breed[sp] - now())}</span>` : "2 隻成年的放一起會生寶寶")
          : info.breed === "egg" ? "蛋放進孵蛋器會孵出寶寶" : "";
        return `<div class="fm-pen"><div class="fm-pen-head"><h3 class="ol" style="--olc:#6a4220">${info.emoji} ${esc(info.house)}</h3><span class="fm-note">${list.length}/${cap}</span></div>
          <div class="fm-animals">${tiles}${empty}</div>${breedTxt ? `<p class="fm-note" style="margin:6px 0 0">${breedTxt}</p>` : ""}</div>`;
      }).filter(Boolean).join("");

      const nextAnimal = Object.values(D.animals).find(a => a.lv > S.lv && a.lv < 50);
      const tease = nextAnimal ? `<p class="fm-note" style="margin:0 14px 16px;text-align:center">下一種動物：${nextAnimal.emoji} ${esc(nextAnimal.name)}（Lv${nextAnimal.lv}）</p>` : "";

      return sheetTop("牧場", `🌾 ${have("feed")}・📦 ${invUsed()}/${storageCap() > 9999 ? "∞" : storageCap()}`) + feedRow + mill + inc + pens + tease;

    },

    /* ---------- 圖鑑 ---------- */
    book(t) {

      const tab = t.tab || "crop";
      let cards = "", got = 0, total = 0;

      if (tab === "crop") {
        for (const [k, c] of Object.entries(D.crops)) {
          total++;
          const n = S.known.crops[k] || 0;
          if (n) got++;
          cards += `<div class="fm-card ${rarityClass(k)} ${n ? "" : "locked"}">${n ? `<span class="fm-card-n">${n}</span>` : ""}
            <div class="fm-card-art">${c.icon ? `<img src="${IMG}crop/${k}_i.webp" alt="">` : `<span class="fm-emo">${c.emoji}</span>`}</div>
            <div class="fm-card-name ol">${n ? esc(c.name) : (c.lv ? `Lv${c.lv}` : "星願瓶")}</div></div>`;
        }
      } else if (tab === "dish") {
        for (const [k, d] of Object.entries(D.dishes)) {
          total++;
          const n = S.known.dishes[k] || 0;
          if (n) got++;
          cards += `<div class="fm-card ${TIER_CLASS[d.tier]} ${n ? "" : "locked"}">${n ? `<span class="fm-card-n">${n}</span>` : ""}
            <div class="fm-card-art">${itemIcon(k)}</div><div class="fm-card-name ol">${n || dishKnown(k) ? esc(d.name) : (d.gacha ? "星願瓶" : `Lv${d.lv}`)}</div></div>`;
        }
      } else {
        for (const [sp, a] of Object.entries(D.animals)) {
          total++;
          const n = S.known.animals[sp] || 0;
          if (n) got++;
          cards += `<div class="fm-card r-c ${n ? "" : "locked"}"><div class="fm-card-art">${animalIcon(sp, true)}</div><div class="fm-card-name ol">${n ? esc(a.name) : `Lv${a.lv}`}</div></div>`;
        }
      }

      return sheetTop("圖鑑", `${got} / ${total}`) + tabs([["crop", "作物"], ["dish", "料理"], ["animal", "動物"]], tab) +
        `<div class="fm-panel"><div class="fm-bar" style="margin-bottom:10px"><i style="width:${(got / total) * 100}%"></i></div><div class="fm-grid">${cards}</div></div>`;

    },

    /* ---------- 星願瓶 ---------- */
    wish() {

      const jars = ["wish_normal", "wish_rare", "wish_limited"].map(k => `<div class="fm-wish"><div class="jar">${WISH_JARS[k]}</div>
        <div class="n ol" style="--olc:#6a4bbd">${WISH_NAMES[k]}</div><div class="fm-note">有 <b>${net.wish[k] || 0}</b> 個</div>
        <button type="button" class="fm-btn small ${k === "wish_limited" ? "red" : k === "wish_rare" ? "blue" : ""}" data-act="openwish" data-kind="${k}" ${(net.wish[k] || 0) > 0 && net.mode === "server" ? "" : "disabled"}>打開</button></div>`).join("");

      let result = "";
      if (UI.wishResult) {
        const r = UI.wishResult;
        const art = r.dish ? itemIcon(r.dish) : r.item ? itemIcon(r.item) : `<span class="big">${r.icon || "🎁"}</span>`;
        result = `<div class="fm-wish-result"><div>${art}</div><div class="ol" style="font-size:20px;--olc:#b07a18;margin-top:6px">${esc(r.text)}</div></div>`;
      }

      const local = net.mode === "local" ? `<p class="fm-note" style="margin:0 14px 10px">⚠️ 資料庫的星露島設定還沒完成，暫時不能開星願瓶。</p>` : "";

      return sheetTop("星願瓶") + local + `<div class="fm-panel" style="background:rgba(255,255,255,.75)"><div class="fm-wishes">${jars}</div>
        <p class="fm-note" style="margin:10px 2px 0">簽到、每月獎勵、島嶼每 5 級都會拿到星願瓶。</p></div>${result}
        <div class="fm-panel" style="background:rgba(255,255,255,.75)"><div class="fm-sec ol">會抽到什麼</div><ul class="fm-note" style="margin:0;padding-left:18px">
        <li><b>普通</b>：星露、肥料、飼料、作物 ×5，小機率金穗稻、彩虹玉米、星露草種子、金穗飯糰食譜</li>
        <li><b>稀有</b>：大量星露、金穗稻、彩虹玉米、星露草種子，金穗飯糰、彩虹玉米濃湯、星露草布丁食譜，極小機率月光蓮</li>
        <li><b>限定</b>：月光蓮種子、月光蓮花茶食譜、星露草種子、大量星露</li>
        <li>家具和釣竿等碼頭、裝飾空地開放後加入</li></ul></div>`;

    },

    /* ---------- 小目標 ---------- */
    goals() {
      const rows = (S.goals ? S.goals.list : []).map((g, i) => {
        const t = GOAL_TYPES.find(x => x.k === g.k);
        const done = g.got >= g.n;
        return `<div class="fm-row"><div class="fm-row-art r-l">${t.icon}</div>
          <div><div class="fm-row-name">${t.name} ${g.n} 次</div><div class="fm-bar" style="margin-top:4px"><i style="width:${(g.got / g.n) * 100}%"></i></div><div class="fm-row-sub">${g.got} / ${g.n}・獎勵 ${GOAL_EXP} EXP、${GOAL_DEW} 星露</div></div>
          <div class="fm-row-btns">${g.claimed ? "✅" : `<button type="button" class="fm-btn small green" data-act="claimgoal" data-i="${i}" ${done ? "" : "disabled"}>領取</button>`}</div></div>`;
      }).join("");
      return sheetTop("今日小目標") + `<div class="fm-panel"><div class="fm-list">${rows}</div><p class="fm-note" style="margin-top:10px">每天凌晨 2 點換新的小目標。</p></div>`;
    }

  };

  ACTS.greenplot = el => {
    const key = el.dataset.key;
    const p = S.green.plots[key];
    const st = plotState(p);
    if (!p) return openSheet("seeds", { zone: "green", key });
    if (st === "ripe") {
      const res = harvestOne("green", key);
      if (!res) return toast("倉庫滿了");
      toast(`+${res.qty} ${itemName(res.crop)}，+${res.exp} EXP`);
      return after();
    }
    if (st === "growing" && have("fert") > 0 && !p.f) {
      fertOne("green", key);
      toast("🧪 施肥了，剩下的時間減半");
      return after();
    }
    toast(`還要 ${dur(p.t1 - now())}`);
  };

  function machineHtml(m, inRanch = false) {

    const info = D.machines[m];
    const open = machineOpen(m);

    if (!open) {
      return S.lv < info.lv ? `<div class="${inRanch ? "fm-pen" : "fm-panel"}" style="opacity:.6"><div class="fm-row-name">${info.emoji} ${esc(info.name)}</div><div class="fm-note">Lv${info.lv} 開放</div></div>` : "";
    }

    const q = machineQueue(m);
    const ready = machineReadyCount(m);
    const recipes = Object.entries(D.recipes).filter(([k, r]) => r.machine === m && S.lv >= r.lv);

    const queue = q.map(j => {
      const r = D.recipes[j.r];
      const done = now() >= j.t1;
      return `<span class="fm-ing">${itemIcon(r.out)}${done ? "好了" : `<span data-until="${j.t1}">${dur(j.t1 - now())}</span>`}</span>`;
    }).join("");

    const rows = recipes.map(([k, r]) => {
      const ok = hasAll(r.need);
      return `<div class="fm-row ${rarityClass(r.out)}"><div class="fm-row-art">${itemIcon(r.out)}</div>
        <div><div class="fm-row-name">${esc(itemName(r.out))} ×${r.qty}</div>${ingsHtml(r.need)}<div class="fm-row-sub">⏱ ${machineMinutes(r)} 分鐘・+3 EXP</div></div>
        <div class="fm-row-btns"><button type="button" class="fm-btn small green" data-act="startrecipe" data-r="${k}" ${ok && q.length < QUEUE_MAX ? "" : "disabled"}>做</button></div></div>`;
    }).join("");

    return `<div class="${inRanch ? "fm-pen" : "fm-panel"}"><div class="fm-pen-head"><h3 class="ol" style="--olc:#6a4220">${info.emoji} ${esc(info.name)}</h3>
      <span class="fm-note">排隊 ${q.length}/${QUEUE_MAX}</span>${ready ? `<button type="button" class="fm-btn small" data-act="collectmach" data-m="${m}">收取 ${ready}</button>` : ""}</div>
      ${queue ? `<div class="fm-ings" style="margin-bottom:8px">${queue}</div>` : ""}<div class="fm-list">${rows}</div></div>`;

  }

  function animalTile(a) {
    const info = D.animals[a.sp];
    const st = animalState(a);
    let status = "", bub = "";
    if (st === "hungry") { status = "餓了"; bub = `<span class="bub">🌾</span>`; }
    else if (st === "ready") { status = "可以收"; bub = `<span class="bub">${itemIcon(info.product)}</span>`; }
    else if (st === "growing") status = `<span data-until="${a.t1}">${dur(a.t1 - now())}</span>`;
    else if (st === "working") status = `<span data-until="${a.t1}">${dur(a.t1 - now())}</span>`;
    return `<button type="button" class="fm-animal ${a.adult ? "" : "baby"}" data-act="animal" data-id="${a.id}" aria-label="${esc(a.adult ? info.name : info.baby)}，${st === "hungry" ? "餓了" : st === "ready" ? "有東西可以收" : "忙著"}">
      ${animalIcon(a.sp, a.adult, "a")}${bub}<span class="st">${a.adult ? "" : "寶寶 "}${status}</span></button>`;
  }


  /* =========================================================
     21. 彈窗
  ========================================================= */

  function openModal(name, opts = {}) {
    closePop();
    UI.modal = Object.assign({ name }, opts);
    renderModal();
  }

  function closeModal() {
    UI.modal = null;
    const el = UI.root.querySelector("#fm-modal");
    el.hidden = true;
    el.innerHTML = "";
  }

  function modalBox(title, body, actions) {
    return `<div class="fm-modal-box"><div class="fm-modal-title ol">${title}</div>${body}<div class="fm-modal-actions">${actions}</div></div>`;
  }

  function renderModal() {

    const el = UI.root.querySelector("#fm-modal");
    const m = UI.modal;
    if (!m) { el.hidden = true; return; }

    let html = "";
    const close = `<button type="button" class="fm-btn" data-act="modalclose">關閉</button>`;

    if (m.name === "levelup") {
      const levels = m.levels.map(lv => D.levels[lv - 1]);
      const unlocks = levels.flatMap(l => l.unlocks);
      const dew = levels.reduce((s, l) => s + l.dew, 0);
      const wishes = levels.filter(l => l.wish).map(l => `${WISH_NAMES[l.wish[0]]} ×${l.wish[1]}`);
      html = modalBox(`🎉 升到 Lv${m.levels[m.levels.length - 1]}！`,
        `<div class="fm-note">獎勵：<b>${num(dew)} 星露</b>${wishes.length ? `、<b>${wishes.join("、")}</b>` : ""}</div>
         ${unlocks.length ? `<ul>${unlocks.map(u => `<li>${esc(u)}</li>`).join("")}</ul>` : ""}`,
        `<button type="button" class="fm-btn green" data-act="modalclose">太好了</button>`);
    }

    else if (m.name === "zone") {
      const zone = m.zone;
      const cost = D.zones[zone].cost;
      const desc = {
        菇棚: "放菇木，不用澆水，每隔幾小時採一次，一根菇木採 4 次。",
        果園: "種一次樹苗，明天長大，之後一直結果，不用重種。",
        香草園: "6 格小田，香草 1–3 小時就能收。",
        茶園: "種茶樹，明天長大，之後每 6 小時採一次茶葉。",
        溫室: "6 格，不用澆水，種咖啡、可可、火龍果、香草莢。",
        加工坊: "把小麥、牛奶這些材料做成麵粉、奶油，做更多料理。"
      }[zone] || "";
      html = modalBox(`開墾${zone}`,
        `<p class="fm-note">${desc}</p><p class="fm-note">需要 <b>${num(cost)} 星露</b>（你有 ${num(S.dew)}）</p>`,
        `<button type="button" class="fm-btn green" data-act="confirm" data-v="yes" ${S.dew >= cost ? "" : "disabled"}>開墾</button>${close}`);
    }

    else if (m.name === "expand") {
      const next = fieldNextExpand();
      html = modalBox(`擴建菜田`,
        `<p class="fm-note">從 ${S.field.size}×${S.field.size} 擴建成 <b>${next[1]}×${next[1]}</b>（${next[1] * next[1]} 格），原本種的不會動。</p><p class="fm-note">需要 <b>${num(next[2])} 星露</b>（你有 ${num(S.dew)}）</p>`,
        `<button type="button" class="fm-btn green" data-act="confirm" data-v="yes" ${S.dew >= next[2] ? "" : "disabled"}>擴建</button>${close}`);
    }

    else if (m.name === "kitchenup") {
      const next = kitchenNext();
      const perk = { kitchen: "2 個爐子，可以同時做 2 道菜。", restaurant: "客人每天點 3 道菜，付 1.5 倍價錢。", bistro: "3 個爐子，客人點餐照常。" }[next[1]];
      html = modalBox(`升級成${next[2]}`,
        `<p class="fm-note">${perk}</p><p class="fm-note">需要 <b>${num(next[4])} 星露</b>（你有 ${num(S.dew)}）</p>`,
        `<button type="button" class="fm-btn green" data-act="confirm" data-v="yes" ${S.dew >= next[4] ? "" : "disabled"}>升級</button>${close}`);
    }

    else if (m.name === "tea") {
      const c = D.crops.tea;
      html = modalBox("種茶樹",
        `<p class="fm-note">茶苗 <b>${num(c.seed)} 星露</b>，明天長大，之後每 6 小時採 ${c.qty} 份茶葉。</p>`,
        `<button type="button" class="fm-btn green" data-act="confirm" data-v="yes" ${S.dew >= c.seed ? "" : "disabled"}>種下</button>${close}`);
    }

    else if (m.name === "water") {
      const cap = waterCap();
      const day = todayKey();
      const credited = (S.wcred[day] || []).length;
      html = modalBox("💧 水車",
        `<div class="fm-bar water" style="margin:6px 0 8px"><i style="width:${(S.water / cap.max) * 100}%"></i></div>
         <p class="fm-note">現在 <b>${S.water} / ${cap.max}</b> 滴（${cap.buckets} 桶 × 每桶 ${cap.per} 滴）。</p>
         <p class="fm-note">每完成 <b>1 個習慣</b>，水車就裝 1 桶（${cap.per} 滴）。今天已經裝了 ${credited} 桶。</p>
         <p class="fm-note">菜田和香草園種一格用 1 滴；菇棚、果園、竹林、茶園、溫室不用水。${isRainDay() ? "<b>今天下雨，種什麼都不用水。</b>" : "大約每週會下一次雨。"}</p>`,
        `<button type="button" class="fm-btn blue" data-act="confirm" data-v="habits">去打卡習慣</button>${close}`);
    }

    else if (m.name === "animal") {
      const a = S.ranch.animals.find(x => x.id === m.id);
      if (!a) { closeModal(); return; }
      const info = D.animals[a.sp];
      const st = animalState(a);
      let txt = "";
      if (!a.adult) txt = st === "hungry" ? `寶寶餓了，餵 ${info.feed} 份飼料後 ${hoursText(info.grow)}長大。` : `${hoursText(info.grow)}長大，還要 ${dur(a.t1 - now())}。`;
      else if (st === "hungry") txt = `餓了，餵 ${info.feed} 份飼料，${hoursText(info.every)}後產出${itemName(info.product)}。`;
      else if (st === "ready") txt = `${itemName(info.product)}可以收了！`;
      else txt = `${itemName(info.product)}還要 ${dur(a.t1 - now())}。`;
      const btns = [];
      if (st === "ready") btns.push(`<button type="button" class="fm-btn green" data-act="confirm" data-v="collect">收${esc(itemName(info.product))}</button>`);
      if (st === "hungry") btns.push(`<button type="button" class="fm-btn green" data-act="confirm" data-v="feed" ${have("feed") >= info.feed ? "" : "disabled"}>餵食（飼料 ${have("feed")}）</button>`);
      if (a.adult && info.meat) btns.push(`<button type="button" class="fm-btn red" data-act="confirm" data-v="slaughter">屠宰（${esc(itemName(info.meat[0]))} ×${info.meat[1]}）</button>`);
      html = modalBox(`${esc(a.adult ? info.name : info.baby)}`,
        `<div style="width:120px;height:120px;margin:0 auto">${animalIcon(a.sp, a.adult).replace("<img ", '<img style="width:100%;height:100%;object-fit:contain" ')}</div><p class="fm-note">${txt}</p>`,
        btns.join("") + close);
    }

    else if (m.name === "slaughter") {
      const a = S.ranch.animals.find(x => x.id === m.id);
      if (!a) { closeModal(); return; }
      const info = D.animals[a.sp];
      html = modalBox(`確定要屠宰嗎？`,
        `<p class="fm-note">這隻${esc(info.name)}會變成 <b>${esc(itemName(info.meat[0]))} ×${info.meat[1]}</b>，之後牧場就少一隻。</p>`,
        `<button type="button" class="fm-btn red" data-act="confirm" data-v="yes">確定</button>${close}`);
    }

    else if (m.name === "buyanimal") {
      const info = D.animals[m.sp];
      const btns = [];
      if (info.babyPrice) btns.push(`<button type="button" class="fm-btn green" data-act="confirm" data-v="baby" ${S.dew >= info.babyPrice ? "" : "disabled"}>買${esc(info.baby)} ${num(info.babyPrice)}</button>`);
      if (info.adultPrice) btns.push(`<button type="button" class="fm-btn" data-act="confirm" data-v="adult" ${S.dew >= info.adultPrice ? "" : "disabled"}>買成年${esc(info.name)} ${num(info.adultPrice)}</button>`);
      html = modalBox(`買${esc(info.name)}`,
        `<div style="display:flex;justify-content:center;gap:10px;height:96px">${info.babyPrice ? `<div style="width:90px">${animalIcon(m.sp, false).replace("<img ", '<img style="width:100%;height:100%;object-fit:contain" ')}</div>` : ""}<div style="width:96px">${animalIcon(m.sp, true).replace("<img ", '<img style="width:100%;height:100%;object-fit:contain" ')}</div></div>
         <p class="fm-note">${info.babyPrice ? `寶寶要餵飼料，${hoursText(info.grow)}長大。` : ""}成年的${info.feed ? `每次吃 ${info.feed} 份飼料，` : ""}每 ${hoursText(info.every)}產出${esc(itemName(info.product))}。</p><p class="fm-note">你有 ${num(S.dew)} 星露</p>`,
        btns.join("") + close);
    }

    else if (m.name === "confirmremove") {
      html = modalBox("確定要移走嗎？", `<p class="fm-note">移走之後要重新買樹苗。</p>`,
        `<button type="button" class="fm-btn red" data-act="confirm" data-v="yes">移走</button>${close}`);
    }

    else if (m.name === "setup") {
      html = modalBox("把存檔放上雲端",
        `<p class="fm-note" style="text-align:left">現在星露島的進度只存在這台裝置的瀏覽器。到 Supabase 的 SQL Editor 執行網站裡的 <b>sql/2026-10-16_星露島.sql</b>（或重新執行一次 <b>sql/完整設定.sql</b>），重新整理網頁後，進度會自動搬上去，換裝置也看得到，星願瓶也能開。</p>`,
        close);
    }

    el.innerHTML = html;
    el.hidden = false;

  }

  function confirmModal(m, v) {

    if (m.name === "zone") {
      const zone = m.zone;
      const key = ZONE_KEY[zone];
      if (!spend(D.zones[zone].cost)) return;
      S[key].open = true;
      closeModal();
      toast(`🎉 ${zone}開墾好了`);
      return after(true);
    }

    if (m.name === "expand") {
      const next = fieldNextExpand();
      if (!next || !spend(next[2])) return;
      S.field.size = next[1];
      closeModal();
      toast(`🎉 菜田變成 ${next[1]}×${next[1]} 了`);
      return after(true);
    }

    if (m.name === "kitchenup") {
      const next = kitchenNext();
      if (!next || !spend(next[4])) return;
      S.kitchen.tier += 1;
      if (next[1] === "restaurant" || next[1] === "bistro") S.orders = makeOrders(todayKey());
      closeModal();
      toast(`🎉 升級成${next[2]}了`);
      return after(true);
    }

    if (m.name === "tea") {
      const res = plantTea(m.slot);
      closeModal();
      if (res !== "ok") return toast(res);
      toast("🍵 種下茶苗");
      return after();
    }

    if (m.name === "water" && v === "habits") {
      closeModal();
      if (typeof showPage === "function") showPage("today");
      setTimeout(() => {
        const card = document.getElementById("habits-card");
        if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
      return;
    }

    if (m.name === "animal") {
      const a = S.ranch.animals.find(x => x.id === m.id);
      if (!a) return closeModal();
      if (v === "collect") {
        const res = collectAnimal(a);
        if (!res) return toast("倉庫滿了");
        toast(`🧺 +1 ${itemName(res.item)}，+${res.exp} EXP`);
      } else if (v === "feed") {
        if (!feedAnimal(a)) return toast("飼料不夠");
        toast("🌾 餵好了");
      } else if (v === "slaughter") {
        return openModal("slaughter", { id: a.id });
      }
      closeModal();
      return after();
    }

    if (m.name === "slaughter") {
      const a = S.ranch.animals.find(x => x.id === m.id);
      if (!a) return closeModal();
      const res = slaughter(a);
      if (!res) return toast("倉庫放不下");
      closeModal();
      toast(`🥩 拿到 ${itemName(res.item)} ×${res.qty}`);
      return after(true);
    }

    if (m.name === "buyanimal") {
      const res = buyAnimal(m.sp, v === "adult");
      if (res !== "ok") return toast(res);
      closeModal();
      toast(`🎉 買了${v === "adult" ? D.animals[m.sp].name : D.animals[m.sp].baby}`);
      return after(true);
    }

    if (m.name === "confirmremove") {
      if (m.kind === "tree") delete S.orchard.trees[m.key];
      if (m.kind === "tea") delete S.tea.bushes[m.key];
      closeModal();
      closePop();
      return after();
    }

  }

  function checkLevelPopup() {
    if (!S || S.lv <= S.seenLv) return;
    const levels = [];
    for (let lv = S.seenLv + 1; lv <= S.lv; lv++) levels.push(lv);
    S.seenLv = S.lv;
    saveSoon(true);
    openModal("levelup", { levels });
  }


  /* =========================================================
     22. 開星願瓶
  ========================================================= */

  let wishBusy = false;

  async function openWish(kind) {

    if (wishBusy) return;
    if ((net.wish[kind] || 0) <= 0) return toast("沒有這種星願瓶");
    if (net.mode !== "server") return toast("資料庫設定好之後才能開");

    wishBusy = true;

    /* 先把進度存好，免得抽到的東西沒存到 */
    if (net.dirty) await saveNow();

    try {
      const { data, error } = await db.rpc("farm_open_wish", { p_item: kind });
      if (error) throw error;
      net.wish[kind] = data.left;
      if (typeof gameCheckinState !== "undefined" && gameCheckinState.items) gameCheckinState.items[kind] = data.left;
      UI.wishResult = wishReward(kind, Number(data.roll));
      saveSoon(true);
      renderAll();
    } catch (error) {
      console.error("開星願瓶失敗：", error);
      toast("開星願瓶失敗：" + (error.message || error));
    }

    wishBusy = false;

  }


  /* =========================================================
     23. 提示、飄字、每秒更新
  ========================================================= */

  function toast(msg) {
    const el = UI.root && UI.root.querySelector("#fm-toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(UI.toastTimer);
    UI.toastTimer = setTimeout(() => el.classList.remove("on"), 2400);
  }

  function floatAt(target, html) {
    const layer = UI.root.querySelector("#fm-floats");
    if (!layer || !target) return;
    const rr = UI.root.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const f = document.createElement("div");
    f.className = "fm-float ol";
    f.innerHTML = html;
    f.style.left = (tr.left + tr.width / 2 - rr.left) + "px";
    f.style.top = (tr.top - rr.top - 10) + "px";
    layer.appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }

  function tick() {

    if (!S || !UI.root || !isFarmVisible()) return;

    if (processTimers()) {
      saveSoon();
      renderAll();
      return;
    }

    if (now() >= UI.nextEventAt) {
      renderAll();
      return;
    }

    UI.root.querySelectorAll("[data-until]").forEach(el => {
      el.textContent = dur(Number(el.dataset.until) - now());
    });

  }

  function isFarmVisible() {
    const page = document.querySelector('.page[data-page="farm"]');
    return !!(page && page.classList.contains("active") && !document.hidden);
  }


  /* =========================================================
     24. 接上網站：遊戲模式、分頁、習慣打卡
  ========================================================= */

  function gameOn() {
    if (typeof gameIsOn === "function") return gameIsOn();
    return typeof gameMode !== "undefined" && gameMode === true;
  }

  async function startFarm() {

    if (!uid()) return;

    const page = ensurePage();
    if (!page) return;

    if (net.loaded && net.userId === uid()) {
      onShow();
      return;
    }

    if (net.loading) return;

    try {
      await loadSave();
      await loadWishCounts();
    } catch (error) {
      console.error("星露島載入失敗：", error);
      const root = document.getElementById("fm-root");
      if (root) root.innerHTML = `<div class="fm-loading">星露島載入失敗：${esc(error.message || error)}<br>請重新整理</div>`;
      net.loading = false;
      return;
    }

    buildRoot();
    renderAll();
    checkLevelPopup();
    creditHabitWater(false);

    /* 之前升級但還沒領到的星願瓶（例如資料庫晚設定），存檔後補發 */
    if (net.mode === "server" && S.lv >= 5) pendingLevelClaim = true;

    if (net.dirty) saveSoon(true);
    else afterSave();

    if (!UI.tick) UI.tick = setInterval(tick, 1000);

  }

  function onShow() {
    if (!S || !UI.root) return;
    layoutMap(false);
    processTimers();
    renderAll();
    creditHabitWater(true);
    loadWishCounts().then(renderHud);
  }

  function syncVisibility() {

    const on = gameOn() && !!uid();
    const btn = document.querySelector('.tab-btn[data-page="farm"]');
    const page = document.querySelector('.page[data-page="farm"]');

    if (btn) btn.hidden = !on;
    if (page) page.classList.toggle("fm-on", on);

    if (on) startFarm();

  }

  /* 遊戲模式開關一變就更新（載入、切換時都會呼叫 renderGameModeToggle） */
  if (typeof window.renderGameModeToggle === "function") {
    const baseToggle = window.renderGameModeToggle;
    window.renderGameModeToggle = function () {
      const result = baseToggle.apply(this, arguments);
      try { ensurePage(); syncVisibility(); } catch (e) { console.warn(e); }
      return result;
    };
  }

  /* 切到星露島分頁時 */
  if (typeof window.applyPage === "function") {
    const baseApply = window.applyPage;
    window.applyPage = function (name) {
      const result = baseApply.apply(this, arguments);
      const onFarm = name === "farm" && (typeof PAGES === "undefined" || PAGES.includes("farm"));
      document.body.classList.toggle("fm-page", onFarm);
      if (onFarm) setTimeout(() => { if (gameOn()) { startFarm(); onShow(); } }, 0);
      return result;
    };
  }

  /* 打卡習慣 → 水車裝水 */
  if (typeof window.setHabitLog === "function") {
    const baseHabit = window.setHabitLog;
    window.setHabitLog = async function (habitId, dateText, done) {
      const result = await baseHabit.apply(this, arguments);
      if (result && done && S && gameOn() && dateText === todayKey()) {
        const got = await creditHabitWater(false);
        if (typeof showToast === "function" && got && (got.buckets || got.wasted)) {
          const cap = waterCap();
          setTimeout(() => showToast(got.buckets
            ? `💧 星露島水車 +${got.buckets} 桶（${S.water}/${cap.max}）`
            : "💧 星露島的水車已經滿了"), 2700);
        }
      }
      return result;
    };
  }

  /* 登出 → 清掉 */
  if (typeof window.logout === "function") {
    const baseLogout = window.logout;
    window.logout = async function () {
      try { if (net.dirty) await saveNow(); } catch (e) { /* 沒關係 */ }
      S = null;
      net.loaded = false;
      net.userId = null;
      UI.root = null;
      UI.sheet = null;
      UI.modal = null;
      const page = document.querySelector('.page[data-page="farm"]');
      if (page) page.innerHTML = "";
      return baseLogout.apply(this, arguments);
    };
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (net.dirty) saveNow();
    } else if (isFarmVisible()) {
      onShow();
    }
  });

  window.addEventListener("pagehide", () => {
    if (net.dirty && S) {
      S.saved = now();
      storeSet(localKey(), JSON.stringify({ state: S }));
    }
  });

  /* 網頁打開時：分頁、遊戲模式狀態可能已經好了 */
  function boot() {
    ensurePage();
    if (location.hash === "#farm" && typeof window.applyPage === "function") window.applyPage("farm");
    syncVisibility();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  /* 開發／測試用 */
  window.FarmGame = {
    version: FARM_JS_VERSION,
    get state() { return S; },
    get net() { return net; },
    start: startFarm,
    render: renderAll,
    save: saveNow,
    addExp: n => { addExp(n); after(true); },
    addDew: n => { addDew(n); after(); },
    give: (k, n) => { addItem(k, n); after(); },
    reset: () => { S = newState(); net.dirty = true; after(true); },
    skip: hours => {
      const shift = hours * HOUR;
      const walk = obj => {
        if (!obj || typeof obj !== "object") return;
        for (const key of Object.keys(obj)) {
          const v = obj[key];
          if (typeof v === "number" && ["t0", "t1", "grown", "next", "last"].includes(key)) obj[key] = v - shift;
          else if (typeof v === "object") walk(v);
        }
      };
      walk(S.field); walk(S.herb); walk(S.green); walk(S.orchard); walk(S.logs); walk(S.tea); walk(S.bamboo);
      walk(S.kitchen); walk(S.mach); walk(S.ranch.animals); walk(S.ranch.inc);
      for (const k of Object.keys(S.ranch.breed)) S.ranch.breed[k] -= shift;
      after();
    }
  };

})();
