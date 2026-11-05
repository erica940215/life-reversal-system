/* 序光計畫：🎴 每日隨機事件（資料在 sql/2026-11-05_專注DNA_事件_掉落_陪讀_博物館.sql） */
(function () {
  const DE_JS_VERSION = "20261105a";
  const DE = { data: null, err: null };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const gameOn = () => !(typeof window.isGameOff === "function" && window.isGameOff());
  const seenKey = () => "devtSeen:" + (DE.data && DE.data.day);
  const seen = () => { try { return localStorage.getItem(seenKey()) === "1"; } catch (_) { return true; } };

  async function load() {
    if (!hasDb()) return;
    const { data, error } = await db.rpc("daily_event_status");
    if (error) { DE.err = error.message; render(); return; }
    DE.data = data; DE.err = null;
    window.DailyEvent = { ev: data.ev, reload: load };
    (data.got || []).forEach((g, i) => setTimeout(() => toast(`${g.why}：${g.text}`), 800 + i * 1400));
    render();
  }

  function render() {
    const prev = document.getElementById("dr-today") || document.getElementById("ev-today2") || document.getElementById("fn-today") || document.querySelector('.page[data-page="today"] .game-mode-bar');
    if (!prev) return;
    let box = document.getElementById("de-today");
    if (!box) { box = document.createElement("div"); box.id = "de-today"; box.className = "card de-card"; prev.before(box); }
    const d = DE.data;
    box.hidden = !(d && gameOn() && !DE.err);
    if (box.hidden) return;
    const def = d.def || {}, [a, b] = d.progress || [0, 1];
    if (!seen()) {
      box.innerHTML = `<button type="button" class="de-back" data-de="flip"><span class="de-q">🎴</span><b>今天的事件卡</b><small>點一下翻開</small></button>`;
      return;
    }
    const pct = Math.min(100, Math.round(a / Math.max(1, b) * 100));
    const unit = { traveler: " 分鐘", thief: " 分鐘", together: " 分鐘", meteor: " 顆", marathon: " 個" }[d.ev] || "";
    box.innerHTML = `<div class="de-front ${def.good === false ? "bad" : ""} ${d.done ? "done" : ""}">
      <div class="de-emo">${esc(def.emoji)}</div>
      <div class="de-body"><b>今日事件・${esc(def.name)}</b><p>${esc(def.text)}</p>
        ${d.ev === "quiet" ? "" : `<div class="de-bar"><i style="width:${pct}%"></i></div><small>${d.done ? (d.ev === "dreamy" ? "✅ 今晚入夢了，明早帶出來時多 2 片碎片" : d.ev === "thief" ? "✅ 小偷被趕跑了！" : "✅ 完成了！") : `${a}${unit} / ${b}${unit}`}</small>`}</div></div>`;
  }

  document.addEventListener("click", e => {
    const b = e.target.closest("[data-de]");
    if (!b) return;
    try { localStorage.setItem(seenKey(), "1"); } catch (_) {}
    const box = document.getElementById("de-today");
    box.classList.add("flipping");
    setTimeout(() => { render(); box.classList.remove("flipping"); }, 350);
  });

  const st = document.createElement("style");
  st.textContent = `
    .de-card { padding: 0 !important; overflow: hidden; perspective: 600px; }
    .de-card.flipping { animation: deFlip .7s ease-in-out; }
    @keyframes deFlip { 50% { transform: rotateY(90deg); } }
    .de-back { width: 100%; border: 0; padding: 18px; color: #fff; font: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px;
      background: repeating-linear-gradient(45deg, #5b3fb3 0 12px, #6a4cc4 12px 24px); }
    .de-q { font-size: 40px; animation: deWig 2s ease-in-out infinite; } @keyframes deWig { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }
    .de-back small { opacity: .8; }
    .de-front { display: flex; gap: 12px; padding: 14px; background: linear-gradient(135deg, rgba(255,213,74,.16), rgba(124,92,255,.12)); }
    .de-front.bad { background: linear-gradient(135deg, rgba(248,81,73,.16), rgba(124,92,255,.08)); }
    .de-front.done { background: linear-gradient(135deg, rgba(63,185,80,.18), rgba(124,92,255,.08)); }
    .de-emo { font-size: 42px; line-height: 1; }
    .de-body { flex: 1; } .de-body p { font-size: 13px; margin: 4px 0 8px; opacity: .85; }
    .de-bar { height: 8px; border-radius: 4px; background: rgba(127,127,127,.2); overflow: hidden; } .de-bar i { display: block; height: 100%; background: linear-gradient(90deg, #ffd54a, #ff9ec7); }
    .de-body small { font-size: 12px; opacity: .8; }
  `;
  document.head.appendChild(st);

  (function boot(n) {
    if (hasDb()) { load(); setInterval(() => { if (!document.hidden) load(); }, 3 * 60 * 1000); document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); }); }
    else if (n < 60) setTimeout(() => boot(n + 1), 1000);
  })(0);
  window.DailyEvent = window.DailyEvent || { ev: null, reload: load };
})();
