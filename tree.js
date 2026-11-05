/* 序光計畫：🌳 人生之樹（資料在 sql/2026-11-05_人生之樹.sql）。放在 📊 回顧裡的「🌳 人生之樹」分頁 */
(function () {
  const TREE_JS_VERSION = "20261105c";
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
    const W = 360, H = 460, gx = W / 2, gy = H - 64;
    const now = new Date(), hr = now.getHours(), night = hr >= 18 || hr < 6, dawn = hr >= 6 && hr < 9;
    const SN = season(now.getMonth() + 1), S = SEASON[SN];
    const n = Math.max(1, months.length);
    const trunkH = Math.min(300, 100 + n * 34);
    const step = trunkH / (n + 0.5);
    const tw = 9 + n * 1.8;
    const R0 = rng("bg" + now.toDateString());
    let defs = "", bg = "", g = "", fx = "";

    /* ---------- 天空 ---------- */
    const sky = night ? ["#141a3a", "#2c2f63"] : dawn ? ["#ffd6b0", "#fff3e0"] : S.sky;
    defs += `<linearGradient id="tr-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
      <linearGradient id="tr-bark" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4e321f"/><stop offset=".35" stop-color="#8a5b38"/><stop offset=".6" stop-color="#7a4e2f"/><stop offset="1" stop-color="#3f2817"/></linearGradient>
      <radialGradient id="tr-sun"><stop offset="0" stop-color="#fff6c2" stop-opacity=".95"/><stop offset="1" stop-color="#fff6c2" stop-opacity="0"/></radialGradient>
      <radialGradient id="tr-crown-g" cx=".45" cy=".35"><stop offset="0" stop-color="#9be08f"/><stop offset=".7" stop-color="#4caf50"/><stop offset="1" stop-color="#2e7d32"/></radialGradient>
      <radialGradient id="tr-crown-b" cx=".45" cy=".35"><stop offset="0" stop-color="#b9e3d8"/><stop offset=".7" stop-color="#5fa8c8"/><stop offset="1" stop-color="#3f7aa0"/></radialGradient>
      <radialGradient id="tr-crown-a" cx=".45" cy=".35"><stop offset="0" stop-color="#ffd27f"/><stop offset=".7" stop-color="#e8873a"/><stop offset="1" stop-color="#b85a22"/></radialGradient>
      <linearGradient id="tr-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${night ? "#2f5a3a" : S.ground}"/><stop offset="1" stop-color="${night ? "#1d3a26" : "#5a8f4a"}"/></linearGradient>
      <filter id="tr-soft"><feGaussianBlur stdDeviation="1.2"/></filter>`;
    bg += `<rect width="${W}" height="${H}" fill="url(#tr-sky)"/>`;
    if (night) {
      for (let k = 0; k < 50; k++) bg += `<circle class="tr-star" cx="${R0() * W}" cy="${R0() * H * 0.6}" r="${0.6 + R0() * 1.4}" fill="#fff" style="animation-delay:${-R0() * 4}s"/>`;
      bg += `<circle cx="${W - 60}" cy="60" r="20" fill="#fff8d8"/><circle cx="${W - 52}" cy="54" r="18" fill="${sky[0]}"/>`;
    } else {
      bg += `<circle cx="${dawn ? 50 : W - 55}" cy="${dawn ? 120 : 55}" r="70" fill="url(#tr-sun)"/><circle cx="${dawn ? 50 : W - 55}" cy="${dawn ? 120 : 55}" r="18" fill="#fff3b0"/>`;
      for (let k = 0; k < 3; k++) { const cx = 40 + R0() * (W - 80), cy = 40 + R0() * 80; bg += `<g class="tr-cloud" style="animation-delay:${-R0() * 40}s" opacity=".85"><ellipse cx="${cx}" cy="${cy}" rx="26" ry="10" fill="#fff"/><ellipse cx="${cx + 14}" cy="${cy - 6}" rx="16" ry="10" fill="#fff"/><ellipse cx="${cx - 12}" cy="${cy - 4}" rx="12" ry="8" fill="#fff"/></g>`; }
    }
    /* 遠山 */
    bg += `<path d="M0 ${gy - 30} Q 60 ${gy - 80} 120 ${gy - 40} T 240 ${gy - 50} T ${W} ${gy - 35} V ${H} H 0 Z" fill="${night ? "#22305a" : "#a9cfa0"}" opacity=".55"/>`;

    /* ---------- 地面：草、花、石頭 ---------- */
    let ground = `<path d="M0 ${gy} Q ${W / 2} ${gy - 18} ${W} ${gy} V ${H} H 0 Z" fill="url(#tr-ground)"/>`;
    for (let k = 0; k < 70; k++) { const x = R0() * W, y = gy - 2 + R0() * (H - gy - 4), h = 5 + R0() * 7; ground += `<path d="M${x} ${y} q ${R0() * 4 - 2} ${-h / 2} ${R0() * 6 - 3} ${-h}" stroke="${night ? "#3d7a4c" : "#4f9a45"}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`; }
    if (SN !== "winter") for (let k = 0; k < 12; k++) { const x = R0() * W, y = gy + 6 + R0() * 40; const c = ["#ffd54a", "#f48fb1", "#fff", "#b39ddb"][k % 4]; ground += `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map(a => `<ellipse rx="2.4" ry="1.5" transform="rotate(${a}) translate(2.2 0)" fill="${c}"/>`).join("")}<circle r="1.2" fill="#ff9800"/></g>`; }
    else ground += `<path d="M0 ${gy + 2} Q ${W / 2} ${gy - 14} ${W} ${gy + 2} V ${gy + 14} Q ${W / 2} ${gy} 0 ${gy + 14} Z" fill="#fff" opacity=".9"/>`;
    for (let k = 0; k < 4; k++) { const x = 20 + R0() * (W - 40), y = gy + 14 + R0() * 30; ground += `<ellipse cx="${x}" cy="${y}" rx="${6 + R0() * 6}" ry="${4 + R0() * 3}" fill="#9e9e9e"/><ellipse cx="${x - 2}" cy="${y - 2}" rx="${3 + R0() * 3}" ry="2" fill="#cfcfcf"/>`; }

    /* ---------- 樹幹（樹皮紋理＋樹根） ---------- */
    let trunk = `<path d="M${gx - tw} ${gy + 6} C ${gx - tw * 0.75} ${gy - trunkH * 0.35}, ${gx - 5} ${gy - trunkH * 0.7}, ${gx - 3.5} ${gy - trunkH}
      L ${gx + 3.5} ${gy - trunkH} C ${gx + 5} ${gy - trunkH * 0.7}, ${gx + tw * 0.75} ${gy - trunkH * 0.35}, ${gx + tw} ${gy + 6} Z" fill="url(#tr-bark)"/>`;
    const RB = rng("bark");
    for (let k = 0; k < 10 + n * 3; k++) { const y = gy - RB() * trunkH * 0.9, w = tw * (1 - (gy - y) / trunkH * 0.75), x = gx + (RB() - 0.5) * w * 1.2; trunk += `<path d="M${x} ${y} q ${RB() * 3 - 1.5} -6 ${RB() * 2 - 1} -12" stroke="#3a2414" stroke-width="1.2" fill="none" opacity=".55" stroke-linecap="round"/>`; }
    trunk += `<path d="M${gx - tw * 0.5} ${gy + 2} q -18 6 -40 4 M${gx + tw * 0.5} ${gy + 2} q 20 7 42 3 M${gx - tw * 0.2} ${gy + 4} q -6 10 -18 14 M${gx + tw * 0.3} ${gy + 4} q 8 10 16 13" stroke="#5a3a22" stroke-width="5" fill="none" stroke-linecap="round"/>`;

    /* ---------- 每個月一層：樹枝＋樹冠＋葉子＋花＋果 ---------- */
    const layers = [], petsSvg = [];
    const leaf = (x, y, rot, col, sc) => `<path d="M0 0 C 3 -4 9 -4 12 0 C 9 4 3 4 0 0 Z" transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})" fill="${col}"/>`;
    months.forEach((mo, i) => {
      const L = layer(mo), r = rng(mo.month);
      const side = i % 2 ? 1 : -1;
      const y = gy - step * (i + 1);
      const len = 50 + L.rate * 70 + Math.min(30, (+mo.focus_h || 0) * 0.4);
      const thick = 3 + L.rate * 6;
      const ex = gx + side * len, ey = y - 28 - r() * 18;
      const on = sel === i;
      let lg = `<path d="M${gx} ${y} Q ${gx + side * len * 0.5} ${y - 2} ${ex} ${ey}" stroke="${on ? "#c98a2e" : "url(#tr-bark)"}" stroke-width="${thick}" fill="none" stroke-linecap="round"/>
        <path d="M${gx + side * len * 0.5} ${y - 6} q ${side * 14} -16 ${side * 28} -18" stroke="#6b4429" stroke-width="${thick * 0.55}" fill="none" stroke-linecap="round"/>`;
      const cx = gx + side * len * 0.72, cy = ey + 2, spread = 26 + (L.blue + L.green) * 0.85;
      /* 樹冠：幾團柔和的葉叢（藍綠比例照當月） */
      const total = Math.max(1, L.blue + L.green), puffs = Math.max(2, Math.min(7, Math.round(total / 8) + 2));
      const autumn = SN === "autumn" && i === months.length - 1;
      for (let k = 0; k < puffs; k++) {
        const a = r() * Math.PI * 2, d = r() * spread * 0.6, rr = spread * (0.34 + r() * 0.2);
        const fill = autumn && r() < 0.5 ? "url(#tr-crown-a)" : r() < (L.blue / total) * 0.45 ? "url(#tr-crown-b)" : "url(#tr-crown-g)";
        lg += `<circle cx="${cx + Math.cos(a) * d}" cy="${cy + Math.sin(a) * d * 0.6}" r="${rr}" fill="${fill}" opacity=".85"/>`;
      }
      const at = () => { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread; return [cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7]; };
      for (let k = 0; k < L.green; k++) { const [x, yy] = at(); lg += leaf(x, yy, r() * 360, ["#66bb6a", "#81c784", "#43a047"][k % 3], 0.9 + r() * 0.5); }
      for (let k = 0; k < L.blue; k++) { const [x, yy] = at(); lg += leaf(x, yy, r() * 360, ["#64b5f6", "#90caf9", "#5c6bc0"][k % 3], 0.9 + r() * 0.5); }
      for (let k = 0; k < L.flower; k++) { const [x, yy] = at(); lg += `<g transform="translate(${x} ${yy})">${[0, 72, 144, 216, 288].map(a => `<ellipse rx="3.4" ry="2.1" transform="rotate(${a}) translate(3.2 0)" fill="#f8bbd0"/>`).join("")}<circle r="1.8" fill="#ffd54a"/></g>`; }
      for (let k = 0; k < L.fruit; k++) { const [x, yy] = at(); lg += `<g class="tr-fruit"><path d="M${x} ${yy} v3" stroke="#5d4037" stroke-width="1.4"/><circle cx="${x}" cy="${yy + 7}" r="5.8" fill="#e53935"/><circle cx="${x - 2}" cy="${yy + 5}" r="1.6" fill="#fff" opacity=".7"/><path d="M${x} ${yy + 2} q 4 -3 7 -1" fill="#66bb6a"/></g>`; }
      for (let k = 0; k < L.fallen; k++) ground += `<path d="M0 0 C 3 -4 9 -4 12 0 C 9 4 3 4 0 0 Z" transform="translate(${gx + (r() - 0.5) * 240} ${gy + 10 + r() * 30}) rotate(${r() * 360}) scale(.8)" fill="${["#d4883a", "#b5651d", "#e0a95a"][k % 3]}"/>`;
      if (on) lg += `<circle cx="${cx}" cy="${cy}" r="${spread + 6}" fill="none" stroke="#ffd54a" stroke-width="2" stroke-dasharray="4 4" opacity=".9"/>`;
      lg += `<circle cx="${cx}" cy="${cy}" r="${spread + 8}" fill="transparent" data-tree="${i}" style="cursor:pointer"/>`;
      lg += `<text x="${gx + side * 14}" y="${y + 4}" font-size="10" font-weight="700" fill="#fff" stroke="#5d4037" stroke-width="2.5" paint-order="stroke" text-anchor="${side > 0 ? "start" : "end"}">${+String(mo.month).slice(5, 7)}月</text>`;
      (mo.dream_pets || []).forEach((pt, k) => {
        const px = ex - side * (k * 34) - 20, py = ey - 40 - (k % 2) * 8;
        petsSvg.push(`<g class="tr-pet"><image href="img/dream/item/${pt.key}.webp" x="${px}" y="${py}" width="42" height="42"/><text x="${px + 34}" y="${py + 6}" font-size="13" class="tr-zz">💤</text></g>`);
      });
      layers.push(`<g class="tr-layer" style="animation-delay:${0.5 + i * 0.35}s;transform-origin:${gx}px ${y}px">${lg}</g>`);
    });

    /* ---------- 小動物 ---------- */
    const RC = rng("critter" + now.toDateString());
    if (months.length) {
      const top = gy - step * months.length;
      fx += night
        ? Array.from({ length: 14 }, () => `<circle class="tr-fly" cx="${30 + RC() * (W - 60)}" cy="${gy - 20 - RC() * 220}" r="2" fill="#fff59d" style="animation-delay:${-RC() * 5}s"/>`).join("")
        : `<g class="tr-bfly" style="animation-delay:${-RC() * 10}s"><path d="M0 0 q -8 -10 -12 -2 q 4 6 12 2 q 8 -10 12 -2 q -4 6 -12 2" fill="#ffb74d"/></g>
           <text x="${gx + 4}" y="${top - 2}" font-size="18">🐦</text>`;
      if (!night && RC() < 0.6) fx += `<text x="${gx + tw + 6}" y="${gy + 4}" font-size="18">🐿️</text>`;
    }

    /* ---------- 季節效果 ---------- */
    const r = rng("fx" + now.getMonth());
    if (SN === "winter") for (let k = 0; k < 40; k++) fx += `<circle class="tr-snow" cx="${r() * W}" cy="${r() * H}" r="${1 + r() * 2}" fill="#fff" style="animation-delay:${-r() * 8}s"/>`;
    if (SN === "autumn") for (let k = 0; k < 10; k++) fx += `<path class="tr-leaf" d="M0 0 C 3 -4 9 -4 12 0 C 9 4 3 4 0 0 Z" transform="translate(${r() * W} ${r() * H * 0.5})" fill="#e0812f" style="animation-delay:${-r() * 9}s"/>`;
    if (SN === "spring") for (let k = 0; k < 14; k++) fx += `<ellipse class="tr-leaf" cx="${r() * W}" cy="${r() * H * 0.5}" rx="3" ry="2" fill="#f8bbd0" style="animation-delay:${-r() * 9}s"/>`;
    if (!night && !dawn) fx += `<g opacity=".18">${[0, 1, 2].map(k => `<path d="M${W - 55} 55 L ${W - 200 - k * 60} ${H} L ${W - 160 - k * 60} ${H} Z" fill="#fff8c4"/>`).join("")}</g>`;

    return `<svg class="tr-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="人生之樹"><defs>${defs}</defs>${bg}${ground}
      <g class="tr-trunk" style="transform-origin:${gx}px ${gy}px">${trunk}</g>${layers.join("")}${petsSvg.join("")}${fx}</svg>`;
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
    if ((mo.dream_pets || []).length) rows.push(["🌙", "夢獸", mo.dream_pets.length, `連續入夢 ${mo.dream_streak} 晚：${mo.dream_pets.map(p => p.name).join("、")} 在樹上睡覺`]);
    else if (mo.dream_streak) rows.push(["🌙", "夢獸", 0, `這個月最長連續入夢 ${mo.dream_streak} 晚，連續 7 晚會有夢獸來樹上睡覺`]);
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
      <p class="ov-note" style="font-size:11.5px">🔵 專注 🟢 生活規律 🌿 任務完成率 🌸 好友 🍎 大成就 🌙 連續入夢 7 晚的夢獸 🍂 低迷的月份</p></div>`;
  }

  const st = document.createElement("style");
  st.textContent = `
    .tr-svg { width: 100%; max-width: 420px; display: block; margin: 0 auto; border-radius: 16px; }
    .tr-svg .tr-trunk { animation: trGrowT 1s ease-out both; }
    @keyframes trGrowT { from { transform: scaleY(0); } }
    .tr-svg .tr-layer { animation: trGrowL .8s cubic-bezier(.2,1.4,.4,1) both; }
    @keyframes trGrowL { from { transform: scale(0); opacity: 0; } }
    .tr-svg .tr-star { animation: trTw 3s ease-in-out infinite; } @keyframes trTw { 50% { opacity: .3; } }
    .tr-svg .tr-cloud { animation: trCloud 60s linear infinite; } @keyframes trCloud { from { transform: translateX(-60px); } to { transform: translateX(60px); } }
    .tr-svg .tr-fly { animation: trFly 5s ease-in-out infinite; } @keyframes trFly { 0%, 100% { opacity: .2; transform: translate(0, 0); } 50% { opacity: 1; transform: translate(8px, -10px); } }
    .tr-svg .tr-bfly { animation: trBfly 14s linear infinite; } @keyframes trBfly { 0% { transform: translate(-20px, 300px); } 25% { transform: translate(90px, 180px); } 50% { transform: translate(200px, 240px); } 75% { transform: translate(300px, 150px); } 100% { transform: translate(380px, 200px); } }
    .tr-svg .tr-fruit { animation: trBob 3s ease-in-out infinite; transform-box: fill-box; }
    @keyframes trBob { 50% { transform: translateY(-1.5px); } }
    .tr-svg .tr-pet { animation: trBreath 3.5s ease-in-out infinite; transform-box: fill-box; transform-origin: bottom; }
    @keyframes trBreath { 50% { transform: scaleY(.94); } }
    .tr-svg .tr-zz { animation: trZz 2.5s ease-in-out infinite; } @keyframes trZz { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; transform: translateY(-6px); } }
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
