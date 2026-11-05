/* 💰 時間預算：每週分配時間，像記帳一樣看實際花多少、哪裡超支
   資料在 sql/2026-11-05_時間預算.sql */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const B = { data: null, off: 0, err: null };
  const h = m => { const a = Math.abs(m), hh = Math.floor(a / 60), mm = Math.round(a % 60); return (m < 0 ? "-" : "") + (hh ? `${hh}h` : "") + (mm || !hh ? `${mm}m` : ""); };
  const state = (it, days) => {
    const bud = it.hours * 60, pace = bud * days / 7;
    if (!bud) return it.actual > 0 ? "over" : "ok";
    if (it.actual > bud) return "over";
    if (it.manual) return it.actual > pace * 1.15 ? "warn" : "ok";
    return it.actual < pace * 0.7 ? "behind" : "ok";
  };
  const LABEL = { over: "超支", warn: "花太快", behind: "落後", ok: "" };

  async function load(off) {
    if (off != null) B.off = off;
    const { data, error } = await db.rpc("budget_status", { p_offset: B.off });
    B.err = error ? error.message : null;
    if (!error) B.data = data;
    if (B.off === 0) render();
    return data;
  }

  function bars(d, withBtns) {
    return d.items.map(it => {
      const bud = it.hours * 60, pct = bud ? Math.min(100, it.actual / bud * 100) : (it.actual ? 100 : 0), pace = Math.min(100, d.days_passed / 7 * 100), s = state(it, d.days_passed);
      return `<div class="tb-row ${s}"><div class="tb-l"><span>${esc(it.emoji || "⏱️")}</span><b>${esc(it.name)}</b>${LABEL[s] ? `<em>${LABEL[s]}</em>` : ""}<small>${h(it.actual)} / ${it.hours}h</small></div>
        <div class="tb-bar"><i style="width:${pct}%"></i><u style="left:${pace}%"></u></div>
        ${withBtns && it.manual ? `<div class="tb-btns"><button type="button" data-tb="log" data-k="${esc(it.k)}" data-m="30">+30 分</button><button type="button" data-tb="log" data-k="${esc(it.k)}" data-m="60">+1 小時</button><button type="button" data-tb="log" data-k="${esc(it.k)}" data-m="ask">自訂</button></div>` : ""}</div>`;
    }).join("");
  }

  function render() {
    const tp = document.querySelector('.page[data-page="today"]');
    if (!tp) return;
    let box = document.getElementById("tb-today");
    if (!box) {
      box = document.createElement("section");
      box.id = "tb-today"; box.className = "card";
      const ref = document.getElementById("today-checkin") || document.getElementById("morning-card");
      ref ? ref.after(box) : tp.appendChild(box);
    }
    const d = B.data;
    if (!d) { box.innerHTML = `<h2>💰 時間預算</h2><p class="tb-note">${B.err ? (/budget_status/.test(B.err) ? "資料庫還沒設定：到 Supabase 執行 sql/2026-11-05_時間預算.sql" : esc(B.err)) : "載入中…"}</p>`; return; }
    const mon = new Date(Date.now() - 6 * 3600e3).getDay() === 1;
    const tot = d.items.reduce((a, i) => a + i.hours * 60, 0), act = d.items.reduce((a, i) => a + i.actual, 0);
    box.innerHTML = `<h2>💰 時間預算</h2>
      ${mon && !d.set_this_week ? `<button type="button" class="tb-new" data-tb="edit">🗓️ 新的一週！點這裡分配這週的時間預算（現在沿用上週）</button>` : ""}
      <p class="tb-note">${d.week.slice(5).replace("-", "/")} 那週・第 ${d.days_passed}/7 天・已用 ${h(act)}／預算 ${h(tot)}<span class="tb-key">｜線 = 照進度現在該到哪</span></p>
      ${bars(d, true)}
      <button type="button" class="btn btn-small" data-tb="open" style="width:100%;margin-top:8px">📒 明細、上週對帳、調整預算</button>`;
  }

  function modal(html) {
    document.querySelectorAll(".tb-modal").forEach(m => m.remove());
    const m = document.createElement("div");
    m.className = "vg-modal tb-modal";
    m.innerHTML = `<div class="vg-card">${html}</div>`;
    m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-vx]")) m.remove(); });
    document.body.appendChild(m);
    return m;
  }

  async function openBook(off) {
    const d = await load(off);
    if (!d) return toast(B.err || "讀不到");
    const rows = d.items.map(it => { const bud = it.hours * 60, diff = bud - it.actual, s = state(it, d.days_passed);
      return `<tr class="${s}"><td>${esc(it.emoji || "")} ${esc(it.name)}<small>${it.manual ? "手動記" : (it.subjects || []).length ? "專注：" + it.subjects.map(esc).join("、") : "其他所有專注"}</small></td><td>${it.hours}h</td><td>${h(it.actual)}</td><td class="df">${diff >= 0 ? (it.manual ? "剩 " : "還差 ") + h(diff) : "超 " + h(-diff)}</td></tr>`; }).join("");
    const over = d.items.filter(it => it.actual > it.hours * 60), behind = d.items.filter(it => !it.manual && it.actual < it.hours * 60);
    const fx = Object.entries(d.focus || {}).sort((a, b) => b[1] - a[1]);
    modal(`<div class="vg-title">📒 時間帳本</div>
      <div class="tb-tabs"><button type="button" class="${B.off === 0 ? "on" : ""}" data-tb="week" data-o="0">這週</button><button type="button" class="${B.off === -1 ? "on" : ""}" data-tb="week" data-o="-1">上週</button><button type="button" class="${B.off === -2 ? "on" : ""}" data-tb="week" data-o="-2">上上週</button></div>
      <p class="tb-note">${d.week} 起的一週${B.off === 0 ? `・第 ${d.days_passed}/7 天` : ""}</p>
      <table class="tb-tbl"><thead><tr><th>類別</th><th>預算</th><th>實際</th><th>差額</th></tr></thead><tbody>${rows}</tbody></table>
      ${B.off < 0 || d.days_passed >= 7 ? `<div class="tb-sum">${over.length ? `🔴 超支：${over.map(i => `${esc(i.name)} 多了 ${h(i.actual - i.hours * 60)}`).join("、")}` : "🟢 沒有超支，很好！"}<br>${behind.length ? `🟡 沒達標：${behind.map(i => `${esc(i.name)} 差 ${h(i.hours * 60 - i.actual)}`).join("、")}` : "🟢 專注類全部達標！"}</div>` : ""}
      ${fx.length ? `<div class="vg-sec">⏱️ 這週各科專注</div><div class="tb-fx">${fx.map(([k, v]) => `<span>${esc(k)} <b>${h(v)}</b></span>`).join("")}</div>` : ""}
      ${B.off === 0 && d.logs.length ? `<div class="vg-sec">✍️ 手動記錄</div>${d.logs.map(l => { const it = d.items.find(i => i.k === l.k) || { name: l.k };
        return `<div class="tb-log"><span>${l.day.slice(5).replace("-", "/")}</span><b>${esc(it.emoji || "")} ${esc(it.name)}</b><span>${h(l.minutes)}</span><small>${esc(l.note || "")}</small><button type="button" data-tb="undo" data-id="${l.id}" aria-label="刪除">✕</button></div>`; }).join("")}` : ""}
      ${B.off === 0 ? `<button type="button" class="btn btn-primary" data-tb="edit" style="width:100%;margin-top:10px">✏️ 調整這週的預算</button>` : ""}
      <button type="button" class="btn" data-vx="1" style="width:100%;margin-top:6px">關閉</button>`);
  }

  function openEdit() {
    const d = B.data;
    if (!d) return;
    const items = JSON.parse(JSON.stringify(d.items.map(({ actual, by_day, ...r }) => r)));
    const subs = d.subjects || [];
    const m = modal(`<div class="vg-title">✏️ 這週的時間預算</div>
      <p class="vg-note">綁了專注科目的類別會自動算時數；「科目全不選」的那一類會吃掉其他所有專注；勾「手動記」的類別（休息、娛樂、運動）自己按 +30 分。</p>
      <div class="tb-edit"></div>
      <button type="button" class="btn btn-small" data-te="add" style="width:100%;margin-top:6px">＋ 新增類別</button>
      <p class="tb-note tb-total"></p>
      <div style="display:flex;gap:6px;margin-top:8px"><button type="button" class="btn" data-vx="1" style="flex:1">取消</button><button type="button" class="btn btn-primary" data-te="save" style="flex:1">儲存</button></div>`);
    const list = m.querySelector(".tb-edit");
    const draw = () => {
      list.innerHTML = items.map((it, i) => `<div class="tb-ei" data-i="${i}"><div class="tb-er"><input class="tb-emo" data-f="emoji" maxlength="4" value="${esc(it.emoji || "")}"><input data-f="name" maxlength="20" value="${esc(it.name)}" placeholder="類別名稱"><input class="tb-hr" data-f="hours" type="number" min="0" max="168" step="0.5" value="${it.hours}"><span>小時</span><button type="button" data-te="del" aria-label="刪除">✕</button></div>
        <label class="tb-man"><input type="checkbox" data-f="manual" ${it.manual ? "checked" : ""}> 手動記（不算專注時數）</label>
        ${it.manual ? "" : `<div class="tb-subs">${subs.map(s => `<button type="button" class="${(it.subjects || []).includes(s) ? "on" : ""}" data-te="sub" data-s="${esc(s)}">${esc(s)}</button>`).join("") || `<small>還沒有專注紀錄的科目</small>`}</div>`}</div>`).join("");
      m.querySelector(".tb-total").textContent = `總共分配 ${items.reduce((a, x) => a + Number(x.hours || 0), 0)} 小時（一週有 168 小時，扣掉睡覺大約 112 小時）`;
    };
    draw();
    m.addEventListener("input", e => { const ei = e.target.closest(".tb-ei"), f = e.target.dataset.f; if (!ei || !f || f === "manual") return; const it = items[ei.dataset.i]; it[f] = f === "hours" ? Number(e.target.value) : e.target.value; if (f === "hours") m.querySelector(".tb-total").textContent = `總共分配 ${items.reduce((a, x) => a + Number(x.hours || 0), 0)} 小時（一週有 168 小時，扣掉睡覺大約 112 小時）`; });
    m.addEventListener("change", e => { const ei = e.target.closest(".tb-ei"); if (ei && e.target.dataset.f === "manual") { items[ei.dataset.i].manual = e.target.checked; if (e.target.checked) delete items[ei.dataset.i].subjects; draw(); } });
    m.addEventListener("click", async e => {
      const b = e.target.closest("[data-te]");
      if (!b) return;
      const ei = b.closest(".tb-ei"), it = ei && items[ei.dataset.i];
      if (b.dataset.te === "add") { items.push({ k: "c" + Date.now().toString(36), name: "", emoji: "⏱️", hours: 2, manual: true }); draw(); }
      if (b.dataset.te === "del") { items.splice(ei.dataset.i, 1); draw(); }
      if (b.dataset.te === "sub") { const s = b.dataset.s, a = it.subjects || (it.subjects = []); a.includes(s) ? a.splice(a.indexOf(s), 1) : a.push(s); b.classList.toggle("on"); }
      if (b.dataset.te === "save") {
        const { data, error } = await db.rpc("budget_save", { p_items: items.map(x => ({ ...x, hours: Number(x.hours) || 0, name: String(x.name || "").trim() })) });
        if (error) return toast(error.message);
        B.data = data; B.off = 0; render(); m.remove(); toast("💰 這週的時間預算存好了");
      }
    });
  }

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-tb]");
    if (!b || !hasDb()) return;
    const a = b.dataset.tb;
    if (a === "open") return openBook(0);
    if (a === "week") return openBook(Number(b.dataset.o));
    if (a === "edit") { if (B.off !== 0) await load(0); return openEdit(); }
    if (a === "log") {
      let mins = b.dataset.m, note = null;
      if (mins === "ask") { const v = prompt("記多少分鐘？（負數可以扣回去）", "45"); if (v == null) return; mins = Number(v); note = prompt("備註（可以不填）", "") || null; }
      mins = Number(mins);
      if (!mins) return;
      const { data, error } = await db.rpc("budget_log", { p_k: b.dataset.k, p_minutes: mins, p_note: note });
      if (error) return toast(error.message);
      B.data = data; B.off = 0; render(); toast(`💰 記了 ${h(mins)}`);
    }
    if (a === "undo") { const { data, error } = await db.rpc("budget_undo", { p_id: Number(b.dataset.id) }); if (error) return toast(error.message); B.data = data; render(); openBook(0); }
  });

  const st = document.createElement("style");
  st.textContent = `
    .tb-note { font-size: 12px; opacity: .75; margin: 4px 0 8px; } .tb-key { opacity: .7; }
    .tb-new { width: 100%; border: 1px dashed #ffd54a; background: rgba(255,213,74,.12); color: inherit; border-radius: 12px; padding: 10px; margin-bottom: 8px; cursor: pointer; font: inherit; font-size: 13px; }
    .tb-row { margin: 8px 0; } .tb-l { display: flex; align-items: center; gap: 6px; font-size: 13.5px; } .tb-l small { margin-left: auto; opacity: .8; font-variant-numeric: tabular-nums; }
    .tb-l em { font-style: normal; font-size: 11px; padding: 1px 6px; border-radius: 99px; }
    .tb-row.over em { background: rgba(248,81,73,.25); color: #ff8a80; } .tb-row.warn em { background: rgba(255,170,60,.25); color: #ffb74d; } .tb-row.behind em { background: rgba(255,213,74,.2); color: #ffd54a; }
    .tb-bar { position: relative; height: 9px; border-radius: 9px; background: rgba(127,127,127,.2); margin-top: 4px; overflow: visible; }
    .tb-bar i { display: block; height: 100%; border-radius: 9px; background: #3fb950; } .tb-row.over .tb-bar i { background: #f85149; } .tb-row.warn .tb-bar i { background: #ffa94d; } .tb-row.behind .tb-bar i { background: #e3b341; }
    .tb-bar u { position: absolute; top: -3px; bottom: -3px; width: 2px; background: currentColor; opacity: .55; }
    .tb-btns { display: flex; gap: 6px; margin-top: 5px; } .tb-btns button { flex: 1; border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; border-radius: 8px; padding: 4px; font-size: 12px; cursor: pointer; }
    .tb-tabs { display: flex; gap: 6px; margin: 6px 0; } .tb-tabs button { flex: 1; border: 0; border-radius: 8px; padding: 6px; background: rgba(127,127,127,.18); color: inherit; cursor: pointer; } .tb-tabs button.on { background: #7c5cff; color: #fff; }
    .tb-tbl { width: 100%; border-collapse: collapse; font-size: 13px; } .tb-tbl th { text-align: left; font-size: 11.5px; opacity: .7; padding: 4px; } .tb-tbl td { padding: 6px 4px; border-top: 1px solid rgba(127,127,127,.2); vertical-align: top; }
    .tb-tbl td small { display: block; font-size: 10.5px; opacity: .6; } .tb-tbl tr.over .df { color: #ff8a80; font-weight: 700; } .tb-tbl tr.behind .df { color: #ffd54a; }
    .tb-sum { margin: 10px 0; padding: 10px; border-radius: 12px; background: rgba(127,127,127,.12); font-size: 13px; line-height: 1.7; }
    .tb-fx { display: flex; flex-wrap: wrap; gap: 6px; } .tb-fx span { font-size: 12px; padding: 3px 8px; border-radius: 99px; background: rgba(127,127,127,.15); }
    .tb-log { display: flex; gap: 8px; align-items: center; font-size: 12.5px; padding: 4px 0; border-top: 1px solid rgba(127,127,127,.15); } .tb-log small { flex: 1; opacity: .6; } .tb-log button { border: 0; background: none; color: inherit; opacity: .5; cursor: pointer; }
    .tb-ei { padding: 8px 0; border-top: 1px solid rgba(127,127,127,.2); } .tb-er { display: flex; gap: 4px; align-items: center; } .tb-er input { margin: 0; } .tb-emo { width: 44px !important; } .tb-hr { width: 64px !important; } .tb-er span { font-size: 12px; opacity: .7; }
    .tb-er button { border: 0; background: none; color: inherit; opacity: .6; cursor: pointer; } .tb-man { display: block; font-size: 12px; margin: 4px 0; opacity: .85; }
    .tb-subs { display: flex; flex-wrap: wrap; gap: 4px; } .tb-subs button { border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; border-radius: 99px; padding: 3px 9px; font-size: 11.5px; cursor: pointer; } .tb-subs button.on { background: #7c5cff; border-color: #7c5cff; color: #fff; }
  `;
  document.head.appendChild(st);

  (function boot(n) {
    if (!hasDb()) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; }
    load(0);
    setInterval(() => { if (!document.hidden && B.off === 0) load(0); }, 5 * 60 * 1000);
  })(0);
})();
