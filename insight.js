/* 序光計畫：🧬 專注 DNA ＋ 🏛️ 人生博物館（放在 📊 回顧的分頁裡） */
(function () {
  const INSIGHT_JS_VERSION = "20261105c";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = m => (typeof showToast === "function" ? showToast(m) : console.log(m));
  const hm = m => m >= 60 ? `${Math.floor(m / 60)} 小時${m % 60 ? ` ${Math.round(m % 60)} 分` : ""}` : `${Math.round(m)} 分`;

  /* ================= 🧬 專注 DNA ================= */
  function traits(d) {
    const H = d.hours || [], out = [];
    let best = 0, bi = 0;
    for (let i = 0; i < 24; i++) { const s = H[i] + H[(i + 1) % 24] + H[(i + 2) % 24]; if (s > best) { best = s; bi = i; } }
    const mid = (bi + 1) % 24;
    const chrono = mid >= 5 && mid <= 11 ? ["🌅", "晨型專注者", "早上腦袋最清楚，重要的事放上午做"]
      : mid >= 12 && mid <= 17 ? ["☀️", "午後型專注者", "下午最穩，午餐後是你的黃金時段"]
      : mid >= 18 && mid <= 23 ? ["🌙", "夜貓型專注者", "晚上才進入狀態，記得別太晚睡"] : ["🦉", "深夜型專注者", "半夜最專心，但要小心作息"];
    if (best > 0) out.push([chrono[0], chrono[1], `最常專注的是 ${bi}:00～${(bi + 3) % 24}:00。${chrono[2]}`]);
    const med = d.median_min;
    if (d.sessions) out.push(med >= 50 ? ["🏃", "長跑型", `一次通常專注 ${med} 分鐘，耐力很好`] : med >= 25 ? ["🍅", "番茄鐘型", `一次大約 ${med} 分鐘，節奏剛好`] : ["⚡", "短打型", `一次大約 ${med} 分鐘，試試一次撐到 25 分鐘`]);
    const ratio = d.days ? d.focus_days / d.days : 0;
    if (d.days) out.push(ratio >= 0.8 ? ["📅", "每天型", `這個月 ${d.focus_days}/${d.days} 天都有專注，超穩定`] : ratio >= 0.5 ? ["🔁", "規律型", `${d.focus_days}/${d.days} 天有專注，大部分日子都有在動`] : ["🎆", "爆發型", `${d.focus_days}/${d.days} 天有專注，想做的時候一次做很多`]);
    const subs = (d.subjects || []).filter(s => s.n >= 3);
    const weak = subs.slice().sort((a, b) => b.short - a.short)[0];
    if (weak && weak.short >= 30) out.push(["🧩", "最容易中斷", `「${weak.name}」有 ${weak.short}% 的時候不到 15 分鐘就停了，可以先從 15 分鐘的小目標開始`]);
    const strong = subs.slice().sort((a, b) => b.avg - a.avg)[0];
    if (strong) out.push(["💪", "最能沉浸", `「${strong.name}」平均一次 ${strong.avg} 分鐘，是你最能沉浸的科目`]);
    const W = d.weekdays || [], wn = ["一", "二", "三", "四", "五", "六", "日"];
    const wb = W.indexOf(Math.max(...W));
    if (W[wb] > 0) out.push(["🗓️", "最強的一天", `星期${wn[wb]}總共專注 ${hm(W[wb])}`]);
    return out;
  }

  function helix(d) {
    const H = d.hours || [], max = Math.max(1, ...H);
    const W = 340, Hh = 560, top = 30, step = (Hh - 60) / 23;
    let g = "", back = "", front = "";
    for (let i = 0; i < 24; i++) {
      const y = top + i * step, ph = i / 23 * Math.PI * 3.2;
      const x1 = W / 2 + Math.sin(ph) * 110, x2 = W / 2 - Math.sin(ph) * 110;
      const v = H[i] / max, depth = Math.cos(ph);
      const col = v === 0 ? "rgba(140,150,190,.25)" : `hsl(${280 - v * 150}, 85%, ${55 + v * 10}%)`;
      g += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${col}" stroke-width="${3 + v * 9}" stroke-linecap="round" opacity="${0.55 + depth * 0.25 + 0.2}"><title>${i}:00 ${hm(H[i])}</title></line>`;
      const dot = (x, c) => `<circle cx="${x}" cy="${y}" r="${5 + (v > 0 ? 2 : 0)}" fill="${c}"/>`;
      front += dot(x1, depth > 0 ? "#7cc7ff" : "#3d5a8a") + dot(x2, depth > 0 ? "#3d5a8a" : "#ff9ec7");
      g += `<text x="${W - 6}" y="${y + 4}" font-size="10" fill="#8f98b6" text-anchor="end">${i % 3 === 0 ? i + ":00" : ""}</text>`;
      if (H[i] === max && max > 1) g += `<text x="6" y="${y + 4}" font-size="11" fill="#ffd54a">★ 巔峰</text>`;
    }
    return `<svg class="dna-svg" viewBox="0 0 ${W} ${Hh}">${back}${g}${front}</svg>`;
  }

  function dnaHtml(d) {
    if (!d) return `<div class="ov-empty">載入中…</div>`;
    const m = +String(d.month).slice(5, 7);
    const ts = traits(d);
    const diff = d.total_min - d.prev.total_min;
    return `<div class="ov-nav"><button type="button" class="ov-btn ghost" data-ov="dprev">◀</button><b>${String(d.month).slice(0, 4)} 年 ${m} 月的專注 DNA</b>
        <button type="button" class="ov-btn ghost" data-ov="dnext" ${d.offset >= 0 ? "disabled" : ""}>▶</button></div>
      ${d.sessions ? `<div class="dna-wrap">${helix(d)}<div class="dna-side">
        <div class="dna-stat"><b>${hm(d.total_min)}</b><span>總專注${d.prev.total_min ? `（${diff >= 0 ? "▲" : "▼"} ${hm(Math.abs(diff))}）` : ""}</span></div>
        <div class="dna-stat"><b>${d.median_min} 分</b><span>一次通常多久</span></div>
        <div class="dna-stat"><b>${hm(d.longest_min)}</b><span>最長的一次</span></div>
        <div class="dna-stat"><b>${d.sessions} 次</b><span>專注次數</span></div>
        <div class="dna-stat"><b>${d.goal_rate == null ? "—" : d.goal_rate + "%"}</b><span>🎯 說到做到率${d.goal_n ? `（${d.goal_n} 次）` : ""}</span></div></div></div>
      <p class="ov-note" style="text-align:center;font-size:11.5px">每一條橫槓是一天中的一個小時，越粗越亮代表那個時段越常專注</p>
      <div class="ov-box"><div class="ov-sec">🧬 你的專注基因</div>${ts.map(([e, n, t]) => `<div class="dna-trait"><span>${e}</span><div><b>${esc(n)}</b><small>${esc(t)}</small></div></div>`).join("")}</div>
      <div class="ov-box"><div class="ov-sec">🎯 說到做到</div>${d.goal_n ? `<p class="ov-note" style="margin:0 0 6px">這個月寫了目標的專注有 ${d.goal_n} 次：✅ ${d.goal_done}・🌗 ${d.goal_half}・❌ ${d.goal_n - d.goal_done - d.goal_half}。${d.goal_rate >= 80 ? "說到就做到，很可靠！" : d.goal_rate >= 50 ? "大部分都有做到，目標可以再訂具體一點。" : "目標可能訂太大了，試試切小一點。"}</p>
        ${(d.goal_recent || []).map(g => `<div class="dna-sub"><b>${g.r === "done" ? "✅" : g.r === "half" ? "🌗" : g.r === "no" ? "❌" : "⏳"} ${esc(g.goal)}</b><small>${esc(g.subject)}</small></div>`).join("")}`
        : `<p class="ov-note" style="margin:0">開始專注前在「🎯 這次要完成什麼」寫一句，結束時選有沒有做到，就會算出你的說到做到率。</p>`}</div>
      ${(d.subjects || []).length ? `<div class="ov-box"><div class="ov-sec">📚 各科目的專注習慣</div>${d.subjects.slice(0, 8).map(s => `<div class="dna-sub"><b>${esc(s.name)}</b><span>${hm(s.min)}・${s.n} 次・平均 ${s.avg} 分</span><small>${s.short}% 不到 15 分鐘${s.stop != null ? `・倒數提早結束 ${s.stop}%` : ""}</small></div>`).join("")}</div>` : ""}`
      : `<p class="ov-note">這個月還沒有專注紀錄，專注幾次之後就會長出你的 DNA。</p>`}`;
  }

  /* ================= 🏛️ 人生博物館 ================= */
  const CAT = [["study", "🎓", "學業"], ["work", "💼", "工作"], ["life", "🏠", "生活"], ["travel", "✈️", "旅行"], ["people", "💞", "人際"], ["health", "💪", "健康"], ["other", "⭐", "其他"]];
  const HALLS = ["序章廳", "成長廳", "挑戰廳", "收穫廳", "旅程廳", "閃耀廳", "傳說廳", "未來廳"];
  const MU = { list: null, adding: false, photo: null, view: null, busy: false };

  async function muLoad(rerender) {
    const { data, error } = await db.from("museum_items").select("*").order("happened_on", { ascending: true }).order("id");
    MU.list = error ? [] : data;
    MU.err = error ? error.message : null;
    rerender();
  }

  function frame(it, i) {
    const c = CAT.find(x => x[0] === it.category) || CAT[6];
    return `<button type="button" class="mu-frame" data-mu="view" data-id="${it.id}" style="--tilt:${(i % 3 - 1) * 1.2}deg">
      <div class="mu-pic">${it.photo ? `<img src="${it.photo}" alt="">` : `<span>${esc(it.emoji || c[1])}</span>`}</div>
      <div class="mu-plaque"><b>${esc(it.title)}</b><small>${esc(String(it.happened_on).replace(/-/g, "/"))}・${c[1]} ${c[2]}</small></div></button>`;
  }

  function museumHtml(rerender) {
    if (!MU.list) { muLoad(rerender); return `<div class="ov-empty">載入中…</div>`; }
    if (MU.err) return `<p class="ov-note">⚠️ 博物館的資料庫還沒設定：到 Supabase 的 SQL Editor 執行 <b>sql/2026-11-05_專注DNA_事件_掉落_陪讀_博物館.sql</b>。</p>`;
    const L = MU.list, halls = [];
    for (let i = 0; i < Math.max(1, Math.ceil(L.length / 6)); i++) halls.push(L.slice(i * 6, i * 6 + 6));
    const form = MU.adding ? `<div class="ov-box mu-form">
        <div class="ov-sec">🖼️ 新的展品</div>
        <input id="mu-title" maxlength="60" placeholder="發生了什麼？例如：多益考到 800、交出專題">
        <div class="mu-row"><input id="mu-date" type="date" value="${new Date().toISOString().slice(0, 10)}">
          <select id="mu-cat">${CAT.map(c => `<option value="${c[0]}">${c[1]} ${c[2]}</option>`).join("")}</select>
          <input id="mu-emoji" maxlength="4" placeholder="圖示（選填）" style="width:90px"></div>
        <textarea id="mu-note" maxlength="300" rows="3" placeholder="想對那時候的自己說什麼？（選填）"></textarea>
        <label class="mu-photo">📷 ${MU.photo ? "換一張照片" : "加照片（選填）"}<input id="mu-file" type="file" accept="image/*" hidden></label>
        ${MU.photo ? `<img class="mu-prev" src="${MU.photo}" alt="">` : ""}
        <div class="mu-row"><button type="button" class="ov-btn" data-mu="save" ${MU.busy ? "disabled" : ""}>放進博物館</button><button type="button" class="ov-btn ghost" data-mu="cancel">取消</button></div></div>` : "";
    return `<div class="mu-head"><div><b>🏛️ 人生博物館</b><small>${L.length} 件展品・${halls.length} 間展廳${L.length % 6 ? `・再 ${6 - L.length % 6} 件開新展廳` : L.length ? "・下一件開新展廳" : ""}</small></div>
        ${MU.adding ? "" : `<button type="button" class="ov-btn" data-mu="add">＋ 新增展品</button>`}</div>
      <p class="ov-note">把真實發生的大事放進來：考完試、交出報告、第一次做到的事。每 3 件策展獎勵星屑 50，每開一間新展廳送稀有星願瓶。</p>
      ${form}
      ${L.length ? halls.map((h, i) => `<div class="mu-hall"><div class="mu-hall-name">第 ${i + 1} 展廳・${HALLS[i % HALLS.length]}</div><div class="mu-wall">${h.map((it, j) => frame(it, j)).join("")}${h.length < 6 ? Array.from({ length: 6 - h.length }, () => `<div class="mu-empty">空展位</div>`).join("") : ""}</div></div>`).join("")
        : `<div class="mu-hall"><div class="mu-hall-name">第 1 展廳・${HALLS[0]}</div><div class="mu-wall">${Array.from({ length: 6 }, () => `<div class="mu-empty">空展位</div>`).join("")}</div></div>`}`;
  }

  function viewItem(id, rerender) {
    const it = (MU.list || []).find(x => String(x.id) === String(id));
    if (!it) return;
    const c = CAT.find(x => x[0] === it.category) || CAT[6];
    const m = document.createElement("div");
    m.className = "mu-modal";
    m.innerHTML = `<div class="mu-card">${it.photo ? `<img src="${it.photo}" alt="">` : `<div class="mu-big">${esc(it.emoji || c[1])}</div>`}
      <h3>${esc(it.title)}</h3><small>${esc(String(it.happened_on).replace(/-/g, "/"))}・${c[1]} ${c[2]}</small>
      ${it.note ? `<p>${esc(it.note)}</p>` : ""}
      <div class="mu-row"><button type="button" class="ov-btn ghost" data-x="del">移出博物館</button><button type="button" class="ov-btn" data-x="close">關閉</button></div></div>`;
    m.addEventListener("click", async e => {
      const x = e.target.dataset.x;
      if (x === "close" || e.target === m) m.remove();
      if (x === "del" && confirm(`確定把「${it.title}」移出博物館？`)) {
        await db.from("museum_items").delete().eq("id", it.id);
        m.remove(); muLoad(rerender);
      }
    });
    document.body.appendChild(m);
  }

  /* 照片縮小成 900px 以內的 JPEG */
  function shrink(file) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, 900 / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let q = 0.8, out = c.toDataURL("image/jpeg", q);
        while (out.length > 380000 && q > 0.3) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
        res(out);
      };
      img.onerror = rej; img.src = url;
    });
  }

  function bind(root, rerender) {
    root.addEventListener("change", async e => {
      if (e.target.id !== "mu-file" || !e.target.files[0]) return;
      try { MU.photo = await shrink(e.target.files[0]); keep(root); rerender(); restore(root); } catch (_) { toast("這張照片讀不了"); }
    });
    root.addEventListener("click", async e => {
      const b = e.target.closest("[data-mu]");
      if (!b) return;
      const a = b.dataset.mu;
      if (a === "add") { MU.adding = true; MU.photo = null; rerender(); }
      if (a === "cancel") { MU.adding = false; MU.photo = null; rerender(); }
      if (a === "view") viewItem(b.dataset.id, rerender);
      if (a === "save") {
        const v = id => (root.querySelector("#" + id) || {}).value || "";
        if (!v("mu-title").trim()) return toast("先寫發生了什麼");
        MU.busy = true; rerender && null;
        const { error } = await db.from("museum_items").insert({ title: v("mu-title").trim(), happened_on: v("mu-date") || undefined, category: v("mu-cat"), emoji: v("mu-emoji").trim() || null, note: v("mu-note").trim() || null, photo: MU.photo });
        MU.busy = false;
        if (error) return toast("❌ " + error.message);
        MU.adding = false; MU.photo = null;
        toast("🏛️ 放進博物館了");
        const r = await db.rpc("museum_reward");
        ((r.data && r.data.got) || []).forEach((g, i) => setTimeout(() => toast("🏛️ " + g.text), 1200 + i * 1400));
        muLoad(rerender);
      }
    });
  }
  /* 選照片時重畫會清掉已經填的字：先記下來 */
  let draft = null;
  function keep(root) { draft = ["mu-title", "mu-date", "mu-cat", "mu-emoji", "mu-note"].map(id => [id, (root.querySelector("#" + id) || {}).value]); }
  function restore(root) { setTimeout(() => { (draft || []).forEach(([id, v]) => { const el = root.querySelector("#" + id); if (el && v != null) el.value = v; }); draft = null; }, 0); }

  const st = document.createElement("style");
  st.textContent = `
    .dna-wrap { display: flex; gap: 10px; align-items: center; }
    .dna-svg { flex: 1.3; width: 100%; max-width: 300px; background: radial-gradient(circle at 50% 40%, #241d4a, #12162a 70%); border-radius: 16px; }
    .dna-side { flex: 1; display: grid; gap: 8px; }
    .dna-stat { background: #1b2033; border-radius: 12px; padding: 8px 10px; } .dna-stat b { display: block; font-size: 17px; color: #ffd166; } .dna-stat span { font-size: 11.5px; color: #8f98b6; }
    .dna-trait { display: flex; gap: 10px; padding: 8px 0; border-top: 1px solid #2c3350; } .dna-trait > span { font-size: 24px; } .dna-trait small { display: block; font-size: 12px; color: #a9b1cc; }
    .dna-sub { padding: 6px 0; border-top: 1px solid #2c3350; font-size: 13px; } .dna-sub span { margin-left: 8px; color: #cdd3ea; } .dna-sub small { display: block; color: #8f98b6; font-size: 11.5px; }
    @media (max-width: 480px) { .dna-wrap { flex-direction: column; } .dna-side { grid-template-columns: 1fr 1fr; width: 100%; } }
    .mu-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; } .mu-head small { display: block; font-size: 12px; color: #8f98b6; }
    .mu-form input, .mu-form select, .mu-form textarea { width: 100%; box-sizing: border-box; background: #12162a; color: #eef; border: 1px solid #3a4260; border-radius: 10px; padding: 8px; font: inherit; margin: 4px 0; }
    .mu-row { display: flex; gap: 6px; align-items: center; } .mu-row > * { flex: 1; }
    .mu-photo { display: inline-block; margin: 4px 0; padding: 6px 10px; border-radius: 10px; background: #232a40; cursor: pointer; font-size: 13px; }
    .mu-prev { display: block; max-width: 160px; border-radius: 8px; margin: 4px 0; }
    .mu-hall { margin: 14px 0; border-radius: 16px; overflow: hidden; background: linear-gradient(rgba(30,15,15,.25), rgba(30,15,15,.45)), url(img/museum/wall.webp) center / cover, #3a2f4f; padding: 0 0 14px; }
    .mu-hall-name { text-align: center; font-weight: 800; padding: 8px; background: linear-gradient(90deg, transparent, rgba(255,213,74,.25), transparent); color: #ffe6a0; letter-spacing: 2px; }
    .mu-wall { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 10px 12px 0; }
    .mu-frame { border: 0; padding: 6px; background: linear-gradient(135deg, #e8c46a, #a87a2a, #f0d690); border-radius: 6px; box-shadow: 0 6px 14px rgba(0,0,0,.45); cursor: pointer; transform: rotate(var(--tilt)); font: inherit; color: inherit; }
    .mu-pic { aspect-ratio: 1; background: #f6efe0; display: grid; place-items: center; overflow: hidden; } .mu-pic img { width: 100%; height: 100%; object-fit: cover; } .mu-pic span { font-size: 38px; }
    .mu-plaque { background: #2a2014; color: #f3e4c0; margin-top: 4px; padding: 3px 2px; border-radius: 3px; } .mu-plaque b { display: block; font-size: 11px; line-height: 1.25; } .mu-plaque small { font-size: 9.5px; opacity: .8; }
    .mu-empty { aspect-ratio: .78; border: 2px dashed rgba(255,230,160,.25); border-radius: 6px; display: grid; place-items: center; font-size: 11px; color: rgba(255,230,160,.4); }
    .mu-modal { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,.7); display: grid; place-items: center; padding: 16px; }
    .mu-card { width: min(420px, 100%); max-height: 90vh; overflow-y: auto; background: #1b2033; color: #eef; border-radius: 18px; padding: 16px; text-align: center; border: 3px solid #d9b25a; }
    .mu-card img { width: 100%; border-radius: 10px; } .mu-big { font-size: 80px; } .mu-card p { text-align: left; white-space: pre-wrap; font-size: 14px; }
  `;
  document.head.appendChild(st);

  window.Insight = { version: INSIGHT_JS_VERSION, dnaHtml, museumHtml, bind, museum: MU };
  /* 綁在 📊 回顧的視窗上 */
  (function autoBind(n) {
    const ov = document.getElementById("ov-overlay");
    if (ov && window.OverviewGame && window.OverviewGame.rerender) { if (!ov.__mu) { ov.__mu = true; bind(ov, () => window.OverviewGame.rerender()); } return; }
    if (n < 120) setTimeout(() => autoBind(n + 1), 1000);
  })(0);
})();
