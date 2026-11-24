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
    { key: "card:gamemode", label: "🎲 遊戲模式按鈕", sel: "#game-mode-toggle" }
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
      .feat-bg{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:flex-end;justify-content:center}
      .feat-box{background:var(--card-bg,#1c1c24);color:inherit;width:min(520px,100%);max-height:85vh;overflow:auto;border-radius:16px 16px 0 0;padding:16px 16px 24px}
      @media(min-width:640px){.feat-bg{align-items:center}.feat-box{border-radius:16px}}
      .feat-box h3{margin:0 0 4px}.feat-g{margin:14px 0 4px;font-size:13px;font-weight:600;opacity:.7}
      .feat-row{display:flex;justify-content:space-between;align-items:center;padding:8px 2px;border-top:1px solid rgba(127,127,127,.15)}
      .feat-sw{width:46px;height:26px;border-radius:13px;border:0;background:#555;position:relative;cursor:pointer;flex:none}
      .feat-sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.15s}
      .feat-sw.on{background:#3fb950}.feat-sw.on::after{left:23px}
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
    document.querySelector(".feat-bg")?.remove();
    const row = (k, label, locked) => `<div class="feat-row"><span>${label}</span>${locked ? `<small style="opacity:.6">固定開啟</small>` : `<button type="button" class="feat-sw ${isOff(k) ? "" : "on"}" data-feat="${k}" aria-label="${label}"></button>`}</div>`;
    const bg = document.createElement("div"); bg.className = "feat-bg";
    bg.innerHTML = `<div class="feat-box"><div style="display:flex;justify-content:space-between;align-items:center"><h3>🧩 總功能列表</h3><button type="button" class="btn btn-small" data-feat-close>完成</button></div>
      <p class="small-note" style="margin:0">關掉只是把它藏起來，資料都會保留，隨時可以再打開。手機和電腦會同步。</p>
      ${NG.GROUPS.map(g => `<div class="feat-g">${GROUP_NAME[g.key] || g.key}</div>${g.pages.map(p => row(p, NG.LABEL[p] || p, p === "today")).join("")}`).join("")}
      <div class="feat-g">🧱 首頁卡片與按鈕</div>${CARDS.map(c => row(c.key, c.label)).join("")}</div>`;
    document.body.appendChild(bg);
    bg.addEventListener("click", e => {
      if (e.target === bg || e.target.closest("[data-feat-close]")) return bg.remove();
      const b = e.target.closest("[data-feat]"); if (!b) return;
      const k = b.dataset.feat; off[k] = !isOff(k); if (!off[k]) delete off[k];
      b.classList.toggle("on", !isOff(k)); refresh(); save();
    });
  }

  function addButton() {
    const bar = document.querySelector(".game-mode-bar");
    if (!bar || document.getElementById("feat-open")) return;
    bar.style.gap = "8px";
    const b = document.createElement("button");
    b.id = "feat-open"; b.type = "button"; b.className = "game-mode-toggle"; b.textContent = "🧩 功能開關";
    b.addEventListener("click", openPanel);
    bar.insertBefore(b, bar.firstChild);
  }

  applyCss();
  const start = () => { addButton(); refresh(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else setTimeout(start, 0);
  setTimeout(start, 1600);
  (function boot(n) { if (!hasDb()) { if (n < 60) setTimeout(() => boot(n + 1), 1000); return; } loadRemote(); })(0);
})();
