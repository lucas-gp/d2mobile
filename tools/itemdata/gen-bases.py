#!/usr/bin/env python3
"""
Génère src/data/items/bases-classes.ts : bases D2 (armes, boucliers, casques primitifs, têtes du
Nécromancien, armures…) absentes de bases.ts. Tables de départ : Weapons.txt (D2 1.13) et
Armor.txt (PD2 S13), lues depuis le dossier D2DATA (non versionné : données de jeu tierces).

    D2DATA=/chemin/vers/tables python3 tools/itemdata/gen-bases.py
"""
import csv, os, re, sys

D = os.environ.get('D2DATA')
if not D:
    sys.exit('D2DATA : dossier contenant Weapons.txt et Armor.txt')

FR = {}
def fr(en, f):
    FR[en] = f

exec(open(os.path.join(os.path.dirname(__file__), 'names-fr.py')).read())

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
existing = set()
for _f in ('bases.ts', 'uniques.ts', 'sets.ts', 'misc.ts', 'runes.ts'):
    existing |= set(re.findall(r"id: '(\w+)'", open(os.path.join(ROOT, 'src/data/items', _f)).read()))

SKIP = {"Khalim's Flail", 'KhalimFlail', 'SuperKhalimFlail', 'Horadric Malus', 'Hellforge Hammer', "Wirt's Leg", 'decoy dagger', 'Gidbinn', 'Horadric Staff',
        'Staff of the Kings', 'Boneweave [S]', 'Troll Belt [S]', 'Cap/hat', 'Rancid Gas Potion', 'Oil Potion', 'Choking Gas Potion', 'Exploding Potion', 'Strangling Gas Potion', 'Fulminating Potion'}
WTYPE = {'swor': 'sword', 'axe': 'axe', 'club': 'mace', 'mace': 'mace', 'hamm': 'mace', 'scep': 'scepter', 'knif': 'dagger', 'tkni': 'thrown', 'taxe': 'thrown', 'jave': 'javelin',
         'ajav': 'javelin', 'spea': 'spear', 'aspe': 'spear', 'pole': 'polearm', 'staf': 'staff', 'bow': 'bow', 'abow': 'bow', 'xbow': 'crossbow', 'wand': 'wand', 'orb': 'orb', 'h2h': 'claw', 'h2h2': 'claw'}
WCLASS = {'bow': ['amazon', 'merc'], 'xbow': ['amazon', 'merc'], 'abow': ['amazon'], 'aspe': ['amazon'], 'ajav': ['amazon'], 'spea': ['amazon', 'barbarian', 'merc'],
          'pole': ['barbarian', 'merc'], 'jave': ['amazon', 'barbarian'], 'tkni': ['barbarian', 'amazon', 'assassin'], 'taxe': ['barbarian', 'amazon', 'assassin'],
          'h2h': ['assassin'], 'h2h2': ['assassin'], 'scep': ['paladin'], 'orb': ['sorceress']}
ATYPE = {'helm': 'helm', 'tors': 'armor', 'shie': 'shield', 'glov': 'gloves', 'boot': 'boots', 'belt': 'belt', 'phlm': 'primal', 'ashd': 'shield', 'head': 'head'}
ACLASS = {'phlm': ['barbarian'], 'ashd': ['paladin'], 'head': ['necromancer']}
ICON = {'sword': 'sword', 'axe': 'axe', 'mace': 'mace', 'scepter': 'scepter', 'dagger': 'dagger', 'thrown': 'thrown', 'javelin': 'javelin', 'spear': 'spear', 'polearm': 'polearm',
        'staff': 'staff', 'bow': 'bow', 'crossbow': 'crossbow', 'wand': 'wand', 'orb': 'orb', 'claw': 'claw', 'helm': 'helm', 'armor': 'armor', 'shield': 'shield', 'gloves': 'gloves',
        'boots': 'boots', 'belt': 'belt', 'primal': 'primal', 'head': 'head'}


def snake(name):
    s = name.strip().lower().replace("'", '').replace("’", '')
    s = re.sub(r'[^a-z0-9]+', '_', s).strip('_')
    return s


def num(x, d=0):
    x = (x or '').strip()
    return int(float(x)) if x else d


out = []
seen = set()
for path, kind in ((os.path.join(D, 'Weapons.txt'), 'w'), (os.path.join(D, 'Armor.txt'), 'a')):
    for r in csv.DictReader(open(path, encoding='latin-1'), delimiter='\t'):
        name = (r.get('name') or '').strip()
        code = (r.get('code') or '').strip()
        typ = (r.get('type') or '').strip()
        if not name or not code or name in SKIP or name == 'Expansion':
            continue
        if kind == 'w':
            if typ not in WTYPE:
                continue
            t = WTYPE[typ]
            cls = WCLASS.get(typ)
        else:
            if typ not in ATYPE:
                continue
            t = ATYPE[typ]
            cls = ACLASS.get(typ)
        bid = snake(name)
        if typ == 'ashd' and name == 'Ancient Shield':
            bid = 'ancient_shield_sacred'
        if typ == 'head' and name == 'Demon Head':
            bid = 'demon_head_bone'
        if bid in existing or bid in seen:
            continue
        seen.add(bid)
        norm, uber, ultra = (r.get('normcode') or '').strip(), (r.get('ubercode') or '').strip(), (r.get('ultracode') or '').strip()
        tier = 0 if code == norm else 1 if code == uber else 2 if code == ultra else 0
        fname = FR.get(name, None)
        if fname is None:
            print('nom manquant :', name, file=sys.stderr)
            fname = name
        f = ["id: '%s'" % bid, "name: %s" % repr(fname).replace('"', "'") if "'" not in fname else 'name: "%s"' % fname, "type: '%s'" % t]
        if cls:
            f.append('classOnly: [%s]' % ', '.join("'%s'" % c for c in cls) if len(cls) > 1 else "classOnly: '%s'" % cls[0])
        f += ['tier: %d' % tier, 'qlvl: %d' % num(r['level']), 'reqLvl: %d' % max(1, num(r['levelreq']))]
        f += ['reqStr: %d' % num(r['reqstr'])]
        if kind == 'w':
            # épées à deux mains (« 1or2handed » : le Barbare peut les tenir à une main) : deux mains pour toutes les classes, dégâts 2handmindam/2handmaxdam
            two = (r.get('2handed') or '').strip() == '1'
            f.append('reqDex: %d' % num(r['reqdex']))
            if two or typ in ('bow', 'abow', 'xbow', 'spea', 'aspe', 'pole', 'staf') or (r.get('2handed') or '').strip() == '1' and not (r.get('mindam') or '').strip():
                lo, hi = num(r['2handmindam']), num(r['2handmaxdam'])
                f.append('dmg: [%d, %d]' % (lo, hi))
                f.append('twoHanded: true')
            else:
                lo, hi = num(r['mindam']), num(r['maxdam'])
                f.append('dmg: [%d, %d]' % (lo, hi))
            if typ in ('jave', 'ajav', 'tkni', 'taxe'):
                f.append('missileDmg: [%d, %d]' % (num(r['minmisdam']), num(r['maxmisdam'])))
            f.append('maxSockets: %d' % num(r['gemsockets']))
        else:
            f.append('reqDex: 0')
            f.append('defense: [%d, %d]' % (num(r['minac']), num(r['maxac'])))
            if num(r.get('block')) > 0:
                f.append('block: %d' % num(r['block']))
            f.append('maxSockets: %d' % num(r['gemsockets']))
        f.append("icon: '%s'" % ICON[t])
        f.append('generated: true')
        out.append('  mk({ %s }),' % ', '.join(f))

body = '\n'.join(out)
open(os.path.join(ROOT, 'src/data/items/bases-classes.ts'), 'w').write("""/**
 * Bases d'objets D2 pour toutes les classes : armes (épées, haches, masses, sceptres, dagues, armes de
 * jet, javelots, lances, armes d'hast, arcs, arbalètes, griffes), casques primitifs du Barbare,
 * boucliers auriques du Paladin, têtes du Nécromancien et armures des trois paliers. Généré par
 * tools/itemdata/gen-bases.py (valeurs D2 1.13 pour les armes, PD2 S13 pour les armures) : ne pas
 * modifier à la main.
 */
import type { ItemBase } from '../types';
import { mk } from './bases-make';

export const CLASS_BASES: ItemBase[] = [
%s
];
""" % body)
print(len(out), 'bases générées')
