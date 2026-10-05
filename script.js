// ========================================
// 神級人生逆襲系統 V0.9
// Supabase 雲端任務 + EXP / Gold / 升級
// ========================================

const SUPABASE_URL = "https://smlaokhqhgzjhnxeqfen.supabase.co";
const SUPABASE_KEY = "sb_publishable_2uJS9Kex4YSTQh1Bbh3H-w_4cPPW25j";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


// ========================================
// 全域資料
// ========================================

let currentUser = null;
let currentProfile = null;
let currentTasks = [];


// ========================================
// 日期
// ========================================

function getToday() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


// ========================================
// EXP 計算
// ========================================

function getRequiredExp(level) {
  return 100 + (level - 1) * 50;
}


// ========================================
// HTML 安全處理
// ========================================

function escapeHtml(text) {
  if (text === null || text === undefined) {
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
// 任務分類
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

  return names[category] || category;
}


// ========================================
// 難度
// ========================================

function getDifficultyName(difficulty) {

  const names = {
    easy: "簡單",
    normal: "普通",
    hard: "困難"
  };

  return names[difficulty] || difficulty;
}


// ========================================
// 顯示系統訊息
// ========================================

function showSystemMessage(message, type = "normal") {

  let box = document.querySelector("#system-message");

  if (!box) {

    box = document.createElement("div");

    box.id = "system-message";

    box.style.position = "fixed";
    box.style.top = "20px";
    box.style.left = "50%";
    box.style.transform = "translateX(-50%)";
    box.style.zIndex = "9999";
    box.style.padding = "12px 20px";
    box.style.borderRadius = "10px";
    box.style.background = "#1f2937";
    box.style.color = "#fff";
    box.style.fontSize = "14px";
    box.style.boxShadow = "0 5px 20px rgba(0,0,0,0.3)";

    document.body.appendChild(box);
  }

  box.textContent = message;

  if (type === "success") {
    box.style.background = "#166534";
  }

  if (type === "error") {
    box.style.background = "#991b1b";
  }

  box.style.display = "block";

  setTimeout(() => {
    box.style.display = "none";
  }, 2500);
}


// ========================================
// 載入今日任務
// ========================================

async function loadTodayTasks() {

  if (!currentUser) {
    return;
  }

  const today = getToday();

  const { data, error } = await supabaseClient
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
    .eq("user_id", currentUser.id)
    .eq("task_date", today)
    .order("id", { ascending: true });

  if (error) {

    console.error("載入任務失敗：", error);

    showSystemMessage(
      "任務載入失敗：" + error.message,
      "error"
    );

    return;
  }

  currentTasks = data || [];

  console.log("今日任務載入成功");
  console.log(`共 ${currentTasks.length} 個任務`);

  renderTasks(currentTasks);
}


// ========================================
// 渲染任務
// ========================================

function renderTasks(tasks) {

  const container =
    document.querySelector(".tasks-container");

  if (!container) {

    console.warn(
      "找不到 .tasks-container，請確認 HTML 有任務容器"
    );

    return;
  }

  container.innerHTML = "";

  if (!tasks || tasks.length === 0) {

    container.innerHTML = `
      <div class="empty-task">
        今天還沒有任務
      </div>
    `;

    return;
  }


  tasks.forEach(task => {

    const taskElement =
      document.createElement("div");

    taskElement.className =
      "task-item" +
      (task.completed ? " completed" : "");

    taskElement.dataset.taskId = task.id;


    taskElement.innerHTML = `

      <div class="task-main">

        <div class="task-check">
          ${task.completed ? "✓" : "○"}
        </div>

        <div class="task-info">

          <div class="task-title">
            ${escapeHtml(task.title)}
          </div>

          <div class="task-meta">

            <span>
              ${escapeHtml(
                getCategoryName(task.category)
              )}
            </span>

            <span>
              ${escapeHtml(
                getDifficultyName(task.difficulty)
              )}
            </span>

          </div>

        </div>

      </div>


      <div class="task-reward">

        <span>
          +${task.exp_reward} EXP
        </span>

        <span>
          +${task.gold_reward} 🪙
        </span>

      </div>

    `;


    // 已完成任務不再重複領獎
    if (!task.completed) {

      taskElement.addEventListener(
        "click",
        () => toggleSupabaseTask(
          taskElement,
          task
        )
      );

    }


    container.appendChild(taskElement);

  });
}


// ========================================
// 完成任務
// ========================================

async function toggleSupabaseTask(
  element,
  task
) {

  if (!currentUser) {

    showSystemMessage(
      "請先登入",
      "error"
    );

    return;
  }


  if (task.completed) {

    showSystemMessage(
      "這個任務已經完成",
      "normal"
    );

    return;
  }


  // 防止使用者連續快速點擊
  element.style.pointerEvents = "none";


  showSystemMessage(
    "正在完成任務..."
  );


  const { data, error } =
    await supabaseClient.rpc(
      "complete_task",
      {
        p_task_id: task.id
      }
    );


  if (error) {

    console.error(
      "完成任務失敗：",
      error
    );

    element.style.pointerEvents = "auto";

    showSystemMessage(
      "完成任務失敗：" + error.message,
      "error"
    );

    return;
  }


  console.log(
    "完成任務結果：",
    data
  );


  if (!data || !data.success) {

    element.style.pointerEvents = "auto";

    showSystemMessage(
      data?.message || "任務無法完成",
      "error"
    );

    return;
  }


  // 更新本地玩家資料
  currentProfile = {
    ...currentProfile,
    level: data.level,
    exp: data.exp,
    gold: data.gold
  };


  // 更新任務狀態
  task.completed = true;
  task.completed_at = new Date().toISOString();


  // 更新畫面
  updateUI();


  renderTasks(currentTasks);


  // 任務完成提示
  showSystemMessage(
    `任務完成！ +${data.task_exp} EXP +${data.task_gold} 🪙`,
    "success"
  );


  // 如果升級
  if (
    data.level >
    (currentProfile.previousLevel || data.level)
  ) {

    setTimeout(() => {

      showSystemMessage(
        `🎉 升級成功！現在是 Lv.${data.level}`,
        "success"
      );

    }, 500);

  }

}


// ========================================
// 舊版 toggleTask 相容
// ========================================

function toggleTask(element) {

  const taskId =
    Number(element?.dataset?.taskId);

  const task =
    currentTasks.find(
      item => item.id === taskId
    );

  if (!task) {
    return;
  }

  toggleSupabaseTask(
    element,
    task
  );
}


// ========================================
// 更新玩家 UI
// ========================================

function updateUI() {

  if (!currentProfile) {
    return;
  }


  const level =
    currentProfile.level ?? 1;

  const exp =
    currentProfile.exp ?? 0;

  const gold =
    currentProfile.gold ?? 0;


  const requiredExp =
    getRequiredExp(level);


  // 玩家名稱
  const usernameElements =
    document.querySelectorAll(
      ".player-name, #player-name, [data-player-name]"
    );

  usernameElements.forEach(element => {

    element.textContent =
      currentProfile.username || "玩家";

  });


  // 等級
  const levelElements =
    document.querySelectorAll(
      ".player-level, #player-level, [data-player-level]"
    );

  levelElements.forEach(element => {

    element.textContent =
      `Lv.${level}`;

  });


  // EXP
  const expElements =
    document.querySelectorAll(
      ".player-exp, #player-exp, [data-player-exp]"
    );

  expElements.forEach(element => {

    element.textContent =
      `${exp} / ${requiredExp}`;

  });


  // Gold
  const goldElements =
    document.querySelectorAll(
      ".player-gold, #player-gold, [data-player-gold]"
    );

  goldElements.forEach(element => {

    element.textContent =
      `${gold}`;

  });


  // EXP Bar
  const expBars =
    document.querySelectorAll(
      ".exp-fill, #exp-fill, [data-exp-bar]"
    );

  const percentage =
    Math.min(
      100,
      (exp / requiredExp) * 100
    );


  expBars.forEach(bar => {

    bar.style.width =
      `${percentage}%`;

  });
}


// ========================================
// 載入玩家資料
// ========================================

async function loadProfile() {

  if (!currentUser) {
    return;
  }


  const { data, error } =
    await supabaseClient
      .from("profiles")
      .select(`
        id,
        username,
        level,
        exp,
        gold
      `)
      .eq("id", currentUser.id)
      .maybeSingle();


  if (error) {

    console.error(
      "玩家資料載入失敗：",
      error
    );

    showSystemMessage(
      "玩家資料載入失敗",
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


  currentProfile = data;

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

  const { data, error } =
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
      "登入失敗：" + error.message,
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

  const { data, error } =
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
      "註冊失敗：" + error.message,
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

  const { error } =
    await supabaseClient.auth.signOut();


  if (error) {

    console.error(
      "登出失敗：",
      error
    );

    return;
  }


  currentUser = null;
  currentProfile = null;
  currentTasks = [];


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

function filterTasks(category) {

  if (category === "all") {

    renderTasks(currentTasks);

    return;
  }


  const filtered =
    currentTasks.filter(
      task =>
        task.category === category
    );


  renderTasks(filtered);
}


// ========================================
// 初始化
// ========================================

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    console.log(
      "神級人生逆襲系統啟動"
    );


    await checkAuth();

  }
);


// ========================================
// 暴露給 HTML
// ========================================

window.login = login;
window.register = register;
window.logout = logout;
window.toggleTask = toggleTask;
window.filterTasks = filterTasks;
