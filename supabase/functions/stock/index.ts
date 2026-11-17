// 🔎 股票分析：基本面資料（證交所／櫃買中心 OpenAPI、Yahoo）＋ Gemini 寫看法
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" };
const num = (v: unknown) => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : null; };
const raw = (v: any) => v && typeof v === "object" ? (v.raw ?? null) : (v ?? null);

let TW: { at: number; pe: any; rev: any; otcPe: any; otcRev: any } | null = null;
async function twData() {
  if (TW && Date.now() - TW.at < 3 * 3600e3) return TW;
  const get = async (u: string) => { try { const r = await fetch(u, { headers: UA }); return r.ok ? await r.json() : []; } catch { return []; } };
  const [pe, rev, otcPe, otcRev] = await Promise.all([
    get("https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"),
    get("https://openapi.twse.com.tw/v1/opendata/t187ap05_L"),
    get("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis"),
    get("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O")]);
  TW = { at: Date.now(), pe, rev, otcPe, otcRev };
  return TW;
}

async function yahooSummary(symbol: string) {
  try {
    const c = await fetch("https://fc.yahoo.com", { headers: UA, redirect: "manual" });
    const cookie = (c.headers.get("set-cookie") || "").split(";")[0];
    const cr = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { ...UA, cookie } });
    const crumb = await cr.text();
    if (!cr.ok || !crumb || crumb.length > 40) return { err: "crumb " + cr.status };
    const m = "price,summaryDetail,defaultKeyStatistics,financialData,assetProfile";
    const r = await fetch(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${m}&crumb=${encodeURIComponent(crumb)}`, { headers: { ...UA, cookie } });
    if (!r.ok) return { err: "summary " + r.status };
    const x = (await r.json())?.quoteSummary?.result?.[0];
    if (!x) return { err: "empty" };
    const sd = x.summaryDetail || {}, ks = x.defaultKeyStatistics || {}, fd = x.financialData || {}, ap = x.assetProfile || {};
    return {
      name: x.price?.longName || x.price?.shortName, sector: ap.sector, industry: ap.industry, summary: String(ap.longBusinessSummary || "").slice(0, 600),
      pe: raw(sd.trailingPE), fpe: raw(sd.forwardPE) ?? raw(ks.forwardPE), pb: raw(ks.priceToBook), yield: raw(sd.dividendYield) != null ? raw(sd.dividendYield) * 100 : null,
      mcap: raw(sd.marketCap) ?? raw(x.price?.marketCap), beta: raw(sd.beta) ?? raw(ks.beta), eps: raw(ks.trailingEps), feps: raw(ks.forwardEps), peg: raw(ks.pegRatio),
      revGrowth: raw(fd.revenueGrowth), epsGrowth: raw(fd.earningsGrowth), gm: raw(fd.grossMargins), om: raw(fd.operatingMargins), pm: raw(fd.profitMargins), roe: raw(fd.returnOnEquity),
      de: raw(fd.debtToEquity), fcf: raw(fd.freeCashflow), target: raw(fd.targetMeanPrice), targetHi: raw(fd.targetHighPrice), targetLo: raw(fd.targetLowPrice), rec: fd.recommendationKey, analysts: raw(fd.numberOfAnalystOpinions)
    };
  } catch (e) { return { err: String(e) }; }
}

async function data(symbol: string) {
  const out: any = { symbol };
  const m = symbol.match(/^(\w+)\.(TW|TWO)$/);
  if (m) {
    const code = m[1], t = await twData();
    const pe = (m[2] === "TW" ? t.pe : t.otcPe).find((r: any) => (r.Code || r.SecuritiesCompanyCode) === code);
    if (pe) out.tw = { pe: num(pe.PEratio ?? pe.PriceEarningRatio), yield: num(pe.DividendYield ?? pe.YieldRatio), pb: num(pe.PBratio ?? pe.PriceBookRatio), name: pe.Name || pe.CompanyName, date: pe.Date };
    const rv = (m[2] === "TW" ? t.rev : t.otcRev).find((r: any) => r["公司代號"] === code);
    if (rv) out.rev = { ym: rv["資料年月"], rev: num(rv["營業收入-當月營收"]), yoy: num(rv["營業收入-去年同月增減(%)"]), mom: num(rv["營業收入-上月比較增減(%)"]), cumYoy: num(rv["累計營業收入-前期比較增減(%)"]), industry: rv["產業別"], name: rv["公司名稱"], note: rv["備註"] };
  }
  out.y = await yahooSummary(symbol);
  return out;
}

async function ai(body: any) {
  const key = Deno.env.get("GEMINI_API_KEY"); if (!key) return { error: "伺服器尚未設定 GEMINI_API_KEY" };
  const facts = JSON.stringify(body.facts ?? {}).slice(0, 9000);
  const sys = `你是一位講話直接、認真的台灣股票分析師，用繁體中文寫給一位大學生看。
只能根據下方「計算好的數據」分析，沒有的資料就說沒有，絕對不要編造新聞、財報數字或事件。
輸出 JSON：
- view：一句話的總結（例如「趨勢強但估值偏貴，適合拉回再分批」）
- stance：偏多 / 中性 / 偏空 三選一
- reasons：3–5 個支持你看法的重點，每個一句、要引用數字
- risks：2–4 個要小心的地方
- plans：三種情境各一段具體做法（可引用支撐壓力價位與停損參考）：holding（已經有持股）、buying（想進場）、watching（觀望要盯什麼訊號）
- watch：接下來 1–3 個月要追蹤的 2–4 件事
語氣實在、不要過度保護、不要每句都加免責聲明（介面會另外顯示）。
計算好的數據：
${facts}`;
  const schema = { type: "OBJECT", properties: { view: { type: "STRING" }, stance: { type: "STRING", enum: ["偏多", "中性", "偏空"] }, reasons: { type: "ARRAY", items: { type: "STRING" } }, risks: { type: "ARRAY", items: { type: "STRING" } },
    plans: { type: "OBJECT", properties: { holding: { type: "STRING" }, buying: { type: "STRING" }, watching: { type: "STRING" } }, required: ["holding", "buying", "watching"] }, watch: { type: "ARRAY", items: { type: "STRING" } } }, required: ["view", "stance", "reasons", "risks", "plans", "watch"] };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: "user", parts: [{ text: `請分析 ${body.name || body.symbol}（${body.symbol}）` }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.5 } }) });
  if (!r.ok) { console.error("Gemini", r.status, await r.text()); return { error: `AI 服務暫時出錯（${r.status}）` }; }
  const p: any = await r.json(); const t = (p?.candidates?.[0]?.content?.parts ?? []).filter((x: any) => !x.thought).map((x: any) => x.text ?? "").join("");
  try { return { ai: JSON.parse(t) }; } catch { return { error: "AI 回傳格式不正確，請再試一次" }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const symbol = String(body.symbol || "").toUpperCase();
    if (!/^[\w.\-^=]{1,20}$/.test(symbol)) return j({ error: "代號格式不對" }, 400);
    if (body.action === "ai") return j(await ai({ ...body, symbol }));
    return j(await data(symbol));
  } catch (e) { return j({ error: String(e) }, 500); }
});
