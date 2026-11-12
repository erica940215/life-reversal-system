// 🎯 多益系統：AI 出題（附自我檢查）、AI 解析、AI 語音（Gemini TTS，存進 Storage 快取）
import { createClient } from "jsr:@supabase/supabase-js@2";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const KEY = () => Deno.env.get("GEMINI_API_KEY") || "";
const TEXT_MODEL = "gemini-3.8-flash";
const TTS_MODEL = Deno.env.get("TOEIC_TTS_MODEL") || "gemini-3.8-flash-tts";
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const G = "https://generativelanguage.googleapis.com/v1beta";

async function gemini(sys: string, user: string, schema?: unknown, temp = 0.7) {
  /* 忙線（429／5xx）就等一下再試，最後換備用模型 */
  let r: Response | null = null;
  for (const [i, model] of [TEXT_MODEL, TEXT_MODEL, "gemini-3.8-flash-lite"].entries()) {
    if (i) await new Promise(ok => setTimeout(ok, 1200 * i));
    r = await fetch(`${G}/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY() },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: schema ? { responseMimeType: "application/json", responseSchema: schema, temperature: temp } : { temperature: temp } }) });
    if (r.ok || !(r.status === 429 || r.status >= 500)) break;
  }
  if (!r || !r.ok) { console.error("Gemini", r?.status, await r?.text()); throw new Error(`AI 服務暫時出錯（${r?.status}），請稍後再試`); }
  const p: any = await r.json();
  const t = (p?.candidates?.[0]?.content?.parts ?? []).filter((x: any) => !x.thought).map((x: any) => x.text ?? "").join("");
  return schema ? JSON.parse(t) : t;
}

/* ---------- 語音 ---------- */
function wav(pcm: Uint8Array, rate = 24000) {
  const h = new ArrayBuffer(44), v = new DataView(h), w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, pcm.length, true);
  const o = new Uint8Array(44 + pcm.length); o.set(new Uint8Array(h), 0); o.set(pcm, 44); return o;
}
const VOICES: Record<string, [string, string]> = { // 代號 → [Gemini 聲音, 口音說明]
  us_m: ["Puck", "a natural American male voice"], us_f: ["Kore", "a natural American female voice"],
  uk_m: ["Charon", "a British male voice"], uk_f: ["Aoede", "a British female voice"],
  au_m: ["Fenrir", "an Australian male voice"], ca_f: ["Leda", "a Canadian female voice"]
};
async function tts(text: string, voice: string) {
  text = String(text || "").slice(0, 600); const vv = VOICES[voice] || VOICES.us_f;
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(TTS_MODEL + "|" + voice + "|" + text)))).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  const sb = admin(), path = `v1/${hash}.wav`, url = sb.storage.from("toeic-audio").getPublicUrl(path).data.publicUrl;
  const head = await fetch(url, { method: "HEAD" }); if (head.ok) return { url, cached: true };
  const r = await fetch(`${G}/models/${TTS_MODEL}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY() },
    body: JSON.stringify({ contents: [{ parts: [{ text: `Read this TOEIC listening test line clearly at a normal exam pace, in ${vv[1]}: ${text}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: vv[0] } } } } }) });
  if (!r.ok) { const t = await r.text(); console.error("TTS", r.status, t); throw new Error(`語音服務出錯（${r.status}）`); }
  const p: any = await r.json(), inl = p?.candidates?.[0]?.content?.parts?.find((x: any) => x.inlineData)?.inlineData, b64 = inl?.data;
  if (!b64) throw new Error("語音服務沒有回傳聲音");
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), isWav = /wav/.test(inl.mimeType || "") || (bytes[0] === 0x52 && bytes[1] === 0x49);
  const rate = Number(/rate=(\d+)/.exec(inl.mimeType || "")?.[1]) || 24000;
  const up = await sb.storage.from("toeic-audio").upload(path, isWav ? bytes : wav(bytes, rate), { contentType: "audio/wav", upsert: true });
  if (up.error) throw new Error(up.error.message);
  return { url, cached: false };
}

/* ---------- AI 解析 ---------- */
async function explain(b: any) {
  const sys = `你是很會教的多益老師，學生目前約 400 分、目標 650。用繁體中文，口語、簡短（150 字內）。
先用一句生活比喻或口訣幫他記，再說為什麼正解對、他選的為什麼錯，最後給一個「下次看到這種題目就這樣判斷」的步驟。不要用 markdown 標題。`;
  return { text: await gemini(sys, JSON.stringify(b).slice(0, 3000), undefined, 0.5) };
}

/* ---------- AI 出題（附自我檢查） ---------- */
const P5 = { type: "OBJECT", properties: { items: { type: "ARRAY", items: { type: "OBJECT", properties: {
  q: { type: "STRING" }, o: { type: "ARRAY", items: { type: "STRING" } }, a: { type: "INTEGER" }, zh: { type: "STRING" }, why: { type: "STRING" } }, required: ["q", "o", "a", "zh", "why"] } } }, required: ["items"] };
const P2 = P5;
async function gen(b: any, uid: string) {
  const part = b.part === 2 ? 2 : 5, tag = String(b.tag || "").slice(0, 20), n = Math.max(1, Math.min(10, Number(b.n) || 5)), avoid = (b.avoid || []).slice(0, 30).join(" | ").slice(0, 2500);
  const sys = part === 5
    ? `You write ORIGINAL TOEIC Part 5 (incomplete sentences) questions for a learner at about 400–650. Business/office contexts. Each item: one sentence with exactly one blank written as "-------", 4 options (o), index of the correct option (a, 0-3), Traditional Chinese translation of the full correct sentence (zh), and a short Traditional Chinese explanation (why) of the grammar point. Exactly one option must be correct; distractors must be clearly wrong for a teacher. Focus grammar point: ${tag}. Do not copy real ETS items.`
    : `You write ORIGINAL TOEIC Part 2 (question–response) items for a learner at about 400–650. Each item: a short spoken question or statement (q), three spoken responses (o), the index of the best response (a, 0-2), Traditional Chinese translation of the question (zh), and a short Traditional Chinese explanation (why). Use typical TOEIC traps: repeated words, similar sounds, answering a different WH-word. Correct answers are often indirect but natural. Focus type: ${tag}. Do not copy real ETS items.`;
  const out = await gen1(sys, `Write ${n} new items. Avoid repeating these: ${avoid}`, part === 5 ? P5 : P2);
  /* 自我檢查：另外請 AI 盲作答一次，答案不同的丟掉 */
  const chk = await gemini("You are a strict TOEIC answer checker. For each item, pick the single best option index. If two options could both be correct, answer -1.",
    JSON.stringify(out.map((x: any, i: number) => ({ i, q: x.q, o: x.o }))), { type: "OBJECT", properties: { ans: { type: "ARRAY", items: { type: "INTEGER" } } }, required: ["ans"] }, 0);
  const ok = out.filter((x: any, i: number) => chk.ans[i] === x.a && Array.isArray(x.o) && x.o.length === (part === 5 ? 4 : 3) && x.a >= 0 && x.a < x.o.length);
  const rows = ok.map((x: any) => ({ id: `ai${part}-${crypto.randomUUID().slice(0, 12)}`, part, tag, data: { q: x.q, o: x.o, a: x.a, zh: x.zh, why: x.why }, user_id: uid }));
  if (rows.length) { const { error } = await admin().from("toeic_qbank").insert(rows); if (error) throw new Error(error.message); }
  return { items: rows, dropped: out.length - ok.length };
}
async function gen1(sys: string, user: string, schema: unknown) { const r = await gemini(sys, user, schema, 0.9); return Array.isArray(r.items) ? r.items : []; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!KEY()) return j({ error: "伺服器尚未設定 GEMINI_API_KEY" }, 500);
    const b = await req.json();
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await sb.auth.getUser(); if (!u?.user) return j({ error: "請先登入" }, 401);
    if (b.action === "tts") return j(await tts(b.text, b.voice));
    if (b.action === "explain") return j(await explain(b.q));
    if (b.action === "gen") return j(await gen(b, u.user.id));
    return j({ error: "unknown action" }, 400);
  } catch (e) { return j({ error: String((e as Error).message || e) }, 500); }
});
