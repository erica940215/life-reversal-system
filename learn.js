/* 📚 每科今天學到什麼＋遺忘曲線複習
   資料在 sql/2026-11-08_每科今天學到什麼.sql */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const GAPS = [1, 2, 4, 7, 15, 30, 60];
  const L = { d: null, err: null, subj: null, open: false };
  const lastSubj = () => { try { return localStorage.getItem("learnSubj"); } catch (_) { return null; } };

  async function load() {
    const { data, error } = await db.rpc("learn_status");
    L.err = error ? error.message : null;
    if (!error) L.d = data;
    render();
  }

  function render() {
    const tp = document.querySelector('.page[data-page="today"]');
    if (!tp) return;
    let box = document.getElementById("ln-today");
    if (!box) {
      box = document.createElement("section");
      box.id = "ln-today"; box.className = "card";
      const ref = document.getElementById("today-checkin") || document.getElementById("morning-card");
      ref ? ref.after(box) : tp.appendChild(box);
    }
    const d = L.d;
    if (!d) { box.innerHTML = `<h2>📚 今天學到什麼</h2><p class="tb-note">${L.err ? (/learn_status/.test(L.err) ? "資料庫還沒設定：到 Supabase 執行 sql/2026-11-08_每科今天學到什麼.sql" : esc(L.err)) : "載入中…"}</p>`; return; }
    const subs = d.subjects.length ? d.subjects : ["多益", "資料結構", "計概"];
    if (!L.subj) L.subj = lastSubj() && subs.includes(lastSubj()) ? lastSubj() : subs[0];
    const groups = {};
    d.today_notes.forEach(n => (groups[n.subject] = groups[n.subject] || []).push(n));
    box.innerHTML = `<h2>📚 今天學到什麼</h2>
      ${d.due.length ? `<button type="button" class="ln-rev" data-ln="review">🔁 今天要複習 <b>${d.due.length}</b> 則（遺忘曲線排的）</button>` : `<p class="tb-note">${d.reviewed_today ? `✅ 今天複習完了（${d.reviewed_today} 則）` : "今天沒有要複習的"}・共 ${d.total} 則，熟記 ${d.mastered} 則</p>`}
      ${Object.keys(groups).length ? Object.entries(groups).map(([s, ns]) => `<div class="ln-g"><b>${esc(s)}</b>${ns.map(n => `<div class="ln-n"><span>・${esc(n.title)}${n.note ? `<small>${esc(n.note)}</small>` : ""}</span><button type="button" data-ln="del" data-id="${n.id}" aria-label="刪除">✕</button></div>`).join("")}</div>`).join("")
        : `<p class="tb-note">每一科寫幾個今天學到的標題就好，之後會在 1、2、4、7、15、30、60 天後排回來讓你回想。今天寫滿 3 則送 ✨15。</p>`}
      <div class="ln-add">
        <div class="ln-subs">${subs.map(s => `<button type="button" class="${s === L.subj ? "on" : ""}" data-ln="subj" data-v="${esc(s)}">${esc(s)}</button>`).join("")}<button type="button" data-ln="newsubj">＋科目</button></div>
        <input id="ln-title" maxlength="120" placeholder="${esc(L.subj)}：今天學到的標題（例如 AVL 樹的旋轉）">
        <textarea id="ln-note" rows="2" maxlength="1000" placeholder="一句重點（選填，複習時用來對答案）"></textarea>
        <button type="button" class="btn btn-small btn-primary" data-ln="add" style="width:100%">＋ 記下來</button></div>`;
    const inp = box.querySelector("#ln-title");
    if (inp) inp.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); add(); } });
  }

  async function add() {
    const t = document.getElementById("ln-title"), n = document.getElementById("ln-note");
    if (!t || !t.value.trim()) return toast("先寫標題");
    const { data, error } = await db.rpc("learn_add", { p_subject: L.subj, p_title: t.value, p_note: n ? n.value : null });
    if (error) return toast(error.message);
    L.d = data; render(); toast(`📚 記下來了・明天會考你`);
    const t2 = document.getElementById("ln-title"); if (t2) t2.focus();
  }

  /* 🔁 複習：看標題回想 → 翻面看重點 → 自己評分 */
  function review() {
    const items = (L.d && L.d.due) || [];
    if (!items.length) return;
    const S = { i: 0, shown: false, done: 0 };
    const m = document.createElement("div");
    m.className = "vg-modal";
    const draw = () => {
      if (S.i >= items.length) {
        m.innerHTML = `<div class="vg-card" style="text-align:center"><div class="bh-big">🎉</div><div class="vg-title">複習完了！</div><p>今天回想了 ${S.done} 則</p><button type="button" class="btn btn-primary" data-x="1" style="width:100%">完成</button></div>`;
        return;
      }
      const n = items[S.i], ago = Math.round((Date.parse(L.d.today) - Date.parse(n.day)) / 864e5);
      m.innerHTML = `<div class="vg-card"><div class="ln-prog">${S.i + 1} / ${items.length}<button type="button" data-x="1">✕</button></div>
        <div class="ln-card ${S.shown ? "open" : ""}" data-lnr="flip"><small>${esc(n.subject)}・${ago} 天前學的${n.lapses ? `・忘過 ${n.lapses} 次` : ""}</small><b>${esc(n.title)}</b>
          ${S.shown ? `<p>${n.note ? esc(n.note) : "（當時沒寫重點，憑你的記憶判斷）"}</p>` : `<p class="ln-hint">先在心裡說出這個主題的內容、怎麼運作、例子，想好了點卡片</p>`}</div>
        ${S.shown ? `<div class="ln-grades">${[[0, "😵 忘了", 1], [1, "🤔 模糊", GAPS[n.stage]], [2, "😊 記得", GAPS[Math.min(n.stage + 1, GAPS.length - 1)]]].map(([g, l, dd]) => `<button type="button" class="g${g}" data-lnr="grade" data-v="${g}">${l}<small>${dd} 天後</small></button>`).join("")}</div>` : ""}</div>`;
    };
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-x]")) { m.remove(); load(); return; }
      const b = e.target.closest("[data-lnr]");
      if (!b) return;
      if (b.dataset.lnr === "flip" && !S.shown) { S.shown = true; return draw(); }
      if (b.dataset.lnr === "grade") {
        const n = items[S.i], g = Number(b.dataset.v);
        const { error } = await db.rpc("learn_review", { p_id: n.id, p_grade: g });
        if (error) return toast(error.message);
        if (g === 0) items.push({ ...n, stage: 0, lapses: n.lapses + 1, again: true });
        S.done += 1; S.i += 1; S.shown = false; draw();
      }
    });
    draw();
    document.body.appendChild(m);
  }

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-ln]");
    if (!b || !hasDb()) return;
    const a = b.dataset.ln;
    if (a === "subj") { L.subj = b.dataset.v; try { localStorage.setItem("learnSubj", L.subj); } catch (_) {} const keep = [document.getElementById("ln-title")?.value, document.getElementById("ln-note")?.value]; render(); document.getElementById("ln-title").value = keep[0] || ""; document.getElementById("ln-note").value = keep[1] || ""; return; }
    if (a === "newsubj") { const v = (prompt("新的科目名稱") || "").trim(); if (!v) return; L.subj = v.slice(0, 30); if (!L.d.subjects.includes(L.subj)) L.d.subjects.unshift(L.subj); render(); return; }
    if (a === "add") return add();
    if (a === "review") return review();
    if (a === "del") { if (!confirm("刪掉這則？")) return; const { data, error } = await db.rpc("learn_delete", { p_id: Number(b.dataset.id) }); if (error) return toast(error.message); L.d = data; render(); }
  });

  const st = document.createElement("style");
  st.textContent = `
    .ln-rev { width: 100%; border: 1px solid #7c5cff; background: rgba(124,92,255,.15); color: inherit; border-radius: 12px; padding: 10px; font: inherit; font-size: 14px; cursor: pointer; margin-bottom: 6px; }
    .ln-g { margin: 8px 0; } .ln-g > b { font-size: 13px; color: #c08bff; }
    .ln-n { display: flex; gap: 6px; align-items: flex-start; font-size: 13.5px; padding: 2px 0; } .ln-n span { flex: 1; } .ln-n small { display: block; font-size: 11.5px; opacity: .65; margin-left: 12px; }
    .ln-n button { border: 0; background: none; color: inherit; opacity: .4; cursor: pointer; }
    .ln-add { margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(127,127,127,.3); }
    .ln-add input, .ln-add textarea { width: 100%; box-sizing: border-box; background: rgba(0,0,0,.2); color: inherit; border: 1px solid rgba(127,127,127,.35); border-radius: 10px; padding: 8px; font: inherit; margin: 4px 0; resize: vertical; }
    .ln-subs { display: flex; flex-wrap: wrap; gap: 4px; } .ln-subs button { border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; border-radius: 99px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
    .ln-subs button.on { background: #7c5cff; border-color: #7c5cff; color: #fff; }
    .ln-prog { display: flex; justify-content: space-between; font-size: 12px; opacity: .75; margin-bottom: 8px; } .ln-prog button { border: 0; background: none; color: inherit; cursor: pointer; }
    .ln-card { min-height: 180px; border-radius: 16px; padding: 18px; background: linear-gradient(160deg, #262c48, #1a1f36); border: 1px solid #3a4260; cursor: pointer; display: flex; flex-direction: column; justify-content: center; text-align: center; }
    .ln-card small { font-size: 12px; opacity: .65; } .ln-card b { font-size: 20px; margin: 8px 0; } .ln-card p { font-size: 14px; line-height: 1.6; margin: 6px 0 0; } .ln-card.open { cursor: default; border-color: #7c5cff; }
    .ln-hint { opacity: .6; font-size: 12.5px !important; }
    .ln-grades { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 10px; } .ln-grades button { border: 0; border-radius: 12px; padding: 10px 4px; font: inherit; font-size: 14px; cursor: pointer; color: #fff; }
    .ln-grades small { display: block; font-size: 11px; opacity: .85; } .ln-grades .g0 { background: #da3633; } .ln-grades .g1 { background: #d29922; } .ln-grades .g2 { background: #2ea043; }
  `;
  document.head.appendChild(st);

  (function boot(n) {
    if (!hasDb() || !document.querySelector('.page[data-page="today"]')) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; }
    load();
    setInterval(() => { if (!document.hidden) load(); }, 10 * 60 * 1000);
  })(0);
  window.LearnBox = { load, focus: () => { const t = document.getElementById("ln-title"); if (t) { t.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => t.focus(), 400); } } };
})();
