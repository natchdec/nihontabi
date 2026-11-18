# Extra generated pages: month guides, theme guides, pass guides.  Executed by build_pages.py (shares its globals).
import json, re, os, shutil, html

PASSCAT = json.loads(re.search(r'<script type="application/json" id="passcat">(.*?)</script>', open("index.html", encoding="utf8").read(), re.S).group(1))
ALL = []
for hub, (th, en, base) in HUBS.items():
    H = json.load(open(f"data/hub_{hub}.json", encoding="utf8"))["hub"]
    for m in H["mods"]:
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
    body = (f'<p class="m"><a href="/">Nihontabi</a> › <a href="/guide/">คู่มือ</a> › <a href="/guide/pass/">Pass</a></p><h1>{E(name)}</h1><p class="m">ผู้ให้บริการ: {E(p.get("op", ""))}'
            + (f' · เมืองฐานที่เกี่ยวข้อง: {E(", ".join(hubs))}' if hubs else "") + "</p>"
            + (f'<p>{E(re.sub(r"^active[;:,]?\s*", "", str(p.get("note", "")), flags=re.I))}</p>' if re.sub(r"^active[;:,]?\s*", "", str(p.get("note", "")), flags=re.I) else "")
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

# ---- update guide index with the new sections
idx2 = ('<h2>ตามเดือน</h2><ul class=l>' + "".join(f'<li><a href="/guide/month/{k}.html">เที่ยวญี่ปุ่นเดือน{FULL[k]}</a></li>' for k, lab in MON) + "</ul>"
        '<h2>ตามธีม</h2><ul class=l>' + "".join(f'<li><a href="/guide/theme/{t}.html">สาย{E(tl)}</a> <span class="m">({n} แห่ง)</span></li>' for t, tl, n in tlinks) + "</ul>"
        f'<h2>พาส</h2><p><a href="/guide/pass/">รวมพาสท่องเที่ยว {len(plinks)} รายการ</a></p>')
EXTRA_INDEX = idx2
print("extra pages: months 12, themes", len(tlinks), "passes", len(plinks))
