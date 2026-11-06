/* 序光計畫：🥚 習慣寵物蛋、🕳️ 黑洞模式、🔨 人生拍賣會、📡 季節雷達、👹 拖延捕手、📻 白噪音電台
   資料在 sql/2026-11-05_寵物蛋_黑洞_拍賣_雷達_怪物.sql（電台不用 SQL） */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const SQLF = "sql/2026-11-05_寵物蛋_黑洞_拍賣_雷達_怪物.sql";
  const ITEM = { stardust: "✨ 星屑", gacha_coin: "🪙 扭蛋幣", wish_rare: "💎 稀有星願瓶", wish_limited: "🌠 限定星願瓶", chest_gold: "🧰 金寶箱", chest_star: "✨ 星光寶箱" };
  const rw = o => Object.entries(o || {}).map(([k, v]) => `${ITEM[k] || k} ×${v}`).join("、");
  const need = e => /function|does not exist|schema cache/.test((e && e.message) || "") ? `資料庫還沒設定：到 Supabase 執行 ${SQLF}` : (e && e.message);
  const S = { eggs: null, mon: null };

  function modal(html, cls) {
    const m = document.createElement("div");
    m.className = "vg-modal";
    m.innerHTML = `<div class="vg-card ${cls || ""}">${html}</div>`;
    m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-vx]")) m.remove(); });
    document.body.appendChild(m);
    return m;
  }
  function slot(id) {
    const ref = document.getElementById("de-today") || document.getElementById("fn-today");
    if (!ref) return null;
    let box = document.getElementById(id);
    if (!box) { box = document.createElement("div"); box.id = id; box.className = "card"; ref.before(box); }
    return box;
  }

  /* ========== 工具列：黑洞／拍賣會／寵物蛋 ========== */
  function renderBar() {
    /* 🕳️ 黑洞：今日頁最上面一條醒目的橫幅（可以長按拖去別的位置） */
    const tp = document.querySelector('.page[data-page="today"]');
    let bh = document.getElementById("bh-bar");
    /* 第一次改版：把舊的位置忘掉，放到最上面 */
    try { if (!localStorage.getItem("bhBanner1")) { const k = "todayOrder", o = JSON.parse(localStorage.getItem(k) || "[]"); localStorage.setItem(k, JSON.stringify(["bh-bar"].concat(o.filter(x => x !== "bh-bar")))); localStorage.setItem("bhBanner1", "1"); } } catch (_) {}
    if (tp && !bh) {
      bh = document.createElement("section");
      bh.id = "bh-bar";
      const title = tp.querySelector(":scope > .page-title");
      title ? title.after(bh) : tp.prepend(bh);
    }
    if (bh) {
      bh.className = "card bh-banner";
      bh.innerHTML = `<button type="button" data-bh="enter" class="bh-go"><span class="bh-hole sm"></span><span><b>進入黑洞模式</b><small>其他東西全部藏起來，只剩今天最重要的事和專注</small></span><i>›</i></button>`;
    }
    /* 🔨🥚 拍賣會和寵物蛋：放進今日小抽屜 */
    const ae = slot("ae-today");
    if (ae) {
      const sat = [6, 0].includes(new Date(Date.now() - 6 * 3600e3).getDay());
      ae.className = "card bh-tools";
      ae.innerHTML = `<button type="button" data-bh="auction" class="${sat ? "hot" : ""}">🔨<b>拍賣會${sat ? "・開放中" : ""}</b></button><button type="button" data-bh="eggs">🥚<b>寵物蛋</b></button>`;
    }
    /* 專注卡的按鈕旁邊也放一顆 */
    const fb = document.getElementById("focus-buttons");
    if (fb && !document.getElementById("bh-focus-btn")) {
      const b = document.createElement("button");
      b.type = "button"; b.id = "bh-focus-btn"; b.className = "btn btn-small"; b.dataset.bh = "enter"; b.textContent = "🕳️ 黑洞";
      fb.appendChild(b);
    }
  }

  /* ========== 🥚 習慣寵物蛋 ========== */
  async function loadEggs() {
    const { data, error } = await db.rpc("egg_status");
    S.eggs = error ? null : data;
    renderEggs();
  }
  const eggPct = e => Math.min(100, Math.round(e.streak / 21 * 100));
  function eggIcon(e, pets) {
    if (e.pet) return (pets.find(p => p.k === e.pet) || {}).emoji || "🐣";
    const f = e.cold ? "egg_cold" : e.done_today || e.streak >= 14 ? "egg_warm" : "egg", em = e.cold ? "🧊" : e.streak >= 14 ? "🐣" : "🥚";
    return `<img class="egg-img" src="img/pet/${f}.webp" alt="" onerror="this.replaceWith(document.createTextNode('${em}'))">`;
  }
  function renderEggs() {
    const box = slot("eg-today");
    if (!box) return;
    const eggs = S.eggs ? S.eggs.eggs.filter(e => !e.pet) : [];
    box.hidden = !eggs.length;
    if (box.hidden) return;
    box.className = "card eg-card";
    box.innerHTML = `<div class="vg-h"><b>🥚 習慣孵化中</b><small>連續 21 天孵出寵物</small></div>${eggs.map(e => `<div class="eg-row ${e.cold ? "cold" : ""}">
      <span class="eg-ic ${e.done_today ? "warm" : ""}">${eggIcon(e, S.eggs.pets)}</span><div class="eg-b"><b>${esc(e.habit)}</b>
      <div class="eg-bar"><i style="width:${eggPct(e)}%"></i></div><small>${e.cold ? "🧊 蛋變冷了，今天打卡重新暖起來（不會死）" : `連續 ${e.streak}/21 天`}</small></div>
      ${e.done_today ? `<span class="eg-ok">✅</span>` : `<button type="button" class="btn btn-small btn-primary" data-eg="check" data-id="${e.id}">做到了</button>`}</div>`).join("")}`;
  }
  function openEggs() {
    const d = S.eggs;
    if (!d) return toast("寵物蛋" + need({ message: "function" }));
    const pets = d.eggs.filter(e => e.pet);
    const m = modal(`<div class="vg-title">🥚 習慣寵物蛋</div><p class="vg-note">選一個想養成的新習慣，每天做到就按一下。連續 21 天孵出寵物（✨ 200＋星光寶箱）。中斷的話蛋會變冷、天數歸零，但蛋不會死，隨時可以重新暖起來。最多同時孵 3 顆。</p>
      <div class="tm-own"><input id="eg-new" maxlength="40" placeholder="例如：每天背 10 個單字"><button type="button" class="btn btn-small btn-primary" data-eg="new">放一顆蛋</button></div>
      ${d.eggs.filter(e => !e.pet).map(e => `<div class="eg-row"><span class="eg-ic">${eggIcon(e, d.pets)}</span><div class="eg-b"><b>${esc(e.habit)}</b><small>連續 ${e.streak} 天・最佳 ${e.best}・總共 ${e.total} 天・變冷過 ${e.colds} 次</small></div><button type="button" class="btn btn-small" data-eg="drop" data-id="${e.id}">放棄</button></div>`).join("")}
      <div class="vg-sec">🐾 孵出來的寵物（${pets.length}/${d.pets.length}）</div>
      <div class="cp-grid">${d.pets.map(p => { const e = pets.find(x => x.pet === p.k);
        return `<div class="cp-fig ${e ? "on" : ""}" style="--c:#ffd54a"><span>${e ? `<img class="pet-img" src="img/pet/${p.k}.webp" alt="" onerror="this.replaceWith(document.createTextNode('${p.emoji}'))">` : "❔"}</span><b>${e ? esc(p.name) : "？？？"}</b><small>${e ? esc(e.habit) : ""}</small></div>`; }).join("")}</div>
      <button type="button" class="btn btn-primary" data-vx="1" style="width:100%;margin-top:10px">關閉</button>`);
    m.dataset.eggs = "1";
  }

  /* ========== 🕳️ 黑洞模式 ========== */
  const BH = { on: false, start: 0, tick: null, home: null };
  async function enterHole() {
    const { data, error } = await db.rpc("blackhole_start");
    if (error) return toast(need(error));
    const card = document.getElementById("focus-card");
    let top = null;
    try { const r = await db.rpc("top_task_today"); top = r.data; } catch (_) {}
    const ov = document.createElement("div");
    ov.id = "bh-ov";
    ov.innerHTML = `<div class="bh-stars"></div><div class="bh-in"><div class="bh-head"><span class="bh-hole"></span><div><b>黑洞模式</b><small>其他東西都被吸走了。待滿 30 分鐘（而且一半以上在專注）就能帶寶物回來。</small></div></div>
      <div class="bh-time">00:00</div>
      <div class="bh-top" id="bh-cur"></div>
      <div class="bh-slot"></div><button type="button" class="btn bh-out" data-bh="exit">🚀 離開黑洞</button></div>`;
    document.body.appendChild(ov);
    renderCur(top);
    if (card) { BH.home = document.createComment("focus-card-home"); card.before(BH.home); ov.querySelector(".bh-slot").appendChild(card); }
    document.body.classList.add("bh-lock");
    BH.on = true; BH.start = new Date(data.started_at).getTime();
    const tick = () => { const s = Math.max(0, Math.floor((Date.now() - BH.start) / 1000)); ov.querySelector(".bh-time").textContent = `${String(Math.floor(s / 3600)).padStart(1, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; ov.querySelector(".bh-hole").style.transform = `scale(${1 + Math.min(s / 10800, 1) * .6})`; };
    tick(); BH.tick = setInterval(tick, 1000);
    try { localStorage.setItem("blackholeOn", "1"); } catch (_) {}
  }
  /* 🎯 黑洞裡「正在專注的項目」：從今天的任務挑，完成後直接換下一個 */
  const CUR_KEY = "bhCurrent";
  const getCur = () => { try { return JSON.parse(localStorage.getItem(CUR_KEY) || "null"); } catch (_) { return null; } };
  const setCur = v => { try { v ? localStorage.setItem(CUR_KEY, JSON.stringify(v)) : localStorage.removeItem(CUR_KEY); } catch (_) {} };
  async function todayTasks() {
    const day = typeof appDateOf === "function" ? appDateOf(Date.now()) : new Date(Date.now() - 6 * 3600e3).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
    const { data } = await db.from("tasks").select("id,title,completed,skipped,task_date").eq("user_id", currentUser.id).eq("task_date", day).order("id");
    return (data || []).filter(t => !t.skipped);
  }
  async function renderCur(top) {
    const box = document.getElementById("bh-cur");
    if (!box) return;
    let cur = getCur();
    const tasks = await todayTasks(), open = tasks.filter(t => !t.completed);
    if (cur && cur.id && !open.some(t => t.id === cur.id)) cur = null;
    if (!cur && top && top.task_id && open.some(t => t.id === top.task_id)) cur = { id: top.task_id, title: top.title };
    if (!cur && open.length) cur = { id: open[0].id, title: open[0].title };
    setCur(cur);
    const done = tasks.length - open.length;
    box.innerHTML = cur
      ? `🎯 正在專注<b>${esc(cur.title)}</b><div class="bh-cbtn"><button type="button" class="btn btn-small btn-primary" data-bhc="done">✅ 完成，換下一個</button><button type="button" class="btn btn-small" data-bhc="pick">🔄 換一個</button></div><small>今天的任務 ${done}/${tasks.length} 完成</small>`
      : `🎯 正在專注<b>${tasks.length ? "今天的任務全部完成了！🎉" : "今天還沒有任務"}</b><small>可以繼續留在黑洞專注，或到任務頁新增</small>`;
  }
  async function pickCur() {
    const open = (await todayTasks()).filter(t => !t.completed), cur = getCur();
    const box = document.getElementById("bh-cur");
    if (!box) return;
    box.innerHTML = `🎯 選下一個要專注的任務<div class="bh-pick">${open.map(t => `<button type="button" class="${cur && cur.id === t.id ? "on" : ""}" data-bhp="${t.id}">${esc(t.title)}</button>`).join("") || "<small>沒有未完成的任務</small>"}</div><button type="button" class="btn btn-small" data-bhc="back">取消</button>`;
    box._open = open;
  }
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-bhc],[data-bhp]");
    if (!b || !document.getElementById("bh-cur")) return;
    if (b.dataset.bhp) { const t = (document.getElementById("bh-cur")._open || []).find(x => x.id === Number(b.dataset.bhp)); if (t) setCur({ id: t.id, title: t.title }); return renderCur(); }
    if (b.dataset.bhc === "pick") return pickCur();
    if (b.dataset.bhc === "back") return renderCur();
    if (b.dataset.bhc === "done") {
      const cur = getCur();
      if (!cur) return;
      b.disabled = true;
      try { await window.toggleTask(cur.id, true); } catch (err) { b.disabled = false; return toast(err.message || "完成失敗"); }
      setCur(null);
      toast(`✅ 完成「${cur.title}」`);
      const open = (await todayTasks()).filter(t => !t.completed);
      return open.length ? pickCur() : renderCur();
    }
  });

  async function exitHole() {
    const min = Math.floor((Date.now() - BH.start) / 60000);
    if (min < 30 && !confirm(`才待了 ${min} 分鐘，現在離開不會帶回寶物。確定要離開嗎？`)) return;
    const { data, error } = await db.rpc("blackhole_end");
    clearInterval(BH.tick);
    const ov = document.getElementById("bh-ov"), card = document.getElementById("focus-card");
    if (card && BH.home) { BH.home.replaceWith(card); BH.home = null; }
    if (ov) ov.remove();
    document.body.classList.remove("bh-lock");
    BH.on = false;
    try { localStorage.removeItem("blackholeOn"); } catch (_) {}
    if (error) return toast(error.message);
    const T = { deep: ["🌌", "深淵核心"], mid: ["🪐", "事件視界"], edge: ["☄️", "黑洞邊緣"] }, t = T[data.tier];
    modal(t ? `<div class="bh-loot"><div class="bh-big">${t[0]}</div><div class="vg-title">從${t[1]}帶回的寶物</div><p>在黑洞裡待了 <b>${data.minutes}</b> 分鐘，專注 <b>${data.focus_min}</b> 分鐘</p><p class="bh-items">${rw(data.loot)}</p><small>第 ${data.runs} 次成功歸來</small></div><button type="button" class="btn btn-primary" data-vx="1" style="width:100%">收下</button>`
      : `<div class="bh-loot"><div class="bh-big">🕳️</div><div class="vg-title">空手回來了</div><p>待了 ${data.minutes} 分鐘、專注 ${data.focus_min} 分鐘。要待滿 30 分鐘、而且一半以上時間在專注，才能帶回寶物。</p></div><button type="button" class="btn btn-primary" data-vx="1" style="width:100%">下次再來</button>`);
  }

  /* ========== 🔨 人生拍賣會 ========== */
  async function openAuction() {
    const { data, error } = await db.rpc("auction_status");
    if (error) return toast(need(error));
    showAuction(data);
  }
  function showAuction(d) {
    document.querySelectorAll(".au-modal").forEach(x => x.closest(".vg-modal").remove());
    const m = modal(`<div class="vg-title">🔨 人生拍賣會</div>
      <p class="vg-note">${d.open ? "🟢 開放中！用這週賺的星屑把現實獎勵買下來。" : `🔒 週六、週日才開（還有 ${d.opens_in} 天）。先把想要的獎勵登記好，平日努力賺星屑。`}同一件獎勵這週每多買一次，價格 ×1.5。</p>
      <div class="au-wallet">✨ 星屑 <b>${d.stardust}</b><small>累計花掉 ${d.spent}</small></div>
      <div class="vg-sec">🏷️ 拍賣品</div>
      ${d.items.map(i => `<div class="au-item"><span class="au-emo">${esc(i.emoji)}</span><div class="eg-b"><b>${esc(i.title)}</b><small>${i.price !== i.base ? `<s>${i.base}</s> ` : ""}✨ ${i.price}・這週 ${i.bought}/${i.limit}</small></div>
        <button type="button" class="btn btn-small ${d.open ? "btn-primary" : ""}" data-au="buy" data-id="${i.id}" ${!d.open || i.bought >= i.limit || d.stardust < i.price ? "disabled" : ""}>得標</button><button type="button" class="au-del" data-au="del" data-id="${i.id}">✕</button></div>`).join("") || `<p class="tm-none">還沒有拍賣品，先在下面登記</p>`}
      <div class="au-add"><input id="au-emo" maxlength="4" placeholder="📺"><input id="au-t" maxlength="40" placeholder="獎勵，例如：看一集劇"><input id="au-p" type="number" min="10" placeholder="價格"><select id="au-l"><option value="1">每週 1 次</option><option value="2">每週 2 次</option><option value="3">每週 3 次</option><option value="7">不限</option></select><button type="button" class="btn btn-small btn-primary" data-au="add">登記</button></div>
      <p class="vg-note">💡 參考：每天專注、打卡、委託大概可賺 50～150 星屑。一杯手搖可以訂 150、一集劇 100、一整個下午的遊戲 400。</p>
      ${d.wins.length ? `<div class="vg-sec">🎫 得標的獎勵券</div>${d.wins.map(w => `<div class="au-item ${w.used ? "used" : ""}"><span class="au-emo">${esc(w.emoji)}</span><div class="eg-b"><b>${esc(w.title)}</b><small>✨ ${w.price}${w.used ? "・已使用" : ""}</small></div>${w.used ? "" : `<button type="button" class="btn btn-small" data-au="use" data-id="${w.id}">使用</button>`}</div>`).join("")}` : ""}
      <button type="button" class="btn btn-primary" data-vx="1" style="width:100%;margin-top:10px">關閉</button>`, "au-modal");
    m.addEventListener("click", async e => {
      const b = e.target.closest("[data-au]");
      if (!b) return;
      const id = Number(b.dataset.id);
      let r;
      if (b.dataset.au === "add") {
        const t = m.querySelector("#au-t").value.trim(), p = Number(m.querySelector("#au-p").value);
        if (!t || !(p >= 10)) return toast("請填獎勵名稱和價格（至少 10）");
        r = await db.rpc("auction_item_save", { p_id: null, p_title: t, p_emoji: m.querySelector("#au-emo").value, p_price: p, p_limit: Number(m.querySelector("#au-l").value) });
      } else if (b.dataset.au === "del") { if (!confirm("刪掉這件拍賣品？")) return; r = await db.rpc("auction_item_del", { p_id: id }); }
      else if (b.dataset.au === "buy") { r = await db.rpc("auction_buy", { p_id: id }); if (!r.error) toast("🔨 得標！記得真的去享受它"); }
      else if (b.dataset.au === "use") r = await db.rpc("auction_use", { p_id: id });
      if (r.error) return toast(r.error.message);
      showAuction(r.data);
    });
  }

  /* ========== 👹 拖延捕手 ========== */
  async function loadMon() {
    const { data, error } = await db.rpc("monster_list");
    S.mon = error ? null : data;
    renderMon();
  }
  const MON = ["👹", "👺", "🧌", "🐲", "👾"];
  function renderMon() {
    const box = slot("mo-today");
    if (!box) return;
    const ms = S.mon ? S.mon.monsters : [];
    box.hidden = !ms.length;
    if (box.hidden) return;
    box.className = "card mo-card";
    box.innerHTML = `<div class="vg-h"><b>👹 頑固怪物出沒</b><small>已打倒 ${S.mon.slain} 隻</small></div><p class="vg-note">這些任務被拖了 3 天以上。完成它就打倒怪物：經驗和金幣雙倍，再加星屑和金寶箱。</p>
      ${ms.map(t => { const hp = Math.min(100, t.days * 10);
        return `<div class="mo-row"><span class="mo-ic"><img class="mo-img" src="img/monster/m${t.id % 5}.webp" alt="" onerror="this.replaceWith(document.createTextNode('${MON[t.id % MON.length]}'))"></span><div class="eg-b"><b>${esc(t.title)}</b><div class="mo-hp"><i style="width:${hp}%"></i></div><small>拖了 ${t.days} 天・掉落 ✨ ${30 + 10 * Math.min(t.days, 14)}</small></div></div>`; }).join("")}`;
  }
  function wrapToggle() {
    if (typeof window.toggleTask !== "function" || window.toggleTask.__mon) return;
    const orig = window.toggleTask;
    const wrapped = async function (taskId, completed, checkbox) {
      const isMon = completed && S.mon && S.mon.monsters.some(m => m.id === Number(taskId));
      const r = await orig.apply(this, arguments);
      if (isMon) {
        const { data } = await db.rpc("monster_slay", { p_task_id: Number(taskId) });
        if (data && data.ok) {
          modal(`<div class="bh-loot"><div class="bh-big mo-die">👹</div><div class="vg-title">⚔️ 打倒頑固怪物！</div><p>「${esc(data.title)}」被拖了 ${data.days} 天，終於解決了</p>
            <p class="bh-items">✨ 星屑 ×${data.stardust}、🧰 金寶箱 ×1${data.exp ? `、雙倍經驗 +${data.exp}` : ""}${data.gold ? `、雙倍金幣 +${data.gold}` : ""}</p></div><button type="button" class="btn btn-primary" data-vx="1" style="width:100%">太爽了</button>`);
          if (typeof loadPlayer === "function") loadPlayer();
        }
        loadMon();
      }
      return r;
    };
    wrapped.__mon = true;
    window.toggleTask = wrapped;
  }

  /* ========== 📡 季節雷達（📊 回顧分頁） ========== */
  const DOMS = [["sleep", "🛏️ 作息"], ["care", "🧴 保養"], ["health", "💧 健康"], ["food", "🍱 飲食"], ["life", "🧹 生活"], ["weekly", "📅 每週"]];
  const COL = ["#6e7681", "#58a6ff", "#a371f7", "#ffd54a"];
  const RD = { data: null };
  function radarHtml(rerender) {
    if (!RD.data) { db.rpc("life_seasons").then(({ data, error }) => { RD.data = error ? { err: need(error) } : data; rerender(); }); return `<div class="ov-empty">載入中…</div>`; }
    if (RD.data.err) return `<p class="ov-note">⚠️ ${esc(RD.data.err)}</p>`;
    const ss = RD.data.seasons, C = 150, R = 105, n = DOMS.length;
    const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n, r = R * (v || 0) / 100; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
    let svg = `<svg viewBox="0 0 300 300" class="rd-svg">`;
    for (const lv of [25, 50, 75, 100]) svg += `<polygon points="${DOMS.map((_, i) => pt(i, lv).join(",")).join(" ")}" fill="none" stroke="rgba(150,160,200,.25)"/>`;
    DOMS.forEach(([k, l], i) => { const [x, y] = pt(i, 100), [lx, ly] = pt(i, 122); svg += `<line x1="${C}" y1="${C}" x2="${x}" y2="${y}" stroke="rgba(150,160,200,.2)"/><text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="currentColor">${l}</text>`; });
    ss.forEach((s, j) => { if (DOMS.every(([k]) => s[k] == null)) return; const last = j === ss.length - 1;
      svg += `<polygon points="${DOMS.map(([k], i) => pt(i, s[k]).join(",")).join(" ")}" fill="${COL[j]}" fill-opacity="${last ? .3 : .08}" stroke="${COL[j]}" stroke-width="${last ? 2.5 : 1.5}" ${last ? "" : `stroke-dasharray="4 3"`}/>`; });
    svg += `</svg>`;
    const cur = ss[ss.length - 1], prev = [...ss].reverse().slice(1).find(s => DOMS.some(([k]) => s[k] != null));
    const grow = DOMS.map(([k, l]) => ({ l, v: cur[k], d: prev && cur[k] != null && prev[k] != null ? cur[k] - prev[k] : null }));
    return `<p class="ov-note">每一季六個領域的平均完成度疊在一起，最亮的是這一季，虛線是以前的季節。</p>${svg}
      <div class="rd-leg">${ss.map((s, j) => `<span><i style="background:${COL[j]}"></i>${s.label}</span>`).join("")}</div>
      <div class="rd-rows">${grow.map(g => `<div><span>${g.l}</span><b>${g.v == null ? "—" : g.v + "%"}</b><small class="${g.d > 0 ? "up" : g.d < 0 ? "down" : ""}">${g.d == null ? (prev ? "" : "第一季") : (g.d > 0 ? "▲ " : g.d < 0 ? "▼ " : "") + Math.abs(g.d)}</small></div>`).join("")}</div>
      ${prev ? "" : `<p class="ov-note">生活打卡從這一季才開始，下一季就能看到跟現在比長大多少。</p>`}`;
  }

  /* ========== 📻 白噪音電台 ========== */
  const RADIO = [
    { k: "rain", n: "🌧️ 雨聲", h: 0 }, { k: "wave", n: "🌊 海浪", h: 5 }, { k: "fire", n: "🔥 壁爐", h: 15 },
    { k: "cafe", n: "☕ 咖啡廳", h: 30 }, { k: "wind", n: "🌲 森林風", h: 50 }, { k: "space", n: "🌌 宇宙低鳴", h: 100 }];
  const RA = { ctx: null, nodes: [], cur: null, hours: 0, vol: .5 };
  function noise(ctx, type) {
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === "brown") { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
      else if (type === "pink") { b0 = .997 * b0 + w * .029; b1 = .985 * b1 + w * .032; b2 = .95 * b2 + w * .048; d[i] = (b0 + b1 + b2 + w * .02) * .9; }
      else d[i] = w * .5;
    }
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; return s;
  }
  function radioStop() { RA.nodes.forEach(n => { try { n.stop ? n.stop() : n.disconnect(); } catch (_) {} }); RA.nodes = []; RA.cur = null; clearInterval(RA.iv); renderRadio(); }
  function radioPlay(k) {
    radioStop();
    const ctx = RA.ctx || (RA.ctx = new (window.AudioContext || window.webkitAudioContext)());
    ctx.resume();
    const out = ctx.createGain(); out.gain.value = RA.vol; out.connect(ctx.destination); RA.out = out; RA.nodes.push(out);
    const add = (type, ft, f, q, g) => { const s = noise(ctx, type), fl = ctx.createBiquadFilter(), gn = ctx.createGain(); fl.type = ft; fl.frequency.value = f; fl.Q.value = q || 1; gn.gain.value = g; s.connect(fl).connect(gn).connect(out); s.start(); RA.nodes.push(s); return gn; };
    const lfo = (param, rate, depth) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g).connect(param); o.start(); RA.nodes.push(o); };
    const blips = (fn, every) => { RA.iv = setInterval(() => { if (Math.random() < .6) fn(); }, every); };
    const pop = (f, dur, g) => { const o = noise(ctx, "white"), fl = ctx.createBiquadFilter(), e = ctx.createGain(); fl.type = "bandpass"; fl.frequency.value = f; fl.Q.value = 3; const t = ctx.currentTime; e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(fl).connect(e).connect(out); o.start(t); o.stop(t + dur + .05); };
    if (k === "rain") { add("pink", "lowpass", 2600, .7, .9); add("white", "highpass", 5000, .5, .08); blips(() => pop(3000 + Math.random() * 3000, .04, .25), 70); }
    if (k === "wave") { const g = add("brown", "lowpass", 900, .7, .8); g.gain.value = .5; lfo(g.gain, .09, .45); add("pink", "highpass", 1800, .5, .05); }
    if (k === "fire") { add("brown", "lowpass", 500, .7, .9); blips(() => pop(1200 + Math.random() * 2500, .02 + Math.random() * .05, .6), 110); }
    if (k === "cafe") { add("pink", "bandpass", 500, .6, .9); const g = add("brown", "bandpass", 300, 1.5, .5); lfo(g.gain, .3, .2); blips(() => pop(4000 + Math.random() * 2000, .12, .08), 1500); }
    if (k === "wind") { const g = add("pink", "bandpass", 700, .8, .7); lfo(g.gain, .06, .4); blips(() => pop(2500 + Math.random() * 1000, .08, .06), 400); }
    if (k === "space") { add("brown", "lowpass", 160, 2, 1.2); [55, 82.5].forEach(f => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.value = .05; o.connect(g).connect(out); o.start(); RA.nodes.push(o); lfo(g.gain, .05, .04); }); }
    RA.cur = k;
    try { localStorage.setItem("radioStation", k); } catch (_) {}
    renderRadio();
  }
  async function loadHours() {
    const { data } = await db.from("focus_sessions").select("duration_seconds").eq("user_id", currentUser.id);
    RA.hours = Math.floor((data || []).reduce((a, r) => a + (r.duration_seconds || 0), 0) / 3600);
    renderRadio();
  }
  function renderRadio() {
    const card = document.getElementById("focus-card");
    if (!card) return;
    let box = document.getElementById("ra-box");
    if (!box) { box = document.createElement("div"); box.id = "ra-box"; card.appendChild(box); }
    box.innerHTML = `<div class="ra-h">📻 白噪音電台<small>累積專注 ${RA.hours} 小時</small>${RA.cur ? `<input type="range" min="0" max="1" step=".05" value="${RA.vol}" data-ra="vol" aria-label="音量">` : ""}</div>
      <div class="ra-list">${RADIO.map(r => RA.hours >= r.h ? `<button type="button" class="${RA.cur === r.k ? "on" : ""}" data-ra="${r.k}">${r.n}</button>` : `<button type="button" disabled title="專注滿 ${r.h} 小時解鎖">🔒 ${r.h}h</button>`).join("")}</div>`;
  }

  /* ---------- 點擊 ---------- */
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-bh],[data-eg],[data-ra]");
    if (!b || !hasDb()) return;
    const a = b.dataset.bh;
    if (a === "enter") return enterHole();
    if (a === "exit") return exitHole();
    if (a === "auction") return openAuction();
    if (a === "eggs") { await loadEggs(); return openEggs(); }
    if (b.dataset.ra) { if (b.dataset.ra === "vol") return; return RA.cur === b.dataset.ra ? radioStop() : radioPlay(b.dataset.ra); }
    if (b.dataset.eg) {
      const md = b.closest(".vg-modal"), id = Number(b.dataset.id);
      let r;
      if (b.dataset.eg === "check") { b.disabled = true; r = await db.rpc("egg_check", { p_id: id }); }
      if (b.dataset.eg === "new") { const v = md.querySelector("#eg-new").value.trim(); if (!v) return; r = await db.rpc("egg_start", { p_habit: v }); }
      if (b.dataset.eg === "drop") { if (!confirm("放棄這顆蛋？")) return; r = await db.rpc("egg_drop", { p_id: id }); }
      if (r.error) { b.disabled = false; return toast(need(r.error)); }
      S.eggs = r.data; renderEggs();
      if (md) { md.remove(); openEggs(); }
      if (r.data.hatched) { const p = r.data.hatched;
        modal(`<div class="bh-loot"><div class="bh-big eg-hatch"><img class="pet-img" src="img/pet/${p.k}.webp" alt="" onerror="this.replaceWith(document.createTextNode('${p.emoji}'))"></div><div class="vg-title">🎉 蛋孵出來了！</div><p>連續 21 天，你養成了一個習慣，也得到了「${esc(p.name)}」</p><p class="bh-items">✨ 星屑 ×200、✨ 星光寶箱 ×1</p></div><button type="button" class="btn btn-primary" data-vx="1" style="width:100%">歡迎回家</button>`);
      } else if (b.dataset.eg === "check") toast("🥚 蛋暖了一點 ✨ +5");
    }
  });
  document.addEventListener("input", e => { if (e.target.dataset && e.target.dataset.ra === "vol") { RA.vol = Number(e.target.value); if (RA.out) RA.out.gain.value = RA.vol; } });

  const st = document.createElement("style");
  st.textContent = `
    .bh-banner { padding: 0 !important; overflow: hidden; background: radial-gradient(circle at 12% 50%, #3a2a7a, #0b0820 70%) !important; color: #eef; border: 1px solid rgba(124,92,255,.5); }
    .bh-go { display: flex; align-items: center; gap: 14px; width: 100%; border: 0; background: none; color: inherit; padding: 14px 16px; text-align: left; cursor: pointer; font: inherit; }
    .bh-go b { display: block; font-size: 16px; } .bh-go small { display: block; font-size: 12px; opacity: .75; } .bh-go i { margin-left: auto; font-style: normal; font-size: 26px; opacity: .6; }
    .bh-hole.sm { width: 40px; height: 40px; }
    #bh-focus-btn { background: #1a1040; color: #eef; border-color: #7c5cff; }
    .bh-tools { display: flex; gap: 8px; padding: 10px !important; }
    .bh-tools button { flex: 1; border: 0; border-radius: 12px; padding: 10px 4px; background: rgba(127,127,160,.12); color: inherit; font-size: 22px; cursor: pointer; }
    .bh-tools button b { display: block; font-size: 12px; margin-top: 2px; } .bh-tools button.hot { background: linear-gradient(135deg, rgba(255,213,74,.35), rgba(255,138,101,.3)); }
    .eg-row, .au-item, .mo-row { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid rgba(127,127,127,.18); }
    .eg-b { flex: 1; min-width: 0; } .eg-b small { display: block; font-size: 11.5px; opacity: .75; }
    .eg-ic { font-size: 30px; } .eg-ic.warm { filter: drop-shadow(0 0 8px #ffb347); } .eg-row.cold .eg-ic { filter: hue-rotate(160deg); }
    .eg-bar, .mo-hp { height: 7px; border-radius: 9px; background: rgba(127,127,127,.2); overflow: hidden; margin: 4px 0; }
    .eg-bar i { display: block; height: 100%; background: linear-gradient(90deg, #ffd54a, #ff8a65); } .mo-hp i { display: block; height: 100%; background: linear-gradient(90deg, #f85149, #a40e26); }
    .eg-ok { font-size: 20px; } .egg-img { width: 46px; height: 46px; object-fit: cover; border-radius: 10px; display: block; } .mo-img { width: 48px; height: 48px; object-fit: cover; border-radius: 10px; display: block; } .eg-row.cold .eg-ic .egg-img { filter: none; } .pet-img { width: 100%; aspect-ratio: 3/4; object-fit: cover; border-radius: 8px; display: block; } .eg-hatch .pet-img { width: 160px; margin: 0 auto; border-radius: 14px; box-shadow: 0 0 30px #ffd54a; } .eg-hatch { animation: cpPop .8s cubic-bezier(.2,1.6,.4,1); }
    .mo-card { border: 1px solid rgba(248,81,73,.45); background: linear-gradient(135deg, rgba(248,81,73,.13), transparent); }
    .mo-ic { font-size: 30px; animation: moBob 1.4s ease-in-out infinite; } @keyframes moBob { 50% { transform: translateY(-4px) rotate(-6deg); } }
    .mo-die { animation: moDie 1.2s forwards; } @keyframes moDie { 60% { transform: scale(1.3) rotate(20deg); } to { transform: scale(0) rotate(200deg); opacity: 0; } }
    .bh-loot { text-align: center; } .bh-big { font-size: 72px; } .bh-items { font-weight: 800; color: #ffd166; }
    body.bh-lock { overflow: hidden; }
    #bh-ov { position: fixed; inset: 0; z-index: 9990; background: radial-gradient(circle at 50% 30%, #1a1040, #05030d 70%); color: #eef; overflow-y: auto; }
    .bh-stars { position: fixed; inset: 0; background-image: radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 60%, #fff, transparent), radial-gradient(1.5px 1.5px at 40% 80%, #cbd, transparent), radial-gradient(1px 1px at 85% 20%, #fff, transparent); opacity: .6; pointer-events: none; }
    .bh-in { position: relative; max-width: 560px; margin: 0 auto; padding: 18px 16px 40px; }
    .bh-head { display: flex; gap: 12px; align-items: center; } .bh-head small { display: block; font-size: 12px; opacity: .7; } .bh-head b { font-size: 18px; }
    .bh-hole { width: 46px; height: 46px; flex: none; border-radius: 50%; background: radial-gradient(circle, #000 45%, #7c5cff 62%, #ff9ec7 70%, transparent 74%); animation: bhSpin 6s linear infinite; transition: transform 2s; }
    @keyframes bhSpin { to { rotate: 360deg; } }
    .bh-time { font-size: 44px; font-weight: 900; text-align: center; margin: 14px 0 6px; font-variant-numeric: tabular-nums; letter-spacing: 2px; }
    .bh-top { text-align: center; padding: 12px; border-radius: 14px; background: rgba(255,213,74,.12); border: 1px solid rgba(255,213,74,.35); margin-bottom: 14px; font-size: 12.5px; } .bh-top b { display: block; font-size: 18px; margin-top: 4px; } .bh-top small { display: block; margin-top: 6px; opacity: .65; }
    .bh-cbtn { display: flex; gap: 6px; justify-content: center; margin-top: 10px; }
    .bh-pick { display: flex; flex-direction: column; gap: 6px; margin: 10px 0; } .bh-pick button { border: 1px solid rgba(255,213,74,.35); background: rgba(255,255,255,.04); color: inherit; border-radius: 10px; padding: 9px; font: inherit; font-size: 14px; cursor: pointer; text-align: left; } .bh-pick button.on { border-color: #ffd54a; background: rgba(255,213,74,.15); }
    .bh-slot #focus-card { margin: 0; } .bh-out { display: block; margin: 18px auto 0; }
    .au-wallet { padding: 10px; border-radius: 12px; background: rgba(255,213,74,.12); font-size: 14px; } .au-wallet b { font-size: 20px; margin: 0 6px; } .au-wallet small { opacity: .7; float: right; }
    .au-emo { font-size: 26px; } .au-item.used { opacity: .45; } .au-del { border: 0; background: none; color: inherit; opacity: .5; cursor: pointer; }
    .au-add { display: grid; grid-template-columns: 50px 1fr 70px; gap: 4px; margin-top: 8px; } .au-add select, .au-add button { grid-column: span 3; }
    .rd-svg { width: 100%; max-width: 360px; display: block; margin: 0 auto; color: inherit; }
    .rd-leg { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; font-size: 12px; } .rd-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; }
    .rd-rows { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 6px; margin-top: 10px; } .rd-rows div { background: rgba(127,127,127,.1); border-radius: 10px; padding: 6px; text-align: center; font-size: 12px; }
    .rd-rows b { display: block; font-size: 17px; } .rd-rows .up { color: #3fb950; } .rd-rows .down { color: #f85149; }
    #ra-box { margin-top: 12px; padding-top: 10px; border-top: 1px dashed rgba(127,127,127,.3); }
    .ra-h { display: flex; gap: 8px; align-items: center; font-weight: 800; font-size: 13px; } .ra-h small { font-weight: 400; opacity: .7; } .ra-h input { margin-left: auto; width: 90px; }
    .ra-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .ra-list button { border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; border-radius: 99px; padding: 5px 10px; font-size: 12.5px; cursor: pointer; }
    .ra-list button.on { background: #7c5cff; border-color: #7c5cff; color: #fff; } .ra-list button:disabled { opacity: .45; cursor: default; }
  `;
  document.head.appendChild(st);

  (function boot(n) {
    if (!hasDb() || !document.getElementById("de-today") && !document.getElementById("fn-today")) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; }
    renderBar(); wrapToggle(); loadEggs(); loadMon(); loadHours();
    setInterval(() => { if (!document.hidden && !BH.on) { loadMon(); wrapToggle(); } }, 3 * 60 * 1000);
    try { if (localStorage.getItem("blackholeOn")) enterHole(); } catch (_) {}
  })(0);

  window.Blackhole = { radarHtml, resetRadar: () => { RD.data = null; } };
})();
