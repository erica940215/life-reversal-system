/* =========================================================
   序光計畫：📊 週回顧＋🏆 收藏總表
   - 右上角「📊」打開
   - 週回顧：這週每天專注幾分鐘、任務完成率、習慣、簽到；跟上週比；各科目專注時間
   - 收藏總表：農場、冒險、末世的收藏進度一次看完
   資料庫：sql/2026-10-30_通知與回顧.sql（life_week、life_collection）
========================================================= */

(function () {

  "use strict";

  const OV = { open: false, tab: "week", offset: 0, week: null, coll: null, err: null };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const DAY = ["一", "二", "三", "四", "五", "六", "日"];
  const hm = m => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${m}m`;
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const delta = (now, prev, unit = "") => {
    if (!prev) return "";
    const d = now - prev;
    return d === 0 ? `<small class="ov-eq">跟上週一樣</small>` : `<small class="${d > 0 ? "ov-up" : "ov-down"}">${d > 0 ? "▲" : "▼"} ${Math.abs(d)}${unit}</small>`;
  };

  async function load() {
    OV.err = null;
    try {
      if (OV.tab === "year") {
        const { data, error } = await db.rpc("life_year", { p_year: OV.year || null });
        if (error) throw error;
        OV.yr = data;
      } else if (OV.tab === "week") {
        const { data, error } = await db.rpc("life_week", { p_offset: OV.offset });
        if (error) throw error;
        OV.week = data;
      } else {
        const { data, error } = await db.rpc("life_collection");
        if (error) throw error;
        OV.coll = data;
      }
    } catch (e) {
      OV.err = /life_year/.test(e.message || "") ? "setup2" : /life_week|life_collection|PGRST202|42883/.test(e.message || "") ? "setup" : (e.message || String(e));
    }
    render();
  }

  function weekHtml() {
    const w = OV.week;
    if (!w) return `<div class="ov-empty">載入中…</div>`;
    const days = w.days || [];
    const max = Math.max(60, ...days.map(d => d.focus));
    const tf = days.reduce((a, d) => a + d.focus, 0);
    const td = days.reduce((a, d) => a + d.done, 0);
    const tt = days.reduce((a, d) => a + d.tasks, 0);
    const th = days.reduce((a, d) => a + d.habits, 0);
    const tc = days.filter(d => d.checkin).length;
    const past = days.filter(d => d.day <= w.today).length || 1;
    const best = days.reduce((b, d) => d.focus > (b ? b.focus : -1) ? d : b, null);
    const bars = days.map((d, i) => {
      const future = d.day > w.today;
      const h = Math.round(d.focus / max * 100);
      const rate = d.tasks ? pct(d.done, d.tasks) : null;
      return `<div class="ov-col ${future ? "future" : ""} ${d.day === w.today ? "today" : ""}">
        <span class="ov-v">${future ? "" : hm(d.focus)}</span>
        <div class="ov-bar"><i style="height:${h}%"></i></div>
        <b>${DAY[i]}</b>
        <span class="ov-rate ${rate === 100 ? "full" : ""}">${future ? "" : rate == null ? "—" : rate + "%"}</span>
        <span class="ov-ck">${future ? "" : d.checkin ? "✅" : "·"}</span></div>`;
    }).join("");
    const subj = (w.subjects || []).slice(0, 6);
    const smax = Math.max(1, ...subj.map(s => s.min));
    const subjHtml = subj.length ? subj.map(s => `<div class="ov-subj"><span>${esc(s.subject || "未分類")}</span><div class="ov-hbar"><i style="width:${s.min / smax * 100}%"></i></div><b>${hm(s.min)}</b></div>`).join("") : `<p class="ov-note">這週還沒有專注紀錄。</p>`;
    const words = tf >= 900 ? "這週超認真，專注超過 15 小時！🌟" : tf >= 420 ? "穩穩地前進中，繼續保持 💪" : tf > 0 ? "有開始就是好的開始，下週多一點點就好 🌱" : "這週還沒開始，從 25 分鐘試試看 ⏱️";
    return `<div class="ov-nav"><button type="button" class="ov-btn ghost" data-ov="prev">‹ 上週</button>
        <b>${w.start.slice(5).replace("-", "/")} – ${w.end.slice(5).replace("-", "/")}${OV.offset === 0 ? "（這週）" : ""}</b>
        <button type="button" class="ov-btn ghost" data-ov="next" ${OV.offset >= 0 ? "disabled" : ""}>下週 ›</button></div>
      <div class="ov-cards">
        <div><b>${hm(tf)}</b><span>專注</span>${delta(tf, w.prev.focus, " 分")}</div>
        <div><b>${td}/${tt}</b><span>任務完成（${pct(td, tt)}%）</span>${delta(td, w.prev.done, " 個")}</div>
        <div><b>${th}</b><span>習慣打卡</span></div>
        <div><b>${tc}/${past}</b><span>簽到天數</span></div>
      </div>
      <div class="ov-box"><div class="ov-sec">每天專注・任務完成率・簽到</div><div class="ov-chart">${bars}</div>
        <p class="ov-note">${best && best.focus ? `最認真的一天是週${DAY[days.indexOf(best)]}（${hm(best.focus)}）。` : ""}平均每天 ${hm(Math.round(tf / past))}。${words}</p></div>
      <div class="ov-box"><div class="ov-sec">各科目專注時間</div>${subjHtml}</div>`;
  }

  /* 🗓️ 年度熱力圖：一年 365 格，專注越久越亮 */
  function yearHtml() {
    const y = OV.yr;
    if (!y) return `<div class="ov-empty">載入中…</div>`;
    const days = y.days || {};
    const start = new Date(Date.UTC(y.year, 0, 1));
    const end = new Date(Date.UTC(y.year, 11, 31));
    const lead = (start.getUTCDay() + 6) % 7;          // 週一開頭
    const lv = m => !m ? 0 : m < 30 ? 1 : m < 90 ? 2 : m < 180 ? 3 : m < 300 ? 4 : 5;
    let cells = "", months = "", total = 0, active = 0, best = null, cur = 0, longest = 0;
    for (let i = 0; i < lead; i++) cells += `<i class="ov-hc blank"></i>`;
    let lastMonth = -1, col = 0;
    for (let d = new Date(start), idx = lead; d <= end; d.setUTCDate(d.getUTCDate() + 1), idx++) {
      const key = d.toISOString().slice(0, 10);
      const m = days[key] || 0;
      const future = key > y.today;
      if (!future) {
        total += m;
        if (m > 0) { active++; cur++; longest = Math.max(longest, cur); } else if (key !== y.today) cur = 0;
        if (!best || m > best[1]) best = [key, m];
      }
      cells += `<i class="ov-hc l${future ? "f" : lv(m)} ${key === y.today ? "td" : ""}" title="${key.slice(5).replace("-", "/")}　${hm(m)}"></i>`;
      col = Math.floor(idx / 7);
      if (d.getUTCMonth() !== lastMonth) { lastMonth = d.getUTCMonth(); months += `<span style="grid-column:${col + 1}">${lastMonth + 1}月</span>`; }
    }
    const q = y.quality || [], qh = y.quality_hour || [];
    const qName = v => v >= 2.6 ? "😤 很專心" : v >= 1.8 ? "🙂 普通" : "😵 容易分心";
    const qHtml = q.length
      ? q.map(r => `<div class="ov-subj"><span>${esc(r.subject || "未分類")}</span><div class="ov-hbar"><i style="width:${(r.avg - 1) / 2 * 100}%"></i></div><b>${qName(r.avg)}</b></div>`).join("")
        + (qh.length ? `<p class="ov-note">最專心的時段：${(() => { const b = qh.slice().sort((a, b) => b.avg - a.avg || b.n - a.n)[0]; return `${String(b.h).padStart(2, "0")}:00～${String(b.h + 3).padStart(2, "0")}:00`; })()}・最常分心：${(() => { const w = qh.slice().sort((a, b) => a.avg - b.avg || b.n - a.n)[0]; return `${String(w.h).padStart(2, "0")}:00～${String(w.h + 3).padStart(2, "0")}:00`; })()}</p>` : "")
      : `<p class="ov-note">專注結束時選「很專心／普通／分心」，這裡就會分析你哪個科目、哪個時段最專心。</p>`;
    return `<div class="ov-nav"><button type="button" class="ov-btn ghost" data-ov="yprev">‹ ${y.year - 1}</button><b>${y.year} 年</b>
        <button type="button" class="ov-btn ghost" data-ov="ynext" ${y.year >= Number(y.today.slice(0, 4)) ? "disabled" : ""}>${y.year + 1} ›</button></div>
      <div class="ov-cards"><div><b>${Math.round(total / 60)} 小時</b><span>今年專注</span></div><div><b>${active} 天</b><span>有專注的日子</span></div>
        <div><b>${longest} 天</b><span>最長連續專注</span></div><div><b>${best && best[1] ? hm(best[1]) : "—"}</b><span>單日最高${best && best[1] ? `（${best[0].slice(5).replace("-", "/")}）` : ""}</span></div></div>
      <div class="ov-box"><div class="ov-sec">每天專注熱力圖</div>
        <div class="ov-heat-wrap"><div class="ov-months">${months}</div><div class="ov-heat">${cells}</div></div>
        <div class="ov-legend">少 <i class="ov-hc l0"></i><i class="ov-hc l1"></i><i class="ov-hc l2"></i><i class="ov-hc l3"></i><i class="ov-hc l4"></i><i class="ov-hc l5"></i> 多（30 分／1.5／3／5 小時）</div></div>
      <div class="ov-box"><div class="ov-sec">⭐ 專注品質（最近 30 天）</div>${qHtml}</div>`;
  }

  function collHtml() {
    const c = OV.coll;
    if (!c) return `<div class="ov-empty">載入中…</div>`;
    const D = window.FARM_DATA || {};
    const fun = (window.FunGame && window.FunGame.totals) || {};
    const rows = [];
    const add = (group, name, a, b) => { if (b) rows.push({ group, name, a: a || 0, b }); };
    if (c.farm) {
      add("🏝️ 星露島", "作物圖鑑", c.farm.crops, Object.keys(D.crops || {}).length);
      add("🏝️ 星露島", "料理圖鑑", c.farm.dishes, Object.keys(D.dishes || {}).length);
      add("🏝️ 星露島", "動物", c.farm.animals, Object.keys(D.animals || {}).length);
      add("🏝️ 星露島", "魚類圖鑑", c.farm.fish, Object.keys(D.fish || {}).length);
    }
    if (c.rpg) {
      add("⚔️ 冒險", "裝備", c.rpg.gear, c.rpg.gear_total);
      add("⚔️ 冒險", "小怪獸＋星座", c.rpg.monsters, fun.monsters);
      add("⚔️ 冒險", "頭像框", c.rpg.frames, fun.frames);
    }
    if (c.doom) {
      const d = c.doom;
      add("☢️ 末世", "物資收藏", d.seen, d.seen_total);
      add("☢️ 末世", "生活小物", d.trinkets, d.trinkets_total);
      add("☢️ 末世", "收藏品", d.relics, d.relics_total);
      add("☢️ 末世", "同伴", d.companions, d.companions_total);
      add("☢️ 末世", "前世記憶", d.memories, d.memories_total);
      add("☢️ 末世", "隱藏區域", d.zones, d.zones_total);
      add("☢️ 末世", "城市工程階段", d.projects, d.projects_total);
    }
    if (!rows.length) return `<div class="ov-empty">還沒開始玩遊戲。</div>`;
    const ta = rows.reduce((s, r) => s + Math.min(r.a, r.b), 0), tb = rows.reduce((s, r) => s + r.b, 0);
    const p = pct(ta, tb);
    let html = `<div class="ov-total"><div class="ov-ring" style="--p:${p}"><b>${p}%</b></div>
      <div><b>總收集進度</b><span>${ta} / ${tb}</span><span class="ov-note">${p >= 80 ? "收藏大師！🏆" : p >= 50 ? "已經收集一半以上了 ✨" : p >= 20 ? "慢慢收集中 🌱" : "收藏之旅才剛開始 🎒"}</span></div></div>`;
    let g = "";
    for (const r of rows) {
      if (r.group !== g) { if (g) html += `</div>`; g = r.group; html += `<div class="ov-box"><div class="ov-sec">${r.group}</div>`; }
      const q = pct(Math.min(r.a, r.b), r.b);
      html += `<div class="ov-subj"><span>${esc(r.name)}${q >= 100 ? " ✅" : ""}</span><div class="ov-hbar ${q >= 100 ? "full" : ""}"><i style="width:${q}%"></i></div><b>${Math.min(r.a, r.b)}/${r.b}</b></div>`;
    }
    return html + `</div>`;
  }

  function render() {
    const ov = document.getElementById("ov-overlay");
    if (!ov || !OV.open) return;
    let body;
    if (OV.err === "setup") body = `<p class="ov-note">⚠️ 回顧的資料庫還沒設定：到 Supabase 的 SQL Editor 執行 <b>sql/2026-10-30_通知與回顧.sql</b>。</p>`;
    else if (OV.err) body = `<p class="ov-note">載入失敗：${esc(OV.err)}</p>`;
    else if (OV.err === "setup2") body = `<p class="ov-note">⚠️ 年度熱力圖的資料庫還沒設定：到 Supabase 的 SQL Editor 執行 <b>sql/2026-10-30_目標與作息.sql</b>。</p>`;
    else body = OV.tab === "week" ? weekHtml() : OV.tab === "year" ? yearHtml() : collHtml();
    ov.querySelector(".ov-panel").innerHTML = `<div class="ov-head"><h2>📊 回顧</h2><button type="button" class="ov-x" data-ov="close" aria-label="關閉">✕</button></div>
      <div class="ov-tabs"><button type="button" class="${OV.tab === "week" ? "on" : ""}" data-ov="tab" data-v="week">📅 週回顧</button><button type="button" class="${OV.tab === "year" ? "on" : ""}" data-ov="tab" data-v="year">🗓️ 年度</button><button type="button" class="${OV.tab === "coll" ? "on" : ""}" data-ov="tab" data-v="coll">🏆 收藏</button></div>${body}`;
  }

  function openPanel() {
    if (typeof currentUser === "undefined" || !currentUser) return;
    OV.open = true;
    document.getElementById("ov-overlay").hidden = false;
    render();
    load();
  }

  function onClick(e) {
    const el = e.target.closest("[data-ov]");
    if (!el) { if (e.target.id === "ov-overlay") { OV.open = false; e.target.hidden = true; } return; }
    const a = el.dataset.ov;
    if (a === "close") { OV.open = false; document.getElementById("ov-overlay").hidden = true; return; }
    if (a === "tab") { OV.tab = el.dataset.v; render(); load(); return; }
    if (a === "yprev" || a === "ynext") { OV.year = (OV.yr ? OV.yr.year : new Date().getFullYear()) + (a === "yprev" ? -1 : 1); OV.yr = null; render(); load(); return; }
    if (a === "prev") { OV.offset--; OV.week = null; render(); load(); return; }
    if (a === "next" && OV.offset < 0) { OV.offset++; OV.week = null; render(); load(); }
  }

  function setup() {
    if (!document.getElementById("ov-style")) {
      const st = document.createElement("style");
      st.id = "ov-style";
      st.textContent = `
        #ov-overlay { position: fixed; inset: 0; background: rgba(5,8,18,.6); z-index: 9998; display: flex; justify-content: center; align-items: flex-start; padding: 60px 12px 20px; overflow-y: auto; }
        #ov-overlay[hidden] { display: none; }
        .ov-panel { width: 100%; max-width: 480px; background: #1f2436; color: #e8ebf5; border-radius: 16px; padding: 16px; box-shadow: 0 10px 40px rgba(0,0,0,.4); }
        .ov-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; } .ov-head h2 { margin: 0; font-size: 19px; }
        .ov-x { background: none; border: 0; color: #8f98b6; font-size: 20px; cursor: pointer; }
        .ov-tabs { display: flex; gap: 6px; margin-bottom: 12px; } .ov-tabs button { flex: 1; padding: 8px; border-radius: 10px; border: 0; background: #2c3350; color: #e8ebf5; font-weight: 700; cursor: pointer; } .ov-tabs button.on { background: #ff9f43; color: #1b1f2e; }
        .ov-nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 14px; }
        .ov-btn { background: #ff9f43; color: #1b1f2e; border: 0; border-radius: 10px; padding: 6px 12px; font-weight: 700; cursor: pointer; } .ov-btn.ghost { background: #2c3350; color: #e8ebf5; } .ov-btn:disabled { opacity: .4; }
        .ov-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 10px; }
        .ov-cards div { background: #151927; border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 2px; }
        .ov-cards b { font-size: 20px; } .ov-cards span { font-size: 12px; color: #8f98b6; }
        .ov-up { color: #42d392; } .ov-down { color: #ff7b7b; } .ov-eq { color: #8f98b6; }
        .ov-box { background: #151927; border-radius: 12px; padding: 12px; margin-bottom: 10px; }
        .ov-sec { font-weight: 700; margin-bottom: 8px; font-size: 14px; }
        .ov-chart { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; align-items: end; }
        .ov-col { display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 11px; }
        .ov-col.future { opacity: .35; } .ov-col.today b { color: #ff9f43; }
        .ov-v { color: #8f98b6; min-height: 14px; }
        .ov-bar { width: 70%; height: 110px; background: rgba(127,127,127,.15); border-radius: 6px; display: flex; align-items: flex-end; overflow: hidden; }
        .ov-bar i { display: block; width: 100%; background: linear-gradient(0deg, #ff9f43, #ffd166); border-radius: 6px; }
        .ov-rate { color: #8f98b6; } .ov-rate.full { color: #42d392; font-weight: 700; }
        .ov-subj { display: grid; grid-template-columns: 96px 1fr auto; gap: 8px; align-items: center; font-size: 13px; margin: 6px 0; }
        .ov-subj span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ov-hbar { height: 8px; background: rgba(127,127,127,.2); border-radius: 99px; overflow: hidden; } .ov-hbar i { display: block; height: 100%; background: #6c8cff; border-radius: 99px; } .ov-hbar.full i { background: #42d392; }
        .ov-total { display: flex; gap: 14px; align-items: center; background: #151927; border-radius: 12px; padding: 12px; margin-bottom: 10px; }
        .ov-total div:last-child { display: flex; flex-direction: column; gap: 2px; }
        .ov-ring { width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(#ffb300 calc(var(--p) * 1%), rgba(127,127,127,.2) 0); }
        .ov-ring b { background: #151927; width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; font-size: 16px; }
        .ov-heat-wrap { overflow-x: auto; padding-bottom: 4px; }
        .ov-months { display: grid; grid-template-columns: repeat(53, 11px); gap: 2px; font-size: 9px; color: #8f98b6; height: 12px; }
        .ov-months span { white-space: nowrap; }
        .ov-heat { display: grid; grid-template-rows: repeat(7, 11px); grid-auto-flow: column; grid-auto-columns: 11px; gap: 2px; }
        .ov-hc { display: inline-block; width: 11px; height: 11px; border-radius: 3px; background: rgba(127,127,127,.15); }
        .ov-hc.blank { background: transparent; } .ov-hc.lf { background: rgba(127,127,127,.06); }
        .ov-hc.l1 { background: #5b3d1e; } .ov-hc.l2 { background: #8a5a20; } .ov-hc.l3 { background: #c9801f; } .ov-hc.l4 { background: #f2a33a; } .ov-hc.l5 { background: #ffd166; box-shadow: 0 0 4px #ffd166; }
        .ov-hc.td { outline: 1.5px solid #fff; }
        .ov-legend { display: flex; gap: 3px; align-items: center; font-size: 11px; color: #8f98b6; margin-top: 6px; flex-wrap: wrap; }
        .ov-note { font-size: 12.5px; color: #8f98b6; margin: 8px 0 0; } .ov-empty { text-align: center; color: #8f98b6; padding: 20px; }
        @media (max-width: 480px) { .ov-open-btn .ov-open-txt { display: none; } }
      `;
      document.head.appendChild(st);
    }
    if (!document.getElementById("ov-open")) {
      const logoutBtn = document.querySelector('button[onclick="logout()"]');
      if (logoutBtn && logoutBtn.parentNode) {
        const b = document.createElement("button");
        b.id = "ov-open"; b.type = "button"; b.className = "btn ov-open-btn";
        b.innerHTML = `📊<span class="ov-open-txt"> 回顧</span>`;
        b.setAttribute("aria-label", "回顧");
        b.addEventListener("click", openPanel);
        logoutBtn.parentNode.insertBefore(b, logoutBtn);
      }
    }
    if (!document.getElementById("ov-overlay")) {
      const ov = document.createElement("div");
      ov.id = "ov-overlay"; ov.hidden = true;
      ov.innerHTML = `<div class="ov-panel" role="dialog" aria-modal="true" aria-label="回顧"></div>`;
      ov.addEventListener("click", onClick);
      document.body.appendChild(ov);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();

  window.OverviewGame = { open: openPanel, state: OV };

})();
