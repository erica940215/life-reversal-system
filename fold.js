/* ==================================================
   📂 每一頁的卡片都可以收起來，只留標題
   - 點卡片標題那一列就收起／展開（點到按鈕不算）
   - 每頁最上面有「📂 收起卡片」：勾選要收起哪些、全部收起／全部展開
   - 後來才加進頁面的卡片（遊戲、村民…）也會自動支援
   - 收起來的卡片記在這台裝置（localStorage），下次打開一樣
================================================== */
(function () {
  const KEY = "foldedCards";
  const HEAD = ":scope > .card-head, :scope > h2, :scope > h3, :scope > .vg-h, :scope > .card-title, :scope > .lf-head";

  const folded = (() => {
    try {
      const s = new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
      /* 舊版只記今日頁的 id */
      JSON.parse(localStorage.getItem("todayFolded") || "[]").forEach(id => s.add("today:" + id));
      return s;
    } catch (_) { return new Set(); }
  })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...folded])); } catch (_) {} };

  const clean = t => String(t || "").replace(/▾/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
  function titleOf(card) {
    const h = card.querySelector(HEAD);
    const t = h && (h.querySelector("h2, h3, b, strong") || h);
    return clean(t && t.textContent) || clean((card.querySelector("h2, h3, b, strong") || {}).textContent) || "未命名卡片";
  }
  function keyOf(card, page) {
    if (card.dataset.foldKey) return card.dataset.foldKey;
    const k = page.dataset.page + ":" + (card.id || "t:" + titleOf(card));
    card.dataset.foldKey = k;
    return k;
  }
  const topCards = page => [...page.querySelectorAll(".card")].filter(c => (c.parentElement.closest(".card, .page") === page || c.parentElement.classList.contains("drawer-body")) && !c.closest(".vg-modal, .modal, [role=dialog]"));

  function apply(card, on) {
    card.classList.toggle("folded", on);
    const h = card.querySelector(HEAD);
    if (h) h.setAttribute("aria-expanded", on ? "false" : "true");
  }
  function setFold(card, page, on) {
    const k = keyOf(card, page);
    on ? folded.add(k) : folded.delete(k);
    save();
    apply(card, on);
  }

  function prepare(page) {
    topCards(page).forEach(card => {
      card.classList.add("can-fold");
      card.dataset.foldTitle = titleOf(card);
      const h = card.querySelector(HEAD);
      card.classList.toggle("fold-nohead", !h);
      if (h) {
        const t = h.matches("h2, h3") ? h : (h.querySelector("h2, h3, b, strong") || h);
        if (!t.querySelector(":scope > .fold-caret")) {
          const c = document.createElement("span");
          c.className = "fold-caret"; c.setAttribute("aria-hidden", "true"); c.textContent = "▾";
          t.prepend(c);
        }
        h.classList.add("fold-head");
        if (!h.hasAttribute("tabindex")) { h.setAttribute("role", "button"); h.setAttribute("tabindex", "0"); h.title = "點一下收起／展開"; }
      }
      const want = folded.has(keyOf(card, page));
      if (card.classList.contains("folded") !== want) apply(card, want);
    });
    bar(page);
  }

  /* ---------- 每頁上面的「📂 收起卡片」 ---------- */
  function bar(page) {
    if (page.querySelector(":scope > .fold-bar")) return;
    if (!topCards(page).length) return;
    const b = document.createElement("div");
    b.className = "fold-bar";
    b.innerHTML = `<button type="button" class="fold-open">📂 收起卡片</button>`;
    page.prepend(b);
  }
  function menu(page, btn) {
    document.querySelectorAll(".fold-menu").forEach(m => m.remove());
    const cards = topCards(page).filter(c => !c.hidden && c.offsetParent !== null || c.classList.contains("folded"));
    const m = document.createElement("div");
    m.className = "fold-menu";
    m.innerHTML = `<div class="fold-menu-h"><b>這頁要收起哪些？</b><button type="button" data-f="x" aria-label="關閉">✕</button></div>
      <div class="fold-menu-btns"><button type="button" data-f="all">全部收起</button><button type="button" data-f="none">全部展開</button></div>
      ${cards.map((c, i) => `<label><input type="checkbox" data-i="${i}" ${c.classList.contains("folded") ? "checked" : ""}> ${c.dataset.foldTitle}</label>`).join("")}`;
    btn.parentElement.appendChild(m);
    m.addEventListener("change", e => { const c = cards[e.target.dataset.i]; if (c) setFold(c, page, e.target.checked); });
    m.addEventListener("click", e => {
      const f = e.target.closest("[data-f]");
      if (!f) return;
      if (f.dataset.f === "x") return m.remove();
      const on = f.dataset.f === "all";
      cards.forEach(c => setFold(c, page, on));
      m.querySelectorAll("input").forEach(i => { i.checked = on; });
    });
  }

  document.addEventListener("click", e => {
    const ob = e.target.closest(".fold-open");
    if (ob) { const p = ob.closest(".page"); if (p) { prepare(p); menu(p, ob); } return; }
    if (!e.target.closest(".fold-menu")) document.querySelectorAll(".fold-menu").forEach(m => m.remove());
    const card = e.target.closest(".card.can-fold");
    if (!card) return;
    const page = card.closest(".page");
    if (!page) return;
    if (card.classList.contains("fold-nohead")) {
      if (card.classList.contains("folded")) { e.preventDefault(); setFold(card, page, false); }
      return;
    }
    const h = e.target.closest(".fold-head");
    if (!h || h.parentElement !== card) return;
    if (e.target.closest("button, a, input, select, textarea, label")) return;
    setFold(card, page, !card.classList.contains("folded"));
  });
  document.addEventListener("keydown", e => {
    const h = e.target.closest && e.target.closest(".fold-head");
    if (!h || e.target !== h || (e.key !== "Enter" && e.key !== " ")) return;
    const card = h.parentElement, page = card.closest(".page");
    if (!page || !card.classList.contains("can-fold")) return;
    e.preventDefault();
    setFold(card, page, !card.classList.contains("folded"));
  });

  /* 沒有標題列的卡片：收起時用 data-fold-title 顯示一條標題 */
  const st = document.createElement("style");
  st.textContent = `
    .card.can-fold > .fold-head { cursor: pointer; user-select: none; }
    .card.folded > :not(.fold-head) { display: none !important; }
    .card.folded { padding-top: 10px !important; padding-bottom: 10px !important; }
    .card.folded > .fold-head { margin-bottom: 0 !important; }
    .card.fold-nohead.folded { cursor: pointer; }
    .card.fold-nohead.folded::before { content: "▸ " attr(data-fold-title); font-weight: 800; font-size: 14px; opacity: .8; }
    .card.folded .fold-caret { display: inline-block; transform: rotate(-90deg); }
    .fold-bar { position: relative; display: flex; justify-content: flex-end; margin: 0 0 6px; }
    .fold-open { border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; border-radius: 99px; padding: 4px 12px; font-size: 12.5px; cursor: pointer; opacity: .85; }
    .fold-menu { position: absolute; right: 0; top: 34px; z-index: 900; width: min(300px, calc(100vw - 32px)); max-height: 60vh; overflow-y: auto; background: var(--card-bg, #1b2033); color: inherit; border: 1px solid rgba(127,127,127,.35); border-radius: 14px; padding: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
    .fold-menu-h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; } .fold-menu-h button { border: 0; background: none; color: inherit; cursor: pointer; font-size: 15px; }
    .fold-menu-btns { display: flex; gap: 6px; margin-bottom: 6px; } .fold-menu-btns button { flex: 1; border: 0; border-radius: 8px; padding: 6px; background: rgba(127,127,127,.18); color: inherit; cursor: pointer; font-size: 12.5px; }
    .fold-menu label { display: flex; gap: 8px; align-items: center; padding: 6px 2px; font-size: 13.5px; border-top: 1px solid rgba(127,127,127,.15); cursor: pointer; }
  `;
  document.head.appendChild(st);

  /* 掃描所有頁面；有新卡片或卡片內容重畫時再掃一次 */
  let timer = null;
  const scan = all => { timer = null; document.querySelectorAll(".page[data-page]").forEach(p => { if (all === true || p.offsetParent !== null) prepare(p); }); };
  const later = () => { if (!timer) timer = setTimeout(scan, 500); };
  function start() {
    scan(true);
    document.addEventListener("click", e => { if (e.target.closest(".tab-btn, [data-page]")) setTimeout(() => scan(), 80); }, true);
    new MutationObserver(muts => {
      if (muts.some(m => !(m.target.closest && m.target.closest(".fold-menu, .fold-bar")))) later();
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
