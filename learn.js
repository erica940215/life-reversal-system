/* 📚 每科今天學到什麼＋遺忘曲線複習
   資料在 sql/2026-11-08_每科今天學到什麼.sql */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const GAPS = [1, 2, 4, 7, 15, 30, 60];
  const L = { d: null, err: null, subj: null, open: false };
  const lastSubj = () => { try { return localStorage.getItem("learnSubj"); } catch (_) { return null; } };

  async function load() {
    const [{ data, error }, x] = await Promise.all([db.rpc("learn_status"), db.rpc("learn_extra")]);
    L.err = error ? error.message : null;
    if (!error) L.d = data;
    L.x = x.error ? null : x.data;
    render();
    maybePop();
  }

  function render() {
    const tp = document.querySelector('.page[data-page="today"]');
    if (!tp) return;
    let box = document.getElementById("ln-today");
    if (!box) {
      box = document.createElement("section");
      box.id = "ln-today"; box.className = "card";
      const ref = document.getElementById("today-checkin") || document.getElementById("morning-card");
      ref ? ref.after(box) : tp.appendChild(box);
    }
    const d = L.d;
    if (!d) { box.innerHTML = `<h2>📚 今天學到什麼</h2><p class="tb-note">${L.err ? (/learn_status/.test(L.err) ? "資料庫還沒設定：到 Supabase 執行 sql/2026-11-08_每科今天學到什麼.sql" : esc(L.err)) : "載入中…"}</p>`; return; }
    const subs = d.subjects.length ? d.subjects : ["多益", "資料結構", "計概"];
    if (!L.subj) L.subj = lastSubj() && subs.includes(lastSubj()) ? lastSubj() : subs[0];
    const groups = {};
    d.today_notes.forEach(n => (groups[n.subject] = groups[n.subject] || []).push(n));
    const X = L.x || {}, hr = new Date().getHours();
    const dream = X.dream && X.dream.length && !X.dream_done && hr >= 5 && hr < 13 ? `<div class="ln-dream"><b>🌙 昨晚的夢</b><p>夢裡出現了一些片段…你還記得昨天學了什麼嗎？</p>
        ${X.dream.map(n => `<div class="ln-frag ${L.dreamOpen ? "open" : ""}"><small>${esc(n.subject)}</small>${L.dreamOpen ? esc(n.title) + (n.note ? `<em>${esc(n.note)}</em>` : "") : esc(n.title.slice(0, Math.max(1, Math.ceil(n.title.length / 3)))) + "＿＿＿"}</div>`).join("")}
        ${L.dreamOpen ? `<button type="button" class="btn btn-small btn-primary" data-ln="dreamok">🌅 我想起來了（✨5）</button>` : `<button type="button" class="btn btn-small" data-ln="dream">先在心裡回想，再點這裡看完整</button>`}</div>` : "";
    const vq = X.villager && !X.villager.answered ? `<div class="ln-vq"><span class="ln-vqf"><img src="img/village/librarian.webp" alt="" onerror="this.replaceWith('📚')"></span><div><b>圖書館員：</b>「你 ${Math.round((Date.parse(d.today) - Date.parse(X.villager.day)) / 864e5)} 天前說學了〔${esc(X.villager.subject)}〕<b>${esc(X.villager.title)}</b>，可以教我嗎？」
        <textarea id="ln-vqa" rows="2" maxlength="500" placeholder="用你自己的話教她（好感 +1、✨10）"></textarea><button type="button" class="btn btn-small btn-primary" data-ln="vq">回答</button></div></div>` : "";
    const mons = (X.monsters || []).slice(0, 4);
    const monHtml = mons.length ? `<div class="ln-mons"><b>👾 怪物考官</b>${X.slain ? `<small>已打倒 ${X.slain} 隻 Boss</small>` : ""}${mons.map(m => `<div class="ln-mon ${m.boss ? "boss" : ""}"><span>${m.boss ? "👹" : "👾"}</span><div>${esc(m.title)}<small>${esc(m.subject)}・忘了 ${m.lapses} 次${m.boss ? `・連續記得 ${m.ok_streak}/3 就打倒` : ""}</small></div></div>`).join("")}</div>` : "";
    const cap = X.capsules ? `<button type="button" class="ln-cap" data-ln="cap">🎁 打開知識扭蛋（${X.capsules} 顆）</button>` : `<p class="tb-note">🎁 知識扭蛋：再複習 ${10 - (X.capsule_progress || 0)} 則得到一顆</p>`;
    box.innerHTML = `<h2>📚 今天學到什麼</h2>${dream}${vq}
      ${d.due.length ? `<button type="button" class="ln-rev" data-ln="review">🔁 今天要複習 <b>${d.due.length}</b> 則（遺忘曲線排的）</button>` : `<p class="tb-note">${d.reviewed_today ? `✅ 今天複習完了（${d.reviewed_today} 則）` : "今天沒有要複習的"}・共 ${d.total} 則，熟記 ${d.mastered} 則</p>`}
      ${Object.keys(groups).length ? Object.entries(groups).map(([s, ns]) => `<div class="ln-g"><b>${esc(s)}</b>${ns.map(n => `<div class="ln-n"><span>・${esc(n.title)}${n.note ? `<small>${esc(n.note)}</small>` : ""}</span><button type="button" data-ln="del" data-id="${n.id}" aria-label="刪除">✕</button></div>`).join("")}</div>`).join("")
        : `<p class="tb-note">每一科寫幾個今天學到的標題就好，之後會在 1、2、4、7、15、30、60 天後排回來讓你回想。今天寫滿 3 則送 ✨15。</p>`}
      <div class="ln-add">
        <div class="ln-subs">${subs.map(s => `<button type="button" class="${s === L.subj ? "on" : ""}" data-ln="subj" data-v="${esc(s)}">${esc(s)}</button>`).join("")}<button type="button" data-ln="newsubj">＋科目</button></div>
        <input id="ln-title" maxlength="120" placeholder="${esc(L.subj)}：今天學到的標題（例如 AVL 樹的旋轉）">
        <textarea id="ln-note" rows="2" maxlength="1000" placeholder="一句重點（選填，複習時用來對答案）"></textarea>
        <button type="button" class="btn btn-small btn-primary" data-ln="add" style="width:100%">＋ 記下來</button></div>
      ${monHtml}${cap}<button type="button" class="btn btn-small" data-ln="book" style="width:100%;margin-top:6px">📖 學習年鑑</button>`;
    const inp = box.querySelector("#ln-title");
    if (inp) inp.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); add(); } });
  }

  /* 🤖 給 AI 的提示詞 */
  function aiOne(n, said) {
    return `你是我的家教，我是資管系大四學生，正在準備研究所考試。我會用自己的話解釋一個知識點，請你判斷我說的對不對。

科目：${n.subject}
知識點：${n.title}${n.note ? `\n我當時寫的重點：${n.note}` : ""}
我的解釋：${said || "（我會在下一則訊息說明）"}

請依照這個格式回答，用繁體中文、簡短：
1. 評分：0～10 分
2. 說對的地方：
3. 錯誤或不精確的地方：（沒有就寫「無」）
4. 漏掉的重點：
5. 一句話正確版本：用最好記的方式講一次
6. 追問我一題：一個考試可能會問的延伸問題，等我回答後再幫我批改

最後告訴我該按哪個：😵忘了（6 分以下）／🤔模糊（6～8 分）／😊記得（8 分以上）。`;
  }
  function aiBatch(items) {
    return `你是我的家教，我是資管系大四學生，正在準備研究所考試。今天我要複習下面這些知識點，請你一次只考我一題：

${items.map((n, i) => `${i + 1}.〔${n.subject}〕${n.title}${n.note ? `（我寫的重點：${n.note}）` : ""}`).join("\n")}

規則：
1. 從第 1 題開始，問我「請解釋：○○○」，然後等我回答
2. 我回答後，給我 0～10 分，指出說對的、說錯的、漏掉的重點，再用一句話給我正確又好記的版本
3. 6 分以下標「😵忘了」、6～8 分標「🤔模糊」、8 分以上標「😊記得」
4. 接著問下一題，全部考完後列一張總表：題目｜分數｜😵／🤔／😊
5. 用繁體中文，回答簡短`;
  }
  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg || "📋 已複製，貼給 AI 就可以"); }
    catch (_) { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); toast(okMsg || "📋 已複製"); } catch (__) { prompt("複製下面的文字", text); } t.remove(); }
  }

  async function add() {
    const t = document.getElementById("ln-title"), n = document.getElementById("ln-note");
    if (!t || !t.value.trim()) return toast("先寫標題");
    const { data, error } = await db.rpc("learn_add", { p_subject: L.subj, p_title: t.value, p_note: n ? n.value : null });
    if (error) return toast(error.message);
    L.d = data; render(); toast(`📚 記下來了・明天會考你`);
    const t2 = document.getElementById("ln-title"); if (t2) t2.focus();
  }

  /* 🔁 複習：看標題回想 → 翻面看重點 → 自己評分 */
  function review() {
    const items = (L.d && L.d.due) || [];
    if (!items.length) return;
    const S = { i: 0, shown: false, done: 0 };
    const m = document.createElement("div");
    m.className = "vg-modal";
    const draw = () => {
      if (S.i >= items.length) {
        m.innerHTML = `<div class="vg-card" style="text-align:center"><div class="bh-big">🎉</div><div class="vg-title">複習完了！</div><p>今天回想了 ${S.done} 則</p><button type="button" class="btn btn-primary" data-x="1" style="width:100%">完成</button></div>`;
        return;
      }
      const n = items[S.i], ago = Math.round((Date.parse(L.d.today) - Date.parse(n.day)) / 864e5);
      m.innerHTML = `<div class="vg-card"><div class="ln-prog">${S.i + 1} / ${items.length}<button type="button" data-x="1">✕</button></div>
        ${S.i === 0 && !S.shown ? `<button type="button" class="ln-ai batch" data-lnr="batch">🤖 想讓 AI 一題一題考你？複製今天 ${items.length} 則的提示詞</button>` : ""}
        <div class="ln-card ${S.shown ? "open" : ""}" data-lnr="flip">${n.lapses >= 3 ? `<span class="ln-cm">👹</span>` : n.lapses ? `<span class="ln-cm">👾</span>` : ""}<small>${esc(n.subject)}・${ago} 天前學的${n.lapses ? `・忘過 ${n.lapses} 次` : ""}</small><b>${esc(n.title)}</b>
          ${S.shown ? `<p>${n.note ? esc(n.note) : "（當時沒寫重點，憑你的記憶判斷）"}</p>` : `<p class="ln-hint">先在心裡說出這個主題的內容、怎麼運作、例子，想好了點卡片</p>`}</div>
        ${!S.shown ? `<button type="button" class="ln-ai" data-lnr="ai">🤖 不確定自己說得對不對？先寫下你的解釋，複製給 AI 批改</button>` : ""}
        ${S.ai || (S.shown && S.fey) ? `<div class="ln-fey"><b>${S.ai ? "🤖 你的解釋" : "🧒 阿布："}</b>${S.ai ? "" : "「可以用一句話講給我聽嗎？要我聽得懂喔！」"}<textarea id="ln-fey" rows="3" maxlength="300" placeholder="用自己的話解釋這個知識點">${esc(S.said || "")}</textarea>
          <button type="button" class="btn btn-small" data-lnr="copyai">📋 複製提示詞給 AI 批改</button><small class="ln-aitip">貼到 ChatGPT／Claude，它會打分數、指出錯的地方，並告訴你該按 😵／🤔／😊</small></div>` : ""}
        ${S.shown ? `<div class="ln-grades">${[[0, "😵 忘了", 1], [1, "🤔 模糊", GAPS[n.stage]], [2, "😊 記得", GAPS[Math.min(n.stage + 1, GAPS.length - 1)]]].map(([g, l, dd]) => `<button type="button" class="g${g}" data-lnr="grade" data-v="${g}">${l}<small>${dd} 天後</small></button>`).join("")}</div>` : ""}</div>`;
    };
    m.addEventListener("click", async e => {
      if (e.target === m || e.target.closest("[data-x]")) { m.remove(); load(); return; }
      const b = e.target.closest("[data-lnr]");
      if (!b) return;
      if (b.dataset.lnr === "batch") return copy(aiBatch(items), "📋 已複製！貼給 AI，它會一題一題考你，最後再回來照總表按");
      if (b.dataset.lnr === "ai") { S.ai = true; draw(); const t = m.querySelector("#ln-fey"); if (t) t.focus(); return; }
      if (b.dataset.lnr === "copyai") { const t = m.querySelector("#ln-fey"); S.said = t ? t.value : ""; return copy(aiOne(items[S.i], S.said), "📋 已複製！貼給 AI，看它的評分再回來按按鈕"); }
      if (b.dataset.lnr === "flip" && !S.shown) { const t = m.querySelector("#ln-fey"); if (t) S.said = t.value; S.shown = true; S.fey = S.ai || Math.random() < 0.3 || !items[S.i].note; return draw(); }
      if (b.dataset.lnr === "grade") {
        const n = items[S.i], g = Number(b.dataset.v);
        const fe = m.querySelector("#ln-fey");
        if (fe && fe.value.trim()) db.rpc("learn_explain", { p_id: n.id, p_text: fe.value }).then(() => toast("🧒 阿布：原來是這樣！✨+5"));
        const { data: rv, error } = await db.rpc("learn_review", { p_id: n.id, p_grade: g });
        if (error) return toast(error.message);
        if (rv && rv.slain) toast("⚔️ 打倒 Boss 了！✨50＋金寶箱");
        if (g === 0) items.push({ ...n, stage: 0, lapses: n.lapses + 1, again: true });
        S.done += 1; S.i += 1; S.shown = false; S.ai = false; S.said = ""; draw();
      }
    });
    draw();
    document.body.appendChild(m);
  }

  function mk(html) {
    const m = document.createElement("div"); m.className = "vg-modal";
    m.innerHTML = `<div class="vg-card">${html}</div>`;
    m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-x]")) m.remove(); });
    document.body.appendChild(m); return m;
  }
  /* 🎁 知識扭蛋 */
  async function capsule() {
    const { data, error } = await db.rpc("learn_capsule_open");
    if (error) return toast(error.message);
    const n = data.note || {}, IT = { stardust: "✨ 星屑", gacha_coin: "🪙 扭蛋幣", wish_normal: "⭐ 星願瓶" };
    mk(`<div style="text-align:center"><div class="bh-big ln-pop">🎁</div><div class="vg-title">知識扭蛋</div>
      <div class="ln-card open" style="min-height:120px"><small>${esc(n.subject || "")}・${esc(n.day || "")} 學的</small><b>${esc(n.title || "")}</b>${n.note ? `<p>${esc(n.note)}</p>` : ""}${n.explain ? `<p>🧒 ${esc(n.explain)}</p>` : ""}</div>
      <p class="bh-items">${IT[data.item] || data.item} ×${data.qty}</p><button type="button" class="btn btn-primary" data-x="1" style="width:100%">收下${data.left ? `（還有 ${data.left} 顆）` : ""}</button></div>`);
    load();
  }
  /* 📖 學習年鑑 */
  async function yearbook() {
    const { data } = await db.from("learn_notes").select("day,subject,title,stage").eq("user_id", currentUser.id).order("day", { ascending: false });
    const by = {};
    (data || []).forEach(n => { const mo = n.day.slice(0, 7); ((by[mo] = by[mo] || {})[n.subject] = by[mo][n.subject] || []).push(n); });
    mk(`<div class="vg-title">📖 學習年鑑</div><p class="tb-note">每個月學過的標題，就是你自己寫的教科書目錄。⭐ = 已經熟記（複習間隔 30 天以上）。</p>
      <div class="gp-body">${Object.entries(by).map(([mo, subs]) => `<div class="ln-month"><h3>${mo.slice(0, 4)} 年 ${Number(mo.slice(5))} 月<small>${Object.values(subs).flat().length} 則</small></h3>
        ${Object.entries(subs).map(([s, ns]) => `<div class="ln-g"><b>${esc(s)}</b><ol>${ns.map(n => `<li>${esc(n.title)}${n.stage >= 5 ? " ⭐" : ""}</li>`).join("")}</ol></div>`).join("")}</div>`).join("") || "<p>還沒有紀錄</p>"}</div>
      <button type="button" class="btn" data-x="1" style="width:100%;margin-top:8px">關閉</button>`);
  }
  /* ⚡ 隨機抽考：每天一個隨機時間之後打開網站，跳出一則 7 天以前的標題，30 秒內回答 */
  function maybePop() {
    const X = L.x; if (!X || !X.pop || document.hidden) return;
    const k = "learnPop:" + L.d.today; try { if (localStorage.getItem(k)) return; } catch (_) { return; }
    if (new Date().getHours() < X.pop_hour || document.querySelector(".ln-popq")) return;
    try { localStorage.setItem(k, "1"); } catch (_) {}
    const n = X.pop; let left = 30;
    const m = mk(`<div class="ln-popq" style="text-align:center"><div class="vg-title">⚡ 突擊抽考！</div><div class="ln-timer">30</div>
      <div class="ln-card"><small>${esc(n.subject)}・${esc(n.day)} 學的</small><b>${esc(n.title)}</b><p class="ln-hint">還記得這是什麼嗎？</p></div>
      <div class="ln-grades" style="grid-template-columns:1fr 1fr"><button type="button" class="g0" data-pp="0">😵 忘了</button><button type="button" class="g2" data-pp="1">😊 記得</button></div></div>`);
    const tm = setInterval(() => { left -= 1; const el = m.querySelector(".ln-timer"); if (el) el.textContent = Math.max(0, left); if (left <= 0) { clearInterval(tm); answer(false, true); } }, 1000);
    async function answer(ok, timeout) {
      clearInterval(tm);
      await db.rpc("learn_pop", { p_id: n.id, p_ok: ok });
      m.querySelector(".ln-popq").innerHTML = `<div class="vg-title">${ok ? "😊 很好！✨+5" : timeout ? "⏰ 時間到" : "😵 沒關係"}</div><div class="ln-card open"><b>${esc(n.title)}</b><p>${n.note ? esc(n.note) : "（沒有寫重點）"}</p></div>
        <p class="tb-note">${ok ? "記得的東西不會被打擾。" : "明天會排回來讓你再複習。"}</p><button type="button" class="btn btn-primary" data-x="1" style="width:100%">好</button>`;
      load();
    }
    m.addEventListener("click", e => { const b = e.target.closest("[data-pp]"); if (b) answer(b.dataset.pp === "1"); });
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(maybePop, 1500); });

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-ln]");
    if (!b || !hasDb()) return;
    const a = b.dataset.ln;
    if (a === "subj") { L.subj = b.dataset.v; try { localStorage.setItem("learnSubj", L.subj); } catch (_) {} const keep = [document.getElementById("ln-title")?.value, document.getElementById("ln-note")?.value]; render(); document.getElementById("ln-title").value = keep[0] || ""; document.getElementById("ln-note").value = keep[1] || ""; return; }
    if (a === "newsubj") { const v = (prompt("新的科目名稱") || "").trim(); if (!v) return; L.subj = v.slice(0, 30); if (!L.d.subjects.includes(L.subj)) L.d.subjects.unshift(L.subj); render(); return; }
    if (a === "add") return add();
    if (a === "dream") { L.dreamOpen = true; return render(); }
    if (a === "dreamok") { await db.rpc("learn_dream_claim"); toast("🌅 早安！✨+5"); return load(); }
    if (a === "vq") { const v = document.getElementById("ln-vqa").value; const { error } = await db.rpc("learn_villager_answer", { p_text: v }); if (error) return toast(error.message); toast("📚 圖書館員：謝謝你！我懂了～（好感 +1、✨10）"); return load(); }
    if (a === "cap") return capsule();
    if (a === "book") return yearbook();
    if (a === "review") return review();
    if (a === "del") { if (!confirm("刪掉這則？")) return; const { data, error } = await db.rpc("learn_delete", { p_id: Number(b.dataset.id) }); if (error) return toast(error.message); L.d = data; render(); }
  });

  const st = document.createElement("style");
  st.textContent = `
    .ln-dream { padding: 10px; border-radius: 12px; background: linear-gradient(135deg, rgba(75,61,154,.35), rgba(20,26,58,.3)); margin-bottom: 8px; } .ln-dream p { font-size: 12.5px; opacity: .8; margin: 4px 0; }
    .ln-frag { font-size: 14px; padding: 4px 0; letter-spacing: 1px; } .ln-frag small { font-size: 11px; opacity: .6; margin-right: 6px; } .ln-frag em { display: block; font-size: 12px; opacity: .7; font-style: normal; letter-spacing: 0; }
    .ln-vq { display: flex; gap: 10px; padding: 10px; border-radius: 12px; background: rgba(255,213,74,.1); margin-bottom: 8px; font-size: 13px; } .ln-vq > div { flex: 1; }
    .ln-vq textarea, .ln-fey textarea { width: 100%; box-sizing: border-box; background: rgba(0,0,0,.2); color: inherit; border: 1px solid rgba(127,127,127,.35); border-radius: 10px; padding: 8px; font: inherit; margin: 6px 0; }
    .ln-vqf img, .ln-vqf { width: 44px; height: 44px; border-radius: 50%; flex: none; font-size: 30px; display: grid; place-items: center; }
    .ln-mons { margin-top: 10px; } .ln-mons > small { margin-left: 8px; font-size: 11.5px; opacity: .7; }
    .ln-mon { display: flex; gap: 8px; align-items: center; font-size: 13px; padding: 4px 0; } .ln-mon span { font-size: 22px; } .ln-mon small { display: block; font-size: 11px; opacity: .7; }
    .ln-mon.boss span { font-size: 28px; animation: moBob 1.4s ease-in-out infinite; }
    .ln-cap { width: 100%; margin-top: 8px; border: 1px solid #ffd54a; background: rgba(255,213,74,.12); color: inherit; border-radius: 12px; padding: 9px; font: inherit; cursor: pointer; }
    .ln-cm { position: absolute; right: 12px; top: 10px; font-size: 24px; } .ln-card { position: relative; }
    .ln-ai { display: block; width: 100%; margin-top: 8px; border: 1px dashed rgba(124,92,255,.6); background: rgba(124,92,255,.08); color: inherit; border-radius: 10px; padding: 8px; font: inherit; font-size: 12.5px; cursor: pointer; }
    .ln-ai.batch { margin: 0 0 8px; } .ln-aitip { display: block; font-size: 11px; opacity: .65; margin-top: 4px; }
    .ln-fey { margin-top: 10px; font-size: 13px; padding: 10px; border-radius: 12px; background: rgba(255,213,74,.1); }
    .ln-timer { font-size: 40px; font-weight: 900; color: #ffd54a; margin: 4px 0; }
    .ln-month h3 { margin: 12px 0 4px; } .ln-month h3 small { font-size: 12px; opacity: .6; margin-left: 8px; } .ln-month ol { margin: 4px 0 6px; padding-left: 22px; font-size: 13.5px; }
    .ln-pop { animation: cpPop .6s cubic-bezier(.2,1.6,.4,1); }
    .ln-rev { width: 100%; border: 1px solid #7c5cff; background: rgba(124,92,255,.15); color: inherit; border-radius: 12px; padding: 10px; font: inherit; font-size: 14px; cursor: pointer; margin-bottom: 6px; }
    .ln-g { margin: 8px 0; } .ln-g > b { font-size: 13px; color: #c08bff; }
    .ln-n { display: flex; gap: 6px; align-items: flex-start; font-size: 13.5px; padding: 2px 0; } .ln-n span { flex: 1; } .ln-n small { display: block; font-size: 11.5px; opacity: .65; margin-left: 12px; }
    .ln-n button { border: 0; background: none; color: inherit; opacity: .4; cursor: pointer; }
    .ln-add { margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(127,127,127,.3); }
    .ln-add input, .ln-add textarea { width: 100%; box-sizing: border-box; background: rgba(0,0,0,.2); color: inherit; border: 1px solid rgba(127,127,127,.35); border-radius: 10px; padding: 8px; font: inherit; margin: 4px 0; resize: vertical; }
    .ln-subs { display: flex; flex-wrap: wrap; gap: 4px; } .ln-subs button { border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; border-radius: 99px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
    .ln-subs button.on { background: #7c5cff; border-color: #7c5cff; color: #fff; }
    .ln-prog { display: flex; justify-content: space-between; font-size: 12px; opacity: .75; margin-bottom: 8px; } .ln-prog button { border: 0; background: none; color: inherit; cursor: pointer; }
    .ln-card { min-height: 180px; border-radius: 16px; padding: 18px; background: linear-gradient(160deg, #262c48, #1a1f36); border: 1px solid #3a4260; cursor: pointer; display: flex; flex-direction: column; justify-content: center; text-align: center; }
    .ln-card small { font-size: 12px; opacity: .65; } .ln-card b { font-size: 20px; margin: 8px 0; } .ln-card p { font-size: 14px; line-height: 1.6; margin: 6px 0 0; } .ln-card.open { cursor: default; border-color: #7c5cff; }
    .ln-hint { opacity: .6; font-size: 12.5px !important; }
    .ln-grades { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 10px; } .ln-grades button { border: 0; border-radius: 12px; padding: 10px 4px; font: inherit; font-size: 14px; cursor: pointer; color: #fff; }
    .ln-grades small { display: block; font-size: 11px; opacity: .85; } .ln-grades .g0 { background: #da3633; } .ln-grades .g1 { background: #d29922; } .ln-grades .g2 { background: #2ea043; }
  `;
  document.head.appendChild(st);

  (function boot(n) {
    if (!hasDb() || !document.querySelector('.page[data-page="today"]')) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; }
    load();
    setInterval(() => { if (!document.hidden) load(); }, 10 * 60 * 1000);
  })(0);
  window.LearnBox = { load, focus: () => { const t = document.getElementById("ln-title"); if (t) { t.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => t.focus(), 400); } } };
})();
