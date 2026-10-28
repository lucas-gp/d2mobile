#!/usr/bin/env python3
"""
Applique les dégâts et défenses de base de Project Diablo 2 (wiki Item_Bases, colonne « After » ; données
tools/itemdata/pd2-bases.json produites par extract-pd2.py) aux bases du jeu : bases.ts, bases-classes.ts (à relancer
après gen-bases.py), EXTRA_BASES de uniques.ts et bases de sets.ts. Idempotent. Châsses maximales : table PD2 par palier d'ilvl (maxSockets + socketTiers).

    python3 mods/pd2/tools/itemdata/apply-pd2-bases.py [--report]

- Épées à deux mains : la valeur « deux mains » (la première du wiki) ; armes de jet et javelots : lancer → missileDmg,
  mêlée → dmg.
- Arcs : le wiki précise que la saison 11 a augmenté les dégâts de base des arcs de 20 % (30 % pour les arcs
  matriarcaux) mais que seul le palier élite du tableau a été mis à jour : les arcs normaux et exceptionnels reçoivent
  donc ×1,2 (arrondi) sur la valeur « After » du tableau, comme l'élite (ex. Arc d'hydre 12-83 → 14-100).
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pd2wiki  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
FILES = ['bases.ts', 'bases-classes.ts', 'uniques.ts', 'sets.ts']
REPORT = '--report' in sys.argv
DATA = json.load(open(os.path.join(HERE, 'pd2-bases.json')))
# arcs normaux et exceptionnels (tableau non mis à jour depuis la saison 11)
BOW_S11 = {'Short Bow', 'Hunter’s Bow', "Hunter's Bow", 'Long Bow', 'Composite Bow', 'Short Battle Bow', 'Long Battle Bow', 'Short War Bow', 'Long War Bow',
           'Edge Bow', 'Razor Bow', 'Cedar Bow', 'Double Bow', 'Short Siege Bow', 'Large Siege Bow', 'Rune Bow', 'Gothic Bow', 'Stag Bow', 'Reflex Bow',
           'Ashwood Bow', 'Ceremonial Bow'}

texts = {f: open(os.path.join(ROOT, 'src/data/items', f)).read() for f in FILES}
known = set()
for t in texts.values():
    known |= set(re.findall(r"id: '(\w+)'", t))


def entry(bid):
    """(fichier, début, fin) du bloc mk({…}) / {…} de la base."""
    for f, t in texts.items():
        m = re.search(r"id: '%s'," % bid, t)
        if not m:
            continue
        start = t.rfind('\n', 0, m.start()) + 1
        end = t.find('\n  mk(', m.end())
        end2 = t.find('\n  {', m.end())
        ends = [e for e in (end, end2, t.find('\n];', m.end())) if e > 0]
        return f, start, min(ends)
    return None


def setfield(bid, field, val, log):
    e = entry(bid)
    if not e:
        return
    f, a, b = e
    block = texts[f][a:b]
    m = re.search(r'\b%s: \[(\d+), (\d+)\]' % field, block)
    if not m:
        log.append('%s : champ %s absent' % (bid, field))
        return
    cur = [int(m.group(1)), int(m.group(2))]
    if cur == val:
        return 0
    block = block[:m.start()] + '%s: [%d, %d]' % (field, val[0], val[1]) + block[m.end():]
    texts[f] = texts[f][:a] + block + texts[f][b:]
    log.append('%s.%s %s → %s' % (bid, field, cur, val))
    return 1


def setsockets(bid, tiers, log):
    """maxSockets = palier 41+, socketTiers = les trois paliers d'ilvl."""
    f, a, b = entry(bid)
    block = texts[f][a:b]
    new = 'maxSockets: %d, socketTiers: [%d, %d, %d]' % (tiers[2], *tiers)
    m = re.search(r'maxSockets: \d+(?:, socketTiers: \[\d+, \d+, \d+\])?', block)
    if m:
        if m.group(0) == new:
            return 0
        old = m.group(0)
        block = block[:m.start()] + new + block[m.end():]
    else:
        m = re.search(r'\b(?:dmg|defense): \[\d+, \d+\]', block)
        if not m:
            log.append('%s : ni dégâts ni défense pour placer les châsses' % bid)
            return 0
        old = '(défaut)'
        block = block[:m.end()] + ', ' + new + block[m.end():]
    texts[f] = texts[f][:a] + block + texts[f][b:]
    log.append('%s %s → %s' % (bid, old, new))
    return 1


log, missing = [], []
n_dmg = n_def = 0
for name, v in sorted(DATA['damage'].items()):
    ids = pd2wiki.base_ids(name, known)
    if not ids:
        missing.append(name)
        continue
    after = v['after']
    if name in BOW_S11:
        after = [[round(x * 1.2) for x in after[0]]]
    for bid in ids:
        blk = entry(bid)
        body = texts[blk[0]][blk[1]:blk[2]]
        if 'missileDmg' in body and len(after) > 1:
            n_dmg += bool(setfield(bid, 'missileDmg', after[0], log))
            n_dmg += bool(setfield(bid, 'dmg', after[1], log))
        elif 'dmg:' in body:
            n_dmg += bool(setfield(bid, 'dmg', after[0], log))
for name, v in sorted(DATA['defense'].items()):
    ids = pd2wiki.base_ids(name, known)
    if not ids:
        missing.append(name)
        continue
    for bid in ids:
        n_def += bool(setfield(bid, 'defense', v['after'], log))

n_sock = 0
for name, tiers in sorted(DATA['sockets'].items()):
    for bid in pd2wiki.base_ids(name, known):
        n_sock += setsockets(bid, tiers, log)

if REPORT:
    print('\n'.join(log))
    print('dégâts modifiés :', n_dmg, '; défenses modifiées :', n_def, '; châsses :', n_sock, '; absentes du jeu :', sorted(set(missing)))
    sys.exit(0)
texts['bases-classes.ts'] = texts['bases-classes.ts'].replace('tools/itemdata/gen-bases.py (valeurs D2 1.13 pour les armes, PD2 S13 pour les armures) : ne pas\n * modifier à la main.',
                                                              'tools/itemdata/gen-bases.py (tables D2 1.13) puis apply-pd2-bases.py (dégâts et\n * défenses PD2 S13) : ne pas modifier à la main.')
for f, t in texts.items():
    open(os.path.join(ROOT, 'src/data/items', f), 'w').write(t)
print('dégâts modifiés :', n_dmg, '; défenses modifiées :', n_def, '; châsses :', n_sock, '; absentes du jeu :', len(set(missing)))
