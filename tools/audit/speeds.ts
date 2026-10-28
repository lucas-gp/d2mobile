/** Audit : vitesse de marche des monstres (nous, unités/s) contre monstats.txt (Velocity / Run en sous-cases/s ; 1 sous-case = 0,5 unité). Usage : npx tsx tools/audit/speeds.ts */
import '../mods/auto';
import { rows, num } from './common';
import { MONSTERS } from '../../src/data/monsters';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./monsters.ts', import.meta.url), 'utf8');
const map = Object.fromEntries([...src.matchAll(/(\w+): '([\w-]+)'/g)].map((m) => [m[1], m[2]]));
const ms = new Map(rows('monstats').map((r) => [String(r.id ?? r.Id ?? '').toLowerCase(), r]));
const out: string[] = ['id | nous (u/s) | D2 marche | D2 course | rapport nous/course'];
for (const m of Object.values(MONSTERS) as { id: string; speed: number }[]) {
  const d2 = ms.get((map[m.id] ?? m.id).toLowerCase());
  if (!d2) continue;
  const vel = num(d2.velocity ?? d2.Velocity) * 0.5;
  const run = num(d2.run ?? d2.Run) * 0.5;
  out.push(`${m.id} | ${m.speed} | ${vel} | ${run} | ${(m.speed / (run || vel || 1) || 0).toFixed(2)}`);
}
console.log(out.join('\n'));
