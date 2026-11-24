/* ⚡ 精力管理（輕量版）
   ① 今日頁「⚡ 今日精力」：每天點一下選狀態（🟢 充沛／🔵 普通／🟡 疲憊）→ 建議模式（巔峰／穩定／節能／恢復／休養）、建議任務強度、一項恢復提醒
      一天第一次打開今日頁會主動問一次（等其他視窗關掉才問）；卡片可以收起，也可以按 ✕ 隱藏
   ② 數據中心（📊 紀錄頁）下方「⚡ 精力分析」：最近 30 天，用既有的睡眠、專注、喝水、運動資料分組比較
   ③ 週回顧裡的「⚡ 本週精力」
   資料：sql/2026-11-24_精力管理.sql（只新增 energy_logs）；其他全部讀既有資料表
   ⚠️ 這個檔案不發任何獎勵、不扣任何資源、不碰連擊／休息券／寵物蛋／成就、不搬動任何任務 */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const today = () => (typeof getToday === "function" ? getToday() : new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10));
  const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const md = s => String(s).slice(5).replace("-", "/");
  const WD = s => "日一二三四五六"[new Date(s + "T00:00:00Z").getUTCDay()];
  const twHour = () => Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei", hour: "numeric", hour12: false })) % 24;
  const SLEEP_OK = 6, SLEEP_LOW = 5, MIN_N = 3;
  const LV = { green: ["🟢", "充沛", "#3fb950"], blue: ["🔵", "普通", "#58a6ff"], yellow: ["🟡", "疲憊", "#d29922"] };
  const MODE = {
    peak: ["🚀 巔峰", "可以排今天最難的一件事（新章節、題庫、模考），趁狀態好推進"],
    steady: ["🙂 穩定", "照原本的計畫走，難易穿插，中間記得休息"],
    save: ["🔋 節能", "以複習、整理、刷熟悉的題目為主，少學全新的內容"],
    recover: ["🌱 恢復", "只做 1～2 件最重要的事，其他可以先放著"],
    rest: ["🛌 休養", "今天以休息為主，做一件最小的事就好（例如複習 10 張卡）"]
  };
  const HIDE = "energyCardHidden", ASKED = "energyAsked";
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} } };
  const E = { loaded: false, err: null, logs: {}, sleep: {}, focus: {}, water: {}, meals: {}, ex: {}, sess: [], goal: 2250, editing: false };

  /* ---------- 讀資料（全部用既有資料表） ---------- */
  async function load() {
    if (!hasDb()) return;
    const t = today(), from = addDays(t, -60);
    const [en, sl, fs, wa, me, ex, st] = await Promise.all([
      db.from("energy_logs").select("day, level, mode").gte("day", from),
      db.from("sleep_logs").select("night_date, bed_at, wake_at").gte("night_date", addDays(from, -1)),
      db.from("focus_sessions").select("session_date, duration_seconds, started_at, ended_at").gte("session_date", from).limit(5000),
      db.from("water_logs").select("log_date, ml").gte("log_date", from).limit(5000),
      db.from("meal_logs").select("log_date, meal_type, eaten_at, skipped, created_at").gte("log_date", from),
      db.from("exercise_logs").select("log_date, minutes").gte("log_date", from),
      db.from("user_settings").select("accum").maybeSingle()]);
    if (en.error && /energy_logs/.test(en.error.message)) { E.err = "精力管理的資料庫還沒設定：到 Supabase 執行 sql/2026-11-24_精力管理.sql"; E.loaded = true; return renderAll(); }
    E.logs = {}; (en.data || []).forEach(r => { E.logs[r.day] = r; });
    /* 睡眠：night_date 是「那一晚」，算進隔天的精力 */
    E.sleep = {}; (sl.data || []).forEach(r => { if (r.bed_at && r.wake_at) { const h = (new Date(r.wake_at) - new Date(r.bed_at)) / 36e5; if (h > 0 && h < 16) E.sleep[addDays(r.night_date, 1)] = Math.round(h * 10) / 10; } });
    E.focus = {}; E.sess = fs.data || []; E.sess.forEach(r => { E.focus[r.session_date] = (E.focus[r.session_date] || 0) + (r.duration_seconds || 0) / 60; });
    E.water = {}; (wa.data || []).forEach(r => { E.water[r.log_date] = (E.water[r.log_date] || 0) + (r.ml || 0); });
    E.meals = {}; (me.data || []).forEach(r => { (E.meals[r.log_date] = E.meals[r.log_date] || []).push(r); });
    E.ex = {}; (ex.data || []).forEach(r => { E.ex[r.log_date] = (E.ex[r.log_date] || 0) + (r.minutes || 0); });
    const g = st.data && st.data.accum && Number(st.data.accum.waterMl); if (g > 0) E.goal = g;
    E.loaded = true; E.err = null; renderAll(); maybeAsk();
  }

  /* ---------- 模式：你選的狀態 ＋ 昨晚睡眠 ＋ 最近連續疲憊 ---------- */
  function modeOf(level, day) {
    const s = E.sleep[day], y1 = (E.logs[addDays(day, -1)] || {}).level, y2 = (E.logs[addDays(day, -2)] || {}).level;
    if (level === "green") return s == null || s >= SLEEP_OK ? "peak" : "steady";
    if (level === "blue") return s != null && s < SLEEP_OK ? "save" : "steady";
    return (s != null && s < SLEEP_LOW) || (y1 === "yellow" && y2 === "yellow") ? "rest" : "recover";
  }
  /* 一項恢復提醒（照優先順序挑第一個成立的） */
  function reminder(level) {
    const t = today(), h = twHour(), s = E.sleep[t];
    if (s != null && s < SLEEP_OK) return ["😴", `昨晚只睡了 ${s} 小時，今天優先早點休息，午睡 20 分鐘也有幫助`];
    /* 久坐：最近 2 小時內，專注段落之間沒有超過 10 分鐘的空檔、累計 90 分鐘以上 */
    const now = Date.now(), recent = E.sess.filter(x => x.ended_at && now - new Date(x.ended_at) < 2 * 36e5).sort((a, b) => new Date(b.ended_at) - new Date(a.ended_at));
    let run = 0, edge = now; for (const x of recent) { if (edge - new Date(x.ended_at) > 10 * 6e4) break; run += (x.duration_seconds || 0) / 60; edge = new Date(x.started_at).getTime(); }
    if (run >= 90) return ["🚶", `已經連續專注 ${Math.round(run)} 分鐘了，起來走動 5 分鐘、伸展一下`];
    const w = E.water[t] || 0, awake = Math.min(1, Math.max(0, (h - 8) / 14)), expect = E.goal * awake;
    if (h >= 12 && w < expect * 0.5) return ["💧", `今天喝了 ${w} ml，照這個時間大概要 ${Math.round(expect / 50) * 50} ml，記得補水`];
    const ms = (E.meals[t] || []).filter(x => !x.skipped);
    if (h >= 13 && h < 22 && ms.length) { const last = Math.max(...ms.map(x => x.eaten_at ? new Date(t + "T" + x.eaten_at + "+08:00").getTime() : new Date(x.created_at).getTime()));
      if (now - last > 5 * 36e5) return ["🍱", `距離上一餐已經超過 5 小時，留意一下要不要吃點東西`]; }
    if (level === "yellow") return ["🧠", "今天腦袋比較累，挑不用想太多的事做，例如整理筆記、複習熟悉的卡"];
    if (level === "blue") return ["⏱️", "每專注 50 分鐘休息 10 分鐘，比一口氣撐到底更持久"];
    return ["✨", "狀態不錯，把最需要動腦的事排在現在"];
  }

  /* ---------- ① 今日精力卡 ---------- */
  function renderCard() {
    const tp = document.querySelector('.page[data-page="today"]'); if (!tp) return;
    let box = document.getElementById("en-today");
    if (ls.get(HIDE)) { if (box) box.remove(); return; }
    if (!E.loaded || E.err) return;
    if (!box) { box = document.createElement("section"); box.id = "en-today"; box.className = "card en-card"; const ref = tp.querySelector(":scope > .dp-banner"), first = [...tp.children].find(el => el.classList.contains("card"));
      ref ? ref.after(box) : first ? first.before(box) : tp.appendChild(box); if (window.Reorder && window.Reorder.apply) try { window.Reorder.apply(); } catch (_) {} }
    const t = today(), r = E.logs[t], s = E.sleep[t];
    if (!r || E.editing) {
      box.innerHTML = `<div class="en-h"><h2>⚡ 今日精力</h2><button type="button" class="en-x" data-en="hide" title="隱藏這張卡（可以在數據中心恢復）">✕</button></div>
        <p class="en-q">今天感覺怎麼樣？${s != null ? `<small>昨晚睡了 ${s} 小時</small>` : ""}</p>
        <div class="en-pick">${Object.entries(LV).map(([k, v]) => `<button type="button" data-en="pick" data-v="${k}" style="--c:${v[2]}" class="${r && r.level === k ? "on" : ""}">${v[0]} ${v[1]}</button>`).join("")}</div>`;
      return;
    }
    const m = MODE[r.mode], rm = reminder(r.level), lv = LV[r.level];
    box.innerHTML = `<div class="en-h"><h2>⚡ 今日精力</h2><span class="en-st" style="--c:${lv[2]}">${lv[0]} ${lv[1]}・${m[0]}</span><button type="button" class="en-x" data-en="hide" title="隱藏這張卡（可以在數據中心恢復）">✕</button></div>
      <p class="en-line"><b>建議強度</b>${m[1]}</p>
      <p class="en-line en-rm"><b>${rm[0]}</b>${rm[1]}</p>
      <div class="en-foot"><button type="button" data-en="edit">改狀態</button><select data-en="mode" aria-label="換模式">${Object.entries(MODE).map(([k, v]) => `<option value="${k}" ${k === r.mode ? "selected" : ""}>${v[0]}</option>`).join("")}</select></div>`;
  }
  async function save(level, mode) {
    const t = today(), row = { user_id: currentUser.id, day: t, level, mode: mode || modeOf(level, t), updated_at: new Date().toISOString() };
    const { error } = await db.from("energy_logs").upsert(row, { onConflict: "user_id,day" });
    if (error) return toast(error.message);
    E.logs[t] = row; E.editing = false; ls.set(ASKED, t); renderAll();
    const am = document.querySelector(".en-ask"); if (am) am.remove();
    toast(`⚡ 今天是${LV[level][1]}，建議「${MODE[row.mode][0]}」模式`);
  }
  /* 一天第一次打開今日頁：主動問一次（等其他視窗關掉才問，不打斷） */
  function maybeAsk(n) {
    const t = today(); n = n || 0;
    if (E.err || E.logs[t] || ls.get(ASKED) === t || ls.get(HIDE)) return;
    const tp = document.querySelector('.page[data-page="today"]'); if (!tp || !tp.classList.contains("active")) return;
    if (document.querySelector(".vg-modal, .dp-modal, .tc-modal, .kb-run")) { if (n < 120) setTimeout(() => maybeAsk(n + 1), 2000); return; }
    ls.set(ASKED, t); const s = E.sleep[t];
    const m = document.createElement("div"); m.className = "vg-modal en-ask";
    m.innerHTML = `<div class="vg-card"><div class="vg-title">⚡ 今天的精力怎麼樣？</div><p class="tr-note">點一下就好，會依狀態建議今天的任務強度。${s != null ? `昨晚睡了 ${s} 小時。` : ""}</p>
      <div class="en-pick big">${Object.entries(LV).map(([k, v]) => `<button type="button" data-en="pick" data-v="${k}" style="--c:${v[2]}">${v[0]}<br>${v[1]}</button>`).join("")}</div>
      <button type="button" class="btn" data-vx="1" style="width:100%;margin-top:8px">先跳過</button></div>`;
    m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-vx]")) m.remove(); });
    document.body.appendChild(m);
  }

  /* ---------- 統計工具 ---------- */
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const r1 = v => v == null ? "—" : Math.round(v * 10) / 10;
  const pct = (a, f) => a.length ? Math.round(a.filter(f).length / a.length * 100) : null;
  /* 比較：符合條件的日子 vs 不符合的日子，「充沛」的比例；任一組 < 3 天 → 資料不足 */
  function compare(days, cond, name) {
    const A = days.filter(d => cond(d) === true), B = days.filter(d => cond(d) === false);
    if (A.length < MIN_N || B.length < MIN_N) return `<li class="en-na">${name}：資料不足（兩組各至少要 ${MIN_N} 天，目前 ${A.length}／${B.length} 天）</li>`;
    const g = d => E.logs[d].level === "green", y = d => E.logs[d].level === "yellow";
    return `<li>${name}：充沛 <b>${pct(A, g)}%</b>、疲憊 ${pct(A, y)}%（${A.length} 天）<span>vs 其他日子 充沛 <b>${pct(B, g)}%</b>、疲憊 ${pct(B, y)}%（${B.length} 天）</span></li>`;
  }
  const dist = days => { const c = { green: 0, blue: 0, yellow: 0 }; days.forEach(d => c[E.logs[d].level]++); const n = days.length || 1;
    return `<div class="en-dist">${Object.entries(LV).map(([k, v]) => c[k] ? `<i style="flex:${c[k]};background:${v[2]}" title="${v[1]} ${c[k]} 天">${v[0]} ${c[k]}</i>` : "").join("")}</div><p class="en-sm">${Object.entries(LV).map(([k, v]) => `${v[1]} ${c[k]} 天（${Math.round(c[k] / n * 100)}%）`).join("・")}</p>`; };

  /* ---------- ② 數據中心：精力分析 ---------- */
  function analysisHtml() {
    if (E.err) return `<p class="tr-note">${esc(E.err)}</p>`;
    const t = today(), days = Object.keys(E.logs).filter(d => d >= addDays(t, -29) && d <= t).sort();
    const restore = ls.get(HIDE) ? `<p class="tr-note">今日精力卡目前隱藏中。<button type="button" class="btn btn-small" data-en="show">重新顯示</button></p>` : "";
    if (days.length < MIN_N) return `${restore}<p class="tr-note">最近 30 天只有 ${days.length} 天有精力評估，資料不足。每天在今日頁點一下狀態，累積 ${MIN_N} 天以上就會開始分析。</p>`;
    const fm = d => E.focus[d] || 0, fmed = [...days.map(fm)].sort((a, b) => a - b)[Math.floor(days.length / 2)];
    const rows = [
      compare(days, d => E.sleep[d] == null ? null : E.sleep[d] >= SLEEP_OK, `前一晚睡滿 ${SLEEP_OK} 小時`),
      compare(days, d => { const p = addDays(d, -1); return E.logs[p] && E.focus[p] != null ? fm(p) >= 180 : null; }, "前一天專注 3 小時以上"),
      compare(days, d => E.water[d] == null ? null : E.water[d] >= E.goal * 0.8, `當天喝水達 ${Math.round(E.goal * 0.8)} ml`),
      compare(days, d => E.meals[d] ? E.meals[d].filter(x => !x.skipped).length >= 3 : null, "當天三餐都有紀錄"),
      compare(days, d => E.ex[d] ? true : (Object.keys(E.ex).length ? false : null), "當天有運動")];
    const byLv = k => { const D = days.filter(d => E.logs[d].level === k); return D.length ? `<tr><td>${LV[k][0]} ${LV[k][1]}（${D.length} 天）</td><td>${r1(avg(D.map(d => E.sleep[d]).filter(v => v != null)))} 小時</td><td>${Math.round(avg(D.map(fm)) || 0)} 分</td><td>${Math.round(avg(D.map(d => E.water[d]).filter(v => v != null)) || 0) || "—"} ml</td></tr>` : ""; };
    return `${restore}${dist(days)}
      <p class="tc-h4">不同精力狀態的日子，平均是這樣</p>
      <div class="tr-scroll"><table class="en-tb"><tr><th></th><th>前一晚睡眠</th><th>專注</th><th>喝水</th></tr>${["green", "blue", "yellow"].map(byLv).join("")}</table></div>
      <p class="tc-h4">哪些情況下比較常覺得充沛？</p><ul class="en-cmp">${rows.join("")}</ul>
      <p class="en-warn">⚠️ 這些只是「同時出現」的情況，不代表因果。例如睡得多的日子比較有精神，也可能是那幾天本來就比較輕鬆。樣本少的時候，參考就好。</p>`;
  }
  function renderAnalysis() {
    const page = document.querySelector('.page[data-page="records"]'); if (!page) return;
    /* 放在數據中心外面（#dc-root 後面），數據中心重新整理時才不會被洗掉 */
    const dc = document.getElementById("dc-root"); let box = document.getElementById("en-analysis");
    if (!box) { box = document.createElement("section"); box.id = "en-analysis"; box.className = "card"; dc ? dc.after(box) : page.appendChild(box); }
    box.innerHTML = `<div class="card-head"><h2>⚡ 精力分析 <small class="nb-prog">最近 30 天</small></h2></div>${E.loaded ? analysisHtml() : `<p class="tr-note">載入中…</p>`}`;
  }

  /* ---------- ③ 週回顧：本週精力 ---------- */
  function weekHtml(ws) {
    if (!E.loaded) return `<div class="ov-box"><div class="ov-sec">⚡ 本週精力</div><p class="ov-note">載入中…</p></div>`;
    if (E.err) return "";
    const all = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter(d => d <= today()), days = all.filter(d => E.logs[d]);
    const head = `<div class="ov-box"><div class="ov-sec">⚡ 本週精力</div>`;
    if (days.length < MIN_N) return `${head}<p class="ov-note">這週只有 ${days.length} 天有精力評估，資料不足，先不做分析。每天在今日頁點一下狀態就會累積。</p></div>`;
    const low = days.filter(d => E.logs[d].level === "yellow"), sl = all.map(d => E.sleep[d]).filter(v => v != null), fo = all.map(d => E.focus[d] || 0);
    /* 可能的消耗因素：只列「跟疲憊日同時出現」的現象，而且要至少 2 天 */
    const f = [];
    if (low.length) {
      const a = low.filter(d => E.sleep[d] != null && E.sleep[d] < SLEEP_OK).length; if (a >= 2) f.push(`疲憊的 ${low.length} 天中，有 ${a} 天前一晚睡不到 ${SLEEP_OK} 小時`);
      const b = low.filter(d => (E.focus[addDays(d, -1)] || 0) >= 240).length; if (b >= 2) f.push(`有 ${b} 天是在前一天專注超過 4 小時之後`);
      const c = low.filter(d => E.water[d] != null && E.water[d] < E.goal * 0.5).length; if (c >= 2) f.push(`有 ${c} 天喝水不到目標的一半`);
    }
    /* 有效的恢復：疲憊／普通 → 隔天回到充沛，那一晚睡了多久 */
    const rec = all.filter(d => E.logs[d] && E.logs[d].level === "green" && E.logs[addDays(d, -1)] && E.logs[addDays(d, -1)].level !== "green");
    const recS = rec.map(d => E.sleep[d]).filter(v => v != null);
    let tip;
    if (sl.length >= 3 && avg(sl) < SLEEP_OK) tip = `本週平均只睡 ${r1(avg(sl))} 小時。下週先把一天的上床時間提早 30 分鐘，看隔天精力有沒有不同。`;
    else if (low.length >= 3) tip = `本週有 ${low.length} 天疲憊。下週在疲憊的日子把任務減到 2 件，觀察恢復速度。`;
    else if (Math.max(...fo) >= 300) tip = `有一天專注超過 5 小時。下週試著把長時間讀書拆到隔天，避免單日過載。`;
    else tip = `精力大致穩定。下週維持現在的作息，在狀態最好的那天安排最難的科目。`;
    return `${head}${dist(days)}
      <p class="ov-note">${low.length ? `🟡 較低的日子：${low.map(d => `週${WD(d)}（${md(d)}）`).join("、")}` : "這週沒有疲憊的日子 👍"}</p>
      <p class="ov-note">😴 睡眠：${sl.length ? `平均 ${r1(avg(sl))} 小時（${sl.length} 晚有紀錄，最少 ${r1(Math.min(...sl))} 小時）` : "沒有睡眠紀錄，資料不足"}　⏱️ 專注：平均每天 ${Math.round(avg(fo))} 分、最多一天 ${Math.round(Math.max(...fo))} 分</p>
      <p class="ov-note">🔍 可能的消耗因素：${f.length ? f.join("；") : low.length ? "資料不足，看不出共同點" : "本週沒有疲憊的日子"}</p>
      <p class="ov-note">🌱 有效的恢復：${rec.length ? `有 ${rec.length} 次從普通或疲憊回到充沛${recS.length ? `，那幾晚平均睡了 ${r1(avg(recS))} 小時` : ""}` : "這週沒有出現回到充沛的日子，資料不足"}</p>
      <p class="ov-note"><b>👉 下週調整：</b>${tip}</p><p class="ov-note en-sm">以上只是同時出現的情況，不代表因果。</p></div>`;
  }

  function renderAll() { renderCard(); renderAnalysis(); const w = document.getElementById("en-week"); if (w) w.innerHTML = weekHtml(w.dataset.ws); }

  /* ---------- 事件 ---------- */
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-en]"); if (!b || !hasDb()) return; const a = b.dataset.en;
    if (a === "pick") return save(b.dataset.v);
    if (a === "edit") { E.editing = true; return renderCard(); }
    if (a === "hide") { if (!confirm("隱藏今日精力卡？之後可以在「📊 紀錄 → ⚡ 精力分析」重新顯示。")) return; ls.set(HIDE, "1"); renderAll(); return toast("已隱藏，可以在精力分析裡重新顯示"); }
    if (a === "show") { ls.set(HIDE, null); renderAll(); return toast("⚡ 今日精力卡回來了"); }
  });
  document.addEventListener("change", e => { const s = e.target.closest('select[data-en="mode"]'); if (s) { const r = E.logs[today()]; if (r) save(r.level, s.value); } });

  const st = document.createElement("style");
  st.textContent = `
    .en-card { padding-top: 12px; padding-bottom: 12px; } .en-h { display: flex; align-items: center; gap: 8px; } .en-h h2 { margin: 0; font-size: 16px; flex: none; }
    .en-st { flex: 1; font-size: 13px; font-weight: 700; color: var(--c); } .en-x { margin-left: auto; border: 0; background: none; color: inherit; opacity: .45; cursor: pointer; font-size: 14px; padding: 2px 6px; }
    .en-q { margin: 6px 0; font-size: 13.5px; } .en-q small { opacity: .6; margin-left: 6px; }
    .en-pick { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; } .en-pick button { font: inherit; font-size: 13.5px; padding: 8px 4px; border-radius: 10px; border: 1.5px solid color-mix(in srgb, var(--c) 55%, transparent); background: color-mix(in srgb, var(--c) 10%, transparent); color: inherit; cursor: pointer; }
    .en-pick button.on { background: color-mix(in srgb, var(--c) 30%, transparent); } .en-pick.big button { font-size: 15px; padding: 14px 4px; line-height: 1.6; }
    .en-line { display: flex; gap: 8px; margin: 6px 0 0; font-size: 13px; line-height: 1.55; } .en-line b { flex: none; font-size: 12px; opacity: .75; min-width: 52px; } .en-rm b { font-size: 15px; opacity: 1; min-width: 0; }
    .en-foot { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; } .en-foot button, .en-foot select { font: inherit; font-size: 11.5px; border: 0; background: rgba(127,127,127,.12); color: inherit; border-radius: 8px; padding: 3px 8px; cursor: pointer; }
    .en-dist { display: flex; height: 22px; border-radius: 11px; overflow: hidden; margin: 6px 0 2px; } .en-dist i { font-style: normal; font-size: 11px; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; text-shadow: 0 1px 1px rgba(0,0,0,.35); }
    .en-sm { font-size: 11.5px; opacity: .65; margin: 2px 0 8px; }
    .en-tb { width: 100%; border-collapse: collapse; font-size: 12.5px; } .en-tb th, .en-tb td { padding: 5px 6px; border-bottom: 1px solid rgba(127,127,127,.15); text-align: left; } .en-tb th { font-weight: 500; opacity: .7; }
    .en-cmp { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.7; } .en-cmp span { display: block; font-size: 12px; opacity: .7; } .en-cmp .en-na { opacity: .6; }
    .en-warn { font-size: 12px; padding: 8px 10px; border-radius: 10px; background: rgba(210,153,34,.12); margin-top: 10px; }`;
  document.head.appendChild(st);

  if (typeof window.applyPage === "function") { const base = window.applyPage; window.applyPage = function (name) { const r = base.apply(this, arguments);
    if (name === "today") setTimeout(() => { renderCard(); maybeAsk(); }, 0); if (name === "records") setTimeout(renderAnalysis, 300); return r; }; }
  (function boot(n) { if (!hasDb() || !document.querySelector('.page[data-page="today"]')) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; }
    load(); document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); }); })(0);
  window.Energy = { load, weekHtml: ws => `<div id="en-week" data-ws="${ws}">${weekHtml(ws)}</div>` };
})();
