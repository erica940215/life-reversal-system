// ========================================
// 神級人生逆襲系統 V1.0
// Supabase：登入 + 玩家資料 + 雲端任務 + EXP / Gold
// ========================================

const SUPABASE_URL = "https://smlaokhqhgzjhnxeqfen.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_2uJS9Kex4YSTQh1Bbh3H-w_4cPPW25j";

const supabaseClient =
  window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );


// ========================================
// 全域資料
// ========================================

let currentUser = null;
let currentProfile = null;
let currentTasks = [];


// 防止同一時間重複送出完成任務
let completingTask = false;


// ========================================
// 日期
// ========================================

function getToday() {

  const now = new Date();

  const year = now.getFullYear();

  const month =
    String(now.getMonth() + 1).padStart(2, "0");

  const day =
    String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


// ========================================
// EXP需求
// ========================================

function getRequiredExp(level) {

  return 100 + (level - 1) * 50;

}


// ========================================
// HTML安全處理
// ========================================

function escapeHtml(text) {

  if (
    text === null ||
    text === undefined
  ) {
    return "";
  }

  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


// ========================================
// 系統提示
// ========================================

function showSystemMessage(
  message,
  type = "normal"
) {

  let box =
    document.querySelector("#system-message");

  if (!box) {

    box =
      document.createElement("div");

    box.id =
      "system-message";

    box.style.position =
      "fixed";

    box.style.top =
      "20px";

    box.style.left =
      "50%";

    box.style.transform =
      "translateX(-50%)";

    box.style.zIndex =
      "99999";

    box.style.padding =
      "12px 20px";

    box.style.borderRadius =
      "10px";

    box.style.background =
      "#1f2937";

    box.style.color =
      "#ffffff";

    box.style.fontSize =
      "14px";

    box.style.boxShadow =
      "0 5px 20px rgba(0,0,0,0.3)";

    document.body.appendChild(box);

  }


  box.textContent =
    message;


  if (type === "success") {

    box.style.background =
      "#166534";

  }
  else if (type === "error") {

    box.style.background =
      "#991b1b";

  }
  else {

    box.style.background =
      "#1f2937";

  }


  box.style.display =
    "block";


  clearTimeout(
    box._hideTimer
  );


  box._hideTimer =
    setTimeout(() => {

      box.style.display =
        "none";

    }, 2500);

}


// ========================================
// 任務分類名稱
// ========================================

function getCategoryName(category) {

  const names = {

    study: "主科學習",

    toeic: "多益",

    focus: "專注",

    health: "健康",

    life: "生活",

    random: "隨機自律"

  };


  return (
    names[category] ||
    category ||
    "其他"
  );

}


// ========================================
// 難度名稱
// ========================================

function getDifficultyName(difficulty) {

  const names = {

    easy: "簡單",

    normal: "普通",

    hard: "困難"

  };


  return (
    names[difficulty] ||
    difficulty ||
    "普通"
  );

}


// ========================================
// 載入今日任務
// ========================================

async function loadTodayTasks() {

  if (!currentUser) {

    console.log(
      "尚未登入，無法載入任務"
    );

    return;

  }


  const today =
    getToday();


  console.log(
    "正在載入今日任務：",
    today
  );


  const {
    data,
    error
  } =
    await supabaseClient

      .from("tasks")

      .select(`
        id,
        title,
        category,
        difficulty,
        exp_reward,
        gold_reward,
        completed,
        completed_at,
        task_date
      `)

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


    showSystemMessage(
      "任務載入失敗：" +
      error.message,
      "error"
    );


    return;

  }


  currentTasks =
    data || [];


  console.log(
    "今日任務載入成功"
  );


  console.log(
    `共 ${currentTasks.length} 個任務`
  );


  renderTasks(
    currentTasks
  );

}


// ========================================
// 渲染任務
// ========================================

function renderTasks(tasks) {

  const container =
    document.querySelector(
      ".tasks-container"
    );


  if (!container) {

    console.error(
      "找不到 .tasks-container"
    );


    return;

  }


  container.innerHTML =
    "";


  if (
    !tasks ||
    tasks.length === 0
  ) {

    container.innerHTML = `

      <div class="empty-task">
        今天還沒有任務
      </div>

    `;


    return;

  }


  tasks.forEach(task => {

    const taskElement =
      document.createElement(
        "div"
      );


    taskElement.className =
      "task-item";


    if (task.completed) {

      taskElement.classList.add(
        "completed"
      );

    }


    // 非常重要：
    // 把任務ID直接放進HTML
    taskElement.dataset.taskId =
      String(task.id);


    taskElement.innerHTML = `

      <div class="task-main">

        <div class="task-check">

          ${
            task.completed
              ? "✓"
              : "○"
          }

        </div>


        <div class="task-info">

          <div class="task-title">

            ${escapeHtml(
              task.title
            )}

          </div>


          <div class="task-meta">

            <span>

              ${escapeHtml(
                getCategoryName(
                  task.category
                )
              )}

            </span>


            <span>

              ${escapeHtml(
                getDifficultyName(
                  task.difficulty
                )
              )}

            </span>

          </div>

        </div>

      </div>


      <div class="task-reward">

        <span>
          +${Number(task.exp_reward) || 0} EXP
        </span>


        <span>
          +${Number(task.gold_reward) || 0} 🪙
        </span>

      </div>

    `;


    container.appendChild(
      taskElement
    );

  });


  console.log(
    "任務畫面渲染完成"
  );

}


// ========================================
// ★ 任務點擊事件
// ========================================
//
// 不再對每一個任務 individually 綁定事件。
// 改由 .tasks-container 統一處理。
// ========================================

function setupTaskClickHandler() {

  const container =
    document.querySelector(
      ".tasks-container"
    );


  if (!container) {

    console.warn(
      "初始化任務點擊事件時找不到 .tasks-container"
    );


    return;

  }


  // 避免重複綁定
  if (
    container.dataset.clickReady === "true"
  ) {

    return;

  }


  container.dataset.clickReady =
    "true";


  container.addEventListener(
    "click",
    async function(event) {

      // 找到使用者實際點擊的任務元素
      const taskElement =
        event.target.closest(
          ".task-item"
        );


      // 點到容器空白處
      if (!taskElement) {

        return;

      }


      const taskId =
        Number(
          taskElement.dataset.taskId
        );


      if (
        !Number.isFinite(taskId)
      ) {

        console.error(
          "任務ID無效：",
          taskElement.dataset.taskId
        );


        return;

      }


      console.log(
        "偵測到任務點擊：",
        taskId
      );


      // 找到對應任務
      const task =
        currentTasks.find(
          item =>
            Number(item.id) ===
            taskId
        );


      if (!task) {

        console.error(
          "找不到對應任務：",
          taskId
        );


        showSystemMessage(
          "找不到這個任務",
          "error"
        );


        return;

      }


      // 已完成
      if (task.completed) {

        showSystemMessage(
          "這個任務已經完成",
          "normal"
        );


        return;

      }


      await completeTask(
        taskElement,
        task
      );

    }
  );


  console.log(
    "任務點擊事件初始化成功"
  );

}


// ========================================
// 完成任務
// ========================================

async function completeTask(
  taskElement,
  task
) {

  if (!currentUser) {

    showSystemMessage(
      "請先登入",
      "error"
    );


    return;

  }


  if (completingTask) {

    console.log(
      "目前已有任務正在完成"
    );


    return;

  }


  completingTask =
    true;


  // 暫時禁止點擊
  taskElement.style.pointerEvents =
    "none";


  taskElement.style.opacity =
    "0.6";


  showSystemMessage(
    "正在完成任務..."
  );


  console.log(
    "正在呼叫 complete_task：",
    task.id
  );


  try {

    const {
      data,
      error
    } =
      await supabaseClient.rpc(
        "complete_task",
        {
          p_task_id:
            Number(task.id)
        }
      );


    console.log(
      "RPC 回傳：",
      data
    );


    if (error) {

      console.error(
        "complete_task RPC 錯誤：",
        error
      );


      throw error;

    }


    if (
      !data ||
      data.success !== true
    ) {

      const message =
        data?.message ||
        "任務無法完成";


      showSystemMessage(
        message,
        "error"
      );


      return;

    }


    // 保存升級前等級
    const oldLevel =
      currentProfile
        ? Number(
            currentProfile.level
          )
        : Number(
            data.level
          );


    // 更新玩家資料
    if (!currentProfile) {

      currentProfile = {};

    }


    currentProfile.level =
      Number(data.level);


    currentProfile.exp =
      Number(data.exp);


    currentProfile.gold =
      Number(data.gold);


    // 更新任務狀態
    task.completed =
      true;


    task.completed_at =
      new Date().toISOString();


    // 更新玩家畫面
    updateUI();


    // 重新渲染任務
    renderTasks(
      currentTasks
    );


    // 成功訊息
    showSystemMessage(
      `任務完成！ +${data.task_exp} EXP +${data.task_gold} 🪙`,
      "success"
    );


    console.log(
      "任務完成成功"
    );


    // 升級提示
    if (
      Number(data.level) >
      oldLevel
    ) {

      setTimeout(() => {

        showSystemMessage(
          `🎉 升級成功！現在是 Lv.${data.level}`,
          "success"
        );

      }, 700);

    }

  }
  catch (error) {

    console.error(
      "完成任務發生錯誤：",
      error
    );


    showSystemMessage(
      "完成任務失敗：" +
      (
        error.message ||
        "未知錯誤"
      ),
      "error"
    );


    // 恢復點擊
    taskElement.style.pointerEvents =
      "auto";


    taskElement.style.opacity =
      "1";

  }
  finally {

    completingTask =
      false;

  }

}


// ========================================
// 舊版 toggleTask 相容
// ========================================

function toggleTask(
  element
) {

  const taskId =
    Number(
      element?.dataset?.taskId
    );


  const task =
    currentTasks.find(
      item =>
        Number(item.id) ===
        taskId
    );


  if (!task) {

    console.error(
      "toggleTask 找不到任務",
      taskId
    );


    return;

  }


  completeTask(
    element,
    task
  );

}


// ========================================
// 更新玩家UI
// ========================================

function updateUI() {

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


  const username =
    currentProfile.username ||
    "玩家";


  const requiredExp =
    getRequiredExp(
      level
    );


  // ====================================
  // 玩家名稱
  // ====================================

  const usernameElements =
    document.querySelectorAll(
      ".player-name, #player-name, [data-player-name]"
    );


  usernameElements.forEach(
    element => {

      element.textContent =
        username;

    }
  );


  // ====================================
  // 等級
  // ====================================

  const levelElements =
    document.querySelectorAll(
      ".player-level, #player-level, [data-player-level]"
    );


  levelElements.forEach(
    element => {

      element.textContent =
        `Lv.${level}`;

    }
  );


  // ====================================
  // EXP
  // ====================================

  const expElements =
    document.querySelectorAll(
      ".player-exp, #player-exp, [data-player-exp]"
    );


  expElements.forEach(
    element => {

      element.textContent =
        `${exp} / ${requiredExp}`;

    }
  );


  // ====================================
  // Gold
  // ====================================

  const goldElements =
    document.querySelectorAll(
      ".player-gold, #player-gold, [data-player-gold]"
    );


  goldElements.forEach(
    element => {

      element.textContent =
        `${gold}`;

    }
  );


  // ====================================
  // EXP進度條
  // ====================================

  const expBars =
    document.querySelectorAll(
      ".exp-fill, #exp-fill, [data-exp-bar]"
    );


  const percentage =
    Math.min(
      100,
      Math.max(
        0,
        (exp / requiredExp) * 100
      )
    );


  expBars.forEach(
    bar => {

      bar.style.width =
        `${percentage}%`;

    }
  );


  console.log(
    `玩家UI更新：Lv.${level} EXP ${exp}/${requiredExp} Gold ${gold}`
  );

}


// ========================================
// 載入玩家資料
// ========================================

async function loadProfile() {

  if (!currentUser) {

    return;

  }


  console.log(
    "正在載入玩家資料..."
  );


  const {
    data,
    error
  } =
    await supabaseClient

      .from("profiles")

      .select(`
        id,
        username,
        level,
        exp,
        gold
      `)

      .eq(
        "id",
        currentUser.id
      )

      .maybeSingle();


  if (error) {

    console.error(
      "玩家資料載入失敗：",
      error
    );


    showSystemMessage(
      "玩家資料載入失敗：" +
      error.message,
      "error"
    );


    return;

  }


  if (!data) {

    console.error(
      "找不到玩家資料"
    );


    showSystemMessage(
      "找不到玩家資料",
      "error"
    );


    return;

  }


  currentProfile =
    data;


  console.log(
    "Supabase 玩家資料載入成功"
  );


  console.log(
    `玩家：${data.username}`
  );


  console.log(
    `Lv.${data.level} EXP：${data.exp} 金幣：${data.gold}`
  );


  updateUI();

}


// ========================================
// 登入
// ========================================

async function login(
  email,
  password
) {

  console.log(
    "正在登入..."
  );


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


    showSystemMessage(
      "登入失敗：" +
      error.message,
      "error"
    );


    return false;

  }


  currentUser =
    data.user;


  await loadProfile();

  await loadTodayTasks();


  showSystemMessage(
    "登入成功",
    "success"
  );


  return true;

}


// ========================================
// 註冊
// ========================================

async function register(
  email,
  password
) {

  console.log(
    "正在註冊..."
  );


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


    showSystemMessage(
      "註冊失敗：" +
      error.message,
      "error"
    );


    return false;

  }


  if (data.user) {

    currentUser =
      data.user;


    await loadProfile();

    await loadTodayTasks();

  }


  showSystemMessage(
    "註冊成功，請完成 Email 驗證",
    "success"
  );


  return true;

}


// ========================================
// 登出
// ========================================

async function logout() {

  const {
    error
  } =
    await supabaseClient.auth.signOut();


  if (error) {

    console.error(
      "登出失敗：",
      error
    );


    showSystemMessage(
      "登出失敗：" +
      error.message,
      "error"
    );


    return;

  }


  currentUser =
    null;


  currentProfile =
    null;


  currentTasks =
    [];


  showSystemMessage(
    "已登出",
    "success"
  );


  setTimeout(() => {

    location.reload();

  }, 500);

}


// ========================================
// 檢查登入狀態
// ========================================

async function checkAuth() {

  console.log(
    "正在檢查登入狀態..."
  );


  const {
    data,
    error
  } =
    await supabaseClient.auth.getUser();


  if (error) {

    console.error(
      "取得登入狀態失敗：",
      error
    );


    return;

  }


  if (!data.user) {

    console.log(
      "目前沒有登入"
    );


    return;

  }


  currentUser =
    data.user;


  console.log(
    "目前登入玩家：",
    currentUser.email
  );


  await loadProfile();

  await loadTodayTasks();

}


// ========================================
// 任務篩選
// ========================================

function filterTasks(
  category
) {

  if (
    category === "all"
  ) {

    renderTasks(
      currentTasks
    );


    return;

  }


  const filtered =
    currentTasks.filter(
      task =>
        task.category ===
        category
    );


  renderTasks(
    filtered
  );

}


// ========================================
// 初始化
// ========================================

document.addEventListener(
  "DOMContentLoaded",
  async function() {

    console.log(
      "================================"
    );


    console.log(
      "神級人生逆襲系統 V1.0 啟動"
    );


    console.log(
      "================================"
    );


    // 先設定任務點擊事件
    setupTaskClickHandler();


    // 再檢查登入
    await checkAuth();

  }
);


// ========================================
// 暴露給 HTML
// ========================================

window.login =
  login;


window.register =
  register;


window.logout =
  logout;


window.toggleTask =
  toggleTask;


window.filterTasks =
  filterTasks;
