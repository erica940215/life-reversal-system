/* 🎨 單字系統外觀：白底黑字、米黃護眼、純黑、自訂顏色和字體大小（記在這台裝置） */
(function () {
  const KEY = "vocabSkin";
  const PRESETS = {
    site: { name: "跟網站一樣", bg: "", card: "", text: "", sub: "", accent: "#2e7d6b", face: "", line: "" },
    white: { name: "⬜ 白底黑字", bg: "#f4f5f7", card: "#ffffff", text: "#111111", sub: "#555555", accent: "#2e7d6b", face: "#f3f4f6", line: "#d6d9de" },
    paper: { name: "📜 米黃護眼", bg: "#efe6d2", card: "#fbf5e6", text: "#3b2f20", sub: "#7a6a52", accent: "#a5672a", face: "#f3ead6", line: "#dccdae" },
    black: { name: "⬛ 純黑高對比", bg: "#000000", card: "#0b0b0b", text: "#ffffff", sub: "#bbbbbb", accent: "#ffd54a", face: "#161616", line: "#333333" },
    forest: { name: "🌲 森林綠", bg: "#0f2a22", card: "#163a2f", text: "#e8f5ee", sub: "#a8cdbb", accent: "#7ed6a5", face: "#1d4a3c", line: "#2c5e4d" },
    ocean: { name: "🌊 海洋藍", bg: "#0d1b33", card: "#13284a", text: "#e7f0ff", sub: "#a9bfe0", accent: "#5aa9ff", face: "#1a3560", line: "#29467a" },
    sakura: { name: "🌸 櫻花粉", bg: "#fdeef3", card: "#fff7fa", text: "#3d2330", sub: "#8a5d70", accent: "#e0578f", face: "#fbe3ec", line: "#f0c6d6" }
  };
  const load = () => { try { return Object.assign({ preset: "site", size: 100 }, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (_) { return { preset: "site", size: 100 }; } };
  let S = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} };
  const colors = () => Object.assign({}, PRESETS[S.preset] || PRESETS.site, S.preset === "custom" ? S.custom || {} : {});

  const st = document.createElement("style");
  document.head.appendChild(st);
  function css() {
    const c = colors(), on = S.preset !== "site";
    const sel = "#vc-root, .vs-skinned";
    st.textContent = `
      #vc-root { font-size: ${S.size}%; }
      #vc-root .vc-face .vc-word, #vc-root .vc-word { font-size: ${Math.round(32 * S.size / 100)}px; }
      ${on ? `
      ${sel} { --vs-bg: ${c.bg}; --vs-card: ${c.card}; --vs-text: ${c.text}; --vs-sub: ${c.sub}; --vs-accent: ${c.accent}; --vs-face: ${c.face}; --vs-line: ${c.line}; }
      #vc-root { background: var(--vs-bg); color: var(--vs-text); border-radius: 18px; padding: 10px; }
      #vc-root .card { background: var(--vs-card) !important; color: var(--vs-text) !important; border-color: var(--vs-line) !important; box-shadow: none !important; }
      #vc-root .vc-face { background: var(--vs-face) !important; color: var(--vs-text); }
      #vc-root .vc-sub, #vc-root .vc-hint, #vc-root .vc-note, #vc-root small { color: var(--vs-sub) !important; }
      #vc-root .vc-opt:not(.right):not(.wrong) { background: var(--vs-face); color: var(--vs-text); border-color: var(--vs-line); }
      #vc-root .vc-opt.right, #vc-root .vc-opt.wrong { color: var(--vs-text); }
      #vc-root .vc-input { background: var(--vs-face); color: var(--vs-text); border-color: var(--vs-line); }
      #vc-root .vc-tab { border-color: var(--vs-line); color: var(--vs-text); } #vc-root .vc-tab.on { background: var(--vs-accent); border-color: var(--vs-accent); color: #fff; }
      #vc-root .vc-nums b { color: var(--vs-accent); } #vc-root .vc-bar i, #vc-root .vc-bars i { background: var(--vs-accent); }
      #vc-root .vc-modes button { border-color: var(--vs-line); color: var(--vs-text); } #vc-root .vc-modes button.on { background: var(--vs-accent); border-color: var(--vs-accent); color: #fff; }
      #vc-root .btn:not(.btn-primary) { background: var(--vs-face); color: var(--vs-text); border-color: var(--vs-line); }
      #vc-root .btn-primary { background: var(--vs-accent) !important; border-color: var(--vs-accent) !important; color: #fff !important; }
      #vc-root .vc-cloze { color: var(--vs-text); }` : ""}
      .vs-btn { border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; border-radius: 12px; padding: 0 10px; cursor: pointer; font-size: 16px; }
      .vs-panel { margin: -4px 0 12px; padding: 12px; border-radius: 14px; background: rgba(127,127,127,.1); font-size: 13px; }
      .vs-presets { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
      .vs-presets button { border: 2px solid transparent; border-radius: 10px; padding: 8px 6px; cursor: pointer; font: inherit; font-size: 12.5px; text-align: left; }
      .vs-presets button.on { border-color: #7c5cff; }
      .vs-presets i { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 6px; vertical-align: -1px; }
      .vs-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap; } .vs-row label { display: flex; align-items: center; gap: 4px; }
      .vs-row input[type=color] { width: 34px; height: 26px; border: 0; padding: 0; background: none; cursor: pointer; } .vs-row input[type=range] { flex: 1; }`;
  }
  css();

  let open = false;
  function panel() {
    const c = colors();
    return `<div class="vs-panel"><b>🎨 單字外觀</b>
      <div class="vs-presets" style="margin-top:8px">${Object.entries(PRESETS).map(([k, p]) => `<button type="button" class="${S.preset === k ? "on" : ""}" data-vs="${k}" style="background:${p.card || "rgba(127,127,127,.15)"};color:${p.text || "inherit"}"><i style="background:${p.accent}"></i>${p.name}</button>`).join("")}
        <button type="button" class="${S.preset === "custom" ? "on" : ""}" data-vs="custom" style="background:${(S.custom && S.custom.card) || "rgba(127,127,127,.15)"};color:${(S.custom && S.custom.text) || "inherit"}">🖌️ 自訂</button></div>
      ${S.preset === "custom" ? `<div class="vs-row">${[["bg", "背景"], ["card", "卡片"], ["text", "文字"], ["sub", "淡字"], ["accent", "重點色"], ["face", "題目底"]].map(([k, l]) => `<label>${l}<input type="color" data-vsc="${k}" value="${c[k] || "#ffffff"}"></label>`).join("")}</div>` : ""}
      <div class="vs-row">字體大小<input type="range" min="85" max="140" step="5" value="${S.size}" data-vsz="1"><span>${S.size}%</span></div></div>`;
  }
  function inject() {
    const tabs = document.querySelector("#vc-root .vc-tabs");
    if (!tabs || tabs.querySelector(".vs-btn")) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "vs-btn"; b.title = "外觀"; b.textContent = "🎨";
    tabs.appendChild(b);
    if (open) tabs.insertAdjacentHTML("afterend", panel());
  }
  const redraw = () => { const p = document.querySelector("#vc-root .vs-panel"); if (p) p.outerHTML = panel(); };
  document.addEventListener("click", e => {
    if (e.target.closest(".vs-btn")) { open = !open; const p = document.querySelector("#vc-root .vs-panel"); if (p) p.remove(); else document.querySelector("#vc-root .vc-tabs").insertAdjacentHTML("afterend", panel()); return; }
    const b = e.target.closest("[data-vs]");
    if (b) { S.preset = b.dataset.vs; if (S.preset === "custom" && !S.custom) S.custom = Object.assign({}, PRESETS.white); save(); css(); redraw(); }
  });
  document.addEventListener("input", e => {
    if (e.target.dataset.vsc) { S.custom = S.custom || {}; S.custom[e.target.dataset.vsc] = e.target.value; save(); css(); }
    if (e.target.dataset.vsz) { S.size = Number(e.target.value); e.target.nextElementSibling.textContent = S.size + "%"; save(); css(); }
  });
  new MutationObserver(inject).observe(document.body, { childList: true, subtree: true });
})();
