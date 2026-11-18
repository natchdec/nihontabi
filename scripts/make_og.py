"""Render og/<hub>.jpg (1200x630) with headless Chrome (correct Thai shaping) and PWA icons with Pillow.
usage: python scripts/make_og.py   (run from repo root; needs Chrome and Pillow)"""
import os, subprocess, tempfile, pathlib
from PIL import Image, ImageDraw, ImageFont
CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe"
ROOT = pathlib.Path(".").resolve()
HUBS = {"tokyo": ("โตเกียว", "東京"), "osaka": ("โอซาก้า", "大阪"), "sendai": ("เซนได", "仙台"), "nagoya": ("นาโกย่า", "名古屋"), "fukuoka": ("ฟุกุโอกะ", "福岡"), "sapporo": ("ซัปโปโร", "札幌")}
os.makedirs("og", exist_ok=True); os.makedirs("icons", exist_ok=True)
def html(title, sub, kanji, bg):
    return f"""<!doctype html><meta charset=utf-8><style>*{{margin:0;box-sizing:border-box}}body{{width:1200px;height:630px;position:relative;overflow:hidden;font-family:'Leelawadee UI','Yu Gothic',sans-serif;color:#fff;background:#1e2434}}
.bg{{position:absolute;inset:0;background:url('{bg}') center/cover;filter:blur(2px)}}.ov{{position:absolute;inset:0;background:rgba(14,18,30,.78)}}
.k{{position:absolute;left:70px;top:40px;font:700 190px 'Yu Gothic';color:#464e64}}.logo{{position:absolute;left:70px;top:90px;display:flex;align-items:center;gap:20px;font:700 48px 'Leelawadee UI'}}
.logo i{{width:80px;height:80px;border-radius:50%;background:#e74c3c;display:grid;place-items:center;font:700 56px 'Yu Gothic';font-style:normal}}
h1{{position:absolute;left:70px;top:300px;font:700 84px/1.2 'Leelawadee UI'}}p{{position:absolute;left:70px;top:440px;font:40px 'Leelawadee UI';color:#c8d0e2}}.u{{position:absolute;left:70px;top:560px;font:32px 'Leelawadee UI';color:#ff7a6b}}</style>
<div class=bg></div><div class=ov></div><div class=k>{kanji}</div><div class=logo><i>旅</i>Nihontabi</div><h1>{title}</h1><p>{sub}</p><div class=u>nihontabi.web.app</div>"""
def card(out, title, sub, kanji, bgfile):
    d = pathlib.Path(tempfile.mkdtemp()); f = d / "c.html"; png = d / "c.png"
    f.write_text(html(title, sub, kanji, (ROOT / bgfile).as_uri()), encoding="utf8")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--screenshot={png}", "--window-size=1200,630", "--virtual-time-budget=3000", f.as_uri()], check=True, capture_output=True, timeout=90)
    Image.open(png).convert("RGB").crop((0, 0, 1200, 630)).save(out, "JPEG", quality=84, optimize=True)
card("og/default.jpg", "วางแผนเที่ยวญี่ปุ่น", "6 เมืองฐาน · แพลน แผนที่ พาส ราคา", "日本", "img/tokyo_wide2.webp")
for h, (t, k) in HUBS.items(): card(f"og/{h}.jpg", f"เที่ยวญี่ปุ่นจาก{t}", "ที่เที่ยวไป-กลับ วิธีเดินทาง เดือนที่เหมาะ และราคา", k, f"img/{h}_wide2.webp")
for n in (192, 512):
    im = Image.new("RGB", (n, n), (231, 76, 60)); d = ImageDraw.Draw(im); f = ImageFont.truetype("C:/Windows/Fonts/YuGothB.ttc", int(n * .62)); w = d.textlength("旅", font=f)
    d.text(((n - w) / 2, n * .12), "旅", font=f, fill="white"); im.save(f"icons/icon-{n}.png")
print("ok")
