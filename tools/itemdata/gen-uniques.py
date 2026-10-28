#!/usr/bin/env python3
"""
Génère src/data/items/uniques-d2.ts et sets-d2.ts à partir des tables D2 (UniqueItems.txt,
SetItems.txt, Sets.txt, Weapons.txt, Armor.txt, Misc.txt), lues depuis le dossier D2DATA (non
versionné : données de jeu tierces). Seules les propriétés que la simulation applique sont
conservées ; les autres sont comptées dans le rapport (--report) puis ignorées.

    D2DATA=/chemin/vers/tables python3 tools/itemdata/gen-uniques.py [--report]

Corrections PD2 documentées (mods/pd2/docs/AUDIT-PD2.md) : voir PD2_UNIQUE / PD2_SET plus bas.
"""
import csv, json, os, re, sys, collections

D = os.environ.get('D2DATA')
if not D:
    sys.exit('D2DATA : dossier contenant les tables D2')
REPORT = '--report' in sys.argv
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
ITEMS = os.path.join(ROOT, 'src/data/items')

exec(open(os.path.join(HERE, 'names-fr-uniques.py')).read()) if os.path.exists(os.path.join(HERE, 'names-fr-uniques.py')) else None
FRU = globals().get('FRU', {})


def rd(name):
    return list(csv.DictReader(open(os.path.join(D, name), encoding='latin-1'), delimiter='\t'))


def snake(name):
    s = name.strip().lower().replace("'", '').replace("’", '')
    return re.sub(r'[^a-z0-9]+', '_', s).strip('_')


def num(x, d=0):
    x = (x or '').strip()
    try:
        return int(float(x)) if x else d
    except ValueError:
        return d


# --- bases connues du jeu -----------------------------------------------------------------
base_ids = set()
for f in ('bases.ts', 'bases-classes.ts', 'uniques.ts', 'sets.ts', 'misc.ts', 'runes.ts'):
    base_ids |= set(re.findall(r"id: '(\w+)'", open(os.path.join(ITEMS, f)).read()))
skill_ids = set()
for f in os.listdir(os.path.join(ROOT, 'src/data')):
    if f.startswith('skills') and f.endswith('.ts'):
        skill_ids |= set(re.findall(r"id: '(\w+)'", open(os.path.join(ROOT, 'src/data', f)).read()))

# homonymes D2 : « Ancient Shield » (bouclier exceptionnel et bouclier aurique élite), « Demon Head » (tête de nécromancien) ;
# comme gen-bases.py, seule la variante de classe est renommée
ALIAS = {('ancient_shield', 'ashd'): 'ancient_shield_sacred', ('demon_head', 'head'): 'demon_head_bone', ('blood_spirt', 'pelt'): 'blood_spirit'}
code2base = {}   # code -> (id, kind) kind = armor|weapon|jewelry|charm
for fn, kind in (('Weapons.txt', 'weapon'), ('Armor.txt', 'armor')):
    for r in rd(fn):
        c, n = (r.get('code') or '').strip(), (r.get('name') or '').strip()
        if c and n and '/' not in n:
            code2base[c] = (ALIAS.get((snake(n), (r.get('type') or '').strip()), snake(n)), kind)
code2base.update({'rin': ('ring', 'jewelry'), 'amu': ('amulet', 'jewelry'), 'cm1': ('small_charm', 'charm'), 'cm2': ('large_charm', 'charm'), 'cm3': ('grand_charm', 'charm'), 'jew': ('jewel', 'jewelry')})

# --- classes / arbres ---------------------------------------------------------------------
CLASS_STAT = {'ama': 'amzSkills', 'sor': 'sorcSkills', 'nec': 'necSkills', 'pal': 'palSkills', 'bar': 'barSkills', 'dru': 'druidSkills', 'ass': 'asnSkills'}
TAB_STAT = ['amzBowSkills', 'amzPassiveSkills', 'amzJavelinSkills', 'fireSkills', 'lightSkills', 'coldSkills', 'necCurseSkills', 'necPoisonSkills', 'necSummonSkills',
            'palCombatSkills', 'palOffenseSkills', 'palDefenseSkills', 'barCombatSkills', 'barMasterySkills', 'barWarcrySkills', 'summonSkills', 'shapeSkills', 'eleSkills',
            'asnTrapSkills', 'asnShadowSkills', 'asnMartialSkills']
ID_NAME = {}
for r in rd('Skills.txt'):
    n = (r.get('skill') or '').strip()
    if n:
        ID_NAME[str(num(r.get('Id'), -1))] = snake(n)


def skillref(par):
    par = (par or '').strip()
    return ID_NAME.get(par, snake(par)) if par.isdigit() else snake(par)


SKILL_FIX = {'raise_skeletal_mage': 'skeletal_mage', 'wearwolf': 'werewolf', 'wake_of_fire_sentry': 'wake_of_fire', 'inferno_sentry': 'wake_of_inferno', 'sword_mastery': 'one_hand_mastery', 'axe_mastery': 'one_hand_mastery', 'mace_mastery': 'one_hand_mastery', 'polearm_mastery': 'two_hand_mastery', 'spear_mastery': 'two_hand_mastery', 'increased_stamina': 'combat_reflexes', 'lightning_fury': 'lightning_fury', 'frozen_armor': 'chilling_armor', 'inner_sight': 'inner_sight', 'holy_fire': 'holy_fire'}

unsupported = collections.Counter()
mapped_count = collections.Counter()


def R(stat, lo, hi=None, param=None):
    hi = lo if hi is None else hi
    if lo > hi:
        lo, hi = hi, lo
    return (stat, lo, hi, param)


def prop(code, par, lo, hi, kind, ctx):
    """Une propriété D2 -> liste de (stat, min, max, param) ; [] si non gérée"""
    p = code
    lo_, hi_ = lo, hi
    armor = kind == 'armor'
    weapon = kind == 'weapon'
    if p == 'dmg%':
        return [R('edPct', lo, hi)] if weapon else []
    if p == 'ac%':
        return [R('defPct', lo, hi)] if armor else []
    if p == 'ac':
        return [R('defFlat', lo, hi)] if armor else [R('defense', lo, hi)]
    if p in ('swing1', 'swing2', 'swing3'):
        return [R('ias', lo, hi)]
    if p in ('move1', 'move2', 'move3'):
        return [R('frw', lo, hi)]
    if p in ('cast1', 'cast2', 'cast3'):
        return [R('fcr', lo, hi)]
    if p in ('balance1', 'balance2', 'balance3'):
        return [R('fhr', lo, hi)]
    simple = {'res-all': 'resAll', 'res-fire': 'resFire', 'res-cold': 'resCold', 'res-ltng': 'resLight', 'res-pois': 'resPoison', 'res-fire-max': 'maxResFire',
              'res-cold-max': 'maxResCold', 'res-ltng-max': 'maxResLight', 'res-pois-max': 'maxResPoison', 'res-all-max': 'maxResAll', 'str': 'str', 'dex': 'dex', 'vit': 'vit',
              'enr': 'ene', 'all-stats': 'allAttr', 'hp': 'life', 'mana': 'mana', 'hp%': 'lifePct', 'mana%': 'manaPct', 'lifesteal': 'lifeLeech', 'manasteal': 'manaLeech',
              'mana-kill': 'manaPerKill', 'heal-kill': 'lifePerKill', 'regen': 'lifeRegen', 'regen-mana': 'manaRegenPct', 'light': 'lightRadius', 'mag%': 'mf', 'gold%': 'gf',
              'allskills': 'allSkills', 'red-dmg': 'drFlat', 'red-dmg%': 'dr', 'red-mag': 'mdr', 'crush': 'crushingBlow', 'deadly': 'deadlyStrike', 'openwounds': 'openWounds',
              'block': 'block', 'att': 'attackRating', 'att%': 'arPct', 'nofreeze': 'cbf', 'res-pois-len': 'poisonLength', 'indestruct': 'indestructible', 'sock': 'socketsAdded',
              'extra-fire': 'fireDmgPct', 'extra-cold': 'coldDmgPct', 'extra-ltng': 'lightDmgPct', 'extra-pois': 'poisonDmgPct', 'pierce-fire': 'pierceFire',
              'pierce-cold': 'pierceCold', 'pierce-ltng': 'pierceLight', 'abs-fire%': 'absorbFire', 'abs-cold%': 'absorbCold', 'abs-ltng%': 'absorbLight', 'addxp': 'xpPct',
              'dmg-min': 'minDmg', 'dmg-max': 'maxDmg', 'thorns': 'thornsFlat', 'ignore-ac': 'ignoreDef', 'slow': 'slowTarget', 'knock': 'knockback', 'noheal': 'noHeal',
              'half-freeze': 'halfFreeze', 'freeze': 'freezeTarget', 'dmg-to-mana': 'dmgToMana', 'dmg-undead': 'dmgUndeadPct', 'dmg-demon': 'dmgDemonPct', 'reduce-ac': 'reduceDef', 'manasteal2': 'manaLeech',
              # statistiques ajoutées au catalogue depuis la première génération
              'pierce-pois': 'piercePoison', 'ac-miss': 'defMissile', 'ac-hth': 'defMelee', 'att-demon': 'arDemon', 'pierce': 'pierceChance',
              'block1': 'fbr', 'block2': 'fbr', 'block3': 'fbr'}
    if p == 'nofreeze':
        return [R('cbf', 1)]
    if p == 'indestruct':
        return [R('indestructible', 1)]
    if p in ('dmg-norm', 'dmg'):
        if weapon:
            return [R('minDmg', lo, lo), R('maxDmg', hi, hi)]
        return []
    if p in ('dmg-fire', 'fire-min', 'fire-max'):
        if p == 'dmg-fire':
            return [R('addFireMin', lo, lo), R('addFireMax', hi, hi)]
        return [R('addFireMin' if p == 'fire-min' else 'addFireMax', lo, hi)]
    if p in ('dmg-cold', 'cold-min', 'cold-max'):
        if p == 'dmg-cold':
            return [R('addColdMin', lo, lo), R('addColdMax', hi, hi)]
        return [R('addColdMin' if p == 'cold-min' else 'addColdMax', lo, hi)]
    if p in ('dmg-ltng', 'ltng-min', 'ltng-max'):
        if p == 'dmg-ltng':
            return [R('addLightMin', lo, lo), R('addLightMax', hi, hi)]
        return [R('addLightMin' if p == 'ltng-min' else 'addLightMax', lo, hi)]
    if p == 'dmg-pois':
        length = num(par, 100)
        return [R('poisonDmg', max(1, round(lo * length / 256)), max(1, round(hi * length / 256)))]
    if p == 'ease':
        return [R('reqPct', -hi, -lo)] if hi < 0 else [R('reqPct', -lo, -hi)]
    if p in ('hp/lvl', 'mana/lvl'):
        v = num(par) / 8
        return [R('lifePerLvl' if p == 'hp/lvl' else 'manaPerLvl', v, v)]
    if p == 'skilltab':
        t = num(par, -1)
        return [R(TAB_STAT[t], lo, hi)] if 0 <= t < len(TAB_STAT) else []
    if p in CLASS_STAT:
        return [R(CLASS_STAT[p], lo, hi)]
    if p in ('skill', 'oskill'):
        sid = SKILL_FIX.get(skillref(par), skillref(par))
        if sid in skill_ids:
            return [R('oskill', lo, hi, sid)]
        unsupported['skill:' + sid] += 1
        return []
    PROC = {'hit-skill': 'procHit', 'att-skill': 'procAtt', 'gethit-skill': 'procGetHit', 'kill-skill': 'procKill', 'death-skill': 'procDeath', 'levelup-skill': 'procLevelUp'}
    if p in PROC:
        sid = SKILL_FIX.get(skillref(par), skillref(par))
        if sid in skill_ids and lo > 0:
            return [R(PROC[p], lo, lo, '%s:%d' % (sid, max(1, hi)))]
        unsupported['skill:' + sid] += 1
        return []
    if p == 'sock' and lo == 0 and hi == 0 and num(par):
        return [R('socketsAdded', num(par))]
    if p == 'dmg-mag':
        return [R('addMagicMin', lo, lo), R('addMagicMax', hi, hi)]
    if p == 'thorns/lvl':
        return [R('thornsPerLvl', num(par) / 8)] if num(par) > 0 else []
    if p == 'res-ltng/lvl':
        return [R('resLightPerLvl', num(par) / 8)] if num(par) > 0 else []
    if p == 'dmg%/lvl':
        return [R('edMaxPctPerLvl', num(par) / 8)] if num(par) > 0 and weapon else []
    PERLVL = {'ac/lvl': ('defPerLvl', 'armor'), 'dmg/lvl': ('maxDmgPerLvl', 'weapon'), 'att/lvl': ('attackRatingPerLvl', None), 'mag%/lvl': ('mfPerLvl', None),
              'str/lvl': ('strPerLvl', None), 'dex/lvl': ('dexPerLvl', None), 'vit/lvl': ('vitPerLvl', None)}
    if p in PERLVL:
        st, need = PERLVL[p]
        if need and need != kind:
            return []
        v = num(par) / 8
        return [R(st, v, v)] if v > 0 else []
    if p == 'aura':
        sid = skillref(par)
        return [R('itemAura', lo, lo, sid)] if sid in skill_ids else []
    if p == 'fireskill':
        return [R('fireSkills', lo, hi)]
    if p == 'light-thorns':
        return [R('lightThornsFlat', lo, hi)]
    if p in ('res-pois-len',):
        return [R('poisonLength', lo, hi)]
    if p in simple and simple[p] in SUPPORTED:
        return [R(simple[p], lo, hi)]
    return []


# statistiques que la simulation sait appliquer (STAT_DEFS + ajouts de ce lot)
SUPPORTED = set(re.findall(r"S\('(\w+)'", open(os.path.join(ROOT, 'src/data/stats.ts')).read()))


def convert(row, n, kind, ctx):
    out = []
    for i in range(1, n + 1):
        c = (row.get(f'prop{i}') or '').strip()
        if not c:
            continue
        got = prop(c, (row.get(f'par{i}') or '').strip(), num(row.get(f'min{i}')), num(row.get(f'max{i}')), kind, ctx)
        got = [g for g in got if g[0] in SUPPORTED]
        if got:
            mapped_count[c] += 1
            out += got
        else:
            unsupported[c] += 1
    return out


def fmt(stats):
    parts = []
    for s, lo, hi, par in stats:
        f = lambda v: repr(round(v, 3)).rstrip('0').rstrip('.') if isinstance(v, float) and v != int(v) else str(int(v))
        a = "r('%s', %s%s%s)" % (s, f(lo), '' if hi == lo else ', ' + f(hi), '' if not par else (", %s" % f(hi) if hi == lo else '') + ", '%s'" % par)
        parts.append(a)
    return '[' + ', '.join(parts) + ']'


PD2_UNIQUE = {}   # nom -> fonction de correction (corrections PD2 documentées)
# Sets dont les bonus PD2 remplacent ceux de D2 (bonus de set uniquement, pas de bonus par pièce)
PD2_SET_BONUS = {
    "Tal Rasha's Wrappings": [(2, [R('lifeRegen', 10)]), (3, [R('mf', 50)]), (4, [R('fhr', 25)]), (5, [R('sorcSkills', 3), R('defense', 150), R('life', 150), R('resAll', 50)])],
}

uniq_out = []
seen = set()
missing_base = collections.Counter()
for r in rd('UniqueItems.txt'):
    name = (r.get('index') or '').strip()
    if not name or r.get('enabled') != '1' or name == 'Expansion':
        continue
    code = (r.get('code') or '').strip()
    # « Cap/hat » est écarté des bases (nom à barre oblique) : le bonnet de Biggin (War Bonnet) s'y rattache
    b = code2base.get(code) or {'cap': ('cap', 'armor')}.get(code)
    if not b or b[0] not in base_ids:
        missing_base[(name, code, b[0] if b else None)] += 1
        continue
    kind = b[1]
    stats = convert(r, 12, kind, name)
    if not stats:
        continue
    uid = 'u_' + snake(name)
    if uid in seen and name == 'Rainbow Facet':
        # 8 variantes D2 (4 éléments × mort / passage de niveau) : la première garde l'identifiant historique
        elem = next((k for st, k in (('fireDmgPct', 'fire'), ('coldDmgPct', 'cold'), ('lightDmgPct', 'light'), ('poisonDmgPct', 'poison')) if any(x[0] == st for x in stats)), 'x')
        trig = 'levelup' if any(x[0] == 'procLevelUp' for x in stats) else 'death'
        uid = '%s_%s_%s' % (uid, elem, trig)
    if uid in seen:
        continue
    seen.add(uid)
    lvl, req = num(r['lvl']), max(1, num(r['lvl req']))
    fname = FRU.get(name, name)
    uniq_out.append("  { id: '%s', name: %s, base: '%s', lvl: %d, reqLvl: %d, rarity: %d, mods: %s }," % (uid, json.dumps(fname, ensure_ascii=False), b[0], lvl, req, max(1, num(r['rarity'], 1)), fmt(stats)))

# --- sets ---------------------------------------------------------------------------------
sets_raw = {r['index']: r for r in rd('Sets.txt') if r.get('index')}
set_defs = []
set_items = []
setname_id = {}
for sname, sr in sets_raw.items():
    if sname == 'Expansion':
        continue
    setname_id[sname] = 'set_' + snake(sname)
items_by_set = collections.defaultdict(list)
for r in rd('SetItems.txt'):
    nm = (r.get('index') or '').strip()
    if not nm or nm == 'Expansion' or r['set'] not in setname_id:
        continue
    code = (r.get('item') or '').strip()
    b = code2base.get(code)
    if not b or b[0] not in base_ids:
        missing_base[(nm, code, b[0] if b else None)] += 1
        continue
    kind = b[1]
    stats = convert(r, 9, kind, nm)
    # bonus partiels : aprop1a/b .. aprop5a/b (1 à 5 autres pièces)
    partial = []
    for k in range(1, 6):
        if r['set'] in PD2_SET_BONUS:
            break
        ps = []
        for suffix in 'ab':
            c = (r.get(f'aprop{k}{suffix}') or '').strip()
            if c:
                got = prop(c, (r.get(f'apar{k}{suffix}') or '').strip(), num(r.get(f'amin{k}{suffix}')), num(r.get(f'amax{k}{suffix}')), kind, nm)
                got = [g for g in got if g[0] in SUPPORTED]
                if got:
                    mapped_count[c] += 1
                    ps += got
                else:
                    unsupported[c] += 1
        if ps:
            partial.append((k + 1, ps))
    sid = 's_' + snake(nm)
    items_by_set[r['set']].append(sid)
    fname = FRU.get(nm, nm)
    pt = ''
    if partial:
        pt = ', partial: [' + ', '.join('{ count: %d, mods: %s }' % (c, fmt(m)) for c, m in partial) + ']'
    set_items.append("  { id: '%s', name: %s, set: '%s', base: '%s', lvl: %d, reqLvl: %d, rarity: %d, mods: %s%s }," % (
        sid, json.dumps(fname, ensure_ascii=False), setname_id[r['set']], b[0], num(r['lvl']), max(1, num(r['lvl req'])), max(1, num(r['rarity'], 1)), fmt(stats), pt))

for sname, sr in sets_raw.items():
    if sname == 'Expansion' or not items_by_set.get(sname):
        continue
    bon = []
    for k in range(2, 6):
        ps = []
        for suffix in 'ab':
            c = (sr.get(f'PCode{k}{suffix}') or '').strip()
            if c:
                got = prop(c, (sr.get(f'PParam{k}{suffix}') or '').strip(), num(sr.get(f'PMin{k}{suffix}')), num(sr.get(f'PMax{k}{suffix}')), 'jewelry', sname)
                got = [g for g in got if g[0] in SUPPORTED]
                if got:
                    mapped_count[c] += 1
                    ps += got
                else:
                    unsupported[c] += 1
        if ps:
            bon.append((k, ps))
    full = []
    for k in range(1, 9):
        c = (sr.get(f'FCode{k}') or '').strip()
        if c:
            got = prop(c, (sr.get(f'FParam{k}') or '').strip(), num(sr.get(f'FMin{k}')), num(sr.get(f'FMax{k}')), 'jewelry', sname)
            got = [g for g in got if g[0] in SUPPORTED]
            if got:
                mapped_count[c] += 1
                full += got
            else:
                unsupported[c] += 1
    n = len(items_by_set[sname])
    if full:
        bon.append((n, full))
    if sname in PD2_SET_BONUS:
        bon = PD2_SET_BONUS[sname]
    fname = FRU.get(sname, sname)
    set_defs.append("  {\n    id: '%s',\n    name: %s,\n    items: [%s],\n    bonuses: [%s],\n  }," % (
        setname_id[sname], json.dumps(fname, ensure_ascii=False), ', '.join("'%s'" % i for i in items_by_set[sname]), ', '.join('{ count: %d, mods: %s }' % (c, fmt(m)) for c, m in bon)))

if REPORT:
    print('uniques', len(uniq_out), 'set items', len(set_items), 'sets', len(set_defs))
    print('bases manquantes :', dict(list(missing_base.items())[:40]))
    print('non gérées :', unsupported.most_common(60))
    print('gérées :', mapped_count.most_common(80))
    sys.exit(0)

HEAD = """/**
 * %s. Généré par tools/itemdata/gen-uniques.py (tables D2 1.13, corrections PD2 documentées) :
 * ne pas modifier à la main. Seules les propriétés appliquées par la simulation sont conservées.
 */
"""
open(os.path.join(ITEMS, 'uniques-d2.ts'), 'w').write(HEAD % 'Objets uniques D2' + """import type { StatRoll, UniqueDef } from '../types';

const r = (stat: string, min: number, max = min, param?: string): StatRoll => ({ stat, min, max, param });

export const D2_UNIQUES: UniqueDef[] = [
""" + '\n'.join(uniq_out) + '\n];\n')
open(os.path.join(ITEMS, 'sets-d2.ts'), 'w').write(HEAD % 'Sets D2' + """import type { SetDef, SetItemDef, StatRoll } from '../types';

const r = (stat: string, min: number, max = min, param?: string): StatRoll => ({ stat, min, max, param });

export const D2_SET_ITEMS: SetItemDef[] = [
""" + '\n'.join(set_items) + """
];

export const D2_SETS: SetDef[] = [
""" + '\n'.join(set_defs) + '\n];\n')
print('uniques', len(uniq_out), 'set items', len(set_items), 'sets', len(set_defs))
