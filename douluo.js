/* ⚔️ 斗羅模式：唐三陪你修煉、大師每天指導
   魂力全部來自你真實完成的事（資料在 sql/2026-11-27_斗羅模式.sql）
   開關：🧩 功能列表最上面「⚔️ 斗羅模式」，預設關閉；關掉時魂力照樣在背景累積
   圖片：img/douluo/tangsan.jpg（唐三）、tangsan_god.jpg（71 級海神島以後的唐三）、img/douluo/master.jpg（大師）、img/douluo/<七怪代號>.jpg，沒有就用圖示 */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const LS = k => "douluo:" + (hasDb() ? currentUser.id.slice(0, 8) : "x") + ":" + k;
  const lsGet = k => { try { return localStorage.getItem(LS(k)); } catch (_) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(LS(k), v); } catch (_) {} };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const D = { on: false, d: null, err: null, tab: "train", open: false };
  try { D.on = localStorage.getItem("douluoOn") === "1"; } catch (_) {}

  /* ===== 設定資料 ===== */
  const TITLES = [[1, "魂士"], [11, "魂師"], [21, "大魂師"], [31, "魂尊"], [41, "魂宗"], [51, "魂王"], [61, "魂帝"], [71, "魂聖"], [81, "魂鬥羅"], [91, "封號鬥羅"], [95, "超級鬥羅"], [99, "絕世鬥羅"], [100, "神"]];
  const title = lv => { let t = TITLES[0][1]; for (const [l, n] of TITLES) if (lv >= l) t = n; return t; };
  /* 升級曲線：0.7 ×（2L²+40L）→ 平均每天專注 3～4 小時約 45 天到 90 級（要和 SQL douluo_level 一致） */
  const CURVE = 0.7, xpAt = L => Math.ceil(CURVE * (2 * (L - 1) * (L - 1) + 40 * (L - 1)));
  /* 📅 到 90 級的預估：每天記一次總魂力，用最近 7 天的增加量算速度；資料不到 3 天就先用這週專注分鐘估 */
  function eta(d) {
    const xp = d.state.xp_blue + d.state.xp_hao, today = d.stats.today, goal = xpAt(90);
    let snaps = {}; try { snaps = JSON.parse(lsGet("xpsnap") || "{}") || {}; } catch (_) {}
    snaps[today] = xp; const keys = Object.keys(snaps).sort().slice(-15); const keep = {}; keys.forEach(k => { keep[k] = snaps[k]; }); lsSet("xpsnap", JSON.stringify(keep));
    const back = keys.filter(k => k <= today).slice(-8), first = back[0], days = first ? Math.round((new Date(today) - new Date(first)) / 864e5) : 0;
    let rate, how;
    if (days >= 3) { rate = (xp - keep[first]) / days; how = `最近 ${days} 天平均`; }
    else { rate = Object.values(d.stats.subj7 || {}).reduce((a, b) => a + b, 0) / 7; how = "這週專注估算（還沒算任務，實際會更快）"; }
    const start = String(d.state.created_at || today).slice(0, 10), target = new Date(new Date(start).getTime() + 45 * 864e5).toISOString().slice(0, 10);
    const md = x => `${Number(x.slice(5, 7))}/${Number(x.slice(8, 10))}`;
    if (xp >= goal) return `<p class="dl-meta">📅 魂力已經夠 90 級了（目標 ${md(target)}）。</p>`;
    if (rate < 1) return `<p class="dl-meta">📅 目標 ${md(target)} 到 90 級。這週還沒有足夠的紀錄可以預估。</p>`;
    const left = Math.ceil((goal - xp) / rate), at = new Date(new Date(today).getTime() + left * 864e5).toISOString().slice(0, 10);
    const need = Math.ceil((goal - xp) / Math.max(1, Math.round((new Date(target) - new Date(today)) / 864e5)));
    return `<div class="dl-ev ${at <= target ? "ok" : ""}"><b>📅 照現在的速度，預計 ${md(at)} 到 90 級</b><small>目標 ${md(target)}・${how}每天約 ${Math.round(rate)} 魂力${at > target ? `・要準時，每天需要約 ${need} 魂力（專注 1 分鐘 = 1）` : "・跟得上 👍"}</small></div>`;
  }
  const CH = [
    { lv: 1, n: "聖魂村・武魂覺醒", t: "一切從最普通的日子開始。我六歲那年覺醒武魂，什麼都還不會，但從那天起每天都練。你也一樣，今天就是你的覺醒日。" },
    { lv: 11, n: "史萊克學院", t: "第一個魂環到手了。接下來的路不能只靠一個人，史萊克教會我的是：怪物也需要夥伴，也需要被逼著成長。" },
    { lv: 21, n: "星斗大森林", t: "大魂師了。森林裡危險和機緣一起出現，這段時間你會遇到瓶頸，別怕，硬仗就是長魂環的時候。" },
    { lv: 31, n: "冰火兩儀眼", t: "魂尊。我在冰火兩儀眼找到仙草，但真正的收穫是知道什麼東西適合誰。你也該開始看清楚，哪種努力最適合你。" },
    { lv: 41, n: "全大陸魂師大賽", t: "魂宗，可以上大舞台了。大賽教我的不是贏，是怎麼在壓力下照樣把每一步做對。考試、推甄，就是你的大賽。" },
    { lv: 51, n: "殺戮之都", t: "魂王。殺戮之都裡沒有魂技可以依靠，只能靠意志一天一天撐過去。這一段最難熬，但領域就是這樣練出來的。" },
    { lv: 61, n: "唐門建立", t: "魂帝。我開始建立唐門，從一個人修煉變成帶著一群人往前。你的習慣也該成為系統了，不靠心情，靠制度。" },
    { lv: 71, n: "海神島・海神九考", t: "魂聖。海神九考每一考都比上一考難，但每過一考，人就不一樣了。你的大目標，也是一考一考過的。" },
    { lv: 81, n: "大陸戰爭", t: "魂鬥羅。這時候已經不是為自己一個人在努力了，你身邊的人也在看著你。穩住，別在最後被打亂。" },
    { lv: 91, n: "封號鬥羅・雙神之戰", t: "封號鬥羅。走到這裡的人很少，最後一段路靠的不是天分，是你每天沒有斷掉的那些小事。" },
    { lv: 100, n: "成神", t: "百級，成神。我們一路走過來了。神位不是終點，是你終於成為了自己想成為的那個人。" }
  ];
  /* 每章一個小事件（條件在 sql/2026-11-27_斗羅章節事件.sql 的 douluo_events，只算這章事件開始之後的紀錄；完成送仙草 1 株） */
  const EV = [
    { n: "覺醒儀式", d: "某一天專注滿 60 分鐘", u: "分鐘", ok: "素雲濤的手按在你頭上，光亮起來了。你的武魂，醒了。" },
    { n: "史萊克入學考核", d: "連續 3 天，每天至少完成 1 件任務", u: "天", ok: "弗蘭德院長點點頭：「怪物，收了。」" },
    { n: "走出星斗大森林", d: "連續 3 天，每天專注滿 2 小時", u: "天", ok: "森林的霧散了。你沒有迷路，因為每天都往同一個方向走。" },
    { n: "冰火兩儀眼採仙草", d: "累積 3 天專注滿 3 小時", u: "天", ok: "冰與火之間，你找到了適合自己的那株仙草。" },
    { n: "魂師大賽晉級賽", d: "完成 5 件困難以上的任務", u: "件", ok: "晉級了。觀眾席很吵，但你只聽得到自己的心跳。" },
    { n: "殺戮之都・地獄路", d: "連續 7 天，每天專注滿 1 小時", u: "天", ok: "地獄路的盡頭沒有掌聲，只有你自己。殺神領域，成了。" },
    { n: "唐門五堂", d: "連續 5 天，每天完成 3 件以上任務", u: "天", ok: "力、敏、禦、藥、機關，五堂都立起來了。從今天起，你靠的是制度。" },
    { n: "海神九考・第一考", d: "連續 9 天，每天專注滿 90 分鐘", u: "天", ok: "海神之光落在你身上。九考的第一考，過了。" },
    { n: "大陸戰爭・守城", d: "累積專注 30 小時", u: "分鐘", ok: "城守住了。身後的人都看見了你沒有退。" },
    { n: "雙神之戰", d: "連續 10 天，每天專注滿 2 小時", u: "天", ok: "三叉戟落下。這一戰，你贏的是過去那個會放棄的自己。" },
    { n: "神位傳承", d: "累積專注 100 小時", u: "分鐘", ok: "百級，成神。這一路上的每一天，都算數。" }
  ];
  const chapterOf = lv => { let i = 0; CH.forEach((c, j) => { if (lv >= c.lv) i = j; }); return i; };
  const TIER = [null, { n: "百年", c: "#f1c40f", d: "7 天內專注 300 分鐘" }, { n: "千年", c: "#9b59b6", d: "7 天內專注 600 分鐘＋2 個困難以上任務" }, { n: "萬年", c: "#2b2b2b", d: "10 天內專注 900 分鐘＋4 個困難任務＋5 天生活打卡" }, { n: "十萬年", c: "#e74c3c", d: "14 天內專注 1500 分鐘＋6 個困難任務＋7 天生活打卡" }];
  const SKILL = {
    blue: ["纏繞", "寄生", "蛛網束縛", "藍銀囚籠", "藍銀霸王槍", "藍銀突刺陣", "藍銀真身", "藍銀邪魔鏡", "藍銀青龍纏"],
    hao: ["亂披風錘法", "昊天九絕・一", "大須彌錘", "昊天九絕・三", "破天錘", "昊天九絕・五", "昊天真身", "昊天九絕・七", "昊天九絕・九"]
  };
  const SEVEN = [
    { k: "xiaowu", n: "小舞", ic: "🐰", need: s => s.streak >= 14, d: "連續 14 天都有完成事情", buf: "連續紀錄的力量" },
    { k: "daimubai", n: "戴沐白", ic: "🐯", need: s => (s.life_all.health || 0) >= 30, d: "運動打卡 30 次", buf: "身體是一切的本錢" },
    { k: "zhuzhuqing", n: "朱竹清", ic: "🐈‍⬛", need: s => (s.life_all.sleep || 0) >= 30, d: "睡眠打卡 30 次", buf: "安靜、穩定的作息" },
    { k: "oscar", n: "奧斯卡", ic: "🌭", need: s => (s.life_all.food || 0) >= 30, d: "飲食打卡 30 次", buf: "吃好才有力氣" },
    { k: "ningrongrong", n: "寧榮榮", ic: "🗼", need: s => s.notes_all >= 20, d: "寫 20 篇「學到什麼」", buf: "把學到的變成自己的" },
    { k: "mahongjun", n: "馬紅俊", ic: "🔥", need: s => s.hard_all >= 30, d: "完成 30 個困難以上任務", buf: "敢挑難的事" },
    { k: "tangsan", n: "唐三（滿魂力）", ic: "⚔️", need: s => s.focus_all >= 6000, d: "累積專注 100 小時", buf: "日積月累的魂力" }
  ];
  const MLV = [[0, "旁聽生"], [5, "記名弟子"], [15, "入室弟子"], [40, "親傳弟子"]];
  const mlv = n => { let t = MLV[0][1]; for (const [l, s] of MLV) if (n >= l) t = s; return t; };
  const LIFE_N = { sleep: "睡眠", care: "保養", health: "運動", food: "飲食", life: "生活", weekly: "每週" };
  const LIFE_TASK = { sleep: "今晚 12 點前上床", care: "做完今天的保養", health: "運動 20 分鐘", food: "好好吃一頓有菜有肉的正餐", life: "整理一下房間或桌面", weekly: "完成這週的每週打卡" };

  /* ===== 圖片 ===== */
  const PIC = { tangsan: "⚔️", master: "📜" };
  const pic = (k, size, emo) => {
    const god = k === "tangsan" && D.d && D.d.level >= 71, fb = `this.outerHTML='<span class=&quot;dl-emo&quot; style=&quot;width:${size}px;height:${size}px;font-size:${Math.round(size * 0.55)}px&quot;>${emo || PIC[k] || "✨"}</span>'`;
    return `<img class="dl-pic" src="img/douluo/${god ? "tangsan_god" : k}.jpg" alt="" style="width:${size}px;height:${size}px" onerror="${god ? `if(!this.dataset.f){this.dataset.f=1;this.src='img/douluo/tangsan.jpg'}else{${fb}}` : fb}">`;
  };

  /* ===== 資料 ===== */
  async function load(quiet) {
    if (!hasDb()) return;
    const { data, error } = await db.rpc("douluo_status");
    D.err = error ? error.message : null;
    if (!error) {
      D.d = data;
      try { document.dispatchEvent(new Event("douluo:change")); } catch (_) {}
      try { const ev = await db.rpc("douluo_events"); if (!ev.error) D.ev = ev.data || []; } catch (_) {}
      (D.ev || []).forEach(e => { if (e.new && lsGet("ev" + e.ch) !== "1") { lsSet("ev" + e.ch, "1"); D.evNew = e; } });
      if (data.state && data.state.hunt) { const r = await db.rpc("douluo_hunt_check"); if (!r.error && r.data) { if (r.data.status === "done") { celebrate(r.data); return load(true); } if (r.data.status === "failed") toast("獵魂挑戰時間到了，這次沒有成功。休息一下，再挑一次。"); } }
    }
    if (D.on) { renderFloat(); if (D.open) renderPanel();
      if (D.evNew) { const e = D.evNew; D.evNew = null; evDone(e); D.after = daily; return; }
      if (!quiet) daily(); }
  }

  /* ===== 唐三的話 ===== */
  function tangLine(kind) {
    const d = D.d, s = d.stats, lv = d.level, st = d.state, cap = (st.rings.length + 1) * 10, raw = d.raw_level;
    const fy = s.focus_yday, ft = s.focus_today, dy = s.done_yday, ty = s.tasks_yday, nxt = xpAt(lv + 1) - (st.xp_blue + st.xp_hao);
    const L = [];
    if (kind === "morning") {
      if (fy >= 180) L.push(`昨天專注了 ${fy} 分鐘，魂力漲得很明顯。今天不用急著超越，維持住就是本事。`, `${fy} 分鐘……昨天的你，在星斗大森林也能撐很久。今天呢，要修煉什麼？`);
      else if (fy >= 60) L.push(`昨天專注 ${fy} 分鐘，穩穩的。今天想先從哪一件開始？`, `昨天的 ${fy} 分鐘都算數，一點一點累積，就是魂環。`);
      else if (dy > 0) L.push(`昨天完成了 ${dy} 件事。沒有很多，但有做就有魂力。今天要修煉什麼？`);
      else L.push("昨天好像什麼都沒練到。沒關係，我也有過那種日子。今天先做一件小事就好。", "新的一天，魂力從零開始也可以。先選一件最容易的事開始吧。");
      if (ty && dy === ty) L.push(`昨天排的 ${ty} 件事全部做完了。這種感覺，跟吸收魂環的時候很像。`);
      if (s.streak >= 7) L.push(`已經連續 ${s.streak} 天了。小舞說，堅持本身就是一種武魂。`);
      if (raw >= cap && !st.hunt) L.push(`你的魂力已經到 ${cap} 級的瓶頸了。去大師那裡選一個獵魂挑戰吧，我陪你。`);
      if (st.hunt) L.push("我們還在獵魂中，今天也往目標再靠近一點。");
      L.push(raw > lv ? `魂力已經存到 ${raw} 級的量了，等吸收魂環就會升上去。` : `離下一級還差 ${Math.max(0, nxt)} 點魂力。`);
      return pick(L.slice(0, -1)) + " " + L[L.length - 1];
    }
    if (kind === "evening") {
      if (s.tasks_today && s.done_today === s.tasks_today) L.push(`今天 ${s.tasks_today} 件事都做完了。${ft ? `專注 ${ft} 分鐘，` : ""}藍銀草又長了一截。早點休息，魂力是睡覺時沉澱的。`);
      else if (s.done_today > 0) L.push(`今天完成 ${s.done_today}／${s.tasks_today || s.done_today} 件。剩下的不用勉強，明天先處理它就好。`, `做了 ${s.done_today} 件，已經比什麼都沒做的自己強。`);
      else L.push("今天沒練到也沒關係。我們想想明天第一件事要做什麼，然後去睡覺。", "有時候一天就這樣過了。明天早上，我們重新來。");
      if (ft >= 120) L.push(`今天專注 ${ft} 分鐘，昊天錘越來越重了。`);
      if (new Date().getHours() >= 0 && new Date().getHours() < 3) L.push("很晚了。修煉最怕的就是透支，先去睡。");
      return pick(L);
    }
    const busy = (() => { try { return !!window.__studyFocus || (typeof focusTimer !== "undefined" && !!focusTimer); } catch (_) { return false; } })();
    if (busy) return pick(["（安靜地在旁邊冥想，陪你一起修煉）", "專心，我在。", "魂力在流動，繼續。"]);
    const h = new Date().getHours();
    if (h >= 23 || h < 3) return pick(["很晚了，修煉最怕透支。", "大師說過，魂力是穩定累積的，不是一晚爆出來的。去睡吧。"]);
    if (raw >= cap && !st.hunt) return `到瓶頸了，${cap} 級。點我，去選魂環。`;
    return pick([`今天專注 ${ft} 分鐘了。`, `第 ${lv} 級，${title(lv)}。`, "要不要一起練一下？", `連續 ${s.streak} 天。`, "唐門的功夫，靠的是每天都練。"]);
  }

  /* ===== 大師的指導 ===== */
  function masterAdvice() {
    const s = D.d.stats, st = D.d.state, out = { say: [], todo: [] };
    const subs = [...new Set([...Object.keys(s.subjp7), ...Object.keys(s.subj_last)])];
    const weak = subs.map(k => ({ k, m: s.subj7[k] || 0, p: s.subjp7[k] || 0, last: s.subj_last[k] })).sort((a, b) => a.m - b.m)[0];
    const strong = Object.entries(s.subj7).sort((a, b) => b[1] - a[1])[0];
    if (strong && weak && weak.k !== strong[0] && strong[1] > 120 && weak.m < strong[1] / 3) out.say.push(`這週${strong[0]} ${strong[1]} 分鐘、${weak.k}只有 ${weak.m} 分鐘。你的武魂在偏食。`);
    if (weak) out.todo.push({ t: `${weak.k}專注 45 分鐘`, d: "normal", c: "study", why: weak.last ? `${weak.k}最近一次是 ${weak.last}` : `${weak.k}這週還沒碰` });
    const drop = Object.entries(s.subjp7).filter(([k, p]) => p > 120 && (s.subj7[k] || 0) < p * 0.5)[0];
    if (drop) out.say.push(`${drop[0]}比上週少了一半以上。退步比停滯更危險。`);
    const lw = s.life_has.filter(k => k !== "weekly").map(k => [k, s.life7[k] || 0]).sort((a, b) => a[1] - b[1])[0];
    if (lw && lw[1] < 4) { out.say.push(`生活打卡裡，${LIFE_N[lw[0]]}這週只有 ${lw[1]} 次。身體顧不好，魂力存不住。`); out.todo.push({ t: LIFE_TASK[lw[0]] || "完成一項生活打卡", d: "easy", c: "other", why: `${LIFE_N[lw[0]]}最弱` }); }
    if (st.hunt) { const p = D.d.hunt_prog, tg = st.hunt.target; if (p.hard < tg.hard) out.todo.push({ t: "完成一件困難的事（獵魂用）", d: "hard", c: "important", why: `獵魂還差 ${tg.hard - p.hard} 個困難任務` }); const left = tg.focus - p.focus; if (left > 0) out.say.push(`獵魂還差 ${left} 分鐘專注，剩 ${Math.max(0, Math.ceil((new Date(st.hunt.until) - Date.now()) / 864e5))} 天。`); }
    else if (D.d.raw_level >= (st.rings.length + 1) * 10) out.say.push(advHunt());
    if (s.done_yday === 0 && s.tasks_yday > 0) out.say.push(`昨天排了 ${s.tasks_yday} 件，一件都沒完成。不是你不行，是排太多。今天少排一點。`);
    else if (s.tasks_yday && s.done_yday / s.tasks_yday >= 0.8) out.say.push(`昨天完成率 ${Math.round(s.done_yday / s.tasks_yday * 100)}%，很好。理論再好，也要這樣一天天練出來。`);
    if (!out.say.length) out.say.push(pick(["沒有明顯的弱點，今天照計畫走就好。", "穩定，就是最好的天賦。", "魂力的累積沒有捷徑，今天也一樣。"]));
    out.todo = out.todo.slice(0, 3);
    return out;
  }
  function advHunt() {
    const s = D.d.stats, f7 = Object.values(s.subj7).reduce((a, b) => a + b, 0);
    if (f7 >= 1200) return `你這週專注了 ${f7} 分鐘，狀態很好，可以挑戰萬年魂環。`;
    if (f7 >= 600) return `這週 ${f7} 分鐘，選千年魂環最穩。硬上萬年，小心爆體。`;
    return `最近狀態普通（這週 ${f7} 分鐘），先吸收百年魂環打穩基礎。`;
  }
  function eveningMaster() {
    const s = D.d.stats, a = masterAdvice();
    const first = a.todo[0];
    return (s.done_today ? `今天完成 ${s.done_today} 件。` : "今天沒有完成任務。") + (first ? `明天第一件事：${first.t}。` : "明天照計畫。") + " " + pick(["早點睡，明天才有魂力。", "記住，穩定比爆發重要。", "今天的不足，明天補上就好。"]);
  }
  async function addTodo(td) {
    if (!hasDb()) return;
    const rw = typeof getTaskReward === "function" ? getTaskReward(td.d) : { exp: 20, gold: 15 };
    const { error } = await db.from("tasks").insert({ user_id: currentUser.id, title: td.t, category: td.c, difficulty: td.d, exp_reward: rw.exp, gold_reward: rw.gold, task_date: D.d.stats.today, completed: false });
    if (error) { toast("加任務失敗：" + error.message); return; }
    const r = await db.rpc("douluo_follow"); if (!r.error && D.d) D.d.state.master_follow = r.data;
    toast("📜 已加到今天的任務：" + td.t);
    if (typeof loadTasks === "function") loadTasks();
  }

  /* ===== 每天的對話 ===== */
  function daily() {
    if (document.querySelector(".dl-bg")) { D.after = daily; return; }
    if (!D.d) return;
    const today = D.d.stats.today, h = new Date().getHours(), lv = D.d.level, ch = chapterOf(lv);
    if (ch > (D.d.state.seen_chapter || 0) || (D.d.state.seen_chapter === 0 && !lsGet("ch0"))) { lsSet("ch0", "1"); chapterIntro(ch); D.after = daily; return; }
    if (h >= 20 || h < 2) { if (lsGet("eve") !== today) { lsSet("eve", today); return talk("evening"); } }
    else if (lsGet("morn") !== today) { lsSet("morn", today); return talk("morning"); }
  }
  function modal(html) {
    close(); const bg = document.createElement("div"); bg.className = "dl-bg"; bg.innerHTML = `<div class="dl-box">${html}</div>`;
    bg.addEventListener("click", e => { if (e.target === bg || e.target.closest("[data-dl-x]")) close(); });
    document.body.appendChild(bg); return bg;
  }
  function close() { const had = document.querySelector(".dl-bg"); document.querySelectorAll(".dl-bg").forEach(x => x.remove()); D.open = false; if (had && D.after) { const f = D.after; D.after = null; setTimeout(f, 300); } }
  function talk(kind) {
    const a = masterAdvice(), m = kind === "morning";
    const bg = modal(`<div class="dl-head"><b>${m ? "☀️ 早安，今天要修煉什麼？" : "🌙 今天辛苦了"}</b><button class="dl-x" data-dl-x>✕</button></div>
      <div class="dl-say">${pic("tangsan", 64)}<div><small>唐三</small><p>${esc(tangLine(kind))}</p></div></div>
      <div class="dl-say m">${pic("master", 52)}<div><small>大師・今日指導</small><p>${esc(m ? a.say.slice(0, 2).join(" ") : eveningMaster())}</p></div></div>
      ${m && a.todo.length ? `<div class="dl-sub">大師建議今天先做</div>${a.todo.map((t, i) => `<div class="dl-todo"><div><b>${esc(t.t)}</b><small>${esc(t.why)}</small></div><button class="btn" data-td="${i}">＋ 加入</button></div>`).join("")}` : ""}
      <div class="dl-row">${m && window.DayPlan ? `<button class="btn" data-plan>📝 排今天的任務</button>` : ""}<button class="btn ghost" data-dl-x>${m ? "開始修煉" : "晚安"}</button></div>`);
    bg.addEventListener("click", e => { const b = e.target.closest("[data-td]"); if (b) { addTodo(a.todo[Number(b.dataset.td)]); b.disabled = true; b.textContent = "已加入"; } if (e.target.closest("[data-plan]")) { close(); window.DayPlan.open(); } });
  }
  function chapterIntro(i) {
    const c = CH[i];
    const bg = modal(`<div class="dl-head"><b>📖 第 ${i + 1} 章・${esc(c.n)}</b><button class="dl-x" data-dl-x>✕</button></div>
      <div class="dl-hero">${pic("tangsan", 120)}</div><div class="dl-say"><div><small>唐三</small><p>${esc(c.t)}</p></div></div>
      <p class="dl-meta">你現在是第 ${D.d.level} 級 ${title(D.d.level)}。</p><div class="dl-row"><button class="btn" data-dl-x>繼續修煉</button></div>`);
    if (hasDb()) db.rpc("douluo_seen", { p_ch: i }).then(() => { if (D.d) D.d.state.seen_chapter = i; });
  }
  function evDone(e) {
    const m = EV[e.ch];
    modal(`<div class="dl-head"><b>✅ 章節事件完成・${esc(m.n)}</b><button class="dl-x" data-dl-x>✕</button></div>
      <div class="dl-say">${pic("tangsan", 64)}<div><small>唐三</small><p>${esc(m.ok)}</p></div></div>
      <p class="dl-meta">${esc(m.d)}，你做到了。獲得 🌿 仙草 1 株（獵魂時可以用）。</p><div class="dl-row"><button class="btn" data-dl-x>繼續修煉</button></div>`);
  }
  function celebrate(r) {
    const T = TIER[r.tier], sk = SKILL[r.line][(D.d ? D.d.state.rings.filter(x => x.line === r.line).length : 0)] || "新魂技";
    modal(`<div class="dl-head"><b>✨ 魂環吸收成功</b><button class="dl-x" data-dl-x>✕</button></div><div class="dl-ring-big" style="--c:${T.c}"></div>
      <p style="text-align:center">第 ${r.n} 魂環・<b style="color:${T.c}">${T.n}</b>・${r.line === "blue" ? "🌿 藍銀草" : "🔨 昊天錘"}<br>獲得魂技「${esc(sk)}」：${r.line === "blue" ? "規律線" : "突破線"}魂力 +3%</p>
      <div class="dl-say">${pic("tangsan", 56)}<div><small>唐三</small><p>${esc(pick(["感覺到了嗎？魂環融進身體的那一刻，所有的累積都有了意義。", "這個魂環，是你一天一天換來的。", "瓶頸破了。接下來的路，會看到不一樣的風景。"]))}</p></div></div><div class="dl-row"><button class="btn" data-dl-x>繼續</button></div>`);
  }

  /* ===== 浮動頭像 ===== */
  function renderFloat() {
    let f = document.getElementById("dl-float");
    if (!D.on || !D.d) { if (f) f.remove(); return; }
    if (!f) { f = document.createElement("div"); f.id = "dl-float"; document.body.appendChild(f); f.addEventListener("click", e => { if (e.target.closest(".dl-fx")) { f.classList.toggle("min"); return; } openPanel(); }); }
    const d = D.d, st = d.state, cap = (st.rings.length + 1) * 10, bottleneck = d.raw_level >= cap && !st.hunt;
    f.innerHTML = `<div class="dl-fwrap"><div class="dl-fbody${bottleneck ? " hot" : ""}">${pic("tangsan", 56)}</div><span class="dl-lv">${d.level}</span></div><div class="dl-bub">${esc(tangLine("idle"))}</div><button class="dl-fx" aria-label="縮小">–</button>`;
  }

  /* ===== 面板 ===== */
  function evHtml(i, cur) {
    const e = (D.ev || []).find(x => x.ch === i), m = EV[i]; if (!e || !m) return "";
    const fmt = v => m.u === "分鐘" && e.target >= 120 ? `${Math.floor(v / 60)}/${Math.floor(e.target / 60)} 小時` : `${v}/${e.target} ${m.u}`;
    return `<div class="dl-ev ${e.done ? "ok" : ""}"><b>${e.done ? "✅" : "🎯"} 章節事件・${esc(m.n)}</b><small>${esc(m.d)}${cur ? "（只算這章開始後的紀錄）" : ""}</small>
      ${e.done ? `<p>${esc(m.ok)}</p><small>完成於 ${String(e.done).slice(5).replace("-", "/")}・🌿 仙草 +1</small>` : `<div class="dl-bar"><i style="width:${Math.round(e.prog / e.target * 100)}%"></i></div><small>${fmt(e.prog)}</small>`}</div>`;
  }
  function openPanel() { D.open = true; renderPanel(); }
  function renderPanel() {
    if (!D.d) return;
    const d = D.d, st = d.state, lv = d.level, xp = st.xp_blue + st.xp_hao, cap = (st.rings.length + 1) * 10, ch = chapterOf(lv);
    const capped = d.raw_level > lv; const pct = lv >= 100 || capped ? 100 : Math.min(100, Math.round((xp - xpAt(lv)) / (xpAt(lv + 1) - xpAt(lv)) * 100));
    const tabs = [["train", "⚔️ 修煉"], ["master", "📜 大師"], ["seven", "🐰 七怪"], ["story", "📖 故事"]];
    let body = "";
    if (D.tab === "train") {
      body += `<div class="dl-top">${pic("tangsan", 72)}<div><b>第 ${lv} 級・${title(lv)}</b><div class="dl-bar"><i style="width:${pct}%"></i></div><small>魂力 ${xp}${capped ? `（魂力其實夠到 ${d.raw_level} 級，吸收魂環後就會升上去）` : lv < 100 ? `／下一級 ${xpAt(lv + 1)}` : ""}・第 ${ch + 1} 章 ${esc(CH[ch].n)}</small></div></div>`;
      body += `<div class="dl-lines"><div><b>🌿 藍銀草</b><small>規律線・${st.xp_blue}</small></div><div><b>🔨 昊天錘</b><small>突破線・${st.xp_hao}</small></div></div>`;
      body += `<div class="dl-sub">魂環（${st.rings.length}）</div><div class="dl-rings">${st.rings.length ? st.rings.map(r => `<span title="${TIER[r.tier].n}" style="--c:${TIER[r.tier].c}">${r.line === "blue" ? "🌿" : "🔨"}</span>`).join("") : "<small>還沒有魂環</small>"}</div>`;
      if (st.rings.length) body += `<div class="dl-skills">${["blue", "hao"].map(l => st.rings.filter(r => r.line === l).map((r, i) => `<span>${esc(SKILL[l][i] || "")}</span>`).join("")).join("")}</div>`;
      if (st.hunt) { const p = d.hunt_prog, tg = st.hunt.target, T = TIER[st.hunt.tier], left = Math.max(0, Math.ceil((new Date(st.hunt.until) - Date.now()) / 864e5));
        const bar = (n, a, b) => b ? `<div class="dl-hp"><span>${n}</span><div class="dl-bar"><i style="width:${Math.min(100, a / b * 100)}%"></i></div><small>${a}/${b}</small></div>` : "";
        body += `<div class="dl-sub">🏹 獵魂中：<b style="color:${T.c}">${T.n}魂環</b>（${st.hunt.line === "blue" ? "藍銀草" : "昊天錘"}）・剩 ${left} 天</div>${bar("專注分鐘", p.focus, tg.focus)}${bar("困難任務", p.hard, tg.hard)}${bar("生活打卡天數", p.lifedays, tg.lifedays)}<button class="btn ghost" data-hcancel>放棄這次獵魂</button>`; }
      else if (d.raw_level >= cap) {
        const rec = d.state.xp_blue > d.state.xp_hao ? "blue" : "hao";
        body += `<div class="dl-sub">🏹 到 ${cap} 級瓶頸了，選一個魂環去獵（魂力會先存著，吸收後一口氣升上去）</div><p class="dl-meta">📜 大師：${esc(advHunt())}</p>
          <div class="dl-line-pick"><label><input type="radio" name="dl-line" value="blue"${rec === "blue" ? " checked" : ""}> 🌿 藍銀草</label><label><input type="radio" name="dl-line" value="hao"${rec === "hao" ? " checked" : ""}> 🔨 昊天錘</label>${st.herbs ? `<label><input type="checkbox" id="dl-herb"> 🌿 用一株仙草（目標 -30%，有 ${st.herbs} 株）</label>` : ""}</div>
          ${[1, 2, 3, 4].map(t => `<button class="dl-tier" data-tier="${t}" style="--c:${TIER[t].c}"><b>${TIER[t].n}魂環</b><small>${TIER[t].d}</small></button>`).join("")}`;
      } else body += `<p class="dl-meta">再升到 ${cap} 級就會遇到瓶頸，到時要獵魂。</p>`;
      body += eta(d);
      body += `<p class="dl-meta">🌿 仙草 ${st.herbs} 株（某天專注滿 3 小時就會得到）・連續 ${d.stats.streak} 天</p>`;
    }
    if (D.tab === "master") {
      const a = masterAdvice();
      body += `<div class="dl-top">${pic("master", 64)}<div><b>大師・玉小剛</b><small>你是他的 ${mlv(st.master_follow)}（照建議做了 ${st.master_follow} 次）</small></div></div>`;
      body += `<div class="dl-say m"><div><small>今日指導</small><p>${a.say.map(esc).join("<br>")}</p></div></div>`;
      body += a.todo.length ? `<div class="dl-sub">建議今天先做</div>${a.todo.map((t, i) => `<div class="dl-todo"><div><b>${esc(t.t)}</b><small>${esc(t.why)}</small></div><button class="btn" data-td="${i}">＋ 加入</button></div>`).join("")}` : "";
      const s7 = Object.entries(d.stats.subj7).sort((x, y) => y[1] - x[1]);
      body += `<div class="dl-sub">這週各科專注</div>${s7.length ? s7.map(([k, m]) => `<div class="dl-hp"><span>${esc(k)}</span><div class="dl-bar"><i style="width:${Math.min(100, m / Math.max(...s7.map(x => x[1])) * 100)}%"></i></div><small>${m} 分</small></div>`).join("") : "<small>這週還沒有專注紀錄</small>"}`;
      if (st.master_follow >= 15) body += `<p class="dl-meta">📜 入室弟子以上：大師會把你這週最弱的科目放在每天建議的第一個。</p>`;
    }
    if (D.tab === "seven") {
      const s = d.stats;
      body += `<p class="dl-meta">把某一類練到一定程度，史萊克的夥伴就會加入你。</p><div class="dl-seven">${SEVEN.map(c => { const ok = c.need(s); return `<div class="${ok ? "on" : ""}">${ok ? pic(c.k, 48, c.ic) : `<span class="dl-emo lock">❔</span>`}<b>${ok ? c.n : "？？？"}</b><small>${ok ? c.buf : c.d}</small></div>`; }).join("")}</div>`;
    }
    if (D.tab === "story") body += CH.map((c, i) => `<div class="dl-ch${i <= ch ? "" : " lock"}"><b>第 ${i + 1} 章・${i <= ch ? esc(c.n) : "？？？"}</b><small>${c.lv} 級${i <= ch ? "" : " 解鎖"}</small>${i <= ch ? `<p>${esc(c.t)}</p>${evHtml(i)}` : ""}</div>`).join("");
    if (D.tab === "train") body = body.replace('<div class="dl-lines">', `${evHtml(ch, true)}<div class="dl-lines">`);
    const bg = modal(`<div class="dl-head"><b>⚔️ 斗羅修煉</b><button class="dl-x" data-dl-x>✕</button></div><div class="dl-tabs">${tabs.map(([k, t]) => `<button class="${D.tab === k ? "on" : ""}" data-tab="${k}">${t}</button>`).join("")}</div>${body}<div class="dl-row"><button class="btn ghost" data-off>關閉斗羅模式</button></div>`);
    D.open = true;
    bg.addEventListener("click", async e => {
      const t = e.target.closest("[data-tab]"); if (t) { D.tab = t.dataset.tab; return renderPanel(); }
      const td = e.target.closest("[data-td]"); if (td) { await addTodo(masterAdvice().todo[Number(td.dataset.td)]); td.disabled = true; td.textContent = "已加入"; return; }
      const tr = e.target.closest("[data-tier]"); if (tr) { const line = (bg.querySelector("[name=dl-line]:checked") || {}).value || "hao", herb = !!(bg.querySelector("#dl-herb") || {}).checked;
        const { error } = await db.rpc("douluo_hunt_start", { p_tier: Number(tr.dataset.tier), p_line: line, p_herb: herb }); if (error) return toast(error.message); toast("🏹 獵魂開始！"); return load(true); }
      if (e.target.closest("[data-off]")) { close(); return setOn(false); }
      if (e.target.closest("[data-hcancel]")) { if (!confirm("確定放棄這次獵魂？")) return; await db.rpc("douluo_hunt_cancel"); return load(true); }
    });
  }

  /* ===== 開關（在 🧩 功能列表最上面） ===== */
  async function setOn(v) {
    D.on = v; try { localStorage.setItem("douluoOn", v ? "1" : "0"); } catch (_) {}
    if (hasDb()) { const { data } = await db.from("user_settings").select("features").eq("user_id", currentUser.id).maybeSingle(); const features = Object.assign({}, (data && data.features) || {}, { douluo_on: v });
      await db.from("user_settings").upsert({ user_id: currentUser.id, features, updated_at: new Date().toISOString() }, { onConflict: "user_id" }); }
    addBtn(); try { document.dispatchEvent(new Event("douluo:change")); } catch (_) {} if (v) { await load(true); renderFloat(); toast("⚔️ 斗羅模式開啟，唐三來了"); setTimeout(daily, 400); } else { renderFloat(); close(); toast("斗羅模式已關閉（魂力會繼續在背景累積）"); }
  }
  new MutationObserver(() => {
    const box = document.querySelector(".feat-box"); if (!box || box.querySelector(".dl-feat")) return;
    const row = document.createElement("div"); row.className = "feat-row dl-feat";
    row.innerHTML = `<span>⚔️ 斗羅模式<small style="display:block;opacity:.7;font-size:12px">唐三陪你修煉、大師每天指導</small></span><button class="feat-sw${D.on ? " on" : ""}" aria-label="斗羅模式"></button>`;
    row.querySelector("button").addEventListener("click", async ev => { const b = ev.currentTarget; await setOn(!D.on); b.classList.toggle("on", D.on); });
    const n = box.querySelector(".small-note"); n ? n.after(row) : box.prepend(row);
  }).observe(document.body, { childList: true, subtree: true });

  // 首頁「🧩 功能開關」旁邊也放一顆
  function addBtn() {
    const bar = document.querySelector(".game-mode-bar"); if (!bar) return;
    let b = document.getElementById("dl-open");
    if (!b) { b = document.createElement("button"); b.id = "dl-open"; b.type = "button"; b.className = "game-mode-toggle"; b.addEventListener("click", async () => { if (!D.on) await setOn(true); else openPanel(); }); const f = document.getElementById("feat-open"); f ? f.after(b) : bar.insertBefore(b, bar.firstChild); }
    b.textContent = D.on ? "⚔️ 斗羅修煉" : "⚔️ 開啟斗羅模式";
  }
  setInterval(addBtn, 2000); setTimeout(addBtn, 1800);

  const evSt = document.createElement("style");
  evSt.textContent = `.dl-ev { margin: 8px 0; padding: 9px 11px; border-radius: 12px; border: 1px solid rgba(241,196,15,.35); background: rgba(241,196,15,.07); }
    .dl-ev b { display: block; font-size: 13.5px; } .dl-ev small { display: block; font-size: 11.5px; opacity: .75; margin-top: 2px; } .dl-ev p { margin: 6px 0 2px; font-size: 13px; line-height: 1.6; }
    .dl-ev.ok { border-color: rgba(63,185,80,.45); background: rgba(63,185,80,.08); } .dl-ev .dl-bar { margin-top: 6px; }`;
  document.head.appendChild(evSt);
  /* ===== 樣式 ===== */
  const css = document.createElement("style");
  css.textContent = `
    #dl-float{position:fixed;left:12px;bottom:84px;z-index:900;display:flex;align-items:flex-end;gap:6px;cursor:pointer;max-width:260px}
    #dl-float .dl-fbody{position:relative;width:56px;height:56px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 2px #5b8cff,0 0 16px rgba(91,140,255,.7);background:#1b2140;flex:none;animation:dlbreath 4s ease-in-out infinite}
    #dl-float .dl-fbody.hot{box-shadow:0 0 0 2px #ffd54a,0 0 20px #ffd54a}
    #dl-float .dl-fwrap{position:relative;flex:none}#dl-float .dl-lv{position:absolute;right:-4px;bottom:-2px;background:#5b8cff;color:#fff;font-size:11px;font-weight:800;border-radius:8px;padding:0 4px}
    #dl-float .dl-bub{background:rgba(20,24,44,.88);color:#eef;font-size:12.5px;padding:7px 10px;border-radius:12px 12px 12px 2px;line-height:1.4}
    #dl-float .dl-fx{position:absolute;left:-4px;top:-4px;width:18px;height:18px;border-radius:50%;border:0;background:rgba(20,24,44,.8);color:#eef;font-size:12px;display:none}
    #dl-float:hover .dl-fx{display:block}#dl-float.min .dl-bub{display:none}
    @keyframes dlbreath{50%{box-shadow:0 0 0 2px #5b8cff,0 0 26px rgba(120,170,255,.95)}}
    .dl-pic{object-fit:cover;border-radius:50%;flex:none}.dl-emo{display:inline-grid;place-items:center;border-radius:50%;background:radial-gradient(circle,#3a4a8a,#1b2140);flex:none}.dl-emo.lock{width:48px;height:48px;font-size:22px;opacity:.5}
    .dl-bg{position:fixed;inset:0;background:rgba(6,8,20,.6);z-index:9990;display:flex;align-items:flex-end;justify-content:center}
    .dl-box{width:min(540px,100%);max-height:88vh;overflow:auto;background:linear-gradient(180deg,#1b2140,#151a30);color:#eef;border-radius:18px 18px 0 0;padding:16px 16px 22px;box-shadow:0 -10px 40px rgba(60,90,200,.35)}
    @media(min-width:640px){.dl-bg{align-items:center}.dl-box{border-radius:18px}}
    .dl-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.dl-head b{font-size:17px}
    .dl-x{border:0;background:rgba(255,255,255,.1);color:#eef;width:30px;height:30px;border-radius:50%;font-size:14px;cursor:pointer}
    .dl-say{display:flex;gap:10px;align-items:flex-start;background:rgba(91,140,255,.12);border-radius:14px;padding:10px;margin:8px 0}.dl-say.m{background:rgba(255,213,74,.1)}
    .dl-say small{display:block;font-size:12px;opacity:.7}.dl-say p{margin:2px 0 0;font-size:14.5px;line-height:1.6}
    .dl-sub{font-size:13px;font-weight:700;margin:12px 0 6px;opacity:.9}
    .dl-todo{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.05);margin-bottom:6px}.dl-todo small{display:block;font-size:12px;opacity:.7}
    .dl-row{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}
    .dl-hero{display:grid;place-items:center;margin:6px 0}.dl-hero .dl-pic,.dl-hero .dl-emo{border-radius:16px}
    .dl-meta{font-size:12.5px;opacity:.8;margin:6px 0}
    .dl-tabs{display:flex;gap:4px;margin-bottom:10px;overflow-x:auto}.dl-tabs button{flex:1;border:0;border-radius:10px;padding:8px 6px;background:rgba(255,255,255,.06);color:#eef;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}.dl-tabs button.on{background:#5b8cff}
    .dl-top{display:flex;gap:12px;align-items:center}.dl-top>div{flex:1}.dl-top small{display:block;font-size:12px;opacity:.75}
    .dl-bar{height:8px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden;margin:5px 0}.dl-bar i{display:block;height:100%;background:linear-gradient(90deg,#5b8cff,#9fd0ff)}
    .dl-lines{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0}.dl-lines div{background:rgba(255,255,255,.05);border-radius:10px;padding:8px}.dl-lines small{display:block;font-size:12px;opacity:.7}
    .dl-rings{display:flex;gap:6px;flex-wrap:wrap}.dl-rings span{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;border:3px solid var(--c);box-shadow:0 0 10px var(--c);font-size:14px}
    .dl-skills{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}.dl-skills span{font-size:11.5px;background:rgba(255,255,255,.08);border-radius:8px;padding:2px 7px}
    .dl-hp{display:grid;grid-template-columns:88px 1fr 64px;gap:6px;align-items:center;font-size:12.5px}.dl-hp small{text-align:right;opacity:.8}
    .dl-line-pick{display:flex;flex-wrap:wrap;gap:10px;font-size:13px;margin:6px 0}
    .dl-tier{display:block;width:100%;text-align:left;border:2px solid var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);color:#eef;border-radius:12px;padding:8px 10px;margin:6px 0;font:inherit;cursor:pointer}.dl-tier small{display:block;font-size:12px;opacity:.8}
    .dl-seven{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}.dl-seven div{text-align:center;background:rgba(255,255,255,.04);border-radius:12px;padding:8px 4px;opacity:.6}.dl-seven div.on{opacity:1;box-shadow:0 0 0 1.5px #ffd54a}
    .dl-seven b{display:block;font-size:13px;margin-top:4px}.dl-seven small{font-size:11px;opacity:.75}
    .dl-ch{padding:10px;border-radius:12px;background:rgba(255,255,255,.05);margin-bottom:6px}.dl-ch.lock{opacity:.45}.dl-ch small{margin-left:6px;font-size:12px;opacity:.7}.dl-ch p{margin:6px 0 0;font-size:13.5px;line-height:1.6}
    .dl-ring-big{width:110px;height:110px;margin:8px auto;border-radius:50%;border:6px solid var(--c);box-shadow:0 0 30px var(--c),inset 0 0 20px var(--c);animation:dlring 1.6s ease-out}
    @keyframes dlring{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}
    @media(prefers-reduced-motion:reduce){#dl-float .dl-fbody,.dl-ring-big{animation:none}}`;
  document.head.appendChild(css);

  /* ===== 開機 ===== */
  (function boot(n) {
    if (!hasDb()) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; }
    db.from("user_settings").select("features").eq("user_id", currentUser.id).maybeSingle().then(({ data }) => {
      const v = !!(data && data.features && data.features.douluo_on); if (v !== D.on) { D.on = v; try { localStorage.setItem("douluoOn", v ? "1" : "0"); } catch (_) {} }
      load();
    });
    setInterval(() => { if (!document.hidden) load(true); }, 5 * 60 * 1000);
    setInterval(() => { if (!document.hidden && D.on) renderFloat(); }, 45 * 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  })(0);
  window.Douluo = { load, open: () => D.on && openPanel(), setOn, isOn: () => D.on, level: () => (D.d ? D.d.level : 1) };
})();
