// ========================================
// ⚔️ 神級人生逆襲系統
// V0.6 - Supabase 帳號登入版
// ========================================


// ========================================
// 🔐 Supabase 設定
// ========================================

const SUPABASE_URL =
  "https://smlaokhqhgzjhnxeqfen.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_2uJS9Kex4YSTQh1Bbh3H-w_4cPPW25j";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );


// ========================================
// 🎮 RPG 遊戲資料
// ========================================

const SAVE_KEY =
  "life-reversal-system-save";

let currentLevel = 1;
let currentExp = 50;
let currentGold = 100;

let completedTasks = 0;
let todayExp = 0;
let todayGold = 0;

const totalTasks = 4;

let taskStates = {};


// ========================================
// 👤 目前登入玩家
// ========================================

let currentUser = null;


// ========================================
// 📅 取得今天日期
// ========================================

function getToday() {

  const now = new Date();

  return (
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0")
  );

}


// ========================================
// 💾 LocalStorage 儲存遊戲
// ========================================

function saveGame() {

  const saveData = {

    version: 1,

    date: getToday(),

    currentLevel: currentLevel,

    currentExp: currentExp,

    currentGold: currentGold,

    completedTasks: completedTasks,

    todayExp: todayExp,

    todayGold: todayGold,

    taskStates: taskStates

  };

  try {

    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(saveData)
    );

    console.log(
      "💾 遊戲已保存",
      saveData
    );

  } catch (error) {

    console.error(
      "❌ 保存失敗",
      error
    );

  }

}


// ========================================
// 📂 LocalStorage 載入遊戲
// ========================================

function loadGame() {

  try {

    const savedData =
      localStorage.getItem(SAVE_KEY);

    if (!savedData) {

      console.log(
        "目前沒有舊存檔，使用初始資料"
      );

      return;

    }

    const data =
      JSON.parse(savedData);


    // ====================================
    // 📅 新的一天
    // ====================================

    if (
      data.date &&
      data.date !== getToday()
    ) {

      console.log(
        "📅 新的一天，建立新的每日資料"
      );

      currentLevel =
        data.currentLevel ?? 1;

      currentExp =
        data.currentExp ?? 50;

      currentGold =
        data.currentGold ?? 100;

      completedTasks = 0;

      todayExp = 0;

      todayGold = 0;

      taskStates = {};

      saveGame();

      return;

    }


    // ====================================
    // 恢復玩家資料
    // ====================================

    currentLevel =
      Number(data.currentLevel ?? 1);

    currentExp =
      Number(data.currentExp ?? 50);

    currentGold =
      Number(data.currentGold ?? 100);

    completedTasks =
      Number(data.completedTasks ?? 0);

    todayExp =
      Number(data.todayExp ?? 0);

    todayGold =
      Number(data.todayGold ?? 0);

    taskStates =
      data.taskStates ?? {};

    console.log(
      "✅ 存檔載入成功",
      data
    );

  } catch (error) {

    console.error(
      "❌ 載入存檔失敗",
      error
    );

  }

}


// ========================================
// 📈 升級所需 EXP
// ========================================

function getRequiredExp() {

  return 100 +
    (currentLevel - 1) * 50;

}


// ========================================
// 🎯 完成 / 取消任務
// ========================================

function toggleTask(
  element,
  expReward,
  goldReward
) {

  const isCompleted =
    element.classList.toggle("completed");

  const checkbox =
    element.querySelector(
      ".task-checkbox"
    );

  const taskName =
    element.querySelector(
      ".task-name"
    );

  if (!taskName) {
    return;
  }

  const taskId =
    taskName.textContent.trim();


  // ====================================
  // 完成任務
  // ====================================

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


  // ====================================
  // 取消任務
  // ====================================

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
// ✨ 升級
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
// 🔄 恢復任務
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
// 🖥️ 更新畫面
// ========================================

function updateUI() {

  const levelElement =
    document.getElementById(
      "player-level"
    );

  if (levelElement) {

    levelElement.textContent =
      "Lv." + currentLevel;

  }


  const goldElement =
    document.getElementById(
      "player-gold"
    );

  if (goldElement) {

    goldElement.textContent =
      currentGold;

  }


  const expElement =
    document.getElementById(
      "current-exp"
    );

  if (expElement) {

    expElement.textContent =
      currentExp;

  }


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


  const expBar =
    document.getElementById(
      "exp-bar"
    );

  if (expBar) {

    const percent =
      Math.min(
        (currentExp / requiredExp) * 100,
        100
      );

    expBar.style.width =
      percent + "%";

  }


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


  const rate =
    Math.round(
      (completedTasks / totalTasks) * 100
    );


  const rateText =
    document.getElementById(
      "rate-text"
    );

  if (rateText) {

    rateText.textContent =
      rate + "%";

  }


  const summaryRate =
    document.getElementById(
      "summary-rate"
    );

  if (summaryRate) {

    summaryRate.textContent =
      rate + "%";

  }


  const rateBar =
    document.getElementById(
      "rate-bar"
    );

  if (rateBar) {

    rateBar.style.width =
      rate + "%";

  }


  const todayExpElement =
    document.getElementById(
      "today-exp"
    );

  if (todayExpElement) {

    todayExpElement.textContent =
      "+" + todayExp;

  }


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
// 🗂️ 分類篩選
// ========================================

function filterTasks(
  category,
  button
) {

  const buttons =
    document.querySelectorAll(
      ".filter-btn"
    );

  buttons.forEach(function(btn) {

    btn.classList.remove(
      "active"
    );

  });


  if (button) {

    button.classList.add(
      "active"
    );

  }


  const tasks =
    document.querySelectorAll(
      ".task-item"
    );


  tasks.forEach(function(task) {

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

  });

}


// ========================================
// 📝 註冊
// ========================================

async function registerUser() {

  const email =
    document.getElementById(
      "auth-email"
    ).value.trim();

  const password =
    document.getElementById(
      "auth-password"
    ).value;


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
    "⏳ 正在建立帳號..."
  );


  try {

    const {
      data,
      error
    } =
      await supabaseClient.auth.signUp({

        email: email,

        password: password

      });


    if (error) {

      console.error(
        "註冊錯誤",
        error
      );

      setAuthMessage(
        "❌ 註冊失敗：" +
        error.message
      );

      return;

    }


    console.log(
      "✅ 註冊成功",
      data
    );


    if (data.session) {

      setAuthMessage(
        "✅ 註冊成功，已登入！"
      );

      await handleLoggedInUser(
        data.user
      );

    } else {

      setAuthMessage(
        "✅ 註冊成功！請到 Email 收取驗證信，完成驗證後再登入。"
      );

    }

  } catch (error) {

    console.error(
      error
    );

    setAuthMessage(
      "❌ 發生錯誤，請稍後再試"
    );

  }

}


// ========================================
// 🔑 登入
// ========================================

async function loginUser() {

  const email =
    document.getElementById(
      "auth-email"
    ).value.trim();

  const password =
    document.getElementById(
      "auth-password"
    ).value;


  if (!email || !password) {

    setAuthMessage(
      "⚠️ 請輸入 Email 和密碼"
    );

    return;

  }


  setAuthMessage(
    "⏳ 登入中..."
  );


  try {

    const {
      data,
      error
    } =
      await supabaseClient.auth.signInWithPassword({

        email: email,

        password: password

      });


    if (error) {

      console.error(
        "登入錯誤",
        error
      );

      setAuthMessage(
        "❌ 登入失敗：" +
        error.message
      );

      return;

    }


    console.log(
      "✅ 登入成功",
      data
    );


    await handleLoggedInUser(
      data.user
    );

  } catch (error) {

    console.error(
      error
    );

    setAuthMessage(
      "❌ 發生錯誤，請稍後再試"
    );

  }

}


// ========================================
// 🚪 登出
// ========================================

async function logoutUser() {

  const {
    error
  } =
    await supabaseClient.auth.signOut();


  if (error) {

    console.error(
      "登出錯誤",
      error
    );

    setAuthMessage(
      "❌ 登出失敗：" +
      error.message
    );

    return;

  }


  currentUser = null;

  setAuthMessage(
    "👋 已登出"
  );

  updateAuthUI(
    null
  );

}


// ========================================
// 👤 處理登入玩家
// ========================================

async function handleLoggedInUser(
  user
) {

  if (!user) {
    return;
  }


  currentUser = user;


  console.log(
    "👤 目前玩家：",
    user.id
  );


  updateAuthUI(
    user
  );


  await createProfileIfNeeded(
    user
  );

}


// ========================================
// 🧙 建立玩家 Profile
// ========================================

async function createProfileIfNeeded(
  user
) {

  try {

    const {
      data: profile,
      error: selectError
    } =
      await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();


    if (selectError) {

      console.error(
        "讀取 Profile 失敗",
        selectError
      );

      return;

    }


    // 已經有角色
    if (profile) {

      console.log(
        "✅ 找到現有角色",
        profile
      );

      return;

    }


    // 沒有角色 → 建立
    const {
      error: insertError
    } =
      await supabaseClient
        .from("profiles")
        .insert({

          id: user.id,

          username:
            user.email
              ? user.email.split("@")[0]
              : "玩家",

          level: 1,

          exp: 50,

          gold: 100

        });


    if (insertError) {

      console.error(
        "建立 Profile 失敗",
        insertError
      );

      setAuthMessage(
        "⚠️ 登入成功，但建立角色失敗：" +
        insertError.message
      );

      return;

    }


    console.log(
      "🎮 玩家角色建立成功"
    );

  } catch (error) {

    console.error(
      "Profile 錯誤",
      error
    );

  }

}


// ========================================
// 🔐 更新登入畫面
// ========================================

function updateAuthUI(
  user
) {

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


  if (!authForm || !loggedInArea) {
    return;
  }


  if (user) {

    authForm.style.display =
      "none";

    loggedInArea.style.display =
      "block";


    if (userEmail) {

      userEmail.textContent =
        "👤 已登入：" +
        (user.email || "玩家");

    }

  } else {

    authForm.style.display =
      "block";

    loggedInArea.style.display =
      "none";

  }

}


// ========================================
// 💬 顯示登入訊息
// ========================================

function setAuthMessage(
  message
) {

  const element =
    document.getElementById(
      "auth-message"
    );

  if (element) {

    element.textContent =
      message;

  }

}


// ========================================
// 🔎 檢查目前登入狀態
// ========================================

async function checkAuth() {

  try {

    const {
      data,
      error
    } =
      await supabaseClient.auth.getSession();


    if (error) {

      console.error(
        "取得登入狀態失敗",
        error
      );

      return;

    }


    const session =
      data.session;


    if (session && session.user) {

      await handleLoggedInUser(
        session.user
      );

    } else {

      updateAuthUI(
        null
      );

    }


    // 監聽登入狀態變化

    supabaseClient.auth.onAuthStateChange(
      async function(
        event,
        session
      ) {

        console.log(
          "Auth 狀態：",
          event
        );


        if (
          session &&
          session.user
        ) {

          await handleLoggedInUser(
            session.user
          );

        } else {

          currentUser = null;

          updateAuthUI(
            null
          );

        }

      }
    );

  } catch (error) {

    console.error(
      "Auth 檢查錯誤",
      error
    );

  }

}


// ========================================
// 🚀 網頁啟動
// ========================================

document.addEventListener(
  "DOMContentLoaded",
  async function() {

    console.log(
      "⚔️ 神級人生逆襲系統 V0.6 啟動"
    );


    // 原本的 RPG 存檔
    loadGame();

    restoreTasks();

    updateUI();


    // Supabase 登入
    await checkAuth();

  }
);
