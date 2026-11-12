// 🧠 複習系統：把導入的資料（文字、PDF、圖片）整理成「由簡單到難」的知識點，再做成各種形式的題卡
import { createClient } from "jsr:@supabase/supabase-js@2";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const KEY = () => Deno.env.get("GEMINI_API_KEY") || "";
const MODEL = "gemini-3.8-flash";
const G = "https://generativelanguage.googleapis.com/v1beta";

async function gemini(sys: string, parts: unknown[], schema?: unknown, temp = 0.5) {
  let r: Response | null = null;
  for (let i = 0; i < 3; i++) {
    if (i) await new Promise(ok => setTimeout(ok, 2500 * i + Math.random() * 1500));
    r = await fetch(`${G}/models/${MODEL}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY() },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts }], generationConfig: schema ? { responseMimeType: "application/json", responseSchema: schema, temperature: temp } : { temperature: temp } }) });
    if (r.ok || !(r.status === 429 || r.status >= 500)) break;
    console.error("Gemini retry", r.status);
  }
  if (!r || !r.ok) { console.error("Gemini", r?.status, (await r?.text())?.slice(0, 500)); throw new Error(r?.status === 429 ? "AI 今天的免費額度用完了（429），大約下午 4 點會恢復" : `AI 服務暫時出錯（${r?.status}），請稍後再試`); }
  const p: any = await r.json();
  const t = (p?.candidates?.[0]?.content?.parts ?? []).filter((x: any) => !x.thought).map((x: any) => x.text ?? "").join("");
  return schema ? JSON.parse(t) : t;
}
const STR = { type: "STRING" }, INT = { type: "INTEGER" }, NUM = { type: "NUMBER" }, BOOL = { type: "BOOLEAN" };
const ARR = (it: unknown) => ({ type: "ARRAY", items: it }), OBJ = (p: Record<string, unknown>, req: string[]) => ({ type: "OBJECT", properties: p, required: req });

/* ---------- ① 整理大綱：拆成知識點，由簡單到難 ---------- */
const LEVELS = "1＝認識（名詞、定義、基本事實）、2＝理解（為什麼、原理、用自己的話說）、3＝比較（和相似觀念的差異、關係、分類）、4＝應用（套到情境、計算、步驟、判斷）、5＝綜合（整合多個觀念、評估、設計、推理）";
async function outline(b: any) {
  const n = Math.max(6, Math.min(30, Number(b.n) || 18));
  const sys = `你是很會教書的家教，學生是台灣資管系大學生，他學東西最有效的方式是「先聽生活比喻、再看規則」「一次一小塊」「學完馬上小測驗」。
把使用者給的資料整理成大約 ${n} 個「知識點」，用繁體中文（專有名詞保留英文原文，例如 Stack（堆疊））。
要求：
- 依「由簡單到難」排序：先基礎名詞，再原理，再比較，最後應用與綜合。每個知識點標 level：${LEVELS}。
- section：所屬章節或主題（同一章的知識點用同一個 section 名稱，最多 6 個 section）。
- title：知識點名稱（短）。
- summary：重點說明 2～5 句，具體、正確，可以有小例子；程式或公式用 \`反引號\` 包起來。
- analogy：一個貼近生活的比喻（台灣大學生熟悉的情境），1～2 句，要真的對應到觀念的關鍵特性。
- key_terms：2～5 個關鍵詞。
- excerpt：從原始資料摘錄或整理和這個知識點有關的內容（最多 600 字），之後出題只會看這段，所以要把出題需要的細節放進來（定義、數字、步驟、例子）。
- 只根據資料內容，不要編造資料裡沒有的事實；資料有錯字或排版亂可以修正。
另外給整份資料一個 title（如果使用者沒給）、subject（科目猜測）和 summary（3 句內的總覽）。`;
  const schema = OBJ({ title: STR, subject: STR, summary: STR, points: ARR(OBJ({ section: STR, title: STR, level: INT, summary: STR, analogy: STR, key_terms: ARR(STR), excerpt: STR }, ["section", "title", "level", "summary", "analogy", "key_terms", "excerpt"])) }, ["title", "subject", "summary", "points"]);
  const parts: unknown[] = [];
  for (const f of (b.files || []).slice(0, 12)) parts.push({ inlineData: { mimeType: String(f.mime), data: String(f.data) } });
  parts.push({ text: `標題：${String(b.title || "（請你取）").slice(0, 100)}\n科目：${String(b.subject || "").slice(0, 30)}\n${b.text ? "資料內容：\n" + String(b.text).slice(0, 120000) : "資料在上面的檔案裡。"}` });
  const r = await gemini(sys, parts, schema, 0.4);
  r.points = (r.points || []).map((p: any) => ({ ...p, level: Math.max(1, Math.min(5, Number(p.level) || 1)) }));
  return r;
}

/* ---------- ② 每個知識點做成各種形式的題卡 ---------- */
const TYPES = `可以用的題型（type）與欄位：
- flash 問答卡：q（問題）、a（答案，簡短）
- cloze 填空：text（一段話，把關鍵詞用 {{ }} 包起來，1～3 個空格，例如「Stack 是 {{後進先出}} 的結構」）
- mcq 選擇題：q、o（4 個選項）、ans（正解索引 0-3）、why（為什麼對、其他為什麼錯）
- tf 是非題：s（一句敘述）、t（true/false）、why（錯的話要說正確是什麼）
- match 配對：q（說明）、pairs（3～5 組 {l, r}，左邊名詞、右邊說明）
- order 排順序：q（例如「依序排出 Dijkstra 的步驟」）、items（正確順序的 3～6 個步驟）
- analogy 比喻題：analogy（生活比喻）、o（4 個觀念名稱）、ans（正解索引）、why
- compare 比較表：q、cols（2～3 個被比較的東西）、rows（2～5 列 {d: 比較面向, v: [每個東西在這面向的內容]}）
- short 簡答：q（需要說明或推理的問題）、points（標準答案的 2～4 個得分重點）、model（參考答案 2～4 句）`;
async function cards(b: any) {
  const pts = (b.points || []).slice(0, 6);
  const sys = `你是出題很用心的老師，學生是台灣大學生，用繁體中文出題（專有名詞可保留英文）。為每個知識點做 4～6 張題卡，難度要跟知識點的 level 搭配，並由簡單到難：
- 每個知識點都要有 level 1～2 的卡（flash、cloze、tf、analogy 其中幾種）讓他先記住。
- level 3 的知識點加 compare 或 match；level 4 加情境 mcq 或 order（有步驟、流程、演算法時一定要有 order）；level 5 加 short。
- 每張卡標自己的 level（1～5）和 point（知識點的索引，從 0 開始）。
- 題目只根據提供的內容，答案要正確、唯一；選擇題的錯誤選項要「看起來合理但明確是錯的」。
- 題目要短、好讀，一張卡只考一件事。
${TYPES}`;
  const schema = OBJ({ cards: ARR(OBJ({ point: INT, type: STR, level: INT, q: STR, a: STR, text: STR, o: ARR(STR), ans: INT, why: STR, s: STR, t: BOOL,
    pairs: ARR(OBJ({ l: STR, r: STR }, ["l", "r"])), items: ARR(STR), analogy: STR, cols: ARR(STR), rows: ARR(OBJ({ d: STR, v: ARR(STR) }, ["d", "v"])), points: ARR(STR), model: STR }, ["point", "type", "level"])) }, ["cards"]);
  const user = `科目：${String(b.subject || "").slice(0, 30)}　資料：${String(b.title || "").slice(0, 100)}\n\n` + pts.map((p: any, i: number) =>
    `【知識點 ${i}】${p.title}（level ${p.level}）\n重點：${p.summary}\n比喻：${p.analogy}\n關鍵詞：${(p.key_terms || []).join("、")}\n原始內容：${String(p.excerpt || "").slice(0, 1500)}`).join("\n\n");
  const r = await gemini(sys, [{ text: user }], schema, 0.6);
  const ok = (c: any) => {
    const has = (k: string) => c[k] != null && c[k] !== "";
    switch (c.type) {
      case "flash": return has("q") && has("a");
      case "cloze": return has("text") && /\{\{.+?\}\}/.test(c.text);
      case "mcq": case "analogy": return (c.type === "mcq" ? has("q") : has("analogy")) && Array.isArray(c.o) && c.o.length >= 3 && c.ans >= 0 && c.ans < c.o.length;
      case "tf": return has("s") && typeof c.t === "boolean";
      case "match": return Array.isArray(c.pairs) && c.pairs.length >= 2;
      case "order": return Array.isArray(c.items) && c.items.length >= 3;
      case "compare": return Array.isArray(c.cols) && c.cols.length >= 2 && Array.isArray(c.rows) && c.rows.length >= 1 && c.rows.every((x: any) => Array.isArray(x.v) && x.v.length === c.cols.length);
      case "short": return has("q") && Array.isArray(c.points) && c.points.length >= 1;
    }
    return false;
  };
  const out = (r.cards || []).filter((c: any) => c.point >= 0 && c.point < pts.length && ok(c)).map((c: any) => {
    const { point, type, level, ...rest } = c; const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) data[k] = v;
    return { point_id: pts[point].id, type, level: Math.max(1, Math.min(5, Number(level) || 1)), data };
  });
  return { cards: out, dropped: (r.cards || []).length - out.length };
}

/* ---------- ③ 簡答題 AI 批改 ---------- */
async function grade(b: any) {
  const sys = `你是親切但嚴格的老師，用繁體中文批改學生的簡答。依照得分重點給 0～100 分，feedback 2～3 句：先說他答對了什麼，再具體說漏了或錯了什麼。`;
  return await gemini(sys, [{ text: JSON.stringify({ 題目: b.q, 得分重點: b.points, 參考答案: b.model, 學生答案: String(b.answer || "").slice(0, 2000) }) }], OBJ({ score: INT, feedback: STR }, ["score", "feedback"]), 0.2);
}
/* ---------- ④ 換個方式再講一次 ---------- */
async function explain(b: any) {
  const sys = `你是很會教書的家教，學生是台灣大學生，聽不懂時需要「換一個比喻」。用繁體中文、口語，180 字內：先給一個新的生活比喻（和原本的不同），再用 2～3 句把觀念講清楚，最後給一個「一句話記憶法」。不要用 markdown 標題。`;
  return { text: await gemini(sys, [{ text: JSON.stringify({ 知識點: b.title, 重點: b.summary, 原本的比喻: b.analogy, 原始內容: String(b.excerpt || "").slice(0, 1500) }) }], undefined, 0.8) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!KEY()) return j({ error: "伺服器尚未設定 GEMINI_API_KEY" }, 500);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await sb.auth.getUser(); if (!u?.user) return j({ error: "請先登入" }, 401);
    const b = await req.json();
    if (b.action === "outline") return j(await outline(b));
    if (b.action === "cards") return j(await cards(b));
    if (b.action === "grade") return j(await grade(b));
    if (b.action === "explain") return j(await explain(b));
    return j({ error: "unknown action" }, 400);
  } catch (e) { return j({ error: String((e as Error).message || e) }, 500); }
});
