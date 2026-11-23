// Monthly hotel price refresh -> data/hotel_prices.json (needs SERPAPI_KEY; SerpApi "google_hotels" engine, free plan = 250 searches/month).
// Shape: { asOf, hubs: { tokyo: { "2027-01": { low, p25, median, n, checkIn } } } }  (THB per room per night, 2 adults, 1 night, mid-month weekday)
// Response field names (properties[].rate_per_night.extracted_lowest) follow SerpApi docs and are UNVERIFIED until the first real run: the script logs diag counts.
import fs from "node:fs";
const KEY = process.env.SERPAPI_KEY; if (!KEY) { console.log("no SERPAPI_KEY; nothing to do"); process.exit(0); }
const FILE = "data/hotel_prices.json", today = new Date(), iso = d => d.toISOString().slice(0, 10);
const FORCE = process.env.FORCE === "1";
if (!FORCE && today.getUTCDate() !== 1) { console.log("hotel refresh runs on the 1st of the month only (set FORCE=1 to override)"); process.exit(0); }
const AREA = { tokyo: "Ueno Tokyo", osaka: "Namba Osaka", sendai: "Sendai Station", nagoya: "Nagoya Station", fukuoka: "Hakata Station Fukuoka", sapporo: "Sapporo Station" };
const MAX_CALLS = 100, sleep = ms => new Promise(r => setTimeout(r, ms));
let calls = 0; const diag = { calls: 0, withProps: 0, noPrice: 0, errors: 0 };
const midMonthWeekday = ym => { const [y, m] = ym.split("-").map(Number); let d = new Date(Date.UTC(y, m - 1, 14)); while ([0, 5, 6].includes(d.getUTCDay())) d = new Date(d.getTime() + 86400000); return d; }; // Mon-Thu night
const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1 + i, 1)).toISOString().slice(0, 7));
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
async function one(area, ym) {
  const ci = midMonthWeekday(ym), co = new Date(ci.getTime() + 86400000);
  const u = new URL("https://serpapi.com/search.json");
  Object.entries({ engine: "google_hotels", q: area + " hotels", check_in_date: iso(ci), check_out_date: iso(co), adults: "2", currency: "THB", gl: "th", hl: "en", api_key: KEY }).forEach(([k, v]) => u.searchParams.set(k, v));
  diag.calls++; const r = await fetch(u); if (!r.ok) { diag.errors++; throw new Error("HTTP " + r.status); }
  const j = await r.json(); if (j.error) { diag.errors++; throw new Error(String(j.error).slice(0, 100)); }
  const props = j.properties || []; if (props.length) diag.withProps++;
  const prices = props.map(p => (p.rate_per_night && p.rate_per_night.extracted_lowest) || null).filter(v => typeof v === "number" && v >= 500 && v <= 200000).sort((a, b) => a - b);
  if (prices.length < 4) { diag.noPrice++; return null; }
  return { low: prices[0], p25: pct(prices, .25), median: pct(prices, .5), n: prices.length, checkIn: iso(ci) };
}
let out = { asOf: iso(today), hubs: {} }; try { out = JSON.parse(fs.readFileSync(FILE, "utf8")); out.asOf = iso(today); out.hubs = out.hubs || {}; } catch (e) { }
for (const [hub, area] of Object.entries(AREA)) {
  for (const ym of months) {
    if (calls >= MAX_CALLS) break; calls++;
    try { const r = await one(area, ym); if (r) (out.hubs[hub] = out.hubs[hub] || {})[ym] = r; } catch (e) { console.warn(hub, ym, String(e.message || e)); }
    await sleep(600);
  }
}
if (!diag.withProps) { console.error("no hotel results at all; keeping file unchanged", JSON.stringify(diag)); process.exit(0); }
fs.writeFileSync(FILE, JSON.stringify(out)); console.log("hotel prices updated", JSON.stringify(diag));
