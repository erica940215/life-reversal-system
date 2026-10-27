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

  window.TodayReorder = { reset() { save([]); location.reload(); } };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
