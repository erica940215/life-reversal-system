/* =========================================================
   🧭 分頁分組：底部只留 5 個，其他放在頁面上方的子分頁
   今日｜任務（任務・日曆・專案）｜專注（專注・單字）
   ｜生活（生活・紀錄・想法）｜遊戲（冒險・星露島・末世）
   要放在所有會加分頁的 js（farm、rpg、vocab、projects）之後載入
========================================================= */
(function () {
  const GROUPS = [
    { key: "today", pages: ["today"] },
    { key: "tasks", pages: ["tasks", "calendar", "projects"] },
    { key: "focus", pages: ["focus", "vocab"] },
    { key: "life", pages: ["life", "records", "ideas"] },
    { key: "game", icon: "🎮", label: "遊戲", pages: ["rpg", "farm", "doom"] }
  ];
  const LABEL = {
    today: "🏠 今日", tasks: "📋 任務", calendar: "📅 日曆", projects: "🎯 專案",
    focus: "⏱️ 專注", vocab: "📖 單字", life: "🌿 生活", records: "📊 紀錄",
    ideas: "💡 想法", rpg: "⚔️ 冒險", farm: "🏝️ 星露島", doom: "☢️ 末世"
  };
  const groupOf = p => GROUPS.find(g => g.pages.includes(p));
  const lastKey = g => "navLast:" + g.key;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  /* 子頁的底部按鈕藏起來 */
  const hide = GROUPS.flatMap(g => g.pages.slice(g.key === "game" ? 0 : 1));
  const css = document.createElement("style");
  css.textContent = hide.map(p => `.tab-nav .tab-btn[data-page="${p}"]`).join(",") + `{display:none !important}
    .subnav{display:flex;gap:6px;overflow-x:auto;margin:0 0 14px;padding:4px;border-radius:12px;background:var(--card-bg,rgba(127,127,127,.08));scrollbar-width:none}
    .subnav::-webkit-scrollbar{display:none}
    .subnav button{flex:1 0 auto;border:0;background:transparent;color:inherit;font:inherit;font-size:14px;padding:8px 12px;border-radius:9px;cursor:pointer;white-space:nowrap;opacity:.7}
    .subnav button.on{background:var(--accent,#6c63ff);color:#fff;opacity:1;font-weight:600}
    .tab-btn .nav-mirror-badge:empty{display:none}`;
  document.head.appendChild(css);

  function ensureGameBtn() {
    const nav = document.getElementById("tab-nav");
    if (!nav || nav.querySelector('.tab-btn[data-group="game"]')) return;
    const b = document.createElement("button");
    b.className = "tab-btn";
    b.type = "button";
    b.dataset.group = "game";
    b.innerHTML = '<span class="tab-icon">🎮</span><span class="tab-label">遊戲</span>';
    b.addEventListener("click", () => goGroup(GROUPS[4]));
    nav.appendChild(b);
  }

  function available(p) {
    return typeof PAGES !== "undefined" && PAGES.includes(p) &&
      document.querySelector(`.page[data-page="${p}"]`);
  }

  function goGroup(g) {
    const last = store.get(lastKey(g));
    const target = (last && g.pages.includes(last) && available(last)) ? last
      : g.pages.find(available);
    if (target) showPage(target);
  }

  /* 主分頁按鈕：點下去回到該組上次看的子頁 */
  function wireLeaders() {
    GROUPS.slice(0, 4).forEach(g => {
      const b = document.querySelector(`.tab-nav .tab-btn[data-page="${g.key}"]`);
      if (!b || b.dataset.navWired) return;
      b.dataset.navWired = "1";
      b.dataset.group = g.key;
      b.removeAttribute("onclick");
      b.addEventListener("click", () => goGroup(g));
    });
  }

  function decorate(name) {
    ensureGameBtn();
    wireLeaders();
    const g = groupOf(name);
    document.querySelectorAll(".tab-nav .tab-btn[data-group]").forEach(b =>
      b.classList.toggle("active", !!g && b.dataset.group === g.key));
    if (!g) return;
    store.set(lastKey(g), name);

    const page = document.querySelector(`.page[data-page="${name}"]`);
    if (!page) return;
    const members = g.pages.filter(available);
    let bar = page.querySelector(":scope > .subnav");
    if (members.length < 2) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "subnav";
      page.prepend(bar);
    }
    bar.innerHTML = members.map(p =>
      `<button type="button" data-sub="${p}" class="${p === name ? "on" : ""}">${LABEL[p] || p}</button>`).join("");
    bar.onclick = e => {
      const b = e.target.closest("button[data-sub]");
      if (b && b.dataset.sub !== name) showPage(b.dataset.sub);
    };
  }

  /* 想法的未讀數字搬到「生活」按鈕上 */
  function mirrorBadge() {
    const src = document.getElementById("nav-ideas-badge");
    const life = document.querySelector('.tab-nav .tab-btn[data-page="life"]');
    if (!src || !life) return;
    let m = life.querySelector(".nav-mirror-badge");
    if (!m) { m = document.createElement("span"); m.className = "tab-badge nav-mirror-badge"; life.appendChild(m); }
    const sync = () => { m.textContent = src.textContent.trim(); };
    sync();
    new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
  }

  const base = window.applyPage;
  window.applyPage = function (name) {
    base(name);
    const cur = (typeof currentPageFromHash === "function" && currentPageFromHash()) || name;
    setTimeout(() => decorate(PAGES.includes(cur) ? cur : "today"), 0);
  };

  function init() {
    mirrorBadge();
    const cur = (typeof currentPageFromHash === "function" && currentPageFromHash()) || "today";
    decorate(PAGES.includes(cur) ? cur : "today");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else setTimeout(init, 0);
  /* farm / rpg 的頁面可能晚一點才建好，再補一次 */
  setTimeout(init, 1500);
})();
