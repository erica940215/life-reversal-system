/* 📈 模擬交易：用公式在加密貨幣／台股／美股上模擬買賣
   ‧ 歷史回測、策略比一比、參數地圖、月報酬熱力圖、報酬分布、蒙地卡羅壓力測試
   ‧ 🤖 AI 挑選：滾動式驗證（每一段都只用過去挑、往後考），找最佳標的＋策略＋參數
   ‧ 進階：多空切換、大盤濾網、停損／停利／移動停利、波動調整部位、真實成本（稅、滑價）、台幣計價
   ‧ 策略：6 種經典＋投票組合＋定期定額＋自訂公式
   ‧ 💼 投資組合：多檔配置＋定期再平衡
   ‧ 🔒 往後模擬：鎖住參數往後跑，附 🩺 體檢、今日頁訊號卡、🔔 訊號提醒
   行情：edge function「market」（Yahoo Finance）；資料表：sql/2026-11-12_模擬交易.sql
   規則：收盤出訊號，隔天開盤成交（不偷看未來）；停損停利用當天高低價判斷 */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };
  const tick = () => new Promise(r => setTimeout(r, 0));

  const MARKETS = {
    crypto: { label: "🪙 加密貨幣", bench: "BTC-USD", list: [["BTC-USD", "比特幣"], ["ETH-USD", "以太幣"], ["SOL-USD", "Solana"], ["BNB-USD", "BNB"], ["DOGE-USD", "狗狗幣"]] },
    tw: { label: "🇹🇼 台股", bench: "^TWII", list: [["0050.TW", "元大台灣50"], ["2330.TW", "台積電"], ["2317.TW", "鴻海"], ["2454.TW", "聯發科"], ["00878.TW", "國泰永續高股息"]] },
    us: { label: "🇺🇸 美股", bench: "SPY", list: [["SPY", "標普500"], ["QQQ", "那斯達克100"], ["AAPL", "蘋果"], ["NVDA", "輝達"], ["TSLA", "特斯拉"]] }
  };
  const mkOf = s => /-USD$/.test(s) ? "crypto" : /\.TWO?$/.test(s) || s === "^TWII" ? "tw" : "us";
  /* 真實成本（單邊 %）：台股手續費 0.1425% 打 6 折、賣出證交稅 0.3%（ETF 0.1%）；加密貨幣手續費 0.1%＋滑價；美股多半免手續費但有滑價 */
  const REAL = s => mkOf(s) === "tw" ? { fee: 0.0855, tax: /^00/.test(s) ? 0.1 : 0.3, slip: 0.05 } : mkOf(s) === "crypto" ? { fee: 0.1, tax: 0, slip: 0.05 } : { fee: 0, tax: 0, slip: 0.03 };

  /* ---------- 指標 ---------- */
  const sma = (a, n) => { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; };
  const ema = (a, n) => { const k = 2 / (n + 1), o = []; let p = null; a.forEach((v, i) => { p = p == null ? v : v * k + p * (1 - k); o.push(i < n - 1 ? null : p); }); return o; };
  const std = (a, n) => { const m = sma(a, n); return a.map((_, i) => { if (m[i] == null) return null; let s = 0; for (let j = i - n + 1; j <= i; j++) s += (a[j] - m[i]) ** 2; return Math.sqrt(s / n); }); };
  const rsi = (a, n) => { const o = [null]; let g = 0, l = 0; for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up / n; l += dn / n; o.push(i === n ? (l === 0 ? 100 : 100 - 100 / (1 + g / l)) : null); }
    else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o.push(l === 0 ? 100 : 100 - 100 / (1 + g / l)); } } return o; };
  const macdPair = (c, f, s, g) => { const F = ema(c, f), Sl = ema(c, s), m = c.map((_, i) => F[i] == null || Sl[i] == null ? null : F[i] - Sl[i]);
    const first = m.findIndex(v => v != null), sg = m.map(() => null); if (first >= 0) ema(m.slice(first), g).forEach((v, j) => { sg[first + j] = v; }); return [m, sg]; };
  const hh = (b, n) => b.map((_, i) => { if (i < n) return null; let h = -Infinity; for (let j = i - n; j < i; j++) h = Math.max(h, b[j].h); return h; });
  const ll = (b, n) => b.map((_, i) => { if (i < n) return null; let l = Infinity; for (let j = i - n; j < i; j++) l = Math.min(l, b[j].l); return l; });

  /* ---------- 🧩 自訂公式：例如「rsi(14) < 30 且 close > sma(200)」 ---------- */
  const FUNCS = {
    sma: (b, n) => sma(b.map(x => x.c), n), ema: (b, n) => ema(b.map(x => x.c), n), rsi: (b, n) => rsi(b.map(x => x.c), n),
    bbup: (b, n, k = 2) => { const c = b.map(x => x.c), m = sma(c, n), s = std(c, n); return m.map((v, i) => v == null ? null : v + k * s[i]); },
    bblow: (b, n, k = 2) => { const c = b.map(x => x.c), m = sma(c, n), s = std(c, n); return m.map((v, i) => v == null ? null : v - k * s[i]); },
    macd: (b, f = 12, s = 26, g = 9) => macdPair(b.map(x => x.c), f, s, g)[0], macdsig: (b, f = 12, s = 26, g = 9) => macdPair(b.map(x => x.c), f, s, g)[1],
    hh: (b, n) => hh(b, n), ll: (b, n) => ll(b, n), ret: (b, n) => b.map((x, i) => i < n ? null : (x.c / b[i - n].c - 1) * 100),
    vol: (b, n) => sma(b.map(x => x.v), n)
  };
  const VARS = { close: "c", open: "o", high: "h", low: "l", volume: "v" };
  function compile(src) {
    const s = String(src || "").replace(/且|而且|AND/g, " and ").replace(/或|OR/g, " or ").replace(/收盤/g, "close").replace(/開盤/g, "open").replace(/最高/g, "high").replace(/最低/g, "low").replace(/成交量/g, "volume").replace(/＞/g, ">").replace(/＜/g, "<").replace(/（/g, "(").replace(/）/g, ")").replace(/，/g, ",");
    const re = /\s*(\d+\.?\d*|[A-Za-z_]\w*|>=|<=|==|!=|[<>()+\-*\/,!])/y, toks = [];
    let m; re.lastIndex = 0; while (re.lastIndex < s.length && (m = re.exec(s))) toks.push(m[1]);
    if (s.slice(re.lastIndex).trim()) throw new Error(`看不懂：「${s.slice(re.lastIndex).trim().slice(0, 12)}」`);
    if (!toks.length) throw new Error("公式是空的");
    let js = "";
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (/^[A-Za-z_]/.test(t)) {
        const w = t.toLowerCase();
        if (w === "and") js += "&&"; else if (w === "or") js += "||"; else if (w === "not") js += "!";
        else if (VARS[w]) js += `V(i).${VARS[w]}`;
        else if (FUNCS[w]) {
          if (toks[i + 1] !== "(") throw new Error(`${w} 後面要接括號，例如 ${w}(20)`);
          const args = []; i += 2;
          while (i < toks.length && toks[i] !== ")") { if (toks[i] !== ",") { if (!/^\d/.test(toks[i])) throw new Error(`${w}() 裡面只能放數字`); args.push(Number(toks[i])); } i++; }
          if (toks[i] !== ")") throw new Error(`${w}( 少了右括號`);
          js += `F(${JSON.stringify(w)},${args.join(",") || ""})[i]`;
        } else throw new Error(`不認識「${t}」`);
      } else js += t === "==" ? "===" : t === "!=" ? "!==" : t;
    }
    const fn = new Function("F", "V", "i", `"use strict";const r=(${js});return r;`);
    return b => { const cache = {}, F = (w, ...a) => cache[w + a] || (cache[w + a] = FUNCS[w](b, ...a)), V = i => b[i];
      return b.map((_, i) => { try { const r = fn(F, V, i); return r == null || Number.isNaN(r) ? null : !!r; } catch (_) { return null; } }); };
  }
  const tryCompile = s => { try { compile(s); return null; } catch (e) { return e.message; } };

  /* ---------- 策略：回傳每天收盤後「想不想持有」（1 / 0 / null=維持） ---------- */
  const STRATS = {
    buyhold: { name: "📦 買進持有", desc: "第一天買進就一直抱著。拿來當比較的基準：策略要贏它才有意義。", params: [], sig: b => b.map(() => 1) },
    dca: { name: "🗓️ 定期定額", desc: "把本金平均分成每個月一份，每月第一個交易日固定買進，從不賣出。很多人最後會發現它最難被打敗。", params: [], sig: b => b.map(() => 1) },
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
      sig: (b, p) => { const [m, sg] = macdPair(b.map(x => x.c), p.f, p.s, p.g); return m.map((v, i) => v == null || sg[i] == null ? null : v > sg[i] ? 1 : 0); } },
    breakout: { name: "🚀 通道突破", desc: "收盤創下最近 N 天新高就追進，跌破最近 M 天新低就出場。海龜交易法的簡化版。",
      params: [["n", "突破幾天新高", 20, 5, 200], ["m", "跌破幾天新低", 10, 3, 100]],
      sig: (b, p) => { const H = hh(b, p.n), L = ll(b, p.m); return b.map((x, i) => H[i] == null || L[i] == null ? null : x.c > H[i] ? 1 : x.c < L[i] ? 0 : null); } },
    vote: { name: "🗳️ 策略投票", desc: "均線、MACD、突破、RSI、布林五套公式各投一票（都用預設參數），達到門檻票數才持有。單一策略容易失靈，組合起來通常比較穩。",
      params: [["need", "要幾票才買（1–5）", 3, 1, 5]],
      sig: (b, p) => { const keys = ["sma", "macd", "breakout", "rsi", "boll"], st = keys.map(() => 0), all = keys.map(k => STRATS[k].sig(b, defParams(k)));
        return b.map((_, i) => { all.forEach((a, j) => { if (a[i] != null) st[j] = a[i]; }); return i < 60 ? null : st.reduce((s, v) => s + v, 0) >= p.need ? 1 : 0; }); } },
    custom: { name: "🧩 自訂公式", desc: "自己寫買進和賣出條件。可用：close／open／high／low／volume、sma(n)、ema(n)、rsi(n)、bbup(n,k)、bblow(n,k)、macd()、macdsig()、hh(n) 前 n 天最高、ll(n) 前 n 天最低、ret(n) n 天漲跌%、vol(n) 均量；用「且／或」連接。",
      params: [], text: true,
      sig: (b, p) => { const B = compile(p.buy)(b), S = compile(p.sell)(b); return b.map((_, i) => B[i] ? 1 : S[i] ? 0 : null); } }
  };
  function defParams(k) { const o = Object.fromEntries(STRATS[k].params.map(p => [p[0], p[2]])); if (k === "custom") { o.buy = "rsi(14) < 30 且 close > sma(200)"; o.sell = "rsi(14) > 70 或 close < sma(200)"; } return o; }

  /* ---------- 模擬引擎 ---------- */
  const OPT0 = { fee: 0.1, tax: 0, slip: 0, mode: "long", filter: "none", sl: 0, tp: 0, trail: 0, sizing: "all", volT: 30, twd: false };
  const normOpt = o => typeof o === "number" ? Object.assign({}, OPT0, { fee: o }) : Object.assign({}, OPT0, o || {});
  const perYear = b => { if (b.length < 10) return 252; const gaps = []; for (let i = 1; i < Math.min(b.length, 60); i++) gaps.push((b[i].t - b[i - 1].t) / 864e5); return gaps.filter(g => g < 1.5).length / gaps.length > 0.9 ? 365 : 252; };

  function simulate(bars, key, params, capital, optIn, fromIdx = 0, ctx = {}) {
    const o0 = normOpt(optIn), o = key === "buyhold" || key === "dca" ? Object.assign({}, o0, { mode: "long", filter: "none", sl: 0, tp: 0, trail: 0, sizing: "all" }) : o0, fee = o.fee / 100, tax = o.tax / 100, slip = o.slip / 100, mult = ctx.fx || null, gate = key === "buyhold" || key === "dca" ? null : ctx.gate || null;
    const M = i => mult ? mult[i] || 1 : 1, N = bars.length, py = perYear(bars);
    const sig = STRATS[key].sig(bars, params);
    const lr = bars.map((b, i) => i ? Math.log(b.c / bars[i - 1].c) : 0);
    let cash = capital, units = 0, side = 0, want = key === "buyhold" || key === "dca" ? 1 : 0, entry = null, blocked = 0, peak = 0;
    const trades = [], eq = [];
    const target = i => { let t = want === 1 ? 1 : o.mode === "longshort" ? -1 : 0; if (t === 1 && gate && gate[i] === false) t = o.mode === "longshort" ? -1 : 0; if (t === blocked && t !== 0) t = 0; return t; };
    const fracAt = i => { if (o.sizing !== "vol" || i < 21) return 1; let s = 0, m = 0; for (let j = i - 19; j <= i; j++) m += lr[j] / 20; for (let j = i - 19; j <= i; j++) s += (lr[j] - m) ** 2; const v = Math.sqrt(s / 19 * py); return Math.max(0.1, Math.min(1, (o.volT / 100) / (v || 1))); };
    const close = (i, px, why) => { /* px：原始價（未換匯） */
      const p = px * M(i);
      let pnl;
      if (side > 0) { const got = units * p * (1 - slip) * (1 - fee - tax); cash += got; pnl = got / entry.cost - 1; }
      else { const cost = -units * p * (1 + slip) * (1 + fee); cash -= cost; pnl = (entry.cost * (1 - fee - tax) - cost) / entry.cost; }
      trades.push({ side, in: entry, out: { i, t: bars[i].t, px }, pnl, why }); units = 0; side = 0; entry = null;
    };
    const open = (i, s) => {
      const px = bars[i].o || bars[i].c, p = px * M(i), E = cash + units * p, notional = E * fracAt(i - 1);
      if (notional <= 0) return;
      if (s > 0) { units = notional * (1 - fee) / (p * (1 + slip)); cash -= notional; }
      else { units = -notional / (p * (1 - slip)); cash += notional * (1 - fee - tax); }
      side = s; entry = { i, t: bars[i].t, px, cost: notional }; peak = px;
    };
    let dcaMonths = 0, dcaLeft = 0, lastMonth = null;
    if (key === "dca") { const ms = new Set(); for (let i = fromIdx + 1; i < N; i++) ms.add(new Date(bars[i].t).toISOString().slice(0, 7)); dcaMonths = Math.max(1, ms.size); dcaLeft = capital; }
    for (let i = 0; i < N; i++) {
      const b = bars[i];
      if (i > fromIdx) {
        if (key === "dca") {
          const mo = new Date(b.t).toISOString().slice(0, 7);
          if (mo !== lastMonth && dcaLeft > 0) { lastMonth = mo; const amt = Math.min(dcaLeft, capital / dcaMonths), p = (b.o || b.c) * M(i) * (1 + slip); units += amt * (1 - fee) / p; cash -= amt; dcaLeft -= amt; if (!entry) { entry = { i, t: b.t, px: b.o || b.c, cost: 0 }; side = 1; } entry.cost += amt; }
        } else {
          /* 1) 開盤：照昨天收盤的訊號調整部位 */
          const t = target(i - 1);
          if (t !== side) { if (side) close(i, b.o || b.c, "訊號"); if (t) open(i, t); }
          /* 2) 盤中：停損／停利／移動停利（同一天兩個都碰到，保守當作先停損） */
          if (side && (o.sl || o.tp || o.trail)) {
            const op = b.o || b.c;
            if (side > 0) {
              const stop = Math.max(o.sl ? entry.px * (1 - o.sl / 100) : -Infinity, o.trail ? peak * (1 - o.trail / 100) : -Infinity), tp = o.tp ? entry.px * (1 + o.tp / 100) : Infinity;
              if (b.l <= stop) { close(i, Math.min(op, stop), o.trail && stop > entry.px * (1 - (o.sl || 0) / 100) ? "移動停利" : "停損"); blocked = 1; }
              else if (b.h >= tp) { close(i, Math.max(op, tp), "停利"); blocked = 1; }
              else peak = Math.max(peak, b.h);
            } else {
              const stop = Math.min(o.sl ? entry.px * (1 + o.sl / 100) : Infinity, o.trail ? peak * (1 + o.trail / 100) : Infinity), tp = o.tp ? entry.px * (1 - o.tp / 100) : -Infinity;
              if (b.h >= stop) { close(i, Math.max(op, stop), "停損"); blocked = -1; }
              else if (b.l <= tp) { close(i, Math.min(op, tp), "停利"); blocked = -1; }
              else peak = Math.min(peak, b.l);
            }
          }
        }
      }
      if (i >= fromIdx && key !== "dca") { if (sig[i] != null) { const nw = key === "buyhold" ? 1 : sig[i]; if (nw !== want) blocked = 0; want = nw; } }
      eq.push(i < fromIdx ? null : cash + units * b.c * M(i));
    }
    const last = bars[N - 1], final = cash + units * last.c * M(N - 1);
    const openPos = side ? { side, in: entry, pnl: side > 0 ? units * last.c * M(N - 1) * (1 - fee - tax) / entry.cost - 1 : (entry.cost - (-units * last.c * M(N - 1) * (1 + fee))) / entry.cost } : null;
    let pk = capital, mdd = 0; eq.forEach(v => { if (v == null) return; pk = Math.max(pk, v); mdd = Math.min(mdd, v / pk - 1); });
    const wins = trades.filter(t => t.pnl > 0), loss = trades.filter(t => t.pnl <= 0), avg = a => a.length ? a.reduce((s, t) => s + t.pnl, 0) / a.length : 0;
    const f1 = Math.min(fromIdx + 1, N - 1), days = (last.t - bars[fromIdx].t) / 864e5, ret = final / capital - 1;
    const bh = (last.c * M(N - 1)) / ((bars[f1].o || bars[f1].c) * M(f1)) - 1;
    const held = trades.reduce((s, t) => s + (t.out.i - t.in.i), 0) + (openPos ? N - 1 - openPos.in.i : 0);
    const dr = []; for (let i = fromIdx + 1; i < N; i++) if (eq[i - 1]) dr.push(eq[i] / eq[i - 1] - 1);
    const mu = dr.length ? dr.reduce((a, v) => a + v, 0) / dr.length : 0, sd = dr.length > 1 ? Math.sqrt(dr.reduce((a, v) => a + (v - mu) ** 2, 0) / (dr.length - 1)) : 0;
    return { trades, open: openPos, eq, final, ret, mdd, bh, days, py, mu, sd, sharpe: sd ? mu / sd * Math.sqrt(py) : null,
      cagr: days > 180 ? Math.pow(Math.max(final, 0) / capital, 365 / days) - 1 : null,
      win: trades.length ? wins.length / trades.length : null, avgW: avg(wins), avgL: avg(loss), nW: wins.length, nL: loss.length,
      pf: loss.length && avg(loss) ? -wins.reduce((s, t) => s + t.pnl, 0) / loss.reduce((s, t) => s + t.pnl, 0) : null,
      exposure: held / Math.max(1, N - 1 - fromIdx), sig, nextSide: key === "dca" ? 1 : target(N - 1), side, key };
  }

  /* ---------- 行情與輔助資料（大盤濾網、匯率） ---------- */
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
  const align = (b, ref, f) => { const o = []; let j = -1; for (const x of b) { while (j + 1 < ref.length && ref[j + 1].t <= x.t + 12 * 3600e3) j++; o.push(j >= 0 ? f(j) : null); } return o; };
  async function context(sym, d, range, opt) {
    const o = normOpt(opt), ctx = {};
    if (o.filter !== "none") {
      const bsym = o.filter === "self" ? sym : MARKETS[mkOf(sym)].bench;
      const B = bsym === sym ? d : await bars(bsym, range === "1y" ? "2y" : range), m200 = sma(B.bars.map(x => x.c), 200);
      ctx.gate = align(d.bars, B.bars, j => m200[j] == null ? true : B.bars[j].c > m200[j]);
    }
    if (o.twd && (d.currency || "USD") === "USD") { const F = await bars("TWD=X", range); ctx.fx = align(d.bars, F.bars, j => F.bars[j].c); ctx.cur = "TWD"; }
    return ctx;
  }

  /* ---------- 圖 ---------- */
  function chart(b, r, fromIdx = 0, capital = 100000, ctx = {}) {
    const W = 640, H = 230, P = 8, N = b.length, xs = i => P + (i - fromIdx) / Math.max(1, N - 1 - fromIdx) * (W - 2 * P), M = i => ctx.fx ? ctx.fx[i] || 1 : 1;
    const seg = b.slice(fromIdx), lo = Math.min(...seg.map(x => x.l || x.c)), hi = Math.max(...seg.map(x => x.h || x.c));
    const yp = v => P + (1 - (v - lo) / (hi - lo || 1)) * (120 - 2 * P);
    const price = seg.map((x, j) => `${j ? "L" : "M"}${xs(fromIdx + j).toFixed(1)},${yp(x.c).toFixed(1)}`).join("");
    const bh = seg.map((x, j) => capital * x.c * M(fromIdx + j) / (seg[0].c * M(fromIdx))), eq = r.eq.slice(fromIdx);
    const all = bh.concat(eq).filter(v => v != null), elo = Math.min(...all), ehi = Math.max(...all);
    const ye = v => 132 + (1 - (v - elo) / (ehi - elo || 1)) * (H - 140);
    const line = a => a.map((v, j) => v == null ? "" : `${j ? "L" : "M"}${xs(fromIdx + j).toFixed(1)},${ye(v).toFixed(1)}`).join("");
    const mk = [], up = (i, px, c) => `<path d="M${xs(i)},${yp(px) + 9}l-4,6h8z" class="${c}"/>`, dn = (i, px, c) => `<path d="M${xs(i)},${yp(px) - 9}l-4,-6h8z" class="${c}"/>`;
    r.trades.forEach(t => { if (t.side > 0) mk.push(up(t.in.i, t.in.px, "tr-buy"), dn(t.out.i, t.out.px, "tr-sell")); else mk.push(dn(t.in.i, t.in.px, "tr-short"), up(t.out.i, t.out.px, "tr-cover")); });
    if (r.open && r.key !== "dca") mk.push(r.open.side > 0 ? up(r.open.in.i, r.open.in.px, "tr-buy") : dn(r.open.in.i, r.open.in.px, "tr-short"));
    const gate = ctx.gate ? ctx.gate.slice(fromIdx).map((g, j) => g === false ? `<rect x="${xs(fromIdx + j) - 1}" y="0" width="${(W - 2 * P) / Math.max(1, N - 1 - fromIdx) + 1}" height="120" class="tr-gate"/>` : "").join("") : "";
    return `<svg class="tr-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${gate}
      <text x="${P}" y="14" class="tr-ax">價格（▲買 ▼賣${r.trades.some(t => t.side < 0) ? "・紫＝放空" : ""}${gate ? "・灰底＝濾網禁止做多" : ""}）</text><path d="${price}" class="tr-price"/>${mk.join("")}
      <line x1="0" x2="${W}" y1="126" y2="126" class="tr-sep"/>
      <text x="${P}" y="144" class="tr-ax">資金${ctx.cur ? "（台幣）" : ""}：<tspan class="tr-k1">━ 策略</tspan>　<tspan class="tr-k2">━ 買進持有</tspan></text>
      <path d="${line(bh)}" class="tr-bh"/><path d="${line(eq)}" class="tr-eq"/></svg>`;
  }
  function lineChart(series, h = 180) { /* series: [{name, cls, pts:[[t,v]]}] */
    const W = 640, P = 8, all = series.flatMap(s => s.pts), t0 = Math.min(...all.map(p => p[0])), t1 = Math.max(...all.map(p => p[0])), lo = Math.min(...all.map(p => p[1])), hi = Math.max(...all.map(p => p[1]));
    const x = t => P + (t - t0) / (t1 - t0 || 1) * (W - 2 * P), y = v => 22 + (1 - (v - lo) / (hi - lo || 1)) * (h - 30);
    return `<svg class="tr-chart" style="height:${h}px" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none"><text x="${P}" y="14" class="tr-ax">${series.map(s => `<tspan class="${s.cls}k">━ ${esc(s.name)}</tspan>`).join("　")}</text>
      ${series.map(s => `<path class="${s.cls}" d="${s.pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("")}"/>`).join("")}</svg>`;
  }

  const pct = (v, d = 1) => v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
  const cls = v => v == null ? "" : v >= 0 ? "up" : "dn";
  const money = v => Math.round(v).toLocaleString();
  const day = t => new Date(t).toLocaleDateString("zh-TW", { year: "2-digit", month: "2-digit", day: "2-digit" });
  const SIDE = { 1: "做多", "-1": "放空" };

  function stats(r) {
    const s = (k, v, c = "") => `<div class="tr-st"><small>${k}</small><b class="${c}">${v}</b></div>`;
    return `<div class="tr-stats">
      ${s("總報酬", pct(r.ret), cls(r.ret))}${s("買進持有", pct(r.bh), cls(r.bh))}
      ${s("贏過持有", pct(r.ret - r.bh), cls(r.ret - r.bh))}${s("最後資金", money(r.final), cls(r.ret))}
      ${s("勝率", r.win == null ? "—" : `${Math.round(r.win * 100)}%`, r.win == null ? "" : r.win >= 0.5 ? "up" : "dn")}${s("交易次數", `${r.trades.length}（${r.nW} 勝 ${r.nL} 敗）`)}
      ${s("平均賺／賠", `${pct(r.avgW)}／${pct(r.avgL)}`)}${s("獲利因子", r.pf == null ? "—" : r.pf.toFixed(2), r.pf == null ? "" : r.pf >= 1 ? "up" : "dn")}
      ${s("最大回撤", pct(r.mdd), "dn")}${s("年化報酬", pct(r.cagr), cls(r.cagr))}${s("夏普值", r.sharpe == null ? "—" : r.sharpe.toFixed(2), r.sharpe == null ? "" : r.sharpe >= 1 ? "up" : r.sharpe < 0 ? "dn" : "")}${s("持倉時間", `${Math.round(r.exposure * 100)}%`)}
      ${s("現在", r.open ? `${SIDE[r.open.side]}中 ${pct(r.open.pnl)}` : "空手", r.open ? cls(r.open.pnl) : "")}</div>`;
  }
  function tradeList(r) {
    if (r.key === "dca") return "";
    if (!r.trades.length && !r.open) return `<p class="tr-note">這段期間沒有任何買賣訊號。</p>`;
    const rows = r.trades.slice().reverse().slice(0, 80).map(t => `<tr><td>${t.side < 0 ? "🟣空 " : ""}${day(t.in.t)}</td><td>${t.in.px.toPrecision(5)}</td><td>${day(t.out.t)}${t.why !== "訊號" ? ` <small>${t.why}</small>` : ""}</td><td>${t.out.px.toPrecision(5)}</td><td class="${cls(t.pnl)}">${pct(t.pnl)}</td><td>${Math.round((t.out.t - t.in.t) / 864e5)} 天</td></tr>`);
    if (r.open) rows.unshift(`<tr class="open"><td>${r.open.side < 0 ? "🟣空 " : ""}${day(r.open.in.t)}</td><td>${r.open.in.px.toPrecision(5)}</td><td colspan="2">${SIDE[r.open.side]}中</td><td class="${cls(r.open.pnl)}">${pct(r.open.pnl)}</td><td></td></tr>`);
    return `<details class="tr-list"><summary>📜 每一筆交易（${r.trades.length}${r.open ? "＋1 進行中" : ""}）</summary><div class="tr-scroll"><table><tr><th>進場</th><th>價格</th><th>出場</th><th>價格</th><th>損益</th><th>持有</th></tr>${rows.join("")}</table></div></details>`;
  }

  /* ---------- 📅 月報酬熱力圖 ---------- */
  function monthly(b, r) {
    const me = {}; b.forEach((x, i) => { if (r.eq[i] == null) return; const k = new Date(x.t + 8 * 3600e3).toISOString().slice(0, 7); me[k] = me[k] || { s: r.eq[i - 1] != null ? r.eq[i - 1] : r.eq[i] }; me[k].e = r.eq[i]; });
    const ys = {}; Object.entries(me).forEach(([k, v]) => { const [y, m] = k.split("-"); (ys[y] = ys[y] || {})[+m] = v.e / v.s - 1; });
    const col = v => v == null ? "" : `background:${v >= 0 ? `rgba(63,185,80,${Math.min(0.85, 0.12 + Math.abs(v) * 4)})` : `rgba(248,81,73,${Math.min(0.85, 0.12 + Math.abs(v) * 4)})`}`;
    const rows = Object.keys(ys).sort().reverse().map(y => { const ms = ys[y], tot = Object.values(ms).reduce((a, v) => a * (1 + v), 1) - 1;
      return `<tr><td>${y}</td>${Array.from({ length: 12 }, (_, i) => ms[i + 1]).map(v => `<td style="${col(v)}">${v == null ? "" : (v * 100).toFixed(0)}</td>`).join("")}<td class="${cls(tot)}"><b>${pct(tot, 0)}</b></td></tr>`; });
    const all = Object.values(ys).flatMap(o => Object.values(o)), worst = Math.min(...all), best = Math.max(...all), pos = all.filter(v => v > 0).length;
    return `<details class="tr-list"><summary>📅 月報酬熱力圖（賺錢的月份 ${pos}/${all.length}・最好 ${pct(best, 0)}・最慘 ${pct(worst, 0)}）</summary><div class="tr-scroll"><table class="tr-heat"><tr><th>年</th>${Array.from({ length: 12 }, (_, i) => `<th>${i + 1}</th>`).join("")}<th>全年</th></tr>${rows.join("")}</table></div><p class="tr-note">格子裡是當月報酬 %，越綠賺越多、越紅賠越多。</p></details>`;
  }

  /* ---------- 📊 報酬分布 ---------- */
  function histogram(r) {
    const p = r.trades.map(t => t.pnl * 100); if (p.length < 3) return "";
    const w = Math.max(1, Math.ceil((Math.max(...p) - Math.min(...p)) / 16)), lo = Math.floor(Math.min(...p) / w) * w, nb = Math.ceil((Math.max(...p) - lo) / w) + 1, cnt = new Array(nb).fill(0);
    p.forEach(v => cnt[Math.min(nb - 1, Math.floor((v - lo) / w))]++);
    const mx = Math.max(...cnt), W = 640, H = 150, bw = (W - 20) / nb;
    const big = p.filter(v => v > 0).sort((a, b) => b - a), top = big.slice(0, Math.max(1, Math.ceil(p.length * 0.1))).reduce((a, v) => a + v, 0), gain = big.reduce((a, v) => a + v, 0);
    return `<details class="tr-list"><summary>📊 每筆交易的報酬分布</summary><svg class="tr-chart" style="height:150px" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${cnt.map((c, i) => `<rect x="${10 + i * bw + 1}" y="${H - 22 - (c / mx) * (H - 40)}" width="${bw - 2}" height="${(c / mx) * (H - 40)}" class="${lo + i * w + w / 2 >= 0 ? "tr-hup" : "tr-hdn"}"/>${c ? `<text x="${10 + i * bw + bw / 2}" y="${H - 26 - (c / mx) * (H - 40)}" class="tr-ax" text-anchor="middle">${c}</text>` : ""}`).join("")}
      ${cnt.map((_, i) => i % Math.ceil(nb / 8) ? "" : `<text x="${10 + i * bw}" y="${H - 6}" class="tr-ax">${lo + i * w}%</text>`).join("")}</svg>
      <p class="tr-note">${gain > 0 ? `最賺的前 10% 交易貢獻了 ${Math.round(top / gain * 100)}% 的獲利。${top / gain > 0.6 ? "這是「靠少數大賺」型，錯過那幾筆就不好看了。" : "獲利分散在很多筆，比較穩定。"}` : "沒有賺錢的交易。"}</p></details>`;
  }

  /* ---------- 🎲 蒙地卡羅壓力測試：把交易隨機重抽 1000 次 ---------- */
  function monteCarlo(r) {
    const p = r.trades.map(t => t.pnl); if (p.length < 5) return `<p class="tr-note">🎲 交易少於 5 筆，做不了壓力測試。</p>`;
    const fin = [], dd = [];
    for (let k = 0; k < 1000; k++) { let e = 1, pk = 1, m = 0; for (let j = 0; j < p.length; j++) { e *= 1 + p[Math.floor(Math.random() * p.length)]; pk = Math.max(pk, e); m = Math.min(m, e / pk - 1); } fin.push(e - 1); dd.push(m); }
    fin.sort((a, b) => a - b); dd.sort((a, b) => a - b);
    const q = (a, x) => a[Math.floor(x * (a.length - 1))], lose = fin.filter(v => v < 0).length / 10;
    return `<details class="tr-list"><summary>🎲 蒙地卡羅壓力測試（虧錢機率 ${lose.toFixed(1)}%）</summary>
      <p class="tr-note">把這 ${p.length} 筆交易隨機重抽 1000 次（運氣好壞重新洗牌），看結果會差多少：</p>
      <div class="tr-stats"><div class="tr-st"><small>最差 5% 的結果</small><b class="${cls(q(fin, 0.05))}">${pct(q(fin, 0.05))}</b></div><div class="tr-st"><small>中間值</small><b class="${cls(q(fin, 0.5))}">${pct(q(fin, 0.5))}</b></div>
        <div class="tr-st"><small>最好 5% 的結果</small><b class="${cls(q(fin, 0.95))}">${pct(q(fin, 0.95))}</b></div><div class="tr-st"><small>回撤中間值</small><b class="dn">${pct(q(dd, 0.5))}</b></div><div class="tr-st"><small>最慘 5% 回撤</small><b class="dn">${pct(q(dd, 0.05))}</b></div></div>
      <p class="tr-note">${lose > 25 ? "⚠️ 有四分之一以上的機率會虧錢，這套公式的獲利可能只是運氣。" : q(dd, 0.05) < -0.5 ? "⚠️ 運氣差的時候回撤可能超過一半，要有心理準備。" : "✅ 就算運氣差一點，結果也還能接受。"}（這是用每筆交易的報酬重抽，只看交易本身，不含空手時間。）</p></details>`;
  }

  /* ---------- 🗺️ 參數地圖 ---------- */
  const AXES = {
    sma: [["fast", [5, 10, 15, 20, 30, 40, 50]], ["slow", [30, 50, 80, 100, 150, 200]]],
    breakout: [["n", [10, 20, 30, 40, 55, 80, 100]], ["m", [5, 10, 15, 20, 30]]],
    boll: [["n", [10, 15, 20, 25, 30, 40]], ["k", [1, 1.5, 2, 2.5, 3]]],
    rsi: [["lo", [15, 20, 25, 30, 35, 40]], ["hi", [60, 65, 70, 75, 80, 85]]],
    macd: [["f", [6, 8, 10, 12, 15]], ["s", [20, 26, 30, 35, 40]]]
  };
  async function paramMap() {
    readForm(); const out = document.getElementById("tr-out"), ax = AXES[S.st];
    if (!ax) return toast("這個策略沒有兩個可調參數，畫不了地圖");
    out.innerHTML = `<p class="tr-note">🗺️ 畫參數地圖中…</p>`;
    try {
      const d = await bars(S.sym, S.range), ctx = await context(S.sym, d, S.range, S.opt), base = S.params[S.st];
      const [[ka, va], [kb, vb]] = ax, cells = [];
      for (const a of va) { const row = []; for (const bv of vb) { const p = Object.assign({}, base, { [ka]: a, [kb]: bv }); row.push(S.st === "sma" && a >= bv ? null : simulate(d.bars, S.st, p, S.cap, S.opt, 0, ctx)); } cells.push(row); await tick(); }
      const flat = cells.flat().filter(Boolean), bh = flat[0] ? flat[0].bh : 0, good = flat.filter(r => r.ret > bh).length, posi = flat.filter(r => r.ret > 0).length;
      const lab = k => (STRATS[S.st].params.find(q => q[0] === k) || [, k])[1];
      const col = r => { if (!r) return "background:transparent"; const x = Math.max(-1, Math.min(1, (r.ret - bh) / (Math.abs(bh) + 0.5))); return `background:${x >= 0 ? `rgba(63,185,80,${0.15 + x * 0.7})` : `rgba(248,81,73,${0.15 - x * 0.7})`}`; };
      out.innerHTML = `<div class="tr-head"><b>🗺️ 參數地圖：${STRATS[S.st].name}</b><small>${esc(S.sym)}・每一格是一組參數的總報酬，綠＝贏過買進持有（${pct(bh)}），紅＝輸</small></div>
        <div class="tr-scroll"><table class="tr-heat tr-pmap"><tr><th>${esc(lab(ka))} ＼ ${esc(lab(kb))}</th>${vb.map(v => `<th>${v}</th>`).join("")}</tr>
        ${cells.map((row, i) => `<tr><th>${va[i]}</th>${row.map((r, j) => `<td style="${col(r)}" class="${base[ka] == va[i] && base[kb] == vb[j] ? "me" : ""}" ${r ? `data-tr="pmap" data-a="${va[i]}" data-b="${vb[j]}"` : ""}>${r ? pct(r.ret, 0) : ""}</td>`).join("")}</tr>`).join("")}</table></div>
        <p class="tr-verdict">${good / flat.length > 0.6 ? `✅ ${good}/${flat.length} 組都贏過買進持有，一整片都綠代表這個策略在這檔是「穩」的，不太挑參數。` : good / flat.length > 0.25 ? `🤔 只有 ${good}/${flat.length} 組贏過買進持有，參數要挑得剛好才有效，小心是運氣。` : `📉 幾乎都輸給買進持有（${good}/${flat.length}），這個策略不適合這檔。`}${posi < flat.length ? `有 ${flat.length - posi} 組是賠錢的。` : ""}</p>
        <p class="tr-note">外框那格是你目前的參數。點任一格就用那組參數回測。</p>`;
      out.dataset.ka = ka; out.dataset.kb = kb;
    } catch (e) { out.innerHTML = `<p class="tr-note dn">😵 ${esc(e.message)}</p>`; }
  }

  /* ---------- 狀態 ---------- */
  const S = Object.assign({ mk: "crypto", sym: "BTC-USD", range: "5y", st: "sma", params: {}, cap: 100000, opt: {}, port: null, notify: false }, JSON.parse(store.get("tradeSim") || "{}"));
  if (S.fee != null && S.opt.fee == null) S.opt.fee = S.fee;
  S.opt = normOpt(S.opt);
  S.port = S.port || { rows: [["0050.TW", 60], ["BTC-USD", 20]], reb: "M", range: "5y" };
  const save = () => store.set("tradeSim", JSON.stringify(S));
  let runs = [], busy = false, lastRes = null;

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
    const st = STRATS[S.st], p = Object.assign(defParams(S.st), S.params[S.st] || {}), o = S.opt;
    const opt = (id, label, val, list) => `<label>${label}<select id="${id}">${list.map(([k, n]) => `<option value="${k}" ${String(val) === String(k) ? "selected" : ""}>${n}</option>`).join("")}</select></label>`;
    const num = (id, label, val, step = 0.1, max = 100) => `<label>${label}<input id="${id}" type="number" min="0" max="${max}" step="${step}" value="${val}"></label>`;
    return `<section class="card"><h2>📈 模擬交易</h2>
      <p class="tr-note">挑一個市場和一套公式，看看照著做會不會賺錢。收盤出訊號、隔天開盤成交，不偷看未來。</p>
      <div class="tr-row">${Object.entries(MARKETS).map(([k, m]) => `<button type="button" class="tr-chip ${S.mk === k ? "on" : ""}" data-tr="mk" data-v="${k}">${m.label}</button>`).join("")}</div>
      <div class="tr-row">${MARKETS[S.mk].list.map(([s, n]) => `<button type="button" class="tr-chip sm ${S.sym === s ? "on" : ""}" data-tr="sym" data-v="${s}">${n}</button>`).join("")}
        <input id="tr-sym" class="tr-in" value="${esc(S.sym)}" title="也可以自己輸入代號：台股加 .TW（上櫃 .TWO），加密貨幣用 XXX-USD" style="width:110px"></div>
      <div class="tr-grid">
        <label>策略<select id="tr-st">${Object.entries(STRATS).map(([k, v]) => `<option value="${k}" ${k === S.st ? "selected" : ""}>${v.name}</option>`).join("")}</select></label>
        ${opt("tr-range", "回測期間", S.range, [["1y", "1 年"], ["2y", "2 年"], ["5y", "5 年"], ["10y", "10 年"]])}
        <label>本金<input id="tr-cap" type="number" min="1000" step="1000" value="${S.cap}"></label>
        ${st.params.map(([k, n, , mn, mx]) => `<label>${n}<input data-p="${k}" type="number" min="${mn}" max="${mx}" step="${k === "k" ? 0.1 : 1}" value="${p[k]}"></label>`).join("")}
      </div>
      ${st.text ? `<div class="tr-formula"><label>🟢 買進條件<input id="tr-buy" class="tr-in" value="${esc(p.buy)}"></label><label>🔴 賣出條件<input id="tr-sell" class="tr-in" value="${esc(p.sell)}"></label>
        <div class="tr-row">${[["RSI 抄底＋200 日線", "rsi(14) < 30 且 close > sma(200)", "rsi(14) > 70 或 close < sma(200)"], ["突破＋放量", "close > hh(20) 且 volume > vol(20) * 1.5", "close < ll(10)"], ["均線多頭排列", "sma(5) > sma(20) 且 sma(20) > sma(60)", "close < sma(20)"], ["布林反彈", "close < bblow(20,2) 且 rsi(14) < 35", "close > sma(20)"]].map(([n, b, s]) => `<button type="button" class="tr-chip sm" data-tr="tpl" data-b="${esc(b)}" data-s="${esc(s)}">${n}</button>`).join("")}</div></div>` : ""}
      <p class="tr-desc">${st.desc}</p>
      <details class="tr-adv" ${store.get("trAdv") === "1" ? "open" : ""}><summary>⚙️ 進階設定 ${[o.mode === "longshort" && "多空", o.filter !== "none" && "濾網", (o.sl || o.tp || o.trail) && "停損停利", o.sizing === "vol" && "部位", o.twd && "台幣"].filter(Boolean).map(x => `<span class="tr-tag">${x}</span>`).join("")}</summary>
        <div class="tr-grid">
          ${opt("tr-mode", "↕️ 多空", o.mode, [["long", "只做多（不買就抱現金）"], ["longshort", "多空都做（賣出訊號改成放空）"]])}
          ${opt("tr-filter", "🚦 大盤濾網", o.filter, [["none", "不用"], ["bench", "大盤在 200 日線上才准做多"], ["self", "自己在 200 日線上才准做多"]])}
          ${num("tr-sl", "🛑 停損 %（0＝不用）", o.sl, 1)}${num("tr-tp", "💰 停利 %（0＝不用）", o.tp, 1, 1000)}${num("tr-trail", "📉 移動停利 %（從最高點回落）", o.trail, 1)}
          ${opt("tr-sizing", "⚖️ 部位大小", o.sizing, [["all", "全進全出"], ["vol", "依波動調整（波動大買少）"]])}
          ${num("tr-volT", "目標年化波動 %", o.volT, 5)}
          ${num("tr-fee", "手續費 %（單邊）", o.fee, 0.01, 2)}${num("tr-tax", "交易稅 %（賣出）", o.tax, 0.05, 2)}${num("tr-slip", "滑價 %（單邊）", o.slip, 0.01, 2)}
          <label class="tr-ck"><input id="tr-twd" type="checkbox" ${o.twd ? "checked" : ""}> 💱 用台幣計算（美元資產會算進匯率）</label>
        </div>
        <div class="tr-row"><button type="button" class="btn btn-small" data-tr="real">💸 套用 ${esc(S.sym)} 的真實成本</button><button type="button" class="btn btn-small" data-tr="reset">↩️ 進階設定全部還原</button></div>
        <p class="tr-note">大盤濾網：加密貨幣看比特幣、台股看加權指數、美股看 SPY。停損停利用當天最高最低價判斷，觸發後要等訊號反轉才會再進場。</p></details>
      <div class="tr-row"><button type="button" class="btn btn-primary" data-tr="run">▶️ 回測</button><button type="button" class="btn" data-tr="cmp">⚖️ 所有策略比一比</button><button type="button" class="btn" data-tr="map">🗺️ 參數地圖</button><button type="button" class="btn" data-tr="fwd">🔒 從今天開始往後模擬</button></div>
      <div class="tr-row"><button type="button" class="btn btn-primary tr-ai" data-tr="ai">🤖 AI 挑選：全部交給我</button></div>
      <div id="tr-out"></div>
      <p class="tr-note small">⚠️ 這是用過去資料做的模擬，不代表未來會一樣，也不是投資建議。</p></section>
      ${portForm()}
      <section class="card"><h2>🔒 往後模擬</h2><p class="tr-note">建立時把策略、參數、進階設定全部鎖住，從起始日開始照公式自動買賣。不能事後改，所以成績是真的「沒看答案」。</p>
        <label class="tr-ck"><input type="checkbox" id="tr-notify" ${S.notify ? "checked" : ""}> 🔔 出現買賣訊號時通知我（網站開著時才會跳）</label>
        <div id="tr-runs"><p class="tr-note">載入中…</p></div></section>`;
  }

  function render() {
    const page = ensurePage(); if (!page) return;
    page.querySelector("#tr-root").innerHTML = form();
    renderRuns();
  }

  function readForm() {
    const v = id => document.getElementById(id); if (!v("tr-sym")) return;
    S.sym = (v("tr-sym").value || S.sym).trim().toUpperCase(); S.range = v("tr-range").value; S.st = v("tr-st").value;
    S.cap = Math.max(1000, Number(v("tr-cap").value) || 100000);
    const p = Object.assign(defParams(S.st), S.params[S.st] || {});
    document.querySelectorAll("#tr-root [data-p]").forEach(i => { const x = Number(i.value); if (isFinite(x)) p[i.dataset.p] = x; });
    if (v("tr-buy")) { p.buy = v("tr-buy").value; p.sell = v("tr-sell").value; }
    S.params[S.st] = p;
    const n = (id, d) => { const x = Number(v(id).value); return isFinite(x) && x >= 0 ? x : d; };
    if (v("tr-mode")) S.opt = normOpt({ mode: v("tr-mode").value, filter: v("tr-filter").value, sl: n("tr-sl", 0), tp: n("tr-tp", 0), trail: n("tr-trail", 0), sizing: v("tr-sizing").value, volT: n("tr-volT", 30) || 30, fee: n("tr-fee", 0.1), tax: n("tr-tax", 0), slip: n("tr-slip", 0), twd: v("tr-twd").checked });
    save();
  }
  function check() {
    if (S.st === "sma" && S.params.sma.fast >= S.params.sma.slow) return "短均線要比長均線短";
    if (S.st === "custom") return tryCompile(S.params.custom.buy) && "買進條件：" + tryCompile(S.params.custom.buy) || tryCompile(S.params.custom.sell) && "賣出條件：" + tryCompile(S.params.custom.sell);
    return null;
  }

  function verdict(r) {
    const beat = r.ret - r.bh;
    let m = r.ret < 0 ? "📉 這套公式在這段期間是賠錢的。" : beat >= 0 ? "🏆 這套公式贏過一直抱著不動。" : "🤔 有賺，但沒贏過一直抱著不動。";
    if (r.mdd < -0.4) m += "中途最慘曾經虧掉四成以上，心臟要很大顆。";
    if (r.key !== "dca" && r.key !== "buyhold") { if (r.trades.length < 5) m += "交易次數太少，勝率參考價值不高。"; else if (r.win != null && r.win < 0.45 && r.ret > 0) m += "勝率不高但有賺，代表是靠少數大賺撐起來的。"; }
    if (r.sharpe != null && r.sharpe > 1 && r.ret > 0) m += "夏普值超過 1，報酬相對風險算漂亮。";
    return `<p class="tr-verdict">${m}</p>`;
  }

  async function runOne() {
    readForm(); const out = document.getElementById("tr-out"), err = check(); if (err) return toast(err);
    out.innerHTML = `<p class="tr-note">載入 ${esc(S.sym)} 行情中…</p>`;
    try {
      const d = await bars(S.sym, S.range), ctx = await context(S.sym, d, S.range, S.opt), r = simulate(d.bars, S.st, S.params[S.st], S.cap, S.opt, 0, ctx);
      lastRes = { d, r, ctx };
      out.innerHTML = `<div class="tr-head"><b>${esc(d.name)}</b> <small>${esc(S.sym)}・${day(d.bars[0].t)} → ${day(d.bars[d.bars.length - 1].t)}・${d.bars.length} 根日 K・${ctx.cur || esc(d.currency || "")}</small></div>
        ${chart(d.bars, r, 0, S.cap, ctx)}${stats(r)}${verdict(r)}${tradeList(r)}${monthly(d.bars, r)}${histogram(r)}${r.key === "dca" || r.key === "buyhold" ? "" : monteCarlo(r)}`;
    } catch (e) { out.innerHTML = `<p class="tr-note dn">😵 ${esc(e.message)}</p>`; }
  }

  async function compare() {
    readForm(); const out = document.getElementById("tr-out");
    out.innerHTML = `<p class="tr-note">載入 ${esc(S.sym)} 行情中…</p>`;
    try {
      const d = await bars(S.sym, S.range), ctx = await context(S.sym, d, S.range, S.opt);
      const rows = Object.keys(STRATS).filter(k => k !== "custom" || !check()).map(k => [k, simulate(d.bars, k, Object.assign(defParams(k), S.params[k] || {}), S.cap, S.opt, 0, ctx)]).sort((a, b) => b[1].ret - a[1].ret);
      out.innerHTML = `<div class="tr-head"><b>${esc(d.name)}</b> <small>${esc(S.sym)}・${day(d.bars[0].t)} → ${day(d.bars[d.bars.length - 1].t)}・各策略用你目前的參數與進階設定</small></div>
        <div class="tr-scroll"><table class="tr-cmp"><tr><th>策略</th><th>總報酬</th><th>勝率</th><th>次數</th><th>最大回撤</th><th>夏普</th></tr>
        ${rows.map(([k, r], i) => `<tr data-tr="pick" data-v="${k}"><td>${i === 0 ? "🥇 " : ""}${STRATS[k].name}</td><td class="${cls(r.ret)}">${pct(r.ret)}</td><td>${r.win == null ? "—" : Math.round(r.win * 100) + "%"}</td><td>${k === "dca" ? "每月" : r.trades.length}</td><td class="dn">${pct(r.mdd)}</td><td>${r.sharpe == null ? "—" : r.sharpe.toFixed(2)}</td></tr>`).join("")}</table></div>
        ${(() => { const dca = rows.find(x => x[0] === "dca"), beat = rows.filter(x => !["dca", "buyhold"].includes(x[0]) && x[1].ret > dca[1].ret).length; return `<p class="tr-verdict">🗓️ 定期定額 ${pct(dca[1].ret)}：${beat ? `有 ${beat} 種擇時策略打敗它。` : "沒有任何擇時策略打敗它。"}（定期定額的錢是慢慢投入的，所以漲多的時候報酬看起來會比一次投入少，但回撤也小。）</p>`; })()}
        <p class="tr-note">點一列就切到那個策略再回測。</p>`;
    } catch (e) { out.innerHTML = `<p class="tr-note dn">😵 ${esc(e.message)}</p>`; }
  }

  /* ---------- 🤖 AI 挑選（滾動式驗證） ----------
     切成 4 段考試：每一段都只用「那之前的資料」挑出最佳組合，然後拿下一段來考。
     4 段考試串起來＝一條完全沒偷看答案的成績。用這條成績決定哪一檔最好，
     最後才用全部資料重新挑一次參數，拿去往後模擬。 */
  const GRID = {
    buyhold: [{}],
    sma: [5, 10, 20, 30, 50].flatMap(f => [20, 50, 100, 150, 200].filter(s => s > f * 1.5).map(s => ({ fast: f, slow: s }))),
    rsi: [7, 14, 21].flatMap(n => [20, 25, 30, 35].flatMap(lo => [65, 70, 75, 80].map(hi => ({ n, lo, hi })))),
    boll: [10, 20, 30].flatMap(n => [1.5, 2, 2.5].map(k => ({ n, k }))),
    macd: [8, 12].flatMap(f => [21, 26, 34].flatMap(sl => [5, 9].map(g => ({ f, s: sl, g })))),
    breakout: [10, 20, 40, 55, 100].flatMap(n => [5, 10, 20, 30].filter(m => m < n).map(m => ({ n, m }))),
    vote: [2, 3, 4].map(need => ({ need }))
  };
  const score = r => Math.log(Math.max(r.final, 1) / 1e5) + 1.5 * Math.log(1 + r.mdd);
  let AI = null;
  const pickBest = (b, ctx, opt) => { let best = null; for (const k of Object.keys(GRID)) for (const p of GRID[k]) {
    const r = simulate(b, k, p, 1e5, opt, 0, ctx); if (k !== "buyhold" && r.trades.length < 3) continue; const sc = score(r); if (!best || sc > best.sc) best = { k, p, sc, r }; } return best; };
  const sliceCtx = (ctx, n) => ({ gate: ctx.gate && ctx.gate.slice(0, n), fx: ctx.fx && ctx.fx.slice(0, n), cur: ctx.cur });

  async function aiPick() {
    readForm(); const out = document.getElementById("tr-out");
    const syms = [...new Set(MARKETS[S.mk].list.map(x => x[0]).concat(S.sym))], res = [];
    for (const [si, sym] of syms.entries()) {
      let d, ctx; try { d = await bars(sym, S.range); ctx = await context(sym, d, S.range, S.opt); } catch (e) { continue; }
      const b = d.bars, n = b.length, t0 = Math.floor(n * 0.4), step = Math.floor((n - t0) / 4); if (t0 < 150) continue;
      const folds = []; let oos = 1, bhs = 1, oosMdd = 0;
      for (let f = 0; f < 4; f++) {
        out.innerHTML = `<p class="tr-note">🤖 正在研究 ${esc(sym)}（${si + 1}/${syms.length}）・第 ${f + 1}/4 段考試…</p>`; await tick();
        const tEnd = t0 + f * step, xEnd = f === 3 ? n : tEnd + step, best = pickBest(b.slice(0, tEnd), sliceCtx(ctx, tEnd), S.opt); if (!best) continue;
        const test = simulate(b.slice(0, xEnd), best.k, best.p, 1e5, S.opt, tEnd - 1, sliceCtx(ctx, xEnd));
        folds.push({ from: b[tEnd].t, to: b[xEnd - 1].t, k: best.k, p: best.p, ret: test.ret, bh: test.bh, mdd: test.mdd }); oos *= 1 + test.ret; bhs *= 1 + test.bh; oosMdd = Math.min(oosMdd, test.mdd);
      }
      if (!folds.length) continue;
      out.innerHTML = `<p class="tr-note">🤖 ${esc(sym)}：用全部資料挑最後的參數…</p>`; await tick();
      const fin = pickBest(b, ctx, S.opt), full = simulate(b, fin.k, fin.p, S.cap, S.opt, 0, ctx);
      res.push({ sym, name: d.name, d, ctx, folds, oos: oos - 1, oosBh: bhs - 1, oosMdd, beat: folds.filter(f => f.ret >= f.bh).length, k: fin.k, p: fin.p, full, sc: Math.log(Math.max(oos, 1e-3)) + 1.5 * Math.log(1 + oosMdd) });
    }
    if (!res.length) { out.innerHTML = `<p class="tr-note dn">😵 拿不到這個市場的行情</p>`; return; }
    res.sort((a, b) => b.sc - a.sc); AI = res[0]; const w = AI;
    const pstr = (k, p) => Object.entries(p).map(([a, v]) => `${(STRATS[k].params.find(q => q[0] === a) || [, a])[1]} ${v}`).join("、") || "不用參數";
    const ok = w.oos > 0 && w.oos >= w.oosBh - 0.05 && w.beat >= 2;
    out.innerHTML = `<div class="tr-ai-box"><div class="tr-head"><b>🤖 AI 的選擇：${esc(w.name)}・${STRATS[w.k].name}</b><small>${esc(w.sym)}・${esc(pstr(w.k, w.p))}</small></div>
      <p class="tr-verdict">${ok ? `✅ 滾動考試 4 段贏了 ${w.beat} 段，串起來 ${pct(w.oos)}（同期買進持有 ${pct(w.oosBh)}）。每段都只用過去的資料挑，這是真的沒看答案的成績。` : `⚠️ 這是 ${syms.length} 檔裡最好的，但滾動考試只贏 ${w.beat}/4 段、串起來 ${pct(w.oos)}（買進持有 ${pct(w.oosBh)}）。代表在這個市場，公式擇時不一定比抱著好，建議用往後模擬觀察，或直接定期定額。`}</p>
      <div class="tr-scroll"><table class="tr-cmp"><tr><th>考試期間</th><th>當時挑的策略</th><th>考試報酬</th><th>買進持有</th><th>回撤</th></tr>
        ${w.folds.map(f => `<tr><td>${day(f.from)}–${day(f.to)}</td><td>${STRATS[f.k].name}</td><td class="${cls(f.ret)}">${pct(f.ret)}</td><td class="${cls(f.bh)}">${pct(f.bh)}</td><td class="dn">${pct(f.mdd)}</td></tr>`).join("")}
        <tr class="open"><td>串起來</td><td></td><td class="${cls(w.oos)}">${pct(w.oos)}</td><td class="${cls(w.oosBh)}">${pct(w.oosBh)}</td><td class="dn">${pct(w.oosMdd)}</td></tr></table></div>
      <p class="tr-note">每一段「當時挑的策略」不一定一樣：這很正常，市場會變。下面是用全部資料重新挑出來、要拿去往後模擬的那組（這段回測有看過答案，數字會比考試好看）：</p>
      ${chart(w.d.bars, w.full, 0, S.cap, w.ctx)}${stats(w.full)}${tradeList(w.full)}${monthly(w.d.bars, w.full)}
      <div class="tr-row"><button type="button" class="btn btn-primary" data-tr="ailock">🔒 讓 AI 從今天開始往後模擬這組</button></div>
      <details class="tr-list"><summary>📋 每一檔的滾動考試成績</summary><div class="tr-scroll"><table class="tr-cmp"><tr><th>標的</th><th>最後選的策略</th><th>考試串起來</th><th>買進持有</th><th>贏幾段</th></tr>
        ${res.map((x, i) => `<tr><td>${i === 0 ? "🥇 " : ""}${esc(x.name)}</td><td>${STRATS[x.k].name}</td><td class="${cls(x.oos)}">${pct(x.oos)}</td><td class="${cls(x.oosBh)}">${pct(x.oosBh)}</td><td>${x.beat}/4</td></tr>`).join("")}</table></div></details></div>`;
  }
  async function aiLock() { if (!AI) return; S.sym = AI.sym; S.st = AI.k; S.params[AI.k] = Object.assign(defParams(AI.k), AI.p); save(); render(); await createRun(`🤖 AI：${AI.sym} ${STRATS[AI.k].name.replace(/^\S+\s/, "")}`); }

  /* ---------- 💼 投資組合 ---------- */
  function portForm() {
    const P = S.port, used = P.rows.reduce((s, r) => s + (Number(r[1]) || 0), 0);
    return `<section class="card"><h2>💼 投資組合</h2><p class="tr-note">一次放好幾檔、設定比例，剩下的是現金。可以定期把比例拉回原本的設定（再平衡），跟「放著不管」比一比。</p>
      <div id="tr-prow">${P.rows.map((r, i) => `<div class="tr-row"><input class="tr-in" data-pr="s" data-i="${i}" value="${esc(r[0])}" style="width:120px"><input class="tr-in" data-pr="w" data-i="${i}" type="number" min="0" max="100" value="${r[1]}" style="width:70px">%<button type="button" class="tr-x" data-tr="prdel" data-v="${i}">✕</button></div>`).join("")}</div>
      <div class="tr-row"><button type="button" class="btn btn-small" data-tr="pradd">＋ 加一檔</button><span class="tr-note">💵 現金 ${Math.max(0, 100 - used)}%${used > 100 ? "（超過 100%，會照比例縮小）" : ""}</span></div>
      <div class="tr-grid"><label>再平衡<select id="tr-preb">${[["M", "每月"], ["Q", "每季"], ["Y", "每年"], ["N", "不再平衡"]].map(([k, n]) => `<option value="${k}" ${P.reb === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label>期間<select id="tr-prange">${[["1y", "1 年"], ["2y", "2 年"], ["5y", "5 年"], ["10y", "10 年"]].map(([k, n]) => `<option value="${k}" ${P.range === k ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
      <div class="tr-row"><button type="button" class="btn btn-primary" data-tr="port">▶️ 回測組合</button><span class="tr-note">以台幣計價，美元資產會換匯；手續費用上面的設定。</span></div><div id="tr-pout"></div></section>`;
  }
  function readPort() {
    document.querySelectorAll("[data-pr]").forEach(el => { const r = S.port.rows[el.dataset.i]; if (!r) return; if (el.dataset.pr === "s") r[0] = el.value.trim().toUpperCase(); else r[1] = Math.max(0, Number(el.value) || 0); });
    const reb = document.getElementById("tr-preb"); if (reb) { S.port.reb = reb.value; S.port.range = document.getElementById("tr-prange").value; }
    S.port.rows = S.port.rows.filter(r => r[0]); save();
  }
  async function runPort() {
    readPort(); const out = document.getElementById("tr-pout"), P = S.port, rows = P.rows.filter(r => r[1] > 0);
    if (!rows.length) return toast("至少放一檔、比例大於 0");
    out.innerHTML = `<p class="tr-note">載入行情中…</p>`;
    try {
      const tot = rows.reduce((s, r) => s + r[1], 0), W = rows.map(r => r[1] / Math.max(100, tot)), fx = await bars("TWD=X", P.range);
      const ds = []; for (const [s] of rows) ds.push(await bars(s, P.range));
      const dk = t => new Date(t + 8 * 3600e3).toISOString().slice(0, 10);
      const start = Math.max(...ds.map(d => d.bars[0].t)), days = [...new Set(ds.flatMap(d => d.bars.filter(b => b.t >= start).map(b => dk(b.t))))].sort();
      const px = ds.map(d => { const m = {}; d.bars.forEach(x => { m[dk(x.t)] = x.c; }); return m; }), usd = ds.map(d => (d.currency || "USD") === "USD");
      const fxm = {}; fx.bars.forEach(x => { fxm[dk(x.t)] = x.c; });
      const last = ds.map(() => null); let lfx = fx.bars[0].c;
      const prices = days.map(k => { if (fxm[k]) lfx = fxm[k]; return ds.map((_, j) => { if (px[j][k] != null) last[j] = px[j][k]; return last[j] == null ? null : last[j] * (usd[j] ? lfx : 1); }); });
      const fee = S.opt.fee / 100, cap = S.cap;
      const run = reb => { let cash = cap, u = rows.map(() => 0), pk = cap, mdd = 0, prev = null, feeSum = 0; const eq = [];
        days.forEach((k, i) => { const p = prices[i]; if (p.some(v => v == null)) { eq.push(null); return; }
          const per = reb === "M" ? k.slice(0, 7) : reb === "Q" ? k.slice(0, 4) + Math.floor((+k.slice(5, 7) - 1) / 3) : reb === "Y" ? k.slice(0, 4) : "N";
          if (prev == null || (reb !== "N" && per !== prev)) { const E = cash + u.reduce((s, x, j) => s + x * p[j], 0);
            u = u.map((x, j) => { const tgt = E * W[j] / p[j], dv = Math.abs(tgt - x) * p[j]; feeSum += dv * fee; cash -= (tgt - x) * p[j] + dv * fee; return tgt; }); }
          prev = per; const E = cash + u.reduce((s, x, j) => s + x * p[j], 0); eq.push(E); pk = Math.max(pk, E); mdd = Math.min(mdd, E / pk - 1); });
        const f = eq.filter(v => v != null), yrs = days.length > 1 ? (new Date(days[days.length - 1]) - new Date(days[0])) / 864e5 / 365 : 1;
        return { eq, final: f[f.length - 1], ret: f[f.length - 1] / cap - 1, mdd, cagr: yrs > 0.5 ? Math.pow(f[f.length - 1] / cap, 1 / yrs) - 1 : null, feeSum, u }; };
      const a = run(P.reb), n = run("N"), ts = days.map(k => new Date(k).getTime());
      const lastP = prices[prices.length - 1], finW = a.u.map((x, j) => x * lastP[j] / a.final);
      const st = (r, nm) => `<tr><td>${nm}</td><td class="${cls(r.ret)}">${pct(r.ret)}</td><td class="${cls(r.cagr)}">${pct(r.cagr)}</td><td class="dn">${pct(r.mdd)}</td><td>${money(r.final)}</td></tr>`;
      out.innerHTML = `<div class="tr-head"><b>💼 ${rows.map((r, j) => `${esc(ds[j].name)} ${r[1]}%`).join("＋")}${tot < 100 ? `＋現金 ${100 - tot}%` : ""}</b><small>${days[0]} → ${days[days.length - 1]}・台幣計價</small></div>
        ${lineChart([{ name: P.reb === "N" ? "不再平衡" : "定期再平衡", cls: "tr-eq", pts: ts.map((t, i) => [t, a.eq[i]]).filter(p => p[1] != null) }, ...(P.reb === "N" ? [] : [{ name: "放著不管", cls: "tr-bh", pts: ts.map((t, i) => [t, n.eq[i]]).filter(p => p[1] != null) }])])}
        <div class="tr-scroll"><table class="tr-cmp"><tr><th></th><th>總報酬</th><th>年化</th><th>最大回撤</th><th>最後資金</th></tr>${st(a, P.reb === "N" ? "不再平衡" : "定期再平衡")}${P.reb === "N" ? "" : st(n, "放著不管")}</table></div>
        <p class="tr-verdict">${P.reb === "N" ? "" : a.ret >= n.ret ? `⚖️ 再平衡多賺了 ${pct(a.ret - n.ret)}${a.mdd > n.mdd ? "，回撤也比較小" : ""}（手續費共 ${money(a.feeSum)}）。` : `⚖️ 再平衡少賺了 ${pct(n.ret - a.ret)}${a.mdd > n.mdd ? "，但回撤比較小，換到的是安心" : ""}（手續費共 ${money(a.feeSum)}）。`}</p>
        <p class="tr-note">現在的比例：${rows.map((r, j) => `${esc(ds[j].name)} ${(finW[j] * 100).toFixed(0)}%`).join("、")}・現金 ${Math.max(0, (1 - finW.reduce((s, v) => s + v, 0)) * 100).toFixed(0)}%</p>`;
    } catch (e) { out.innerHTML = `<p class="tr-note dn">😵 ${esc(e.message)}</p>`; }
  }

  /* ---------- 🔒 往後模擬＋🩺 體檢＋訊號 ---------- */
  async function loadRuns() {
    if (!hasDb()) return;
    const { data, error } = await db.from("trade_runs").select("*").order("created_at", { ascending: false });
    if (error) { const el = document.getElementById("tr-runs"); if (el) el.innerHTML = `<p class="tr-note">${esc(error.message)}</p>`; return; }
    runs = data || []; renderRuns(); renderToday();
  }
  const ACT = (side, next) => side === next ? (side > 0 ? ["繼續持有", ""] : side < 0 ? ["繼續放空", ""] : ["繼續空手", ""]) :
    next > 0 ? [side < 0 ? "回補並買進 🟢" : "買進 🟢", "buy"] : next < 0 ? [side > 0 ? "賣出並放空 🟣" : "放空 🟣", "short"] : [side > 0 ? "賣出 🔴" : "回補 🔴", "sell"];

  async function evalRun(r) {
    const p = r.params || {}, opt = normOpt(p._opt || { fee: Number(r.fee) }), params = Object.assign({}, p); delete params._opt;
    const d = await bars(r.symbol, "2y"), ctx = await context(r.symbol, d, "2y", opt), start = new Date(r.start_date + "T00:00:00+08:00").getTime();
    const from = d.bars.findIndex(b => b.t >= start), daysIn = Math.floor((Date.now() - start) / 864e5);
    if (from < 0 || from >= d.bars.length - 1) return { wait: true, daysIn, d };
    const res = simulate(d.bars, r.strategy, params, Number(r.capital), opt, from, ctx);
    /* 🩺 體檢：拿起始日之前的回測當「預期」，看實際有沒有差太多 */
    let health = null; const nLive = d.bars.length - 1 - from;
    if (from > 120) { const pre = simulate(d.bars.slice(0, from + 1), r.strategy, params, 1e5, opt, 0, sliceCtx(ctx, from + 1));
      const exp = pre.mu * nLive, live = res.ret, z = pre.sd ? (live - exp) / (pre.sd * Math.sqrt(nLive)) : 0;
      health = { n: nLive, exp, live, z, mddLive: res.mdd, mddPre: pre.mdd }; }
    return { d, ctx, res, from, daysIn, health, act: ACT(res.side, res.nextSide), last: d.bars[d.bars.length - 1] };
  }
  function healthHtml(h) {
    if (!h) return `<p class="tr-note">🩺 起始日之前的資料不夠，沒辦法體檢。</p>`;
    if (h.n < 5) return `<p class="tr-note">🩺 才跑 ${h.n} 根 K 線，再等幾天就能體檢。</p>`;
    const [ic, msg] = h.z <= -2 || h.mddLive < h.mddPre * 1.2 ? ["🔴", "明顯比過去差，這套公式可能失靈了，考慮停掉或換一套。"] : h.z <= -1 ? ["🟡", "比預期差一點，還在正常的運氣範圍內，繼續觀察。"] : h.z >= 1 ? ["🟢", "比預期還好！但別因此加碼，可能只是運氣。"] : ["✅", "跟過去的表現差不多，運作正常。"];
    return `<p class="tr-health">🩺 體檢 ${ic}：照過去回測，這 ${h.n} 根 K 線平均應該 ${pct(h.exp)}，實際 ${pct(h.live)}。${msg}${h.mddLive < h.mddPre * 1.2 ? `（目前回撤 ${pct(h.mddLive)} 已超過過去最大回撤 ${pct(h.mddPre)}）` : ""}</p>`;
  }
  function notifyIf(r, e) {
    if (!S.notify || !e || e.wait || !e.act[1] || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const k = `trn:${r.id}:${e.last.t}`; if (store.get(k)) return; store.set(k, "1");
    try { new Notification(`📈 ${r.name}`, { body: `${r.symbol} 下一個開盤：${e.act[0]}`, tag: k, icon: "img/icon-192.png" }); } catch (_) {}
  }

  async function renderRuns() {
    const el = document.getElementById("tr-runs"); if (!el) return;
    if (!runs.length) { el.innerHTML = `<p class="tr-note">還沒有。設定好策略後按「🔒 從今天開始往後模擬」，或讓 🤖 AI 挑一組。</p>`; return; }
    el.innerHTML = runs.map(r => { const o = normOpt((r.params || {})._opt || { fee: Number(r.fee) }); const tags = [o.mode === "longshort" && "多空", o.filter !== "none" && "濾網", (o.sl || o.tp || o.trail) && "停損停利", o.sizing === "vol" && "波動部位", o.twd && "台幣"].filter(Boolean);
      return `<div class="tr-run" id="run-${r.id}"><div class="tr-run-h"><b>${esc(r.name)}</b><small>${esc(r.symbol)}・${STRATS[r.strategy] ? STRATS[r.strategy].name : r.strategy}・從 ${r.start_date} 開始${tags.map(t => ` <span class="tr-tag">${t}</span>`).join("")}</small><button type="button" class="tr-x" data-tr="del" data-v="${r.id}" title="刪除">✕</button></div><div class="tr-run-b"><p class="tr-note">計算中…</p></div></div>`; }).join("");
    for (const r of runs) {
      const box = document.querySelector(`#run-${r.id} .tr-run-b`); if (!box) continue;
      try {
        const e = await evalRun(r); notifyIf(r, e);
        if (e.wait) { box.innerHTML = `<p class="tr-note">⏳ 第 ${e.daysIn + 1} 天：還在等起始日之後的第一根 K 線，明天收盤後再回來看。</p>`; continue; }
        box.innerHTML = `<p class="tr-note">已經跑了 ${e.daysIn} 天・${e.d.bars.length - 1 - e.from} 根 K 線。下一個開盤要：<b>${e.act[0]}</b></p>${healthHtml(e.health)}${chart(e.d.bars, e.res, e.from, Number(r.capital), e.ctx)}${stats(e.res)}${tradeList(e.res)}`;
      } catch (err) { box.innerHTML = `<p class="tr-note dn">😵 ${esc(err.message)}</p>`; }
    }
  }

  async function createRun(defName) {
    readForm(); const err = check(); if (err) return toast(err);
    try { await bars(S.sym, "1y"); } catch (e) { return toast("😵 " + e.message); }
    const name = prompt("幫這個模擬取個名字", defName || `${S.sym} ${STRATS[S.st].name.replace(/^\S+\s/, "")}`); if (name == null) return;
    const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    const { error } = await db.from("trade_runs").insert({ name: name.slice(0, 40) || S.sym, symbol: S.sym, strategy: S.st, params: Object.assign({}, S.params[S.st], { _opt: S.opt }), capital: S.cap, fee: S.opt.fee, start_date: today });
    if (error) return toast(error.message);
    toast("🔒 開始往後模擬了，之後回來看成績"); loadRuns();
  }

  /* ---------- 📈 今日頁：明日訊號卡 ---------- */
  async function renderToday() {
    const tp = document.querySelector('.page[data-page="today"]'); if (!tp) return;
    let box = document.getElementById("tr-today");
    if (!runs.length) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("section"); box.id = "tr-today"; box.className = "card"; const ref = document.getElementById("tw-today"); ref ? ref.after(box) : tp.appendChild(box); }
    box.innerHTML = `<h2>📈 明日交易訊號</h2><p class="tr-note">計算中…</p>`;
    const lines = [];
    for (const r of runs) { try { const e = await evalRun(r); notifyIf(r, e);
      lines.push(e.wait ? `<li><b>${esc(r.name)}</b>：等第一根 K 線</li>` : `<li class="${e.act[1] ? "act" : ""}"><b>${esc(r.name)}</b>：${e.act[0]}<small> ${pct(e.res.ret)}${e.health && e.health.n >= 5 && (e.health.z <= -2 || e.health.mddLive < e.health.mddPre * 1.2) ? " 🩺🔴" : ""}</small></li>`); }
      catch (err) { lines.push(`<li><b>${esc(r.name)}</b>：😵 ${esc(err.message)}</li>`); } }
    box.innerHTML = `<h2>📈 明日交易訊號</h2><ul class="tr-sig">${lines.join("")}</ul><button type="button" class="tr-more" onclick="showPage('trade')">看完整成績 →</button>`;
  }

  /* ---------- 事件 ---------- */
  async function onClick(e) {
    const b = e.target.closest("[data-tr]"); if (!b || busy) return;
    const a = b.dataset.tr, v = b.dataset.v;
    if (a === "mk") { readForm(); S.mk = v; S.sym = MARKETS[v].list[0][0]; save(); render(); return; }
    if (a === "sym") { readForm(); S.sym = v; save(); render(); return; }
    if (a === "pick") { S.st = v; save(); render(); return runOne(); }
    if (a === "tpl") { document.getElementById("tr-buy").value = b.dataset.b; document.getElementById("tr-sell").value = b.dataset.s; return; }
    if (a === "real") { readForm(); Object.assign(S.opt, REAL(S.sym)); save(); render(); return toast("💸 已套用真實成本"); }
    if (a === "reset") { const fee = S.opt.fee; S.opt = normOpt({ fee }); save(); render(); return; }
    if (a === "pmap") { const out = document.getElementById("tr-out"); readForm(); S.params[S.st][out.dataset.ka] = Number(b.dataset.a); S.params[S.st][out.dataset.kb] = Number(b.dataset.b); save(); render(); return runOne(); }
    if (a === "pradd") { readPort(); S.port.rows.push(["", 10]); save(); render(); return; }
    if (a === "prdel") { readPort(); S.port.rows.splice(Number(v), 1); save(); render(); return; }
    if (a === "del") { if (!confirm("刪除這個往後模擬？")) return; const { error } = await db.from("trade_runs").delete().eq("id", v); if (error) return toast(error.message); runs = runs.filter(r => r.id !== v); renderRuns(); renderToday(); return; }
    busy = true;
    try { if (a === "run") await runOne(); else if (a === "cmp") await compare(); else if (a === "map") await paramMap(); else if (a === "fwd") await createRun(); else if (a === "ai") await aiPick(); else if (a === "ailock") await aiLock(); else if (a === "port") await runPort(); } finally { busy = false; }
  }
  async function onChange(e) {
    if (e.target.id === "tr-st") { readForm(); render(); }
    if (e.target.id === "tr-notify") {
      if (e.target.checked) { if (typeof Notification === "undefined") { e.target.checked = false; return toast("這個瀏覽器不支援通知"); }
        const p = await Notification.requestPermission(); if (p !== "granted") { e.target.checked = false; return toast("要允許通知才能提醒你"); } }
      S.notify = e.target.checked; save(); toast(S.notify ? "🔔 有新的買賣訊號會通知你" : "🔕 關掉訊號提醒");
    }
  }
  document.addEventListener("toggle", e => { if (e.target.classList && e.target.classList.contains("tr-adv")) store.set("trAdv", e.target.open ? "1" : "0"); }, true);

  const css = document.createElement("style");
  css.textContent = `
    .tr-note { font-size: 12.5px; opacity: .75; margin: 4px 0; } .tr-note.small { font-size: 11.5px; opacity: .6; margin-top: 10px; }
    .tr-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; align-items: center; }
    .tr-chip { border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; }
    .tr-chip.sm { padding: 4px 10px; font-size: 12.5px; } .tr-chip.on { background: var(--accent, #6c63ff); border-color: transparent; color: #fff; }
    .tr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin: 8px 0; }
    .tr-grid label, .tr-formula label { font-size: 12px; opacity: .9; display: flex; flex-direction: column; gap: 3px; }
    .tr-grid input, .tr-grid select, .tr-in { font: inherit; font-size: 14px; padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(127,127,127,.35); background: rgba(127,127,127,.08); color: inherit; min-width: 0; }
    .tr-ck { flex-direction: row !important; align-items: center; gap: 6px !important; font-size: 13px !important; margin: 6px 0; display: flex; }
    .tr-formula { display: grid; gap: 6px; margin: 6px 0; } .tr-formula .tr-in { width: 100%; box-sizing: border-box; font-family: ui-monospace, monospace; font-size: 13px; }
    .tr-adv { margin: 8px 0; border: 1px solid rgba(127,127,127,.25); border-radius: 10px; padding: 6px 10px; } .tr-adv summary { cursor: pointer; font-size: 13.5px; }
    .tr-tag { font-size: 10.5px; padding: 1px 6px; border-radius: 6px; background: rgba(124,92,255,.2); margin-left: 4px; white-space: nowrap; }
    .tr-desc { font-size: 13px; padding: 8px 10px; border-radius: 10px; background: rgba(127,127,127,.1); margin: 6px 0; }
    .tr-head { margin: 12px 0 4px; } .tr-head small { opacity: .65; font-size: 11.5px; display: block; }
    .tr-chart { width: 100%; height: 230px; display: block; background: rgba(127,127,127,.06); border-radius: 10px; }
    .tr-chart path { vector-effect: non-scaling-stroke; }
    .tr-price { fill: none; stroke: #8aa4c8; stroke-width: 1.4; }
    .tr-eq { fill: none; stroke: #3fb950; stroke-width: 2; } .tr-bh { fill: none; stroke: #e3b341; stroke-width: 1.4; stroke-dasharray: 4 3; }
    .tr-eqk { fill: #3fb950; } .tr-bhk { fill: #e3b341; }
    .tr-buy { fill: #3fb950; } .tr-sell { fill: #f85149; } .tr-short { fill: #b48cff; } .tr-cover { fill: #e3b341; } .tr-gate { fill: rgba(127,127,127,.14); }
    .tr-sep { stroke: rgba(127,127,127,.3); vector-effect: non-scaling-stroke; } .tr-hup { fill: rgba(63,185,80,.75); } .tr-hdn { fill: rgba(248,81,73,.75); }
    .tr-ax { font-size: 11px; fill: currentColor; opacity: .6; } .tr-k1 { fill: #3fb950; } .tr-k2 { fill: #e3b341; }
    .tr-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 6px; margin: 10px 0; }
    .tr-st { padding: 8px 10px; border-radius: 10px; background: rgba(127,127,127,.08); } .tr-st small { display: block; font-size: 11px; opacity: .65; } .tr-st b { font-size: 15px; }
    .up { color: #3fb950; } .dn { color: #f85149; }
    .tr-verdict, .tr-health { font-size: 13.5px; padding: 8px 10px; border-left: 3px solid var(--accent, #6c63ff); background: rgba(127,127,127,.06); border-radius: 6px; }
    .tr-scroll { overflow-x: auto; } .tr-list summary { cursor: pointer; font-size: 13px; margin: 8px 0; }
    .tr-scroll table { width: 100%; border-collapse: collapse; font-size: 12.5px; white-space: nowrap; } .tr-scroll th, .tr-scroll td { padding: 5px 6px; text-align: right; border-bottom: 1px solid rgba(127,127,127,.15); }
    .tr-scroll th:first-child, .tr-scroll td:first-child { text-align: left; } .tr-scroll tr.open td { font-weight: 600; } .tr-scroll td small { opacity: .6; font-size: 10.5px; }
    .tr-heat td { text-align: center !important; font-size: 11.5px; min-width: 26px; } .tr-pmap td { cursor: pointer; } .tr-pmap td.me { outline: 2px solid currentColor; outline-offset: -2px; font-weight: 700; }
    .tr-cmp tr[data-tr] { cursor: pointer; } .tr-cmp tr[data-tr]:hover td { background: rgba(127,127,127,.08); }
    .tr-run { border: 1px solid rgba(127,127,127,.25); border-radius: 12px; padding: 10px; margin: 8px 0; }
    .tr-run-h { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; } .tr-run-h small { opacity: .75; font-size: 11.5px; flex: 1; display: inline; }
    .tr-ai { background: linear-gradient(90deg, #7c5cff, #2fb8ff) !important; color: #fff !important; border: 0 !important; width: 100%; }
    .tr-ai-box { border: 1px solid rgba(124,92,255,.45); border-radius: 12px; padding: 10px; margin-top: 10px; background: rgba(124,92,255,.06); }
    .tr-x { border: 0; background: none; color: inherit; opacity: .5; cursor: pointer; font-size: 14px; }
    .tr-sig { margin: 4px 0; padding-left: 18px; font-size: 13.5px; } .tr-sig li { margin: 3px 0; } .tr-sig li.act { font-weight: 600; } .tr-sig small { opacity: .7; font-weight: 400; }
    .tr-more { display: block; margin: 6px 0 0 auto; border: 0; background: none; color: inherit; opacity: .7; font-size: 12px; cursor: pointer; }`;
  document.head.appendChild(css);

  if (typeof window.applyPage === "function") {
    const base = window.applyPage;
    window.applyPage = function (name) { const r = base.apply(this, arguments); if (name === "trade") setTimeout(() => { if (!document.getElementById("tr-out")) render(); loadRuns(); }, 0); return r; };
  }
  function boot() { try { ensurePage(); render(); } catch (e) { console.warn(e); } if (location.hash === "#trade" && typeof applyPage === "function") setTimeout(() => applyPage("trade"), 0); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  (function wait(n) { if (!hasDb()) { if (n < 60) setTimeout(() => wait(n + 1), 1000); return; } loadRuns(); setInterval(() => { if (!document.hidden && runs.length) renderToday(); }, 30 * 60 * 1000); })(0);
  window.TradeSim = { simulate, STRATS, compile };
})();
