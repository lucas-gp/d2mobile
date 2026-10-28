#!/usr/bin/env python3
"""
Extrait du wiki Project Diablo 2 les données d'objets utilisées par les scripts apply-pd2-*.py et gen-runewords.py,
et les écrit en JSON versionné dans tools/itemdata (relançable ; pages en cache dans PD2WIKI, voir pd2wiki.py) :
  - pd2-bases.json      : dégâts et défenses de base Avant/Après, châsses maximales par palier d'ilvl (page Item_Bases) ;
  - pd2-uniques.json    : uniques (page All_Items, hors sets et mots runiques) : base, niveau requis, ilvl minimal, lignes Avant/Après ;
  - pd2-runewords.json  : mots runiques (page Runewords) : châsses et types, runes, niveau requis, lignes Avant/Après ;
  - pd2-runes.json      : effets des runes et gemmes par emplacement (page Runes, valeurs actuelles).

    python3 mods/pd2/tools/itemdata/extract-pd2.py
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pd2wiki  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))


def dump(name, data):
    with open(os.path.join(HERE, name), 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')
    print(name, len(data))


# --- bases ---------------------------------------------------------------------------------
src = pd2wiki.page('Item_Bases')
dump('pd2-bases.json', {'damage': pd2wiki.base_damage(src), 'defense': pd2wiki.base_defense(src), 'sockets': pd2wiki.base_sockets(src)})

# --- uniques -------------------------------------------------------------------------------
src = pd2wiki.page('All_Items')
# les sections de niveau 1 découpent la page : on ne garde que les catégories d'uniques
cats = [(m.start(), pd2wiki.text(m.group(1))) for m in re.finditer(r'<h1 id="[^"]*"[^>]*>(.*?)</h1>', src, re.S)]
SKIP_CAT = re.compile(r'Set|Runeword|Rune|Gem', re.I)
uniques = {}
for sec in pd2wiki.item_sections(src):
    pos = sec['pos']
    cat = ''
    for p, c in cats:
        if p <= pos:
            cat = c
    if SKIP_CAT.search(cat) or not sec['info'] or sec['name'].startswith('Set Bonuses'):
        continue
    info = sec['info']
    req = next((int(m.group(1)) for x in info for m in [re.match(r'Required Level: (\d+)', x)] if m), None)
    ilvl = next((int(m.group(1)) for x in info for m in [re.match(r'Minimum Item Level: (\d+)', x)] if m), None)
    only = next((m.group(1) for x in info for m in [re.match(r'\((\w+) Only\)', x)] if m), None)
    base = re.sub(r'\s*\((?:normal|exceptional|elite)\)\s*$', '', info[0]).strip()
    uniques[sec['name']] = {'category': cat, 'base': base, 'reqLvl': req, 'ilvl': ilvl, 'classOnly': only, 'rows': sec['rows'],
                            'new': all(b is None for b, _ in sec['rows'])}
dump('pd2-uniques.json', uniques)

# --- mots runiques -------------------------------------------------------------------------
src = pd2wiki.page('Runewords')
rws = []
for sec in pd2wiki.item_sections(src):
    if len(sec['info']) < 3 or 'Socket' not in sec['info'][0]:
        continue
    req = int(re.search(r'(\d+)', sec['info'][2]).group(1))
    rws.append({'name': sec['name'], 'sockets': sec['info'][0], 'runes': [x.strip() for x in sec['info'][1].split('•')], 'reqLvl': req,
                'rows': sec['rows'], 'new': all(b is None for b, _ in sec['rows'])})
dump('pd2-runewords.json', rws)

# --- runes et gemmes -----------------------------------------------------------------------
dump('pd2-runes.json', pd2wiki.rune_table(pd2wiki.page('Runes')))
