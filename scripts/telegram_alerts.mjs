// Telegram flight-price alerts.
//  --poll-only : only read new bot messages (subscribe / stop / list) and answer them (runs every ~30 min)
//  default     : poll + check prices in data/px_months.json against every saved rule and send alerts (runs daily after the price refresh)
// Needs env TELEGRAM_BOT_TOKEN and SA (Firebase service-account JSON; needs Firestore access: role "Cloud Datastore User"). Subscribers are stored in Firestore (private),
// never in this public repository. Rule = { hub, thr (THB), m ("any" or "YYYY-MM"), d (0 = any flight, 1 = non-stop only), last: { p, t } }.
import fs from "node:fs";
import crypto from "node:crypto";
const TOKEN = process.env.TELEGRAM_BOT_TOKEN, SA = JSON.parse(process.env.SA || "{}"), POLL_ONLY = process.argv.includes("--poll-only");
if (!TOKEN) { console.log("no TELEGRAM_BOT_TOKEN; nothing to do"); process.exit(0); }
if (!SA.private_key) { console.log("no service account; nothing to do"); process.exit(0); }
const HUBS = { tokyo: "Tokyo", osaka: "Osaka (Namba)", nagoya: "Nagoya", fukuoka: "Fukuoka (Hakata)", sapporo: "Sapporo", sendai: "Sendai" };
const AIR = { XJ: "Thai AirAsia X", FD: "Thai AirAsia", VJ: "VietJet Air", VZ: "Thai VietJet", NX: "Air Macau", ZG: "ZIPAIR Tokyo", SL: "Thai Lion Air", TG: "Thai Airways", VN: "Vietnam Airlines", HO: "Juneyao Air", MU: "China Eastern", CA: "Air China", CZ: "China Southern", HX: "Hong Kong Airlines", "5J": "Cebu Pacific", UO: "HK Express", MH: "Malaysia Airlines", NH: "ANA", JL: "Japan Airlines", BR: "EVA Air" };
const TH_M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."], EN_M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PROJECT = SA.project_id || "nihontabi-63523", FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
// ---- Google auth (service account JWT)
const b64 = o => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url"), now = Math.floor(Date.now() / 1000);
const hdr = b64({ alg: "RS256", typ: "JWT" }), cl = b64({ iss: SA.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3000 });
const sig = crypto.createSign("RSA-SHA256").update(hdr + "." + cl).sign(SA.private_key, "base64url");
const tr = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: hdr + "." + cl + "." + sig }) })).json();
if (!tr.access_token) { console.log("google token error", JSON.stringify(tr).slice(0, 200)); process.exit(0); }
// ---- Firestore value conversion
const toV = v => v === null || v === undefined ? { nullValue: null } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : Array.isArray(v) ? { arrayValue: { values: v.map(toV) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toV(x)])) } };
const fromV = v => "stringValue" in v ? v.stringValue : "integerValue" in v ? +v.integerValue : "doubleValue" in v ? v.doubleValue : "booleanValue" in v ? v.booleanValue : "nullValue" in v ? null : "arrayValue" in v ? (v.arrayValue.values || []).map(fromV) : "mapValue" in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromV(x)])) : null;
const fsReq = async (method, path, body) => { const r = await fetch(FS + path, { method, headers: { Authorization: "Bearer " + tr.access_token, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) { } return { ok: r.ok, status: r.status, j }; };
const getDoc = async p => { const r = await fsReq("GET", "/" + p); if (r.status === 404) return null; if (!r.ok) throw new Error("firestore " + r.status + " " + JSON.stringify(r.j).slice(0, 160)); return Object.fromEntries(Object.entries(r.j.fields || {}).map(([k, v]) => [k, fromV(v)])); };
const setDoc = async (p, o) => { const r = await fsReq("PATCH", "/" + p, { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toV(v)])) }); if (!r.ok) throw new Error("firestore write " + r.status); };
const delDoc = p => fsReq("DELETE", "/" + p);
const listDocs = async col => { let out = [], pt = ""; do { const r = await fsReq("GET", `/${col}?pageSize=300${pt ? "&pageToken=" + pt : ""}`); if (!r.ok) throw new Error("firestore list " + r.status); (r.j.documents || []).forEach(d => out.push({ id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromV(v)])) })); pt = r.j.nextPageToken || ""; } while (pt); return out; };
// ---- Telegram
const tg = async (m, p) => (await fetch(`https://api.telegram.org/bot${TOKEN}/${m}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) })).json();
const say = (chat, text) => tg("sendMessage", { chat_id: chat, text, disable_web_page_preview: true });
const thb = n => "฿" + Math.round(n).toLocaleString("en-US");
const mfmt = (ym, en) => { const t = ym.split("-"); return (en ? EN_M : TH_M)[+t[1] - 1] + " " + t[0]; };
const dfmt = (d, en) => { const t = d.split("-"); return +t[2] + " " + (en ? EN_M : TH_M)[+t[1] - 1]; };
const ruleText = (r, en) => `${HUBS[r.hub] || r.hub} · ≤ ${thb(r.thr)} · ${r.m === "any" ? (en ? "any month" : "ทุกเดือน") : mfmt(r.m, en)} · ${r.d ? (en ? "non-stop only" : "บินตรงเท่านั้น") : (en ? "non-stop or 1 stop" : "บินตรง/ต่อเครื่อง 1 จุด")}`;
// ---- 1. read new messages
let meta = (await getDoc("tg_meta/state")) || { offset: 0 }, handled = 0;
const upd = await tg("getUpdates", { offset: meta.offset || 0, timeout: 0, allowed_updates: ["message"] });
for (const u of upd.result || []) {
  meta.offset = u.update_id + 1; const m = u.message; if (!m || !m.text || !m.chat) continue; const chat = String(m.chat.id), text = m.text.trim(); handled++;
  let sub = (await getDoc("tg_subs/" + chat)) || { rules: [], lang: "th" };
  const start = text.match(/^\/start(?:@\w+)?\s+(\S+)/);
  if (start) { const p = start[1].split("_"); // hub_thr_month_direct_lang   e.g. tokyo_12000_2027-01_0_th
    const rule = { hub: p[0], thr: +p[1], m: p[2] || "any", d: p[3] === "1" ? 1 : 0, last: null }; sub.lang = p[4] === "en" ? "en" : "th"; const en = sub.lang === "en";
    if (!HUBS[rule.hub] || !(rule.thr >= 3000 && rule.thr <= 150000) || !(rule.m === "any" || /^\d{4}-\d{2}$/.test(rule.m))) { await say(chat, en ? "Sorry, I could not read that alert. Please set it up again on the Prices page." : "ขออภัย อ่านเงื่อนไขไม่ได้ กรุณาตั้งใหม่จากหน้า ราคา บนเว็บ"); }
    else { sub.rules = (sub.rules || []).filter(r => !(r.hub === rule.hub && r.m === rule.m && r.d === rule.d)); sub.rules.push(rule); sub.rules = sub.rules.slice(-5); sub.createdAt = sub.createdAt || new Date().toISOString(); await setDoc("tg_subs/" + chat, sub);
      await say(chat, en ? `Alert saved ✅\n${ruleText(rule, true)}\nI will message you when a fare at or below your limit appears (checked daily).\n/list to see your alerts · /stop to cancel all` : `ตั้งแจ้งเตือนแล้ว ✅\n${ruleText(rule, false)}\nเมื่อพบตั๋วราคาไม่เกินที่ตั้งไว้ ผมจะส่งข้อความหา (ตรวจทุกวัน)\n/list ดูรายการ · /stop ยกเลิกทั้งหมด`); } }
  else if (/^\/stop/.test(text)) { await delDoc("tg_subs/" + chat); await say(chat, sub.lang === "en" ? "All alerts cancelled." : "ยกเลิกการแจ้งเตือนทั้งหมดแล้ว"); }
  else if (/^\/list/.test(text)) { const en = sub.lang === "en"; await say(chat, (sub.rules || []).length ? (en ? "Your alerts:\n" : "การแจ้งเตือนของคุณ:\n") + sub.rules.map((r, i) => `${i + 1}. ${ruleText(r, en)}`).join("\n") : (en ? "No alerts yet. Set one on the Prices page." : "ยังไม่มีการแจ้งเตือน ตั้งได้ที่หน้า ราคา บนเว็บ")); }
  else if (/^\/(start|help)/.test(text)) { await say(chat, "Nihontabi flight alerts ✈️\nตั้งเงื่อนไขที่หน้า “ราคา” บนเว็บ nihontabi.web.app แล้วกดปุ่ม Telegram / Set your alert on the Prices page of nihontabi.web.app, then tap the Telegram button.\n/list · /stop"); }
}
if (upd.result && upd.result.length) await setDoc("tg_meta/state", meta);
console.log("messages handled", handled);
if (POLL_ONLY) process.exit(0);
// ---- 2. price check for every rule
const pm = JSON.parse(fs.readFileSync("data/px_months.json", "utf8")), subs = await listDocs("tg_subs"); let sent = 0;
for (const sub of subs) {
  const en = sub.lang === "en"; let changed = false;
  for (const r of sub.rules || []) {
    const months = pm.hubs && pm.hubs[r.hub]; if (!months) continue; let best = null;
    for (const [ym, v] of Object.entries(months)) { if (!/^\d{4}-\d{2}$/.test(ym) || (r.m !== "any" && r.m !== ym)) continue;
      for (const [kind, arr] of [["nonstop", v.nonstop], ["one", r.d ? [] : v.one]]) for (const x of arr || []) if (!best || x.p < best.x.p) best = { x, kind, ym }; }
    if (!best || best.x.p > r.thr) continue;
    const lastP = r.last && r.last.p, lastT = r.last && r.last.t ? Date.parse(r.last.t) : 0, fresh = !lastP || best.x.p <= lastP * 0.97 || Date.now() - lastT > 7 * 86400000;
    if (!fresh) continue;
    const x = best.x, nights = x.r ? Math.round((Date.parse(x.r) - Date.parse(x.d)) / 86400000) : null;
    const txt = (en ? "✈️ Fare below your limit!\n" : "✈️ ตั๋วถูกกว่าที่ตั้งไว้!\n") + `BKK → ${HUBS[r.hub]}\n${thb(x.p)} · ${best.kind === "nonstop" ? (en ? "non-stop" : "บินตรง") : (en ? "1 stop" : "ต่อเครื่อง 1 จุด")} · ${AIR[x.a] || x.a || ""}\n${dfmt(x.d, en)}${x.r ? " – " + dfmt(x.r, en) : ""} ${x.d.slice(0, 4)}${nights ? ` (${nights} ${en ? "nights" : "คืน"})` : ""}\n${en ? "Your limit" : "เกณฑ์ของคุณ"}: ≤ ${thb(r.thr)}\n` + (x.u ? `🔗 https://www.aviasales.com${x.u}\n` : "") + `\n${en ? "More dates" : "ดูช่วงวันอื่น"}: https://nihontabi.web.app/?hub=${r.hub}\n${en ? "Stop alerts" : "หยุดแจ้งเตือน"}: /stop`;
    const res = await say(sub.id, txt); if (res.ok) { r.last = { p: x.p, t: new Date().toISOString() }; changed = true; sent++; } else if (res.error_code === 403) { await delDoc("tg_subs/" + sub.id); changed = false; break; }
  }
  if (changed) { const { id, ...doc } = sub; await setDoc("tg_subs/" + sub.id, doc); }
}
console.log("subscribers", subs.length, "alerts sent", sent);
