/* 🌙 一鍵收尾：晚上一個流程跑完 4 步
   ① 今天沒做完的任務：✅ 完成／⏭️ 延期到明天／🗑️ 放棄（只是從今天拿掉，不扣任何東西）
   ② 推甄進度：預計到今天的項目勾一勾（同名任務一起同步）
   ③ 反省：今天的反省、明天要改善（會進改善清單）、今天學到什麼 → daily_reflections
   ④ 列明天：打開「🌙 明天要完成什麼」
   入口：今日頁「🌙 每日收尾」卡片上的按鈕；不新增資料表 */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const today = () => (typeof appDateOf === "function" ? appDateOf(Date.now()) : new Date(Date.now() - 6 * 3600e3).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }));
  const addDay = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const STEPS = ["沒做完的任務", "推甄進度", "反省", "列明天"];

  async function open() {
    if (!hasDb()) return;
    const d = today();
    try { if (window.Douluo && window.Douluo.isOn && window.Douluo.isOn()) window.Douluo.load(true); } catch (_) {}
    const S = { step: 0, tasks: [], act: {}, items: [], refl: {}, dirty: false, busy: false };
    const [tk, rf] = await Promise.all([
      db.from("tasks").select("id, title, completed, skipped").eq("task_date", d).limit(200),
      db.from("daily_reflections").select("reflection, improvement, learned").eq("user_id", currentUser.id).eq("reflect_date", d).maybeSingle()]);
    S.tasks = (tk.data || []).filter(t => !t.completed && !t.skipped);
    S.doneN = (tk.data || []).filter(t => t.completed).length;
    S.refl = rf.data || {};
    try { S.items = window.StudyProgress ? (await window.StudyProgress.todayItems()).map(i => ({ ...i })) : []; } catch (_) { S.items = []; }

    const m = document.createElement("div"); m.className = "vg-modal wu-modal";
    const dots = () => `<div class="wu-dots">${STEPS.map((n, i) => `<span class="${i === S.step ? "on" : i < S.step ? "ok" : ""}">${i < S.step ? "✓" : i + 1} ${n}</span>`).join("")}</div>`;
    function body() {
      if (S.step === 0) {
        if (!S.tasks.length) return `<p class="wu-empty">今天的任務都處理完了 🎉（完成 ${S.doneN} 件）</p>`;
        return `<p class="vg-note">今天完成 ${S.doneN} 件，還有 ${S.tasks.length} 件沒做完。每件選一個就好，不選就留在今天。</p>
          ${S.tasks.map(t => { const a = S.act[t.id]; return `<div class="wu-task ${a ? "done" : ""}"><span>${esc(t.title)}</span>${a ? `<b>${a === "done" ? "✅ 完成了" : a === "move" ? "⏭️ 明天做" : "🗑️ 不做了"}</b>`
            : `<div><button type="button" class="tr-chip sm" data-wu="done" data-id="${t.id}">✅ 完成</button><button type="button" class="tr-chip sm" data-wu="move" data-id="${t.id}">⏭️ 明天</button><button type="button" class="tr-chip sm" data-wu="drop" data-id="${t.id}">🗑️ 放棄</button></div>`}</div>`; }).join("")}`;
      }
      if (S.step === 1) {
        if (!S.items.length) return `<p class="wu-empty">今天沒有預計的推甄項目。</p>`;
        const t = today();
        return `<p class="vg-note">預計到今天的推甄項目，今天讀完的勾起來（同名任務會一起完成）。</p>
          ${S.items.map(i => `<label class="pg-it ${i.done ? "on" : ""} ${!i.done && i.plan_date < t ? "late" : ""}"><input type="checkbox" data-wui="${i.id}" ${i.done ? "checked" : ""}><span><b style="font-weight:600;opacity:.7;font-size:12px">${esc(i.subject)}</b> ${esc(i.title)}</span><small>${i.plan_date < t ? "預計 " + Number(i.plan_date.slice(5, 7)) + "/" + Number(i.plan_date.slice(8)) : "今天"}</small></label>`).join("")}`;
      }
      if (S.step === 2) return `<label class="tw-lab">🪞 今天的反省<textarea data-wr="reflection" rows="3" maxlength="500" placeholder="今天哪裡做得好、哪裡可以更好？">${esc(S.refl.reflection)}</textarea></label>
          <label class="tw-lab">🎯 明天要改善<textarea data-wr="improvement" rows="3" maxlength="300" placeholder="一行寫一個方法，會加進改善清單">${esc(S.refl.improvement)}</textarea></label>
          <label class="tw-lab">📘 今天學到什麼<textarea data-wr="learned" rows="2" maxlength="500" placeholder="一句話也可以">${esc(S.refl.learned)}</textarea></label>`;
      const moved = Object.values(S.act).filter(a => a === "move").length;
      return `<p class="vg-note">最後一步：把明天要做的事列好，明天早上打開就能直接開始。${moved ? `<br>（剛剛延到明天的 ${moved} 件已經在明天的清單裡了）` : ""}</p>
        <button type="button" class="btn btn-primary" data-wu="tomorrow" style="width:100%">🌙 列明天的任務</button>
        ${window.DouluoLife ? window.DouluoLife.campfireHtml() : ""}`;
    }
    function draw() {
      const last = S.step === STEPS.length - 1;
      m.innerHTML = `<div class="vg-card"><div class="vg-title">🌙 一鍵收尾</div>${dots()}<div class="wu-body">${body()}</div>
        <div class="wu-nav"><button type="button" class="btn" data-wu="${S.step ? "back" : "close"}">${S.step ? "← 上一步" : "先不收尾"}</button>
        <button type="button" class="btn ${last ? "" : "btn-primary"}" data-wu="${last ? "finish" : "next"}">${last ? "完成收尾" : "下一步 →"}</button></div></div>`;
    }
    async function saveRefl() {
      if (!S.dirty) return true;
      const row = { user_id: currentUser.id, reflect_date: d, reflection: S.refl.reflection || "", improvement: S.refl.improvement || "", learned: S.refl.learned || "", updated_at: new Date().toISOString() };
      const { error } = await db.from("daily_reflections").upsert(row, { onConflict: "user_id,reflect_date" });
      if (error) { toast("反省儲存失敗：" + error.message); return false; }
      S.dirty = false; if (window.ImproveBox) window.ImproveBox.load(); if (typeof loadReflections === "function") try { loadReflections(); } catch (_) {}
      return true;
    }
    async function finish() { if (typeof loadTasks === "function") try { await loadTasks(); } catch (_) {} if (window.DayPlan) window.DayPlan.load(); }

    m.addEventListener("input", e => { const f = e.target.closest("[data-wr]"); if (f) { S.refl[f.dataset.wr] = f.value; S.dirty = true; } });
    m.addEventListener("change", async e => {
      const c = e.target.closest("[data-wui]"); if (!c) return;
      const id = Number(c.dataset.wui), on = c.checked; c.disabled = true;
      const ok = window.StudyProgress && await window.StudyProgress.syncItem(id, on);
      if (ok) { const it = S.items.find(i => i.id === id); if (it) it.done = on; } else c.checked = !on;
      c.disabled = false; draw();
    });
    m.addEventListener("click", async e => {
      if (e.target === m) return;
      const b = e.target.closest("[data-wu]"); if (!b || S.busy) return; const a = b.dataset.wu;
      if (a === "close") { m.remove(); return finish(); }
      if (a === "back") { if (S.step === 2 && !(await saveRefl())) return; S.step--; return draw(); }
      if (a === "next") { if (S.step === 2 && !(await saveRefl())) return; S.step++; return draw(); }
      if (a === "finish") { m.remove(); await finish(); return toast("🌙 今天收好了，晚安"); }
      if (a === "tomorrow") { m.remove(); await finish(); if (window.DayPlan) window.DayPlan.open(addDay(d, 1)); return; }
      const id = Number(b.dataset.id); if (!id) return;
      S.busy = true; b.disabled = true;
      try {
        if (a === "done") { if (typeof window.toggleTask !== "function") throw new Error("任務系統還沒載入"); await window.toggleTask(id, true); S.doneN++; }
        if (a === "move") { const { error } = await db.rpc("task_postpone", { p_id: id }); if (error) throw error; }
        if (a === "drop") { const { error } = await db.from("tasks").update({ skipped: true }).eq("id", id); if (error) throw error; }
        S.act[id] = a;
        if (a === "done" && window.StudyProgress) { try { S.items = (await window.StudyProgress.todayItems()).map(i => ({ ...i })); } catch (_) {} }
      } catch (err) { toast(err.message || String(err)); }
      S.busy = false; draw();
    });
    draw(); document.body.appendChild(m);
  }

  function addButton() {
    const card = document.getElementById("wrapup-card"); if (!card || card.querySelector(".wu-open")) return;
    const b = document.createElement("button"); b.type = "button"; b.className = "btn btn-primary wu-open"; b.textContent = "🌙 一鍵收尾（4 步）";
    b.addEventListener("click", open);
    const h = card.querySelector(":scope > h2"); h ? h.after(b) : card.prepend(b);
  }
  const st = document.createElement("style");
  st.textContent = `
    .wu-open { width: 100%; margin: 4px 0 8px; }
    .wu-dots { display: flex; gap: 4px; flex-wrap: wrap; margin: 6px 0 10px; } .wu-dots span { font-size: 11.5px; padding: 2px 8px; border-radius: 999px; background: rgba(127,127,127,.15); opacity: .7; }
    .wu-dots span.on { background: #7c5cff; color: #fff; opacity: 1; } .wu-dots span.ok { background: rgba(63,185,80,.25); opacity: 1; }
    .wu-body { max-height: 55vh; overflow: auto; }
    .wu-task { padding: 8px 2px; border-top: 1px solid rgba(127,127,127,.15); } .wu-task > span { display: block; font-size: 14px; margin-bottom: 4px; }
    .wu-task > div { display: flex; gap: 6px; flex-wrap: wrap; } .wu-task.done > span { opacity: .55; } .wu-task b { font-size: 13px; }
    .wu-empty { text-align: center; padding: 18px 0; opacity: .8; }
    .wu-nav { display: flex; gap: 8px; margin-top: 12px; } .wu-nav .btn { flex: 1; }`;
  document.head.appendChild(st);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addButton); else addButton();
  setTimeout(addButton, 1500);
  if (typeof window.applyPage === "function") { const base = window.applyPage; window.applyPage = function (name) { const r = base.apply(this, arguments); if (name === "today") setTimeout(addButton, 0); return r; }; }
  window.WrapUp = { open };
})();
