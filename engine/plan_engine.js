/*
 * PlanEngine — automatic day-by-day trip planner for the Japan trip planner.
 *
 * Pure, deterministic, dependency-free. Works as CommonJS (node) and as a browser
 * global (window.PlanEngine). Code is English; Thai appears only in user-facing strings
 * and in the regexes that read the (Thai) module database.
 *
 *   PlanEngine.generate(opts, data)        -> plan object (see README.md)
 *   PlanEngine.listPassOptions(hubId, data) -> passes usable from that hub
 *   PlanEngine.fromHubFiles({...})          -> data adapter for the JSON files in data/
 *   PlanEngine.fromPageGlobals({...})       -> data adapter for index.html globals
 *   PlanEngine.formatPlanText(plan)         -> readable Thai text of a plan
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PlanEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const VERSION = "1.0.0";
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const MONTH_TH = { jan: "ม.ค.", feb: "ก.พ.", mar: "มี.ค.", apr: "เม.ย.", may: "พ.ค.", jun: "มิ.ย.", jul: "ก.ค.", aug: "ส.ค.", sep: "ก.ย.", oct: "ต.ค.", nov: "พ.ย.", dec: "ธ.ค." };
  const HUB_TH = { tokyo: "โตเกียว", osaka: "โอซาก้า", sendai: "เซนได", nagoya: "นาโกย่า", fukuoka: "ฟุกุโอกะ", sapporo: "ซัปโปโร" };
  const THEME_TH = { sakura: "ซากุระ", foliage: "ใบไม้เปลี่ยนสี", shop: "ช้อปปิ้ง", food: "สายกิน", nature: "ธรรมชาติ", onsen: "ออนเซ็น", snow: "หิมะ & ฤดูหนาว", photo: "ถ่ายรูป/วิวสวย", festival: "เทศกาล/อีเวนต์", culture: "ประวัติศาสตร์/วัฒนธรรม", night: "ไนต์ไลฟ์/ซาเก", anime: "อนิเมะ/ป๊อปคัลเจอร์", park: "สวนสนุก", chill: "ชิลๆ เดินน้อย" };
  const THEMES = Object.keys(THEME_TH);
  // run = max consecutive long days before a rest/city/short day; maxMin = default one-way cap
  const PACE = {
    relaxed: { run: 1, maxMin: 120, cityShare: 0.4, label: "สบาย ๆ" },
    normal: { run: 2, maxMin: 180, cityShare: 0.25, label: "ปกติ" },
    packed: { run: 3, maxMin: 240, cityShare: 0.1, label: "แน่น" }
  };
  const LONG_MIN = 120;                       // a day trip with >= 120 min one-way is a "long" day
  const MONTH_FIT = { 5: 1.25, 4: 1.0, 3: 0.7, 2: 0.4 };
  const THEME_FIT = [0.7, 1.0, 1.25, 1.4];    // by number of matched user themes (0..3+)
  const DEFAULT_YEN_PER_POINT = 5000;         // 1 quality point is worth ~¥5,000 of transport
  const MAX_AUTO_WINDOW = 21;                 // ignore IC cards / 28-day products in auto mode
  const PASS_USE_BONUS = 1.0;                 // selection-only bonus (x fare) for covered trips inside a window

  // Theme inference rules ported 1:1 from index.html (MT_RULES) so the engine agrees with the UI.
  const MT_RULES = {
    snow: [/หิมะ|snow|สกี|ski|juhyo|น้ำแข็ง|Gala|Hakkoda|Zao|เคงอน|Kegon|ต้นไม้น้ำแข็ง/i, 9],
    photo: [/วิวฟูจิ|Fuji|Chureito|ชมวิว|วิว|ถ่ายรูป|sunset|Skytree|Observatory|ทะเลสาบ|Lake|torii|กระเช้า|ropeway|Illumination|ไฟประดับ/i, 5],
    culture: [/วัด|ศาล|ปราสาท|Temple|Shrine|Castle|ซามูไร|เมืองเก่า|Toshogu|Senso-ji|Zenkoji|มรดกโลก|Chusonji|Hiraizumi|Ouchi-juku|Kakunodate|Yamadera|Kura|kura|โรงเหล้า|samurai/i, 5],
    night: [/ไนต์|Golden Gai|Omoide|Izakaya|อิซากายะ|ซาเก|sake|Sake|Kabukicho|ย่านกลางคืน|Night|night|ยามค่ำ|กลางคืน|ผับ|บาร์/i, 3],
    anime: [/Akihabara|Pok[eé]mon|Nakano|อนิเมะ|เกม|Gundam|Otome|Sanrio|Ghibli|Animate|Mandarake|Jump|Pokemon|ฟิกเกอร์|โอตาคุ/i, 2],
    chill: [/คาเฟ่|ชิล|สบาย ๆ|สบายๆ|Kichijoji|Inokashira|Daikanyama|เดินน้อย|พักผ่อน|แช่ออนเซ็น|Onsen|ออนเซ็น|สวน|เรือ/i, 6],
    festival: [/เทศกาล|Matsuri|Festival|Illumination|ไฟประดับ|Setsubun|Lantern|Enburi|Namahage/i, 8],
    sakura: [/ซากุระ|sakura|cherry|ฮานามิ|hanami/i, 3]
  };
  const RX_SAKURA = /ซากุระ|sakura|cherry|ฮานามิ|hanami/i;
  const RX_SNOW = /หิมะ|snow|สกี|ski|น้ำแข็ง|juhyo|ไอซ์|ice/i;
  const RX_FEST = /เทศกาล|matsuri|festival|ไฟประดับ|illumination|พลุ|fireworks|มัตสึริ/i;
  const RX_EVT = /festival|matsuri|เทศกาล|lantern|illumination|setsubun|ไฟ/i;
  const RX_EST = /ประมาณ|ควรเช็ค|estimate|approx/i;
  const RX_JR_ROUTE = /shinkansen|ชินคันเซ็น|\bJR\b|limited express|ด่วนพิเศษ/i;
  const RX_NEG = /ไม่|not|except|ยกเว้น/i;
  const HUB_EN = { tokyo: "Tokyo", osaka: "Osaka", sendai: "Sendai", nagoya: "Nagoya", fukuoka: "Fukuoka", sapporo: "Sapporo" };
  const RX_GENERIC_STOP = /^(jr|station|สถานี|ร้าน|มื้อ|lunch|dinner|breakfast|hotel|โรงแรม|check|เช็ค|กลับ|return|เดิน|walk|ออก|shinkansen|limited|ขึ้น|นั่ง|ไป|ถึง|ฝาก|ซื้อ|กิน|ชิม|พัก|ช้อป|เที่ยว)/;

  // ------------------------------------------------------------------ small utils
  const yen = n => "¥" + Math.round(n || 0).toLocaleString("en-US");
  const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const round = (x, d) => { const k = Math.pow(10, d || 0); return Math.round(x * k) / k; };
  const shortT = m => String((m && (m.title || m.id)) || "").split(/[:：–—(（]/)[0].trim();
  const minsOf = m => (m && ((m.fromHub && m.fromHub.minutes) || (m.fromUeno && m.fromUeno.minutes))) || 0;
  const fareOf = m => (m && m.fare && +m.fare.singleRT) || 0;
  // extraCost = local costs a pass does not cover. Synthesized away-* modules copy their whole fare
  // into extraCost, so for them it is not an "extra" and is ignored (would double count).
  const extraOf = m => { const x = (m && !m.away && m.passes && +m.passes.extraCost) || 0; return x && x >= fareOf(m) && fareOf(m) > 0 && isSynth(m) ? 0 : x; };
  // hub modules generated by script copy the whole fare into extraCost (identical numbers): not a real extra
  const isSynth = m => !!(m && m.fromHub && m.passes && +m.passes.extraCost === fareOf(m));
  const isEnd = m => m && (m.kind === "arrival" || m.kind === "departure");
  const isCity = m => m && m.kind === "city";
  const scoreOf = (m, mo) => (m && m.months && m.months[mo] && +m.months[mo].score) || 0;
  const noteOf = (m, mo) => (m && m.months && m.months[mo] && m.months[mo].note) || "";
  const passName = p => String((p && p.n) || "").replace(/\s*[(/].*$/, "").trim() || (p && p.id) || "";
  const hav = (a, b) => {
    const R = 6371, r = x => x * Math.PI / 180, dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]);
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const parseGps = s => {
    if (Array.isArray(s) && s.length >= 2 && isFinite(s[0]) && isFinite(s[1])) return [+s[0], +s[1]];
    const x = String(s || "").match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    return x ? [+x[1], +x[2]] : null;
  };
  const stopKey = name => String(name || "").toLowerCase().replace(/\(.*?\)|（.*?）/g, " ")
    .replace(/[^a-z0-9ก-๙]+/g, " ").trim().split(/\s+/).slice(0, 2).join(" ");

  // ------------------------------------------------------------------ per-data preparation (cached)
  const PREP = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  function prep(data) {
    if (PREP && PREP.has(data)) return PREP.get(data);
    const MOD = data.MOD || {}, events = data.events || [];
    const P = { themes: {}, pos: {}, keys: {}, star: {}, cov: {}, red: {}, dist: {}, planFreq: data.planFreq || {}, group: {} };
    (data.PASSCAT || []).forEach(p => { if (p && p.id) P.group[p.id] = p.g || ""; });
    Object.keys(MOD).sort().forEach(id => {
      const m = MOD[id];
      P.themes[id] = inferThemes(m, events);
      const pp = (data.pos && data.pos[id]) || parseGps(m._center) || parseGps(m.geo) || centroid(m);
      if (pp) P.pos[id] = pp;
      const st = (m.day && m.day.stops) || [];
      const ok = k => k.length >= 5 && !RX_GENERIC_STOP.test(k);
      P.keys[id] = [...new Set(st.map(s => stopKey(s.name)).filter(ok))];
      P.star[id] = [...new Set(st.filter(s => s.star).map(s => stopKey(s.name)).filter(ok))];
    });
    if (PREP) PREP.set(data, P);
    return P;
  }
  function centroid(m) {
    const st = (m && m.day && m.day.stops) || [];
    const pts = st.filter(s => s.star).map(s => parseGps(s.gps)).filter(Boolean);
    const use = pts.length ? pts : st.map(s => parseGps(s.gps)).filter(Boolean);
    if (!use.length) return null;
    return [use.reduce((a, p) => a + p[0], 0) / use.length, use.reduce((a, p) => a + p[1], 0) / use.length];
  }
  function inferThemes(m, events) {
    const st = (m.day && m.day.stops) || [];
    const main = [m.title, m.pitch].join(" ");
    const rest = [m.day && m.day.must].concat(st.map(x => x.name + " " + (x.hi || ""))).concat(m.closures || []).join(" ");
    const out = (m.themes || []).slice(), add = [];
    Object.keys(MT_RULES).forEach(k => {
      const rx = MT_RULES[k][0], need = MT_RULES[k][1];
      const g = x => (String(x).match(new RegExp(rx.source, "gi")) || []).length;
      let n = 3 * g(main) + g(rest);
      if (k === "festival" && events.some(e => e.city === m.id && RX_EVT.test((e.name || "") + (e.th || "")))) n += 8;
      if (k === "chill" && minsOf(m) * 2 > 240) n = 0;
      if (k === "snow" && scoreOf(m, "jan") >= 4 && /หิมะ|snow/i.test(JSON.stringify(m.months || {}))) n += 3;
      if (n >= need && !out.includes(k)) add.push([n, k]);
    });
    add.sort((a, b) => b[0] - a[0] || cmpStr(a[1], b[1]));
    return out.concat(add.slice(0, 4).map(x => x[1]));
  }

  // ------------------------------------------------------------------ pass coverage
  // Returns null or {src, conf}. src: flag | ok | cover | xpass | derived.
  // o (optional): in auto/none mode, coverage whose fare baseline is a different (JR) route is ignored
  function coverOf(data, P, pid, id, o) {
    const r = coverRaw(data, P, pid, id);
    return r && o && o.strategy !== "select" && r.conf === "route" ? null : r;
  }
  function coverRaw(data, P, pid, id) {
    const key = pid + "|" + id;
    if (key in P.cov) return P.cov[key];
    const m = (data.MOD || {})[id];
    let r = null;
    if (m) {
      const ps = m.passes || {};
      const cv = (data.cover || {})[pid];
      const inCover = cv && (cv.full || []).includes(id);
      if (isEnd(m)) {
        // airport legs count only when the data explicitly lists them (cover.full / passes.ok)
        if (inCover) r = { src: "cover", conf: cv.confidence === "unverified" ? "unverified" : "verified" };
        else if ((ps.ok || []).includes(pid)) r = { src: "ok", conf: "verified" };
      } else if (pid === "jre_eastpass_new" && ps.jrEast === true) r = { src: "flag", conf: "verified" };
      else if (pid === "jre_tokyo_wide" && ps.tokyoWide === true) r = { src: "flag", conf: "verified" };
      else if (inCover) r = { src: "cover", conf: cv.confidence === "unverified" ? "unverified" : "verified" };
      else if ((ps.ok || []).includes(pid)) r = m.away ? awayOk(data, pid, m, cv) : { src: "ok", conf: "verified" };
      else if ((((data.xpassCover || {})[pid]) || []).includes(id)) r = { src: "xpass", conf: "verified" };
      else if (cv && (cv.partial || []).some(x => x && x.m === id)) r = { src: "partial", conf: "partial" };
      else if (pid === "jrp_national" && !(data.cover || {}).jrp_national && (ps.jrEast === true || ps.tokyoWide === true))
        r = { src: "derived", conf: "derived" };   // hub without a national-pass cover map (Tokyo): JR East lines are JR lines
    }
    // a non-JR pass credited with a fare that the module prices on JR / Shinkansen: saving may be overstated
    if (r && r.conf !== "derived" && !isEnd(m) && P.group[pid] && P.group[pid] !== "jr" &&
      RX_JR_ROUTE.test(((m.fromHub || m.fromUeno || {}).route || "") + " " + ((m.fare || {}).note || ""))) r = { src: r.src, conf: "route" };
    P.cov[key] = r;
    return r;
  }
  // Synthesized away-* modules list passes valid at the destination; the hub's curated cover map says
  // whether the pass also works from this hub. Explicit exclusions win; otherwise the claim is unverified
  // unless the cover text names the destination.
  function awayOk(data, pid, m, cv) {
    if (!cv) return { src: "ok", conf: "unverified" };
    const segs = (cv.away || []).map(String), hub = HUB_EN[data.hubId] || "";
    if (hub && segs.some(t => t.includes(hub) && RX_NEG.test(t))) return null;
    const txt = segs.join(" | ");
    if (hub && /เท่านั้น|\bonly\b/i.test(txt) && !txt.includes(hub)) return null;
    const name = String(m.away).toLowerCase();
    const named = segs.some(t => t.toLowerCase().includes(name) && !RX_NEG.test(t));
    return { src: "ok", conf: named && cv.confidence !== "unverified" ? "verified" : "unverified" };
  }
  function partialWhy(data, pid, id) {
    const cv = (data.cover || {})[pid];
    const p = cv && (cv.partial || []).find(x => x && x.m === id);
    return p ? (p.why || "ครอบคลุมบางส่วน") : "";
  }
  function hubPasses(hubId, data) {
    const cat = data.PASSCAT || [], win = data.PASSWIN || {}, cover = data.cover || {};
    return cat.filter(p => p && p.st === "active" && win[p.id] && ((p.h || []).includes(hubId) || cover[p.id]))
      .sort((a, b) => cmpStr(a.id, b.id));
  }

  function listPassOptions(hubId, data) {
    if (!data || !data.MOD) return [];
    const P = prep(data), ids = Object.keys(data.MOD).sort();
    return hubPasses(hubId || data.hubId, data).map(p => {
      const covered = ids.filter(id => !isEnd(data.MOD[id]) && coverOf(data, P, p.id, id));
      const conf = covered.map(id => coverOf(data, P, p.id, id).conf);
      return {
        id: p.id, name: passName(p), fullName: p.n, validity: p.v || "", consecutive: !!data.PASSWIN[p.id].c,
        variants: data.PASSWIN[p.id].o.map(([days, price]) => ({ days, price })),
        coveredCount: covered.length, covered,
        unverifiedCount: conf.filter(c => c !== "verified").length,
        catalogConfidence: p.cf || "", group: p.g || ""
      };
    }).sort((a, b) => b.coveredCount - a.coveredCount || a.variants[0].price - b.variants[0].price || cmpStr(a.id, b.id));
  }

  // ------------------------------------------------------------------ options
  function normalizeOpts(o, data) {
    o = o || {};
    const errs = [], warn = [];
    const hub = o.hub || o.hubId || data.hubId;
    if (!hub) errs.push("ไม่ได้ระบุฐาน (hub)");
    else if (data.hubId && hub !== data.hubId) errs.push("ข้อมูลที่ส่งมาเป็นของฐาน " + data.hubId + " แต่ขอแผนฐาน " + hub);
    const month = String(o.month || "").toLowerCase().slice(0, 3);
    if (!MONTHS.includes(month)) errs.push("เดือนไม่ถูกต้อง: " + o.month + " (ใช้ jan..dec)");
    const days = +(o.days != null ? o.days : o.totalDays);
    if (!Number.isInteger(days) || days < 3 || days > 15) errs.push("จำนวนวันต้องเป็น 3–15 วัน (ได้ " + (o.days != null ? o.days : o.totalDays) + ")");
    const pace = o.pace || "normal";
    if (!PACE[pace]) errs.push("pace ต้องเป็น relaxed / normal / packed");
    let strategy = o.passStrategy || o.strategy || "auto";
    if (!["auto", "none", "select"].includes(strategy)) errs.push("passStrategy ต้องเป็น auto / none / select");
    const themes = [];
    (o.themes || []).forEach(t => { if (THEMES.includes(t)) { if (!themes.includes(t)) themes.push(t); } else warn.push("ไม่รู้จักธีม \"" + t + "\" จึงข้ามไป"); });
    const maxPasses = o.maxPasses == null ? 3 : +o.maxPasses;
    if (!(maxPasses >= 0 && maxPasses <= 3)) errs.push("maxPasses ต้องอยู่ระหว่าง 0–3");
    const sel = [];
    if (strategy === "select") {
      (o.passes || []).forEach(x => {
        const id = typeof x === "string" ? x : x && x.id, d = typeof x === "object" && x && x.days ? +x.days : null;
        const w = (data.PASSWIN || {})[id], c = (data.PASSCAT || []).find(p => p.id === id);
        if (!w || !c) { errs.push("ไม่พบพาส \"" + id + "\" ในแคตตาล็อก (หรือไม่มีราคา/จำนวนวัน)"); return; }
        if (c.st !== "active") errs.push("พาส " + passName(c) + " ไม่ได้อยู่ในสถานะขายอยู่ (" + c.st + ")");
        if (d && !w.o.some(v => v[0] === d)) errs.push("พาส " + passName(c) + " ไม่มีแบบ " + d + " วัน (มี " + w.o.map(v => v[0]).join("/") + " วัน)");
        if (sel.some(s => s.id === id)) { warn.push("เลือกพาส " + passName(c) + " ซ้ำ ใช้ครั้งเดียว"); return; }
        sel.push({ id, days: d });
      });
      if (!sel.length) errs.push("เลือกแบบกำหนดพาสเอง (select) แต่ไม่ได้ระบุพาส");
      if (sel.length > Math.max(1, maxPasses)) errs.push("เลือกพาส " + sel.length + " ใบ เกินจำนวนสูงสุด " + maxPasses + " ใบ");
    }
    const ids = x => (Array.isArray(x) ? x : []).filter(id => typeof id === "string");
    const must = ids(o.mustInclude), avoid = ids(o.avoid);
    must.forEach(id => { const m = (data.MOD || {})[id]; if (!m) errs.push("ไม่พบโมดูล \"" + id + "\" ที่ต้องการให้รวม"); else if (isEnd(m)) errs.push("โมดูล " + id + " เป็นวันมาถึง/กลับ ใส่ใน mustInclude ไม่ได้"); });
    must.forEach(id => { if (avoid.includes(id)) errs.push("โมดูล " + id + " อยู่ทั้งใน mustInclude และ avoid"); });
    const arrival = o.arrival !== false, departure = o.departure !== false;
    const free = (Number.isInteger(days) ? days : 0) - (arrival ? 1 : 0) - (departure ? 1 : 0);
    if (Number.isInteger(days) && free < 1) errs.push("ไม่มีวันว่างให้เที่ยว (วันทั้งหมด " + days + " วัน รวมวันมาถึง/วันกลับ)");
    if (must.length > free) errs.push("ต้องการรวม " + must.length + " ที่ แต่มีวันเที่ยวเพียง " + free + " วัน");
    const maxOneWayMin = o.maxOneWayMin != null ? +o.maxOneWayMin : (PACE[pace] || PACE.normal).maxMin;
    if (!(maxOneWayMin >= 15)) errs.push("maxOneWayMin ต้องมากกว่า 15 นาที");
    const budget = o.budgetJPY != null ? +o.budgetJPY : null;
    if (budget != null && !(budget >= 0)) errs.push("budgetJPY ต้องเป็นตัวเลข ≥ 0");
    return {
      errs, warn,
      o: {
        hub, month, days, pace, strategy, themes, maxPasses, passes: sel, keepPassOrder: !!o.keepPassOrder,
        maxOneWayMin, allowOvernight: !!o.allowOvernight, mustInclude: must, avoid, budgetJPY: budget,
        arrival, departure, free,
        yenPerPoint: o.yenPerPoint > 0 ? +o.yenPerPoint : DEFAULT_YEN_PER_POINT,
        popExp: o.popExp > 0 ? +o.popExp : (days >= 7 ? 1.8 : 1)
      }
    };
  }

  // ------------------------------------------------------------------ candidates & scoring
  function popOf(data, P, id) {
    const x = (data.popularity || {})[id];
    const p = typeof x === "number" ? x : x && +x.p;
    if (p >= 1 && p <= 5) return { p, src: "data" };
    return { p: 2.5, src: "default" };
  }
  function themeMatch(data, P, m, mo, themes) {
    if (!themes.length) return [];
    const has = P.themes[m.id] || [], note = noteOf(m, mo);
    const ev = (data.events || []).filter(e => e.city === m.id && (e.months || []).includes(mo));
    return themes.filter(t => {
      if (t === "sakura") return RX_SAKURA.test(note) || (has.includes("sakura") && ["mar", "apr", "may"].includes(mo) && !/ไม่มี|หมด|ผ่าน/.test(note));
      if (t === "snow") return has.includes("snow") && (["dec", "jan", "feb", "mar"].includes(mo) || RX_SNOW.test(note));
      if (t === "foliage") return has.includes("foliage") && ["sep", "oct", "nov", "dec"].includes(mo);
      if (t === "festival") return ev.length > 0 || (has.includes("festival") && RX_FEST.test(note));
      return has.includes(t);
    });
  }
  function paceFit(pace, mins) {
    if (pace === "relaxed") return mins <= 60 ? 1.1 : mins <= 90 ? 1.0 : mins <= 120 ? 0.85 : 0.65;
    if (pace === "normal") return mins <= 150 ? 1.0 : mins <= 180 ? 0.9 : 0.8;
    return 1.0;
  }
  function buildCandidates(data, P, o) {
    const MOD = data.MOD, out = [], rejected = [];
    Object.keys(MOD).sort().forEach(id => {
      const m = MOD[id];
      if (!m || isEnd(m) || (m.kind !== "daytrip" && m.kind !== "city")) return;
      const must = o.mustInclude.includes(id);
      if (o.avoid.includes(id)) { rejected.push({ id, why: "avoid" }); return; }
      const s = scoreOf(m, o.month), mins = minsOf(m);
      let why = null;
      if (s <= 1) why = "month";
      else if (m.overnight === true && !o.allowOvernight) why = "overnight";
      else if (mins > o.maxOneWayMin && !(m.overnight === true && o.allowOvernight)) why = "minutes";
      if (why && !must) { rejected.push({ id, why }); return; }
      const pop = popOf(data, P, id), matched = themeMatch(data, P, m, o.month, o.themes);
      const fit = MONTH_FIT[Math.min(5, Math.max(2, s))] || 0.4;
      const tf = o.themes.length ? THEME_FIT[Math.min(3, matched.length)] : 1;
      const pf = paceFit(o.pace, mins);
      const freq = Math.min(0.5, 0.1 * (P.planFreq[id] || 0));
      const awayPen = (m.away && data.hubId !== "tokyo" && !must) ? 0.35 : 1, q = 10 * Math.pow((pop.p + freq) / 3, o.popExp) * fit * tf * pf * awayPen;
      out.push({
        id, m, q, s, mins, fare: fareOf(m), extra: extraOf(m), city: isCity(m), long: !isCity(m) && (mins >= LONG_MIN || m.overnight === true),
        overnight: m.overnight === true && o.allowOvernight, pop, matched, must, forcedWhy: why,
        pos: P.pos[id] || null, away: m.away || null
      });
    });
    return { cands: out, rejected };
  }
  // number of city/rest days the pace asks for (min and max until day trips run out)
  const CITY_THEMES = ["shop", "night", "anime"];
  function cityTarget(o) {
    let share = PACE[o.pace].cityShare;
    if (o.themes.length && o.themes.filter(t => CITY_THEMES.includes(t)).length * 2 >= o.themes.length) share += 0.15;
    const n = Math.round(o.free * share);
    return Math.max(0, Math.min(o.free, o.pace === "packed" ? n : Math.max(o.free >= 3 ? 1 : 0, n)));
  }
  function redundant(P, a, b) {
    const k = a.id < b.id ? a.id + "|" + b.id : b.id + "|" + a.id;
    if (k in P.red) return P.red[k];
    return (P.red[k] = redundantRaw(P, a, b));
  }
  function redundantRaw(P, a, b) {
    if (a.id === b.id) return true;
    if (a.away && b.away) {
      const ta = String(a.away).toLowerCase().split(/[\/,]\s*/), tb = String(b.away).toLowerCase().split(/[\/,]\s*/);
      if (ta.some(x => tb.includes(x))) return true;
    }
    const sa = P.star[a.id] || [], sb = P.star[b.id] || [];
    if (sa.some(k => sb.includes(k))) return true;
    if (a.city || b.city) return false;
    if (a.pos && b.pos) {
      const d = hav(a.pos, b.pos);
      if (!!a.away !== !!b.away && d < 25) return true;
      if (a.away && b.away && d < 15) return true;   // synthesized away-city summary vs the detailed module of the same city
      if (d < 3) return true;
      if (d < 10) { const ka = P.keys[a.id] || [], kb = P.keys[b.id] || []; if (ka.some(k => kb.includes(k))) return true; }
    }
    return false;
  }
  function areaPenalty(P, c, chosen) {
    if (c.city || !c.pos) return 1;
    let f = 1;
    chosen.forEach(x => {
      if (x.c.city || !x.c.pos || x.c.id === c.id) return;
      const k = c.id < x.c.id ? c.id + "|" + x.c.id : x.c.id + "|" + c.id;
      const d = k in P.dist ? P.dist[k] : (P.dist[k] = hav(c.pos, x.c.pos));
      if (d < 15) f *= 0.85;
    });
    return f;
  }

  // ------------------------------------------------------------------ airport legs (arrival / departure day)
  // Owner's rule: if a pass window covers the arrival or departure day and that pass covers the hub's airport
  // rail leg, use the pass (leg costs 0, its fare counts toward that pass's saving); otherwise buy a single ticket
  // (the arrival/departure module's stored fare). Tokyo has a fixed rule (JR Narita Express is JR; Keisei
  // Skyliner / Access Express never are). Other hubs: only what hub.cover[pass].full / passes.ok say.
  const AIRPORT_RULES = {
    tokyo: {
      passes: ["jre_eastpass_new", "jre_tokyo_wide", "jrp_national"], fare: 3240,
      covered: "Narita Express (JR)", single: "Keisei Skyliner",
      note: "ค่า Narita Express Narita–Tokyo ~¥3,070 + JR Tokyo–Ueno ~¥170 = ~¥3,240 ต่อเที่ยว (ประมาณ ควรเช็คอีกครั้ง)"
    }
  };
  function airportLeg(data, P, o, pid, endId) {
    const m = (data.MOD || {})[endId];
    if (!m || !pid) return null;
    const rule = AIRPORT_RULES[data.hubId];
    if (rule) return rule.passes.includes(pid) ? { fare: rule.fare, conf: "estimate", label: rule.covered, note: rule.note } : null;
    const r = coverOf(data, P, pid, endId, o);
    return r ? { fare: fareOf(m), conf: r.conf, label: null, note: "" } : null;
  }
  function singleLegLabel(data, m) {
    const rule = AIRPORT_RULES[data.hubId];
    if (rule) return rule.single;
    const r = String(((m && (m.fromHub || m.fromUeno)) || {}).route || "").split(/\s*[|;]\s*/)[0];
    return r ? "รถสนามบินตามเส้นทางในโมดูล (" + (r.length > 70 ? r.slice(0, 70) + "…" : r) + ")" : "รถสนามบิน";
  }

  // ------------------------------------------------------------------ window capacities
  // cfg = [{id, L, price, name}] in time order. Returns capacities or null when infeasible.
  // ends = {a, d}: 1 = the first (last) window also covers the arrival (departure) day. Windows longer than
  // the free days must spill onto an end day; a window may also start on day 1 / end on the last day by
  // choice when the pass pays for the airport leg.
  function capacities(cfg, o, ends) {
    const N = o.days, arr = o.arrival ? 1 : 0, dep = o.departure ? 1 : 0, F = o.free;
    const Ls = cfg.map(w => w.L);
    let T = Ls.reduce((a, b) => a + b, 0), trunc = 0;
    if (T > N) { trunc = T - N; if (!cfg.length || Ls[Ls.length - 1] - trunc < 1) return null; }
    const Leff = Ls.slice(); if (trunc) Leff[Leff.length - 1] -= trunc;
    T = Leff.reduce((a, b) => a + b, 0);
    const a = ends && ends.a ? arr : 0, d = ends && ends.d ? dep : 0;
    if (!cfg.length && (a || d)) return null;
    const k = Leff.slice();
    if (cfg.length) { k[0] -= a; k[k.length - 1] -= d; }
    if (k.some(x => x < 0)) return null;
    const out = F - k.reduce((x, y) => x + y, 0);
    if (out < 0) return null;
    if (cfg.length === 1 && a && d && out > 0) return null;   // one window touching both ends must span the trip
    if (trunc && (a !== arr || d !== dep)) return null;
    return { Leff, k, spillArr: a, spillDep: d, trunc, out };
  }

  // ------------------------------------------------------------------ module selection for one pass configuration
  function selectModules(data, P, o, cands, cfg, cap, yenPerPoint, polish) {
    const run = PACE[o.pace].run, w = 1 / yenPerPoint;
    const types = cfg.map((x, i) => i).concat(["out"]);
    const capOf = {}, longCap = {}, used = {}, longUsed = {};
    types.forEach((t, i) => {
      capOf[t] = t === "out" ? cap.out : cap.k[t];
      longCap[t] = capOf[t] - Math.floor(capOf[t] / (run + 1));
      used[t] = 0; longUsed[t] = 0;
    });
    // with user-chosen passes, the pace's city days are wanted outside the windows (do not waste pass days)
    // (never more than the pool can supply: each city module may be used at most twice)
    const cityMax = cityTarget(o), citySupply = 2 * cands.filter(c => c.city).length;
    const cityMin = Math.min(citySupply, o.strategy === "select" ? Math.min(cityMax, cap.out) : cityMax);
    const chosen = [], useCount = {}, relaxed = [];
    const costIn = (c, t) => (t !== "out" && coverOf(data, P, cfg[t].id, c.id, o) ? 0 : c.fare);
    // inside a pass window a covered module also earns its fare back (the pass is already paid for),
    // so window days go to the covered trips with the largest fare saving
    const useBonus = (c, t) => (t !== "out" && coverOf(data, P, cfg[t].id, c.id, o) ? PASS_USE_BONUS * w * c.fare : 0);
    const val = (c, t, reuse) => c.q * (reuse ? 0.5 : 1) * areaPenalty(P, c, chosen) - w * costIn(c, t) + useBonus(c, t);
    const remaining = () => types.reduce((a, t) => a + capOf[t] - used[t], 0);
    const cityCount = () => chosen.filter(x => x.c.city).length;
    const place = (c, t, reuse, flag) => {
      chosen.push({ c, t, reuse: !!reuse, flag: flag || null });
      used[t]++; if (c.long) longUsed[t]++;
      useCount[c.id] = (useCount[c.id] || 0) + 1;
    };
    // stage 0: must-include modules go first, into the slot type where they are cheapest
    cands.filter(c => c.must).forEach(c => {
      let best = null;
      types.forEach(t => { if (used[t] >= capOf[t]) return; const v = val(c, t, false); if (!best || v > best.v) best = { t, v }; });
      if (best) place(c, best.t, false, "must");
    });
    // stages: 1 strict (window slots take covered trips, month score >= 3, long-day cap), 2 any trip in a window
    // slot + extra long days, 3 a city module twice, 4 month score 2 allowed, 5 redundant neighbours allowed
    for (let stage = 1; stage <= 5 && remaining() > 0; stage++) {
      while (remaining() > 0) {
        let best = null;
        for (const c of cands) {
          const n = useCount[c.id] || 0, reuse = n === 1 && c.city && stage >= 3;
          if (n && !reuse) continue;
          if (c.s < 3 && !c.must && stage < 4) continue;
          if (!reuse && stage < 5 && chosen.some(x => x.c.id !== c.id && redundant(P, c, x.c))) continue;
          if (!c.city && remaining() - 1 < cityMin - cityCount()) continue;
          if (c.city && stage < 3 && cityCount() >= cityMax) continue;
          for (const t of types) {
            if (used[t] >= capOf[t]) continue;
            if (c.long && stage < 2 && longUsed[t] >= longCap[t]) continue;
            if (stage < 2 && t !== "out" && !coverOf(data, P, cfg[t].id, c.id, o)) continue;
            const v = val(c, t, reuse);
            if (!best || v > best.v + 1e-9 || (Math.abs(v - best.v) <= 1e-9 && (cmpStr(c.id, best.c.id) < 0 || (c.id === best.c.id && String(t) < String(best.t)))))
              best = { c, t, v, reuse };
          }
        }
        if (!best) break;
        place(best.c, best.t, best.reuse, stage > 1 ? "stage" + stage : null);
        if (stage > 1) relaxed.push(stage);
      }
    }
    if (polish && remaining() === 0) improve();
    // Deterministic local search on the greedy result: swap slot types of two days, or replace one module by
    // an unused candidate, whenever the selection value rises. Never breaks pace caps, city share, redundancy,
    // month floor or the "window days are covered trips" rule more than the greedy result already did.
    function improve() {
      const others = (list, x) => list.filter(y => y !== x);
      const itemVal = (x, list) => x.c.q * (x.reuse ? 0.5 : 1) * areaPenalty(P, x.c, others(list, x)) - w * costIn(x.c, x.t) + useBonus(x.c, x.t);
      const total = list => list.reduce((a, x) => a + itemVal(x, list), 0);
      const covOk = (c, t) => t === "out" || !!coverOf(data, P, cfg[t].id, c.id, o);
      const longsIn = (list, t) => list.filter(x => x.t === t && x.c.long).length;
      const cities = list => list.filter(x => x.c.city).length;
      const lim = {}; types.forEach(t => { lim[t] = Math.max(longCap[t], longsIn(chosen, t)); });
      const c0 = cities(chosen), cLo = Math.min(cityMin, c0), cHi = Math.max(cityMax, c0);
      const valid = list => types.every(t => longsIn(list, t) <= lim[t]) && cities(list) >= cLo && cities(list) <= cHi;
      let cur = total(chosen), changed = true, guard = 0;
      const apply = list => { chosen.splice(0, chosen.length, ...list); cur = total(chosen); changed = true; };
      while (changed && guard++ < 40) {
        changed = false;
        for (let i = 0; i < chosen.length; i++) for (let j = i + 1; j < chosen.length; j++) {
          const a = chosen[i], b = chosen[j];
          if (a.t === b.t) continue;
          if (!(covOk(a.c, b.t) || !covOk(b.c, b.t)) || !(covOk(b.c, a.t) || !covOk(a.c, a.t))) continue;
          const list = chosen.slice();
          list[i] = Object.assign({}, a, { t: b.t }); list[j] = Object.assign({}, b, { t: a.t });
          if (valid(list) && total(list) > cur + 1e-9) apply(list);
        }
        for (let i = 0; i < chosen.length; i++) {
          const x = chosen[i];
          if (x.flag === "must") continue;
          for (const c of cands) {
            if (chosen.some(y => y.c.id === c.id)) continue;
            if (c.s < 3 && c.s < x.c.s) continue;
            if (!(covOk(c, x.t) || !covOk(x.c, x.t))) continue;
            if (others(chosen, x).some(y => redundant(P, c, y.c))) continue;
            const list = chosen.slice();
            list[i] = { c, t: x.t, reuse: false, flag: null };
            if (valid(list) && total(list) > cur + 1e-9) { apply(list); break; }
          }
        }
      }
    }
    const fixedCost = cfg.reduce((a, x) => a + x.price, 0);
    const varCost = chosen.reduce((a, x) => a + costIn(x.c, x.t), 0);
    const Q = chosen.reduce((a, x) => a + x.c.q * (x.reuse ? 0.5 : 1), 0);
    const J = Q - w * (fixedCost + varCost);
    const winCovered = cfg.map((x, i) => chosen.filter(y => y.t === i && coverOf(data, P, x.id, y.c.id, o)).map(y => y.c));
    return { chosen, J, Q, cost: fixedCost + varCost, complete: remaining() === 0, relaxed, winCovered, cityMin };
  }

  // ------------------------------------------------------------------ configuration search
  function permutations(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    arr.forEach((x, i) => permutations(arr.slice(0, i).concat(arr.slice(i + 1))).forEach(p => out.push([x].concat(p))));
    return out;
  }
  function cfgKey(cfg) { return cfg.map(x => x.id + ":" + x.L).join("+") || "none"; }
  function evalCfg(data, P, o, cands, cfg, ypp, polish) {
    const w = 1 / ypp, n = cfg.length;
    const legA = n && o.arrival ? airportLeg(data, P, o, cfg[0].id, "arrival") : null;
    const legD = n && o.departure ? airportLeg(data, P, o, cfg[n - 1].id, "departure") : null;
    const fA = o.arrival ? fareOf(data.MOD.arrival) : 0, fD = o.departure ? fareOf(data.MOD.departure) : 0;
    let best = null;
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([a, d]) => {
      const cap = capacities(cfg, o, { a, d });
      if (!cap) return;
      // absorbing an end day without airport coverage only when the layout needs it (window longer than free days)
      if (a && !legA && capacities(cfg, o, { a: 0, d })) return;
      if (d && !legD && capacities(cfg, o, { a, d: 0 })) return;
      const sel = selectModules(data, P, o, cands, cfg, cap, ypp, polish);
      const ends = {
        arr: o.arrival ? (cap.spillArr && legA ? { wi: 0, fare: legA.fare } : { wi: cap.spillArr ? 0 : null, fare: fA, single: true }) : null,
        dep: o.departure ? (cap.spillDep && legD ? { wi: n - 1, fare: legD.fare } : { wi: cap.spillDep ? n - 1 : null, fare: fD, single: true }) : null
      };
      const endCov = [ends.arr, ends.dep].filter(e => e && !e.single).reduce((x, e) => x + e.fare, 0);
      const endUnc = [ends.arr, ends.dep].filter(e => e && e.single).reduce((x, e) => x + e.fare, 0);
      const endByWin = cfg.map((x, i) => [ends.arr, ends.dep].filter(e => e && !e.single && e.wi === i).reduce((s2, e) => s2 + e.fare, 0));
      const ev = { cfg, cap, sel, ends, endCov, endUnc, endByWin, J: sel.J + w * endCov };
      if (!best || (ev.sel.complete && !best.sel.complete) || (ev.sel.complete === best.sel.complete && ev.J > best.J + 1e-9)) best = ev;
    });
    return best;
  }
  function betterEval(a, b) { // deterministic preference
    if (!b) return true;
    if (a.sel.complete !== b.sel.complete) return a.sel.complete;
    if (Math.abs(a.J - b.J) > 1e-6) return a.J > b.J;
    if (a.cfg.length !== b.cfg.length) return a.cfg.length < b.cfg.length;
    return cfgKey(a.cfg) < cfgKey(b.cfg);
  }
  function windowSavings(data, P, ev) {
    return ev.cfg.map((x, i) => ev.sel.winCovered[i].reduce((a, c) => a + c.fare, 0) + ev.endByWin[i] - x.price);
  }
  function searchAuto(data, P, o, cands, ypp, considered) {
    const pool = [];
    let best = evalCfg(data, P, o, cands, [], ypp);
    pool.push(best);
    if (o.maxPasses === 0) return evalCfg(data, P, o, cands, [], ypp, true);
    const list = hubPasses(o.hub, data);
    const variants = [];
    list.forEach(p => data.PASSWIN[p.id].o.forEach(([L, price]) => {
      if (L > MAX_AUTO_WINDOW) return;
      const nCov = cands.filter(c => coverOf(data, P, p.id, c.id, o)).length;
      if (nCov < 2) return;
      variants.push({ id: p.id, L, price, name: passName(p) });
    }));
    const strict = ev => ev.cfg.map((x, i) => ev.sel.winCovered[i].filter(c => coverOf(data, P, x.id, c.id, o).conf !== "route").reduce((a, c) => a + c.fare, 0) + ev.endByWin[i] - x.price);
    const ok = ev => ev && ev.sel.complete && ev.sel.winCovered.every(w => w.length >= 2) && strict(ev).every(s => s > 0);
    const singles = [];
    variants.forEach(v => {
      const ev = evalCfg(data, P, o, cands, [v], ypp);
      if (!ev) return;
      const sv = windowSavings(data, P, ev)[0];
      considered.push({ id: v.id, name: v.name, L: v.L, price: v.price, covered: ev.sel.winCovered[0].length, saving: sv, J: ev.J, ok: ok(ev) });
      if (ok(ev)) { singles.push(ev); pool.push(ev); if (betterEval(ev, best)) best = ev; }
    });
    singles.sort((a, b) => b.J - a.J || cmpStr(cfgKey(a.cfg), cfgKey(b.cfg)));
    const top = singles.slice(0, 10).map(e => e.cfg[0]);
    const tryCombo = combo => {
      if (new Set(combo.map(x => x.id)).size !== combo.length) return;
      if (combo.reduce((a, x) => a + x.L, 0) > o.days) return;    // multi-pass windows must fit untruncated
      const orders = [combo];
      if (combo.some(x => airportLeg(data, P, o, x.id, "arrival") || airportLeg(data, P, o, x.id, "departure"))) orders.push(combo.slice().reverse());
      orders.forEach(cb => {
        const ev = evalCfg(data, P, o, cands, cb, ypp);
        if (ok(ev)) { pool.push(ev); if (betterEval(ev, best)) best = ev; }
      });
    };
    if (o.maxPasses >= 2) for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) tryCombo([top[i], top[j]]);
    if (o.maxPasses >= 3) {
      const t6 = top.slice(0, 6);
      for (let i = 0; i < t6.length; i++) for (let j = i + 1; j < t6.length; j++) for (let k = j + 1; k < t6.length; k++) tryCombo([t6[i], t6[j], t6[k]]);
    }
    // polish the best few configurations (plus "no pass") with local search, keep the best acceptable one
    pool.sort((a, b) => (betterEval(a, b) ? -1 : 1));
    const short = pool.slice(0, 6);
    if (!short.some(e => !e.cfg.length)) short.push(pool.find(e => !e.cfg.length));
    let fin = null;
    short.forEach(e => {
      const pe = evalCfg(data, P, o, cands, e.cfg, ypp, true);
      if (pe && (!pe.cfg.length || ok(pe)) && betterEval(pe, fin)) fin = pe;
    });
    return fin || best;
  }
  function searchSelect(data, P, o, cands, ypp) {
    const per = o.passes.map(s => {
      const p = data.PASSCAT.find(x => x.id === s.id);
      return data.PASSWIN[s.id].o.filter(v => !s.days || v[0] === s.days).map(([L, price]) => ({ id: s.id, L, price, name: passName(p) }));
    });
    let combos = [[]];
    per.forEach(vs => { const nx = []; combos.forEach(c => vs.forEach(v => nx.push(c.concat([v])))); combos = nx; });
    let best = null;
    combos.forEach(c => (o.keepPassOrder ? [c] : permutations(c)).forEach(cfg => {
      const ev = evalCfg(data, P, o, cands, cfg, ypp, true);
      if (ev && betterEval(ev, best)) best = ev;
    }));
    return best;
  }

  // ------------------------------------------------------------------ scheduling
  function makeUnits(items, allowBlock) {
    const units = [], ov = items.filter(x => allowBlock && x.c.overnight);
    items.filter(x => !(allowBlock && x.c.overnight)).forEach(x => units.push({ items: [x], long: x.c.long, mins: x.c.mins, id: x.c.id }));
    if (ov.length) units.push({ items: ov, long: true, block: true, mins: Math.max.apply(null, ov.map(x => x.c.mins)), id: ov[0].c.id });
    return units;
  }
  function orderBlock(items, data) {
    const NO = data.northOrder || [];
    const rank = id => { const i = NO.indexOf(id); return i < 0 ? 999 : i; };
    if (NO.length && items.every(x => rank(x.c.id) < 999)) return items.slice().sort((a, b) => rank(a.c.id) - rank(b.c.id) || cmpStr(a.c.id, b.c.id));
    // otherwise: outward chain — nearest to base first, then nearest neighbour (pairMin or distance)
    const rest = items.slice().sort((a, b) => a.c.mins - b.c.mins || cmpStr(a.c.id, b.c.id)), out = [rest.shift()];
    while (rest.length) {
      const last = out[out.length - 1].c;
      const dist = x => { const pm = data.pairMin ? data.pairMin(last.id, x.c.id) : null; if (pm != null) return pm; return last.pos && x.c.pos ? hav(last.pos, x.c.pos) : 9999; };
      rest.sort((a, b) => dist(a) - dist(b) || cmpStr(a.c.id, b.c.id));
      out.push(rest.shift());
    }
    return out;
  }
  // Greedy sequencing that keeps runs of long days <= R. state = {run}
  function sequence(units, R, state, opts) {
    const out = [], left = units.slice(), viol = [];
    const sortLong = (a, b) => (b.block ? 1 : 0) - (a.block ? 1 : 0) || b.mins - a.mins || cmpStr(a.id, b.id);
    const sortShort = (a, b) => (b.items[0].c.city ? 1 : 0) - (a.items[0].c.city ? 1 : 0) || a.mins - b.mins || cmpStr(a.id, b.id);
    while (left.length) {
      const longs = left.filter(u => u.long).sort(sortLong), shorts = left.filter(u => !u.long).sort(sortShort);
      const longDays = longs.reduce((a, u) => a + u.items.length, 0);
      let pick;
      if (opts && opts.blockFirst && longs.some(u => u.block) && !out.length) pick = longs.find(u => u.block);
      else if (state.run < R && longs.length && (!shorts.length || longDays >= shorts.length * R)) pick = longs[0];
      else if (shorts.length) pick = shorts[0];
      else pick = longs[0];
      if (pick.long && state.run >= R) viol.push(pick.items[0].c.id);
      left.splice(left.indexOf(pick), 1);
      out.push(pick);
      state.run = pick.long ? (pick.block ? R : state.run + pick.items.length) : 0;
    }
    return { units: out, viol };
  }
  function schedule(data, P, o, ev) {
    const R = PACE[o.pace].run, cfg = ev.cfg, cap = ev.cap, ch = ev.sel.chosen;
    // windows ordered: given order for select+keepPassOrder or truncation; else farthest average trip first
    let order = cfg.map((x, i) => i);
    if (!(o.strategy === "select" && o.keepPassOrder) && !cap.trunc && !cap.spillArr && !cap.spillDep) {
      const avg = i => { const it = ch.filter(x => x.t === i); return it.length ? it.reduce((a, x) => a + x.c.mins, 0) / it.length : 0; };
      order.sort((a, b) => avg(b) - avg(a) || cmpStr(cfg[a].id, cfg[b].id));
      // spill/truncation layouts depend on original order; only reorder in the free case
    }
    const outItems = ch.filter(x => x.t === "out");
    const outUnits = makeUnits(outItems, o.allowOvernight);
    const O = cap.out;
    // light first day after arrival, a city/shopping day before departure
    const takeOut = pref => {
      const singles = outUnits.filter(u => !u.block);
      if (!singles.length) return null;
      singles.sort(pref);
      const u = singles[0]; outUnits.splice(outUnits.indexOf(u), 1); return u;
    };
    const lightFirst = (a, b) => (b.items[0].c.city ? 1 : 0) - (a.items[0].c.city ? 1 : 0) || a.mins - b.mins || cmpStr(a.id, b.id);
    const shopLast = (a, b) => {
      const s = u => (u.items[0].c.city ? 2 : 0) + ((P.themes[u.id] || []).includes("shop") ? 1 : 0);
      return s(b) - s(a) || a.mins - b.mins || cmpStr(a.id, b.id);
    };
    const hasStart = O >= 1 && o.arrival && !cap.spillArr && (o.pace !== "packed" || O >= 2);
    const startU = hasStart ? takeOut(lightFirst) : null;
    const endU = O - (startU ? 1 : 0) >= 1 && o.departure && !cap.spillDep ? takeOut(shopLast) : null;
    const k = order.length;
    // middle outside units: spread between windows when there are 2+ windows, else after the windows
    const mids = Array.from({ length: Math.max(1, k) }, () => []);
    const midUnits = outUnits.slice().sort((a, b) => cmpStr(a.id, b.id));
    midUnits.forEach((u, i) => { const slot = k >= 2 ? Math.min(k - 1, i % (k - 1)) : 0; mids[slot].push(u); });
    const days = [], viol = [], state = { run: 0 }, winPos = {};
    const push = (x, extra) => days.push(Object.assign({ c: x.c, t: x.t, reuse: x.reuse, flag: x.flag }, extra || {}));
    const pushUnits = (units, segRole) => units.forEach(u => {
      const items = u.block ? orderBlock(u.items, data) : u.items;
      items.forEach((x, j) => push(x, { block: u.block ? { i: j, n: items.length } : null, seg: segRole }));
    });
    if (o.arrival) days.push({ end: "arrival" });
    if (startU) { pushUnits([startU], "start"); state.run = 0; }
    // a single window that ends on departure day: outside days must come before it
    if (k === 1 && cap.spillDep && mids[0].length) {
      const r0 = sequence(mids[0], R, state, {});
      viol.push.apply(viol, r0.viol);
      pushUnits(r0.units, "out");
      mids[0] = [];
    }
    order.forEach((wi, idx) => {
      const items = ch.filter(x => x.t === wi);
      const isLastSeg = idx === k - 1 && !endU && !(mids[Math.min(k - 1, idx)] || []).length;
      const r = sequence(makeUnits(items, o.allowOvernight), R, state, { blockFirst: isLastSeg });
      viol.push.apply(viol, r.viol);
      winPos[wi] = { first: days.length };
      pushUnits(r.units, "win");
      winPos[wi].last = days.length - 1;
      const m = k >= 2 ? (idx < k - 1 ? mids[idx] : []) : mids[0];
      if (m && m.length) {
        const r2 = sequence(m, R, state, { blockFirst: !endU && idx === k - 1 });
        viol.push.apply(viol, r2.viol);
        pushUnits(r2.units, "out");
      }
    });
    if (!k && mids[0].length) {
      const r = sequence(mids[0], R, state, { blockFirst: !endU });
      viol.push.apply(viol, r.viol);
      pushUnits(r.units, "out");
    }
    if (endU) pushUnits([endU], "end");
    if (o.departure) days.push({ end: "departure" });
    // pass windows in calendar days (1-based)
    const wins = order.map(wi => {
      const p = winPos[wi], L = cap.Leff[wi];
      let start;
      if (p.last >= p.first) start = p.first + 1; else start = null;
      if (wi === 0 && cap.spillArr) start = 1;
      if (start == null) start = (p.first || 0) + 1;
      if (wi === cfg.length - 1 && cap.spillDep) start = o.days - L + 1;
      return { wi, start, end: start + L - 1 };
    });
    return { days, wins, viol };
  }

  // ------------------------------------------------------------------ assemble result
  function dayWhy(data, P, o, d, n, passOfDay, coveredBy) {
    const c = d.c, m = c.m, why = [];
    const s = c.s, note = noteOf(m, o.month);
    why.push("เดือน" + MONTH_TH[o.month] + " เหมาะ " + s + "/5" + (note ? ": " + note : ""));
    if (c.matched.length) why.push("ตรงธีมที่เลือก: " + c.matched.map(t => THEME_TH[t]).join(", "));
    else if (o.themes.length) why.push("ไม่ตรงธีมที่เลือกโดยตรง แต่คะแนนรวม (ความนิยม/ฤดูกาล/ค่าเดินทาง) ดีที่สุดในวันที่เหลือ");
    why.push("ความนิยม " + c.pop.p + "/5" + (c.pop.src === "default" ? " (ยังไม่มีข้อมูล ใช้ค่ากลาง 3)" : (((data.popularity || {})[c.id] || {}).why ? " — " + data.popularity[c.id].why : "")));
    if (c.city) why.push("วันในเมือง เดินทางสั้น (~" + c.mins + " นาที) ใช้ IC card จ่ายตามจริง ~" + yen(c.fare));
    else why.push("เดินทางเที่ยวเดียวราว " + c.mins + " นาที" + (c.long ? " (วันไกล ≥120 นาที)" : "") + " ค่าตั๋วไป-กลับ ~" + yen(c.fare));
    if (passOfDay) {
      if (coveredBy) why.push("อยู่ในช่วง " + passOfDay.name + " และพาสครอบคลุมเส้นทางนี้ ประหยัดค่าตั๋ว ~" + yen(c.fare) + ({ unverified: " (ความครอบคลุมยังไม่ยืนยัน ควรเช็ค)", derived: " (อนุมานจากธง JR ของโมดูล ควรเช็ค)", route: " (ตามรายการพาสเอกชน ค่าตั๋วจริงตามเส้นทางพาสอาจต่ำกว่า)", partial: " (ครอบคลุมเฉพาะรถไฟหลัก: " + partialWhy(data, passOfDay.id, c.id) + ")" }[coveredBy.conf] || ""));
      else {
        const pw = partialWhy(data, passOfDay.id, c.id);
        why.push("อยู่ในช่วง " + passOfDay.name + " แต่พาสไม่ครอบคลุมวันนี้" + (pw ? " (ครอบคลุมบางส่วน: " + pw + ")" : "") + " จ่ายตามจริง ~" + yen(c.fare) + (c.city ? " — วันพักในช่วงพาสตามจังหวะทริป" : ""));
      }
    } else {
      why.push(c.city || c.fare <= 3000 ? "อยู่นอกช่วงพาส: เลือกที่ใกล้/ค่ารถถูก จ่ายตามจริง ~" + yen(c.fare) : "อยู่นอกช่วงพาส: จ่ายตามจริง ~" + yen(c.fare) + " (คุ้มเพราะคะแนนสูงกว่าตัวเลือกที่ถูกกว่า)");
    }
    if (c.extra) why.push("ค่าใช้จ่ายเพิ่มที่พาส/ตั๋วไม่รวม ~" + yen(c.extra) + " (รถท้องถิ่น/ค่าเข้า ตามข้อมูลโมดูล)");
    const ev = (data.events || []).filter(e => e.city === c.id && (e.months || []).includes(o.month));
    if (ev.length) why.push("มีอีเวนต์เดือนนี้: " + ev.map(e => e.name + (e.datesTypical ? " (" + e.datesTypical + ")" : "")).join("; "));
    if (d.block) why.push("ทริปค้างคืนต่อเนื่อง วันที่ " + (n - d.block.i) + "–" + (n - d.block.i + d.block.n - 1) + ": คืนนี้" + (d.block.i === d.block.n - 1 ? "นอนนอกฐานคืนสุดท้าย แล้วกลับฐานเช้าวันถัดไป" : "นอนนอกฐาน (ฝากกระเป๋าใหญ่ไว้ที่โรงแรมฐาน)"));
    else if (m.overnight === true) why.push("โมดูลนี้แนะนำให้ค้างคืน 1 คืน (ไป-กลับวันเดียวเหนื่อยมาก)");
    if (d.seg === "start") why.push(c.city ? "วันแรกหลังลงเครื่อง: วันเบา ๆ ในเมืองใกล้ที่พัก ให้ปรับตัวจากไฟลต์กลางคืน" : "วันแรกหลังลงเครื่อง: เลือกที่เดินทางสั้นที่สุดที่เหลือ (~" + c.mins + " นาที) ให้ปรับตัวจากไฟลต์กลางคืน");
    if (d.seg === "end") why.push(c.city ? "วันก่อนกลับ: วันเบา ๆ ในเมือง เก็บของฝาก/ช้อปปิ้ง ไม่เสี่ยงตกรถไฟไกล" : "วันก่อนกลับ: ไม่มีวันในเมืองเหลือ จึงเลือกที่เดินทางสั้นที่สุดที่เหลือ (~" + c.mins + " นาที) กลับที่พักให้เร็ว");
    if (d.afterBlock) why.push("เช้าวันนี้ต้องเดินทางกลับฐานจาก " + d.afterBlock.short + " (~" + d.afterBlock.mins + " นาที) จึงเป็นวันเบา" + (c.city ? "" : " — ถ้าเหนื่อยให้ตัดเหลือครึ่งวัน"));
    if (d.rest) why.push("วันพัก/วันเบา: แทรกหลังวันเดินทางไกลติดกัน ตามจังหวะทริปแบบ" + PACE[o.pace].label);
    if (d.reuse) why.push("ใช้โมดูลในเมืองนี้ซ้ำเป็นวันเก็บตก/พักผ่อน เพราะไม่มีที่อื่นที่เหมาะพอในเดือนนี้");
    if (d.flag === "must") why.push("ผู้ใช้กำหนดให้รวมที่นี่");
    if (c.forcedWhy) why.push("หมายเหตุ: ปกติจะถูกคัดออก (" + ({ month: "คะแนนเดือนต่ำ", overnight: "ต้องค้างคืน", minutes: "เดินทางนานเกินกำหนด" })[c.forcedWhy] + ") แต่รวมไว้ตามที่ผู้ใช้กำหนด");
    const cl = (m.closures || []).filter(Boolean);
    if (cl.length) why.push("ข้อจำกัด/วันปิด: " + String(cl[0]).slice(0, 160) + (String(cl[0]).length > 160 ? "…" : ""));
    return why;
  }

  function finalize(data, P, o, ev, extraWarn, considered) {
    const MOD = data.MOD, cfg = ev.cfg, sch = schedule(data, P, o, ev);
    const N = o.days, warnings = extraWarn.slice();
    const winOfDay = {};
    sch.wins.forEach(w => { for (let n = w.start; n <= w.end; n++) winOfDay[n] = w.wi; });
    // mark rest days: a short/city day right after a run of R long days
    const R = PACE[o.pace].run;
    let run = 0;
    sch.days.forEach(d => { if (d.end) { run = 0; return; } if (d.c.long) run++; else { d.rest = run > 0 && run >= R; run = 0; } });
    // the day after an overnight block starts with the trip back to base
    sch.days.forEach((d, i) => {
      const prev = sch.days[i - 1];
      if (prev && !prev.end && prev.block && prev.block.i === prev.block.n - 1) {
        if (d.end) { if (d.end === "departure") d.afterBlockDep = true; return; }
        d.afterBlock = { short: shortT(prev.c.m), mins: prev.c.mins };
        if (!d.c.city) warnings.push("วันที่ " + (i + 1) + ": เช้าต้องกลับจาก " + shortT(prev.c.m) + " (~" + prev.c.mins + " นาที) แล้วต่อด้วย " + shortT(d.c.m) + " (~" + d.c.mins + " นาที) อาจแน่นเกินไป พิจารณาตัดเหลือครึ่งวันหรือสลับกับวันในเมือง");
      }
    });
    const days = [], perDay = [];
    let payPerRide = 0, uncovered = 0, localExtras = 0;
    const passCoverage = cfg.map(() => ({ days: [], fare: 0, conf: new Set() }));
    sch.days.forEach((d, i) => {
      const n = i + 1, wi = winOfDay[n], pw = wi != null ? cfg[wi] : null;
      let m, why, fare, extra = 0, cov = null;
      if (d.end) {
        m = MOD[d.end] || { id: d.end, kind: d.end, title: d.end === "arrival" ? "วันมาถึง" : "วันกลับ" };
        const leg = pw ? airportLeg(data, P, o, pw.id, m.id) : null;
        cov = leg ? { conf: leg.conf } : null;
        fare = leg ? leg.fare : fareOf(m);
        const single = singleLegLabel(data, m), rule = AIRPORT_RULES[data.hubId];
        why = [d.end === "arrival" ? "วันแรก: เดินทางจากสนามบินเข้าที่พัก เที่ยวเบา ๆ ใกล้ที่พัก" : "วันสุดท้าย: เดินทางไปสนามบิน เผื่อเวลาเช็คอิน"];
        if (leg) {
          why.push((leg.label ? "ใช้ " + leg.label + " (รวมในพาส " + pw.name + ")" : "ใช้รถไฟสนามบินที่รวมในพาส " + pw.name + " (ตามข้อมูลความครอบคลุมของฐานนี้)") + " ค่าตั๋วปกติ ~" + yen(leg.fare) + " นับเป็นส่วนที่พาสนี้ประหยัด");
          if (leg.note) why.push(leg.note);
          if (rule && fareOf(m) && fareOf(m) < leg.fare) why.push("หมายเหตุ: ถ้าไม่มีพาส ตั๋ว " + rule.single + " ~" + yen(fareOf(m)) + " ถูกกว่า ส่วนประหยัดจริงเทียบ " + rule.single + " จึงเป็น ~" + yen(fareOf(m)));
          if (leg.conf === "unverified" || leg.conf === "partial") why.push("ความครอบคลุมรถสนามบินมาจากข้อมูลที่ยังไม่ยืนยัน ควรเช็ค");
        } else {
          why.push("ซื้อตั๋ว " + single + " เป็นเที่ยว ~" + yen(fare) + (pw ? " — พาส " + pw.name + " ยังนับวันนี้ (ช่วงพาสยาวกว่าวันเที่ยว) แต่ไม่ครอบคลุมรถสนามบินนี้" : " (ไม่มีพาสที่ใช้ได้วันนี้)"));
        }
      } else {
        m = d.c.m; fare = d.c.fare; extra = d.c.extra;
        cov = pw ? coverOf(data, P, pw.id, m.id, o) : null;
        why = dayWhy(data, P, o, d, n, pw, cov);
      }
      if (cov) { passCoverage[wi].days.push(n); passCoverage[wi].fare += fare; passCoverage[wi].conf.add(cov.conf); }
      payPerRide += fare; if (!cov) uncovered += fare; localExtras += extra;
      days.push({
        n, mod: m.id, kind: m.kind, title: m.title || m.id, short: shortT(m), minutes: minsOf(m),
        passId: pw ? pw.id : null, covered: !!cov, fare, overnight: !!(d.block), why
      });
      perDay.push({ n, mod: m.id, fare, covered: !!cov, payPerRide: fare, withPasses: cov ? 0 : fare, extra });
    });
    const passes = sch.wins.slice().sort((a, b) => a.start - b.start).map(w => {
      const x = cfg[w.wi], pc = passCoverage[w.wi], p = data.PASSCAT.find(y => y.id === x.id) || {};
      const saving = pc.fare - x.price;
      const arith = "ราคา " + yen(x.price) + " เทียบค่าตั๋วไป-กลับที่พาสครอบคลุม " + pc.days.length + " วัน รวม " + yen(pc.fare) + " → " + (saving >= 0 ? "ประหยัด " + yen(saving) : "ขาดทุน " + yen(-saving));
      return {
        id: x.id, name: x.name, days: x.L, price: x.price, startDay: w.start, endDay: w.end, usedDays: w.end - w.start + 1,
        truncated: w.end - w.start + 1 < x.L, consecutive: !!(data.PASSWIN[x.id] || {}).c, validity: p.v || "",
        coveredDays: pc.days, coveredFare: pc.fare, saving, arithmetic: arith,
        coverageConfidence: pc.conf.has("unverified") ? "unverified" : pc.conf.has("derived") ? "derived" : pc.conf.has("route") ? "route" : pc.conf.has("partial") ? "partial" : "verified"
      };
    });
    const priceSum = passes.reduce((a, p) => a + p.price, 0);
    const withPasses = priceSum + uncovered;
    const cost = { payPerRide, withPasses, saving: payPerRide - withPasses, passPrices: priceSum, uncoveredFares: uncovered, localExtras, perDay, currency: "JPY", perPerson: true };

    // ---- warnings (honest about data quality)
    const dd = days.filter(d => d.kind !== "arrival" && d.kind !== "departure");
    dd.forEach(d => {
      const m = MOD[d.mod], s = scoreOf(m, o.month);
      if (s === 3) warnings.push("วันที่ " + d.n + " " + d.short + ": เดือน" + MONTH_TH[o.month] + " ได้แค่ 3/5" + (noteOf(m, o.month) ? " — " + noteOf(m, o.month) : ""));
      if (s === 2) warnings.push("วันที่ " + d.n + " " + d.short + ": เดือนนี้ไม่ค่อยเหมาะ (2/5) ใส่ไว้เพราะตัวเลือกที่ดีกว่าหมดแล้ว" + (noteOf(m, o.month) ? " — " + noteOf(m, o.month) : ""));
      if (s <= 1) warnings.push("วันที่ " + d.n + " " + d.short + ": เดือนนี้แทบไม่เหมาะ (" + s + "/5) แต่รวมไว้ตามที่ผู้ใช้กำหนด");
      const mo = MONTH_TH[o.month];
      (m.closures || []).filter(cl => String(cl).includes(mo)).slice(0, 1).forEach(cl => { warnings.push("วันที่ " + d.n + " " + d.short + ": มีข้อจำกัดที่เกี่ยวกับเดือน" + mo + " — " + String(cl).slice(0, 140) + (String(cl).length > 140 ? "…" : "")); });
      if (m.away) warnings.push("วันที่ " + d.n + " " + d.short + ": ข้อมูลเมืองไกลแบบย่อ (ค่าโดยสาร ~" + yen(fareOf(m)) + " และคะแนนเดือนเป็นค่าประมาณ) ควรเช็คตารางรถและราคาอีกครั้ง");
      if (!fareOf(m)) warnings.push("วันที่ " + d.n + " " + d.short + ": ไม่มีข้อมูลค่าโดยสาร คิดเป็น ¥0");
    });
    const est = dd.filter(d => RX_EST.test(((MOD[d.mod] || {}).fare || {}).note || "")).length;
    if (est) warnings.push("ค่าโดยสาร " + est + " จาก " + dd.length + " วันเป็นค่าประมาณจากฐานข้อมูล (ตั๋วไป-กลับต่อผู้ใหญ่ 1 คน) ควรเช็คกับ Jorudan/Navitime ก่อนซื้อพาส");
    passes.forEach(p => {
      if (p.coverageConfidence === "unverified") warnings.push(p.name + ": ความครอบคลุมบางวันมาจากข้อมูลที่ยังไม่ยืนยัน (cover.confidence = unverified) ควรตรวจเส้นทางกับเว็บทางการ");
      if (p.coverageConfidence === "derived") warnings.push(p.name + ": ฐานนี้ไม่มีแผนที่ความครอบคลุมของพาสนี้ ระบบอนุมานจากธง JR East/Tokyo Wide ของโมดูล (เส้นทาง JR) — รถเอกชน เช่น Tobu ไม่ครอบคลุม ควรเช็ค");
      if (p.coverageConfidence === "route") warnings.push(p.name + ": ความครอบคลุมมาจากรายการพาสรถไฟเอกชน (xpass) ส่วนค่าตั๋วเทียบใช้เส้นทางในโมดูล (มักเป็น JR/ชินคันเซ็น) เส้นทางของพาสอาจช้ากว่าและค่าตั๋วจริงต่ำกว่า ส่วนที่ประหยัดจึงอาจน้อยกว่าที่แสดง");
      if (p.coverageConfidence === "partial") warnings.push(p.name + ": บางวันพาสครอบคลุมเฉพาะช่วงรถไฟหลัก (ข้อมูล cover.partial) รถบัส/รถเอกชนช่วงท้ายต้องจ่ายเอง ส่วนที่ประหยัดจริงจะน้อยกว่าที่แสดงตามค่ารถช่วงนั้น");
      if (p.saving < 0) warnings.push(p.name + " ไม่คุ้มในแผนนี้: " + p.arithmetic + (o.strategy === "select" ? " (คงพาสไว้ตามที่ผู้ใช้เลือก)" : ""));
      if (p.truncated) warnings.push(p.name + " แบบ " + p.days + " วัน แต่ใช้ได้จริงในทริปนี้ " + p.usedDays + " วัน (ทริปจบก่อนพาสหมดอายุ)");
      if (p.consecutive) warnings.push(p.name + ": ใช้ได้ " + p.days + " วันติดต่อกัน (วันที่ " + p.startDay + "–" + p.endDay + ") ต้องเปิดใช้งานวันที่ " + p.startDay);
      const cat = data.PASSCAT.find(y => y.id === p.id) || {};
      if (/weekend|holiday|เสาร์|อาทิตย์/i.test(cat.v || "")) warnings.push(p.name + ": ใช้ได้เฉพาะบางวัน (" + cat.v + ") ระบบไม่รู้วันในสัปดาห์ของทริป ควรเช็ค");
      if (cat.cf && cat.cf !== "high") warnings.push(p.name + ": ข้อมูลพาสในแคตตาล็อกมีความมั่นใจระดับ " + cat.cf + " ควรตรวจราคา/เงื่อนไขอีกครั้ง");
    });
    // overnight block right before departure
    if (o.departure && days.length >= 2 && days[days.length - 2].overnight) warnings.push("ทริปค้างคืนจบวันก่อนวันกลับ: ต้องกลับฐานเช้าวันสุดท้ายก่อนไปสนามบิน เผื่อเวลาให้มาก");
    if (sch.viol.length) warnings.push("มีวันเดินทางไกลติดกันเกิน " + R + " วันตามจังหวะแบบ" + PACE[o.pace].label + " เพราะไม่มีวันพัก/วันใกล้ที่เหมาะพอให้แทรก (" + [...new Set(sch.viol)].map(id => shortT(MOD[id])).join(", ") + ")");
    if (ev.sel.relaxed.length) {
      if (ev.sel.relaxed.includes(3)) warnings.push("ตัวเลือกในเดือนนี้มีไม่พอ จึงใช้วันในเมืองซ้ำเป็นวันพัก/เก็บตก");
      if (ev.sel.relaxed.includes(5)) warnings.push("ตัวเลือกไม่พอ จึงมีบางวันที่พื้นที่ใกล้กับวันอื่น (อาจซ้ำซ้อนบางจุด)");
    }
    const ct = cityTarget(o), cityGot = days.filter(d => d.kind === "city").length;
    if (o.strategy === "select" && cityGot < ct) warnings.push("ช่วงพาสที่เลือกกินวันเที่ยวเกือบทั้งหมด จึงมีวันในเมือง/วันพัก " + cityGot + " วัน (จังหวะแบบ" + PACE[o.pace].label + " ปกติควรมี ~" + ct + " วัน) ถ้าอยากพักมากขึ้นให้เพิ่มจำนวนวันหรือลดพาส");
    if (o.budgetJPY != null && withPasses > o.budgetJPY) warnings.push("ค่าเดินทางประมาณ " + yen(withPasses) + " เกินงบ " + yen(o.budgetJPY) + " (แผนนี้ถูกที่สุดเท่าที่หาได้ภายใต้เงื่อนไขอื่น)");

    // ---- pass explanation for auto/none
    const passNotes = [];
    if (o.strategy === "auto") {
      if (!passes.length) passNotes.push("ไม่มีพาสที่คุ้มกับแผนนี้ (ทุกพาสที่ลองแล้วประหยัดได้ไม่ถึงราคาพาส หรือครอบคลุมน้อยกว่า 2 วัน) ใช้ IC card / ตั๋วเดี่ยวจ่ายตามจริง");
      passes.forEach(p => passNotes.push("เลือก " + p.name + " " + p.days + " วัน (วันที่ " + p.startDay + "–" + p.endDay + "): " + p.arithmetic));
      const chosenIds = passes.map(p => p.id);
      const others = {};
      (considered || []).filter(x => !chosenIds.includes(x.id)).forEach(x => { if (!others[x.id] || x.saving > others[x.id].saving) others[x.id] = x; });
      Object.values(others).sort((a, b) => b.saving - a.saving || cmpStr(a.id, b.id)).slice(0, 3).forEach(x =>
        passNotes.push("ไม่เลือก " + x.name + " " + x.L + " วัน: ถ้าใช้จะครอบคลุม " + x.covered + " วัน " + (x.saving > 0 ? "ประหยัด " + yen(x.saving) + " แต่คะแนนรวมของแผนต่ำกว่าแผนที่เลือก" : "ขาดทุน " + yen(-x.saving))));
    } else if (o.strategy === "select") passes.forEach(p => passNotes.push(p.name + " " + p.days + " วัน (วันที่ " + p.startDay + "–" + p.endDay + "): " + p.arithmetic));
    else passNotes.push("ไม่ใช้พาส: จ่ายตามจริงด้วย IC card / ตั๋วเดี่ยว");

    const scoreList = dd.map(d => scoreOf(MOD[d.mod], o.month));
    const meanScore = scoreList.length ? round(scoreList.reduce((a, b) => a + b, 0) / scoreList.length, 2) : 0;
    const nTrip = dd.filter(d => d.kind === "daytrip").length, nCity = dd.filter(d => d.kind === "city").length;
    const summary = "แผน " + N + " วัน ฐาน" + (HUB_TH[o.hub] || o.hub) + " เดือน" + MONTH_TH[o.month] + " จังหวะ" + PACE[o.pace].label + ": " +
      "เดย์ทริป " + nTrip + " วัน วันในเมือง " + nCity + " วัน" + (o.arrival ? " + วันมาถึง" : "") + (o.departure ? " + วันกลับ" : "") +
      (o.themes.length ? " · ธีม " + o.themes.map(t => THEME_TH[t]).join(", ") : "") +
      " · " + (passes.length ? "ใช้ " + passes.map(p => p.name + " (วันที่ " + p.startDay + "–" + p.endDay + ")").join(" + ") : "ไม่ใช้พาส") +
      " · ค่าเดินทางประมาณ " + yen(withPasses) + " ต่อคน (ตั๋วเดี่ยวทั้งหมด " + yen(payPerRide) + (cost.saving > 0 ? " ประหยัด " + yen(cost.saving) : cost.saving < 0 ? " แพงกว่าตั๋วเดี่ยว " + yen(-cost.saving) : "") + ")" +
      " · คะแนนเดือนเฉลี่ย " + meanScore + "/5";
    return {
      ok: true, version: VERSION, hub: o.hub, month: o.month, totalDays: N, options: publicOpts(o),
      days, passes, cost, warnings: [...new Set(warnings)], passNotes, summary,
      stats: { meanMonthScore: meanScore, minMonthScore: scoreList.length ? Math.min.apply(null, scoreList) : 0, daytrips: nTrip, cityDays: nCity, objective: round(ev.J, 3) }
    };
  }
  function publicOpts(o) {
    const x = Object.assign({}, o); delete x.free; return x;
  }

  // ------------------------------------------------------------------ main entry
  function core(opts, data, tweak) {
    if (!data || !data.MOD || !data.PASSCAT || !data.PASSWIN) return { ok: false, error: "ข้อมูลไม่ครบ ต้องมี MOD, PASSCAT, PASSWIN" };
    const nz = normalizeOpts(opts, data);
    if (nz.errs.length) return { ok: false, error: nz.errs.join(" · "), errors: nz.errs };
    const o = Object.assign(nz.o, tweak || {});
    const P = prep(data);
    const warn = nz.warn.slice();
    let { cands, rejected } = buildCandidates(data, P, o);
    const needDays = o.free;
    // relax the one-way cap if the pool is too thin for the requested days
    const usable = () => cands.filter(c => !c.city).length + Math.min(2 * cands.filter(c => c.city).length, needDays);
    if (usable() < needDays) {
      const extra = rejected.filter(r => r.why === "minutes").map(r => r.id);
      if (extra.length) {
        const o2 = Object.assign({}, o, { maxOneWayMin: 9999 });
        const b2 = buildCandidates(data, P, o2);
        cands = b2.cands; rejected = b2.rejected;
        warn.push("ตัวเลือกที่เดินทางไม่เกิน " + o.maxOneWayMin + " นาทีมีไม่พอสำหรับ " + needDays + " วัน จึงยอมให้มีวันที่ไกลกว่านั้น");
      }
    }
    if (!cands.length) return { ok: false, error: "ไม่มีสถานที่ที่เหมาะกับเดือน" + MONTH_TH[o.month] + " ภายใต้เงื่อนไขที่เลือก" };
    if (o.strategy === "select") {
      for (const s of o.passes) {
        const p = data.PASSCAT.find(x => x.id === s.id);
        const all = Object.keys(data.MOD).filter(id => !isEnd(data.MOD[id]) && coverOf(data, P, s.id, id));
        const inPool = cands.filter(c => coverOf(data, P, s.id, c.id));
        if (!all.length) return { ok: false, error: "พาส " + passName(p) + " ไม่ครอบคลุมสถานที่ใดในฐานข้อมูลของฐาน" + (HUB_TH[o.hub] || o.hub) + " จึงวางแผนกับพาสนี้ไม่ได้" };
        if (!inPool.length) {
          const why = all.map(id => { const r = rejected.find(x => x.id === id); return shortT(data.MOD[id]) + (r ? " (" + ({ month: "เดือนนี้ไม่เหมาะ", overnight: "ต้องค้างคืน", minutes: "ไกลเกินกำหนด", avoid: "ถูกตัดออก" })[r.why] + ")" : ""); });
          return { ok: false, error: "พาส " + passName(p) + " ครอบคลุมเฉพาะ " + why.join(", ") + " ซึ่งถูกคัดออกด้วยเงื่อนไขปัจจุบัน ลองเปิดให้ค้างคืน เพิ่มเวลาเดินทางสูงสุด หรือเปลี่ยนเดือน" };
        }
        if (!(p.h || []).includes(o.hub)) warn.push("พาส " + passName(p) + " ไม่ได้ถูกแนะนำสำหรับฐาน" + (HUB_TH[o.hub] || o.hub) + " ในแคตตาล็อก แต่ใช้ตามที่เลือก");
      }
      const minT = o.passes.map(s => s.days || Math.min.apply(null, data.PASSWIN[s.id].o.map(v => v[0])));
      const tot = minT.reduce((a, b) => a + b, 0), mx = Math.max.apply(null, minT);
      if (tot - mx + 1 > o.days) return { ok: false, error: "พาสที่เลือกรวมกันอย่างน้อย " + tot + " วัน วางแบบไม่ทับกันในทริป " + o.days + " วันไม่ได้ (แม้ตัดพาสใบสุดท้ายให้สั้นลง) ลองเพิ่มจำนวนวันหรือลดพาส" };
    }
    // search with the requested cost weight; tighten it if a budget cap is exceeded
    const search = pool => {
      let ypp = o.yenPerPoint, res = null, budgetNote = false;
      for (let attempt = 0; attempt < 6; attempt++) {
        const considered = [];
        const ev = o.strategy === "none" || (o.strategy === "auto" && o.maxPasses === 0) ? evalCfg(data, P, o, pool, [], ypp, true)
          : o.strategy === "select" ? searchSelect(data, P, o, pool, ypp) : searchAuto(data, P, o, pool, ypp, considered);
        if (!ev) break;
        res = { ev, considered, budgetNote };
        if (o.budgetJPY == null || ev.sel.cost + ev.endUnc <= o.budgetJPY) break;
        ypp = ypp / 2; budgetNote = true; res.budgetNote = true;
      }
      return res;
    };
    let best = search(cands);
    // not enough distinct places within the one-way cap: widen it step by step before giving up
    for (const cap of [o.maxOneWayMin + 60, 9999]) {
      if (!best || best.ev.sel.complete || !rejected.some(r => r.why === "minutes")) break;
      const b2 = buildCandidates(data, P, Object.assign({}, o, { maxOneWayMin: cap }));
      const r2 = search(b2.cands);
      if (r2) { best = r2; cands = b2.cands; rejected = b2.rejected; warn.push("ที่เที่ยวที่เดินทางไม่เกิน " + o.maxOneWayMin + " นาทีมีไม่พอ (ไม่ซ้ำพื้นที่) สำหรับ " + o.free + " วัน จึงขยายเป็น" + (cap > 2000 ? "ไม่จำกัดเวลา" : "ไม่เกิน " + cap + " นาที")); }
    }
    if (best && best.budgetNote) warn.push("ปรับแผนให้ประหยัดขึ้นเพื่อให้อยู่ในงบค่าเดินทาง " + yen(o.budgetJPY));
    if (!best) return { ok: false, error: "จัดวางพาสให้อยู่ในทริปไม่ได้ (ช่วงพาสยาวเกินจำนวนวัน)" };
    if (!best.ev.sel.complete) return { ok: false, error: "สถานที่ที่เข้าเงื่อนไขมีไม่พอสำหรับ " + o.free + " วันเที่ยว ลองลดจำนวนวัน เพิ่มเวลาเดินทางสูงสุด หรือลดรายการ avoid" };
    return finalize(data, P, o, best.ev, warn, best.considered);
  }


  function generate(opts, data) {
    const main = core(opts, data);
    if (!main.ok) return main;
    const alt = (label, tweak) => {
      const r = core(opts, data, tweak);
      if (!r.ok) return { label, ok: false, error: r.error };
      const same = r.days.map(d => d.mod).join(",") === main.days.map(d => d.mod).join(",") && r.passes.map(p => p.id + p.startDay).join() === main.passes.map(p => p.id + p.startDay).join();
      return {
        label, ok: true, sameAsMain: same, days: r.days.map(d => d.mod),
        passes: r.passes.map(p => ({ id: p.id, name: p.name, days: p.days, startDay: p.startDay, endDay: p.endDay, price: p.price, saving: p.saving })),
        cost: { payPerRide: r.cost.payPerRide, withPasses: r.cost.withPasses, saving: r.cost.saving },
        meanMonthScore: r.stats.meanMonthScore, summary: r.summary
      };
    };
    const ypp = main.options.yenPerPoint;
    main.alternatives = [
      alt("ประหยัดกว่า (เน้นค่าเดินทางถูก)", { yenPerPoint: ypp / 4 }),
      alt("ยอดนิยมที่สุด (เน้นที่เที่ยวดัง)", { popExp: 2.5, yenPerPoint: ypp * 3 })
    ];
    return main;
  }

  // ------------------------------------------------------------------ adapters
  // XPASS (data/xpass.json) uses its own ids; map the ones that exist in PASSCAT.
  const XPASS_ALIAS = { "tobu-nikko-pass-all-area": "nikko-pass-all-area", "tobu-nikko-pass-world-heritage": "nikko-pass-world-heritage-area" };
  const XPASS_SKIP = ["jr-pass-7day", "jr-east-pass", "jr-tokyo-wide-pass", "tokyo-metro-24h", "toei-one-day", "keisei-skyliner-tst", "tokyo-free-kippu", "metro-toei-common-1day", "hokuriku-arch-pass"];
  function xpassCoverOf(xpass, passcat) {
    const out = {}, ids = new Set((passcat || []).map(p => p.id));
    (xpass || []).forEach(x => {
      if (!x || XPASS_SKIP.includes(x.id) || x.conf === "low") return;
      const id = XPASS_ALIAS[x.id] || x.id;
      if (!ids.has(id)) return;
      out[id] = [...new Set((out[id] || []).concat(x.cover || []))];
    });
    return out;
  }
  function planFreqOf(plans, starters) {
    const f = {};
    (plans || []).forEach(p => (p.days || []).forEach(d => { if (d && d.mod) f[d.mod] = (f[d.mod] || 0) + 1; }));
    (starters || []).forEach(s => (s.days || []).forEach(o => (o || []).forEach(id => { f[id] = (f[id] || 0) + 1; })));
    return f;
  }
  function makePairMin(pairs) {
    if (!pairs) return null;
    return (a, b) => (pairs[a + "|" + b] != null ? pairs[a + "|" + b] : pairs[b + "|" + a] != null ? pairs[b + "|" + a] : null);
  }
  /**
   * Build engine data from the JSON files.
   *  hubId, hubJson (parsed data/hub_<id>.json), modules (parsed data/modules.json; Tokyo only),
   *  passcat (array), passwin (object), xpass (array, optional), popularity (optional),
   *  pairs (object "a|b": minutes, optional), northOrder (array, optional), plans (data/plans.json, optional),
   *  events (data/events.json, Tokyo only; hub events are always included)
   */
  function fromHubFiles(a) {
    const hub = (a.hubJson && (a.hubJson.hub || a.hubJson)) || {};
    let mods;
    if (a.hubId === "tokyo") {
      mods = (a.modules || []).concat(hub.mods || []).map(m => {
        const ex = (hub.monthsExtra || {})[m.id];
        return ex ? Object.assign({}, m, { months: Object.assign({}, m.months, ex) }) : m;
      });
    } else mods = hub.mods || [];
    const MOD = {};
    mods.forEach(m => { if (m && m.id && !MOD[m.id]) MOD[m.id] = m; });
    const pos = {};
    Object.keys(hub.pos || {}).forEach(id => { const p = parseGps(hub.pos[id]); if (p) pos[id] = p; });
    mods.forEach(m => { if (m.away && !pos[m.id] && hub.away && hub.away[m.away]) pos[m.id] = parseGps(hub.away[m.away]); });
    return {
      hubId: a.hubId, MOD, PASSCAT: a.passcat || [], PASSWIN: a.passwin || {}, cover: hub.cover || {}, pos,
      popularity: a.popularity || {}, xpassCover: xpassCoverOf(a.xpass, a.passcat),
      events: (a.hubId === "tokyo" ? (a.events || []) : []).concat(hub.events || []).filter(e => e && MOD[e.city]),
      pairMin: makePairMin(a.pairs), northOrder: a.hubId === "tokyo" ? (a.northOrder || []) : [],
      planFreq: planFreqOf((hub.plans || []).concat(a.hubId === "tokyo" ? (a.plans || []) : []), hub.starters)
    };
  }
  /**
   * Build engine data inside index.html from its globals (call after MOD/PASSCAT/PASSWIN exist):
   *   PlanEngine.fromPageGlobals({ MOD, PASSCAT, PASSWIN, XPASS, HUBDATA, HB, pairMin, NORTH_ORDER, EVENTS, POPULARITY, PLANS })
   */
  function fromPageGlobals(g) {
    const hubId = (g.HB && g.HB.id) || g.hubId, hub = (g.HUBDATA || {})[hubId] || {};
    const pos = {};
    Object.keys(hub.pos || {}).forEach(id => { const p = parseGps(hub.pos[id]); if (p) pos[id] = p; });
    Object.keys(g.MOD || {}).forEach(id => { const m = g.MOD[id]; if (m && m.away && !pos[id] && hub.away && hub.away[m.away]) pos[id] = parseGps(hub.away[m.away]); });
    const MOD = {};
    Object.keys(g.MOD || {}).forEach(id => { if (id.indexOf("+") < 0) MOD[id] = g.MOD[id]; });   // skip runtime combos "a+b"
    return {
      hubId, MOD, PASSCAT: g.PASSCAT || [], PASSWIN: g.PASSWIN || {}, cover: hub.cover || {}, pos,
      popularity: g.POPULARITY || {}, xpassCover: xpassCoverOf(g.XPASS, g.PASSCAT),
      events: (Array.isArray(g.EVENTS) ? g.EVENTS : (hub.events || [])).filter(e => e && MOD[e.city]),
      pairMin: typeof g.pairMin === "function" ? g.pairMin : null, northOrder: hubId === "tokyo" ? (g.NORTH_ORDER || []) : [],
      planFreq: planFreqOf((hub.plans || []).concat(hubId === "tokyo" && Array.isArray(g.PLANS) ? g.PLANS : []), hub.starters)
    };
  }

  // ------------------------------------------------------------------ text rendering
  function formatPlanText(plan) {
    if (!plan || !plan.ok) return "สร้างแผนไม่ได้: " + (plan && plan.error);
    const L = [];
    L.push(plan.summary);
    L.push("");
    plan.days.forEach(d => {
      L.push("วันที่ " + d.n + ": " + d.title + (d.passId ? "  [" + (plan.passes.find(p => p.id === d.passId) || {}).name + (d.covered ? " ✓" : " –") + "]" : ""));
      d.why.forEach(w => L.push("    · " + w));
    });
    L.push("");
    L.push("พาส:");
    if (!plan.passes.length) L.push("    · ไม่ใช้พาส");
    plan.passes.forEach(p => L.push("    · " + p.name + " " + p.days + " วัน " + yen(p.price) + " ใช้วันที่ " + p.startDay + "–" + p.endDay + " ครอบคลุมวันที่ " + (p.coveredDays.join(", ") || "-") + " → " + p.arithmetic));
    plan.passNotes.forEach(n => L.push("    › " + n));
    const c = plan.cost;
    L.push("ค่าเดินทาง (ต่อผู้ใหญ่ 1 คน): ตั๋วเดี่ยวทั้งหมด " + yen(c.payPerRide) + " · ใช้พาส " + yen(c.withPasses) + " (ราคาพาส " + yen(c.passPrices) + " + ตั๋วนอกพาส " + yen(c.uncoveredFares) + ") · ส่วนต่าง " + yen(c.saving) + " · ค่ารถท้องถิ่น/ค่าเข้าที่ไม่รวม ~" + yen(c.localExtras));
    if (plan.warnings.length) { L.push("ข้อควรระวัง:"); plan.warnings.forEach(w => L.push("    ! " + w)); }
    if (plan.alternatives) plan.alternatives.forEach(a => L.push("ทางเลือก " + a.label + ": " + (a.ok ? (a.sameAsMain ? "เหมือนแผนหลัก" : a.days.join(" → ") + " · " + yen(a.cost.withPasses)) : a.error)));
    return L.join("\n");
  }

  return { VERSION, MONTHS, THEMES, THEME_TH, PACE, generate, listPassOptions, fromHubFiles, fromPageGlobals, formatPlanText, _internal: { capacities, inferThemes, coverOf, prep } };
});
