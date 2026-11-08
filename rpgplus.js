/* ⚔️ 冒險加強：📜 職業任務線、🏰 每日地下城、✨ 裝備附魔、🐾 副手
   資料在 sql/2026-11-08_附魔_職業任務_地下城_副手.sql（rpg_plus_status） */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const P = { d: null, err: null, loading: false, pick: null };
  const ITEM = { stardust: "✨ 星屑", gacha_coin: "🪙 扭蛋幣", ticket_normal: "🎫 普通召喚券", ticket_special: "🎟️ 特殊召喚券" };
  const rw = o => Object.entries(o || {}).map(([k, v]) => `${ITEM[k] || k} ×${v}`).join("、");
  const CLS = { scholar: "📚 學者", warrior: "⚔️ 戰士", guardian: "🛡️ 守護者", ranger: "🏹 遊俠" };
  const PETS = { fox: "🦊 晨光狐狸", owl: "🦉 夜讀貓頭鷹", turtle: "🐢 堅持小龜", cat: "🐈 整潔貓", dragon: "🐉 自律小龍", penguin: "🐧 早睡企鵝", bunny: "🐇 元氣兔", panda: "🐼 專注熊貓", unicorn: "🦄 夢想獨角獸", phoenix: "🐦‍🔥 浴火鳳凰" };
  const rerender = () => { if (window.RpgGame && window.RpgGame.state && window.RpgGame.state.tab === "quest") window.RpgGame.render(); };

  async function load() {
    if (P.loading) return; P.loading = true;
    const { data, error } = await db.rpc("rpg_plus_status");
    P.loading = false; P.err = error ? error.message : null; if (!error) P.d = data;
    rerender();
  }
  const gearName = k => { const st = window.RpgGame && window.RpgGame.state && window.RpgGame.state.status; const g = st && st.catalog && st.catalog.gear && st.catalog.gear[k]; return g ? g.name : k; };
  const ownedGear = () => { const st = window.RpgGame && window.RpgGame.state && window.RpgGame.state.status; return ((st && st.gear) || []).map(g => g.key); };
  const monName = k => { const a = window.FunGame && window.FunGame.allMons ? window.FunGame.allMons() : []; const m = a.find(x => x[0] === k); return m ? `${m[2]} ${m[1]}` : k; };

  function html() {
    if (!P.d) { if (!P.loading && !P.err) load();
      return `<div class="card rp-card"><p class="rp-note">${P.err ? (/rpg_plus_status/.test(P.err) ? "⚠️ 這些新功能的資料庫還沒設定：到 Supabase 的 SQL Editor 執行 <b>sql/2026-11-08_附魔_職業任務_地下城_副手.sql</b>。" : "載入失敗：" + esc(P.err)) : "載入中…"}</p></div>`; }
    const d = P.d;
    /* 📜 任務線 */
    let quest = `<div class="card rp-card"><h3>📜 職業任務線</h3><p class="rp-note">先選一個職業，就會出現那個職業的任務線。</p></div>`;
    if (d.quest && d.quest.def) {
      const q = d.quest, st = q.def.stages;
      quest = `<div class="card rp-card"><h3>📜 ${CLS[d.class] || ""}的任務線 ${q.stage}/5</h3>
        <div class="rq-line">${st.map((s, i) => `<div class="rq-st ${i < q.stage ? "done" : i === q.stage ? "cur" : ""}"><span>${i < q.stage ? "✅" : i === q.stage ? "▶️" : "🔒"}</span>
          <div><b>第 ${i + 1} 關：${esc(s.goal)}</b>${i < q.stage ? `<small>${esc(s.story)}</small>` : ""}</div></div>`).join("")}</div>
        ${q.stage < 5 ? (q.ready ? `<button type="button" class="btn btn-primary" data-rq="adv" style="width:100%">⚔️ 完成第 ${q.stage + 1} 關</button>` : `<p class="rp-note">目前條件：${esc(st[q.stage].goal)}（之前做到過的也算）</p>`)
          : `<p class="rp-note">🏆 全破！</p>`}
        <p class="rp-note">每過一關送星屑＋🎫 普通召喚券 1 張；全破再送 🎟️ 特殊召喚券 2 張＋🌟 限定召喚券 1 張。</p></div>`;
    }
    /* 🏰 地下城 */
    const fl = d.dungeon.floors;
    const dungeon = `<div class="card rp-card"><h3>🏰 今日地下城</h3><p class="rp-note">每天一座 3 層的地下城，每層要完成一件真實的小事才能往下，底層有寶箱。明天會換新的。</p>
      <div class="rq-dng">${fl.map((f, i) => { const open = i === 0 || fl[i - 1].cleared;
        return `<div class="rq-fl ${f.cleared ? "clear" : open ? "open" : "lock"}"><span>${f.cleared ? "✅" : i === 2 ? "🧰" : f.emoji}</span><div><b>B${i + 1}${i === 2 ? "・寶箱層" : ""}</b><small>${esc(f.text)}</small></div>
          ${f.cleared ? "<em>已打通</em>" : !open ? "<em>🔒</em>" : f.ok ? `<button type="button" class="btn btn-small btn-primary" data-rq="dng" data-v="${i + 1}">${i === 2 ? "開寶箱" : "前進"}</button>` : "<em>還沒達成</em>"}</div>`; }).join("")}</div></div>`;
    /* ✨ 附魔 */
    const defs = d.ench_defs, prog = d.ench_prog, owned = ownedGear();
    const ench = `<div class="card rp-card"><h3>✨ 裝備附魔</h3><p class="rp-note">每週達成目標就拿到一張附魔卷軸，選一件裝備附上去（一件裝備一個附魔，再附會覆蓋）。附魔跟著裝備走，穿上才有效。</p>
      ${Object.entries(defs).map(([k, e]) => { const p = prog[k], got = d.ench_claimed.includes(k), pct = Math.min(100, p.v / p.need * 100), sc = d.scrolls[k] || 0;
        return `<div class="rq-en"><span>${e.emoji}</span><div><b>${esc(e.name)}</b><small>${esc(e.goal)}・${p.v}/${p.need}・${Object.entries(e.stat).map(([s, v]) => `${{ str: "力量", int: "智力", vit: "體力", wil: "意志" }[s]} +${v}`).join(" ")}</small>
          <div class="tph-bar"><i style="width:${pct}%"></i></div></div>
          ${got ? "<em>本週已領</em>" : p.v >= p.need ? `<button type="button" class="btn btn-small btn-primary" data-rq="claim" data-v="${k}">領卷軸</button>` : ""}
          ${sc ? `<button type="button" class="btn btn-small" data-rq="use" data-v="${k}">附魔（${sc}）</button>` : ""}</div>`; }).join("")}
      ${P.pick ? `<div class="rq-pick"><b>把 ${defs[P.pick].emoji} ${esc(defs[P.pick].name)} 附到哪件裝備？</b>${owned.map(g => `<button type="button" data-rq="apply" data-v="${g}">${esc(gearName(g))}${d.enchants[g] ? ` <small>（現在：${defs[d.enchants[g]].emoji}）</small>` : ""}</button>`).join("")}<button type="button" data-rq="cancel">取消</button></div>` : ""}
      ${Object.keys(d.enchants).length ? `<p class="rp-note">已附魔：${Object.entries(d.enchants).map(([g, k]) => `${defs[k].emoji} ${esc(gearName(g))}`).join("、")}</p>` : ""}</div>`;
    /* 🐾 副手 */
    const sk = d.sidekick || {};
    const side = `<div class="card rp-card"><h3>🐾 副手</h3><p class="rp-note">帶一隻寵物或扭蛋夥伴進冒險，戰力加成：孵出的寵物 +6%；扭蛋夥伴一般 +2%、金色 +3.5%、彩虹 +5%，閃亮版再 +2%。</p>
      <p>${sk.key ? `現在的副手：<b>${sk.kind === "pet" ? PETS[sk.key] || sk.key : esc(monName(sk.key))}</b>（${esc(sk.label || "")}・戰力 +${Math.round((sk.pct || 0) * 1000) / 10}%）<button type="button" class="btn btn-small" data-rq="side" data-k="" data-v="">卸下</button>` : "還沒有副手"}</p>
      ${d.pets.length ? `<div class="rp-sub">寵物</div><div class="rq-side">${d.pets.map(p => `<button type="button" data-rq="side" data-k="pet" data-v="${p}">${PETS[p] || p}</button>`).join("")}</div>` : `<p class="rp-note">還沒孵出寵物（寵物蛋連續 21 天孵化）。</p>`}
      <div class="rp-sub">扭蛋夥伴（數量多的在前面）</div><div class="rq-side">${Object.entries(d.mons).sort((a, b) => b[1] - a[1]).slice(0, 24).map(([k, n]) => `<button type="button" data-rq="side" data-k="mon" data-v="${k}">${esc(monName(k))}<small>×${n}${d.shiny[k] ? "✨" : ""}</small></button>`).join("")}</div>
      <p class="rp-note">⚔️ 含附魔和副手的實際戰力：<b>${d.power && d.power.power}</b>（打王、競技用這個）</p></div>`;
    return quest + dungeon + ench + side;
  }

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-rq]");
    if (!b) return;
    const a = b.dataset.rq, v = b.dataset.v;
    let r;
    if (a === "use") { P.pick = v; return rerender(); }
    if (a === "cancel") { P.pick = null; return rerender(); }
    b.disabled = true;
    if (a === "claim") r = await db.rpc("rpg_ench_claim", { p_kind: v });
    if (a === "apply") { r = await db.rpc("rpg_ench_apply", { p_kind: P.pick, p_gear: v }); if (!r.error) { toast("✨ 附魔成功"); P.pick = null; } }
    if (a === "side") { r = await db.rpc("rpg_sidekick_set", { p_kind: b.dataset.k || null, p_key: v || null }); if (!r.error) toast(v ? "🐾 副手上陣！" : "副手卸下了"); }
    if (a === "adv") {
      const res = await db.rpc("rpg_quest_advance");
      if (res.error) { b.disabled = false; return toast(res.error.message); }
      const x = res.data, m = document.createElement("div");
      m.className = "vg-modal";
      m.innerHTML = `<div class="vg-card" style="text-align:center"><div class="bh-big">📜</div><div class="vg-title">第 ${x.stage} 關完成！</div><p class="vg-story big">${esc(x.story)}</p>
<p class="bh-items">✨ 星屑＋🎫 普通召喚券 ×1${x.done ? "<br>🏆 全破獎勵：🎟️ 特殊召喚券 ×2、🌟 限定召喚券 ×1" : ""}</p><button type="button" class="btn btn-primary" style="width:100%">繼續冒險</button></div>`;
      m.addEventListener("click", () => m.remove()); document.body.appendChild(m);
      if (window.RpgGame && window.RpgGame.reload) window.RpgGame.reload();
      return load();
    }
    if (a === "dng") {
      const res = await db.rpc("rpg_dungeon_clear", { p_floor: Number(v) });
      if (res.error) { b.disabled = false; return toast(res.error.message); }
      toast(Number(v) === 3 ? `🧰 寶箱：${rw(res.data.got)}` : `⬇️ 打通 B${v}！${rw(res.data.got)}`);
      return load();
    }
    if (r && r.error) { b.disabled = false; return toast(r.error.message); }
    if (r) { P.d = r.data; rerender(); }
  });

  const st = document.createElement("style");
  st.textContent = `
    .rq-st { display: flex; gap: 10px; padding: 8px 0; border-top: 1px solid rgba(127,127,127,.15); opacity: .5; font-size: 13.5px; } .rq-st.done, .rq-st.cur { opacity: 1; }
    .rq-st small { display: block; font-size: 12px; opacity: .75; margin-top: 3px; line-height: 1.5; } .rq-st.cur b { color: #ffd54a; }
    .rq-dng { display: flex; flex-direction: column; gap: 6px; }
    .rq-fl { display: flex; gap: 10px; align-items: center; padding: 10px; border-radius: 12px; background: rgba(127,127,127,.1); } .rq-fl > span { font-size: 26px; } .rq-fl > div { flex: 1; }
    .rq-fl small { display: block; font-size: 12px; opacity: .8; } .rq-fl em { font-style: normal; font-size: 12px; opacity: .7; }
    .rq-fl.lock { opacity: .45; } .rq-fl.clear { background: rgba(63,185,80,.15); } .rq-fl.open { outline: 1px solid rgba(255,213,74,.5); }
    .rq-en { display: flex; gap: 8px; align-items: center; padding: 8px 0; border-top: 1px solid rgba(127,127,127,.15); } .rq-en > span { font-size: 24px; } .rq-en > div { flex: 1; }
    .rq-en small { display: block; font-size: 11.5px; opacity: .75; } .rq-en em { font-style: normal; font-size: 11.5px; opacity: .7; }
    .rq-pick { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; padding: 10px; border-radius: 12px; background: rgba(124,92,255,.12); }
    .rq-pick button, .rq-side button { border: 1px solid rgba(127,127,127,.3); background: transparent; color: inherit; border-radius: 10px; padding: 6px 10px; cursor: pointer; font: inherit; font-size: 13px; text-align: left; }
    .rq-side { display: flex; flex-wrap: wrap; gap: 5px; margin: 4px 0 8px; } .rq-side small { margin-left: 4px; opacity: .6; font-size: 11px; }
    .tph-bar { position: relative; height: 7px; border-radius: 9px; background: rgba(127,127,127,.2); margin-top: 4px; } .tph-bar i { display: block; height: 100%; border-radius: 9px; background: linear-gradient(90deg, #58a6ff, #3fb950); }
  `;
  document.head.appendChild(st);
  window.RpgPlus = { html, load };
})();
