/* =========================================================
   🧭 專注遠征、🎃 萬聖節活動、📖 每週冒險日誌
   資料庫：sql/2026-10-23_遠征萬聖節日誌.sql
   畫面：
     專注頁：遠征卡（專注中顯示走到哪裡；結束時跳出遠征結果）
     冒險 → 驚喜：萬聖節區塊（rpg.js 會呼叫 EventGame.halloweenHtml()）
     冒險 → 角色：冒險日誌（rpg.js 會呼叫 EventGame.journalHtml()）
     今日頁：萬聖節小卡
========================================================= */
(function () {

  const EVENT_JS_VERSION = "2026-10-23 v1";
  const IMG = "img/event/";

  /* 有圖的就加進來（放在 img/event/），沒加的先用 emoji */
  const EV_IMG = new Set([]);

  const PLACES = [
    { key: "place_forest", name: "晨光森林", emoji: "🌲", min: 10 },
    { key: "place_swamp", name: "迷霧沼澤", emoji: "🌫️", min: 25 },
    { key: "place_ruins", name: "古代遺跡", emoji: "🏛️", min: 50 },
    { key: "place_peak", name: "星之山脈", emoji: "⛰️", min: 90 },
    { key: "place_sky", name: "天空之城", emoji: "🏰", min: 150 }
  ];

  const STORIES = [
    ["在森林小徑撿到一顆會發光的橡實，松鼠一路跟著你回家。",
     "幫迷路的小狐狸找到媽媽，牠送你一把亮晶晶的星屑。",
     "清晨的露水好冰，你在樹洞裡睡了個好覺，精神百倍。",
     "樹精靈說：「專注的人走路都有光。」然後塞給你幾枚金幣。"],
    ["霧太濃了，你憑著專注的直覺走出沼澤，靴子裡都是泥巴。",
     "沼澤裡的青蛙合唱團幫你伴奏，你在霧裡找到一個舊木箱。",
     "一隻拖延蝸牛想黏住你的腳，你頭也不回地甩掉了牠。",
     "霧中傳來「再滑一下就好」的聲音，你摀住耳朵繼續前進。"],
    ["遺跡牆上刻著古老的番茄鐘，你解開機關，石門轟隆打開。",
     "在倒塌的書庫裡翻到一本筆記，上面寫著「今天也要做完」。",
     "石像守衛問你專注了多久，聽完之後默默讓路。",
     "你在遺跡深處發現一間寶物室，可惜只帶得走一點點。"],
    ["山頂的風很冷，但星空近得伸手就碰得到。",
     "你和一隻雪鷹賽跑，贏了之後牠叼來一個鐵箱子。",
     "爬到一半差點想放棄，想到還沒完成的任務，又咬牙爬了上去。",
     "山脈的星星會唱歌，你把歌聲裝進了口袋。"],
    ["雲上的城市只有最專注的冒險者才看得到，你做到了。",
     "天空之城的國王親自接見你：「好久沒看到這麼拼的人了。」",
     "你在雲端的圖書館讀了一整個下午，回來時口袋塞滿金幣。",
     "從城牆往下看，整片大陸都在腳下，原來你已經走了這麼遠。"]
  ];
  const EARLY_STORY = "走到一半就折返了，只撿到一點路邊的小東西。下次撐到最後吧！";

  const ITEM_NAME = {
    stardust: "星屑", gold: "金幣", chest_wood: "木寶箱", chest_iron: "鐵寶箱", chest_gold: "金寶箱", chest_star: "星光寶箱",
    gacha_coin: "扭蛋幣", scratch_card: "刮刮樂", ticket_normal: "普通召喚券", ticket_special: "特殊召喚券", candy: "糖果"
  };
  const BOSS_NAME = { sloth_slime: "怠惰史萊姆王", delay_dragon: "拖延巨龍", phone_wraith: "手機幽靈", fatigue_golem: "疲憊石像" };
  const RAID_NAME = { raid_hydra: "無盡滑動九頭蛇", raid_vampire: "熬夜吸血鬼伯爵", raid_abyss: "拖延深淵魔王", raid_fog: "焦慮迷霧巨人" };
  const DAY = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"];

  const EV = { exp: null, hw: null, hwError: null, journal: {}, jWeek: null, jLoading: false, jError: null, busy: false, triedHw: false };

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = msg => (typeof showToast === "function" ? showToast(msg) : alert(msg));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const gameOn = () => (typeof gameIsOn === "function" ? gameIsOn() : document.body.classList.contains("game-mode-on"));
  const art = (key, emoji, cls) => EV_IMG.has(key) ? `<img class="ev-img ${cls || ""}" src="${IMG}${key}.webp" alt="">` : `<span class="ev-emo ${cls || ""}">${emoji}</span>`;
  const rewardText = r => Object.entries(r || {}).filter(([, v]) => v > 0).map(([k, v]) => `${ITEM_NAME[k] || k} ×${v}`).join("、");
  const myClass = () => (window.RpgGame && window.RpgGame.state.status && window.RpgGame.state.status.class)
    || (window.FunGame && window.FunGame.state.status && window.FunGame.state.status.class) || null;
  const heroIcon = cls => {
    const c = cls || myClass();
    return c ? `<img class="ev-hero" src="img/rpg/class/${c}.webp" alt="">` : `<span class="ev-emo ev-hero">🧙</span>`;
  };
  const rerenderRpg = tabs => { if (window.RpgGame && tabs.includes(window.RpgGame.state.tab)) window.RpgGame.render(); };


  /* =========================================================
     🧭 專注遠征
  ========================================================= */

  function runningMinutes() {
    try {
      if (typeof focusTimer === "undefined" || !focusTimer || typeof focusElapsedMs !== "function") return null;
      return Math.floor(focusElapsedMs(focusTimer) / 60000);
    } catch (e) { return null; }
  }

  async function loadExp() {
    if (!hasDb()) return;
    const { data, error } = await db.rpc("exp_list");
    EV.exp = error ? { error: /exp_list|function|schema cache|PGRST/i.test(error.message || "") ? "setup" : error.message } : data;
    renderExpCard();
  }

  function pathHtml(min) {
    const reached = PLACES.filter(p => min >= p.min).length - 1;
    const next = PLACES[reached + 1];
    /* 英雄在路上的位置：0 = 村口，每一站平均分配 */
    let pos;
    if (reached < 0) pos = (min / PLACES[0].min) * (100 / PLACES.length);
    else if (!next) pos = 100;
    else pos = ((reached + 1) + (min - PLACES[reached].min) / (next.min - PLACES[reached].min)) * (100 / PLACES.length);
    pos = Math.max(0, Math.min(100, pos));
    return `<div class="ev-path"><div class="ev-path-line"><i style="width:${pos}%"></i></div>
        <div class="ev-path-hero" style="left:${pos}%">${heroIcon()}</div>
        <div class="ev-stops">${PLACES.map((p, i) => `<div class="ev-stop ${i <= reached ? "on" : ""}">${art(p.key, p.emoji, "ev-stop-ic")}<span>${p.name}</span><i>${p.min} 分</i></div>`).join("")}</div></div>
      <p class="ev-note">${reached < 0 ? `再專注 ${PLACES[0].min - min} 分鐘就會出發` : next
        ? `已經走到<b>${PLACES[reached].name}</b>，再專注 ${next.min - min} 分鐘到${next.name}` : "已經抵達天空之城！最好的戰利品等著你"}</p>`;
  }

  function renderExpCard() {
    const anchor = document.getElementById("focus-buttons");
    if (!anchor) return;
    let box = document.getElementById("ev-exp");
    if (!box) {
      box = document.createElement("div");
      box.id = "ev-exp";
      box.className = "ev-exp";
      anchor.after(box);
    }
    const show = gameOn() && hasDb() && !(EV.exp && EV.exp.error);
    box.hidden = !show;
    if (!show) return;

    const min = runningMinutes();
    if (min !== null) {
      box.innerHTML = `<div class="ev-exp-title">🧭 遠征中…</div>${pathHtml(min)}`;
      return;
    }
    const e = EV.exp;
    const recent = (e && e.recent) || [];
    box.innerHTML = `<div class="ev-exp-title">🧭 專注遠征 <span class="ev-sub">${e ? `已出發 ${e.count} 次・最遠到${e.best >= 0 ? PLACES[e.best].name : "還沒出發"}` : ""}</span></div>
      <p class="ev-note">開始專注，角色就會出發探險。專注越久走越遠，戰利品越好；倒數提早結束會空手折返一半。</p>
      ${recent.slice(0, 3).map(x => `<div class="ev-log">${art(PLACES[x.place].key, PLACES[x.place].emoji, "ev-log-ic")}
        <div class="ev-grow"><b>${esc(x.subject)} ${x.minutes} 分・${PLACES[x.place].name}${x.early ? "（提早折返）" : ""}</b>
        <span class="ev-sub">${rewardText(x.reward) || "沒有撿到東西"}</span></div></div>`).join("")}`;
  }

  function showExpResult(list) {
    if (!list || !list.length) return;
    const x = list[list.length - 1];
    const p = PLACES[x.place];
    const story = x.early ? EARLY_STORY : STORIES[x.place][x.story % 4];
    const more = list.length > 1 ? `<p class="ev-note">另外還有 ${list.length - 1} 趟遠征也回來了，戰利品已經收進背包。</p>` : "";
    const ov = document.createElement("div");
    ov.className = "ev-modal";
    ov.innerHTML = `<div class="ev-modal-card">
        <div class="ev-modal-art">${art(p.key, p.emoji, "ev-place-big")}${heroIcon()}</div>
        <h3>🧭 遠征歸來：${p.name}</h3>
        <p class="ev-story">「${esc(story)}」</p>
        <div class="ev-loot">${Object.entries(x.reward || {}).map(([k, v]) => `<span>${ITEM_NAME[k] || k} ×${v}</span>`).join("") || "<span>這次沒有撿到東西</span>"}</div>
        ${more}
        <button type="button" class="btn btn-primary" data-ev="close">收下</button></div>`;
    ov.addEventListener("click", ev => { if (ev.target === ov || ev.target.closest('[data-ev="close"]')) ov.remove(); });
    document.body.appendChild(ov);
  }

  async function claimExp() {
    if (!hasDb()) return;
    const { data, error } = await db.rpc("exp_claim");
    if (error) { console.warn("遠征結算失敗：", error); return; }
    if (data && data.new && data.new.length) {
      if (gameOn()) showExpResult(data.new);
      if (window.FunGame) window.FunGame.reload();
    }
    loadExp();
    loadHw();
  }


  /* =========================================================
     🎃 萬聖節
  ========================================================= */

  async function loadHw() {
    if (!hasDb()) return;
    const { data, error } = await db.rpc("hw_status");
    if (error) { EV.hwError = /hw_status|function|schema cache|PGRST/i.test(error.message || "") ? "setup" : error.message; EV.hw = null; }
    else { EV.hw = data; EV.hwError = null; }
    renderTodayHw();
    rerenderRpg(["fun"]);
  }

  function ghostInfo(kind) {
    const g = EV.hw && EV.hw.catalog && EV.hw.catalog.ghosts && EV.hw.catalog.ghosts[kind];
    return g || { name: kind, emoji: "👻", candy: 1 };
  }

  function halloweenHtml() {
    if (EV.hwError === "setup") return "";
    const h = EV.hw;
    if (!h) { if (!EV.triedHw && hasDb()) { EV.triedHw = true; loadHw(); } return ""; }
    if (!h.active && !h.shop_open) return "";

    const end = new Date((h.catalog.end) + "T23:59:00+08:00");
    const days = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
    const waiting = h.waiting || [];
    const ghosts = waiting.slice(0, 12).map((g, i) => {
      const info = ghostInfo(g.kind);
      return `<button type="button" class="ev-ghost k-${g.kind}" style="animation-delay:${(i % 5) * 0.3}s" data-ev="catch" data-v="${g.id}" title="${esc(info.name)}">
        ${art("ghost_" + g.kind, info.emoji, "ev-ghost-ic")}<span>${esc(info.name)}</span></button>`;
    }).join("");

    const bought = h.bought || {};
    const shop = (h.catalog.shop || []).map(o => {
      const n = bought[o.item] || 0;
      const full = n >= o.limit;
      return `<div class="ev-shop-item">${art("shop_" + o.item, { frame_pumpkin: "🖼️", jack_staff: "🎃", witch_hat: "🧙", chest_star: "🌟", gacha_coin: "🪙", scratch_card: "🎫" }[o.item] || "🎁", "ev-shop-ic")}
        <b>${esc(o.name)}</b><span class="ev-sub">🍬 ${o.price}・${o.limit > 1 ? `${n} / ${o.limit}` : (full ? "已兌換" : "限 1 個")}</span>
        <button type="button" class="btn btn-small ${full ? "" : "btn-primary"}" data-ev="buy" data-v="${o.item}" ${full || h.candy < o.price || !h.shop_open || EV.busy ? "disabled" : ""}>${full ? "已換" : "換"}</button></div>`;
    }).join("");

    const caught = h.caught || {};
    const dex = Object.entries(h.catalog.ghosts).map(([k, g]) => `<span class="ev-chip">${g.emoji} ${esc(g.name)} ×${caught[k] || 0}</span>`).join("");

    return `<div class="card rp-card ev-hw">
      <div class="ev-hw-top">${art("hw_banner", "🎃", "ev-hw-ic")}<div class="ev-grow"><h3>萬聖節・南瓜幽靈大作戰</h3>
        <span class="ev-sub">${h.active ? `還剩 ${days} 天（11/1 結束，糖果商店開到 11/3）` : "活動結束了，糖果商店開到 11/3"}</span></div>
        <div class="rp-power"><span class="rp-sub">糖果</span><b>🍬 ${h.candy}</b></div></div>
      <p class="rp-note">完成任務有 40% 會遇到幽靈、專注 25 分鐘以上一定遇到一隻、10/31 簽到會出現南瓜大王。</p>
      ${waiting.length ? `<div class="ev-ghosts">${ghosts}</div>
        <button type="button" class="btn btn-primary tm-wide ev-wide" data-ev="catchall" ${EV.busy ? "disabled" : ""}>🕸️ 全部抓起來（${waiting.length} 隻）</button>`
        : `<p class="ev-empty">👻 現在沒有幽靈。去完成任務或專注一下，牠們就會冒出來。</p>`}
      <div class="ev-dex">${dex}</div>
      <div class="ev-sec">🍬 糖果商店</div><div class="ev-shop">${shop}</div></div>`;
  }

  function renderTodayHw() {
    const prev = document.getElementById("fn-today") || document.querySelector('.page[data-page="today"] .game-mode-bar');
    if (!prev) return;
    let box = document.getElementById("ev-today");
    if (!box) {
      box = document.createElement("div");
      box.id = "ev-today";
      box.className = "card ev-today";
      prev.after(box);
    }
    const h = EV.hw;
    const show = gameOn() && hasDb() && h && h.active;
    box.hidden = !show;
    if (!show) return;
    const n = (h.waiting || []).length;
    box.innerHTML = `<button type="button" class="ev-today-btn" data-ev="gofun">
      <span class="ev-emo ev-today-ic ${n ? "wiggle" : ""}">🎃</span>
      <span class="ev-grow"><b>${n ? `有 ${n} 隻幽靈在等你抓！` : "萬聖節活動進行中"}</b>
      <span class="ev-sub">糖果 🍬 ${h.candy}・完成任務、專注都會遇到幽靈</span></span><span>›</span></button>`;
  }

  async function catchGhost(id) {
    if (EV.busy) return;
    EV.busy = true;
    const { data, error } = await db.rpc("hw_catch", { p_id: id ? Number(id) : null });
    EV.busy = false;
    if (error) { toast("❌ " + error.message); return; }
    const bonus = rewardText(data.bonus);
    toast(`🍬 抓到 ${data.caught.length} 隻，糖果 +${data.candy}${bonus ? `・${bonus}` : ""}`);
    await loadHw();
    if (bonus && window.FunGame) window.FunGame.reload();
  }

  async function buyHw(item) {
    if (EV.busy) return;
    EV.busy = true;
    const { error } = await db.rpc("hw_buy", { p_item: item });
    EV.busy = false;
    if (error) { toast("❌ " + error.message); return; }
    toast("🎃 換到了！");
    await loadHw();
    if (window.FunGame) window.FunGame.reload();
    if (window.RpgGame) window.RpgGame.reload();
  }


  /* =========================================================
     📖 每週冒險日誌
  ========================================================= */

  function mondayOf(d) {
    const t = new Date(d + "T12:00:00+08:00");
    const dow = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dow);
    return t.toISOString().slice(0, 10);
  }
  function todayTaipei() {
    const t = new Date(Date.now() - 2 * 3600000);   /* 凌晨 2 點換日 */
    return t.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  }
  function addDays(d, n) { const t = new Date(d + "T12:00:00+08:00"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function isoWeek(d) {
    const t = new Date(d + "T12:00:00Z");
    const day = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - day + 3);
    const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((t - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  }
  const hm = m => m >= 60 ? `${Math.floor(m / 60)} 小時${m % 60 ? ` ${m % 60} 分` : ""}` : `${m} 分鐘`;

  async function loadJournal(week) {
    if (!hasDb()) return;
    EV.jWeek = week;
    if (EV.journal[week]) { rerenderRpg(["hero"]); return; }
    EV.jLoading = true;
    rerenderRpg(["hero"]);
    const { data, error } = await db.rpc("journal_week", { p_week: week });
    EV.jLoading = false;
    if (error) EV.jError = /journal_week|function|schema cache|PGRST/i.test(error.message || "") ? "setup" : error.message;
    else { EV.journal[week] = data; EV.jError = null; }
    rerenderRpg(["hero"]);
  }

  function writeStory(j) {
    const name = j.name || "冒險者";
    const days = j.days || [];
    const focus = days.reduce((s, d) => s + d.focus, 0);
    const tasks = days.reduce((s, d) => s + d.tasks, 0);
    const checks = days.filter(d => d.checkin).length;
    const best = days.reduce((b, d, i) => (d.focus > (b ? b.focus : -1) ? { ...d, i } : b), null);
    const lines = [];
    let title;

    if (focus >= 900) title = "燃燒的專注之週";
    else if (tasks >= 30) title = "行動派的一週";
    else if (focus + tasks * 10 < 60) title = "在營火旁休息的一週";
    else if (j.boss && j.boss.killed_at) title = "屠龍的一週";
    else title = "穩穩前進的一週";

    if (focus > 0) {
      lines.push(`這一週，${name} 一共專注了 <b>${hm(focus)}</b>${j.top_subject ? `，花最多時間的是「${esc(j.top_subject)}」` : ""}。`
        + (best && best.focus > 0 ? `最拼的一天是<b>${DAY[best.i]}</b>，專注了 ${hm(best.focus)}。` : "")
        + (j.longest >= 50 ? `最長的一次連續專注了 ${j.longest} 分鐘，連時間都安靜下來。` : ""));
    } else {
      lines.push(`這一週，${name} 的專注計時器安靜地躺在背包裡，一次也沒有響起。`);
    }

    if (tasks > 0) lines.push(`一共完成了 <b>${tasks} 個任務</b>${checks ? `，簽到 ${checks} 天` : ""}${checks === 7 ? "，一天都沒有缺席" : ""}。`);
    else if (checks) lines.push(`雖然任務沒有推進，但還是簽到了 ${checks} 天，火種一直都在。`);

    if (j.exercise >= 30 || j.habits >= 5) {
      lines.push([j.exercise >= 30 ? `運動了 ${hm(j.exercise)}` : "", j.habits >= 5 ? `打卡習慣 ${j.habits} 次` : ""].filter(Boolean).join("，") + "，身體和意志都在慢慢變強。");
    }

    if (j.boss) {
      const bn = BOSS_NAME[j.boss.boss_key] || "每週王";
      if (j.boss.killed_at) {
        const d = new Date(j.boss.killed_at);
        const dn = DAY[(new Date(d.getTime() - 2 * 3600000 + 8 * 3600000).getUTCDay() + 6) % 7];
        lines.push(`<b>${dn}</b>，${name} 揮出最後一擊，擊敗了第 ${j.boss.tier} 階的「${bn}」！`);
      } else if (j.boss.dmg > 0) {
        lines.push(`「${bn}」被打掉了 ${Math.round(j.boss.dmg / j.boss.hp * 100)}% 的血，牠躲回巢穴，下週再決勝負。`);
      }
    }
    if (j.raid) {
      const rn = RAID_NAME[j.raid.boss] || "團隊王";
      lines.push(j.raid.killed ? `和「${esc(j.raid.team)}」的夥伴們並肩作戰，打倒了「${rn}」，${name} 貢獻了 ${j.raid.my_dmg} 點傷害。`
        : `和「${esc(j.raid.team)}」一起挑戰「${rn}」，${name} 打出了 ${j.raid.my_dmg} 點傷害。`);
    }
    if (j.expeditions && j.expeditions.count) {
      lines.push(`專注遠征出發了 ${j.expeditions.count} 次，最遠走到了<b>${PLACES[j.expeditions.best].name}</b>。`);
    }
    const legends = (j.legends || []).map(k => {
      const cat = window.RpgGame && window.RpgGame.state.status && window.RpgGame.state.status.catalog;
      return (cat && cat.gear && cat.gear[k] && cat.gear[k].name) || k;
    });
    if (legends.length) lines.push(`召喚陣閃出金光，抽到了傳說裝備「${legends.map(esc).join("」「")}」！`);
    if (j.ghosts) lines.push(`還順手抓了 ${j.ghosts} 隻萬聖節幽靈，口袋裡都是糖果。`);
    const f = j.fortunes || {};
    if (f.daikichi) lines.push(`晨間籤筒搖出了 ${f.daikichi} 次大吉，星星很照顧你。`);
    else if (f.kyo || f.daikyo) lines.push(`抽到了凶籤，但冒險者從不被籤詩決定。`);

    const endings = focus + tasks * 10 >= 300
      ? ["這一章寫得很精彩。下一章，繼續往前走吧。", "地圖上的足跡又多了一大段，下週會走到哪裡呢？", "你比上週的自己更強了一點點，這就夠了。"]
      : ["休息也是冒險的一部分。下一章，從一個小任務開始就好。", "營火還沒熄，明天點燃它吧。", "慢慢來也沒關係，重要的是沒有停下。"];
    lines.push(endings[(isoWeek(j.week) + focus) % endings.length]);

    return { title, lines, focus, tasks, checks };
  }

  function journalHtml() {
    if (!hasDb()) return "";
    const today = todayTaipei();
    const thisWeek = mondayOf(today);
    const weeks = [thisWeek, addDays(thisWeek, -7), addDays(thisWeek, -14), addDays(thisWeek, -21)];
    if (!EV.jWeek) { EV.jWeek = weeks[1]; setTimeout(() => loadJournal(weeks[1]), 0); }
    if (EV.jError === "setup") return "";
    const j = EV.journal[EV.jWeek];

    const tabs = `<div class="ev-jtabs">${weeks.map((w, i) => `<button type="button" class="ev-jtab ${w === EV.jWeek ? "on" : ""}" data-ev="jweek" data-v="${w}">
      ${i === 0 ? "本週（進行中）" : i === 1 ? "上週" : `${i} 週前`}</button>`).join("")}</div>`;

    if (!j) return `<div class="card rp-card"><h3>📖 冒險日誌</h3>${tabs}<p class="rp-note">${EV.jLoading ? "翻開日誌中…" : EV.jError ? esc(EV.jError) : ""}</p></div>`;

    const st = writeStory(j);
    const maxF = Math.max(60, ...j.days.map(d => d.focus));
    const chapter = j.first_week ? Math.max(1, Math.floor((new Date(j.week) - new Date(mondayOf(j.first_week))) / 604800000) + 1) : isoWeek(j.week);
    const bars = j.days.map((d, i) => `<div class="ev-bar"><i style="height:${Math.max(3, Math.round(d.focus / maxF * 100))}%"></i>
      <span>${DAY[i].slice(1)}</span>${d.checkin ? "<em>✓</em>" : ""}</div>`).join("");

    return `<div class="card rp-card"><h3>📖 冒險日誌</h3>${tabs}
      <div class="ev-journal" id="ev-journal">
        <div class="ev-j-head"><span class="ev-j-ch">第 ${chapter} 章</span><span class="ev-j-date">${j.week.slice(5).replace("-", "/")} – ${j.end.slice(5).replace("-", "/")}</span></div>
        <div class="ev-j-title">${heroIcon(j.class)}<h2>${esc(st.title)}</h2></div>
        <div class="ev-j-stats"><span>⏱️ ${hm(st.focus)}</span><span>✅ ${st.tasks} 個任務</span><span>📅 簽到 ${st.checks} 天</span></div>
        <div class="ev-bars">${bars}</div>
        <div class="ev-j-body">${st.lines.map(l => `<p>${l}</p>`).join("")}</div>
        <div class="ev-j-foot">序光計畫・${esc(j.name || "")} 的冒險日誌</div>
      </div>
      <button type="button" class="btn btn-small" data-ev="jsave">🖼️ 存成圖片</button></div>`;
  }

  async function saveJournal() {
    const el = document.getElementById("ev-journal");
    if (!el) return;
    try {
      if (typeof html2canvas !== "function") {
        await new Promise((ok, bad) => {
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          s.onload = ok; s.onerror = bad;
          document.head.appendChild(s);
        });
      }
      const canvas = await html2canvas(el, { backgroundColor: null, scale: 2, useCORS: true });
      const a = document.createElement("a");
      a.download = `冒險日誌-${EV.jWeek}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    } catch (e) {
      console.warn(e);
      toast("存圖失敗，可以直接截圖這一張卡片");
    }
  }


  /* =========================================================
     點擊、樣式、接上網站
  ========================================================= */

  function onClick(e) {
    const el = e.target.closest("[data-ev]");
    if (!el) return;
    const act = el.dataset.ev;
    if (act === "catch") catchGhost(el.dataset.v);
    else if (act === "catchall") catchGhost(null);
    else if (act === "buy") buyHw(el.dataset.v);
    else if (act === "jweek") loadJournal(el.dataset.v);
    else if (act === "jsave") saveJournal();
    else if (act === "gofun") {
      if (window.RpgGame) window.RpgGame.state.tab = "fun";
      if (typeof showPage === "function") showPage("rpg");
    }
  }

  function injectStyle() {
    if (document.getElementById("ev-style")) return;
    const css = document.createElement("style");
    css.id = "ev-style";
    css.textContent = `
      body:not(.game-mode-on) #ev-exp, body:not(.game-mode-on) #ev-today { display: none !important; }
      .ev-emo { display: inline-flex; align-items: center; justify-content: center; line-height: 1; }
      .ev-img { object-fit: contain; }
      .ev-sub { font-size: 12px; opacity: .72; font-weight: 400; }
      .ev-note { font-size: 13px; opacity: .8; margin: 6px 0; line-height: 1.5; }
      .ev-grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .ev-hero { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; font-size: 26px; }

      .ev-exp { margin: 12px 0; padding: 12px; border-radius: 14px; background: rgba(108,75,216,.08); border: 1px solid rgba(108,75,216,.2); }
      .ev-exp-title { font-weight: 800; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
      .ev-path { position: relative; padding: 46px 0 4px; }
      .ev-path-line { position: absolute; top: 40px; left: 0; right: 0; height: 6px; border-radius: 99px; background: rgba(127,127,127,.2); }
      .ev-path-line i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #66bb6a, #6c4bd8); transition: width 1s; }
      .ev-path-hero { position: absolute; top: 0; transform: translateX(-50%); transition: left 1s; animation: ev-walk .6s ease-in-out infinite alternate; }
      @keyframes ev-walk { from { transform: translateX(-50%) translateY(0); } to { transform: translateX(-50%) translateY(-4px); } }
      .ev-stops { display: grid; grid-template-columns: repeat(5, 1fr); margin-top: 14px; }
      .ev-stop { display: flex; flex-direction: column; align-items: center; font-size: 11px; opacity: .45; text-align: center; }
      .ev-stop.on { opacity: 1; font-weight: 700; }
      .ev-stop i { font-style: normal; opacity: .7; font-size: 10px; }
      .ev-stop-ic { width: 30px; height: 30px; font-size: 22px; }
      .ev-log { display: flex; gap: 10px; align-items: center; padding: 6px 0; border-top: 1px solid rgba(127,127,127,.12); font-size: 13px; }
      .ev-log-ic { width: 32px; height: 32px; font-size: 24px; }

      .ev-modal { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; padding: 16px; }
      .ev-modal-card { width: min(360px, 100%); background: var(--card-bg, #1c1f2b); color: inherit; border-radius: 18px; padding: 18px; text-align: center; animation: fn-pop .5s cubic-bezier(.2,1.6,.4,1); }
      .ev-modal-art { position: relative; display: flex; justify-content: center; align-items: flex-end; height: 110px; }
      .ev-place-big { width: 110px; height: 110px; font-size: 80px; }
      .ev-modal-art .ev-hero { position: absolute; bottom: 0; right: calc(50% - 70px); width: 44px; height: 44px; }
      .ev-story { font-size: 15px; line-height: 1.7; margin: 8px 0; }
      .ev-loot { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin: 10px 0 14px; }
      .ev-loot span { padding: 4px 10px; border-radius: 99px; background: rgba(255,193,7,.18); font-weight: 700; font-size: 13px; }

      .ev-hw { background: linear-gradient(160deg, rgba(255,112,67,.14), rgba(108,75,216,.14)); }
      .ev-hw-top { display: flex; align-items: center; gap: 12px; }
      .ev-hw-ic { width: 56px; height: 56px; font-size: 44px; }
      .ev-ghosts { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; margin: 8px 0; }
      .ev-ghost { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 2px; border: 0; border-radius: 14px; background: rgba(0,0,0,.18); color: inherit; font-size: 11px; cursor: pointer; animation: ev-float 2.4s ease-in-out infinite; }
      .ev-ghost.k-witch_cat { box-shadow: 0 0 0 2px rgba(171,71,188,.6); } .ev-ghost.k-king { box-shadow: 0 0 0 2px rgba(255,193,7,.8); }
      .ev-ghost-ic { width: 46px; height: 46px; font-size: 36px; }
      @keyframes ev-float { 50% { transform: translateY(-6px) rotate(-3deg); } }
      .ev-empty { text-align: center; opacity: .75; font-size: 13px; padding: 10px 0; }
      .ev-dex { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
      .ev-chip { font-size: 12px; padding: 2px 8px; border-radius: 99px; background: rgba(127,127,127,.14); }
      .ev-sec { font-weight: 800; margin: 12px 0 6px; }
      .ev-shop { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
      .ev-shop-item { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 4px; border-radius: 12px; background: rgba(0,0,0,.14); text-align: center; font-size: 12px; }
      .ev-shop-ic { width: 44px; height: 44px; font-size: 32px; }
      .ev-wide { width: 100%; }
      .ev-today { padding: 0; overflow: hidden; }
      .ev-today-btn { display: flex; width: 100%; align-items: center; gap: 12px; padding: 12px 14px; border: 0; background: linear-gradient(90deg, rgba(255,112,67,.18), rgba(108,75,216,.12)); color: inherit; text-align: left; cursor: pointer; font-size: 14px; }
      .ev-today-ic { font-size: 30px; } .wiggle { animation: fn-shake .8s ease-in-out infinite; }

      .ev-jtabs { display: flex; gap: 6px; margin: 4px 0 10px; overflow-x: auto; }
      .ev-jtab { flex: none; padding: 6px 10px; border-radius: 99px; border: 1px solid rgba(127,127,127,.25); background: transparent; color: inherit; font-size: 12px; cursor: pointer; }
      .ev-jtab.on { background: #6c4bd8; border-color: #6c4bd8; color: #fff; }
      .ev-journal { padding: 18px 16px; border-radius: 16px; color: #3d2c1a; margin-bottom: 10px;
        background: linear-gradient(180deg, #fbf3df, #f3e4c3); border: 3px double #c9a35b; box-shadow: inset 0 0 30px rgba(160,110,40,.18); }
      .ev-j-head { display: flex; justify-content: space-between; font-size: 12px; letter-spacing: 1px; color: #8a6a3a; }
      .ev-j-title { display: flex; align-items: center; gap: 10px; margin: 6px 0 10px; }
      .ev-j-title h2 { margin: 0; font-size: 22px; letter-spacing: 1px; }
      .ev-j-title .ev-hero { width: 42px; height: 42px; border: 2px solid #c9a35b; }
      .ev-j-stats { display: flex; flex-wrap: wrap; gap: 6px; }
      .ev-j-stats span { padding: 3px 9px; border-radius: 99px; background: rgba(201,163,91,.25); font-size: 12px; font-weight: 700; }
      .ev-bars { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; height: 74px; align-items: end; margin: 12px 0 6px; }
      .ev-bar { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
      .ev-bar i { width: 70%; border-radius: 6px 6px 2px 2px; background: linear-gradient(180deg, #c9a35b, #8a6a3a); }
      .ev-bar span { font-size: 11px; margin-top: 2px; color: #8a6a3a; }
      .ev-bar em { position: absolute; top: -2px; font-style: normal; font-size: 10px; color: #4caf50; }
      .ev-j-body p { margin: 8px 0; font-size: 14px; line-height: 1.8; }
      .ev-j-foot { margin-top: 10px; text-align: right; font-size: 11px; color: #8a6a3a; }
    `;
    document.head.appendChild(css);
  }

  /* 結束專注 → 結算遠征 */
  if (typeof window.finishFocus === "function") {
    const base = window.finishFocus;
    window.finishFocus = async function () {
      const r = await base.apply(this, arguments);
      setTimeout(claimExp, 600);
      return r;
    };
  }
  if (typeof window.applyPage === "function") {
    const base = window.applyPage;
    window.applyPage = function (name) {
      const r = base.apply(this, arguments);
      if (name === "focus" && hasDb()) { loadExp(); claimExp(); }
      if (name === "today" && hasDb()) loadHw();
      return r;
    };
  }
  if (typeof window.renderGameModeToggle === "function") {
    const base = window.renderGameModeToggle;
    window.renderGameModeToggle = function () {
      const r = base.apply(this, arguments);
      try { renderExpCard(); renderTodayHw(); } catch (e) { console.warn(e); }
      return r;
    };
  }

  function boot() {
    injectStyle();
    document.addEventListener("click", onClick);
    /* 專注中每秒更新一次遠征進度 */
    setInterval(() => { if (runningMinutes() !== null || document.querySelector("#ev-exp .ev-path")) renderExpCard(); }, 1000);
    let waited = 0;
    const wait = setInterval(() => {
      if (hasDb()) { clearInterval(wait); loadExp(); loadHw(); claimExp(); }
      if (++waited > 60) clearInterval(wait);
    }, 1000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.EventGame = { version: EVENT_JS_VERSION, halloweenHtml, journalHtml, reloadHw: loadHw, reloadExp: loadExp, claimExp, state: EV };

})();
