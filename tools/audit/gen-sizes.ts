/**
 * Génère src/data/items/sizes-d2.ts : taille en cases (invwidth × invheight) de chaque base D2 présente chez nous, d'après armor.txt / weapons.txt (patch 1.13+).
 * Usage : npx tsx tools/audit/gen-sizes.ts
 */
import { writeFileSync } from 'node:fs';
import { rows, num, slug } from './common';
import { BASE_BY_ID } from '../../src/data/items/index';

const out: string[] = [];
for (const t of ['armor', 'weapons']) {
  for (const r of rows(t)) {
    if (!r.name || r.name === 'Expansion' || r.spawnable === '') continue;
    const id = slug(r.name);
    if (!(BASE_BY_ID as Record<string, unknown>)[id]) continue;
    out.push(`  ${id}: [${num(r.invwidth)}, ${num(r.invheight)}],`);
  }
}
const uniq = [...new Set(out)].sort();
writeFileSync(
  'src/data/items/sizes-d2.ts',
  `/** Taille en cases des bases D2 (armor.txt / weapons.txt). Généré par tools/audit/gen-sizes.ts : ne pas modifier à la main. */
export const D2_SIZES: Record<string, [number, number]> = {
${uniq.join('\n')}
};
`,
);
console.log(`${uniq.length} tailles`);
