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

let currentTasks = [];        // 今天的任務（不含已跳過）
let skippedTasks = [];        // 今天「只跳過今天」的重複任務
let currentTaskFilter = "all";
let currentTaskCategoryFilter = "all";   // 今日任務的分類篩選
let currentManagedTab = "repeat";   // 任務管理分頁：repeat / once
let taskTemplates = [];       // 重複任務的範本
let carriedOverForDate = null;      // 今天已經順延過了嗎

/* 今天的額外獎勵（晨間 / 專注 / 主線），從 reward_events 讀 */
let todayBonus = {
  exp: 0,
  gold: 0,
  morning: null,
  focus: null,
  mainline: null
};


/* =========================================================
   3. 頁面初始化
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

  console.log("🚀 RPG 系統啟動");

  try {
    await checkSession();
  } catch (error) {
    console.error("初始化失敗：", error);
    showLoggedOutUI();
  }

});


/*
  開頁時 body 有 "booting"：先顯示「載入中」，
  確認完登入狀態才決定顯示登入畫面還是主畫面，
  已登入的人就不會先閃一下登入畫面
*/

function finishBooting() {

  document.body.classList.remove("booting");

}


/* =========================================================
   跨日自動更新
   網頁從昨晚開到今天時，回到網頁就自動換成今天的資料
========================================================= */

let loadedForDate = null;


function refreshIfNewDay() {

  if (!currentUser || !loadedForDate) return;

  if (getToday() !== loadedForDate) {

    console.log("📅 換日了，重新載入今天的資料");

    showLoggedInUI();

  }

}


document.addEventListener("visibilitychange", () => {

  if (document.visibilityState === "visible") {

    refreshIfNewDay();

  }

});

window.addEventListener("focus", refreshIfNewDay);

setInterval(refreshIfNewDay, 60 * 1000);


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
      password,
      options: {
        /*
          驗證信點下去要回到這個網站
          （這個網址也要加進 Supabase 的 Redirect URLs）
        */
        emailRedirectTo:
          window.location.origin + window.location.pathname
      }
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

  /* 記住這次載入的是哪一天（跨日自動更新用） */
  loadedForDate = getToday();

  const authSection =
    document.getElementById("auth-section");

  const appSection =
    document.getElementById("app-section");


  if (authSection) {

    authSection.style.display = "none";

  }


  finishBooting();


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
    載入任務分類（任務要照分類分組，所以先載）
  */

  try {

    await loadTaskCategories();

  } catch (error) {

    console.error(
      "任務分類載入失敗：",
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


  loadedForDate = null;

  carriedOverForDate = null;

  skippedTasks = [];

  taskTemplates = [];

  managedOnceTasks = [];

  finishBooting();


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

  /*
    新的獎勵表（照藍圖範例）：
    已經建立的任務保留原本的數字，只有新任務用這張表
  */

  const rewards = {

    easy: {
      exp: 15,
      gold: 10
    },

    normal: {
      exp: 30,
      gold: 20
    },

    hard: {
      exp: 50,
      gold: 35
    },

    epic: {
      exp: 80,
      gold: 55
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
   16. 分類（🏷️ 可以自訂，存在 task_categories；這裡是預設值）
========================================================= */

const DEFAULT_TASK_CATEGORIES = [
  { key: "study",    label: "學習",     emoji: "📚", color: "#5865f2" },
  { key: "toeic",    label: "多益",     emoji: "🔤", color: "#4fc3f7" },
  { key: "focus",    label: "專注",     emoji: "🎯", color: "#9b6cff" },
  { key: "health",   label: "健康",     emoji: "💪", color: "#42d392" },
  { key: "survival", label: "生存整理", emoji: "🧹", color: "#ff9f5a" },
  { key: "personal", label: "個人生活", emoji: "🏠", color: "#ffd76a" },
  { key: "daily",    label: "每日收尾", emoji: "🌙", color: "#9ca5bd" },
  { key: "random",   label: "隨機自律", emoji: "🎲", color: "#ff6b81" }
];

/* 目前的分類（登入後從資料庫讀；讀不到就用預設） */
let taskCategories = DEFAULT_TASK_CATEGORIES.map(
  (category, index) => ({ ...category, sort_order: index + 1 })
);


function findCategory(key) {

  return taskCategories.find(category => category.key === key)
    || DEFAULT_TASK_CATEGORIES.find(category => category.key === key)
    || { key: key || "", label: key || "其他", emoji: "📦", color: "#9ca5bd" };

}


/* 顏色只接受 #RRGGBB，避免奇怪的字串跑進 style */
function safeColor(color) {

  return /^#[0-9a-fA-F]{6}$/.test(color || "") ? color : "#9ca5bd";

}


/* 純文字「📚 學習」（放進 HTML 前要 escapeHtml） */
function getCategoryLabel(category) {

  const found = findCategory(category);

  return `${found.emoji} ${found.label}`;

}


/* 有顏色的分類小標籤 */
function categoryTagHtml(category) {

  const found = findCategory(category);

  return `<span class="cat-tag" style="--cat:${safeColor(found.color)}">${escapeHtml(found.emoji)} ${escapeHtml(found.label)}</span>`;

}


/* =========================================================
   17. 載入今天任務
========================================================= */

async function loadTasks() {

  if (!currentUser) return;


  const today = getToday();


  /*
    沒完成的單次任務 → 移到今天（每天只需要做一次）
  */

  if (carriedOverForDate !== today) {

    try {

      const {
        data: moved,
        error
      } = await db.rpc("carry_over_tasks");


      if (error) {

        console.warn("順延任務失敗：", error);

      } else {

        carriedOverForDate = today;

        if (moved > 0) {

          console.log(`⏩ 順延了 ${moved} 個沒完成的單次任務`);

        }

      }

    } catch (error) {

      console.warn("順延任務失敗：", error);

    }

  }


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

    skippedTasks = [];

    renderTasks();

    return;

  }


  /*
    「只跳過今天」的任務不算在今天的任務裡，
    放在清單最下面，可以復原
  */

  currentTasks =
    (data || []).filter(task => !task.skipped);

  skippedTasks =
    (data || []).filter(task => task.skipped);


  renderTasks();

  updateSummary();

}


/* 是不是「由重複任務產生」的任務 */

function isRepeatInstance(task) {

  return Boolean(
    task.template_id ||
    (task.repeat_type && task.repeat_type !== "none")
  );

}


/* 2026-10-08 → 10/8 */

function formatShortDate(dateString) {

  const [, month, day] =
    String(dateString).split("-").map(Number);

  return `${month}/${day}`;

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
    分類篩選（今天有用到 2 個以上分類才顯示）
  */

  const presentKeys =
    categoryKeysInUse(currentTasks);

  if (
    currentTaskCategoryFilter !== "all" &&
    !presentKeys.includes(currentTaskCategoryFilter)
  ) {

    currentTaskCategoryFilter = "all";

  }

  renderTaskCategoryFilter(presentKeys);

  if (currentTaskCategoryFilter !== "all") {

    tasks =
      tasks.filter(
        task => (task.category || "") === currentTaskCategoryFilter
      );

  }


  /*
    已跳過的任務（放最下面，可以復原）
  */

  const skippedHtml =
    skippedTasks.length === 0
      ? ""
      : `
        <div class="skipped-box">
          <div class="small-note">今天已跳過：</div>
          ${skippedTasks
            .map(task => `
              <div class="skipped-row">
                <span>🔄 ${escapeHtml(task.title)}</span>
                <button class="icon-btn" onclick="unskipTask(${Number(task.id)})">
                  ↩ 復原
                </button>
              </div>
            `)
            .join("")}
        </div>
      `;


  /*
    沒有任務
  */

  if (tasks.length === 0) {

    list.innerHTML = `
      <div class="empty-state">
        🎮 目前沒有任務
      </div>
    ` + skippedHtml;

    return;

  }


  const renderOne = task => {

      const reward =
        getActualReward(task);


      /* 小標籤：重複任務、順延 */

      const badges = [];

      if (isRepeatInstance(task)) {

        badges.push(`<span class="badge-repeat">🔄 重複</span>`);

      }

      if (
        task.original_date &&
        task.original_date !== task.task_date
      ) {

        badges.push(
          `<span class="badge-carry">⏩ 順延自 ${formatShortDate(task.original_date)}</span>`
        );

      }


      return `

        <div
          class="task-item ${task.completed ? "completed" : ""}"
          data-task-id="${task.id}"
          style="--cat:${safeColor(findCategory(task.category).color)}"
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

                ${badges.join("")}

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
                title="編輯"
                onclick="editTask('${task.id}')"
              >
                ✏️
              </button>


              <button
                title="刪除"
                onclick="deleteTask('${task.id}')"
              >
                🗑️
              </button>

            </div>

          </div>

        </div>

      `;

  };


  /* 照分類分組（分類的順序 = 🏷️ 任務分類的順序） */

  list.innerHTML = renderTaskGroups(tasks, renderOne) + skippedHtml;

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


  /* 星期一 = 1 … 星期日 = 7，可多選 */

  const repeatDays =
    readWeekdayPicker("new-task-days");


  if (
    repeat === "repeat" &&
    repeatType === "weekly" &&
    repeatDays.length === 0
  ) {

    showAddTaskMessage(
      "每週重複至少要選一天",
      true
    );

    return;

  }


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
              ? repeatDays
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

/*
  找任務：今日清單、已跳過、任務管理的單次清單都找
*/

function findTask(taskId) {

  return [
    ...currentTasks,
    ...skippedTasks,
    ...managedOnceTasks
  ].find(
    item => String(item.id) === String(taskId)
  );

}


async function editTask(taskId) {

  const task = findTask(taskId);


  if (!task) {

    alert("找不到這個任務");

    return;

  }


  const notes = [];

  if (task.completed) {

    notes.push("已完成的任務不能改難度（要先取消勾選，避免 EXP 對不上）。");

  }

  if (isRepeatInstance(task)) {

    notes.push("這裡只會改今天這一份；要改以後每天的，請到「任務管理 → 重複任務」。");

  }


  openModal({

    title: "✏️ 編輯任務",

    bodyHtml: `

      <div class="modal-field">
        <label for="edit-task-title">任務名稱</label>
        <input type="text" id="edit-task-title" maxlength="100"
          value="${escapeHtml(task.title)}">
      </div>

      <div class="modal-field">
        <label for="edit-task-category">分類</label>
        <select id="edit-task-category">
          ${categoryOptionsHtml(task.category)}
        </select>
      </div>

      <div class="modal-field">
        <label for="edit-task-difficulty">難度</label>
        <select id="edit-task-difficulty" ${task.completed ? "disabled" : ""}>
          ${difficultyOptionsHtml(task.difficulty)}
        </select>
      </div>

      ${notes.map(note => `<p class="small-note">${note}</p>`).join("")}

    `,

    buttons: [

      { label: "取消", className: "btn" },

      {
        label: "儲存",
        className: "btn btn-primary",
        onClick: () => saveTaskEdit(task)
      }

    ],

    focus: "#edit-task-title"

  });

}


async function saveTaskEdit(task) {

  const title =
    document.getElementById("edit-task-title").value.trim();

  const category =
    document.getElementById("edit-task-category").value;

  const difficulty =
    document.getElementById("edit-task-difficulty").value;


  if (!title) {

    alert("任務名稱不能為空");

    return false;   // 不關閉視窗

  }


  const update = {
    title,
    category
  };


  /* 難度改了 → 獎勵跟著改（只限還沒完成的任務） */

  if (!task.completed && difficulty !== task.difficulty) {

    const reward = getTaskReward(difficulty);

    update.difficulty = difficulty;
    update.exp_reward = reward.exp;
    update.gold_reward = reward.gold;

  }


  const { error } = await db
    .from("tasks")
    .update(update)
    .eq("id", task.id)
    .eq("user_id", currentUser.id);


  if (error) {

    console.error("編輯任務失敗：", error);

    alert("編輯失敗：" + error.message);

    return false;

  }


  showToast("✅ 已儲存");

  await loadTasks();

  await loadTaskManagement();

}


/* =========================================================
   27. 刪除任務
   - 已完成：要先取消勾選（EXP 一起扣回）
   - 單次任務：確認後刪除
   - 重複任務：選「只跳過今天」或「停止整個重複任務」
========================================================= */

async function deleteTask(taskId) {

  const task = findTask(taskId);


  if (!task) {

    alert("找不到這個任務");

    return;

  }


  if (task.completed) {

    alert(
      "已完成的任務要先取消勾選（EXP 會一起扣回），\n" +
      "才能刪除或跳過。"
    );

    return;

  }


  if (isRepeatInstance(task)) {

    openModal({

      title: "🔄 這是重複任務",

      bodyHtml: `
        <p>要怎麼處理「${escapeHtml(task.title)}」？</p>
        <p class="small-note">
          「只跳過今天」：今天不做，明天照常出現。<br>
          「停止整個重複任務」：以後都不會出現，可以在「任務管理 → 重複任務」恢復或刪除。
        </p>
      `,

      buttons: [

        { label: "取消", className: "btn" },

        {
          label: "只跳過今天",
          className: "btn btn-primary",
          onClick: () => skipTask(task)
        },

        {
          label: "停止整個重複任務",
          className: "btn btn-danger",
          onClick: () => stopRepeatFromTask(task)
        }

      ]

    });

    return;

  }


  const confirmed =
    confirm(
      `確定要刪除「${task.title}」嗎？`
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


/* 只跳過今天：留著這一筆並標記跳過，系統就不會再補一份 */

async function skipTask(task) {

  const { error } = await db
    .from("tasks")
    .update({ skipped: true })
    .eq("id", task.id)
    .eq("user_id", currentUser.id);


  if (error) {

    alert("跳過失敗：" + error.message);

    return false;

  }


  showToast("已跳過今天，明天會照常出現");

  await loadTasks();

}


async function unskipTask(taskId) {

  const { error } = await db
    .from("tasks")
    .update({ skipped: false })
    .eq("id", taskId)
    .eq("user_id", currentUser.id);


  if (error) {

    alert("復原失敗：" + error.message);

    return;

  }


  await loadTasks();

}


/* 停止整個重複任務 = 暫停範本（可以恢復）＋ 移除今天還沒完成的那一份 */

async function stopRepeatFromTask(task) {

  if (task.template_id) {

    const { error } = await db
      .from("task_templates")
      .update({ repeat_enabled: false })
      .eq("id", task.template_id)
      .eq("user_id", currentUser.id);


    if (error) {

      alert("停止失敗：" + error.message);

      return false;

    }

  }


  const { error: deleteError } = await db
    .from("tasks")
    .delete()
    .eq("id", task.id)
    .eq("user_id", currentUser.id);


  if (deleteError) {

    alert("移除今天的任務失敗：" + deleteError.message);

  }


  showToast("已停止。可以在「任務管理 → 重複任務」恢復或刪除");

  await loadTasks();

  await loadTaskManagement();

}


/* =========================================================
   共用：彈出視窗
   openModal({ title, bodyHtml, buttons: [{ label, className, onClick }], focus })
   onClick 回傳 false 代表「不要關閉視窗」（例如欄位沒填好）
========================================================= */

let modalButtons = [];
let modalBusy = false;


function openModal({ title, bodyHtml, buttons, focus }) {

  modalButtons = buttons || [];

  /* 管理視窗（倒數 / 長期目標）會自己標記種類 */
  delete document.getElementById("modal").dataset.kind;

  document.getElementById("modal-title").textContent = title;

  document.getElementById("modal-body").innerHTML = bodyHtml;

  document.getElementById("modal-actions").innerHTML = modalButtons
    .map((button, index) => `
      <button class="${button.className || "btn"}" onclick="modalAction(${index})">
        ${escapeHtml(button.label)}
      </button>
    `)
    .join("");

  document.getElementById("modal").style.display = "flex";


  if (focus) {

    setTimeout(() => {

      const el = document.querySelector(focus);

      if (el) el.focus();

    }, 30);

  }

}


function closeModal() {

  const modal = document.getElementById("modal");

  if (modal) {
    modal.style.display = "none";
    delete modal.dataset.kind;
  }

  modalButtons = [];

}


async function modalAction(index) {

  const button = modalButtons[index];

  if (!button || modalBusy) return;


  if (!button.onClick) {

    closeModal();

    return;

  }


  modalBusy = true;

  try {

    const result = await button.onClick();

    if (result !== false) closeModal();

  } finally {

    modalBusy = false;

  }

}


document.addEventListener("keydown", event => {

  if (event.key === "Escape") closeModal();

});


/* 分類 / 難度下拉選單 */

const DIFFICULTY_ORDER = [
  "easy", "normal", "hard", "epic"
];


function categoryOptionsHtml(selected) {

  const list = [...taskCategories];

  /* 舊任務的分類如果已經不在清單裡，也要能選到（才不會被偷偷改掉） */
  if (selected && !list.some(category => category.key === selected)) {
    list.push(findCategory(selected));
  }

  return list
    .map(category => `
      <option value="${escapeHtml(category.key)}" ${category.key === selected ? "selected" : ""}>
        ${escapeHtml(getCategoryLabel(category.key))}
      </option>
    `)
    .join("");

}


function difficultyOptionsHtml(selected) {

  return DIFFICULTY_ORDER
    .map(key => {

      const reward = getTaskReward(key);

      return `
        <option value="${key}" ${key === selected ? "selected" : ""}>
          ${getDifficultyLabel(key)}（+${reward.exp} EXP / +${reward.gold} 金幣）
        </option>
      `;

    })
    .join("");

}


/* 星期選擇（可多選）：1 = 星期一 … 7 = 星期日 */

const WEEKDAY_LABELS = {
  1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 7: "日"
};


function weekdayPickerHtml(name, selectedDays) {

  const selected = new Set((selectedDays || []).map(Number));

  return `
    <div class="day-picker">
      ${[1, 2, 3, 4, 5, 6, 7]
        .map(day => `
          <label class="day-chip">
            <input type="checkbox" name="${name}" value="${day}"
              ${selected.has(day) ? "checked" : ""}>
            ${WEEKDAY_LABELS[day]}
          </label>
        `)
        .join("")}
    </div>
  `;

}


function readWeekdayPicker(name) {

  return [...document.querySelectorAll(`input[name="${name}"]:checked`)]
    .map(input => Number(input.value))
    .sort((a, b) => a - b);

}


/* 今天是星期幾（台灣時間，1 = 一 … 7 = 日） */

function getTodayWeekday() {

  const [year, month, day] = getToday().split("-").map(Number);

  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return weekday === 0 ? 7 : weekday;

}


function describeRepeatRule(template) {

  if (template.repeat_type === "daily") return "每天";

  if (template.repeat_type === "weekly") {

    const days = (template.repeat_days || [])
      .map(Number)
      .sort((a, b) => a - b)
      .map(day => WEEKDAY_LABELS[day])
      .join("、");

    return days ? `每週${days}` : "每週（沒選星期）";

  }

  return "不重複";

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


  /* 加上晨間、專注、主線的額外獎勵 */

  todayExp += todayBonus.exp;

  todayGold += todayBonus.gold;


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
   - 🔄 重複任務：範本清單，可暫停 / 恢復、編輯、刪除
   - 📌 單次任務：還沒完成的單次任務
========================================================= */

let managedOnceTasks = [];   // 任務管理的「單次任務」清單


async function loadTaskManagement() {

  if (!currentUser) return;


  try {

    const [templatesResult, onceResult] = await Promise.all([

      db
        .from("task_templates")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: true }),

      db
        .from("tasks")
        .select("*")
        .eq("user_id", currentUser.id)
        .eq("completed", false)
        .order("created_at", { ascending: true })

    ]);


    if (templatesResult.error) {

      console.error("載入重複任務失敗：", templatesResult.error);

    } else {

      taskTemplates = templatesResult.data || [];

    }


    if (onceResult.error) {

      console.error("載入單次任務失敗：", onceResult.error);

    } else {

      managedOnceTasks = (onceResult.data || []).filter(
        task => !isRepeatInstance(task) && !task.skipped
      );

    }


    renderTaskManagement();


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

function renderTaskManagement() {

  const list =
    document.getElementById(
      "task-management-list"
    );


  if (!list) return;


  /* 分頁按鈕 */

  document
    .querySelectorAll("[data-managed-tab]")
    .forEach(btn => {

      btn.classList.toggle(
        "active",
        btn.dataset.managedTab === currentManagedTab
      );

    });


  const repeatCount = document.getElementById("managed-repeat-count");
  const onceCount = document.getElementById("managed-once-count");

  if (repeatCount) repeatCount.textContent = taskTemplates.length || "";
  if (onceCount) onceCount.textContent = managedOnceTasks.length || "";


  if (currentManagedTab === "once") {

    renderManagedOnce(list);

  } else {

    renderManagedRepeat(list);

  }


  /* 分類管理的「重複 N 個」也跟著更新 */
  renderCategoryManager();

}


function renderManagedRepeat(list) {

  if (taskTemplates.length === 0) {

    list.innerHTML = `
      <div class="empty-state">
        還沒有重複任務。新增任務時選「重複任務」就會出現在這裡
      </div>
    `;

    return;

  }


  const today = getToday();


  list.innerHTML = taskTemplates
    .map(template => {

      const id = Number(template.id);

      const ended =
        template.repeat_end_date &&
        template.repeat_end_date < today;


      let status;

      if (!template.repeat_enabled) {

        status = `<span class="status-paused">⏸ 暫停中</span>`;

      } else if (ended) {

        status = `<span class="status-ended">🏁 已結束</span>`;

      } else {

        status = `<span class="status-active">▶ 進行中</span>`;

      }


      return `

        <div class="managed-task-item ${template.repeat_enabled && !ended ? "" : "inactive"}">

          <div class="managed-main">

            <strong>${escapeHtml(template.title)}</strong>

            <div class="task-meta">
              ${status}
              <span>${describeRepeatRule(template)}</span>
              ${categoryTagHtml(template.category)}
              <span>${getDifficultyLabel(template.difficulty)}</span>
              <span>
                ${template.repeat_end_date
                  ? `到 ${escapeHtml(template.repeat_end_date)}`
                  : "沒有結束日"}
              </span>
            </div>

          </div>


          <div class="managed-actions">

            <button onclick="toggleTemplatePause(${id})">
              ${template.repeat_enabled ? "⏸ 暫停" : "▶ 恢復"}
            </button>

            <button title="編輯" onclick="editTemplate(${id})">✏️</button>

            <button class="btn-del" title="刪除" onclick="deleteTemplate(${id})">🗑️</button>

          </div>

        </div>

      `;

    })
    .join("");

}


function renderManagedOnce(list) {

  if (managedOnceTasks.length === 0) {

    list.innerHTML = `
      <div class="empty-state">
        沒有未完成的單次任務 👍
      </div>
    `;

    return;

  }


  list.innerHTML = managedOnceTasks
    .map(task => {

      const id = Number(task.id);

      const carried =
        task.original_date &&
        task.original_date !== task.task_date
          ? `<span class="badge-carry">⏩ 順延自 ${formatShortDate(task.original_date)}</span>`
          : "";


      return `

        <div class="managed-task-item">

          <div class="managed-main">

            <strong>${escapeHtml(task.title)}</strong>

            <div class="task-meta">
              ${carried}
              <span>${escapeHtml(task.task_date)}</span>
              ${categoryTagHtml(task.category)}
              <span>${getDifficultyLabel(task.difficulty)}</span>
            </div>

          </div>


          <div class="managed-actions">

            <button title="編輯" onclick="editTask(${id})">✏️</button>

            <button class="btn-del" title="刪除" onclick="deleteTask(${id})">🗑️</button>

          </div>

        </div>

      `;

    })
    .join("");

}


/* =========================================================
   31. 任務管理分頁
========================================================= */

function setManagedTab(tab) {

  currentManagedTab = tab;

  renderTaskManagement();

}


/* =========================================================
   32. 重複任務：暫停 / 恢復、編輯、刪除
========================================================= */

function findTemplate(templateId) {

  return taskTemplates.find(
    template => Number(template.id) === Number(templateId)
  );

}


/* 今天由這個範本產生、還沒完成的那一份 */

function todayOpenInstanceQuery(templateId) {

  return db
    .from("tasks")
    .delete()
    .eq("user_id", currentUser.id)
    .eq("template_id", templateId)
    .eq("task_date", getToday())
    .eq("completed", false);

}


async function toggleTemplatePause(templateId) {

  const template = findTemplate(templateId);

  if (!template) return;


  const pausing = template.repeat_enabled;


  const { error } = await db
    .from("task_templates")
    .update({
      repeat_enabled: !pausing,
      updated_at: new Date().toISOString()
    })
    .eq("id", templateId)
    .eq("user_id", currentUser.id);


  if (error) {

    alert((pausing ? "暫停" : "恢復") + "失敗：" + error.message);

    return;

  }


  if (pausing) {

    /* 暫停：今天還沒完成的那一份也拿掉 */

    const { error: removeError } =
      await todayOpenInstanceQuery(templateId);

    if (removeError) {

      console.warn("移除今天的任務失敗：", removeError);

    }

    showToast(`⏸ 已暫停「${template.title}」`);

  } else {

    showToast(`▶ 已恢復「${template.title}」`);

  }


  /* 恢復時，loadTasks 會自動補上今天那一份（如果今天要做） */

  await loadTasks();

  await loadTaskManagement();

}


function editTemplate(templateId) {

  const template = findTemplate(templateId);

  if (!template) return;


  const weekly = template.repeat_type === "weekly";


  openModal({

    title: "✏️ 編輯重複任務",

    bodyHtml: `

      <div class="modal-field">
        <label for="tpl-title">任務名稱</label>
        <input type="text" id="tpl-title" maxlength="100"
          value="${escapeHtml(template.title)}">
      </div>

      <div class="modal-row">

        <div class="modal-field">
          <label for="tpl-category">分類</label>
          <select id="tpl-category">
            ${categoryOptionsHtml(template.category)}
          </select>
        </div>

        <div class="modal-field">
          <label for="tpl-difficulty">難度</label>
          <select id="tpl-difficulty">
            ${difficultyOptionsHtml(template.difficulty)}
          </select>
        </div>

      </div>

      <div class="modal-field">
        <label for="tpl-type">重複方式</label>
        <select id="tpl-type" onchange="document.getElementById('tpl-days-field').style.display = this.value === 'weekly' ? 'block' : 'none'">
          <option value="daily" ${weekly ? "" : "selected"}>每天</option>
          <option value="weekly" ${weekly ? "selected" : ""}>每週</option>
        </select>
      </div>

      <div class="modal-field" id="tpl-days-field" style="display:${weekly ? "block" : "none"};">
        <label>星期（可多選）</label>
        ${weekdayPickerHtml(
          "tpl-days",
          weekly && (template.repeat_days || []).length
            ? template.repeat_days
            : [getTodayWeekday()]
        )}
      </div>

      <div class="modal-field">
        <label for="tpl-end">結束日期（可不填）</label>
        <input type="date" id="tpl-end" value="${escapeHtml(template.repeat_end_date || "")}">
      </div>

      <p class="small-note">
        從今天開始生效；今天那一份如果還沒完成，名稱、分類、難度也會一起更新。
      </p>

    `,

    buttons: [

      { label: "取消", className: "btn" },

      {
        label: "儲存",
        className: "btn btn-primary",
        onClick: () => saveTemplateEdit(template)
      }

    ],

    focus: "#tpl-title"

  });

}


async function saveTemplateEdit(template) {

  const title = document.getElementById("tpl-title").value.trim();
  const category = document.getElementById("tpl-category").value;
  const difficulty = document.getElementById("tpl-difficulty").value;
  const repeatType = document.getElementById("tpl-type").value;
  const days = readWeekdayPicker("tpl-days");
  const endDate = document.getElementById("tpl-end").value || null;


  if (!title) {

    alert("任務名稱不能為空");

    return false;

  }


  if (repeatType === "weekly" && days.length === 0) {

    alert("每週重複至少要選一天");

    return false;

  }


  const reward = getTaskReward(difficulty);

  const repeatDays = repeatType === "weekly" ? days : [];


  const { error } = await db
    .from("task_templates")
    .update({
      title,
      category,
      difficulty,
      exp_reward: reward.exp,
      gold_reward: reward.gold,
      repeat_type: repeatType,
      repeat_days: repeatDays,
      repeat_end_date: endDate,
      updated_at: new Date().toISOString()
    })
    .eq("id", template.id)
    .eq("user_id", currentUser.id);


  if (error) {

    alert("儲存失敗：" + error.message);

    return false;

  }


  /* 今天還沒完成的那一份一起更新 */

  const { error: todayError } = await db
    .from("tasks")
    .update({
      title,
      category,
      difficulty,
      exp_reward: reward.exp,
      gold_reward: reward.gold,
      repeat_type: repeatType,
      repeat_days: repeatDays,
      repeat_end_date: endDate
    })
    .eq("user_id", currentUser.id)
    .eq("template_id", template.id)
    .eq("task_date", getToday())
    .eq("completed", false);


  if (todayError) {

    console.warn("更新今天的任務失敗：", todayError);

  }


  showToast("✅ 已儲存");

  await loadTasks();

  await loadTaskManagement();

}


async function deleteTemplate(templateId) {

  const template = findTemplate(templateId);

  if (!template) return;


  const ok = confirm(
    `刪除重複任務「${template.title}」？\n\n` +
    "・以後不會再出現\n" +
    "・過去完成的紀錄會保留（數據中心會用到）\n" +
    "・今天還沒完成的那一份會一起刪除\n\n" +
    "只是暫時不做的話，建議用「暫停」。"
  );

  if (!ok) return;


  const { error: removeError } =
    await todayOpenInstanceQuery(templateId);

  if (removeError) {

    alert("刪除今天的任務失敗：" + removeError.message);

    return;

  }


  const { error } = await db
    .from("task_templates")
    .delete()
    .eq("id", templateId)
    .eq("user_id", currentUser.id);


  if (error) {

    alert("刪除失敗：" + error.message);

    return;

  }


  showToast(`🗑️ 已刪除「${template.title}」`);

  await loadTasks();

  await loadTaskManagement();

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

    const weekly =
      repeatTypeElement.value === "weekly";

    repeatDayItem.style.display =
      weekly ? "block" : "none";


    /* 打開「每週」時，一天都沒勾就先勾今天 */

    if (
      weekly &&
      readWeekdayPicker("new-task-days").length === 0
    ) {

      const todayBox = document.querySelector(
        `input[name="new-task-days"][value="${getTodayWeekday()}"]`
      );

      if (todayBox) todayBox.checked = true;

    }

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

window.toggleTask =
  toggleTask;

window.editTask =
  editTask;

window.deleteTask =
  deleteTask;

/* 重複任務管理 */

Object.assign(window, {
  unskipTask,
  setManagedTab,
  toggleTemplatePause,
  editTemplate,
  deleteTemplate,
  openModal,
  closeModal,
  modalAction
});

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

  /* 😴 昨晚的作息、🍱 今天的三餐 */

  const sleepReport =
    getSleepReportStats();

  const mealReport =
    getMealStats();


  return {

    user_id: currentUser.id,

    report_date: getToday(),

    morning_done: morning.done,

    morning_total: morning.total,

    focus_seconds: focus.seconds,

    focus_by_subject: focus.bySubject,

    ideas_added: idea.added,

    ideas_converted: idea.converted,

    habits_done: getHabitStats().done,

    habits_total: getHabitStats().total,

    wake_time: sleepReport.wakeTime,

    bed_time: sleepReport.bedTime,

    sleep_minutes: sleepReport.minutes,

    meals_count: mealReport.count,

    meal_cost: mealReport.cost,

    fortune_level: getFortuneReportLevel(),

    mainline_title:
      todayMainline ? todayMainline.title : null,

    mainline_done:
      Boolean(todayMainline && todayMainline.completed),

    bonus_exp: todayBonus.exp,

    bonus_gold: todayBonus.gold,

    tasks_total: total,

    tasks_done: doneTasks.length,

    completion_rate:
      total === 0
        ? 0
        : Math.round(
            (doneTasks.length / total) * 100
          ),

    /* 總共：任務 + 額外獎勵 */

    exp_gained: exp + todayBonus.exp,

    gold_gained: gold + todayBonus.gold,

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

        <div class="report-label">🎯 主線</div>
        <div class="report-value">
          ${report.mainline_title
            ? `${report.mainline_done ? "✅ 完成" : "⬜ 未完成"}
               <div class="small-note" style="font-weight:normal;">${escapeHtml(report.mainline_title)}</div>`
            : "今天沒有設定"}
        </div>

        <div class="report-label">📋 任務</div>
        <div class="report-value">
          ${Number(report.tasks_done)} / ${Number(report.tasks_total)}
        </div>

        <div class="report-label">🎮 EXP</div>
        <div class="report-value">
          +${Number(report.exp_gained)}
          ${Number(report.bonus_exp || 0) > 0
            ? `<div class="small-note" style="font-weight:normal;">其中額外獎勵 +${Number(report.bonus_exp)}（晨間 / 專注 / 主線 / 習慣 / 作息 / 抽籤）</div>`
            : ""}
        </div>

        <div class="report-label">💰 Gold</div>
        <div class="report-value">
          +${Number(report.gold_gained)}
        </div>

        <div class="report-label">🌅 晨間打卡</div>
        <div class="report-value">
          ${Number(report.morning_done || 0)} / ${Number(report.morning_total || 0)}
        </div>

        <div class="report-label">📅 習慣</div>
        <div class="report-value">
          ${Number(report.habits_done || 0)} / ${Number(report.habits_total || 0)}
        </div>

        <div class="report-label">🎴 運勢</div>
        <div class="report-value">
          ${report.fortune_level ? escapeHtml(report.fortune_level) : "今天沒抽籤"}
        </div>

        <div class="report-label">😴 作息</div>
        <div class="report-value">
          ${sleepReportText(report)}
        </div>

        <div class="report-label">🍱 三餐</div>
        <div class="report-value">
          ${Number(report.meals_count || 0)} / 3 餐${Number(report.meal_cost || 0) > 0 ? `・花了 $${Number(report.meal_cost)}` : ""}
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

  if (s <= 0) return "0m";

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

  setTodayDateLabel();

  /* 一個模組壞掉不影響其他模組 */

  for (const loader of [
    loadCountdowns,
    loadMainline,
    loadMorning,
    loadHabits,
    loadFocus,
    loadIdeas,
    loadSleep,
    loadMeals,
    loadFortune,
    loadTodayRewards
  ]) {

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

  countdowns = [];
  goals = [];
  todayMainline = null;
  previousMainline = null;
  goalStats = {};
  todayBonus = { exp: 0, gold: 0, morning: null, focus: null, mainline: null };

  habits = [];
  habitLogSet = new Set();
  habitMakeupSet = new Set();
  morningDoneSet = new Set();
  habitEditing = false;

  sleepLogs = [];
  sleepSettings = { ...SLEEP_DEFAULT_SETTINGS };
  sleepLoadError = null;
  mealLogs = [];
  mealLoadError = null;
  taskCategories = DEFAULT_TASK_CATEGORIES.map(
    (category, index) => ({ ...category, sort_order: index + 1 })
  );
  taskCategoriesFromDb = false;
  currentTaskCategoryFilter = "all";
  fortuneDraws = [];
  fortuneLoadError = null;
  habitChartSelection = "all";

  document.title = ORIGINAL_TITLE;

  if (typeof closeModal === "function") closeModal();

  updateNavBadges();

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
        ? `<div class="morning-complete">🎉 晨間啟動完成！+20 EXP / +10 金幣・開始今天的主線吧</div>`
        : total > 0
        ? `<div class="reward-hint">🎁 全部完成 +20 EXP / +10 金幣（還差 ${total - done} 項）</div>`
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

  /* 勾「起床」→ 順便記錄起床時間（還沒記錄才記） */
  let wakeFromMorning = false;


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

      wakeFromMorning = isWakeMorningItem(itemId);

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


    if (wakeFromMorning) {
      await recordWake({ auto: true });
    }


    /* 全部完成 → 資料庫發獎勵；又取消 → 收回（提示也由這裡顯示） */

    await syncMorningReward();

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

  await syncMorningReward();

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

  await syncMorningReward();

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

  await syncMorningReward();

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

  await syncMorningReward();

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

  await syncMorningReward();

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

  await syncMorningReward();

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

  /* 換到別的分頁時，導覽列也看得到計時 */
  updateNavBadges();

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


  /* 🎁 獎勵進度：每滿 25 分鐘 +10 EXP / +5 金幣 */

  const units = Math.floor(seconds / 1500);
  const toNext = Math.ceil((1500 - (seconds % 1500)) / 60);

  const rewardHint = `
    <div class="reward-hint">
      🎁 每滿 25 分鐘 +10 EXP / +5 金幣
      ${units > 0 ? `・今日已得 +${units * 10} EXP` : ""}
      ・再 ${toNext} 分鐘拿下一份
    </div>
  `;


  if (focusSessions.length === 0) {

    box.innerHTML = rewardHint + `
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
        <td>
          ${session.is_manual ? "補記" : session.mode === "down" ? "倒計時" : "正計時"}
          ${session.edited_at ? '<span class="small-note">・已修改</span>' : ""}
        </td>
        <td class="num nowrap">
          <button class="icon-btn" title="修改這筆"
            onclick="openFocusEditor(${Number(session.id)})">✏️</button>
          <button class="icon-btn" title="刪除這筆"
            onclick="deleteFocusSession(${Number(session.id)})">🗑️</button>
        </td>
      </tr>
    `)
    .join("");


  box.innerHTML = rewardHint + `

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


    const sessionDate = toTaipeiDate(timer.startedAt);

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
        session_date: sessionDate
      });

    if (error) throw error;


    /*
      紀錄已經存好了；獎勵另外處理，
      就算獎勵失敗也不能讓計時被還原（不然會記兩次）
    */

    let rewardText = "";

    try {

      const reward = await syncFocusReward(sessionDate, true);

      const gained = reward ? Number(reward.delta_exp || 0) : 0;

      if (gained > 0) {
        rewardText = `・🎁 +${gained} EXP / +${Number(reward.delta_gold || 0)} 金幣`;
      }

    } catch (rewardError) {

      console.warn("專注獎勵同步失敗：", rewardError);

    }


    const label = `${timer.subject} ${formatDuration(seconds)}`;

    if (reason === "timeup") {
      showToast(`⏰ 時間到！已記錄：${label}${rewardText}`);
    } else if (reason === "away") {
      showToast(`⏰ 倒計時在你離開時已結束，已記錄：${label}${rewardText}`);
    } else {
      showToast(`✅ 已記錄：${label}${rewardText}`);
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

  const session = focusSessions.find(
    row => Number(row.id) === Number(sessionId)
  );

  const ok = confirm(
    "刪除這筆專注紀錄？\n（如果因此少了 25 分鐘，專注獎勵會一起收回）"
  );

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

  await syncFocusReward(session ? session.session_date : getToday());

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
let ideaStatusFilter = "all";   // all / inbox / done / converted

const IDEA_STATUS_FILTERS = [
  { key: "all",       label: "全部" },
  { key: "inbox",     label: "📥 待處理" },
  { key: "done",      label: "✓ 已處理" },
  { key: "converted", label: "→ 已轉任務" }
];
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
    .limit(1000);

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

  updateNavBadges();


  /* 狀態篩選：全部 / 待處理 / 已處理 / 已轉任務（預設全部，已處理的也看得到） */

  const statusOk = idea =>
    ideaStatusFilter === "all" || idea.status === ideaStatusFilter;

  const statusCount = key =>
    ideas.filter(idea => key === "all" || idea.status === key).length;

  document.getElementById("idea-status-filters").innerHTML =
    IDEA_STATUS_FILTERS
      .map(item => `
        <button
          class="chip ${ideaStatusFilter === item.key ? "active" : ""}"
          onclick="setIdeaStatusFilter('${item.key}')"
        >${item.label} <span class="chip-count">${statusCount(item.key)}</span></button>
      `)
      .join("");


  /* 分類篩選（數量跟著狀態篩選） */

  const countIn = key =>
    ideas.filter(idea => statusOk(idea) && (key === "all" || idea.category === key)).length;

  document.getElementById("idea-filters").innerHTML =
    [{ key: "all", label: "全部分類" }, ...IDEA_CATEGORIES]
      .map(category => `
        <button
          class="chip ${ideaFilter === category.key ? "active" : ""}"
          onclick="setIdeaFilter('${category.key}')"
        >${category.label} ${countIn(category.key) || ""}</button>
      `)
      .join("");


  /* 清單：待處理在上面，已處理 / 已轉任務在下面（都是新的在前） */

  const visible = ideas.filter(idea =>
    statusOk(idea) &&
    (ideaFilter === "all" || idea.category === ideaFilter)
  );


  if (visible.length === 0) {

    list.innerHTML = `
      <div class="empty-state">
        ${ideas.length === 0
          ? "還沒有想法。想到什麼，就按右下角的 💡 先記下來"
          : ideaStatusFilter === "inbox"
          ? "這裡沒有待處理的想法 👍"
          : "這個篩選沒有想法"}
      </div>
    `;

    return;

  }


  const renderIdea = idea => {

      const id = Number(idea.id);
      const processed = idea.status !== "inbox";

      const processedDate = idea.processed_at
        ? formatShortDate(toTaipeiDate(idea.processed_at))
        : "";

      let statusText = "";
      let actions = "";

      if (idea.status === "inbox") {

        actions = `
          ${idea.category === "mainline"
            ? `<button class="icon-btn" onclick="setMainlineFromIdea(${id})">🎯 設為今日主線</button>`
            : ""}
          <button class="icon-btn" onclick="convertIdeaToTask(${id})">→ 轉任務</button>
          <button class="icon-btn" onclick="setIdeaStatus(${id}, 'done')">✓ 已處理</button>
          <button class="icon-btn" title="刪除" onclick="deleteIdea(${id})">🗑️</button>
        `;

      } else if (idea.status === "done") {

        statusText = `<span class="idea-status done">✓ 已處理${processedDate ? " " + processedDate : ""}</span>`;

        actions = `
          <button class="icon-btn" onclick="setIdeaStatus(${id}, 'inbox')">↩ 放回收件匣</button>
          <button class="icon-btn" title="刪除" onclick="deleteIdea(${id})">🗑️</button>
        `;

      } else {

        statusText = `<span class="idea-status converted">→ 已轉成任務${processedDate ? " " + processedDate : ""}</span>`;

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
              ${escapeHtml(idea.idea_date)} ${formatTimeOfDay(idea.created_at)}
            </span>
            ${statusText}
            <div class="idea-actions">${actions}</div>
          </div>

        </div>
      `;

  };


  const open = visible.filter(idea => idea.status === "inbox");

  const closed = visible.filter(idea => idea.status !== "inbox");

  const section = (title, rows) => rows.length === 0 ? "" : `
    <div class="idea-section-title">${title}<span class="small-note"> ${rows.length}</span></div>
    ${rows.map(renderIdea).join("")}
  `;

  list.innerHTML = ideaStatusFilter === "all"
    ? section("📥 待處理", open) + section("✅ 已處理 / 已轉任務", closed)
    : visible.map(renderIdea).join("");

}


function setIdeaFilter(key) {

  ideaFilter = key;

  renderIdeas();

}


function setIdeaStatusFilter(key) {

  ideaStatusFilter = key;

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
        category: availableCategoryKey(IDEA_TO_TASK_CATEGORY[idea.category] || "personal"),
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
  setIdeaStatusFilter,
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


/* #########################################################
   ① 今日＋主線：⏳ 倒數 / 🎯 今日主線 / 📍 長期目標 / 🎁 額外獎勵
######################################################### */


/* =========================================================
   M0. 共用
========================================================= */

const WEEKDAY_SHORT = ["日", "一", "二", "三", "四", "五", "六"];


/* 2026-10-09 → 10/9（五） */
function setTodayDateLabel() {

  const label = document.getElementById("today-date-label");

  if (!label) return;

  const [year, month, day] = getToday().split("-").map(Number);

  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  label.textContent = `${month}/${day}（${WEEKDAY_SHORT[weekday]}）`;

}


/* 兩個日期差幾天（b - a） */
function daysBetween(a, b) {

  const toUtc = text => {
    const [y, m, d] = String(text).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };

  return Math.round((toUtc(b) - toUtc(a)) / 86400000);

}


/* 今天往前 n 天（台灣日期） */
function shiftDate(dateText, n) {

  const [y, m, d] = dateText.split("-").map(Number);

  const date = new Date(Date.UTC(y, m - 1, d + n));

  return date.toISOString().slice(0, 10);

}


/* ＋ 新增任務面板 */
/* 新增任務的表單現在固定在「📋 任務」頁；保留這個名字給舊的呼叫用 */
function toggleAddTaskPanel(forceOpen) {

  if (forceOpen === false) return;

  goToAddTask();

}


/* =========================================================
   M1. 🎁 額外獎勵（晨間 / 專注 / 主線）
   真正的加減都在資料庫做，這裡只負責呼叫和顯示
========================================================= */

async function loadTodayRewards() {

  if (!currentUser) return;

  const { data, error } = await db
    .from("reward_events")
    .select("*")
    .eq("user_id", currentUser.id)
    .eq("reward_date", getToday());

  if (error) {
    console.warn("讀取今日獎勵失敗：", error);
    return;
  }

  const rows = data || [];

  todayBonus = {
    exp: rows.reduce((sum, row) => sum + Number(row.exp || 0), 0),
    gold: rows.reduce((sum, row) => sum + Number(row.gold || 0), 0),
    morning: rows.find(row => row.source_key.startsWith("morning:")) || null,
    focus: rows.find(row => row.source_key.startsWith("focus:")) || null,
    mainline: rows.find(row => row.source_key.startsWith("mainline:")) || null
  };

  updateSummary();

}


/* 獎勵有變動 → 更新玩家狀態、今日統計 */
async function afterRewardChange(result, gainText, loseText) {

  const delta = result ? Number(result.delta_exp || 0) : 0;

  if (delta > 0 && gainText) {
    showToast(gainText);
  } else if (delta < 0 && loseText) {
    showToast(loseText);
  }

  if (delta !== 0) {
    await loadPlayer();
  }

  await loadTodayRewards();

}


async function syncMorningReward() {

  if (!currentUser) return;

  const { data, error } = await db.rpc("sync_morning_reward");

  if (error) {
    console.warn("晨間獎勵同步失敗：", error);
    return;
  }

  await afterRewardChange(
    data,
    "🌅 晨間啟動完成！+20 EXP / +10 金幣",
    "晨間打卡沒有全部完成，收回 −20 EXP / −10 金幣"
  );


  /* 晨間完成狀態變了 → 習慣月曆的「🌅 晨間啟動」也要更新 */

  if (data && Number(data.delta_exp || 0) !== 0) {
    await loadHabits();
  }

}


/*
  silent = true：不自己顯示提示（例如結束專注時，和「已記錄」合成一則）
  回傳資料庫的結果，裡面有 delta_exp / delta_gold
*/
async function syncFocusReward(sessionDate, silent = false) {

  if (!currentUser) return null;

  const { data, error } = await db.rpc(
    "sync_focus_reward",
    { p_date: sessionDate || getToday() }
  );

  if (error) {
    console.warn("專注獎勵同步失敗：", error);
    return null;
  }

  const delta = data ? Number(data.delta_exp || 0) : 0;

  const goldDelta = data ? Number(data.delta_gold || 0) : 0;

  await afterRewardChange(
    data,
    silent ? null : `⏱️ 專注滿 25 分鐘！+${delta} EXP / +${goldDelta} 金幣`,
    silent ? null : `專注時間變少，收回 ${delta} EXP / ${goldDelta} 金幣`
  );

  return data;

}


/* =========================================================
   M2. ⏳ 倒數
========================================================= */

let countdowns = [];
let editingCountdownId = null;


async function loadCountdowns() {

  if (!currentUser) return;

  const { data, error } = await db
    .from("countdowns")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("target_date", { ascending: true });

  if (error) {

    console.error("倒數載入失敗：", error);

    document.getElementById("countdown-list").innerHTML =
      `<span class="small-note">❌ 倒數載入失敗</span>`;

    return;

  }

  countdowns = data || [];

  renderCountdownStrip();

  if (isCountdownManagerOpen()) renderCountdownManager();

}


function countdownLabel(days) {

  if (days === 0) return "🔥 就是今天！";
  if (days < 0) return `已過 ${-days} 天`;

  return `還有 <strong>${days}</strong> 天`;

}


function renderCountdownStrip() {

  const list = document.getElementById("countdown-list");

  if (!list) return;

  const today = getToday();

  const shown = countdowns
    .map(item => ({ ...item, days: daysBetween(today, item.target_date) }))
    .filter(item => item.visible && item.days >= 0)
    .sort((a, b) => a.days - b.days);


  if (shown.length === 0) {

    list.innerHTML = `
      <button class="countdown-chip add" onclick="openCountdownManager()">
        ＋ 新增倒數（例如：研究所考試）
      </button>
    `;

    return;

  }


  list.innerHTML = shown
    .map(item => `
      <div class="countdown-chip ${item.days === 0 ? "today" : item.days <= 7 ? "soon" : ""}">
        <span class="cd-title">⏳ ${escapeHtml(item.title)}</span>
        <span class="cd-days">${countdownLabel(item.days)}</span>
      </div>
    `)
    .join("");

}


function isCountdownManagerOpen() {

  const modal = document.getElementById("modal");

  return Boolean(
    modal &&
    modal.style.display !== "none" &&
    modal.dataset.kind === "countdowns"
  );

}


function openCountdownManager() {

  editingCountdownId = null;

  openModal({
    title: "⏳ 管理倒數",
    bodyHtml: "",
    buttons: [{ label: "關閉", className: "btn" }]
  });

  document.getElementById("modal").dataset.kind = "countdowns";

  renderCountdownManager();

  setTimeout(() => {
    const input = document.getElementById("cd-new-title");
    if (input && countdowns.length === 0) input.focus();
  }, 30);

}


function renderCountdownManager() {

  const body = document.getElementById("modal-body");

  if (!body) return;

  const today = getToday();

  const rows = [...countdowns]
    .sort((a, b) => (a.target_date > b.target_date ? 1 : -1))
    .map(item => {

      const id = Number(item.id);
      const days = daysBetween(today, item.target_date);

      if (editingCountdownId === id) {

        return `
          <div class="manage-row editing">
            <input type="text" id="cd-edit-title" maxlength="50" value="${escapeHtml(item.title)}">
            <input type="date" id="cd-edit-date" value="${escapeHtml(item.target_date)}">
            <div class="manage-actions">
              <button class="icon-btn" onclick="saveCountdownEdit(${id})">儲存</button>
              <button class="icon-btn" onclick="cancelCountdownEdit()">取消</button>
            </div>
          </div>
        `;

      }

      return `
        <div class="manage-row ${item.visible ? "" : "muted"}">
          <div class="manage-main">
            <strong>${escapeHtml(item.title)}</strong>
            <div class="small-note">
              ${escapeHtml(item.target_date)}・${countdownLabel(days).replace(/<\/?strong>/g, "")}
              ${item.visible ? "" : "・首頁不顯示"}
            </div>
          </div>
          <div class="manage-actions">
            <button class="icon-btn" onclick="toggleCountdownVisible(${id})">
              ${item.visible ? "🙈 隱藏" : "👁 顯示"}
            </button>
            <button class="icon-btn" title="編輯" onclick="startCountdownEdit(${id})">✏️</button>
            <button class="icon-btn" title="刪除" onclick="deleteCountdown(${id})">🗑️</button>
          </div>
        </div>
      `;

    })
    .join("");


  body.innerHTML = `

    ${rows || `<p class="small-note">還沒有倒數。例如：研究所考試、多益、專題期限、畢業。</p>`}

    <div class="manage-add">
      <input type="text" id="cd-new-title" maxlength="50" placeholder="名稱，例如：研究所考試">
      <input type="date" id="cd-new-date">
      <button class="btn btn-primary" onclick="addCountdown()">＋ 新增</button>
    </div>

    <p class="small-note">日期到了當天會顯示「🔥 就是今天！」，過了之後首頁自動隱藏（資料保留）。</p>

  `;

}


async function addCountdown() {

  const title = document.getElementById("cd-new-title").value.trim();
  const date = document.getElementById("cd-new-date").value;

  if (!title || !date) {
    alert("請輸入名稱和日期");
    return;
  }

  const { error } = await db
    .from("countdowns")
    .insert({
      user_id: currentUser.id,
      title,
      target_date: date,
      visible: true
    });

  if (error) {
    alert("新增失敗：" + error.message);
    return;
  }

  await loadCountdowns();

}


function startCountdownEdit(id) {

  editingCountdownId = id;

  renderCountdownManager();

}


function cancelCountdownEdit() {

  editingCountdownId = null;

  renderCountdownManager();

}


async function saveCountdownEdit(id) {

  const title = document.getElementById("cd-edit-title").value.trim();
  const date = document.getElementById("cd-edit-date").value;

  if (!title || !date) {
    alert("請輸入名稱和日期");
    return;
  }

  const { error } = await db
    .from("countdowns")
    .update({ title, target_date: date })
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("儲存失敗：" + error.message);
    return;
  }

  editingCountdownId = null;

  await loadCountdowns();

}


async function toggleCountdownVisible(id) {

  const item = countdowns.find(row => Number(row.id) === Number(id));

  if (!item) return;

  const { error } = await db
    .from("countdowns")
    .update({ visible: !item.visible })
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("更新失敗：" + error.message);
    return;
  }

  await loadCountdowns();

}


async function deleteCountdown(id) {

  const item = countdowns.find(row => Number(row.id) === Number(id));

  if (!item || !confirm(`刪除倒數「${item.title}」？`)) return;

  const { error } = await db
    .from("countdowns")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("刪除失敗：" + error.message);
    return;
  }

  await loadCountdowns();

}



/* =========================================================
   M3. 🎯 今日主線 ＋ 📍 長期目標
========================================================= */

let goals = [];
let todayMainline = null;
let previousMainline = null;   // 最近一天（今天以前）的主線
let goalStats = {};            // goal_id → { days, done }


async function loadMainline() {

  if (!currentUser) return;

  const [goalsResult, mainlinesResult] = await Promise.all([

    db
      .from("goals")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: true }),

    db
      .from("mainlines")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("main_date", { ascending: false })
      .limit(1000)

  ]);


  const error = goalsResult.error || mainlinesResult.error;

  if (error) {

    console.error("主線載入失敗：", error);

    document.getElementById("mainline-body").innerHTML = `
      <div class="empty-state">❌ 主線載入失敗：${escapeHtml(error.message)}</div>
    `;

    return;

  }


  goals = goalsResult.data || [];

  const rows = mainlinesResult.data || [];
  const today = getToday();

  todayMainline = rows.find(row => row.main_date === today) || null;

  previousMainline = rows.find(row => row.main_date < today) || null;


  goalStats = {};

  rows.forEach(row => {

    if (!row.goal_id) return;

    const stat = goalStats[row.goal_id] || { days: 0, done: 0 };

    stat.days += 1;
    if (row.completed) stat.done += 1;

    goalStats[row.goal_id] = stat;

  });


  renderMainline();

  if (isGoalManagerOpen()) renderGoalManager();

}


function findGoal(goalId) {

  return goals.find(goal => Number(goal.id) === Number(goalId)) || null;

}


function goalOptionsHtml(selectedId) {

  const options = goals
    .filter(goal =>
      goal.status === "active" ||
      Number(goal.id) === Number(selectedId)
    )
    .map(goal => `
      <option value="${Number(goal.id)}" ${Number(goal.id) === Number(selectedId) ? "selected" : ""}>
        📍 ${escapeHtml(goal.title)}
      </option>
    `)
    .join("");

  return `<option value="">不屬於長期目標</option>${options}`;

}


function renderMainline() {

  const body = document.getElementById("mainline-body");

  if (!body) return;


  /* ---------- 還沒設定 ---------- */

  if (!todayMainline) {

    let reuse = "";

    if (previousMainline && !previousMainline.completed) {

      const when =
        previousMainline.main_date === shiftDate(getToday(), -1)
          ? "昨天"
          : formatShortDate(previousMainline.main_date);

      reuse = `
        <button class="chip reuse-chip" onclick="reuseLastMainline()">
          ↩ 沿用${when}沒完成的主線：「${escapeHtml(previousMainline.title)}」
        </button>
      `;

    }

    body.innerHTML = `

      <div class="mainline-question">今天最重要的一件事是？</div>

      <div class="mainline-form">

        <input
          type="text"
          id="mainline-input"
          maxlength="100"
          placeholder="例如：計概進制與編碼複習"
          onkeydown="if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) setMainline()"
        >

        <select id="mainline-goal">${goalOptionsHtml(null)}</select>

        <button class="btn btn-primary" onclick="setMainline()">設定主線</button>

      </div>

      ${reuse}

      <p class="small-note" style="margin-top:10px;">
        🎁 完成主線 +50 EXP / +30 金幣。其他事情都是支線，突然想到的先丟進 💡 想法庫。
      </p>

    `;

    return;

  }


  /* ---------- 已設定 ---------- */

  const main = todayMainline;
  const goal = main.goal_id ? findGoal(main.goal_id) : null;

  body.innerHTML = `

    <div class="mainline-show ${main.completed ? "done" : ""}">

      ${goal ? `<div class="mainline-goal">📍 ${escapeHtml(goal.title)}</div>` : ""}

      <div class="mainline-title">${escapeHtml(main.title)}</div>

      ${main.completed
        ? `<div class="mainline-done-note">✅ 主線完成！+50 EXP / +30 金幣</div>`
        : ""}

      <div class="mainline-actions">

        ${main.completed
          ? `<button class="btn" onclick="toggleMainlineDone(false)">↩ 取消完成</button>`
          : `<button class="btn btn-primary" onclick="toggleMainlineDone(true)">✓ 完成主線（+50 EXP）</button>
             <button class="btn" onclick="startFocusFromMainline()">⏱️ 開始專注</button>`}

        <button class="btn" onclick="editMainline()">✏️ 修改</button>

      </div>

    </div>

  `;

}


async function insertMainline(title, goalId) {

  const { error } = await db
    .from("mainlines")
    .insert({
      user_id: currentUser.id,
      main_date: getToday(),
      title,
      goal_id: goalId || null
    });

  if (error) {

    /* 例如另一個分頁已經設定了 → 重新載入就會看到 */
    console.error("設定主線失敗：", error);
    alert("設定主線失敗：" + error.message);

  } else {

    showToast("🎯 主線設定好了，專心推進它！");

  }

  await loadMainline();

}


async function setMainline() {

  const input = document.getElementById("mainline-input");
  const title = input ? input.value.trim() : "";

  if (!title) {
    if (input) input.focus();
    return;
  }

  const goalValue = document.getElementById("mainline-goal").value;

  await insertMainline(title, goalValue ? Number(goalValue) : null);

}


async function reuseLastMainline() {

  if (!previousMainline) return;

  await insertMainline(previousMainline.title, previousMainline.goal_id);

}


function editMainline() {

  if (!todayMainline) return;

  openModal({

    title: "✏️ 修改今日主線",

    bodyHtml: `
      <div class="modal-field">
        <label for="edit-main-title">主線</label>
        <input type="text" id="edit-main-title" maxlength="100"
          value="${escapeHtml(todayMainline.title)}">
      </div>
      <div class="modal-field">
        <label for="edit-main-goal">屬於哪個長期目標</label>
        <select id="edit-main-goal">${goalOptionsHtml(todayMainline.goal_id)}</select>
      </div>
    `,

    buttons: [
      { label: "取消", className: "btn" },
      { label: "儲存", className: "btn btn-primary", onClick: saveMainlineEdit }
    ],

    focus: "#edit-main-title"

  });

}


async function saveMainlineEdit() {

  const title = document.getElementById("edit-main-title").value.trim();
  const goalValue = document.getElementById("edit-main-goal").value;

  if (!title) {
    alert("主線不能是空的");
    return false;
  }

  const { error } = await db
    .from("mainlines")
    .update({
      title,
      goal_id: goalValue ? Number(goalValue) : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", todayMainline.id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("儲存失敗：" + error.message);
    return false;
  }

  await loadMainline();

}


async function toggleMainlineDone(done) {

  if (!todayMainline) return;

  const { data, error } = await db.rpc(
    done ? "complete_mainline" : "uncomplete_mainline",
    { p_mainline_id: todayMainline.id }
  );

  if (error) {
    alert("更新主線失敗：" + error.message);
    return;
  }

  await loadMainline();

  await afterRewardChange(
    data,
    "🎯 主線完成！+50 EXP / +30 金幣",
    "已取消完成，收回 −50 EXP / −30 金幣"
  );

}


/* 跳到專注區；主線名稱裡有科目名稱就先選好 */
function startFocusFromMainline() {

  const card = document.getElementById("focus-card");

  if (!card) return;


  if (!focusTimer && todayMainline) {

    const title = todayMainline.title;

    const match = [...focusKnownSubjects]
      .sort((a, b) => b.length - a.length)
      .find(subject => title.includes(subject));

    if (match) {

      const select = document.getElementById("focus-subject");

      select.value = match;

      onFocusSubjectChange();

    }

  }


  showPage("focus");

  card.classList.remove("flash");
  void card.offsetWidth;   // 讓動畫可以重播
  card.classList.add("flash");

  if (focusTimer) {
    showToast("專注已經在進行中 💪");
  }

}


/* 想法庫「🎯 主線」分類 → 設為今日主線 */
async function setMainlineFromIdea(ideaId) {

  const idea = ideas.find(row => Number(row.id) === Number(ideaId));

  if (!idea) return;


  if (todayMainline) {

    if (todayMainline.completed) {
      alert("今天的主線已經完成了，這個想法可以留到明天。");
      return;
    }

    const ok = confirm(
      `今天已經有主線「${todayMainline.title}」，要換成「${idea.content}」嗎？`
    );

    if (!ok) return;

    const { error } = await db
      .from("mainlines")
      .update({ title: idea.content, updated_at: new Date().toISOString() })
      .eq("id", todayMainline.id)
      .eq("user_id", currentUser.id);

    if (error) {
      alert("更新主線失敗：" + error.message);
      return;
    }

    showToast("🎯 已換成今日主線");

  } else {

    const { error } = await db
      .from("mainlines")
      .insert({
        user_id: currentUser.id,
        main_date: getToday(),
        title: idea.content
      });

    if (error) {
      alert("設定主線失敗：" + error.message);
      return;
    }

    showToast("🎯 已設為今日主線");

  }


  await setIdeaStatus(ideaId, "done");

  await loadMainline();

  showPage("today");

}


/* ---------- 📍 長期目標管理 ---------- */

function isGoalManagerOpen() {

  const modal = document.getElementById("modal");

  return Boolean(
    modal &&
    modal.style.display !== "none" &&
    modal.dataset.kind === "goals"
  );

}


function openGoalManager() {

  openModal({
    title: "📍 長期目標",
    bodyHtml: "",
    buttons: [{ label: "關閉", className: "btn" }]
  });

  document.getElementById("modal").dataset.kind = "goals";

  renderGoalManager();

  setTimeout(() => {
    const input = document.getElementById("goal-new-title");
    if (input && goals.length === 0) input.focus();
  }, 30);

}


function renderGoalManager() {

  const body = document.getElementById("modal-body");

  if (!body) return;

  const ordered = [
    ...goals.filter(goal => goal.status === "active"),
    ...goals.filter(goal => goal.status !== "active")
  ];

  const rows = ordered
    .map(goal => {

      const id = Number(goal.id);
      const stat = goalStats[id] || { days: 0, done: 0 };
      const active = goal.status === "active";

      return `
        <div class="manage-row ${active ? "" : "muted"}">
          <div class="manage-main">
            <strong>${active ? "📍" : "🏆"} ${escapeHtml(goal.title)}</strong>
            <div class="small-note">
              ${active ? "進行中" : "已達成"}・已推進 ${stat.days} 天（完成 ${stat.done} 天）
            </div>
          </div>
          <div class="manage-actions">
            <button class="icon-btn" onclick="toggleGoalDone(${id})">
              ${active ? "🏆 達成" : "↩ 恢復"}
            </button>
            <button class="icon-btn" title="改名" onclick="renameGoal(${id})">✏️</button>
            <button class="icon-btn" title="刪除" onclick="deleteGoal(${id})">🗑️</button>
          </div>
        </div>
      `;

    })
    .join("");


  body.innerHTML = `

    ${rows || `<p class="small-note">長期目標是大方向，例如：研究所考試、多益 800、完成專題。每天的主線可以選它屬於哪個目標。</p>`}

    <div class="manage-add">
      <input type="text" id="goal-new-title" maxlength="50"
        placeholder="新增長期目標，例如：研究所考試"
        onkeydown="if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) addGoal()">
      <button class="btn btn-primary" onclick="addGoal()">＋ 新增</button>
    </div>

  `;

}


async function addGoal() {

  const input = document.getElementById("goal-new-title");
  const title = input ? input.value.trim() : "";

  if (!title) {
    if (input) input.focus();
    return;
  }

  const { error } = await db
    .from("goals")
    .insert({ user_id: currentUser.id, title, status: "active" });

  if (error) {
    alert("新增失敗：" + error.message);
    return;
  }

  await loadMainline();

}


async function renameGoal(id) {

  const goal = findGoal(id);

  if (!goal) return;

  const answer = prompt("修改長期目標名稱：", goal.title);

  if (answer === null) return;

  const title = answer.trim();

  if (!title) {
    alert("名稱不能是空的");
    return;
  }

  const { error } = await db
    .from("goals")
    .update({ title })
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("修改失敗：" + error.message);
    return;
  }

  await loadMainline();

}


async function toggleGoalDone(id) {

  const goal = findGoal(id);

  if (!goal) return;

  const finishing = goal.status === "active";

  const { error } = await db
    .from("goals")
    .update({
      status: finishing ? "done" : "active",
      done_at: finishing ? new Date().toISOString() : null
    })
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("更新失敗：" + error.message);
    return;
  }

  if (finishing) showToast(`🏆 恭喜達成「${goal.title}」！`);

  await loadMainline();

}


async function deleteGoal(id) {

  const goal = findGoal(id);

  if (!goal) return;

  const ok = confirm(
    `刪除長期目標「${goal.title}」？\n\n` +
    "過去的主線紀錄會保留，只是不再標示屬於這個目標。\n" +
    "如果是已經完成了，建議按「🏆 達成」。"
  );

  if (!ok) return;

  const { error } = await db
    .from("goals")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("刪除失敗：" + error.message);
    return;
  }

  await loadMainline();

}


/* =========================================================
   M4. 給 HTML onclick 使用
========================================================= */

Object.assign(window, {

  toggleAddTaskPanel,

  /* 倒數 */
  openCountdownManager,
  addCountdown,
  startCountdownEdit,
  cancelCountdownEdit,
  saveCountdownEdit,
  toggleCountdownVisible,
  deleteCountdown,

  /* 主線 */
  setMainline,
  reuseLastMainline,
  editMainline,
  toggleMainlineDone,
  startFocusFromMainline,
  setMainlineFromIdea,

  /* 長期目標 */
  openGoalManager,
  addGoal,
  renameGoal,
  toggleGoalDone,
  deleteGoal

});


console.log("✅ 倒數 / 主線 / 長期目標 載入完成");


/* #########################################################
   ⑥ 習慣追蹤：📅 今日習慣 / 🗓️ 習慣月曆 / 補打卡
######################################################### */


/* =========================================================
   H0. 狀態與小工具
========================================================= */

const HABIT_EXAMPLES = ["早起", "背單字", "喝水", "閱讀", "運動", "睡前整理"];

/* 連續天數最多往回算多久（也是載入打卡紀錄的範圍） */
const HABIT_HISTORY_DAYS = 400;

let habits = [];
let habitLogSet = new Set();        // "habitId|2026-10-09"
let habitMakeupSet = new Set();     // 補打卡的那幾筆
let morningDoneSet = new Set();     // 晨間全部完成的日子（從獎勵紀錄來）
let habitEditing = false;

let habitCalendarOpen = true;     // 在「📊 紀錄」頁，預設打開
let habitCalendarMonth = null;      // "2026-10"


/* 2026-10-09 → 1（一）… 7（日） */
function weekdayOf(dateText) {

  const [y, m, d] = dateText.split("-").map(Number);

  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  return weekday === 0 ? 7 : weekday;

}


/* 照「每天 / 每週幾」規則，這天要不要做 */
function habitScheduledByRule(habit, dateText) {

  if (habit.repeat_type === "weekly") {

    return (habit.repeat_days || [])
      .map(Number)
      .includes(weekdayOf(dateText));

  }

  return true;

}


function habitKey(habitId, dateText) {

  return `${Number(habitId)}|${dateText}`;

}


function isHabitDone(habitId, dateText) {

  return habitLogSet.has(habitKey(habitId, dateText));

}


/* 🔥 連續天數：今天還沒打卡不算斷，過了今天才算 */
function habitStreak(habit) {

  const today = getToday();

  let streak = 0;

  for (let i = 0; i < HABIT_HISTORY_DAYS; i++) {

    const day = shiftDate(today, -i);

    if (!habitScheduledByRule(habit, day)) continue;

    if (isHabitDone(habit.id, day)) {

      streak += 1;

    } else if (day === today) {

      continue;

    } else {

      break;

    }

  }

  return streak;

}


function getTodayHabits() {

  const today = getToday();

  return habits.filter(habit =>
    habit.active &&
    habitScheduledByRule(habit, today)
  );

}


function getHabitStats() {

  const today = getToday();
  const list = getTodayHabits();

  return {
    done: list.filter(habit => isHabitDone(habit.id, today)).length,
    total: list.length
  };

}


/* 晨間打卡從哪一天開始有（月曆的「🌅 晨間啟動」從這天算起） */
function getMorningStartDate() {

  if (!morningItems || morningItems.length === 0) return null;

  return morningItems
    .map(item => toTaipeiDate(item.created_at))
    .sort()[0];

}


/* =========================================================
   H1. 載入
========================================================= */

async function loadHabits() {

  if (!currentUser) return;

  const from = shiftDate(getToday(), -HABIT_HISTORY_DAYS);

  const [habitsResult, logsResult, morningResult] = await Promise.all([

    db
      .from("habits")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),

    db
      .from("habit_logs")
      .select("habit_id, log_date, is_makeup")
      .eq("user_id", currentUser.id)
      .gte("log_date", from)
      .limit(5000),

    db
      .from("reward_events")
      .select("reward_date")
      .eq("user_id", currentUser.id)
      .like("source_key", "morning:%")
      .gte("reward_date", from)
      .limit(1000)

  ]);


  const error = habitsResult.error || logsResult.error;

  if (error) {

    console.error("習慣載入失敗：", error);

    document.getElementById("habits-list").innerHTML = `
      <div class="empty-state">❌ 習慣載入失敗：${escapeHtml(error.message)}</div>
    `;

    return;

  }


  habits = habitsResult.data || [];

  habitLogSet = new Set();
  habitMakeupSet = new Set();

  (logsResult.data || []).forEach(log => {

    const key = habitKey(log.habit_id, log.log_date);

    habitLogSet.add(key);

    if (log.is_makeup) habitMakeupSet.add(key);

  });


  morningDoneSet = new Set(
    morningResult.error
      ? []
      : (morningResult.data || []).map(row => row.reward_date)
  );


  renderHabits();

  if (habitCalendarOpen) renderHabitCalendar();

}


/* =========================================================
   H2. 📅 今日習慣
========================================================= */

function describeHabitRule(habit) {

  return describeRepeatRule({
    repeat_type: habit.repeat_type,
    repeat_days: habit.repeat_days
  });

}


function renderHabits() {

  /* 📊 紀錄頁的習慣圖表也跟著更新 */
  scheduleHabitCharts();

  const list = document.getElementById("habits-list");

  if (!list) return;


  const { done, total } = getHabitStats();

  document.getElementById("habits-progress-text").textContent =
    `${done} / ${total}`;

  document.getElementById("habits-edit-btn").textContent =
    habitEditing ? "✅ 完成" : "✏️ 管理習慣";


  if (habitEditing) {

    renderHabitEditor(list);

    return;

  }


  /* 還沒有任何習慣 */

  if (habits.length === 0) {

    list.innerHTML = `
      <div class="empty-state" style="padding:20px;">
        想養成什麼習慣？點一下就加入（之後可以改）
      </div>
      <div class="chip-row" style="justify-content:center;">
        ${HABIT_EXAMPLES
          .map(title => `
            <button class="chip" onclick="addHabitQuick('${title}')">＋ ${title}</button>
          `)
          .join("")}
        <button class="chip" onclick="toggleHabitEdit()">✏️ 自己新增</button>
      </div>
    `;

    return;

  }


  const today = getToday();
  const todayList = getTodayHabits();


  if (todayList.length === 0) {

    list.innerHTML = `
      <div class="empty-state">今天沒有排定的習慣 🎉</div>
    `;

    return;

  }


  list.innerHTML = todayList
    .map(habit => {

      const id = Number(habit.id);
      const checked = isHabitDone(id, today);
      const streak = habitStreak(habit);

      return `
        <label class="morning-item habit-item ${checked ? "done" : ""}">
          <input
            type="checkbox"
            ${checked ? "checked" : ""}
            onchange="toggleHabitToday(${id}, this.checked, this)"
          >
          <span class="habit-title">${escapeHtml(habit.title)}</span>
          <span class="habit-meta">
            ${streak > 0 ? `<span class="streak">🔥 ${streak} 天</span>` : ""}
            <span class="small-note">${describeHabitRule(habit)}</span>
          </span>
        </label>
      `;

    })
    .join("") + `
      <div class="reward-hint">
        🎁 當天打卡每個 +5 EXP / +3 金幣・沒打到的日子可以到「📊 紀錄 → 🗓️ 習慣月曆」補打卡（不給獎勵，連續天數照算）
      </div>
    `;

}


async function toggleHabitToday(habitId, checked, checkbox) {

  if (checkbox) checkbox.disabled = true;

  const ok = await setHabitLog(habitId, getToday(), checked);

  if (!ok && checkbox) {
    checkbox.checked = !checked;
  }

  if (checkbox) checkbox.disabled = false;

}


/*
  打卡 / 取消打卡（今天或過去都用這個）
  今天的會同步獎勵；過去的是補打卡，不給獎勵
*/
async function setHabitLog(habitId, dateText, done) {

  if (!currentUser) return false;

  const today = getToday();

  let error;

  if (done) {

    ({ error } = await db
      .from("habit_logs")
      .insert({
        user_id: currentUser.id,
        habit_id: habitId,
        log_date: dateText
      }));

  } else {

    ({ error } = await db
      .from("habit_logs")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("habit_id", habitId)
      .eq("log_date", dateText));

  }


  if (error) {

    console.error("習慣打卡失敗：", error);

    alert("打卡失敗：" + error.message);

    await loadHabits();

    return false;

  }


  if (dateText === today) {

    await syncHabitReward(habitId);

  } else if (done) {

    showToast(`✅ 已補打卡 ${formatShortDate(dateText)}（不給獎勵，連續天數照算）`);

  }

  await loadHabits();

  return true;

}


async function syncHabitReward(habitId) {

  const { data, error } = await db.rpc(
    "sync_habit_reward",
    { p_habit_id: habitId }
  );

  if (error) {
    console.warn("習慣獎勵同步失敗：", error);
    return;
  }

  await afterRewardChange(
    data,
    "📅 習慣完成！+5 EXP / +3 金幣",
    "取消打卡，收回 −5 EXP / −3 金幣"
  );

}


/* =========================================================
   H3. 管理習慣
========================================================= */

function toggleHabitEdit() {

  habitEditing = !habitEditing;

  renderHabits();

  if (habitEditing) {

    const input = document.getElementById("habit-new-title");

    if (input && habits.length === 0) input.focus();

  }

}


function renderHabitEditor(list) {

  const rows = habits
    .map((habit, index) => {

      const id = Number(habit.id);

      return `
        <div class="morning-edit-row ${habit.active ? "" : "disabled"}">

          <span class="title">
            ${escapeHtml(habit.title)}
            <span class="small-note">・${describeHabitRule(habit)}${habit.active ? "" : "・暫停中"}</span>
          </span>

          <button class="icon-btn" title="上移" ${index === 0 ? "disabled" : ""}
            onclick="moveHabit(${id}, -1)">▲</button>

          <button class="icon-btn" title="下移" ${index === habits.length - 1 ? "disabled" : ""}
            onclick="moveHabit(${id}, 1)">▼</button>

          <button class="icon-btn" title="編輯" onclick="editHabit(${id})">✏️</button>

          <button class="icon-btn" onclick="toggleHabitActive(${id})">
            ${habit.active ? "暫停" : "恢復"}
          </button>

          <button class="icon-btn" title="刪除" onclick="deleteHabit(${id})">🗑️</button>

        </div>
      `;

    })
    .join("");


  const unused = HABIT_EXAMPLES.filter(
    title => !habits.some(habit => habit.title === title)
  );


  list.innerHTML = `

    ${rows}

    <div class="habit-add">

      <input type="text" id="habit-new-title" maxlength="50"
        placeholder="新增習慣，例如：每天喝 2000cc 水"
        onkeydown="if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) addHabit()">

      <select id="habit-new-type"
        onchange="document.getElementById('habit-new-days').style.display = this.value === 'weekly' ? 'block' : 'none'">
        <option value="daily">每天</option>
        <option value="weekly">每週</option>
      </select>

      <button class="btn btn-primary" onclick="addHabit()">＋ 新增</button>

    </div>

    <div id="habit-new-days" style="display:none; margin-top:10px;">
      ${weekdayPickerHtml("habit-new-days", [getTodayWeekday()])}
    </div>

    ${unused.length
      ? `<div class="chip-row" style="margin-top:12px;">
           <span class="small-note" style="align-self:center;">快速加入：</span>
           ${unused.map(title => `<button class="chip" onclick="addHabitQuick('${title}')">＋ ${title}</button>`).join("")}
         </div>`
      : ""}

    <p class="small-note" style="margin-top:10px;">
      「暫停」會先停止排程、保留紀錄；「刪除」會連過去的打卡紀錄一起刪掉。
    </p>

  `;

}


async function insertHabit(title, repeatType, repeatDays) {

  const maxOrder = habits.reduce(
    (max, habit) => Math.max(max, Number(habit.sort_order) || 0),
    0
  );

  const { error } = await db
    .from("habits")
    .insert({
      user_id: currentUser.id,
      title,
      repeat_type: repeatType,
      repeat_days: repeatType === "weekly" ? repeatDays : [],
      active: true,
      sort_order: maxOrder + 1,
      start_date: getToday()
    });

  if (error) {
    alert("新增習慣失敗：" + error.message);
    return false;
  }

  return true;

}


async function addHabit() {

  const input = document.getElementById("habit-new-title");
  const title = input ? input.value.trim() : "";

  if (!title) {
    if (input) input.focus();
    return;
  }

  const repeatType = document.getElementById("habit-new-type").value;
  const days = readWeekdayPicker("habit-new-days");

  if (repeatType === "weekly" && days.length === 0) {
    alert("每週重複至少要選一天");
    return;
  }

  if (await insertHabit(title, repeatType, days)) {

    await loadHabits();

    const next = document.getElementById("habit-new-title");
    if (next) next.focus();

  }

}


async function addHabitQuick(title) {

  if (habits.some(habit => habit.title === title)) return;

  if (await insertHabit(title, "daily", [])) {

    showToast(`📅 已加入「${title}」`);

    await loadHabits();

  }

}


function findHabit(habitId) {

  return habits.find(habit => Number(habit.id) === Number(habitId)) || null;

}


function editHabit(habitId) {

  const habit = findHabit(habitId);

  if (!habit) return;

  const weekly = habit.repeat_type === "weekly";

  openModal({

    title: "✏️ 編輯習慣",

    bodyHtml: `

      <div class="modal-field">
        <label for="habit-edit-title">習慣名稱</label>
        <input type="text" id="habit-edit-title" maxlength="50"
          value="${escapeHtml(habit.title)}">
      </div>

      <div class="modal-field">
        <label for="habit-edit-type">頻率</label>
        <select id="habit-edit-type"
          onchange="document.getElementById('habit-edit-days-field').style.display = this.value === 'weekly' ? 'block' : 'none'">
          <option value="daily" ${weekly ? "" : "selected"}>每天</option>
          <option value="weekly" ${weekly ? "selected" : ""}>每週</option>
        </select>
      </div>

      <div class="modal-field" id="habit-edit-days-field" style="display:${weekly ? "block" : "none"};">
        <label>星期（可多選）</label>
        ${weekdayPickerHtml(
          "habit-edit-days",
          weekly && (habit.repeat_days || []).length ? habit.repeat_days : [getTodayWeekday()]
        )}
      </div>

      <p class="small-note">改頻率會影響月曆上哪些日子要做，過去的打卡紀錄都會保留。</p>

    `,

    buttons: [
      { label: "取消", className: "btn" },
      { label: "儲存", className: "btn btn-primary", onClick: () => saveHabitEdit(habit) }
    ],

    focus: "#habit-edit-title"

  });

}


async function saveHabitEdit(habit) {

  const title = document.getElementById("habit-edit-title").value.trim();
  const repeatType = document.getElementById("habit-edit-type").value;
  const days = readWeekdayPicker("habit-edit-days");

  if (!title) {
    alert("名稱不能是空的");
    return false;
  }

  if (repeatType === "weekly" && days.length === 0) {
    alert("每週重複至少要選一天");
    return false;
  }

  const { error } = await db
    .from("habits")
    .update({
      title,
      repeat_type: repeatType,
      repeat_days: repeatType === "weekly" ? days : []
    })
    .eq("id", habit.id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("儲存失敗：" + error.message);
    return false;
  }

  await loadHabits();

}


async function toggleHabitActive(habitId) {

  const habit = findHabit(habitId);

  if (!habit) return;

  const { error } = await db
    .from("habits")
    .update({ active: !habit.active })
    .eq("id", habitId)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("更新失敗：" + error.message);
    return;
  }

  await loadHabits();

}


async function deleteHabit(habitId) {

  const habit = findHabit(habitId);

  if (!habit) return;

  const ok = confirm(
    `刪除習慣「${habit.title}」？\n\n` +
    "過去的打卡紀錄會一起刪掉，今天打卡拿到的獎勵也會收回。\n" +
    "只是暫時不做的話，建議用「暫停」。"
  );

  if (!ok) return;

  const { error } = await db
    .from("habits")
    .delete()
    .eq("id", habitId)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("刪除失敗：" + error.message);
    return;
  }

  /* 打卡紀錄跟著刪掉了 → 今天的獎勵也收回 */
  await syncHabitReward(habitId);

  await loadHabits();

}


async function moveHabit(habitId, direction) {

  const ordered = [...habits];

  const index = ordered.findIndex(habit => Number(habit.id) === Number(habitId));
  const target = index + direction;

  if (index < 0 || target < 0 || target >= ordered.length) return;

  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

  const updates = ordered
    .map((habit, i) => ({ habit, order: i + 1 }))
    .filter(({ habit, order }) => Number(habit.sort_order) !== order)
    .map(({ habit, order }) =>
      db
        .from("habits")
        .update({ sort_order: order })
        .eq("id", habit.id)
        .eq("user_id", currentUser.id)
    );

  const results = await Promise.all(updates);
  const failed = results.find(result => result.error);

  if (failed) alert("排序失敗：" + failed.error.message);

  await loadHabits();

}


/* =========================================================
   H4. 🗓️ 習慣月曆（月份 × 習慣）
========================================================= */

function toggleHabitCalendar() {

  habitCalendarOpen = !habitCalendarOpen;

  if (habitCalendarOpen && !habitCalendarMonth) {
    habitCalendarMonth = getToday().slice(0, 7);
  }

  document.getElementById("habit-calendar").style.display =
    habitCalendarOpen ? "block" : "none";

  document.getElementById("habit-calendar-toggle").textContent =
    habitCalendarOpen ? "收起月曆" : "展開本月月曆";

  if (habitCalendarOpen) renderHabitCalendar();

}


function shiftHabitMonth(step) {

  const [y, m] = habitCalendarMonth.split("-").map(Number);

  const date = new Date(Date.UTC(y, m - 1 + step, 1));

  const next = date.toISOString().slice(0, 7);

  if (next > getToday().slice(0, 7)) return;   // 不能看未來的月份

  habitCalendarMonth = next;

  renderHabitCalendar();

}


/*
  月曆的資料：最近 400 天的紀錄已經載入了；
  更早的月份另外去抓
*/
async function ensureHabitMonthLoaded(monthStart, monthEnd) {

  const loadedFrom = shiftDate(getToday(), -HABIT_HISTORY_DAYS);

  if (monthStart >= loadedFrom) return;

  const [logsResult, morningResult] = await Promise.all([

    db
      .from("habit_logs")
      .select("habit_id, log_date, is_makeup")
      .eq("user_id", currentUser.id)
      .gte("log_date", monthStart)
      .lte("log_date", monthEnd)
      .limit(5000),

    db
      .from("reward_events")
      .select("reward_date")
      .eq("user_id", currentUser.id)
      .like("source_key", "morning:%")
      .gte("reward_date", monthStart)
      .lte("reward_date", monthEnd)

  ]);

  (logsResult.data || []).forEach(log => {
    const key = habitKey(log.habit_id, log.log_date);
    habitLogSet.add(key);
    if (log.is_makeup) habitMakeupSet.add(key);
  });

  (morningResult.data || []).forEach(row => morningDoneSet.add(row.reward_date));

}


async function renderHabitCalendar() {

  const box = document.getElementById("habit-calendar");

  if (!box || !habitCalendarOpen) return;

  if (!habitCalendarMonth) {
    habitCalendarMonth = getToday().slice(0, 7);
  }


  const today = getToday();
  const [year, month] = habitCalendarMonth.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const dates = Array.from({ length: daysInMonth }, (_, i) =>
    `${habitCalendarMonth}-${String(i + 1).padStart(2, "0")}`
  );

  await ensureHabitMonthLoaded(dates[0], dates[dates.length - 1]);


  /* ---------- 表頭 ---------- */

  const head = dates
    .map(date => {

      const day = Number(date.slice(8));
      const wd = weekdayOf(date);

      return `
        <th class="${date === today ? "is-today" : ""} ${wd >= 6 ? "weekend" : ""}">
          ${day}<span class="wd">${WEEKDAY_LABELS[wd]}</span>
        </th>
      `;

    })
    .join("");


  /* ---------- 🌅 晨間啟動（自動，不能補） ---------- */

  let morningRow = "";

  const morningStart = getMorningStartDate();

  if (morningStart) {

    let due = 0;
    let done = 0;

    const cells = dates
      .map(date => {

        if (date > today || date < morningStart) return `<td></td>`;

        if (morningDoneSet.has(date)) {
          due += 1;
          done += 1;
          return `<td class="cell done">✓</td>`;
        }

        if (date === today) return `<td class="cell pending">·</td>`;

        due += 1;

        return `<td class="cell miss">✕</td>`;

      })
      .join("");

    morningRow = `
      <tr class="auto-row">
        <th class="habit-name">🌅 晨間啟動<span class="small-note">自動</span></th>
        ${cells}
        <td class="rate">${due ? Math.round((done / due) * 100) + "%" : "—"}</td>
      </tr>
    `;

  }


  /* ---------- 每個習慣 ---------- */

  const habitRows = habits
    .map(habit => {

      const id = Number(habit.id);

      let due = 0;
      let done = 0;

      const cells = dates
        .map(date => {

          if (date > today || !habitScheduledByRule(habit, date)) {
            return `<td></td>`;
          }

          const key = habitKey(id, date);
          const logged = habitLogSet.has(key);
          const label = formatShortDate(date);

          if (logged) {

            due += 1;
            done += 1;

            const makeup = habitMakeupSet.has(key);

            return `
              <td class="cell ${makeup ? "makeup" : "done"} clickable"
                title="${label}${makeup ? " 補打卡" : " 已完成"}（點一下取消）"
                onclick="clickHabitCell(${id}, '${date}')">${makeup ? "補" : "✓"}</td>
            `;

          }

          if (date === today) {
            return `
              <td class="cell pending clickable" title="今天，點一下打卡"
                onclick="clickHabitCell(${id}, '${date}')">○</td>
            `;
          }

          /* 開始追蹤以前、或暫停中的習慣：沒打卡留白，但一樣可以補 */
          if (date < habit.start_date || !habit.active) {
            return `
              <td class="cell blank clickable" title="${label}（點一下補打卡）"
                onclick="clickHabitCell(${id}, '${date}')"></td>
            `;
          }

          due += 1;

          return `
            <td class="cell miss clickable" title="${label} 沒打卡（點一下補打卡）"
              onclick="clickHabitCell(${id}, '${date}')">✕</td>
          `;

        })
        .join("");

      return `
        <tr class="${habit.active ? "" : "paused"}">
          <th class="habit-name">${escapeHtml(habit.title)}${habit.active ? "" : '<span class="small-note">暫停</span>'}</th>
          ${cells}
          <td class="rate">${due ? Math.round((done / due) * 100) + "%" : "—"}</td>
        </tr>
      `;

    })
    .join("");


  const isCurrentMonth = habitCalendarMonth === today.slice(0, 7);


  box.innerHTML = `

    <div class="cal-nav">
      <button class="icon-btn" onclick="shiftHabitMonth(-1)">◀</button>
      <strong>${year} 年 ${month} 月</strong>
      <button class="icon-btn" onclick="shiftHabitMonth(1)" ${isCurrentMonth ? "disabled" : ""}>▶</button>
    </div>

    ${habits.length === 0 && !morningRow
      ? `<div class="empty-state">還沒有習慣，先到上面的 📅 今日習慣 新增</div>`
      : `
        <div class="habit-cal-wrap">
          <table class="habit-cal">
            <thead>
              <tr>
                <th class="habit-name">習慣</th>
                ${head}
                <th class="rate">完成率</th>
              </tr>
            </thead>
            <tbody>
              ${morningRow}
              ${habitRows}
            </tbody>
          </table>
        </div>

        <div class="cal-legend small-note">
          ✓ 完成　補 補打卡　✕ 沒打卡（點一下就能補，不限天數）　○ 今天　空白 = 不用做
        </div>
      `}

  `;

}


async function clickHabitCell(habitId, dateText) {

  const habit = findHabit(habitId);

  if (!habit) return;

  const today = getToday();
  const done = isHabitDone(habitId, dateText);


  if (done) {

    const ok = confirm(
      `取消「${habit.title}」${formatShortDate(dateText)} 的打卡？` +
      (dateText === today ? "\n（今天的獎勵會收回）" : "")
    );

    if (!ok) return;

    await setHabitLog(habitId, dateText, false);

    return;

  }


  await setHabitLog(habitId, dateText, true);

}


/* =========================================================
   H5. 給 HTML onclick 使用
========================================================= */

Object.assign(window, {

  toggleHabitToday,
  toggleHabitEdit,
  addHabit,
  addHabitQuick,
  editHabit,
  toggleHabitActive,
  deleteHabit,
  moveHabit,

  toggleHabitCalendar,
  shiftHabitMonth,
  clickHabitCell

});


console.log("✅ 習慣追蹤 載入完成");


/* #########################################################
   📄 分頁 / ⏱️ 專注編輯與補記
######################################################### */


/* =========================================================
   P1. 分頁（網址後面的 #today、#focus… 會記住目前在哪一頁）
========================================================= */

const PAGES = ["today", "tasks", "focus", "ideas", "life", "records"];


function currentPageFromHash() {

  const name = (location.hash || "").replace("#", "");

  return PAGES.includes(name) ? name : null;

}


function applyPage(name) {

  if (!PAGES.includes(name)) name = "today";

  document.querySelectorAll(".page").forEach(page => {
    page.classList.toggle("active", page.dataset.page === name);
  });

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === name);
  });

  storageSet("lastPage", name);

  /* 圖表要量寬度，切到紀錄頁才畫 */
  if (name === "records") setTimeout(() => scheduleHabitCharts(), 0);

}


function showPage(name) {

  if (!PAGES.includes(name)) return;

  if (currentPageFromHash() !== name) {

    /* 改網址 → hashchange 會切換頁面，瀏覽器的「上一頁」也能用 */
    location.hash = name;

  } else {

    applyPage(name);

  }

  window.scrollTo(0, 0);

}


window.addEventListener("hashchange", () => {

  applyPage(currentPageFromHash() || "today");

});


/* 一打開網頁就先決定在哪一頁 */
applyPage(currentPageFromHash() || storageGet("lastPage") || "today");


/* 「今日任務」的＋新增任務 → 到任務頁 */
function goToAddTask() {

  showPage("tasks");

  setTimeout(() => {
    const input = document.getElementById("new-task-title");
    if (input) input.focus();
  }, 50);

}


/* 導覽列：專注計時中顯示時間、想法收件匣數量 */
function updateNavBadges() {

  const focusLabel = document.getElementById("nav-focus-label");
  const focusBtn = document.querySelector('.tab-btn[data-page="focus"]');

  if (focusLabel && focusBtn) {

    if (typeof focusTimer !== "undefined" && focusTimer) {

      const clock = document.getElementById("focus-clock");

      focusLabel.textContent =
        (focusTimer.status === "paused" ? "⏸ " : "") +
        (clock ? clock.textContent.trim() : "專注");

      focusBtn.classList.add("running");

    } else {

      focusLabel.textContent = "專注";

      focusBtn.classList.remove("running");

    }

  }


  const ideasBadge = document.getElementById("nav-ideas-badge");

  if (ideasBadge && typeof ideas !== "undefined") {

    const inbox = ideas.filter(idea => idea.status === "inbox").length;

    ideasBadge.textContent = inbox > 0 ? String(inbox) : "";

  }

}


/* =========================================================
   P2. ⏱️ 編輯專注紀錄 / 補記
   - 今天的修改、補記：專注獎勵照算
   - 前幾天的：可以改，但不影響獎勵
========================================================= */

const FOCUS_MAX_MINUTES = 720;   // 單筆最長 12 小時


/* 2026-10-09 + 14:30 → ISO 時間（台灣時間） */
function taipeiToIso(dateText, timeText) {

  return new Date(`${dateText}T${timeText}:00+08:00`).toISOString();

}


/* ISO → 台灣時間 HH:MM（24 小時制） */
function isoToTaipeiTime(iso) {

  return new Date(iso).toLocaleTimeString("sv-SE", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit"
  });

}


function focusSubjectOptionsHtml(selected) {

  const subjects = [...new Set([
    ...focusKnownSubjects,
    ...(selected ? [selected] : [])
  ])];

  return subjects
    .map(subject => `
      <option value="${escapeHtml(subject)}" ${subject === selected ? "selected" : ""}>
        ${escapeHtml(subject)}
      </option>
    `)
    .join("") + `<option value="__custom__">＋ 自訂科目…</option>`;

}


/*
  sessionId 有給 → 編輯那一筆
  沒給 → 補記新的一筆
*/
function openFocusEditor(sessionId) {

  const session = sessionId
    ? focusSessions.find(row => Number(row.id) === Number(sessionId))
    : null;

  if (sessionId && !session) return;


  const today = getToday();

  const now = new Date();

  const defaultMinutes = 25;

  const defaultStart = new Date(now.getTime() - defaultMinutes * 60000);


  const subject = session
    ? session.subject
    : (document.getElementById("focus-subject").value !== "__custom__"
        ? document.getElementById("focus-subject").value
        : focusKnownSubjects[0]);

  const dateText = session ? session.session_date : today;

  const timeText = session
    ? isoToTaipeiTime(session.started_at)
    : isoToTaipeiTime(defaultStart.toISOString());

  const minutes = session
    ? Math.max(1, Math.round(Number(session.duration_seconds) / 60))
    : defaultMinutes;


  openModal({

    title: session ? "✏️ 修改專注紀錄" : "＋ 補記專注",

    bodyHtml: `

      <div class="modal-field">
        <label for="fe-subject">科目</label>
        <select id="fe-subject"
          onchange="document.getElementById('fe-custom').style.display = this.value === '__custom__' ? 'block' : 'none'">
          ${focusSubjectOptionsHtml(subject)}
        </select>
        <input type="text" id="fe-custom" maxlength="30" placeholder="輸入新科目"
          style="display:none; margin-top:8px;">
      </div>

      <div class="modal-row">

        <div class="modal-field">
          <label for="fe-date">日期</label>
          <input type="date" id="fe-date" value="${escapeHtml(dateText)}" max="${today}"
            ${session ? "disabled" : ""}>
        </div>

        <div class="modal-field">
          <label for="fe-time">開始時間</label>
          <input type="time" id="fe-time" value="${escapeHtml(timeText)}">
        </div>

      </div>

      <div class="modal-field">
        <label for="fe-minutes">專注了幾分鐘</label>
        <input type="number" id="fe-minutes" min="1" max="${FOCUS_MAX_MINUTES}" value="${minutes}">
      </div>

      <p class="small-note">
        ${session
          ? "日期不能改；要改到別天，請刪掉這筆再補記一筆。"
          : "忘記開計時器的時候用。"}
        今天的修改和補記，專注獎勵照算；前幾天的可以改，但不影響獎勵。
      </p>

    `,

    buttons: [
      { label: "取消", className: "btn" },
      {
        label: session ? "儲存" : "補記",
        className: "btn btn-primary",
        onClick: () => saveFocusEditor(session)
      }
    ],

    focus: "#fe-minutes"

  });

}


async function saveFocusEditor(session) {

  const select = document.getElementById("fe-subject");

  const subject = select.value === "__custom__"
    ? document.getElementById("fe-custom").value.trim()
    : select.value;

  const dateText = session
    ? session.session_date
    : document.getElementById("fe-date").value;

  const timeText = document.getElementById("fe-time").value;

  const minutes = Math.round(Number(document.getElementById("fe-minutes").value));


  /* ---------- 檢查 ---------- */

  if (!subject) {
    alert("請選擇或輸入科目");
    return false;
  }

  if (!dateText || !timeText) {
    alert("請填日期和開始時間");
    return false;
  }

  if (!(minutes >= 1 && minutes <= FOCUS_MAX_MINUTES)) {
    alert(`分鐘數要在 1～${FOCUS_MAX_MINUTES} 之間（單筆最長 12 小時）`);
    return false;
  }

  const startIso = taipeiToIso(dateText, timeText);
  const start = new Date(startIso);
  const end = new Date(start.getTime() + minutes * 60000);

  if (start.getTime() > Date.now()) {
    alert("開始時間不能是未來");
    return false;
  }

  if (end.getTime() > Date.now() + 60000) {
    alert("結束時間會超過現在，請把開始時間往前調，或把分鐘數改少");
    return false;
  }


  /* ---------- 存 ---------- */

  let error;

  if (session) {

    ({ error } = await db
      .from("focus_sessions")
      .update({
        subject,
        started_at: startIso,
        ended_at: end.toISOString(),
        duration_seconds: minutes * 60,
        edited_at: new Date().toISOString()
      })
      .eq("id", session.id)
      .eq("user_id", currentUser.id));

  } else {

    ({ error } = await db
      .from("focus_sessions")
      .insert({
        user_id: currentUser.id,
        subject,
        mode: "up",
        planned_minutes: null,
        duration_seconds: minutes * 60,
        started_at: startIso,
        ended_at: end.toISOString(),
        session_date: dateText,
        is_manual: true
      }));

  }


  if (error) {

    console.error("專注紀錄儲存失敗：", error);

    alert("儲存失敗：" + error.message);

    return false;

  }


  await loadFocus();


  /* 獎勵：只有今天的會變動（資料庫也會擋） */

  if (dateText === getToday()) {

    const reward = await syncFocusReward(dateText, true);

    const delta = reward ? Number(reward.delta_exp || 0) : 0;

    const verb = session ? "已修改" : "已補記";

    if (delta > 0) {
      showToast(`✅ ${verb}・🎁 +${delta} EXP / +${Number(reward.delta_gold || 0)} 金幣`);
    } else if (delta < 0) {
      showToast(`✅ ${verb}・專注時間變少，收回 ${delta} EXP`);
    } else {
      showToast(`✅ ${verb}：${subject} ${formatDuration(minutes * 60)}`);
    }

  } else {

    showToast(`✅ ${session ? "已修改" : "已補記"} ${formatShortDate(dateText)} ${subject} ${formatDuration(minutes * 60)}（前幾天的不影響獎勵）`);

  }

}


/* =========================================================
   P3. 給 HTML onclick 使用
========================================================= */

Object.assign(window, {
  showPage,
  goToAddTask,
  openFocusEditor
});


console.log("✅ 分頁 / 專注補記 載入完成");



/* #########################################################
   🏷️ 任務分類 / 🌿 生活（😴 作息・🍱 三餐）
######################################################### */


/* =========================================================
   C1. 🏷️ 任務分類：載入
   第一次使用會自動建立 8 個預設分類（原本的那 8 個）
========================================================= */

const CATEGORY_COLORS = [
  "#5865f2", "#4fc3f7", "#9b6cff", "#42d392", "#ff9f5a",
  "#ffd76a", "#9ca5bd", "#ff6b81", "#2dd4bf", "#f472b6"
];

const CATEGORY_EMOJIS = [
  "📚", "🔤", "🎯", "💪", "🧹", "🏠", "🌙", "🎲", "💼", "💰",
  "🎨", "🎵", "🏃", "🍳", "🛒", "✈️", "❤️", "⭐", "🧠", "📝"
];

let taskCategoriesFromDb = false;   // false = 資料庫還沒設定好，先用預設


async function loadTaskCategories() {

  if (!currentUser) return;

  const query = () => db
    .from("task_categories")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });


  let { data, error } = await query();


  /* 第一次：建立預設分類 */

  if (!error && (data || []).length === 0) {

    const rows = DEFAULT_TASK_CATEGORIES.map((category, index) => ({
      user_id: currentUser.id,
      key: category.key,
      label: category.label,
      emoji: category.emoji,
      color: category.color,
      sort_order: index + 1
    }));

    const seeded = await db
      .from("task_categories")
      .upsert(rows, { onConflict: "user_id,key", ignoreDuplicates: true });

    if (seeded.error) {
      console.warn("建立預設分類失敗：", seeded.error);
    }

    ({ data, error } = await query());

  }


  if (error || (data || []).length === 0) {

    if (error) console.warn("任務分類載入失敗（先用預設分類）：", error);

    taskCategoriesFromDb = false;

    taskCategories = DEFAULT_TASK_CATEGORIES.map(
      (category, index) => ({ ...category, sort_order: index + 1 })
    );

  } else {

    taskCategoriesFromDb = true;

    taskCategories = data;

  }


  renderCategoryControls();

}


/* 分類變了 → 新增表單的下拉選單、管理清單、今日任務（refreshLists = 任務管理也重畫） */
function renderCategoryControls(refreshLists = false) {

  const select = document.getElementById("new-task-category");

  if (select) {

    const keep = select.value;

    const exists = taskCategories.some(category => category.key === keep);

    select.innerHTML = categoryOptionsHtml(exists ? keep : null);

    select.value = exists ? keep : (taskCategories[0] ? taskCategories[0].key : "");

  }

  renderCategoryManager();

  if (refreshLists) {
    renderTasks();
    renderTaskManagement();
  }

}


/* 想要的分類不存在（被刪掉）→ 用第一個分類 */
function availableCategoryKey(preferred) {

  if (taskCategories.some(category => category.key === preferred)) return preferred;

  return taskCategories[0] ? taskCategories[0].key : preferred;

}


/* 今天的任務用到哪些分類（照分類順序，不認得的放最後） */
function categoryKeysInUse(tasks) {

  const keys = [...new Set(tasks.map(task => task.category || ""))];

  const rank = key => {
    const index = taskCategories.findIndex(category => category.key === key);
    return index === -1 ? 9999 : index;
  };

  return keys.sort((a, b) => rank(a) - rank(b));

}


/* =========================================================
   C2. 🏷️ 今日任務：分類篩選 + 分組
========================================================= */

function renderTaskCategoryFilter(presentKeys) {

  const box = document.getElementById("task-category-filter");

  if (!box) return;

  if (presentKeys.length < 2) {
    box.innerHTML = "";
    return;
  }

  const countOf = key =>
    currentTasks.filter(task => (task.category || "") === key).length;

  box.innerHTML = `
    <button class="chip ${currentTaskCategoryFilter === "all" ? "active" : ""}"
      onclick="setTaskCategoryFilter('all')">全部分類</button>
  ` + presentKeys
    .map(key => {

      const found = findCategory(key);

      return `
        <button
          class="chip cat-chip ${currentTaskCategoryFilter === key ? "active" : ""}"
          style="--cat:${safeColor(found.color)}"
          data-key="${escapeHtml(key)}"
          onclick="setTaskCategoryFilter(this.dataset.key)"
        >${escapeHtml(found.emoji)} ${escapeHtml(found.label)}<span class="chip-count">${countOf(key)}</span></button>
      `;

    })
    .join("");

}


function setTaskCategoryFilter(key) {

  currentTaskCategoryFilter =
    currentTaskCategoryFilter === key && key !== "all" ? "all" : key;

  renderTasks();

}


function renderTaskGroups(tasks, renderOne) {

  return categoryKeysInUse(tasks)
    .map(key => {

      const found = findCategory(key);

      const inGroup = tasks.filter(task => (task.category || "") === key);

      const allOfKey = currentTasks.filter(task => (task.category || "") === key);

      const done = allOfKey.filter(task => task.completed).length;

      return `
        <div class="task-group">
          <div class="task-group-head" style="--cat:${safeColor(found.color)}">
            <span>${escapeHtml(found.emoji)} ${escapeHtml(found.label)}</span>
            <span class="count">${done} / ${allOfKey.length}</span>
          </div>
          ${inGroup.map(renderOne).join("")}
        </div>
      `;

    })
    .join("");

}


/* =========================================================
   C3. 🏷️ 分類管理（📋 任務頁）
========================================================= */

function findCategoryById(id) {

  return taskCategories.find(category => Number(category.id) === Number(id)) || null;

}


function renderCategoryManager() {

  const box = document.getElementById("category-manager-list");

  if (!box) return;

  const addRow = document.getElementById("category-add-row");


  if (!taskCategoriesFromDb) {

    box.innerHTML = `
      <div class="empty-state">
        分類還沒設定好（先用預設分類）。<br>
        請到 Supabase 執行「完整設定」SQL，就可以自訂分類。
      </div>
    `;

    if (addRow) addRow.style.display = "none";

    return;

  }

  if (addRow) addRow.style.display = "";


  const todayCount = key =>
    currentTasks.filter(task => (task.category || "") === key).length;

  const repeatCount = key =>
    taskTemplates.filter(template => template.category === key).length;


  box.innerHTML = taskCategories
    .map((category, index) => {

      const notes = [];
      if (todayCount(category.key)) notes.push(`今天 ${todayCount(category.key)} 個任務`);
      if (repeatCount(category.key)) notes.push(`重複任務 ${repeatCount(category.key)} 個`);

      return `
        <div class="manage-row cat-row">

          <div class="manage-main">
            ${categoryTagHtml(category.key)}
            ${notes.length ? `<span class="small-note cat-usage">${notes.join("・")}</span>` : ""}
          </div>

          <div class="manage-actions">
            <button class="icon-btn" title="上移" ${index === 0 ? "disabled" : ""}
              onclick="moveCategory(${Number(category.id)}, -1)">▲</button>
            <button class="icon-btn" title="下移" ${index === taskCategories.length - 1 ? "disabled" : ""}
              onclick="moveCategory(${Number(category.id)}, 1)">▼</button>
            <button class="icon-btn" title="修改"
              onclick="openCategoryEditor(${Number(category.id)})">✏️</button>
            <button class="icon-btn" title="刪除" ${taskCategories.length <= 1 ? "disabled" : ""}
              onclick="openCategoryDelete(${Number(category.id)})">🗑️</button>
          </div>

        </div>
      `;

    })
    .join("");

}


/* 分類變動後：重新載入，相關畫面都更新 */
async function afterCategoryChange(reloadTasks = false) {

  await loadTaskCategories();

  if (reloadTasks) {
    await loadTasks();
    await loadTaskManagement();
  } else {
    renderTasks();
    renderTaskManagement();
  }

}


function cleanEmoji(text) {

  return Array.from(String(text || "").trim()).slice(0, 8).join("");

}


async function addCategory() {

  if (!currentUser || !taskCategoriesFromDb) return;

  const labelInput = document.getElementById("cat-new-label");
  const emojiInput = document.getElementById("cat-new-emoji");

  const label = labelInput.value.trim();
  const emoji = cleanEmoji(emojiInput.value) || "📌";

  if (!label) {
    alert("請輸入分類名稱");
    labelInput.focus();
    return;
  }

  if (label.length > 20) {
    alert("分類名稱最多 20 個字");
    return;
  }

  if (taskCategories.some(category => category.label === label)) {
    alert(`已經有「${label}」這個分類了`);
    return;
  }


  /* 顏色：先挑還沒用過的 */
  const used = new Set(taskCategories.map(category => String(category.color).toLowerCase()));
  const color = CATEGORY_COLORS.find(c => !used.has(c)) ||
    CATEGORY_COLORS[taskCategories.length % CATEGORY_COLORS.length];

  const maxOrder = taskCategories.reduce(
    (max, category) => Math.max(max, Number(category.sort_order) || 0), 0
  );


  const { error } = await db
    .from("task_categories")
    .insert({
      user_id: currentUser.id,
      key: "c" + Date.now().toString(36),
      label,
      emoji,
      color,
      sort_order: maxOrder + 1
    });

  if (error) {
    console.error("新增分類失敗：", error);
    alert("新增分類失敗：" + error.message);
    return;
  }

  labelInput.value = "";
  emojiInput.value = "";

  await afterCategoryChange();

  showToast(`🏷️ 已新增分類「${emoji} ${label}」`);

}


function openCategoryEditor(id) {

  const category = findCategoryById(id);

  if (!category) return;

  const current = safeColor(category.color).toLowerCase();

  const colors = CATEGORY_COLORS.includes(current)
    ? CATEGORY_COLORS
    : [...CATEGORY_COLORS, current];


  openModal({

    title: "✏️ 修改分類",

    bodyHtml: `

      <div class="modal-row">

        <div class="modal-field" style="flex:0 0 84px;">
          <label for="cat-emoji">圖示</label>
          <input type="text" id="cat-emoji" class="emoji-input" maxlength="8"
            value="${escapeHtml(category.emoji)}" style="width:100%;">
        </div>

        <div class="modal-field">
          <label for="cat-label">名稱</label>
          <input type="text" id="cat-label" maxlength="20" value="${escapeHtml(category.label)}">
        </div>

      </div>

      <div class="emoji-picks">
        ${CATEGORY_EMOJIS
          .map(emoji => `<button type="button" class="emoji-pick"
            onclick="document.getElementById('cat-emoji').value = this.textContent">${emoji}</button>`)
          .join("")}
      </div>

      <div class="modal-field">
        <label>顏色</label>
        <div class="color-picks">
          ${colors
            .map(color => `
              <label class="color-pick" style="--cat:${color}">
                <input type="radio" name="cat-color" value="${color}" ${color === current ? "checked" : ""}>
                <span></span>
              </label>
            `)
            .join("")}
        </div>
      </div>

    `,

    buttons: [
      { label: "取消", className: "btn" },
      {
        label: "儲存",
        className: "btn btn-primary",
        onClick: () => saveCategoryEdit(category)
      }
    ],

    focus: "#cat-label"

  });

}


async function saveCategoryEdit(category) {

  const label = document.getElementById("cat-label").value.trim();
  const emoji = cleanEmoji(document.getElementById("cat-emoji").value) || "📌";
  const picked = document.querySelector('input[name="cat-color"]:checked');
  const color = safeColor(picked ? picked.value : category.color);

  if (!label) {
    alert("請輸入分類名稱");
    return false;
  }

  if (taskCategories.some(other => other.id !== category.id && other.label === label)) {
    alert(`已經有「${label}」這個分類了`);
    return false;
  }

  const { error } = await db
    .from("task_categories")
    .update({ label, emoji, color })
    .eq("id", category.id)
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("修改分類失敗：", error);
    alert("修改分類失敗：" + error.message);
    return false;
  }

  await afterCategoryChange();

  showToast(`✅ 已更新分類「${emoji} ${label}」`);

}


function openCategoryDelete(id) {

  const category = findCategoryById(id);

  if (!category) return;

  if (taskCategories.length <= 1) {
    alert("至少要留一個分類");
    return;
  }

  const others = taskCategories.filter(other => other.key !== category.key);


  openModal({

    title: "🗑️ 刪除分類",

    bodyHtml: `

      <p>要刪除 ${categoryTagHtml(category.key)} 嗎？</p>

      <div class="modal-field">
        <label for="cat-move-to">原本是這個分類的任務（包含以前的紀錄和重複任務）改成：</label>
        <select id="cat-move-to">
          ${others
            .map(other => `<option value="${escapeHtml(other.key)}">${escapeHtml(getCategoryLabel(other.key))}</option>`)
            .join("")}
        </select>
      </div>

    `,

    buttons: [
      { label: "取消", className: "btn" },
      {
        label: "刪除",
        className: "btn btn-danger",
        onClick: () => deleteCategory(category, document.getElementById("cat-move-to").value)
      }
    ]

  });

}


async function deleteCategory(category, targetKey) {

  if (!targetKey || targetKey === category.key) return false;


  /* 先把任務搬到新分類，再刪分類 */

  for (const table of ["tasks", "task_templates"]) {

    const { error } = await db
      .from(table)
      .update({ category: targetKey })
      .eq("user_id", currentUser.id)
      .eq("category", category.key);

    if (error) {
      console.error("搬移任務分類失敗：", table, error);
      alert("搬移任務失敗：" + error.message);
      return false;
    }

  }


  const { error } = await db
    .from("task_categories")
    .delete()
    .eq("id", category.id)
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("刪除分類失敗：", error);
    alert("刪除分類失敗：" + error.message);
    return false;
  }

  if (currentTaskCategoryFilter === category.key) currentTaskCategoryFilter = "all";

  await afterCategoryChange(true);

  showToast(`🗑️ 已刪除「${category.label}」，任務改到「${findCategory(targetKey).label}」`);

}


async function moveCategory(id, direction) {

  const index = taskCategories.findIndex(category => Number(category.id) === Number(id));

  const target = index + direction;

  if (index === -1 || target < 0 || target >= taskCategories.length) return;


  const list = [...taskCategories];

  [list[index], list[target]] = [list[target], list[index]];


  /* 重新編號 1, 2, 3…，只更新有變的 */

  const changes = list
    .map((category, i) => ({ category, order: i + 1 }))
    .filter(({ category, order }) => Number(category.sort_order) !== order);

  for (const { category, order } of changes) {

    const { error } = await db
      .from("task_categories")
      .update({ sort_order: order })
      .eq("id", category.id)
      .eq("user_id", currentUser.id);

    if (error) {
      console.error("調整分類順序失敗：", error);
      alert("調整順序失敗：" + error.message);
      break;
    }

  }

  await afterCategoryChange();

}


/* =========================================================
   L0. 🌿 生活：共用
========================================================= */

/* 現在的台灣日期、時間 { date: "2026-10-09", time: "21:42" } */
function taipeiNow() {

  const text = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Taipei" });

  return { date: text.slice(0, 10), time: text.slice(11, 16) };

}


/* timestamptz → 台灣「2026-10-09 07:10」 */
function taipeiStamp(iso) {

  return new Date(iso)
    .toLocaleString("sv-SE", { timeZone: "Asia/Taipei" })
    .slice(0, 16);

}


/* "23:30:00" → "23:30" */
function trimTime(text) {

  return String(text || "").slice(0, 5);

}


/* 2026-10-08 → 10/8（四） */
function shortDateWithWeekday(dateText) {

  const [y, m, d] = dateText.split("-").map(Number);

  return `${m}/${d}（${WEEKDAY_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}）`;

}

/* =========================================================
   L1. 😴 作息
   一晚一筆（night_date = 睡覺那天的日期）：
   - 凌晨 0–6 點睡的，算前一晚
   - 起床時間 = 那一晚的隔天
   - 早睡 / 早起達標各 +10 EXP（只有昨晚、今晚的會變動）
========================================================= */

const SLEEP_DEFAULT_SETTINGS = { bed_target: "23:30", wake_target: "07:30" };

const SLEEP_TABLE_NIGHTS = 7;

let sleepLogs = [];
let sleepSettings = { ...SLEEP_DEFAULT_SETTINGS };
let sleepLoadError = null;
let sleepSaving = false;


/* 現在按「我要睡了」算哪一晚：凌晨 0–6 點 = 昨晚 */
function bedNightForNow() {

  return taipeiNow().time < "06:00" ? shiftDate(getToday(), -1) : getToday();

}


/* 今天起床 = 昨晚那一筆 */
function wakeNightForNow() {

  return shiftDate(getToday(), -1);

}


function findSleepLog(night) {

  return sleepLogs.find(row => row.night_date === night) || null;

}


/* 現在，秒數歸零（23:30:41 → 23:30，才不會顯示 23:30 卻沒達標） */
function nowToMinuteIso() {

  const now = new Date();

  now.setSeconds(0, 0);

  return now.toISOString();

}


function bedTargetStamp(night) {

  const target = trimTime(sleepSettings.bed_target);

  /* 目標在中午以前（例如 00:30）= 隔天凌晨 */
  return `${target < "12:00" ? shiftDate(night, 1) : night} ${target}`;

}


function wakeTargetStamp(night) {

  return `${shiftDate(night, 1)} ${trimTime(sleepSettings.wake_target)}`;

}


function isBedOk(log) {

  return Boolean(log && log.bed_at) && taipeiStamp(log.bed_at) <= bedTargetStamp(log.night_date);

}


function isWakeOk(log) {

  return Boolean(log && log.wake_at) && taipeiStamp(log.wake_at) <= wakeTargetStamp(log.night_date);

}


function sleepMinutes(log) {

  if (!log || !log.bed_at || !log.wake_at) return null;

  return Math.round((new Date(log.wake_at) - new Date(log.bed_at)) / 60000);

}


function formatSleepMinutes(minutes) {

  return minutes === null ? "—" : formatDuration(minutes * 60);

}


async function loadSleep() {

  if (!currentUser) return;

  const since = shiftDate(getToday(), -(SLEEP_TABLE_NIGHTS + 1));

  const [settingsResult, logsResult] = await Promise.all([

    db
      .from("user_settings")
      .select("*")
      .eq("user_id", currentUser.id)
      .maybeSingle(),

    db
      .from("sleep_logs")
      .select("*")
      .eq("user_id", currentUser.id)
      .gte("night_date", since)
      .order("night_date", { ascending: false })

  ]);


  const error = settingsResult.error || logsResult.error;

  if (error) {

    console.error("作息載入失敗：", error);

    sleepLoadError = error.message;

    renderSleep();

    return;

  }


  sleepLoadError = null;

  const settings = settingsResult.data || {};

  sleepSettings = {
    bed_target: trimTime(settings.bed_target) || SLEEP_DEFAULT_SETTINGS.bed_target,
    wake_target: trimTime(settings.wake_target) || SLEEP_DEFAULT_SETTINGS.wake_target
  };

  sleepLogs = logsResult.data || [];

  renderSleep();

}


/* 給每日結算：昨晚的作息 */
function getSleepReportStats() {

  const log = findSleepLog(wakeNightForNow());

  return {
    wakeTime: log && log.wake_at ? isoToTaipeiTime(log.wake_at) : null,
    bedTime: log && log.bed_at ? isoToTaipeiTime(log.bed_at) : null,
    minutes: sleepMinutes(log)
  };

}


function sleepReportText(report) {

  const parts = [];

  if (report.sleep_minutes !== null && report.sleep_minutes !== undefined) {
    parts.push(`😴 睡 ${formatDuration(Number(report.sleep_minutes) * 60)}`);
  } else if (report.bed_time) {
    parts.push(`🌙 ${escapeHtml(report.bed_time)} 睡`);
  }

  if (report.wake_time) {
    parts.push(`☀️ ${escapeHtml(report.wake_time)} 起`);
  }

  return parts.length ? parts.join("・") : "沒有記錄";

}


function renderSleep() {

  renderSleepQuick();

  const body = document.getElementById("sleep-body");

  if (!body) return;


  if (sleepLoadError) {

    body.innerHTML = `
      <div class="empty-state">
        ❌ 作息載入失敗：${escapeHtml(sleepLoadError)}<br>
        請到 Supabase 執行「完整設定」SQL
      </div>
    `;

    return;

  }


  const today = getToday();

  const lastNight = findSleepLog(wakeNightForNow());

  const bedNight = bedNightForNow();

  const bedLog = findSleepLog(bedNight);

  const bedTarget = trimTime(sleepSettings.bed_target);

  const wakeTarget = trimTime(sleepSettings.wake_target);


  /* 兩個大按鈕 */

  const wakeButton = lastNight && lastNight.wake_at
    ? `<button class="sleep-btn wake recorded" onclick="recordWake()">☀️ 今天 ${isoToTaipeiTime(lastNight.wake_at)} 起床 ${isWakeOk(lastNight) ? "✅" : ""}</button>`
    : `<button class="sleep-btn wake" onclick="recordWake()">☀️ 我起床了</button>`;

  const bedButton = bedLog && bedLog.bed_at
    ? `<button class="sleep-btn bed recorded" onclick="recordBed()">🌙 ${isoToTaipeiTime(bedLog.bed_at)} 上床 ${isBedOk(bedLog) ? "✅" : ""}</button>`
    : `<button class="sleep-btn bed" onclick="recordBed()">🌙 我要睡了</button>`;


  /* 昨晚 → 今天 */

  const stat = (label, value) => `
    <div class="sleep-stat">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
    </div>
  `;

  const summary = `
    <div class="sleep-stats">
      ${stat("昨晚睡覺", lastNight && lastNight.bed_at
        ? `${isoToTaipeiTime(lastNight.bed_at)}${isBedOk(lastNight) ? " ✅" : ""}` : "—")}
      ${stat("今天起床", lastNight && lastNight.wake_at
        ? `${isoToTaipeiTime(lastNight.wake_at)}${isWakeOk(lastNight) ? " ✅" : ""}` : "—")}
      ${stat("睡了", formatSleepMinutes(sleepMinutes(lastNight)))}
    </div>
  `;


  /* 最近 7 晚 */

  const nights = [];

  for (let i = 0; i < SLEEP_TABLE_NIGHTS; i++) {
    nights.push(shiftDate(today, -i));
  }

  const rows = nights
    .map(night => {

      const log = findSleepLog(night);

      const name = night === today
        ? "今晚"
        : night === shiftDate(today, -1)
        ? "昨晚"
        : shortDateWithWeekday(night);

      const marks = [];
      if (log && log.bed_at) marks.push(isBedOk(log) ? "🌙✅" : "🌙✖️");
      if (log && log.wake_at) marks.push(isWakeOk(log) ? "☀️✅" : "☀️✖️");

      const minutes = sleepMinutes(log);

      return `
        <tr class="clickable-row ${night === today ? "is-today" : ""}" title="點一下修改"
          onclick="openSleepEditor('${night}')">
          <td class="nowrap">${name}</td>
          <td class="nowrap">${log && log.bed_at ? isoToTaipeiTime(log.bed_at) : '<span class="muted">—</span>'}</td>
          <td class="nowrap">${log && log.wake_at ? isoToTaipeiTime(log.wake_at) : '<span class="muted">—</span>'}</td>
          <td class="num">${minutes === null ? '<span class="muted">—</span>' : formatSleepMinutes(minutes)}</td>
          <td class="nowrap">${marks.join(" ")}</td>
        </tr>
      `;

    })
    .join("");


  /* 平均 */

  const logs = nights.map(findSleepLog).filter(Boolean);

  const durations = logs.map(sleepMinutes).filter(m => m !== null);

  const average = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  const bedDone = logs.filter(isBedOk).length;

  const wakeDone = logs.filter(isWakeOk).length;


  body.innerHTML = `

    <div class="sleep-buttons">
      ${wakeButton}
      ${bedButton}
    </div>

    ${summary}

    <div class="reward-hint">
      🎯 目標：${bedTarget} 前睡・${wakeTarget} 前起（各 +10 EXP）
    </div>

    <h3 class="sub-title">最近 7 晚</h3>

    <div class="table-wrap">
      <table class="data-table sleep-table">
        <thead>
          <tr>
            <th>哪一晚</th>
            <th>睡覺</th>
            <th>起床</th>
            <th class="num">睡多久</th>
            <th>達標</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <p class="small-note" style="margin-top:10px;">
      ${average !== null ? `平均睡 ${formatDuration(average * 60)}・` : ""}早睡 ${bedDone} 次・早起 ${wakeDone} 次。
      點一列可以修改；凌晨 0–6 點睡的算前一晚，起床是隔天早上。
    </p>

  `;

}


/* 「今日」頁的小按鈕：晨間打卡裡的 ☀️、每日收尾裡的 🌙 */
function renderSleepQuick() {

  const wakeBox = document.getElementById("wake-quick");
  const bedBox = document.getElementById("bed-quick");

  if (sleepLoadError) {
    if (wakeBox) wakeBox.innerHTML = "";
    if (bedBox) bedBox.innerHTML = "";
    return;
  }

  const lastNight = findSleepLog(wakeNightForNow());

  if (wakeBox) {

    wakeBox.innerHTML = lastNight && lastNight.wake_at
      ? `<span class="done-text">☀️ 今天 ${isoToTaipeiTime(lastNight.wake_at)} 起床${isWakeOk(lastNight) ? " ✅" : ""}${
          sleepMinutes(lastNight) !== null ? `・昨晚睡 ${formatSleepMinutes(sleepMinutes(lastNight))}` : ""
        }</span>
        <button class="link-btn" onclick="showPage('life')">作息 →</button>`
      : `<button class="btn btn-small" onclick="recordWake()">☀️ 我起床了</button>
        <span class="small-note">記錄起床時間・${trimTime(sleepSettings.wake_target)} 前起床 +10 EXP</span>`;

  }

  const bedLog = findSleepLog(bedNightForNow());

  if (bedBox) {

    bedBox.innerHTML = bedLog && bedLog.bed_at
      ? `<span class="done-text">🌙 ${isoToTaipeiTime(bedLog.bed_at)} 上床${isBedOk(bedLog) ? " ✅" : ""}・晚安</span>
        <button class="link-btn" onclick="showPage('life')">作息 →</button>`
      : `<button class="btn btn-small" onclick="recordBed()">🌙 我要睡了</button>
        <span class="small-note">記錄上床時間・${trimTime(sleepSettings.bed_target)} 前睡 +10 EXP</span>`;

  }

}


/* 存一晚的資料（只更新有給的欄位） */
async function upsertSleepLog(night, fields) {

  const { error } = await db
    .from("sleep_logs")
    .upsert(
      { user_id: currentUser.id, night_date: night, ...fields },
      { onConflict: "user_id,night_date" }
    );

  return error;

}


/* 呼叫資料庫算早睡 / 早起獎勵；回傳結果（有 bed_delta / wake_delta） */
async function syncSleepReward(night) {

  const { data, error } = await db.rpc("sync_sleep_reward", { p_night: night });

  if (error) {
    console.warn("作息獎勵同步失敗：", error);
    return null;
  }

  await afterRewardChange(data, null, null);

  return data;

}


function sleepRewardText(result, kind) {

  if (!result) return "";

  const delta = Number(result[kind === "bed" ? "bed_delta" : "wake_delta"] || 0);

  const name = kind === "bed" ? "早睡" : "早起";

  if (delta > 0) return `・🎁 ${name}達標 +${delta} EXP`;
  if (delta < 0) return `・${name}沒達標，收回 ${delta} EXP`;

  return "";

}


/* options.auto = true：從晨間「起床」來的，已經記錄過就不動、不問 */
async function recordWake(options = {}) {

  if (!currentUser || sleepSaving) return;

  if (sleepLoadError) {
    if (!options.auto) alert("作息還沒設定好，請到 Supabase 執行「完整設定」SQL");
    return;
  }

  const night = wakeNightForNow();

  const existing = findSleepLog(night);

  /* 自動記錄只在早上 04:00～12:00（半夜或下午才勾，記下來的通常不是真的起床時間） */
  if (options.auto && (taipeiNow().time < "04:00" || taipeiNow().time >= "12:00")) return;

  if (existing && existing.wake_at) {

    if (options.auto) return;

    if (!confirm(`今天已經記錄 ${isoToTaipeiTime(existing.wake_at)} 起床，要改成現在嗎？`)) return;

  }

  const wakeIso = nowToMinuteIso();

  if (existing && existing.bed_at && new Date(wakeIso) <= new Date(existing.bed_at)) {
    if (!options.auto) alert("起床時間要比睡覺時間晚。記錯的話，可以到「🌿 生活」按 ✏️ 修改");
    return;
  }


  sleepSaving = true;

  try {

    const error = await upsertSleepLog(night, { wake_at: wakeIso });

    if (error) {
      console.error("記錄起床失敗：", error);
      if (!options.auto) alert("記錄起床失敗：" + error.message);
      return;
    }

    await loadSleep();

    const reward = await syncSleepReward(night);

    const log = findSleepLog(night);

    const slept = sleepMinutes(log);

    showToast(
      `☀️ 早安！${isoToTaipeiTime(wakeIso)} 起床` +
      (slept !== null ? `・昨晚睡了 ${formatSleepMinutes(slept)}` : "") +
      sleepRewardText(reward, "wake")
    );

  } finally {

    sleepSaving = false;

  }

}


async function recordBed() {

  if (!currentUser || sleepSaving) return;

  if (sleepLoadError) {
    alert("作息還沒設定好，請到 Supabase 執行「完整設定」SQL");
    return;
  }

  const night = bedNightForNow();

  const existing = findSleepLog(night);

  if (existing && existing.bed_at) {

    if (!confirm(`已經記錄 ${isoToTaipeiTime(existing.bed_at)} 上床，要改成現在嗎？`)) return;

  }

  const bedIso = nowToMinuteIso();

  if (existing && existing.wake_at && new Date(existing.wake_at) <= new Date(bedIso)) {
    alert("這一晚已經有起床時間了，睡覺時間要比它早。記錯的話，可以到「🌿 生活」按 ✏️ 修改");
    return;
  }


  sleepSaving = true;

  try {

    const error = await upsertSleepLog(night, { bed_at: bedIso });

    if (error) {
      console.error("記錄上床失敗：", error);
      alert("記錄上床失敗：" + error.message);
      return;
    }

    await loadSleep();

    const reward = await syncSleepReward(night);

    showToast(`🌙 晚安！${isoToTaipeiTime(bedIso)} 上床` + sleepRewardText(reward, "bed"));

  } finally {

    sleepSaving = false;

  }

}


/* ✏️ 修改 / ＋ 補填（night 沒給 = 補填，預設昨晚） */
function openSleepEditor(night) {

  if (sleepLoadError) {
    alert("作息還沒設定好，請到 Supabase 執行「完整設定」SQL");
    return;
  }

  const today = getToday();

  const fixed = Boolean(night);

  const nightText = night || shiftDate(today, -1);


  openModal({

    title: fixed ? `✏️ ${shortDateWithWeekday(nightText)} 晚上的作息` : "＋ 補填作息",

    bodyHtml: `

      <div class="modal-field">
        <label for="se-night">哪一晚（睡覺那天的日期）</label>
        <input type="date" id="se-night" value="${nightText}" max="${today}"
          ${fixed ? "disabled" : ""} onchange="fillSleepEditor()">
      </div>

      <div class="modal-row">

        <div class="modal-field">
          <label for="se-bed">🌙 睡覺時間</label>
          <input type="time" id="se-bed">
        </div>

        <div class="modal-field">
          <label for="se-wake">☀️ 起床時間（隔天）</label>
          <input type="time" id="se-wake">
        </div>

      </div>

      <p class="small-note">
        凌晨 0–6 點睡的，填 01:30 這樣就好，會自動算成隔天凌晨。
        欄位清空 = 刪掉那個時間。昨晚、今晚的修改會重新計算早睡 / 早起獎勵，更早的不影響獎勵。
      </p>

    `,

    buttons: [
      { label: "取消", className: "btn" },
      {
        label: "儲存",
        className: "btn btn-primary",
        onClick: () => saveSleepEditor()
      }
    ],

  });

  fillSleepEditor();

}


/* 換日期 → 帶入那一晚已經有的時間（才不會不小心清掉） */
function fillSleepEditor() {

  const night = document.getElementById("se-night").value;

  const log = findSleepLog(night);

  document.getElementById("se-bed").value = log && log.bed_at ? isoToTaipeiTime(log.bed_at) : "";

  document.getElementById("se-wake").value = log && log.wake_at ? isoToTaipeiTime(log.wake_at) : "";

  if (!log && night && night < shiftDate(getToday(), -(SLEEP_TABLE_NIGHTS + 1))) {

    /* 太久以前的（不在最近幾晚）→ 去資料庫讀 */
    loadOneSleepNight(night);

  }

}


async function loadOneSleepNight(night) {

  const { data, error } = await db
    .from("sleep_logs")
    .select("*")
    .eq("user_id", currentUser.id)
    .eq("night_date", night)
    .maybeSingle();

  if (error || !data) return;

  if (!findSleepLog(night)) sleepLogs.push(data);

  const input = document.getElementById("se-night");

  if (input && input.value === night) fillSleepEditor();

}


async function saveSleepEditor() {

  const today = getToday();

  const night = document.getElementById("se-night").value;

  const bedText = document.getElementById("se-bed").value;

  const wakeText = document.getElementById("se-wake").value;


  if (!night || night > today) {
    alert("請選今天或以前的日期");
    return false;
  }

  const bedIso = bedText
    ? taipeiToIso(bedText < "06:00" ? shiftDate(night, 1) : night, bedText)
    : null;

  const wakeIso = wakeText
    ? taipeiToIso(shiftDate(night, 1), wakeText)
    : null;

  if (bedIso && new Date(bedIso).getTime() > Date.now()) {
    alert("睡覺時間不能是未來");
    return false;
  }

  if (wakeIso && new Date(wakeIso).getTime() > Date.now()) {
    alert("起床時間不能是未來（起床時間是那一晚的隔天）");
    return false;
  }

  if (bedIso && wakeIso && new Date(wakeIso) <= new Date(bedIso)) {
    alert("起床時間要比睡覺時間晚");
    return false;
  }


  let error;

  if (!bedIso && !wakeIso) {

    ({ error } = await db
      .from("sleep_logs")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("night_date", night));

  } else {

    error = await upsertSleepLog(night, { bed_at: bedIso, wake_at: wakeIso });

  }

  if (error) {
    console.error("作息儲存失敗：", error);
    alert("儲存失敗：" + error.message);
    return false;
  }


  await loadSleep();

  if (night === today || night === shiftDate(today, -1)) {

    const reward = await syncSleepReward(night);

    showToast(`✅ 已儲存 ${shortDateWithWeekday(night)} 的作息` +
      sleepRewardText(reward, "bed") + sleepRewardText(reward, "wake"));

  } else {

    showToast(`✅ 已儲存 ${shortDateWithWeekday(night)} 的作息（更早的不影響獎勵）`);

  }

}


function openSleepSettings() {

  openModal({

    title: "🎯 作息目標",

    bodyHtml: `

      <div class="modal-row">

        <div class="modal-field">
          <label for="ss-bed">🌙 幾點前睡</label>
          <input type="time" id="ss-bed" value="${escapeHtml(trimTime(sleepSettings.bed_target))}">
        </div>

        <div class="modal-field">
          <label for="ss-wake">☀️ 幾點前起床</label>
          <input type="time" id="ss-wake" value="${escapeHtml(trimTime(sleepSettings.wake_target))}">
        </div>

      </div>

      <p class="small-note">
        達標各 +10 EXP。睡覺目標填 00:30 這種凌晨的時間也可以（算隔天凌晨）。
        改目標後，昨晚和今晚會用新目標重新計算。
      </p>

    `,

    buttons: [
      { label: "取消", className: "btn" },
      {
        label: "儲存",
        className: "btn btn-primary",
        onClick: () => saveSleepSettings()
      }
    ]

  });

}


async function saveSleepSettings() {

  const bed = document.getElementById("ss-bed").value;

  const wake = document.getElementById("ss-wake").value;

  if (!bed || !wake) {
    alert("兩個時間都要填");
    return false;
  }

  const { error } = await db
    .from("user_settings")
    .upsert(
      {
        user_id: currentUser.id,
        bed_target: bed,
        wake_target: wake,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("作息目標儲存失敗：", error);
    alert("儲存失敗：" + error.message);
    return false;
  }

  sleepSettings = { bed_target: bed, wake_target: wake };


  /* 用新目標重新算昨晚、今晚 */

  let delta = 0;

  for (const night of [shiftDate(getToday(), -1), getToday()]) {

    const result = await syncSleepReward(night);

    if (result) delta += Number(result.delta_exp || 0);

  }

  renderSleep();

  showToast(
    `🎯 目標：${bed} 前睡・${wake} 前起` +
    (delta > 0 ? `・🎁 +${delta} EXP` : delta < 0 ? `・收回 ${delta} EXP` : "")
  );

}


/* 晨間清單裡的「起床」 */
function isWakeMorningItem(itemId) {

  const item = morningItems.find(row => Number(row.id) === Number(itemId));

  return Boolean(item && String(item.title).includes("起床"));

}


/* =========================================================
   L2. 🍱 三餐（不算卡路里、不打分數，記下來就好）
========================================================= */

const MEAL_TYPES = [
  { key: "breakfast", label: "早餐",        emoji: "🍳" },
  { key: "lunch",     label: "午餐",        emoji: "🍱" },
  { key: "dinner",    label: "晚餐",        emoji: "🍲" },
  { key: "snack",     label: "點心 / 宵夜", emoji: "🍪" }
];

const MEAL_HISTORY_DAYS = 30;   // 「常吃的」從最近 30 天找

const MEAL_TABLE_DAYS = 7;

let mealLogs = [];
let mealLoadError = null;


function getMealType(key) {

  return MEAL_TYPES.find(type => type.key === key) || MEAL_TYPES[0];

}


function findMeal(dateText, type) {

  return mealLogs.find(row => row.log_date === dateText && row.meal_type === type) || null;

}


async function loadMeals() {

  if (!currentUser) return;

  const { data, error } = await db
    .from("meal_logs")
    .select("*")
    .eq("user_id", currentUser.id)
    .gte("log_date", shiftDate(getToday(), -(MEAL_HISTORY_DAYS - 1)))
    .order("log_date", { ascending: false });

  if (error) {

    console.error("三餐載入失敗：", error);

    mealLoadError = error.message;

    renderMeals();

    return;

  }

  mealLoadError = null;

  mealLogs = data || [];

  renderMeals();

}


/* 給每日結算：三餐吃了幾餐、今天花多少 */
function getMealStats(dateText = getToday()) {

  const rows = mealLogs.filter(row => row.log_date === dateText);

  return {
    count: rows.filter(row => row.meal_type !== "snack" && !row.skipped).length,
    cost: rows.reduce((sum, row) => sum + (row.skipped ? 0 : Number(row.cost || 0)), 0)
  };

}


/* 常吃的：同一餐優先，不夠再補其他餐的 */
function frequentMeals(type) {

  const count = rows => {

    const map = new Map();

    rows
      .filter(row => !row.skipped && String(row.content || "").trim())
      .forEach(row => {
        const text = String(row.content).trim();
        map.set(text, (map.get(text) || 0) + 1);
      });

    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([text]) => text);

  };

  const same = count(mealLogs.filter(row => row.meal_type === type));

  const all = count(mealLogs);

  return [...new Set([...same, ...all])].slice(0, 8);

}


function renderMeals() {

  const body = document.getElementById("meals-body");

  const pill = document.getElementById("meals-cost-pill");

  if (!body) return;


  if (mealLoadError) {

    if (pill) pill.textContent = "";

    body.innerHTML = `
      <div class="empty-state">
        ❌ 三餐載入失敗：${escapeHtml(mealLoadError)}<br>
        請到 Supabase 執行「完整設定」SQL
      </div>
    `;

    return;

  }


  const today = getToday();

  const stats = getMealStats(today);

  if (pill) pill.textContent = `今天 $${stats.cost}`;


  /* 今天的四格 */

  const slots = MEAL_TYPES
    .map(type => {

      const meal = findMeal(today, type.key);

      const state = !meal ? "empty" : meal.skipped ? "skipped" : "";

      const info = [];
      if (meal && meal.eaten_at && !meal.skipped) info.push(trimTime(meal.eaten_at));
      if (meal && meal.cost !== null && meal.cost !== undefined && !meal.skipped) info.push(`$${Number(meal.cost)}`);

      const content = !meal
        ? "＋ 記錄"
        : meal.skipped
        ? "🚫 沒吃"
        : escapeHtml(meal.content || "（沒寫內容）");

      return `
        <button class="meal-slot ${state}" onclick="openMealEditor('${type.key}')">
          <span class="meal-slot-head">
            <span>${type.emoji} ${type.label}</span>
            <span>${info.join("・")}</span>
          </span>
          <span class="meal-slot-content">${content}</span>
        </button>
      `;

    })
    .join("");


  /* 最近 7 天 */

  const days = [];

  for (let i = 0; i < MEAL_TABLE_DAYS; i++) days.push(shiftDate(today, -i));

  const cell = (dateText, typeKey) => {

    const meal = findMeal(dateText, typeKey);

    const text = !meal ? '<span class="muted">—</span>'
      : meal.skipped ? "🚫"
      : escapeHtml(meal.content || "✔");

    const title = meal && !meal.skipped ? ` title="${escapeHtml(meal.content || "")}"` : "";

    return `<td class="meal-cell"${title} onclick="openMealEditor('${typeKey}', '${dateText}')">${text}</td>`;

  };

  const rows = days
    .map(dateText => {

      const dayCost = getMealStats(dateText).cost;

      return `
        <tr class="${dateText === today ? "is-today" : ""}">
          <td class="nowrap">${dateText === today ? "今天" : shortDateWithWeekday(dateText)}</td>
          ${MEAL_TYPES.map(type => cell(dateText, type.key)).join("")}
          <td class="num">${dayCost > 0 ? `$${dayCost}` : '<span class="muted">—</span>'}</td>
        </tr>
      `;

    })
    .join("");

  const weekCost = days.reduce((sum, dateText) => sum + getMealStats(dateText).cost, 0);


  body.innerHTML = `

    <div class="meal-slots">${slots}</div>

    <p class="small-note" style="margin-top:10px;">
      今天吃了 ${stats.count} / 3 餐${stats.cost > 0 ? `・花了 $${stats.cost}` : ""}。點一格就能記錄或修改。
    </p>

    <h3 class="sub-title">最近 7 天</h3>

    <div class="table-wrap">
      <table class="data-table meal-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>早餐</th>
            <th>午餐</th>
            <th>晚餐</th>
            <th>點心</th>
            <th class="num">花費</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    ${weekCost > 0 ? `<p class="small-note" style="margin-top:10px;">這 7 天三餐共花 $${weekCost}</p>` : ""}

  `;

}


/* type / dateText 沒給 = 「＋ 補記」：預設今天、下一個還沒記的餐 */
function openMealEditor(type, dateText) {

  if (mealLoadError) {
    alert("三餐還沒設定好，請到 Supabase 執行「完整設定」SQL");
    return;
  }

  const today = getToday();

  const day = dateText || today;

  const mealType = type ||
    (MEAL_TYPES.find(item => !findMeal(day, item.key)) || MEAL_TYPES[0]).key;


  openModal({

    title: "🍱 記錄三餐",

    bodyHtml: `

      <div class="modal-row">

        <div class="modal-field">
          <label for="me-date">日期</label>
          <input type="date" id="me-date" value="${day}" max="${today}" onchange="fillMealEditor()">
        </div>

        <div class="modal-field">
          <label for="me-type">哪一餐</label>
          <select id="me-type" onchange="fillMealEditor()">
            ${MEAL_TYPES
              .map(item => `<option value="${item.key}" ${item.key === mealType ? "selected" : ""}>${item.emoji} ${item.label}</option>`)
              .join("")}
          </select>
        </div>

      </div>

      <div class="modal-field">
        <label class="check-line">
          <input type="checkbox" id="me-skipped" onchange="updateMealSkipped()">
          🚫 這餐沒吃
        </label>
      </div>

      <div class="modal-field">
        <label for="me-content">吃了什麼</label>
        <input type="text" id="me-content" maxlength="200" placeholder="例如：蛋餅＋豆漿">
      </div>

      <div class="meal-chips" id="me-chips"></div>

      <div class="modal-row">

        <div class="modal-field">
          <label for="me-time">幾點吃</label>
          <input type="time" id="me-time">
        </div>

        <div class="modal-field">
          <label for="me-cost">花多少錢（選填）</label>
          <input type="number" id="me-cost" min="0" max="100000" step="1" inputmode="numeric" placeholder="$">
        </div>

      </div>

      <p class="small-note" id="me-note"></p>

    `,

    buttons: [
      { label: "刪除", className: "btn btn-danger", onClick: () => deleteMealFromEditor() },
      { label: "取消", className: "btn" },
      { label: "儲存", className: "btn btn-primary", onClick: () => saveMealEditor() }
    ],

    focus: "#me-content"

  });

  fillMealEditor();

}


/* 換日期或餐別 → 帶入已經記錄的內容 */
function fillMealEditor() {

  const dateText = document.getElementById("me-date").value;

  const type = document.getElementById("me-type").value;

  const meal = findMeal(dateText, type);

  const isToday = dateText === getToday();


  document.getElementById("me-skipped").checked = Boolean(meal && meal.skipped);

  document.getElementById("me-content").value = meal ? meal.content || "" : "";

  document.getElementById("me-time").value = meal && meal.eaten_at
    ? trimTime(meal.eaten_at)
    : (!meal && isToday ? taipeiNow().time : "");

  document.getElementById("me-cost").value =
    meal && meal.cost !== null && meal.cost !== undefined ? String(meal.cost) : "";

  document.getElementById("me-note").textContent = meal
    ? "這一餐已經記錄過，儲存會更新它。"
    : "";


  /* 刪除按鈕：有紀錄才顯示 */
  const deleteButton = document.querySelector("#modal-actions .btn-danger");

  if (deleteButton) deleteButton.style.display = meal ? "" : "none";


  /* 常吃的 */
  const chips = frequentMeals(type);

  document.getElementById("me-chips").innerHTML = chips.length
    ? `<span class="small-note" style="align-self:center;">常吃的：</span>` + chips
        .map(text => `<button type="button" class="chip" onclick="pickMealChip(this)">${escapeHtml(text)}</button>`)
        .join("")
    : "";

  updateMealSkipped();

}


function pickMealChip(button) {

  document.getElementById("me-content").value = button.textContent;

  document.getElementById("me-skipped").checked = false;

  updateMealSkipped();

}


function updateMealSkipped() {

  const skipped = document.getElementById("me-skipped").checked;

  ["me-content", "me-time", "me-cost"].forEach(id => {
    document.getElementById(id).disabled = skipped;
  });

  document.getElementById("me-chips").style.display = skipped ? "none" : "";

}


async function saveMealEditor() {

  const today = getToday();

  const dateText = document.getElementById("me-date").value;

  const type = document.getElementById("me-type").value;

  const skipped = document.getElementById("me-skipped").checked;

  const content = document.getElementById("me-content").value.trim();

  const timeText = document.getElementById("me-time").value;

  const costText = document.getElementById("me-cost").value.trim();


  if (!dateText || dateText > today) {
    alert("請選今天或以前的日期");
    return false;
  }

  if (!skipped && !content) {
    alert("寫一下吃了什麼，或勾「這餐沒吃」");
    return false;
  }

  let cost = null;

  if (!skipped && costText !== "") {

    cost = Number(costText);

    if (!Number.isInteger(cost) || cost < 0 || cost > 100000) {
      alert("金額要是 0～100000 的整數");
      return false;
    }

  }


  const { error } = await db
    .from("meal_logs")
    .upsert(
      {
        user_id: currentUser.id,
        log_date: dateText,
        meal_type: type,
        content: skipped ? "" : content,
        eaten_at: skipped || !timeText ? null : timeText,
        skipped,
        cost
      },
      { onConflict: "user_id,log_date,meal_type" }
    );

  if (error) {
    console.error("三餐儲存失敗：", error);
    alert("儲存失敗：" + error.message);
    return false;
  }

  await loadMeals();

  const item = getMealType(type);

  const when = dateText === today ? "" : `${shortDateWithWeekday(dateText)} `;

  showToast(skipped
    ? `✅ 已記錄 ${when}${item.label}：沒吃`
    : `${item.emoji} 已記錄 ${when}${item.label}：${content}${cost !== null ? `（$${cost}）` : ""}`);

}


async function deleteMealFromEditor() {

  const dateText = document.getElementById("me-date").value;

  const type = document.getElementById("me-type").value;

  const meal = findMeal(dateText, type);

  if (!meal) return;

  if (!confirm(`刪除 ${shortDateWithWeekday(dateText)} 的${getMealType(type).label}紀錄？`)) return false;

  const { error } = await db
    .from("meal_logs")
    .delete()
    .eq("id", meal.id)
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("三餐刪除失敗：", error);
    alert("刪除失敗：" + error.message);
    return false;
  }

  await loadMeals();

  showToast(`🗑️ 已刪除${getMealType(type).label}紀錄`);

}


console.log("✅ 任務分類 / 生活（作息・三餐）載入完成");



/* #########################################################
   📈 習慣圖表 / 🎴 每日抽籤
######################################################### */


/* =========================================================
   V0. 圖表共用（SVG 自己畫，不用外部套件）
========================================================= */

const VIZ = {
  surface: "#181c26",
  accent: "#3987e5",
  accentWash: "rgba(57, 135, 229, .14)",
  context: "#6b7385",
  good: "#0ca30c",
  warning: "#fab219",
  track: "#343b4d",
  grid: "#2a3040",
  axis: "#3a4152",
  muted: "#8a93a8",
  ink: "#e6e9f2"
};


/* 0.8 → "80%" */
function pct(ratio) {

  return ratio === null || ratio === undefined ? "—" : `${Math.round(ratio * 100)}%`;

}


/* 滑過去 / 點一下顯示數字（[data-tip] 都適用） */
function vizTipElement() {

  let tip = document.getElementById("viz-tip");

  if (!tip) {
    tip = document.createElement("div");
    tip.id = "viz-tip";
    tip.className = "viz-tip";
    document.body.appendChild(tip);
  }

  return tip;

}


function showVizTip(target, x, y) {

  const tip = vizTipElement();

  tip.textContent = target.getAttribute("data-tip");

  tip.classList.add("show");

  const box = tip.getBoundingClientRect();

  const left = Math.min(Math.max(8, x - box.width / 2), window.innerWidth - box.width - 8);

  const top = y - box.height - 14 < 8 ? y + 18 : y - box.height - 14;

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;

}


function hideVizTip() {

  const tip = document.getElementById("viz-tip");

  if (tip) tip.classList.remove("show");

}


document.addEventListener("pointermove", event => {

  const target = event.target.closest && event.target.closest("[data-tip]");

  if (target) {
    showVizTip(target, event.clientX, event.clientY);
  } else if (event.pointerType === "mouse") {
    hideVizTip();
  }

});

document.addEventListener("pointerdown", event => {

  const target = event.target.closest && event.target.closest("[data-tip]");

  if (target) {
    showVizTip(target, event.clientX, event.clientY);
  } else {
    hideVizTip();
  }

});

document.addEventListener("focusin", event => {

  const target = event.target.closest && event.target.closest("[data-tip]");

  if (!target) return;

  const box = target.getBoundingClientRect();

  showVizTip(target, box.left + box.width / 2, box.top);

});

document.addEventListener("focusout", hideVizTip);

window.addEventListener("scroll", hideVizTip, { passive: true });


/*
  🕸️ 雷達圖
  axes: ["閱讀", …]、series: [{ name, values: [0~1 或 null], color, wash, tips: [...] }]
*/
function svgRadar(axes, series) {

  const W = 320, H = 270, cx = 160, cy = 132, R = 92;

  const n = axes.length;

  const point = (i, ratio) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(angle) * R * ratio, cy + Math.sin(angle) * R * ratio];
  };

  const ring = ratio => axes.map((_, i) => point(i, ratio).map(v => v.toFixed(1)).join(",")).join(" ");

  let out = `<svg class="viz-svg radar" viewBox="0 0 ${W} ${H}" role="img">`;

  /* 格線（25 / 50 / 75 / 100%）和放射線 */
  [0.25, 0.5, 0.75, 1].forEach(r => {
    out += `<polygon points="${ring(r)}" fill="none" stroke="${VIZ.grid}" stroke-width="1"/>`;
  });

  axes.forEach((_, i) => {
    const [x, y] = point(i, 1);
    out += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${VIZ.grid}" stroke-width="1"/>`;
  });


  /* 軸名稱 */
  axes.forEach((label, i) => {
    const [x, y] = point(i, 1.17);
    const anchor = Math.abs(x - cx) < 6 ? "middle" : x > cx ? "start" : "end";
    const short = Array.from(label).length > 6 ? Array.from(label).slice(0, 6).join("") + "…" : label;
    out += `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}" class="viz-label">${escapeHtml(short)}</text>`;
  });

  /* 資料（後面的畫在下面：先畫對照組） */
  [...series].reverse().forEach(item => {

    const pts = item.values.map((v, i) => point(i, Math.max(0, Math.min(1, v || 0))));

    out += `<polygon points="${pts.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ")}"
      fill="${item.wash || "none"}" stroke="${item.color}" stroke-width="2" stroke-linejoin="round"/>`;

    pts.forEach(([x, y], i) => {
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${item.color}"
        stroke="${VIZ.surface}" stroke-width="2"/>`;
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" fill="transparent" tabindex="0"
        data-tip="${escapeHtml(item.tips ? item.tips[i] : `${axes[i]}：${pct(item.values[i])}`)}"/>`;
    });

  });

  return out + `</svg>`;

}


/*
  📈 折線圖（0~100%）
  labels: ["9/22", …]、values: [0~1 或 null]、tips: [...]
*/
function svgLine(labels, values, tips, width) {

  const W = Math.max(280, Math.round(width)), H = 200;

  const left = 38, right = 40, top = 14, bottom = 28;

  const plotW = W - left - right, plotH = H - top - bottom;

  const n = labels.length;

  const x = i => left + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));

  const y = v => top + plotH * (1 - v);

  let out = `<svg class="viz-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">`;

  /* 格線 0 / 50 / 100% */
  [0, 0.5, 1].forEach(v => {
    out += `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? VIZ.axis : VIZ.grid}" stroke-width="1"/>`;
    out += `<text x="${left - 6}" y="${y(v) + 4}" text-anchor="end" class="viz-tick">${v * 100}%</text>`;
  });

  /* x 軸：太擠就隔幾個顯示 */
  const every = Math.ceil(n / Math.max(2, Math.floor(plotW / 46)));

  labels.forEach((label, i) => {
    if (i % every !== 0 && i !== n - 1) return;
    out += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="viz-tick">${escapeHtml(label)}</text>`;
  });

  /* 線（沒有資料的週斷開） */
  const segments = [];
  let current = [];

  values.forEach((v, i) => {
    if (v === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push([x(i), y(v)]);
    }
  });

  if (current.length) segments.push(current);

  segments.forEach(seg => {
    const line = seg.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
    if (seg.length > 1) {
      out += `<path d="${line} L${seg[seg.length - 1][0].toFixed(1)},${y(0)} L${seg[0][0].toFixed(1)},${y(0)} Z" fill="${VIZ.accentWash}"/>`;
    }
    out += `<path d="${line}" fill="none" stroke="${VIZ.accent}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (seg.length === 1) {
      out += `<circle cx="${seg[0][0]}" cy="${seg[0][1]}" r="4" fill="${VIZ.accent}"/>`;
    }
  });

  /* 最後一個點 + 數字 */
  const lastIndex = values.map(v => v !== null).lastIndexOf(true);

  if (lastIndex >= 0) {
    out += `<circle cx="${x(lastIndex)}" cy="${y(values[lastIndex])}" r="4.5" fill="${VIZ.accent}" stroke="${VIZ.surface}" stroke-width="2"/>`;
    out += `<text x="${x(lastIndex) + 8}" y="${y(values[lastIndex]) + 4}" class="viz-value">${pct(values[lastIndex])}</text>`;
  }

  /* 滑過去：直線 + 數字 */
  const band = n === 1 ? plotW : plotW / (n - 1);

  values.forEach((v, i) => {
    out += `<g class="viz-hover">
      <line x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${y(0)}" stroke="${VIZ.muted}" stroke-width="1"/>
      <rect x="${(x(i) - band / 2).toFixed(1)}" y="${top}" width="${band.toFixed(1)}" height="${plotH}"
        fill="transparent" tabindex="0" data-tip="${escapeHtml(tips[i])}"/>
    </g>`;
  });

  return out + `</svg>`;

}


/*
  📊 直條圖
  labels、values（數字）、max、format(v)、tips
*/
function svgBars(labels, values, max, format, tips, width) {

  const W = Math.max(280, Math.round(width)), H = 190;

  const left = 38, right = 12, top = 22, bottom = 28;

  const plotW = W - left - right, plotH = H - top - bottom;

  const n = labels.length;

  const slot = plotW / n;

  const barW = Math.min(24, slot - 6);

  const y = v => top + plotH * (1 - (max ? v / max : 0));

  let out = `<svg class="viz-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">`;

  [0, 0.5, 1].forEach(r => {
    const v = max * r;
    out += `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" stroke="${r === 0 ? VIZ.axis : VIZ.grid}" stroke-width="1"/>`;
    out += `<text x="${left - 6}" y="${y(v) + 4}" text-anchor="end" class="viz-tick">${escapeHtml(format(v))}</text>`;
  });

  const best = values.reduce((bi, v, i) => (v !== null && (bi === -1 || v > values[bi]) ? i : bi), -1);

  labels.forEach((label, i) => {

    const cx = left + slot * i + slot / 2;

    const v = values[i];

    out += `<text x="${cx}" y="${H - 8}" text-anchor="middle" class="viz-tick">${escapeHtml(label)}</text>`;

    if (v !== null && v > 0) {

      const x0 = cx - barW / 2, x1 = cx + barW / 2;
      const yTop = y(v), yBase = y(0);
      const r = Math.min(4, (yBase - yTop) / 2, barW / 2);

      out += `<path d="M${x0},${yBase} L${x0},${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} L${x1 - r},${yTop} Q${x1},${yTop} ${x1},${yTop + r} L${x1},${yBase} Z"
        fill="${VIZ.accent}"/>`;

      if (i === best) {
        out += `<text x="${cx}" y="${yTop - 6}" text-anchor="middle" class="viz-value">${escapeHtml(format(v))}</text>`;
      }

    }

    out += `<rect x="${(left + slot * i).toFixed(1)}" y="${top}" width="${slot.toFixed(1)}" height="${plotH}"
      fill="transparent" tabindex="0" class="viz-hit" data-tip="${escapeHtml(tips[i])}"/>`;

  });

  return out + `</svg>`;

}


/*
  🍩 甜甜圈（部分 / 整體）
  segments: [{ label, value, color, icon }]，中間顯示 centerText / centerLabel
*/
function svgDonut(segments, centerText, centerLabel) {

  const size = 168, c = size / 2, r = 64, stroke = 18;

  const total = segments.reduce((sum, s) => sum + s.value, 0);

  const circumference = 2 * Math.PI * r;

  const visible = segments.filter(s => s.value > 0);

  const gap = visible.length > 1 ? 2 : 0;

  let offset = 0;

  let out = `<svg class="viz-svg donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">`;

  out += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${VIZ.track}" stroke-width="${stroke}" opacity="${total ? 0 : 1}"/>`;

  visible.forEach(s => {

    const length = (s.value / total) * circumference;

    const drawn = Math.max(0, length - gap);

    out += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}"
      stroke-dasharray="${drawn.toFixed(2)} ${(circumference - drawn).toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${c} ${c})"
      tabindex="0" data-tip="${escapeHtml(`${s.icon} ${s.label}：${s.value} 天（${Math.round((s.value / total) * 100)}%）`)}"/>`;

    offset += length;

  });

  out += `<text x="${c}" y="${c + 4}" text-anchor="middle" class="viz-center">${escapeHtml(centerText)}</text>`;
  out += `<text x="${c}" y="${c + 24}" text-anchor="middle" class="viz-tick">${escapeHtml(centerLabel)}</text>`;

  return out + `</svg>`;

}


/* =========================================================
   V1. 📈 習慣統計
========================================================= */

const HABIT_CHART_WEEKS = 12;

const HABIT_CHART_DAYS = 30;

const HABIT_RADAR_MAX = 8;

let habitChartSelection = "all";   // "all" 或習慣 id

let habitChartTimer = null;


/* 這一天這個習慣的狀態：done / makeup / miss / pending（今天還沒打）/ off（不用做） */
function habitDayState(habit, dateText, today) {

  if (dateText > today) return "future";

  const key = habitKey(habit.id, dateText);

  if (habitLogSet.has(key)) return habitMakeupSet.has(key) ? "makeup" : "done";

  if (!habitScheduledByRule(habit, dateText)) return "off";

  if (dateText === today) return "pending";

  if (dateText < habit.start_date || !habit.active) return "off";

  return "miss";

}


/* 一段日期內的統計（list = 一個或多個習慣） */
function habitRangeStats(list, from, to) {

  const today = getToday();

  const result = { done: 0, makeup: 0, miss: 0 };

  for (let day = from; day <= to; day = shiftDate(day, 1)) {

    list.forEach(habit => {
      const state = habitDayState(habit, day, today);
      if (state in result) result[state] += 1;
    });

  }

  const due = result.done + result.makeup + result.miss;

  return { ...result, due, rate: due ? (result.done + result.makeup) / due : null };

}


/* 最長連續（補打卡也算；不用做的日子跳過；今天還沒打不算斷） */
function habitBestStreak(habit) {

  const today = getToday();

  let best = 0, current = 0;

  for (let i = HABIT_HISTORY_DAYS; i >= 0; i--) {

    const state = habitDayState(habit, shiftDate(today, -i), today);

    if (state === "done" || state === "makeup") {
      current += 1;
      best = Math.max(best, current);
    } else if (state === "miss") {
      current = 0;
    }

  }

  return best;

}


function habitTotalLogs(habit) {

  let count = 0;

  habitLogSet.forEach(key => {
    if (key.startsWith(`${Number(habit.id)}|`)) count += 1;
  });

  return count;

}


/* 最近 12 週，每週（一～日）的完成率 */
function habitWeeklyRates(list) {

  const today = getToday();

  const thisMonday = shiftDate(today, -(weekdayOf(today) - 1));

  const weeks = [];

  for (let w = HABIT_CHART_WEEKS - 1; w >= 0; w--) {

    const from = shiftDate(thisMonday, -7 * w);

    const to = shiftDate(from, 6) > today ? today : shiftDate(from, 6);

    const stats = habitRangeStats(list, from, to);

    weeks.push({
      label: formatShortDate(from),
      rate: stats.rate,
      tip: `${formatShortDate(from)} 那週：${stats.due ? `${pct(stats.rate)}（${stats.done + stats.makeup} / ${stats.due}）` : "沒有要做的日子"}${w === 0 ? "・本週到今天" : ""}`
    });

  }

  return weeks;

}


/* 星期一～日的完成率（最近 12 週） */
function habitWeekdayRates(list) {

  const today = getToday();

  const counts = [1, 2, 3, 4, 5, 6, 7].map(() => ({ done: 0, due: 0 }));

  for (let i = 0; i < HABIT_CHART_WEEKS * 7; i++) {

    const day = shiftDate(today, -i);

    const slot = counts[weekdayOf(day) - 1];

    list.forEach(habit => {
      const state = habitDayState(habit, day, today);
      if (state === "done" || state === "makeup") { slot.done += 1; slot.due += 1; }
      if (state === "miss") slot.due += 1;
    });

  }

  return counts.map((c, i) => ({
    label: WEEKDAY_SHORT[(i + 1) % 7],
    rate: c.due ? c.done / c.due : null,
    tip: `星期${WEEKDAY_SHORT[(i + 1) % 7]}：${c.due ? `${pct(c.done / c.due)}（${c.done} / ${c.due}）` : "不用做"}`
  }));

}


/* 最近 6 個月，每月打卡次數 */
function habitMonthlyCounts(habit) {

  const today = getToday();

  const months = [];

  for (let m = 5; m >= 0; m--) {

    const [y, mo] = today.split("-").map(Number);

    const date = new Date(Date.UTC(y, mo - 1 - m, 1));

    const key = date.toISOString().slice(0, 7);

    let count = 0;

    habitLogSet.forEach(k => {
      const [id, day] = k.split("|");
      if (Number(id) === Number(habit.id) && day.startsWith(key)) count += 1;
    });

    months.push({ label: `${date.getUTCMonth() + 1}月`, count, tip: `${date.getUTCMonth() + 1} 月：打卡 ${count} 次` });

  }

  return months;

}


/* =========================================================
   V2. 📈 習慣圖表（📊 紀錄頁）
========================================================= */

/* 習慣有變動就排一次重畫（同一輪只畫一次） */
function scheduleHabitCharts() {

  clearTimeout(habitChartTimer);

  habitChartTimer = setTimeout(renderHabitCharts, 30);

}


window.addEventListener("resize", () => {

  clearTimeout(habitChartTimer);

  habitChartTimer = setTimeout(renderHabitCharts, 150);

});


function setHabitChartSelection(value) {

  habitChartSelection = value === "all" ? "all" : Number(value);

  renderHabitCharts();

}


function vizTile(label, value, note) {

  return `
    <div class="viz-tile">
      <div class="viz-tile-label">${label}</div>
      <div class="viz-tile-value">${value}</div>
      ${note ? `<div class="viz-tile-note">${note}</div>` : ""}
    </div>
  `;

}


function vizPanel(title, sub, body, extraClass = "") {

  return `
    <div class="viz-panel ${extraClass}">
      <div class="viz-title">${title}</div>
      ${sub ? `<div class="viz-sub">${sub}</div>` : ""}
      ${body}
    </div>
  `;

}


function donutPanel(stats, title) {

  const segments = [
    { label: "當天完成", value: stats.done, color: VIZ.good, icon: "✓" },
    { label: "補打卡", value: stats.makeup, color: VIZ.warning, icon: "補" },
    { label: "沒做", value: stats.miss, color: VIZ.track, icon: "✕" }
  ];

  const legend = segments
    .map(s => `
      <div class="viz-legend-row">
        <span class="viz-swatch" style="background:${s.color}"></span>
        <span>${s.icon} ${s.label}</span>
        <strong>${s.value} 天</strong>
      </div>
    `)
    .join("");

  return vizPanel(
    title,
    `最近 ${HABIT_CHART_DAYS} 天，要做的日子共 ${stats.due} 天`,
    `<div class="viz-donut-wrap">
      ${svgDonut(segments, stats.due ? pct(stats.rate) : "—", "完成率")}
      <div class="viz-legend">${legend}</div>
    </div>`
  );

}


function renderHabitCharts() {

  const box = document.getElementById("habit-charts");

  const picker = document.getElementById("habit-chart-picker");

  if (!box || !picker) return;


  if (!habits || habits.length === 0) {

    picker.innerHTML = "";

    box.innerHTML = `
      <div class="empty-state">
        還沒有習慣。到「🏠 今日 → 📅 今日習慣」新增一個，就會開始有圖表。
      </div>
    `;

    return;

  }


  /* 頁面沒顯示時量不到寬度，等切到紀錄頁再畫 */
  const width = box.clientWidth;

  if (!width) return;


  const today = getToday();

  const from30 = shiftDate(today, -(HABIT_CHART_DAYS - 1));

  const prevFrom = shiftDate(from30, -HABIT_CHART_DAYS);

  const prevTo = shiftDate(from30, -1);


  if (habitChartSelection !== "all" && !habits.some(h => Number(h.id) === habitChartSelection)) {
    habitChartSelection = "all";
  }


  /* 上面一排：全部 / 每個習慣 */

  picker.innerHTML = [{ id: "all", title: "📊 全部習慣" }, ...habits]
    .map(h => `
      <button class="chip ${String(habitChartSelection) === String(h.id) ? "active" : ""}"
        onclick="setHabitChartSelection('${h.id}')">${escapeHtml(h.title)}${h.active === false ? "（暫停）" : ""}</button>
    `)
    .join("");


  const panelWidth = window.innerWidth > 800 ? (width - 14) / 2 : width;

  const innerWidth = Math.max(260, panelWidth - 28);

  const fullWidth = Math.max(260, width - 28);


  if (habitChartSelection === "all") {

    const list = habits.filter(h => h.active);

    const pool = list.length ? list : habits;

    const now = habitRangeStats(pool, from30, today);

    const todayStats = getHabitStats();

    const streaks = pool.map(h => ({ habit: h, streak: habitStreak(h) })).sort((a, b) => b.streak - a.streak);

    const top = streaks[0];


    /* 🕸️ 各習慣（最近 30 天 vs 前 30 天） */

    const shown = pool.slice(0, HABIT_RADAR_MAX);

    const nowRates = shown.map(h => habitRangeStats([h], from30, today));

    const prevRates = shown.map(h => habitRangeStats([h], prevFrom, prevTo));

    let compare;

    if (shown.length >= 3) {

      compare = vizPanel(
        "🕸️ 各習慣完成率",
        `最近 30 天（藍）和前 30 天（灰）比較，最外圈 = 100%${pool.length > HABIT_RADAR_MAX ? `・只顯示前 ${HABIT_RADAR_MAX} 個` : ""}`,
        `${svgRadar(shown.map(h => h.title), [
          {
            name: "最近 30 天", color: VIZ.accent, wash: VIZ.accentWash,
            values: nowRates.map(s => s.rate || 0),
            tips: shown.map((h, i) => `${h.title}：最近 30 天 ${pct(nowRates[i].rate)}（${nowRates[i].done + nowRates[i].makeup} / ${nowRates[i].due}）`)
          },
          {
            name: "前 30 天", color: VIZ.context,
            values: prevRates.map(s => s.rate || 0),
            tips: shown.map((h, i) => `${h.title}：前 30 天 ${pct(prevRates[i].rate)}（${prevRates[i].done + prevRates[i].makeup} / ${prevRates[i].due}）`)
          }
        ])}
        <div class="viz-key">
          <span><i style="background:${VIZ.accent}"></i>最近 30 天</span>
          <span><i style="background:${VIZ.context}"></i>前 30 天</span>
        </div>`
      );

    } else {

      /* 習慣少於 3 個，雷達圖看不出形狀 → 用直條 */
      compare = vizPanel(
        "📊 各習慣完成率",
        "最近 30 天（習慣有 3 個以上會變成雷達圖）",
        svgBars(
          shown.map(h => Array.from(h.title).slice(0, 5).join("")),
          nowRates.map(s => s.rate),
          1,
          v => pct(v),
          shown.map((h, i) => `${h.title}：${pct(nowRates[i].rate)}（${nowRates[i].done + nowRates[i].makeup} / ${nowRates[i].due}）`),
          innerWidth
        )
      );

    }


    const weekly = habitWeeklyRates(pool);

    const weekday = habitWeekdayRates(pool);


    box.innerHTML = `

      <div class="viz-tiles">
        ${vizTile("最近 30 天完成率", pct(now.rate), `${now.done + now.makeup} / ${now.due} 次`)}
        ${vizTile("今天", `${todayStats.done} / ${todayStats.total}`, todayStats.total && todayStats.done === todayStats.total ? "全部完成 🎉" : "")}
        ${vizTile("連續最久", top && top.streak ? `🔥 ${top.streak} 天` : "—", top && top.streak ? escapeHtml(top.habit.title) : "")}
        ${vizTile("補打卡", `${now.makeup} 次`, "最近 30 天")}
      </div>

      <div class="viz-grid">
        ${compare}
        ${donutPanel(now, "🍩 完成 / 補打卡 / 沒做")}
      </div>

      ${vizPanel("📈 每週完成率", `最近 ${HABIT_CHART_WEEKS} 週，全部習慣一起算`,
        svgLine(weekly.map(w => w.label), weekly.map(w => w.rate), weekly.map(w => w.tip), fullWidth))}

      ${vizPanel("📅 星期幾最常做到", `最近 ${HABIT_CHART_WEEKS} 週，每個星期幾的完成率`,
        svgBars(weekday.map(d => d.label), weekday.map(d => d.rate), 1, v => pct(v), weekday.map(d => d.tip), fullWidth))}

      <details class="viz-table">
        <summary>📋 看數字</summary>
        <table class="data-table">
          <thead><tr><th>習慣</th><th class="num">最近 30 天</th><th class="num">前 30 天</th><th class="num">連續</th><th class="num">最長</th><th class="num">累計</th></tr></thead>
          <tbody>
            ${habits.map(h => {
              const a = habitRangeStats([h], from30, today);
              const b = habitRangeStats([h], prevFrom, prevTo);
              return `<tr>
                <td>${escapeHtml(h.title)}${h.active ? "" : ' <span class="small-note">暫停</span>'}</td>
                <td class="num">${pct(a.rate)}</td>
                <td class="num">${pct(b.rate)}</td>
                <td class="num">${habitStreak(h)}</td>
                <td class="num">${habitBestStreak(h)}</td>
                <td class="num">${habitTotalLogs(h)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </details>

    `;

    return;

  }


  /* ---------- 單一習慣 ---------- */

  const habit = habits.find(h => Number(h.id) === habitChartSelection);

  const now = habitRangeStats([habit], from30, today);

  const prev = habitRangeStats([habit], prevFrom, prevTo);

  const weekly = habitWeeklyRates([habit]);

  const weekday = habitWeekdayRates([habit]);

  const months = habitMonthlyCounts(habit);

  const diff = now.rate !== null && prev.rate !== null
    ? Math.round((now.rate - prev.rate) * 100)
    : null;


  /* 🕸️ 星期雷達（每週只做幾天的習慣，只看要做的那幾天） */
  const days = weekday.filter(d => d.rate !== null);

  const weekdayChart = days.length >= 3
    ? svgRadar(days.map(d => `星期${d.label}`), [{
        name: "完成率", color: VIZ.accent, wash: VIZ.accentWash,
        values: days.map(d => d.rate), tips: days.map(d => d.tip)
      }])
    : svgBars(weekday.map(d => d.label), weekday.map(d => d.rate), 1, v => pct(v), weekday.map(d => d.tip), innerWidth);


  box.innerHTML = `

    <div class="viz-tiles">
      ${vizTile("目前連續", `🔥 ${habitStreak(habit)} 天`, "")}
      ${vizTile("最長連續", `${habitBestStreak(habit)} 天`, `最近 ${HABIT_HISTORY_DAYS} 天內`)}
      ${vizTile("最近 30 天", pct(now.rate),
        diff === null ? "" : diff === 0 ? "和前 30 天一樣" : `比前 30 天 ${diff > 0 ? "▲" : "▼"} ${Math.abs(diff)}%`)}
      ${vizTile("累計打卡", `${habitTotalLogs(habit)} 次`, describeHabitRule(habit))}
    </div>

    <div class="viz-grid">
      ${vizPanel("🕸️ 星期幾最常做到", `最近 ${HABIT_CHART_WEEKS} 週，最外圈 = 100%${habit.repeat_type === "weekly" ? "・只看要做的那幾天" : ""}`, weekdayChart)}
      ${donutPanel(now, "🍩 完成 / 補打卡 / 沒做")}
    </div>

    ${vizPanel("📈 每週完成率", `最近 ${HABIT_CHART_WEEKS} 週`,
      svgLine(weekly.map(w => w.label), weekly.map(w => w.rate), weekly.map(w => w.tip), fullWidth))}

    ${vizPanel("📊 每月打卡次數", "最近 6 個月（補打卡也算）",
      svgBars(months.map(m => m.label), months.map(m => m.count),
        Math.max(4, Math.ceil(Math.max(...months.map(m => m.count)) / 2) * 2), v => String(Math.round(v)), months.map(m => m.tip), fullWidth))}

    <details class="viz-table">
      <summary>📋 看數字</summary>
      <table class="data-table">
        <thead><tr><th>那一週</th><th class="num">完成率</th></tr></thead>
        <tbody>
          ${[...weekly].reverse().map(w => `<tr><td>${escapeHtml(w.label)} 起</td><td class="num">${pct(w.rate)}</td></tr>`).join("")}
        </tbody>
      </table>
    </details>

  `;

}


/* =========================================================
   F1. 🎴 每日抽籤
   - 一天一支，籤由資料庫用「帳號 + 日期」決定（重新整理、重抽都一樣）
   - 抽了就有 EXP：大吉 +20、中吉 +15、小吉 +12、吉 +10、末吉 +8、逆風 +25（逆襲補給）
   - 籤詩、宜忌、幸運色…由同一個數字推出來，所以每次打開都一樣
========================================================= */

const FORTUNE_LEVELS = {
  great:    { name: "大吉", className: "f-great",    base: 4, note: "今天的運勢很旺，衝！" },
  good:     { name: "中吉", className: "f-good",     base: 4, note: "順風的一天，穩穩前進。" },
  small:    { name: "小吉", className: "f-small",    base: 3, note: "小小的好運，累積起來就很多。" },
  fair:     { name: "吉",   className: "f-fair",     base: 3, note: "平穩的一天，把該做的做好。" },
  late:     { name: "末吉", className: "f-late",     base: 2, note: "先苦後甘，撐過去就會變好。" },
  headwind: { name: "逆風", className: "f-headwind", base: 2, note: "逆風局，正是逆襲的時候。" }
};

const FORTUNE_POEMS = {
  great: [
    ["晨光破曉照前程", "一步一階向上行", "今日所耕皆有果", "風帆正滿好啟程", "狀態正好，今天適合挑戰最難的那件事，做了就會有回報。"],
    ["龍門在望浪推舟", "十年磨劍此時收", "莫因順境忘初志", "乘勢再登一層樓", "運勢很旺，但別鬆懈；主線做完，再多推進一步。"],
    ["春雷一響萬物生", "心定自然百事成", "手中之事專一志", "金榜題名有前程", "專注力特別好，適合讀書、準備考試、需要深度思考的事。"]
  ],
  good: [
    ["穩步前行莫心急", "水到渠成自有期", "今日多耕一寸土", "來日收成滿倉齊", "進度會比想像順，照計畫穩穩做就好。"],
    ["雲開見月路分明", "貴人相助事易成", "有疑就問莫藏著", "一句請教勝十行", "今天適合請教別人、和人合作，卡住就開口問。"],
    ["小舟輕過萬重山", "回首方知路已寬", "今日勤做三件事", "勝過空想一整天", "把任務拆小、一件一件完成，成就感會很高。"]
  ],
  small: [
    ["細水長流不會停", "點滴積累自成形", "莫嫌今日步伐小", "回頭已過幾重嶺", "進展不大也沒關係，維持習慣就是今天的勝利。"],
    ["半晴半雨好天氣", "可攻可守看心意", "先把小事收拾好", "大事自然有餘力", "先處理拖很久的小事，清出空間給重要的事。"],
    ["燈下讀書夜未眠", "莫將精力耗無邊", "早睡早起精神好", "明朝再戰更爭先", "今天的重點是照顧好精神，早點睡，明天會更好。"]
  ],
  fair: [
    ["平平穩穩過一天", "不求驚喜求安然", "守住習慣守住心", "平凡日子也是緣", "平穩的一天，把該做的做好，就是好運。"],
    ["路有轉彎莫心慌", "換個角度見陽光", "計畫生變隨機應", "留些彈性不慌忙", "可能會有臨時變化，計畫留一點彈性。"],
    ["花開需待好時節", "種子先埋土中藏", "今日耕耘人不見", "他日開花滿園香", "今天的努力不一定馬上看到成果，但都在累積。"]
  ],
  late: [
    ["先苦後甘是常情", "黎明之前夜最深", "今日稍有不順意", "晚來轉機自然臨", "開頭可能不太順，撐過上午，下午會漸入佳境。"],
    ["欲速反而事難成", "慢工細活見真功", "一次只做一件事", "心若分散易成空", "今天容易分心：一次只做一件事，手機放遠一點。"],
    ["雲遮月色暫無光", "靜待風來雲自散", "莫與他人爭長短", "照顧自己最妥當", "別跟別人比較，照自己的節奏走就好。"]
  ],
  headwind: [
    ["逆風方顯鷹飛高", "困境才知意志牢", "今日若能撐到底", "便是人生逆襲時", "今天可能比較難，但這正是逆襲的時候：完成主線就是勝利。"],
    ["風急浪高船更穩", "夜深燈暗志更堅", "一關一關慢慢過", "回頭笑看昨日難", "把目標縮到最小的一步，做完就算贏。"],
    ["烏雲壓頂莫低頭", "越是難時越要走", "今天只求不放棄", "明日自有晴空候", "今天只要求自己不放棄：完成一件任務、準時睡覺，就很棒了。"]
  ]
};

const FORTUNE_GOOD = [
  "背 30 個單字", "先做最難的任務", "開一個 25 分鐘專注", "早點上床", "整理桌面",
  "喝足 2000cc 的水", "出門走 20 分鐘", "清空想法庫", "寫下明天的主線", "讀 10 頁書",
  "和家人聊聊天", "做一件拖很久的小事", "伸展 10 分鐘", "好好吃一頓早餐", "練一回多益聽力"
];

const FORTUNE_BAD = [
  "熬夜滑手機", "同時開一堆分頁", "邊吃飯邊滑手機", "拖到最後一刻", "空腹喝咖啡",
  "跟別人比較", "把今天的事丟給明天", "睡前看短影音", "一直檢查訊息", "久坐超過 2 小時",
  "衝動購物", "自責太久"
];

const FORTUNE_COLORS = [
  { name: "紅色", hex: "#ff6b6b" }, { name: "橘色", hex: "#ff9f5a" }, { name: "金色", hex: "#ffd76a" },
  { name: "綠色", hex: "#42d392" }, { name: "青色", hex: "#2dd4bf" }, { name: "藍色", hex: "#4fc3f7" },
  { name: "紫色", hex: "#9b6cff" }, { name: "粉色", hex: "#f472b6" }, { name: "白色", hex: "#f2f4f8" },
  { name: "黑色", hex: "#2b2f3a" }
];

const FORTUNE_ASPECTS = ["📚 學業", "🎯 專注", "💪 健康", "💰 財運"];

let fortuneDraws = [];          // 最近 14 天
let fortuneLoadError = null;
let fortuneDrawing = false;


/* 用同一個數字產生一串固定的亂數（同一支籤每次打開都一樣） */
function seededRandom(seed) {

  let t = Number(seed) >>> 0;

  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };

}


/* 從資料庫的那一筆，推出整支籤的內容 */
function buildFortune(draw) {

  const level = FORTUNE_LEVELS[draw.level] || FORTUNE_LEVELS.fair;

  const random = seededRandom(draw.seed);

  const pick = list => list[Math.floor(random() * list.length)];

  const pickSome = (list, count) => {
    const copy = [...list];
    const out = [];
    while (out.length < count && copy.length) {
      out.push(copy.splice(Math.floor(random() * copy.length), 1)[0]);
    }
    return out;
  };

  const poem = pick(FORTUNE_POEMS[draw.level] || FORTUNE_POEMS.fair);

  const good = pickSome(FORTUNE_GOOD, 2);

  const bad = pickSome(FORTUNE_BAD, 2);

  const aspects = FORTUNE_ASPECTS.map(name => ({
    name,
    stars: Math.max(1, Math.min(5, level.base + Math.floor(random() * 3) - 1))
  }));

  /* 大吉至少一項五顆星；逆風至少一項是轉機（四顆星以上） */
  if (draw.level === "great" && !aspects.some(a => a.stars === 5)) {
    aspects[Math.floor(random() * aspects.length)].stars = 5;
  }

  if (draw.level === "headwind" && !aspects.some(a => a.stars >= 4)) {
    aspects[Math.floor(random() * aspects.length)].stars = 4;
  }

  return {
    level,
    levelKey: draw.level,
    poem: poem.slice(0, 4),
    meaning: poem[4],
    good,
    bad,
    aspects,
    color: pick(FORTUNE_COLORS),
    number: 1 + Math.floor(random() * 99),
    exp: Number(draw.exp || 0),
    gold: Number(draw.gold || 0)
  };

}


function todayFortune() {

  return fortuneDraws.find(row => row.draw_date === getToday()) || null;

}


async function loadFortune() {

  if (!currentUser) return;

  const { data, error } = await db
    .from("fortune_draws")
    .select("*")
    .eq("user_id", currentUser.id)
    .gte("draw_date", shiftDate(getToday(), -13))
    .order("draw_date", { ascending: false });

  if (error) {
    console.warn("抽籤紀錄載入失敗：", error);
    fortuneLoadError = error.message;
    fortuneDraws = [];
  } else {
    fortuneLoadError = null;
    fortuneDraws = data || [];
  }

  renderFortune();

}


function starsText(count) {

  return "★".repeat(count) + "☆".repeat(5 - count);

}


/* 今日頁的小卡片 */
function renderFortune() {

  const body = document.getElementById("fortune-body");

  if (!body) return;

  if (fortuneLoadError) {
    body.innerHTML = `<span class="small-note">抽籤還沒設定好，請到 Supabase 執行「完整設定」SQL</span>`;
    return;
  }

  const draw = todayFortune();

  if (!draw) {

    body.innerHTML = `
      <div class="fortune-empty">
        <span class="small-note">每天可以抽一支籤，看看今天的運勢。抽了就有 EXP（逆風最多）。</span>
        <button class="btn btn-small btn-primary" onclick="drawFortune()">🎴 抽今日籤</button>
      </div>
    `;

    return;

  }

  const f = buildFortune(draw);

  body.innerHTML = `
    <button class="fortune-summary" onclick="openFortuneDetail()">
      <span class="fortune-badge ${f.level.className}">${f.level.name}</span>
      <span class="fortune-lines">
        <span class="fortune-poem-line">「${escapeHtml(f.poem[0])}，${escapeHtml(f.poem[1])}…」</span>
        <span class="fortune-yiji">
          <span><b class="yi">宜</b>${f.good.map(escapeHtml).join("・")}</span>
          <span><b class="ji">忌</b>${f.bad.map(escapeHtml).join("・")}</span>
        </span>
      </span>
      <span class="fortune-more">看籤詩 ›</span>
    </button>
  `;

}


/* 抽籤：搖一搖 → 資料庫決定 → 打開籤詩 */
async function drawFortune() {

  if (!currentUser || fortuneDrawing) return;

  if (todayFortune()) {
    openFortuneDetail();
    return;
  }

  fortuneDrawing = true;

  openModal({
    title: "🎴 今日抽籤",
    bodyHtml: `
      <div class="fortune-shaking">
        <div class="fortune-tube">🎴</div>
        <p class="small-note">搖籤中…心裡想著今天最想完成的事</p>
      </div>
    `,
    buttons: []
  });

  try {

    const [result] = await Promise.all([
      db.rpc("draw_fortune"),
      new Promise(resolve => setTimeout(resolve, 1300))
    ]);

    if (result.error) throw result.error;

    await loadFortune();

    const delta = Number(result.data && result.data.delta_exp || 0);

    if (delta !== 0) await afterRewardChange(result.data, null, null);

    openFortuneDetail(true);

    if (delta > 0) {
      showToast(`🎴 ${FORTUNE_LEVELS[result.data.level].name}！+${delta} EXP / +${Number(result.data.delta_gold || 0)} 金幣`);
    }

  } catch (error) {

    console.error("抽籤失敗：", error);

    closeModal();

    alert("抽籤失敗：" + error.message);

  } finally {

    fortuneDrawing = false;

  }

}


function openFortuneDetail(justDrawn = false) {

  const draw = todayFortune();

  if (!draw) return;

  const f = buildFortune(draw);

  const history = fortuneDraws
    .filter(row => row.draw_date !== getToday())
    .slice(0, 13)
    .map(row => {
      const level = FORTUNE_LEVELS[row.level] || FORTUNE_LEVELS.fair;
      return `<span class="fortune-history-chip ${level.className}" title="${row.draw_date}">${formatShortDate(row.draw_date)} ${level.name}</span>`;
    })
    .join("");


  openModal({

    title: justDrawn ? "🎴 抽到了！" : "🎴 今日運勢",

    bodyHtml: `

      <div class="fortune-card ${f.level.className} ${justDrawn ? "reveal" : ""}">

        <div class="fortune-level">${f.level.name}</div>

        <div class="fortune-note">${escapeHtml(f.level.note)}</div>

        <div class="fortune-poem">
          ${f.poem.map(line => `<div>${escapeHtml(line)}</div>`).join("")}
        </div>

        <div class="fortune-meaning"><b>解曰</b>${escapeHtml(f.meaning)}</div>

        <div class="fortune-aspects">
          ${f.aspects.map(a => `
            <div class="fortune-aspect">
              <span>${a.name}</span>
              <span class="stars" aria-label="${a.stars} 顆星">${starsText(a.stars)}</span>
            </div>
          `).join("")}
        </div>

        <div class="fortune-yiji-box">
          <div><b class="yi">宜</b>${f.good.map(escapeHtml).join("、")}</div>
          <div><b class="ji">忌</b>${f.bad.map(escapeHtml).join("、")}</div>
        </div>

        <div class="fortune-lucky">
          <span>幸運色 <i class="fortune-color" style="background:${f.color.hex}"></i>${f.color.name}</span>
          <span>幸運數字 <b>${f.number}</b></span>
        </div>

        <div class="fortune-reward">🎁 抽籤獎勵 +${f.exp} EXP / +${f.gold} 金幣</div>

      </div>

      ${history ? `<div class="fortune-history"><div class="small-note">最近的籤</div>${history}</div>` : ""}

      <p class="small-note" style="margin-top:10px;">每天一支，明天再來。籤只是參考，今天怎麼過還是看你自己 💪</p>

    `,

    buttons: [{ label: "好，開始今天", className: "btn btn-primary" }]

  });

}


/* 給每日結算 */
function getFortuneReportLevel() {

  const draw = todayFortune();

  return draw ? (FORTUNE_LEVELS[draw.level] || FORTUNE_LEVELS.fair).name : null;

}


Object.assign(window, {
  setHabitChartSelection,
  drawFortune,
  openFortuneDetail
});


console.log("✅ 習慣圖表 / 每日抽籤 載入完成");

