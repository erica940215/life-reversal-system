// ========================================
// 神級人生逆襲系統
// RPG 核心系統 V0.3
// ========================================


// ========================================
// 玩家資料
// ========================================

let currentLevel = 1;
let currentExp = 50;
let currentGold = 100;

let completedTasks = 0;

const totalTasks = 4;


// ========================================
// 計算目前等級需要多少 EXP
// Lv.1 = 100
// Lv.2 = 150
// Lv.3 = 200
// Lv.4 = 250
// ========================================

function getRequiredExp() {

  return 100 + (currentLevel - 1) * 50;

}


// ========================================
// 完成 / 取消任務
// ========================================

function toggleTask(element, expReward, goldReward) {

  const isCompleted =
    element.classList.toggle("completed");


  // ------------------------------
  // 完成任務
  // ------------------------------

  if (isCompleted) {

    currentExp += expReward;

    currentGold += goldReward;

    completedTasks++;

    // 改變 checkbox
    const checkbox =
      element.querySelector(".task-checkbox");

    if (checkbox) {
      checkbox.textContent = "☑";
    }

    // 檢查升級
    checkLevelUp();

  }


  // ------------------------------
  // 取消任務
  // ------------------------------

  else {

    currentExp -= expReward;

    currentGold -= goldReward;

    completedTasks--;

    // 防止數值變負數
    if (currentExp < 0) {
      currentExp = 0;
    }

    if (currentGold < 0) {
      currentGold = 0;
    }

    // 改回 checkbox
    const checkbox =
      element.querySelector(".task-checkbox");

    if (checkbox) {
      checkbox.textContent = "☐";
    }

  }


  updateUI();

}


// ========================================
// 升級系統
// ========================================

function checkLevelUp() {

  let requiredExp = getRequiredExp();


  // 如果 EXP 超過升級需求
  while (currentExp >= requiredExp) {

    // 扣除升級所需 EXP
    currentExp -= requiredExp;


    // 等級 +1
    currentLevel++;


    // 升級獎勵
    currentGold += 50;


    // 重新計算下一級需求
    requiredExp = getRequiredExp();


    // 顯示升級提示
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
// 更新玩家介面
// ========================================

function updateUI() {

  // ------------------------------
  // 等級
  // ------------------------------

  const levelElement =
    document.getElementById("player-level");

  if (levelElement) {

    levelElement.textContent =
      "Lv." + currentLevel;

  }


  // ------------------------------
  // 金幣
  // ------------------------------

  const goldElement =
    document.getElementById("player-gold");

  if (goldElement) {

    goldElement.textContent =
      currentGold;

  }


  // ------------------------------
  // EXP
  // ------------------------------

  const expElement =
    document.getElementById("current-exp");

  if (expElement) {

    expElement.textContent =
      currentExp;

  }


  // ------------------------------
  // 目前等級需要 EXP
  // ------------------------------

  const requiredExpElement =
    document.getElementById("required-exp");

  if (requiredExpElement) {

    requiredExpElement.textContent =
      getRequiredExp();

  }


  // ------------------------------
  // EXP 進度條
  // ------------------------------

  const expBar =
    document.getElementById("exp-bar");

  if (expBar) {

    const requiredExp =
      getRequiredExp();

    const expPercent =
      Math.min(
        (currentExp / requiredExp) * 100,
        100
      );

    expBar.style.width =
      expPercent + "%";

  }


  // ------------------------------
  // 今日完成率
  // ------------------------------

  const ratePercent =
    Math.round(
      (completedTasks / totalTasks) * 100
    );


  const rateText =
    document.getElementById("rate-text");

  if (rateText) {

    rateText.textContent =
      ratePercent + "%";

  }


  // ------------------------------
  // 完成率進度條
  // ------------------------------

  const rateBar =
    document.getElementById("rate-bar");

  if (rateBar) {

    rateBar.style.width =
      ratePercent + "%";

  }

}


// ========================================
// 任務分類篩選
// ========================================

function filterTasks(category, button) {

  // ------------------------------
  // 更新按鈕狀態
  // ------------------------------

  const buttons =
    document.querySelectorAll(".filter-btn");

  buttons.forEach(function(btn) {

    btn.classList.remove("active");

  });


  button.classList.add("active");


  // ------------------------------
  // 篩選任務
  // ------------------------------

  const tasks =
    document.querySelectorAll(".task-item");


  tasks.forEach(function(task) {

    const taskCategory =
      task.getAttribute("data-category");


    if (
      category === "all" ||
      taskCategory === category
    ) {

      task.style.display = "flex";

    }

    else {

      task.style.display = "none";

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
