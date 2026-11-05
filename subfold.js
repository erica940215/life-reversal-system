/* 📂 專注卡裡的小區塊：每一塊都可以「顯示／收起／隱藏」
   用 CSS 規則控制（區塊重畫也不會跑掉），設定記在這台裝置。
   在專注頁「📂 收起卡片」選單裡設定；收起的區塊點那一條就展開 */
(function () {
  const KEY = "focusSubFold";
  const SUBS = [
    ["#ev-exp", "🧭 專注遠征"], [".st-combo", "⚡ 專注連擊"], [".st-prompt", "✍️ 寫知識卡提示"], [".st-kc", "🃏 知識卡"],
    [".st-room", "👥 一起專注房間"], ["#fp-basket", "🍂 專注掉落物"], ["#fp-co", "👻 陪讀桌"], ["#ra-box", "📻 白噪音電台"],
    ["#focus-friends", "🧑‍🤝‍🧑 好友專注狀態"], ["#focus-log", "📝 今天的專注紀錄"], ["#focus-stats", "📊 專注統計"], ["#focus-presets", "⏱️ 時間快捷鍵"]];
  /* 可以調順序的區塊：專注卡第一層，和「連擊／知識卡／專注房間」那一包裡面 */
  const ORD = { top: [["> .card-head", "🏷️ 標題列"], ["#focus-setup", "⚙️ 科目、模式、時間設定"], ["#focus-now", "🎯 正在專注的科目"], ["#focus-clock", "⏱️ 計時器"],
      ["#focus-buttons", "▶️ 開始／暫停／結束按鈕"], ["#ev-exp", "🧭 專注遠征"], ["#st-focus", "⚡ 連擊・知識卡・專注房間"], ["#fp-basket", "🍂 專注掉落物"], ["#fp-co", "👻 陪讀桌"],
      ["#ra-box", "📻 白噪音電台"], ["#focus-log", "📝 今天的專注紀錄"], ["#focus-friends", "🧑‍🤝‍🧑 好友專注狀態"], ["#dm-run", "☢️ 末世出征"]],
    st: [[".st-combo", "⚡ 專注連擊"], [".st-prompt", "✍️ 寫知識卡提示"], [".st-kc", "🃏 知識卡"], [".st-room", "👥 一起專注房間"]] };
  const OKEY = "focusOrder";
  let O = {};
  try { O = JSON.parse(localStorage.getItem(OKEY) || "{}"); } catch (_) {}
  const ordList = g => { const keys = (O[g] || []).filter(k => ORD[g].some(x => x[0] === k)); return keys.concat(ORD[g].map(x => x[0]).filter(k => !keys.includes(k))).map(k => ORD[g].find(x => x[0] === k)); };
  let S = {};
  try { S = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (_) {}
  const st = document.createElement("style");
  document.head.appendChild(st);
  function css() {
    st.textContent = SUBS.map(([sel, name]) => {
      const s = `#focus-card ${sel}`;
      if (S[sel] === "hide") return `${s}{display:none!important}`;
      if (S[sel] === "fold") return `${s}>*{display:none!important}${s}{cursor:pointer;padding:6px 10px!important;margin:6px 0!important;border-radius:10px;background:rgba(127,127,127,.1);min-height:0!important}${s}::before{content:"▸ ${name}（點一下展開）";font-size:12.5px;font-weight:700;opacity:.75}`;
      return "";
    }).join("")
      + `#focus-card{display:flex;flex-direction:column}#focus-card>*{order:60;min-width:0}` + ordList("top").map(([sel], i) => `#focus-card ${sel}{order:${i}}`).join("")
      + `#st-focus{display:flex;flex-direction:column}#st-focus>*{order:60}` + ordList("st").map(([sel], i) => `#st-focus>${sel}{order:${i}}`).join("")
      + `.sf-ord{display:flex;align-items:center;gap:8px;padding:7px 6px;margin:3px 0;border-radius:8px;background:rgba(127,127,127,.1);font-size:13px;touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}.sf-ord i{opacity:.5;font-style:normal}.sf-ord.lift{background:#7c5cff;color:#fff;box-shadow:0 6px 16px rgba(0,0,0,.35);position:relative;z-index:2}.sf-note{font-size:11.5px;opacity:.65;margin:2px 0 4px}` + `.sf-row{display:flex;align-items:center;gap:6px;padding:5px 2px;border-top:1px solid rgba(127,127,127,.15);font-size:13px}.sf-row span{flex:1}.sf-seg{display:flex;border-radius:8px;overflow:hidden;border:1px solid rgba(127,127,127,.3)}.sf-seg button{border:0;background:transparent;color:inherit;font-size:11.5px;padding:4px 7px;cursor:pointer}.sf-seg button.on{background:#7c5cff;color:#fff}.sf-h{font-weight:800;font-size:13px;margin:10px 0 4px}`;
  }
  const set = (sel, v) => { if (v === "show") delete S[sel]; else S[sel] = v; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} css(); };
  css();

  /* 在專注頁的「📂 收起卡片」選單底下加一段 */
  new MutationObserver(() => {
    const m = document.querySelector('.page[data-page="focus"] .fold-menu');
    if (!m || m.querySelector(".sf-h")) return;
    m.insertAdjacentHTML("beforeend", `<div class="sf-h">⏱️ 專注卡裡的小區塊</div>` + SUBS.map(([sel, name], i) => { const v = S[sel] || "show";
      return `<div class="sf-row"><span>${name}</span><div class="sf-seg">${[["show", "顯示"], ["fold", "收起"], ["hide", "隱藏"]].map(([k, l]) => `<button type="button" class="${v === k ? "on" : ""}" data-sf="${i}" data-v="${k}">${l}</button>`).join("")}</div></div>`; }).join(""));
    m.insertAdjacentHTML("beforeend", ["top", "st"].map(g => `<div class="sf-h">↕️ ${g === "top" ? "專注卡的順序" : "「連擊・知識卡・專注房間」裡的順序"}</div><p class="sf-note">長按一列，上下拖曳</p><div class="sf-ordlist" data-g="${g}">${ordList(g).map(([k, n]) => `<div class="sf-ord" data-k="${k}"><i>☰</i>${n}</div>`).join("")}</div>`).join("") + `<button type="button" class="sf-reset" data-sfr="1" style="margin-top:8px;width:100%;border:0;border-radius:8px;padding:6px;background:rgba(127,127,127,.18);color:inherit;cursor:pointer">恢復預設順序</button>`);
  }).observe(document.body, { childList: true, subtree: true });

  /* 選單裡長按拖曳排序 */
  let hold = null, drag = null;
  document.addEventListener("pointerdown", e => {
    const row = e.target.closest(".sf-ord");
    if (!row) return;
    hold = { row, x: e.clientX, y: e.clientY, t: setTimeout(() => { drag = { row, list: row.parentElement }; row.classList.add("lift"); if (navigator.vibrate) try { navigator.vibrate(20); } catch (_) {} }, 350) };
  });
  document.addEventListener("pointermove", e => {
    if (hold && !drag && (Math.abs(e.clientX - hold.x) > 8 || Math.abs(e.clientY - hold.y) > 8)) { clearTimeout(hold.t); hold = null; }
    if (!drag) return;
    e.preventDefault();
    const rows = [...drag.list.children], i = rows.indexOf(drag.row), prev = rows[i - 1], next = rows[i + 1];
    if (prev && e.clientY < prev.getBoundingClientRect().top + prev.offsetHeight / 2) drag.list.insertBefore(drag.row, prev);
    else if (next && e.clientY > next.getBoundingClientRect().top + next.offsetHeight / 2) drag.list.insertBefore(drag.row, next.nextSibling);
  }, { passive: false });
  const drop = () => {
    if (hold) { clearTimeout(hold.t); hold = null; }
    if (!drag) return;
    drag.row.classList.remove("lift");
    O[drag.list.dataset.g] = [...drag.list.children].map(r => r.dataset.k);
    try { localStorage.setItem(OKEY, JSON.stringify(O)); } catch (_) {}
    drag = null; css();
    if (typeof showToast === "function") showToast("↕️ 專注頁的順序記住了");
  };
  document.addEventListener("pointerup", drop);
  document.addEventListener("pointercancel", drop);
  document.addEventListener("touchmove", e => { if (drag) e.preventDefault(); }, { passive: false });

  document.addEventListener("click", e => {
    if (e.target.closest("[data-sfr]")) { e.stopPropagation(); O = {}; try { localStorage.removeItem(OKEY); } catch (_) {} css();
      const m = e.target.closest(".fold-menu"); m.querySelectorAll(".sf-ordlist").forEach(l => { const g = l.dataset.g; l.innerHTML = ordList(g).map(([k, n]) => `<div class="sf-ord" data-k="${k}"><i>☰</i>${n}</div>`).join(""); }); return; }
    if (e.target.closest(".sf-ord")) { e.stopPropagation(); return; }
    const b = e.target.closest("[data-sf]");
    if (b) { e.stopPropagation(); set(SUBS[b.dataset.sf][0], b.dataset.v); b.parentElement.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); return; }
    /* 點收起的區塊 → 展開 */
    for (const [sel] of SUBS) {
      if (S[sel] !== "fold") continue;
      const el = e.target.closest(`#focus-card ${sel}`);
      if (el && e.target === el) { set(sel, "show"); return; }
    }
  }, true);
})();
