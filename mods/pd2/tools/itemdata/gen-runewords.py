#!/usr/bin/env python3
"""
Génère la table complète des mots runiques de Project Diablo 2 (wiki
wiki.projectdiablo2.com/wiki/Runewords, colonne « After » ; données pd2-runewords.json et names-fr-runewords.py de ce dossier, hors dépôt, produites par
extract-pd2.py). Les phrases de propriétés sont converties en statistiques par pd2text.py ; celles que le jeu
n'applique pas sont ignorées (rapport avec --report). Les mots runiques de carquois (pas de carquois dans le jeu)
sont omis.

    python3 mods/pd2/tools/itemdata/gen-runewords.py [--report] [--out sortie.ts]

Depuis le lot M10b, cette table n'est plus dans le dépôt (autrefois src/data/items/runewords-pd2.ts) : la base a les mots runiques de D2
(src/data/items/runewords-d2.ts, régénérés depuis les MPQ) et le mod les remplace par son patch, calculé par diff
(mods/pd2/data/items/runewords.patch.ts, mods/pd2/tools/vanilla-diff.ts). Pour reprendre une nouvelle version du wiki : générer la table vers
un fichier temporaire (--out), mettre les écarts dans le patch, puis `vanilla-diff.ts --no-vanilla --ref`.

Types : « Hammers », « Clubs », « Tipped Maces », « Paladin Shields », « Two-Handed Swords », « Amazon Spears »
restreignent un type du jeu à une liste de bases (champ `only`, tables D2 Weapons/Armor). « Helms » couvre aussi
les casques primitifs et les peaux, « Shields » les têtes du Nécromancien (types D2 helm et shld).
Lignes à variante : celle « hors bâtons » / « mêlée » est retenue, celle « bâtons seulement » écartée.
"""
import collections
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
import pd2text as T  # noqa: E402  (même dossier)

REPORT = '--report' in sys.argv
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(os.environ.get('TMPDIR', '/tmp'), 'runewords-pd2.ts')
FRU = {}
exec(open(os.path.join(HERE, 'names-fr-runewords.py')).read())

# type du wiki → types du jeu (et éventuelle restriction de bases)
TYPES = {'melee weapons': ['melee'], 'throwing weapons': ['thrown', 'javelin'], 'swords': ['sword'], 'two-handed swords': ['sword'], 'axes': ['axe'],
         'tipped maces': ['mace'], 'maces': ['mace'], 'hammers': ['mace'], 'clubs': ['mace'], 'scepters': ['scepter'], 'claws': ['claw'], 'polearms': ['polearm'],
         'spears': ['spear'], 'amazon spears': ['spear'], 'staves': ['staff'], 'bows': ['bow'], 'crossbows': ['crossbow'], 'wands': ['wand'], 'orbs': ['orb'],
         'daggers': ['dagger'], 'helms': ['helm', 'circlet', 'pelt', 'primal'], 'chests': ['armor'], 'shields': ['shield', 'head'], 'paladin shields': ['shield'],
         'weapons': ['weapon'], 'gloves': ['gloves'], 'boots': ['boots'], 'belts': ['belt'], 'quivers': []}
# sous-types D2 (Weapons.txt : club, mace, hamm ; épées à deux mains ; aspe ; Armor.txt : ashd)
SUB = {
    'clubs': ('mace', ['club', 'spiked_club', 'cudgel', 'barbed_club', 'truncheon', 'tyrant_club']),
    'tipped maces': ('mace', ['mace', 'morning_star', 'flail', 'flanged_mace', 'jagged_star', 'knout', 'reinforced_mace', 'devil_star', 'scourge']),
    'hammers': ('mace', ['war_hammer', 'maul', 'great_maul', 'battle_hammer', 'war_club', 'martel_de_fer', 'legendary_mallet', 'ogre_maul', 'thunder_maul']),
    'two-handed swords': ('sword', ['two_handed_sword', 'claymore', 'giant_sword', 'bastard_sword', 'flamberge', 'great_sword', 'espadon', 'dacian_falx', 'tusk_sword',
                                    'gothic_sword', 'zweihander', 'executioner_sword', 'legend_sword', 'highland_blade', 'balrog_blade', 'champion_sword',
                                    'colossal_sword', 'colossus_blade']),
    'amazon spears': ('spear', ['maiden_spear', 'maiden_pike', 'ceremonial_spear', 'ceremonial_pike', 'matriarchal_spear', 'matriarchal_pike']),
    'paladin shields': ('shield', ['targe', 'rondache', 'heraldic_shield', 'aerin_shield', 'crown_shield', 'akaran_targe', 'akaran_rondache', 'protector_shield',
                                   'guilded_shield', 'royal_shield', 'sacred_targe', 'sacred_rondache', 'ancient_shield_sacred', 'zakarum_shield', 'vortex_shield']),
}
# identifiants historiques des variantes homonymes (sauvegardes)
VARIANT = {('Dream', 'helm'): 'rw_dream_helm', ('Dream', 'shield'): 'rw_dream', ('Spirit', 'shield'): 'rw_spirit_shield', ('Spirit', 'sword'): 'rw_spirit',
           ('Dragon', 'armor'): 'rw_dragon_armor', ('Dragon', 'shield'): 'rw_dragon', ('Fortitude', 'armor'): 'rw_fortitude_armor', ('Fortitude', 'weapon'): 'rw_fortitude',
           ('Phoenix', 'shield'): 'rw_phoenix', ('Phoenix', 'weapon'): 'rw_phoenix_weapon'}
RUNE = ['El', 'Eld', 'Tir', 'Nef', 'Eth', 'Ith', 'Tal', 'Ral', 'Ort', 'Thul', 'Amn', 'Sol', 'Shael', 'Dol', 'Hel', 'Io', 'Lum', 'Ko', 'Fal', 'Lem', 'Pul', 'Um', 'Mal',
        'Ist', 'Gul', 'Vex', 'Ohm', 'Lo', 'Sur', 'Ber', 'Jah', 'Cham', 'Zod']
# qualificatifs : on garde la variante générale (hors bâtons, mêlée), on écarte la variante restreinte
DROP = re.compile(r'\((Staves Only|Polearms/Spears Only|Spears Only|Bows/Crossbows Only|Throwing Only)\)')
KEEP = re.compile(r' \((Non-Staves Only|Axes/Swords/Scepters/Claws/Throwing Weapons Only|Axes/Swords/Claws Only|Melee Only)\)')
T.rule(r'Requirements -(\d+)', lambda m: [T.R('reqPct', int(m.group(1)))])
T.rule(r'Hit Blinds Target \+\d+', lambda m: [])
T.rule(r'Level .+ When Equipped', lambda m: [])

data = json.load(open(os.path.join(HERE, 'pd2-runewords.json')))
out, skipped = [], []
per_rw = collections.defaultdict(list)
for w in data:
    name = w['name']
    m = re.match(r'(\d)-Socket (.+)', w['sockets'])
    n_sock = int(m.group(1))
    tdesc = re.sub(r'\s*\(.*?\)', '', m.group(2))
    tdesc = re.sub(r'\s*- also see.*$', '', tdesc)
    types, only = [], {}
    for t in tdesc.split('/'):
        t = t.strip().rstrip('*').strip().lower()
        if t not in TYPES:
            sys.exit('type inconnu : %s %s' % (name, t))
        for x in TYPES[t]:
            if x not in types:
                types.append(x)
        if t in SUB:
            only.setdefault(SUB[t][0], []).extend(SUB[t][1])
    # une restriction ne vaut que si aucun autre type du wiki n'ouvre ce type du jeu en entier
    for t in tdesc.split('/'):
        t = t.strip().rstrip('*').strip().lower()
        if t not in SUB:
            for x in TYPES[t]:
                only.pop(x, None)
    if not types:
        skipped.append(name)
        continue
    if len(w['runes']) != n_sock or any(r not in RUNE for r in w['runes']):
        sys.exit('runes incohérentes : %s' % name)
    kind = types[0] if types[0] in ('helm', 'armor', 'shield', 'weapon') else 'sword' if name == 'Spirit' else 'weapon'
    rid = VARIANT.get((name, kind), 'rw_' + T.snake(name))
    stats = []
    for b, a in w['rows']:
        if not a or a == 'Removed' or DROP.search(a):
            continue
        a = KEEP.sub('', a)
        for part in a.split(' / '):
            got = T.parse(part)
            if not got and part.strip():
                per_rw[rid].append(part.strip())
            stats += got
    fname = FRU.get(name, name)
    extra = (', { %s }' % ', '.join("%s: %s" % (k, json.dumps(sorted(set(v)))) for k, v in sorted(only.items()))) if only else ''
    out.append("  rw('%s', %s, '%s', %s, %d, %s%s)," % (rid, json.dumps(fname, ensure_ascii=False), ' '.join(w['runes']), json.dumps(types), w['reqLvl'], T.fmt(stats), extra))

ids = [re.match(r"  rw\('(\w+)'", x).group(1) for x in out]
dup = [i for i, c in collections.Counter(ids).items() if c > 1]
if dup:
    sys.exit('identifiants en double : %s' % dup)

if REPORT:
    print(len(out), 'mots runiques ; omis (carquois) :', skipped)
    for rid in sorted(per_rw):
        print(' ', rid, ':', ' ; '.join(per_rw[rid]))
    print('phrases inconnues :', dict(T.unhandled))
    sys.exit(0)

open(OUT, 'w').write("""/**
 * Mots runiques Project Diablo 2 (wiki PD2, valeurs S13). Généré par tools/itemdata/gen-runewords.py :
 * ne pas modifier à la main. Les propriétés que la simulation n'applique pas sont omises ; les mots
 * runiques de carquois sont absents (pas de carquois dans le jeu).
 */
import type { ItemType, RunewordDef, StatRoll } from '../types';
import { RUNE_BY_NAME } from './runes';

const r = (stat: string, min: number, max = min, param?: string): StatRoll => ({ stat, min, max, param });

function rw(id: string, name: string, runes: string, types: string[], reqLvl: number, mods: StatRoll[], only?: Partial<Record<ItemType, string[]>>): RunewordDef {
  const ids = runes.split(' ').map((n) => {
    const rn = RUNE_BY_NAME[n.toLowerCase()];
    if (!rn) throw new Error(`Rune inconnue dans ${name} : ${n}`);
    return rn.id;
  });
  return only ? { id, name, runes: ids, types, reqLvl, mods, only } : { id, name, runes: ids, types, reqLvl, mods };
}

export const PD2_RUNEWORDS: RunewordDef[] = [
""" + '\n'.join(out) + '\n];\n')
print(len(out), 'mots runiques générés ; omis (carquois) :', skipped)
