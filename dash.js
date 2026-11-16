/* 📊 學習儀表板（專注 → 📊 儀表板）：多益預估分、本週專注、各科複習熟練度放在同一頁
   🗓️ 考試排程：輸入考試日期＋要讀的複習資料，自動回推每天要學幾個知識點
   🧹 功能使用率：記錄每個分頁、今日頁卡片點了幾次，看哪些功能從來沒用
   資料：sql/2026-11-17_儀表板_考試排程_使用率.sql（kb_plans、feature_usage、usage_bump） */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const appDay = ts => new Date(new Date(ts).getTime() + 2 * 3600e3).toISOString().slice(0, 10); /* 台灣時間早上 6 點換日 */
  const todayStr = () => appDay(Date.now());
  const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const diff = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);
  const weekOf = s => addDays(s, -((new Date(s + "T00:00:00Z").getUTCDay() + 6) % 7));
  const md = s => String(s).slice(5).replace("-", "/");
  const hm = m => m >= 60 ? `${Math.floor(m / 60)} 小時 ${Math.round(m % 60)} 分` : `${Math.round(m)} 分`;
  const UNIT = 3;
  const PAGE_NAME = { today: "🏠 今日", tasks: "📋 任務", calendar: "📅 日曆", projects: "🎯 專案", focus: "⏱️ 專注", vocab: "📖 單字", toeic: "🎯 多益", kb: "🧠 複習", dash: "📊 儀表板",
    life: "🌿 生活", records: "📊 紀錄", improve: "🎯 改善", ideas: "💡 想法", trade: "📈 模擬交易", stock: "🔎 股票分析", rpg: "⚔️ 冒險", farm: "🏝️ 星露島", doom: "☢️ 末世" };
  const D = { loaded: false, err: null };

  /* ---------- 讀資料 ---------- */
  async function load() {
    if (!hasDb()) return;
    const t = todayStr(), w0 = weekOf(t);
    const [src, pts, cards, fs, vt, vd, plans, use] = await Promise.all([
      db.from("kb_sources").select("id, subject, title").limit(1000),
      db.from("kb_points").select("id, source_id, learned_at, cards_ready").limit(5000),
      db.from("kb_cards").select("point_id, source_id, reps, ivl, due, suspended").limit(10000),
      db.from("focus_sessions").select("session_date, duration_seconds, subject").gte("session_date", addDays(w0, -7)).limit(3000),
      db.from("vocab_words").select("id", { count: "exact", head: true }),
      db.from("vocab_words").select("id", { count: "exact", head: true }).lte("due", t),
      db.from("kb_plans").select("id, name, exam_date, source_ids").order("exam_date"),
      db.from("feature_usage").select("day, key, label, n").gte("day", addDays(t, -29)).limit(5000)]);
    if (plans.error && /kb_plans/.test(plans.error.message)) { D.err = "資料庫還沒設定：到 Supabase 執行 sql/2026-11-17_儀表板_考試排程_使用率.sql"; D.loaded = true; return render(); }
    Object.assign(D, { src: src.data || [], pts: pts.data || [], cards: (cards.data || []).filter(c => !c.suspended), fs: fs.data || [], vocabN: vt.count || 0, vocabDue: vd.count || 0, plans: plans.data || [], use: use.data || [], loaded: true, err: null });
    render(); refreshKb();
  }
  const refreshKb = () => { const el = document.getElementById("dash-kbplan"); if (el) el.innerHTML = planInner(true); };

  /* 熟練度：跟複習系統同一套算法（卡片間隔 14 天以上算記牢） */
  const cardM = c => c.reps ? Math.min(1, Math.max(0.15, c.ivl / 14)) : 0;
  function srcStat(sid) {
    const ps = D.pts.filter(p => p.source_id === sid), by = {}; D.cards.forEach(c => { if (c.source_id === sid) (by[c.point_id] = by[c.point_id] || []).push(c); });
    const m = ps.length ? ps.reduce((a, p) => { const cs = by[p.id] || []; return a + (cs.length ? cs.reduce((x, c) => x + cardM(c), 0) / cs.length : 0); }, 0) / ps.length : 0;
    return { n: ps.length, learned: ps.filter(p => p.learned_at).length, m, due: D.cards.filter(c => c.source_id === sid && c.due && c.due <= todayStr()).length };
  }

  /* ---------- 考試排程：回推每天要學多少 ---------- */
  function planCalc(p) {
    const t = todayStr(), ids = (p.source_ids || []).filter(id => D.src.some(s => s.id === id)), ps = D.pts.filter(x => ids.includes(x.source_id));
    const left = ps.filter(x => !x.learned_at), days = diff(t, p.exam_date), todayN = ps.filter(x => x.learned_at && appDay(x.learned_at) === t).length;
    const studyDays = days > 3 ? days - 2 : Math.max(1, days); /* 最後 2 天留給總複習 */
    const perDay = Math.ceil((left.length + todayN) / studyDays), next = ids.find(id => D.pts.some(x => x.source_id === id && !x.learned_at && x.cards_ready));
    return { ids, total: ps.length, left: left.length, days, todayN, perDay, units: Math.ceil(perDay / UNIT), next, notReady: left.filter(x => !x.cards_ready).length };
  }
  function planRow(p, compact) {
    const c = planCalc(p), done = c.total - c.left, pct = c.total ? done / c.total * 100 : 0, titles = c.ids.map(id => (D.src.find(s => s.id === id) || {}).title).filter(Boolean);
    let msg, cls = "";
    if (c.days < 0) msg = `已經考完了（${md(p.exam_date)}）`;
    else if (!c.total) msg = "還沒有選到複習資料，或資料被刪掉了";
    else if (!c.left) msg = "🎉 全部學完了！考前每天把到期的卡清掉，再做幾次「🎯 綜合測驗」";
    else if (c.days <= 0) { msg = `今天就考試，還有 ${c.left} 個知識點沒學：挑最重要的看，不要硬塞新的`; cls = "warn"; }
    else { const ok = c.todayN >= c.perDay; cls = ok ? "ok" : c.units > 4 ? "warn" : "";
      msg = `今天要學 <b>${c.perDay}</b> 個知識點（約 ${c.units} 個單元）・已學 <b>${c.todayN}</b> ${ok ? "✅ 今天達標" : ""}${c.units > 4 ? "<br>⚠️ 進度很趕，一天超過 4 個單元很難吸收：考慮只挑重點章節" : ""}${c.days > 3 ? "<br><small>最後 2 天不排新進度，留給總複習</small>" : ""}`; }
    return `<div class="ds-plan ${cls}"><div class="ds-ph"><b>${esc(p.name)}</b><span>${c.days >= 0 ? `剩 <b>${c.days}</b> 天` : "結束"}・${md(p.exam_date)}</span></div>
      <div class="ds-bar"><i style="width:${pct}%"></i></div><small>${done}/${c.total} 個知識點學過${compact ? "" : `・${esc(titles.join("、"))}`}</small>
      <p>${msg}</p>${c.notReady ? `<small>（有 ${c.notReady} 個知識點還沒產生題卡，到「🧠 複習」那份資料裡按「繼續產生題卡」）</small>` : ""}
      <div class="tr-row">${c.next && c.days >= 0 ? `<button type="button" class="btn btn-primary btn-small" data-ds="learn" data-v="${c.next}">📖 學下一個單元</button>` : ""}${compact ? "" : `<button type="button" class="btn btn-small" data-ds="delplan" data-v="${p.id}">刪除</button>`}</div></div>`;
  }
  function planInner(compact) {
    if (!D.loaded || D.err) return "";
    const act = D.plans.filter(p => diff(todayStr(), p.exam_date) >= (compact ? 0 : -7));
    if (compact) return act.length ? `<section class="card"><h2>🗓️ 考試排程</h2>${act.map(p => planRow(p, true)).join("")}</section>` : "";
    return `${act.length ? act.map(p => planRow(p)).join("") : `<p class="tr-note">輸入考試日期、勾選要讀的複習資料，系統會依「還沒學的知識點 ÷ 剩下的天數」每天告訴你今天要學幾個，進度落後會自動重新分配。</p>`}
      <button type="button" class="btn" data-ds="addplan" style="width:100%;margin-top:6px">＋ 新增考試排程</button>`;
  }
  function planModal() {
    if (!D.src.length) return toast("先到「🧠 複習」導入資料，才能排考試進度");
    const m = document.createElement("div"); m.className = "vg-modal";
    m.innerHTML = `<div class="vg-card" style="max-height:88vh;overflow:auto"><div class="vg-title">🗓️ 新增考試排程</div>
      <label class="tw-lab">考試名稱<input id="ds-pn" maxlength="40" placeholder="例如 資料結構期末考"></label>
      <label class="tw-lab">考試日期<input id="ds-pd" type="date" min="${todayStr()}"></label>
      <p class="tc-h4">要讀哪些資料？</p>${D.src.map(s => { const st = srcStat(s.id); return `<label class="ds-ck"><input type="checkbox" data-sid="${s.id}"><span><b>${esc(s.title)}</b><small>${esc(s.subject)}・${st.learned}/${st.n} 個知識點學過</small></span></label>`; }).join("")}
      <button type="button" class="btn btn-primary" data-ok="1" style="width:100%;margin-top:10px">建立</button><button type="button" class="btn" data-vx="1" style="width:100%;margin-top:6px">取消</button></div>`;
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-vx]")) return m.remove();
      if (!e.target.closest("[data-ok]")) return;
      const name = m.querySelector("#ds-pn").value.trim(), date = m.querySelector("#ds-pd").value, ids = [...m.querySelectorAll("[data-sid]:checked")].map(x => Number(x.dataset.sid));
      if (!name) return toast("寫一下考試名稱"); if (!date || date < todayStr()) return toast("選一個今天以後的日期"); if (!ids.length) return toast("至少勾一份資料");
      const { error } = await db.from("kb_plans").insert({ name, exam_date: date, source_ids: ids }); if (error) return toast(error.message);
      m.remove(); await load(); toast("🗓️ 排好了，每天照「今天要學幾個」走就行");
    });
    document.body.appendChild(m);
  }

  /* ---------- 畫面 ---------- */
  function ensurePage() {
    let page = document.querySelector('.page[data-page="dash"]');
    if (!page) { const c = document.querySelector("#app-section > .container"); if (!c) return null;
      page = document.createElement("div"); page.className = "page"; page.dataset.page = "dash"; c.appendChild(page); page.innerHTML = `<div id="ds-root"><section class="card"><p class="tr-note">載入中…</p></section></div>`; }
    if (typeof PAGES !== "undefined" && Array.isArray(PAGES) && !PAGES.includes("dash")) PAGES.push("dash");
    return page;
  }
  function render() {
    const page = ensurePage(); if (!page) return; const root = page.querySelector("#ds-root");
    if (D.err) { root.innerHTML = `<section class="card"><h2>📊 學習儀表板</h2><p class="tr-note">${esc(D.err)}</p></section>`; return; }
    if (!D.loaded) return;
    const t = todayStr(), w0 = weekOf(t), min = f => (f.duration_seconds || 0) / 60;
    const wk = D.fs.filter(f => f.session_date >= w0), lw = D.fs.filter(f => f.session_date < w0), wm = wk.reduce((a, f) => a + min(f), 0), lm = lw.reduce((a, f) => a + min(f), 0);
    const days = Array.from({ length: 7 }, (_, i) => addDays(w0, i)), dm = days.map(d => wk.filter(f => f.session_date === d).reduce((a, f) => a + min(f), 0)), mx = Math.max(60, ...dm);
    const subj = {}; wk.forEach(f => { const k = f.subject || "未分類"; subj[k] = (subj[k] || 0) + min(f); });
    const TS = window.ToeicSys, ts = TS && TS.state && TS.state.loaded ? TS.state : null, est = ts ? TS.estimate() : null, mock = ts && (ts.mocks || []).find(m => m.est), score = est && est.total ? est.total : mock ? mock.est : null;
    const target = ts && ts.set ? ts.set.target : null, kbDue = D.cards.filter(c => c.due && c.due <= t).length;
    /* 各科熟練度 */
    const bySub = {}; D.src.forEach(s => { const st = srcStat(s.id), x = bySub[s.subject] = bySub[s.subject] || { n: 0, learned: 0, m: 0, due: 0, files: 0 }; x.n += st.n; x.learned += st.learned; x.m += st.m * st.n; x.due += st.due; x.files++; });
    const subs = Object.entries(bySub).map(([k, x]) => [k, Object.assign(x, { m: x.n ? x.m / x.n : 0 })]).sort((a, b) => b[1].n - a[1].n);
    const col = m => m >= 0.7 ? "#3fb950" : m >= 0.35 ? "#d29922" : "#f0883e";
    root.innerHTML = `<section class="card"><h2>📊 學習儀表板 <small class="nb-prog">${md(w0)}～${md(addDays(w0, 6))}</small></h2>
        <div class="ds-kpi"><div><small>多益預估</small><b>${score || "—"}</b><small>${target ? `目標 ${target}${score ? `・差 ${Math.max(0, target - score)}` : ""}` : score ? "分" : "做滿 10 題後出現"}</small></div>
          <div><small>本週專注</small><b>${(wm / 60).toFixed(1)}</b><small>小時${lm ? `・上週 ${(lm / 60).toFixed(1)}` : ""}</small></div>
          <div><small>今天待複習</small><b>${kbDue + D.vocabDue}</b><small>題卡 ${kbDue}・單字 ${D.vocabDue}</small></div>
          <div><small>知識點</small><b>${D.pts.filter(p => p.learned_at).length}</b><small>學過／共 ${D.pts.length}</small></div></div></section>
      <section class="card"><h2>⏱️ 本週專注</h2>
        <div class="ds-days">${days.map((d, i) => `<div class="${d === t ? "t" : ""}"><span>${dm[i] ? Math.round(dm[i]) : ""}</span><i style="height:${dm[i] / mx * 100}%"></i><small>${"一二三四五六日"[i]}</small></div>`).join("")}</div>
        ${Object.keys(subj).length ? `<div class="ds-subj">${Object.entries(subj).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `<div><span>${esc(k)}</span><div class="ds-bar"><i style="width:${v / wm * 100}%"></i></div><em>${hm(v)}</em></div>`).join("")}</div>` : `<p class="tr-note">這週還沒有專注紀錄。</p>`}</section>
      <section class="card"><h2>🧠 各科複習熟練度</h2>
        ${subs.length ? subs.map(([k, x]) => `<div class="ds-sub"><div class="ds-ph"><b>${esc(k)}</b><span style="color:${col(x.m)}"><b>${Math.round(x.m * 100)}%</b></span></div><div class="ds-bar"><i style="width:${x.m * 100}%;background:${col(x.m)}"></i></div>
          <small>${x.files} 份資料・學過 ${x.learned}/${x.n} 個知識點${x.due ? `・${x.due} 張卡到期` : ""}</small></div>`).join("") : `<p class="tr-note">還沒有複習資料。到「🧠 複習」導入講義後，這裡會顯示每一科記牢了多少。</p>`}
        <p class="tr-note">單字庫共 ${D.vocabN} 個字。熟練度＝每張題卡離下次複習的間隔換算，間隔 14 天以上算記牢。</p></section>
      <section class="card"><h2>🗓️ 考試排程</h2>${planInner(false)}</section>
      <section class="card"><details${D.useOpen ? " open" : ""} data-ds="usebox"><summary><b>🧹 功能使用率</b>（最近 30 天）</summary>${useHtml()}</details></section>`;
  }

  /* ---------- 功能使用率 ---------- */
  function useHtml() {
    const agg = {}; D.use.forEach(u => { const x = agg[u.key] = agg[u.key] || { n: 0, days: new Set(), label: u.label, last: u.day }; x.n += u.n; x.days.add(u.day); if (u.label) x.label = u.label; if (u.day > x.last) x.last = u.day; });
    const first = D.use.reduce((a, u) => (u.day < a ? u.day : a), todayStr()), span = diff(first, todayStr()) + 1;
    const name = k => k.startsWith("page:") ? PAGE_NAME[k.slice(5)] || k.slice(5) : (agg[k] && agg[k].label) || k.slice(5);
    const rows = k => Object.entries(agg).filter(([key]) => key.startsWith(k)).sort((a, b) => b[1].n - a[1].n);
    const pages = rows("page:"), cards = rows("card:"), mx = Math.max(1, ...pages.concat(cards).map(([, x]) => x.n));
    const never = (typeof PAGES !== "undefined" ? PAGES : Object.keys(PAGE_NAME)).filter(p => !agg["page:" + p]).map(p => PAGE_NAME[p] || p);
    const cardNever = [...document.querySelectorAll('.page[data-page="today"] .card[id]')].filter(c => !agg["card:" + c.id]).map(c => (c.querySelector("h2, h3") || c).textContent.trim().slice(0, 14)).filter(Boolean);
    const tbl = L => L.map(([k, x]) => `<div class="ds-u"><span>${esc(name(k))}</span><div class="ds-bar"><i style="width:${x.n / mx * 100}%"></i></div><em>${x.n} 次・${x.days.size} 天</em></div>`).join("");
    return `<p class="tr-note">從 ${md(first)} 開始記錄，目前有 ${span} 天的資料${span < 14 ? "（至少看兩週再決定要不要收掉功能）" : ""}。只記「點了哪個功能幾次」，不記內容。</p>
      ${pages.length ? `<p class="tc-h4">分頁</p>${tbl(pages)}` : `<p class="tr-note">還沒有紀錄，用一陣子再回來看。</p>`}
      ${cards.length ? `<p class="tc-h4">今日頁的卡片（有點過裡面的東西才算）</p>${tbl(cards)}` : ""}
      ${never.length ? `<p class="tc-h4">這段期間完全沒開過的分頁</p><p class="ds-never">${never.map(esc).join("、")}</p>` : ""}
      ${cardNever.length ? `<p class="tc-h4">今日頁沒點過的卡片</p><p class="ds-never">${cardNever.map(esc).join("、")}</p><p class="tr-note">沒在用的卡片，可以用今日頁上方的「📂 收起卡片」收起來，畫面會清爽很多。</p>` : ""}`;
  }
  const Q = {}, lastHit = {};
  function bump(key, label) { const now = Date.now(); if (now - (lastHit[key] || 0) < 10000) return; lastHit[key] = now; const x = Q[key] = Q[key] || { k: key, l: label || null, n: 0 }; x.n++; }
  async function flush() { const rows = Object.values(Q); if (!rows.length || !hasDb()) return; rows.forEach(r => delete Q[r.k]); try { await db.rpc("usage_bump", { p: rows }); } catch (_) {} }
  setInterval(flush, 20000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
  document.addEventListener("click", e => { const c = e.target.closest && e.target.closest('.page[data-page="today"] .card[id]'); if (c) bump("card:" + c.id, ((c.querySelector("h2, h3") || {}).textContent || c.id).trim().slice(0, 20)); }, true);

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-ds]"); if (!b) return; const a = b.dataset.ds;
    if (a === "addplan") return planModal();
    if (a === "learn") { if (window.KB && window.KB.learn) { await window.KB.load(); window.KB.learn(Number(b.dataset.v)); } return; }
    if (a === "delplan") { if (!confirm("刪除這個考試排程？（複習資料和紀錄不會被刪）")) return; const { error } = await db.from("kb_plans").delete().eq("id", Number(b.dataset.v)); if (error) return toast(error.message); return load(); }
  });
  document.addEventListener("toggle", e => { if (e.target.dataset && e.target.dataset.ds === "usebox") D.useOpen = e.target.open; }, true);

  const st = document.createElement("style");
  st.textContent = `
    .ds-kpi { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; } @media (min-width: 560px) { .ds-kpi { grid-template-columns: repeat(4, 1fr); } }
    .ds-kpi > div { background: rgba(127,127,127,.08); border-radius: 12px; padding: 10px 6px; text-align: center; } .ds-kpi b { display: block; font-size: 26px; line-height: 1.2; } .ds-kpi small { font-size: 11px; opacity: .65; }
    .ds-days { display: flex; gap: 6px; height: 120px; align-items: flex-end; margin: 6px 0 12px; } .ds-days > div { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 2px; }
    .ds-days i { width: 100%; max-width: 34px; min-height: 2px; border-radius: 6px 6px 0 0; background: #7c5cff; opacity: .75; } .ds-days .t i { opacity: 1; background: #3fb950; } .ds-days span { font-size: 10.5px; opacity: .7; } .ds-days small { font-size: 11px; opacity: .65; }
    .ds-bar { height: 8px; border-radius: 4px; background: rgba(127,127,127,.18); overflow: hidden; } .ds-bar i { display: block; height: 100%; background: #7c5cff; border-radius: 4px; }
    .ds-subj > div, .ds-u { display: grid; grid-template-columns: 88px 1fr auto; gap: 8px; align-items: center; font-size: 12.5px; padding: 3px 0; } .ds-subj span, .ds-u span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ds-subj em, .ds-u em { font-style: normal; opacity: .7; font-size: 11.5px; white-space: nowrap; }
    .ds-u { grid-template-columns: 110px 1fr auto; }
    .ds-sub, .ds-plan { padding: 8px 0; border-top: 1px solid rgba(127,127,127,.15); } .ds-sub small, .ds-plan small { font-size: 11.5px; opacity: .65; }
    .ds-ph { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 4px; font-size: 14px; } .ds-ph span { font-size: 12.5px; white-space: nowrap; }
    .ds-plan p { font-size: 13.5px; margin: 6px 0; line-height: 1.6; } .ds-plan.ok p { color: #3fb950; } .ds-plan.warn p { color: #f0883e; } .ds-plan .tr-row { margin-top: 4px; }
    .ds-ck { display: flex; gap: 10px; align-items: center; padding: 7px 2px; border-top: 1px solid rgba(127,127,127,.15); cursor: pointer; } .ds-ck input { width: 20px; height: 20px; flex: none; } .ds-ck b { display: block; font-size: 14px; } .ds-ck small { font-size: 11.5px; opacity: .65; }
    .ds-never { font-size: 13px; opacity: .8; line-height: 1.7; }`;
  document.head.appendChild(st);

  if (typeof window.applyPage === "function") { const base = window.applyPage; window.applyPage = function (name) { const r = base.apply(this, arguments); try { bump("page:" + name); } catch (_) {}
    if (name === "dash" || name === "kb") setTimeout(() => { ensurePage(); load(); }, name === "kb" ? 400 : 0); return r; }; }
  (function boot(n) { if (!hasDb()) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; } ensurePage(); load(); })(0);
  window.Dash = { load };
  window.KBPlan = { html: () => `<div id="dash-kbplan">${planInner(true)}</div>` };
})();
