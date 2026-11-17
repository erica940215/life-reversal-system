// Supabase Edge Function：ai-parse
// 前端傳來聊天紀錄與今日資料，這裡呼叫 Gemini，回傳「回覆文字」與「可記錄的項目」。
// GEMINI_API_KEY 只存在 Supabase Secrets，前端與 GitHub 都看不到。

import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_MODEL = "gemini-3.8-flash";
const MAX_MESSAGES = 12;
const MAX_TEXT = 1000;
const MAX_CONTEXT_CHARS = 9000;
const MAX_ITEMS = 20;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" }
  });
}

function safeKeys(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => String(item?.key ?? ""))
    .filter((key) => /^[a-z0-9_-]{1,30}$/.test(key));
}

function buildSystemPrompt(today: string, taskKeys: string[], ideaKeys: string[], context: string) {
  return `你是「人生逆襲系統」的助理，用繁體中文、口語且簡短地回覆。

你要同時做兩件事：

1. reply（回覆文字）
- 使用者問問題時（例如今天還剩什麼、睡得怎樣、吃了什麼），根據下方「今日資料」回答。
- 資料裡沒有的，直接說沒有記錄，不要猜。
- 只是聊天或鼓勵時，自然回應即可。

2. items（可記錄的項目）
- 只放使用者「明確要求記錄」的內容；沒有就回傳空陣列。
- 不要因為聊天內容而自動新增項目。

項目類型 type：
- sleep：睡眠。date 是「那一晚」的日期，例如今天早上 7 點起床、昨晚 11 點睡，date 就是昨天。bed_time、wake_time 用 HH:MM（24 小時制），沒提到就省略。
- meal：一餐。meal_type 只能是 breakfast / lunch / dinner / snack。content 寫吃了什麼。cost 是台幣整數，沒提到就省略。沒吃就 skipped=true。date 預設今天，「昨天」要換算成實際日期。
- task：要做的任務。title 簡短。category 只能從這些 key 選：${taskKeys.join(", ") || "daily"}。difficulty 只能是 easy / normal / hard / epic，不確定用 normal。
- idea：想法、待辦、要記下的事（不是任務）。content 精簡。category 只能從這些 key 選：${ideaKeys.join(", ") || "idea"}，不確定用 idea。
- habit：使用者說今天完成了某個習慣。habit_id 只能從「今日資料」的 habits 清單選，找不到對應的就不要放。
- event：日曆行程。op 只能是 create（新增）、update（修改）、delete（刪除）。
  - create：title、date、start_time、end_time 都必填，時間一定要填，不可以留空。格式是 HH:MM（24 小時制）。使用者說「六點到七點」「6-7」「6.-7.」「晚上 6 點」這類時間，要換成 18:00、19:00（「6.」「6-」這種寫法就是 6 點，晚餐、晚上的時間用下午或晚上的時間）。只說一個時間點沒說結束時間，就把結束設為開始後一小時。只有使用者明確說「同步到 Google」時 google 才設為 true，否則省略。
    範例：「今天六點到七點我要吃晚餐」→ {"type":"event","op":"create","title":"吃晚餐","date":"今天日期","start_time":"18:00","end_time":"19:00"}
  - update、delete：event_id 只能從「今日資料」的 events 清單選，找不到就不要放。update 只放要改的欄位，沒提到的欄位省略。
  - 「今日資料」的 events 是接下來 8 天的行程（含 id），全天行程與唯讀的行程不會出現。

共同規則：
- 日期一律用 YYYY-MM-DD，今天是 ${today}（台灣時間）。
- 只抽取使用者明確寫出的內容，不要自己補充。
- 回覆 JSON，欄位是 reply 與 items。

今日資料（JSON）：
${context}`;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING", enum: ["sleep", "meal", "task", "idea", "habit", "event"] },
          date: { type: "STRING" },
          op: { type: "STRING", enum: ["create", "update", "delete"] },
          event_id: { type: "INTEGER" },
          start_time: { type: "STRING" },
          end_time: { type: "STRING" },
          google: { type: "BOOLEAN" },
          bed_time: { type: "STRING" },
          wake_time: { type: "STRING" },
          meal_type: { type: "STRING", enum: ["breakfast", "lunch", "dinner", "snack"] },
          content: { type: "STRING" },
          cost: { type: "INTEGER" },
          skipped: { type: "BOOLEAN" },
          title: { type: "STRING" },
          category: { type: "STRING" },
          difficulty: { type: "STRING", enum: ["easy", "normal", "hard", "epic"] },
          habit_id: { type: "INTEGER" }
        },
        required: ["type"]
      }
    }
  },
  required: ["reply", "items"]
};

/* 整理前端送來的聊天紀錄，確保最後一句是使用者說的 */
function cleanMessages(list: unknown): { role: string; parts: { text: string }[] }[] {

  if (!Array.isArray(list)) return [];

  const cleaned = list
    .slice(-MAX_MESSAGES)
    .map((message: any) => ({
      role: message?.role === "assistant" ? "model" : "user",
      text: String(message?.text ?? "").trim().slice(0, MAX_TEXT)
    }))
    .filter((message) => message.text);

  return cleaned.map((message) => ({ role: message.role, parts: [{ text: message.text }] }));

}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return json({ error: "只接受 POST" }, 405);
  }

  // 確認是登入中的使用者
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    return json({ error: "請先登入" }, 401);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");

  if (!apiKey) {
    return json({ error: "伺服器尚未設定 GEMINI_API_KEY" }, 500);
  }

  let body: any;

  try {
    body = await req.json();
  } catch {
    return json({ error: "請求格式錯誤" }, 400);
  }

  const contents = cleanMessages(body?.messages);

  if (contents.length === 0 || contents[contents.length - 1].role !== "user") {
    return json({ error: "沒有輸入文字" }, 400);
  }

  if (contents[contents.length - 1].parts[0].text.length > MAX_TEXT) {
    return json({ error: `最多 ${MAX_TEXT} 字` }, 400);
  }

  const today = /^\d{4}-\d{2}-\d{2}$/.test(body?.today)
    ? body.today
    : new Date().toISOString().slice(0, 10);

  const contextText = JSON.stringify(body?.context ?? {}).slice(0, MAX_CONTEXT_CHARS);

  const systemPrompt = buildSystemPrompt(
    today,
    safeKeys(body?.taskCategories),
    safeKeys(body?.ideaCategories),
    contextText
  );

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.4
        }
      })
    }
  );

  if (!geminiRes.ok) {
    // 錯誤細節只寫在伺服器紀錄，不回傳給前端
    console.error("Gemini 錯誤：", geminiRes.status, await geminiRes.text());
    return json({ error: `AI 服務暫時出錯（${geminiRes.status}）` }, 502);
  }

  const payload: any = await geminiRes.json();

  const raw = (payload?.candidates?.[0]?.content?.parts ?? [])
    .filter((part: any) => !part.thought)
    .map((part: any) => part.text ?? "")
    .join("");

  let parsed: any;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ error: "AI 回傳格式不正確，請再試一次" }, 502);
  }

  const reply = String(parsed?.reply ?? "").slice(0, 2000);
  const items = Array.isArray(parsed?.items) ? parsed.items.slice(0, MAX_ITEMS) : [];

  return json({ reply, items });
});