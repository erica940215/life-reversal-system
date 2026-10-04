// ========================================
// ⚔️ 神級人生逆襲系統
// RPG 核心系統 V0.4
// ========================================


// ========================================
// 玩家資料
// ========================================

let currentLevel = 1;

let currentExp = 50;

let currentGold = 100;


// ========================================
// 今日任務資料
// ========================================

let completedTasks = 0;

let todayExp = 0;

let todayGold = 0;


// 目前任務總數
const totalTasks = 4;


// ========================================
// 計算目前等級需要多少 EXP
//
// Lv.1 → 100 EXP
// Lv.2 → 150 EXP
// Lv.3 → 200 EXP
// Lv.4 → 250 EXP
// ========================================

function getRequiredExp() {

  return 100 + (currentLevel - 1) * 50;

}


// ========================================
// 完成 / 取消任務
// ========================================

function toggleTask(element, expReward, goldReward) {

  // 判斷任務目前是不是完成狀態
  const isCompleted =
    element.classList.toggle("completed");


  // 找到 checkbox
  const checkbox =
    element.querySelector(".task-checkbox");


  // ========================================
  // 完成任務
  // ========================================

  if (isCompleted) {

    // 玩家 EXP
    currentExp += expReward;

    // 玩家金幣
    currentGold += goldReward;


    // 今日統計
    todayExp += expReward;

    todayGold += goldReward;

    completedTasks++;


    // checkbox
    if (checkbox) {

      checkbox.textContent = "☑";

    }


    // 檢查是否升級
    checkLevelUp();

  }


  // ========================================
  // 取消任務
  // ========================================

  else {

    // 玩家 EXP
    currentExp -= expReward;

    // 玩家金幣
    currentGold -= goldReward;


    // 今日統計
    todayExp -= expReward;

    todayGold -= goldReward;

    completedTasks--;


    // 防止負數
    if (currentExp < 0) {

      currentExp = 0;

    }


    if (currentGold < 0) {

      currentGold = 0;

    }


    if (todayExp < 0) {

      todayExp = 0;

    }


    if (todayGold < 0) {

      todayGold = 0;

    }


    // checkbox
    if (checkbox) {

      checkbox.textContent = "☐";

    }

  }


  // 更新畫面
  updateUI();

}


// ========================================
// 升級系統
// ========================================

function checkLevelUp() {

  let requiredExp =
    getRequiredExp();


  // EXP 足夠就升級
  while (currentExp >= requiredExp) {


    // 扣除升級所需要的 EXP
    currentExp -= requiredExp;


    // 等級 +1
    currentLevel++;


    // 升級獎勵
    currentGold += 50;


    // 下一級 EXP
    requiredExp =
      getRequiredExp();


    // 升級提示
    alert(

      "✨ LEVEL UP！\n\n" +

      "你已經升到 Lv." +
      currentLevel +
      "！\n\n" +

      "🎁 升級獎勵：+50 金幣"

    );

  }

}


// ========================================
// 更新整個畫面
// ========================================

function updateUI() {


  // ======================================
  // 玩家等級
  // ======================================

  const levelElement =
    document.getElementById("player-level");


  if (levelElement) {

    levelElement.textContent =
      "Lv." + currentLevel;

  }


  // ======================================
  // 金幣
  // ======================================

  const goldElement =
    document.getElementById("player-gold");


  if (goldElement) {

    goldElement.textContent =
      currentGold;

  }


  // ======================================
  // 目前 EXP
  // ======================================

  const expElement =
    document.getElementById("current-exp");


  if (expElement) {

    expElement.textContent =
      currentExp;

  }


  // ======================================
  // 升級所需 EXP
  // ======================================

  const requiredExp =
    getRequiredExp();


  const requiredExpElement =
    document.getElementById("required-exp");


  if (requiredExpElement) {

    requiredExpElement.textContent =
      requiredExp;

  }


  // ======================================
  // EXP 進度條
  // ======================================

  const expBar =
    document.getElementById("exp-bar");


  if (expBar) {

    const expPercent =
      Math.min(
        (currentExp / requiredExp) * 100,
        100
      );


    expBar.style.width =
      expPercent + "%";

  }


  // ======================================
  // 今日完成數
  // ======================================

  const completedCount =
    document.getElementById(
      "completed-count"
    );


  if (completedCount) {

    completedCount.textContent =
      completedTasks +
      " / " +
      totalTasks;

  }


  // ======================================
  // 完成率
  // ======================================

  const ratePercent =
    Math.round(
      (completedTasks / totalTasks) * 100
    );


  // 頁面下方完成率
  const rateText =
    document.getElementById(
      "rate-text"
    );


  if (rateText) {

    rateText.textContent =
      ratePercent + "%";

  }


  // ======================================
  // 完成率進度條
  // ======================================

  const rateBar =
    document.getElementById(
      "rate-bar"
    );


  if (rateBar) {

    rateBar.style.width =
      ratePercent + "%";

  }


  // ======================================
  // 今日摘要完成率
  // ======================================

  const summaryRate =
    document.getElementById(
      "summary-rate"
    );


  if (summaryRate) {

    summaryRate.textContent =
      ratePercent + "%";

  }


  // ======================================
  // 今日 EXP
  // ======================================

  const todayExpElement =
    document.getElementById(
      "today-exp"
    );


  if (todayExpElement) {

    todayExpElement.textContent =
      "+" + todayExp;

  }


  // ======================================
  // 今日金幣
  // ======================================

  const todayGoldElement =
    document.getElementById(
      "today-gold"
    );


  if (todayGoldElement) {

    todayGoldElement.textContent =
      "+" + todayGold;

  }

}


// ========================================
// 任務分類篩選
// ========================================

function filterTasks(category, button) {


  // ======================================
  // 更新分類按鈕
  // ======================================

  const buttons =
    document.querySelectorAll(
      ".filter-btn"
    );


  buttons.forEach(function(btn) {

    btn.classList.remove(
      "active"
    );

  });


  button.classList.add(
    "active"
  );


  // ======================================
  // 篩選任務
  // ======================================

  const tasks =
    document.querySelectorAll(
      ".task-item"
    );


  tasks.forEach(function(task) {


    const taskCategory =
      task.getAttribute(
        "data-category"
      );


    // 顯示全部
    if (
      category === "all" ||
      taskCategory === category
    ) {

      task.style.display =
        "flex";

    }


    // 隱藏其他分類
    else {

      task.style.display =
        "none";

    }

  });

}


// ========================================
// 網頁載入完成
// ========================================

document.addEventListener(
  "DOMContentLoaded",
  function() {

    updateUI();

  }
);
