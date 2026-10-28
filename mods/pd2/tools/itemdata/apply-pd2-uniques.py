#!/usr/bin/env python3
"""
Applique les valeurs Project Diablo 2 (S13, colonne « After » de wiki.projectdiablo2.com/wiki/All_Items) aux uniques
de src/data/items/uniques-d2.ts, et ajoute les uniques PD2 absents dont la base existe. À lancer après gen-uniques.py
et apply-pd2-sets.py (données : tools/itemdata/pd2-uniques.json, produit par extract-pd2.py) :

    python3 mods/pd2/tools/itemdata/apply-pd2-uniques.py [--report]
    python3 mods/pd2/tools/itemdata/apply-pd2-uniques.py --add-new   # idempotent : ajoute seulement les propriétés NEW_STATS manquantes
                                                            # (à utiliser sur un fichier déjà traité ; le mode normal ne l'est pas)

Méthode (ligne à ligne, rien n'est inventé) : pour chaque ligne modifiée « Avant → Après » du wiki, les statistiques
de « Avant » sont retirées de l'unique et remplacées par celles de « Après » ; une ligne ajoutée ajoute ses statistiques,
une ligne « Removed » retire les siennes. Les lignes que la simulation ne sait pas appliquer (charges, résistance aux
malédictions, multiplicateur de frappe mortelle…) sont ignorées et listées par --report. Le niveau requis suit le wiki.
Les carquois sont exclus (pas de base carquois dans le jeu).
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pd2text as T  # noqa: E402
import pd2wiki  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
# Lot 203 : les uniques ajoutés par PD2 ne sont plus en fin de uniques-d2.ts mais dans mods/pd2/data/items/uniques.ts ; ce script
# (entrées absentes du dépôt) les réécrirait en fin de uniques-d2.ts : à adapter au lot M6 (patch PD2 généré par diff).
PATH = os.path.join(ROOT, 'src/data/items/uniques-d2.ts')
REPORT = '--report' in sys.argv
ADD_NEW = '--add-new' in sys.argv
# propriétés devenues simulables après coup (voir --add-new)
NEW_STATS = {'curseRes', 'deadlyMult', 'maxDeadly', 'piercePhys', 'openWoundsDps', 'extraCurse', 'extraSummon', 'procBlock'}
exec(open(os.path.join(HERE, 'names-fr-uniques.py')).read())
FRU_PD2 = globals()['FRU_PD2']

WIKI = json.load(open(os.path.join(HERE, 'pd2-uniques.json')))

# nom du wiki → identifiant (les identifiants viennent de la colonne `index` de UniqueItems.txt, parfois mal orthographiée)
ALIAS = {
    'Skull Splitter': 'u_mindrend', 'Axe of Fechmar': 'u_fechmars_axe', 'The Chieftain': 'u_the_chieftan', 'Humongous': 'u_the_humongous', "Pompeii's Wrath": 'u_pompes_wrath',
    'The Minotaur': 'u_the_minataur', "Razor's Edge": 'u_razoredge', 'Rune Master': 'u_runemaster', 'Death Cleaver': 'u_deathcleaver', 'Bonesnap': 'u_bonesob',
    'Demon Limb': 'u_demonlimb', 'Earth Shifter': 'u_earthshifter', 'Skewer of Krintiz': 'u_krintizs_skewer', 'The Atlantean': 'u_the_atlantian', 'Djinn Slayer': 'u_djinnslayer',
    'Spectral Shard': 'u_irices_shard', 'Wraith Flight': 'u_wraithflight', 'Steel Pillar': 'u_steelpillar', 'Raven Claw': 'u_rimeraven', "Rogue's Bow": 'u_piercerib',
    'Stormstrike': 'u_pullspite', 'Witchwild String': 'u_whichwild_string', 'Goldstrike Arch': 'u_godstrike_arch', 'Doomslinger': 'u_doomspittle', 'Pus Spitter': 'u_pus_spiter',
    'Gut Siphon': 'u_gutsiphon', 'The Redeemer': 'u_the_reedeemer', "Astreon's Iron Ward": 'u_ironward', 'Spire of Lazarus': 'u_lazarus_spire', 'Skull Collector': 'u_skullcollector',
    'Torch of Iro': 'u_iros_torch', 'Maelstrom': 'u_maelstromwrath', "Death's Web": 'u_deathss_web', "Blood Raven's Charge": 'u_bloodravens_charge',
    "Bartuc's Cut-Throat": 'u_cutthroat1', 'Jade Talon': 'u_jadetalon', 'Shadow Killer': 'u_shadowkiller', "Death's Fathom": 'u_fathom', 'Peasant Crown': 'u_peasent_crown',
    'Vampire Gaze': 'u_vampiregaze', 'Valkyrie Wing': 'u_valkiry_wing', 'Steel Shade': 'u_steelshade', 'Giant Skull': 'u_giantskull', 'Spirit Keeper': 'u_spiritkeeper',
    'Venom Ward': 'u_venomsward', 'Silks of the Victor': 'u_victors_silk', 'Skin of the Flayed One': 'u_skin_of_the_flayerd_one', 'Iron Pelt': 'u_ironpelt',
    'Spirit Forge': 'u_spiritforge', "Que-Hegan's Wisdom": 'u_que_hegans_wisdon', 'Steel Carapace': 'u_steel_carapice', "Gerke's Sanctuary": 'u_kerkes_sanctuary',
    "Radament's Sphere": 'u_radimants_sphere', "Head Hunter's Glory": 'u_headhunters_glory', 'Darkforce Spawn': 'u_darkforge_spawn', 'Lava Gout': 'u_lavagout',
    'Soul Drainer': 'u_souldrain', 'War Traveler': 'u_wartraveler', 'Gore Rider': 'u_gorerider', 'Shadow Dancer': 'u_shadowdancer', 'Lenymo': 'u_lenyms_cord',
    "Gloom's Trap": 'u_gloomstrap', "Thundergod's Vigor": 'u_thudergods_vigor', "Verdungo's Hearty Cord": 'u_verdugos_hearty_cord', 'Wisp Projector': 'u_wisp',
    "Biggin's Bonnet": 'u_war_bonnet', "Cerebus' Bite": 'u_cerebus', 'Spirit Shroud': 'u_the_spirit_shroud', "Merman's Sprocket": 'u_mermans_speed',
}
# Facettes arc-en-ciel : une fiche par élément sur le wiki, deux variantes (mort / passage de niveau) chez nous
FACETS = {'Rainbow Facet (Lightning)': ['u_rainbow_facet', 'u_rainbow_facet_light_levelup'], 'Rainbow Facet (Cold)': ['u_rainbow_facet_cold_death', 'u_rainbow_facet_cold_levelup'],
          'Rainbow Facet (Fire)': ['u_rainbow_facet_fire_death', 'u_rainbow_facet_fire_levelup'], 'Rainbow Facet (Poison)': ['u_rainbow_facet_poison_death', 'u_rainbow_facet_poison_levelup']}
# exclusivités de boss (wiki Rathma / Diablo Clone : 1/200 en difficulté 1-2) : jamais tirées au hasard
EXCLUSIVE = {"Overlord's Helm", 'Dark Abyss', "Itherael's Path", "Hadriel's Hand", "Aidan's Scar", 'The Third Eye', 'Band of Skulls', 'Cage of the Unsullied'}

base_ids = set()
for f in ('bases.ts', 'bases-classes.ts', 'uniques.ts', 'sets.ts', 'misc.ts'):
    base_ids |= set(re.findall(r"id: '(\w+)'", open(os.path.join(ROOT, 'src/data/items', f)).read()))

MOD = re.compile(r"r\('(\w+)', (-?[\d.]+)(?:, (-?[\d.]+))?(?:, '([^']*)')?\)")
LINE = re.compile(r"^  \{ id: '(u_\w+)', name: (\"[^\"]*\"), base: '(\w+)', lvl: (\d+), reqLvl: (\d+), rarity: (\d+)(.*?), mods: \[(.*)\] \},$")


def mods_of(s):
    out = []
    for m in MOD.finditer(s):
        lo = float(m.group(2))
        hi = float(m.group(3)) if m.group(3) is not None else lo
        out.append([m.group(1), lo, hi, m.group(4)])
    return out


BLUNT = {'mace', 'scepter', 'staff', 'wand'}
ARMOR = {'helm', 'armor', 'shield', 'gloves', 'boots', 'belt', 'circlet', 'pelt', 'primal', 'head'}
WEAPON = {'sword', 'axe', 'mace', 'scepter', 'dagger', 'thrown', 'javelin', 'spear', 'polearm', 'staff', 'bow', 'crossbow', 'wand', 'orb', 'claw'}
base_type = {}
for f in ('bases.ts', 'bases-classes.ts', 'uniques.ts', 'sets.ts', 'misc.ts'):
    for m in re.finditer(r"id: '(\w+)',\s*name: [^,]*,\s*type: '(\w+)'", open(os.path.join(ROOT, 'src/data/items', f)).read()):
        base_type[m.group(1)] = m.group(2)


def adapt(stats, base):
    """Statistiques selon le genre de la base, comme gen-uniques.py : défense fixe non locale hors armures,
    défense % seulement sur armures, dégâts améliorés seulement sur armes (dégâts min/max gardés partout)."""
    t = base_type.get(base, '')
    out = []
    for st in stats:
        st = list(st)
        if st[0] == 'defFlat' and t not in ARMOR:
            st[0] = 'defense'
        if (st[0] in ('defPct', 'defPerLvl') and t not in ARMOR) or (st[0] in ('edPct', 'maxDmgPerLvl', 'edMaxPctPerLvl') and t not in WEAPON):
            continue
        out.append(st)
    return out


# une ligne du wiki peut correspondre à une statistique regroupée chez nous (« toutes les caractéristiques » éclatée, résistances max)
GROUP = {'maxResFire': 'maxResAll', 'maxResCold': 'maxResAll', 'maxResLight': 'maxResAll', 'maxResPoison': 'maxResAll',
         'resFire': 'resAll', 'resCold': 'resAll', 'resLight': 'resAll', 'resPoison': 'resAll'}


def find(mods, st, consumed):
    i = next((k for k, m in enumerate(mods) if key(m) == key(st)), None)
    if i is not None:
        return [i]
    g = GROUP.get(st[0])
    if g:
        j = next((k for k, m in enumerate(mods) if m[0] == g and m[1] == st[1] and m[2] == st[2]), None)
        if j is not None:
            consumed.add(g)
            return [j]
        if g in consumed:
            return []
    if st[0] == 'allAttr':
        idx = [next((k for k, m in enumerate(mods) if m[0] == a and m[1] == st[1] and m[2] == st[2]), None) for a in ('str', 'dex', 'vit', 'ene')]
        if None not in idx:
            return sorted(idx)
    return None


def key(st):
    stat, par = st[0], st[3]
    if stat.startswith('proc') and par:
        return (stat, par.split(':')[0])
    return (stat, par)


log = {}


def note(uid, msg):
    log.setdefault(uid, []).append(msg)


def apply_rows(uid, mods, rows, base):
    consumed = set()
    for b, a in rows:
        if b is None:
            continue
        if b == a:
            # ligne inchangée : on vérifie qu'elle existe (gen-uniques ne convertit pas toutes les propriétés D2)
            for st in adapt(T.parse(a), base):
                # +50 % contre les morts-vivants des armes contondantes : propriété de la base D2, pas de l'unique
                if st[0] == 'dmgUndeadPct' and st[1] == 50 and base_type.get(base) in BLUNT:
                    continue
                if find(mods, st, consumed) is None:
                    mods.append(list(st))
                    note(uid, 'ajouté (absent des tables converties) : %s' % a)
            continue
        bs = adapt(T.parse(b), base) if b else []
        as_ = adapt(T.parse(a), base) if a and a != 'Removed' else []
        if not bs and not as_:
            if (a and a != 'Removed') or b:
                note(uid, 'non simulé : %s → %s' % (b or '∅', a))
            continue
        if [list(x) for x in bs] == [list(x) for x in as_]:
            for st in as_:
                if find(mods, st, consumed) is None:
                    mods.append(list(st))
                    note(uid, 'ajouté (absent des tables converties) : %s' % a)
            continue
        at = None
        for st in bs:
            idx = find(mods, st, consumed)
            if idx is None:
                note(uid, 'avant introuvable : %s' % b)
                continue
            for i in reversed(idx):
                if (mods[i][1], mods[i][2]) != (st[1], st[2]):
                    note(uid, 'avant différent : %s (nous %s-%s)' % (b, mods[i][1], mods[i][2]))
                at = i if at is None else min(at, i)
                del mods[i]
        ins = [list(x) for x in as_]
        if at is None:
            mods.extend(ins)
        else:
            mods[at:at] = ins
        if a and a != 'Removed' and not as_:
            note(uid, 'non simulé : %s' % a)


def fmt(mods):
    return T.fmt([tuple(m) for m in mods])[1:-1]


def base_id(name):
    b = pd2wiki.base_ids(name, base_ids)
    return b[0] if b else None


src = open(PATH).read()
lines = src.split('\n')
by_id = {}
for i, ln in enumerate(lines):
    m = LINE.match(ln)
    if m:
        by_id[m.group(1)] = i

done = set()
changed = 0
if ADD_NEW:
    n_add = 0
    for name, w in sorted(WIKI.items()):
        if w['category'] == 'Quivers':
            continue
        for uid in FACETS.get(name) or [ALIAS.get(name, 'u_' + T.snake(name))]:
            if uid not in by_id:
                continue
            m = LINE.match(lines[by_id[uid]])
            mods = mods_of(m.group(8))
            n0 = len(mods)
            for _, a in w['rows']:
                if not a or a == 'Removed':
                    continue
                for st in adapt(T.parse(a), m.group(3)):
                    if st[0] in NEW_STATS and find(mods, st, set()) is None:
                        mods.append(list(st))
            if len(mods) != n0:
                n_add += 1
                lines[by_id[uid]] = "  { id: '%s', name: %s, base: '%s', lvl: %s, reqLvl: %s, rarity: %s%s, mods: [%s] }," % (uid, m.group(2), m.group(3), m.group(4), m.group(5), m.group(6), m.group(7), fmt(mods))
    if not REPORT:
        open(PATH, 'w').write('\n'.join(lines))
    print('uniques complétés :', n_add)
    sys.exit(0)
for name, w in sorted(WIKI.items()):
    if w['category'] == 'Quivers':
        continue
    ids = FACETS.get(name) or [ALIAS.get(name, 'u_' + T.snake(name))]
    if not all(i in by_id for i in ids):
        continue
    for uid in ids:
        i = by_id[uid]
        m = LINE.match(lines[i])
        mods = mods_of(m.group(8))
        before = [list(x) for x in mods]
        apply_rows(uid, mods, w['rows'], m.group(3))
        req = w['reqLvl'] or int(m.group(5))
        if req != int(m.group(5)):
            note(uid, 'niveau requis %s → %d' % (m.group(5), req))
        if base_id(w['base']) and base_id(w['base']) != m.group(3):
            note(uid, 'base différente : nous %s, PD2 %s' % (m.group(3), w['base']))
        if mods != before or req != int(m.group(5)):
            changed += 1
        lines[i] = "  { id: '%s', name: %s, base: '%s', lvl: %s, reqLvl: %d, rarity: %s%s, mods: [%s] }," % (
            uid, m.group(2), m.group(3), m.group(4), req, m.group(6), m.group(7), fmt(mods))
        done.add(uid)

# uniques PD2 absents dont la base existe
added, skipped = [], []
for name, w in sorted(WIKI.items()):
    if w['category'] == 'Quivers':
        continue
    uid = ALIAS.get(name, 'u_' + T.snake(name))
    if name in FACETS or uid in by_id:
        continue
    b = base_id(w['base'])
    if not b:
        skipped.append('%s (base %s)' % (name, w['base']))
        continue
    mods = []
    for _, a in w['rows']:
        if ' / ' in a or a in ('or', 'and'):
            note(uid, 'variante non gérée : %s' % a)
            continue
        got = adapt(T.parse(a), b)
        if not got:
            note(uid, 'non simulé : %s' % a)
        mods += [list(x) for x in got]
    req = w['reqLvl'] or 1
    lvl = w['ilvl'] or req
    if not w['ilvl']:
        note(uid, 'ilvl inconnu : niveau requis repris (%d)' % req)
    extra = ', noRandomDrop: true' if name in EXCLUSIVE else ''
    fr = FRU_PD2.get(name, name)
    added.append("  { id: '%s', name: %s, base: '%s', lvl: %d, reqLvl: %d, rarity: 1%s, mods: [%s] }," % (uid, json.dumps(fr, ensure_ascii=False), b, lvl, req, extra, fmt(mods)))

if REPORT:
    print('uniques modifiés :', changed, '/', len(done), '; ajoutés :', len(added), '; écartés (base absente) :', skipped)
    for uid in sorted(log):
        for msg in log[uid]:
            print(' ', uid, ':', msg)
    sys.exit(0)

src = '\n'.join(lines)
MARK = '  // --- uniques propres à Project Diablo 2 (apply-pd2-uniques.py) ---'
if MARK in src:
    sys.exit('déjà appliqué : relancer gen-uniques.py avant ce script')
src = src.replace('\n];\n', '\n' + MARK + '\n' + '\n'.join(added) + '\n];\n', 1)
src = src.replace('(tables D2 1.13, corrections PD2 documentées)', '(tables D2 1.13) puis mods/pd2/tools/itemdata/apply-pd2-uniques.py (valeurs PD2 S13 du wiki)', 1)
open(PATH, 'w').write(src)
print('uniques modifiés :', changed, '/', len(done), '; ajoutés :', len(added), '; écartés :', len(skipped))
