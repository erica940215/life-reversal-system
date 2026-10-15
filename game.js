/* =========================================================
   🎲 序光計畫：遊戲功能
   只在主頁「遊戲模式：開」的時候出現，關閉時畫面和原本一樣。
   之後的遊戲功能（抽獎、圖鑑、主線王…）都放在這個檔案。

   需要 script.js 先載入（會用到 db、currentUser、getToday、
   shiftDate、showToast、escapeHtml、afterRewardChange）。
   script.js 有沒有遊戲模式那一段都可以用（沒有的話這裡自己處理開關）。
========================================================= */

/* 版本號：會顯示在簽到卡最下面，用來確認瀏覽器載入的是新版 */
const GAME_JS_VERSION = "2026-10-16 v7";


/* =========================================================
   1. 規則（和資料庫的 daily_checkin 一致，改數字要兩邊一起改）
========================================================= */

const GAME_CHECKIN_EXP = 5;

/* 爆擊機率：第 1 天 5%，每天 +2%，最高 35%；每連續 7 天必定爆擊 */
function gameCheckinCritChance(streak) {
  if (streak % 7 === 0) return 100;
  return Math.min(5 + 2 * (streak - 1), 35);
}

/* 金幣：10 起跳，連續每多一天 +1，最多 20；爆擊 ×2 */
function gameCheckinGold(streak) {
  return 10 + Math.min(streak - 1, 10);
}


/* =========================================================
   2. 接上遊戲模式開關
   新版 script.js：它的 loadGameMode / toggleGameMode 最後都會呼叫
   renderGameModeToggle()，在它後面接著更新遊戲區塊。
   舊版 script.js（沒有遊戲模式）：開關改由這裡處理。
========================================================= */

const GAME_HAS_CORE = typeof renderGameModeToggle === "function";

let gameFallbackOn = false;   // 只有 script.js 是舊版時才會用到


function gameIsOn() {

  if (GAME_HAS_CORE) {
    return typeof gameMode !== "undefined" && gameMode === true;
  }

  return gameFallbackOn;

}


if (GAME_HAS_CORE) {

  const gameBaseRenderToggle = renderGameModeToggle;

  renderGameModeToggle = function () {
    gameBaseRenderToggle();
    gameOnModeChange();
  };

} else {

  window.renderGameModeToggle = function () {

    document.body.classList.toggle("game-mode-on", gameFallbackOn);

    const btn = document.getElementById("game-mode-toggle");

    if (btn) {
      btn.textContent = gameFallbackOn ? "🎲 遊戲模式：開" : "🎲 遊戲模式：關";
      btn.classList.toggle("is-on", gameFallbackOn);
      btn.setAttribute("aria-pressed", String(gameFallbackOn));
    }

    gameOnModeChange();

  };


  window.loadGameMode = async function () {

    if (!currentUser) return;

    const { data, error } = await db
      .from("user_settings")
      .select("game_mode")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) {
      console.warn("遊戲模式載入失敗：", error);
      gameFallbackOn = false;
    } else {
      gameFallbackOn = data?.game_mode === true;
    }

    renderGameModeToggle();

  };


  window.toggleGameMode = async function () {

    if (!currentUser) return;

    const next = !gameFallbackOn;

    gameFallbackOn = next;
    renderGameModeToggle();

    const { error } = await db
      .from("user_settings")
      .upsert(
        { user_id: currentUser.id, game_mode: next, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("遊戲模式儲存失敗：", error);
      alert("遊戲模式儲存失敗：" + error.message);
      gameFallbackOn = !next;
      renderGameModeToggle();
    }

  };


  /* 舊版 script.js 載入今日資料時不會讀遊戲模式，這裡接在後面補讀 */
  if (typeof loadTodayModules === "function") {

    const gameBaseLoadToday = loadTodayModules;

    loadTodayModules = async function (...args) {
      const result = await gameBaseLoadToday.apply(this, args);
      await loadGameMode();
      return result;
    };

  }

}


function gameOnModeChange() {

  const on = gameIsOn() && !!currentUser;

  const chip = gameEnsureChip();
  const card = gameEnsureMonthCard();

  if (chip) chip.hidden = !on;
  if (card) card.hidden = !on;

  if (!on) {
    gameClosePopup();
    return;
  }

  const stale =
    !gameCheckinState.loaded ||
    gameCheckinState.date !== getToday() ||
    gameCheckinState.userId !== currentUser.id;

  if (stale) {
    loadGameCheckin();
  } else {
    renderGameCheckin();
  }

}


/* =========================================================
   3. 📅 每日簽到
   - 主頁：只有遊戲模式按鈕旁邊一個小按鈕，點了打開簽到彈窗
   - 彈窗：今天還沒簽，每次打開網頁都會自動跳出來
   - 日曆頁：本月簽到月曆、每月獎勵、補簽、規則
========================================================= */

let gameCheckinState = {
  loaded: false,
  loading: false,
  busy: false,
  error: null,
  userId: null,
  date: null,
  rows: [],          // 這個月 ＋ 最近 8 天的簽到紀錄（新的在前）
  realCount: 0,      // 真正簽到（不含補簽）的次數，最多算到 8（判斷新手保護期用）
  items: {},         // 背包 { item_key: 數量 }
  todayItems: [],    // 今天簽到拿到的券
  justDone: null     // 剛剛簽到的結果（用來播動畫）
};


/* 主頁：遊戲模式按鈕旁邊的「📅 簽到」小按鈕 */
function gameEnsureChip() {

  let chip = document.getElementById("game-checkin-chip");

  if (chip) return chip;

  const bar = document.querySelector(".game-mode-bar");

  if (!bar) return null;

  chip = document.createElement("button");
  chip.id = "game-checkin-chip";
  chip.type = "button";
  chip.className = "game-checkin-chip";
  chip.hidden = true;
  chip.textContent = "📅 簽到";
  chip.addEventListener("click", () => gameOpenPopup());

  bar.prepend(chip);

  return chip;

}


/* 日曆頁：本月簽到卡（放在日曆下面、Google 日曆上面） */
function gameEnsureMonthCard() {

  let card = document.getElementById("game-month-card");

  if (card) return card;

  const page = document.querySelector('.page[data-page="calendar"]');

  if (!page) return null;

  card = document.createElement("section");
  card.className = "card game-checkin";
  card.id = "game-month-card";
  card.hidden = true;

  const firstCard = page.querySelector("section.card");

  if (firstCard) {
    firstCard.after(card);
  } else {
    page.appendChild(card);
  }

  return card;

}


async function loadGameCheckin() {

  if (!currentUser || gameCheckinState.loading) return;

  const today = getToday();

  gameCheckinState.loading = true;

  /* 這個月全部（月曆、每月獎勵、補簽要用）＋最近 8 天（連續天數要用） */
  const monthStart = today.slice(0, 8) + "01";
  const weekAgo = shiftDate(today, -7);
  const from = monthStart < weekAgo ? monthStart : weekAgo;

  const uid = currentUser.id;

  const [checkinsResult, realResult, itemsResult, todayResult] = await Promise.all([

    db.from("checkins")
      .select("checkin_date, streak, crit, crit_chance, exp, gold, is_makeup, cost")
      .eq("user_id", uid)
      .gte("checkin_date", from)
      .order("checkin_date", { ascending: false }),

    /* 新手保護期只看前 7 次，所以最多抓 8 筆就夠判斷 */
    db.from("checkins")
      .select("checkin_date")
      .eq("user_id", uid)
      .eq("is_makeup", false)
      .limit(8),

    db.from("player_items")
      .select("item_key, qty")
      .eq("user_id", uid),

    db.from("item_events")
      .select("item_key, delta")
      .eq("user_id", uid)
      .eq("source_key", "checkin:" + today)

  ]);

  const error = checkinsResult.error || realResult.error || itemsResult.error || todayResult.error;

  gameCheckinState.loading = false;
  gameCheckinState.loaded = true;
  gameCheckinState.userId = currentUser.id;
  gameCheckinState.date = today;

  if (error) {
    console.warn("簽到紀錄載入失敗：", error);
    gameCheckinState.error = error.message;
    gameCheckinState.rows = [];
  } else {
    gameCheckinState.error = null;
    gameCheckinState.rows = checkinsResult.data || [];
    gameCheckinState.realCount = (realResult.data || []).length;
    gameCheckinState.items = {};
    for (const row of itemsResult.data || []) gameCheckinState.items[row.item_key] = row.qty;
    gameCheckinState.todayItems = (todayResult.data || []).map(row => ({ key: row.item_key, qty: row.delta }));
  }

  renderGameCheckin();

}


/* 算出現在的狀態：今天簽了沒、連續幾天、下一次是第幾天 */
function gameCheckinSummary() {

  const today = getToday();
  const yesterday = shiftDate(today, -1);
  const rows = gameCheckinState.rows;

  const todayRow = rows.find(r => r.checkin_date === today) || null;
  const yesterdayRow = rows.find(r => r.checkin_date === yesterday) || null;

  /* 已簽到：連續天數就是今天那筆；還沒簽：接昨天的（昨天沒簽就是 0） */
  const streak = todayRow
    ? todayRow.streak
    : (yesterdayRow ? yesterdayRow.streak : 0);

  /* 下一次簽到會是第幾天（今天簽了 → 明天） */
  const nextStreak = streak + 1;

  /* 有舊紀錄、但昨天和今天都沒有 → 斷簽了 */
  const broken = !todayRow && !yesterdayRow && rows.length > 0;

  /* 這一輪 7 天裡，每一天有沒有爆擊（從今天 / 昨天往回連續找） */
  const critByStreak = {};
  let expect = todayRow ? today : yesterday;

  for (const row of rows) {
    if (row.checkin_date !== expect) continue;
    critByStreak[row.streak] = row.crit;
    expect = shiftDate(expect, -1);
  }

  return { today, todayRow, streak, nextStreak, broken, critByStreak };

}


function renderGameCheckin() {

  renderGameChip();
  renderGameMonthCard();
  gameRefreshPopup();

}


function renderGameChip() {

  const chip = document.getElementById("game-checkin-chip");

  if (!chip || chip.hidden) return;

  if (!gameCheckinState.loaded || gameCheckinState.error) {
    chip.textContent = "📅 簽到";
    chip.classList.remove("is-done");
    return;
  }

  const s = gameCheckinSummary();

  chip.classList.toggle("is-done", !!s.todayRow);
  chip.textContent = s.todayRow ? `✅ 已簽到・🔥 ${s.streak} 天` : "📅 簽到";

}


function renderGameMonthCard() {

  const card = document.getElementById("game-month-card");

  if (!card || card.hidden) return;

  const loaded = gameCheckinState.loaded && !gameCheckinState.error;
  const signed = loaded && !!gameCheckinSummary().todayRow;

  const head = `
    <div class="card-head">
      <h2>📆 簽到月曆</h2>
      <button class="btn btn-small ${signed ? "" : "btn-primary"}" type="button" onclick="gameOpenPopup()">
        ${signed ? "✅ 今天已簽到" : "📅 今天簽到"}
      </button>
    </div>`;

  const rules = gameCheckinRulesHtml(true);

  if (!gameCheckinState.loaded) {
    card.innerHTML = head + `<span class="small-note">載入中...</span>` + rules;
    return;
  }

  if (gameCheckinState.error) {
    card.innerHTML = head + gameSetupErrorHtml() + rules;
    return;
  }

  card.innerHTML = head + gameNextTicketsHtml(gameCheckinSummary()) + gameBackpackHtml() + gameMonthHtml() + rules;

}


function gameSetupErrorHtml() {

  return `
    <div class="ck-error">
      簽到功能還沒設定好：請先到 Supabase 的 SQL Editor 執行「更新_2點換日_補簽_反省.sql」，再重新整理。
      <div class="small-note">${escapeHtml(gameCheckinState.error || "")}</div>
    </div>`;

}


/* 連續 7 天的格子（第 7 天必定爆擊） */
function gameStreakDotsHtml(s) {

  const done = !!s.todayRow;

  /* 這一輪 7 格：目前停在第幾輪 */
  const shown = done ? s.streak : s.nextStreak;
  const cycleStart = Math.floor((shown - 1) / 7) * 7 + 1;

  let dots = "";

  for (let day = cycleStart; day < cycleStart + 7; day++) {

    const isDone = day <= s.streak;
    const isNext = !done && day === s.nextStreak;
    const isCrit = isDone && s.critByStreak[day] === true;
    const isBonus = day % 7 === 0;

    const cls = [
      "ck-dot",
      isDone ? "done" : "",
      isCrit ? "crit" : "",
      isNext ? "next" : "",
      isBonus ? "bonus" : "",
      isDone && done && day === s.streak && gameCheckinState.justDone ? "pop" : ""
    ].filter(Boolean).join(" ");

    const icon = isCrit ? "💥" : (isDone ? "✓" : (isBonus ? "💥" : ""));

    dots += `
      <div class="${cls}" title="連續第 ${day} 天">
        <span class="ck-day">${day}</span>
        <span class="ck-icon">${icon}</span>
      </div>`;
  }

  return `<div class="ck-dots">${dots}</div>`;

}


/* 簽到規則：日曆頁預設展開；彈窗裡收起來 */
function gameCheckinRulesHtml(open) {

  const startHour = typeof DAY_START_HOUR === "number" ? DAY_START_HOUR : 0;

  return `
    <details class="ck-rules" ${open ? "open" : ""}>
      <summary>📖 簽到規則</summary>
      <ul>
        <li>每天按一次「📅 簽到」，可以拿到 +${GAME_CHECKIN_EXP} EXP 和金幣。金幣從 10 開始，連續每多一天 +1，最多 20。</li>
        <li>爆擊時獎勵 ×2。爆擊機率第 1 天是 5%，之後每天 +2%，最高 35%。</li>
        <li>每連續第 7 天必定爆擊，那天的按鈕會變成金色。</li>
        <li>昨天沒簽就算斷簽，連續天數從第 1 天重新算。</li>
        <li>一天從凌晨 ${startHour} 點開始：凌晨 0 點到 ${startHour} 點前簽到，算前一天。</li>
        <li>每月獎勵（當月累計，不用連續）：累計 7 天 +${GAME_MONTH7.gold} 金幣・+${GAME_MONTH7.exp} EXP；當月每天都簽（全勤）再 +${GAME_MONTH_ALL.gold} 金幣・+${GAME_MONTH_ALL.exp} EXP。每個月各領一次。</li>
        <li>簽到發券（召喚券和星願瓶一起發）：新手保護期（前 7 次簽到）第 2、4、6 次各 1 張普通，第 7 次 1 張特殊／稀有；之後連續每滿 3 天 1 張普通、每滿 7 天 1 張特殊／稀有。</li>
        <li>每月累計 7 天另外給限定召喚券、限定星願瓶各 1 張；全勤再各 2 張。</li>
        <li>補簽：在「📅 日曆」頁的簽到月曆點沒簽的日子（只能補這個月、今天以前）。這個月第 1 次 ${GAME_MAKEUP_BASE} 金幣，之後每次多 ${GAME_MAKEUP_STEP}。補簽不拿當天的簽到獎勵和簽到券，但會接回連續天數、算進每月累計。</li>
        <li>爆擊和獎勵都由資料庫決定，從網頁端改不了，連按兩次也只算一次。</li>
      </ul>
      <div class="ck-version">game.js 版本：${GAME_JS_VERSION}</div>
    </details>`;

}


async function gameCheckin() {

  if (!currentUser || gameCheckinState.busy) return;

  gameCheckinState.busy = true;
  renderGameCheckin();

  const { data, error } = await db.rpc("daily_checkin");

  gameCheckinState.busy = false;

  if (error) {
    console.error("簽到失敗：", error);
    alert("簽到失敗：" + error.message);
    renderGameCheckin();
    return;
  }

  /* 把結果放進紀錄（不用再讀一次資料庫） */
  const row = {
    checkin_date: data.checkin_date,
    streak: data.streak,
    crit: data.crit,
    crit_chance: data.crit_chance,
    exp: data.exp,
    gold: data.gold,
    is_makeup: false,
    cost: 0
  };

  gameCheckinState.rows = [
    row,
    ...gameCheckinState.rows.filter(r => r.checkin_date !== row.checkin_date)
  ];

  gameCheckinState.justDone = data.already ? null : row;

  if (!data.already) {
    gameCheckinState.realCount += 1;
    gameCheckinState.todayItems = data.items || [];
    for (const item of data.items || []) {
      gameCheckinState.items[item.key] = (gameCheckinState.items[item.key] || 0) + item.qty;
    }
  }

  renderGameCheckin();

  gameCheckinState.justDone = null;

  if (!data.already) {
    showToast(
      (data.crit
        ? `💥 爆擊！簽到獎勵 ×2：+${data.gold} 金幣 / +${data.exp} EXP`
        : `📅 簽到成功（連續 ${data.streak} 天）：+${data.gold} 金幣 / +${data.exp} EXP`) +
      gameMonthBonusText(data) +
      ((data.items || []).length ? `　🎁 ${gameItemsText(data.items)}` : "")
    );
  }

  /* 更新上方的等級 / 金幣和今日獎勵 */
  await afterRewardChange(data, null, null);

}


/* =========================================================
   3-a. 📆 本月簽到：每月獎勵 ＋ 補簽
========================================================= */

const GAME_MONTH7 = { exp: 20, gold: 50 };        // 當月累計 7 天
const GAME_MONTH_ALL = { exp: 100, gold: 300 };   // 當月全勤
const GAME_MAKEUP_BASE = 30;                      // 這個月第 1 次補簽
const GAME_MAKEUP_STEP = 20;                      // 之後每次多多少


/* 剛拿到的每月獎勵 → 接在提示後面的文字 */
function gameMonthBonusText(data) {

  let text = "";

  if (data && data.bonus7) {
    text += `　🎁 本月累計 7 天：+${GAME_MONTH7.gold} 金幣 / +${GAME_MONTH7.exp} EXP`;
  }

  if (data && data.bonus_all) {
    text += `　🏆 本月全勤：+${GAME_MONTH_ALL.gold} 金幣 / +${GAME_MONTH_ALL.exp} EXP`;
  }

  return text;

}


function gameMonthSummary() {

  const today = getToday();
  const [y, m] = today.split("-").map(Number);
  const monthStart = today.slice(0, 8) + "01";
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;   // 週一 = 0

  const rows = gameCheckinState.rows.filter(r => r.checkin_date >= monthStart && r.checkin_date <= today.slice(0, 8) + "31");
  const byDate = {};

  for (const row of rows) byDate[row.checkin_date] = row;

  const count = rows.length;
  const makeupsUsed = rows.filter(r => r.is_makeup).length;
  const nextCost = GAME_MAKEUP_BASE + GAME_MAKEUP_STEP * makeupsUsed;
  const missed = [];

  for (let d = 1; d <= days; d++) {
    const date = today.slice(0, 8) + String(d).padStart(2, "0");
    if (date < today && !byDate[date]) missed.push(date);
  }

  return { today, y, m, monthStart, days, firstWeekday, byDate, count, makeupsUsed, nextCost, missed };

}


function gameMonthHtml() {

  const ms = gameMonthSummary();

  const goal = (reached, label, reward, progressText, ratio) => `
    <div class="ck-goal ${reached ? "done" : ""}">
      <div class="ck-goal-top">
        <span>${label}</span>
        <span class="ck-goal-reward">${reward}</span>
      </div>
      <div class="ck-bar"><i style="width:${Math.round(Math.min(ratio, 1) * 100)}%"></i></div>
      <div class="ck-goal-state">${reached ? "✅ 已領取" : progressText}</div>
    </div>`;

  let cells = ["一", "二", "三", "四", "五", "六", "日"]
    .map(w => `<div class="ck-cal-head">${w}</div>`).join("");

  for (let i = 0; i < ms.firstWeekday; i++) cells += `<div class="ck-cal-blank"></div>`;

  for (let d = 1; d <= ms.days; d++) {

    const date = ms.today.slice(0, 8) + String(d).padStart(2, "0");
    const row = ms.byDate[date];

    if (row) {
      const kind = row.is_makeup ? "makeup" : (row.crit ? "crit" : "done");
      const icon = row.is_makeup ? "補" : (row.crit ? "💥" : "✓");
      const title = row.is_makeup ? `補簽（${row.cost} 金幣）` : (row.crit ? "爆擊" : "已簽到");
      cells += `
        <div class="ck-cal-day ${kind} ${date === ms.today ? "is-today" : ""}" title="${ms.m}/${d} ${title}">
          <span>${d}</span><b>${icon}</b>
        </div>`;
    } else if (date < ms.today) {
      cells += `
        <button class="ck-cal-day missed" type="button" title="補簽 ${ms.m}/${d}（${ms.nextCost} 金幣）"
          onclick="gameMakeup('${date}')" ${gameCheckinState.busy ? "disabled" : ""}>
          <span>${d}</span><b>補簽</b>
        </button>`;
    } else if (date === ms.today) {
      cells += `
        <div class="ck-cal-day is-today pending" title="今天還沒簽到">
          <span>${d}</span><b>今天</b>
        </div>`;
    } else {
      cells += `
        <div class="ck-cal-day future">
          <span>${d}</span><b></b>
        </div>`;
    }

  }

  return `
    <div class="ck-month">
      <div class="ck-month-head">
        <b>📆 ${ms.m} 月簽到 ${ms.count} / ${ms.days} 天</b>
        <span class="small-note">
          ${ms.missed.length > 0
            ? `有 ${ms.missed.length} 天沒簽・點「補簽」花 ${ms.nextCost} 金幣`
            : "這個月目前沒有漏簽"}
        </span>
      </div>

      <div class="ck-goals">
        ${goal(ms.count >= 7, "🎁 累計 7 天", `+${GAME_MONTH7.gold} 金幣・+${GAME_MONTH7.exp} EXP`,
               `${Math.min(ms.count, 7)} / 7 天`, ms.count / 7)}
        ${goal(ms.count >= ms.days, `🏆 全勤 ${ms.days} 天`, `+${GAME_MONTH_ALL.gold} 金幣・+${GAME_MONTH_ALL.exp} EXP`,
               `${ms.count} / ${ms.days} 天`, ms.count / ms.days)}
      </div>

      <div class="ck-cal">${cells}</div>
    </div>`;

}


/* 💰 補簽：只能補這個月、今天以前沒簽的日子 */
async function gameMakeup(date) {

  if (!currentUser || gameCheckinState.busy) return;

  const ms = gameMonthSummary();
  const [, mm, dd] = date.split("-").map(Number);

  const ok = confirm(
    `補簽 ${mm}/${dd} 要花 ${ms.nextCost} 金幣（這個月第 ${ms.makeupsUsed + 1} 次補簽）。\n` +
    `補簽不會拿到當天的簽到獎勵，但會接回連續天數、算進本月累計。\n\n確定要補簽嗎？`
  );

  if (!ok) return;

  gameCheckinState.busy = true;
  renderGameCheckin();

  const { data, error } = await db.rpc("makeup_checkin", { p_date: date });

  gameCheckinState.busy = false;

  if (error) {
    console.error("補簽失敗：", error);
    alert("補簽失敗：" + error.message);
    renderGameCheckin();
    return;
  }

  showToast(
    `💰 補簽 ${mm}/${dd} 成功（−${data.cost} 金幣）` + gameMonthBonusText(data) +
    ((data.items || []).length ? `　🎁 ${gameItemsText(data.items)}` : "")
  );

  /* 補簽會改到後面幾天的連續天數，重新讀一次 */
  gameCheckinState.loaded = false;
  await loadGameCheckin();

  /* 金幣變了 → 更新上方的金幣和今日獎勵 */
  await loadPlayer();
  await loadTodayRewards();

}


/* =========================================================
   3-c. 🎒 背包與簽到發券
   物品代號和資料庫一致；發券規則和 checkin_ticket_rewards 一致（改要兩邊一起改）
========================================================= */

const GAME_ITEMS = {
  ticket_normal:  { name: "普通召喚券", short: "普通" },
  ticket_special: { name: "特殊召喚券", short: "特殊" },
  ticket_limited: { name: "限定召喚券", short: "限定" },
  wish_normal:    { name: "普通星願瓶", short: "普通" },
  wish_rare:      { name: "稀有星願瓶", short: "稀有" },
  wish_limited:   { name: "限定星願瓶", short: "限定" }
};


function gameItemsText(list) {

  return (list || [])
    .map(item => `${(GAME_ITEMS[item.key] || { name: item.key }).name} ×${item.qty}`)
    .join("、");

}


/* 第 index 次真正簽到、連續 streak 天時，會拿到哪種券 */
function gameTicketRule(index, streak) {

  if (index <= 7) {
    return { normal: [2, 4, 6].includes(index), special: index === 7 };
  }

  return { normal: streak % 3 === 0, special: streak % 7 === 0 };

}


/* 下一張普通券、特殊／稀有券還要簽幾天（假設之後每天都簽） */
function gameNextTickets(s) {

  const signed = !!s.todayRow;
  const baseIndex = gameCheckinState.realCount + 1;
  const baseStreak = signed ? s.streak + 1 : s.nextStreak;

  let normal = null;
  let special = null;

  for (let k = 0; k < 30 && (normal === null || special === null); k++) {
    const rule = gameTicketRule(baseIndex + k, baseStreak + k);
    if (normal === null && rule.normal) normal = k + 1;
    if (special === null && rule.special) special = k + 1;
  }

  return { signed, normal, special };

}


function gameNextTicketText(days, signed) {

  if (days === null) return "—";
  if (days === 1) return signed ? "明天簽到就拿" : "今天簽到就拿";

  return `再簽 ${days} 天`;

}


function gameNextTicketsHtml(s) {

  const next = gameNextTickets(s);
  const nth = next.signed ? gameCheckinState.realCount : gameCheckinState.realCount + 1;

  const newbie = nth <= 7
    ? `<div class="ck-newbie">🔰 新手保護期：第 ${nth} / 7 次簽到</div>`
    : "";

  return `
    ${newbie}
    <div class="ck-next">
      <span>🎁 普通券：<b>${gameNextTicketText(next.normal, next.signed)}</b></span>
      <span>✨ 特殊／稀有券：<b>${gameNextTicketText(next.special, next.signed)}</b></span>
    </div>`;

}


function gameBackpackHtml() {

  const qty = key => gameCheckinState.items[key] || 0;

  const row = (label, keys) => `
    <div class="ck-bag-row">
      <span class="ck-bag-label">${label}</span>
      ${keys.map(key => `<span class="ck-bag-item ${qty(key) > 0 ? "has" : ""}">${GAME_ITEMS[key].short} <b>${qty(key)}</b></span>`).join("")}
    </div>`;

  return `
    <div class="ck-bag">
      <div class="ck-bag-title">🎒 背包</div>
      ${row("🎫 召喚券", ["ticket_normal", "ticket_special", "ticket_limited"])}
      ${row("🌠 星願瓶", ["wish_normal", "wish_rare", "wish_limited"])}
      <div class="small-note">抽獎池開放後就能拿來抽</div>
    </div>`;

}


/* =========================================================
   3-b. 🪟 簽到彈窗
   今天還沒簽到，每次打開網頁都會自動跳出來（按「稍後再說」就先關掉，
   主頁的「📅 簽到」按鈕隨時能再打開）。簽完後顯示結果。
========================================================= */

let gamePopupAutoDate = null;   // 這次打開網頁，哪一天已經自動跳過了


function gameShouldAutoPopup() {

  if (!gameIsOn() || !currentUser) return false;

  if (!gameCheckinState.loaded || gameCheckinState.error) return false;

  const today = getToday();

  if (gameCheckinState.userId !== currentUser.id || gameCheckinState.date !== today) return false;

  if (gamePopupAutoDate === today) return false;

  return !gameCheckinSummary().todayRow;

}


/* 每次簽到資料重繪都會呼叫：彈窗開著就更新內容；沒開就看要不要自動跳 */
function gameRefreshPopup() {

  if (document.getElementById("game-ck-popup")) {
    gameRenderPopup();
    return;
  }

  if (gameShouldAutoPopup()) {
    gamePopupAutoDate = getToday();
    gameOpenPopup();
  }

}


function gameOpenPopup() {

  if (!gameIsOn()) return;

  if (!document.getElementById("game-ck-popup")) {

    const overlay = document.createElement("div");
    overlay.id = "game-ck-popup";
    overlay.className = "game-pop-overlay";
    overlay.addEventListener("click", e => {
      if (e.target === overlay) gameClosePopup();
    });

    document.body.appendChild(overlay);

  }

  gameRenderPopup();

}


function gameClosePopup() {

  const overlay = document.getElementById("game-ck-popup");

  if (overlay) overlay.remove();

}


/* 彈窗的「去日曆補簽」：跳到日曆頁的簽到月曆 */
function gameGoMakeup() {

  gameClosePopup();

  showPage("calendar");

  setTimeout(() => {
    const card = document.getElementById("game-month-card");
    if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 150);

}


function gameRenderPopup() {

  const overlay = document.getElementById("game-ck-popup");

  if (!overlay) return;

  const busy = gameCheckinState.busy;

  const wrap = inner => `
    <div class="game-pop-box game-checkin" role="dialog" aria-modal="true" aria-labelledby="game-pop-title">
      <button class="game-pop-close" type="button" aria-label="關閉" onclick="gameClosePopup()">✕</button>
      <div class="game-pop-title" id="game-pop-title">📅 今天的簽到</div>
      ${inner}
    </div>`;

  if (gameCheckinState.error) {
    overlay.innerHTML = wrap(gameSetupErrorHtml());
    return;
  }

  if (!gameCheckinState.loaded) {
    overlay.innerHTML = wrap(`<div class="small-note">載入中...</div>`);
    return;
  }

  const s = gameCheckinSummary();
  const ms = gameMonthSummary();

  const makeupLink = ms.missed.length > 0 ? `
    <button class="link-btn ck-go-makeup" type="button" onclick="gameGoMakeup()">
      📆 這個月有 ${ms.missed.length} 天沒簽 → 去日曆補簽
    </button>` : "";

  let body;

  if (s.todayRow) {

    const r = s.todayRow;
    const nextChance = gameCheckinCritChance(s.nextStreak);

    body = `
      ${gameStreakDotsHtml(s)}
      <div class="ck-result ${r.crit ? "is-crit" : ""} ${gameCheckinState.justDone ? "reveal" : ""}">
        <div class="ck-result-title">${r.crit ? "💥 爆擊！獎勵 ×2" : "✅ 今天簽到完成"}</div>
        <div class="ck-result-reward">+${r.gold} 金幣・+${r.exp} EXP</div>
        ${gameCheckinState.todayItems.length
          ? `<div class="ck-result-items">🎁 ${gameItemsText(gameCheckinState.todayItems)}</div>` : ""}
      </div>
      <div class="ck-stats">
        <div><b>${s.streak}</b><span>連續天數</span></div>
        <div><b>${nextChance}%</b><span>明天爆擊機率</span></div>
        <div><b>+${gameCheckinGold(s.nextStreak)}</b><span>明天金幣</span></div>
      </div>
      ${gamePopupMonthLine(true, ms)}
      ${gameNextTicketsHtml(s)}
      ${gameBackpackHtml()}
      ${makeupLink}
      <div class="game-pop-actions">
        <button class="btn btn-primary" type="button" onclick="gameClosePopup()">完成</button>
      </div>`;

  } else {

    const chance = gameCheckinCritChance(s.nextStreak);
    const gold = gameCheckinGold(s.nextStreak);

    body = `
      ${s.broken ? `<div class="ck-broken">昨天沒簽到，連續天數從第 1 天重新開始</div>` : ""}
      ${gameStreakDotsHtml(s)}
      <div class="ck-stats">
        <div><b>${s.streak}</b><span>目前連續</span></div>
        <div><b>${chance}%</b><span>今天爆擊機率</span></div>
        <div><b>+${gold}</b><span>今天金幣</span></div>
      </div>
      ${gamePopupMonthLine(false, ms)}
      ${gameNextTicketsHtml(s)}
      ${gameBackpackHtml()}
      ${makeupLink}
      <div class="game-pop-actions">
        <button
          class="btn btn-primary game-pop-btn ${chance === 100 ? "is-sure" : ""}"
          type="button"
          onclick="gameCheckin()"
          ${busy ? "disabled" : ""}
        >
          ${busy ? "簽到中..." : (chance === 100 ? "💥 簽到（今天必定爆擊！）" : "📅 簽到")}
        </button>
        <button class="btn" type="button" onclick="gameClosePopup()">稍後再說</button>
      </div>`;

  }

  overlay.innerHTML = wrap(body + gameCheckinRulesHtml(false));

}


/* 彈窗裡的一行本月進度 */
function gamePopupMonthLine(signedToday, ms) {

  const after = signedToday ? ms.count : ms.count + 1;   // 今天簽完之後的天數

  let goal;

  if (after < 7) {
    goal = `再簽 ${7 - after} 天拿 7 天獎勵（+${GAME_MONTH7.gold} 金幣）`;
  } else if (!signedToday && ms.count < 7) {
    goal = `今天簽完就拿到 7 天獎勵（+${GAME_MONTH7.gold} 金幣）！`;
  } else if (after < ms.days) {
    goal = `全勤還差 ${ms.days - after} 天（+${GAME_MONTH_ALL.gold} 金幣）`;
  } else if (!signedToday && ms.count < ms.days) {
    goal = `今天簽完就是全勤（+${GAME_MONTH_ALL.gold} 金幣）！`;
  } else {
    goal = "本月全勤達成 🏆";
  }

  return `<div class="game-pop-month">📆 ${ms.m} 月已簽 ${ms.count} 天・${goal}</div>`;

}


/* =========================================================
   4. 樣式（遊戲功能的樣式都放這裡，不用改 index.html）
========================================================= */

(function gameInjectStyle() {

  if (document.getElementById("game-style")) return;

  const style = document.createElement("style");
  style.id = "game-style";
  style.textContent = `
    .game-checkin .ck-dots {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 6px;
      margin-bottom: 14px;
    }

    .game-checkin .ck-dot {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-height: 52px;
      border-radius: 10px;
      background: #10131a;
      border: 1px solid #2c3342;
      color: #8a93a8;
      font-size: 12px;
    }

    .game-checkin .ck-dot .ck-icon {
      min-height: 16px;
      font-size: 14px;
      line-height: 16px;
    }

    .game-checkin .ck-dot.bonus:not(.done) .ck-icon {
      opacity: .45;
    }

    .game-checkin .ck-dot.done {
      background: #1f2547;
      border-color: #5865f2;
      color: #fff;
    }

    .game-checkin .ck-dot.crit {
      background: #3a2f12;
      border-color: #f5b942;
      color: #ffd978;
    }

    .game-checkin .ck-dot.next {
      border-style: dashed;
      border-color: #5865f2;
      color: #cfd6e4;
    }

    .game-checkin .ck-dot.pop {
      animation: ck-pop .5s ease-out;
    }

    .game-checkin .ck-stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 14px;
      text-align: center;
    }

    .game-checkin .ck-stats > div {
      padding: 10px 4px;
      border-radius: 10px;
      background: #10131a;
    }

    .game-checkin .ck-stats b {
      display: block;
      font-size: 20px;
    }

    .game-checkin .ck-stats span {
      font-size: 12px;
      opacity: .6;
    }

    .game-checkin .ck-btn {
      width: 100%;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
    }

    .game-checkin .ck-btn.is-sure {
      background: linear-gradient(90deg, #b8860b, #f5b942);
      color: #1a1405;
    }

    .game-checkin .ck-btn:disabled {
      opacity: .6;
      cursor: default;
    }

    .game-checkin .ck-result {
      padding: 14px;
      margin-bottom: 14px;
      border-radius: 12px;
      text-align: center;
      background: #10131a;
      border: 1px solid #2c3342;
    }

    .game-checkin .ck-result.is-crit {
      background: #3a2f12;
      border-color: #f5b942;
      color: #ffd978;
      box-shadow: 0 0 18px rgba(245, 185, 66, .25);
    }

    .game-checkin .ck-result.reveal {
      animation: ck-pop .5s ease-out;
    }

    .game-checkin .ck-result-title {
      font-size: 18px;
      font-weight: 700;
    }

    .game-checkin .ck-result-reward {
      margin-top: 4px;
      font-size: 14px;
      opacity: .85;
    }

    .game-checkin .ck-broken {
      margin-bottom: 12px;
      padding: 8px 12px;
      border-radius: 10px;
      background: #2a1d22;
      color: #ffb3c0;
      font-size: 13px;
    }

    .game-checkin .ck-error {
      line-height: 1.6;
      color: #ffb3c0;
    }

    .game-checkin .ck-rules {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid #2c3342;
      font-size: 13px;
    }

    .game-checkin .ck-rules summary {
      cursor: pointer;
      opacity: .8;
    }

    .game-checkin .ck-rules ul {
      margin: 8px 0 0;
      padding-left: 20px;
      line-height: 1.8;
      opacity: .85;
    }

    .game-checkin .ck-version {
      margin-top: 6px;
      font-size: 11px;
      opacity: .4;
      text-align: right;
    }

    .game-pop-overlay {
      position: fixed;
      inset: 0;
      z-index: 180;
      background: rgba(0, 0, 0, .6);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    .game-pop-box {
      position: relative;
      width: 100%;
      max-width: 420px;
      max-height: calc(100vh - 32px);
      overflow-y: auto;
      background: #181c26;
      border: 1px solid #5865f2;
      border-radius: 18px;
      padding: 22px;
      box-shadow: 0 15px 50px rgba(0, 0, 0, .5);
      animation: ck-pop .3s ease-out;
    }

    .game-pop-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 14px;
    }

    .game-pop-close {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 50%;
      background: #252b38;
      color: #fff;
      font-size: 15px;
    }

    .game-pop-box .ck-stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 14px;
      text-align: center;
    }

    .game-pop-box .ck-stats > div {
      padding: 10px 4px;
      border-radius: 10px;
      background: #10131a;
    }

    .game-pop-box .ck-stats b {
      display: block;
      font-size: 20px;
    }

    .game-pop-box .ck-stats span {
      font-size: 12px;
      opacity: .6;
    }

    .game-pop-box .ck-result {
      padding: 14px;
      margin-bottom: 14px;
      border-radius: 12px;
      text-align: center;
      background: #10131a;
      border: 1px solid #2c3342;
    }

    .game-pop-box .ck-result.is-crit {
      background: #3a2f12;
      border-color: #f5b942;
      color: #ffd978;
    }

    .game-pop-box .ck-result-title {
      font-size: 18px;
      font-weight: 700;
    }

    .game-pop-box .ck-result-reward {
      margin-top: 4px;
      font-size: 14px;
      opacity: .85;
    }

    .game-pop-box .ck-broken {
      margin-bottom: 12px;
      padding: 8px 12px;
      border-radius: 10px;
      background: #2a1d22;
      color: #ffb3c0;
      font-size: 13px;
    }

    .game-pop-box .ck-error {
      line-height: 1.6;
      color: #ffb3c0;
    }

    .game-pop-actions {
      display: flex;
      gap: 8px;
    }

    .game-pop-actions .btn {
      flex: 1;
      font-size: 15px;
      font-weight: 700;
    }

    .game-pop-btn.is-sure {
      background: linear-gradient(90deg, #b8860b, #f5b942);
      color: #1a1405;
    }

    .game-pop-btn:disabled {
      opacity: .6;
    }

    .game-checkin .ck-month {
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid #2c3342;
    }

    .game-checkin .ck-month-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 4px 10px;
      margin-bottom: 10px;
    }

    .game-checkin .ck-goals {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }

    .game-checkin .ck-goal {
      padding: 10px 12px;
      border-radius: 10px;
      background: #10131a;
      border: 1px solid #2c3342;
      font-size: 13px;
    }

    .game-checkin .ck-goal.done {
      border-color: #42d392;
    }

    .game-checkin .ck-goal-top {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 2px 8px;
      font-weight: 700;
    }

    .game-checkin .ck-goal-reward {
      font-weight: normal;
      color: #ffd76a;
      font-size: 12px;
    }

    .game-checkin .ck-bar {
      height: 6px;
      margin: 8px 0 4px;
      border-radius: 999px;
      background: #252b38;
      overflow: hidden;
    }

    .game-checkin .ck-bar i {
      display: block;
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, #5865f2, #9b6cff);
    }

    .game-checkin .ck-goal.done .ck-bar i {
      background: #42d392;
    }

    .game-checkin .ck-goal-state {
      font-size: 12px;
      opacity: .7;
    }

    .game-checkin .ck-cal {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 4px;
    }

    .game-checkin .ck-cal-head {
      text-align: center;
      font-size: 11px;
      opacity: .55;
      padding-bottom: 2px;
    }

    .game-checkin .ck-cal-day {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      min-width: 0;
      min-height: 42px;
      padding: 2px;
      border-radius: 8px;
      border: 1px solid #2c3342;
      background: #10131a;
      color: #8a93a8;
      font: inherit;
      font-size: 12px;
    }

    .game-checkin .ck-cal-day b {
      font-size: 11px;
      min-height: 14px;
      line-height: 14px;
      font-weight: 600;
    }

    .game-checkin .ck-cal-day.done {
      background: #1f2547;
      border-color: #5865f2;
      color: #fff;
    }

    .game-checkin .ck-cal-day.crit {
      background: #3a2f12;
      border-color: #f5b942;
      color: #ffd978;
    }

    .game-checkin .ck-cal-day.makeup {
      background: #1d2a24;
      border-color: #42d392;
      color: #7bed9f;
    }

    .game-checkin .ck-cal-day.missed {
      border-style: dashed;
      border-color: #ff6b81;
      color: #ffb3c0;
      cursor: pointer;
    }

    .game-checkin .ck-cal-day.missed:hover {
      background: #2a1d22;
    }

    .game-checkin .ck-cal-day.missed:disabled {
      opacity: .5;
      cursor: default;
    }

    .game-checkin .ck-cal-day.is-today {
      box-shadow: 0 0 0 2px #9b6cff;
    }

    .game-checkin .ck-cal-day.pending {
      color: #cfd6e4;
    }

    .game-checkin .ck-cal-day.future {
      opacity: .4;
    }

    .game-pop-month {
      margin-bottom: 14px;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(88, 101, 242, .12);
      border: 1px solid rgba(88, 101, 242, .35);
      font-size: 14px;
      line-height: 1.6;
    }

    @media (max-width: 500px) {
      .game-checkin .ck-goals {
        grid-template-columns: 1fr;
      }

      .game-checkin .ck-cal-day {
        min-height: 38px;
      }

      .game-checkin .ck-cal-day b {
        font-size: 10px;
      }
    }

    .game-checkin .ck-newbie {
      margin-bottom: 6px;
      font-size: 13px;
      color: #7bed9f;
    }

    .game-checkin .ck-next {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 14px;
      margin-bottom: 12px;
      font-size: 13px;
      color: #c9d1e3;
    }

    .game-checkin .ck-next b {
      color: #ffd76a;
    }

    .game-checkin .ck-bag {
      margin-bottom: 14px;
      padding: 10px 12px;
      border-radius: 10px;
      background: #10131a;
      border: 1px solid #2c3342;
    }

    .game-checkin .ck-bag-title {
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 6px;
    }

    .game-checkin .ck-bag-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 10px;
      font-size: 13px;
      margin-bottom: 4px;
    }

    .game-checkin .ck-bag-label {
      min-width: 76px;
      opacity: .8;
    }

    .game-checkin .ck-bag-item {
      padding: 1px 8px;
      border-radius: 999px;
      background: #1a1f2b;
      color: #8a93a8;
    }

    .game-checkin .ck-bag-item.has {
      background: #2a2410;
      color: #ffd978;
    }

    .game-checkin .ck-result-items {
      margin-top: 6px;
      font-size: 14px;
      color: #ffd978;
    }

    .game-mode-bar {
      gap: 8px;
      flex-wrap: wrap;
    }

    .game-checkin-chip {
      border: 1px solid #5865f2;
      background: #1f2547;
      color: #fff;
      border-radius: 999px;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }

    .game-checkin-chip.is-done {
      border-color: #3a4152;
      background: #252b38;
      color: #cfd6e4;
      font-weight: normal;
    }

    #game-month-card .ck-month {
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
    }

    .game-pop-box .ck-go-makeup {
      display: block;
      margin: -6px 0 14px;
      font-size: 14px;
      text-align: left;
    }

    @keyframes ck-pop {
      0%   { transform: scale(.85); opacity: 0; }
      60%  { transform: scale(1.06); opacity: 1; }
      100% { transform: scale(1); }
    }
  `;

  document.head.appendChild(style);

})();
