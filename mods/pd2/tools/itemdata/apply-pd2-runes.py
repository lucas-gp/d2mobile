#!/usr/bin/env python3
"""
Applique les effets PD2 des runes par emplacement (wiki Runes, valeurs actuelles ; données tools/itemdata/pd2-runes.json
produites par extract-pd2.py) aux lignes RUNES de src/data/items/runes.ts. Idempotent. (Gemmes : valeurs PD2 identiques à D2, déjà en place.)

    python3 mods/pd2/tools/itemdata/apply-pd2-runes.py [--report]

Colonnes du wiki : Weapon → weapon, Chest/Helm → armor, Shield/Quiver → shield. Les effets sans statistique simulée
(endurance, anti-soin, aveuglement, fuite, dégâts de blessures ouvertes) sont omis et listés. Niveau requis : celui du
wiki ; « -- » (Hel, D2 levelreq 0) → 1 (aucune contrainte), le niveau de rune (qlvl) restant celui de la rangée D2.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pd2text as T  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
PATH = os.path.join(ROOT, 'src/data/items/runes.ts')
REPORT = '--report' in sys.argv
DATA = json.load(open(os.path.join(HERE, 'pd2-runes.json')))


def stats(phrases, log, where):
    out = []
    for ph in phrases:
        got = T.parse(ph)
        if not got:
            log.append('%s : non simulé « %s »' % (where, ph))
        for st, lo, hi, par in got:
            out.append("f('%s', %s%s)" % (st, T.fmt_num(lo), ", '%s'" % par if par else ''))
    return '[' + ', '.join(out) + ']'


# niveau de la rune dans Misc.txt (D2) quand le wiki n'affiche pas de niveau requis
QLVL_D2 = {'Hel': 33}
src = open(PATH).read()
log = []
LINE = re.compile(r"^  \{ id: '(r\d\d)', name: '(\w+)', rank: (\d+), (?:qlvl: \d+, )?reqLvl: (\d+), weapon: .*\},$", re.M)


def repl(m):
    rid, name, rank, req = m.group(1), m.group(2), int(m.group(3)), int(m.group(4))
    w = DATA.get(name)
    if not w:
        sys.exit('rune absente du wiki : ' + name)
    lvl = w['level']
    q = '' if lvl is not None else 'qlvl: %d, ' % QLVL_D2[name]
    return "  { id: '%s', name: '%s', rank: %d, %sreqLvl: %d, weapon: %s, armor: %s, shield: %s }," % (
        rid, name, rank, q, lvl if lvl is not None else 1, stats(w['weapon'], log, name + ' arme'), stats(w['armor'], log, name + ' armure'), stats(w['shield'], log, name + ' bouclier'))


new = LINE.sub(repl, src)
assert len(LINE.findall(src)) == 33, 'lignes de runes introuvables'

if REPORT:
    print('\n'.join(log))
    sys.exit(0)
open(PATH, 'w').write(new)
print('runes : %d lignes ; effets non simulés : %d' % (33, len(log)))
