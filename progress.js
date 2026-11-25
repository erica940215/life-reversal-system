/* 📈 推甄進度（專注 → 📈 進度）：每個科目還剩幾項、完成幾 %
   資料在 study_items；只勾完成，不會自動新增任務
   預計日期只是參考，隨時可以改；「照計畫」= 預計日期已經到了的項目 */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const todayStr = () => (typeof getToday === "function" ? getToday() : new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10));
  const md = d => d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "";
  const ORDER = ["計概", "計概刷題", "MIS", "資料庫", "網路", "AI", "資訊安全", "大補帖", "衝刺"];
  const P = { items: null, err: null, edit: false, open: {}, hideDone: true };
  try { Object.assign(P.open, JSON.parse(localStorage.getItem("progOpen") || "{}")); P.hideDone = localStorage.getItem("progHideDone") !== "0"; } catch (_) {}
  const saveUi = () => { try { localStorage.setItem("progOpen", JSON.stringify(P.open)); localStorage.setItem("progHideDone", P.hideDone ? "1" : "0"); } catch (_) {} };

  function ensurePage() {
    let page = document.querySelector('.page[data-page="progress"]');
    if (!page) { const c = document.querySelector("#app-section > .container"); if (!c) return null;
      page = document.createElement("div"); page.className = "page"; page.dataset.page = "progress";
      page.innerHTML = `<div id="pg-root"><section class="card"><p class="small-note">載入中…</p></section></div>`; c.appendChild(page); }
    if (typeof PAGES !== "undefined" && Array.isArray(PAGES) && !PAGES.includes("progress")) PAGES.push("progress");
    return page;
  }
  async function load() {
    if (!hasDb()) return; ensurePage();
    const { data, error } = await db.from("study_items").select("id, subject, title, plan_date, done, done_at, sort").order("sort").limit(2000);
    if (error) { P.err = error.message; return render(); }
    P.items = data || []; P.err = null; render();
  }
  const subjects = () => { const s = [...new Set(P.items.map(i => i.subject))]; return s.sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99)); };
  const bar = (pct, plan) => `<div class="pg-bar"><i style="width:${pct}%"></i>${plan != null ? `<u style="left:${plan}%" title="照計畫應完成 ${plan}%"></u>` : ""}</div>`;
  const pc = (a, b) => (b ? Math.round(a / b * 100) : 0);

  function render() {
    const page = ensurePage(); if (!page) return; const root = page.querySelector("#pg-root");
    if (P.err) { root.innerHTML = `<section class="card"><h2>📈 推甄進度</h2><p class="small-note">讀不到資料：${esc(P.err)}</p></section>`; return; }
    if (!P.items) return;
    const t = todayStr(), all = P.items, done = all.filter(i => i.done).length, due = all.filter(i => i.plan_date && i.plan_date <= t).length;
    const late = all.filter(i => !i.done && i.plan_date && i.plan_date < t);
    const head = `<section class="card"><div class="pg-top"><h2 style="margin:0">📈 推甄進度</h2>
        <div><button type="button" class="chip ${P.hideDone ? "active" : ""}" data-pg="hide">隱藏已完成</button> <button type="button" class="chip ${P.edit ? "active" : ""}" data-pg="edit">✏️ 編輯</button></div></div>
      <div class="pg-big"><b>${pc(done, all.length)}%</b><span>全部完成 ${done}/${all.length}，還剩 ${all.length - done} 項</span></div>
      ${bar(pc(done, all.length), all.length ? pc(due, all.length) : null)}
      <p class="small-note" style="margin:6px 0 0">${due ? `照預計日期，今天應該完成 ${pc(due, all.length)}%（${due} 項）。` : ""}${late.length ? `有 ${late.length} 項過了預計日期還沒勾，日期都可以在編輯裡改。` : due ? "目前沒有落後 👍" : ""}　細線＝照計畫的位置。</p></section>`;
    const body = subjects().map(s => {
      const its = all.filter(i => i.subject === s).sort((a, b) => a.sort - b.sort), d = its.filter(i => i.done).length, du = its.filter(i => i.plan_date && i.plan_date <= t).length;
      const open = P.open[s] !== false, show = its.filter(i => P.edit || !P.hideDone || !i.done);
      const rows = show.map(i => P.edit
        ? `<div class="pg-it"><input class="pg-in" data-pgf="title" data-id="${i.id}" value="${esc(i.title)}"><input type="date" class="pg-dt" data-pgf="plan_date" data-id="${i.id}" value="${i.plan_date || ""}"><button type="button" class="pg-del" data-pg="del" data-id="${i.id}" title="刪除">🗑</button></div>`
        : `<label class="pg-it ${i.done ? "on" : ""} ${!i.done && i.plan_date && i.plan_date < t ? "late" : ""}"><input type="checkbox" data-pg="done" data-id="${i.id}" ${i.done ? "checked" : ""}><span>${esc(i.title)}</span><small>${i.done && i.done_at ? "✓ " + md(new Date(new Date(i.done_at).getTime() + 2 * 3600e3).toISOString().slice(0, 10)) : i.plan_date ? "預計 " + md(i.plan_date) : ""}</small></label>`).join("");
      return `<section class="card pg-sub"><div class="pg-sh" data-pg="fold" data-s="${esc(s)}"><b>${open ? "▾" : "▸"} ${esc(s)}</b><span>${d}/${its.length}・<b>${pc(d, its.length)}%</b>・剩 ${its.length - d}</span></div>
        ${bar(pc(d, its.length), du ? pc(du, its.length) : null)}
        ${open ? `<div class="pg-list">${rows || `<p class="small-note">這科都完成了 🎉</p>`}
          ${P.edit ? `<div class="pg-it"><input class="pg-in" placeholder="＋ 新增一項（例如 CH7 網路概論）" data-pgnew="${esc(s)}"><input type="date" class="pg-dt" data-pgnewd="${esc(s)}"><button type="button" class="btn btn-small" data-pg="add" data-s="${esc(s)}">加入</button></div>` : ""}</div>` : ""}</section>`;
    }).join("");
    const addSub = P.edit ? `<section class="card"><div class="pg-it"><input class="pg-in" id="pg-newsub" placeholder="＋ 新增科目（例如 作業系統）"><button type="button" class="btn btn-small" data-pg="addsub">新增科目</button></div></section>` : "";
    root.innerHTML = head + body + addSub;
  }

  async function upd(id, patch) {
    const it = P.items.find(i => i.id === id); if (!it) return; const old = { ...it };
    Object.assign(it, patch); render();
    const { error } = await db.from("study_items").update(patch).eq("id", id);
    if (error) { Object.assign(it, old); render(); toast("儲存失敗：" + error.message); }
  }
  async function add(subject, title, plan_date) {
    const sort = Math.max(-1, ...P.items.filter(i => i.subject === subject).map(i => i.sort)) + 1;
    const { data, error } = await db.from("study_items").insert({ subject, title, plan_date: plan_date || null, sort }).select("id, subject, title, plan_date, done, done_at, sort").single();
    if (error) return toast("新增失敗：" + error.message);
    P.items.push(data); P.open[subject] = true; render();
  }

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-pg]"); if (!b || !P.items) return; const a = b.dataset.pg, id = Number(b.dataset.id);
    if (a === "done") { const on = b.checked; return upd(id, { done: on, done_at: on ? new Date().toISOString() : null }); }
    if (a === "fold") { const s = b.dataset.s; P.open[s] = P.open[s] === false; saveUi(); return render(); }
    if (a === "hide") { P.hideDone = !P.hideDone; saveUi(); return render(); }
    if (a === "edit") { P.edit = !P.edit; return render(); }
    if (a === "del") { const it = P.items.find(i => i.id === id); if (!it || b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "確定？"; return; }
      const { error } = await db.from("study_items").delete().eq("id", id); if (error) return toast("刪除失敗：" + error.message);
      P.items = P.items.filter(i => i.id !== id); return render(); }
    if (a === "add") { const s = b.dataset.s, inp = document.querySelector(`[data-pgnew="${CSS.escape(s)}"]`), dt = document.querySelector(`[data-pgnewd="${CSS.escape(s)}"]`);
      const v = inp && inp.value.trim(); if (!v) return toast("先寫要新增什麼"); return add(s, v, dt && dt.value); }
    if (a === "addsub") { const inp = document.getElementById("pg-newsub"), v = inp && inp.value.trim(); if (!v) return toast("先寫科目名稱");
      if (P.items.some(i => i.subject === v)) return toast("已經有這個科目了"); return add(v, "第一項（改成你要的內容）", null); }
  });
  document.addEventListener("change", e => {
    const f = e.target.closest("[data-pgf]"); if (!f || !P.items) return; const id = Number(f.dataset.id), k = f.dataset.pgf;
    const v = k === "plan_date" ? (f.value || null) : f.value.trim(); if (k === "title" && !v) return render();
    upd(id, { [k]: v });
  });

  const st = document.createElement("style");
  st.textContent = `
    .pg-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
    .pg-big { margin: 10px 0 6px; display: flex; align-items: baseline; gap: 10px; } .pg-big b { font-size: 30px; } .pg-big span { font-size: 13px; opacity: .75; }
    .pg-bar { position: relative; height: 10px; border-radius: 6px; background: rgba(127,127,127,.18); overflow: visible; }
    .pg-bar i { display: block; height: 100%; border-radius: 6px; background: linear-gradient(90deg, #7c5cff, #3fb950); }
    .pg-bar u { position: absolute; top: -3px; width: 2px; height: 16px; background: currentColor; opacity: .55; }
    .pg-sh { display: flex; justify-content: space-between; align-items: center; cursor: pointer; margin-bottom: 8px; gap: 8px; } .pg-sh span { font-size: 13px; opacity: .85; }
    .pg-list { margin-top: 8px; }
    .pg-it { display: flex; align-items: center; gap: 8px; padding: 7px 2px; border-top: 1px solid rgba(127,127,127,.13); font-size: 14px; }
    .pg-it span { flex: 1; } .pg-it small { font-size: 11.5px; opacity: .6; white-space: nowrap; }
    .pg-it.on span { text-decoration: line-through; opacity: .5; } .pg-it.late small { color: #f0883e; opacity: 1; }
    .pg-it input[type=checkbox] { width: 18px; height: 18px; flex: none; }
    .pg-in { flex: 1; min-width: 0; padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(127,127,127,.3); background: transparent; color: inherit; font: inherit; }
    .pg-dt { width: 140px; padding: 5px; border-radius: 8px; border: 1px solid rgba(127,127,127,.3); background: transparent; color: inherit; }
    .pg-del { border: 0; background: transparent; cursor: pointer; font-size: 13px; color: inherit; }`;
  document.head.appendChild(st);
  if (typeof window.applyPage === "function") { const base = window.applyPage; window.applyPage = function (name) { const r = base.apply(this, arguments); if (name === "progress") setTimeout(load, 0); return r; }; }
  (function boot(n) { if (!hasDb()) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; } ensurePage(); })(0);
  window.StudyProgress = { load };
})();
