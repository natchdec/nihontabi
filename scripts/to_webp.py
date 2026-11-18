"""Convert img/**/*.jpg (except hubph) to .webp and rewrite references in index.html and data/*.json.
usage: python scripts/to_webp.py   (run from repo root; keeps no .jpg after success)"""
import os, re, glob, json
from PIL import Image
Q = 74
files = [f for f in glob.glob("img/**/*.jpg", recursive=True) if "hubph" not in f.replace("\\", "/")]
before = after = 0; names = set(); converted = []
for f in files:
    f = f.replace("\\", "/"); out = f[:-4] + ".webp"
    im = Image.open(f).convert("RGB")
    if max(im.size) > 16383:
        print("skip (too large for webp):", f, im.size); continue
    converted.append(f); im.save(out, "WEBP", quality=Q, method=5)
    before += os.path.getsize(f); after += os.path.getsize(out); names.add(os.path.basename(f)[:-4])
print(f"{len(converted)} files {before/1e6:.1f} MB -> {after/1e6:.1f} MB")
pat = re.compile(r'(?<=["/])(' + "|".join(sorted(map(re.escape, names), key=len, reverse=True)) + r')\.jpg')
tot = 0
for p in ["index.html"] + glob.glob("data/*.json"):
    s = open(p, encoding="utf8").read(); s2, n = pat.subn(r"\1.webp", s)
    if n: open(p, "w", encoding="utf8").write(s2); tot += n
print("references rewritten:", tot)
for f in converted: os.remove(f)
