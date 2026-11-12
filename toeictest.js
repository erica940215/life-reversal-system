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
        ${body(g)}${g.qs.map((_, qi) => qHtml(g, qi)).join("")}
        ${!exam && g.checked ? reveal(g) : ""}
        <div class="tr-row">${gi > 0 ? `<button type="button" class="btn btn-small" data-prev="1">← 上一組</button>` : ""}
          ${!exam && !g.checked ? `<button type="button" class="btn btn-small btn-primary" data-check="1" ${all ? "" : "disabled"} style="margin-left:auto">對答案</button>` : `<button type="button" class="btn btn-small btn-primary" data-next="1" style="margin-left:auto">${gi + 1 < G.length ? "下一組 →" : "交卷看成績"}</button>`}</div></div>`;
      const ph = m.querySelector(".tt-photo"); if (ph) photo(g.it.img).then(u => { if (ph.isConnected) ph.innerHTML = `<img src="${u}" alt="">`; }).catch(() => { if (ph.isConnected) ph.innerHTML = `<p class="tt-doc">📷（照片暫時產生不出來，改用文字描述）<br>${esc(g.it.img)}</p>`; });
      if (L && !g.played) setTimeout(() => doPlay(g), 400);
      G.slice(gi + 1, gi + 3).forEach(n => { const a = audioOf(n); if (a) clip(a.key, a.body).catch(() => {}); if (n.p === 1) photo(n.it.img).catch(() => {}); });
      tickClock();
    }
    function reveal(g) {
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
      db.from("toeic_mocks").insert({ l_acc: lN ? lR / lN : null, r_acc: rN ? rR / rN : null, est: est || Ls || Rs, detail: { test_id: t.id, parts, by, mode } }).then(() => {});
      const rows = []; G.forEach(g => g.qs.forEach((q, qi) => rows.push({ qid: `${g.id}#${qi}`, part: g.p, tag: g.p === 2 || g.p === 5 ? (g.it.tag || "test") : "test", correct: ans[`${g.id}#${qi}`] === q.a, mode: "test" })));
      if (rows.length) db.from("toeic_answers").insert(rows).then(() => {});
      if (lN + rN >= 50) db.rpc("toeic_task_done", { p_task: "mock" }).then(r => { if (r.data && r.data.granted) toast(`📝 模擬試題完成，星屑 +${r.data.amount}`); });
      m.innerHTML = `<div class="vg-card tc-card"><div style="text-align:center"><div style="font-size:42px">📊</div><h3>${esc(t.title)} 成績</h3></div>
        <div class="tc-score">${Ls != null ? `<div><small>🎧 聽力</small><b>${Ls}</b><small>${lR}/${lN}</small></div>` : ""}${Rs != null ? `<div><small>📖 閱讀</small><b>${Rs}</b><small>${rR}/${rN}</small></div>` : ""}${est != null ? `<div><small>預估總分</small><b>${est}</b></div>` : ""}</div>
        <div class="tr-scroll"><table class="tr-cmp"><tr><th>Part</th><th>答對</th><th>正確率</th></tr>${Object.entries(by).map(([p, [o, n]]) => `<tr><td>${PARTS[p].name}</td><td>${o}/${n}</td><td class="${o / n >= 0.7 ? "up" : o / n < 0.5 ? "dn" : ""}">${Math.round(o / n * 100)}%</td></tr>`).join("")}</table></div>
        <p class="tr-note">${(() => { const w = Object.entries(by).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1])[0]; return w ? `最弱的是 ${PARTS[w[0]].name}（${Math.round(w[1][0] / w[1][1] * 100)}%），下次可以只挑這個 Part 再練一次。` : ""; })()}${parts.length < 7 ? "只練部分 Part 時，分數是用這幾個 Part 推估的。" : ""}換算是粗估，正式考試的分數表會依難度調整。</p>
        ${exam ? `<button type="button" class="btn" data-review="1" style="width:100%">🔍 一題一題看答案與解析</button>` : ""}
        <button type="button" class="btn btn-primary" data-x="1" style="width:100%;margin-top:6px">完成</button></div>`;
      m.dataset.fin = "1"; load();
    }
    m.addEventListener("click", e => {
      if (e.target.closest("[data-x]")) { if (!m.dataset.fin && done() && !confirm("中途離開，這次的作答不會計分。確定嗎？")) return; clearInterval(timer); stop(); m.remove(); return; }
      if (e.target.closest("[data-play]")) return doPlay(G[gi]);
      const a = e.target.closest("[data-a]"); if (a && !(G[gi].checked && !exam)) { ans[a.dataset.a] = Number(a.dataset.k); return draw(); }
      if (e.target.closest("[data-check]")) { G[gi].checked = true; stop(); return draw(); }
      if (e.target.closest("[data-next]")) { stop(); if (gi + 1 < G.length) { gi++; goReading(); draw(); } else if (m.dataset.fin) { m.remove(); } else finish(); return; }
      if (e.target.closest("[data-prev]")) { stop(); gi--; return draw(); }
      if (e.target.closest("[data-review]")) { G.forEach(g => { g.checked = true; g.played = true; }); gi = 0; exam = false; deadline = null; return draw(); }
    });
    goReading(); draw(); document.body.appendChild(m);
  }

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
    .tt-script { font-size: 13px; line-height: 1.7; }`;
  document.head.appendChild(css);

  if (typeof window.applyPage === "function") { const base = window.applyPage; window.applyPage = function (name) { const r = base.apply(this, arguments); if (name === "toeic") setTimeout(load, 300); return r; }; }
  (function boot(n) { if (!hasDb()) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; } setTimeout(load, 800); })(0);
})();
