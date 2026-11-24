/* 🎯 極簡模式：跟遊戲模式一樣一個開關（存在 user_settings.mini_mode，本機也記一份）
   打開後只留：打卡（晨間・習慣・喝水・收尾）、任務、專注、改善、複習（多益／單字／複習卡分開）、📊 數據
   其他只是藏起來；經驗、金幣等照常在背景累積，資料都不動
   另外新增「📊 數據」頁（今日 → 📊 數據），一般模式也看得到 */
(function () {
  const LS = "miniMode";
  const ALLOW = new Set(["today", "stats", "tasks", "focus", "toeic", "vocab", "kb", "wrong", "dash", "life", "improve"]);
  const TODAY_KEEP = [".page-title", ".game-mode-bar", ".subnav", ".dp-banner", "#mini-hub", "#morning-card", "#today-checkin", "#today-life", "#im-today", "#habits-card", "#tasks-card", "#health-card", "#wrapup-card"];
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let on = false; try { on = localStorage.getItem(LS) === "1"; } catch (_) {}

  const todayStr = () => (typeof getToday === "function" ? getToday() : new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10));
  const addDay = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const md = d => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

  window.Mini = { blocks: k => on && !ALLOW.has(k), isOn: () => on, toggle: () => setOn(!on) };

  /* ---------- 樣式 ---------- */
  const st = document.createElement("style");
  st.textContent = `
    body.mini-on .page[data-page="today"] > :not(${TODAY_KEEP.join(",")}) { display: none !important; }
    body.mini-on #game-mode-toggle, body.mini-on #game-checkin-chip, body.mini-on .tab-nav .tab-btn[data-group="game"] { display: none !important; }
    body:not(.mini-on) #mini-hub { display: none !important; }
    #mini-toggle.is-on { border-color: #3fb950; background: #12301a; color: #b8f5c4; }
    .mh-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .mh-grid button { border: 1px solid rgba(127,127,127,.25); background: rgba(127,127,127,.08); color: inherit; border-radius: 12px; padding: 12px 4px; font: inherit; font-size: 14px; cursor: pointer; }
    .mh-grid button small { display: block; font-size: 11.5px; opacity: .65; margin-top: 2px; }
    .st-tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    @media (min-width: 640px) { .st-tiles { grid-template-columns: repeat(4, 1fr); } }
    .st-tile { padding: 10px 12px; border-radius: 12px; background: rgba(127,127,127,.08); }
    .st-tile b { display: block; font-size: 22px; } .st-tile span { font-size: 12px; opacity: .7; }
    .st-chart h3 { margin: 0 0 2px; font-size: 15px; } .st-chart p { margin: 0 0 6px; font-size: 12px; opacity: .65; }
    .st-chart svg { width: 100%; height: auto; display: block; } .st-chart svg text { fill: currentColor; opacity: .6; font-size: 10px; }
    .st-leg { display: flex; gap: 12px; font-size: 12px; opacity: .8; margin-top: 4px; } .st-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; }`;
  document.head.appendChild(st);

  /* ---------- 開關 ---------- */
  function paint() {
    document.body.classList.toggle("mini-on", on);
    const b = document.getElementById("mini-toggle");
    if (b) { b.classList.toggle("is-on", on); b.textContent = on ? "🎯 極簡模式：開" : "🎯 極簡模式：關"; b.setAttribute("aria-pressed", on); }
    try { localStorage.setItem(LS, on ? "1" : "0"); } catch (_) {}
    if (window.Features && window.Features.refresh) window.Features.refresh();
    else if (window.NavGroups) window.NavGroups.refresh();
    const cur = (typeof currentPageFromHash === "function" && currentPageFromHash()) || "today";
    if (on && !ALLOW.has(cur) && typeof showPage === "function") showPage("today");
    if (on) loadHub();
  }
  async function setOn(v) {
    on = v; paint();
    if (!hasDb()) return;
    const { error } = await db.from("user_settings").upsert({ user_id: currentUser.id, mini_mode: v, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) toast("極簡模式同步失敗，這台裝置仍會記住：" + error.message);
  }
  async function loadRemote() {
    const { data, error } = await db.from("user_settings").select("mini_mode").eq("user_id", currentUser.id).maybeSingle();
    if (!error && data && data.mini_mode !== on) { on = !!data.mini_mode; paint(); }
  }
  function addToggle() {
    const bar = document.querySelector('.page[data-page="today"] .game-mode-bar');
    if (!bar || document.getElementById("mini-toggle")) return;
    bar.style.gap = "8px"; bar.style.flexWrap = "wrap";
    const b = document.createElement("button");
    b.id = "mini-toggle"; b.type = "button"; b.className = "game-mode-toggle";
    b.addEventListener("click", () => setOn(!on));
    bar.insertBefore(b, bar.firstChild);
  }

  /* ---------- 今日頁的快速入口（只在極簡模式顯示） ---------- */
  function ensureHub() {
    const tp = document.querySelector('.page[data-page="today"]'); if (!tp) return null;
    let hub = document.getElementById("mini-hub");
    if (!hub) {
      hub = document.createElement("section"); hub.className = "card"; hub.id = "mini-hub";
      const ref = tp.querySelector(":scope > .dp-banner") || tp.querySelector(":scope > .game-mode-bar");
      ref ? ref.after(hub) : tp.prepend(hub);
    }
    return hub;
  }
  async function loadHub() {
    const hub = ensureHub(); if (!hub) return;
    const go = [["focus", "⏱️ 專注", ""], ["improve", "🎯 改善", ""], ["stats", "📊 數據", ""], ["kb", "🧠 複習卡", "kb"], ["vocab", "📖 單字", "vocab"], ["toeic", "🎯 多益", "toeic"]];
    const render = due => { hub.innerHTML = `<h2 style="margin:0 0 10px">🎯 今天</h2><div class="mh-grid">${go.map(([p, l, k]) => `<button type="button" data-mini-go="${p}">${l}${k ? `<small>${due[k] == null ? "…" : due[k] ? `到期 ${due[k]}` : "今天清空 ✓"}</small>` : ""}</button>`).join("")}</div>`; };
    render({});
    if (!hasDb()) return;
    const t = todayStr();
    const cnt = r => (r && !r.error ? r.count || 0 : null);
    const [kc, vw, tr] = await Promise.all([
      db.from("kb_cards").select("id", { count: "exact", head: true }).lte("due", t).eq("suspended", false),
      db.from("vocab_words").select("id", { count: "exact", head: true }).lte("due", t),
      db.from("toeic_review").select("qid", { count: "exact", head: true }).lte("due", t)]);
    render({ kb: cnt(kc), vocab: cnt(vw), toeic: cnt(tr) });
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-mini-go]"); if (b && typeof showPage === "function") showPage(b.dataset.miniGo);
    const r = e.target.closest("[data-st-range]"); if (r) { S.range = Number(r.dataset.stRange); loadStats(); }
  });

  /* ---------- 📊 數據頁 ---------- */
  const S = { range: 7 };
  function ensureStats() {
    let page = document.querySelector('.page[data-page="stats"]');
    if (!page) {
      const c = document.querySelector("#app-section > .container"); if (!c) return null;
      page = document.createElement("div"); page.className = "page"; page.dataset.page = "stats";
      page.innerHTML = `<div id="st-root"><section class="card"><p class="small-note">載入中…</p></section></div>`; c.appendChild(page);
    }
    if (typeof PAGES !== "undefined" && Array.isArray(PAGES) && !PAGES.includes("stats")) PAGES.push("stats");
    return page;
  }

  /* 長條圖：series = [{ name, color, values }]，多組會疊起來 */
  function bars(days, series, opt) {
    opt = opt || {};
    const W = 640, H = 150, L = 34, B = 20, T = 8, n = days.length;
    const tot = days.map((_, i) => series.reduce((s, x) => s + (x.values[i] || 0), 0));
    const max = opt.max || Math.max(1, ...tot) * 1.1, cw = (W - L) / n, bw = Math.max(3, Math.min(28, cw * 0.62));
    const y = v => H - B - (v / max) * (H - B - T);
    let g = "";
    [0, 0.5, 1].forEach(f => { const v = max * f, yy = y(v); g += `<line x1="${L}" x2="${W}" y1="${yy}" y2="${yy}" stroke="currentColor" stroke-opacity=".12"/><text x="${L - 4}" y="${yy + 3}" text-anchor="end">${opt.fmt ? opt.fmt(v) : max < 5 ? Math.round(v * 10) / 10 : Math.round(v)}</text>`; });
    if (opt.goal) { const yy = y(opt.goal); g += `<line x1="${L}" x2="${W}" y1="${yy}" y2="${yy}" stroke="#3fb950" stroke-dasharray="4 4" stroke-opacity=".7"/>`; }
    days.forEach((d, i) => {
      let base = 0; const x = L + cw * i + (cw - bw) / 2;
      series.forEach(s => { const v = s.values[i] || 0; if (v > 0) { const y1 = y(base + v), y0 = y(base); g += `<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(1, y0 - y1)}" rx="3" fill="${s.color}"><title>${md(d)} ${esc(s.name)}：${opt.fmt ? opt.fmt(v) : v}</title></rect>`; } base += v; });
      const every = n > 10 ? Math.ceil(n / 8) : 1;
      if (i % every === 0 || i === n - 1) g += `<text x="${L + cw * i + cw / 2}" y="${H - 5}" text-anchor="middle">${md(d)}</text>`;
    });
    const leg = series.length > 1 ? `<div class="st-leg">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>` : "";
    return `<svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg>${leg}`;
  }
  const chart = (title, note, svg) => `<section class="card st-chart"><h3>${title}</h3><p>${note}</p>${svg}</section>`;

  async function loadStats() {
    const page = ensureStats(); if (!page || !hasDb()) return;
    const root = page.querySelector("#st-root");
    const t = todayStr(), n = S.range, from = addDay(t, -(n - 1)), days = [...Array(n)].map((_, i) => addDay(from, i));
    const idx = {}; days.forEach((d, i) => { idx[d] = i; });
    const zero = () => days.map(() => 0);
    const q = (tb, cols, dcol, extra) => { let r = db.from(tb).select(cols).gte(dcol, from).lte(dcol, t); if (extra) r = extra(r); return r.limit(5000); };
    const res = await Promise.all([
      q("focus_sessions", "session_date, duration_seconds", "session_date"),
      q("tasks", "task_date, completed, skipped", "task_date"),
      q("morning_checkins", "check_date", "check_date"),
      db.from("morning_items").select("id").eq("enabled", true),
      q("habit_logs", "log_date", "log_date"),
      db.from("habits").select("id").eq("active", true),
      db.from("sleep_logs").select("night_date, bed_at, wake_at").gte("night_date", addDay(from, -1)).lte("night_date", t).limit(500),
      q("water_logs", "log_date, ml", "log_date"),
      q("improve_marks", "day", "day"),
      q("kb_log", "day", "day"),
      q("vocab_log", "day", "day"),
      q("toeic_answers", "day", "day"),
      db.from("user_settings").select("accum").maybeSingle(),
      db.from("morning_checkins").select("check_date").gte("check_date", addDay(t, -120)).limit(5000),
      db.from("habit_logs").select("log_date").gte("log_date", addDay(t, -120)).limit(5000)]);
    const rows = i => (res[i] && !res[i].error && res[i].data) || [];
    const focus = zero(), tDone = zero(), tAll = zero(), morn = zero(), hab = zero(), sleep = days.map(() => null), water = zero(), imp = zero(), kb = zero(), vo = zero(), to = zero();
    rows(0).forEach(r => { const i = idx[r.session_date]; if (i != null) focus[i] += (r.duration_seconds || 0) / 3600; });
    rows(1).forEach(r => { const i = idx[r.task_date]; if (i == null || r.skipped) return; tAll[i]++; if (r.completed) tDone[i]++; });
    rows(2).forEach(r => { const i = idx[r.check_date]; if (i != null) morn[i]++; });
    rows(4).forEach(r => { const i = idx[r.log_date]; if (i != null) hab[i]++; });
    rows(6).forEach(r => { const i = idx[addDay(r.night_date, 1)]; if (i == null || !r.bed_at || !r.wake_at) return; const h = (new Date(r.wake_at) - new Date(r.bed_at)) / 3600e3; if (h > 0 && h < 16) sleep[i] = (sleep[i] || 0) + h; });
    rows(7).forEach(r => { const i = idx[r.log_date]; if (i != null) water[i] += r.ml || 0; });
    rows(8).forEach(r => { const i = idx[r.day]; if (i != null) imp[i]++; });
    rows(9).forEach(r => { const i = idx[r.day]; if (i != null) kb[i]++; });
    rows(10).forEach(r => { const i = idx[r.day]; if (i != null) vo[i]++; });
    rows(11).forEach(r => { const i = idx[r.day]; if (i != null) to[i]++; });
    const mornN = rows(3).length, habN = rows(5).length;
    const waterGoal = (res[12].data && res[12].data.accum && Number(res[12].data.accum.waterMl)) || 2250;

    /* 打卡連續天數：晨間或習慣有任一筆就算；今天還沒打不中斷 */
    const any = new Set([...rows(13).map(r => r.check_date), ...rows(14).map(r => r.log_date)]);
    let streak = 0, d = any.has(t) ? t : addDay(t, -1); while (any.has(d)) { streak++; d = addDay(d, -1); }

    const sum = a => a.reduce((s, v) => s + v, 0);
    const sl = sleep.filter(v => v != null), allT = sum(tAll);
    const h1 = v => (Math.round(v * 10) / 10).toString();
    const pct = (a, b) => days.map((_, i) => (b[i] ? Math.min(100, Math.round(a[i] / b[i] * 100)) : 0));

    root.innerHTML = `<section class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h2 style="margin:0">📊 數據</h2>
        <div>${[7, 30].map(k => `<button type="button" class="chip ${S.range === k ? "active" : ""}" data-st-range="${k}">${k} 天</button>`).join(" ")}</div></div>
        <div class="st-tiles" style="margin-top:10px">
          <div class="st-tile"><b>${h1(sum(focus))} h</b><span>專注時數（${n} 天）</span></div>
          <div class="st-tile"><b>${allT ? Math.round(sum(tDone) / allT * 100) + "%" : "—"}</b><span>任務完成率 ${sum(tDone)}/${allT}</span></div>
          <div class="st-tile"><b>${streak} 天</b><span>打卡連續天數</span></div>
          <div class="st-tile"><b>${sl.length ? h1(sum(sl) / sl.length) + " h" : "—"}</b><span>平均睡眠${sl.length ? `（${sl.length} 晚）` : "（沒有紀錄）"}</span></div>
        </div></section>
      ${chart("🌅 晨間打卡", mornN ? `每天完成幾 %（共 ${mornN} 項）` : "還沒設定晨間項目", bars(days, [{ name: "完成率", color: "#f0883e", values: pct(morn, days.map(() => mornN)) }], { max: 100, fmt: v => Math.round(v) + "%" }))}
      ${chart("📅 每日習慣（早・中・晚）", habN ? `每天打卡幾項（共 ${habN} 項，虛線是全部完成）` : "還沒有啟用的習慣", bars(days, [{ name: "習慣", color: "#a371f7", values: hab }], { goal: habN || 0, max: Math.max(habN, ...hab, 1) * 1.1 }))}
      ${chart("📋 任務", "每天完成／沒完成的件數（延期的不算）", bars(days, [{ name: "完成", color: "#3fb950", values: tDone }, { name: "沒完成", color: "rgba(127,127,127,.45)", values: days.map((_, i) => tAll[i] - tDone[i]) }]))}
      ${chart("⏱️ 專注時數", "每天專注幾小時", bars(days, [{ name: "專注", color: "#7c5cff", values: focus }], { fmt: h1 }))}
      ${chart("🧠 複習量", "每天複習幾張／幾題", bars(days, [{ name: "複習卡", color: "#3fb950", values: kb }, { name: "單字", color: "#d29922", values: vo }, { name: "多益", color: "#58a6ff", values: to }]))}
      ${chart("🎯 改善打卡", "每天打卡幾項改善", bars(days, [{ name: "改善", color: "#f778ba", values: imp }]))}
      ${chart("😴 睡眠", "每晚睡幾小時（虛線 6 小時）", bars(days, [{ name: "睡眠", color: "#79c0ff", values: sleep.map(v => v || 0) }], { goal: 6, max: Math.max(9, ...sleep.map(v => v || 0)), fmt: h1 }))}
      ${chart("💧 喝水", `每天喝幾 ml（虛線目標 ${waterGoal}）`, bars(days, [{ name: "喝水", color: "#39c5cf", values: water }], { goal: waterGoal, max: Math.max(waterGoal, ...water) * 1.1 }))}`;
  }

  /* ---------- 掛上去 ---------- */
  if (typeof window.applyPage === "function") {
    const base = window.applyPage;
    window.applyPage = function (name) { const r = base.apply(this, arguments); if (name === "stats") setTimeout(loadStats, 0); if (name === "today" && on) setTimeout(loadHub, 0); return r; };
  }
  function start() { ensureStats(); addToggle(); ensureHub(); paint(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else setTimeout(start, 0);
  setTimeout(start, 1700);
  (function boot(n) { if (!hasDb()) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; } ensureStats(); loadRemote(); })(0);
})();
