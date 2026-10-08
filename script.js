```javascript
/* =========================================================
   神級人生逆襲系統
   script.js
   ========================================================= */


/* =========================================================
   全域變數
========================================================= */

let currentUser = null;
let allTasks = [];
let currentTaskFilter = "all";
let currentManagementFilter = "all";


/* =========================================================
   頁面初始化
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

    console.log("神級人生逆襲系統 JS 載入成功");

    // 確認 Supabase 是否存在
    if (typeof supabase === "undefined") {
        console.error("Supabase 沒有成功初始化");
        showAuthMessage(
            "系統初始化失敗：Supabase 沒有載入",
            "error"
        );
        return;
    }

    // 監聽登入狀態
    supabase.auth.onAuthStateChange(async (event, session) => {

        console.log("Auth 狀態：", event);

        if (session && session.user) {

            currentUser = session.user;

            showApp();

            await loadPlayer();

            await loadTasks();

        } else {

            currentUser = null;

            showLogin();

        }

    });


    // 取得目前登入狀態
    const {
        data,
        error
    } = await supabase.auth.getSession();

    if (error) {

        console.error(
            "取得登入狀態失敗：",
            error
        );

        showAuthMessage(
            error.message,
            "error"
        );

        return;
    }

    if (data.session) {

        currentUser = data.session.user;

        showApp();

        await loadPlayer();

        await loadTasks();

    } else {

        showLogin();

    }

});


/* =========================================================
   登入 / 註冊 UI
========================================================= */

function showLogin() {

    const authSection =
        document.getElementById("auth-section");

    const appSection =
        document.getElementById("app-section");

    if (authSection) {
        authSection.style.display = "block";
    }

    if (appSection) {
        appSection.style.display = "none";
    }

}


function showApp() {

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

}


/* =========================================================
   顯示登入訊息
========================================================= */

function showAuthMessage(message, type = "") {

    const element =
        document.getElementById("auth-message");

    if (!element) return;

    element.textContent = message;

    element.className = "message";

    if (type) {
        element.classList.add(type);
    }

}


/* =========================================================
   登入
========================================================= */

async function login() {

    console.log("login() 被執行");

    const emailInput =
        document.getElementById("email");

    const passwordInput =
        document.getElementById("password");

    if (!emailInput || !passwordInput) {

        console.error(
            "找不到 email 或 password 欄位"
        );

        return;
    }


    const email =
        emailInput.value.trim();

    const password =
        passwordInput.value;


    if (!email || !password) {

        showAuthMessage(
            "請輸入 Email 和密碼",
            "error"
        );

        return;
    }


    showAuthMessage(
        "登入中……"
    );


    try {

        const {
            data,
            error
        } = await supabase.auth.signInWithPassword({

            email: email,

            password: password

        });


        if (error) {

            console.error(
                "登入失敗：",
                error
            );

            showAuthMessage(
                translateSupabaseError(error),
                "error"
            );

            return;
        }


        console.log(
            "登入成功：",
            data.user
        );


        currentUser = data.user;

        showAuthMessage(
            "登入成功！",
            "success"
        );


        showApp();

        await loadPlayer();

        await loadTasks();


    } catch (error) {

        console.error(
            "登入發生錯誤：",
            error
        );

        showAuthMessage(
            "登入時發生錯誤，請稍後再試。",
            "error"
        );

    }

}


/* =========================================================
   註冊
========================================================= */

async function register() {

    console.log("register() 被執行");

    const emailInput =
        document.getElementById("email");

    const passwordInput =
        document.getElementById("password");


    const email =
        emailInput.value.trim();

    const password =
        passwordInput.value;


    if (!email || !password) {

        showAuthMessage(
            "請輸入 Email 和密碼",
            "error"
        );

        return;
    }


    if (password.length < 6) {

        showAuthMessage(
            "密碼至少需要 6 碼",
            "error"
        );

        return;
    }


    showAuthMessage(
        "註冊中……"
    );


    try {

        const {
            data,
            error
        } = await supabase.auth.signUp({

            email: email,

            password: password

        });


        if (error) {

            console.error(
                "註冊失敗：",
                error
            );

            showAuthMessage(
                translateSupabaseError(error),
                "error"
            );

            return;
        }


        console.log(
            "註冊結果：",
            data
        );


        if (data.session) {

            currentUser =
                data.user;

            showAuthMessage(
                "註冊成功！",
                "success"
            );

            showApp();

            await loadPlayer();

            await loadTasks();

        } else {

            showAuthMessage(
                "註冊成功！請到 Email 完成驗證後再登入。",
                "success"
            );

        }


    } catch (error) {

        console.error(
            "註冊發生錯誤：",
            error
        );

        showAuthMessage(
            "註冊時發生錯誤，請稍後再試。",
            "error"
        );

    }

}


/* =========================================================
   登出
========================================================= */

async function logout() {

    console.log("logout() 被執行");


    try {

        const {
            error
        } = await supabase.auth.signOut();


        if (error) {

            console.error(
                "登出失敗：",
                error
            );

            return;
        }


        currentUser = null;

        allTasks = [];

        showLogin();


    } catch (error) {

        console.error(
            "登出錯誤：",
            error
        );

    }

}


/* =========================================================
   玩家資料
========================================================= */

async function loadPlayer() {

    if (!currentUser) return;


    try {

        const {
            data,
            error
        } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", currentUser.id)
            .maybeSingle();


        if (error) {

            console.error(
                "載入玩家資料失敗：",
                error
            );

            return;
        }


        if (!data) {

            console.log(
                "找不到 profiles，建立玩家資料"
            );

            await createPlayer();

            return;
        }


        updatePlayerUI(data);


    } catch (error) {

        console.error(
            "loadPlayer 錯誤：",
            error
        );

    }

}


/* =========================================================
   建立玩家
========================================================= */

async function createPlayer() {

    if (!currentUser) return;


    const player = {

        id: currentUser.id,

        email: currentUser.email,

        username:
            currentUser.email
                ? currentUser.email.split("@")[0]
                : "玩家",

        level: 1,

        exp: 50,

        gold: 100

    };


    const {
        data,
        error
    } = await supabase
        .from("profiles")
        .insert(player)
        .select()
        .single();


    if (error) {

        console.error(
            "建立玩家資料失敗：",
            error
        );

        return;
    }


    updatePlayerUI(data);

}


/* =========================================================
   更新玩家畫面
========================================================= */

function updatePlayerUI(player) {

    const level =
        player.level ?? 1;

    const exp =
        player.exp ?? 0;

    const gold =
        player.gold ?? 0;


    const levelElement =
        document.getElementById("player-level");

    const expElement =
        document.getElementById("player-exp");

    const goldElement =
        document.getElementById("player-gold");

    const usernameElement =
        document.getElementById("username");


    if (levelElement) {

        levelElement.textContent =
            `Lv.${level}`;

    }


    if (expElement) {

        expElement.textContent =
            exp;

    }


    if (goldElement) {

        goldElement.textContent =
            gold;

    }


    if (usernameElement) {

        usernameElement.textContent =
            player.username ||
            currentUser?.email ||
            "玩家";

    }


    updateExpBar(
        level,
        exp
    );

}


/* =========================================================
   EXP 條
========================================================= */

function updateExpBar(level, exp) {

    const requiredExp =
        level * 100;


    const percentage =
        Math.min(
            100,
            Math.max(
                0,
                (exp / requiredExp) * 100
            )
        );


    const progress =
        document.getElementById(
            "exp-progress"
        );

    const text =
        document.getElementById(
            "exp-text"
        );


    if (progress) {

        progress.style.width =
            `${percentage}%`;

    }


    if (text) {

        text.textContent =
            `${exp} / ${requiredExp} EXP`;

    }

}


/* =========================================================
   載入任務
========================================================= */

async function loadTasks() {

    if (!currentUser) return;


    try {

        const {
            data,
            error
        } = await supabase
            .from("tasks")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("created_at", {
                ascending: false
            });


        if (error) {

            console.error(
                "載入任務失敗：",
                error
            );

            showTaskError(
                error.message
            );

            return;
        }


        allTasks =
            data || [];


        renderTodayTasks();

        renderManagementTasks();

        updateDailySummary();


    } catch (error) {

        console.error(
            "loadTasks 錯誤：",
            error
        );

    }

}


/* =========================================================
   今日任務
========================================================= */

function renderTodayTasks() {

    const container =
        document.getElementById(
            "task-list"
        );


    if (!container) return;


    const todayTasks =
        getTodayTasks();


    const filteredTasks =
        todayTasks.filter(task => {

            if (
                currentTaskFilter === "all"
            ) {

                return true;

            }

            return (
                task.category ===
                currentTaskFilter
            );

        });


    if (
        filteredTasks.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-state">
                今天沒有符合條件的任務
            </div>
        `;

        return;
    }


    container.innerHTML =
        filteredTasks
            .map(
                task =>
                    createTaskHTML(task)
            )
            .join("");

}


/* =========================================================
   判斷今天的任務
========================================================= */

function getTodayTasks() {

    const today =
        new Date();

    const todayString =
        formatDate(today);


    const dayOfWeek =
        today.getDay() === 0
            ? 7
            : today.getDay();


    return allTasks.filter(task => {

        // 一次性任務
        if (
            !task.is_recurring
        ) {

            if (!task.task_date) {

                return true;

            }

            return (
                task.task_date ===
                todayString
            );

        }


        // 已停用
        if (
            task.is_active === false
        ) {

            return false;

        }


        // 超過結束日期
        if (
            task.repeat_end_date &&
            todayString >
                task.repeat_end_date
        ) {

            return false;

        }


        // 每日
        if (
            task.repeat_type ===
            "daily"
        ) {

            return true;

        }


        // 每週
        if (
            task.repeat_type ===
            "weekly"
        ) {

            let days =
                task.repeat_days;


            if (
                typeof days ===
                "string"
            ) {

                try {

                    days =
                        JSON.parse(days);

                } catch {

                    days = [];

                }

            }


            if (
                !Array.isArray(days)
            ) {

                days = [];

            }


            return days.includes(
                dayOfWeek
            );

        }


        return false;

    });

}


/* =========================================================
   任務 HTML
========================================================= */

function createTaskHTML(task) {

    const completed =
        isTaskCompletedToday(task);


    const difficultyText = {

        easy: "🟢 簡單",

        normal: "🟡 普通",

        hard: "🔴 困難"

    };


    const categoryText = {

        study: "📚 學習",

        toeic: "📝 多益",

        health: "❤️ 健康",

        focus: "🎯 專注",

        life: "🏠 生活",

        other: "📌 其他"

    };


    return `

        <div
            class="task-item ${
                completed
                    ? "completed"
                    : ""
            }"
        >

            <div class="task-main">

                <div class="task-title">
                    ${escapeHTML(
                        task.title
                    )}
                </div>

                <div class="task-meta">

                    <span class="tag">
                        ${
                            categoryText[
                                task.category
                            ] ||
                            "📌 其他"
                        }
                    </span>

                    <span class="tag">
                        ${
                            difficultyText[
                                task.difficulty
                            ] ||
                            "🟡 普通"
                        }
                    </span>

                    <span class="tag">
                        +${getExpReward(
                            task.difficulty
                        )} EXP
                    </span>

                    <span class="tag">
                        +${getGoldReward(
                            task.difficulty
                        )} Gold
                    </span>

                </div>

            </div>


            <div class="task-actions">

                ${
                    completed

                    ? `
                        <button
                            type="button"
                            onclick="uncompleteTask('${task.id}')"
                        >
                            ↩️ 取消完成
                        </button>
                    `

                    : `
                        <button
                            type="button"
                            class="primary-button"
                            onclick="completeTask('${task.id}')"
                        >
                            ✅ 完成
                        </button>
                    `
                }

            </div>

        </div>

    `;

}


/* =========================================================
   完成任務
========================================================= */

async function completeTask(taskId) {

    if (!currentUser) return;


    const task =
        allTasks.find(
            t => String(t.id) ===
                String(taskId)
        );


    if (!task) return;


    if (
        isTaskCompletedToday(task)
    ) {

        return;

    }


    const exp =
        getExpReward(
            task.difficulty
        );

    const gold =
        getGoldReward(
            task.difficulty
        );


    try {

        const {
            error
        } = await supabase
            .from("task_completions")
            .insert({

                user_id:
                    currentUser.id,

                task_id:
                    task.id,

                completed_date:
                    formatDate(
                        new Date()
                    ),

                exp_earned:
                    exp,

                gold_earned:
                    gold

            });


        if (error) {

            console.error(
                "完成任務失敗：",
                error
            );

            alert(
                translateSupabaseError(
                    error
                )
            );

            return;
        }


        await addPlayerReward(
            exp,
            gold
        );


        await loadTasks();

        await loadPlayer();


    } catch (error) {

        console.error(
            "completeTask 錯誤：",
            error
        );

    }

}


/* =========================================================
   取消完成
========================================================= */

async function uncompleteTask(taskId) {

    if (!currentUser) return;


    const task =
        allTasks.find(
            t => String(t.id) ===
                String(taskId)
        );


    if (!task) return;


    const today =
        formatDate(
            new Date()
        );


    const {
        data,
        error
    } = await supabase
        .from("task_completions")
        .select("*")
        .eq(
            "user_id",
            currentUser.id
        )
        .eq(
            "task_id",
            task.id
        )
        .eq(
            "completed_date",
            today
        )
        .maybeSingle();


    if (error) {

        console.error(
            error
        );

        return;
    }


    if (!data) return;


    const exp =
        data.exp_earned || 0;

    const gold =
        data.gold_earned || 0;


    const {
        error:
            deleteError
    } = await supabase
        .from("task_completions")
        .delete()
        .eq(
            "id",
            data.id
        );


    if (deleteError) {

        console.error(
            deleteError
        );

        return;
    }


    await addPlayerReward(
        -exp,
        -gold
    );


    await loadTasks();

    await loadPlayer();

}


/* =========================================================
   判斷今天是否完成
========================================================= */

function isTaskCompletedToday(task) {

    if (
        !task.completions
    ) {

        return false;

    }


    const today =
        formatDate(
            new Date()
        );


    return task.completions
        .some(
            completion =>
                completion.completed_date ===
                today
        );

}


/* =========================================================
   更新每日摘要
========================================================= */

function updateDailySummary() {

    const tasks =
        getTodayTasks();


    let completed = 0;

    let todayExp = 0;

    let todayGold = 0;


    tasks.forEach(task => {

        if (
            isTaskCompletedToday(
                task
            )
        ) {

            completed++;

            todayExp +=
                getExpReward(
                    task.difficulty
                );

            todayGold +=
                getGoldReward(
                    task.difficulty
                );

        }

    });


    const total =
        tasks.length;


    const rate =
        total === 0
            ? 0
            : Math.round(
                (completed /
                    total) *
                100
            );


    setText(
        "daily-task-count",
        `${completed} / ${total}`
    );


    setText(
        "completion-rate",
        `${rate}%`
    );


    setText(
        "today-exp",
        `+${todayExp}`
    );


    setText(
        "today-gold",
        `+${todayGold}`
    );

}


/* =========================================================
   新增任務
========================================================= */

async function addTask() {

    if (!currentUser) {

        alert(
            "請先登入"
        );

        return;
    }


    const title =
        document
            .getElementById(
                "new-task-title"
            )
            .value
            .trim();


    const category =
        document
            .getElementById(
                "new-task-category"
            )
            .value;


    const difficulty =
        document
            .getElementById(
                "new-task-difficulty"
            )
            .value;


    const repeatMode =
        document.querySelector(
            'input[name="new-task-repeat"]:checked'
        )?.value || "none";


    if (!title) {

        showAddTaskMessage(
            "請輸入任務名稱",
            "error"
        );

        return;
    }


    const task = {

        user_id:
            currentUser.id,

        title:
            title,

        category:
            category,

        difficulty:
            difficulty,

        is_recurring:
            repeatMode ===
            "repeat",

        is_active:
            true

    };


    if (
        repeatMode ===
        "repeat"
    ) {

        const repeatType =
            document.querySelector(
                'input[name="repeat-type"]:checked'
            )?.value ||
            "daily";


        task.repeat_type =
            repeatType;


        if (
            repeatType ===
            "weekly"
        ) {

            const checked =
                document.querySelectorAll(
                    'input[name="repeat-day"]:checked'
                );


            const days =
                Array.from(
                    checked
                ).map(
                    input =>
                        Number(
                            input.value
                        )
                );


            if (
                days.length === 0
            ) {

                showAddTaskMessage(
                    "請至少選擇一個星期",
                    "error"
                );

                return;
            }


            task.repeat_days =
                days;

        }


        const endDate =
            document.getElementById(
                "repeat-end-date"
            ).value;


        if (endDate) {

            task.repeat_end_date =
                endDate;

        }

    } else {

        task.task_date =
            formatDate(
                new Date()
            );

    }


    showAddTaskMessage(
        "建立中……"
    );


    try {

        const {
            data,
            error
        } = await supabase
            .from("tasks")
            .insert(task)
            .select()
            .single();


        if (error) {

            console.error(
                "新增任務失敗：",
                error
            );

            showAddTaskMessage(
                translateSupabaseError(
                    error
                ),
                "error"
            );

            return;
        }


        console.log(
            "新增任務成功：",
            data
        );


        document
            .getElementById(
                "new-task-title"
            )
            .value = "";


        showAddTaskMessage(
            "任務建立成功！",
            "success"
        );


        resetTaskForm();


        await loadTasks();


    } catch (error) {

        console.error(
            error
        );

        showAddTaskMessage(
            "建立任務時發生錯誤",
            "error"
        );

    }

}


/* =========================================================
   重複任務設定
========================================================= */

function toggleRepeatSettings() {

    const mode =
        document.querySelector(
            'input[name="new-task-repeat"]:checked'
        )?.value;


    const settings =
        document.getElementById(
            "repeat-settings"
        );


    if (!settings) return;


    if (
        mode ===
        "repeat"
    ) {

        settings.style.display =
            "block";

    } else {

        settings.style.display =
            "none";

    }

}


/* =========================================================
   每週設定
========================================================= */

function toggleWeekdaySettings() {

    const type =
        document.querySelector(
            'input[name="repeat-type"]:checked'
        )?.value;


    const settings =
        document.getElementById(
            "weekday-settings"
        );


    if (!settings) return;


    if (
        type ===
        "weekly"
    ) {

        settings.style.display =
            "block";

    } else {

        settings.style.display =
            "none";

    }

}


/* =========================================================
   任務篩選
========================================================= */

function filterTasks(
    category,
    button
) {

    currentTaskFilter =
        category;


    document
        .querySelectorAll(
            "#app-section .task-filter"
        );


    if (button) {

        const parent =
            button.parentElement;

        if (parent) {

            parent
                .querySelectorAll(
                    "button"
                )
                .forEach(
                    btn =>
                        btn.classList.remove(
                            "active"
                        )
                );

            button.classList.add(
                "active"
            );

        }

    }


    renderTodayTasks();

}


/* =========================================================
   任務管理
========================================================= */

async function renderManagementTasks() {

    const container =
        document.getElementById(
            "task-management-list"
        );


    if (!container) return;


    let tasks =
        [...allTasks];


    if (
        currentManagementFilter ===
        "once"
    ) {

        tasks =
            tasks.filter(
                task =>
                    !task.is_recurring
            );

    }


    if (
        currentManagementFilter ===
        "repeat"
    ) {

        tasks =
            tasks.filter(
                task =>
                    task.is_recurring
            );

    }


    if (
        tasks.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-state">
                尚未建立任務
            </div>
        `;

        return;
    }


    container.innerHTML =
        tasks
            .map(
                task =>
                    createManagementHTML(
                        task
                    )
            )
            .join("");

}


/* =========================================================
   任務管理 HTML
========================================================= */

function createManagementHTML(task) {

    const type =
        task.is_recurring
            ? "🔁 重複任務"
            : "📌 一次性";


    const status =
        task.is_active === false
            ? "停用"
            : "啟用";


    const statusClass =
        task.is_active === false
            ? "status-disabled"
            : "status-enabled";


    let repeatText = "";


    if (
        task.is_recurring
    ) {

        if (
            task.repeat_type ===
            "daily"
        ) {

            repeatText =
                "每天";

        } else {

            repeatText =
                "每週";

        }

    }


    return `

        <div class="management-item">

            <div class="management-header">

                <div>

                    <div class="management-title">
                        ${escapeHTML(
                            task.title
                        )}
                    </div>

                    <div class="management-meta">

                        <span class="tag">
                            ${type}
                        </span>

                        <span class="tag">
                            ${
                                repeatText
                            }
                        </span>

                        <span class="tag ${statusClass}">
                            ${status}
                        </span>

                    </div>

                </div>

            </div>


            <div class="management-actions">

                ${
                    task.is_recurring
                        ? `
                            <button
                                type="button"
                                onclick="toggleTaskActive('${task.id}')"
                            >
                                ${
                                    task.is_active === false
                                        ? "▶️ 啟用"
                                        : "⏸️ 停用"
                                }
                            </button>
                        `
                        : ""
                }


                <button
                    type="button"
                    class="danger-button"
                    onclick="deleteTask('${task.id}')"
                >
                    🗑️ 刪除
                </button>

            </div>

        </div>

    `;

}


/* =========================================================
   管理篩選
========================================================= */

function filterManagedTasks(
    filter,
    button
) {

    currentManagementFilter =
        filter;


    if (button) {

        const parent =
            button.parentElement;

        if (parent) {

            parent
                .querySelectorAll(
                    "button"
                )
                .forEach(
                    btn =>
                        btn.classList.remove(
                            "active"
                        )
                );

            button.classList.add(
                "active"
            );

        }

    }


    renderManagementTasks();

}


/* =========================================================
   啟用 / 停用重複任務
========================================================= */

async function toggleTaskActive(
    taskId
) {

    const task =
        allTasks.find(
            t =>
                String(t.id) ===
                String(taskId)
        );


    if (!task) return;


    const {
        error
    } = await supabase
        .from("tasks")
        .update({

            is_active:
                task.is_active === false

        })
        .eq(
            "id",
            task.id
        );


    if (error) {

        console.error(
            error
        );

        alert(
            translateSupabaseError(
                error
            )
        );

        return;
    }


    await loadTasks();

}


/* =========================================================
   刪除任務
========================================================= */

async function deleteTask(
    taskId
) {

    const task =
        allTasks.find(
            t =>
                String(t.id) ===
                String(taskId)
        );


    if (!task) return;


    const confirmed =
        confirm(
            `確定要刪除「${task.title}」嗎？`
        );


    if (!confirmed) return;


    try {

        const {
            error
        } = await supabase
            .from("tasks")
            .delete()
            .eq(
                "id",
                task.id
            );


        if (error) {

            console.error(
                "刪除任務失敗：",
                error
            );

            alert(
                translateSupabaseError(
                    error
                )
            );

            return;
        }


        await loadTasks();


    } catch (error) {

        console.error(
            error
        );

    }

}


/* =========================================================
   玩家 EXP / Gold
========================================================= */

async function addPlayerReward(
    exp,
    gold
) {

    if (!currentUser) return;


    const {
        data: player,
        error
    } = await supabase
        .from("profiles")
        .select(
            "level, exp, gold"
        )
        .eq(
            "id",
            currentUser.id
        )
        .single();


    if (error) {

        console.error(
            "取得玩家資料失敗：",
            error
        );

        return;
    }


    let level =
        player.level ?? 1;

    let currentExp =
        (player.exp ?? 0) +
        exp;

    let currentGold =
        (player.gold ?? 0) +
        gold;


    if (
        currentGold < 0
    ) {

        currentGold = 0;

    }


    // 升級
    while (
        currentExp >=
        level * 100
    ) {

        currentExp -=
            level * 100;

        level++;

    }


    // 防止取消完成時 EXP 變負數
    if (
        currentExp < 0
    ) {

        currentExp = 0;

    }


    const {
        error:
            updateError
    } = await supabase
        .from("profiles")
        .update({

            level:
                level,

            exp:
                currentExp,

            gold:
                currentGold

        })
        .eq(
            "id",
            currentUser.id
        );


    if (updateError) {

        console.error(
            "更新玩家獎勵失敗：",
            updateError
        );

    }

}


/* =========================================================
   獎勵
========================================================= */

function getExpReward(
    difficulty
) {

    switch (
        difficulty
    ) {

        case "easy":
            return 10;

        case "hard":
            return 30;

        case "normal":
        default:
            return 20;

    }

}


function getGoldReward(
    difficulty
) {

    switch (
        difficulty
    ) {

        case "easy":
            return 10;

        case "hard":
            return 30;

        case "normal":
        default:
            return 20;

    }

}


/* =========================================================
   日期
========================================================= */

function formatDate(date) {

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


    return `${year}-${month}-${day}`;

}


/* =========================================================
   重置新增任務表單
========================================================= */

function resetTaskForm() {

    const repeatNone =
        document.querySelector(
            'input[name="new-task-repeat"][value="none"]'
        );


    if (repeatNone) {

        repeatNone.checked =
            true;

    }


    toggleRepeatSettings();


    const repeatDaily =
        document.querySelector(
            'input[name="repeat-type"][value="daily"]'
        );


    if (repeatDaily) {

        repeatDaily.checked =
            true;

    }


    toggleWeekdaySettings();


    document
        .querySelectorAll(
            'input[name="repeat-day"]'
        )
        .forEach(
            input =>
                input.checked =
                    false
        );


    const endDate =
        document.getElementById(
            "repeat-end-date"
        );


    if (endDate) {

        endDate.value = "";

    }

}


/* =========================================================
   新增任務訊息
========================================================= */

function showAddTaskMessage(
    message,
    type = ""
) {

    const element =
        document.getElementById(
            "add-task-message"
        );


    if (!element) return;


    element.textContent =
        message;


    element.className =
        "message";


    if (type) {

        element.classList.add(
            type
        );

    }

}


/* =========================================================
   任務錯誤
========================================================= */

function showTaskError(
    message
) {

    const container =
        document.getElementById(
            "task-list"
        );


    if (!container) return;


    container.innerHTML = `

        <div class="empty-state error">

            載入任務失敗：

            ${escapeHTML(
                message
            )}

        </div>

    `;

}


/* =========================================================
   DOM 小工具
========================================================= */

function setText(
    id,
    value
) {

    const element =
        document.getElementById(
            id
        );


    if (element) {

        element.textContent =
            value;

    }

}


/* =========================================================
   HTML 防注入
========================================================= */

function escapeHTML(
    text
) {

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


/* =========================================================
   Supabase 錯誤翻譯
========================================================= */

function translateSupabaseError(
    error
) {

    const message =
        error?.message ||
        String(error);


    if (
        message.includes(
            "Invalid login credentials"
        )
    ) {

        return "Email 或密碼錯誤。";

    }


    if (
        message.includes(
            "User already registered"
        )
    ) {

        return "這個 Email 已經註冊過了。";

    }


    if (
        message.includes(
            "Password should be at least"
        )
    ) {

        return "密碼長度不足，請至少輸入 6 碼。";

    }


    if (
        message.includes(
            "Email not confirmed"
        )
    ) {

        return "Email 尚未驗證，請先完成 Email 驗證。";

    }


    if (
        message.includes(
            "duplicate key"
        )
    ) {

        return "資料已經存在，請不要重複建立。";

    }


    return message;

}


/* =========================================================
   Debug
========================================================= */

console.log(
    "script.js 已完整載入"
);
```
