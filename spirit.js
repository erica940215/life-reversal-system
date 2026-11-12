/* 🐉 靈獸：浮在畫面右下角，每一頁都看得到；跟著你的真實努力長大
   資料在 sql/2026-11-09_靈獸.sql */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const STAGE = [["幼體", 0.75, 400], ["少年", 0.95, 2000], ["成體", 1.15, 6000], ["覺醒", 1.3, null]];
  const RCOL = { N: "#9aa4b2", R: "#58a6ff", SR: "#c08bff", SSR: "#ffd54a" };
  const SP = { d: null, err: null, min: false, line: "" };
  try { SP.min = localStorage.getItem("spiritMin") === "1"; } catch (_) {}
  const hour = () => new Date().getHours();
  /* 有圖就用圖（spirit/{key}_{1幼體|2成體|3覺醒}.webp），沒有就用 emoji */
  const IMGV = "1";
  const pic = (key, stage, emoji, cls, size) => `<img class="sp-img ${cls || ""}" src="img/spirit/${key}_${Math.min(stage, 2) + 1}.webp?v=${IMGV}" alt="" style="${size ? `width:${size}px;height:${size}px;` : ""}" onerror="this.outerHTML='<span class=&quot;sp-emo ${cls || ""}&quot; style=&quot;${size ? `font-size:${Math.round(size * 0.62)}px` : ""}&quot;>${emoji}</span>'">`;
  /* 有狀態圖就用狀態圖（{key}_{階段}_{normal|happy|focus|sleep|sad}），沒有就退回階段圖，再沒有就 emoji */
  const statePic = (key, stage, state, emoji, size) => { const n = Math.min(stage, 2) + 1, emo = `<span class=&quot;sp-emo&quot; style=&quot;font-size:${Math.round(size * 0.62)}px&quot;>${emoji}</span>`;
    return `<img class="sp-img" src="img/spirit/${key}_${n}_${state}.webp?v=${IMGV}" alt="" style="width:${size}px;height:${size}px" onload="if(!this.dataset.f)this.classList.add('st')" onerror="if(!this.dataset.f){this.dataset.f=1;this.src='img/spirit/${key}_${n}.webp?v=${IMGV}'}else{this.outerHTML='${emo}'}">`; };
  const focusing = () => { try { return !!window.__studyFocus || (typeof focusTimer !== "undefined" && !!focusTimer); } catch (_) { return false; } };

  async function load() {
    const { data, error } = await db.rpc("spirit_status");
    SP.err = error ? error.message : null;
    if (!error) { SP.d = data; if (data.gained > 0) SP.line = `謝謝你！我又長大了一點（+${data.gained}）`; }
    render();
  }
  const active = () => { const d = SP.d; if (!d || !d.state || !d.state.active) return null; const b = d.beasts.find(x => x.key === d.state.active); return b ? { ...b, def: d.defs[b.key] } : null; };
  function lines(b) {
    const n = b.name || b.def.name, h = hour();
    if (h >= 23 || h < 6) return ["💤…呼…", `${n}睡著了，你也早點睡吧`];
    if (focusing()) return ["（安靜地陪你讀書）", "加油，我在旁邊", "專心的你好厲害"];
    if (SP.d.mood === "sad") return ["好幾天沒看到你了…", "我好想你", "今天一起做一點點就好"];
    if (SP.d.mood === "great") return ["最近的你超努力！", "我感覺自己變強了", "今天也一起加油吧！"];
    return ["你來了！", "今天要做什麼呢？", "摸摸我～"];
  }

  function render() {
    let w = document.getElementById("sp-float");
    if (!SP.d || !hasDb()) { if (w) w.remove(); return; }
    if (!w) { w = document.createElement("div"); w.id = "sp-float"; document.body.appendChild(w); placeFloat(w); }
    const b = active(), h = hour();
    if (!b) { w.className = "sp-float egg"; w.innerHTML = `<button type="button" class="sp-body" data-sp="open" title="靈獸"><img class="sp-img" src="img/spirit/egg.webp" alt="" style="width:56px;height:56px" onerror="this.outerHTML='<span class=&quot;sp-emo&quot;>🥚</span>'"></button>`; return; }
    const st = STAGE[b.stage], sleep = h >= 23 || h < 6, ls = lines(b);
    if (!SP.line || Math.random() < 0.35) SP.line = ls[Math.floor(Math.random() * ls.length)];
    w.className = `sp-float r-${b.def.r} s${b.stage} ${sleep ? "sleep" : ""} ${focusing() ? "focus" : ""} mood-${SP.d.mood} ${SP.min ? "min" : ""}`;
    w.innerHTML = SP.min ? `<button type="button" class="sp-body" data-sp="max" title="叫出靈獸">${pic(b.key, b.stage, b.def.emoji, "", 34)}</button>`
      : `<button type="button" class="sp-body" data-sp="open" title="${esc(b.name || b.def.name)}"><span class="sp-aura"></span>${statePic(b.key, b.stage, sleep ? "sleep" : focusing() ? "focus" : SP.d.mood === "sad" ? "sad" : SP.d.mood === "great" ? "happy" : "normal", b.def.emoji, Math.round(72 * st[1]))}${sleep ? `<i class="sp-z">💤</i>` : focusing() ? `<i class="sp-z">📖</i>` : SP.d.mood === "sad" ? `<i class="sp-z">💧</i>` : ""}</button>`;
  }

  function panel() {
    const d = SP.d; if (!d) return toast(SP.err && /spirit_status/.test(SP.err) ? "靈獸的資料庫還沒設定：到 Supabase 執行 sql/2026-11-09_靈獸.sql" : "載入中…");
    const b = active(), st = d.state || {};
    const m = document.createElement("div");
    m.className = "vg-modal";
    const draw = () => {
      const a = active();
      m.innerHTML = `<div class="vg-card sp-card"><div class="vg-title">🐉 靈獸</div>
        ${a ? (() => { const s = STAGE[a.stage], nx = s[2], pv = STAGE[a.stage - 1] ? STAGE[a.stage - 1][2] : 0, pct = nx ? Math.min(100, (a.xp - pv) / (nx - pv) * 100) : 100;
          return `<div class="sp-hero r-${a.def.r} s${a.stage}"><span class="sp-aura"></span>${pic(a.key, a.stage, a.def.emoji, "big", 116)}</div>
          <div class="sp-info"><b>${esc(a.name || a.def.name)}</b> <em style="color:${RCOL[a.def.r]}">${a.def.r}</em><small>${esc(a.def.name)}・${s[0]}・經驗 ${a.xp}${nx ? ` / ${nx}` : "（已覺醒）"}</small>
            <div class="tph-bar"><i style="width:${pct}%"></i></div><p>${esc(a.def.desc)}</p>
            <button type="button" class="btn btn-small" data-sp="rename" data-k="${a.key}">✏️ 取名字</button></div>`; })() : `<p class="vg-note">還沒有靈獸，先抽一顆蛋吧！</p>`}
        <p class="vg-note">牠會跟著你長大：專注每分鐘 +1、完成任務 +15、生活打卡 +5、複習單字 +1、寫「今天學到什麼」+10。400 少年、2000 成體、6000 覺醒。重複抽到也會加經驗。只有「陪著你」的那隻會長大。</p>
        <div class="vg-sec">🥚 抽靈獸蛋</div>
        <div class="sp-pull">${d.free ? `<button type="button" class="btn btn-primary" data-sp="pull" data-free="1">🎁 本週免費抽</button>` : ""}
          <button type="button" class="btn ${d.free ? "" : "btn-primary"}" data-sp="pull" ${d.stardust >= 300 ? "" : "disabled"}>✨ 300 星屑抽一次（有 ${d.stardust}）</button></div>
        <p class="vg-note">機率：N 55%・R 30%・SR 12%・SSR 3%。保底：再 ${Math.max(1, 30 - (st.pity || 0))} 抽內必出 SR 以上。目前只會抽到已開放的靈獸，新靈獸陸續加入；保底會留到牠們開放。</p>
        <div class="sp-out"></div>
        <div class="vg-sec">📖 圖鑑（${d.beasts.length}/${Object.keys(d.defs).length}）・點一下換牠陪你</div>
        <div class="sp-grid">${Object.entries(d.defs).map(([k, df]) => { const o = d.beasts.find(x => x.key === k);
          return `<button type="button" class="sp-it ${o ? "" : "lock"} ${st.active === k ? "on" : ""}" ${o ? `data-sp="act" data-k="${k}"` : "disabled"} style="--c:${RCOL[df.r]}"><span>${o ? pic(k, o.stage, df.emoji, "", 44) : "❔"}</span><b>${o ? esc(o.name || df.name) : "？？？"}</b><small>${df.r}${o ? "・" + STAGE[o.stage][0] : ""}</small></button>`; }).join("")}</div>
        <label class="sp-hide"><input type="checkbox" data-sp="hide" ${SP.min ? "checked" : ""}> 平常收成小圖示</label>
        <button type="button" class="btn" data-sp="close" style="width:100%;margin-top:8px">關閉</button></div>`;
    };
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-sp=close]")) return m.remove();
      const x = e.target.closest("[data-sp]"); if (!x) return;
      const a = x.dataset.sp;
      if (a === "pull") {
        x.disabled = true;
        const { data, error } = await db.rpc("spirit_pull", { p_free: x.dataset.free === "1" });
        if (error) { x.disabled = false; return toast(error.message); }
        await load(); draw();
        m.querySelector(".sp-out").innerHTML = `<div class="sp-reveal" style="--c:${RCOL[data.rarity]}">${pic(data.key, 0, data.def.emoji, "big", 110)}<b>${data.rarity}・${esc(data.def.name)}</b><small>${data.new ? "✨ 新的靈獸！" : "重複了，經驗大增"}</small><p>${esc(data.def.desc)}</p></div>`;
      }
      if (a === "act") { const { data, error } = await db.rpc("spirit_set_active", { p_key: x.dataset.k }); if (error) return toast(error.message); SP.d = data; render(); draw(); toast("🐉 換牠陪你了"); }
      if (a === "rename") { const v = prompt("幫牠取個名字（最多 12 字）"); if (v == null) return; const { data } = await db.rpc("spirit_rename", { p_key: x.dataset.k, p_name: v }); if (data) { SP.d = data; render(); draw(); } }
    });
    m.addEventListener("change", e => { if (e.target.dataset.sp === "hide") { SP.min = e.target.checked; try { localStorage.setItem("spiritMin", SP.min ? "1" : "0"); } catch (_) {} render(); } });
    draw(); document.body.appendChild(m);
  }

  /* 用手指／滑鼠拖著靈獸走，位置會記住 */
  function placeFloat(w) {
    let p = null; try { p = JSON.parse(localStorage.getItem("spiritPos") || "null"); } catch (_) {}
    if (!p) return;
    w.style.right = Math.max(0, Math.min(innerWidth - 60, p.r)) + "px";
    w.style.bottom = Math.max(0, Math.min(innerHeight - 60, p.b)) + "px";
  }
  let drag = null, dragged = false;
  document.addEventListener("pointerdown", e => {
    const body = e.target.closest("#sp-float .sp-body"); if (!body) return;
    const w = document.getElementById("sp-float"), r = w.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, r: innerWidth - r.right, b: innerHeight - r.bottom, id: e.pointerId, w };
    dragged = false;
  });
  document.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!dragged && Math.hypot(dx, dy) < 8) return;
    dragged = true; e.preventDefault();
    drag.w.classList.add("dragging");
    drag.w.style.right = Math.max(0, Math.min(innerWidth - 60, drag.r - dx)) + "px";
    drag.w.style.bottom = Math.max(0, Math.min(innerHeight - 60, drag.b - dy)) + "px";
  }, { passive: false });
  let tapAt = 0;
  const endDrag = e => {
    if (!drag) return;
    if (!dragged && e && e.type === "pointerup") { const x = drag.w.querySelector(".sp-body[data-sp]"); tapAt = Date.now(); drag = null; if (x) act(x.dataset.sp); return; }
    if (dragged) { drag.w.classList.remove("dragging"); try { localStorage.setItem("spiritPos", JSON.stringify({ r: parseFloat(drag.w.style.right), b: parseFloat(drag.w.style.bottom) })); } catch (_) {} }
    drag = null;
  };
  document.addEventListener("pointerup", endDrag); document.addEventListener("pointercancel", endDrag);
  document.addEventListener("click", e => { if (e.target.closest("#sp-float .sp-body") && Date.now() - tapAt < 800) { e.stopPropagation(); e.preventDefault(); return; } if (dragged && e.target.closest("#sp-float")) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);
  addEventListener("resize", () => { const w = document.getElementById("sp-float"); if (w) placeFloat(w); });

  document.addEventListener("click", e => {
    const x = e.target.closest("#sp-float [data-sp]"); if (!x) return;
    act(x.dataset.sp);
  });
  function act(a) {
    if (a === "open") { if (Math.random() < 0.5 && active()) { const f = document.getElementById("sp-float"); f.classList.add("pet"); setTimeout(() => f.classList.remove("pet"), 700); } return panel(); }
    if (a === "min" || a === "max") { SP.min = a === "min"; try { localStorage.setItem("spiritMin", SP.min ? "1" : "0"); } catch (_) {} render(); }
  }

  const st = document.createElement("style");
  st.textContent = `
    #sp-float { position: fixed; right: 12px; bottom: 86px; z-index: 900; display: flex; flex-direction: column; align-items: flex-end; pointer-events: none; }
    #sp-float > * { pointer-events: auto; }
    #sp-float .sp-body { touch-action: none; cursor: grab; } #sp-float.dragging .sp-body { cursor: grabbing; transform: scale(1.12); } #sp-float.dragging .sp-bub { display: none; }
    #bh-ov ~ #sp-float, body.bh-lock #sp-float { z-index: 9995; }
    .sp-body { position: relative; border: 0; background: none; cursor: pointer; padding: 0; width: 64px; height: 64px; display: grid; place-items: center; }
    .sp-img { display: block; object-fit: contain; filter: drop-shadow(0 4px 6px rgba(0,0,0,.35)); animation: spBob 3s ease-in-out infinite; margin: 0 auto; }
    .sleep .sp-img { animation: spSleep 4s ease-in-out infinite; filter: brightness(.75); } .mood-sad .sp-img { filter: grayscale(.5); animation: none; } .pet .sp-img { animation: spPet .6s ease; }
    #sp-float .sp-img.st { filter: drop-shadow(0 4px 6px rgba(0,0,0,.35)); } #sp-float .sleep .sp-img.st, #sp-float.sleep .sp-img.st { animation: spSleep 4s ease-in-out infinite; } #sp-float.mood-sad .sp-img.st { animation: spBob 5s ease-in-out infinite; }
    #sp-float .sp-body:has(.st) .sp-z { display: none; }
    #sp-float .sp-body { width: auto; height: auto; min-width: 64px; min-height: 64px; }
    .sp-emo { display: block; line-height: 1; filter: drop-shadow(0 4px 6px rgba(0,0,0,.35)); animation: spBob 3s ease-in-out infinite; } .sp-emo.big { font-size: 72px; }
    @keyframes spBob { 50% { transform: translateY(-5px); } }
    .sleep .sp-emo { animation: spSleep 4s ease-in-out infinite; filter: grayscale(.2) brightness(.85); } @keyframes spSleep { 50% { transform: scale(.95) rotate(-4deg); } }
    .focus .sp-emo { animation: spBob 5s ease-in-out infinite; }
    .mood-sad .sp-emo { filter: grayscale(.5); animation: none; }
    .pet .sp-emo { animation: spPet .6s ease; } @keyframes spPet { 30% { transform: scale(1.25) rotate(-10deg); } 60% { transform: scale(.95) rotate(8deg); } }
    .sp-aura { position: absolute; inset: 4px; border-radius: 50%; opacity: 0; }
    .s2 .sp-aura { opacity: .5; background: radial-gradient(circle, var(--c, #fff) 0, transparent 70%); }
    .s3 .sp-aura { opacity: .8; background: conic-gradient(from 0deg, #ffd54a, #ff9ec7, #8f9bff, #5ef0c4, #ffd54a); filter: blur(10px); animation: fnSpin 4s linear infinite; }
    .r-N { --c: #9aa4b2; } .r-R { --c: #58a6ff; } .r-SR { --c: #c08bff; } .r-SSR { --c: #ffd54a; }
    @keyframes fnSpin { to { transform: rotate(360deg); } }
    .sp-z { position: absolute; right: 2px; top: 0; font-style: normal; font-size: 16px; animation: spBob 2s ease-in-out infinite; }
    .sp-bub { max-width: 170px; margin-bottom: 4px; padding: 6px 10px; border-radius: 12px 12px 2px 12px; background: rgba(20,24,44,.88); color: #eef; font-size: 12px; line-height: 1.4; box-shadow: 0 4px 12px rgba(0,0,0,.3); }
    .sp-tag { font-size: 10.5px; padding: 1px 6px; border-radius: 99px; background: rgba(20,24,44,.75); color: #eef; margin-top: -2px; }
    .sp-x { position: absolute; right: 0; top: 0; width: 18px; height: 18px; border-radius: 50%; border: 0; background: rgba(20,24,44,.75); color: #eef; font-size: 12px; line-height: 1; cursor: pointer; display: none; }
    #sp-float:hover .sp-x { display: block; }
    #sp-float.min .sp-body { width: 40px; height: 40px; border-radius: 50%; background: rgba(20,24,44,.6); } #sp-float.min .sp-emo { font-size: 22px; animation: none; }
    .sp-card { text-align: left; } .sp-hero { position: relative; width: 120px; height: 120px; margin: 0 auto; display: grid; place-items: center; } .sp-hero .sp-aura { inset: 6px; }
    .sp-info { text-align: center; } .sp-info small { display: block; font-size: 12px; opacity: .75; } .sp-info em { font-style: normal; font-weight: 800; } .sp-info p { font-size: 13px; opacity: .85; }
    .sp-pull { display: flex; gap: 6px; flex-wrap: wrap; } .sp-pull .btn { flex: 1; }
    .sp-reveal { text-align: center; margin: 10px 0; padding: 12px; border-radius: 16px; background: radial-gradient(circle, color-mix(in srgb, var(--c) 35%, transparent), transparent 75%); animation: cpPop .6s cubic-bezier(.2,1.6,.4,1); }
    .sp-reveal b { display: block; font-size: 17px; color: var(--c); } .sp-reveal small { font-size: 12px; opacity: .8; } .sp-reveal p { font-size: 12.5px; opacity: .85; margin: 4px 0 0; }
    .sp-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
    .sp-it { border: 1px solid var(--c); background: rgba(127,127,127,.06); color: inherit; border-radius: 12px; padding: 6px 2px; cursor: pointer; font: inherit; } .sp-it.lock { opacity: .35; border-color: rgba(127,127,127,.3); cursor: default; }
    .sp-it.on { box-shadow: 0 0 0 2px var(--c), 0 0 12px var(--c); } .sp-it span { font-size: 28px; display: block; } .sp-it b { display: block; font-size: 11px; } .sp-it small { font-size: 10px; opacity: .7; }
    .sp-hide { display: block; font-size: 12.5px; margin-top: 10px; opacity: .85; }
    @media (prefers-reduced-motion: reduce) { #sp-float *, .sp-hero * { animation: none !important; } }
  `;
  document.head.appendChild(st);

  (function boot(n) {
    if (!hasDb()) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; }
    load();
    setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);
    setInterval(() => { if (!document.hidden) render(); }, 30 * 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  })(0);
  window.Spirit = { load, open: panel, render };
})();
