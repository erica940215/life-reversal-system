/* =========================================================
   序光計畫：🎯 今日目標（今日頁最上面）
   - 📚 考試倒數：剩幾天、累積專注進度、今天建議專注多久，達標領獎
   - 😴 早睡獎勵：昨晚在設定時間前睡（看「生活」的睡眠紀錄）
   - 🌅 早起挑戰：早上 5 點到設定時間之間打開網站
   - 🏁 本週挑戰：每週一自動出 3 個，全部完成有大獎
   資料庫：sql/2026-10-30_目標與作息.sql
========================================================= */

(function () {

  "use strict";

  const GL = { data: null, err: null, busy: false, form: null, set: false, open: null };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const NAME = { stardust: "✨星屑", scav: "🎟️搜刮券", morale: "🔥士氣", chest_wood: "📦木寶箱", chest_gold: "💰金寶箱", ticket_special: "🎫特殊召喚券", food: "🍞", water: "💧", parts: "🔩" };
  const gainText = g => (g || []).map(x => `${NAME[x.k] || x.k} +${x.n}`).join("、");
  const hm = m => m >= 60 ? `${Math.floor(m / 60)} 小時${m % 60 ? ` ${m % 60} 分` : ""}` : `${m} 分`;
  const loggedIn = () => typeof currentUser !== "undefined" && !!currentUser && typeof db !== "undefined";
  const say = t => (typeof showToast === "function" ? showToast(t) : console.log(t));
  try { GL.open = JSON.parse(localStorage.getItem("goalsOpen") || "null"); } catch (_) {}

  async function load() {
    if (!loggedIn()) return;
    const { data, error } = await db.rpc("life_goals_status");
    if (error) GL.err = /life_goals_status|PGRST202|42883/.test(error.message || "") ? "setup" : error.message;
    else { GL.err = null; GL.data = data; }
    render();
  }

  async function rpc(name, args, ok) {
    if (GL.busy) return;
    GL.busy = true; render();
    try {
      const { data, error } = await db.rpc(name, args || {});
      if (error) { say("❌ " + error.message); return; }
      if (ok) ok(data);
    } finally { GL.busy = false; }
    await load();
    if (window.FunGame) window.FunGame.reload();
  }

  function examHtml(e) {
    const doneH = Math.floor(e.done_min / 60);
    const remainMin = Math.max(0, e.target * 60 - (e.done_min - e.today_min));
    const need = Math.ceil(remainMin / Math.max(1, e.days + 1));
    const ok = e.today_min >= need;
    const p = Math.min(100, Math.round(e.done_min / (e.target * 60) * 100));
    return `<div class="gl-exam">
      <div class="gl-row"><b>📚 ${esc(e.name)}${e.subject ? `<small>（${esc(e.subject)}）</small>` : ""}</b><span class="gl-d">${e.days === 0 ? "就是今天！" : `D-${e.days}`}</span></div>
      <div class="gl-bar"><i style="width:${p}%"></i></div>
      <div class="gl-row gl-sub"><span>累積 ${doneH} / ${e.target} 小時</span><span>今天 ${hm(e.today_min)} / 建議 ${hm(need)}</span></div>
      <div class="gl-row"><span class="gl-sub">${ok ? "今天達標了 🎉" : `今天還差 ${hm(need - e.today_min)}`}</span>
        <span><button type="button" class="gl-btn ${ok && !e.claimed ? "" : "ghost"}" data-gl="claim" data-v="exam:${e.id}" ${ok && !e.claimed && !GL.busy ? "" : "disabled"}>${e.claimed ? "已領" : "領獎"}</button>
        <button type="button" class="gl-x" data-gl="edit" data-v="${e.id}" aria-label="編輯">✏️</button></span></div></div>`;
  }

  function formHtml() {
    const f = GL.form;
    if (!f) return "";
    const subs = (typeof focusUsedSubjects !== "undefined" && Array.isArray(focusUsedSubjects)) ? focusUsedSubjects : [];
    return `<div class="gl-form">
      <input id="gl-name" maxlength="40" placeholder="考試名稱，例如：研究所考試" value="${esc(f.name || "")}">
      <div class="gl-row"><label>日期 <input type="date" id="gl-date" value="${esc(f.date || "")}"></label>
        <label>目標 <input type="number" id="gl-target" min="1" max="2000" value="${f.target || 100}" style="width:70px"> 小時</label></div>
      <label>只算這個科目 <select id="gl-subj"><option value="">全部科目</option>${subs.map(s => `<option ${s === f.subject ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
      <div class="gl-row"><button type="button" class="gl-btn" data-gl="save" ${GL.busy ? "disabled" : ""}>儲存</button>
        ${f.id ? `<button type="button" class="gl-btn ghost" data-gl="del" data-v="${f.id}">刪除</button>` : ""}
        <button type="button" class="gl-btn ghost" data-gl="cancel">取消</button></div></div>`;
  }

  function bodyHtml() {
    const d = GL.data;
    if (GL.err === "setup") return `<p class="gl-sub">⚠️ 要先到 Supabase 的 SQL Editor 執行 <b>sql/2026-10-30_目標與作息.sql</b>。</p>`;
    if (GL.err) return `<p class="gl-sub">載入失敗：${esc(GL.err)}</p>`;
    if (!d) return `<p class="gl-sub">載入中…</p>`;

    const exams = (d.exams || []).map(examHtml).join("") +
      (GL.form ? formHtml() : `<button type="button" class="gl-btn ghost gl-add" data-gl="add">＋ 新增考試倒數</button>`);

    const sl = d.sleep, mo = d.morning;
    const sleepTxt = sl.claimed ? "今天領過了 ✓" : sl.ok ? `昨晚 ${new Date(sl.bed_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })} 就睡了，很棒！` : sl.logged ? `昨晚比 ${d.bed_goal} 晚睡了` : "昨晚還沒記錄睡眠（到「生活」記一下）";
    const moTxt = mo.claimed ? "今天領過了 ✓" : mo.open ? `現在 ${d.now}，早起成功！` : `早上 5:00～${d.wake_goal} 打開網站就能領`;
    const rest = `<div class="gl-two">
      <div class="gl-mini"><b>😴 早睡</b><span class="gl-sub">${esc(sleepTxt)}</span>
        <button type="button" class="gl-btn ${sl.ok && !sl.claimed ? "" : "ghost"}" data-gl="claim" data-v="sleep" ${sl.ok && !sl.claimed && !GL.busy ? "" : "disabled"}>${sl.claimed ? "已領" : "領獎"}</button></div>
      <div class="gl-mini"><b>🌅 早起</b><span class="gl-sub">${esc(moTxt)}</span>
        <button type="button" class="gl-btn ${mo.open && !mo.claimed ? "" : "ghost"}" data-gl="claim" data-v="morning" ${mo.open && !mo.claimed && !GL.busy ? "" : "disabled"}>${mo.claimed ? "已領" : "領獎"}</button></div></div>
      ${GL.set ? `<div class="gl-form"><div class="gl-row"><label>幾點前睡 <input type="time" id="gl-bed" value="${esc(d.bed_goal)}"></label><label>幾點前起 <input type="time" id="gl-wake" value="${esc(d.wake_goal)}"></label></div>
        <div class="gl-row"><button type="button" class="gl-btn" data-gl="saveset">儲存</button><button type="button" class="gl-btn ghost" data-gl="set">取消</button></div></div>`
        : `<button type="button" class="gl-link" data-gl="set">⚙️ 早睡 ${esc(d.bed_goal)} 前・早起 ${esc(d.wake_goal)} 前（點我改）</button>`}`;

    const wc = d.week_claimed || {};
    const allDone = (d.week || []).every(c => c.done);
    const week = (d.week || []).map(c => `<div class="gl-ch ${c.done ? "done" : ""}"><span>${c.emoji}</span>
        <div class="gl-ch-b"><b>${esc(c.name)}</b><div class="gl-bar"><i style="width:${Math.round(c.value / c.goal * 100)}%"></i></div>
        <small>${c.kind === "focus_min" || c.kind === "long_session" ? `${hm(c.value)} / ${hm(c.goal)}` : `${c.value} / ${c.goal}`}</small></div>
        <button type="button" class="gl-btn ${c.done && !wc[c.id] ? "" : "ghost"}" data-gl="claim" data-v="wk:${c.id}" ${c.done && !wc[c.id] && !GL.busy ? "" : "disabled"}>${wc[c.id] ? "已領" : "✨10"}</button></div>`).join("") +
      `<button type="button" class="gl-btn gl-big ${allDone && !wc.all ? "" : "ghost"}" data-gl="claim" data-v="wk:all" ${allDone && !wc.all && !GL.busy ? "" : "disabled"}>${wc.all ? "🏆 這週大獎領過了" : "🏆 三個都完成：金寶箱＋特殊召喚券＋星屑 30"}</button>`;

    const sec = (k, title, html) => {
      const open = !GL.open || GL.open[k] !== false;
      return `<div class="gl-sec"><button type="button" class="gl-h" data-gl="fold" data-v="${k}">${title}<span>${open ? "▾" : "▸"}</span></button>${open ? html : ""}</div>`;
    };
    return sec("exam", "📚 考試倒數", exams) + sec("rest", "🌙 作息獎勵", rest) + sec("week", "🏁 本週挑戰", week);
  }

  function render() {
    const host = ensureHost();
    if (!host) return;
    if (!loggedIn()) { host.innerHTML = ""; return; }
    host.innerHTML = `<div class="card gl-card"><h3>🎯 今日目標</h3>${bodyHtml()}</div>`;
  }

  function ensureHost() {
    let host = document.getElementById("gl-host");
    if (host) return host;
    const page = document.querySelector('.page[data-page="today"]');
    if (!page) return null;
    const title = page.querySelector(".page-title");
    host = document.createElement("div");
    host.id = "gl-host";
    if (title && title.nextSibling) title.parentNode.insertBefore(host, title.nextSibling);
    else page.prepend(host);
    host.addEventListener("click", onClick);
    return host;
  }

  function onClick(e) {
    const el = e.target.closest("[data-gl]");
    if (!el) return;
    const a = el.dataset.gl, v = el.dataset.v;
    if (a === "claim") return rpc("life_goals_claim", { p_kind: v }, d => say(`🎁 ${gainText(d.gains) || "領到了"}`));
    if (a === "fold") { GL.open = GL.open || {}; GL.open[v] = GL.open[v] === false; try { localStorage.setItem("goalsOpen", JSON.stringify(GL.open)); } catch (_) {} return render(); }
    if (a === "add") { const dd = new Date(Date.now() + 60 * 864e5); GL.form = { date: dd.toISOString().slice(0, 10), target: 100 }; return render(); }
    if (a === "edit") { const x = (GL.data.exams || []).find(q => String(q.id) === v); if (x) GL.form = { id: x.id, name: x.name, date: x.date, target: x.target, subject: x.subject }; return render(); }
    if (a === "cancel") { GL.form = null; return render(); }
    if (a === "save") {
      const name = document.getElementById("gl-name").value, date = document.getElementById("gl-date").value;
      const target = Number(document.getElementById("gl-target").value), subj = document.getElementById("gl-subj").value;
      const id = GL.form && GL.form.id || null;
      return rpc("exam_save", { p_id: id, p_name: name, p_date: date, p_target: target, p_subject: subj }, () => { GL.form = null; say("📚 考試倒數設好了"); });
    }
    if (a === "del") { if (!confirm("刪除這個考試倒數？")) return; return rpc("exam_delete", { p_id: Number(v) }, () => { GL.form = null; }); }
    if (a === "set") { GL.set = !GL.set; return render(); }
    if (a === "saveset") return rpc("life_goals_save", { p_bed: document.getElementById("gl-bed").value, p_wake: document.getElementById("gl-wake").value }, () => { GL.set = false; say("⚙️ 存好了"); });
  }

  function setup() {
    if (!document.getElementById("gl-style")) {
      const st = document.createElement("style");
      st.id = "gl-style";
      st.textContent = `
        .gl-card h3 { margin: 0 0 6px; }
        .gl-sec { border-top: 1px solid rgba(127,127,127,.15); padding: 6px 0; }
        .gl-h { width: 100%; display: flex; justify-content: space-between; background: none; border: 0; color: inherit; font-weight: 700; font-size: 14px; padding: 6px 0; cursor: pointer; }
        .gl-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
        .gl-sub { font-size: 12.5px; opacity: .75; }
        .gl-d { font-weight: 800; color: #ff9f43; }
        .gl-bar { height: 7px; border-radius: 99px; background: rgba(127,127,127,.2); overflow: hidden; margin: 5px 0; } .gl-bar i { display: block; height: 100%; background: linear-gradient(90deg,#ff9f43,#ffd166); border-radius: 99px; }
        .gl-exam { background: rgba(127,127,127,.08); border-radius: 10px; padding: 8px 10px; margin-bottom: 6px; }
        .gl-btn { background: #ff9f43; color: #1b1f2e; border: 0; border-radius: 9px; padding: 5px 12px; font-weight: 700; font-size: 13px; cursor: pointer; }
        .gl-btn.ghost { background: rgba(127,127,127,.2); color: inherit; } .gl-btn:disabled { opacity: .55; cursor: default; }
        .gl-x { background: none; border: 0; cursor: pointer; }
        .gl-add { width: 100%; margin-top: 2px; } .gl-big { width: 100%; margin-top: 6px; padding: 8px; }
        .gl-form { display: flex; flex-direction: column; gap: 6px; background: rgba(127,127,127,.08); border-radius: 10px; padding: 10px; font-size: 13px; }
        .gl-form input, .gl-form select { padding: 5px 8px; border-radius: 8px; border: 1px solid rgba(127,127,127,.3); background: transparent; color: inherit; }
        .gl-two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .gl-mini { background: rgba(127,127,127,.08); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
        .gl-link { background: none; border: 0; color: inherit; opacity: .7; font-size: 12px; cursor: pointer; padding: 6px 0 0; }
        .gl-ch { display: flex; gap: 8px; align-items: center; padding: 4px 0; } .gl-ch > span { font-size: 22px; }
        .gl-ch-b { flex: 1; min-width: 0; } .gl-ch-b b { font-size: 13px; } .gl-ch-b small { font-size: 11.5px; opacity: .7; }
        .gl-ch.done .gl-bar i { background: #42d392; }
      `;
      document.head.appendChild(st);
    }
    ensureHost();
    load();
    setInterval(load, 5 * 60000);
    /* 登入後、回到今日頁、專注結束時重新整理 */
    if (typeof window.showPage === "function" && !window.showPage.__gl) {
      const orig = window.showPage;
      window.showPage = function (p) { const r = orig.apply(this, arguments); if (p === "today") load(); return r; };
      window.showPage.__gl = true;
    }
    if (typeof window.finishFocus === "function" && !window.finishFocus.__gl) {
      const of = window.finishFocus;
      window.finishFocus = async function () { const r = await of.apply(this, arguments); setTimeout(load, 1500); return r; };
      window.finishFocus.__gl = true;
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(setup, 800));
  else setTimeout(setup, 800);

  window.GoalsGame = { reload: load, state: GL };

})();
