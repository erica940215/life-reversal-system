/* ==================================================
   📅 日曆
   - 週檢視：拖移行程到任何時間（可跨天），點空白處新增
   - 今日頁：顯示今天的行程，同樣可以拖移
   - Google 日曆：登入或連結後，手動同步
     · 有時間的 Google 行程可以直接編輯、拖移、刪除、改顏色，會同步改到 Google
     · 新增行程時可勾選「同時新增到 Google 日曆」
     · 全天行程維持唯讀
   依賴 script.js（db、currentUser、getToday、shiftDate、taipeiToIso、showToast、escapeHtml、safeColor）
================================================== */

const CAL_START_HOUR = 6;
const CAL_END_HOUR = 24;
const CAL_PX_PER_HOUR = 40;      // 需和 index.html 的 .cal-col 背景線距一致
const CAL_SNAP_MINUTES = 15;
const CAL_DEFAULT_MINUTES = 60;
const CAL_COLORS = ["#5865f2", "#0ca30c", "#e0764b", "#ff6b81", "#9b6cff", "#22b8cf", "#8a93a8"];

/*
  Google 行程的 11 種顏色（colorId 1～11）
  hex 是 Google 預設調色盤的近似值，只用來顯示與比對
*/
const GCAL_COLORS = [
  { id: "1",  name: "薰衣草", hex: "#a4bdfc" },
  { id: "2",  name: "鼠尾草", hex: "#7ae7bf" },
  { id: "3",  name: "葡萄",   hex: "#dbadff" },
  { id: "4",  name: "火鶴",   hex: "#ff887c" },
  { id: "5",  name: "香蕉",   hex: "#fbd75b" },
  { id: "6",  name: "橘子",   hex: "#ffb878" },
  { id: "7",  name: "孔雀",   hex: "#46d6db" },
  { id: "8",  name: "石墨",   hex: "#e1e1e1" },
  { id: "9",  name: "藍莓",   hex: "#5484ed" },
  { id: "10", name: "羅勒",   hex: "#51b749" },
  { id: "11", name: "番茄",   hex: "#dc2127" }
];

/* 可讀寫行程 + 讀取日曆清單（兩個都要在 Google Cloud Console 的「資料存取」勾選） */
const GCAL_SCOPE = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly"
].join(" ");

const GCAL_API = "https://www.googleapis.com/calendar/v3";
const GCAL_LAST_SYNC_KEY = "gcalLastSync";

/* 把「📅 日曆」插在「📋 任務」後面 */
if (!PAGES.includes("calendar")) {
  PAGES.splice(PAGES.indexOf("tasks") + 1, 0, "calendar");
}

let calWeekStart = null;       // 這一週的週一（YYYY-MM-DD）
let calWeekEvents = [];
let calTodayEvents = [];
let calDrag = null;
let calBusy = false;


/* ---------- 小工具（時間一律用台灣時間） ---------- */

function calEl(id) {
  return document.getElementById(id);
}

/* 某天台灣時間 00:00 再加上幾分鐘（可以超過 1440，代表隔天） */
function calIsoAt(dateText, minutes) {
  const base = new Date(taipeiToIso(dateText, "00:00")).getTime();
  return new Date(base + minutes * 60000).toISOString();
}

function calHHMM(minutes) {
  const m = Math.min(Math.max(0, Math.round(minutes)), 23 * 60 + 59);
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

/* 從 ISO 取出台灣時間的日期與時間 */
function calDateOf(iso) {
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).slice(0, 10);
}

function calTimeOf(iso) {
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).slice(11, 16);
}

/* 這個時間點在「某一天」的第幾分鐘（可能是負數或超過 1440） */
function calMinutesInDay(iso, dateText) {
  return (new Date(iso).getTime() - new Date(calIsoAt(dateText, 0)).getTime()) / 60000;
}

function calOverlapsDay(ev, dateText) {
  return new Date(ev.starts_at) < new Date(calIsoAt(dateText, 1440))
    && new Date(ev.ends_at) > new Date(calIsoAt(dateText, 0));
}

function calNowMinutes() {
  const t = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

function calMondayOf(dateText) {
  const dow = (new Date(dateText + "T00:00:00Z").getUTCDay() + 6) % 7;
  return shiftDate(dateText, -dow);
}

function calWeekDays() {
  if (!calWeekStart) calWeekStart = calMondayOf(getToday());
  return Array.from({ length: 7 }, (_, i) => shiftDate(calWeekStart, i));
}

function calSetMsg(text, isError = false, id = "cal-msg") {
  const el = calEl(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-error", isError);
}

function calFindEvent(id) {
  return [...calWeekEvents, ...calTodayEvents].find(item => String(item.id) === String(id)) || null;
}

/* Google 全天行程維持唯讀；有時間的 Google 行程可以編輯 */
function calIsReadonly(ev) {
  return ev.source === "google" && ev.all_day;
}

/* 依 hex 找出 Google 的顏色（找不到代表是日曆預設色） */
function gcalColorByHex(hex) {
  if (!hex) return null;
  const target = String(hex).toLowerCase();
  return GCAL_COLORS.find(item => item.hex.toLowerCase() === target) || null;
}


/* ---------- 讀取 ---------- */

async function calFetch(fromDate, toDate) {

  const { data, error } = await db
    .from("events")
    .select("*")
    .eq("user_id", currentUser.id)
    .lt("starts_at", calIsoAt(toDate, 0))
    .gt("ends_at", calIsoAt(fromDate, 0))
    .order("starts_at")
    .limit(3000);

  if (error) {
    console.error("行程讀取失敗：", error);
    calSetMsg("行程讀取失敗：" + error.message, true);
    return null;
  }

  return data || [];

}


async function calRefreshWeek() {

  if (!currentUser) return;

  const days = calWeekDays();
  const rows = await calFetch(days[0], shiftDate(days[6], 1));

  if (rows) calWeekEvents = rows;

  calRenderWeek();

}


async function calRefreshToday() {

  if (!currentUser) return;

  const today = getToday();
  const rows = await calFetch(today, shiftDate(today, 1));

  if (rows) calTodayEvents = rows;

  calRenderToday();

}


async function calRefreshAll() {
  await calRefreshWeek();
  await calRefreshToday();
}


/* ---------- 畫面 ---------- */

function calChipHtml(ev) {

  const readonly = calIsReadonly(ev);
  const color = safeColor(ev.color);

  return `<div class="cal-chip ${readonly ? "is-readonly" : ""}" data-id="${ev.id}" style="background:${color}">${escapeHtml(ev.title)}</div>`;

}


function calEventHtml(ev, dateText) {

  const dayStart = CAL_START_HOUR * 60;
  const dayEnd = CAL_END_HOUR * 60;

  const startMin = Math.max(calMinutesInDay(ev.starts_at, dateText), dayStart);
  const endMin = Math.min(calMinutesInDay(ev.ends_at, dateText), dayEnd);
  const shownEnd = endMin > startMin ? endMin : startMin + 15;

  const realDuration = Math.max(
    15,
    Math.round((new Date(ev.ends_at) - new Date(ev.starts_at)) / 60000)
  );

  const top = ((startMin - dayStart) / 60) * CAL_PX_PER_HOUR;
  const height = Math.max(((shownEnd - startMin) / 60) * CAL_PX_PER_HOUR, 20);

  const readonly = calIsReadonly(ev);
  const isGoogle = ev.source === "google";

  return `
    <div class="cal-ev ${readonly ? "is-readonly" : ""} ${isGoogle ? "is-google" : ""}"
      data-id="${ev.id}"
      data-date="${dateText}"
      data-real-dur="${realDuration}"
      style="top:${top}px;height:${height}px;background:${safeColor(ev.color)}"
      title="${escapeHtml(ev.title)}${isGoogle ? "（Google 日曆）" : ""}">
      <div class="cal-ev-title">${escapeHtml(ev.title)}</div>
      <div class="cal-ev-time">${calHHMM(startMin)}–${calHHMM(shownEnd)}</div>
    </div>`;

}


/* 畫出時間格（days 可以是一週，也可以是只有今天） */
function calGridHtml(days, events) {

  const hours = CAL_END_HOUR - CAL_START_HOUR;
  const height = hours * CAL_PX_PER_HOUR;
  const today = getToday();
  const nowMin = calNowMinutes();

  const hourLabels = Array.from({ length: hours }, (_, i) =>
    `<div class="cal-hour" style="top:${i * CAL_PX_PER_HOUR}px">${String(CAL_START_HOUR + i).padStart(2, "0")}:00</div>`
  ).join("");

  const heads = days.map(day =>
    `<div class="cal-dayhead ${day === today ? "is-today" : ""}">${shortDateWithWeekday(day)}</div>`
  ).join("");

  const allDay = days.map(day => {
    const items = events.filter(ev => ev.all_day && calOverlapsDay(ev, day));
    return `<div class="cal-allday-col">${items.map(calChipHtml).join("")}</div>`;
  }).join("");

  const cols = days.map(day => {

    const items = events.filter(ev => !ev.all_day && calOverlapsDay(ev, day));

    const nowLine = day === today && nowMin >= CAL_START_HOUR * 60 && nowMin <= CAL_END_HOUR * 60
      ? `<div class="cal-now" style="top:${((nowMin - CAL_START_HOUR * 60) / 60) * CAL_PX_PER_HOUR}px"></div>`
      : "";

    return `
      <div class="cal-col" data-date="${day}" style="height:${height}px">
        ${items.map(ev => calEventHtml(ev, day)).join("")}
        ${nowLine}
      </div>`;

  }).join("");

  const minWidth = 44 + days.length * 64;

  return `
    <div class="cal-scroll">
      <div class="cal-table" style="min-width:${minWidth}px">
        <div class="cal-row cal-head"><div class="cal-gutter"></div>${heads}</div>
        <div class="cal-row cal-allday"><div class="cal-gutter cal-gutter-label">全天</div>${allDay}</div>
        <div class="cal-row cal-body">
          <div class="cal-gutter" style="height:${height}px">${hourLabels}</div>
          ${cols}
        </div>
      </div>
    </div>`;

}


function calRenderWeek() {

  const box = calEl("cal-week");

  if (!box) return;

  if (!currentUser) {
    box.innerHTML = "";
    return;
  }

  const days = calWeekDays();
  const range = calEl("cal-range-label");

  if (range) {
    range.textContent = `${formatShortDate(days[0])} – ${formatShortDate(days[6])}`;
  }

  box.innerHTML = calGridHtml(days, calWeekEvents);

}


function calRenderToday() {

  const box = calEl("cal-today");

  if (!box) return;

  if (!currentUser) {
    box.innerHTML = "";
    return;
  }

  const today = getToday();

  box.innerHTML = calGridHtml([today], calTodayEvents);

  /* 第一次打開時，捲到現在附近 */
  const scroll = box.querySelector(".cal-scroll");

  if (scroll && !scroll.dataset.started) {
    scroll.dataset.started = "1";
    const nowMin = calNowMinutes();
    const target = ((nowMin - CAL_START_HOUR * 60) / 60) * CAL_PX_PER_HOUR - 120;
    scroll.scrollTop = Math.max(0, target);
  }

}


function calRenderGcalInfo() {

  const last = calEl("cal-gcal-last");

  if (!last) return;

  let text = "尚未同步";

  try {
    const saved = localStorage.getItem(GCAL_LAST_SYNC_KEY);
    if (saved) text = "上次同步：" + new Date(saved).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  } catch (_) {}

  last.textContent = text;

}


/* ---------- 週導覽 ---------- */

function calShiftWeek(n) {

  if (!calWeekStart) calWeekStart = calMondayOf(getToday());

  calWeekStart = shiftDate(calWeekStart, n);

  calRefreshWeek();

}


function calGoThisWeek() {

  calWeekStart = calMondayOf(getToday());

  calRefreshWeek();

}


/* ---------- 新增 / 編輯 ---------- */

function calCloseEditor() {

  const overlay = calEl("cal-editor");

  if (overlay) overlay.remove();

}


function calPickColor(button) {

  document.querySelectorAll("#cal-editor .cal-swatch").forEach(item => item.classList.remove("active"));

  button.classList.add("active");

}


/* 色票：Google 行程（或勾選同步到 Google）用 Google 的 11 色，否則用本地 7 色 */
function calSwatchesHtml(selectedHex, useGoogle) {

  if (useGoogle) {

    const selected = (selectedHex || "").toLowerCase();

    return `
      <div class="cal-msg">Google 行程顏色（會同步到 Google 日曆）</div>
      <div class="cal-colors" id="ce-colors">
        ${GCAL_COLORS.map(item => `
          <button type="button"
            class="cal-swatch ${item.hex.toLowerCase() === selected ? "active" : ""}"
            data-color="${item.hex}"
            data-color-id="${item.id}"
            style="background:${item.hex}"
            onclick="calPickColor(this)"
            title="${item.name}"
            aria-label="${item.name}"></button>`).join("")}
      </div>`;

  }

  return `
    <div class="cal-colors" id="ce-colors">
      ${CAL_COLORS.map(color => `
        <button type="button"
          class="cal-swatch ${color === selectedHex ? "active" : ""}"
          data-color="${color}"
          style="background:${color}"
          onclick="calPickColor(this)"
          aria-label="${color}"></button>`).join("")}
    </div>`;

}


/* 勾選／取消「同時新增到 Google 日曆」時，切換色票 */
function calToggleGoogleColors(checked) {

  const box = calEl("ce-colors");
  if (!box) return;

  const active = document.querySelector("#cal-editor .cal-swatch.active");
  const current = active ? active.dataset.color : "";

  const wrap = document.createElement("div");
  wrap.innerHTML = calSwatchesHtml(
    checked ? (gcalColorByHex(current) ? current : GCAL_COLORS[0].hex) : (CAL_COLORS.includes(current) ? current : CAL_COLORS[0]),
    checked
  );

  const oldTip = box.previousElementSibling && box.previousElementSibling.classList.contains("cal-msg")
    ? box.previousElementSibling : null;

  if (oldTip && !checked) oldTip.remove();

  box.replaceWith(wrap.querySelector("#ce-colors"));

  if (checked && !(box.parentElement && box.parentElement.querySelector(".cal-msg")?.textContent)) {
    const tip = wrap.querySelector(".cal-msg");
    if (tip) calEl("ce-colors").before(tip);
  }

}


/*
  編輯視窗
  options：{ id, title, date, start, end, color, google }（時間是 HH:MM）
  google = true 代表這是 Google 日曆的行程，儲存/刪除會同步到 Google
*/
function calOpenEditor(options) {

  calCloseEditor();

  const o = {
    id: null,
    title: "",
    date: getToday(),
    start: "09:00",
    end: "10:00",
    color: CAL_COLORS[0],
    google: false,
    ...options
  };

  const overlay = document.createElement("div");

  overlay.id = "cal-editor";
  overlay.className = "cal-overlay";

  const googleNote = o.google
    ? `<div class="cal-msg">📅 這是 Google 日曆的行程，儲存或刪除會同步到 Google。</div>`
    : "";

  const googleCheck = !o.id
    ? `<label class="cal-field" style="flex-direction:row;align-items:center;gap:8px;cursor:pointer">
         <input id="ce-google" type="checkbox" style="width:auto" onchange="calToggleGoogleColors(this.checked)">
         同時新增到 Google 日曆
       </label>`
    : "";

  overlay.innerHTML = `
    <div class="modal-box cal-dialog" role="dialog" aria-modal="true">
      <div class="cal-dialog-title">${o.id ? "編輯行程" : "新增行程"}</div>

      ${googleNote}

      <label class="cal-field">
        標題
        <input id="ce-title" maxlength="120" value="${escapeHtml(o.title)}" placeholder="例如：英文課、午餐">
      </label>

      <label class="cal-field">
        日期
        <input id="ce-date" type="date" value="${o.date}">
      </label>

      <div class="cal-field-row">
        <label class="cal-field">
          開始
          <input id="ce-start" type="time" value="${o.start}">
        </label>
        <label class="cal-field">
          結束
          <input id="ce-end" type="time" value="${o.end}">
        </label>
      </div>

      ${calSwatchesHtml(o.color, o.google)}

      ${googleCheck}

      <div class="cal-msg" id="ce-msg"></div>

      <div class="cal-actions">
        ${o.id ? `<button class="btn btn-danger" onclick="calDeleteFromEditor(${o.id})">刪除</button>` : ""}
        <span style="flex:1"></span>
        <button class="btn" onclick="calCloseEditor()">取消</button>
        <button class="btn btn-primary" onclick="calSaveFromEditor(${o.id ? o.id : "null"})">儲存</button>
      </div>
    </div>`;

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) calCloseEditor();
  });

  document.body.appendChild(overlay);

  setTimeout(() => {
    const title = calEl("ce-title");
    if (title) title.focus();
  }, 0);

}


function calNewAt(startMinutes = null) {

  let start = startMinutes;

  if (start === null) {
    const nowMin = calNowMinutes();
    start = Math.min(Math.max(Math.ceil(nowMin / 60) * 60, 8 * 60), 22 * 60);
  }

  calOpenEditor({
    date: getToday(),
    start: calHHMM(start),
    end: calHHMM(start + CAL_DEFAULT_MINUTES)
  });

}


function calOpenEditorFromId(id) {

  const ev = calFindEvent(id);

  if (!ev) return;

  if (calIsReadonly(ev)) {
    showToast("Google 的全天行程請到 Google 日曆修改");
    return;
  }

  calOpenEditor({
    id: ev.id,
    title: ev.title,
    date: calDateOf(ev.starts_at),
    start: calTimeOf(ev.starts_at),
    end: calTimeOf(ev.ends_at),
    color: ev.color,
    google: ev.source === "google"
  });

}


async function calSaveFromEditor(id) {

  const msg = (text) => {
    const el = calEl("ce-msg");
    if (el) el.textContent = text;
  };

  const title = calEl("ce-title").value.trim();
  const date = calEl("ce-date").value;
  const start = calEl("ce-start").value;
  const end = calEl("ce-end").value;
  const activeSwatch = document.querySelector("#cal-editor .cal-swatch.active");
  const pickedColor = activeSwatch?.dataset.color || CAL_COLORS[0];

  if (!title) return msg("請輸入標題");
  if (!date || !start || !end) return msg("請選日期與時間");

  const startsAt = taipeiToIso(date, start);
  const endsAt = taipeiToIso(date, end);

  if (new Date(endsAt) <= new Date(startsAt)) return msg("結束時間要比開始晚");

  const existing = id ? calFindEvent(id) : null;
  const isGoogle = Boolean(existing && existing.source === "google");
  const addToGoogle = !id && Boolean(calEl("ce-google")?.checked);
  const toGoogle = isGoogle || addToGoogle;

  /* 只有選到 Google 色票時才送 colorId；沒選就不動 Google 上的顏色 */
  const googleColor = toGoogle ? gcalColorByHex(pickedColor) : null;

  let googleInfo = null;

  /* 先寫到 Google，成功後再寫進自己的資料庫 */
  if (toGoogle) {

    const token = await gcalToken();

    if (!token) return msg("Google 授權已過期或尚未連結，請先按「連結 Google 日曆」。");

    msg("儲存到 Google 日曆中…");

    try {

      const body = { summary: title, ...gcalTimeBody(startsAt, endsAt) };

      if (googleColor) body.colorId = googleColor.id;

      if (isGoogle) {

        await gcalRequest("PATCH", gcalEventUrl(existing), token, body);

      } else {

        const created = await gcalRequest("POST", `${GCAL_API}/calendars/primary/events`, token, body);

        googleInfo = {
          source: "google",
          google_calendar_id: (created.organizer && created.organizer.email) || "primary",
          google_event_id: created.id,
          calendar_name: null
        };

      }

    } catch (error) {

      console.error("Google 日曆儲存失敗：", error);
      return msg(gcalErrorText(error));

    }

  }

  /* Google 行程：有選 Google 色就用它；否則保留原本的顯示色 */
  const savedColor = toGoogle
    ? (googleColor ? googleColor.hex : (existing ? existing.color : pickedColor))
    : pickedColor;

  const row = {
    title,
    starts_at: startsAt,
    ends_at: endsAt,
    color: savedColor,
    updated_at: new Date().toISOString()
  };

  const { error } = id
    ? await db.from("events").update(row).eq("id", id).eq("user_id", currentUser.id)
    : await db.from("events").insert({
        ...row,
        user_id: currentUser.id,
        source: "local",
        all_day: false,
        ...(googleInfo || {})
      });

  if (error) {
    console.error("行程儲存失敗：", error);
    return msg("儲存失敗：" + error.message);
  }

  calCloseEditor();
  calSetMsg(toGoogle ? "✅ 已儲存（已同步到 Google 日曆）" : "✅ 已儲存");
  await calRefreshAll();

}


async function calDeleteFromEditor(id) {

  const ev = calFindEvent(id);
  const isGoogle = Boolean(ev && ev.source === "google");

  if (!confirm(isGoogle ? "這會同時從 Google 日曆刪除，確定嗎？" : "刪除這個行程？")) return;

  if (isGoogle) {

    const token = await gcalToken();

    if (!token) {
      alert("Google 授權已過期或尚未連結，請先按「連結 Google 日曆」。");
      return;
    }

    try {
      await gcalRequest("DELETE", gcalEventUrl(ev), token);
    } catch (error) {
      /* Google 上已經不存在，就當作刪除成功 */
      if (error.status !== 404 && error.status !== 410) {
        console.error("Google 日曆刪除失敗：", error);
        alert(gcalErrorText(error));
        return;
      }
    }

  }

  const { error } = await db
    .from("events")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("刪除失敗：" + error.message);
    return;
  }

  calCloseEditor();
  await calRefreshAll();

}


/* ---------- 拖移 ---------- */

/* 把一個行程移到指定日期與開始時間（先更新畫面，再寫入 Google 與資料庫） */
async function calMoveEvent(id, dateText, startMin, duration) {

  const startsAt = calIsoAt(dateText, startMin);
  const endsAt = calIsoAt(dateText, startMin + duration);

  const target = calFindEvent(id);
  const isGoogle = Boolean(target && target.source === "google");

  for (const list of [calWeekEvents, calTodayEvents]) {
    const ev = list.find(item => String(item.id) === String(id));
    if (ev) {
      ev.starts_at = startsAt;
      ev.ends_at = endsAt;
    }
  }

  calRenderWeek();
  calRenderToday();

  if (isGoogle) {

    const token = await gcalToken();

    if (!token) {
      calSetMsg("Google 授權已過期或尚未連結，請先按「連結 Google 日曆」。", true);
      await calRefreshAll();
      return;
    }

    try {
      await gcalRequest("PATCH", gcalEventUrl(target), token, gcalTimeBody(startsAt, endsAt));
    } catch (error) {
      console.error("Google 日曆移動失敗：", error);
      calSetMsg(gcalErrorText(error), true);
      await calRefreshAll();
      return;
    }

  }

  const { error } = await db
    .from("events")
    .update({ starts_at: startsAt, ends_at: endsAt, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("移動失敗：", error);
    calSetMsg("移動失敗：" + error.message, true);
    await calRefreshAll();
  }

}


/* 把螢幕上的 Y 座標換成這一欄的分鐘（對齊到 15 分鐘） */
function calMinuteAtY(col, y) {

  const rect = col.getBoundingClientRect();
  const raw = CAL_START_HOUR * 60 + ((y - rect.top) / CAL_PX_PER_HOUR) * 60;

  return Math.round(raw / CAL_SNAP_MINUTES) * CAL_SNAP_MINUTES;

}


function calColumnAtX(x) {

  const cols = [...document.querySelectorAll(".cal-col")];

  return cols.find(col => {
    const rect = col.getBoundingClientRect();
    return rect.width > 0 && x >= rect.left && x < rect.right;
  }) || null;

}


/* ---------- Google 日曆 ---------- */

async function gcalSignIn() {

  const { error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: location.origin + location.pathname,
      scopes: GCAL_SCOPE,
      queryParams: { access_type: "offline", prompt: "consent" }
    }
  });

  if (error) alert("Google 登入失敗：" + error.message);

}


/* 已用 email 登入的人，連結 Google 身分並取得日曆授權 */
async function gcalLink() {

  if (!currentUser) return;

  const { error } = await db.auth.linkIdentity({
    provider: "google",
    options: {
      redirectTo: location.origin + location.pathname,
      scopes: GCAL_SCOPE,
      queryParams: { access_type: "offline", prompt: "consent" }
    }
  });

  if (error) calSetMsg("連結失敗：" + error.message, true, "cal-gcal-msg");

}


async function gcalToken() {

  const { data } = await db.auth.getSession();

  return data && data.session ? data.session.provider_token : null;

}


/* 呼叫 Google Calendar API（GET / POST / PATCH / DELETE） */
async function gcalRequest(method, url, token, body) {

  const headers = { Authorization: `Bearer ${token}` };

  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {

    let detail = "";

    try {
      const json = await res.json();
      detail = json && json.error ? json.error.message : "";
    } catch (_) {}

    const error = new Error(`Google 回應 ${res.status}${detail ? "：" + detail : ""}`);
    error.status = res.status;
    throw error;

  }

  if (res.status === 204) return null;

  return res.json();

}


function gcalGet(url, token) {
  return gcalRequest("GET", url, token);
}


function gcalEventUrl(ev) {
  return `${GCAL_API}/calendars/${encodeURIComponent(ev.google_calendar_id)}/events/${encodeURIComponent(ev.google_event_id)}`;
}


function gcalTimeBody(startsAt, endsAt) {
  return {
    start: { dateTime: startsAt, timeZone: "Asia/Taipei" },
    end: { dateTime: endsAt, timeZone: "Asia/Taipei" }
  };
}


function gcalErrorText(error) {

  if (error.status === 401) return "Google 授權已過期，請按「連結 Google 日曆」重新授權。";
  if (error.status === 403) return "沒有權限修改這個 Google 行程（可能是唯讀日曆，或授權時沒勾選日曆權限）。";
  if (error.status === 404 || error.status === 410) return "Google 上找不到這個行程，可能已被刪除，請重新同步。";

  return "Google 日曆錯誤：" + (error.message || error);

}


/* Google 的一筆行程 → 我們的 events 格式
   行程有自己的顏色（colorId）就用 Google 調色盤；否則用所在日曆的顏色 */
function gcalRow(item, cal) {

  const allDay = Boolean(item.start && item.start.date);

  const startsAt = allDay
    ? calIsoAt(item.start.date, 0)
    : new Date(item.start.dateTime).toISOString();

  let endsAt = allDay
    ? calIsoAt(item.end.date, 0)
    : new Date(item.end.dateTime).toISOString();

  if (new Date(endsAt) <= new Date(startsAt)) {
    endsAt = new Date(new Date(startsAt).getTime() + 30 * 60000).toISOString();
  }

  const eventColor = item.colorId ? GCAL_COLORS.find(c => c.id === String(item.colorId)) : null;

  return {
    title: String(item.summary || "（無標題）").slice(0, 120),
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: allDay,
    color: safeColor(eventColor ? eventColor.hex : cal.backgroundColor),
    source: "google",
    google_calendar_id: cal.id,
    google_event_id: item.id,
    calendar_name: String(cal.summary || "").slice(0, 60),
    location: item.location ? String(item.location).slice(0, 200) : null
  };

}


async function gcalSync() {

  if (!currentUser || calBusy) return;

  const token = await gcalToken();

  if (!token) {
    calSetMsg("還沒有 Google 日曆授權。請按「連結 Google 日曆」，或用 Google 登入後再同步。", true, "cal-gcal-msg");
    return;
  }

  calBusy = true;
  calSetMsg("同步中…", false, "cal-gcal-msg");

  try {

    /* 讀日曆清單；沒有清單權限時，退回只同步主要日曆 */
    let calendarItems;

    try {
      const calendars = await gcalGet(`${GCAL_API}/users/me/calendarList?maxResults=250`, token);
      calendarItems = calendars.items || [];
    } catch (error) {
      if (error.status !== 403) throw error;
      calendarItems = [{ id: "primary", summary: "主要日曆", backgroundColor: CAL_COLORS[0] }];
    }

    const now = Date.now();
    const timeMin = new Date(now - 30 * 86400000).toISOString();
    const timeMax = new Date(now + 90 * 86400000).toISOString();

    const rows = [];

    for (const cal of calendarItems) {

      let pageToken = "";

      do {

        const params = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "250"
        });

        if (pageToken) params.set("pageToken", pageToken);

        const page = await gcalGet(
          `${GCAL_API}/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
          token
        );

        for (const item of page.items || []) {
          if (item.status === "cancelled") continue;
          rows.push(gcalRow(item, cal));
        }

        pageToken = page.nextPageToken || "";

      } while (pageToken);

    }

    /* 先清掉這段時間的舊 Google 行程，再寫入最新的（Google 刪掉的也會跟著消失） */
    const uid = currentUser.id;

    const { error: deleteError } = await db
      .from("events")
      .delete()
      .eq("user_id", uid)
      .eq("source", "google")
      .gte("starts_at", timeMin)
      .lte("starts_at", timeMax);

    if (deleteError) throw deleteError;

    for (let i = 0; i < rows.length; i += 500) {

      const batch = rows.slice(i, i + 500).map(row => ({ ...row, user_id: uid }));

      const { error } = await db
        .from("events")
        .upsert(batch, { onConflict: "user_id,google_calendar_id,google_event_id" });

      if (error) throw error;

    }

    try {
      localStorage.setItem(GCAL_LAST_SYNC_KEY, new Date().toISOString());
    } catch (_) {}

    calRenderGcalInfo();
    calSetMsg(`✅ 已同步 ${rows.length} 筆（${calendarItems.length} 個日曆）`, false, "cal-gcal-msg");

    await calRefreshAll();

  } catch (error) {

    console.error("Google 日曆同步失敗：", error);

    calSetMsg(
      error.status === 401
        ? "Google 授權已過期，請按「連結 Google 日曆」重新授權。"
        : "同步失敗：" + (error.message || error),
      true,
      "cal-gcal-msg"
    );

  } finally {

    calBusy = false;

  }

}


/* ---------- 拖移事件（全域監聽，今日頁與日曆頁共用） ---------- */

document.addEventListener("pointerdown", (event) => {

  const block = event.target.closest(".cal-ev");

  if (block) {

    if (block.classList.contains("is-readonly")) return;

    const rect = block.getBoundingClientRect();

    calDrag = {
      kind: "event",
      el: block,
      id: block.dataset.id,
      date: block.dataset.date,
      duration: Number(block.dataset.realDur),
      grabY: event.clientY - rect.top,
      sx: event.clientX,
      sy: event.clientY,
      moved: false
    };

    return;
  }

  const col = event.target.closest(".cal-col");

  if (col) {
    calDrag = { kind: "column", col, sx: event.clientX, sy: event.clientY, moved: false };
  }

});


document.addEventListener("pointermove", (event) => {

  const drag = calDrag;

  if (!drag || drag.kind !== "event") return;

  const dx = event.clientX - drag.sx;
  const dy = event.clientY - drag.sy;

  if (!drag.moved && Math.hypot(dx, dy) < 6) return;

  drag.moved = true;
  drag.el.classList.add("is-dragging");
  drag.el.style.transform = `translate(${dx}px, ${dy}px)`;

});


document.addEventListener("pointerup", async (event) => {

  const drag = calDrag;

  calDrag = null;

  if (!drag) return;

  const distance = Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy);

  /* 點空白格子：新增 */
  if (drag.kind === "column") {

    if (distance < 6) {
      const start = calMinuteAtY(drag.col, event.clientY);
      calNewAt(Math.min(Math.max(start, CAL_START_HOUR * 60), (CAL_END_HOUR - 1) * 60));
    }

    return;

  }

  /* 點一下行程：編輯 */
  if (!drag.moved) {
    drag.el.style.transform = "";
    calOpenEditorFromId(drag.id);
    return;
  }

  drag.el.classList.remove("is-dragging");
  drag.el.style.transform = "";

  const col = calColumnAtX(event.clientX);

  if (!col) {
    calRenderWeek();
    calRenderToday();
    return;
  }

  const elementTop = event.clientY - drag.grabY;
  const raw = calMinuteAtY(col, elementTop);
  const min = CAL_START_HOUR * 60;
  const max = CAL_END_HOUR * 60 - drag.duration;
  const start = Math.min(Math.max(raw, min), Math.max(min, max));

  await calMoveEvent(drag.id, col.dataset.date, start, drag.duration);

});


/* 點 Google 全天行程：提示唯讀 */
document.addEventListener("click", (event) => {

  const block = event.target.closest(".cal-ev.is-readonly, .cal-chip.is-readonly");

  if (block) {
    showToast("Google 的全天行程請到 Google 日曆修改");
  }

});


/* ---------- 啟動 ---------- */

(function calInit() {

  if (typeof applyPage === "function") {
    const originalApplyPage = applyPage;
    applyPage = function (name) {
      originalApplyPage(name);
      if (name === "calendar") calRefreshWeek();
      if (name === "today") calRefreshToday();
    };
  }

  /* 每分鐘重新讀取，讓紅線與行程保持最新 */
  setInterval(() => {
    if (!currentUser) return;
    if (currentPageFromHash() === "today") calRefreshToday();
    if (currentPageFromHash() === "calendar") calRefreshWeek();
  }, 60000);

  /* 載入完成後補一次（登入狀態可能比這個腳本晚出現） */
  setTimeout(() => {
    calRenderGcalInfo();
    calRefreshAll();
  }, 1500);

})();
