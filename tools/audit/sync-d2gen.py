#!/usr/bin/env python3
"""Lance gen-monsters-d2.ts puis ajoute les propriétaires de sons (d2sound-map.ts) et les acteurs (tools/d2import/game-map.ts) manquants. Usage : python3 tools/audit/sync-d2gen.py"""
import subprocess, re
out = subprocess.run(['npx', 'tsx', 'tools/audit/gen-monsters-d2.ts'], capture_output=True, text=True).stdout
owners = re.findall(r"^  ([a-z_0-9]+): '([A-Z0-9]+)',$", out, re.M)
actors = re.findall(r"^  (mon\('[a-z_0-9]+', '[a-z0-9]+', \{ act: \d \}\)),$", out, re.M)
p = 'src/platform/d2sound-map.ts'
s = open(p).read()
for k, v in owners:
    if f"  {k}: '" not in s:
        s = s.replace("  hephasto: 'SMITH',", f"  hephasto: 'SMITH',\n  {k}: '{v}',", 1)
open(p, 'w').write(s)
p = 'tools/d2import/game-map.ts'
s = open(p).read()
for a in actors:
    if a not in s:
        s = s.replace("  mon('hephasto', '5p', { act: 4 }),", f"  mon('hephasto', '5p', {{ act: 4 }}),\n  {a},", 1)
open(p, 'w').write(s)
print(len(owners), 'propriétaires,', len(actors), 'acteurs')
