// 序光計畫：🔔 推播提醒
//   排程（pg_cron 每 10 分鐘）呼叫：送出 push_due() 算好的提醒
//   網站「送測試通知」呼叫（帶登入 token、body {"test":true}）：送一則測試通知到自己的所有裝置
// 私鑰從資料庫的 Vault 拿（push_vapid()），這裡只有公鑰
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const PUBLIC_KEY = "BOTqAMFQkNgd-LbH6UFXYIXtT170YoGyjP1P0hdSu4XlD4170JUrOvlaqfncr2S1Gd8fRRt7X1wjr8JrbXLbxRs";
const SUBJECT = "https://erica940215.github.io/life-reversal-system/";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

let ready = false;
async function init() {
  if (ready) return;
  const { data, error } = await sb.rpc("push_vapid");
  if (error || !data) throw new Error("找不到 Vault 裡的 push_vapid_private：" + (error?.message || "空的"));
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, data as string);
  ready = true;
}

type Sub = { endpoint: string; p256dh: string; auth: string };
async function send(s: Sub, msg: unknown) {
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify(msg), { TTL: 3600, urgency: "high" });
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) await sb.rpc("push_drop", { p_endpoint: s.endpoint });
    console.warn("推播失敗", code, (e as Error).message);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    await init();
    let body: { test?: boolean } = {};
    try { body = await req.json(); } catch { /* 排程送的是空的 */ }

    if (body.test) {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = await sb.auth.getUser(jwt);
      if (!u?.user) return json({ error: "請先登入" }, 401);
      const { data: subs } = await sb.rpc("push_subs_of", { p_user: u.user.id });
      let sent = 0;
      for (const s of (subs || []) as Sub[]) {
        if (await send(s, { title: "🔔 通知設定成功", body: "之後會在你設定的時間提醒你還有哪些任務沒完成。", url: "./#today" })) sent++;
      }
      return json({ sent, devices: (subs || []).length });
    }

    const { data: items, error } = await sb.rpc("push_due");
    if (error) throw error;
    let sent = 0;
    for (const it of (items || []) as { msg: unknown; subs: Sub[] }[]) {
      for (const s of it.subs || []) if (await send(s, it.msg)) sent++;
    }
    return json({ users: (items || []).length, sent });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
