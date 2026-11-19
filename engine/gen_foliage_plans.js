"use strict";
// usage: node engine/gen_plans_v3.js <hub>   -> data/gen_plans_<hub>.json
const fs = require("fs"), path = require("path");
const PE = require("./plan_engine.js");
const hub = process.argv[2];
const ROOT = path.resolve(__dirname, ".."), DATA = path.join(ROOT, "data");
const readJ = f => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const PASSCAT = JSON.parse(html.match(/<script[^>]*id="passcat"[^>]*>([\s\S]*?)<\/script>/)[1]);
const PASSWIN = JSON.parse(html.match(/const PASSWIN = (\{.*?\});\r?\n/)[1]);
const PAIRS = JSON.parse(html.match(/const PAIRS = (\{[\s\S]*?\});/)[1]);
const NORTH_ORDER = JSON.parse(html.match(/const NORTH_ORDER = (\[[^\]]*\]);/)[1]);
const popularity = Object.assign({}, readJ("popularity.json"), fs.existsSync(path.join(DATA, "popularity_v3.json")) ? readJ("popularity_v3.json") : {});
const hubJson = readJ("hub_" + hub + ".json");
const data = PE.fromHubFiles({ hubId: hub, hubJson, modules: readJ("modules.json"), passcat: PASSCAT, passwin: PASSWIN, xpass: readJ("xpass.json"), popularity, pairs: PAIRS, northOrder: NORTH_ORDER, plans: readJ("plans.json"), events: readJ("events.json") });
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MN = { jan: "ม.ค.", feb: "ก.พ.", mar: "มี.ค.", apr: "เม.ย.", may: "พ.ค.", jun: "มิ.ย.", jul: "ก.ค.", aug: "ส.ค.", sep: "ก.ย.", oct: "ต.ค.", nov: "พ.ย.", dec: "ธ.ค." };
const TH = { sakura: "ซากุระ", foliage: "ใบไม้เปลี่ยนสี", shop: "ช้อปปิ้ง", food: "สายกิน", nature: "ธรรมชาติ", onsen: "ออนเซ็น", snow: "หิมะ & ฤดูหนาว", photo: "ถ่ายรูป/วิวสวย", festival: "เทศกาล/อีเวนต์", culture: "ประวัติศาสตร์/วัฒนธรรม", night: "ไนต์ไลฟ์/ซาเก", anime: "อนิเมะ/ป๊อปคัลเจอร์", park: "สวนสนุก", chill: "ชิลๆ เดินน้อย" };
const LENS = [3, 4, 5, 6, 7, 8, 9, 10];
const THEME_SETS = (mo) => {
  const sets = [[], ["food"], ["culture"], ["nature"], ["onsen"], ["shop"], ["photo"], ["night"], ["chill"], ["festival"], ["park"], ["anime"]];
  if (["dec", "jan", "feb", "mar"].includes(mo)) sets.push(["snow"]);
  if (["mar", "apr", "may"].includes(mo)) sets.push(["sakura"]);
  return sets;
};
const isEnd = id => id === "arrival" || id === "departure" || /arrival$|departure$/.test(id);
const existing = hubJson.hub.plans.map(p => ({ ids: new Set(p.days.map(d => d.mod).filter(x => x && !isEnd(x))), months: new Set(p.months || MONTHS), n: p.days.length }));
const cands = [];
const sim = (A, B) => { let i = 0; A.forEach(x => { if (B.has(x)) i++; }); return i / (A.size + B.size - i); };
const TAGS = {}; hubJson.hub.mods.forEach(m => { if (m.momijiMonths && m.momijiMonths.length) TAGS[m.id] = m.momijiMonths; });
const tagMonths = id => new Set(TAGS[id] || []);
const TIDS = Object.keys(TAGS);
const SLENS = [4, 5, 6, 7, 8, 10, 12];
for (const mo of ["sep", "oct", "nov", "dec"]) for (const n of SLENS) for (const th of [["foliage"], []]) {
  const must = TIDS.filter(id => tagMonths(id).has(mo));
  if (!must.length) continue;
  for (const take of [Math.min(must.length, Math.max(1, n - 2)), Math.min(must.length, Math.max(1, Math.floor((n - 2) / 2)))]) {
    let r; try { r = PE.generate({ hub, month: mo, days: n, themes: th, mustInclude: must.slice(0, take), passStrategy: "auto", maxPasses: 2, pace: "normal", maxOneWayMin: 150, allowOvernight: true }, data); } catch (e) { continue; }
    if (!r || !r.ok) continue;
    const ids = r.days.map(d => d.mod).filter(x => !isEnd(x));
    const nt = ids.filter(i => TAGS[i]).length; if (!nt) continue;
    cands.push({ mo, n, th, r, ids: new Set(ids), nt, score: nt * 10 + (r.stats.meanMonthScore || 3) * 2 + Math.min(10, (r.cost.saving || 0) / 5000) });
  }
}
const picked = [];
for (const mo of ["sep", "oct", "nov", "dec"]) for (const n of SLENS) {
  const L = cands.filter(c => c.mo === mo && c.n === n).sort((a, b) => b.score - a.score); let got = 0;
  for (const c of L) {
    const dup = picked.find(p => sim(p.ids, c.ids) >= 0.8 && p.n === c.n); if (dup) { if (!dup.months.includes(mo)) dup.months.push(mo); continue; }
    picked.push({ n, ids: c.ids, months: [mo], th: c.th, r: c.r, nt: c.nt }); if (++got >= 2) break;
  }
}
const MOD = data.MOD, refBase = hubJson.hub.plans.find(p => p.base && p.base.length);
const y = v => "¥" + Math.round(v).toLocaleString();
const out = picked.map((p, i) => {
  const r = p.r, mn = p.months.length > 3 ? "หลายเดือน" : p.months.map(m => MN[m]).join("/");
  const days = r.days.map(d => { const o = { n: d.n, optional: false, mod: d.mod }; 
    o.passUsed = d.passId ? ((r.passes.find(x => x.id === d.passId) || {}).name || "Pass") + (d.covered ? " (ใช้คุ้ม)" : " (อยู่ในช่วงพาส)") : "ไม่ใช้พาส: ตั๋วเดี่ยว / IC card"; if ((d.why || []).length) o.season = d.why.join(" · "); return o; });
  const places = r.days.filter(d => d.kind !== "arrival" && d.kind !== "departure" && d.kind !== "city").slice(0, 3).map(d => (d.short || d.title || "").split(/[:：(（]/)[0].trim()).filter(Boolean);
  const themeTxt = p.th.length ? p.th.map(t => TH[t]).join(" + ") : "เที่ยวครบรส";
  const cnt = {}; r.days.forEach(d => ((MOD[d.mod] || {}).themes || []).forEach(t => { cnt[t] = (cnt[t] || 0) + 1; }));
  const themes = (p.th.length ? p.th : Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])).filter(t => TH[t]).slice(0, 4); if (!themes.length) themes.push("culture");
  return { id: hub + "-mj-" + String(i + 1).padStart(2, "0"), foliage: true, mode: hub, hub, gen: true, title: `${themeTxt} ${r.totalDays} วัน (${mn}): ${places.join(" · ")}${r.passes.length ? " · " + r.passes.map(x => x.name).join(" + ") : ""}`, tagline: r.summary || "",
    who: `แผนที่ระบบจัดให้สำหรับเดือน ${mn} จากที่เที่ยวที่เหมาะกับเดือนนั้นและช่วงวันที่ใช้ Pass ให้คุ้ม ปรับจำนวนวันและเงื่อนไขเองได้ที่หน้า “เมือง” (จัดแพลนอัตโนมัติ)`,
    base: refBase ? refBase.base : [], passes: r.passes.map(x => ({ name: x.name + " " + x.days + " วัน", days: "D" + x.startDay + "–D" + x.endDay, adult: x.price, child: 0, note: (x.arithmetic || "") + " · ประหยัดราว " + y(x.saving) })).concat([{ name: "Suica / PASMO / ICOCA", days: "ทุกวัน", adult: 0, child: 0, note: "ใช้กับรถไฟ/รถเมล์ส่วนที่นอกพาส" }]),
    xpass: r.passes.map(x => x.id), transportBudget: { adultJPY: Math.round(r.cost.withPasses), note: `ตั๋วเดี่ยวทั้งหมด ${y(r.cost.payPerRide)} → ใช้พาสแล้ว ${y(r.cost.withPasses)} (ประหยัด ${y(r.cost.saving)}) ค่าเดินทางต่อวันเป็นค่าประมาณจากข้อมูลโมดูล (ควรเช็คอีกครั้ง)` },
    bestSeason: `${mn}: คะแนนเดือนเฉลี่ย ${(r.stats.meanMonthScore || 0).toFixed(2)}/5`, warnings: (r.warnings || []).slice(0, 6), sources: [], themes, months: p.months, nDays: r.totalDays, days };
});
fs.writeFileSync(path.join(DATA, "gen_foliageplans_" + hub + ".json"), JSON.stringify(out));
console.log(hub, "foliage candidates", cands.length, "selected", out.length);
