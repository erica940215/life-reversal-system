// ========================================
// ⚔️ 神級人生逆襲系統
// V0.5 - 本機資料保存系統
// ========================================


// ========================================
// 資料保存設定
// ========================================

const SAVE_KEY = "life-reversal-system-v05";


// ========================================
// 預設玩家資料
// ========================================

let currentLevel = 1;
let currentExp = 50;
let currentGold = 100;

let completedTasks = 0;
let todayExp = 0;
let todayGold = 0;

const totalTasks = 4;


// ========================================
// 今日日期
// ========================================

function getToday() {

  const now = new Date();

  return now.getFullYear() + "-" +
    String(now.getMonth() + 1).padStart(2, "0") + "-" +
    String(now.getDate()).padStart(2, "0");

}


// ========================================
// 任務保存狀態
// ========================================

let taskStates = {};


// ========================================
// 讀取資料
// ========================================

function loadGame() {

  const savedData =
    localStorage.getItem(SAVE_KEY);


  // 沒有舊資料
  if (!savedData) {

    return;

  }


  try {

    const data =
      JSON.parse(savedData);


    currentLevel =
      data.currentLevel ?? 1;

    currentExp =
      data.currentExp ?? 50;

    currentGold =
      data.currentGold ?? 100;

    completedTasks =
      data.completedTasks ?? 0;

    todayExp =
      data.todayExp ?? 0;

    todayGold =
      data.todayGold ?? 0;

    taskStates =
      data.taskStates ?? {};


    // ====================================
    // 檢查是不是新的一天
    // ====================================

    const savedDate =
      data.date;


    if (savedDate !== getToday()) {

      resetToday();

    }


  } catch (error) {

    console.error(
      "讀取遊戲資料失敗：",
      error
    );

  }

}


// ========================================
// 保存資料
// ========================================

function saveGame() {

  const gameData = {

    currentLevel:
      currentLevel,

    currentExp:
      currentExp,

    currentGold:
      currentGold,

    completedTasks:
      completedTasks,

    todayExp:
      todayExp,

    todayGold:
      todayGold,

    taskStates:
      taskStates,

    date:
      getToday()

  };


  localStorage.setItem(
    SAVE_KEY,
    JSON.stringify(gameData)
  );

}


// ========================================
// 新的一天
// ========================================

function resetToday() {

  completedTasks = 0;

  todayExp = 0;

  todayGold = 0;

  taskStates = {};

}


// ========================================
// 計算升級所需 EXP
// ========================================

function getRequiredExp() {

  return 100 +
    (currentLevel - 1) * 50;

}


// ========================================
// 完成 / 取消任務
// ========================================

function toggleTask(
  element,
  expReward,
  goldReward
) {


  const isCompleted =
    element.classList.toggle(
      "completed"
    );


  const checkbox =
    element.querySelector(
      ".task-checkbox"
    );


  // ======================================
  // 找到任務的唯一識別
  // ======================================

  const taskName =
    element.querySelector(
      ".task-name"
    );


  const taskId =
    taskName
      ? taskName.textContent.trim()
      : String(
          Math.random()
        );


  // ======================================
  // 完成任務
  // ======================================

  if (isCompleted) {

    currentExp += expReward;

    currentGold += goldReward;

    todayExp += expReward;

    todayGold += goldReward;

    completedTasks++;


    taskStates[taskId] = true;


    if (checkbox) {

      checkbox.textContent = "☑";

    }


    checkLevelUp();

  }


  // ======================================
  // 取消任務
  // ======================================

  else {

    currentExp -= expReward;

    currentGold -= goldReward;

    todayExp -= expReward;

    todayGold -= goldReward;

    completedTasks--;


    taskStates[taskId] = false;


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


    if (checkbox) {

      checkbox.textContent = "☐";

    }

  }


  saveGame();

  updateUI();

}


// ========================================
// 升級系統
// ========================================

function checkLevelUp() {

  let requiredExp =
    getRequiredExp();


  while (
    currentExp >= requiredExp
  ) {


    currentExp -= requiredExp;


    currentLevel++;


    currentGold += 50;


    todayGold += 50;


    requiredExp =
      getRequiredExp();


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
// 恢復任務畫面
// ========================================

function restoreTasks() {

  const tasks =
    document.querySelectorAll(
      ".task-item"
    );


  tasks.forEach(function(task) {


    const taskName =
      task.querySelector(
        ".task-name"
      );


    const checkbox =
      task.querySelector(
        ".task-checkbox"
      );


    if (!taskName) {

      return;

    }


    const taskId =
      taskName.textContent.trim();


    if (
      taskStates[taskId] === true
    ) {

      task.classList.add(
        "completed"
      );


      if (checkbox) {

        checkbox.textContent = "☑";

      }

    }

  });

}


// ========================================
// 更新畫面
// ========================================

function updateUI() {


  // ======================================
  // 等級
  // ======================================

  const levelElement =
    document.getElementById(
      "player-level"
    );


  if (levelElement) {

    levelElement.textContent =
      "Lv." + currentLevel;

  }


  // ======================================
  // 金幣
  // ======================================

  const goldElement =
    document.getElementById(
      "player-gold"
    );


  if (goldElement) {

    goldElement.textContent =
      currentGold;

  }


  // ======================================
  // EXP
  // ======================================

  const expElement =
    document.getElementById(
      "current-exp"
    );


  if (expElement) {

    expElement.textContent =
      currentExp;

  }


  // ======================================
  // 所需 EXP
  // ======================================

  const requiredExp =
    getRequiredExp();


  const requiredExpElement =
    document.getElementById(
      "required-exp"
    );


  if (requiredExpElement) {

    requiredExpElement.textContent =
      requiredExp;

  }


  // ======================================
  // EXP 進度條
  // ======================================

  const expBar =
    document.getElementById(
      "exp-bar"
    );


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
  // 任務完成數
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


  const rateText =
    document.getElementById(
      "rate-text"
    );


  if (rateText) {

    rateText.textContent =
      ratePercent + "%";

  }


  const summaryRate =
    document.getElementById(
      "summary-rate"
    );


  if (summaryRate) {

    summaryRate.textContent =
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

function filterTasks(
  category,
  button
) {


  const buttons =
    document.querySelectorAll(
      ".filter-btn"
    );


  buttons.forEach(
    function(btn) {

      btn.classList.remove(
        "active"
      );

    }
  );


  button.classList.add(
    "active"
  );


  const tasks =
    document.querySelectorAll(
      ".task-item"
    );


  tasks.forEach(
    function(task) {


      const taskCategory =
        task.getAttribute(
          "data-category"
        );


      if (
        category === "all" ||
        taskCategory === category
      ) {

        task.style.display =
          "flex";

      } else {

        task.style.display =
          "none";

      }

    }
  );

}


// ========================================
// 網頁啟動
// ========================================

document.addEventListener(
  "DOMContentLoaded",
  function() {


    // ① 讀取保存資料
    loadGame();


    // ② 恢復任務
    restoreTasks();


    // ③ 更新畫面
    updateUI();


  }
);
