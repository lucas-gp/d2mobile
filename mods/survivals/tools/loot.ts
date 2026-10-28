/**
 * Loot and gold of a Survivals round (lot 285), headless: a character at the round's recommended level plays it in automatic control
 * (kept alive) for `seconds` of play; counted: kills, items dropped by kind and quality, gold gained, items equipped, kept and turned to
 * gold by the mode's pickup, against the prices of the equipment vendor (its stall at the character's level).
 *   npx tsx mods/survivals/tools/loot.ts [round=a1r3] [seconds=300] [difficulty=0] [level=recommended]
 */
import { activateForTools } from '../../../tools/mods/node';

await activateForTools('d2+survivals');
const { referenceCharacter } = await import('../../../src/sim/bot/arena');
const { withDefaultSettings } = await import('../../../src/sim/save');
const { TICK_HZ } = await import('../../../src/sim/constants');
const { BASE_BY_ID } = await import('../../../src/data/items/bases');
const { ROUND_BY_ID } = await import('../data/chapters');
const { pickupStats } = await import('../sim/loot');

const [round = 'a1r3', secS = '300', diffS = '0', lvlS] = process.argv.slice(2);
const d = Number(diffS) as 0 | 1 | 2;
const level = Number(lvlS ?? ROUND_BY_ID[round]?.recLevel[d] ?? 10);
const g = referenceCharacter(level, 'fire', 1);
g.character.progression.highestDifficulty = d;
g.settings = withDefaultSettings({ ...g.settings, mods: { survivals: { control: 'auto', cards: 'auto' } } }, true);
if (!g.startRun(`survivals:${round}`, d, 1)) throw new Error(`round ${round} not started at difficulty ${d}`);
const gold0 = g.character.gold;
const seen = new Set<number>();
const dropped: Record<string, number> = {};
let kills = 0;
const stats0 = { ...pickupStats(g) };
for (let t = 0; t < Number(secS) * TICK_HZ && g.mode === 'run'; t++) {
  g.step(1);
  const w = g.world;
  w.player.hp = w.player.hpMax;
  for (const m of w.monsters) if (m.dead && m.deathTick === w.tick && m.team === 1 && !m.pet) kills++;
  for (const gi of w.items) {
    if (seen.has(gi.id)) continue;
    seen.add(gi.id);
    const b = BASE_BY_ID[gi.item.base];
    const kind = b?.id === 'gold' ? 'gold piles' : `${b?.type ?? gi.item.base}:${gi.item.quality}`;
    dropped[kind] = (dropped[kind] ?? 0) + 1;
  }
}
g.refreshVendor();
const prices = g.vendor.map((v) => v.price).sort((a, b) => a - b);
const st = pickupStats(g);
console.log(
  JSON.stringify(
    {
      round,
      difficulty: d,
      level,
      seconds: Number(secS),
      kills,
      itemsDropped: Object.values(dropped).reduce((a, b) => a + b, 0) - (dropped['gold piles'] ?? 0),
      gold: g.character.gold - gold0,
      pickup: Object.fromEntries(Object.entries(st).map(([k, v]) => [k, v - (stats0[k as keyof typeof st] ?? 0)])),
      vendor: { cheapest: prices[0], median: prices[Math.floor(prices.length / 2)], dearest: prices[prices.length - 1] },
      dropped: Object.fromEntries(Object.entries(dropped).sort((a, b) => b[1] - a[1])),
    },
    null,
    1,
  ),
);
