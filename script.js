// ============================================================
// 神級人生逆襲系統
// Supabase 雲端版 V1.2
// 對應目前的 index.html
// ============================================================


// ============================================================
// 1. Supabase 設定
// ============================================================

const SUPABASE_URL = "https://smlaokhqhgzjhnxeqfen.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_2uJS9Kex4YSTQh1Bbh3H-w_4cPPW25j";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


// ============================================================
// 2. 全域資料
// ============================================================

let currentUser = null;
let currentProfile = null;
let currentTasks = [];


// ============================================================
// 3. 頁面載入
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {

  console.log("神級人生逆襲系統 V1.2 啟動");

  const authMessage = document.getElementById("auth-message");

  if (authMessage) {
    authMessage.textContent = "正在連線到系統……";
  }

  try {

    // 取得目前登入狀態
    const {
      data: {
        session
      },
      error
    } = await supabaseClient.auth.getSession();

    if (error) {
      console.error("取得登入狀態失敗：", error);
      showAuthMessage("登入狀態讀取失敗");
      return;
    }

    if (session && session.user) {

      currentUser = session.user;

      console.log("目前登入玩家：", currentUser.email);

      await handleLoggedIn();

    } else {

      console.log("目前尚未登入");

      showLoggedOutUI();

    }

  } catch (error) {

    console.error("初始化失敗：", error);

    showAuthMessage(
      "系統初始化失敗：" + getErrorMessage(error)
    );

  }


  // ==========================================================
  // 監聽登入 / 登出
  // ==========================================================

  supabaseClient.auth.onAuthStateChange(
    async (event, session) => {

      console.log("Auth 狀態變化：", event);

      if (session && session.user) {

        currentUser = session.user;

        await handleLoggedIn();

      } else {

        currentUser = null;
        currentProfile = null;
        currentTasks = [];

        showLoggedOutUI();

      }

    }
  );

});


// ============================================================
// 4. 登入
// ============================================================

window.loginUser = async function () {

  console.log("loginUser() 被呼叫");

  const emailInput =
    document.getElementById("auth-email");

  const passwordInput =
    document.getElementById("auth-password");

  if (!emailInput || !passwordInput) {

    alert("找不到登入欄位");

    return;

  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email) {

    alert("請輸入 Email");

    return;

  }

  if (!password) {

    alert("請輸入密碼");

    return;

  }

  showAuthMessage("登入中……");

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
        "登入失敗：" + getErrorMessage(error)
      );

      return;

    }

    console.log("登入成功：", data.user);

    currentUser = data.user;

    await handleLoggedIn();

  } catch (error) {

    console.error("登入發生錯誤：", error);

    showAuthMessage(
      "登入發生錯誤：" + getErrorMessage(error)
    );

  }

};


// ============================================================
// 5. 註冊
// ============================================================

window.registerUser = async function () {

  console.log("registerUser() 被呼叫");

  const emailInput =
    document.getElementById("auth-email");

  const passwordInput =
    document.getElementById("auth-password");

  if (!emailInput || !passwordInput) {

    alert("找不到註冊欄位");

    return;

  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email) {

    alert("請輸入 Email");

    return;

  }

  if (!password) {

    alert("請輸入密碼");

    return;

  }

  if (password.length < 6) {

    alert("密碼至少需要 6 碼");

    return;

  }

  showAuthMessage("註冊中……");

  try {

    const {
      data,
      error
    } = await supabaseClient.auth.signUp({
      email,
      password
    });

    if (error) {

      console.error("註冊失敗：", error);

      showAuthMessage(
        "註冊失敗：" + getErrorMessage(error)
      );

      return;

    }

    console.log("註冊結果：", data);

    if (data.session) {

      currentUser = data.user;

      await handleLoggedIn();

    } else {

      showAuthMessage(
        "註冊成功！請先到 Email 完成驗證，再登入。"
      );

    }

  } catch (error) {

    console.error("註冊發生錯誤：", error);

    showAuthMessage(
      "註冊發生錯誤：" + getErrorMessage(error)
    );

  }

};


// ============================================================
// 6. 登出
// ============================================================

window.logoutUser = async function () {

  console.log("logoutUser() 被呼叫");

  try {

    const {
      error
    } = await supabaseClient.auth.signOut();

    if (error) {

      console.error("登出失敗：", error);

      alert(
        "登出失敗：" + getErrorMessage(error)
      );

      return;

    }

    currentUser = null;
    currentProfile = null;
    currentTasks = [];

    showLoggedOutUI();

  } catch (error) {

    console.error("登出發生錯誤：", error);

    alert(
      "登出發生錯誤：" + getErrorMessage(error)
    );

  }

};


// ============================================================
// 7. 登入成功後處理
// ============================================================

async function handleLoggedIn() {

  console.log(
    "開始載入玩家資料：",
    currentUser?.email
  );

  showLoggedInUI();

  await loadProfile();

  await loadTasks();

}


// ============================================================
// 8. 載入玩家 Profile
// ============================================================

async function loadProfile() {

  if (!currentUser) {

    console.warn("loadProfile：目前沒有登入玩家");

    return;

  }

  console.log(
    "正在載入玩家 Profile：",
    currentUser.id
  );

  try {

    const {
      data,
      error
    } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error) {

      console.error(
        "Profile 載入失敗：",
        error
      );

      showAuthMessage(
        "玩家資料載入失敗：" +
        getErrorMessage(error)
      );

      return;

    }

    if (!data) {

      console.warn("找不到玩家 Profile");

      showAuthMessage(
        "找不到玩家資料，請重新登入。"
      );

      return;

    }

    currentProfile = data;

    console.log(
      "玩家資料載入成功：",
      currentProfile
    );

    updatePlayerUI();

    showAuthMessage(
      "Supabase 玩家資料載入成功"
    );

  } catch (error) {

    console.error(
      "Profile 發生錯誤：",
      error
    );

  }

}


// ============================================================
// 9. 更新玩家畫面
// ============================================================

function updatePlayerUI() {

  if (!currentProfile) return;

  const level =
    Number(currentProfile.level) || 1;

  const exp =
    Number(currentProfile.exp) || 0;

  const gold =
    Number(currentProfile.gold) || 0;

  const playerLevel =
    document.getElementById("player-level");

  const playerGold =
    document.getElementById("player-gold");

  const currentExp =
    document.getElementById("current-exp");

  const requiredExp =
    document.getElementById("required-exp");

  const expBar =
    document.getElementById("exp-bar");


  // 等級
  if (playerLevel) {

    playerLevel.textContent =
      `Lv.${level}`;

  }


  // 金幣
  if (playerGold) {

    playerGold.textContent =
      gold;

  }


  // 當前 EXP
  if (currentExp) {

    currentExp.textContent =
      exp;

  }


  // 下一級所需 EXP
  const required =
    100 + (level - 1) * 50;

  if (requiredExp) {

    requiredExp.textContent =
      required;

  }


  // EXP 進度條
  if (expBar) {

    const percentage =
      Math.min(
        100,
        Math.max(
          0,
          (exp / required) * 100
        )
      );

    expBar.style.width =
      `${percentage}%`;

  }

}


// ============================================================
// 10. 載入今日任務
// ============================================================

async function loadTasks() {

  if (!currentUser) {

    console.warn("loadTasks：沒有登入");

    return;

  }

  console.log(
    "正在載入今日任務……"
  );

  try {

    const today =
      getLocalDateString();

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
        "任務載入失敗：",
        error
      );

      showAuthMessage(
        "任務載入失敗：" +
        getErrorMessage(error)
      );

      return;

    }

    currentTasks = data || [];

    console.log(
      "今日任務載入成功",
      currentTasks
    );

    renderTasks();

    updateDailySummary();

    showAuthMessage(
      `今日任務載入成功｜共 ${currentTasks.length} 個任務`
    );

  } catch (error) {

    console.error(
      "任務載入發生錯誤：",
      error
    );

  }

}


// ============================================================
// 11. 渲染任務
// ============================================================

function renderTasks() {

  const taskList =
    document.querySelector(".task-list");

  if (!taskList) {

    console.error(
      "找不到 .task-list"
    );

    return;

  }

  taskList.innerHTML = "";

  if (currentTasks.length === 0) {

    const emptyItem =
      document.createElement("li");

    emptyItem.className =
      "task-item";

    emptyItem.innerHTML =
      `
      <div class="task-info">
        <span class="task-name">
          今天還沒有任務
        </span>
      </div>
      `;

    taskList.appendChild(
      emptyItem
    );

    return;

  }


  currentTasks.forEach(task => {

    const li =
      document.createElement("li");

    li.className =
      "task-item";

    li.dataset.category =
      task.category || "study";

    li.dataset.difficulty =
      task.difficulty || "normal";

    li.dataset.taskId =
      task.id;


    // 已完成樣式
    if (task.completed) {

      li.classList.add("completed");

    }


    const checkbox =
      task.completed
        ? "☑"
        : "☐";


    const categoryInfo =
      getCategoryInfo(task.category);


    const difficultyInfo =
      getDifficultyInfo(task.difficulty);


    li.innerHTML =
      `
      <span class="task-checkbox">
        ${checkbox}
      </span>

      <div class="task-info">

        <small>
          ${categoryInfo}
        </small>

        <span class="task-name">
          ${escapeHTML(task.title)}
        </span>

        <span class="difficulty ${escapeHTML(task.difficulty || "normal")}">
          ${difficultyInfo}
        </span>

      </div>

      <div class="reward">

        <span>
          +${Number(task.exp_reward) || 0} EXP
        </span>

        <span class="gold-reward">
          +${Number(task.gold_reward) || 0} 💰
        </span>

      </div>
      `;


    // 任務點擊
    li.addEventListener(
      "click",
      () => {

        toggleTask(li);

      }
    );


    taskList.appendChild(li);

  });

}


// ============================================================
// 12. 完成任務
// ============================================================

window.toggleTask = async function (
  element,
  fallbackExp = 0,
  fallbackGold = 0
) {

  console.log(
    "toggleTask() 被呼叫",
    element
  );


  if (!currentUser) {

    alert("請先登入玩家帳號");

    return;

  }


  // 取得任務 ID
  const taskId =
    element?.dataset?.taskId;


  // ----------------------------------------------------------
  // 如果是舊版 HTML 裡的靜態任務
  // ----------------------------------------------------------

  if (!taskId) {

    console.log(
      "這是尚未同步到 Supabase 的舊版靜態任務"
    );

    alert(
      "目前任務尚未取得雲端任務 ID，請重新整理頁面後再試一次。"
    );

    return;

  }


  // ----------------------------------------------------------
  // 找目前任務
  // ----------------------------------------------------------

  const task =
    currentTasks.find(
      item =>
        String(item.id) ===
        String(taskId)
    );


  if (!task) {

    alert("找不到這個任務");

    return;

  }


  // ----------------------------------------------------------
  // 已完成
  // ----------------------------------------------------------

  if (task.completed) {

    alert("這個任務今天已經完成了！");

    return;

  }


  // ----------------------------------------------------------
  // 防止連續點擊
  // ----------------------------------------------------------

  element.style.pointerEvents =
    "none";

  element.style.opacity =
    "0.6";


  showAuthMessage(
    "正在完成任務……"
  );


  try {

    console.log(
      "呼叫 complete_task RPC：",
      task.id
    );


    const {
      data,
      error
    } = await supabaseClient.rpc(
      "complete_task",
      {
        p_task_id: Number(task.id)
      }
    );


    if (error) {

      console.error(
        "complete_task RPC 失敗：",
        error
      );

      alert(
        "任務完成失敗：\n" +
        getErrorMessage(error)
      );

      return;

    }


    console.log(
      "任務完成結果：",
      data
    );


    if (!data || data.success !== true) {

      alert(
        data?.message ||
        "任務沒有完成"
      );

      return;

    }


    // --------------------------------------------------------
    // 更新本地玩家資料
    // --------------------------------------------------------

    currentProfile.level =
      Number(data.level);

    currentProfile.exp =
      Number(data.exp);

    currentProfile.gold =
      Number(data.gold);


    // --------------------------------------------------------
    // 更新本地任務狀態
    // --------------------------------------------------------

    const targetTask =
      currentTasks.find(
        item =>
          String(item.id) ===
          String(task.id)
      );


    if (targetTask) {

      targetTask.completed =
        true;

      targetTask.completed_at =
        new Date().toISOString();

    }


    // --------------------------------------------------------
    // 更新畫面
    // --------------------------------------------------------

    updatePlayerUI();

    renderTasks();

    updateDailySummary();


    showAuthMessage(
      `任務完成！ +${data.task_exp} EXP｜+${data.task_gold} 金幣`
    );


    // 升級提示
    if (
      Number(data.level) >
      Number(task.player_level || currentProfile.level)
    ) {

      alert(
        `🎉 升級成功！\n\n目前等級：Lv.${data.level}`
      );

    }


  } catch (error) {

    console.error(
      "完成任務發生錯誤：",
      error
    );

    alert(
      "完成任務發生錯誤：\n" +
      getErrorMessage(error)
    );

  } finally {

    element.style.pointerEvents =
      "";

    element.style.opacity =
      "";

  }

};


// ============================================================
// 13. 任務分類篩選
// ============================================================

window.filterTasks = function (
  category,
  button
) {

  console.log(
    "篩選任務：",
    category
  );


  const items =
    document.querySelectorAll(
      ".task-list .task-item"
    );


  items.forEach(item => {

    const itemCategory =
      item.dataset.category;


    if (
      category === "all" ||
      itemCategory === category
    ) {

      item.style.display = "";

    } else {

      item.style.display =
        "none";

    }

  });


  // 更新按鈕 active
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

};


// ============================================================
// 14. 今日統計
// ============================================================

function updateDailySummary() {

  const total =
    currentTasks.length;

  const completedTasks =
    currentTasks.filter(
      task => task.completed
    );


  const completed =
    completedTasks.length;


  const rate =
    total > 0
      ? Math.round(
          (completed / total) * 100
        )
      : 0;


  const todayExp =
    completedTasks.reduce(
      (sum, task) =>
        sum +
        Number(task.exp_reward || 0),
      0
    );


  const todayGold =
    completedTasks.reduce(
      (sum, task) =>
        sum +
        Number(task.gold_reward || 0),
      0
    );


  // 任務完成
  const completedCount =
    document.getElementById(
      "completed-count"
    );

  if (completedCount) {

    completedCount.textContent =
      `${completed} / ${total}`;

  }


  // 完成率
  const summaryRate =
    document.getElementById(
      "summary-rate"
    );

  if (summaryRate) {

    summaryRate.textContent =
      `${rate}%`;

  }


  // 今日 EXP
  const todayExpElement =
    document.getElementById(
      "today-exp"
    );

  if (todayExpElement) {

    todayExpElement.textContent =
      `+${todayExp}`;

  }


  // 今日金幣
  const todayGoldElement =
    document.getElementById(
      "today-gold"
    );

  if (todayGoldElement) {

    todayGoldElement.textContent =
      `+${todayGold}`;

  }


  // 底部完成率
  const rateText =
    document.getElementById(
      "rate-text"
    );

  if (rateText) {

    rateText.textContent =
      `${rate}%`;

  }


  const rateBar =
    document.getElementById(
      "rate-bar"
    );

  if (rateBar) {

    rateBar.style.width =
      `${rate}%`;

  }

}


// ============================================================
// 15. 登入畫面
// ============================================================

function showLoggedInUI() {

  const authForm =
    document.getElementById(
      "auth-form"
    );

  const loggedInArea =
    document.getElementById(
      "logged-in-area"
    );

  const userEmail =
    document.getElementById(
      "user-email"
    );


  if (authForm) {

    authForm.style.display =
      "none";

  }


  if (loggedInArea) {

    loggedInArea.style.display =
      "block";

  }


  if (userEmail && currentUser) {

    userEmail.textContent =
      `目前玩家：${currentUser.email}`;

  }

}


// ============================================================
// 16. 登出畫面
// ============================================================

function showLoggedOutUI() {

  const authForm =
    document.getElementById(
      "auth-form"
    );

  const loggedInArea =
    document.getElementById(
      "logged-in-area"
    );


  if (authForm) {

    authForm.style.display =
      "block";

  }


  if (loggedInArea) {

    loggedInArea.style.display =
      "none";

  }


  showAuthMessage(
    "尚未登入"
  );

}


// ============================================================
// 17. 顯示登入訊息
// ============================================================

function showAuthMessage(message) {

  const element =
    document.getElementById(
      "auth-message"
    );

  if (element) {

    element.textContent =
      message;

  }

}


// ============================================================
// 18. 類別名稱
// ============================================================

function getCategoryInfo(category) {

  switch (category) {

    case "toeic":
      return "🇬🇧 多益";

    case "study":
      return "📚 學習";

    case "focus":
      return "🎯 專注";

    case "health":
      return "❤️ 健康";

    default:
      return "📌 任務";

  }

}


// ============================================================
// 19. 難度名稱
// ============================================================

function getDifficultyInfo(difficulty) {

  switch (difficulty) {

    case "easy":
      return "🟢 簡單";

    case "normal":
      return "🔵 普通";

    case "hard":
      return "🟣 困難";

    default:
      return "🔵 普通";

  }

}


// ============================================================
// 20. 台灣日期
// ============================================================

function getLocalDateString() {

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


// ============================================================
// 21. HTML 安全處理
// ============================================================

function escapeHTML(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


// ============================================================
// 22. 錯誤訊息
// ============================================================

function getErrorMessage(error) {

  if (!error) {

    return "未知錯誤";

  }

  return (
    error.message ||
    error.error_description ||
    String(error)
  );

}


// ============================================================
// 23. 啟動完成
// ============================================================

console.log(
  "⚔️ 神級人生逆襲系統 V1.2 script.js 已載入"
);
