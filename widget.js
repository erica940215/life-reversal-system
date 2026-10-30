/* =========================================================
   ⏱️ 懸浮倒數小工具
   - 浮在每一頁上面，可以拖到任何位置、縮成小圓點
   - 正在專注：顯示專注計時（倒計時顯示剩下、正計時顯示經過）
   - 沒在專注：自己的快速倒數（5／10／15／25／50 分或自訂），時間到響鈴＋通知
   - 📌 釘在最上層：用瀏覽器的「子母畫面」開一個小視窗，蓋在其他 App 上面（電腦版 Chrome／Edge）
========================================================= */
(function () {
  const KEY = "floatTimer";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
  const W = Object.assign({ x: null, y: null, mini: false, hidden: false, end: null, left: null, total: 25 * 60 }, load());
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(W)); } catch (e) {} };
  let pip = null, rang = false, vid = null, cvs = null;
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const canVideoPip = () => { const v = document.createElement("video"); return !!(document.pictureInPictureEnabled || v.webkitSupportsPresentationMode); };
  const signed = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  /* ⏱️ 時間到推播：網站關掉也收得到 */
  function pushSet(sec) { if (signed()) db.rpc("push_timer_set", { p_seconds: Math.round(sec) }).then(() => {}, () => {}); }
  function pushCancel() { if (signed()) db.rpc("push_timer_cancel").then(() => {}, () => {}); }

  const pad = n => String(n).padStart(2, "0");
  const fmt = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${pad(m)}:${pad(x)}` : `${pad(m)}:${pad(x)}`; };

  /* 現在要顯示什麼 */
  function state() {
    try {
      if (typeof focusTimer !== "undefined" && focusTimer && typeof focusElapsedMs === "function") {
        const el = focusElapsedMs(focusTimer) / 1000;
        const down = focusTimer.mode === "down";
        const total = (focusTimer.plannedMinutes || 0) * 60;
        return { kind: "focus", label: `📚 ${focusTimer.subject || "專注"}${focusTimer.status === "paused" ? "（暫停）" : ""}`,
          sec: down ? total - el : el, pct: down && total ? Math.min(1, el / total) : null, running: focusTimer.status === "running" };
      }
    } catch (e) {}
    const left = W.end ? (W.end - Date.now()) / 1000 : (W.left != null ? W.left : W.total);
    return { kind: "own", label: W.end ? "⏳ 倒數中" : W.left != null ? "⏸️ 暫停" : "⏱️ 倒數", sec: left, pct: 1 - left / W.total, running: !!W.end };
  }

  function ring(pct, size) {
    if (pct == null) return "";
    const r = size / 2 - 4, c = 2 * Math.PI * r;
    return `<svg width="${size}" height="${size}" style="position:absolute;inset:0"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="4"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#ff9f43" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0, Math.min(1, pct)))}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
  }

  function bodyHtml(inPip) {
    const s = state();
    const presets = [5, 10, 15, 25, 50];
    const ctrl = s.kind === "focus"
      ? `<button data-ft="gofocus">打開專注頁</button>`
      : W.end ? `<button data-ft="pause">⏸️ 暫停</button><button data-ft="reset">↺</button>`
      : W.left != null ? `<button data-ft="resume">▶️ 繼續</button><button data-ft="reset">↺</button>`
      : presets.map(m => `<button data-ft="set" data-v="${m}" class="${W.total === m * 60 ? "on" : ""}">${m}</button>`).join("") + `<button data-ft="custom">…</button><button data-ft="start" class="go">▶️</button>`;
    return `<div class="ft-top"><span>${s.label}</span>${inPip ? "" : `<span class="ft-btns">${"documentPictureInPicture" in window ? `<button data-ft="pip" title="釘在所有視窗最上層">📌</button>` : canVideoPip() ? `<button data-ft="vpip" title="浮動小視窗（切到別的 App 也看得到）">📺</button>` : ""}${IOS ? `<button data-ft="ios" title="用 iPhone 計時器倒數（鎖定畫面看得到）">📱</button>` : ""}<button data-ft="mini" title="縮小">–</button><button data-ft="hide" title="收起來（右上角 ⏱️ 再打開）">✕</button></span>`}</div>
      <div class="ft-time ${s.sec <= 60 && s.kind === "own" && W.end ? "warn" : ""}">${fmt(s.sec)}</div><div class="ft-ctrl">${ctrl}</div>`;
  }

  const CSS = `
    .ft { position: fixed; z-index: 99990; width: 230px; padding: 10px 12px; border-radius: 18px; background: rgba(22,26,40,.92); color: #fff;
      box-shadow: 0 10px 30px rgba(0,0,0,.35); backdrop-filter: blur(8px); font-family: inherit; user-select: none; touch-action: none; }
    .ft-top { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #c9cfe3; cursor: grab; gap: 6px; }
    .ft-top span:first-child { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .ft-btns { display: flex; gap: 4px; flex: none; }
    .ft button { background: #2c3350; color: #fff; border: 0; border-radius: 8px; padding: 4px 7px; font-size: 12px; cursor: pointer; font-family: inherit; }
    .ft button.on { background: #ff9f43; color: #1b1f2e; } .ft button.go { background: #42d392; color: #10291d; }
    .ft-time { font-size: 38px; font-weight: 800; text-align: center; font-variant-numeric: tabular-nums; letter-spacing: 1px; margin: 2px 0 6px; }
    .ft-time.warn { color: #ff7b7b; }
    .ft-ctrl { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; }
    .ft-mini { position: fixed; z-index: 99990; width: 64px; height: 64px; border-radius: 50%; background: rgba(22,26,40,.92); color: #fff;
      display: grid; place-items: center; font-size: 13px; font-weight: 800; box-shadow: 0 8px 22px rgba(0,0,0,.35); cursor: pointer; touch-action: none; user-select: none; font-variant-numeric: tabular-nums; }
    .ft-mini span { position: relative; }
    body:not(.ft-on) .ft, body:not(.ft-on) .ft-mini { display: none; }`;

  let box;
  function mount() {
    if (!document.getElementById("ft-style")) { const st = document.createElement("style"); st.id = "ft-style"; st.textContent = CSS; document.head.appendChild(st); }
    box = document.createElement("div");
    document.body.appendChild(box);
    document.body.classList.add("ft-on");
    box.addEventListener("click", onClick);
    const addBtn = () => {
      if (document.getElementById("ft-open")) return;
      const lo = document.querySelector('button[onclick="logout()"]');
      if (!lo || !lo.parentNode) return setTimeout(addBtn, 1000);
      const b = document.createElement("button");
      b.id = "ft-open"; b.type = "button"; b.className = "btn ov-open-btn"; b.textContent = "⏱️"; b.title = "懸浮倒數";
      b.addEventListener("click", () => { W.hidden = !W.hidden; W.mini = false; save(); render(); });
      lo.parentNode.insertBefore(b, lo);
    };
    addBtn();
    drag(box);
    render();
    setInterval(tick, 1000);
  }

  function place() {
    const w = W.mini ? 64 : 230, h = W.mini ? 64 : 120;
    const x = W.x == null ? innerWidth - w - 14 : Math.min(Math.max(4, W.x), innerWidth - w - 4);
    const y = W.y == null ? innerHeight - h - 90 : Math.min(Math.max(4, W.y), innerHeight - h - 4);
    box.style.left = x + "px"; box.style.top = y + "px";
  }

  function render() {
    if (!box) return;
    box.hidden = !!W.hidden;
    if (W.mini) {
      const s = state();
      box.className = "ft-mini";
      box.innerHTML = `${ring(s.pct, 64)}<span data-ft="open">${s.kind === "own" && !s.running && W.left == null ? "⏱️" : fmt(s.sec)}</span>`;
    } else {
      box.className = "ft";
      box.innerHTML = bodyHtml(false);
    }
    place();
    if (pip) pip.document.getElementById("ftp").innerHTML = bodyHtml(true);
    drawCanvas();
  }

  function tick() {
    if (W.end && Date.now() >= W.end) {
      W.end = null; W.left = null; save();
      if (!rang) { rang = true; ding(); }
    }
    render();
  }

  function ding() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.35, 0.7].forEach(t => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
        g.gain.setValueAtTime(0.25, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.3); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 0.3); });
    } catch (e) {}
    try { if (Notification.permission === "granted") new Notification("⏱️ 時間到了！", { body: "倒數結束", icon: "img/app/icon-192.png" }); } catch (e) {}
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }

  async function onClick(e) {
    const el = e.target.closest("[data-ft]");
    if (!el || box.dataset.dragged === "1") return;
    const a = el.dataset.ft;
    if (a === "set") { W.total = Number(el.dataset.v) * 60; W.left = null; }
    else if (a === "custom") { const m = Number(prompt("倒數幾分鐘？", Math.round(W.total / 60))); if (m > 0) { W.total = Math.round(m * 60); W.left = null; } }
    else if (a === "start") { W.end = Date.now() + W.total * 1000; W.left = null; rang = false; pushSet(W.total); try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (_) {} }
    else if (a === "pause") { W.left = (W.end - Date.now()) / 1000; W.end = null; pushCancel(); }
    else if (a === "resume") { W.end = Date.now() + W.left * 1000; pushSet(W.left); W.left = null; rang = false; }
    else if (a === "reset") { W.end = null; W.left = null; pushCancel(); }
    else if (a === "vpip") return videoPip();
    else if (a === "ios") return iosTimer();
    else if (a === "mini") W.mini = true;
    else if (a === "hide") W.hidden = true;
    else if (a === "open") W.mini = false;
    else if (a === "gofocus") { if (typeof showPage === "function") showPage("focus"); }
    else if (a === "pip") return openPip();
    save(); render();
  }

  /* 📺 iPhone：把倒數畫成影片，用影片的子母畫面浮在其他 App 上 */
  function drawCanvas() {
    if (!cvs) return;
    const g = cvs.getContext("2d"), s = state();
    g.fillStyle = "#161a28"; g.fillRect(0, 0, cvs.width, cvs.height);
    if (s.pct != null) { g.fillStyle = "#2c3350"; g.fillRect(0, cvs.height - 14, cvs.width, 14); g.fillStyle = "#ff9f43"; g.fillRect(0, cvs.height - 14, cvs.width * Math.max(0, Math.min(1, s.pct)), 14); }
    g.fillStyle = "#c9cfe3"; g.font = "28px system-ui, sans-serif"; g.textAlign = "center"; g.fillText(s.label, cvs.width / 2, 52);
    g.fillStyle = s.kind === "own" && W.end && s.sec <= 60 ? "#ff7b7b" : "#ffffff"; g.font = "bold 110px system-ui, sans-serif"; g.fillText(fmt(s.sec), cvs.width / 2, 175);
  }
  async function videoPip() {
    try {
      if (!vid) {
        cvs = document.createElement("canvas"); cvs.width = 480; cvs.height = 220; drawCanvas();
        vid = document.createElement("video"); vid.muted = true; vid.playsInline = true; vid.setAttribute("playsinline", ""); vid.autoplay = true;
        vid.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:240px;height:110px;border-radius:12px;z-index:99995;box-shadow:0 10px 30px rgba(0,0,0,.5)";
        vid.addEventListener("click", () => { try { vid.webkitSetPresentationMode ? vid.webkitSetPresentationMode("picture-in-picture") : vid.requestPictureInPicture(); } catch (e) {} });
        vid.addEventListener("webkitpresentationmodechanged", () => { vid.style.display = vid.webkitPresentationMode === "picture-in-picture" ? "none" : ""; });
        vid.srcObject = cvs.captureStream(2);
        document.body.appendChild(vid);
      }
      drawCanvas();
      await vid.play();
      if (vid.webkitSupportsPresentationMode && vid.webkitSupportsPresentationMode("picture-in-picture")) vid.webkitSetPresentationMode("picture-in-picture");
      else await vid.requestPictureInPicture();
    } catch (e) { alert("這支手機的瀏覽器開不了浮動小視窗：" + (e.message || e) + "\n可以改用 📱 iPhone 計時器"); }
  }

  /* 📱 iPhone：用「捷徑」開始內建計時器（鎖定畫面看得到） */
  function iosTimer() {
    const s = state();
    const min = Math.max(1, Math.round((s.kind === "own" && !W.end && W.left == null ? W.total : s.sec) / 60));
    if (s.kind === "own" && !W.end && W.left == null) { W.end = Date.now() + W.total * 1000; rang = false; pushSet(W.total); save(); render(); }
    location.href = "shortcuts://run-shortcut?name=" + encodeURIComponent("序光倒數") + "&input=text&text=" + min;
  }

  /* 📌 子母畫面：一個永遠在最上層的小視窗 */
  async function openPip() {
    if (pip) { pip.close(); return; }
    try {
      pip = await documentPictureInPicture.requestWindow({ width: 240, height: 150 });
    } catch (e) { alert("這個瀏覽器不能釘在最上層（電腦版 Chrome／Edge 才可以）"); return; }
    const st = pip.document.createElement("style");
    st.textContent = CSS + `html,body{margin:0;background:#161a28;height:100%} .ft{position:static;width:auto;box-shadow:none;border-radius:0;height:100%;box-sizing:border-box} body{font-family:system-ui,"Noto Sans TC",sans-serif}`;
    pip.document.head.appendChild(st);
    pip.document.body.innerHTML = `<div class="ft" id="ftp"></div>`;
    pip.document.body.addEventListener("click", e => onClick(e));
    pip.addEventListener("pagehide", () => { pip = null; render(); });
    render();
  }

  /* 拖拉（手指和滑鼠都可以） */
  function drag(el) {
    let sx, sy, ox, oy, moved = false;
    el.addEventListener("pointerdown", e => {
      if (!W.mini && !e.target.closest(".ft-top")) return;
      if (e.target.closest("button")) return;
      sx = e.clientX; sy = e.clientY; const r = el.getBoundingClientRect(); ox = r.left; oy = r.top; moved = false;
      el.setPointerCapture(e.pointerId);
      const mv = ev => { const dx = ev.clientX - sx, dy = ev.clientY - sy; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; W.x = ox + dx; W.y = oy + dy; place(); };
      const up = () => { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.dataset.dragged = moved ? "1" : "0"; setTimeout(() => { el.dataset.dragged = "0"; }, 50); save(); };
      el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up);
    });
  }

  window.FloatTimer = {
    show() { W.hidden = false; save(); render(); },
    hide() { W.hidden = true; save(); render(); },
    toggle() { W.hidden = !W.hidden; save(); render(); }
  };
  addEventListener("resize", () => box && place());
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
