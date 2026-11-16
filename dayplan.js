/* 📋 今日預設任務選擇：每天先決定「重複任務」今天要不要加，避免任務太多、什麼都做不完
   ‧ 簽到後會跳出來問；今日頁、任務頁上方也有提醒（還沒選之前不會自動加任務）
   ‧ 每個任務旁邊顯示「最近兩週做到幾 %」，建議今天只留 3～4 個
   資料：sql/2026-11-13_改善清單_今日任務選擇.sql（day_plan_status、day_plan_set） */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const SUGGEST = 4, DIFF = { easy: "簡單", normal: "普通", hard: "困難", epic: "史詩" };
  const D = { s: null, asked: null };

  async function load() {
    if (!hasDb()) return;
    const { data, error } = await db.rpc("day_plan_status");
    if (error) { if (!/day_plan_status/.test(error.message)) console.warn(error.message); return; }
    D.s = data; render();
  }
  function render() {
    const s = D.s; if (!s) return;
    const show = !s.decided && s.templates.length;
    ["today", "tasks"].forEach(pg => {
      const page = document.querySelector(`.page[data-page="${pg}"]`); if (!page) return;
      let b = page.querySelector(".dp-banner");
      if (!show) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement("section"); b.className = "card dp-banner"; page.prepend(b); }
      b.innerHTML = `<b>📋 今天的預設任務還沒選</b><span>${s.templates.length} 個重複任務等你決定今天要不要做${s.yesterday && s.yesterday.n ? `（昨天 ${s.yesterday.n} 個任務完成 ${s.yesterday.done} 個）` : ""}</span><button type="button" class="btn btn-primary btn-small" data-dp="open">選擇</button>`;
    });
    const tp = document.querySelector('.page[data-page="tasks"]');
    /* 選完之後：今天沒加的重複任務還可以隨時「＋ 加入」 */
    ["today", "tasks"].forEach(pg => {
      const page = document.querySelector(`.page[data-page="${pg}"]`); if (!page) return;
      let c = page.querySelector(".dp-chg");
      if (!(s.decided && s.templates.length)) { if (c) c.remove(); return; }
      if (!c) { c = document.createElement("div"); c.className = "dp-chg"; page.prepend(c); }
      const k = s.templates.filter(t => t.kept || t.completed), rest = s.templates.filter(t => !t.kept && !t.completed);
      c.innerHTML = `<span>📋 今天的預設任務：${k.length}/${s.templates.length} 個 <a href="#" data-dp="open">調整</a></span>${rest.length ? `<span class="dp-more">還想多做？${rest.map(t => `<button type="button" class="tr-chip sm" data-dpadd="${t.id}">＋ ${esc(t.title)}</button>`).join("")}</span>` : ""}`;
    });
  }

  async function open() {
    await load(); const s = D.s; if (!s) return toast("讀不到今天的任務設定");
    if (!s.templates.length) return toast("今天沒有輪到的重複任務");
    const sel = new Set(s.templates.filter(t => s.decided ? (t.kept || t.completed) : true).map(t => t.id));
    const m = document.createElement("div"); m.className = "vg-modal dp-modal";
    const draw = () => {
      const n = sel.size, left = s.templates.filter(t => sel.has(t.id) && !t.completed).length, tot = left + (s.other_today || 0), over = tot > SUGGEST;
      m.innerHTML = `<div class="vg-card"><div class="vg-title">📋 今天要做哪些預設任務？</div>
        <p class="dp-tip">${s.yesterday && s.yesterday.n ? `昨天排了 <b>${s.yesterday.n}</b> 個任務、完成 <b>${s.yesterday.done}</b> 個。` : ""}任務少一點，專注做完比較有成就感。<b>建議今天總共 3～4 個</b>，沒勾的今天就不會出現（之後幾天照常會再問）。</p>
        <div class="dp-quick"><button type="button" class="tr-chip sm" data-q="best">⭐ 只留最常完成的 3 個</button><button type="button" class="tr-chip sm" data-q="all">全部加入</button><button type="button" class="tr-chip sm" data-q="none">全部先不加</button></div>
        ${s.templates.map(t => { const r = t.rate == null ? null : Math.round(t.rate * 100); return `<label class="dp-it ${sel.has(t.id) ? "on" : ""} ${t.completed ? "lock" : ""}"><input type="checkbox" data-id="${t.id}" ${sel.has(t.id) ? "checked" : ""} ${t.completed ? "disabled" : ""}>
          <span class="dp-t"><b>${esc(t.title)}</b><small>${DIFF[t.difficulty] || ""}・✨${t.exp} EXP${t.completed ? "・✅ 今天已完成" : ""}</small></span>
          <span class="dp-r ${r == null ? "" : r >= 60 ? "g" : r >= 30 ? "y" : "r"}">${r == null ? "新的" : `兩週做到 ${r}%`}</span></label>`; }).join("")}
        <p class="dp-sum ${over ? "over" : ""}">今天還要做：預設任務 <b>${left}</b> 個${s.other_today ? ` ＋ 其他任務 ${s.other_today} 個` : ""} ＝ <b>${tot}</b> 個${over ? "　⚠️ 有點多，確定都做得完嗎？" : "　👍 剛剛好"}</p>
        <button type="button" class="btn btn-primary" data-ok="1" style="width:100%">✅ 就這樣，開始今天</button>
        <button type="button" class="btn" data-vx="1" style="width:100%;margin-top:6px">晚點再決定</button></div>`;
    };
    m.addEventListener("change", e => { const c = e.target.closest("[data-id]"); if (!c) return; const id = Number(c.dataset.id); c.checked ? sel.add(id) : sel.delete(id); draw(); });
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-vx]")) return m.remove();
      const q = e.target.closest("[data-q]");
      if (q) { sel.clear(); const T = s.templates;
        if (q.dataset.q === "all") T.forEach(t => sel.add(t.id));
        if (q.dataset.q === "best") T.slice().sort((a, b) => (b.rate == null ? 0.5 : b.rate) - (a.rate == null ? 0.5 : a.rate)).slice(0, 3).forEach(t => sel.add(t.id));
        T.filter(t => t.completed).forEach(t => sel.add(t.id)); return draw(); }
      const ok = e.target.closest("[data-ok]"); if (!ok) return; ok.disabled = true;
      const { data, error } = await db.rpc("day_plan_set", { p_keep: [...sel] });
      if (error) { ok.disabled = false; return toast(error.message); }
      m.remove(); await load();
      if (typeof loadTasks === "function") { try { await loadTasks(); } catch (_) {} }
      const skip = s.templates.length - sel.size;
      toast(`📋 今天留了 ${sel.size} 個預設任務${skip ? `，${skip} 個今天先不做` : ""}${data && data.removed ? `（拿掉 ${data.removed} 個）` : ""}。專心把它們做完！`);
    });
    draw(); document.body.appendChild(m);
  }
  document.addEventListener("click", e => { const b = e.target.closest("[data-dp]"); if (!b) return; e.preventDefault(); open(); });
  /* ＋ 加入：在今天已選的之外，再加一個重複任務 */
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-dpadd]"); if (!b || !D.s) return; b.disabled = true;
    const id = Number(b.dataset.dpadd), keep = D.s.templates.filter(t => t.kept || t.completed).map(t => t.id).concat(id);
    const { error } = await db.rpc("day_plan_set", { p_keep: keep });
    if (error) { b.disabled = false; return toast(error.message); }
    const t = D.s.templates.find(x => x.id === id); await load();
    if (typeof loadTasks === "function") { try { await loadTasks(); } catch (_) {} }
    toast(`＋ 加入「${t ? t.title : "任務"}」，加油！`);
  });

  /* 簽到之後順便問今天要做哪些 */
  function hookCheckin(n) {
    if (typeof window.gameCheckin !== "function") { if (n < 30) setTimeout(() => hookCheckin(n + 1), 1000); return; }
    if (window.gameCheckin.__dp) return;
    const orig = window.gameCheckin;
    window.gameCheckin = async function () { const r = await orig.apply(this, arguments); try { await load(); if (D.s && !D.s.decided && D.s.templates.length) setTimeout(open, 600); } catch (_) {} return r; };
    window.gameCheckin.__dp = true;
  }

  const st = document.createElement("style");
  st.textContent = `
    .dp-banner { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; border: 1px solid rgba(124,92,255,.5); background: rgba(124,92,255,.08); }
    .dp-banner b { font-size: 15px; } .dp-banner span { flex: 1 1 200px; font-size: 12.5px; opacity: .8; }
    .dp-chg { font-size: 12.5px; margin: 0 0 8px; display: flex; flex-direction: column; gap: 6px; } .dp-chg > span:first-child { opacity: .75; } .dp-chg a { color: inherit; } .dp-more { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; opacity: .9; }
    .dp-modal .vg-card { max-height: 90vh; overflow-y: auto; }
    .dp-tip { font-size: 13px; line-height: 1.6; padding: 8px 10px; border-radius: 10px; background: rgba(255,213,74,.12); }
    .dp-quick { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
    .dp-it { display: flex; align-items: center; gap: 10px; padding: 9px 6px; border-top: 1px solid rgba(127,127,127,.15); cursor: pointer; }
    .dp-it input { width: 20px; height: 20px; flex: none; } .dp-it:not(.on) .dp-t { opacity: .5; } .dp-it.lock { cursor: default; }
    .dp-t { flex: 1; min-width: 0; } .dp-t b { display: block; font-size: 14px; } .dp-t small { font-size: 11.5px; opacity: .65; }
    .dp-r { font-size: 11px; padding: 2px 7px; border-radius: 999px; background: rgba(127,127,127,.15); white-space: nowrap; }
    .dp-r.g { background: rgba(63,185,80,.2); color: #3fb950; } .dp-r.y { background: rgba(210,153,34,.2); color: #d29922; } .dp-r.r { background: rgba(248,81,73,.18); color: #f85149; }
    .dp-sum { font-size: 13px; margin: 10px 0; } .dp-sum.over { color: #f0883e; }`;
  document.head.appendChild(st);

  (function boot(n) { if (!hasDb() || !document.querySelector('.page[data-page="today"]')) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; }
    load(); hookCheckin(0); document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); }); })(0);
  if (typeof window.applyPage === "function") { const base = window.applyPage; window.applyPage = function (name) { const r = base.apply(this, arguments); if (name === "today" || name === "tasks") setTimeout(render, 0); return r; }; }
  /* ⏭️ 延期到明天（任務列表每個沒完成的任務旁邊） */
  window.postponeTask = async function (id) {
    const t = typeof currentTasks !== "undefined" && Array.isArray(currentTasks) ? currentTasks.find(x => String(x.id) === String(id)) : null;
    if (!confirm(`把「${t ? t.title : "這個任務"}」延期到明天？`)) return;
    const { data, error } = await db.rpc("task_postpone", { p_id: Number(id) });
    if (error) return toast(error.message);
    if (typeof loadTasks === "function") { try { await loadTasks(); } catch (_) {} }
    load(); toast(data && data.merged ? "⏭️ 明天本來就有這個重複任務，今天這個先拿掉了" : "⏭️ 延期到明天了，今天先專心做別的");
  };
  window.DayPlan = { load, open };
})();
