// 📈 行情代理：用 Yahoo Finance 拿日 K（加密貨幣、台股、美股）
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { symbol, range = "5y", interval = "1d" } = await req.json();
    if (!/^[\w.\-^=]{1,20}$/.test(symbol || "")) return j({ error: "代號格式不對" }, 400);
    if (!["1y", "2y", "5y", "10y", "max"].includes(range) || !["1d", "1wk"].includes(interval)) return j({ error: "範圍不支援" }, 400);
    let r: Response | null = null;
    for (const host of ["query1", "query2"]) {
      r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includeAdjustedClose=true`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; xuguang-sim/1.0)" } });
      if (r.ok) break;
    }
    if (!r || !r.ok) return j({ error: `拿不到 ${symbol} 的行情（${r?.status}）` }, 502);
    const d = await r.json(); const x = d?.chart?.result?.[0];
    if (!x || !x.timestamp) return j({ error: `找不到 ${symbol}` }, 404);
    const q = x.indicators.quote[0], adj = x.indicators.adjclose?.[0]?.adjclose;
    const bars = x.timestamp.map((t: number, i: number) => {
      const c = q.close[i]; if (c == null) return null;
      const k = adj && adj[i] ? adj[i] / c : 1;
      return { t: t * 1000, o: q.open[i] * k, h: q.high[i] * k, l: q.low[i] * k, c: c * k, v: q.volume[i] || 0 };
    }).filter(Boolean);
    return j({ symbol, name: x.meta?.shortName || x.meta?.longName || symbol, currency: x.meta?.currency, bars });
  } catch (e) { return j({ error: String(e) }, 500); }
});
