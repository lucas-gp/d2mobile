/**
 * Complète src/render/gear-look.ts d'après armor.txt : code de calque (colonne `alternategfx`) de chaque casque et bouclier du jeu qui n'y figure pas encore.
 * Usage : npx tsx tools/audit/gen-gear-look.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { rows, slug } from './common';
import { BASE_BY_ID } from '../../src/data/items/index';

const file = 'src/render/gear-look.ts';
let s = readFileSync(file, 'utf8');
const have = (table: string) => new Set([...s.slice(s.indexOf(`export const ${table}`), s.indexOf('};', s.indexOf(`export const ${table}`))).matchAll(/^\s+(\w+):/gm)].map((m) => m[1]));
const add = { HEAD_LOOK: [] as string[], SHIELD_LOOK: [] as string[] };
const h = have('HEAD_LOOK');
const sh = have('SHIELD_LOOK');
for (const r of rows('armor')) {
  const id = slug(String(r.name));
  const b = (BASE_BY_ID as Record<string, { type: string }>)[id];
  const code = String(r.alternategfx ?? '').toLowerCase();
  if (!b || !code) continue;
  if (['helm', 'circlet', 'pelt', 'primal', 'head'].includes(b.type) && !h.has(id)) add.HEAD_LOOK.push(`  ${id}: '${code}',`);
  if (b.type === 'shield' && !sh.has(id)) add.SHIELD_LOOK.push(`  ${id}: '${code}',`);
}
for (const t of ['HEAD_LOOK', 'SHIELD_LOOK'] as const) {
  if (!add[t].length) continue;
  const end = s.indexOf('};', s.indexOf(`export const ${t}`));
  s = s.slice(0, end) + add[t].join('\n') + '\n' + s.slice(end);
}
// bottes et gants : palier du calque de jambes (bottes) ou de bras (gants) d'après alternategfx (l = léger, v / m = moyen, h = lourd)
const tier = (c: string): string => (c.startsWith('h') ? 'hvy' : c.startsWith('l') ? 'lit' : 'med');
const boots: string[] = [];
const gloves: string[] = [];
for (const r of rows('armor')) {
  const id = slug(String(r.name));
  const b = (BASE_BY_ID as Record<string, { type: string }>)[id];
  const code = String(r.alternategfx ?? '').toLowerCase();
  if (!b || !code) continue;
  if (b.type === 'boots') boots.push(`  ${id}: '${tier(code)}',`);
  if (b.type === 'gloves') gloves.push(`  ${id}: '${tier(code)}',`);
}
s = s.replace(/\n\/\*\* Bottes[\s\S]*$/, '');
s += `\n/** Bottes : palier du calque de jambes (lit / med / hvy) à superposer au corps — généré par tools/audit/gen-gear-look.ts */\nexport const BOOT_LOOK: Record<string, string> = {\n${boots.join('\n')}\n};\n\n/** Gants : palier des calques de bras */\nexport const GLOVE_LOOK: Record<string, string> = {\n${gloves.join('\n')}\n};\n`;
writeFileSync(file, s);
console.log('têtes ajoutées :', add.HEAD_LOOK.length, 'boucliers :', add.SHIELD_LOOK.length, '\n' + [...add.HEAD_LOOK, ...add.SHIELD_LOOK].join('\n'));
