/* =========================================================
   序光計畫：👥 好友
   - 右上角「👥 好友」打開面板：我的好友碼、加好友、邀請、好友今天的狀態
   - 好友看得到：今天完成幾個任務、現在是否在專注、這次專注多久、今天專注幾分鐘
   - 專注頁按開始／暫停／結束時，把狀態同步到資料庫（friend_presence）
   資料庫：sql/2026-10-19_好友.sql
========================================================= */

(function () {

  const FR = {
    open: false,
    ready: null,          // null 還沒試過、true 可以用、false 資料庫還沒設定
    me: null,             // { code, share }
    list: [],
    fetchedAt: 0,         // 伺服器回傳的時間（算專注經過多久用）
    localAt: 0,
    busy: false,
    msg: "",
    timer: null,
    tick: null
  };

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function hasDb() {
    return typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  }

  function missing(error) {
    const m = String((error && (error.message || error.code)) || "");
    return /PGRST202|42883|Could not find the function|friend_/.test(m);
  }

  function fmtDur(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function fmtMin(sec) {
    const m = Math.floor(sec / 60);
    if (m < 60) return `${m} 分`;
    return `${Math.floor(m / 60)} 時 ${m % 60} 分`;
  }

  function ago(iso) {
    if (!iso) return "還沒有紀錄";
    const d = (Date.now() - new Date(iso).getTime()) / 60000;
    if (d < 2) return "剛剛";
    if (d < 60) return `${Math.floor(d)} 分鐘前`;
    if (d < 60 * 24) return `${Math.floor(d / 60)} 小時前`;
    return `${Math.floor(d / 60 / 24)} 天前`;
  }


  /* ---------- 專注狀態同步 ---------- */

  let presenceTimer = null;
  let lastPresence = "";

  function presencePayload() {
    const t = typeof focusTimer !== "undefined" ? focusTimer : null;
    if (!t) return { p_status: "idle", p_seg_start: null, p_acc_ms: 0, p_started_at: null };
    return {
      p_status: t.status === "running" ? "running" : "paused",
      p_seg_start: t.status === "running" && t.segmentStart ? new Date(t.segmentStart).toISOString() : null,
      p_acc_ms: Math.round(t.accumulatedMs || 0),
      p_started_at: t.startedAt || null
    };
  }

  function pushPresence(force = false) {
    if (!hasDb() || FR.ready === false) return;
    clearTimeout(presenceTimer);
    presenceTimer = setTimeout(async () => {
      const body = presencePayload();
      const sig = JSON.stringify(body);
      if (!force && sig === lastPresence) return;
      try {
        const { error } = await db.rpc("friend_presence", body);
        if (error) throw error;
        lastPresence = sig;
      } catch (error) {
        if (missing(error)) FR.ready = false;
        else console.warn("專注狀態同步失敗：", error);
      }
    }, 400);
  }

  /* 專注頁每次存計時都會呼叫 saveFocusTimer：接在後面同步狀態 */
  if (typeof window.saveFocusTimer === "function" && !window.saveFocusTimer.__friends) {
    const orig = window.saveFocusTimer;
    window.saveFocusTimer = function () {
      const r = orig.apply(this, arguments);
      pushPresence();
      return r;
    };
    window.saveFocusTimer.__friends = true;
  }

  /* 登入之後同步一次（例如重新整理時計時還在跑） */
  let syncedUser = null;
  setInterval(() => {
    if (!hasDb()) { syncedUser = null; return; }
    if (syncedUser !== currentUser.id) {
      syncedUser = currentUser.id;
      lastPresence = "";
      pushPresence(true);
    }
  }, 2000);


  /* ---------- 資料 ---------- */

  async function loadAll() {
    if (!hasDb()) return;
    try {
      const [me, list] = await Promise.all([db.rpc("friend_my_code"), db.rpc("friend_list")]);
      if (me.error) throw me.error;
      if (list.error) throw list.error;
      FR.ready = true;
      FR.me = me.data;
      FR.list = (list.data && list.data.friends) || [];
      FR.fetchedAt = list.data && list.data.now ? new Date(list.data.now).getTime() : Date.now();
      FR.localAt = Date.now();
    } catch (error) {
      if (missing(error)) FR.ready = false;
      else { console.warn("好友載入失敗：", error); FR.msg = "載入失敗，等一下再試"; }
    }
    render();
  }

  async function call(name, args, okMsg) {
    if (FR.busy) return;
    FR.busy = true;
    FR.msg = "";
    try {
      const { data, error } = await db.rpc(name, args);
      if (error) throw error;
      if (data && data.ok === false) {
        FR.msg = {
          not_found: "找不到這個好友碼",
          self: "這是你自己的好友碼",
          already: "你們已經是好友了",
          pending: "已經送出邀請了，等對方同意",
          limit: "好友和邀請最多 100 個"
        }[data.reason] || "沒有成功";
      } else {
        FR.msg = typeof okMsg === "function" ? okMsg(data) : (okMsg || "");
      }
    } catch (error) {
      console.warn(name, error);
      FR.msg = missing(error) ? "好友功能還沒設定好" : "沒有成功，等一下再試";
    } finally {
      FR.busy = false;
    }
    await loadAll();
  }


  /* ---------- 畫面 ---------- */

  function ensureUi() {

    if (!document.getElementById("fr-style")) {
      const st = document.createElement("style");
      st.id = "fr-style";
      st.textContent = `
        .fr-open-btn { margin-right: 8px; }
        .fr-overlay { position: fixed; inset: 0; z-index: 9000; background: rgba(5, 8, 16, .62); display: flex; justify-content: center; align-items: flex-start; padding: 56px 12px 24px; overflow-y: auto; }
        .fr-overlay[hidden] { display: none; }
        .fr-panel { width: 100%; max-width: 520px; background: #151927; color: #e8eaf3; border: 1px solid #2a3047; border-radius: 18px; padding: 18px 16px 20px; box-shadow: 0 18px 50px rgba(0, 0, 0, .45); }
        .fr-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .fr-head h2 { margin: 0; font-size: 20px; }
        .fr-x { background: none; border: 0; color: #9aa3c0; font-size: 22px; cursor: pointer; padding: 4px 8px; }
        .fr-card { background: #1c2133; border: 1px solid #2a3047; border-radius: 14px; padding: 12px 14px; margin-bottom: 10px; }
        .fr-sec { font-size: 13px; color: #9aa3c0; margin: 14px 2px 8px; }
        .fr-code { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .fr-code b { font-size: 24px; letter-spacing: 4px; font-family: ui-monospace, Menlo, monospace; color: #ffd76a; }
        .fr-row { display: flex; gap: 8px; }
        .fr-row input { flex: 1; min-width: 0; padding: 10px 12px; border-radius: 10px; border: 1px solid #343b57; background: #10131e; color: #fff; font-size: 16px; letter-spacing: 2px; text-transform: uppercase; }
        .fr-btn { padding: 9px 14px; border-radius: 10px; border: 0; background: #5b6cff; color: #fff; font-size: 14px; cursor: pointer; white-space: nowrap; }
        .fr-btn.ghost { background: #2a3047; color: #d6dbef; }
        .fr-btn.red { background: #8e2f3c; }
        .fr-btn:disabled { opacity: .5; cursor: default; }
        .fr-msg { font-size: 13px; color: #ffd76a; margin: 8px 2px 0; min-height: 1em; }
        .fr-note { font-size: 12.5px; color: #8f98b6; line-height: 1.6; margin: 6px 2px 0; }
        .fr-toggle { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: #c9cfe4; margin-top: 10px; cursor: pointer; }
        .fr-friend { display: grid; grid-template-columns: 44px 1fr auto; gap: 12px; align-items: center; }
        .fr-ava { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; font-size: 19px; font-weight: 700; background: #2a3047; color: #fff; position: relative; }
        .fr-ava.on::after { content: ""; position: absolute; right: -1px; bottom: -1px; width: 13px; height: 13px; border-radius: 50%; background: #42d392; border: 2px solid #1c2133; }
        .fr-ava.pause::after { content: ""; position: absolute; right: -1px; bottom: -1px; width: 13px; height: 13px; border-radius: 50%; background: #ffb547; border: 2px solid #1c2133; }
        .fr-name { font-size: 16px; font-weight: 700; }
        .fr-sub { font-size: 12.5px; color: #8f98b6; margin-top: 2px; }
        .fr-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
        .fr-stat { background: #151927; border-radius: 10px; padding: 8px 6px; text-align: center; }
        .fr-stat b { display: block; font-size: 17px; color: #fff; font-variant-numeric: tabular-nums; }
        .fr-stat span { font-size: 11.5px; color: #8f98b6; }
        .fr-stat.live b { color: #42d392; }
        .fr-stat.paused b { color: #ffb547; }
        .fr-empty { text-align: center; color: #8f98b6; font-size: 14px; padding: 18px 8px; }
        .fr-more { background: none; border: 0; color: #6b7392; font-size: 18px; cursor: pointer; padding: 4px 6px; }
        @media (max-width: 480px) { .fr-open-btn .fr-open-txt { display: none; } }
      `;
      document.head.appendChild(st);
    }

    if (!document.getElementById("fr-open")) {
      const logoutBtn = document.querySelector('button[onclick="logout()"]');
      if (logoutBtn && logoutBtn.parentNode) {
        const b = document.createElement("button");
        b.id = "fr-open";
        b.type = "button";
        b.className = "btn fr-open-btn";
        b.innerHTML = `👥<span class="fr-open-txt"> 好友</span>`;
        b.setAttribute("aria-label", "好友");
        b.addEventListener("click", openPanel);
        logoutBtn.parentNode.insertBefore(b, logoutBtn);
      }
    }

    if (!document.getElementById("fr-overlay")) {
      const ov = document.createElement("div");
      ov.id = "fr-overlay";
      ov.className = "fr-overlay";
      ov.hidden = true;
      ov.innerHTML = `<div class="fr-panel" role="dialog" aria-modal="true" aria-label="好友"></div>`;
      ov.addEventListener("click", e => { if (e.target === ov) closePanel(); });
      ov.addEventListener("click", onClick);
      document.body.appendChild(ov);
    }
  }

  function render() {
    const ov = document.getElementById("fr-overlay");
    if (!ov || !FR.open) return;
    const panel = ov.querySelector(".fr-panel");

    let body = "";

    if (!hasDb()) {
      body = `<div class="fr-empty">登入之後才能加好友。</div>`;
    } else if (FR.ready === false) {
      body = `<div class="fr-card"><div class="fr-note">⚠️ 好友功能的資料庫還沒設定：到 Supabase 的 SQL Editor 執行 <b>sql/2026-10-19_好友.sql</b>，重新整理網頁之後就能用。</div></div>`;
    } else if (FR.ready === null) {
      body = `<div class="fr-empty">載入中…</div>`;
    } else {
      const me = FR.me || {};
      const incoming = FR.list.filter(f => f.status === "pending" && f.incoming);
      const outgoing = FR.list.filter(f => f.status === "pending" && !f.incoming);
      const friends = FR.list.filter(f => f.status === "accepted");

      body += `<div class="fr-card">
        <div class="fr-code"><span>我的好友碼</span><b>${esc(me.code || "------")}</b>
          <button type="button" class="fr-btn ghost" data-fr="copy">複製</button></div>
        <label class="fr-toggle"><input type="checkbox" data-fr="share" ${me.share !== false ? "checked" : ""}> 讓好友看到我今天完成幾個任務、有沒有在專注</label>
      </div>`;

      body += `<div class="fr-card"><div class="fr-row">
          <input id="fr-code-in" maxlength="6" placeholder="輸入好友碼" autocomplete="off" autocapitalize="characters">
          <button type="button" class="fr-btn" data-fr="add" ${FR.busy ? "disabled" : ""}>加好友</button></div>
        <div class="fr-msg">${esc(FR.msg)}</div></div>`;

      if (incoming.length) {
        body += `<div class="fr-sec">好友邀請</div>` + incoming.map(f => `<div class="fr-card"><div class="fr-friend">
          <div class="fr-ava">${esc(f.name.slice(0, 1))}</div>
          <div><div class="fr-name">${esc(f.name)}</div><div class="fr-sub">想加你為好友</div></div>
          <div class="fr-row"><button type="button" class="fr-btn" data-fr="accept" data-id="${f.id}">同意</button>
          <button type="button" class="fr-btn ghost" data-fr="decline" data-id="${f.id}">拒絕</button></div></div></div>`).join("");
      }

      body += `<div class="fr-sec">好友（${friends.length}）</div>`;
      if (!friends.length) {
        body += `<div class="fr-empty">還沒有好友。把你的好友碼傳給朋友，或輸入朋友的好友碼。</div>`;
      } else {
        const offset = FR.localAt - FR.fetchedAt;   // 本機時間跟伺服器時間的差
        body += friends.map(f => {
          if (f.hidden) {
            return `<div class="fr-card"><div class="fr-friend"><div class="fr-ava">${esc(f.name.slice(0, 1))}</div>
              <div><div class="fr-name">${esc(f.name)}</div><div class="fr-sub">沒有公開今天的狀態</div></div>
              <button type="button" class="fr-more" data-fr="remove" data-id="${f.id}" data-name="${esc(f.name)}" aria-label="刪除好友">⋯</button></div></div>`;
          }
          const st = f.focus_state;
          const liveMs = st === "running" ? f.focus_live_ms + (Date.now() - offset - FR.fetchedAt) : f.focus_live_ms;
          const todaySec = f.focus_today_sec + (st !== "idle" ? Math.floor(liveMs / 1000) : 0);
          const live = st === "running"
            ? `<div class="fr-stat live"><b data-fr-live="${f.id}">${fmtDur(liveMs)}</b><span>專注中</span></div>`
            : st === "paused"
              ? `<div class="fr-stat paused"><b>${fmtDur(liveMs)}</b><span>暫停中</span></div>`
              : `<div class="fr-stat"><b>－</b><span>沒在專注</span></div>`;
          return `<div class="fr-card"><div class="fr-friend">
              <div class="fr-ava ${st === "running" ? "on" : st === "paused" ? "pause" : ""}">${esc(f.name.slice(0, 1))}</div>
              <div><div class="fr-name">${esc(f.name)}</div><div class="fr-sub">${st === "running" ? "🟢 正在專注" : st === "paused" ? "🟠 專注暫停中" : `最後活動：${ago(f.last_active)}`}</div></div>
              <button type="button" class="fr-more" data-fr="remove" data-id="${f.id}" data-name="${esc(f.name)}" aria-label="刪除好友">⋯</button></div>
            <div class="fr-stats">
              <div class="fr-stat"><b>${f.tasks_today}</b><span>今天完成任務</span></div>
              ${live}
              <div class="fr-stat"><b data-fr-today="${f.id}">${fmtMin(todaySec)}</b><span>今天專注</span></div>
            </div></div>`;
        }).join("");
      }

      if (outgoing.length) {
        body += `<div class="fr-sec">等對方同意</div>` + outgoing.map(f => `<div class="fr-card"><div class="fr-friend">
          <div class="fr-ava">${esc(f.name.slice(0, 1))}</div><div><div class="fr-name">${esc(f.name)}</div><div class="fr-sub">已送出邀請</div></div>
          <button type="button" class="fr-btn ghost" data-fr="cancel" data-id="${f.id}">取消</button></div></div>`).join("");
      }

      body += `<p class="fr-note">好友只看得到：今天完成幾個任務、有沒有在專注、這次專注多久、今天專注多久。看不到任務名稱和專注科目。</p>`;
    }

    const keep = document.getElementById("fr-code-in");
    const typed = keep ? keep.value : "";
    panel.innerHTML = `<div class="fr-head"><h2>👥 好友</h2><button type="button" class="fr-x" data-fr="close" aria-label="關閉">✕</button></div>${body}`;
    const input = document.getElementById("fr-code-in");
    if (input) {
      input.value = typed;
      input.addEventListener("keydown", e => { if (e.key === "Enter") addFriend(); });
    }
  }

  /* 專注中的時間每秒跳 */
  function tickLive() {
    if (!FR.open) return;
    const offset = FR.localAt - FR.fetchedAt;
    for (const f of FR.list) {
      if (f.status !== "accepted" || f.focus_state !== "running") continue;
      const liveMs = f.focus_live_ms + (Date.now() - offset - FR.fetchedAt);
      const a = document.querySelector(`[data-fr-live="${f.id}"]`);
      if (a) a.textContent = fmtDur(liveMs);
      const b = document.querySelector(`[data-fr-today="${f.id}"]`);
      if (b) b.textContent = fmtMin(f.focus_today_sec + Math.floor(liveMs / 1000));
    }
  }

  function addFriend() {
    const input = document.getElementById("fr-code-in");
    const code = (input && input.value || "").trim().toUpperCase();
    if (code.length !== 6) { FR.msg = "好友碼是 6 個字"; render(); return; }
    if (input) input.value = "";
    call("friend_request", { p_code: code }, d => d && d.status === "accepted" ? "已經成為好友了！" : "邀請已送出，等對方同意");
  }

  function onClick(e) {
    const el = e.target.closest("[data-fr]");
    if (!el) return;
    const act = el.dataset.fr;
    if (act === "close") return closePanel();
    if (act === "add") return addFriend();
    if (act === "copy") {
      const code = FR.me && FR.me.code;
      if (!code) return;
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject())
        .then(() => { FR.msg = "已複製好友碼"; render(); })
        .catch(() => { FR.msg = `好友碼：${code}`; render(); });
      return;
    }
    if (act === "share") return call("friend_set_share", { p_share: el.checked }, el.checked ? "好友看得到你的狀態了" : "好友看不到你的狀態了");
    if (act === "accept") return call("friend_respond", { p_other: el.dataset.id, p_accept: true }, "成為好友了！");
    if (act === "decline") return call("friend_respond", { p_other: el.dataset.id, p_accept: false }, "已拒絕");
    if (act === "cancel") return call("friend_remove", { p_other: el.dataset.id }, "已取消邀請");
    if (act === "remove") {
      if (!confirm(`要把「${el.dataset.name}」從好友移除嗎？`)) return;
      return call("friend_remove", { p_other: el.dataset.id }, "已移除好友");
    }
  }

  function openPanel() {
    ensureUi();
    FR.open = true;
    FR.msg = "";
    document.getElementById("fr-overlay").hidden = false;
    render();
    loadAll();
    clearInterval(FR.timer);
    clearInterval(FR.tick);
    FR.timer = setInterval(loadAll, 30000);
    FR.tick = setInterval(tickLive, 1000);
  }

  function closePanel() {
    FR.open = false;
    clearInterval(FR.timer);
    clearInterval(FR.tick);
    const ov = document.getElementById("fr-overlay");
    if (ov) ov.hidden = true;
  }

  document.addEventListener("keydown", e => { if (e.key === "Escape" && FR.open) closePanel(); });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureUi);
  else ensureUi();

  window.FriendsPanel = { open: openPanel, close: closePanel, reload: loadAll, state: FR };

})();
