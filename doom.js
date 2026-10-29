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

  const DOOM_JS_VERSION = "2026-10-28 v4";
  const IMG = "img/doom/";

  const DM = { cat: null, ex: null, diary: null, zoneUnlocked: [], zoneMastery: {}, s: null, error: null, busy: false, tab: "today",
    reveal: null, news: null, flash: null, zones: null, zoneWeek: 1, zoneLoading: false, zoneOff: false };

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
  const resInfo = k => (DM.cat && DM.cat.res[k]) || EXTRA_RES[k] || { name: k, emoji: "•" };
  const TIER_COLOR = { c: "#9e9e9e", r: "#4caf50", l: "#42a5f5", x: "#ab47bc", s: "#ffb300" };
  const tierName = t => (DM.cat && DM.cat.tiers[t]) || t;

  /* 物資 / 獎勵變動 → 小標籤 */
  function gainChip(g) {
    if (g.k === "companion") { const c = find("companions", g.id); return `<span class="dm-chip big">${c ? c.emoji + " " + esc(c.name) : "同伴"} 加入了！</span>`; }
    if (g.k === "relic") { const r = find("relics", g.id); return `<span class="dm-chip big tier-${r ? r.tier : "x"}">${r ? r.emoji + " " + esc(r.name) : "收藏品"}</span>`; }
    if (g.k === "facility") { const f = find("facilities", g.id); return `<span class="dm-chip big">${f ? f.emoji + " " + esc(f.name) : "設施"} 升到 Lv${g.lv}</span>`; }
    if (g.k === "memory") { const m = DM.ex && DM.ex.memories.find(x => x.id === g.id); return `<span class="dm-chip big tier-x">🧩 記憶碎片${m ? "：" + esc(m.title) : ""}</span>`; }
    if (g.k === "trinket") return `<span class="dm-chip big tier-${g.tier || "c"}">🧸 ${esc(g.emoji)} ${esc(g.name)}</span>`;
    const r = resInfo(g.k);
    return `<span class="dm-chip ${g.n < 0 ? "neg" : ""}">${r.emoji} ${g.n > 0 ? "+" : ""}${g.n}${g.note ? `<small>（${esc(g.note)}）</small>` : ""}</span>`;
  }
  const gainsHtml = arr => (arr && arr.length) ? `<div class="dm-chips">${arr.map(gainChip).join("")}</div>` : "";
  const gainsText = arr => (arr || []).map(g => {
    if (g.k === "companion") { const c = find("companions", g.id); return c ? `${c.emoji}${c.name}加入` : "新同伴"; }
    if (g.k === "relic") { const r = find("relics", g.id); return r ? `${r.emoji}${r.name}` : "收藏品"; }
    if (g.k === "facility") { const f = find("facilities", g.id); return f ? `${f.emoji}${f.name} Lv${g.lv}` : "設施升級"; }
    if (g.k === "memory") return "🧩記憶碎片";
    if (g.k === "trinket") return `${g.emoji}${g.name}`;
    const r = resInfo(g.k);
    return `${r.emoji}${g.n > 0 ? "+" : ""}${g.n}`;
  }).join(" ");

  /* 同一種資源加總起來（同伴、收藏品、設施保持各自一筆） */
  function mergeGains(arr) {
    const sum = {}, rest = [];
    (arr || []).forEach(g => { if (g.n !== undefined && !["companion", "relic", "facility", "memory"].includes(g.k)) sum[g.k] = (sum[g.k] || 0) + g.n; else rest.push(g); });
    return Object.entries(sum).filter(([, n]) => n).map(([k, n]) => ({ k, n })).concat(rest);
  }

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
      if (!DM.ex) {
        const x = await db.rpc("doom_extra");
        if (!x.error) DM.ex = x.data;
      }
      if (!DM.zones) {
        const z = await db.rpc("doom_zones");
        if (!z.error) DM.zones = z.data;
      }
      if (!DM.city) loadCity();
      if (!DM.trk) {
        const t = await db.rpc("doom_trinket_cat");
        if (!t.error && t.data) DM.trk = t.data;
      }
      await retryPending();
      const { data, error } = await db.rpc("doom_status");
      if (error) throw error;
      DM.s = data;
      if (data.week) DM.zoneWeek = data.week.week;
      syncZoneState(data.state);
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
    if (d.auto && d.auto.length) {
      const all = [];
      d.auto.forEach(r => { (r.drops || []).forEach(x => all.push(...(x.gains || []))); if (r.bonus) all.push(...(r.bonus.gains || [])); });
      const n = d.auto.reduce((a, r) => a + (r.drops || []).length, 0);
      items.push({ icon: "🏙️", title: `專注時在街頭搜刮了 ${d.auto.length} 趟`, body: `一共撿到 ${n} 樣。下次專注前可以在專注頁選區域。`, gains: mergeGains(all) });
    }
    if (d.harvest && d.harvest.combo_bonus) items.push({ icon: "🔥", title: `連擊獎勵！最高 ×${d.harvest.combo || 3}`, body: "30 分鐘內連續完成事情，每連到 3 次多送 1 張搜刮券。", gains: [{ k: "scav", n: d.harvest.combo_bonus }] });
    rewardNews(d.rewards, items);
    if (items.length) DM.news = (DM.news || []).concat(items);
  }

  function rewardNews(list, items) {
    (list || []).forEach(r => items.push({ icon: r.kind === "day" ? "🏅" : r.kind === "set" ? "📚" : r.kind === "zone" ? "🗺️" : r.kind === "monument" ? "🗿" : "🏚️", title: r.title, body: "", gains: r.gains }));
    if ((list || []).length) sfx("level");
  }

  async function call(name, args, after) {
    if (DM.busy) return;
    DM.busy = true;
    try {
      const { data, error } = await db.rpc(name, args || {});
      if (error) { toast("❌ " + error.message); return; }
      if (after) await after(data);
      if (data && data.rewards && data.rewards.length) { const it = []; rewardNews(data.rewards, it); DM.news = (DM.news || []).concat(it); }
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
        <div class="dm-luck" title="幸運越高，搜刮越容易出好東西"><button type="button" class="dm-snd" data-dm="sound" title="音效">${soundOn() ? "🔊" : "🔇"}</button> 🍀 幸運 ${DM.s.luck}${buff ? `<br><small>${buff.emoji} ${esc(buff.name)}</small>` : ""}</div></div>
      ${sceneHtml()}
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
      ${progressHtml()}
      ${talkHtml()}
      ${spinHtml()}
      ${bc ? `<div class="card dm-radio">${ic("ui", "radio", "📻", "big")}<div><small>序光電台・晨間廣播</small><p>「${esc(bc.text)}」</p>
        ${buff ? `<span class="dm-buff">${buff.emoji} ${esc(buff.name)}</span>` : ""}</div></div>` : ""}
      ${pick}
      ${eventCard("event")}
      ${eventCard("visitor")}
      ${signalHtml()}
      <div class="card dm-how"><b>怎麼拿物資？</b>
        <p>✅ 完成任務：🥫+1 💧+1 🎟️+1</p>
        <p>🎯 專案每打勾 2 個：🥫+1 💧+1 🎟️+1</p>
        <p>⏱️ 專注：開始前選一個區域，每 5～10 分鐘撿到一樣東西，結束時開箱</p>
        <p>🔥 30 分鐘內連續完成，每連到 3 次再 +1 🎟️</p>
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
        }).join("")}</div>${trkHtml(DM.revealTrk, DM.reveal.length * 110)}`;
    }
    return `<div class="card dm-draw">
      <div class="dm-draw-h">${ic("ui", "scav", "🎟️", "big")}<div><b>搜刮券 ${st.scav} 張</b>
        <p>幸運 ${DM.s.luck}・再 ${left} 抽內必出稀有以上</p></div></div>
      <div class="dm-opts">
        <button type="button" class="btn dm-btn" data-dm="draw" data-v="1" ${st.scav >= 1 ? "" : "disabled"}>搜刮 ×1</button>
        <button type="button" class="btn dm-btn gold" data-dm="draw" data-v="10" ${st.scav >= 10 ? "" : "disabled"}>搜刮 ×10</button></div>
      <p class="dm-note">普通 → 精良 → 稀有 → 史詩 → 傳說。可能搜到物資、星屑、金幣、星願券、召喚券、同伴、設施藍圖和收藏品。</p>
    </div>${res}${boxesHtml()}${unidHtml()}${shopHtml()}${runsHtml()}${masteryHtml()}`;
  }

  function baseHtml() {
    const st = DM.s.state;
    const eng = (st.companions || []).includes("engineer");
    const engK = bondLv(st, "engineer") >= 5 ? 0.75 : eng ? 0.85 : 1;
    const facs = DM.cat.facilities.map(f => {
      const lv = st.facilities[f.id] || 0;
      const parts = Math.round((20 + 20 * lv) * engK), food = 2 * lv;
      const ok = lv < 10 && st.parts >= parts && st.food >= food;
      return `<div class="dm-fac">${ic("facility", f.id, f.emoji, "big")}<div class="dm-fac-b"><b>${esc(f.name)} <span class="dm-lv">Lv${lv}</span></b>
        <small>${esc(f.desc)}</small>${bar(lv, 10, "#8d6e63")}</div>
        <button type="button" class="btn dm-btn small" data-dm="build" data-v="${f.id}" ${ok ? "" : "disabled"}>${lv >= 10 ? "滿級" : `升級<br><small>🔩${parts}${food ? " 🥫" + food : ""}</small>`}</button></div>`;
    }).join("");
    const merchant = (st.companions || []).includes("merchant");
    const k = bondLv(st, "merchant") >= 5 ? 5 : merchant ? 6 : 8;
    const traded = (DM.s.today && DM.s.today.traded) || 0;
    const comps = (st.companions || []).map(id => find("companions", id)).filter(Boolean);
    return `${baseLvHtml()}<div class="card"><h3>🏚️ 基地設施</h3><p class="dm-note">設施每天自動生產；每個最高 10 級。</p>${facs}</div>
      <div class="card"><h3>🔧 維修與交換</h3>
        <div class="dm-fac">${ic("ui", "repair", "🔧", "big")}<div class="dm-fac-b"><b>修理基地</b><small>🔩15 → 🛡️+25</small></div>
          <button type="button" class="btn dm-btn small" data-dm="repair" ${st.hp < 100 && st.parts >= 15 ? "" : "disabled"}>修理</button></div>
        <div class="dm-fac">${ic("ui", "trade", "🔁", "big")}<div class="dm-fac-b"><b>換搜刮券</b><small>🥫${k} 💧${k} → 🎟️1（今天還能換 ${5 - traded} 次）</small></div>
          <button type="button" class="btn dm-btn small" data-dm="trade" ${traded < 5 && st.food >= k && st.water >= k ? "" : "disabled"}>交換</button></div></div>
      ${bondHtml()}`;
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
      <div class="card dm-dilemma"><h3>⚖️ 本章抉擇</h3><p>${esc(dl.text)}</p>${choice}</div>
      ${milestonesHtml()}${memoriesHtml()}${diaryHtml()}`;
  }

  /* ---------- 🎒 物資收藏：搜刮、抽到過的東西（seen 記著次數） ---------- */
  function stashHtml() {
    const seen = DM.s.state.seen || {};
    const cell = (kind, x) => seen[x.id]
      ? `<div class="dm-book tier-${x.tier || "c"}" title="${esc(x.text || "")}">${ic(kind, x.id, x.emoji, "big")}<b>${esc(x.name)}</b><small>${tierName(x.tier || "c")}・×${seen[x.id]}</small></div>`
      : `<div class="dm-book off tier-${x.tier || "c"}"><span class="dm-emo big">❔</span><b>？？？</b><small>${tierName(x.tier || "c")}</small></div>`;
    const order = ["c", "r", "l", "x", "s"];
    const sortT = list => list.slice().sort((a, b) => order.indexOf(a.tier || "c") - order.indexOf(b.tier || "c"));
    const groups = [{ name: "🎟️ 搜刮抽到的", kind: "loot", items: sortT(DM.cat.loot || []) }];
    for (const z of zoneList()) {
      const known = !z.hidden || zoneOpen(z);
      groups.push({ name: known ? `📍 ${z.name}` : "📍 ？？？（隱藏區域）", kind: "zone-item", items: sortT(z.items || []) });
    }
    let got = 0, all = 0;
    const body = groups.map(g => {
      const a = g.items.filter(x => seen[x.id]).length;
      got += a; all += g.items.length;
      return `<details class="dm-stash"${a ? " open" : ""}><summary>${esc(g.name)} <b>${a}/${g.items.length}</b></summary><div class="dm-grid">${g.items.map(x => cell(g.kind, x)).join("")}</div></details>`;
    }).join("");
    return trinketBookHtml() + `<div class="card"><h3>🎒 物資收藏 ${got}/${all}</h3><p class="dm-note">抽到、搜刮到的東西都會記在這裡，數字是拿到過幾次。</p>${body}</div>`;
  }

  /* 🧸 生活小物收藏 */
  function trinketBookHtml() {
    if (!DM.trk) return "";
    const st = DM.s.state, have = st.trinkets || {}, rw = st.rewards || {};
    const order = ["c", "r", "l", "x", "s"];
    let got = 0;
    const body = DM.trk.series.map(se => {
      const items = DM.trk.items.filter(x => x.s === se.id).sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
      const a = items.filter(x => have[x.id]).length;
      got += a;
      const done = rw["tset:" + se.id];
      const cells = items.map(x => have[x.id]
        ? `<div class="dm-book tier-${x.tier}" title="${esc(x.text)}">${ic("trinket", x.id, x.emoji, "big")}<b>${esc(x.name)}</b><small>${tierName(x.tier)}・×${have[x.id]}</small></div>`
        : `<div class="dm-book off tier-${x.tier}"><span class="dm-emo big">❔</span><b>？？？</b><small>${tierName(x.tier)}</small></div>`).join("");
      return `<details class="dm-stash${done ? " done" : ""}"${a ? " open" : ""}><summary>${ic("ui", "set_" + se.id, se.emoji, "sm")} ${esc(se.name)} <b>${a}/${items.length}</b>${done ? " ✅" : ""}</summary><div class="dm-grid">${cells}</div></details>`;
    }).join("");
    return `<div class="card"><h3>🧸 生活小物 ${got}/${DM.trk.items.length}</h3>
      <p class="dm-note">搜刮、抽獎時有機會順手撿到，每天第一次搜刮一定有一個。集滿一個系列送補給箱、幸運永久 +1；重複的換士氣和星屑。</p>${body}</div>`;
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
    return stashHtml() + `<div class="card"><h3>🤝 同伴圖鑑 ${own.size}/${DM.cat.companions.length}</h3><div class="dm-grid">${comps}</div></div>
      <div class="card"><h3>🔮 收藏品 ${nRel}/${DM.cat.relics.length}</h3><p class="dm-note">史詩、傳說搜刮，和一些奇怪的事件才找得到。每找到一個，士氣 +10。</p><div class="dm-grid">${rel}</div></div>
      <div class="card"><h3>📊 生存紀錄</h3><div class="dm-stats">
        <div><b>${st.day_no}</b><small>生存天數</small></div><div><b>${st.draws_total}</b><small>總搜刮</small></div>
        <div><b>${DM.s.week.week}</b><small>章節</small></div><div><b>${nRel}</b><small>收藏品</small></div></div></div>
      ${setsHtml()}`;
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

    const tabs = [["today", "📻 今日"], ["draw", `🎟️ 搜刮${DM.s.state.scav ? `<i class="dm-dot">${DM.s.state.scav}</i>` : ""}`], ["base", "🏚️ 基地"], ["chapter", "📖 章節"], ["city", `🏙️ 城市${cityDot()}`], ["book", "🔮 圖鑑"]];
    const body = DM.tab === "draw" ? drawHtml() : DM.tab === "base" ? baseHtml() : DM.tab === "chapter" ? chapterHtml()
      : DM.tab === "book" ? bookHtml() : DM.tab === "city" ? cityHtml() : todayHtml();
    root.innerHTML = headHtml() + reportHtml() + newsHtml() +
      `<div class="dm-tabs">${tabs.map(([k, n]) => `<button type="button" class="${DM.tab === k ? "on" : ""}" data-dm="tab" data-v="${k}">${n}</button>`).join("")}</div>` +
      body;
  }


  /* ---------- 點擊 ---------- */

  function onClick(e) {
    const el = e.target.closest("[data-dm]");
    if (!el || el.disabled) return;
    const act = el.dataset.dm;
    if (act === "csec") { DM.csec = el.dataset.v; render(); return; }
    if (act === "cbuild") { const p = cityCat().projects.find(x => x.id === el.dataset.v); cityCall("doom_build_project", { p_id: el.dataset.v }, d => { sfx("level"); toast(`🏗️ ${p ? p.name : ""}${d.lv >= 3 ? "完工了！" : `蓋到第 ${d.lv} 階段`}`); }); return; }
    if (act === "craft") { const n = Number(el.dataset.n) || 1; cityCall("doom_craft", { p_id: el.dataset.v, p_n: n }, d => { sfx("coin"); toast(`🛠️ 做了 ${d.n} 個：${gainsText(d.gains)}`); }); return; }
    if (act === "recycle") { cityCall("doom_recycle", {}, d => { sfx("coin"); toast(`♻️ 回收 ${d.n} 個重複小物：${gainsText(d.gains)}`); }); return; }
    if (act === "expgo") {
      const dest = el.dataset.v, sel = document.getElementById("dm-exp-comp");
      const comp = sel ? sel.value : "";
      if (!comp) { toast("先選一個同伴"); return; }
      cityCall("doom_exp_start", { p_dest: dest, p_companion: comp }, () => { sfx("click"); toast("🧭 出發了！你專注的時候，遠征會加倍快"); });
      return;
    }
    if (act === "expclaim") { cityCall("doom_exp_claim", { p_id: Number(el.dataset.v) }, d => { sfx("level"); DM.expResult = d; }); return; }
    if (act === "tab") { DM.tab = el.dataset.v; if (DM.tab !== "draw") DM.reveal = null; DM.revealTrk = null; render(); return; }
    if (act === "reload") { DM.error = null; render(); load(); return; }
    if (act === "newsok") { DM.news = null; render(); return; }
    if (act === "report") { call("doom_report_seen", {}, () => {}); return; }
    if (act === "pickup") {
      call("doom_pickup", {}, d => { vibrate(20); sfx("open"); toast(`🧺 撿到了 ${gainsText(d.gains)}`); });
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
      DM.reveal = null; DM.revealTrk = null;
      call("doom_draw", { p_n: n }, d => {
        DM.reveal = d.results;
        DM.revealTrk = d.trinkets || [];
        sfxTier(bestTier(d.results));
        const best = d.results.some(r => r.tier === "s") ? "s" : d.results.some(r => r.tier === "x") ? "x" : d.results.some(r => r.tier === "l") ? "l" : "";
        vibrate(best ? [30, 40, 60] : 15);
        setTimeout(() => { const c = document.querySelector("#dm-root .dm-banner, #dm-root .dm-cards"); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); }, 60);
      });
      return;
    }
    if (act === "build") {
      const f = find("facilities", el.dataset.v);
      call("doom_build", { p_fac: el.dataset.v }, d => { vibrate(25); sfx("level"); toast(`🏗️ ${f.name}升到 Lv${d.lv}！`); });
      return;
    }
    if (act === "sound") { try { localStorage.setItem("doomSound", soundOn() ? "0" : "1"); } catch (_) {} if (soundOn()) sfx("tap"); render(); return; }
    if (act === "chest") { call("doom_daily_chest", {}, d => { sfx("rare"); vibrate([30, 40, 60]); DM.news = (DM.news || []).concat([{ icon: "🎁", title: "今日生存度寶箱", body: "收進補給箱了，到「搜刮」打開它！", gains: d.gains }]); }); return; }
    if (act === "spin") {
      call("doom_spin", {}, async d => {
        const w = document.querySelector("#dm-root .dm-wheel");
        const seg = 360 / DM.ex.spin.length;
        if (w) {
          w.style.transition = "transform 3.2s cubic-bezier(.15,.85,.2,1)";
          w.style.transform = `rotate(${360 * 6 - (d.index + .5) * seg}deg)`;
          for (let i = 0; i < 12; i++) setTimeout(() => sfx("tap"), i * i * 22);
          await new Promise(r => setTimeout(r, 3300));
        }
        sfx(["gold", "ten", "silver"].includes(d.id) ? "epic" : "rare");
        vibrate([30, 40, 60]);
        toast(`🎡 轉到 ${d.emoji} ${d.name}！`);
      });
      return;
    }
    if (act === "pet" || act === "gift") {
      call("doom_pet", { p_id: el.dataset.v, p_gift: act === "gift" }, d => {
        const c = find("companions", d.id);
        sfx(d.up ? "level" : "coin");
        toast(d.up ? `❤️ ${c.name}的好感升到 Lv${d.lv}！${d.story ? "解鎖了牠的故事" : ""}${d.perk ? "，能力加倍！" : ""}` : `❤️ ${c.name}很開心（${d.bond}/100）`);
      });
      return;
    }
    if (act === "shop") { call("doom_shop_buy", { p_i: Number(el.dataset.v) }, d => { sfx("coin"); toast(`🛒 買到 ${d.name}：${gainsText(d.gains)}`); }); return; }
    if (act === "box") {
      DM.reveal = null; DM.revealTrk = null;
      call("doom_box_open", { p_kind: el.dataset.v }, d => {
        DM.reveal = d.results; const b = bestTier(d.results); sfxTier(b); vibrate(b !== "c" ? [30, 40, 60] : 20);
        setTimeout(() => { const c = document.querySelector("#dm-root .dm-banner, #dm-root .dm-cards"); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); }, 60);
      });
      return;
    }
    if (act === "identify") {
      DM.reveal = null; DM.revealTrk = null;
      call("doom_identify", { p_uid: el.dataset.v }, d => {
        DM.reveal = [d]; sfxTier(d.tier); vibrate(20);
        toast(`❓ 鑑定結果：${tierName(d.tier)}・${d.name}`);
        setTimeout(() => { const c = document.querySelector("#dm-root .dm-cards"); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); }, 60);
      });
      return;
    }
    if (act === "run") { const r = DM.s.runs[Number(el.dataset.v)]; if (r) showReveal(r); return; }
    if (act === "repair") { call("doom_repair", {}, () => toast("🔧 基地修好了一些")); return; }
    if (act === "trade") { call("doom_trade", {}, () => toast("🔁 換到 1 張搜刮券")); return; }
    if (act === "claim") {
      call("doom_week_claim", {}, d => { vibrate([30, 40, 60]); sfx("epic"); DM.news = [{ icon: "🎁", title: d.claimed === 1 ? "本章寶箱" : "超額寶箱", body: "打開了！", gains: d.gains }]; });
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

  /* 🔥 連擊：30 分鐘內連續完成 */
  function comboNow() { try { const c = JSON.parse(localStorage.getItem("doomCombo") || "{}"); return Date.now() - (c.t || 0) <= 30 * 60000 ? (c.n || 0) : 0; } catch (_) { return 0; } }
  function bumpCombo() { const n = comboNow() + 1; try { localStorage.setItem("doomCombo", JSON.stringify({ n, t: Date.now() })); } catch (_) {} return n; }

  function started() { try { return localStorage.getItem("doomStarted") === "1"; } catch (_) { return false; } }

  function hookRpc() {
    if (typeof db === "undefined" || !db || db.__doomHooked) return;
    const orig = db.rpc.bind(db);
    db.__doomHooked = true;
    db.rpc = function (name, args, opts) {
      const p = orig(name, args, opts);
      if (name !== "complete_task" && name !== "project_step_toggle") return p;
      return Promise.resolve(p).then(r => {
        try {
          if (!r.error && gameOn() && started()) {
            const d = r.data || {};
            if (name === "complete_task" && d.success) {
              const n = bumpCombo();
              flash(n >= 2 ? `🔥 ×${n} 連擊！${n % 3 === 0 ? " +1 🎟️" : ""}<small>☢️ 末世：🥫+1 💧+1 🎟️+1</small>` : "☢️ 末世：🥫+1 💧+1 🎟️+1<small>點我去搜刮</small>");
              sfx(n >= 3 ? "rare" : "coin");
            }
            else if (name === "project_step_toggle" && d.done && !d.repeat && bumpCombo() >= 2) flash(`🔥 ×${comboNow()} 連擊！<small>☢️ 末世：專案打勾 +1</small>`);
            else if (name === "project_step_toggle" && d.done && !d.repeat) flash("☢️ 末世：專案打勾 +1<small>每 2 個換 🥫💧🎟️</small>");
          }
        } catch (_) {}
        return r;
      });
    };
  }


  /* ---------- ⏱️ 專注搜刮：選區域、計時器旁的「已搜刮 n 樣」、結束開箱 ---------- */

  const ZONE_KEY = "doomZone";
  const PENDING_KEY = "doomPendingRuns";

  const zoneList = () => (DM.zones && DM.zones.zones) || [];
  const zoneById = id => zoneList().find(z => z.id === id) || zoneList()[0] || null;
  function selectedZone() {
    let id = "street";
    try { id = localStorage.getItem(ZONE_KEY) || "street"; } catch (_) {}
    const z = zoneById(id);
    return z && zoneOpen(z) ? z.id : "street";
  }
  const zoneOpen = z => z.hidden ? DM.zoneUnlocked.includes(z.id) : z.chapter <= DM.zoneWeek;
  function syncZoneState(st) {
    if (!st) return;
    DM.zoneUnlocked = st.zones_unlocked || [];
    DM.zoneMastery = st.mastery || {};
  }
  const zoneOn = () => gameOn() && hasDb() && DM.zones && !DM.zoneOff;

  /* 每 5～10 分鐘一樣：用開始時間當種子，畫面上和結算時算出來的數量一樣 */
  function seedRand(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    let a = h >>> 0;
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function dropCount(seed, minutes) {
    const r = seedRand(String(seed));
    let t = 0, k = 0;
    while (k < 40) { t += 5 + 5 * r(); if (t > minutes) break; k++; }
    return k;
  }
  function timerMs(t) {
    if (!t || typeof focusElapsedMs !== "function") return 0;
    let ms = focusElapsedMs(t);
    if (t.mode === "down" && t.plannedMinutes) ms = Math.min(ms, t.plannedMinutes * 60000);
    return ms;
  }
  const curTimer = () => (typeof focusTimer !== "undefined" ? focusTimer : null);

  async function ensureZones() {
    if (DM.zones || DM.zoneLoading || DM.zoneOff || !gameOn() || !hasDb()) return;
    DM.zoneLoading = true;
    try {
      const { data, error } = await db.rpc("doom_zones");
      if (error) throw error;
      DM.zones = data;
      if (!DM.cat) {
        const c = await db.rpc("doom_catalog");
        if (!c.error) DM.cat = c.data;
      }
      if (!DM.ex) {
        const x = await db.rpc("doom_extra");
        if (!x.error) DM.ex = x.data;
      }
      if (!DM.s) {
        const { data: st } = await db.from("doom_state").select("started_on,zones_unlocked,mastery").maybeSingle();
        if (st) syncZoneState(st);
        if (st && st.started_on) {
          const today = new Date(Date.now() - 2 * 3600000);
          const days = Math.floor((today - new Date(st.started_on + "T00:00:00")) / 86400000);
          DM.zoneWeek = Math.floor(Math.max(0, days) / 7) + 1;
        }
      }
    } catch (e) {
      DM.zoneOff = true;
      console.warn("末世區域載入失敗：", e);
    }
    DM.zoneLoading = false;
    focusUi(true);
  }

  let lastPickerKey = "", lastCount = -1;

  function focusUi(force) {
    const card = document.getElementById("focus-card");
    if (!card) return;
    const setup = document.getElementById("focus-setup");
    const clock = document.getElementById("focus-clock");
    let pick = document.getElementById("dm-zone-box");
    if (!pick && setup) { pick = document.createElement("div"); pick.id = "dm-zone-box"; setup.appendChild(pick); pick.addEventListener("click", onZoneClick); }
    let run = document.getElementById("dm-run");
    if (!run && clock) { run = document.createElement("div"); run.id = "dm-run"; clock.after(run); run.addEventListener("click", () => typeof showPage === "function" && showPage("doom")); }

    /* 區域選擇 */
    if (pick) {
      const on = zoneOn();
      const sel = on ? selectedZone() : "";
      const key = on + "|" + sel + "|" + DM.zoneWeek + "|" + DM.zoneUnlocked.join(",");
      if (force || key !== lastPickerKey) {
        lastPickerKey = key;
        if (!on) { pick.innerHTML = ""; pick.hidden = true; }
        else {
          pick.hidden = false;
          const z = zoneById(sel);
          pick.innerHTML = `<div class="dm-zone-t">☢️ 專注時去哪裡搜刮？</div>
            <div class="dm-zones">${zoneList().map(x => {
              if (x.hidden && !zoneOpen(x)) {
                const hint = DM.ex && DM.ex.hidden ? DM.ex.hidden[x.id] : "";
                return `<button type="button" class="dm-zone secret" disabled title="${esc(hint)}">❔ ？？？<small>${esc(hint)}</small></button>`;
              }
              const lock = !zoneOpen(x);
              const mlv = masteryLv((DM.zoneMastery || {})[x.id] || 0);
              return `<button type="button" class="dm-zone ${x.id === sel ? "on" : ""} ${x.hidden ? "hidden-zone" : ""}" data-zone="${x.id}" ${lock ? "disabled" : ""}>
                ${ic("zone", x.id, x.emoji, "sm")} ${esc(x.name)}${lock ? `<small>🔒第${x.chapter}章</small>` : x.min_min ? `<small>≥${x.min_min}分</small>` : ""}${mlv ? `<small>★${mlv}</small>` : ""}</button>`;
            }).join("")}</div>
            <div class="dm-zone-d">${z ? esc(z.desc) : ""} 每 5～10 分鐘撿到一樣，結束時開箱。</div>`;
        }
      }
    }

    /* 計時中：已搜刮 n 樣 */
    if (run) {
      const t = curTimer();
      if (!t || !t.doomZone || !zoneOn()) { run.hidden = true; lastCount = -1; return; }
      const z = zoneById(t.doomZone);
      const minutes = Math.floor(Math.round(timerMs(t) / 1000) / 60);
      const n = dropCount(t.startedAt, minutes);
      run.hidden = false;
      if (n !== lastCount || force) {
        const bump = lastCount >= 0 && n > lastCount;
        lastCount = n;
        run.innerHTML = `${z ? ic("zone", z.id, z.emoji, "sm") + " " + esc(z.name) : ""}・🎒 已搜刮 <b>${n}</b> 樣${bump ? `<span class="dm-plus">+1</span>` : ""}`;
        if (bump) { run.classList.remove("bump"); void run.offsetWidth; run.classList.add("bump"); }
      }
    }
  }

  function onZoneClick(e) {
    const b = e.target.closest("[data-zone]");
    if (!b || b.disabled) return;
    try { localStorage.setItem(ZONE_KEY, b.dataset.zone); } catch (_) {}
    focusUi(true);
  }

  function savePending(list) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-10))); } catch (_) {} }
  function loadPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); } catch (_) { return []; } }

  async function retryPending() {
    const list = loadPending();
    if (!list.length) return;
    const left = [];
    for (const p of list) {
      const { error } = await db.rpc("doom_run_claim", { p_session: p.id, p_zone: p.zone, p_drops: p.drops });
      if (error && !/找不到|不算/.test(error.message || "")) left.push(p);
    }
    savePending(left);
  }

  async function findSessionId(t, seconds) {
    let q = await db.from("focus_sessions").select("id").eq("user_id", currentUser.id)
      .eq("started_at", t.startedAt).order("id", { ascending: false }).limit(1);
    if (q.data && q.data.length) return q.data[0].id;
    q = await db.from("focus_sessions").select("id").eq("user_id", currentUser.id)
      .eq("duration_seconds", seconds).order("id", { ascending: false }).limit(1);
    return q.data && q.data.length ? q.data[0].id : null;
  }

  async function claimRun(t, ms) {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return;
    const minutes = Math.floor(seconds / 60);
    const drops = dropCount(t.startedAt, minutes);
    let ids = [];
    try {
      if (t.segments && t.segments.length) {
        /* 中途換過科目：這次專注存成好幾筆，每筆都開箱，數量照時間分配 */
        const q = await db.from("focus_sessions").select("id,duration_seconds").eq("user_id", currentUser.id)
          .gte("started_at", t.startedAt).order("id", { ascending: true }).limit(10);
        const list = (q.data || []).filter(r => r.duration_seconds > 0);
        const total = list.reduce((a, r) => a + r.duration_seconds, 0) || 1;
        let left = drops;
        ids = list.map((r, i) => {
          const n = i === list.length - 1 ? left : Math.round(drops * r.duration_seconds / total);
          left -= n;
          return { id: r.id, drops: Math.max(0, n) };
        });
      } else {
        const id = await findSessionId(t, seconds);
        if (id) ids = [{ id, drops }];
      }
    } catch (e) { console.warn(e); }
    if (!ids.length) return;
    const results = [];
    for (const it of ids) {
      const { data, error } = await db.rpc("doom_run_claim", { p_session: it.id, p_zone: t.doomZone, p_drops: it.drops });
      if (error) {
        console.warn("專注搜刮開箱失敗：", error);
        savePending(loadPending().concat([{ id: it.id, zone: t.doomZone, drops: it.drops }]));
        continue;
      }
      results.push(data);
    }
    if (!results.length) { toast("☢️ 搜刮的東西先放著，進末世頁會再開箱"); return; }
    showReveal(results.length === 1 ? results[0] : mergeRuns(results));
    if (DM.s) load();
  }

  /* 好幾筆開箱結果合成一次給你看 */
  function mergeRuns(list) {
    const r = Object.assign({}, list[list.length - 1]);
    r.minutes = list.reduce((a, x) => a + (x.minutes || 0), 0);
    r.drops = [].concat(...list.map(x => x.drops || []));
    r.rare = list.reduce((a, x) => a + (x.rare || 0), 0);
    r.bonus = list.map(x => x.bonus).filter(Boolean).pop() || null;
    r.trinkets = [].concat(...list.map(x => x.trinkets || []));
    r.rescued = list.reduce((a, x) => a + (x.rescued || 0), 0);
    r.rewards = [].concat(...list.map(x => x.rewards || []));
    r.unlocked = list.map(x => x.unlocked).filter(Boolean)[0] || null;
    r.signal = list.map(x => x.signal).filter(Boolean)[0] || null;
    r.double = list.some(x => x.double);
    r.downgraded = list.map(x => x.downgraded).filter(Boolean)[0] || null;
    return r;
  }

  function hookFocus() {
    if (typeof window.startFocus === "function" && !window.startFocus.__doom) {
      const orig = window.startFocus;
      window.startFocus = function () {
        const r = orig.apply(this, arguments);
        try {
          const t = curTimer();
          if (t && !t.doomZone && zoneOn()) {
            t.doomZone = selectedZone();
            if (typeof saveFocusTimer === "function") saveFocusTimer();
          }
        } catch (e) { console.warn(e); }
        lastCount = -1;
        focusUi(true);
        return r;
      };
      window.startFocus.__doom = true;
    }
    if (typeof window.finishFocus === "function" && !window.finishFocus.__doom) {
      const orig = window.finishFocus;
      window.finishFocus = async function () {
        const before = curTimer();
        const snap = before ? Object.assign({}, before) : null;
        const ms = snap ? timerMs(snap) : 0;
        const r = await orig.apply(this, arguments);
        try {
          if (snap && snap.doomZone && !curTimer() && hasDb()) await claimRun(snap, ms);
        } catch (e) { console.warn("專注搜刮失敗：", e); }
        focusUi(true);
        return r;
      };
      window.finishFocus.__doom = true;
    }
    setInterval(() => { try { ensureZones(); focusUi(false); } catch (_) {} }, 1000);
  }

  /* 🧸 生活小物：開箱時另外一排 */
  function trkHtml(list, delay = 0) {
    if (!list || !list.length) return "";
    const cards = list.map((t, i) => `<div class="dm-card tier-${t.tier}" style="animation-delay:${delay + i * 160}ms"><span class="dm-tier">${tierName(t.tier)}</span>${t.new ? `<span class="dm-label">NEW</span>` : ""}
      ${ic("trinket", t.id, t.emoji, "big")}<b>${esc(t.name)}</b><small>${t.new ? "第一次撿到！" : `第 ${t.count} 個`}・${esc(gainsText(t.gains))}</small></div>`).join("");
    const sets = list.filter(t => t.set).map(t => `<div class="dm-rv-news">${esc(t.set.title)}${gainsHtml(t.set.gains)}</div>`).join("");
    return `<div class="dm-trk"><div class="dm-trk-h">🧸 順手撿到的小物</div><div class="dm-cards">${cards}</div>${sets}</div>`;
  }

  /* 開箱畫面 */
  function dropCard(d, i) {
    const cls = d.kind === "danger" ? "danger" : "tier-" + (d.tier || "c");
    const img = d.kind === "item" ? ic(d.src === "zone" ? "zone-item" : "loot", d.id, d.emoji, "big") : `<span class="dm-emo big">${esc(d.emoji)}</span>`;
    const tag = d.kind === "danger" ? "⚠️ 危險" : d.kind === "meet" ? "🤝 奇遇" : d.kind === "unid" ? "❓ 未鑑定" : d.kind === "memory" ? "🧩 記憶" : tierName(d.tier);
    return `<div class="dm-card ${cls}" style="animation-delay:${i * 160}ms"><span class="dm-tier">${tag}</span>${d.label ? `<span class="dm-label">${esc(d.label)}</span>` : ""}${img}
      <b>${esc(d.name)}</b><small>${d.t ? `第 ${d.t} 分鐘・` : ""}${esc(gainsText(d.gains))}</small></div>`;
  }

  function showReveal(r) {
    if (!r) return;
    let box = document.getElementById("dm-reveal");
    if (!box) {
      box = document.createElement("div");
      box.id = "dm-reveal";
      box.addEventListener("click", e => {
        if (e.target === box || e.target.closest("[data-close]")) box.classList.remove("show");
        if (e.target.closest("[data-go]")) { box.classList.remove("show"); if (typeof showPage === "function") showPage("doom"); }
      });
      document.body.appendChild(box);
    }
    const drops = r.drops || [];
    const best = drops.concat(r.bonus ? [r.bonus] : []).reduce((b, x) => x.kind !== "danger" && "crlxs".indexOf(x.tier || "c") > "crlxs".indexOf(b) ? x.tier : b, "c");
    const banner = { s: "🌟 傳說！", x: "💜 史詩！", l: "💙 稀有！" }[best];
    const all = [];
    drops.forEach(d => all.push(...(d.gains || [])));
    if (r.bonus) all.push(...(r.bonus.gains || []));
    box.innerHTML = `<div class="dm-rv card">
      <div class="dm-rv-h">${ic("zone", r.zone, r.zone_emoji, "big")}<div><b>${esc(r.zone_name)}搜刮回來了</b>
        <p>專注 ${r.minutes} 分鐘・帶回 ${drops.length} 樣</p></div></div>
      ${r.downgraded ? `<p class="dm-warn">${esc(r.downgraded)}</p>` : ""}
      ${r.unlocked ? `<div class="dm-rv-news">🗺️ 發現隱藏區域：<b>${esc((zoneById(r.unlocked) || {}).name || r.unlocked)}</b>！下次專注可以去了。</div>` : ""}
      ${r.signal ? `<div class="dm-rv-news">📡 解開第 ${r.signal.no} 段神秘訊號：「${esc(r.signal.cipher)}」${r.signal.unlock ? `<br>找到新地方：<b>${esc((zoneById(r.signal.unlock) || {}).name || "")}</b>` : ""}${gainsHtml(r.signal.gains)}</div>` : ""}
      ${r.rescued ? `<div class="dm-rv-news">🧑 救回了 <b>${r.rescued}</b> 個倖存者，帶他們回城市！</div>` : ""}
      ${r.double ? `<div class="dm-rv-tag">✖️ 翻倍卡生效：這趟的東西翻倍</div>` : ""}
      ${r.mastery ? `<div class="dm-rv-tag">${esc(r.zone_emoji)} ${esc(r.zone_name)}熟練度 Lv${masteryLv(r.mastery.minutes)}（累積 ${r.mastery.minutes} 分鐘）</div>` : ""}
      ${(r.rewards || []).map(x => `<div class="dm-rv-news">${esc(x.title)}${gainsHtml(x.gains)}</div>`).join("")}
      ${banner ? `<div class="dm-banner tier-${best}">${banner}</div>` : ""}
      ${drops.length ? `<div class="dm-cards">${drops.map(dropCard).join("")}</div>` : `<p class="dm-note">這次太短，什麼都沒撿到。專注滿 5 分鐘才會開始撿東西。</p>`}
      ${trkHtml(r.trinkets, drops.length * 160 + 100)}
      ${r.bonus ? `<div class="dm-rv-bonus" style="animation-delay:${drops.length * 160 + 200}ms">🎁 平安歸來寶箱${dropCard(Object.assign({ kind: "item" }, r.bonus), 0)}</div>` : ""}
      ${all.length ? `<div class="dm-rv-sum"><small>這趟一共</small>${gainsHtml(mergeGains(all))}</div>` : ""}
      <div class="dm-opts"><button type="button" class="btn dm-btn" data-close>收進基地</button>
        <button type="button" class="btn dm-btn ghost" data-go>去末世看看</button></div></div>`;
    box.classList.add("show");
    vibrate(best !== "c" ? [30, 40, 60] : 20);
    if (!r.already) sfxTier(best);
  }

  function runsHtml() {
    const runs = (DM.s && DM.s.runs) || [];
    const zones = zoneList().length ? zoneList().map(z => z.hidden && !zoneOpen(z) ? "❔？？？" : `${z.emoji}${z.name}${!zoneOpen(z) ? "🔒" : ""}`).join("　") : "";
    return `<div class="card"><h3>⏱️ 專注搜刮</h3>
      <p class="dm-note">在「專注」頁開始前選區域，每 5～10 分鐘撿到一樣，越久後面越好；照計畫完成還有平安歸來寶箱。</p>
      ${zones ? `<p class="dm-note">${zones}</p>` : ""}
      ${runs.length ? runs.map((r, i) => `<button type="button" class="dm-runrow" data-dm="run" data-v="${i}">
        <span>${esc(r.zone_emoji)} ${esc(r.zone_name)}・${r.minutes} 分</span><span>🎒 ${(r.drops || []).length} 樣${r.rare ? `・✨${r.rare}` : ""}${r.bonus ? "・🎁" : ""} ›</span></button>`).join("")
        : `<p class="dm-note">還沒有專注搜刮的紀錄。</p>`}</div>`;
  }


  /* =========================================================
     ✨ 擴充：音效、基地畫面、生存度、轉盤、同伴、訊號、補給箱、
        未鑑定、商人貨架、熟練度、里程碑、記憶碎片、日記、收藏組合
  ========================================================= */

  const EXTRA_RES = {
    box_bronze: { name: "銅補給箱", emoji: "📦" }, box_silver: { name: "銀補給箱", emoji: "🎁" },
    box_gold: { name: "金補給箱", emoji: "👑" }, double: { name: "翻倍卡", emoji: "✖️" },
    unid: { name: "未鑑定物品", emoji: "❓" }, survivor: { name: "倖存者", emoji: "🧑" },
    stardust: { name: "星屑", emoji: "✨" }, gold: { name: "金幣", emoji: "🪙" },
    wish_normal: { name: "星願券", emoji: "🎫" }, ticket_normal: { name: "召喚券", emoji: "🎟️" }
  };
  const BOX_KINDS = ["bronze", "silver", "gold"];

  /* ---------- 🔊 音效（用程式合成，不用素材） ---------- */
  let AC = null;
  const soundOn = () => { try { return localStorage.getItem("doomSound") !== "0"; } catch (_) { return true; } };
  function sfx(kind) {
    if (!soundOn()) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === "suspended") AC.resume();
      const seq = {
        tap: [[660, .05]], coin: [[880, .05], [1320, .08]],
        open: [[523, .08], [659, .08], [784, .12]],
        rare: [[523, .07], [659, .07], [784, .07], [1047, .22]],
        epic: [[440, .08], [554, .08], [659, .08], [880, .08], [1109, .32]],
        legend: [[523, .09], [659, .09], [784, .09], [1047, .09], [1319, .09], [1568, .45]],
        bad: [[240, .14], [180, .22]], level: [[392, .08], [523, .08], [659, .16]],
        spin: [[700, .03], [760, .03], [820, .03], [880, .03], [940, .03]]
      }[kind] || [[600, .05]];
      let t = AC.currentTime;
      seq.forEach(([f, d]) => {
        const o = AC.createOscillator(), g = AC.createGain();
        o.type = kind === "bad" ? "sawtooth" : "triangle";
        o.frequency.value = f;
        g.gain.setValueAtTime(.0001, t);
        g.gain.exponentialRampToValueAtTime(.16, t + .01);
        g.gain.exponentialRampToValueAtTime(.0001, t + d);
        o.connect(g).connect(AC.destination);
        o.start(t); o.stop(t + d + .03);
        t += d * .9;
      });
    } catch (_) {}
  }
  const bestTier = list => (list || []).reduce((b, r) => r && r.kind !== "danger" && "crlxs".indexOf(r.tier || "c") > "crlxs".indexOf(b) ? r.tier : b, "c");
  const sfxTier = t => sfx({ s: "legend", x: "epic", l: "rare" }[t] || "open");

  /* ---------- 🏚️ 基地畫面：跟著時間、天氣、設施變化 ---------- */
  const baseLevel = st => 1 + Math.floor(Object.values(st.facilities || {}).reduce((a, b) => a + Number(b || 0), 0) / 4);
  function sceneHtml() {
    const st = DM.s.state;
    const h = new Date().getHours();
    const sky = h >= 5 && h < 8 ? "dawn" : h >= 8 && h < 17 ? "day" : h >= 17 && h < 19 ? "dusk" : "night";
    const bc = find("broadcasts", DM.s.today && DM.s.today.broadcast);
    const rain = bc && bc.buff === "rain";
    const f = st.facilities || {};
    const blv = baseLevel(st);
    const house = blv >= 8 ? "🏡" : blv >= 4 ? "🏠" : "🛖";
    const mon = monumentNow(st);
    const comps = (st.companions || []).map(id => find("companions", id)).filter(Boolean);
    const plants = "🌱🥬🌽🍅🥕".slice(0, 0) + Array.from({ length: Math.min(5, f.garden || 0) }, (_, i) => ["🌱", "🥬", "🌽", "🍅", "🥕"][i]).join("");
    const wall = "🧱".repeat(Math.min(4, f.wall || 0));
    return `<div class="dm-scene ${sky} ${rain ? "rain" : ""}" title="基地 ${blv} 級">
      <span class="dm-sky">${sky === "night" ? "🌙" : sky === "dusk" ? "🌇" : rain ? "🌧️" : "☀️"}</span>
      ${sky === "night" ? `<span class="dm-stars">✦　·　✧　　·　✦　　✧</span>` : `<span class="dm-cloud">☁️</span>`}
      ${rain ? `<span class="dm-rain"></span>` : ""}
      <div class="dm-ground">
        ${f.radio ? `<span class="dm-prop">📡</span>` : ""}
        <span class="dm-house">${house}${sky === "night" && f.bed ? `<i class="dm-light">💡</i>` : ""}</span>
        ${f.purifier ? `<span class="dm-prop">🚰</span>` : ""}
        ${plants ? `<span class="dm-prop">${plants}</span>` : ""}
        ${wall ? `<span class="dm-prop">${wall}</span>` : ""}
        ${mon ? `<span class="dm-prop" title="${esc(mon.name)}">${mon.emoji}</span>` : ""}
        ${comps.slice(0, 5).map((c, i) => `<span class="dm-walker" style="animation-delay:${i * 1.3}s">${c.emoji}</span>`).join("")}
      </div>
      <span class="dm-blv">🏚️ 基地 Lv${blv}</span>
    </div>`;
  }

  /* ---------- 📊 今日生存度 ---------- */
  function progressHtml() {
    const p = DM.s.progress;
    if (!p) return "";
    const tiers = p.tiers || [100, 200, 300];
    const c = p.chests || 0;
    const next = tiers[Math.min(c, tiers.length - 1)];
    const ready = c < tiers.length && p.pts >= tiers[c];
    const box = c < tiers.length ? EXTRA_RES["box_" + p.boxes[c]] : null;
    const max = tiers[tiers.length - 1];
    return `<div class="card dm-prog ${ready ? "ready" : ""}">
      <div class="dm-prog-h"><b>📊 今日生存度 ${p.pts}</b><small>任務 10・專案打勾 5・專注每分鐘 1</small></div>
      <div class="dm-prog-bar"><i style="width:${Math.min(100, p.pts / max * 100)}%"></i>
        ${tiers.map((t, i) => `<span class="dm-prog-mark ${i < c ? "done" : p.pts >= t ? "ready" : ""}" style="left:${t / max * 100}%">${EXTRA_RES["box_" + p.boxes[i]].emoji}</span>`).join("")}</div>
      ${c >= tiers.length ? `<p class="dm-ok">✅ 今天三個寶箱都開了，太強了！</p>`
        : `<button type="button" class="btn dm-btn ${ready ? "gold" : "ghost"} wide" data-dm="chest" ${ready ? "" : "disabled"}>${ready ? `🎁 打開${box.name}` : `再 ${next - p.pts} 分開${box.name}`}</button>`}
    </div>`;
  }

  /* ---------- 🎡 每日轉盤 ---------- */
  function wheelHtml(rot) {
    const list = (DM.ex && DM.ex.spin) || [];
    const n = list.length || 1, seg = 360 / n;
    const colors = ["#ff8f00", "#5c6bc0", "#26a69a", "#ef5350", "#ab47bc", "#66bb6a", "#ffa726", "#29b6f6", "#ffd54f", "#ec407a"];
    const grad = list.map((_, i) => `${colors[i % colors.length]} ${i * seg}deg ${(i + 1) * seg}deg`).join(",");
    return `<div class="dm-wheel-wrap"><div class="dm-pin">▼</div>
      <div class="dm-wheel" style="background:conic-gradient(${grad});transform:rotate(${rot || 0}deg)">
        ${list.map((p, i) => `<span style="transform:rotate(${(i + .5) * seg}deg) translateY(-62px)">${p.emoji}</span>`).join("")}
      </div></div>`;
  }
  function spinHtml() {
    const t = DM.s.today || {};
    if (!DM.ex) return "";
    if (t.spin) {
      const seg = 360 / DM.ex.spin.length;
      return `<div class="card dm-spin"><div class="dm-spin-row">${wheelHtml(-(t.spin.index + .5) * seg)}
        <div><b>🎡 今日轉盤</b><p>今天轉到：${esc(t.spin.emoji)} <b>${esc(t.spin.name)}</b></p><small class="dm-note">明天再來轉一次</small></div></div></div>`;
    }
    const p = DM.s.progress || {};
    const ok = (p.tasks || 0) + (p.steps || 0) > 0 || (p.focus_min || 0) >= 25;
    return `<div class="card dm-spin"><div class="dm-spin-row">${wheelHtml(0)}
      <div><b>🎡 今日轉盤</b><p>${ok ? "今天已經開工了，轉一次吧！" : "完成今天第一件事（任務、專案打勾或專注 25 分鐘）就能轉。"}</p>
        <button type="button" class="btn dm-btn ${ok ? "gold" : "ghost"}" data-dm="spin" ${ok ? "" : "disabled"}>轉！</button></div></div></div>`;
  }

  /* ---------- 💬 同伴說話 ---------- */
  function dayHash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
  function talkHtml() {
    const st = DM.s.state;
    const comps = (st.companions || []).map(id => find("companions", id)).filter(Boolean);
    if (!comps.length || !DM.ex) return "";
    const p = DM.s.progress || {};
    const c = comps[dayHash(DM.s.date + (new Date().getHours() >> 2)) % comps.length];
    const lines = (DM.ex.talk && DM.ex.talk[c.id]) || ["……"];
    let line = lines[dayHash(DM.s.date + c.id) % lines.length];
    if ((p.focus_min || 0) >= 120) line = `你今天專注了 ${Math.floor(p.focus_min / 60)} 小時多，${c.id === "cat" ? "可以摸我了。" : "好厲害。"}` + "　" + line;
    else if ((p.tasks || 0) + (p.steps || 0) === 0 && new Date().getHours() >= 18) line = `今天還沒做事喔……${c.id === "dog" ? "我陪你一起開始！" : "一件就好，先做一件。"}`;
    const lv = bondLv(st, c.id);
    return `<div class="card dm-talk">${ic("companion", c.id, c.emoji, "big")}<div><small>${esc(c.name)}${lv ? `・好感 Lv${lv}` : ""}</small><p>「${esc(line)}」</p></div></div>`;
  }

  /* ---------- 📡 神秘訊號 ---------- */
  function signalHtml() {
    const st = DM.s.state;
    if (!DM.ex) return "";
    const no = st.signal_no || 0;
    if (no >= 3) return `<div class="card dm-signal done"><b>📡 神秘訊號</b><p>三段訊號都解開了。「倖存者，你不是一個人。」</p></div>`;
    const sg = DM.ex.signals[no];
    const ratio = Math.min(1, (st.signal_min || 0) / sg.need);
    const chars = [...sg.cipher];
    const shown = Math.floor(chars.length * ratio);
    const order = chars.map((_, i) => i).sort((a, b) => dayHash("s" + no + a) - dayHash("s" + no + b));
    const reveal = new Set(order.slice(0, shown));
    const text = chars.map((ch, i) => reveal.has(i) || /[，。……「」]/.test(ch) ? ch : "▓").join("");
    return `<div class="card dm-signal"><b>📡 神秘訊號 第 ${no + 1} 段</b>
      <p class="dm-cipher">${esc(text)}</p>${bar(st.signal_min || 0, sg.need, "#26a69a")}
      <small class="dm-note">專注搜刮 ${st.signal_min || 0} / ${sg.need} 分鐘。解開後${sg.unlock ? "會找到新的地方" : "會有很棒的東西"}。</small></div>`;
  }

  /* ---------- 📦 補給箱、✖️ 翻倍卡、❓ 未鑑定 ---------- */
  function boxesHtml() {
    const st = DM.s.state;
    const b = st.boxes || {};
    const ex = DM.ex && DM.ex.boxes;
    if (!ex) return "";
    return `<div class="card"><h3>📦 補給箱</h3><div class="dm-boxes">${BOX_KINDS.map(k => `
      <button type="button" class="dm-boxbtn ${k}" data-dm="box" data-v="${k}" ${b[k] > 0 ? "" : "disabled"}>
        ${ic("ui", "box_" + k, ex[k].emoji, "big")}<b>${esc(ex[k].name)}</b><small>×${b[k] || 0}・開出 ${ex[k].n} 樣</small></button>`).join("")}</div>
      <p class="dm-note">銀箱至少一個精良，金箱至少一個稀有。今日生存度、轉盤、商人、里程碑都拿得到。</p>
      ${st.double_cards ? `<p class="dm-chip big" style="display:inline-block">✖️ 翻倍卡 ×${st.double_cards}：下一趟專注搜刮的東西自動翻倍</p>` : ""}</div>`;
  }
  function unidHtml() {
    const st = DM.s.state;
    const list = st.unid || [];
    if (!list.length) return "";
    return `<div class="card"><h3>❓ 未鑑定物品 ${list.length}</h3><p class="dm-note">撿回來時看不出是什麼。再專注搜刮 30 分鐘就能鑑定：可能是普通的，也可能是傳說。</p>
      <div class="dm-boxes">${list.map(it => {
        const left = it.at + it.need - (st.focus_total || 0);
        return `<button type="button" class="dm-boxbtn unid" data-dm="identify" data-v="${esc(it.uid)}" ${left <= 0 ? "" : "disabled"}>
          ${ic("ui", "unid", "❓", "big")}<b>${left <= 0 ? "可以鑑定！" : "鑑定中"}</b><small>${left <= 0 ? "點一下打開" : `再專注 ${left} 分鐘`}</small></button>`;
      }).join("")}</div></div>`;
  }

  /* ---------- 🛒 神秘商人限時貨架 ---------- */
  function shopHtml() {
    const t = DM.s.today || {};
    const list = t.shop || [];
    if (!list.length) return "";
    const bought = new Set((t.shop_bought || []).map(String));
    const st = DM.s.state;
    const afford = price => Object.entries(price).every(([k, n]) => k === "gold" ? (DM.s.gold || 0) >= n : (st[k] || 0) >= n);
    return `<div class="card dm-shop"><h3>🛒 神秘商人的限時貨架</h3><p class="dm-note">每天換 3 樣，明天就不見了。你有 🪙${DM.s.gold || 0}</p>
      ${list.map((o, i) => `<div class="dm-fac">${ic("shop", o.id, o.emoji, "big")}<div class="dm-fac-b"><b>${esc(o.name)}</b><small>${costText(o.price)}</small></div>
        <button type="button" class="btn dm-btn small" data-dm="shop" data-v="${i}" ${!bought.has(String(i)) && afford(o.price) ? "" : "disabled"}>${bought.has(String(i)) ? "已買" : "買"}</button></div>`).join("")}</div>`;
  }

  /* ---------- 🗺️ 區域熟練度 ---------- */
  const masteryLv = mins => ((DM.ex && DM.ex.mastery) || [60, 180, 420, 900, 1800]).filter(t => mins >= t).length;
  function masteryHtml() {
    const st = DM.s.state;
    const m = st.mastery || {};
    const th = (DM.ex && DM.ex.mastery) || [60, 180, 420, 900, 1800];
    const zs = zoneList().filter(z => !z.hidden || (st.zones_unlocked || []).includes(z.id));
    if (!zs.length) return "";
    return `<div class="card"><h3>🗺️ 區域熟練度</h3><p class="dm-note">同一個區域專注越久越熟：每級幸運 +3，3 級起多撿東西，5 級每趟必出稀有以上。</p>
      ${zs.map(z => { const mins = m[z.id] || 0, lv = masteryLv(mins), nx = th[lv];
        return `<div class="dm-goal"><span>${ic("zone", z.id, z.emoji, "sm")} ${esc(z.name)} <span class="dm-lv">Lv${lv}</span></span><b>${nx ? `${mins}/${nx} 分` : "滿級"}</b>${bar(nx ? mins : 1, nx || 1, "#8d6e63")}</div>`; }).join("")}</div>`;
  }

  /* ---------- 🐾 同伴好感 ---------- */
  const bondLv = (st, id) => (st.companions || []).includes(id) ? Math.min(5, Math.floor(((st.bond || {})[id] || 0) / 20)) : 0;
  function bondHtml() {
    const st = DM.s.state;
    const comps = (st.companions || []).map(id => find("companions", id)).filter(Boolean);
    const today = new Set((DM.s.today && DM.s.today.bonded) || []);
    return `<div class="card"><h3>🤝 同伴 ${comps.length}/${DM.cat.companions.length}</h3>
      ${comps.length ? comps.map(c => {
        const pts = (st.bond || {})[c.id] || 0, lv = bondLv(st, c.id), done = today.has(c.id);
        return `<div class="dm-comp"><div class="dm-fac">${ic("companion", c.id, c.emoji, "big")}<div class="dm-fac-b"><b>${esc(c.name)} <span class="dm-lv">❤️ Lv${lv}</span></b>
          <small>${esc(c.perk)}</small>${bar(pts, 100, "#ec407a")}</div>
          <div class="dm-pet"><button type="button" class="btn dm-btn small ghost" data-dm="pet" data-v="${c.id}" ${done ? "disabled" : ""}>摸摸<br><small>+5</small></button>
          <button type="button" class="btn dm-btn small" data-dm="gift" data-v="${c.id}" ${done || st.food < 3 ? "disabled" : ""}>餵食<br><small>🥫3 +12</small></button></div></div>
          ${lv >= 3 && DM.ex ? `<p class="dm-story">📖 ${esc(DM.ex.stories[c.id] || "")}</p>` : `<p class="dm-note">好感 3 級解鎖牠的故事</p>`}
          ${DM.ex ? `<p class="dm-note">${lv >= 5 ? "✨ 能力加倍：" : "好感 5 級："}${esc(DM.ex.bond_perk[c.id] || "")}</p>` : ""}</div>`;
      }).join("") : `<p class="dm-note">還沒有同伴。訪客、搜刮、事件都可能遇到願意留下來的人（和動物）。</p>`}
      <p class="dm-note">每個同伴每天可以陪一次。每 3 個同伴，每天多吃 🥫1 💧1。</p></div>`;
  }

  /* ---------- 🏆 基地等級、紀念碑、里程碑 ---------- */
  function monumentNow(st) {
    const list = (DM.ex && DM.ex.monument) || [];
    const h = (st.focus_total || 0) / 60;
    return list.filter(m => h >= m.h).pop() || null;
  }
  function baseLvHtml() {
    const st = DM.s.state;
    const sum = Object.values(st.facilities || {}).reduce((a, b) => a + Number(b || 0), 0);
    const blv = baseLevel(st);
    const list = (DM.ex && DM.ex.monument) || [];
    const h = (st.focus_total || 0) / 60;
    const mon = monumentNow(st), nx = list.find(m => h < m.h);
    return `<div class="card"><h3>🏚️ 基地 Lv${blv}</h3>
      <div class="dm-goal"><span>設施等級加總 ${sum}，每 4 級基地升一級（送補給箱）</span><b>${sum % 4}/4</b>${bar(sum % 4, 4, "#8d6e63")}</div>
      <h3 style="margin-top:12px">${mon ? mon.emoji : "🪧"} 專注紀念碑${mon ? `：${esc(mon.name)}` : ""}</h3>
      <div class="dm-goal"><span>專注搜刮累積 ${Math.floor(h)} 小時${nx ? `，${nx.h} 小時升級成 ${nx.emoji} ${esc(nx.name)}` : "，已經是最高級"}</span>
        <b>${nx ? `${Math.floor(h)}/${nx.h}` : "MAX"}</b>${bar(nx ? h : 1, nx ? nx.h : 1, "#ffb300")}</div></div>`;
  }
  function milestonesHtml() {
    const st = DM.s.state;
    const list = (DM.ex && DM.ex.days) || [];
    if (!list.length) return "";
    const rw = st.rewards || {};
    return `<div class="card"><h3>🏅 生存天數里程碑</h3><div class="dm-miles">${list.map(m => {
      const got = rw["day:" + m.d];
      return `<div class="dm-mile ${got ? "got" : ""}"><b>第 ${m.d} 天</b><small>${esc(m.title)}</small><span>${got ? "✅" : st.day_no >= m.d ? "🎁" : `還差 ${m.d - st.day_no} 天`}</span></div>`;
    }).join("")}</div></div>`;
  }
  function memoriesHtml() {
    const st = DM.s.state;
    const list = (DM.ex && DM.ex.memories) || [];
    if (!list.length) return "";
    const own = new Set(st.memories || []);
    return `<div class="card"><h3>🧩 前世記憶碎片 ${own.size}/${list.length}</h3>
      <p class="dm-note">專注搜刮、算命攤、商人、里程碑都可能找到。收齊就能看完前世的故事。</p>
      ${list.map((m, i) => own.has(m.id)
        ? `<div class="dm-mem"><b>${i + 1}．${esc(m.title)}</b><p>${esc(m.text)}</p></div>`
        : `<div class="dm-mem off"><b>${i + 1}．？？？</b><p>這段記憶還很模糊……</p></div>`).join("")}</div>`;
  }

  /* ---------- 📔 倖存者日記 ---------- */
  async function loadDiary() {
    if (DM.diaryLoading) return;
    DM.diaryLoading = true;
    try { const { data, error } = await db.rpc("doom_diary"); if (!error) DM.diary = data; } catch (_) {}
    DM.diaryLoading = false;
    render();
  }
  function diaryText(d) {
    const parts = [];
    if (d.tasks) parts.push(`完成了 ${d.tasks} 件任務`);
    if (d.steps) parts.push(`在專案上打了 ${d.steps} 個勾`);
    if (d.focus_min) parts.push(`專注了 ${d.focus_min >= 60 ? Math.floor(d.focus_min / 60) + " 小時 " : ""}${d.focus_min % 60} 分鐘`);
    let s = parts.length ? `今天我${parts.join("，")}。` : "今天什麼都沒做，只是靜靜地待在基地裡，聽著收音機的雜音。";
    (d.runs || []).forEach(r => { s += `我去了${r.zone}，待了 ${r.min} 分鐘，帶回 ${r.n} 樣東西${r.rare ? `，其中 ${r.rare} 樣很稀有` : ""}。`; });
    const finds = (d.logs || []).filter(l => l.kind === "draw" && (l.tier === "x" || l.tier === "s")).map(l => l.body.replace(/！$/, ""));
    if (finds.length) s += `最開心的是${finds.slice(0, 2).join("，還有")}！`;
    const ev = (d.logs || []).filter(l => l.kind === "event" || l.kind === "visitor" || l.kind === "zone" || l.kind === "signal").map(l => l.body);
    if (ev.length) s += ev.slice(0, 2).join(" ");
    const busy = d.tasks + d.steps + d.focus_min / 30;
    s += busy >= 10 ? " 累了，但很踏實。明天也要繼續。" : busy >= 3 ? " 一點一點來，基地越來越像樣了。" : busy > 0 ? " 至少今天有往前走一步。" : " 明天，再試一次吧。";
    return s;
  }
  function diaryHtml() {
    if (!DM.diary) { loadDiary(); return `<div class="card"><h3>📔 倖存者日記</h3><p class="dm-note">翻開日記中…</p></div>`; }
    return `<div class="card"><h3>📔 倖存者日記</h3>${DM.diary.map(d => `<div class="dm-diary"><b>末世第 ${d.day_no} 天</b><small>${d.day}</small><p>${esc(diaryText(d))}</p></div>`).join("")}</div>`;
  }

  /* ---------- 📚 收藏組合 ---------- */
  function setsHtml() {
    const st = DM.s.state;
    const sets = (DM.ex && DM.ex.sets) || [];
    if (!sets.length) return "";
    const seen = st.seen || {}, rw = st.rewards || {};
    const prog = s => {
      let ids = [], have = x => !!seen[x];
      if (s.src === "loot") ids = DM.cat.loot.filter(x => x.tier === s.tier).map(x => x.id);
      else if (s.src === "zone") { const z = zoneList().find(z => z.id === s.zone); ids = z ? z.items.map(x => x.id) : []; }
      else if (s.src === "relic") { ids = DM.cat.relics.filter(x => x.tier === s.tier).map(x => x.id); have = x => !!(st.relics || {})[x]; }
      else if (s.src === "companion") { ids = DM.cat.companions.map(x => x.id); have = x => (st.companions || []).includes(x); }
      return [ids.filter(have).length, ids.length];
    };
    return `<div class="card"><h3>📚 收藏組合</h3><p class="dm-note">收齊一組送補給箱，而且幸運永久 +2。</p>
      ${sets.map(s => { const [a, b] = prog(s), done = rw["set:" + s.id];
        return `<div class="dm-goal"><span>${s.emoji} ${esc(s.name)}${done ? " ✅" : ""}</span><b>${a}/${b}</b>${bar(a, b || 1, done ? "#66bb6a" : "#ab47bc")}</div>`; }).join("")}</div>`;
  }

  /* =========================================================
     🏙️ 城市：重建城市、合成工坊、遠征
  ========================================================= */
  const cityCat = () => DM.ccat || { projects: [], recipes: [], dests: [] };
  function cityDot() {
    const c = DM.city;
    if (!c) return "";
    const ready = (c.expeditions || []).filter(e => Date.parse(e.end_at) <= Date.now()).length;
    return ready ? `<i class="dm-dot">${ready}</i>` : "";
  }
  async function loadCity() {
    if (!hasDb()) return;
    try {
      if (!DM.ccat) { const c = await db.rpc("doom_city_cat"); if (!c.error) DM.ccat = c.data; else if (/doom_city_cat|PGRST202|42883/.test(c.error.message || "")) { DM.cityErr = "setup"; return; } }
      const { data, error } = await db.rpc("doom_city_status");
      if (error) { DM.cityErr = /doom_city_status|PGRST202|42883/.test(error.message || "") ? "setup" : error.message; return; }
      DM.cityErr = null;
      DM.city = data;
      if (data.notes && data.notes.length) {
        DM.news = (DM.news || []).concat(data.notes.map(n => ({ icon: n.kind === "raid" ? "🌙" : "🏙️", title: n.title, body: "", gains: n.gains })));
      }
    } catch (e) { DM.cityErr = e.message || String(e); }
  }
  async function cityCall(name, args, after) {
    await call(name, args, after);
    await loadCity();
    render();
  }
  const costHtml = (cost, have) => Object.entries(cost || {}).map(([k, n]) => {
    const ok = !have || (have[k] || 0) >= n;
    return `<span class="dm-chip ${ok ? "" : "neg"}">${resInfo(k).emoji} ${n}</span>`;
  }).join("");
  const compName = id => { const c = find("companions", id); return c ? `${c.emoji} ${c.name}` : id; };
  const leftText = ms => { if (ms <= 0) return "回來了！"; const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} 小時 ${m % 60} 分` : `${m} 分`; };

  function cityHtml() {
    if (DM.cityErr === "setup") return `<div class="card"><p>⚠️ 城市的資料庫還沒設定：到 Supabase 的 SQL Editor 執行 <b>sql/2026-10-30_末世_城市.sql</b>。</p></div>`;
    if (DM.cityErr) return `<div class="card"><p>載入失敗：${esc(DM.cityErr)}</p></div>`;
    if (!DM.city) { loadCity().then(render); return `<div class="card"><p>🏙️ 走向城市廢墟中…</p></div>`; }
    const c = DM.city, sec = DM.csec || "city";
    const tabs = [["city", "🏗️ 重建"], ["craft", "🛠️ 工坊"], ["exp", `🧭 遠征${cityDot()}`]];
    const head = `<div class="card dm-city-head">${cityScene(c)}
      <div class="dm-stats"><div><b>Lv${c.city_lv}</b><small>城市等級</small></div><div><b>${c.survivors}</b><small>倖存者</small></div>
      <div><b>${c.defense}</b><small>防禦（夜襲約 ${c.threat}）</small></div><div><b>${c.raids.win || 0}勝 ${c.raids.lose || 0}敗</b><small>夜襲紀錄</small></div></div>
      <p class="dm-note">倖存者靠專注搜刮救回來（越久越容易），遠征也會帶回來。每 4 個人每天吃 1 份食物、喝 1 份水（最多吃掉 5%），每 3 個人每天做 1 個零件。</p></div>
      <div class="dm-subtabs">${tabs.map(([k, n]) => `<button type="button" class="${sec === k ? "on" : ""}" data-dm="csec" data-v="${k}">${n}</button>`).join("")}</div>`;
    return head + (sec === "craft" ? craftHtml() : sec === "exp" ? expHtml() : projHtml());
  }

  /* 城市主圖：蓋好的工程在圖上亮起來（階段越高越亮），城市等級越高整張圖越暖 */
  const SPOT = { clinic: [17, 66], greenhouse: [93, 42], waterplant: [73, 76], powerplant: [46, 30], school: [41, 62], radiotower: [29, 22], citywall: [7, 82], lighthouse: [59, 50] };
  function cityScene(c) {
    const pins = cityCat().projects.map(p => {
      const lv = (c.projects || {})[p.id] || 0;
      if (!lv) return "";
      const [x, y] = SPOT[p.id] || [50, 50];
      return `<span class="dm-pin lv${lv}" style="left:${x}%;top:${y}%" title="${esc(p.name)} 第 ${lv} 階段">${ic("city", p.id, p.emoji, "sm")}<i>${"★".repeat(lv)}</i></span>`;
    }).join("");
    const warm = Math.min(0.45, (c.city_lv - 1) * 0.03);
    return `<div class="dm-scene-city">${ic("city", "banner", "🏙️", "banner")}<span class="dm-glow" style="opacity:${warm}"></span>${pins}</div>`;
  }

  function projHtml() {
    const c = DM.city, st = DM.s.state;
    const cards = cityCat().projects.map(p => {
      const lv = (c.projects || {})[p.id] || 0;
      const locked = c.city_lv < p.lv;
      const stg = p.stages[lv];
      const pips = [0, 1, 2].map(i => `<i class="${i < lv ? "on" : ""}"></i>`).join("");
      let foot;
      if (lv >= 3) foot = `<div class="dm-done">✅ 完工</div>`;
      else if (locked) foot = `<div class="dm-note">🔒 城市 Lv${p.lv} 開放</div>`;
      else {
        const enough = Object.entries(stg.cost).every(([k, n]) => st[k] >= n) && c.survivors >= stg.need;
        foot = `<div class="dm-chips">${costHtml(stg.cost, st)}<span class="dm-chip ${c.survivors >= stg.need ? "" : "neg"}">🧑 ${stg.need} 人</span></div>
          <button type="button" class="btn dm-btn" data-dm="cbuild" data-v="${p.id}" ${enough && !DM.busy ? "" : "disabled"}>蓋第 ${lv + 1} 階段</button>`;
      }
      return `<div class="dm-proj ${lv >= 3 ? "done" : ""} ${locked ? "off" : ""}">${ic("city", p.id, p.emoji, "big")}
        <div class="dm-proj-b"><b>${esc(p.name)}</b><span class="dm-pips">${pips}</span><small>${esc(p.desc)}・${esc(p.perk)}</small>${foot}</div></div>`;
    }).join("");
    return `<div class="card"><h3>🏗️ 大型工程</h3><p class="dm-note">每個工程 3 個階段，蓋好永久有效。完成的階段越多，城市等級越高，能去的遠征地點也越多。</p>${cards}</div>`;
  }

  function craftHtml() {
    const st = DM.s.state;
    const rows = cityCat().recipes.map(r => {
      const can = Object.entries(r.cost).every(([k, n]) => st[k] >= n);
      const [kind, id] = (r.icon || "craft/" + r.id).split("/");
      const max = Math.min(20, ...Object.entries(r.cost).map(([k, n]) => Math.floor(st[k] / n)));
      return `<div class="dm-craft">${ic(kind, id, r.emoji, "big")}<div class="dm-proj-b"><b>${esc(r.name)}</b><div class="dm-chips">${costHtml(r.cost, st)}</div></div>
        <div class="dm-craft-btns"><button type="button" class="btn dm-btn" data-dm="craft" data-v="${r.id}" data-n="1" ${can && !DM.busy ? "" : "disabled"}>做</button>
        ${max >= 2 ? `<button type="button" class="btn dm-btn ghost" data-dm="craft" data-v="${r.id}" data-n="${max}" ${DM.busy ? "disabled" : ""}>×${max}</button>` : ""}</div></div>`;
    }).join("");
    const dup = Object.values(st.trinkets || {}).reduce((a, n) => a + Math.max(0, n - 1), 0);
    return `<div class="card"><h3>🛠️ 合成工坊</h3><p class="dm-note">把囤的物資和搜刮券做成好東西。已經做了 ${DM.city.crafted} 次。</p>${rows}</div>
      <div class="card"><h3>♻️ 小物回收</h3><p class="dm-note">重複的生活小物（每種留 1 個）每個換 ✨4、🔩3。現在有 ${dup} 個重複的。</p>
        <button type="button" class="btn dm-btn" data-dm="recycle" ${dup && !DM.busy ? "" : "disabled"}>全部回收</button></div>`;
  }

  function expHtml() {
    const c = DM.city, st = DM.s.state;
    const now = Date.now();
    const going = (c.expeditions || []).map(e => {
      const d = cityCat().dests.find(x => x.id === e.dest) || { name: e.dest, emoji: "🧭" };
      const left = Date.parse(e.end_at) - now;
      return `<div class="dm-exp">${ic("exp", e.dest, d.emoji, "big")}<div class="dm-proj-b"><b>${esc(d.name)}</b><small>${compName(e.companion)} 帶隊・${left > 0 ? `還要 <span data-dm-left="${e.end_at}">${leftText(left)}</span>` : "回來了！"}</small></div>
        <button type="button" class="btn dm-btn" data-dm="expclaim" data-v="${e.id}" ${left <= 0 && !DM.busy ? "" : "disabled"}>${left <= 0 ? "收下" : "在路上"}</button></div>`;
    }).join("");
    const busy = new Set((c.expeditions || []).map(e => e.companion));
    const free = (st.companions || []).filter(x => !busy.has(x));
    const full = (c.expeditions || []).length >= c.slots;
    const res = DM.expResult ? `<div class="card dm-rv-news">🧭 遠征隊從${esc(DM.expResult.emoji)} ${esc(DM.expResult.name)}回來了！${gainsHtml(DM.expResult.gains)}</div>` : "";
    const pick = free.length ? `<label class="dm-note">派誰去：<select id="dm-exp-comp">${free.map(x => `<option value="${x}">${compName(x)}</option>`).join("")}</select></label>` : `<p class="dm-note">同伴都出去了。</p>`;
    const dests = cityCat().dests.map(d => {
      const locked = c.city_lv < d.city;
      const can = !locked && !full && free.length && Object.entries(d.cost).every(([k, n]) => st[k] >= n);
      const gain = Object.keys(d.gain).map(k => resInfo(k).emoji).join("") + (d.survivor ? "🧑" : "") + (d.rare ? "🔮" : "");
      return `<div class="dm-exp ${locked ? "off" : ""}">${ic("exp", d.id, d.emoji, "big")}<div class="dm-proj-b"><b>${esc(d.name)}</b><small>${esc(d.desc)}・${d.hours} 小時・可能帶回 ${gain}</small>
        <div class="dm-chips">${costHtml(d.cost, st)}</div></div>
        <button type="button" class="btn dm-btn" data-dm="expgo" data-v="${d.id}" ${can && !DM.busy ? "" : "disabled"}>${locked ? `🔒 Lv${d.city}` : "出發"}</button></div>`;
    }).join("");
    return res + `<div class="card"><h3>🧭 遠征中（${(c.expeditions || []).length}/${c.slots}）</h3>${going || `<p class="dm-note">現在沒有隊伍在外面。</p>`}
      <p class="dm-note">遠征期間你專注多久，遠征就提早多久回來。蓋無線電塔可以同時派更多隊。同伴好感越高，帶回越多。</p></div>
      <div class="card"><h3>🗺️ 派遣遠征</h3>${pick}${dests}</div>`;
  }
  setInterval(() => {
    document.querySelectorAll("[data-dm-left]").forEach(el => { el.textContent = leftText(Date.parse(el.dataset.dmLeft) - Date.now()); });
  }, 30000);

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
      .dm-img.sm, .dm-emo.sm { width: 24px; height: 24px; font-size: 18px; vertical-align: -6px; }
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
      .dm-res .dm-img { width: 46px; height: 46px; margin-bottom: 2px; }
      .dm-res .dm-emo { font-size: 34px; }
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
      .dm-stash.done summary { color: #f9a825; }
      .dm-scene-city { position: relative; border-radius: 12px; overflow: hidden; margin-bottom: 8px; }
      .dm-scene-city .dm-img.banner { margin: 0; display: block; }
      .dm-glow { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 80%, rgba(255,190,90,.9), transparent 70%); mix-blend-mode: screen; pointer-events: none; }
      .dm-pin { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; animation: dm-pin 2.4s ease-in-out infinite; }
      .dm-pin .dm-img, .dm-pin .dm-emo { width: 24px; height: 24px; border-radius: 50%; box-shadow: 0 0 10px 3px rgba(255,210,120,.6); }
      .dm-pin.lv2 .dm-img, .dm-pin.lv2 .dm-emo { box-shadow: 0 0 14px 5px rgba(255,210,120,.75); }
      .dm-pin.lv3 .dm-img, .dm-pin.lv3 .dm-emo { width: 30px; height: 30px; box-shadow: 0 0 20px 8px rgba(255,220,130,.9); }
      .dm-pin i { font-style: normal; font-size: 9px; color: #ffd54f; text-shadow: 0 0 4px #000; line-height: 1; }
      @keyframes dm-pin { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.35); } }
      .dm-subtabs { display: flex; gap: 6px; margin: 0 0 12px; } .dm-subtabs button { flex: 1; padding: 8px; border-radius: 10px; border: 0; background: rgba(127,127,127,.15); color: inherit; font-weight: 700; cursor: pointer; } .dm-subtabs button.on { background: #ff9800; color: #1b1f2e; }
      .dm-proj, .dm-craft, .dm-exp { display: flex; gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid rgba(127,127,127,.15); }
      .dm-proj.off, .dm-exp.off { opacity: .5; } .dm-proj.done { background: linear-gradient(90deg, rgba(255,193,7,.12), transparent); border-radius: 10px; }
      .dm-proj-b { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; } .dm-proj-b small { opacity: .75; font-size: 12px; }
      .dm-proj-b .btn { align-self: flex-start; margin-top: 4px; }
      .dm-pips { display: inline-flex; gap: 4px; } .dm-pips i { width: 18px; height: 6px; border-radius: 3px; background: rgba(127,127,127,.3); } .dm-pips i.on { background: #ffb300; }
      .dm-craft-btns { display: flex; flex-direction: column; gap: 4px; } .dm-done { color: #66bb6a; font-weight: 700; font-size: 13px; }
      .dm-btn.ghost { background: rgba(127,127,127,.2); color: inherit; }
      #dm-exp-comp { margin-left: 4px; padding: 4px 8px; border-radius: 8px; }
      .dm-trk { margin-top: 10px; } .dm-trk-h { font-weight: 700; margin: 4px 0 6px; }
      .dm-stash { margin-top: 8px; } .dm-stash summary { cursor: pointer; font-weight: 700; padding: 6px 0; } .dm-stash summary b { opacity: .7; font-weight: 600; margin-left: 4px; }
      .dm-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; text-align: center; margin: 8px 0; }
      .dm-stats b { display: block; font-size: 20px; } .dm-stats small { font-size: 11px; opacity: .7; }
      .dm-report { border: 2px solid rgba(66,165,245,.5); }
      .pop { animation: dm-pop .45s cubic-bezier(.2,1.5,.4,1) both; }
      #dm-flash { position: fixed; left: 50%; bottom: 86px; transform: translate(-50%, 30px); opacity: 0; pointer-events: none; z-index: 9999;
        background: linear-gradient(135deg, #e65100, #ff8f00); color: #fff; font-weight: 800; padding: 10px 16px; border-radius: 14px;
        box-shadow: 0 8px 24px rgba(0,0,0,.3); text-align: center; transition: all .35s cubic-bezier(.2,1.5,.4,1); cursor: pointer; max-width: 92vw; }
      #dm-flash small { display: block; font-weight: 500; font-size: 11px; opacity: .9; }
      #dm-flash.show { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
      #dm-zone-box { margin-top: 12px; }
      .dm-zone-t { font-size: 13px; font-weight: 700; margin-bottom: 6px; }
      .dm-zones { display: flex; flex-wrap: wrap; gap: 6px; }
      .dm-zone { border: 1px solid rgba(127,127,127,.3); background: transparent; color: inherit; font: inherit; font-size: 13px; padding: 5px 10px; border-radius: 99px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
      .dm-zone small { font-size: 10px; opacity: .7; }
      .dm-zone.on { background: #e65100; border-color: #e65100; color: #fff; font-weight: 700; }
      .dm-zone[disabled] { opacity: .4; cursor: default; }
      .dm-zone-d { font-size: 12px; opacity: .7; margin-top: 6px; }
      #dm-run { text-align: center; font-size: 14px; margin: 6px auto 0; padding: 5px 14px; border-radius: 99px; background: rgba(230,81,0,.12); width: fit-content; cursor: pointer; position: relative; }
      #dm-run b { font-size: 17px; color: #e65100; }
      #dm-run.bump { animation: dm-pop .5s cubic-bezier(.2,1.6,.4,1); }
      .dm-plus { position: absolute; right: -6px; top: -12px; font-size: 12px; font-weight: 800; color: #e65100; animation: dm-up 1.4s ease forwards; }
      @keyframes dm-up { from { opacity: 1; transform: translateY(6px); } to { opacity: 0; transform: translateY(-14px); } }
      #dm-reveal { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,.6); display: none; align-items: flex-start; justify-content: center; overflow-y: auto; padding: 24px 12px; }
      #dm-reveal.show { display: flex; }
      .dm-rv { width: 100%; max-width: 520px; animation: dm-pop .4s cubic-bezier(.2,1.5,.4,1) both; }
      .dm-rv-h { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; }
      .dm-rv-h b { font-size: 18px; } .dm-rv-h p { margin: 2px 0 0; font-size: 13px; opacity: .8; }
      .dm-rv-bonus { margin: 6px 0 10px; font-weight: 800; text-align: center; animation: dm-pop .5s both; }
      .dm-rv-bonus .dm-card { max-width: 160px; margin: 6px auto 0; }
      .dm-rv-sum { margin: 8px 0; } .dm-rv-sum small { opacity: .7; }
      .dm-card.danger { border-color: #ef5350; background: rgba(239,83,80,.1); }
      .dm-card.danger .dm-tier { color: #ef5350; }
      .dm-runrow { display: flex; justify-content: space-between; width: 100%; border: 0; background: rgba(127,127,127,.08); color: inherit; font: inherit; font-size: 13px; padding: 9px 10px; border-radius: 10px; margin-top: 6px; cursor: pointer; }
      .dm-snd { border: 0; background: transparent; font-size: 16px; cursor: pointer; padding: 0 4px; vertical-align: -2px; }
      .dm-scene { position: relative; height: 112px; margin: 10px 0 4px; border-radius: 14px; overflow: hidden; }
      .dm-scene.day { background: linear-gradient(#7ec8f2, #c9ecff 70%); }
      .dm-scene.dawn { background: linear-gradient(#f6b38c, #ffe0b2 70%); }
      .dm-scene.dusk { background: linear-gradient(#ff8a65, #ffcc80 70%); }
      .dm-scene.night { background: linear-gradient(#0d1b3d, #26355e 75%); }
      .dm-scene.rain { filter: saturate(.7) brightness(.9); }
      .dm-sky { position: absolute; right: 18px; top: 8px; font-size: 26px; }
      .dm-stars { position: absolute; left: 14px; top: 10px; color: #fff8; font-size: 12px; letter-spacing: 4px; animation: dm-twinkle 3s ease-in-out infinite; }
      .dm-cloud { position: absolute; top: 10px; left: -40px; font-size: 24px; opacity: .85; animation: dm-drift 26s linear infinite; }
      .dm-rain { position: absolute; inset: 0; background: repeating-linear-gradient(105deg, transparent 0 9px, rgba(255,255,255,.35) 9px 10px); background-size: 40px 40px; animation: dm-rainfall .6s linear infinite; }
      .dm-ground { position: absolute; left: 0; right: 0; bottom: 0; height: 46px; background: linear-gradient(#8bc34a, #689f38); display: flex; align-items: flex-end; gap: 6px; padding: 0 10px 6px; font-size: 22px; }
      .dm-scene.night .dm-ground { background: linear-gradient(#33502a, #23391d); }
      .dm-house { font-size: 40px; line-height: 1; position: relative; }
      .dm-light { position: absolute; right: -4px; top: -4px; font-size: 14px; font-style: normal; animation: dm-twinkle 2s ease-in-out infinite; }
      .dm-prop { line-height: 1; }
      .dm-walker { position: absolute; bottom: 6px; left: 0; font-size: 20px; animation: dm-walk 18s linear infinite; }
      .dm-blv { position: absolute; left: 8px; top: 6px; font-size: 11px; font-weight: 800; background: rgba(0,0,0,.35); color: #fff; padding: 1px 8px; border-radius: 99px; }
      @keyframes dm-drift { from { transform: translateX(0); } to { transform: translateX(460px); } }
      @keyframes dm-rainfall { from { background-position: 0 0; } to { background-position: -8px 40px; } }
      @keyframes dm-twinkle { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }
      @keyframes dm-walk { 0% { left: 4%; transform: scaleX(-1); } 48% { left: 88%; transform: scaleX(-1); } 50% { left: 88%; transform: scaleX(1); } 98% { left: 4%; transform: scaleX(1); } 100% { left: 4%; transform: scaleX(-1); } }
      .dm-prog.ready { border: 2px solid #ffb300; animation: dm-breathe 2s ease-in-out infinite; }
      .dm-prog-h { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
      .dm-prog-h small { font-size: 11px; opacity: .65; }
      .dm-prog-bar { position: relative; height: 14px; border-radius: 99px; background: rgba(127,127,127,.18); margin: 16px 12px 8px 0; }
      .dm-prog-bar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #66bb6a, #ffb300); transition: width .6s; }
      .dm-prog-mark { position: absolute; top: -12px; transform: translateX(-50%); font-size: 20px; filter: grayscale(1); opacity: .6; }
      .dm-prog-mark.ready { filter: none; opacity: 1; animation: dm-pop .8s ease infinite alternate; }
      .dm-prog-mark.done { filter: none; opacity: .4; }
      .dm-spin-row { display: flex; gap: 14px; align-items: center; }
      .dm-spin-row p { font-size: 13px; margin: 4px 0 8px; }
      .dm-wheel-wrap { position: relative; flex: 0 0 150px; height: 150px; }
      .dm-pin { position: absolute; left: 50%; top: -6px; transform: translateX(-50%); z-index: 2; color: #e65100; font-size: 18px; }
      .dm-wheel { width: 150px; height: 150px; border-radius: 50%; border: 4px solid #fff3; position: relative; box-shadow: 0 4px 14px rgba(0,0,0,.3); }
      .dm-wheel span { position: absolute; left: 50%; top: 50%; width: 24px; height: 24px; margin: -12px 0 0 -12px; text-align: center; font-size: 18px; line-height: 24px; }
      .dm-talk { display: flex; gap: 12px; align-items: center; background: linear-gradient(135deg, rgba(236,64,122,.1), rgba(255,183,77,.1)); }
      .dm-talk small { opacity: .7; font-size: 11px; } .dm-talk p { margin: 2px 0 0; font-size: 14px; }
      .dm-signal { background: linear-gradient(135deg, rgba(38,166,154,.12), rgba(13,27,61,.12)); }
      .dm-cipher { font-family: ui-monospace, monospace; letter-spacing: 1px; line-height: 1.7; font-size: 14px; }
      .dm-boxes { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; margin: 8px 0; }
      .dm-boxbtn { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 6px; border-radius: 14px; border: 2px solid rgba(127,127,127,.25); background: rgba(127,127,127,.06); color: inherit; font: inherit; cursor: pointer; }
      .dm-boxbtn b { font-size: 13px; } .dm-boxbtn small { font-size: 11px; opacity: .7; }
      .dm-boxbtn.bronze { border-color: #a1887f; } .dm-boxbtn.silver { border-color: #90a4ae; } .dm-boxbtn.gold { border-color: #ffb300; } .dm-boxbtn.unid { border-color: #7e57c2; }
      .dm-boxbtn:not([disabled]) { animation: dm-breathe 2.2s ease-in-out infinite; }
      .dm-boxbtn[disabled] { opacity: .45; cursor: default; }
      .dm-comp { border-bottom: 1px solid rgba(127,127,127,.12); padding-bottom: 6px; }
      .dm-comp .dm-fac { border-bottom: 0; }
      .dm-pet { display: flex; flex-direction: column; gap: 4px; }
      .dm-story { font-size: 13px; margin: 2px 0 4px; padding: 8px 10px; border-radius: 10px; background: rgba(236,64,122,.08); }
      .dm-miles { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 6px; }
      .dm-mile { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 8px 4px; border-radius: 12px; background: rgba(127,127,127,.08); font-size: 12px; }
      .dm-mile b { font-size: 14px; } .dm-mile small { opacity: .7; } .dm-mile.got { background: rgba(102,187,106,.18); }
      .dm-mem { padding: 8px 10px; border-radius: 10px; background: rgba(171,71,188,.08); margin-top: 6px; }
      .dm-mem p { font-size: 13px; margin: 2px 0 0; } .dm-mem.off { opacity: .45; }
      .dm-diary { padding: 8px 0; border-bottom: 1px solid rgba(127,127,127,.12); }
      .dm-diary small { margin-left: 8px; opacity: .6; } .dm-diary p { font-size: 13px; line-height: 1.7; margin: 4px 0 0; }
      .dm-label { position: absolute; top: -8px; right: -4px; font-size: 10px; font-weight: 800; background: #e65100; color: #fff; padding: 1px 6px; border-radius: 99px; }
      .dm-card { position: relative; }
      .dm-rv-news { margin: 8px 0; padding: 10px 12px; border-radius: 12px; background: linear-gradient(135deg, rgba(255,179,0,.18), rgba(171,71,188,.12)); font-size: 14px; animation: dm-pop .5s both; }
      .dm-rv-tag { display: inline-block; margin: 4px 6px 4px 0; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 99px; background: rgba(127,127,127,.14); }
      .dm-zone.secret { border-style: dashed; opacity: .55; max-width: 100%; }
      .dm-zone.secret small { white-space: normal; }
      .dm-zone.hidden-zone { border-color: #ab47bc; }
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
    try { hookFocus(); } catch (e) { console.warn(e); }
    if (location.hash === "#doom" && typeof applyPage === "function") setTimeout(() => applyPage("doom"), 0);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.DoomGame = { version: DOOM_JS_VERSION, reload: load, render, state: DM, miss, showReveal, dropCount, sfx };

})();
