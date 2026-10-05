// ======================================================
// 神級人生逆襲系統
// Supabase 核心 JavaScript
// ======================================================


// ======================================================
// 1. Supabase 設定
// ======================================================

const SUPABASE_URL = "https://smlaokhqhgzjhnxeqfen.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_2uJS9Kex4YSTQh1Bbh3H-w_4cPPW25j";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );


// ======================================================
// 2. 全域資料
// ======================================================

let currentUser = null;
let currentProfile = null;
let currentTasks = [];


// ======================================================
// 3. 網頁載入
// ======================================================

document.addEventListener("DOMContentLoaded", async () => {

  console.log("神級人生逆襲系統 JavaScript 載入成功");

  await checkSession();

});


// ======================================================
// 4. 取得目前登入狀態
// ======================================================

async function checkSession() {

  try {

    const {
      data,
      error
    } = await supabaseClient.auth.getSession();

    if (error) {
      console.error("取得登入狀態失敗：", error);
      showAuthMessage("⚠️ 無法取得登入狀態");
      return;
    }

    currentUser = data.session
      ? data.session.user
      : null;


    if (currentUser) {

      console.log(
        "目前登入玩家：",
        currentUser.email
      );

      await showLoggedInUI();

      await loadPlayer();

      await loadTasks();

    } else {

      showLoggedOutUI();

    }

  } catch (error) {

    console.error("Session 錯誤：", error);

  }

}


// ======================================================
// 5. 登入
// ======================================================

window.loginUser = async function () {

  const emailInput =
    document.getElementById("auth-email");

  const passwordInput =
    document.getElementById("auth-password");

  const email =
    emailInput.value.trim();

  const password =
    passwordInput.value;


  if (!email || !password) {

    showAuthMessage(
      "⚠️ 請輸入 Email 和密碼"
    );

    return;
  }


  showAuthMessage("🔄 登入中……");


  try {

    const {
      data,
      error
    } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });


    if (error) {

      console.error("登入失敗：", error);

      showAuthMessage(
        "❌ 登入失敗：" + error.message
      );

      return;
    }


    currentUser = data.user;


    showAuthMessage(
      "✅ 登入成功！"
    );


    await showLoggedInUI();

    await loadPlayer();

    await loadTasks();


  } catch (error) {

    console.error(error);

    showAuthMessage(
      "❌ 登入發生錯誤"
    );

  }

};


// ======================================================
// 6. 註冊
// ======================================================

window.registerUser = async function () {

  const emailInput =
    document.getElementById("auth-email");

  const passwordInput =
    document.getElementById("auth-password");

  const email =
    emailInput.value.trim();

  const password =
    passwordInput.value;


  if (!email || !password) {

    showAuthMessage(
      "⚠️ 請輸入 Email 和密碼"
    );

    return;
  }


  if (password.length < 6) {

    showAuthMessage(
      "⚠️ 密碼至少需要 6 碼"
    );

    return;
  }


  showAuthMessage(
    "🔄 註冊中……"
  );


  try {

    const {
      data,
      error
    } = await supabaseClient.auth.signUp({
      email,
      password
    });


    if (error) {

      console.error(
        "註冊失敗：",
        error
      );

      showAuthMessage(
        "❌ 註冊失敗：" +
        error.message
      );

      return;
    }


    if (data.session) {

      currentUser = data.user;

      showAuthMessage(
        "✅ 註冊成功並已登入！"
      );

      await showLoggedInUI();

      await loadPlayer();

      await loadTasks();

    } else {

      showAuthMessage(
        "✅ 註冊成功！請確認 Email 後再登入。"
      );

    }


  } catch (error) {

    console.error(error);

    showAuthMessage(
      "❌ 註冊發生錯誤"
    );

  }

};


// ======================================================
// 7. 登出
// ======================================================

window.logoutUser = async function () {

  try {

    const {
      error
    } = await supabaseClient.auth.signOut();


    if (error) {

      console.error(
        "登出失敗：",
        error
      );

      showAuthMessage(
        "❌ 登出失敗"
      );

      return;
    }


    currentUser = null;
    currentProfile = null;
    currentTasks = [];


    showLoggedOutUI();


    const taskList =
      document.querySelector(".task-list");

    if (taskList) {
      taskList.innerHTML = "";
    }


    updateSummary();


  } catch (error) {

    console.error(error);

  }

};


// ======================================================
// 8. 顯示登入狀態
// ======================================================

async function showLoggedInUI() {

  const authForm =
    document.getElementById("auth-form");

  const loggedInArea =
    document.getElementById("logged-in-area");

  const userEmail =
    document.getElementById("user-email");

  if (authForm) {
    authForm.style.display = "none";
  }

  if (loggedInArea) {
    loggedInArea.style.display = "block";
  }

  if (userEmail && currentUser) {

    userEmail.textContent =
      "👤 玩家：" + currentUser.email;

  }

}


// ======================================================
// 9. 顯示未登入狀態
// ======================================================

function showLoggedOutUI() {

  const authForm =
    document.getElementById("auth-form");

  const loggedInArea =
    document.getElementById("logged-in-area");

  if (authForm) {
    authForm.style.display = "block";
  }

  if (loggedInArea) {
    loggedInArea.style.display = "none";
  }

}


// ======================================================
// 10. 登入訊息
// ======================================================

function showAuthMessage(message) {

  const element =
    document.getElementById("auth-message");

  if (element) {
    element.textContent = message;
  }

}


// ======================================================
// 11. 載入玩家資料
// ======================================================

async function loadPlayer() {

  if (!currentUser) {
    return;
  }


  try {

    const {
      data,
      error
    } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .single();


    if (error) {

      console.error(
        "載入玩家資料失敗：",
        error
      );

      return;
    }


    currentProfile = data;

    renderPlayer();


  } catch (error) {

    console.error(error);

  }

}


// ======================================================
// 12. 顯示玩家資料
// ======================================================

function renderPlayer() {

  if (!currentProfile) {
    return;
  }


  const levelElement =
    document.getElementById("player-level");

  const goldElement =
    document.getElementById("player-gold");

  const currentExpElement =
    document.getElementById("current-exp");

  const requiredExpElement =
    document.getElementById("required-exp");

  const expBar =
    document.getElementById("exp-bar");


  const level =
    Number(currentProfile.level);

  const exp =
    Number(currentProfile.exp);

  const gold =
    Number(currentProfile.gold);


  const requiredExp =
    100 + (level - 1) * 50;


  if (levelElement) {
    levelElement.textContent =
      "Lv." + level;
  }


  if (goldElement) {
    goldElement.textContent =
      gold;
  }


  if (currentExpElement) {
    currentExpElement.textContent =
      exp;
  }


  if (requiredExpElement) {
    requiredExpElement.textContent =
      requiredExp;
  }


  if (expBar) {

    const percentage =
      Math.min(
        100,
        Math.max(
          0,
          (exp / requiredExp) * 100
        )
      );

    expBar.style.width =
      percentage + "%";

  }

}


// ======================================================
// 13. 取得今天日期
// ======================================================

function getToday() {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");


  return `${year}-${month}-${day}`;

}


// ======================================================
// 14. 載入今日任務
// ======================================================

async function loadTasks() {

  if (!currentUser) {
    return;
  }


  try {

    const today =
      getToday();


    const {
      data,
      error
    } = await supabaseClient
      .from("tasks")
      .select("*")
      .eq("user_id", currentUser.id)
      .eq("task_date", today)
      .order("id", {
        ascending: true
      });


    if (error) {

      console.error(
        "載入任務失敗：",
        error
      );

      return;
    }


    currentTasks =
      data || [];


    console.log(
      "今日任務載入成功：",
      currentTasks
    );


    renderTasks();

    updateSummary();


  } catch (error) {

    console.error(error);

  }

}


// ======================================================
// 15. 顯示任務
// ======================================================

function renderTasks() {

  const taskList =
    document.querySelector(".task-list");


  if (!taskList) {
    return;
  }


  taskList.innerHTML = "";


  currentTasks.forEach(task => {

    const li =
      document.createElement("li");


    li.className =
      "task-item";


    li.dataset.category =
      task.category;


    li.dataset.difficulty =
      task.difficulty;


    li.dataset.taskId =
      task.id;


    if (task.completed) {

      li.classList.add("completed");

    }


    li.onclick = function () {

      toggleTask(
        li,
        Number(task.exp_reward),
        Number(task.gold_reward),
        task.id
      );

    };


    const checkbox =
      document.createElement("span");

    checkbox.className =
      "task-checkbox";

    checkbox.textContent =
      task.completed
        ? "☑"
        : "☐";


    const taskInfo =
      document.createElement("div");

    taskInfo.className =
      "task-info";


    const category =
      document.createElement("small");

    category.textContent =
      getCategoryLabel(
        task.category
      );


    const name =
      document.createElement("span");

    name.className =
      "task-name";

    name.textContent =
      task.title;


    const difficulty =
      document.createElement("span");

    difficulty.className =
      "difficulty " +
      task.difficulty;

    difficulty.textContent =
      getDifficultyLabel(
        task.difficulty
      );


    taskInfo.appendChild(
      category
    );

    taskInfo.appendChild(
      name
    );

    taskInfo.appendChild(
      difficulty
    );


    const reward =
      document.createElement("div");

    reward.className =
      "reward";


    const expReward =
      document.createElement("span");

    expReward.textContent =
      "+" +
      task.exp_reward +
      " EXP";


    const goldReward =
      document.createElement("span");

    goldReward.className =
      "gold-reward";

    goldReward.textContent =
      "+" +
      task.gold_reward +
      " 💰";


    reward.appendChild(
      expReward
    );

    reward.appendChild(
      goldReward
    );


    li.appendChild(
      checkbox
    );

    li.appendChild(
      taskInfo
    );

    li.appendChild(
      reward
    );


    taskList.appendChild(
      li
    );

  });


  applyCurrentFilter();

}


// ======================================================
// 16. 類別名稱
// ======================================================

function getCategoryLabel(category) {

  const labels = {

    study: "📚 學習",

    toeic: "🇬🇧 多益",

    focus: "🎯 專注",

    health: "❤️ 健康"

  };


  return labels[category]
    || "📌 其他";

}


// ======================================================
// 17. 難度名稱
// ======================================================

function getDifficultyLabel(
  difficulty
) {

  const labels = {

    easy: "🟢 簡單",

    normal: "🔵 普通",

    hard: "🟣 困難"

  };


  return labels[difficulty]
    || "🔵 普通";

}


// ======================================================
// 18. 新增任務
// ======================================================

window.addTask = async function () {

  if (!currentUser) {

    setAddTaskMessage(
      "⚠️ 請先登入"
    );

    return;
  }


  const titleInput =
    document.getElementById(
      "new-task-title"
    );

  const categoryInput =
    document.getElementById(
      "new-task-category"
    );

  const difficultyInput =
    document.getElementById(
      "new-task-difficulty"
    );


  if (!titleInput) {
    return;
  }


  const title =
    titleInput.value.trim();

  const category =
    categoryInput.value;

  const difficulty =
    difficultyInput.value;


  if (!title) {

    setAddTaskMessage(
      "⚠️ 請輸入任務名稱"
    );

    return;
  }


  if (title.length > 100) {

    setAddTaskMessage(
      "⚠️ 任務名稱不能超過 100 字"
    );

    return;
  }


  // --------------------------------------------------
  // 根據難度決定獎勵
  // --------------------------------------------------

  let expReward = 30;
  let goldReward = 20;


  if (difficulty === "easy") {

    expReward = 20;
    goldReward = 15;

  } else if (
    difficulty === "normal"
  ) {

    expReward = 30;
    goldReward = 20;

  } else if (
    difficulty === "hard"
  ) {

    expReward = 50;
    goldReward = 35;

  }


  setAddTaskMessage(
    "🔄 正在新增任務……"
  );


  try {

    const {
      data,
      error
    } = await supabaseClient
      .from("tasks")
      .insert({

        user_id:
          currentUser.id,

        title:
          title,

        category:
          category,

        difficulty:
          difficulty,

        exp_reward:
          expReward,

        gold_reward:
          goldReward,

        completed:
          false,

        task_date:
          getToday()

      })
      .select()
      .single();


    if (error) {

      console.error(
        "新增任務失敗：",
        error
      );


      setAddTaskMessage(
        "❌ 新增失敗：" +
        error.message
      );

      return;
    }


    console.log(
      "新增任務成功：",
      data
    );


    // ------------------------------------------------
    // 更新本地任務資料
    // ------------------------------------------------

    currentTasks.push(data);


    renderTasks();

    updateSummary();


    // ------------------------------------------------
    // 清空輸入框
    // ------------------------------------------------

    titleInput.value = "";


    setAddTaskMessage(
      "✅ 任務新增成功！"
    );


    // 3 秒後清除訊息
    setTimeout(() => {

      setAddTaskMessage("");

    }, 3000);


  } catch (error) {

    console.error(error);

    setAddTaskMessage(
      "❌ 新增任務時發生錯誤"
    );

  }

};


// ======================================================
// 19. 新增任務訊息
// ======================================================

function setAddTaskMessage(
  message
) {

  const element =
    document.getElementById(
      "add-task-message"
    );


  if (element) {

    element.textContent =
      message;

  }

}


// ======================================================
// 20. 完成任務
// ======================================================

window.toggleTask = async function (
  element,
  exp,
  gold,
  taskId
) {

  if (!currentUser) {

    alert(
      "⚠️ 請先登入"
    );

    return;
  }


  if (!taskId) {

    console.error(
      "找不到 taskId"
    );

    return;
  }


  const task =
    currentTasks.find(
      item =>
        Number(item.id) ===
        Number(taskId)
    );


  if (!task) {

    console.error(
      "找不到任務：",
      taskId
    );

    return;
  }


  if (task.completed) {

    return;

  }


  try {

    element.style.pointerEvents =
      "none";


    console.log(
      "正在完成任務：",
      taskId
    );


    const {
      data,
      error
    } = await supabaseClient
      .rpc(
        "complete_task",
        {
          p_task_id:
            Number(taskId)
        }
      );


    if (error) {

      console.error(
        "完成任務失敗：",
        error
      );

      alert(
        "❌ 任務完成失敗：" +
        error.message
      );

      element.style.pointerEvents =
        "";

      return;
    }


    console.log(
      "任務完成結果：",
      data
    );


    if (
      !data ||
      data.success !== true
    ) {

      alert(
        data?.message ||
        "⚠️ 任務沒有完成"
      );

      element.style.pointerEvents =
        "";

      return;
    }


    // ------------------------------------------------
    // 記錄升級前等級
    // ------------------------------------------------

    const oldLevel =
      Number(
        currentProfile.level
      );


    // ------------------------------------------------
    // 更新玩家資料
    // ------------------------------------------------

    currentProfile.level =
      Number(data.level);

    currentProfile.exp =
      Number(data.exp);

    currentProfile.gold =
      Number(data.gold);


    // ------------------------------------------------
    // 更新任務狀態
    // ------------------------------------------------

    task.completed =
      true;

    task.completed_at =
      new Date().toISOString();


    // ------------------------------------------------
    // 更新畫面
    // ------------------------------------------------

    renderPlayer();

    renderTasks();

    updateSummary();


    // ------------------------------------------------
    // 升級提示
    // ------------------------------------------------

    if (
      Number(data.level) >
      oldLevel
    ) {

      alert(
        "🎉 升級成功！\n\n" +
        "現在等級：Lv." +
        data.level
      );

    } else {

      alert(
        "✅ 任務完成！\n\n" +
        "+" +
        data.task_exp +
        " EXP\n" +
        "+" +
        data.task_gold +
        " 💰"
      );

    }


  } catch (error) {

    console.error(
      "完成任務錯誤：",
      error
    );

    alert(
      "❌ 完成任務時發生錯誤"
    );

    element.style.pointerEvents =
      "";

  }

};


// ======================================================
// 21. 任務篩選
// ======================================================

window.filterTasks = function (
  category,
  button
) {

  const buttons =
    document.querySelectorAll(
      ".filter-btn"
    );


  buttons.forEach(btn => {

    btn.classList.remove(
      "active"
    );

  });


  if (button) {

    button.classList.add(
      "active"
    );

  }


  window.currentFilter =
    category;


  applyCurrentFilter();

};


// ======================================================
// 22. 套用目前篩選
// ======================================================

function applyCurrentFilter() {

  const filter =
    window.currentFilter ||
    "all";


  const items =
    document.querySelectorAll(
      ".task-item"
    );


  items.forEach(item => {

    const category =
      item.dataset.category;


    if (
      filter === "all" ||
      category === filter
    ) {

      item.style.display =
        "";

    } else {

      item.style.display =
        "none";

    }

  });

}


// ======================================================
// 23. 更新今日統計
// ======================================================

function updateSummary() {

  const total =
    currentTasks.length;


  const completedTasks =
    currentTasks.filter(
      task => task.completed
    );


  const completedCount =
    completedTasks.length;


  const totalExp =
    completedTasks.reduce(
      (sum, task) =>
        sum +
        Number(task.exp_reward || 0),
      0
    );


  const totalGold =
    completedTasks.reduce(
      (sum, task) =>
        sum +
        Number(task.gold_reward || 0),
      0
    );


  const rate =
    total > 0
      ? Math.round(
          (completedCount / total) *
          100
        )
      : 0;


  const completedElement =
    document.getElementById(
      "completed-count"
    );

  const rateElement =
    document.getElementById(
      "summary-rate"
    );

  const todayExpElement =
    document.getElementById(
      "today-exp"
    );

  const todayGoldElement =
    document.getElementById(
      "today-gold"
    );

  const rateTextElement =
    document.getElementById(
      "rate-text"
    );

  const rateBar =
    document.getElementById(
      "rate-bar"
    );


  if (completedElement) {

    completedElement.textContent =
      `${completedCount} / ${total}`;

  }


  if (rateElement) {

    rateElement.textContent =
      rate + "%";

  }


  if (todayExpElement) {

    todayExpElement.textContent =
      "+" + totalExp;

  }


  if (todayGoldElement) {

    todayGoldElement.textContent =
      "+" + totalGold;

  }


  if (rateTextElement) {

    rateTextElement.textContent =
      rate + "%";

  }


  if (rateBar) {

    rateBar.style.width =
      rate + "%";

  }

}


// ======================================================
// 24. 預設篩選
// ======================================================

window.currentFilter =
  "all";
