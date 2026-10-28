/**
 * Loot, runes and gold of the Run's Act I by source (lot 300, the owner: "far too many items on the ground, the loot should come from the
 * bosses"; "the gold fills the screen"): a new hero of each class plays Act I in Normal in god mode (the automatic control, the cards by
 * the class's plan) for `seconds` of the act or to Andariel's fall, and tells by minute the items dropped by the fodder (normal monsters,
 * minions), the elites (champions, uniques) and the named elites and bosses (the zones' mini-bosses, Andariel), the runes among them, the
 * gold piles dropped and their gold, the most piles lying at once, and whether every mini-boss and boss dropped at least one item. One
 * JSON line a class, then the median:
 *   npx tsx mods/survivals/tools/drops.ts [classes=all] [seconds=780] [name=Drops]
 * `SV_FLOW`, `SV_LOOT` (FLOW_LOOT of sim/loot.ts) override the tuning.
 */
import { activateForTools } from '../../../tools/mods/node';

await activateForTools(process.env.SV_RULESET ?? 'd2+survivals');
const { Game } = await import('../../../src/sim/game');
const { withDefaultSettings } = await import('../../../src/sim/save');
const { setDurabilityEnabled } = await import('../../../src/sim/durability');
const { RULES } = await import('../../../src/mods/rules');
const { BASE_BY_ID } = await import('../../../src/mods/sdk');
const { TICK_HZ } = await import('../../../src/sim/constants');
const RM = await import('../sim/runmode');
const L = await import('../sim/loot');
const LU = await import('../ui/levelup');
const RH = await import('../ui/runhub');
if (process.env.SV_FLOW) Object.assign(RM.FLOW, JSON.parse(process.env.SV_FLOW) as object);
if (process.env.SV_LOOT) Object.assign(L.FLOW_LOOT, JSON.parse(process.env.SV_LOOT) as object);

const ALL = ['amazon', 'assassin', 'barbarian', 'druid', 'necromancer', 'paladin', 'sorceress'];
const [clsS = 'all', secS = '780', name = 'Drops'] = process.argv.slice(2);
setDurabilityEnabled(false);

type Src = 'fodder' | 'elite' | 'boss';
interface Count {
  items: number;
  runes: number;
  rares: number;
}
const rows: Record<string, number>[] = [];
const kinds: Record<string, number> = {};
for (const cls of clsS === 'all' ? ALL : clsS.split(',')) {
  const g = new Game(undefined, cls as never, true);
  g.character.name = `${name} ${cls}`;
  RM.setVariant(g.character, 'run');
  g.settings = withDefaultSettings({ ...g.settings, mods: { survivals: { control: 'auto', density: 90 } } } as never, true);
  const by: Record<Src, Count> = { fodder: { items: 0, runes: 0, rares: 0 }, elite: { items: 0, runes: 0, rares: 0 }, boss: { items: 0, runes: 0, rares: 0 } };
  let piles = 0;
  let pileGold = 0;
  let mostPiles = 0;
  let bosses = 0;
  let bossesWithItem = 0;
  let kills = 0;
  let level = 1;
  // every drop of a monster, after the mode's rule: by its rank
  const prev = RULES['loot.monsterDrops'];
  RULES['loot.monsterDrops'] = (w, m, items) => {
    prev(w, m, items);
    if (m.team !== 1 || m.pet || m.isSummon) return;
    kills++;
    const boss = !!m.runBoss || m.rank === 'boss';
    const src: Src = boss ? 'boss' : m.rank === 'normal' || m.rank === 'minion' ? 'fodder' : 'elite';
    let n = 0;
    for (const it of items) {
      const b = BASE_BY_ID[it.base];
      if (b?.id === 'gold') {
        piles++;
        pileGold += it.qty ?? 0;
        continue;
      }
      n++;
      kinds[`${src}:${b?.type}:${it.quality}`] = (kinds[`${src}:${b?.type}:${it.quality}`] ?? 0) + 1;
      by[src].items++;
      if (b?.type === 'rune') by[src].runes++;
      if (it.quality === 'rare' || it.quality === 'set' || it.quality === 'unique') by[src].rares++;
    }
    if (boss) {
      bosses++;
      if (n > 0) bossesWithItem++;
    }
  };
  if (!RH.playRun(g, 1, 0)) throw new Error('run refused');
  let t = 0;
  for (; t < Number(secS) * TICK_HZ && RM.runActive(g.character) && g.mode === 'run'; t++) {
    if (g.offers.length) LU.autoAnswer(g);
    g.world.godMode = true;
    g.step(1);
    level = Math.max(level, g.character.level);
    if (g.mode === 'run') mostPiles = Math.max(mostPiles, g.world.items.filter((gi) => BASE_BY_ID[gi.item.base]?.id === 'gold').length);
  }
  RULES['loot.monsterDrops'] = prev;
  const min = t / TICK_HZ / 60;
  const row = {
    min: +min.toFixed(1),
    kills,
    itemsPerMin: +((by.fodder.items + by.elite.items + by.boss.items) / min).toFixed(2),
    fodderPerMin: +(by.fodder.items / min).toFixed(2),
    elitePerMin: +(by.elite.items / min).toFixed(2),
    bossItems: by.boss.items,
    runesFodder: by.fodder.runes,
    runesElite: by.elite.runes,
    runesBoss: by.boss.runes,
    raresBoss: by.boss.rares,
    bosses,
    bossesWithItem,
    piles,
    pileGold,
    goldPerPile: +(pileGold / Math.max(1, piles)).toFixed(1),
    mostPiles,
    gold: g.character.gold,
    level,
  };
  rows.push(row);
  console.log(JSON.stringify({ cls, ...row }));
}
const med = (k: string) => {
  const v = rows.map((r) => r[k]).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
};
if (process.env.SV_KINDS) console.log(JSON.stringify(Object.fromEntries(Object.entries(kinds).sort((a, b) => b[1] - a[1]))));
console.log(JSON.stringify({ median: true, ...Object.fromEntries(Object.keys(rows[0] ?? {}).map((k) => [k, med(k)])) }));
process.exit(0);
