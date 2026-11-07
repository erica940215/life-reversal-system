/* 📖 扭蛋圖鑑套組・🏘️ 村民收藏品・🐾 夥伴隊伍・🏅 收藏家等級＋展示櫃
   資料在 sql/2026-11-08_扭蛋進化_套組_夥伴_收藏家.sql（gacha_meta） */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const FG = () => window.FunGame || {};
  const mons = () => (FG().state && FG().state.status && FG().state.status.monsters) || {};
  const meta = () => FG().state && FG().state.meta;
  const info = k => ((FG().allMons ? FG().allMons() : []).find(x => x[0] === k) || [k, k, "❔", ""]);
  const icon = (k, n, sh) => FG().monsterIcon ? FG().monsterIcon(k, false, n || 0, !!sh) : info(k)[2];
  const VNAME = { baker: "🥖 莉莉", grandpa: "⚓ 湯姆爺爺", florist: "🌷 小雛", kid: "🧒 阿布", librarian: "📚 圖書館員", barista: "☕ 阿默", astronomer: "🔭 星野", musician: "🎸 小澄" };
  const ITEM = { stardust: "✨ 星屑", gacha_coin: "🪙 扭蛋幣", wish_rare: "💎 稀有星願瓶" };
  const rw = o => Object.entries(o || {}).map(([k, v]) => `${ITEM[k] || k} ×${v}`).join("、");
  const GP = { tab: "sets" };

  /* 夥伴成長：專注分鐘 → 階段 */
  const STAGES = [[0, "寶寶", 0.85, ["……（偷偷看著你讀書）", "你在做什麼呀？", "我也想變厲害！"]], [300, "少年", 1, ["今天也一起加油吧！", "我覺得你比昨天更專心了。", "休息一下，喝口水再繼續！"]],
    [1200, "成年", 1.15, ["我們一起走了好遠的路。", "你專注的樣子很帥。", "考試那天，我也會在。"]], [3000, "傳說", 1.3, ["是你讓我長成這樣的。", "我們是最強的隊伍。", "不管多難，我都陪你。"]]];
  const stageOf = m => { let s = STAGES[0], i = 0; STAGES.forEach((x, j) => { if (m >= x[0]) { s = x; i = j; } }); return { s, i, next: STAGES[i + 1] }; };

  function modal(html) {
    document.querySelectorAll(".gp-modal").forEach(x => x.remove());
    const m = document.createElement("div");
    m.className = "vg-modal gp-modal";
    m.innerHTML = `<div class="vg-card">${html}</div>`;
    m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-vx]")) m.remove(); });
    document.body.appendChild(m);
    return m;
  }

  function setsHtml(M) {
    const mm = mons();
    return `<p class="vg-note">把不同系列的角色湊成套組，集齊一組送稱號＋星屑 40。</p>${M.sets.map(s => `<div class="gp-set ${s.done ? "done" : ""}">
      <div class="gp-set-h"><span>${s.emoji}</span><b>${esc(s.name)}</b><small>${s.have}/${s.items.length}${s.done ? `・🏷️ 稱號「${esc(s.title)}」` : `・集齊得「${esc(s.title)}」`}</small></div>
      <div class="gp-set-row">${s.items.map(k => mm[k] ? `<span class="gp-it" title="${esc(info(k)[1])}">${icon(k, mm[k], M.shiny[k])}</span>` : `<span class="gp-it no" title="還沒有">❔</span>`).join("")}</div></div>`).join("")}`;
  }

  function wantsHtml(M) {
    const mm = mons();
    return `<p class="vg-note">每週每位村民想要一隻。你要有 2 隻以上才能送（自己留一隻），送了好感 +3，還有回禮。每週一換。</p>${Object.entries(M.wants).map(([v, k]) => {
      const n = mm[k] || 0, given = M.given[v];
      return `<div class="gp-want"><b>${VNAME[v] || v}</b><span class="gp-it">${n ? icon(k, n, M.shiny[k]) : info(k)[2]}</span><div class="eg-b"><span>想要「${esc(info(k)[1])}」</span><small>你有 ${n} 隻</small></div>
        ${given ? `<small>✅ 送過了</small>` : `<button type="button" class="btn btn-small ${n >= 2 ? "btn-primary" : ""}" data-gpg="${v}" ${n >= 2 ? "" : "disabled"}>送給他</button>`}</div>`;
    }).join("")}`;
  }

  function partyHtml(M) {
    const mm = mons(), party = M.party || [];
    const slot = i => party.find(p => p.slot === i);
    return `<p class="vg-note">選 3 隻當夥伴，跟著你專注。專注越久牠們越大：5 小時少年、20 小時成年、50 小時傳說，每個階段都有新台詞。換下來的夥伴經驗會保留。</p>
      <div class="gp-party">${[1, 2, 3].map(i => { const p = slot(i);
        if (!p) return `<div class="gp-mate empty"><span>＋</span><small>空位</small></div>`;
        const st = stageOf(p.minutes);
        return `<div class="gp-mate"><span style="transform:scale(${st.s[2]})">${icon(p.key, mm[p.key], M.shiny[p.key])}</span><b>${esc(info(p.key)[1])}</b><small>${st.s[1]}・${Math.floor(p.minutes / 60)}h</small>
          ${st.next ? `<div class="eg-bar"><i style="width:${Math.min(100, (p.minutes - st.s[0]) / (st.next[0] - st.s[0]) * 100)}%"></i></div>` : ""}<button type="button" class="gp-x" data-gpp="${i}" data-k="">換下</button></div>`; }).join("")}</div>
      <div class="vg-sec">選一隻加入（點一下放進第一個空位）</div>
      <div class="gp-pick">${Object.keys(mm).filter(k => !party.some(p => p.key === k)).map(k => `<button type="button" data-gpadd="${k}" title="${esc(info(k)[1])}">${icon(k, mm[k], M.shiny[k])}</button>`).join("")}</div>`;
  }

  function collHtml(M) {
    const c = M.collector, mm = mons(), sc = M.showcase || [];
    const pct = c.next ? Math.round((c.pts - c.cur) / (c.next - c.cur) * 100) : 100;
    return `<div class="vt-head"><div class="vt-lv">Lv<b>${c.lv}</b></div><div style="flex:1"><b>🏅 收藏家等級</b><div class="eg-bar"><i style="width:${pct}%"></i></div><small>${c.pts}${c.next ? ` / ${c.next}` : "・滿級"}</small></div></div>
      <p class="vg-note">收藏點數 = 角色種類 ×10（${c.uniq}）＋ 金色 ×5（${c.gold}）＋ 彩虹 ×10（${c.rainbow}）＋ 閃亮 ×15（${c.shiny}）＋ 套組 ×20（${c.sets}）。每升一級送扭蛋幣，展示櫃多一格。</p>
      <div class="vg-sec">🗄️ 展示櫃（${sc.length}/${c.slots}）・點一下拿下來</div>
      <div class="gp-case">${Array.from({ length: c.slots }, (_, i) => sc[i] ? `<button type="button" data-gpsc="del" data-k="${sc[i]}">${icon(sc[i], mm[sc[i]], M.shiny[sc[i]])}<small>${esc(info(sc[i])[1])}</small></button>` : `<span class="gp-empty">空</span>`).join("")}</div>
      <div class="vg-sec">挑最得意的放上去</div>
      <div class="gp-pick">${Object.keys(mm).filter(k => !sc.includes(k)).sort((a, b) => (mm[b] + (M.shiny[b] ? 99 : 0)) - (mm[a] + (M.shiny[a] ? 99 : 0))).map(k => `<button type="button" data-gpsc="add" data-k="${k}" title="${esc(info(k)[1])} ×${mm[k]}">${icon(k, mm[k], M.shiny[k])}</button>`).join("")}</div>`;
  }

  function open() {
    const M = meta();
    if (!M) return toast("扭蛋新功能的資料庫還沒設定：到 Supabase 執行 sql/2026-11-08_扭蛋進化_套組_夥伴_收藏家.sql");
    const T = { sets: ["🧩", "套組", setsHtml], wants: ["🏘️", "村民", wantsHtml], party: ["🐾", "夥伴", partyHtml], coll: ["🏅", "收藏家", collHtml] };
    const m = modal(`<div class="vg-title">📖 扭蛋收藏</div><div class="tb-tabs">${Object.entries(T).map(([k, v]) => `<button type="button" class="${GP.tab === k ? "on" : ""}" data-gpt="${k}">${v[0]} ${v[1]}</button>`).join("")}</div>
      <div class="gp-body">${T[GP.tab][2](M)}</div><button type="button" class="btn" data-vx="1" style="width:100%;margin-top:10px">關閉</button>`);
    m.addEventListener("click", async e => {
      const t = e.target.closest("[data-gpt]");
      if (t) { GP.tab = t.dataset.gpt; return open(); }
      let r = null;
      const g = e.target.closest("[data-gpg]");
      if (g) {
        const res = await db.rpc("gacha_give", { p_villager: g.dataset.gpg });
        if (res.error) return toast(res.error.message);
        toast(`🎁 送出了！好感 +3，回禮：${rw(res.data.gift)}`);
        return reload();
      }
      const add = e.target.closest("[data-gpadd]");
      if (add) { const used = (meta().party || []).map(p => p.slot), free = [1, 2, 3].find(i => !used.includes(i)); if (!free) return toast("隊伍滿了，先換下一隻"); r = await db.rpc("gacha_party_set", { p_slot: free, p_key: add.dataset.gpadd }); }
      const x = e.target.closest("[data-gpp]");
      if (x) r = await db.rpc("gacha_party_set", { p_slot: Number(x.dataset.gpp), p_key: null });
      const sc = e.target.closest("[data-gpsc]");
      if (sc) { const cur = meta().showcase || [], k = sc.dataset.k; r = await db.rpc("gacha_showcase_set", { p_keys: sc.dataset.gpsc === "add" ? cur.concat(k) : cur.filter(z => z !== k) }); }
      if (!r) return;
      if (r.error) return toast(r.error.message);
      FG().state.meta = r.data; open(); renderParty();
    });
  }
  async function reload() { if (FG().reload) await FG().reload(); open(); renderParty(); }

  /* 專注卡上的夥伴 */
  function renderParty() {
    const card = document.getElementById("focus-card"), M = meta();
    if (!card || !M) return;
    let box = document.getElementById("gp-party-box");
    const party = M.party || [];
    if (!party.length) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("div"); box.id = "gp-party-box"; card.appendChild(box); }
    const mm = mons(), day = new Date().getDate();
    box.innerHTML = `<div class="ra-h">🐾 夥伴陪你專注</div><div class="gp-fparty">${party.map((p, i) => { const st = stageOf(p.minutes), line = st.s[3][(day + i) % st.s[3].length];
      return `<div><span style="transform:scale(${st.s[2]})">${icon(p.key, mm[p.key], M.shiny[p.key])}</span><small>${esc(info(p.key)[1])}・${st.s[1]}</small><em>「${esc(line)}」</em></div>`; }).join("")}</div>`;
  }

  document.addEventListener("click", e => { if (e.target.closest("[data-gp=open]") && hasDb()) open(); });

  const st = document.createElement("style");
  st.textContent = `
    .gp-body { max-height: 60vh; overflow-y: auto; }
    .gp-set { padding: 8px 0; border-top: 1px solid rgba(127,127,127,.2); } .gp-set.done { background: linear-gradient(90deg, rgba(255,213,74,.1), transparent); }
    .gp-set-h { display: flex; gap: 6px; align-items: center; } .gp-set-h span { font-size: 20px; } .gp-set-h small { margin-left: auto; font-size: 11.5px; opacity: .75; }
    .gp-set-row { display: flex; gap: 6px; margin-top: 6px; }
    .gp-it { width: 44px; height: 44px; display: inline-grid; place-items: center; font-size: 26px; border-radius: 10px; background: rgba(127,127,127,.1); flex: none; }
    .gp-it .fn-mon-img, .gp-pick .fn-mon-img, .gp-case .fn-mon-img, .gp-mate .fn-mon-img, .gp-fparty .fn-mon-img { width: 40px; height: 40px; object-fit: contain; }
    .gp-it.no { opacity: .35; }
    .gp-want { display: flex; gap: 8px; align-items: center; padding: 8px 0; border-top: 1px solid rgba(127,127,127,.2); font-size: 13px; } .gp-want > b { width: 84px; flex: none; font-size: 12.5px; }
    .gp-party { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .gp-mate { text-align: center; padding: 8px 4px; border-radius: 12px; background: rgba(127,127,127,.1); position: relative; } .gp-mate > span { display: block; height: 52px; font-size: 34px; }
    .gp-mate b { display: block; font-size: 12px; } .gp-mate small { font-size: 11px; opacity: .75; } .gp-mate.empty { opacity: .45; } .gp-mate.empty span { font-size: 30px; }
    .gp-x { border: 0; background: none; color: inherit; opacity: .6; font-size: 11px; cursor: pointer; }
    .gp-pick { display: flex; flex-wrap: wrap; gap: 4px; } .gp-pick button { width: 48px; height: 48px; border: 1px solid rgba(127,127,127,.25); border-radius: 10px; background: transparent; cursor: pointer; font-size: 26px; padding: 2px; color: inherit; }
    .gp-case { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; padding: 10px; border-radius: 14px; background: linear-gradient(180deg, rgba(140,90,40,.25), rgba(140,90,40,.08)); }
    .gp-case button { border: 0; background: rgba(255,255,255,.05); border-radius: 10px; padding: 4px; cursor: pointer; color: inherit; font-size: 28px; } .gp-case small { display: block; font-size: 10px; }
    .gp-empty { display: grid; place-items: center; min-height: 56px; border: 1px dashed rgba(127,127,127,.4); border-radius: 10px; font-size: 11px; opacity: .5; }
    #gp-party-box { margin-top: 12px; padding-top: 10px; border-top: 1px dashed rgba(127,127,127,.3); }
    .gp-fparty { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 6px; } .gp-fparty > div { text-align: center; } .gp-fparty span { display: block; font-size: 30px; height: 44px; animation: twWalk 2.4s ease-in-out infinite; }
    .gp-fparty small { display: block; font-size: 11px; opacity: .8; } .gp-fparty em { display: block; font-size: 11px; opacity: .7; font-style: normal; line-height: 1.3; }
  `;
  document.head.appendChild(st);

  (function boot(n) {
    if (!hasDb() || !meta()) { if (n < 90) setTimeout(() => boot(n + 1), 1000); return; }
    renderParty();
    setInterval(() => { if (!document.hidden) renderParty(); }, 60 * 1000);
  })(0);
  window.GachaPlus = { open, renderParty };
})();
