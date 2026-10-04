// ==========================================
// 神級人生逆襲系統
// Supabase 連線診斷版
// ==========================================

const SUPABASE_URL =
  "https://smlaokhqhgzjhnxeqfen.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_2uJS9Kex4YSTQh1Bbh3H-w_4cPPW25j";

// ==========================================
// 基本變數
// ==========================================

let supabaseClient = null;
let currentUser = null;

let gameData = {
  level: 1,
  exp: 50,
  gold: 100,
  completedTasks: []
};

let currentFilter = "all";

// ==========================================
// 顯示診斷訊息
// ==========================================

function showDiagnostic(message, type = "info") {
  let box = document.getElementById("supabase-diagnostic");

  if (!box) {
    box = document.createElement("div");
    box.id = "supabase-diagnostic";

    box.style.margin = "15px 0";
    box.style.padding = "14px";
    box.style.borderRadius = "10px";
    box.style.fontSize = "14px";
    box.style.lineHeight = "1.6";

    const authSection = document.getElementById("auth-section");

    if (authSection) {
      authSection.appendChild(box);
    } else {
      document.body.prepend(box);
    }
  }

  if (type === "success") {
    box.style.background = "#163d27";
    box.style.border = "1px solid #39d98a";
  } else if (type === "error") {
    box.style.background = "#421d1d";
    box.style.border = "1px solid #ff6b6b";
  } else {
    box.style.background = "#1d2d42";
    box.style.border = "1px solid #6ea8fe";
  }

  box.innerHTML = message;
}

// ==========================================
// 初始化 Supabase
// ==========================================

function initializeSupabase() {
  try {
    if (!window.supabase) {
      showDiagnostic(
        "🔴 <strong>Supabase JS 沒有成功載入</strong><br>" +
        "網站找不到 Supabase 程式庫。",
        "error"
      );

      return false;
    }

    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );

    showDiagnostic(
      "🟢 <strong>Supabase 程式庫載入成功</strong><br>" +
      "網站已成功建立 Supabase Client。",
      "success"
    );

    return true;

  } catch (error) {

    console.error("Supabase 初始化失敗：", error);

    showDiagnostic(
      "🔴 <strong>Supabase 初始化失敗</strong><br>" +
      error.message,
      "error"
    );

    return false;
  }
}

// ==========================================
// LocalStorage
// ==========================================

function getToday() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function saveGame() {
  localStorage.setItem(
    "life-reversal-game",
    JSON.stringify(gameData)
  );
}

function loadGame() {
  const saved = localStorage.getItem(
    "life-reversal-game"
  );

  if (saved) {
    try {
      gameData = JSON.parse(saved);
    } catch (error) {
      console.error(
        "讀取 LocalStorage 失敗：",
        error
      );
    }
  }
}

// ==========================================
// EXP
// ==========================================

function getRequiredExp(level) {
  return 100 + (level - 1) * 50;
}

// ==========================================
// 任務完成
// ==========================================

function toggleTask(element, expReward, goldReward) {

  if (!element) return;

  const taskId =
    element.dataset.taskId ||
    element.innerText.trim();

  const alreadyCompleted =
    element.classList.contains("completed");

  if (alreadyCompleted) {

    element.classList.remove("completed");

    gameData.completedTasks =
      gameData.completedTasks.filter(
        id => id !== taskId
      );

    gameData.exp -= expReward;
    gameData.gold -= goldReward;

    if (gameData.exp < 0) {
      gameData.exp = 0;
    }

    if (gameData.gold < 0) {
      gameData.gold = 0;
    }

  } else {

    element.classList.add("completed");

    gameData.completedTasks.push(taskId);

    gameData.exp += expReward;
    gameData.gold += goldReward;

    checkLevelUp();
  }

  saveGame();
  updateUI();
}

// ==========================================
// 升級
// ==========================================

function checkLevelUp() {

  let requiredExp =
    getRequiredExp(gameData.level);

  while (gameData.exp >= requiredExp) {

    gameData.exp -= requiredExp;
    gameData.level += 1;

    gameData.gold += 100;

    alert(
      `🎉 升級成功！\n\n目前等級：Lv.${gameData.level}\n獎勵：+100 金幣`
    );

    requiredExp =
      getRequiredExp(gameData.level);
  }
}

// ==========================================
// 還原任務
// ==========================================

function restoreTasks() {

  const tasks =
    document.querySelectorAll(
      ".task"
    );

  tasks.forEach(task => {

    const taskId =
      task.dataset.taskId ||
      task.innerText.trim();

    if (
      gameData.completedTasks.includes(
        taskId
      )
    ) {
      task.classList.add("completed");
    }
  });
}

// ==========================================
// 更新 UI
// ==========================================

function updateUI() {

  const level =
    document.getElementById(
      "player-level"
    );

  const gold =
    document.getElementById(
      "player-gold"
    );

  const currentExp =
    document.getElementById(
      "current-exp"
    );

  const requiredExp =
    document.getElementById(
      "required-exp"
    );

  const expBar =
    document.getElementById(
      "exp-bar"
    );

  if (level) {
    level.textContent =
      gameData.level;
  }

  if (gold) {
    gold.textContent =
      gameData.gold;
  }

  const required =
    getRequiredExp(
      gameData.level
    );

  if (currentExp) {
    currentExp.textContent =
      gameData.exp;
  }

  if (requiredExp) {
    requiredExp.textContent =
      required;
  }

  if (expBar) {

    const percentage =
      Math.min(
        (gameData.exp / required) * 100,
        100
      );

    expBar.style.width =
      `${percentage}%`;
  }

  const tasks =
    document.querySelectorAll(
      ".task"
    );

  let completed = 0;

  tasks.forEach(task => {

    if (
      task.classList.contains(
        "completed"
      )
    ) {
      completed++;
    }
  });

  const total =
    tasks.length;

  const rate =
    total === 0
      ? 0
      : Math.round(
          completed / total * 100
        );

  const completedCount =
    document.getElementById(
      "completed-count"
    );

  const summaryRate =
    document.getElementById(
      "summary-rate"
    );

  const rateText =
    document.getElementById(
      "rate-text"
    );

  const rateBar =
    document.getElementById(
      "rate-bar"
    );

  if (completedCount) {
    completedCount.textContent =
      `${completed} / ${total}`;
  }

  if (summaryRate) {
    summaryRate.textContent =
      `${rate}%`;
  }

  if (rateText) {
    rateText.textContent =
      `${rate}%`;
  }

  if (rateBar) {
    rateBar.style.width =
      `${rate}%`;
  }
}

// ==========================================
// 任務分類
// ==========================================

function filterTasks(category, button) {

  currentFilter = category;

  const tasks =
    document.querySelectorAll(
      ".task"
    );

  tasks.forEach(task => {

    const taskCategory =
      task.dataset.category;

    if (
      category === "all" ||
      taskCategory === category
    ) {
      task.style.display = "";
    } else {
      task.style.display = "none";
    }
  });

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
}

// ==========================================
// 顯示登入訊息
// ==========================================

function setAuthMessage(message) {

  const box =
    document.getElementById(
      "auth-message"
    );

  if (box) {
    box.textContent =
      message;
  }
}

// ==========================================
// 更新登入 UI
// ==========================================

function updateAuthUI(user) {

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

  if (user) {

    if (authForm) {
      authForm.style.display =
        "none";
    }

    if (loggedInArea) {
      loggedInArea.style.display =
        "block";
    }

    if (userEmail) {
      userEmail.textContent =
        `目前登入：${user.email}`;
    }

    setAuthMessage(
      "🟢 已登入"
    );

  } else {

    if (authForm) {
      authForm.style.display =
        "block";
    }

    if (loggedInArea) {
      loggedInArea.style.display =
        "none";
    }

    setAuthMessage(
      "尚未登入"
    );
  }
}

// ==========================================
// 建立玩家資料
// ==========================================

async function createProfileIfNeeded(user) {

  if (!supabaseClient) {
    throw new Error(
      "Supabase 尚未初始化"
    );
  }

  const {
    data,
    error
  } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {

    const username =
      user.email
        ? user.email.split("@")[0]
        : "玩家";

    const {
      error: insertError
    } = await supabaseClient
      .from("profiles")
      .insert({
        id: user.id,
        username: username,
        level: 1,
        exp: 50,
        gold: 100
      });

    if (insertError) {
      throw insertError;
    }
  }
}

// ==========================================
// 註冊
// ==========================================

async function registerUser() {

  console.log("registerUser 被執行");

  if (!supabaseClient) {

    setAuthMessage(
      "🔴 Supabase 尚未連線"
    );

    return;
  }

  const email =
    document.getElementById(
      "auth-email"
    )?.value.trim();

  const password =
    document.getElementById(
      "auth-password"
    )?.value;

  if (!email || !password) {

    setAuthMessage(
      "⚠️ 請輸入 Email 和密碼"
    );

    return;
  }

  if (password.length < 6) {

    setAuthMessage(
      "⚠️ 密碼至少需要 6 碼"
    );

    return;
  }

  setAuthMessage(
    "⏳ 正在註冊..."
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
      throw error;
    }

    if (data.user) {

      currentUser =
        data.user;

      await createProfileIfNeeded(
        data.user
      );

      updateAuthUI(
        data.user
      );

      setAuthMessage(
        "🟢 註冊成功！"
      );

    } else {

      setAuthMessage(
        "📧 註冊已送出，請檢查 Email 是否需要驗證。"
      );
    }

  } catch (error) {

    console.error(
      "註冊錯誤：",
      error
    );

    setAuthMessage(
      `🔴 註冊失敗：${error.message}`
    );
  }
}

// ==========================================
// 登入
// ==========================================

async function loginUser() {

  console.log("loginUser 被執行");

  if (!supabaseClient) {

    setAuthMessage(
      "🔴 Supabase 尚未連線"
    );

    return;
  }

  const email =
    document.getElementById(
      "auth-email"
    )?.value.trim();

  const password =
    document.getElementById(
      "auth-password"
    )?.value;

  if (!email || !password) {

    setAuthMessage(
      "⚠️ 請輸入 Email 和密碼"
    );

    return;
  }

  setAuthMessage(
    "⏳ 正在登入..."
  );

  try {

    const {
      data,
      error
    } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw error;
    }

    currentUser =
      data.user;

    await createProfileIfNeeded(
      data.user
    );

    updateAuthUI(
      data.user
    );

    setAuthMessage(
      "🟢 登入成功！"
    );

  } catch (error) {

    console.error(
      "登入錯誤：",
      error
    );

    setAuthMessage(
      `🔴 登入失敗：${error.message}`
    );
  }
}

// ==========================================
// 登出
// ==========================================

async function logoutUser() {

  if (!supabaseClient) {
    return;
  }

  const {
    error
  } =
    await supabaseClient.auth.signOut();

  if (error) {

    setAuthMessage(
      `🔴 登出失敗：${error.message}`
    );

    return;
  }

  currentUser = null;

  updateAuthUI(null);

  setAuthMessage(
    "已登出"
  );
}

// ==========================================
// 檢查登入狀態
// ==========================================

async function checkAuth() {

  if (!supabaseClient) {
    return;
  }

  try {

    const {
      data,
      error
    } =
      await supabaseClient.auth.getSession();

    if (error) {
      throw error;
    }

    if (data.session) {

      currentUser =
        data.session.user;

      updateAuthUI(
        currentUser
      );

    } else {

      updateAuthUI(null);
    }

    supabaseClient.auth.onAuthStateChange(
      async (_event, session) => {

        currentUser =
          session?.user || null;

        updateAuthUI(
          currentUser
        );
      }
    );

  } catch (error) {

    console.error(
      "登入狀態檢查失敗：",
      error
    );

    showDiagnostic(
      `🔴 <strong>Supabase 連線錯誤</strong><br>${error.message}`,
      "error"
    );
  }
}

// ==========================================
// 網頁啟動
// ==========================================

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    console.log(
      "神級人生逆襲系統啟動"
    );

    loadGame();

    restoreTasks();

    updateUI();

    const connected =
      initializeSupabase();

    if (connected) {
      await checkAuth();
    }

  }
);
