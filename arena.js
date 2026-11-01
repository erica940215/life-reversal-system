/* 序光計畫：⚔️ 冒險 → 🏟️ 競技場（資料在 sql/2026-11-01_冒險_競技場.sql） */
(function () {
  const ARENA_JS_VERSION = "20261101a";
  const AR = { data: null, error: null, loading: false, busy: false, shown: false };

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = msg => (typeof showToast === "function" ? showToast(msg) : alert(msg));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const rerender = () => { if (window.RpgGame && window.RpgGame.state.tab === "arena") window.RpgGame.render(); };

  const TIER = {
    bronze: ["青銅", "🥉", 0, 15], silver: ["白銀", "🥈", 15, 30], gold: ["黃金", "🥇", 30, 45],
    diamond: ["鑽石", "💎", 45, 60], legend: ["傳說", "👑", 60, null]
  };
  const THEME = {
    focus: ["⏱️ 專注週", "這週專注分鐘數（不算補記）"], task: ["✅ 任務週", "這週完成的任務數"],
    habit: ["🌱 習慣週", "這週習慣打卡次數（不算補打）"], early: ["🌅 早起週", "早上 5～9 點完成的任務和開始的專注"]
  };
  const ITEM = {
    arena_coin: "競技幣", ticket_normal: "普通召喚券", ticket_special: "特殊召喚券", ticket_limited: "限定召喚券",
    wish_rare: "稀有星願瓶", wish_limited: "限定星願瓶", chest_star: "星光寶箱", chest_gold: "黃金寶箱", gacha_coin: "扭蛋幣", frame: "頭像框"
  };
  const fmtReward = r => Object.entries(r || {}).map(([k, v]) => k === "frame" ? v : `${ITEM[k] || k} ×${v}`).join("、");
  const md = d => { const x = String(d).slice(5).split("-"); return `${+x[0]}/${+x[1]}`; };

  async function load() {
    if (!hasDb() || AR.loading) return;
    AR.loading = true;
    const { data, error } = await db.rpc("arena_status");
    AR.loading = false;
    if (error) AR.error = /arena_status|function/.test(error.message) ? "setup" : error.message;
    else {
      AR.data = data; AR.error = null;
      if (!AR.shown && data.rewards && data.rewards.length) {
        AR.shown = true;
        toast("🏟️ 競技獎勵：" + data.rewards.map(r => r.why + (Object.keys(r.reward || {}).length ? "（" + fmtReward(r.reward) + "）" : "")).join("；"));
      }
    }
    rerender();
  }

  function boardHtml(rows, key, unit) {
    return `<ol class="ar-board">${(rows || []).map((r, i) =>
      `<li class="${r.me ? "me" : ""}"><span class="ar-rk">${i + 1}</span><span class="ar-nm">${r.emoji} ${esc(r.name)}</span><b>${r[key]}${unit}</b></li>`).join("")}</ol>`;
  }

  function html() {
    if (!hasDb()) return "";
    if (AR.error === "setup") return `<div class="card rp-card"><p class="rp-note">⚠️ 競技場的資料庫還沒設定：到 Supabase 的 SQL Editor 執行 <b>sql/2026-11-01_冒險_競技場.sql</b>。</p></div>`;
    if (AR.error) return `<div class="card rp-card"><p class="rp-note">競技場載入失敗：${esc(AR.error)}</p></div>`;
    if (!AR.data) { load(); return `<div class="card rp-card"><p class="rp-note">競技場載入中…</p></div>`; }
    const d = AR.data, t = TIER[d.tier] || TIER.bronze, th = THEME[d.theme] || THEME.focus;
    const next = t[3] ? `再 ${t[3] - d.week_points} 點升段` : "最高段位";
    const pct = t[3] ? Math.min(100, Math.round((d.week_points - t[2]) / (t[3] - t[2]) * 100)) : 100;

    const opp = (d.opponents || []).map(o => `<div class="ar-opp"><span class="ar-oe">${o.emoji}</span><div><b>${esc(o.name)}</b>
      <small>${o.kind === "friend" ? `好友・今天 ${o.score} 分` : `電腦・實力 ${o.base}`}</small></div></div>`).join("");
    const recent = (d.recent || []).length ? (d.recent || []).map(r => `<li class="${r.win ? "w" : "l"}"><span>${md(r.day)}</span>
      <span>${r.emoji || "🤖"} ${esc(r.name || "?")}</span><span>${r.my} : ${r.op}</span><b>${r.win ? "勝" : "敗"}</b></li>`).join("")
      : `<li class="ar-empty">還沒有戰績。今天做點事，明天就會結算。</li>`;

    const cup = d.cup || {}, today = d.today;
    const inCup = today >= cup.start && today <= cup.end;
    const cupRounds = (cup.rounds || []).map(r => {
      const lab = { win: "✅ 勝", lose: "❌ 敗", out: "—", later: "⏳", today: "🔥 今天比賽" }[r.state] || "";
      const sc = r.op != null ? ` ${r.my} : ${r.op}` : r.state === "today" ? `（你目前 ${r.my} 分）` : "";
      return `<li><span>${["八強", "四強", "決賽"][r.round - 1]} ${md(r.day)}</span><span>${r.opp.emoji} ${esc(r.opp.name)}</span><span>${lab}${sc}</span></li>`;
    }).join("");

    const bought = d.bought || {};
    const shop = (d.shop || []).map(o => {
      const n = bought[o.item] || 0, full = n >= o.limit;
      return `<div class="ar-item"><span class="ar-ie">${o.emoji}</span><div><b>${esc(o.name)}</b><small>🪙 ${o.price}・本月 ${n}/${o.limit}</small></div>
        <button type="button" class="btn btn-small ${full ? "" : "btn-primary"}" data-ar="buy" data-v="${o.item}" ${full || d.coins < o.price || AR.busy ? "disabled" : ""}>${full ? "已換" : "換"}</button></div>`;
    }).join("");

    return `
    <div class="card rp-card ar-card">
      <div class="ar-head"><div class="ar-tier ar-${d.tier}"><img src="img/arena/${d.tier}.webp" alt="" onerror="this.replaceWith(document.createTextNode('${t[1]}'))"></div>
        <div><h3>🏟️ 競技場・本週 ${t[0]}段</h3><p class="rp-note">聯賽點 ${d.week_points}・${next}・🪙 ${d.coins} 競技幣</p>
        <div class="ar-bar"><i style="width:${pct}%"></i></div></div></div>
      <p class="rp-note">分數全部來自真的有做的事：簽到 5、專注每 3 分鐘 1、任務 3～12、習慣打卡 4。再加一點點戰力。</p>
    </div>

    <div class="card rp-card">
      <h3>🗡️ 每日決鬥</h3>
      <p class="rp-note">今天的 3 個對手。今天結束後用整天的分數自動比，贏 +3 聯賽點、15 競技幣；輸 +1、5 競技幣。那天什麼都沒做就不打。</p>
      <p class="ar-today">你今天目前 <b>${d.score_today}</b> 分</p>
      <div class="ar-opps">${opp}</div>
      <h4>最近戰績（${d.record.win} 勝 ${d.record.lose} 敗）</h4>
      <ul class="ar-recent">${recent}</ul>
    </div>

    <div class="card rp-card">
      <h3>🏆 每週聯賽</h3>
      <p class="rp-note">決鬥（贏 3、輸 1）＋這週分數每 20 分 1 點。下週一依段位發獎：青銅 30 幣 → 傳說 250 幣＋限定券＋限定瓶 2＋星光寶箱。</p>
      ${boardHtml(d.board, "p", " 點")}
    </div>

    <div class="card rp-card">
      <h3>🎯 本週主題：${th[0]}</h3>
      <p class="rp-note">${th[1]}。週日結束時前 3 名有獎：第 1 名 80 幣＋黃金寶箱、第 2 名 50 幣＋扭蛋幣 2、第 3 名 30 幣＋扭蛋幣 1。</p>
      ${boardHtml(d.theme_board, "s", "")}
    </div>

    <div class="card rp-card">
      <h3>👑 每月錦標賽</h3>
      <p class="rp-note">${md(cup.start)}～${md(cup.end)}・8 人淘汰賽，比賽那天的分數高就晉級。三場全勝拿冠軍：300 幣、星光寶箱、限定券 2、競技冠軍框。${inCup ? "" : "還沒開始，先把分數練起來。"}</p>
      <ul class="ar-cup">${cupRounds}</ul>
      <p class="rp-note">🌟 賽季：每個月結束時，用這個月最高的週段位再發一次競技幣（20～200）。</p>
    </div>

    <div class="card rp-card">
      <h3>🪙 競技商店</h3>
      <p class="rp-note">每個月重置可換數量。</p>
      <div class="ar-shop">${shop}</div>
    </div>`;
  }

  async function buy(item) {
    AR.busy = true; rerender();
    const { error } = await db.rpc("arena_buy", { p_item: item });
    AR.busy = false;
    if (error) toast(error.message); else toast("🪙 換好了，放進背包");
    await load();
  }

  document.addEventListener("click", e => {
    const el = e.target.closest("[data-ar]");
    if (!el) return;
    if (el.dataset.ar === "buy") buy(el.dataset.v);
  });

  const css = document.createElement("style");
  css.textContent = `
    .ar-head { display: flex; gap: 12px; align-items: center; }
    .ar-head h3 { margin: 0 0 2px; }
    .ar-tier { width: 64px; height: 64px; flex: none; display: grid; place-items: center; font-size: 40px; }
    .ar-tier img { width: 100%; height: 100%; object-fit: contain; }
    .ar-bar { height: 8px; border-radius: 4px; background: rgba(0,0,0,.08); overflow: hidden; margin-top: 4px; }
    .ar-bar i { display: block; height: 100%; background: linear-gradient(90deg, #e8a317, #d4889a); }
    .ar-today { margin: 6px 0; }
    .ar-opps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .ar-opp { display: flex; gap: 6px; align-items: center; padding: 8px; border-radius: 10px; background: rgba(0,0,0,.04); }
    .ar-opp small, .ar-item small { display: block; opacity: .7; font-size: 12px; }
    .ar-oe, .ar-ie { font-size: 26px; }
    .ar-recent, .ar-board, .ar-cup { list-style: none; padding: 0; margin: 6px 0 0; }
    .ar-recent li, .ar-board li, .ar-cup li { display: flex; gap: 8px; padding: 5px 4px; border-bottom: 1px solid rgba(0,0,0,.06); font-size: 14px; }
    .ar-recent li span:nth-child(2), .ar-board .ar-nm, .ar-cup li span:nth-child(2) { flex: 1; }
    .ar-recent li.w b { color: #3b9a4f; } .ar-recent li.l b { color: #b8322a; }
    .ar-board li.me { background: rgba(232,163,23,.15); border-radius: 6px; font-weight: 600; }
    .ar-rk { width: 20px; text-align: right; opacity: .6; }
    .ar-shop { display: grid; gap: 8px; }
    .ar-item { display: flex; gap: 8px; align-items: center; }
    .ar-item > div { flex: 1; }
    @media (max-width: 520px) { .ar-opps { grid-template-columns: 1fr; } }
  `;
  document.head.appendChild(css);

  window.ArenaGame = { version: ARENA_JS_VERSION, html, reload: load, state: AR };
})();
