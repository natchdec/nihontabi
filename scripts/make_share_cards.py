"""Render share/<hub>.jpg (1080x1350, LINE/IG friendly) listing top day trips per hub. Needs Chrome + Pillow. Run from repo root."""
import json, os, re, subprocess, tempfile, pathlib, html
from PIL import Image
CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe"
ROOT = pathlib.Path(".").resolve()
HUBS = {"tokyo": ("โตเกียว", "Ueno"), "osaka": ("โอซาก้า", "Namba"), "sendai": ("เซนได", "Sendai"), "nagoya": ("นาโกย่า", "Nagoya Station"), "fukuoka": ("ฟุกุโอกะ", "Hakata"), "sapporo": ("ซัปโปโร", "Sapporo")}
MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
pop = json.load(open("data/popularity.json", encoding="utf8")); pop.update(json.load(open("data/popularity_v3.json", encoding="utf8")))
os.makedirs("share", exist_ok=True); E = html.escape
for hub, (th, base) in HUBS.items():
    H = json.load(open(f"data/hub_{hub}.json", encoding="utf8"))["hub"]; mods = list(H["mods"])
    if hub == "tokyo": mods += json.load(open("data/modules.json", encoding="utf8"))
    cand = []
    for m in mods:
        if m.get("kind") in ("arrival", "departure"): continue
        fh = m.get("fromHub") or m.get("fromUeno") or {}; mn = fh.get("minutes")
        if not mn or mn > 120: continue
        sc = (pop.get(m["id"]) or {}).get("p", 0); t = m.get("title", ""); short = (t.split(":")[0] if ":" in t else t).strip()
        best = [MON[i] for i, k in enumerate(KEYS) if ((m.get("months") or {}).get(k) or {}).get("score", 0) >= 5][:3]
        cand.append((-sc, mn, short[:34], best))
    seen, top = set(), []
    for c in sorted(cand):
        if c[2] in seen: continue
        seen.add(c[2]); top.append(c)
        if len(top) == 6: break
    rows = "".join(f'<div class=r><i>{n}</i><b>{E(nm)}</b><span>{mn} นาที{(" · ดีสุด " + " ".join(b)) if b else ""}</span></div>' for n, (_, mn, nm, b) in enumerate(top, 1))
    bg = (ROOT / f"img/{hub}_wide2.webp").as_uri()
    page = f"""<!doctype html><meta charset=utf-8><style>*{{margin:0;box-sizing:border-box}}body{{width:1080px;height:1350px;position:relative;overflow:hidden;font-family:'Leelawadee UI','Yu Gothic',sans-serif;color:#fff;background:#1e2434}}
.bg{{position:absolute;inset:0;background:url('{bg}') center/cover;filter:blur(3px)}}.ov{{position:absolute;inset:0;background:rgba(14,18,30,.82)}}
.t{{position:absolute;left:70px;top:90px;right:70px}}.t small{{font-size:34px;color:#ff9a8d}}.t h1{{font:700 86px/1.15 'Leelawadee UI';margin-top:10px}}.t p{{font-size:34px;color:#c8d0e2;margin-top:14px}}
.l{{position:absolute;left:70px;right:70px;top:480px}}.r{{display:flex;align-items:center;gap:24px;padding:22px 0;border-bottom:2px solid rgba(255,255,255,.14)}}.r i{{font:700 44px 'Leelawadee UI';font-style:normal;width:64px;height:64px;border-radius:50%;background:#e74c3c;display:grid;place-items:center;flex:none}}
.r b{{font:700 44px 'Leelawadee UI';flex:1}}.r span{{font-size:30px;color:#c8d0e2;text-align:right}}.f{{position:absolute;left:70px;right:70px;bottom:70px;font-size:36px;color:#ff7a6b}}</style>
<div class=bg></div><div class=ov></div><div class=t><small>Nihontabi · นอนเมืองเดียว เที่ยวไป-กลับ</small><h1>เที่ยวญี่ปุ่นจาก{E(th)}</h1><p>6 ที่เด่นไป-เช้าเย็นกลับ (ฐาน {E(base)})</p></div><div class=l>{rows}</div><div class=f>nihontabi.web.app/guide/{hub}/</div>"""
    d = pathlib.Path(tempfile.mkdtemp()); f = d / "c.html"; png = d / "c.png"; f.write_text(page, encoding="utf8")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--screenshot={png}", "--window-size=1080,1350", "--virtual-time-budget=3000", f.as_uri()], check=True, capture_output=True, timeout=90)
    Image.open(png).convert("RGB").crop((0, 0, 1080, 1350)).save(f"share/{hub}.jpg", "JPEG", quality=84, optimize=True); print(hub, len(top), "rows")
