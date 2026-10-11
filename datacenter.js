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


function dcRenderProgress() {

  const box = dcEl("dc-progress");

  if (!box) return;

  if (!currentUser) {
    box.innerHTML = "";
    return;
  }

  const elapsed = dcDayFraction();
  const completion = dcTodayCompletion();

  let status = `<span class="small-note">今天還沒有任務或習慣</span>`;

  if (completion.ratio !== null) {
    const gap = Math.round((completion.ratio - elapsed) * 100);
    status = gap >= 0
      ? `<span class="dc-ahead">領先時間 ${gap}%</span>`
      : `<span class="dc-behind">落後時間 ${-gap}%</span>`;
  }

  box.innerHTML = `
    <section class="card dc-progress-card">
      <div class="dc-bar-head">
        <span>⏱️ 今天已過</span>
        <b>${(elapsed * 100).toFixed(2)}%</b>
      </div>
      <div class="dc-track"><div class="dc-fill dc-fill-time" style="width:${(elapsed * 100).toFixed(2)}%"></div></div>

      <div class="dc-bar-head" style="margin-top:12px;">
        <span>✅ 今日完成 ${completion.done} / ${completion.total}</span>
        <b>${completion.ratio === null ? "—" : (completion.ratio * 100).toFixed(1) + "%"}</b>
      </div>
      <div class="dc-track"><div class="dc-fill" style="width:${((completion.ratio || 0) * 100).toFixed(2)}%"></div></div>
      <div style="margin-top:6px;">${status}</div>
    </section>`;

}


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
