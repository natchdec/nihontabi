"""Build data/seasons.json from JMA phenological observation CSVs (sakura bloom/full bloom, maple colouring, ginkgo yellowing).
Source: https://www.data.jma.go.jp/sakura/data/download_ruinenchi.html (Japan Meteorological Agency, Public Data License 1.0; processed by Nihontabi).
Per station: 1991-2020 mean date, std dev, last-10-year mean, observed values of the latest years (incl. the current year when already observed).
Station coordinates/English names come from data/season_stations.json (cached; missing ones are geocoded once with OpenStreetMap Nominatim)."""
import csv, io, json, math, os, re, sys, time, urllib.parse, urllib.request
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
UA = 'NihontabiPlanner/1.0 (hobby trip planner; phenology data)'
ITEMS = {'bloom': '004', 'full': '005', 'ginkgo': '013', 'maple': '015'}
BASE = 'https://www.data.jma.go.jp/sakura/data/ruinenchi/%s.csv'
MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
def doy(v, prev_dec_ok):
    m, d = v // 100, v % 100
    if m < 1 or m > 12 or d < 1 or d > MD[m - 1]: return None
    x = sum(MD[:m - 1]) + d
    if prev_dec_ok and m >= 11: x -= 365
    return x
def fmt(x):
    x = round(x)
    if x <= 0: x += 365
    m = 0
    while x > MD[m]: x -= MD[m]; m += 1
    return '%02d-%02d' % (m + 1, x)
def get(u):
    for i in range(3):
        try: return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA}), timeout=60).read()
        except Exception: time.sleep(4)
    raise SystemExit('download failed ' + u)
data = {}; last_year = 0
for key, code in ITEMS.items():
    rows = list(csv.reader(io.StringIO(get(BASE % code).decode('shift_jis', errors='replace'))))
    hdr = next(r for r in rows if r and r[0].strip() == '番号'); years = [int(x) for x in hdr[2::2] if x.strip().isdigit()]
    for r in rows[rows.index(hdr) + 1:]:
        if len(r) < 4 or not r[0].strip().isdigit(): continue
        sid, name = int(r[0]), re.sub(r'[\s\u3000]+', '', r[1])
        vals = {}
        for i, y in enumerate(years):
            try: v = int(r[2 + 2 * i])
            except Exception: continue
            if v <= 0: continue
            x = doy(v, key in ('bloom', 'full'))
            if x is not None: vals[y] = x; last_year = max(last_year, y)
        data.setdefault(sid, {'id': sid, 'jp': name})[key] = vals
# Nominatim picked the wrong place for these names: fixed by hand (lat, lon, English name)
OVERRIDE = {'浦河': (42.1617, 142.7742, 'Urakawa'), '紋別': (44.3564, 143.3542, 'Monbetsu'), '輪島': (37.3905, 136.8990, 'Wajima'), '相川': (38.0333, 138.2333, 'Aikawa (Sado)'), '高田': (37.1119, 138.2511, 'Takada (Joetsu)'), '大島': (34.7500, 139.3600, 'Izu Oshima'), '八丈島': (33.1100, 139.7900, 'Hachijojima'), '西郷': (36.2000, 133.3300, 'Saigo (Oki)'), '舞鶴': (35.4750, 135.3850, 'Maizuru'), '福岡': (33.5902, 130.4017, 'Fukuoka'), '福江': (32.6990, 128.8400, 'Fukue (Goto)'), '名瀬': (28.3800, 129.4900, 'Naze (Amami)'), '東京': (35.6895, 139.6917, 'Tokyo')}
cache = {}
if os.path.exists('data/season_stations.json'): cache = {int(k): v for k, v in json.load(open('data/season_stations.json', encoding='utf8')).items()}
def geocode(jp):
    time.sleep(1.2)
    u = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': jp, 'format': 'json', 'limit': 1, 'countrycodes': 'jp', 'accept-language': 'en', 'addressdetails': 1, 'featuretype': 'city'})
    try: j = json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA}), timeout=40).read())
    except Exception: return None
    if not j: return None
    a = j[0].get('address', {}); en = a.get('city') or a.get('town') or a.get('village') or j[0].get('name') or jp
    return {'lat': round(float(j[0]['lat']), 4), 'lon': round(float(j[0]['lon']), 4), 'en': re.sub(r'\s*(City|Town)$', '', en)}
out = {'asOf': time.strftime('%Y-%m-%d'), 'lastYear': last_year, 'source': 'JMA phenological observations (ruinenchi CSV), processed', 'stations': []}
for sid, st in sorted(data.items()):
    ent = {'id': sid, 'jp': st['jp']}
    for key in ITEMS:
        v = st.get(key, {})
        base = [v[y] for y in range(1991, 2021) if y in v]
        if len(base) < 15: continue
        mean = sum(base) / len(base); sd = math.sqrt(sum((x - mean) ** 2 for x in base) / len(base))
        rec = [v[y] for y in range(last_year - 9, last_year + 1) if y in v]
        ent[key] = {'n': fmt(mean), 'sd': round(sd, 1), 'r10': fmt(sum(rec) / len(rec)) if len(rec) >= 5 else None, 'lo': fmt(min(base)), 'hi': fmt(max(base)), 'rec': {str(y): fmt(v[y]) for y in range(last_year - 5, last_year + 1) if y in v}}
    if not any(k in ent for k in ITEMS): continue
    if sid not in cache or cache[sid] is None:
        g = geocode(st['jp'] + ' Japan'); cache[sid] = g
        print('geocoded', st['jp'], g, flush=True)
    if st['jp'] in OVERRIDE:
        la, lo, en = OVERRIDE[st['jp']]; cache[sid] = {'lat': la, 'lon': lo, 'en': en}
    if not cache.get(sid): continue
    ent.update(cache[sid]); out['stations'].append(ent)
json.dump({str(k): v for k, v in cache.items()}, open('data/season_stations.json', 'w', encoding='utf8'), ensure_ascii=False)
json.dump(out, open('data/seasons.json', 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print('stations', len(out['stations']), 'lastYear', last_year)
