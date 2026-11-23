/* 📝 每日任務規劃：不再自動產生重複任務，改成每天自己花幾分鐘列「今天要完成什麼」
   ‧ 早上第一次打開網站：如果今天還沒列，跳出「☀️ 今天要完成什麼？」
   ‧ 晚上（20:00 以後）今日頁有「🌙 先列明天的任務」，列好的話隔天早上就不會再問
   ‧ 昨天沒做完的任務可以一鍵搬到今天；以前的重複任務名稱變成一鍵加入的建議
   ‧ 每個沒完成的任務旁邊有 ⏭️ 延期到明天
   「今天列過了沒」記在 task_day_plan（有那天的資料就是列過了） */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const today = () => (typeof getToday === "function" ? getToday() : new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10));
  const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const isEvening = () => { const h = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei", hour: "numeric", hour12: false })) % 24; return h >= 20 || h < 6; };
  const DIFF = [["easy", "簡單"], ["normal", "普通"], ["hard", "困難"], ["epic", "史詩"]];
  const SUGGEST = 5;
  const D = { planned: {}, todayTasks: [], yesterdayLeft: [], tpl: [], loaded: false, asked: false };

  async function load() {
    if (!hasDb()) return;
    const t = today(), y = addDays(t, -1), tm = addDays(t, 1);
    const [pl, tk, yl, tp] = await Promise.all([
      db.from("task_day_plan").select("day").in("day", [t, tm]),
      db.from("tasks").select("id, title, completed, task_date").in("task_date", [t, tm]),
      db.from("tasks").select("id, title, category, difficulty").eq("task_date", y).eq("completed", false),
      db.from("task_templates").select("title, category, difficulty").order("updated_at", { ascending: false }).limit(60)]);
    D.planned = {}; (pl.data || []).forEach(r => { D.planned[r.day] = true; });
    D.todayTasks = (tk.data || []).filter(x => x.task_date === t); D.tomorrowTasks = (tk.data || []).filter(x => x.task_date === tm);
    D.yesterdayLeft = yl.data || [];
    const seen = new Set(); D.tpl = (tp.data || []).filter(x => !seen.has(x.title) && seen.add(x.title));
    D.loaded = true; render();
    /* 早上第一次打開：今天還沒列 → 主動問 */
    if (!D.planned[t] && !D.asked && document.querySelector('.page[data-page="today"].active, .page[data-page="tasks"].active')) { D.asked = true; setTimeout(() => open(t), 900); }
  }

  function render() {
    if (!D.loaded) return; const t = today(), tm = addDays(t, 1);
    ["today", "tasks"].forEach(pg => {
      const page = document.querySelector(`.page[data-page="${pg}"]`); if (!page) return;
      page.querySelectorAll(".dp-banner, .dp-chg").forEach(x => x.remove());
      const b = document.createElement("section"); b.className = "card dp-banner";
      const done = D.todayTasks.filter(x => x.completed).length, n = D.todayTasks.length;
      if (!D.planned[t]) b.innerHTML = `<b>☀️ 今天還沒列要完成的事</b><span>花幾分鐘想清楚今天要做什麼，比系統自動塞任務有用</span><button type="button" class="btn btn-primary btn-small" data-dp="today">列出來</button>`;
      else b.innerHTML = `<b>📝 今天：${done}/${n} 件完成</b><span>${n > SUGGEST ? "今天的事有點多，先挑最重要的做" : done === n && n ? "🎉 全部完成了！" : "一件一件來"}</span><button type="button" class="btn btn-small" data-dp="today">＋ 再加</button>`;
      if (isEvening()) b.innerHTML += `<button type="button" class="btn btn-small ${D.planned[tm] ? "" : "btn-primary"}" data-dp="tomorrow">${D.planned[tm] ? `🌙 明天已列 ${D.tomorrowTasks.length} 件（改）` : "🌙 先列明天的任務"}</button>`;
      page.prepend(b);
    });
  }

  function catOptions() {
    const sel = document.getElementById("new-task-category");
    return sel ? [...sel.options].map(o => [o.value, o.textContent.trim()]) : [["study", "學習"], ["daily", "日常"]];
  }
  async function open(day) {
    if (!hasDb()) return; if (!D.loaded) await load();
    day = day || today(); const t = today(), isTm = day !== t, have = isTm ? D.tomorrowTasks : D.todayTasks;
    const cats = catOptions(), rows = [{ title: "", difficulty: "normal", category: cats[0][0] }];
    const moveIds = new Set();
    const m = document.createElement("div"); m.className = "vg-modal dp-modal";
    const rowHtml = (r, i) => `<div class="dp-row"><input data-r="${i}" data-f="title" maxlength="80" placeholder="${i === 0 ? "例如：計概小學堂 1 小時" : "下一件事"}" value="${esc(r.title)}">
      <select data-r="${i}" data-f="difficulty">${DIFF.map(([k, n]) => `<option value="${k}" ${r.difficulty === k ? "selected" : ""}>${n}</option>`).join("")}</select>
      <select data-r="${i}" data-f="category">${cats.map(([k, n]) => `<option value="${k}" ${r.category === k ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
      <button type="button" class="tr-x" data-rm="${i}">✕</button></div>`;
    const draw = () => {
      const newN = rows.filter(r => r.title.trim()).length, total = have.length + newN + moveIds.size;
      m.innerHTML = `<div class="vg-card"><div class="vg-title">${isTm ? "🌙 明天要完成什麼？" : "☀️ 今天要完成什麼？"}</div>
        <p class="dp-tip">一行寫一件事，越具體越好（「計概小學堂 1 小時」比「讀計概」好）。<b>建議 3～5 件</b>，做得完比列得多重要。</p>
        ${have.length ? `<p class="dp-have">${isTm ? "明天" : "今天"}已經有：${have.map(x => `<span class="${x.completed ? "ok" : ""}">${x.completed ? "✅" : "•"} ${esc(x.title)}</span>`).join("")}</p>` : ""}
        ${!isTm && D.yesterdayLeft.length ? `<p class="tc-h4">↪️ 昨天沒做完的（點了就搬到今天）</p><div class="dp-chips">${D.yesterdayLeft.map(x => `<button type="button" class="tr-chip sm ${moveIds.has(x.id) ? "on" : ""}" data-mv="${x.id}">${moveIds.has(x.id) ? "✓ " : ""}${esc(x.title)}</button>`).join("")}</div>` : ""}
        <p class="tc-h4">✍️ 新增</p>${rows.map(rowHtml).join("")}
        <button type="button" class="btn btn-small" data-add="1">＋ 再加一件</button>
        ${D.tpl.length ? `<details class="dp-tpl"><summary>💡 從以前的任務挑（點一下加入）</summary><div class="dp-chips">${D.tpl.map((x, i) => `<button type="button" class="tr-chip sm" data-tp="${i}">${esc(x.title)}</button>`).join("")}</div></details>` : ""}
        <p class="dp-sum ${total > SUGGEST ? "over" : ""}">${isTm ? "明天" : "今天"}共 <b>${total}</b> 件${total > SUGGEST ? "　⚠️ 有點多，確定都做得完嗎？" : total ? "　👍" : ""}</p>
        <button type="button" class="btn btn-primary" data-ok="1" style="width:100%">✅ 就這些，${isTm ? "明天見" : "開始今天"}</button>
        <button type="button" class="btn" data-vx="1" style="width:100%;margin-top:6px">${D.planned[day] ? "關閉" : "晚點再列"}</button></div>`;
      const first = m.querySelector('input[data-f="title"]:placeholder-shown'); if (first && !m._focused) { m._focused = 1; setTimeout(() => first.focus(), 50); }
    };
    const sync = e => { const el = e.target.closest("[data-r]"); if (el) rows[Number(el.dataset.r)][el.dataset.f] = el.value; };
    m.addEventListener("input", sync); m.addEventListener("change", e => { sync(e); if (e.target.dataset.f !== "title") return; });
    m.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.dataset.f === "title") { e.preventDefault(); sync(e); rows.push({ title: "", difficulty: "normal", category: rows[rows.length - 1].category }); m._focused = 0; draw(); const ins = m.querySelectorAll('input[data-f="title"]'); ins[ins.length - 1].focus(); } });
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-vx]")) return m.remove();
      if (e.target.closest("[data-add]")) { rows.push({ title: "", difficulty: "normal", category: rows[rows.length - 1].category }); m._focused = 0; return draw(); }
      const rm = e.target.closest("[data-rm]"); if (rm) { rows.splice(Number(rm.dataset.rm), 1); if (!rows.length) rows.push({ title: "", difficulty: "normal", category: cats[0][0] }); return draw(); }
      const mv = e.target.closest("[data-mv]"); if (mv) { const id = Number(mv.dataset.mv); moveIds.has(id) ? moveIds.delete(id) : moveIds.add(id); return draw(); }
      const tp = e.target.closest("[data-tp]"); if (tp) { const x = D.tpl[Number(tp.dataset.tp)], empty = rows.find(r => !r.title.trim()), r = { title: x.title, difficulty: x.difficulty || "normal", category: x.category || cats[0][0] };
        empty ? Object.assign(empty, r) : rows.push(r); return draw(); }
      const ok = e.target.closest("[data-ok]"); if (!ok) return; ok.disabled = true;
      const list = rows.filter(r => r.title.trim());
      try {
        if (list.length) { const ins = list.map(r => { const rw = typeof getTaskReward === "function" ? getTaskReward(r.difficulty) : { exp: 20, gold: 15 };
            return { user_id: currentUser.id, title: r.title.trim(), category: r.category, difficulty: r.difficulty, exp_reward: rw.exp, gold_reward: rw.gold, task_date: day, completed: false }; });
          const { error } = await db.from("tasks").insert(ins); if (error) throw error; }
        if (moveIds.size) { const { error } = await db.from("tasks").update({ task_date: day }).in("id", [...moveIds]); if (error) throw error; }
        await db.from("task_day_plan").upsert({ user_id: currentUser.id, day, keep: [] }, { onConflict: "user_id,day" });
      } catch (err) { ok.disabled = false; return toast(err.message || String(err)); }
      m.remove(); await load(); if (typeof loadTasks === "function") { try { await loadTasks(); } catch (_) {} }
      const n = list.length + moveIds.size;
      toast(n ? `📝 ${isTm ? "明天" : "今天"}加了 ${n} 件事${isTm ? "，早點睡 🌙" : "，從第一件開始！"}` : `📝 ${isTm ? "明天" : "今天"}先不加新的`);
    });
    draw(); document.body.appendChild(m);
  }
  document.addEventListener("click", e => { const b = e.target.closest("[data-dp]"); if (!b) return; e.preventDefault(); open(b.dataset.dp === "tomorrow" ? addDays(today(), 1) : today()); });

  /* ⏭️ 延期到明天（任務列表每個沒完成的任務旁邊） */
  window.postponeTask = async function (id) {
    const t = typeof currentTasks !== "undefined" && Array.isArray(currentTasks) ? currentTasks.find(x => String(x.id) === String(id)) : null;
    if (!confirm(`把「${t ? t.title : "這個任務"}」延期到明天？`)) return;
    const { data, error } = await db.rpc("task_postpone", { p_id: Number(id) });
    if (error) return toast(error.message);
    if (typeof loadTasks === "function") { try { await loadTasks(); } catch (_) {} }
    load(); toast(data && data.merged ? "⏭️ 明天本來就有這個任務，今天這個先拿掉了" : "⏭️ 延期到明天了，今天先專心做別的");
  };

  const st = document.createElement("style");
  st.textContent = `
    .dp-banner { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; border: 1px solid rgba(124,92,255,.5); background: rgba(124,92,255,.08); }
    .dp-banner b { font-size: 15px; } .dp-banner span { flex: 1 1 180px; font-size: 12.5px; opacity: .8; }
    .dp-modal .vg-card { max-height: 90vh; overflow-y: auto; }
    .dp-tip { font-size: 13px; line-height: 1.6; padding: 8px 10px; border-radius: 10px; background: rgba(255,213,74,.12); }
    .dp-have { font-size: 12.5px; display: flex; flex-wrap: wrap; gap: 4px 10px; opacity: .85; } .dp-have .ok { opacity: .55; }
    .dp-row { display: flex; gap: 6px; align-items: center; margin: 6px 0; } .dp-row input { flex: 1; min-width: 0; font: inherit; font-size: 14px; padding: 8px 10px; border-radius: 10px; }
    .dp-row select { font: inherit; font-size: 12.5px; padding: 6px 4px; border-radius: 8px; max-width: 74px; }
    .dp-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; } .dp-tpl { margin: 10px 0 4px; font-size: 13px; } .dp-tpl summary { cursor: pointer; }
    .dp-sum { font-size: 13px; margin: 10px 0; } .dp-sum.over { color: #f0883e; }`;
  document.head.appendChild(st);

  (function boot(n) { if (!hasDb() || !document.querySelector('.page[data-page="today"]')) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; }
    load(); document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); }); })(0);
  if (typeof window.applyPage === "function") { const base = window.applyPage; window.applyPage = function (name) { const r = base.apply(this, arguments); if (name === "today" || name === "tasks") setTimeout(render, 0); return r; }; }
  window.DayPlan = { load, open };
})();
