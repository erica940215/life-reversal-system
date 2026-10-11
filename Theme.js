/* ==================================================
   🎨 主題（8 組漸層＋原本的預設）
   選擇存在這台裝置的瀏覽器（localStorage），不需要資料庫
   做法：注入一段覆蓋樣式，不改動原本的寫法
================================================== */

const THEME_STORAGE_KEY = "lifeTheme";

const THEMES = {

  aurora: {
    name: "🌌 極光夜空",
    bg: "linear-gradient(160deg, #0b1020 0%, #1a1f4a 55%, #1f3b5c 100%)",
    card: "rgba(20, 26, 48, 0.72)",
    cardBorder: "rgba(255, 255, 255, 0.08)",
    nav: "rgba(11, 16, 32, 0.7)",
    field: "rgba(0, 0, 0, 0.3)",
    track: "rgba(255, 255, 255, 0.12)",
    text: "#eef2ff",
    sub: "#a9b4d6",
    accent: "linear-gradient(90deg, #5fd3c8, #7b8cff)",
    accentText: "#0b1020"
  },

  lava: {
    name: "🌋 日落熔岩",
    bg: "linear-gradient(160deg, #1a0b14 0%, #3a1420 55%, #6b2a1c 100%)",
    card: "rgba(40, 16, 24, 0.7)",
    cardBorder: "rgba(255, 180, 140, 0.12)",
    nav: "rgba(26, 11, 20, 0.7)",
    field: "rgba(0, 0, 0, 0.3)",
    track: "rgba(255, 255, 255, 0.12)",
    text: "#fff1ea",
    sub: "#d9b3a6",
    accent: "linear-gradient(90deg, #ff7a59, #ffb347)",
    accentText: "#1a0b14"
  },

  abyss: {
    name: "🐠 深海螢光",
    bg: "linear-gradient(160deg, #04141f 0%, #0a2a3d 100%)",
    card: "rgba(8, 30, 44, 0.7)",
    cardBorder: "rgba(0, 229, 255, 0.12)",
    nav: "rgba(4, 20, 31, 0.7)",
    field: "rgba(0, 0, 0, 0.3)",
    track: "rgba(255, 255, 255, 0.12)",
    text: "#e6f6fb",
    sub: "#8aa6b5",
    accent: "linear-gradient(90deg, #00e5ff, #7cffcb)",
    accentText: "#04141f"
  },

  dream: {
    name: "🔮 紫金夢境",
    bg: "linear-gradient(160deg, #120a24 0%, #2a1450 100%)",
    card: "rgba(30, 16, 56, 0.7)",
    cardBorder: "rgba(245, 195, 107, 0.14)",
    nav: "rgba(18, 10, 36, 0.7)",
    field: "rgba(0, 0, 0, 0.3)",
    track: "rgba(255, 255, 255, 0.12)",
    text: "#f3eeff",
    sub: "#b9a9d6",
    accent: "linear-gradient(90deg, #b07cf0, #f5c36b)",
    accentText: "#120a24"
  },

  forest: {
    name: "🌲 森林黃昏",
    bg: "linear-gradient(160deg, #0d1a14 0%, #1f3a2a 55%, #3b3018 100%)",
    card: "rgba(16, 32, 24, 0.72)",
    cardBorder: "rgba(123, 237, 159, 0.12)",
    nav: "rgba(13, 26, 20, 0.7)",
    field: "rgba(0, 0, 0, 0.3)",
    track: "rgba(255, 255, 255, 0.12)",
    text: "#eaf4ee",
    sub: "#93a89a",
    accent: "linear-gradient(90deg, #7bed9f, #f2c36b)",
    accentText: "#0d1a14"
  },

  starlight: {
    name: "✨ 星空金邊",
    bg: "linear-gradient(160deg, #0c0c18 0%, #1a1530 100%)",
    card: "rgba(24, 20, 40, 0.75)",
    cardBorder: "rgba(249, 217, 118, 0.35)",
    nav: "rgba(12, 12, 24, 0.7)",
    field: "rgba(0, 0, 0, 0.3)",
    track: "rgba(255, 255, 255, 0.12)",
    text: "#fbf6e6",
    sub: "#bcb296",
    accent: "linear-gradient(90deg, #f9d976, #f39c12)",
    accentText: "#1a1530"
  }

};

/* 預設：不覆蓋任何樣式，保留原本的外觀 */
const THEME_OPTIONS = [
  { key: "default", name: "🌑 原本", accent: "linear-gradient(90deg, #5865f2, #8f9bff)" },
  ...Object.entries(THEMES).map(([key, t]) => ({ key, name: t.name, accent: t.accent }))
];

function themeCss(t) {

  return `
    body {
      background: ${t.bg} !important;
      color: ${t.text} !important;
      min-height: 100vh;
    }

    .card, .modal-box, .auth-card {
      background: ${t.card} !important;
      border-color: ${t.cardBorder} !important;
      color: ${t.text} !important;
    }

    .card h2, .card-head h2, .page-title h1, .modal-title, .auth-card h1 {
      color: ${t.text} !important;
    }

    .page-title p, .small-note, .empty-state, .viz-sub, .viz-tile-note, .viz-tick {
      color: ${t.sub} !important;
    }

    .header-inner, .tab-nav {
      background: ${t.nav} !important;
      border-color: ${t.cardBorder} !important;
    }

    .tab-btn.active, .btn-primary, .chip.active, #exp-progress {
      background: ${t.accent} !important;
      color: ${t.accentText} !important;
      border-color: transparent !important;
    }

    .tab-btn.active .tab-label {
      color: ${t.accentText} !important;
    }

    .exp-bar, .dc-track {
      background: ${t.track} !important;
    }

    input, textarea, select {
      background: ${t.field} !important;
      color: ${t.text} !important;
      border-color: ${t.cardBorder} !important;
    }
  `;

}

function applyTheme(key) {

  const theme = THEMES[key] || null;

  let style = document.getElementById("theme-style");

  if (!style) {
    style = document.createElement("style");
    style.id = "theme-style";
    document.head.appendChild(style);
  }

  style.textContent = theme ? themeCss(theme) : "";

  document.documentElement.dataset.theme = theme ? key : "default";

  renderThemePicker();

}

function setTheme(key) {

  const valid = key === "default" || Boolean(THEMES[key]);

  if (!valid) return;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, key);
  } catch (_) {}

  applyTheme(key);

}

function currentThemeKey() {

  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "default" || (saved && THEMES[saved])) return saved;
  } catch (_) {}

  return "default";

}

function renderThemePicker() {

  const box = document.getElementById("theme-picker");

  if (!box) return;

  const current = document.documentElement.dataset.theme || "default";

  box.innerHTML = `
    <section class="card theme-card">
      <div class="card-head">
        <h2>🎨 主題</h2>
      </div>
      <div class="theme-grid">
        ${THEME_OPTIONS.map(option => `
          <button
            class="theme-option ${option.key === current ? "active" : ""}"
            onclick="setTheme('${option.key}')"
          >
            <span class="theme-swatch" style="background:${option.accent}"></span>
            <span>${option.name}</span>
          </button>`).join("")}
      </div>
    </section>`;

}

/* 一打開網頁就套用上次選的主題 */
applyTheme(currentThemeKey());
