/* 🧠 複習系統：導入各種資料（文字、PDF、照片、Word、PPT）→ AI 拆成「由簡單到難」的知識點 → 做成 9 種形式的題卡
   ‧ 學習：一次 3 個知識點，先聽比喻、再看重點，學完馬上小測驗
   ‧ 複習：遺忘曲線（1→3→7…天），新卡從簡單的開始，同一個知識點的簡單卡會了，才解鎖難的
   ‧ 難度：L1 認識 → L2 理解 → L3 比較 → L4 應用 → L5 綜合
   資料：sql/2026-11-13_複習系統.sql；AI：edge function「kb」 */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = s => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const todayStr = () => new Date(Date.now() + 8 * 3600e3 - 6 * 3600e3).toISOString().slice(0, 10); /* 跟資料庫 app_today() 一樣：早上 6 點換日 */
  const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const LV = { 1: ["認識", "#3fb950"], 2: ["理解", "#58a6ff"], 3: ["比較", "#d29922"], 4: ["應用", "#f0883e"], 5: ["綜合", "#f85149"] };
  const TY = { flash: "🃏 問答", cloze: "✂️ 填空", mcq: "✅ 選擇", tf: "⭕ 是非", match: "🔗 配對", order: "🔢 排順序", analogy: "🧩 比喻", compare: "⚖️ 比較表", short: "📝 簡答" };
  const SUBJECTS = ["資料結構", "計概", "MIS", "網路", "資料庫", "作業系統", "多益", "其他"];
  const NEW_PER_DAY = 15, UNIT = 3;
  const lvTag = l => `<i class="kb-lv" style="--c:${LV[l][1]}">L${l} ${LV[l][0]}</i>`;

  const K = { sources: [], points: [], cards: [], todayN: 0, newToday: 0, loaded: false, err: null, view: null, subj: "全部", busy: {} };

  /* ---------- 讀資料 ---------- */
  async function load() {
    if (!hasDb()) return;
    const t = todayStr();
    const [s, p, c, l, n] = await Promise.all([
      db.from("kb_sources").select("id, subject, title, kind, summary, status, created_at").order("created_at", { ascending: false }),
      db.from("kb_points").select("id, source_id, pos, section, title, level, summary, analogy, key_terms, excerpt, cards_ready, learned_at").order("pos").limit(5000),
      db.from("kb_cards").select("id, point_id, source_id, type, level, data, reps, lapses, ease, ivl, due, suspended").limit(10000),
      db.from("kb_log").select("id", { count: "exact", head: true }).eq("day", t),
      db.from("kb_log").select("id", { count: "exact", head: true }).eq("day", t).eq("mode", "new")]);
    if (s.error && /kb_sources/.test(s.error.message)) { K.err = "資料庫還沒設定：到 Supabase 執行 sql/2026-11-13_複習系統.sql"; K.loaded = true; render(); return; }
    K.sources = s.data || []; K.points = p.data || []; K.cards = c.data || []; K.todayN = l.count || 0; K.newToday = n.count || 0; K.loaded = true; K.err = null;
    render(); renderToday();
  }
  const ptsOf = sid => K.points.filter(p => p.source_id === sid).sort((a, b) => a.pos - b.pos);
  const cardsOfPt = pid => K.cards.filter(c => c.point_id === pid && !c.suspended);
  const ptById = id => K.points.find(p => p.id === id);
  const srcById = id => K.sources.find(s => s.id === id);
  /* 熟練度：每張卡用「下次複習間隔」換算（14 天以上算精熟），沒做過算 0 */
  const cardM = c => c.reps ? Math.min(1, Math.max(0.15, c.ivl / 14)) : 0;
  const ptM = p => { const cs = cardsOfPt(p.id); return cs.length ? cs.reduce((a, c) => a + cardM(c), 0) / cs.length : 0; };
  const srcM = sid => { const ps = ptsOf(sid); return ps.length ? ps.reduce((a, p) => a + ptM(p), 0) / ps.length : 0; };
  const mColor = m => m >= 0.7 ? "#3fb950" : m >= 0.35 ? "#d29922" : m > 0 ? "#f0883e" : "rgba(127,127,127,.4)";

  /* ---------- 今日佇列 ---------- */
  function dueCards(sid) {
    const t = todayStr();
    return K.cards.filter(c => !c.suspended && c.due && c.due <= t && (!sid || c.source_id === sid)).sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : a.level - b.level);
  }
  /* 新卡：只從「學過的知識點」拿；同一個知識點，較低難度的卡都做過一次，才解鎖較高難度 */
  function newCards(sid, n) {
    const out = [];
    const learned = K.points.filter(p => p.learned_at && (!sid || p.source_id === sid));
    const cand = [];
    learned.forEach(p => {
      const cs = cardsOfPt(p.id);
      cs.filter(c => !c.reps && !c.due).forEach(c => { if (cs.filter(x => x.level < c.level).every(x => x.reps > 0)) cand.push(c); });
    });
    cand.sort((a, b) => a.level - b.level || (ptById(a.point_id).pos - ptById(b.point_id).pos));
    for (const c of cand) { if (out.length >= n) break; out.push(c); }
    return out;
  }
  const newLeft = () => Math.max(0, NEW_PER_DAY - K.newToday);
  function nextUnit(sid) { return ptsOf(sid).filter(p => !p.learned_at && p.cards_ready).slice(0, UNIT); }

  /* ---------- 頁面 ---------- */
  function ensurePage() {
    let page = document.querySelector('.page[data-page="kb"]');
    if (!page) {
      const c = document.querySelector("#app-section > .container"); if (!c) return null;
      page = document.createElement("div"); page.className = "page"; page.dataset.page = "kb"; c.appendChild(page);
      page.innerHTML = `<div id="kb-root"><section class="card"><p class="tr-note">載入中…</p></section></div>`;
      page.addEventListener("click", onClick);
    }
    if (typeof PAGES !== "undefined" && Array.isArray(PAGES) && !PAGES.includes("kb")) PAGES.push("kb");
    return page;
  }
  function render() {
    const page = ensurePage(); if (!page) return; const root = page.querySelector("#kb-root");
    if (K.err) { root.innerHTML = `<section class="card"><h2>🧠 複習</h2><p class="tr-note">${esc(K.err)}</p></section>`; return; }
    if (!K.loaded) return;
    root.innerHTML = K.view ? sourceHtml(K.view) : hubHtml();
  }
  function hubHtml() {
    const due = dueCards().length, nw = Math.min(newLeft(), newCards(null, 99).length), subs = ["全部", ...new Set(K.sources.map(s => s.subject))];
    const list = K.sources.filter(s => K.subj === "全部" || s.subject === K.subj);
    const weak = K.points.filter(p => p.learned_at && cardsOfPt(p.id).some(c => c.reps)).map(p => [p, ptM(p)]).sort((a, b) => a[1] - b[1]).slice(0, 5);
    return `<section class="card kb-hero"><div class="kb-top"><div><h2 style="margin:0">🧠 複習</h2><p class="tr-note">導入講義、筆記、照片，我幫你拆成由簡單到難的知識點，做成各種題目，照遺忘曲線排複習。</p></div></div>
        <div class="tc-score"><div><small>今天到期</small><b>${due}</b><small>張卡</small></div><div><small>可學新卡</small><b>${nw}</b><small>每天上限 ${NEW_PER_DAY}</small></div><div><small>今天做了</small><b>${K.todayN}</b><small>${K.todayN >= 10 ? "✅ 任務完成" : "做滿 10 張有星屑"}</small></div></div>
        <div class="tr-row"><button type="button" class="btn btn-primary" data-kb="review" style="flex:2" ${due + nw ? "" : "disabled"}>▶️ 開始今日複習（${due + nw}）</button><button type="button" class="btn" data-kb="import" style="flex:1">＋ 導入資料</button></div></section>
      ${K.sources.length ? `<section class="card"><h2>📚 我的資料</h2>${subs.length > 2 ? `<div class="tr-row kb-subs">${subs.map(s => `<button type="button" class="tr-chip sm ${K.subj === s ? "on" : ""}" data-kb="subj" data-v="${esc(s)}">${esc(s)}</button>`).join("")}</div>` : ""}
        ${list.map(srcRow).join("")}</section>` : `<section class="card"><h2>📥 從這裡開始</h2><p>按「＋ 導入資料」，貼上一段筆記，或上傳 PDF 講義、課本照片、Word、PPT。</p>
          <p class="tr-note">AI 會做這些事：<br>① 拆成 10～30 個知識點，從「認識名詞」排到「綜合應用」<br>② 每個知識點配一個生活比喻＋重點<br>③ 做成問答、填空、選擇、是非、配對、排順序、比喻、比較表、簡答 9 種題目<br>④ 你一次學 3 個知識點、學完小測驗，之後每天照遺忘曲線複習</p>
          <p class="tr-note">第一次導入送 50 星屑 ✨</p></section>`}
      ${weak.length ? `<section class="card"><h2>🧭 最需要加強</h2>${weak.map(([p, m]) => `<div class="kb-weak" data-kb="pt" data-v="${p.id}"><span class="kb-dot" style="background:${mColor(m)}"></span><div><b>${esc(p.title)}</b><small>${esc((srcById(p.source_id) || {}).title || "")}・${lvTag(p.level)}</small></div><em>${Math.round(m * 100)}%</em></div>`).join("")}</section>` : ""}`;
  }
  function srcRow(s) {
    const ps = ptsOf(s.id), learned = ps.filter(p => p.learned_at).length, m = srcM(s.id), busy = K.busy[s.id], ready = ps.filter(p => p.cards_ready).length;
    const icon = { pdf: "📕", image: "🖼️", docx: "📘", pptx: "📙", text: "📝", mixed: "🗂️" }[s.kind] || "📄";
    return `<div class="kb-src" data-kb="open" data-v="${s.id}"><span class="kb-ic">${icon}</span><div class="kb-grow"><b>${esc(s.title)}</b>
      <small>${esc(s.subject)}・${ps.length} 個知識點・學過 ${learned}・${K.cards.filter(c => c.source_id === s.id).length} 張卡</small>
      ${busy ? `<small class="kb-busy">⏳ ${esc(busy)}</small>` : ready < ps.length ? `<small class="kb-busy">⚠️ 還有 ${ps.length - ready} 個知識點沒做題卡，點進去可以繼續</small>` : `<div class="tc-mini"><i style="width:${m * 100}%"></i></div>`}</div><em>${ps.length ? Math.round(m * 100) + "%" : ""}</em></div>`;
  }
  function sourceHtml(sid) {
    const s = srcById(sid); if (!s) { K.view = null; return hubHtml(); }
    const ps = ptsOf(sid), unit = nextUnit(sid), due = dueCards(sid).length, nw = Math.min(newLeft(), newCards(sid, 99).length), learned = ps.filter(p => p.learned_at).length;
    const secs = []; ps.forEach(p => { const k = p.section || "未分類"; let x = secs.find(y => y[0] === k); if (!x) secs.push(x = [k, []]); x[1].push(p); });
    const notReady = ps.filter(p => !p.cards_ready).length, busy = K.busy[sid];
    const byLv = [1, 2, 3, 4, 5].map(l => ps.filter(p => p.level === l).length);
    return `<section class="card"><button type="button" class="btn btn-small" data-kb="back">← 我的資料</button>
        <h2 style="margin:8px 0 2px">${esc(s.title)}</h2><p class="tr-note">${esc(s.subject)}・${ps.length} 個知識點・學過 ${learned}/${ps.length}・熟練度 ${Math.round(srcM(sid) * 100)}%</p>
        ${s.summary ? `<p class="kb-sum">${fmt(s.summary)}</p>` : ""}
        <div class="kb-lvbar">${byLv.map((n, i) => n ? `<span style="flex:${n};background:${LV[i + 1][1]}" title="L${i + 1} ${LV[i + 1][0]}：${n} 個">L${i + 1}</span>` : "").join("")}</div>
        ${busy ? `<p class="kb-busy">⏳ ${esc(busy)}</p>` : notReady ? `<button type="button" class="btn btn-small" data-kb="resume" data-v="${sid}">✨ 繼續產生題卡（還有 ${notReady} 個知識點）</button>` : ""}
        <div class="kb-acts">
          <button type="button" class="btn btn-primary" data-kb="learn" data-v="${sid}" ${unit.length ? "" : "disabled"}>📖 ${unit.length ? `學下一個單元（${unit.length} 個知識點）` : learned === ps.length && ps.length ? "全部學完了 🎉" : "等題卡產生完就能學"}</button>
          <button type="button" class="btn" data-kb="review" data-v="${sid}" ${due + nw ? "" : "disabled"}>🔁 複習這份（${due + nw}）</button>
          <button type="button" class="btn" data-kb="exam" data-v="${sid}" ${learned ? "" : "disabled"}>🎯 綜合測驗</button></div></section>
      <section class="card"><h2>🗺️ 知識地圖</h2><p class="tr-note">由上到下＝由簡單到難。顏色是熟練度：灰＝還沒學、橘＝剛開始、黃＝有印象、綠＝記牢了。點任一個可以看比喻和重點。</p>
        <div class="kb-map"><div class="kb-root">${esc(s.title)}</div><ul>${secs.map(([k, arr]) => `<li><span class="kb-sec">${esc(k)}</span><ul>${arr.map(p => { const m = ptM(p); return `<li><button type="button" class="kb-pt ${p.learned_at ? "" : "new"}" data-kb="pt" data-v="${p.id}"><span class="kb-dot" style="background:${p.learned_at ? mColor(m) : "rgba(127,127,127,.35)"}"></span>${esc(p.title)} <small>L${p.level}</small></button></li>`; }).join("")}</ul></li>`).join("")}</ul></div></section>
      <section class="card"><details><summary>⚙️ 管理</summary><div class="tr-row" style="margin-top:8px"><button type="button" class="btn btn-small" data-kb="rename" data-v="${sid}">改名／改科目</button><button type="button" class="btn btn-small" data-kb="del" data-v="${sid}">🗑️ 刪除這份資料</button><button type="button" class="btn btn-small" data-kb="redo" data-v="${sid}">🤖 用 AI 重新整理</button></div></details></section>`;
  }

  function renderToday() {
    const tp = document.querySelector('.page[data-page="today"]'); if (!tp || !K.loaded || K.err) return;
    let box = document.getElementById("kb-today");
    if (!box) { box = document.createElement("section"); box.id = "kb-today"; box.className = "card"; const ref = document.getElementById("tc-today"); ref ? ref.after(box) : tp.appendChild(box); }
    const due = dueCards().length, nw = Math.min(newLeft(), newCards(null, 99).length), un = K.sources.map(s => nextUnit(s.id)).find(u => u.length);
    box.innerHTML = `<h2>🧠 今日複習 ${due + nw ? `<small class="nb-prog">${due + nw} 張</small>` : K.sources.length ? "✅" : ""}</h2>
      ${!K.sources.length ? `<p class="tr-note">導入講義或筆記，AI 幫你做成題目、排好複習。</p><button type="button" class="btn" style="width:100%" data-kbg="import">＋ 導入資料</button>`
        : `<p class="tr-note">到期 ${due} 張・新卡 ${nw} 張・今天做了 ${K.todayN} 張</p>${due + nw ? `<button type="button" class="btn btn-primary" style="width:100%" data-kbg="review">▶️ 開始複習</button>` : `<p>🎉 今天的複習都完成了！</p>`}${un ? `<button type="button" class="btn" style="width:100%;margin-top:6px" data-kbg="learn" data-v="${un[0].source_id}">📖 學下一個單元：${esc(un[0].title)}…</button>` : ""}`}`;
  }

  /* ---------- 導入 ---------- */
  function importModal() {
    const m = document.createElement("div"); m.className = "vg-modal kb-modal"; let tab = "text", files = [];
    const subs = [...new Set(SUBJECTS.concat(K.sources.map(s => s.subject)))];
    const draw = () => { m.innerHTML = `<div class="vg-card"><div class="vg-title">📥 導入資料</div>
      <div class="tr-grid"><label>科目<input id="kb-sub" list="kb-subl" placeholder="例如 資料結構" value="${esc(m._sub || (K.subj !== "全部" ? K.subj : ""))}"><datalist id="kb-subl">${subs.map(s => `<option value="${esc(s)}">`).join("")}</datalist></label>
        <label>標題（可以留白）<input id="kb-title" placeholder="例如 第 5 章 Graph" value="${esc(m._title || "")}"></label></div>
      <div class="tr-row"><button type="button" class="tr-chip sm ${tab === "text" ? "on" : ""}" data-tab="text">✍️ 貼上文字</button><button type="button" class="tr-chip sm ${tab === "file" ? "on" : ""}" data-tab="file">📎 上傳檔案</button></div>
      ${tab === "text" ? `<textarea id="kb-text" rows="9" placeholder="貼上筆記、講義文字、文章…（越完整越好）">${esc(m._text || "")}</textarea>`
        : `<label class="kb-drop"><input type="file" id="kb-file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.heif,.docx,.pptx,.txt,.md,.csv,image/*,application/pdf"><span>📎 選擇檔案<br><small>PDF、照片／截圖（可以多張）、Word（.docx）、PPT（.pptx）、文字檔</small></span></label>
          ${files.length ? `<ul class="kb-files">${files.map((f, i) => `<li>${esc(f.name)} <small>${(f.size / 1048576).toFixed(1)} MB</small> <button type="button" class="tr-x" data-rm="${i}">✕</button></li>`).join("")}</ul>` : ""}`}
      <label class="kb-n">整理方式<select id="kb-mode"><option value="ai">🤖 AI 整理（有比喻、9 種題型，推薦）</option><option value="local">⚡ 快速模式（不用 AI，適合條列式筆記）</option></select></label>
      <label class="kb-n">知識點數量<select id="kb-n"><option value="10">精簡（約 10 個）</option><option value="18" selected>標準（約 18 個）</option><option value="28">詳細（約 28 個）</option></select></label>
      <p class="tr-note">整理大約要 1～3 分鐘，可以關掉這個視窗去做別的，完成會通知你。</p>
      <button type="button" class="btn btn-primary" data-go="1" style="width:100%">✨ 開始整理</button><button type="button" class="btn" data-vx="1" style="width:100%;margin-top:6px">取消</button></div>`;
      const fi = m.querySelector("#kb-file"); if (fi) fi.addEventListener("change", () => { files = files.concat([...fi.files]); keep(); draw(); });
    };
    const keep = () => { const g = id => m.querySelector(id); if (g("#kb-sub")) m._sub = g("#kb-sub").value; if (g("#kb-title")) m._title = g("#kb-title").value; if (g("#kb-text")) m._text = g("#kb-text").value; };
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-vx]")) return m.remove();
      const tb = e.target.closest("[data-tab]"); if (tb) { keep(); tab = tb.dataset.tab; return draw(); }
      const rm = e.target.closest("[data-rm]"); if (rm) { e.preventDefault(); keep(); files.splice(Number(rm.dataset.rm), 1); return draw(); }
      if (e.target.closest("[data-go]")) {
        keep(); const sub = (m._sub || "").trim() || "其他", title = (m._title || "").trim(), n = Number(m.querySelector("#kb-n").value);
        if (tab === "text" && (m._text || "").trim().length < 30) return toast("內容太短了，至少貼一段文字");
        if (tab === "file" && !files.length) return toast("先選檔案");
        const b = e.target.closest("[data-go]"); b.disabled = true; b.textContent = "⏳ 讀取檔案中…";
        const local = m.querySelector("#kb-mode").value === "local";
        try { const input = tab === "text" ? { text: m._text, kind: "text", files: [] } : await readFiles(files); m.remove(); ingest(sub, title, n, input, local); }
        catch (err) { b.disabled = false; b.textContent = "✨ 開始整理"; toast("😵 " + err.message); }
      }
    });
    draw(); document.body.appendChild(m);
  }
  /* 檔案 → { text, files:[{mime,data}], kind }；照片先縮小，Word／PPT 在瀏覽器裡取出文字 */
  async function readFiles(list) {
    const out = { text: "", files: [], kinds: new Set() }; let bytes = 0;
    for (const f of list) {
      const name = f.name.toLowerCase(), ext = name.split(".").pop();
      if (ext === "docx" || ext === "pptx") { out.text += `\n\n【${f.name}】\n` + await officeText(f, ext); out.kinds.add(ext); continue; }
      if (["txt", "md", "csv"].includes(ext) || f.type.startsWith("text/")) { out.text += `\n\n【${f.name}】\n` + await f.text(); out.kinds.add("text"); continue; }
      if (ext === "pdf" || f.type === "application/pdf") { if (f.size > 12 * 1048576) throw new Error(`${f.name} 超過 12 MB，請先分成幾份`); const d = await b64(f); bytes += d.length; out.files.push({ mime: "application/pdf", data: d }); out.kinds.add("pdf"); continue; }
      if (f.type.startsWith("image/") || /^(png|jpe?g|webp|gif|heic|heif)$/.test(ext)) { const im = await shrink(f); bytes += im.data.length; out.files.push(im); out.kinds.add("image"); continue; }
      throw new Error(`${f.name}：不支援這種檔案（可以用 PDF、照片、docx、pptx、txt）`);
    }
    if (bytes > 18 * 1048576) throw new Error("檔案加起來太大了（上限約 13 MB），請分幾次導入");
    const kind = out.kinds.size > 1 ? "mixed" : [...out.kinds][0] || "text";
    return { text: out.text.trim(), files: out.files, kind };
  }
  const b64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(new Error("讀不到檔案")); r.readAsDataURL(f); });
  async function shrink(f) {
    try {
      const url = URL.createObjectURL(f), img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const k = Math.min(1, 1800 / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      return { mime: "image/jpeg", data: c.toDataURL("image/jpeg", 0.85).split(",")[1] };
    } catch (_) { return { mime: f.type || "image/heic", data: await b64(f) }; } /* 瀏覽器打不開的格式（例如 HEIC）直接送原檔 */
  }
  let zipP = null;
  const loadZip = () => zipP || (zipP = window.JSZip ? Promise.resolve(window.JSZip) : new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"; s.onload = () => res(window.JSZip); s.onerror = () => { zipP = null; rej(new Error("讀取 Word／PPT 的工具載入失敗，請檢查網路")); }; document.head.appendChild(s); }));
  async function officeText(f, ext) {
    const Z = await loadZip(), zip = await Z.loadAsync(f), dec = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
    if (ext === "docx") { const x = await zip.file("word/document.xml").async("string"); return dec(x.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "")).replace(/\n{3,}/g, "\n\n").trim(); }
    const slides = Object.keys(zip.files).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    const out = []; for (const [i, k] of slides.entries()) { const x = await zip.file(k).async("string"); out.push(`--- 投影片 ${i + 1} ---\n` + dec(x.replace(/<\/a:p>/g, "\n").replace(/<[^>]+>/g, "")).trim()); }
    return out.join("\n\n");
  }

  /* 整理流程：① AI 拆知識點 → ② 每 4 個知識點做一批題卡（兩批同時做） */
  const isQuota = m => /429|額度|忙不過來|quota/i.test(String(m || ""));
  async function ingest(subject, title, n, input, local) {
    if (local) return localIngest(subject, title, input);
    const tmp = "tmp" + Date.now(); K.busy[tmp] = "AI 正在讀資料、拆知識點…"; toast("✨ 開始整理，大約 1～3 分鐘，可以先去做別的");
    K.sources.unshift({ id: tmp, subject, title: title || "（整理中）", kind: input.kind, status: "outline" }); K.view = null; render();
    try {
      const { data, error } = await db.functions.invoke("kb", { body: { action: "outline", subject, title, n, text: input.text, files: input.files } });
      if (error || !data || data.error || !data.points) throw new Error((data && data.error) || (error && error.message) || "AI 沒回應");
      if (!data.points.length) throw new Error("AI 在資料裡找不到可以整理的內容");
      const sr = await db.from("kb_sources").insert({ subject, title: title || data.title || "未命名", kind: input.kind, summary: data.summary, raw: (input.text || "").slice(0, 60000) || null, status: "cards" }).select().single();
      if (sr.error) throw new Error(sr.error.message);
      const pr = await db.from("kb_points").insert(data.points.map((p, i) => ({ source_id: sr.data.id, pos: i, section: p.section, title: p.title, level: p.level, summary: p.summary, analogy: p.analogy, key_terms: p.key_terms, excerpt: p.excerpt }))).select();
      if (pr.error) throw new Error(pr.error.message);
      K.sources = K.sources.filter(s => s.id !== tmp); delete K.busy[tmp]; K.sources.unshift(sr.data); K.points = K.points.concat(pr.data); render();
      db.rpc("kb_done", { p_task: "import" }).then(r => { if (r.data && r.data.granted) toast(`✨ 第一次導入資料，星屑 +${r.data.amount}`); });
      await makeCards(sr.data.id);
    } catch (err) {
      K.sources = K.sources.filter(s => s.id !== tmp); delete K.busy[tmp]; render();
      /* AI 全部用完：有文字的資料改用「快速模式」在手機上直接整理，照片才需要等 AI */
      if (isQuota(err.message)) { toast("🛟 AI 額度暫時用完，改用快速模式整理（不用 AI）"); return localIngest(subject, title, input); }
      toast("😵 整理失敗：" + err.message);
    }
  }
  /* ---------- ⚡ 快速模式：不用 AI，從筆記的結構（標題、「名詞：解釋」、條列、步驟）直接做題卡 ---------- */
  async function localIngest(subject, title, input) {
    let text = input.text || "";
    if (!text && input.files.some(f => f.mime === "application/pdf")) { try { toast("📄 讀取 PDF 文字中…"); text = await pdfText(input.files.filter(f => f.mime === "application/pdf")); } catch (_) {} }
    if (text.replace(/\s/g, "").length < 30) return toast(input.files.length ? "😵 照片要用 AI 才看得懂，AI 額度恢復後再導入一次（或改貼文字）" : "😵 內容太少，整理不出知識點");
    const pts = localOutline(text); if (!pts.length) return toast("😵 整理不出知識點：試試用「標題＋條列」或「名詞：解釋」的格式");
    const sr = await db.from("kb_sources").insert({ subject, title: title || (text.trim().split("\n")[0] || "未命名").replace(/^#+\s*|^【|】$/g, "").slice(0, 40), kind: input.kind, summary: `⚡ 快速模式整理（不用 AI）：${pts.length} 個知識點。AI 恢復後可以在「⚙️ 管理」按「🤖 用 AI 重新整理」，會多出比喻和更多題型。`, raw: text.slice(0, 60000), status: "ready" }).select().single();
    if (sr.error) return toast(sr.error.message);
    const pr = await db.from("kb_points").insert(pts.map((p, i) => ({ source_id: sr.data.id, pos: i, section: p.section, title: p.title, level: p.level, summary: p.summary, analogy: p.analogy || null, key_terms: p.key_terms, excerpt: p.excerpt, cards_ready: true }))).select();
    if (pr.error) return toast(pr.error.message);
    const rows = []; pr.data.forEach((row, i) => pts[i].cards.forEach(c => rows.push({ point_id: row.id, source_id: sr.data.id, type: c.type, level: c.level, data: c.data })));
    const cr = rows.length ? await db.from("kb_cards").insert(rows).select("id, point_id, source_id, type, level, data, reps, lapses, ease, ivl, due, suspended") : { data: [] };
    K.sources.unshift(sr.data); K.points = K.points.concat(pr.data); K.cards = K.cards.concat(cr.data || []); render(); renderToday();
    db.rpc("kb_done", { p_task: "import" }).then(r => { if (r.data && r.data.granted) toast(`✨ 第一次導入資料，星屑 +${r.data.amount}`); });
    toast(`⚡ 快速模式整理好了：${pts.length} 個知識點、${rows.length} 張題卡`);
  }
  let pdfP = null;
  const loadPdf = () => pdfP || (pdfP = new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"; s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; res(window.pdfjsLib); }; s.onerror = () => { pdfP = null; rej(new Error("PDF 工具載入失敗")); }; document.head.appendChild(s); }));
  async function pdfText(files) {
    const L = await loadPdf(), out = [];
    for (const f of files) { const bin = Uint8Array.from(atob(f.data), c => c.charCodeAt(0)), doc = await L.getDocument({ data: bin }).promise;
      for (let i = 1; i <= Math.min(doc.numPages, 80); i++) { const tc = await (await doc.getPage(i)).getTextContent(); let line = "", lastY = null; const ls = [];
        tc.items.forEach(it => { const y = Math.round(it.transform[5]); if (lastY != null && Math.abs(y - lastY) > 3) { ls.push(line); line = ""; } line += it.str; lastY = y; }); ls.push(line);
        out.push(`--- 第 ${i} 頁 ---\n` + ls.map(x => x.trim()).filter(Boolean).join("\n")); } }
    return out.join("\n\n");
  }
  const BUL = /^\s*(?:[-*•‧·●○▪◆■□►➤✓]|\(?\d{1,2}[.)、）]|[①-⑳]|[a-zA-Z][.)])\s*/;
  const DEF = /^(.{1,30}?)\s*[：:＝=]\s*(.{4,})$/, STEP = /^\s*(?:\(?\d{1,2}[.)、）]|[①-⑳]|step\s*\d+[:.]?|第[一二三四五六七八九十\d]+步)\s*/i;
  function localOutline(text) {
    const lines = text.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean), secs = []; let cur = { name: "重點整理", items: [] }; secs.push(cur);
    const isHead = l => /^#{1,6}\s+/.test(l) || /^第[一二三四五六七八九十百\d]+[章節課單元篇]/.test(l) || /^【.+】$/.test(l) || /^[一二三四五六七八九十]+[、.]\s*\S/.test(l) || /^---.*---$/.test(l) || /^\d+(\.\d+)+\s+\S/.test(l) || (l.length <= 18 && !/[。，,；;：:.!?！？]$/.test(l) && !DEF.test(l) && !BUL.test(l));
    lines.forEach(l => { if (isHead(l)) { cur = { name: l.replace(/^#+\s*|^【|】$|^-+\s*|\s*-+$/g, "").slice(0, 40) || "重點", items: [] }; secs.push(cur); } else cur.items.push(l); });
    const pts = [], allTerms = [], sh = a => shuffle(a);
    secs.filter(x => x.items.length).forEach(sec => {
      const defs = [], steps = [], bul = [];
      sec.items.forEach(raw => { const isStep = STEP.test(raw), l = raw.replace(BUL, "").trim(), m = DEF.exec(l);
        if (m && !/https?$/i.test(m[1]) && !/[。，,]/.test(m[1])) defs.push({ term: m[1].trim(), def: m[2].trim(), raw }); else if (isStep) steps.push(l); else if (l.length >= 4) bul.push(l); });
      defs.forEach(d => allTerms.push(d.term));
      defs.forEach(d => pts.push({ section: sec.name, title: d.term, level: 1, summary: d.def, key_terms: [d.term], excerpt: d.raw, _def: d,
        cards: [{ type: "flash", level: 1, data: { q: `「${d.term}」是什麼？`, a: d.def } }, { type: "cloze", level: 1, data: { text: `{{${d.term}}}：${d.def}` } }] }));
      if (defs.length >= 2) pts.push({ section: sec.name, title: `${sec.name}：名詞配對`, level: 3, summary: defs.map(d => `${d.term}：${d.def}`).join("\n"), key_terms: defs.map(d => d.term).slice(0, 5), excerpt: defs.map(d => d.raw).join("\n"),
        cards: [{ type: "match", level: 3, data: { q: `把「${sec.name}」的名詞和解釋配對`, pairs: sh(defs).slice(0, 5).map(d => ({ l: d.term, r: d.def.slice(0, 60) })) } }] });
      if (steps.length >= 3) pts.push({ section: sec.name, title: /步驟|流程|程序$/.test(sec.name) ? sec.name : `${sec.name}的步驟`, level: 4, summary: steps.map((x, i) => `${i + 1}. ${x}`).join("\n"), key_terms: [], excerpt: steps.join("\n"),
        cards: [{ type: "order", level: 4, data: { q: `依序排出「${sec.name}」的步驟`, items: steps.slice(0, 6) } }, { type: "flash", level: 2, data: { q: `「${sec.name}」有哪幾個步驟？`, a: steps.map((x, i) => `${i + 1}. ${x}`).join("\n") } }] });
      if (bul.length) { const top = bul.slice(0, 8), cs = [{ type: "flash", level: 2, data: { q: `「${sec.name}」有哪些重點？（${top.length} 點）`, a: top.map(x => "• " + x).join("\n") } }];
        const key = top.map(x => (x.match(/「([^」]{2,12})」|[A-Za-z][A-Za-z0-9+#.-]{2,}/) || [])).find(m => m[0]); if (key) { const k = key[1] || key[0], line = top.find(x => x.includes(k)); cs.push({ type: "cloze", level: 1, data: { text: line.replace(k, `{{${k}}}`) } }); }
        if (top.length >= 3) cs.push({ type: "short", level: 5, data: { q: `用自己的話說明「${sec.name}」`, points: top.slice(0, 4), model: top.slice(0, 4).join("；") } });
        pts.push({ section: sec.name, title: sec.name, level: 2, summary: top.join("\n"), key_terms: [], excerpt: sec.items.join("\n").slice(0, 1500), cards: cs, _bul: top }); }
    });
    /* 名詞夠多時，加「看解釋選名詞」的選擇題；不同段落的句子互換，做成是非題 */
    pts.filter(p => p._def).forEach(p => { const others = sh(allTerms.filter(t => t !== p._def.term)).slice(0, 3); if (others.length === 3) p.cards.push({ type: "mcq", level: 2, data: { q: `哪個名詞的意思是：「${p._def.def}」？`, o: [p._def.term, ...others], ans: 0, why: `${p._def.term}：${p._def.def}` } }); });
    const bp = pts.filter(p => p._bul); bp.forEach(p => { const o = bp.filter(x => x !== p && x._bul.length); p.cards.push({ type: "tf", level: 1, data: { s: `「${p.section}」的重點之一：${p._bul[0]}`, t: true, why: "這句就在這一段的重點裡。" } });
      if (o.length) { const x = o[Math.floor(Math.random() * o.length)]; p.cards.push({ type: "tf", level: 2, data: { s: `「${p.section}」的重點之一：${x._bul[0]}`, t: false, why: `這句其實是在講「${x.section}」。` } }); } });
    pts.sort((a, b) => a.level - b.level);
    return pts.slice(0, 40);
  }
  /* AI 做題卡失敗時，用知識點本身的重點做幾張基本卡 */
  function localCards(p, all) {
    const cs = [{ type: "flash", level: Math.min(2, p.level), data: { q: `說明「${p.title}」`, a: p.summary } }];
    const k = (p.key_terms || []).find(t => t && p.summary.includes(t)); if (k) cs.push({ type: "cloze", level: 1, data: { text: p.summary.replace(k, `{{${k}}}`) } });
    const others = shuffle(all.filter(x => x.id !== p.id).map(x => x.title)).slice(0, 3);
    if (p.analogy && others.length === 3) cs.push({ type: "analogy", level: 2, data: { analogy: p.analogy, o: [p.title, ...others], ans: 0, why: p.summary } });
    if (p.level >= 4) cs.push({ type: "short", level: p.level, data: { q: `用自己的話說明「${p.title}」，並舉一個例子`, points: (p.key_terms || []).slice(0, 4).length ? p.key_terms.slice(0, 4) : [p.summary.slice(0, 60)], model: p.summary } });
    return cs.map(c => ({ point_id: p.id, ...c }));
  }
  async function makeCards(sid) {
    const s = srcById(sid), todo = ptsOf(sid).filter(p => !p.cards_ready); if (!todo.length || K.busy[sid]) return;
    const batches = []; for (let i = 0; i < todo.length; i += 4) batches.push(todo.slice(i, i + 4));
    let done = 0, fail = 0, basic = 0; K.busy[sid] = `做題卡中 0/${todo.length} 個知識點…`; render(); renderToday();
    const run = async b => {
      let ok = false;
      for (let k = 0; k < 2 && !ok; k++) {
        try {
          const { data, error } = await db.functions.invoke("kb", { body: { action: "cards", subject: s.subject, title: s.title, points: b.map(p => ({ id: p.id, title: p.title, level: p.level, summary: p.summary, analogy: p.analogy, key_terms: p.key_terms, excerpt: p.excerpt })) } });
          if (error || !data || data.error) throw new Error((data && data.error) || (error && error.message));
          if (data.cards.length) { const r = await db.from("kb_cards").insert(data.cards.map(c => Object.assign({ source_id: sid }, c))).select("id, point_id, source_id, type, level, data, reps, lapses, ease, ivl, due, suspended"); if (r.error) throw new Error(r.error.message); K.cards = K.cards.concat(r.data); }
          const ids = b.map(p => p.id); await db.from("kb_points").update({ cards_ready: true }).in("id", ids); b.forEach(p => { p.cards_ready = true; }); ok = true;
        } catch (err) {
          if (isQuota(err.message)) { /* AI 用完：先用重點做基本卡，之後可以再讓 AI 補 */
            const cs = b.flatMap(p => localCards(p, ptsOf(sid)));
            const r = await db.from("kb_cards").insert(cs.map(c => Object.assign({ source_id: sid }, c))).select("id, point_id, source_id, type, level, data, reps, lapses, ease, ivl, due, suspended");
            if (!r.error) { K.cards = K.cards.concat(r.data); await db.from("kb_points").update({ cards_ready: true }).in("id", b.map(p => p.id)); b.forEach(p => { p.cards_ready = true; }); ok = true; basic += b.length; }
            k = 9;
          } else await new Promise(r => setTimeout(r, 3000));
        }
      }
      if (!ok) fail += b.length; done += b.length; K.busy[sid] = `做題卡中 ${done}/${todo.length} 個知識點…`; render();
    };
    const q = batches.slice(); await Promise.all([0, 1].map(async () => { while (q.length) await run(q.shift()); }));
    delete K.busy[sid];
    if (!fail) { await db.from("kb_sources").update({ status: "ready" }).eq("id", sid); s.status = "ready"; }
    render(); renderToday();
    if (basic) toast(`🛟 AI 額度暫時用完：有 ${basic} 個知識點先做了基本題卡，AI 恢復後可以在「⚙️ 管理」按「🤖 用 AI 重新整理」`);
    else toast(fail ? `⚠️ 「${s.title}」有 ${fail} 個知識點的題卡沒做成功，點進去按「繼續產生題卡」` : `🎉 「${s.title}」整理好了：${ptsOf(sid).length} 個知識點、${K.cards.filter(c => c.source_id === sid).length} 張題卡，可以開始學了`);
  }

  /* ---------- 題卡（9 種） ---------- */
  /* 每張卡：html(c) 畫題目；bind(c, box, done) 互動，done(grade) 回報 0 忘了／1 模糊／2 記得／3 簡單 */
  const GR = `<div class="kb-gr"><button type="button" data-g="0">😵 忘了</button><button type="button" data-g="1">🤔 模糊</button><button type="button" data-g="2">🙂 記得</button><button type="button" data-g="3">😎 太簡單</button></div>`;
  const R = {
    flash: { html: c => `<p class="kb-q">${fmt(c.data.q)}</p><div class="kb-ans" hidden>${fmt(c.data.a)}</div><button type="button" class="btn btn-primary kb-show" data-show="1">👀 想好了，看答案</button>`, self: true },
    cloze: { html: c => { let k = 0; return `<p class="kb-q kb-cloze">${fmt(c.data.text).replace(/\{\{(.+?)\}\}/g, (_, a) => `<span class="kb-blank" data-b="${k++}"><i>${"＿".repeat(Math.min(6, Math.max(2, a.length)))}</i><em>${a}</em></span>`)}</p><button type="button" class="btn btn-primary kb-show" data-show="1">👀 想好了，看答案</button>`; }, self: true },
    compare: { html: c => { const d = c.data, cells = []; d.rows.forEach((r, i) => r.v.forEach((_, j) => cells.push([i, j]))); const hide = new Set(shuffle(cells).slice(0, Math.max(1, Math.min(3, Math.ceil(cells.length / 3)))).map(x => x.join(",")));
      return `<p class="kb-q">${fmt(d.q || "比較看看")}</p><div class="tr-scroll"><table class="kb-cmp"><tr><th></th>${d.cols.map(x => `<th>${fmt(x)}</th>`).join("")}</tr>${d.rows.map((r, i) => `<tr><th>${fmt(r.d)}</th>${r.v.map((v, j) => hide.has(i + "," + j) ? `<td class="kb-hid"><i>？</i><em>${fmt(v)}</em></td>` : `<td>${fmt(v)}</td>`).join("")}</tr>`).join("")}</table></div><p class="tr-note">先想想「？」的格子是什麼，再看答案。</p><button type="button" class="btn btn-primary kb-show" data-show="1">👀 看答案</button>`; }, self: true },
    mcq: { html: c => `<p class="kb-q">${fmt(c.data.q)}</p>${c._o.map((o, k) => `<button type="button" class="kb-opt" data-o="${k}">${fmt(o)}</button>`).join("")}<div class="kb-ans" hidden></div>`, choice: true },
    analogy: { html: c => `<p class="kb-q">🧩 「${fmt(c.data.analogy)}」<br><small>這個比喻在講哪個觀念？</small></p>${c._o.map((o, k) => `<button type="button" class="kb-opt" data-o="${k}">${fmt(o)}</button>`).join("")}<div class="kb-ans" hidden></div>`, choice: true },
    tf: { html: c => `<p class="kb-q">${fmt(c.data.s)}</p><div class="kb-tf"><button type="button" class="kb-opt" data-tf="1">⭕ 對</button><button type="button" class="kb-opt" data-tf="0">❌ 錯</button></div><div class="kb-ans" hidden></div>` },
    match: { html: c => `<p class="kb-q">${fmt(c.data.q || "把左右配成一對")}</p><p class="tr-note">先點左邊，再點右邊配對；點錯可以重點。</p><div class="kb-match"><div>${c.data.pairs.map((p, i) => `<button type="button" class="kb-ml" data-l="${i}">${fmt(p.l)}</button>`).join("")}</div><div>${c._r.map(i => `<button type="button" class="kb-mr" data-r="${i}">${fmt(c.data.pairs[i].r)}</button>`).join("")}</div></div><button type="button" class="btn btn-primary" data-chk="1" disabled>檢查</button><div class="kb-ans" hidden></div>` },
    order: { html: c => `<p class="kb-q">${fmt(c.data.q || "排出正確順序")}</p><p class="tr-note">依序點下面的項目；點上面已排好的可以拿掉。</p><ol class="kb-ord"></ol><div class="kb-pool">${c._r.map(i => `<button type="button" class="kb-it" data-it="${i}">${fmt(c.data.items[i])}</button>`).join("")}</div><button type="button" class="btn btn-primary" data-chk="1" disabled>檢查</button><div class="kb-ans" hidden></div>` },
    short: { html: c => `<p class="kb-q">${fmt(c.data.q)}</p><textarea class="kb-sa" rows="4" placeholder="用自己的話寫寫看（也可以只在心裡想）"></textarea><button type="button" class="btn btn-primary" data-show="1">📋 對照重點</button><div class="kb-ans" hidden></div>` }
  };
  function prep(c) { /* 選項洗牌 */
    if (c.type === "mcq" || c.type === "analogy") { const idx = shuffle(c.data.o.map((_, i) => i)); c._o = idx.map(i => c.data.o[i]); c._a = idx.indexOf(c.data.ans); }
    if (c.type === "match") c._r = shuffle(c.data.pairs.map((_, i) => i));
    if (c.type === "order") { let r; do { r = shuffle(c.data.items.map((_, i) => i)); } while (r.length > 1 && r.every((x, i) => x === i)); c._r = r; }
    return c;
  }
  function bind(c, box, done) {
    const ans = box.querySelector(".kb-ans"), showAns = h => { if (ans) { ans.innerHTML = h; ans.hidden = false; } };
    const why = c.data.why ? `<p>💡 ${fmt(c.data.why)}</p>` : "";
    const after = ok => { box.insertAdjacentHTML("beforeend", ok ? `<div class="kb-gr two"><button type="button" data-g="2">🙂 記得</button><button type="button" data-g="3">😎 太簡單</button></div>` : `<div class="kb-gr one"><button type="button" data-g="0">知道了，下一張 →</button></div>`); };
    box.addEventListener("click", e => {
      const g = e.target.closest("[data-g]"); if (g) return done(Number(g.dataset.g));
      if (e.target.closest("[data-show]")) {
        const b = e.target.closest("[data-show]"); b.remove();
        if (c.type === "flash") ans.hidden = false;
        if (c.type === "cloze" || c.type === "compare") box.querySelectorAll(".kb-blank, .kb-hid").forEach(x => x.classList.add("on"));
        if (c.type === "short") { const d = c.data; box.querySelector(".kb-sa").readOnly = true;
          showAns(`<p class="tc-h4">得分重點（勾你有想到的）</p>${d.points.map((p, i) => `<label class="kb-ck"><input type="checkbox" data-ck="${i}"> ${fmt(p)}</label>`).join("")}${d.model ? `<p class="tc-h4">參考答案</p><p>${fmt(d.model)}</p>` : ""}<div class="tr-row"><button type="button" class="btn btn-small" data-aig="1">🤖 AI 幫我批改</button><button type="button" class="btn btn-primary" data-sc="1" style="margin-left:auto">完成</button></div><div class="kb-ai"></div>`);
          return; }
        box.insertAdjacentHTML("beforeend", GR); return;
      }
      if (e.target.closest("[data-sc]")) { const n = c.data.points.length, k = box.querySelectorAll("[data-ck]:checked").length; return done(k === n ? 2 : k / n >= 0.5 ? 1 : 0); }
      if (e.target.closest("[data-aig]")) { const b = e.target.closest("[data-aig]"), txt = box.querySelector(".kb-sa").value.trim(), out = box.querySelector(".kb-ai"); if (!txt) return toast("先在上面寫答案，AI 才能批改");
        b.disabled = true; out.innerHTML = `<p class="tr-note">🤖 批改中…</p>`;
        db.functions.invoke("kb", { body: { action: "grade", q: c.data.q, points: c.data.points, model: c.data.model, answer: txt } }).then(({ data, error }) => { out.innerHTML = error || !data || data.error ? `<p class="tr-note dn">😵 ${esc((data && data.error) || "AI 沒回應")}</p>` : `<p class="kb-aitext"><b>${data.score} 分</b>　${fmt(data.feedback)}</p>`; }); return; }
      const o = e.target.closest("[data-o]"); if (o && !c._ans) { c._ans = 1; const k = Number(o.dataset.o), ok = k === c._a;
        box.querySelectorAll("[data-o]").forEach((x, j) => { x.disabled = true; x.classList.add(j === c._a ? "ok" : j === k ? "no" : "x"); });
        showAns(`<b>${ok ? "⭕ 答對了！" : "❌ 正解是：" + fmt(c._o[c._a])}</b>${why}`); after(ok); return; }
      const tf = e.target.closest("[data-tf]"); if (tf && !c._ans) { c._ans = 1; const v = tf.dataset.tf === "1", ok = v === c.data.t;
        box.querySelectorAll("[data-tf]").forEach(x => { x.disabled = true; x.classList.add((x.dataset.tf === "1") === c.data.t ? "ok" : x === tf ? "no" : "x"); });
        showAns(`<b>${ok ? "⭕ 答對了！" : `❌ 這句是${c.data.t ? "對" : "錯"}的`}</b>${why}`); after(ok); return; }
      /* 配對 */
      const l = e.target.closest("[data-l]"), r = e.target.closest("[data-r]");
      if (c.type === "match" && !c._ans && (l || r)) {
        c._m = c._m || {}; if (l) { box.querySelectorAll("[data-l]").forEach(x => x.classList.toggle("sel", x === l)); c._sel = Number(l.dataset.l); return; }
        if (r && c._sel != null) { const ri = Number(r.dataset.r); Object.keys(c._m).forEach(k => { if (c._m[k] === ri) delete c._m[k]; }); c._m[c._sel] = ri; c._sel = null; }
        else if (r) { const ri = Number(r.dataset.r); Object.keys(c._m).forEach(k => { if (c._m[k] === ri) delete c._m[k]; }); }
        const col = ["#7c5cff", "#3fb950", "#d29922", "#f0883e", "#58a6ff"];
        box.querySelectorAll("[data-l]").forEach(x => { const i = Number(x.dataset.l); x.classList.remove("sel"); x.style.borderColor = c._m[i] != null ? col[i % 5] : ""; });
        box.querySelectorAll("[data-r]").forEach(x => { const ri = Number(x.dataset.r), li = Object.keys(c._m).find(k => c._m[k] === ri); x.style.borderColor = li != null ? col[li % 5] : ""; });
        box.querySelector("[data-chk]").disabled = Object.keys(c._m).length < c.data.pairs.length; return;
      }
      /* 排順序 */
      const it = e.target.closest("[data-it]"), od = e.target.closest("[data-od]");
      if (c.type === "order" && !c._ans && (it || od)) { c._s = c._s || []; if (it) { c._s.push(Number(it.dataset.it)); it.hidden = true; } else { const i = Number(od.dataset.od); c._s.splice(c._s.indexOf(i), 1); box.querySelector(`[data-it="${i}"]`).hidden = false; }
        box.querySelector(".kb-ord").innerHTML = c._s.map(i => `<li><button type="button" class="kb-it on" data-od="${i}">${fmt(c.data.items[i])}</button></li>`).join(""); box.querySelector("[data-chk]").disabled = c._s.length < c.data.items.length; return; }
      if (e.target.closest("[data-chk]") && !c._ans) { c._ans = 1; e.target.closest("[data-chk]").remove();
        if (c.type === "match") { const n = c.data.pairs.length, k = Object.keys(c._m).filter(i => c._m[i] === Number(i)).length;
          showAns(`<b>${k === n ? "⭕ 全對！" : `配對對了 ${k}/${n}`}</b>${k < n ? `<ul class="tc-ul">${c.data.pairs.map(p => `<li>${fmt(p.l)} → ${fmt(p.r)}</li>`).join("")}</ul>` : ""}`);
          box.insertAdjacentHTML("beforeend", k === n ? `<div class="kb-gr two"><button type="button" data-g="2">🙂 記得</button><button type="button" data-g="3">😎 太簡單</button></div>` : `<div class="kb-gr one"><button type="button" data-g="${k / n >= 0.5 ? 1 : 0}">知道了，下一張 →</button></div>`); return; }
        if (c.type === "order") { const n = c.data.items.length, k = c._s.filter((x, i) => x === i).length;
          box.querySelectorAll(".kb-ord .kb-it").forEach((x, i) => x.classList.add(Number(x.dataset.od) === i ? "ok" : "no"));
          showAns(`<b>${k === n ? "⭕ 順序完全正確！" : `位置對了 ${k}/${n}，正確順序：`}</b>${k < n ? `<ol class="tc-ul">${c.data.items.map(x => `<li>${fmt(x)}</li>`).join("")}</ol>` : ""}`);
          box.insertAdjacentHTML("beforeend", k === n ? `<div class="kb-gr two"><button type="button" data-g="2">🙂 記得</button><button type="button" data-g="3">😎 太簡單</button></div>` : `<div class="kb-gr one"><button type="button" data-g="${k / n >= 0.5 ? 1 : 0}">知道了，下一張 →</button></div>`); return; }
      }
    });
  }

  /* ---------- 遺忘曲線 ---------- */
  function schedule(c, g, mode) {
    const t = todayStr(); let { reps, lapses, ease, ivl } = c; ease = Number(ease) || 2.5;
    if (g === 0) { lapses++; ivl = 0; ease = Math.max(1.3, ease - 0.2); reps = Math.max(1, reps); }
    else if (g === 1) { ivl = Math.max(1, Math.round((ivl || 1) * 1.2)); ease = Math.max(1.3, ease - 0.15); reps++; }
    else if (g === 2) { ivl = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(Math.max(ivl, 1) * ease); reps++; }
    else { ivl = reps === 0 ? 3 : Math.round(Math.max(ivl, 1) * ease * 1.3); ease = Math.min(3.2, ease + 0.15); reps++; }
    const due = addDays(t, g === 0 ? 1 : ivl), row = { reps, lapses, ease: Math.round(ease * 100) / 100, ivl, due, last_at: new Date().toISOString() };
    Object.assign(c, row); db.from("kb_cards").update(row).eq("id", c.id).then(() => {});
    db.from("kb_log").insert({ card_id: c.id, source_id: c.source_id, grade: g, mode }).then(() => {}); K.todayN++; if (mode === "new") K.newToday++;
  }

  /* ---------- 練習畫面（複習／學習小測驗／綜合測驗共用） ---------- */
  function focusOn(m) {
    window.__studyFocus = true; if (window.Spirit && window.Spirit.render) window.Spirit.render();
    const ob = new MutationObserver(() => { if (!m.isConnected) { ob.disconnect(); if (!document.querySelector(".tc-modal, .kb-run")) { window.__studyFocus = false; if (window.Spirit && window.Spirit.render) window.Spirit.render(); } } });
    ob.observe(document.body, { childList: true });
  }
  function runCards(list, opt) {
    /* list: [{ card, mode }]；opt: { title, onEnd(results), exam } */
    if (!list.length) return toast("現在沒有要做的卡 🎉");
    const q = list.map(x => ({ c: prep(Object.assign(Object.create(null), x.card, { _ans: 0, _m: null, _s: null, _sel: null })), mode: x.mode, src: x.card })), res = [];
    const m = document.createElement("div"); m.className = "vg-modal kb-run"; let i = 0;
    const draw = () => {
      const it = q[i], c = it.c, p = ptById(c.point_id) || {}, s = srcById(c.source_id) || {};
      m.innerHTML = `<div class="vg-card kb-card"><div class="tc-mh"><b>${esc(opt.title)}</b><span>${i + 1}/${q.length}</span><button type="button" class="tr-x" data-x="1">✕</button></div>
        <div class="tc-bar"><i style="width:${i / q.length * 100}%"></i></div>
        <p class="kb-meta">${esc(s.title || "")}・${esc(p.title || "")}　${lvTag(c.level)} <span>${TY[c.type] || c.type}</span>${it.mode === "new" ? " <span class='kb-new'>新</span>" : ""}</p>
        <div class="kb-body">${R[c.type].html(c)}</div>
        <div class="kb-foot"><button type="button" class="btn btn-small" data-hint="1">💡 看這個知識點的重點</button><button type="button" class="btn btn-small" data-sus="1" title="這張題目有問題，不要再出現">🚩</button></div><div class="kb-hintbox"></div></div>`;
      bind(c, m.querySelector(".kb-body"), g => {
        res.push({ c: it.src, g, mode: it.mode });
        if (!opt.exam) schedule(it.src, g, it.mode);
        if (g === 0 && !opt.exam && !it.again) q.splice(Math.min(q.length, i + 4), 0, { c: prep(Object.assign(Object.create(null), it.src, { _ans: 0, _m: null, _s: null, _sel: null })), mode: "again", src: it.src, again: true });
        i++; i < q.length ? draw() : finish();
      });
    };
    const finish = async () => {
      const n = res.length, good = res.filter(r => r.g >= 2).length, pct = n ? good / n : 0;
      let extra = ""; if (opt.onEnd) extra = (await opt.onEnd(res)) || "";
      if (!opt.exam && K.todayN >= 10) { const { data } = await db.rpc("kb_done", { p_task: "review" }); if (data && data.granted) toast(`🧠 今日複習完成，星屑 +${data.amount}`); }
      const bySrc = {}; res.forEach(r => { const p = ptById(r.c.point_id); if (!p) return; bySrc[p.id] = bySrc[p.id] || [p, 0, 0]; bySrc[p.id][2]++; if (r.g >= 2) bySrc[p.id][1]++; });
      const weak = Object.values(bySrc).filter(x => x[1] / x[2] < 0.6).slice(0, 5);
      m.innerHTML = `<div class="vg-card kb-card"><div style="text-align:center"><div style="font-size:44px">${pct >= 0.8 ? "🎉" : pct >= 0.6 ? "👍" : "💪"}</div><h3>${esc(opt.title)}・${good}/${n} 記得</h3></div>${extra}
        ${weak.length ? `<p class="tc-h4">🧭 這幾個還不熟，會比較快再出現：</p><ul class="tc-ul">${weak.map(([p]) => `<li>${esc(p.title)}</li>`).join("")}</ul>` : ""}
        <button type="button" class="btn btn-primary" data-x="1" style="width:100%">完成</button></div>`;
      m.dataset.fin = "1"; render(); renderToday();
    };
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-x]")) { if (!m.dataset.fin && res.length && res.length < q.length && !confirm("中途離開？做過的卡會保留紀錄。")) return; m.remove(); render(); renderToday(); return; }
      if (e.target.closest("[data-hint]")) { const p = ptById(q[i].c.point_id); if (p) m.querySelector(".kb-hintbox").innerHTML = pointCard(p, true); return; }
      if (e.target.closest("[data-sus]")) { if (!confirm("這張題目有問題？之後不會再出現。")) return; const c = q[i].src; c.suspended = true; db.from("kb_cards").update({ suspended: true }).eq("id", c.id).then(() => {}); toast("🚩 這張卡已經停用"); i++; i < q.length ? draw() : finish(); }
    });
    draw(); document.body.appendChild(m); focusOn(m);
  }
  const pointCard = (p, small) => `<div class="kb-pcard ${small ? "small" : ""}">${p.analogy ? `<p class="kb-ana">💡 <b>比喻</b>　${fmt(p.analogy)}</p>` : ""}<p>📌 ${fmt(p.summary)}</p>${(p.key_terms || []).length ? `<p class="kb-terms">${p.key_terms.map(t => `<span>${esc(t)}</span>`).join("")}</p>` : ""}</div>`;

  /* 今日複習：到期卡＋新卡（由簡單到難） */
  function review(sid) {
    const due = dueCards(sid).slice(0, 60), nw = newCards(sid, newLeft());
    const list = due.map(c => ({ card: c, mode: "review" })).concat(nw.map(c => ({ card: c, mode: "new" })));
    runCards(list, { title: sid ? `🔁 ${srcById(sid).title}` : "🔁 今日複習" });
  }
  /* 學一個單元：3 個知識點，各自「比喻 → 重點 → 關鍵詞」，最後小測驗（每個知識點最多 2 張 L1～L2 卡） */
  function learn(sid) {
    const unit = nextUnit(sid); if (!unit.length) return toast("這份資料沒有下一個單元了");
    const m = document.createElement("div"); m.className = "vg-modal kb-run"; let i = 0;
    const draw = () => {
      const p = unit[i];
      m.innerHTML = `<div class="vg-card kb-card"><div class="tc-mh"><b>📖 學習單元</b><span>${i + 1}/${unit.length}</span><button type="button" class="tr-x" data-x="1">✕</button></div>
        <div class="tc-bar"><i style="width:${i / (unit.length + 1) * 100}%"></i></div>
        <p class="kb-meta">${esc(p.section || "")}　${lvTag(p.level)}</p><h3 style="margin:4px 0 10px">${esc(p.title)}</h3>${pointCard(p)}
        ${p.excerpt ? `<details class="tr-list"><summary>📄 原始資料這段怎麼寫</summary><p class="kb-ex">${fmt(p.excerpt)}</p></details>` : ""}
        <div class="kb-ai"></div>
        <div class="tr-row"><button type="button" class="btn btn-small" data-exp="1">🤖 聽不懂，換個比喻</button><button type="button" class="btn btn-primary" data-nx="1" style="margin-left:auto">${i + 1 < unit.length ? "懂了，下一個 →" : "懂了，來小測驗 ✏️"}</button></div></div>`;
    };
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-x]")) return m.remove();
      if (e.target.closest("[data-exp]")) { const p = unit[i], b = e.target.closest("[data-exp]"), box = m.querySelector(".kb-ai"); b.disabled = true; box.innerHTML = `<p class="tr-note">🤖 換個方式講…</p>`;
        const { data, error } = await db.functions.invoke("kb", { body: { action: "explain", title: p.title, summary: p.summary, analogy: p.analogy, excerpt: p.excerpt } });
        box.innerHTML = error || !data || data.error ? `<p class="tr-note dn">😵 ${esc((data && data.error) || "AI 沒回應")}</p>` : `<p class="kb-aitext">🤖 ${fmt(data.text)}</p>`; return; }
      if (e.target.closest("[data-nx]")) {
        if (++i < unit.length) return draw();
        m.remove();
        const quiz = unit.flatMap(p => cardsOfPt(p.id).filter(c => c.level <= 2 && !c.reps).sort((a, b) => a.level - b.level).slice(0, 2)).map(c => ({ card: c, mode: "new" }));
        const markLearned = async () => { const now = new Date().toISOString(); unit.forEach(p => { p.learned_at = now; }); await db.from("kb_points").update({ learned_at: now }).in("id", unit.map(p => p.id));
          const { data } = await db.rpc("kb_done", { p_task: "learn" }); if (data && data.granted) toast(`📖 學完一個單元，星屑 +${data.amount}`); };
        if (!quiz.length) { await markLearned(); render(); renderToday(); return toast("📖 學完了！這幾個知識點會進入每日複習"); }
        runCards(shuffle(quiz), { title: "✏️ 單元小測驗", onEnd: async () => { await markLearned(); return `<p class="tr-note">✅ 這 ${unit.length} 個知識點學完了！剛剛的卡會照遺忘曲線排進每日複習；較難的卡（比較、應用、綜合）會在簡單的卡都做過後，一張張解鎖。</p>`; } });
      }
    });
    draw(); document.body.appendChild(m); focusOn(m);
  }
  /* 綜合測驗：從學過的知識點各種難度、各種題型混出 15 題，不影響複習排程 */
  function exam(sid) {
    const pool = K.cards.filter(c => c.source_id === sid && !c.suspended && (ptById(c.point_id) || {}).learned_at && c.type !== "short");
    if (pool.length < 3) return toast("先多學幾個單元再來測驗");
    const by = {}; shuffle(pool).forEach(c => { (by[c.level] = by[c.level] || []).push(c); });
    const pick = []; let lv = 1; while (pick.length < Math.min(15, pool.length)) { if (by[lv] && by[lv].length) pick.push(by[lv].shift()); lv = lv % 5 + 1; }
    pick.sort((a, b) => a.level - b.level);
    runCards(pick.map(c => ({ card: c, mode: "exam" })), { title: "🎯 綜合測驗", exam: true, onEnd: async res => {
      const L = {}; res.forEach(r => { L[r.c.level] = L[r.c.level] || [0, 0]; L[r.c.level][1]++; if (r.g >= 2) L[r.c.level][0]++; });
      return `<div class="kb-lvres">${Object.entries(L).map(([l, [o, n]]) => `<div>${lvTag(Number(l))}<b>${o}/${n}</b></div>`).join("")}</div><p class="tr-note">測驗不會改變複習排程。分數從哪一級開始掉，就是你目前卡住的地方。</p>`;
    } });
  }
  function pointModal(pid) {
    const p = ptById(pid); if (!p) return; const cs = cardsOfPt(pid), m = document.createElement("div"); m.className = "vg-modal";
    const byT = {}; cs.forEach(c => { byT[c.type] = (byT[c.type] || 0) + 1; });
    m.innerHTML = `<div class="vg-card"><div class="vg-title">${esc(p.title)}</div><p class="kb-meta">${esc(p.section || "")}　${lvTag(p.level)}　${p.learned_at ? `熟練度 ${Math.round(ptM(p) * 100)}%` : "還沒學"}</p>${pointCard(p)}
      ${p.excerpt ? `<details class="tr-list"><summary>📄 原始資料這段怎麼寫</summary><p class="kb-ex">${fmt(p.excerpt)}</p></details>` : ""}
      <p class="tr-note">${cs.length} 張題卡：${Object.entries(byT).map(([t, n]) => `${TY[t] || t} ×${n}`).join("、") || "還沒產生"}</p><div class="kb-ai"></div>
      <div class="tr-row"><button type="button" class="btn btn-small" data-exp="1">🤖 換個比喻</button>${cs.length ? `<button type="button" class="btn btn-small btn-primary" data-drill="1">🎯 練這個知識點</button>` : ""}</div><button type="button" class="btn" data-vx="1" style="width:100%;margin-top:6px">關閉</button></div>`;
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-vx]")) return m.remove();
      if (e.target.closest("[data-exp]")) { const b = e.target.closest("[data-exp]"), box = m.querySelector(".kb-ai"); b.disabled = true; box.innerHTML = `<p class="tr-note">🤖 換個方式講…</p>`;
        const { data, error } = await db.functions.invoke("kb", { body: { action: "explain", title: p.title, summary: p.summary, analogy: p.analogy, excerpt: p.excerpt } });
        box.innerHTML = error || !data || data.error ? `<p class="tr-note dn">😵 ${esc((data && data.error) || "AI 沒回應")}</p>` : `<p class="kb-aitext">🤖 ${fmt(data.text)}</p>`; return; }
      if (e.target.closest("[data-drill]")) { m.remove(); runCards(cs.slice().sort((a, b) => a.level - b.level).map(c => ({ card: c, mode: "exam" })), { title: "🎯 " + p.title, exam: true }); }
    });
    document.body.appendChild(m);
  }

  async function onClick(e) {
    const b = e.target.closest("[data-kb]"); if (!b) return; const a = b.dataset.kb, v = b.dataset.v, id = /^\d+$/.test(v || "") ? Number(v) : v;
    if (a === "import") importModal();
    if (a === "review") review(id || null);
    if (a === "subj") { K.subj = v; render(); }
    if (a === "open") { if (String(id).startsWith("tmp")) return toast("還在整理中，好了會通知你"); K.view = id; render(); window.scrollTo(0, 0); }
    if (a === "back") { K.view = null; render(); }
    if (a === "learn") learn(id);
    if (a === "exam") exam(id);
    if (a === "pt") pointModal(id);
    if (a === "resume") makeCards(id);
    if (a === "redo") { const s = srcById(id); const { data } = await db.from("kb_sources").select("raw").eq("id", id).maybeSingle();
      if (!data || !data.raw) return toast("這份資料沒有存原始文字（PDF／照片），請重新導入一次檔案");
      if (!confirm(`用 AI 重新整理「${s.title}」？會新增一份 AI 版本，原本這份和它的複習紀錄會保留，確認沒問題再自己刪掉舊的。`)) return;
      K.view = null; ingest(s.subject, s.title + "（AI 版）", 18, { text: data.raw, kind: s.kind, files: [] }); }
    if (a === "rename") { const s = srcById(id), t = prompt("新的標題", s.title); if (t == null) return; const sub = prompt("科目", s.subject); if (sub == null) return;
      await db.from("kb_sources").update({ title: t.trim() || s.title, subject: sub.trim() || s.subject }).eq("id", id); s.title = t.trim() || s.title; s.subject = sub.trim() || s.subject; render(); }
    if (a === "del") { const s = srcById(id); if (!confirm(`刪除「${s.title}」？知識點、題卡和複習紀錄都會一起刪掉，不能復原。`)) return;
      const { error } = await db.from("kb_sources").delete().eq("id", id); if (error) return toast(error.message);
      K.sources = K.sources.filter(x => x.id !== id); K.points = K.points.filter(x => x.source_id !== id); K.cards = K.cards.filter(x => x.source_id !== id); K.view = null; render(); renderToday(); toast("🗑️ 刪掉了"); }
  }
  document.addEventListener("click", e => { const b = e.target.closest("[data-kbg]"); if (!b) return; const a = b.dataset.kbg;
    if (a === "import") importModal(); if (a === "review") review(null); if (a === "learn") learn(Number(b.dataset.v)); });

  const css = document.createElement("style");
  css.textContent = `
    .kb-top { display: flex; justify-content: space-between; } .kb-subs { margin-bottom: 6px; }
    .kb-src, .kb-weak { display: flex; align-items: center; gap: 10px; padding: 10px 4px; border-bottom: 1px solid rgba(127,127,127,.12); cursor: pointer; } .kb-src:last-child { border-bottom: 0; }
    .kb-ic { font-size: 24px; } .kb-grow, .kb-weak > div { flex: 1; min-width: 0; } .kb-src b, .kb-weak b { display: block; font-size: 14.5px; } .kb-src small, .kb-weak small { display: block; font-size: 11.5px; opacity: .65; margin-top: 2px; } .kb-src em, .kb-weak em { font-style: normal; font-weight: 700; font-size: 13px; }
    .kb-busy { color: #d29922; opacity: 1 !important; font-size: 12.5px; }
    .kb-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; flex: 0 0 10px; }
    .kb-lv { font-style: normal; font-size: 11px; padding: 1px 6px; border-radius: 6px; background: color-mix(in srgb, var(--c) 22%, transparent); color: var(--c); font-weight: 700; white-space: nowrap; }
    .kb-sum { font-size: 13.5px; padding: 8px 10px; border-radius: 10px; background: rgba(127,127,127,.08); }
    .kb-lvbar { display: flex; height: 18px; border-radius: 9px; overflow: hidden; margin: 8px 0; } .kb-lvbar span { font-size: 10px; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; text-shadow: 0 1px 1px rgba(0,0,0,.4); }
    .kb-acts { display: grid; gap: 6px; margin-top: 10px; }
    .kb-map { font-size: 13.5px; } .kb-root { display: inline-block; font-weight: 700; padding: 6px 12px; border-radius: 10px; background: #7c5cff; color: #fff; }
    .kb-map ul { list-style: none; margin: 0; padding-left: 16px; border-left: 2px solid rgba(124,92,255,.35); margin-left: 12px; } .kb-map li { position: relative; padding: 4px 0 4px 10px; }
    .kb-map li::before { content: ""; position: absolute; left: -16px; top: 16px; width: 22px; border-top: 2px solid rgba(124,92,255,.35); }
    .kb-sec { display: inline-block; font-weight: 700; padding: 4px 10px; border-radius: 8px; background: rgba(124,92,255,.14); }
    .kb-pt { font: inherit; color: inherit; background: rgba(127,127,127,.06); border: 1px solid rgba(127,127,127,.2); border-radius: 8px; padding: 5px 9px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; text-align: left; } .kb-pt small { opacity: .55; font-size: 10.5px; } .kb-pt.new { opacity: .65; }
    .kb-run .vg-card { max-width: 560px; max-height: 92vh; overflow-y: auto; } .kb-meta { font-size: 11.5px; opacity: .8; margin: 6px 0; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; } .kb-meta span { opacity: .8; } .kb-new { background: #7c5cff; color: #fff; border-radius: 6px; padding: 0 6px; }
    .kb-q { font-size: 16px; line-height: 1.65; margin: 8px 0 12px; font-weight: 500; } .kb-q small { font-size: 12.5px; opacity: .7; font-weight: 400; } .kb-q code, .kb-pcard code, .kb-ans code { background: rgba(127,127,127,.18); padding: 1px 5px; border-radius: 5px; font-size: .92em; }
    .kb-ans { padding: 10px 12px; border-radius: 12px; background: rgba(63,185,80,.1); margin: 8px 0; font-size: 14px; line-height: 1.6; } .kb-ans p { margin: 6px 0; }
    .kb-show { width: 100%; } .kb-blank i { font-style: normal; color: #7c5cff; letter-spacing: 1px; } .kb-blank em { display: none; font-style: normal; } .kb-blank.on i { display: none; } .kb-blank.on em { display: inline; color: #3fb950; font-weight: 700; border-bottom: 2px solid #3fb950; }
    .kb-cmp { border-collapse: collapse; width: 100%; font-size: 13px; } .kb-cmp th, .kb-cmp td { border: 1px solid rgba(127,127,127,.25); padding: 6px 8px; vertical-align: top; text-align: left; } .kb-cmp th { background: rgba(127,127,127,.08); }
    .kb-hid i { font-style: normal; color: #7c5cff; font-weight: 700; } .kb-hid em { display: none; font-style: normal; } .kb-hid.on i { display: none; } .kb-hid.on em { display: inline; color: #3fb950; font-weight: 600; }
    .kb-opt { display: block; width: 100%; text-align: left; padding: 10px 12px; margin: 6px 0; border-radius: 10px; border: 1px solid rgba(127,127,127,.3); background: rgba(127,127,127,.06); color: inherit; font: inherit; font-size: 14px; cursor: pointer; }
    .kb-opt.ok { background: rgba(63,185,80,.25); border-color: #3fb950; } .kb-opt.no { background: rgba(248,81,73,.22); border-color: #f85149; } .kb-opt.x { opacity: .5; }
    .kb-tf { display: flex; gap: 8px; } .kb-tf .kb-opt { text-align: center; font-size: 16px; }
    .kb-gr { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 10px; } .kb-gr.two { grid-template-columns: 1fr 1fr; } .kb-gr.one { grid-template-columns: 1fr; }
    .kb-gr button { font: inherit; font-size: 13px; padding: 10px 4px; border-radius: 10px; border: 1px solid rgba(127,127,127,.3); background: rgba(127,127,127,.08); color: inherit; cursor: pointer; }
    .kb-gr button[data-g="0"] { border-color: rgba(248,81,73,.5); } .kb-gr button[data-g="2"] { border-color: rgba(63,185,80,.5); } .kb-gr button[data-g="3"] { border-color: rgba(88,166,255,.5); } .kb-gr.one button { background: #7c5cff; color: #fff; border: 0; }
    .kb-match { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; } .kb-match > div { display: flex; flex-direction: column; gap: 6px; }
    .kb-ml, .kb-mr, .kb-it { font: inherit; font-size: 13px; color: inherit; text-align: left; padding: 8px 10px; border-radius: 10px; border: 2px solid rgba(127,127,127,.25); background: rgba(127,127,127,.06); cursor: pointer; } .kb-ml.sel { border-color: #7c5cff; background: rgba(124,92,255,.18); }
    .kb-ord { padding-left: 22px; min-height: 10px; } .kb-ord li { margin: 4px 0; } .kb-ord .kb-it { width: 100%; } .kb-it.on { background: rgba(124,92,255,.14); } .kb-it.ok { border-color: #3fb950; } .kb-it.no { border-color: #f85149; }
    .kb-pool { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; }
    .kb-sa { width: 100%; box-sizing: border-box; font: inherit; font-size: 14px; padding: 8px; border-radius: 10px; margin-bottom: 8px; } .kb-ck { display: flex; gap: 8px; align-items: flex-start; padding: 4px 0; font-size: 13.5px; }
    .kb-foot { display: flex; justify-content: space-between; margin-top: 14px; border-top: 1px dashed rgba(127,127,127,.3); padding-top: 8px; } .kb-foot .btn { opacity: .8; }
    .kb-pcard { padding: 10px 12px; border-radius: 12px; background: rgba(127,127,127,.07); font-size: 14px; line-height: 1.65; } .kb-pcard.small { font-size: 13px; margin-top: 8px; } .kb-pcard p { margin: 6px 0; }
    .kb-ana { padding: 8px 10px; border-radius: 10px; background: rgba(255,213,74,.14); } .kb-terms span { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 999px; background: rgba(124,92,255,.15); margin: 2px 4px 2px 0; }
    .kb-ex { font-size: 13px; line-height: 1.6; opacity: .9; } .kb-aitext { padding: 8px 10px; border-radius: 10px; background: rgba(124,92,255,.1); font-size: 13.5px; line-height: 1.6; }
    .kb-modal textarea { width: 100%; box-sizing: border-box; font: inherit; font-size: 14px; padding: 8px; border-radius: 10px; margin: 8px 0; }
    .kb-drop { display: block; border: 2px dashed rgba(124,92,255,.5); border-radius: 14px; padding: 18px; text-align: center; cursor: pointer; margin: 8px 0; } .kb-drop input { display: none; } .kb-drop small { opacity: .65; font-size: 11.5px; }
    .kb-files { list-style: none; padding: 0; margin: 0 0 8px; font-size: 13px; } .kb-files li { display: flex; gap: 6px; align-items: center; padding: 3px 0; } .kb-files small { opacity: .6; }
    .kb-n { display: flex; gap: 8px; align-items: center; font-size: 13px; margin: 6px 0; }
    .kb-lvres { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 6px; margin: 8px 0; } .kb-lvres > div { text-align: center; padding: 8px 4px; border-radius: 10px; background: rgba(127,127,127,.08); } .kb-lvres b { display: block; font-size: 18px; margin-top: 4px; }`;
  document.head.appendChild(css);

  if (typeof window.applyPage === "function") { const base = window.applyPage; window.applyPage = function (name) { const r = base.apply(this, arguments); if (name === "kb") setTimeout(() => { ensurePage(); load(); }, 0); if (name === "today") setTimeout(renderToday, 0); return r; }; }
  function boot() { try { ensurePage(); } catch (e) { console.warn(e); } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  (function wait2(n) { if (!hasDb()) { if (n < 60) setTimeout(() => wait2(n + 1), 1000); return; } load(); })(0);
  window.KB = { load, review, learn };
})();
