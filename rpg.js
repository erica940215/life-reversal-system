/* =========================================================
   序光計畫：⚔️ 冒險線（第一階段）
   - 職業：學者 / 戰士 / 守護者 / 遊俠
   - 召喚：用簽到累積的召喚券抽裝備（普通 / 特殊 / 每月限定）
   - 角色屬性：最近 7 天的真實紀錄 ＋ 等級 ＋ 裝備
   只在遊戲模式開著的時候出現。
   資料庫：sql/2026-10-22_冒險.sql
========================================================= */

(function () {

  const RPG_JS_VERSION = "2026-10-23 v9";

  /* 有圖的檔名（放進 img/rpg/ 之後把 key 加進來，沒加的就顯示 emoji） */
  const RPG_IMG = new Set([
    "class:scholar", "class:warrior", "class:guardian", "class:ranger",
    "ui:ticket_normal", "ui:ticket_special", "ui:ticket_limited",
    "gear:wood_sword", "gear:practice_book", "gear:cloth_shirt",
    "gear:straw_bracer", "gear:old_watch", "gear:lucky_cord",
    "gear:starsteel_blade", "gear:sage_staff", "gear:guardian_shield", "gear:moonlight_robe",
    "gear:silverscale_mail", "gear:wind_boots", "gear:time_hourglass",
    "gear:dawn_blade", "gear:star_grimoire", "gear:dawn_plate", "gear:undying_heart", "gear:gale_wings",
    "gear:order_sword", "gear:eternal_book", "gear:order_crown",
    "gear:harvest_scythe", "gear:maple_cape", "gear:harvest_crown",
    "gear:iron_sword", "gear:quill_pen", "gear:hunter_bow", "gear:leather_armor", "gear:apprentice_robe",
    "gear:night_cloak", "gear:focus_earring", "gear:runner_shoes", "gear:oath_ring",
    "gear:dew_rapier", "gear:dew_mail", "gear:dew_wreath", "gear:bulwark_hammer", "gear:bulwark_plate", "gear:bulwark_badge",
    "gear:academy_staff", "gear:academy_robe", "gear:academy_monocle", "gear:meteor_bow", "gear:meteor_cloak", "gear:meteor_earring",
    "gear:astrolabe", "gear:warlord_axe", "gear:oath_aegis", "gear:sky_bow",
    "gear:jack_staff", "gear:witch_hat",
    /* 新裝備（2026-10-24） */
    "gear:starsea_sword", "gear:starsea_garb", "gear:starsea_crown", "gear:mecha_hammer", "gear:mecha_gear_mail",
    "gear:mecha_goggles", "gear:herbal_sickle", "gear:herbal_coat", "gear:herbal_basket", "gear:sakura_katana",
    "gear:sakura_gi", "gear:sakura_men", "gear:library_tome", "gear:library_mantle", "gear:library_key",
    "gear:no_word_tome", "gear:ink_abyss_brush", "gear:dawn_fist", "gear:ruin_shield", "gear:moonlight_candle",
    "gear:oak_heart", "gear:wind_boots", "gear:mist_cloak", "gear:moon_view", "gear:frost_descent",
    "gear:winter_solstice", "gear:spring_equinox", "gear:midnight_lamp", "gear:consecutive_medal", "gear:self_written_badge",
    "gear:failed_souvenir", "gear:paper_lantern_ghost", "gear:talking_skeleton_staff", "gear:under_moon_fox_tail",
    "gear:snow_lantern_staff", "gear:starry_cloak", "gear:snow_crystal", "gear:koi_sword", "gear:red_brocade_robe", "gear:lucky_pouch",
    "boss:sloth_slime", "boss:delay_dragon", "boss:phone_wraith", "boss:fatigue_golem"
    /* 之後有新圖就加進來，沒加的就顯示 emoji */
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
    ["limited", "每月限定", "🌟", "稀有以上，一半機率出這個月的限定裝備"]
  ];

  const RP = { status: null, loading: false, tab: "hero", result: null, error: null, busy: false,
    boss: null, bossError: null, rank: [], hit: null };


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

  /* 三件同一套 → 回傳套裝代號；還有每一套穿了幾件 */
  function setInfo() {
    const eq = (RP.status && RP.status.equip) || {};
    const count = {};
    for (const [slot] of SLOTS) {
      const g = eq[slot] ? gearInfo(eq[slot]) : null;
      if (g && g.set) count[g.set] = (count[g.set] || 0) + 1;
    }
    const full = Object.keys(count).find(k => count[k] >= 3) || null;
    return { full, count };
  }

  function classHit() {
    const eq = (RP.status && RP.status.equip) || {};
    return SLOTS.some(([slot]) => { const g = eq[slot] ? gearInfo(eq[slot]) : null; return g && g.class && g.class === RP.status.class; });
  }

  function applySet(st) {
    const { full } = setInfo();
    const sets = (RP.status.catalog && RP.status.catalog.sets) || {};
    if (!full || !sets[full]) return st;
    const b = sets[full].bonus || {};
    const out = {};
    for (const k of Object.keys(st)) out[k] = Math.round(st[k] * (1 + (b[k] || 0)));
    return out;
  }

  function power(st, cls) {
    const p0 = powerRaw(st, cls);
    const cb = (RP.status && RP.status.catalog && RP.status.catalog.class_bonus) || 0.2;
    return Math.round(classHit() ? p0 * (1 + cb) : p0);
  }

  function powerRaw(st, cls) {
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
      await loadBoss();
    } catch (error) {
      const msg = String(error && (error.message || error.code) || error);
      RP.error = /rpg_status|function|schema cache|PGRST/i.test(msg) ? "setup" : msg;
      console.warn("冒險載入失敗：", error);
    }
    RP.loading = false;
    render();
  }

  async function loadBoss() {
    try {
      const [b, r] = await Promise.all([db.rpc("rpg_boss_status"), db.rpc("rpg_boss_rank")]);
      if (b.error) throw b.error;
      RP.boss = b.data;
      RP.rank = (r && !r.error && r.data) || [];
      RP.bossError = null;
      if (window.TeamGame && !window.TeamGame.state.status) window.TeamGame.reload();
    } catch (error) {
      const msg = String(error && (error.message || error.code) || error);
      RP.bossError = /rpg_boss|function|schema cache|PGRST/i.test(msg) ? "setup" : msg;
    }
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
    const total = applySet({ str: base.str + eq.str, int: base.int + eq.int, vit: base.vit + eq.vit, wil: base.wil + eq.wil });
    const pw = power(total, st0.class);
    const sets = (st0.catalog && st0.catalog.sets) || {};
    const si = setInfo();
    const setLine = Object.entries(si.count).map(([k, n]) => sets[k]
      ? `<div class="rp-setline ${n >= 3 ? "on" : ""}">🧩 ${esc(sets[k].name)} ${n} / 3${n >= 3 ? `：${esc(sets[k].desc)} ✨` : `（湊滿 3 件：${esc(sets[k].desc)}）`}</div>` : "").join("")
      + (classHit() ? `<div class="rp-setline on">👑 職業專屬傳說：戰力 +20% ✨</div>` : "");
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
          ${g ? `<span class="rp-sub">${statLine(gearStats(cur, gearLevel(cur)))}${g.set && sets[g.set] ? `・${esc(sets[g.set].name)}` : ""}${g.class && CLASSES[g.class] ? `・${CLASSES[g.class].name}專屬` : ""}</span>` : ""}
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
      <div class="card rp-card"><h3>裝備</h3><div class="rp-slots">${slots}</div>${setLine}</div>
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
      const cat0 = st0.catalog || {};
      const ym = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }).slice(0, 7);
      const ser = cat0.series && cat0.series[ym];
      const serName = pool === "limited" && ser && cat0.series_name ? `本月系列：${cat0.series_name[ser]}` : "";
      return `<div class="card rp-card rp-pool p-${pool}">
        <div class="rp-pool-top"><span class="rp-emo big">${RPG_IMG.has("ui:ticket_" + pool) ? `<img class="rp-ic big" src="${IMG}ui/ticket_${pool}.webp" alt="">` : emoji}</span>
          <div><h3>${name}</h3><span class="rp-sub">${desc}</span></div>
          <div class="rp-power"><span class="rp-sub">召喚券</span><b>${n}</b></div></div>
        <p class="rp-note">${serName ? `<b>${serName}</b>・` : ""}${rateText}</p>
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

  function bossHtml() {
    if (RP.bossError === "setup") return `<div class="card rp-card"><p class="rp-note">⚠️ 每週王的資料庫還沒設定：到 Supabase 的 SQL Editor 執行 <b>sql/2026-10-22_每週王.sql</b>。</p></div>`;
    if (RP.bossError) return `<div class="card rp-card"><p class="rp-note">載入失敗：${esc(RP.bossError)}</p></div>`;
    const b = RP.boss;
    if (!b) return `<div class="card rp-card"><p class="rp-note">載入中…</p></div>`;
    if (b.need_class) return `<div class="card rp-card"><p class="rp-note">先到「角色」選一個職業，才能挑戰每週王。</p></div>`;

    const run = b.run;
    const info = (b.bosses || []).find(x => x.key === run.boss_key) || { name: run.boss_key, emoji: "👹", weak: "", desc: "" };
    const left = Math.max(0, run.hp - run.dmg);
    const pct = Math.max(0, Math.min(100, Math.round(left / run.hp * 100)));
    const killed = !!run.killed_at;
    const ts = window.TeamGame && window.TeamGame.state && window.TeamGame.state.status;
    const inTeam = !!(ts && ts.team);
    const raidAlive = inTeam && ts.raid && !ts.raid.killed_at;
    const a = b.attacks || {};
    const remain = Math.max(0, (a.total || 0) - (a.used || 0));
    const weak = CLASSES[info.weak];
    const myWeak = RP.status && RP.status.class === info.weak;
    const end = new Date(b.week_end + "T02:00:00+08:00");
    const days = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
    const pic = RPG_IMG.has("boss:" + run.boss_key)
      ? `<img class="rp-boss-img" src="${IMG}boss/${run.boss_key}.webp" alt="">`
      : `<span class="rp-boss-emo">${info.emoji}</span>`;

    const chk = (ok, text) => `<li class="${ok ? "ok" : ""}">${ok ? "✅" : "⬜"} ${text}</li>`;
    const hit = RP.hit ? `<div class="rp-hit ${RP.hit.crit ? "crit" : ""}">${RP.hit.crit ? "💥 爆擊！" : "⚔️"} 造成 <b>${RP.hit.dmg}</b> 傷害${RP.hit.weak ? "（弱點 ×1.3）" : ""}・+${RP.hit.gold} 金幣
        ${RP.hit.world_dmg ? `<br>🌍 世界王也受到 ${RP.hit.world_dmg} 傷害${RP.hit.world_killed ? "，全服打倒了！" : ""}` : ""}
        ${RP.hit.cheer ? `<br>📣 加油加成 +${RP.hit.cheer * 10}%` : ""}
        ${RP.hit.raid_dmg ? `<br>🐲 團隊王也受到 ${RP.hit.raid_dmg} 傷害${RP.hit.raid_killed ? "，打倒了！全隊拿到團隊寶箱 🎉" : ""}` : ""}
        ${RP.hit.chest ? `<br>🎁 掉了一個${{ chest_wood: "木寶箱", chest_iron: "鐵寶箱", chest_gold: "金寶箱", chest_star: "星光寶箱" }[RP.hit.chest] || "寶箱"}！到「驚喜」打開` : ""}
        ${RP.hit.killed ? `<br>🎉 打倒了！獲得特殊召喚券 1 張、星屑 ${(RP.hit.reward || {}).stardust || 0}、金寶箱 1 個` : ""}</div>` : "";

    const rank = (RP.rank || []).map((r, i) => `<div class="rp-rank ${r.me ? "me" : ""}"><span class="rp-rank-n">${i + 1}</span>
        ${window.FunGame && window.FunGame.avatar ? window.FunGame.avatar(r.class, r.frame, 40) : ""}<span class="rp-rank-name">${r.class && CLASSES[r.class] ? CLASSES[r.class].emoji : "❔"} ${esc(r.name)}${r.me ? "（你）" : ""}${window.GrowthGame ? window.GrowthGame.titleChip(r.title) : ""}</span>
        <span class="rp-sub">${r.tier ? `第 ${r.tier} 階` : "還沒出擊"}${r.killed ? "・已打倒" : ""}</span><b>${r.dmg}</b></div>`).join("");

    const hits = (b.hits || []).map(h => `<span class="rp-chip ${h.crit ? "crit" : ""}">${h.day.slice(5).replace("-", "/")} ${h.crit ? "💥" : ""}${h.dmg}</span>`).join("");

    const last = b.last ? `<p class="rp-note">上週：${esc(((b.bosses || []).find(x => x.key === b.last.boss_key) || {}).name || "")} 第 ${b.last.tier} 階・${b.last.killed_at ? "✅ 打倒了" : `打了 ${b.last.dmg} / ${b.last.hp}`}</p>` : "";

    return `<div class="card rp-card rp-boss ${killed ? "dead" : ""}">
        <div class="rp-boss-top">${pic}<div><h3>${esc(info.name)}・第 ${run.tier} 階</h3>
          <span class="rp-sub">弱點職業：${weak ? weak.emoji + " " + weak.name : "無"}${myWeak ? "（你剋它！）" : ""}・還剩 ${days} 天</span></div></div>
        <p class="rp-note">${esc(info.desc)}</p>
        <div class="rp-hp"><div class="rp-hp-bar" style="width:${pct}%"></div><span>${killed ? "已打倒 🎉" : `${left} / ${run.hp}`}</span></div>
        ${hit}
        <button type="button" class="btn btn-primary rp-attack" data-rp="attack" ${(killed && !raidAlive) || !remain ? "disabled" : ""}>
          ${killed && !raidAlive ? "這週打倒了，下週一出新的王" : !remain ? "今天的出擊次數用完了"
            : killed ? `🐲 出擊團隊王（今天還有 ${remain} 次）` : `⚔️ 出擊（今天還有 ${remain} 次）`}</button>
        ${ts && ts.cheers_unused ? `<p class="rp-note">📣 有 ${ts.cheers_unused} 個好友幫你加油，下一次出擊傷害 +${Math.min(ts.cheers_unused, 3) * 10}%</p>` : ""}
        <p class="rp-note">一次大約打出你的戰力 ${(b.power || {}).power || 0} 點傷害。今天的出擊次數：</p>
        <ul class="rp-checks">${chk(true, "每天基本 1 次")}${chk(a.focus_min >= 60, `專注滿 60 分（今天 ${a.focus_min || 0} 分）`)}
          ${chk(a.tasks >= 3, `完成 3 個任務（今天 ${a.tasks || 0} 個）`)}${chk(!!a.exercise, "今天有運動紀錄")}${a.fortune ? chk(true, "🎋 今天抽到中吉") : ""}</ul>
        ${hits ? `<div class="rp-chips">${hits}</div>` : ""}
        ${last}
        <p class="rp-note">每次出擊 +5 金幣，25% 掉寶箱。打倒王：金幣 ${150 + 50 * run.tier}、特殊召喚券 1 張、星屑 ${3 + run.tier}、金寶箱 1 個，下週的王升一階。</p></div>
      <div class="card rp-card"><h3>本週好友傷害排行</h3>${rank || `<p class="rp-note">加好友之後就能一起比。</p>`}</div>`;
  }

  function bookHtml() {
    const gear = (RP.status.catalog && RP.status.catalog.gear) || {};
    const sets = (RP.status.catalog && RP.status.catalog.sets) || {};
    const keys = Object.keys(gear);
    const got = keys.filter(k => gearLevel(k) > 0).length;
    const groups = TIER_ORDER.map(t => {
      const ks = keys.filter(k => gear[k].tier === t);
      if (!ks.length) return "";
      return `<div class="rp-sec">${TIER_NAME[t]}</div><div class="rp-grid">${ks.map(k => {
        const lv = gearLevel(k);
        const g = gear[k];
        return `<div class="rp-gear t-${t} ${lv ? "" : "locked"}">${gearIcon(k, true)}<b>${lv ? esc(g.name) : "？？？"}</b>
          <span class="rp-sub">${lv ? `Lv${lv}・${statLine(gearStats(k, lv))}` : (g.pool === "limited" ? "限定" : SLOTS.find(s => s[0] === g.slot)[1])}</span>
          ${g.set && sets[g.set] ? `<span class="rp-mini">${esc(sets[g.set].name)}</span>` : ""}${g.class && CLASSES[g.class] ? `<span class="rp-mini cls">${CLASSES[g.class].name}專屬</span>` : ""}</div>`;
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

    const tabs = [["hero", "角色"], ["boss", "每週王"], ["team", "小隊"], ["journey", "旅程"], ["fun", "驚喜"], ["summon", "召喚"], ["book", "圖鑑"]];
    const body = RP.tab === "summon" ? summonHtml() : RP.tab === "book" ? bookHtml()
      : RP.tab === "boss" ? (window.StudyGame ? window.StudyGame.worldHtml() : "") + bossHtml()
      : RP.tab === "fun" ? (window.EventGame ? window.EventGame.halloweenHtml() : "") + (window.FunGame ? window.FunGame.html() : "")
      : RP.tab === "team" ? (window.TeamGame ? window.TeamGame.html() : "") + (window.GrowthGame ? window.GrowthGame.betsHtml() : "")
      : RP.tab === "journey" ? (window.GrowthGame ? window.GrowthGame.html() : "")
      : heroHtml() + (window.StudyGame && RP.status && RP.status.class ? window.StudyGame.skillHtml() : "")
        + (window.EventGame && RP.status && RP.status.class ? window.EventGame.journalHtml() : "");
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
    if (act === "attack") {
      call("rpg_boss_attack", {}, data => {
        RP.hit = data;
        toast(data.killed ? "🎉 打倒每週王了！" : `${data.crit ? "💥 爆擊！" : "⚔️"} 造成 ${data.dmg} 傷害${data.chest ? "・掉了寶箱！" : ""}`);
        if (window.FunGame) window.FunGame.reload();
        if (window.TeamGame) window.TeamGame.reload();
        if (window.StudyGame) window.StudyGame.reloadWorld();
      });
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
      .rp-tab { flex: 1; min-width: 0; padding: 9px 0; font-size: 12px; border-radius: 12px; border: 1px solid rgba(127,127,127,.25); background: transparent; color: inherit; font-weight: 700; cursor: pointer; }
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
      .rp-boss-top { display: flex; align-items: center; gap: 12px; }
      .rp-boss-top > div { flex: 1; min-width: 0; }
      .rp-boss-emo { font-size: 56px; width: 76px; height: 76px; display: inline-flex; align-items: center; justify-content: center; animation: rp-bob 2.4s ease-in-out infinite; }
      .rp-boss-img { width: 112px; height: 112px; object-fit: contain; animation: rp-bob 2.4s ease-in-out infinite; }
      .rp-boss.dead .rp-boss-emo, .rp-boss.dead .rp-boss-img { filter: grayscale(1); opacity: .5; animation: none; }
      @keyframes rp-bob { 50% { transform: translateY(-5px); } }
      .rp-hp { position: relative; height: 22px; border-radius: 99px; background: rgba(127,127,127,.18); overflow: hidden; margin: 10px 0; }
      .rp-hp-bar { height: 100%; background: linear-gradient(90deg, #ef5350, #ff8a65); transition: width .5s; }
      .rp-hp span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; }
      .rp-attack { width: 100%; margin: 6px 0; padding: 12px; font-size: 16px; }
      .rp-hit { padding: 10px; border-radius: 12px; background: rgba(108,75,216,.12); margin: 6px 0; font-size: 14px; }
      .rp-hit.crit { background: rgba(255,167,38,.18); }
      .rp-checks { list-style: none; padding: 0; margin: 4px 0; font-size: 13px; display: grid; gap: 3px; }
      .rp-checks li { opacity: .65; } .rp-checks li.ok { opacity: 1; font-weight: 700; }
      .rp-chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 8px 0; }
      .rp-chip { font-size: 12px; padding: 2px 8px; border-radius: 99px; background: rgba(127,127,127,.12); }
      .rp-chip.crit { background: rgba(255,167,38,.25); font-weight: 700; }
      .rp-rank { display: flex; align-items: center; gap: 8px; padding: 8px 6px; border-bottom: 1px solid rgba(127,127,127,.15); }
      .rp-rank.me { background: rgba(108,75,216,.08); border-radius: 10px; }
      .rp-rank-n { width: 22px; text-align: center; font-weight: 800; opacity: .7; }
      .rp-rank-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .rp-setline { margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: rgba(127,127,127,.08); font-size: 13px; opacity: .75; }
      .rp-setline.on { opacity: 1; font-weight: 700; background: rgba(108,75,216,.14); }
      .rp-mini { font-size: 10px; padding: 0 6px; border-radius: 99px; background: rgba(108,75,216,.15); }
      .rp-mini.cls { background: rgba(239,83,80,.18); }
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
