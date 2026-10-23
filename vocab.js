/* =========================================================
   📖 英文單字複習（遺忘曲線）
   資料庫：sql/2026-10-23_單字.sql
   新分頁「單字」：今日複習／匯入／單字本／統計（不用開遊戲模式也看得到）

   固定格式（一行一個字，用 | 分隔，11 欄，沒有的留空）：
     單字 | 詞性 | 中文 | 音標 | 例句 | 例句中文 | 搭配詞 | 同義字 | 詞性變化 | 記憶法 | 標籤
   也接受：Tab 分隔、CSV（第一列可以是表頭）、Excel、全形｜、只有「單字, 中文」兩欄
========================================================= */
(function () {

  const VOCAB_JS_VERSION = "2026-10-23 v1";

  const FIELDS = ["word", "pos", "meaning", "phonetic", "example", "example_zh", "collocations", "synonyms", "forms", "mnemonic", "tags"];
  const FIELD_NAME = { word: "單字", pos: "詞性", meaning: "中文", phonetic: "音標", example: "例句", example_zh: "例句中文",
    collocations: "搭配詞", synonyms: "同義字", forms: "詞性變化", mnemonic: "記憶法", tags: "標籤" };
  const HEADER_ALIAS = {
    word: ["word", "單字", "英文", "vocabulary", "vocab", "english"], pos: ["pos", "詞性", "part of speech"],
    meaning: ["meaning", "中文", "意思", "中文意思", "解釋", "chinese"], phonetic: ["phonetic", "音標", "kk", "kk音標"],
    example: ["example", "例句", "sentence"], example_zh: ["example_zh", "例句中文", "中譯", "例句翻譯", "翻譯"],
    collocations: ["collocations", "搭配詞", "搭配", "片語"], synonyms: ["synonyms", "同義字", "同義詞"],
    forms: ["forms", "詞性變化", "變化"], mnemonic: ["mnemonic", "記憶法", "記憶"], tags: ["tags", "標籤", "tag", "分類"]
  };

  const AI_PROMPT = `請幫我把下面的英文單字整理成固定格式。
每個單字一行，欄位用「 | 」分隔，一共 11 欄，順序是：
單字 | 詞性 | 中文意思 | KK音標 | 英文例句（多益情境）| 例句中文翻譯 | 常見搭配 | 同義字 | 詞性變化 | 記憶法（字根或聯想）| 標籤

規則：
1. 不要表頭、不要編號、不要任何說明文字，只輸出單字那幾行
2. 沒有的欄位留空，但 | 要保留，讓每行都是 11 欄
3. 中文用繁體

範例：
negotiate | v. | 協商；談判 | [nɪˋgoʃɪˏet] | The two companies negotiated a new contract. | 兩家公司協商了新合約。 | negotiate a contract; negotiate with sb | bargain | negotiation (n.); negotiable (adj.) | neg 不 + oti 閒 → 不閒著一直談 | 商務

單字如下：
`;

  const V = {
    tab: "today", queue: null, stats: null, error: null, busy: false, tried: false,
    session: null,        // { items, i, answered, picked, typed, correct, done: [] }
    preview: null,        // { rows, bad, deck, source }
    list: null, listDeck: null, listQ: "", listOffset: 0,
    sharePeek: null
  };

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = msg => (typeof showToast === "function" ? showToast(msg) : alert(msg));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };


  /* =========================================================
     發音（瀏覽器內建）
  ========================================================= */
  function speak(text) {
    try {
      if (!("speechSynthesis" in window) || !text) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 0.9;
      const voice = speechSynthesis.getVoices().find(v => /^en(-|_)US/i.test(v.lang)) || speechSynthesis.getVoices().find(v => /^en/i.test(v.lang));
      if (voice) u.voice = voice;
      speechSynthesis.speak(u);
    } catch (e) { /* 沒有發音也沒關係 */ }
  }
  const canSpeak = () => "speechSynthesis" in window;


  /* =========================================================
     解析：貼上的文字、CSV、Excel → [{word, pos, meaning, ...}]
  ========================================================= */
  function parseCsv(text, delim) {
    const rows = []; let row = []; let cell = ""; let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === "") q = true;
      else if (c === delim) { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c !== "\r") cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function splitRows(text) {
    text = String(text || "").replace(/﻿/g, "").replace(/\r\n?/g, "\n");
    const first = text.split("\n").find(l => l.trim()) || "";
    let rows;
    if (/[|｜]/.test(first)) {
      rows = text.split("\n").map(l => l.split(/[|｜]/));
      /* 舊格式「單字,詳細｜詳細｜…」：第一格裡的逗號也要切開 */
      rows = rows.map(r => { const m = (r[0] || "").match(/^\s*([A-Za-z][A-Za-z\s'.-]*?)\s*[,\t]\s*(.+)$/); return m ? [m[1], m[2], ...r.slice(1)] : r; });
    }
    else if (first.includes("\t")) rows = text.split("\n").map(l => l.split("\t"));
    else if (first.includes(",")) rows = parseCsv(text, ",");
    else rows = text.split("\n").map(l => [l]);
    /* 舊格式：某一格裡面又用全形｜合併好幾個欄位 → 攤平 */
    rows = rows.map(r => r.flatMap(c => String(c == null ? "" : c).split("｜")).map(c => c.trim()));
    return rows.filter(r => r.some(c => c));
  }

  function headerMap(row) {
    const map = {};
    let hits = 0;
    row.forEach((c, i) => {
      const k = c.toLowerCase().replace(/\s+/g, "");
      for (const [f, names] of Object.entries(HEADER_ALIAS)) {
        if (names.some(n => n.replace(/\s+/g, "") === k) && map[f] === undefined) { map[f] = i; hits++; break; }
      }
    });
    return hits >= 1 && map.word !== undefined ? map : null;
  }

  const looksPos = s => /^(n|v|vt|vi|adj|adv|a|ad|prep|conj|pron|phr|ph|int|aux|art|num)\.?(\s*[,/&]\s*(n|v|vt|vi|adj|adv|a|ad|prep|conj|pron|phr|ph)\.?)*$/i.test(s.trim());
  const looksPhonetic = s => /^[\[/]/.test(s.trim());

  function rowsToWords(rows) {
    if (!rows.length) return { rows: [], bad: 0 };
    const map = headerMap(rows[0]);
    const body = map ? rows.slice(1) : rows;
    const out = []; let bad = 0;
    for (const r of body) {
      const w = {};
      if (map) {
        for (const [f, i] of Object.entries(map)) if (r[i]) w[f] = r[i];
      } else if (r.length >= 9) {
        FIELDS.forEach((f, i) => { if (r[i]) w[f] = r[i]; });   /* 固定 11 欄 */
      } else {
        /* 欄位比較少：猜一猜 */
        w.word = r[0];
        let i = 1;
        if (r[i] !== undefined && (r[i] === "" || looksPos(r[i]))) { if (r[i]) w.pos = r[i]; i++; }
        if (r[i] !== undefined) { if (r[i]) w.meaning = r[i]; i++; }
        const rest = ["phonetic", "example", "example_zh", "collocations", "synonyms", "forms", "mnemonic", "tags"];
        let k = 0;
        for (; i < r.length; i++) {
          if (rest[k] === "phonetic" && r[i] && !looksPhonetic(r[i])) k++;
          if (k >= rest.length) break;
          if (r[i]) w[rest[k]] = r[i];
          k++;
        }
      }
      w.word = String(w.word || "").replace(/^\d+[.)、]\s*/, "").trim();
      if (!w.word || !/[A-Za-z]/.test(w.word)) { bad++; continue; }
      out.push(w);
    }
    /* 同一批裡重複的字只留第一個 */
    const seen = new Set();
    const uniq = out.filter(w => { const k = w.word.toLowerCase(); if (seen.has(k)) { bad++; return false; } seen.add(k); return true; });
    return { rows: uniq, bad };
  }

  async function readFile(file) {
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      if (typeof XLSX === "undefined") {
        await new Promise((ok, bad) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
          s.onload = ok; s.onerror = bad; document.head.appendChild(s);
        });
      }
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" })
        .map(r => r.map(c => String(c).trim())).filter(r => r.some(c => c));
      return rows.map(r => r.flatMap(c => c.split("｜")).map(c => c.trim()));
    }
    return splitRows(await file.text());
  }


  /* =========================================================
     資料
  ========================================================= */
  async function call(name, args) {
    const { data, error } = await db.rpc(name, args || {});
    if (error) throw error;
    return data;
  }

  async function load() {
    if (!hasDb()) return;
    V.tried = true;
    try {
      const [q, s] = await Promise.all([call("vocab_queue"), call("vocab_stats")]);
      V.queue = q; V.stats = s; V.error = null;
    } catch (e) {
      V.error = /vocab_|function|schema cache|PGRST/i.test(e.message || "") ? "setup" : e.message;
    }
    render();
    renderTodayCard();
  }

  async function act(name, args, okMsg) {
    if (V.busy) return null;
    V.busy = true;
    try {
      const d = await call(name, args);
      if (okMsg) toast(okMsg);
      return d;
    } catch (e) { toast("❌ " + e.message); return null; }
    finally { V.busy = false; }
  }


  /* =========================================================
     排程預估（和資料庫的 vocab_review 一樣）
  ========================================================= */
  function nextInterval(w, g) {
    if (g === 0) return 0;
    if (!w.interval_days) return g === 3 ? 4 : 1;
    if (g === 1) return Math.min(365, Math.max(1, Math.round(w.interval_days * 1.2)));
    if (g === 2) return Math.min(365, Math.max(w.interval_days + 1, Math.round(w.interval_days * w.ease)));
    return Math.min(365, Math.max(w.interval_days + 2, Math.round(w.interval_days * w.ease * 1.3)));
  }
  const fmtDays = d => d === 0 ? "今天再考" : d < 30 ? `${d} 天後` : d < 365 ? `${Math.round(d / 30)} 個月後` : "1 年後";


  /* =========================================================
     複習
  ========================================================= */
  function pickMode(w, pool) {
    const hasMeaning = !!w.meaning;
    const enough = pool.filter(p => p.meaning && p.word.toLowerCase() !== w.word.toLowerCase()).length >= 3;
    if (!w.reps || !hasMeaning) return "flip";
    if (w.interval_days < 4) return enough ? "choose" : "flip";
    if (w.interval_days < 15) return enough && canSpeak() ? "listen" : (enough ? "choose" : "spell");
    if (w.interval_days < 45) return "spell";
    return clozeOf(w) ? "cloze" : "spell";
  }

  function clozeOf(w) {
    if (!w.example) return null;
    const stem = w.word.length > 5 ? w.word.slice(0, w.word.length - 2) : w.word;
    const re = new RegExp(`\\b(${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w*)`, "i");
    const m = w.example.match(re);
    if (!m) return null;
    return { answer: m[1], text: w.example.replace(re, "＿＿＿＿") };
  }

  function startSession(onlyHard) {
    const q = V.queue;
    if (!q) return;
    let items;
    if (onlyHard) {
      items = (V.stats.hard || []).map(h => ({ w: { id: h.id, word: h.word, meaning: h.meaning, reps: 1, interval_days: 1, ease: 2.5 }, extra: true }));
    } else {
      const rev = shuffle(q.review || []);
      const neu = (q.new || []).slice();
      items = [];
      /* 新字穿插在複習中間：每 3 個複習插 1 個新字 */
      while (rev.length || neu.length) {
        for (let k = 0; k < 3 && rev.length; k++) items.push({ w: rev.shift() });
        if (neu.length) items.push({ w: neu.shift() });
      }
    }
    if (!items.length) { toast("今天沒有要複習的字了 🎉"); return; }
    items.forEach(it => { it.mode = pickMode(it.w, q.pool || []); });
    V.session = { items, i: 0, state: "ask", picked: null, typed: "", ok: null, done: [], again: new Set() };
    prepareItem();
    renderSession();
  }

  function prepareItem() {
    const s = V.session;
    const it = s.items[s.i];
    if (!it) return;
    s.state = "ask"; s.picked = null; s.typed = ""; s.ok = null;
    const pool = (V.queue.pool || []).filter(p => p.meaning && p.word.toLowerCase() !== it.w.word.toLowerCase());
    if (it.mode === "choose") it.options = shuffle([it.w.word, ...shuffle(pool).slice(0, 3).map(p => p.word)]);
    if (it.mode === "listen") { it.options = shuffle([it.w.meaning, ...shuffle(pool).filter(p => p.meaning !== it.w.meaning).slice(0, 3).map(p => p.meaning)]); setTimeout(() => speak(it.w.word), 300); }
    if (it.mode === "cloze") it.cloze = clozeOf(it.w);
  }

  function detailHtml(w) {
    const line = (label, v) => v ? `<div class="vc-d"><span>${label}</span><div>${esc(v)}</div></div>` : "";
    return `<div class="vc-detail">
      ${w.example ? `<div class="vc-ex"><span class="vc-say" data-vc="say" data-v="${esc(w.example)}">🔊</span>${esc(w.example)}${w.example_zh ? `<small>${esc(w.example_zh)}</small>` : ""}</div>` : ""}
      ${line("搭配", w.collocations)}${line("同義", w.synonyms)}${line("變化", w.forms)}${line("記憶", w.mnemonic)}</div>`;
  }

  function headHtml(w, showMeaning) {
    return `<div class="vc-word">${esc(w.word)} <button type="button" class="vc-say big" data-vc="say" data-v="${esc(w.word)}">🔊</button></div>
      <div class="vc-sub">${w.phonetic ? esc(w.phonetic) + "　" : ""}${w.pos ? esc(w.pos) : ""}</div>
      ${showMeaning ? `<div class="vc-mean">${esc(w.meaning || "（還沒有中文）")}</div>` : ""}`;
  }

  function gradeButtons(w, allowForget) {
    const g = [[0, "😵 忘了"], [1, "🤔 模糊"], [2, "😊 記得"], [3, "😎 很熟"]].filter(([n]) => allowForget || n > 0);
    return `<div class="vc-grades">${g.map(([n, l]) => `<button type="button" class="vc-g g${n}" data-vc="grade" data-v="${n}">${l}<small>${fmtDays(nextInterval(w, n))}</small></button>`).join("")}</div>`;
  }

  function sessionHtml() {
    const s = V.session;
    if (s.i >= s.items.length) {
      const total = s.done.length;
      const ok = s.done.filter(d => d.g > 0).length;
      return `<div class="card vc-card vc-end"><div class="vc-big">🎉</div><h3>今天的單字複習完了！</h3>
        <p>複習了 ${total} 次，記得 ${total ? Math.round(ok / total * 100) : 0}%${s.dust ? "，星屑 +2 ✨" : ""}</p>
        <button type="button" class="btn btn-primary" data-vc="endsession">完成</button></div>`;
    }
    const it = s.items[s.i];
    const w = it.w;
    const modeName = { flip: "翻卡", choose: "看中文選英文", listen: "聽發音選意思", spell: "拼字", cloze: "例句填空" }[it.mode];
    const prog = `<div class="vc-prog"><span>${s.i + 1} / ${s.items.length}${s.again.has(w.id) ? "・再考一次" : ""}</span><span>${modeName}${!w.reps ? "・新字" : ""}</span>
      <button type="button" class="vc-x" data-vc="quit">✕</button></div><div class="vc-bar"><i style="width:${Math.round(s.i / s.items.length * 100)}%"></i></div>`;
    let body = "";

    if (it.mode === "flip") {
      body = s.state === "ask"
        ? `<div class="vc-face" data-vc="reveal">${headHtml(w, false)}<p class="vc-hint">想一想意思，再點卡片翻面</p></div>`
        : `<div class="vc-face open">${headHtml(w, true)}${detailHtml(w)}</div>${gradeButtons(w, true)}`;
    } else if (it.mode === "choose" || it.mode === "listen") {
      const isListen = it.mode === "listen";
      const correct = isListen ? w.meaning : w.word;
      const prompt = isListen
        ? `<div class="vc-listen"><button type="button" class="vc-say huge" data-vc="say" data-v="${esc(w.word)}">🔊</button><p class="vc-hint">聽發音，選出意思</p></div>`
        : `<div class="vc-mean big">${esc(w.meaning)}</div><div class="vc-sub">${esc(w.pos || "")}</div><p class="vc-hint">選出對應的英文</p>`;
      const opts = it.options.map(o => {
        let cls = "";
        if (s.state !== "ask") cls = o === correct ? "right" : o === s.picked ? "wrong" : "dim";
        return `<button type="button" class="vc-opt ${cls}" data-vc="pick" data-v="${esc(o)}" ${s.state !== "ask" ? "disabled" : ""}>${esc(o)}</button>`;
      }).join("");
      body = `<div class="vc-face">${prompt}</div><div class="vc-opts">${opts}</div>
        ${s.state !== "ask" ? `<div class="vc-face open small">${headHtml(w, true)}${detailHtml(w)}</div>
          ${s.ok ? gradeButtons(w, false) : `<button type="button" class="btn btn-primary vc-wide" data-vc="grade" data-v="0">繼續（今天會再考一次）</button>`}` : ""}`;
    } else {
      const isCloze = it.mode === "cloze";
      const target = isCloze ? it.cloze.answer : w.word;
      const prompt = isCloze
        ? `<div class="vc-cloze">${esc(it.cloze.text)}</div><div class="vc-sub">提示：${esc(w.meaning)}${w.pos ? `（${esc(w.pos)}）` : ""}</div>`
        : `<div class="vc-mean big">${esc(w.meaning)}</div><div class="vc-sub">${esc(w.pos || "")}・${w.word.length} 個字母・${esc(w.word[0])}＿＿</div>`;
      body = `<div class="vc-face">${prompt}</div>
        ${s.state === "ask"
          ? `<input id="vc-type" class="vc-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="拼出英文" value="${esc(s.typed)}">
             <div class="rp-row"><button type="button" class="btn btn-primary vc-grow" data-vc="check">確認</button><button type="button" class="btn" data-vc="giveup">不會</button></div>`
          : `<div class="vc-result ${s.ok ? "ok" : "no"}">${s.ok ? "✅ 正確！" : `❌ 你寫的是「${esc(s.typed || "（空白）")}」，答案是 <b>${esc(target)}</b>`}</div>
             <div class="vc-face open small">${headHtml(w, true)}${detailHtml(w)}</div>
             ${s.ok ? gradeButtons(w, false) : `<button type="button" class="btn btn-primary vc-wide" data-vc="grade" data-v="0">繼續（今天會再考一次）</button>`}`}`;
    }
    return `<div class="card vc-card vc-session">${prog}${body}</div>`;
  }

  function renderSession() {
    const root = document.getElementById("vc-root");
    if (!root) return;
    root.innerHTML = sessionHtml();
    const inp = document.getElementById("vc-type");
    if (inp) { inp.focus(); inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); checkTyped(); } }); }
  }

  function checkTyped(giveUp) {
    const s = V.session;
    const it = s.items[s.i];
    const inp = document.getElementById("vc-type");
    s.typed = inp ? inp.value.trim() : "";
    const target = (it.mode === "cloze" ? it.cloze.answer : it.w.word).toLowerCase();
    s.ok = !giveUp && (s.typed.toLowerCase() === target || s.typed.toLowerCase() === it.w.word.toLowerCase());
    s.state = "shown";
    speak(it.w.word);
    renderSession();
  }

  async function grade(g) {
    const s = V.session;
    const it = s.items[s.i];
    if (it.extra) {   /* 頑固單字加強練習：不改排程 */
      s.done.push({ g });
    } else {
      const d = await act("vocab_review", { p_id: it.w.id, p_grade: g });
      if (!d) return;
      it.w.interval_days = d.interval; it.w.ease = d.ease; it.w.reps = (it.w.reps || 0) + 1;
      if (d.dust) s.dust = true;
      s.done.push({ g });
    }
    /* 忘了：排到最後再考一次（翻卡） */
    if (g === 0 && !s.again.has(it.w.id)) {
      s.again.add(it.w.id);
      s.items.push({ w: it.w, mode: "flip", extra: it.extra });
    }
    s.i += 1;
    prepareItem();
    renderSession();
    if (s.i >= s.items.length) load();
  }


  /* =========================================================
     各分頁畫面
  ========================================================= */
  function todayHtml() {
    const q = V.queue, st = V.stats;
    const nRev = (q.review || []).length, nNew = (q.new || []).length;
    const b = st.buckets;
    return `<div class="card vc-card vc-hero">
        <div class="vc-nums"><div><b>${nRev}</b><span>要複習</span></div><div><b>${nNew}</b><span>新字</span></div><div><b>${st.streak}</b><span>連續天數</span></div></div>
        <button type="button" class="btn btn-primary vc-start" data-vc="start" ${nRev + nNew ? "" : "disabled"}>${nRev + nNew ? `▶ 開始複習（${nRev + nNew}）` : "今天都複習完了 🎉"}</button>
        ${st.hard.length ? `<button type="button" class="btn btn-small" data-vc="hard">🔥 加強頑固單字（${st.hard.length}）</button>` : ""}
        <p class="vc-note">今天已經複習 ${q.reviewed_today} 個字。到期的全部複習完（至少 10 個）星屑 +2。</p></div>
      ${st.total ? `<div class="card vc-card"><h3>📊 熟練度</h3>${bucketBar(b, st.total)}
        <p class="vc-note">共 ${st.total} 字・近 30 天記得 ${st.retention == null ? "－" : st.retention + "%"}</p></div>` : `<div class="card vc-card"><h3>👋 還沒有單字</h3>
        <p class="vc-note">到「匯入」貼上單字，或輸入朋友給你的分享碼。</p><button type="button" class="btn btn-primary btn-small" data-vc="tab" data-v="import">去匯入</button></div>`}
      <div class="card vc-card"><h3>⚙️ 每天新字</h3><div class="rp-row"><input id="vc-npd" type="number" min="0" max="200" class="vc-input small" value="${st.new_per_day}">
        <button type="button" class="btn btn-small" data-vc="npd">儲存</button></div>
        <p class="vc-note">建議 10～30 個。新字越多，之後每天要複習的量也越多（大約是新字的 5～8 倍）。</p></div>`;
  }

  function bucketBar(b, total) {
    const seg = [["new", "新字", "#9e9e9e"], ["learning", "學習中", "#ffa726"], ["familiar", "熟悉", "#42a5f5"], ["mastered", "精通", "#66bb6a"]];
    return `<div class="vc-stack">${seg.map(([k, , c]) => b[k] ? `<i style="width:${b[k] / total * 100}%;background:${c}"></i>` : "").join("")}</div>
      <div class="vc-legend">${seg.map(([k, n, c]) => `<span><i style="background:${c}"></i>${n} ${b[k]}</span>`).join("")}</div>`;
  }

  function importHtml() {
    const p = V.preview;
    const pv = p ? `<div class="card vc-card"><h3>👀 預覽：${p.rows.length} 個字${p.bad ? `（略過 ${p.bad} 行）` : ""}</h3>
        <div class="vc-table"><div class="vc-tr th"><span>單字</span><span>詞性</span><span>中文</span><span>其他</span></div>
        ${p.rows.slice(0, 8).map(w => `<div class="vc-tr"><span><b>${esc(w.word)}</b></span><span>${esc(w.pos || "")}</span><span>${esc(w.meaning || "—")}</span>
          <span>${FIELDS.slice(3).filter(f => w[f]).map(f => FIELD_NAME[f]).join("、")}</span></div>`).join("")}</div>
        ${p.rows.length > 8 ? `<p class="vc-note">…還有 ${p.rows.length - 8} 個</p>` : ""}
        ${p.rows.filter(w => !w.meaning).length ? `<p class="vc-note">⚠️ 有 ${p.rows.filter(w => !w.meaning).length} 個字沒有中文，複習時只能用翻卡。可以用下面的 AI 指令補齊再匯入。</p>` : ""}
        <label class="vc-lab">放進哪本單字本<input id="vc-deck" class="vc-input" maxlength="40" value="${esc(p.deck)}"></label>
        <div class="rp-row"><button type="button" class="btn btn-primary" data-vc="doimport">匯入 ${p.rows.length} 個字</button><button type="button" class="btn" data-vc="cancelimport">取消</button></div></div>` : "";

    return pv + `<div class="card vc-card"><h3>📋 貼上單字</h3>
        <textarea id="vc-paste" class="vc-input vc-area" placeholder="negotiate | v. | 協商 | ...\n或一行一個：\nnegotiate, 協商\nrevenue\t營收"></textarea>
        <div class="rp-row"><button type="button" class="btn btn-primary" data-vc="parse">解析</button>
          <label class="btn vc-file">📁 選 CSV／Excel 檔<input id="vc-file" type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" hidden></label></div></div>
      <div class="card vc-card"><h3>🔗 用分享碼匯入</h3>
        <div class="rp-row"><input id="vc-code" class="vc-input vc-grow" maxlength="6" placeholder="輸入 6 碼分享碼"><button type="button" class="btn" data-vc="peek">查看</button></div>
        ${V.sharePeek ? `<div class="vc-peek"><b>📘 ${esc(V.sharePeek.deck)}</b>（${V.sharePeek.count} 字，${esc(V.sharePeek.by)} 分享）
          <div class="vc-note">${(V.sharePeek.sample || []).map(w => `${esc(w.word)} ${esc(w.meaning || "")}`).join("・")}…</div>
          <button type="button" class="btn btn-primary btn-small" data-vc="shareimport" data-v="${esc(V.sharePeek.code)}">匯入這本</button></div>` : ""}</div>
      <div class="card vc-card"><h3>🤖 用 AI 產生固定格式</h3>
        <p class="vc-note">只有英文單字、或是拍了單字書？把下面這段指令複製給 ChatGPT、Claude 或任何 AI，最後貼上你的單字（或附上照片）。AI 回覆的內容整段複製，貼到上面的框就好。</p>
        <pre class="vc-pre">${esc(AI_PROMPT)}（貼上你的單字）</pre>
        <button type="button" class="btn btn-small" data-vc="copyprompt">📋 複製指令</button></div>
      <div class="card vc-card"><h3>📐 格式說明</h3>
        <p class="vc-note">一行一個字，用 <b>|</b> 分隔，一共 11 欄，沒有的留空：</p>
        <pre class="vc-pre">${FIELDS.map(f => FIELD_NAME[f]).join(" | ")}</pre>
        <p class="vc-note">也可以：Tab 分隔（直接從 Excel 複製）、CSV 檔（第一列可以是上面這些欄位名稱）、Excel 檔，或只寫「單字, 中文」兩欄、甚至一行只有一個英文字。</p>
        <button type="button" class="btn btn-small" data-vc="template">⬇️ 下載 CSV 範本</button></div>`;
  }

  function decksHtml() {
    const st = V.stats;
    if (V.listDeck !== null) return listHtml();
    const decks = st.decks || [];
    return `<div class="card vc-card"><h3>📚 單字本</h3>${decks.length ? decks.map(d => `<div class="vc-deck">
        <div class="vc-grow"><b>${esc(d.deck)}</b><span class="vc-note">${d.total} 字・學過 ${d.started}・精通 ${d.mastered}</span>
        <div class="vc-bar thin"><i style="width:${Math.round(d.started / d.total * 100)}%"></i></div></div>
        <div class="vc-deck-btns"><button type="button" class="btn btn-small" data-vc="browse" data-v="${esc(d.deck)}">瀏覽</button>
        <button type="button" class="btn btn-small" data-vc="share" data-v="${esc(d.deck)}">分享碼</button>
        <button type="button" class="btn btn-small" data-vc="rename" data-v="${esc(d.deck)}">改名</button>
        <button type="button" class="btn btn-small" data-vc="deldeck" data-v="${esc(d.deck)}">刪除</button></div></div>`).join("")
      : `<p class="vc-note">還沒有單字本。</p>`}
      ${decks.length ? `<button type="button" class="btn btn-small" data-vc="browse" data-v="">🔍 搜尋全部單字</button>` : ""}</div>`;
  }

  function listHtml() {
    const l = V.list;
    const today = V.queue && V.queue.today;
    const rows = (l && l.rows) || [];
    return `<div class="card vc-card"><div class="rp-row"><button type="button" class="btn btn-small" data-vc="back">← 返回</button>
        <b class="vc-grow">${V.listDeck ? esc(V.listDeck) : "全部單字"}</b></div>
      <div class="rp-row"><input id="vc-q" class="vc-input vc-grow" placeholder="搜尋英文或中文" value="${esc(V.listQ)}"><button type="button" class="btn btn-small" data-vc="search">搜尋</button></div>
      <p class="vc-note">${l ? `共 ${l.count} 個` : "載入中…"}</p>
      ${rows.map(w => `<details class="vc-li"><summary><span class="vc-say" data-vc="say" data-v="${esc(w.word)}">🔊</span><b>${esc(w.word)}</b>
          <span class="vc-grow">${esc(w.pos || "")} ${esc(w.meaning || "—")}</span>
          <span class="vc-due">${!w.reps ? "新" : w.interval_days >= 30 ? "精通" : w.due <= today ? "今天" : w.due.slice(5).replace("-", "/")}</span></summary>
        ${headHtml(w, true)}${detailHtml(w)}
        <p class="vc-note">複習 ${w.reps} 次・忘記 ${w.lapses} 次・間隔 ${w.interval_days} 天</p>
        <div class="rp-row"><button type="button" class="btn btn-small" data-vc="edit" data-v="${w.id}">✏️ 改中文</button><button type="button" class="btn btn-small" data-vc="delword" data-v="${w.id}">🗑️ 刪除</button></div></details>`).join("")}
      <div class="rp-row">${V.listOffset > 0 ? `<button type="button" class="btn btn-small" data-vc="page" data-v="-50">上一頁</button>` : ""}
        ${l && V.listOffset + 50 < l.count ? `<button type="button" class="btn btn-small" data-vc="page" data-v="50">下一頁</button>` : ""}</div></div>`;
  }

  function statsHtml() {
    const st = V.stats;
    const fmax = Math.max(1, ...st.forecast.map(f => f.n));
    const hmax = Math.max(1, ...st.history.map(f => f.n));
    const bars = (list, max, cls) => `<div class="vc-bars ${cls}">${list.map(x => `<div><i style="height:${Math.max(3, x.n / max * 100)}%"></i><b>${x.n || ""}</b><span>${x.day.slice(8)}</span></div>`).join("")}</div>`;
    return `<div class="card vc-card"><h3>📊 熟練度</h3>${bucketBar(st.buckets, st.total || 1)}
        <div class="vc-nums small"><div><b>${st.total}</b><span>總字數</span></div><div><b>${st.retention == null ? "－" : st.retention + "%"}</b><span>近 30 天記得</span></div><div><b>${st.streak}</b><span>連續天數</span></div></div></div>
      <div class="card vc-card"><h3>📅 未來 7 天要複習</h3>${bars(st.forecast, fmax, "f")}<p class="vc-note">第一天是今天（含已經到期的）。不含新字。</p></div>
      <div class="card vc-card"><h3>📈 最近 14 天複習量</h3>${bars(st.history, hmax, "h")}</div>
      <div class="card vc-card"><h3>🔥 最常忘的字</h3>${st.hard.length ? st.hard.map(h => `<div class="vc-hard"><span class="vc-say" data-vc="say" data-v="${esc(h.word)}">🔊</span>
        <b>${esc(h.word)}</b><span class="vc-grow">${esc(h.meaning || "")}</span><span class="vc-note">忘 ${h.lapses} 次</span></div>`).join("") : `<p class="vc-note">還沒有忘記過的字 👍</p>`}</div>
      <div class="card vc-card"><h3>📚 各單字本</h3>${(st.decks || []).map(d => `<div class="vc-deckstat"><span>${esc(d.deck)}</span>
        <div class="vc-bar thin"><i style="width:${Math.round(d.started / d.total * 100)}%"></i></div><span class="vc-note">${d.started}/${d.total}</span></div>`).join("")}</div>`;
  }

  function render() {
    const root = document.getElementById("vc-root");
    if (!root) return;
    if (V.session) { renderSession(); return; }
    if (!hasDb()) { root.innerHTML = `<div class="card vc-card"><p class="vc-note">登入之後才能背單字。</p></div>`; return; }
    if (V.error === "setup") { root.innerHTML = `<div class="card vc-card"><p class="vc-note">⚠️ 單字的資料庫還沒設定：到 Supabase 的 SQL Editor 執行 <b>sql/2026-10-23_單字.sql</b>。</p></div>`; return; }
    if (V.error) { root.innerHTML = `<div class="card vc-card"><p class="vc-note">載入失敗：${esc(V.error)}</p></div>`; return; }
    if (!V.queue) { if (!V.tried) load(); root.innerHTML = `<div class="card vc-card"><p class="vc-note">載入中…</p></div>`; return; }
    const tabs = [["today", "今日複習"], ["import", "匯入"], ["decks", "單字本"], ["stats", "統計"]];
    const body = V.tab === "import" ? importHtml() : V.tab === "decks" ? decksHtml() : V.tab === "stats" ? statsHtml() : todayHtml();
    root.innerHTML = `<div class="vc-tabs">${tabs.map(([k, l]) => `<button type="button" class="vc-tab ${V.tab === k ? "on" : ""}" data-vc="tab" data-v="${k}">${l}</button>`).join("")}</div>${body}
      <p class="vc-ver">單字 ${VOCAB_JS_VERSION}</p>`;
  }

  async function loadList() {
    V.list = null; render();
    try { V.list = await call("vocab_list", { p_deck: V.listDeck || null, p_q: V.listQ || null, p_offset: V.listOffset }); }
    catch (e) { toast("❌ " + e.message); }
    render();
  }


  /* =========================================================
     今日頁小卡（不分遊戲模式）
  ========================================================= */
  function renderTodayCard() {
    const anchor = document.querySelector('.page[data-page="today"] .game-mode-bar');
    if (!anchor) return;
    let box = document.getElementById("vc-today");
    if (!box) { box = document.createElement("div"); box.id = "vc-today"; anchor.before(box); }
    const q = V.queue;
    const n = q ? (q.review || []).length + (q.new || []).length : 0;
    box.hidden = !(hasDb() && q && V.stats && V.stats.total && n);
    if (box.hidden) return;
    box.innerHTML = `<button type="button" class="vc-todaybtn" data-vc="gotoday">📖 今天有 <b>${n}</b> 個單字要複習 ›</button>`;
  }


  /* =========================================================
     點擊
  ========================================================= */
  async function onClick(e) {
    const el = e.target.closest("[data-vc]");
    if (!el) return;
    const a = el.dataset.vc, v = el.dataset.v;
    const val = id => (document.getElementById(id) || {}).value || "";

    if (a === "say") { e.preventDefault(); e.stopPropagation(); speak(v); return; }
    if (a === "tab") { V.tab = v; V.listDeck = null; render(); return; }
    if (a === "gotoday") { V.tab = "today"; if (typeof showPage === "function") showPage("vocab"); return; }
    if (a === "start") { startSession(false); return; }
    if (a === "hard") { startSession(true); return; }
    if (a === "quit") { if (!confirm("先停在這裡？已經複習的會保留。")) return; V.session = null; load(); return; }
    if (a === "endsession") { V.session = null; render(); return; }
    if (a === "reveal") { V.session.state = "shown"; speak(V.session.items[V.session.i].w.word); renderSession(); return; }
    if (a === "pick") {
      const s = V.session, it = s.items[s.i];
      s.picked = v; s.ok = v === (it.mode === "listen" ? it.w.meaning : it.w.word); s.state = "shown";
      if (it.mode === "choose") speak(it.w.word);
      renderSession(); return;
    }
    if (a === "check") { checkTyped(false); return; }
    if (a === "giveup") { checkTyped(true); return; }
    if (a === "grade") { grade(Number(v)); return; }

    if (a === "npd") { const d = await act("vocab_settings_set", { p_new_per_day: Number(val("vc-npd")) }, "儲存好了"); if (d) load(); return; }

    if (a === "parse") {
      const r = rowsToWords(splitRows(val("vc-paste")));
      if (!r.rows.length) { toast("沒有找到英文單字，檢查一下格式"); return; }
      V.preview = { ...r, deck: (r.rows[0].tags && r.rows.every(w => w.tags === r.rows[0].tags)) ? r.rows[0].tags : "我的單字" };
      render(); window.scrollTo(0, 0); return;
    }
    if (a === "cancelimport") { V.preview = null; render(); return; }
    if (a === "doimport") {
      const p = V.preview; const deck = val("vc-deck") || "我的單字";
      let added = 0, dup = 0;
      for (let i = 0; i < p.rows.length; i += 1000) {
        const d = await act("vocab_import", { p_rows: p.rows.slice(i, i + 1000), p_deck: deck });
        if (!d) return;
        added += d.added; dup += d.dup;
      }
      toast(`📖 匯入 ${added} 個字${dup ? `（${dup} 個已經有了）` : ""}`);
      V.preview = null; V.tab = "today"; await load(); return;
    }
    if (a === "copyprompt") { try { await navigator.clipboard.writeText(AI_PROMPT); toast("指令複製好了，貼給 AI，最後加上你的單字"); } catch (err) { toast("複製失敗，請手動選取上面的文字"); } return; }
    if (a === "template") {
      const csv = "﻿" + FIELDS.map(f => FIELD_NAME[f]).join(",") + "\n" +
        'negotiate,v.,協商；談判,[nɪˋgoʃɪˏet],"The two companies negotiated a new contract.",兩家公司協商了新合約。,negotiate a contract; negotiate with sb,bargain,negotiation (n.); negotiable (adj.),neg 不 + oti 閒 → 不閒著一直談,商務\n';
      const a2 = document.createElement("a");
      a2.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a2.download = "單字範本.csv"; a2.click(); return;
    }
    if (a === "peek") {
      const code = val("vc-code").trim().toUpperCase();
      const d = await act("vocab_share_peek", { p_code: code });
      if (d) { V.sharePeek = { ...d, code }; render(); }
      return;
    }
    if (a === "shareimport") {
      const d = await act("vocab_share_import", { p_code: v });
      if (d) { toast(`📖 匯入 ${d.added} 個字${d.dup ? `（${d.dup} 個已經有了）` : ""}`); V.sharePeek = null; V.tab = "today"; load(); }
      return;
    }
    if (a === "share") {
      const d = await act("vocab_share", { p_deck: v });
      if (d) {
        try { await navigator.clipboard.writeText(d.code); } catch (err) {}
        alert(`「${v}」的分享碼：${d.code}\n\n（已經複製）朋友在「單字 → 匯入 → 用分享碼匯入」輸入就能拿到這 ${d.count} 個字。\n之後單字本有更新，再按一次「分享碼」就會換新的。`);
      }
      return;
    }
    if (a === "rename") { const n = prompt("新的名字", v); if (!n || n === v) return; const d = await act("vocab_rename_deck", { p_old: v, p_new: n }, "改好了"); if (d) load(); return; }
    if (a === "deldeck") { if (!confirm(`刪除「${v}」整本單字本？複習紀錄也會一起刪掉，不能復原。`)) return; const d = await act("vocab_delete_deck", { p_deck: v }); if (d) { toast(`刪掉 ${d.deleted} 個字`); load(); } return; }
    if (a === "browse") { V.listDeck = v; V.listQ = ""; V.listOffset = 0; loadList(); return; }
    if (a === "back") { V.listDeck = null; render(); return; }
    if (a === "search") { V.listQ = val("vc-q"); V.listOffset = 0; loadList(); return; }
    if (a === "page") { V.listOffset = Math.max(0, V.listOffset + Number(v)); loadList(); return; }
    if (a === "delword") { if (!confirm("刪除這個字？")) return; const d = await act("vocab_delete", { p_ids: [Number(v)] }); if (d) { loadList(); load(); } return; }
    if (a === "edit") {
      const w = (V.list.rows || []).find(x => String(x.id) === v);
      const m = prompt(`「${w.word}」的中文`, w.meaning || "");
      if (m === null) return;
      const d = await act("vocab_update", { p_id: Number(v), p_data: { meaning: m } }, "改好了");
      if (d) loadList();
    }
  }

  async function onChange(e) {
    if (e.target.id !== "vc-file") return;
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const r = rowsToWords(await readFile(file));
      if (!r.rows.length) { toast("檔案裡沒有找到英文單字"); return; }
      V.preview = { ...r, deck: file.name.replace(/\.[^.]+$/, "").slice(0, 40) };
      render(); window.scrollTo(0, 0);
    } catch (err) { toast("讀檔失敗：" + err.message); }
  }


  /* =========================================================
     樣式、分頁
  ========================================================= */
  function injectStyle() {
    if (document.getElementById("vc-style")) return;
    const css = document.createElement("style");
    css.id = "vc-style";
    css.textContent = `
      .vc-tabs { display: flex; gap: 6px; margin: 4px 0 12px; }
      .vc-tab { flex: 1; padding: 9px 0; border-radius: 12px; border: 1px solid rgba(127,127,127,.25); background: transparent; color: inherit; font-weight: 700; cursor: pointer; font-size: 14px; }
      .vc-tab.on { background: #2e7d6b; border-color: #2e7d6b; color: #fff; }
      .vc-card h3 { margin: 0 0 8px; }
      .vc-note { font-size: 13px; opacity: .75; margin: 6px 0; line-height: 1.5; }
      .vc-ver { text-align: center; font-size: 11px; opacity: .45; margin: 8px 0 20px; }
      .vc-grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .vc-input { box-sizing: border-box; width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(127,127,127,.3); background: rgba(127,127,127,.08); color: inherit; font-size: 16px; }
      .vc-input.small { width: 100px; }
      .vc-area { min-height: 140px; font-family: ui-monospace, Menlo, monospace; font-size: 13px; resize: vertical; margin-bottom: 8px; }
      .vc-lab { display: flex; flex-direction: column; gap: 4px; font-size: 13px; margin: 8px 0; }
      .vc-file { cursor: pointer; }
      .vc-pre { white-space: pre-wrap; font-size: 12px; background: rgba(127,127,127,.1); padding: 10px; border-radius: 10px; max-height: 220px; overflow: auto; margin: 6px 0; }
      .vc-peek { margin-top: 8px; padding: 10px; border-radius: 10px; background: rgba(46,125,107,.12); }

      .vc-hero { text-align: center; }
      .vc-nums { display: flex; justify-content: space-around; margin: 4px 0 12px; }
      .vc-nums div { display: flex; flex-direction: column; } .vc-nums b { font-size: 32px; color: #2e7d6b; } .vc-nums span { font-size: 12px; opacity: .7; }
      .vc-nums.small b { font-size: 22px; }
      .vc-start { width: 100%; padding: 14px; font-size: 17px; margin-bottom: 8px; }
      .vc-stack { display: flex; height: 14px; border-radius: 99px; overflow: hidden; background: rgba(127,127,127,.15); }
      .vc-stack i { display: block; height: 100%; }
      .vc-legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; margin-top: 6px; }
      .vc-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 4px; }
      .vc-bar { height: 6px; border-radius: 99px; background: rgba(127,127,127,.18); overflow: hidden; }
      .vc-bar i { display: block; height: 100%; background: #2e7d6b; transition: width .3s; }
      .vc-bar.thin { height: 5px; margin-top: 4px; flex: 1; }

      .vc-table { font-size: 13px; }
      .vc-tr { display: grid; grid-template-columns: 1.1fr .5fr 1.2fr 1fr; gap: 6px; padding: 5px 0; border-bottom: 1px solid rgba(127,127,127,.12); }
      .vc-tr span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .vc-tr.th { font-weight: 800; opacity: .7; }

      .vc-deck { display: flex; flex-direction: column; gap: 6px; padding: 10px 0; border-bottom: 1px solid rgba(127,127,127,.12); }
      .vc-deck-btns { display: flex; flex-wrap: wrap; gap: 6px; }
      .vc-li { border-bottom: 1px solid rgba(127,127,127,.12); padding: 6px 0; }
      .vc-li summary { display: flex; align-items: center; gap: 8px; cursor: pointer; list-style: none; font-size: 14px; }
      .vc-li summary::-webkit-details-marker { display: none; }
      .vc-li summary .vc-grow { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .85; }
      .vc-due { font-size: 11px; padding: 1px 7px; border-radius: 99px; background: rgba(127,127,127,.15); white-space: nowrap; }
      .vc-say { border: 0; background: transparent; cursor: pointer; font-size: 15px; padding: 0 2px; color: inherit; }
      .vc-say.big { font-size: 22px; } .vc-say.huge { font-size: 64px; }
      .vc-hard, .vc-deckstat { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 14px; }
      .vc-deckstat span:first-child { width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .vc-bars { display: grid; gap: 4px; height: 110px; align-items: end; }
      .vc-bars.f { grid-template-columns: repeat(7, 1fr); } .vc-bars.h { grid-template-columns: repeat(14, 1fr); }
      .vc-bars div { height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; font-size: 10px; }
      .vc-bars i { width: 70%; background: #2e7d6b; border-radius: 4px 4px 0 0; } .vc-bars.h i { background: #42a5f5; }
      .vc-bars b { font-size: 10px; order: -1; } .vc-bars span { opacity: .6; }

      .vc-session { min-height: 60vh; }
      .vc-prog { display: flex; justify-content: space-between; align-items: center; font-size: 12px; opacity: .8; gap: 8px; }
      .vc-x { border: 0; background: transparent; color: inherit; font-size: 16px; cursor: pointer; }
      .vc-session .vc-bar { margin: 6px 0 14px; }
      .vc-face { padding: 22px 14px; border-radius: 16px; background: rgba(127,127,127,.07); text-align: center; cursor: default; }
      .vc-face[data-vc="reveal"] { cursor: pointer; min-height: 200px; display: flex; flex-direction: column; justify-content: center; }
      .vc-face.open { text-align: left; } .vc-face.small { margin-top: 12px; padding: 14px; }
      .vc-face.open .vc-word, .vc-face.open .vc-sub, .vc-face.open .vc-mean { text-align: center; }
      .vc-word { font-size: 34px; font-weight: 800; letter-spacing: .5px; word-break: break-word; }
      .vc-face.small .vc-word { font-size: 24px; }
      .vc-sub { font-size: 14px; opacity: .7; margin-top: 4px; }
      .vc-mean { font-size: 20px; font-weight: 700; margin-top: 10px; color: #2e7d6b; }
      .vc-mean.big { font-size: 26px; margin-top: 0; }
      .vc-hint { font-size: 13px; opacity: .6; margin-top: 14px; }
      .vc-detail { margin-top: 12px; font-size: 14px; line-height: 1.6; }
      .vc-ex { padding: 8px 10px; border-left: 3px solid #2e7d6b; background: rgba(46,125,107,.08); border-radius: 6px; margin-bottom: 8px; }
      .vc-ex small { display: block; opacity: .75; }
      .vc-d { display: flex; gap: 8px; margin: 3px 0; } .vc-d span { flex: none; font-size: 12px; opacity: .6; width: 34px; padding-top: 2px; }
      .vc-grades { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 14px; }
      .vc-g { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 2px; border-radius: 12px; border: 0; font-weight: 800; font-size: 14px; cursor: pointer; color: #fff; }
      .vc-g small { font-weight: 400; font-size: 11px; opacity: .9; }
      .vc-g.g0 { background: #e57373; } .vc-g.g1 { background: #ffa726; } .vc-g.g2 { background: #42a5f5; } .vc-g.g3 { background: #66bb6a; }
      .vc-opts { display: grid; gap: 8px; margin-top: 12px; }
      .vc-opt { padding: 14px; border-radius: 12px; border: 1px solid rgba(127,127,127,.3); background: rgba(127,127,127,.06); color: inherit; font-size: 17px; cursor: pointer; text-align: center; }
      .vc-opt.right { background: rgba(102,187,106,.25); border-color: #66bb6a; font-weight: 800; }
      .vc-opt.wrong { background: rgba(229,115,115,.25); border-color: #e57373; }
      .vc-opt.dim { opacity: .45; }
      .vc-listen { padding: 10px 0; }
      .vc-cloze { font-size: 18px; line-height: 1.7; }
      #vc-type { margin: 12px 0 8px; font-size: 22px; text-align: center; }
      .vc-result { margin-top: 12px; padding: 10px; border-radius: 10px; text-align: center; font-size: 15px; }
      .vc-result.ok { background: rgba(102,187,106,.18); } .vc-result.no { background: rgba(229,115,115,.18); }
      .vc-wide { width: 100%; margin-top: 12px; padding: 12px; }
      .vc-end { text-align: center; } .vc-big { font-size: 60px; }
      .vc-todaybtn { display: block; width: 100%; margin: 8px 0; padding: 12px 14px; border-radius: 14px; border: 1px solid rgba(46,125,107,.4); background: rgba(46,125,107,.12); color: inherit; font-size: 15px; text-align: left; cursor: pointer; }
      @media (max-width: 380px) { .vc-grades { grid-template-columns: repeat(2, 1fr); } }
    `;
    document.head.appendChild(css);
  }

  function ensurePage() {
    injectStyle();
    if (!document.querySelector('.tab-btn[data-page="vocab"]')) {
      const after = document.querySelector('.tab-btn[data-page="focus"]');
      if (after) {
        const btn = document.createElement("button");
        btn.className = "tab-btn";
        btn.dataset.page = "vocab";
        btn.type = "button";
        btn.innerHTML = '<span class="tab-icon">📖</span><span class="tab-label">單字</span>';
        btn.addEventListener("click", () => showPage("vocab"));
        after.after(btn);
      }
    }
    if (!document.querySelector('.page[data-page="vocab"]')) {
      const focus = document.querySelector('.page[data-page="focus"]');
      if (focus) {
        const page = document.createElement("div");
        page.className = "page";
        page.dataset.page = "vocab";
        page.innerHTML = `<div class="page-title"><h1>📖 英文單字</h1><p>依遺忘曲線，在快忘記的時候複習。</p></div><div id="vc-root"></div>`;
        focus.after(page);
        page.addEventListener("change", onChange);
      }
    }
    if (typeof PAGES !== "undefined" && Array.isArray(PAGES) && !PAGES.includes("vocab")) PAGES.push("vocab");
  }

  if (typeof window.applyPage === "function") {
    const base = window.applyPage;
    window.applyPage = function (name) {
      const r = base.apply(this, arguments);
      if (name === "vocab") setTimeout(() => { render(); if (hasDb() && !V.session) load(); }, 0);
      return r;
    };
  }

  function boot() {
    ensurePage();
    document.addEventListener("click", onClick);
    if (location.hash === "#vocab" && typeof applyPage === "function") setTimeout(() => applyPage("vocab"), 0);
    let waited = 0;
    const wait = setInterval(() => {
      if (hasDb()) { clearInterval(wait); load(); }
      if (++waited > 60) clearInterval(wait);
    }, 1000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.VocabGame = { version: VOCAB_JS_VERSION, reload: load, state: V, parse: t => rowsToWords(splitRows(t)) };

})();
