#!/usr/bin/env python3
"""
Télécharge les icônes des compétences et types d'objets des classes (game-icons.net, CC BY 3.0) :
lit tools/icons/classes.txt (candidats par identifiant), enregistre assets-src/ui/game-icons/<id>.svg
et complète icons.txt (id auteur/nom). Ensuite : npx tsx tools/build-icons.ts
"""
import os, subprocess
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets-src/ui/game-icons')
OVERRIDE = {'prayer': ['lorc/holy-symbol'], 'holy_bolt': ['lorc/sun-radiance'], 'valkyrie': ['lorc/spartan'], 'battle_command': ['lorc/winged-shield'],
            'clay_golem': ['delapouite/golem-head'], 'type_scepter': ['delapouite/caduceus']}
known = {l.split()[0] for l in open(os.path.join(SRC, 'icons.txt')) if l.strip()}
add = []
for l in open(os.path.join(os.path.dirname(__file__), 'classes.txt')):
    row = l.split()
    if not row or l.startswith('#'):
        continue
    i = row[0]
    cands = OVERRIDE.get(i, []) + row[1:]
    if i in known:
        continue
    for c in cands:
        a, n = c.split('/')
        r = subprocess.run(['curl', '-s', '-m', '30', '-f', f'https://raw.githubusercontent.com/game-icons/icons/master/{a}/{n}.svg', '-o', os.path.join(SRC, i + '.svg')])
        if r.returncode == 0:
            add.append(f'{i} {c}')
            break
    else:
        print('manquant :', i)
with open(os.path.join(SRC, 'icons.txt'), 'a') as f:
    for a in add:
        f.write(a + '\n')
print(len(add), 'icônes ajoutées')
