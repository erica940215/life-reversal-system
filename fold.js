/* ==================================================
   📂 今日頁：每張卡片可以往上收起來，只留標題
   - 點標題那一列就收起／展開（點到按鈕不算）
   - 收起來的卡片記在這台裝置（localStorage），下次打開一樣
================================================== */

(function () {

  const KEY = "todayFolded";

  function loadFolded() {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) || "[]");
      return new Set(Array.isArray(list) ? list : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveFolded(set) {
    try {
      localStorage.setItem(KEY, JSON.stringify([...set]));
    } catch (_) {}
  }

  const folded = loadFolded();

  function setFolded(card, head, on) {
    card.classList.toggle("folded", on);
    head.setAttribute("aria-expanded", on ? "false" : "true");
    if (on) folded.add(card.id);
    else folded.delete(card.id);
    saveFolded(folded);
  }

  function setup() {

    const page = document.querySelector('.page[data-page="today"]');
    if (!page) return;

    page.querySelectorAll(":scope > section.card[id]").forEach(card => {

      const head = card.querySelector(":scope > .card-head") || card.querySelector(":scope > h2");
      const title = head && (head.matches("h2") ? head : head.querySelector("h2"));
      if (!head || !title || card.classList.contains("can-fold")) return;

      card.classList.add("can-fold");

      const caret = document.createElement("span");
      caret.className = "fold-caret";
      caret.setAttribute("aria-hidden", "true");
      caret.textContent = "▾";
      title.prepend(caret);

      head.setAttribute("role", "button");
      head.setAttribute("tabindex", "0");
      head.setAttribute("aria-expanded", "true");
      head.title = "點一下收起／展開";

      if (folded.has(card.id)) {
        card.classList.add("folded");
        head.setAttribute("aria-expanded", "false");
      }

      head.addEventListener("click", event => {
        if (event.target.closest("button, a, input, select, textarea, label")) return;
        setFolded(card, head, !card.classList.contains("folded"));
      });

      head.addEventListener("keydown", event => {
        if (event.target !== head) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        setFolded(card, head, !card.classList.contains("folded"));
      });

    });

  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }

})();
