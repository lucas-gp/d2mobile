#!/usr/bin/env python3
"""
Met à jour les résistances des monstres (res: [Normal, Cauchemar, Enfer]) dans src/data/monsters.ts
d'après MonStats.txt de Project Diablo 2 (S13), lu depuis D2DATA/../s13 ou D2DATA/MonStats.txt.
Correspondance entre nos monstres et les lignes MonStats : voir MAP.

    D2DATA=/chemin python3 tools/itemdata/gen-monres.py
"""
import csv, os, re, sys

D = os.environ.get('D2DATA')
if not D:
    sys.exit('D2DATA requis')
path = os.path.join(D, 'MonStats13.txt') if os.path.exists(os.path.join(D, 'MonStats13.txt')) else os.path.join(D, 'MonStats.txt')
rows = {r['Id']: r for r in csv.DictReader(open(path, encoding='latin-1'), delimiter='\t')}
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
P = os.path.join(ROOT, 'src/data/monsters.ts')
src = open(P).read()

MAP = {'fallen': 'fallen1', 'fallen_shaman': 'fallenshaman1', 'zombie': 'zombie1', 'skeleton': 'skeleton1', 'skeleton_archer': 'skeleton2', 'griswold': 'griswold',
       'mummy': 'mummy1', 'greater_mummy': 'mummy2', 'scarab': 'scarab1', 'duriel': 'duriel', 'hell_bovine': 'hellbovine', 'cow_king': 'CowBoss', 'minion_destruction': 'minion1',
       'venom_lord': 'venomlord', 'blood_lord': 'bloodlord1', 'baal': 'baalthrone', 'diablo': 'diablo', 'unraveler': 'unraveler5', 'warped_shaman': 'fallenshaman5', 'burning_dead': 'skeleton4', 'council_member': 'baalhighpriest', 'oblivion_knight': 'doomknight3', 'storm_caster': 'fingermage3',
       'ghoul': 'zombie3', 'dark_stalker': 'corruptrogue3', 'countess': 'corruptrogue3', 'andariel': 'andariel', 'mephisto': 'mephisto'}
COL = [('phys', 'ResDm'), ('magic', 'ResMa'), ('fire', 'ResFi'), ('light', 'ResLi'), ('cold', 'ResCo'), ('poison', 'ResPo')]


def n(x):
    x = (x or '').strip()
    return int(x) if x else 0


for our, ms in MAP.items():
    r = rows[ms]
    ent = {}
    for el, c in COL:
        v = [n(r[c]), n(r[c + '(N)']), n(r[c + '(H)'])]
        if any(v):
            ent[el] = v
    res = '{ ' + ', '.join('%s: [%d, %d, %d]' % (k, *v) for k, v in ent.items()) + ' }' if ent else '{}'
    m = re.search(r"    id: '%s',(.*?)\n    res: \{[^\n]*\},\n" % re.escape(our), src, re.S)
    if not m:
        print('pas de res pour', our)
        continue
    src = src[:m.start()] + m.group(0)[:m.group(0).index('    res:')] + '    res: %s,\n' % res + src[m.end():]
    print(our, res)
open(P, 'w').write(src)
