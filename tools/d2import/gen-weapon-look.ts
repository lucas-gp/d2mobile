/**
 * Génère src/render/weapon-look.ts : pour chaque arme du jeu, le code de calque D2 (colonne « normcode » de weapons.txt : les versions
 * exceptionnelles et élites reprennent le dessin de la version normale), la classe d'arme D2 à une et deux mains.
 *   npx tsx tools/d2import/gen-weapon-look.ts
 */
import { writeFileSync } from 'node:fs';
import { Vfs } from './vfs';
import { BASES } from '../../src/data/items/bases';

const vfs = Vfs.open(process.env.D2_INPUT_DIR ?? `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/in`, []);
const t = Buffer.from(vfs.get('data\\global\\excel\\weapons.txt')!)
  .toString('latin1')
  .split(/\r?\n/)
  .map((l) => l.split('\t'));
const h = t[0];
const ix = (n: string) => h.indexOf(n);
const byName = new Map(t.slice(1).map((c) => [c[ix('name')]?.toLowerCase(), c]));
const wtypes = new Set(['staff', 'orb', 'wand', 'sword', 'dagger', 'mace', 'axe', 'bow', 'polearm', 'spear', 'javelin', 'claw', 'scepter', 'crossbow', 'thrown']);
const rows: string[] = [];
for (const b of BASES.filter((b) => wtypes.has(b.type))) {
  const c = byName.get(b.id.replace(/_/g, ' ').toLowerCase());
  if (!c || !c[ix('normcode')]) continue;
  rows.push(`  ${b.id}: ['${c[ix('normcode')]}', '${c[ix('wclass')]}', '${c[ix('2handedwclass')]}'],`);
}
writeFileSync(
  new URL('../../src/render/weapon-look.ts', import.meta.url),
  `/**
 * Apparence des armes portées : [code de calque D2 (« normcode » de weapons.txt), classe d'arme à une main, classe d'arme à deux mains] de chaque base.
 * La planche \`<classe>_rh_<code>\` (ou \`_lh_\` pour les arcs) est superposée au corps quand l'import D2 la fournit et que la classe d'arme du corps correspond.
 * Généré par tools/d2import/gen-weapon-look.ts ; une base absente n'a pas d'arme visible.
 */
export const WEAPON_LOOK: Record<string, [string, string, string]> = {
${rows.join('\n')}
};
`,
);
console.log(rows.length, 'armes');
