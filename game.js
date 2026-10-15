/* =========================================================
   🎲 序光計畫：遊戲功能
   只在主頁「遊戲模式：開」的時候出現，關閉時畫面和原本一樣。
   之後的遊戲功能（抽獎、圖鑑、主線王…）都放在這個檔案。

   需要 script.js 先載入（會用到 db、currentUser、gameMode、
   getToday、shiftDate、showToast、escapeHtml、afterRewardChange）。
========================================================= */


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
   script.js 的 loadGameMode / toggleGameMode 最後都會呼叫
   renderGameModeToggle()，在它後面接著更新遊戲區塊
========================================================= */

if (typeof renderGameModeToggle === "function") {

  const gameBaseRenderToggle = renderGameModeToggle;

  renderGameModeToggle = function () {
    gameBaseRenderToggle();
    gameOnModeChange();
  };

}


function gameOnModeChange() {

  const card = gameEnsureCheckinCard();

  if (!card) return;

  const on = typeof gameMode !== "undefined" && gameMode && !!currentUser;

  card.hidden = !on;

  if (!on) return;

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

  const { data, error } = await db
    .from("checkins")
    .select("checkin_date, streak, crit, crit_chance, exp, gold")
    .eq("user_id", currentUser.id)
    .gte("checkin_date", shiftDate(today, -7))
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

  if (!gameCheckinState.loaded) {
    card.innerHTML = head + `<span class="small-note">載入中...</span>`;
    return;
  }

  if (gameCheckinState.error) {
    card.innerHTML = head + `
      <div class="ck-error">
        簽到功能還沒設定好：請先到 Supabase 的 SQL Editor 執行「遊戲_每日簽到.sql」，再重新整理。
        <div class="small-note">${escapeHtml(gameCheckinState.error)}</div>
      </div>`;
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

  card.innerHTML = head + `<div class="ck-dots">${dots}</div>` + body;

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
    gold: data.gold
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
      data.crit
        ? `💥 爆擊！簽到獎勵 ×2：+${data.gold} 金幣 / +${data.exp} EXP`
        : `📅 簽到成功（連續 ${data.streak} 天）：+${data.gold} 金幣 / +${data.exp} EXP`
    );
  }

  /* 更新上方的等級 / 金幣和今日獎勵 */
  await afterRewardChange(data, null, null);

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

    @keyframes ck-pop {
      0%   { transform: scale(.85); opacity: 0; }
      60%  { transform: scale(1.06); opacity: 1; }
      100% { transform: scale(1); }
    }
  `;

  document.head.appendChild(style);

})();
