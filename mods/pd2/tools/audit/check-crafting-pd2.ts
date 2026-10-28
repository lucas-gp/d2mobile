/**
 * Vérifie l'artisanat du jeu contre le tableau « Crafting Comparison Chart » de la page Crafting du wiki PD2
 * (texte extrait du HTML, une cellule par ligne « Rune + P.Gemme / prop / prop / prop »).
 * Compare, par famille et par emplacement : la rune (CRAFT_RUNES), le nombre de propriétés fixes et leurs plages (CRAFT_MODS).
 * Les carquois n'existent pas dans le jeu : leur ligne est ignorée.
 * Usage : npx tsx mods/pd2/tools/audit/check-crafting-pd2.ts [Crafting.txt]   (sortie non nulle s'il y a un écart)
 */
import { readFileSync } from 'node:fs';
import type { CraftFamily } from '../../../../src/data/cube';
import { CRAFT_MODS, CRAFT_RUNES } from '../../data/cube';
import { RUNES } from '../../../../src/data/items/runes';

const file = process.argv[2] ?? 'tmp/Crafting.txt';
const lines = readFileSync(file, 'utf8').split('\n');
const start = lines.findIndex((l) => l.startsWith('Crafting Comparison Chart'));
const end = lines.findIndex((l, i) => i > start && l.startsWith('Blood Items'));
const chart = lines.slice(start, end);

const FAMILIES: CraftFamily[] = ['blood', 'caster', 'hitpower', 'safety', 'vampiric', 'bountiful', 'brilliant'];
const SLOTS: Record<string, string | null> = {
  Amulet: 'amulet',
  Ring: 'ring',
  Belt: 'belt',
  Gloves: 'gloves',
  Boots: 'boots',
  Helm: 'helm',
  Chest: 'armor',
  Quiver: null,
  Shield: 'shield',
  Weapon: 'weapon',
};
const RUNE_ID = Object.fromEntries(RUNES.map((r) => [r.name, r.id]));

/** Plage d'une propriété du wiki : « [a-b] » ou le premier nombre ; [1, 1] pour une propriété sans valeur (Knockback, Half Freeze Duration) */
function range(txt: string): [number, number] {
  const m = txt.match(/\[(\d+)-(\d+)\]/);
  if (m) return [Number(m[1]), Number(m[2])];
  // « 5% CtC Level 4 Frost Nova » : le premier nombre est la chance
  const n = txt.match(/(\d+)/);
  return n ? [Number(n[1]), Number(n[1])] : [1, 1];
}

const errs: string[] = [];
let checked = 0;
for (let i = 0; i < chart.length; i++) {
  const head = chart[i].match(/^(\w+) \/ $/);
  if (!head || !(head[1] in SLOTS)) continue;
  const slot = SLOTS[head[1]];
  const cells = chart
    .slice(i + 1)
    .filter((l) => l.includes(' + P.'))
    .slice(0, 7);
  if (!slot) continue;
  cells.forEach((cell, k) => {
    const fam = FAMILIES[k];
    const [ing, ...props] = cell.split(' / ').map((s) => s.trim());
    const rune = RUNE_ID[ing.split(' + ')[0]];
    if (CRAFT_RUNES[fam][slot] !== rune) errs.push(`${fam} ${slot} : rune ${CRAFT_RUNES[fam][slot]} ≠ wiki ${ing}`);
    const ours = CRAFT_MODS[fam][slot] ?? [];
    if (ours.length !== props.length) errs.push(`${fam} ${slot} : ${ours.length} propriétés ≠ wiki ${props.length} (${props.join(' ; ')})`);
    const want = props
      .map(range)
      .map(([a, b]) => `${a}-${b}`)
      .sort();
    const have = ours.map((m) => `${m.min}-${m.max}`).sort();
    if (want.join() !== have.join()) errs.push(`${fam} ${slot} : plages ${have.join(', ')} ≠ wiki ${want.join(', ')} (${props.join(' ; ')})`);
    checked++;
  });
}
console.log(`${checked} recettes comparées (7 familles × 9 emplacements attendues = 63)`);
if (checked !== 63) errs.push(`tableau mal lu : ${checked} cellules`);
for (const e of errs) console.log(`ÉCART ${e}`);
if (errs.length) process.exit(1);
console.log('Artisanat conforme au tableau PD2.');
