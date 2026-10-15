/* =========================================================
   🎲 序光計畫：遊戲功能
   只在主頁「遊戲模式：開」的時候出現，關閉時畫面和原本一樣。
   之後的遊戲功能（抽獎、圖鑑、主線王…）都放在這個檔案。

   需要 script.js 先載入（會用到 db、currentUser、getToday、
   shiftDate、showToast、escapeHtml、afterRewardChange）。
   script.js 有沒有遊戲模式那一段都可以用（沒有的話這裡自己處理開關）。
========================================================= */

/* 版本號：會顯示在簽到卡最下面，用來確認瀏覽器載入的是新版 */
const GAME_JS_VERSION = "2026-10-16 v5";


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

  const card = gameEnsureCheckinCard();

  if (!card) return;

  const on = gameIsOn() && !!currentUser;

  card.hidden = !on;

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
========================================================= */

let gameCheckinState = {
  loaded: false,
  loading: false,
  busy: false,
  error: null,
  userId: null,
  date: null,
  rows: [],          // 最近 8 天的簽到紀錄（新的在前）
  justDone: null     // 剛剛簽到的結果（用來播動畫）
};


function gameEnsureCheckinCard() {

  let card = document.getElementById("game-checkin-card");

  if (card) return card;

  const page = document.querySelector('.page[data-page="today"]');

  if (!page) return null;

  card = document.createElement("section");
  card.className = "card game-checkin";
  card.id = "game-checkin-card";
  card.hidden = true;

  const bar = page.querySelector(".game-mode-bar");

  if (bar) {
    bar.after(card);
  } else {
    page.prepend(card);
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

  const { data, error } = await db
    .from("checkins")
    .select("checkin_date, streak, crit, crit_chance, exp, gold, is_makeup, cost")
    .eq("user_id", currentUser.id)
    .gte("checkin_date", from)
    .order("checkin_date", { ascending: false });

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
    gameCheckinState.rows = data || [];
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

  const card = document.getElementById("game-checkin-card");

  if (!card || card.hidden) return;

  const head = `
    <div class="card-head">
      <h2>📅 每日簽到</h2>
      <span class="small-note">每連續 7 天必定爆擊・斷簽歸零</span>
    </div>`;

  const rules = gameCheckinRulesHtml();

  if (!gameCheckinState.loaded) {
    card.innerHTML = head + `<span class="small-note">載入中...</span>` + rules;
    return;
  }

  if (gameCheckinState.error) {
    card.innerHTML = head + `
      <div class="ck-error">
        簽到功能還沒設定好：請先到 Supabase 的 SQL Editor 執行「更新_2點換日_補簽_反省.sql」，再重新整理。
        <div class="small-note">${escapeHtml(gameCheckinState.error)}</div>
      </div>` + rules;
    return;
  }

  const s = gameCheckinSummary();
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
      isDone && s.todayRow && day === s.streak && gameCheckinState.justDone ? "pop" : ""
    ].filter(Boolean).join(" ");

    const icon = isCrit ? "💥" : (isDone ? "✓" : (isBonus ? "💥" : ""));

    dots += `
      <div class="${cls}" title="連續第 ${day} 天">
        <span class="ck-day">${day}</span>
        <span class="ck-icon">${icon}</span>
      </div>`;
  }

  let body;

  if (done) {

    const r = s.todayRow;
    const nextChance = gameCheckinCritChance(s.nextStreak);

    body = `
      <div class="ck-result ${r.crit ? "is-crit" : ""} ${gameCheckinState.justDone ? "reveal" : ""}">
        <div class="ck-result-title">
          ${r.crit ? "💥 爆擊！獎勵 ×2" : "✅ 今日已簽到"}
        </div>
        <div class="ck-result-reward">+${r.gold} 金幣・+${r.exp} EXP</div>
      </div>
      <div class="ck-stats">
        <div><b>${s.streak}</b><span>連續天數</span></div>
        <div><b>${nextChance}%</b><span>明天爆擊機率</span></div>
        <div><b>+${gameCheckinGold(s.nextStreak)}</b><span>明天金幣</span></div>
      </div>`;

  } else {

    const chance = gameCheckinCritChance(s.nextStreak);
    const gold = gameCheckinGold(s.nextStreak);

    body = `
      ${s.broken ? `<div class="ck-broken">昨天沒簽到，連續天數從第 1 天重新開始</div>` : ""}
      <div class="ck-stats">
        <div><b>${s.streak}</b><span>目前連續</span></div>
        <div><b>${chance}%</b><span>爆擊機率</span></div>
        <div><b>+${gold}</b><span>金幣</span></div>
      </div>
      <button
        class="btn btn-primary ck-btn ${chance === 100 ? "is-sure" : ""}"
        type="button"
        onclick="gameCheckin()"
        ${gameCheckinState.busy ? "disabled" : ""}
      >
        ${gameCheckinState.busy
          ? "簽到中..."
          : (chance === 100 ? "💥 簽到（今天必定爆擊！）" : "📅 簽到")}
      </button>`;

  }

  card.innerHTML = head + `<div class="ck-dots">${dots}</div>` + body + gameMonthHtml() + rules;

  gameRefreshPopup();

}


/* 簽到規則：預設展開，可以點標題收起來 */
function gameCheckinRulesHtml() {

  return `
    <details class="ck-rules" open>
      <summary>📖 簽到規則</summary>
      <ul>
        <li>每天按一次「📅 簽到」，可以拿到 +${GAME_CHECKIN_EXP} EXP 和金幣。金幣從 10 開始，連續每多一天 +1，最多 20。</li>
        <li>爆擊時獎勵 ×2。爆擊機率第 1 天是 5%，之後每天 +2%，最高 35%。</li>
        <li>每連續第 7 天必定爆擊，那天的按鈕會變成金色。</li>
        <li>昨天沒簽就算斷簽，連續天數從第 1 天重新算。</li>
        <li>一天從凌晨 ${typeof DAY_START_HOUR === "number" ? DAY_START_HOUR : 0} 點開始：凌晨 0 點到 ${typeof DAY_START_HOUR === "number" ? DAY_START_HOUR : 0} 點前簽到，算前一天。</li>
        <li>每月獎勵（當月累計，不用連續）：累計 7 天 +${GAME_MONTH7.gold} 金幣・+${GAME_MONTH7.exp} EXP；當月每天都簽（全勤）再 +${GAME_MONTH_ALL.gold} 金幣・+${GAME_MONTH_ALL.exp} EXP。每個月各領一次。</li>
        <li>補簽：在本月月曆點沒簽的日子（只能補這個月、今天以前）。這個月第 1 次 ${GAME_MAKEUP_BASE} 金幣，之後每次多 ${GAME_MAKEUP_STEP}。補簽不拿當天的簽到獎勵，但會接回連續天數、算進每月累計。</li>
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

  renderGameCheckin();

  gameCheckinState.justDone = null;

  if (!data.already) {
    showToast(
      (data.crit
        ? `💥 爆擊！簽到獎勵 ×2：+${data.gold} 金幣 / +${data.exp} EXP`
        : `📅 簽到成功（連續 ${data.streak} 天）：+${data.gold} 金幣 / +${data.exp} EXP`) +
      gameMonthBonusText(data)
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

  showToast(`💰 補簽 ${mm}/${dd} 成功（−${data.cost} 金幣）` + gameMonthBonusText(data));

  /* 補簽會改到後面幾天的連續天數，重新讀一次 */
  gameCheckinState.loaded = false;
  await loadGameCheckin();

  /* 金幣變了 → 更新上方的金幣和今日獎勵 */
  await loadPlayer();
  await loadTodayRewards();

}


/* =========================================================
   3-b. 🪟 簽到彈窗
   每天第一次打開遊戲模式、而且今天還沒簽到，就自動跳出來。
   同一天只自動跳一次（關掉後不會再跳），卡片上的按鈕隨時可以簽。
   簽完後彈窗會顯示結果，可以關掉。
========================================================= */

function gameAutoKey() {
  return "ck-popup:" + currentUser.id + ":" + getToday();
}

function gameAutoShownToday() {
  try {
    return localStorage.getItem(gameAutoKey()) === "1";
  } catch (e) {
    return false;   // 瀏覽器不給存（無痕模式等）就當作沒跳過
  }
}

function gameMarkAutoShown() {
  try {
    localStorage.setItem(gameAutoKey(), "1");
  } catch (e) {
    /* 存不起來沒關係，最多當天再跳一次 */
  }
}

function gameShouldAutoPopup() {

  if (!gameIsOn() || !currentUser) return false;

  if (!gameCheckinState.loaded || gameCheckinState.error) return false;

  if (gameCheckinState.userId !== currentUser.id || gameCheckinState.date !== getToday()) return false;

  if (gameCheckinSummary().todayRow) return false;

  return !gameAutoShownToday();

}


/* 每次卡片重繪都會呼叫：彈窗開著就更新內容；沒開就看要不要自動跳 */
function gameRefreshPopup() {

  if (document.getElementById("game-ck-popup")) {
    gameRenderPopup();
    return;
  }

  if (gameShouldAutoPopup()) {
    gameMarkAutoShown();
    gameOpenPopup();
  }

}


function gameOpenPopup() {

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


function gameRenderPopup() {

  const overlay = document.getElementById("game-ck-popup");

  if (!overlay) return;

  const busy = gameCheckinState.busy;
  const head = `
    <button class="game-pop-close" type="button" aria-label="關閉" onclick="gameClosePopup()">✕</button>
    <div class="game-pop-title" id="game-pop-title">📅 今天的簽到</div>`;

  if (gameCheckinState.error) {
    overlay.innerHTML = `
      <div class="game-pop-box" role="dialog" aria-modal="true" aria-labelledby="game-pop-title">
        ${head}
        <div class="ck-error">簽到功能還沒設定好，請先執行「更新_2點換日_補簽_反省.sql」。</div>
      </div>`;
    return;
  }

  if (!gameCheckinState.loaded) {
    overlay.innerHTML = `
      <div class="game-pop-box" role="dialog" aria-modal="true" aria-labelledby="game-pop-title">
        ${head}
        <div class="small-note">載入中...</div>
      </div>`;
    return;
  }

  const s = gameCheckinSummary();

  let body;

  if (s.todayRow) {

    const r = s.todayRow;

    body = `
      <div class="ck-result ${r.crit ? "is-crit" : ""}">
        <div class="ck-result-title">${r.crit ? "💥 爆擊！獎勵 ×2" : "✅ 今天簽到完成"}</div>
        <div class="ck-result-reward">+${r.gold} 金幣・+${r.exp} EXP（連續 ${s.streak} 天）</div>
      </div>
      <div class="game-pop-actions">
        <button class="btn btn-primary" type="button" onclick="gameClosePopup()">完成</button>
      </div>`;

  } else {

    const chance = gameCheckinCritChance(s.nextStreak);
    const gold = gameCheckinGold(s.nextStreak);

    body = `
      ${s.broken ? `<div class="ck-broken">昨天沒簽到，連續天數從第 1 天重新開始</div>` : ""}
      <div class="ck-stats">
        <div><b>${s.streak}</b><span>目前連續</span></div>
        <div><b>${chance}%</b><span>今天爆擊機率</span></div>
        <div><b>+${gold}</b><span>今天金幣</span></div>
      </div>
      ${gamePopupMonthLine()}
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

  overlay.innerHTML = `
    <div class="game-pop-box" role="dialog" aria-modal="true" aria-labelledby="game-pop-title">
      ${head}
      ${body}
    </div>`;

}


/* 彈窗裡的一行本月進度 */
function gamePopupMonthLine() {

  const ms = gameMonthSummary();
  const after = ms.count + 1;   // 今天簽完之後

  let goalText;

  if (ms.count < 7) {
    goalText = after >= 7
      ? `今天簽完就拿到 7 天獎勵（+${GAME_MONTH7.gold} 金幣）！`
      : `再簽 ${7 - after} 天拿 7 天獎勵`;
  } else {
    goalText = after >= ms.days
      ? `今天簽完就是全勤（+${GAME_MONTH_ALL.gold} 金幣）！`
      : `全勤還差 ${ms.days - after} 天`;
  }

  return `
    <div class="game-pop-month">
      📆 ${ms.m} 月已簽 ${ms.count} 天・${goalText}
      ${ms.missed.length > 0 ? `<div class="small-note">這個月有 ${ms.missed.length} 天沒簽，可以在簽到卡的月曆補簽</div>` : ""}
    </div>`;

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

    @keyframes ck-pop {
      0%   { transform: scale(.85); opacity: 0; }
      60%  { transform: scale(1.06); opacity: 1; }
      100% { transform: scale(1); }
    }
  `;

  document.head.appendChild(style);

})();
