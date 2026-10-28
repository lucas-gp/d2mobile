#!/usr/bin/env python3
"""
Applique les propriétés et bonus de set de Project Diablo 2 (colonne « After » de wiki.projectdiablo2.com/wiki/All_Set_Items)
à src/data/items/sets-d2.ts. Idempotent pour les nouvelles pièces (ignorées si l'id existe déjà ; elles étaient jadis dupliquées à chaque relance). À lancer après gen-uniques.py :
    python3 mods/pd2/tools/itemdata/apply-pd2-sets.py tools/itemdata/pd2-sets.json
Format du JSON : {"sets": {setId: {"items": {pieceId: {"mods": [[stat,min,max?,param?]…], "partial": [{"count":2,"with":[ids]?, "mods":[…]}]}}, "bonuses": [{"count","mods"}]}},
                  "newPieces": {setId: [{"id","nameFr","base","lvl","reqLvl","mods","partial"}]}}
"""
import json, re, sys, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
PATH = os.path.join(ROOT, 'src/data/items/sets-d2.ts')
data = json.load(open(sys.argv[1]))


def num(v):
    return str(int(v)) if float(v) == int(v) else repr(round(float(v), 3))


def mod(t):
    stat, lo = t[0], t[1]
    hi, par = lo, None
    for x in t[2:]:
        if isinstance(x, str):
            par = x
        else:
            hi = x
    a = "r('%s', %s" % (stat, num(lo))
    if hi != lo or par:
        a += ', ' + num(hi)
    if par:
        a += ", '%s'" % par
    return a + ')'


def mods(l):
    return '[' + ', '.join(mod(t) for t in l) + ']'


def partial(ps):
    out = []
    for p in ps:
        w = (" with: [%s]," % ', '.join("'%s'" % x for x in p['with'])) if p.get('with') else ''
        out.append('{ count: %d,%s mods: %s }' % (p['count'], w, mods(p['mods'])))
    return '[' + ', '.join(out) + ']'


src = open(PATH).read()
pieces = {pid: (sid, pd) for sid, sd in data['sets'].items() for pid, pd in sd['items'].items()}
lines = src.split('\n')
out = []
for ln in lines:
    m = re.match(r"^(  \{ id: '(s_\w+)', .*?), mods: \[.*\] ?(?:, partial: .*)? ?\},$", ln)
    if m and m.group(2) in pieces:
        pd = pieces[m.group(2)][1]
        pt = (', partial: ' + partial(pd['partial'])) if pd.get('partial') else ''
        ln = "%s, mods: %s%s }," % (m.group(1), mods(pd['mods']), pt)
    out.append(ln)
src = '\n'.join(out)

# nouvelles pièces : ajoutées à la fin de D2_SET_ITEMS
add = []
for sid, lst in data.get('newPieces', {}).items():
    for n in lst:
        if "{ id: '%s'" % n['id'] in src:  # idempotence : ne pas réajouter une pièce déjà présente
            continue
        pt = (', partial: ' + partial(n['partial'])) if n.get('partial') else ''
        add.append("  { id: '%s', name: %s, set: '%s', base: '%s', lvl: %d, reqLvl: %d, rarity: 7, mods: %s%s }," % (
            n['id'], json.dumps(n['nameFr'], ensure_ascii=False), sid, n['base'], n['lvl'], n['reqLvl'], mods(n['mods']), pt))
if add:
    src = src.replace('\n];\n\nexport const D2_SETS', '\n' + '\n'.join(add) + '\n];\n\nexport const D2_SETS', 1)

# set : liste des pièces et bonus
for sid, sd in data['sets'].items():
    new_ids = [n['id'] for n in data.get('newPieces', {}).get(sid, [])]
    m = re.search(r"(    id: '%s',\n    name: [^\n]*\n    items: \[)([^\]]*)(\],\n    bonuses: )\[.*\](,\n  \},)" % re.escape(sid), src)
    if not m:
        print('set introuvable', sid)
        continue
    items = m.group(2) + ''.join(", '%s'" % i for i in new_ids if "'%s'" % i not in m.group(2))
    bon = '[' + ', '.join('{ count: %d, mods: %s }' % (b['count'], mods(b['mods'])) for b in sd['bonuses']) + ']'
    src = src[:m.start()] + m.group(1) + items + m.group(3) + bon + m.group(4) + src[m.end():]
open(PATH, 'w').write(src)
print('ok')
