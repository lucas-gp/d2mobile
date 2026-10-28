#!/usr/bin/env python3
"""
Extrait les données des mercenaires de Project Diablo 2 (wiki.projectdiablo2.com) vers mods/pd2/data/mercs.gen.ts :
  - tableaux de statistiques par niveau (page Mercenaries : vie, défense, force, dextérité, score d'attaque,
    résistances, dégâts de base) — identiques quelle que soit la difficulté d'embauche ;
  - niveaux de compétence par niveau de mercenaire et tables par niveau des compétences propres aux
    mercenaires (page Mercenary_Skills).
Usage (idempotent) :
    python3 mods/pd2/tools/mercs/gen-mercs-pd2.py [dossier contenant Mercenaries.html et Mercenary_Skills.html]
Sans dossier, les deux pages sont téléchargées (curl).
"""
import html, json, os, re, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
OUT = os.path.join(ROOT, 'mods/pd2/data/mercs.gen.ts')
WIKI = 'https://wiki.projectdiablo2.com/wiki/'


def page(name, alt=None):
    d = sys.argv[1] if len(sys.argv) > 1 else None
    if d:
        for n in (name, alt):
            if n and os.path.exists(os.path.join(d, n + '.html')):
                return open(os.path.join(d, n + '.html'), encoding='utf-8').read()
    return subprocess.run(['curl', '-s', '-m', '60', WIKI + name], check=True, capture_output=True, text=True).stdout


def cells(row):
    return [re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', c))).strip() for c in re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', row, re.S)]


def table_rows(t):
    return [cells(r) for r in re.findall(r'<tr.*?</tr>', t, re.S)]


def num(s):
    try:
        v = float(s.replace('%', '').replace('*', ''))
        return int(v) if v == int(v) else v
    except ValueError:
        return None


def key(label):
    return re.sub(r'_+', '_', re.sub(r'[^a-z0-9]+', '_', label.lower())).strip('_')


# ---------------------------------------------------------------- statistiques par niveau
src = page('Mercenaries')
stat_tables = [table_rows(t) for t in re.findall(r'<table.*?</table>', src, re.S)]
stat_tables = [t for t in stat_tables if t and t[0] and t[0][0] == 'Merc Level']
assert len(stat_tables) == 15, len(stat_tables)
ROWS = {'HP': 'hp', 'Defense': 'def', 'Str': 'str', 'Dex': 'dex', 'Attack Rating': 'ar', 'Resist': 'res', 'Dmg-Min': 'dmin', 'Dmg-Max': 'dmax'}
LEVELS = list(range(2, 99))
stats = {}
for act in range(1, 6):
    cols = {k: [] for k in ROWS.values()}
    lv = []
    for t in stat_tables[(act - 1) * 3: act * 3]:
        hdr = [x for x in t[0][1:] if x]
        lv += [int(x) for x in hdr]
        n = len(hdr)
        got = {}
        for r in t[1:]:
            if r[0] in ROWS:
                got[ROWS[r[0]]] = [num(x) for x in r[1:1 + n]]
        for k in cols:
            cols[k] += got.get(k) or [None] * n
    assert lv == LEVELS, (act, lv[:3])
    stats[act] = cols
# Acte IV : tableau du wiki vide (puis recopié de l'acte III à partir du niveau 79) : on reprend l'acte III
for k in stats[4]:
    stats[4][k] = [x if x is not None else stats[3][k][i] for i, x in enumerate(stats[4][k])]
# Lanceurs de sorts (actes III et IV) : ni score d'attaque ni dégâts d'arme
for act in (3, 4):
    for k in ('ar', 'dmin', 'dmax'):
        stats[act][k] = [x if x is not None else 0 for x in stats[act][k]]
for act, cols in stats.items():
    for k, v in cols.items():
        assert all(x is not None for x in v), (act, k)

# ---------------------------------------------------------------- compétences
src = page('Mercenary_Skills', 'x_Mercenary_Skills')
src = re.sub(r'<script.*?</script>|<style.*?</style>', '', src, flags=re.S)
parts = re.split(r'<h3[^>]*>(.*?)</h3>', src, flags=re.S)
bp, tables = {}, {}
for i in range(1, len(parts), 2):
    name = html.unescape(re.sub(r'<[^>]+>', '', parts[i])).strip()
    name = re.sub(r'\s*\(Mercenary-Only\)|\s*Aura$', '', name)
    sk = key(name)
    body = parts[i + 1].split('<h2', 1)[0]
    for t in (table_rows(t) for t in re.findall(r'<table.*?</table>', body, re.S)):
        if len(t) < 2 or not t[0]:
            continue
        if t[0][0] == 'Merc Level':
            if sk not in bp:
                ml = [num(x) for x in t[0][1:]]
                sl = [num(x) for x in t[1][1:]]
                bp[sk] = [[a, b] for a, b in zip(ml, sl) if a is not None and b is not None]
            continue
        lv = [num(x) for x in t[0][1:]]
        if not lv or lv[0] is None or not 1 <= lv[0] <= 5:
            continue
        rows = {}
        for r in t[1:]:
            vals = [num(x) for x in r[1:] if x != '']
            if r[0] and vals and all(v is not None for v in vals):
                # table commençant au-delà du niveau 1 (Tourbillon : niveau 4) : niveaux inférieurs = première valeur
                rows[key(r[0])] = [vals[0]] * (int(lv[0]) - 1) + vals
        if rows and sk not in tables:
            tables[sk] = rows

out = ['/**',
       ' * Données PD2 des mercenaires, générées par mods/pd2/tools/mercs/gen-mercs-pd2.py (wiki PD2 : Mercenaries et',
       ' * Mercenary_Skills). Ne pas éditer à la main : relancer le script.',
       " * Acte IV : le wiki ne publie pas le tableau des Ascendants ; on reprend celui de l'acte III.",
       ' */',
       '',
       'export interface MercStatTable {',
       '  hp: number[];',
       '  def: number[];',
       '  str: number[];',
       '  dex: number[];',
       '  ar: number[];',
       '  res: number[];',
       '  dmin: number[];',
       '  dmax: number[];',
       '}',
       '',
       "/** Niveau du premier élément des tableaux de statistiques (puis un par niveau jusqu'à 98) */",
       'export const MERC_STAT_LVL0 = 2;',
       '',
       '/** Statistiques de base par acte et par niveau de mercenaire (2 à 98) */',
       'export const MERC_STATS: Record<1 | 2 | 3 | 4 | 5, MercStatTable> = {']
for act in range(1, 6):
    out.append('  %d: {' % act)
    for k, v in stats[act].items():
        out.append('    %s: %s,' % (k, json.dumps(v, separators=(', ', ': '))))
    out.append('  },')
out += ['};', '',
        '/** Niveau de compétence selon le niveau du mercenaire : paliers [niveau du mercenaire, niveau de compétence] */',
        'export const MERC_SKILL_BP: Record<string, [number, number][]> = {']
for k in sorted(bp):
    out.append('  %s: %s,' % (k, json.dumps(bp[k], separators=(', ', ': '))))
out += ['};', '',
        '/** Tables par niveau de compétence (indice 0 = niveau 1) des compétences propres aux mercenaires */',
        'export const MERC_SKILL_TABLE: Record<string, Record<string, number[]>> = {']
for k in sorted(tables):
    out.append('  %s: {' % k)
    for rk, rv in tables[k].items():
        out.append('    %s: %s,' % (rk, json.dumps(rv, separators=(', ', ': '))))
    out.append('  },')
out.append('};')
open(OUT, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('écrit', OUT, '-', len(bp), 'paliers de compétences,', len(tables), 'tables')
