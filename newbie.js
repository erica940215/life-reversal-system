/* 🐣 新手模式＋新手教室
   ‧ 新手模式：股票分析的專有名詞可以點開看白話解釋，每個面向多一句「這代表什麼」
   ‧ 新手教室：12 堂課，每週解鎖一堂；先比喻、再重點、最後小測驗，答完拿星屑
   資料：sql/2026-11-12_新手教室.sql */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };
  const on = () => store.get("stockNewbie") !== "0";

  /* ---------- 名詞白話 ---------- */
  const GL = {
    "本益比": "股價 ÷ 每股一年賺多少。想成「用現在的價格買下來，靠它賺的錢要幾年才回本」。15 倍＝15 年回本，越低越便宜。",
    "預估本益比": "用分析師預估「明年」的獲利算的本益比。比現在的本益比低，代表大家預期它會賺更多。",
    "PEG": "本益比 ÷ 獲利成長率。小於 1 代表「雖然貴，但成長夠快撐得起」；大於 2 代表價格跑太快。",
    "股價淨值比": "股價 ÷ 每股淨值（公司資產扣掉負債）。1 倍＝用帳面價值買；越高代表市場越看好它的賺錢能力。",
    "殖利率": "一年發的股利 ÷ 股價。像房租收益率：3% 就是放 100 元一年領 3 元。",
    "RSI": "最近 14 天「漲的力氣」佔多少，0～100。超過 70 像跑太快會喘（過熱），低於 30 像跌過頭（超賣）。",
    "MACD": "比較短期和長期的平均價，看漲跌的力道是變強還是變弱。在訊號線上方＝力道偏多。",
    "ATR": "平均每天的價格振幅。ATR 3% 代表它一天常常上下跳 3%，停損不要設得比這個還窄。",
    "Beta": "跟大盤的連動程度。1.5＝大盤漲跌 1%，它平均漲跌 1.5%，比較刺激。",
    "年化波動": "價格一年大概會上下晃多少。20% 算溫和，50% 以上就像雲霄飛車。",
    "最大回檔": "從高點跌到最低點跌了多少。-30% 代表曾經有人在高點買，一度虧掉三成。",
    "月線": "最近 20 個交易日的平均價格，代表這一個月大家的平均成本。",
    "季線": "最近 60 個交易日的平均價格，代表一季的平均成本，很多人拿來判斷中期方向。",
    "年線": "最近 200 個交易日的平均價格，代表長期趨勢。站上年線通常被當作多頭。",
    "均線多頭排列": "短的均線在上、長的在下，代表最近買的人成本越來越高、大家願意追，是上升趨勢。",
    "均線空頭排列": "短的均線在下、長的在上，代表最近價格越來越低，是下降趨勢。",
    "支撐": "過去在這個價位常常跌不下去，像地板。跌破地板通常會再往下找下一層。",
    "壓力": "過去在這個價位常常漲不上去，像天花板。突破天花板常常會再往上衝一段。",
    "營收年增": "這個月的營業額跟去年同一個月比。比「月增」更準，因為不受季節影響。",
    "月增": "跟上個月比。會受季節、工作天數影響，參考就好。",
    "毛利率": "賣 100 元東西，扣掉直接成本後剩多少。越高代表產品越有競爭力、越能定價。",
    "營業利益率": "再扣掉管銷、研發費用後剩多少，代表本業賺錢的能力。",
    "淨利率": "最後真正放進口袋的比例（扣完所有費用和稅）。",
    "ROE": "股東權益報酬率：公司用股東的 100 元，一年能賺回多少。超過 15% 算很會賺。",
    "負債": "公司欠別人的錢。負債／股東權益超過 100% 代表借的比自己的多，景氣不好時壓力大。",
    "目標價": "分析師覺得一年內合理的價格。只是預測，常常會改，而且通常偏樂觀。",
    "市值": "股價 × 總股數＝買下整間公司要多少錢。",
    "買進持有": "買了就一直抱著不賣。是所有策略要打敗的基本門檻。",
    "成交量": "這天買賣了多少股。漲的時候量大＝很多人搶著買；跌的時候量大＝很多人急著賣。"
  };
  const KEYS = Object.keys(GL).sort((a, b) => b.length - a.length);
  const RE = new RegExp(KEYS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  /* 已經 escape 過的文字裡，把名詞包成可以點開的說明 */
  function gl(html) {
    if (!on()) return html;
    const seen = new Set();
    return html.replace(RE, m => { if (seen.has(m)) return m; seen.add(m); return `<span class="nb-gl" tabindex="0" data-tip="${esc(GL[m])}">${m}</span>`; });
  }

  /* ---------- 每個面向「這代表什麼」 ---------- */
  const PLAIN = {
    trend: ["📉 股價正在往下走，現在進場像逆著電扶梯往上爬。", "↔️ 方向還不明確，上上下下在整理。", "📈 股價正在往上走的路上，順著趨勢比較省力。"],
    mom: ["😮‍💨 最近沒什麼力氣，買盤偏弱。", "🙂 力道普通，不冷不熱。", "🔥 最近漲得很有力，但要注意是不是漲過頭。"],
    rel: ["🐢 比大盤弱：大家比較不想買它。", "🚶 跟大盤差不多。", "🐇 比大盤強：資金比較喜歡它。"],
    risk: ["🎢 波動很大，一天上下好幾 % 很正常，要能承受。", "🚗 波動中等。", "🚃 走得比較穩，適合不想天天提心吊膽的人。"],
    vol: ["🔇 下跌時量比較大，賣的人比較急。", "🔈 買賣力道差不多。", "🔊 上漲時有量，代表有人真的在買。"],
    pos: ["⬇️ 在一年區間的低處：可能便宜，也可能是弱勢，要搭配趨勢看。", "⏺️ 在一年區間的中間。", "⬆️ 接近一年高點：代表強勢，但追高要更小心停損。"],
    val: ["💸 以獲利來看價格偏貴，市場已經把很多好消息算進去了。", "⚖️ 價格大致合理。", "🏷️ 以獲利來看價格偏便宜，但也要確認不是因為公司變差。"],
    fund: ["🏚️ 營收或獲利在退步，要小心。", "🏠 公司本業普通穩定。", "🏭 營收、獲利都在成長，公司體質好。"],
    analyst: ["👎 分析師覺得上漲空間不大。", "🤷 分析師看法普通。", "👍 分析師普遍看好，但他們也常常錯。"]
  };
  const plain = (key, s) => !on() || s == null || !PLAIN[key] ? "" : `<p class="nb-plain">🐣 ${PLAIN[key][s >= 62 ? 2 : s >= 42 ? 1 : 0]}</p>`;
  const plainTotal = s => !on() ? "" : `<p class="nb-plain">🐣 綜合 ${s} 分的意思：${s >= 70 ? "大部分條件都不錯，但「好公司」不等於「現在是好價格」，還是要分批、設停損。" : s >= 55 ? "優點比缺點多一點，可以放進觀察名單，等更好的價位或訊號。" : s >= 42 ? "好壞參半，新手先觀望、多看幾週比較安全。" : "目前條件偏弱，新手不建議現在進場。"}<br>新手小提醒：個股最多佔你投資的 10%，主力還是放在大盤 ETF 定期定額。</p>`;

  /* ---------- 📚 新手教室 ---------- */
  const L = [
    { t: "股票到底是什麼？", a: "想像你和朋友合開一間早餐店，你出 1 萬、佔 10%。早餐店賺錢，你分 10%；有人想用 2 萬買你那 10%，你的「股票」就漲了。", p: ["買股票＝買下一間公司的一小部分。", "股價會漲，是因為大家覺得這間公司未來會賺更多。", "短期股價常常亂跳，長期才會跟公司賺多少有關。"], try: "到 🔎 股票分析查「台積電」，看看它的市值：買下整間公司要多少錢。",
      q: [["買一張台積電股票，代表什麼？", ["借錢給台積電", "擁有台積電的一小部分", "在台積電上班"], 1], ["長期來說，股價主要跟什麼有關？", ["新聞熱度", "公司賺多少錢", "今天天氣"], 1], ["短期股價亂跳很正常嗎？", ["正常", "不正常，一定有人作手腳"], 0]] },
    { t: "ETF：一次買一整籃", a: "你不知道哪顆水果最甜，就直接買一整籃綜合水果。有一顆爛掉也沒關係，整籃還是好吃。ETF 就是一籃股票。", p: ["0050 一次買了台灣最大的 50 間公司。", "分散：一間公司出事，不會讓你一夜賠光。", "管理費很低，適合沒時間研究的人。"], try: "在 🔎 股票分析查「0050」，比較它和個股的年化波動，通常小很多。",
      q: [["ETF 最大的好處是？", ["保證賺錢", "分散風險", "漲最快"], 1], ["0050 大約包含幾間公司？", ["5 間", "50 間", "500 間"], 1], ["一間公司倒閉，對 0050 的影響是？", ["全部歸零", "影響很小", "一定漲"], 1]] },
    { t: "定期定額與複利", a: "滾雪球：一開始雪球很小，滾得很慢；但雪球越大，一圈沾的雪越多。錢也是，賺來的錢會再幫你賺錢。", p: ["每月固定一天買固定金額，不用猜高低點。", "下跌時同樣的錢買到更多股，等於自動逢低加碼。", "複利需要時間：越早開始、越少中斷，效果越大。"], try: "到 📈 模擬交易選「🗓️ 定期定額」，跟其他策略比一比。",
      q: [["定期定額遇到下跌，代表？", ["要趕快停扣", "同樣的錢買到更多股", "一定賠錢"], 1], ["複利最需要的是？", ["時間", "運氣", "內線消息"], 0], ["定期定額需要猜高低點嗎？", ["需要", "不需要"], 1]] },
    { t: "風險：回檔是門票", a: "坐雲霄飛車，會往下衝才會往上。想要股票的長期報酬，就得付「中途會下跌」這張門票。", p: ["大盤歷史上跌 20～30% 不算少見，跌 50% 也發生過。", "會讓人賠大錢的，往往不是下跌本身，而是在低點嚇到賣掉。", "先想好：跌三成時，我還睡得著嗎？"], try: "在 💼 投資組合試「0050 100%」，看最大回撤是多少。",
      q: [["「最大回檔 -30%」是什麼意思？", ["一年賺 30%", "曾經從高點跌了三成", "手續費 30%"], 1], ["新手最常把下跌變成真的虧損的方式是？", ["低點恐慌賣掉", "繼續定期定額", "什麼都不做"], 0], ["投資前該先問自己什麼？", ["明天會漲嗎", "跌三成我能承受嗎", "朋友買了沒"], 1]] },
    { t: "本益比：幾年回本？", a: "早餐店一年賺 10 萬，有人開價 150 萬賣你，你要 15 年才回本，這就是本益比 15 倍。", p: ["本益比＝股價 ÷ 每股一年賺多少。", "越低越便宜，但成長快的公司本益比通常比較高。", "同產業互相比較才有意義。"], try: "在 🔎 股票分析比較台積電和富邦金的本益比。",
      q: [["本益比 20 倍大約代表？", ["20 天回本", "照現在的獲利 20 年回本", "股價 20 元"], 1], ["本益比低一定是好股票嗎？", ["一定是", "不一定，可能是公司變差"], 1], ["本益比要怎麼比比較公平？", ["跟同產業比", "跟比特幣比"], 0]] },
    { t: "殖利率與股利", a: "買一間套房出租，100 萬的房子一年收 3 萬房租，收益率 3%。殖利率就是股票的房租收益率。", p: ["殖利率＝一年股利 ÷ 股價。", "高殖利率很吸引人，但要確認公司能不能一直發得出來。", "發股利時股價會扣掉股利（除息），不是白拿的。"], try: "在 🔎 股票分析查「00878」，看它的殖利率。",
      q: [["股價 100 元、一年發 5 元，殖利率是？", ["5%", "20%", "0.5%"], 0], ["除息後股價會？", ["扣掉股利", "多加股利", "不變"], 0], ["只看殖利率選股的風險是？", ["公司可能發不出來", "沒有風險"], 0]] },
    { t: "營收和獲利", a: "早餐店一天賣 1 萬（營收），扣掉蛋、麵包、薪水、房租，最後真的賺 1 千（獲利）。賣很多不代表賺很多。", p: ["營收年增：跟去年同月比，看生意有沒有變好。", "毛利率高＝產品有競爭力，能賣好價錢。", "台股每月 10 號前公布上個月營收，是追蹤公司最快的方法。"], try: "在 🔎 股票分析打開「🏭 基本面」，找營收年增和毛利率。",
      q: [["營收很高，一定賺很多嗎？", ["一定", "不一定，要看成本"], 1], ["為什麼看「年增」比「月增」準？", ["不受季節影響", "數字比較大"], 0], ["台股月營收大約什麼時候公布？", ["每月 10 號前", "每年一次"], 0]] },
    { t: "均線：大家的平均成本", a: "量全班最近 20 天的平均體溫，比只看今天準。月線就是最近 20 天大家買進的平均價。", p: ["股價在均線上面＝最近買的人大多賺錢，心情好。", "月線看短期、季線看中期、年線看長期。", "短均線在長均線上面（多頭排列）＝上升趨勢。"], try: "在 🔎 股票分析看走勢圖上的季線（黃）和年線（紫）。",
      q: [["月線大約是幾天的平均？", ["20 天", "200 天", "5 天"], 0], ["股價跌破年線通常代表？", ["長期趨勢轉弱", "一定大漲"], 0], ["多頭排列是？", ["短均線在長均線上面", "短均線在長均線下面"], 0]] },
    { t: "RSI：跑太快會喘", a: "跑步一口氣衝太快一定會喘、得慢下來。股價連漲太多天也一樣，RSI 就是它的心跳。", p: ["RSI 0～100，超過 70 算過熱、低於 30 算超賣。", "過熱不代表馬上跌，強勢股可以熱很久。", "比較適合在盤整的股票用，不適合單獨當買賣依據。"], try: "在 📈 模擬交易跑「🌡️ RSI」，再跟「📦 買進持有」比。",
      q: [["RSI 85 代表？", ["過熱", "超賣", "沒意義"], 0], ["RSI 過熱就一定會跌嗎？", ["一定", "不一定"], 1], ["RSI 最好怎麼用？", ["搭配趨勢一起看", "看到就全部押"], 0]] },
    { t: "支撐與壓力：地板和天花板", a: "球在房間裡彈：地板讓它掉不下去，天花板讓它彈不上去。股價也常在某些價位反覆碰到又彈回。", p: ["支撐＝過去常跌不下去的價位；壓力＝常漲不上去的價位。", "跌破支撐，地板就變成新的天花板。", "支撐很適合拿來設停損點。"], try: "在 🔎 股票分析的走勢圖找綠色虛線（支撐）和紅色虛線（壓力）。",
      q: [["支撐像什麼？", ["地板", "天花板"], 0], ["突破壓力後常常會？", ["再往上一段", "立刻跌回去"], 0], ["停損點適合設在？", ["支撐下方", "隨便設"], 0]] },
    { t: "停損與部位：保險絲", a: "家裡電線過載時，保險絲會先燒斷，保護整間房子。停損就是投資的保險絲：小賠出場，保住本金。", p: ["進場前就決定「跌到哪裡我認錯」。", "單一個股不要超過總資金的 10%。", "賠 50% 要賺 100% 才回本，所以不要讓小傷變大傷。"], try: "在 📈 模擬交易的 ⚙️ 進階設定加上停損 10%，看最大回撤有沒有變小。",
      q: [["賠 50% 要賺多少才回本？", ["50%", "100%", "25%"], 1], ["停損什麼時候決定？", ["進場前", "賠很多以後"], 0], ["單一個股建議最多佔多少？", ["10%", "100%"], 0]] },
    { t: "情緒與紀律", a: "減肥最難的不是知道要少吃，而是半夜看到炸雞時忍得住。投資最難的也不是方法，是情緒。", p: ["FOMO：怕錯過而追高，是新手最常見的錯。", "寫下規則，照規則做，不要照心情做。", "少看盤：天天看股價只會讓你想亂動。"], try: "讓一組 🔒 往後模擬跑一個月，每次有訊號就寫下「我會不會照做」。",
      q: [["FOMO 是什麼？", ["怕錯過而衝動追高", "一種 ETF"], 0], ["對抗情緒最好的方法是？", ["事先寫好規則", "每天看盤十次"], 0], ["大家都在討論某檔股票時，通常代表？", ["已經漲一段了", "一定還會漲十倍"], 0]] }
  ];
  const NB = { done: {}, loaded: false, err: null };
  async function load() {
    if (!hasDb()) return;
    const { data, error } = await db.from("newbie_lessons").select("lesson, score, total, done_at");
    if (error) { NB.err = error.message; } else { NB.done = {}; (data || []).forEach(r => { NB.done[r.lesson] = r; }); NB.err = null; }
    NB.loaded = true; renderCard(); renderToday();
  }
  /* 第 1 堂一開始就能上；之後每一堂要等上一堂完成滿 7 天 */
  function status(i) {
    if (NB.done[i + 1]) return "done";
    if (i === 0) return "open";
    const prev = NB.done[i]; if (!prev) return "lock";
    const days = (Date.now() - new Date(prev.done_at).getTime()) / 864e5;
    return days >= 7 ? "open" : `wait:${Math.ceil(7 - days)}`;
  }
  const nextOpen = () => L.findIndex((_, i) => status(i) === "open");

  function cardHtml() {
    const n = Object.keys(NB.done).length, nx = nextOpen();
    return `<h2>🐣 新手教室 <small class="nb-prog">${n}/${L.length}</small></h2>
      <label class="nb-sw"><input type="checkbox" id="nb-mode" ${on() ? "checked" : ""}> 🐣 新手模式：名詞可以點開看白話、每個面向多一句「這代表什麼」</label>
      ${NB.err ? `<p class="tr-note">${/newbie_lessons/.test(NB.err) ? "資料庫還沒設定：到 Supabase 執行 sql/2026-11-12_新手教室.sql" : esc(NB.err)}</p>` : ""}
      <div class="nb-path">${L.map((l, i) => { const s = status(i); return `<button type="button" class="nb-node ${s.split(":")[0]}" data-nb="${i}" title="${esc(l.t)}"><b>${s === "done" ? "✅" : s === "open" ? "📖" : "🔒"}</b><small>${i + 1}</small></button>`; }).join("")}</div>
      ${nx >= 0 ? `<button type="button" class="btn btn-primary" data-nb="${nx}" style="width:100%">📖 第 ${nx + 1} 堂：${esc(L[nx].t)}（+80 星屑）</button>` : n >= L.length ? `<p class="tr-note">🎓 12 堂全部完成！隨時可以點上面的課回去複習。</p>` : (() => { const w = L.map((_, i) => status(i)).find(s => s.startsWith("wait")); return `<p class="tr-note">⏳ 下一堂 ${w ? w.split(":")[1] + " 天後" : ""}解鎖。一週一堂，讓概念有時間消化；可以先去網站上試試這週學的東西。</p>`; })()}`;
  }
  function renderCard() {
    const page = document.querySelector('.page[data-page="stock"]'); if (!page) return;
    let box = document.getElementById("nb-card");
    if (!box) { box = document.createElement("section"); box.id = "nb-card"; box.className = "card"; const first = page.querySelector("section.card"); first ? first.after(box) : page.prepend(box); }
    box.innerHTML = cardHtml();
  }
  function renderToday() {
    const tp = document.querySelector('.page[data-page="today"]'); if (!tp || !NB.loaded || NB.err) return;
    let box = document.getElementById("nb-today"); const nx = nextOpen();
    if (nx < 0) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("section"); box.id = "nb-today"; box.className = "card"; const ref = document.getElementById("tr-today") || document.getElementById("tw-today"); ref ? ref.after(box) : tp.appendChild(box); }
    box.innerHTML = `<h2>🐣 這週的新手課</h2><p style="margin:4px 0">第 ${nx + 1} 堂：<b>${esc(L[nx].t)}</b></p><p class="tr-note">大約 3 分鐘，答完小測驗 +80 星屑</p><button type="button" class="btn btn-primary" data-nb="${nx}" style="width:100%">📖 開始上課</button>`;
  }

  function openLesson(i) {
    const l = L[i], s = status(i);
    if (s === "lock" || s.startsWith("wait")) return toast(s === "lock" ? "要先完成前一堂喔" : `再 ${s.split(":")[1]} 天解鎖，先消化上一堂吧`);
    const m = document.createElement("div"); m.className = "vg-modal"; let step = 0; const ans = [];
    const draw = () => {
      let body;
      if (step === 0) body = `<div class="nb-ana">🧸 <b>先想像一下</b><p>${esc(l.a)}</p></div><button type="button" class="btn btn-primary" data-ns="next" style="width:100%">懂了，下一步 →</button>`;
      else if (step === 1) body = `<div class="nb-pts"><b>📌 三個重點</b><ol>${l.p.map(x => `<li>${gl(esc(x))}</li>`).join("")}</ol></div><div class="nb-try">🧪 <b>試試看</b>：${esc(l.try)}</div><button type="button" class="btn btn-primary" data-ns="next" style="width:100%">來小測驗 →</button>`;
      else if (step - 2 < l.q.length) { const [q, opts] = l.q[step - 2]; body = `<p class="nb-qn">小測驗 ${step - 1}/${l.q.length}</p><p class="nb-q">${esc(q)}</p>${opts.map((o, k) => `<button type="button" class="nb-opt" data-na="${k}">${esc(o)}</button>`).join("")}`; }
      else { const ok = ans.filter(Boolean).length; body = `<div class="nb-end"><div style="font-size:42px">${ok === l.q.length ? "🎉" : ok ? "👍" : "📚"}</div><p><b>答對 ${ok}/${l.q.length}</b></p>${l.q.map(([q, o, c], k) => `<p class="tr-note">${ans[k] ? "✅" : "❌"} ${esc(q)} → ${esc(o[c])}</p>`).join("")}</div>
        <button type="button" class="btn btn-primary" data-ns="finish" style="width:100%">${NB.done[i + 1] ? "完成複習" : "完成這堂課（+80 星屑）"}</button>`; }
      m.innerHTML = `<div class="vg-card nb-card"><div class="vg-title">🐣 第 ${i + 1} 堂：${esc(l.t)}</div><div class="nb-dots">${[0, 1, ...l.q.map((_, k) => k + 2), 2 + l.q.length].map(k => `<i class="${k <= step ? "on" : ""}"></i>`).join("")}</div>${body}<button type="button" class="btn" data-vx="1" style="width:100%;margin-top:8px">先離開</button></div>`;
    };
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-vx]")) return m.remove();
      if (e.target.closest("[data-ns=next]")) { step++; return draw(); }
      const a = e.target.closest("[data-na]");
      if (a) { const [, , c] = l.q[step - 2], k = Number(a.dataset.na); ans.push(k === c); m.querySelectorAll(".nb-opt").forEach((b, j) => { b.disabled = true; b.classList.add(j === c ? "ok" : j === k ? "no" : "x"); }); setTimeout(() => { step++; draw(); }, 900); return; }
      if (e.target.closest("[data-ns=finish]")) {
        if (!NB.done[i + 1]) { const { data, error } = await db.rpc("newbie_done", { p_lesson: i + 1, p_score: ans.filter(Boolean).length, p_total: l.q.length }); if (error) return toast(error.message); toast(data && data.granted ? "🎓 完成！星屑 +80" : "🎓 完成！"); await load(); }
        m.remove();
      }
    });
    draw(); document.body.appendChild(m);
  }

  document.addEventListener("click", e => { const b = e.target.closest("[data-nb]"); if (b) openLesson(Number(b.dataset.nb)); });
  document.addEventListener("change", e => { if (e.target.id === "nb-mode") { store.set("stockNewbie", e.target.checked ? "1" : "0"); toast(e.target.checked ? "🐣 新手模式開啟，重新分析一次就會看到" : "新手模式關閉"); if (window.StockPage) window.StockPage.rerender(); } });

  const css = document.createElement("style");
  css.textContent = `
    .nb-gl { border-bottom: 1px dashed currentColor; cursor: help; position: relative; outline: none; }
    .nb-gl:focus::after, .nb-gl:hover::after { content: attr(data-tip); position: absolute; left: 0; top: 1.6em; z-index: 30; width: min(260px, 70vw); padding: 8px 10px; border-radius: 10px; background: #1f2433; color: #fff; font-size: 12.5px; line-height: 1.5; font-weight: 400; box-shadow: 0 6px 20px rgba(0,0,0,.35); white-space: normal; }
    .nb-plain { font-size: 13px; margin: 6px 0 2px; padding: 6px 10px; border-radius: 8px; background: rgba(255,213,74,.12); }
    .nb-prog { font-size: 12px; opacity: .6; font-weight: 400; } .nb-sw { display: flex; gap: 6px; align-items: center; font-size: 13px; margin: 4px 0 8px; }
    .nb-path { display: flex; gap: 4px; flex-wrap: wrap; margin: 6px 0 10px; }
    .nb-node { width: 38px; height: 44px; border-radius: 10px; border: 1px solid rgba(127,127,127,.3); background: rgba(127,127,127,.06); color: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0; }
    .nb-node b { font-size: 15px; } .nb-node small { font-size: 10px; opacity: .6; } .nb-node.done { background: rgba(63,185,80,.15); border-color: rgba(63,185,80,.4); } .nb-node.open { background: rgba(124,92,255,.18); border-color: #7c5cff; animation: nbPulse 2s infinite; } .nb-node.lock, .nb-node.wait { opacity: .5; }
    @keyframes nbPulse { 50% { box-shadow: 0 0 0 4px rgba(124,92,255,.2); } }
    .nb-card { max-width: 440px; } .nb-dots { display: flex; gap: 4px; justify-content: center; margin: 6px 0 12px; } .nb-dots i { width: 22px; height: 4px; border-radius: 4px; background: rgba(127,127,127,.3); } .nb-dots i.on { background: #7c5cff; }
    .nb-ana { padding: 12px; border-radius: 12px; background: rgba(255,213,74,.12); margin-bottom: 12px; font-size: 14.5px; line-height: 1.6; } .nb-ana p { margin: 6px 0 0; }
    .nb-pts { font-size: 14px; line-height: 1.6; } .nb-pts ol { padding-left: 20px; margin: 6px 0; } .nb-pts li { margin: 4px 0; }
    .nb-try { font-size: 13px; padding: 8px 10px; border-radius: 10px; background: rgba(124,92,255,.1); margin: 8px 0 12px; }
    .nb-qn { font-size: 12px; opacity: .6; margin: 0; } .nb-q { font-size: 16px; font-weight: 600; margin: 4px 0 10px; }
    .nb-opt { display: block; width: 100%; text-align: left; padding: 10px 12px; margin: 6px 0; border-radius: 10px; border: 1px solid rgba(127,127,127,.3); background: rgba(127,127,127,.06); color: inherit; font: inherit; font-size: 14px; cursor: pointer; }
    .nb-opt.ok { background: rgba(63,185,80,.25); border-color: #3fb950; } .nb-opt.no { background: rgba(248,81,73,.25); border-color: #f85149; } .nb-opt.x { opacity: .5; }
    .nb-end { text-align: center; }`;
  document.head.appendChild(css);

  window.Newbie = { gl, plain, plainTotal, on, load };
  (function boot(n) { if (!hasDb()) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; } load(); })(0);
  if (typeof window.applyPage === "function") { const base = window.applyPage; window.applyPage = function (name) { const r = base.apply(this, arguments); if (name === "stock") setTimeout(renderCard, 0); return r; }; }
})();
