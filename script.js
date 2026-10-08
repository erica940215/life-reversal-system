/* =========================================================
   RPG 人生逆襲系統 V2
   Supabase + 任務系統
========================================================= */


/* =========================================================
   1. SUPABASE 設定
========================================================= */

const SUPABASE_URL =
  "https://smlaokhqhgzjhnxeqfen.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_2uJS9Kex4YSTQh1Bbh3H-w_4cPPW25j";

/* 建立 Supabase Client */
const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


/* =========================================================
   2. 全域狀態
========================================================= */

let currentUser = null;
let currentProfile = null;

let currentTasks = [];
let currentTaskFilter = "all";
let currentManagedFilter = "all";


/* =========================================================
   3. 頁面初始化
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

  console.log("🚀 RPG 系統啟動");

  try {
    await checkSession();
  } catch (error) {
    console.error("初始化失敗：", error);
  }

});


/* =========================================================
   4. 登入狀態檢查
========================================================= */

async function checkSession() {

  const {
    data,
    error
  } = await db.auth.getSession();

  if (error) {

    console.error("取得登入狀態失敗：", error);

    showLoggedOutUI();

    return;
  }

  if (data.session && data.session.user) {

    console.log("✅ 已登入");

    currentUser = data.session.user;

    await showLoggedInUI();

  } else {

    console.log("ℹ️ 尚未登入");

    showLoggedOutUI();

  }

}


/* =========================================================
   5. 登入
========================================================= */

async function loginUser() {

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  if (!emailInput || !passwordInput) {

    console.error("找不到 email 或 password 欄位");

    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {

    showAuthMessage(
      "請輸入 Email 和密碼",
      true
    );

    return;
  }


  showAuthMessage("登入中，請稍候...", false);


  try {

    const {
      data,
      error
    } = await db.auth.signInWithPassword({
      email,
      password
    });


    if (error) {

      console.error("登入錯誤：", error);

      showAuthMessage(
        "❌ 登入失敗：" + error.message,
        true
      );

      return;
    }


    if (!data.user) {

      showAuthMessage(
        "❌ 登入失敗，沒有取得使用者資料",
        true
      );

      return;
    }


    currentUser = data.user;

    console.log("✅ 登入成功：", currentUser.email);

    showAuthMessage(
      "✅ 登入成功！",
      false
    );


    await showLoggedInUI();

  } catch (error) {

    console.error("登入發生錯誤：", error);

    showAuthMessage(
      "❌ 登入發生錯誤：" + error.message,
      true
    );

  }

}


/* =========================================================
   6. 註冊
========================================================= */

async function registerUser() {

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  if (!emailInput || !passwordInput) {

    console.error("找不到 email 或 password 欄位");

    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;


  if (!email || !password) {

    showAuthMessage(
      "請輸入 Email 和密碼",
      true
    );

    return;
  }


  if (password.length < 6) {

    showAuthMessage(
      "密碼至少需要 6 個字元",
      true
    );

    return;
  }


  showAuthMessage(
    "註冊中，請稍候...",
    false
  );


  try {

    const {
      data,
      error
    } = await db.auth.signUp({
      email,
      password
    });


    if (error) {

      console.error("註冊錯誤：", error);

      showAuthMessage(
        "❌ 註冊失敗：" + error.message,
        true
      );

      return;
    }


    console.log("註冊結果：", data);


    /*
      如果 Supabase 開啟 Email 驗證，
      data.session 會是 null。
    */

    if (!data.session) {

      showAuthMessage(
        "✅ 註冊成功！請到信箱完成 Email 驗證後再登入。",
        false
      );

      return;
    }


    currentUser = data.user;

    showAuthMessage(
      "✅ 註冊成功！",
      false
    );


    await showLoggedInUI();


  } catch (error) {

    console.error("註冊發生錯誤：", error);

    showAuthMessage(
      "❌ 註冊發生錯誤：" + error.message,
      true
    );

  }

}


/* =========================================================
   7. 登出
========================================================= */

async function logoutUser() {

  try {

    const {
      error
    } = await db.auth.signOut();


    if (error) {

      console.error("登出失敗：", error);

      return;
    }


    currentUser = null;
    currentProfile = null;
    currentTasks = [];


    console.log("👋 已登出");


    showLoggedOutUI();


  } catch (error) {

    console.error("登出發生錯誤：", error);

  }

}


/* =========================================================
   8. 登入後 UI
========================================================= */

async function showLoggedInUI() {

  const authSection =
    document.getElementById("auth-section");

  const appSection =
    document.getElementById("app-section");


  if (authSection) {

    authSection.style.display = "none";

  }


  if (appSection) {

    appSection.style.display = "block";

  }


  const username =
    document.getElementById("username");


  if (username && currentUser) {

    username.textContent =
      currentUser.email || "玩家";

  }


  /*
    載入玩家資料
  */

  try {

    await loadPlayer();

  } catch (error) {

    console.error(
      "玩家資料載入失敗：",
      error
    );

  }


  /*
    載入任務
  */

  try {

    await loadTasks();

  } catch (error) {

    console.error(
      "任務載入失敗：",
      error
    );

  }


  /*
    載入任務管理
  */

  try {

    await loadTaskManagement();

  } catch (error) {

    console.error(
      "任務管理載入失敗：",
      error
    );

  }


  /*
    載入今天的每日結算（如果已經結算過）
  */

  try {

    await loadDailyReport();

  } catch (error) {

    console.error(
      "每日結算載入失敗：",
      error
    );

  }


  /*
    載入晨間打卡 / 專注 / 想法庫（today.js）
  */

  if (typeof loadTodayModules === "function") {

    await loadTodayModules();

  }

}


/* =========================================================
   9. 登出後 UI
========================================================= */

function showLoggedOutUI() {

  const authSection =
    document.getElementById("auth-section");

  const appSection =
    document.getElementById("app-section");


  if (authSection) {

    /*
      清掉 inline 樣式，讓 CSS 的 display:flex 生效（才會置中）。
      原本設成 "block" 會蓋掉 flex，卡片就跑到左上角。
    */
    authSection.style.display = "";

  }


  if (appSection) {

    appSection.style.display = "none";

  }


  /*
    停止專注計時的畫面更新、清掉今日模組的資料
  */

  if (typeof resetTodayModules === "function") {

    resetTodayModules();

  }

}


/* =========================================================
   10. 登入訊息
========================================================= */

function showAuthMessage(message, isError = false) {

  const element =
    document.getElementById("auth-message");


  if (!element) return;


  element.textContent = message;


  if (isError) {

    element.style.color = "#ff6b6b";

  } else {

    element.style.color = "#7bed9f";

  }

}


/* =========================================================
   11. 取得今天日期
========================================================= */

function getToday() {

  /*
    固定用台灣時間，和資料庫的 generate_daily_tasks 一致
    （sv-SE 格式剛好是 YYYY-MM-DD）
  */

  return new Date().toLocaleDateString(
    "sv-SE",
    { timeZone: "Asia/Taipei" }
  );

}


/* =========================================================
   12. 玩家資料
========================================================= */

async function loadPlayer() {

  if (!currentUser) return;


  const {
    data,
    error
  } = await db
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();


  if (error) {

    console.error(
      "取得玩家資料失敗：",
      error
    );

    return;
  }


  /*
    如果沒有 profile，
    自動建立一個
  */

  if (!data) {

    console.log("建立新的玩家資料");


    const {
      data: newProfile,
      error: createError
    } = await db
      .from("profiles")
      .insert({

        id: currentUser.id,

        username:
          currentUser.email
            ? currentUser.email.split("@")[0]
            : "玩家",

        level: 1,

        exp: 0,

        gold: 100

      })
      .select()
      .single();


    if (createError) {

      console.error(
        "建立玩家資料失敗：",
        createError
      );

      return;
    }


    currentProfile = newProfile;

  } else {

    currentProfile = data;

  }


  renderPlayer();

}


/* =========================================================
   13. 顯示玩家資料
========================================================= */

function renderPlayer() {

  if (!currentProfile) return;


  const level =
    Number(currentProfile.level || 1);

  const exp =
    Number(currentProfile.exp || 0);

  const gold =
    Number(currentProfile.gold || 0);


  const levelElement =
    document.getElementById("player-level");

  const expElement =
    document.getElementById("player-exp");

  const goldElement =
    document.getElementById("player-gold");

  const progressElement =
    document.getElementById("exp-progress");

  const expTextElement =
    document.getElementById("exp-text");


  if (levelElement) {

    levelElement.textContent =
      level;

  }


  if (expElement) {

    expElement.textContent =
      exp;

  }


  if (goldElement) {

    goldElement.textContent =
      gold;

  }


  /*
    升級門檻和資料庫的 complete_task 一致：
    Lv1 → 100、Lv2 → 150、Lv3 → 200 ……（每級 +50）

    資料庫存的 exp 已經是「這一級累積的經驗」，
    升級時會自動扣掉門檻，所以直接用，不用再取餘數
  */

  const expNeeded =
    100 + (level - 1) * 50;

  const currentExp =
    exp;

  const progress =
    Math.min(
      100,
      (currentExp / expNeeded) * 100
    );


  if (progressElement) {

    progressElement.style.width =
      `${progress}%`;

  }


  if (expTextElement) {

    expTextElement.textContent =
      `${currentExp} / ${expNeeded}`;

  }

}


/* =========================================================
   14. 任務獎勵
========================================================= */

function getTaskReward(difficulty) {

  const rewards = {

    easy: {
      exp: 10,
      gold: 5
    },

    normal: {
      exp: 20,
      gold: 10
    },

    hard: {
      exp: 35,
      gold: 20
    },

    epic: {
      exp: 55,
      gold: 35
    }

  };


  return rewards[difficulty]
    || rewards.normal;

}


/*
  任務「實際」會給的獎勵：
  以資料庫存的 exp_reward / gold_reward 為準
  （complete_task 就是用這兩欄發獎勵），
  舊資料沒有這兩欄時才退回用難度計算
*/

function getActualReward(task) {

  const fallback =
    getTaskReward(task.difficulty);


  return {

    exp:
      task.exp_reward ?? fallback.exp,

    gold:
      task.gold_reward ?? fallback.gold

  };

}


/* =========================================================
   15. 難度文字
========================================================= */

function getDifficultyLabel(difficulty) {

  const labels = {

    easy: "簡單",

    normal: "普通",

    hard: "困難",

    epic: "史詩"

  };


  return labels[difficulty]
    || difficulty
    || "普通";

}


/* =========================================================
   16. 分類文字
========================================================= */

function getCategoryLabel(category) {

  const labels = {

    survival: "生存整理",

    personal: "個人生活",

    study: "學習",

    toeic: "多益",

    focus: "專注",

    health: "健康",

    daily: "每日收尾",

    random: "隨機自律"

  };


  return labels[category]
    || category
    || "其他";

}


/* =========================================================
   17. 載入今天任務
========================================================= */

async function loadTasks() {

  if (!currentUser) return;


  const today = getToday();


  /*
    先嘗試執行每日任務 RPC
  */

  try {

    const {
      error
    } = await db.rpc(
      "generate_daily_tasks"
    );
    /*
      資料庫版本不需要參數：
      使用者用 auth.uid() 判斷，日期用台灣時間
    */


    if (error) {

      console.warn(
        "generate_daily_tasks 執行失敗：",
        error
      );

    }

  } catch (error) {

    console.warn(
      "每日任務產生失敗：",
      error
    );

  }


  /*
    取得今天任務
  */

  const {
    data,
    error
  } = await db
    .from("tasks")
    .select("*")
    .eq("user_id", currentUser.id)
    .eq("task_date", today)
    .order("created_at", {
      ascending: true
    });


  if (error) {

    console.error(
      "載入任務失敗：",
      error
    );

    currentTasks = [];

    renderTasks();

    return;

  }


  currentTasks = data || [];


  renderTasks();

  updateSummary();

}


/* =========================================================
   18. 顯示今天任務
========================================================= */

function renderTasks() {

  const list =
    document.getElementById("task-list");


  if (!list) return;


  let tasks =
    [...currentTasks];


  /*
    篩選
  */

  if (currentTaskFilter === "completed") {

    tasks =
      tasks.filter(
        task => task.completed === true
      );

  }


  if (currentTaskFilter === "uncompleted") {

    tasks =
      tasks.filter(
        task => task.completed !== true
      );

  }


  /*
    沒有任務
  */

  if (tasks.length === 0) {

    list.innerHTML = `
      <div class="empty-state">
        🎮 目前沒有任務
      </div>
    `;

    return;

  }


  list.innerHTML = tasks
    .map(task => {

      const reward =
        getActualReward(task);


      return `

        <div
          class="task-item ${task.completed ? "completed" : ""}"
          data-task-id="${task.id}"
        >

          <div class="task-main">

            <div class="task-checkbox">

              <input
                type="checkbox"
                ${task.completed ? "checked" : ""}
                onchange="toggleTask('${task.id}', this.checked, this)"
              >

            </div>


            <div class="task-content">

              <div class="task-title">
                ${escapeHtml(task.title)}
              </div>


              <div class="task-meta">

                <span>
                  ${getCategoryLabel(task.category)}
                </span>

                <span>
                  ${getDifficultyLabel(task.difficulty)}
                </span>

                <span>
                  +${reward.exp} EXP
                </span>

                <span>
                  +${reward.gold} 金幣
                </span>

              </div>

            </div>


            <div class="task-actions">

              <button
                onclick="editTask('${task.id}')"
              >
                ✏️
              </button>


              <button
                onclick="deleteTask('${task.id}')"
              >
                🗑️
              </button>

            </div>

          </div>

        </div>

      `;

    })
    .join("");

}


/* =========================================================
   19. HTML 防注入
========================================================= */

function escapeHtml(value) {

  if (value === null || value === undefined) {

    return "";

  }


  return String(value)

    .replace(/&/g, "&amp;")

    .replace(/</g, "&lt;")

    .replace(/>/g, "&gt;")

    .replace(/"/g, "&quot;")

    .replace(/'/g, "&#039;");

}


/* =========================================================
   20. 任務篩選
========================================================= */

function filterTasks(filter, button) {

  currentTaskFilter = filter;


  /*
    按鈕 active
  */

  const buttons =
    document.querySelectorAll(
      "[onclick^=\"filterTasks\"]"
    );


  buttons.forEach(btn => {

    btn.classList.remove("active");

  });


  if (button) {

    button.classList.add("active");

  }


  renderTasks();

}


/* =========================================================
   21. 新增任務
========================================================= */

async function addTask() {

  if (!currentUser) {

    showAddTaskMessage(
      "請先登入",
      true
    );

    return;

  }


  const titleElement =
    document.getElementById("new-task-title");

  const categoryElement =
    document.getElementById("new-task-category");

  const difficultyElement =
    document.getElementById("new-task-difficulty");


  if (
    !titleElement ||
    !categoryElement ||
    !difficultyElement
  ) {

    return;

  }


  const title =
    titleElement.value.trim();

  const category =
    categoryElement.value;

  const difficulty =
    difficultyElement.value;


  if (!title) {

    showAddTaskMessage(
      "請輸入任務名稱",
      true
    );

    return;

  }


  /*
    重複設定
  */

  const repeatElement =
    document.querySelector(
      'input[name="new-task-repeat"]:checked'
    );


  const repeat =
    repeatElement
      ? repeatElement.value
      : "once";


  const repeatTypeElement =
    document.querySelector(
      'select[name="repeat-type"]'
    );


  const repeatType =
    repeatTypeElement
      ? repeatTypeElement.value
      : "daily";


  const repeatDayElement =
    document.querySelector(
      'select[name="repeat-day"]'
    );


  const repeatDay =
    repeatDayElement
      ? repeatDayElement.value
      : null;


  const endDateElement =
    document.getElementById(
      "repeat-end-date"
    );


  const repeatEndDate =
    endDateElement &&
    endDateElement.value
      ? endDateElement.value
      : null;


  /*
    建立任務
  */

  const reward =
    getTaskReward(difficulty);


  /*
    單次任務 → 直接存進 tasks（今天的任務）
    重複任務 → 存進 task_templates（範本），
              由 generate_daily_tasks 每天照範本產生當天任務
  */

  try {

    let data;
    let error;


    if (repeat === "repeat") {

      ({ data, error } = await db
        .from("task_templates")
        .insert({

          user_id: currentUser.id,

          title,

          category,

          difficulty,

          exp_reward: reward.exp,

          gold_reward: reward.gold,

          repeat_enabled: true,

          repeat_type: repeatType,

          /* 星期一 = 1 ... 星期日 = 7 */
          repeat_days:
            repeatType === "weekly"
              ? [Number(repeatDay)]
              : [],

          repeat_end_date: repeatEndDate

        })
        .select()
        .single());

    } else {

      ({ data, error } = await db
        .from("tasks")
        .insert({

          user_id: currentUser.id,

          title,

          category,

          difficulty,

          exp_reward: reward.exp,

          gold_reward: reward.gold,

          task_date: getToday(),

          completed: false

        })
        .select()
        .single());

    }


    if (error) {

      console.error(
        "新增任務失敗：",
        error
      );


      showAddTaskMessage(
        "❌ 新增失敗：" + error.message,
        true
      );

      return;

    }


    console.log(
      "✅ 任務建立成功",
      data
    );


    showAddTaskMessage(
      "✅ 任務新增成功！",
      false
    );


    clearTaskForm();


    await loadTasks();

    await loadTaskManagement();


  } catch (error) {

    console.error(
      "新增任務發生錯誤：",
      error
    );


    showAddTaskMessage(
      "❌ 新增任務發生錯誤",
      true
    );

  }

}


/* =========================================================
   22. 新增任務訊息
========================================================= */

function showAddTaskMessage(
  message,
  isError = false
) {

  const element =
    document.getElementById(
      "add-task-message"
    );


  if (!element) return;


  element.textContent =
    message;


  element.style.color =
    isError
      ? "#ff6b6b"
      : "#7bed9f";

}


/* =========================================================
   23. 清空新增任務表單
========================================================= */

function clearTaskForm() {

  const title =
    document.getElementById(
      "new-task-title"
    );


  if (title) {

    title.value = "";

  }


  const endDate =
    document.getElementById(
      "repeat-end-date"
    );


  if (endDate) {

    endDate.value = "";

  }

}


/* =========================================================
   24. 完成 / 取消任務
========================================================= */

/*
  規則（方案 B：取消就扣回）：
  - 勾選   → complete_task：加 EXP / 金幣，必要時升級
  - 取消勾選 → uncomplete_task：扣回 EXP / 金幣，必要時降級
  兩個方向都交給資料庫處理，前端不再直接改 completed，
  這樣 EXP 永遠和任務狀態一致，也刷不了分。
*/

async function toggleTask(
  taskId,
  completed,
  checkbox
) {

  if (!currentUser) return;


  /*
    送出期間先鎖住勾選框，防止連點
  */

  if (checkbox) {

    checkbox.disabled = true;

  }


  try {

    const {
      data,
      error
    } = await db.rpc(
      completed
        ? "complete_task"
        : "uncomplete_task",
      {
        p_task_id: taskId
      }
    );


    if (error) {

      throw error;

    }


    if (data && data.success === false) {

      /*
        例如畫面還沒更新、任務其實早就是這個狀態，
        重新載入就會對上
      */

      console.warn(
        "任務狀態沒有改變：",
        data.message
      );

    }


    await loadPlayer();

    await loadTasks();

    await loadTaskManagement();


  } catch (error) {

    console.error(
      "更新任務失敗：",
      error
    );


    /*
      失敗就把勾選框還原，不偷偷改成「完成但沒獎勵」
    */

    if (checkbox) {

      checkbox.checked = !completed;

    }


    alert(
      "更新任務失敗：" +
      error.message
    );

  } finally {

    if (checkbox) {

      checkbox.disabled = false;

    }

  }

}


/* =========================================================
   26. 編輯任務
========================================================= */

async function editTask(taskId) {

  const task =
    currentTasks.find(
      item => String(item.id) === String(taskId)
    );


  if (!task) {

    alert("找不到這個任務");

    return;

  }


  const newTitle =
    prompt(
      "修改任務名稱：",
      task.title
    );


  if (newTitle === null) {

    return;

  }


  const title =
    newTitle.trim();


  if (!title) {

    alert("任務名稱不能為空");

    return;

  }


  try {

    const {
      error
    } = await db
      .from("tasks")
      .update({
        title
      })
      .eq("id", taskId)
      .eq("user_id", currentUser.id);


    if (error) {

      throw error;

    }


    await loadTasks();

    await loadTaskManagement();


  } catch (error) {

    console.error(
      "編輯任務失敗：",
      error
    );


    alert(
      "編輯失敗：" +
      error.message
    );

  }

}


/* =========================================================
   27. 刪除任務
========================================================= */

async function deleteTask(taskId) {

  const confirmed =
    confirm(
      "確定要刪除這個任務嗎？"
    );


  if (!confirmed) {

    return;

  }


  try {

    const {
      error
    } = await db
      .from("tasks")
      .delete()
      .eq("id", taskId)
      .eq("user_id", currentUser.id);


    if (error) {

      throw error;

    }


    await loadTasks();

    await loadTaskManagement();


  } catch (error) {

    console.error(
      "刪除任務失敗：",
      error
    );


    alert(
      "刪除失敗：" +
      error.message
    );

  }

}


/* =========================================================
   28. 今日統計
========================================================= */

function updateSummary() {

  const total =
    currentTasks.length;


  const completed =
    currentTasks.filter(
      task => task.completed
    ).length;


  const completionRate =
    total === 0
      ? 0
      : Math.round(
          (completed / total) * 100
        );


  const taskCountElement =
    document.getElementById(
      "daily-task-count"
    );


  const rateElement =
    document.getElementById(
      "completion-rate"
    );


  const expElement =
    document.getElementById(
      "today-exp"
    );


  const goldElement =
    document.getElementById(
      "today-gold"
    );


  if (taskCountElement) {

    taskCountElement.textContent =
      total;

  }


  if (rateElement) {

    rateElement.textContent =
      `${completionRate}%`;

  }


  let todayExp = 0;
  let todayGold = 0;


  currentTasks.forEach(task => {

    if (task.completed) {

      const reward =
        getActualReward(task);


      todayExp += reward.exp;

      todayGold += reward.gold;

    }

  });


  if (expElement) {

    expElement.textContent =
      todayExp;

  }


  if (goldElement) {

    goldElement.textContent =
      todayGold;

  }

}


/* =========================================================
   29. 任務管理
========================================================= */

async function loadTaskManagement() {

  if (!currentUser) return;


  try {

    const {
      data,
      error
    } = await db
      .from("tasks")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", {
        ascending: false
      });


    if (error) {

      console.error(
        "載入任務管理失敗：",
        error
      );

      return;

    }


    renderTaskManagement(
      data || []
    );


  } catch (error) {

    console.error(
      "任務管理錯誤：",
      error
    );

  }

}


/* =========================================================
   30. 顯示任務管理
========================================================= */

function renderTaskManagement(tasks) {

  const list =
    document.getElementById(
      "task-management-list"
    );


  if (!list) return;


  let filtered =
    [...tasks];


  if (
    currentManagedFilter === "once"
  ) {

    filtered =
      filtered.filter(
        task => !task.template_id
      );

  }


  if (
    currentManagedFilter === "repeat"
  ) {

    filtered =
      filtered.filter(
        task => task.template_id
      );

  }


  if (filtered.length === 0) {

    list.innerHTML = `
      <div class="empty-state">
        📭 沒有符合條件的任務
      </div>
    `;

    return;

  }


  list.innerHTML =
    filtered
      .map(task => {

        return `

          <div
            class="managed-task-item"
            data-task-id="${task.id}"
          >

            <div>

              <strong>
                ${escapeHtml(task.title)}
              </strong>

              <div class="task-meta">

                <span>
                  ${getCategoryLabel(task.category)}
                </span>

                <span>
                  ${
                    task.template_id
                      ? "🔄 重複"
                      : "📌 單次"
                  }
                </span>

                <span>
                  ${getDifficultyLabel(task.difficulty)}
                </span>

              </div>

            </div>


            <button
              onclick="deleteManagedTask('${task.id}')"
            >
              🗑️
            </button>

          </div>

        `;

      })
      .join("");

}


/* =========================================================
   31. 任務管理篩選
========================================================= */

function filterManagedTasks(
  filter,
  button
) {

  currentManagedFilter =
    filter;


  const buttons =
    document.querySelectorAll(
      "[onclick^=\"filterManagedTasks\"]"
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


  loadTaskManagement();

}


/* =========================================================
   32. 任務管理刪除
========================================================= */

async function deleteManagedTask(
  taskId
) {

  const confirmed =
    confirm(
      "確定要刪除這個任務嗎？"
    );


  if (!confirmed) return;


  try {

    const {
      error
    } = await db
      .from("tasks")
      .delete()
      .eq("id", taskId)
      .eq("user_id", currentUser.id);


    if (error) {

      throw error;

    }


    await loadTasks();

    await loadTaskManagement();


  } catch (error) {

    console.error(
      "刪除任務失敗：",
      error
    );


    alert(
      "刪除失敗：" +
      error.message
    );

  }

}


/* =========================================================
   33. 清空任務管理
========================================================= */

async function clearManagementList() {

  const confirmed =
    confirm(
      "確定要刪除所有任務嗎？這個操作無法復原。"
    );


  if (!confirmed) return;


  if (!currentUser) return;


  try {

    const {
      error
    } = await db
      .from("tasks")
      .delete()
      .eq("user_id", currentUser.id);


    if (error) {

      throw error;

    }


    await loadTasks();

    await loadTaskManagement();


  } catch (error) {

    console.error(
      "清空任務失敗：",
      error
    );


    alert(
      "清空失敗：" +
      error.message
    );

  }

}


/* =========================================================
   34. 重複任務 UI
========================================================= */

function updateRepeatUI() {

  const repeatElement =
    document.querySelector(
      'input[name="new-task-repeat"]:checked'
    );


  const repeat =
    repeatElement
      ? repeatElement.value
      : "once";


  const repeatOptions =
    document.getElementById(
      "repeat-options"
    );


  if (!repeatOptions) return;


  if (repeat === "repeat") {

    repeatOptions.style.display =
      "block";

  } else {

    repeatOptions.style.display =
      "none";

  }


  /*
    只有「每週」才需要選星期
  */

  const repeatTypeElement =
    document.querySelector(
      'select[name="repeat-type"]'
    );

  const repeatDayItem =
    document.getElementById(
      "repeat-day-item"
    );


  if (repeatTypeElement && repeatDayItem) {

    repeatDayItem.style.display =
      repeatTypeElement.value === "weekly"
        ? "block"
        : "none";

  }

}


/* =========================================================
   35. Supabase Auth 狀態監聽
========================================================= */

db.auth.onAuthStateChange(
  async (event, session) => {

    console.log(
      "Auth 狀態：",
      event
    );


    if (
      event === "SIGNED_IN" &&
      session
    ) {

      currentUser =
        session.user;


      /*
        不在這裡重複呼叫太多資料，
        避免登入時觸發兩次。
      */

    }


    if (
      event === "SIGNED_OUT"
    ) {

      currentUser = null;

      currentProfile = null;

      currentTasks = [];

      showLoggedOutUI();

    }

  }
);


/* =========================================================
   36. HTML onclick 相容
========================================================= */

/*
  HTML 裡目前使用：

  onclick="login()"
  onclick="register()"
  onclick="logout()"

  所以把它們接到真正的函式。
*/

window.login =
  loginUser;

window.register =
  registerUser;

window.logout =
  logoutUser;


/*
  其他 HTML onclick
*/

window.addTask =
  addTask;

window.filterTasks =
  filterTasks;

window.filterManagedTasks =
  filterManagedTasks;

window.toggleTask =
  toggleTask;

window.editTask =
  editTask;

window.deleteTask =
  deleteTask;

window.deleteManagedTask =
  deleteManagedTask;

window.clearManagementList =
  clearManagementList;

window.updateRepeatUI =
  updateRepeatUI;

window.dailyWrapUp =
  dailyWrapUp;


/* =========================================================
   38. 每日收尾 / 今日結算
   - 按下自評按鈕 → 結算今天 → 存進 daily_reports
   - 一天只留一筆，再按一次會用最新的數字覆蓋
   - 目前只結算任務、EXP、Gold；
     主線 / 晨間打卡 / 專注 / 想法 做好後再接上
========================================================= */

const SELF_RATING_LABELS = {

  good: "⭐ 今天表現不錯",

  normal: "🙂 普通的一天",

  bad: "🔥 明天重新開始"

};


function buildDailyReport(selfRating) {

  const total =
    currentTasks.length;

  const doneTasks =
    currentTasks.filter(
      task => task.completed
    );


  let exp = 0;
  let gold = 0;


  doneTasks.forEach(task => {

    const reward =
      getActualReward(task);

    exp += reward.exp;

    gold += reward.gold;

  });


  /*
    晨間打卡 / 專注 / 想法（today.js 載入時才有）
  */

  const morning =
    typeof getMorningStats === "function"
      ? getMorningStats()
      : { done: 0, total: 0 };

  const focus =
    typeof getFocusStats === "function"
      ? getFocusStats()
      : { seconds: 0, bySubject: {} };

  const idea =
    typeof getIdeaStats === "function"
      ? getIdeaStats()
      : { added: 0, converted: 0 };


  return {

    user_id: currentUser.id,

    report_date: getToday(),

    morning_done: morning.done,

    morning_total: morning.total,

    focus_seconds: focus.seconds,

    focus_by_subject: focus.bySubject,

    ideas_added: idea.added,

    ideas_converted: idea.converted,

    tasks_total: total,

    tasks_done: doneTasks.length,

    completion_rate:
      total === 0
        ? 0
        : Math.round(
            (doneTasks.length / total) * 100
          ),

    exp_gained: exp,

    gold_gained: gold,

    self_rating: selfRating,

    updated_at:
      new Date().toISOString()

  };

}


async function dailyWrapUp(selfRating) {

  if (!currentUser) return;


  const box =
    document.getElementById(
      "daily-wrapup-message"
    );


  if (box) {

    box.textContent =
      "結算中...";

  }


  try {

    /*
      先重新載入今天的任務，確保結算用的是最新數字
    */

    await loadTasks();

    if (typeof loadTodayModules === "function") {

      await loadTodayModules();

    }


    const report =
      buildDailyReport(selfRating);


    const {
      data,
      error
    } = await db
      .from("daily_reports")
      .upsert(
        report,
        { onConflict: "user_id,report_date" }
      )
      .select()
      .single();


    if (error) {

      throw error;

    }


    renderDailyReport(
      data || report
    );


  } catch (error) {

    console.error(
      "每日結算失敗：",
      error
    );


    if (box) {

      box.textContent =
        "❌ 結算失敗：" + error.message;

      box.style.color =
        "#ff6b6b";

    }

  }

}


async function loadDailyReport() {

  if (!currentUser) return;


  const box =
    document.getElementById(
      "daily-wrapup-message"
    );


  const {
    data,
    error
  } = await db
    .from("daily_reports")
    .select("*")
    .eq("user_id", currentUser.id)
    .eq("report_date", getToday())
    .maybeSingle();


  if (error) {

    console.warn(
      "讀取今日結算失敗：",
      error
    );

    return;

  }


  if (data) {

    renderDailyReport(data);

  } else if (box) {

    box.innerHTML = "";

    highlightRatingButton(null);

  }

}


function renderDailyReport(report) {

  const box =
    document.getElementById(
      "daily-wrapup-message"
    );


  if (!box) return;


  box.style.color = "";


  box.innerHTML = `

    <div class="report-card">

      <div class="report-title">
        🌙 今日結算｜${escapeHtml(report.report_date)}
      </div>


      <div class="report-grid">

        <div class="report-label">📋 任務</div>
        <div class="report-value">
          ${Number(report.tasks_done)} / ${Number(report.tasks_total)}
        </div>

        <div class="report-label">🎮 EXP</div>
        <div class="report-value">
          +${Number(report.exp_gained)}
        </div>

        <div class="report-label">💰 Gold</div>
        <div class="report-value">
          +${Number(report.gold_gained)}
        </div>

        <div class="report-label">🌅 晨間打卡</div>
        <div class="report-value">
          ${Number(report.morning_done || 0)} / ${Number(report.morning_total || 0)}
        </div>

        <div class="report-label">⏱️ 專注</div>
        <div class="report-value">
          ${formatReportDuration(report.focus_seconds)}
          ${formatReportSubjects(report.focus_by_subject)}
        </div>

        <div class="report-label">💡 想法</div>
        <div class="report-value">
          新增 ${Number(report.ideas_added || 0)}・轉任務 ${Number(report.ideas_converted || 0)}
        </div>

        <div class="report-label">📝 自評</div>
        <div class="report-value">
          ${SELF_RATING_LABELS[report.self_rating] || "—"}
        </div>

      </div>


      <div class="report-rate">
        今日完成度：${Number(report.completion_rate)}%
      </div>


      <div class="report-note">
        ✅ 已儲存。今天之內再按一次，會用最新的數字更新這筆紀錄。
      </div>

    </div>

  `;


  highlightRatingButton(
    report.self_rating
  );

}


function formatReportDuration(seconds) {

  const s = Number(seconds || 0);

  return typeof formatDuration === "function"
    ? formatDuration(s)
    : `${Math.round(s / 60)}m`;

}


function formatReportSubjects(bySubject) {

  const entries = Object.entries(bySubject || {})
    .filter(([, s]) => Number(s) > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) return "";

  const text = entries
    .map(([subject, s]) =>
      `${escapeHtml(subject)} ${formatReportDuration(s)}`
    )
    .join("・");

  return `<div class="small-note" style="font-weight:normal;">${text}</div>`;

}


function highlightRatingButton(selfRating) {

  document
    .querySelectorAll(".wrapup-btn")
    .forEach(btn => {

      btn.classList.toggle(
        "selected",
        btn.dataset.rating === selfRating
      );

    });

}


/* =========================================================
   37. Debug
========================================================= */

console.log(
  "✅ script.js 載入完成"
);

console.log(
  "Supabase Client：",
  db
);


/* #########################################################
   以下是「晨間打卡 / 專注 / 想法庫」（原本的 today.js，已併進這個檔案）
######################################################### */

/* =========================================================
   今日模組：🌅 晨間打卡 / ⏱️ 專注 / 💡 想法庫

   會用到上面的：
   db、currentUser、getToday、escapeHtml、getTaskReward、
   loadTasks、loadTaskManagement
========================================================= */


/* =========================================================
   0. 共用小工具
========================================================= */

/* 任意時間 → 台灣日期 YYYY-MM-DD */
function toTaipeiDate(dateLike) {

  return new Date(dateLike).toLocaleDateString(
    "sv-SE",
    { timeZone: "Asia/Taipei" }
  );

}


/* 秒數 → 「1h 20m」「25m」「40s」 */
function formatDuration(totalSeconds) {

  const s = Math.max(0, Math.round(totalSeconds || 0));

  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);

  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;

  return `${s}s`;

}


/* 毫秒 → 時鐘「24:59」或「1:02:03」 */
function formatClock(ms) {

  const total = Math.max(0, Math.floor(ms / 1000));

  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");

  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;

}


/* 台灣時間 HH:MM */
function formatTimeOfDay(dateLike) {

  return new Date(dateLike).toLocaleTimeString(
    "zh-TW",
    {
      timeZone: "Asia/Taipei",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }
  );

}


/* 畫面下方的小提示 */
let toastTimer = null;

function showToast(message) {

  const toast = document.getElementById("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);

}


/* localStorage 可能被瀏覽器擋掉，全部包 try/catch */
function storageGet(key) {

  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }

}

function storageSet(key, value) {

  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch (error) {
    /* 存不了就算了，不影響主要功能 */
  }

}


/* =========================================================
   1. 載入 / 重置（給 script.js 呼叫）
========================================================= */

async function loadTodayModules() {

  if (!currentUser) return;

  /* 一個模組壞掉不影響其他模組 */

  for (const loader of [loadMorning, loadFocus, loadIdeas]) {

    try {
      await loader();
    } catch (error) {
      console.error("今日模組載入失敗：", loader.name, error);
    }

  }

}


function resetTodayModules() {

  stopFocusTicking();

  focusTimer = null;
  focusSessions = [];
  morningItems = [];
  morningChecked = new Set();
  morningEditing = false;
  ideas = [];

  document.title = ORIGINAL_TITLE;

  closeIdeaCapture();

}


/* =========================================================
   2. 🌅 晨間打卡
========================================================= */

const DEFAULT_MORNING_ITEMS = [
  "起床",
  "喝水",
  "整理床鋪",
  "洗漱",
  "查看今日主線",
  "確認今日任務",
  "開始第一個專注"
];

let morningItems = [];          // 全部項目（含停用），已排序
let morningChecked = new Set(); // 今天已打勾的 item_id
let morningEditing = false;


async function loadMorning() {

  if (!currentUser) return;

  const [itemsResult, checksResult] = await Promise.all([

    db
      .from("morning_items")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),

    db
      .from("morning_checkins")
      .select("item_id")
      .eq("user_id", currentUser.id)
      .eq("check_date", getToday())

  ]);


  const error = itemsResult.error || checksResult.error;

  if (error) {

    console.error("晨間打卡載入失敗：", error);

    document.getElementById("morning-list").innerHTML = `
      <div class="empty-state">
        ❌ 晨間打卡載入失敗：${escapeHtml(error.message)}
      </div>
    `;

    return;

  }


  morningItems = itemsResult.data || [];

  morningChecked = new Set(
    (checksResult.data || []).map(row => Number(row.item_id))
  );

  renderMorning();

}


function getMorningStats() {

  const enabled = morningItems.filter(item => item.enabled);

  const done = enabled.filter(
    item => morningChecked.has(Number(item.id))
  ).length;

  return {
    done,
    total: enabled.length
  };

}


function renderMorning() {

  const list = document.getElementById("morning-list");

  if (!list) return;


  /* 進度 */

  const { done, total } = getMorningStats();

  document.getElementById("morning-progress-text").textContent =
    `${done} / ${total}`;

  document.getElementById("morning-progress-bar").style.width =
    total === 0 ? "0%" : `${Math.round((done / total) * 100)}%`;

  document.getElementById("morning-edit-btn").textContent =
    morningEditing ? "✅ 完成編輯" : "✏️ 編輯清單";


  /* 完全沒有項目 */

  if (morningItems.length === 0) {

    list.innerHTML = `
      <div class="empty-state">
        還沒有晨間清單
        <div style="margin-top:12px;">
          <button class="btn btn-primary" onclick="applyDefaultMorningItems()">
            套用預設 7 項
          </button>
        </div>
      </div>
    `;

    return;

  }


  /* 編輯模式 */

  if (morningEditing) {

    list.innerHTML = morningItems
      .map((item, index) => `

        <div class="morning-edit-row ${item.enabled ? "" : "disabled"}">

          <span class="title">
            ${escapeHtml(item.title)}
            ${item.enabled ? "" : '<span class="small-note">（停用中）</span>'}
          </span>

          <button class="icon-btn" title="上移"
            ${index === 0 ? "disabled" : ""}
            onclick="moveMorningItem(${Number(item.id)}, -1)">▲</button>

          <button class="icon-btn" title="下移"
            ${index === morningItems.length - 1 ? "disabled" : ""}
            onclick="moveMorningItem(${Number(item.id)}, 1)">▼</button>

          <button class="icon-btn" title="改名"
            onclick="renameMorningItem(${Number(item.id)})">✏️</button>

          <button class="icon-btn"
            onclick="toggleMorningEnabled(${Number(item.id)})">
            ${item.enabled ? "停用" : "啟用"}
          </button>

          <button class="icon-btn" title="刪除"
            onclick="deleteMorningItem(${Number(item.id)})">🗑️</button>

        </div>

      `)
      .join("") + `

      <div class="add-row">

        <input
          type="text"
          id="morning-new-title"
          maxlength="50"
          placeholder="新增項目，例如：伸展 5 分鐘"
          onkeydown="if (event.key === 'Enter') addMorningItem()"
        >

        <button class="btn btn-primary" onclick="addMorningItem()">
          ＋ 新增
        </button>

      </div>

      <p class="small-note" style="margin-top:10px;">
        「停用」會先隱藏、保留過去的紀錄；「刪除」會連過去的打卡紀錄一起刪掉。
      </p>
    `;

    return;

  }


  /* 一般模式：只顯示啟用中的項目 */

  const enabled = morningItems.filter(item => item.enabled);

  if (enabled.length === 0) {

    list.innerHTML = `
      <div class="empty-state">
        所有項目都停用了，按「編輯清單」可以重新啟用
      </div>
    `;

    return;

  }


  list.innerHTML = enabled
    .map(item => {

      const checked = morningChecked.has(Number(item.id));

      return `
        <label class="morning-item ${checked ? "done" : ""}">
          <input
            type="checkbox"
            ${checked ? "checked" : ""}
            onchange="toggleMorningItem(${Number(item.id)}, this.checked, this)"
          >
          <span>${escapeHtml(item.title)}</span>
        </label>
      `;

    })
    .join("") + (
      done === total
        ? `<div class="morning-complete">🎉 晨間啟動完成！開始今天的主線吧</div>`
        : ""
    );

}


function toggleMorningEdit() {

  morningEditing = !morningEditing;

  renderMorning();

  if (morningEditing) {

    const input = document.getElementById("morning-new-title");

    if (input) input.focus();

  }

}


async function toggleMorningItem(itemId, checked, checkbox) {

  if (!currentUser) return;

  if (checkbox) checkbox.disabled = true;


  try {

    if (checked) {

      const { error } = await db
        .from("morning_checkins")
        .upsert(
          {
            user_id: currentUser.id,
            item_id: itemId,
            check_date: getToday()
          },
          {
            onConflict: "user_id,item_id,check_date",
            ignoreDuplicates: true
          }
        );

      if (error) throw error;

      morningChecked.add(Number(itemId));

    } else {

      const { error } = await db
        .from("morning_checkins")
        .delete()
        .eq("user_id", currentUser.id)
        .eq("item_id", itemId)
        .eq("check_date", getToday());

      if (error) throw error;

      morningChecked.delete(Number(itemId));

    }


    renderMorning();


    const { done, total } = getMorningStats();

    if (checked && total > 0 && done === total) {
      showToast("🎉 晨間啟動完成！");
    }

  } catch (error) {

    console.error("晨間打卡更新失敗：", error);

    if (checkbox) checkbox.checked = !checked;

    alert("晨間打卡更新失敗：" + error.message);

  } finally {

    if (checkbox) checkbox.disabled = false;

  }

}


async function applyDefaultMorningItems() {

  if (!currentUser) return;

  const rows = DEFAULT_MORNING_ITEMS.map((title, index) => ({
    user_id: currentUser.id,
    title,
    sort_order: index + 1,
    enabled: true
  }));

  const { error } = await db.from("morning_items").insert(rows);

  if (error) {
    alert("建立預設清單失敗：" + error.message);
    return;
  }

  await loadMorning();

}


async function addMorningItem() {

  if (!currentUser) return;

  const input = document.getElementById("morning-new-title");
  const title = input ? input.value.trim() : "";

  if (!title) {
    if (input) input.focus();
    return;
  }

  const maxOrder = morningItems.reduce(
    (max, item) => Math.max(max, Number(item.sort_order) || 0),
    0
  );

  const { error } = await db
    .from("morning_items")
    .insert({
      user_id: currentUser.id,
      title,
      sort_order: maxOrder + 1,
      enabled: true
    });

  if (error) {
    alert("新增失敗：" + error.message);
    return;
  }

  await loadMorning();

  const newInput = document.getElementById("morning-new-title");
  if (newInput) newInput.focus();

}


async function renameMorningItem(itemId) {

  const item = morningItems.find(row => Number(row.id) === Number(itemId));

  if (!item) return;

  const answer = prompt("修改項目名稱：", item.title);

  if (answer === null) return;

  const title = answer.trim();

  if (!title) {
    alert("名稱不能是空的");
    return;
  }

  const { error } = await db
    .from("morning_items")
    .update({ title })
    .eq("id", itemId)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("修改失敗：" + error.message);
    return;
  }

  await loadMorning();

}


async function toggleMorningEnabled(itemId) {

  const item = morningItems.find(row => Number(row.id) === Number(itemId));

  if (!item) return;

  const { error } = await db
    .from("morning_items")
    .update({ enabled: !item.enabled })
    .eq("id", itemId)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("更新失敗：" + error.message);
    return;
  }

  await loadMorning();

}


async function deleteMorningItem(itemId) {

  const item = morningItems.find(row => Number(row.id) === Number(itemId));

  if (!item) return;

  const ok = confirm(
    `確定刪除「${item.title}」嗎？\n\n` +
    "刪除會連這一項過去的打卡紀錄一起刪掉。\n" +
    "如果只是暫時不做，建議用「停用」。"
  );

  if (!ok) return;

  const { error } = await db
    .from("morning_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("刪除失敗：" + error.message);
    return;
  }

  await loadMorning();

}


async function moveMorningItem(itemId, direction) {

  const ordered = [...morningItems];

  const index = ordered.findIndex(row => Number(row.id) === Number(itemId));
  const target = index + direction;

  if (index < 0 || target < 0 || target >= ordered.length) return;

  /* 交換位置後，把順序重新編成 1, 2, 3 ... */

  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

  const updates = ordered
    .map((row, i) => ({ row, order: i + 1 }))
    .filter(({ row, order }) => Number(row.sort_order) !== order)
    .map(({ row, order }) =>
      db
        .from("morning_items")
        .update({ sort_order: order })
        .eq("id", row.id)
        .eq("user_id", currentUser.id)
    );

  const results = await Promise.all(updates);
  const failed = results.find(result => result.error);

  if (failed) {
    alert("排序失敗：" + failed.error.message);
  }

  await loadMorning();

}


/* =========================================================
   3. ⏱️ 專注
========================================================= */

const DEFAULT_FOCUS_SUBJECTS = [
  "計概",
  "資結",
  "MIS",
  "多益單字",
  "多益文法",
  "多益閱讀",
  "資料庫",
  "AI",
  "App 開發"
];

const FOCUS_PRESET_MINUTES = [15, 25, 45, 60];

/* 少於這個秒數就不記錄 */
const FOCUS_MIN_SECONDS = 60;

const ORIGINAL_TITLE = document.title;

let focusSessions = [];       // 今天的專注紀錄
let focusKnownSubjects = [];  // 預設科目 + 用過的自訂科目
let focusMode = "up";         // up = 正計時、down = 倒計時
let focusPlannedMinutes = 25;
let focusTimer = null;        // 進行中的計時（同時存在 localStorage）
let focusTickHandle = null;
let focusAudioContext = null;
let focusFinishing = false;


/*
  計時狀態長這樣：
  {
    mode: "up" | "down",
    subject: "計概",
    plannedMinutes: 25 | null,
    startedAt: "2026-10-09T01:00:00.000Z",  // 第一次按開始的時間
    segmentStart: 1760000000000 | null,     // 這一段開始的時間（暫停時為 null）
    accumulatedMs: 0,                       // 暫停前已累積的毫秒
    status: "running" | "paused"
  }
  用「時間戳」計算而不是每秒 +1，
  所以重新整理、切到背景、手機鎖螢幕都不會算錯。
*/

function focusStorageKey() {
  return currentUser ? `focusTimer:${currentUser.id}` : null;
}

function saveFocusTimer() {
  const key = focusStorageKey();
  if (key) storageSet(key, focusTimer ? JSON.stringify(focusTimer) : null);
}

function readFocusTimer() {

  const key = focusStorageKey();
  const raw = key ? storageGet(key) : null;

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }

}

function focusElapsedMs(timer) {

  if (!timer) return 0;

  return timer.accumulatedMs +
    (timer.status === "running" ? Date.now() - timer.segmentStart : 0);

}


async function loadFocus() {

  if (!currentUser) return;

  const [sessionsResult, subjectsResult] = await Promise.all([

    db
      .from("focus_sessions")
      .select("*")
      .eq("user_id", currentUser.id)
      .eq("session_date", getToday())
      .order("started_at", { ascending: true }),

    db
      .from("focus_sessions")
      .select("subject")
      .eq("user_id", currentUser.id)
      .order("started_at", { ascending: false })
      .limit(500)

  ]);


  const error = sessionsResult.error || subjectsResult.error;

  if (error) {

    console.error("專注紀錄載入失敗：", error);

    document.getElementById("focus-log").innerHTML = `
      <div class="empty-state">
        ❌ 專注紀錄載入失敗：${escapeHtml(error.message)}
      </div>
    `;

  } else {

    focusSessions = sessionsResult.data || [];

    const used = (subjectsResult.data || []).map(row => row.subject);

    focusKnownSubjects = [
      ...new Set([...DEFAULT_FOCUS_SUBJECTS, ...used])
    ];

  }

  if (focusKnownSubjects.length === 0) {
    focusKnownSubjects = [...DEFAULT_FOCUS_SUBJECTS];
  }


  /* 恢復進行中的計時 */

  if (!focusTimer) {

    focusTimer = readFocusTimer();

    if (focusTimer) {
      focusMode = focusTimer.mode;
      if (focusTimer.plannedMinutes) {
        focusPlannedMinutes = focusTimer.plannedMinutes;
      }
    }

  }


  renderFocusSetup();
  renderFocusClock();
  renderFocusButtons();
  renderFocusLog();


  if (focusTimer && focusTimer.status === "running") {

    /* 倒計時在離開期間已經結束 → 直接記錄 */

    if (focusTimer.mode === "down" &&
        focusElapsedMs(focusTimer) >= focusTimer.plannedMinutes * 60000) {

      await finishFocus("away");

    } else {

      startFocusTicking();

    }

  }

}


function getFocusStats() {

  const bySubject = {};
  let seconds = 0;

  focusSessions.forEach(session => {

    const s = Number(session.duration_seconds) || 0;

    seconds += s;
    bySubject[session.subject] = (bySubject[session.subject] || 0) + s;

  });

  return { seconds, bySubject };

}


function renderFocusSetup() {

  /* 模式按鈕 */

  document.querySelectorAll("#focus-card .seg-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === focusMode);
  });


  /* 科目選單（保留目前的選擇） */

  const select = document.getElementById("focus-subject");
  const previous = select.value || storageGet(`focusLastSubject:${currentUser.id}`);

  select.innerHTML =
    focusKnownSubjects
      .map(subject => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`)
      .join("") +
    `<option value="__custom__">＋ 自訂科目…</option>`;

  if (previous && (focusKnownSubjects.includes(previous) || previous === "__custom__")) {
    select.value = previous;
  }

  onFocusSubjectChange();


  /* 倒計時的時間選擇 */

  document.getElementById("focus-minutes-row").style.display =
    focusMode === "down" ? "flex" : "none";

  document.getElementById("focus-presets").innerHTML = FOCUS_PRESET_MINUTES
    .map(minutes => `
      <button
        class="chip ${minutes === focusPlannedMinutes ? "active" : ""}"
        onclick="setFocusMinutes(${minutes})"
      >${minutes} 分</button>
    `)
    .join("");


  /* 計時中不能改設定 */

  document.getElementById("focus-setup").style.display =
    focusTimer ? "none" : "block";

  document.getElementById("focus-now").textContent = focusTimer
    ? `正在專注：${focusTimer.subject}・${focusTimer.mode === "down" ? `倒計時 ${focusTimer.plannedMinutes} 分` : "正計時"}${focusTimer.status === "paused" ? "（已暫停）" : ""}`
    : "";

}


function renderFocusClock() {

  const clock = document.getElementById("focus-clock");

  if (!clock) return;

  let ms;

  if (focusTimer) {

    const elapsed = focusElapsedMs(focusTimer);

    ms = focusTimer.mode === "down"
      ? focusTimer.plannedMinutes * 60000 - elapsed
      : elapsed;

  } else {

    ms = focusMode === "down" ? focusPlannedMinutes * 60000 : 0;

  }

  const text = formatClock(ms);

  clock.textContent = text;

  clock.classList.toggle(
    "running",
    Boolean(focusTimer && focusTimer.status === "running")
  );

  document.title = focusTimer
    ? `${focusTimer.status === "running" ? "⏱" : "⏸"} ${text}・${ORIGINAL_TITLE}`
    : ORIGINAL_TITLE;

}


function renderFocusButtons() {

  const box = document.getElementById("focus-buttons");

  if (!box) return;

  if (!focusTimer) {

    box.innerHTML = `
      <button class="btn btn-primary" onclick="startFocus()">▶ 開始專注</button>
    `;

  } else if (focusTimer.status === "running") {

    box.innerHTML = `
      <button class="btn" onclick="pauseFocus()">⏸ 暫停</button>
      <button class="btn btn-primary" onclick="finishFocus('manual')">⏹ 結束並記錄</button>
      <button class="btn btn-danger" onclick="discardFocus()">✖ 放棄</button>
    `;

  } else {

    box.innerHTML = `
      <button class="btn btn-primary" onclick="resumeFocus()">▶ 繼續</button>
      <button class="btn" onclick="finishFocus('manual')">⏹ 結束並記錄</button>
      <button class="btn btn-danger" onclick="discardFocus()">✖ 放棄</button>
    `;

  }

}


function renderFocusLog() {

  const box = document.getElementById("focus-log");

  if (!box) return;

  const { seconds, bySubject } = getFocusStats();

  document.getElementById("focus-today-total").textContent =
    `今日 ${seconds > 0 ? formatDuration(seconds) : "0m"}`;


  if (focusSessions.length === 0) {

    box.innerHTML = `
      <div class="small-note" style="text-align:center;">
        今天還沒有專注紀錄
      </div>
    `;

    return;

  }


  const subjectRows = Object.entries(bySubject)
    .sort((a, b) => b[1] - a[1])
    .map(([subject, s]) => `
      <tr>
        <td>${escapeHtml(subject)}</td>
        <td class="num">${formatDuration(s)}</td>
      </tr>
    `)
    .join("");


  const sessionRows = focusSessions
    .map(session => `
      <tr>
        <td>${formatTimeOfDay(session.started_at)}</td>
        <td>${escapeHtml(session.subject)}</td>
        <td class="num">${formatDuration(session.duration_seconds)}</td>
        <td>${session.mode === "down" ? "倒計時" : "正計時"}</td>
        <td class="num">
          <button class="icon-btn" title="刪除這筆"
            onclick="deleteFocusSession(${Number(session.id)})">🗑️</button>
        </td>
      </tr>
    `)
    .join("");


  box.innerHTML = `

    <div class="focus-log-title">📚 今日各科時間</div>

    <table class="data-table">
      <thead>
        <tr><th>科目</th><th class="num">時間</th></tr>
      </thead>
      <tbody>
        ${subjectRows}
        <tr>
          <td><strong>合計</strong></td>
          <td class="num"><strong>${formatDuration(seconds)}</strong></td>
        </tr>
      </tbody>
    </table>


    <div class="focus-log-title">📝 今日專注紀錄</div>

    <table class="data-table">
      <thead>
        <tr>
          <th>開始</th><th>科目</th><th class="num">長度</th><th>模式</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${sessionRows}
      </tbody>
    </table>

  `;

}


function setFocusMode(mode) {

  if (focusTimer) return;

  focusMode = mode;

  renderFocusSetup();
  renderFocusClock();

}


function setFocusMinutes(minutes) {

  if (focusTimer) return;

  focusPlannedMinutes = minutes;

  const custom = document.getElementById("focus-custom-minutes");
  if (custom) custom.value = "";

  renderFocusSetup();
  renderFocusClock();

}


function onFocusCustomMinutes() {

  const value = Number(document.getElementById("focus-custom-minutes").value);

  if (value >= 1 && value <= 600) {

    focusPlannedMinutes = Math.round(value);

    document.querySelectorAll("#focus-presets .chip").forEach(chip => {
      chip.classList.remove("active");
    });

    renderFocusClock();

  }

}


function onFocusSubjectChange() {

  const select = document.getElementById("focus-subject");
  const custom = document.getElementById("focus-custom-subject");

  custom.style.display = select.value === "__custom__" ? "block" : "none";

}


function getSelectedFocusSubject() {

  const select = document.getElementById("focus-subject");

  if (select.value === "__custom__") {
    return document.getElementById("focus-custom-subject").value.trim();
  }

  return select.value;

}


/* 瀏覽器規定：聲音要在使用者按按鈕時先「解鎖」 */
function unlockFocusAudio() {

  try {

    if (!focusAudioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) focusAudioContext = new AudioCtx();
    }

    if (focusAudioContext && focusAudioContext.state === "suspended") {
      focusAudioContext.resume();
    }

  } catch (error) {
    /* 沒有聲音也不影響計時 */
  }

}


function playFocusAlarm() {

  try {

    if (focusAudioContext) {

      if (focusAudioContext.state === "suspended") {
        focusAudioContext.resume();
      }

      const now = focusAudioContext.currentTime;

      /* 嗶 — 嗶 — 嗶 */

      [0, 0.35, 0.7].forEach(offset => {

        const osc = focusAudioContext.createOscillator();
        const gain = focusAudioContext.createGain();

        osc.type = "sine";
        osc.frequency.value = 880;

        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.4, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.25);

        osc.connect(gain);
        gain.connect(focusAudioContext.destination);

        osc.start(now + offset);
        osc.stop(now + offset + 0.3);

      });

    }

    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }

  } catch (error) {
    /* 沒有聲音也不影響記錄 */
  }

}


function startFocusTicking() {

  stopFocusTicking();

  focusTickHandle = setInterval(onFocusTick, 500);

  onFocusTick();

}


function stopFocusTicking() {

  if (focusTickHandle) {
    clearInterval(focusTickHandle);
    focusTickHandle = null;
  }

}


function onFocusTick() {

  if (!focusTimer) {
    stopFocusTicking();
    return;
  }

  renderFocusClock();

  if (focusTimer.mode === "down" &&
      focusTimer.status === "running" &&
      focusElapsedMs(focusTimer) >= focusTimer.plannedMinutes * 60000) {

    playFocusAlarm();
    finishFocus("timeup");

  }

}


function startFocus() {

  if (!currentUser || focusTimer) return;

  const subject = getSelectedFocusSubject();

  if (!subject) {
    alert("請先選擇或輸入科目");
    return;
  }

  if (focusMode === "down" &&
      !(focusPlannedMinutes >= 1 && focusPlannedMinutes <= 600)) {
    alert("倒計時請設定 1～600 分鐘");
    return;
  }

  unlockFocusAudio();

  storageSet(
    `focusLastSubject:${currentUser.id}`,
    document.getElementById("focus-subject").value === "__custom__"
      ? null
      : subject
  );

  focusTimer = {
    mode: focusMode,
    subject,
    plannedMinutes: focusMode === "down" ? focusPlannedMinutes : null,
    startedAt: new Date().toISOString(),
    segmentStart: Date.now(),
    accumulatedMs: 0,
    status: "running"
  };

  saveFocusTimer();

  renderFocusSetup();
  renderFocusButtons();
  startFocusTicking();

}


function pauseFocus() {

  if (!focusTimer || focusTimer.status !== "running") return;

  focusTimer.accumulatedMs = focusElapsedMs(focusTimer);
  focusTimer.segmentStart = null;
  focusTimer.status = "paused";

  saveFocusTimer();
  stopFocusTicking();

  renderFocusSetup();
  renderFocusClock();
  renderFocusButtons();

}


function resumeFocus() {

  if (!focusTimer || focusTimer.status !== "paused") return;

  unlockFocusAudio();

  focusTimer.segmentStart = Date.now();
  focusTimer.status = "running";

  saveFocusTimer();

  renderFocusSetup();
  renderFocusButtons();
  startFocusTicking();

}


function discardFocus() {

  if (!focusTimer) return;

  const ok = confirm("放棄這次專注？這段時間不會被記錄。");

  if (!ok) return;

  stopFocusTicking();

  focusTimer = null;
  saveFocusTimer();

  renderFocusSetup();
  renderFocusClock();
  renderFocusButtons();

}


/*
  reason：
  manual = 自己按結束
  timeup = 倒計時到點
  away   = 倒計時在你離開網頁時就結束了
*/
async function finishFocus(reason) {

  if (!focusTimer || focusFinishing) return;

  focusFinishing = true;
  stopFocusTicking();


  const timer = focusTimer;

  let elapsedMs = focusElapsedMs(timer);

  if (timer.mode === "down") {
    elapsedMs = Math.min(elapsedMs, timer.plannedMinutes * 60000);
  }

  const seconds = Math.round(elapsedMs / 1000);


  /* 先清掉計時，畫面回到待命 */

  focusTimer = null;
  saveFocusTimer();

  renderFocusSetup();
  renderFocusClock();
  renderFocusButtons();


  try {

    if (seconds < FOCUS_MIN_SECONDS) {

      showToast("少於 1 分鐘，這次不記錄");
      return;

    }


    const { error } = await db
      .from("focus_sessions")
      .insert({
        user_id: currentUser.id,
        subject: timer.subject,
        mode: timer.mode,
        planned_minutes: timer.plannedMinutes,
        duration_seconds: seconds,
        started_at: timer.startedAt,
        ended_at: new Date().toISOString(),
        session_date: toTaipeiDate(timer.startedAt)
      });

    if (error) throw error;


    const label = `${timer.subject} ${formatDuration(seconds)}`;

    if (reason === "timeup") {
      showToast(`⏰ 時間到！已記錄：${label}`);
    } else if (reason === "away") {
      showToast(`⏰ 倒計時在你離開時已結束，已記錄：${label}`);
    } else {
      showToast(`✅ 已記錄：${label}`);
    }

    await loadFocus();

  } catch (error) {

    console.error("專注紀錄儲存失敗：", error);

    /* 存不進去就把計時改成暫停狀態留著，不讓時間白白消失 */

    focusTimer = {
      ...timer,
      accumulatedMs: elapsedMs,
      segmentStart: null,
      status: "paused"
    };

    saveFocusTimer();

    renderFocusSetup();
    renderFocusClock();
    renderFocusButtons();

    alert(
      "專注紀錄儲存失敗，計時先暫停保留，請稍後再按「結束並記錄」。\n\n" +
      error.message
    );

  } finally {

    focusFinishing = false;

  }

}


async function deleteFocusSession(sessionId) {

  const ok = confirm("刪除這筆專注紀錄？");

  if (!ok) return;

  const { error } = await db
    .from("focus_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("刪除失敗：" + error.message);
    return;
  }

  await loadFocus();

}


/* =========================================================
   4. 💡 想法庫
========================================================= */

const IDEA_CATEGORIES = [
  { key: "todo",      label: "📋 待辦" },
  { key: "idea",      label: "💡 點子" },
  { key: "study",     label: "📚 學習" },
  { key: "mainline",  label: "🎯 主線" },
  { key: "shopping",  label: "🛒 購物" },
  { key: "important", label: "⭐ 重要" },
  { key: "other",     label: "📦 其他" }
];

/* 轉成任務時對應的任務分類 */
const IDEA_TO_TASK_CATEGORY = {
  study: "study"
};

let ideas = [];
let ideaFilter = "all";
let ideaShowProcessed = false;
let ideaCaptureCategory = "idea";


function getIdeaCategoryLabel(key) {

  const found = IDEA_CATEGORIES.find(category => category.key === key);

  return found ? found.label : "📦 其他";

}


async function loadIdeas() {

  if (!currentUser) return;

  const { data, error } = await db
    .from("ideas")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {

    console.error("想法庫載入失敗：", error);

    document.getElementById("idea-list").innerHTML = `
      <div class="empty-state">
        ❌ 想法庫載入失敗：${escapeHtml(error.message)}
      </div>
    `;

    return;

  }

  ideas = data || [];

  renderIdeas();

}


function getIdeaStats() {

  const today = getToday();

  return {

    added: ideas.filter(idea => idea.idea_date === today).length,

    converted: ideas.filter(idea =>
      idea.status === "converted" &&
      idea.processed_at &&
      toTaipeiDate(idea.processed_at) === today
    ).length

  };

}


function renderIdeas() {

  const list = document.getElementById("idea-list");

  if (!list) return;


  const inbox = ideas.filter(idea => idea.status === "inbox");

  document.getElementById("ideas-inbox-count").textContent =
    `收件匣 ${inbox.length}`;


  /* 分類篩選 */

  const countIn = key =>
    inbox.filter(idea => key === "all" || idea.category === key).length;

  document.getElementById("idea-filters").innerHTML =
    [{ key: "all", label: "全部" }, ...IDEA_CATEGORIES]
      .map(category => `
        <button
          class="chip ${ideaFilter === category.key ? "active" : ""}"
          onclick="setIdeaFilter('${category.key}')"
        >${category.label} ${countIn(category.key) || ""}</button>
      `)
      .join("");


  /* 清單 */

  const visible = ideas.filter(idea =>
    (ideaFilter === "all" || idea.category === ideaFilter) &&
    (ideaShowProcessed || idea.status === "inbox")
  );


  if (visible.length === 0) {

    list.innerHTML = `
      <div class="empty-state">
        ${ideas.length === 0
          ? "還沒有想法。想到什麼，就按右下角的 💡 先記下來"
          : "這裡沒有待處理的想法 👍"}
      </div>
    `;

    return;

  }


  list.innerHTML = visible
    .map(idea => {

      const id = Number(idea.id);
      const processed = idea.status !== "inbox";

      let statusText = "";
      let actions = "";

      if (idea.status === "inbox") {

        actions = `
          <button class="icon-btn" onclick="convertIdeaToTask(${id})">→ 轉任務</button>
          <button class="icon-btn" onclick="setIdeaStatus(${id}, 'done')">✓ 已處理</button>
          <button class="icon-btn" title="刪除" onclick="deleteIdea(${id})">🗑️</button>
        `;

      } else if (idea.status === "done") {

        statusText = "・已處理";

        actions = `
          <button class="icon-btn" onclick="setIdeaStatus(${id}, 'inbox')">↩ 放回收件匣</button>
          <button class="icon-btn" title="刪除" onclick="deleteIdea(${id})">🗑️</button>
        `;

      } else {

        statusText = "・已轉成任務";

        actions = `
          <button class="icon-btn" title="刪除" onclick="deleteIdea(${id})">🗑️</button>
        `;

      }

      return `
        <div class="idea-item ${processed ? "processed" : ""}">

          <div class="idea-top">
            <span class="idea-cat">${getIdeaCategoryLabel(idea.category)}</span>
            <div class="idea-content">${escapeHtml(idea.content)}</div>
          </div>

          <div class="idea-bottom">
            <span class="small-note">
              ${escapeHtml(idea.idea_date)} ${formatTimeOfDay(idea.created_at)}${statusText}
            </span>
            <div class="idea-actions">${actions}</div>
          </div>

        </div>
      `;

    })
    .join("");

}


function setIdeaFilter(key) {

  ideaFilter = key;

  renderIdeas();

}


function toggleIdeaShowProcessed(checked) {

  ideaShowProcessed = checked;

  renderIdeas();

}


/* ---------- 快速記下 ---------- */

function renderIdeaCaptureCategories() {

  document.getElementById("idea-capture-categories").innerHTML =
    IDEA_CATEGORIES
      .map(category => `
        <button
          class="chip ${ideaCaptureCategory === category.key ? "active" : ""}"
          onclick="setIdeaCaptureCategory('${category.key}')"
        >${category.label}</button>
      `)
      .join("");

}


function setIdeaCaptureCategory(key) {

  ideaCaptureCategory = key;

  renderIdeaCaptureCategories();

  document.getElementById("idea-capture-input").focus();

}


function openIdeaCapture() {

  if (!currentUser) return;

  const box = document.getElementById("idea-capture");
  const input = document.getElementById("idea-capture-input");

  renderIdeaCaptureCategories();

  box.style.display = "flex";
  input.value = "";

  setTimeout(() => input.focus(), 30);

}


function closeIdeaCapture() {

  const box = document.getElementById("idea-capture");

  if (box) box.style.display = "none";

}


function onIdeaCaptureKey(event) {

  /* 中文輸入法選字時按的 Enter 不要送出 */

  if (event.isComposing || event.keyCode === 229) return;

  if (event.key === "Enter") {
    event.preventDefault();
    saveIdeaFromCapture();
  }

  if (event.key === "Escape") {
    closeIdeaCapture();
  }

}


let ideaSaving = false;

async function saveIdeaFromCapture() {

  if (!currentUser || ideaSaving) return;

  const input = document.getElementById("idea-capture-input");
  const content = input.value.trim();

  if (!content) {
    input.focus();
    return;
  }

  ideaSaving = true;

  try {

    const { error } = await db
      .from("ideas")
      .insert({
        user_id: currentUser.id,
        content,
        category: ideaCaptureCategory,
        idea_date: getToday()
      });

    if (error) throw error;

    closeIdeaCapture();

    showToast("已記下 ✓ 回到主線吧");

    await loadIdeas();

  } catch (error) {

    console.error("想法儲存失敗：", error);

    alert("想法儲存失敗：" + error.message);

  } finally {

    ideaSaving = false;

  }

}


/* Esc 關閉快速記下 */
document.addEventListener("keydown", event => {

  if (event.key === "Escape") closeIdeaCapture();

});


/* ---------- 處理想法 ---------- */

async function setIdeaStatus(ideaId, status) {

  const { error } = await db
    .from("ideas")
    .update({
      status,
      processed_at: status === "inbox" ? null : new Date().toISOString()
    })
    .eq("id", ideaId)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("更新失敗：" + error.message);
    return;
  }

  await loadIdeas();

}


async function deleteIdea(ideaId) {

  const ok = confirm("刪除這個想法？");

  if (!ok) return;

  const { error } = await db
    .from("ideas")
    .delete()
    .eq("id", ideaId)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("刪除失敗：" + error.message);
    return;
  }

  await loadIdeas();

}


async function convertIdeaToTask(ideaId) {

  const idea = ideas.find(row => Number(row.id) === Number(ideaId));

  if (!idea) return;

  const answer = prompt(
    "轉成今日任務，任務名稱可以先改得更具體：",
    idea.content
  );

  if (answer === null) return;

  const title = answer.trim();

  if (!title) {
    alert("任務名稱不能是空的");
    return;
  }


  try {

    const reward = getTaskReward("normal");

    const { data: task, error: taskError } = await db
      .from("tasks")
      .insert({
        user_id: currentUser.id,
        title,
        category: IDEA_TO_TASK_CATEGORY[idea.category] || "personal",
        difficulty: "normal",
        exp_reward: reward.exp,
        gold_reward: reward.gold,
        task_date: getToday(),
        completed: false
      })
      .select()
      .single();

    if (taskError) throw taskError;


    const { error: ideaError } = await db
      .from("ideas")
      .update({
        status: "converted",
        task_id: task ? task.id : null,
        processed_at: new Date().toISOString()
      })
      .eq("id", ideaId)
      .eq("user_id", currentUser.id);

    if (ideaError) throw ideaError;


    showToast("✅ 已加入今日任務");

    await loadIdeas();
    await loadTasks();
    await loadTaskManagement();

  } catch (error) {

    console.error("轉成任務失敗：", error);

    alert("轉成任務失敗：" + error.message);

  }

}


/* =========================================================
   5. 給 HTML onclick 使用
========================================================= */

Object.assign(window, {

  /* 晨間打卡 */
  toggleMorningEdit,
  toggleMorningItem,
  applyDefaultMorningItems,
  addMorningItem,
  renameMorningItem,
  toggleMorningEnabled,
  deleteMorningItem,
  moveMorningItem,

  /* 專注 */
  setFocusMode,
  setFocusMinutes,
  onFocusCustomMinutes,
  onFocusSubjectChange,
  startFocus,
  pauseFocus,
  resumeFocus,
  finishFocus,
  discardFocus,
  deleteFocusSession,

  /* 想法庫 */
  setIdeaFilter,
  toggleIdeaShowProcessed,
  setIdeaCaptureCategory,
  openIdeaCapture,
  closeIdeaCapture,
  onIdeaCaptureKey,
  saveIdeaFromCapture,
  setIdeaStatus,
  deleteIdea,
  convertIdeaToTask,

  /* 給 script.js */
  loadTodayModules,
  resetTodayModules,
  getMorningStats,
  getFocusStats,
  getIdeaStats,
  formatDuration

});


console.log("✅ 晨間打卡 / 專注 / 想法庫 載入完成");
