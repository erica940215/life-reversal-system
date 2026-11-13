/* 🚇 通勤純聽模式：把今天的 Part 3／4 對話、到期錯題、要背的單字串成一張播放清單
   ‧ 全部用 AI 語音（存在 Storage 快取，第二次聽不用再產生）
   ‧ 只用一個 <audio> 換歌，加上 Media Session：手機關螢幕、鎖定畫面、耳機按鍵都能繼續播／切下一首 */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const P = { list: [], i: 0, au: null, bar: null, playing: false, rate: 1, opt: {} };
  try { P.rate = Number(localStorage.getItem("tcCommuteRate")) || 1; } catch (_) {}

  /* 每一首：{ label, kind, key, body } → 用 edge function 拿到 mp3/wav 網址 */
  const URLS = {};
  /* 靜音（給「停幾秒想一想」用）：在手機上直接產生一段無聲的 wav，不用 AI */
  const SIL = {};
  function silence(sec) {
    if (SIL[sec]) return SIL[sec];
    const rate = 8000, n = rate * sec, b = new Uint8Array(44 + n), v = new DataView(b.buffer), w = (o, t) => { for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
    w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, "data"); v.setUint32(40, n, true); b.fill(128, 44);
    return (SIL[sec] = URL.createObjectURL(new Blob([b], { type: "audio/wav" })));
  }
  function urlOf(it) {
    if (it.silence) return Promise.resolve(silence(it.silence));
    if (it.key && window.ToeicTest && it.group) return window.ToeicTest.clip(it.key, it.body);
    const k = JSON.stringify(it.body);
    if (!URLS[k]) { URLS[k] = db.functions.invoke("toeic", { body: Object.assign({ action: "tts" }, it.body) }).then(r => { if (r.error || !r.data || !r.data.url) throw new Error((r.data && r.data.error) || "語音失敗"); return r.data.url; }); URLS[k].catch(() => delete URLS[k]); }
    return URLS[k];
  }

  async function build() {
    const S = window.ToeicSys && window.ToeicSys.state, list = [];
    if (window.ToeicTest) { try { await window.ToeicTest.ensure(); } catch (_) {} }
    /* ① 今天的對話／獨白：先聽原音，再聽「題目＋答案＋中文重點」 */
    const gs = window.ToeicTest ? window.ToeicTest.listenGroups(4) : [];
    gs.forEach((g, k) => {
      const a = window.ToeicTest.audioOf(g); if (!a) return;
      const KIND = { announcement: "公告", voicemail: "語音留言", advertisement: "廣告", tour: "導覽", "news report": "新聞", "meeting excerpt": "會議片段", "radio broadcast": "廣播" };
      const nm = g.p === 3 ? "對話" : (KIND[String(g.it.kind || "").toLowerCase()] || "獨白");
      list.push({ label: `🎧 Part ${g.p} ${nm} ${k + 1}`, kind: "listen", group: g, key: a.key, body: a.body });
      list.push({ label: `💡 ${nm} ${k + 1}：題目和答案`, kind: "explain", body: { study: true, voice: "us_f", text: g.qs.map((q, i) => `Question ${i + 1}. ${q.q}\nAnswer: ${q.o[q.a]}.`).join("\n") + `\n中文重點：${g.it.zh || ""}` } });
    });
    /* ② 到期的錯題（Part 2、Part 5）：念出正確的句子＋中文 */
    if (S) {
      const t = window.ToeicSys.todayStr(), due = S.review.filter(x => x.due <= t && (x.part === 2 || x.part === 5)).slice(0, 8);
      due.forEach((r, k) => {
        const q = window.ToeicSys.qById(r.qid); if (!q) return;
        const text = q.part === 2 ? `Question: ${q.q}\nBest response: ${q.o[q.a]}\n中文：${q.zh || ""}` : `${String(q.q).replace(/-{3,}/, q.o[q.a])}\n空格答案是：${q.o[q.a]}。\n中文：${q.zh || ""}`;
        list.push({ label: `🔁 錯題 ${k + 1}（Part ${q.part}）`, kind: "review", body: { study: true, voice: k % 2 ? "uk_f" : "us_m", text } });
      });
    }
    /* ③ 今天要背的單字：英文 → 中文 → 例句，5 個一首 */
    if (hasDb()) {
      const t = window.ToeicSys ? window.ToeicSys.todayStr() : new Date().toISOString().slice(0, 10);
      const { data } = await db.from("vocab_words").select("word, meaning, example").or(`due.lte.${t},reps.eq.0`).order("due", { ascending: true, nullsFirst: false }).limit(15);
      const W = (data || []).filter(w => w.word && w.meaning);
      for (let k = 0; k < W.length; k += 5) {
        const ch = W.slice(k, k + 5);
        list.push({ label: `📚 單字 ${k + 1}–${k + ch.length}`, kind: "words", words: ch.map(w => w.word).join("、"), body: { study: true, voice: "ca_f", text: ch.map(w => `${w.word}. ${w.word}. ${w.meaning}。${w.example ? " " + w.example : ""}`).join("\n\n") } });
      }
    }
    return list;
  }

  /* ---------- 播放 ---------- */
  function ensureAudio() {
    if (P.au) return P.au;
    const a = new Audio(); a.preload = "auto"; P.au = a;
    a.addEventListener("ended", () => { if (!a.src.startsWith("data:")) go(P.i + 1); });
    a.addEventListener("play", () => { P.playing = true; paint(); ms("playing"); });
    a.addEventListener("pause", () => { P.playing = false; paint(); ms("paused"); });
    a.addEventListener("error", () => { if (a.src && !a.src.startsWith("data:") && P.list.length) setTimeout(() => go(P.i + 1), 300); });
    return a;
  }
  const ms = st => { try { navigator.mediaSession.playbackState = st; } catch (_) {} };
  function meta() {
    if (!("mediaSession" in navigator)) return; const it = P.list[P.i]; if (!it) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: it.label.replace(/^\S+\s/, ""), artist: `${P.opt.name || "多益通勤純聽"} ${P.i + 1}/${P.list.length}`, album: "序光計畫" });
      navigator.mediaSession.setActionHandler("play", () => P.au && P.au.play());
      navigator.mediaSession.setActionHandler("pause", () => P.au && P.au.pause());
      navigator.mediaSession.setActionHandler("nexttrack", () => go(P.i + 1));
      navigator.mediaSession.setActionHandler("previoustrack", () => go(Math.max(0, P.i - 1)));
      navigator.mediaSession.setActionHandler("seekbackward", () => { if (P.au) P.au.currentTime = Math.max(0, P.au.currentTime - 10); });
    } catch (_) {}
  }
  /* 內建語音：一行一行念，中文行用中文語音 */
  function speakLocal(text) {
    const segs = String(text || "").split(/\n+/).map(l => l.replace(/^(Man|Woman):\s*/, "").trim()).filter(Boolean)
      .flatMap(l => l.split(/([\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]+[^A-Za-z]*)/)).map(x => x.trim()).filter(x => /[A-Za-z\u4e00-\u9fff]/.test(x));
    return segs.reduce((pr, l) => pr.then(() => new Promise(res => {
      if (!P.bar) return res();
      try { const u = new SpeechSynthesisUtterance(l); u.lang = /[\u4e00-\u9fff]/.test(l) ? "zh-TW" : "en-US"; u.rate = 0.95 * P.rate; u.onend = res; u.onerror = res; speechSynthesis.speak(u); } catch (_) { res(); }
    })), Promise.resolve());
  }
  let seq = 0;
  async function go(i) {
    const a = ensureAudio(), my = ++seq;
    if (i >= P.list.length) { P.i = P.list.length; P.playing = false; paint(); toast(P.opt.endMsg || "🚇 今天的通勤清單聽完了！"); ms("none"); return; }
    P.i = i; paint("load"); meta();
    try {
      const u = await urlOf(P.list[i]); if (my !== seq) return;
      a.src = u; a.playbackRate = P.rate; await a.play();
    } catch (e) {
      if (my !== seq) return;
      /* AI 語音暫時不能用（例如額度用完）：改用手機內建語音念，但要保持螢幕開著 */
      if (!P.warned) { P.warned = true; toast("AI 語音暫時不能用，先改用手機內建語音（這時要保持螢幕開著）"); }
      P.list[i].fallback = true; P.playing = true; paint();
      if (P.list[i].silence) await new Promise(r => setTimeout(r, P.list[i].silence * 1000 / P.rate)); else await speakLocal(P.list[i].body.text);
      if (my === seq) go(i + 1); return;
    }
    /* 預先準備後面幾首，播完就能接著放 */
    P.list.slice(i + 1, i + 5).forEach(n => urlOf(n).catch(() => {}));
  }

  /* ---------- 底部播放列 ---------- */
  function paint(state) {
    const b = P.bar; if (!b) return; const it = P.list[P.i], n = P.list.length, fin = P.i >= n;
    b.querySelector(".cm-t").innerHTML = fin ? "✅ 聽完了" : `${state === "load" ? "⏳ " : ""}${esc(it.label)}${it.words ? `<small>${esc(it.words)}</small>` : ""}`;
    const mk = b.querySelector("[data-cm=mark]"); if (mk) { mk.hidden = !(P.opt.onMark && it && it.card); mk.textContent = it && it.card && it.card._marked ? "✓" : "😵"; }
    b.querySelector(".cm-n").textContent = `${Math.min(P.i + 1, n)}/${n}`;
    b.querySelector("[data-cm=play]").textContent = P.playing ? "⏸" : "▶️";
    b.querySelector(".cm-p i").style.width = (Math.min(P.i, n) / Math.max(1, n) * 100) + "%";
    b.querySelector("[data-cm=rate]").textContent = P.rate + "x";
    const ul = b.querySelector(".cm-list"); if (ul && !ul.hidden) ul.innerHTML = P.list.map((x, k) => `<li class="${k === P.i ? "on" : ""} ${x.bad ? "bad" : ""}" data-go="${k}">${esc(x.label)}${x.fallback ? "（手機內建語音）" : ""}</li>`).join("");
  }
  /* open()：多益通勤清單；open(builder, opt)：別的功能自己給清單（例如 🧠 複習系統的「聽著複習」）
     opt：{ icon, name, emptyMsg, startMsg, endMsg, onMark(card) } */
  async function open(builder, opt) {
    if (!hasDb()) return toast("請先登入");
    if (typeof builder !== "function") { builder = build; opt = {}; }
    P.opt = opt || {}; if (P.bar) { seq++; try { speechSynthesis.cancel(); } catch (_) {} if (P.au) P.au.pause(); P.bar.remove(); P.bar = null; }
    if (!P.bar) {
      const b = document.createElement("div"); b.className = "tc-cm"; P.bar = b;
      b.innerHTML = `<div class="cm-p"><i></i></div><div class="cm-row"><span class="cm-ic">${P.opt.icon || "🚇"}</span><div class="cm-t">準備清單中…</div><span class="cm-n"></span>
        <button type="button" data-cm="mark" title="這張不熟，等一下複習時再出現" hidden>😵</button><button type="button" data-cm="prev" title="上一首">⏮</button><button type="button" data-cm="play">▶️</button><button type="button" data-cm="next" title="下一首">⏭</button>
        <button type="button" data-cm="rate" title="語速">1x</button><button type="button" data-cm="list" title="清單">☰</button><button type="button" data-cm="x" title="關閉">✕</button></div><ul class="cm-list" hidden></ul>`;
      b.addEventListener("click", e => {
        const c = e.target.closest("[data-cm]"), g = e.target.closest("[data-go]");
        if (g) return go(Number(g.dataset.go));
        if (!c) return; const k = c.dataset.cm, a = ensureAudio();
        if (k === "play" && P.list[P.i] && P.list[P.i].fallback) { try { if (speechSynthesis.paused) { speechSynthesis.resume(); P.playing = true; } else { speechSynthesis.pause(); P.playing = false; } } catch (_) {} return paint(); }
        if (k === "play") { if (P.i >= P.list.length) return go(0); if (!a.src) return go(P.i); a.paused ? a.play() : a.pause(); }
        if (k === "mark") { const it = P.list[P.i]; if (it && it.card && !it.card._marked && P.opt.onMark) { it.card._marked = true; P.opt.onMark(it.card); toast("😵 記下來了，下次複習會先出這張"); paint(); } return; }
        if (k === "next") go(P.i + 1);
        if (k === "prev") go(Math.max(0, P.i - 1));
        if (k === "rate") { P.rate = P.rate === 1 ? 0.85 : P.rate === 0.85 ? 1.15 : 1; a.playbackRate = P.rate; try { localStorage.setItem("tcCommuteRate", P.rate); } catch (_) {} paint(); }
        if (k === "list") { const ul = b.querySelector(".cm-list"); ul.hidden = !ul.hidden; paint(); }
        if (k === "x") { seq++; try { speechSynthesis.cancel(); } catch (_) {} a.pause(); a.removeAttribute("src"); b.remove(); P.bar = null; P.list = []; ms("none"); }
      });
      document.body.appendChild(b);
    }
    /* 這次點擊就先「解鎖」播放器，之後換歌才不會被瀏覽器擋 */
    const a = ensureAudio(); try { a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="; a.play().catch(() => {}); } catch (_) {}
    P.list = await builder(); P.i = 0; P.warned = false;
    if (!P.list.length) { P.bar.querySelector(".cm-t").textContent = P.opt.emptyMsg || "今天沒有可以聽的內容：先做幾題或加入單字吧"; return; }
    toast(P.opt.startMsg ? P.opt.startMsg(P.list) : `🚇 通勤清單 ${P.list.length} 首：可以關螢幕，用耳機按鍵切下一首`);
    go(0);
  }
  window.ToeicCommute = { open: () => open() };
  window.Commute = { open };

  const css = document.createElement("style");
  css.textContent = `
    .tc-cm { position: fixed; left: 8px; right: 8px; bottom: calc(8px + env(safe-area-inset-bottom)); z-index: 9000; max-width: 560px; margin: 0 auto; border-radius: 16px; background: #1b2033; color: #eef; box-shadow: 0 8px 30px rgba(0,0,0,.35); border: 1px solid rgba(124,92,255,.4); overflow: hidden; }
    .cm-p { height: 3px; background: rgba(127,127,127,.2); } .cm-p i { display: block; height: 100%; background: linear-gradient(90deg, #7c5cff, #3fb950); transition: width .3s; }
    .cm-row { display: flex; align-items: center; gap: 4px; padding: 8px 8px; } .cm-ic { font-size: 20px; }
    .cm-t { flex: 1; min-width: 0; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .cm-t small { display: block; font-weight: 400; font-size: 11px; opacity: .6; overflow: hidden; text-overflow: ellipsis; }
    .cm-n { font-size: 11px; opacity: .6; margin-right: 2px; }
    .cm-row button { font: inherit; font-size: 16px; border: 0; background: rgba(127,127,127,.12); color: inherit; border-radius: 10px; min-width: 34px; height: 34px; cursor: pointer; padding: 0 6px; } .cm-row button[data-cm=rate] { font-size: 11.5px; } .cm-row button[data-cm=play] { background: #7c5cff; color: #fff; } .cm-row button[hidden] { display: none; }
    .cm-list { list-style: none; margin: 0; padding: 0 8px 8px; max-height: 40vh; overflow: auto; font-size: 13px; } .cm-list li { padding: 7px 6px; border-radius: 8px; cursor: pointer; } .cm-list li.on { background: rgba(124,92,255,.18); font-weight: 600; } .cm-list li.bad { opacity: .45; }`;
  document.head.appendChild(css);
})();
