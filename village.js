/* 序光計畫：🌙 明日預覽卡＋⭐ 最重要的一件事、🏘️ 村民委託、🎰 成就扭蛋機台、📮 每週明信片
   資料在 sql/2026-11-05_明日卡_村民_明信片_扭蛋.sql */
(function () {
  const VILLAGE_JS_VERSION = "20261105a";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const gameOn = () => !(typeof window.isGameOff === "function" && window.isGameOff());
  const ITEM = { stardust: "✨ 星屑", gacha_coin: "🪙 扭蛋幣", wish_rare: "💎 稀有星願瓶", wish_limited: "🌠 限定星願瓶", chest_gold: "🧰 金寶箱",
    chest_star: "✨ 星光寶箱", ticket_special: "🎟️ 特殊召喚券", ticket_limited: "🌟 限定召喚券" };
  const rw = o => Object.entries(o || {}).map(([k, v]) => `${ITEM[k] || k} ×${v}`).join("、");
  const S = { top: null, vil: null, cap: null };

  function modal(html, cls) {
    const m = document.createElement("div");
    m.className = "vg-modal";
    m.innerHTML = `<div class="vg-card ${cls || ""}">${html}</div>`;
    m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-vx]")) m.remove(); });
    document.body.appendChild(m);
    return m;
  }

  function slot(id, before) {
    const ref = document.getElementById(before) || document.getElementById("de-today") || document.getElementById("dr-today") || document.getElementById("ev-today2") || document.getElementById("fn-today");
    if (!ref) return null;
    let box = document.getElementById(id);
    if (!box) { box = document.createElement("div"); box.id = id; box.className = "card vg-today"; ref.before(box); }
    return box;
  }

  /* ================= 🌙 明日預覽卡 ================= */
  const WX = { 0: ["☀️", "晴天"], 1: ["🌤️", "大致晴朗"], 2: ["⛅", "多雲"], 3: ["☁️", "陰天"], 45: ["🌫️", "有霧"], 48: ["🌫️", "有霧"], 51: ["🌦️", "毛毛雨"], 53: ["🌦️", "毛毛雨"], 55: ["🌧️", "毛毛雨"],
    61: ["🌧️", "小雨"], 63: ["🌧️", "下雨"], 65: ["🌧️", "大雨"], 80: ["🌦️", "陣雨"], 81: ["🌧️", "陣雨"], 82: ["⛈️", "大陣雨"], 95: ["⛈️", "雷雨"], 96: ["⛈️", "雷雨"], 99: ["⛈️", "雷雨"] };
  async function weather() {
    try {
      const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=25.03&longitude=121.56&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTaipei&forecast_days=2");
      const j = await r.json(), d = j.daily;
      return { code: d.weathercode[1], max: Math.round(d.temperature_2m_max[1]), min: Math.round(d.temperature_2m_min[1]), rain: d.precipitation_probability_max[1] };
    } catch (_) { return null; }
  }

  async function openTomorrow() {
    if (!hasDb()) return;
    const [{ data, error }, wx] = await Promise.all([db.rpc("tomorrow_preview"), weather()]);
    if (error) return toast(/tomorrow_preview/.test(error.message) ? "明日預覽卡的資料庫還沒設定：到 Supabase 執行 sql/2026-11-05_明日卡_村民_明信片_扭蛋.sql" : error.message);
    const d = data, wd = "一二三四五六日"[d.weekday - 1], w = wx && (WX[wx.code] || ["🌡️", "天氣"]);
    const top = d.top;
    const tasks = (d.tasks || []).map(t => `<button type="button" class="tm-task ${top && top.task_id === t.id ? "on" : ""}" data-tid="${t.id}"><span>${top && top.task_id === t.id ? "⭐" : "☆"}</span>${esc(t.title)}<small>${esc(t.category || "")}</small></button>`).join("");
    const reps = (d.repeat || []).map(t => `<div class="tm-rep">🔁 ${esc(t.title)}</div>`).join("");
    const m = modal(`<div class="tm-head"><div class="tm-date">${String(d.day).slice(5).replace("-", "/")}<small>星期${wd}</small></div>
        ${w ? `<div class="tm-wx"><span>${w[0]}</span><div><b>${w[1]}</b><small>${wx.min}～${wx.max}°C・降雨 ${wx.rain}%${wx.rain >= 50 ? "・記得帶傘 ☂️" : ""}</small></div></div>` : `<div class="tm-wx"><small>天氣暫時讀不到</small></div>`}</div>
      <div class="tm-hint ${d.good ? "" : "bad"}">🎴 ${esc(d.hint)}</div>
      <div class="tm-sec">📋 明天的行程・點 ☆ 選「最重要的一件事」</div>
      <div class="tm-list">${tasks || `<p class="tm-none">明天還沒有排任務</p>`}${reps}</div>
      <div class="tm-own"><input id="tm-top" maxlength="120" placeholder="或自己寫：明天最重要的一件事" value="${top && !top.task_id ? esc(top.title) : ""}"><button type="button" class="btn btn-small" data-tm="own">設定</button></div>
      <p class="tm-top">${top ? `⭐ 明天最重要：<b>${esc(top.title)}</b>・明早會排在最上面` : "還沒選明天最重要的一件事"}</p>
      <button type="button" class="btn btn-primary" data-vx="1" style="width:100%">🌙 好，晚安</button>`, "tm-card");
    m.addEventListener("click", async e => {
      const b = e.target.closest("[data-tid],[data-tm]");
      if (!b) return;
      const tid = b.dataset.tid ? Number(b.dataset.tid) : null, title = b.dataset.tm ? m.querySelector("#tm-top").value : null;
      const { error: er } = await db.rpc("top_task_set", { p_task_id: tid, p_title: title });
      if (er) return toast(er.message);
      m.remove(); toast("⭐ 明天最重要的一件事設定好了"); openTomorrow();
    });
  }

  /* ⭐ 今天最重要的一件事 */
  async function loadTop() {
    const { data, error } = await db.rpc("top_task_today");
    S.top = error ? null : data;
    if (S.top && S.top.task_id) {
      try {
        const key = "taskOrder", ord = JSON.parse(localStorage.getItem(key) || "[]").map(String), id = String(S.top.task_id);
        if (ord[0] !== id) { localStorage.setItem(key, JSON.stringify([id].concat(ord.filter(x => x !== id)))); if (typeof renderTasks === "function") renderTasks(); }
      } catch (_) {}
    }
    renderTop();
  }
  function renderTop() {
    const box = slot("tp-today", "de-today");
    if (!box) return;
    box.hidden = !S.top;
    if (!S.top) return;
    box.className = "card vg-today tp-card" + (S.top.done ? " done" : "");
    box.innerHTML = `<div class="tp-row"><span class="tp-star">${S.top.done ? "🌟" : "⭐"}</span><div><small>今天最重要的一件事</small><b>${esc(S.top.title)}</b></div>
      ${S.top.done ? `<span class="tp-ok">完成！✨ +20</span>` : S.top.task_id ? `<small class="tp-sub">在下面的任務裡勾完它</small>` : `<button type="button" class="btn btn-small btn-primary" data-tp="done">完成了</button>`}</div>`;
  }

  /* ================= 🏘️ 村民委託 ================= */
  async function loadVil() {
    const { data, error } = await db.rpc("village_status");
    S.vil = error ? null : data;
    renderVil();
    if (S.vil && S.vil.town) claimTown();
  }
  const CHECKN = { focus25: "今天專注滿 25 分鐘", focus30: "今天專注滿 30 分鐘", focus60: "今天專注滿 1 小時", task3: "今天完成 3 個任務", life_room: "生活打卡勾「整理房間」", plan: "生活打卡勾「確認明天行程」" };
  const vimg = (k, e) => `<img class="vg-face" src="img/village/${k}.webp" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'vg-face vg-emo',textContent:'${e}'}))">`;
  function renderVil() {
    const box = slot("vg-today", "de-today");
    if (!box) return;
    const v = S.vil;
    box.hidden = !(v && gameOn());
    if (box.hidden) return;
    box.className = "card vg-today vg-vil";
    box.innerHTML = `<div class="vg-h"><b>🏘️ 村民委託</b>${v.town ? `<small class="vg-lv">星光村 Lv${v.town.lv}</small>` : ""}<button type="button" class="btn btn-small" data-vg="town">村莊</button></div>${seasonLine(S.season)}
      ${(v.quests || []).map(q => {
        const p = v.defs[q.villager], qd = p.quests.find(x => x.k === q.quest) || {};
        return `<div class="vg-q ${q.done ? "done" : ""}">${vimg(q.villager, p.emoji)}<div class="vg-qb"><b>${esc(p.name)}</b><p>「${esc(qd.text)}」</p>
          ${q.done ? `<small>✅ 完成了・好感 ${v.aff[q.villager] || 0}</small>` : q.check === "self" ? `<button type="button" class="btn btn-small btn-primary" data-vg="done" data-s="${q.slot}">我做到了</button>`
          : q.ready ? `<button type="button" class="btn btn-small btn-primary" data-vg="done" data-s="${q.slot}">✨ 交差</button>` : `<small>📌 ${CHECKN[q.check] || ""}之後就能交差</small>`}</div></div>`;
      }).join("")}`;
  }
  function townHtml(v) {
    const tw = v.town, bs = v.buildings || [];
    if (!tw) return "";
    const pct = tw.next ? Math.round((tw.xp - tw.cur) / (tw.next - tw.cur) * 100) : 100;
    const P = tw.parts || {};
    return `<div class="vt-head"><div class="vt-lv">Lv<b>${tw.lv}</b></div><div style="flex:1"><b>星光村</b><div class="eg-bar"><i style="width:${pct}%"></i></div>
        <small>${tw.next ? `村莊經驗 ${tw.xp}／${tw.next}` : `村莊經驗 ${tw.xp}・已經是最大的小鎮了`}</small></div></div>
      <p class="vg-note">村莊經驗 = 完成委託 ×10（${P.quests || 0}）＋ 專注小時 ×2（${P.focus_h || 0}）＋ 完成任務（${P.tasks || 0}）＋ 生活打卡（${P.life || 0}）</p>
      <div class="vt-map">${bs.map(b => `<div class="vt-b ${b.lv <= tw.lv ? "on" : ""}" title="${esc(b.desc)}"><span>${b.lv <= tw.lv ? b.emoji : "🚧"}</span><small>${b.lv <= tw.lv ? esc(b.name) : `Lv${b.lv}`}</small></div>`).join("")}</div>
      ${(() => { const nb = bs.find(b => b.lv > tw.lv); return nb ? `<p class="vg-note">🔨 下一個：Lv${nb.lv}「${esc(nb.name)}」— ${esc(nb.desc)}</p>` : ""; })()}`;
  }
  function openTown() {
    const v = S.vil;
    if (!v) return;
    const T = [3, 7, 15, 30], lv = v.town ? v.town.lv : 1;
    modal(`<div class="vg-title">🏘️ 星光村</div>${townHtml(v)}${seasonLine(S.season)}<p class="vg-note">完成委託，村民好感 +1。好感 3／7／15／30 會告訴你他的故事，還會送你禮物。</p>
      ${Object.entries(v.defs).map(([k, p]) => {
        if ((p.unlock || 1) > lv) return `<div class="vg-person locked"><span class="vg-face vg-emo">🔒</span><div class="vg-pb"><b>？？？</b><small>村莊 Lv${p.unlock} 會有新村民搬來</small></div></div>`;
        const a = v.aff[k] || 0, ch = T.filter(x => a >= x).length, next = T.find(x => a < x);
        return `<div class="vg-person">${vimg(k, p.emoji)}<div class="vg-pb"><b>${esc(p.name)}</b><small>${esc(p.job)}・好感 ${a}${next ? `（${next} 解鎖第 ${ch + 1} 章）` : "・全部故事都解鎖了"}</small>
          <div class="vg-hearts">${T.map(x => a >= x ? "💗" : "🤍").join("")}</div>
          ${p.story.slice(0, ch).map((s, i) => `<p class="vg-story"><b>第 ${i + 1} 章</b>${esc(s)}</p>`).join("")}</div></div>`;
      }).join("")}
      <button type="button" class="btn btn-primary" data-vx="1" style="width:100%">關閉</button>`, "vg-town");
  }
  /* 📜 季節劇情 */
  async function loadSeason() {
    const { data, error } = await db.rpc("season_status");
    S.season = error ? null : data;
    renderVil();
  }
  function seasonLine(z) {
    if (!z || !z.def) return "";
    const ch = z.def.chapters, n = ch.filter(c => z.mat >= c.need).length, next = ch.find(c => z.mat < c.need);
    const ready = ch.some((c, i) => z.mat >= c.need && !z.claimed.includes(i + 1) && (i < 4 || z.festival_open));
    return `<button type="button" class="vs-line" data-vg="season" style="--c:${z.def.color}"><span>${z.def.emoji}</span><span><b>本季主線：${esc(z.def.name)}</b>
      <small>${z.def.mat_emoji} ${z.def.mat} ${z.mat}${next ? `／${next.need}` : ""}・第 ${n}/5 章・剩 ${z.days_left} 天</small></span>${ready ? `<i>🎁</i>` : ""}</button>`;
  }
  function openSeason() {
    const z = S.season;
    if (!z) return toast("季節劇情的資料庫還沒設定：到 Supabase 執行 sql/2026-11-05_季節劇情.sql");
    const d = z.def, top = d.chapters[4].need, P = z.parts;
    const m = modal(`<div class="vs-hero" style="--c:${d.color}"><img class="vs-banner" src="img/season/${z.season.key}.webp" alt="" onerror="this.remove()"><div class="vs-emo">${d.emoji}</div><div class="vg-title">${esc(d.name)}</div>
        <small>${z.season.start.slice(5).replace("-", "/")}～${z.season.end.slice(5).replace("-", "/")}・季末最後 7 天舉行祭典（剩 ${z.days_left} 天）</small>
        <div class="eg-bar"><i style="width:${Math.min(100, z.mat / top * 100)}%;background:${d.color}"></i></div>
        <b>${d.mat_emoji} ${d.mat} ${z.mat}／${top}</b></div>
      <p class="vg-note">${d.mat}怎麼來：專注每 30 分鐘 1 個（${Math.floor(P.focus_min / 30)}）＋ 完成委託 2 個（${P.quests * 2}）＋ 每完成 3 個任務 1 個（${Math.floor(P.tasks / 3)}）</p>
      ${d.chapters.map((c, i) => { const open = z.mat >= c.need, got = z.claimed.includes(i + 1), fest = i === 4;
        return `<div class="vs-ch ${open ? "on" : ""}"><div class="vs-n">${open ? (fest ? d.emoji : i + 1) : "🔒"}</div><div style="flex:1"><b>${open ? esc(c.title) : `第 ${i + 1} 章・需要 ${c.need} 個${d.mat}`}</b>
          ${open ? `<p>${esc(c.text)}</p>` : ""}
          ${open ? (got ? `<small>✅ 已領獎</small>` : fest && !z.festival_open ? `<small>🎪 材料夠了！祭典會在季末最後 7 天舉行</small>`
            : `<button type="button" class="btn btn-small btn-primary" data-vs="${i + 1}">${fest ? "參加祭典 🎉" : "領取獎勵"}</button>`) : ""}</div></div>`; }).join("")}
      <button type="button" class="btn" data-vx="1" style="width:100%;margin-top:8px">關閉</button>`, "vs-modal");
    m.addEventListener("click", async e => {
      const b = e.target.closest("[data-vs]");
      if (!b) return;
      b.disabled = true;
      const { data, error } = await db.rpc("season_claim", { p_ch: Number(b.dataset.vs) });
      if (error) { b.disabled = false; return toast(error.message); }
      S.season = data; m.remove(); renderVil();
      const fest = b.dataset.vs === "5";
      toast(fest ? "🎉 祭典獎勵：✨ 300、星光寶箱、限定星願瓶" : `📜 第 ${b.dataset.vs} 章獎勵：✨ +${40 + 40 * Number(b.dataset.vs)}`);
      openSeason();
    });
  }

  async function claimTown() {
    const { data, error } = await db.rpc("village_levelup_claim");
    if (error || !data || !data.levels || !data.levels.length) return;
    const bs = (S.vil && S.vil.buildings) || [], defs = (S.vil && S.vil.defs) || {};
    const lvls = data.levels, newB = bs.filter(b => lvls.includes(b.lv)), newP = Object.values(defs).filter(p => lvls.includes(p.unlock || 1));
    modal(`<div class="bh-loot"><div class="bh-big">🏘️</div><div class="vg-title">星光村升到 Lv${Math.max(...lvls)}！</div>
      ${newB.map(b => `<p>${b.emoji} 蓋好了「<b>${esc(b.name)}</b>」<br><small>${esc(b.desc)}</small></p>`).join("")}
      ${newP.map(p => `<p>${p.emoji} 新村民 <b>${esc(p.name)}</b> 搬來了！明天起可能會找你幫忙</p>`).join("")}
      <p class="bh-items">✨ 星屑 ×${lvls.reduce((a, l) => a + 50 * l, 0)}${lvls.some(l => l % 3 === 0) ? "、✨ 星光寶箱 ×1" : ""}</p></div>
      <button type="button" class="btn btn-primary" data-vx="1" style="width:100%">去村莊看看</button>`);
  }

  /* ================= 🎰 成就扭蛋機台 ================= */
  async function loadCap() {
    const { data, error } = await db.rpc("capsule_status");
    S.cap = error ? null : data;
    renderCap();
  }
  function renderCap() {
    const box = slot("cp-today", "de-today");
    if (!box) return;
    const c = S.cap;
    box.hidden = !(c && c.pending > 0 && gameOn());
    if (box.hidden) return;
    box.className = "card vg-today cp-card";
    box.innerHTML = `<div class="tp-row"><span class="cp-ic">🎰</span><div><b>有 ${c.pending} 顆紀念扭蛋！</b><small>你達成了新的里程碑，轉一下看看是什麼公仔</small></div>
      <button type="button" class="btn btn-small btn-primary" data-cp="open">轉！</button></div>`;
  }
  function openMachine(auto) {
    const c = S.cap || {}, caps = c.caps || {};
    const defs = c.defs || [];
    const m = modal(`<div class="vg-title">🎰 成就扭蛋機台</div>
      <div class="cp-machine"><div class="cp-dome">${defs.filter(d => caps[d.k] && !caps[d.k].opened).slice(0, 6).map((d, i) => `<span class="cp-ball" style="background:${d.color};left:${15 + i * 13}%;top:${40 + (i % 2) * 18}%"></span>`).join("")}</div>
        <div class="cp-base"><button type="button" class="cp-knob" data-cp="spin" ${c.pending ? "" : "disabled"}>${c.pending ? "轉" : "—"}</button><small>${c.pending ? `還有 ${c.pending} 顆` : "達成新的里程碑就會有新扭蛋"}</small></div></div>
      <div class="cp-out"></div>
      <div class="vg-sec">🏆 全部里程碑（${Object.keys(caps).length}/${defs.length}）</div>
      <div class="cp-grid">${defs.map(d => { const got = caps[d.k], v = (c.stats || {})[d.stat] || 0;
        return `<div class="cp-fig ${got && got.opened ? "on" : got ? "wait" : ""}" style="--c:${d.color}"><span>${got && got.opened ? `<img class="cp-img" src="img/capsule/${d.k}.webp" alt="" onerror="this.replaceWith(document.createTextNode('${d.emoji}'))">` : got ? "🎁" : "❔"}</span><b>${got && got.opened ? esc(d.name) : "？？？"}</b><small>${got ? (got.opened ? esc(d.line) : "還沒轉") : `${Math.min(v, d.need)}/${d.need}`}</small></div>`; }).join("")}</div>
      <button type="button" class="btn btn-primary" data-vx="1" style="width:100%;margin-top:10px">關閉</button>`, "cp-modal");
    m.addEventListener("click", async e => {
      if (!e.target.closest("[data-cp=spin]")) return;
      const knob = m.querySelector(".cp-knob"); knob.disabled = true; knob.classList.add("spin");
      const { data, error } = await db.rpc("capsule_open");
      if (error) { toast(error.message); return; }
      const d = data.def;
      setTimeout(() => {
        m.querySelector(".cp-out").innerHTML = `<div class="cp-reveal" style="--c:${d.color}"><div class="cp-cap"><i></i><i></i></div><div class="cp-figbig"><img class="cp-img big" src="img/capsule/${d.k}.webp" alt="" onerror="this.replaceWith(document.createTextNode('${d.emoji}'))"></div>
          <b>${esc(d.name)}</b><p>${esc(d.line)}</p><small>✨ 星屑 +50・已經擺到小房間的架子上了</small></div>`;
        loadCap().then(() => { const k = m.querySelector(".cp-knob"); if (S.cap && S.cap.pending) { k.disabled = false; k.classList.remove("spin"); } });
      }, 900);
    });
    if (auto) setTimeout(() => m.querySelector("[data-cp=spin]") && m.querySelector("[data-cp=spin]").click(), 400);
  }

  /* ================= 📮 每週明信片（📊 回顧的分頁） ================= */
  const SCENE = { study: ["📚", "書房", "#3b2f5c", "#7a5ea8"], mountain: ["⛰️", "山頂", "#2f6b5a", "#9bd3a6"], night: ["🌌", "夜空", "#141a3a", "#4b3d9a"], home: ["🏡", "整潔的家", "#b07a4a", "#f3d5b5"],
    arena: ["⚔️", "競技場", "#6b2f2f", "#d9774b"], rest: ["☕", "午後休息", "#6b5a4a", "#e9d5bd"], town: ["🏘️", "小鎮散步", "#4a6b8a", "#bfe0f2"] };
  const PC = { data: null };
  async function pcLoad(rerender) {
    const { data, error } = await db.rpc("postcard_status");
    PC.data = error ? { err: error.message } : data;
    rerender();
  }
  function pcHtml(rerender) {
    const d = PC.data;
    if (!d) { pcLoad(rerender); return `<div class="ov-empty">載入中…</div>`; }
    if (d.err) return `<p class="ov-note">⚠️ 明信片的資料庫還沒設定：到 Supabase 的 SQL Editor 執行 <b>sql/2026-11-05_明日卡_村民_明信片_扭蛋.sql</b>。</p>`;
    const cards = d.cards || [];
    return `<p class="ov-note">每週日晚上 6 點，用這週的數據自動畫一張明信片收進冊子；也可以寄給好友。</p>
      ${cards.length ? cards.map(c => { const s = SCENE[c.scene] || SCENE.town, st = c.stats || {};
        return `<div class="pc-card" style="--a:${s[2]};--b:${s[3]}"><div class="pc-pic"><img src="img/postcard/${c.scene}.webp" alt="" onerror="this.remove()"><span class="pc-emo">${s[0]}</span><div class="pc-stamp">${s[0]}<small>${String(c.week).slice(5).replace("-", "/")}</small></div></div>
          <div class="pc-back"><div class="pc-l"><b>${c.from ? `📬 來自 ${esc(c.from)}` : `${String(c.week).slice(0, 4)} 年 ${+String(c.week).slice(5, 7)} 月 ${+String(c.week).slice(8)} 日那一週・${s[1]}`}</b>
            <p>${esc(c.line)}</p>${c.note ? `<p class="pc-note">「${esc(c.note)}」</p>` : ""}</div>
            <div class="pc-r"><small>⏱️ ${st.focus_h || 0} h</small><small>✅ ${st.tasks_done || 0}/${st.tasks_total || 0}</small><small>🌱 ${st.life_pct == null ? "—" : st.life_pct + "%"}</small><small>🌙 ${st.dream_nights || 0} 晚</small>
            ${!c.from && (d.friends || []).length ? `<button type="button" class="ov-btn" data-pc="send" data-id="${c.id}">✉️ 寄給好友</button>` : ""}</div></div></div>`; }).join("")
        : `<p class="ov-note">還沒有明信片。這週日晚上 6 點會寄來第一張。</p>`}`;
  }
  function pcSend(id, rerender) {
    const fr = (PC.data && PC.data.friends) || [];
    const m = modal(`<div class="vg-title">✉️ 寄明信片</div>
      <select id="pc-to">${fr.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join("")}</select>
      <input id="pc-note" maxlength="100" placeholder="寫一句話給他（選填）">
      <div style="display:flex;gap:6px;margin-top:8px"><button type="button" class="btn" data-vx="1" style="flex:1">取消</button><button type="button" class="btn btn-primary" data-pcs="1" style="flex:1">寄出</button></div>`);
    m.addEventListener("click", async e => {
      if (!e.target.closest("[data-pcs]")) return;
      const { error } = await db.rpc("postcard_send", { p_id: Number(id), p_friend: m.querySelector("#pc-to").value, p_note: m.querySelector("#pc-note").value });
      if (error) return toast(error.message);
      m.remove(); toast("📮 明信片寄出去了");
    });
  }

  /* ---------- 點擊 ---------- */
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-vg],[data-cp],[data-tp],[data-pc]");
    if (!b) return;
    if (b.dataset.vg === "town") return openTown();
    if (b.dataset.vg === "season") { const md = b.closest(".vg-modal"); if (md) md.remove(); return openSeason(); }
    if (b.dataset.vg === "done") {
      b.disabled = true;
      const { data, error } = await db.rpc("village_done", { p_slot: Number(b.dataset.s) });
      if (error) { b.disabled = false; return toast(error.message); }
      toast("🏘️ 謝謝你！好感 +1、星屑 +15");
      if (data.unlock) {
        const u = data.unlock;
        modal(`<div class="vg-title">💗 好感度提升！</div><p class="vg-story big"><b>第 ${u.chapter} 章</b>${esc(u.story)}</p><p class="vg-note">🎁 禮物：${esc(rw(u.gift))}</p>
          <button type="button" class="btn btn-primary" data-vx="1" style="width:100%">收下</button>`);
      }
      return loadVil();
    }
    if (b.dataset.cp === "open") return openMachine(true);
    if (b.dataset.tp === "done") { const { data } = await db.rpc("top_task_done"); S.top = data; renderTop(); toast("🌟 今天最重要的事完成了！星屑 +20"); return; }
    if (b.dataset.pc === "send") return pcSend(b.dataset.id);
  });

  const st = document.createElement("style");
  st.textContent = `
    .vg-modal { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,.6); display: grid; place-items: center; padding: 12px; }
    .vg-card { width: min(440px, 100%); max-height: 90vh; overflow-y: auto; background: #1b2033; color: #eef; border-radius: 18px; padding: 16px; }
    .vg-card input, .vg-card select { width: 100%; box-sizing: border-box; background: #12162a; color: #eef; border: 1px solid #3a4260; border-radius: 10px; padding: 8px; font: inherit; margin: 4px 0; }
    .vg-title { font-size: 18px; font-weight: 800; margin-bottom: 6px; } .vg-note { font-size: 12.5px; opacity: .75; } .vg-sec { font-weight: 800; font-size: 13px; margin: 12px 0 6px; }
    .tm-card { background: linear-gradient(170deg, #1d2350, #2b2160 60%, #1b2033); }
    .tm-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .tm-date { font-size: 30px; font-weight: 900; line-height: 1; } .tm-date small { display: block; font-size: 13px; font-weight: 600; opacity: .7; margin-top: 4px; }
    .tm-wx { display: flex; gap: 8px; align-items: center; background: rgba(255,255,255,.08); padding: 8px 12px; border-radius: 12px; } .tm-wx > span { font-size: 32px; } .tm-wx small { display: block; font-size: 11.5px; opacity: .8; }
    .tm-hint { margin: 12px 0; padding: 10px 12px; border-radius: 12px; background: rgba(255,213,74,.14); font-size: 13.5px; } .tm-hint.bad { background: rgba(248,81,73,.14); }
    .tm-sec { font-weight: 800; font-size: 13px; margin: 8px 0 6px; }
    .tm-task { display: flex; gap: 8px; align-items: center; width: 100%; text-align: left; border: 1px solid #3a4260; background: rgba(255,255,255,.04); color: inherit; border-radius: 10px; padding: 8px 10px; margin: 4px 0; font: inherit; cursor: pointer; }
    .tm-task.on { border-color: #ffd54a; background: rgba(255,213,74,.12); } .tm-task span { font-size: 18px; } .tm-task small { margin-left: auto; opacity: .6; font-size: 11px; }
    .tm-rep { font-size: 12.5px; opacity: .7; padding: 3px 4px; } .tm-none { font-size: 13px; opacity: .6; }
    .tm-own { display: flex; gap: 6px; align-items: center; margin-top: 6px; } .tm-own input { flex: 1; }
    .tm-top { font-size: 13px; margin: 10px 0; }
    .tp-card { background: linear-gradient(135deg, rgba(255,213,74,.2), rgba(255,158,199,.12)); border: 1px solid rgba(255,213,74,.5); }
    .tp-card.done { background: linear-gradient(135deg, rgba(63,185,80,.2), rgba(255,213,74,.1)); }
    .tp-row { display: flex; gap: 12px; align-items: center; } .tp-row > div { flex: 1; } .tp-row small { display: block; font-size: 12px; opacity: .75; } .tp-row b { font-size: 16px; }
    .tp-star { font-size: 32px; } .tp-ok { font-weight: 800; color: #3fb950; } .tp-sub { max-width: 120px; text-align: right; }
    .vs-line { display: flex; gap: 10px; align-items: center; width: 100%; margin: 6px 0; padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--c) 55%, transparent); border-radius: 12px; background: color-mix(in srgb, var(--c) 14%, transparent); color: inherit; text-align: left; cursor: pointer; font: inherit; }
    .vs-line > span:first-child { font-size: 26px; } .vs-line b { display: block; font-size: 13px; } .vs-line small { font-size: 11.5px; opacity: .8; } .vs-line i { margin-left: auto; font-style: normal; font-size: 20px; animation: cpWig 1.4s ease-in-out infinite; }
    .vs-hero { text-align: center; padding: 14px; border-radius: 16px; background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--c) 35%, transparent), transparent 75%); }
    .vs-banner { display: block; width: calc(100% + 28px); margin: -14px -14px 8px; border-radius: 16px 16px 0 0; aspect-ratio: 2.2/1; object-fit: cover; } .vs-banner + .vs-emo { display: none; }
    .cp-img { width: 100%; aspect-ratio: 3/4; object-fit: cover; border-radius: 6px; display: block; } .cp-img.big { width: 150px; margin: 0 auto; border-radius: 12px; box-shadow: 0 0 24px var(--c); }
    .vs-emo { font-size: 54px; } .vs-hero small { display: block; font-size: 12px; opacity: .75; } .vs-hero .eg-bar { margin: 10px 0 4px; height: 10px; }
    .vs-ch { display: flex; gap: 10px; padding: 10px 0; border-top: 1px solid rgba(127,127,127,.2); opacity: .55; } .vs-ch.on { opacity: 1; }
    .vs-ch p { font-size: 13px; margin: 4px 0 6px; line-height: 1.6; } .vs-ch small { font-size: 12px; opacity: .8; }
    .vs-n { width: 34px; height: 34px; flex: none; border-radius: 50%; display: grid; place-items: center; font-weight: 800; background: rgba(255,255,255,.08); }
    .vg-lv { margin-left: 6px; margin-right: auto; font-size: 11.5px; padding: 1px 8px; border-radius: 99px; background: rgba(255,213,74,.2); }
    .vt-head { display: flex; gap: 12px; align-items: center; margin: 4px 0 6px; } .vt-head small { font-size: 12px; opacity: .75; }
    .vt-lv { width: 56px; height: 56px; border-radius: 14px; background: linear-gradient(135deg, #ffd54a, #ff8a65); color: #3a2010; display: grid; place-items: center; font-size: 11px; font-weight: 800; line-height: 1; }
    .vt-lv b { font-size: 24px; display: block; }
    .vt-map { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; margin: 8px 0; padding: 10px; border-radius: 14px; background: linear-gradient(180deg, rgba(120,200,255,.12), rgba(120,200,120,.15)); }
    .vt-b { text-align: center; opacity: .4; } .vt-b.on { opacity: 1; } .vt-b span { font-size: 28px; display: block; } .vt-b small { font-size: 10px; display: block; line-height: 1.2; }
    .vg-person.locked { opacity: .5; }
    .vg-h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .vg-q { display: flex; gap: 10px; padding: 8px 0; border-top: 1px solid rgba(127,127,127,.18); } .vg-q.done { opacity: .6; }
    .vg-face { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; flex: none; background: rgba(255,213,74,.15); display: grid; place-items: center; font-size: 30px; }
    .vg-qb { flex: 1; } .vg-qb p { margin: 2px 0 6px; font-size: 13px; opacity: .88; } .vg-qb small { font-size: 12px; opacity: .8; }
    .vg-person { display: flex; gap: 10px; padding: 10px 0; border-top: 1px solid #2c3350; } .vg-pb { flex: 1; } .vg-pb small { display: block; font-size: 12px; opacity: .7; }
    .vg-hearts { margin: 4px 0; letter-spacing: 2px; } .vg-story { font-size: 13px; background: rgba(255,255,255,.05); border-radius: 10px; padding: 8px; margin: 6px 0; } .vg-story b { display: block; font-size: 11.5px; color: #ffd166; }
    .vg-story.big { font-size: 15px; padding: 14px; }
    .cp-card { background: linear-gradient(135deg, rgba(255,138,101,.2), rgba(124,92,255,.15)); } .cp-ic { font-size: 34px; animation: cpWig 1.6s ease-in-out infinite; } @keyframes cpWig { 50% { transform: rotate(-10deg) scale(1.08); } }
    .cp-modal { text-align: center; }
    .cp-machine { width: 200px; margin: 6px auto; }
    .cp-dome { position: relative; height: 150px; border-radius: 100px 100px 20px 20px; background: radial-gradient(circle at 35% 30%, rgba(255,255,255,.5), rgba(180,220,255,.15) 60%); border: 4px solid #e57373; overflow: hidden; }
    .cp-ball { position: absolute; width: 34px; height: 34px; border-radius: 50%; box-shadow: inset -4px -6px 0 rgba(0,0,0,.18), inset 4px 4px 0 rgba(255,255,255,.4); }
    .cp-base { background: #e57373; border-radius: 0 0 16px 16px; padding: 10px; } .cp-base small { display: block; font-size: 11px; color: #fff; margin-top: 4px; }
    .cp-knob { width: 56px; height: 56px; border-radius: 50%; border: 4px solid #fff; background: #ffd54a; font-weight: 900; font-size: 16px; cursor: pointer; }
    .cp-knob.spin { animation: cpSpin .9s ease-in-out; } @keyframes cpSpin { to { transform: rotate(720deg); } }
    .cp-reveal { margin: 10px auto; padding: 14px; border-radius: 16px; background: radial-gradient(circle, color-mix(in srgb, var(--c) 40%, transparent), transparent 70%); animation: cpPop .6s cubic-bezier(.2,1.6,.4,1); }
    @keyframes cpPop { from { transform: scale(.3); opacity: 0; } }
    .cp-figbig { font-size: 70px; filter: drop-shadow(0 4px 10px var(--c)); } .cp-reveal b { font-size: 18px; } .cp-reveal p { font-size: 13px; opacity: .85; margin: 4px 0; } .cp-reveal small { font-size: 11.5px; opacity: .7; }
    .cp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .cp-fig { border-radius: 10px; padding: 6px 2px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); opacity: .45; } .cp-fig.on { opacity: 1; border-color: var(--c); box-shadow: 0 0 10px color-mix(in srgb, var(--c) 50%, transparent); } .cp-fig.wait { opacity: .9; }
    .cp-fig span { font-size: 26px; } .cp-fig b { display: block; font-size: 10.5px; } .cp-fig small { display: block; font-size: 9.5px; opacity: .7; line-height: 1.25; }
    .pc-card { margin: 12px 0; border-radius: 14px; overflow: hidden; background: #f7efe0; color: #3a2a1a; box-shadow: 0 8px 20px rgba(0,0,0,.35); }
    .pc-pic { position: relative; aspect-ratio: 2.2 / 1; background: linear-gradient(135deg, var(--a), var(--b)); display: grid; place-items: center; overflow: hidden; }
    .pc-pic img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; } .pc-emo { font-size: 64px; filter: drop-shadow(0 4px 10px rgba(0,0,0,.35)); }
    .pc-pic img + .pc-emo { display: none; }
    .pc-stamp { position: absolute; right: 10px; top: 10px; width: 52px; height: 60px; background: #fff; border: 3px dashed #c94; display: grid; place-items: center; font-size: 22px; transform: rotate(6deg); } .pc-stamp small { font-size: 9px; color: #a56; }
    .pc-back { display: flex; gap: 10px; padding: 12px; font-size: 13px; } .pc-l { flex: 1.6; border-right: 1px dashed #c9b28e; padding-right: 10px; } .pc-l p { margin: 6px 0 0; } .pc-note { font-style: italic; color: #8a5a2a; }
    .pc-r { flex: 1; display: flex; flex-direction: column; gap: 3px; } .pc-r small { font-size: 12px; border-bottom: 1px solid #e3d3b5; }
    .pc-r .ov-btn { margin-top: 6px; font-size: 12px; }
  `;
  document.head.appendChild(st);

  (function boot(n) {
    if (!hasDb() || !document.getElementById("fn-today") && !document.getElementById("de-today")) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; }
    const all = () => { loadTop(); loadVil(); loadCap(); loadSeason(); };
    all();
    setInterval(() => { if (!document.hidden) all(); }, 3 * 60 * 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) all(); });
  })(0);

  window.Village = { version: VILLAGE_JS_VERSION, openTomorrow, openMachine, pcHtml, reload: () => { loadTop(); loadVil(); loadCap(); }, pc: PC };
})();
