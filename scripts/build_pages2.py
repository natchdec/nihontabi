# Extra generated pages: month guides, theme guides, pass guides.  Executed by build_pages.py (shares its globals).
import json, re, os, shutil, html

PASSCAT = json.loads(re.search(r'<script type="application/json" id="passcat">(.*?)</script>', open("index.html", encoding="utf8").read(), re.S).group(1))
ALL = []
for hub, (th, en, base) in HUBS.items():
    H = json.load(open(f"data/hub_{hub}.json", encoding="utf8"))["hub"]
    mods_all = list(H["mods"])
    if hub == "tokyo":
        me0 = H.get("monthsExtra") or {}
        have = {m["id"] for m in mods_all}
        for cm in json.load(open("data/modules.json", encoding="utf8")):
            if cm["id"] not in have:
                cm["months"] = {**(cm.get("months") or {}), **(me0.get(cm["id"]) or {})}
                mods_all.append(cm)
    for m in mods_all:
        if m.get("kind") in ("arrival", "departure") or not re.fullmatch(r"[a-z0-9][a-z0-9\-_]*", str(m.get("id", ""))):
            continue
        title = m.get("title", "")
        fh = m.get("fromHub") or m.get("fromUeno") or {}
        ALL.append({"hub": hub, "th": th, "id": m["id"], "short": title.split(":")[0].strip() if ":" in title else title,
                    "mn": fh.get("minutes"), "months": m.get("months") or {}, "themes": m.get("themes") or [], "pitch": first_sent(m.get("pitch"), 140)})
MKEYS = [k for k, _ in MON]


def sc(m, k):
    return (m["months"].get(k) or {}).get("score", 0)


def link(m):
    return f'<a href="/guide/{m["hub"]}/{m["id"]}.html">{E(m["short"])}</a>'


for d in ("month", "theme", "pass"):
    shutil.rmtree(f"guide/{d}", ignore_errors=True)
    os.makedirs(f"guide/{d}", exist_ok=True)
extra_llm = []

FULL = {"jan": "มกราคม", "feb": "กุมภาพันธ์", "mar": "มีนาคม", "apr": "เมษายน", "may": "พฤษภาคม", "jun": "มิถุนายน", "jul": "กรกฎาคม", "aug": "สิงหาคม", "sep": "กันยายน", "oct": "ตุลาคม", "nov": "พฤศจิกายน", "dec": "ธันวาคม"}
# ---- month pages
for k, lab0 in MON:
    lab = FULL[k]
    sec = ""
    cnt = 0
    for hub, (th, en, base) in HUBS.items():
        L = [m for m in ALL if m["hub"] == hub and sc(m, k) >= 5]
        if len(L) < 3:
            L = [m for m in ALL if m["hub"] == hub and sc(m, k) >= 4]
        L = sorted(L, key=lambda m: (m["mn"] or 999))[:10]
        if not L:
            continue
        cnt += len(L)
        sec += f'<h2>จาก{E(th)} ({E(base)})</h2><ul class=l>' + "".join(
            f'<li>{link(m)}' + (f' <span class="m">({m["mn"]} นาที)</span>' if m["mn"] else "") + f'<br><span class="m">{E(first_sent((m["months"].get(k) or {}).get("note", ""), 170))}</span></li>' for m in L) + "</ul>"
    body = f'<p class="m"><a href="/">Nihontabi</a> › <a href="/guide/">คู่มือ</a></p><h1>เที่ยวญี่ปุ่นเดือน{lab} ไปที่ไหนดี</h1><p>ที่เที่ยวที่คะแนนสูงสุดในเดือน{lab} แบ่งตามเมืองฐาน (คะแนน 4–5 จาก 5 จากข้อมูลฤดูกาลของแต่ละที่) เรียงจากใกล้เมืองฐานก่อน</p><p><a class="cta" href="/">เปิดแอปวางแผน (เลือกเดือน{lab}) →</a></p>{sec}'
    ld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": f"เที่ยวญี่ปุ่นเดือน{lab}", "inLanguage": "th", "url": f"{SITE}/guide/month/{k}.html"}
    open(f"guide/month/{k}.html", "w", encoding="utf8").write(page(f"เที่ยวญี่ปุ่นเดือน{lab} ไปที่ไหนดี: {cnt} ที่เที่ยวแนะนำ | Nihontabi", f"รวมที่เที่ยวญี่ปุ่นที่เหมาะกับเดือน{lab} แยกตามเมืองฐาน Tokyo, Osaka, Sendai, Nagoya, Fukuoka, Sapporo", f"{SITE}/guide/month/{k}.html", body, ld))
    urls.append(f"{SITE}/guide/month/{k}.html")
extra_llm.append(f"- [Month guides]({SITE}/guide/month/jan.html): best places by month (jan..dec)")

# ---- theme pages
tlinks = []
for t, tl in TH.items():
    L = [m for m in ALL if t in m["themes"]]
    if len(L) < 3:
        continue
    sec = ""
    for hub, (th, en, base) in HUBS.items():
        H2 = sorted([m for m in L if m["hub"] == hub], key=lambda m: -max([sc(m, k) for k in MKEYS] or [0]))[:12]
        if not H2:
            continue
        sec += f'<h2>จาก{E(th)}</h2><ul class=l>' + "".join(
            f'<li>{link(m)}' + (f' <span class="m">({m["mn"]} นาที)</span>' if m["mn"] else "") + f'<br><span class="m">เหมาะ: {", ".join(lab for k, lab in MON if sc(m, k) >= 4) or "ตลอดปี"}</span></li>' for m in H2) + "</ul>"
    body = f'<p class="m"><a href="/">Nihontabi</a> › <a href="/guide/">คู่มือ</a></p><h1>ที่เที่ยวญี่ปุ่นสาย{E(tl)}</h1><p>รวมที่เที่ยวธีม{E(tl)} {len(L)} แห่ง จัดตามเมืองฐาน พร้อมเดือนที่เหมาะ</p><p><a class="cta" href="/">เปิดแอปวางแผน →</a></p>{sec}'
    ld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": f"ที่เที่ยวญี่ปุ่นสาย{tl}", "inLanguage": "th", "url": f"{SITE}/guide/theme/{t}.html"}
    open(f"guide/theme/{t}.html", "w", encoding="utf8").write(page(f"ที่เที่ยวญี่ปุ่นสาย{tl}: {len(L)} แห่ง แยกตามเมืองฐาน | Nihontabi", f"รวมที่เที่ยวญี่ปุ่นธีม{tl} พร้อมเดือนที่เหมาะและวิธีเดินทางจาก 6 เมืองฐาน", f"{SITE}/guide/theme/{t}.html", body, ld))
    urls.append(f"{SITE}/guide/theme/{t}.html")
    tlinks.append((t, tl, len(L)))
extra_llm.append(f"- [Theme guides]({SITE}/guide/theme/food.html): places by theme (food, onsen, snow, sakura, anime, ...)")

# ---- pass pages
HUBNAME = {h: v[0] for h, v in HUBS.items()}
plinks = []
for p in PASSCAT:
    if p.get("st") != "active" or not re.fullmatch(r"[a-zA-Z0-9_\-]+", str(p.get("id", ""))):
        continue
    name = p.get("n", p["id"])
    hubs = [HUBNAME[h] for h in (p.get("h") or []) if h in HUBNAME]
    rows = "".join(f'<tr><td>{E(x[0])}</td><td>¥{x[1]:,}</td><td>' + (f'¥{x[2]:,}' if len(x) > 2 and isinstance(x[2], (int, float)) else "") + "</td></tr>" for x in (p.get("p") or []) if isinstance(x, list) and len(x) >= 2 and isinstance(x[1], (int, float)))
    src = "".join(f'<li><a href="{E(u)}" rel="nofollow noopener">{E(u)}</a></li>' for u in (p.get("src") or []) if str(u).startswith("http"))
    faq = []
    if rows:
        faq.append((f"{name} ราคาเท่าไหร่?", "; ".join(f"{x[0]} ¥{x[1]:,}" for x in (p.get("p") or []) if isinstance(x, list) and len(x) >= 2 and isinstance(x[1], (int, float)))[:600]))
    if p.get("v"):
        faq.append((f"{name} ใช้ได้กี่วัน?", str(p["v"])))
    if p.get("buy"):
        faq.append((f"ซื้อ {name} ได้ที่ไหน?", first_sent(p["buy"], 400)))
    note_c = re.sub(r"^active[;:,]?\s*", "", str(p.get("note", "")), flags=re.I)
    body = (f'<p class="m"><a href="/">Nihontabi</a> › <a href="/guide/">คู่มือ</a> › <a href="/guide/pass/">Pass</a></p><h1>{E(name)}</h1><p class="m">ผู้ให้บริการ: {E(p.get("op", ""))}'
            + (f' · เมืองฐานที่เกี่ยวข้อง: {E(", ".join(hubs))}' if hubs else "") + "</p>"
            + (f'<p>{E(note_c)}</p>' if note_c else "")
            + (f"<h2>ระยะเวลาใช้งาน</h2><p>{E(p['v'])}</p>" if p.get("v") else "")
            + (f'<h2>ราคา (เยน)</h2><table><tr><th>รายการ</th><th>ผู้ใหญ่</th><th>เด็ก</th></tr>{rows}</table>' if rows else "")
            + (f'<h2>ข้อจำกัด / ใช้ไม่ได้</h2><p>{E(p["ex"])}</p>' if p.get("ex") else "")
            + (f'<h2>ซื้อที่ไหน</h2><p>{E(p["buy"])}</p>' if p.get("buy") else "")
            + '<p><a class="cta" href="/">ให้แอปช่วยเลือกแพลนที่ใช้พาสนี้ →</a></p>'
            + (f"<h2>คำถามที่พบบ่อย</h2>" + "".join(f"<h3>{E(q)}</h3><p>{E(a)}</p>" for q, a in faq) if faq else "")
            + (f"<h2>แหล่งอ้างอิง</h2><ul class=l>{src}</ul>" if src else "")
            + f'<p class="m">ตรวจล่าสุดเมื่อ {E(p.get("ck", ""))} ข้อมูลส่วนใหญ่ภาษาอังกฤษจากแหล่งทางการ ราคาและเงื่อนไขเปลี่ยนได้</p>')
    ld = [{"@context": "https://schema.org", "@type": "WebPage", "name": name, "inLanguage": "th", "url": f"{SITE}/guide/pass/{p['id']}.html"}]
    if faq:
        ld.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]})
    open(f"guide/pass/{p['id']}.html", "w", encoding="utf8").write(page(f"{name}: ราคา วิธีใช้ ซื้อที่ไหน | Nihontabi", first_sent((p.get("note") or "") + " " + str(p.get("v") or ""), 150) or f"ข้อมูล {name}", f"{SITE}/guide/pass/{p['id']}.html", body, ld))
    urls.append(f"{SITE}/guide/pass/{p['id']}.html")
    plinks.append((p["id"], name, p.get("op", "")))
open("guide/pass/index.html", "w", encoding="utf8").write(page("รวมพาสท่องเที่ยวญี่ปุ่น ราคาและเงื่อนไข | Nihontabi", "รวมพาสรถไฟและขนส่งในญี่ปุ่นที่เปิดขายอยู่ พร้อมราคา ระยะเวลา ข้อจำกัด และที่ซื้อ", f"{SITE}/guide/pass/", '<h1>พาสท่องเที่ยวญี่ปุ่น</h1><ul class=l>' + "".join(f'<li><a href="/guide/pass/{i}.html">{E(n)}</a> <span class="m">{E(o)}</span></li>' for i, n, o in plinks) + "</ul>", {"@context": "https://schema.org", "@type": "CollectionPage", "name": "พาสท่องเที่ยวญี่ปุ่น", "inLanguage": "th", "url": f"{SITE}/guide/pass/"}))
urls.append(f"{SITE}/guide/pass/")
extra_llm.append(f"- [Pass guides]({SITE}/guide/pass/): {len(plinks)} active travel passes with prices, validity, exclusions, where to buy")

# ---- plans-by-length pages and pass comparison
SHORT = {(m["hub"], m["id"]): m["short"] for m in ALL}
PLEN = {}
for hub, (th, en, base) in HUBS.items():
    H = json.load(open(f"data/hub_{hub}.json", encoding="utf8"))["hub"]
    plans = list(H.get("plans") or [])
    if hub == "tokyo":
        plans = json.load(open("data/plans.json", encoding="utf8")) + plans
    bylen = {}
    for pl in plans:
        n = len(pl.get("days") or [])
        bylen.setdefault(n, []).append(pl)
    for n in (3, 4, 5, 6, 7, 8, 10):
        L = bylen.get(n, [])
        seen_t, pick = set(), []
        for pl in sorted(L, key=lambda x: (bool(x.get("gen")), 0)):
            t = re.sub(r"\s*\([^)]*\)\s*", " ", str(pl.get("title", ""))).strip()
            if not t or t in seen_t:
                continue
            seen_t.add(t); pick.append(pl)
            if len(pick) >= 12:
                break
        if len(pick) < 2:
            continue
        PLEN.setdefault(hub, []).append(n)
        sec = ""
        for pl in pick:
            ds = []
            for i, d in enumerate(pl.get("days") or [], 1):
                nm = SHORT.get((hub, d.get("mod"))) or str(d.get("title") or d.get("area") or "")[:60] or "เดินทางกลับ"
                ds.append(f"<li>วัน {i}: {E(nm)}</li>")
            bud = (pl.get("transportBudget") or {}).get("adultJPY")
            sec += (f'<h2>{E(pl.get("title", ""))}</h2><p>{E(first_sent(pl.get("tagline", ""), 220))}</p>'
                    + (f'<p class="m">เหมาะกับ: {E(first_sent(pl.get("who", ""), 180))}</p>' if pl.get("who") else "")
                    + (f'<p class="m">ค่าเดินทางประมาณ ¥{int(bud):,} ต่อผู้ใหญ่ (ประมาณการ)</p>' if isinstance(bud, (int, float)) and bud else "")
                    + f'<ul class=l>{"".join(ds)}</ul><p><a href="/?hub={hub}&plan={E(pl.get("id", ""))}">เปิดแผนนี้ในแอป →</a></p>')
        body = (f'<p class="m"><a href="/">Nihontabi</a> › <a href="/guide/">คู่มือ</a> › <a href="/guide/{hub}/">{E(th)}</a></p>'
                f'<h1>แพลนเที่ยว{E(th)} {n} วัน: {len(pick)} แพลนแนะนำ ({E(base)})</h1><p>แพลน {n} วันจากฐาน {E(base)} เลือกจากหลายสไตล์ (เมือง ธรรมชาติ ออนเซ็น ตามฤดูกาล) พร้อมค่าเดินทางประมาณ</p>'
                f'<p><a class="cta" href="/?hub={hub}">ให้แอปจัดแพลน {n} วันตามเดือนที่คุณไป →</a></p>{sec}')
        ld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": f"แพลนเที่ยว{th} {n} วัน", "inLanguage": "th", "url": f"{SITE}/guide/{hub}/plans-{n}-days.html"}
        safe_write(f"guide/{hub}/plans-{n}-days.html", page(f"แพลนเที่ยว{th} {n} วัน: {len(pick)} แพลนแนะนำ | Nihontabi", f"รวมแพลนเที่ยว{th} {n} วัน ตามเดือนและสไตล์ พร้อมค่าเดินทางประมาณ", f"{SITE}/guide/{hub}/plans-{n}-days.html", body, ld, hub))
        urls.append(f"{SITE}/guide/{hub}/plans-{n}-days.html")
for hub, ns in PLEN.items():
    fp = f"guide/{hub}/index.html"; t = open(fp, encoding="utf8").read(); mk = "<h2>ที่เที่ยวและทริปไปเช้า-เย็นกลับ</h2>"
    if mk in t and "แพลนตามจำนวนวัน" not in t:
        links = f'<p class="m">ภาพสรุปสำหรับแชร์ (LINE/IG): <a href="/share/{hub}.jpg">ดาวน์โหลดภาพ</a></p>' + "<h2>แพลนตามจำนวนวัน</h2><p>" + " · ".join(f'<a href="/guide/{hub}/plans-{n}-days.html">{n} วัน</a>' for n in ns) + "</p>"
        safe_write(fp, t.replace(mk, links + mk, 1))
extra_llm.append(f"- Plans by trip length: {SITE}/guide/<hub>/plans-<N>-days.html (N = 3..10)")

# pass comparison
rows = []
for p in PASSCAT:
    if p.get("st") != "active":
        continue
    pr = [x for x in (p.get("p") or []) if isinstance(x, list) and len(x) >= 2 and isinstance(x[1], (int, float))]
    lo = min((x[1] for x in pr), default=None)
    rows.append((p.get("n", p["id"]), p.get("op", ""), p.get("v", ""), lo, p["id"], ", ".join(HUBNAME[h] for h in (p.get("h") or []) if h in HUBNAME)))
rows.sort(key=lambda r: (r[5] == "", r[5], r[0]))
tb = "".join(f'<tr><td><a href="/guide/pass/{E(i)}.html">{E(n)}</a></td><td>{E(o)}</td><td>{E(str(v)[:60])}</td><td>{("¥" + format(lo, ",")) if lo else "-"}</td><td>{E(h)}</td></tr>' for n, o, v, lo, i, h in rows)
safe_write("guide/pass-compare.html", page("เปรียบเทียบพาสท่องเที่ยวญี่ปุ่น: ราคา ระยะเวลา ใช้ที่ไหน | Nihontabi", "ตารางเปรียบเทียบพาสรถไฟและขนส่งในญี่ปุ่นที่เปิดขายอยู่ ราคาเริ่มต้น ระยะเวลาใช้ และเมืองฐานที่เกี่ยวข้อง", f"{SITE}/guide/pass-compare.html",
    f'<p class="m"><a href="/">Nihontabi</a> › <a href="/guide/">คู่มือ</a></p><h1>เปรียบเทียบพาสท่องเที่ยวญี่ปุ่น</h1><p>พาสที่เปิดขายอยู่ {len(rows)} รายการ เรียงตามเมืองฐาน ราคาเป็นราคาเริ่มต้นของผู้ใหญ่ตามข้อมูลที่เก็บไว้ ควรตรวจราคาล่าสุดกับผู้ให้บริการ</p><p><a class="cta" href="/">ให้แอปช่วยเลือกพาสที่คุ้มกับแพลนของคุณ →</a></p><table><tr><th>พาส</th><th>ผู้ให้บริการ</th><th>ระยะเวลา</th><th>ราคาเริ่มต้น</th><th>เมืองฐาน</th></tr>{tb}</table>',
    {"@context": "https://schema.org", "@type": "CollectionPage", "name": "เปรียบเทียบพาสท่องเที่ยวญี่ปุ่น", "inLanguage": "th", "url": f"{SITE}/guide/pass-compare.html"}))
urls.append(f"{SITE}/guide/pass-compare.html")
extra_llm.append(f"- [Pass comparison table]({SITE}/guide/pass-compare.html)")

# ---- seasonal pages: events, sakura, foliage, winter
os.makedirs("guide/season", exist_ok=True)
MIDX = {k: i for i, (k, _) in enumerate(MON)}
EVENTS, SAK = [], []
for hub, (th, en, base) in HUBS.items():
    H = json.load(open(f"data/hub_{hub}.json", encoding="utf8"))["hub"]
    mids = {m["id"] for m in ALL if m["hub"] == hub}
    for ev in H.get("events") or []:
        EVENTS.append((hub, th, ev, ev.get("city") in mids))
    for m in H["mods"]:
        for sp in (m.get("sakura100") or []):
            if isinstance(sp, dict) and sp.get("bloom"):
                SAK.append((hub, th, m["id"], sp))


def mlink(hub, mid, label):
    ok = any(m["hub"] == hub and m["id"] == mid for m in ALL)
    return f'<a href="/guide/{hub}/{E(mid)}.html">{E(label)}</a>' if ok else E(label)


def season_page(slug, title, desc, h1, intro, body_html):
    url = f"{SITE}/guide/season/{slug}.html"
    body = (f'<p class="m"><a href="/">Nihontabi</a> › <a href="/guide/">คู่มือ</a></p><h1>{E(h1)}</h1><p>{E(intro)}</p>'
            f'<p><a class="cta" href="/">ให้แอปจัดแพลนตามเดือนที่คุณไป →</a></p>{body_html}')
    ld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": h1, "inLanguage": "th", "url": url}
    safe_write(f"guide/season/{slug}.html", page(title, desc, url, body, ld))
    urls.append(url)


# events
evs = sorted(EVENTS, key=lambda x: (MIDX.get((x[2].get("months") or ["jan"])[0], 0), x[2].get("name", "")))
rows = ""
cur = None
for hub, th, ev, has in evs:
    m0 = (ev.get("months") or ["jan"])[0]
    if m0 != cur:
        cur = m0
        rows += f'<h2>{E(FULL[m0])}</h2>'
    conf = ev.get("confirmed2027")
    dates = ev.get("dates2027") if conf and ev.get("dates2027") else ev.get("datesTypical")
    link_html = mlink(hub, ev.get("city"), "ดูสถานที่/วิธีไป") if has else ""
    rows += (f'<h3>{E(ev.get("name", ""))} <span class="m">{E(ev.get("jp", ""))}</span></h3><p>{E(first_sent(ev.get("th", ""), 200))}</p>'
             f'<p class="m">{"✓ ประกาศวันปี 2027 แล้ว: " if conf else "วันที่: "}{E(first_sent(dates or "ยังไม่ประกาศ", 220))} · ใกล้เมืองฐาน{E(th)} · {link_html}</p>'
             + (f'<p class="m">ค่าเข้า/ค่าใช้จ่าย: {E(first_sent(ev.get("cost", ""), 140))}</p>' if ev.get("cost") else ""))
season_page("events-2027", f"เทศกาลและอีเวนต์ญี่ปุ่นปี 2027: {len(evs)} งานเด่นแยกตามเดือน | Nihontabi",
            "รวมเทศกาลและอีเวนต์ญี่ปุ่นที่เหมาะวางแผนปี 2027 แยกตามเดือนและเมืองฐาน พร้อมวันที่ปกติหรือวันที่ประกาศแล้ว", "เทศกาลและอีเวนต์ญี่ปุ่นปี 2027",
            f"รวม {len(evs)} งานเด่นที่ใกล้เมืองฐาน 6 เมือง เรียงตามเดือน งานที่มีเครื่องหมาย ✓ คือมีวันที่ปี 2027 ที่ประกาศแล้วตามข้อมูลที่เก็บไว้ งานอื่นแสดงวันที่ของปีก่อนเป็นแนวทาง ตรวจวันที่จริงกับผู้จัดก่อนจองตั๋วหรือที่พัก", rows)

# sakura
sk = sorted(SAK, key=lambda x: str(x[3]["bloom"][0]))
rows = ""
for hub, th, mid, sp in sk:
    b = sp["bloom"]
    trees = f' · ซากุระประมาณ {sp["trees"]:,} ต้น' if isinstance(sp.get("trees"), int) else ""
    note = f'<p>{E(first_sent(sp.get("note", ""), 240))}</p>' if sp.get("note") else ""
    light = f'<p class="m">ไฟยามค่ำ: {E(first_sent(sp.get("light_period", ""), 160))}</p>' if sp.get("light") and sp.get("light_period") else ""
    rows += (f'<h3>{mlink(hub, mid, sp.get("th") or sp.get("en") or mid)} <span class="m">{E(sp.get("en", ""))}</span></h3>'
             f'<p class="m">ช่วงบานปกติ: {E(b[0].replace("-", "/"))} – {E(b[1].replace("-", "/"))} (เดือน/วัน) · ใกล้เมืองฐาน{E(th)}{trees}</p>{note}{light}')
season_page("sakura", f"ซากุระญี่ปุ่น: {len(sk)} จุดชมซากุระ ช่วงบานปกติ ไฟยามค่ำ | Nihontabi",
            "รวมจุดชมซากุระใกล้เมืองฐาน พร้อมช่วงบานปกติ จำนวนต้น และกิจกรรมไฟยามค่ำ เรียงตามเวลาที่บานก่อน", "จุดชมซากุระญี่ปุ่น เรียงตามช่วงบาน",
            f"{len(sk)} จุดที่มีข้อมูลช่วงบานปกติ เรียงจากบานก่อนไปบานทีหลัง วันบานจริงเปลี่ยนทุกปีตามสภาพอากาศ ควรเช็คพยากรณ์ซากุระล่าสุดก่อนซื้อตั๋วหรือจองที่พัก", rows)

# foliage
FOL = []
for hub, (th, en, base) in HUBS.items():
    H = json.load(open(f"data/hub_{hub}.json", encoding="utf8"))["hub"]
    mods2 = list(H["mods"]) + (json.load(open("data/modules.json", encoding="utf8")) if hub == "tokyo" else [])
    seen = set()
    for m in mods2:
        mj = m.get("momiji")
        if mj and mj.get("peak") and m["id"] not in seen:
            seen.add(m["id"])
            FOL.append((hub, th, m["id"], mj))


def fkey(x):
    pk = str(x[3].get("peak", ""))
    mo = {"Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}
    mm = [v for k, v in mo.items() if k in pk]
    w = 0 if "early" in pk else 2 if "late" in pk else 1
    return (mm[0] if mm else 99, w)


fol = sorted(FOL, key=fkey)
SHORT2 = {(m["hub"], m["id"]): m["short"] for m in ALL}
rows = "".join(f'<tr><td>{mlink(h, i, SHORT2.get((h, i), i))}</td><td>{E(t)}</td><td>{E(thm(j.get("start")))}</td><td><b>{E(thm(j.get("peak")))}</b></td><td>{E(thm(j.get("end")))}</td><td><a href="{E(j.get("src", ""))}" rel="nofollow noopener">แหล่ง</a></td></tr>' for h, t, i, j in fol)
season_page("foliage", f"ใบไม้เปลี่ยนสีญี่ปุ่น: {len(fol)} จุด ช่วงพีคปกติ เรียงตามเวลา | Nihontabi",
            "ตารางช่วงใบไม้เปลี่ยนสีปกติของที่เที่ยวใกล้เมืองฐาน 6 เมือง พร้อมแหล่งอ้างอิง เรียงตามช่วงพีค", "ใบไม้เปลี่ยนสีญี่ปุ่น เรียงตามช่วงพีค",
            f"{len(fol)} จุดที่ตรวจช่วงใบไม้เปลี่ยนสีของปีเฉลี่ยกับแหล่งอ้างอิงแล้ว เรียงตามช่วงพีค (ไม่ใช่พยากรณ์ปีนี้ ใบไม้เปลี่ยนสีจริงเลื่อนเร็ว-ช้าตามอากาศ ควรเช็คพยากรณ์ก่อนไป)",
            f'<table><tr><th>ที่เที่ยว</th><th>เมืองฐาน</th><th>เริ่ม</th><th>พีค</th><th>จบ</th><th>อ้างอิง</th></tr>{rows}</table>')

# winter / snow
snow = [m for m in ALL if "snow" in m["themes"] and max(sc(m, "jan"), sc(m, "feb")) >= 5]
wev = [x for x in evs if (x[2].get("months") or [""])[0] in ("dec", "jan", "feb", "mar")]
rows = "<h2>เทศกาลและอีเวนต์ฤดูหนาว</h2>"
for hub, th, ev, has in wev:
    dd = (ev.get("dates2027") if ev.get("confirmed2027") else ev.get("datesTypical")) or "ยังไม่ประกาศ"
    rows += f'<h3>{E(ev.get("name", ""))} <span class="m">{E(ev.get("jp", ""))}</span></h3><p>{E(first_sent(ev.get("th", ""), 200))}</p><p class="m">วันที่: {E(first_sent(dd, 200))} · ใกล้เมืองฐาน{E(th)}</p>'
rows += "<h2>ที่เที่ยวหิมะที่เหมาะเดือนม.ค.–ก.พ.</h2><ul class=l>"
for m in sorted(snow, key=lambda m: (m["hub"], m["mn"] or 999)):
    mn_txt = f", {m['mn']} นาที" if m["mn"] else ""
    rows += f'<li>{link(m)} <span class="m">(เมืองฐาน{E(m["th"])}{mn_txt})</span></li>'
rows += "</ul>"
season_page("winter-snow", f"เที่ยวญี่ปุ่นหน้าหนาว: เทศกาลหิมะ ออนเซ็น {len(snow)} ที่เที่ยวหิมะ | Nihontabi",
            "รวมเทศกาลฤดูหนาวและที่เที่ยวหิมะที่เหมาะกับเดือนมกราคมถึงกุมภาพันธ์ ใกล้เมืองฐาน 6 เมือง", "เที่ยวญี่ปุ่นหน้าหนาว: เทศกาลหิมะและที่เที่ยวหิมะ",
            f"{len(wev)} เทศกาลฤดูหนาวและ {len(snow)} ที่เที่ยวหิมะที่คะแนนฤดูกาลสูงสุดในเดือนม.ค.–ก.พ. แยกตามเมืองฐาน", rows)
extra_llm.append(f"- Seasonal guides: {SITE}/guide/season/events-2027.html, sakura.html, foliage.html, winter-snow.html")
SEASON_LINKS = [("events-2027", "เทศกาลและอีเวนต์ปี 2027"), ("sakura", "จุดชมซากุระ"), ("foliage", "ใบไม้เปลี่ยนสี"), ("winter-snow", "เที่ยวหน้าหนาว/หิมะ")]

# ---- update guide index with the new sections
idx2 = ('<h2>ตามเดือน</h2><ul class=l>' + "".join(f'<li><a href="/guide/month/{k}.html">เที่ยวญี่ปุ่นเดือน{FULL[k]}</a></li>' for k, lab in MON) + "</ul>"
        '<h2>ตามธีม</h2><ul class=l>' + "".join(f'<li><a href="/guide/theme/{t}.html">สาย{E(tl)}</a> <span class="m">({n} แห่ง)</span></li>' for t, tl, n in tlinks) + "</ul>"
        '<h2>ตามฤดูกาล</h2><ul class=l>' + ''.join(f'<li><a href="/guide/season/{a}.html">{b}</a></li>' for a, b in SEASON_LINKS) + '</ul>'
        f'<h2>พาส</h2><p><a href="/guide/pass/">รวมพาสท่องเที่ยว {len(plinks)} รายการ</a> · <a href="/guide/pass-compare.html">ตารางเปรียบเทียบพาส</a></p>'
        '<h2>แพลนตามจำนวนวัน</h2><ul class=l>' + ''.join(f'<li>เที่ยว{E(HUBS[h][0])}: ' + ' · '.join(f'<a href="/guide/{h}/plans-{n}-days.html">{n} วัน</a>' for n in ns) + '</li>' for h, ns in PLEN.items()) + '</ul>')
EXTRA_INDEX = idx2
print("extra pages: months 12, themes", len(tlinks), "passes", len(plinks))
