#!/usr/bin/env python3
"""
Lecture du wiki Project Diablo 2 (wiki.projectdiablo2.com) : pages HTML mises en cache dans un dossier
(PD2WIKI, défaut ./.cache/pd2wiki), téléchargées avec curl si absentes. Fournit :
  - item_sections(html) : objets d'une page « All_Items » / « Runewords » (nom, encadré, lignes Avant/Après) ;
  - base_damage(html), base_defense(html) : tableaux Avant/Après de la page Item_Bases.
Utilisé par extract-pd2.py (qui produit les JSON versionnés de tools/itemdata).
"""
import html as H
import os
import re
import subprocess

CACHE = os.environ.get('PD2WIKI', './.cache/pd2wiki')

# nom de base du wiki → identifiants du jeu quand ils diffèrent (noms internes D2 mal orthographiés, doublons
# bases.ts / bases-classes.ts : le premier identifiant est celui des uniques D2)
BASE_ALIAS = {
    'Ballista': ['balista'], 'Colossus Sword': ['colossal_sword'], 'Conqueror Crown': ['conquerer_crown'], 'Demon Head': ['demon_head_bone'], 'Espandon': ['espadon'],
    'Gilded Shield': ['guilded_shield'], 'Greaves': ['plate_boots'], 'Hellforge Plate': ['hellforged_plate'], 'Hierophant Trophy': ['heirophant_trophy'],
    'Kurast Shield': ['ancient_shield_sacred'], 'Large Siege Bow': ['long_siege_bow'], 'Matriarchal Javelin': ['matriarchaljavelin'], 'Mithril Point': ['mithral_point'],
    'Ornate Plate': ['ornate_armor'], 'Plated Belt': ['girdle_h'], 'Sabre': ['saber'], 'Shillelagh': ['shillelah'], 'Stiletto': ['stilleto'], 'Succubus Skull': ['succubae_skull'],
    'Chain Gloves': ['bracers_m'], 'Light Plated Boots': ['light_plate_boots'], 'Boots': ['leather_boots', 'boots'], 'Sash': ['sash_l', 'sash'], 'Belt': ['belt_m', 'belt'],
    'Leather Gloves': ['gloves_l', 'leather_gloves'], 'Kris': ['kriss', 'kris'], 'Gauntlets': ['gaunlets_h', 'gauntlets'], 'Heavy Belt': ['heavy_belt'],
}


def base_ids(name, known):
    """Identifiants du jeu pour un nom de base du wiki (liste vide si la base n'existe pas)."""
    s = re.sub(r'[^a-z0-9]+', '_', name.strip().lower().replace("'", '').replace('’', '')).strip('_')
    return [i for i in BASE_ALIAS.get(name, [s]) if i in known]
URL = 'https://wiki.projectdiablo2.com/wiki/'


def page(name):
    """HTML d'une page du wiki (cache local, sinon curl)."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name + '.html')
    if not os.path.exists(path) or os.path.getsize(path) < 1000:
        subprocess.run(['curl', '-s', '-m', '60', '-L', '-o', path, URL + name], check=True)
    return open(path, encoding='utf8', errors='ignore').read()


def text(cell):
    """Texte d'une cellule HTML (balises retirées, espaces normalisés ; <br> → ' / ')."""
    s = re.sub(r'<br ?/?>', ' / ', cell)
    s = re.sub(r'<[^>]+>', '', s)
    s = H.unescape(s).replace('\xa0', ' ')
    return re.sub(r'\s+', ' ', s).strip()


def cells(row):
    return re.findall(r'<t([dh])([^>]*)>(.*?)(?=<t[dh][ >]|$)', row, re.S)


def item_sections(src):
    """Liste de {name, level, info: [lignes], rows: [[avant, après]]} pour chaque titre d'objet suivi d'un tableau.
    Une ligne à une seule cellule (objet « New ») donne avant = None."""
    out = []
    heads = list(re.finditer(r'<h([2-5]) id="[^"]*"[^>]*>(.*?)</h\1>', src, re.S))
    for i, h in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(src)
        body = src[h.end():end]
        name = text(h.group(2))
        info = []
        m = re.search(r'<div class="item-info-box">(.*?)</div>', body, re.S)
        if m:
            info = [text(x) for x in re.findall(r'<p>(.*?)</p>', m.group(1), re.S)]
        t = re.search(r'<table class="wikitable[^"]*">(.*?)</table>', body, re.S)
        if not t:
            continue
        rows = []
        for r in re.findall(r'<tr>(.*?)</tr>', t.group(1), re.S):
            cs = cells(r)
            if not cs or all(k == 'h' for k, _, _ in cs):
                continue
            vals = [text(c) for _, _, c in cs]
            if len(vals) == 1:
                rows.append([None, vals[0]])
            else:
                rows.append([vals[0], vals[-1]])
        out.append({'name': name, 'level': int(h.group(1)), 'pos': h.start(), 'info': info, 'rows': rows})
    return out


def _table(src, caption):
    a = src.find('<caption>' + caption)
    if a < 0:
        raise SystemExit('tableau introuvable : ' + caption)
    b = src.find('</table>', a)
    rows = []
    for r in re.findall(r'<tr>(.*?)</tr>', src[a:b], re.S):
        rows.append([c for _, _, c in cells(r)])
    return rows


def _rng(s):
    m = re.match(r'^(\d+)(?:-(\d+))?$', s.strip())
    if not m:
        return None
    lo = int(m.group(1))
    return [lo, int(m.group(2)) if m.group(2) else lo]


def _parts(cell):
    """Une cellule « 8-17<br>2-9 » → ['8-17', '2-9']."""
    return [text(x) for x in re.split(r'<br ?/?>', cell) if text(x)]


def base_damage(src):
    """{nom anglais: {'before': [[lo,hi],…], 'after': [[lo,hi],…]}} ; plusieurs valeurs = deux mains / une main
    (épées à deux mains) ou lancer / mêlée (armes de jet, javelots)."""
    out = {}
    for row in _table(src, 'Base Damage')[1:]:
        # 3 groupes de 5 colonnes (nom, avant, après, %, moyenne) séparés par une colonne vide
        grp = [c for c in row]
        for k in range(0, len(grp), 5):
            g = grp[k:k + 5]
            if len(g) < 3 or not text(g[0]):
                continue
            name = text(g[0])
            before = [_rng(x) for x in _parts(g[1])]
            after = [_rng(x) for x in _parts(g[2])] or before
            out[name] = {'before': before, 'after': after}
    return out


def base_defense(src):
    """{nom anglais: {'before': [lo,hi], 'after': [lo,hi]}} (défense de base Avant/Après)."""
    out = {}
    for row in _table(src, 'Base Defense')[1:]:
        for k in range(0, len(row), 5):
            g = row[k:k + 5]
            if len(g) < 3 or not text(g[0]):
                continue
            before = _rng(text(g[1]))
            if not before:
                continue
            after = _rng(text(g[2])) or before
            out[text(g[0])] = {'before': before, 'after': after}
    return out


def base_sockets(src):
    """{nom anglais: [ilvl 1-25, 26-40, 41+]} : châsses maximales PD2 (« After », sinon « Before »)."""
    out = {}
    for cap in ('Maximum Sockets for Weapons', 'Maximum Sockets for Armor'):
        for row in _table(src, cap)[1:]:
            for k in range(0, len(row), 3):
                g = [text(x) for x in row[k:k + 3]]
                if len(g) < 2 or not g[0]:
                    continue
                v = g[2] if len(g) > 2 and g[2] else g[1]
                if not re.fullmatch(r'\d+(/\d+/\d+)?', v):
                    continue
                n = [int(x) for x in v.split('/')]
                out[g[0]] = n * 3 if len(n) == 1 else n
    return out


def _current(cell):
    """Phrases d'une cellule où l'ancienne valeur suit la nouvelle (<span class="omod">) : on garde la nouvelle."""
    out = []
    for part in re.split(r'<br ?/?>', re.sub(r'</t[dh]>\s*$', '', cell.strip())):
        if re.fullmatch(r'\s*<span class="omod">.*</span>\s*', part, re.S):
            continue
        t = text(part).rstrip(',').strip()
        if t:
            out.append(t)
    return out


def rune_table(src):
    """{nom: {'level': int|None, 'weapon': [phrases], 'armor': [...], 'shield': [...]}} (page Runes : runes puis gemmes)."""
    out = {}
    for t in re.findall(r'<table class="wikitable[^"]*">(.*?)</table>', src, re.S):
        rows = [cells(r) for r in re.findall(r'<tr>(.*?)</tr>', t, re.S)]
        head = [text(c) for _, _, c in rows[0]] if rows else []
        if 'Weapon' not in head:
            continue
        iname = head.index('Name')
        for r in rows[1:]:
            cs = [c for _, _, c in r]
            if len(cs) < len(head):
                continue
            name = text(cs[iname])
            lvl = text(cs[head.index('Level')])
            iw = head.index('Weapon')
            out[name] = {'level': int(lvl) if lvl.isdigit() else None, 'weapon': _current(cs[iw]), 'armor': _current(cs[iw + 1]), 'shield': _current(cs[iw + 2])}
    return out
