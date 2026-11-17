/* 📝 錯題總本（專注 → 📝 錯題本）：多益、複習題卡、單字三邊的錯題集中在一頁，依「錯最多次」排序
   只讀現有資料（toeic_answers、kb_cards.lapses、vocab_words.lapses），不用新的資料表 */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const plain = t => String(t == null ? "" : t).replace(/\{\{(.+?)\}\}/g, "$1").replace(/`/g, "");
  const W = { rows: null, tab: "all", err: null, open: {} };
  const SRC = { toeic: ["🎯 多益", "#7c5cff"], kb: ["🧠 複習", "#3fb950"], vocab: ["📖 單字", "#d29922"] };

  function kbText(c) { const d = c.data || {};
    const q = d.q || d.text && plain(d.text).replace(/\S/g, x => x) || d.s || d.analogy || (d.pairs || []).map(x => x.l).join("、") || "";
    const a = c.type === "flash" ? d.a : c.type === "cloze" ? (String(d.text).match(/\{\{(.+?)\}\}/g) || []).map(x => x.slice(2, -2)).join("、") : c.type === "tf" ? (d.t ? "⭕ 對" : "❌ 錯") + (d.why ? "：" + d.why : "")
      : c.type === "mcq" || c.type === "analogy" ? d.o[d.ans] + (d.why ? "：" + d.why : "") : c.type === "match" ? d.pairs.map(x => `${x.l} → ${x.r}`).join("；") : c.type === "order" ? d.items.map((x, i) => `${i + 1}. ${x}`).join(" ")
      : c.type === "compare" ? d.rows.map(r => `${r.d}：${r.v.join(" / ")}`).join("；") : c.type === "short" ? (d.points || []).join("；") : "";
    return [c.type === "cloze" ? String(d.text).replace(/\{\{.+?\}\}/g, "＿＿") : plain(q), plain(a)]; }

  async function load() { try { await load0(); } catch (e) { W.err = String(e.message || e); render(); } }
  async function load0() {
    if (!hasDb()) return; ensurePage();
    try { if (window.ToeicTest && window.ToeicTest.ensure) await window.ToeicTest.ensure(); } catch (_) {}
    const [ta, kc, kp, vw] = await Promise.all([
      db.from("toeic_answers").select("qid, part, tag, day").eq("correct", false).order("created_at", { ascending: false }).limit(5000),
      db.from("kb_cards").select("id, point_id, type, data, lapses, suspended").gt("lapses", 0).limit(2000),
      db.from("kb_points").select("id, title").limit(5000),
      db.from("vocab_words").select("id, word, meaning, example, lapses, deck").gt("lapses", 0).limit(2000)]);
    if (ta.error && kc.error && vw.error) { W.err = ta.error.message; return render(); }
    const rows = [], by = {};
    (ta.data || []).forEach(a => { const x = by[a.qid] = by[a.qid] || { n: 0, part: a.part, tag: a.tag, last: a.day }; x.n++; });
    const TS = window.ToeicSys;
    Object.entries(by).forEach(([qid, x]) => { const q = TS && TS.qById ? TS.qById(qid) : null; if (!q) return;
      rows.push({ src: "toeic", id: qid, n: x.n, q: (q.ctx ? "（閱讀／聽力題組）" : "") + q.q, a: `${q.o[q.a]}${q.zh ? "　" + q.zh : ""}${q.why ? "\n" + q.why : ""}`, sub: `Part ${x.part}・${TS.tagName ? TS.tagName(x.part, x.tag) : x.tag}`, last: x.last, ref: q }); });
    const pt = {}; (kp.data || []).forEach(p => { pt[p.id] = p.title; });
    (kc.data || []).filter(c => !c.suspended).forEach(c => { const [q, a] = kbText(c); rows.push({ src: "kb", id: c.id, n: c.lapses, q, a, sub: pt[c.point_id] || "" }); });
    (vw.data || []).forEach(w => rows.push({ src: "vocab", id: w.id, n: w.lapses, q: w.word, a: `${w.meaning || ""}${w.example ? "\n" + w.example : ""}`, sub: w.deck || "" }));
    rows.sort((a, b) => b.n - a.n);
    W.rows = rows; W.err = null; render();
  }

  function ensurePage() {
    let page = document.querySelector('.page[data-page="wrong"]');
    if (!page) { const c = document.querySelector("#app-section > .container"); if (!c) return null;
      page = document.createElement("div"); page.className = "page"; page.dataset.page = "wrong"; c.appendChild(page); page.innerHTML = `<div id="wr-root"><section class="card"><p class="tr-note">載入中…</p></section></div>`; }
    if (typeof PAGES !== "undefined" && Array.isArray(PAGES) && !PAGES.includes("wrong")) PAGES.push("wrong");
    return page;
  }
  function render() {
    const page = ensurePage(); if (!page) return; const root = page.querySelector("#wr-root");
    if (W.err) { root.innerHTML = `<section class="card"><h2>📝 錯題總本</h2><p class="tr-note">讀不到資料：${esc(W.err)}</p></section>`; return; }
    if (!W.rows) return;
    const cnt = k => W.rows.filter(r => r.src === k).length, list = W.rows.filter(r => W.tab === "all" || r.src === W.tab), show = list.slice(0, 80);
    const tabs = [["all", `全部 ${W.rows.length}`], ["toeic", `🎯 多益 ${cnt("toeic")}`], ["kb", `🧠 複習 ${cnt("kb")}`], ["vocab", `📖 單字 ${cnt("vocab")}`]];
    root.innerHTML = `<section class="card"><h2>📝 錯題總本</h2><p class="tr-note">多益答錯的題目、複習題卡按過「忘了」的、單字忘記過的，全部放在這裡，錯最多次的排最前面。點一列可以看答案。</p>
        <div class="tr-row wr-tabs">${tabs.map(([k, n]) => `<button type="button" class="tr-chip sm ${W.tab === k ? "on" : ""}" data-wr="tab" data-v="${k}">${n}</button>`).join("")}</div>
        <div class="tr-row">${cnt("toeic") ? `<button type="button" class="btn btn-small btn-primary" data-wr="drill-toeic">🎯 練錯最多的多益題（10）</button>` : ""}${cnt("kb") ? `<button type="button" class="btn btn-small btn-primary" data-wr="drill-kb">🧠 練錯最多的複習卡（10）</button>` : ""}</div>
        ${show.length ? show.map(r => { const k = r.src + ":" + r.id, op = W.open[k]; return `<div class="wr-row" data-wr="open" data-v="${esc(k)}"><div class="wr-h"><i style="background:${SRC[r.src][1]}">${SRC[r.src][0]}</i><b class="wr-n">✗ ${r.n}</b></div>
          <p class="wr-q">${esc(r.q)}</p>${r.sub ? `<small>${esc(r.sub)}</small>` : ""}${op ? `<p class="wr-a">${esc(r.a).replace(/\n/g, "<br>")}</p>` : ""}</div>`; }).join("") : `<p class="tr-note">${W.rows.length ? "這一類沒有錯題。" : "還沒有錯題紀錄 🎉 做一些多益題或複習卡之後，答錯的會出現在這裡。"}</p>`}
        ${list.length > show.length ? `<p class="tr-note">只顯示錯最多的前 ${show.length} 筆（共 ${list.length} 筆）。</p>` : ""}</section>`;
  }
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-wr]"); if (!b || !W.rows) return; const a = b.dataset.wr;
    if (a === "tab") { W.tab = b.dataset.v; return render(); }
    if (a === "open") { const k = b.dataset.v; W.open[k] = !W.open[k]; return render(); }
    if (a === "drill-toeic") { const qs = W.rows.filter(r => r.src === "toeic" && (r.ref.part === 2 || r.ref.part === 5 || r.ref.test)).slice(0, 10).map(r => r.ref);
      if (!qs.length || !window.ToeicSys) return toast("沒有可以練的多益錯題"); return window.ToeicSys.session("tag:wrong", qs, "📝 錯最多的多益題"); }
    if (a === "drill-kb") { if (!window.KB || !window.KB.drill) return toast("複習系統載入中，稍等一下"); await window.KB.load(); return window.KB.drill(W.rows.filter(r => r.src === "kb").slice(0, 10).map(r => r.id), "📝 錯最多的複習卡"); }
  });
  const st = document.createElement("style");
  st.textContent = `
    .wr-tabs { flex-wrap: wrap; margin-bottom: 8px; } .wr-row { padding: 9px 2px; border-top: 1px solid rgba(127,127,127,.15); cursor: pointer; }
    .wr-h { display: flex; justify-content: space-between; align-items: center; } .wr-h i { font-style: normal; font-size: 11px; color: #fff; padding: 1px 8px; border-radius: 999px; } .wr-n { color: #f85149; font-size: 13px; }
    .wr-q { margin: 5px 0 2px; font-size: 14px; line-height: 1.55; } .wr-row small { font-size: 11.5px; opacity: .6; } .wr-a { margin: 6px 0 0; padding: 8px 10px; border-radius: 10px; background: rgba(63,185,80,.1); font-size: 13.5px; line-height: 1.6; }`;
  document.head.appendChild(st);
  if (typeof window.applyPage === "function") { const base = window.applyPage; window.applyPage = function (name) { const r = base.apply(this, arguments); if (name === "wrong") setTimeout(load, 0); return r; }; }
  (function boot(n) { if (!hasDb()) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; } ensurePage(); })(0);
  window.WrongBook = { load };
})();
