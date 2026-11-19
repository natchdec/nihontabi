"""Tag foliage (ใบไม้เปลี่ยนสี) modules and plans, then (separately) run engine/gen_foliage_plans.js per hub and merge.
usage: python scripts/tag_foliage.py   (from repo root; idempotent: strips old foliage tags and -mj- plans first)"""
import json, re, glob, subprocess, sys
KW = re.compile(r'ใบไม้เปลี่ยนสี|ใบไม้แดง|ใบเมเปิล|เมเปิล|แปะก๊วย|แปะก๋วย|ใบไม้สี|紅葉|koyo|momiji|foliage|ginkgo', re.I)
NEG = re.compile(r'ไม่มี|ร่วงแล้ว|หมดแล้ว|ยังไม่บาน|ไม่ค่อย|นอกฤดู|ใบไม้ร่วง')
def hits(mo):
    return [k for k in ('sep', 'oct', 'nov', 'dec') if (mo.get(k) or {}).get('score', 0) >= 4 and KW.search(str((mo.get(k) or {}).get('note', ''))) and not NEG.search(str((mo.get(k) or {}).get('note', '')).split(';')[0])]
def tag_mods(mods, extra=None):
    tagged = {}
    for m in mods:
        if m.get('kind') in ('arrival', 'departure'): continue
        m.pop('momijiMonths', None); m['themes'] = [t for t in (m.get('themes') or []) if t != 'foliage']
        mo = dict(m.get('months') or {})
        for k, v in ((extra or {}).get(m['id']) or {}).items(): mo.setdefault(k, v)
        strong = bool(KW.search(m.get('title', '') + ' ' + m.get('pitch', '')))
        hit = hits(mo)
        if strong or len(hit) >= 2 or (extra and any((mo.get(k) or {}).get('score', 0) >= 5 for k in hit)):
            months = hit or [k for k in ('oct', 'nov') if (mo.get(k) or {}).get('score', 0) >= 4]
            if months: m['momijiMonths'] = months; m['themes'].append('foliage'); tagged[m['id']] = months
    return tagged
def tag_plans(plans, tagged):
    n = 0
    for p in plans:
        p['themes'] = [t for t in (p.get('themes') or []) if t != 'foliage']
        ids = [x.get('mod') for x in p.get('days', []) if x.get('mod')]; t = sum(1 for i in ids if i in tagged)
        pm = set(p.get('months') or []); ok = (not pm) or bool(pm & {'sep', 'oct', 'nov', 'dec'})
        if ok and (KW.search(p.get('title', '') + ' ' + p.get('tagline', '')) or (ids and t >= max(2, len(ids) // 3))): p['themes'].append('foliage'); n += 1
    return n
HUBS = ['tokyo', 'osaka', 'sendai', 'nagoya', 'fukuoka', 'sapporo']
core = json.load(open('data/modules.json', encoding='utf8')); core_t = tag_mods(core, json.load(open('data/hub_tokyo.json', encoding='utf8'))['hub']['monthsExtra'])
json.dump(core, open('data/modules.json', 'w', encoding='utf8'), ensure_ascii=False)
hand = json.load(open('data/plans.json', encoding='utf8'))
for hub in HUBS:
    p = f'data/hub_{hub}.json'; d = json.load(open(p, encoding='utf8')); h = d['hub']
    tagged = tag_mods(h['mods']); allt = dict(tagged); 
    if hub == 'tokyo': allt.update(core_t); print('tokyo hand plans tagged', tag_plans(hand, allt))
    h['plans'] = [x for x in h['plans'] if '-mj-' not in x['id']]; n = tag_plans(h['plans'], allt)
    json.dump(d, open(p, 'w', encoding='utf8'), ensure_ascii=False); print(hub, 'modules', len(tagged) + (len(core_t) if hub == 'tokyo' else 0), 'plans tagged', n)
json.dump(hand, open('data/plans.json', 'w', encoding='utf8'), ensure_ascii=False)
for hub in HUBS:
    subprocess.run(['node', 'engine/gen_foliage_plans.js', hub], check=True)
    d = json.load(open(f'data/hub_{hub}.json', encoding='utf8')); new = json.load(open(f'data/gen_foliageplans_{hub}.json', encoding='utf8'))
    d['hub']['plans'] += new; json.dump(d, open(f'data/hub_{hub}.json', 'w', encoding='utf8'), ensure_ascii=False); print(hub, 'generated', len(new))
