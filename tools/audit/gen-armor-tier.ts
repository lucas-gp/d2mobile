/** Génère le tableau des paliers d'armure de src/render/armor-tier.ts d'après armor.txt (colonne Torso des plastrons). Usage : npx tsx tools/audit/gen-armor-tier.ts */
import { readFileSync, writeFileSync } from 'node:fs';
import { rows, slug } from './common';
import { BASE_BY_ID } from '../../src/data/items/index';

const out: string[] = [];
for (const r of rows('armor')) {
  if (String(r.type) !== 'tors' || !r.name) continue;
  const id = slug(r.name);
  if (!(BASE_BY_ID as Record<string, unknown>)[id]) continue;
  // colonne Torso d'armor.txt : 0 calque léger (lit), 1 moyen (med), 2 lourd (hvy)
  const t = Number(r.Torso ?? r.torso ?? 0);
  if (t === 1) out.push(`  ${id}: 'med',`);
  else if (t === 2) out.push(`  ${id}: 'hvy',`);
}
const unknown: string[] = [];
const file = 'src/render/armor-tier.ts';
let s = readFileSync(file, 'utf8');
const a = s.indexOf('const TIER: Record<string, ArmorTier> = {');
const b = s.indexOf('};', a) + 2;
s = s.slice(0, a) + 'const TIER: Record<string, ArmorTier> = {\n' + [...new Set(out)].sort().join('\n') + '\n};' + s.slice(b);
writeFileSync(file, s);
console.log(`${out.length} armures moyennes ou lourdes ; inconnues : ${unknown.join(' ')}`);
