/* ⚔️ 斗羅・羈絆與日常（斗羅模式開著才有；面板新分頁「💞 相處」）
   ① 羈絆值：陌生 → 熟悉 → 信任 → 生死之交；越熟稱呼越親近
   ② 回憶冊：羈絆到了，角色跟你聊一段自己的事
   ③ 好幾天沒來：回來時他們是真的高興
   ④ 今天他們在做什麼（依時間變）
   ⑤ 特別的日子：生日、考試前一天、考試當天、考完隔天、聖誕、新年
   ⑥ 問大師（AI，看得到你的讀書紀錄）
   ⑦ 跟唐三對練：每天 5 題（複習卡，沒有就用單字）；不會動到你的複習排程
   ⑧ 小舞的挑戰：每天一個，自動判定，做到送收藏品
   ⑨ 角色說話風格統一（STYLE）
   ⑩ 場景背景：面板依章節換氛圍（在 douluo.js 加 class，這裡放樣式）
   ⑪ 一個月紀念信　⑫ 記住你的里程碑
   資料存在 douluo_bond（一人一列 jsonb）；不動經驗、金幣、星屑、魂力 */
(function () {
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const X = () => (window.Douluo && window.Douluo.ctx ? window.Douluo.ctx() : null);
  const on = () => { const c = X(); return !!(c && c.on && c.d); };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const today = () => { const c = X(); return (c && c.d && c.d.stats.today) || new Date(Date.now() - 6 * 3600e3).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }); };
  const addDay = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const dd = (a, b) => Math.round((new Date(a) - new Date(b)) / 864e5);
  const md = d => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

  /* ---------- 角色 ---------- */
  const STYLE = { /* ⑨ 說話手冊：寫新台詞時照這個 */
    tangsan: "溫和、穩，像哥哥；不說教，常說「我陪你」「一起」", master: "嚴肅、簡潔、有分量；講理論也講做法；真心但不肉麻",
    xiaowu: "活潑、撒嬌、叫你「哥」；會拉你去玩或休息", daimubai: "直接、驕傲、重視身體與實戰", zhuzhuqing: "話很少、冷，但很關心；常用「……」",
    oscar: "搞笑、愛講香腸梗、照顧人", ningrongrong: "嬌氣但溫暖、愛鼓勵", mahongjun: "吵、嘴賤、講義氣、愛吃" };
  const CH = { tangsan: ["唐三", "⚔️"], master: ["大師", "📜"], xiaowu: ["小舞", "🐰"], daimubai: ["戴沐白", "🐯"], zhuzhuqing: ["朱竹清", "🐈‍⬛"], oscar: ["奧斯卡", "🌭"], ningrongrong: ["寧榮榮", "🗼"], mahongjun: ["馬紅俊", "🔥"] };
  const BL = [[0, "陌生"], [10, "熟悉"], [30, "信任"], [60, "生死之交"]];
  const blv = n => { let i = 0; BL.forEach(([p], k) => { if (n >= p) i = k; }); return i; };
  const MEMO = {
    tangsan: ["小時候在聖魂村，我每天天沒亮就上山練功。不是因為我比別人強，是怕自己忘了為什麼開始。", "我曾經以為一切都結束了。後來才知道，結束有時候只是換個地方重新開始。你也一樣。", "我答應過自己，要守護身邊的人。現在，這個名單裡也有你。"],
    master: ["很多人笑我的武魂，說我一輩子成不了強者。所以我把一輩子都拿來研究理論。", "收唐三為徒那天，我知道我的理論終於有人能證明。現在，換你來證明。", "學生超越老師，是老師最大的驕傲。我在等那一天。"],
    xiaowu: ["我第一天進學院就當上老大喔！秘訣是，誰都不准欺負我的人。", "哥說過，不管發生什麼，他都會找到我。所以我從來不怕迷路。你也不要怕。"],
    daimubai: ["我離開家，是因為不想一輩子輸。", "真正的強，不是贏過別人，是每天都不讓自己退。"],
    zhuzhuqing: ["……我話少，但我都有在看。", "我早就決定了，命運要自己選。你也是。"],
    oscar: ["我的武魂是香腸，被笑了很久。後來大家吃過都閉嘴了。", "輔助系最重要的是：隊友倒下之前，我要先站在那裡。"],
    ningrongrong: ["我以前很嬌氣，什麼都要人讓。後來才知道，被需要比被寵更開心。", "七寶琉璃塔加持的不是力量，是信心。你缺的時候，跟我說。"],
    mahongjun: ["我的邪火以前每天燒我自己，痛到睡不著。後來是三哥幫我找到解法。", "胖子我嘴很賤，但兄弟有事，我第一個衝。"] };
  const NOW = { /* ④ [早 6-11, 午 11-17, 晚 17-23, 深夜 23-6] */
    tangsan: ["在後山練玄天功", "在打造暗器", "在營火邊等大家", "在冥想"], master: ["在整理魂獸筆記", "在研究武魂理論", "在批改大家的修煉紀錄", "早就睡了"],
    xiaowu: ["在追蝴蝶", "在跟奧斯卡搶香腸", "在營火邊說故事", "已經睡了"], daimubai: ["在晨跑", "在訓練場", "在擦護腕", "已經睡了"],
    zhuzhuqing: ["在屋頂上看日出", "在屋頂上看書", "安靜地坐在角落", "還醒著，在屋頂上"], oscar: ["在烤早餐香腸", "在烤香腸", "在發宵夜香腸", "睡到打呼"],
    ningrongrong: ["在梳頭髮", "在逛街", "在幫大家加持", "已經睡了"], mahongjun: ["還在睡", "在吃東西", "在吃宵夜", "還在吃"] };
  const ITEMS = ["🍡 小舞的糖葫蘆", "🎀 兔耳髮夾", "🧵 小舞的紅繩", "🌿 藍銀草書籤", "🍃 星斗大森林的葉子", "💧 冰火兩儀眼的泉水", "🌭 奧斯卡的香腸", "🪶 鳳凰羽毛", "🗡️ 唐門袖箭", "📜 大師的筆記一頁", "🐚 海神島的貝殼", "🔥 營火的火種"];
  const CHAL = [
    { id: "early", t: "下午 3 點前完成第一件任務", chk: s => s.firstDone && s.firstDone < "15:00" },
    { id: "focus2", t: "今天專注滿 2 小時", chk: s => s.focus >= 120 },
    { id: "water", t: "今天喝水 1500 ml", chk: s => s.water >= 1500 },
    { id: "three", t: "今天完成 3 件任務", chk: s => s.done >= 3 },
    { id: "study", t: "今天勾掉 1 項推甄進度", chk: s => s.study >= 1 },
    { id: "focus1", t: "晚上 8 點前專注滿 1 小時", chk: s => s.focus >= 60 && new Date().getHours() < 20 }];

  let B = null, saveT = null;
  const unlocked = k => { const c = X(); if (!c) return false; if (k === "tangsan" || k === "master") return true; const x = c.SEVEN.find(z => z.k === k); return !!(x && x.need(c.d.stats)); };
  const chars = () => Object.keys(CH).filter(unlocked);
  function save() { clearTimeout(saveT); saveT = setTimeout(async () => { if (!hasDb() || !B) return; const { error } = await db.from("douluo_bond").upsert({ user_id: currentUser.id, data: B, updated_at: new Date().toISOString() }, { onConflict: "user_id" }); if (error) console.warn("bond", error.message); }, 800); }
  function gain(k, n, why) {
    if (!B || !unlocked(k)) return; const before = blv(B.pts[k] || 0);
    B.pts[k] = (B.pts[k] || 0) + n; const after = blv(B.pts[k]); save();
    if (after > before) setTimeout(() => levelUp(k, after), 900);
  }
  const once = (key, f) => { if (!B) return; B.once = B.once || {}; const k = key + today(); if (B.once[k]) return; B.once[k] = 1; f(); Object.keys(B.once).forEach(x => { if (!x.endsWith(today())) delete B.once[x]; }); save(); };
  function callName(k) {
    const n = (B && B.name) || "你", l = blv((B && B.pts[k]) || 0);
    if (k === "master") return ["學生", "孩子", n, n][l];
    if (k === "xiaowu") return ["喂", "哥", "哥", "哥"][l];
    if (k === "tangsan") return ["你", "兄弟", n, n][l];
    return l >= 2 ? n : "你";
  }

  async function load() {
    if (!hasDb() || !on()) return;
    if (!B) { const { data } = await db.from("douluo_bond").select("data").maybeSingle(); B = Object.assign({ pts: {}, last: null, name: "", bday: "", items: [], ms: {}, chal: null, spar: null, memo: {}, msSaid: {}, flags: {} }, (data && data.data) || {}); }
    const t = today();
    if (B.last && B.last !== t) { const gap = dd(t, B.last); if (gap >= 2) B.flags.back = gap; }
    if (B.last !== t) { B.last = t; once("visit", () => { gain("tangsan", 1); gain("master", 1); }); }
    const c = X(), st = c.d.state;
    if ((st.master_follow || 0) > (B.mf || 0)) { gain("master", 2 * ((st.master_follow || 0) - (B.mf || 0))); B.mf = st.master_follow || 0; }
    detectMilestones(); await checkChallenge(); anniversary(); save();
  }

  /* ---------- ⑫ 里程碑 ---------- */
  function detectMilestones() {
    const c = X(), s = c.d.stats, st = c.d.state, R = c.real || {}, t = today(), add = [];
    const mark = (k, text, day) => { if (!B.ms[k]) { B.ms[k] = { d: day || t, t: text }; add.push(B.ms[k]); } };
    if (s.focus_today >= 180) mark("f180", "第一次一天專注 3 小時");
    else if (s.focus_yday >= 180) mark("f180", "第一次一天專注 3 小時", addDay(t, -1));
    if (s.focus_today >= 300) mark("f300", "第一次一天專注 5 小時");
    if (st.rings.length >= 1) mark("ring1", "吸收第一個魂環");
    if (st.rings.length >= 5) mark("ring5", "身上有 5 個魂環");
    if (s.streak >= 7) mark("s7", "連續 7 天都在修煉"); if (s.streak >= 14) mark("s14", "連續 14 天都在修煉"); if (s.streak >= 30) mark("s30", "連續 30 天都在修煉");
    if ((c.d.level || 1) >= 30) mark("lv30", "升到 30 級・魂尊"); if ((c.d.level || 1) >= 60) mark("lv60", "升到 60 級・魂帝");
    if (c.d.level > 1 && !R.late) mark("ontrack", "推甄進度第一次完全沒有落後");
    if (B.sparTotal >= 10) mark("spar10", "跟唐三對練滿 10 次");
    if (add.length) setTimeout(() => bubble("tangsan", `${add[0].t}。今天是 ${md(add[0].d)}，我記住了。`), 2500);
  }
  function milestoneLine() {
    const t = today(), list = Object.entries(B.ms || {}).filter(([k, m]) => dd(t, m.d) >= 3 && (!B.msSaid[k] || dd(t, B.msSaid[k]) >= 7));
    if (!list.length || Math.random() < .5) return "";
    const [k, m] = pick(list); B.msSaid[k] = t; save();
    return `還記得 ${md(m.d)} 嗎？那天你${m.t.replace(/^第一次/, "第一次")}。${pick(["那時候的你做得到，現在的你也可以。", "我一直記得那天。", "從那天到現在，你又往前走了好多。"])}`;
  }

  /* ---------- ⑤ 特別的日子 ＋ ③ 回來了 ---------- */
  function specialLine() {
    const t = today(), mmdd = t.slice(5), c = X(), R = (c && c.real) || {}, n = callName("tangsan");
    if (B.bday && B.bday === mmdd) return ["🎂", `生日快樂，${n}。今天大家都在等你——奧斯卡烤了一整盤香腸，小舞說今天不准你讀太晚。`];
    if (R.exam && R.exam.days === 1) return ["🔥", `明天就是魂師大賽了。今晚不要再塞新東西，把會的再過一遍，早點睡。七怪都在，我們陪你上場。`];
    if (R.exam && R.exam.days === 0) return ["⚔️", `今天上場。平常怎麼練，今天就怎麼打。不管結果怎樣，我都以你為榮。`];
    if (B.flags.examDone && B.flags.examDone === addDay(t, -1)) return ["🌙", "昨天考完了。不管考得怎麼樣，先好好休息一天。你這段時間真的很努力，我都看到了。"];
    if (mmdd === "12-25") return ["🎄", "聽說今天是你們世界的聖誕節。小舞吵著要掛襪子，你今天也對自己好一點。"];
    if (mmdd === "01-01") return ["🎆", "新年快樂。新的一年，我們繼續一起修煉。"];
    return null;
  }
  function morningHtml() {
    const c = X(); if (!c || !B) return "";
    let h = "";
    if (B.flags.back) { const g = B.flags.back; delete B.flags.back; save(); gain("tangsan", 2);
      h += `<div class="dl-say">${c.pic("tangsan", 40)}<div><small>唐三</small><p>${esc(g >= 5 ? `${g} 天了……我還以為你放棄了。不過你回來了，這比什麼都重要。我們從今天重新開始。` : `你 ${g} 天沒來了，大家都在問你去哪了。回來就好，先從一件小事開始。`)}</p></div></div>`; }
    const sp = specialLine(); if (sp) h += `<div class="dl-say dl-special">${c.pic("tangsan", 40)}<div><small>${sp[0]} 唐三</small><p>${esc(sp[1])}</p></div></div>`;
    const ml = milestoneLine(); if (ml) h += `<div class="dl-say">${c.pic("tangsan", 40)}<div><small>唐三・還記得</small><p>${esc(ml)}</p></div></div>`;
    if (B.chal && B.chal.day === today() && !B.chal.done) { const ch = CHAL.find(x => x.id === B.chal.id); if (ch) h += chalHtml(ch); }
    return h;
  }

  /* ---------- ⑧ 小舞的挑戰 ---------- */
  function chalHtml(ch) {
    const c = X(), xw = unlocked("xiaowu"), tt = ch.t.replace(/^今天/, "");
    return `<div class="dl-say dl-chal">${c.pic(xw ? "xiaowu" : "tangsan", 40, xw ? "🐰" : undefined)}<div><small>${xw ? "小舞的挑戰" : "唐三・小舞留了紙條"}</small><p>${esc(xw ? `哥！今天${tt}，做到我就送你禮物～` : `紙條上寫：「今天${tt}，做到就有禮物。」……她還沒正式加入，但好像已經很關心你了。`)}</p></div></div>`;
  }
  async function chalState() {
    const t = today(), s = { focus: 0, water: 0, done: 0, firstDone: null, study: 0 };
    const [fo, wa, tk, si] = await Promise.all([
      db.from("focus_sessions").select("duration_seconds").eq("session_date", t).limit(200),
      db.from("water_logs").select("ml").eq("log_date", t).limit(100),
      db.from("tasks").select("completed_at").eq("completed", true).gte("completed_at", new Date(new Date(t + "T06:00:00+08:00")).toISOString()).limit(200),
      db.from("study_items").select("done_at").eq("done", true).gte("done_at", new Date(new Date(t + "T06:00:00+08:00")).toISOString()).limit(200)]);
    s.focus = Math.floor((fo.data || []).reduce((a, r) => a + (r.duration_seconds || 0), 0) / 60);
    s.water = (wa.data || []).reduce((a, r) => a + (r.ml || 0), 0);
    const ts = (tk.data || []).map(r => new Date(r.completed_at).toLocaleTimeString("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit" })).sort();
    s.done = ts.length; s.firstDone = ts[0] || null; s.study = (si.data || []).length;
    return s;
  }
  async function checkChallenge() {
    const t = today(), h = new Date().getHours();
    if ((!B.chal || B.chal.day !== t) && h >= 6) { const n = Number(t.replace(/-/g, "")); B.chal = { day: t, id: CHAL[n % CHAL.length].id, done: false }; save(); }
    if (!B.chal || B.chal.day !== t || B.chal.done) return;
    const ch = CHAL.find(x => x.id === B.chal.id); if (!ch) return;
    let s; try { s = await chalState(); } catch (_) { return; }
    if (!ch.chk(s)) return;
    B.chal.done = true; const item = ITEMS[(B.items || []).length % ITEMS.length]; B.items = [...(B.items || []), { n: item, d: t, why: ch.t }];
    gain("xiaowu", 3); save();
    const xw = unlocked("xiaowu");
    bubble(xw ? "xiaowu" : "tangsan", xw ? `做到了！「${ch.t}」～這個給你：${item}` : `小舞的挑戰「${ch.t}」完成了。她托我把這個給你：${item}`, xw ? "🐰" : undefined);
  }

  /* ---------- ⑪ 一個月紀念 ---------- */
  function anniversary() {
    const c = X(), st = c.d.state, t = today(); if (!st.created_at) return;
    const start = String(st.created_at).slice(0, 10), days = dd(t, start);
    if (days < 30 || B.flags.m30) return;
    if (document.querySelector(".dl-bg, .vg-modal")) return;
    B.flags.m30 = t; save();
    const s = c.d.stats, ms = Object.values(B.ms || {}).sort((a, b) => a.d < b.d ? -1 : 1);
    c.modal(`<div class="dl-head"><b>💌 一個月了・唐三的信</b><button class="dl-x" data-dl-x>✕</button></div>
      <div class="dl-letter">${c.pic("tangsan", 56)}<div><p>${esc(callName("tangsan"))}：</p>
      <p>從 ${md(start)} 到今天，我們一起修煉一個月了。你從第 1 級走到第 ${c.d.level} 級，累積專注 ${Math.floor((s.focus_all || 0) / 60)} 小時，身上有 ${st.rings.length} 個魂環。</p>
      ${ms.length ? `<p>這個月我記住了這些日子：</p>${ms.map(m => `<p>・${md(m.d)}　${esc(m.t)}</p>`).join("")}` : "<p>這個月沒有特別轟轟烈烈的日子，但每一天你都還在。這比什麼都難。</p>"}
      <p>有幾天你一定很想放棄，我知道。可是你回來了。下個月，我們繼續。</p><p style="text-align:right">——唐三</p></div></div><div class="dl-row"><button class="btn" data-dl-x>收好</button></div>`);
  }

  /* ---------- 小工具 ---------- */
  function bubble(k, text, ic) {
    const c = X(); if (!c) return;
    document.querySelector(".dl-bubble")?.remove();
    const b = document.createElement("div"); b.className = "dl-bubble";
    b.innerHTML = `${c.pic(k, 40, ic)}<p><small style="display:block;opacity:.7;font-size:11.5px">${esc((CH[k] || ["唐三"])[0])}</small>${esc(text)}</p>`;
    document.body.appendChild(b); setTimeout(() => b.classList.add("out"), 6500); setTimeout(() => b.remove(), 7100);
    b.addEventListener("click", () => b.remove());
  }
  function levelUp(k, l) {
    const c = X(); if (!c || !on()) return;
    const memo = (MEMO[k] || [])[l - 1];
    const show = () => c.modal(`<div class="dl-head"><b>💞 和${esc(CH[k][0])}的羈絆：${BL[l][1]}</b><button class="dl-x" data-dl-x>✕</button></div>
      <div class="dl-say">${c.pic(k, 64, CH[k][1])}<div><small>${esc(CH[k][0])}</small><p>${esc(memo ? memo : "我們越來越熟了。")}</p></div></div>
      <p class="dl-meta">${memo ? "📖 這段回憶已經收進「💞 相處 → 回憶冊」。" : ""}${k === "master" && l >= 2 ? `大師開始叫你「${esc(callName("master"))}」了。` : ""}</p><div class="dl-row"><button class="btn" data-dl-x>繼續</button></div>`);
    if (document.querySelector(".dl-bg")) setTimeout(() => levelUp(k, l), 20000); else show();
  }

  /* ---------- ④ 今天在做什麼 ---------- */
  function slot() { const h = new Date().getHours(); return h >= 6 && h < 11 ? 0 : h >= 11 && h < 17 ? 1 : h >= 17 && h < 23 ? 2 : 3; }
  function nowHtml() {
    if (!on()) return ""; const sl = slot(), cs = chars();
    let focusing = false; try { focusing = !!focusTimer; } catch (_) {}
    if (sl === 3 && new Date().getHours() >= 1 && new Date().getHours() < 6) return `<div class="dl-now">🌙 大家都睡了，只有唐三${focusing ? "陪著你修煉" : "還醒著陪你"}。</div>`;
    const list = cs.slice(0, 4).map(k => `${CH[k][1]} ${CH[k][0]}${NOW[k][sl]}`);
    return `<div class="dl-now">${list.join("　")}</div>`;
  }

  /* ---------- ⑦ 跟唐三對練 ---------- */
  const SP = { qs: [], i: 0, ok: 0, picked: null };
  async function sparQuestions() {
    const out = [];
    const { data: kc } = await db.from("kb_cards").select("type, data").eq("suspended", false).in("type", ["flash", "mcq", "tf", "cloze"]).order("due").limit(40);
    (kc || []).forEach(c => { const d = c.data || {};
      if (c.type === "mcq" && d.o && d.o.length >= 2) out.push({ q: d.q, o: d.o, a: d.ans, why: d.why });
      else if (c.type === "tf") out.push({ q: d.s, o: ["⭕ 對", "❌ 錯"], a: d.t ? 0 : 1, why: d.why });
      else if (c.type === "flash") out.push({ q: d.q, reveal: d.a });
      else if (c.type === "cloze" && d.text) out.push({ q: String(d.text).replace(/\{\{.+?\}\}/g, "＿＿"), reveal: (String(d.text).match(/\{\{(.+?)\}\}/g) || []).map(x => x.slice(2, -2)).join("、") }); });
    if (out.length < 5) {
      const { data: vw } = await db.from("vocab_words").select("word, meaning").not("meaning", "is", null).order("due").limit(60);
      const ws = (vw || []).filter(w => w.meaning);
      for (let i = 0; i < ws.length && out.length < 8; i++) { const w = ws[i], wrong = ws.filter(x => x !== w).sort(() => Math.random() - .5).slice(0, 3).map(x => x.meaning);
        if (wrong.length < 3) break; const o = [w.meaning, ...wrong].sort(() => Math.random() - .5); out.push({ q: `「${w.word}」是什麼意思？`, o, a: o.indexOf(w.meaning), why: `${w.word}：${w.meaning}` }); }
    }
    return out.sort(() => Math.random() - .5).slice(0, 5);
  }
  async function sparStart() {
    const c = X(); if (!c) return;
    if (B.spar && B.spar.day === today() && B.spar.done) return toast("今天已經對練過了，明天再來");
    c.modal(`<div class="dl-head"><b>🥋 跟唐三對練</b><button class="dl-x" data-dl-x>✕</button></div><p class="dl-meta">出題中…</p>`);
    let qs = []; try { qs = await sparQuestions(); } catch (_) {}
    if (!qs.length) return c.modal(`<div class="dl-head"><b>🥋 跟唐三對練</b><button class="dl-x" data-dl-x>✕</button></div><div class="dl-say">${c.pic("tangsan", 48)}<div><small>唐三</small><p>現在還沒有題目可以考你。先在「🧠 複習」導入講義，或是在「📖 單字」加一些單字，我就能出題了。</p></div></div>`);
    Object.assign(SP, { qs, i: 0, ok: 0, picked: null }); sparDraw();
  }
  function sparDraw() {
    const c = X(), q = SP.qs[SP.i];
    if (!q) {
      const total = SP.qs.length; B.spar = { day: today(), done: true, ok: SP.ok, n: total }; B.sparTotal = (B.sparTotal || 0) + 1; gain("tangsan", 3); save();
      const line = SP.ok === total ? "全對。這招你已經學會了，下次我出難一點。" : SP.ok >= total - 1 ? "只錯一題，很穩。錯的那題，今天睡前再看一次。" : SP.ok >= total / 2 ? "一半以上。不錯，錯的不是你不會，是還不熟。" : "今天被我打得有點慘吧？沒關係，對練就是用來輸的，上了大賽才不會輸。";
      return c.modal(`<div class="dl-head"><b>🥋 對練結束・${SP.ok}/${total}</b><button class="dl-x" data-dl-x>✕</button></div><div class="dl-say">${c.pic("tangsan", 56)}<div><small>唐三</small><p>${esc(line)}</p></div></div><p class="dl-meta">💞 和唐三的羈絆 +3。對練不會改到你的複習排程。</p><div class="dl-row"><button class="btn" data-dl-x>收功</button></div>`);
    }
    const ans = SP.picked != null;
    let body = `<p class="dl-sq">${esc(q.q)}</p>`;
    if (q.o) body += `<div class="dl-sopts">${q.o.map((o, i) => `<button type="button" class="btn ${ans ? (i === q.a ? "ok" : i === SP.picked ? "no" : "") : ""}" data-sp="${i}" ${ans ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>`;
    else body += ans ? `<p class="dl-sans">答案：${esc(q.reveal)}</p><div class="dl-sopts"><button type="button" class="btn" data-spself="1" ${SP.self != null ? "disabled" : ""}>我答對了</button><button type="button" class="btn" data-spself="0" ${SP.self != null ? "disabled" : ""}>沒答出來</button></div>` : `<div class="dl-row"><button type="button" class="btn" data-sp="reveal">想好了，看答案</button></div>`;
    let say = "";
    if (ans && (q.o || SP.self != null)) { const right = q.o ? SP.picked === q.a : SP.self === 1; say = `<div class="dl-say">${c.pic("tangsan", 40)}<div><small>唐三</small><p>${esc(right ? pick(["漂亮，這招你學會了。", "對。反應很快。", "沒錯，就是這樣。"]) : pick(["差一點。", "這招我再示範一次。", "被我打中了吧。"]))}${!right && q.why ? " " + esc(q.why) : ""}</p></div></div><div class="dl-row"><button type="button" class="btn btn-primary" data-sp="next">${SP.i + 1 < SP.qs.length ? "下一招 →" : "結束"}</button></div>`; }
    c.modal(`<div class="dl-head"><b>🥋 跟唐三對練・第 ${SP.i + 1}/${SP.qs.length} 招</b><button class="dl-x" data-dl-x>✕</button></div>${body}${say}`);
  }

  /* ---------- ⑥ 問大師 ---------- */
  const ASKS = { master: { hist: [], busy: false }, tangsan: { hist: [], busy: false } };
  async function askMaster(q, who) {
    who = who === "tangsan" ? "tangsan" : "master"; const ASK = ASKS[who], nm = who === "tangsan" ? "唐三" : "大師";
    const c = X(); if (!c || ASK.busy) return; ASK.busy = true;
    const s = c.d.stats, R = c.real || {};
    const ctx = { 等級: c.d.level, 這週各科專注分鐘: s.subj7, 今天專注分鐘: s.focus_today, 昨天專注分鐘: s.focus_yday, 今天完成任務: `${s.done_today}/${s.tasks_today}`, 連續天數: s.streak,
      推甄進度落後: R.late ? `${R.late.n} 項，最早「${R.late.first}」` : "沒有", 拖很久的任務: (R.stuck || []).slice(0, 3).map(x => `${x.t}（${x.d} 天）`), 考試: R.exam ? `${R.exam.name} 剩 ${R.exam.days} 天` : "未設定" };
    ASK.hist.push({ who: "你", t: q }); ASK.hist.push({ who: nm, t: "（思考中……通常 10～40 秒）" }); rerender();
    let ans;
    try { const call = db.functions.invoke("kb", { body: { action: "master", who, q, ctx, call: callName(who), hist: ASK.hist.slice(0, -2).slice(-6) } });
      const { data, error } = await Promise.race([call, new Promise(r => setTimeout(() => r({ error: { message: "等太久了，再問一次試試" } }), 65000))]);
      ans = error ? "（現在聯絡不上：" + error.message + "）" : data && data.error ? "（" + data.error + "）" : (data && data.text) || "（他沉默了一會兒，沒有回答。）"; }
    catch (e) { ans = "（現在聯絡不上）"; }
    ASK.hist[ASK.hist.length - 1].t = ans; ASK.busy = false; once("ask" + who, () => gain(who, 1)); rerender();
  }
  function rerender() { if (document.querySelector(".dl-bg .dl-tabs") && window.Douluo) window.Douluo.open(); }

  /* ---------- 💞 相處分頁 ---------- */
  function tabHtml() {
    const c = X(); if (!c || !B) return `<p class="dl-meta">載入中…</p>`;
    const cs = chars(), t = today();
    let h = `<div class="dl-sub">💞 羈絆</div>` + cs.map(k => { const p = B.pts[k] || 0, l = blv(p), nx = BL[l + 1];
      return `<div class="dl-bond">${c.pic(k, 32, CH[k][1])}<div><b>${esc(CH[k][0])}・${BL[l][1]}</b><div class="dl-bar"><i style="width:${nx ? Math.round((p - BL[l][0]) / (nx[0] - BL[l][0]) * 100) : 100}%"></i></div><small>${p} 點${nx ? `・再 ${nx[0] - p} 點變成「${nx[1]}」` : ""}・叫你「${esc(callName(k))}」</small></div></div>`; }).join("");
    const locked = Object.keys(CH).filter(k => !cs.includes(k));
    if (locked.length) h += `<p class="dl-meta">還有 ${locked.length} 位夥伴沒加入，在「🐰 七怪」看解鎖條件。</p>`;
    /* 對練 + 挑戰 */
    const sp = B.spar && B.spar.day === t ? B.spar : null;
    h += `<div class="dl-sub">🥋 今天的對練</div><div class="dl-row"><button type="button" class="btn ${sp && sp.done ? "" : "btn-primary"}" data-bd="spar" ${sp && sp.done ? "disabled" : ""}>${sp && sp.done ? `今天對練完了・${sp.ok}/${sp.n}` : "跟唐三對練 5 招"}</button></div>`;
    const ch = B.chal && B.chal.day === t ? CHAL.find(x => x.id === B.chal.id) : null;
    if (ch) h += `<div class="dl-sub">🎯 今天的挑戰</div><p class="dl-meta">${B.chal.done ? "✅" : "⏳"} ${esc(ch.t)}${B.chal.done ? "・完成了！" : "・做到會自動判定"}</p>`;
    /* 問大師 */
    const box = (who, title, ph) => { const A = ASKS[who]; return `<div class="dl-sub">${title}</div><div class="dl-askbox">${A.hist.slice(-6).map(x => `<p class="${x.who === "你" ? "me" : ""}"><b>${esc(x.who)}</b>${esc(x.t)}</p>`).join("")}
      <div class="dl-row"><input type="text" class="dl-askq" data-who="${who}" maxlength="300" placeholder="${ph}"><button type="button" class="btn" data-bd="ask" data-who="${who}" ${A.busy ? "disabled" : ""}>${who === "tangsan" ? "說" : "問"}</button></div></div>`; };
    h += box("tangsan", "💬 跟唐三聊天", "例如：今天好累，不太想讀");
    h += box("master", "📜 問大師", "例如：浮點數一直搞不懂怎麼辦？");
    /* 回憶冊 */
    const mem = []; cs.forEach(k => { const l = blv(B.pts[k] || 0); (MEMO[k] || []).slice(0, l).forEach((m, i) => mem.push([k, i, m])); });
    h += `<div class="dl-sub">📖 回憶冊（${mem.length}）</div>${mem.length ? mem.map(([k, i, m]) => `<details class="dl-memo"><summary>${CH[k][1]} ${esc(CH[k][0])}・${BL[i + 1][1]}</summary><p>${esc(m)}</p></details>`).join("") : `<p class="dl-meta">羈絆變成「熟悉」時，他們會開始跟你說自己的事。</p>`}`;
    /* 收藏 + 里程碑 */
    h += `<div class="dl-sub">🎁 收到的東西（${(B.items || []).length}）</div><p class="dl-meta">${(B.items || []).length ? B.items.map(x => `<span title="${esc(md(x.d) + " " + x.why)}">${esc(x.n)}</span>`).join("　") : "完成小舞的挑戰就會收到。"}</p>`;
    const ms = Object.values(B.ms || {}).sort((a, b) => a.d < b.d ? -1 : 1);
    h += `<div class="dl-sub">🏅 他記得的日子</div>${ms.length ? ms.map(m => `<p class="dl-meta">${md(m.d)}　${esc(m.t)}</p>`).join("") : `<p class="dl-meta">第一次專注 3 小時、第一個魂環……這些日子唐三都會記下來。</p>`}`;
    /* 設定 */
    h += `<details class="dl-memo"><summary>⚙️ 稱呼與生日</summary><div class="dl-row"><input type="text" id="dl-name" maxlength="10" placeholder="熟了以後他們怎麼叫你" value="${esc(B.name || "")}"><input type="text" id="dl-bday" maxlength="5" placeholder="生日 MM-DD" value="${esc(B.bday || "")}"><button type="button" class="btn" data-bd="set">存</button></div></details>`;
    return h;
  }

  /* ---------- 事件 ---------- */
  document.addEventListener("click", e => {
    if (!on() || !B) return;
    const b = e.target.closest("[data-bd]");
    if (b) { const a = b.dataset.bd;
      if (a === "spar") return sparStart();
      if (a === "ask") { const w = b.dataset.who, i = document.querySelector(`.dl-askq[data-who="${w}"]`), q = i && i.value.trim(); if (!q) return toast("先寫你想說的"); return askMaster(q, w); }
      if (a === "set") { const n = (document.getElementById("dl-name") || {}).value || "", bd = (document.getElementById("dl-bday") || {}).value || "";
        if (bd && !/^\d{2}-\d{2}$/.test(bd)) return toast("生日請寫成 MM-DD，例如 03-15"); B.name = n.trim(); B.bday = bd; save(); toast("記住了"); return rerender(); } }
    const s = e.target.closest("[data-sp]");
    if (s) { if (s.dataset.sp === "next") { SP.i++; SP.picked = null; SP.self = null; return sparDraw(); }
      if (s.dataset.sp === "reveal") { SP.picked = -1; SP.self = null; return sparDraw(); }
      SP.picked = Number(s.dataset.sp); if (SP.picked === SP.qs[SP.i].a) SP.ok++; return sparDraw(); }
    const sf = e.target.closest("[data-spself]"); if (sf) { SP.self = Number(sf.dataset.spself); if (SP.self === 1) SP.ok++; return sparDraw(); }
    if (e.target.closest("[data-dlq]")) once("reply", () => gain("tangsan", 1));
  });
  document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target && e.target.classList && e.target.classList.contains("dl-askq")) { const q = e.target.value.trim(); if (q) askMaster(q, e.target.dataset.who); } });
  /* 營火：在場的人羈絆 +1（一天一次）；七怪來訪：那個人 +1 */
  function wrapLife() {
    const L = window.DouluoLife; if (!L || L.__bond) { if (!L) setTimeout(wrapLife, 1000); return; }
    const cf = L.campfireHtml; L.campfireHtml = function () { const h = cf.apply(this, arguments); if (h && B) once("fire", () => chars().forEach(k => gain(k, 1))); return h; };
    L.__bond = true;
  }
  wrapLife();
  /* 考完隔天：記下考試日 */
  function markExam() { const c = X(); if (c && c.real && c.real.exam && c.real.exam.days === 0 && B) { B.flags.examDone = today(); save(); } }
  document.addEventListener("douluo:change", () => setTimeout(async () => { if (!on()) return; await load(); markExam(); }, 600));
  setInterval(() => { if (on() && B) checkChallenge(); }, 5 * 60 * 1000);

  /* ---------- 樣式（含 ⑩ 場景背景） ---------- */
  const SC = ["#6b4a2b,#2a1d12", "#2f6b3a,#14301b", "#1f4d2b,#0b1f10", "#2c5f9e,#8a2c1f", "#8a6a1c,#2d2208", "#6b1420,#1a0508", "#2d2b6b,#0f0e2a", "#0f4c75,#06202f", "#5a2a2a,#1f1f1f", "#6a3f9e,#8a6a1c", "#b8892b,#3a2a08"];
  const IC = ["🏘️", "🏫", "🌳", "❄️🔥", "🏟️", "🩸", "🏯", "🔱", "⚔️", "✨", "👑"];
  const st = document.createElement("style");
  st.textContent = `
    body:has(.dl-bg) .ft, body:has(.dl-bg) .ft-mini { display: none !important; }
    .dl-now { font-size: 12px; opacity: .8; padding: 6px 12px 0; line-height: 1.6; }
    .dl-bond { display: flex; gap: 10px; align-items: center; padding: 6px 0; } .dl-bond > div { flex: 1; } .dl-bond b { font-size: 13.5px; } .dl-bond small { display: block; font-size: 11.5px; opacity: .7; }
    .dl-memo { margin: 6px 0; padding: 6px 10px; border-radius: 10px; background: rgba(127,127,127,.08); } .dl-memo summary { cursor: pointer; font-size: 13px; } .dl-memo p { margin: 6px 0 2px; font-size: 13.5px; line-height: 1.7; }
    .dl-askbox p { margin: 4px 0; font-size: 13.5px; line-height: 1.65; } .dl-askbox p b { margin-right: 6px; opacity: .7; font-size: 12px; } .dl-askbox p.me { opacity: .8; }
    .dl-askbox input, .dl-memo input { flex: 1; min-width: 0; padding: 7px 9px; border-radius: 8px; border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; font: inherit; }
    .dl-sq { font-size: 15px; line-height: 1.6; margin: 6px 0 10px; } .dl-sans { font-size: 14px; color: #3fb950; }
    .dl-sopts { display: grid; gap: 6px; } .dl-sopts .btn { text-align: left; white-space: normal; } .dl-sopts .btn.ok { border-color: #3fb950; background: rgba(63,185,80,.18); } .dl-sopts .btn.no { border-color: #f85149; background: rgba(248,81,73,.15); }
    .dl-special { border: 1px solid rgba(241,196,15,.4); border-radius: 12px; padding: 6px; } .dl-chal { border: 1px dashed rgba(255,150,200,.5); border-radius: 12px; padding: 6px; }
    .dl-box.dl-scene { position: relative; }
    .dl-box.dl-scene::after { position: absolute; right: 14px; top: 46px; font-size: 54px; opacity: .08; pointer-events: none; }
    ${SC.map((g, i) => `.dl-box.dl-sc${i} { background: linear-gradient(160deg, ${g.split(",")[0]}55, ${g.split(",")[1]}33 60%, rgba(0,0,0,0)), linear-gradient(180deg, #1b2140, #151a30); background-color: #151a30; } .dl-box.dl-sc${i}::after { content: "${IC[i]}"; }`).join("\n    ")}`;
  document.head.appendChild(st);
  window.DouluoBond = { load, tabHtml, nowHtml, morningHtml, callName, STYLE, gain: (k, n) => gain(k, n) };
})();
