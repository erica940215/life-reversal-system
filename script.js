// ========================================
// 神級人生逆襲系統
// V1.1 點擊事件診斷版
// ========================================

const SUPABASE_URL =
  "https://smlaokhqhgzjhnxeqfen.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_2uJS9Kex4YSTQh1Bbh3H-w_4cPPW25j";


// ========================================
// Supabase
// ========================================

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


// ========================================
// 日期
// ========================================

function getToday() {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  return (
    year +
    "-" +
    month +
    "-" +
    day
  );

}


// ========================================
// HTML 安全處理
// ========================================

function escapeHtml(text) {

  if (
    text === null ||
    text === undefined
  ) {

    return "";

  }


  return String(text)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


// ========================================
// 系統提示
// ========================================

function showSystemMessage(
  message,
  type = "normal"
) {

  let box =
    document.getElementById(
      "system-message"
    );


  if (!box) {

    box =
      document.createElement(
        "div"
      );


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
      "999999";

    box.style.padding =
      "12px 20px";

    box.style.borderRadius =
      "10px";

    box.style.background =
      "#1f2937";

    box.style.color =
      "#ffffff";

    box.style.fontSize =
      "15px";

    box.style.fontWeight =
      "600";

    box.style.boxShadow =
      "0 5px 20px rgba(0,0,0,0.3)";


    document.body.appendChild(
      box
    );

  }


  box.textContent =
    message;


  if (
    type === "success"
  ) {

    box.style.background =
      "#166534";

  }
  else if (
    type === "error"
  ) {

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
    box._timer
  );


  box._timer =
    setTimeout(
      function() {

        box.style.display =
          "none";

      },
      3000
    );

}


// ========================================
// 分類名稱
// ========================================

function getCategoryName(
  category
) {

  const names = {

    study:
      "主科學習",

    toeic:
      "多益",

    focus:
      "專注",

    health:
      "健康",

    life:
      "生活",

    random:
      "隨機自律"

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

function getDifficultyName(
  difficulty
) {

  const names = {

    easy:
      "簡單",

    normal:
      "普通",

    hard:
      "困難"

  };


  return (
    names[difficulty] ||
    difficulty ||
    "普通"
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
      .select(
        `
        id,
        username,
        level,
        exp,
        gold
        `
      )
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
    "玩家：" +
    data.username
  );


  console.log(
    "Lv." +
    data.level +
    " EXP：" +
    data.exp +
    " 金幣：" +
    data.gold
  );


  updateUI();

}


// ========================================
// 載入今日任務
// ========================================

async function loadTodayTasks() {

  if (!currentUser) {

    console.log(
      "沒有登入玩家"
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
      .select(
        `
        id,
        title,
        category,
        difficulty,
        exp_reward,
        gold_reward,
        completed,
        completed_at,
        task_date
        `
      )
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
    "共 " +
    currentTasks.length +
    " 個任務"
  );


  renderTasks(
    currentTasks
  );

}


// ========================================
// 顯示任務
// ========================================

function renderTasks(
  tasks
) {

  const container =
    document.querySelector(
      ".tasks-container"
    );


  if (!container) {

    console.error(
      "❌ 找不到 .tasks-container"
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


  tasks.forEach(
    function(task) {

      const taskElement =
        document.createElement(
          "div"
        );


      taskElement.className =
        "task-item";


      if (
        task.completed
      ) {

        taskElement.classList.add(
          "completed"
        );

      }


      // ==================================
      // ★ 關鍵：任務 ID
      // ==================================

      taskElement.dataset.taskId =
        String(
          task.id
        );


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
            +${Number(
              task.exp_reward
            ) || 0} EXP
          </span>

          <span>
            +${Number(
              task.gold_reward
            ) || 0} 🪙
          </span>

        </div>

      `;


      container.appendChild(
        taskElement
      );

    }
  );


  console.log(
    "任務畫面渲染完成"
  );

}


// ========================================
// ★★★ 全頁面點擊診斷 ★★★
// ========================================
//
// 這裡先不完成任務。
// 只確認瀏覽器是否真的收到
// 任務卡片的點擊。
// ========================================

document.addEventListener(
  "click",
  function(event) {

    console.log(
      "偵測到頁面點擊"
    );


    const taskElement =
      event.target.closest(
        "[data-task-id]"
      );


    if (!taskElement) {

      return;

    }


    const taskId =
      taskElement.dataset.taskId;


    console.log(
      "================================"
    );


    console.log(
      "✅ 偵測到任務點擊！"
    );


    console.log(
      "任務 ID：",
      taskId
    );


    console.log(
      "點擊元素：",
      taskElement
    );


    console.log(
      "================================"
    );


    alert(
      "✅ JavaScript 有收到任務點擊！\n\n" +
      "任務 ID：" +
      taskId
    );

  },
  true
);


// ========================================
// 更新玩家 UI
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
    100 +
    (level - 1) * 50;


  // 玩家名稱

  const usernameElements =
    document.querySelectorAll(
      ".player-name, #player-name, [data-player-name]"
    );


  usernameElements.forEach(
    function(element) {

      element.textContent =
        username;

    }
  );


  // 等級

  const levelElements =
    document.querySelectorAll(
      ".player-level, #player-level, [data-player-level]"
    );


  levelElements.forEach(
    function(element) {

      element.textContent =
        "Lv." + level;

    }
  );


  // EXP

  const expElements =
    document.querySelectorAll(
      ".player-exp, #player-exp, [data-player-exp]"
    );


  expElements.forEach(
    function(element) {

      element.textContent =
        exp +
        " / " +
        requiredExp;

    }
  );


  // Gold

  const goldElements =
    document.querySelectorAll(
      ".player-gold, #player-gold, [data-player-gold]"
    );


  goldElements.forEach(
    function(element) {

      element.textContent =
        gold;

    }
  );


  // EXP 進度條

  const expBars =
    document.querySelectorAll(
      ".exp-fill, #exp-fill, [data-exp-bar]"
    );


  const percentage =
    Math.min(
      100,
      Math.max(
        0,
        exp /
        requiredExp *
        100
      )
    );


  expBars.forEach(
    function(bar) {

      bar.style.width =
        percentage +
        "%";

    }
  );

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
    await supabaseClient.auth
      .signInWithPassword({

        email:
          email,

        password:
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

  const {
    data,
    error
  } =
    await supabaseClient.auth
      .signUp({

        email:
          email,

        password:
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
    await supabaseClient.auth
      .signOut();


  if (error) {

    console.error(
      "登出失敗：",
      error
    );


    return;

  }


  currentUser =
    null;


  currentProfile =
    null;


  currentTasks =
    [];


  location.reload();

}


// ========================================
// 檢查登入
// ========================================

async function checkAuth() {

  console.log(
    "正在檢查登入狀態..."
  );


  const {
    data,
    error
  } =
    await supabaseClient.auth
      .getUser();


  if (error) {

    console.error(
      "登入狀態錯誤：",
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
      function(task) {

        return (
          task.category ===
          category
        );

      }
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
      "神級人生逆襲系統 V1.1"
    );


    console.log(
      "點擊診斷模式啟動"
    );


    console.log(
      "================================"
    );


    await checkAuth();

  }
);


// ========================================
// 給 HTML 使用
// ========================================

window.login =
  login;


window.register =
  register;


window.logout =
  logout;


window.filterTasks =
  filterTasks;


// ========================================
// 給其他舊程式相容
// ========================================

window.toggleTask =
  function(element) {

    console.log(
      "舊版 toggleTask 被呼叫",
      element
    );

  };
