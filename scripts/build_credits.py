"""Build credits.html from every photo credit in data/ (photos.json, pmon.json, hub_*.json). Run from repo root."""
import json, glob, html, re, urllib.parse
E = lambda s: html.escape(str(s or ""), quote=True)
seen = {}
def add(v):
    if isinstance(v, dict) and v.get("p") and str(v["p"]).startswith("http"):
        seen.setdefault(v["p"], (re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", str(v.get("a") or ""))).strip(), str(v.get("l") or "")))
def walk(o):
    if isinstance(o, dict):
        if "p" in o and ("l" in o or "a" in o): add(o)
        else:
            for x in o.values(): walk(x)
    elif isinstance(o, list):
        for x in o: walk(x)
for f in ["data/photos.json", "data/pmon.json"] + sorted(glob.glob("data/hub_*.json")):
    try: d = json.load(open(f, encoding="utf8"))
    except Exception: continue
    walk(d.get("photos") if isinstance(d, dict) and "photos" in d else d)
    if isinstance(d, dict) and "hub" in d: walk(d["hub"].get("photos")) 
rows = []
for p, (a, l) in seen.items():
    name = urllib.parse.unquote(p.rsplit("/", 1)[-1]).replace("File:", "").replace("_", " ")
    rows.append((name.lower(), name, a or "ไม่ระบุชื่อ (ดูหน้าต้นทาง)", l, p))
rows.sort()
body = "".join(f'<tr><td><a href="{E(p)}" rel="nofollow noopener">{E(n[:90])}</a></td><td>{E(a[:70])}</td><td>{E(l)}</td></tr>' for _, n, a, l, p in rows)
page = f'''<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>เครดิตรูปภาพและแผนที่ – Nihontabi</title><meta name="robots" content="noindex,follow"><link rel="canonical" href="https://nihontabi.web.app/credits.html">
<style>:root{{color-scheme:light dark}}body{{font:15px/1.65 system-ui,"Noto Sans Thai",sans-serif;max-width:980px;margin:0 auto;padding:24px 16px 64px}}h1{{font-size:24px}}table{{border-collapse:collapse;width:100%;font-size:13.5px}}td,th{{border-bottom:1px solid #8884;padding:5px 6px;text-align:left;vertical-align:top}}a{{color:#c0392b}}</style></head><body>
<p><a href="/">← กลับไปหน้าวางแผน</a></p><h1>เครดิตรูปภาพและแผนที่</h1>
<p>รูปถ่ายสถานที่ส่วนใหญ่ในเว็บนี้มาจาก <a href="https://commons.wikimedia.org/">Wikimedia Commons</a> ภายใต้ใบอนุญาตครีเอทีฟคอมมอนส์ (CC BY, CC BY-SA) หรือสาธารณสมบัติ ขอบคุณผู้ถ่ายทุกท่าน ตารางด้านล่างระบุผู้ถ่าย ใบอนุญาต และลิงก์ไปหน้าต้นทางของรูปที่ใช้ รูปถูกย่อและตัดเป็นอัตราส่วนสำหรับแสดงผล ไม่ได้แก้ไขเนื้อหาอื่น หากพบข้อผิดพลาดหรือต้องการให้นำรูปออก ติดต่อได้ที่ <a href="mailto:natchanon@infinitysolutions.co.th">natchanon@infinitysolutions.co.th</a></p>
<p>แผนที่พื้นหลัง: © ผู้ร่วมจัดทำ <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (ข้อมูลภายใต้ ODbL)</p>
<p class="m">ทั้งหมด {len(rows)} รูป · ปรับปรุง 2026-11-19</p>
<table><tr><th>รูป (ไฟล์ต้นทาง)</th><th>ผู้ถ่าย</th><th>ใบอนุญาต</th></tr>{body}</table></body></html>'''
open("credits.html", "w", encoding="utf8").write(page)
print("credits rows", len(rows), "size KB", len(page) // 1024)
