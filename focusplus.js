/* 序光計畫：⏱️ 專注加料：🍂 專注掉落物 ＋ 👻 幽靈陪讀（資料在 sql/2026-11-05_專注DNA_事件_掉落_陪讀_博物館.sql） */
(function () {
  const FP_JS_VERSION = "20261105c";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const gameOn = () => !(typeof window.isGameOff === "function" && window.isGameOff());
  const timer = () => { try { return focusTimer; } catch (_) { return null; } };
  const elapsed = t => { try { return focusElapsedMs(t); } catch (_) { return 0; } };

  /* 跟資料庫的 focus_drop_defs 一樣 */
  const DROPS = {
    leaf: { name: "葉子", emoji: "🍂", min: 0 }, star: { name: "星星", emoji: "⭐", min: 0 },
    gem: { name: "寶石", emoji: "💎", min: 25 }, meteor: { name: "流星", emoji: "🌠", min: 60 },
    rainbow: { name: "彩虹碎片", emoji: "🌈", min: 90, max: 2 }, crown: { name: "王冠", emoji: "👑", min: 150, max: 1 }
  };
  const ORDER = ["crown", "rainbow", "meteor", "gem", "star", "leaf"];
  const IMG = "img/drops/";
  const pic = (k, cls) => `<img class="${cls}" src="${IMG}${k}.webp" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${cls} fp-emo',textContent:'${DROPS[k].emoji}'}))">`;

  const key = t => `fdrops:${t.startedAt}`;
  function bag(t) { try { return JSON.parse(localStorage.getItem(key(t)) || "null") || { n: 0, list: [] }; } catch (_) { return { n: 0, list: [] }; } }
  function saveBag(t, b) { try { localStorage.setItem(key(t), JSON.stringify(b)); } catch (_) {} }

  /* 第 m 分鐘掉什麼（越久越稀有；幸運日機率加倍） */
  function roll(m, have) {
    const lucky = window.DailyEvent && window.DailyEvent.ev === "lucky" ? 2 : 1;
    const ch = { crown: m >= 150 ? 0.04 : 0, rainbow: m >= 90 ? 0.08 : 0, meteor: m >= 60 ? 0.16 : 0, gem: m >= 25 ? 0.28 : 0 };
    let r = Math.random();
    for (const k of ["crown", "rainbow", "meteor", "gem"]) {
      const p = ch[k] * lucky;
      if (DROPS[k].max && have.filter(x => x === k).length >= DROPS[k].max) continue;
      if (r < p) return k;
      r -= p;
    }
    return Math.random() < 0.45 ? "star" : "leaf";
  }

  function tick() {
    const t = timer();
    if (!t || !hasDb() || !gameOn()) { renderBasket(null); return; }
    const m = elapsed(t) / 60000, due = Math.floor(m / 5);
    const b = bag(t);
    let fresh = [];
    while (b.n < due) {
      b.n++;
      const k = roll(b.n * 5, b.list);
      b.list.push(k); fresh.push(k);
    }
    if (fresh.length) {
      saveBag(t, b);
      if (!document.hidden) fresh.slice(-3).forEach((k, i) => setTimeout(() => fall(k), i * 700));
    }
    renderBasket(t, b, m);
  }

  /* 掉下來的動畫（點一下可以接住，只是好玩） */
  function fall(k) {
    const card = document.getElementById("focus-card");
    if (!card || !card.offsetParent) return;
    const el = document.createElement("button");
    el.type = "button";
    el.className = "fp-fall" + (["crown", "rainbow", "meteor"].includes(k) ? " rare" : "");
    el.style.left = (10 + Math.random() * 75) + "%";
    el.innerHTML = pic(k, "fp-fall-img");
    el.addEventListener("click", () => { el.classList.add("caught"); toast(`${DROPS[k].emoji} 接住了${DROPS[k].name}！`); });
    card.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function renderBasket(t, b, m) {
    const card = document.getElementById("focus-card");
    if (!card) return;
    let box = document.getElementById("fp-basket");
    if (!t || !b) { if (box) box.hidden = true; return; }
    if (!box) {
      box = document.createElement("div"); box.id = "fp-basket"; box.className = "fp-basket";
      const anchor = document.getElementById("focus-clock");
      (anchor || card.lastElementChild).after(box);
    }
    box.hidden = false;
    const cnt = {};
    b.list.forEach(k => cnt[k] = (cnt[k] || 0) + 1);
    const next = 5 - (m % 5);
    const unlock = [["gem", 25], ["meteor", 60], ["rainbow", 90], ["crown", 150]].find(([, x]) => m < x);
    box.innerHTML = `${t.goal ? `<div class="fp-goal">🎯 ${esc(t.goal)}</div>` : ""}<span class="fp-b-t">🧺</span>${b.list.length ? ORDER.filter(k => cnt[k]).map(k => `<span class="fp-b-i">${pic(k, "fp-b-img")}×${cnt[k]}</span>`).join("") : `<span class="fp-b-none">還沒撿到東西</span>`}
      <span class="fp-b-next">${Math.ceil(next)} 分鐘後掉下一個${unlock ? `・${unlock[1]} 分鐘後可能掉 ${DROPS[unlock[0]].emoji}` : ""}</span>`;
  }

  /* 結束專注 → 領這次的掉落物（接在原本的 finishFocus 後面） */
  if (typeof window.finishFocus === "function" && !window.finishFocus.__fp) {
    const orig = window.finishFocus;
    window.finishFocus = async function (reason) {
      const t = timer();
      const b = t ? bag(t) : null;
      const r = await orig.apply(this, arguments);
      if (t && b && hasDb() && !timer()) {
        try {
          const { data, error } = await db.rpc("focus_drops_claim", { p_started: t.startedAt, p_drops: b.list });
          if (!error && data && data.ok) {
            try { localStorage.removeItem(key(t)); } catch (_) {}
            const parts = Object.entries(data.drops || {}).map(([k, n]) => `${DROPS[k] ? DROPS[k].emoji : k}×${n}`).join(" ");
            setTimeout(() => toast(`🧺 這次撿到 ${parts || "—"}${data.co_min >= 20 ? `・👥 跟好友一起讀了 ${data.co_min} 分鐘，多拿星屑 30＋扭蛋幣` : ""}`), 2200);
          } else if (error && !/找不到/.test(error.message)) console.warn("掉落物領取失敗：", error.message);
        } catch (e) { console.warn(e); }
      }
      return r;
    };
    window.finishFocus.__fp = true;
  }
  /* 放棄專注：掉落物也一起丟掉 */
  if (typeof window.discardFocus === "function" && !window.discardFocus.__fp) {
    const orig = window.discardFocus;
    window.discardFocus = function () { const t = timer(); const r = orig.apply(this, arguments); if (t && !timer()) try { localStorage.removeItem(key(t)); } catch (_) {} return r; };
    window.discardFocus.__fp = true;
  }

  /* ---------- 👻 幽靈陪讀 ---------- */
  const CO = { list: [], at: 0, busy: false };
  const CLS = { scholar: "🧑‍🎓", warrior: "🧑‍🚒", guardian: "🛡️", ranger: "🏹" };
  const fmt = ms => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60); return h ? `${h}:${String(mm).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${mm}:${String(s % 60).padStart(2, "0")}`; };

  async function loadCo() {
    if (!hasDb() || CO.busy) return;
    CO.busy = true;
    try { const { data, error } = await db.rpc("co_study_status"); if (!error) { CO.list = data || []; CO.at = Date.now(); } } catch (_) {}
    CO.busy = false;
    renderCo();
  }

  function renderCo() {
    const card = document.getElementById("focus-card");
    if (!card || !hasDb() || !gameOn()) return;
    let box = document.getElementById("fp-co");
    if (!CO.list.length) { if (box) box.hidden = true; return; }
    if (!box) { box = document.createElement("div"); box.id = "fp-co"; box.className = "fp-co"; card.appendChild(box); }
    box.hidden = false;
    const me = timer(), meRun = me && me.status === "running";
    const any = CO.list.some(f => f.state === "running");
    const seat = (who, cls, name, state, ms, mine) => `<div class="fp-seat ${state} ${mine ? "me" : ""}">
      <div class="fp-av">${cls ? `<img src="img/rpg/class/${cls}.webp" alt="" onerror="this.replaceWith(document.createTextNode('${CLS[cls] || "🧑"}'))">` : "🧑"}${state === "running" ? `<span class="fp-book">📖</span>` : state === "paused" ? `<span class="fp-book">☕</span>` : `<span class="fp-book">💤</span>`}</div>
      <b>${esc(name)}</b><small>${state === "running" ? "專注中 " + fmt(ms) : state === "paused" ? "休息中" : who}</small></div>`;
    const drift = Date.now() - CO.at;
    box.innerHTML = `<div class="fp-co-h">👻 陪讀桌${meRun && any ? `<span class="fp-together">📚 一起讀書中</span>` : ""}</div>
      <div class="fp-desk ${meRun && any ? "on" : ""}">
        ${seat("", window.__myClass, "你", meRun ? "running" : me ? "paused" : "idle", me ? elapsed(me) : 0, true)}
        ${CO.list.map(f => seat(f.subject_today ? `上次讀 ${f.subject_today}` : "還沒開始", f.class, f.name, f.state, f.state === "running" ? f.live_ms + drift : f.live_ms)).join("")}
      </div>
      <p class="fp-co-note">${meRun && any ? "同一段時間一起專注滿 20 分鐘，結束時多拿星屑 30＋扭蛋幣" : any ? "好友正在專注！一起開始，結束時有「一起讀書」獎勵" : "好友開始專注時，他的小角色會出現在這張桌子旁"}</p>`;
  }

  (async function boot(n) {
    if (!hasDb()) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; }
    try { const { data } = await db.from("rpg_heroes").select("class").eq("user_id", currentUser.id).maybeSingle(); window.__myClass = data && data.class; } catch (_) {}
    loadCo();
    setInterval(tick, 1000);
    setInterval(() => { if (!document.hidden) loadCo(); }, 30000);
    setInterval(() => { if (CO.list.some(f => f.state === "running") || timer()) renderCo(); }, 1000);
  })(0);

  const st = document.createElement("style");
  st.textContent = `
    #focus-card { position: relative; overflow: hidden; }
    .fp-fall { position: absolute; top: -40px; z-index: 5; border: 0; background: none; padding: 0; cursor: pointer; animation: fpFall 4s ease-in forwards; }
    .fp-fall-img { width: 38px; height: 38px; object-fit: contain; display: block; font-size: 30px; line-height: 38px; filter: drop-shadow(0 3px 6px rgba(0,0,0,.35)); }
    .fp-fall.rare .fp-fall-img { width: 52px; height: 52px; font-size: 42px; line-height: 52px; filter: drop-shadow(0 0 12px #ffd54a); }
    .fp-fall.caught { animation: fpCatch .5s forwards; }
    @keyframes fpFall { 0% { transform: translateY(0) rotate(-20deg); opacity: 0; } 10% { opacity: 1; } 100% { transform: translateY(380px) rotate(25deg); opacity: 0; } }
    @keyframes fpCatch { to { transform: scale(1.8); opacity: 0; } }
    .fp-basket { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 10px 0 4px; padding: 8px 10px; border-radius: 12px; background: rgba(127,127,127,.1); font-size: 13px; }
    .fp-b-t { font-size: 18px; }
    .fp-goal { width: 100%; font-weight: 700; font-size: 13.5px; padding-bottom: 4px; border-bottom: 1px dashed rgba(127,127,127,.3); margin-bottom: 2px; } .fp-b-i { display: inline-flex; align-items: center; gap: 2px; font-weight: 700; }
    .fp-b-img { width: 22px; height: 22px; object-fit: contain; font-size: 17px; line-height: 22px; }
    .fp-b-none { opacity: .6; } .fp-b-next { width: 100%; font-size: 11.5px; opacity: .65; }
    .fp-co { margin-top: 12px; }
    .fp-co-h { font-weight: 800; font-size: 14px; display: flex; gap: 8px; align-items: center; }
    .fp-together { font-size: 12px; background: linear-gradient(90deg, #ffd54a, #ff9ec7); color: #3a2400; padding: 2px 8px; border-radius: 99px; animation: fpGlow 2s ease-in-out infinite; }
    @keyframes fpGlow { 50% { box-shadow: 0 0 12px #ffd54a; } }
    .fp-desk { display: flex; gap: 10px; justify-content: center; align-items: flex-end; min-height: 120px; padding: 14px 8px 10px; margin-top: 6px; border-radius: 14px; background: linear-gradient(rgba(20,12,6,.15), rgba(20,12,6,.55)), url(img/focus/desk.webp) center / cover, #6b4429; flex-wrap: wrap; }
    .fp-seat b, .fp-seat small { text-shadow: 0 1px 3px #000; color: #fff; }
    .fp-desk.on { box-shadow: inset 0 0 0 2px #ffd54a, 0 0 18px #ffd54a55; }
    .fp-seat { display: flex; flex-direction: column; align-items: center; width: 84px; text-align: center; }
    .fp-seat.idle { opacity: .45; filter: grayscale(.6); }
    .fp-av { position: relative; width: 56px; height: 56px; display: grid; place-items: center; font-size: 38px; border-radius: 50%; background: rgba(255,255,255,.15); }
    .fp-av img { width: 100%; height: 100%; object-fit: contain; }
    .fp-seat.running .fp-av { animation: fpBob 2.6s ease-in-out infinite; }
    @keyframes fpBob { 50% { transform: translateY(-3px); } }
    .fp-book { position: absolute; right: -6px; bottom: -4px; font-size: 18px; }
    .fp-seat b { font-size: 12.5px; margin-top: 4px; } .fp-seat small { font-size: 11px; opacity: .75; }
    .fp-seat.me b { color: #ffd54a; }
    .fp-co-note { font-size: 11.5px; opacity: .7; margin: 6px 0 0; text-align: center; }
  `;
  document.head.appendChild(st);
  window.FocusPlus = { version: FP_JS_VERSION, reload: loadCo };
})();
