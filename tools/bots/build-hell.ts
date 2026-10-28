/** Monstres d'Enfer (niveau 85) que le build ne tue pas ou qui le tuent : npx tsx tools/bots/build-hell.ts <build> */
import '../mods/auto';
import { MONSTERS } from '../../src/data/monsters';
import { fightArena } from '../../src/sim/bot/arena';
const build = process.argv[2] as any;
const bad: string[] = [];
for (const def of MONSTERS.filter((d) => !d.coward && !d.boss)) {
  for (const rank of ['normal', 'champion', 'unique'] as const) {
    const count = rank === 'normal' ? 5 : rank === 'champion' ? 3 : 1;
    const r = fightArena({ monster: def.id, rank, count, level: 85, difficulty: 2, build, maxSec: 90 });
    if (r.died || r.perKillSec === null) bad.push(`${def.id}/${rank} ${r.died ? 'MORT' : ''} ${r.perKillSec?.toFixed(1)} life=${r.lifeLostPct}`);
  }
}
console.log(bad.join('\n'));
