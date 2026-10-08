<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>神級人生逆襲系統</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        "Microsoft JhengHei",
        sans-serif;

      background:
        radial-gradient(
          circle at top,
          #1b1b2f 0%,
          #0d0d16 45%,
          #08080d 100%
        );

      color: #f2f2f2;
      min-height: 100vh;
    }

    .container {
      width: min(1100px, 94%);
      margin: 0 auto;
      padding: 30px 0 60px;
    }

    h1,
    h2,
    h3 {
      margin-top: 0;
    }

    .title {
      text-align: center;
      margin-bottom: 30px;
    }

    .title h1 {
      font-size: 32px;
      margin-bottom: 8px;
    }

    .subtitle {
      opacity: 0.65;
    }

    .card {
      background: rgba(25, 25, 38, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 18px;
      padding: 22px;
      margin-bottom: 20px;
      box-shadow: 0 10px 35px rgba(0, 0, 0, 0.25);
    }

    /* =========================
       登入
    ========================= */

    #auth-form {
      max-width: 500px;
      margin: 50px auto;
    }

    .input-group {
      margin-bottom: 15px;
    }

    .input-group label {
      display: block;
      margin-bottom: 7px;
      opacity: 0.8;
    }

    input,
    select {
      width: 100%;
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid rgba(255,255,255,0.12);
      background: #11111b;
      color: white;
      outline: none;
    }

    input:focus,
    select:focus {
      border-color: rgba(255,255,255,0.35);
    }

    button {
      border: none;
      border-radius: 10px;
      padding: 10px 15px;
      cursor: pointer;
      background: #27273a;
      color: white;
      transition: 0.15s;
    }

    button:hover {
      transform: translateY(-1px);
      background: #34344c;
    }

    .primary-btn {
      background: #5865f2;
    }

    .primary-btn:hover {
      background: #6975ff;
    }

    .danger-btn {
      background: #7d3030;
    }

    .auth-buttons {
      display: flex;
      gap: 10px;
      margin-top: 15px;
    }

    .auth-buttons button {
      flex: 1;
    }

    #auth-message {
      margin-top: 15px;
      min-height: 24px;
      text-align: center;
    }

    /* =========================
       玩家資訊
    ========================= */

    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 15px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }

    #user-email {
      opacity: 0.7;
      font-size: 14px;
    }

    .player-grid {
      display: grid;
      grid-template-columns:
        repeat(3, 1fr);
      gap: 15px;
    }

    .stat-box {
      background: #11111b;
      border-radius: 14px;
      padding: 18px;
      text-align: center;
    }

    .stat-label {
      font-size: 13px;
      opacity: 0.6;
      margin-bottom: 8px;
    }

    .stat-value {
      font-size: 28px;
      font-weight: bold;
    }

    .exp-section {
      margin-top: 18px;
    }

    .exp-text {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 14px;
      opacity: 0.8;
    }

    .progress {
      height: 12px;
      background: #0b0b12;
      border-radius: 999px;
      overflow: hidden;
    }

    #exp-bar,
    #rate-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(
        90deg,
        #5865f2,
        #8d94ff
      );
      transition: width 0.3s;
    }

    /* =========================
       今日統計
    ========================= */

    .summary-grid {
      display: grid;
      grid-template-columns:
        repeat(4, 1fr);
      gap: 12px;
    }

    .summary-box {
      background: #11111b;
      border-radius: 12px;
      padding: 15px;
      text-align: center;
    }

    .summary-value {
      font-size: 22px;
      font-weight: bold;
      margin-top: 5px;
    }

    .summary-label {
      opacity: 0.6;
      font-size: 13px;
    }

    .rate-section {
      margin-top: 18px;
    }

    #rate-text {
      display: block;
      margin-bottom: 8px;
      opacity: 0.7;
    }

    /* =========================
       任務篩選
    ========================= */

    .filter-buttons {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 15px;
    }

    .filter-btn.active,
    .management-filter.active {
      background: #5865f2;
    }

    /* =========================
       任務列表
    ========================= */

    .task-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .task-item {
      display: flex;
      align-items: center;
      gap: 12px;

      padding: 15px;
      margin-bottom: 10px;

      background: #11111b;
      border-radius: 13px;

      border: 1px solid transparent;
    }

    .task-item:hover {
      border-color: rgba(255,255,255,0.1);
    }

    .task-item.completed {
      opacity: 0.55;
    }

    .task-checkbox {
      font-size: 25px;
      cursor: pointer;
      flex-shrink: 0;
    }

    .task-info {
      flex: 1;
      min-width: 0;
    }

    .task-info small {
      display: block;
      opacity: 0.5;
      margin-bottom: 4px;
    }

    .task-name {
      display: block;
      font-size: 16px;
      margin-bottom: 5px;
      word-break: break-word;
    }

    .difficulty {
      display: inline-block;
      font-size: 12px;
      padding: 3px 7px;
      border-radius: 6px;
      background: #29293a;
      opacity: 0.85;
    }

    .difficulty.easy {
      background: #24452f;
    }

    .difficulty.normal {
      background: #45402a;
    }

    .difficulty.hard {
      background: #512d2d;
    }

    .reward {
      display: flex;
      flex-direction: column;
      text-align: right;
      font-size: 13px;
      white-space: nowrap;
      opacity: 0.8;
    }

    .task-actions {
      display: flex;
      gap: 5px;
    }

    .task-actions button {
      padding: 7px 9px;
      font-size: 13px;
    }

    /* =========================
       新增任務
    ========================= */

    .repeat-options,
    .weekday-options {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 10px;
    }

    .radio-option,
    .checkbox-option {
      display: flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
    }

    .radio-option input,
    .checkbox-option input {
      width: auto;
    }

    #repeat-settings {
      margin-top: 15px;
      padding: 15px;
      border-radius: 12px;
      background: #11111b;
    }

    #weekday-settings {
      margin-top: 12px;
    }

    .add-task-row {
      display: grid;
      grid-template-columns:
        2fr 1fr 1fr;
      gap: 10px;
    }

    .add-task-button {
      margin-top: 15px;
    }

    #add-task-message {
      margin-top: 10px;
      min-height: 22px;
      opacity: 0.8;
    }

    /* =========================
       任務管理
    ========================= */

    .management-filter {
      border: 1px solid rgba(255,255,255,0.08);
    }

    .management-task {
      background: #11111b;
      border-radius: 12px;
      padding: 15px;
      margin-bottom: 10px;
    }

    /* =========================
       RWD
    ========================= */

    @media (max-width: 700px) {

      .player-grid {
        grid-template-columns: 1fr;
      }

      .summary-grid {
        grid-template-columns:
          repeat(2, 1fr);
      }

      .add-task-row {
        grid-template-columns: 1fr;
      }

      .task-item {
        align-items: flex-start;
      }

      .reward {
        display: none;
      }

      .task-actions {
        flex-direction: column;
      }
    }
  </style>
</head>

<body>

<div class="container">

  <!-- ==================================================
       標題
  ================================================== -->

  <div class="title">
    <h1>⚔️ 神級人生逆襲系統</h1>
    <div class="subtitle">
      把每天的人生，變成一場可以升級的 RPG。
    </div>
  </div>


  <!-- ==================================================
       登入
  ================================================== -->

  <section id="auth-form" class="card">

    <h2>🔐 玩家登入</h2>

    <div class="input-group">
      <label for="auth-email">
        Email
      </label>

      <input
        type="email"
        id="auth-email"
        placeholder="輸入 Email"
        autocomplete="email"
      >
    </div>

    <div class="input-group">
      <label for="auth-password">
        密碼
      </label>

      <input
        type="password"
        id="auth-password"
        placeholder="至少 6 碼"
        autocomplete="current-password"
      >
    </div>

    <div class="auth-buttons">

      <button
        type="button"
        class="primary-btn"
        onclick="loginUser()"
      >
        登入
      </button>

      <button
        type="button"
        onclick="registerUser()"
      >
        註冊
      </button>

    </div>

    <div id="auth-message"></div>

  </section>


  <!-- ==================================================
       登入後區域
  ================================================== -->

  <main id="logged-in-area" style="display: none;">

    <!-- ==================================================
         玩家資訊
    ================================================== -->

    <section class="card">

      <div class="top-bar">

        <div>
          <h2 style="margin-bottom: 5px;">
            👤 玩家資料
          </h2>

          <div id="user-email">
            👤 玩家：
          </div>
        </div>

        <button
          type="button"
          class="danger-btn"
          onclick="logoutUser()"
        >
          登出
        </button>

      </div>


      <div class="player-grid">

        <div class="stat-box">

          <div class="stat-label">
            等級
          </div>

          <div
            class="stat-value"
            id="player-level"
          >
            Lv.1
          </div>

        </div>


        <div class="stat-box">

          <div class="stat-label">
            金幣
          </div>

          <div
            class="stat-value"
            id="player-gold"
          >
            100
          </div>

        </div>


        <div class="stat-box">

          <div class="stat-label">
            經驗值
          </div>

          <div
            class="stat-value"
            id="current-exp"
          >
            50
          </div>

        </div>

      </div>


      <div class="exp-section">

        <div class="exp-text">

          <span>
            EXP
          </span>

          <span>
            <span id="current-exp">50</span>
            /
            <span id="required-exp">100</span>
          </span>

        </div>

        <div class="progress">
          <div id="exp-bar"></div>
        </div>

      </div>

    </section>


    <!-- ==================================================
         今日統計
    ================================================== -->

    <section class="card">

      <h2>📊 今日統計</h2>

      <div class="summary-grid">

        <div class="summary-box">

          <div class="summary-label">
            完成任務
          </div>

          <div
            class="summary-value"
            id="completed-count"
          >
            0 / 0
          </div>

        </div>


        <div class="summary-box">

          <div class="summary-label">
            完成率
          </div>

          <div
            class="summary-value"
            id="summary-rate"
          >
            0%
          </div>

        </div>


        <div class="summary-box">

          <div class="summary-label">
            今日 EXP
          </div>

          <div
            class="summary-value"
            id="today-exp"
          >
            +0
          </div>

        </div>


        <div class="summary-box">

          <div class="summary-label">
            今日金幣
          </div>

          <div
            class="summary-value"
            id="today-gold"
          >
            +0
          </div>

        </div>

      </div>


      <div class="rate-section">

        <span id="rate-text">
          今日完成率：0%
        </span>

        <div class="progress">
          <div id="rate-bar"></div>
        </div>

      </div>

    </section>


    <!-- ==================================================
         今日任務
    ================================================== -->

    <section class="card">

      <h2>📋 今日任務</h2>

      <div class="filter-buttons">

        <button
          type="button"
          class="filter-btn active"
          onclick="filterTasks('all', this)"
        >
          全部
        </button>

        <button
          type="button"
          class="filter-btn"
          onclick="filterTasks('study', this)"
        >
          📚 學習
        </button>

        <button
          type="button"
          class="filter-btn"
          onclick="filterTasks('toeic', this)"
        >
          📝 多益
        </button>

        <button
          type="button"
          class="filter-btn"
          onclick="filterTasks('focus', this)"
        >
          🎯 專注
        </button>

        <button
          type="button"
          class="filter-btn"
          onclick="filterTasks('health', this)"
        >
          ❤️ 健康
        </button>

        <button
          type="button"
          class="filter-btn"
          onclick="filterTasks('other', this)"
        >
          📌 其他
        </button>

      </div>


      <ul class="task-list">
        <!-- JavaScript 會自動產生任務 -->
      </ul>

    </section>


    <!-- ==================================================
         新增任務
    ================================================== -->

    <section class="card">

      <h2>➕ 新增任務</h2>

      <div class="add-task-row">

        <input
          type="text"
          id="new-task-title"
          placeholder="輸入任務名稱"
          maxlength="100"
        >


        <select id="new-task-category">

          <option value="study">
            📚 學習
          </option>

          <option value="toeic">
            📝 多益
          </option>

          <option value="focus">
            🎯 專注
          </option>

          <option value="health">
            ❤️ 健康
          </option>

          <option value="other">
            📌 其他
          </option>

        </select>


        <select id="new-task-difficulty">

          <option value="easy">
            🟢 簡單
          </option>

          <option value="normal" selected>
            🟡 普通
          </option>

          <option value="hard">
            🔴 困難
          </option>

        </select>

      </div>


      <!-- =========================
           是否重複
      ========================== -->

      <div style="margin-top: 18px;">

        <strong>
          重複方式
        </strong>

        <div class="repeat-options">

          <label class="radio-option">

            <input
              type="radio"
              name="new-task-repeat"
              value="none"
              checked
              onchange="toggleRepeatSettings()"
            >

            不重複

          </label>


          <label class="radio-option">

            <input
              type="radio"
              name="new-task-repeat"
              value="repeat"
              onchange="toggleRepeatSettings()"
            >

            🔁 重複任務

          </label>

        </div>

      </div>


      <!-- =========================
           重複設定
      ========================== -->

      <div
        id="repeat-settings"
        style="display: none;"
      >

        <strong>
          重複週期
        </strong>

        <div class="repeat-options">

          <label class="radio-option">

            <input
              type="radio"
              name="repeat-type"
              value="daily"
              checked
              onchange="toggleWeekdaySettings()"
            >

            每天

          </label>


          <label class="radio-option">

            <input
              type="radio"
              name="repeat-type"
              value="weekly"
              onchange="toggleWeekdaySettings()"
            >

            指定星期

          </label>

        </div>


        <!-- =========================
             星期
        ========================== -->

        <div
          id="weekday-settings"
          style="display: none;"
        >

          <div style="margin-top: 12px;">
            選擇星期：
          </div>

          <div class="weekday-options">

            <label class="checkbox-option">
              <input
                type="checkbox"
                name="repeat-day"
                value="1"
              >
              一
            </label>

            <label class="checkbox-option">
              <input
                type="checkbox"
                name="repeat-day"
                value="2"
              >
              二
            </label>

            <label class="checkbox-option">
              <input
                type="checkbox"
                name="repeat-day"
                value="3"
              >
              三
            </label>

            <label class="checkbox-option">
              <input
                type="checkbox"
                name="repeat-day"
                value="4"
              >
              四
            </label>

            <label class="checkbox-option">
              <input
                type="checkbox"
                name="repeat-day"
                value="5"
              >
              五
            </label>

            <label class="checkbox-option">
              <input
                type="checkbox"
                name="repeat-day"
                value="6"
              >
              六
            </label>

            <label class="checkbox-option">
              <input
                type="checkbox"
                name="repeat-day"
                value="7"
              >
              日
            </label>

          </div>

        </div>


        <!-- =========================
             結束日期
        ========================== -->

        <div style="margin-top: 15px;">

          <label for="repeat-end-date">
            結束日期（可不填）
          </label>

          <input
            type="date"
            id="repeat-end-date"
            style="margin-top: 7px;"
          >

        </div>

      </div>


      <button
        type="button"
        class="primary-btn add-task-button"
        onclick="addTask()"
      >
        ➕ 建立任務
      </button>


      <div id="add-task-message"></div>

    </section>


    <!-- ==================================================
         任務管理
    ================================================== -->

    <section class="card task-management-card">

      <h2>🗂️ 任務管理</h2>

      <p style="opacity: 0.7; margin-top: -5px;">
        管理你的所有任務與重複任務設定
      </p>

      <div
        style="
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 15px;
        "
      >

        <button
          type="button"
          class="management-filter active"
          onclick="filterManagedTasks('all', this)"
        >
          全部
        </button>

        <button
          type="button"
          class="management-filter"
          onclick="filterManagedTasks('once', this)"
        >
          📌 一次性
        </button>

        <button
          type="button"
          class="management-filter"
          onclick="filterManagedTasks('repeat', this)"
        >
          🔁 重複任務
        </button>

      </div>


      <div id="task-management-list">

        <div
          style="
            padding: 20px;
            text-align: center;
            opacity: 0.6;
          "
        >
          尚未載入任務
        </div>

      </div>

    </section>

  </main>

</div>


<!-- ==================================================
     Supabase CDN
================================================== -->

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>


<!-- ==================================================
     你的原本 script.js
================================================== -->

<script src="script.js"></script>

</body>
</html>
