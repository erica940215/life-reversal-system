/* ==================================================
   🤖 AI 記錄助手
   流程：文字 → AI 拆成項目 → 預覽勾選 → 按「寫入」才存進資料庫
   依賴 script.js 的全域函式與變數（db、currentUser、getToday…）
================================================== */

const AI_FUNCTION_NAME = "ai-parse";

const AI_TYPE_LABELS = {
  sleep: "😴 睡眠",
  meal: "🍱 三餐",
  task: "✅ 任務",
  idea: "💡 想法"
};

const AI_DIFFICULTY_LABELS = {
  easy: "簡單",
  normal: "普通",
  hard: "困難",
  epic: "史詩"
};

let aiItems = [];      // 已驗證的建議；每筆都有 ok / problem
let aiBusy = false;


function aiEl(id) {
  return document.getElementById(id);
}


function aiSetMsg(text, isError = false) {
  const el = aiEl("ai-msg");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-error", isError);
}


function aiIsTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}


function aiIsDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (Number.isNaN(new Date(value + "T00:00:00Z").getTime())) return false;
  return value <= getToday();
}


/* 前端再驗一次 AI 回傳的內容，不信任伺服器原樣送來的資料 */
function aiNormalizeItem(raw) {

  const today = getToday();
  const type = raw && raw.type;
  const bad = (problem) => ({ type, ok: false, problem });

  if (type === "sleep") {

    const date = raw.date || shiftDate(today, -1);
    const bed = raw.bed_time || "";
    const wake = raw.wake_time || "";

    if (!aiIsDate(date)) return bad("日期不正確（不能是未來）");
    if (!bed && !wake) return bad("沒有睡覺或起床時間");
    if (bed && !aiIsTime(bed)) return bad("睡覺時間格式不正確");
    if (wake && !aiIsTime(wake)) return bad("起床時間格式不正確");

    return { type, ok: true, date, bed_time: bed, wake_time: wake };
  }

  if (type === "meal") {

    const date = raw.date || today;
    const mealType = ["breakfast", "lunch", "dinner", "snack"].includes(raw.meal_type)
      ? raw.meal_type
      : null;
    const skipped = raw.skipped === true;
    const content = String(raw.content || "").trim().slice(0, 200);
    const cost = raw.cost === undefined || raw.cost === null ? null : Number(raw.cost);

    if (!aiIsDate(date)) return bad("日期不正確（不能是未來）");
    if (!mealType) return bad("不認識這一餐");
    if (!skipped && !content) return bad("沒有寫吃了什麼");
    if (cost !== null && (!Number.isInteger(cost) || cost < 0 || cost > 100000)) {
      return bad("金額不正確");
    }

    return { type, ok: true, date, meal_type: mealType, content, skipped, cost };
  }

  if (type === "task") {

    const title = String(raw.title || "").trim().slice(0, 60);
    const categoryKeys = taskCategories.map(category => category.key);
    const category = categoryKeys.includes(raw.category) ? raw.category : "daily";
    const difficulty = Object.keys(AI_DIFFICULTY_LABELS).includes(raw.difficulty)
      ? raw.difficulty
      : "normal";

    if (!title) return bad("沒有任務名稱");

    return { type, ok: true, title, category, difficulty };
  }

  if (type === "idea") {

    const content = String(raw.content || "").trim().slice(0, 500);
    const categoryKeys = IDEA_CATEGORIES.map(category => category.key);
    const category = categoryKeys.includes(raw.category) ? raw.category : "idea";

    if (!content) return bad("沒有內容");

    return { type, ok: true, content, category };
  }

  return bad("不認識的類型");
}


function aiItemText(item) {

  if (item.type === "sleep") {
    return `${shortDateWithWeekday(item.date)}：睡 ${item.bed_time || "—"} ／ 起 ${item.wake_time || "—"}`;
  }

  if (item.type === "meal") {

    const label = getMealType(item.meal_type).label;
    const when = item.date === getToday() ? "" : `（${shortDateWithWeekday(item.date)}）`;

    if (item.skipped) return `${label}${when}：沒吃`;

    const cost = item.cost === null ? "" : `．$${item.cost}`;

    return `${label}${when}：${item.content}${cost}`;
  }

  if (item.type === "task") {
    return `${item.title}（${getCategoryLabel(item.category)}．${AI_DIFFICULTY_LABELS[item.difficulty]}）`;
  }

  if (item.type === "idea") {
    const found = IDEA_CATEGORIES.find(category => category.key === item.category);
    return `${item.content}（${found ? found.label : "💡 點子"}）`;
  }

  return "";
}


function aiRenderItems() {

  const box = aiEl("ai-results");
  const commitBtn = aiEl("ai-commit-btn");

  if (!box || !commitBtn) return;

  box.innerHTML = aiItems.map((item, index) => {

    const label = escapeHtml(AI_TYPE_LABELS[item.type] || "❓ 未知");

    if (!item.ok) {
      return `
        <label class="ai-item ai-item-bad">
          <input type="checkbox" disabled>
          <span><b>${label}</b> 無法寫入：${escapeHtml(item.problem)}</span>
        </label>`;
    }

    return `
      <label class="ai-item">
        <input type="checkbox" data-ai-index="${index}" checked>
        <span><b>${label}</b> ${escapeHtml(aiItemText(item))}</span>
      </label>`;

  }).join("");

  commitBtn.hidden = !aiItems.some(item => item.ok);

}


async function aiErrorText(error) {

  let message = error && error.message ? error.message : "未知錯誤";

  /* supabase-js 對非 2xx 只給通用訊息，真正原因在 response 內容 */
  try {
    if (error && error.context && typeof error.context.json === "function") {
      const body = await error.context.json();
      if (body && body.error) message = body.error;
    }
  } catch (_) {}

  return message;

}


async function aiParse() {

  if (aiBusy) return;

  if (!currentUser) {
    aiSetMsg("請先登入", true);
    return;
  }

  const input = aiEl("ai-input");
  const button = aiEl("ai-parse-btn");
  const text = input.value.trim();

  if (!text) {
    aiSetMsg("先輸入一段文字", true);
    input.focus();
    return;
  }

  aiBusy = true;
  button.disabled = true;
  aiSetMsg("AI 解析中…");

  try {

    const { data, error } = await db.functions.invoke(AI_FUNCTION_NAME, {
      body: {
        text,
        today: getToday(),
        taskCategories: taskCategories.map(category => ({ key: category.key })),
        ideaCategories: IDEA_CATEGORIES.map(category => ({ key: category.key }))
      }
    });

    if (error) throw error;

    const rawItems = data && Array.isArray(data.items) ? data.items : [];

    aiItems = rawItems.slice(0, 20).map(aiNormalizeItem);

    aiSetMsg(
      aiItems.length
        ? `解析出 ${aiItems.length} 筆，確認後按「寫入勾選的項目」`
        : "沒有解析出可記錄的內容"
    );

    aiRenderItems();

  } catch (error) {

    console.error("AI 解析失敗：", error);
    aiSetMsg("解析失敗：" + await aiErrorText(error), true);

  } finally {

    aiBusy = false;
    button.disabled = false;

  }

}


/* 寫入單一項目：沿用 script.js 既有的規則（時間換算、獎勵、欄位） */
async function aiWriteItem(item) {

  const uid = currentUser.id;
  const today = getToday();

  if (item.type === "sleep") {

    const night = item.date;

    const bedIso = item.bed_time
      ? taipeiToIso(item.bed_time < "06:00" ? shiftDate(night, 1) : night, item.bed_time)
      : null;

    const wakeIso = item.wake_time
      ? taipeiToIso(shiftDate(night, 1), item.wake_time)
      : null;

    if (bedIso && new Date(bedIso).getTime() > Date.now()) throw new Error("睡覺時間不能是未來");
    if (wakeIso && new Date(wakeIso).getTime() > Date.now()) throw new Error("起床時間不能是未來");
    if (bedIso && wakeIso && new Date(wakeIso) <= new Date(bedIso)) throw new Error("起床要比睡覺晚");

    /* 只送有的欄位，避免蓋掉同一晚已經記好的另一個時間 */
    const fields = {};
    if (bedIso) fields.bed_at = bedIso;
    if (wakeIso) fields.wake_at = wakeIso;

    const error = await upsertSleepLog(night, fields);
    if (error) throw error;

    if (night === today || night === shiftDate(today, -1)) {
      await syncSleepReward(night);
    }

    return;
  }

  if (item.type === "meal") {

    const { error } = await db
      .from("meal_logs")
      .upsert(
        {
          user_id: uid,
          log_date: item.date,
          meal_type: item.meal_type,
          content: item.skipped ? "" : item.content,
          skipped: item.skipped,
          cost: item.skipped ? null : item.cost
        },
        { onConflict: "user_id,log_date,meal_type" }
      );

    if (error) throw error;

    return;
  }

  if (item.type === "task") {

    const reward = getTaskReward(item.difficulty);

    const { error } = await db
      .from("tasks")
      .insert({
        user_id: uid,
        title: item.title,
        category: item.category,
        difficulty: item.difficulty,
        exp_reward: reward.exp,
        gold_reward: reward.gold,
        task_date: today,
        completed: false
      });

    if (error) throw error;

    return;
  }

  if (item.type === "idea") {

    const { error } = await db
      .from("ideas")
      .insert({
        user_id: uid,
        content: item.content,
        category: item.category,
        idea_date: today
      });

    if (error) throw error;

    return;
  }

  throw new Error("不認識的類型");

}


async function aiCommit() {

  if (aiBusy || !currentUser) return;

  const picked = [...document.querySelectorAll("input[data-ai-index]:checked")]
    .map(el => aiItems[Number(el.dataset.aiIndex)])
    .filter(item => item && item.ok);

  if (!picked.length) {
    aiSetMsg("先勾選要寫入的項目", true);
    return;
  }

  const button = aiEl("ai-commit-btn");

  aiBusy = true;
  button.disabled = true;
  aiSetMsg("寫入中…");

  const done = [];
  const failed = [];

  for (const item of picked) {
    try {
      await aiWriteItem(item);
      done.push(item);
    } catch (error) {
      console.error("AI 寫入失敗：", item, error);
      failed.push(`${AI_TYPE_LABELS[item.type]}：${error.message || error}`);
    }
  }

  /* 重新載入各模組，讓畫面看到新資料 */
  for (const loader of [loadTasks, loadTaskManagement, loadIdeas, loadMeals, loadSleep]) {
    try {
      await loader();
    } catch (error) {
      console.error("重新載入失敗：", loader.name, error);
    }
  }

  aiItems = aiItems.filter(item => !done.includes(item));

  if (failed.length === 0) {
    aiEl("ai-input").value = "";
    aiItems = [];
  }

  aiRenderItems();

  aiBusy = false;
  button.disabled = false;

  if (failed.length) {
    aiSetMsg(`已寫入 ${done.length} 筆；失敗：${failed.join("、")}`, true);
  } else {
    aiSetMsg(`✅ 已寫入 ${done.length} 筆`);
    showToast(`🤖 已寫入 ${done.length} 筆`);
  }

}


/* Ctrl+Enter（Mac 用 Cmd+Enter）快速解析 */
(function aiInitShortcut() {

  const input = document.getElementById("ai-input");

  if (!input) return;

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      aiParse();
    }
  });

})();
