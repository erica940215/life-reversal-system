/* =========================================================
   🎁 驚喜系統：晨間籤詩、刮刮樂、冒險寶箱、序光扭蛋機、週末流浪商人
   資料庫：sql/2026-10-22_驚喜.sql
   畫面：冒險頁的「驚喜」分頁（rpg.js 會呼叫 FunGame.html()），今日頁的籤詩小卡
========================================================= */
(function () {

  const FUN_JS_VERSION = "2026-10-23 v4";
  const IMG = "img/fun/";

  /* 還沒給圖的小怪獸先用 emoji；給了圖就把 key 加進來 */
  const MONSTER_IMG = new Set(["m_owl", "m_pillow", "m_kappa", "m_snail", "m_hamster", "m_fly", "m_drop",
    "m_rooster", "m_tomato", "m_chick", "m_bookworm", "m_hedgehog", "m_secret",
    "z_aries", "z_taurus", "z_gemini", "z_cancer", "z_leo", "z_virgo", "z_libra", "z_scorpio",
    "z_sagittarius", "z_capricorn", "z_aquarius", "z_pisces", "z_polaris"]);

  const FRAMES = [
    ["frame_wood", "新手木框", "開木寶箱有機會拿到"],
    ["frame_leaf", "森林葉框", "開鐵寶箱有機會拿到"],
    ["frame_gold", "黃金框", "開金寶箱有機會拿到"],
    ["frame_star", "星光框", "開星光寶箱有機會拿到"],
    ["frame_dragon", "屠龍者框", "打倒第 5 階的每週王"],
    ["frame_crown", "王者框", "打倒第 10 階的每週王"],
    ["frame_monster", "小怪獸框", "序光小怪獸 13 隻集滿"],
    ["frame_lucky", "大吉框", "累計抽到 10 次大吉"],
    ["frame_zodiac", "星座框", "星座寶寶 13 隻集滿"],
    ["frame_pumpkin", "南瓜框", "萬聖節糖果商店兌換"]
  ];
  const CLASS_EMOJI = { scholar: "📚", warrior: "⚔️", guardian: "🛡️", ranger: "🏹" };

  const FORTUNES = {
    daikichi: { name: "大吉", color: "#e8a317", effect: "今天專注拿到的星屑 ×2" },
    chukichi: { name: "中吉", color: "#d4889a", effect: "每週王今天多 1 次出擊" },
    shokichi: { name: "小吉", color: "#8a9bb5", effect: "拿到農場入場卷 1 張" },
    kichi:    { name: "吉",   color: "#7aa874", effect: "拿到普通星願瓶 1 個" },
    suekichi: { name: "末吉", color: "#5aa3c8", effect: "拿到星屑 1" },
    kyo:      { name: "凶",   color: "#6b5b95", effect: "今天完成 2 個任務就能化解成吉，再送刮刮樂 1 張" },
    daikyo:   { name: "大凶", color: "#b8322a", effect: "今天完成 2 個任務就能化解成大吉，再送刮刮樂 1 張" }
  };

  const POEMS = {
    daikichi: ["今日星光照頂，專注一刻抵兩刻。拖延巨龍見你都要讓路。", "大吉！今天做的每件事都會發光，連喝水都很帥。",
               "東風正好，乘勢而行。手機幽靈今日無法近身。", "萬事皆順。宜開始那件一直想做的事。"],
    chukichi: ["劍已磨利，再出擊一次。王的血條在發抖。", "穩穩前進就會贏。今天的你比昨天多一招。",
               "月亮站在你這邊，宜挑戰、宜練習。", "好運過半，剩下一半靠你自己按下開始。"],
    shokichi: ["小小好運敲門：去農場走走，作物在等你。", "一點點進步也是進步。宜整理、宜早睡。",
               "今天適合把小事做完，心情會變輕。", "花開一朵也是春天。完成一個任務就好。"],
    kichi:    ["平平安安就是福。照著計畫走，不會錯。", "星願瓶裡裝著一個小願望，記得許。",
               "今天宜喝水、宜伸展、宜對自己好一點。", "穩定是最強的技能。今天也簽到了，很棒。"],
    suekichi: ["好運在後頭，先把第一件事做完。", "慢熱的一天，下午會越來越順。",
               "撿到一顆星屑，代表星星沒有忘記你。", "雖是末吉，但「末」是最後會吉的意思。"],
    kyo:      ["拖延蝸牛今天特別黏人。完成兩個任務就能把它甩掉。", "烏雲罩頂？動起來，雲就散了。",
               "手機幽靈在你耳邊說「再滑一下」。別聽它的。", "凶籤是給你翻盤用的。做兩件事，運勢立刻反轉。"],
    daikyo:   ["大凶！拖延巨龍今日食慾旺盛，宜早睡、忌熬夜。", "傳說中的大凶，抽到的機率只有 2%。你很特別。",
               "怠惰史萊姆王正坐在你的床上。起來，完成兩件事。", "大凶到極致就是大吉。完成兩個任務，看奇蹟發生。"]
  };

  const SYMBOLS = {
    stardust: { name: "星屑", img: "sym_stardust", emoji: "✨" },
    gold:     { name: "金幣", img: "sym_gold", emoji: "🪙" },
    ticket:   { name: "召喚券", img: "sym_ticket", emoji: "🎫" },
    wish:     { name: "星願瓶", img: "sym_wish", emoji: "🌠" },
    pass:     { name: "入場卷", img: "sym_pass", emoji: "🎟️" },
    clover:   { name: "四葉草", img: "sym_clover", emoji: "🍀" },
    crown:    { name: "王冠", img: "sym_crown", emoji: "👑" },
    crow:     { name: "烏鴉", img: "sym_crow", emoji: "🐦‍⬛" }
  };

  const CROW_LINES = ["烏鴉說：今天的運氣先寄放在我這，明天連本帶利還你。", "三隻烏鴉一起嘎嘎叫：再接再厲！",
                      "烏鴉翻了個白眼，丟給你一顆星屑當安慰。", "銘謝惠顧。烏鴉表示它也很遺憾（其實沒有）。"];

  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

  const CHESTS = [
    ["chest_wood", "木寶箱", "每週王出擊有機會掉"],
    ["chest_iron", "鐵寶箱", "史詩任務必掉、商人有賣"],
    ["chest_gold", "金寶箱", "打倒每週王必掉"],
    ["chest_star", "星光寶箱", "出擊掉寶箱時 1% 是它"],
    ["chest_team", "團隊寶箱", "小隊打倒團隊王，每人 1 個"]
  ];

  /* 還沒給圖的頭像框 */
  const FRAME_NOIMG = new Set([]);
  const frameImg = (k, cls) => FRAME_NOIMG.has(k) ? `<span class="fn-frame-emo ${cls}">${k === "frame_pumpkin" ? "🎃" : "🌌"}</span>` : img(k, cls);

  /* 扭蛋系列二：星座寶寶（還沒給圖，先用星座符號） */
  const ZODIAC = [
    ["z_aries", "牡羊寶寶", "♈", "頭上捲捲的小角，衝第一。"],
    ["z_taurus", "金牛寶寶", "♉", "慢慢來，但一定會到。"],
    ["z_gemini", "雙子寶寶", "♊", "兩個一起，話很多。"],
    ["z_cancer", "巨蟹寶寶", "♋", "外殼硬硬，心很軟。"],
    ["z_leo", "獅子寶寶", "♌", "鬃毛蓬蓬，最愛被稱讚。"],
    ["z_virgo", "處女寶寶", "♍", "把每顆星星都擦得亮亮的。"],
    ["z_libra", "天秤寶寶", "♎", "幫你在玩和讀書之間找平衡。"],
    ["z_scorpio", "天蠍寶寶", "♏", "安靜但很專注。"],
    ["z_sagittarius", "射手寶寶", "♐", "背著小弓到處冒險。"],
    ["z_capricorn", "摩羯寶寶", "♑", "一步一步往山頂爬。"],
    ["z_aquarius", "水瓶寶寶", "♒", "抱著水瓶提醒你喝水。"],
    ["z_pisces", "雙魚寶寶", "♓", "兩條小魚繞著你游。"],
    ["z_polaris", "北極星寶寶", "🌟", "隱藏版。永遠在北方發光，迷路時看看它。"]
  ];
  const SERIES = { m: { name: "序光小怪獸", secret: "m_secret", frame: "小怪獸框" }, z: { name: "星座寶寶", secret: "z_polaris", frame: "星座框" } };
  const seriesList = k => (k === "z" ? ZODIAC : MONSTERS);

  /* 還沒給圖的寶箱先用 emoji */
  const CHEST_NOIMG = new Set([]);
  const chestImg = (k, cls) => CHEST_NOIMG.has(k.replace(/_open$/, "")) ? `<span class="fn-chest-emo ${cls}">${k.endsWith("_open") ? "🎊" : "🎁"}</span>` : img(k, cls);

  const MONSTERS = [
    ["m_owl", "熬夜貓頭鷹", "🦉", "黑眼圈很重，還抱著手機。"],
    ["m_pillow", "賴床枕頭怪", "🛏️", "一靠近就會被黏住。"],
    ["m_kappa", "滑手機河童", "🐸", "頭上的盤子是手機螢幕。"],
    ["m_snail", "拖延蝸牛", "🐌", "殼上寫著「明天」。"],
    ["m_hamster", "零食倉鼠", "🐹", "臉頰永遠塞滿。"],
    ["m_fly", "分心蒼蠅", "🪰", "一直在你耳邊繞圈圈。"],
    ["m_drop", "喝水小水滴", "💧", "元氣滿滿，提醒你喝水。"],
    ["m_rooster", "早起太陽雞", "🐓", "頭頂太陽，天亮就叫。"],
    ["m_tomato", "專注番茄", "🍅", "25 分鐘一到就會響。"],
    ["m_chick", "運動小雞", "🐥", "綁頭帶、舉著小啞鈴。"],
    ["m_bookworm", "讀書書蟲", "🐛", "戴眼鏡從書裡鑽出來。"],
    ["m_hedgehog", "完美主義刺蝟", "🦔", "每根刺都排得超整齊。"],
    ["m_secret", "序光精靈", "🌟", "隱藏版。發光的小精靈，聽說只有 4% 機率。"]
  ];

  const ITEM_NAME = {
    stardust: "星屑", gold: "金幣", ticket_normal: "普通召喚券", ticket_special: "特殊召喚券", ticket_limited: "限定召喚券",
    wish_normal: "普通星願瓶", wish_rare: "稀有星願瓶", farmpass10: "農場入場卷", gacha_coin: "扭蛋幣", scratch_card: "刮刮樂",
    chest_wood: "木寶箱", chest_iron: "鐵寶箱", chest_gold: "金寶箱", chest_star: "星光寶箱"
  };

  const FN = {
    status: null, error: null, busy: false, loading: false,
    fortuneAnim: false, fortuneNew: false,
    scratch: null,       // { prize, line, grid, reward, revealed }
    chest: null,         // { chest, reward, phase: "shake" | "open" }
    series: "m",
    gacha: null          // { key, count, dust, set_done, phase: "turn" | "drop" | "open" | "show" }
  };


  /* ---------- 小工具 ---------- */

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = msg => (typeof showToast === "function" ? showToast(msg) : alert(msg));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const gameOn = () => (typeof gameIsOn === "function" ? gameIsOn() : document.body.classList.contains("game-mode-on"));
  const img = (name, cls = "") => `<img class="fn-img ${cls}" src="${IMG}${name}.webp" alt="" draggable="false">`;
  const qty = key => ((FN.status && FN.status.items) || {})[key] || 0;
  const rewardText = r => Object.entries(r || {}).filter(([, v]) => v > 0).map(([k, v]) => `${ITEM_NAME[k] || k} ×${v}`).join("、");

  function monsterIcon(key, big = false) {
    const m = MONSTERS.concat(ZODIAC).find(x => x[0] === key);
    if (MONSTER_IMG.has(key)) return `<img class="fn-mon-img ${big ? "big" : ""}" src="${IMG}${key}.webp" alt="">`;
    return `<span class="fn-mon-emo ${big ? "big" : ""}">${m ? m[2] : "❔"}</span>`;
  }


  /* 頭像：職業立繪放中間，外面套頭像框（王者框是戴在頭上的王冠） */
  function avatar(cls, frame, size = 44) {
    const face = cls ? `<img class="fn-av-face" src="img/rpg/class/${cls}.webp" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'fn-av-emo',textContent:'${CLASS_EMOJI[cls] || "🙂"}'}))">`
                     : `<span class="fn-av-emo">🙂</span>`;
    const fr = frame && !FRAME_NOIMG.has(frame) ? `<img class="fn-av-frame ${frame === "frame_crown" ? "crown" : ""}" src="${IMG}${frame}.webp" alt="">` : "";
    return `<span class="fn-av ${frame ? "has" : ""} ${frame === "frame_crown" ? "is-crown" : ""}" style="--s:${size}px">${face}${fr}</span>`;
  }

  /* ---------- 資料 ---------- */

  async function load() {
    if (!hasDb()) return;
    FN.loading = true;
    try {
      const { data, error } = await db.rpc("fun_status");
      if (error) throw error;
      if (!data) throw new Error("沒有讀到資料");
      FN.status = data;
      FN.error = null;
    } catch (error) {
      const msg = String(error && (error.message || error.code) || error);
      FN.error = /fun_status|function|schema cache|PGRST/i.test(msg) ? "setup" : msg;
    }
    FN.loading = false;
    rerender();
  }

  async function rpc(name, args) {
    if (FN.busy) return null;
    FN.busy = true;
    try {
      const { data, error } = await db.rpc(name, args || {});
      if (error) { toast("❌ " + error.message); return null; }
      return data;
    } finally {
      FN.busy = false;
    }
  }

  function rerender() {
    renderTodayCard();
    if (window.RpgGame && window.RpgGame.state && window.RpgGame.state.tab === "fun") window.RpgGame.render();
  }


  /* ---------- 🎋 籤詩 ---------- */

  function fortuneHtml(compact) {
    const st = FN.status;
    const f = st.fortune;

    if (!st.checked_in) {
      return `<div class="fn-fortune">${img("omikuji_box", "fn-box")}
        <div class="fn-fortune-body"><b>🎋 晨間籤詩</b><p class="fn-note">先簽到，就能抽今天的籤。</p></div></div>`;
    }

    if (!f || FN.fortuneAnim) {
      return `<div class="fn-fortune">${img("omikuji_box", "fn-box " + (FN.fortuneAnim ? "shake" : ""))}
        <div class="fn-fortune-body"><b>🎋 晨間籤詩</b>
          <p class="fn-note">${FN.fortuneAnim ? "搖呀搖……" : "每天一支，看看今天的運勢。抽到的籤會有效果喔。"}</p>
          <button type="button" class="btn btn-primary btn-small" data-fn="draw" ${FN.fortuneAnim || FN.busy ? "disabled" : ""}>🎋 搖籤筒</button></div></div>`;
    }

    const info = FORTUNES[f.kind];
    const poem = (POEMS[f.kind] || [])[f.poem] || "";
    const bad = f.kind === "kyo" || f.kind === "daikyo";
    const done = st.tasks_done_today || 0;
    const resolve = bad ? `<div class="fn-resolve"><span>化解進度：今天完成任務 <b>${Math.min(done, 2)} / 2</b></span>
        <button type="button" class="btn btn-small ${done >= 2 ? "btn-primary" : ""}" data-fn="resolve" ${done >= 2 && !FN.busy ? "" : "disabled"}>🔮 化解</button></div>` : "";
    const fromBad = f.resolved_from ? `<span class="fn-tag">由${FORTUNES[f.resolved_from].name}化解 ✨</span>` : "";

    return `<div class="fn-fortune ${FN.fortuneNew ? "pop" : ""}">${img("fortune_" + f.kind, "fn-paper")}
      <div class="fn-fortune-body">
        <div class="fn-fortune-kind" style="color:${info.color}">${info.name} ${fromBad}</div>
        <p class="fn-poem">「${esc(poem)}」</p>
        <p class="fn-note">✦ ${info.effect}</p>
        ${resolve}
        ${compact ? "" : ""}
      </div></div>`;
  }

  async function drawFortune() {
    FN.fortuneAnim = true;
    rerender();
    const [data] = await Promise.all([rpc("fun_fortune_draw"), new Promise(r => setTimeout(r, 1300))]);
    FN.fortuneAnim = false;
    if (data) {
      FN.fortuneNew = true;
      FN.status.fortune = { kind: data.kind, poem: data.poem, resolved_from: null };
      toast(`🎋 今天是「${FORTUNES[data.kind].name}」`);
      setTimeout(() => { FN.fortuneNew = false; }, 1200);
    }
    rerender();
    load();
  }

  async function resolveFortune() {
    const data = await rpc("fun_fortune_resolve");
    if (data) {
      FN.fortuneNew = true;
      toast(`🔮 化解成功！變成「${FORTUNES[data.kind].name}」，還拿到一張刮刮樂`);
      setTimeout(() => { FN.fortuneNew = false; }, 1200);
      await load();
    }
  }


  /* ---------- 🎫 刮刮樂 ---------- */

  /* 中獎的線放 3 個一樣的；其他格子隨便放，但不能再湊成一條線 */
  function buildGrid(prize, line) {
    const keys = Object.keys(SYMBOLS).filter(k => k !== prize);
    for (let tries = 0; tries < 200; tries++) {
      const g = Array(9).fill(null);
      for (const i of LINES[line]) g[i] = prize;
      for (let i = 0; i < 9; i++) if (!g[i]) g[i] = keys[Math.floor(Math.random() * keys.length)];
      const ok = LINES.every((l, idx) => idx === line || !(g[l[0]] === g[l[1]] && g[l[1]] === g[l[2]]));
      if (ok) return g;
    }
    return Array(9).fill(prize);
  }

  function scratchHtml() {
    const n = qty("scratch_card");
    const plan = FN.status.tasks_plan || {};
    const s = FN.scratch;

    let card = "";
    if (s) {
      const win = LINES[s.line];
      const cells = s.grid.map((k, i) => `<div class="fn-cell ${s.revealed && win.includes(i) ? "win" : ""}">
          ${img(SYMBOLS[k].img, "fn-sym")}</div>`).join("");
      const result = s.revealed
        ? `<div class="fn-result ${s.prize === "crow" ? "lose" : s.prize === "crown" ? "big" : ""}">
            ${s.prize === "crow" ? `🐦‍⬛ 三隻烏鴉…銘謝惠顧！<br><span class="fn-note">${esc(CROW_LINES[Math.floor(Math.random() * CROW_LINES.length)])}</span>`
              : s.prize === "crown" ? `👑 大獎！！！` : `🎉 三個${SYMBOLS[s.prize].name}！`}
            <div>獲得：${rewardText(s.reward)}</div></div>
           <button type="button" class="btn btn-small" data-fn="scratch-close">收起來</button>`
        : `<p class="fn-note">用手指刮開銀色的地方，連成一線就中獎。</p>
           <button type="button" class="btn btn-small" data-fn="scratch-all">一鍵刮開</button>`;
      card = `<div class="fn-scard"><div class="fn-scard-title">刮刮樂</div>
          <div class="fn-sgrid-wrap"><div class="fn-sgrid">${cells}</div>
          ${s.revealed ? "" : `<canvas class="fn-scover" id="fn-scover"></canvas>`}</div></div>${result}`;
    }

    return `<div class="card rp-card fn-sec"><div class="fn-sec-top">${img("scratch_card", "fn-ic")}
        <div><h3>🎫 刮刮樂</h3><span class="rp-sub">今天排的任務全部完成就拿 1 張（${plan.done || 0} / ${plan.total || 0}）</span></div>
        <div class="rp-power"><span class="rp-sub">持有</span><b>${n}</b></div></div>
        ${card || `<button type="button" class="btn btn-primary btn-small" data-fn="scratch" ${n > 0 && !FN.busy ? "" : "disabled"}>刮一張</button>`}
      </div>`;
  }

  async function openScratch() {
    const data = await rpc("fun_scratch_open");
    if (!data) return;
    FN.scratch = { prize: data.prize, line: data.line, reward: data.reward, grid: buildGrid(data.prize, data.line), revealed: false };
    rerender();
    setTimeout(setupScratchCanvas, 30);
  }

  function setupScratchCanvas() {
    const c = document.getElementById("fn-scover");
    if (!c || c.dataset.ready) return;
    c.dataset.ready = "1";
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);

    /* 銀漆 */
    const g = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    g.addColorStop(0, "#c9ccd3"); g.addColorStop(0.45, "#eef0f4"); g.addColorStop(0.55, "#b8bcc6"); g.addColorStop(1, "#d9dce2");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "rgba(255,255,255,.35)";
    for (let i = 0; i < 260; i++) ctx.fillRect(Math.random() * rect.width, Math.random() * rect.height, 1.5, 1.5);
    ctx.fillStyle = "rgba(90,90,110,.55)";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("✦ 刮 我 ✦", rect.width / 2, rect.height / 2 + 6);

    ctx.globalCompositeOperation = "destination-out";
    let down = false, last = null, moves = 0;

    const pos = e => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const scratchAt = p => {
      ctx.lineWidth = 34; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      if (last) { ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      ctx.arc(p.x, p.y, 17, 0, Math.PI * 2); ctx.fill();
      last = p;
      if (++moves % 12 === 0) checkDone();
    };
    const checkDone = () => {
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let clear = 0, total = 0;
      for (let i = 3; i < data.length; i += 4 * 16) { total++; if (data[i] < 40) clear++; }
      if (clear / total > 0.6) revealScratch();
    };

    c.addEventListener("pointerdown", e => { down = true; last = null; c.setPointerCapture(e.pointerId); scratchAt(pos(e)); e.preventDefault(); });
    c.addEventListener("pointermove", e => { if (down) { scratchAt(pos(e)); e.preventDefault(); } });
    c.addEventListener("pointerup", () => { down = false; last = null; checkDone(); });
    c.addEventListener("pointercancel", () => { down = false; last = null; });
  }

  function revealScratch() {
    if (!FN.scratch || FN.scratch.revealed) return;
    FN.scratch.revealed = true;
    const s = FN.scratch;
    toast(s.prize === "crow" ? "🐦‍⬛ 銘謝惠顧～" : s.prize === "crown" ? "👑 大獎！" : `🎉 中了 ${rewardText(s.reward)}`);
    rerender();
    load();
  }


  /* ---------- 🎁 寶箱 ---------- */

  function chestHtml() {
    const c = FN.chest;
    const show = c ? `<div class="fn-chest-show">
        ${chestImg(c.phase === "open" ? c.chest + "_open" : c.chest, "fn-chest-big " + (c.phase === "shake" ? "shake" : "pop"))}
        ${c.phase === "open" ? `<div class="fn-result">🎁 ${esc((CHESTS.find(x => x[0] === c.chest) || [])[1])}打開了！<div>獲得：${rewardText(c.reward)}</div>
          ${c.frame ? `<div class="fn-got-frame">${frameImg(c.frame, "fn-frame-ic")}<b>🖼️ 新的頭像框：${esc((FRAMES.find(f => f[0] === c.frame) || [])[1])}！</b></div>` : ""}</div>
          <button type="button" class="btn btn-small" data-fn="chest-close">好</button>` : `<p class="fn-note">喀啦喀啦……</p>`}</div>` : "";

    const list = CHESTS.map(([k, name, from]) => {
      const n = qty(k);
      return `<div class="fn-chest ${n ? "" : "none"}">${chestImg(k, "fn-chest-ic")}<b>${name}</b><span class="rp-sub">${from}</span>
        <button type="button" class="btn btn-small ${n ? "btn-primary" : ""}" data-fn="chest" data-v="${k}" ${n && !FN.busy && !c ? "" : "disabled"}>開（${n}）</button></div>`;
    }).join("");

    return `<div class="card rp-card fn-sec"><h3>🎁 冒險寶箱</h3>${show}<div class="fn-chests">${list}</div>
      <p class="rp-note">每週王每次出擊 25% 掉寶箱、打倒王必掉金寶箱、完成史詩任務必掉鐵寶箱。</p></div>`;
  }

  async function openChest(key) {
    FN.chest = { chest: key, reward: null, phase: "shake" };
    rerender();
    const [data] = await Promise.all([rpc("fun_chest_open", { p_chest: key }), new Promise(r => setTimeout(r, 900))]);
    if (!data) { FN.chest = null; rerender(); return; }
    FN.chest = { chest: key, reward: data.reward, frame: data.frame, phase: "open" };
    if (data.frame) toast("🖼️ 拿到新的頭像框！");
    rerender();
    load();
  }


  /* ---------- 🥚 扭蛋 ---------- */

  function gachaHtml() {
    const g = FN.gacha;
    const mons = (FN.status && FN.status.monsters) || {};
    const ser = SERIES[FN.series] ? FN.series : "m";
    const LIST = seriesList(ser);
    const info = SERIES[ser];
    const got = LIST.filter(m => mons[m[0]]).length;

    let stage = "";
    if (g) {
      if (g.phase === "turn") stage = img("gacha_machine", "fn-machine shake");
      else if (g.phase === "drop") stage = img("capsule", "fn-capsule drop");
      else if (g.phase === "open") stage = img("capsule_open", "fn-capsule pop");
      else {
        const m = MONSTERS.concat(ZODIAC).find(x => x[0] === g.key) || [g.key, g.key, "❔", ""];
        const sec = g.key === "m_secret" || g.key === "z_polaris";
        stage = `<div class="fn-mon-reveal ${sec ? "secret" : ""}">${monsterIcon(g.key, true)}
          <b>${sec ? "🌟 隱藏版！" : ""}${esc(m[1])}</b><span class="fn-note">${esc(m[3])}</span>
          <span class="fn-tag">${g.count > 1 ? `重複了，換成星屑 ${g.dust}` : "NEW！放上收藏架"}</span>
          ${g.set_done ? `<div class="fn-result big">🎊 13 隻全部到齊！送你限定召喚券 1 張、星屑 30、${g.key && g.key.startsWith("z_") ? "星座框" : "小怪獸框"}</div>` : ""}
          <button type="button" class="btn btn-small" data-fn="gacha-close">好</button></div>`;
      }
    } else {
      stage = img("gacha_machine", "fn-machine");
    }

    const shelf = LIST.map(([k, name]) => {
      const n = mons[k] || 0;
      return `<div class="fn-shelf-item ${n ? "" : "locked"} ${k === info.secret ? "secret" : ""}">${n ? monsterIcon(k) : `<span class="fn-mon-emo">❔</span>`}
        <span>${n ? esc(name) : "？？？"}</span>${n > 1 ? `<i>×${n}</i>` : ""}</div>`;
    }).join("");

    return `<div class="card rp-card fn-sec"><div class="fn-sec-top">${img("gacha_coin", "fn-ic")}
        <div><h3>🥚 序光扭蛋機</h3><span class="rp-sub">${info.name}（${got} / 13）</span></div>
        <div class="rp-power"><span class="rp-sub">扭蛋幣</span><b>${qty("gacha_coin")}</b></div></div>
      <div class="fn-series">${Object.entries(SERIES).map(([k, v], i) => `<button type="button" class="fn-series-btn ${k === ser ? "on" : ""}" data-fn="series" data-v="${k}" ${g ? "disabled" : ""}>
        系列${i + 1}：${v.name}</button>`).join("")}</div>
      <div class="fn-stage">${stage}</div>
      ${g ? "" : `<button type="button" class="btn btn-primary fn-wide" data-fn="gacha" ${qty("gacha_coin") > 0 && !FN.busy ? "" : "disabled"}>🪙 投幣，轉一次</button>`}
      <div class="fn-shelf">${shelf}</div>
      <p class="rp-note">扭蛋幣從寶箱和週末商人拿。重複的換星屑（隱藏版換 10）。每個系列 13 隻集滿送限定召喚券、星屑 30 和${info.frame}。</p></div>`;
  }

  async function pullGacha() {
    FN.gacha = { phase: "turn" };
    rerender();
    const [data] = await Promise.all([rpc("fun_gacha_pull", { p_series: FN.series }), new Promise(r => setTimeout(r, 900))]);
    if (!data) { FN.gacha = null; rerender(); return; }
    FN.gacha = { ...data, phase: "drop" };
    rerender();
    setTimeout(() => { if (FN.gacha) { FN.gacha.phase = "open"; rerender(); } }, 700);
    setTimeout(() => { if (FN.gacha) { FN.gacha.phase = "show"; rerender(); load(); } }, 1300);
  }


  /* ---------- 🧳 週末流浪商人 ---------- */

  function shopHtml() {
    const st = FN.status;
    if (!st.weekend) {
      return `<div class="card rp-card fn-sec"><div class="fn-sec-top">${img("merchant", "fn-merchant-img dim")}
        <div><h3>週末流浪商人</h3><span class="rp-sub">每週六、日才會出現，用金幣買好東西</span></div></div>
        <p class="rp-note">商人還在路上……金幣先存起來吧（現在有 ${st.gold}）。</p></div>`;
    }
    const bought = st.bought || [];
    const items = (st.shop || []).map(o => {
      const done = bought.includes(o.item);
      return `<div class="fn-shop-item ${o.sale ? "sale" : ""}">
        <b>${esc(o.name)}</b>
        <span>${o.sale ? `<s>${o.was}</s> ` : ""}🪙 ${o.price}${o.sale ? ` <i>7 折</i>` : ""}</span>
        <button type="button" class="btn btn-small ${done ? "" : "btn-primary"}" data-fn="buy" data-v="${o.item}"
          ${done || st.gold < o.price || FN.busy ? "disabled" : ""}>${done ? "買過了" : "買"}</button></div>`;
    }).join("");
    return `<div class="card rp-card fn-sec"><div class="fn-sec-top">${img("merchant", "fn-merchant-img bob")}
        <div><h3>週末流浪商人</h3><span class="rp-sub">「嘿嘿，這週帶了好貨喔。」每樣限買一次</span></div>
        <div class="rp-power"><span class="rp-sub">金幣</span><b>${st.gold}</b></div></div>
      <div class="fn-shop">${items}</div></div>`;
  }

  async function buy(item) {
    const data = await rpc("fun_shop_buy", { p_item: item });
    if (data) { toast(`🧳 買到 ${ITEM_NAME[item] || item}！`); await load(); }
  }


  /* ---------- 🖼️ 頭像框 ---------- */

  function frameHtml() {
    const st = FN.status;
    const owned = st.frames || [];
    const list = FRAMES.map(([k, name, from]) => {
      const has = owned.includes(k);
      const on = st.frame === k;
      return `<button type="button" class="fn-frame ${has ? "" : "locked"} ${on ? "on" : ""}" data-fn="frame" data-v="${k}" ${has && !FN.busy ? "" : "disabled"}>
        ${frameImg(k, "fn-frame-ic")}<b>${has ? esc(name) : "？？？"}</b><span class="rp-sub">${on ? "戴著中" : esc(from)}</span></button>`;
    }).join("");
    return `<div class="card rp-card fn-sec"><div class="fn-sec-top">${avatar(st.class, st.frame, 72)}
        <div><h3>🖼️ 頭像框</h3><span class="rp-sub">收集 ${owned.length} / ${FRAMES.length}。戴著的框會出現在每週王的好友排行</span></div></div>
      <div class="fn-frames">${list}</div>
      ${st.frame ? `<button type="button" class="btn btn-small" data-fn="frame" data-v="">拿下頭像框</button>` : ""}
      <p class="rp-note">大吉累計：${st.daikichi_count || 0} / 10</p></div>`;
  }

  async function equipFrame(key) {
    const data = await rpc("fun_frame_equip", { p_frame: key || null });
    if (data) {
      FN.status.frame = data.frame;
      toast(data.frame ? "🖼️ 換好頭像框了" : "拿下頭像框了");
      rerender();
      if (window.RpgGame && window.RpgGame.reload) window.RpgGame.reload();
    }
  }


  /* ---------- 整頁（冒險 → 驚喜） ---------- */

  function html() {
    if (!hasDb()) return `<div class="card rp-card"><p class="rp-note">登入之後才能玩。</p></div>`;
    if (FN.error === "setup") return `<div class="card rp-card"><p class="rp-note">⚠️ 驚喜系統的資料庫還沒設定：到 Supabase 的 SQL Editor 執行 <b>sql/2026-10-22_驚喜.sql</b>。</p></div>`;
    if (FN.error) return `<div class="card rp-card"><p class="rp-note">載入失敗：${esc(FN.error)}</p></div>`;
    if (!FN.status) { if (!FN.loading && !FN.tried) { FN.tried = true; load(); } return `<div class="card rp-card"><p class="rp-note">載入中…</p></div>`; }
    setTimeout(setupScratchCanvas, 30);
    return `<div class="card rp-card fn-sec">${fortuneHtml(false)}</div>${scratchHtml()}${chestHtml()}${gachaHtml()}${frameHtml()}${shopHtml()}
      <p class="rp-ver">驚喜 ${FUN_JS_VERSION}</p>`;
  }


  /* ---------- 今日頁的籤詩小卡 ---------- */

  function renderTodayCard() {
    const bar = document.querySelector('.page[data-page="today"] .game-mode-bar');
    if (!bar) return;
    let box = document.getElementById("fn-today");
    if (!box) {
      box = document.createElement("div");
      box.id = "fn-today";
      box.className = "card fn-today";
      bar.after(box);
    }
    const show = gameOn() && hasDb() && FN.status && !FN.error;
    box.hidden = !show;
    if (!show) return;
    box.innerHTML = fortuneHtml(true) + `<button type="button" class="fn-more" data-fn="goto">🎁 驚喜：刮刮樂 ${qty("scratch_card")}・寶箱 ${
      qty("chest_wood") + qty("chest_iron") + qty("chest_gold") + qty("chest_star") + qty("chest_team")}・扭蛋幣 ${qty("gacha_coin")} ›</button>`;
  }


  /* ---------- 點擊 ---------- */

  function onClick(e) {
    const el = e.target.closest("[data-fn]");
    if (!el) return;
    const act = el.dataset.fn;
    if (act === "draw") drawFortune();
    else if (act === "resolve") resolveFortune();
    else if (act === "scratch") openScratch();
    else if (act === "scratch-all") revealScratch();
    else if (act === "scratch-close") { FN.scratch = null; rerender(); }
    else if (act === "chest") openChest(el.dataset.v);
    else if (act === "chest-close") { FN.chest = null; rerender(); }
    else if (act === "gacha") pullGacha();
    else if (act === "gacha-close") { FN.gacha = null; rerender(); }
    else if (act === "buy") buy(el.dataset.v);
    else if (act === "series") { FN.series = el.dataset.v; rerender(); }
    else if (act === "frame") equipFrame(el.dataset.v);
    else if (act === "goto") {
      if (window.RpgGame) window.RpgGame.state.tab = "fun";
      if (typeof showPage === "function") showPage("rpg");
    }
  }


  /* ---------- 樣式 ---------- */

  function injectStyle() {
    if (document.getElementById("fn-style")) return;
    const css = document.createElement("style");
    css.id = "fn-style";
    css.textContent = `
      body:not(.game-mode-on) #fn-today { display: none !important; }
      .fn-img { display: block; object-fit: contain; user-select: none; -webkit-user-drag: none; }
      .fn-note { font-size: 13px; opacity: .78; margin: 4px 0; line-height: 1.5; }
      .fn-tag { display: inline-block; font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 99px; background: #6c4bd8; color: #fff; vertical-align: middle; }
      .fn-wide { width: 100%; margin: 8px 0; }
      .fn-sec-top { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
      .fn-sec-top > div:nth-child(2) { flex: 1; min-width: 0; }
      .fn-ic { width: 52px; height: 52px; }
      .fn-today { padding: 12px 14px; }
      .fn-more { display: block; width: 100%; margin-top: 8px; padding: 8px; border: 0; border-radius: 10px; background: rgba(108,75,216,.12); color: inherit; font-weight: 700; text-align: left; cursor: pointer; }

      .fn-fortune { display: flex; align-items: center; gap: 12px; }
      .fn-fortune-body { flex: 1; min-width: 0; }
      .fn-box { width: 84px; height: 84px; flex: none; }
      .fn-paper { width: 96px; height: 96px; flex: none; }
      .fn-fortune.pop .fn-paper { animation: fn-pop .7s cubic-bezier(.2,1.6,.4,1); }
      .fn-fortune-kind { font-size: 26px; font-weight: 900; letter-spacing: 2px; }
      .fn-poem { margin: 4px 0; font-size: 15px; line-height: 1.6; font-weight: 600; }
      .fn-resolve .btn { white-space: nowrap; flex: none; }
      .fn-resolve { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; padding: 8px 10px; border-radius: 10px; background: rgba(107,91,149,.14); font-size: 13px; }

      .shake { animation: fn-shake .35s ease-in-out infinite; }
      .pop { animation: fn-pop .6s cubic-bezier(.2,1.6,.4,1); }
      .bob { animation: fn-bob 2.2s ease-in-out infinite; }
      @keyframes fn-shake { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-9deg) translateY(-3px); } 75% { transform: rotate(9deg) translateY(-3px); } }
      @keyframes fn-pop { 0% { transform: scale(.3) rotate(-12deg); opacity: 0; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
      @keyframes fn-bob { 50% { transform: translateY(-5px); } }
      @keyframes fn-drop { 0% { transform: translateY(-90px) scale(.6); } 70% { transform: translateY(8px) scale(1); } 100% { transform: translateY(0); } }
      @keyframes fn-glow { 0%,100% { box-shadow: 0 0 0 rgba(255,193,7,0); } 50% { box-shadow: 0 0 18px rgba(255,193,7,.8); } }

      .fn-scard { max-width: 300px; margin: 6px auto; padding: 10px; border-radius: 14px; background: linear-gradient(160deg, #fbf3df, #f1e2bd); border: 3px solid #c9a35b; color: #5b4320; }
      .fn-scard-title { text-align: center; font-weight: 900; letter-spacing: 6px; margin-bottom: 8px; }
      .fn-sgrid-wrap { position: relative; }
      .fn-sgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
      .fn-cell { aspect-ratio: 1; border-radius: 10px; background: #fffaf0; border: 1px solid #e3cf9f; display: flex; align-items: center; justify-content: center; }
      .fn-cell.win { animation: fn-glow 1s ease-in-out infinite; border-color: #ffc107; }
      .fn-sym { width: 82%; height: 82%; }
      .fn-scover { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 10px; touch-action: none; cursor: crosshair; }
      .fn-result { margin: 8px 0; padding: 10px; border-radius: 12px; background: rgba(108,75,216,.12); text-align: center; font-weight: 700; line-height: 1.6; }
      .fn-result.big { background: linear-gradient(90deg, rgba(255,193,7,.3), rgba(255,138,101,.3)); font-size: 17px; }
      .fn-result.lose { background: rgba(127,127,127,.14); }

      .fn-chests { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .fn-chest { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 10px 6px; border-radius: 12px; background: rgba(127,127,127,.08); text-align: center; }
      .fn-chest.none .fn-chest-ic { filter: grayscale(.9); opacity: .45; }
      .fn-chest-ic { width: 64px; height: 64px; }
      .fn-chest-show { text-align: center; padding: 6px 0 12px; }
      .fn-chest-big { width: 160px; height: 160px; margin: 0 auto; }

      .fn-stage { min-height: 200px; display: flex; align-items: center; justify-content: center; }
      .fn-machine { width: 180px; height: 180px; }
      .fn-capsule { width: 130px; height: 130px; }
      .fn-capsule.drop { animation: fn-drop .6s ease-out; }
      .fn-mon-reveal { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; animation: fn-pop .6s cubic-bezier(.2,1.6,.4,1); }
      .fn-mon-reveal.secret b { color: #e8a317; }
      .fn-mon-emo { font-size: 30px; line-height: 1; display: inline-flex; width: 40px; height: 40px; align-items: center; justify-content: center; }
      .fn-mon-emo.big { font-size: 72px; width: 120px; height: 120px; }
      .fn-mon-img { width: 44px; height: 44px; object-fit: contain; }
      .fn-mon-img.big { width: 150px; height: 150px; }
      .fn-shelf { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 6px; margin-top: 10px; padding: 10px; border-radius: 12px;
        background: linear-gradient(180deg, rgba(160,110,60,.10), rgba(160,110,60,.18)); }
      .fn-shelf-item { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 11px; text-align: center; padding: 4px 2px; border-bottom: 3px solid rgba(140,90,40,.35); }
      .fn-shelf-item.locked { opacity: .45; }
      .fn-shelf-item.secret:not(.locked) { background: radial-gradient(circle, rgba(255,215,64,.35), transparent 70%); }
      .fn-shelf-item i { position: absolute; top: 0; right: 4px; font-style: normal; font-weight: 800; font-size: 11px; color: #6c4bd8; }

      .fn-merchant-img { width: 76px; height: 76px; flex: none; }
      .fn-merchant-img.dim { filter: grayscale(.6); opacity: .55; }
      .fn-av { position: relative; display: inline-flex; align-items: center; justify-content: center; width: var(--s); height: var(--s); flex: none; }
      .fn-av-face, .fn-av-emo { width: 70%; height: 70%; border-radius: 50%; object-fit: cover; background: rgba(127,127,127,.15); display: inline-flex; align-items: center; justify-content: center; font-size: calc(var(--s) * .4); }
      .fn-av:not(.has) .fn-av-face, .fn-av:not(.has) .fn-av-emo { width: 92%; height: 92%; }
      .fn-av-frame { position: absolute; inset: -6%; width: 112%; height: 112%; object-fit: contain; pointer-events: none; transform: translateY(3%); }
      .fn-av.is-crown .fn-av-face, .fn-av.is-crown .fn-av-emo { width: 80%; height: 80%; margin-top: 22%; }
      .fn-av-frame.crown { inset: auto; top: -26%; left: 8%; width: 84%; height: 84%; transform: none; }
      .fn-frames { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
      .fn-frame { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 2px; border-radius: 12px; border: 1px solid rgba(127,127,127,.2); background: rgba(127,127,127,.06); color: inherit; font-size: 12px; cursor: pointer; text-align: center; }
      .fn-frame .rp-sub { font-size: 10px; line-height: 1.3; }
      .fn-frame.locked { cursor: default; } .fn-frame.locked .fn-frame-ic { filter: grayscale(1) brightness(.6); opacity: .5; }
      .fn-frame.on { border-color: #6c4bd8; box-shadow: 0 0 0 2px rgba(108,75,216,.4); }
      .fn-frame-ic { width: 56px; height: 56px; }
      .fn-chest-emo { display: inline-flex; align-items: center; justify-content: center; font-size: 44px; }
      .fn-chest-emo.fn-chest-big { font-size: 110px; display: flex; margin: 0 auto; }
      .fn-frame-emo { display: inline-flex; align-items: center; justify-content: center; font-size: 30px; border-radius: 50%; border: 3px solid rgba(108,75,216,.5); }
      .fn-series { display: flex; gap: 6px; margin: 4px 0 6px; }
      .fn-series-btn { flex: 1; padding: 7px 4px; border-radius: 10px; border: 1px solid rgba(127,127,127,.25); background: transparent; color: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
      .fn-series-btn.on { background: #6c4bd8; color: #fff; border-color: #6c4bd8; }
      .fn-got-frame { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 8px; color: #e8a317; }
      .fn-shop { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .fn-shop-item { display: flex; flex-direction: column; gap: 4px; padding: 10px; border-radius: 12px; background: rgba(127,127,127,.08); }
      .fn-shop-item.sale { background: rgba(255,167,38,.14); border: 1px solid rgba(255,167,38,.5); }
      @media (max-width: 380px) { .fn-frames { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      .fn-shop-item s { opacity: .5; } .fn-shop-item i { font-style: normal; color: #e65100; font-weight: 800; }
    `;
    document.head.appendChild(css);
  }


  /* ---------- 接上網站 ---------- */

  function boot() {
    injectStyle();
    document.addEventListener("click", onClick);
    renderTodayCard();
    if (hasDb()) load();
  }

  /* 簽到之後、切到今日頁、開關遊戲模式時，重新讀一次 */
  if (typeof window.gameCheckin === "function") {
    const base = window.gameCheckin;
    window.gameCheckin = async function () {
      const r = await base.apply(this, arguments);
      load();
      return r;
    };
  }
  if (typeof window.applyPage === "function") {
    const base = window.applyPage;
    window.applyPage = function (name) {
      const r = base.apply(this, arguments);
      if (name === "today" && hasDb()) load();
      return r;
    };
  }
  if (typeof window.renderGameModeToggle === "function") {
    const base = window.renderGameModeToggle;
    window.renderGameModeToggle = function () {
      const r = base.apply(this, arguments);
      try { renderTodayCard(); } catch (e) { console.warn(e); }
      return r;
    };
  }

  /* 登入比這個檔案晚：等 currentUser 出現再讀 */
  let waited = 0;
  const waitLogin = setInterval(() => {
    if (hasDb()) { clearInterval(waitLogin); if (!FN.status) load(); }
    if (++waited > 60) clearInterval(waitLogin);
  }, 1000);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.FunGame = { version: FUN_JS_VERSION, html, reload: load, state: FN, avatar };

})();
