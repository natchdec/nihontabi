"""Cut every referenced atlas cell (atNN:k) into its own small webp: img/p/NN_k.webp.
usage: python scripts/split_atlas.py <dir-with-original-atlas-jpgs>   (run from repo root)"""
import re, glob, os, sys, json
from PIL import Image
src = sys.argv[1]
AT = json.loads(re.search(r'const AT = (\{[^}]*\})', open("index.html", encoding="utf8").read()).group(1))
cells = set()
for p in ["index.html"] + glob.glob("data/*.json"):
    for n, k in re.findall(r'\bat(\d+):(\d+)\b', open(p, encoding="utf8").read()): cells.add((n, int(k)))
os.makedirs("img/p", exist_ok=True)
byat = {}
for n, k in cells: byat.setdefault(n, []).append(k)
made = tot = miss = 0
for n, ks in sorted(byat.items()):
    name = AT.get(n)
    if not name: miss += len(ks); print("no atlas for", n); continue
    f = os.path.join(src, "img", name[:-5] + ".jpg")
    if not os.path.exists(f): miss += len(ks); print("missing original", f); continue
    im = Image.open(f).convert("RGB")
    for k in ks:
        box = ((k % 6) * 448, (k // 6) * 280, (k % 6) * 448 + 448, (k // 6) * 280 + 280)
        if box[2] > im.width or box[3] > im.height: miss += 1; continue
        out = f"img/p/{n}_{k}.webp"; im.crop(box).save(out, "WEBP", quality=78, method=5); made += 1; tot += os.path.getsize(out)
print(f"cells {len(cells)} made {made} missing {miss} total {tot/1e6:.1f} MB avg {tot/max(made,1)/1024:.1f} KB")
