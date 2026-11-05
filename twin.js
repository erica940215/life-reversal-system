/* 🪞 理想中的你：分身照計畫每天走 1 天的路，你走「今日分數」那麼遠
   資料在 sql/2026-11-06_理想分身.sql */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const T = { d: null, err: null };
  const dd = n => { const a = Math.abs(n); return a < 0.1 ? "不到 0.1 天" : `${a.toFixed(1)} 天`; };

  async function load() {
    const { data, error } = await db.rpc("twin_status");
    T.err = error ? error.message : null;
    if (!error) T.d = data;
    render();
  }

  function mood(d) {
    const g = d.gap, n = esc(d.settings.name);
    if (d.rest_today) return ["rest", `☕ 今天是休息日，${n}也坐下來喝杯茶。`];
    if (g <= -1) return ["ahead", `🌟 你超越${n} ${dd(g)}了！他說：「原來你比我想像的更厲害。」`];
    if (g <= 0.05) return ["side", `✨ 你們並肩走著。這段路在發光。`];
    if (d.waiting) return ["wait", `🪑 ${n}坐在路邊等你。差距不會再拉開，回來就追得上。`];
    if (g < 2) return ["near", `👋 ${n}在前面 ${dd(g)}，回頭跟你招手。現在追趕 ×1.5 加速中。`];
    return ["far", `🚶 ${n}在前面 ${dd(g)}。每一分努力現在都算 1.5 倍，慢慢追上去。`];
  }

  function road(d) {
    const g = Math.max(-2, Math.min(7, d.gap));
    const lo = Math.min(0, g) - 0.8, hi = Math.max(g, 0) + 1.2, X = v => 6 + (v - lo) / (hi - lo) * 88;
    const ticks = []; for (let i = Math.ceil(lo); i <= Math.floor(hi); i++) ticks.push(i);
    const side = Math.abs(g) <= 0.05;
    return `<div class="tw-road ${side ? "glow" : ""}"><div class="tw-path"></div>
      ${ticks.map(i => `<i class="tw-tick" style="left:${X(i)}%"></i>`).join("")}
      ${g > 0.05 ? `<div class="tw-gap" style="left:${X(0)}%;width:${X(g) - X(0)}%"><span>${dd(g)}</span></div>` : ""}
      <div class="tw-av twin ${d.waiting ? "sit" : ""}" style="left:${X(g)}%"><span>${d.waiting ? "🧘" : "🚶"}</span><small>${esc(d.settings.name)}</small></div>
      <div class="tw-av me" style="left:${X(0)}%"><span>🏃</span><small>你</small></div></div>`;
  }

  function render() {
    const tp = document.querySelector('.page[data-page="today"]');
    if (!tp) return;
    let box = document.getElementById("tw-today");
    if (!box) {
      box = document.createElement("section");
      box.id = "tw-today"; box.className = "card";
      const ref = document.getElementById("bh-bar");
      ref ? ref.after(box) : tp.prepend(box);
    }
    const d = T.d;
    if (!d) { box.innerHTML = `<h2>🪞 理想中的你</h2><p class="tw-note">${T.err ? (/twin_status/.test(T.err) ? "資料庫還沒設定：到 Supabase 執行 sql/2026-11-06_理想分身.sql" : esc(T.err)) : "載入中…"}</p>`; return; }
    const [k, line] = mood(d), t = d.today || {}, s = d.settings;
    box.className = "card tw-card tw-" + k;
    box.innerHTML = `<h2>🪞 理想中的你</h2>${road(d)}
      <p class="tw-line">${line}</p>
      <div class="tw-today">今天走了 <b>${(t.score || 0).toFixed(2)}</b> 天的路
        <span>⏱️ 專注 ${t.focus_min || 0}/${s.focus_goal} 分</span><span>🌱 打卡 ${t.life || 0}%</span><span>✅ 任務 ${t.done || 0}/${t.tasks || 0}</span></div>
      ${d.can_claim ? `<button type="button" class="btn btn-primary" data-tw="claim" style="width:100%;margin-top:8px">✨ 並肩獎勵：星屑 100＋扭蛋幣 2（每週一次）</button>` : ""}
      ${d.suggest === "lower" ? `<div class="tw-sug">🤔 ${esc(s.name)}：「這兩週我好像走太快了。要不要一起放慢一點？」<button type="button" class="btn btn-small" data-tw="set">調整目標</button></div>` : ""}
      ${d.suggest === "raise" ? `<div class="tw-sug">💪 ${esc(s.name)}：「你這週一直走在我前面，要不要把目標調高一點？」<button type="button" class="btn btn-small" data-tw="set">調整目標</button></div>` : ""}
      <button type="button" class="tw-more" data-tw="set">⚙️ 目標與紀錄</button>`;
  }

  function openSet() {
    const d = T.d;
    if (!d) return;
    const s = d.settings, hist = (d.history || []).slice().reverse();
    const max = Math.max(1, ...hist.map(h => Math.abs(h.gap)));
    const m = document.createElement("div");
    m.className = "vg-modal";
    m.innerHTML = `<div class="vg-card"><div class="vg-title">🪞 理想中的你</div>
      <p class="vg-note">分身每天照計畫走 1 天的路；你每天走「今日分數」那麼遠：專注 50%（達到每日目標＝滿分，最多 1.5 倍）＋ 生活打卡 30% ＋ 任務完成 20%。落後時你的分數 ×1.5；差距最多 7 天，超過他會停下來等你；休息日他也休息。</p>
      <label class="tw-lab">分身的名字<input id="tw-name" maxlength="20" value="${esc(s.name)}"></label>
      <label class="tw-lab">每日專注目標（分鐘）<input id="tw-goal" type="number" min="30" max="720" step="10" value="${s.focus_goal}"></label>
      <div class="ch-chips">${[120, 180, 240, 300, 360].map(n => `<button type="button" data-twg="${n}">${n / 60} 小時</button>`).join("")}</div>
      <div class="vg-sec">📈 最近的差距（往上＝落後，往下＝超前）</div>
      <div class="tw-hist">${hist.map(h => `<div title="${h.d}：${h.gap > 0 ? "落後" : "超前"} ${Math.abs(h.gap)} 天" class="${h.rest ? "rest" : ""}"><p class="u">${h.gap > 0 ? `<i class="b" style="height:${h.gap / max * 100}%"></i>` : ""}</p><p class="v">${h.gap < 0 ? `<i class="a" style="height:${-h.gap / max * 100}%"></i>` : ""}</p><small>${h.d.slice(8)}</small></div>`).join("")}</div>
      <p class="tw-note">從 ${s.start_date} 開始，第 ${d.days} 天</p>
      <div style="display:flex;gap:6px;margin-top:8px"><button type="button" class="btn" data-twr="1" style="flex:1">🔄 從今天重新開始</button><button type="button" class="btn btn-primary" data-tws="1" style="flex:1">儲存</button></div>
      <button type="button" class="btn" data-vx="1" style="width:100%;margin-top:6px">關閉</button></div>`;
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-vx]")) return m.remove();
      const g = e.target.closest("[data-twg]");
      if (g) { m.querySelector("#tw-goal").value = g.dataset.twg; return; }
      let r;
      if (e.target.closest("[data-tws]")) r = await db.rpc("twin_save", { p_goal: Number(m.querySelector("#tw-goal").value), p_name: m.querySelector("#tw-name").value });
      else if (e.target.closest("[data-twr]")) { if (!confirm("把起點改成今天，差距歸零？")) return; r = await db.rpc("twin_reset"); }
      else return;
      if (r.error) return toast(r.error.message);
      T.d = r.data; render(); m.remove(); toast("🪞 設定好了");
    });
    document.body.appendChild(m);
  }

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-tw]");
    if (!b || !hasDb()) return;
    if (b.dataset.tw === "set") return openSet();
    if (b.dataset.tw === "claim") {
      const { data, error } = await db.rpc("twin_claim");
      if (error) return toast(error.message);
      T.d = data; render(); toast("✨ 並肩獎勵：星屑 +100、扭蛋幣 +2");
    }
  });

  const st = document.createElement("style");
  st.textContent = `
    .tw-card { background: linear-gradient(160deg, rgba(124,92,255,.12), rgba(94,240,196,.06)); }
    .tw-road { position: relative; height: 92px; margin: 6px 0 2px; }
    .tw-path { position: absolute; left: 2%; right: 2%; top: 62px; height: 10px; border-radius: 10px; background: repeating-linear-gradient(90deg, rgba(200,180,140,.45) 0 14px, rgba(200,180,140,.3) 14px 28px); }
    .tw-road.glow .tw-path { background: linear-gradient(90deg, #ffd54a, #ff9ec7, #8f9bff); box-shadow: 0 0 16px #ffd54a; }
    .tw-tick { position: absolute; top: 74px; width: 1px; height: 6px; background: currentColor; opacity: .3; }
    .tw-gap { position: absolute; top: 44px; height: 2px; border-top: 2px dashed rgba(255,213,74,.7); } .tw-gap span { position: absolute; left: 50%; top: -18px; transform: translateX(-50%); font-size: 11px; white-space: nowrap; color: #ffd54a; }
    .tw-av { position: absolute; top: 18px; transform: translateX(-50%); text-align: center; transition: left .8s ease; } .tw-av span { font-size: 30px; display: block; line-height: 1; } .tw-av small { font-size: 10.5px; opacity: .8; white-space: nowrap; }
    .tw-av.twin span { filter: drop-shadow(0 0 8px #b9a6ff) hue-rotate(200deg); opacity: .9; } .tw-av.me span { transform: scaleX(-1); }
    .tw-av.twin:not(.sit) span { animation: twWalk 1.2s ease-in-out infinite; } @keyframes twWalk { 50% { transform: translateY(-3px); } }
    .tw-line { font-size: 13.5px; margin: 4px 0 6px; }
    .tw-today { font-size: 12.5px; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; } .tw-today b { font-size: 16px; } .tw-today span { opacity: .8; }
    .tw-sug { margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: rgba(127,127,127,.12); font-size: 12.5px; display: flex; gap: 8px; align-items: center; justify-content: space-between; }
    .tw-more { display: block; margin: 8px 0 0 auto; border: 0; background: none; color: inherit; opacity: .7; font-size: 12px; cursor: pointer; }
    .tw-note { font-size: 12px; opacity: .7; } .tw-lab { display: block; font-size: 12.5px; margin: 6px 0; }
    .tw-hist { display: flex; align-items: center; gap: 2px; height: 90px; padding: 4px 0; } .tw-hist > div { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; position: relative; }
    .tw-hist p { margin: 0; flex: 1; width: 100%; display: flex; justify-content: center; } .tw-hist p.u { align-items: flex-end; border-bottom: 1px solid rgba(127,127,127,.35); } .tw-hist p.v { align-items: flex-start; }
    .tw-hist i { width: 70%; display: block; border-radius: 3px; } .tw-hist i.b { background: #e3b341; } .tw-hist i.a { background: #3fb950; }
    .tw-hist small { position: absolute; bottom: -12px; font-size: 9px; opacity: .6; } .tw-hist .rest i { opacity: .35; }
    .tw-ahead .tw-line { color: #3fb950; } .tw-wait .tw-line { color: #e3b341; }
  `;
  document.head.appendChild(st);

  (function boot(n) {
    if (!hasDb()) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; }
    load();
    setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  })(0);
})();
