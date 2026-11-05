/* ⏱️ 任務限時挑戰：任務旁按 ⏱️ 自己訂時間，時限內完成拿額外星屑，超時也有一點點
   資料在 sql/2026-11-05_村莊成長_限時挑戰.sql */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const C = { active: {}, skew: 0, wins: 0, tries: 0, ready: false };

  async function load() {
    const { data, error } = await db.rpc("challenge_list");
    if (error) { C.err = error.message; return; }
    C.ready = true; C.err = null;
    C.skew = new Date(data.now).getTime() - Date.now();
    C.active = {}; (data.active || []).forEach(a => { C.active[String(a.task_id)] = a; });
    C.wins = data.wins; C.tries = data.tries;
    decorate();
  }
  const now = () => Date.now() + C.skew;
  const fmt = s => { const a = Math.abs(s); return `${s < 0 ? "-" : ""}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`; };

  /* 在每個任務的按鈕列加 ⏱️，有挑戰的任務加倒數 */
  function decorate() {
    document.querySelectorAll(".task-item[data-task-id]").forEach(el => {
      const id = el.dataset.taskId, act = el.querySelector(".task-actions"), a = C.active[id];
      if (act && !act.querySelector(".ch-btn") && !el.classList.contains("completed")) {
        const b = document.createElement("button");
        b.className = "ch-btn"; b.type = "button"; b.title = "限時挑戰"; b.textContent = "⏱️"; b.dataset.ch = id;
        act.prepend(b);
      }
      let badge = el.querySelector(".ch-badge");
      if (a && !el.classList.contains("completed")) {
        if (!badge) {
          badge = document.createElement("button");
          badge.type = "button"; badge.className = "ch-badge"; badge.dataset.chx = id; badge.title = "點一下取消挑戰";
          (el.querySelector(".task-title") || el.querySelector(".task-main") || el).appendChild(badge);
        }
        const left = Math.round((new Date(a.deadline).getTime() - now()) / 1000);
        badge.textContent = left >= 0 ? `⏱️ ${fmt(left)}` : `⏰ 超時 ${fmt(-left)}`;
        badge.classList.toggle("over", left < 0);
        badge.classList.toggle("hurry", left >= 0 && left < 120);
      } else if (badge) badge.remove();
    });
  }

  function picker(id) {
    const el = document.querySelector(`.task-item[data-task-id="${id}"]`);
    const title = el ? (el.querySelector(".task-title") || el).textContent.replace(/⏱️.*$/, "").trim() : "";
    const m = document.createElement("div");
    m.className = "vg-modal";
    m.innerHTML = `<div class="vg-card"><div class="vg-title">⏱️ 限時挑戰</div><p class="vg-note">「${esc(title.slice(0, 40))}」</p>
      <p class="vg-note">自己訂一個時間，在時限內打勾完成就拿額外星屑（時間越長越多，30 分鐘以上再送扭蛋幣）。超時也沒關係，完成一樣有一點點。</p>
      <div class="ch-chips">${[10, 15, 25, 30, 45, 60, 90].map(n => `<button type="button" data-chm="${n}">${n} 分</button>`).join("")}</div>
      <div class="tm-own"><input id="ch-min" type="number" min="5" max="240" placeholder="自訂分鐘（5～240）"><button type="button" class="btn btn-small btn-primary" data-chm="own">開始</button></div>
      ${C.active[id] ? `<button type="button" class="btn" data-chc="1" style="width:100%;margin-top:8px">取消目前的挑戰</button>` : ""}
      <p class="vg-note" style="margin-top:10px">🏆 挑戰成功 ${C.wins} 次／共 ${C.tries} 次</p>
      <button type="button" class="btn" data-vx="1" style="width:100%">關閉</button></div>`;
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-vx]")) return m.remove();
      if (e.target.closest("[data-chc]")) { const { error } = await db.rpc("challenge_cancel", { p_task_id: Number(id) }); if (error) return toast(error.message); m.remove(); toast("已取消挑戰"); return load(); }
      const b = e.target.closest("[data-chm]");
      if (!b) return;
      const n = b.dataset.chm === "own" ? Number(m.querySelector("#ch-min").value) : Number(b.dataset.chm);
      if (!(n >= 5 && n <= 240)) return toast("時間要在 5～240 分鐘之間");
      const { error } = await db.rpc("challenge_start", { p_task_id: Number(id), p_minutes: n });
      if (error) return toast(error.message);
      m.remove(); toast(`⏱️ 挑戰開始！${n} 分鐘內完成它`); load();
    });
    document.body.appendChild(m);
  }

  /* 任務打勾時結算 */
  function wrapToggle() {
    if (typeof window.toggleTask !== "function" || window.toggleTask.__chal) return;
    const orig = window.toggleTask;
    const wrapped = async function (taskId, completed) {
      const had = completed && C.active[String(taskId)];
      const r = await orig.apply(this, arguments);
      if (had) {
        const { data } = await db.rpc("challenge_finish", { p_task_id: Number(taskId) });
        if (data && data.had) {
          const used = `${Math.floor(data.used / 60)} 分 ${data.used % 60} 秒`;
          toast(data.ok ? `🏆 限時挑戰成功！用了 ${used}・✨ +${data.stardust}${data.coin ? "・🪙 扭蛋幣 +1" : ""}` : `⏰ 超時了，但還是完成了！✨ +${data.stardust}`);
        }
        load();
      }
      return r;
    };
    wrapped.__chal = true;
    if (orig.__mon) wrapped.__mon = true;
    window.toggleTask = wrapped;
  }

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-ch],[data-chx]");
    if (!b || !hasDb()) return;
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.ch) return picker(b.dataset.ch);
    if (b.dataset.chx && confirm("取消這個任務的限時挑戰？")) { await db.rpc("challenge_cancel", { p_task_id: Number(b.dataset.chx) }); load(); }
  }, true);

  const st = document.createElement("style");
  st.textContent = `
    .ch-btn { opacity: .75; }
    .ch-badge { display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 99px; border: 0; font-size: 11.5px; font-weight: 800; background: rgba(124,92,255,.25); color: inherit; cursor: pointer; font-variant-numeric: tabular-nums; vertical-align: middle; }
    .ch-badge.hurry { background: rgba(255,170,60,.35); animation: chBlink 1s ease-in-out infinite; } .ch-badge.over { background: rgba(248,81,73,.3); }
    @keyframes chBlink { 50% { opacity: .55; } }
    .ch-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
    .ch-chips button { border: 1px solid rgba(127,127,127,.4); background: transparent; color: inherit; border-radius: 99px; padding: 6px 12px; cursor: pointer; font: inherit; font-size: 13px; }
    .ch-chips button:hover { background: #7c5cff; border-color: #7c5cff; color: #fff; }
  `;
  document.head.appendChild(st);

  (function boot(n) {
    if (!hasDb()) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; }
    load(); wrapToggle();
    setInterval(() => { if (!document.hidden) { decorate(); wrapToggle(); } }, 1000);
    setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);
    const list = document.getElementById("task-list");
    if (list) new MutationObserver(() => { if (C.ready) decorate(); }).observe(list, { childList: true });
  })(0);
})();
