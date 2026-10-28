/**
 * Comparaison des builds (les sept classes) à l'arène : mêmes monstres, mêmes niveaux et
 * difficultés que le bot de combat, personnage de référence de chaque build. Médiane du temps
 * de mise à mort par rang (écart à TTK_TARGETS), morts, vie perdue.
 *   npx tsx tools/bots/class-arena.ts [builds…]   (défaut : cold fire light wind fissure bear summon)
 */
import '../mods/auto';
import { MONSTERS } from '../../src/data/monsters';
import { TTK_TARGETS } from '../../src/data/curves';
import type { Difficulty, MonsterRank } from '../../src/data/types';
import { fightArena, type ArenaResult } from '../../src/sim/bot/arena';
import type { BuildId } from '../../src/sim/bot/brain';

const HOME: Record<string, [number, number, number]> = {
  fallen: [8, 40, 82],
  fallen_shaman: [8, 40, 82],
  zombie: [8, 40, 82],
  skeleton: [8, 40, 82],
  skeleton_archer: [8, 40, 82],
  griswold: [12, 40, 82],
};
const DEFAULT_HOME: [number, number, number] = [20, 50, 85];
const builds = (
  process.argv.slice(2).length
    ? process.argv.slice(2)
    : ['cold', 'fire', 'light', 'wind', 'fissure', 'bear', 'summon', 'whirlwind', 'frenzy', 'hammerdin', 'zealot', 'javazon', 'bowazon', 'trapsin', 'martial', 'summoner', 'bonemancer', 'pnova']
) as BuildId[];

const rows: Record<string, Record<string, string>> = {};
for (const build of builds) {
  const results: ArenaResult[] = [];
  for (const def of MONSTERS.filter((d) => !d.coward && !d.boss)) {
    const home = HOME[def.id] ?? DEFAULT_HOME;
    for (const d of [0, 1, 2] as Difficulty[]) {
      for (const rank of ['normal', 'champion', 'unique'] as MonsterRank[]) {
        const count = rank === 'normal' ? 5 : rank === 'champion' ? 3 : 1;
        results.push(fightArena({ monster: def.id, rank, count, level: home[d], difficulty: d, build, maxSec: 90 }));
      }
    }
  }
  const row: Record<string, string> = {};
  for (const d of [0, 1, 2] as Difficulty[]) {
    for (const rank of ['normal', 'champion', 'unique'] as MonsterRank[]) {
      const rs = results.filter((r) => r.rank === rank && r.difficulty === d);
      const ok = rs
        .filter((r) => r.perKillSec !== null)
        .map((r) => r.perKillSec!)
        .sort((a, b) => a - b);
      const med = ok.length ? ok[Math.floor(ok.length / 2)] : null;
      const deaths = rs.filter((r) => r.died).length;
      row[`${rank[0]}${d}`] = `${med === null ? '—' : `×${(med / TTK_TARGETS[rank]).toFixed(1)}`}${deaths ? ` †${deaths}` : ''}`;
    }
  }
  const lost = Math.round(results.reduce((s, r) => s + r.lifeLostPct, 0) / results.length);
  row.vie = `${lost} %`;
  row.morts = `${results.filter((r) => r.died).length}/${results.length}`;
  rows[build] = row;
  console.log(build, JSON.stringify(row));
}
console.table(rows);
