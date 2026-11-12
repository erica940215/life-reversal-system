// 🛟 AI 備援：一個模型額度用完（429），自動換下一個；用完的模型記在 ai_quota，到額度重置前直接跳過
// 每個 Gemini 模型的免費額度是分開算的，所以把幾個模型排成一串輪流用。
// （這個檔案在 toeic、kb 兩個 edge function 裡各放一份 ai.ts，內容一樣）
import { createClient } from "jsr:@supabase/supabase-js@2";
const G = "https://generativelanguage.googleapis.com/v1beta";
const KEY = () => Deno.env.get("GEMINI_API_KEY") || "";
const list = (env: string, def: string) => (Deno.env.get(env) || def).split(",").map(s => s.trim()).filter(Boolean);
export const TEXT_MODELS = () => list("AI_TEXT_MODELS", "gemini-3.8-flash,gemini-3.7-flash,gemini-3-flash-preview,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.6-flash,gemini-3.5-flash,gemma-4-31b-it,gemma-4-26b-a4b-it");
export const TTS_MODELS = () => list("AI_TTS_MODELS", "gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts");
export const IMG_MODELS = () => list("AI_IMG_MODELS", "gemini-3.1-flash-image,gemini-3.1-flash-lite-image,gemini-2.5-flash-image");
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

export class QuotaError extends Error {}
let BL: Record<string, number> = {}, blAt = 0;
async function blocked() {
  if (Date.now() - blAt < 30000) return BL;
  try { const { data } = await admin().from("ai_quota").select("model, until"); BL = {}; (data || []).forEach((r: any) => { BL[r.model] = new Date(r.until).getTime(); }); blAt = Date.now(); } catch (_) {}
  return BL;
}
async function block(model: string, ms: number, reason: string) {
  const until = Date.now() + ms; BL[model] = until;
  try { await admin().from("ai_quota").upsert({ model, until: new Date(until).toISOString(), reason: reason.slice(0, 200), updated_at: new Date().toISOString() }); } catch (_) {}
}
/* 免費額度每天在美國太平洋時間午夜重置（台灣下午 3～4 點） */
function msToReset() {
  const now = new Date(), la = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })), nx = new Date(la); nx.setHours(24, 2, 0, 0);
  return Math.max(60000, nx.getTime() - la.getTime());
}
export function resetText() { const m = Math.round(msToReset() / 60000); return m > 90 ? `約 ${Math.round(m / 60)} 小時後` : `約 ${m} 分鐘後`; }

/* 依序試每個模型：makeBody(model) 產生 request；回傳 { json, model } */
export async function call(models: string[], makeBody: (m: string) => unknown, budgetMs = 135000) {
  const t0 = Date.now(), bl = await blocked(); let last = "";
  for (const m of models) {
    if ((bl[m] || 0) > Date.now()) continue;
    const left = budgetMs - (Date.now() - t0); if (left < 8000) break;
    for (let k = 0; k < 2; k++) {
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), Math.min(left - 2000, 110000));
      let r: Response;
      try { r = await fetch(`${G}/models/${m}:generateContent`, { method: "POST", signal: ac.signal, headers: { "Content-Type": "application/json", "x-goog-api-key": KEY() }, body: JSON.stringify(makeBody(m)) }); }
      catch (_) { clearTimeout(tm); last = `${m} 逾時`; break; }
      clearTimeout(tm);
      if (r.ok) { const j = await r.json(); if (j?.candidates?.[0]?.content?.parts?.length) return { json: j, model: m }; last = `${m} 沒有回傳內容`; break; }
      const txt = await r.text(); last = `${m} ${r.status}`; console.error("AI", m, r.status, txt.slice(0, 300));
      if (r.status === 429) { await block(m, /PerDay|per day|daily/i.test(txt) ? msToReset() : 60000, "429"); break; }
      if (r.status === 404 || (r.status === 400 && /not (found|supported)|no longer available|unsupported|not enabled/i.test(txt))) { await block(m, 864e5, `${r.status}`); break; }
      if (r.status >= 500 && k === 0) { await new Promise(ok => setTimeout(ok, 1500)); continue; }
      break;
    }
  }
  throw new QuotaError(`AI 暫時都忙不過來（${last || "所有模型額度用完"}），額度${resetText()}恢復`);
}

const parseJSON = (t: string) => {
  try { return JSON.parse(t); } catch (_) {}
  const s = t.replace(/```(?:json)?/g, ""), a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
  throw new Error("AI 回傳的格式不對，再試一次");
};
/* 文字（可附 PDF／圖片）。Gemma 不支援系統指令和 JSON 結構，改成寫在題目裡再自己解析 */
export async function text(sys: string, parts: unknown[], schema?: unknown, temp = 0.5, models = TEXT_MODELS()) {
  const { json } = await call(models, m => {
    const gemma = m.startsWith("gemma");
    if (!gemma) return { systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts }], generationConfig: schema ? { responseMimeType: "application/json", responseSchema: schema, temperature: temp } : { temperature: temp } };
    const extra = schema ? `\n\n只輸出一個 JSON 物件（不要任何說明文字、不要 markdown），格式必須符合這個 JSON Schema：${JSON.stringify(schema)}` : "";
    return { contents: [{ role: "user", parts: [{ text: `【指示】\n${sys}${extra}\n\n【內容】` }, ...parts] }], generationConfig: { temperature: temp } };
  });
  const t = (json.candidates[0].content.parts ?? []).filter((x: any) => !x.thought).map((x: any) => x.text ?? "").join("");
  return schema ? parseJSON(t) : t;
}
/* 語音：回傳 inlineData（base64 + mimeType） */
export async function speech(prompt: string, speechConfig: unknown) {
  const { json } = await call(TTS_MODELS(), () => ({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig } }), 120000);
  const inl = json.candidates[0].content.parts.find((x: any) => x.inlineData)?.inlineData; if (!inl?.data) throw new Error("語音服務沒有回傳聲音"); return inl;
}
/* 圖片 */
export async function picture(prompt: string) {
  const { json } = await call(IMG_MODELS(), () => ({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }), 120000);
  const inl = json.candidates[0].content.parts.find((x: any) => x.inlineData)?.inlineData; if (!inl?.data) throw new Error("圖片服務沒有回傳圖片"); return inl;
}
