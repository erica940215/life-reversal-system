/* 📈 模擬交易：用公式在加密貨幣／台股／美股上模擬買賣
   ‧ 歷史回測：用過去的日 K 跑策略，看勝率、賺多少、最大回撤
   ‧ 往後模擬：把策略和參數鎖住，從今天開始照公式自動買賣，之後回來看成績
   行情：edge function「market」（Yahoo Finance）；資料表：sql/2026-11-12_模擬交易.sql
   規則：只做多、全進全出；收盤出訊號，隔天開盤成交（不偷看未來）；每次買賣都扣手續費 */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };

  const MARKETS = {
    crypto: { label: "🪙 加密貨幣", list: [["BTC-USD", "比特幣"], ["ETH-USD", "以太幣"], ["SOL-USD", "Solana"], ["BNB-USD", "BNB"], ["DOGE-USD", "狗狗幣"]] },
    tw: { label: "🇹🇼 台股", list: [["0050.TW", "元大台灣50"], ["2330.TW", "台積電"], ["2317.TW", "鴻海"], ["2454.TW", "聯發科"], ["00878.TW", "國泰永續高股息"]] },
    us: { label: "🇺🇸 美股", list: [["SPY", "標普500"], ["QQQ", "那斯達克100"], ["AAPL", "蘋果"], ["NVDA", "輝達"], ["TSLA", "特斯拉"]] }
  };

  /* ---------- 指標 ---------- */
  const sma = (a, n) => a.map((_, i) => { if (i < n - 1) return null; let s = 0; for (let j = i - n + 1; j <= i; j++) s += a[j]; return s / n; });
  const ema = (a, n) => { const k = 2 / (n + 1), o = []; let p = null; a.forEach((v, i) => { p = p == null ? v : v * k + p * (1 - k); o.push(i < n - 1 ? null : p); }); return o; };
  const std = (a, n) => { const m = sma(a, n); return a.map((_, i) => { if (m[i] == null) return null; let s = 0; for (let j = i - n + 1; j <= i; j++) s += (a[j] - m[i]) ** 2; return Math.sqrt(s / n); }); };
  const rsi = (a, n) => { const o = [null]; let g = 0, l = 0; for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up / n; l += dn / n; o.push(i === n ? (l === 0 ? 100 : 100 - 100 / (1 + g / l)) : null); }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o.push(l === 0 ? 100 : 100 - 100 / (1 + g / l)); } } return o; };

  /* ---------- 策略：回傳每天收盤後「想不想持有」（1 / 0 / null=維持） ---------- */
  const STRATS = {
    buyhold: { name: "📦 買進持有", desc: "第一天買進就一直抱著。拿來當比較的基準：策略要贏它才有意義。", params: [],
      sig: b => b.map(() => 1) },
    sma: { name: "📐 均線交叉", desc: "短均線站上長均線就買（黃金交叉），跌破就賣（死亡交叉）。跟著趨勢走。",
      params: [["fast", "短均線（天）", 20, 2, 200], ["slow", "長均線（天）", 60, 5, 400]],
      sig: (b, p) => { const c = b.map(x => x.c), f = sma(c, p.fast), s = sma(c, p.slow); return c.map((_, i) => f[i] == null || s[i] == null ? null : f[i] > s[i] ? 1 : 0); } },
    rsi: { name: "🌡️ RSI 超買超賣", desc: "RSI 跌到很低（大家恐慌）就買，漲到很高（大家瘋狂）就賣。逆勢抄底。",
      params: [["n", "RSI 天數", 14, 2, 50], ["lo", "低於多少買", 30, 5, 50], ["hi", "高於多少賣", 70, 50, 95]],
      sig: (b, p) => rsi(b.map(x => x.c), p.n).map(v => v == null ? null : v < p.lo ? 1 : v > p.hi ? 0 : null) },
    boll: { name: "🎯 布林通道", desc: "價格跌破下軌（比平常便宜很多）就買，回到中線就賣。賭價格會回到平均。",
      params: [["n", "天數", 20, 5, 100], ["k", "幾倍標準差", 2, 0.5, 4]],
      sig: (b, p) => { const c = b.map(x => x.c), m = sma(c, p.n), s = std(c, p.n); return c.map((v, i) => m[i] == null ? null : v < m[i] - p.k * s[i] ? 1 : v > m[i] ? 0 : null); } },
    macd: { name: "🌊 MACD", desc: "快慢 EMA 的差（MACD 線）站上訊號線就買，跌破就賣。抓動能轉強轉弱。",
      params: [["f", "快線", 12, 2, 50], ["s", "慢線", 26, 5, 100], ["g", "訊號線", 9, 2, 30]],
      sig: (b, p) => { const c = b.map(x => x.c), f = ema(c, p.f), s = ema(c, p.s), m = c.map((_, i) => f[i] == null || s[i] == null ? null : f[i] - s[i]);
        const first = m.findIndex(v => v != null), sg = first < 0 ? m.map(() => null) : m.map(() => null).concat([]);
        if (first >= 0) ema(m.slice(first), p.g).forEach((v, j) => { sg[first + j] = v; });
        return m.map((v, i) => v == null || sg[i] == null ? null : v > sg[i] ? 1 : 0); } },
    breakout: { name: "🚀 通道突破", desc: "收盤創下最近 N 天新高就追進，跌破最近 M 天新低就出場。海龜交易法的簡化版。",
      params: [["n", "突破幾天新高", 20, 5, 200], ["m", "跌破幾天新低", 10, 3, 100]],
      sig: (b, p) => b.map((x, i) => { if (i < p.n) return null; let hi = -Infinity, lo = Infinity;
        for (let j = i - p.n; j < i; j++) hi = Math.max(hi, b[j].h); for (let j = Math.max(0, i - p.m); j < i; j++) lo = Math.min(lo, b[j].l);
        return x.c > hi ? 1 : x.c < lo ? 0 : null; }) }
  };
  const defParams = k => Object.fromEntries(STRATS[k].params.map(p => [p[0], p[2]]));

  /* ---------- 模擬 ---------- */
  function simulate(bars, key, params, capital, feePct, fromIdx = 0) {
    const sig = STRATS[key].sig(bars, params), fee = feePct / 100;
    let cash = capital, units = 0, want = 0, entry = null;
    const trades = [], eq = [];
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      if (i > fromIdx) { /* 用昨天收盤的訊號，在今天開盤成交 */
        const px = b.o || b.c;
        if (want === 1 && units === 0) { units = cash * (1 - fee) / px; entry = { i, t: b.t, px, cost: cash }; cash = 0; }
        else if (want === 0 && units > 0) { const got = units * px * (1 - fee); trades.push({ in: entry, out: { i, t: b.t, px }, pnl: got / entry.cost - 1 }); cash = got; units = 0; entry = null; }
      }
      if (i >= fromIdx) { if (sig[i] != null) want = sig[i]; if (key === "buyhold") want = 1; }
      eq.push(i < fromIdx ? null : cash + units * b.c);
    }
    const last = bars[bars.length - 1], final = cash + units * last.c, open = units > 0 ? { in: entry, pnl: units * last.c * (1 - fee) / entry.cost - 1 } : null;
    let peak = capital, mdd = 0; eq.forEach(v => { if (v == null) return; peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); });
    const wins = trades.filter(t => t.pnl > 0), loss = trades.filter(t => t.pnl <= 0);
    const avg = a => a.length ? a.reduce((s, t) => s + t.pnl, 0) / a.length : 0;
    const days = (last.t - bars[fromIdx].t) / 864e5, ret = final / capital - 1;
    const bh = last.c / (bars[fromIdx + 1] ? bars[fromIdx + 1].o || bars[fromIdx + 1].c : bars[fromIdx].c) - 1;
    const exposure = eq.length ? trades.reduce((s, t) => s + (t.out.i - t.in.i), 0) + (open ? bars.length - 1 - open.in.i : 0) : 0;
    return { trades, open, eq, final, ret, mdd, bh, days, cagr: days > 180 ? Math.pow(Math.max(final, 0) / capital, 365 / days) - 1 : null,
      win: trades.length ? wins.length / trades.length : null, avgW: avg(wins), avgL: avg(loss), nW: wins.length, nL: loss.length,
      pf: loss.length && avg(loss) ? -wins.reduce((s, t) => s + t.pnl, 0) / loss.reduce((s, t) => s + t.pnl, 0) : null,
      exposure: (exposure / Math.max(1, bars.length - 1 - fromIdx)), sig };
  }

  /* ---------- 行情 ---------- */
  const CACHE = {};
  async function bars(symbol, range) {
    const key = symbol + "|" + range;
    if (CACHE[key] && Date.now() - CACHE[key].at < 10 * 60 * 1000) return CACHE[key].d;
    const { data, error } = await db.functions.invoke("market", { body: { symbol, range } });
    if (error) { let m = error.message; try { const b = await error.context.json(); if (b && b.error) m = b.error; } catch (_) {} throw new Error(m); }
    if (!data || !data.bars || data.bars.length < 30) throw new Error(`${symbol} 的資料太少`);
    CACHE[key] = { at: Date.now(), d: data };
    return data;
  }

  /* ---------- 畫圖：上面價格＋買賣點，下面資金曲線 vs 買進持有 ---------- */
  function chart(b, r, fromIdx = 0, capital = 100000) {
    const W = 640, H = 230, P = 8, N = b.length, xs = i => P + (i - fromIdx) / Math.max(1, N - 1 - fromIdx) * (W - 2 * P);
    const seg = b.slice(fromIdx), lo = Math.min(...seg.map(x => x.l || x.c)), hi = Math.max(...seg.map(x => x.h || x.c));
    const yp = v => P + (1 - (v - lo) / (hi - lo || 1)) * (120 - 2 * P);
    const price = seg.map((x, j) => `${j ? "L" : "M"}${xs(fromIdx + j).toFixed(1)},${yp(x.c).toFixed(1)}`).join("");
    const bh = seg.map(x => capital * x.c / seg[0].c), eq = r.eq.slice(fromIdx);
    const all = bh.concat(eq).filter(v => v != null), elo = Math.min(...all), ehi = Math.max(...all);
    const ye = v => 132 + (1 - (v - elo) / (ehi - elo || 1)) * (H - 140);
    const line = a => a.map((v, j) => v == null ? "" : `${j ? "L" : "M"}${xs(fromIdx + j).toFixed(1)},${ye(v).toFixed(1)}`).join("");
    const mk = [];
    r.trades.forEach(t => { mk.push(`<path d="M${xs(t.in.i)},${yp(t.in.px) + 9}l-4,6h8z" class="tr-buy"/>`, `<path d="M${xs(t.out.i)},${yp(t.out.px) - 9}l-4,-6h8z" class="tr-sell"/>`); });
    if (r.open) mk.push(`<path d="M${xs(r.open.in.i)},${yp(r.open.in.px) + 9}l-4,6h8z" class="tr-buy"/>`);
    return `<svg class="tr-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <text x="${P}" y="14" class="tr-ax">價格（▲買 ▼賣）</text><path d="${price}" class="tr-price"/>${mk.join("")}
      <line x1="0" x2="${W}" y1="126" y2="126" class="tr-sep"/>
      <text x="${P}" y="144" class="tr-ax">資金：<tspan class="tr-k1">━ 策略</tspan>　<tspan class="tr-k2">━ 買進持有</tspan></text>
      <path d="${line(bh)}" class="tr-bh"/><path d="${line(eq)}" class="tr-eq"/></svg>`;
  }

  const pct = (v, d = 1) => v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
  const cls = v => v == null ? "" : v >= 0 ? "up" : "dn";
  const money = v => Math.round(v).toLocaleString();
  const day = t => new Date(t).toLocaleDateString("zh-TW", { year: "2-digit", month: "2-digit", day: "2-digit" });

  function stats(r, capital) {
    const s = (k, v, c = "") => `<div class="tr-st"><small>${k}</small><b class="${c}">${v}</b></div>`;
    return `<div class="tr-stats">
      ${s("總報酬", pct(r.ret), cls(r.ret))}${s("買進持有", pct(r.bh), cls(r.bh))}
      ${s("贏過持有", pct(r.ret - r.bh), cls(r.ret - r.bh))}${s("最後資金", money(r.final), cls(r.ret))}
      ${s("勝率", r.win == null ? "—" : `${Math.round(r.win * 100)}%`, r.win == null ? "" : r.win >= 0.5 ? "up" : "dn")}${s("交易次數", `${r.trades.length}（${r.nW} 勝 ${r.nL} 敗）`)}
      ${s("平均賺／賠", `${pct(r.avgW)}／${pct(r.avgL)}`)}${s("獲利因子", r.pf == null ? "—" : r.pf.toFixed(2), r.pf == null ? "" : r.pf >= 1 ? "up" : "dn")}
      ${s("最大回撤", pct(r.mdd), "dn")}${s("年化報酬", pct(r.cagr), cls(r.cagr))}${s("持倉時間", `${Math.round(r.exposure * 100)}%`)}
      ${s("現在", r.open ? `持有中 ${pct(r.open.pnl)}` : "空手", r.open ? cls(r.open.pnl) : "")}</div>`;
  }

  function tradeList(r) {
    if (!r.trades.length && !r.open) return `<p class="tr-note">這段期間沒有任何買賣訊號。</p>`;
    const rows = r.trades.slice().reverse().slice(0, 60).map(t => `<tr><td>${day(t.in.t)}</td><td>${t.in.px.toPrecision(5)}</td><td>${day(t.out.t)}</td><td>${t.out.px.toPrecision(5)}</td><td class="${cls(t.pnl)}">${pct(t.pnl)}</td><td>${Math.round((t.out.t - t.in.t) / 864e5)} 天</td></tr>`);
    if (r.open) rows.unshift(`<tr class="open"><td>${day(r.open.in.t)}</td><td>${r.open.in.px.toPrecision(5)}</td><td colspan="2">持有中</td><td class="${cls(r.open.pnl)}">${pct(r.open.pnl)}</td><td></td></tr>`);
    return `<details class="tr-list"><summary>📜 每一筆交易（${r.trades.length}${r.open ? "＋1 持有中" : ""}）</summary><div class="tr-scroll"><table><tr><th>買進</th><th>價格</th><th>賣出</th><th>價格</th><th>損益</th><th>持有</th></tr>${rows.join("")}</table></div></details>`;
  }

  /* ---------- 狀態與畫面 ---------- */
  const S = JSON.parse(store.get("tradeSim") || "null") || { mk: "crypto", sym: "BTC-USD", range: "5y", st: "sma", params: {}, cap: 100000, fee: 0.1 };
  const save = () => store.set("tradeSim", JSON.stringify(S));
  let runs = [], busy = false;

  function ensurePage() {
    if (!document.querySelector('.tab-btn[data-page="trade"]')) {
      const nav = document.getElementById("tab-nav");
      if (nav) { const b = document.createElement("button"); b.className = "tab-btn"; b.type = "button"; b.dataset.page = "trade";
        b.innerHTML = '<span class="tab-icon">📈</span><span class="tab-label">模擬交易</span>'; b.addEventListener("click", () => showPage("trade")); nav.appendChild(b); }
    }
    let page = document.querySelector('.page[data-page="trade"]');
    if (!page) {
      const c = document.querySelector("#app-section > .container"); if (!c) return null;
      page = document.createElement("div"); page.className = "page"; page.dataset.page = "trade"; c.appendChild(page);
      page.innerHTML = `<div id="tr-root"></div>`;
      page.addEventListener("click", onClick); page.addEventListener("change", onChange);
    }
    if (typeof PAGES !== "undefined" && Array.isArray(PAGES) && !PAGES.includes("trade")) PAGES.push("trade");
    return page;
  }

  function form() {
    const st = STRATS[S.st], p = Object.assign(defParams(S.st), S.params[S.st] || {});
    return `<section class="card"><h2>📈 模擬交易</h2>
      <p class="tr-note">挑一個市場和一套公式，看看照著做會不會賺錢。收盤出訊號、隔天開盤成交，每次買賣扣手續費；只做多、全進全出。</p>
      <div class="tr-row">${Object.entries(MARKETS).map(([k, m]) => `<button type="button" class="tr-chip ${S.mk === k ? "on" : ""}" data-tr="mk" data-v="${k}">${m.label}</button>`).join("")}</div>
      <div class="tr-row">${MARKETS[S.mk].list.map(([s, n]) => `<button type="button" class="tr-chip sm ${S.sym === s ? "on" : ""}" data-tr="sym" data-v="${s}">${n}</button>`).join("")}
        <input id="tr-sym" class="tr-in" value="${esc(S.sym)}" title="也可以自己輸入代號：台股加 .TW（上櫃 .TWO），加密貨幣用 XXX-USD" style="width:110px"></div>
      <div class="tr-grid">
        <label>策略<select id="tr-st">${Object.entries(STRATS).map(([k, v]) => `<option value="${k}" ${k === S.st ? "selected" : ""}>${v.name}</option>`).join("")}</select></label>
        <label>回測期間<select id="tr-range">${[["1y", "1 年"], ["2y", "2 年"], ["5y", "5 年"], ["10y", "10 年"]].map(([k, n]) => `<option value="${k}" ${k === S.range ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label>本金<input id="tr-cap" type="number" min="1000" step="1000" value="${S.cap}"></label>
        <label>手續費 %（單邊）<input id="tr-fee" type="number" min="0" max="2" step="0.01" value="${S.fee}"></label>
        ${st.params.map(([k, n, , mn, mx]) => `<label>${n}<input data-p="${k}" type="number" min="${mn}" max="${mx}" step="${k === "k" ? 0.1 : 1}" value="${p[k]}"></label>`).join("")}
      </div>
      <p class="tr-desc">${st.desc}</p>
      <div class="tr-row"><button type="button" class="btn btn-primary" data-tr="run">▶️ 回測</button><button type="button" class="btn" data-tr="cmp">⚖️ 所有策略比一比</button><button type="button" class="btn" data-tr="fwd">🔒 從今天開始往後模擬</button></div>
      <div id="tr-out"></div>
      <p class="tr-note small">⚠️ 這是用過去資料做的模擬，不代表未來會一樣，也不是投資建議。真實交易還有滑價、稅、流動性等成本。</p></section>
      <section class="card"><h2>🔒 往後模擬</h2><p class="tr-note">建立時把策略和參數鎖住，從起始日開始照公式自動買賣。不能事後改參數，所以成績是真的「沒看答案」。</p><div id="tr-runs">${runs.length ? "" : `<p class="tr-note">還沒有。設定好策略後按「🔒 從今天開始往後模擬」。</p>`}</div></section>`;
  }

  function render() {
    const page = ensurePage(); if (!page) return;
    page.querySelector("#tr-root").innerHTML = form();
    renderRuns();
  }

  const curParams = () => { const p = defParams(S.st); document.querySelectorAll("#tr-root [data-p]").forEach(i => { const v = Number(i.value); if (isFinite(v)) p[i.dataset.p] = v; }); return p; };
  function readForm() {
    const v = id => document.getElementById(id);
    S.sym = (v("tr-sym").value || S.sym).trim().toUpperCase(); S.range = v("tr-range").value; S.st = v("tr-st").value;
    S.cap = Math.max(1000, Number(v("tr-cap").value) || 100000); S.fee = Math.max(0, Math.min(2, Number(v("tr-fee").value) || 0));
    S.params[S.st] = curParams(); save();
  }

  async function runOne() {
    readForm(); const out = document.getElementById("tr-out");
    if (S.st === "sma" && S.params.sma.fast >= S.params.sma.slow) return toast("短均線要比長均線短");
    out.innerHTML = `<p class="tr-note">載入 ${esc(S.sym)} 行情中…</p>`;
    try {
      const d = await bars(S.sym, S.range), r = simulate(d.bars, S.st, S.params[S.st], S.cap, S.fee);
      out.innerHTML = `<div class="tr-head"><b>${esc(d.name)}</b> <small>${esc(S.sym)}・${day(d.bars[0].t)} → ${day(d.bars[d.bars.length - 1].t)}・${d.bars.length} 根日 K・${esc(d.currency || "")}</small></div>
        ${chart(d.bars, r, 0, S.cap)}${stats(r, S.cap)}${verdict(r)}${tradeList(r)}`;
    } catch (e) { out.innerHTML = `<p class="tr-note dn">😵 ${esc(e.message)}${/Function not found|404|Failed to send/.test(e.message) ? "（行情服務還沒準備好）" : ""}</p>`; }
  }

  function verdict(r) {
    const beat = r.ret - r.bh;
    let m = r.ret < 0 ? "📉 這套公式在這段期間是賠錢的。" : beat >= 0 ? "🏆 這套公式贏過一直抱著不動。" : "🤔 有賺，但沒贏過一直抱著不動。";
    if (r.mdd < -0.4) m += "中途最慘曾經虧掉四成以上，心臟要很大顆。";
    if (r.trades.length < 5) m += "交易次數太少，勝率參考價值不高。";
    else if (r.win != null && r.win < 0.45 && r.ret > 0) m += "勝率不高但有賺，代表是靠少數大賺撐起來的。";
    return `<p class="tr-verdict">${m}</p>`;
  }

  async function compare() {
    readForm(); const out = document.getElementById("tr-out");
    out.innerHTML = `<p class="tr-note">載入 ${esc(S.sym)} 行情中…</p>`;
    try {
      const d = await bars(S.sym, S.range);
      const rows = Object.keys(STRATS).map(k => { const p = k === S.st ? S.params[k] : Object.assign(defParams(k), S.params[k] || {}); return [k, simulate(d.bars, k, p, S.cap, S.fee)]; }).sort((a, b) => b[1].ret - a[1].ret);
      out.innerHTML = `<div class="tr-head"><b>${esc(d.name)}</b> <small>${esc(S.sym)}・${day(d.bars[0].t)} → ${day(d.bars[d.bars.length - 1].t)}・各策略用你目前的參數</small></div>
        <div class="tr-scroll"><table class="tr-cmp"><tr><th>策略</th><th>總報酬</th><th>勝率</th><th>次數</th><th>最大回撤</th><th>年化</th></tr>
        ${rows.map(([k, r], i) => `<tr data-tr="pick" data-v="${k}"><td>${i === 0 ? "🥇 " : ""}${STRATS[k].name}</td><td class="${cls(r.ret)}">${pct(r.ret)}</td><td>${r.win == null ? "—" : Math.round(r.win * 100) + "%"}</td><td>${r.trades.length}</td><td class="dn">${pct(r.mdd)}</td><td class="${cls(r.cagr)}">${pct(r.cagr)}</td></tr>`).join("")}</table></div>
        <p class="tr-note">點一列就切到那個策略再回測。</p>`;
    } catch (e) { out.innerHTML = `<p class="tr-note dn">😵 ${esc(e.message)}</p>`; }
  }

  /* ---------- 往後模擬 ---------- */
  async function loadRuns() {
    const { data, error } = await db.from("trade_runs").select("*").order("created_at", { ascending: false });
    if (error) { const el = document.getElementById("tr-runs"); if (el) el.innerHTML = `<p class="tr-note">${/trade_runs/.test(error.message) ? "資料庫還沒設定：到 Supabase 執行 sql/2026-11-12_模擬交易.sql" : esc(error.message)}</p>`; return; }
    runs = data || []; renderRuns();
  }

  async function renderRuns() {
    const el = document.getElementById("tr-runs"); if (!el) return;
    if (!runs.length) { el.innerHTML = `<p class="tr-note">還沒有。設定好策略後按「🔒 從今天開始往後模擬」。</p>`; return; }
    el.innerHTML = runs.map(r => `<div class="tr-run" id="run-${r.id}"><div class="tr-run-h"><b>${esc(r.name)}</b><small>${esc(r.symbol)}・${STRATS[r.strategy] ? STRATS[r.strategy].name : r.strategy}・從 ${r.start_date} 開始</small><button type="button" class="tr-x" data-tr="del" data-v="${r.id}" title="刪除">✕</button></div><div class="tr-run-b"><p class="tr-note">計算中…</p></div></div>`).join("");
    for (const r of runs) {
      const box = document.querySelector(`#run-${r.id} .tr-run-b`); if (!box) continue;
      try {
        const d = await bars(r.symbol, "2y"), start = new Date(r.start_date + "T00:00:00+08:00").getTime();
        let from = d.bars.findIndex(b => b.t >= start);
        const daysIn = Math.floor((Date.now() - start) / 864e5);
        if (from < 0 || from >= d.bars.length - 1) { box.innerHTML = `<p class="tr-note">⏳ 第 ${daysIn + 1} 天：還在等起始日之後的第一根 K 線，明天收盤後再回來看。</p>`; continue; }
        const res = simulate(d.bars, r.strategy, r.params, Number(r.capital), Number(r.fee), from);
        const want = res.sig.slice(0, d.bars.length).reduce((a, v) => v == null ? a : v, r.strategy === "buyhold" ? 1 : 0);
        box.innerHTML = `<p class="tr-note">已經跑了 ${daysIn} 天・${d.bars.length - 1 - from} 根 K 線。下一個開盤要：<b>${want ? (res.open ? "繼續持有" : "買進 🟢") : (res.open ? "賣出 🔴" : "繼續空手")}</b></p>${chart(d.bars, res, from, Number(r.capital))}${stats(res, Number(r.capital))}${tradeList(res)}`;
      } catch (e) { box.innerHTML = `<p class="tr-note dn">😵 ${esc(e.message)}</p>`; }
    }
  }

  async function createRun() {
    readForm();
    if (S.st === "sma" && S.params.sma.fast >= S.params.sma.slow) return toast("短均線要比長均線短");
    try { await bars(S.sym, "1y"); } catch (e) { return toast("😵 " + e.message); }
    const name = prompt("幫這個模擬取個名字", `${S.sym} ${STRATS[S.st].name.replace(/^\S+\s/, "")}`); if (name == null) return;
    const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    const { error } = await db.from("trade_runs").insert({ name: name.slice(0, 40) || S.sym, symbol: S.sym, strategy: S.st, params: S.params[S.st], capital: S.cap, fee: S.fee, start_date: today });
    if (error) return toast(error.message);
    toast("🔒 開始往後模擬了，之後回來看成績"); loadRuns();
  }

  async function onClick(e) {
    const b = e.target.closest("[data-tr]"); if (!b || busy) return;
    const a = b.dataset.tr, v = b.dataset.v;
    if (a === "mk") { readForm(); S.mk = v; S.sym = MARKETS[v].list[0][0]; save(); render(); return; }
    if (a === "sym") { readForm(); S.sym = v; save(); render(); return; }
    if (a === "pick") { S.st = v; save(); render(); return runOne(); }
    if (a === "del") { if (!confirm("刪除這個往後模擬？")) return; const { error } = await db.from("trade_runs").delete().eq("id", v); if (error) return toast(error.message); runs = runs.filter(r => r.id !== v); return renderRuns(); }
    busy = true;
    try { if (a === "run") await runOne(); else if (a === "cmp") await compare(); else if (a === "fwd") await createRun(); } finally { busy = false; }
  }
  function onChange(e) { if (e.target.id === "tr-st") { readForm(); render(); } }

  const css = document.createElement("style");
  css.textContent = `
    .tr-note { font-size: 12.5px; opacity: .75; margin: 4px 0; } .tr-note.small { font-size: 11.5px; opacity: .6; margin-top: 10px; }
    .tr-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; align-items: center; }
    .tr-chip { border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; }
    .tr-chip.sm { padding: 4px 10px; font-size: 12.5px; } .tr-chip.on { background: var(--accent, #6c63ff); border-color: transparent; color: #fff; }
    .tr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin: 8px 0; }
    .tr-grid label { font-size: 12px; opacity: .9; display: flex; flex-direction: column; gap: 3px; }
    .tr-grid input, .tr-grid select, .tr-in { font: inherit; font-size: 14px; padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(127,127,127,.35); background: rgba(127,127,127,.08); color: inherit; min-width: 0; }
    .tr-desc { font-size: 13px; padding: 8px 10px; border-radius: 10px; background: rgba(127,127,127,.1); margin: 6px 0; }
    .tr-head { margin: 12px 0 4px; } .tr-head small { opacity: .65; font-size: 11.5px; }
    .tr-chart { width: 100%; height: 230px; display: block; background: rgba(127,127,127,.06); border-radius: 10px; }
    .tr-price { fill: none; stroke: #8aa4c8; stroke-width: 1.4; vector-effect: non-scaling-stroke; }
    .tr-eq { fill: none; stroke: #3fb950; stroke-width: 2; vector-effect: non-scaling-stroke; } .tr-bh { fill: none; stroke: #e3b341; stroke-width: 1.4; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; }
    .tr-buy { fill: #3fb950; } .tr-sell { fill: #f85149; } .tr-sep { stroke: rgba(127,127,127,.3); vector-effect: non-scaling-stroke; }
    .tr-ax { font-size: 11px; fill: currentColor; opacity: .6; } .tr-k1 { fill: #3fb950; } .tr-k2 { fill: #e3b341; }
    .tr-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 6px; margin: 10px 0; }
    .tr-st { padding: 8px 10px; border-radius: 10px; background: rgba(127,127,127,.08); } .tr-st small { display: block; font-size: 11px; opacity: .65; } .tr-st b { font-size: 15px; }
    .up { color: #3fb950; } .dn { color: #f85149; }
    .tr-verdict { font-size: 13.5px; padding: 8px 10px; border-left: 3px solid var(--accent, #6c63ff); background: rgba(127,127,127,.06); border-radius: 6px; }
    .tr-scroll { overflow-x: auto; } .tr-list summary { cursor: pointer; font-size: 13px; margin: 8px 0; }
    .tr-scroll table { width: 100%; border-collapse: collapse; font-size: 12.5px; white-space: nowrap; } .tr-scroll th, .tr-scroll td { padding: 5px 6px; text-align: right; border-bottom: 1px solid rgba(127,127,127,.15); }
    .tr-scroll th:first-child, .tr-scroll td:first-child { text-align: left; } .tr-scroll tr.open td { font-weight: 600; }
    .tr-cmp tr[data-tr] { cursor: pointer; } .tr-cmp tr[data-tr]:hover td { background: rgba(127,127,127,.08); }
    .tr-run { border: 1px solid rgba(127,127,127,.25); border-radius: 12px; padding: 10px; margin: 8px 0; }
    .tr-run-h { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; } .tr-run-h small { opacity: .65; font-size: 11.5px; flex: 1; }
    .tr-x { border: 0; background: none; color: inherit; opacity: .5; cursor: pointer; font-size: 14px; }`;
  document.head.appendChild(css);

  if (typeof window.applyPage === "function") {
    const base = window.applyPage;
    window.applyPage = function (name) { const r = base.apply(this, arguments); if (name === "trade") setTimeout(() => { if (!document.getElementById("tr-out")) render(); if (hasDb()) loadRuns(); }, 0); return r; };
  }
  function boot() { try { ensurePage(); render(); } catch (e) { console.warn(e); } if (location.hash === "#trade" && typeof applyPage === "function") setTimeout(() => applyPage("trade"), 0); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  window.TradeSim = { simulate, STRATS };
})();
