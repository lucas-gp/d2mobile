#!/usr/bin/env python3
"""
Génère src/data/skills-<classe>.ts à partir des tables D2 LoD (Arreat Summit) échantillonnées aux
niveaux 1, 2, 3, 8, 9, 16, 17 et 20. Les descriptions, positions dans l'arbre et prérequis sont
ceux de D2 ; les synergies sont celles de D2 1.10+ (approchées quand la table n'est pas connue).

    python3 tools/skilldata/gen.py            # écrit les cinq fichiers

Attention : les fichiers versionnés portent des temps de recharge ajoutés à la main après génération ;
les chiffres PD2 font foi dans mods/pd2/data/skills.ts (mods/pd2/tools/skilldata/apply-pd2-wiki.py).
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(__file__))

import json

# synergies PD2 (Skills.txt S13, tools/skilldata/synergies.py) : remplacent les listes écrites à la main
_PD2_TOOLS = os.path.join(os.path.dirname(__file__), '..', '..', 'mods', 'pd2', 'tools', 'skilldata')  # fichiers PD2 du mod (lot 204)
_SYN = json.load(open(os.path.join(_PD2_TOOLS, 'synergies-pd2.json')))
# chiffres PD2 S13 (mods/pd2/tools/skilldata/pd2skills.py) : mana, précision, dégâts d'arme %, dégâts élémentaires
_PD2 = json.load(open(os.path.join(_PD2_TOOLS, 'pd2-skills.json')))
_ALL_IDS = set()
_DATA = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'data')
for _f in os.listdir(_DATA):
    if _f.startswith('skills') and _f.endswith('.ts'):
        _ALL_IDS |= set(re.findall(r"id: '(\w+)'", open(os.path.join(_DATA, _f)).read()))

RAMP_KEYS = {'min', 'max', 'min2', 'max2', 'min3', 'max3', 'ar', 'wdmg', 'flat'}
LIN_KEYS = {'duration', 'radius', 'count', 'value', 'value2', 'v3', 'v4', 'v5', 'chill', 'stun', 'life'}
LV = [1, 2, 3, 8, 9, 16, 17, 20]


def fmt(x):
    x = round(x, 3)
    s = ('%g' % x)
    return s


def parse(v):
    return v.split()


def is_lin(p):
    slope = (p[7] - p[0]) / 19.0
    return all(abs(p[i] - (p[0] + slope * (LV[i] - 1))) <= max(0.06, abs(slope) * 0.15) for i in range(8)), slope


def emit_series(key, pts, yards=False):
    if yards:
        pts = [x / 2 for x in pts]
    if key == 'mana':
        return '[%s, %s]' % (fmt(pts[0]), fmt((pts[7] - pts[0]) / 19.0))
    lin, slope = is_lin(pts)
    if key in RAMP_KEYS:
        return 'P([%s])' % ', '.join(fmt(x) for x in pts)
    if lin:
        return '[%s, %s]' % (fmt(pts[0]), fmt(slope))
    return 'P([%s])' % ', '.join(fmt(x) for x in pts)


def emit_n(n, rng=None):
    out = []
    for key, val in n.items():
        yards = key.endswith('@y')
        k = key[:-2] if yards else key
        if ',' in k:
            k1, k2 = k.split(',')
            a, b = [], []
            for tok in parse(val):
                lo, hi = tok.split('-')
                a.append(float(lo)); b.append(float(hi))
            out.append('%s: %s' % (k1, emit_series(k1, a, yards)))
            out.append('%s: %s' % (k2, emit_series(k2, b, yards)))
        else:
            parts = parse(val)
            if len(parts) == 1:
                x = float(parts[0])
                if k in ('cooldown', 'speed'):
                    out.append('%s: %s' % (k, fmt(x)))
                elif k in RAMP_KEYS:
                    out.append('%s: P([%s])' % (k, ', '.join([fmt(x)] * 8)))
                elif k == 'mana':
                    out.append('mana: [%s, 0]' % fmt(x))
                else:
                    out.append('%s: [%s, 0]' % (k, fmt(x / 2 if yards else x)))
            else:
                out.append('%s: %s' % (k, emit_series(k, [float(t) for t in parts], yards)))
    return ', '.join(out)


# compétences dont le moteur diffère de PD2 : leurs dégâts PD2 ne sont pas repris tels quels
PD2_KEEP = {'zeal'}


def pd2_numbers(id, n):
    """Remplace mana / précision / dégâts d'arme / dégâts élémentaires par les valeurs PD2 S13."""
    p = _PD2.get(id)
    if not p:
        return n
    n = dict(n)
    fm = lambda xs: ' '.join(fmt(x) for x in xs)
    if 'mana' in n:
        n['mana'] = fm([p['mana'][0] + p['mana'][1] * (L - 1) for L in LV])
    if 'ar' in n and p.get('ar') and id not in PD2_KEEP:
        n['ar'] = fm([p['ar'][0] + p['ar'][1] * (L - 1) for L in LV])
    if 'wdmg' in n and p.get('wdmg') and id not in PD2_KEEP:
        n['wdmg'] = fm(p['wdmg'])
    if 'min,max' in n and p.get('min') and p.get('etype') != 'pois' and id not in PD2_KEEP:
        n['min,max'] = ' '.join('%s-%s' % (fmt(a), fmt(b)) for a, b in zip(p['min'], p['max']))
    return n


def pd2_masteries(id, n):
    """Maîtrises PD2 : score d'attaque, dégâts et critique (ou coup dévastateur) lus des formules passives."""
    p = _PD2.get(id)
    if not p or not p.get('pcalc') or not id.endswith('mastery'):
        return n
    pc = p['pcalc']
    n = dict(n)
    fm = lambda xs: ' '.join(fmt(x) for x in xs)
    for st, key in (('passive_mastery_melee_th', 'ar'), ('passive_mastery_throw_th', 'ar'), ('passive_mastery_melee_dmg', 'wdmg'), ('passive_mastery_throw_dmg', 'wdmg'),
                    ('passive_mastery_melee_crit', 'value'), ('passive_mastery_throw_crit', 'value'), ('item_crushingblow', 'value')):
        if st in pc and pc[st][0] == pc[st][0]:
            n[key] = fm(pc[st])
    return n


def pd2_samples(id, stat, aura=False):
    """Échantillons PD2 d'une statistique passive (ou d'aura) pour emit_n."""
    return ' '.join(fmt(x) for x in _PD2[id]['acalc' if aura else 'pcalc'][stat])


def skill(id, name, tree, row, col, lvl, pre, el, target, rng, flags, kind, desc, syn, n, el2=None):
    """Une compétence (enregistrement ; le texte est produit par write, qui connaît tous les identifiants)."""
    n = pd2_masteries(id, pd2_numbers(id, n))
    if id in _SYN:
        pd2 = [tuple(x) for x in _SYN[id] if x[0] in _ALL_IDS and x[0] != id]
        if pd2:
            syn = pd2
    return dict(id=id, name=name, tree=tree, row=row, col=col, lvl=lvl, pre=list(pre), el=el, target=target, rng=rng, flags=flags, kind=kind, desc=desc, syn=syn, n=n, el2=el2)


def pd2_pair(id, smin, smax):
    """Échantillons PD2 « min-max » de deux statistiques passives."""
    a, b = _PD2[id]['pcalc'][smin], _PD2[id]['pcalc'][smax]
    return ' '.join('%s-%s' % (fmt(x), fmt(y)) for x, y in zip(a, b))


skill.pd2 = pd2_samples
skill.pd2pair = pd2_pair


# classes dont l'arbre (niveaux, prérequis, positions, compétences) est déjà celui de PD2 S13
PD2_STRUCT = {'BARBARIAN_SKILLS', 'PALADIN_SKILLS', 'AMAZON_SKILLS', 'ASSASSIN_SKILLS', 'NECROMANCER_SKILLS'}


def render(r, known, struct):
    """Texte TypeScript d'une compétence ; niveau, prérequis et position sont ceux de PD2 quand tous ses prérequis existent."""
    row, col, lvl, pre = r['row'], r['col'], r['lvl'], r['pre']
    p = _PD2.get(r['id'])
    if struct and p and all(x in known for x in p['prereqs']):
        row, col, lvl, pre = p['row'], p['col'] - 1, p['reqLvl'], p['prereqs']
    props = ['id: %r' % r['id'], 'name: %r' % r['name'], 'tree: %r' % r['tree'], 'row: %d' % row, 'col: %d' % col, 'reqLvl: %d' % lvl,
             'prereqs: [%s]' % ', '.join(repr(x) for x in pre), 'element: %r' % r['el']]
    if r['el2']:
        props.append('element2: %r' % r['el2'])
    if 'm' in r['flags']:
        props.append('melee: true')
    if 'p' in r['flags']:
        props.append('passive: true')
    if 'b' in r['flags']:
        props.append('buff: true')
    props += ['target: %r' % r['target'], 'range: %s' % fmt(r['rng']), 'kind: %r' % r['kind']]
    d = r['desc'].replace('\\', '\\\\').replace("'", "\\'")
    syn = r['syn']
    lines = ['  S({', '    ' + ', '.join(props) + ',', "    desc: '%s'," % d]
    if syn:
        lines.append('    synergies: [%s],' % ', '.join("{ skill: '%s', pct: %s, what: '%s' }" % (x[0], fmt(x[1]), x[2] if len(x) > 2 else 'dmg') for x in syn))
    else:
        lines.append('    synergies: [],')
    lines.append('    n: { %s },' % emit_n(r['n']))
    lines.append('  }),')
    return '\n'.join(lines), (r['tree'], row, col)


def q(s):
    return s


def write(cls_const, fname, title, items):
    known = {r['id'] for r in items}
    texts, cells = [], {}
    for r in items:
        t, cell = render(r, known, cls_const in PD2_STRUCT)
        texts.append(t)
        if cell in cells:
            print('ATTENTION case occupée', cell, r['id'], cells[cell])
        cells[cell] = r['id']
    body = '\n'.join(texts)
    # les chaînes Python repr utilisent des apostrophes : rien à convertir
    out = """/**
 * %s
 * Arbre, prérequis et descriptions ; chiffres de base D2 LoD (Arreat Summit, niveaux 1 à 20, P()).
 * Les champs listés dans mods/pd2/data/skills.ts (tables PD2 S13 du wiki, 60 niveaux) REMPLACENT ces
 * chiffres au chargement (skills.ts). Généré par tools/skilldata/gen.py, puis quelques temps de
 * recharge ajoutés à la main. Effets : src/sim/*.ts.
 */
import type { SorcSkill } from './skills';
import { P } from './ramp';

const S = (d: Omit<SorcSkill, 'icon'> & { icon?: string }): SorcSkill => ({ icon: d.id, ...d });

export const %s: SorcSkill[] = [
%s
];
""" % (title, cls_const, body)
    root = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'data', fname)
    open(os.path.abspath(root), 'w').write(out)
    print('écrit', fname, len(items), 'compétences')


import barbarian, paladin, amazon, assassin, necromancer  # noqa: E402

for mod in (barbarian, paladin, amazon, assassin, necromancer):
    mod.build(skill, write)
