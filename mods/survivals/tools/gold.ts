/**
 * Gold of the Run mode measured with the bots (lot 292): runs of Act I by class, the gold of each run split by its source (piles picked
 * up, items turned into gold, elite chests) and the prices of the hub's shop. One JSON line a run, then a summary by class:
 *   npx tsx mods/survivals/tools/gold.ts [classes=all] [runs=4] [name=Gold] [difficulty=0]
 */
import { activateForTools } from '../../../tools/mods/node';

await activateForTools('d2+survivals');
const { Game } = await import('../../../src/sim/game');
const { withDefaultSettings } = await import('../../../src/sim/save');
const { setDurabilityEnabled } = await import('../../../src/sim/durability');
const { setVariant } = await import('../sim/runmode');
const { pickupStats } = await import('../sim/loot');
const { goldStats, shopPrices } = await import('../sim/economy');
const { playRuns } = await import('../tests/bots/harness');

const ALL = ['sorceress', 'paladin', 'barbarian', 'amazon', 'necromancer', 'druid', 'assassin'];
const [clsS = 'all', runsS = '4', name = 'Gold', dS = '0'] = process.argv.slice(2);
setDurabilityEnabled(false);
for (const cls of clsS === 'all' ? ALL : clsS.split(',')) {
  const g = new Game(undefined, cls as never, true);
  g.character.name = `${name} ${cls}`;
  setVariant(g.character, 'run');
  g.settings = withDefaultSettings({ ...g.settings, mods: { survivals: { control: 'auto', density: 90 } } } as never, true);
  const golds: number[] = [];
  for (let n = 0; n < Number(runsS); n++) {
    const p0 = { ...pickupStats(g) };
    const c0 = { ...goldStats(g) };
    const [r] = await playRuns(g, { runs: 1, act: 1, difficulty: Number(dS) as 0 | 1 | 2 });
    const p = pickupStats(g);
    const c = goldStats(g);
    golds.push(r.gold);
    console.log(
      JSON.stringify({
        cls,
        run: n + 1,
        outcome: r.outcome,
        zone: r.zone,
        level: r.level,
        kills: r.kills,
        gold: r.gold,
        piles: p.gold - p0.gold,
        junk: p.soldGold - p0.soldGold,
        sold: p.sold - p0.sold,
        chests: c.chests - c0.chests,
        capped: c.capped - c0.capped,
        min: +(r.seconds / 60).toFixed(1),
      }),
    );
  }
  const sorted = [...golds].sort((a, b) => a - b);
  console.log(
    JSON.stringify({ summary: true, cls, runs: golds.length, median: sorted[Math.floor(sorted.length / 2)], mean: Math.round(golds.reduce((a, b) => a + b, 0) / golds.length), shop: shopPrices(g) }),
  );
}
process.exit(0);
