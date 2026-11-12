/* 🔎 股票分析：選一檔股票，從 10 個面向打分數，再請 AI 綜合寫看法與接下來的做法
   行情：edge function「market」；基本面＋AI：edge function「stock」（證交所／櫃買 OpenAPI、Yahoo、Gemini） */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };
  const PRESET = [["2330.TW", "台積電"], ["2317.TW", "鴻海"], ["2454.TW", "聯發科"], ["0050.TW", "元大台灣50"], ["2603.TW", "長榮"], ["2881.TW", "富邦金"], ["NVDA", "輝達"], ["AAPL", "蘋果"], ["TSLA", "特斯拉"], ["MSFT", "微軟"]];
  const mkOf = s => /-USD$/.test(s) ? "crypto" : /\.TWO?$/.test(s) ? "tw" : "us";
  const BENCH = { tw: ["^TWII", "加權指數"], us: ["SPY", "標普500"], crypto: ["BTC-USD", "比特幣"] };

  const sma = (a, n) => { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
  const ema = (a, n) => { const k = 2 / (n + 1), o = []; let p = null; a.forEach((v, i) => { p = p == null ? v : v * k + p * (1 - k); o.push(i < n - 1 ? null : p); }); return o; };
  const rsi = (a, n = 14) => { let g = 0, l = 0, o = null; for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n) { g += up / n; l += dn / n; } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; } if (i >= n) o = l === 0 ? 100 : 100 - 100 / (1 + g / l); } return o; };
  const pct = (v, d = 1) => v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
  const ap = (v, d = 1) => v == null || !isFinite(v) ? "—" : `${Math.abs(v * 100).toFixed(d)}%`;
  const cls = v => v == null ? "" : v >= 0 ? "up" : "dn";
  const fx = (v, d = 2) => v == null || !isFinite(v) ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: d });
  const big = v => v == null ? "—" : v >= 1e12 ? (v / 1e12).toFixed(2) + " 兆" : v >= 1e8 ? (v / 1e8).toFixed(0) + " 億" : fx(v, 0);
  const clamp = v => Math.max(0, Math.min(100, Math.round(v)));

  async function market(symbol, range = "2y") {
    const { data, error } = await db.functions.invoke("market", { body: { symbol, range } });
    if (error) { let m = error.message; try { const b = await error.context.json(); if (b && b.error) m = b.error; } catch (_) {} throw new Error(m); }
    if (!data || !data.bars || data.bars.length < 60) throw new Error(`${symbol} 的資料太少`);
    return data;
  }
  async function fund(symbol) { try { const { data } = await db.functions.invoke("stock", { body: { symbol } }); return data || {}; } catch (_) { return {}; } }

  /* ---------- 10 個面向 ---------- */
  function analyze(d, bench, f) {
    const b = d.bars, c = b.map(x => x.c), N = c.length, px = c[N - 1], ago = n => c[Math.max(0, N - 1 - n)], ret = n => px / ago(n) - 1;
    const m20 = sma(c, 20), m60 = sma(c, 60), m200 = sma(c, 200), M = (a, k = 0) => a[N - 1 - k];
    const py = mkOf(d.symbol) === "crypto" ? 365 : 252, D = n => Math.round(n * py / 252);
    const out = [];
    const dim = (key, icon, name, score, lines, tip) => out.push({ key, icon, name, score: score == null ? null : clamp(score), lines, tip });

    /* 1 趨勢 */
    { let s = 50; const L = [];
      [[m20, "20 日（月線）"], [m60, "60 日（季線）"], [m200, "200 日（年線）"]].forEach(([m, n]) => { if (M(m) == null) return; const up = px > M(m); s += up ? 10 : -10; L.push(`${up ? "站上" : "跌破"} ${n} ${fx(M(m))}（${pct(px / M(m) - 1)}）`); });
      if (M(m20) && M(m60) && M(m200)) { if (M(m20) > M(m60) && M(m60) > M(m200)) { s += 12; L.push("均線多頭排列（短 > 中 > 長）"); } else if (M(m20) < M(m60) && M(m60) < M(m200)) { s -= 12; L.push("均線空頭排列（短 < 中 < 長）"); } }
      if (M(m200, 20)) { const sl = M(m200) / M(m200, 20) - 1; s += sl > 0.01 ? 8 : sl < -0.01 ? -8 : 0; L.push(`年線${sl > 0.005 ? "往上彎" : sl < -0.005 ? "往下彎" : "走平"}（近一個月 ${pct(sl)}）`); }
      dim("trend", "📈", "趨勢", s, L, "看價格在均線上面還是下面，以及均線往哪個方向走。"); }

    /* 2 動能 */
    { const r = rsi(c), F = ema(c, 12), S = ema(c, 26), mc = c.map((_, i) => F[i] == null || S[i] == null ? null : F[i] - S[i]), first = mc.findIndex(v => v != null), sg = mc.map(() => null);
      if (first >= 0) ema(mc.slice(first), 9).forEach((v, j) => { sg[first + j] = v; });
      const h = mc[N - 1] - sg[N - 1], h5 = mc[N - 6] - sg[N - 6];
      let s = 50 + (r - 50) * 0.6 + (h > 0 ? 8 : -8) + (h > h5 ? 5 : -5) + Math.max(-15, Math.min(15, ret(D(63)) * 60));
      if (r > 78) s -= 12; if (r < 25) s += 6;
      dim("mom", "⚡", "動能", s, [`RSI ${fx(r, 0)}${r > 70 ? "（過熱）" : r < 30 ? "（超賣）" : ""}`, `MACD ${h > 0 ? "在訊號線上方" : "在訊號線下方"}，力道${h > h5 ? "增強" : "減弱"}中`,
        `漲跌：1 個月 ${pct(ret(D(21)))}・3 個月 ${pct(ret(D(63)))}・6 個月 ${pct(ret(D(126)))}・1 年 ${pct(ret(D(252)))}`], "看最近漲得有沒有力、會不會漲過頭。"); }

    /* 3 相對強弱 */
    if (bench) { const bc = bench.bars.map(x => x.c), bN = bc.length, br = n => bc[bN - 1] / bc[Math.max(0, bN - 1 - n)] - 1;
      const r3 = ret(D(63)) - br(Math.round(63 * (mkOf(bench.symbol) === "crypto" ? 365 : 252) / 252)), r6 = ret(D(126)) - br(Math.round(126 * (mkOf(bench.symbol) === "crypto" ? 365 : 252) / 252));
      dim("rel", "🏁", "相對大盤", 50 + r3 * 120 + r6 * 60, [`3 個月比${bench.label}${r3 >= 0 ? "強" : "弱"} ${ap(r3)}`, `6 個月比${bench.label}${r6 >= 0 ? "強" : "弱"} ${ap(r6)}`], "大盤漲它漲更多、大盤跌它跌更少，就是強勢股。"); }

    /* 4 風險 */
    { const lr = []; for (let i = Math.max(1, N - D(252)); i < N; i++) lr.push(Math.log(c[i] / c[i - 1]));
      const mu = lr.reduce((a, v) => a + v, 0) / lr.length, vol = Math.sqrt(lr.reduce((a, v) => a + (v - mu) ** 2, 0) / (lr.length - 1) * py);
      let pk = 0, mdd = 0; for (let i = Math.max(0, N - D(252)); i < N; i++) { pk = Math.max(pk, c[i]); mdd = Math.min(mdd, c[i] / pk - 1); }
      let tr = 0; for (let i = N - 14; i < N; i++) tr += Math.max(b[i].h - b[i].l, Math.abs(b[i].h - c[i - 1]), Math.abs(b[i].l - c[i - 1])) / 14;
      const beta = f.y && f.y.beta;
      dim("risk", "🌊", "風險（越高越穩）", 100 - vol * 120 + mdd * 40, [`年化波動 ${ap(vol, 0)}${vol > 0.5 ? "（很刺激）" : vol < 0.2 ? "（溫和）" : ""}`, `近一年最大回檔 ${pct(mdd)}`, `平均每天振幅（ATR）約 ${fx(tr)}（${ap(tr / px)}）`, ...(beta ? [`Beta ${fx(beta)}：大盤動 1%，它平均動 ${fx(beta)}%`] : [])], "分數越高代表越穩；分數低不代表不好，只是要能承受上下震盪。");
      out.atr = tr; out.vol = vol; out.mdd = mdd; }

    /* 5 量能 */
    { const v = b.map(x => x.v || 0);
      if (v.slice(-60).some(x => x > 0)) { const v5 = v.slice(-5).reduce((a, x) => a + x, 0) / 5, v60 = v.slice(-60).reduce((a, x) => a + x, 0) / 60; let uv = 0, dv = 0;
        for (let i = N - 20; i < N; i++) { if (c[i] >= c[i - 1]) uv += v[i]; else dv += v[i]; }
        const ratio = uv / (dv || 1);
        dim("vol", "🔊", "量能", 50 + (ratio - 1) * 30 + (v5 / v60 > 1.3 && ret(5) > 0 ? 8 : v5 / v60 > 1.3 && ret(5) < 0 ? -8 : 0), [`近 5 天成交量是平常（60 天平均）的 ${fx(v5 / v60, 1)} 倍`, `近 20 天上漲日的量是下跌日的 ${fx(ratio, 2)} 倍${ratio > 1.2 ? "（買盤積極）" : ratio < 0.8 ? "（賣壓較重）" : ""}`], "上漲有量、下跌量縮比較健康。"); } }

    /* 6 位置 */
    { const y = b.slice(-D(252)), hi = Math.max(...y.map(x => x.h)), lo = Math.min(...y.map(x => x.l)), pos = (px - lo) / (hi - lo || 1);
      const s20 = Math.min(...b.slice(-D(20)).map(x => x.l)), s60 = Math.min(...b.slice(-D(60)).map(x => x.l)), r20 = Math.max(...b.slice(-D(20)).map(x => x.h)), r60 = Math.max(...b.slice(-D(60)).map(x => x.h));
      out.levels = { s20, s60, r20, r60, hi, lo, m60: M(m60), m200: M(m200) };
      dim("pos", "📍", "位置", 40 + pos * 30 + (px >= hi * 0.97 ? 15 : 0), [`在一年區間 ${fx(lo)}～${fx(hi)} 的 ${Math.round(pos * 100)}% 位置（距高點 ${pct(px / hi - 1)}）`, `近期支撐：${fx(s20)}（20 天低）、${fx(s60)}（60 天低）`, `近期壓力：${fx(r20)}（20 天高）、${fx(r60)}（60 天高）`], "接近一年高點代表強勢、但追高風險也大；接近低點可能便宜、也可能是弱勢。"); }

    /* 7 估值 */
    { const y = f.y || {}, t = f.tw || {}, pe = t.pe || y.pe, pb = t.pb || y.pb, yl = t.yield != null ? t.yield : y.yield, fpe = y.fpe, peg = y.peg;
      if (pe || pb || yl != null) { let s = 50; const L = [];
        if (pe) { s += pe < 12 ? 20 : pe < 18 ? 10 : pe < 25 ? 0 : pe < 40 ? -12 : -22; L.push(`本益比 ${fx(pe, 1)} 倍${pe < 12 ? "（便宜）" : pe > 35 ? "（偏貴）" : ""}`); } else L.push("本益比：目前虧損或沒有資料");
        if (fpe && pe) { L.push(`預估本益比 ${fx(fpe, 1)} 倍（${fpe < pe ? "獲利預期成長" : "獲利預期衰退"}）`); s += fpe < pe * 0.85 ? 8 : fpe > pe ? -6 : 0; }
        if (peg) { L.push(`PEG ${fx(peg)}${peg < 1 ? "（成長性撐得起估值）" : peg > 2 ? "（估值跑在成長前面）" : ""}`); s += peg < 1 ? 8 : peg > 2.5 ? -8 : 0; }
        if (pb) L.push(`股價淨值比 ${fx(pb, 2)} 倍`);
        if (yl != null) { L.push(`殖利率 ${fx(yl, 2)}%`); s += yl > 5 ? 8 : yl > 3 ? 4 : 0; }
        dim("val", "💰", "估值（越高越便宜）", s, L, "本益比＝股價 ÷ 每股賺多少，越低越便宜；但高成長的公司通常本益比也高。"); } }

    /* 8 基本面 */
    { const y = f.y || {}, r = f.rev, L = []; let s = 50, has = false;
      if (r && r.yoy != null) { has = true; const ym = String(r.ym); L.push(`${ym.slice(0, -2)} 年 ${+ym.slice(-2)} 月營收年增 ${pct(r.yoy / 100)}・月增 ${pct(r.mom / 100)}・今年累計年增 ${pct(r.cumYoy / 100)}`); if (r.note && r.note !== "-") L.push(`公司說明：${r.note}`); s += Math.max(-20, Math.min(20, r.yoy / 2)); }
      if (y.revGrowth != null) { has = true; L.push(`最近一季營收成長 ${pct(y.revGrowth)}、獲利成長 ${pct(y.epsGrowth)}`); s += Math.max(-12, Math.min(12, y.revGrowth * 40)) + (y.epsGrowth != null ? Math.max(-8, Math.min(8, y.epsGrowth * 20)) : 0); }
      if (y.gm != null) { has = true; L.push(`毛利率 ${ap(y.gm, 0)}・營業利益率 ${ap(y.om, 0)}・淨利率 ${y.pm < 0 ? "-" : ""}${ap(y.pm, 0)}`); s += y.pm > 0.2 ? 8 : y.pm < 0 ? -12 : 0; }
      if (y.roe != null) { L.push(`ROE ${ap(y.roe, 0)}${y.roe > 0.15 ? "（很會用股東的錢賺錢）" : ""}`); s += y.roe > 0.15 ? 6 : y.roe < 0.05 ? -6 : 0; }
      if (y.de != null) { L.push(`負債／股東權益 ${fx(y.de, 0)}%${y.de > 150 ? "（負債偏高）" : ""}`); s += y.de > 200 ? -8 : 0; }
      if (has) dim("fund", "🏭", "基本面", s, L, "營收、獲利有沒有在成長，賺錢的效率好不好。"); }

    /* 9 分析師 */
    { const y = f.y || {}; if (y.target) { const up = y.target / px - 1, REC = { strong_buy: "強力買進", buy: "買進", hold: "持有", underperform: "表現落後", sell: "賣出" };
      dim("analyst", "🎯", "分析師共識", 50 + up * 120 + ({ strong_buy: 10, buy: 5, hold: 0, underperform: -8, sell: -12 }[y.rec] || 0), [`${y.analysts || "?"} 位分析師平均目標價 ${fx(y.target)}（${pct(up)}），區間 ${fx(y.targetLo)}～${fx(y.targetHi)}`, `共識評等：${REC[y.rec] || y.rec || "—"}`], "分析師的看法只是參考，他們也常常錯，而且通常偏樂觀。"); } }

    /* 10 回測：這檔適合用什麼方法操作 */
    if (window.TradeSim) { const T = window.TradeSim, res = Object.keys(T.STRATS).filter(k => !["custom", "dca"].includes(k)).map(k => { const p = Object.fromEntries(T.STRATS[k].params.map(q => [q[0], q[2]])); return [k, T.simulate(b, k, p, 1e5, { fee: 0.1 })]; }).sort((a, z) => z[1].ret - a[1].ret);
      const bh = res.find(x => x[0] === "buyhold")[1], best = res[0], timing = res.filter(x => x[0] !== "buyhold" && x[1].ret > bh.ret).length;
      dim("bt", "🧪", "回測（近 2 年）", null, [`買進持有 ${pct(bh.ret)}（最大回檔 ${pct(bh.mdd)}）`, `最好的是 ${T.STRATS[best[0]].name} ${pct(best[1].ret)}`, `${timing ? `有 ${timing} 種擇時方法贏過一直抱著` : "沒有任何擇時方法贏過一直抱著"}，${timing >= 3 ? "這檔適合看訊號進出" : "這檔比較適合長抱或定期定額"}`], "用模擬交易頁的 6 種策略、預設參數跑近 2 年。不計分，只當參考。");
      out.bt = { best: T.STRATS[best[0]].name, bestRet: best[1].ret, bh: bh.ret, timing }; }

    const scored = out.filter(x => x.score != null), W = { trend: 1.4, mom: 1.1, rel: 1, risk: 0.6, vol: 0.6, pos: 0.6, val: 1, fund: 1.2, analyst: 0.5 };
    out.total = Math.round(scored.reduce((a, x) => a + x.score * (W[x.key] || 1), 0) / scored.reduce((a, x) => a + (W[x.key] || 1), 0));
    out.px = px; out.ret = { m1: ret(D(21)), m3: ret(D(63)), y1: ret(D(252)) };
    return out;
  }

  /* 沒有 AI 時的規則版建議 */
  function rulePlan(A) {
    const L = A.levels, s = A.total, stop = Math.max(L.s60, A.px - 2.5 * A.atr), tr = A.find(x => x.key === "trend"), val = A.find(x => x.key === "val");
    const stance = s >= 62 ? "偏多" : s <= 42 ? "偏空" : "中性";
    return { stance, view: `${stance === "偏多" ? "整體條件偏強" : stance === "偏空" ? "整體條件偏弱" : "多空條件互相拉扯"}（綜合 ${s} 分）${tr && tr.score >= 65 && val && val.score < 40 ? "，趨勢強但估值偏貴" : ""}`,
      plans: { holding: `以 ${fx(stop)} 附近當防守點（60 天低點或 2.5 倍 ATR），收盤跌破就減碼；沒跌破就續抱。`,
        buying: stance === "偏多" ? `不要一次買滿：可以分 2–3 批，拉回 ${fx(L.s20)}～${fx(L.m60 || L.s60)} 附近再加，停損設在 ${fx(stop)}。` : stance === "偏空" ? `先不急著進場，等站回季線 ${fx(L.m60)} 並且量能轉強再說。` : `等方向明確：突破 ${fx(L.r60)} 或回測 ${fx(L.s60)} 有撐，再小量試單。`,
        watching: `盯三件事：能不能突破 ${fx(L.r60)}、會不會跌破 ${fx(L.s60)}、下一次月營收／財報有沒有延續成長。` } };
  }

  /* ---------- 畫面 ---------- */
  const st = { last: store.get("stockLast") || "2330.TW", recent: (() => { try { return JSON.parse(store.get("stockRecent") || "[]"); } catch (_) { return []; } })() };
  function ensurePage() {
    let page = document.querySelector('.page[data-page="stock"]');
    if (!page) {
      const c = document.querySelector("#app-section > .container"); if (!c) return null;
      page = document.createElement("div"); page.className = "page"; page.dataset.page = "stock"; c.appendChild(page);
      page.innerHTML = `<section class="card"><h2>🔎 股票分析</h2>
        <div class="tr-row"><input id="sk-sym" class="tr-in" placeholder="代號，例如 2330.TW、AAPL" style="flex:1;min-width:140px"><button type="button" class="btn btn-primary" data-sk="go">分析</button></div>
        <div class="tr-row" id="sk-chips"></div>
        <p class="tr-note">台股上市加 .TW、上櫃加 .TWO；美股直接打代號。會從 10 個面向打分，再由 AI 綜合寫看法和接下來的做法。</p></section><div id="sk-out"></div>`;
      page.addEventListener("click", onClick);
      page.querySelector("#sk-sym").addEventListener("keydown", e => { if (e.key === "Enter") go(e.target.value); });
    }
    if (typeof PAGES !== "undefined" && Array.isArray(PAGES) && !PAGES.includes("stock")) PAGES.push("stock");
    chips();
    return page;
  }
  function chips() { const el = document.getElementById("sk-chips"); if (!el) return;
    const rec = st.recent.filter(s => !PRESET.some(p => p[0] === s)).slice(0, 6);
    el.innerHTML = rec.map(s => `<button type="button" class="tr-chip sm" data-sk="pick" data-v="${esc(s)}">🕘 ${esc(s)}</button>`).join("") + PRESET.map(([s, n]) => `<button type="button" class="tr-chip sm ${st.last === s ? "on" : ""}" data-sk="pick" data-v="${s}">${n}</button>`).join(""); }

  const bar = s => `<div class="sk-bar"><i style="width:${s}%;background:${s >= 65 ? "#3fb950" : s >= 45 ? "#e3b341" : "#f85149"}"></i></div>`;
  function priceChart(d, A) {
    const b = d.bars.slice(-260), c = b.map(x => x.c), all = d.bars.map(x => x.c), m60 = sma(all, 60).slice(-260), m200 = sma(all, 200).slice(-260);
    const W = 640, H = 200, lo = Math.min(...b.map(x => x.l)), hi = Math.max(...b.map(x => x.h)), x = i => 6 + i / (b.length - 1) * (W - 12), y = v => 8 + (1 - (v - lo) / (hi - lo || 1)) * (H - 16);
    const ln = a => a.map((v, i) => v == null ? "" : `${a[i - 1] == null ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(""), L = A.levels;
    const hl = (v, c2, t) => v >= lo && v <= hi ? `<line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="sk-${c2}"/><text x="${W - 4}" y="${y(v) - 3}" text-anchor="end" class="tr-ax">${t} ${fx(v)}</text>` : "";
    return `<svg class="tr-chart" style="height:200px" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${hl(L.r60, "res", "壓力")}${hl(L.s60, "sup", "支撐")}
      <path d="${ln(m200)}" class="sk-m200"/><path d="${ln(m60)}" class="sk-m60"/><path d="${ln(c)}" class="tr-price"/>
      <text x="6" y="14" class="tr-ax">近一年・<tspan class="sk-k60">━ 季線</tspan> <tspan class="sk-k200">━ 年線</tspan></text></svg>`;
  }

  async function go(sym) {
    sym = String(sym || "").trim().toUpperCase(); if (!sym) return;
    if (/^\d{4,6}$/.test(sym)) sym += ".TW";
    st.last = sym; store.set("stockLast", sym); st.recent = [sym, ...st.recent.filter(s => s !== sym)].slice(0, 10); store.set("stockRecent", JSON.stringify(st.recent)); chips();
    const inp = document.getElementById("sk-sym"); if (inp) inp.value = sym;
    const out = document.getElementById("sk-out"); out.innerHTML = `<section class="card"><p class="tr-note">🔎 正在收集 ${esc(sym)} 的資料…</p></section>`;
    try {
      const mk = mkOf(sym), [bs, bl] = BENCH[mk];
      const [d, bench, f] = await Promise.all([market(sym), sym === bs ? null : market(bs).catch(() => null), fund(sym)]);
      if (bench) bench.label = bl;
      const A = analyze(d, bench, f), name = (f.tw && f.tw.name) || (f.rev && f.rev.name) || (f.y && f.y.name) || d.name, rp = rulePlan(A), y = f.y || {};
      const scored = A.filter(x => x.score != null), strong = scored.slice().sort((a, b) => b.score - a.score);
      out.innerHTML = `<section class="card sk-head"><div class="sk-title"><div><b>${esc(name)}</b> <small>${esc(sym)}${y.industry || (f.rev && f.rev.industry) ? `・${esc((f.rev && f.rev.industry) || y.industry)}` : ""}${y.mcap ? `・市值 ${big(y.mcap)}` : ""}</small>
          <div class="sk-px">${fx(A.px)} <small>${esc(d.currency || "")}</small> <span class="${cls(A.ret.m1)}">1 個月 ${pct(A.ret.m1)}</span> <span class="${cls(A.ret.y1)}">1 年 ${pct(A.ret.y1)}</span></div></div>
          <div class="sk-total s${A.total >= 62 ? "g" : A.total <= 42 ? "r" : "y"}"><b>${A.total}</b><small>綜合分數</small></div></div>
        ${priceChart(d, A)}
        <p class="tr-verdict">📌 ${esc(rp.view)}。最強的面向是${strong.slice(0, 2).map(x => x.name.replace(/（.*）/, "")).join("、")}，最弱的是${strong.slice(-2).reverse().map(x => x.name.replace(/（.*）/, "")).join("、")}。</p></section>
        <section class="card"><h2>🧭 十個面向</h2>${A.map(x => `<details class="sk-dim" ${x.score != null && (x.score >= 70 || x.score <= 35) ? "open" : ""}><summary><span>${x.icon} ${x.name}</span>${x.score != null ? `${bar(x.score)}<b>${x.score}</b>` : `<em>參考</em>`}</summary><ul>${x.lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul><p class="tr-note">💡 ${x.tip}</p></details>`).join("")}
          ${y.summary ? `<details class="sk-dim"><summary><span>🏢 公司在做什麼</span></summary><p class="tr-note" style="opacity:.85">${esc(y.summary)}…</p></details>` : ""}</section>
        <section class="card" id="sk-ai"><h2>🤖 我的看法</h2><p class="tr-note">AI 正在讀上面的數據寫看法…</p></section>
        <p class="tr-note small" style="padding:0 6px">⚠️ 以上是根據公開數據的整理與推論，不是投資建議；資料可能延遲，下單前請自己再確認，並只用輸得起的錢。</p>`;
      const facts = { 價格: A.px, 幣別: d.currency, 綜合分數: A.total, 漲跌: A.ret, 支撐壓力: A.levels, ATR: A.atr, 年化波動: A.vol, 一年最大回檔: A.mdd, 回測: A.bt,
        面向: A.map(x => ({ 面向: x.name, 分數: x.score, 細節: x.lines })), 公司: { 產業: (f.rev && f.rev.industry) || y.industry, 市值: y.mcap } };
      aiView(sym, name, facts, rp);
    } catch (e) { out.innerHTML = `<section class="card"><p class="tr-note dn">😵 ${esc(e.message)}${/找不到/.test(e.message) ? "（代號對嗎？台股要加 .TW 或 .TWO）" : ""}</p></section>`; }
  }

  async function aiView(sym, name, facts, rp) {
    const box = document.getElementById("sk-ai"); if (!box) return;
    let a = null, err = null;
    try { const { data, error } = await db.functions.invoke("stock", { body: { action: "ai", symbol: sym, name, facts } }); if (error) throw error; if (data.error) throw new Error(data.error); a = data.ai; } catch (e) { err = e.message; }
    if (!document.getElementById("sk-ai")) return;
    const P = (a && a.plans) || rp.plans, stance = (a && a.stance) || rp.stance;
    box.innerHTML = `<h2>🤖 我的看法 <span class="sk-stance ${stance === "偏多" ? "g" : stance === "偏空" ? "r" : "y"}">${stance}</span></h2>
      <p class="sk-view">${esc((a && a.view) || rp.view)}</p>
      ${a ? `<div class="sk-cols"><div><h3>👍 理由</h3><ul>${a.reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div><div><h3>⚠️ 要小心</h3><ul>${a.risks.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div></div>` : `<p class="tr-note">${err ? `AI 暫時沒回應（${esc(err)}），先給你規則版的建議。` : ""}</p>`}
      <h3>🧭 接下來怎麼做</h3>
      <div class="sk-plan"><div><b>📦 已經有持股</b><p>${esc(P.holding)}</p></div><div><b>🛒 想要進場</b><p>${esc(P.buying)}</p></div><div><b>👀 先觀望</b><p>${esc(P.watching)}</p></div></div>
      ${a && a.watch ? `<h3>📅 接下來 1–3 個月要追蹤</h3><ul>${a.watch.map(r => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}
      <div class="tr-row"><button type="button" class="btn btn-small" data-sk="again">🔄 重新分析</button><button type="button" class="btn btn-small" data-sk="sim">📈 拿去模擬交易</button></div>`;
  }

  function onClick(e) {
    const b = e.target.closest("[data-sk]"); if (!b) return;
    const a = b.dataset.sk;
    if (a === "go") go(document.getElementById("sk-sym").value);
    if (a === "pick") go(b.dataset.v);
    if (a === "again") go(st.last);
    if (a === "sim") { try { const S = JSON.parse(store.get("tradeSim") || "{}"); S.sym = st.last; S.mk = mkOf(st.last); store.set("tradeSim", JSON.stringify(S)); } catch (_) {} location.hash = "#trade"; location.reload(); }
  }

  const css = document.createElement("style");
  css.textContent = `
    .sk-title { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; } .sk-title small { opacity: .65; font-size: 12px; } .sk-title > div > b { font-size: 20px; }
    .sk-px { font-size: 22px; font-weight: 700; margin-top: 4px; } .sk-px span { font-size: 12.5px; font-weight: 500; margin-left: 6px; }
    .sk-total { text-align: center; border-radius: 14px; padding: 8px 12px; min-width: 70px; } .sk-total b { font-size: 28px; display: block; line-height: 1.1; } .sk-total small { font-size: 11px; opacity: .8; }
    .sk-total.sg { background: rgba(63,185,80,.18); color: #3fb950; } .sk-total.sy { background: rgba(227,179,65,.18); color: #e3b341; } .sk-total.sr { background: rgba(248,81,73,.18); color: #f85149; }
    .sk-dim { border-bottom: 1px solid rgba(127,127,127,.15); padding: 6px 0; } .sk-dim summary { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; list-style: none; }
    .sk-dim summary::-webkit-details-marker { display: none; } .sk-dim summary span { flex: 0 0 9.5em; } .sk-dim summary b { width: 2.2em; text-align: right; } .sk-dim summary em { opacity: .6; font-size: 12px; font-style: normal; margin-left: auto; }
    .sk-dim ul { margin: 6px 0 2px; padding-left: 20px; font-size: 13px; } .sk-dim li { margin: 2px 0; }
    .sk-bar { flex: 1; height: 8px; border-radius: 6px; background: rgba(127,127,127,.18); overflow: hidden; } .sk-bar i { display: block; height: 100%; border-radius: 6px; }
    .sk-res { stroke: rgba(248,81,73,.55); stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; } .sk-sup { stroke: rgba(63,185,80,.6); stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; }
    .sk-m60 { fill: none; stroke: #e3b341; stroke-width: 1.2; vector-effect: non-scaling-stroke; } .sk-m200 { fill: none; stroke: #b48cff; stroke-width: 1.2; vector-effect: non-scaling-stroke; } .sk-k60 { fill: #e3b341; } .sk-k200 { fill: #b48cff; }
    .sk-stance { font-size: 13px; padding: 2px 10px; border-radius: 999px; vertical-align: middle; } .sk-stance.g { background: rgba(63,185,80,.2); color: #3fb950; } .sk-stance.y { background: rgba(227,179,65,.2); color: #e3b341; } .sk-stance.r { background: rgba(248,81,73,.2); color: #f85149; }
    .sk-view { font-size: 15px; font-weight: 600; margin: 6px 0 10px; } #sk-ai h3 { font-size: 14px; margin: 12px 0 4px; } #sk-ai ul { padding-left: 20px; font-size: 13.5px; margin: 4px 0; } #sk-ai li { margin: 3px 0; }
    .sk-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
    .sk-plan { display: grid; gap: 8px; } .sk-plan > div { padding: 10px 12px; border-radius: 10px; background: rgba(127,127,127,.08); } .sk-plan p { margin: 4px 0 0; font-size: 13.5px; }`;
  document.head.appendChild(css);

  if (typeof window.applyPage === "function") {
    const base = window.applyPage;
    window.applyPage = function (name) { const r = base.apply(this, arguments); if (name === "stock") setTimeout(() => { ensurePage(); if (!document.querySelector("#sk-out section")) go(st.last); }, 0); return r; };
  }
  function boot() { try { ensurePage(); } catch (e) { console.warn(e); } if (location.hash === "#stock" && typeof applyPage === "function") setTimeout(() => applyPage("stock"), 0); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
