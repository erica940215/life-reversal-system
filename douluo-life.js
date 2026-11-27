/* ⚔️ 斗羅・相處感（斗羅模式開著才有）
   ① 早上可以回話：狀態不錯／有點累／不太想讀 → 不同回應；順便記成今天的精力（今天還沒評估才記）
   ② 專注時唐三也在修煉：頭像顯示同步計時，每 25 分鐘輕輕說一句
   ③ 七怪依你的狀況來找你（一天最多 2 次）：沒解鎖的夥伴由唐三代為提起，不劇透
   ④ 記得你：引用昨天的反省／學到什麼；大師追問改善清單
   ⑤ 晚上營火（一鍵收尾最後一步）＋每週日「大師的信」
   只讀現有資料；寫入只有：今天的精力（沒評估過才寫）、改善項目標成「已改善」（你按了才寫） */
(function () {
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const X = () => (window.Douluo && window.Douluo.ctx ? window.Douluo.ctx() : null);
  const on = () => { const c = X(); return !!(c && c.on && c.d); };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem("dlLife_" + k); localStorage.setItem("dlLife_" + k, v); } catch (_) { return null; } };
  const today = () => { const c = X(); return (c && c.d && c.d.stats.today) || new Date(Date.now() - 6 * 3600e3).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }); };
  const short = (t, n) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };
  const L = { refl: [], imps: [], water: 0, waterGoal: 2250, loaded: "" };

  async function load() {
    if (!hasDb() || !on()) return;
    const t = today(), y = new Date(new Date(t).getTime() - 3 * 864e5).toISOString().slice(0, 10);
    const [rf, im, wa, us] = await Promise.all([
      db.from("daily_reflections").select("reflect_date, reflection, improvement, learned").eq("user_id", currentUser.id).gte("reflect_date", y).lt("reflect_date", t).order("reflect_date", { ascending: false }).limit(3),
      db.from("improvements").select("id, text, created_at").eq("status", "active").order("created_at").limit(50),
      db.from("water_logs").select("ml").eq("log_date", t).limit(50),
      db.from("user_settings").select("accum").maybeSingle()]);
    L.refl = rf.data || []; L.imps = im.data || [];
    L.water = (wa.data || []).reduce((a, r) => a + (r.ml || 0), 0);
    L.waterGoal = (us.data && us.data.accum && Number(us.data.accum.waterMl)) || 2250;
    L.loaded = t;
    weeklyLetter(false);
    visit();
  }

  /* ---------- ④ 記得你 ---------- */
  function memoryHtml() {
    const c = X(); if (!c) return "";
    const r = L.refl[0]; if (!r) return "";
    const day = Math.round((new Date(today()) - new Date(r.reflect_date)) / 864e5), when = day <= 1 ? "昨天" : `${day} 天前`;
    let line = "";
    if (r.improvement && r.improvement.trim()) line = `${when}你說「${short(r.improvement.split(/\n/)[0], 28)}」。今天，我會看著你做到。`;
    else if (r.learned && r.learned.trim()) line = `${when}你學到「${short(r.learned, 26)}」。要不要先花五分鐘，用自己的話講一遍給我聽？`;
    else if (r.reflection && r.reflection.trim()) line = `${when}你寫：「${short(r.reflection, 30)}」我記得。今天我們從那裡接著走。`;
    return line ? `<div class="dl-say">${c.pic("tangsan", 40)}<div><small>唐三・還記得</small><p>${esc(line)}</p></div></div>` : "";
  }
  function impOfDay() {
    const t = today(), old = L.imps.filter(i => (new Date(t) - new Date(String(i.created_at).slice(0, 10))) / 864e5 >= 3);
    if (!old.length) return null;
    const n = Number(t.replace(/-/g, "")) % old.length; return old[n];
  }
  function masterHtml() {
    const c = X(); if (!c) return "";
    let h = "";
    const im = impOfDay();
    if (im && ls("imp" + today()) !== String(im.id)) {
      const days = Math.round((new Date(today()) - new Date(String(im.created_at).slice(0, 10))) / 864e5);
      h += `<div class="dl-sub">大師想問你</div><div class="dl-say m" data-dlimp="${im.id}">${c.pic("master", 40)}<div><small>大師</small><p>${days} 天前你說要「${esc(short(im.text, 30))}」。這幾天，做到了嗎？</p>
        <div class="dl-ans"><button type="button" class="btn" data-dlimp-a="yes">做到了</button><button type="button" class="btn" data-dlimp-a="some">有時候</button><button type="button" class="btn" data-dlimp-a="no">還沒</button></div></div></div>`;
    }
    h += `<div class="dl-row"><button type="button" class="btn ghost" data-dl-letter>📮 這週大師的信</button></div>`;
    return h;
  }

  /* ---------- ① 早上回話 ---------- */
  function askHtml() {
    return `<div class="dl-ask"><p class="dl-sub">唐三：今天感覺怎麼樣？</p><div class="dl-ans">
      <button type="button" class="btn" data-dlq="green">💪 狀態不錯</button><button type="button" class="btn" data-dlq="blue">😐 有點累</button><button type="button" class="btn" data-dlq="yellow">🫠 不太想讀</button></div></div>`;
  }
  const REPLY = {
    green: ["好，那今天我們往前衝一點。先挑最難的那件，趁魂力最滿的時候。", "看得出來。今天適合挑戰，我在旁邊陪你。"],
    blue: ["累的時候就穩穩地練，不用逞強。照計畫，一件一件來。", "那今天不衝刺，維持就好。保住節奏，比爆發更重要。"],
    yellow: ["沒關係，我也有不想修煉的日子。那我們先練 25 分鐘就好，練完再決定要不要繼續。", "不想讀的時候，最難的是開始。先 25 分鐘，我陪你。"]
  };
  async function saveEnergy(level) {
    if (!hasDb()) return;
    const t = today();
    const { data } = await db.from("energy_logs").select("day").eq("day", t).maybeSingle();
    if (data) return;
    await db.from("energy_logs").upsert({ user_id: currentUser.id, day: t, level, mode: level === "yellow" ? "recover" : "steady", updated_at: new Date().toISOString() }, { onConflict: "user_id,day" });
    try { window.Energy && window.Energy.load && window.Energy.load(); } catch (_) {}
  }
  function start25() {
    const c = X(); if (c) c.close();
    try { focusMode = "down"; focusPlannedMinutes = 25; if (typeof renderFocusSetup === "function") renderFocusSetup(); } catch (_) {}
    if (typeof showPage === "function") showPage("focus");
  }

  /* ---------- ③ 七怪來找你 ---------- */
  function bubble(k, ic, who, text) {
    const c = X(); if (!c) return;
    document.querySelector(".dl-bubble")?.remove();
    const b = document.createElement("div"); b.className = "dl-bubble";
    b.innerHTML = `${c.pic(k, 40, ic)}<p><small style="display:block;opacity:.7;font-size:11.5px">${esc(who)}</small>${esc(text)}</p>`;
    document.body.appendChild(b); setTimeout(() => b.classList.add("out"), 6500); setTimeout(() => b.remove(), 7100);
    b.addEventListener("click", () => b.remove());
  }
  function focusMin() { try { return focusTimer ? Math.floor(focusElapsedMs(focusTimer) / 60000) : 0; } catch (_) { return 0; } }
  function visit() {
    const c = X(); if (!on() || !c) return;
    const t = today(), key = "visit" + t, done = (ls(key) || "").split(",").filter(Boolean);
    if (done.length >= 2) return;
    const s = c.d.stats, h = new Date().getHours(), m = new Date().getMinutes(), R = c.real || {};
    const has = k => { const x = c.SEVEN.find(z => z.k === k); return x && x.need(s); };
    const cand = [];
    const expect = L.waterGoal * Math.min(1, Math.max(0, (h - 8) / 14));
    if (h >= 11 && h < 22 && L.water < expect * 0.5) cand.push(["oscar", "🌭", has("oscar") ? ["奧斯卡", "來，吃根香腸……我是說，喝口水。你今天才喝 " + L.water + " ml。"] : ["唐三", `今天才喝了 ${L.water} ml。要是奧斯卡在，他一定塞一根香腸給你，順便逼你喝水。`]]);
    if (focusMin() >= 90) cand.push(["xiaowu", "🐰", has("xiaowu") ? ["小舞", "哥，你已經坐了 " + focusMin() + " 分鐘了！起來，陪我走一圈。"] : ["唐三", `連續 ${focusMin()} 分鐘了。小舞要是在，早就把你拉起來走一圈了。站起來動一動吧。`]]);
    if ((h === 2 && m >= 30) || (h >= 3 && h < 6)) cand.push(["daimubai", "🐯", has("daimubai") ? ["戴沐白", "都幾點了？白虎也要睡覺的。去睡，明天再打。"] : ["唐三", "已經過兩點半了。你說過要準時上床的，我記得。去睡吧，魂力是睡覺時沉澱的。"]]);
    if (s.done_today >= 3 && s.tasks_today && s.done_today / s.tasks_today >= 0.8) cand.push(["ningrongrong", "🗼", has("ningrongrong") ? ["寧榮榮", `今天完成 ${s.done_today} 件！七寶琉璃塔給你加持，剩下的也會很順。`] : ["唐三", `今天已經完成 ${s.done_today} 件了。榮榮要是看到，一定會說這是七寶琉璃塔加持的。`]]);
    if (R.stuck && R.stuck.length) cand.push(["mahongjun", "🔥", has("mahongjun") ? ["馬紅俊", `「${short(R.stuck[0].t, 14)}」拖 ${R.stuck[0].d} 天了耶！胖子我都看不下去了，衝啊！`] : ["唐三", `「${short(R.stuck[0].t, 14)}」已經拖了 ${R.stuck[0].d} 天。胖子要是在，大概會直接用鳳凰火線燒你屁股。`]]);
    const next = cand.find(x => !done.includes(x[0])); if (!next) return;
    if (document.querySelector(".dl-bg, .vg-modal")) return;
    done.push(next[0]); ls(key, done.join(","));
    const [k, ic, [who, text]] = next; bubble(who === "唐三" ? "tangsan" : k, who === "唐三" ? undefined : ic, who, text);
  }

  /* ---------- ② 專注時唐三也在修煉 ---------- */
  const WHISPER = ["還在喔，我也是。", "呼吸慢一點，魂力會更穩。", "我這邊的藍銀草，又長了一截。", "不用想結果，想下一題就好。", "累了就喝口水，我等你。", "大師說，修煉最怕的不是慢，是停。"];
  setInterval(() => {
    if (!on()) return;
    const f = document.getElementById("dl-float"); let tm = null;
    try { tm = focusTimer; } catch (_) {}
    const bub = f && f.querySelector(".dl-bub");
    if (tm) {
      const ms = focusElapsedMs(tm), mm = Math.floor(ms / 60000), ss = Math.floor(ms / 1000) % 60;
      /* 頭像旁的對話框保留唐三原本說的話（不改成計時） */
      const step = Math.floor(mm / 25), k = "wh" + (tm.startedAt || tm.start || "") ;
      if (step >= 1 && ls(k) !== String(step)) { ls(k, String(step)); const c = X(); bubble("tangsan", undefined, "唐三・一起修煉中", pick(WHISPER)); }
      if (mm >= 90 && ls("v90" + today()) !== "1") { ls("v90" + today(), "1"); visit(); }
    }
  }, 1000);
  setInterval(() => { if (on()) visit(); }, 5 * 60 * 1000);

  /* ---------- ⑤ 營火 ＋ 大師的信 ---------- */
  function campfireHtml() {
    const c = X(); if (!on() || !c) return "";
    const s = c.d.stats, ft = s.focus_today || 0, dt = s.done_today || 0, tt = s.tasks_today || 0;
    const has = k => { const x = c.SEVEN.find(z => z.k === k); return x && x.need(s); };
    const lines = [["tangsan", null, "唐三", ft >= 180 ? `今天練了 ${ft} 分鐘。坐下來烤烤火，你值得。` : ft > 0 ? `今天 ${ft} 分鐘，有練就有魂力。明天我們再多一點點。` : "今天沒怎麼練也沒關係，能坐在這裡收尾，就已經沒放棄了。"]];
    if (has("xiaowu")) lines.push(["xiaowu", "🐰", "小舞", dt ? `哥今天完成 ${dt} 件！我就說你可以的。` : "明天我陪你，第一件事一起做。"]);
    if (has("oscar")) lines.push(["oscar", "🌭", "奧斯卡", L.water >= L.waterGoal ? "水喝夠了，香腸給你加一根。" : "今天水喝太少了，明天記得多喝一點。"]);
    if (has("ningrongrong")) lines.push(["ningrongrong", "🗼", "寧榮榮", tt && dt / tt >= 0.8 ? "完成率這麼高，明天繼續加持你。" : "沒做完的別煩，明天塔再幫你加一層。"]);
    if (has("mahongjun")) lines.push(["mahongjun", "🔥", "馬紅俊", "胖子我今天也很努力……在吃。你比我強。"]);
    if (has("daimubai")) lines.push(["daimubai", "🐯", "戴沐白", "別熬了，身體是一切的本錢。"]);
    if (has("zhuzhuqing")) lines.push(["zhuzhuqing", "🐈‍⬛", "朱竹清", "……早點睡。"]);
    lines.push(["master", null, "大師", tt ? `今天 ${dt}／${tt}。明天第一件事想好了，就去睡。` : "明天要做什麼，現在列好。睡前定好方向，醒來才不會迷路。"]);
    return `<div class="dl-fire"><div class="dl-fire-h">🔥 營火・史萊克的夜晚</div>${lines.map(([k, ic, who, t]) => `<div class="dl-say">${c.pic(k, 34, ic || undefined)}<div><small>${esc(who)}</small><p>${esc(t)}</p></div></div>`).join("")}</div>`;
  }
  function weekKey() { const t = new Date(today()); const d = (t.getUTCDay() + 6) % 7; return new Date(t.getTime() - d * 864e5).toISOString().slice(0, 10); }
  function letterHtml() {
    const c = X(); const d = c.d, s = d.stats, st = d.state, R = c.real || {};
    const subj = Object.entries(s.subj7 || {}).sort((a, b) => b[1] - a[1]), tot = subj.reduce((a, x) => a + x[1], 0);
    const best = subj[0], worst = subj[subj.length - 1];
    const p = [];
    p.push(`這一週，你專注了 ${Math.floor(tot / 60)} 小時 ${tot % 60} 分鐘。${tot >= 1200 ? "這個量，放在史萊克也是前段。" : tot >= 600 ? "穩，但還有空間。" : "不多。但我看過更低的起點，最後也走到了很遠。"}`);
    if (best) p.push(`花最多時間的是${best[0]}（${best[1]} 分鐘）${worst && worst[0] !== best[0] ? `，最少的是${worst[0]}（${worst[1]} 分鐘）。下週，先把${worst[0]}補起來。` : "。"}`);
    if (R.late && R.late.n) p.push(`推甄進度還有 ${R.late.n} 項落後，最早的是「${R.late.first}」。不要讓它變成你不敢打開的那一頁。`);
    if (R.exam && R.exam.days > 0) p.push(`離魂師大賽還有 ${R.exam.days} 天。`);
    p.push(`你現在是第 ${d.level} 級，${st.rings.length ? `身上有 ${st.rings.length} 個魂環` : "還沒有魂環"}，已經連續 ${s.streak} 天有在修煉。`);
    p.push(st.master_follow >= 5 ? `這週你照我的建議做了好幾次。我沒有看錯人。` : "下週，試著照我的建議做一件事。理論，要練過才是你的。");
    return `<div class="dl-head"><b>📮 大師的信・${weekKey().slice(5).replace("-", "/")} 這一週</b><button class="dl-x" data-dl-x>✕</button></div>
      <div class="dl-letter">${c.pic("master", 56)}<div><p>致我的弟子：</p>${p.map(x => `<p>${esc(x)}</p>`).join("")}<p style="text-align:right">——玉小剛</p></div></div><div class="dl-row"><button class="btn" data-dl-x>收好這封信</button></div>`;
  }
  function weeklyLetter(force) {
    const c = X(); if (!on() || !c) return;
    const now = new Date(), wd = now.getDay(), h = now.getHours(), wk = weekKey();
    if (!force) { if (!((wd === 0 && h >= 18) || (wd === 1 && h < 12))) return; if (ls("letter") === wk) return; if (document.querySelector(".dl-bg, .vg-modal")) return setTimeout(() => weeklyLetter(false), 60000); ls("letter", wk); }
    c.modal(letterHtml());
  }

  /* ---------- 事件 ---------- */
  document.addEventListener("click", async e => {
    const q = e.target.closest("[data-dlq]");
    if (q) { const lv = q.dataset.dlq, box = q.closest(".dl-ask"), c = X(); if (!box || !c) return;
      box.innerHTML = `<div class="dl-say">${c.pic("tangsan", 40)}<div><small>唐三</small><p>${esc(pick(REPLY[lv]))}</p></div></div>${lv === "yellow" ? `<div class="dl-row"><button type="button" class="btn" data-dl25>⏱️ 開 25 分鐘修煉</button></div>` : ""}`;
      saveEnergy(lv); return; }
    if (e.target.closest("[data-dl25]")) return start25();
    if (e.target.closest("[data-dl-letter]")) return weeklyLetter(true);
    const a = e.target.closest("[data-dlimp-a]");
    if (a) { const box = a.closest("[data-dlimp]"), id = Number(box.dataset.dlimp), v = a.dataset.dlimpA, c = X(); ls("imp" + today(), String(id));
      const say = { yes: "很好。做到的事，就不需要再追蹤了。要不要讓它畢業？", some: "有時候，就是還在練。繼續，直到它變成你的本能。", no: "沒關係。說出來，就已經比假裝沒這回事強。今天先做到一次就好。" }[v];
      box.querySelector("p").textContent = say; box.querySelector(".dl-ans").innerHTML = v === "yes" ? `<button type="button" class="btn" data-dlimp-done="${id}">🏁 讓它畢業（標成已改善）</button>` : "";
      return; }
    const g = e.target.closest("[data-dlimp-done]");
    if (g && hasDb()) { const id = Number(g.dataset.dlimpDone); const { error } = await db.from("improvements").update({ status: "done", ended_at: new Date().toISOString() }).eq("id", id);
      if (error) { typeof showToast === "function" && showToast("更新失敗：" + error.message); return; }
      L.imps = L.imps.filter(i => i.id !== id); g.replaceWith(Object.assign(document.createElement("small"), { textContent: "🏁 畢業了。大師點點頭。" }));
      try { window.ImproveBox && window.ImproveBox.load(); } catch (_) {} }
  });
  document.addEventListener("douluo:change", () => { if (on() && L.loaded !== today()) setTimeout(load, 300); });
  setTimeout(() => { if (on()) load(); }, 4000);

  const st = document.createElement("style");
  st.textContent = `
    .dl-ans { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; } .dl-ans .btn { flex: 1; min-width: 90px; }
    .dl-ask { margin: 8px 0; }
    .dl-sync { font-variant-numeric: tabular-nums; color: #9fd0ff; }
    .dl-fire { margin-top: 10px; padding: 10px 12px; border-radius: 14px; background: radial-gradient(circle at 50% 120%, rgba(255,140,40,.28), rgba(20,16,30,.0) 70%), rgba(127,127,127,.06); }
    .dl-fire-h { font-weight: 700; font-size: 14px; margin-bottom: 4px; } .dl-fire .dl-say { margin: 6px 0; } .dl-fire .dl-say p { font-size: 13.5px; }
    .dl-letter { display: flex; gap: 12px; align-items: flex-start; } .dl-letter p { margin: 0 0 8px; line-height: 1.75; font-size: 14px; }`;
  document.head.appendChild(st);
  window.DouluoLife = { load, memoryHtml, askHtml, masterHtml, campfireHtml, letter: () => weeklyLetter(true), visit };
})();
