/* 📐 序光格式：不用 AI 也能做出完整題卡的固定格式
   ‧ 自己照格式寫，或把「AI 提示詞」貼到任何免費的 AI 聊天（ChatGPT、Claude、Gemini App…）連同講義／照片，讓它輸出這個格式再貼回來
   ‧ 也支援兩欄表格（Excel／Google 試算表複製、Quizlet 匯出、「名詞<Tab>解釋」）
   ‧ 匯出：任何一份資料都能匯出成這個格式，可以修改後重新匯入、分享給別人
   給 kb.js 用：window.KBFormat = { isFormat, isTable, parse, tableToText, exportText, EXAMPLE, PROMPT } */
(function () {
  const DEF_LV = { flash: 1, cloze: 1, tf: 1, mcq: 2, analogy: 2, match: 3, compare: 3, order: 4, short: 5 };
  const N = s => String(s || "").replace(/：/g, ":").replace(/｜/g, "|").replace(/　/g, " ");
  const KEY = /^(Q|問|問題|A|答|答案|填空|選擇|是非|配對|排序|排順序|比喻題|比較|簡答|解析|參考|參考答案)\s*(?:\|\s*L?([1-5]))?\s*:\s*(.*)$/i;
  const FIELD = /^(重點|說明|比喻|關鍵詞|關鍵字|原文)\s*:\s*(.*)$/;
  const TRUE = /\s*(?:⭕|○|✓|✔|[(（]\s*(?:O|對|是|T)\s*[)）]|\s(?:O|T|True))\s*$/, FALSE = /\s*(?:❌|✗|✘|[(（]\s*(?:X|錯|否|F)\s*[)）]|\s(?:X|F|False))\s*$/;
  const MARK = /\s*(?:✓|✔|\(\*\)|（\*）|←\s*正解|\[正解\]|（正解）|\(正解\))\s*$/;

  function isFormat(t) { const s = N(t); return /^###\s+\S/m.test(s) && (/^(Q|問|填空|選擇|是非|配對|排序|比喻題|比較|簡答)\s*(\|\s*L?[1-5])?\s*:/m.test(s) || /^重點\s*:/m.test(s)); }
  function isTable(t) {
    const ls = String(t || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean); if (ls.length < 3) return false;
    return ls.filter(l => l.split("\t").length === 2 && l.split("\t").every(c => c.trim())).length / ls.length >= 0.7;
  }
  /* 兩欄表格 → 「名詞：解釋」，交給快速模式 */
  const tableToText = t => String(t).split(/\r?\n/).map(l => { const c = l.split("\t"); return c.length >= 2 ? `${c[0].trim()}：${c.slice(1).join(" ").trim()}` : l; }).join("\n");

  function parse(text) {
    const out = { subject: "", title: "", points: [], warn: [] }; let sec = "", pt = null, card = null, lastField = null;
    const newPoint = (title, lv) => { pt = { section: sec || "重點", title: title.slice(0, 60), level: lv || 0, summary: "", analogy: "", key_terms: [], excerpt: "", cards: [] }; out.points.push(pt); card = null; lastField = null; };
    const ensure = () => { if (!pt) newPoint(sec || out.title || "重點"); };
    const add = (type, lv, data) => { ensure(); card = { type, level: lv ? Number(lv) : 0, data }; pt.cards.push(card); lastField = null; return card; };
    String(text || "").replace(/\r/g, "").split("\n").forEach((raw, no) => {
      const l = N(raw).trim(); if (!l) return;
      let m;
      if ((m = /^#\s*科目\s*:\s*(.+)$/.exec(l))) { out.subject = m[1].trim(); return; }
      if ((m = /^#\s*標題\s*:\s*(.+)$/.exec(l))) { out.title = m[1].trim(); return; }
      if ((m = /^###\s*(.+?)\s*(?:\|\s*L?([1-5]))?\s*$/.exec(l))) { newPoint(m[1].trim(), Number(m[2]) || 0); return; }
      if ((m = /^##\s*(?:章節\s*:)?\s*(.+)$/.exec(l))) { sec = m[1].trim(); pt = null; card = null; return; }
      if (/^#\s/.test(l)) { if (!out.title) out.title = l.replace(/^#\s*/, ""); return; }
      if ((m = FIELD.exec(l)) && pt && !card) {
        const k = m[1], v = m[2].trim();
        if (k === "重點" || k === "說明") { pt.summary += (pt.summary ? "\n" : "") + v; lastField = "summary"; }
        else if (k === "比喻") { pt.analogy = v; lastField = "analogy"; }
        else if (k === "原文") { pt.excerpt = v; lastField = "excerpt"; }
        else pt.key_terms = v.split(/[,，、;；]/).map(x => x.trim()).filter(Boolean).slice(0, 8);
        return;
      }
      if ((m = KEY.exec(l))) {
        const k = m[1].toLowerCase(), lv = m[2], v = m[3].trim();
        if (k === "q" || k === "問" || k === "問題") return void add("flash", lv, { q: v, a: "" });
        if (k === "a" || k === "答" || k === "答案") { if (card && card.type === "flash") { card.data.a = v; lastField = "a"; } else out.warn.push(`第 ${no + 1} 行：「答」前面要先有「Q」`); return; }
        if (k === "填空") { if (!/\{\{.+?\}\}/.test(v)) out.warn.push(`第 ${no + 1} 行：填空要用 {{ }} 把答案包起來`); return void add("cloze", lv, { text: v }); }
        if (k === "選擇") return void add("mcq", lv, { q: v, o: [], ans: -1 });
        if (k === "是非") { const t = TRUE.test(v) ? true : FALSE.test(v) ? false : null; if (t === null) out.warn.push(`第 ${no + 1} 行：是非題最後要標 ⭕ 或 ❌`); return void add("tf", lv, { s: v.replace(TRUE, "").replace(FALSE, "").trim(), t }); }
        if (k === "配對") { const c = add("match", lv, { q: "", pairs: [] }); v.split("|").forEach(x => pair(c, x)); if (!c.data.pairs.length) c.data.q = v; return; }
        if (k === "排序" || k === "排順序") { const items = v.split(/\s*(?:>|→|➜|->)\s*/).map(x => x.trim()).filter(Boolean); return void add("order", lv, items.length >= 2 ? { q: "", items } : { q: v, items: [] }); }
        if (k === "比喻題") { const [a, rest] = v.split(/\s*(?:=>|⇒|→)\s*/); const o = (rest || "").split("|").map(x => x.trim()).filter(Boolean); return void add("analogy", lv, { analogy: (a || "").trim(), o, ans: 0 }); }
        if (k === "比較") { const cols = v.split(/\s*(?:\bvs\.?\b|VS|\|)\s*/i).map(x => x.trim()).filter(Boolean); return void add("compare", lv, { q: `比較 ${cols.join(" 和 ")}`, cols, rows: [] }); }
        if (k === "簡答") return void add("short", lv, { q: v, points: [], model: "" });
        if (k === "解析") { if (card) { card.data.why = v; lastField = "why"; } return; }
        if (k.startsWith("參考")) { if (card && card.type === "short") { card.data.model = v; lastField = "model"; } return; }
      }
      if ((m = /^(?:[-*•‧·]|\d{1,2}[.)、])\s*(.+)$/.exec(l))) {
        const v = m[1].trim();
        if (card) {
          const d = card.data;
          if (card.type === "mcq") { const ok = MARK.test(v); d.o.push(v.replace(MARK, "").trim()); if (ok) d.ans = d.o.length - 1; return; }
          if (card.type === "match") return void pair(card, v);
          if (card.type === "order") return void d.items.push(v);
          if (card.type === "analogy") { const ok = MARK.test(v); d.o.push(v.replace(MARK, "").trim()); if (ok) d.ans = d.o.length - 1; return; }
          if (card.type === "compare") { const c = v.split("|").map(x => x.trim()); if (c.length >= 2) d.rows.push({ d: c[0], v: c.slice(1) }); return; }
          if (card.type === "short") return void d.points.push(v);
          if (card.type === "flash") { d.a += (d.a ? "\n" : "") + "• " + v; return; }
        }
        if (pt) { pt.summary += (pt.summary ? "\n" : "") + "• " + v; return; }
      }
      /* 接續上一行（多行的答案、重點、參考答案） */
      if (card && lastField && card.data[lastField] != null) { card.data[lastField] += "\n" + l; return; }
      if (card && card.type === "flash" && card.data.a) { card.data.a += "\n" + l; return; }
      if (pt && lastField && !card) { pt[lastField] += "\n" + l; return; }
      if (pt && !card) { pt.summary += (pt.summary ? "\n" : "") + l; return; }
      out.warn.push(`第 ${no + 1} 行看不懂，略過：${l.slice(0, 20)}`);
    });
    function pair(c, x) { const p = x.split(/\s*(?:=|→|->|⇒|:)\s*/); if (p.length >= 2 && p[0].trim() && p[1].trim()) c.data.pairs.push({ l: p[0].trim(), r: p.slice(1).join(" ").trim() }); }
    /* 檢查、補上預設值 */
    out.points.forEach(p => {
      p.cards = p.cards.filter(c => {
        const d = c.data; c.level = c.level || DEF_LV[c.type] || 1;
        if (c.type === "flash") return d.q && d.a;
        if (c.type === "cloze") return /\{\{.+?\}\}/.test(d.text || "");
        if (c.type === "mcq") return d.q && d.o.length >= 2 && d.ans >= 0;
        if (c.type === "analogy") return d.analogy && d.o.length >= 2 && d.ans >= 0;
        if (c.type === "tf") return d.s && typeof d.t === "boolean";
        if (c.type === "match") { if (!d.q) d.q = "把左右配成一對"; return d.pairs.length >= 2; }
        if (c.type === "order") { if (!d.q) d.q = `依序排出「${p.title}」的步驟`; return d.items.length >= 2; }
        if (c.type === "compare") return d.cols.length >= 2 && d.rows.length && d.rows.every(r => r.v.length === d.cols.length);
        if (c.type === "short") return d.q && d.points.length;
        return false;
      });
      if (!p.level) p.level = p.cards.length ? Math.round(p.cards.reduce((a, c) => a + c.level, 0) / p.cards.length) : 1;
      if (!p.summary) p.summary = p.cards.map(c => c.data.a || c.data.why || c.data.model || "").filter(Boolean)[0] || p.title;
      if (!p.excerpt) p.excerpt = p.summary;
    });
    out.points = out.points.filter(p => p.cards.length || p.summary);
    return out;
  }

  /* 匯出：一份資料 → 序光格式文字 */
  function exportText(src, points, cardsOf) {
    const L = [`# 科目：${src.subject}`, `# 標題：${src.title}`, ""]; let sec = null;
    points.forEach(p => {
      if (p.section !== sec) { sec = p.section; L.push(`## ${sec || "重點"}`, ""); }
      L.push(`### ${p.title}｜L${p.level}`);
      if (p.summary) L.push(`重點：${p.summary.replace(/\n/g, "\n")}`);
      if (p.analogy) L.push(`比喻：${p.analogy}`);
      if ((p.key_terms || []).length) L.push(`關鍵詞：${p.key_terms.join("、")}`);
      cardsOf(p.id).forEach(c => {
        const d = c.data, lv = `｜L${c.level}`, why = d.why ? [`解析：${d.why}`] : [];
        if (c.type === "flash") L.push(`Q${lv}：${d.q}`, `A：${d.a}`);
        if (c.type === "cloze") L.push(`填空${lv}：${d.text}`);
        if (c.type === "mcq") L.push(`選擇${lv}：${d.q}`, ...d.o.map((o, i) => `- ${o}${i === d.ans ? " ✓" : ""}`), ...why);
        if (c.type === "tf") L.push(`是非${lv}：${d.s} ${d.t ? "⭕" : "❌"}`, ...why);
        if (c.type === "match") L.push(`配對${lv}：${d.q || ""}`, ...d.pairs.map(x => `- ${x.l} = ${x.r}`));
        if (c.type === "order") L.push(`排序${lv}：${d.q || ""}`, ...d.items.map((x, i) => `${i + 1}. ${x}`));
        if (c.type === "analogy") L.push(`比喻題${lv}：${d.analogy}`, ...d.o.map((o, i) => `- ${o}${i === d.ans ? " ✓" : ""}`), ...why);
        if (c.type === "compare") L.push(`比較${lv}：${d.cols.join(" vs ")}`, ...d.rows.map(r => `- ${r.d} | ${r.v.join(" | ")}`));
        if (c.type === "short") L.push(`簡答${lv}：${d.q}`, ...d.points.map(x => `- ${x}`), ...(d.model ? [`參考：${d.model}`] : []));
      });
      L.push("");
    });
    return L.join("\n");
  }

  const EXAMPLE = `# 科目：資料結構
# 標題：第三章 堆疊與佇列

## 基本觀念

### Stack 堆疊｜L1
重點：後進先出（LIFO）的資料結構，只能從頂端放入（push）和取出（pop）。
比喻：像自助餐的盤子，最後放上去的最先被拿走。
關鍵詞：LIFO、push、pop
Q：Stack 的存取順序是什麼？
A：後進先出（LIFO）
填空：Stack 是 {{後進先出}} 的結構，放入叫 {{push}}
是非：Stack 可以直接拿出最底下的資料 ❌
解析：只能從頂端 pop
比喻題：疊在一起的自助餐盤子
- Stack ✓
- Queue
- Tree
- Graph

### Stack 和 Queue 的差別｜L3
重點：Stack 後進先出，Queue 先進先出。
配對：
- Stack = 後進先出
- Queue = 先進先出
- Deque = 兩端都能進出
比較：Stack vs Queue
- 順序 | LIFO | FIFO
- 放入 | push | enqueue
- 生活例子 | 疊盤子 | 排隊買票

## 應用

### 中序轉後序｜L4
重點：用一個運算子堆疊，依優先權決定何時輸出。
排序：由左到右讀運算式 > 運算元直接輸出 > 運算子和堆疊頂端比優先權 > 最後清空堆疊
選擇｜L4：中序 A+B*C 轉成後序是？
- ABC*+ ✓
- AB+C*
- +A*BC
- ABC+*
解析：* 優先權比 + 高，所以 B*C 先算

### 為什麼遞迴要用 Stack｜L5
簡答：為什麼函式呼叫（遞迴）要用 Stack 管理？
- 要記住每一層「回來的位置」
- 後呼叫的函式會先結束（後進先出）
參考：每呼叫一次就把回來的位置 push 進去，函式結束時 pop 出來回到上一層，順序剛好是後進先出。`;

  const PROMPT = `請幫我把下面（或附件）的學習資料，整理成「序光格式」複習題卡。規則：

1. 先把內容拆成 10～25 個知識點，由簡單到難排列，每個知識點標難度：
   L1 認識（名詞、定義）→ L2 理解（為什麼、原理）→ L3 比較（差異、分類）→ L4 應用（情境、步驟、計算）→ L5 綜合（整合、推理）
2. 每個知識點都要有：重點（2～4 句）、比喻（一個台灣大學生熟悉的生活比喻）、關鍵詞。
3. 每個知識點出 3～6 張題卡，混合以下題型，簡單的知識點多用問答／填空／是非，難的用比較／排序／應用選擇題／簡答。
4. 只根據資料內容出題，答案要正確、唯一。用繁體中文，專有名詞可保留英文。
5. 只輸出格式內容，不要其他說明，不要用程式碼區塊包起來。

格式（照抄符號；「｜L數字」可省略）：
# 科目：科目名稱
# 標題：這份資料的標題
## 章節名稱
### 知識點名稱｜L1
重點：……
比喻：……
關鍵詞：詞1、詞2
Q：問題
A：答案
填空：句子裡把答案用 {{答案}} 包起來
是非：一句敘述 ⭕（對）或 ❌（錯）
解析：為什麼
選擇｜L2：題目
- 選項一 ✓（正解後面加 ✓）
- 選項二
- 選項三
- 選項四
解析：為什麼
比喻題：一個生活比喻
- 正確的觀念 ✓
- 別的觀念
- 別的觀念
- 別的觀念
配對：
- 名詞 = 解釋
- 名詞 = 解釋
- 名詞 = 解釋
排序：步驟一 > 步驟二 > 步驟三 > 步驟四
比較：A vs B
- 比較面向 | A 的內容 | B 的內容
- 比較面向 | A 的內容 | B 的內容
簡答：需要說明的問題
- 得分重點一
- 得分重點二
參考：參考答案

範例：
${EXAMPLE}

我的資料：
`;
  window.KBFormat = { isFormat, isTable, parse, tableToText, exportText, EXAMPLE, PROMPT };
})();
