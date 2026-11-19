// Daily price refresh -> data/px_summary.json (same shape the page already reads).
// providers: "travelpayouts" (needs TRAVELPAYOUTS_TOKEN; endpoint shape UNVERIFIED until first real run) | "mock" (pipeline test only)
import fs from "node:fs";
const FILE = "data/px_summary.json";
const provider = process.env.PROVIDER || "travelpayouts";
const HUBS = { tokyo: "TYO", osaka: "OSA", nagoya: "NGO", fukuoka: "FUK", sapporo: "SPK", sendai: "SDJ" };
const MONTHS_AHEAD = 12, MIN_THB = 3000, MAX_THB = 150000;
const prev = JSON.parse(fs.readFileSync(FILE, "utf8"));
const today = new Date(); const iso = d => d.toISOString().slice(0, 10);
const months = Array.from({ length: MONTHS_AHEAD }, (_, i) => { const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1 + i, 1)); return d.toISOString().slice(0, 7); }); // from next month, rolling
const sleep = ms => new Promise(r => setTimeout(r, ms));

const diag = {};
async function query(code, ym, direct, market) {
  const u = new URL("https://api.travelpayouts.com/aviasales/v3/prices_for_dates");
  const q = { origin: "BKK", destination: code, departure_at: ym, one_way: "false", currency: "thb", sorting: "price", limit: "30", token: process.env.TRAVELPAYOUTS_TOKEN };
  if (direct) q.direct = "true"; if (market) q.market = market;
  Object.entries(q).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { "Accept-Encoding": "gzip" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json(); const rows = (j.data || []).filter(x => typeof x.price === "number" && x.price >= MIN_THB && x.price <= MAX_THB && x.departure_at);
  const k = `${code}${direct ? "-direct" : ""}${market ? "-" + market : ""}`; (diag[k] = diag[k] || { calls: 0, rows: 0, success: j.success }).calls++; diag[k].rows += rows.length; if (j.error) diag[k].error = String(j.error).slice(0, 120);
  if (!rows.length) return null;
  const best = rows.reduce((a, b) => (b.price < a.price ? b : a));
  return { dep: String(best.departure_at).slice(0, 10), thb: Math.round(best.price) };
}
async function fromTravelpayouts(code, ym) {
  let any = await query(code, ym, false); await sleep(400);
  if (!any && code === "SDJ") { any = await query(code, ym, false, "th"); await sleep(400); }
  if (!any) return null;
  const dir = await query(code, ym, true); await sleep(400);
  const out = { dep: any.dep, thb: any.thb };
  if (dir) out.directThb = dir.thb;
  return out;
}
function fromMock(code, ym) { let h = 0; for (const c of code + ym) h = (h * 31 + c.charCodeAt(0)) % 9973; return { dep: ym + "-15", thb: 12000 + (h % 9000) }; }

const out = { ...prev }; delete out.mock; let okHubs = 0;
if (provider === "mock") out.mock = true;
if (provider === "travelpayouts" && !process.env.TRAVELPAYOUTS_TOKEN) { console.log("no token; nothing to do"); process.exit(0); }
for (const [hub, code] of Object.entries(HUBS)) {
  const flights = [];
  for (const ym of months) {
    try { const r = provider === "mock" ? fromMock(code, ym) : await fromTravelpayouts(code, ym); if (r) flights.push(r); } catch (e) { console.warn(hub, ym, String(e.message || e)); }
  }
  if (flights.length >= 3) { out[hub] = { ...(prev[hub] || {}), asOf: iso(today), flights, hotel: { ...(prev[hub]?.hotel || { low: null, median: null, n: 0 }), asOf: prev[hub]?.hotel?.asOf || prev[hub]?.asOf }, source: provider }; okHubs++; }
  else console.warn(`${hub}: only ${flights.length} months, keeping previous data`);
}
// Sendai has no cached BKK->SDJ fares: show Tokyo fares (fly to Tokyo, then Shinkansen) and say so on the page.
if (provider !== "mock" && out.tokyo && out.tokyo.asOf === iso(today) && (!out.sendai || out.sendai.asOf !== iso(today))) {
  out.sendai = { ...(out.sendai || {}), asOf: iso(today), flights: out.tokyo.flights, via: "tokyo", hotel: out.sendai?.hotel || { low: null, median: null, n: 0 }, source: provider };
  okHubs++; console.log("sendai: using Tokyo fares (via TYO)");
}
if (!okHubs) { console.error("no hub updated; keeping file unchanged"); process.exit(provider === "mock" ? 1 : 0); }
fs.writeFileSync(FILE, JSON.stringify(out, null, 1));
if (provider !== "mock") { // price history: per hub, per departure month, [date, cheapest THB]; one point per day, last 120 days
  const HF = "data/px_history.json"; let h = {}; try { h = JSON.parse(fs.readFileSync(HF, "utf8")); } catch (e) { }
  for (const [hub, v] of Object.entries(out)) { if (!v || v.asOf !== iso(today)) continue; h[hub] = h[hub] || {};
    for (const f of v.flights || []) { const k = String(f.dep).slice(0, 7), a = (h[hub][k] = h[hub][k] || []); const m = a.find(x => x[0] === v.asOf); if (m) m[1] = Math.min(m[1], f.thb); else a.push([v.asOf, f.thb]); if (a.length > 120) a.splice(0, a.length - 120); } }
  fs.writeFileSync(HF, JSON.stringify(h));
}
console.log(`updated ${okHubs}/${Object.keys(HUBS).length} hubs via ${provider}`);
if (provider !== "mock") console.log("diag", JSON.stringify(diag));
