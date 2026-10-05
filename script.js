// ============================================================
// 神級人生逆襲系統
// Supabase 核心版
// ============================================================

// ------------------------------------------------------------
// 1. Supabase 設定
// ------------------------------------------------------------

const SUPABASE_URL =
  "https://smlaokhqhgzjhnxeqfen.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_2uJS9Kex4YSTQh1Bbh3H-w_4cPPW25j";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );


// ------------------------------------------------------------
// 2. 全域資料
// ------------------------------------------------------------

let currentUser = null;
let currentProfile = null;
let currentTasks = [];


// ------------------------------------------------------------
// 3. 網頁載入
// ------------------------------------------------------------

document.addEventListener(
  "DOMContentLoaded",
  async function () {

    console.log(
      "⚔️ 神級人生逆襲系統啟動"
    );

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

        showMessage(
          "登入狀態讀取失敗：" +
          error.message
        );

        return;
      }


      if (
        data.session &&
        data.session.user
      ) {

        currentUser =
          data.session.user;

        await loadPlayer();

      } else {

        showLoggedOut();

      }

    } catch (error) {

      console.error(
        "初始化錯誤：",
        error
      );

      showMessage(
        "系統初始化失敗：" +
        error.message
      );

    }


    // ----------------------------------------------------------
    // 監聽登入狀態
    // ----------------------------------------------------------

    supabaseClient.auth.onAuthStateChange(
      async function (
        event,
        session
      ) {

        console.log(
          "登入狀態變化：",
          event
        );


        if (
          session &&
          session.user
        ) {

          currentUser =
            session.user;

          await loadPlayer();

        } else {

          currentUser = null;
          currentProfile = null;
          currentTasks = [];

          showLoggedOut();

        }

      }
    );

  }
);


// ------------------------------------------------------------
// 4. 登入
// ------------------------------------------------------------

window.loginUser =
  async function () {

    const email =
      document
        .getElementById("auth-email")
        .value
        .trim();

    const password =
      document
        .getElementById("auth-password")
        .value;


    if (!email) {

      alert(
        "請輸入 Email"
      );

      return;

    }


    if (!password) {

      alert(
        "請輸入密碼"
      );

      return;

    }


    showMessage(
      "登入中……"
    );


    try {

      const {
        data,
        error
      } =
        await supabaseClient.auth.signInWithPassword(
          {
            email: email,
            password: password
          }
        );


      if (error) {

        console.error(
          "登入失敗：",
          error
        );

        showMessage(
          "登入失敗：" +
          error.message
        );

        return;

      }


      currentUser =
        data.user;


      await loadPlayer();


    } catch (error) {

      console.error(
        "登入錯誤：",
        error
      );

      showMessage(
        "登入錯誤：" +
        error.message
      );

    }

  };


// ------------------------------------------------------------
// 5. 註冊
// ------------------------------------------------------------

window.registerUser =
  async function () {

    const email =
      document
        .getElementById("auth-email")
        .value
        .trim();

    const password =
      document
        .getElementById("auth-password")
        .value;


    if (!email) {

      alert(
        "請輸入 Email"
      );

      return;

    }


    if (!password) {

      alert(
        "請輸入密碼"
      );

      return;

    }


    if (password.length < 6) {

      alert(
        "密碼至少需要 6 碼"
      );

      return;

    }


    showMessage(
      "註冊中……"
    );


    try {

      const {
        data,
        error
      } =
        await supabaseClient.auth.signUp(
          {
            email: email,
            password: password
          }
        );


      if (error) {

        console.error(
          "註冊失敗：",
          error
        );

        showMessage(
          "註冊失敗：" +
          error.message
        );

        return;

      }


      if (
        data.session &&
        data.user
      ) {

        currentUser =
          data.user;

        await loadPlayer();

      } else {

        showMessage(
          "註冊成功！請先到 Email 完成驗證。"
        );

      }

    } catch (error) {

      console.error(
        "註冊錯誤：",
        error
      );

      showMessage(
        "註冊錯誤：" +
        error.message
      );

    }

  };


// ------------------------------------------------------------
// 6. 登出
// ------------------------------------------------------------

window.logoutUser =
  async function () {

    try {

      const {
        error
      } =
        await supabaseClient.auth.signOut();


      if (error) {

        alert(
          "登出失敗：" +
          error.message
        );

        return;

      }


      currentUser = null;
      currentProfile = null;
      currentTasks = [];

      showLoggedOut();


    } catch (error) {

      console.error(
        "登出錯誤：",
        error
      );

    }

  };


// ------------------------------------------------------------
// 7. 載入玩家
// ------------------------------------------------------------

async function loadPlayer() {

  if (!currentUser) {

    return;

  }


  showLoggedIn();


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
        .maybeSingle();


    if (error) {

      console.error(
        "玩家資料讀取失敗：",
        error
      );

      showMessage(
        "玩家資料讀取失敗：" +
        error.message
      );

      return;

    }


    if (!data) {

      showMessage(
        "找不到玩家資料"
      );

      return;

    }


    currentProfile =
      data;


    console.log(
      "玩家資料載入成功：",
      data
    );


    updatePlayerUI();


    await loadTasks();


  } catch (error) {

    console.error(
      "載入玩家錯誤：",
      error
    );

  }

}


// ------------------------------------------------------------
// 8. 更新玩家資訊
// ------------------------------------------------------------

function updatePlayerUI() {

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


  const levelElement =
    document.getElementById(
      "player-level"
    );


  const goldElement =
    document.getElementById(
      "player-gold"
    );


  const expElement =
    document.getElementById(
      "current-exp"
    );


  const requiredElement =
    document.getElementById(
      "required-exp"
    );


  const expBar =
    document.getElementById(
      "exp-bar"
    );


  if (levelElement) {

    levelElement.textContent =
      "Lv." + level;

  }


  if (goldElement) {

    goldElement.textContent =
      gold;

  }


  if (expElement) {

    expElement.textContent =
      exp;

  }


  if (requiredElement) {

    requiredElement.textContent =
      requiredExp;

  }


  if (expBar) {

    const percentage =
      Math.min(
        100,
        (exp / requiredExp) * 100
      );


    expBar.style.width =
      percentage + "%";

  }

}


// ------------------------------------------------------------
// 9. 載入今日任務
// ------------------------------------------------------------

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
          today
        )
        .order(
          "id",
          {
            ascending: true
          }
        );


    if (error) {

      console.error(
        "任務載入失敗：",
        error
      );

      showMessage(
        "任務載入失敗：" +
        error.message
      );

      return;

    }


    currentTasks =
      data || [];


    console.log(
      "今日任務載入成功"
    );

    console.log(
      "共",
      currentTasks.length,
      "個任務"
    );


    renderTasks();


    updateSummary();


    showMessage(
      "Supabase 玩家資料載入成功｜今日任務載入成功"
    );


  } catch (error) {

    console.error(
      "任務錯誤：",
      error
    );

  }

}


// ------------------------------------------------------------
// 10. 顯示任務
// ------------------------------------------------------------

function renderTasks() {

  const taskList =
    document.querySelector(
      ".task-list"
    );


  if (!taskList) {

    console.error(
      "找不到 .task-list"
    );

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


      const category =
        getCategory(
          task.category
        );


      const difficulty =
        getDifficulty(
          task.difficulty
        );


      li.innerHTML = `

        <span class="task-checkbox">
          ${task.completed ? "☑" : "☐"}
        </span>

        <div class="task-info">

          <small>
            ${category}
          </small>

          <span class="task-name">
            ${escapeHTML(task.title)}
          </span>

          <span class="difficulty ${task.difficulty}">
            ${difficulty}
          </span>

        </div>

        <div class="reward">

          <span>
            +${task.exp_reward} EXP
          </span>

          <span class="gold-reward">
            +${task.gold_reward} 💰
          </span>

        </div>

      `;


      li.onclick =
        function () {

          completeTask(
            task.id,
            li
          );

        };


      taskList.appendChild(
        li
      );

    }
  );

}


// ------------------------------------------------------------
// 11. 完成任務
// ------------------------------------------------------------

async function completeTask(
  taskId,
  element
) {

  if (!currentUser) {

    alert(
      "請先登入"
    );

    return;

  }


  const task =
    currentTasks.find(
      function (item) {

        return String(item.id) ===
          String(taskId);

      }
    );


  if (!task) {

    alert(
      "找不到這個任務"
    );

    return;

  }


  if (task.completed) {

    return;

  }


  // 防止連續點擊
  element.style.pointerEvents =
    "none";


  showMessage(
    "正在完成任務……"
  );


  try {

    console.log(
      "正在完成任務：",
      taskId
    );


    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "complete_task",
        {
          p_task_id:
            Number(taskId)
        }
      );


    console.log(
      "RPC 回傳：",
      data
    );


    if (error) {

      console.error(
        "完成任務失敗：",
        error
      );

      alert(
        "完成任務失敗：\n" +
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
        "任務沒有完成"
      );

      return;

    }


    // 更新玩家資料
    currentProfile.level =
      Number(data.level);

    currentProfile.exp =
      Number(data.exp);

    currentProfile.gold =
      Number(data.gold);


    // 更新任務
    task.completed =
      true;


    task.completed_at =
      new Date().toISOString();


    // 更新畫面
    updatePlayerUI();

    renderTasks();

    updateSummary();


    showMessage(
      "任務完成！ +" +
      data.task_exp +
      " EXP｜+" +
      data.task_gold +
      " 金幣"
    );


    // 如果升級
    if (
      Number(data.level) >
      Number(
        currentProfile.level
      )
    ) {

      alert(
        "🎉 升級成功！"
      );

    }


  } catch (error) {

    console.error(
      "完成任務錯誤：",
      error
    );

    alert(
      "完成任務錯誤：\n" +
      error.message
    );

  } finally {

    element.style.pointerEvents =
      "";

  }

}


// ------------------------------------------------------------
// 12. 保留 index.html 原本的 toggleTask
// ------------------------------------------------------------

window.toggleTask =
  function (
    element
  ) {

    const taskId =
      element.dataset.taskId;


    if (!taskId) {

      alert(
        "請重新整理頁面後再試"
      );

      return;

    }


    completeTask(
      taskId,
      element
    );

  };


// ------------------------------------------------------------
// 13. 任務分類
// ------------------------------------------------------------

window.filterTasks =
  function (
    category,
    button
  ) {

    const items =
      document.querySelectorAll(
        ".task-item"
      );


    items.forEach(
      function (item) {

        if (
          category === "all" ||
          item.dataset.category ===
            category
        ) {

          item.style.display =
            "";

        } else {

          item.style.display =
            "none";

        }

      }
    );


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

  };


// ------------------------------------------------------------
// 14. 今日統計
// ------------------------------------------------------------

function updateSummary() {

  const total =
    currentTasks.length;


  const completed =
    currentTasks.filter(
      function (task) {

        return task.completed;

      }
    );


  const completedCount =
    completed.length;


  const rate =
    total === 0
      ? 0
      : Math.round(
          completedCount /
          total *
          100
        );


  const todayExp =
    completed.reduce(
      function (
        total,
        task
      ) {

        return total +
          Number(
            task.exp_reward
          );

      },
      0
    );


  const todayGold =
    completed.reduce(
      function (
        total,
        task
      ) {

        return total +
          Number(
            task.gold_reward
          );

      },
      0
    );


  const completedElement =
    document.getElementById(
      "completed-count"
    );


  const rateElement =
    document.getElementById(
      "summary-rate"
    );


  const expElement =
    document.getElementById(
      "today-exp"
    );


  const goldElement =
    document.getElementById(
      "today-gold"
    );


  const rateText =
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


  if (expElement) {

    expElement.textContent =
      "+" +
      todayExp;

  }


  if (goldElement) {

    goldElement.textContent =
      "+" +
      todayGold;

  }


  if (rateText) {

    rateText.textContent =
      rate + "%";

  }


  if (rateBar) {

    rateBar.style.width =
      rate + "%";

  }

}


// ------------------------------------------------------------
// 15. 登入後畫面
// ------------------------------------------------------------

function showLoggedIn() {

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


  if (
    userEmail &&
    currentUser
  ) {

    userEmail.textContent =
      "目前玩家：" +
      currentUser.email;

  }

}


// ------------------------------------------------------------
// 16. 登出後畫面
// ------------------------------------------------------------

function showLoggedOut() {

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


  showMessage(
    "尚未登入"
  );

}


// ------------------------------------------------------------
// 17. 顯示訊息
// ------------------------------------------------------------

function showMessage(
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


// ------------------------------------------------------------
// 18. 類別
// ------------------------------------------------------------

function getCategory(
  category
) {

  switch (category) {

    case "study":
      return "📚 學習";

    case "toeic":
      return "🇬🇧 多益";

    case "focus":
      return "🎯 專注";

    case "health":
      return "❤️ 健康";

    default:
      return "📌 任務";

  }

}


// ------------------------------------------------------------
// 19. 難度
// ------------------------------------------------------------

function getDifficulty(
  difficulty
) {

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


// ------------------------------------------------------------
// 20. 今日日期
// ------------------------------------------------------------

function getToday() {

  const date =
    new Date();


  const year =
    date.getFullYear();


  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );


  const day =
    String(
      date.getDate()
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


// ------------------------------------------------------------
// 21. HTML 安全處理
// ------------------------------------------------------------

function escapeHTML(
  value
) {

  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}


// ------------------------------------------------------------
// 完成
// ------------------------------------------------------------

console.log(
  "⚔️ 神級人生逆襲系統 script.js 載入完成"
);
