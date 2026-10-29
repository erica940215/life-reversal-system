/* =========================================================
   序光計畫：🔔 推播提醒
   - 右上角「🔔」打開設定：這台裝置開啟通知、提醒時間、只在還有任務沒完成時提醒、送測試通知
   - 網站關著也收得到（Service Worker：sw.js）
   - iPhone 要先用 Safari「分享 → 加入主畫面」，從主畫面的圖示打開才能開通知
   資料庫：sql/2026-10-29_推播提醒.sql　送通知：supabase/functions/push-remind
========================================================= */

(function () {

  "use strict";

  const PUBLIC_KEY = "BOTqAMFQkNgd-LbH6UFXYIXtT170YoGyjP1P0hdSu4XlD4170JUrOvlaqfncr2S1Gd8fRRt7X1wjr8JrbXLbxRs";

  const NT = { open: false, reg: null, sub: null, set: null, busy: false, msg: "", err: null, newTime: "12:00" };

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const loggedIn = () => typeof currentUser !== "undefined" && !!currentUser && typeof db !== "undefined";

  function keyBytes(b64) {
    const pad = "=".repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  async function ensureReg() {
    if (!supported()) return null;
    if (NT.reg) return NT.reg;
    try {
      NT.reg = await navigator.serviceWorker.register("sw.js");
      NT.sub = await NT.reg.pushManager.getSubscription();
    } catch (e) { console.warn("Service Worker 註冊失敗：", e); }
    return NT.reg;
  }

  async function loadSettings() {
    if (!loggedIn()) return;
    const { data, error } = await db.rpc("push_get");
    if (error) { NT.err = /push_get|PGRST202|42883/.test(error.message || "") ? "setup" : error.message; }
    else { NT.err = null; NT.set = data; }
  }

  /* 這台裝置已經訂閱，但資料庫沒有（例如換帳號）→ 補上 */
  async function syncSub() {
    if (!NT.sub || !NT.set) return;
    if ((NT.set.endpoints || []).includes(NT.sub.endpoint)) return;
    const j = NT.sub.toJSON();
    const { data } = await db.rpc("push_subscribe", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent });
    if (data) NT.set = data;
  }

  async function enable() {
    NT.busy = true; NT.msg = ""; render();
    try {
      const reg = await ensureReg();
      if (!reg) throw new Error("這個瀏覽器不支援通知");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("沒有允許通知。到瀏覽器（或手機設定）的網站權限把通知打開，再按一次。");
      await navigator.serviceWorker.ready;
      NT.sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) });
      const j = NT.sub.toJSON();
      const { data, error } = await db.rpc("push_subscribe", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent });
      if (error) throw error;
      NT.set = data;
      NT.msg = "✅ 這台裝置開好通知了，按「送測試通知」試試看";
    } catch (e) {
      NT.msg = "❌ " + (e.message || e);
    }
    NT.busy = false; render();
  }

  async function disable() {
    NT.busy = true; render();
    try {
      if (NT.sub) {
        const ep = NT.sub.endpoint;
        await NT.sub.unsubscribe().catch(() => {});
        NT.sub = null;
        const { data } = await db.rpc("push_unsubscribe", { p_endpoint: ep });
        if (data) NT.set = data;
      }
      NT.msg = "這台裝置不會再收到通知";
    } catch (e) { NT.msg = "❌ " + (e.message || e); }
    NT.busy = false; render();
  }

  async function save(patch) {
    const s = Object.assign({ enabled: true, times: ["21:00"], only_pending: true }, NT.set || {}, patch);
    NT.busy = true; render();
    const { data, error } = await db.rpc("push_save", { p_enabled: s.enabled, p_times: s.times, p_only_pending: s.only_pending });
    NT.busy = false;
    if (error) NT.msg = "❌ " + error.message;
    else { NT.set = data; NT.msg = "已儲存"; }
    render();
  }

  async function saveMore(m) {
    NT.busy = true; render();
    const { data, error } = await db.rpc("push_save_more", { p_exp: m.n_exp, p_farm: m.n_farm, p_summary: m.n_summary, p_summary_time: m.summary_time });
    NT.busy = false;
    if (error) NT.msg = /push_save_more|PGRST202/.test(error.message || "") ? "⚠️ 要先執行 sql/2026-10-30_通知與回顧.sql" : "❌ " + error.message;
    else { NT.set = data; NT.msg = "已儲存"; }
    render();
  }

  async function test() {
    NT.busy = true; NT.msg = "送出中…"; render();
    try {
      const { data, error } = await db.functions.invoke("push-remind", { body: { test: true } });
      if (error) throw error;
      NT.msg = data && data.sent ? `📨 送出了 ${data.sent} 則，幾秒內會跳出來` : "沒有送出去：這個帳號還沒有開通知的裝置";
    } catch (e) {
      NT.msg = "❌ 送不出去：送通知的程式（push-remind）可能還沒部署好";
    }
    NT.busy = false; render();
  }

  /* ---------- 畫面 ---------- */

  function bodyHtml() {
    if (!loggedIn()) return `<p class="nt-note">登入之後才能設定提醒。</p>`;
    if (NT.err === "setup") return `<p class="nt-note">⚠️ 通知的資料庫還沒設定：到 Supabase 的 SQL Editor 執行 <b>sql/2026-10-29_推播提醒.sql</b>。</p>`;
    if (NT.err) return `<p class="nt-note">載入失敗：${esc(NT.err)}</p>`;

    let dev;
    if (isIOS() && !standalone()) {
      dev = `<div class="nt-box warn"><b>📱 iPhone 要先加到主畫面</b>
        <ol><li>用 <b>Safari</b> 打開這個網站</li><li>按下方的「分享」<span class="nt-ic">⬆️</span></li><li>選「<b>加入主畫面</b>」</li><li>從主畫面的「序光計畫」圖示打開，再來這裡按「開啟通知」</li></ol>
        <small>需要 iOS 16.4 以上。</small></div>`;
    } else if (!supported()) {
      dev = `<div class="nt-box warn">這個瀏覽器不支援通知，換成 Chrome、Edge 或 Safari 試試。</div>`;
    } else if (Notification.permission === "denied") {
      dev = `<div class="nt-box warn">通知被封鎖了。到瀏覽器網址列左邊的「網站設定」（手機在「設定 → 通知」）把通知改成允許，再重新整理。</div>`;
    } else if (NT.sub) {
      dev = `<div class="nt-box ok">✅ 這台裝置已開啟通知
        <div class="nt-row"><button type="button" class="nt-btn" data-nt="test" ${NT.busy ? "disabled" : ""}>送測試通知</button>
        <button type="button" class="nt-btn ghost" data-nt="off" ${NT.busy ? "disabled" : ""}>關掉這台</button></div></div>`;
    } else {
      dev = `<div class="nt-box"><b>這台裝置還沒開通知</b>
        <div class="nt-row"><button type="button" class="nt-btn" data-nt="on" ${NT.busy ? "disabled" : ""}>🔔 開啟通知</button></div></div>`;
    }

    const s = NT.set || { enabled: true, times: ["21:00"], only_pending: true, devices: 0 };
    const chips = (s.times || []).map(t => `<span class="nt-chip">${esc(t)}<button type="button" data-nt="del" data-v="${esc(t)}" aria-label="刪除 ${esc(t)}">✕</button></span>`).join("") || `<span class="nt-note">還沒有提醒時間</span>`;

    return dev + `<div class="nt-box">
        <label class="nt-toggle"><input type="checkbox" data-nt="enabled" ${s.enabled ? "checked" : ""}> 每天提醒我</label>
        <div class="nt-sec">提醒時間（台灣時間）</div>
        <div class="nt-chips">${chips}</div>
        <div class="nt-row"><input type="time" id="nt-time" value="${esc(NT.newTime)}" step="300"><button type="button" class="nt-btn ghost" data-nt="add" ${NT.busy ? "disabled" : ""}>＋ 加這個時間</button></div>
        <label class="nt-toggle"><input type="checkbox" data-nt="only" ${s.only_pending ? "checked" : ""}> 只有還有任務沒完成時才提醒（全部做完就不吵你）</label>
        <p class="nt-note">通知會寫還剩幾個任務、前三個是什麼。每個時間每天最多一則，時間到之後 10 分鐘內會送到。目前有 ${s.devices || 0} 台裝置會收到。</p>
      </div>
      <div class="nt-box"><div class="nt-sec">其他通知</div>
        <label class="nt-toggle"><input type="checkbox" data-nt="m" data-k="n_exp" ${s.n_exp !== false ? "checked" : ""}> 🧭 末世遠征隊回來了</label>
        <label class="nt-toggle"><input type="checkbox" data-nt="m" data-k="n_farm" ${s.n_farm !== false ? "checked" : ""}> 🌾 農場的作物都熟了</label>
        <label class="nt-toggle"><input type="checkbox" data-nt="m" data-k="n_summary" ${s.n_summary !== false ? "checked" : ""}> 📊 每日總結（今天專注多久、任務完成幾個）</label>
        <div class="nt-row"><span>每日總結時間</span><input type="time" id="nt-sum" value="${esc(s.summary_time || "22:30")}" step="300"><button type="button" class="nt-btn ghost" data-nt="sumtime" ${NT.busy ? "disabled" : ""}>儲存</button></div>
      </div>
      <div class="nt-msg">${esc(NT.msg)}</div>`;
  }

  function render() {
    const ov = document.getElementById("nt-overlay");
    if (!ov || !NT.open) return;
    const keep = document.getElementById("nt-time");
    if (keep) NT.newTime = keep.value || NT.newTime;
    ov.querySelector(".nt-panel").innerHTML = `<div class="nt-head"><h2>🔔 提醒通知</h2><button type="button" class="nt-x" data-nt="close" aria-label="關閉">✕</button></div>${bodyHtml()}`;
  }

  async function openPanel() {
    NT.open = true; NT.msg = "";
    document.getElementById("nt-overlay").hidden = false;
    render();
    await ensureReg();
    await loadSettings();
    await syncSub().catch(() => {});
    render();
  }

  function closePanel() {
    NT.open = false;
    document.getElementById("nt-overlay").hidden = true;
  }

  function onClick(e) {
    const el = e.target.closest("[data-nt]");
    if (!el) { if (e.target.id === "nt-overlay") closePanel(); return; }
    const a = el.dataset.nt;
    const s = NT.set || { times: ["21:00"] };
    if (a === "close") return closePanel();
    if (a === "on") return enable();
    if (a === "off") return disable();
    if (a === "test") return test();
    if (a === "enabled") return save({ enabled: el.checked });
    if (a === "only") return save({ only_pending: el.checked });
    if (a === "m" || a === "sumtime") {
      const m = { n_exp: s.n_exp !== false, n_farm: s.n_farm !== false, n_summary: s.n_summary !== false, summary_time: s.summary_time || "22:30" };
      if (a === "m") m[el.dataset.k] = el.checked;
      else m.summary_time = (document.getElementById("nt-sum") || {}).value || m.summary_time;
      return saveMore(m);
    }
    if (a === "del") return save({ times: (s.times || []).filter(t => t !== el.dataset.v) });
    if (a === "add") {
      const v = (document.getElementById("nt-time") || {}).value;
      if (!/^\d\d:\d\d$/.test(v || "")) return;
      if ((s.times || []).includes(v)) { NT.msg = "這個時間已經有了"; return render(); }
      if ((s.times || []).length >= 6) { NT.msg = "最多 6 個時間"; return render(); }
      return save({ times: (s.times || []).concat(v) });
    }
  }

  function setup() {
    if (!document.getElementById("nt-style")) {
      const st = document.createElement("style");
      st.id = "nt-style";
      st.textContent = `
        #nt-overlay { position: fixed; inset: 0; background: rgba(5,8,18,.6); z-index: 9998; display: flex; justify-content: center; align-items: flex-start; padding: 60px 12px 20px; overflow-y: auto; }
        #nt-overlay[hidden] { display: none; }
        .nt-panel { width: 100%; max-width: 440px; background: #1f2436; color: #e8ebf5; border-radius: 16px; padding: 16px; box-shadow: 0 10px 40px rgba(0,0,0,.4); }
        .nt-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .nt-head h2 { margin: 0; font-size: 19px; }
        .nt-x { background: none; border: 0; color: #8f98b6; font-size: 20px; cursor: pointer; }
        .nt-box { background: #151927; border-radius: 12px; padding: 12px; margin-bottom: 10px; font-size: 14px; }
        .nt-box.ok { border-left: 4px solid #42d392; } .nt-box.warn { border-left: 4px solid #ffb547; }
        .nt-box ol { margin: 6px 0 4px 18px; padding: 0; line-height: 1.7; }
        .nt-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
        .nt-btn { background: #ff9f43; color: #1b1f2e; border: 0; border-radius: 10px; padding: 8px 14px; font-weight: 700; cursor: pointer; font-size: 14px; }
        .nt-btn.ghost { background: #2c3350; color: #e8ebf5; }
        .nt-btn:disabled { opacity: .5; cursor: default; }
        .nt-sec { font-weight: 700; margin: 10px 0 6px; }
        .nt-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .nt-chip { background: #2c3350; border-radius: 99px; padding: 4px 6px 4px 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .nt-chip button { background: none; border: 0; color: #8f98b6; cursor: pointer; margin-left: 2px; }
        .nt-toggle { display: flex; gap: 8px; align-items: center; margin: 8px 0; cursor: pointer; }
        #nt-time { background: #2c3350; color: #e8ebf5; border: 0; border-radius: 10px; padding: 7px 10px; font-size: 15px; }
        .nt-note { font-size: 12.5px; color: #8f98b6; margin: 8px 0 0; }
        .nt-msg { font-size: 13.5px; min-height: 18px; text-align: center; }
        @media (max-width: 480px) { .nt-open-btn .nt-open-txt { display: none; } }
      `;
      document.head.appendChild(st);
    }
    if (!document.getElementById("nt-open")) {
      const logoutBtn = document.querySelector('button[onclick="logout()"]');
      if (logoutBtn && logoutBtn.parentNode) {
        const b = document.createElement("button");
        b.id = "nt-open";
        b.type = "button";
        b.className = "btn nt-open-btn";
        b.innerHTML = `🔔<span class="nt-open-txt"> 提醒</span>`;
        b.setAttribute("aria-label", "提醒通知");
        b.addEventListener("click", openPanel);
        logoutBtn.parentNode.insertBefore(b, logoutBtn);
      }
    }
    if (!document.getElementById("nt-overlay")) {
      const ov = document.createElement("div");
      ov.id = "nt-overlay";
      ov.hidden = true;
      ov.innerHTML = `<div class="nt-panel" role="dialog" aria-modal="true" aria-label="提醒通知"></div>`;
      ov.addEventListener("click", onClick);
      document.body.appendChild(ov);
    }
    ensureReg();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();

  window.NotifyGame = { open: openPanel, state: NT };

})();
