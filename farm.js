/* =========================================================
   🏝️ 序光計畫：星露島（生活線農場）
   只在主頁「遊戲模式：開」的時候出現（導覽列多一個「星露島」分頁）。

   需要先載入：script.js（db、currentUser、getToday、shiftDate…）、
   game.js（遊戲模式開關）、farm-data.js（作物、動物、料理、等級資料）。

   存檔：Supabase 的 farm_saves（sql/2026-10-16_星露島.sql）。
   資料庫還沒設定時先存在這台裝置的瀏覽器，設定好之後會自動搬上去。
========================================================= */

const FARM_JS_VERSION = "2026-10-20 v5";

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
  const BLD = Object.assign({
    hut: [520, 483], kitchen: [520, 447], restaurant: [516, 520], bistro: [520, 400],
    waterwheel: [520, 435], barn: [520, 409], ranchgate: [520, 386], market: [520, 413], pier: [520, 337]
  }, D.bld || {});

  /* 五個品階：凡（綠）普（藍）珍（紫）華（金）仙（紅） */
  const TIERS = ["c", "r", "l", "x", "s"];
  const RARITY_NAME = { c: "凡品", r: "普品", l: "珍品", x: "華品", s: "仙品" };
  const RARITY_BADGE = { c: "rarity_common", r: "rarity_uncommon", l: "rarity_rare", x: "rarity_epic", s: "rarity_legendary" };

  /* 介面小圖示（img/ui/） */
  const UI_IMG = "img/ui/";
  function uiIcon(k, cls = "") {
    return `<img class="fm-ui ${cls}" src="${UI_IMG}${k}.webp" alt="">`;
  }

  /* 動物住處的圖 */
  const HOUSE_IMG = {
    chicken: "coop", turkey: "coop", goldhen: "coop", cow: "cowshed", pig: "pigsty",
    duck: "duckpond", goose: "duckpond", bee: "beehive",
    sheep: "sheeppen", goat: "sheeppen", blacksheep: "sheeppen", cloudsheep: "sheeppen",
    rabbit: "rabbithutch", moonrabbit: "rabbithutch", ostrich: "ostrichpen",
    alpaca: "alpacaranch", rainbowalpaca: "alpacaranch", deer: "starforest"
  };
  function houseIcon(sp, cls = "") {
    const k = HOUSE_IMG[sp];
    if (!k || !BLD[k]) return `<span class="fm-emo ${cls}">${(D.animals[sp] && D.animals[sp].emoji) || "🏠"}</span>`;
    return `<img class="fm-house ${cls}" src="${IMG}bld/${k}.webp" alt="">`;
  }


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
    if (h % 1) return `${Math.floor(h)} 小時 ${Math.round((h % 1) * 60)} 分`;
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

  /* 文字旁邊的小圖（沒有圖就用表情符號） */
  function miniIcon(key, emoji) {
    const src = itemSrc(key);
    return src ? `<img class="fm-mini" src="${src}" alt="" draggable="false">` : emoji;
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

  /* 顏色看品階：料理看用到的食材裡最高的品階 */
  function rarityClass(key) {
    const it = D.items[key];
    if (it && it.tier) return "r-" + it.tier;
    const c = D.crops[key];
    if (c) return "r-" + c.rarity;
    return "r-c";
  }

  /* 等級（c/r/l/x/s）：給分類、排序用 */
  function tierOfKey(key) {
    const it = D.items[key];
    if (it && it.tier) return it.tier;
    const c = D.crops[key];
    if (c && c.rarity) return c.rarity;
    return "c";
  }

  /* 依等級分組：每組前面放一個標題，列表和格子都能用 */
  function tierGroups(list) {
    let out = "";
    for (const t of TIERS) {
      const part = list.filter(e => e.t === t);
      if (!part.length) continue;
      out += `<div class="fm-sec ol" style="grid-column:1/-1">${RARITY_NAME[t]}</div>`;
      out += part.map(e => e.h).join("");
    }
    return out;
  }


  /* =========================================================
     2. 規則：等級、容量
  ========================================================= */

  let S = null;            // 存檔（整個農場的狀態）

  const lvNeed = lv => (D.levels[lv - 1] && D.levels[lv - 1].need) || 0;

  /* 星願池拿到的收藏（夥伴、工具、造型、稱號、家具數量…）：以資料庫為準，存檔裡留一份備用 */
  function own(key) {
    const o = (net.ws && net.ws.owned) || (S && S.ownedCache) || {};
    return Number(o[key] || 0);
  }

  function waterCap(lv = S.lv) {
    const row = capRow(D.caps.water, lv);
    const buckets = row[1] + (own("p_starspirit") ? 2 : 0);
    return { buckets, per: row[2], max: buckets * row[2] };
  }

  function fieldMaxSize(lv = S.lv) {
    return capRow(D.caps.field, lv)[1];
  }

  function fieldNextExpand() {
    return D.caps.field.find(r => r[1] === S.field.size + 1) || null;
  }

  function storageCap(lv = S.lv) {
    const base = capRow(D.caps.storage, lv)[1];
    if (base > 9999) return base;
    return base + (own("tool_bigbasket") ? 50 : 0) + (own("s_harvestbarn") ? 200 : 0);
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

  function dayNum(dateText) {
    return Math.floor(Date.parse(dateText + "T00:00:00Z") / 86400000);
  }

  /* 下雨：大約每週一次；用了雨雲的那天；有小白龍每 3 天一次 */
  function isRainDay(dateText = todayKey()) {
    if (S && S.rainDay === dateText) return true;
    if (own("p_dragon") && dayNum(dateText) % 3 === 0) return true;
    return hash(dateText + ":rain") % 7 === 0;
  }

  /* 月亮幾天大（0 新月、約 14.8 滿月） */
  function moonAge(dateText = todayKey()) {
    const days = (Date.parse(dateText + "T12:00:00Z") - Date.parse("2000-01-06T18:14:00Z")) / 86400000;
    return ((days % 29.530589) + 29.530589) % 29.530589;
  }

  function isFullMoon(dateText = todayKey()) {
    return Math.abs(moonAge(dateText) - 14.77) < 1.0;
  }

  function machineMinutes(rec) {
    if (D.machines[rec.machine]?.fixed) return rec.minutes;
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
      pond: { plots: {} },
      ranch: {
        next: 3,
        animals: [
          { id: 1, sp: "chicken", adult: true, fed: false, t1: null },
          { id: 2, sp: "chicken", adult: true, fed: false, t1: null }
        ],
        breed: {},
        inc: []
      },
      known: { crops: {}, dishes: {}, recipes: {}, animals: { chicken: 1 }, items: {} },
      goals: null,
      orders: null,
      ord: null,
      day: null,
      wcred: {},
      drip: now(),
      seenLv: 1,
      title: null,
      stats: { harvest: 0, cook: 0, plant: 0 },
      /* 星願池 */
      deco: { slots: [] },          // 島上每個擺放位置放了哪個家具
      skins: {},                    // 每一組造型現在用哪一個
      titleKey: null,               // 現在掛的稱號
      pages: 0,                     // 食譜殘頁
      boost: { x2: 0 },             // 豐收券：下幾次收成 ×2
      rainDay: null,                // 用雨雲的那天
      wpart: 0,                     // 銅澆水壺：上一滴水還能再澆一格
      daily: { day: null, done: {} },
      glassDay: null,               // 時光沙漏今天用過了沒
      wishApplied: [],              // 已經放進島上的抽獎紀錄（避免重複）
      ownedCache: {},
      subjLv: {},                   // 各科等級（累積系統），升級送星露用
      fish: { rod: "bamboo", rods: { bamboo: 1 }, caught: {}, total: 0 }   // 釣魚
    };

  }

  function waterCapFor(lv) {
    const row = capRow(D.caps.water, lv);
    return { max: row[1] * row[2] };
  }

  /* 生長／產出時間改短之後，舊存檔裡還在等的計時不能比新規則久 */
  function clampTimers() {

    const t = now();
    let changed = false;
    const cap = (obj, key, limit) => {
      if (obj && obj[key] && obj[key] > limit) { obj[key] = limit; changed = true; }
    };

    for (const zone of ["field", "herb", "green", "pond"]) {
      for (const p of Object.values(S[zone].plots || {})) {
        if (p && p.c && p.t1 && p.t0 && D.crops[p.c]) cap(p, "t1", p.t0 + D.crops[p.c].hours * HOUR);
      }
    }
    for (const tr of Object.values(S.orchard.trees || {})) {
      if (tr && D.crops[tr.c]) cap(tr, "next", Math.max(t, tr.grown) + D.crops[tr.c].hours * HOUR);
    }
    for (const l of Object.values(S.logs.slots || {})) {
      if (l && D.crops[l.c]) cap(l, "next", t + D.crops[l.c].hours * HOUR);
    }
    for (const b of Object.values(S.tea.bushes || {})) {
      if (b) cap(b, "next", Math.max(t, b.grown) + D.crops.tea.hours * HOUR);
    }
    for (const a of S.ranch.animals || []) {
      const info = D.animals[a.sp];
      if (info && a.t1) cap(a, "t1", t + (a.adult ? info.every : info.grow) * HOUR);
    }
    for (const sp of Object.keys(S.ranch.breed || {})) {
      const info = D.animals[sp];
      if (info && info.breedHours) cap(S.ranch.breed, sp, t + info.breedHours * HOUR);
    }
    for (const slot of S.ranch.inc || []) {
      const sp = EGG_SPECIES[slot.egg];
      if (sp) cap(slot, "t1", t + D.animals[sp].hatchHours * HOUR);
    }

    return changed;

  }

  /* 舊存檔缺的欄位補上 */
  function fixState(st) {

    const base = newState();

    for (const key of Object.keys(base)) {
      if (st[key] === undefined) st[key] = base[key];
    }

    for (const key of ["field", "herb", "green", "pond", "orchard", "logs", "tea", "bamboo", "workshop", "kitchen", "ranch", "known", "stats", "deco", "boost", "daily", "fish"]) {
      if (!st[key] || typeof st[key] !== "object") st[key] = base[key];
      for (const sub of Object.keys(base[key])) {
        if (st[key][sub] === undefined) st[key][sub] = base[key][sub];
      }
    }

    if (!st.inv || typeof st.inv !== "object") st.inv = {};
    if (!Array.isArray(st.kitchen.jobs)) st.kitchen.jobs = [];
    if (!Array.isArray(st.ranch.animals)) st.ranch.animals = [];
    if (!Array.isArray(st.ranch.inc)) st.ranch.inc = [];
    if (!Array.isArray(st.deco.slots)) st.deco.slots = [];
    if (!Array.isArray(st.wishApplied)) st.wishApplied = [];
    if (!st.skins || typeof st.skins !== "object") st.skins = {};
    if (!st.subjLv || typeof st.subjLv !== "object") st.subjLv = {};

    st.lv = Math.min(50, Math.max(1, st.lv | 0));

    return st;

  }


  /* =========================================================
     4. 倉庫
  ========================================================= */

  /* 肥料、種子、水桶這類道具不佔倉庫 */
  const NOT_STORED = key => key === "fert" || key === "feed" || key === "bait" || key.startsWith("seed_") || D.items[key]?.kind === "use";

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
    if (room > 0) {
      S.inv[key] = have(key) + room;
      S.known.items[key] = 1;
    }
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
    if (n > 0) { if (!S.stats) S.stats = {}; S.stats.dewEarned = (S.stats.dewEarned || 0) + Math.round(n); }
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

  /* =========================================================
     成就：達成送星屑（資料庫 farm_achieve_*，網站上的數字由資料庫自己數）
  ========================================================= */

  /* key, 名稱, 說明, 星屑, 看哪個數字, 門檻 */
  const ACH = [
    ["plant1", "第一顆種子", "第一次種下作物", 5, "plant", 1],
    ["harvest1", "第一次收成", "收成 1 次", 5, "harvest", 1],
    ["cook1", "小小廚師", "做出第一道料理", 5, "cook", 1],
    ["feed1", "動物的朋友", "第一次餵動物", 5, "feed", 1],
    ["animal1", "第一顆蛋", "第一次收畜產品", 5, "animal", 1],
    ["sell1", "第一筆生意", "第一次在市集賣東西", 5, "sell", 1],
    ["process1", "加工入門", "第一次用加工機器", 10, "process", 1],
    ["habit1", "好的開始", "第一次習慣打卡", 5, "s:habit", 1],
    ["task1", "完成一件事", "第一次完成任務", 5, "s:task", 1],
    ["lv5", "小島成長中", "島嶼升到 Lv5", 10, "lv", 5],
    ["harvest50", "勤勞的農夫", "收成 50 次", 15, "harvest", 50],
    ["plant100", "播種達人", "種下 100 次", 20, "plant", 100],
    ["cook10", "家常菜", "做 10 道料理", 15, "cook", 10],
    ["feed50", "飼養員", "餵動物 50 次", 20, "feed", 50],
    ["sell100", "市集常客", "在市集賣出 100 個東西", 20, "sell", 100],
    ["lv10", "像樣的小島", "島嶼升到 Lv10", 20, "lv", 10],
    ["field5", "開墾", "菜田擴建到 5×5", 20, "field", 5],
    ["zones3", "小島探索", "開啟 3 個區域（菇棚、果園、香草園、茶園、溫室、加工坊）", 20, "zones", 3],
    ["crops20", "作物圖鑑 I", "收成過 20 種作物", 20, "crops", 20],
    ["deco5", "布置小島", "島上擺 5 件家具", 20, "deco", 5],
    ["pet1", "第一個夥伴", "從星願池帶回一個夥伴", 20, "pet", 1],
    ["wish10", "許願的人", "抽星願瓶 10 次", 20, "s:wish", 10],
    ["focus1h", "專注一小時", "專注累計 1 小時", 10, "s:focus", 60],
    ["checkin7", "一週簽到", "簽到累計 7 天", 15, "s:checkin", 7],
    ["harvest200", "豐收", "收成 200 次", 30, "harvest", 200],
    ["process30", "加工坊老闆", "加工 30 次", 30, "process", 30],
    ["dishes20", "食譜收藏家", "做過 20 種料理", 30, "dishes", 20],
    ["animals5", "小牧場", "養過 5 種動物", 30, "animals", 5],
    ["habit50", "習慣養成", "習慣打卡 50 次", 30, "s:habit", 50],
    ["task50", "行動派", "完成 50 個任務", 30, "s:task", 50],
    ["morning30", "早起的人", "晨間打卡 30 天", 40, "s:morning", 30],
    ["cook50", "拿手好菜", "做 50 道料理", 40, "cook", 50],
    ["animal100", "牧場豐收", "收畜產品 100 次", 40, "animal", 100],
    ["lv20", "熱鬧的小島", "島嶼升到 Lv20", 40, "lv", 20],
    ["dew10000", "小富翁", "累計賺到 10,000 星露", 40, "dew", 10000],
    ["focus10h", "專注十小時", "專注累計 10 小時", 40, "s:focus", 600],
    ["checkin30", "一個月的堅持", "簽到累計 30 天", 50, "s:checkin", 30],
    ["crops50", "作物圖鑑 II", "收成過 50 種作物", 60, "crops", 50],
    ["zones6", "全島開放", "6 個區域全部開啟", 80, "zones", 6],
    ["lv30", "繁榮的小島", "島嶼升到 Lv30", 80, "lv", 30],
    ["wish100", "星願收藏家", "抽星願瓶 100 次", 80, "s:wish", 100],
    ["harvest1000", "千次豐收", "收成 1,000 次", 100, "harvest", 1000],
    ["field8", "大農場", "菜田擴建到 8×8", 100, "field", 8],
    ["habit300", "習慣大師", "習慣打卡 300 次", 100, "s:habit", 300],
    ["task300", "實踐家", "完成 300 個任務", 100, "s:task", 300],
    ["cook200", "星露名廚", "做 200 道料理", 120, "cook", 200],
    ["lv40", "傳說中的小島", "島嶼升到 Lv40", 120, "lv", 40],
    ["focus100h", "心流", "專注累計 100 小時", 150, "s:focus", 6000],
    ["checkin100", "百日", "簽到累計 100 天", 150, "s:checkin", 100],
    ["lv50", "星露島主", "島嶼升到 Lv50", 300, "lv", 50],
    ["fish1", "第一條魚", "第一次釣到魚", 5, "fish", 1],
    ["fishdex5", "魚類圖鑑 I", "釣過 5 種魚", 20, "fishdex", 5],
    ["fish50", "釣魚愛好者", "釣魚 50 次", 30, "fish", 50],
    ["fishlegend", "傳說的影子", "釣到一條傳說魚", 50, "fishlegend", 1],
    ["fish300", "老漁夫", "釣魚 300 次", 100, "fish", 300],
    ["fishdexall", "魚類圖鑑 全", "50 種魚全部釣過", 100, "fishdex", 50]
  ];

  function statOf(k) {
    const st = S.stats || {};
    return Math.max(st[k] || 0, st["g_" + k] || 0);
  }

  function achValue(kind) {
    if (kind.startsWith("s:")) return Number(net.ach.counts[kind.slice(2)] || 0);
    switch (kind) {
      case "lv": return S.lv;
      case "field": return S.field.size;
      case "zones": return ["logs", "orchard", "herb", "tea", "green", "workshop"].filter(z => S[z] && S[z].open).length;
      case "crops": return Object.values(S.known.crops || {}).filter(Boolean).length;
      case "dishes": return Object.values(S.known.dishes || {}).filter(Boolean).length;
      case "animals": return Object.values(S.known.animals || {}).filter(Boolean).length;
      case "deco": return (S.deco && S.deco.slots || []).filter(Boolean).length;
      case "pet": return Object.keys(D.pets || {}).filter(k => own("p_" + k)).length;
      case "dew": return (S.stats && S.stats.dewEarned) || 0;
      case "fish": return (S.fish && S.fish.total) || 0;
      case "fishdex": return Object.keys((S.fish && S.fish.caught) || {}).filter(k => D.fish[k]).length;
      case "fishlegend": return Object.keys((S.fish && S.fish.caught) || {}).filter(k => D.fish[k] && D.fish[k].tier === "s").length;
      default: return statOf(kind);
    }
  }

  function achState(a) {
    const [k, , , , kind, n] = a;
    const cur = achValue(kind);
    const claimed = net.ach.claimed.has(k);
    return { cur: Math.min(cur, n), n, done: cur >= n, claimed };
  }

  function achClaimable() {
    if (!net.ach.ready) return 0;
    return ACH.filter(a => { const st = achState(a); return st.done && !st.claimed; }).length;
  }

  async function loadAchStatus() {
    if (net.mode !== "server") return;
    try {
      const { data, error } = await db.rpc("farm_achieve_status");
      if (error) throw error;
      net.ach.ready = true;
      net.ach.claimed = new Set(data.claimed || []);
      net.ach.counts = data.counts || {};
    } catch (error) {
      net.ach.ready = false;
      if (!isMissingTable(error) && !/farm_achieve/.test(String(error.message || ""))) console.warn("成就狀態載入失敗：", error);
    }
  }

  let achBusy = false;

  async function claimAch(keys) {
    if (net.mode !== "server" || !net.ach.ready) return toast("成就還沒設定好：要先在 Supabase 執行成就的 SQL");
    if (achBusy) return;
    achBusy = true;
    let total = 0;
    const names = [];
    try {
      for (const k of keys) {
        const { data, error } = await db.rpc("farm_achieve_claim", { p_key: k });
        if (error) throw error;
        if (data && data.ok) {
          net.ach.claimed.add(k);
          total += data.dust;
          names.push(ACH.find(a => a[0] === k)[1]);
        } else if (data && data.reason === "claimed") {
          net.ach.claimed.add(k);
        }
      }
    } catch (error) {
      console.warn("領成就失敗：", error);
      toast("領取失敗，等一下再試");
    } finally {
      achBusy = false;
    }
    if (total) toast(`🏆 ${names.length > 2 ? `${names.length} 個成就` : names.join("、")}：星屑 +${total}`);
    await loadWishStatus();
    renderAll();
    if (UI.sheet) renderSheet();
  }

  const GOAL_TYPES = [
    { k: "harvest", name: "收成作物", icon: "🌾", ui: "harvest", lv: 1, n: lv => 5 + Math.floor(lv / 4) },
    { k: "plant", name: "種下作物", icon: "🌱", ui: "plant", lv: 1, n: lv => 6 + Math.floor(lv / 4) },
    { k: "animal", name: "收畜產品", icon: "🥚", ui: "nest", lv: 1, n: lv => 3 + Math.floor(lv / 10) },
    { k: "feed", name: "餵動物", icon: "🐔", ui: "feedbowl", lv: 1, n: lv => 2 + Math.floor(lv / 10) },
    { k: "cook", name: "做料理", icon: "🍳", ui: "cook", lv: 1, n: lv => 1 + Math.floor(lv / 15) },
    { k: "sell", name: "在市集賣東西", icon: "🪙", lv: 3, n: () => 3 },
    { k: "process", name: "加工", icon: "⚙️", ui: "process", lv: 10, n: () => 2 }
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
    /* 成就用的累計次數 */
    if (!S.stats) S.stats = {};
    S.stats["g_" + k] = (S.stats["g_" + k] || 0) + amount;
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

    /* 每天開始補滿水車（習慣打卡多出來的水會保留） */
    if (!firstEver) {
      const cap = waterCap();
      S.water = Math.max(S.water, cap.max);
    }

    /* Lv45：水車每天自己送 1 桶；星靈再送 1 桶 */
    if (!firstEver && S.lv >= D.caps.dailyBucket) {
      const cap = waterCap();
      S.water = Math.min(cap.max, S.water + cap.per);
    }
    if (!firstEver && own("p_starspirit")) {
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
    if (zone === "pond") return { store: S.pond.plots, keys: ["0", "1", "2"], cropZone: "蓮池", water: false, name: "蓮池" };
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

  /* 星願池作物：第一次抽到就永久解鎖，之後可以用星露買種子 */
  function cropUnlocked(k) {
    const c = D.crops[k];
    if (!c) return false;
    if (c.lv > 0) return S.lv >= c.lv;
    return !!(own("c_" + k) || own("tree_" + k));
  }

  function cropAvailable(k) {
    const c = D.crops[k];
    if (c.lv === 0) return have("seed_" + k) > 0 || cropUnlocked(k);
    return S.lv >= c.lv;
  }

  function seedCost(k) {
    const c = D.crops[k];
    if (c.lv === 0) {
      if (have("seed_" + k) > 0) return 0;
      return cropUnlocked(k) ? (c.seed || 0) : Infinity;
    }
    return c.seed || 0;
  }

  /* 水：銅澆水壺讓 1 滴澆 2 格 */
  function hasWater() {
    return S.water > 0 || (own("tool_copperwater") && S.wpart > 0);
  }

  function useWater() {
    if (own("tool_copperwater") && S.wpart > 0) {
      S.wpart = 0;
      return true;
    }
    if (S.water <= 0) return false;
    S.water -= 1;
    if (own("tool_copperwater")) S.wpart = 1;
    return true;
  }

  /* 收成數量：小狐狸 10% 多 1 個、豐收券 ×2 */
  function harvestQty(base) {
    let qty = base, fox = false, x2 = false;
    if (own("p_fox") && Math.random() < 0.1) { qty += 1; fox = true; }
    if (S.boost.x2 > 0) { S.boost.x2 -= 1; qty *= 2; x2 = true; }
    return { qty, fox, x2 };
  }

  /* 種一格：回傳 "ok" / "thirsty"（種下但沒水） / 錯誤訊息 */
  function plantOne(zone, key, crop) {

    const z = plotZone(zone);
    const c = D.crops[crop];

    if (!c || c.zone !== z.cropZone) return "這裡不能種這個";
    if (!cropAvailable(crop)) return "還沒解鎖";
    if (z.store[key]) return "這格已經有東西了";

    if (c.lv === 0 && have("seed_" + crop) > 0) {
      takeItem("seed_" + crop, 1);
    } else {
      const cost = seedCost(crop);
      if (!isFinite(cost)) return "種子不夠";
      if (S.dew < cost) return "星露不夠";
      addDew(-cost);
    }

    const p = { c: crop, t0: now(), t1: null, f: false };

    if (!needsWater(zone, key)) {
      p.t1 = now() + c.hours * HOUR;
    } else if (useWater()) {
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
    if (needsWater(zone, key) && !useWater()) return false;
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

    const h = harvestQty(c.qty);
    addItem(p.c, h.qty);
    addExp(c.exp * h.qty);

    S.known.crops[p.c] = (S.known.crops[p.c] || 0) + h.qty;
    S.stats.harvest = (S.stats.harvest || 0) + 1;
    goalAdd("harvest");

    let seedBack = false;
    if (c.lv === 0 && Math.random() < 0.3) {
      addItem("seed_" + p.c, 1);
      seedBack = true;
    }

    delete z.store[key];

    return { crop: p.c, qty: h.qty, exp: c.exp * h.qty, seedBack, fox: h.fox, x2: h.x2 };

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
    if (c.lv === 0 && have("seed_" + crop) > 0) takeItem("seed_" + crop, 1);
    else if (!spend(seedCost(crop))) return "星露不夠";
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
    const h = harvestQty(c.qty);
    addItem(t.c, h.qty);
    addExp(c.exp * h.qty);
    S.known.crops[t.c] = (S.known.crops[t.c] || 0) + h.qty;
    goalAdd("harvest");
    t.next = now() + c.hours * HOUR;
    return { crop: t.c, qty: h.qty, exp: c.exp * h.qty };
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
    const h = harvestQty(c.qty);
    addItem(l.c, h.qty);
    addExp(c.exp * h.qty);
    S.known.crops[l.c] = (S.known.crops[l.c] || 0) + h.qty;
    goalAdd("harvest");
    l.left -= 1;
    const crop = l.c;
    if (l.left <= 0) delete S.logs.slots[slot];
    else l.next = now() + c.hours * HOUR;
    return { crop, qty: h.qty, exp: c.exp * h.qty, used: l.left <= 0 };
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
    const h = harvestQty(c.qty);
    addItem("tea", h.qty);
    addExp(c.exp * h.qty);
    S.known.crops.tea = (S.known.crops.tea || 0) + h.qty;
    goalAdd("harvest");
    b.next = now() + c.hours * HOUR;
    return { crop: "tea", qty: h.qty, exp: c.exp * h.qty };
  }


  /* =========================================================
     9. 料理
  ========================================================= */

  /* 星願池料理：拿到食材就學會、秘傳食譜用殘頁換、每月限定看食譜卡 */
  function dishKnown(k) {
    const d = D.dishes[k];
    if (!d) return false;
    if (d.fish) return !!(S.fish && S.fish.caught[d.fish]);     // 魚料理：釣到那種魚就會做
    if (!d.gacha) return S.lv >= d.lv;
    if (S.known.recipes[k]) return true;
    if (d.learn) return !!(S.known.items[d.learn] || S.known.crops[d.learn] || have(d.learn) > 0);
    if (d.card) return !!own(d.card);
    return false;
  }

  /* 魔法鍋：料理時間 -30% */
  function dishMinutes(d) {
    return own("tool_magicpot") ? Math.max(1, Math.round(d.minutes * 0.7)) : d.minutes;
  }

  function stoveCount() {
    return kitchenTier()[3];
  }

  function freeStoves() {
    return stoveCount() - S.kitchen.jobs.length;
  }

  const COOK_MAX = 20;      // 一個爐子一次最多做幾份

  /* 食材夠做幾份 */
  function cookableCount(k) {
    const d = D.dishes[k];
    let n = COOK_MAX;
    for (const [key, q] of Object.entries(d.need)) n = Math.min(n, Math.floor(have(key) / q));
    return Math.max(0, n);
  }

  /* 一個爐子做同一道菜 n 份：一份一份輪流做好，做好自動放進倉庫 */
  function cookDish(k, n = 1) {
    const d = D.dishes[k];
    n = Math.max(1, Math.min(COOK_MAX, Math.floor(n)));
    if (!dishKnown(k)) return "還沒學會這道菜";
    if (freeStoves() <= 0) return "爐子都在用";
    if (!hasAll(d.need, n)) return "食材不夠";
    for (let i = 0; i < n; i++) takeAll(d.need);
    const m = dishMinutes(d) * MIN;
    const t0 = now();
    S.kitchen.jobs.push({ d: k, n, got: 0, t0, m, t1: t0 + n * m });
    return "ok";
  }

  /* 舊存檔的爐子只有 { d, t1 }：當成 1 份 */
  function jobInfo(job) {
    const n = job.n || 1;
    const m = job.m || dishMinutes(D.dishes[job.d]) * MIN;
    const t0 = job.t0 || (job.t1 - n * m);
    const ready = Math.min(n, Math.max(0, Math.floor((now() - t0) / m)));
    return { n, m, t0, got: job.got || 0, ready, nextAt: t0 + Math.min(n, ready + 1) * m };
  }

  /* 做好的料理自動放進倉庫；回傳這次收了哪些 */
  function autoCollectDishes() {
    const out = [];
    for (let i = S.kitchen.jobs.length - 1; i >= 0; i--) {
      const job = S.kitchen.jobs[i];
      if (!D.dishes[job.d]) { S.kitchen.jobs.splice(i, 1); continue; }
      const info = jobInfo(job);
      let got = info.got;
      while (got < info.ready && invSpace() >= 1) {
        const d = D.dishes[job.d];
        addItem(job.d, 1);
        addExp(d.exp);
        S.known.dishes[job.d] = (S.known.dishes[job.d] || 0) + 1;
        S.stats.cook = (S.stats.cook || 0) + 1;
        goalAdd("cook");
        /* 鳳凰雛鳥：10% 完美料理，多賺一份錢 */
        const perfect = own("p_phoenix") && Math.random() < 0.1;
        if (perfect) addDew(d.sell);
        out.push({ dish: job.d, exp: d.exp, perfect });
        got++;
      }
      job.got = got;
      job.n = info.n; job.m = info.m; job.t0 = info.t0;
      if (got >= info.n) S.kitchen.jobs.splice(i, 1);
    }
    return out;
  }

  /* 有料理做好了，但倉庫滿了放不進去 */
  function kitchenStuck() {
    return S.kitchen.jobs.some(j => { const f = jobInfo(j); return f.ready > f.got; });
  }

  /* =========================================================
     訂單任務：每天 10 張，點的料理一定是「現在食材就做得出來」的
     繳交時要有那道料理在倉庫，獎勵由伺服器隨機發（每張只能領一次）
  ========================================================= */

  const ORDER_SLOTS = 10;

  function ordState() {
    const day = todayKey();
    if (!S.ord || S.ord.day !== day) {
      S.ord = { day, slots: Array.from({ length: ORDER_SLOTS }, () => ({ d: null, done: false })) };
    }
    return S.ord;
  }

  /* 空的欄位從「現在食材做得出來」的料理裡挑；已經排給其他欄的不重複 */
  function fillOrders() {
    const o = ordState();
    const taken = new Set(o.slots.map(s => s.d).filter(Boolean));
    o.slots.forEach((slot, i) => {
      if (slot.d || slot.done) return;
      const cands = Object.keys(D.dishes).filter(k =>
        dishKnown(k) && !D.dishes[k].gacha && !taken.has(k) && cookableCount(k) > 0);
      if (!cands.length) return;
      const pick = cands[hash(o.day + ":ord:" + i + ":" + S.day) % cands.length];
      slot.d = pick;
      taken.add(pick);
    });
    return o;
  }

  async function submitOrder(i) {
    const o = ordState();
    const slot = o.slots[i];
    if (!slot || slot.done || !slot.d) return toast("這張訂單現在不能交");
    if (!have(slot.d)) return toast("倉庫裡沒有這道菜");
    if (net.mode !== "server") return toast("資料庫設定好之後才能交訂單");

    const key = o.day + ":" + i;
    const { data, error } = await db.rpc("farm_order_claim", { p_key: key });
    if (error) return toast("交單失敗：" + error.message);

    takeItem(slot.d, 1);
    slot.done = true;
    addExp(10);

    const r = data || {};
    const names = { stardust: "⭐ 星屑", wish_normal: "🎫 普通星願券", ticket_normal: "🎟️ 普通召喚券" };
    if (r.already) toast("這張訂單的獎勵已經領過了");
    else toast(`📋 訂單完成！獲得 ${names[r.item] || r.item} ×${r.qty}`);
    after();
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
  const queueMax = m => D.machines[m]?.queue || QUEUE_MAX;

  /* 機器的圖：有圖用圖，沒圖退回 emoji */
  function machineTag(info) {
    return info.img ? `<img src="${IMG}${info.img}" alt="" style="height:1.3em;width:auto;vertical-align:-0.25em">` : info.emoji;
  }

  function machineOpen(m) {
    const info = D.machines[m];
    if (S.lv < info.lv) return false;
    return info.where === "ranch" || S.workshop.open;
  }

  function machineQueue(m) {
    if (!S.mach[m]) S.mach[m] = [];
    return S.mach[m];
  }

  /* 排隊的「欄」：飼料機每種配方一欄（各自排隊、各自計時），其他機器共用一欄 */
  const laneOf = rk => {
    const r = D.recipes[rk];
    return r && r.machine === "feedmill" ? rk : (r ? r.machine : "");
  };

  function startRecipe(rk) {
    const r = D.recipes[rk];
    if (!r || S.lv < r.lv) return "還沒解鎖";
    if (!machineOpen(r.machine)) return "機器還沒開";
    const q = machineQueue(r.machine);
    const lane = q.filter(j => laneOf(j.r) === laneOf(rk));
    if (lane.length >= queueMax(r.machine)) return "排隊滿了";
    if (!takeAll(r.need)) return "材料不夠";
    const start = lane.length ? Math.max(now(), lane[lane.length - 1].t1) : now();
    q.push({ r: rk, t1: start + machineMinutes(r) * MIN });
    return "ok";
  }

  function collectMachine(m) {
    const q = machineQueue(m);
    let got = 0;
    const out = [];
    for (let i = 0; i < q.length;) {
      const j = q[i];
      if (now() < j.t1) { i++; continue; }
      const r = D.recipes[j.r];
      if (!NOT_STORED(r.out) && invSpace() < r.qty) { i++; continue; }
      addItem(r.out, r.qty);
      addExp(3);
      goalAdd("process");
      out.push(r.out);
      q.splice(i, 1);
      got++;
    }
    return got ? out : null;
  }

  function machineReadyCount(m) {
    return machineQueue(m).filter(j => now() >= j.t1).length;
  }


  /* =========================================================
     10b. 釣魚（碼頭）：點一下用 1 個魚餌，直接釣到一條魚
  ========================================================= */

  const FISH_TIERS = ["c", "r", "l", "x", "s"];

  function rodNow() {
    return D.rods[S.fish.rod] || D.rods.bamboo;
  }

  function isNightNow() {
    const h = new Date(now()).getHours();
    return h >= 18 || h < 6;
  }

  /* 這一竿的機率：基本機率加上特殊竿的效果，每一組加起來都是 100 */
  function rodRates() {
    const rod = rodNow();
    const r = rod.rate.slice();
    const shift = (from, to, n) => { r[from] -= n; r[to] += n; };
    if (rod.effect === "rain" && isRainDay()) { shift(0, 1, 6); shift(0, 2, 3); shift(0, 3, 1); }
    if (rod.effect === "mirror") shift(0, 3, 11);
    if (rod.effect === "dragon") shift(0, 4, 5);
    return r;
  }

  function pickTier(rates) {
    let x = Math.random() * 100;
    for (let i = 0; i < rates.length; i++) { x -= rates[i]; if (x < 0) return i; }
    return rates.length - 1;
  }

  function pickFish(tierIdx) {
    const tier = FISH_TIERS[tierIdx];
    const list = Object.keys(D.fish).filter(k => D.fish[k].tier === tier);
    return list[Math.floor(Math.random() * list.length)];
  }

  /* 釣一條魚：回傳魚的 key */
  function rollFish() {
    const rod = rodNow();
    const rates = rodRates();
    const miss = S.fish.miss || 0;
    /* 保底竿：連續 30 次沒有稀有以上，下一次一定是稀有以上 */
    if (rod.effect === "pity" && miss >= 29) {
      const hi = [rates[2], rates[3], rates[4]];
      const i = pickTier([hi[0], hi[1], hi[2]].map(x => x / hi.reduce((a, b) => a + b, 0) * 100));
      return pickFish(2 + i);
    }
    return pickFish(pickTier(rates));
  }

  /* 特殊竿的解鎖條件 */
  function checkRodUnlocks() {
    const f = S.fish;
    const caughtN = Object.keys(f.caught || {}).filter(k => D.fish[k]).length;
    const got = {};
    if (isRainDay() && (f.rainFish || 0) > 0) got.rain = true;
    if (isNightNow() && (f.nightFish || 0) > 0) got.firefly = true;
    if (caughtN >= 20) got.mirror = true;
    if ((f.total || 0) >= 300) got.double = true;
    if (f.legends > 0) got.dragon = true;
    const pity = ACH.find(a => a[0] === "fish50");
    if (pity && achState(pity).claimed) got.pity = true;
    let added = false;
    for (const k of Object.keys(got)) if (!f.rods[k]) { f.rods[k] = 1; added = true; }
    return added;
  }

  /* 釣魚：一次按鈕；雙鉤竿一次拉兩條（扣兩個魚餌） */
  function fishCast(n = 1) {
    if (!zoneUnlocked("碼頭")) return toast(`碼頭 Lv${zoneLv("碼頭")} 開放`);
    const per = rodNow().effect === "double" ? 2 : 1;
    n = Math.min(n, Math.floor(have("bait") / per));
    if (n <= 0) return toast(per > 1 ? "魚餌不夠（雙鉤竿一次要 2 個）" : "沒有魚餌了，去牧場的魚餌線做");
    const rod = rodNow();
    const cnt = n * per;
    const room = invSpace();
    if (room <= 0) return toast(`倉庫滿了（${invUsed()}/${storageCap()}），先賣掉或做成料理`);
    const got = [];
    let casts = 0;
    for (let i = 0; i < n; i++) {
      if (invSpace() < per) break;
      takeItem("bait", per);
      casts++;
      const bonus = rod.effect === "night" && isNightNow() && Math.random() < 0.2;
      const catches = per + (bonus ? 1 : 0);
      let hitRare = false;
      for (let j = 0; j < catches && invSpace() >= 1; j++) {
        const k = rollFish();
        const isNew = !S.fish.caught[k];
        S.fish.caught[k] = (S.fish.caught[k] || 0) + 1;
        S.fish.total = (S.fish.total || 0) + 1;
        addItem(k, 1);
        addExp(D.fish[k].exp);
        const tier = D.fish[k].tier;
        if (tier === "s") { S.fish.legends = (S.fish.legends || 0) + 1; }
        if (tier === "l" || tier === "x" || tier === "s") hitRare = true;
        if (isNightNow()) S.fish.nightFish = (S.fish.nightFish || 0) + 1;
        if (isRainDay()) S.fish.rainFish = (S.fish.rainFish || 0) + 1;
        got.push({ k, isNew });
      }
      S.fish.miss = hitRare ? 0 : (S.fish.miss || 0) + 1;
    }
    checkRodUnlocks();
    if (!got.length) return toast("背包滿了");
    UI.fishResult = got;
    if (casts < n) toast("倉庫快滿了，只釣了一部分");
    after();
  }

  function buyRod(k) {
    const rod = D.rods[k];
    if (!rod) return "沒有這支釣竿";
    if (rod.cond) return "還沒解鎖";
    if (S.fish.rods[k]) return "已經有了";
    if (S.lv < rod.lv) return `Lv${rod.lv} 才能買`;
    if (!spend(rod.price)) return "星露不夠";
    S.fish.rods[k] = 1;
    S.fish.rod = k;
    return "ok";
  }


  /* =========================================================
     11. 牧場
  ========================================================= */

  function animalsOf(sp) {
    return S.ranch.animals.filter(a => a.sp === sp);
  }

  /* 柴犬：產出時間 -10% */
  function everyH(info) {
    return info.every * (own("p_shiba") ? 0.9 : 1);
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
    a.t1 = now() + (a.adult ? everyH(info) : info.grow) * HOUR;
    goalAdd("feed");
    return true;
  }

  function collectAnimal(a) {
    if (animalState(a) !== "ready") return null;
    const info = D.animals[a.sp];
    let item = info.product, qty = 1;
    if (a.sp === "goldhen" && Math.random() < 0.1) item = "goldegg";      // 金雞偶爾生金蛋
    if (a.sp === "moonrabbit" && isFullMoon()) qty = 2;                   // 月兔：滿月那天 ×2
    if (invSpace() < qty) return null;
    addItem(item, qty);
    addExp(info.exp * qty);
    S.known.crops[item] = (S.known.crops[item] || 0) + qty;
    goalAdd("animal");
    if (info.feed > 0) {
      a.fed = false;
      a.t1 = null;
    } else {
      a.t1 = now() + everyH(info) * HOUR;
    }
    return { item, exp: info.exp * qty, qty };
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
      a.t1 = now() + everyH(info) * HOUR;
    }
    S.ranch.animals.push(a);
    S.known.animals[sp] = (S.known.animals[sp] || 0) + 1;
    return a;
  }

  /* 抽到的動物：住處滿了就換成星露 */
  function giveAnimal(sp) {
    const info = D.animals[sp];
    if (animalsOf(sp).length >= animalCap(sp)) {
      const comp = 150 * (TIERS.indexOf(info.tier) + 1);
      addDew(comp);
      return `${info.house}滿了，換成 ${comp} 星露`;
    }
    addAnimal(sp, true);
    return "";
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

    /* 料理做好自動放進倉庫 */
    const cooked = autoCollectDishes();
    if (cooked.length) {
      changed = true;
      if (UI.root && isFarmVisible()) {
        const names = {};
        for (const c of cooked) names[c.dish] = (names[c.dish] || 0) + 1;
        const perfect = cooked.filter(c => c.perfect).length;
        toast(`🍳 做好了：${Object.entries(names).map(([k, v]) => `${D.dishes[k].name} ×${v}`).join("、")}，+${cooked.reduce((a, c) => a + c.exp, 0)} EXP${perfect ? `（🐥 完美料理 ${perfect} 份）` : ""}`);
      }
    }

    /* 魚餌線做好自動收 */
    for (const m of Object.keys(D.machines)) {
      if (D.machines[m].auto && S.mach[m] && S.mach[m].length && collectMachine(m)) changed = true;
    }

    /* 自動滴水：每 30 分鐘 +1 滴，只會補到上限 */
    const DRIP = 30 * MIN;
    if (!S.drip) S.drip = t;
    const ticks = Math.floor((t - S.drip) / DRIP);
    if (ticks > 0) {
      const cap = waterCap();
      if (S.water < cap.max) {
        S.water = Math.min(cap.max, S.water + ticks);
        changed = true;
      }
      S.drip += ticks * DRIP;
    }

    for (const a of S.ranch.animals) {
      if (!a.adult && a.fed && a.t1 && t >= a.t1) {
        a.adult = true;
        a.fed = false;
        a.t1 = null;
        if (D.animals[a.sp].feed === 0) {
          a.fed = true;
          a.t1 = t + everyH(D.animals[a.sp]) * HOUR;
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
    if (it.kind === "dish" || it.kind === "fish") return it.sell;
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
     13. 星願池（抽獎）
     抽到什麼、幸運值、保底、星屑、收藏都在資料庫算（farm_wish_*），
     這裡把抽到的東西放進島上：種子、動物、家具、星露…
  ========================================================= */

  const W = D.wish;
  const WISH_NAMES = { wish_normal: "普通星願瓶", wish_rare: "稀有星願瓶", wish_limited: "限定星願瓶" };
  const WISH_IMG = { wish_normal: "item/wish_normal.webp", wish_rare: "item/wish_rare.webp", wish_limited: "item/wish_limited.webp" };
  const POOL_NAME = { free: "每日免費抽", wish_normal: "普通池", wish_rare: "稀有池", wish_limited: "每月限定池", shop: "星願商店" };

  function rewardInfo(key) {
    return W.rewards[key] || { tier: "c", kind: "none", name: key, emoji: "🎁" };
  }

  function rewardArt(key, cls = "") {
    const special = { wish_normal: WISH_IMG.wish_normal, wish_rare: WISH_IMG.wish_rare, wish_limited: WISH_IMG.wish_limited, makeupcard: "item/makeupcard.webp", page: "item/recipepage.webp" };
    const r = rewardInfo(key);
    const img = special[key] || r.img;
    if (img) return `<img class="${cls}" src="${IMG}${img}" alt="" loading="lazy" draggable="false">`;
    return `<span class="fm-emo ${cls}">${r.emoji || "🎁"}</span>`;
  }

  function isUnique(key) {
    return W.unique.some(p => key.startsWith(p));
  }

  /* 普通池（每日免費抽、普通瓶）：幸運值每 1 點，珍 +1%、華 +0.5%、仙 +0.1% */
  function normalOdds(luck) {
    const k = Math.max(1, Math.min(30, luck || 1)) - 1;
    const s_ = 0.1 + 0.1 * k, x = 0.9 + 0.5 * k, l = 5 + k, r = 24;
    return { c: 100 - s_ - x - l - r, r, l, x, s: s_ };
  }

  /* 稀有池：沒中大獎每瓶 華 +1.5%、仙 +0.5%；第 20 瓶一定中 */
  function rareOdds(n) {
    if (n >= 20) return { r: 0, l: 0, x: 75, s: 25 };
    return { r: 50 - 2 * (n - 1), l: 35, x: 12 + 1.5 * (n - 1), s: 3 + 0.5 * (n - 1) };
  }

  /* 限定池：沒中主角每瓶 仙 +5%；第 10 瓶一定中 */
  function limitedOdds(n) {
    if (n >= 10) return { l: 0, x: 0, s: 100 };
    return { l: 50 - 5 * (n - 1), x: 35, s: 15 + 5 * (n - 1) };
  }

  function pct(v) {
    return (Math.round(v * 10) / 10) + "%";
  }

  function stardust() {
    return (net.ws && net.ws.items && net.ws.items.stardust) || 0;
  }

  function makeupCards() {
    return (net.ws && net.ws.items && net.ws.items.makeup_card) || 0;
  }

  function freeLeft() {
    const st = net.ws;
    return st ? Math.max(0, st.free_total - st.free_used) : 0;
  }

  /* 把抽到的東西放進島上（星屑、星願瓶、補簽卡、幸運值、收藏，資料庫已經處理好了） */
  function applyReward(res) {

    const r = rewardInfo(res.key);
    const out = { key: res.key, tier: res.tier || r.tier, name: r.name, dup: !!res.dup, dust: res.dust || 0, note: "" };

    if (res.dup) {
      out.note = `已經有了，換成 ${res.dust} 星屑`;
      return out;
    }

    switch (r.kind) {
      case "dew": {
        const n = res.amount || (r.n ? r.n[0] : 0);
        addDew(n);
        out.name = `星露 ${num(n)}`;
        break;
      }
      case "item": {
        const got = addItem(r.item, r.qty);
        if (got < r.qty) {
          addDew((r.qty - got) * 5);
          out.note = "倉庫滿了，放不下的換成星露";
        }
        break;
      }
      case "crop5": {
        const list = Object.keys(D.crops).filter(k => D.crops[k].lv > 0 && D.crops[k].lv <= S.lv && D.crops[k].zone === "菜田");
        const k = list[Math.floor(Math.random() * list.length)];
        const got = addItem(k, 5);
        out.name = `${itemName(k)} ×5`;
        out.key = k;
        if (got < 5) {
          addDew((5 - got) * 5);
          out.note = "倉庫滿了，放不下的換成星露";
        }
        break;
      }
      case "page":
        S.pages = (S.pages || 0) + r.qty;
        out.note = `殘頁 ${S.pages} 張，3 張換一道秘傳食譜`;
        break;
      case "deco":
        out.note = autoPlace(r.deco) ? "已經擺上島了" : "在「收藏」可以擺上島";
        break;
      case "crop":
        addItem("seed_" + r.crop, 5);
        out.note = "種子 ×5，之後種子也能用星露買";
        break;
      case "tree":
        addItem("seed_" + r.crop, 1);
        out.note = "樹苗 ×1，種在果園；之後也能用星露買";
        break;
      case "animal":
        out.note = giveAnimal(r.sp) || `住進${D.animals[r.sp].house}`;
        break;
      case "skin": {
        const sk = D.skins[r.skin];
        if (sk && !S.skins[sk.group] && sk.group !== "night") S.skins[sk.group] = r.skin;
        out.note = sk ? (sk.desc || `換掉${sk.what}`) : "";
        rebuildStatic();
        break;
      }
      case "title":
        if (!S.titleKey) S.titleKey = r.title;
        out.note = "在「收藏」可以換稱號";
        break;
      case "pet":
        out.note = D.pets[r.pet].desc;
        break;
      case "tool":
        out.note = D.tools[r.tool].desc;
        break;
      case "recipe":
        out.note = "學會新食譜了";
        break;
      case "luck":
        out.note = "普通池的幸運值加上去了";
        break;
      case "bottle":
      case "makeup":
      case "dust":
        out.note = "放進背包了";
        break;
      default:
        break;
    }

    return out;

  }

  /* 抽到的結果先記在這台裝置，存檔成功才清掉；網頁中途關掉，下次打開會補放 */
  const pendingKey = () => "fm_wish_pending_" + (uid() || "guest");

  function applyResults(results) {
    if (!Array.isArray(S.wishApplied)) S.wishApplied = [];
    const shown = [];
    for (const res of results) {
      if (res.id && S.wishApplied.includes(res.id)) continue;
      shown.push(applyReward(res));
      if (res.id) S.wishApplied.push(res.id);
    }
    if (S.wishApplied.length > 300) S.wishApplied = S.wishApplied.slice(-300);
    return shown;
  }

  function stashPending(results) {
    try {
      const old = JSON.parse(storeGet(pendingKey()) || "[]");
      storeSet(pendingKey(), JSON.stringify(old.concat(results).slice(-100)));
    } catch (e) { /* 沒關係 */ }
  }

  function replayPending() {
    let list = [];
    try { list = JSON.parse(storeGet(pendingKey()) || "[]"); } catch (e) { list = []; }
    if (!list.length) return 0;
    const shown = applyResults(list);
    if (shown.length) saveSoon(true);
    return shown.length;
  }

  function setWishStatus(st) {
    if (!st) return;
    net.ws = st;
    const items = st.items || {};
    net.wish = { wish_normal: items.wish_normal || 0, wish_rare: items.wish_rare || 0, wish_limited: items.wish_limited || 0 };
    if (S) {
      const before = JSON.stringify(S.ownedCache || {});
      S.ownedCache = st.owned || {};
      if (before !== JSON.stringify(S.ownedCache)) {
        syncDecoSlots();
        rebuildStatic();
        saveSoon();
      }
    }
    if (typeof gameCheckinState !== "undefined" && gameCheckinState.items) {
      for (const k of Object.keys(WISH_NAMES)) gameCheckinState.items[k] = net.wish[k];
    }
  }

  async function loadWishStatus() {
    if (net.mode !== "server") return;
    try {
      const { data, error } = await db.rpc("farm_wish_status");
      if (error) throw error;
      net.wishReady = true;
      setWishStatus(data);
      if (data.milestones && data.milestones.length) {
        toast("🎉 連續簽到獎勵：" + data.milestones.map(k => k === "makeupcard" ? "補簽卡" : rewardInfo(k).name).join("、"));
      }
    } catch (error) {
      if (isMissingTable(error) || /farm_wish/.test(String(error.message || ""))) net.wishReady = false;
      else console.warn("星願池狀態載入失敗：", error);
      await loadWishCounts();
    }
  }

  let wishBusy = false;

  function wishNotReady() {
    if (net.mode !== "server") { toast("資料庫設定好之後才能抽"); return true; }
    if (!net.wishReady) { toast("星願池還沒設定好：要先在 Supabase 執行星願池的 SQL"); return true; }
    return false;
  }

  /* 抽獎 */
  async function doDraw(pool, count = 1) {

    if (wishBusy || wishNotReady()) return;

    if (pool === "free") {
      if (!net.ws.checked) return toast("先簽到才能免費抽");
      if (freeLeft() < count) return toast("今天的免費抽用完了，明天再來");
    } else if ((net.wish[pool] || 0) < count) {
      return toast("星願瓶不夠");
    }

    wishBusy = true;
    renderSheet();

    /* 先把進度存好，抽到的東西才不會跟舊存檔打架 */
    if (net.dirty) await saveNow();

    try {
      const { data, error } = await db.rpc("farm_wish_draw", { p_pool: pool, p_count: count });
      if (error) throw error;
      const results = data.results || [];
      stashPending(results);
      setWishStatus(data.status);
      const shown = applyResults(results);
      saveSoon(true);
      wishBusy = false;
      renderAll();
      openModal("wishresult", { pool, list: shown });
    } catch (error) {
      console.error("抽獎失敗：", error);
      toast("抽獎失敗：" + (error.message || error));
    }

    wishBusy = false;
    renderSheet();

  }

  /* 星屑商店：wish_normal / wish_rare / wish_limited / makeupcard / page / pick:<獎項> / yarn:<家具> */
  async function doBuy(item) {

    if (wishBusy || wishNotReady()) return;

    let yarn = null;
    if (item.startsWith("yarn:")) {
      yarn = D.deco[item.slice(7)].yarn;
      if (have(yarn) < 10) return toast(`${itemName(yarn)}不夠：要 10 個`);
    }

    wishBusy = true;
    if (net.dirty) await saveNow();

    try {
      const { data, error } = await db.rpc("farm_wish_buy", { p_item: item });
      if (error) throw error;
      if (yarn) takeItem(yarn, 10);
      let shown;
      if (item === "page") {
        S.pages = (S.pages || 0) + 1;
        shown = [{ key: "page", tier: "c", name: "食譜殘頁 ×1", note: `殘頁 ${S.pages} 張` }];
      } else if (item.startsWith("pick:") || item.startsWith("yarn:")) {
        const res = [{ id: data.id, key: data.key, tier: data.tier }];
        stashPending(res);
        setWishStatus(data.status);
        shown = applyResults(res);
      } else {
        shown = [{ key: item, tier: "c", name: item === "makeupcard" ? "補簽卡" : WISH_NAMES[item], note: "放進背包了" }];
      }
      setWishStatus(data.status);
      saveSoon(true);
      wishBusy = false;
      renderAll();
      openModal("wishresult", { pool: "shop", list: shown });
    } catch (error) {
      toast(String(error.message || error));
    }

    wishBusy = false;
    renderSheet();

  }

  /* 星空瞭望台：每天看一次流星 */
  async function doObserve() {
    if (wishNotReady()) return;
    if (net.ws.observed) return toast("今天已經看過流星了，明天再來");
    try {
      const { data, error } = await db.rpc("farm_wish_observe");
      if (error) throw error;
      setWishStatus(data);
      toast(`🌠 看到流星了！普通池幸運值 +1（現在 ${data.luck}）`);
      renderAll();
    } catch (error) {
      toast(String(error.message || error));
    }
  }

  /* 補簽卡：列出這個月沒簽到的日子 */
  async function loadMissedDays() {
    const today = todayKey();
    const start = today.slice(0, 8) + "01";
    UI.missed = null;
    try {
      const { data, error } = await db.from("checkins").select("checkin_date")
        .eq("user_id", uid()).gte("checkin_date", start).lt("checkin_date", today);
      if (error) throw error;
      const done = new Set((data || []).map(r => r.checkin_date));
      const days = [];
      for (let d = start; d < today; d = shiftDay(d, 1)) if (!done.has(d)) days.push(d);
      UI.missed = days;
    } catch (error) {
      console.warn("讀取簽到紀錄失敗：", error);
      UI.missed = [];
    }
    if (UI.sheet && UI.sheet.name === "wish") renderSheet();
  }

  async function doMakeup(date) {
    if (wishNotReady()) return;
    try {
      const { data, error } = await db.rpc("farm_wish_makeup", { p_date: date });
      if (error) throw error;
      setWishStatus(data.status);
      UI.missed = (UI.missed || []).filter(d => d !== date);
      toast(`🎫 補簽好了：${date.slice(5).replace("-", "/")}，現在連續 ${data.status.streak} 天`);
      if (typeof loadGameCheckin === "function") loadGameCheckin();
      renderAll();
    } catch (error) {
      toast(String(error.message || error));
    }
  }

  /* 在星露島直接簽到（用網站原本的簽到） */
  async function doCheckin() {
    if (typeof gameCheckin !== "function") return toast("到「今日」頁簽到");
    await gameCheckin();
    await loadWishStatus();
    renderAll();
  }

  /* 秘傳食譜：3 張殘頁換一道 */
  function learnSecret(k) {
    const d = D.dishes[k];
    if (!d || !d.secret) return;
    if (S.known.recipes[k]) return toast("已經會了");
    if ((S.pages || 0) < 3) return toast("食譜殘頁不夠：要 3 張");
    S.pages -= 3;
    S.known.recipes[k] = 1;
    toast(`📜 學會秘傳食譜：${d.name}`);
    after(true);
  }


  /* ---------- 家具：擺在島上預留的位置 ---------- */

  const DECO_SLOTS = [
    [400, 610], [545, 615], [880, 605], [130, 680], [210, 1030], [560, 1080],
    [620, 1210], [130, 1140], [520, 1300], [880, 1310], [1350, 1150], [1400, 880]
  ];

  function decoOwned(k) {
    return own("f_" + k);
  }

  function decoPlaced(k) {
    return S.deco.slots.filter(x => x === k).length;
  }

  function autoPlace(k) {
    if (!D.deco[k] || decoPlaced(k) >= decoOwned(k)) return false;
    const i = DECO_SLOTS.findIndex((_, j) => !S.deco.slots[j]);
    if (i < 0) return false;
    S.deco.slots[i] = k;
    return true;
  }

  /* 收藏數量變少（例如換了帳號資料）時，多擺的收起來 */
  function syncDecoSlots() {
    if (!net.ws || !S) return;
    for (let i = S.deco.slots.length - 1; i >= 0; i--) {
      const k = S.deco.slots[i];
      if (k && (!D.deco[k] || decoPlaced(k) > decoOwned(k))) S.deco.slots[i] = null;
    }
  }


  /* ---------- 造型 ---------- */

  function skinOn(k) {
    const sk = D.skins[k];
    return !!(sk && own("s_" + k) && S && S.skins[sk.group] === k);
  }

  function rebuildStatic() {
    const el = UI.root && UI.root.querySelector("#fm-static");
    if (el && S) el.innerHTML = staticIsland();
    if (UI.root && S) {
      const night = UI.root.querySelector("#fm-night");
      if (night) night.hidden = !skinOn("nightmode");
    }
  }


  /* ---------- 每天一次的小禮物（夥伴、鳥屋、熱可可攤、舞獅、錦鯉） ---------- */

  function dailyReset() {
    const day = todayKey();
    if (S.daily.day !== day) {
      S.daily.day = day;
      S.daily.done = {};
    }
  }

  function dailyReady(id) {
    dailyReset();
    return !S.daily.done[id];
  }

  function dailyDone(id) {
    dailyReset();
    S.daily.done[id] = 1;
  }

  /* 三花貓：每天第一次上島，菜田熟了的自動收一輪 */
  function calicoHelp() {
    if (!S || !own("p_calico") || !dailyReady("calico")) return;
    dailyDone("calico");
    const z = plotZone("field");
    let n = 0;
    for (const key of z.keys) {
      if (plotState(z.store[key]) === "ripe" && harvestOne("field", key)) n++;
    }
    if (n) toast(`🐈 三花貓幫你收了 ${n} 格菜`);
    saveSoon();
  }

  const PET_LINES = {
    calico: "喵～今天也來曬太陽",
    shiba: "汪！牧場我顧著",
    fox: "嘿嘿，多撿到一個",
    owl: "咕咕，今天多抽一次吧",
    phoenix: "啾！今天的料理會很完美",
    dragon: "要下雨了嗎？我來",
    starspirit: "閃閃～水車裝滿了"
  };

  /* 夥伴每天送一個凡品小禮物 */
  function petGift(k) {
    const p = D.pets[k];
    if (!p) return;
    /* 點一下：換成開心的樣子、冒一顆愛心 */
    UI.petHappy = { k, until: now() + 2600 };
    setTimeout(() => {
      if (UI.petHappy && UI.petHappy.k === k && now() >= UI.petHappy.until) { UI.petHappy = null; renderScene(); }
    }, 2700);
    if (!dailyReady("pet_" + k)) { renderScene(); return toast(`${p.emoji} ${p.name}：${PET_LINES[k] || "今天也很開心"}`); }
    dailyDone("pet_" + k);
    const gifts = [["dew", 30], ["fert", 1], ["feed", 3], ["bucket", 1]];
    const [g, n] = gifts[Math.floor(Math.random() * gifts.length)];
    let txt;
    if (g === "dew") { addDew(n); txt = `星露 ${n}`; }
    else {
      const got = addItem(g, n);
      if (got < n) { addDew(20); txt = "星露 20"; }
      else txt = `${itemName(g)} ×${n}`;
    }
    toast(`${p.emoji} ${p.name}：${PET_LINES[k] || "送你一個小禮物"}（${txt}）`);
    after();
  }

  /* 家具的每日效果有沒有準備好 */
  function decoReady(k) {
    const eff = D.deco[k] && D.deco[k].eff;
    if (eff === "bird" || eff === "cocoa" || eff === "lion") return dailyReady("deco_" + k);
    if (eff === "observe") return !!(net.ws && !net.ws.observed);
    return false;
  }

  function decoTap(k) {
    const d = D.deco[k];
    if (!d) return;
    const eff = d.eff;
    if (eff === "balloon") {
      UI.zoom = ZOOMS[0];
      closePop();
      layoutMap(true);
      return toast("🎈 從熱氣球上看整座島");
    }
    if (eff === "observe") return doObserve();
    if ((eff === "bird" || eff === "cocoa" || eff === "lion") && dailyReady("deco_" + k)) {
      dailyDone("deco_" + k);
      if (eff === "bird") {
        const seeds = Object.keys(D.crops).filter(c => D.crops[c].lv === 0 && D.crops[c].zone !== "果園" && cropUnlocked(c));
        if (seeds.length) {
          const c = seeds[Math.floor(Math.random() * seeds.length)];
          addItem("seed_" + c, 1);
          toast(`🐦 小鳥帶來了 ${D.crops[c].name}種子`);
        } else {
          addDew(30);
          toast("🐦 小鳥帶來了 30 星露");
        }
      } else if (eff === "cocoa") {
        if (addItem("hotcocoa", 1)) toast("☕ 熱可可攤送你一杯熱可可");
        else { addDew(40); toast("☕ 倉庫滿了，熱可可換成 40 星露"); }
      } else {
        const n = 88 + Math.floor(Math.random() * 801);
        addDew(n);
        toast(`🦁 舞獅表演！紅包 ${n} 星露`);
      }
      return after();
    }
    toast(`${d.name}${d.desc ? "：" + d.desc : ""}`);
  }


  /* ---------- 道具 ---------- */

  /* 某一區還在長的東西：回傳 [物件, 欄位] */
  const ZONE_LABEL = { field: "菜田", herb: "香草園", green: "溫室", pond: "蓮池", orchard: "果園", logs: "菇棚", tea: "茶園" };

  function zoneTimers(zone) {
    const t = now();
    const list = [];
    if (["field", "herb", "green", "pond"].includes(zone)) {
      if (zone !== "field" && zone !== "pond" && !zoneOpen(ZONE_LABEL[zone])) return list;
      const z = plotZone(zone);
      for (const key of z.keys) {
        const p = z.store[key];
        if (p && p.t1 && p.t1 > t) list.push([p, "t1"]);
      }
    } else if (zone === "orchard") {
      for (const tr of Object.values(S.orchard.trees)) {
        if (tr.grown > t) list.push([tr, "grown"], [tr, "next"]);
        else if (tr.next > t) list.push([tr, "next"]);
      }
    } else if (zone === "logs") {
      for (const l of Object.values(S.logs.slots)) if (l.next > t) list.push([l, "next"]);
    } else if (zone === "tea") {
      for (const b of Object.values(S.tea.bushes)) {
        if (b.grown > t) list.push([b, "grown"], [b, "next"]);
        else if (b.next > t) list.push([b, "next"]);
      }
    }
    return list;
  }

  function speedZone(zone, ms) {
    const t = now();
    const list = zoneTimers(zone);
    for (const [obj, key] of list) obj[key] = Math.max(t, obj[key] - ms);
    return list.length;
  }

  function waterAllThirsty() {
    let n = 0;
    for (const zone of ["field", "herb"]) {
      const z = plotZone(zone);
      for (const key of z.keys) {
        const p = z.store[key];
        if (p && !p.s && !p.t1) { p.t1 = now() + D.crops[p.c].hours * HOUR; n++; }
      }
    }
    return n;
  }

  function useItem(key) {
    if (have(key) <= 0) return;
    if (key === "bucket") {
      const cap = waterCap();
      if (S.water >= cap.max) return toast("水車已經滿了");
      takeItem(key, 1);
      S.water = Math.min(cap.max, S.water + cap.per);
      toast(`🪣 水車 +1 桶（${S.water}/${cap.max}）`);
      return after();
    }
    if (key === "raincloud") {
      if (isRainDay()) return toast("今天已經在下雨了");
      takeItem(key, 1);
      S.rainDay = todayKey();
      const n = waterAllThirsty();
      toast(`🌧️ 下雨了！今天種什麼都不用水${n ? `，口渴的 ${n} 格也澆好了` : ""}`);
      renderRain();
      return after(true);
    }
    if (key === "harvestticket") {
      takeItem(key, 1);
      S.boost.x2 = (S.boost.x2 || 0) + 1;
      toast(`🎫 接下來 ${S.boost.x2} 次收成數量 ×2`);
      return after();
    }
    if (key === "speedglass") return openModal("pickzone", { use: "speedglass" });
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
    wish: {},               // 星願瓶數量
    ach: { ready: null, claimed: new Set(), counts: {} }   // 成就
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
    if (clampTimers()) net.dirty = true;
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
      clampTimers();
      net.rev = data.rev;
      if (replayPending()) net.dirty = true;
      toast("別的裝置或分頁存過更新的進度，已經換成那一份");
      rebuildStatic();
      renderAll();
    }
  }

  /* 升級時資料庫要發星願瓶（看存檔裡的等級） */
  async function afterSave() {
    if (!net.dirty && !net.error && net.mode === "server") storeSet(pendingKey(), null);
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
     15. 習慣打卡、完成任務 → 水車裝水
     同一個習慣（或任務）同一天只算一次（取消再打卡不會重複裝水）
  ========================================================= */

  /*
    水車裝水（今天和昨天的，每一筆只算一次，記在 S.wcred）
    - 完成習慣、任務：1 桶
    - 專注每 15 分鐘、記一次喝水、記一餐、記一次運動：1 滴
    - 喝水達標：1 桶
    另外：睡滿目標 → 加速沙漏 1 個；當天運動達標 → 星露 100；各科升級 → 每級星露 100
  */
  const ACCUM_DEFAULT = { waterMl: 2250, sleepHours: 7, exerciseWeek: 150 };

  function accumRules() {
    try {
      if (typeof window.accumGetSettings === "function") return { ...ACCUM_DEFAULT, ...window.accumGetSettings() };
    } catch (e) { /* 用預設 */ }
    return { ...ACCUM_DEFAULT };
  }

  async function creditWater(showToast_ = true) {

    const got = { buckets: 0, drops: 0, wasted: 0, glass: 0, dew: 0, levels: [] };

    if (!S || !uid()) return got;

    const day = todayKey();
    const yesterday = shiftDay(day, -1);
    const rules = accumRules();
    const credits = [];   // [日期, 編號, "bucket" | "drop" | "glass" | "dew"]

    const read = async (label, fn) => {
      try { await fn(); } catch (error) { console.warn(`讀取${label}失敗：`, error); }
    };

    await read("習慣打卡", async () => {
      const { data, error } = await db.from("habit_logs").select("habit_id, log_date, is_makeup")
        .eq("user_id", uid()).gte("log_date", yesterday).limit(500);
      if (error) throw error;
      for (const row of data || []) if (!row.is_makeup) credits.push([row.log_date, row.habit_id, "hbucket"]);
    });

    await read("晨間打卡", async () => {
      const { data, error } = await db.from("morning_checkins").select("check_date")
        .eq("user_id", uid()).gte("check_date", day).limit(10);
      if (error) throw error;
      if ((data || []).length) credits.push([day, "M", "drop"]);
    });

    await read("任務", async () => {
      /* 今天（凌晨 2 點之後）完成的任務 */
      const start = new Date(day + "T02:00:00");
      const { data, error } = await db.from("tasks").select("id, completed_at")
        .eq("user_id", uid()).eq("completed", true).gte("completed_at", start.toISOString()).limit(300);
      if (error) throw error;
      for (const row of data || []) credits.push([day, "t" + row.id, "bucket"]);
    });

    await read("專注", async () => {
      const { data, error } = await db.from("focus_sessions").select("session_date, duration_seconds")
        .eq("user_id", uid()).gte("session_date", yesterday).limit(500);
      if (error) throw error;
      const minutes = {};
      for (const row of data || []) minutes[row.session_date] = (minutes[row.session_date] || 0) + (Number(row.duration_seconds) || 0) / 60;
      for (const [date, m] of Object.entries(minutes)) {
        for (let i = 1; i <= Math.floor(m / 15); i++) credits.push([date, "f" + i, "drop"]);
      }
    });

    await read("喝水", async () => {
      const { data, error } = await db.from("water_logs").select("id, log_date, ml")
        .eq("user_id", uid()).gte("log_date", yesterday).limit(500);
      if (error) throw error;
      const total = {};
      for (const row of data || []) {
        credits.push([row.log_date, "w" + row.id, "drop"]);
        total[row.log_date] = (total[row.log_date] || 0) + (Number(row.ml) || 0);
      }
      for (const [date, ml] of Object.entries(total)) if (ml >= rules.waterMl) credits.push([date, "W", "bucket"]);
    });

    await read("三餐", async () => {
      const { data, error } = await db.from("meal_logs").select("id, log_date, skipped")
        .eq("user_id", uid()).gte("log_date", yesterday).limit(100);
      if (error) throw error;
      for (const row of data || []) if (!row.skipped) credits.push([row.log_date, "m" + row.id, "drop"]);
    });

    await read("運動", async () => {
      const { data, error } = await db.from("exercise_logs").select("id, log_date, minutes")
        .eq("user_id", uid()).gte("log_date", yesterday).limit(200);
      if (error) throw error;
      const total = {};
      for (const row of data || []) {
        credits.push([row.log_date, "e" + row.id, "drop"]);
        total[row.log_date] = (total[row.log_date] || 0) + (Number(row.minutes) || 0);
      }
      const daily = Math.ceil(rules.exerciseWeek / 5);
      for (const [date, m] of Object.entries(total)) if (m >= daily) credits.push([date, "E", "dew"]);
    });

    await read("作息", async () => {
      /* 前一晚睡滿 → 起床那天送加速沙漏 */
      const { data, error } = await db.from("sleep_logs").select("night_date, bed_at, wake_at")
        .eq("user_id", uid()).gte("night_date", shiftDay(yesterday, -1)).limit(10);
      if (error) throw error;
      for (const row of data || []) {
        if (!row.bed_at || !row.wake_at) continue;
        const minutes = (new Date(row.wake_at) - new Date(row.bed_at)) / 60000;
        const wakeDay = shiftDay(row.night_date, 1);
        if (minutes >= rules.sleepHours * 60 && (wakeDay === day || wakeDay === yesterday)) credits.push([wakeDay, "S", "glass"]);
      }
    });

    const cap = waterCap();
    /* 習慣打卡的水桶可以超過上限保留；其他水滴仍然受上限限制 */
    const pour = (n, overflow = false) => {
      if (!overflow && S.water >= cap.max) { got.wasted++; return false; }
      S.water = overflow ? S.water + n : Math.min(cap.max, S.water + n);
      return true;
    };

    for (const [date, id, kind] of credits) {
      const list = S.wcred[date] || (S.wcred[date] = []);
      if (list.includes(id)) continue;
      list.push(id);
      if (kind === "hbucket") { if (pour(cap.per, true)) got.buckets++; }
      else if (kind === "bucket") { if (pour(cap.per)) got.buckets++; }
      else if (kind === "drop") { if (pour(1)) got.drops++; }
      else if (kind === "glass") { addItem("speedglass", 1); got.glass++; }
      else if (kind === "dew") { addDew(100); got.dew += 100; }
    }

    /* 各科升級：每升一級送 100 星露（第一次看到的等級只記下來，不補發） */
    try {
      const levels = typeof window.accumSubjectLevels === "function" ? window.accumSubjectLevels() : null;
      const sig = typeof window.accumLevelSig === "function" ? window.accumLevelSig() : "";
      /* 改了升級規則：重新記下目前的等級，不補發 */
      if (levels && S.subjSig !== sig) {
        for (const [key, info] of Object.entries(levels)) S.subjLv[key] = info.level;
        S.subjSig = sig;
        saveSoon();
      } else if (levels) {
        for (const [key, info] of Object.entries(levels)) {
          const before = S.subjLv[key];
          if (before === undefined) { S.subjLv[key] = info.level; continue; }
          if (info.level > before) {
            got.dew += (info.level - before) * 100;
            addDew((info.level - before) * 100);
            got.levels.push(`${info.name} Lv${info.level}`);
            S.subjLv[key] = info.level;
          }
        }
      }
    } catch (error) {
      console.warn("各科等級同步失敗：", error);
    }

    if (got.buckets || got.drops || got.wasted || got.glass || got.dew) {
      saveSoon();
      renderAll();
      if (showToast_) {
        const text = creditText(got);
        if (text) toast(text);
      }
    }

    return got;

  }

  function creditText(got) {
    if (!got) return "";
    const parts = [];
    if (got.buckets) parts.push(`+${got.buckets} 桶`);
    if (got.drops) parts.push(`+${got.drops} 滴`);
    const extra = [];
    if (got.glass) extra.push(`睡滿目標，送加速沙漏 ×${got.glass}`);
    if (got.levels && got.levels.length) extra.push(`${got.levels.join("、")}，升級獎勵`);
    if (got.dew) extra.push(`星露 +${got.dew}`);
    if (!parts.length && !extra.length) return got.wasted ? "💧 星露島的水車已經滿了" : "";
    const cap = waterCap();
    return [parts.length ? `💧 星露島水車 ${parts.join("、")}（${S.water}/${cap.max}）` : "", ...extra].filter(Boolean).join("・");
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
        <div class="fm-night" id="fm-night" ${skinOn("nightmode") ? "" : "hidden"}></div>
      </div>
      <div class="fm-rain" id="fm-rain" hidden></div>
      <div class="fm-hud" id="fm-hud"></div>
      <div class="fm-prof" id="fm-prof"></div>
      <div class="fm-banner" id="fm-banner"></div>
      <div class="fm-zoom">
        <button type="button" data-act="zoom" data-z="1" aria-label="放大">＋</button>
        <button type="button" data-act="zoom" data-z="-1" aria-label="縮小">－</button>
        <button type="button" data-act="home" aria-label="回到菜田">${uiIcon("home")}</button>
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
    root.classList.add("fm-has-root");
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
        <span class="fm-cap-sub">${S.water >= cap.max ? "水車滿了" : `下一滴 <span data-until="${(S.drip || now()) + 30 * MIN}">${dur((S.drip || now()) + 30 * MIN - now())}</span>`}</span>
      </button>
      <button type="button" class="fm-cap" data-act="market" aria-label="星露 ${S.dew}">
        <span class="fm-cap-ic">${ICON.dew}</span>${num(S.dew)}<span class="fm-plus">+</span>
      </button>
      <button type="button" class="fm-cap" data-act="wish" aria-label="星願池：星願瓶 ${wishTotal()} 個${freeLeft() ? "，今天的免費抽還沒用" : ""}">
        <span class="fm-cap-ic"><img src="${IMG}item/wish_normal.webp" alt=""></span>${wishTotal()}${freeLeft() && net.ws && net.ws.checked ? `<i class="fm-dot fm-dot-l"></i>` : ""}
      </button>`;

    const need = lvNeed(S.lv);
    const pct = S.lv >= 50 ? 100 : Math.floor((S.exp / need) * 100);
    const ti = S.titleKey && own("t_" + S.titleKey) ? D.titles[S.titleKey] : null;
    const titleName = ti ? ti.name : S.title;
    const name = titleName ? `星露島・${titleName}` : "星露島";
    const frame = ti && ti.color ? `style="--frame:${ti.color}"` : "";

    UI.root.querySelector("#fm-prof").innerHTML = `
      <div class="fm-ava-wrap">
        <div class="fm-ava ${ti && ti.color && !ti.frameImg ? "framed" : ""} ${S.titleKey === "immortal" && ti ? "meteor" : ""}" ${frame}><img src="${IMG}crop/onion_3.webp" alt=""></div>
        ${ti && ti.frameImg ? `<img class="fm-ava-frame ${S.titleKey === "immortal" ? "meteor" : ""}" src="${IMG}${ti.frameImg}" alt="">` : ""}
      </div>
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
      el.innerHTML = `<span class="fm-goal-ic">${uiIcon("complete")}</span><span>今天的小目標都完成了</span>`;
    } else if (claimable) {
      el.innerHTML = `<span class="fm-goal-ic">${uiIcon("claim")}</span><span>小目標完成，點我領獎勵！</span>`;
    } else {
      const t = GOAL_TYPES.find(x => x.k === open.k);
      el.innerHTML = `<span class="fm-goal-ic">${t.ui ? uiIcon(t.ui) : t.icon}</span><span>今日小目標：${t.name} ${open.n} 次 <em>(${open.got}/${open.n})</em></span>`;
    }

  }


  /* ---------- 下方選單 ---------- */

  function renderDock() {

    const cookable = Object.keys(D.dishes).some(k => dishKnown(k) && hasAll(D.dishes[k].need));
    const kitchenDone = kitchenStuck() ? 1 : 0;
    const ripe = countRipe();

    UI.root.querySelector("#fm-dock").innerHTML = `
      <button type="button" data-act="storage"><span class="fm-dk-ic">${uiIcon("warehouse")}</span><span>倉庫</span></button>
      <button type="button" data-act="kitchen"><span class="fm-dk-ic">${uiIcon("cook")}</span><span>料理</span>${kitchenDone ? `<i class="fm-dot">!</i>` : (cookable && freeStoves() > 0 ? `<i class="fm-dot"></i>` : "")}</button>
      <button type="button" data-act="harvestall"><span class="fm-dk-ic">${uiIcon("harvest")}</span><span>一鍵收成</span>${ripe ? `<i class="fm-dot">${ripe}</i>` : ""}</button>
      <button type="button" data-act="book"><span class="fm-dk-ic">${uiIcon("codex")}</span><span>圖鑑</span>${achClaimable() ? `<i class="fm-dot">${achClaimable()}</i>` : ""}</button>`;

  }

  function countRipe() {
    let n = 0;
    for (const zone of ["field", "herb", "green", "pond"]) {
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
      <pattern id="fmMapleTex" patternUnits="userSpaceOnUse" width="130" height="64"><image href="${IMG}skin/maple_tex.webp" width="130" height="64" preserveAspectRatio="none"/></pattern>
      <pattern id="fmSnowTex" patternUnits="userSpaceOnUse" width="130" height="64"><image href="${IMG}skin/snow_tex.webp" width="130" height="64" preserveAspectRatio="none"/></pattern>
      <pattern id="fmStarTex" patternUnits="userSpaceOnUse" width="72" height="36"><image href="${IMG}skin/star_tex.webp" width="72" height="36" preserveAspectRatio="none"/></pattern>
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

    /* 地面造型：楓葉、雪景 */
    if (S && skinOn("mapleground")) {
      s += `<path d="${grass}" fill="url(#fmMapleTex)" opacity=".34"/>`;
      s += `<path d="${grass}" fill="#f0a24e" opacity=".14"/>`;
      for (let i = 0; i < 70; i++) {
        const x = 120 + (hash("mx" + i) % 1260), y = 330 + (hash("my" + i) % 1000);
        const c = ["#e2552f", "#f08a2a", "#d8402c", "#f4b23c"][i % 4];
        s += `<path transform="translate(${x} ${y}) rotate(${hash("mr" + i) % 360}) scale(.9)" d="M0 -9 L3 -3 L9 -4 L5 1 L7 7 L0 4 L-7 7 L-5 1 L-9 -4 L-3 -3Z" fill="${c}" opacity=".85"/>`;
      }
    } else if (S && skinOn("snowground")) {
      s += `<path d="${grass}" fill="url(#fmSnowTex)" opacity=".85"/>`;
      s += `<path d="${grass}" fill="#ffffff" opacity=".25"/>`;
      for (let i = 0; i < 90; i++) {
        const x = 100 + (hash("sx" + i) % 1300), y = 320 + (hash("sy" + i) % 1020);
        s += `<circle cx="${x}" cy="${y}" r="${2 + (i % 3)}" fill="#fff" opacity=".9"/>`;
      }
    }

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

    /* 招財錦鯉：湖裡游的錦鯉 */
    if (S && skinOn("luckykoi")) {
      if (D.skins.luckykoi.img) s += `<image href="${IMG}${D.skins.luckykoi.img}" x="1046" y="425" width="68" height="80"/>`;
      for (const [x, y, k, r] of [[520, 470, "koi_rw", -20], [860, 492, "koi_gold", 15], [1040, 462, "koi_rw", 160], [700, 445, "koi_gold", 200]]) {
        s += `<image href="${IMG}item/${k}.webp" x="${x - 22}" y="${y - 22}" width="44" height="44" transform="rotate(${r} ${x} ${y})" opacity=".95"/>`;
      }
    }

    /* 木橋（月光橋造型會換掉） */
    const by0 = ly - ry - 18, by1 = ly + ry + 22;
    if (S && skinOn("moonbridge")) {
      s += building("moonbridge", BRIDGE_X, by1 + 6, 210);
    } else {
      s += `<rect x="${BRIDGE_X - 24}" y="${by0}" width="48" height="${by1 - by0}" rx="4" fill="#b98352"/>`;
      for (let y = by0 + 6; y < by1; y += 12) s += `<rect x="${BRIDGE_X - 24}" y="${y}" width="48" height="7" rx="2" fill="#d9a46b"/>`;
      s += `<path d="M${BRIDGE_X - 26} ${by0} V${by1} M${BRIDGE_X + 26} ${by0} V${by1}" stroke="#8a5a37" stroke-width="5" stroke-linecap="round"/>`;
    }

    /* 彩虹瀑布：湖的東邊 */
    if (S && skinOn("rainbowfall")) s += building("rainbowfall", 1268, 545, 150);

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

    s += palm(130, 900, 1.05) + palm(170, 1240, 1) + palm(1420, 1060, 1) + palm(1440, 420, .9) + palm(70, 420, .9);

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
    const [iw, ih] = BLD[key] || [100, 100];
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

    /* 蓮池沒有圖：荷葉＋花苞，成熟時放 emoji */
    if (c.zone === "蓮池") {
      const r0 = moundW / 2;
      let s0 = `<ellipse cx="${x}" cy="${y - 4}" rx="${f1(r0 * 0.8)}" ry="${f1(r0 * 0.34)}" fill="#5fb04a" stroke="#3f8a2c" stroke-width="1.2"/>`;
      s0 += `<path d="M${x} ${y - 4} L${f1(x + r0 * 0.5)} ${f1(y - 10)}" stroke="#3f8a2c" stroke-width="1.2"/>`;
      if (stage === 3) s0 += `<text x="${x}" y="${y - 12}" text-anchor="middle" font-size="${f1(moundW * 0.55)}">🪷</text>`;
      else s0 += `<ellipse cx="${x}" cy="${f1(y - 10 - stage * 4)}" rx="${f1(r0 * 0.16)}" ry="${f1(r0 * 0.26)}" fill="#cfe6ff" stroke="#8fb7e8" stroke-width="1"/>`;
      return s0;
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
    s += `<polygon points="${T} ${R} ${B} ${L}" fill="url(#${STARFIELD_ON ? "fmStarTex" : wet ? "fmSoilWet" : "fmSoil"})" stroke="${sel ? "#ffe066" : (wet ? "#5a3a24" : "#9c693f")}" stroke-width="${sel ? 4 : 1.2}" stroke-linejoin="round"/>`;
    const glow = STARFIELD_ON;
    for (const t of [0.25, 0.5, 0.75]) {
      const a = [L[0] + (B[0] - L[0]) * t, L[1] + (B[1] - L[1]) * t];
      const b = [T[0] + (R[0] - T[0]) * t, T[1] + (R[1] - T[1]) * t];
      s += `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${glow ? "#ffe27a" : (wet ? "#4f3220" : "#8f5d36")}" stroke-width="${glow ? 2.2 : 2.6}" stroke-linecap="round" opacity="${glow ? 0.85 : 0.8}"/>`;
    }
    if (glow) s += `<polygon points="${T} ${R} ${B} ${L}" fill="#fff3a6" opacity=".12"/>`;
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
    if (zone === "pond") {
      s += `<ellipse cx="${x}" cy="${y + 3}" rx="${tw + 5}" ry="${th + 5}" fill="#a39a8a"/><ellipse cx="${x}" cy="${y}" rx="${tw}" ry="${th}" fill="url(#fmLake)" stroke="${sel ? "#ffe066" : "#eaf7ff"}" stroke-width="${sel ? 3.5 : 1.6}"/>`;
    } else {
      s += soilTile(x, y, wet, sel, tw, th, tt);
    }

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
    if (BLD.sprinkler) {
      const w = 46, h = w * BLD.sprinkler[1] / BLD.sprinkler[0];
      return `<image href="${IMG}bld/sprinkler.webp" x="${f1(x - w / 2)}" y="${f1(y + 8 - h)}" width="${w}" height="${f1(h)}"/>`;
    }
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
    pier: [750, 1460, 200],
    well: [360, 1185, 172]
  };

  /* 月光蓮的蓮池（湖的東南邊） */
  const POND = [[1040, 592], [1110, 608], [1180, 624]];

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
      const barnKey = skinOn("harvestbarn") ? "harvestbarn" : skinOn("candybarn") ? "candybarn" : "barn";
      let s = `<g class="tap" data-act="storage" role="button" tabindex="0" aria-label="倉庫 ${invUsed()} / ${storageCap()}">${building(barnKey, x, y, barnKey === "barn" ? w : w * 0.95)}${nameplate(x, y + 16, `倉庫 ${invUsed()}/${storageCap() > 9999 ? "∞" : storageCap()}`)}`;
      if (full) s += mark(x, y - 150, "滿");
      items.push({ y, svg: s + "</g>" });
    }

    /* 料理小屋 → 廚房 → 餐廳 → 星露餐館 */
    {
      const [x, y, w] = POS.kitchen;
      const tier = kitchenTier();
      const done = kitchenStuck();
      const busy = S.kitchen.jobs.length > 0;
      const kKey = skinOn("gingerhouse") ? "gingerhouse" : tier[1];
      let s = `<g class="tap" data-act="kitchen" role="button" tabindex="0" aria-label="${tier[2]}${done ? "，倉庫滿了，料理放不進去" : ""}">${building(kKey, x, y, kKey === "restaurant" ? w * 0.9 : kKey === "gingerhouse" ? w * 0.85 : w)}`;
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
      let s = `<g class="tap" data-act="ranch" role="button" tabindex="0" aria-label="牧場${ready ? "，有東西可以收" : ""}${hungry ? "，動物餓了" : ""}">${building(skinOn("couplets") ? "couplets" : "ranchgate", x, y, skinOn("couplets") ? w * 0.85 : w)}`;
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
      items.push({ y, svg: `<g class="tap" data-act="pier" role="button" tabindex="0" aria-label="碼頭">${building("pier", x, y, w)}${nameplate(x, y - 20, open ? `碼頭・魚餌 ${have("bait")}` : `碼頭 Lv${zoneLv("碼頭")}`)}</g>` });
    }

    /* 許願池 */
    {
      const [x, y, w] = POS.well;
      const st = net.ws;
      const free = !!(st && st.checked && freeLeft() > 0);
      let s = `<g class="tap" data-act="wish" role="button" tabindex="0" aria-label="星願池${free ? "，今天的免費抽還沒用" : ""}">${building("wishwell", x, y, w)}`;
      if (free) s += mark(x, y - 175);
      else if (st && !st.checked) s += mark(x, y - 175, "簽");
      s += nameplate(x, y + 16, "星願池");
      items.push({ y, svg: s + "</g>" });
    }

    pondSvg(items);
    decoSvg(items);
    petsSvg(items);

    /* 招財錦鯉：每天在湖裡撈一次星露 */
    if (skinOn("luckykoi") && dailyReady("koi")) {
      items.push({ y: 500, svg: `<g class="tap" data-act="koi" role="button" tabindex="0" aria-label="招財錦鯉，可以撈星露">${mark(860, 470, "🐟")}<circle cx="860" cy="455" r="26" fill="#fff" fill-opacity="0"/></g>` });
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

  function pondVisible() {
    return own("c_moonlotus") > 0 || have("seed_moonlotus") > 0 || Object.keys(S.pond.plots).length > 0;
  }

  function pondSvg(items) {
    if (!pondVisible()) return;
    POND.forEach(([x, y], i) => items.push({ y, svg: plotSvg("pond", String(i), x, y, 30, 15, 4) }));
    items.push({ y: POND[2][1] + 30, svg: nameplate(POND[1][0], POND[1][1] + 36, "蓮池") });
  }

  function decoArt(k, x, y, slot) {
    const d = D.deco[k];
    const w = d.w;
    let img = d.img, ar = d.ar || 1;
    if (d.eff === "pot") {
      img = ["deco/flowerpot.webp", "item/flowerpot_y.webp", "item/flowerpot_b.webp"][slot % 3];
      if (slot % 3) ar = 1;
    }
    if (img) {
      const h = w * ar;
      return { h, svg: `<image href="${IMG}${img}" x="${f1(x - w / 2)}" y="${f1(y - h)}" width="${w}" height="${f1(h)}"/>` };
    }
    return {
      h: w * 0.7,
      svg: `<ellipse cx="${x}" cy="${y - 2}" rx="${f1(w * 0.36)}" ry="${f1(w * 0.1)}" fill="#000" opacity=".12"/><text x="${x}" y="${y - 6}" text-anchor="middle" font-size="${Math.round(w * 0.55)}">${d.emoji}</text>`
    };
  }

  function decoSvg(items) {
    S.deco.slots.forEach((k, i) => {
      if (!k || !D.deco[k] || i >= DECO_SLOTS.length) return;
      const [x, y] = DECO_SLOTS[i];
      const art = decoArt(k, x, y, i);
      let s = `<g class="tap" data-act="deco" data-slot="${i}" role="button" tabindex="0" aria-label="${esc(D.deco[k].name)}">${art.svg}`;
      if (decoReady(k)) s += mark(x, y - art.h - 8);
      items.push({ y, svg: s + "</g>" });
    });
  }

  function petsSvg(items) {
    for (const [k, p] of Object.entries(D.pets)) {
      if (!own("p_" + k)) continue;
      const [x, y] = p.spot;
      const w = 56;
      const happy = !!(UI.petHappy && UI.petHappy.k === k && now() < UI.petHappy.until);
      let art;
      if (p.img) {
        const h = w * (p.ar || 1);
        const src = happy && p.happy ? p.happy : p.img;
        art = `<image href="${IMG}${src}" x="${x - w / 2}" y="${f1(y - h)}" width="${w}" height="${f1(h)}"/>`;
      } else {
        art = `<circle cx="${x}" cy="${y - 22}" r="23" fill="#fffaf0" stroke="#f3c96b" stroke-width="2.5"/><text x="${x}" y="${y - 12}" text-anchor="middle" font-size="27">${p.emoji}</text>`;
      }
      let s = `<g class="tap" data-act="pet" data-pet="${k}" role="button" tabindex="0" aria-label="${esc(p.name)}"><ellipse cx="${x}" cy="${y}" rx="18" ry="5" fill="#000" opacity=".12"/>${art}`;
      if (happy) s += `<g transform="translate(${x} ${f1(y - w * (p.ar || 1) - 6)})" pointer-events="none"><image class="fm-heart-pop" href="${UI_IMG}heart.webp" x="-14" y="-28" width="28" height="28"/></g>`;
      else if (dailyReady("pet_" + k)) s += `<g transform="translate(${x + 20} ${y - 52})" pointer-events="none"><g class="bob"><circle cx="0" cy="-16" r="15" fill="#fffaf0" stroke="#f3a0a0" stroke-width="1.6"/><image href="${UI_IMG}heart.webp" x="-11" y="-27" width="22" height="22"/></g></g>`;
      items.push({ y, svg: s + "</g>" });
    }
  }

  function workshopArt(x, y) {
    if (BLD.workshop) return building("workshop", x, y, 150);
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
    if (BLD.greenhouse) return building("greenhouse", x, y, 150);
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
    let shed = BLD.mushroomshed
      ? `<g class="tap" data-act="logs" role="button" tabindex="0" aria-label="菇棚">${building("mushroomshed", x - 110, y - 22, 100)}${nameplate(x - 110, y + 2, "菇棚")}</g>`
      : `<g class="tap" data-act="logs" role="button" tabindex="0" aria-label="菇棚">
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
    if (BLD.orchardfence) fence += `<g pointer-events="none">${building("orchardfence", x - 150, y - 6, 92)}</g>`;
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
    if (BLD.bamboo) s += building("bamboo", x, y + 4, 170);
    else {
    s += `<ellipse cx="${x}" cy="${y - 4}" rx="80" ry="20" fill="#3f6b25" opacity=".2"/>`;
    const stalks = [[-50, 110], [-30, 140], [-8, 125], [14, 150], [36, 118], [56, 100]];
    for (const [dx, h] of stalks) {
      s += `<rect x="${x + dx - 5}" y="${y - h}" width="10" height="${h}" rx="4" fill="#7ec25a" stroke="#4f9334" stroke-width="1.5"/>`;
      for (let k = 1; k < h / 28; k++) s += `<rect x="${x + dx - 6}" y="${y - k * 28}" width="12" height="3" rx="1.5" fill="#4f9334"/>`;
      s += `<path d="M${x + dx} ${y - h + 10} q16 -6 26 4 q-14 0 -26 -4Z M${x + dx} ${y - h + 22} q-16 -6 -26 4 q14 0 26 -4Z" fill="url(#fmLeaf)"/>`;
    }
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
    if (BLD.herbgarden) items.push({ y: y - 82, svg: `<g pointer-events="none">${building("herbgarden", x + 128, y - 26, 96)}</g>` });
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
    if (BLD.teagarden) items.push({ y: y - 70, svg: `<g pointer-events="none">${building("teagarden", x + 6, y - 66, 96)}</g>` });
    items.push({ y: y + 10, svg: nameplate(x, y + 26, "茶園") });
  }

  let HITS = [];
  let STARFIELD_ON = false;

  function renderScene() {

    const dyn = UI.root && UI.root.querySelector("#fm-dyn");
    if (!dyn) return;

    STARFIELD_ON = skinOn("starfield");

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
    for (const zone of ["field", "herb", "green", "pond"]) {
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
    for (const j of S.kitchen.jobs) consider(jobInfo(j).nextAt);
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
    book: () => openSheet("book", achClaimable() ? { tab: "ach" } : {}),
    achclaim: el => claimAch([el.dataset.k]),
    achall: () => claimAch(ACH.filter(a => { const st = achState(a); return st.done && !st.claimed; }).map(a => a[0])),
    wish: () => openSheet("wish"),
    ranch: () => openSheet("ranch"),
    green: () => openSheet("green"),
    workshop: () => openSheet("workshop"),

    market: () => {
      if (!zoneUnlocked("市集")) return toast(`市集 Lv${zoneLv("市集")} 開放`);
      openSheet("market");
    },

    pier: () => zoneUnlocked("碼頭") ? openSheet("pier") : toast(`碼頭 Lv${zoneLv("碼頭")} 開放，可以釣魚`),
    fish: el => fishCast(Number(el.dataset.n) || 1),
    rodbuy: el => {
      const msg = buyRod(el.dataset.k);
      toast(msg === "ok" ? `🎣 買了${D.rods[el.dataset.k].name}` : msg);
      after();
    },
    rodset: el => { if (S.fish.rods[el.dataset.k]) { S.fish.rod = el.dataset.k; after(); } },

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
        floatAt(el, `+${res.qty} ${itemIconInline(res.crop)} <small>+${res.exp} EXP</small>${res.seedBack ? " 🌰" : ""}${res.fox ? " 🦊" : ""}${res.x2 ? " ×2" : ""}`);
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
      const k = el.dataset.dish;
      const n = Math.max(1, Math.min(UI.cookQty || 1, cookableCount(k)));
      const res = cookDish(k, n);
      if (res !== "ok") return toast(res);
      toast(`🍳 開始做「${D.dishes[k].name}」×${n}，做好會自動放進倉庫`);
      UI.cookQty = 1;
      after();
    },

    pickdish: el => {
      UI.kitchenPick = el.dataset.dish;
      UI.cookQty = 1;
      renderSheet();
    },

    cookqty: el => {
      const k = UI.kitchenPick;
      const max = Math.max(1, k ? cookableCount(k) : 1);
      const v = el.dataset.v;
      let q = UI.cookQty || 1;
      if (v === "max") q = max;
      else q = q + Number(v);
      UI.cookQty = Math.max(1, Math.min(max, q));
      renderSheet();
    },

    ordersubmit: el => { submitOrder(Number(el.dataset.i)); },

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
      const m = el.dataset.m;
      const out = collectMachine(m);
      if (!out) {
        const q = machineQueue(m);
        if (q.length && now() >= q[0].t1) return toast(`倉庫快滿了（${invUsed()}/${storageCap()}），先賣掉或用掉一些東西再收`);
        return toast("還沒做好");
      }
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
      let gold = 0;
      for (const a of S.ranch.animals) {
        const res = collectAnimal(a);
        if (res) { n++; exp += res.exp; if (res.item === "goldegg") gold++; }
      }
      const feedOut = collectMachine("feedmill");
      const feedN = feedOut ? feedOut.length : 0;
      if (gold) toast(`🥚✨ 金雞生了 ${gold} 顆金蛋！`);
      if (!n && !feedN) return toast(invSpace() < 1 ? "倉庫滿了" : "現在沒有可以收的");
      toast([n ? `🧺 收了 ${n} 個畜產品，+${exp} EXP` : "", feedN ? `飼料機收了 ${feedN} 批` : ""].filter(Boolean).join("・"));
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

    draw: el => doDraw(el.dataset.pool, Number(el.dataset.n || 1)),
    shopbuy: el => doBuy(el.dataset.item),
    checkin: () => doCheckin(),
    observe: () => doObserve(),
    makeup: el => doMakeup(el.dataset.date),
    loadmissed: () => loadMissedDays(),
    secret: el => learnSecret(el.dataset.dish),
    picktier: el => { UI.pickTier = el.dataset.tier; renderSheet(); },
    useitem: el => useItem(el.dataset.item),
    pet: el => petGift(el.dataset.pet),
    deco: el => { const k = S.deco.slots[Number(el.dataset.slot)]; if (k) decoTap(k); },
    koi: el => {
      if (!skinOn("luckykoi") || !dailyReady("koi")) return;
      dailyDone("koi");
      const n = 100 + Math.floor(Math.random() * 201);
      addDew(n);
      floatAt(el, `+${n} ${ICON.dew}`);
      toast(`🐟 招財錦鯉：撈到 ${n} 星露`);
      after();
    },
    placedeco: el => {
      const k = el.dataset.deco;
      if (decoPlaced(k) >= decoOwned(k)) return toast("都擺上去了");
      if (!autoPlace(k)) return toast("島上的擺放位置滿了，先收起一個");
      toast(`🪑 ${D.deco[k].name}擺上島了`);
      after();
    },
    removedeco: el => {
      const k = el.dataset.deco;
      const i = S.deco.slots.lastIndexOf(k);
      if (i >= 0) S.deco.slots[i] = null;
      after();
    },
    skin: el => {
      const k = el.dataset.skin;
      const sk = D.skins[k];
      if (!sk || !own("s_" + k)) return;
      if (S.skins[sk.group] === k) delete S.skins[sk.group];
      else S.skins[sk.group] = k;
      rebuildStatic();
      after();
    },
    title: el => {
      const k = el.dataset.title || null;
      S.titleKey = k && own("t_" + k) ? k : null;
      after();
    },
    timeglass: () => {
      if (!own("tool_timeglass")) return;
      if (S.glassDay === todayKey()) return toast("時光沙漏今天用過了，明天再來");
      openModal("pickzone", { use: "timeglass" });
    },

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
    for (const zone of ["field", "herb", "green", "pond"]) {
      const z = plotZone(zone);
      for (const key of z.keys) {
        if (plotState(z.store[key]) !== "ripe") continue;
        const res = harvestOne(zone, key);
        if (res) { count++; exp += res.exp; } else full = true;
      }
    }
    if (S.lv >= D.caps.orchardAll || own("tool_goldsickle")) {
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
        opts = popOpt("remove", uiIcon("pack"), "收起來");
      } else {
        const c = D.crops[p.c];
        title = c.name;
        sub = st === "thirsty" ? "口渴了，澆水才會開始長" : `還要 <span data-until="${p.t1}">${dur(p.t1 - now())}</span>`;
        opts = popOpt("water", ICON.drop, `澆水`, st !== "thirsty" || !hasWater()) +
          popOpt("waterall", uiIcon("waterall"), "全部澆水", !hasWater() || !anyThirsty()) +
          popOpt("fert", "🧪", `施肥 ${have("fert")}`, st !== "growing" || p.f || have("fert") <= 0) +
          popOpt("remove", uiIcon("shovel"), "剷掉");
      }
    } else if (info.type === "tree") {
      const tr = S.orchard.trees[info.key];
      if (!tr) { closePop(); return; }
      const st = treeState(tr);
      title = `${D.crops[tr.c].name}樹`;
      sub = st === "growing" ? `樹苗長大還要 <span data-until="${tr.grown}">${dur(tr.grown - now())}</span>` : `下次結果 <span data-until="${tr.next}">${dur(tr.next - now())}</span>`;
      opts = popOpt("removetree", uiIcon("chop"), "砍掉");
    } else if (info.type === "log") {
      const l = S.logs.slots[info.key];
      if (!l) { closePop(); return; }
      title = `${D.crops[l.c].name}菇木`;
      sub = `下次可採 <span data-until="${l.next}">${dur(l.next - now())}</span>・還能採 ${l.left} 次`;
      opts = popOpt("removelog", uiIcon("shovel"), "移走");
    } else if (info.type === "tea") {
      const b = S.tea.bushes[info.key];
      if (!b) { closePop(); return; }
      const st = teaState(b);
      title = "茶樹";
      sub = st === "growing" ? `茶苗長大還要 <span data-until="${b.grown}">${dur(b.grown - now())}</span>` : `下次採茶 <span data-until="${b.next}">${dur(b.next - now())}</span>`;
      opts = popOpt("removetea", uiIcon("chop"), "移走");
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
    UI.fishResult = null;
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
    if (t.name === "wish" && (t.tab || "draw") === "bag" && UI.missed === undefined && net.wishReady) loadMissedDays();
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
    return `<span class="fm-tag ${rarity}">${RARITY_BADGE[rarity] ? uiIcon(RARITY_BADGE[rarity], "fm-badge") : ""}${RARITY_NAME[rarity]}</span>`;
  }

  /* 料理的廚房分級（家常／拿手／招牌／傳說），跟品階顏色分開 */
  function kitchenTag(d) {
    return `<span class="fm-tag gray">${d.tier}</span>`;
  }

  const SHEETS = {

    /* ---------- 選種子 ---------- */
    seeds(t) {

      const zone = t.zone;
      let cropZone, title, emptyCount = 0;

      if (zone === "orchard") { cropZone = "果園"; title = "種果樹"; }
      else if (zone === "pond") { cropZone = "蓮池"; title = "蓮池・選種子"; emptyCount = plotZone("pond").keys.filter(k => !S.pond.plots[k]).length; }
      else if (zone === "logs") { cropZone = "菇棚"; title = "放菇木"; }
      else if (zone !== "pond") {
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
        const seeds = gacha ? have("seed_" + k) : 0;
        const cost = gacha ? (cropUnlocked(k) ? (c.seed || 0) : Infinity) : (c.seed || 0);
        const afford = seeds > 0 || S.dew >= cost;
        const price = seeds > 0 ? (zone === "orchard" ? `樹苗 ${seeds} 棵` : `種子 ${seeds} 顆`) : `${zone === "orchard" ? "樹苗" : zone === "logs" ? "菇木" : "種子"} ${num(cost)} 星露`;
        let sub;
        if (zone === "orchard") sub = `${price}・明天長大，之後每 ${hoursText(c.hours)}結 ${c.qty} 個`;
        else if (zone === "logs") sub = `${price}・每 ${hoursText(c.hours)}採 ${c.qty} 朵，可採 4 次`;
        else sub = `${hoursText(c.hours)}・${price}・收成 ${c.sell} 星露、${c.exp} EXP`;
        const byDew = !isFinite(cost) ? 0 : cost > 0 ? Math.floor(S.dew / cost) : emptyCount;
        const maxN = Math.min(emptyCount, seeds + byDew);
        const btns = `<button type="button" class="fm-btn small green" data-act="plant" data-crop="${k}" ${afford ? "" : "disabled"}>種這格</button>` +
          (emptyCount > 1 && maxN > 1 ? `<button type="button" class="fm-btn small" data-act="plant" data-crop="${k}" data-all="1">種 ${maxN} 格</button>` : "");
        return `<div class="fm-row ${rarityClass(k)}">
          <div class="fm-row-art">${c.icon ? `<img src="${IMG}crop/${k}_i.webp" alt="">` : `<span class="fm-emo">${c.emoji}</span>`}</div>
          <div><div class="fm-row-name">${esc(zone === "orchard" && c.treeName ? c.treeName : c.name)}${tagHtml(c.rarity)}</div><div class="fm-row-sub">${sub}</div></div>
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
        if (cap > placed) extra = `<div class="fm-row r-r"><div class="fm-row-art">${BLD.sprinkler ? `<img src="${IMG}bld/sprinkler.webp" alt="">` : "💦"}</div><div><div class="fm-row-name">灑水器</div><div class="fm-row-sub">放在這格，旁邊 8 格種下去不用澆水（還能放 ${cap - placed} 台）</div></div><div class="fm-row-btns"><button type="button" class="fm-btn small blue" data-act="sprinkler">放這裡</button></div></div>`;
      }

      const water = (zone === "field" || zone === "herb")
        ? `<div class="fm-note" style="margin:0 4px 8px">💧 水 <b>${S.water}</b> 滴・每種一格用 1 滴${isRainDay() ? "（今天下雨不用水）" : ""}</div>` : "";

      return sheetTop(title, `🌟 ${num(S.dew)}`) + `<div class="fm-panel">${water}<div class="fm-list">${extra}${rows || `<div class="fm-empty">還沒有可以種的</div>`}${lockedRows}</div></div>`;

    },

    /* ---------- 倉庫 ---------- */
    storage(t) {

      const tab = t.tab || "crop";
      const kinds = { crop: ["crop"], animal: ["animal", "meat"], goods: ["goods"], dish: ["dish"], fish: ["fish"], other: ["tool", "seed", "use"] };
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
        const it = D.items[k] || {};
        if (it.kind === "use") {
          detail = `<div class="fm-row ${rarityClass(k)}" style="margin-top:10px"><div class="fm-row-art">${itemIcon(k)}</div>
            <div><div class="fm-row-name">${esc(itemName(k))} ×${have(k)}</div><div class="fm-row-sub">${esc(it.desc || "")}</div></div>
            <div class="fm-row-btns"><button type="button" class="fm-btn small green" data-act="useitem" data-item="${k}">使用</button></div></div>`;
        } else if (it.kind === "seed") {
          const c = D.crops[it.crop];
          detail = `<div class="fm-row ${rarityClass(k)}" style="margin-top:10px"><div class="fm-row-art">${itemIcon(k)}</div>
            <div><div class="fm-row-name">${esc(itemName(k))} ×${have(k)}</div><div class="fm-row-sub">${c ? `種在${c.zone}，${hoursText(c.hours)}收成` : ""}</div></div><div></div></div>`;
        } else {
        detail = `<div class="fm-row" style="margin-top:10px"><div class="fm-row-art ${rarityClass(k)}">${itemIcon(k)}</div>
          <div><div class="fm-row-name">${esc(itemName(k))} ×${have(k)}</div><div class="fm-row-sub">${market ? (price ? `市集收購 ${price} 星露一個` : "不能賣") : `市集 Lv${zoneLv("市集")} 開放後可以賣`}</div></div>
          <div class="fm-row-btns">${market && price ? `<button type="button" class="fm-btn small" data-act="sell" data-item="${k}" data-qty="1">賣 1 個</button><button type="button" class="fm-btn small" data-act="sell" data-item="${k}" data-qty="all">全部賣 ${num(price * have(k))}</button>` : ""}</div></div>`;
        }
      }

      return sheetTop("倉庫", `${used} / ${cap > 9999 ? "∞" : cap}`) +
        tabs([["crop", "作物"], ["animal", "畜產"], ["goods", "加工"], ["dish", "料理"], ["fish", "魚"], ["other", "其他"]], tab) +
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
          const f = jobInfo(job);
          const stuck = f.ready > f.got;
          stoves += `<div class="fm-stove ${stuck ? "stuck" : ""}">${itemIcon(job.d)}<span>${esc(D.dishes[job.d].name)} ×${f.n}</span>
            <span class="t">${stuck ? "倉庫滿了，空出位子就放進去" : `已做好 ${f.got}/${f.n}・下一份 <span data-until="${f.nextAt}">${dur(f.nextAt - now())}</span>`}</span>
            <div class="fm-stove-bar"><i style="width:${(f.got / f.n) * 100}%"></i></div></div>`;
        }
      }

      const known = Object.keys(D.dishes).filter(dishKnown);
      const order = known.slice().sort((a, b) => (D.dishes[b].sell || 0) - (D.dishes[a].sell || 0));
      const canNow = known.filter(k => hasAll(D.dishes[k].need));
      const pick = UI.kitchenPick && dishKnown(UI.kitchenPick) ? UI.kitchenPick : (canNow[0] || known[known.length - 1]);

      let feature = "";
      if (pick) {
        const d = D.dishes[pick];
        const ok = hasAll(d.need);
        const maxQ = Math.max(1, cookableCount(pick));
        const q = Math.max(1, Math.min(UI.cookQty || 1, maxQ));
        const qtyRow = ok ? `<div class="fm-qty"><button type="button" class="fm-btn small" data-act="cookqty" data-v="-1" ${q <= 1 ? "disabled" : ""}>－</button>
            <span class="fm-qty-n">${q} 份</span>
            <button type="button" class="fm-btn small" data-act="cookqty" data-v="1" ${q >= maxQ ? "disabled" : ""}>＋</button>
            <button type="button" class="fm-btn small" data-act="cookqty" data-v="max" ${q >= maxQ ? "disabled" : ""}>最多 ${maxQ}</button></div>
            <div class="fm-row-sub" style="margin-top:4px">共 ${dur(q * dishMinutes(d) * MIN)}・做好一份就自動放進倉庫</div>` : "";
        feature = `<div class="fm-panel" style="text-align:center">
          <div style="display:flex;align-items:center;gap:12px;text-align:left">
            <div class="fm-row-art ${rarityClass(pick)}" style="width:96px;height:96px">${itemIcon(pick)}</div>
            <div style="flex:1;min-width:0"><div class="fm-row-name" style="font-size:19px">${esc(d.name)}${tagHtml(D.items[pick].tier)}${kitchenTag(d)}</div>
            ${ingsHtml(d.need, q)}
            <div class="fm-row-sub">⏱ 每份 ${dishMinutes(d)} 分鐘・賣 ${num(d.sell)} 星露・${d.exp} EXP</div></div></div>
          ${qtyRow}
          <div style="margin-top:10px"><button type="button" class="fm-btn green" data-act="cook" data-dish="${pick}" ${ok && freeStoves() > 0 ? "" : "disabled"}>${freeStoves() > 0 ? (ok ? `開始做 ${q} 份` : "食材不夠") : "爐子都在用"}</button></div></div>`;
      }

      const cards = order.map(k => {
        const d = D.dishes[k];
        const ok = hasAll(d.need);
        return `<button type="button" class="fm-card ${rarityClass(k)}" data-act="pickdish" data-dish="${k}" aria-pressed="${k === pick}">
          ${S.known.dishes[k] ? `<span class="fm-card-n">${S.known.dishes[k]}</span>` : ""}<div class="fm-card-art" style="${ok ? "" : "opacity:.55"}">${itemIcon(k)}</div><div class="fm-card-name ol">${esc(d.name)}</div></button>`;
      }).join("");

      const upcoming = Object.entries(D.dishes).filter(([k, d]) => !d.gacha && d.lv > S.lv).slice(0, 3)
        .map(([k, d]) => `<span class="fm-tag gray">${esc(d.name)} Lv${d.lv}</span>`).join(" ");

      let orders = "";
      if (S.orders && S.orders.list.length) {
        orders = `<div class="fm-panel"><div class="fm-sec ol">今日客人點餐</div><div class="fm-list">${S.orders.list.map((o, i) => {
          const d = D.dishes[o.d];
          return `<div class="fm-row ${rarityClass(o.d)}"><div class="fm-row-art">${itemIcon(o.d)}</div><div><div class="fm-row-name">${esc(d.name)}</div>
            <div class="fm-row-sub">付 ${num(Math.round(d.sell * 1.5))} 星露・+10 EXP・倉庫有 ${have(o.d)} 份</div></div>
            <div class="fm-row-btns">${o.done ? "✅" : `<button type="button" class="fm-btn small" data-act="serve" data-i="${i}" ${have(o.d) ? "" : "disabled"}>上菜</button>`}</div></div>`;
        }).join("")}</div></div>`;
      }

      const ord = fillOrders();
      const ordRows = ord.slots.map((slot, i) => {
        if (slot.done) return `<div class="fm-row"><div class="fm-row-art">✅</div><div><div class="fm-row-name">訂單 ${i + 1} 已完成</div><div class="fm-row-sub">明天會有新訂單</div></div></div>`;
        if (!slot.d) return `<div class="fm-row"><div class="fm-row-art">📋</div><div><div class="fm-row-name">訂單 ${i + 1}</div><div class="fm-row-sub">現有食材做不出可以接的料理，先去備料吧</div></div></div>`;
        const d = D.dishes[slot.d];
        return `<div class="fm-row ${rarityClass(slot.d)}"><div class="fm-row-art">${itemIcon(slot.d)}</div><div><div class="fm-row-name">${esc(d.name)}</div>
          <div class="fm-row-sub">交單隨機獲得星屑、星願券或召喚券・+10 EXP・倉庫有 ${have(slot.d)} 份</div></div>
          <div class="fm-row-btns"><button type="button" class="fm-btn small" data-act="ordersubmit" data-i="${i}" ${have(slot.d) ? "" : "disabled"}>繳交</button></div></div>`;
      }).join("");
      const orderPanel = `<div class="fm-panel"><div class="fm-sec ol">📋 訂單任務</div><div class="fm-list">${ordRows}</div></div>`;

      const up = next ? (S.lv >= next[0]
        ? `<button type="button" class="fm-btn small" data-act="upgradekitchen">⬆ 升級成${next[2]}</button>`
        : `<span class="fm-note">Lv${next[0]} 可以升級成${next[2]}</span>`) : "";

      return sheetTop(tier[2], up) +
        `<div class="fm-panel"><div class="fm-stoves" style="grid-template-columns:repeat(${Math.max(2, n)},minmax(0,1fr))">${stoves}</div></div>
        ${feature}${orders}
        <div class="fm-panel"><div class="fm-sec ol">食譜 ${known.length}</div><div class="fm-grid">${cards}</div>
        ${upcoming ? `<p class="fm-note" style="margin-top:10px">之後會學到：${upcoming}</p>` : ""}</div>
        ${orderPanel}`;

    },

    /* ---------- 市集 ---------- */
    market(t) {

      const tab = t.tab || "buy";

      if (tab === "sell") {
        const keys = Object.keys(S.inv).filter(k => have(k) > 0 && sellPrice(k) > 0);
        const rows = tierGroups(keys.map(k => ({ t: tierOfKey(k), h: `<div class="fm-row ${rarityClass(k)}"><div class="fm-row-art">${itemIcon(k)}</div>
          <div><div class="fm-row-name">${esc(itemName(k))} ×${have(k)}</div><div class="fm-row-sub">一個 ${sellPrice(k)} 星露</div></div>
          <div class="fm-row-btns"><button type="button" class="fm-btn small" data-act="sell" data-item="${k}" data-qty="1">賣 1</button>
          <button type="button" class="fm-btn small" data-act="sell" data-item="${k}" data-qty="all">全部 ${num(sellPrice(k) * have(k))}</button></div></div>` })), null);
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

    /* ---------- 碼頭：釣魚 ---------- */
    pier(t) {

      const tab = t.tab || "fish";
      const bait = have("bait");
      const rod = rodNow();
      const tierName = k => D.fishTiers[k].name;
      let body = "";

      if (tab === "fish") {
        const res = UI.fishResult || [];
        const resHtml = res.length ? `<div class="fm-fishres">${res.map(({ k, isNew }) => {
          const f = D.fish[k];
          return `<div class="fm-card r-${f.tier}"><div class="fm-card-art">${itemIcon(k)}</div><div class="fm-card-name ol">${esc(f.name)}</div>
            <div class="fm-fish-tier">${tierName(f.tier)}${isNew ? "・新！" : ""}</div></div>`;
        }).join("")}</div>${res.length === 1 ? `<p class="fm-note" style="text-align:center;margin:6px 0 0">${esc(D.fish[res[0].k].desc)}・賣 ${D.items[res[0].k].sell} 星露</p>` : ""}` : `<div class="fm-empty">點下面的按鈕，用 1 個魚餌釣一次</div>`;
        const rates = rodRates().map((r, i) => `<span class="fm-tag r-${FISH_TIERS[i]}">${tierName(FISH_TIERS[i])} ${r}%</span>`).join(" ");
        body = `<div class="fm-panel">${resHtml}
          <div class="fm-fish-btns">
            <button type="button" class="fm-btn green" data-act="fish" data-n="1" ${bait ? "" : "disabled"}>${uiIcon("fish_cast", "fm-btn-ic")}釣一次</button>
            <button type="button" class="fm-btn" data-act="fish" data-n="5" ${bait >= 2 ? "" : "disabled"}>釣 ${Math.min(5, Math.max(1, bait))} 次</button>
          </div>
          <p class="fm-note" style="margin:8px 0 4px">${rod.emoji} 現在用 <b>${esc(rod.name)}</b>：</p><div>${rates}</div>
          ${bait ? "" : `<p class="fm-note" style="margin-top:8px">魚餌在牧場的「魚餌線」做：2 飼料＋1 小麥，10 分鐘 5 個，最多排 5 輪，做好自動收。</p>`}</div>`;
      } else if (tab === "dex") {
        const caught = S.fish.caught;
        const n = Object.keys(D.fish).filter(k => caught[k]).length;
        const groups = FISH_TIERS.map(tr => {
          const cards = Object.keys(D.fish).filter(k => D.fish[k].tier === tr).map(k => {
            const f = D.fish[k], c = caught[k] || 0;
            return `<div class="fm-card r-${tr}" title="${c ? esc(f.desc) : ""}">${c ? `<span class="fm-card-n">${c}</span>` : ""}<div class="fm-card-art" style="${c ? "" : "filter:brightness(0) opacity(.35)"}">${itemIcon(k)}</div>
              <div class="fm-card-name ol">${c ? esc(f.name) : "？？？"}</div>${c ? `<div class="fm-fish-tier">${esc(D.dishes[f.dish].name)}</div>` : ""}</div>`;
          }).join("");
          return `<h3 class="ol fm-fish-h">${tierName(tr)}</h3><div class="fm-grid">${cards}</div>`;
        }).join("");
        body = `<div class="fm-panel"><div class="fm-bar" style="margin-bottom:6px"><i style="width:${n * 2}%"></i></div>
          <p class="fm-note" style="margin:0 0 6px">已經釣過 ${n} / 50 種，一共釣了 ${num(S.fish.total || 0)} 次。釣到新的魚，廚房就會多一道魚料理。</p>${groups}</div>`;
      } else {
        checkRodUnlocks();
        const effectText = { rain: "雨天時稀有魚機率提高", night: "晚上釣魚有機會多一條", mirror: "史詩魚機率明顯提高", double: "一次拉兩條魚（扣兩個魚餌）", pity: "連續 30 次沒有稀有魚，下一次一定是稀有以上", dragon: "傳說魚機率提高" };
        const rows = Object.entries(D.rods).map(([k, r]) => {
          const mine = !!S.fish.rods[k], using = S.fish.rod === k;
          let btn;
          if (using) btn = `<span class="fm-tag">使用中</span>`;
          else if (mine) btn = `<button type="button" class="fm-btn small" data-act="rodset" data-k="${k}">換上</button>`;
          else if (r.cond) btn = `<span class="fm-tag gray">未解鎖</span>`;
          else btn = `<button type="button" class="fm-btn small green" data-act="rodbuy" data-k="${k}" ${S.lv >= r.lv && S.dew >= r.price ? "" : "disabled"}>${S.lv >= r.lv ? `🌟 ${num(r.price)}` : `Lv${r.lv}`}</button>`;
          const sub = r.cond
            ? `<div class="fm-row-sub">${effectText[r.effect]}</div><div class="fm-row-sub">解鎖：${esc(r.cond)}</div>`
            : `<div class="fm-row-sub">${r.rate.map((x, i) => `${tierName(FISH_TIERS[i])} ${x}%`).join("・")}</div>`;
          return `<div class="fm-row ${mine || !r.cond ? "" : "fm-locked"}"><div class="fm-row-art">${r.img ? `<img src="${IMG}${r.img}" alt="">` : `<span class="fm-emo">${r.emoji}</span>`}</div>
            <div><div class="fm-row-name">${esc(r.name)}</div>${sub}</div>
            <div class="fm-row-btns">${btn}</div></div>`;
        }).join("");
        body = `<div class="fm-panel"><p class="fm-note" style="margin:0 0 8px">基本釣竿可以買，特殊釣竿要靠條件解鎖。買過或解鎖過的釣竿可以隨時換。傳說紀錄：${S.fish.legends || 0} 次</p><div class="fm-list">${rows}</div></div>`;
      }

      return sheetTop("碼頭", `${miniIcon("bait", "🪱")} ${bait}`) + tabs([["fish", "釣魚"], ["dex", "魚類圖鑑"], ["rod", "釣竿"]], tab) + body;

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

      const feedRow = `<div class="fm-pen"><div class="fm-pen-head"><h3 class="ol" style="--olc:#4f8f35">${miniIcon("feed", "🌾")} 飼料 ${have("feed")}</h3>
        <button type="button" class="fm-btn small green" data-act="feedall">${uiIcon("feedbowl", "fm-btn-ic")}全部餵食</button>
        <button type="button" class="fm-btn small" data-act="collectall">${uiIcon("harvest", "fm-btn-ic")}全部收成</button></div>
        <p class="fm-note" style="margin:0">動物每次產出前要吃飼料；幼崽吃飽才會長大。${S.lv >= D.caps.autoFeed ? "自動餵食器運作中。" : `Lv${D.caps.autoFeed} 開自動餵食器。`}</p></div>`;

      const mill = machineHtml("feedmill", true) + machineHtml("baitline", true);

      let inc = "";
      if (S.lv >= D.zones["孵蛋器"].lv) {
        const slots = [];
        for (let i = 0; i < D.caps.incubator; i++) {
          const slot = S.ranch.inc[i];
          if (!slot) { slots.push(`<div class="fm-stove free">${uiIcon("nest", "fm-emo-img")}<span>空的</span></div>`); continue; }
          const sp = EGG_SPECIES[slot.egg];
          const done = now() >= slot.t1;
          slots.push(`<div class="fm-stove">${itemIcon(slot.egg)}<span>${esc(D.animals[sp].baby)}</span><span class="t">${done ? "住處滿了，空出位子就孵出來" : `<span data-until="${slot.t1}">${dur(slot.t1 - now())}</span>`}</span></div>`);
        }
        const eggs = Object.keys(EGG_SPECIES).filter(e => S.lv >= D.animals[EGG_SPECIES[e]].lv);
        const btns = eggs.map(e => `<button type="button" class="fm-btn small" data-act="incubate" data-egg="${e}" ${have(e) && S.ranch.inc.length < D.caps.incubator ? "" : "disabled"}>放${esc(itemName(e))}（${have(e)}）</button>`).join(" ");
        inc = `<div class="fm-pen"><div class="fm-pen-head"><h3 class="ol" style="--olc:#a8641e"><img class="fm-house" src="${IMG}bld/incubator.webp" alt=""> 孵蛋器</h3></div>
          <div class="fm-stoves" style="grid-template-columns:repeat(2,minmax(0,1fr))">${slots.join("")}</div><div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${btns}</div></div>`;
      }

      const pens = Object.entries(D.animals).filter(([sp, a]) => (sp !== "deer" && !a.gacha) || animalsOf(sp).length).map(([sp, info]) => {
        if (S.lv < info.lv) return null;
        const list = animalsOf(sp);
        const cap = animalCap(sp);
        const tiles = list.map(a => animalTile(a)).join("");
        const canBuy = list.length < cap && (info.babyPrice || info.adultPrice);
        const empty = canBuy ? `<button type="button" class="fm-animal empty" data-act="buyanimal" data-sp="${sp}" aria-label="買${info.name}">＋</button>` : "";
        const breedTxt = info.breed === "pair"
          ? (S.ranch.breed[sp] ? `下一隻寶寶 <span data-until="${S.ranch.breed[sp]}">${dur(S.ranch.breed[sp] - now())}</span>` : "2 隻成年的放一起會生寶寶")
          : info.breed === "egg" ? "蛋放進孵蛋器會孵出寶寶" : "";
        return `<div class="fm-pen"><div class="fm-pen-head"><h3 class="ol" style="--olc:#6a4220">${houseIcon(sp)} ${esc(info.house)}</h3><span class="fm-note">${list.length}/${cap}</span></div>
          <div class="fm-animals">${tiles}${empty}</div>${breedTxt ? `<p class="fm-note" style="margin:6px 0 0">${breedTxt}</p>` : ""}</div>`;
      }).filter(Boolean).join("");

      const nextAnimal = Object.values(D.animals).find(a => a.lv > S.lv && a.lv < 50);
      const tease = nextAnimal ? `<p class="fm-note" style="margin:0 14px 16px;text-align:center">下一種動物：${nextAnimal.emoji} ${esc(nextAnimal.name)}（Lv${nextAnimal.lv}）</p>` : "";

      return sheetTop("牧場", `${miniIcon("feed", "🌾")} ${have("feed")}・📦 ${invUsed()}/${storageCap() > 9999 ? "∞" : storageCap()}`) + feedRow + mill + inc + pens + tease;

    },

    /* ---------- 圖鑑 ---------- */
    book(t) {

      const tab = t.tab || "crop";
      let got = 0, total = 0;
      const cardList = [];

      if (tab === "ach") {
        const done = ACH.filter(a => net.ach.claimed.has(a[0])).length;
        const ready = ACH.filter(a => { const st = achState(a); return st.done && !st.claimed; });
        let note = "";
        if (net.mode !== "server") note = `<p class="fm-note">成就要登入、連上資料庫才能領。</p>`;
        else if (net.ach.ready === false) note = `<p class="fm-note">⚠️ 成就的資料庫設定還沒完成：到 Supabase 的 SQL Editor 執行 <b>sql/2026-10-18_成就.sql</b>，重新整理網頁之後就能領。</p>`;
        const rank = a => { const st = achState(a); return st.claimed ? 2 : st.done ? 0 : 1; };
        const rows = ACH.slice().sort((x, y) => rank(x) - rank(y)).map(a => {
          const [k, name, desc, dust] = a;
          const st = achState(a);
          const btn = st.claimed ? `<span class="fm-ach-ok">已領</span>`
            : `<button type="button" class="fm-btn small ${st.done ? "green" : ""}" data-act="achclaim" data-k="${k}" ${st.done && net.ach.ready ? "" : "disabled"}><img src="${IMG}item/stardust.webp" alt="">${dust}</button>`;
          return `<div class="fm-row fm-ach ${st.claimed ? "claimed" : st.done ? "ready" : ""}"><div class="fm-row-art">${uiIcon(st.claimed || st.done ? "complete" : "codex")}</div>
            <div style="min-width:0"><div class="fm-row-name">${esc(name)}</div><div class="fm-row-sub">${esc(desc)}</div>
            <div class="fm-ach-bar"><i style="width:${(st.cur / st.n) * 100}%"></i><span>${num(st.cur)} / ${num(st.n)}</span></div></div>
            <div class="fm-row-btns">${btn}</div></div>`;
        }).join("");
        return sheetTop("圖鑑", `🏆 ${done} / ${ACH.length}`) + tabs([["crop", "作物"], ["dish", "料理"], ["animal", "動物"], ["ach", "成就"]], tab) +
          `<div class="fm-panel">${note}${ready.length > 1 && net.ach.ready ? `<button type="button" class="fm-btn green" style="width:100%;margin-bottom:10px" data-act="achall">全部領取（${ready.length} 個，星屑 ${ready.reduce((s, a) => s + a[3], 0)}）</button>` : ""}<div class="fm-list">${rows}</div></div>`;
      }

      if (tab === "crop") {
        for (const [k, c] of Object.entries(D.crops)) {
          total++;
          const n = S.known.crops[k] || 0;
          if (n) got++;
          cardList.push({ t: c.rarity || "c", h: `<div class="fm-card ${rarityClass(k)} ${n ? "" : "locked"}">${n ? `<span class="fm-card-n">${n}</span>` : ""}
            <div class="fm-card-art">${c.icon ? `<img src="${IMG}crop/${k}_i.webp" alt="">` : `<span class="fm-emo">${c.emoji}</span>`}</div>
            <div class="fm-card-name ol">${n ? esc(c.name) : (c.lv ? `Lv${c.lv}` : "星願池")}</div></div>` });
        }
      } else if (tab === "dish") {
        for (const [k, d] of Object.entries(D.dishes)) {
          total++;
          const n = S.known.dishes[k] || 0;
          if (n) got++;
          cardList.push({ t: tierOfKey(k), h: `<div class="fm-card ${rarityClass(k)} ${n ? "" : "locked"}">${n ? `<span class="fm-card-n">${n}</span>` : ""}
            <div class="fm-card-art">${itemIcon(k)}</div><div class="fm-card-name ol">${n || dishKnown(k) ? esc(d.name) : (d.fish ? "釣魚" : d.gacha ? "星願池" : `Lv${d.lv}`)}</div></div>` });
        }
      } else {
        for (const [sp, a] of Object.entries(D.animals)) {
          total++;
          const n = S.known.animals[sp] || 0;
          if (n) got++;
          cardList.push({ t: a.tier || "c", h: `<div class="fm-card r-${a.tier || "c"} ${n ? "" : "locked"}"><div class="fm-card-art">${animalIcon(sp, true)}</div><div class="fm-card-name ol">${n ? esc(a.name) : (a.gacha ? "星願池" : `Lv${a.lv}`)}</div></div>` });
        }
      }

      const cards = tierGroups(cardList);
      return sheetTop("圖鑑", `${got} / ${total}`) + tabs([["crop", "作物"], ["dish", "料理"], ["animal", "動物"], ["ach", "成就"]], tab) +
        `<div class="fm-panel"><div class="fm-bar" style="margin-bottom:10px"><i style="width:${(got / total) * 100}%"></i></div><div class="fm-grid">${cards}</div></div>`;

    },

    /* ---------- 星願池 ---------- */
    wish(t) {

      const tab = t.tab || "draw";
      const st = net.ws;
      const head = sheetTop("星願池", `<span class="fm-dust"><img src="${IMG}item/stardust.webp" alt="">${num(stardust())}</span>`);

      if (net.mode !== "server" || !net.wishReady || !st) {
        const bottles = Object.keys(WISH_NAMES).map(k => `<div class="fm-wish"><img class="jar" src="${IMG}${WISH_IMG[k]}" alt=""><div class="n ol">${WISH_NAMES[k]}</div><div class="fm-note">有 <b>${net.wish[k] || 0}</b> 個</div></div>`).join("");
        return head + `<div class="fm-panel"><p class="fm-note">⚠️ 星願池的資料庫設定還沒完成：到 Supabase 的 SQL Editor 執行 <b>sql/2026-10-17_星願池.sql</b>，重新整理網頁之後就能抽。</p>
          <div class="fm-wishes" style="margin-top:8px">${bottles}</div></div>`;
      }

      return head + tabs([["draw", "抽獎"], ["shop", "商店"], ["bag", "收藏"], ["rules", "機率"]], tab) + (WISH_TABS[tab] || WISH_TABS.draw)(st, t);

    },

    /* ---------- 小目標 ---------- */
    goals() {
      const rows = (S.goals ? S.goals.list : []).map((g, i) => {
        const t = GOAL_TYPES.find(x => x.k === g.k);
        const done = g.got >= g.n;
        return `<div class="fm-row"><div class="fm-row-art r-l">${t.ui ? uiIcon(t.ui) : t.icon}</div>
          <div><div class="fm-row-name">${t.name} ${g.n} 次</div><div class="fm-bar" style="margin-top:4px"><i style="width:${(g.got / g.n) * 100}%"></i></div><div class="fm-row-sub">${g.got} / ${g.n}・獎勵 ${GOAL_EXP} EXP、${GOAL_DEW} 星露</div></div>
          <div class="fm-row-btns">${g.claimed ? "✅" : `<button type="button" class="fm-btn small green" data-act="claimgoal" data-i="${i}" ${done ? "" : "disabled"}>領取</button>`}</div></div>`;
      }).join("");
      return sheetTop("今日小目標") + `<div class="fm-panel"><div class="fm-list">${rows}</div><p class="fm-note" style="margin-top:10px">每天凌晨 2 點換新的小目標。</p></div>`;
    }

  };

  const WISH_TABS = {

    /* 抽獎 */
    draw(st) {
      const odds = normalOdds(st.luck);
      const left = freeLeft();
      const freeTxt = !st.checked ? "簽到之後可以免費抽" : left > 0 ? `今日免費抽${st.free_total > 1 ? `（還有 ${left} 次）` : ""}` : "今天的免費抽用完了";
      const free = `<div class="fm-panel fm-free">
        <button type="button" class="fm-btn green big" data-act="draw" data-pool="free" data-n="1" ${st.checked && left > 0 && !wishBusy ? "" : "disabled"}>${freeTxt}</button>
        ${st.checked ? "" : `<div style="margin-top:8px"><button type="button" class="fm-btn small blue" data-act="checkin">現在簽到</button></div>`}
        ${own("f_observatory") ? `<div style="margin-top:8px"><button type="button" class="fm-btn small" data-act="observe" ${st.observed ? "disabled" : ""}>🔭 ${st.observed ? "今天看過流星了" : "到瞭望台看流星（幸運值 +1）"}</button></div>` : ""}
      </div>`;

      const luck = `<div class="fm-panel fm-luck">
        <div class="fm-luck-top"><img src="${IMG}item/clover.webp" alt="">
          <div style="flex:1;min-width:0"><div class="fm-row-name">幸運值 <b>${st.luck}</b> / 30${st.bonus ? `<span class="fm-tag r">加成 +${st.bonus}</span>` : ""}</div>
          <div class="fm-bar luck"><i style="width:${(st.luck / 30) * 100}%"></i></div>
          <div class="fm-row-sub">連續簽到 <b>${st.streak}</b> 天${st.checked ? "" : "（今天還沒簽）"}・華品以上 <b>${pct(odds.x + odds.s)}</b>・仙品 ${pct(odds.s)}</div></div></div>
        <p class="fm-note" style="margin:6px 2px 0">每天簽到幸運值 +1，中華品或仙品就回到 1。斷簽會歸零，補簽可以接回來。</p></div>`;

      const theme = st.theme || {};
      const hero = theme.hero;
      const lo = limitedOdds(st.limited_n);
      const themeHtml = `<div class="fm-panel fm-theme">
        <div class="fm-theme-art r-${hero ? rewardInfo(hero).tier : "s"}">${hero ? rewardArt(hero) : `<img src="${IMG}item/wish_limited.webp" alt="">`}</div>
        <div style="min-width:0"><div class="fm-row-name">本月主題：${esc(theme.name || "星光精選")}</div>
        <div class="fm-row-sub">${hero ? `仙品主角 <b>${esc(rewardInfo(hero).name)}</b>・` : "仙品從所有仙品裡抽・"}還剩 ${st.days_left} 天</div>
        <div class="fm-row-sub">限定瓶：距離上次主角第 ${st.limited_n} 瓶，主角 ${pct(lo.s)}（第 10 瓶一定中）</div></div></div>`;

      const ro = rareOdds(st.rare_n);
      const bottle = (k, sub) => {
        const n = net.wish[k] || 0;
        const color = k === "wish_limited" ? "red" : k === "wish_rare" ? "blue" : "";
        return `<div class="fm-wish"><img class="jar" src="${IMG}${WISH_IMG[k]}" alt="">
          <div class="n ol">${WISH_NAMES[k]}</div><div class="fm-note">有 <b>${n}</b> 個${sub ? `<br>${sub}` : ""}</div>
          <div class="fm-wish-btns"><button type="button" class="fm-btn small ${color}" data-act="draw" data-pool="${k}" data-n="1" ${n >= 1 && !wishBusy ? "" : "disabled"}>開 1</button>${n >= 10 ? `<button type="button" class="fm-btn small ${color}" data-act="draw" data-pool="${k}" data-n="10" ${wishBusy ? "disabled" : ""}>開 10</button>` : ""}</div></div>`;
      };
      const bottles = `<div class="fm-panel"><div class="fm-wishes">${bottle("wish_normal", "用現在的幸運值")}${bottle("wish_rare", `第 ${st.rare_n} 瓶・大獎 ${pct(ro.x + ro.s)}`)}${bottle("wish_limited", "本月主題")}</div>
        <p class="fm-note" style="margin:8px 2px 0">網站連續簽到每 3 天送普通瓶、每 7 天送稀有瓶；每月累計簽到 7 天送限定瓶，全勤再 2 瓶。</p></div>`;

      return free + luck + themeHtml + bottles;
    },

    /* 商店 */
    shop(st) {
      const dust = stardust();
      const btn = (item, price, disabled = false) =>
        `<button type="button" class="fm-btn small" data-act="shopbuy" data-item="${item}" ${disabled || dust < price || wishBusy ? "disabled" : ""}>${price ? `<img src="${IMG}item/stardust.webp" alt="">${num(price)}` : "換"}</button>`;
      const row = (art, name, sub, button, tier = "c") => `<div class="fm-row r-${tier}"><div class="fm-row-art">${art}</div>
        <div><div class="fm-row-name">${name}</div><div class="fm-row-sub">${sub}</div></div><div class="fm-row-btns">${button}</div></div>`;

      let html = `<div class="fm-panel"><div class="fm-sec ol">星屑兌換</div>
        <p class="fm-note" style="margin:0 2px 8px">抽到只能有一個的東西重複了，會換成星屑：凡 1、普 5、珍 20、華 80、仙 300。</p><div class="fm-list">`;
      html += row(rewardArt("wish_normal"), "普通星願瓶", "抽普通池", btn("wish_normal", W.shop.wish_normal));
      html += row(rewardArt("wish_rare"), "稀有星願瓶", "抽稀有池", btn("wish_rare", W.shop.wish_rare), "r");
      html += row(rewardArt("wish_limited"), "限定星願瓶", "抽本月限定池", btn("wish_limited", W.shop.wish_limited), "l");
      html += row(rewardArt("makeupcard"), "補簽卡", `免費補簽這個月的一天・有 ${makeupCards()} 張`, btn("makeupcard", W.shop.makeupcard), "r");
      html += row(rewardArt("page"), "食譜殘頁", `3 張換一道秘傳食譜・有 ${S.pages || 0} 張`, btn("page", W.shop.page));
      html += `</div></div>`;

      /* 指定兌換 */
      const tier = UI.pickTier || "l";
      const picks = (W.pool[tier] || []).filter(k => !(isUnique(k) && own(k)) && !["rarebottle", "limitedbottle", "stardust3", "makeupcard"].includes(k));
      html += `<div class="fm-panel"><div class="fm-sec ol">指定兌換</div>
        <div class="fm-tierbar">${["r", "l", "x", "s"].map(x => `<button type="button" class="fm-tierbtn r-${x}" data-act="picktier" data-tier="${x}" aria-pressed="${x === tier}">${RARITY_NAME[x]}</button>`).join("")}</div>
        <div class="fm-list">${picks.map(k => {
          const r = rewardInfo(k);
          return row(rewardArt(k), esc(r.name), RARITY_NAME[r.tier] + (isUnique(k) ? "・只能有一個" : ""), btn("pick:" + k, W.pick[tier]), r.tier);
        }).join("") || `<div class="fm-empty">這個品階的都收集齊了</div>`}</div></div>`;

      /* 過期的每月限定 */
      const expired = [];
      for (const [m, th] of Object.entries(W.months)) {
        if (m >= st.month) continue;
        for (const x of ["s", "x", "l"]) for (const k of th[x] || []) if (!expired.some(e => e[0] === k) && !(isUnique(k) && own(k))) expired.push([k, x, m]);
      }
      if (expired.length) {
        html += `<div class="fm-panel"><div class="fm-sec ol">過期的每月限定</div><div class="fm-list">${expired.map(([k, x, m]) =>
          row(rewardArt(k), esc(rewardInfo(k).name), `${m.slice(0, 4)} 年 ${Number(m.slice(5))} 月・${W.months[m].name}`, btn("pick:" + k, W.expired[x]), x)).join("")}</div></div>`;
      }

      /* 秘傳食譜 */
      const secrets = Object.entries(D.dishes).filter(([k, d]) => d.secret);
      html += `<div class="fm-panel"><div class="fm-sec ol">秘傳食譜</div>
        <p class="fm-note" style="margin:0 2px 8px">食譜殘頁 <b>${S.pages || 0}</b> 張，3 張換一道。</p><div class="fm-list">${secrets.map(([k, d]) => {
          const known = !!S.known.recipes[k];
          return row(itemIcon(k), esc(d.name), Object.entries(d.need).map(([i, q]) => `${itemName(i)}×${q}`).join("、"),
            known ? "✅" : `<button type="button" class="fm-btn small green" data-act="secret" data-dish="${k}" ${(S.pages || 0) >= 3 ? "" : "disabled"}>學會</button>`, D.items[k].tier);
        }).join("")}</div></div>`;

      /* 毛線換家具 */
      const yarns = Object.entries(D.deco).filter(([k, d]) => d.yarn);
      html += `<div class="fm-panel"><div class="fm-sec ol">毛線換家具</div><div class="fm-list">${yarns.map(([k, d]) =>
        row(rewardArt("f_" + k), esc(d.name), `${itemName(d.yarn)} ×10（有 ${have(d.yarn)}）・紡車把特殊羊毛紡成毛線`,
          `<button type="button" class="fm-btn small" data-act="shopbuy" data-item="yarn:f_${k}" ${have(d.yarn) >= 10 && !wishBusy ? "" : "disabled"}>換</button>`, d.tier)).join("")}</div></div>`;

      return html;
    },

    /* 收藏 */
    bag(st) {
      const owned = st.owned || {};
      let html = "";

      /* 夥伴 */
      const pets = Object.entries(D.pets).filter(([k]) => own("p_" + k));
      html += `<div class="fm-panel"><div class="fm-sec ol">夥伴</div><div class="fm-list">${pets.map(([k, p]) => `<div class="fm-row r-${p.tier}"><div class="fm-row-art">${p.img ? `<img src="${IMG}${p.img}" alt="">` : `<span class="fm-emo">${p.emoji}</span>`}</div>
        <div><div class="fm-row-name">${esc(p.name)}</div><div class="fm-row-sub">${esc(p.desc)}</div></div><div></div></div>`).join("") || `<div class="fm-empty">還沒有夥伴，珍品以上有機會抽到</div>`}</div></div>`;

      /* 工具 */
      const tools = Object.entries(D.tools).filter(([k]) => own("tool_" + k));
      html += `<div class="fm-panel"><div class="fm-sec ol">工具</div><div class="fm-list">${tools.map(([k, tl]) => `<div class="fm-row r-${tl.tier}"><div class="fm-row-art">${tl.img ? `<img src="${IMG}${tl.img}" alt="">` : "🧰"}</div>
        <div><div class="fm-row-name">${esc(tl.name)}</div><div class="fm-row-sub">${esc(tl.desc)}</div></div>
        <div class="fm-row-btns">${k === "timeglass" ? `<button type="button" class="fm-btn small" data-act="timeglass" ${S.glassDay === todayKey() ? "disabled" : ""}>使用</button>` : ""}</div></div>`).join("") || `<div class="fm-empty">還沒有工具</div>`}</div></div>`;

      /* 家具 */
      const decos = Object.keys(D.deco).filter(k => decoOwned(k) > 0);
      const free = DECO_SLOTS.length - S.deco.slots.filter(Boolean).length;
      html += `<div class="fm-panel"><div class="fm-sec ol">家具</div><p class="fm-note" style="margin:0 2px 8px">島上還有 <b>${free}</b> 個擺放位置。</p>
        <div class="fm-list">${decos.map(k => {
          const d = D.deco[k];
          const n = decoOwned(k), placed = decoPlaced(k);
          return `<div class="fm-row r-${d.tier}"><div class="fm-row-art">${rewardArt("f_" + k)}</div>
            <div><div class="fm-row-name">${esc(d.name)} <small>×${n}</small></div><div class="fm-row-sub">已擺 ${placed} 個${d.desc ? "・" + esc(d.desc) : ""}</div></div>
            <div class="fm-row-btns"><button type="button" class="fm-btn small green" data-act="placedeco" data-deco="${k}" ${placed < n && free > 0 ? "" : "disabled"}>擺上</button>
            <button type="button" class="fm-btn small" data-act="removedeco" data-deco="${k}" ${placed ? "" : "disabled"}>收起</button></div></div>`;
        }).join("") || `<div class="fm-empty">還沒有家具，凡品就有機會抽到</div>`}</div></div>`;

      /* 島嶼造型 */
      const skins = Object.keys(D.skins).filter(k => own("s_" + k));
      html += `<div class="fm-panel"><div class="fm-sec ol">島嶼造型</div><div class="fm-list">${skins.map(k => {
        const sk = D.skins[k];
        const on = S.skins[sk.group] === k;
        return `<div class="fm-row r-${sk.tier}"><div class="fm-row-art">${rewardArt("s_" + k)}</div>
          <div><div class="fm-row-name">${esc(sk.name)}${on ? `<span class="fm-tag">使用中</span>` : ""}</div><div class="fm-row-sub">${esc(sk.desc || "換掉" + sk.what)}</div></div>
          <div class="fm-row-btns"><button type="button" class="fm-btn small ${on ? "" : "green"}" data-act="skin" data-skin="${k}">${on ? "取下" : "換上"}</button></div></div>`;
      }).join("") || `<div class="fm-empty">還沒有造型，華品以上有機會抽到</div>`}</div></div>`;

      /* 稱號 */
      const titles = Object.keys(D.titles).filter(k => own("t_" + k));
      html += `<div class="fm-panel"><div class="fm-sec ol">稱號與頭像框</div><div class="fm-list">${titles.map(k => {
        const ti = D.titles[k];
        const on = S.titleKey === k;
        return `<div class="fm-row"><div class="fm-row-art">${ti.frameImg ? `<img src="${IMG}${ti.frameImg}" alt="">` : uiIcon("villager")}</div>
          <div><div class="fm-row-name">${esc(ti.name)}${on ? `<span class="fm-tag">使用中</span>` : ""}</div><div class="fm-row-sub">${ti.frame ? esc(ti.frame) : "只有稱號"}</div></div>
          <div class="fm-row-btns"><button type="button" class="fm-btn small ${on ? "" : "green"}" data-act="title" data-title="${on ? "" : k}">${on ? "取下" : "換上"}</button></div></div>`;
      }).join("") || `<div class="fm-empty">還沒有稱號：普品以上有機會抽到，連續簽到 30 天、100 天也會送</div>`}</div></div>`;

      /* 補簽卡 */
      const cards = makeupCards();
      const missed = UI.missed;
      html += `<div class="fm-panel"><div class="fm-sec ol">補簽卡 ${cards} 張</div>
        <p class="fm-note" style="margin:0 2px 8px">免費補簽這個月沒簽到的一天，連續天數和幸運值會一起接回來。連續簽到滿 14 天也會送一張。</p>
        ${missed === null || missed === undefined ? `<p class="fm-note">讀取中…</p>` : missed.length
          ? `<div class="fm-days">${missed.map(d => `<button type="button" class="fm-btn small" data-act="makeup" data-date="${d}" ${cards > 0 ? "" : "disabled"}>${Number(d.slice(5, 7))}/${Number(d.slice(8))}</button>`).join("")}</div>`
          : `<p class="fm-note">這個月都有簽到 👍</p>`}</div>`;

      /* 食譜卡 */
      const cardsOwned = Object.keys(owned).filter(k => k.startsWith("r_"));
      if (cardsOwned.length) {
        html += `<div class="fm-panel"><div class="fm-sec ol">每月限定食譜</div><div class="fm-list">${cardsOwned.map(k => {
          const dish = rewardInfo(k).dish;
          return `<div class="fm-row ${rarityClass(dish)}"><div class="fm-row-art">${itemIcon(dish)}</div><div><div class="fm-row-name">${esc(D.dishes[dish].name)}</div><div class="fm-row-sub">已經學會，在料理裡做</div></div><div></div></div>`;
        }).join("")}</div></div>`;
      }

      return html;
    },

    /* 機率 */
    rules(st) {
      const head = `<tr><th>幸運值</th>${TIERS.map(t => `<th class="t-${t}">${RARITY_NAME[t].slice(0, 1)}</th>`).join("")}</tr>`;
      const rowsN = [1, 7, 14, 21, 30].map(L => {
        const o = normalOdds(L);
        return `<tr${L === Math.min(30, st.luck) ? ` class="now"` : ""}><td>${L}${L === 30 ? "（上限）" : ""}</td>${TIERS.map(t => `<td>${pct(o[t])}</td>`).join("")}</tr>`;
      }).join("");
      const rowsR = [1, 5, 10, 15, 20].map(n => {
        const o = rareOdds(n);
        return `<tr${n === st.rare_n ? ` class="now"` : ""}><td>第 ${n} 瓶</td><td>—</td>${["r", "l", "x", "s"].map(t => `<td>${pct(o[t])}</td>`).join("")}</tr>`;
      }).join("");
      const rowsL = [1, 3, 5, 8, 10].map(n => {
        const o = limitedOdds(n);
        return `<tr${n === st.limited_n ? ` class="now"` : ""}><td>第 ${n} 瓶</td><td>—</td><td>—</td>${["l", "x", "s"].map(t => `<td>${pct(o[t])}</td>`).join("")}</tr>`;
      }).join("");
      return `<div class="fm-panel"><div class="fm-sec ol">普通池</div><p class="fm-note" style="margin:-4px 2px 6px;text-align:center">每日免費抽、普通星願瓶</p>
        <table class="fm-odds">${head}${rowsN}</table>
        <p class="fm-note">幸運值 = 上次中大獎之後連續簽到幾天＋幸運草和瞭望台的加成。中華品或仙品就回到 1；斷簽歸零，補簽會接回來。開普通瓶用當下的幸運值，十連至少一個普品以上。</p></div>
        <div class="fm-panel"><div class="fm-sec ol">稀有池</div><table class="fm-odds">${head.replace("幸運值", "距上次大獎")}${rowsR}</table>
        <p class="fm-note">每開一瓶沒中華品或仙品，華品 +1.5%、仙品 +0.5%；第 20 瓶一定中。</p></div>
        <div class="fm-panel"><div class="fm-sec ol">每月限定池</div><table class="fm-odds">${head.replace("幸運值", "距上次主角")}${rowsL}</table>
        <p class="fm-note">仙品就是當月主角。每開一瓶沒中主角，主角 +5%；第 10 瓶一定中，這個進度會帶到下個月。</p></div>
        <div class="fm-panel"><div class="fm-sec ol">五個品階</div><div class="fm-list">${TIERS.map(t => `<div class="fm-row r-${t}"><div class="fm-row-art"><span class="fm-emo">${{ c: "🌱", r: "💧", l: "🔮", x: "👑", s: "🔥" }[t]}</span></div>
          <div><div class="fm-row-name">${RARITY_NAME[t]}</div><div class="fm-row-sub">作物 ${hoursText(W.tierHours[t])}成熟・重複換 ${W.dust[t]} 星屑・獎池裡 ${(W.pool[t] || []).length} 種</div></div><div></div></div>`).join("")}</div></div>`;
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
      return S.lv < info.lv ? `<div class="${inRanch ? "fm-pen" : "fm-panel"}" style="opacity:.6"><div class="fm-row-name">${machineTag(info)} ${esc(info.name)}</div><div class="fm-note">Lv${info.lv} 開放</div></div>` : "";
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
        <div class="fm-row-btns"><button type="button" class="fm-btn small green" data-act="startrecipe" data-r="${k}" ${ok && q.filter(j => laneOf(j.r) === laneOf(k)).length < queueMax(m) ? "" : "disabled"}>做</button></div></div>`;
    }).join("");

    return `<div class="${inRanch ? "fm-pen" : "fm-panel"}"><div class="fm-pen-head"><h3 class="ol" style="--olc:#6a4220">${machineTag(info)} ${esc(info.name)}</h3>
      <span class="fm-note">${m === "feedmill" ? `每種飼料各排 ${queueMax(m)} 次` : `排隊 ${q.length}/${queueMax(m)}`}${info.auto ? "・做好自動收" : ""}</span>${ready && !info.auto ? `<button type="button" class="fm-btn small" data-act="collectmach" data-m="${m}">收取 ${ready}</button>` : ""}</div>
      ${queue ? `<div class="fm-ings" style="margin-bottom:8px">${queue}</div>` : ""}<div class="fm-list">${rows}</div></div>`;

  }

  function animalTile(a) {
    const info = D.animals[a.sp];
    const st = animalState(a);
    let status = "", bub = "";
    if (st === "hungry") { status = "餓了"; bub = `<span class="bub">${itemSrc("feed") ? `<img src="${itemSrc("feed")}" alt="">` : "🌾"}</span>`; }
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
      const perk = { kitchen: "2 個爐子，可以同時做 2 種不同的菜。", restaurant: "3 個爐子；客人每天點 3 道菜，付 1.5 倍價錢。", bistro: "4 個爐子，客人點餐照常。" }[next[1]];
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
         <p class="fm-note">完成 <b>1 個習慣或任務</b>、<b>喝水達標</b>：裝 1 桶（${cap.per} 滴）。<b>專注每 15 分鐘</b>、<b>記一次喝水、一餐、一次運動</b>：1 滴。今天已經算了 ${credited} 次。${own("tool_copperwater") ? "銅澆水壺：1 滴水澆 2 格。" : ""}</p>
         <p class="fm-note">菜田和香草園種一格用 1 滴；菇棚、果園、竹林、茶園、溫室不用水。${isRainDay() ? "<b>今天下雨，種什麼都不用水。</b>" : "大約每週會下一次雨。"}</p>`,
        `<button type="button" class="fm-btn blue" data-act="confirm" data-v="habits">去打卡習慣</button>${have("bucket") ? `<button type="button" class="fm-btn" data-act="useitem" data-item="bucket">用水桶（${have("bucket")}）</button>` : ""}${close}`);
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

    else if (m.name === "wishresult") {
      const list = m.list || [];
      const best = list.reduce((b, r) => (TIERS.indexOf(r.tier) > TIERS.indexOf(b) ? r.tier : b), "c");
      const bigWin = best === "x" || best === "s";
      el.innerHTML = `<div class="fm-modal-box fm-wishres r-${best} ${bigWin ? "big" : ""}">
        <div class="fm-modal-title ol">${POOL_NAME[m.pool] || "星願池"}${bigWin ? "・大獎！" : ""}</div>
        <div class="fm-res-grid ${list.length > 1 ? "many" : ""}">${list.map((r, i) => `<div class="fm-res r-${r.tier}" style="animation-delay:${i * 0.06}s">
          <span class="fm-res-tier">${RARITY_NAME[r.tier]}</span><div class="fm-res-art">${W.rewards[r.key] || WISH_IMG[r.key] ? rewardArt(r.key) : itemIcon(r.key)}</div>
          <div class="fm-res-name">${esc(r.name)}</div>${r.note && (list.length === 1 || r.dup) ? `<div class="fm-res-note">${esc(r.dup ? "→ 星屑 +" + (r.dust || 0) : r.note)}</div>` : ""}</div>`).join("")}</div>
        ${list.length > 1 && list.some(r => r.dup) ? `<p class="fm-note">重複的東西已經換成星屑了。</p>` : ""}
        <div class="fm-modal-actions"><button type="button" class="fm-btn green" data-act="modalclose">好</button></div></div>`;
      el.hidden = false;
      return;
    }

    else if (m.name === "pickzone") {
      const glass = m.use === "timeglass";
      const zones = Object.keys(ZONE_LABEL).filter(z => zoneTimers(z).length);
      html = modalBox(glass ? "⌛ 時光沙漏" : "⏳ 加速沙漏",
        `<p class="fm-note">${glass ? "選一區，裡面還在長的東西馬上成熟（每天一次）。" : "選一區，裡面還在長的東西都少 30 分鐘。"}</p>
         <div class="fm-days">${zones.map(z => `<button type="button" class="fm-btn small" data-act="confirm" data-v="${z}">${ZONE_LABEL[z]}（${zoneTimers(z).length}）</button>`).join("") || `<p class="fm-note">現在沒有還在長的東西</p>`}</div>`,
        close);
    }

    else if (m.name === "setup") {
      html = modalBox("把存檔放上雲端",
        `<p class="fm-note" style="text-align:left">現在星露島的進度只存在這台裝置的瀏覽器。到 Supabase 的 SQL Editor 執行網站裡的 <b>sql/2026-10-16_星露島.sql</b> 和 <b>sql/2026-10-17_星願池.sql</b>（或重新執行一次 <b>sql/完整設定.sql</b>），重新整理網頁後，進度會自動搬上去，換裝置也看得到，星願池也能抽。</p>`,
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

    if (m.name === "pickzone") {
      if (!ZONE_LABEL[v]) return;
      if (m.use === "timeglass") {
        if (S.glassDay === todayKey()) return toast("時光沙漏今天用過了");
        S.glassDay = todayKey();
        const n = speedZone(v, Infinity);
        toast(`⌛ ${ZONE_LABEL[v]}的 ${n} 樣東西馬上成熟了`);
      } else {
        if (!takeItem("speedglass", 1)) return closeModal();
        const n = speedZone(v, 30 * MIN);
        toast(`⏳ ${ZONE_LABEL[v]}的 ${n} 樣東西少了 30 分鐘`);
      }
      closeModal();
      return after(true);
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
      await loadWishStatus();
      await loadAchStatus();
      replayPending();
    } catch (error) {
      console.error("星露島載入失敗：", error);
      const root = document.getElementById("fm-root");
      if (root) root.innerHTML = `<div class="fm-loading">星露島載入失敗：${esc(error.message || error)}<br>請重新整理</div>`;
      net.loading = false;
      return;
    }

    buildRoot();
    calicoHelp();
    renderAll();
    checkLevelPopup();
    creditWater(false);

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
    calicoHelp();
    renderAll();
    creditWater(true);
    Promise.all([loadWishStatus(), loadAchStatus()]).then(() => { calicoHelp(); renderAll(); });
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
        const got = await creditWater(false);
        const text = creditText(got);
        if (typeof showToast === "function" && text) setTimeout(() => showToast(text), 2700);
      }
      return result;
    };
  }

  /* 完成任務 → 水車裝水 */
  if (typeof window.toggleTask === "function") {
    const baseTask = window.toggleTask;
    window.toggleTask = async function (taskId, completed) {
      const result = await baseTask.apply(this, arguments);
      if (completed && S && gameOn()) {
        const got = await creditWater(false);
        const text = creditText(got);
        if (typeof showToast === "function" && text) setTimeout(() => showToast(text), 2700);
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
      net.ws = null;
      net.wishReady = false;
      UI.missed = undefined;
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
    get wish() { return net.ws; },
    draw: (pool, n) => doDraw(pool, n),
    credit: show => creditWater(show !== false),
    creditText: got => creditText(got),
    start: startFarm,
    render: renderAll,
    restyle: () => { rebuildStatic(); renderAll(); },
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
