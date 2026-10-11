/* ==================================================
   📊 數據中心（📊 紀錄頁）＋ ⏱️ 今日進度條
   讀取現有資料，用 script.js 的圖表函式畫出來；只讀取，不寫入
   依賴 script.js 的全域變數與函式（db、currentUser、currentTasks、habits…）
================================================== */

const DC_HISTORY_DAYS = 90;     // 一次讀取的天數上限
const DC_RANGE_OPTIONS = [7, 30, 90];
const DC_STALE_MS = 60 * 1000;  // 超過這個時間才重新讀取

const DC_FORTUNE_ORDER = ["great", "good", "small", "fair", "late", "headwind"];

/* 獎勵來源：source_key 的前綴 → 顯示名稱與顏色（顏色只用 VIZ 與固定色票） */
const DC_SOURCES = {
  task:     { label: "任務", icon: "✅", color: "#3987e5" },
  habit:    { label: "習慣", icon: "🎯", color: "#0ca30c" },
  focus:    { label: "專注", icon: "⏱️", color: "#fab219" },
  sleep:    { label: "作息", icon: "😴", color: "#8a93a8" },
  morning:  { label: "晨間", icon: "🌅", color: "#b07cf0" },
  mainline: { label: "主線", icon: "🎯", color: "#ff6b81" },
  fortune:  { label: "運勢", icon: "🎴", color: "#5fd3c8" },
  other:    { label: "其他", icon: "📦", color: "#6b7385" }
};

let dcData = null;          // 最近 90 天的原始資料
let dcError = null;
let dcRange = 30;
let dcLoading = false;
let dcLoadedAt = 0;
let dcResizeTimer = null;


/* ---------- 小工具 ---------- */

function dcEl(id) {
  return document.getElementById(id);
}

function dcNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function dcSourceOf(sourceKey) {
  const prefix = String(sourceKey || "").split(":")[0];
  if (prefix === "bed" || prefix === "wake") return "sleep";
  return DC_SOURCES[prefix] ? prefix : "other";
}

/* 今天的日期清單（舊 → 新），n 天 */
function dcDayList(n) {
  const today = getToday();
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    days.push(shiftDate(today, -i));
  }
  return days;
}

function dcLabelStep(n) {
  return n <= 7 ? 1 : n <= 30 ? 5 : 15;
}

/* 軸上只顯示部分日期，避免擠在一起 */
function dcLabels(days) {
  const step = dcLabelStep(days.length);
  return days.map((day, i) => (i % step === 0 || i === days.length - 1 ? formatShortDate(day) : ""));
}

/* 數字取「好看的上限」：例如 37 → 50，128 → 200 */
function dcNiceCeil(x) {
  if (!(x > 0)) return 1;
  const exp = Math.floor(Math.log10(x));
  const base = Math.pow(10, exp);
  const f = x / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * base;
}

/* 軸上的數字，太大用 k／萬 縮寫 */
function dcTickText(v) {
  const abs = Math.abs(v);
  if (abs >= 10000) return (v / 10000).toFixed(1) + "萬";
  if (abs >= 1000) return (v / 1000).toFixed(1) + "k";
  return String(Math.round(v * 10) / 10);
}

/*
  折線圖（Y 軸依資料最大值自動調整）
  values 可以有 null，null 會斷開線
*/
function dcLine(labels, values, tips, width) {

  const W = Math.max(280, Math.round(width)), H = 200;
  const left = 44, right = 44, top = 14, bottom = 28;
  const plotW = W - left - right, plotH = H - top - bottom;
  const n = labels.length;

  const present = values.filter(v => v !== null && Number.isFinite(v));
  const ceiling = dcNiceCeil(Math.max(0, ...present));

  const x = i => left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = v => top + plotH * (1 - v / ceiling);

  let out = `<svg class="viz-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">`;

  /* 格線：0 / 一半 / 上限 */
  [0, 0.5, 1].forEach(ratio => {
    const value = ceiling * ratio;
    out += `<line x1="${left}" x2="${W - right}" y1="${y(value)}" y2="${y(value)}" stroke="${ratio === 0 ? VIZ.axis : VIZ.grid}" stroke-width="1"/>`;
    out += `<text x="${left - 6}" y="${y(value) + 4}" text-anchor="end" class="viz-tick">${dcTickText(value)}</text>`;
  });

  /* x 軸：太擠就隔幾個顯示 */
  const every = Math.ceil(n / Math.max(2, Math.floor(plotW / 46)));

  labels.forEach((label, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    out += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="viz-tick">${escapeHtml(label)}</text>`;
  });

  /* 線段（null 斷開） */
  const segments = [];
  let current = [];

  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push([x(i), y(v)]);
    }
  });

  if (current.length) segments.push(current);

  segments.forEach(seg => {
    const line = seg.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
    if (seg.length > 1) {
      out += `<path d="${line} L${seg[seg.length - 1][0].toFixed(1)},${y(0)} L${seg[0][0].toFixed(1)},${y(0)} Z" fill="${VIZ.accentWash}"/>`;
    }
    out += `<path d="${line}" fill="none" stroke="${VIZ.accent}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (seg.length === 1) {
      out += `<circle cx="${seg[0][0]}" cy="${seg[0][1]}" r="4" fill="${VIZ.accent}"/>`;
    }
  });

  /* 最後一個有資料的點 + 數字 */
  const lastIndex = values.map(v => v !== null && Number.isFinite(v)).lastIndexOf(true);

  if (lastIndex >= 0) {
    out += `<circle cx="${x(lastIndex)}" cy="${y(values[lastIndex])}" r="4.5" fill="${VIZ.accent}" stroke="${VIZ.surface}" stroke-width="2"/>`;
    out += `<text x="${x(lastIndex) + 8}" y="${y(values[lastIndex]) + 4}" class="viz-value">${dcTickText(values[lastIndex])}</text>`;
  }

  /* 滑過去看數字 */
  const band = n === 1 ? plotW : plotW / (n - 1);

  values.forEach((v, i) => {
    out += `<g class="viz-hover">
      <line x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${y(0)}" stroke="${VIZ.muted}" stroke-width="1"/>
      <rect x="${(x(i) - band / 2).toFixed(1)}" y="${top}" width="${band.toFixed(1)}" height="${plotH}"
        fill="transparent" tabindex="0" data-tip="${escapeHtml(tips[i])}"/>
    </g>`;
  });

  return out + `</svg>`;

}


function dcLegend(segments) {
  return `
    <div class="viz-legend">
      ${segments.map(s => `
        <div class="viz-legend-row">
          <span class="viz-swatch" style="background:${s.color}"></span>
          <span>${s.icon || ""} ${escapeHtml(s.label)}</span>
          <span class="viz-value">${escapeHtml(String(s.display))}</span>
        </div>`).join("")}
    </div>`;
}


/* ---------- 讀取資料 ---------- */

async function dcLoad() {

  if (!currentUser || dcLoading) return;

  dcLoading = true;

  const uid = currentUser.id;
  const today = getToday();
  const from = shiftDate(today, -(DC_HISTORY_DAYS - 1));

  try {

    const [tasks, rewards, focus, sleep, meals, fortunes] = await Promise.all([
      db.from("tasks")
        .select("task_date,completed,category,exp_reward")
        .eq("user_id", uid)
        .gte("task_date", from).lte("task_date", today)
        .limit(10000),
      db.from("reward_events")
        .select("reward_date,source_key,exp")
        .eq("user_id", uid)
        .gte("reward_date", from).lte("reward_date", today)
        .limit(10000),
      db.from("focus_sessions")
        .select("session_date,subject,duration_seconds")
        .eq("user_id", uid)
        .gte("session_date", from).lte("session_date", today)
        .limit(10000),
      db.from("sleep_logs")
        .select("night_date,bed_at,wake_at")
        .eq("user_id", uid)
        .gte("night_date", from).lte("night_date", today)
        .limit(1000),
      db.from("meal_logs")
        .select("log_date,cost,skipped")
        .eq("user_id", uid)
        .gte("log_date", from).lte("log_date", today)
        .limit(10000),
      db.from("fortune_draws")
        .select("draw_date,level")
        .eq("user_id", uid)
        .gte("draw_date", from).lte("draw_date", today)
        .limit(1000)
    ]);

    const failed = [tasks, rewards, focus, sleep, meals, fortunes].find(result => result.error);

    if (failed) throw failed.error;

    dcData = {
      tasks: tasks.data || [],
      rewards: rewards.data || [],
      focus: focus.data || [],
      sleep: sleep.data || [],
      meals: meals.data || [],
      fortunes: fortunes.data || []
    };

    dcError = null;

  } catch (error) {

    console.error("數據中心讀取失敗：", error);
    dcError = error.message || "讀取失敗";

  } finally {

    dcLoading = false;
    dcLoadedAt = Date.now();

  }

}


async function dcRefresh(force = false) {

  if (!currentUser) return;

  const stale = Date.now() - dcLoadedAt > DC_STALE_MS;

  if (force || !dcData || stale) {
    dcRenderLoading();
    await dcLoad();
  }

  dcRender();
  dcRenderProgress();

}


/* ---------- ⏱️ 時間進度與今日完成度 ---------- */

/* 今天已經過了多少（台灣時間 00:00 → 24:00） */
function dcDayFraction() {

  const taipeiMs = Date.now() + 8 * 60 * 60 * 1000;

  return (taipeiMs % 86400000) / 86400000;

}


/* 今天、本週（週一起算）、本月、今年 各過了幾 % */
function dcPeriodProgress() {

  const [y, m, d] = getToday().split("-").map(Number);
  const frac = dcDayFraction();
  const dayStart = Date.UTC(y, m - 1, d);
  const weekIndex = (new Date(dayStart).getUTCDay() + 6) % 7;   // 週一 = 0
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInYear = leap ? 366 : 365;
  const dayOfYear = Math.round((dayStart - Date.UTC(y, 0, 1)) / 86400000);

  return {
    day: frac,
    week: (weekIndex + frac) / 7,
    month: (d - 1 + frac) / daysInMonth,
    year: (dayOfYear + frac) / daysInYear
  };

}


/* 今日完成度：今日任務（不含跳過）＋今日習慣 */
function dcTodayCompletion() {

  const today = getToday();
  const todayHabits = getTodayHabits();

  const total = currentTasks.length + todayHabits.length;
  const done =
    currentTasks.filter(task => task.completed).length +
    todayHabits.filter(habit => isHabitDone(habit.id, today)).length;

  return { total, done, ratio: total ? done / total : null };

}


function dcBar(label, ratio, extraClass = "") {

  const width = Math.max(0, Math.min(1, ratio)) * 100;

  return `
    <div class="dc-bar-row ${extraClass}">
      <div class="dc-bar-head">
        <span>${label}</span>
        <b>${(ratio * 100).toFixed(1)}%</b>
      </div>
      <div class="dc-track"><div class="dc-fill" style="width:${width.toFixed(2)}%"></div></div>
    </div>`;

}


/* 台灣時間的 時:分:秒 */
function dcClockText() {

  const t = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");

  return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;

}


function dcRenderProgress() {

  const box = dcEl("dc-progress");

  if (!box) return;

  if (!currentUser) {
    box.innerHTML = "";
    return;
  }

  const elapsed = dcDayFraction();

  box.innerHTML = `
    <section class="card dc-progress-card">
      <div class="dc-clock" id="dc-clock">${dcClockText()}</div>
      <div class="dc-bar-head">
        <span>今日已過</span>
        <b id="dc-elapsed">${(elapsed * 100).toFixed(2)}%</b>
      </div>
      <div class="dc-track">
        <div class="dc-fill dc-fill-time" id="dc-elapsed-fill" style="width:${(elapsed * 100).toFixed(2)}%"></div>
      </div>
    </section>`;

}


/* 每秒只更新時間與百分比，不重畫整個區塊 */
function dcTickClock() {

  const clock = dcEl("dc-clock");

  if (!clock) return;

  const elapsed = dcDayFraction();

  clock.textContent = dcClockText();

  const label = dcEl("dc-elapsed");
  if (label) label.textContent = (elapsed * 100).toFixed(2) + "%";

  const fill = dcEl("dc-elapsed-fill");
  if (fill) fill.style.width = (elapsed * 100).toFixed(2) + "%";

}


setInterval(dcTickClock, 1000);


/* ---------- 📊 數據中心 ---------- */

function dcRenderLoading() {

  const root = dcEl("dc-root");

  if (root && !dcData) {
    root.innerHTML = `<div class="empty-state">數據中心載入中...</div>`;
  }

}


/* 把原始資料整理成每一天的數字 */
function dcBuildSeries(days) {

  const index = new Map(days.map((day, i) => [day, i]));
  const n = days.length;

  const series = {
    exp: Array(n).fill(0),
    taskTotal: Array(n).fill(0),
    taskDone: Array(n).fill(0),
    focusMin: Array(n).fill(0),
    sleepH: Array(n).fill(null),
    spend: Array(n).fill(0),
    expBySource: {},
    focusBySubject: {},
    categoryDone: {},
    fortuneCount: {}
  };

  const addSource = (key, value) => {
    series.expBySource[key] = (series.expBySource[key] || 0) + value;
  };

  for (const task of dcData.tasks) {

    const i = index.get(task.task_date);

    if (i === undefined) continue;

    series.taskTotal[i] += 1;

    if (task.completed) {
      series.taskDone[i] += 1;
      series.exp[i] += dcNum(task.exp_reward);
      addSource("task", dcNum(task.exp_reward));
      series.categoryDone[task.category] = (series.categoryDone[task.category] || 0) + 1;
    }

  }

  for (const row of dcData.rewards) {

    const i = index.get(row.reward_date);

    if (i === undefined) continue;

    series.exp[i] += dcNum(row.exp);
    addSource(dcSourceOf(row.source_key), dcNum(row.exp));

  }

  for (const session of dcData.focus) {

    const i = index.get(session.session_date);

    if (i === undefined) continue;

    const minutes = dcNum(session.duration_seconds) / 60;

    series.focusMin[i] += minutes;

    const subject = session.subject || "未分類";
    series.focusBySubject[subject] = (series.focusBySubject[subject] || 0) + minutes;

  }

  for (const log of dcData.sleep) {

    const i = index.get(log.night_date);

    if (i === undefined || !log.bed_at || !log.wake_at) continue;

    const hours = (new Date(log.wake_at) - new Date(log.bed_at)) / 3600000;

    if (hours > 0 && hours < 24) series.sleepH[i] = hours;

  }

  for (const meal of dcData.meals) {

    const i = index.get(meal.log_date);

    if (i === undefined || meal.skipped) continue;

    series.spend[i] += dcNum(meal.cost);

  }

  for (const draw of dcData.fortunes) {

    if (!index.has(draw.draw_date)) continue;

    series.fortuneCount[draw.level] = (series.fortuneCount[draw.level] || 0) + 1;

  }

  return series;

}


function dcSetRange(n) {

  dcRange = DC_RANGE_OPTIONS.includes(n) ? n : 30;
  dcRender();

}


function dcRangeChips() {

  return `
    <div class="chip-row" style="margin-bottom:12px;">
      ${DC_RANGE_OPTIONS.map(n => `
        <button class="chip ${dcRange === n ? "active" : ""}" onclick="dcSetRange(${n})">
          近 ${n} 天
        </button>`).join("")}
    </div>`;

}


function dcRender() {

  const root = dcEl("dc-root");

  if (!root) return;

  if (!currentUser) {
    root.innerHTML = "";
    return;
  }

  if (!dcData) {
    root.innerHTML = dcLoading
      ? `<div class="empty-state">數據中心載入中...</div>`
      : `<div class="empty-state">
           數據讀取失敗${dcError ? `（${escapeHtml(dcError)}）` : ""}
           <div style="margin-top:8px;"><button class="btn btn-small" onclick="dcRefresh(true)">重試</button></div>
         </div>`;
    return;
  }

  /* 頁面沒顯示時量不到寬度，等切到紀錄頁再畫 */
  const width = root.clientWidth;

  if (!width) return;

  /* 寬螢幕是兩欄，每張圖要比格子窄；手機是一欄 */
  const chartWidth = width > 800
    ? Math.max(280, (width - 40 - 12) / 2 - 32)
    : Math.max(280, width - 40 - 32);
  const days = dcDayList(dcRange);
  const s = dcBuildSeries(days);
  const labels = dcLabels(days);
  const period = dcPeriodProgress();

  const sum = arr => arr.reduce((a, b) => a + b, 0);

  const totalExp = sum(s.exp);
  const totalTasks = sum(s.taskTotal);
  const doneTasks = sum(s.taskDone);
  const totalFocus = sum(s.focusMin);
  const sleepDays = s.sleepH.filter(h => h !== null);
  const avgSleep = sleepDays.length ? sleepDays.reduce((a, b) => a + b, 0) / sleepDays.length : null;
  const totalSpend = sum(s.spend);
  const drawCount = sum(Object.values(s.fortuneCount));

  const tiles = `
    <div class="viz-tiles">
      ${vizTile("累計 EXP", totalExp.toLocaleString("zh-TW"), `近 ${dcRange} 天`)}
      ${vizTile("任務完成率", totalTasks ? pct(doneTasks / totalTasks) : "—", `${doneTasks} / ${totalTasks} 件`)}
      ${vizTile("專注時數", (totalFocus / 60).toFixed(1) + " 小時", `${Math.round(totalFocus)} 分鐘`)}
      ${vizTile("平均睡眠", avgSleep === null ? "—" : avgSleep.toFixed(1) + " 小時", `${sleepDays.length} 晚有紀錄`)}
      ${vizTile("三餐花費", "$" + totalSpend.toLocaleString("zh-TW"), totalSpend ? `日均 $${Math.round(totalSpend / dcRange)}` : "")}
      ${vizTile("抽籤", `${drawCount} 次`, "")}
    </div>`;

  const expLine = vizPanel(
    "📈 每日 EXP",
    "任務、習慣、專注、作息等加總",
    dcLine(labels, s.exp, days.map((d, i) => `${formatShortDate(d)}：${s.exp[i]} EXP`), chartWidth)
  );

  const rateLine = vizPanel(
    "✅ 每日任務完成率",
    "沒有任務的日子以 0 計",
    svgLine(
      labels,
      s.taskTotal.map((t, i) => (t ? s.taskDone[i] / t : 0)),
      days.map((d, i) => `${formatShortDate(d)}：${s.taskTotal[i] ? pct(s.taskDone[i] / s.taskTotal[i]) : "沒有任務"}（${s.taskDone[i]} / ${s.taskTotal[i]}）`),
      chartWidth
    )
  );

  const focusBars = vizPanel(
    "⏱️ 每日專注分鐘",
    "",
    svgBars(labels, s.focusMin.map(m => Math.round(m)), Math.max(1, ...s.focusMin.map(m => Math.round(m))), v => `${v} 分`, days.map((d, i) => `${formatShortDate(d)}：${Math.round(s.focusMin[i])} 分鐘`), chartWidth)
  );

  const sleepLine = vizPanel(
    "😴 每晚睡眠時數",
    "沒有紀錄的晚上會斷開",
    dcLine(
      labels,
      s.sleepH,
      days.map((d, i) => `${formatShortDate(d)}：${s.sleepH[i] === null ? "沒有紀錄" : s.sleepH[i].toFixed(1) + " 小時"}`),
      chartWidth
    )
  );

  const spendBars = vizPanel(
    "🍱 每日三餐花費",
    "",
    svgBars(labels, s.spend, Math.max(1, ...s.spend), v => `$${v}`, days.map((d, i) => `${formatShortDate(d)}：$${s.spend[i]}`), chartWidth)
  );

  /* EXP 來源甜甜圈 */
  const expSegments = Object.entries(s.expBySource)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      label: DC_SOURCES[key].label,
      icon: DC_SOURCES[key].icon,
      color: DC_SOURCES[key].color,
      value,
      display: `${value} EXP`
    }));

  const expDonut = vizPanel(
    "🍩 EXP 來源",
    `近 ${dcRange} 天`,
    expSegments.length
      ? `<div class="viz-donut-wrap">${svgDonut(expSegments, totalExp.toLocaleString("zh-TW"), "總 EXP")}${dcLegend(expSegments)}</div>`
      : `<div class="empty-state">這段期間還沒有 EXP</div>`
  );

  /* 任務分類甜甜圈（已完成） */
  const categorySegments = Object.entries(s.categoryDone)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => {
      const category = findCategory(key);
      return {
        label: category.label,
        icon: category.emoji,
        color: safeColor(category.color),
        value,
        display: `${value} 件`
      };
    });

  const categoryDonut = vizPanel(
    "🧭 任務分類",
    "已完成的任務",
    categorySegments.length
      ? `<div class="viz-donut-wrap">${svgDonut(categorySegments, String(doneTasks), "完成")}${dcLegend(categorySegments)}</div>`
      : `<div class="empty-state">這段期間還沒有完成的任務</div>`
  );

  /* 專注科目（前 8 名） */
  const subjects = Object.entries(s.focusBySubject)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const subjectBars = vizPanel(
    "📚 專注科目",
    `近 ${dcRange} 天，前 8 名`,
    subjects.length
      ? svgBars(
          subjects.map(([name]) => Array.from(name).slice(0, 5).join("")),
          subjects.map(([, minutes]) => Math.round(minutes)),
          Math.max(1, ...subjects.map(([, minutes]) => Math.round(minutes))),
          v => `${v} 分`,
          subjects.map(([name, minutes]) => `${name}：${Math.round(minutes)} 分鐘`),
          chartWidth
        )
      : `<div class="empty-state">這段期間沒有專注紀錄</div>`
  );

  /* 運勢分布 */
  const fortuneCounts = DC_FORTUNE_ORDER.map(level => s.fortuneCount[level] || 0);

  const fortuneBars = vizPanel(
    "🎴 運勢分布",
    `近 ${dcRange} 天`,
    drawCount
      ? svgBars(
          DC_FORTUNE_ORDER.map(level => FORTUNE_LEVELS[level].name),
          fortuneCounts,
          Math.max(1, ...fortuneCounts),
          v => `${v} 次`,
          DC_FORTUNE_ORDER.map((level, i) => `${FORTUNE_LEVELS[level].name}：${fortuneCounts[i]} 次`),
          chartWidth
        )
      : `<div class="empty-state">這段期間還沒有抽籤</div>`
  );

  root.innerHTML = `
    <section class="card dc-card">
      <div class="card-head">
        <h2>📊 數據中心</h2>
      </div>

      <div class="dc-period">
        ${dcBar("今天", period.day, "")}
        ${dcBar("本週", period.week, "")}
        ${dcBar("本月", period.month, "")}
        ${dcBar("今年", period.year, "")}
      </div>

      ${dcRangeChips()}
      ${tiles}
      <div class="viz-grid" style="margin-top:14px;">
        ${expLine}
        ${rateLine}
        ${focusBars}
        ${sleepLine}
        ${spendBars}
        ${expDonut}
        ${categoryDonut}
        ${subjectBars}
        ${fortuneBars}
      </div>
    </section>`;

}


/* 切到紀錄頁時重新讀取；切到今日頁時更新進度條 */
(function dcInit() {

  if (typeof applyPage === "function") {
    const originalApplyPage = applyPage;
    applyPage = function (name) {
      originalApplyPage(name);
      if (name === "records") dcRefresh(false);
      if (name === "today") dcRenderProgress();
    };
  }

  /* 進度條每 15 秒更新；紀錄頁若還沒有資料就補讀 */
  setInterval(() => {
    dcRenderProgress();
    if (currentPageFromHash() === "records" && currentUser && !dcData && !dcLoading) {
      dcRefresh(true);
    }
  }, 15000);

  window.addEventListener("resize", () => {
    clearTimeout(dcResizeTimer);
    dcResizeTimer = setTimeout(dcRender, 150);
  });

  dcRenderProgress();

})();

/* ==================================================
   🎨 主題（8 組漸層＋原本的預設）
   選擇存在這台裝置的瀏覽器（localStorage），不需要資料庫
   做法：注入一段覆蓋樣式，不改動原本的寫法
================================================== */

const THEME_STORAGE_KEY = "lifeTheme";

const THEMES = {

  aurora: {
    name: "🌌 極光夜空",
    bg: "linear-gradient(160deg, #0b1020 0%, #1a1f4a 55%, #1f3b5c 100%)",
    card: "rgba(20, 26, 48, 0.72)",
    cardBorder: "rgba(255, 255, 255, 0.08)",
    nav: "rgba(11, 16, 32, 0.7)",
    field: "rgba(0, 0, 0, 0.3)",
    track: "rgba(255, 255, 255, 0.12)",
    text: "#eef2ff",
    sub: "#a9b4d6",
    accent: "linear-gradient(90deg, #5fd3c8, #7b8cff)",
    accentText: "#0b1020"
  },

  lava: {
    name: "🌋 日落熔岩",
    bg: "linear-gradient(160deg, #1a0b14 0%, #3a1420 55%, #6b2a1c 100%)",
    card: "rgba(40, 16, 24, 0.7)",
    cardBorder: "rgba(255, 180, 140, 0.12)",
    nav: "rgba(26, 11, 20, 0.7)",
    field: "rgba(0, 0, 0, 0.3)",
    track: "rgba(255, 255, 255, 0.12)",
    text: "#fff1ea",
    sub: "#d9b3a6",
    accent: "linear-gradient(90deg, #ff7a59, #ffb347)",
    accentText: "#1a0b14"
  },

  abyss: {
    name: "🐠 深海螢光",
    bg: "linear-gradient(160deg, #04141f 0%, #0a2a3d 100%)",
    card: "rgba(8, 30, 44, 0.7)",
    cardBorder: "rgba(0, 229, 255, 0.12)",
    nav: "rgba(4, 20, 31, 0.7)",
    field: "rgba(0, 0, 0, 0.3)",
    track: "rgba(255, 255, 255, 0.12)",
    text: "#e6f6fb",
    sub: "#8aa6b5",
    accent: "linear-gradient(90deg, #00e5ff, #7cffcb)",
    accentText: "#04141f"
  },

  dream: {
    name: "🔮 紫金夢境",
    bg: "linear-gradient(160deg, #120a24 0%, #2a1450 100%)",
    card: "rgba(30, 16, 56, 0.7)",
    cardBorder: "rgba(245, 195, 107, 0.14)",
    nav: "rgba(18, 10, 36, 0.7)",
    field: "rgba(0, 0, 0, 0.3)",
    track: "rgba(255, 255, 255, 0.12)",
    text: "#f3eeff",
    sub: "#b9a9d6",
    accent: "linear-gradient(90deg, #b07cf0, #f5c36b)",
    accentText: "#120a24"
  },

  forest: {
    name: "🌲 森林黃昏",
    bg: "linear-gradient(160deg, #0d1a14 0%, #1f3a2a 55%, #3b3018 100%)",
    card: "rgba(16, 32, 24, 0.72)",
    cardBorder: "rgba(123, 237, 159, 0.12)",
    nav: "rgba(13, 26, 20, 0.7)",
    field: "rgba(0, 0, 0, 0.3)",
    track: "rgba(255, 255, 255, 0.12)",
    text: "#eaf4ee",
    sub: "#93a89a",
    accent: "linear-gradient(90deg, #7bed9f, #f2c36b)",
    accentText: "#0d1a14"
  },

  starlight: {
    name: "✨ 星空金邊",
    bg: "linear-gradient(160deg, #0c0c18 0%, #1a1530 100%)",
    card: "rgba(24, 20, 40, 0.75)",
    cardBorder: "rgba(249, 217, 118, 0.35)",
    nav: "rgba(12, 12, 24, 0.7)",
    field: "rgba(0, 0, 0, 0.3)",
    track: "rgba(255, 255, 255, 0.12)",
    text: "#fbf6e6",
    sub: "#bcb296",
    accent: "linear-gradient(90deg, #f9d976, #f39c12)",
    accentText: "#1a1530"
  }

};

/* 預設：不覆蓋任何樣式，保留原本的外觀 */
const THEME_OPTIONS = [
  { key: "default", name: "🌑 原本", accent: "linear-gradient(90deg, #5865f2, #8f9bff)" },
  ...Object.entries(THEMES).map(([key, t]) => ({ key, name: t.name, accent: t.accent }))
];

function themeCss(t) {

  return `
    body {
      background: ${t.bg} !important;
      color: ${t.text} !important;
      min-height: 100vh;
    }

    .card, .modal-box, .auth-card {
      background: ${t.card} !important;
      border-color: ${t.cardBorder} !important;
      color: ${t.text} !important;
    }

    .card h2, .card-head h2, .page-title h1, .modal-title, .auth-card h1 {
      color: ${t.text} !important;
    }

    .page-title p, .small-note, .empty-state, .viz-sub, .viz-tile-note, .viz-tick {
      color: ${t.sub} !important;
    }

    .header-inner, .tab-nav {
      background: ${t.nav} !important;
      border-color: ${t.cardBorder} !important;
    }

    .tab-btn.active, .btn-primary, .chip.active, #exp-progress {
      background: ${t.accent} !important;
      color: ${t.accentText} !important;
      border-color: transparent !important;
    }

    .tab-btn.active .tab-label {
      color: ${t.accentText} !important;
    }

    .exp-bar, .dc-track {
      background: ${t.track} !important;
    }

    input, textarea, select {
      background: ${t.field} !important;
      color: ${t.text} !important;
      border-color: ${t.cardBorder} !important;
    }
  `;

}

function applyTheme(key) {

  const theme = THEMES[key] || null;

  let style = document.getElementById("theme-style");

  if (!style) {
    style = document.createElement("style");
    style.id = "theme-style";
    document.head.appendChild(style);
  }

  style.textContent = theme ? themeCss(theme) : "";

  document.documentElement.dataset.theme = theme ? key : "default";

  renderThemePicker();

}

function setTheme(key) {

  const valid = key === "default" || Boolean(THEMES[key]);

  if (!valid) return;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, key);
  } catch (_) {}

  applyTheme(key);

}

function currentThemeKey() {

  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "default" || (saved && THEMES[saved])) return saved;
  } catch (_) {}

  return "default";

}

function renderThemePicker() {

  const box = document.getElementById("theme-picker");

  if (!box) return;

  const current = document.documentElement.dataset.theme || "default";

  box.innerHTML = `
    <section class="card theme-card">
      <div class="card-head">
        <h2>🎨 主題</h2>
      </div>
      <div class="theme-grid">
        ${THEME_OPTIONS.map(option => `
          <button
            class="theme-option ${option.key === current ? "active" : ""}"
            onclick="setTheme('${option.key}')"
          >
            <span class="theme-swatch" style="background:${option.accent}"></span>
            <span>${option.name}</span>
          </button>`).join("")}
      </div>
    </section>`;

}

/* 一打開網頁就套用上次選的主題 */
applyTheme(currentThemeKey());

/* ==================================================
   📅 日曆
   - 週檢視：拖移行程到任何時間（可跨天），點空白處新增
   - 今日頁：顯示今天的行程，同樣可以拖移
   - Google 日曆：登入或連結後，手動同步（唯讀，不會改動 Google）
   依賴 script.js（db、currentUser、getToday、shiftDate、taipeiToIso、showToast、escapeHtml、safeColor）
================================================== */

const CAL_START_HOUR = 6;
const CAL_END_HOUR = 24;
const CAL_PX_PER_HOUR = 40;      // 需和 index.html 的 .cal-col 背景線距一致
const CAL_SNAP_MINUTES = 15;
const CAL_DEFAULT_MINUTES = 60;
const CAL_COLORS = ["#5865f2", "#0ca30c", "#e0764b", "#ff6b81", "#9b6cff", "#22b8cf", "#8a93a8"];
const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GCAL_LAST_SYNC_KEY = "gcalLastSync";

/* 把「📅 日曆」插在「⏱️ 專注」和「💡 想法」中間 */
if (!PAGES.includes("calendar")) {
  PAGES.splice(PAGES.indexOf("ideas"), 0, "calendar");
}

let calWeekStart = null;       // 這一週的週一（YYYY-MM-DD）
let calWeekEvents = [];
let calTodayEvents = [];
let calDrag = null;
let calBusy = false;


/* ---------- 小工具（時間一律用台灣時間） ---------- */

function calEl(id) {
  return document.getElementById(id);
}

/* 某天台灣時間 00:00 再加上幾分鐘（可以超過 1440，代表隔天） */
function calIsoAt(dateText, minutes) {
  const base = new Date(taipeiToIso(dateText, "00:00")).getTime();
  return new Date(base + minutes * 60000).toISOString();
}

function calHHMM(minutes) {
  const m = Math.min(Math.max(0, Math.round(minutes)), 23 * 60 + 59);
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

/* 從 ISO 取出台灣時間的日期與時間 */
function calDateOf(iso) {
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).slice(0, 10);
}

function calTimeOf(iso) {
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).slice(11, 16);
}

/* 這個時間點在「某一天」的第幾分鐘（可能是負數或超過 1440） */
function calMinutesInDay(iso, dateText) {
  return (new Date(iso).getTime() - new Date(calIsoAt(dateText, 0)).getTime()) / 60000;
}

function calOverlapsDay(ev, dateText) {
  return new Date(ev.starts_at) < new Date(calIsoAt(dateText, 1440))
    && new Date(ev.ends_at) > new Date(calIsoAt(dateText, 0));
}

function calNowMinutes() {
  const t = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

function calMondayOf(dateText) {
  const dow = (new Date(dateText + "T00:00:00Z").getUTCDay() + 6) % 7;
  return shiftDate(dateText, -dow);
}

function calWeekDays() {
  if (!calWeekStart) calWeekStart = calMondayOf(getToday());
  return Array.from({ length: 7 }, (_, i) => shiftDate(calWeekStart, i));
}

function calSetMsg(text, isError = false, id = "cal-msg") {
  const el = calEl(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-error", isError);
}


/* ---------- 讀取 ---------- */

async function calFetch(fromDate, toDate) {

  const { data, error } = await db
    .from("events")
    .select("*")
    .eq("user_id", currentUser.id)
    .lt("starts_at", calIsoAt(toDate, 0))
    .gt("ends_at", calIsoAt(fromDate, 0))
    .order("starts_at")
    .limit(3000);

  if (error) {
    console.error("行程讀取失敗：", error);
    calSetMsg("行程讀取失敗：" + error.message, true);
    return null;
  }

  return data || [];

}


async function calRefreshWeek() {

  if (!currentUser) return;

  const days = calWeekDays();
  const rows = await calFetch(days[0], shiftDate(days[6], 1));

  if (rows) calWeekEvents = rows;

  calRenderWeek();

}


async function calRefreshToday() {

  if (!currentUser) return;

  const today = getToday();
  const rows = await calFetch(today, shiftDate(today, 1));

  if (rows) calTodayEvents = rows;

  calRenderToday();

}


async function calRefreshAll() {
  await calRefreshWeek();
  await calRefreshToday();
}


/* ---------- 畫面 ---------- */

function calChipHtml(ev) {

  const readonly = ev.source === "google";
  const color = safeColor(ev.color);

  return `<div class="cal-chip ${readonly ? "is-readonly" : ""}" data-id="${ev.id}" style="background:${color}">${escapeHtml(ev.title)}</div>`;

}


function calEventHtml(ev, dateText) {

  const dayStart = CAL_START_HOUR * 60;
  const dayEnd = CAL_END_HOUR * 60;

  const startMin = Math.max(calMinutesInDay(ev.starts_at, dateText), dayStart);
  const endMin = Math.min(calMinutesInDay(ev.ends_at, dateText), dayEnd);
  const shownEnd = endMin > startMin ? endMin : startMin + 15;

  const realDuration = Math.max(
    15,
    Math.round((new Date(ev.ends_at) - new Date(ev.starts_at)) / 60000)
  );

  const top = ((startMin - dayStart) / 60) * CAL_PX_PER_HOUR;
  const height = Math.max(((shownEnd - startMin) / 60) * CAL_PX_PER_HOUR, 20);

  const readonly = ev.source === "google";

  return `
    <div class="cal-ev ${readonly ? "is-readonly" : ""}"
      data-id="${ev.id}"
      data-date="${dateText}"
      data-real-dur="${realDuration}"
      style="top:${top}px;height:${height}px;background:${safeColor(ev.color)}"
      title="${escapeHtml(ev.title)}">
      <div class="cal-ev-title">${escapeHtml(ev.title)}</div>
      <div class="cal-ev-time">${calHHMM(startMin)}–${calHHMM(shownEnd)}</div>
    </div>`;

}


/* 畫出時間格（days 可以是一週，也可以是只有今天） */
function calGridHtml(days, events) {

  const hours = CAL_END_HOUR - CAL_START_HOUR;
  const height = hours * CAL_PX_PER_HOUR;
  const today = getToday();
  const nowMin = calNowMinutes();

  const hourLabels = Array.from({ length: hours }, (_, i) =>
    `<div class="cal-hour" style="top:${i * CAL_PX_PER_HOUR}px">${String(CAL_START_HOUR + i).padStart(2, "0")}:00</div>`
  ).join("");

  const heads = days.map(day =>
    `<div class="cal-dayhead ${day === today ? "is-today" : ""}">${shortDateWithWeekday(day)}</div>`
  ).join("");

  const allDay = days.map(day => {
    const items = events.filter(ev => ev.all_day && calOverlapsDay(ev, day));
    return `<div class="cal-allday-col">${items.map(calChipHtml).join("")}</div>`;
  }).join("");

  const cols = days.map(day => {

    const items = events.filter(ev => !ev.all_day && calOverlapsDay(ev, day));

    const nowLine = day === today && nowMin >= CAL_START_HOUR * 60 && nowMin <= CAL_END_HOUR * 60
      ? `<div class="cal-now" style="top:${((nowMin - CAL_START_HOUR * 60) / 60) * CAL_PX_PER_HOUR}px"></div>`
      : "";

    return `
      <div class="cal-col" data-date="${day}" style="height:${height}px">
        ${items.map(ev => calEventHtml(ev, day)).join("")}
        ${nowLine}
      </div>`;

  }).join("");

  const minWidth = 44 + days.length * 64;

  return `
    <div class="cal-scroll">
      <div class="cal-table" style="min-width:${minWidth}px">
        <div class="cal-row cal-head"><div class="cal-gutter"></div>${heads}</div>
        <div class="cal-row cal-allday"><div class="cal-gutter cal-gutter-label">全天</div>${allDay}</div>
        <div class="cal-row cal-body">
          <div class="cal-gutter" style="height:${height}px">${hourLabels}</div>
          ${cols}
        </div>
      </div>
    </div>`;

}


function calRenderWeek() {

  const box = calEl("cal-week");

  if (!box) return;

  if (!currentUser) {
    box.innerHTML = "";
    return;
  }

  const days = calWeekDays();
  const range = calEl("cal-range-label");

  if (range) {
    range.textContent = `${formatShortDate(days[0])} – ${formatShortDate(days[6])}`;
  }

  box.innerHTML = calGridHtml(days, calWeekEvents);

}


function calRenderToday() {

  const box = calEl("cal-today");

  if (!box) return;

  if (!currentUser) {
    box.innerHTML = "";
    return;
  }

  const today = getToday();

  box.innerHTML = calGridHtml([today], calTodayEvents);

  /* 第一次打開時，捲到現在附近 */
  const scroll = box.querySelector(".cal-scroll");

  if (scroll && !scroll.dataset.started) {
    scroll.dataset.started = "1";
    const nowMin = calNowMinutes();
    const target = ((nowMin - CAL_START_HOUR * 60) / 60) * CAL_PX_PER_HOUR - 120;
    scroll.scrollTop = Math.max(0, target);
  }

}


function calRenderGcalInfo() {

  const last = calEl("cal-gcal-last");

  if (!last) return;

  let text = "尚未同步";

  try {
    const saved = localStorage.getItem(GCAL_LAST_SYNC_KEY);
    if (saved) text = "上次同步：" + new Date(saved).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  } catch (_) {}

  last.textContent = text;

}


/* ---------- 週導覽 ---------- */

function calShiftWeek(n) {

  if (!calWeekStart) calWeekStart = calMondayOf(getToday());

  calWeekStart = shiftDate(calWeekStart, n);

  calRefreshWeek();

}


function calGoThisWeek() {

  calWeekStart = calMondayOf(getToday());

  calRefreshWeek();

}


/* ---------- 新增 / 編輯 ---------- */

function calCloseEditor() {

  const overlay = calEl("cal-editor");

  if (overlay) overlay.remove();

}


function calPickColor(button) {

  document.querySelectorAll("#cal-editor .cal-swatch").forEach(item => item.classList.remove("active"));

  button.classList.add("active");

}


/*
  編輯視窗
  options：{ id, title, date, start, end, color }（時間是 HH:MM）
*/
function calOpenEditor(options) {

  calCloseEditor();

  const o = {
    id: null,
    title: "",
    date: getToday(),
    start: "09:00",
    end: "10:00",
    color: CAL_COLORS[0],
    ...options
  };

  const overlay = document.createElement("div");

  overlay.id = "cal-editor";
  overlay.className = "cal-overlay";

  overlay.innerHTML = `
    <div class="modal-box cal-dialog" role="dialog" aria-modal="true">
      <div class="cal-dialog-title">${o.id ? "編輯行程" : "新增行程"}</div>

      <label class="cal-field">
        標題
        <input id="ce-title" maxlength="120" value="${escapeHtml(o.title)}" placeholder="例如：英文課、午餐">
      </label>

      <label class="cal-field">
        日期
        <input id="ce-date" type="date" value="${o.date}">
      </label>

      <div class="cal-field-row">
        <label class="cal-field">
          開始
          <input id="ce-start" type="time" value="${o.start}">
        </label>
        <label class="cal-field">
          結束
          <input id="ce-end" type="time" value="${o.end}">
        </label>
      </div>

      <div class="cal-colors">
        ${CAL_COLORS.map(color => `
          <button type="button"
            class="cal-swatch ${color === o.color ? "active" : ""}"
            data-color="${color}"
            style="background:${color}"
            onclick="calPickColor(this)"
            aria-label="${color}"></button>`).join("")}
      </div>

      <div class="cal-msg" id="ce-msg"></div>

      <div class="cal-actions">
        ${o.id ? `<button class="btn btn-danger" onclick="calDeleteFromEditor(${o.id})">刪除</button>` : ""}
        <span style="flex:1"></span>
        <button class="btn" onclick="calCloseEditor()">取消</button>
        <button class="btn btn-primary" onclick="calSaveFromEditor(${o.id ? o.id : "null"})">儲存</button>
      </div>
    </div>`;

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) calCloseEditor();
  });

  document.body.appendChild(overlay);

  setTimeout(() => {
    const title = calEl("ce-title");
    if (title) title.focus();
  }, 0);

}


function calNewAt(startMinutes = null) {

  let start = startMinutes;

  if (start === null) {
    const nowMin = calNowMinutes();
    start = Math.min(Math.max(Math.ceil(nowMin / 60) * 60, 8 * 60), 22 * 60);
  }

  calOpenEditor({
    date: getToday(),
    start: calHHMM(start),
    end: calHHMM(start + CAL_DEFAULT_MINUTES)
  });

}


function calOpenEditorFromId(id) {

  const ev = [...calWeekEvents, ...calTodayEvents].find(item => String(item.id) === String(id));

  if (!ev) return;

  if (ev.source === "google") {
    showToast("這是 Google 日曆的行程，請到 Google 日曆修改");
    return;
  }

  calOpenEditor({
    id: ev.id,
    title: ev.title,
    date: calDateOf(ev.starts_at),
    start: calTimeOf(ev.starts_at),
    end: calTimeOf(ev.ends_at),
    color: ev.color
  });

}


async function calSaveFromEditor(id) {

  const msg = (text) => {
    const el = calEl("ce-msg");
    if (el) el.textContent = text;
  };

  const title = calEl("ce-title").value.trim();
  const date = calEl("ce-date").value;
  const start = calEl("ce-start").value;
  const end = calEl("ce-end").value;
  const color = document.querySelector("#cal-editor .cal-swatch.active")?.dataset.color || CAL_COLORS[0];

  if (!title) return msg("請輸入標題");
  if (!date || !start || !end) return msg("請選日期與時間");

  const startsAt = taipeiToIso(date, start);
  const endsAt = taipeiToIso(date, end);

  if (new Date(endsAt) <= new Date(startsAt)) return msg("結束時間要比開始晚");

  const row = {
    title,
    starts_at: startsAt,
    ends_at: endsAt,
    color,
    updated_at: new Date().toISOString()
  };

  const { error } = id
    ? await db.from("events").update(row).eq("id", id).eq("user_id", currentUser.id)
    : await db.from("events").insert({ ...row, user_id: currentUser.id, source: "local", all_day: false });

  if (error) {
    console.error("行程儲存失敗：", error);
    return msg("儲存失敗：" + error.message);
  }

  calCloseEditor();
  calSetMsg("✅ 已儲存");
  await calRefreshAll();

}


async function calDeleteFromEditor(id) {

  if (!confirm("刪除這個行程？")) return;

  const { error } = await db
    .from("events")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("刪除失敗：" + error.message);
    return;
  }

  calCloseEditor();
  await calRefreshAll();

}


/* ---------- 拖移 ---------- */

/* 把一個行程移到指定日期與開始時間（先更新畫面，再寫入資料庫） */
async function calMoveEvent(id, dateText, startMin, duration) {

  const startsAt = calIsoAt(dateText, startMin);
  const endsAt = calIsoAt(dateText, startMin + duration);

  for (const list of [calWeekEvents, calTodayEvents]) {
    const ev = list.find(item => String(item.id) === String(id));
    if (ev) {
      ev.starts_at = startsAt;
      ev.ends_at = endsAt;
    }
  }

  calRenderWeek();
  calRenderToday();

  const { error } = await db
    .from("events")
    .update({ starts_at: startsAt, ends_at: endsAt, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("移動失敗：", error);
    calSetMsg("移動失敗：" + error.message, true);
    await calRefreshAll();
  }

}


/* 把螢幕上的 Y 座標換成這一欄的分鐘（對齊到 15 分鐘） */
function calMinuteAtY(col, y) {

  const rect = col.getBoundingClientRect();
  const raw = CAL_START_HOUR * 60 + ((y - rect.top) / CAL_PX_PER_HOUR) * 60;

  return Math.round(raw / CAL_SNAP_MINUTES) * CAL_SNAP_MINUTES;

}


function calColumnAtX(x) {

  const cols = [...document.querySelectorAll(".cal-col")];

  return cols.find(col => {
    const rect = col.getBoundingClientRect();
    return rect.width > 0 && x >= rect.left && x < rect.right;
  }) || null;

}


/* ---------- Google 日曆 ---------- */

async function gcalSignIn() {

  const { error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: location.origin + location.pathname,
      scopes: GCAL_SCOPE,
      queryParams: { access_type: "offline", prompt: "consent" }
    }
  });

  if (error) alert("Google 登入失敗：" + error.message);

}


/* 已用 email 登入的人，連結 Google 身分並取得日曆授權 */
async function gcalLink() {

  if (!currentUser) return;

  const { error } = await db.auth.linkIdentity({
    provider: "google",
    options: {
      redirectTo: location.origin + location.pathname,
      scopes: GCAL_SCOPE,
      queryParams: { access_type: "offline", prompt: "consent" }
    }
  });

  if (error) calSetMsg("連結失敗：" + error.message, true, "cal-gcal-msg");

}


async function gcalGet(url, token) {

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (!res.ok) {
    const error = new Error(`Google 回應 ${res.status}`);
    error.status = res.status;
    throw error;
  }

  return res.json();

}


/* Google 的一筆行程 → 我們的 events 格式（唯讀） */
function gcalRow(item, cal) {

  const allDay = Boolean(item.start && item.start.date);

  const startsAt = allDay
    ? calIsoAt(item.start.date, 0)
    : new Date(item.start.dateTime).toISOString();

  let endsAt = allDay
    ? calIsoAt(item.end.date, 0)
    : new Date(item.end.dateTime).toISOString();

  if (new Date(endsAt) <= new Date(startsAt)) {
    endsAt = new Date(new Date(startsAt).getTime() + 30 * 60000).toISOString();
  }

  return {
    title: String(item.summary || "（無標題）").slice(0, 120),
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: allDay,
    color: safeColor(cal.backgroundColor),
    source: "google",
    google_calendar_id: cal.id,
    google_event_id: item.id,
    calendar_name: String(cal.summary || "").slice(0, 60),
    location: item.location ? String(item.location).slice(0, 200) : null
  };

}


async function gcalSync() {

  if (!currentUser || calBusy) return;

  const { data } = await db.auth.getSession();
  const token = data && data.session ? data.session.provider_token : null;

  if (!token) {
    calSetMsg("還沒有 Google 日曆授權。請按「連結 Google 日曆」，或用 Google 登入後再同步。", true, "cal-gcal-msg");
    return;
  }

  calBusy = true;
  calSetMsg("同步中…", false, "cal-gcal-msg");

  try {

    const calendars = await gcalGet(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250",
      token
    );

    const now = Date.now();
    const timeMin = new Date(now - 30 * 86400000).toISOString();
    const timeMax = new Date(now + 90 * 86400000).toISOString();

    const rows = [];

    for (const cal of calendars.items || []) {

      let pageToken = "";

      do {

        const params = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "250"
        });

        if (pageToken) params.set("pageToken", pageToken);

        const page = await gcalGet(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
          token
        );

        for (const item of page.items || []) {
          if (item.status === "cancelled") continue;
          rows.push(gcalRow(item, cal));
        }

        pageToken = page.nextPageToken || "";

      } while (pageToken);

    }

    /* 先清掉這段時間的舊 Google 行程，再寫入最新的（Google 刪掉的也會跟著消失） */
    const uid = currentUser.id;

    const { error: deleteError } = await db
      .from("events")
      .delete()
      .eq("user_id", uid)
      .eq("source", "google")
      .gte("starts_at", timeMin)
      .lte("starts_at", timeMax);

    if (deleteError) throw deleteError;

    for (let i = 0; i < rows.length; i += 500) {

      const batch = rows.slice(i, i + 500).map(row => ({ ...row, user_id: uid }));

      const { error } = await db
        .from("events")
        .upsert(batch, { onConflict: "user_id,google_calendar_id,google_event_id" });

      if (error) throw error;

    }

    try {
      localStorage.setItem(GCAL_LAST_SYNC_KEY, new Date().toISOString());
    } catch (_) {}

    calRenderGcalInfo();
    calSetMsg(`✅ 已同步 ${rows.length} 筆（${(calendars.items || []).length} 個日曆）`, false, "cal-gcal-msg");

    await calRefreshAll();

  } catch (error) {

    console.error("Google 日曆同步失敗：", error);

    calSetMsg(
      error.status === 401
        ? "Google 授權已過期，請按「連結 Google 日曆」重新授權。"
        : "同步失敗：" + (error.message || error),
      true,
      "cal-gcal-msg"
    );

  } finally {

    calBusy = false;

  }

}


/* ---------- 拖移事件（全域監聽，今日頁與日曆頁共用） ---------- */

document.addEventListener("pointerdown", (event) => {

  const block = event.target.closest(".cal-ev");

  if (block) {

    if (block.classList.contains("is-readonly")) return;

    const rect = block.getBoundingClientRect();

    calDrag = {
      kind: "event",
      el: block,
      id: block.dataset.id,
      date: block.dataset.date,
      duration: Number(block.dataset.realDur),
      grabY: event.clientY - rect.top,
      sx: event.clientX,
      sy: event.clientY,
      moved: false
    };

    return;
  }

  const col = event.target.closest(".cal-col");

  if (col) {
    calDrag = { kind: "column", col, sx: event.clientX, sy: event.clientY, moved: false };
  }

});


document.addEventListener("pointermove", (event) => {

  const drag = calDrag;

  if (!drag || drag.kind !== "event") return;

  const dx = event.clientX - drag.sx;
  const dy = event.clientY - drag.sy;

  if (!drag.moved && Math.hypot(dx, dy) < 6) return;

  drag.moved = true;
  drag.el.classList.add("is-dragging");
  drag.el.style.transform = `translate(${dx}px, ${dy}px)`;

});


document.addEventListener("pointerup", async (event) => {

  const drag = calDrag;

  calDrag = null;

  if (!drag) return;

  const distance = Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy);

  /* 點空白格子：新增 */
  if (drag.kind === "column") {

    if (distance < 6) {
      const start = calMinuteAtY(drag.col, event.clientY);
      calNewAt(Math.min(Math.max(start, CAL_START_HOUR * 60), (CAL_END_HOUR - 1) * 60));
    }

    return;

  }

  /* 點一下行程：編輯 */
  if (!drag.moved) {
    drag.el.style.transform = "";
    calOpenEditorFromId(drag.id);
    return;
  }

  drag.el.classList.remove("is-dragging");
  drag.el.style.transform = "";

  const col = calColumnAtX(event.clientX);

  if (!col) {
    calRenderWeek();
    calRenderToday();
    return;
  }

  const elementTop = event.clientY - drag.grabY;
  const raw = calMinuteAtY(col, elementTop);
  const min = CAL_START_HOUR * 60;
  const max = CAL_END_HOUR * 60 - drag.duration;
  const start = Math.min(Math.max(raw, min), Math.max(min, max));

  await calMoveEvent(drag.id, col.dataset.date, start, drag.duration);

});


/* 點 Google 行程：提示唯讀 */
document.addEventListener("click", (event) => {

  const block = event.target.closest(".cal-ev.is-readonly, .cal-chip.is-readonly");

  if (block) {
    showToast("這是 Google 日曆的行程，請到 Google 日曆修改");
  }

});


/* ---------- 啟動 ---------- */

(function calInit() {

  if (typeof applyPage === "function") {
    const originalApplyPage = applyPage;
    applyPage = function (name) {
      originalApplyPage(name);
      if (name === "calendar") calRefreshWeek();
      if (name === "today") calRefreshToday();
    };
  }

  /* 每分鐘重新讀取，讓紅線與行程保持最新 */
  setInterval(() => {
    if (!currentUser) return;
    if (currentPageFromHash() === "today") calRefreshToday();
    if (currentPageFromHash() === "calendar") calRefreshWeek();
  }, 60000);

  /* 載入完成後補一次（登入狀態可能比這個腳本晚出現） */
  setTimeout(() => {
    calRenderGcalInfo();
    calRefreshAll();
  }, 1500);

})();
