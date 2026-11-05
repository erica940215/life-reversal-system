/* 序光計畫：🏠 我的小房間（資料在 sql/2026-11-05_專注目標和小房間.sql） */
(function () {
  const ROOM_JS_VERSION = "20261105a";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const RM = { data: null, who: null, pick: null, modal: null };

  /* 地上的雜物（房間越亂出現越多） */
  const MESS = [["🧦", 18, 84, -20], ["📄", 46, 90, 15], ["👕", 70, 86, 8], ["🥤", 30, 78, 0], ["📦", 84, 80, 0], ["🧦", 58, 94, 30], ["📄", 12, 94, -35], ["🍜", 40, 86, 0]];
  /* 扭蛋公仔架 */
  (function(){const c=document.createElement('style');c.textContent='.rm-figs{position:absolute;left:8%;top:58%;display:flex;gap:2px;padding:2px 6px;background:#8a5a3a;border-radius:4px;font-size:16px;box-shadow:0 3px 0 #5a3a22;z-index:2}';document.head.appendChild(c)})();
  const SLOTS = { wall1: [24, 22, 15], wall2: [76, 22, 15], shelf1: [42, 44, 11], shelf2: [58, 44, 11], floor1: [50, 76, 16], floor2: [78, 70, 19] };
  const SLOTN = { wall1: "牆上（左）", wall2: "牆上（右）", shelf1: "架子（左）", shelf2: "架子（右）", floor1: "地上（左）", floor2: "地上（右）" };

  async function load(who) {
    const { data, error } = await db.rpc("home_status", { p_user: who || null });
    if (error) { toast(/home_status/.test(error.message) ? "小房間的資料庫還沒設定：到 Supabase 執行 sql/2026-11-05_專注目標和小房間.sql" : error.message); return false; }
    RM.data = data; RM.who = who || null;
    return true;
  }

  function messCount(d) {
    const c = d.clean;
    let n = c == null ? 3 : c >= 90 ? 0 : c >= 75 ? 1 : c >= 60 ? 2 : c >= 40 ? 4 : c >= 20 ? 6 : 8;
    if (d.last_room >= 3 && n < 2) n = 2;
    return n;
  }

  function scene(d) {
    const n = messCount(d), night = d.hour >= 18 || d.hour < 6;
    const cat = Object.fromEntries((d.catalog || []).map(x => [x.key, x]));
    const deco = Object.entries(SLOTS).map(([k, [x, y, w]]) => {
      const it = cat[(d.slots || {})[k]];
      const inner = it ? `<img src="img/dream/item/${it.key}.webp" alt="" onerror="this.replaceWith(document.createTextNode('${it.emoji}'))">`
        : d.mine ? `<span class="rm-plus">＋</span>` : "";
      return `<button type="button" class="rm-slot ${k.slice(0, -1)} ${it ? "has" : ""}" data-rm="slot" data-k="${k}" style="left:${x}%;top:${y}%;width:${w}%" ${d.mine ? "" : "disabled"} title="${it ? esc(it.name) : SLOTN[k]}">${inner}</button>`;
    }).join("");
    const mess = MESS.slice(0, n).map(([e, x, y, r]) => `<span class="rm-mess" style="left:${x}%;top:${y}%;transform:rotate(${r}deg)">${e}</span>`).join("");
    return `<div class="rm-room ${night ? "night" : ""}">
      <div class="rm-wall"></div><div class="rm-floor"></div><div class="rm-rug"></div>
      <div class="rm-window"><span>${night ? "🌙" : "☀️"}</span></div>
      <div class="rm-shelf"></div>
      <div class="rm-bed ${n >= 4 ? "messy" : ""}"><i></i></div>
      <div class="rm-desk"><span class="rm-lamp">${night ? "💡" : "🪴"}</span>${n >= 2 ? `<span class="rm-pile">📚</span>` : ""}</div>
      ${d.last_room >= 7 ? `<span class="rm-web">🕸️</span>` : ""}
      ${n === 0 ? `<span class="rm-spark">✨</span><span class="rm-spark s2">✨</span>` : ""}
      ${(d.figures || []).length ? `<div class="rm-figs">${d.figures.slice(-8).map(f => `<span title="${esc(f.name)}">${f.emoji}</span>`).join("")}</div>` : ""}
      ${deco}${mess}</div>`;
  }

  function word(d) {
    const n = messCount(d);
    return n === 0 ? "✨ 一塵不染！" : n <= 1 ? "🙂 挺整齊的" : n <= 3 ? "😅 有點亂了" : n <= 5 ? "😵 好亂…" : "🌪️ 像被颱風掃過";
  }

  function html() {
    const d = RM.data;
    return `<div class="rm-card"><div class="rm-head"><b>🏠 ${d.mine ? "我的小房間" : esc(d.name) + " 的房間"}</b><button type="button" class="rm-x" data-rm="close">✕</button></div>
      ${scene(d)}
      <div class="rm-info"><b>${word(d)}</b><small>最近 3 天「🧹 生活」和「🧴 清潔保養」完成 ${d.clean == null ? "—" : d.clean + "%"}${d.last_room >= 3 && d.last_room < 99 ? `・已經 ${d.last_room} 天沒勾「整理房間」` : ""}</small></div>
      ${d.mine ? `<p class="rm-tip">把生活打卡勾滿，房間就會變乾淨。點房間裡的「＋」可以擺你的夢境收藏。</p>` : ""}
      ${RM.pick ? picker(d) : ""}
      <div class="rm-foot">${d.mine ? (d.friends || []).map(f => `<button type="button" class="btn btn-small" data-rm="visit" data-id="${f.id}">👀 去 ${esc(f.name)} 家</button>`).join("")
        : `<button type="button" class="btn btn-small" data-rm="home">🏠 回自己家</button>`}</div></div>`;
  }

  function picker(d) {
    const cat = Object.fromEntries((d.catalog || []).map(x => [x.key, x]));
    const own = (d.owned || []).map(k => cat[k]).filter(Boolean);
    return `<div class="rm-pick"><div class="rm-pick-h">擺在${SLOTN[RM.pick]}<button type="button" class="btn btn-small" data-rm="clear">拿掉</button></div>
      ${own.length ? `<div class="rm-pick-g">${own.map(it => `<button type="button" data-rm="put" data-v="${it.key}"><img src="img/dream/item/${it.key}.webp" alt="" onerror="this.replaceWith(document.createTextNode('${it.emoji}'))"><small>${esc(it.name)}</small></button>`).join("")}</div>`
        : `<p class="rm-tip">還沒有夢境收藏。晚上入夢就能收集，收集到的都可以擺進房間。</p>`}</div>`;
  }

  function draw() { if (RM.modal) RM.modal.innerHTML = html(); }

  async function open(who) {
    if (!(await load(who))) return;
    if (!RM.modal) {
      RM.modal = document.createElement("div");
      RM.modal.className = "rm-modal";
      RM.modal.addEventListener("click", onClick);
      document.body.appendChild(RM.modal);
    }
    RM.pick = null;
    draw();
  }

  async function onClick(e) {
    if (e.target === RM.modal) return close();
    const b = e.target.closest("[data-rm]");
    if (!b) return;
    const a = b.dataset.rm;
    if (a === "close") return close();
    if (a === "slot") { RM.pick = RM.pick === b.dataset.k ? null : b.dataset.k; return draw(); }
    if (a === "visit") { await load(b.dataset.id); RM.pick = null; return draw(); }
    if (a === "home") { await load(null); return draw(); }
    if (a === "put" || a === "clear") {
      const { data, error } = await db.rpc("home_place", { p_slot: RM.pick, p_item: a === "put" ? b.dataset.v : null });
      if (error) return toast(error.message);
      RM.data = data; RM.pick = null; draw();
    }
  }
  function close() { if (RM.modal) { RM.modal.remove(); RM.modal = null; } }

  const st = document.createElement("style");
  st.textContent = `
    .rm-modal { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,.6); display: grid; place-items: center; padding: 12px; }
    .rm-card { width: min(460px, 100%); max-height: 92vh; overflow-y: auto; background: #1b2033; color: #eef; border-radius: 18px; padding: 14px; }
    .rm-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; } .rm-x { background: none; border: 0; color: inherit; font-size: 18px; cursor: pointer; }
    .rm-room { position: relative; aspect-ratio: 4 / 3; border-radius: 14px; overflow: hidden; }
    .rm-wall { position: absolute; inset: 0 0 38% 0; background: linear-gradient(#fbe7d2, #f3d5b5); }
    .rm-room.night .rm-wall { background: linear-gradient(#5b5486, #463f6e); }
    .rm-floor { position: absolute; inset: 62% 0 0 0; background: repeating-linear-gradient(90deg, #c08a5a 0 22%, #b27c4e 22% 23%); }
    .rm-room.night .rm-floor { filter: brightness(.7); }
    .rm-rug { position: absolute; left: 30%; top: 72%; width: 42%; height: 18%; border-radius: 50%; background: radial-gradient(#e9a2b8, #c97a95); opacity: .85; }
    .rm-window { position: absolute; left: 40%; top: 8%; width: 20%; height: 24%; border: 5px solid #fff8ee; border-radius: 6px; background: linear-gradient(#9fd8ff, #d9f1ff); display: grid; place-items: start end; font-size: 18px; padding: 2px; }
    .rm-room.night .rm-window { background: linear-gradient(#1b2050, #33307a); }
    .rm-shelf { position: absolute; left: 36%; top: 54%; width: 28%; height: 3%; background: #8a5a3a; border-radius: 2px; box-shadow: 0 3px 0 #6b4429; }
    .rm-bed { position: absolute; left: 2%; top: 50%; width: 34%; height: 26%; background: #f6f1ff; border-radius: 10px 10px 4px 4px; box-shadow: inset 0 -10px 0 #b9a7e6; }
    .rm-bed i { position: absolute; left: 6%; top: 10%; width: 30%; height: 30%; background: #fff; border-radius: 8px; }
    .rm-bed.messy { transform: rotate(-2deg); box-shadow: inset 0 -10px 0 #b9a7e6, inset 20px 8px 0 #d9cff3; }
    .rm-desk { position: absolute; right: 2%; top: 46%; width: 30%; height: 22%; background: #a0683f; border-radius: 4px; box-shadow: inset 0 6px 0 #b97a4c; }
    .rm-lamp { position: absolute; right: 8%; top: -60%; font-size: 26px; } .rm-pile { position: absolute; left: 10%; top: -50%; font-size: 24px; }
    .rm-slot { position: absolute; transform: translate(-50%, -50%); aspect-ratio: 1; border: 0; background: none; padding: 0; cursor: pointer; }
    .rm-slot img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 3px 4px rgba(0,0,0,.35)); }
    .rm-slot.wall.has { background: #fff8ee; border: 4px solid #c9a15a; border-radius: 6px; padding: 2px; }
    .rm-plus { display: grid; place-items: center; width: 100%; height: 100%; border: 2px dashed rgba(120,90,60,.5); border-radius: 8px; color: rgba(120,90,60,.8); font-size: 18px; }
    .rm-room.night .rm-plus { border-color: rgba(255,255,255,.35); color: rgba(255,255,255,.6); }
    .rm-slot:disabled { cursor: default; }
    .rm-mess { position: absolute; font-size: 22px; transform-origin: center; filter: drop-shadow(0 2px 2px rgba(0,0,0,.3)); }
    .rm-web { position: absolute; left: 1%; top: 1%; font-size: 30px; opacity: .7; }
    .rm-spark { position: absolute; left: 20%; top: 40%; font-size: 22px; animation: rmTw 2s ease-in-out infinite; } .rm-spark.s2 { left: 80%; top: 30%; animation-delay: 1s; }
    @keyframes rmTw { 50% { opacity: .2; transform: scale(.7); } }
    .rm-info { margin-top: 10px; } .rm-info small { display: block; font-size: 12px; opacity: .75; }
    .rm-tip { font-size: 12.5px; opacity: .75; margin: 6px 0; }
    .rm-pick { margin-top: 8px; background: #232a40; border-radius: 12px; padding: 10px; }
    .rm-pick-h { display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 13px; }
    .rm-pick-g { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 8px; }
    .rm-pick-g button { background: #1b2033; border: 1px solid #3a4260; border-radius: 10px; padding: 4px; color: inherit; cursor: pointer; font-size: 26px; }
    .rm-pick-g img { width: 100%; aspect-ratio: 1; object-fit: contain; } .rm-pick-g small { display: block; font-size: 10px; }
    .rm-foot { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
  `;
  document.head.appendChild(st);
  window.Room = { version: ROOM_JS_VERSION, open };
})();
