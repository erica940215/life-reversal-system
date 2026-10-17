/* ==================================================
   📈 累積
   - 學習：各科時數從專注紀錄算（不用另外填），每 N 分鐘 +1 點，點數夠了升級
   - 健康：喝水（水壺 750／馬克杯 250）、運動（種類＋分鐘）是新的紀錄；
           睡眠、三餐用「生活」頁原本的
   - 規則（幾分鐘加一點、幾點升一級、每天目標）存在 user_settings.accum
   - 星露島的水滴、獎勵在 farm.js 的 creditWater 算，這裡記完就請它算一次
================================================== */

const ACCUM_DEFAULTS = {
  pointMinutes: 30,    // 專注幾分鐘 +1 點
  mainLevel: 20,       // 主科幾點升一級
  subLevel: 10,        // 次單元幾點升一級
  waterMl: 2250,       // 每天喝水目標
  sleepHours: 7,       // 每晚睡眠目標
  exerciseWeek: 150    // 每週運動目標（分鐘）
};

const WATER_SIZES = [
  { ml: 750, label: "水壺", emoji: "🧴" },
  { ml: 250, label: "馬克杯", emoji: "☕" }
];

const EXERCISE_KINDS = ["走路", "跑步", "重訓", "球類", "騎車", "游泳", "伸展", "其他"];
const EXERCISE_MINUTES = [15, 30, 45, 60, 90];

const ACCUM_STALE_DAYS = 5;     // 超過幾天沒讀就變紅
const ACCUM_HEAT_WEEKS = 4;     // 格子表看幾週

let accumSettings = { ...ACCUM_DEFAULTS };
let accumSqlReady = true;       // 「累積」的 SQL 執行過了沒
let accumFocusRows = null;      // 全部的專注紀錄
let accumHealth = { from: null, water: [], exercise: [], meals: [], sleep: [] };
let accumHealthLoaded = false;
let accumTab = "study";
let accumWeekOffset = 0;
let accumLogFilter = "all";
let accumLogLimit = 20;

try {
  const savedTab = localStorage.getItem("accumTab");
  if (savedTab === "study" || savedTab === "health") accumTab = savedTab;
} catch (_) {}


/* ---------- 小工具 ---------- */

function accumWeekday(dateText) {
  /* 一 = 0 … 日 = 6 */
  const [y, m, d] = dateText.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function accumWeekStart(dateText, offset = 0) {
  return shiftDate(dateText, -accumWeekday(dateText) + offset * 7);
}

function accumMonthStart(dateText) {
  return dateText.slice(0, 8) + "01";
}

function accumDaysBetween(a, b) {
  const t = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}

function accumMD(dateText) {
  const [, m, d] = dateText.split("-").map(Number);
  return `${m}/${d}`;
}

function accumHours(seconds, digits = 1) {
  const h = (Number(seconds) || 0) / 3600;
  return h === 0 ? "0" : h < 0.1 ? "<0.1" : h.toFixed(digits).replace(/\.0$/, "");
}

function accumNum(n) {
  return Number(n || 0).toLocaleString("en-US");
}

/* 給 farm.js 用 */
function accumGetSettings() {
  return { ...accumSettings };
}

function accumMissingTable(error) {
  const text = String((error && (error.message || error.code)) || "");
  return /water_logs|exercise_logs|accum|has_veg|note|PGRST20[0-9]|42P01|42703|schema cache|does not exist/i.test(text);
}


/* =========================================================
   讀資料
========================================================= */

async function loadAccumSettings() {

  if (!currentUser) return;

  const { data, error } = await db
    .from("user_settings")
    .select("accum")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    if (accumMissingTable(error)) accumSqlReady = false;
    accumSettings = { ...ACCUM_DEFAULTS };
    return;
  }

  const saved = data && data.accum && typeof data.accum === "object" ? data.accum : {};

  accumSettings = { ...ACCUM_DEFAULTS };

  for (const key of Object.keys(ACCUM_DEFAULTS)) {
    const value = Number(saved[key]);
    if (Number.isFinite(value) && value > 0) accumSettings[key] = value;
  }

}


async function loadAccumFocus() {

  if (!currentUser) return;

  const query = cols => db
    .from("focus_sessions")
    .select(cols)
    .eq("user_id", currentUser.id)
    .order("started_at", { ascending: false })
    .limit(5000);

  let { data, error } = await query("id, subject, duration_seconds, session_date, started_at, note");

  /* 還沒執行 SQL：沒有 note 欄位 */
  if (error && /note/.test(String(error.message || ""))) {
    ({ data, error } = await query("id, subject, duration_seconds, session_date, started_at"));
  }

  if (error) {
    console.warn("累積：專注紀錄載入失敗", error);
    accumFocusRows = accumFocusRows || [];
    return;
  }

  accumFocusRows = data || [];

}


/* 健康：從「這個月 1 號」和「正在看的那一週」比較早的那天讀到今天 */
async function loadAccumHealth() {

  if (!currentUser) return;

  const today = getToday();
  const weekFrom = accumWeekStart(today, accumWeekOffset);
  const monthFrom = accumMonthStart(today);
  const from = weekFrom < monthFrom ? weekFrom : monthFrom;

  const uid = currentUser.id;

  const [water, exercise, meals, sleep] = await Promise.all([
    db.from("water_logs").select("id, log_date, ml, created_at").eq("user_id", uid).gte("log_date", from).order("created_at", { ascending: true }),
    db.from("exercise_logs").select("id, log_date, kind, minutes, created_at").eq("user_id", uid).gte("log_date", from).order("created_at", { ascending: true }),
    db.from("meal_logs").select("*").eq("user_id", uid).gte("log_date", from),
    db.from("sleep_logs").select("night_date, bed_at, wake_at").eq("user_id", uid).gte("night_date", shiftDate(from, -1))
  ]);

  accumSqlReady = !(water.error && accumMissingTable(water.error)) && !(exercise.error && accumMissingTable(exercise.error));

  accumHealth = {
    from,
    water: water.error ? [] : water.data || [],
    exercise: exercise.error ? [] : exercise.data || [],
    meals: meals.error ? [] : meals.data || [],
    sleep: sleep.error ? [] : sleep.data || []
  };

  accumHealthLoaded = true;

  [water, exercise, meals, sleep].forEach(r => { if (r.error && !accumMissingTable(r.error)) console.warn("累積：健康資料載入失敗", r.error); });

}


/* =========================================================
   學習：各科統計
========================================================= */

function accumSubjectMeta(key) {
  return ACCUM_SUBJECTS.find(s => s.key === key) || { key: "other", name: "其他", type: "other" };
}

function accumLevelInfo(key, seconds) {

  const meta = accumSubjectMeta(key);
  const minutes = (Number(seconds) || 0) / 60;
  const perPoint = accumSettings.pointMinutes;
  const per = meta.type === "sub" ? accumSettings.subLevel : accumSettings.mainLevel;

  const points = Math.floor(minutes / perPoint);
  const level = Math.floor(points / per) + 1;
  const inLevel = points % per;
  const toNextPoint = Math.max(1, Math.ceil(perPoint - (minutes % perPoint)));

  return { points, level, inLevel, per, toNextPoint, progress: inLevel / per };

}

function accumSubjectStats() {

  const today = getToday();
  const weekStart = accumWeekStart(today, 0);
  const stats = {};

  for (const s of [...ACCUM_SUBJECTS, { key: "other", name: "其他", type: "other" }]) {
    stats[s.key] = { key: s.key, name: s.name, type: s.type, seconds: 0, week: 0, last: null, days: {}, parts: {} };
  }

  for (const row of accumFocusRows || []) {
    const info = focusSubjectInfo(row.subject);
    const st = stats[info.key];
    const sec = Number(row.duration_seconds) || 0;
    st.seconds += sec;
    if (row.session_date >= weekStart) st.week += sec;
    if (!st.last || row.session_date > st.last) st.last = row.session_date;
    st.days[row.session_date] = (st.days[row.session_date] || 0) + sec;
    const part = info.key === "other" ? row.subject : (info.part || "");
    st.parts[part] = (st.parts[part] || 0) + sec;
  }

  for (const st of Object.values(stats)) {
    if (st.type !== "other") Object.assign(st, accumLevelInfo(st.key, st.seconds));
  }

  return stats;

}

/* 給 farm.js：各科等級（還沒讀到資料就回 null） */
function accumSubjectLevels() {

  if (!accumFocusRows) return null;

  const stats = accumSubjectStats();
  const out = {};

  for (const s of ACCUM_SUBJECTS) out[s.key] = { name: s.name, level: stats[s.key].level };

  return out;

}

/* 升級規則的版本：規則改了，星露島就重新記等級，不補發 */
function accumLevelSig() {
  return `${accumSettings.pointMinutes}/${accumSettings.mainLevel}/${accumSettings.subLevel}`;
}

/* 升級提示：記在這台裝置，第一次只記下來 */
function accumCheckLevelUps() {

  if (!currentUser || !accumFocusRows) return [];

  const key = `accumLv:${currentUser.id}`;
  const levels = accumSubjectLevels();
  let seen = null;

  try { seen = JSON.parse(localStorage.getItem(key) || "null"); } catch (_) { seen = null; }

  const ups = [];

  if (seen && typeof seen === "object") {
    for (const [k, info] of Object.entries(levels)) {
      if (seen[k] !== undefined && info.level > seen[k]) ups.push(`${info.name} 升到 Lv${info.level}`);
    }
  }

  const next = {};
  for (const [k, info] of Object.entries(levels)) next[k] = Math.max(info.level, (seen && seen[k]) || 0);

  try { localStorage.setItem(key, JSON.stringify(next)); } catch (_) {}

  return ups;

}


/* =========================================================
   健康：每天的數字
========================================================= */

function accumDay(dateText) {

  const h = accumHealth;

  const waterMl = h.water.filter(r => r.log_date === dateText).reduce((s, r) => s + (Number(r.ml) || 0), 0);

  const exerciseMin = h.exercise.filter(r => r.log_date === dateText).reduce((s, r) => s + (Number(r.minutes) || 0), 0);

  const meals = h.meals.filter(r => r.log_date === dateText && !r.skipped);
  const mainMeals = meals.filter(r => r.meal_type !== "snack").length;

  /* 睡眠算在起床那天：前一晚 */
  const night = h.sleep.find(r => r.night_date === shiftDate(dateText, -1));
  const sleepMin = night && night.bed_at && night.wake_at
    ? Math.round((new Date(night.wake_at) - new Date(night.bed_at)) / 60000)
    : null;

  return {
    waterMl,
    waterLogs: h.water.filter(r => r.log_date === dateText).length,
    exerciseMin,
    exerciseLogs: h.exercise.filter(r => r.log_date === dateText).length,
    meals: mainMeals,
    mealLogs: h.meals.filter(r => r.log_date === dateText).length,
    veg: meals.filter(r => r.has_veg).length,
    protein: meals.filter(r => r.has_protein).length,
    sleepMin
  };

}

function accumExerciseDaily() {
  return Math.ceil(accumSettings.exerciseWeek / 5);
}

function accumWeekExercise(offset = 0) {
  const start = accumWeekStart(getToday(), offset);
  let total = 0;
  for (let i = 0; i < 7; i++) total += accumDay(shiftDate(start, i)).exerciseMin;
  return total;
}


/* =========================================================
   💧 喝水、🏃 運動：記錄
========================================================= */

function accumNeedSql() {
  alert("還不能記：要先到 Supabase 的 SQL Editor 執行 sql/2026-10-17_累積.sql，再重新整理網頁");
}

/* 請星露島算水滴（遊戲模式關著或還沒載入就跳過） */
async function accumFarmCredit() {

  try {
    if (window.FarmGame && typeof FarmGame.credit === "function" && FarmGame.state) {
      const got = await FarmGame.credit(false);
      return typeof FarmGame.creditText === "function" ? FarmGame.creditText(got) : "";
    }
  } catch (error) {
    console.warn("星露島水滴計算失敗：", error);
  }

  return "";

}

async function addWater(ml) {

  if (!currentUser) return;
  if (!accumSqlReady) return accumNeedSql();

  const today = getToday();

  const { data, error } = await db
    .from("water_logs")
    .insert({ user_id: currentUser.id, log_date: today, ml })
    .select("id, log_date, ml, created_at")
    .maybeSingle();

  if (error) {
    if (accumMissingTable(error)) { accumSqlReady = false; renderAccumAll(); return accumNeedSql(); }
    alert("記錄失敗：" + error.message);
    return;
  }

  accumHealth.water.push(data || { id: Date.now(), log_date: today, ml, created_at: new Date().toISOString() });
  renderAccumAll();

  const total = accumDay(today).waterMl;
  const goal = accumSettings.waterMl;
  const farm = await accumFarmCredit();

  showToast(`💧 +${ml} ml・今天 ${accumNum(total)} / ${accumNum(goal)} ml${total >= goal && total - ml < goal ? "・🎉 達標了！" : ""}${farm ? `・${farm}` : ""}`);

}

async function undoWater() {

  if (!currentUser) return;

  const today = getToday();
  const list = accumHealth.water.filter(r => r.log_date === today);
  const last = list[list.length - 1];

  if (!last) return;

  await deleteWater(last.id, true);

}

async function deleteWater(id, quiet = false) {

  const row = accumHealth.water.find(r => Number(r.id) === Number(id));

  if (!row) return;
  if (!quiet && !confirm(`刪除這筆 ${row.ml} ml？`)) return;

  const { error } = await db.from("water_logs").delete().eq("id", id).eq("user_id", currentUser.id);

  if (error) {
    alert("刪除失敗：" + error.message);
    return;
  }

  accumHealth.water = accumHealth.water.filter(r => Number(r.id) !== Number(id));
  renderAccumAll();
  showToast(`↶ 已刪除 ${row.ml} ml`);

}


function openExerciseEditor() {

  if (!accumSqlReady) return accumNeedSql();

  const today = getToday();

  openModal({

    title: "🏃 記運動",

    bodyHtml: `
      <div class="modal-field">
        <label>做了什麼</label>
        <div class="chip-row" id="ex-kinds">
          ${EXERCISE_KINDS.map((kind, i) => `<button type="button" class="chip ${i === 0 ? "active" : ""}" data-kind="${kind}" onclick="accumPickChip(this, 'ex-kinds')">${kind}</button>`).join("")}
        </div>
      </div>

      <div class="modal-field">
        <label for="ex-minutes">幾分鐘</label>
        <div class="chip-row" id="ex-mins">
          ${EXERCISE_MINUTES.map(m => `<button type="button" class="chip ${m === 30 ? "active" : ""}" data-min="${m}" onclick="accumPickChip(this, 'ex-mins'); document.getElementById('ex-minutes').value = ${m};">${m} 分</button>`).join("")}
        </div>
        <input type="number" id="ex-minutes" min="1" max="600" value="30" inputmode="numeric" style="margin-top:8px;"
          oninput="document.querySelectorAll('#ex-mins .chip').forEach(c => c.classList.toggle('active', c.dataset.min === this.value))">
      </div>

      <div class="modal-field">
        <label for="ex-date">日期</label>
        <input type="date" id="ex-date" value="${today}" max="${today}">
      </div>
    `,

    buttons: [
      { label: "取消", className: "btn" },
      { label: "記下", className: "btn btn-primary", onClick: () => saveExercise() }
    ]

  });

}

function accumPickChip(button, groupId) {
  document.querySelectorAll(`#${groupId} .chip`).forEach(chip => chip.classList.toggle("active", chip === button));
}

async function saveExercise() {

  const active = document.querySelector("#ex-kinds .chip.active");
  const kind = active ? active.dataset.kind : "其他";
  const minutes = Math.round(Number(document.getElementById("ex-minutes").value));
  const dateText = document.getElementById("ex-date").value;
  const today = getToday();

  if (!(minutes >= 1 && minutes <= 600)) {
    alert("分鐘數要在 1～600 之間");
    return false;
  }

  if (!dateText || dateText > today) {
    alert("請選今天或以前的日期");
    return false;
  }

  const { data, error } = await db
    .from("exercise_logs")
    .insert({ user_id: currentUser.id, log_date: dateText, kind, minutes })
    .select("id, log_date, kind, minutes, created_at")
    .maybeSingle();

  if (error) {
    if (accumMissingTable(error)) { accumSqlReady = false; renderAccumAll(); accumNeedSql(); return false; }
    alert("記錄失敗：" + error.message);
    return false;
  }

  if (dateText >= (accumHealth.from || today)) {
    accumHealth.exercise.push(data || { id: Date.now(), log_date: dateText, kind, minutes, created_at: new Date().toISOString() });
  }

  renderAccumAll();

  const week = accumWeekExercise(0);
  const farm = await accumFarmCredit();

  showToast(`🏃 ${kind} ${minutes} 分・本週 ${week} / ${accumSettings.exerciseWeek} 分${farm ? `・${farm}` : ""}`);

  return true;

}

async function deleteExercise(id) {

  const row = accumHealth.exercise.find(r => Number(r.id) === Number(id));

  if (!row || !confirm(`刪除 ${accumMD(row.log_date)} 的${row.kind} ${row.minutes} 分？`)) return;

  const { error } = await db.from("exercise_logs").delete().eq("id", id).eq("user_id", currentUser.id);

  if (error) {
    alert("刪除失敗：" + error.message);
    return;
  }

  accumHealth.exercise = accumHealth.exercise.filter(r => Number(r.id) !== Number(id));
  renderAccumAll();

}


/* =========================================================
   畫面：今日頁、生活頁的「喝水・運動」
========================================================= */

function accumQuickHtml() {

  if (!accumSqlReady) {
    return `<p class="small-note">要先到 Supabase 的 SQL Editor 執行 <b>sql/2026-10-17_累積.sql</b>，重新整理之後就能記喝水和運動。</p>`;
  }

  const today = getToday();
  const d = accumDay(today);
  const goal = accumSettings.waterMl;
  const pct = Math.min(100, (d.waterMl / goal) * 100);
  const week = accumWeekExercise(0);
  const weekGoal = accumSettings.exerciseWeek;

  return `
    <div class="hq-row">
      <div class="hq-label">💧 喝水 <b>${accumNum(d.waterMl)}</b> / ${accumNum(goal)} ml${d.waterMl >= goal ? " ✅" : ""}</div>
      <div class="mini-bar hq-bar"><div style="width:${pct.toFixed(1)}%"></div></div>
      <div class="hq-btns">
        ${WATER_SIZES.map(w => `<button class="btn btn-small" onclick="addWater(${w.ml})">${w.emoji} ＋${w.label} ${w.ml}</button>`).join("")}
        <button class="btn btn-small" onclick="undoWater()" ${d.waterLogs ? "" : "disabled"} title="刪掉今天最後一筆">↶ 復原</button>
      </div>
    </div>

    <div class="hq-row">
      <div class="hq-label">🏃 運動 今天 <b>${d.exerciseMin}</b> 分・本週 ${week} / ${weekGoal} 分${week >= weekGoal ? " ✅" : ""}</div>
      <div class="mini-bar hq-bar"><div style="width:${Math.min(100, (week / weekGoal) * 100).toFixed(1)}%"></div></div>
      <div class="hq-btns">
        <button class="btn btn-small btn-primary" onclick="openExerciseEditor()">＋ 記運動</button>
      </div>
    </div>
  `;

}

function renderHealthQuick() {

  const today = document.getElementById("health-quick");
  const pill = document.getElementById("health-pill");

  if (pill) {
    pill.textContent = accumSqlReady && accumHealthLoaded
      ? `${accumNum(accumDay(getToday()).waterMl)} ml`
      : "";
  }

  if (today) today.innerHTML = accumHealthLoaded ? accumQuickHtml() : `<div class="empty-state">載入中...</div>`;

  const life = document.getElementById("health-life");

  if (!life) return;

  if (!accumHealthLoaded) {
    life.innerHTML = `<div class="empty-state">載入中...</div>`;
    return;
  }

  if (!accumSqlReady) {
    life.innerHTML = accumQuickHtml();
    return;
  }

  const todayText = getToday();
  const water = accumHealth.water.filter(r => r.log_date === todayText).slice().reverse();
  const from = shiftDate(todayText, -13);
  const exercise = accumHealth.exercise.filter(r => r.log_date >= from).slice().reverse();

  const time = iso => new Date(iso).toLocaleTimeString("sv-SE", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit" });

  life.innerHTML = `
    ${accumQuickHtml()}

    <h3 class="sub-title">今天喝的水</h3>
    ${water.length ? `
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>時間</th><th class="num">ml</th><th></th></tr></thead>
        <tbody>${water.map(r => `
          <tr><td>${time(r.created_at)}</td><td class="num">${accumNum(r.ml)}</td>
          <td class="num"><button class="icon-btn" title="刪除" onclick="deleteWater(${Number(r.id)})">🗑️</button></td></tr>`).join("")}
        </tbody></table></div>` : `<p class="small-note">今天還沒記喝水</p>`}

    <h3 class="sub-title">最近 14 天的運動</h3>
    ${exercise.length ? `
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>日期</th><th>運動</th><th class="num">分鐘</th><th></th></tr></thead>
        <tbody>${exercise.map(r => `
          <tr><td class="nowrap">${shortDateWithWeekday(r.log_date)}</td><td>${escapeHtml(r.kind)}</td><td class="num">${r.minutes}</td>
          <td class="num"><button class="icon-btn" title="刪除" onclick="deleteExercise(${Number(r.id)})">🗑️</button></td></tr>`).join("")}
        </tbody></table></div>` : `<p class="small-note">最近 14 天還沒記運動</p>`}
  `;

}


/* =========================================================
   畫面：紀錄頁的「📈 累積」
========================================================= */

function setAccumTab(tab) {
  accumTab = tab;
  try { localStorage.setItem("accumTab", tab); } catch (_) {}
  renderAccum();
}

function accumFilterLog(key) {
  accumLogFilter = key;
  accumLogLimit = 20;
  if (accumTab !== "study") accumTab = "study";
  renderAccum();
  const el = document.getElementById("accum-log");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function accumMoreLog() {
  accumLogLimit += 30;
  renderAccum();
}

async function accumShiftWeek(delta) {
  const next = Math.min(0, accumWeekOffset + delta);
  if (next === accumWeekOffset) return;
  accumWeekOffset = next;
  const need = accumWeekStart(getToday(), accumWeekOffset);
  if (!accumHealth.from || need < accumHealth.from) {
    await loadAccumHealth();
  }
  renderAccum();
}


function accumLastText(last) {
  if (!last) return { text: "還沒開始", stale: false };
  const days = accumDaysBetween(last, getToday());
  const text = days <= 0 ? "今天" : days === 1 ? "昨天" : `${days} 天前`;
  return { text, stale: days > ACCUM_STALE_DAYS };
}


function accumStudyHtml() {

  if (!accumFocusRows) return `<div class="empty-state">載入中...</div>`;

  const stats = accumSubjectStats();
  const order = [...ACCUM_SUBJECTS.map(s => s.key), "other"];

  /* ---------- 總表 ---------- */

  const rows = order.map(key => {

    const st = stats[key];
    const last = accumLastText(st.last);

    let nameCell;

    if (st.type === "other") {
      const top = Object.entries(st.parts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p]) => p).filter(Boolean);
      nameCell = `
        <div class="accum-name">其他</div>
        <div class="small-note">${top.length ? escapeHtml(top.join("、")) : "App 開發、專題…"}</div>`;
    } else {
      nameCell = `
        <div class="accum-name">${escapeHtml(st.name)} <span class="accum-lv">Lv${st.level}</span>${st.type === "sub" ? `<span class="accum-tag">次單元</span>` : ""}</div>
        <div class="accum-bar"><i style="width:${(st.progress * 100).toFixed(1)}%"></i></div>
        <div class="small-note nowrap">${st.inLevel}/${st.per} 點・再 ${st.toNextPoint} 分 +1</div>`;
    }

    return `
      <tr class="accum-row ${st.type}" onclick="accumFilterLog('${key}')">
        <td>${nameCell}</td>
        <td class="num">${accumHours(st.seconds)} h</td>
        <td class="num">${accumHours(st.week)} h</td>
        <td class="${last.stale ? "accum-stale" : ""} nowrap">${last.text}</td>
      </tr>`;

  }).join("");

  const total = order.reduce((s, k) => s + stats[k].seconds, 0);
  const totalWeek = order.reduce((s, k) => s + stats[k].week, 0);

  const table = `
    <div class="table-wrap">
      <table class="data-table accum-table">
        <thead><tr><th>科目</th><th class="num">累積</th><th class="num">本週</th><th>上次讀</th></tr></thead>
        <tbody>
          ${rows}
          <tr class="accum-total"><td><b>合計</b></td><td class="num"><b>${accumHours(total)} h</b></td><td class="num"><b>${accumHours(totalWeek)} h</b></td><td></td></tr>
        </tbody>
      </table>
    </div>
    <p class="small-note">專注每 ${accumSettings.pointMinutes} 分鐘 +1 點；主科每 ${accumSettings.mainLevel} 點、次單元每 ${accumSettings.subLevel} 點升一級。超過 ${ACCUM_STALE_DAYS} 天沒讀會變紅。點一科看它的紀錄。</p>`;

  return table + accumRadarHtml(stats) + accumHeatHtml(stats) + accumLogHtml();

}


/* ---------- 能力雷達：每科的等級（含進度） ---------- */

function accumRadarHtml(stats) {

  const keys = ACCUM_SUBJECTS.map(s => s.key);
  const values = keys.map(k => (stats[k].level - 1) + stats[k].progress);
  const top = Math.max(2, Math.ceil(Math.max(...values)));

  const W = 320, H = 280, cx = W / 2, cy = 142, R = 100;
  const n = keys.length;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };

  let svg = "";

  for (let ring = 1; ring <= top; ring++) {
    const r = (R * ring) / top;
    svg += `<polygon class="rd-ring" points="${keys.map((_, i) => pt(i, r).map(v => v.toFixed(1)).join(",")).join(" ")}"/>`;
  }

  keys.forEach((k, i) => {
    const [x, y] = pt(i, R);
    svg += `<line class="rd-axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    const [lx, ly] = pt(i, R + 22);
    const st = stats[k];
    svg += `<text class="rd-label" x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle">${escapeHtml(st.name)} Lv${st.level}</text>`;
  });

  const poly = values.map((v, i) => pt(i, (R * Math.max(0.04, v)) / top).map(x => x.toFixed(1)).join(",")).join(" ");

  svg += `<polygon class="rd-area" points="${poly}"/>`;

  values.forEach((v, i) => {
    const [x, y] = pt(i, (R * Math.max(0.04, v)) / top);
    svg += `<circle class="rd-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5"/>`;
  });

  return `
    <h3 class="sub-title">能力雷達</h3>
    <div class="accum-radar"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="各科等級雷達圖">${svg}</svg></div>`;

}


/* ---------- 格子表：最近 4 週，每科每天讀多久 ---------- */

function accumHeatHtml(stats) {

  const today = getToday();
  const start = accumWeekStart(today, -(ACCUM_HEAT_WEEKS - 1));
  const days = [];

  for (let i = 0; i < ACCUM_HEAT_WEEKS * 7; i++) days.push(shiftDate(start, i));

  const level = sec => {
    const m = sec / 60;
    return m <= 0 ? 0 : m < 30 ? 1 : m < 60 ? 2 : m < 120 ? 3 : 4;
  };

  const head = days.map((d, i) => `<span class="ht-head">${i % 7 === 0 ? accumMD(d) : ""}</span>`).join("");

  const rows = [...ACCUM_SUBJECTS.map(s => s.key), "other"].map(key => {
    const st = stats[key];
    const cells = days.map(d => {
      if (d > today) return `<span class="ht-cell future"></span>`;
      const sec = st.days[d] || 0;
      return `<span class="ht-cell h${level(sec)}" title="${accumMD(d)} ${escapeHtml(st.name)} ${sec ? formatDuration(sec) : "沒讀"}"></span>`;
    }).join("");
    return `<span class="ht-name">${escapeHtml(st.name)}</span>${cells}`;
  }).join("");

  return `
    <h3 class="sub-title">最近 ${ACCUM_HEAT_WEEKS} 週</h3>
    <div class="accum-heat" style="--days:${days.length}">
      <span class="ht-name"></span>${head}
      ${rows}
    </div>
    <div class="ht-legend small-note">少 <span class="ht-cell h0"></span><span class="ht-cell h1"></span><span class="ht-cell h2"></span><span class="ht-cell h3"></span><span class="ht-cell h4"></span> 多（30 分、1 小時、2 小時）</div>`;

}


/* ---------- 學習紀錄：哪天讀了什麼 ---------- */

function accumLogHtml() {

  const chips = [["all", "全部"], ...ACCUM_SUBJECTS.map(s => [s.key, s.name]), ["other", "其他"]]
    .map(([key, label]) => `<button class="chip ${accumLogFilter === key ? "active" : ""}" onclick="accumFilterLog('${key}')">${escapeHtml(label)}</button>`)
    .join("");

  const rows = (accumFocusRows || []).filter(row => accumLogFilter === "all" || focusSubjectInfo(row.subject).key === accumLogFilter);

  const list = rows.slice(0, accumLogLimit).map(row => {
    const info = focusSubjectInfo(row.subject);
    const name = info.subject ? `${info.subject.name}${info.part ? `・${info.part}` : ""}` : row.subject;
    return `
      <div class="accum-log-item">
        <div class="accum-log-head">
          <b>${escapeHtml(name)}</b>
          <span class="small-note">${shortDateWithWeekday(row.session_date)}・${formatDuration(row.duration_seconds)}</span>
        </div>
        ${row.note ? `<div class="accum-log-note">📝 ${escapeHtml(row.note)}</div>` : ""}
      </div>`;
  }).join("");

  return `
    <h3 class="sub-title" id="accum-log">學習紀錄</h3>
    <div class="chip-row" style="margin-bottom:10px;">${chips}</div>
    ${list || `<p class="small-note">還沒有紀錄。到「⏱️ 專注」開始計時，結束時可以寫這次完成了什麼。</p>`}
    ${rows.length > accumLogLimit ? `<button class="btn btn-small" style="margin-top:8px;" onclick="accumMoreLog()">顯示更多（還有 ${rows.length - accumLogLimit} 筆）</button>` : ""}`;

}


/* ---------- 健康：本週表＋本月總計 ---------- */

function accumHealthHtml() {

  if (!accumHealthLoaded) return `<div class="empty-state">載入中...</div>`;

  const today = getToday();
  const start = accumWeekStart(today, accumWeekOffset);
  const days = [];
  for (let i = 0; i < 7; i++) days.push(shiftDate(start, i));

  const data = days.map(d => ({ date: d, future: d > today, ...accumDay(d) }));
  const past = data.filter(d => !d.future);
  const weekNames = ["一", "二", "三", "四", "五", "六", "日"];

  const goal = accumSettings;
  const exDaily = accumExerciseDaily();

  const cell = (d, value, ok, has) => {
    if (d.future) return `<td class="hw-cell future"></td>`;
    if (!has) return `<td class="hw-cell empty">—</td>`;
    return `<td class="hw-cell ${ok ? "ok" : ""}">${value}</td>`;
  };

  const avg = (list, f) => list.length ? list.reduce((s, x) => s + f(x), 0) / list.length : 0;

  const waterDays = past.filter(d => d.waterLogs > 0);
  const sleepDays = past.filter(d => d.sleepMin !== null);
  const mealDays = past.filter(d => d.mealLogs > 0);
  const weekEx = data.reduce((s, d) => s + d.exerciseMin, 0);

  const rows = [
    {
      label: "💧 喝水", unit: "公升",
      cells: data.map(d => cell(d, (d.waterMl / 1000).toFixed(1), d.waterMl >= goal.waterMl, d.waterLogs > 0)),
      avg: waterDays.length ? (avg(waterDays, d => d.waterMl) / 1000).toFixed(1) : "—",
      ok: past.filter(d => d.waterMl >= goal.waterMl).length
    },
    {
      label: "😴 睡眠", unit: "小時",
      cells: data.map(d => cell(d, d.sleepMin === null ? "" : (d.sleepMin / 60).toFixed(1), d.sleepMin !== null && d.sleepMin >= goal.sleepHours * 60, d.sleepMin !== null)),
      avg: sleepDays.length ? (avg(sleepDays, d => d.sleepMin) / 60).toFixed(1) : "—",
      ok: past.filter(d => d.sleepMin !== null && d.sleepMin >= goal.sleepHours * 60).length
    },
    {
      label: "🍱 三餐", unit: "餐",
      cells: data.map(d => cell(d, d.meals, d.meals >= 3, d.mealLogs > 0)),
      avg: mealDays.length ? avg(mealDays, d => d.meals).toFixed(1) : "—",
      ok: past.filter(d => d.meals >= 3).length
    },
    {
      label: "🏃 運動", unit: "分鐘",
      cells: data.map(d => cell(d, d.exerciseMin, d.exerciseMin >= exDaily, d.exerciseLogs > 0)),
      avg: `${weekEx}/${goal.exerciseWeek}`,
      ok: past.filter(d => d.exerciseMin >= exDaily).length
    }
  ];

  const table = `
    <div class="hw-nav">
      <button class="btn btn-small" onclick="accumShiftWeek(-1)">‹ 上週</button>
      <b>${accumMD(days[0])} – ${accumMD(days[6])}${accumWeekOffset === 0 ? "（本週）" : ""}</b>
      <button class="btn btn-small" onclick="accumShiftWeek(1)" ${accumWeekOffset === 0 ? "disabled" : ""}>下週 ›</button>
    </div>
    <div class="table-wrap">
      <table class="data-table accum-week">
        <thead>
          <tr>
            <th>項目</th>
            ${data.map((d, i) => `<th class="${d.date === today ? "is-today" : ""}">${weekNames[i]}<br><span class="small-note">${Number(d.date.slice(8))}</span></th>`).join("")}
            <th class="num">平均</th>
            <th class="num">達標</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="nowrap">${r.label}<br><span class="small-note">${r.unit}</span></td>
              ${r.cells.join("")}
              <td class="num">${r.avg}</td>
              <td class="num">${r.ok}/${past.length}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="small-note">綠色 = 達標：喝水 ${accumNum(goal.waterMl)} ml、睡滿 ${goal.sleepHours} 小時（算在起床那天）、三餐都有吃、運動 ${exDaily} 分（一週 ${goal.exerciseWeek} 分）。運動的「平均」是本週合計。</p>`;

  /* 本月總計 */

  const monthStart = accumMonthStart(today);
  const monthDays = [];
  for (let d = monthStart; d <= today; d = shiftDate(d, 1)) monthDays.push(accumDay(d));

  const mWater = monthDays.reduce((s, d) => s + d.waterMl, 0);
  const mWaterOk = monthDays.filter(d => d.waterMl >= goal.waterMl).length;
  const mSleep = monthDays.filter(d => d.sleepMin !== null);
  const mEx = monthDays.reduce((s, d) => s + d.exerciseMin, 0);
  const mExN = accumHealth.exercise.filter(r => r.log_date >= monthStart).length;
  const mMeals = monthDays.reduce((s, d) => s + d.meals, 0);
  const mVeg = monthDays.reduce((s, d) => s + d.veg, 0);
  const mProtein = monthDays.reduce((s, d) => s + d.protein, 0);

  const tile = (label, value, note) => `
    <div class="stat-box">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      <div class="small-note">${note}</div>
    </div>`;

  const month = `
    <h3 class="sub-title">${Number(today.slice(5, 7))} 月累積</h3>
    <div class="accum-tiles">
      ${tile("💧 喝水", `${(mWater / 1000).toFixed(1)} L`, `${mWaterOk} 天達標`)}
      ${tile("😴 平均睡眠", mSleep.length ? `${(avg(mSleep, d => d.sleepMin) / 60).toFixed(1)} h` : "—", `記了 ${mSleep.length} 晚`)}
      ${tile("🏃 運動", `${accumHours(mEx * 60)} h`, `${mExN} 次`)}
      ${tile("🍱 三餐", `${mMeals} 餐`, `🥦 ${mVeg}・🍗 ${mProtein}`)}
    </div>`;

  return (accumSqlReady ? "" : `<p class="small-note">⚠️ 喝水和運動要先到 Supabase 執行 <b>sql/2026-10-17_累積.sql</b>。</p>`) + table + month;

}


function renderAccum() {

  const body = document.getElementById("accum-body");

  if (!body) return;

  const tabs = `
    <div class="chip-row accum-tabs">
      <button class="chip ${accumTab === "study" ? "active" : ""}" onclick="setAccumTab('study')">📚 學習</button>
      <button class="chip ${accumTab === "health" ? "active" : ""}" onclick="setAccumTab('health')">🩺 健康</button>
    </div>`;

  body.innerHTML = tabs + (accumTab === "health" ? accumHealthHtml() : accumStudyHtml());

}

function renderAccumAll() {
  renderHealthQuick();
  renderAccum();
}


/* ---------- ⚙️ 規則 ---------- */

function openAccumSettings() {

  const s = accumSettings;
  const field = (id, label, value, min, max, step = 1) => `
    <div class="modal-field">
      <label for="${id}">${label}</label>
      <input type="number" id="${id}" value="${value}" min="${min}" max="${max}" step="${step}" inputmode="numeric">
    </div>`;

  openModal({

    title: "⚙️ 累積規則",

    bodyHtml: `
      <h3 class="sub-title" style="margin-top:0;">📚 學習</h3>
      <div class="modal-row">
        ${field("as-point", "專注幾分鐘 +1 點", s.pointMinutes, 5, 240)}
      </div>
      <div class="modal-row">
        ${field("as-main", "主科幾點升一級", s.mainLevel, 1, 500)}
        ${field("as-sub", "次單元幾點升一級", s.subLevel, 1, 500)}
      </div>
      <h3 class="sub-title">🩺 健康目標</h3>
      <div class="modal-row">
        ${field("as-water", "每天喝水（ml）", s.waterMl, 250, 6000, 50)}
        ${field("as-sleep", "每晚睡幾小時", s.sleepHours, 4, 12, 0.5)}
      </div>
      <div class="modal-row">
        ${field("as-ex", "每週運動（分鐘）", s.exerciseWeek, 10, 3000, 10)}
      </div>
      <p class="small-note">主科：資料結構、計概、MIS、多益。次單元：網路、資料庫、AI。</p>
    `,

    buttons: [
      { label: "恢復預設", className: "btn", onClick: () => { accumFillSettings(ACCUM_DEFAULTS); return false; } },
      { label: "取消", className: "btn" },
      { label: "儲存", className: "btn btn-primary", onClick: () => saveAccumSettings() }
    ]

  });

}

function accumFillSettings(s) {
  document.getElementById("as-point").value = s.pointMinutes;
  document.getElementById("as-main").value = s.mainLevel;
  document.getElementById("as-sub").value = s.subLevel;
  document.getElementById("as-water").value = s.waterMl;
  document.getElementById("as-sleep").value = s.sleepHours;
  document.getElementById("as-ex").value = s.exerciseWeek;
}

async function saveAccumSettings() {

  const read = (id, min, max) => {
    const v = Number(document.getElementById(id).value);
    return Number.isFinite(v) && v >= min && v <= max ? v : null;
  };

  const next = {
    pointMinutes: read("as-point", 5, 240),
    mainLevel: read("as-main", 1, 500),
    subLevel: read("as-sub", 1, 500),
    waterMl: read("as-water", 250, 6000),
    sleepHours: read("as-sleep", 4, 12),
    exerciseWeek: read("as-ex", 10, 3000)
  };

  if (Object.values(next).some(v => v === null)) {
    alert("有數字超出範圍，請再檢查一下");
    return false;
  }

  next.pointMinutes = Math.round(next.pointMinutes);
  next.mainLevel = Math.round(next.mainLevel);
  next.subLevel = Math.round(next.subLevel);

  const { error } = await db
    .from("user_settings")
    .upsert({ user_id: currentUser.id, accum: next }, { onConflict: "user_id" });

  if (error) {
    if (accumMissingTable(error)) accumNeedSql();
    else alert("儲存失敗：" + error.message);
    return false;
  }

  accumSettings = { ...ACCUM_DEFAULTS, ...next };
  accumCheckLevelUps();
  renderAccumAll();
  showToast("⚙️ 累積規則已更新");

  return true;

}


/* =========================================================
   接上網站
========================================================= */

/* 專注結束、補記、修改、刪除之後 */
async function accumAfterFocus() {

  await loadAccumFocus();

  const ups = accumCheckLevelUps();

  renderAccum();

  const farm = await accumFarmCredit();

  const parts = [];
  if (ups.length) parts.push(`🎉 ${ups.join("、")}！`);
  if (farm) parts.push(farm);

  if (parts.length) setTimeout(() => showToast(parts.join("・")), 2800);

}

/* 記了一餐之後 */
async function accumAfterHealth() {

  await loadAccumHealth();

  renderAccumAll();

  const farm = await accumFarmCredit();

  if (farm) setTimeout(() => showToast(farm), 2600);

}

async function loadAccumAll() {

  try {
    await loadAccumSettings();
    await Promise.all([loadAccumHealth(), loadAccumFocus()]);
    accumCheckLevelUps();
  } catch (error) {
    console.warn("累積載入失敗：", error);
  }

  renderAccumAll();

}


(function accumInit() {

  /* 登入後跟今日頁一起載入 */
  if (typeof loadTodayModules === "function") {
    const baseLoad = loadTodayModules;
    loadTodayModules = async function () {
      await baseLoad.apply(this, arguments);
      await loadAccumAll();
    };
  }

  /* 登出時清掉 */
  if (typeof resetTodayModules === "function") {
    const baseReset = resetTodayModules;
    resetTodayModules = function () {
      const result = baseReset.apply(this, arguments);
      accumSettings = { ...ACCUM_DEFAULTS };
      accumFocusRows = null;
      accumHealth = { from: null, water: [], exercise: [], meals: [], sleep: [] };
      accumHealthLoaded = false;
      accumWeekOffset = 0;
      accumLogFilter = "all";
      renderAccumAll();
      return result;
    };
  }

  /* 切到紀錄頁、生活頁、今日頁時重畫（跨過換日也會對） */
  if (typeof applyPage === "function") {
    const baseApply = applyPage;
    applyPage = function (name) {
      const result = baseApply.apply(this, arguments);
      if (currentUser && (name === "records" || name === "life" || name === "today")) {
        if (accumHealth.from && accumMonthStart(getToday()) < accumHealth.from) loadAccumAll();
        else renderAccumAll();
      }
      return result;
    };
  }

})();

console.log("✅ 累積（學習・健康）載入完成");
