/* =========================================================
   📚 讀書與自律：知識卡、今日主線連擊、休息券、專注連擊、技能樹、一起專注房間、全服世界王
   資料庫：sql/2026-10-23_讀書與自律.sql
   畫面：
     專注頁：連擊提示、寫知識卡、複習知識卡、一起專注房間
     今日頁：主線連擊＋休息券
     冒險 → 角色：技能樹（rpg.js 呼叫 StudyGame.skillHtml()）
     冒險 → 每週王：世界王（rpg.js 呼叫 StudyGame.worldHtml()）
========================================================= */
(function () {

  const STUDY_JS_VERSION = "2026-10-23 v1";
  const IMG = "img/study/";
  const ST_IMG = new Set(["world_chronos", "world_void", "world_kraken", "world_titan", "kcard"]);   /* 有圖再加：world_chronos、world_void、world_kraken、world_titan */

  const ST = {
    kc: null, combo: null, room: null, ml: null, rest: null, skill: null, world: null,
    pending: null,          // 剛結束的專注：{ id, subject }，等著寫知識卡
    review: null,           // 複習中：{ list, i, flipped }
    deck: false, restOpen: false, busy: false, triedSkill: false, triedWorld: false, setup: false
  };

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = msg => (typeof showToast === "function" ? showToast(msg) : alert(msg));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const gameOn = () => (typeof gameIsOn === "function" ? gameIsOn() : document.body.classList.contains("game-mode-on"));
  const art = (key, emoji, cls) => ST_IMG.has(key) ? `<img class="st-img ${cls || ""}" src="${IMG}${key}.webp" alt="">` : `<span class="st-emo ${cls || ""}">${emoji}</span>`;
  const avatar = (cls, frame, size) => (window.FunGame && window.FunGame.avatar ? window.FunGame.avatar(cls, frame, size) : "🙂");
  const chip = k => (window.GrowthGame ? window.GrowthGame.titleChip(k) : "");
  const isSetupErr = e => /function|schema cache|PGRST|does not exist/i.test((e && e.message) || "");
  const rerenderRpg = tabs => { if (window.RpgGame && tabs.includes(window.RpgGame.state.tab)) window.RpgGame.render(); };
  const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const STEP_NAME = ["第 1 天", "第 3 天", "第 7 天", "第 14 天", "第 30 天", "第 60 天"];

  async function call(name, args) {
    const { data, error } = await db.rpc(name, args || {});
    if (error) { if (isSetupErr(error)) ST.setup = true; else console.warn(name, error); return null; }
    return data;
  }
  async function act(name, args, okMsg) {
    if (ST.busy) return null;
    ST.busy = true;
    try {
      const { data, error } = await db.rpc(name, args || {});
      if (error) { toast("❌ " + error.message); return null; }
      if (okMsg) toast(okMsg);
      return data;
    } finally { ST.busy = false; }
  }


  /* =========================================================
     專注頁：連擊、知識卡、房間
  ========================================================= */

  async function loadFocusSide() {
    if (!hasDb()) return;
    const [kc, room] = await Promise.all([call("kcard_status"), call("room_status")]);
    if (kc) ST.kc = kc;
    if (room) { room._loadedAt = Date.now(); ST.room = room; }
    renderFocus();
  }

  async function claimBonus(showToasts) {
    const d = await call("focus_bonus_claim");
    if (!d) return;
    ST.combo = { combo: d.combo, last: d.last_end ? new Date(d.last_end).getTime() : null, skew: Date.now() - new Date(d.now).getTime() };
    if (showToasts) {
      (d.new || []).forEach((x, i) => setTimeout(() => toast(x.kind === "combo"
        ? `⚡ 專注連擊 ×${x.combo}！星屑 +${x.dust}` : `📚 和 ${x.with} 位室友一起專注！星屑 +${x.dust}`), 1500 + i * 2600));
      if ((d.new || []).length && window.FunGame) window.FunGame.reload();
    }
    renderFocus();
  }

  function comboHtml() {
    const c = ST.combo;
    if (!c || !c.last || !c.combo) return "";
    let running = false;
    try { running = typeof focusTimer !== "undefined" && !!focusTimer; } catch (e) {}
    const left = 10 * 60000 - (Date.now() - c.skew - c.last);
    if (running) return c.combo >= 1 && left > -60 * 60000 ? `<div class="st-combo on">⚡ 連擊進行中：這輪專注滿 20 分鐘就是第 ${c.combo + 1} 輪</div>` : "";
    if (left <= 0) return "";
    const nextBonus = Math.min(c.combo, 3);
    return `<div class="st-combo">⚡ 連擊 ×${c.combo}！<b>${mmss(left)}</b> 內開始下一輪就能接上（下一輪星屑 +${nextBonus}）</div>`;
  }

  function cardPromptHtml() {
    const p = ST.pending;
    if (!p) return "";
    return `<div class="st-prompt"><b>📝 剛剛的「${esc(p.subject)}」學到什麼？</b>
      <input id="st-kc-q" class="tm-input" maxlength="200" placeholder="問題（可以不寫）：例如 現在完成式什麼時候用？">
      <textarea id="st-kc-note" class="tm-input st-area" maxlength="500" placeholder="重點：用自己的話寫一句就好"></textarea>
      <div class="rp-row"><button type="button" class="btn btn-primary btn-small" data-st="kcsave">🃏 做成知識卡</button>
      <button type="button" class="btn btn-small" data-st="kcskip">這次不寫</button></div>
      <p class="st-sub">之後會在第 1、3、7、14、30、60 天提醒你複習，記得就往下一階。</p></div>`;
  }

  function kcHtml() {
    const k = ST.kc;
    if (!k) return "";
    const capLeft = Math.max(0, k.reward_cap - k.rewarded_today);
    return `<div class="st-kc"><div class="st-row">${art("kcard", "🃏", "st-ic")}<div class="st-grow"><b>知識卡</b>
        <span class="st-sub">共 ${k.total} 張・熟記 ${k.mastered} 張・今天複習 ${k.reviewed_today} 張</span></div>
        <button type="button" class="btn btn-small ${k.due_count ? "btn-primary" : ""}" data-st="review" ${k.due_count ? "" : "disabled"}>${k.due_count ? `複習 ${k.due_count} 張` : "今天複習完了"}</button></div>
      ${k.total ? `<button type="button" class="st-link" data-st="deck">📒 打開卡冊（${k.subjects.map(s => `${esc(s.subject)} ${s.n}`).join("・")}）</button>` : `<p class="st-sub">專注 20 分鐘以上結束後，就能把學到的寫成卡。</p>`}
      ${k.due_count && capLeft ? `<p class="st-sub">今天記得的卡還能拿 ${capLeft} 顆星屑。</p>` : ""}</div>`;
  }

  function roomHtml() {
    const r = ST.room;
    if (!r) return "";
    if (!r.room) {
      return `<div class="st-room"><b>📚 一起專注房間</b>
        <p class="st-sub">開一間自習室，把房間碼給朋友。同時在專注的人越多，大家每輪拿到的星屑越多。</p>
        <div class="rp-row"><input id="st-room-name" class="tm-input st-grow" maxlength="16" placeholder="房間名稱，例如 期中衝刺">
          <button type="button" class="btn btn-primary btn-small" data-st="roomnew">開房間</button></div>
        <div class="rp-row"><input id="st-room-code" class="tm-input st-grow" maxlength="6" placeholder="輸入 6 碼房間碼">
          <button type="button" class="btn btn-small" data-st="roomjoin">加入</button></div></div>`;
    }
    const skew = Date.now() - new Date(r.now).getTime();
    const loadedAt = r._loadedAt || Date.now();
    const running = (r.members || []).filter(m => m.state === "running").length;
    const list = (r.members || []).map(m => {
      const live = m.state === "running" ? m.live_ms + (Date.now() - loadedAt) : m.live_ms;
      return `<div class="st-mem ${m.state}">${avatar(m.class, m.frame, 36)}<div class="st-grow"><b>${esc(m.name)}${m.me ? "（你）" : ""}${chip(m.title)}</b>
        <span class="st-sub">今天專注 ${m.today_min} 分</span></div>
        <span class="st-live">${m.state === "running" ? `🔥 ${mmss(live)}` : m.state === "paused" ? `⏸ ${mmss(live)}` : "休息中"}</span></div>`;
    }).join("");
    void skew;
    return `<div class="st-room in"><div class="st-row"><b class="st-grow">📚 ${esc(r.room.name)}</b>
        <button type="button" class="st-code" data-st="copycode" data-v="${esc(r.room.code)}">房間碼 ${esc(r.room.code)} 📋</button></div>
      <p class="st-sub">${running >= 2 ? `🔥 現在有 ${running} 人一起專注！` : "跟室友同時專注（重疊一半以上），每輪 +2 星屑，3 人以上 +3。"}</p>
      ${list}
      <button type="button" class="btn btn-small" data-st="roomleave">離開房間</button></div>`;
  }

  function renderFocus() {
    const anchor = document.getElementById("ev-exp") || document.getElementById("focus-buttons");
    if (!anchor) return;
    let box = document.getElementById("st-focus");
    if (!box) {
      box = document.createElement("div");
      box.id = "st-focus";
      anchor.after(box);
    }
    const show = gameOn() && hasDb() && !ST.setup;
    box.hidden = !show;
    if (!show) return;
    /* 正在打字就不要重畫，免得字不見 */
    const typing = document.activeElement && box.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (typing) { const c = box.querySelector(".st-combo"); if (c) c.outerHTML = comboHtml() || "<div class='st-combo' hidden></div>"; return; }
    box.innerHTML = comboHtml() + cardPromptHtml() + kcHtml() + roomHtml();
  }

  /* 知識卡：複習 */
  function openReview() {
    const list = (ST.kc && ST.kc.due) || [];
    if (!list.length) return;
    ST.review = { list, i: 0, flipped: false, ok: 0 };
    renderReview();
  }

  function renderReview() {
    let ov = document.getElementById("st-review");
    const r = ST.review;
    if (!r) { if (ov) ov.remove(); return; }
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "st-review";
      ov.className = "st-modal";
      document.body.appendChild(ov);
    }
    if (r.i >= r.list.length) {
      ov.innerHTML = `<div class="st-modal-card"><h3>🎉 複習完了！</h3><p>這次記得 ${r.ok} / ${r.list.length} 張。</p>
        <button type="button" class="btn btn-primary" data-st="rvclose">好</button></div>`;
      return;
    }
    const c = r.list[r.i];
    const front = c.question ? esc(c.question) : `還記得「${esc(c.subject)}」這次學了什麼嗎？`;
    ov.innerHTML = `<div class="st-modal-card"><div class="st-rv-top"><span>${r.i + 1} / ${r.list.length}</span><button type="button" class="st-x" data-st="rvclose">✕</button></div>
      <div class="st-flip ${r.flipped ? "on" : ""}" data-st="flip">
        <div class="st-face front"><span class="st-tag">${esc(c.subject)}・${STEP_NAME[c.step] || ""}</span><p>${front}</p><span class="st-sub">點卡片翻面</span></div>
        <div class="st-face back"><span class="st-tag">${esc(c.subject)}</span><p>${esc(c.note)}</p><span class="st-sub">${new Date(c.created_at).toLocaleDateString("zh-TW")} 寫的</span></div>
      </div>
      ${r.flipped ? `<div class="rp-row st-rv-btns"><button type="button" class="btn" data-st="rvno">😵 忘了</button><button type="button" class="btn btn-primary" data-st="rvyes">😎 記得</button></div>` : ""}</div>`;
  }

  async function answerReview(ok) {
    const r = ST.review;
    const c = r.list[r.i];
    const d = await act("kcard_review", { p_id: c.id, p_ok: ok });
    if (!d) return;
    if (ok) r.ok += 1;
    if (d.dust) toast("🃏 記得！星屑 +1");
    r.i += 1; r.flipped = false;
    renderReview();
  }

  /* 知識卡：卡冊 */
  function renderDeck() {
    let ov = document.getElementById("st-deck");
    if (!ST.deck) { if (ov) ov.remove(); return; }
    if (!ov) { ov = document.createElement("div"); ov.id = "st-deck"; ov.className = "st-modal"; document.body.appendChild(ov); }
    const cards = (ST.kc && ST.kc.cards) || [];
    const groups = {};
    cards.forEach(c => { (groups[c.subject] = groups[c.subject] || []).push(c); });
    ov.innerHTML = `<div class="st-modal-card st-deck"><div class="st-rv-top"><b>📒 知識卡冊</b><button type="button" class="st-x" data-st="deckclose">✕</button></div>
      ${Object.entries(groups).map(([s, list]) => `<div class="st-sec">${esc(s)}（${list.length}）</div>${list.map(c => `<div class="st-dc">
        <div class="st-grow">${c.question ? `<b>${esc(c.question)}</b>` : ""}<span>${esc(c.note)}</span>
        <span class="st-sub">${STEP_NAME[c.step]}・下次 ${c.due}・複習 ${c.reviews} 次</span></div>
        <button type="button" class="st-x" data-st="kcdel" data-v="${c.id}" title="刪除">🗑️</button></div>`).join("")}`).join("") || "<p>還沒有卡片。</p>"}</div>`;
  }


  /* =========================================================
     今日頁：主線連擊＋休息券
  ========================================================= */

  async function loadToday() {
    if (!hasDb()) return;
    const [ml, rest] = await Promise.all([call("mainline_status"), call("rest_status")]);
    if (ml) {
      ST.ml = ml;
      (ml.new || []).forEach((n, i) => setTimeout(() => toast(`🎯 主線連擊 ${n.days} 天！獲得寶箱`), 1200 + i * 2600));
      if ((ml.new || []).length && window.FunGame) window.FunGame.reload();
    }
    if (rest) ST.rest = rest;
    renderToday();
  }

  function renderToday() {
    const body = document.getElementById("mainline-body");
    if (!body) return;
    let box = document.getElementById("st-ml");
    if (!box) {
      box = document.createElement("div");
      box.id = "st-ml";
      box.className = "st-ml";
      body.after(box);
    }
    const show = gameOn() && hasDb() && ST.ml && !ST.setup;
    box.hidden = !show;
    if (!show) return;
    const m = ST.ml;
    const r = ST.rest || { left: 0, missed: [] };
    const next = [3, 7, 14, 30].find(x => m.streak < x);
    const missed = (r.missed || []).slice(-7);
    box.innerHTML = `<div class="st-row"><span class="st-fire ${m.streak ? "on" : ""}">🎯</span>
      <div class="st-grow"><b>主線連擊 ${m.streak} 天</b><span class="st-sub">${m.today_done ? "今天的主線完成了 ✓ 星屑 +2" : m.today_set ? "完成今天的主線就能接上連擊（星屑 +2）" : "先設定今天的主線吧"}${next ? `・連續 ${next} 天送寶箱` : ""}</span></div>
      <button type="button" class="st-rest" data-st="rest">🛌 休息券 ${r.left}</button></div>
      ${ST.restOpen ? `<div class="st-restbox"><p class="st-sub">休息券每月 2 張：補簽這個月沒簽到的一天（免費），連續簽到和主線連擊都會接上。生病、考試週就用吧，休息也是冒險的一部分。</p>
        ${r.left && missed.length ? `<div class="rp-row">${missed.map(d => `<button type="button" class="btn btn-small" data-st="restuse" data-v="${d}">${d.slice(5).replace("-", "/")}</button>`).join("")}</div>`
          : `<p class="st-sub">${r.left ? "這個月最近沒有漏簽的日子 👍" : "這個月的休息券用完了。"}</p>`}</div>` : ""}`;
  }


  /* =========================================================
     冒險：技能樹、世界王
  ========================================================= */

  async function loadSkill() { ST.triedSkill = true; const d = await call("skill_status"); if (d) ST.skill = d; rerenderRpg(["hero"]); }
  async function loadWorld() {
    ST.triedWorld = true;
    const d = await call("world_status");
    if (d) {
      ST.world = d;
      if ((d.new || []).length) { toast("🌍 世界王被打倒了！你拿到星光寶箱和限定召喚券"); if (window.FunGame) window.FunGame.reload(); }
    }
    rerenderRpg(["boss"]);
  }

  function skillHtml() {
    if (!hasDb() || ST.setup) return "";
    const s = ST.skill;
    if (!s) { if (!ST.triedSkill) loadSkill(); return ""; }
    const branches = {};
    (s.catalog || []).forEach(k => { (branches[k.branch] = branches[k.branch] || []).push(k); });
    return `<div class="card rp-card"><div class="st-row"><h3 class="st-grow">🌳 技能樹</h3><span class="st-pts">技能點 <b>${s.points}</b></span></div>
      <p class="rp-note">每升 1 級拿 1 點（現在 Lv${s.level}，用了 ${s.spent} 點）。每個技能最多 3 級。</p>
      ${Object.entries(branches).map(([b, list]) => `<div class="st-sec">${esc(b)}</div><div class="st-skills">${list.map(k => {
        const lv = (s.skills || {})[k.key] || 0;
        return `<div class="st-skill ${lv ? "on" : ""}"><span class="st-skill-emo">${k.emoji}</span><b>${esc(k.name)}</b><span class="st-sub">${esc(k.desc)}</span>
          <div class="st-dots">${[1, 2, 3].map(i => `<i class="${i <= lv ? "on" : ""}"></i>`).join("")}</div>
          <button type="button" class="btn btn-small ${s.points && lv < 3 ? "btn-primary" : ""}" data-st="skillup" data-v="${k.key}" ${s.points && lv < 3 ? "" : "disabled"}>${lv >= 3 ? "滿級" : "＋1"}</button></div>`;
      }).join("")}</div>`).join("")}
      ${s.spent ? `<button type="button" class="btn btn-small" data-st="skillreset">重置技能（20 星屑）</button>` : ""}</div>`;
  }

  function worldHtml() {
    if (!hasDb() || ST.setup) return "";
    const w = ST.world;
    if (!w) { if (!ST.triedWorld) loadWorld(); return ""; }
    const b = w.boss;
    const info = (w.catalog || []).find(x => x.key === b.boss_key) || { name: "世界王", emoji: "🌍", desc: "" };
    const left = Math.max(0, b.hp - b.dmg);
    const pct = Math.round(left / b.hp * 100);
    const dead = !!b.killed_at;
    return `<div class="card rp-card st-world ${dead ? "dead" : ""}"><div class="st-row">${art(b.boss_key, info.emoji, "st-world-ic")}
        <div class="st-grow"><h3>🌍 世界王・${esc(info.name)}</h3><span class="st-sub">${b.month.replace("-", " 年 ")} 月・全服 ${w.players} 人一起打</span></div></div>
      <p class="rp-note">${esc(info.desc)}</p>
      <div class="rp-hp st-whp"><div class="rp-hp-bar" style="width:${pct}%"></div><span>${dead ? "全服打倒了！🎉" : `${left.toLocaleString()} / ${b.hp.toLocaleString()}`}</span></div>
      <p class="rp-note">${w.me ? `你打了 ${Number(w.me.dmg).toLocaleString()} 傷害（第 ${w.my_rank} 名）。` : "你還沒出手。"}打每週王的每一下也會打在世界王身上。打倒後，有出力的人都拿星光寶箱＋限定召喚券。</p>
      <div class="st-wtop">${(w.top || []).slice(0, 5).map((t, i) => `<div class="st-wrow ${t.me ? "me" : ""}"><span>${i + 1}</span>${avatar(t.class, t.frame, 28)}<span class="st-wname">${esc(t.name)}${chip(t.title)}</span><b>${Number(t.dmg).toLocaleString()}</b></div>`).join("")}</div></div>`;
  }


  /* =========================================================
     點擊、樣式、接上網站
  ========================================================= */

  async function onClick(e) {
    const el = e.target.closest("[data-st]");
    if (!el) return;
    const a = el.dataset.st, v = el.dataset.v;
    const val = id => (document.getElementById(id) || {}).value || "";

    if (a === "kcsave") {
      const d = await act("kcard_add", { p_session: ST.pending.id, p_subject: ST.pending.subject, p_question: val("st-kc-q"), p_note: val("st-kc-note") }, "🃏 做成知識卡了！明天會提醒你複習");
      if (d) { ST.pending = null; loadFocusSide(); }
    }
    else if (a === "kcskip") { ST.pending = null; renderFocus(); }
    else if (a === "review") openReview();
    else if (a === "flip") { if (ST.review) { ST.review.flipped = !ST.review.flipped; renderReview(); } }
    else if (a === "rvyes") answerReview(true);
    else if (a === "rvno") answerReview(false);
    else if (a === "rvclose") { ST.review = null; renderReview(); loadFocusSide(); }
    else if (a === "deck") { ST.deck = true; renderDeck(); }
    else if (a === "deckclose") { ST.deck = false; renderDeck(); }
    else if (a === "kcdel") { if (!confirm("刪掉這張卡？")) return; const d = await act("kcard_delete", { p_id: Number(v) }); if (d) { await loadFocusSide(); renderDeck(); } }
    else if (a === "roomnew") { const d = await act("room_create", { p_name: val("st-room-name") }); if (d) { toast(`📚 房間開好了！房間碼 ${d.code}`); loadFocusSide(); } }
    else if (a === "roomjoin") { const d = await act("room_join", { p_code: val("st-room-code") }, "📚 進房間了！一起加油"); if (d) loadFocusSide(); }
    else if (a === "roomleave") { if (!confirm("離開這個房間？")) return; const d = await act("room_leave", {}); if (d) loadFocusSide(); }
    else if (a === "copycode") { try { await navigator.clipboard.writeText(v); toast("房間碼複製好了，傳給朋友吧"); } catch (err) { toast(`房間碼：${v}`); } }
    else if (a === "rest") { ST.restOpen = !ST.restOpen; renderToday(); }
    else if (a === "restuse") {
      if (!confirm(`用一張休息券補簽 ${v}？`)) return;
      const d = await act("rest_use", { p_date: v }, "🛌 補簽好了，好好休息");
      if (d) { ST.restOpen = false; await loadToday(); if (typeof loadGameCheckin === "function") loadGameCheckin(); }
    }
    else if (a === "skillup") { const d = await act("skill_up", { p_skill: v }); if (d) { toast(`🌳 技能升到 Lv${d.lv}`); loadSkill(); } }
    else if (a === "skillreset") { if (!confirm("重置所有技能？要花 20 星屑，點數會全部退回。")) return; const d = await act("skill_reset", {}, "技能重置了"); if (d) loadSkill(); }
  }

  function injectStyle() {
    if (document.getElementById("st-style")) return;
    const css = document.createElement("style");
    css.id = "st-style";
    css.textContent = `
      body:not(.game-mode-on) #st-focus, body:not(.game-mode-on) #st-ml { display: none !important; }
      .st-emo { display: inline-flex; align-items: center; justify-content: center; line-height: 1; }
      .st-img { object-fit: contain; }
      .st-sub { font-size: 12px; opacity: .72; }
      .st-row { display: flex; align-items: center; gap: 10px; }
      .st-grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .st-ic { width: 36px; height: 36px; font-size: 28px; }
      .st-sec { font-weight: 800; margin: 12px 0 6px; }
      .st-link { border: 0; background: transparent; color: inherit; opacity: .85; text-align: left; padding: 6px 0; cursor: pointer; font-size: 13px; text-decoration: underline; }
      #st-focus > div { margin: 10px 0; padding: 12px; border-radius: 14px; background: rgba(127,127,127,.07); border: 1px solid rgba(127,127,127,.15); }
      .st-combo { background: linear-gradient(90deg, rgba(255,193,7,.18), rgba(255,112,67,.14)) !important; font-size: 14px; }
      .st-combo.on { background: rgba(108,75,216,.12) !important; }
      .st-prompt { background: rgba(102,187,106,.1) !important; border-color: rgba(102,187,106,.4) !important; }
      .st-area { min-height: 70px; resize: vertical; font-family: inherit; }
      .st-mem { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid rgba(127,127,127,.12); }
      .st-mem.running .st-live { color: #ff7043; font-weight: 800; }
      .st-live { font-variant-numeric: tabular-nums; font-size: 14px; }
      .st-code { border: 1px dashed rgba(127,127,127,.5); background: transparent; color: inherit; border-radius: 8px; padding: 4px 8px; font-weight: 800; letter-spacing: 1px; cursor: pointer; }
      .st-room.in { background: rgba(255,112,67,.06) !important; }

      .st-modal { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; padding: 16px; }
      .st-modal-card { width: min(380px, 100%); max-height: 86vh; overflow: auto; background: var(--card-bg, #1c1f2b); color: inherit; border-radius: 18px; padding: 16px; text-align: center; }
      .st-rv-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
      .st-x { border: 0; background: transparent; color: inherit; font-size: 16px; cursor: pointer; }
      .st-flip { position: relative; height: 260px; perspective: 900px; cursor: pointer; }
      .st-face { position: absolute; inset: 0; border-radius: 16px; padding: 18px; display: flex; flex-direction: column; justify-content: center; gap: 10px;
        backface-visibility: hidden; transition: transform .5s; box-sizing: border-box; color: #3d2c1a; background: linear-gradient(160deg, #fffaf0, #f3e4c3); border: 2px solid #c9a35b; }
      .st-face p { font-size: 17px; line-height: 1.6; margin: 0; white-space: pre-wrap; }
      .st-face.back { transform: rotateY(180deg); background: linear-gradient(160deg, #eef6ff, #d8e8fb); border-color: #6c9bd8; }
      .st-flip.on .front { transform: rotateY(180deg); } .st-flip.on .back { transform: rotateY(360deg); }
      .st-tag { align-self: center; font-size: 12px; padding: 2px 10px; border-radius: 99px; background: rgba(0,0,0,.08); }
      .st-rv-btns { justify-content: center; margin-top: 12px; } .st-rv-btns .btn { flex: 1; }
      .st-deck { text-align: left; }
      .st-dc { display: flex; gap: 8px; padding: 8px 0; border-bottom: 1px solid rgba(127,127,127,.15); font-size: 14px; }

      .st-ml { margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(108,75,216,.08); }
      .st-fire { font-size: 28px; filter: grayscale(1); opacity: .5; } .st-fire.on { filter: none; opacity: 1; }
      .st-rest { border: 1px solid rgba(127,127,127,.3); background: transparent; color: inherit; border-radius: 99px; padding: 5px 10px; font-size: 12px; cursor: pointer; white-space: nowrap; }
      .st-restbox { margin-top: 8px; }

      .st-pts { font-size: 13px; } .st-pts b { font-size: 22px; color: #6c4bd8; }
      .st-skills { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
      .st-skill { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 10px 4px; border-radius: 12px; background: rgba(127,127,127,.07); text-align: center; font-size: 13px; }
      .st-skill.on { background: rgba(108,75,216,.12); }
      .st-skill .st-sub { font-size: 10px; line-height: 1.3; min-height: 26px; }
      .st-skill-emo { font-size: 26px; }
      .st-dots { display: flex; gap: 4px; } .st-dots i { width: 9px; height: 9px; border-radius: 50%; background: rgba(127,127,127,.3); } .st-dots i.on { background: #6c4bd8; }

      .st-world { background: linear-gradient(160deg, rgba(66,165,245,.12), rgba(171,71,188,.12)); }
      .st-world-ic { width: 72px; height: 72px; font-size: 54px; animation: rp-bob 2.6s ease-in-out infinite; }
      .st-world.dead .st-world-ic { filter: grayscale(1); opacity: .5; animation: none; }
      .st-whp .rp-hp-bar { background: linear-gradient(90deg, #42a5f5, #ab47bc); }
      .st-wtop { display: flex; flex-direction: column; gap: 2px; }
      .st-wrow { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 3px 4px; border-radius: 8px; }
      .st-wrow.me { background: rgba(108,75,216,.12); }
      .st-wname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    `;
    document.head.appendChild(css);
  }

  /* 結束專注：記下這次是哪一筆，等著寫知識卡；順便結算連擊和房間 */
  if (typeof window.finishFocus === "function") {
    const base = window.finishFocus;
    window.finishFocus = async function () {
      let subject = null;
      try { subject = typeof focusTimer !== "undefined" && focusTimer ? focusTimer.subject : null; } catch (e) {}
      const r = await base.apply(this, arguments);
      if (hasDb() && subject) {
        const { data } = await db.from("focus_sessions").select("id, subject, duration_seconds").eq("user_id", currentUser.id)
          .order("id", { ascending: false }).limit(1).maybeSingle();
        if (data && data.duration_seconds >= 600) ST.pending = { id: data.id, subject: data.subject };
      }
      await claimBonus(true);
      loadFocusSide();
      return r;
    };
  }
  if (typeof window.applyPage === "function") {
    const base = window.applyPage;
    window.applyPage = function (name) {
      const r = base.apply(this, arguments);
      if (name === "focus" && hasDb()) { loadFocusSide(); claimBonus(false); }
      if (name === "today" && hasDb()) loadToday();
      return r;
    };
  }
  if (typeof window.renderMainline === "function") {
    const base = window.renderMainline;
    window.renderMainline = function () {
      const r = base.apply(this, arguments);
      try { renderToday(); if (hasDb()) setTimeout(loadToday, 300); } catch (e) { console.warn(e); }
      return r;
    };
  }
  if (typeof window.renderGameModeToggle === "function") {
    const base = window.renderGameModeToggle;
    window.renderGameModeToggle = function () {
      const r = base.apply(this, arguments);
      try { renderFocus(); renderToday(); } catch (e) { console.warn(e); }
      return r;
    };
  }

  function boot() {
    injectStyle();
    document.addEventListener("click", onClick);
    /* 每秒更新連擊倒數和房間計時；房間每 20 秒重新讀一次 */
    setInterval(() => {
      const box = document.getElementById("st-focus");
      if (!box || box.hidden) return;
      const c = box.querySelector(".st-combo");
      if (c) c.outerHTML = comboHtml() || "<div class='st-combo' hidden></div>";
      box.querySelectorAll(".st-mem.running .st-live").forEach((el, i) => {
        const m = ((ST.room && ST.room.members) || []).filter(x => x.state === "running")[i];
        if (m) el.textContent = `🔥 ${mmss(m.live_ms + (Date.now() - (ST.room._loadedAt || Date.now())))}`;
      });
    }, 1000);
    setInterval(async () => {
      if (!hasDb() || !ST.room || !ST.room.room) return;
      const r = await call("room_status");
      if (r) { r._loadedAt = Date.now(); ST.room = r; const typing = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName); if (!typing) renderFocus(); }
    }, 20000);
    let waited = 0;
    const wait = setInterval(() => {
      if (hasDb()) { clearInterval(wait); loadFocusSide(); claimBonus(false); loadToday(); }
      if (++waited > 60) clearInterval(wait);
    }, 1000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.StudyGame = { version: STUDY_JS_VERSION, skillHtml, worldHtml, reloadWorld: loadWorld, reloadSkill: loadSkill, state: ST };

})();
