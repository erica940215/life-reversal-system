/* ==================================================
   ↕️ 今日頁：長按卡片拖曳，調整上下順序
   - 長按約 0.45 秒（手指不要動）→ 卡片浮起來，拖到想要的位置放開
   - 順序記在這台裝置（localStorage），之後加進來的卡片也會照順序排
   - 點按鈕、輸入框不會觸發
================================================== */
(function () {
  const KEY = "todayOrder";
  const HOLD_MS = 450;
  const SKIP = ".page-title, .subnav, .game-mode-bar, script, style";
  const NO_GRAB = "button, a, input, select, textarea, label, [contenteditable], .no-drag";

  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} };

  const page = () => document.querySelector('.page[data-page="today"]');

  function keyOf(el) {
    if (el.id) return el.id;
    if (el.dataset.reorderKey) return el.dataset.reorderKey;
    const h = el.querySelector("h2, h3");
    if (!h) return null;
    el.dataset.reorderKey = "h:" + h.textContent.replace(/\s+/g, "").slice(0, 24);
    return el.dataset.reorderKey;
  }

  function items() {
    const p = page();
    if (!p) return [];
    return [...p.children].filter(el => !el.matches(SKIP) && keyOf(el));
  }

  /* 照存起來的順序排；沒記錄過的卡片保持原本的相對位置 */
  let applying = false;
  function applyOrder() {
    const order = load();
    if (!order.length) return;
    const list = items();
    if (list.length < 2) return;
    const rank = new Map(order.map((k, i) => [k, i]));
    const orig = new Map(list.map((el, i) => [el, i]));
    /* 沒記錄的卡片：排在原本它前面那張已記錄卡片的後面 */
    const score = new Map();
    let last = -1;
    list.forEach(el => {
      const r = rank.get(keyOf(el));
      if (r !== undefined) { last = r; score.set(el, r); }
      else score.set(el, last + 0.001 * (orig.get(el) + 1));
    });
    const sorted = list.slice().sort((a, b) => score.get(a) - score.get(b) || orig.get(a) - orig.get(b));
    if (sorted.every((el, i) => el === list[i])) return;
    applying = true;
    const anchor = list[0].previousSibling;
    const p = page();
    let ref = anchor ? anchor.nextSibling : p.firstChild;
    sorted.forEach(el => { p.insertBefore(el, ref); ref = el.nextSibling; });
    applying = false;
  }

  function saveCurrent() {
    const now = items().map(keyOf);
    /* 保留目前沒顯示、但以前記過的卡片位置 */
    const old = load().filter(k => !now.includes(k));
    save(now.concat(old));
  }

  /* ---------- 拖曳 ---------- */
  let hold = null, drag = null, suppressClick = false;

  function style() {
    const s = document.createElement("style");
    s.textContent = `
      .page[data-page="today"] > .reorder-lift{position:relative;z-index:50;box-shadow:0 14px 34px rgba(0,0,0,.45);transform-origin:center;opacity:.96;transition:box-shadow .15s}
      .page[data-page="today"] > .reorder-lift *{pointer-events:none}
      .page[data-page="today"] > .reorder-pressing{transform:scale(.985);transition:transform .45s}
      body.reorder-on{user-select:none;-webkit-user-select:none;touch-action:none}
      .page[data-page="today"] > section, .page[data-page="today"] > div{-webkit-touch-callout:none}`;
    document.head.appendChild(s);
  }

  function cardFrom(target) {
    const p = page();
    if (!p || !p.classList.contains("active")) return null;
    let el = target;
    while (el && el.parentElement !== p) el = el.parentElement;
    if (!el || el.matches(SKIP) || !keyOf(el)) return null;
    return el;
  }

  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest(NO_GRAB)) return;
    const card = cardFrom(e.target);
    if (!card) return;
    cancelHold();
    card.classList.add("reorder-pressing");
    hold = { card, x: e.clientX, y: e.clientY, id: e.pointerId,
      t: setTimeout(() => start(card, e.clientY), HOLD_MS) };
  }

  function cancelHold() {
    if (!hold) return;
    clearTimeout(hold.t);
    hold.card.classList.remove("reorder-pressing");
    hold = null;
  }

  function start(card, y) {
    hold && hold.card.classList.remove("reorder-pressing");
    hold = null;
    const r = card.getBoundingClientRect();
    drag = { card, grab: y - r.top, y, raf: 0 };
    card.classList.add("reorder-lift");
    document.body.classList.add("reorder-on");
    if (navigator.vibrate) try { navigator.vibrate(25); } catch (_) {}
    place();
    loop();
  }

  function place() {
    const { card } = drag;
    card.style.transform = "";
    const natural = card.getBoundingClientRect().top;
    const list = items();
    const i = list.indexOf(card);
    const prev = list[i - 1], next = list[i + 1];
    if (prev) {
      const pr = prev.getBoundingClientRect();
      if (drag.y < pr.top + pr.height / 2) { card.parentNode.insertBefore(card, prev); return place(); }
    }
    if (next) {
      const nr = next.getBoundingClientRect();
      if (drag.y > nr.top + nr.height / 2) { card.parentNode.insertBefore(card, next.nextSibling); return place(); }
    }
    const top = card.getBoundingClientRect().top;
    card.style.transform = `translateY(${drag.y - drag.grab - top}px) scale(1.02)`;
    void natural;
  }

  /* 拖到畫面上下邊緣時自動捲動 */
  function loop() {
    if (!drag) return;
    const edge = 90, bottom = window.innerHeight - 120;
    let dy = 0;
    if (drag.y < edge) dy = -Math.ceil((edge - drag.y) / 6);
    else if (drag.y > bottom) dy = Math.ceil((drag.y - bottom) / 6);
    if (dy) { window.scrollBy(0, dy); place(); }
    drag.raf = requestAnimationFrame(loop);
  }

  function onMove(e) {
    if (hold && !drag) {
      if (Math.abs(e.clientX - hold.x) > 8 || Math.abs(e.clientY - hold.y) > 8) cancelHold();
      return;
    }
    if (!drag) return;
    e.preventDefault();
    drag.y = e.clientY;
    place();
  }

  function onUp() {
    cancelHold();
    if (!drag) return;
    const { card } = drag;
    cancelAnimationFrame(drag.raf);
    card.classList.remove("reorder-lift");
    card.style.transform = "";
    document.body.classList.remove("reorder-on");
    drag = null;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 350);
    saveCurrent();
    if (typeof showToast === "function") showToast("↕️ 順序已記住");
  }

  function setup() {
    style();
    applyOrder();
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", () => { if (!drag) cancelHold(); else onUp(); });
    /* 拖曳中不要讓瀏覽器捲動頁面 */
    document.addEventListener("touchmove", e => { if (drag) e.preventDefault(); }, { passive: false });
    document.addEventListener("contextmenu", e => { if (drag || hold) e.preventDefault(); });
    document.addEventListener("click", e => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);

    /* 之後才加進來的卡片也照順序排 */
    const p = page();
    if (p) {
      let t = 0;
      new MutationObserver(() => {
        if (applying || drag) return;
        clearTimeout(t);
        t = setTimeout(applyOrder, 120);
      }).observe(p, { childList: true });
    }
  }

  /* =========================================================
     ⚙️ 自訂主頁：每張卡片可以隱藏／顯示、上下移動（記在這台裝置）
  ========================================================= */
  const HKEY = "todayHidden";
  const loadHidden = () => { try { const v = JSON.parse(localStorage.getItem(HKEY) || "[]"); return new Set(Array.isArray(v) ? v : []); } catch (_) { return new Set(); } };
  const saveHidden = set => { try { localStorage.setItem(HKEY, JSON.stringify([...set])); } catch (_) {} };
  let hidden = loadHidden();

  const NAMES = { "gl-host": "🎯 今日目標", "vc-today": "📖 今日單字", "fn-today": "🎁 每日驚喜", "ev-today": "🎉 限時活動",
    "countdown-strip": "⏳ 倒數日", "dc-progress": "📈 今日進度條" };
  function nameOf(el) {
    if (NAMES[el.id]) return NAMES[el.id];
    const h = el.querySelector("h2, h3, .section-title, b");
    const t = h ? h.textContent.replace(/[▾▸]/g, "").replace(/\s+/g, " ").trim() : "";
    return t.slice(0, 30) || keyOf(el);
  }

  function applyHidden() {
    items().forEach(el => el.classList.toggle("today-hidden", hidden.has(keyOf(el))));
    const btn = document.getElementById("tl-open");
    if (btn) btn.textContent = hidden.size ? `⚙️ 自訂（藏了 ${hidden.size} 個）` : "⚙️ 自訂主頁";
  }

  function move(key, dir) {
    const list = items().map(keyOf);
    const i = list.indexOf(key), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    save(list);
    applyOrder();
  }

  function panelHtml() {
    const list = items();
    return `<div class="tl-head"><h2>⚙️ 自訂主頁</h2><button type="button" class="tl-x" data-tl="close" aria-label="關閉">✕</button></div>
      <p class="tl-note">勾掉的卡片會藏起來，主頁就不用拉那麼長；用 ↑↓ 調整順序（也可以在主頁長按卡片拖曳）。只影響這台裝置。</p>
      <div class="tl-list">${list.map((el, i) => { const k = keyOf(el); const on = !hidden.has(k);
        return `<div class="tl-row ${on ? "" : "off"}"><label><input type="checkbox" data-tl="toggle" data-k="${k.replace(/"/g, "&quot;")}" ${on ? "checked" : ""}> <span>${nameOf(el).replace(/</g, "&lt;")}</span></label>
          <span><button type="button" data-tl="up" data-k="${k.replace(/"/g, "&quot;")}" ${i ? "" : "disabled"}>↑</button><button type="button" data-tl="down" data-k="${k.replace(/"/g, "&quot;")}" ${i < list.length - 1 ? "" : "disabled"}>↓</button></span></div>`; }).join("")}</div>
      <div class="tl-foot"><button type="button" data-tl="showall">全部顯示</button><button type="button" data-tl="reset">恢復預設順序</button><button type="button" class="pri" data-tl="close">完成</button></div>`;
  }

  function renderPanel() {
    const ov = document.getElementById("tl-overlay");
    if (ov && !ov.hidden) ov.querySelector(".tl-panel").innerHTML = panelHtml();
  }

  function openPanel() {
    let ov = document.getElementById("tl-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "tl-overlay";
      ov.innerHTML = `<div class="tl-panel" role="dialog" aria-modal="true" aria-label="自訂主頁"></div>`;
      ov.addEventListener("click", e => {
        const el = e.target.closest("[data-tl]");
        if (!el) { if (e.target === ov) ov.hidden = true; return; }
        const a = el.dataset.tl, k = el.dataset.k;
        if (a === "close") { ov.hidden = true; return; }
        if (a === "toggle") { if (el.checked) hidden.delete(k); else hidden.add(k); saveHidden(hidden); applyHidden(); }
        if (a === "up" || a === "down") move(k, a === "up" ? -1 : 1);
        if (a === "showall") { hidden = new Set(); saveHidden(hidden); applyHidden(); }
        if (a === "reset") { save([]); location.reload(); return; }
        renderPanel();
      });
      document.body.appendChild(ov);
    }
    ov.hidden = false;
    renderPanel();
  }

  function setupLayout() {
    if (!document.getElementById("tl-style")) {
      const st = document.createElement("style");
      st.id = "tl-style";
      st.textContent = `
        .today-hidden { display: none !important; }
        #tl-open { margin-left: auto; font-size: 13px; padding: 6px 12px; border-radius: 10px; border: 0; background: rgba(127,127,127,.18); color: inherit; cursor: pointer; white-space: nowrap; }
        #tl-overlay { position: fixed; inset: 0; background: rgba(5,8,18,.6); z-index: 9998; display: flex; justify-content: center; align-items: flex-start; padding: 60px 12px 20px; overflow-y: auto; }
        #tl-overlay[hidden] { display: none; }
        .tl-panel { width: 100%; max-width: 440px; background: #1f2436; color: #e8ebf5; border-radius: 16px; padding: 16px; }
        .tl-head { display: flex; justify-content: space-between; align-items: center; } .tl-head h2 { margin: 0; font-size: 19px; }
        .tl-x { background: none; border: 0; color: #8f98b6; font-size: 20px; cursor: pointer; }
        .tl-note { font-size: 12.5px; color: #8f98b6; margin: 6px 0 10px; }
        .tl-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: #151927; margin-bottom: 6px; }
        .tl-row.off { opacity: .5; }
        .tl-row label { display: flex; gap: 8px; align-items: center; flex: 1; min-width: 0; cursor: pointer; font-size: 14px; }
        .tl-row label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tl-row button { background: #2c3350; color: #e8ebf5; border: 0; border-radius: 8px; width: 32px; height: 30px; margin-left: 4px; cursor: pointer; }
        .tl-row button:disabled { opacity: .3; }
        .tl-foot { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
        .tl-foot button { flex: 1; background: #2c3350; color: #e8ebf5; border: 0; border-radius: 10px; padding: 9px; cursor: pointer; font-weight: 700; }
        .tl-foot button.pri { background: #ff9f43; color: #1b1f2e; }
      `;
      document.head.appendChild(st);
    }
    const p = page();
    const title = p && p.querySelector(".page-title");
    if (title && !document.getElementById("tl-open")) {
      const b = document.createElement("button");
      b.id = "tl-open"; b.type = "button";
      b.addEventListener("click", openPanel);
      title.style.display = "flex"; title.style.alignItems = "center"; title.style.gap = "8px"; title.style.flexWrap = "wrap";
      title.appendChild(b);
    }
    applyHidden();
    if (p) {
      let t = 0;
      new MutationObserver(() => { clearTimeout(t); t = setTimeout(applyHidden, 150); }).observe(p, { childList: true });
    }
  }

  window.TodayReorder = { reset() { save([]); location.reload(); }, open: openPanel, apply: applyHidden };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupLayout);
  else setupLayout();

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
