/* 📝 多益完整模擬試題：一回 200 題（聽力 Part 1–4、閱讀 Part 5–7），可以整回考，也可以只挑某幾個 Part 練
   題目由 AI 產生（edge function「toeic」test_chunk），存在 toeic_tests；聲音、照片第一次播放時產生並快取 */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const PARTS = {
    1: { name: "Part 1 照片描述", L: true, chunks: ["p1"], n: 6, tip: "看照片，聽四句描述，選最符合的。" },
    2: { name: "Part 2 應答問題", L: true, chunks: ["p2a", "p2b"], n: 25, tip: "聽一句話和三個回應，選最自然的。" },
    3: { name: "Part 3 簡短對話", L: true, chunks: ["p3a", "p3b", "p3c"], n: 39, tip: "聽兩人對話，每段回答三題。" },
    4: { name: "Part 4 簡短獨白", L: true, chunks: ["p4a", "p4b"], n: 30, tip: "聽廣播、留言、公告，每段回答三題。" },
    5: { name: "Part 5 句子填空", L: false, chunks: ["p5a", "p5b", "p5c"], n: 30, tip: "選最適合填入空格的字。" },
    6: { name: "Part 6 段落填空", L: false, chunks: ["p6a", "p6b"], n: 16, tip: "短文有四個空格，其中一題要選整個句子。" },
    7: { name: "Part 7 閱讀測驗", L: false, chunks: ["p7a", "p7b", "p7c", "p7d", "p7e", "p7f", "p7g", "p7h"], n: 54, tip: "單篇、雙篇、三篇文章閱讀。" }
  };
  const ALLCH = Object.values(PARTS).flatMap(p => p.chunks);
  const VO = ["us_m", "uk_f", "au_m", "ca_f", "us_f", "uk_m"];
  const hashN = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const X = { tests: [], attempts: [], gen: null };

  async function load() {
    if (!hasDb()) return;
    const [t, a] = await Promise.all([db.from("toeic_tests").select("*").order("id"), db.from("toeic_mocks").select("*").order("created_at", { ascending: false }).limit(60)]);
    if (t.error) { X.err = t.error.message; render(); return; }
    X.tests = (await staticTests()).concat(t.data || []); X.attempts = (a.data || []).filter(m => m.detail && m.detail.test_id); render();
  }
  /* 內建試題（Claude 出的，放在 toeic-tests/） */
  let STATIC = null;
  async function staticTests() {
    if (STATIC) return STATIC;
    try { const ids = await (await fetch("toeic-tests/index.json?v=4")).json(); STATIC = (await Promise.all(ids.map(i => fetch(`toeic-tests/${i}.json?v=4`).then(r => r.json()).catch(() => null)))).filter(Boolean).map(t => Object.assign(t, { builtin: true })); }
    catch (_) { STATIC = []; }
    return STATIC;
  }
  const have = (t, p) => PARTS[p].chunks.every(c => t.parts && Array.isArray(t.parts[c]) && t.parts[c].length);
  const ready = t => [1, 2, 3, 4, 5, 6, 7].filter(p => have(t, p));

  /* ---------- 卡片 ---------- */
  function render() {
    const page = document.querySelector('.page[data-page="toeic"]'); if (!page) return;
    let box = document.getElementById("tt-card");
    if (!box) { box = document.createElement("section"); box.id = "tt-card"; box.className = "card"; const root = page.querySelector("#tc-root"); root ? root.after(box) : page.appendChild(box); }
    if (X.err) { box.innerHTML = `<h2>📝 完整模擬試題</h2><p class="tr-note">${esc(X.err)}</p>`; return; }
    box.innerHTML = `<h2>📝 完整模擬試題</h2><p class="tr-note">每回 200 題、跟正式考試一樣分 7 個 Part。可以整回計時考，也可以只挑想練的 Part。題目是 AI 原創的模擬題。</p>
      ${X.tests.map(t => { const r = ready(t), last = X.attempts.find(a => String(a.detail.test_id) === String(t.id)), busy = X.gen && X.gen.id === t.id;
        return `<div class="tt-test"><div class="tt-h"><b>${t.builtin ? "⭐ " : ""}${esc(t.title)}</b>${last ? `<small>上次 ${last.est ? `預估 ${last.est}` : ""}・${new Date(last.created_at).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" })}</small>` : ""}</div>
          <div class="tt-parts">${[1, 2, 3, 4, 5, 6, 7].map(p => `<span class="${have(t, p) ? "ok" : ""}" title="${PARTS[p].name}">P${p}</span>`).join("")}</div>
          ${busy ? `<p class="tr-note">⏳ ${esc(X.gen.msg)}</p>` : r.length < 7 ? `<button type="button" class="btn btn-small" data-tt="gen" data-v="${t.id}">✨ 產生缺少的 Part（約 10–15 分鐘）</button>` : ""}
          ${r.length ? `<button type="button" class="btn btn-small btn-primary" data-tt="start" data-v="${t.id}">▶️ 開始練習</button>` : ""}</div>`; }).join("")}
      <div class="tr-row"><button type="button" class="btn btn-small" data-tt="new">＋ 再出一回新的</button></div>`;
  }

  /* ---------- 產生題目 ---------- */
  async function generate(id) {
    const t = X.tests.find(x => x.id === id); if (!t || X.gen) return;
    const miss = ALLCH.filter(c => !(t.parts && Array.isArray(t.parts[c]) && t.parts[c].length));
    X.gen = { id, msg: "準備中…" }; render();
    let fail = 0;
    for (const [i, c] of miss.entries()) {
      X.gen.msg = `正在出 ${c.toUpperCase()}（${i + 1}/${miss.length}）…可以先去做別的，完成會通知你`; render();
      let ok = false;
      for (let k = 0; k < 3 && !ok; k++) { /* AI 忙線就等一下再試 */
        if (k) { X.gen.msg = `AI 有點忙，${k * 20} 秒後重試 ${c.toUpperCase()}…`; render(); await new Promise(r => setTimeout(r, k * 20000)); }
        const { data, error } = await db.functions.invoke("toeic", { body: { action: "test_chunk", test_id: id, chunk: c, theme: t.theme } });
        ok = !error && !(data && data.error);
      }
      if (!ok) fail++;
    }
    X.gen = null; await load();
    toast(fail ? `📝 ${t.title} 有 ${fail} 段沒產生成功，再按一次會補上` : `📝 ${t.title} 題目都產生好了！`);
  }
  async function newTest() {
    const themes = ["real estate, insurance and customer service", "airlines, conferences and marketing", "education, publishing and media", "construction, energy and city services", "fashion retail, e-commerce and shipping"];
    const { data, error } = await db.from("toeic_tests").insert({ title: `AI 出題 第 ${X.tests.filter(t => !t.builtin).length + 1} 回`, theme: themes[X.tests.length % themes.length] }).select().single();
    if (error) return toast(error.message);
    X.tests.push(data); render(); generate(data.id);
  }

  /* ---------- 聲音與照片 ---------- */
  const AU = {};
  function clip(key, body) { if (!AU[key]) { AU[key] = db.functions.invoke("toeic", { body: Object.assign({ action: "tts" }, body) }).then(r => { if (r.error || !r.data || !r.data.url) throw new Error((r.data && r.data.error) || "語音失敗"); return r.data.url; }); AU[key].catch(() => delete AU[key]); } return AU[key]; }
  const IMG = {};
  function photo(prompt) { if (!IMG[prompt]) { IMG[prompt] = db.functions.invoke("toeic", { body: { action: "image", prompt } }).then(r => { if (r.error || !r.data || !r.data.url) throw new Error("no"); return r.data.url; }); IMG[prompt].catch(() => delete IMG[prompt]); } return IMG[prompt]; }
  /* 每一組要念的內容 */
  function audioOf(g) {
    const h = hashN(g.id), a = VO[h % 6], b = VO[(h + 3) % 6];
    if (g.p === 1) return { key: g.id, body: { text: g.it.o.map((o, k) => `${"ABCD"[k]}. ${o}`).join("\n"), voice: a, duo: [a] } };
    if (g.p === 2) return { key: g.id, body: { text: `Man: ${g.it.q}\nWoman: A. ${g.it.o[0]} ... B. ${g.it.o[1]} ... C. ${g.it.o[2]}`, voice: a, duo: [h % 2 ? "us_m" : "au_m", h % 2 ? "uk_f" : "ca_f"] } };
    if (g.p === 3) return { key: g.id, body: { text: g.it.script.map(l => `${/^w/i.test(l.s) ? "Woman" : "Man"}: ${l.t}`).join("\n"), voice: a, duo: [h % 2 ? "us_m" : "uk_m", h % 2 ? "ca_f" : "us_f"] } };
    if (g.p === 4) return { key: g.id, body: { text: g.it.talk, voice: a, duo: [/^w/i.test(g.it.g || "") ? (h % 2 ? "uk_f" : "us_f") : (h % 2 ? "au_m" : "us_m")] } };
    return null;
  }
  let cur = null;
  function stop() { if (cur) { cur.pause(); cur = null; } try { speechSynthesis.cancel(); } catch (_) {} }
  async function play(g, onState) {
    const a = audioOf(g); if (!a) return; stop(); onState && onState("load");
    try { const url = await clip(a.key, a.body); await new Promise((res, rej) => { const au = new Audio(url); cur = au; au.onended = res; au.onerror = rej; au.play().then(() => onState && onState("play")).catch(rej); }); }
    catch (_) { onState && onState("tts"); await new Promise(res => { try { const u = new SpeechSynthesisUtterance(a.body.text.replace(/^(Man|Woman):/gm, "")); u.lang = "en-US"; u.rate = 0.95; u.onend = res; u.onerror = res; speechSynthesis.speak(u); } catch (_) { res(); } }); }
    onState && onState("done");
  }

  /* ---------- 練習 ---------- */
  function groups(t, parts) {
    const G = [];
    parts.forEach(p => PARTS[p].chunks.forEach(c => (t.parts[c] || []).forEach((it, i) => {
      const id = `t${t.id}-${c}-${i}`, qs = p === 1 || p === 2 || p === 5 ? [{ q: it.q || "", o: it.o, a: it.a, why: it.why }] : (it.qs || []);
      G.push({ id, p, it, qs: qs.filter(q => Array.isArray(q.o) && q.o.length >= 3) });
    })));
    return G.filter(g => g.qs.length);
  }
  function startDialog(id) {
    const t = X.tests.find(x => String(x.id) === String(id)), r = ready(t), m = document.createElement("div"); m.className = "vg-modal";
    m.innerHTML = `<div class="vg-card"><div class="vg-title">📝 ${esc(t.title)}：要練哪些？</div>
      <div class="tr-row"><button type="button" class="tr-chip sm" data-pre="all">整回</button><button type="button" class="tr-chip sm" data-pre="L">只考聽力</button><button type="button" class="tr-chip sm" data-pre="R">只考閱讀</button></div>
      ${[1, 2, 3, 4, 5, 6, 7].map(p => `<label class="tt-pk ${r.includes(p) ? "" : "off"}"><input type="checkbox" value="${p}" ${r.includes(p) ? "" : "disabled"}> <b>${PARTS[p].name}</b><small>${PARTS[p].n} 題・${PARTS[p].tip}${r.includes(p) ? "" : "（還沒產生）"}</small></label>`).join("")}
      <div class="tr-row"><label class="tt-pk" style="flex:1"><input type="radio" name="tt-mode" value="practice" checked> <b>練習模式</b><small>每組作答完立刻看答案、原文、翻譯和解析；聽力可以重聽</small></label></div>
      <div class="tr-row"><label class="tt-pk" style="flex:1"><input type="radio" name="tt-mode" value="exam"> <b>考試模式</b><small>跟正式考試一樣：聽力只播一次、閱讀計時（每題 45 秒），最後才對答案</small></label></div>
      <button type="button" class="btn btn-primary" data-go="1" style="width:100%">開始</button><button type="button" class="btn" data-vx="1" style="width:100%;margin-top:6px">取消</button></div>`;
    const sel = ps => m.querySelectorAll("input[type=checkbox]").forEach(c => { if (!c.disabled) c.checked = ps.includes(Number(c.value)); });
    m.addEventListener("click", e => {
      if (e.target === m || e.target.closest("[data-vx]")) return m.remove();
      const pre = e.target.closest("[data-pre]"); if (pre) return sel(pre.dataset.pre === "all" ? [1, 2, 3, 4, 5, 6, 7] : pre.dataset.pre === "L" ? [1, 2, 3, 4] : [5, 6, 7]);
      if (e.target.closest("[data-go]")) { const ps = [...m.querySelectorAll("input[type=checkbox]:checked")].map(c => Number(c.value)); if (!ps.length) return toast("至少選一個 Part");
        const mode = m.querySelector("input[name=tt-mode]:checked").value; m.remove(); run(t, ps, mode); }
    });
    document.body.appendChild(m);
  }

  function run(t, parts, mode) {
    let exam = mode === "exam";
    const G = groups(t, parts), total = G.reduce((s, g) => s + g.qs.length, 0), ans = {};
    const rQ = G.filter(g => g.p >= 5).reduce((s, g) => s + g.qs.length, 0); let deadline = null, timer = null;
    let gi = 0; const m = document.createElement("div"); m.className = "vg-modal tc-modal tt-run";
    G.slice(0, 3).forEach(g => { const a = audioOf(g); if (a) clip(a.key, a.body).catch(() => {}); if (g.p === 1) photo(g.it.img).catch(() => {}); });
    const done = () => Object.keys(ans).length;
    function body(g) {
      const it = g.it, P = g.p;
      if (P === 1) return `<div class="tt-photo" data-img="${esc(it.img)}"><p class="tr-note">📷 照片載入中…</p></div>`;
      if (P === 2) return `<p class="tr-note">🎧 只用聽的：一句話＋三個回應</p>`;
      if (P === 3 || P === 4) return `<p class="tr-note">🎧 ${P === 3 ? "對話" : esc(it.kind || "獨白")}：先快速看一下題目，再聽</p>`;
      if (P === 5) return `<p class="tc-q">${esc(it.q).replace(/-{3,}/, '<span class="tc-blank">_______</span>')}</p>`;
      if (P === 6) return `<div class="tt-doc"><b>${esc(it.title)}</b><p>${esc(it.text).replace(/\[(\d)\]/g, '<span class="tt-bl">($1)</span>').replace(/\n/g, "<br>")}</p></div>`;
      if (P === 7) return it.docs.map(d => `<div class="tt-doc"><b>${esc(d.title)}</b><p>${esc(d.text).replace(/\n/g, "<br>")}</p></div>`).join("");
      return "";
    }
    function qHtml(g, qi) {
      const q = g.qs[qi], key = `${g.id}#${qi}`, picked = ans[key], show = !exam && g.checked, letters = g.p === 2 ? "ABC" : "ABCD";
      const label = g.p === 1 || g.p === 2 ? "" : g.p === 5 ? "" : `<p class="tt-qq">${g.qs.length > 1 ? `${qi + 1}. ` : ""}${esc(q.q)}</p>`;
      const hideText = (g.p === 1 || g.p === 2) && !show;
      return `<div class="tt-q">${label}<div class="${hideText ? "tc-abcs" : ""}">${q.o.map((o, k) => hideText ? `<button type="button" class="tc-abc ${picked === k ? "pick" : ""}" data-a="${key}" data-k="${k}">${letters[k]}</button>`
        : `<button type="button" class="nb-opt ${picked === k ? "pick" : ""} ${show ? (k === q.a ? "ok" : picked === k ? "no" : "x") : ""}" data-a="${key}" data-k="${k}" ${show ? "disabled" : ""}>(${letters[k]}) ${esc(o)}</button>`).join("")}</div>
        ${show ? `<p class="tt-why">${picked === q.a ? "⭕" : "❌"} ${esc(q.why || "")}</p>` : ""}</div>`;
    }
    function draw() {
      const g = G[gi], P = PARTS[g.p], L = P.L, all = g.qs.every((_, qi) => ans[`${g.id}#${qi}`] != null);
      m.innerHTML = `<div class="vg-card tc-card"><div class="tc-mh"><b>📝 ${esc(t.title)}・${P.name}</b><span>${done()}/${total}${deadline ? ` ・⏱️ <i id="tt-clock"></i>` : ""}</span><button type="button" class="tr-x" data-x="1">✕</button></div>
        <div class="tc-bar"><i style="width:${done() / total * 100}%"></i></div>
        ${L ? `<div class="tc-p2 tt-au"><button type="button" class="tc-play" data-play="1" ${exam && g.played ? "disabled" : ""}>${exam && g.played ? "✔️ 已播放" : g.played ? "🔁 再聽一次" : "🔊 播放"}</button></div>` : ""}
        ${g.p === 7 ? `<div class="tt-p7"><span>⏱️ 建議 ${g.qs.length} 分鐘・已用 <b id="tt-p7t">0:00</b></span><div class="tc-mini"><i id="tt-p7b"></i></div><small>💡 先看題目，抓關鍵字，再回文章找答案</small></div>${g.qs.map((_, qi) => qHtml(g, qi)).join("")}${body(g)}` : `${body(g)}${g.qs.map((_, qi) => qHtml(g, qi)).join("")}`}
        ${!exam && g.checked ? reveal(g) : ""}
        <div class="tr-row">${gi > 0 ? `<button type="button" class="btn btn-small" data-prev="1">← 上一組</button>` : ""}
          ${!exam && !g.checked ? `<button type="button" class="btn btn-small btn-primary" data-check="1" ${all ? "" : "disabled"} style="margin-left:auto">對答案</button>` : `<button type="button" class="btn btn-small btn-primary" data-next="1" style="margin-left:auto">${gi + 1 < G.length ? "下一組 →" : "交卷看成績"}</button>`}</div></div>`;
      const ph = m.querySelector(".tt-photo"); if (ph) photo(g.it.img).then(u => { if (ph.isConnected) ph.innerHTML = `<img src="${u}" alt="">`; }).catch(() => { if (ph.isConnected) ph.innerHTML = `<p class="tt-doc">📷（照片暫時產生不出來，改用文字描述）<br>${esc(g.it.img)}</p>`; });
      if (L && !g.played) setTimeout(() => doPlay(g), 400);
      G.slice(gi + 1, gi + 3).forEach(n => { const a = audioOf(n); if (a) clip(a.key, a.body).catch(() => {}); if (n.p === 1) photo(n.it.img).catch(() => {}); });
      tickClock();
      if (g.p === 7 && !g.t0) g.t0 = Date.now();
    }
    /* Part 7 每組的計時：建議每題 1 分鐘，超過會提醒 */
    const p7iv = setInterval(() => {
      if (!m.isConnected) return clearInterval(p7iv);
      const g = G[gi]; if (!g || g.p !== 7 || !g.t0 || g.checked) return;
      const used = (Date.now() - g.t0) / 1000, lim = g.qs.length * 60, t = m.querySelector("#tt-p7t"), b = m.querySelector("#tt-p7b");
      if (t) t.textContent = `${Math.floor(used / 60)}:${String(Math.floor(used % 60)).padStart(2, "0")}`;
      if (b) { b.style.width = Math.min(100, used / lim * 100) + "%"; b.style.background = used > lim ? "#f85149" : ""; }
      if (used > lim && !g.warned) { g.warned = true; toast("⏱️ 這組超過建議時間了：先選最有把握的答案，往下做"); }
    }, 1000);
    /* 📖 Part 7：從看到文章到全部選完，算每分鐘讀幾個字 */
    function readDone(g) {
      if (g.p !== 7 || !g.t0 || g.tDone || !g.qs.every((_, qi) => ans[`${g.id}#${qi}`] != null)) return;
      g.tDone = Date.now(); const words = g.it.docs.reduce((a, d) => a + (String(d.text).match(/[A-Za-z0-9'’-]+/g) || []).length, 0), secs = Math.max(1, Math.round((g.tDone - g.t0) / 1000));
      const correct = g.qs.filter((q, qi) => ans[`${g.id}#${qi}`] === q.a).length, wpm = Math.round(words / secs * 60);
      g.read = { gid: g.id, words, secs, wpm, correct, total: g.qs.length }; if (secs >= 15) db.from("toeic_reading").insert(g.read).then(() => {});
      if (!exam && secs >= 15) toast(`📖 這組 ${words} 字，用了 ${Math.floor(secs / 60)} 分 ${secs % 60} 秒（每分鐘 ${wpm} 字）`);
    }
    function reveal(g) { return reveal0(g) + tools(g); }
    function tools(g) {
      const wrong = g.qs.some((q, qi) => ans[`${g.id}#${qi}`] !== q.a);
      return `<div class="tt-tools">${wrong ? `<div class="tt-rs"><small>❓ 這組錯在哪？</small>${REASONS.map(r => `<button type="button" class="tr-chip sm ${g.reason === r ? "on" : ""}" data-rs="${r}">${r}</button>`).join("")}</div>` : ""}
        <div class="tr-row">${wrong && (g.p === 2 || g.p === 5) && window.ToeicSys ? `<button type="button" class="btn btn-small" data-var="1">🧬 變形題</button>` : ""}${g.p === 3 || g.p === 4 ? `<button type="button" class="btn btn-small" data-shadow="1">🎧 逐句跟讀</button>` : ""}<button type="button" class="btn btn-small" data-vocab="1">📚 收集生字</button></div></div>`;
    }
    function reveal0(g) {
      const it = g.it;
      if (g.p === 1) return `<p class="tt-why">🈶 ${esc(it.zh)}</p>`;
      if (g.p === 2) return `<p class="tt-why">🗣️ ${esc(it.q)}<br>🈶 ${esc(it.zh)}</p>`;
      if (g.p === 3) return `<details class="tr-list" open><summary>📜 對話原文與翻譯</summary><p class="tt-script">${it.script.map(l => `<b>${/^w/i.test(l.s) ? "W" : "M"}:</b> ${esc(l.t)}`).join("<br>")}</p><p class="tr-note">🈶 ${esc(it.zh)}</p></details>`;
      if (g.p === 4) return `<details class="tr-list" open><summary>📜 原文與翻譯</summary><p class="tt-script">${esc(it.talk)}</p><p class="tr-note">🈶 ${esc(it.zh)}</p></details>`;
      if (g.p === 5) return `<p class="tt-why">🈶 ${esc(it.zh)}</p>`;
      return `<details class="tr-list"><summary>🈶 中文翻譯／摘要</summary><p class="tr-note">${esc(it.zh)}</p></details>`;
    }
    async function doPlay(g) {
      if (exam && g.played) return; g.played = true;
      const b = m.querySelector("[data-play]"); if (b) { b.disabled = true; b.textContent = "⏳ 準備聲音…"; }
      await play(g, s => { const x = m.querySelector("[data-play]"); if (!x) return; if (s === "play" || s === "tts") x.textContent = "🔊 播放中…"; if (s === "done") { x.disabled = exam; x.textContent = exam ? "✔️ 已播放" : "🔁 再聽一次"; } });
    }
    function tickClock() { const el = m.querySelector("#tt-clock"); if (!el || !deadline) return; const s = Math.max(0, Math.round((deadline - Date.now()) / 1000)); el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
    function goReading() { if (exam && !deadline && G[gi].p >= 5) { deadline = Date.now() + rQ * 45 * 1000; timer = setInterval(() => { tickClock(); if (Date.now() > deadline) { clearInterval(timer); toast("⏱️ 時間到，自動交卷"); finish(); } }, 1000); } }
    async function finish() {
      clearInterval(timer); stop();
      const by = {}; let lR = 0, lN = 0, rR = 0, rN = 0;
      G.forEach(g => g.qs.forEach((q, qi) => { const ok = ans[`${g.id}#${qi}`] === q.a; by[g.p] = by[g.p] || [0, 0]; by[g.p][1]++; if (ok) by[g.p][0]++; if (g.p <= 4) { lN++; if (ok) lR++; } else { rN++; if (ok) rR++; } }));
      const r5 = v => Math.max(5, Math.min(495, Math.round(v / 5) * 5)), Ls = lN ? r5(lR / lN * 520 - 15) : null, Rs = rN ? r5(rR / rN * 530 - 40) : null, est = Ls != null && Rs != null ? Ls + Rs : null;
      const detail = { test_id: t.id, parts, by, mode }, mockP = db.from("toeic_mocks").insert({ l_acc: lN ? lR / lN : null, r_acc: rN ? rR / rN : null, est: est || Ls || Rs, detail }).select("id").single().then(r => r, e => ({ error: e }));
      const rows = []; G.forEach(g => g.qs.forEach((q, qi) => rows.push({ qid: `${g.id}#${qi}`, part: g.p, tag: g.p === 2 || g.p === 5 ? (g.it.tag || "test") : "test", correct: ans[`${g.id}#${qi}`] === q.a, mode: "test" })));
      if (rows.length) db.from("toeic_answers").insert(rows).then(() => {});
      /* 答錯的題目放進錯題本，跟每日練習一起照遺忘曲線複習 */
      const rv = rows.filter(r => !r.correct).map(r => ({ qid: r.qid, part: r.part, tag: r.tag, stage: 0, due: tomorrow() }));
      if (rv.length) db.from("toeic_review").upsert(rv, { onConflict: "user_id,qid" }).then(() => { if (window.ToeicSys) window.ToeicSys.load(); });
      if (lN + rN >= 50) db.rpc("toeic_task_done", { p_task: "mock" }).then(r => { if (r.data && r.data.granted) toast(`📝 模擬試題完成，星屑 +${r.data.amount}`); });
      m.innerHTML = `<div class="vg-card tc-card"><div style="text-align:center"><div style="font-size:42px">📊</div><h3>${esc(t.title)} 成績</h3></div>
        <div class="tc-score">${Ls != null ? `<div><small>🎧 聽力</small><b>${Ls}</b><small>${lR}/${lN}</small></div>` : ""}${Rs != null ? `<div><small>📖 閱讀</small><b>${Rs}</b><small>${rR}/${rN}</small></div>` : ""}${est != null ? `<div><small>預估總分</small><b>${est}</b></div>` : ""}</div>
        <div class="tr-scroll"><table class="tr-cmp"><tr><th>Part</th><th>答對</th><th>正確率</th></tr>${Object.entries(by).map(([p, [o, n]]) => `<tr><td>${PARTS[p].name}</td><td>${o}/${n}</td><td class="${o / n >= 0.7 ? "up" : o / n < 0.5 ? "dn" : ""}">${Math.round(o / n * 100)}%</td></tr>`).join("")}</table></div>
        <p class="tr-note">${(() => { const w = Object.entries(by).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1])[0]; return w ? `最弱的是 ${PARTS[w[0]].name}（${Math.round(w[1][0] / w[1][1] * 100)}%），下次可以只挑這個 Part 再練一次。` : ""; })()}${parts.length < 7 ? "只練部分 Part 時，分數是用這幾個 Part 推估的。" : ""}換算是粗估，正式考試的分數表會依難度調整。</p>
        ${G.some(g => g.qs.some((q, qi) => ans[`${g.id}#${qi}`] !== q.a)) ? `<p class="tr-note">❌ 答錯的題目已放進錯題本，明天開始會在「🔁 錯題複習」再出現。</p>` : ""}
        ${lN + rN >= 20 ? `<div class="tt-diag" id="tt-diag"><p class="tr-note">🤖 AI 正在看你的作答，寫診斷中…（約 10–20 秒）</p></div>` : ""}
        ${exam ? `<button type="button" class="btn" data-review="1" style="width:100%">🔍 一題一題看答案與解析</button>` : ""}
        <button type="button" class="btn btn-primary" data-x="1" style="width:100%;margin-top:6px">完成</button></div>`;
      m.dataset.fin = "1"; load();
      if (lN + rN >= 20) diagnose({ t, G, ans, by, Ls, Rs, est, rows, mode, mockP, detail, box: () => m.querySelector("#tt-diag") });
    }
    m.addEventListener("click", e => {
      if (e.target.closest("[data-x]")) { if (!m.dataset.fin && done() && !confirm("中途離開，這次的作答不會計分。確定嗎？")) return; clearInterval(timer); stop(); m.remove(); return; }
      if (e.target.closest("[data-play]")) return doPlay(G[gi]);
      const a = e.target.closest("[data-a]"); if (a && !(G[gi].checked && !exam)) { ans[a.dataset.a] = Number(a.dataset.k); readDone(G[gi]); return draw(); }
      if (e.target.closest("[data-check]")) { G[gi].checked = true; stop(); return draw(); }
      if (e.target.closest("[data-next]")) { stop(); if (gi + 1 < G.length) { gi++; goReading(); draw(); } else if (m.dataset.fin) { m.remove(); } else finish(); return; }
      if (e.target.closest("[data-prev]")) { stop(); gi--; return draw(); }
      const rs = e.target.closest("[data-rs]"); if (rs) { const g = G[gi]; g.reason = rs.dataset.rs; saveReasons(g, ans, g.reason); toast("📝 記下來了，週報會幫你統計"); return draw(); }
      if (e.target.closest("[data-shadow]")) return shadow(G[gi]);
      if (e.target.closest("[data-var]")) { const g = G[gi], q = g.qs[0]; return window.ToeicSys.variantSession({ id: `${g.id}#0`, part: g.p, tag: g.it.tag || "test", q: q.q, o: q.o, a: q.a, why: q.why }); }
      if (e.target.closest("[data-vocab]")) return vocabPick(G[gi]);
      if (e.target.closest("[data-review]")) { G.forEach(g => { g.checked = true; g.played = true; }); gi = 0; exam = false; deadline = null; return draw(); }
    });
    goReading(); draw(); document.body.appendChild(m); focusOn(m);
  }

  /* ---------- 共用小工具 ---------- */
  const REASONS = ["單字不會", "聽不出來", "文法不懂", "陷阱題", "時間不夠", "粗心"];
  const tomorrow = () => { const d = new Date(Date.now() + 8 * 3600e3 - 6 * 3600e3 + 864e5); return d.toISOString().slice(0, 10); };
  function saveReasons(g, ans, reason) {
    const rows = g.qs.map((q, qi) => [q, qi]).filter(([q, qi]) => ans[`${g.id}#${qi}`] !== q.a).map(([q, qi]) => ({ qid: `${g.id}#${qi}`, part: g.p, tag: g.p === 2 || g.p === 5 ? (g.it.tag || "test") : "test", reason }));
    if (rows.length) db.from("toeic_reasons").insert(rows).then(() => {});
  }
  /* 練習時靈獸切換成「專注陪讀」 */
  function focusOn(m) {
    window.__studyFocus = true; if (window.Spirit && window.Spirit.render) window.Spirit.render();
    const ob = new MutationObserver(() => { if (!m.isConnected) { ob.disconnect(); if (!document.querySelector(".tc-modal")) { window.__studyFocus = false; if (window.Spirit && window.Spirit.render) window.Spirit.render(); } } });
    ob.observe(document.body, { childList: true });
  }
  /* 🎧 逐句跟讀：一句一句播，可以先遮字幕再看字幕 */
  const sentences = g => g.p === 3 ? g.it.script.map(l => ({ s: /^w/i.test(l.s) ? "W" : "M", t: l.t })) : (g.it.talk.match(/[^.!?]+[.!?]+["']?/g) || [g.it.talk]).map(t => ({ s: /^w/i.test(g.it.g || "") ? "W" : "M", t: t.trim() }));
  function shadow(g) {
    const L = sentences(g), h = hashN(g.id), vM = h % 2 ? "us_m" : "uk_m", vW = h % 2 ? "ca_f" : "us_f", m = document.createElement("div"); m.className = "vg-modal tc-modal";
    let hide = true, auto = false;
    const sayLine = async (k) => { const l = L[k], v = l.s === "W" ? vW : vM; stop(); m.querySelectorAll(".tt-sl").forEach((x, j) => x.classList.toggle("on", j === k));
      try { const url = await clip(`sh|${v}|${l.t}`, { text: l.t, voice: v, duo: [v] }); await new Promise((res, rej) => { const a = new Audio(url); cur = a; a.onended = res; a.onerror = rej; a.play().catch(rej); }); }
      catch (_) { await new Promise(res => { try { const u = new SpeechSynthesisUtterance(l.t); u.lang = "en-US"; u.rate = 0.9; u.onend = res; u.onerror = res; speechSynthesis.speak(u); } catch (_) { res(); } }); } };
    const draw = () => { m.innerHTML = `<div class="vg-card tc-card"><div class="tc-mh"><b>🎧 逐句跟讀</b><button type="button" class="tr-x" data-x="1">✕</button></div>
      <p class="tr-note">建議：① 遮著字幕聽一句、自己跟著念 ② 聽不出來再點「看字幕」③ 最後用連播模式從頭聽一次。</p>
      <div class="tr-row"><button type="button" class="btn btn-small" data-hide="1">${hide ? "👀 全部顯示字幕" : "🙈 全部遮住"}</button><button type="button" class="btn btn-small btn-primary" data-auto="1">${auto ? "⏹ 停止連播" : "▶️ 逐句連播（每句停 2 秒讓你跟念）"}</button></div>
      ${L.map((l, k) => `<div class="tt-sl"><button type="button" class="tc-abc" data-line="${k}" style="width:40px;height:40px;font-size:16px">▶</button><div><small>${l.s === "W" ? "👩" : "👨"} ${k + 1}</small><p class="${hide ? "blur" : ""}" data-show="${k}">${esc(l.t)}</p></div></div>`).join("")}</div>`; };
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-x]")) { auto = false; stop(); return m.remove(); }
      const ln = e.target.closest("[data-line]"); if (ln) return sayLine(Number(ln.dataset.line));
      const sh = e.target.closest("[data-show]"); if (sh) return sh.classList.toggle("blur");
      if (e.target.closest("[data-hide]")) { hide = !hide; return draw(); }
      if (e.target.closest("[data-auto]")) { auto = !auto; draw(); if (auto) { for (let k = 0; k < L.length && auto && m.isConnected; k++) { await sayLine(k); await new Promise(r => setTimeout(r, 2000)); } auto = false; if (m.isConnected) draw(); } else stop(); }
    });
    draw(); document.body.appendChild(m);
  }
  /* 📚 收集生字：從這組題目挑出你單字庫還沒有的字，一鍵加入「多益模考生字」 */
  const STOP = new Set("about above after again against because before being below between could doesn't during every further having here hers herself himself itself just more most myself other ought ours ourselves same should some such than that their theirs them themselves then there these they this those through under until very were what when where which while whom with would your yours yourself yourselves please thank thanks also will shall have been from into over only each both onto upon will would make made said says like well also than then they them".split(" "));
  let MYWORDS = null;
  async function vocabPick(g) {
    if (!MYWORDS) { const { data } = await db.from("vocab_words").select("word"); MYWORDS = new Set((data || []).map(x => String(x.word).toLowerCase())); }
    const it = g.it, text = [it.q, it.text, it.talk, ...(it.o || []), ...(it.script || []).map(l => l.t), ...(it.docs || []).flatMap(d => [d.title, d.text]), ...g.qs.flatMap(q => [q.q, ...(q.o || [])])].filter(Boolean).join(" ");
    const sentOf = w => (text.match(new RegExp(`[^.!?\n]*\b${w}\b[^.!?\n]*[.!?]?`, "i")) || [""])[0].trim().slice(0, 200);
    const words = [...new Set((text.match(/[A-Za-z][a-z-]{4,}/g) || []).map(w => w.toLowerCase()))].filter(w => !STOP.has(w) && !MYWORDS.has(w)).sort((a, b) => b.length - a.length).slice(0, 36);
    const m = document.createElement("div"); m.className = "vg-modal";
    m.innerHTML = `<div class="vg-card"><div class="vg-title">📚 收集生字</div><p class="tr-note">這組題目裡你單字庫還沒有的字（長的、比較難的排前面）。點一下輸入中文意思，就會加進「📖 單字」的「多益模考生字」，之後一起複習。</p>
      <div class="tr-row">${words.length ? words.map(w => `<button type="button" class="tr-chip sm" data-w="${esc(w)}">${esc(w)}</button>`).join("") : "這組沒有新字了 🎉"}</div><button type="button" class="btn" data-vx="1" style="width:100%">完成</button></div>`;
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-vx]")) return m.remove();
      const b = e.target.closest("[data-w]"); if (!b || b.classList.contains("on")) return;
      const w = b.dataset.w, mean = prompt(`「${w}」的中文意思？`, ""); if (mean == null) return;
      const { error } = await db.from("vocab_words").insert({ user_id: currentUser.id, deck: "多益模考生字", word: w, meaning: mean.trim() || "（待補）", example: sentOf(w), tags: "多益模考" });
      if (error) return toast(/duplicate|unique/.test(error.message) ? "這個字已經在單字庫了" : error.message);
      MYWORDS.add(w); b.classList.add("on"); b.textContent = "✓ " + w;
    });
    document.body.appendChild(m);
  }
  /* 🤖 模考 AI 診斷：把這次的數據交給 AI，寫診斷並調整每日練習 7 天 */
  async function diagnose(o) {
    const S = window.ToeicSys ? window.ToeicSys.state : null, set = (S && S.set) || {}, nm = (p, t) => window.ToeicSys ? window.ToeicSys.tagName(p, t) : t;
    const tagAcc = {}; o.rows.filter(r => r.part === 5 || r.part === 2).forEach(r => { const k = `Part ${r.part} ${nm(r.part, r.tag)}`; tagAcc[k] = tagAcc[k] || [0, 0]; tagAcc[k][1]++; if (r.correct) tagAcc[k][0]++; });
    const reasons = {}; o.G.forEach(g => { if (g.reason) reasons[g.reason] = (reasons[g.reason] || 0) + 1; });
    const rd = o.G.filter(g => g.read).map(g => g.read), wpm = rd.length ? Math.round(rd.reduce((a, r) => a + r.words, 0) / rd.reduce((a, r) => a + r.secs, 0) * 60) : null;
    const past = ((S && S.mocks) || []).filter(m => m.est).slice(0, 5).map(m => ({ est: m.est, date: String(m.created_at).slice(0, 10) }));
    const daysLeft = set.exam_date ? Math.round((new Date(set.exam_date) - Date.now()) / 864e5) : null;
    const payload = { action: "diagnose", mode: o.mode, parts: Object.fromEntries(Object.entries(o.by).map(([p, [c, n]]) => [PARTS[p].name, `${c}/${n}（${Math.round(c / n * 100)}%）`])),
      listening: o.Ls, reading: o.Rs, estimate: o.est, tag_accuracy: Object.fromEntries(Object.entries(tagAcc).map(([k, [c, n]]) => [k, `${c}/${n}`])), wrong_reasons: reasons,
      part7_words_per_minute: wpm, target: set.target, start_score: set.start_score, days_to_exam: daysLeft, daily_minutes: set.daily_min, previous_estimates: past };
    async function save(data, rule) {
      const until = (() => { const d = new Date(Date.now() + 8 * 3600e3 - 6 * 3600e3 + 7 * 864e5); return d.toISOString().slice(0, 10); })();
      const adj = { p2: data.p2, p5: data.p5, review: data.review, focus: data.focus, until };
      const mk = await o.mockP; if (mk.data) await db.from("toeic_mocks").update({ detail: Object.assign({}, o.detail, { diag: data }) }).eq("id", mk.data.id);
      await db.from("toeic_settings").upsert({ plan_adj: adj }, { onConflict: "user_id" });
      if (window.ToeicSys) window.ToeicSys.load();
      const b = o.box(); if (b) b.innerHTML = `<p class="tc-h4">${rule ? "📊 自動診斷（AI 休息中，用你的作答數據算的）" : "🤖 AI 診斷"}</p><p>${esc(data.summary)}</p>${data.losses.length ? `<p class="tc-h4">📉 分數掉在哪</p><ul class="tc-ul">${data.losses.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${data.plan.length ? `<p class="tc-h4">🗓️ 下週這樣練</p><ul class="tc-ul">${data.plan.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}<p class="tr-note">📐 接下來 7 天的每日練習已經照這份診斷自動調整（Part 2 ×${data.p2}、Part 5 ×${data.p5}、錯題 ×${data.review}）。</p>`;
    }
    const box = o.box();
    try {
      const { data, error } = await db.functions.invoke("toeic", { body: payload });
      if (error || !data || data.error) throw new Error((data && data.error) || (error && error.message) || "AI 沒回應");
      await save(data, false);
    } catch (err) {
      /* AI 額度用完：用規則自己做一份診斷（一樣會調整每日練習） */
      const b = o.box(); try { const d = ruleDiag(payload, o); await save(d, true); } catch (e2) { if (b) b.innerHTML = `<p class="tr-note dn">😵 診斷暫時寫不出來：${esc(err.message)}。成績已經存好了。</p>`; }
    }
  }
  /* AI 不能用時的「規則診斷」：找最弱的 Part、文法點、錯誤原因，配對應的練法 */
  function ruleDiag(P, o) {
    const parts = Object.entries(o.by).map(([p, [c, n]]) => ({ p: Number(p), name: PARTS[p].name, acc: c / n, c, n })).sort((a, b) => a.acc - b.acc);
    const tags = Object.entries(P.tag_accuracy || {}).map(([k, v]) => { const [c, n] = v.split("/").map(Number); return { k, c, n, acc: c / n }; }).filter(x => x.n >= 2).sort((a, b) => a.acc - b.acc);
    const rs = Object.entries(P.wrong_reasons || {}).sort((a, b) => b[1] - a[1]), best = parts[parts.length - 1], worst = parts[0];
    const L = parts.filter(x => x.p <= 4), Rd = parts.filter(x => x.p >= 5), avg = a => a.length ? a.reduce((s, x) => s + x.c, 0) / a.reduce((s, x) => s + x.n, 0) : null, la = avg(L), ra = avg(Rd);
    const TIP = { 1: "Part 1：每天聽 5 張照片題，先猜「人在做什麼」", 2: "每日 Part 2 多做一點，聽到第一個字（Who／When／Where）就先刪選項", 3: "Part 3 用「🎧 逐句跟讀」每天 1 組，先看題目再聽", 4: "Part 4 每天通勤聽 2 組獨白，抓「誰在說、目的、下一步」", 5: "每日弱點專練 Part 5 最弱的文法點 8 題", 6: "Part 6 先讀空格前後兩句，再決定答案", 7: "Part 7 每天計時做 2 組，先看題目再回文章找關鍵字" };
    const focusMap = { 詞性: "pos", 時態: "tense", "主動／被動": "voice", 介系詞: "prep", 連接詞: "conj", 代名詞: "pron", 關係詞: "rel", 比較級: "comp", 單字搭配: "vocab", "分詞／動名詞": "part" };
    const focus = tags.filter(t => t.k.startsWith("Part 5") && t.acc < 0.6).map(t => focusMap[t.k.replace("Part 5 ", "")]).filter(Boolean).slice(0, 3);
    const cl = v => Math.max(0.7, Math.min(1.5, Math.round(v * 10) / 10));
    return {
      summary: `這次最好的是 ${best.name}（${Math.round(best.acc * 100)}%），最需要補的是 ${worst.name}（${Math.round(worst.acc * 100)}%）。${la != null && ra != null ? (la < ra ? "整體來說聽力比閱讀弱，接下來一週多練聽。" : "整體來說閱讀比聽力弱，接下來一週多練閱讀。") : ""}`,
      losses: [...parts.slice(0, 2).map(x => `${x.name} 只答對 ${x.c}/${x.n}（${Math.round(x.acc * 100)}%）`), ...tags.slice(0, 1).map(t => `${t.k} 答對 ${t.c}/${t.n}`), ...(P.part7_words_per_minute && P.part7_words_per_minute < 120 ? [`Part 7 每分鐘只讀 ${P.part7_words_per_minute} 字，容易寫不完`] : []), ...(rs.length ? [`最常錯的原因是「${rs[0][0]}」（${rs[0][1]} 組）`] : [])].slice(0, 3),
      plan: [...new Set([TIP[worst.p], parts[1] ? TIP[parts[1].p] : null, focus.length ? "每天做一次「🗺️ 弱點專練」" : null, "每天錯題複習清空，週日再做一次完整試題的弱項 Part"].filter(Boolean))].slice(0, 4),
      p2: cl(la != null && ra != null ? 1 + (ra - la) : 1), p5: cl(la != null && ra != null ? 1 + (la - ra) : 1), review: 1.2, focus };
  }
  /* 🚇 通勤純聽用：每天輪替幾組 Part 3／4 */
  function listenGroups(n) {
    const all = []; X.tests.filter(t => t.parts).forEach(t => [3, 4].forEach(p => PARTS[p].chunks.forEach(c => (t.parts[c] || []).forEach((it, i) => { if ((it.qs || []).length) all.push({ id: `t${t.id}-${c}-${i}`, p, it, qs: it.qs }); }))));
    if (!all.length) return []; const day = Math.floor((Date.now() + 2 * 3600e3) / 864e5), st = (day * n) % all.length;
    return Array.from({ length: Math.min(n, all.length) }, (_, k) => all[(st + k * 7) % all.length]);
  }
  /* 給每日練習的錯題複習用：用題號把模擬試題的題目找回來 */
  function getQ(qid) {
    const m = /^t(.+)-(p\d[a-z]?)-(\d+)#(\d+)$/.exec(qid); if (!m) return null;
    const t = X.tests.find(x => String(x.id) === m[1]); if (!t || !t.parts || !t.parts[m[2]]) return null;
    const p = Number(Object.keys(PARTS).find(k => PARTS[k].chunks.includes(m[2]))), it = t.parts[m[2]][Number(m[3])]; if (!it) return null;
    const qi = Number(m[4]), q = p === 1 || p === 2 || p === 5 ? { q: it.q || "", o: it.o, a: it.a, why: it.why } : (it.qs || [])[qi]; if (!q) return null;
    let ctx = "";
    if (p === 1) ctx = `<p class="tt-doc">📷 ${esc(it.img)}</p>`;
    if (p === 3) ctx = `<details class="tr-list"><summary>📜 對話原文（可以先聽再看）</summary><p class="tt-script">${it.script.map(l => `<b>${/^w/i.test(l.s) ? "W" : "M"}:</b> ${esc(l.t)}`).join("<br>")}</p></details>`;
    if (p === 4) ctx = `<details class="tr-list"><summary>📜 原文（可以先聽再看）</summary><p class="tt-script">${esc(it.talk)}</p></details>`;
    if (p === 6) ctx = `<div class="tt-doc"><b>${esc(it.title)}</b><p>${esc(it.text).replace(/\n/g, "<br>")}</p></div>`;
    if (p === 7) ctx = it.docs.map(d => `<div class="tt-doc"><b>${esc(d.title)}</b><p>${esc(d.text).replace(/\n/g, "<br>")}</p></div>`).join("");
    return { id: qid, part: p, tag: it.tag || "test", q: p === 1 ? "Which statement best describes the photo?" : q.q, o: q.o, a: q.a, zh: it.zh || "", why: q.why || "", ctx, test: true, group: { id: `t${t.id}-${m[2]}-${m[3]}`, p, it } };
  }
  window.ToeicTest = { getQ, load, play: (g, cb) => play(g, cb), audioOf, clip, listenGroups, ensure: async () => { if (!X.tests.length) await load(); return X.tests.length; } };

  document.addEventListener("click", e => {
    const b = e.target.closest("[data-tt]"); if (!b) return; const id = /^\d+$/.test(b.dataset.v || "") ? Number(b.dataset.v) : b.dataset.v;
    if (b.dataset.tt === "gen") generate(id);
    if (b.dataset.tt === "start") startDialog(id);
    if (b.dataset.tt === "new") newTest();
  });

  const css = document.createElement("style");
  css.textContent = `
    .tt-test { border: 1px solid rgba(127,127,127,.25); border-radius: 12px; padding: 10px; margin: 8px 0; display: grid; gap: 6px; }
    .tt-h { display: flex; justify-content: space-between; align-items: baseline; } .tt-h small { font-size: 11.5px; opacity: .6; }
    .tt-parts { display: flex; gap: 4px; } .tt-parts span { font-size: 11px; padding: 2px 7px; border-radius: 6px; background: rgba(127,127,127,.15); opacity: .55; } .tt-parts span.ok { background: rgba(63,185,80,.25); opacity: 1; }
    .tt-pk { display: flex; gap: 8px; align-items: flex-start; padding: 6px 4px; border-bottom: 1px solid rgba(127,127,127,.12); font-size: 13.5px; cursor: pointer; } .tt-pk small { display: block; font-size: 11.5px; opacity: .65; } .tt-pk.off { opacity: .45; }
    .tt-pk > b, .tt-pk input + b { flex: 0 0 auto; } .tt-pk { flex-wrap: wrap; }
    .tt-run .vg-card { max-width: 640px; max-height: 92vh; overflow-y: auto; }
    .tt-photo img { width: 100%; border-radius: 12px; display: block; } .tt-doc { padding: 10px 12px; border-radius: 10px; background: rgba(127,127,127,.08); margin: 8px 0; font-size: 13.5px; line-height: 1.6; } .tt-doc p { margin: 6px 0 0; }
    .tt-bl { font-weight: 700; color: #7c5cff; } .tt-q { margin: 10px 0; } .tt-qq { font-weight: 600; font-size: 14px; margin: 6px 0; }
    .nb-opt.pick, .tc-abc.pick { border-color: #7c5cff; background: rgba(124,92,255,.18); } .tt-why { font-size: 13px; padding: 6px 10px; border-radius: 8px; background: rgba(255,213,74,.12); margin: 6px 0; }
    .tt-script { font-size: 13px; line-height: 1.7; }
    .tt-p7 { padding: 8px 10px; border-radius: 10px; background: rgba(124,92,255,.08); margin: 8px 0; font-size: 12.5px; } .tt-p7 small { display: block; opacity: .7; margin-top: 4px; }
    .tt-tools { border-top: 1px dashed rgba(127,127,127,.3); margin-top: 10px; padding-top: 8px; } .tt-rs { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; } .tt-rs small { opacity: .7; margin-right: 4px; }
    .tt-sl { display: flex; gap: 10px; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid rgba(127,127,127,.12); } .tt-sl p { margin: 2px 0; font-size: 14px; cursor: pointer; transition: filter .2s; } .tt-sl small { font-size: 11px; opacity: .6; }
    .tt-diag { margin: 10px 0; padding: 10px 12px; border-radius: 12px; background: rgba(124,92,255,.08); font-size: 13.5px; } .tt-diag p { margin: 4px 0; }
    .tt-sl p.blur { filter: blur(6px); user-select: none; } .tt-sl.on .tc-abc { border-color: #7c5cff; background: rgba(124,92,255,.2); }`;
  document.head.appendChild(css);

  if (typeof window.applyPage === "function") { const base = window.applyPage; window.applyPage = function (name) { const r = base.apply(this, arguments); if (name === "toeic") setTimeout(load, 300); return r; }; }
  (function boot(n) { if (!hasDb()) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; } setTimeout(load, 800); })(0);
})();
