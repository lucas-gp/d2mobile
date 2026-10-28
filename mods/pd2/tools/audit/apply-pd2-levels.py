#!/usr/bin/env python3
"""Niveaux des monstres par zone d'après Project Diablo 2 (wiki « Zones » : Normal / Cauchemar / Enfer), appliqués aux tables levels-a*.ts générées d'après Levels.txt 1.13.
Usage : python3 mods/pd2/tools/audit/apply-pd2-levels.py  (à relancer après gen-levels-a*.ts)

La page liste les zones acte par acte (chaque acte commence par sa ville) puis des tables annexes (Matron's Den…, tableaux de monstres) dont les noms
reprennent ceux des zones : seules les lignes des cinq actes comptent, et un nom n'est lu que dans son acte (« Sewers Level 1 » existe en Acte II et en Acte III).
Les noms internes de Levels.txt (LevelName) diffèrent parfois du nom affiché que donne le wiki : table ALIAS."""
import json, re, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
norm = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
TOWNS = ['Rogue Encampment', 'Lut Gholein', 'Kurast Docks', 'The Pandemonium Fortress', 'Harrogath']
# LevelName (Levels.txt) → nom affiché (wiki PD2)
ALIAS = {
    'Spider Cave': 'Arachnid Lair',
    'Rigid Highlands': 'Frigid Highlands',
    'Tundra Wastelands': 'Frozen Tundra',
    'Crystalized Cavern Level 1': 'Crystalline Passage',
    'Cellar of Pity': 'Frozen River',
    'Crystalized Cavern Level 2': 'Glacial Trail',
    'Echo Chamber': 'Drifter Cavern',
    'Glacial Caves Level 1': "The Ancients' Way",
    'Glacial Caves Level 2': 'Icy Cellar',
    "Halls of Death's Calling": 'Halls of Pain',
    'The Worldstone Keep Level 1': 'Worldstone Keep Level 1',
    'The Worldstone Keep Level 2': 'Worldstone Keep Level 2',
    'The Worldstone Keep Level 3': 'Worldstone Keep Level 3',
    'Hell1': 'Abaddon',
    'Hell2': 'Pit of Acheron',
    'Hell3': 'Infernal Pit',
}
pd2 = {}  # acte (1-5) -> nom normalisé -> [N, C, E]
act = 0
for name, a, b, c in json.load(open(os.path.join(os.path.dirname(__file__), 'pd2-zones.json'))):
    if name in TOWNS:
        act = TOWNS.index(name) + 1
        continue
    if name == "Matron's Den":
        break
    if act and a != '-':
        pd2.setdefault(act, {}).setdefault(norm(name), [int(a), int(b), int(c)])
changed = 0
for n, f in [(1, 'levels-a1.ts'), (2, 'levels-a2.ts'), (3, 'levels-a3.ts'), (5, 'levels-a5.ts')]:
    p = os.path.join(ROOT, 'src/data', f)
    out = []
    for ln in open(p).read().split('\n'):
        m = re.search(r"name: '((?:[^'\\]|\\.)*)'.*?lvl: \[(\d+), (\d+), (\d+)\]", ln)
        if m:
            raw = m.group(1).replace("\\'", "'").strip()
            key = norm(ALIAS.get(raw, raw))
            want = pd2.get(n, {}).get(key)
            old = [int(m.group(i)) for i in (2, 3, 4)]
            if want and want != old:
                ln = ln.replace(f"lvl: [{old[0]}, {old[1]}, {old[2]}]", f"lvl: [{want[0]}, {want[1]}, {want[2]}]", 1)
                changed += 1
        out.append(ln)
    open(p, 'w').write('\n'.join(out))
print('zones mises à niveau PD2 :', changed)
