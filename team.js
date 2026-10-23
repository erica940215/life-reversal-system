/* =========================================================
   🛡️ 多人：冒險小隊、團隊王、小隊週任務、加油、好友動態牆
   資料庫：sql/2026-10-23_小隊.sql
   畫面：冒險頁的「小隊」分頁（rpg.js 會呼叫 TeamGame.html()）
========================================================= */
(function () {

  const TEAM_JS_VERSION = "2026-10-23 v1";
  const IMG = "img/team/";

  /* 有圖的就加進來（放在 img/team/），沒加的先用 emoji */
  const TEAM_IMG = new Set(["raid_hydra", "raid_vampire", "raid_abyss", "raid_fog",
    "emblem_wolf", "emblem_eagle", "emblem_dragon", "emblem_lion", "emblem_fox", "emblem_whale", "emblem_phoenix", "emblem_owl",
    "cheer", "like"]);

  const EMBLEMS = [
    ["emblem_wolf", "狼", "🐺"], ["emblem_eagle", "鷹", "🦅"], ["emblem_dragon", "龍", "🐉"], ["emblem_lion", "獅", "🦁"],
    ["emblem_fox", "狐", "🦊"], ["emblem_whale", "鯨", "🐋"], ["emblem_phoenix", "鳳凰", "🐦‍🔥"], ["emblem_owl", "貓頭鷹", "🦉"]
  ];
  const CLASS_INFO = { scholar: ["學者", "📚"], warrior: ["戰士", "⚔️"], guardian: ["守護者", "🛡️"], ranger: ["遊俠", "🏹"] };
  const BOSS_NAME = { sloth_slime: "怠惰史萊姆王", delay_dragon: "拖延巨龍", phone_wraith: "手機幽靈", fatigue_golem: "疲憊石像" };
  const RAID_NAME = { raid_hydra: "無盡滑動九頭蛇", raid_vampire: "熬夜吸血鬼伯爵", raid_abyss: "拖延深淵魔王", raid_fog: "焦慮迷霧巨人" };

  const TM = { status: null, feed: [], error: null, busy: false, loading: false, tried: false, editing: false, pick: "emblem_wolf" };

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = msg => (typeof showToast === "function" ? showToast(msg) : alert(msg));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;

  function art(key, emoji, cls) {
    return TEAM_IMG.has(key) ? `<img class="tm-img ${cls || ""}" src="${IMG}${key}.webp" alt="">` : `<span class="tm-emo ${cls || ""}">${emoji}</span>`;
  }
  const emblemArt = (key, cls) => { const e = EMBLEMS.find(x => x[0] === key) || EMBLEMS[0]; return art(e[0], e[2], cls); };
  const avatar = (cls, frame, size) => (window.FunGame && window.FunGame.avatar ? window.FunGame.avatar(cls, frame, size) : `<span class="tm-emo">${(CLASS_INFO[cls] || ["", "🙂"])[1]}</span>`);

  function ago(t) {
    const m = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 60000));
    if (m < 1) return "剛剛";
    if (m < 60) return `${m} 分鐘前`;
    if (m < 1440) return `${Math.floor(m / 60)} 小時前`;
    return `${Math.floor(m / 1440)} 天前`;
  }

  function gearName(key) {
    const cat = window.RpgGame && window.RpgGame.state && window.RpgGame.state.status && window.RpgGame.state.status.catalog;
    return (cat && cat.gear && cat.gear[key] && cat.gear[key].name) || key;
  }


  /* ---------- 資料 ---------- */

  async function load() {
    if (!hasDb()) return;
    TM.loading = true;
    try {
      const [s, f] = await Promise.all([db.rpc("team_status"), db.rpc("feed_list")]);
      if (s.error) throw s.error;
      if (!s.data) throw new Error("沒有讀到資料");
      TM.status = s.data;
      TM.feed = (f && !f.error && f.data) || [];
      TM.error = null;
    } catch (error) {
      const msg = String(error && (error.message || error.code) || error);
      TM.error = /team_status|function|schema cache|PGRST/i.test(msg) ? "setup" : msg;
    }
    TM.loading = false;
    rerender();
  }

  async function rpc(name, args, okMsg) {
    if (TM.busy) return null;
    TM.busy = true;
    try {
      const { data, error } = await db.rpc(name, args || {});
      if (error) { toast("❌ " + error.message); return null; }
      if (okMsg) toast(okMsg);
      return data;
    } finally {
      TM.busy = false;
    }
  }

  function rerender() {
    if (window.RpgGame && window.RpgGame.state && ["team", "boss"].includes(window.RpgGame.state.tab)) window.RpgGame.render();
  }


  /* ---------- 沒有小隊：建立、收到的邀請 ---------- */

  function emblemPicker() {
    return `<div class="tm-emblems">${EMBLEMS.map(([k, n, e]) => `<button type="button" class="tm-emb ${TM.pick === k ? "on" : ""}" data-tm="pick" data-v="${k}">
      ${art(k, e, "tm-emb-ic")}<span>${n}</span></button>`).join("")}</div>`;
  }

  function noTeamHtml() {
    const st = TM.status;
    const inv = (st.invites || []).map(i => `<div class="tm-row">${emblemArt(i.emblem, "tm-ic")}
        <div class="tm-grow"><b>${esc(i.name)}</b><span class="rp-sub">${esc(i.by)} 邀請你・${i.count} / 5 人</span></div>
        <button type="button" class="btn btn-primary btn-small" data-tm="accept" data-v="${i.team}">加入</button>
        <button type="button" class="btn btn-small" data-tm="decline" data-v="${i.team}">不要</button></div>`).join("");
    return `${inv ? `<div class="card rp-card"><h3>📨 小隊邀請</h3>${inv}</div>` : ""}
      <div class="card rp-card"><h3>🛡️ 建立冒險小隊</h3>
        <p class="rp-note">找 1～4 個好友一起組隊：一起打團隊王、一起完成週任務。隊裡職業越多樣，傷害越高。</p>
        <input id="tm-name" class="tm-input" maxlength="16" placeholder="隊名（最多 16 字）">
        ${emblemPicker()}
        <button type="button" class="btn btn-primary tm-wide" data-tm="create">建立小隊</button></div>`;
  }


  /* ---------- 有小隊：隊伍、團隊王、週任務 ---------- */

  function teamHtml() {
    const st = TM.status;
    const t = st.team;
    const members = st.members || [];
    const r = st.raid || {};
    const info = (st.raid_bosses || []).find(b => b.key === r.boss_key) || { name: RAID_NAME[r.boss_key] || "團隊王", emoji: "🐲", desc: "" };
    const left = Math.max(0, r.hp - r.dmg);
    const pct = r.hp ? Math.round(left / r.hp * 100) : 0;
    const killed = !!r.killed_at;
    const bonus = Math.round(((t.bonus || 1) - 1) * 100);
    const totalDmg = members.reduce((s, m) => s + (m.raid_dmg || 0), 0) || 1;

    const head = `<div class="card rp-card tm-head"><div class="tm-row">${emblemArt(t.emblem, "tm-emb-big")}
        <div class="tm-grow"><h3>${esc(t.name)}</h3><span class="rp-sub">${members.length} / 5 人・小隊加成 +${bonus}%</span></div>
        ${t.owner ? `<button type="button" class="btn btn-small" data-tm="edit">✏️</button>` : ""}</div>
        ${TM.editing ? `<input id="tm-name" class="tm-input" maxlength="16" value="${esc(t.name)}">${emblemPicker()}
          <div class="rp-row"><button type="button" class="btn btn-primary btn-small" data-tm="save">儲存</button>
          <button type="button" class="btn btn-small" data-tm="edit">取消</button></div>` : ""}
        <p class="rp-note">加成：每多一種職業 +5%（最多 15%），每位守護者 +5%（最多 10%）。</p></div>`;

    const raid = `<div class="card rp-card tm-raid ${killed ? "dead" : ""}"><div class="tm-row">${art(r.boss_key, info.emoji, "tm-raid-ic")}
        <div class="tm-grow"><h3>🐲 ${esc(info.name)}・第 ${r.tier} 階</h3><span class="rp-sub">團隊王・每週一換</span></div></div>
        <p class="rp-note">${esc(info.desc)}</p>
        <div class="rp-hp"><div class="rp-hp-bar" style="width:${pct}%"></div><span>${killed ? "已打倒 🎉" : `${left} / ${r.hp}`}</span></div>
        <div class="tm-shares">${members.slice().sort((a, b) => b.raid_dmg - a.raid_dmg).map(m => `<div class="tm-share">
          <span class="tm-share-n">${esc(m.name)}</span><div class="tm-share-bar"><i style="width:${Math.round((m.raid_dmg || 0) / totalDmg * 100)}%"></i></div>
          <b>${m.raid_dmg || 0}</b></div>`).join("")}</div>
        <p class="rp-note">${killed ? "這週打倒了！每個人都拿到團隊寶箱，到「驚喜」打開。" : "你打每週王的每一下，同樣的傷害（加上小隊加成）也會打在這裡。自己的王倒了之後，出擊會全部打團隊王。"}</p>
        ${killed ? "" : `<button type="button" class="btn btn-primary tm-wide" data-tm="goboss">⚔️ 去出擊</button>`}</div>`;

    const q = (st.quests && st.quests.list) || [];
    const quests = `<div class="card rp-card"><h3>🎯 小隊週任務 ${(st.quests && st.quests.done) || 0} / 3</h3>
      ${q.map(x => { const p = Math.min(100, Math.round(x.now / x.goal * 100)); const now = x.key === "focus" ? `${Math.floor(x.now / 60)} 小時 ${x.now % 60} 分` : `${x.now} ${x.unit}`;
        const goal = x.key === "focus" ? `${x.goal / 60} 小時` : `${x.goal} ${x.unit}`;
        return `<div class="tm-quest ${p >= 100 ? "ok" : ""}"><div class="tm-row"><span class="tm-grow">${p >= 100 ? "✅" : "⬜"} ${esc(x.name)}</span><span class="rp-sub">${now} / ${goal}</span></div>
          <div class="tm-qbar"><i style="width:${p}%"></i></div></div>`; }).join("")}
      <p class="rp-note">每完成一項，每個人拿鐵寶箱 1 個；三項全清再拿金寶箱 1 個，還有 25% 機會拿星光寶箱。目標依人數調整。</p></div>`;

    const mem = members.map(m => `<div class="tm-row tm-mem">${avatar(m.class, m.frame, 44)}
        <div class="tm-grow"><b>${esc(m.name)}${m.owner ? " 👑" : ""}${m.me ? "（你）" : ""}</b>
          <span class="rp-sub">${m.class ? CLASS_INFO[m.class][1] + " " + CLASS_INFO[m.class][0] : "還沒選職業"}</span>
          <span class="rp-sub">今天：專注 ${m.focus_min} 分・任務 ${m.tasks} 個・出擊 ${m.attacks} 次</span></div>
        ${t.owner && !m.me ? `<button type="button" class="btn btn-small" data-tm="kick" data-v="${m.id}" data-n="${esc(m.name)}">請離開</button>` : ""}</div>`).join("");

    const canInvite = (st.friends || []).filter(f => !f.team);
    const invite = members.length < 5 ? `<div class="tm-sub">邀請好友</div>${canInvite.length ? canInvite.map(f => `<div class="tm-row">${avatar(f.class, f.frame, 36)}
        <span class="tm-grow">${esc(f.name)}</span>
        <button type="button" class="btn btn-small ${f.invited ? "" : "btn-primary"}" data-tm="invite" data-v="${f.id}" ${f.invited ? "disabled" : ""}>${f.invited ? "已邀請" : "邀請"}</button></div>`).join("")
        : `<p class="rp-note">沒有可以邀請的好友（好友都已經有小隊了，或還沒加好友）。</p>`}` : "";

    return head + raid + quests + `<div class="card rp-card"><h3>👥 隊員</h3>${mem}${invite}
      <button type="button" class="btn btn-small tm-leave" data-tm="leave">離開小隊</button></div>`;
  }


  /* ---------- 加油、動態牆（有沒有小隊都看得到） ---------- */

  function cheerHtml() {
    const st = TM.status;
    const fr = st.friends || [];
    const got = st.cheers_unused || 0;
    return `<div class="card rp-card"><div class="tm-row">${art("cheer", "📣", "tm-ic")}<div class="tm-grow"><h3>幫好友加油</h3>
        <span class="rp-sub">今天加油 ${st.cheers_given || 0} 次（前 3 次各拿星屑 1）</span></div></div>
      ${got ? `<div class="tm-cheered">📣 今天有 ${st.cheers_today} 人幫你加油！下一次出擊傷害 +${Math.min(got, 3) * 10}%</div>` : ""}
      ${fr.length ? fr.map(f => `<div class="tm-row">${avatar(f.class, f.frame, 36)}<span class="tm-grow">${esc(f.name)}</span>
        <button type="button" class="btn btn-small ${f.cheered ? "" : "btn-primary"}" data-tm="cheer" data-v="${f.id}" ${f.cheered ? "disabled" : ""}>${f.cheered ? "已加油 ✓" : "📣 加油"}</button></div>`).join("")
        : `<p class="rp-note">加好友之後就能互相加油。</p>`}
      <p class="rp-note">被加油的人，下一次出擊每個加油 +10%（最多 3 個）。</p></div>`;
  }

  function feedText(e) {
    const d = e.data || {};
    switch (e.kind) {
      case "legend": return `抽到了傳說裝備「${esc(gearName(d.key))}」✨`;
      case "boss": return `打倒了第 ${d.tier} 階的「${esc(BOSS_NAME[d.boss] || "每週王")}」⚔️`;
      case "set": return `湊滿了「${esc(d.name || d.set)}」🧩`;
      case "collect": return `集滿了${d.series === "z" ? "星座寶寶" : "序光小怪獸"}全系列 🥚`;
      case "raid": return `帶著「${esc(d.team_name)}」打倒了第 ${d.tier} 階「${esc(RAID_NAME[d.boss] || "團隊王")}」🐲`;
      case "quest": return `「${esc(d.team_name)}」完成了本週全部小隊任務 🎯`;
      default: return esc(e.kind);
    }
  }

  function feedHtml() {
    const list = TM.feed || [];
    return `<div class="card rp-card"><h3>📰 好友動態</h3>
      ${list.length ? list.map(e => `<div class="tm-feed">${avatar(e.class, e.frame, 36)}
        <div class="tm-grow"><div><b>${esc(e.name)}</b>${e.me ? "（你）" : ""} ${feedText(e)}</div><span class="rp-sub">${ago(e.at)}</span></div>
        <button type="button" class="tm-like ${e.liked ? "on" : ""}" data-tm="like" data-v="${e.id}">${art("like", e.liked ? "❤️" : "🤍", "tm-like-ic")} ${e.likes || ""}</button></div>`).join("")
        : `<p class="rp-note">最近 7 天還沒有動態。打倒每週王、抽到傳說、湊滿套裝都會出現在這裡。</p>`}</div>`;
  }


  /* ---------- 整頁 ---------- */

  function html() {
    if (!hasDb()) return `<div class="card rp-card"><p class="rp-note">登入之後才能組隊。</p></div>`;
    if (TM.error === "setup") return `<div class="card rp-card"><p class="rp-note">⚠️ 小隊的資料庫還沒設定：到 Supabase 的 SQL Editor 執行 <b>sql/2026-10-23_小隊.sql</b>。</p></div>`;
    if (TM.error) return `<div class="card rp-card"><p class="rp-note">載入失敗：${esc(TM.error)}</p></div>`;
    if (!TM.status) { if (!TM.loading && !TM.tried) { TM.tried = true; load(); } return `<div class="card rp-card"><p class="rp-note">載入中…</p></div>`; }
    return (TM.status.team ? teamHtml() : noTeamHtml()) + cheerHtml() + feedHtml() + `<p class="rp-ver">小隊 ${TEAM_JS_VERSION}</p>`;
  }


  /* ---------- 點擊 ---------- */

  async function onClick(e) {
    const el = e.target.closest("[data-tm]");
    if (!el) return;
    const act = el.dataset.tm;
    const v = el.dataset.v;
    const name = () => (document.getElementById("tm-name") || {}).value || "";

    if (act === "pick") { const keep = name(); TM.pick = v; rerender(); const i = document.getElementById("tm-name"); if (i) i.value = keep; return; }
    if (act === "edit") { TM.editing = !TM.editing; TM.pick = TM.status.team.emblem; rerender(); return; }
    if (act === "goboss") { window.RpgGame.state.tab = "boss"; window.RpgGame.render(); return; }

    let ok = null;
    if (act === "create") ok = await rpc("team_create", { p_name: name(), p_emblem: TM.pick }, "🛡️ 小隊建立好了！去邀請好友吧");
    else if (act === "save") { ok = await rpc("team_update", { p_name: name(), p_emblem: TM.pick }, "改好了"); if (ok) TM.editing = false; }
    else if (act === "invite") ok = await rpc("team_invite", { p_user: v }, "📨 邀請送出了");
    else if (act === "accept") ok = await rpc("team_answer", { p_team: Number(v), p_accept: true }, "🎉 加入小隊了！");
    else if (act === "decline") ok = await rpc("team_answer", { p_team: Number(v), p_accept: false });
    else if (act === "leave") { if (!confirm("確定要離開小隊？本週你打的團隊王傷害會留在原本的隊伍。")) return; ok = await rpc("team_leave", {}, "已經離開小隊"); }
    else if (act === "kick") { if (!confirm(`確定要請「${el.dataset.n}」離開小隊？`)) return; ok = await rpc("team_kick", { p_user: v }, "已經請他離開"); }
    else if (act === "cheer") { const d = await rpc("cheer_friend", { p_user: v }); if (d) { toast(d.dust ? "📣 加油送出了！星屑 +1" : "📣 加油送出了！"); ok = d; } }
    else if (act === "like") {
      const d = await rpc("feed_like", { p_event: Number(v) });
      if (d) { const it = TM.feed.find(x => String(x.id) === v); if (it) { it.liked = d.liked; it.likes = (it.likes || 0) + (d.liked ? 1 : -1); } rerender(); }
      return;
    }
    if (ok) await load();
  }


  /* ---------- 樣式 ---------- */

  function injectStyle() {
    if (document.getElementById("tm-style")) return;
    const css = document.createElement("style");
    css.id = "tm-style";
    css.textContent = `
      .tm-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
      .tm-grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
      .tm-grow h3 { margin: 0; }
      .tm-emo { display: inline-flex; align-items: center; justify-content: center; line-height: 1; }
      .tm-img { object-fit: contain; }
      .tm-ic { width: 40px; height: 40px; font-size: 28px; }
      .tm-emb-big { width: 64px; height: 64px; font-size: 46px; }
      .tm-raid-ic { width: 96px; height: 96px; font-size: 64px; animation: rp-bob 2.4s ease-in-out infinite; }
      .tm-raid.dead .tm-raid-ic { filter: grayscale(1); opacity: .5; animation: none; }
      .tm-input { width: 100%; box-sizing: border-box; padding: 10px 12px; margin: 6px 0; border-radius: 10px; border: 1px solid rgba(127,127,127,.3); background: rgba(127,127,127,.08); color: inherit; font-size: 15px; }
      .tm-emblems { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 6px 0; }
      .tm-emb { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 2px; border-radius: 12px; border: 1px solid rgba(127,127,127,.25); background: transparent; color: inherit; font-size: 12px; cursor: pointer; }
      .tm-emb.on { border-color: #6c4bd8; background: rgba(108,75,216,.15); }
      .tm-emb-ic { width: 40px; height: 40px; font-size: 30px; }
      .tm-wide { width: 100%; margin-top: 8px; }
      .tm-shares { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; }
      .tm-share { display: flex; align-items: center; gap: 8px; font-size: 13px; }
      .tm-share-n { width: 70px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .tm-share-bar { flex: 1; height: 8px; border-radius: 99px; background: rgba(127,127,127,.18); overflow: hidden; }
      .tm-share-bar i { display: block; height: 100%; background: linear-gradient(90deg, #6c4bd8, #ab47bc); }
      .tm-quest { margin: 8px 0; font-size: 14px; }
      .tm-quest.ok { font-weight: 700; }
      .tm-qbar { height: 8px; border-radius: 99px; background: rgba(127,127,127,.18); overflow: hidden; }
      .tm-qbar i { display: block; height: 100%; background: linear-gradient(90deg, #42a5f5, #66bb6a); }
      .tm-mem { border-bottom: 1px solid rgba(127,127,127,.12); }
      .tm-sub { font-weight: 800; margin: 12px 0 2px; font-size: 14px; }
      .tm-leave { margin-top: 12px; opacity: .8; }
      .tm-cheered { margin: 6px 0; padding: 8px 10px; border-radius: 10px; background: rgba(255,167,38,.16); font-weight: 700; font-size: 14px; }
      .tm-feed { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(127,127,127,.12); font-size: 14px; line-height: 1.5; }
      .tm-like { display: inline-flex; align-items: center; gap: 3px; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 13px; padding: 4px; }
      .tm-like-ic { width: 20px; height: 20px; font-size: 16px; }
      .tm-like:not(.on) img.tm-like-ic { filter: grayscale(1); opacity: .45; }
      .tm-like.on { color: #ef5350; font-weight: 700; }
    `;
    document.head.appendChild(css);
  }

  function boot() {
    injectStyle();
    document.addEventListener("click", onClick);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.TeamGame = { version: TEAM_JS_VERSION, html, reload: load, state: TM };

})();
