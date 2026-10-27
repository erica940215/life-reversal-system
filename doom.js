/* =========================================================
   序光計畫：☢️ 末世：序光（遊戲的新一層）
   - 真實行為 → 物資：任務、專案打勾、專注
   - 每天：晨間廣播、撿物資、隨機事件、訪客
   - 搜刮（抽獎）、基地設施、同伴、收藏品
   - 每週一章：目標寶箱、抉擇、週報
   只在遊戲模式開著的時候出現。
   資料庫：sql/2026-10-28_末世.sql
   圖片：放在 img/doom/<分類>/<id>.webp，有圖就用圖，沒有就顯示 emoji（不用改程式）
========================================================= */

(function () {

  const DOOM_JS_VERSION = "2026-10-28 v1";
  const IMG = "img/doom/";

  const DM = { cat: null, s: null, error: null, busy: false, tab: "today",
    reveal: null, news: null, flash: null };

  /* ---------- 小工具 ---------- */

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = msg => (typeof showToast === "function" ? showToast(msg) : alert(msg));
  const hasDb = () => typeof db !== "undefined" && db && typeof currentUser !== "undefined" && currentUser;
  const gameOn = () => (typeof gameIsOn === "function" ? gameIsOn() : document.body.classList.contains("game-mode-on"));
  const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} };

  /* 沒有圖的就記起來，這次瀏覽都直接用 emoji */
  const MISS = (() => {
    try { return new Set(JSON.parse(sessionStorage.getItem("doomMiss") || "[]")); } catch (_) { return new Set(); }
  })();
  function miss(img) {
    const key = img.dataset.k;
    MISS.add(key);
    try { sessionStorage.setItem("doomMiss", JSON.stringify([...MISS])); } catch (_) {}
    const span = document.createElement("span");
    span.className = "dm-emo";
    span.textContent = img.dataset.e;
    img.replaceWith(span);
  }
  function ic(kind, id, emoji, cls = "") {
    const key = kind + "/" + id;
    if (MISS.has(key)) return `<span class="dm-emo ${cls}">${esc(emoji)}</span>`;
    return `<img class="dm-img ${cls}" src="${IMG}${key}.webp" alt="" data-k="${esc(key)}" data-e="${esc(emoji)}" onerror="DoomGame.miss(this)">`;
  }

  const find = (list, id) => (DM.cat && DM.cat[list] || []).find(x => x.id === id) || null;
  const resInfo = k => (DM.cat && DM.cat.res[k]) || { name: k, emoji: "•" };
  const TIER_COLOR = { c: "#9e9e9e", r: "#4caf50", l: "#42a5f5", x: "#ab47bc", s: "#ffb300" };
  const tierName = t => (DM.cat && DM.cat.tiers[t]) || t;

  /* 物資 / 獎勵變動 → 小標籤 */
  function gainChip(g) {
    if (g.k === "companion") { const c = find("companions", g.id); return `<span class="dm-chip big">${c ? c.emoji + " " + esc(c.name) : "同伴"} 加入了！</span>`; }
    if (g.k === "relic") { const r = find("relics", g.id); return `<span class="dm-chip big tier-${r ? r.tier : "x"}">${r ? r.emoji + " " + esc(r.name) : "收藏品"}</span>`; }
    if (g.k === "facility") { const f = find("facilities", g.id); return `<span class="dm-chip big">${f ? f.emoji + " " + esc(f.name) : "設施"} 升到 Lv${g.lv}</span>`; }
    const r = resInfo(g.k);
    return `<span class="dm-chip ${g.n < 0 ? "neg" : ""}">${r.emoji} ${g.n > 0 ? "+" : ""}${g.n}${g.note ? `<small>（${esc(g.note)}）</small>` : ""}</span>`;
  }
  const gainsHtml = arr => (arr && arr.length) ? `<div class="dm-chips">${arr.map(gainChip).join("")}</div>` : "";
  const gainsText = arr => (arr || []).map(g => {
    if (g.k === "companion") { const c = find("companions", g.id); return c ? `${c.emoji}${c.name}加入` : "新同伴"; }
    if (g.k === "relic") { const r = find("relics", g.id); return r ? `${r.emoji}${r.name}` : "收藏品"; }
    if (g.k === "facility") { const f = find("facilities", g.id); return f ? `${f.emoji}${f.name} Lv${g.lv}` : "設施升級"; }
    const r = resInfo(g.k);
    return `${r.emoji}${g.n > 0 ? "+" : ""}${g.n}`;
  }).join(" ");

  const costText = cost => Object.entries(cost || {}).map(([k, n]) => `${resInfo(k).emoji}${n}`).join(" ");
  function canPay(cost) {
    const st = DM.s && DM.s.state;
    if (!st) return false;
    return Object.entries(cost || {}).every(([k, n]) => (st[k] || 0) >= n);
  }


  /* ---------- 載入 ---------- */

  async function load() {
    if (!hasDb()) return;
    try {
      if (!DM.cat) {
        const { data, error } = await db.rpc("doom_catalog");
        if (error) throw error;
        DM.cat = data;
      }
      const { data, error } = await db.rpc("doom_status");
      if (error) throw error;
      DM.s = data;
      DM.error = null;
      try { localStorage.setItem("doomStarted", "1"); } catch (_) {}
      collectNews(data);
    } catch (error) {
      const msg = String(error && (error.message || error.code) || error);
      DM.error = /doom_|function|schema cache|PGRST/i.test(msg) ? "setup" : msg;
      console.warn("末世載入失敗：", error);
    }
    render();
  }

  /* 進頁面時的好消息：開局、跨日結算、收到成果 */
  function collectNews(d) {
    const items = [];
    if (d.fresh) items.push({ icon: "🎒", title: "末世開始了", body: "你背著一包開局行李醒來。完成任務、專案打勾、專注，都會變成物資。", gains: [
      { k: "food", n: 12 }, { k: "water", n: 12 }, { k: "parts", n: 25 }, { k: "scav", n: 5 }] });
    if (d.settle && d.settle.days) {
      const s = d.settle;
      const gains = ["food", "water", "parts", "scav", "hp", "morale"].filter(k => s[k]).map(k => ({ k, n: s[k] }));
      items.push({ icon: "☀️", title: `撐過了第 ${s.day_no} 天`, body: (s.days > 1 ? `離開了 ${s.days} 天。` : "") +
        (s.short ? "物資不夠，基地受了點傷。多做幾件事補回來吧。" : "設施和同伴都在努力工作。"), gains });
    }
    if (d.harvest && d.harvest.gains && d.harvest.gains.length) {
      const h = d.harvest;
      const src = [h.tasks ? `任務 ${h.tasks} 個` : "", h.steps ? `專案打勾 ${h.steps} 個` : "", h.focus_min ? `專注 ${h.focus_min} 分鐘` : ""].filter(Boolean).join("、");
      items.push({ icon: "📦", title: "努力變成了物資", body: src ? `你完成了${src}。` : "", gains: h.gains });
    }
    if (items.length) DM.news = (DM.news || []).concat(items);
  }

  async function call(name, args, after) {
    if (DM.busy) return;
    DM.busy = true;
    try {
      const { data, error } = await db.rpc(name, args || {});
      if (error) { toast("❌ " + error.message); return; }
      if (after) after(data);
      const { data: s } = await db.rpc("doom_status");
      if (s) { DM.s = s; collectNews(s); }
    } catch (e) {
      toast("❌ " + (e.message || e));
    } finally {
      DM.busy = false;
      render();
    }
  }


  /* ---------- 畫面 ---------- */

  function bar(v, max, color) {
    const p = Math.max(0, Math.min(100, Math.round(v / max * 100)));
    return `<span class="dm-bar"><i style="width:${p}%;background:${color}"></i></span>`;
  }

  function headHtml() {
    const st = DM.s.state, wk = DM.s.week;
    const res = ["food", "water", "parts", "scav"].map(k =>
      `<div class="dm-res" data-dm="tab" data-v="${k === "scav" ? "draw" : "base"}">${ic("res", k, resInfo(k).emoji)}<b>${st[k]}</b><small>${resInfo(k).name}</small></div>`).join("");
    const bc = DM.s.today && DM.s.today.broadcast ? find("broadcasts", DM.s.today.broadcast) : null;
    const buff = bc && bc.buff ? DM.cat.buffs[bc.buff] : null;
    return `<div class="card dm-head ${st.hp <= 0 ? "broken" : ""}">
      <div class="dm-top"><div><div class="dm-day">☢️ 末世第 ${st.day_no} 天</div>
        <div class="dm-sub">${esc(wk.title)}</div></div>
        <div class="dm-luck" title="幸運越高，搜刮越容易出好東西">🍀 幸運 ${DM.s.luck}${buff ? `<br><small>${buff.emoji} ${esc(buff.name)}</small>` : ""}</div></div>
      <div class="dm-resrow">${res}</div>
      <div class="dm-meters">
        <div>${ic("res", "hp", "🛡️", "sm")} 基地 ${st.hp}/100 ${bar(st.hp, 100, st.hp > 40 ? "#66bb6a" : st.hp > 0 ? "#ffa726" : "#ef5350")}</div>
        <div>${ic("res", "morale", "🔥", "sm")} 士氣 ${st.morale}/100 ${bar(st.morale, 100, "#ff7043")}</div>
      </div>
      ${st.hp <= 0 ? `<p class="dm-warn">⚠️ 基地損壞：設施產量減半、幸運 -5。到「基地」修理。</p>` : ""}
    </div>`;
  }

  function newsHtml() {
    if (!DM.news || !DM.news.length) return "";
    return DM.news.map((n, i) => `<div class="card dm-news pop" style="animation-delay:${i * 120}ms">
      <div class="dm-news-h"><span class="dm-big">${n.icon}</span><div><b>${esc(n.title)}</b><p>${esc(n.body)}</p></div></div>
      ${gainsHtml(n.gains)}</div>`).join("") +
      `<button type="button" class="btn dm-btn ghost wide" data-dm="newsok">好，收下了</button>`;
  }

  function reportHtml() {
    const w = DM.s.lastWeek;
    if (!w) return "";
    const ok = w.met;
    return `<div class="card dm-report pop"><h3>📰 末世週報｜${esc(w.title)}</h3>
      <div class="dm-stats">
        <div><b>${w.actions}</b><small>完成的事</small></div>
        <div><b>${Math.round(w.focus_min / 6) / 10}</b><small>專注小時</small></div>
        <div><b>${w.draws}</b><small>搜刮次數</small></div>
        <div><b>${w.rare}</b><small>稀有以上</small></div></div>
      <p>${ok ? (w.double ? "🏆 超額完成！這一週你是最強的倖存者。" : "✅ 本章目標達成，基地越來越像樣了。") : "這週有點辛苦，沒關係，新的一章重新開始。"}
      ${w.choice ? `<br>你的選擇：「${esc(w.choice.label)}」` : ""}</p>
      ${ok && w.claimed < (w.double ? 2 : 1) ? `<p class="dm-warn">上週還有寶箱沒領，記得週目標達成當週就要領喔。</p>` : ""}
      <button type="button" class="btn dm-btn wide" data-dm="report">翻到下一章 →</button></div>`;
  }

  /* 事件卡：今日事件、訪客 */
  function eventCard(slot) {
    const t = DM.s.today || {};
    const e = slot === "event" ? find("events", t.event_id) : find("visitors", t.visitor_id);
    if (!e) return "";
    const done = slot === "event" ? t.event_done : t.visitor_done;
    const kindTag = slot === "visitor" ? "訪客" : e.kind === "good" ? "好事" : e.kind === "bad" ? "麻煩" : "怪事";
    const head = `<div class="dm-ev-h">${ic(slot === "event" ? "event" : "visitor", e.id, e.emoji, "big")}<div>
      <span class="dm-tag ${slot === "visitor" ? "visit" : e.kind}">${kindTag}</span><b>${esc(e.title)}</b><p>${esc(e.text)}</p></div></div>`;
    if (done) {
      return `<div class="card dm-ev done">${head}<div class="dm-out">➜ ${esc(done.label)}：${esc(done.text)}</div>
        ${gainsHtml((done.paid || []).concat(done.gains || []))}</div>`;
    }
    const opts = e.opts.map((o, i) => {
      const ok = canPay(o.cost);
      return `<button type="button" class="btn dm-btn ${i ? "ghost" : ""}" data-dm="resolve" data-slot="${slot}" data-v="${i}" ${ok ? "" : "disabled"}>
        ${esc(o.label)}${o.cost ? `<small> ${costText(o.cost)}</small>` : ""}${o.outs.length > 1 ? " <small>🎲</small>" : ""}</button>`;
    }).join("");
    return `<div class="card dm-ev ${slot === "event" ? e.kind : "visit"}">${head}<div class="dm-opts">${opts}</div></div>`;
  }

  function todayHtml() {
    const t = DM.s.today || {};
    const bc = find("broadcasts", t.broadcast);
    const buff = bc && bc.buff ? DM.cat.buffs[bc.buff] : null;
    const pick = t.picked
      ? `<div class="card dm-pick done"><b>🧺 今天撿過了</b>${gainsHtml(t.picked)}</div>`
      : `<button type="button" class="card dm-pick ready" data-dm="pickup"><span class="dm-big">🧺</span><div><b>出門撿物資</b><p>每天一次，點一下看看今天撿到什麼。</p></div></button>`;
    const logs = (DM.s.logs || []).slice(0, 6).map(l =>
      `<li class="${l.tier ? "tier-" + l.tier : ""}">${esc(l.body)}</li>`).join("");
    return `
      ${bc ? `<div class="card dm-radio">${ic("ui", "radio", "📻", "big")}<div><small>序光電台・晨間廣播</small><p>「${esc(bc.text)}」</p>
        ${buff ? `<span class="dm-buff">${buff.emoji} ${esc(buff.name)}</span>` : ""}</div></div>` : ""}
      ${pick}
      ${eventCard("event")}
      ${eventCard("visitor")}
      <div class="card dm-how"><b>怎麼拿物資？</b>
        <p>✅ 完成任務：🥫+1 💧+1 🎟️+1</p>
        <p>🎯 專案每打勾 2 個：🥫+1 💧+1 🎟️+1</p>
        <p>⏱️ 專注每 30 分鐘：🔩+2；每 1 小時：🎟️+1</p>
        <p class="dm-note">做完回來這頁就會自動收。今天做越多事，搜刮越幸運。每天會吃掉 🥫1 💧1。</p></div>
      ${logs ? `<div class="card"><b>📓 最近的紀錄</b><ul class="dm-log">${logs}</ul></div>` : ""}`;
  }

  function drawHtml() {
    const st = DM.s.state;
    const left = 10 - st.pity;
    let res = "";
    if (DM.reveal) {
      const best = DM.reveal.reduce((b, r) => "crlxs".indexOf(r.tier) > "crlxs".indexOf(b) ? r.tier : b, "c");
      const banner = { s: "🌟 傳說！", x: "💜 史詩！", l: "💙 稀有！" }[best];
      res = `${banner ? `<div class="dm-banner tier-${best}">${banner}</div>` : ""}
        <div class="dm-cards">${DM.reveal.map((r, i) => {
          const e = find("loot", r.id) || { name: r.id, emoji: "❔" };
          return `<div class="dm-card tier-${r.tier}" style="animation-delay:${i * 110}ms">
            <span class="dm-tier">${tierName(r.tier)}</span>${ic("loot", r.id, e.emoji, "big")}
            <b>${esc(e.name)}</b><small>${esc(gainsText(r.gains))}</small></div>`;
        }).join("")}</div>`;
    }
    return `<div class="card dm-draw">
      <div class="dm-draw-h">${ic("ui", "scav", "🎟️", "big")}<div><b>搜刮券 ${st.scav} 張</b>
        <p>幸運 ${DM.s.luck}・再 ${left} 抽內必出稀有以上</p></div></div>
      <div class="dm-opts">
        <button type="button" class="btn dm-btn" data-dm="draw" data-v="1" ${st.scav >= 1 ? "" : "disabled"}>搜刮 ×1</button>
        <button type="button" class="btn dm-btn gold" data-dm="draw" data-v="10" ${st.scav >= 10 ? "" : "disabled"}>搜刮 ×10</button></div>
      <p class="dm-note">普通 → 精良 → 稀有 → 史詩 → 傳說。可能搜到物資、星屑、金幣、星願券、召喚券、同伴、設施藍圖和收藏品。</p>
    </div>${res}`;
  }

  function baseHtml() {
    const st = DM.s.state;
    const eng = (st.companions || []).includes("engineer");
    const facs = DM.cat.facilities.map(f => {
      const lv = st.facilities[f.id] || 0;
      const parts = Math.round((20 + 20 * lv) * (eng ? 0.85 : 1)), food = 2 * lv;
      const ok = lv < 10 && st.parts >= parts && st.food >= food;
      return `<div class="dm-fac">${ic("facility", f.id, f.emoji, "big")}<div class="dm-fac-b"><b>${esc(f.name)} <span class="dm-lv">Lv${lv}</span></b>
        <small>${esc(f.desc)}</small>${bar(lv, 10, "#8d6e63")}</div>
        <button type="button" class="btn dm-btn small" data-dm="build" data-v="${f.id}" ${ok ? "" : "disabled"}>${lv >= 10 ? "滿級" : `升級<br><small>🔩${parts}${food ? " 🥫" + food : ""}</small>`}</button></div>`;
    }).join("");
    const merchant = (st.companions || []).includes("merchant");
    const k = merchant ? 6 : 8;
    const traded = (DM.s.today && DM.s.today.traded) || 0;
    const comps = (st.companions || []).map(id => find("companions", id)).filter(Boolean);
    return `<div class="card"><h3>🏚️ 基地設施</h3><p class="dm-note">設施每天自動生產；每個最高 10 級。</p>${facs}</div>
      <div class="card"><h3>🔧 維修與交換</h3>
        <div class="dm-fac">${ic("ui", "repair", "🔧", "big")}<div class="dm-fac-b"><b>修理基地</b><small>🔩15 → 🛡️+25</small></div>
          <button type="button" class="btn dm-btn small" data-dm="repair" ${st.hp < 100 && st.parts >= 15 ? "" : "disabled"}>修理</button></div>
        <div class="dm-fac">${ic("ui", "trade", "🔁", "big")}<div class="dm-fac-b"><b>換搜刮券</b><small>🥫${k} 💧${k} → 🎟️1（今天還能換 ${5 - traded} 次）</small></div>
          <button type="button" class="btn dm-btn small" data-dm="trade" ${traded < 5 && st.food >= k && st.water >= k ? "" : "disabled"}>交換</button></div></div>
      <div class="card"><h3>🤝 同伴 ${comps.length}/${DM.cat.companions.length}</h3>
        ${comps.length ? comps.map(c => `<div class="dm-fac">${ic("companion", c.id, c.emoji, "big")}<div class="dm-fac-b"><b>${esc(c.name)}</b><small>${esc(c.perk)}</small></div></div>`).join("")
          : `<p class="dm-note">還沒有同伴。訪客、搜刮、事件都可能遇到願意留下來的人（和動物）。</p>`}
        <p class="dm-note">每 3 個同伴，每天多吃 🥫1 💧1。</p></div>`;
  }

  function chapterHtml() {
    const w = DM.s.week;
    const ch = w.chapter;
    const pA = `${w.actions}/${w.goal_actions}`, pF = `${Math.floor(w.focus_min / 60)}/${w.goal_focus / 60} 小時`;
    let claim = "";
    if (w.claimed === 0) claim = `<button type="button" class="btn dm-btn gold wide" data-dm="claim" ${w.met ? "" : "disabled"}>🎁 打開本章寶箱${w.met ? "" : "（目標達成後）"}</button>`;
    else if (w.claimed === 1) claim = `<button type="button" class="btn dm-btn gold wide" data-dm="claim" ${w.double ? "" : "disabled"}>🏆 超額寶箱（目標的兩倍）</button>`;
    else claim = `<p class="dm-ok">✅ 這一章的寶箱都領完了</p>`;
    const dl = ch.dilemma;
    const choice = w.choice
      ? `<div class="dm-out">你選了「${esc(w.choice.label)}」：${esc(w.choice.text)}</div>${gainsHtml(w.choice.gains)}`
      : `<div class="dm-opts">${dl.opts.map((o, i) => `<button type="button" class="btn dm-btn ${i ? "ghost" : ""}" data-dm="dilemma" data-v="${i}">${esc(o.label)}</button>`).join("")}</div>`;
    const daysLeft = Math.max(0, Math.round((new Date(w.end) - new Date(DM.s.date)) / 86400000));
    return `<div class="card dm-chapter">${ic("chapter", "ch" + ch.n, "📖", "banner")}
      <h3>${esc(w.title)}</h3><p>${esc(ch.intro)}</p><p class="dm-note">${w.start} ～ ${w.end}・還剩 ${daysLeft} 天</p>
      <div class="dm-goal"><span>✅ 完成的事（任務＋專案打勾）</span><b>${pA}</b>${bar(w.actions, w.goal_actions, "#66bb6a")}</div>
      <div class="dm-goal"><span>⏱️ 專注</span><b>${pF}</b>${bar(w.focus_min, w.goal_focus, "#42a5f5")}</div>
      ${claim}
      <p class="dm-note">本章寶箱：🥫10 💧10 🔩40 🎟️10 ✨60 🎫1。超額寶箱：🎟️10 🔩30 ✨80 🎟️召喚券 1 ＋ 一個史詩收藏品。</p></div>
      <div class="card dm-dilemma"><h3>⚖️ 本章抉擇</h3><p>${esc(dl.text)}</p>${choice}</div>`;
  }

  function bookHtml() {
    const st = DM.s.state;
    const own = new Set(st.companions || []);
    const relics = st.relics || {};
    const comps = DM.cat.companions.map(c => own.has(c.id)
      ? `<div class="dm-book">${ic("companion", c.id, c.emoji, "big")}<b>${esc(c.name)}</b><small>${esc(c.perk)}</small></div>`
      : `<div class="dm-book off"><span class="dm-emo big">❔</span><b>？？？</b><small>${esc(c.perk)}</small></div>`).join("");
    const rel = DM.cat.relics.map(r => relics[r.id]
      ? `<div class="dm-book tier-${r.tier}">${ic("relic", r.id, r.emoji, "big")}<b>${esc(r.name)}</b><small>${esc(r.text)}</small></div>`
      : `<div class="dm-book off tier-${r.tier}"><span class="dm-emo big">❔</span><b>${tierName(r.tier)}收藏品</b><small>還沒找到</small></div>`).join("");
    const nRel = Object.keys(relics).length;
    return `<div class="card"><h3>🤝 同伴圖鑑 ${own.size}/${DM.cat.companions.length}</h3><div class="dm-grid">${comps}</div></div>
      <div class="card"><h3>🔮 收藏品 ${nRel}/${DM.cat.relics.length}</h3><p class="dm-note">史詩、傳說搜刮，和一些奇怪的事件才找得到。每找到一個，士氣 +10。</p><div class="dm-grid">${rel}</div></div>
      <div class="card"><h3>📊 生存紀錄</h3><div class="dm-stats">
        <div><b>${st.day_no}</b><small>生存天數</small></div><div><b>${st.draws_total}</b><small>總搜刮</small></div>
        <div><b>${DM.s.week.week}</b><small>章節</small></div><div><b>${nRel}</b><small>收藏品</small></div></div></div>`;
  }

  function render() {
    const page = document.querySelector('.page[data-page="doom"]');
    if (!page) return;
    const root = page.querySelector("#dm-root");
    if (!root) return;
    if (!hasDb()) { root.innerHTML = `<div class="card"><p>登入之後才能進入末世。</p></div>`; return; }
    if (DM.error === "setup") {
      root.innerHTML = `<div class="card"><p>⚠️ 末世的資料庫還沒設定：到 Supabase 的 SQL Editor 執行 <b>sql/2026-10-28_末世.sql</b>，重新整理網頁之後就能玩。</p></div>`;
      return;
    }
    if (DM.error) { root.innerHTML = `<div class="card"><p>載入失敗：${esc(DM.error)}</p><button type="button" class="btn" data-dm="reload">再試一次</button></div>`; return; }
    if (!DM.s || !DM.cat) { root.innerHTML = `<div class="card"><p>☢️ 正在連線到序光電台…</p></div>`; return; }

    const tabs = [["today", "📻 今日"], ["draw", `🎟️ 搜刮${DM.s.state.scav ? `<i class="dm-dot">${DM.s.state.scav}</i>` : ""}`], ["base", "🏚️ 基地"], ["chapter", "📖 章節"], ["book", "🔮 圖鑑"]];
    const body = DM.tab === "draw" ? drawHtml() : DM.tab === "base" ? baseHtml() : DM.tab === "chapter" ? chapterHtml()
      : DM.tab === "book" ? bookHtml() : todayHtml();
    root.innerHTML = headHtml() + reportHtml() + newsHtml() +
      `<div class="dm-tabs">${tabs.map(([k, n]) => `<button type="button" class="${DM.tab === k ? "on" : ""}" data-dm="tab" data-v="${k}">${n}</button>`).join("")}</div>` +
      body;
  }


  /* ---------- 點擊 ---------- */

  function onClick(e) {
    const el = e.target.closest("[data-dm]");
    if (!el || el.disabled) return;
    const act = el.dataset.dm;
    if (act === "tab") { DM.tab = el.dataset.v; if (DM.tab !== "draw") DM.reveal = null; render(); return; }
    if (act === "reload") { DM.error = null; render(); load(); return; }
    if (act === "newsok") { DM.news = null; render(); return; }
    if (act === "report") { call("doom_report_seen", {}, () => {}); return; }
    if (act === "pickup") {
      call("doom_pickup", {}, d => { vibrate(20); toast(`🧺 撿到了 ${gainsText(d.gains)}`); });
      return;
    }
    if (act === "resolve") {
      call("doom_resolve", { p_slot: el.dataset.slot, p_opt: Number(el.dataset.v) }, d => {
        vibrate(20);
        toast(`${d.text}${d.gains && d.gains.length ? "　" + gainsText(d.gains) : ""}`);
      });
      return;
    }
    if (act === "draw") {
      const n = Number(el.dataset.v);
      DM.reveal = null;
      call("doom_draw", { p_n: n }, d => {
        DM.reveal = d.results;
        const best = d.results.some(r => r.tier === "s") ? "s" : d.results.some(r => r.tier === "x") ? "x" : d.results.some(r => r.tier === "l") ? "l" : "";
        vibrate(best ? [30, 40, 60] : 15);
        setTimeout(() => { const c = document.querySelector("#dm-root .dm-banner, #dm-root .dm-cards"); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); }, 60);
      });
      return;
    }
    if (act === "build") {
      const f = find("facilities", el.dataset.v);
      call("doom_build", { p_fac: el.dataset.v }, d => { vibrate(25); toast(`🏗️ ${f.name}升到 Lv${d.lv}！`); });
      return;
    }
    if (act === "repair") { call("doom_repair", {}, () => toast("🔧 基地修好了一些")); return; }
    if (act === "trade") { call("doom_trade", {}, () => toast("🔁 換到 1 張搜刮券")); return; }
    if (act === "claim") {
      call("doom_week_claim", {}, d => { vibrate([30, 40, 60]); DM.news = [{ icon: "🎁", title: d.claimed === 1 ? "本章寶箱" : "超額寶箱", body: "打開了！", gains: d.gains }]; });
      return;
    }
    if (act === "dilemma") {
      if (!confirm("每一章只能選一次，確定嗎？")) return;
      call("doom_dilemma", { p_opt: Number(el.dataset.v) }, d => toast(`⚖️ ${d.text}`));
      return;
    }
  }


  /* ---------- 在別的頁面做事時，馬上跳一個小提示 ---------- */

  function flash(text) {
    let el = document.getElementById("dm-flash");
    if (!el) {
      el = document.createElement("div");
      el.id = "dm-flash";
      el.addEventListener("click", () => { el.classList.remove("show"); if (typeof showPage === "function") showPage("doom"); });
      document.body.appendChild(el);
    }
    el.innerHTML = text;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function started() { try { return localStorage.getItem("doomStarted") === "1"; } catch (_) { return false; } }

  function hookRpc() {
    if (typeof db === "undefined" || !db || db.__doomHooked) return;
    const orig = db.rpc.bind(db);
    db.__doomHooked = true;
    db.rpc = function (name, args, opts) {
      const p = orig(name, args, opts);
      if (name !== "complete_task" && name !== "project_step_toggle" && name !== "claim_focus_rewards") return p;
      return Promise.resolve(p).then(r => {
        try {
          if (!r.error && gameOn() && started()) {
            const d = r.data || {};
            if (name === "complete_task" && d.success) flash("☢️ 末世：🥫+1 💧+1 🎟️+1<small>點我去搜刮</small>");
            else if (name === "project_step_toggle" && d.done && !d.repeat) flash("☢️ 末世：專案打勾 +1<small>每 2 個換 🥫💧🎟️</small>");
            else if (name === "claim_focus_rewards" && d.focus_seconds >= 1800) flash(`☢️ 末世：專注 ${Math.floor(d.focus_seconds / 60)} 分鐘，零件累積中 🔩<small>點我去收</small>`);
          }
        } catch (_) {}
        return r;
      });
    };
  }


  /* ---------- 樣式 ---------- */

  function injectStyle() {
    if (document.getElementById("dm-style")) return;
    const css = document.createElement("style");
    css.id = "dm-style";
    css.textContent = `
      body:not(.game-mode-on) .doom-tab { display: none !important; }
      .page[data-page="doom"] .dm-off { display: none; }
      .page[data-page="doom"]:not(.dm-on) .dm-off { display: block; }
      .page[data-page="doom"]:not(.dm-on) #dm-root { display: none; }
      #dm-root .card { margin-bottom: 12px; }
      #dm-root h3 { margin: 0 0 6px; font-size: 16px; }
      #dm-root p { margin: 4px 0; }
      .dm-img { width: 28px; height: 28px; object-fit: contain; vertical-align: middle; }
      .dm-img.sm, .dm-emo.sm { width: 18px; height: 18px; font-size: 15px; }
      .dm-img.big { width: 48px; height: 48px; flex: 0 0 48px; }
      .dm-img.banner { width: 100%; height: auto; max-height: 160px; object-fit: cover; border-radius: 12px; margin-bottom: 8px; }
      .dm-emo { font-size: 22px; line-height: 1; display: inline-block; text-align: center; }
      .dm-emo.big { font-size: 38px; width: 48px; flex: 0 0 48px; }
      .dm-emo.banner { font-size: 40px; display: block; margin-bottom: 4px; }
      .dm-big { font-size: 34px; line-height: 1; }
      .dm-head { background: linear-gradient(135deg, rgba(255,152,0,.16), rgba(121,85,72,.14)); }
      .dm-head.broken { background: linear-gradient(135deg, rgba(239,83,80,.2), rgba(121,85,72,.14)); }
      .dm-top { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
      .dm-day { font-size: 20px; font-weight: 800; }
      .dm-sub { font-size: 13px; opacity: .75; }
      .dm-luck { text-align: right; font-weight: 700; font-size: 14px; }
      .dm-luck small { font-weight: 600; opacity: .85; }
      .dm-resrow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 10px 0; }
      .dm-res { display: flex; flex-direction: column; align-items: center; padding: 6px 2px; border-radius: 12px; background: rgba(127,127,127,.1); cursor: pointer; }
      .dm-res b { font-size: 18px; }
      .dm-res small { font-size: 11px; opacity: .7; }
      .dm-meters { display: grid; gap: 6px; font-size: 13px; }
      .dm-bar { display: block; height: 8px; border-radius: 99px; background: rgba(127,127,127,.18); overflow: hidden; margin-top: 3px; }
      .dm-bar i { display: block; height: 100%; border-radius: 99px; transition: width .5s; }
      .dm-warn { color: #e65100; font-size: 13px; font-weight: 600; }
      .dm-note { font-size: 12px; opacity: .7; }
      .dm-ok { font-weight: 700; color: #43a047; }
      .dm-tabs { display: flex; gap: 4px; overflow-x: auto; margin: 0 0 12px; padding: 4px; border-radius: 12px; background: rgba(127,127,127,.1); scrollbar-width: none; }
      .dm-tabs button { flex: 1 0 auto; border: 0; background: transparent; color: inherit; font: inherit; font-size: 14px; padding: 8px 10px; border-radius: 9px; cursor: pointer; white-space: nowrap; position: relative; }
      .dm-tabs button.on { background: #e65100; color: #fff; font-weight: 700; }
      .dm-dot { font-style: normal; font-size: 10px; background: #ef5350; color: #fff; border-radius: 99px; padding: 0 5px; margin-left: 3px; vertical-align: 2px; }
      .dm-btn { border: 0; border-radius: 10px; padding: 9px 14px; font-weight: 700; background: #e65100; color: #fff; cursor: pointer; }
      .dm-btn.ghost { background: rgba(127,127,127,.16); color: inherit; }
      .dm-btn.gold { background: linear-gradient(135deg, #ffb300, #ff6f00); }
      .dm-btn.small { padding: 6px 10px; font-size: 13px; line-height: 1.2; min-width: 64px; }
      .dm-btn.wide { width: 100%; margin: 6px 0 12px; }
      .dm-btn[disabled] { opacity: .4; cursor: default; }
      .dm-btn small { font-weight: 500; opacity: .9; }
      .dm-opts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .dm-opts .dm-btn { flex: 1 1 auto; }
      .dm-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
      .dm-chip { font-size: 13px; padding: 3px 9px; border-radius: 99px; background: rgba(102,187,106,.18); font-weight: 700; }
      .dm-chip.neg { background: rgba(239,83,80,.16); }
      .dm-chip.big { background: rgba(255,179,0,.22); }
      .dm-chip small { font-weight: 500; opacity: .75; }
      .dm-news { border: 2px solid rgba(255,152,0,.5); }
      .dm-news-h, .dm-ev-h, .dm-draw-h { display: flex; gap: 12px; align-items: flex-start; }
      .dm-news-h p, .dm-ev-h p, .dm-draw-h p { font-size: 13px; opacity: .85; }
      .dm-radio { display: flex; gap: 12px; align-items: flex-start; background: linear-gradient(135deg, rgba(38,50,56,.12), rgba(255,152,0,.08)); }
      .dm-radio small { opacity: .65; font-size: 11px; }
      .dm-radio p { font-style: italic; }
      .dm-buff { display: inline-block; margin-top: 4px; font-size: 12px; font-weight: 700; padding: 2px 9px; border-radius: 99px; background: rgba(255,179,0,.25); }
      .dm-pick { display: flex; gap: 12px; align-items: center; width: 100%; text-align: left; border: 0; color: inherit; font: inherit; cursor: pointer; }
      .dm-pick.ready { background: linear-gradient(135deg, rgba(102,187,106,.22), rgba(255,235,59,.14)); animation: dm-breathe 2.2s ease-in-out infinite; }
      .dm-pick.done { display: block; cursor: default; }
      .dm-pick p { font-size: 13px; opacity: .8; }
      .dm-ev { border-left: 5px solid #90a4ae; }
      .dm-ev.good { border-left-color: #66bb6a; } .dm-ev.bad { border-left-color: #ef5350; }
      .dm-ev.weird { border-left-color: #ab47bc; } .dm-ev.visit { border-left-color: #ffa726; }
      .dm-ev.done { opacity: .85; }
      .dm-tag { display: inline-block; font-size: 11px; padding: 1px 7px; border-radius: 99px; margin-right: 6px; background: rgba(127,127,127,.2); }
      .dm-tag.good { background: rgba(102,187,106,.3); } .dm-tag.bad { background: rgba(239,83,80,.3); }
      .dm-tag.weird { background: rgba(171,71,188,.3); } .dm-tag.visit { background: rgba(255,167,38,.3); }
      .dm-out { margin-top: 8px; font-size: 14px; font-weight: 600; }
      .dm-how p { font-size: 13px; }
      .dm-log { margin: 6px 0 0; padding-left: 18px; font-size: 13px; }
      .dm-log li { margin: 2px 0; }
      .dm-log li.tier-l { color: #1e88e5; } .dm-log li.tier-x { color: #8e24aa; } .dm-log li.tier-s { color: #ff8f00; font-weight: 700; }
      .dm-draw { text-align: left; }
      .dm-banner { text-align: center; font-size: 26px; font-weight: 900; margin: 4px 0 10px; animation: dm-pop .5s cubic-bezier(.2,1.6,.4,1) both; }
      .dm-banner.tier-s { color: #ff8f00; text-shadow: 0 0 14px rgba(255,179,0,.8); }
      .dm-banner.tier-x { color: #8e24aa; text-shadow: 0 0 12px rgba(171,71,188,.6); }
      .dm-banner.tier-l { color: #1e88e5; }
      .dm-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; margin-bottom: 12px; }
      .dm-card { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 3px; padding: 10px 6px; border-radius: 14px;
        background: var(--card-bg, rgba(127,127,127,.08)); border: 2px solid var(--tc); animation: dm-flip .45s ease both; }
      .dm-card b { font-size: 13px; }
      .dm-card small { font-size: 11px; opacity: .8; }
      .dm-tier { font-size: 10px; font-weight: 800; color: var(--tc); }
      .tier-c { --tc: #9e9e9e; } .tier-r { --tc: #4caf50; } .tier-l { --tc: #42a5f5; } .tier-x { --tc: #ab47bc; } .tier-s { --tc: #ffb300; }
      .dm-card.tier-x { box-shadow: 0 0 14px rgba(171,71,188,.45); }
      .dm-card.tier-s { box-shadow: 0 0 20px rgba(255,179,0,.7); background: linear-gradient(160deg, rgba(255,236,179,.5), rgba(255,179,0,.15)); }
      .dm-fac { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(127,127,127,.12); }
      .dm-fac:last-child { border-bottom: 0; }
      .dm-fac-b { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .dm-fac-b small { font-size: 12px; opacity: .75; }
      .dm-lv { font-size: 12px; padding: 0 6px; border-radius: 99px; background: rgba(141,110,99,.25); }
      .dm-goal { margin: 8px 0; font-size: 13px; }
      .dm-goal b { float: right; }
      .dm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
      .dm-book { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 3px; padding: 10px 6px; border-radius: 12px; background: rgba(127,127,127,.08); border: 1px solid var(--tc, transparent); }
      .dm-book b { font-size: 13px; } .dm-book small { font-size: 11px; opacity: .75; }
      .dm-book.off { opacity: .45; }
      .dm-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; text-align: center; margin: 8px 0; }
      .dm-stats b { display: block; font-size: 20px; } .dm-stats small { font-size: 11px; opacity: .7; }
      .dm-report { border: 2px solid rgba(66,165,245,.5); }
      .pop { animation: dm-pop .45s cubic-bezier(.2,1.5,.4,1) both; }
      #dm-flash { position: fixed; left: 50%; bottom: 86px; transform: translate(-50%, 30px); opacity: 0; pointer-events: none; z-index: 9999;
        background: linear-gradient(135deg, #e65100, #ff8f00); color: #fff; font-weight: 800; padding: 10px 16px; border-radius: 14px;
        box-shadow: 0 8px 24px rgba(0,0,0,.3); text-align: center; transition: all .35s cubic-bezier(.2,1.5,.4,1); cursor: pointer; max-width: 92vw; }
      #dm-flash small { display: block; font-weight: 500; font-size: 11px; opacity: .9; }
      #dm-flash.show { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
      @keyframes dm-pop { from { transform: scale(.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      @keyframes dm-flip { from { transform: rotateY(90deg) scale(.8); opacity: 0; } to { transform: none; opacity: 1; } }
      @keyframes dm-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.015); } }
      @media (max-width: 420px) { .dm-stats { grid-template-columns: repeat(2, 1fr); } }
    `;
    document.head.appendChild(css);
  }


  /* ---------- 分頁 ---------- */

  function ensurePage() {
    injectStyle();
    if (!document.querySelector('.tab-btn[data-page="doom"]')) {
      const nav = document.getElementById("tab-nav");
      if (nav) {
        const btn = document.createElement("button");
        btn.className = "tab-btn doom-tab";
        btn.dataset.page = "doom";
        btn.type = "button";
        btn.innerHTML = '<span class="tab-icon">☢️</span><span class="tab-label">末世</span>';
        btn.addEventListener("click", () => showPage("doom"));
        nav.appendChild(btn);
      }
    }
    let page = document.querySelector('.page[data-page="doom"]');
    if (!page) {
      const container = document.querySelector("#app-section > .container");
      if (!container) return null;
      page = document.createElement("div");
      page.className = "page";
      page.dataset.page = "doom";
      const after = container.querySelector('.page[data-page="rpg"]') || container.querySelector('.page[data-page="farm"]');
      if (after) after.after(page);
      else container.appendChild(page);
      page.innerHTML = `
        <div class="dm-off card"><h2>☢️ 末世</h2><p>到「今日」頁打開 🎲 遊戲模式，就能進入末世。</p>
          <button type="button" class="btn btn-primary" onclick="showPage('today')">回今日</button></div>
        <div id="dm-root"></div>`;
      page.addEventListener("click", onClick);
    }
    if (typeof PAGES !== "undefined" && Array.isArray(PAGES) && !PAGES.includes("doom")) PAGES.push("doom");
    return page;
  }

  function syncVisibility() {
    const page = ensurePage();
    const on = gameOn() && hasDb();
    const btn = document.querySelector('.tab-btn[data-page="doom"]');
    if (btn) btn.hidden = !on;
    if (page) page.classList.toggle("dm-on", on);
  }

  if (typeof window.renderGameModeToggle === "function") {
    const baseToggle = window.renderGameModeToggle;
    window.renderGameModeToggle = function () {
      const result = baseToggle.apply(this, arguments);
      try { syncVisibility(); } catch (e) { console.warn(e); }
      return result;
    };
  }

  if (typeof window.applyPage === "function") {
    const baseApply = window.applyPage;
    window.applyPage = function (name) {
      const result = baseApply.apply(this, arguments);
      if (name === "doom") setTimeout(() => { syncVisibility(); if (gameOn()) { render(); load(); } }, 0);
      return result;
    };
  }

  function boot() {
    try { syncVisibility(); } catch (e) { console.warn(e); }
    try { hookRpc(); } catch (e) { console.warn(e); }
    if (location.hash === "#doom" && typeof applyPage === "function") setTimeout(() => applyPage("doom"), 0);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.DoomGame = { version: DOOM_JS_VERSION, reload: load, render, state: DM, miss };

})();
