/* =========================================================
   🎯 專案：步驟打勾、等級經驗、連擊、爆擊＋簽到幸運抽
   資料庫：sql/2026-10-26_專案.sql
   頁面：任務 → 🎯 專案（nav.js 負責子分頁）
========================================================= */
(function () {
  const P = { list: [], steps: {}, stats: null, open: {}, showDone: false, loaded: false };
  const hasDb = () => typeof db !== "undefined" && typeof currentUser !== "undefined" && currentUser;
  const toast = m => (typeof showToast === "function" ? showToast(m) : alert(m));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ITEM = { stardust: "✨ 星屑", ticket_normal: "🎫 普通召喚券", ticket_special: "🎟️ 特殊召喚券", ticket_limited: "🌟 限定召喚券",
    wish_normal: "🫙 普通星願瓶", wish_rare: "💎 稀有星願瓶", wish_limited: "🌠 限定星願瓶", makeup_card: "📅 補簽卡" };
  const need = lv => 25 * lv * (lv + 1);       // 升到 lv+1 的累計門檻
  const floorXp = lv => 25 * (lv - 1) * lv;

  function injectStyle() {
    if (document.getElementById("pj-style")) return;
    const s = document.createElement("style");
    s.id = "pj-style";
    s.textContent = `
    .pj-stats{display:flex;gap:10px;flex-wrap:wrap}
    .pj-stat{flex:1 1 70px;padding:10px;border-radius:12px;background:rgba(127,127,127,.08);text-align:center}
    .pj-stat b{display:block;font-size:20px}
    .pj-stat span{font-size:12px;opacity:.7}
    .pj-add{display:grid;gap:8px}
    .pj-add input,.pj-row input{width:100%;padding:11px 12px;border:1px solid #343b4b;border-radius:10px;background:#10131a;color:#fff;outline:none;font:inherit}
    .pj-add input:focus,.pj-row input:focus{border-color:#6c7cff}
    .pj-card{margin-bottom:12px}
    .pj-head{display:flex;align-items:center;gap:10px;cursor:pointer}
    .pj-lv{flex:0 0 auto;min-width:46px;padding:4px 8px;border-radius:10px;background:var(--accent,#6c63ff);color:#fff;font-weight:700;font-size:13px;text-align:center}
    .pj-title{flex:1;font-weight:600;word-break:break-word}
    .pj-count{font-size:13px;opacity:.7}
    .pj-bar{height:6px;border-radius:4px;background:rgba(127,127,127,.18);overflow:hidden;margin-top:8px}
    .pj-bar i{display:block;height:100%;background:linear-gradient(90deg,#ffb347,#ff6f61);transition:width .4s}
    .pj-bar.xp i{background:linear-gradient(90deg,#6c63ff,#48c6ef)}
    .pj-meta{display:flex;justify-content:space-between;font-size:12px;opacity:.7;margin-top:4px}
    .pj-def{font-size:13px;margin:10px 0 4px;padding:8px 10px;border-left:3px solid var(--accent,#6c63ff);background:rgba(127,127,127,.06);border-radius:4px}
    .pj-steps{list-style:none;padding:0;margin:8px 0}
    .pj-steps li{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(127,127,127,.12)}
    .pj-steps li.done .pj-st{text-decoration:line-through;opacity:.55}
    .pj-steps input[type=checkbox]{width:20px;height:20px;flex:0 0 auto}
    .pj-st{flex:1;word-break:break-word}
    .pj-x{border:0;background:none;color:inherit;opacity:.4;cursor:pointer;font-size:16px}
    .pj-row{display:flex;gap:8px;margin-top:8px}
    .pj-row input{flex:1}
    .pj-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .pj-done-card{opacity:.75}
    .pj-pop{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%) scale(.6);z-index:9999;pointer-events:none;
      font-size:30px;font-weight:800;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.45);opacity:0;transition:all .25s;text-align:center;white-space:nowrap}
    .pj-pop.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
    .pj-pop.crit{color:#ffd54a;font-size:40px}
    .pj-pop.super{color:#ff5fa2;font-size:48px;animation:pjshake .5s 2}
    .pj-pop small{display:block;font-size:15px;font-weight:600}
    @keyframes pjshake{0%,100%{margin-left:0}25%{margin-left:-8px}75%{margin-left:8px}}
    .pj-flash{position:fixed;inset:0;z-index:9998;pointer-events:none;background:radial-gradient(circle,rgba(255,213,74,.45),transparent 70%);animation:pjflash .7s forwards}
    @keyframes pjflash{from{opacity:1}to{opacity:0}}
    .pj-draw{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}
    .pj-draw-box{background:var(--card-bg,#fff);color:inherit;border-radius:18px;padding:26px 24px;text-align:center;max-width:300px;width:86%;box-shadow:0 10px 40px rgba(0,0,0,.3)}
    .pj-draw-box .big{font-size:56px;margin:6px 0;animation:pjspin .8s}
    @keyframes pjspin{from{transform:rotate(-200deg) scale(.3)}to{transform:none}}
    .pj-draw-box.s{background:linear-gradient(135deg,#fff3c4,#ffd1e8);color:#222}`;
    document.head.appendChild(s);
  }

  function ensurePage() {
    injectStyle();
    if (typeof PAGES !== "undefined" && !PAGES.includes("projects")) {
      const i = PAGES.indexOf("calendar");
      PAGES.splice(i >= 0 ? i + 1 : PAGES.length, 0, "projects");
    }
    let page = document.querySelector('.page[data-page="projects"]');
    if (page) return page;
    const after = document.querySelector('.page[data-page="calendar"]') || document.querySelector('.page[data-page="tasks"]');
    if (!after) return null;
    page = document.createElement("div");
    page.className = "page";
    page.dataset.page = "projects";
    page.innerHTML = `<div class="page-title"><h1>🎯 專案</h1><p>想改變的事拆成步驟，一格一格打勾。</p></div><div id="pj-root"></div>`;
    after.after(page);
    page.addEventListener("click", onClick);
    page.addEventListener("keydown", e => {
      if (e.key !== "Enter" || e.isComposing) return;
      const t = e.target;
      if (t.id === "pj-new-title" || t.id === "pj-new-def") { e.preventDefault(); addProject(); }
      else if (t.dataset.stepInput) { e.preventDefault(); addStep(t.dataset.stepInput); }
    });
    return page;
  }

  async function load() {
    if (!hasDb()) return;
    const [pr, st, ss] = await Promise.all([
      db.from("projects").select("*").order("status").order("sort").order("created_at"),
      db.from("project_steps").select("*").order("sort").order("created_at"),
      db.from("project_stats").select("*").maybeSingle()
    ]);
    if (pr.error) { render(pr.error); return; }
    P.list = pr.data || [];
    P.steps = {};
    (st.data || []).forEach(s => (P.steps[s.project_id] = P.steps[s.project_id] || []).push(s));
    P.stats = ss.data || null;
    P.loaded = true;
    render();
  }

  function statsHtml() {
    const s = P.stats || {};
    const active = P.list.filter(p => p.status === "active").length;
    return `<section class="card"><div class="pj-stats">
      <div class="pj-stat"><b>🔥 ${s.combo || 0}</b><span>連擊天數・最高 ${s.best_combo || 0}</span></div>
      <div class="pj-stat"><b>${active}</b><span>進行中</span></div>
      <div class="pj-stat"><b>${s.done_count || 0}</b><span>已完成</span></div>
      <div class="pj-stat"><b>💥 ${s.crits || 0}</b><span>爆擊次數</span></div>
    </div>
    <p style="font-size:12px;opacity:.65;margin:10px 0 0">每天完成至少一個步驟，連擊 +1（每天經驗 +5%，最多 +50%）。打勾有 10% 爆擊、2% 超級爆擊。</p></section>`;
  }

  function projectHtml(p) {
    const steps = P.steps[p.id] || [];
    const done = steps.filter(s => s.done).length;
    const pct = steps.length ? Math.round(done / steps.length * 100) : 0;
    const lo = floorXp(p.level), hi = need(p.level);
    const xpPct = Math.min(100, Math.round((p.xp - lo) / (hi - lo) * 100));
    const open = P.open[p.id] ?? (p.status === "active");
    const isDone = p.status === "done";
    return `<section class="card pj-card ${isDone ? "pj-done-card" : ""}">
      <div class="pj-head" data-a="toggle" data-id="${p.id}">
        <div class="pj-lv">Lv ${p.level}</div>
        <div class="pj-title">${isDone ? "✅ " : ""}${esc(p.title)}</div>
        <div class="pj-count">${done}/${steps.length}</div>
      </div>
      <div class="pj-bar"><i style="width:${pct}%"></i></div>
      <div class="pj-bar xp"><i style="width:${xpPct}%"></i></div>
      <div class="pj-meta"><span>步驟 ${pct}%</span><span>EXP ${p.xp - lo}/${hi - lo}</span></div>
      ${open ? `
        ${p.done_def ? `<div class="pj-def">🏁 完成定義：${esc(p.done_def)}</div>` : ""}
        <ul class="pj-steps">${steps.map(s => `
          <li class="${s.done ? "done" : ""}">
            <input type="checkbox" data-a="step" data-id="${s.id}" ${s.done ? "checked" : ""} ${isDone ? "disabled" : ""}>
            <span class="pj-st">${esc(s.title)}</span>
            ${isDone ? "" : `<button class="pj-x" data-a="delstep" data-id="${s.id}" title="刪除步驟">✕</button>`}
          </li>`).join("") || `<li style="opacity:.6">還沒有步驟，先加一個。</li>`}</ul>
        ${isDone ? "" : `<div class="pj-row"><input type="text" maxlength="80" placeholder="新增步驟" data-step-input="${p.id}">
          <button class="btn btn-small" data-a="addstep" data-id="${p.id}">＋</button></div>`}
        <div class="pj-actions">
          ${!isDone && steps.length && done === steps.length ? `<button class="btn btn-primary" data-a="complete" data-id="${p.id}">🏆 完成專案</button>` : ""}
          ${isDone ? "" : `<button class="btn btn-small" data-a="edit" data-id="${p.id}">✏️ 編輯</button>`}
          <button class="btn btn-small" data-a="del" data-id="${p.id}">🗑️ 刪除</button>
        </div>` : ""}
    </section>`;
  }

  function render(err) {
    const root = document.getElementById("pj-root");
    if (!root) return;
    if (err) {
      root.innerHTML = `<section class="card"><p>專案資料讀不到：${esc(err.message)}</p><p style="font-size:13px;opacity:.7">請先在 Supabase 執行 sql/2026-10-26_專案.sql。</p></section>`;
      return;
    }
    if (!P.loaded) { root.innerHTML = `<section class="card"><div class="empty-state">載入中...</div></section>`; return; }
    const active = P.list.filter(p => p.status === "active");
    const done = P.list.filter(p => p.status === "done");
    root.innerHTML = statsHtml() + `
      <section class="card"><h2>➕ 新專案</h2><div class="pj-add">
        <input id="pj-new-title" type="text" maxlength="80" placeholder="想改變什麼？例如：整理房間">
        <input id="pj-new-def" type="text" maxlength="200" placeholder="完成定義（怎樣才算做完）">
        <button class="btn btn-primary" data-a="add">建立專案</button></div></section>
      ${active.map(projectHtml).join("") || `<section class="card"><div class="empty-state">還沒有進行中的專案</div></section>`}
      ${done.length ? `<button class="btn btn-small" data-a="showdone" style="margin:4px 0 12px">${P.showDone ? "收起" : "顯示"}已完成（${done.length}）</button>
        ${P.showDone ? done.map(projectHtml).join("") : ""}` : ""}`;
  }

  async function addProject() {
    const t = document.getElementById("pj-new-title"), d = document.getElementById("pj-new-def");
    const title = t.value.trim();
    if (!title) { t.focus(); return; }
    const { data, error } = await db.from("projects").insert({ title, done_def: d.value.trim() }).select().single();
    if (error) { toast("❌ " + error.message); return; }
    P.open[data.id] = true;
    await load();
    const inp = document.querySelector(`[data-step-input="${data.id}"]`);
    if (inp) inp.focus();
  }

  async function addStep(pid) {
    const inp = document.querySelector(`[data-step-input="${pid}"]`);
    const title = inp ? inp.value.trim() : "";
    if (!title) return;
    const sort = (P.steps[pid] || []).length;
    const { error } = await db.from("project_steps").insert({ project_id: pid, title, sort });
    if (error) { toast("❌ " + error.message); return; }
    await load();
    const again = document.querySelector(`[data-step-input="${pid}"]`);
    if (again) again.focus();
  }

  function pop(text, sub, cls) {
    const el = document.createElement("div");
    el.className = "pj-pop " + (cls || "");
    el.innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : "");
    document.body.appendChild(el);
    if (cls) { const f = document.createElement("div"); f.className = "pj-flash"; document.body.appendChild(f); setTimeout(() => f.remove(), 800); }
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, cls ? 1500 : 900);
  }

  function levelToast(ups) {
    (ups || []).forEach((u, i) => setTimeout(() =>
      toast(`⬆️ 專案升到 Lv ${u.level}！✨ 星屑 ×${u.stardust}${u.bonus ? "，再加召喚券和星願瓶各 1" : ""}`), 900 + i * 700));
  }

  async function toggleStep(id) {
    const { data, error } = await db.rpc("project_step_toggle", { p_step: id });
    if (error) { toast("❌ " + error.message); load(); return; }
    if (data.done && data.xp > 0) {
      if (data.crit === "super") pop(`超級爆擊！+${data.xp} EXP`, "×5", "super");
      else if (data.crit === "crit") pop(`爆擊！+${data.xp} EXP`, "×2", "crit");
      else pop(`+${data.xp} EXP`, data.combo > 1 ? `🔥 連擊 ${data.combo} 天` : "");
      levelToast(data.levelUps);
    }
    load();
  }

  async function complete(id) {
    const { data, error } = await db.rpc("project_complete", { p_project: id });
    if (error) { toast("❌ " + error.message); return; }
    pop(`🏆 專案完成！+${data.xp} EXP`, "", "crit");
    const items = (data.items || []).map(i => `${ITEM[i.key] || i.key} ×${i.qty}${i.lucky ? "（驚喜！）" : ""}`);
    setTimeout(() => toast(items.length ? "獲得：" + items.join("、") : "今天的完成獎勵已經拿滿 3 次，經驗照樣有算"), 600);
    levelToast(data.levelUps);
    load();
  }

  async function onClick(e) {
    const el = e.target.closest("[data-a]");
    if (!el) return;
    const a = el.dataset.a, id = el.dataset.id;
    if (a === "toggle") { const p = P.list.find(x => x.id === id); P.open[id] = !(P.open[id] ?? (p && p.status === "active")); render(); return; }
    if (a === "add") return addProject();
    if (a === "addstep") return addStep(id);
    if (a === "step") { e.preventDefault(); return toggleStep(id); }
    if (a === "complete") return complete(id);
    if (a === "showdone") { P.showDone = !P.showDone; render(); return; }
    if (a === "delstep") {
      if (!confirm("刪除這個步驟？")) return;
      const { error } = await db.from("project_steps").delete().eq("id", id);
      if (error) toast("❌ " + error.message);
      return load();
    }
    if (a === "del") {
      if (!confirm("刪除整個專案？步驟也會一起刪掉。已經拿到的獎勵不會收回。")) return;
      const { error } = await db.from("projects").delete().eq("id", id);
      if (error) toast("❌ " + error.message);
      return load();
    }
    if (a === "edit") {
      const p = P.list.find(x => x.id === id);
      const title = prompt("專案名稱", p.title);
      if (title === null) return;
      const def = prompt("完成定義", p.done_def || "");
      if (def === null) return;
      const { error } = await db.from("projects").update({ title: title.trim() || p.title, done_def: def.trim() }).eq("id", id);
      if (error) toast("❌ " + error.message);
      return load();
    }
  }

  /* ---------- 🎰 簽到幸運抽 ---------- */
  const DRAW = {
    none: ["🍃", "今天沒中", "明天再來試試手氣"],
    c: ["✨", "小獎勵", ""], r: ["🎁", "不錯喔", ""], x: ["💎", "稀有！", ""], s: ["🌟", "大獎！！", "限定召喚券＋限定星願瓶"]
  };
  async function luckyDraw() {
    if (!hasDb()) return;
    const { data, error } = await db.rpc("project_lucky_draw");
    if (error || !data || !data.ready || data.already) return;
    const r = data.result, d = DRAW[r.tier] || DRAW.none;
    const what = r.key ? `${ITEM[r.key] || r.key} ×${r.qty}` : d[2];
    const box = document.createElement("div");
    box.className = "pj-draw";
    box.innerHTML = `<div class="pj-draw-box ${r.tier}"><div style="font-size:13px;opacity:.7">🎰 簽到幸運抽</div>
      <div class="big">${d[0]}</div><h3 style="margin:4px 0">${d[1]}</h3><p>${esc(what)}${r.tier === "s" ? "<br>" + d[2] : ""}</p>
      <button class="btn btn-primary" type="button">收下</button></div>`;
    box.addEventListener("click", e => { if (e.target === box || e.target.tagName === "BUTTON") box.remove(); });
    document.body.appendChild(box);
  }

  function hookCheckin() {
    if (typeof window.gameCheckin !== "function" || window.gameCheckin.pjWrapped) return;
    const base = window.gameCheckin;
    window.gameCheckin = async function () {
      const r = await base.apply(this, arguments);
      setTimeout(luckyDraw, 1200);
      return r;
    };
    window.gameCheckin.pjWrapped = true;
  }

  if (typeof window.applyPage === "function") {
    const base = window.applyPage;
    window.applyPage = function (name) {
      const r = base.apply(this, arguments);
      if (name === "projects") setTimeout(() => { render(); if (hasDb()) load(); }, 0);
      return r;
    };
  }

  function boot() {
    ensurePage();
    hookCheckin();
    if (location.hash === "#projects" && typeof applyPage === "function") setTimeout(() => applyPage("projects"), 0);
    let waited = 0;
    const wait = setInterval(() => {
      if (hasDb()) { clearInterval(wait); load(); luckyDraw(); }
      if (++waited > 60) clearInterval(wait);
    }, 1000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.ProjectsGame = { reload: load, state: P, luckyDraw };
})();
