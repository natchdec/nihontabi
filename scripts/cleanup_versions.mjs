// Delete old Firebase Hosting versions (keeps the live version + the newest KEEP). Needs env SA = service-account JSON.
import crypto from "node:crypto";
const KEEP = 2, SITES = ["nihontabi", "nihontabi-63523"], B = "https://firebasehosting.googleapis.com/v1beta1/";
const sa = JSON.parse(process.env.SA || "{}"); if (!sa.private_key) { console.log("no SA, skip"); process.exit(0); }
const b64 = o => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url"), now = Math.floor(Date.now() / 1000);
const hdr = b64({ alg: "RS256", typ: "JWT" }), cl = b64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3000 });
const sig = crypto.createSign("RSA-SHA256").update(hdr + "." + cl).sign(sa.private_key, "base64url");
const tr = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: hdr + "." + cl + "." + sig }) })).json();
if (!tr.access_token) { console.log("token error", JSON.stringify(tr).slice(0, 200)); process.exit(0); }
const api = async (m, u) => { const r = await fetch(u, { method: m, headers: { Authorization: "Bearer " + tr.access_token } }); const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) { } return { ok: r.ok, status: r.status, j }; };
for (const site of SITES) {
  let vs = [], pt = "";
  do { const r = await api("GET", `${B}sites/${site}/versions?pageSize=100${pt ? "&pageToken=" + pt : ""}`); if (!r.ok) { console.log(site, "list failed", r.status); vs = null; break; } vs = vs.concat(r.j.versions || []); pt = r.j.nextPageToken || ""; } while (pt);
  if (!vs) continue;
  const rel = await api("GET", `${B}sites/${site}/channels/live/releases?pageSize=3`); const live = (rel.j.releases || [])[0]?.version?.name;
  vs.sort((a, b) => (b.createTime || "").localeCompare(a.createTime || ""));
  const keep = new Set(vs.slice(0, KEEP).map(v => v.name)); if (live) keep.add(live);
  let d = 0, f = 0; for (const v of vs) { if (keep.has(v.name) || v.status === "DELETED") continue; const r = await api("DELETE", B + v.name); r.ok ? d++ : f++; }
  console.log(site, "versions", vs.length, "deleted", d, "failed", f);
}
