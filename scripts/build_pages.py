"""Generate static, crawlable pages from data/hub_*.json: guide/index.html, guide/<hub>/index.html, guide/<hub>/<place>.html,
sitemap.xml and llms.txt.  usage: python scripts/build_pages.py   (run from the repo root)"""
import json, re, html, os, shutil, datetime, urllib.parse
SITE = "https://nihontabi.web.app"
HUBS = {"tokyo": ("โตเกียว", "Tokyo", "ฐาน Ueno"), "osaka": ("โอซาก้า", "Osaka", "ฐาน Namba"), "sendai": ("เซนได", "Sendai", "ฐาน Sendai Station"),
        "nagoya": ("นาโกย่า", "Nagoya", "ฐาน Nagoya Station"), "fukuoka": ("ฟุกุโอกะ", "Fukuoka", "ฐาน Hakata"), "sapporo": ("ซัปโปโร", "Sapporo", "ฐาน Sapporo Station")}
MON = [("jan", "ม.ค."), ("feb", "ก.พ."), ("mar", "มี.ค."), ("apr", "เม.ย."), ("may", "พ.ค."), ("jun", "มิ.ย."), ("jul", "ก.ค."), ("aug", "ส.ค."), ("sep", "ก.ย."), ("oct", "ต.ค."), ("nov", "พ.ย."), ("dec", "ธ.ค.")]
TH = {"foliage": "ใบไม้เปลี่ยนสี", "food": "อาหาร", "night": "ราตรี", "shop": "ช้อปปิ้ง", "nature": "ธรรมชาติ", "onsen": "ออนเซ็น", "snow": "หิมะ", "photo": "ถ่ายรูป", "festival": "เทศกาล", "culture": "วัฒนธรรม", "anime": "อนิเมะ", "park": "สวนสนุก/สวน", "chill": "ชิลล์", "sakura": "ซากุระ"}
UPDATED = "2026-11-18"


def E(s):
    return html.escape(str(s if s is not None else ""), quote=True)


CSS = ":root{color-scheme:light dark;--bg:#fff;--fg:#1d2330;--mut:#5b6475;--ac:#c0392b;--bd:#e4e7ee}@media(prefers-color-scheme:dark){:root{--bg:#12151c;--fg:#e8ebf2;--mut:#9aa3b5;--ac:#ff7a6b;--bd:#2a3040}}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.75 system-ui,'Noto Sans Thai',sans-serif}main{max-width:820px;margin:0 auto;padding:20px 16px 64px}a{color:var(--ac)}h1{font-size:26px;line-height:1.3}h2{font-size:19px;margin-top:30px;border-bottom:1px solid var(--bd);padding-bottom:6px}table{border-collapse:collapse;width:100%;font-size:14.5px}td,th{border-bottom:1px solid var(--bd);padding:6px 8px;text-align:left}.m{color:var(--mut);font-size:14px}.cta{display:inline-block;margin:10px 0;padding:10px 16px;border-radius:12px;background:var(--ac);color:#fff;text-decoration:none;font-weight:600}.tag{display:inline-block;margin:2px 4px 2px 0;padding:1px 9px;border:1px solid var(--bd);border-radius:99px;font-size:13px}ul.l{padding-left:20px}"


def share_bar(canon):
    q = urllib.parse.quote(canon, safe="")
    return ('<p class="m">แชร์หน้านี้: <a href="https://social-plugins.line.me/lineit/share?url=' + q + '" rel="nofollow noopener">LINE</a> · '
            '<a href="https://www.facebook.com/sharer/sharer.php?u=' + q + '" rel="nofollow noopener">Facebook</a> · '
            '<a href="#" onclick="navigator.clipboard&amp;&amp;navigator.clipboard.writeText(\'' + canon + '\');this.textContent=\'คัดลอกลิงก์แล้ว ✓\';return false">คัดลอกลิงก์</a></p>')


def page(title, desc, canon, body, ld, img="default"):
    return ('<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{E(title)}</title><meta name="description" content="{E(desc)}"><link rel="canonical" href="{canon}">'
            f'<meta property="og:type" content="article"><meta property="og:title" content="{E(title)}"><meta property="og:description" content="{E(desc)}">'
            f'<meta property="og:url" content="{canon}"><meta property="og:locale" content="th_TH"><meta property="og:image" content="{SITE}/og/{img}.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="{SITE}/og/{img}.jpg">'
            f'<style>{CSS}</style><script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script></head><body><main>{body}<hr>'
            + share_bar(canon) +
            '<p class="m">ดูเพิ่ม: <a href="/guide/">คู่มือรายเมือง</a> · <a href="/guide/month/nov.html">ตามเดือน</a> · <a href="/guide/theme/foliage.html">ตามธีม</a> · <a href="/guide/pass/">พาสท่องเที่ยว</a> · <a href="/guide/pass-compare.html">เปรียบเทียบพาส</a></p>'
            f'<p class="m">ข้อมูลรวบรวม ณ {UPDATED} จากแหล่งทางการและเว็บท่องเที่ยว ราคา เวลาเปิด-ปิด และเงื่อนไขอาจเปลี่ยน ตรวจกับผู้ให้บริการก่อนเดินทางทุกครั้ง · '
            '<a href="/privacy.html">นโยบายความเป็นส่วนตัว</a> · <a href="/credits.html">เครดิตรูปภาพ</a></p></main><script src="/analytics.js" defer></script></body></html>')


MTH_EN = {"Sep": "ก.ย.", "Oct": "ต.ค.", "Nov": "พ.ย.", "Dec": "ธ.ค.", "Aug": "ส.ค."}
WRD = {"early": "ต้น", "mid": "กลาง", "late": "ปลาย"}


def thm(x):
    if not x:
        return "-"
    out = str(x)
    for k, v in WRD.items():
        out = re.sub(r"" + k + r"", v, out, flags=re.I)
    for k, v in MTH_EN.items():
        out = re.sub(k, v, out, flags=re.I)
    return out


LOCKED = []


def safe_write(path, text):
    try:
        open(path, "w", encoding="utf8").write(text)
    except PermissionError:
        LOCKED.append(path)


def first_sent(s, n=160):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[:n].rsplit(" ", 1)[0] + "…"


def clean(x):
    return {k: v for k, v in x.items() if v not in (None, [], "", {})}


px = json.load(open("data/px_summary.json", encoding="utf8"))
os.makedirs("guide", exist_ok=True)
urls = [SITE + "/", SITE + "/privacy.html", SITE + "/guide/"]
llm = []
hub_links = []
total = 0
for hub, (th, en, base) in HUBS.items():
    H = json.load(open(f"data/hub_{hub}.json", encoding="utf8"))["hub"]
    d = f"guide/{hub}"
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d, exist_ok=True)
    mods = [m for m in H["mods"] if m.get("kind") not in ("arrival", "departure") and re.fullmatch(r"[a-z0-9][a-z0-9\-_]*", str(m.get("id", "")))]
    META = {}
    for m0 in mods:
        t0 = m0.get("title", ""); fh0 = m0.get("fromHub") or m0.get("fromUeno") or {}
        META[m0["id"]] = {"short": t0.split(":")[0].strip() if ":" in t0 else t0, "themes": set(m0.get("themes") or []), "mn": fh0.get("minutes") or 999}
    items = []
    for m in mods:
        fh = m.get("fromHub") or m.get("fromUeno") or {}
        mn = fh.get("minutes")
        fare = m.get("fare") or {}
        months = m.get("months") or {}
        best = [lab for k, lab in MON if (months.get(k) or {}).get("score", 0) >= 4]
        title = m.get("title", "")
        short = title.split(":")[0].strip() if ":" in title else title
        themes = [TH.get(t, t) for t in (m.get("themes") or [])]
        tick = [p for p in ((m.get("passes") or {}).get("other") or []) if isinstance(p, dict) and p.get("name")]
        rows = "".join(f"<tr><td>{lab}</td><td>{(months.get(k) or {}).get('score', '')}/5</td><td>{E(first_sent((months.get(k) or {}).get('note', ''), 200))}</td></tr>" for k, lab in MON if months.get(k))
        src = "".join(f'<li><a href="{E(s.get("u"))}" rel="nofollow noopener">{E(s.get("t"))}</a></li>' for s in (m.get("sources") or []) if isinstance(s, dict) and str(s.get("u", "")).startswith("http"))
        faq = []
        if mn:
            faq.append((f"จาก {en} ไป {short} ใช้เวลาเดินทางเท่าไหร่?", f"ประมาณ {mn} นาทีต่อเที่ยวจาก{base} เปลี่ยนสาย {fh.get('transfers', 0)} ครั้ง ({first_sent(fh.get('route', ''), 220)})"))
        if best:
            faq.append((f"{short} ไปเดือนไหนดี?", "เดือนที่คะแนนสูง (4–5 จาก 5): " + ", ".join(best)))
        if fare.get("singleRT"):
            faq.append((f"ค่าเดินทางไป {short} เท่าไหร่?", f"ประมาณ ¥{fare['singleRT']:,} ไป-กลับ (ไม่รวมค่าตั๋วเข้าชม) · {first_sent(fare.get('note', ''), 200)}"))
        body = (f'<p class="m"><a href="/">Nihontabi</a> › <a href="/guide/">คู่มือ</a> › <a href="/guide/{hub}/">{E(th)}</a></p><h1>{E(title)}</h1>'
                + (f'<p class="m">{E(m.get("jp", ""))} · {E(m.get("region", ""))}</p>' if m.get("jp") or m.get("region") else "")
                + "".join(f'<span class="tag">{E(t)}</span>' for t in themes)
                + f'<p>{E(m.get("pitch", ""))}</p><p><a class="cta" href="/?hub={hub}">เปิดแอปวางแผน {E(th)} →</a></p>')
        if mn:
            body += f'<h2>เดินทางจาก{E(th)} ({E(base)})</h2><p>ประมาณ <b>{mn} นาที</b>ต่อเที่ยว · เปลี่ยนสาย {fh.get("transfers", 0)} ครั้ง</p><p>{E(fh.get("route", ""))}</p>'
            if fh.get("returnBy"):
                body += f'<p class="m">กลับ: {E(fh.get("returnBy"))}</p>'
        if fare.get("singleRT"):
            body += f'<h2>ค่าเดินทางโดยประมาณ</h2><p>¥{fare["singleRT"]:,} ไป-กลับ ต่อคน · {E(fare.get("note", ""))}</p>'
        if tick:
            body += "<h2>ตั๋ว/พาสที่เกี่ยวข้อง</h2><ul class=l>" + "".join(
                f'<li><b>{E(p["name"])}</b>' + (f' ¥{p["price"]:,}' if isinstance(p.get("price"), (int, float)) else "")
                + (f' — {E(first_sent(p.get("note", ""), 240))}' if p.get("note") else "") + "</li>" for p in tick[:6]) + "</ul>"
        if rows:
            body += f'<h2>เดือนไหนไปดี</h2><table><tr><th>เดือน</th><th>คะแนน</th><th>หมายเหตุ</th></tr>{rows}</table>'
        mj = m.get("momiji")
        if mj and mj.get("peak"):
            body += f'<h2>ช่วงใบไม้เปลี่ยนสี (ปีเฉลี่ย)</h2><p>เริ่ม {E(thm(mj.get("start")))} · พีค <b>{E(thm(mj.get("peak")))}</b> · ร่วงหมด/จบ {E(thm(mj.get("end")))}</p><p class="m">ช่วงทั่วไปของปีเฉลี่ย ไม่ใช่พยากรณ์ปีนี้ ความมั่นใจ: {E(mj.get("conf", ""))} · <a href="{E(mj.get("src", ""))}" rel="nofollow noopener">แหล่งอ้างอิง</a> · ควรเช็คพยากรณ์ใบไม้เปลี่ยนสีของปีนั้นก่อนไป</p>'
        cl = [c for c in (m.get("closures") or []) if isinstance(c, str)]
        if cl:
            body += "<h2>ข้อควรรู้ / วันปิด / การจอง</h2><ul class=l>" + "".join(f"<li>{E(c)}</li>" for c in cl[:8]) + "</ul>"
        if faq:
            body += "<h2>คำถามที่พบบ่อย</h2>" + "".join(f"<h3>{E(q)}</h3><p>{E(a)}</p>" for q, a in faq)
        rel = sorted([(len(META[m["id"]]["themes"] & v["themes"]), -abs((v["mn"] or 999) - (mn or 999)), k) for k, v in META.items() if k != m["id"] and (META[m["id"]]["themes"] & v["themes"])], reverse=True)[:6]
        if rel:
            body += "<h2>ที่เที่ยวใกล้เคียง/คล้ายกัน</h2><ul class=l>" + "".join(f'<li><a href="/guide/{hub}/{k}.html">{E(META[k]["short"])}</a></li>' for _, _, k in rel) + "</ul>"
        body += f'<p class="m">ดูทั้งหมดของ <a href="/guide/{hub}/">เที่ยวจาก{E(th)}</a> · <a href="/guide/{hub}/plans-5-days.html">แพลน 5 วัน{E(th)}</a></p>'
        if src:
            body += f"<h2>แหล่งอ้างอิง</h2><ul class=l>{src}</ul>"
        ld = [clean({"@context": "https://schema.org", "@type": "TouristAttraction", "name": short, "alternateName": m.get("jp"), "description": first_sent(m.get("pitch"), 300),
                     "touristType": themes, "address": clean({"@type": "PostalAddress", "addressRegion": m.get("region"), "addressCountry": "JP"}),
                     "isPartOf": {"@type": "WebSite", "name": "Nihontabi", "url": SITE}}),
              {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
                  {"@type": "ListItem", "position": 1, "name": "Nihontabi", "item": SITE + "/"},
                  {"@type": "ListItem", "position": 2, "name": th, "item": f"{SITE}/guide/{hub}/"},
                  {"@type": "ListItem", "position": 3, "name": short}]}]
        if faq:
            ld.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]})
        safe_write(f"{d}/{m['id']}.html", page(f"{short} เที่ยวจาก{th}: เดินทางยังไง ค่าเข้า เดือนไหนดี | Nihontabi", first_sent(m.get("pitch"), 150), f"{SITE}/guide/{hub}/{m['id']}.html", body, ld, hub))
        urls.append(f"{SITE}/guide/{hub}/{m['id']}.html")
        items.append((short, m["id"], mn, first_sent(m.get("pitch"), 130)))
        total += 1
    pf = (px.get(hub) or {}).get("flights") or []
    pr = ""
    if pf:
        pr = (f'<h2>ราคาตั๋วเครื่องบินโดยประมาณ (BKK → {E(en)})</h2><table><tr><th>ออกเดินทาง</th><th>ถูกสุดที่พบ (ไป-กลับ)</th></tr>'
              + "".join(f'<tr><td>{E(f["dep"])}</td><td>฿{f["thb"]:,}</td></tr>' for f in pf[:12])
              + f'</table><p class="m">ข้อมูลตัวอย่าง ณ {E((px.get(hub) or {}).get("asOf", ""))} ไม่ใช่ราคาตอนจอง</p>')
    plans = (H.get("decide") or [])[:12]
    pl = ""
    if plans:
        pl = "<h2>แพลนแนะนำ</h2><ul class=l>" + "".join(f'<li><b>{E(p.get("q", ""))}</b><br><span class="m">{E(first_sent(p.get("a", ""), 220))}</span></li>' for p in plans) + "</ul>"
    lst = "<h2>ที่เที่ยวและทริปไปเช้า-เย็นกลับ</h2><ul class=l>" + "".join(
        f'<li><a href="/guide/{hub}/{i}.html">{E(s)}</a>' + (f' <span class="m">({mn} นาที)</span>' if mn else "") + f'<br><span class="m">{E(p)}</span></li>' for s, i, mn, p in items) + "</ul>"
    body = (f'<p class="m"><a href="/">Nihontabi</a> › <a href="/guide/">คู่มือ</a></p><h1>เที่ยวญี่ปุ่นจาก{E(th)} ({E(base)}) : ที่เที่ยว แพลน และราคา</h1>'
            f'<p>นอนที่{E(th)}ที่เดียว แล้วเที่ยวไป-กลับตลอดปี รวม {len(items)} จุดหมายพร้อมวิธีเดินทาง เวลา ค่าเดินทาง และเดือนที่เหมาะ</p>'
            f'<p><a class="cta" href="/?hub={hub}">เปิดแอปวางแผน (เลือกเดือน จำนวนวัน และพาส) →</a></p>{pl}{pr}{lst}')
    ld = [{"@context": "https://schema.org", "@type": "CollectionPage", "name": f"เที่ยวญี่ปุ่นจาก{th}", "inLanguage": "th", "url": f"{SITE}/guide/{hub}/",
           "mainEntity": {"@type": "ItemList", "itemListElement": [{"@type": "ListItem", "position": n + 1, "name": s, "url": f"{SITE}/guide/{hub}/{i}.html"} for n, (s, i, _, _) in enumerate(items)]}}]
    open(f"{d}/index.html", "w", encoding="utf8").write(page(f"เที่ยวญี่ปุ่นจาก{th}: {len(items)} ที่เที่ยวไป-กลับ แพลน และราคา | Nihontabi",
                                                           f"รวมที่เที่ยวที่ไปเช้า-เย็นกลับจาก{th} พร้อมวิธีเดินทาง ค่าเดินทาง เดือนที่เหมาะ และราคาตั๋วบินโดยประมาณ", f"{SITE}/guide/{hub}/", body, ld, hub))
    urls.append(f"{SITE}/guide/{hub}/")
    hub_links.append((hub, th, len(items)))
    llm.append(f"- [{th} ({base})]({SITE}/guide/{hub}/): {len(items)} places reachable as day trips, routes, fares, best months")

exec(open("scripts/build_pages2.py", encoding="utf8").read())
idx = "".join(f'<li><a href="/guide/{h}/">เที่ยวจาก{E(t)}</a> <span class="m">({n} จุดหมาย)</span></li>' for h, t, n in hub_links)
open("guide/index.html", "w", encoding="utf8").write(page("คู่มือเที่ยวญี่ปุ่นรายเมือง | Nihontabi",
    "รวมคู่มือที่เที่ยวญี่ปุ่นแบบนอนเมืองเดียวแล้วเที่ยวไป-กลับ 6 เมืองฐาน: Tokyo, Osaka, Sendai, Nagoya, Fukuoka, Sapporo", SITE + "/guide/",
    f'<h1>คู่มือเที่ยวญี่ปุ่นรายเมืองฐาน</h1><h2>รายเมืองฐาน</h2><ul class=l>{idx}</ul>{EXTRA_INDEX}<p><a class="cta" href="/">เปิดแอปวางแผน →</a></p>',
    {"@context": "https://schema.org", "@type": "CollectionPage", "name": "คู่มือเที่ยวญี่ปุ่นรายเมืองฐาน", "inLanguage": "th", "url": SITE + "/guide/"}))
today = datetime.date.today().isoformat()
open("sitemap.xml", "w", encoding="utf8").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                                + "\n".join(f"<url><loc>{u}</loc><lastmod>{today}</lastmod></url>" for u in urls) + "\n</urlset>\n")
NL = "\n"
open("llms.txt", "w", encoding="utf8").write(f"""# Nihontabi
> Thai-language Japan trip planner. Stay in one hub city and make day trips all year round. Covers 6 hubs (Tokyo/Ueno, Osaka/Namba, Sendai, Nagoya, Fukuoka/Hakata, Sapporo) with routes, fares, passes, best months and estimated flight prices from Bangkok.

Facts are compiled from official sites and travel sites (data as of {UPDATED}); prices and hours change, so verify with the provider before travel. Flight prices are sampled estimates, not live fares.

## Guides
{NL.join(llm)}
{NL.join(extra_llm)}
- [Guide index]({SITE}/guide/)

## App
- [Interactive planner]({SITE}/): choose month, trip length (3-15 days) and passes; plans and maps. Thai UI.

## Policy
- [Privacy]({SITE}/privacy.html)
""")
print("pages:", total, "urls:", len(urls))
if LOCKED:
    print("LOCKED files (not rewritten):", LOCKED)
