/* 🧩 總功能列表：每個分頁、首頁卡片都可以開關
   存在 user_settings.features（{ key: false } = 關閉），本機也存一份讓畫面一打開就生效
   關掉只是隱藏，資料都不會刪；今日頁不能關 */
(function () {
  const LS = "featuresOff";
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const read = () => { try { return JSON.parse(localStorage.getItem(LS) || "{}") || {}; } catch (_) { return {}; } };
  let off = read();

  const CARDS = [
    { key: "card:energy", label: "⚡ 今日精力卡", sel: "#en-today, #en-analysis, #en-week" },
    { key: "card:dayplan", label: "☀️ 今日任務規劃提示", sel: ".dp-banner" },
    { key: "card:gamemode", label: "🎲 遊戲模式按鈕", sel: ".game-mode-bar" }
  ];
  const GROUP_NAME = { today: "🏠 今日", tasks: "📋 任務", focus: "⏱️ 專注", life: "🌿 生活", game: "🎮 遊戲" };

  const isOff = k => k !== "today" && off[k] === true;
  window.Features = { isOff, open: () => openPanel() };

  const style = document.createElement("style");
  document.head.appendChild(style);
  function applyCss() {
    const NG = window.NavGroups, rules = [];
    CARDS.forEach(c => { if (isOff(c.key)) rules.push(c.sel.split(",").map(x => x.trim()).join(",") + "{display:none !important}"); });
    if (NG) NG.GROUPS.slice(1, 4).forEach(g => { if (g.pages.every(isOff)) rules.push(`.tab-nav .tab-btn[data-group="${g.key}"],.tab-nav .tab-btn[data-page="${g.key}"]{display:none !important}`); });
    style.textContent = rules.join("\n") + `
      .ft-bg{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:flex-end;justify-content:center}
      .ft-box{background:var(--card-bg,#1c1c24);color:inherit;width:min(520px,100%);max-height:85vh;overflow:auto;border-radius:16px 16px 0 0;padding:16px 16px 24px}
      @media(min-width:640px){.ft-bg{align-items:center}.ft-box{border-radius:16px}}
      .ft-box h3{margin:0 0 4px}.ft-g{margin:14px 0 4px;font-size:13px;font-weight:600;opacity:.7}
      .ft-row{display:flex;justify-content:space-between;align-items:center;padding:8px 2px;border-top:1px solid rgba(127,127,127,.15)}
      .ft-sw{width:46px;height:26px;border-radius:13px;border:0;background:#555;position:relative;cursor:pointer;flex:none}
      .ft-sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.15s}
      .ft-sw.on{background:#3fb950}.ft-sw.on::after{left:23px}
      .ft-btn{margin-left:8px}`;
  }

  function refresh() {
    applyCss();
    try { localStorage.setItem(LS, JSON.stringify(off)); } catch (_) {}
    const cur = (typeof currentPageFromHash === "function" && currentPageFromHash()) || "today";
    if (isOff(cur) && typeof showPage === "function") showPage("today");
    else if (window.NavGroups) window.NavGroups.refresh();
  }

  async function loadRemote() {
    if (!hasDb()) return;
    const { data, error } = await db.from("user_settings").select("features").eq("user_id", currentUser.id).maybeSingle();
    if (error || !data) return;
    off = {}; Object.entries(data.features || {}).forEach(([k, v]) => { if (v === false) off[k] = true; });
    refresh();
  }
  async function save() {
    if (!hasDb()) return;
    const features = {}; Object.keys(off).forEach(k => { if (off[k]) features[k] = false; });
    const { error } = await db.from("user_settings").upsert({ user_id: currentUser.id, features, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) toast("功能設定同步失敗，這台裝置仍會記住：" + error.message);
  }

  function openPanel() {
    const NG = window.NavGroups; if (!NG) return;
    document.querySelector(".ft-bg")?.remove();
    const row = (k, label, locked) => `<div class="ft-row"><span>${label}</span>${locked ? `<small style="opacity:.6">固定開啟</small>` : `<button type="button" class="ft-sw ${isOff(k) ? "" : "on"}" data-ft="${k}" aria-label="${label}"></button>`}</div>`;
    const bg = document.createElement("div"); bg.className = "ft-bg";
    bg.innerHTML = `<div class="ft-box"><div style="display:flex;justify-content:space-between;align-items:center"><h3>🧩 總功能列表</h3><button type="button" class="btn btn-small" data-ft-close>完成</button></div>
      <p class="small-note" style="margin:0">關掉只是把它藏起來，資料都會保留，隨時可以再打開。手機和電腦會同步。</p>
      ${NG.GROUPS.map(g => `<div class="ft-g">${GROUP_NAME[g.key] || g.key}</div>${g.pages.map(p => row(p, NG.LABEL[p] || p, p === "today")).join("")}`).join("")}
      <div class="ft-g">🧱 首頁卡片與按鈕</div>${CARDS.map(c => row(c.key, c.label)).join("")}</div>`;
    document.body.appendChild(bg);
    bg.addEventListener("click", e => {
      if (e.target === bg || e.target.closest("[data-ft-close]")) return bg.remove();
      const b = e.target.closest("[data-ft]"); if (!b) return;
      const k = b.dataset.ft; off[k] = !isOff(k); if (!off[k]) delete off[k];
      b.classList.toggle("on", !isOff(k)); refresh(); save();
    });
  }

  function addButton() {
    const bar = document.querySelector(".game-mode-bar"); const host = bar && bar.parentNode;
    if (!host || document.getElementById("ft-open")) return;
    const wrap = document.createElement("div"); wrap.style.cssText = "display:flex;justify-content:flex-end;margin:4px 0";
    wrap.innerHTML = `<button id="ft-open" type="button" class="game-mode-toggle ft-btn">🧩 功能開關</button>`;
    wrap.firstChild.addEventListener("click", openPanel);
    host.insertBefore(wrap, bar);
  }

  applyCss();
  const start = () => { addButton(); refresh(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else setTimeout(start, 0);
  setTimeout(start, 1600);
  (function boot(n) { if (!hasDb()) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; } loadRemote(); })(0);
})();
