// Group poll ("ชวนเพื่อนโหวต"): create a poll from plans/places, share a link, friends sign in with Google and vote.
// Data: polls/{id} (immutable, owner only) and polls/{id}/votes/{uid} (each voter writes own doc). Rules in firestore.rules.
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MINE = "jp:polls", VOTED = "jp:voted", MAXOPT = 8;
const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
const rid = () => { const a = new Uint8Array(10); crypto.getRandomValues(a); return Array.from(a, x => (x % 36).toString(36)).join(""); };
const BTN = "border:0;border-radius:10px;padding:9px 14px;font:600 14px system-ui;cursor:pointer;";
const INP = "width:100%;box-sizing:border-box;padding:9px 10px;border-radius:10px;border:1px solid #445;background:#12151c;color:#fff;font:15px system-ui;";

export function modal(html) {
  const o = document.createElement("div"); o.style.cssText = "position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.65);display:grid;place-items:center;padding:12px";
  const c = document.createElement("div"); c.style.cssText = "background:#1f2430;color:#fff;border-radius:16px;max-width:580px;width:100%;max-height:90vh;overflow:auto;padding:18px;font:15px/1.5 system-ui,sans-serif";
  c.innerHTML = html; o.appendChild(c); o.addEventListener("click", e => { if (e.target === o) o.remove(); }); document.body.appendChild(o);
  return { o, c, close: () => o.remove() };
}

// Pure renderer (also used by tests): poll = {title, options:[{id,l,s}]}, votes = {uid:{n,picks}}
export function renderPoll(c, poll, votes, myUid, onSave) {
  const mine = new Set(((votes[myUid] || {}).picks) || []);
  const count = {}, who = {};
  Object.entries(votes).forEach(([u, v]) => (v.picks || []).forEach(id => { count[id] = (count[id] || 0) + 1; (who[id] = who[id] || []).push(v.n || "เพื่อน"); }));
  const total = Object.keys(votes).length, max = Math.max(1, ...Object.values(count));
  c.innerHTML = `<h3 style="margin:0 0 4px">${esc(poll.title)}</h3><p style="margin:0 0 12px;color:#9aa3b5;font-size:13px">โหวตได้หลายข้อ · ${total} คนโหวตแล้ว · ทุกคนในลิงก์เห็นชื่อและผลโหวต</p>`
    + poll.options.map(o => `<label style="display:block;margin:8px 0;padding:10px;border:1px solid #334;border-radius:12px;cursor:pointer"><div style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" data-id="${esc(o.id)}" ${mine.has(o.id) ? "checked" : ""} style="margin-top:4px;width:18px;height:18px"><div style="flex:1"><b>${esc(o.l)}</b>${o.s ? `<div style="color:#9aa3b5;font-size:13px">${esc(String(o.s).slice(0, 110))}</div>` : ""}<div style="margin-top:6px;height:6px;border-radius:4px;background:#2a3040"><div style="height:6px;border-radius:4px;background:#ff7a6b;width:${Math.round(((count[o.id] || 0) / max) * 100)}%"></div></div><div style="font-size:12.5px;color:#c8d0e2;margin-top:3px">${count[o.id] || 0} โหวต${who[o.id] ? " · " + esc(who[o.id].slice(0, 8).join(", ")) : ""}</div></div></div></label>`).join("")
    + `<div style="display:flex;gap:8px;margin-top:12px"><button id="pvSave" style="${BTN}background:#e8ecf4;color:#111">บันทึกโหวต</button><button id="pvX" style="${BTN}background:none;color:#fff;border:1px solid #556">ปิด</button></div><p id="pvMsg" style="color:#9aa3b5;font-size:13px;margin:8px 0 0"></p>`;
  c.querySelector("#pvSave").onclick = () => onSave(Array.from(c.querySelectorAll("input[type=checkbox]:checked"), x => x.dataset.id));
  c.querySelector("#pvX").onclick = () => c.closest("div[style*=fixed]").remove();
}

export function init(ctx) {
  const { auth, db, host, loginBtn, fns } = ctx, { doc, getDoc, setDoc, deleteDoc, collection, onSnapshot, GoogleAuthProvider, signInWithPopup } = fns;
  const needLogin = async () => { if (auth.currentUser) return true; try { await signInWithPopup(auth, new GoogleAuthProvider()); return true; } catch (e) { return false; } };
  const first = u => String((u.displayName || u.email || "เพื่อน").split(" ")[0]).slice(0, 40);

  async function openCreate() {
    if (!(await needLogin())) return;
    const data = window.__ntData && window.__ntData(); if (!data) { alert("ข้อมูลยังโหลดไม่เสร็จ ลองอีกครั้งในอีกสักครู่"); return; }
    const m = modal(`<h3 style="margin:0 0 8px">ชวนเพื่อนโหวต</h3><p style="margin:0 0 10px;color:#9aa3b5;font-size:13px">เลือกแพลนหรือที่เที่ยวสูงสุด ${MAXOPT} อย่างจากฐาน ${esc(data.hubName)} แล้วส่งลิงก์ให้เพื่อนโหวต (เพื่อนต้องเข้าสู่ระบบด้วย Google)</p>
      <input id="pT" maxlength="80" style="${INP}" value="ไปเที่ยว${esc(data.hubName)}แบบไหนดี"><input id="pQ" placeholder="ค้นหา เช่น ซากุระ, Ghibli, 5 วัน" style="${INP}margin-top:8px"><div id="pR" style="margin:8px 0"></div><div id="pS" style="margin:8px 0"></div>
      <div style="display:flex;gap:8px"><button id="pGo" style="${BTN}background:#e8ecf4;color:#111" disabled>สร้างลิงก์</button><button id="pX" style="${BTN}background:none;color:#fff;border:1px solid #556">ปิด</button></div><div id="pMsg" style="margin-top:10px"></div><div id="pMine" style="margin-top:10px;font-size:13px;color:#9aa3b5"></div>`);
    const c = m.c, sel = [], q = c.querySelector("#pQ"), R = c.querySelector("#pR"), S = c.querySelector("#pS"), go = c.querySelector("#pGo");
    const draw = () => {
      const t = q.value.trim().toLowerCase(), list = (t ? data.items.filter(i => (i.l + " " + i.s).toLowerCase().includes(t)) : data.items.slice(0, 20)).filter(i => !sel.find(x => x.id === i.id)).slice(0, 25);
      R.innerHTML = list.map(i => `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #2a3040"><button data-add="${esc(i.id)}" style="${BTN}padding:4px 10px;background:#2a3040;color:#fff">+</button><div style="flex:1;font-size:14px">${esc(i.l)}<span style="color:#9aa3b5;font-size:12px"> ${i.k === "plan" ? "แพลน" : "ที่เที่ยว"}</span></div></div>`).join("") || '<p style="color:#9aa3b5">ไม่พบ</p>';
      S.innerHTML = sel.map(i => `<span style="display:inline-block;margin:3px 4px 3px 0;padding:4px 10px;border-radius:99px;background:#2a3040;font-size:13px">${esc(i.l.slice(0, 40))} <a href="#" data-rm="${esc(i.id)}" style="color:#ff7a6b;text-decoration:none">✕</a></span>`).join("");
      go.disabled = sel.length < 2;
    };
    q.oninput = draw; draw();
    c.addEventListener("click", e => { const a = e.target.dataset && e.target.dataset.add, r = e.target.dataset && e.target.dataset.rm; if (a && sel.length < MAXOPT) { sel.push(data.items.find(i => i.id === a)); draw(); } if (r) { e.preventDefault(); const k = sel.findIndex(i => i.id === r); if (k >= 0) sel.splice(k, 1); draw(); } });
    c.querySelector("#pX").onclick = m.close;
    const mine = ls.get(MINE); if (mine.length) c.querySelector("#pMine").innerHTML = "โพลของฉัน: " + mine.slice(-5).reverse().map(p => `<a href="/?poll=${esc(p.id)}" style="color:#9cc4ff">${esc(p.t || p.id)}</a>`).join(" · ");
    go.onclick = async () => {
      go.disabled = true; const id = rid(), title = (c.querySelector("#pT").value || "โหวตทริป").trim().slice(0, 80);
      try {
        await setDoc(doc(db, "polls", id), { owner: auth.currentUser.uid, title, hub: data.hub, month: data.month || "", options: sel.map(i => ({ id: i.id, k: i.k, l: String(i.l).slice(0, 140), s: String(i.s || "").slice(0, 100) })), createdAt: Date.now() });
        const p = ls.get(MINE); p.push({ id, t: title }); ls.set(MINE, p.slice(-20)); if (window.__ntDraw) window.__ntDraw();
        const url = location.origin + "/?poll=" + id;
        c.querySelector("#pMsg").innerHTML = `<p style="margin:0 0 6px"><b>สร้างโพลแล้ว</b> ส่งลิงก์นี้ให้เพื่อน:</p><input readonly value="${esc(url)}" style="${INP}" id="pU"><div style="display:flex;gap:8px;margin-top:8px"><button id="pC" style="${BTN}background:#e8ecf4;color:#111">คัดลอกลิงก์</button>${navigator.share ? `<button id="pSh" style="${BTN}background:#2a3040;color:#fff">แชร์</button>` : ""}<button id="pOpen" style="${BTN}background:none;color:#fff;border:1px solid #556">เปิดโพล</button></div>`;
        c.querySelector("#pC").onclick = async () => { try { await navigator.clipboard.writeText(url); c.querySelector("#pC").textContent = "คัดลอกแล้ว ✓"; } catch (e) { c.querySelector("#pU").select(); } };
        const sh = c.querySelector("#pSh"); if (sh) sh.onclick = () => navigator.share({ title, url }).catch(() => { });
        c.querySelector("#pOpen").onclick = () => { m.close(); openPoll(id); };
      } catch (e) { go.disabled = false; c.querySelector("#pMsg").innerHTML = `<span style="color:#ff7a6b">สร้างไม่สำเร็จ (${esc(e.code || e.message)})</span>`; }
    };
  }

  let unsub = null;
  async function openPoll(id) {
    const m = modal('<p>กำลังโหลดโพล…</p>'); const c = m.c;
    if (!auth.currentUser) {
      c.innerHTML = '<h3 style="margin:0 0 8px">โพลโหวตทริป</h3><p>เข้าสู่ระบบด้วย Google เพื่อดูและโหวต</p><button id="pLg" style="' + BTN + 'background:#e8ecf4;color:#111">เข้าสู่ระบบด้วย Google</button>';
      c.querySelector("#pLg").onclick = async () => { if (await needLogin()) { m.close(); openPoll(id); } }; return;
    }
    try {
      const snap = await getDoc(doc(db, "polls", id)); if (!snap.exists()) { c.innerHTML = "<p>ไม่พบโพลนี้ (ลิงก์อาจผิดหรือถูกลบแล้ว)</p>"; return; }
      const poll = snap.data(), uid = auth.currentUser.uid; let votes = {}; try { const T = JSON.parse(localStorage.getItem("jp:pollt") || "{}"); T[id] = String(poll.title || "").slice(0, 80); localStorage.setItem("jp:pollt", JSON.stringify(T)); } catch (e) { }
      const saveVote = async picks => { const msg = c.querySelector("#pvMsg"); try { await setDoc(doc(db, "polls", id, "votes", uid), { n: first(auth.currentUser), picks: picks.slice(0, 12), t: Date.now() }); const v = ls.get(VOTED); if (!v.includes(id)) { v.push(id); ls.set(VOTED, v.slice(-50)); if (window.__ntDraw) window.__ntDraw(); } if (msg) msg.textContent = "บันทึกโหวตแล้ว ✓"; } catch (e) { if (msg) msg.textContent = "บันทึกไม่สำเร็จ (" + (e.code || e.message) + ")"; } };
      if (unsub) unsub();
      unsub = onSnapshot(collection(db, "polls", id, "votes"), s => { votes = {}; s.forEach(d => { votes[d.id] = d.data(); }); const keep = c.querySelector("#pvMsg") ? c.querySelector("#pvMsg").textContent : ""; renderPoll(c, poll, votes, uid, saveVote); const mm = c.querySelector("#pvMsg"); if (mm) mm.textContent = keep; const x = c.querySelector("#pvX"); if (x) x.onclick = () => { if (unsub) unsub(); m.close(); }; }, e => { c.innerHTML = "<p>อ่านผลโหวตไม่สำเร็จ (" + esc(e.code || e.message) + ")</p>"; });
    } catch (e) { c.innerHTML = "<p>เปิดโพลไม่สำเร็จ (" + esc(e.code || e.message) + ")</p>"; }
  }

  document.addEventListener("click", e => { const el = e.target.closest && e.target.closest("[data-ntpoll]"); if (!el) return; e.preventDefault(); if (el.dataset.ntpoll === "create") openCreate(); else if (el.dataset.ntpoll === "open") openPoll(el.dataset.id); });
  const pid = new URLSearchParams(location.search).get("poll");
  if (pid && /^[a-z0-9]{8,24}$/.test(pid)) (auth.authStateReady ? auth.authStateReady() : Promise.resolve()).then(() => setTimeout(() => openPoll(pid), 400));
  window.__ntPoll = { openCreate, openPoll, renderPoll, modal };
  // used by "delete my data": remove polls I created and my votes in polls this browser knows about
  window.__ntPollCleanup = async uid => { for (const p of ls.get(MINE)) { try { await deleteDoc(doc(db, "polls", p.id)); } catch (e) { } } for (const id of ls.get(VOTED)) { try { await deleteDoc(doc(db, "polls", id, "votes", uid)); } catch (e) { } } ls.set(MINE, []); ls.set(VOTED, []); };
}
