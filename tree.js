/* 序光計畫：🌳 人生之樹（資料在 sql/2026-11-05_人生之樹.sql）。放在 📊 回顧裡的「🌳 人生之樹」分頁 */
(function () {
  const TREE_JS_VERSION = "20261105a";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const IMG = "img/tree/";

  /* 固定的亂數（同一個月每次畫出來都一樣） */
  function rng(seed) {
    let h = 2166136261;
    for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }

  const season = m => (m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter");
  const SEASON = {
    spring: { sky: ["#ffe6ef", "#fff7e8"], ground: "#9fd48a", name: "春" },
    summer: { sky: ["#bfe6ff", "#effaff"], ground: "#79c36a", name: "夏" },
    autumn: { sky: ["#ffd9b0", "#fff1dc"], ground: "#c8a86a", name: "秋" },
    winter: { sky: ["#dfe8f5", "#f7fbff"], ground: "#eef3f8", name: "冬" }
  };

  /* 一個月 → 這層長出什麼 */
  function layer(mo) {
    const rate = mo.tasks_total ? mo.tasks_done / mo.tasks_total : 0;
    return {
      rate,
      blue: Math.min(36, Math.round((+mo.focus_h || 0) / 3)),
      green: Math.min(36, Math.round((mo.life_all || 0) * 1.5 + (mo.checkins || 0) / 2 + (mo.habit_logs || 0) / 6)),
      flower: Math.min(14, Math.round((mo.social || 0) / 3)),
      fruit: Math.min(8, mo.fruits || 0),
      fallen: (+mo.focus_h || 0) < 10 && rate < 0.3 && (mo.days || 0) >= 10 ? 6 : 0
    };
  }

  function svg(data, sel) {
    const months = data.months || [];
    const W = 360, H = 440, gx = W / 2, gy = H - 50;
    const now = new Date(), S = SEASON[season(now.getMonth() + 1)];
    const n = Math.max(1, months.length);
    const trunkH = Math.min(300, 90 + n * 32);
    const step = trunkH / (n + 0.6);
    let g = "";

    /* 天空、地面 */
    g += `<defs><linearGradient id="tr-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${S.sky[0]}"/><stop offset="1" stop-color="${S.sky[1]}"/></linearGradient>
      <radialGradient id="tr-glow"><stop offset="0" stop-color="#fff6c2" stop-opacity=".9"/><stop offset="1" stop-color="#fff6c2" stop-opacity="0"/></radialGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#tr-sky)"/>
      <ellipse cx="${gx}" cy="${gy + 30}" rx="${W * 0.7}" ry="55" fill="${S.ground}"/>`;

    /* 樹幹（越多個月越高越粗） */
    const tw = 8 + n * 1.6;
    g += `<path d="M${gx - tw} ${gy + 6} C ${gx - tw * 0.7} ${gy - trunkH * 0.4}, ${gx - 4} ${gy - trunkH * 0.7}, ${gx - 3} ${gy - trunkH}
      L ${gx + 3} ${gy - trunkH} C ${gx + 4} ${gy - trunkH * 0.7}, ${gx + tw * 0.7} ${gy - trunkH * 0.4}, ${gx + tw} ${gy + 6} Z" fill="#7a5233"/>
      <path d="M${gx - tw * 0.4} ${gy} q -20 10 -34 8 M${gx + tw * 0.4} ${gy} q 22 9 36 6" stroke="#6b4429" stroke-width="5" fill="none" stroke-linecap="round"/>`;

    const items = [];   // 葉、花、果，最後再畫才不會被樹枝蓋住
    const ground = [];
    months.forEach((mo, i) => {
      const L = layer(mo), r = rng(mo.month);
      const side = i % 2 ? 1 : -1;
      const y = gy - step * (i + 1);
      const len = 46 + L.rate * 70 + Math.min(30, (+mo.focus_h || 0) * 0.4);
      const thick = 2.5 + L.rate * 6;
      const ex = gx + side * len, ey = y - 30 - r() * 20;
      const on = sel === i;
      g += `<path d="M${gx} ${y} Q ${gx + side * len * 0.5} ${y - 4} ${ex} ${ey}" stroke="${on ? "#c98a2e" : "#7a5233"}" stroke-width="${thick}" fill="none" stroke-linecap="round"/>
        <path d="M${gx + side * len * 0.55} ${y - 8} q ${side * 14} -14 ${side * 26} -16" stroke="#7a5233" stroke-width="${thick * 0.55}" fill="none" stroke-linecap="round"/>`;
      /* 這層的樹冠中心 */
      const cx = gx + side * len * 0.7, cy = ey + 4, spread = 24 + (L.blue + L.green) * 0.9;
      const at = () => { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread; return [cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7]; };
      for (let k = 0; k < L.green; k++) { const [x, yy] = at(); items.push(`<ellipse cx="${x}" cy="${yy}" rx="7" ry="4.5" transform="rotate(${r() * 180} ${x} ${yy})" fill="${["#4caf50", "#66bb6a", "#81c784"][k % 3]}" opacity=".95"/>`); }
      for (let k = 0; k < L.blue; k++) { const [x, yy] = at(); items.push(`<ellipse cx="${x}" cy="${yy}" rx="6.5" ry="4.2" transform="rotate(${r() * 180} ${x} ${yy})" fill="${["#42a5f5", "#64b5f6", "#5c6bc0"][k % 3]}" opacity=".95"/>`); }
      for (let k = 0; k < L.flower; k++) {
        const [x, yy] = at();
        items.push(`<g transform="translate(${x} ${yy})">${[0, 72, 144, 216, 288].map(a => `<ellipse rx="3.2" ry="2" transform="rotate(${a}) translate(3 0)" fill="#f8a5c2"/>`).join("")}<circle r="1.6" fill="#ffd54a"/></g>`);
      }
      for (let k = 0; k < L.fruit; k++) { const [x, yy] = at(); items.push(`<g class="tr-fruit"><circle cx="${x}" cy="${yy + 6}" r="5.5" fill="#e53935"/><circle cx="${x - 1.8}" cy="${yy + 4.2}" r="1.5" fill="#fff" opacity=".7"/><path d="M${x} ${yy} v2.5" stroke="#5d4037" stroke-width="1.4"/></g>`); }
      for (let k = 0; k < L.fallen; k++) ground.push(`<ellipse cx="${gx + (r() - 0.5) * 220}" cy="${gy + 10 + r() * 30}" rx="5" ry="3" transform="rotate(${r() * 180})" fill="${["#d4883a", "#b5651d", "#e0a95a"][k % 3]}" opacity=".85"/>`);
      /* 點這層 */
      items.push(`<circle cx="${cx}" cy="${cy}" r="${spread + 8}" fill="transparent" data-tree="${i}" style="cursor:pointer"/>`);
      items.push(`<text x="${gx + side * 16}" y="${y + 4}" font-size="10" fill="#5d4037" text-anchor="${side > 0 ? "start" : "end"}" opacity=".8">${+String(mo.month).slice(5, 7)}月</text>`);
    });

    /* 季節效果 */
    let fx = "";
    const r = rng("fx" + now.getMonth());
    if (S === SEASON.winter) for (let k = 0; k < 40; k++) fx += `<circle class="tr-snow" cx="${r() * W}" cy="${r() * H}" r="${1 + r() * 2}" fill="#fff" style="animation-delay:${-r() * 8}s"/>`;
    if (S === SEASON.autumn) for (let k = 0; k < 10; k++) fx += `<ellipse class="tr-leaf" cx="${r() * W}" cy="${r() * H * 0.6}" rx="4" ry="2.5" fill="#e0812f" style="animation-delay:${-r() * 9}s"/>`;
    if (S === SEASON.spring) for (let k = 0; k < 14; k++) fx += `<ellipse class="tr-leaf" cx="${r() * W}" cy="${r() * H * 0.6}" rx="3" ry="2" fill="#f8bbd0" style="animation-delay:${-r() * 9}s"/>`;
    if (S === SEASON.summer) fx += `<circle cx="${W - 50}" cy="50" r="60" fill="url(#tr-glow)"/>`;

    return `<svg class="tr-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="人生之樹">${g}${ground.join("")}${items.join("")}${fx}</svg>`;
  }

  function detail(mo) {
    if (!mo) return `<p class="ov-note" style="text-align:center">點樹上的任何一層，看那個月長了什麼。</p>`;
    const L = layer(mo), m = +String(mo.month).slice(5, 7);
    const rows = [
      ["🔵", "藍葉", L.blue, `專注 ${mo.focus_h} 小時`],
      ["🟢", "綠葉", L.green, `生活打卡全勤 ${mo.life_all} 天・簽到 ${mo.checkins} 天`],
      ["🌿", "樹枝", Math.round(L.rate * 100) + "%", `任務完成 ${mo.tasks_done}/${mo.tasks_total}`],
      ["🌸", "花", L.flower, `跟好友互動 ${mo.social} 次`],
      ["🍎", "果實", L.fruit, `打倒每週王 ${mo.boss_kills} 次・重要徽章 ${(mo.fruit_list || []).length} 個`]
    ];
    if (L.fallen) rows.push(["🍂", "落葉", L.fallen, "這個月比較低迷，沒關係，下個月再長回來"]);
    return `<div class="tr-detail"><b>${String(mo.month).slice(0, 4)} 年 ${m} 月${mo.current ? "（還在長）" : ""}</b>
      ${rows.map(([e, n, v, how]) => `<div class="tr-row"><span>${e} ${n}</span><b>${v}</b><small>${esc(how)}</small></div>`).join("")}</div>`;
  }

  function html(data, sel) {
    if (!data) return `<div class="ov-empty">載入中…</div>`;
    const ms = data.months || [];
    const S = SEASON[season(new Date().getMonth() + 1)];
    const total = ms.reduce((t, m) => { const L = layer(m); return t + L.blue + L.green; }, 0);
    return `<div class="tr-wrap"><p class="ov-note" style="margin:0 0 8px">從 ${String(data.start).slice(0, 4)} 年 ${+String(data.start).slice(5, 7)} 月種下，已經長了 ${ms.length} 層、${total} 片葉子。現在是${S.name}天。</p>
      ${svg(data, sel)}
      <div class="tr-rings">${ms.map((m, i) => `<button type="button" class="${sel === i ? "on" : ""}" data-tree="${i}">${+String(m.month).slice(5, 7)}月</button>`).join("")}</div>
      ${detail(ms[sel])}
      <p class="ov-note" style="font-size:11.5px">🔵 專注 🟢 生活規律 🌿 任務完成率 🌸 好友 🍎 大成就 🍂 低迷的月份</p></div>`;
  }

  const st = document.createElement("style");
  st.textContent = `
    .tr-svg { width: 100%; max-width: 420px; display: block; margin: 0 auto; border-radius: 16px; }
    .tr-svg .tr-fruit { animation: trBob 3s ease-in-out infinite; transform-box: fill-box; }
    @keyframes trBob { 50% { transform: translateY(-1.5px); } }
    .tr-svg .tr-snow { animation: trSnow 8s linear infinite; }
    @keyframes trSnow { from { transform: translateY(-440px); } to { transform: translateY(440px); } }
    .tr-svg .tr-leaf { animation: trLeaf 9s linear infinite; }
    @keyframes trLeaf { from { transform: translate(-30px, -200px) rotate(0); opacity: 0; } 15% { opacity: 1; } to { transform: translate(40px, 300px) rotate(360deg); opacity: 0; } }
    .tr-rings { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin: 10px 0; }
    .tr-rings button { border: 1px solid #3a4260; background: #1b2033; color: #cdd3ea; border-radius: 99px; padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer; }
    .tr-rings button.on { background: #6c63ff; color: #fff; border-color: transparent; }
    .tr-detail { background: #1b2033; border-radius: 12px; padding: 10px 12px; }
    .tr-row { display: grid; grid-template-columns: 70px 50px 1fr; gap: 6px; align-items: center; font-size: 13px; padding: 4px 0; border-top: 1px solid #2c3350; }
    .tr-row small { color: #8f98b6; }
  `;
  document.head.appendChild(st);

  window.LifeTree = { version: TREE_JS_VERSION, html };
})();
