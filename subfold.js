/* 📂 專注卡裡的小區塊：每一塊都可以「顯示／收起／隱藏」
   用 CSS 規則控制（區塊重畫也不會跑掉），設定記在這台裝置。
   在專注頁「📂 收起卡片」選單裡設定；收起的區塊點那一條就展開 */
(function () {
  const KEY = "focusSubFold";
  const SUBS = [
    ["#ev-exp", "🧭 專注遠征"], [".st-combo", "⚡ 專注連擊"], [".st-prompt", "✍️ 寫知識卡提示"], [".st-kc", "🃏 知識卡"],
    [".st-room", "👥 一起專注房間"], ["#fp-basket", "🍂 專注掉落物"], ["#fp-co", "👻 陪讀桌"], ["#ra-box", "📻 白噪音電台"],
    ["#focus-friends", "🧑‍🤝‍🧑 好友專注狀態"], ["#focus-log", "📝 今天的專注紀錄"], ["#focus-stats", "📊 專注統計"], ["#focus-presets", "⏱️ 時間快捷鍵"]];
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
    }).join("") + `.sf-row{display:flex;align-items:center;gap:6px;padding:5px 2px;border-top:1px solid rgba(127,127,127,.15);font-size:13px}.sf-row span{flex:1}.sf-seg{display:flex;border-radius:8px;overflow:hidden;border:1px solid rgba(127,127,127,.3)}.sf-seg button{border:0;background:transparent;color:inherit;font-size:11.5px;padding:4px 7px;cursor:pointer}.sf-seg button.on{background:#7c5cff;color:#fff}.sf-h{font-weight:800;font-size:13px;margin:10px 0 4px}`;
  }
  const set = (sel, v) => { if (v === "show") delete S[sel]; else S[sel] = v; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} css(); };
  css();

  /* 在專注頁的「📂 收起卡片」選單底下加一段 */
  new MutationObserver(() => {
    const m = document.querySelector('.page[data-page="focus"] .fold-menu');
    if (!m || m.querySelector(".sf-h")) return;
    m.insertAdjacentHTML("beforeend", `<div class="sf-h">⏱️ 專注卡裡的小區塊</div>` + SUBS.map(([sel, name], i) => { const v = S[sel] || "show";
      return `<div class="sf-row"><span>${name}</span><div class="sf-seg">${[["show", "顯示"], ["fold", "收起"], ["hide", "隱藏"]].map(([k, l]) => `<button type="button" class="${v === k ? "on" : ""}" data-sf="${i}" data-v="${k}">${l}</button>`).join("")}</div></div>`; }).join(""));
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener("click", e => {
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
