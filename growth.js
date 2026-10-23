/* =========================================================
   🌱 成長系統：大地圖探索、會長大的小夥伴、壞習慣封印、怪怪稱號、好友賭約
   資料庫：sql/2026-10-23_成長系統.sql
   畫面：冒險 → 旅程（地圖、夥伴、封印、稱號）；冒險 → 小隊（好友賭約）
========================================================= */
(function () {

  const GROWTH_JS_VERSION = "2026-10-23 v2";
  const IMG = "img/growth/";

  /* 有圖的就加進來（放在 img/growth/），沒加的先用 emoji */
  const GR_IMG = new Set(["map_village", "map_forest", "map_swamp", "map_ruins", "map_oasis", "map_tundra",
    "map_volcano", "map_peak", "map_temple", "map_sky", "map_end",
    "buddy_egg", "buddy_baby", "buddy_teen", "buddy_wise", "buddy_strong", "buddy_lively", "buddy_guard",
    "buddy_wise_legend", "buddy_strong_legend", "buddy_lively_legend", "buddy_guard_legend"]);

  const BUDDY_STAGE = ["蛋", "寶寶", "少年", "成年", "傳說"];
  const BUDDY_FORM = {
    wise: { name: "智慧型", emoji: "🦉", why: "最常專注" },
    strong: { name: "力量型", emoji: "🦁", why: "最常完成任務" },
    lively: { name: "活力型", emoji: "🐬", why: "最常運動" },
    guard: { name: "守護型", emoji: "🐢", why: "最常打卡和簽到" }
  };
  const SEAL_PRESETS = [["🌙", "熬夜"], ["📱", "睡前滑手機"], ["🧋", "含糖飲料"], ["🍟", "吃宵夜"], ["🎮", "打電動太久"], ["🛋️", "拖延"]];
  const SEAL_MS = [3, 7, 14, 30, 60, 100];
  const BET_TYPE = { focus: ["專注", "分鐘"], tasks: ["完成任務", "個"], checkin: ["簽到", "天"] };

  const GR = { map: null, buddy: null, seal: null, title: null, bet: null, error: null, busy: false, tried: false, triedBet: false,
               sealPick: "🌙", betOpen: false };

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = msg => (typeof showToast === "function" ? showToast(msg) : alert(msg));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const art = (key, emoji, cls) => GR_IMG.has(key) ? `<img class="gr-img ${cls || ""}" src="${IMG}${key}.webp" alt="">` : `<span class="gr-emo ${cls || ""}">${emoji}</span>`;
  const hm = m => m >= 60 ? `${Math.floor(m / 60)} 小時${m % 60 ? ` ${m % 60} 分` : ""}` : `${m} 分鐘`;
  const ITEM_NAME = { stardust: "星屑", chest_wood: "木寶箱", chest_iron: "鐵寶箱", chest_gold: "金寶箱", chest_star: "星光寶箱", gacha_coin: "扭蛋幣", ticket_special: "特殊召喚券" };
  const rewardText = r => Object.entries(r || {}).filter(([, v]) => v > 0).map(([k, v]) => `${ITEM_NAME[k] || k} ×${v}`).join("、");
  const rerender = tabs => { if (window.RpgGame && tabs.includes(window.RpgGame.state.tab)) window.RpgGame.render(); };

  /* 稱號（給小隊、排行、動態牆用；資料庫的 title_catalog 和這裡一致） */
  const TITLES = {
    night_owl: ["夜行者", "🦉"], early_bird: ["晨型戰士", "🌅"], focus_demon: ["專注魔人", "🔥"], marathon: ["馬拉松選手", "🏃"],
    attendance: ["全勤王", "📅"], harvester: ["任務收割機", "🌾"], slayer: ["屠龍者", "🐉"], lucky_king: ["歐皇", "👑"],
    unlucky: ["非洲酋長", "🥁"], collector: ["收藏家", "🗃️"], butterfly: ["社交蝴蝶", "🦋"], daikichi: ["大吉體質", "🎋"],
    crow_friend: ["烏鴉之友", "🐦‍⬛"], explorer: ["天空旅人", "🏰"], sealer: ["封印大師", "🔒"], parent: ["夥伴之親", "🐣"],
    ghostbuster: ["捉鬼大師", "👻"], wanderer: ["世界盡頭", "🌅"], gambler: ["說到做到", "🤝"]
  };
  const titleChip = key => (key && TITLES[key]) ? `<span class="gr-title-chip">${TITLES[key][1]} ${TITLES[key][0]}</span>` : "";


  /* ---------- 資料 ---------- */

  async function loadAll() {
    if (!hasDb()) return;
    GR.tried = true;
    const [m, b, s, t] = await Promise.all([db.rpc("map_status"), db.rpc("buddy_status"), db.rpc("seal_status"), db.rpc("title_status")]);
    const err = [m, b, s, t].find(x => x.error);
    if (err) {
      GR.error = /map_status|buddy_status|seal_status|title_status|function|schema cache|PGRST/i.test(err.error.message || "") ? "setup" : err.error.message;
      rerender(["journey"]);
      return;
    }
    GR.error = null;
    GR.map = m.data; GR.buddy = b.data; GR.seal = s.data; GR.title = t.data;
    announce();
    rerender(["journey"]);
  }

  async function loadBets() {
    if (!hasDb()) return;
    GR.triedBet = true;
    const { data, error } = await db.rpc("bet_status");
    GR.bet = error ? { error: /bet_status|function|schema cache|PGRST/i.test(error.message || "") ? "setup" : error.message } : data;
    rerender(["team"]);
  }

  /* 剛解鎖的東西跳提示 */
  function announce() {
    const on = typeof gameIsOn === "function" ? gameIsOn() : document.body.classList.contains("game-mode-on");
    if (!on) return;
    const msgs = [];
    for (const n of (GR.map && GR.map.new) || []) msgs.push(`🗺️ 抵達「${GR.map.regions[n.idx].name}」！${rewardText(n.reward)}`);
    for (const n of (GR.seal && GR.seal.new) || []) msgs.push(`🔒「${n.seal}」封印 ${n.days} 天！${rewardText(n.reward)}`);
    for (const k of (GR.title && GR.title.new) || []) if (TITLES[k]) msgs.push(`🏷️ 拿到新稱號「${TITLES[k][0]}」！`);
    msgs.forEach((m, i) => setTimeout(() => toast(m), i * 2800));
    if (msgs.length && window.FunGame) window.FunGame.reload();
  }

  async function rpc(name, args, okMsg) {
    if (GR.busy) return null;
    GR.busy = true;
    try {
      const { data, error } = await db.rpc(name, args || {});
      if (error) { toast("❌ " + error.message); return null; }
      if (okMsg) toast(okMsg);
      return data;
    } finally { GR.busy = false; }
  }


  /* =========================================================
     🗺️ 大地圖
  ========================================================= */

  function mapHtml() {
    const m = GR.map;
    const R = m.regions;
    const cur = m.reached;
    const next = R[cur + 1];
    const pct = next ? Math.round((m.dist - R[cur].min) / (next.min - R[cur].min) * 100) : 100;
    const nodes = R.map((r, i) => {
      const state = i < cur ? "done" : i === cur ? "here" : "lock";
      return `<div class="gr-node ${state} ${i % 2 ? "r" : "l"}">
        <div class="gr-node-art">${state === "lock" ? `<span class="gr-emo gr-node-ic">❔</span>` : art(r.key, r.emoji, "gr-node-ic")}
          ${state === "here" ? `<span class="gr-you">${heroIcon()}</span>` : ""}</div>
        <div class="gr-node-txt"><b>${state === "lock" ? "？？？" : esc(r.name)}</b><span class="gr-sub">${hm(r.min)}</span></div></div>`;
    }).reverse().join("");
    return `<div class="card rp-card"><h3>🗺️ 大地圖</h3>
      <p class="rp-note">專注每一分鐘都是一步，完成一個任務算 10 分鐘的路。目前走了 <b>${hm(m.dist)}</b>（專注 ${hm(m.focus_min)}＋任務 ${m.tasks} 個）。</p>
      <div class="gr-here">${art(R[cur].key, R[cur].emoji, "gr-here-ic")}<div class="gr-grow"><b>現在在：${esc(R[cur].name)}</b>
        <span class="gr-sub">「${esc(R[cur].lore)}」</span></div></div>
      ${next ? `<div class="gr-next"><span>下一站：${esc(next.name)}・還差 ${hm(next.min - m.dist)}</span><div class="gr-bar"><i style="width:${pct}%"></i></div></div>`
        : `<p class="rp-note">🌅 你已經走到世界盡頭了。</p>`}
      <div class="gr-map">${nodes}</div>
      <p class="rp-note">抵達每個新地區都會送星屑和寶箱，越遠越好。</p></div>`;
  }

  function heroIcon() {
    const c = window.RpgGame && window.RpgGame.state.status && window.RpgGame.state.status.class;
    return c ? `<img class="gr-hero" src="img/rpg/class/${c}.webp" alt="">` : `<span class="gr-emo gr-hero">🧙</span>`;
  }


  /* =========================================================
     🐣 小夥伴
  ========================================================= */

  function buddyArt(b) {
    if (b.stage === 0) return art("buddy_egg", "🥚", "gr-buddy-ic");
    if (b.stage === 1) return art("buddy_baby", "🐣", "gr-buddy-ic");
    if (b.stage === 2) return art("buddy_teen", "🐥", "gr-buddy-ic");
    const f = BUDDY_FORM[b.form] || BUDDY_FORM.wise;
    return b.stage === 4 ? art(`buddy_${b.form}_legend`, f.emoji, "gr-buddy-ic legend") : art(`buddy_${b.form}`, f.emoji, "gr-buddy-ic");
  }

  function buddyHtml() {
    const b = GR.buddy && GR.buddy.buddy;
    if (!b) {
      return `<div class="card rp-card"><h3>🐣 領養小夥伴</h3>
        <div class="gr-adopt">${art("buddy_egg", "🥚", "gr-buddy-ic wobble")}
        <p class="rp-note">一顆神祕的蛋。牠吃的是你的真實行動：專注、任務、運動、習慣、簽到。長大成什麼樣子，看你最近怎麼過。</p></div>
        <input id="gr-buddy-name" class="tm-input" maxlength="12" placeholder="幫牠取名字（最多 12 字）">
        <button type="button" class="btn btn-primary tm-wide" data-gr="adopt">🥚 領養</button></div>`;
    }
    const p = b.points;
    const prevNeed = [0, 100, 400, 1000, 2500][b.stage];
    const pct = b.next ? Math.round((p.total - prevNeed) / (b.next - prevNeed) * 100) : 100;
    const maxP = Math.max(1, p.focus, p.tasks, p.exercise, p.guard);
    const bar = (n, label, emo) => `<div class="gr-stat"><span>${emo} ${label}</span><div class="gr-bar thin"><i style="width:${Math.round(n / maxP * 100)}%"></i></div><b>${n}</b></div>`;
    const moodText = { happy: "今天很開心 ✨", calm: "在旁邊陪你", sleep: "睡著了…（做點事牠就會醒來）" }[b.mood];
    const form = b.form ? BUDDY_FORM[b.form] : null;
    return `<div class="card rp-card"><h3>🐣 ${esc(b.name)}</h3>
      <div class="gr-buddy mood-${b.mood}">${buddyArt(b)}${b.mood === "sleep" ? `<span class="gr-zzz">💤</span>` : ""}${b.mood === "happy" ? `<span class="gr-spark">✨</span>` : ""}</div>
      <p class="gr-center"><b>${BUDDY_STAGE[b.stage]}${form ? `・${form.name}` : ""}</b>・${moodText}</p>
      ${b.next ? `<div class="gr-next"><span>成長 ${p.total} / ${b.next}・下一階段：${BUDDY_STAGE[b.stage + 1]}</span><div class="gr-bar"><i style="width:${pct}%"></i></div></div>`
        : `<p class="gr-center rp-note">🌟 已經是傳說了！</p>`}
      ${bar(p.focus, "專注", "🧠")}${bar(p.tasks, "任務", "💪")}${bar(p.exercise, "運動", "❤️")}${bar(p.guard, "習慣・簽到", "🔥")}
      <p class="rp-note">${form ? `牠${form.why}，所以長成了${form.name}。` : "長到成年時，哪一條最長，就會變成那一型：專注→智慧型、任務→力量型、運動→活力型、習慣簽到→守護型。"}</p>
      <button type="button" class="btn btn-small ${b.petted ? "" : "btn-primary"}" data-gr="pet" ${b.petted ? "disabled" : ""}>${b.petted ? "今天摸過了 ♥" : "🤚 摸摸牠（星屑 +1）"}</button></div>`;
  }


  /* =========================================================
     🔒 壞習慣封印
  ========================================================= */

  function sealHtml() {
    const list = (GR.seal && GR.seal.seals) || [];
    const cards = list.map(s => {
      const layers = SEAL_MS.filter(m => s.days >= m).length;
      const nextM = SEAL_MS.find(m => s.days < m);
      return `<div class="gr-seal">
        <div class="gr-seal-top"><span class="gr-seal-emo">${esc(s.emoji)}</span>
          <div class="gr-grow"><b>${esc(s.name)}</b><span class="gr-sub">最久 ${s.best} 天・破戒 ${s.breaks} 次</span></div>
          <div class="gr-seal-days"><b>${s.days}</b><span>天</span></div></div>
        <div class="gr-chains">${SEAL_MS.map((m, i) => `<span class="gr-chain ${i < layers ? "on" : ""}" title="${m} 天">${i < layers ? "⛓️" : "○"}<i>${m}</i></span>`).join("")}</div>
        <p class="gr-sub">${nextM ? `再撐 ${nextM - s.days} 天，封印加一層` : "封印已經滿層了！"}</p>
        <div class="rp-row">
          ${s.can_repair ? `<button type="button" class="btn btn-small btn-primary" data-gr="repair" data-v="${s.id}">🔧 修補（5 星屑）</button>` : ""}
          <button type="button" class="btn btn-small" data-gr="break" data-v="${s.id}" data-n="${esc(s.name)}" data-d="${s.days}">💥 我破戒了</button>
          <button type="button" class="btn btn-small" data-gr="unseal" data-v="${s.id}" data-n="${esc(s.name)}">解除</button></div></div>`;
    }).join("");
    const form = list.length < 5 ? `<div class="gr-sec">新增封印</div>
      <div class="gr-presets">${SEAL_PRESETS.map(([e, n]) => `<button type="button" class="gr-preset ${GR.sealPick === e ? "on" : ""}" data-gr="spick" data-v="${e}" data-n="${n}">${e} ${n}</button>`).join("")}</div>
      <div class="rp-row"><input id="gr-seal-name" class="tm-input gr-grow" maxlength="20" placeholder="想戒掉的壞習慣">
        <button type="button" class="btn btn-primary btn-small" data-gr="seal">🔒 封印</button></div>` : "";
    return `<div class="card rp-card"><h3>🔒 壞習慣封印</h3>
      <p class="rp-note">每天沒破戒，封印就多一天。3、7、14、30、60、100 天各有獎勵。破戒了要誠實按一下，2 天內可以花 5 星屑修補一次。</p>
      ${cards || `<p class="rp-note">還沒有封印。從一個最想戒掉的開始吧。</p>`}${form}</div>`;
  }


  /* =========================================================
     🏷️ 稱號
  ========================================================= */

  function titleHtml() {
    const t = GR.title;
    const earned = new Set(t.earned || []);
    const list = (t.catalog || []).map(c => {
      const has = earned.has(c.key);
      const on = t.equipped === c.key;
      return `<button type="button" class="gr-title ${has ? "" : "locked"} ${on ? "on" : ""}" data-gr="title" data-v="${c.key}" ${has && !GR.busy ? "" : "disabled"}>
        <span class="gr-title-emo">${has ? c.emoji : "🔒"}</span><b>${has ? esc(c.name) : "？？？"}</b><span class="gr-sub">${on ? "戴著中" : esc(c.how)}</span></button>`;
    }).join("");
    return `<div class="card rp-card"><h3>🏷️ 稱號 ${earned.size} / ${(t.catalog || []).length}</h3>
      <p class="rp-note">依你的真實紀錄自動頒發。戴上的稱號會出現在小隊、排行和動態牆的名字旁邊。</p>
      <div class="gr-titles">${list}</div>
      ${t.equipped ? `<button type="button" class="btn btn-small" data-gr="title" data-v="">拿下稱號</button>` : ""}</div>`;
  }


  /* =========================================================
     🤝 好友賭約（放在小隊頁）
  ========================================================= */

  function betsHtml() {
    if (!hasDb()) return "";
    const b = GR.bet;
    if (!b) { if (!GR.triedBet) loadBets(); return ""; }
    if (b.error === "setup") return "";
    if (b.error) return `<div class="card rp-card"><p class="rp-note">賭約載入失敗：${esc(b.error)}</p></div>`;

    const friends = ((window.TeamGame && window.TeamGame.state.status && window.TeamGame.state.status.friends) || []);
    const fmt = (type, n) => type === "focus" ? hm(n) : `${n} ${BET_TYPE[type][1]}`;
    const cards = (b.bets || []).map(x => {
      const pctMe = Math.min(100, Math.round(x.me_now / x.goal * 100));
      const pctOt = Math.min(100, Math.round(x.other_now / x.goal * 100));
      const head = `本週${BET_TYPE[x.goal_type][0]} ${fmt(x.goal_type, x.goal)}・各押 ${x.stake} 星屑`;
      let foot = "";
      if (x.status === "pending" && x.mine) foot = `<span class="gr-sub">等 ${esc(x.other_name)} 接受…</span><button type="button" class="btn btn-small" data-gr="betcancel" data-v="${x.id}">取消</button>`;
      else if (x.status === "pending") foot = `<button type="button" class="btn btn-small btn-primary" data-gr="betyes" data-v="${x.id}">接受（押 ${x.stake}）</button><button type="button" class="btn btn-small" data-gr="betno" data-v="${x.id}">拒絕</button>`;
      else if (x.status === "settled") {
        const r = x.me_done && x.other_done ? `🎉 兩個都做到了！各拿回 ${x.stake + Math.floor(x.stake / 2)} 星屑` : x.me_done ? `🏆 你贏了！拿到 ${x.stake * 2} 星屑` : x.other_done ? `😵 ${esc(x.other_name)} 贏了，下次扳回來` : `😴 兩個都沒做到，各退一半`;
        foot = `<b>${r}</b>`;
      } else if (x.status === "declined" || x.status === "cancelled") foot = `<span class="gr-sub">${x.status === "declined" ? "對方拒絕了" : "已取消"}，星屑已退回</span>`;
      else foot = `<span class="gr-sub">週日結束後自動結算</span>`;
      return `<div class="gr-bet st-${x.status}"><b>🤝 vs ${esc(x.other_name)}</b><span class="gr-sub">${head}</span>
        ${["active", "settled"].includes(x.status) ? `<div class="gr-vs"><span>你 ${fmt(x.goal_type, x.me_now)}</span><div class="gr-bar thin"><i style="width:${pctMe}%"></i></div></div>
        <div class="gr-vs"><span>${esc(x.other_name)} ${fmt(x.goal_type, x.other_now)}</span><div class="gr-bar thin other"><i style="width:${pctOt}%"></i></div></div>` : ""}
        <div class="rp-row gr-bet-foot">${foot}</div></div>`;
    }).join("");

    const form = GR.betOpen ? `<div class="gr-betform">
        <label>對手<select id="gr-bet-friend">${friends.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join("")}</select></label>
        <label>目標<select id="gr-bet-type"><option value="focus">本週專注（小時）</option><option value="tasks">本週完成任務（個）</option><option value="checkin">本週簽到（天）</option></select></label>
        <label>數量<input id="gr-bet-goal" type="number" min="1" value="10"></label>
        <label>押注<select id="gr-bet-stake"><option>10</option><option selected>30</option><option>50</option></select></label>
        <div class="rp-row"><button type="button" class="btn btn-primary btn-small" data-gr="betgo">送出賭約</button><button type="button" class="btn btn-small" data-gr="betform">取消</button></div></div>` : "";

    return `<div class="card rp-card"><h3>🤝 好友賭約</h3>
      <p class="rp-note">跟好友約好本週目標，各押星屑。做到的人拿回來；對方沒做到，你把他的也贏走；兩個都做到各加 50%；都沒做到各退一半。</p>
      ${cards || `<p class="rp-note">還沒有賭約。</p>`}
      ${friends.length ? (GR.betOpen ? form : `<button type="button" class="btn btn-primary btn-small" data-gr="betform">＋ 發起賭約（星屑 ${b.stardust}）</button>`) : `<p class="rp-note">加好友之後就能打賭。</p>`}</div>`;
  }


  /* ---------- 整頁：旅程 ---------- */

  function html() {
    if (!hasDb()) return `<div class="card rp-card"><p class="rp-note">登入之後才能看旅程。</p></div>`;
    if (GR.error === "setup") return `<div class="card rp-card"><p class="rp-note">⚠️ 旅程的資料庫還沒設定：到 Supabase 的 SQL Editor 執行 <b>sql/2026-10-23_成長系統.sql</b>。</p></div>`;
    if (GR.error) return `<div class="card rp-card"><p class="rp-note">載入失敗：${esc(GR.error)}</p></div>`;
    if (!GR.map) { if (!GR.tried) loadAll(); return `<div class="card rp-card"><p class="rp-note">載入中…</p></div>`; }
    return mapHtml() + buddyHtml() + sealHtml() + titleHtml() + `<p class="rp-ver">旅程 ${GROWTH_JS_VERSION}</p>`;
  }


  /* ---------- 點擊 ---------- */

  async function onClick(e) {
    const el = e.target.closest("[data-gr]");
    if (!el) return;
    const act = el.dataset.gr, v = el.dataset.v;
    const val = id => (document.getElementById(id) || {}).value || "";
    let ok = null;

    if (act === "spick") { GR.sealPick = v; const keep = el.dataset.n; rerender(["journey"]); const i = document.getElementById("gr-seal-name"); if (i && !i.value) i.value = keep; return; }
    if (act === "betform") { GR.betOpen = !GR.betOpen; rerender(["team"]); return; }

    if (act === "adopt") ok = await rpc("buddy_adopt", { p_name: val("gr-buddy-name") }, "🥚 領養成功！好好照顧牠");
    else if (act === "pet") ok = await rpc("buddy_pet", {}, "🤚 牠很開心！星屑 +1");
    else if (act === "seal") ok = await rpc("seal_add", { p_name: val("gr-seal-name"), p_emoji: GR.sealPick }, "🔒 封印開始！");
    else if (act === "break") {
      if (!confirm(`「${el.dataset.n}」破戒了嗎？封印會從 ${el.dataset.d} 天歸零（2 天內可以花 5 星屑修補一次）`)) return;
      ok = await rpc("seal_break", { p_id: Number(v) }, "💥 封印裂開了…沒關係，重新開始");
    }
    else if (act === "repair") ok = await rpc("seal_repair", { p_id: Number(v) }, "🔧 修補好了，天數回來了");
    else if (act === "unseal") { if (!confirm(`確定要解除「${el.dataset.n}」的封印？`)) return; ok = await rpc("seal_remove", { p_id: Number(v) }); }
    else if (act === "title") ok = await rpc("title_equip", { p_title: v || null }, v ? `🏷️ 戴上「${TITLES[v][0]}」` : "拿下稱號了");
    else if (act === "betgo") {
      const type = val("gr-bet-type");
      let goal = Number(val("gr-bet-goal")) || 0;
      if (type === "focus") goal = Math.round(goal * 60);
      const d = await rpc("bet_create", { p_friend: val("gr-bet-friend"), p_type: type, p_goal: goal, p_stake: Number(val("gr-bet-stake")) }, "🤝 賭約送出了！");
      if (d) { GR.betOpen = false; await loadBets(); }
      return;
    }
    else if (act === "betyes") { const d = await rpc("bet_answer", { p_id: Number(v), p_accept: true }, "🤝 接受挑戰！"); if (d) await loadBets(); return; }
    else if (act === "betno") { const d = await rpc("bet_answer", { p_id: Number(v), p_accept: false }); if (d) await loadBets(); return; }
    else if (act === "betcancel") { const d = await rpc("bet_cancel", { p_id: Number(v) }, "已取消，星屑退回"); if (d) await loadBets(); return; }

    if (ok) {
      await loadAll();
      if (act === "title" && window.TeamGame) window.TeamGame.reload();
    }
  }


  /* ---------- 樣式 ---------- */

  function injectStyle() {
    if (document.getElementById("gr-style")) return;
    const css = document.createElement("style");
    css.id = "gr-style";
    css.textContent = `
      .gr-emo { display: inline-flex; align-items: center; justify-content: center; line-height: 1; }
      .gr-img { object-fit: contain; }
      .gr-sub { font-size: 12px; opacity: .72; }
      .gr-grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .gr-center { text-align: center; margin: 6px 0; }
      .gr-sec { font-weight: 800; margin: 12px 0 6px; }
      .gr-bar { height: 10px; border-radius: 99px; background: rgba(127,127,127,.18); overflow: hidden; margin-top: 4px; }
      .gr-bar.thin { height: 7px; flex: 1; }
      .gr-bar i { display: block; height: 100%; background: linear-gradient(90deg, #66bb6a, #6c4bd8); }
      .gr-bar.other i { background: linear-gradient(90deg, #ffa726, #ef5350); }
      .gr-next { font-size: 13px; margin: 8px 0; }
      .gr-hero { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; font-size: 22px; border: 2px solid #fff; }
      .gr-title-chip { display: inline-block; margin-left: 4px; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 99px; background: rgba(255,167,38,.2); vertical-align: middle; white-space: nowrap; }

      .gr-here { display: flex; gap: 12px; align-items: center; padding: 10px; border-radius: 12px; background: rgba(108,75,216,.1); }
      .gr-here-ic { width: 60px; height: 60px; font-size: 44px; border-radius: 12px; }
      .gr-map { position: relative; display: flex; flex-direction: column; gap: 4px; margin-top: 10px; padding: 8px 0;
        background: linear-gradient(90deg, transparent calc(50% - 2px), rgba(127,127,127,.25) calc(50% - 2px), rgba(127,127,127,.25) calc(50% + 2px), transparent calc(50% + 2px)); }
      .gr-node { display: flex; align-items: center; gap: 10px; width: 50%; box-sizing: border-box; }
      .gr-node.l { flex-direction: row-reverse; text-align: right; padding-right: 0; }
      .gr-node.r { align-self: flex-end; flex-direction: row; margin-left: 50%; transform: translateX(-30px); }
      .gr-node.l { transform: translateX(30px); }
      .gr-node-art { position: relative; flex: none; }
      .gr-node-ic { width: 56px; height: 56px; font-size: 36px; border-radius: 50%; background: rgba(127,127,127,.12); border: 3px solid rgba(127,127,127,.3); }
      .gr-node.done .gr-node-ic { border-color: #66bb6a; }
      .gr-node.here .gr-node-ic { border-color: #6c4bd8; box-shadow: 0 0 0 4px rgba(108,75,216,.3); }
      .gr-node.lock { opacity: .45; }
      .gr-node-txt { display: flex; flex-direction: column; font-size: 13px; }
      .gr-you { position: absolute; top: -12px; right: -12px; animation: rp-bob 1.6s ease-in-out infinite; }

      .gr-adopt { text-align: center; }
      .gr-buddy { position: relative; display: flex; justify-content: center; padding: 10px 0; }
      .gr-buddy-ic { width: 150px; height: 150px; font-size: 110px; }
      .gr-buddy-ic.legend { filter: drop-shadow(0 0 14px rgba(255,215,64,.8)); }
      .mood-happy .gr-buddy-ic { animation: gr-hop 1.2s ease-in-out infinite; }
      .mood-sleep .gr-buddy-ic { filter: saturate(.6) brightness(.85); }
      .wobble { animation: fn-shake 1.6s ease-in-out infinite; }
      @keyframes gr-hop { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-12px); } }
      .gr-zzz { position: absolute; top: 6px; right: calc(50% - 90px); font-size: 30px; animation: rp-bob 2s ease-in-out infinite; }
      .gr-spark { position: absolute; top: 6px; left: calc(50% - 90px); font-size: 26px; animation: rp-bob 1.4s ease-in-out infinite; }
      .gr-stat { display: flex; align-items: center; gap: 8px; font-size: 13px; margin: 4px 0; }
      .gr-stat span { width: 90px; }

      .gr-seal { padding: 10px; border-radius: 12px; background: rgba(127,127,127,.08); margin: 8px 0; }
      .gr-seal-top { display: flex; align-items: center; gap: 10px; }
      .gr-seal-emo { font-size: 32px; }
      .gr-seal-days { text-align: center; display: flex; flex-direction: column; line-height: 1; }
      .gr-seal-days b { font-size: 30px; color: #6c4bd8; } .gr-seal-days span { font-size: 11px; opacity: .7; }
      .gr-chains { display: flex; justify-content: space-between; margin: 10px 4px 2px; }
      .gr-chain { display: flex; flex-direction: column; align-items: center; font-size: 18px; opacity: .4; }
      .gr-chain.on { opacity: 1; }
      .gr-chain i { font-style: normal; font-size: 10px; }
      .gr-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
      .gr-preset { padding: 5px 10px; border-radius: 99px; border: 1px solid rgba(127,127,127,.25); background: transparent; color: inherit; font-size: 12px; cursor: pointer; }
      .gr-preset.on { background: #6c4bd8; border-color: #6c4bd8; color: #fff; }

      .gr-titles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
      .gr-title { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px; border-radius: 12px; border: 1px solid rgba(127,127,127,.2); background: rgba(127,127,127,.06); color: inherit; font-size: 12px; text-align: center; cursor: pointer; }
      .gr-title .gr-sub { font-size: 10px; line-height: 1.3; }
      .gr-title.locked { cursor: default; opacity: .55; }
      .gr-title.on { border-color: #ffa726; box-shadow: 0 0 0 2px rgba(255,167,38,.4); }
      .gr-title-emo { font-size: 24px; }

      .gr-bet { padding: 10px; border-radius: 12px; background: rgba(127,127,127,.08); margin: 8px 0; display: flex; flex-direction: column; gap: 3px; }
      .gr-bet.st-settled { background: rgba(255,193,7,.1); }
      .gr-vs { display: flex; align-items: center; gap: 8px; font-size: 12px; }
      .gr-vs span { width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .gr-bet-foot { align-items: center; }
      .gr-betform { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
      .gr-betform label { display: flex; align-items: center; gap: 10px; font-size: 13px; }
      .gr-betform select, .gr-betform input { flex: 1; padding: 7px; border-radius: 8px; border: 1px solid rgba(127,127,127,.3); background: rgba(127,127,127,.08); color: inherit; }
      @media (max-width: 380px) { .gr-titles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    `;
    document.head.appendChild(css);
  }

  function boot() {
    injectStyle();
    document.addEventListener("click", onClick);
    /* 開網頁時檢查一次：有新地區、封印獎勵、稱號就跳提示 */
    let waited = 0;
    const wait = setInterval(() => {
      if (hasDb()) { clearInterval(wait); setTimeout(loadAll, 4000); }
      if (++waited > 60) clearInterval(wait);
    }, 1000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.GrowthGame = { version: GROWTH_JS_VERSION, html, betsHtml, titleChip, reload: loadAll, reloadBets: loadBets, state: GR };

})();
