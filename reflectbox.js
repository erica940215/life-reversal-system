/* 🌙 生活打卡勾「每日反省」「今日學到什麼」時，跳出一個小框直接寫
   寫進 daily_reflections（反省、改善、今天學到什麼） */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const today = () => (typeof appDateOf === "function" ? appDateOf(Date.now()) : new Date(Date.now() - 6 * 3600e3).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }));

  async function open(kind) {
    if (typeof db === "undefined" || !currentUser) return;
    const d = today();
    const { data } = await db.from("daily_reflections").select("reflection, improvement, learned").eq("user_id", currentUser.id).eq("reflect_date", d).maybeSingle();
    const r = data || {};
    const learn = kind === "learn";
    const m = document.createElement("div");
    m.className = "vg-modal";
    m.innerHTML = `<div class="vg-card"><div class="vg-title">${learn ? "📘 今天學到什麼" : "🪞 每日反省"}</div>
      ${learn ? `<p class="vg-note">一句話也可以：一個觀念、一個單字、一個發現。</p><textarea id="rb-a" rows="4" maxlength="500" placeholder="今天我學到…">${esc(r.learned)}</textarea>`
        : `<p class="vg-note">今天哪裡做得好、哪裡可以更好？</p><label class="tw-lab">今天的反省<textarea id="rb-a" rows="3" maxlength="500" placeholder="今天…">${esc(r.reflection)}</textarea></label>
          <label class="tw-lab">明天要改善<textarea id="rb-b" rows="3" maxlength="300" placeholder="一行寫一個方法，會加進改善清單，每天打卡直到你真的改掉&#10;例如：&#10;鬧鐘放在牙刷旁邊&#10;兩點半準時上床">${esc(r.improvement)}</textarea></label>`}
      <div style="display:flex;gap:6px;margin-top:8px"><button type="button" class="btn" data-rbx="1" style="flex:1">先不寫</button><button type="button" class="btn btn-primary" data-rbs="1" style="flex:1">儲存</button></div></div>`;
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-rbx]")) return m.remove();
      if (!e.target.closest("[data-rbs]")) return;
      const a = m.querySelector("#rb-a").value.trim(), b = m.querySelector("#rb-b") ? m.querySelector("#rb-b").value.trim() : null;
      const row = { user_id: currentUser.id, reflect_date: d, updated_at: new Date().toISOString() };
      if (learn) row.learned = a; else { row.reflection = a; row.improvement = b; }
      const { error } = await db.from("daily_reflections").upsert(row, { onConflict: "user_id,reflect_date" });
      if (error) return toast("儲存失敗：" + error.message);
      m.remove(); toast(learn ? "📘 記下來了" : "🪞 反省寫好了，改善方法明天會加進改善清單");
      if (window.ImproveBox) window.ImproveBox.load();
      if (typeof loadReflections === "function") loadReflections();
    });
    m.querySelector("textarea").focus();
    document.body.appendChild(m);
  }
  const st = document.createElement("style");
  st.textContent = `.vg-card textarea { width: 100%; box-sizing: border-box; background: #12162a; color: #eef; border: 1px solid #3a4260; border-radius: 10px; padding: 8px; font: inherit; margin: 4px 0; resize: vertical; }`;
  document.head.appendChild(st);
  window.ReflectBox = { open };
})();
