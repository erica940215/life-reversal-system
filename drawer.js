/* 🗂️ 今日頁的「小抽屜」：抽籤筒、村民委託、今日事件、夢境收進同一個夾層
   - 夾層本身可以收起、長按整個夾層拖曳（跟其他卡片一樣）
   - 夾層裡面：長按卡片拖曳排順序；每張也可以點標題收起（📂 收起卡片選單也有）
   - 順序記在這台裝置 */
(function () {
  const MEMBERS = ["fn-today", "vg-today", "de-today", "dr-today"];
  const KEY = "drawerOrder";
  const HOLD_MS = 450, NO_GRAB = "button, a, input, select, textarea, label, [contenteditable]";
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) {} };
  const page = () => document.querySelector('.page[data-page="today"]');
  let drawer = null, body = null, busy = false;

  function ensure() {
    const p = page();
    if (!p) return null;
    if (!drawer || !drawer.isConnected) {
      drawer = document.getElementById("today-drawer");
      if (!drawer) {
        drawer = document.createElement("section");
        drawer.id = "today-drawer";
        drawer.className = "card";
        drawer.innerHTML = `<h2>🗂️ 今日小抽屜</h2><div class="drawer-body"></div><p class="drawer-empty">裡面的卡片還在載入…</p>`;
        const first = MEMBERS.map(id => document.getElementById(id)).find(el => el && el.parentElement === p);
        first ? first.before(drawer) : p.appendChild(drawer);
      }
      body = drawer.querySelector(".drawer-body");
      new MutationObserver(() => { if (!busy && !drag) setTimeout(tidy, 0); }).observe(body, { childList: true });
    }
    return drawer;
  }

  /* 把成員搬進來、把不是成員的搬出去、照順序排 */
  function tidy() {
    if (!ensure() || drag) return;
    busy = true;
    if (!drawer.dataset.placed) {
      const out = MEMBERS.map(id => document.getElementById(id)).find(el => el && el.parentElement === page());
      if (out) { drawer.dataset.placed = "1"; out.before(drawer); }
    }
    [...body.children].forEach(el => { if (!MEMBERS.includes(el.id)) drawer.before(el); });
    MEMBERS.forEach(id => { const el = document.getElementById(id); if (el && el.parentElement !== body) body.appendChild(el); });
    const order = load(), rank = id => { const i = order.indexOf(id); return i < 0 ? 100 + MEMBERS.indexOf(id) : i; };
    const list = [...body.children], sorted = list.slice().sort((a, b) => rank(a.id) - rank(b.id));
    if (!sorted.every((el, i) => el === list[i])) sorted.forEach(el => body.appendChild(el));
    drawer.querySelector(".drawer-empty").hidden = list.some(el => !el.hidden);
    busy = false;
  }

  /* ---------- 夾層裡面長按拖曳 ---------- */
  let hold = null, drag = null, suppress = false;
  const itemOf = t => { let el = t; while (el && el.parentElement !== body) el = el.parentElement; return el; };
  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const it = itemOf(e.target);
    if (!it) return;
    e.stopPropagation(); /* 不要讓外層把整個夾層拖走 */
    if (e.target.closest(NO_GRAB)) return;
    clearTimeout(hold && hold.t);
    it.classList.add("reorder-pressing");
    hold = { it, x: e.clientX, y: e.clientY, t: setTimeout(() => start(it, e.clientY), HOLD_MS) };
  }
  const cancel = () => { if (hold) { clearTimeout(hold.t); hold.it.classList.remove("reorder-pressing"); hold = null; } };
  function start(it, y) {
    cancel();
    drag = { it, grab: y - it.getBoundingClientRect().top, y };
    it.classList.add("drawer-lift"); document.body.classList.add("reorder-on");
    if (navigator.vibrate) try { navigator.vibrate(25); } catch (_) {}
    place();
  }
  function place() {
    const { it } = drag;
    it.style.transform = "";
    const list = [...body.children].filter(el => !el.hidden), i = list.indexOf(it), prev = list[i - 1], next = list[i + 1];
    if (prev) { const r = prev.getBoundingClientRect(); if (drag.y < r.top + r.height / 2) { body.insertBefore(it, prev); return place(); } }
    if (next) { const r = next.getBoundingClientRect(); if (drag.y > r.top + r.height / 2) { body.insertBefore(it, next.nextSibling); return place(); } }
    it.style.transform = `translateY(${drag.y - drag.grab - it.getBoundingClientRect().top}px) scale(1.02)`;
  }
  document.addEventListener("pointermove", e => {
    if (hold && !drag) { if (Math.abs(e.clientX - hold.x) > 8 || Math.abs(e.clientY - hold.y) > 8) cancel(); return; }
    if (!drag) return;
    e.preventDefault(); drag.y = e.clientY; place();
  }, { passive: false });
  function up() {
    cancel();
    if (!drag) return;
    const { it } = drag;
    it.classList.remove("drawer-lift"); it.style.transform = ""; document.body.classList.remove("reorder-on");
    drag = null; suppress = true; setTimeout(() => { suppress = false; }, 350);
    save([...body.children].map(el => el.id));
    if (typeof showToast === "function") showToast("↕️ 抽屜裡的順序記住了");
  }
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
  document.addEventListener("touchmove", e => { if (drag) e.preventDefault(); }, { passive: false });
  document.addEventListener("click", e => { if (suppress) { e.stopPropagation(); e.preventDefault(); } }, true);

  const st = document.createElement("style");
  st.textContent = `
    #today-drawer { background: linear-gradient(160deg, rgba(124,92,255,.10), rgba(255,213,74,.06)); }
    #today-drawer .drawer-body { display: flex; flex-direction: column; gap: 10px; }
    #today-drawer .drawer-body > .card { margin: 0 !important; box-shadow: none; border: 1px solid rgba(127,127,127,.2); -webkit-touch-callout: none; }
    #today-drawer .drawer-empty { font-size: 12.5px; opacity: .6; margin: 4px 0 0; }
    #today-drawer .drawer-body > .drawer-lift { position: relative; z-index: 50; box-shadow: 0 14px 34px rgba(0,0,0,.45); }
    #today-drawer .drawer-body > .drawer-lift * { pointer-events: none; }
  `;
  document.head.appendChild(st);

  function startAll() {
    if (!ensure()) return;
    body.addEventListener("pointerdown", onDown);
    tidy();
    new MutationObserver(() => { if (!busy && !drag) { clearTimeout(startAll.t); startAll.t = setTimeout(tidy, 100); } }).observe(page(), { childList: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startAll); else startAll();
})();
