/* ==================================================
   📊 專注統計（專注頁下方）
   - 今日／本週／本月總時數
   - 每日時數長條圖（7 天或 30 天，可切換）
   - 科目統計表（時數、次數、佔比、平均每次）
   - 最近 10 筆紀錄
   依賴 script.js 的 db、currentUser、getToday、shiftDate、escapeHtml、loadFocus、applyPage
   與 calendar.js 的 calMondayOf
================================================== */

const FS_RANGE_KEY = "fsRange";
let fsRange = 30;
let fsSessions = [];

(function fsReadRange() {
  try {
    const saved = Number(localStorage.getItem(FS_RANGE_KEY));
    if (saved === 7 || saved === 30) fsRange = saved;
  } catch (_) {}
})();


function fsEl(id) {
  return document.getElementById(id);
}


function fsSum(rows) {
  return rows.reduce((total, row) => total + (Number(row.duration_seconds) || 0), 0);
}


/* 秒 → 1h 20m / 45m */
function fsFmt(seconds) {
  const minutes = Math.round((seconds || 0) / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}


function fsStartTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).slice(11, 16);
}


/* 讀取最近 90 天的專注紀錄（統計用） */
async function fsLoad() {

  if (!currentUser) {
    fsSessions = [];
    fsRender();
    return;
  }

  const today = getToday();

  const { data, error } = await db
    .from("focus_sessions")
    .select("session_date,subject,duration_seconds,started_at")
    .eq("user_id", currentUser.id)
    .gte("session_date", shiftDate(today, -89))
    .lte("session_date", today)
    .order("started_at", { ascending: false })
    .limit(5000);

  if (error) {
    console.error("專注統計讀取失敗：", error);
    return;
  }

  fsSessions = data || [];
  fsRender();

}


function fsSetRange(days) {

  fsRange = days === 7 ? 7 : 30;

  try {
    localStorage.setItem(FS_RANGE_KEY, String(fsRange));
  } catch (_) {}

  fsRender();

}


function fsRender() {

  const box = fsEl("focus-stats");

  if (!box) return;

  if (!currentUser) {
    box.innerHTML = "";
    return;
  }

  const today = getToday();
  const monday = calMondayOf(today);
  const monthStart = today.slice(0, 8) + "01";

  const between = (from, to) => fsSessions.filter(row => row.session_date >= from && row.session_date <= to);

  const todaySec = fsSum(between(today, today));
  const weekRows = between(monday, today);
  const monthRows = between(monthStart, today);
  const rangeStart = shiftDate(today, -(fsRange - 1));
  const rangeRows = between(rangeStart, today);

  /* 每日時數 */
  const days = Array.from({ length: fsRange }, (_, i) => shiftDate(rangeStart, i));
  const perDay = days.map(day => ({
    date: day,
    sec: fsSum(rangeRows.filter(row => row.session_date === day))
  }));

  const maxSec = Math.max(...perDay.map(item => item.sec), 1);
  const labelStep = fsRange === 7 ? 1 : 5;

  const bars = perDay.map((item, index) => {
    const height = Math.round((item.sec / maxSec) * 100);
    return `<div class="fs-bar-col" title="${item.date}：${fsFmt(item.sec)}">
      <div class="fs-bar" style="height:${height}%"></div>
    </div>`;
  }).join("");

  const axis = perDay.map((item, index) => {
    const show = index % labelStep === 0 || index === perDay.length - 1;
    return `<span>${show ? item.date.slice(5) : ""}</span>`;
  }).join("");

  /* 科目統計 */
  const bySubject = new Map();

  for (const row of rangeRows) {
    const key = row.subject || "未分類";
    const cur = bySubject.get(key) || { subject: key, sec: 0, count: 0 };
    cur.sec += Number(row.duration_seconds) || 0;
    cur.count += 1;
    bySubject.set(key, cur);
  }

  const subjects = [...bySubject.values()].sort((a, b) => b.sec - a.sec);
  const rangeTotal = fsSum(rangeRows) || 1;

  const subjectRows = subjects.map(item => {
    const pct = Math.round((item.sec / rangeTotal) * 100);
    const avg = item.count ? item.sec / item.count : 0;
    return `<tr>
      <td>${escapeHtml(item.subject)}</td>
      <td>${fsFmt(item.sec)}</td>
      <td>${item.count}</td>
      <td>
        ${pct}%
        <div class="fs-pctbar"><i style="width:${pct}%"></i></div>
      </td>
      <td>${fsFmt(avg)}</td>
    </tr>`;
  }).join("");

  /* 最近紀錄 */
  const recent = fsSessions.slice(0, 10).map(row => `
    <li>
      <span class="fs-recent-date">${row.session_date.slice(5)} ${fsStartTime(row.started_at)}</span>
      <span class="fs-recent-subject">${escapeHtml(row.subject || "未分類")}</span>
      <span class="fs-recent-dur">${fsFmt(row.duration_seconds)}</span>
    </li>`).join("");

  box.innerHTML = `
    <section class="card fs-card">
      <div class="card-head">
        <h2>📊 專注統計</h2>
        <div class="card-head-right">
          <div class="segmented">
            <button class="seg-btn ${fsRange === 7 ? "active" : ""}" onclick="fsSetRange(7)">7 天</button>
            <button class="seg-btn ${fsRange === 30 ? "active" : ""}" onclick="fsSetRange(30)">30 天</button>
          </div>
        </div>
      </div>

      <div class="fs-grid">
        <div class="fs-tile"><b>${fsFmt(todaySec)}</b><span>今日</span></div>
        <div class="fs-tile"><b>${fsFmt(fsSum(weekRows))}</b><span>本週（${weekRows.length} 次）</span></div>
        <div class="fs-tile"><b>${fsFmt(fsSum(monthRows))}</b><span>本月（${monthRows.length} 次）</span></div>
      </div>

      <h3 class="fs-sub">每日時數（近 ${fsRange} 天）</h3>
      <div class="fs-bars">${bars}</div>
      <div class="fs-axis">${axis}</div>

      <h3 class="fs-sub">科目統計（近 ${fsRange} 天）</h3>
      ${subjects.length
        ? `<div class="fs-table-wrap">
            <table class="fs-table">
              <thead>
                <tr><th>科目</th><th>時數</th><th>次數</th><th>佔比</th><th>平均每次</th></tr>
              </thead>
              <tbody>${subjectRows}</tbody>
            </table>
          </div>`
        : `<p class="small-note">這段時間還沒有專注紀錄。</p>`}

      <h3 class="fs-sub">最近紀錄</h3>
      ${recent
        ? `<ul class="fs-recent">${recent}</ul>`
        : `<p class="small-note">還沒有紀錄。</p>`}
    </section>`;

}


/* 樣式：用注入的方式加上，不改動 index.html 的 CSS */
(function fsInjectStyle() {

  const style = document.createElement("style");

  style.id = "fs-style";
  style.textContent = `
    .fs-card h3.fs-sub { font-size: 14px; margin: 16px 0 6px; opacity: .85; }
    .fs-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
    .fs-tile { background: rgba(127,127,127,.12); border-radius: 12px; padding: 10px 6px; text-align: center; }
    .fs-tile b { display: block; font-size: 17px; }
    .fs-tile span { font-size: 12px; opacity: .7; }
    .fs-bars { display: flex; align-items: flex-end; gap: 3px; height: 120px; }
    .fs-bar-col { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; min-width: 0; }
    .fs-bar { width: 100%; min-height: 2px; background: var(--fs-accent, #5865f2); border-radius: 4px 4px 0 0; }
    .fs-axis { display: flex; gap: 3px; font-size: 10px; opacity: .65; margin-top: 4px; }
    .fs-axis span { flex: 1; min-width: 0; text-align: center; white-space: nowrap; overflow: visible; }
    .fs-table-wrap { overflow-x: auto; }
    .fs-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .fs-table th, .fs-table td { padding: 7px 4px; border-bottom: 1px solid rgba(127,127,127,.2); text-align: right; white-space: nowrap; }
    .fs-table th:first-child, .fs-table td:first-child { text-align: left; white-space: normal; }
    .fs-pctbar { height: 5px; border-radius: 3px; background: rgba(127,127,127,.2); overflow: hidden; margin-top: 3px; }
    .fs-pctbar i { display: block; height: 100%; background: var(--fs-accent, #5865f2); }
    .fs-recent { list-style: none; padding: 0; margin: 0; }
    .fs-recent li { display: flex; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid rgba(127,127,127,.2); font-size: 13px; }
    .fs-recent-date { opacity: .65; min-width: 74px; }
    .fs-recent-subject { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fs-recent-dur { font-weight: 600; }
    @media (max-width: 480px) {
      .fs-grid { gap: 6px; }
      .fs-tile b { font-size: 15px; }
    }
  `;

  document.head.appendChild(style);

})();


/* 專注紀錄變動（loadFocus）與切到專注頁時，同步更新統計 */
(function fsInit() {

  if (typeof loadFocus === "function") {
    const originalLoadFocus = loadFocus;
    loadFocus = async function (...args) {
      const result = await originalLoadFocus(...args);
      fsLoad();
      return result;
    };
  }

  if (typeof applyPage === "function") {
    const originalApplyPage = applyPage;
    applyPage = function (name) {
      originalApplyPage(name);
      if (name === "focus") fsLoad();
    };
  }

  /* 每分鐘更新一次（跨日時用） */
  setInterval(() => {
    if (currentPageFromHash() === "focus") fsLoad();
  }, 60000);

  setTimeout(fsLoad, 1700);

})();
