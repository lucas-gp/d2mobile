/**
 * Durabilité de base des armes et armures d'après armor.txt / weapons.txt (colonne `durability`) → src/data/items/durability.ts.
 * Usage : npx tsx tools/itemdata/gen-durability.ts
 */
import { writeFileSync } from 'node:fs';
import { rows, num } from '../audit/common';
import { BASES } from '../../src/data/items/bases';

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const dur = new Map<string, number>();
for (const t of ['armor', 'weapons']) for (const r of rows(t)) if (r.name && num(r.durability)) dur.set(norm(r.name), num(r.durability));
const out: Record<string, number> = {};
let miss = 0;
for (const b of BASES) {
  if (!b.slot || b.type === 'ring' || b.type === 'amulet' || b.type.endsWith('charm') || b.type === 'jewel') continue;
  const d = dur.get(norm(b.id)) ?? dur.get(norm(b.name));
  if (d) out[b.id] = d;
  else miss++;
}
const body = Object.entries(out)
  .map(([k, v]) => `  ${k}: ${v},`)
  .join('\n');
writeFileSync(
  'src/data/items/durability.ts',
  `/** Durabilité de base des armes et armures (armor.txt / weapons.txt). Généré par tools/itemdata/gen-durability.ts. */\nexport const BASE_DURABILITY: Record<string, number> = {\n${body}\n};\n`,
);
console.log('bases avec durabilité', Object.keys(out).length, 'sans table', miss);
