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


  return {

    user_id: currentUser.id,

    report_date: getToday(),

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
