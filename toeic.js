/* 🃏 單字卡冊・📚 情境圖鑑・🎁 單字寶箱・🎡 複習輪盤・🎟️ 專注刮刮樂・✉️ 神秘信封・🛣️ 人生總里程・📈 單字存量・🏅 連續紀錄・🎯 多益分數預測
   資料在 sql/2026-11-08_單字卡冊_里程_信封_分數預測.sql（toeic_hub） */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const ITEM = { stardust: "✨ 星屑", gacha_coin: "🪙 扭蛋幣", wish_normal: "⭐ 星願瓶", wish_rare: "💎 稀有星願瓶", wish_limited: "🌠 限定星願瓶", chest_gold: "🧰 金寶箱", makeup_card: "🎫 補打卡券", t_scholar: "🎓 限定扭蛋角色「多益學者」" };
  const rw = o => Object.entries(o || {}).map(([k, v]) => `${ITEM[k] || k} ×${v}`).join("、");
  const H = { d: null, err: null, tab: "cards", filter: "all" };
  const SQLF = "sql/2026-11-08_單字卡冊_里程_信封_分數預測.sql";

  async function load() {
    const { data, error } = await db.rpc("toeic_hub");
    H.err = error ? error.message : null;
    if (!error) H.d = data;
    renderCard();
    return data;
  }
  function modal(html, cls) {
    document.querySelectorAll(".tp-modal").forEach(x => x.remove());
    const m = document.createElement("div");
    m.className = "vg-modal tp-modal";
    m.innerHTML = `<div class="vg-card ${cls || ""}">${html}</div>`;
    m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-vx]")) m.remove(); });
    document.body.appendChild(m);
    return m;
  }
  const nextStop = d => d.mileage.stops.find(s => s.km > d.mileage.km);
  const lastStop = d => [...d.mileage.stops].reverse().find(s => s.km <= d.mileage.km) || d.mileage.stops[0];

  /* ---------- 今日頁：🎁 每日獎勵站 ---------- */
  function renderCard() {
    const tp = document.querySelector('.page[data-page="today"]');
    if (!tp) return;
    let box = document.getElementById("tp-hub");
    if (!box) { box = document.createElement("section"); box.id = "tp-hub"; box.className = "card"; tp.appendChild(box); }
    const d = H.d;
    if (!d) { box.innerHTML = `<h2>🎁 每日獎勵站</h2><p class="tb-note">${H.err ? (/toeic_hub/.test(H.err) ? `資料庫還沒設定：到 Supabase 執行 ${SQLF}` : esc(H.err)) : "載入中…"}</p>`; return; }
    const c = d.chest, w = d.wheel, e = d.envelope, ns = nextStop(d), ls = lastStop(d), m = d.mileage;
    const row = (ic, t, sub, btn) => `<div class="tph-row"><span>${ic}</span><div><b>${t}</b><small>${sub}</small></div>${btn || ""}</div>`;
    box.innerHTML = `<h2>🎁 每日獎勵站</h2>
      ${row("🎁", "單字寶箱", c.claimed ? "今天開過了，明天再來" : `今天答 ${c.today.n}／10 題・秒懂 ${c.today.n ? Math.round(c.today.fast / c.today.n * 100) : 0}%／80%`, c.ok && !c.claimed ? `<button type="button" class="btn btn-small btn-primary" data-tp="chest">開箱</button>` : "")}
      ${row("🎡", "複習輪盤", w.claimed ? "今天轉過了" : w.due_left ? `還有 ${w.due_left} 個到期單字沒複習` : `今天複習了 ${w.reviewed}／10 個`, w.ok && !w.claimed ? `<button type="button" class="btn btn-small btn-primary" data-tp="wheel">轉！</button>` : "")}
      ${row("🎟️", "專注刮刮樂", `每專注 2 小時送一張・再 ${d.scratch.next_min} 分鐘・手上有 ${d.scratch.have} 張`, "")}
      ${!e.claimed_last ? row("✉️", "上週的神秘信封", "還沒拆，現在可以拆", `<button type="button" class="btn btn-small btn-primary" data-tp="env" data-last="1">拆信</button>`)
        : e.open_now && !e.claimed_this ? row("✉️", "這週的神秘信封寄到了！", "表現越好，越容易抽到稀有", `<button type="button" class="btn btn-small btn-primary" data-tp="env">拆信</button>`)
        : row("✉️", "神秘信封", e.claimed_this ? "這週已經拆了" : `週日晚上 6 點寄到・這週專注 ${e.this_week.focus_h} 小時`, "")}
      ${row("🛣️", `人生總里程 ${m.km} 公里`, ns ? `${ls.emoji} ${ls.name} → ${ns.emoji} ${ns.name}（再 ${(ns.km - m.km).toFixed(1)} 公里）` : "🏆 環島完成！", "")}
      <div class="tph-bar"><i style="width:${Math.min(100, m.km / 10)}%"></i></div>
      <button type="button" class="btn btn-small" data-tp="hub" style="width:100%;margin-top:8px">📖 多益收藏：卡冊・情境圖鑑・分數預測・里程・連續紀錄</button>`;
  }

  /* ---------- 📖 多益收藏 ---------- */
  const STARS = n => n ? "⭐".repeat(n) : "🆕";
  function cardsHtml(d) {
    const cs = d.cards.filter(c => H.filter === "all" || (H.filter === "shiny" ? c.shiny : H.filter === "5" ? c.stars >= 4 : H.filter === "new" ? c.stars <= 1 : c.tag === H.filter));
    const n5 = d.cards.filter(c => c.stars >= 4).length, nsh = d.cards.filter(c => c.shiny).length;
    return `<div class="tp-goal"><b>${d.total}</b> 張 / 目標 <b>2,000</b> 張<div class="tph-bar"><i style="width:${Math.min(100, d.total / 20)}%"></i></div><small>⭐ 1 學過・2 四天・3 十五天・4 四十五天・5 九十天；最近 3 次都 3 秒內答對 = ✨ 閃卡（${nsh} 張）</small></div>
      <div class="vc-modes">${[["all", "全部"], ["new", "🆕 新卡"], ["5", "⭐4 以上（" + n5 + "）"], ["shiny", "✨ 閃卡"]].map(([k, l]) => `<button type="button" class="${H.filter === k ? "on" : ""}" data-tpf="${k}">${l}</button>`).join("")}</div>
      <div class="tp-cards">${cs.slice(0, 300).map(c => `<div class="tp-c s${c.stars} ${c.shiny ? "shiny" : ""}"><b>${esc(c.word)}</b><small>${esc(c.meaning || "")}</small><span>${STARS(c.stars)}</span><em>${esc(c.tag)}</em></div>`).join("") || `<p class="tb-note">沒有符合的卡</p>`}</div>`;
  }
  function scenesHtml(d) {
    return `<p class="vg-note">每個多益情境是一本圖鑑。那個情境至少 10 個字、而且 80% 以上達到 ⭐3（15 天間隔），就拿到徽章稱號＋星屑 100。</p>
      ${d.scenes.map(s => { const pct = Math.round(s.m / s.n * 100);
        return `<button type="button" class="tp-scene ${s.done ? "done" : ""}" data-tpf="${esc(s.tag)}" data-go="cards"><span>${s.emoji}</span><div><b>${esc(s.tag)}</b><small>${s.done ? `🏅 已拿到「${esc(s.badge)}」` : `${s.m}/${s.n} 精通${s.n < 10 ? `・還差 ${10 - s.n} 個字才能挑戰` : ""}`}</small>
          <div class="tph-bar"><i style="width:${pct}%"></i><u style="left:80%"></u></div></div><em>${pct}%</em></button>`; }).join("") || `<p class="tb-note">還沒有單字</p>`}`;
  }
  function line(pts, W, Hh, color, maxY, minY) {
    if (pts.length < 2) return "";
    const lo = minY || 0, X = i => 30 + i / (pts.length - 1) * (W - 40), Y = v => Hh - 20 - (v - lo) / (maxY - lo || 1) * (Hh - 34);
    return `<polyline fill="none" stroke="${color}" stroke-width="2.2" points="${pts.map((v, i) => `${X(i)},${Y(v)}`).join(" ")}"/>`;
  }
  function scoreHtml(d) {
    const hist = d.est_hist.map(x => x.s), W = 340, Hh = 150, lo = 300, hi = 700, Y = v => Hh - 20 - (v - lo) / (hi - lo) * (Hh - 34);
    const cur = d.curve, kMax = Math.max(50, ...cur.map(c => c.added));
    return `<div class="tp-est"><small>目前粗估</small><b>${d.est}</b><span>目標 650</span></div>
      <p class="vg-note">這是用你的單字量（會了 ${d.known} 個）、秒懂率（${d.fast_pct == null ? "還沒有資料" : d.fast_pct + "%"}）、聽音題答對率（${d.listen_pct == null ? "還沒有資料" : d.listen_pct + "%"}）算出來的<b>粗估</b>，只能看趨勢，不等於真正的分數；寫模擬考才準。每週記一次。</p>
      <svg viewBox="0 0 ${W} ${Hh}" class="tp-svg"><line x1="30" x2="${W - 10}" y1="${Y(650)}" y2="${Y(650)}" stroke="#3fb950" stroke-dasharray="4 4"/><text x="${W - 12}" y="${Y(650) - 4}" text-anchor="end" font-size="10" fill="#3fb950">650</text>
        ${[400, 500, 600].map(v => `<text x="2" y="${Y(v) + 3}" font-size="9" fill="currentColor" opacity=".5">${v}</text>`).join("")}
        ${hist.length > 1 ? line(hist, W, Hh, "#7c5cff", hi, lo) : `<circle cx="${W / 2}" cy="${Y(d.est)}" r="4" fill="#7c5cff"/><text x="${W / 2}" y="${Y(d.est) - 8}" text-anchor="middle" font-size="10" fill="currentColor">這週 ${d.est}</text>`}</svg>
      <div class="vg-sec">📈 單字存量（最近 60 天）</div>
      <p class="vg-note">紫線 = 加進單字本的字，綠線 = 真的會了（在 3 天以上的間隔還答對）。650 分大約要熟悉 2,500 個多益常用字，目前完成 ${Math.round(d.known / 25)}%。</p>
      <svg viewBox="0 0 ${W} ${Hh}" class="tp-svg">${line(cur.map(c => c.added), W, Hh, "#7c5cff", kMax)}${line(cur.map(c => c.known), W, Hh, "#3fb950", kMax)}
        <text x="2" y="14" font-size="9" fill="currentColor" opacity=".6">${kMax}</text><text x="2" y="${Hh - 20}" font-size="9" fill="currentColor" opacity=".6">0</text></svg>`;
  }
  function mileHtml(d) {
    const m = d.mileage;
    return `<div class="tp-est"><small>人生總里程（專注 1 小時 = 1 公里）</small><b>${m.km}</b><span>/ 1000 公里環島</span></div>
      <div class="tp-route">${m.stops.map(s => { const on = s.km <= m.km, nx = !on && s === nextStop(d);
        return `<div class="tp-stop ${on ? "on" : ""} ${nx ? "next" : ""}"><span>${on ? s.emoji : nx ? "🚶" : "⚪"}</span><b>${esc(s.name)}</b><small>${s.km} km${s.km && on ? "・✨ 已領" : nx ? `・再 ${(s.km - m.km).toFixed(1)} km` : ""}</small></div>`; }).join("")}</div>
      <p class="vg-note">每抵達一站送星屑（越遠越多）。</p>`;
  }
  const TIERS = [[60, "💎 鑽石"], [30, "🏆 白金"], [14, "🥇 金"], [7, "🥈 銀"], [3, "🥉 銅"]];
  const tier = n => (TIERS.find(t => n >= t[0]) || [0, "—"])[1];
  function medalsHtml(d) {
    return `<p class="vg-note">最長連續紀錄掛成獎牌：3 天銅、7 天銀、14 天金、30 天白金、60 天鑽石。破紀錄時獎牌會升級。</p>
      <div class="tp-medals">${d.medals.map(m => `<div class="tp-medal"><span>${tier(m.best).split(" ")[0]}</span><b>${esc(m.name)}</b><small>最長 ${m.best} 天・${tier(m.best).split(" ")[1] || "還沒有獎牌"}</small><em>${m.cur ? `🔥 目前連續 ${m.cur} 天${m.cur >= m.best && m.best >= 3 ? "・正在刷新紀錄！" : ""}` : "目前沒有連續"}</em></div>`).join("")}</div>`;
  }

  function openHub() {
    const d = H.d;
    if (!d) return toast(`資料庫還沒設定：到 Supabase 執行 ${SQLF}`);
    const T = { cards: ["🃏", "卡冊", cardsHtml], scenes: ["📚", "情境", scenesHtml], score: ["🎯", "分數", scoreHtml], mile: ["🛣️", "里程", mileHtml], medals: ["🏅", "紀錄", medalsHtml] };
    const m = modal(`<div class="vg-title">📖 多益收藏</div><div class="tb-tabs">${Object.entries(T).map(([k, v]) => `<button type="button" class="${H.tab === k ? "on" : ""}" data-tpt="${k}">${v[0]} ${v[1]}</button>`).join("")}</div>
      <div class="gp-body">${T[H.tab][2](d)}</div><button type="button" class="btn" data-vx="1" style="width:100%;margin-top:10px">關閉</button>`);
    m.addEventListener("click", e => {
      const t = e.target.closest("[data-tpt]"); if (t) { H.tab = t.dataset.tpt; return openHub(); }
      const f = e.target.closest("[data-tpf]"); if (f) { H.filter = f.dataset.tpf; if (f.dataset.go) H.tab = f.dataset.go; return openHub(); }
    });
  }

  /* ---------- 動作 ---------- */
  const WHEEL = [["✨", "星屑 20"], ["🪙", "扭蛋幣 1"], ["✨", "星屑 50"], ["🎫", "補打卡券"], ["🪙", "扭蛋幣 3"], ["⭐", "星願瓶"], ["🧰", "金寶箱"]];
  async function spin() {
    const m = modal(`<div class="vg-title">🎡 複習輪盤</div><div class="tp-wheel"><div class="tp-wheel-in">${WHEEL.map((w, i) => `<span style="transform:rotate(${i * 360 / 7}deg) translateY(-92px) rotate(${-i * 360 / 7}deg)">${w[0]}</span>`).join("")}</div><i class="tp-pin">▼</i></div><p class="tp-wout">轉動中…</p>`);
    const { data, error } = await db.rpc("vocab_wheel_spin");
    if (error) { m.remove(); return toast(error.message); }
    const inn = m.querySelector(".tp-wheel-in");
    requestAnimationFrame(() => { inn.style.transform = `rotate(${360 * 5 - data.idx * 360 / 7}deg)`; });
    setTimeout(() => { m.querySelector(".tp-wout").innerHTML = `🎉 抽到 <b>${WHEEL[data.idx][0]} ${WHEEL[data.idx][1]}</b>！<br><button type="button" class="btn btn-primary" data-vx="1" style="margin-top:8px">收下</button>`; load(); }, 3200);
  }
  async function chest() {
    const { data, error } = await db.rpc("vocab_chest_open");
    if (error) return toast(error.message);
    modal(`<div class="bh-loot"><div class="bh-big">🎁</div><div class="vg-title">單字寶箱</div><p class="bh-items">${rw(data.got)}</p>${data.got.t_scholar ? `<p>🎓 抽到限定角色「多益學者」！已經放進扭蛋收藏</p>` : ""}</div><button type="button" class="btn btn-primary" data-vx="1" style="width:100%">收下</button>`);
    load(); if (window.FunGame && window.FunGame.reload) window.FunGame.reload();
  }
  async function env(last) {
    const { data, error } = await db.rpc("envelope_open", { p_last: !!last });
    if (error) return toast(error.message);
    const T = { legend: ["🌠", "傳說信封"], rare: ["💎", "稀有信封"], good: ["💌", "好運信封"], normal: ["✉️", "普通信封"] }[data.tier];
    const s = data.stats;
    modal(`<div class="bh-loot"><div class="bh-big tp-env">${T[0]}</div><div class="vg-title">${T[1]}</div>
      <p>${last ? "上週" : "這週"}表現分數 <b>${data.score}</b>／100：專注 ${s.focus_h} 小時、完成 ${s.tasks} 個任務、打卡 ${s.life_days} 天、複習單字 ${s.vocab} 次</p><p class="bh-items">${rw(data.got)}</p></div>
      <button type="button" class="btn btn-primary" data-vx="1" style="width:100%">收下</button>`);
    load();
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-tp]");
    if (!b || !hasDb() || !["hub", "chest", "wheel", "env"].includes(b.dataset.tp)) return;
    if (b.dataset.tp === "hub") return openHub();
    if (b.dataset.tp === "chest") return chest();
    if (b.dataset.tp === "wheel") return spin();
    if (b.dataset.tp === "env") return env(b.dataset.last === "1");
  });

  const st = document.createElement("style");
  st.textContent = `
    .tph-row { display: flex; gap: 10px; align-items: center; padding: 7px 0; border-top: 1px solid rgba(127,127,127,.18); } .tph-row > span { font-size: 24px; } .tph-row > div { flex: 1; }
    .tph-row b { display: block; font-size: 13.5px; } .tph-row small { font-size: 11.5px; opacity: .75; }
    .tph-bar { position: relative; height: 7px; border-radius: 9px; background: rgba(127,127,127,.2); overflow: visible; margin-top: 4px; } .tph-bar i { display: block; height: 100%; border-radius: 9px; background: linear-gradient(90deg, #58a6ff, #3fb950); }
    .tph-bar u { position: absolute; top: -3px; bottom: -3px; width: 2px; background: #ffd54a; }
    .tp-goal { text-align: center; margin-bottom: 8px; } .tp-goal b { font-size: 20px; } .tp-goal small { display: block; font-size: 11px; opacity: .7; margin-top: 4px; }
    .tp-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
    .tp-c { position: relative; border-radius: 10px; padding: 8px 6px 6px; background: linear-gradient(160deg, #262c48, #1a1f36); border: 1px solid #3a4260; min-height: 78px; overflow: hidden; color: #eef; }
    .tp-c b { display: block; font-size: 13px; word-break: break-word; } .tp-c small { display: block; font-size: 10.5px; opacity: .75; line-height: 1.3; max-height: 28px; overflow: hidden; }
    .tp-c span { display: block; font-size: 9px; margin-top: 3px; } .tp-c em { position: absolute; right: 5px; top: 4px; font-size: 9px; opacity: .5; font-style: normal; }
    .tp-c.s3 { border-color: #58a6ff; } .tp-c.s4 { border-color: #c08bff; } .tp-c.s5 { border-color: #ffd54a; background: linear-gradient(160deg, #3a3220, #1f1a10); }
    .tp-c.shiny::after { content: ""; position: absolute; inset: 0; background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,.35) 45%, rgba(255,213,74,.25) 50%, transparent 65%); background-size: 250% 100%; animation: tpShine 2.6s linear infinite; pointer-events: none; }
    @keyframes tpShine { from { background-position: 150% 0; } to { background-position: -100% 0; } }
    .tp-scene { display: flex; gap: 10px; align-items: center; width: 100%; text-align: left; border: 0; background: none; color: inherit; font: inherit; padding: 8px 0; border-top: 1px solid rgba(127,127,127,.2); cursor: pointer; }
    .tp-scene > span { font-size: 26px; } .tp-scene > div { flex: 1; } .tp-scene small { display: block; font-size: 11.5px; opacity: .75; } .tp-scene em { font-style: normal; font-weight: 800; } .tp-scene.done em { color: #ffd54a; }
    .tp-est { text-align: center; padding: 10px; border-radius: 14px; background: rgba(124,92,255,.12); } .tp-est small { display: block; font-size: 12px; opacity: .75; } .tp-est b { font-size: 40px; } .tp-est span { display: block; font-size: 12px; opacity: .7; }
    .tp-svg { width: 100%; color: inherit; background: rgba(127,127,127,.06); border-radius: 10px; margin-top: 6px; }
    .tp-route { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin-top: 8px; }
    .tp-stop { display: flex; gap: 6px; align-items: center; padding: 6px 8px; border-radius: 10px; background: rgba(127,127,127,.08); opacity: .5; font-size: 12.5px; } .tp-stop.on { opacity: 1; } .tp-stop.next { opacity: 1; outline: 2px solid #ffd54a; }
    .tp-stop span { font-size: 18px; } .tp-stop small { margin-left: auto; font-size: 10.5px; opacity: .75; }
    .tp-medals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; } .tp-medal { text-align: center; padding: 10px 6px; border-radius: 12px; background: rgba(127,127,127,.1); }
    .tp-medal span { font-size: 34px; display: block; } .tp-medal b { display: block; font-size: 12.5px; } .tp-medal small, .tp-medal em { display: block; font-size: 11px; opacity: .8; font-style: normal; }
    .tp-wheel { position: relative; width: 230px; height: 230px; margin: 10px auto; } .tp-pin { position: absolute; left: 50%; top: -6px; transform: translateX(-50%); font-style: normal; color: #ffd54a; font-size: 22px; z-index: 2; }
    .tp-wheel-in { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(#7c5cff 0 14.3%, #58a6ff 0 28.6%, #3fb950 0 42.9%, #e3b341 0 57.1%, #f0883e 0 71.4%, #ff9ec7 0 85.7%, #c08bff 0); transition: transform 3s cubic-bezier(.15,.8,.2,1); display: grid; place-items: center; }
    .tp-wheel-in span { position: absolute; font-size: 24px; } .tp-wout { text-align: center; font-size: 14px; }
    .tp-env { animation: cpPop .7s cubic-bezier(.2,1.6,.4,1); }
  `;
  document.head.appendChild(st);

  (function boot(n) {
    if (!hasDb() || !document.querySelector('.page[data-page="today"]')) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; }
    load();
    setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  })(0);
  window.ToeicHub = { load, open: openHub };
})();
