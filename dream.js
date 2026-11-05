/* 序光計畫：🌙 夢境副本（資料在 sql/2026-11-05_夢境副本.sql） */
(function () {
  const DREAM_JS_VERSION = "20261105b";
  const DR = { data: null, busy: false, err: null };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : alert(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const gameOn = () => !(typeof window.isGameOff === "function" && window.isGameOff());
  const ITEM = { stardust: "✨ 星屑", gacha_coin: "🪙 扭蛋幣", wish_normal: "🫙 普通星願瓶", scratch_card: "🎫 刮刮樂", wish_rare: "💎 稀有星願瓶",
    ticket_special: "🎟️ 特殊召喚券", wish_limited: "🌠 限定星願瓶", dream_shard: "🌙 夢之碎片", chest_star: "✨ 星光寶箱", chest_gold: "🧰 金寶箱", ticket_limited: "🌟 限定召喚券" };
  const rw = o => Object.entries(o || {}).map(([k, v]) => `${ITEM[k] || k} ×${v}`).join("、");
  const IMG = "img/dream/";
  const TIER = { c: ["⚪", "普通", "c"], r: ["🔵", "稀有", "r"], l: ["🟣", "限定", "l"], m: ["🌟", "當月限定", "m"] };
  const itemPic = (it, cls) => `<img class="${cls}" src="${IMG}item/${it.key}.webp" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${cls} dr-emo',textContent:'${it.emoji}'}))">`;
  function itemCard(it, extra) {
    const t = TIER[it.tier] || TIER.c;
    return `<div class="dr-item t-${t[2]}">${itemPic(it, "dr-item-img")}<div class="dr-item-tier">${t[0]} ${t[1]}・${esc(it.kind)}</div>
      <div class="dr-item-name">${esc(it.name)}</div><p class="dr-item-line">${esc(it.line)}</p>${extra || ""}</div>`;
  }
  const pic = (k, emo, cls) => `<img class="${cls}" src="${IMG}${k}.webp" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${cls} dr-emo',textContent:'${emo}'}))">`;

  async function load() {
    if (!hasDb()) return;
    const { data, error } = await db.rpc("dream_status");
    if (error) { DR.err = /dream_status/.test(error.message) ? "setup" : error.message; render(); return; }
    DR.data = data; DR.err = null;
    if ((data.claimed || []).length) showWake(data.claimed);
    (data.ms_new || []).forEach((x, i) => setTimeout(() => toast(`🌙 夢境收藏「${x.name}」達成！${rw(x.reward)}${x.title ? "＋稱號" : ""}${x.frame ? "＋夢境頭像框" : ""}`), 2500 + i * 1800));
    render();
  }

  function card() {
    const d = DR.data;
    if (!d) return "";
    const sc = d.scene || {};
    if (d.entered) {
      return d.night ? `<div class="dr-row">${pic(d.entered.scene, "🌙", "dr-ic")}<div class="dr-grow"><b>今晚夢到了「${esc(((d.scene || {}).key === d.entered.scene ? sc.name : "夢境"))}」</b>
        <span class="dr-sub">${d.tonight_item ? `遇見了 ${esc(d.tonight_item.emoji)} ${esc(d.tonight_item.name)}・` : ""}明天早上 6:00～10:30 打開網站就能帶出來</span></div></div>
        <div class="dr-btns"><button type="button" class="btn" data-dr="book">📖 夢境圖鑑</button></div>` : "";
    }
    if (d.night) {
      return `<div class="dr-row">${pic(sc.key, sc.emoji || "🌙", "dr-ic")}<div class="dr-grow"><b>🌙 ${d.open ? "夢境的門開了" : "今晚的夢境"}・${esc(sc.name || "")}</b>
        <span class="dr-sub">${d.open ? `連續第 ${d.next_streak} 晚${d.next_streak % 7 === 0 ? "（特別的夢！）" : ""}・點進去選一扇門` : `勾 2 個 🌙 晚上的項目（現在 ${d.moon}/2），或直接按「我要去睡了」`}</span></div></div>
        <div class="dr-btns">${d.open ? `<button type="button" class="btn btn-primary dr-go" data-dr="enter">✨ 進入夢境</button>` : ""}
        ${d.slept ? "" : `<button type="button" class="btn ${d.open ? "" : "btn-primary"}" data-dr="sleep">😴 我要去睡了</button>`}
        <button type="button" class="btn" data-dr="book">📖 圖鑑</button></div>`;
    }
    const have = Object.keys(d.items || {}).length, total = (d.catalog || []).length;
    return `<div class="dr-row">${pic("chest", "🌙", "dr-ic")}<div class="dr-grow"><b>🌙 夢境圖鑑 ${have}/${total}</b>
      <span class="dr-sub">夢之碎片 ${d.shards} 片${d.shards >= 7 ? "・可以換夢境寶箱了！" : "（7 片換夢境寶箱）"}・晚上 8 點後才能入夢</span></div></div>
      <div class="dr-btns"><button type="button" class="btn" data-dr="book">📖 夢境圖鑑</button>${d.shards >= 7 ? `<button type="button" class="btn btn-primary" data-dr="ex">🎁 換夢境寶箱</button>` : ""}</div>`;
  }

  function render() {
    const prev = document.getElementById("ev-today2") || document.getElementById("ev-today") || document.getElementById("fn-today") || document.querySelector('.page[data-page="today"] .game-mode-bar');
    if (!prev) return;
    let box = document.getElementById("dr-today");
    if (!box) { box = document.createElement("div"); box.id = "dr-today"; box.className = "card dr-card"; prev.after(box); }
    const html = gameOn() && hasDb() && !DR.err ? card() : "";
    box.hidden = !html;
    box.classList.toggle("dr-nightcard", !!(DR.data && DR.data.night));
    box.innerHTML = html;
  }

  /* 入夢：三扇門 */
  function openDream() {
    const d = DR.data, sc = d.scene || {};
    const m = document.createElement("div");
    m.className = "dr-modal";
    m.innerHTML = `<div class="dr-sky">${pic(sc.key, "", "dr-bg")}<div class="dr-stars"></div>
      <div class="dr-in"><div class="dr-title">${esc(sc.emoji || "🌙")} ${esc(sc.name || "夢境")}</div>
      <p class="dr-line">${esc(sc.line || "")}</p><p class="dr-ask">眼前有三扇門，你要推開哪一扇？</p>
      <div class="dr-doors">${[1, 2, 3].map(i => `<button type="button" class="dr-door" data-door="${i}">${pic("door" + i, "🚪", "dr-door-img")}<span>第 ${i} 扇</span></button>`).join("")}</div>
      <button type="button" class="dr-close" data-x="1">先不要</button></div></div>`;
    m.addEventListener("click", async e => {
      if (e.target.dataset.x || e.target === m) { m.remove(); return; }
      const b = e.target.closest("[data-door]");
      if (!b || DR.busy) return;
      DR.busy = true;
      m.querySelectorAll(".dr-door").forEach(x => x.classList.toggle("dim", x !== b));
      b.classList.add("open");
      const { data, error } = await db.rpc("dream_enter", { p_door: Number(b.dataset.door) });
      DR.busy = false;
      if (error) { toast(error.message); m.remove(); return; }
      setTimeout(() => {
        const it = data.item || {};
        m.querySelector(".dr-in").innerHTML = `<div class="dr-title">門後面是…</div>
          ${itemCard(it, data.have ? `<div class="dr-item-tag">已經有了・帶出來會變成夢之碎片</div>` : `<div class="dr-item-tag new">✨ 新收藏！</div>`)}
          <p class="dr-reward">${esc(rw(data.reward))}</p>
          <p class="dr-line">牠先留在夢裡。<b>明天早上 6:00～10:30</b> 打開網站一定帶得出來；太晚起床，有一半機率夢醒就忘了。</p>
          <p class="dr-line">連續入夢 ${data.streak} 晚・晚安 🌙</p>
          <button type="button" class="btn btn-primary" data-x="1">晚安</button>`;
        load();
      }, 900);
    });
    document.body.appendChild(m);
  }

  function showWake(list) {
    const m = document.createElement("div");
    m.className = "dr-modal dr-morning";
    const half = list.some(x => x.half);
    m.innerHTML = `<div class="dr-sky day"><div class="dr-in"><div class="dr-got">🌅</div><div class="dr-title">早安！從夢裡帶回了…</div>
      ${list.map(x => `${x.item ? (x.kept ? itemCard(x.item, x.new ? `<div class="dr-item-tag new">✨ 新收藏！</div>` : `<div class="dr-item-tag">重複了，變成夢之碎片</div>`)
        : `<div class="dr-forgot">${esc(x.item.emoji)} 夢裡好像遇到了誰…想不起來了<small>（變成 1 片夢之碎片）</small></div>`) : ""}
        <p class="dr-reward">${esc(rw(x.reward))}${x.half ? `<small>（起太晚，只帶出一半）</small>` : ""}</p>`).join("")}
      <p class="dr-line">${half ? "明天 10:30 前起床打開網站，就能全部帶出來。" : "準時起床，夢裡的東西全部帶出來了 ✨"}</p>
      <button type="button" class="btn btn-primary" data-x="1">收下</button></div></div>`;
    m.addEventListener("click", e => { if (e.target.dataset.x || e.target === m) m.remove(); });
    document.body.appendChild(m);
  }

  /* 📖 夢境圖鑑 */
  function openBook(tab) {
    const d = DR.data || {}, items = d.items || {}, cat = d.catalog || [], got = new Set(d.ms_got || []);
    tab = tab || "c";
    const m = document.createElement("div");
    m.className = "dr-modal";
    const list = cat.filter(x => x.tier === tab);
    const cnt = t => cat.filter(x => x.tier === t && items[x.key]).length + "/" + cat.filter(x => x.tier === t).length;
    m.innerHTML = `<div class="dr-sky dr-book"><div class="dr-stars"></div><div class="dr-in">
      <div class="dr-title">📖 夢境圖鑑 ${Object.keys(items).length}/${cat.length}</div>
      <div class="dr-tabs">${Object.entries(TIER).map(([k, t]) => `<button type="button" class="${k === tab ? "on" : ""}" data-tab="${k}">${t[0]} ${t[1]} ${cnt(k)}</button>`).join("")}</div>
      <p class="dr-line" style="font-size:12px">${tab === "c" ? "最常遇到（66%）" : tab === "r" ? "偶爾遇到（24%），連續入夢第 7 晚保底" : tab === "l" ? "很少遇到（6%），連續第 30 晚保底" : `每個月只有一隻，只有那個月夢得到（4%）・這個月是 ${d.month} 月`}</p>
      <div class="dr-grid">${list.map(x => { const n = items[x.key], now = x.tier === "m" && x.month === d.month;
        return `<div class="dr-cell t-${x.tier} ${n ? "" : "lock"} ${now ? "now" : ""}" title="${esc(n ? x.line : "還沒遇到")}">${n ? itemPic(x, "dr-cell-img") : `<span class="dr-cell-img dr-emo">❔</span>`}
          <b>${n ? esc(x.name) : x.tier === "m" ? `${x.month} 月限定` : "？？？"}</b>${n > 1 ? `<small>×${n}</small>` : now && !n ? `<small>這個月！</small>` : ""}</div>`; }).join("")}</div>
      <div class="dr-ms">${(d.milestones || []).map(x => `<div class="${got.has(x.key) ? "on" : ""}">${got.has(x.key) ? "✅" : "⬜"} ${esc(x.name)}<small>${esc(rw(x.reward))}${x.title ? "＋稱號" : ""}${x.frame ? "＋頭像框" : ""}</small></div>`).join("")}</div>
      <button type="button" class="btn btn-primary" data-x="1" style="margin-top:10px">關閉</button></div></div>`;
    m.addEventListener("click", e => {
      const tb = e.target.closest("[data-tab]");
      if (tb) { m.remove(); openBook(tb.dataset.tab); return; }
      if (e.target.dataset.x || e.target === m) m.remove();
    });
    document.body.appendChild(m);
  }

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-dr]");
    if (!b || DR.busy) return;
    const a = b.dataset.dr;
    if (a === "enter") return openDream();
    if (a === "book") return openBook();
    DR.busy = true;
    const { data, error } = await db.rpc(a === "sleep" ? "dream_sleep" : "dream_exchange");
    DR.busy = false;
    if (error) return toast(error.message);
    if (a === "sleep") { DR.data = data; render(); toast("😴 晚安，夢境的門打開了"); openDream(); }
    else { toast("🎁 夢境寶箱：限定星願瓶、星光寶箱、星屑 200"); load(); }
  });

  const st = document.createElement("style");
  st.textContent = `
    .dr-item { margin: 10px auto; padding: 14px 12px; border-radius: 18px; max-width: 280px; background: rgba(255,255,255,.08); border: 2px solid rgba(255,255,255,.25); }
    .dr-item.t-r { border-color: #64b5f6; box-shadow: 0 0 20px #64b5f655; }
    .dr-item.t-l { border-color: #b388ff; box-shadow: 0 0 26px #b388ff88; background: linear-gradient(160deg, rgba(179,136,255,.25), rgba(255,255,255,.06)); }
    .dr-item.t-m { border-color: #ffd54a; box-shadow: 0 0 30px #ffd54a88; background: linear-gradient(160deg, rgba(255,213,74,.25), rgba(255,138,200,.15)); }
    .dr-item-img { width: 140px; height: 140px; object-fit: contain; display: block; margin: 0 auto; animation: drPop .7s cubic-bezier(.2,1.6,.4,1); }
    .dr-item-img.dr-emo { font-size: 90px; line-height: 140px; }
    .dr-item-tier { font-size: 12px; opacity: .85; margin-top: 4px; } .dr-item-name { font-size: 20px; font-weight: 800; }
    .dr-item-line { font-size: 12.5px; opacity: .85; margin: 4px 0 0; }
    .dr-item-tag { display: inline-block; margin-top: 8px; font-size: 12px; padding: 2px 10px; border-radius: 99px; background: rgba(255,255,255,.12); }
    .dr-item-tag.new { background: #ffd54a; color: #3a2a00; font-weight: 800; }
    .dr-forgot { margin: 12px auto; padding: 12px; border-radius: 14px; background: rgba(0,0,0,.1); font-size: 14px; opacity: .8; } .dr-forgot small { display: block; font-size: 12px; }
    .dr-book { max-height: 88vh; overflow-y: auto; }
    .dr-tabs { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; margin: 6px 0; }
    .dr-tabs button { border: 1px solid rgba(255,255,255,.25); background: transparent; color: inherit; border-radius: 99px; padding: 4px 9px; font: inherit; font-size: 12px; cursor: pointer; }
    .dr-tabs button.on { background: #fff; color: #2a1d5a; font-weight: 800; }
    .dr-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0; }
    .dr-cell { border-radius: 12px; padding: 6px 4px; background: rgba(255,255,255,.07); border: 1.5px solid rgba(255,255,255,.15); font-size: 12px; position: relative; }
    .dr-cell.t-r { border-color: #64b5f6aa; } .dr-cell.t-l { border-color: #b388ffcc; } .dr-cell.t-m { border-color: #ffd54acc; }
    .dr-cell.lock { opacity: .45; } .dr-cell.now { opacity: 1; box-shadow: 0 0 14px #ffd54a; }
    .dr-cell-img { width: 100%; aspect-ratio: 1; object-fit: contain; display: grid; place-items: center; font-size: 40px; }
    .dr-cell b { display: block; font-size: 11.5px; } .dr-cell small { font-size: 10.5px; opacity: .8; }
    .dr-ms { text-align: left; font-size: 12.5px; margin-top: 8px; } .dr-ms div { padding: 4px 0; border-top: 1px solid rgba(255,255,255,.1); opacity: .7; } .dr-ms div.on { opacity: 1; }
    .dr-ms small { display: block; font-size: 11px; opacity: .8; margin-left: 22px; }
    .dr-card.dr-nightcard { background: linear-gradient(135deg, #1b1f4a, #3a2a6b); color: #eef; border: 1px solid #6b5fd0; }
    .dr-row { display: flex; gap: 12px; align-items: center; }
    .dr-ic { width: 52px; height: 52px; border-radius: 12px; object-fit: cover; flex: none; display: grid; place-items: center; font-size: 34px; }
    .dr-grow { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .dr-sub { font-size: 12.5px; opacity: .8; }
    .dr-btns { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    .dr-modal { position: fixed; inset: 0; z-index: 9999; background: rgba(5,6,20,.75); display: grid; place-items: center; padding: 16px; animation: drFade .4s; }
    @keyframes drFade { from { opacity: 0; } }
    .dr-sky { position: relative; width: min(440px, 100%); border-radius: 22px; overflow: hidden; color: #f0edff; text-align: center;
      background: radial-gradient(circle at 30% 20%, #4b3d9a, #1a1640 60%, #0b0a1f); box-shadow: 0 20px 60px rgba(80,60,200,.5); }
    .dr-sky.day { background: radial-gradient(circle at 50% 0%, #ffe3a8, #ffb98a 45%, #8c7ad6); color: #2a1d3d; }
    .dr-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .45; }
    .dr-bg.dr-emo { display: none; }
    .dr-stars { position: absolute; inset: 0; background-image: radial-gradient(1.5px 1.5px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 20%, #fff, transparent),
      radial-gradient(1.5px 1.5px at 40% 70%, #fff, transparent), radial-gradient(1px 1px at 85% 60%, #fff, transparent), radial-gradient(1px 1px at 10% 85%, #fff, transparent);
      animation: drTw 3s ease-in-out infinite; }
    @keyframes drTw { 50% { opacity: .4; } }
    .dr-in { position: relative; padding: 26px 20px 20px; }
    .dr-title { font-size: 20px; font-weight: 800; margin-bottom: 6px; }
    .dr-line { font-size: 13.5px; opacity: .88; margin: 6px 0; }
    .dr-ask { margin: 14px 0 10px; font-weight: 700; }
    .dr-doors { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .dr-door { border: 0; background: rgba(255,255,255,.08); border-radius: 14px; padding: 10px 4px; color: inherit; font: inherit; cursor: pointer; transition: transform .3s, opacity .3s; }
    .dr-door:hover { transform: translateY(-3px); background: rgba(255,255,255,.15); }
    .dr-door.dim { opacity: .25; } .dr-door.open { transform: scale(1.1); box-shadow: 0 0 30px #ffe08a; }
    .dr-door-img { width: 100%; aspect-ratio: 3 / 4; object-fit: contain; display: grid; place-items: center; font-size: 46px; }
    .dr-door span { font-size: 12px; opacity: .8; }
    .dr-door span.dr-emo { font-size: 50px; opacity: 1; }
    .dr-close { margin-top: 14px; background: none; border: 0; color: inherit; opacity: .6; font: inherit; cursor: pointer; }
    .dr-got { font-size: 64px; animation: drPop .6s cubic-bezier(.2,1.6,.4,1); }
    .dr-got.rare { filter: drop-shadow(0 0 18px #ffd54a); }
    @keyframes drPop { from { transform: scale(.2); opacity: 0; } }
    .dr-reward { font-size: 17px; font-weight: 800; margin: 8px 0; } .dr-reward small { display: block; font-size: 12px; font-weight: 400; opacity: .8; }
  `;
  document.head.appendChild(st);

  (function boot(n) {
    if (hasDb()) { load(); setInterval(load, 5 * 60 * 1000); document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); }); }
    else if (n < 60) setTimeout(() => boot(n + 1), 1000);
  })(0);
  window.DreamGame = { version: DREAM_JS_VERSION, reload: load, state: DR };
})();
