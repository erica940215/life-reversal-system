// ======================================================
// 神級人生逆襲系統
// RPG 任務系統 V3
// 與目前 HTML 完整對應
// ======================================================


// ======================================================
// 1. Supabase
// ======================================================

// 注意：HTML 已經建立 supabaseClient
// 所以這裡直接使用 HTML 的 supabaseClient

if (!window.supabaseClient) {
  console.error("❌ 找不到 supabaseClient，請確認 HTML 的 Supabase 程式碼在 script.js 前面");
}

const db = window.supabaseClient;


// ======================================================
// 2. 全域資料
// ======================================================

let currentUser = null;
let currentProfile = null;
let currentTasks = [];

let currentTaskFilter = "all";
let currentManagedFilter = "all";


// ======================================================
// 3. 網頁載入
// ======================================================

document.addEventListener("DOMContentLoaded", async function () {

  console.log("=================================");
  console.log("神級人生逆襲系統 JavaScript 載入成功");
  console.log("=================================");

  await checkSession();

});


// ======================================================
// 4. 檢查登入狀態
// ======================================================

async function checkSession() {

  try {

    const {
      data,
      error
    } = await db.auth.getSession();


    if (error) {

      console.error("取得登入狀態失敗：", error);

      showAuthMessage(
        "⚠️ 無法取得登入狀態：" + error.message
      );

      return;
    }


    currentUser = data.session
      ? data.session.user
      : null;


    if (currentUser) {

      console.log("目前已登入：", currentUser.email);

      await showLoggedInUI();

      await loadPlayer();

      await loadTasks();

      await loadTaskManagement();

    } else {

      console.log("目前沒有登入");

      showLoggedOutUI();

    }


  } catch (error) {

    console.error("Session 錯誤：", error);

    showAuthMessage(
      "❌ Session 發生錯誤"
    );

  }

}


// ======================================================
// 5. 登入
// ======================================================

window.loginUser = async function () {

  const emailInput =
    document.getElementById("email");

  const passwordInput =
    document.getElementById("password");


  const email =
    emailInput
      ? emailInput.value.trim()
      : "";

  const password =
    passwordInput
      ? passwordInput.value
      : "";


  if (!email || !password) {

    showAuthMessage(
      "⚠️ 請輸入 Email 和密碼"
    );

    return;
  }


  showAuthMessage(
    "🔄 登入中……"
  );


  try {

    const {
      data,
      error
    } = await db.auth.signInWithPassword({

      email: email,

      password: password

    });


    if (error) {

      console.error(
        "登入失敗：",
        error
      );

      showAuthMessage(
        "❌ 登入失敗：" +
        error.message
      );

      return;
    }


    currentUser = data.user;


    console.log(
      "登入成功：",
      currentUser
    );


    showAuthMessage(
      "✅ 登入成功！"
    );


    await showLoggedInUI();

    await loadPlayer();

    await loadTasks();

    await loadTaskManagement();


  } catch (error) {

    console.error(
      "登入錯誤：",
      error
    );

    showAuthMessage(
      "❌ 登入發生錯誤：" +
      error.message
    );

  }

};


// ======================================================
// 6. 註冊
// ======================================================

window.registerUser = async function () {

  const emailInput =
    document.getElementById("email");

  const passwordInput =
    document.getElementById("password");


  const email =
    emailInput
      ? emailInput.value.trim()
      : "";

  const password =
    passwordInput
      ? passwordInput.value
      : "";


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
    } = await db.auth.signUp({

      email: email,

      password: password

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

      await loadTaskManagement();


    } else {

      showAuthMessage(
        "✅ 註冊成功！請先確認 Email，再登入。"
      );

    }


  } catch (error) {

    console.error(
      "註冊錯誤：",
      error
    );

    showAuthMessage(
      "❌ 註冊發生錯誤：" +
      error.message
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
    } = await db.auth.signOut();


    if (error) {

      console.error(
        "登出失敗：",
        error
      );

      showAuthMessage(
        "❌ 登出失敗：" +
        error.message
      );

      return;
    }


    currentUser = null;

    currentProfile = null;

    currentTasks = [];


    showLoggedOutUI();

    updateSummary();

    clearTaskList();

    clearManagementList();


    console.log("已登出");


  } catch (error) {

    console.error(
      "登出錯誤：",
      error
    );

  }

};


// ======================================================
// 8. 登入 UI
// ======================================================

async function showLoggedInUI() {

  const authSection =
    document.getElementById(
      "auth-section"
    );


  const appSection =
    document.getElementById(
      "app-section"
    );


  if (authSection) {

    authSection.style.display =
      "none";

  }


  if (appSection) {

    appSection.style.display =
      "block";

  }


  const username =
    document.getElementById(
      "username"
    );


  if (
    username &&
    currentUser
  ) {

    username.textContent =
      currentUser.email;

  }

}


// ======================================================
// 9. 登出 UI
// ======================================================

function showLoggedOutUI() {

  const authSection =
    document.getElementById(
      "auth-section"
    );


  const appSection =
    document.getElementById(
      "app-section"
    );


  if (authSection) {

    authSection.style.display =
      "block";

  }


  if (appSection) {

    appSection.style.display =
      "none";

  }

}


// ======================================================
// 10. 登入訊息
// ======================================================

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


// ======================================================
// 11. 玩家資料
// ======================================================

async function loadPlayer() {

  if (!currentUser) {

    return;

  }


  try {

    const {
      data,
      error
    } = await db
      .from("profiles")
      .select("*")
      .eq(
        "id",
        currentUser.id
      )
      .single();


    if (error) {

      console.error(
        "載入玩家資料失敗：",
        error
      );

      return;

    }


    currentProfile =
      data;


    console.log(
      "玩家資料：",
      currentProfile
    );


    renderPlayer();


  } catch (error) {

    console.error(
      "玩家資料錯誤：",
      error
    );

  }

}


// ======================================================
// 12. 玩家畫面
// ======================================================

function renderPlayer() {

  if (!currentProfile) {

    return;

  }


  const level =
    Number(
      currentProfile.level || 1
    );


  const exp =
    Number(
      currentProfile.exp || 0
    );


  const gold =
    Number(
      currentProfile.gold || 0
    );


  const requiredExp =
    100 +
    (level - 1) * 50;


  // --------------------------
  // 等級
  // --------------------------

  const levelElement =
    document.getElementById(
      "player-level"
    );


  if (levelElement) {

    levelElement.textContent =
      "Lv." + level;

  }


  // --------------------------
  // EXP
  // --------------------------

  const expElement =
    document.getElementById(
      "player-exp"
    );


  if (expElement) {

    expElement.textContent =
      exp;

  }


  // --------------------------
  // Gold
  // --------------------------

  const goldElement =
    document.getElementById(
      "player-gold"
    );


  if (goldElement) {

    goldElement.textContent =
      gold;

  }


  // --------------------------
  // EXP 進度條
  // --------------------------

  const expProgress =
    document.getElementById(
      "exp-progress"
    );


  const expText =
    document.getElementById(
      "exp-text"
    );


  const percentage =
    Math.min(
      100,
      Math.max(
        0,
        (exp / requiredExp) * 100
      )
    );


  if (expProgress) {

    expProgress.style.width =
      percentage + "%";

  }


  if (expText) {

    expText.textContent =
      exp +
      " / " +
      requiredExp +
      " EXP";

  }

}


// ======================================================
// 13. 今日日期
// ======================================================

function getToday() {

  const now =
    new Date();


  const year =
    now.getFullYear();


  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );


  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );


  return (
    year +
    "-" +
    month +
    "-" +
    day
  );

}


// ======================================================
// 14. 產生今日重複任務
// ======================================================

async function generateDailyTasks() {

  if (!currentUser) {

    return;

  }


  try {

    const {
      data,
      error
    } = await db.rpc(
      "generate_daily_tasks"
    );


    if (error) {

      console.error(
        "產生今日任務失敗：",
        error
      );

      return;

    }


    console.log(
      "今日重複任務產生：",
      data
    );


  } catch (error) {

    console.error(
      "產生任務錯誤：",
      error
    );

  }

}


// ======================================================
// 15. 載入今日任務
// ======================================================

async function loadTasks() {

  if (!currentUser) {

    return;

  }


  try {

    await generateDailyTasks();


    const {
      data,
      error
    } = await db
      .from("tasks")
      .select("*")
      .eq(
        "user_id",
        currentUser.id
      )
      .eq(
        "task_date",
        getToday()
      )
      .order(
        "id",
        {
          ascending: true
        }
      );


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
      "今日任務：",
      currentTasks
    );


    renderTasks();

    updateSummary();


  } catch (error) {

    console.error(
      "任務系統錯誤：",
      error
    );

  }

}


// ======================================================
// 16. 顯示任務
// ======================================================

function renderTasks() {

  const taskList =
    document.getElementById(
      "task-list"
    );


  if (!taskList) {

    return;

  }


  taskList.innerHTML = "";


  if (currentTasks.length === 0) {

    taskList.innerHTML =
      `
      <div class="empty-state">
        今天還沒有任務
      </div>
      `;

    return;

  }


  currentTasks.forEach(
    function (task) {

      const item =
        document.createElement(
          "div"
        );


      item.className =
        "task-item";


      if (task.completed) {

        item.classList.add(
          "completed"
        );

      }


      // --------------------------
      // 任務主要內容
      // --------------------------

      const main =
        document.createElement(
          "div"
        );


      main.className =
        "task-main";


      const title =
        document.createElement(
          "div"
        );


      title.className =
        "task-title";


      title.textContent =
        task.title;


      const meta =
        document.createElement(
          "div"
        );


      meta.className =
        "task-meta";


      const category =
        document.createElement(
          "span"
        );


      category.className =
        "tag";


      category.textContent =
        getCategoryLabel(
          task.category
        );


      const difficulty =
        document.createElement(
          "span"
        );


      difficulty.className =
        "tag";


      difficulty.textContent =
        getDifficultyLabel(
          task.difficulty
        );


      const reward =
        document.createElement(
          "span"
        );


      reward.className =
        "tag";


      reward.textContent =
        "+" +
        task.exp_reward +
        " EXP / +" +
        task.gold_reward +
        " 💰";


      meta.appendChild(
        category
      );

      meta.appendChild(
        difficulty
      );

      meta.appendChild(
        reward
      );


      main.appendChild(
        title
      );

      main.appendChild(
        meta
      );


      // --------------------------
      // 按鈕
      // --------------------------

      const actions =
        document.createElement(
          "div"
        );


      actions.className =
        "task-actions";


      // 完成

      const completeButton =
        document.createElement(
          "button"
        );


      completeButton.type =
        "button";


      completeButton.textContent =
        task.completed
          ? "☑ 已完成"
          : "✓ 完成";


      completeButton.disabled =
        task.completed;


      completeButton.onclick =
        function () {

          toggleTask(
            task.id
          );

        };


      // 編輯

      const editButton =
        document.createElement(
          "button"
        );


      editButton.type =
        "button";


      editButton.textContent =
        "✏️";


      editButton.title =
        "編輯任務";


      editButton.onclick =
        function () {

          editTask(
            task.id
          );

        };


      // 刪除

      const deleteButton =
        document.createElement(
          "button"
        );


      deleteButton.type =
        "button";


      deleteButton.textContent =
        "🗑️";


      deleteButton.title =
        "刪除任務";


      deleteButton.onclick =
        function () {

          deleteTask(
            task.id
          );

        };


      actions.appendChild(
        completeButton
      );

      actions.appendChild(
        editButton
      );

      actions.appendChild(
        deleteButton
      );


      item.appendChild(
        main
      );

      item.appendChild(
        actions
      );


      taskList.appendChild(
        item
      );

    }
  );


  applyCurrentFilter();

}


// ======================================================
// 17. 類別名稱
// ======================================================

function getCategoryLabel(category) {

  const labels = {

    study: "📚 學習",

    toeic: "📝 多益",

    health: "❤️ 健康",

    focus: "🎯 專注",

    life: "🏠 生活",

    other: "📌 其他"

  };


  return (
    labels[category] ||
    "📌 其他"
  );

}


// ======================================================
// 18. 難度名稱
// ======================================================

function getDifficultyLabel(difficulty) {

  const labels = {

    easy: "🟢 簡單",

    normal: "🟡 普通",

    hard: "🔴 困難"

  };


  return (
    labels[difficulty] ||
    "🟡 普通"
  );

}


// ======================================================
// 19. 難度獎勵
// ======================================================

function getRewardByDifficulty(
  difficulty
) {

  if (
    difficulty === "easy"
  ) {

    return {

      exp: 20,

      gold: 15

    };

  }


  if (
    difficulty === "hard"
  ) {

    return {

      exp: 50,

      gold: 35

    };

  }


  return {

    exp: 30,

    gold: 20

  };

}


// ======================================================
// 20. 取得重複設定
// ======================================================

function getRepeatSettings() {

  const repeatRadio =
    document.querySelector(
      'input[name="new-task-repeat"]:checked'
    );


  if (
    !repeatRadio ||
    repeatRadio.value === "none"
  ) {

    return {

      repeatEnabled: false,

      repeatType: "none",

      repeatDays: [],

      repeatEndDate: null

    };

  }


  const typeRadio =
    document.querySelector(
      'input[name="repeat-type"]:checked'
    );


  const repeatType =
    typeRadio
      ? typeRadio.value
      : "daily";


  let repeatDays = [];


  if (
    repeatType === "weekly"
  ) {

    const checkedDays =
      document.querySelectorAll(
        'input[name="repeat-day"]:checked'
      );


    repeatDays =
      Array.from(
        checkedDays
      ).map(
        function (element) {

          return Number(
            element.value
          );

        }
      );

  }


  const endDateInput =
    document.getElementById(
      "repeat-end-date"
    );


  const repeatEndDate =
    endDateInput &&
    endDateInput.value
      ? endDateInput.value
      : null;


  return {

    repeatEnabled: true,

    repeatType,

    repeatDays,

    repeatEndDate

  };

}


// ======================================================
// 21. 新增任務
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


  const title =
    titleInput
      ? titleInput.value.trim()
      : "";


  const category =
    categoryInput
      ? categoryInput.value
      : "study";


  const difficulty =
    difficultyInput
      ? difficultyInput.value
      : "normal";


  if (!title) {

    setAddTaskMessage(
      "⚠️ 請輸入任務名稱"
    );

    return;

  }


  const reward =
    getRewardByDifficulty(
      difficulty
    );


  const repeat =
    getRepeatSettings();


  if (
    repeat.repeatEnabled &&
    repeat.repeatType === "weekly" &&
    repeat.repeatDays.length === 0
  ) {

    setAddTaskMessage(
      "⚠️ 請至少選擇一個星期"
    );

    return;

  }


  if (
    repeat.repeatEndDate &&
    repeat.repeatEndDate < getToday()
  ) {

    setAddTaskMessage(
      "⚠️ 結束日期不能早於今天"
    );

    return;

  }


  setAddTaskMessage(
    "🔄 建立任務中……"
  );


  try {

    // ==================================================
    // 重複任務
    // ==================================================

    if (
      repeat.repeatEnabled
    ) {

      const {
        data,
        error
      } = await db
        .from("task_templates")
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
            reward.exp,

          gold_reward:
            reward.gold,

          repeat_type:
            repeat.repeatType,

          repeat_days:
            repeat.repeatDays,

          repeat_enabled:
            true,

          repeat_end_date:
            repeat.repeatEndDate

        })
        .select()
        .single();


      if (error) {

        console.error(
          "建立重複任務失敗：",
          error
        );

        setAddTaskMessage(
          "❌ 建立重複任務失敗：" +
          error.message
        );

        return;

      }


      console.log(
        "重複任務建立成功：",
        data
      );


      await generateDailyTasks();

      await loadTasks();

      await loadTaskManagement();

    }

    // ==================================================
    // 一次性任務
    // ==================================================

    else {

      const {
        data,
        error
      } = await db
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
            reward.exp,

          gold_reward:
            reward.gold,

          completed:
            false,

          task_date:
            getToday(),

          repeat_type:
            "none",

          repeat_days:
            [],

          repeat_enabled:
            false,

          repeat_end_date:
            null

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


      currentTasks.push(
        data
      );


      renderTasks();

      updateSummary();

      await loadTaskManagement();

    }


    clearAddTaskForm();


    setAddTaskMessage(
      "✅ 任務建立成功！"
    );


    setTimeout(
      function () {

        setAddTaskMessage("");

      },
      3000
    );


  } catch (error) {

    console.error(
      "新增任務錯誤：",
      error
    );


    setAddTaskMessage(
      "❌ 建立任務時發生錯誤：" +
      error.message
    );

  }

};


// ======================================================
// 22. 清空新增任務表單
// ======================================================

function clearAddTaskForm() {

  const titleInput =
    document.getElementById(
      "new-task-title"
    );


  if (titleInput) {

    titleInput.value = "";

  }


  const noneRadio =
    document.querySelector(
      'input[name="new-task-repeat"][value="none"]'
    );


  if (noneRadio) {

    noneRadio.checked = true;

  }


  const repeatSettings =
    document.getElementById(
      "repeat-settings"
    );


  if (repeatSettings) {

    repeatSettings.style.display =
      "none";

  }


  const dailyRadio =
    document.querySelector(
      'input[name="repeat-type"][value="daily"]'
    );


  if (dailyRadio) {

    dailyRadio.checked = true;

  }


  const weekdaySettings =
    document.getElementById(
      "weekday-settings"
    );


  if (weekdaySettings) {

    weekdaySettings.style.display =
      "none";

  }


  document
    .querySelectorAll(
      'input[name="repeat-day"]'
    )
    .forEach(
      function (checkbox) {

        checkbox.checked =
          false;

      }
    );


  const endDateInput =
    document.getElementById(
      "repeat-end-date"
    );


  if (endDateInput) {

    endDateInput.value = "";

  }

}


// ======================================================
// 23. 新增任務訊息
// ======================================================

function setAddTaskMessage(message) {

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
// 24. 重複設定 UI
// ======================================================

window.toggleRepeatSettings =
  function () {

    const repeatRadio =
      document.querySelector(
        'input[name="new-task-repeat"]:checked'
      );


    const repeatSettings =
      document.getElementById(
        "repeat-settings"
      );


    if (
      !repeatRadio ||
      !repeatSettings
    ) {

      return;

    }


    if (
      repeatRadio.value ===
      "repeat"
    ) {

      repeatSettings.style.display =
        "block";

    } else {

      repeatSettings.style.display =
        "none";

    }

  };


// ======================================================
// 25. 每天 / 每週
// ======================================================

window.toggleWeekdaySettings =
  function () {

    const repeatType =
      document.querySelector(
        'input[name="repeat-type"]:checked'
      );


    const weekdaySettings =
      document.getElementById(
        "weekday-settings"
      );


    if (
      !repeatType ||
      !weekdaySettings
    ) {

      return;

    }


    if (
      repeatType.value ===
      "weekly"
    ) {

      weekdaySettings.style.display =
        "block";

    } else {

      weekdaySettings.style.display =
        "none";

    }

  };


// ======================================================
// 26. 編輯任務
// ======================================================

window.editTask =
  async function (taskId) {

    if (!currentUser) {

      alert(
        "⚠️ 請先登入"
      );

      return;

    }


    const task =
      currentTasks.find(
        function (item) {

          return Number(item.id) ===
            Number(taskId);

        }
      );


    if (!task) {

      alert(
        "❌ 找不到這個任務"
      );

      return;

    }


    const newTitle =
      prompt(
        "✏️ 修改任務名稱",
        task.title
      );


    if (
      newTitle === null
    ) {

      return;

    }


    const title =
      newTitle.trim();


    if (!title) {

      alert(
        "⚠️ 任務名稱不能為空"
      );

      return;

    }


    const difficultyInput =
      prompt(
        "請輸入難度：easy / normal / hard",
        task.difficulty
      );


    if (
      difficultyInput === null
    ) {

      return;

    }


    const difficulty =
      difficultyInput
        .trim()
        .toLowerCase();


    if (
      ![
        "easy",
        "normal",
        "hard"
      ].includes(difficulty)
    ) {

      alert(
        "⚠️ 難度只能是 easy / normal / hard"
      );

      return;

    }


    const reward =
      getRewardByDifficulty(
        difficulty
      );


    try {

      const {
        data,
        error
      } = await db
        .from("tasks")
        .update({

          title:
            title,

          difficulty:
            difficulty,

          exp_reward:
            reward.exp,

          gold_reward:
            reward.gold

        })
        .eq(
          "id",
          taskId
        )
        .eq(
          "user_id",
          currentUser.id
        )
        .select()
        .single();


      if (error) {

        console.error(
          "編輯任務失敗：",
          error
        );

        alert(
          "❌ 編輯失敗：" +
          error.message
        );

        return;

      }


      const index =
        currentTasks.findIndex(
          function (item) {

            return Number(item.id) ===
              Number(taskId);

          }
        );


      if (index !== -1) {

        currentTasks[index] =
          data;

      }


      renderTasks();

      updateSummary();

      await loadTaskManagement();


      alert(
        "✅ 任務修改成功！"
      );


    } catch (error) {

      console.error(
        "編輯錯誤：",
        error
      );

      alert(
        "❌ 編輯任務時發生錯誤"
      );

    }

  };


// ======================================================
// 27. 刪除任務
// ======================================================

window.deleteTask =
  async function (taskId) {

    if (!currentUser) {

      alert(
        "⚠️ 請先登入"
      );

      return;

    }


    const task =
      currentTasks.find(
        function (item) {

          return Number(item.id) ===
            Number(taskId);

        }
      );


    if (!task) {

      alert(
        "❌ 找不到這個任務"
      );

      return;

    }


    const confirmed =
      confirm(
        "確定要刪除這個任務嗎？\n\n" +
        task.title
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
        .eq(
          "id",
          taskId
        )
        .eq(
          "user_id",
          currentUser.id
        );


      if (error) {

        console.error(
          "刪除任務失敗：",
          error
        );

        alert(
          "❌ 刪除失敗：" +
          error.message
        );

        return;

      }


      currentTasks =
        currentTasks.filter(
          function (item) {

            return Number(item.id) !==
              Number(taskId);

          }
        );


      renderTasks();

      updateSummary();

      await loadTaskManagement();


      alert(
        "🗑️ 任務已刪除！"
      );


    } catch (error) {

      console.error(
        "刪除錯誤：",
        error
      );

    }

  };


// ======================================================
// 28. 完成任務
// ======================================================

window.toggleTask =
  async function (taskId) {

    if (!currentUser) {

      alert(
        "⚠️ 請先登入"
      );

      return;

    }


    const task =
      currentTasks.find(
        function (item) {

          return Number(item.id) ===
            Number(taskId);

        }
      );


    if (!task) {

      return;

    }


    if (task.completed) {

      return;

    }


    try {

      const {
        data,
        error
      } = await db.rpc(
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

        return;

      }


      if (
        !data ||
        data.success !== true
      ) {

        alert(
          data?.message ||
          "⚠️ 任務沒有完成"
        );

        return;

      }


      // 更新玩家

      if (currentProfile) {

        currentProfile.level =
          Number(data.level);

        currentProfile.exp =
          Number(data.exp);

        currentProfile.gold =
          Number(data.gold);

      }


      // 更新任務

      task.completed =
        true;


      task.completed_at =
        new Date().toISOString();


      renderPlayer();

      renderTasks();

      updateSummary();


      alert(
        "✅ 任務完成！\n\n" +
        "+" +
        data.task_exp +
        " EXP\n" +
        "+" +
        data.task_gold +
        " 💰"
      );


    } catch (error) {

      console.error(
        "完成任務錯誤：",
        error
      );

      alert(
        "❌ 完成任務時發生錯誤"
      );

    }

  };


// ======================================================
// 29. 任務篩選
// ======================================================

window.filterTasks =
  function (
    category,
    button
  ) {

    currentTaskFilter =
      category;


    const buttons =
      document.querySelectorAll(
        "#task-list ~ * .filter-btn"
      );


    document
      .querySelectorAll(
        "button"
      )
      .forEach(
        function (btn) {

          if (
            btn !== button &&
            btn.classList.contains(
              "active"
            )
          ) {

            btn.classList.remove(
              "active"
            );

          }

        }
      );


    if (button) {

      button.classList.add(
        "active"
      );

    }


    applyCurrentFilter();

  };


// ======================================================
// 30. 套用任務篩選
// ======================================================

function applyCurrentFilter() {

  const items =
    document.querySelectorAll(
      "#task-list .task-item"
    );


  items.forEach(
    function (item, index) {

      const task =
        currentTasks[index];


      if (!task) {

        return;

      }


      if (
        currentTaskFilter ===
          "all" ||
        task.category ===
          currentTaskFilter
      ) {

        item.style.display =
          "";

      } else {

        item.style.display =
          "none";

      }

    }
  );

}


// ======================================================
// 31. 今日統計
// ======================================================

function updateSummary() {

  const total =
    currentTasks.length;


  const completedTasks =
    currentTasks.filter(
      function (task) {

        return task.completed;

      }
    );


  const completedCount =
    completedTasks.length;


  const totalExp =
    completedTasks.reduce(
      function (
        sum,
        task
      ) {

        return (
          sum +
          Number(
            task.exp_reward || 0
          )
        );

      },
      0
    );


  const totalGold =
    completedTasks.reduce(
      function (
        sum,
        task
      ) {

        return (
          sum +
          Number(
            task.gold_reward || 0
          )
        );

      },
      0
    );


  const rate =
    total > 0
      ? Math.round(
          (
            completedCount /
            total
          ) *
          100
        )
      : 0;


  const countElement =
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


  if (countElement) {

    countElement.textContent =
      completedCount +
      " / " +
      total;

  }


  if (rateElement) {

    rateElement.textContent =
      rate + "%";

  }


  if (expElement) {

    expElement.textContent =
      totalExp;

  }


  if (goldElement) {

    goldElement.textContent =
      totalGold;

  }

}


// ======================================================
// 32. 清空任務
// ======================================================

function clearTaskList() {

  const taskList =
    document.getElementById(
      "task-list"
    );


  if (taskList) {

    taskList.innerHTML =
      `
      <div class="empty-state">
        尚未登入
      </div>
      `;

  }

}


// ======================================================
// 33. 任務管理
// ======================================================

async function loadTaskManagement() {

  if (!currentUser) {

    return;

  }


  const list =
    document.getElementById(
      "task-management-list"
    );


  if (!list) {

    return;

  }


  try {

    const {
      data: tasks,
      error: taskError
    } = await db
      .from("tasks")
      .select("*")
      .eq(
        "user_id",
        currentUser.id
      )
      .order(
        "id",
        {
          ascending: false
        }
      );


    if (taskError) {

      console.error(
        "載入任務管理失敗：",
        taskError
      );

      return;

    }


    const {
      data: templates,
      error: templateError
    } = await db
      .from("task_templates")
      .select("*")
      .eq(
        "user_id",
        currentUser.id
      )
      .order(
        "id",
        {
          ascending: false
        }
      );


    if (templateError) {

      console.error(
        "載入重複任務失敗：",
        templateError
      );

    }


    renderTaskManagement(
      tasks || [],
      templates || []
    );


  } catch (error) {

    console.error(
      "任務管理錯誤：",
      error
    );

  }

}


// ======================================================
// 34. 顯示任務管理
// ======================================================

function renderTaskManagement(
  tasks,
  templates
) {

  const list =
    document.getElementById(
      "task-management-list"
    );


  if (!list) {

    return;

  }


  list.innerHTML = "";


  const allItems = [];


  // 一次性任務

  tasks.forEach(
    function (task) {

      allItems.push({

        type: "once",

        id: task.id,

        title: task.title,

        category: task.category,

        difficulty: task.difficulty,

        completed: task.completed,

        data: task

      });

    }
  );


  // 重複任務

  templates.forEach(
    function (template) {

      allItems.push({

        type: "repeat",

        id: template.id,

        title: template.title,

        category: template.category,

        difficulty: template.difficulty,

        completed: false,

        data: template

      });

    }
  );


  let filtered =
    allItems;


  if (
    currentManagedFilter !==
    "all"
  ) {

    filtered =
      allItems.filter(
        function (item) {

          return (
            item.type ===
            currentManagedFilter
          );

        }
      );

  }


  if (
    filtered.length === 0
  ) {

    list.innerHTML =
      `
      <div class="empty-state">
        沒有符合條件的任務
      </div>
      `;

    return;

  }


  filtered.forEach(
    function (item) {

      const box =
        document.createElement(
          "div"
        );


      box.className =
        "management-item";


      const header =
        document.createElement(
          "div"
        );


      header.className =
        "management-header";


      const left =
        document.createElement(
          "div"
        );


      const title =
        document.createElement(
          "div"
        );


      title.className =
        "management-title";


      title.textContent =
        item.title;


      const meta =
        document.createElement(
          "div"
        );


      meta.className =
        "management-meta";


      const typeTag =
        document.createElement(
          "span"
        );


      typeTag.className =
        "tag";


      typeTag.textContent =
        item.type === "repeat"
          ? "🔁 重複任務"
          : "📌 一次性";


      const categoryTag =
        document.createElement(
          "span"
        );


      categoryTag.className =
        "tag";


      categoryTag.textContent =
        getCategoryLabel(
          item.category
        );


      const difficultyTag =
        document.createElement(
          "span"
        );


      difficultyTag.className =
        "tag";


      difficultyTag.textContent =
        getDifficultyLabel(
          item.difficulty
        );


      meta.appendChild(
        typeTag
      );

      meta.appendChild(
        categoryTag
      );

      meta.appendChild(
        difficultyTag
      );


      left.appendChild(
        title
      );

      left.appendChild(
        meta
      );


      header.appendChild(
        left
      );


      const actions =
        document.createElement(
          "div"
        );


      actions.className =
        "management-actions";


      const deleteButton =
        document.createElement(
          "button"
        );


      deleteButton.type =
        "button";


      deleteButton.textContent =
        "🗑️ 刪除";


      deleteButton.onclick =
        function () {

          deleteManagedTask(
            item
          );

        };


      actions.appendChild(
        deleteButton
      );


      box.appendChild(
        header
      );


      box.appendChild(
        actions
      );


      list.appendChild(
        box
      );

    }
  );

}


// ======================================================
// 35. 管理分類
// ======================================================

window.filterManagedTasks =
  function (
    filter,
    button
  ) {

    currentManagedFilter =
      filter;


    document
      .querySelectorAll(
        ".management-filter"
      )
      .forEach(
        function (btn) {

          btn.classList.remove(
            "active"
          );

        }
      );


    if (button) {

      button.classList.add(
        "active"
      );

    }


    loadTaskManagement();

  };


// ======================================================
// 36. 刪除管理中的任務
// ======================================================

async function deleteManagedTask(
  item
) {

  if (!currentUser) {

    return;

  }


  const confirmed =
    confirm(
      "確定要刪除：\n\n" +
      item.title +
      "\n\n嗎？"
    );


  if (!confirmed) {

    return;

  }


  try {

    let error = null;


    if (
      item.type ===
      "repeat"
    ) {

      const result =
        await db
          .from("task_templates")
          .delete()
          .eq(
            "id",
            item.id
          )
          .eq(
            "user_id",
            currentUser.id
          );


      error =
        result.error;

    } else {

      const result =
        await db
          .from("tasks")
          .delete()
          .eq(
            "id",
            item.id
          )
          .eq(
            "user_id",
            currentUser.id
          );


      error =
        result.error;

    }


    if (error) {

      console.error(
        "刪除管理任務失敗：",
        error
      );

      alert(
        "❌ 刪除失敗：" +
        error.message
      );

      return;

    }


    await loadTasks();

    await loadTaskManagement();


    alert(
      "🗑️ 已刪除！"
    );


  } catch (error) {

    console.error(
      "刪除管理任務錯誤：",
      error
    );

  }

}


// ======================================================
// 37. 清空任務管理
// ======================================================

function clearManagementList() {

  const list =
    document.getElementById(
      "task-management-list"
    );


  if (list) {

    list.innerHTML =
      `
      <div class="empty-state">
        尚未登入
      </div>
      `;

  }

}


// ======================================================
// 38. 相容舊 HTML 函式名稱
// ======================================================

// 如果你的 HTML 還是寫 login()
// register()
// logout()
// 也可以正常使用

window.login =
  window.loginUser;

window.register =
  window.registerUser;

window.logout =
  window.logoutUser;


// ======================================================
// 完成
// ======================================================

console.log(
  "✅ script.js 完整載入完成"
);
