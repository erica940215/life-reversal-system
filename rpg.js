/* =========================================================
   序光計畫：⚔️ 冒險線（第一階段）
   - 職業：學者 / 戰士 / 守護者 / 遊俠
   - 召喚：用簽到累積的召喚券抽裝備（普通 / 特殊 / 每月限定）
   - 角色屬性：最近 7 天的真實紀錄 ＋ 等級 ＋ 裝備
   只在遊戲模式開著的時候出現。
   資料庫：sql/2026-10-22_冒險.sql
========================================================= */

(function () {

  const RPG_JS_VERSION = "2026-10-22 v1";

  /* 有圖的檔名（放進 img/rpg/ 之後把 key 加進來，沒加的就顯示 emoji） */
  const RPG_IMG = new Set([
    /* 例如 "gear:wood_sword", "class:scholar", "ui:ticket_normal" */
  ]);
  const IMG = "img/rpg/";

  const CLASSES = {
    scholar:  { name: "學者",   emoji: "📚", main: "智力", desc: "專注時數的傷害最高。適合常常讀書、專注工作的人。" },
    warrior:  { name: "戰士",   emoji: "⚔️", main: "力量・體力", desc: "完成任務和運動的傷害最高。適合行動派。" },
    guardian: { name: "守護者", emoji: "🛡️", main: "意志", desc: "習慣打卡和連續簽到的傷害最高，之後組隊能幫隊友加成。" },
    ranger:   { name: "遊俠",   emoji: "🏹", main: "全部", desc: "每一種行動都加一點。適合什麼都做一點的人。" }
  };

  const STATS = [
    ["str", "力量", "💪", "最近 7 天完成的任務"],
    ["int", "智力", "🧠", "最近 7 天的專注時間"],
    ["vit", "體力", "❤️", "最近 7 天的運動和睡眠紀錄"],
    ["wil", "意志", "🔥", "最近 7 天的習慣打卡和連續簽到"]
  ];

  const SLOTS = [["weapon", "武器"], ["armor", "防具"], ["accessory", "飾品"]];

  const TIER_NAME = { c: "普通", r: "精良", l: "稀有", x: "史詩", s: "傳說" };
  const TIER_ORDER = ["s", "x", "l", "r", "c"];

  const POOLS = [
    ["normal", "普通召喚", "🎫", "什麼都可能出，十連保底一件精良以上"],
    ["special", "特殊召喚", "🎟️", "精良以上，稀有和史詩機率高"],
    ["limited", "每月限定", "🌟", "稀有以上，一半機率出限定裝備"]
  ];

  const RP = { status: null, loading: false, tab: "hero", result: null, error: null, busy: false };


  /* ---------- 小工具 ---------- */

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = msg => (typeof showToast === "function" ? showToast(msg) : alert(msg));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const gameOn = () => (typeof gameIsOn === "function" ? gameIsOn() : document.body.classList.contains("game-mode-on"));

  function gearInfo(key) {
    const cat = RP.status && RP.status.catalog;
    return (cat && cat.gear && cat.gear[key]) || null;
  }

  function gearLevel(key) {
    const g = (RP.status && RP.status.gear || []).find(x => x.key === key);
    return g ? g.level : 0;
  }

  function gearIcon(key, big = false) {
    const g = gearInfo(key);
    if (RPG_IMG.has("gear:" + key)) return `<img class="rp-ic ${big ? "big" : ""}" src="${IMG}gear/${key}.webp" alt="">`;
    return `<span class="rp-emo ${big ? "big" : ""}">${g ? g.emoji : "❔"}</span>`;
  }

  function classIcon(cls, big = false) {
    if (RPG_IMG.has("class:" + cls)) return `<img class="rp-ic ${big ? "big" : ""}" src="${IMG}class/${cls}.webp" alt="">`;
    return `<span class="rp-emo ${big ? "big" : ""}">${CLASSES[cls].emoji}</span>`;
  }

  /* 裝備每升 1 級，數值 +20% */
  function gearStats(key, level) {
    const g = gearInfo(key);
    const out = { str: 0, int: 0, vit: 0, wil: 0 };
    if (!g || !level) return out;
    for (const [k, v] of Object.entries(g.stat || {})) out[k] = Math.round(v * (1 + 0.2 * (level - 1)));
    return out;
  }

  function statLine(stat) {
    return STATS.filter(([k]) => stat[k]).map(([k, n]) => `${n} +${stat[k]}`).join("・");
  }


  /* ---------- 屬性和戰力 ---------- */

  function baseStats() {
    const s = RP.status.src || {};
    const lv = RP.status.level || 1;
    return {
      str: (s.tasks || 0) * 5 + lv * 2,
      int: Math.floor((s.focus_min || 0) / 6) + lv * 2,
      vit: Math.floor((s.exercise_min || 0) / 3) + (s.sleep_nights || 0) * 2 + lv * 2,
      wil: (s.habits || 0) * 3 + Math.min(s.streak || 0, 30) * 2 + lv * 2
    };
  }

  function equipStats() {
    const out = { str: 0, int: 0, vit: 0, wil: 0 };
    const eq = RP.status.equip || {};
    for (const [slot] of SLOTS) {
      const key = eq[slot];
      if (!key) continue;
      const st = gearStats(key, gearLevel(key));
      for (const k of Object.keys(out)) out[k] += st[k];
    }
    return out;
  }

  function power(st, cls) {
    const sum = st.str + st.int + st.vit + st.wil;
    if (cls === "scholar") return Math.round(sum + st.int);
    if (cls === "warrior") return Math.round(sum + (st.str + st.vit) * 0.5);
    if (cls === "guardian") return Math.round(sum + st.wil);
    if (cls === "ranger") return Math.round(sum * 1.25);
    return sum;
  }


  /* ---------- 資料 ---------- */

  async function load() {
    if (!hasDb()) return;
    RP.loading = true;
    try {
      const { data, error } = await db.rpc("rpg_status");
      if (error) throw error;
      RP.status = data;
      RP.error = null;
    } catch (error) {
      const msg = String(error && (error.message || error.code) || error);
      RP.error = /rpg_status|function|schema cache|PGRST/i.test(msg) ? "setup" : msg;
      console.warn("冒險載入失敗：", error);
    }
    RP.loading = false;
    render();
  }

  async function call(name, args, after) {
    if (RP.busy) return;
    RP.busy = true;
    try {
      const { data, error } = await db.rpc(name, args);
      if (error) { toast("❌ " + error.message); return; }
      if (after) after(data);
      await load();
    } finally {
      RP.busy = false;
    }
  }


  /* ---------- 畫面 ---------- */

  function heroHtml() {
    const st0 = RP.status;
    if (!st0.class) {
      return `<div class="card rp-card"><h3>選一個職業</h3><p class="rp-note">職業決定哪一種真實行動最強。第一次選免費，之後每 7 天可以換一次。</p>
        <div class="rp-classes">${Object.entries(CLASSES).map(([k, c]) => `
          <button type="button" class="rp-class" data-rp="class" data-v="${k}">${classIcon(k, true)}
            <b>${c.name}</b><span class="rp-sub">主屬性：${c.main}</span><span class="rp-note">${c.desc}</span></button>`).join("")}</div></div>`;
    }

    const cls = CLASSES[st0.class];
    const base = baseStats();
    const eq = equipStats();
    const total = { str: base.str + eq.str, int: base.int + eq.int, vit: base.vit + eq.vit, wil: base.wil + eq.wil };
    const pw = power(total, st0.class);
    const src = st0.src || {};
    const srcText = {
      str: `完成 ${src.tasks || 0} 個任務`,
      int: `專注 ${Math.floor((src.focus_min || 0) / 60)} 小時 ${(src.focus_min || 0) % 60} 分`,
      vit: `運動 ${src.exercise_min || 0} 分・睡眠紀錄 ${src.sleep_nights || 0} 晚`,
      wil: `習慣打卡 ${src.habits || 0} 次・連續簽到 ${src.streak || 0} 天`
    };

    const stats = STATS.map(([k, n, e]) => `<div class="rp-stat"><span class="rp-stat-n">${e} ${n}</span><b>${total[k]}</b>
      <span class="rp-sub">${srcText[k]}${eq[k] ? `・裝備 +${eq[k]}` : ""}</span></div>`).join("");

    const owned = st0.gear || [];
    const slots = SLOTS.map(([slot, label]) => {
      const cur = (st0.equip || {})[slot];
      const opts = owned.filter(g => (gearInfo(g.key) || {}).slot === slot)
        .sort((a, b) => TIER_ORDER.indexOf(gearInfo(a.key).tier) - TIER_ORDER.indexOf(gearInfo(b.key).tier));
      const g = cur ? gearInfo(cur) : null;
      return `<div class="rp-slot ${g ? "t-" + g.tier : ""}">
        <div class="rp-slot-art">${cur ? gearIcon(cur) : `<span class="rp-emo dim">＋</span>`}</div>
        <div class="rp-slot-body"><span class="rp-sub">${label}</span>
          <b>${g ? `${esc(g.name)} Lv${gearLevel(cur)}` : "沒有裝備"}</b>
          ${g ? `<span class="rp-sub">${statLine(gearStats(cur, gearLevel(cur)))}</span>` : ""}
          <select data-rp="equip" data-slot="${slot}" ${opts.length ? "" : "disabled"}>
            <option value="">${opts.length ? "（卸下）" : "還沒有這類裝備"}</option>
            ${opts.map(o => `<option value="${o.key}" ${o.key === cur ? "selected" : ""}>[${TIER_NAME[gearInfo(o.key).tier]}] ${esc(gearInfo(o.key).name)} Lv${o.level}</option>`).join("")}
          </select></div></div>`;
    }).join("");

    const next = st0.class_set_at ? new Date(new Date(st0.class_set_at).getTime() + 7 * 86400000) : null;
    const canChange = !next || next.getTime() <= Date.now();

    return `<div class="card rp-card rp-hero">
        <div class="rp-hero-top">${classIcon(st0.class, true)}
          <div><h3>${cls.name}・Lv${st0.level}</h3><span class="rp-sub">主屬性：${cls.main}</span></div>
          <div class="rp-power"><span class="rp-sub">戰力</span><b>${pw}</b></div></div>
        <p class="rp-note">${cls.desc}</p>
        <div class="rp-stats">${stats}</div>
        <p class="rp-note">屬性看的是最近 7 天的真實紀錄，越常做事角色越強；一段時間沒做，屬性就會慢慢掉下來。</p>
      </div>
      <div class="card rp-card"><h3>裝備</h3><div class="rp-slots">${slots}</div></div>
      <div class="card rp-card"><h3>換職業</h3>
        <p class="rp-note">${canChange ? "現在可以換職業。換了之後 7 天內不能再換。" : `下次可以換：${next.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}</p>
        <div class="rp-row">${Object.entries(CLASSES).filter(([k]) => k !== st0.class).map(([k, c]) =>
          `<button type="button" class="btn btn-small" data-rp="class" data-v="${k}" ${canChange ? "" : "disabled"}>${c.emoji} ${c.name}</button>`).join("")}</div></div>`;
  }

  function summonHtml() {
    const st0 = RP.status;
    const t = st0.tickets || {};
    const rates = (st0.catalog && st0.catalog.rates) || {};

    const pools = POOLS.map(([pool, name, emoji, desc]) => {
      const n = t[pool] || 0;
      const r = rates[pool] || {};
      const rateText = TIER_ORDER.slice().reverse().filter(k => r[k]).map(k => `${TIER_NAME[k]} ${r[k]}%`).join("・");
      return `<div class="card rp-card rp-pool p-${pool}">
        <div class="rp-pool-top"><span class="rp-emo big">${RPG_IMG.has("ui:ticket_" + pool) ? `<img class="rp-ic big" src="${IMG}ui/ticket_${pool}.webp" alt="">` : emoji}</span>
          <div><h3>${name}</h3><span class="rp-sub">${desc}</span></div>
          <div class="rp-power"><span class="rp-sub">召喚券</span><b>${n}</b></div></div>
        <p class="rp-note">${rateText}</p>
        <div class="rp-row"><button type="button" class="btn btn-primary btn-small" data-rp="summon" data-pool="${pool}" data-n="1" ${n >= 1 ? "" : "disabled"}>召喚 1 次</button>
          <button type="button" class="btn btn-primary btn-small" data-rp="summon" data-pool="${pool}" data-n="10" ${n >= 10 ? "" : "disabled"}>召喚 10 次</button></div></div>`;
    }).join("");

    let result = "";
    if (RP.result) {
      const list = RP.result.results || [];
      result = `<div class="card rp-card"><h3>召喚結果</h3><div class="rp-grid">${list.map(x => {
        const g = gearInfo(x.key) || {};
        const tag = x.result === "new" ? "NEW" : x.result === "up" ? `升到 Lv${x.level}` : `+${x.gold} 金幣`;
        return `<div class="rp-gear t-${x.tier}">${gearIcon(x.key, true)}<b>${esc(g.name || x.key)}</b><span class="rp-tag">${tag}</span></div>`;
      }).join("")}</div>${RP.result.gold ? `<p class="rp-note">滿級的重複裝備換成 ${RP.result.gold} 金幣</p>` : ""}</div>`;
    }

    return result + pools + `<p class="rp-note rp-pad">召喚券從每日簽到拿：連續簽到每 3 天 1 張普通、每 7 天 1 張特殊；每月累計簽到 7 天、全勤會給限定券。重複抽到的裝備會升級（最高 Lv5），滿級後換成金幣。</p>`;
  }

  function bookHtml() {
    const gear = (RP.status.catalog && RP.status.catalog.gear) || {};
    const keys = Object.keys(gear);
    const got = keys.filter(k => gearLevel(k) > 0).length;
    const groups = TIER_ORDER.map(t => {
      const ks = keys.filter(k => gear[k].tier === t);
      if (!ks.length) return "";
      return `<div class="rp-sec">${TIER_NAME[t]}</div><div class="rp-grid">${ks.map(k => {
        const lv = gearLevel(k);
        const g = gear[k];
        return `<div class="rp-gear t-${t} ${lv ? "" : "locked"}">${gearIcon(k, true)}<b>${lv ? esc(g.name) : "？？？"}</b>
          <span class="rp-sub">${lv ? `Lv${lv}・${statLine(gearStats(k, lv))}` : (g.pool === "limited" ? "限定" : SLOTS.find(s => s[0] === g.slot)[1])}</span></div>`;
      }).join("")}</div>`;
    }).join("");
    return `<div class="card rp-card"><h3>裝備圖鑑 ${got} / ${keys.length}</h3>${groups}</div>`;
  }

  function render() {
    const page = document.querySelector('.page[data-page="rpg"]');
    if (!page) return;
    const root = page.querySelector("#rp-root");
    if (!root) return;

    if (!hasDb()) { root.innerHTML = `<div class="card rp-card"><p class="rp-note">登入之後才能冒險。</p></div>`; return; }
    if (RP.error === "setup") {
      root.innerHTML = `<div class="card rp-card"><p class="rp-note">⚠️ 冒險的資料庫還沒設定：到 Supabase 的 SQL Editor 執行 <b>sql/2026-10-22_冒險.sql</b>，重新整理網頁之後就能用。</p></div>`;
      return;
    }
    if (RP.error) { root.innerHTML = `<div class="card rp-card"><p class="rp-note">載入失敗：${esc(RP.error)}</p></div>`; return; }
    if (!RP.status) { root.innerHTML = `<div class="card rp-card"><p class="rp-note">冒險載入中…</p></div>`; return; }

    const tabs = [["hero", "角色"], ["summon", "召喚"], ["book", "圖鑑"]];
    const body = RP.tab === "summon" ? summonHtml() : RP.tab === "book" ? bookHtml() : heroHtml();
    root.innerHTML = `<div class="rp-tabs">${tabs.map(([k, l]) =>
      `<button type="button" class="rp-tab ${RP.tab === k ? "on" : ""}" data-rp="tab" data-v="${k}">${l}</button>`).join("")}</div>${body}
      <p class="rp-ver">冒險 ${RPG_JS_VERSION}</p>`;
  }


  /* ---------- 點擊 ---------- */

  function onClick(e) {
    const el = e.target.closest("[data-rp]");
    if (!el || el.tagName === "SELECT") return;
    const act = el.dataset.rp;
    if (act === "tab") { RP.tab = el.dataset.v; render(); return; }
    if (act === "class") {
      const c = CLASSES[el.dataset.v];
      if (RP.status.class && !confirm(`確定換成「${c.name}」？之後 7 天內不能再換。`)) return;
      call("rpg_set_class", { p_class: el.dataset.v }, () => toast(`${c.emoji} 你現在是${c.name}了`));
      return;
    }
    if (act === "summon") {
      const pool = el.dataset.pool;
      const n = Number(el.dataset.n);
      call("rpg_summon", { p_pool: pool, p_count: n }, data => {
        RP.result = data;
        const best = (data.results || []).reduce((b, x) => TIER_ORDER.indexOf(x.tier) < TIER_ORDER.indexOf(b) ? x.tier : b, "c");
        toast(`🎉 召喚 ${n} 次，最好的是${TIER_NAME[best]}`);
      });
    }
  }

  function onChange(e) {
    const el = e.target.closest('select[data-rp="equip"]');
    if (!el) return;
    call("rpg_equip", { p_slot: el.dataset.slot, p_key: el.value || null }, () => toast(el.value ? "🧥 換好裝備了" : "卸下裝備了"));
  }


  /* ---------- 接上網站：分頁、遊戲模式 ---------- */

  function injectStyle() {
    if (document.getElementById("rp-style")) return;
    const css = document.createElement("style");
    css.id = "rp-style";
    css.textContent = `
      body:not(.game-mode-on) .rpg-tab { display: none !important; }
      .page[data-page="rpg"] .rp-off { display: none; }
      .page[data-page="rpg"]:not(.rp-on) .rp-off { display: block; }
      .page[data-page="rpg"]:not(.rp-on) #rp-root { display: none; }
      .rp-tabs { display: flex; gap: 6px; margin: 4px 0 12px; }
      .rp-tab { flex: 1; padding: 9px 0; border-radius: 12px; border: 1px solid rgba(127,127,127,.25); background: transparent; color: inherit; font-weight: 700; cursor: pointer; }
      .rp-tab.on { background: #6c4bd8; color: #fff; border-color: #6c4bd8; }
      .rp-card h3 { margin: 0 0 6px; }
      .rp-note { font-size: 13px; opacity: .78; margin: 6px 0; line-height: 1.55; }
      .rp-pad { padding: 0 6px; }
      .rp-sub { font-size: 12px; opacity: .72; }
      .rp-ver { text-align: center; font-size: 11px; opacity: .45; margin: 8px 0 20px; }
      .rp-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
      .rp-emo { font-size: 26px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; }
      .rp-emo.big { font-size: 38px; width: 56px; height: 56px; }
      .rp-emo.dim { opacity: .35; }
      .rp-ic { width: 40px; height: 40px; object-fit: contain; }
      .rp-ic.big { width: 56px; height: 56px; }
      .rp-classes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
      .rp-class { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 10px; border-radius: 14px; border: 1px solid rgba(127,127,127,.25); background: rgba(127,127,127,.06); color: inherit; cursor: pointer; text-align: center; }
      .rp-class:hover { border-color: #6c4bd8; }
      .rp-hero-top, .rp-pool-top { display: flex; align-items: center; gap: 12px; }
      .rp-hero-top > div:nth-child(2), .rp-pool-top > div:nth-child(2) { flex: 1; min-width: 0; }
      .rp-power { text-align: right; display: flex; flex-direction: column; }
      .rp-power b { font-size: 26px; color: #6c4bd8; }
      .rp-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
      .rp-stat { display: flex; flex-direction: column; padding: 10px; border-radius: 12px; background: rgba(127,127,127,.08); }
      .rp-stat b { font-size: 22px; }
      .rp-stat-n { font-size: 13px; font-weight: 700; }
      .rp-slots { display: flex; flex-direction: column; gap: 8px; }
      .rp-slot { display: flex; gap: 10px; align-items: center; padding: 10px; border-radius: 12px; background: rgba(127,127,127,.08); border-left: 4px solid rgba(127,127,127,.3); }
      .rp-slot-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .rp-slot select { margin-top: 4px; max-width: 100%; padding: 6px; border-radius: 8px; }
      .rp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; margin: 6px 0 4px; }
      .rp-gear { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 10px 6px; border-radius: 12px; background: rgba(127,127,127,.08); text-align: center; border-top: 4px solid rgba(127,127,127,.3); font-size: 13px; }
      .rp-gear.locked { opacity: .45; filter: grayscale(.8); }
      .rp-tag { font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 99px; background: #6c4bd8; color: #fff; }
      .rp-sec { font-weight: 800; margin: 12px 0 2px; }
      .t-c { border-color: #8bc34a !important; } .t-r { border-color: #42a5f5 !important; } .t-l { border-color: #ab47bc !important; }
      .t-x { border-color: #ffa726 !important; } .t-s { border-color: #ef5350 !important; }
      .rp-gear.t-s, .rp-slot.t-s { box-shadow: 0 0 0 1px rgba(239,83,80,.35), 0 0 12px rgba(239,83,80,.25); }
      .rp-gear.t-x, .rp-slot.t-x { box-shadow: 0 0 10px rgba(255,167,38,.25); }
      @media (max-width: 420px) { .rp-classes, .rp-stats { grid-template-columns: 1fr 1fr; } }
    `;
    document.head.appendChild(css);
  }

  function ensurePage() {
    injectStyle();

    if (!document.querySelector('.tab-btn[data-page="rpg"]')) {
      const nav = document.getElementById("tab-nav");
      if (nav) {
        const btn = document.createElement("button");
        btn.className = "tab-btn rpg-tab";
        btn.dataset.page = "rpg";
        btn.type = "button";
        btn.innerHTML = '<span class="tab-icon">⚔️</span><span class="tab-label">冒險</span>';
        btn.addEventListener("click", () => showPage("rpg"));
        const after = nav.querySelector('.tab-btn[data-page="farm"]') || nav.querySelector('.tab-btn[data-page="life"]');
        if (after) after.after(btn);
        else nav.appendChild(btn);
      }
    }

    let page = document.querySelector('.page[data-page="rpg"]');
    if (!page) {
      const container = document.querySelector("#app-section > .container");
      if (!container) return null;
      page = document.createElement("div");
      page.className = "page";
      page.dataset.page = "rpg";
      const farm = container.querySelector('.page[data-page="farm"]') || container.querySelector('.page[data-page="life"]');
      if (farm) farm.after(page);
      else container.appendChild(page);
      page.innerHTML = `
        <div class="rp-off card"><h2>⚔️ 冒險</h2><p>到「今日」頁打開 🎲 遊戲模式，就能冒險。</p>
          <button type="button" class="btn btn-primary" onclick="showPage('today')">回今日</button></div>
        <div id="rp-root"></div>`;
      page.addEventListener("click", onClick);
      page.addEventListener("change", onChange);
    }

    if (typeof PAGES !== "undefined" && Array.isArray(PAGES) && !PAGES.includes("rpg")) PAGES.push("rpg");
    return page;
  }

  function syncVisibility() {
    const page = ensurePage();
    const on = gameOn() && hasDb();
    const btn = document.querySelector('.tab-btn[data-page="rpg"]');
    if (btn) btn.hidden = !on;
    if (page) page.classList.toggle("rp-on", on);
  }

  if (typeof window.renderGameModeToggle === "function") {
    const baseToggle = window.renderGameModeToggle;
    window.renderGameModeToggle = function () {
      const result = baseToggle.apply(this, arguments);
      try { syncVisibility(); } catch (e) { console.warn(e); }
      return result;
    };
  }

  if (typeof window.applyPage === "function") {
    const baseApply = window.applyPage;
    window.applyPage = function (name) {
      const result = baseApply.apply(this, arguments);
      if (name === "rpg") setTimeout(() => { syncVisibility(); if (gameOn()) { render(); load(); } }, 0);
      return result;
    };
  }

  function boot() {
    try { syncVisibility(); } catch (e) { console.warn(e); }
    /* 網址直接是 #rpg 的時候，等分頁加進去後再切一次 */
    if (location.hash === "#rpg" && typeof applyPage === "function") setTimeout(() => applyPage("rpg"), 0);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.RpgGame = { version: RPG_JS_VERSION, reload: load, render, state: RP };

})();
