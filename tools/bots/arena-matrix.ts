/**
 * Matrice d’arène : chaque monstre (8 normaux, 4 champions) contre le personnage de référence en Enfer.
 *   npx tsx tools/bots/arena-matrix.ts 87
 */
import '../mods/auto';
import { MONSTERS } from '../../src/data/monsters';
import { fightArena } from '../../src/sim/bot/arena';
const lvl = Number(process.argv[2] ?? 87);
for (const def of MONSTERS) {
  if (def.boss) continue;
  const row: string[] = [];
  for (const [rank, count] of [
    ['normal', 8],
    ['champion', 4],
  ] as const) {
    let died = 0,
      lost = 0,
      t = 0;
    for (let s = 1; s <= 3; s++) {
      const r = fightArena({ monster: def.id, rank, count, level: lvl, difficulty: 2, build: 'cold', maxSec: 90, seed: s });
      if (r.died) died++;
      lost += r.lifeLostPct;
      t += r.clearSec ?? 90;
    }
    row.push(`${rank} ×${count}: morts ${died}/3 vie perdue ${(lost / 3).toFixed(0)}% ${(t / 3).toFixed(0)}s`);
  }
  console.log(def.id.padEnd(20), row.join(' | '));
}
