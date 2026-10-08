// ======================================================
// 神級人生逆襲系統
// RPG 任務系統 V2
// ======================================================


// ======================================================
// 1. Supabase
// ======================================================

const SUPABASE_URL =
  "https://smlaokhqhgzjhnxeqfen.supabase.co";

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

let currentFilter = "all";


// ======================================================
// 3. 網頁載入
// ======================================================

document.addEventListener(
  "DOMContentLoaded",
  async function () {

    console.log(
      "神級人生逆襲系統 JavaScript 載入成功"
    );

    await checkSession();

  }
);


// ======================================================
// 4. 檢查登入狀態
// ======================================================

async function checkSession() {

  try {

    const {
      data,
      error
    } =
      await supabaseClient.auth.getSession();


    if (error) {

      console.error(
        "取得登入狀態失敗：",
        error
      );

      showAuthMessage(
        "⚠️ 無法取得登入狀態"
      );

      return;

    }


    currentUser =
      data.session
        ? data.session.user
        : null;


    if (currentUser) {

      await showLoggedInUI();

      await loadPlayer();

      await loadTasks();

    } else {

      showLoggedOutUI();

    }

  } catch (error) {

    console.error(
      "Session 錯誤：",
      error
    );

  }

}


// ======================================================
// 5. 登入
// ======================================================

window.loginUser =
  async function () {

    const emailInput =
      document.getElementById(
        "auth-email"
      );

    const passwordInput =
      document.getElementById(
        "auth-password"
      );


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
      } =
        await supabaseClient.auth.signInWithPassword({

          email,

          password

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


      currentUser =
        data.user;


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

window.registerUser =
  async function () {

    const emailInput =
      document.getElementById(
        "auth-email"
      );

    const passwordInput =
      document.getElementById(
        "auth-password"
      );


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
      } =
        await supabaseClient.auth.signUp({

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

        currentUser =
          data.user;


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

window.logoutUser =
  async function () {

    try {

      const {
        error
      } =
        await supabaseClient.auth.signOut();


      if (error) {

        showAuthMessage(
          "❌ 登出失敗"
        );

        return;

      }


      currentUser = null;

      currentProfile = null;

      currentTasks = [];


      showLoggedOutUI();

      updateSummary();


      const taskList =
        document.querySelector(
          ".task-list"
        );


      if (taskList) {

        taskList.innerHTML = "";

      }


    } catch (error) {

      console.error(error);

    }

  };


// ======================================================
// 8. 登入 UI
// ======================================================

async function showLoggedInUI() {

  const authForm =
    document.getElementById(
      "auth-form"
    );


  const loggedInAreas =
    document.querySelectorAll(
      "#logged-in-area"
    );


  const userEmail =
    document.getElementById(
      "user-email"
    );


  if (authForm) {

    authForm.style.display =
      "none";

  }


  loggedInAreas.forEach(
    function (area) {

      area.style.display =
        "block";

    }
  );


  if (
    userEmail &&
    currentUser
  ) {

    userEmail.textContent =
      "👤 玩家：" +
      currentUser.email;

  }

}


// ======================================================
// 9. 登出 UI
// ======================================================

function showLoggedOutUI() {

  const authForm =
    document.getElementById(
      "auth-form"
    );


  const loggedInAreas =
    document.querySelectorAll(
      "#logged-in-area"
    );


  if (authForm) {

    authForm.style.display =
      "block";

  }


  loggedInAreas.forEach(
    function (area) {

      area.style.display =
        "none";

    }
  );

}


// ======================================================
// 10. Auth 訊息
// ======================================================

function showAuthMessage(
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
    } =
      await supabaseClient
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


    renderPlayer();


  } catch (error) {

    console.error(error);

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
      currentProfile.level
    );


  const exp =
    Number(
      currentProfile.exp
    );


  const gold =
    Number(
      currentProfile.gold
    );


  const requiredExp =
    100 +
    (level - 1) * 50;


  const levelElements =
    document.querySelectorAll(
      "#player-level"
    );


  const goldElements =
    document.querySelectorAll(
      "#player-gold"
    );


  const expElements =
    document.querySelectorAll(
      "#current-exp"
    );


  const requiredElements =
    document.querySelectorAll(
      "#required-exp"
    );


  const expBar =
    document.getElementById(
      "exp-bar"
    );


  levelElements.forEach(
    function (element) {

      element.textContent =
        "Lv." + level;

    }
  );


  goldElements.forEach(
    function (element) {

      element.textContent =
        gold;

    }
  );


  expElements.forEach(
    function (element) {

      element.textContent =
        exp;

    }
  );


  requiredElements.forEach(
    function (element) {

      element.textContent =
        requiredExp;

    }
  );


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
// 14. 產生今天的重複任務
// ======================================================

async function generateDailyTasks() {

  if (!currentUser) {

    return;

  }


  try {

    const {
      data,
      error
    } =
      await supabaseClient
        .rpc(
          "generate_daily_tasks"
        );


    if (error) {

      console.error(
        "產生今日重複任務失敗：",
        error
      );

      return;

    }


    console.log(
      "今日重複任務：",
      data
    );


  } catch (error) {

    console.error(
      "產生今日任務錯誤：",
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

    // 先產生今天應該出現的重複任務

    await generateDailyTasks();


    // 再讀取今天任務

    const {
      data,
      error
    } =
      await supabaseClient
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
      "今日任務載入成功：",
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
    document.querySelector(
      ".task-list"
    );


  if (!taskList) {

    return;

  }


  taskList.innerHTML = "";


  currentTasks.forEach(
    function (task) {

      const li =
        document.createElement(
          "li"
        );


      li.className =
        "task-item";


      li.dataset.category =
        task.category;


      li.dataset.difficulty =
        task.difficulty;


      li.dataset.taskId =
        task.id;


      if (task.completed) {

        li.classList.add(
          "completed"
        );

      }


      // --------------------------
      // 勾選
      // --------------------------

      const checkbox =
        document.createElement(
          "span"
        );


      checkbox.className =
        "task-checkbox";


      checkbox.textContent =
        task.completed
          ? "☑"
          : "☐";


      // --------------------------
      // 任務資訊
      // --------------------------

      const taskInfo =
        document.createElement(
          "div"
        );


      taskInfo.className =
        "task-info";


      const category =
        document.createElement(
          "small"
        );


      category.textContent =
        getCategoryLabel(
          task.category
        );


      const name =
        document.createElement(
          "span"
        );


      name.className =
        "task-name";


      name.textContent =
        task.title;


      const difficulty =
        document.createElement(
          "span"
        );


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


      // --------------------------
      // 獎勵
      // --------------------------

      const reward =
        document.createElement(
          "div"
        );


      reward.className =
        "reward";


      const expReward =
        document.createElement(
          "span"
        );


      expReward.textContent =
        "+" +
        task.exp_reward +
        " EXP";


      const goldReward =
        document.createElement(
          "span"
        );


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


      // --------------------------
      // 按鈕
      // --------------------------

      const actions =
        document.createElement(
          "div"
        );


      actions.className =
        "task-actions";


      actions.style.display =
        "flex";


      actions.style.gap =
        "6px";


      actions.style.marginLeft =
        "8px";


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
        function (event) {

          event.stopPropagation();

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
        function (event) {

          event.stopPropagation();

          deleteTask(
            task.id
          );

        };


      actions.appendChild(
        editButton
      );


      actions.appendChild(
        deleteButton
      );


      // --------------------------
      // 組合
      // --------------------------

      li.appendChild(
        checkbox
      );


      li.appendChild(
        taskInfo
      );


      li.appendChild(
        reward
      );


      li.appendChild(
        actions
      );


      // --------------------------
      // 點擊完成
      // --------------------------

      li.onclick =
        function () {

          toggleTask(

            li,

            Number(
              task.exp_reward
            ),

            Number(
              task.gold_reward
            ),

            task.id

          );

        };


      taskList.appendChild(
        li
      );

    }
  );


  applyCurrentFilter();

}


// ======================================================
// 17. 類別名稱
// ======================================================

function getCategoryLabel(
  category
) {

  const labels = {

    study:
      "📚 學習",

    toeic:
      "🇬🇧 多益",

    focus:
      "🎯 專注",

    health:
      "❤️ 健康"

  };


  return (
    labels[category] ||
    "📌 其他"
  );

}


// ======================================================
// 18. 難度名稱
// ======================================================

function getDifficultyLabel(
  difficulty
) {

  const labels = {

    easy:
      "🟢 簡單",

    normal:
      "🔵 普通",

    hard:
      "🟣 困難"

  };


  return (
    labels[difficulty] ||
    "🔵 普通"
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

window.addTask =
  async function () {

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


    if (title.length > 100) {

      setAddTaskMessage(
        "⚠️ 任務名稱不能超過 100 字"
      );

      return;

    }


    const reward =
      getRewardByDifficulty(
        difficulty
      );


    const repeat =
      getRepeatSettings();


    // --------------------------
    // 檢查指定星期
    // --------------------------

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


    // --------------------------
    // 檢查結束日期
    // --------------------------

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
      "🔄 正在建立任務……"
    );


    try {

      // ==================================================
      // A. 重複任務
      // ==================================================

      if (
        repeat.repeatEnabled
      ) {

        const {
          data,
          error
        } =
          await supabaseClient
            .from(
              "task_templates"
            )
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
            "建立任務模板失敗：",
            error
          );


          setAddTaskMessage(
            "❌ 建立重複任務失敗：" +
            error.message
          );


          return;

        }


        console.log(
          "任務模板建立成功：",
          data
        );


        // 立即產生今天的任務

        await generateDailyTasks();


        // 重新讀取今天任務

        await loadTasks();


      }


      // ==================================================
      // B. 一次性任務
      // ==================================================

      else {

        const {
          data,
          error
        } =
          await supabaseClient
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
            "新增一次性任務失敗：",
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

      }


      // ==================================================
      // 清空表單
      // ==================================================

      if (titleInput) {

        titleInput.value = "";

      }


      const repeatNone =
        document.querySelector(
          'input[name="new-task-repeat"][value="none"]'
        );


      if (repeatNone) {

        repeatNone.checked =
          true;

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

        dailyRadio.checked =
          true;

      }


      const weekdaySettings =
        document.getElementById(
          "weekday-settings"
        );


      if (weekdaySettings) {

        weekdaySettings.style.display =
          "none";

      }


      const dayCheckboxes =
        document.querySelectorAll(
          'input[name="repeat-day"]'
        );


      dayCheckboxes.forEach(
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

        endDateInput.value =
          "";

      }


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
        "❌ 建立任務時發生錯誤"
      );

    }

  };


// ======================================================
// 22. 新增任務訊息
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
// 23. 重複設定 UI
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
// 24. 每天 / 指定星期
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
// 25. 編輯任務
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

          return (
            Number(item.id) ===
            Number(taskId)
          );

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


    if (title.length > 100) {

      alert(
        "⚠️ 任務名稱不能超過 100 字"
      );

      return;

    }


    const newDifficulty =
      prompt(
        "請輸入難度：easy / normal / hard",
        task.difficulty
      );


    if (
      newDifficulty === null
    ) {

      return;

    }


    const difficulty =
      newDifficulty
        .trim()
        .toLowerCase();


    if (
      ![
        "easy",
        "normal",
        "hard"
      ].includes(
        difficulty
      )
    ) {

      alert(
        "⚠️ 難度只能是：easy、normal、hard"
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
      } =
        await supabaseClient
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

            return (
              Number(item.id) ===
              Number(taskId)
            );

          }
        );


      if (index !== -1) {

        currentTasks[index] =
          data;

      }


      renderTasks();

      updateSummary();


      alert(
        "✅ 任務修改成功！"
      );


    } catch (error) {

      console.error(error);


      alert(
        "❌ 編輯任務時發生錯誤"
      );

    }

  };


// ======================================================
// 26. 刪除任務
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

          return (
            Number(item.id) ===
            Number(taskId)
          );

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

        task.title +

        "\n\n" +

        "只會刪除今天的任務。"

      );


    if (!confirmed) {

      return;

    }


    try {

      const {
        error
      } =
        await supabaseClient
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

            return (
              Number(item.id) !==
              Number(taskId)
            );

          }
        );


      renderTasks();

      updateSummary();


      alert(
        "🗑️ 今日任務已刪除！"
      );


    } catch (error) {

      console.error(error);


      alert(
        "❌ 刪除任務時發生錯誤"
      );

    }

  };


// ======================================================
// 27. 完成任務
// ======================================================

window.toggleTask =
  async function (
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


    const task =
      currentTasks.find(
        function (item) {

          return (
            Number(item.id) ===
            Number(taskId)
          );

        }
      );


    if (!task) {

      return;

    }


    if (task.completed) {

      return;

    }


    try {

      element.style.pointerEvents =
        "none";


      const {
        data,
        error
      } =
        await supabaseClient
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


      const oldLevel =
        Number(
          currentProfile.level
        );


      currentProfile.level =
        Number(
          data.level
        );


      currentProfile.exp =
        Number(
          data.exp
        );


      currentProfile.gold =
        Number(
          data.gold
        );


      task.completed =
        true;


      task.completed_at =
        new Date().toISOString();


      renderPlayer();

      renderTasks();

      updateSummary();


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

      console.error(error);


      alert(
        "❌ 完成任務時發生錯誤"
      );


      element.style.pointerEvents =
        "";

    }

  };


// ======================================================
// 28. 篩選任務
// ======================================================

window.filterTasks =
  function (
    category,
    button
  ) {

    const buttons =
      document.querySelectorAll(
        ".filter-btn"
      );


    buttons.forEach(
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


    currentFilter =
      category;


    applyCurrentFilter();

  };


// ======================================================
// 29. 套用篩選
// ======================================================

function applyCurrentFilter() {

  const items =
    document.querySelectorAll(
      ".task-item"
    );


  items.forEach(
    function (item) {

      const category =
        item.dataset.category;


      if (
        currentFilter ===
          "all" ||
        category ===
          currentFilter
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
// 30. 今日統計
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
          ) * 100
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
      completedCount +
      " / " +
      total;

  }


  if (rateElement) {

    rateElement.textContent =
      rate + "%";

  }


  if (todayExpElement) {

    todayExpElement.textContent =
      "+" +
      totalExp;

  }


  if (todayGoldElement) {

    todayGoldElement.textContent =
      "+" +
      totalGold;

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
