/* 🎯 多益系統：每天自動排練習（單字＋Part 5＋Part 2＋錯題複習），週日小模考
   ‧ 題庫：toeic-bank.js 內建原創題＋AI 依弱點出新題（edge function「toeic」）
   ‧ 聲音：AI 語音（Gemini TTS，存在 Storage 快取），失敗就改用瀏覽器語音
   ‧ 錯題依遺忘曲線 1→3→7→14 天再出現
   資料：sql/2026-11-12_多益系統.sql */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const B = () => window.TOEIC_BANK;
  const todayStr = () => { const d = new Date(Date.now() + 8 * 3600e3 - 6 * 3600e3); return d.toISOString().slice(0, 10); }; /* 早上 6 點換日 */
  const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const hashN = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

  /* AI 診斷後的每日練習調整（7 天有效） */
  const adj = () => { const a = T.set && T.set.plan_adj; return a && a.until >= todayStr() ? a : {}; };
  /* 最弱的 Part 5 文法點（至少做過 5 題、正確率低於 65%） */
  function weakTag() {
    const st = tagStats(5), f = (adj().focus || [])[0];
    const w = Object.entries(st).filter(([, v]) => v.n >= 5 && v.acc < 0.65).sort((a, b) => a[1].acc - b[1].acc)[0];
    return w ? w[0] : f || null;
  }
  const T = { set: null, ans: [], review: [], ai: [], mocks: [], vocabToday: 0, loaded: false, err: null };

  /* ---------- 題目 ---------- */
  const toQ = (r, part) => ({ id: r[0], part, tag: r[1], q: r[2], o: r[3], a: r[4], zh: r[5], why: r[6] });
  function allQs() {
    const b = B(); if (!b) return [];
    return b.P5.map(r => toQ(r, 5)).concat(b.P2.map(r => toQ(r, 2))).concat(T.ai.filter(x => !x.flagged).map(x => ({ id: x.id, part: x.part, tag: x.tag, ai: true, ...x.data })));
  }
  const qById = id => allQs().find(q => q.id === id) || (window.ToeicTest ? window.ToeicTest.getQ(id) : null);
  const REASONS = ["單字不會", "聽不出來", "文法不懂", "陷阱題", "時間不夠", "粗心"];
  /* 練習時靈獸切換成「專注陪讀」 */
  function studyFocus(m) {
    window.__studyFocus = true; if (window.Spirit && window.Spirit.render) window.Spirit.render();
    const ob = new MutationObserver(() => { if (!m.isConnected) { ob.disconnect(); if (!document.querySelector(".tc-modal")) { window.__studyFocus = false; if (window.Spirit && window.Spirit.render) window.Spirit.render(); } } });
    ob.observe(document.body, { childList: true });
  }
  function tagStats(part) {
    const tags = Object.keys(part === 5 ? B().TAGS5 : B().TAGS2), st = {};
    tags.forEach(t => { st[t] = { n: 0, ok: 0 }; });
    T.ans.filter(a => a.part === part).slice(0, 400).forEach(a => { if (st[a.tag]) { st[a.tag].n++; if (a.correct) st[a.tag].ok++; } });
    const fo = part === 5 ? adj().focus || [] : [];
    tags.forEach(t => { const s = st[t]; s.acc = s.n ? s.ok / s.n : null; s.w = (s.n < 3 ? 1.3 : 0.4 + (1 - s.acc) * 1.6) * (fo.includes(t) ? 1.8 : 1); });
    return st;
  }
  /* 依弱點加權挑題：沒做過的優先，弱的類型多出 */
  function pick(part, n) {
    const st = tagStats(part), seen = new Set(T.ans.map(a => a.qid)), pool = allQs().filter(q => q.part === part);
    const out = [], used = new Set();
    for (let k = 0; k < n; k++) {
      const tags = Object.keys(st), tot = tags.reduce((s, t) => s + st[t].w, 0); let r = Math.random() * tot, tag = tags[0];
      for (const t of tags) { r -= st[t].w; if (r <= 0) { tag = t; break; } }
      const cand = pool.filter(q => q.tag === tag && !used.has(q.id)), fresh = cand.filter(q => !seen.has(q.id));
      const q = (fresh.length ? shuffle(fresh) : shuffle(cand))[0] || shuffle(pool.filter(q => !used.has(q.id)))[0];
      if (!q) break; used.add(q.id); out.push(q);
    }
    return out;
  }
  /* 某類型沒做過的題目快用完了，背景請 AI 補 5 題 */
  let genBusy = false;
  async function topUp(part) {
    if (genBusy || !hasDb()) return; const st = tagStats(part), seen = new Set(T.ans.map(a => a.qid)), pool = allQs().filter(q => q.part === part);
    const need = Object.keys(st).map(t => [t, pool.filter(q => q.tag === t && !seen.has(q.id)).length, st[t].w]).filter(x => x[1] < 3).sort((a, b) => b[2] - a[2])[0];
    if (!need) return; genBusy = true;
    try {
      const tagName = (part === 5 ? B().TAGS5 : B().TAGS2)[need[0]].name;
      const { data, error } = await db.functions.invoke("toeic", { body: { action: "gen", part, tag: need[0] + "（" + tagName + "）", n: 6, avoid: pool.filter(q => q.tag === need[0]).map(q => q.q) } });
      if (!error && data && data.items) data.items.forEach(x => { x.tag = need[0]; T.ai.push(x); });
      if (!error && data && data.items && data.items.length) await db.from("toeic_qbank").update({ tag: need[0] }).in("id", data.items.map(x => x.id));
    } catch (_) {} genBusy = false;
  }

  /* ---------- 聲音 ---------- */
  const AUD = {}, VO = ["us_m", "uk_f", "au_m", "ca_f", "us_f", "uk_m"];
  const LANG = { us_m: "en-US", us_f: "en-US", uk_m: "en-GB", uk_f: "en-GB", au_m: "en-AU", ca_f: "en-CA" };
  async function audioUrl(text, voice) {
    const k = voice + "|" + text; if (AUD[k]) return AUD[k];
    AUD[k] = (async () => { const { data, error } = await db.functions.invoke("toeic", { body: { action: "tts", text, voice } }); if (error || !data || !data.url) throw new Error((data && data.error) || "語音失敗"); return data.url; })();
    AUD[k].catch(() => { delete AUD[k]; });
    return AUD[k];
  }
  let curAudio = null;
  function stopAudio() { if (curAudio) { curAudio.pause(); curAudio = null; } try { speechSynthesis.cancel(); } catch (_) {} }
  function speakBrowser(text, voice) {
    return new Promise(res => { try { const u = new SpeechSynthesisUtterance(text), lang = LANG[voice] || "en-US"; u.lang = lang; u.rate = 0.95;
      const vs = speechSynthesis.getVoices().filter(v => v.lang && v.lang.replace("_", "-").startsWith(lang)); if (vs.length) u.voice = vs[hashN(voice) % vs.length];
      u.onend = res; u.onerror = res; speechSynthesis.speak(u); } catch (_) { res(); } });
  }
  async function say(text, voice) {
    if ((T.set && T.set.voice) !== "browser") {
      try { const url = await audioUrl(text, voice); await new Promise((res, rej) => { const a = new Audio(url); curAudio = a; a.onended = res; a.onerror = rej; a.play().catch(rej); }); return; }
      catch (_) { if (!say.warned) { say.warned = true; toast("AI 語音暫時不能用，先改用瀏覽器語音"); } }
    }
    await speakBrowser(text, voice);
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const voicesOf = q => { const h = hashN(q.id), a = VO[h % VO.length]; let b = VO[(h + 3) % VO.length]; if (b === a) b = VO[(h + 1) % VO.length]; return [a, b]; };
  function preload(q) { if (!q || q.part !== 2 || (T.set && T.set.voice) === "browser") return; const [a, b] = voicesOf(q); audioUrl(q.q, a).catch(() => {}); q.o.forEach(o => audioUrl(o, b).catch(() => {})); }

  /* ---------- 讀資料 ---------- */
  async function load() {
    if (!hasDb()) return;
    const t = todayStr();
    if (window.ToeicTest) { try { await window.ToeicTest.ensure(); } catch (_) {} }
    const [s, a, r, ai, m, v, rs, bo, sk, rdg, cw] = await Promise.all([
      db.from("toeic_settings").select("*").maybeSingle(),
      db.from("toeic_answers").select("qid, part, tag, correct, mode, day, created_at").order("created_at", { ascending: false }).limit(1500),
      db.from("toeic_review").select("*"),
      db.from("toeic_qbank").select("*").order("created_at", { ascending: false }).limit(500),
      db.from("toeic_mocks").select("*").order("created_at", { ascending: false }).limit(20),
      db.from("vocab_log").select("id", { count: "exact", head: true }).eq("day", t),
      db.from("toeic_reasons").select("reason, part, tag, day").order("created_at", { ascending: false }).limit(500),
      db.rpc("toeic_boss"), db.rpc("toeic_streak"),
      db.from("toeic_reading").select("words, secs, wpm, correct, total, day, created_at").order("created_at", { ascending: false }).limit(300),
      db.from("vocab_words").select("deck").like("deck", "多益核心%")]);
    if (s.error && /toeic_settings/.test(s.error.message)) { T.err = "資料庫還沒設定：到 Supabase 執行 sql/2026-11-12_多益系統.sql"; T.loaded = true; render(); return; }
    T.set = s.data || { exam_date: addDays(t, 90), target: 650, start_score: 400, daily_min: 45, voice: "ai", _new: true };
    T.ans = a.data || []; T.review = r.data || []; T.ai = ai.data || []; T.mocks = m.data || []; T.vocabToday = v.count || 0; T.reasons = rs.data || []; T.boss = bo.data || null; T.streak = sk.data || { cur: 0, best: 0 }; T.reading = rdg.data || []; T.core = {}; (cw.data || []).forEach(x => { T.core[x.deck] = (T.core[x.deck] || 0) + 1; }); T.loaded = true; T.err = null;
    render(); renderToday();
  }

  /* ---------- 每日計畫 ---------- */
  function plan() {
    const s = T.set, t = todayStr(), dow = new Date(t + "T00:00:00Z").getUTCDay(), mins = s.daily_min || 45;
    const daysLeft = s.exam_date ? Math.round((new Date(s.exam_date) - new Date(t)) / 864e5) : null;
    const due = T.review.filter(x => x.due <= t).length, done = m => T.ans.filter(a => a.day === t && a.mode === m).length;
    const sz = mins <= 30 ? { v: 15, p5: 10, p2: 8 } : mins <= 45 ? { v: 20, p5: 12, p2: 10 } : { v: 25, p5: 15, p2: 12 };
    /* 🏁 考前衝刺：14 天內少做新題、多複習錯題；最後 3 天只做輕量練習＋秒殺技巧回顧 */
    const sprint = daysLeft != null && daysLeft >= 0 && daysLeft <= 14 ? (daysLeft <= 3 ? "final" : "sprint") : null;
    if (sprint === "sprint") { sz.p5 = Math.round(sz.p5 * 0.6); sz.p2 = Math.round(sz.p2 * 0.6); }
    if (sprint === "final") { sz.p5 = 5; sz.p2 = 5; sz.v = 10; }
    const A = adj(); if (A.until && sprint !== "final") { sz.p2 = Math.max(5, Math.round(sz.p2 * (A.p2 || 1))); sz.p5 = Math.max(5, Math.round(sz.p5 * (A.p5 || 1))); }
    const tasks = [];
    if (sprint !== "final" && (dow === 0 || (daysLeft != null && daysLeft <= 7 && daysLeft > 3 && dow === 3))) tasks.push({ k: "mock", icon: "📝", name: "小模考（Part 2 ×15＋Part 5 ×20）", need: 35, have: done("mock"), min: 25 });
    else {
      tasks.push({ k: "vocab", icon: "📚", name: `單字 ${sz.v} 個（到「📖 單字」練）`, need: sz.v, have: T.vocabToday, min: 10, ext: true });
      tasks.push({ k: "p2", icon: "🎧", name: `聽力 Part 2 應答 ×${sz.p2}`, need: sz.p2, have: done("p2"), min: 10 });
      tasks.push({ k: "p5", icon: "✏️", name: `閱讀 Part 5 文法單字 ×${sz.p5}`, need: sz.p5, have: done("p5"), min: 10 });
    }
    const rcap = Math.round((sprint === "sprint" ? 30 : 15) * (A.until ? A.review || 1 : 1));
    if (due) tasks.push({ k: "review", icon: "🔁", name: `錯題複習 ×${Math.min(due, rcap)}`, need: Math.min(due, rcap), have: done("review"), min: sprint === "sprint" ? 15 : 5 });
    const wt = sprint === "final" ? null : weakTag();
    if (wt && dow !== 0) tasks.push({ k: "weak", icon: "🗺️", name: `弱點專練：${B().TAGS5[wt].name} ×8`, need: 8, have: done("weak"), min: 6, tag: wt });
    if (sprint === "final") { let seen = false; try { seen = localStorage.getItem("tcTips:" + t) === "1"; } catch (_) {} tasks.push({ k: "tips", icon: "⚡", name: "秒殺技巧回顧（20 種題型）", need: 1, have: seen ? 1 : 0, min: 10, tips: true }); }
    if (mins >= 60 && dow !== 0) tasks.push({ k: "bonus", icon: "🚀", name: "加碼：弱點題 ×10", need: 10, have: done("bonus"), min: 8, opt: true });
    tasks.forEach(x => { x.ok = x.have >= x.need; });
    return { tasks, daysLeft, due, sprint, adj: A };
  }
  /* 預估分數：近 150 題正確率換算（粗估，模考會更準） */
  function estimate() {
    const acc = p => { const a = T.ans.filter(x => x.part === p).slice(0, 150); return a.length >= 10 ? a.filter(x => x.correct).length / a.length : null; };
    const a2 = acc(2), a5 = acc(5), r5 = v => Math.max(5, Math.min(495, Math.round(v / 5) * 5));
    const L = a2 == null ? null : r5(60 + a2 * 430), R = a5 == null ? null : r5(40 + a5 * 440);
    return { L, R, total: L != null && R != null ? L + R : null, a2, a5 };
  }

  /* ---------- 畫面 ---------- */
  function ensurePage() {
    let page = document.querySelector('.page[data-page="toeic"]');
    if (!page) {
      const c = document.querySelector("#app-section > .container"); if (!c) return null;
      page = document.createElement("div"); page.className = "page"; page.dataset.page = "toeic"; c.appendChild(page);
      page.innerHTML = `<div id="tc-root"><section class="card"><p class="tr-note">載入中…</p></section></div>`;
      page.addEventListener("click", onClick); page.addEventListener("change", onChange);
    }
    if (typeof PAGES !== "undefined" && Array.isArray(PAGES) && !PAGES.includes("toeic")) PAGES.push("toeic");
    return page;
  }
  const pct = v => v == null ? "—" : Math.round(v * 100) + "%";
  function render() {
    const page = ensurePage(); if (!page) return; const root = page.querySelector("#tc-root");
    if (T.err) { root.innerHTML = `<section class="card"><h2>🎯 多益</h2><p class="tr-note">${esc(T.err)}</p></section>`; return; }
    if (!T.loaded || !B()) return;
    const s = T.set, P = plan(), E = estimate(), allDone = P.tasks.filter(x => !x.opt).every(x => x.ok), st5 = tagStats(5), st2 = tagStats(2);
    const weak = [...Object.entries(st5).map(([k, v]) => [5, k, v]), ...Object.entries(st2).map(([k, v]) => [2, k, v])].filter(x => x[2].n >= 3).sort((a, b) => a[2].acc - b[2].acc).slice(0, 3);
    const tagRow = (part, k, v) => { const nm = (part === 5 ? B().TAGS5 : B().TAGS2)[k].name; return `<div class="tc-tag" data-tc="tip" data-part="${part}" data-v="${k}"><span>${esc(nm)}</span><div class="sk-bar"><i style="width:${v.acc == null ? 0 : v.acc * 100}%;background:${v.acc == null ? "#888" : v.acc >= 0.75 ? "#3fb950" : v.acc >= 0.5 ? "#e3b341" : "#f85149"}"></i></div><b>${v.n ? pct(v.acc) : "—"}</b><small>${v.n} 題</small></div>`; };
    root.innerHTML = `
      <section class="card tc-hero"><div class="tc-top"><div><h2 style="margin:0">🎯 多益 ${s.target} 計畫</h2>
          <p class="tr-note">${P.daysLeft == null ? "還沒設定考試日期" : P.daysLeft > 0 ? `距離考試還有 <b>${P.daysLeft}</b> 天（${s.exam_date}）` : P.daysLeft === 0 ? "🔥 今天考試，加油！" : "考試已結束，可以設定下一次的日期"}・每天約 ${s.daily_min} 分鐘</p></div>
          <button type="button" class="tr-x" data-tc="set" title="設定">⚙️</button></div>
        <div class="tc-score"><div><small>預估總分</small><b>${E.total ?? "—"}</b><small>目標 ${s.target}</small></div><div><small>🎧 聽力</small><b>${E.L ?? "—"}</b><small>Part 2 ${pct(E.a2)}</small></div><div><small>📖 閱讀</small><b>${E.R ?? "—"}</b><small>Part 5 ${pct(E.a5)}</small></div></div>
        ${E.total != null ? `<div class="tc-prog"><i style="width:${Math.min(100, Math.max(0, (E.total - s.start_score) / Math.max(1, s.target - s.start_score) * 100))}%"></i></div><p class="tr-note">從 ${s.start_score} 到 ${s.target}：${E.total >= s.target ? "🎉 預估已經達標！繼續保持" : `還差約 ${s.target - E.total} 分`}（每個 Part 做滿 10 題後才會開始預估，只看 Part 2、5，所以是粗估）</p>` : `<p class="tr-note">每個 Part 做滿 10 題後，就會開始預估分數。</p>`}
        <div class="tc-flame"><span>🔥 連續 <b>${(T.streak && T.streak.cur) || 0}</b> 天完成多益任務</span><small>最長 ${(T.streak && T.streak.best) || 0} 天・7／30／100 天有獎勵</small></div>
        ${P.sprint ? `<p class="tc-sprint">${P.sprint === "final" ? "🧘 考前最後 3 天：只做輕量練習＋回顧秒殺技巧，保持手感、早點睡。" : "🏁 考前衝刺模式：新題減少、錯題複習加倍，把會錯的變成不會錯。"}</p>` : ""}
        ${s._new ? `<p class="tc-new">👋 第一次來：我先幫你設定成「90 天後考、目標 650、每天 45 分鐘」，按右上角 ⚙️ 可以改。</p>` : ""}</section>
      <section class="card"><h2>📅 今天的練習 ${allDone ? "✅" : ""}</h2>
        ${P.tasks.map(x => `<div class="tc-task ${x.ok ? "ok" : ""}"><span class="tc-ic">${x.ok ? "✅" : x.icon}</span><div><b>${esc(x.name)}</b><small>${Math.min(x.have, x.need)}/${x.need}・約 ${x.min} 分鐘${x.opt ? "・選做" : ""}</small><div class="tc-mini"><i style="width:${Math.min(100, x.have / x.need * 100)}%"></i></div></div>
          ${x.tips ? `<button type="button" class="btn btn-small ${x.ok ? "" : "btn-primary"}" data-tc="tips">${x.ok ? "再看" : "打開"}</button>` : x.ext ? `<button type="button" class="btn btn-small" onclick="showPage('vocab')">去背</button>` : `<button type="button" class="btn btn-small ${x.ok ? "" : "btn-primary"}" data-tc="go" data-v="${x.k}">${x.ok ? "再練" : "開始"}</button>`}</div>`).join("")}
        <button type="button" class="btn tc-cmb" data-tcg="commute">🚇 通勤純聽：今天的對話＋錯題＋單字，關螢幕也能播</button>
        ${P.adj && P.adj.until ? `<p class="tr-note">🤖 依最近一次模考的 AI 診斷調整中（到 ${P.adj.until.slice(5).replace("-", "/")}）</p>` : ""}
        <p class="tr-note">${allDone ? "🎉 今天的份都完成了！多做的題目一樣會算進分數和弱點分析。" : "照順序做就好：先聽力（腦袋最清醒時）、再文法，最後複習錯題。每完成一項都有星屑。"}</p></section>
      <section class="card"><h2>🧭 弱點分析</h2>
        ${weak.length ? `<p class="tc-weak">最需要加強：${weak.map(([p, k, v]) => `<b>${esc((p === 5 ? B().TAGS5 : B().TAGS2)[k].name)}</b>（${pct(v.acc)}）`).join("、")}。出題會自動多給你這幾類。</p>` : `<p class="tr-note">每一類做滿 3 題後，這裡會告訴你最弱的是哪些。</p>`}
        ${heatHtml()}
        <details class="sk-dim"><summary><span>🎧 Part 2 應答</span></summary>${Object.entries(st2).map(([k, v]) => tagRow(2, k, v)).join("")}</details>
        <details class="sk-dim"><summary><span>✏️ Part 5 文法單字（長條圖）</span></summary>${Object.entries(st5).map(([k, v]) => tagRow(5, k, v)).join("")}</details>
        <p class="tr-note">點任一類，可以看它的「秒殺技巧」或專練這一類。</p></section>
      <section class="card"><h2>🔁 錯題本</h2><p class="tr-note">答錯的題目會在 1 → 3 → 7 → 14 天後再出現，連續答對 4 次就畢業。目前 ${T.review.length} 題在本子裡，今天到期 ${P.due} 題。</p>
        <div class="tr-row"><button type="button" class="btn btn-small" data-tc="go" data-v="review" ${P.due ? "" : "disabled"}>🔁 複習到期的</button><button type="button" class="btn btn-small" data-tc="go" data-v="mock">📝 現在來一次小模考</button></div>
        ${T.mocks.length ? `<div class="tc-mocks">${T.mocks.slice(0, 8).reverse().map(m => `<div><b>${m.est}</b><small>${new Date(m.created_at).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" })}</small></div>`).join("")}</div><p class="tr-note">↑ 最近幾次小模考的預估總分</p>` : ""}</section>
      ${diagHtml()}${growthHtml()}${readHtml()}${reportHtml()}${wordsHtml()}${bossHtml()}
      <p class="tr-note small" style="padding:0 6px">題目都是原創的模擬題（內建 ${B().P5.length + B().P2.length} 題＋AI 已出 ${T.ai.length} 題），預估分數只是參考，實際分數以官方考試為準。</p>`;
  }

  function renderToday() {
    const tp = document.querySelector('.page[data-page="today"]'); if (!tp || !T.loaded || T.err || !B()) return;
    let box = document.getElementById("tc-today");
    if (!box) { box = document.createElement("section"); box.id = "tc-today"; box.className = "card"; const ref = document.getElementById("tw-today"); ref ? ref.after(box) : tp.appendChild(box); }
    const P = plan(), left = P.tasks.filter(x => !x.ok && !x.opt), E = estimate();
    box.innerHTML = `<h2>🎯 今日多益 ${left.length ? `<small class="nb-prog">${P.tasks.filter(x => x.ok).length}/${P.tasks.length}</small>` : "✅"}</h2>
      <p class="tr-note">${T.streak && T.streak.cur ? `🔥 ${T.streak.cur} 天・` : ""}${P.daysLeft != null && P.daysLeft >= 0 ? `倒數 ${P.daysLeft} 天・` : ""}${P.sprint ? "🏁 衝刺中・" : ""}預估 ${E.total ?? "—"} / ${T.set.target}</p>
      ${left.length ? `<ul class="tr-sig">${left.map(x => `<li>${x.icon} ${esc(x.name)} <small>${x.have}/${x.need}</small></li>`).join("")}</ul><button type="button" class="btn btn-primary" style="width:100%" data-tcg="${left[0].ext ? "vocab" : left[0].k}">${left[0].ext ? "📚 去背單字" : "▶️ 開始練習"}</button>` : `<p>🎉 今天的多益練習都完成了！</p>`}
      <button type="button" class="btn" style="width:100%;margin-top:6px" data-tcg="commute">🚇 通勤純聽</button>`;
  }

  /* ---------- 📈 分數成長曲線＋預測 ---------- */
  const weekOf = d => { const x = new Date(d + "T00:00:00Z"), w = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - w); return x.toISOString().slice(0, 10); };
  const r5 = v => Math.max(5, Math.min(495, Math.round(v / 5) * 5));
  function growthPoints() {
    const W = {}; T.ans.forEach(a => { if (a.part !== 2 && a.part !== 5) return; const k = weekOf(a.day); W[k] = W[k] || { 2: [0, 0], 5: [0, 0] }; W[k][a.part][1]++; if (a.correct) W[k][a.part][0]++; });
    const pts = Object.entries(W).filter(([, w]) => w[2][1] >= 8 && w[5][1] >= 8).map(([k, w]) => ({ t: new Date(k + "T00:00:00Z").getTime() + 3 * 864e5, v: r5(60 + w[2][0] / w[2][1] * 430) + r5(40 + w[5][0] / w[5][1] * 440), kind: "週" }));
    T.mocks.forEach(m => { if (m.est) pts.push({ t: new Date(m.created_at).getTime(), v: m.est, kind: "模考" }); });
    return pts.sort((a, b) => a.t - b.t);
  }
  function growthHtml() {
    const pts = growthPoints(), s = T.set;
    if (pts.length < 2) return `<section class="card"><h2>📈 分數成長</h2><p class="tr-note">每週 Part 2、Part 5 各做滿 8 題，或做一次模考，就會在這裡畫出你的分數曲線和「考試當天預測」。目前還差一點資料。</p></section>`;
    const n = pts.length, mx = pts.reduce((a, p) => a + p.t, 0) / n, my = pts.reduce((a, p) => a + p.v, 0) / n;
    const sl = pts.reduce((a, p) => a + (p.t - mx) * (p.v - my), 0) / (pts.reduce((a, p) => a + (p.t - mx) ** 2, 0) || 1);
    const ex = s.exam_date ? new Date(s.exam_date + "T00:00:00Z").getTime() : null, pred = ex ? Math.round(Math.max(10, Math.min(990, my + sl * (ex - mx)))) : null;
    const t0 = pts[0].t, t1 = Math.max(pts[n - 1].t, ex || 0), vs = pts.map(p => p.v).concat([s.target, pred || s.target]), lo = Math.min(...vs) - 30, hi = Math.max(...vs) + 30;
    const Wd = 640, H = 200, x = t => 10 + (t - t0) / (t1 - t0 || 1) * (Wd - 20), y = v => 10 + (1 - (v - lo) / (hi - lo)) * (H - 30);
    const perWeek = Math.round(sl * 7 * 864e5);
    return `<section class="card"><h2>📈 分數成長</h2>
      <svg class="tr-chart" style="height:200px" viewBox="0 0 ${Wd} ${H}" preserveAspectRatio="none">
        <line x1="0" x2="${Wd}" y1="${y(s.target)}" y2="${y(s.target)}" class="tc-tg"/><text x="${Wd - 6}" y="${y(s.target) - 4}" text-anchor="end" class="tr-ax">目標 ${s.target}</text>
        ${pred != null ? `<path d="M${x(pts[n - 1].t)},${y(my + sl * (pts[n - 1].t - mx))}L${x(ex)},${y(pred)}" class="tc-pred"/><circle cx="${x(ex)}" cy="${y(pred)}" r="4" class="tc-predc"/><text x="${x(ex) - 6}" y="${y(pred) - 8}" text-anchor="end" class="tr-ax">考試日 ${pred}</text>` : ""}
        <path d="${pts.map((p, i) => `${i ? "L" : "M"}${x(p.t)},${y(p.v)}`).join("")}" class="tc-line"/>
        ${pts.map(p => `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="${p.kind === "模考" ? 4 : 3}" class="${p.kind === "模考" ? "tc-mk" : "tc-wk"}"/>`).join("")}</svg>
      <p class="tr-note">●綠點＝每週練習換算 ●紫點＝模考・虛線＝照目前速度的預測</p>
      <p class="tc-weak" style="background:rgba(124,92,255,.1)">${pred == null ? "設定考試日期後就能預測。" : `照目前的速度（每週約 ${perWeek >= 0 ? "+" : ""}${perWeek} 分），考試當天大約 <b>${pred}</b> 分。${pred >= s.target ? "🎉 有機會達標，保持下去！" : `離目標還差 ${s.target - pred} 分：${perWeek <= 0 ? "最近沒有在進步，試試多做錯題複習和弱點專練。" : `要達標，每週需要再多進步約 ${Math.ceil((s.target - pred) / Math.max(1, (ex - Date.now()) / 6048e5))} 分。`}`}`}（預測是用直線粗估）</p></section>`;
  }
  /* ---------- 📊 每週讀書報告 ---------- */
  function reportHtml() {
    const wk = weekOf(todayStr()), prev = weekOf(addDays(wk, -1)), inW = (d, w) => d >= w && d < addDays(w, 7);
    const A = T.ans.filter(a => inW(a.day, wk)), Bp = T.ans.filter(a => inW(a.day, prev)), acc = x => x.length ? x.filter(a => a.correct).length / x.length : null;
    const days = new Set(A.map(a => a.day)).size, ra = T.reasons.filter(r => inW(r.day, wk)), rc = {}; ra.forEach(r => { rc[r.reason] = (rc[r.reason] || 0) + 1; });
    const topR = Object.entries(rc).sort((a, b) => b[1] - a[1]).slice(0, 3), ts = {};
    A.filter(a => a.part === 2 || a.part === 5).forEach(a => { const k = a.part + ":" + a.tag; ts[k] = ts[k] || [0, 0]; ts[k][1]++; if (a.correct) ts[k][0]++; });
    const weakT = Object.entries(ts).filter(([, v]) => v[1] >= 3).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]).slice(0, 3).map(([k, v]) => { const [p, tg] = k.split(":"), d = (p === "5" ? B().TAGS5 : B().TAGS2)[tg]; return `${d ? d.name : tg}（${Math.round(v[0] / v[1] * 100)}%）`; });
    const a1 = acc(A), a0 = acc(Bp), dlt = a1 != null && a0 != null ? Math.round((a1 - a0) * 100) : null;
    const ADV = { 單字不會: "多花時間在「📖 單字」，並把模考生字收進單字庫", 聽不出來: "用 Part 3、4 的「🎧 逐句跟讀」，遮字幕先聽", 文法不懂: "點弱點分析裡的題型看秒殺技巧，再專練 8 題", 陷阱題: "答題前先刪掉「重複字、發音像」的選項", 時間不夠: "Part 7 練習時盯著建議時間，超時就先猜", 粗心: "選完答案把句子從頭念一次再送出" };
    const tip = topR.length ? ADV[topR[0][0]] : weakT.length ? `專練「${weakT[0].split("（")[0]}」` : "保持每天的節奏";
    return `<section class="card"><h2>📊 本週讀書報告 <small class="nb-prog">${wk.slice(5).replace("-", "/")} 起</small></h2>
      <div class="tc-score"><div><small>練習天數</small><b>${days}</b><small>/ 7 天</small></div><div><small>做題數</small><b>${A.length}</b><small>上週 ${Bp.length}</small></div><div><small>正確率</small><b>${a1 == null ? "—" : Math.round(a1 * 100) + "%"}</b><small class="${dlt == null ? "" : dlt >= 0 ? "up" : "dn"}">${dlt == null ? "—" : `${dlt >= 0 ? "▲" : "▼"} ${Math.abs(dlt)}%`}</small></div></div>
      <p class="tr-note">🧭 這週最弱：${weakT.length ? weakT.join("、") : "資料還不夠（每類做滿 3 題）"}</p>
      <p class="tr-note">❓ 最常錯的原因：${topR.length ? topR.map(([r, c]) => `${r} ×${c}`).join("、") : "還沒標記過（答錯時點「錯在哪」就會統計）"}</p>
      <p class="tc-weak" style="background:rgba(63,185,80,.1)">👉 下週建議：${tip}。</p></section>`;
  }
  /* ---------- 👹 每週 Boss ---------- */
  const BOSSES = [["📚 遺忘巨像", "專吃你背過的單字"], ["🌀 時態幽靈", "讓過去和未來混在一起"], ["🎭 陷阱魔術師", "最愛重複字和發音陷阱"], ["⏳ 時間吞噬者", "Part 7 讀到一半就收卷"], ["🐉 介系詞巨龍", "in／on／at 傻傻分不清"], ["🦑 長句章魚", "把主詞動詞藏在八條腿裡"]];
  function bossHtml() {
    const b = T.boss; if (!b) return "";
    const wi = Math.floor(new Date(b.week).getTime() / 6048e5) % BOSSES.length, [nm, ds] = BOSSES[wi], left = Math.max(0, b.hp - b.dmg), dead = left === 0;
    return `<section class="card tc-boss ${dead ? "dead" : ""}"><h2>👹 本週 Boss：${nm}</h2><p class="tr-note">${ds}。這週每答對 1 題就打 1 下，模考和完整試題答對算 2 下。週一重生。</p>
      <div class="tc-hp"><i style="width:${left / b.hp * 100}%"></i><span>HP ${left} / ${b.hp}</span></div>
      ${dead ? (b.claimed ? `<p>🏆 這週已經打倒並領過獎勵了！</p>` : `<button type="button" class="btn btn-primary" data-tc="boss" style="width:100%">🏆 領取擊敗獎勵：普通召喚券 ×1＋星屑 200</button>`) : `<p class="tr-note">還差 ${left} 下。做一次完整試題的聽力或閱讀，就能打掉一大半！</p>`}</section>`;
  }
  /* ---------- 🗺️ 文法弱點地圖：Part 5 十種文法點 × 最近 6 週 ---------- */
  function heatHtml() {
    const wk0 = weekOf(todayStr()), weeks = [5, 4, 3, 2, 1, 0].map(k => addDays(wk0, -7 * k)), tags = Object.keys(B().TAGS5), st = tagStats(5), wt = weakTag(), fo = adj().focus || [];
    const C = {}; T.ans.forEach(a => { if (a.part !== 5 || !B().TAGS5[a.tag]) return; const k = a.tag + "|" + weekOf(a.day); C[k] = C[k] || [0, 0]; C[k][1]++; if (a.correct) C[k][0]++; });
    const cell = (ok, n) => n ? `<td style="background:hsla(${Math.round(ok / n * 120)},70%,45%,${0.35 + Math.min(n, 10) / 20})" title="${ok}/${n} 題">${Math.round(ok / n * 100)}</td>` : `<td class="nil">·</td>`;
    if (!T.ans.some(a => a.part === 5 && B().TAGS5[a.tag])) return `<p class="tr-note">🗺️ 做幾題 Part 5 後，這裡會出現「文法弱點地圖」：十種文法點各自的正確率，紅色就是要補的地方。</p>`;
    return `<h3 class="tc-h3">🗺️ 文法弱點地圖 <small>Part 5・數字是正確率 %・顏色越紅越弱</small></h3>
      <div class="tr-scroll"><table class="tc-heat"><tr><th></th>${weeks.map(w => `<th>${w.slice(5).replace("-", "/")}</th>`).join("")}<th>全部</th></tr>
      ${tags.map(t => `<tr data-tc="tip" data-part="5" data-v="${t}"><th>${t === wt ? "🎯 " : fo.includes(t) ? "🤖 " : ""}${esc(B().TAGS5[t].name)}</th>${weeks.map(w => { const c = C[t + "|" + w]; return c ? cell(c[0], c[1]) : `<td class="nil">·</td>`; }).join("")}${cell(st[t].ok, st[t].n)}</tr>`).join("")}</table></div>
      <p class="tr-note">${wt ? `🎯 最弱的是「${esc(B().TAGS5[wt].name)}」，今天的練習多了一項「弱點專練」，每天自動挑最弱的那一類。` : "每一類做滿 5 題後，最弱的那一類會自動變成每日的「弱點專練」。"}${fo.length ? "🤖＝AI 診斷建議加重的類型。" : ""}點任一列可以看秘訣或專練。</p>`;
  }
  /* ---------- 🤖 模考 AI 診斷 ---------- */
  function diagHtml() {
    const m = T.mocks.find(x => x.detail && x.detail.diag), A = adj();
    if (!m) return `<section class="card"><h2>🤖 模考 AI 診斷</h2><p class="tr-note">做一回「📝 完整模擬試題」（任選 Part、至少 20 題），交卷後 AI 會寫一份診斷：分數掉在哪、下週怎麼練，並自動調整每日練習的比例 7 天。</p></section>`;
    const d = m.detail.diag, nm = t => B().TAGS5[t] ? B().TAGS5[t].name : t;
    return `<section class="card"><h2>🤖 模考 AI 診斷 <small class="nb-prog">${new Date(m.created_at).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" })}・預估 ${m.est || "—"}</small></h2>
      <p>${esc(d.summary)}</p>
      ${d.losses && d.losses.length ? `<p class="tc-h4">📉 分數掉在哪</p><ul class="tc-ul">${d.losses.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${d.plan && d.plan.length ? `<p class="tc-h4">🗓️ 下週這樣練</p><ul class="tc-ul">${d.plan.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <p class="tc-weak" style="background:rgba(124,92,255,.1)">${A.until ? `📐 每日練習已自動調整到 ${A.until.slice(5).replace("-", "/")}：Part 2 ×${A.p2}、Part 5 ×${A.p5}、錯題複習 ×${A.review}${A.focus && A.focus.length ? `、加重 ${A.focus.map(nm).join("、")}` : ""}` : "這次診斷的調整已經過期（7 天），做下一回模考會再更新。"}</p></section>`;
  }
  /* ---------- 📖 Part 7 閱讀速度 ---------- */
  function readHtml() {
    const R = T.reading.filter(r => r.wpm >= 20 && r.wpm <= 600 && r.secs >= 15);
    if (!R.length) return `<section class="card"><h2>📖 Part 7 閱讀速度</h2><p class="tr-note">在完整模擬試題做 Part 7 時，每一組文章會自動計時（從看到文章到全部選完），算出你「每分鐘讀幾個字」和答對率，這裡會畫出你有沒有變快。</p></section>`;
    const D = {}; R.forEach(r => { D[r.day] = D[r.day] || { w: 0, s: 0, c: 0, t: 0 }; const x = D[r.day]; x.w += r.words; x.s += r.secs; x.c += r.correct; x.t += r.total; });
    const days = Object.keys(D).sort().slice(-14), pts = days.map(d => ({ d, wpm: Math.round(D[d].w / D[d].s * 60), acc: D[d].c / D[d].t }));
    const last = R.slice(0, 5), lw = Math.round(last.reduce((a, r) => a + r.words, 0) / last.reduce((a, r) => a + r.secs, 0) * 60), la = last.reduce((a, r) => a + r.correct, 0) / last.reduce((a, r) => a + r.total, 0);
    const first = pts[0], lvl = lw < 100 ? ["🐢 偏慢", "照這個速度 Part 7 很可能寫不完：先練「先看題目、再回文章找關鍵字」，不要每個字都讀。"] : lw < 150 ? ["🚶 普通", "再快一點就夠用了：練習略讀，先看每段第一句。"] : lw < 200 ? ["🏃 夠用", "這個速度可以寫完 Part 7，重點放在答對率。"] : ["🚀 很快", "速度沒問題了，注意不要因為太快看錯細節。"];
    const W = 640, H = 150, mx = Math.max(220, ...pts.map(p => p.wpm)), x = i => 20 + i / Math.max(1, pts.length - 1) * (W - 40), y = v => 10 + (1 - v / mx) * (H - 30);
    return `<section class="card"><h2>📖 Part 7 閱讀速度</h2>
      <div class="tc-score"><div><small>最近 5 組</small><b>${lw}</b><small>字／分鐘</small></div><div><small>答對率</small><b>${Math.round(la * 100)}%</b><small>最近 5 組</small></div><div><small>程度</small><b style="font-size:17px">${lvl[0]}</b><small>${pts.length > 1 ? `第一天 ${first.wpm}` : "目標 150+"}</small></div></div>
      ${pts.length > 1 ? `<svg class="tr-chart" style="height:150px" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" x2="${W}" y1="${y(150)}" y2="${y(150)}" class="tc-tg"/><text x="${W - 4}" y="${y(150) - 4}" text-anchor="end" class="tr-ax">150 字／分</text>
        <path d="${pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.wpm)}`).join("")}" class="tc-line"/>${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.wpm)}" r="3.5" class="tc-wk"><title>${p.d}：${p.wpm} 字／分，答對 ${Math.round(p.acc * 100)}%</title></circle>`).join("")}</svg>` : ""}
      <p class="tr-note">${lvl[1]}（速度包含看題目和選答案的時間；正式考試 Part 7 大約需要每分鐘 150 字以上才寫得完）</p></section>`;
  }
  /* ---------- 📚 多益核心單字庫 ---------- */
  const WT = () => window.TOEIC_WORDS;
  const wordsOf = tp => tp.w.trim().split("\n").map(l => { const [word, pos, meaning, example, example_zh] = l.split("|"); return { word, pos, meaning, example, example_zh }; });
  function wordsHtml() {
    if (!WT()) return "";
    const tot = WT().topics.reduce((a, t) => a + wordsOf(t).length, 0), added = Object.values(T.core || {}).reduce((a, b) => a + b, 0);
    return `<section class="card"><h2>📚 多益核心單字庫 <small class="nb-prog">${added}/${tot}</small></h2><p class="tr-note">多益最常考的 ${tot} 個字，依主題分成 ${WT().topics.length} 組。點一組可以先看，按「加入」就會放進「📖 單字」照遺忘曲線複習（每日任務的單字也算這些）。建議一週加一組。</p>
      <div class="tc-topics">${WT().topics.map(t => { const n = wordsOf(t).length, h = (T.core || {})["多益核心・" + t.name] || 0; return `<button type="button" class="tc-topic ${h >= n ? "done" : h ? "half" : ""}" data-tc="words" data-v="${t.k}"><span>${t.icon}</span><b>${esc(t.name)}</b><small>${h >= n ? "✓ 已加入" : h ? `${h}/${n}` : `${n} 字`}</small></button>`; }).join("")}</div></section>`;
  }
  function wordsModal(k) {
    const tp = WT().topics.find(t => t.k === k); if (!tp) return; const W = wordsOf(tp), deck = "多益核心・" + tp.name, has = (T.core || {})[deck] || 0, m = document.createElement("div"); m.className = "vg-modal";
    m.innerHTML = `<div class="vg-card" style="max-height:88vh;overflow:auto"><div class="vg-title">${tp.icon} ${esc(tp.name)}（${W.length} 字）</div><p class="tr-note">點單字可以聽發音、看例句。</p>
      <table class="tc-wl">${W.map((w, i) => `<tr data-wi="${i}"><td><b>${esc(w.word)}</b> <small>${esc(w.pos)}</small><div class="tc-ex" hidden>${esc(w.example)}<br><small>${esc(w.example_zh)}</small></div></td><td>${esc(w.meaning)}</td></tr>`).join("")}</table>
      <button type="button" class="btn btn-primary" data-add="1" style="width:100%;position:sticky;bottom:0">${has >= W.length ? "✓ 已經全部加入了" : `📥 加入單字庫（${deck}）`}</button><button type="button" class="btn" data-vx="1" style="width:100%;margin-top:6px">關閉</button></div>`;
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-vx]")) return m.remove();
      const tr = e.target.closest("[data-wi]"); if (tr) { const w = W[Number(tr.dataset.wi)], ex = tr.querySelector(".tc-ex"); ex.hidden = !ex.hidden; stopAudio(); say(w.word, "us_f"); return; }
      const b = e.target.closest("[data-add]"); if (b && !b.disabled) { b.disabled = true; b.textContent = "加入中…";
        const { data, error } = await db.rpc("vocab_import", { p_rows: W.map(w => Object.assign({ tags: "多益核心" }, w)), p_deck: deck });
        if (error) { b.disabled = false; b.textContent = "📥 再試一次"; return toast(error.message); }
        T.core[deck] = (T.core[deck] || 0) + (data.added || 0); b.textContent = `✓ 加入 ${data.added} 個字${data.dup ? `（${data.dup} 個本來就有）` : ""}`; render(); toast(`📚 ${tp.name}：加入 ${data.added} 個字，去「📖 單字」開始背吧`); }
    });
    document.body.appendChild(m);
  }
  function tipsModal() {
    try { localStorage.setItem("tcTips:" + todayStr(), "1"); } catch (_) {}
    const m = document.createElement("div"); m.className = "vg-modal";
    const sec = (title, tags) => `<h3>${title}</h3>${Object.values(tags).map(t => `<p class="tc-tip"><b>${esc(t.name)}</b>：${esc(t.tip)}</p>`).join("")}`;
    m.innerHTML = `<div class="vg-card" style="max-height:88vh;overflow:auto"><div class="vg-title">⚡ 秒殺技巧總複習</div>${sec("🎧 Part 2", B().TAGS2)}${sec("✏️ Part 5", B().TAGS5)}
      <p class="tr-note">考場提醒：Part 2 聽不懂就刪掉「重複字」的選項；Part 5 一題不超過 30 秒；Part 7 先看題目再找答案；最後 5 分鐘把空白的全部猜完。</p><button type="button" class="btn btn-primary" data-vx="1" style="width:100%">看完了</button></div>`;
    m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-vx]")) { m.remove(); render(); renderToday(); claim(); } });
    document.body.appendChild(m);
  }

  /* ---------- 練習 ---------- */
  function buildSet(kind) {
    const t = todayStr();
    const left = k => { const x = plan().tasks.find(y => y.k === k); return x && !x.ok ? Math.max(5, x.need - x.have) : 10; };
    if (kind === "p5") return pick(5, left("p5"));
    if (kind === "p2") return pick(2, left("p2"));
    if (kind === "bonus") return pick(5, 5).concat(pick(2, 5));
    if (kind === "weak") { const wt = weakTag(); if (!wt) return []; const seen = new Set(T.ans.map(a => a.qid)), pool = allQs().filter(q => q.part === 5 && q.tag === wt); return shuffle(pool.filter(q => !seen.has(q.id))).concat(shuffle(pool.filter(q => seen.has(q.id)))).slice(0, left("weak")); }
    if (kind === "review") { const x = plan().tasks.find(y => y.k === "review"); return T.review.filter(x => x.due <= t).sort((a, b) => a.due < b.due ? -1 : 1).slice(0, x ? x.need : 15).map(x => qById(x.qid)).filter(Boolean); }
    if (kind === "mock") return pick(2, 15).concat(pick(5, 20));
    if (kind.startsWith("tag:")) { const [, p, tg] = kind.split(":"), pool = shuffle(allQs().filter(q => q.part === Number(p) && q.tag === tg)); return pool.slice(0, 8); }
    return [];
  }
  async function record(q, correct, ms, mode) {
    const t = todayStr(), m = mode.startsWith("tag:") || mode === "variant" ? "drill" : mode;
    T.ans.unshift({ qid: q.id, part: q.part, tag: q.tag, correct, mode: m, day: t, created_at: new Date().toISOString() });
    db.from("toeic_answers").insert({ qid: q.id, part: q.part, tag: q.tag, correct, ms, mode: m, day: t }).then(() => {});
    const rv = T.review.find(x => x.qid === q.id);
    if (!correct) { const row = { qid: q.id, part: q.part, tag: q.tag, stage: 0, due: addDays(t, 1) }; if (rv) Object.assign(rv, row); else T.review.push(row); db.from("toeic_review").upsert(row, { onConflict: "user_id,qid" }).then(() => {}); }
    else if (rv && (mode === "review" || rv.due <= t)) {
      const st = rv.stage + 1;
      if (st >= 4) { T.review = T.review.filter(x => x !== rv); db.from("toeic_review").delete().eq("qid", q.id).then(() => {}); }
      else { rv.stage = st; rv.due = addDays(t, [1, 3, 7, 14][st]); db.from("toeic_review").update({ stage: st, due: rv.due }).eq("qid", q.id).then(() => {}); }
    }
  }
  async function claim() {
    const P = plan(); let got = 0;
    for (const x of P.tasks) if (x.ok && !x.ext) { const { data } = await db.rpc("toeic_task_done", { p_task: x.k }); if (data && data.granted) got += data.amount; }
    const v = P.tasks.find(x => x.k === "vocab"); if (v && v.ok) { const { data } = await db.rpc("toeic_task_done", { p_task: "vocab" }); if (data && data.granted) got += data.amount; }
    if (P.tasks.filter(x => !x.opt).every(x => x.ok)) { const { data } = await db.rpc("toeic_task_done", { p_task: "allday" }); if (data && data.granted) got += data.amount; }
    if (got) toast(`🎯 多益任務完成，星屑 +${got}`);
    const sk = await db.rpc("toeic_streak"); if (sk.data) { T.streak = sk.data; if (sk.data.granted) toast(`🔥 連續 ${sk.data.cur} 天！里程碑獎勵到手`); }
  }

  /* 🧬 錯題變形題：AI 出一題同觀念、換句子的新題 */
  async function makeVariant(q) {
    const { data, error } = await db.functions.invoke("toeic", { body: { action: "variant", id: q.id, part: q.part, tag: q.tag, q: q.q, o: q.o, a: q.a, why: q.why } });
    if (error || !data || !data.item) throw new Error((data && data.error) || (error && error.message) || "AI 沒回應");
    const x = data.item; T.ai.unshift(x); return { id: x.id, part: x.part, tag: x.tag, ai: true, variant: true, ...x.data };
  }
  async function variantSession(q) {
    toast("🧬 AI 出題中…約 10 秒");
    try { const v = await makeVariant(q); session("variant", [v], "🧬 錯題變形題"); } catch (err) { toast("😵 " + err.message); }
  }
  function session(kind, preset, ptitle) {
    const qs = preset || buildSet(kind);
    if (!qs.length) return toast(kind === "review" ? "今天沒有到期的錯題 🎉" : "這類題目還沒有");
    const isMock = kind === "mock", m = document.createElement("div"); m.className = "vg-modal tc-modal";
    let i = 0, t0 = 0, answered = false, right = 0, playing = false; const res = [];
    preload(qs[0]); preload(qs[1]);
    const title = ptitle || { p5: "✏️ Part 5 文法單字", p2: "🎧 Part 2 應答", review: "🔁 錯題複習", mock: "📝 小模考", bonus: "🚀 弱點加碼", weak: "🗺️ 弱點專練" }[kind] || "🎯 專項練習";
    async function playQ(q) {
      if (playing) return; playing = true; stopAudio(); const [va, vb] = voicesOf(q), box = m.querySelector(".tc-p2");
      try { box && box.classList.add("on"); mark(-1); await say(q.q, va); for (let k = 0; k < q.o.length; k++) { await wait(500); if (!m.isConnected || answered) break; mark(k); await say(q.o[k], vb); } } finally { playing = false; mark(-2); box && box.classList.remove("on"); }
    }
    const mark = k => m.querySelectorAll(".tc-abc").forEach((b, j) => b.classList.toggle("speak", j === k));
    function draw() {
      const q = qs[i]; answered = false; t0 = Date.now(); const tip = q.part === 5 ? B().TAGS5[q.tag] : q.part === 2 ? B().TAGS2[q.tag] : null;
      m.innerHTML = `<div class="vg-card tc-card"><div class="tc-mh"><b>${title}</b><span>${i + 1}/${qs.length}</span><button type="button" class="tr-x" data-x="1">✕</button></div>
        <div class="tc-bar"><i style="width:${i / qs.length * 100}%"></i></div><p class="tc-tagname">Part ${q.part}・${esc(tip ? tip.name : q.test ? "模擬試題錯題" : q.tag)}${q.variant ? "・🧬 變形題（同觀念、換句子）" : q.ai ? "・🤖 AI 題" : ""}</p>
        ${q.part !== 2 ? `${q.group && (q.part === 3 || q.part === 4) ? `<div class="tc-p2"><button type="button" class="tc-play" data-gplay="1">🔊 播放${q.part === 3 ? "對話" : "獨白"}</button></div>` : ""}${q.ctx || ""}<p class="tc-q">${esc(q.q).replace(/-{3,}/, '<span class="tc-blank">_______</span>')}</p>${q.o.map((o, k) => `<button type="button" class="nb-opt" data-k="${k}">(${"ABCD"[k]}) ${esc(o)}</button>`).join("")}`
          : `<div class="tc-p2"><button type="button" class="tc-play" data-play="1">🔊 播放題目</button><p class="tr-note">只用聽的！題目和三個回答都會念一次，聽完選最合適的回應。</p></div><div class="tc-abcs">${q.o.map((_, k) => `<button type="button" class="tc-abc" data-k="${k}">${"ABC"[k]}</button>`).join("")}</div>`}
        <div class="tc-fb"></div></div>`;
      if (q.part === 2) setTimeout(() => playQ(q), 350);
      preload(qs[i + 1]);
    }
    function feedback(k) {
      const q = qs[i], ok = k === q.a, tip = q.part === 5 ? B().TAGS5[q.tag] : q.part === 2 ? B().TAGS2[q.tag] : null; answered = true; stopAudio(); if (ok) right++;
      res.push({ q, ok }); record(q, ok, Date.now() - t0, kind);
      m.querySelectorAll("[data-k]").forEach(b => { const j = Number(b.dataset.k); b.disabled = true; b.classList.add(j === q.a ? "ok" : j === k ? "no" : "x"); });
      if (isMock) { setTimeout(next, 450); return; }
      m.querySelector(".tc-fb").innerHTML = `<div class="tc-exp ${ok ? "good" : "bad"}"><b>${ok ? "⭕ 答對了！" : `❌ 正解是 ${"ABCD"[q.a]}`}</b>
        ${q.part === 2 ? `<p class="tc-tr">🗣️ ${esc(q.q)}<br>${q.o.map((o, j) => `<span class="${j === q.a ? "up" : ""}">(${"ABC"[j]}) ${esc(o)}</span>`).join("<br>")}</p>` : ""}
        <p>🈶 ${esc(q.zh)}</p><p>💡 ${esc(q.why)}</p>${tip ? `<p class="tc-tip">⚡ 秒殺技巧：${esc(tip.tip)}</p>` : ""}<div class="tc-ai"></div></div>
        ${ok ? "" : `<div class="tt-rs"><small>❓ 錯在哪？</small>${REASONS.map(r => `<button type="button" class="tr-chip sm" data-rs="${r}">${r}</button>`).join("")}</div>`}
        <div class="tr-row">${ok ? "" : `<button type="button" class="btn btn-small" data-ai="1">🤖 為什麼？</button>`}${!ok && (q.part === 2 || q.part === 5) && !q.variant ? `<button type="button" class="btn btn-small" data-var="1">🧬 變形題</button>` : ""}${q.part === 2 ? `<button type="button" class="btn btn-small" data-play="1">🔊 再聽一次</button>` : ""}${q.ai ? `<button type="button" class="btn btn-small" data-flag="1">🚩 這題怪怪的</button>` : ""}<button type="button" class="btn btn-primary" data-next="1" style="margin-left:auto">${i + 1 < qs.length ? "下一題 →" : "看結果"}</button></div>`;
    }
    function next() { i++; if (i < qs.length) draw(); else finish(); }
    async function finish() {
      stopAudio(); const n = qs.length, wrong = res.filter(r => !r.ok);
      let extra = "";
      if (isMock) { const p2 = res.filter(r => r.q.part === 2), p5 = res.filter(r => r.q.part === 5), a2 = p2.filter(r => r.ok).length / Math.max(1, p2.length), a5 = p5.filter(r => r.ok).length / Math.max(1, p5.length);
        const r5 = v => Math.max(5, Math.min(495, Math.round(v / 5) * 5)), est = r5(60 + a2 * 430) + r5(40 + a5 * 440);
        db.from("toeic_mocks").insert({ l_acc: a2, r_acc: a5, est, detail: { p2: p2.length, p5: p5.length } }).then(() => {}); T.mocks.unshift({ est, created_at: new Date().toISOString() });
        extra = `<div class="tc-score"><div><small>聽力 Part 2</small><b>${Math.round(a2 * 100)}%</b></div><div><small>閱讀 Part 5</small><b>${Math.round(a5 * 100)}%</b></div><div><small>預估總分</small><b>${est}</b></div></div>`; }
      m.innerHTML = `<div class="vg-card tc-card"><div style="text-align:center"><div style="font-size:44px">${right / n >= 0.8 ? "🎉" : right / n >= 0.6 ? "👍" : "💪"}</div><h3>${title}・答對 ${right}/${n}</h3></div>${extra}
        ${wrong.length ? `<p class="tr-note">❌ 答錯的 ${wrong.length} 題已經放進錯題本，明天會再出現。</p><details class="tr-list"><summary>看錯題</summary>${wrong.map(r => `<p class="tc-wr"><b>${esc(r.q.q)}</b><br>→ ${esc(r.q.o[r.q.a])}<br><small>${esc(r.q.why)}</small></p>`).join("")}</details>` : ""}
        <div class="tr-row"><button type="button" class="btn btn-primary" data-x="1" style="flex:1">完成</button></div></div>`;
      await claim(); render(); renderToday(); topUp(5); topUp(2);
    }
    m.addEventListener("click", async e => {
      if (e.target.closest("[data-x]") || e.target === m) { if (i > 0 && i < qs.length && !confirm("中途離開？做過的題目會保留。")) return; stopAudio(); m.remove(); render(); renderToday(); claim(); return; }
      if (e.target.closest("[data-play]")) { playing = false; return playQ(qs[i]); }
      if (e.target.closest("[data-gplay]")) { const b = e.target.closest("[data-gplay]"); b.textContent = "🔊 播放中…"; await window.ToeicTest.play(qs[i].group); b.textContent = "🔁 再聽一次"; return; }
      const rs = e.target.closest("[data-rs]"); if (rs) { const q = qs[i]; m.querySelectorAll("[data-rs]").forEach(x => x.classList.toggle("on", x === rs)); db.from("toeic_reasons").insert({ qid: q.id, part: q.part, tag: q.tag, reason: rs.dataset.rs }).then(() => {}); T.reasons.unshift({ reason: rs.dataset.rs, part: q.part, tag: q.tag, day: todayStr() }); return; }
      const k = e.target.closest("[data-k]"); if (k && !answered) return feedback(Number(k.dataset.k));
      if (e.target.closest("[data-next]")) return next();
      const vb = e.target.closest("[data-var]"); if (vb) { vb.disabled = true; vb.textContent = "🧬 AI 出題中…"; const cur = qs[i];
        try { const v = await makeVariant(cur); qs.splice(i + 1, 0, v); vb.textContent = "🧬 下一題就是變形題"; const nb = m.querySelector("[data-next]"); if (nb) nb.textContent = "下一題 →"; }
        catch (err) { vb.disabled = false; vb.textContent = "🧬 變形題"; toast("😵 " + err.message); } return; }
      if (e.target.closest("[data-flag]")) { const q = qs[i]; await db.from("toeic_qbank").update({ flagged: true }).eq("id", q.id); const x = T.ai.find(a => a.id === q.id); if (x) x.flagged = true; toast("🚩 謝謝回報，這題之後不會再出現"); return; }
      if (e.target.closest("[data-ai]")) { const q = qs[i], box = m.querySelector(".tc-ai"), b = e.target.closest("[data-ai]"); b.disabled = true; box.innerHTML = `<p class="tr-note">🤖 老師想一下…</p>`;
        const pickd = res[res.length - 1]; const { data, error } = await db.functions.invoke("toeic", { body: { action: "explain", q: { part: q.part, question: q.q, options: q.o, correct: q.o[q.a], chosen: q.o[(m.querySelector(".no") || {}).dataset ? Number(m.querySelector(".no").dataset.k) : q.a], zh: q.zh, ok: pickd && pickd.ok } } });
        box.innerHTML = error || !data || data.error ? `<p class="tr-note dn">😵 ${esc((data && data.error) || (error && error.message) || "AI 沒回應")}</p>` : `<p class="tc-aitext">🤖 ${esc(data.text).replace(/\n/g, "<br>")}</p>`; }
    });
    document.addEventListener("keydown", function kh(e) { if (!m.isConnected) return document.removeEventListener("keydown", kh); const k = "abcd".indexOf(e.key.toLowerCase()); if (k >= 0 && !answered && qs[i] && k < qs[i].o.length) feedback(k); else if (e.key === "Enter" && answered) next(); });
    draw(); document.body.appendChild(m); studyFocus(m);
  }

  function tipModal(part, tag) {
    const t = (part === 5 ? B().TAGS5 : B().TAGS2)[tag], st = tagStats(part)[tag], m = document.createElement("div"); m.className = "vg-modal";
    m.innerHTML = `<div class="vg-card"><div class="vg-title">⚡ ${esc(t.name)}</div><p class="tc-tip" style="font-size:14.5px">${esc(t.tip)}</p><p class="tr-note">你在這一類：${st.n ? `${st.ok}/${st.n} 題答對（${pct(st.acc)}）` : "還沒做過"}</p>
      <button type="button" class="btn btn-primary" data-d="1" style="width:100%">🎯 專練這一類（8 題）</button><button type="button" class="btn" data-vx="1" style="width:100%;margin-top:6px">關閉</button></div>`;
    m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-vx]")) return m.remove(); if (e.target.closest("[data-d]")) { m.remove(); session(`tag:${part}:${tag}`); } });
    document.body.appendChild(m);
  }
  function settings() {
    const s = T.set, m = document.createElement("div"); m.className = "vg-modal";
    m.innerHTML = `<div class="vg-card"><div class="vg-title">⚙️ 多益設定</div>
      <div class="tr-grid"><label>考試日期<input type="date" id="tc-date" value="${s.exam_date || ""}"></label><label>目標分數<input type="number" id="tc-target" min="300" max="990" step="5" value="${s.target}"></label>
        <label>目前程度（分）<input type="number" id="tc-start" min="10" max="990" step="5" value="${s.start_score}"></label>
        <label>每天練多久<select id="tc-min">${[[30, "30 分鐘"], [45, "45 分鐘"], [60, "60 分鐘"]].map(([v, n]) => `<option value="${v}" ${s.daily_min == v ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label>聽力聲音<select id="tc-voice"><option value="ai" ${s.voice !== "browser" ? "selected" : ""}>AI 真人感語音（多種口音）</option><option value="browser" ${s.voice === "browser" ? "selected" : ""}>瀏覽器內建語音（免費、較機器）</option></select></label></div>
      <button type="button" class="btn" data-test="1" style="width:100%">🔊 試聽</button>
      <button type="button" class="btn btn-primary" data-save="1" style="width:100%;margin-top:6px">儲存</button><button type="button" class="btn" data-vx="1" style="width:100%;margin-top:6px">取消</button></div>`;
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-vx]")) return m.remove();
      if (e.target.closest("[data-test]")) { const old = T.set.voice; T.set.voice = m.querySelector("#tc-voice").value; await say("Where should I put these documents? You can leave them on my desk.", "uk_f"); T.set.voice = old; return; }
      if (e.target.closest("[data-save]")) {
        const row = { exam_date: m.querySelector("#tc-date").value || null, target: Number(m.querySelector("#tc-target").value) || 650, start_score: Number(m.querySelector("#tc-start").value) || 400, daily_min: Number(m.querySelector("#tc-min").value), voice: m.querySelector("#tc-voice").value, updated_at: new Date().toISOString() };
        const { error } = await db.from("toeic_settings").upsert(row, { onConflict: "user_id" }); if (error) return toast(error.message);
        T.set = Object.assign({}, T.set, row); m.remove(); render(); renderToday(); toast("⚙️ 設定好了");
      }
    });
    document.body.appendChild(m);
  }

  async function onClick(e) {
    const b = e.target.closest("[data-tc]"); if (!b) return;
    const a = b.dataset.tc;
    if (a === "go") { if (T.set._new) { const s = Object.assign({}, T.set); delete s._new; await db.from("toeic_settings").upsert(s, { onConflict: "user_id" }); delete T.set._new; } session(b.dataset.v); }
    if (a === "set") settings();
    if (a === "tips") tipsModal();
    if (a === "boss") { const { data, error } = await db.rpc("toeic_boss_claim"); if (error) return toast(error.message); T.boss = data; render(); toast("🏆 擊敗 Boss！普通召喚券 +1、星屑 +200"); }
    if (a === "tip") tipModal(Number(b.dataset.part), b.dataset.v);
    if (a === "words") wordsModal(b.dataset.v);
  }
  function onChange() {}
  document.addEventListener("click", e => { const b = e.target.closest("[data-tcg]"); if (!b) return; if (b.dataset.tcg === "vocab") return showPage("vocab"); if (b.dataset.tcg === "tips") return tipsModal(); if (b.dataset.tcg === "commute") return window.ToeicCommute ? window.ToeicCommute.open() : toast("通勤模式載入中，稍等一下"); session(b.dataset.tcg); });

  const css = document.createElement("style");
  css.textContent = `
    .tc-top { display: flex; justify-content: space-between; align-items: flex-start; } .tc-top .tr-x { font-size: 20px; opacity: .8; }
    .tc-score { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 10px 0 6px; } .tc-score > div { text-align: center; padding: 10px 6px; border-radius: 12px; background: rgba(127,127,127,.08); }
    .tc-score small { display: block; font-size: 11px; opacity: .65; } .tc-score b { display: block; font-size: 24px; line-height: 1.2; }
    .tc-prog, .tc-mini, .tc-bar { height: 8px; border-radius: 6px; background: rgba(127,127,127,.18); overflow: hidden; } .tc-prog i, .tc-mini i, .tc-bar i { display: block; height: 100%; background: linear-gradient(90deg, #7c5cff, #3fb950); border-radius: 6px; transition: width .3s; }
    .tc-mini { height: 5px; margin-top: 4px; } .tc-new { font-size: 13px; padding: 8px 10px; border-radius: 10px; background: rgba(124,92,255,.12); }
    .tc-task { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(127,127,127,.12); } .tc-task > div { flex: 1; min-width: 0; } .tc-task b { font-size: 14px; display: block; } .tc-task small { font-size: 11.5px; opacity: .65; }
    .tc-task.ok b { opacity: .6; } .tc-ic { font-size: 20px; width: 28px; text-align: center; }
    .tc-tag { display: flex; align-items: center; gap: 8px; padding: 5px 0; cursor: pointer; font-size: 13px; } .tc-tag span { flex: 0 0 6.5em; } .tc-tag b { width: 3em; text-align: right; } .tc-tag small { width: 3.5em; opacity: .55; font-size: 11px; }
    .tc-weak { font-size: 13.5px; padding: 8px 10px; border-radius: 10px; background: rgba(248,81,73,.1); }
    .tc-mocks { display: flex; gap: 6px; align-items: flex-end; margin-top: 8px; } .tc-mocks div { flex: 1; text-align: center; padding: 6px 2px; border-radius: 8px; background: rgba(124,92,255,.12); } .tc-mocks b { display: block; } .tc-mocks small { font-size: 10px; opacity: .6; }
    .tc-modal .vg-card { max-width: 520px; } .tc-mh { display: flex; align-items: center; gap: 8px; } .tc-mh span { margin-left: auto; font-size: 12px; opacity: .6; } .tc-bar { margin: 8px 0; height: 5px; }
    .tc-tagname { font-size: 11.5px; opacity: .6; margin: 4px 0; } .tc-q { font-size: 16.5px; line-height: 1.6; margin: 8px 0 12px; font-weight: 500; } .tc-blank { display: inline-block; min-width: 4em; border-bottom: 2px solid #7c5cff; color: transparent; }
    .tc-p2 { text-align: center; padding: 14px 8px; border-radius: 14px; background: rgba(124,92,255,.08); margin: 8px 0; } .tc-p2.on .tc-play { animation: nbPulse 1.2s infinite; }
    .tc-play { font: inherit; font-size: 16px; padding: 10px 22px; border-radius: 999px; border: 0; background: #7c5cff; color: #fff; cursor: pointer; }
    .tc-abcs { display: flex; gap: 10px; justify-content: center; margin: 12px 0; } .tc-abc { width: 64px; height: 64px; border-radius: 16px; font: inherit; font-size: 24px; font-weight: 700; border: 2px solid rgba(127,127,127,.3); background: rgba(127,127,127,.06); color: inherit; cursor: pointer; transition: transform .15s; }
    .tc-abc.speak { border-color: #7c5cff; transform: scale(1.08); background: rgba(124,92,255,.15); } .tc-abc.ok { background: rgba(63,185,80,.3); border-color: #3fb950; } .tc-abc.no { background: rgba(248,81,73,.3); border-color: #f85149; } .tc-abc.x { opacity: .45; }
    .tc-exp { margin-top: 10px; padding: 10px 12px; border-radius: 12px; font-size: 13.5px; line-height: 1.6; } .tc-exp.good { background: rgba(63,185,80,.1); } .tc-exp.bad { background: rgba(248,81,73,.08); } .tc-exp p { margin: 6px 0; }
    .tc-tr { font-family: ui-sans-serif, system-ui; } .tc-tip { padding: 8px 10px; border-radius: 10px; background: rgba(255,213,74,.14); font-size: 13px; } .tc-aitext { padding: 8px 10px; border-radius: 10px; background: rgba(124,92,255,.1); }
    .tc-flame { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 4px; margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: linear-gradient(90deg, rgba(255,140,0,.15), rgba(255,80,80,.08)); font-size: 13.5px; } .tc-flame b { font-size: 18px; color: #ff8c00; } .tc-flame small { opacity: .65; font-size: 11.5px; }
    .tc-sprint { font-size: 13px; padding: 8px 10px; border-radius: 10px; background: rgba(248,81,73,.12); margin: 8px 0 0; font-weight: 600; }
    .tc-line { fill: none; stroke: #3fb950; stroke-width: 2; vector-effect: non-scaling-stroke; }
    .tc-tg { stroke: #e3b341; stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; } .tc-pred { stroke: #b48cff; stroke-dasharray: 5 4; fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; } .tc-predc { fill: #b48cff; } .tc-mk { fill: #b48cff; } .tc-wk { fill: #3fb950; }
    .tc-boss { background: linear-gradient(160deg, rgba(248,81,73,.1), rgba(124,92,255,.08)); } .tc-boss.dead h2 { text-decoration: line-through; opacity: .7; }
    .tc-hp { position: relative; height: 22px; border-radius: 12px; background: rgba(127,127,127,.2); overflow: hidden; margin: 8px 0; } .tc-hp i { display: block; height: 100%; background: linear-gradient(90deg, #f85149, #ff9f43); transition: width .5s; } .tc-hp span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.6); }
    .tt-rs { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 8px 0; } .tt-rs small { opacity: .7; margin-right: 4px; }
    .tc-h3 { font-size: 15px; margin: 6px 0 4px; } .tc-h3 small { font-weight: 400; font-size: 11px; opacity: .6; } .tc-h4 { font-weight: 700; font-size: 13.5px; margin: 10px 0 2px; } .tc-ul { margin: 0; padding-left: 20px; font-size: 13.5px; line-height: 1.6; }
    .tc-heat { border-collapse: separate; border-spacing: 3px; font-size: 12px; width: 100%; } .tc-heat th { font-weight: 500; font-size: 11px; opacity: .75; white-space: nowrap; } .tc-heat tr th:first-child { text-align: left; font-size: 12.5px; opacity: 1; }
    .tc-heat td { text-align: center; border-radius: 6px; padding: 5px 2px; color: #fff; font-weight: 700; min-width: 30px; text-shadow: 0 1px 1px rgba(0,0,0,.35); } .tc-heat td.nil { background: rgba(127,127,127,.08); color: inherit; opacity: .4; font-weight: 400; text-shadow: none; } .tc-heat tr[data-tc] { cursor: pointer; }
    .tc-topics { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; } .tc-topic { font: inherit; color: inherit; border: 1px solid rgba(127,127,127,.25); border-radius: 12px; padding: 8px 4px; background: rgba(127,127,127,.05); cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .tc-topic span { font-size: 22px; } .tc-topic b { font-size: 13px; } .tc-topic small { font-size: 11px; opacity: .6; } .tc-topic.done { background: rgba(63,185,80,.15); border-color: rgba(63,185,80,.5); } .tc-topic.half { background: rgba(255,213,74,.12); }
    .tc-wl { width: 100%; border-collapse: collapse; font-size: 13.5px; } .tc-wl td { padding: 6px 4px; border-bottom: 1px solid rgba(127,127,127,.12); vertical-align: top; cursor: pointer; } .tc-wl td:first-child { width: 48%; } .tc-wl small { opacity: .55; } .tc-ex { font-size: 12.5px; margin-top: 4px; opacity: .85; }
    .tc-cmb { width: 100%; margin-top: 8px; }
    .tc-wr { font-size: 13px; border-bottom: 1px solid rgba(127,127,127,.15); padding: 6px 0; margin: 0; }`;
  document.head.appendChild(css);

  if (typeof window.applyPage === "function") { const base = window.applyPage; window.applyPage = function (name) { const r = base.apply(this, arguments); if (name === "toeic") setTimeout(() => { ensurePage(); load(); }, 0); if (name === "today") setTimeout(renderToday, 0); return r; }; }
  function boot() { try { ensurePage(); } catch (e) { console.warn(e); } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  (function wait2(n) { if (!hasDb()) { if (n < 60) setTimeout(() => wait2(n + 1), 1000); return; } load(); })(0);
  window.ToeicSys = { session, load, plan, estimate, variantSession, qById, todayStr, get state() { return T; }, tagName: (p, t) => { const d = (p === 5 ? B().TAGS5 : B().TAGS2)[t]; return d ? d.name : t; } };
})();
