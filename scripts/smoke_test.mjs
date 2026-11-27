// Smoke test for Nihontabi. Run from the repo root:  node scripts/smoke_test.mjs [--quick] [--hub=tokyo]
//  1. static checks: every data file parses, every photo / dish atlas / map image that the data points at exists on disk
//  2. browser walk (headless Chrome via puppeteer-core): each hub, every tab, a plan with all its sub-tabs, "use as my trip" with its sub-tabs,
//     plus English mode on one hub. Fails on any uncaught page error or any same-origin request that returns >= 400.
// Needs puppeteer-core (npm i puppeteer-core --no-save) and Chrome: set CHROME_PATH, or the usual install locations are tried.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUICK = process.argv.includes("--quick");
const ONLY = (process.argv.find(a => a.startsWith("--hub=")) || "").slice(6);
const HUBS = ["tokyo", "osaka", "nagoya", "sendai", "fukuoka", "sapporo"].filter(h => !ONLY || h === ONLY);
const fails = [];
const fail = (where, msg) => { fails.push(`${where}: ${msg}`); console.log("  FAIL", where, "-", msg); };
const exists = p => fs.existsSync(path.join(ROOT, p));

// ---------- 1. static checks ----------
console.log("== static checks");
const readJson = f => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch (e) { fail(f, "does not parse: " + e.message); return null; } };
for (const f of fs.readdirSync(path.join(ROOT, "data")).filter(f => f.endsWith(".json"))) readJson("data/" + f);
const dishes = readJson("data/dishes.json");
if (dishes) {
  const atlases = new Set(Object.values(dishes.d).map(d => d.at[0]));
  for (const n of atlases) if (!exists(`img/dishatlas${n}.webp`)) fail("dishes", `missing img/dishatlas${n}.webp`);
  for (const [k, d] of Object.entries(dishes.d)) if (!d.at || d.at.length < 3) fail("dishes", `${k} has no atlas cell`);
  for (const r of dishes.r) { try { new RegExp(r.re, "i"); } catch (e) { fail("dishes", `rule ${r.k} has a bad regex`); } if (!dishes.d[r.k]) fail("dishes", `rule ${r.k} points at a missing dish`); }
}
let photoRefs = 0;
for (const h of HUBS) {
  const H = readJson(`data/hub_${h}.json`); if (!H) continue;
  for (const [name, v] of Object.entries(H.photos || {})) {
    if (!v || !v.f) continue; photoRefs++;
    const m = /^at(\d+):(\d+)$/.exec(v.f);
    const file = m ? `img/p/${m[1]}_${m[2]}.webp` : v.f;
    if (!/^img\//.test(file)) continue;
    if (!exists(file)) fail(`hub_${h}`, `photo of "${name.slice(0, 40)}" -> ${file} is missing`);
  }
}
console.log(`  checked ${photoRefs} photo references`);

// ---------- 2. browser walk ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".xml": "application/xml", ".txt": "text/plain", ".css": "text/css", ".ico": "image/x-icon" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  if (process.env.SMOKE_BREAK && new RegExp(process.env.SMOKE_BREAK).test(p)) { res.writeHead(404); res.end("simulated"); return; } // self-test hook: pretend matching files are missing
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let puppeteer;
for (const base of [ROOT + "/", process.cwd() + "/", process.env.PUPPETEER_BASE ? process.env.PUPPETEER_BASE + "/" : "", (process.env.TEMP || "/tmp").replace(/\\/g, "/") + "/pt/"].filter(Boolean)) {
  try { puppeteer = createRequire(base)("puppeteer-core"); break; } catch (e) { /* try next */ }
}
const chrome = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(p => p && fs.existsSync(p));
if (!puppeteer || !chrome) { console.log("== browser walk skipped (puppeteer-core or Chrome not found)"); fail("setup", "browser walk could not run: install puppeteer-core and set CHROME_PATH"); server.close(); finish(); }

const sl = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", protocolTimeout: 240000, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"], defaultViewport: { width: 430, height: 900, isMobile: true } });

async function walk(hub, lang) {
  const tag = `${hub}/${lang}`; console.log("== browser", tag);
  const pg = await browser.newPage(); const errs = []; const bad = new Set();
  pg.on("pageerror", e => errs.push(String(e).slice(0, 160)));
  pg.on("response", r => { try { const u = new URL(r.url()); if (u.origin === BASE && r.status() >= 400 && !/favicon/.test(u.pathname)) bad.add(`${r.status()} ${u.pathname}`); } catch (e) { /* ignore */ } });
  await pg.evaluateOnNewDocument(l => { try { localStorage.setItem("jp:lang", l); } catch (e) { /* ignore */ } }, lang);
  await pg.goto(`${BASE}/?hub=${hub}`, { waitUntil: "domcontentloaded", timeout: 90000 }); await sl(4500);
  const click = (sel, i = 0) => pg.evaluate((s, i) => { const e = document.querySelectorAll(s)[i]; if (e) { e.click(); return true; } return false; }, sel, i);
  const act = (a, id) => pg.evaluate((a, id) => { const x = document.createElement("button"); x.dataset.act = a; if (id) x.dataset.id = id; document.body.appendChild(x); x.click(); x.remove(); }, a, id);
  for (const t of ["pick", "trip", "lib", "season", "px", "info"]) { if (!await click(`.tab[data-tab="${t}"]`)) fail(tag, `tab ${t} not found`); await sl(1200); }
  await click('.tab[data-tab="pick"]'); await sl(600);
  if (!await click('[data-act="open"]')) fail(tag, "no plan card to open"); await sl(2200);
  const nTabs = await pg.evaluate(() => document.querySelectorAll(".ptabs button").length);
  if (nTabs !== 4) fail(tag, `plan page has ${nTabs} sub-tabs, expected 4`);
  for (const k of ["money", "prep", "stay", "days"]) { await click(`[data-act="ptab"][data-v="${k}"]`); await sl(700); }
  if (!QUICK) {
    await click('[data-act="useplan"]'); await sl(2000);
    const nT = await pg.evaluate(() => document.querySelectorAll(".ptabs button").length);
    if (nT !== 3) fail(tag, `trip page has ${nT} sub-tabs, expected 3`);
    for (const k of ["money", "prep", "days"]) { await click(`[data-act="ttab"][data-v="${k}"]`); await sl(700); }
    await click('.tab[data-tab="lib"]'); await sl(1200);
    const ids = await pg.evaluate(() => { try { const J = JSON.parse(document.querySelector(".rmv").dataset.j); return J.pts.filter(p => p.c !== "away").slice(0, 4).map(p => p.id); } catch (e) { return []; } });
    for (const id of ids) { await act("pcity", id); await sl(500); await act("sel", id); await sl(300); }
    await act("apgo"); await sl(3500);
    if (!await pg.evaluate(() => document.querySelectorAll(".ptabs button").length)) fail(tag, "auto plan did not render the plan page");
  }
  errs.forEach(e => fail(tag, "page error: " + e)); bad.forEach(b => fail(tag, "request failed: " + b));
  if (!errs.length && !bad.size) console.log("  ok");
  await pg.close();
}
try {
  for (const h of HUBS) await walk(h, "th");
  await walk(HUBS[0], "en");
} catch (e) { fail("browser", String(e).slice(0, 200)); }
await browser.close(); server.close();
finish();

function finish() {
  console.log(fails.length ? `\n${fails.length} problem(s):\n- ` + fails.join("\n- ") : "\nAll smoke checks passed");
  process.exit(fails.length ? 1 : 0);
}
