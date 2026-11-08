/* 🎯 反省的改善打卡：昨天「每日反省」寫的「明天要改善」，今天變成打卡項目 */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const I = { d: null };
  async function load() {
    const { data, error } = await db.rpc("improve_today");
    if (!error) I.d = data;
    render();
  }
  function render() {
    const tp = document.querySelector('.page[data-page="today"]');
    if (!tp || !I.d) return;
    let box = document.getElementById("im-today");
    if (!box) { box = document.createElement("section"); box.id = "im-today"; box.className = "card"; tp.appendChild(box); }
    const d = I.d, its = d.items, done = its.filter(i => i.done).length;
    const wk = d.week.filter(w => w.day !== d.day), wn = wk.reduce((a, w) => a + w.n, 0), wd = wk.reduce((a, w) => a + w.d, 0);
    const tonight = String(d.tonight || "").split(/[\n；;]/).map(x => x.replace(/^\s*([0-9]+[.、)]|[-・•*])\s*/, "").trim()).filter(Boolean);
    box.innerHTML = `<h2>🎯 改善打卡</h2>
      ${its.length ? `<p class="tb-note">昨天反省時說要改善的，今天有做到嗎？${done === its.length ? "🎉 全部做到了！✨+15" : `（${done}/${its.length}）`}</p>
        ${its.map(i => `<label class="im-it ${i.done ? "on" : ""}"><input type="checkbox" data-im="${i.idx}" ${i.done ? "checked" : ""}><span>${esc(i.text)}</span></label>`).join("")}`
        : `<p class="tb-note">今天沒有改善項目。晚上勾「🌙 每日反省」時，在「明天要改善」<b>一行寫一個方法</b>，明天就會變成這裡的打卡。</p>`}
      ${tonight.length ? `<p class="tb-note">🌙 明天要打卡的：${tonight.map(esc).join("・")}</p>` : ""}
      ${wn ? `<p class="tb-note">📈 最近 7 天改善達成率：<b>${Math.round(wd / wn * 100)}%</b>（${wd}/${wn}）</p>` : ""}`;
  }
  document.addEventListener("change", async e => {
    const c = e.target.closest("[data-im]");
    if (!c || !hasDb()) return;
    const { data, error } = await db.rpc("improve_toggle", { p_idx: Number(c.dataset.im), p_done: c.checked });
    if (error) { c.checked = !c.checked; return toast(error.message); }
    const all = data.items.length && data.items.every(i => i.done);
    I.d = data; render(); if (c.checked) toast(all ? "🎉 改善項目全部做到了！✨+15" : "✅ 做到了");
  });
  const st = document.createElement("style");
  st.textContent = `.im-it { display: flex; gap: 10px; align-items: center; padding: 8px 4px; border-top: 1px solid rgba(127,127,127,.15); cursor: pointer; font-size: 14px; }
    .im-it input { width: 20px; height: 20px; flex: none; } .im-it.on span { text-decoration: line-through; opacity: .6; }`;
  document.head.appendChild(st);
  (function boot(n) { if (!hasDb() || !document.querySelector('.page[data-page="today"]')) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; }
    load(); setInterval(() => { if (!document.hidden) load(); }, 10 * 60 * 1000); document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); }); })(0);
  window.ImproveBox = { load };
})();
