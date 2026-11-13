/* 🎯 改善清單：「每日反省」寫的「明天要改善」會一直留在清單裡，每天打卡，直到你按「🏁 徹底改善了」
   ‧ 今日頁：🎯 改善打卡（所有進行中的改善＋連續天數＋最近 7 天）
   ‧ 歷史頁（🌿 生活 → 🎯 改善）：進行中／已改善／不追蹤／依反省日期的完整紀錄
   資料：sql/2026-11-13_改善清單_今日任務選擇.sql */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const md = d => String(d || "").slice(5).replace("-", "/");
  const dayDiff = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);
  /* 反省文字 → 一行一條（「2.30 上床」這種時間不會被當成編號） */
  const lines = t => String(t || "").split(/[\n；;]/).map(x => x.replace(/^\s*([0-9]+[.、)](?![0-9])|[-・•*])\s*/, "").trim()).filter(Boolean);
  const I = { d: null, hist: null, tab: "active", menu: null };

  async function load() {
    const { data, error } = await db.rpc("improve_today");
    if (!error) I.d = data;
    render();
    if (document.querySelector('.page[data-page="improve"]') && isOn("improve")) loadHist();
  }
  const isOn = p => { const el = document.querySelector(`.page[data-page="${p}"]`); return el && el.style.display !== "none" && el.offsetParent !== null; };

  /* ---------- 今日頁：改善打卡 ---------- */
  function render() {
    const tp = document.querySelector('.page[data-page="today"]');
    if (!tp || !I.d) return;
    let box = document.getElementById("im-today");
    if (!box) { box = document.createElement("section"); box.id = "im-today"; box.className = "card"; tp.appendChild(box); }
    const d = I.d, its = d.items, done = its.filter(i => i.done).length;
    const wk = d.week.filter(w => w.day !== d.day), wn = wk.reduce((a, w) => a + w.n, 0), wd = wk.reduce((a, w) => a + w.d, 0);
    const tonight = lines(d.tonight);
    box.innerHTML = `<div class="im-head"><h2>🎯 改善打卡</h2><button type="button" class="btn btn-small" data-imgo="hist">📜 歷史改善</button></div>
      ${its.length ? `<p class="tb-note">你說過要改善的事，今天有做到嗎？${done === its.length ? "🎉 全部做到了！✨+15" : `（${done}/${its.length}）`}　真的改掉了就按「🏁」結束它。</p>
        ${its.map(i => `<div class="im-it ${i.done ? "on" : ""}"><label><input type="checkbox" data-im="${i.id}" ${i.done ? "checked" : ""}><span>${esc(i.text)}</span></label>
          <div class="im-meta"><span class="im-dots">${(i.last7 || []).map((x, k) => `<i class="${x ? "y" : ""}${k === 6 ? " t" : ""}"></i>`).join("")}</span>${i.streak >= 2 ? `<b>🔥${i.streak}</b>` : ""}<small>${md(i.since)} 起・做到 ${i.days} 天</small>
            <button type="button" class="im-end" data-imend="${i.id}" title="徹底改善了，結束追蹤">🏁</button></div></div>`).join("")}`
        : `<p class="tb-note">清單是空的。晚上勾「🌙 每日反省」時，在「明天要改善」<b>一行寫一個方法</b>，就會加進這裡，每天打卡直到你真的改掉。</p>`}
      <div class="im-add"><input id="im-new" maxlength="120" placeholder="＋ 新增一條要改善的事"><button type="button" class="btn btn-small" data-imadd="1">加入</button></div>
      ${tonight.length ? `<p class="tb-note">🌙 今晚反省寫的，明天會加進清單：${tonight.map(esc).join("・")}</p>` : ""}
      ${wn ? `<p class="tb-note">📈 最近 7 天改善達成率：<b>${Math.round(wd / wn * 100)}%</b>（${wd}/${wn}）${d.ended ? `・已經徹底改善 ${d.ended} 條 🏁` : ""}</p>` : d.ended ? `<p class="tb-note">已經徹底改善 ${d.ended} 條 🏁</p>` : ""}`;
  }

  /* 🏁 結束：徹底改善了／不追蹤了 */
  function endModal(id, text) {
    const m = document.createElement("div"); m.className = "vg-modal";
    m.innerHTML = `<div class="vg-card"><div class="vg-title">結束這條改善？</div><p class="im-q">「${esc(text)}」</p>
      <label class="tw-lab">心得（可以不寫）<textarea id="im-note" rows="2" maxlength="200" placeholder="例如：鬧鐘放遠之後，兩週都沒有賴床了"></textarea></label>
      <button type="button" class="btn btn-primary" data-st="done" style="width:100%">🏁 徹底改善了！（✨+30）</button>
      <button type="button" class="btn" data-st="dropped" style="width:100%;margin-top:6px">🙈 先不追蹤了（不算改善完成，之後可以恢復）</button>
      <button type="button" class="btn" data-vx="1" style="width:100%;margin-top:6px">取消</button></div>`;
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-vx]")) return m.remove();
      const b = e.target.closest("[data-st]"); if (!b) return; b.disabled = true;
      const { data, error } = await db.rpc("improve_end", { p_id: id, p_status: b.dataset.st, p_note: m.querySelector("#im-note").value.trim() || null });
      if (error) { b.disabled = false; return toast(error.message); }
      m.remove(); I.d = data.today; render(); I.hist = null; if (isOn("improve")) loadHist();
      toast(b.dataset.st === "done" ? `🏁 恭喜，又改掉一個壞習慣！${data.granted ? "✨+30" : ""}` : "🙈 先不追蹤了，在「📜 歷史改善」可以恢復");
    });
    document.body.appendChild(m);
  }

  /* ---------- 歷史頁 ---------- */
  function ensurePage() {
    let page = document.querySelector('.page[data-page="improve"]');
    if (!page) {
      const c = document.querySelector("#app-section > .container"); if (!c) return null;
      page = document.createElement("div"); page.className = "page"; page.dataset.page = "improve"; page.style.display = "none"; c.appendChild(page);
      page.innerHTML = `<div id="im-root"><section class="card"><p class="tb-note">載入中…</p></section></div>`;
    }
    if (typeof PAGES !== "undefined" && Array.isArray(PAGES) && !PAGES.includes("improve")) PAGES.push("improve");
    return page;
  }
  async function loadHist() {
    if (!hasDb()) return; ensurePage();
    const [a, b, c] = await Promise.all([
      db.from("improvements").select("id, text, source_date, status, note, created_at, ended_at").order("created_at", { ascending: false }).limit(1000),
      db.from("improve_marks").select("improvement_id, day").limit(20000),
      db.from("daily_reflections").select("reflect_date, improvement").not("improvement", "is", null).order("reflect_date", { ascending: false }).limit(400)]);
    if (a.error) { I.hist = { err: a.error.message }; return renderHist(); }
    const marks = {}; (b.data || []).forEach(m => { (marks[m.improvement_id] = marks[m.improvement_id] || []).push(m.day); });
    I.hist = { items: a.data || [], marks, refl: (c.data || []).filter(r => String(r.improvement || "").trim()) };
    renderHist();
  }
  function renderHist() {
    const page = ensurePage(); if (!page) return; const root = page.querySelector("#im-root"), H = I.hist;
    if (!H) { root.innerHTML = `<section class="card"><p class="tb-note">載入中…</p></section>`; return; }
    if (H.err) { root.innerHTML = `<section class="card"><h2>📜 歷史改善</h2><p class="tb-note">讀不到資料：${esc(H.err)}</p></section>`; return; }
    const t = I.d ? I.d.day : new Date().toISOString().slice(0, 10), by = s => H.items.filter(i => i.status === s);
    const act = by("active"), done = by("done"), drop = by("dropped").concat(by("archived"));
    const tabs = [["active", `🎯 進行中 ${act.length}`], ["done", `🏁 已改善 ${done.length}`], ["dropped", `🙈 沒在追蹤 ${drop.length}`], ["date", "📅 依反省日期"]];
    const row = i => {
      const ms = H.marks[i.id] || [], since = i.source_date ? addDays(i.source_date, 1) : String(i.created_at).slice(0, 10), end = i.ended_at ? String(i.ended_at).slice(0, 10) : t, span = Math.max(1, dayDiff(since, end) + 1);
      const last = Array.from({ length: 14 }, (_, k) => ms.includes(addDays(end, k - 13)));
      return `<div class="im-h"><div class="im-hl"><b>${esc(i.text)}</b>
          <small>${md(since)} 開始${i.ended_at ? `・${md(end)} ${i.status === "done" ? "徹底改善 🏁" : "停止追蹤"}` : ""}・做到 ${ms.length}/${span} 天（${Math.round(ms.length / span * 100)}%）</small>
          <span class="im-dots big">${last.map(x => `<i class="${x ? "y" : ""}"></i>`).join("")}</span>
          ${i.note ? `<p class="im-note">💬 ${esc(i.note)}</p>` : ""}</div>
        <div class="im-acts">${i.status === "active" ? `<button type="button" class="btn btn-small" data-imend="${i.id}">🏁 結束</button>` : `<button type="button" class="btn btn-small" data-imre="${i.id}">↩️ 恢復追蹤</button>`}</div></div>`;
    };
    let body = "";
    if (I.tab === "date") body = H.refl.length ? H.refl.map(r => `<div class="im-day"><b>${md(r.reflect_date)}（${"日一二三四五六"[new Date(r.reflect_date + "T00:00:00Z").getUTCDay()]}）的反省</b>
        <ul>${lines(r.improvement).map(x => { const it = H.items.find(i => i.text === x && i.source_date === r.reflect_date); const st = it ? { active: "🎯 進行中", done: "🏁 已改善", dropped: "🙈 不追蹤", archived: "📦 舊紀錄" }[it.status] : ""; return `<li>${esc(x)} ${st ? `<small>${st}</small>` : ""}</li>`; }).join("")}</ul></div>`).join("") : `<p class="tb-note">還沒有反省紀錄。</p>`;
    else { const L = I.tab === "active" ? act : I.tab === "done" ? done : drop; body = L.length ? L.map(row).join("") : `<p class="tb-note">${I.tab === "done" ? "還沒有徹底改善的項目。某條改善已經變成習慣、不用再提醒了，就在今日頁按「🏁」結束它。" : I.tab === "active" ? "目前沒有進行中的改善。" : "沒有停止追蹤的項目。"}</p>`; }
    const all = H.items.filter(i => i.status !== "archived"), rate = all.length ? Math.round(done.length / all.length * 100) : 0;
    root.innerHTML = `<section class="card"><h2>📜 歷史改善</h2>
        <div class="im-stat"><div><b>${H.items.length}</b><small>寫過的改善</small></div><div><b>${done.length}</b><small>徹底改善 🏁</small></div><div><b>${act.length}</b><small>進行中</small></div><div><b>${rate}%</b><small>改善完成率</small></div></div>
        <div class="tr-row im-tabs">${tabs.map(([k, n]) => `<button type="button" class="tr-chip sm ${I.tab === k ? "on" : ""}" data-imtab="${k}">${n}</button>`).join("")}</div>
        ${act.length > 6 && I.tab === "active" ? `<p class="tb-note">💡 進行中的改善有 ${act.length} 條，太多會每一條都做不好。挑 3～5 條最重要的，其他先按「🏁 結束」→「🙈 先不追蹤」。</p>` : ""}
        ${body}</section>`;
  }
  const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  /* ---------- 事件 ---------- */
  document.addEventListener("change", async e => {
    const c = e.target.closest("[data-im]");
    if (!c || !hasDb()) return;
    const { data, error } = await db.rpc("improve_toggle", { p_id: Number(c.dataset.im), p_done: c.checked });
    if (error) { c.checked = !c.checked; return toast(error.message); }
    const all = data.items.length && data.items.every(i => i.done);
    I.d = data; render(); I.hist = null; if (c.checked) toast(all ? "🎉 改善項目全部做到了！✨+15" : "✅ 做到了");
  });
  document.addEventListener("click", async e => {
    const en = e.target.closest("[data-imend]");
    if (en) { const id = Number(en.dataset.imend), it = (I.d && I.d.items.find(i => i.id === id)) || (I.hist && I.hist.items.find(i => i.id === id)); return endModal(id, it ? it.text : ""); }
    const re = e.target.closest("[data-imre]");
    if (re) { const { data, error } = await db.rpc("improve_end", { p_id: Number(re.dataset.imre), p_status: "active" }); if (error) return toast(error.message); I.d = data.today; render(); loadHist(); return toast("↩️ 恢復追蹤，今天開始重新打卡"); }
    const tb = e.target.closest("[data-imtab]"); if (tb) { I.tab = tb.dataset.imtab; return renderHist(); }
    if (e.target.closest("[data-imgo]")) { ensurePage(); if (typeof showPage === "function") showPage("improve"); loadHist(); return; }
    if (e.target.closest("[data-imadd]")) {
      const inp = document.getElementById("im-new"), v = inp && inp.value.trim(); if (!v) return toast("先寫要改善什麼");
      const { data, error } = await db.rpc("improve_add", { p_text: v }); if (error) return toast(error.message);
      I.d = data; render(); I.hist = null; toast("🎯 加進改善清單了，每天打卡直到改掉它");
    }
  });
  document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "im-new") { e.preventDefault(); document.querySelector("[data-imadd]").click(); } });

  const st = document.createElement("style");
  st.textContent = `
    .im-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; } .im-head h2 { margin: 0; }
    .im-it { padding: 8px 4px; border-top: 1px solid rgba(127,127,127,.15); }
    .im-it label { display: flex; gap: 10px; align-items: center; cursor: pointer; font-size: 14px; } .im-it input { width: 20px; height: 20px; flex: none; }
    .im-it.on label span { text-decoration: line-through; opacity: .6; }
    .im-meta { display: flex; align-items: center; gap: 8px; margin: 4px 0 0 30px; font-size: 11.5px; } .im-meta small { opacity: .6; flex: 1; } .im-meta b { font-size: 12px; }
    .im-dots { display: inline-flex; gap: 3px; } .im-dots i { width: 8px; height: 8px; border-radius: 2px; background: rgba(127,127,127,.22); } .im-dots i.y { background: #3fb950; } .im-dots i.t { outline: 1px solid rgba(124,92,255,.7); }
    .im-dots.big i { width: 11px; height: 11px; } .im-dots.big { margin: 4px 0; }
    .im-end { border: 0; background: rgba(127,127,127,.12); border-radius: 8px; font-size: 14px; padding: 3px 8px; cursor: pointer; }
    .im-add { display: flex; gap: 6px; margin-top: 10px; } .im-add input { flex: 1; min-width: 0; font: inherit; font-size: 14px; padding: 7px 10px; border-radius: 10px; }
    .im-q { font-weight: 600; } .im-stat { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; text-align: center; margin: 8px 0 12px; }
    .im-stat > div { background: rgba(127,127,127,.08); border-radius: 10px; padding: 8px 2px; } .im-stat b { display: block; font-size: 20px; } .im-stat small { font-size: 11px; opacity: .65; }
    .im-tabs { margin-bottom: 8px; flex-wrap: wrap; }
    .im-h { display: flex; gap: 10px; align-items: flex-start; padding: 10px 2px; border-top: 1px solid rgba(127,127,127,.15); } .im-hl { flex: 1; min-width: 0; } .im-hl b { font-size: 14px; } .im-hl small { display: block; font-size: 11.5px; opacity: .65; margin-top: 2px; }
    .im-note { font-size: 12.5px; margin: 4px 0 0; opacity: .85; } .im-acts { flex: none; }
    .im-day { padding: 8px 2px; border-top: 1px solid rgba(127,127,127,.15); font-size: 13.5px; } .im-day ul { margin: 4px 0 0; padding-left: 20px; } .im-day li small { opacity: .65; font-size: 11px; margin-left: 4px; }`;
  document.head.appendChild(st);

  if (typeof window.applyPage === "function") { const base = window.applyPage; window.applyPage = function (name) { const r = base.apply(this, arguments); if (name === "improve") setTimeout(() => { ensurePage(); loadHist(); }, 0); return r; }; }
  (function boot(n) { if (!hasDb() || !document.querySelector('.page[data-page="today"]')) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; }
    ensurePage(); load(); setInterval(() => { if (!document.hidden) load(); }, 10 * 60 * 1000); document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); }); })(0);
  window.ImproveBox = { load, loadHist };
})();
