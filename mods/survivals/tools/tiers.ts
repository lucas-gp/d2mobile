/**
 * Difficulty of the Run's Act I by gear tier (lot 292c, the owner's target: a roguelite whose progress is the gear): a new hero of each
 * class runs Act I in Normal from level 1 with a gear tier generated from Diablo II's tables, and the bots tell how long it survives and how
 * often it wins. Tiers: `TIERS` (lot 303: 0 to 5, about every 2 to 3 runs of the gear's real progress). One JSON line by class and tier:
 *   npx tsx mods/survivals/tools/tiers.ts [classes=barbarian,paladin,sorceress] [runs=4] [tiers=0,1,2,3,4,5] [name=Tier]
 * `SV_FLOW`, `SV_RUN` override the tuning (sim/runmode.ts) as in tools/campaign.ts; `SV_FORGE=max` buys every rank of the training first
 * (`SV_FORGE=<id>,<id>`: those upgrades alone, lot 313).
 */
import { activateForTools } from '../../../tools/mods/node';

await activateForTools('d2+survivals');
const { Game } = await import('../../../src/sim/game');
const { withDefaultSettings } = await import('../../../src/sim/save');
const { setDurabilityEnabled } = await import('../../../src/sim/durability');
const { BASES, BASE_BY_ID, classCanUse, computeDerived, generateItem, Rng } = await import('../../../src/mods/sdk');
const RM = await import('../sim/runmode');
const { gearScore } = await import('../sim/loot');
const { playRuns } = await import('../tests/bots/harness');
const { FORGE } = await import('../sim/forge');
if (process.env.SV_RUN) Object.assign(RM.RUN, JSON.parse(process.env.SV_RUN) as object);
if (process.env.SV_FLOW) Object.assign(RM.FLOW, JSON.parse(process.env.SV_FLOW) as object);

const [clsS = 'barbarian,paladin,sorceress', runsS = '4', tiersS = '0,1,2,3,4,5', name = 'Tier'] = process.argv.slice(2);
/**
 * Lot 303: the tiers calibrated on the gear's real progress run after run (`tools/campaign.ts --run`, the shop on, 7 classes × 3 to 5
 * seeds: the gear's power, `gearPower`, median 12 at run 1, 65 at run 3, 155 at run 5, 236 at run 8, 310 at run 10, 400 at run 15), then
 * tiers 2 and 3 brought down to the survival a slope of about +30 % a tier asks for (`gearPower` counts life and resistances as much as
 * the weapon: it tells tier 1 from tier 2 badly). Median power: 0 the starter kit (12), 1 every slot magic of level 6 (66), 2 every slot
 * magic of level 12 (71, a better weapon), 3 every slot rare of level 14 (179), 4 every slot rare of level 21, the better of two (315), 5
 * every slot rare of level 26, the best of three (419). Before (lot 302): 1 three magic pieces (58), 2 every slot magic (83, about tier
 * 1's survival), 3 every slot rare of level 20 (236), 4 the best of four rares of level 28 (450): two tiers alike, then a leap
 */
const TIERS: Record<number, { slots: 'few' | 'all'; q: 'magic' | 'rare'; ilvl: number; best: number }> = {
  1: { slots: 'all', q: 'magic', ilvl: 6, best: 1 },
  2: { slots: 'all', q: 'magic', ilvl: 12, best: 1 },
  3: { slots: 'all', q: 'rare', ilvl: 14, best: 1 },
  4: { slots: 'all', q: 'rare', ilvl: 21, best: 2 },
  5: { slots: 'all', q: 'rare', ilvl: 26, best: 3 },
};
// `SV_TIERS`: tiers overridden for a measure (the same shape, by tier number)
if (process.env.SV_TIERS) Object.assign(TIERS, JSON.parse(process.env.SV_TIERS) as object);
setDurabilityEnabled(false);

/** The hero's gear of a tier: the starter weapon's kind, a shield where the kit has one */
function equipTier(g: InstanceType<typeof Game>, tier: number, seed: string): void {
  const t = TIERS[tier];
  if (!t) return;
  const c = g.character;
  const rng = new Rng(seed);
  const kit = RM.STARTER_KIT[c.classId];
  const wtype = BASE_BY_ID[kit.weapon].type;
  const two = !!BASE_BY_ID[kit.weapon].twoHanded;
  const best = (slot: string, keep: (b: (typeof BASES)[number]) => boolean) => {
    const pool = BASES.filter((b) => b.slot === slot && !b.noRandomDrop && b.price > 0 && b.qlvl <= t.ilvl && classCanUse(b, c.classId) && keep(b));
    if (!pool.length) return null;
    const top = Math.max(...pool.map((b) => b.qlvl));
    const bases = pool.filter((b) => b.qlvl >= top - 6);
    let out = null as ReturnType<typeof generateItem> | null;
    let score = -Infinity;
    for (let k = 0; k < t.best; k++) {
      const it = generateItem(rng, rng.pick(bases).id, t.ilvl, { forceQuality: t.q });
      const s = gearScore(computeDerived({ ...c, equipment: { ...c.equipment, [slot === 'ring' ? 'ring1' : slot]: it } }, 0));
      if (s > score) [out, score] = [it, s];
    }
    return out;
  };
  const slots = t.slots === 'few' ? ['mainhand', 'body', 'head'] : ['mainhand', 'body', 'head', 'gloves', 'boots', 'belt', 'amulet', 'ring', 'ring', ...(kit.shield ? ['offhand'] : [])];
  let ring = 0;
  for (const slot of slots) {
    const it = slot === 'mainhand' ? best('mainhand', (b) => b.type === wtype && !!b.twoHanded === two) : slot === 'offhand' ? best('offhand', (b) => b.type === 'shield') : best(slot, () => true);
    if (!it) continue;
    const key = slot === 'ring' ? (ring++ ? 'ring2' : 'ring1') : slot;
    (c.equipment as Record<string, unknown>)[key] = it;
  }
  g.world.refreshPlayer();
}

for (const cls of clsS.split(',')) {
  for (const tier of tiersS.split(',').map(Number)) {
    const outs: { outcome: string; seconds: number; zone: number; level: number; kills: number; kills60: number; items: number; killer: string; power: number }[] = [];
    for (let n = 0; n < Number(runsS); n++) {
      const g = new Game(undefined, cls as never, true);
      g.character.name = `${name} ${cls} ${tier} ${n}`;
      RM.setVariant(g.character, 'run');
      g.settings = withDefaultSettings({ ...g.settings, mods: { survivals: { control: 'auto', density: 90 } } } as never, true);
      equipTier(g, tier, `tier:${name}:${cls}:${tier}:${n}`);
      // lot 308: `SV_FORGE=max`, every rank of the training bought (its effects measured on the slope); lot 313: or a list of upgrades
      // (`SV_FORGE=reroll,banish,hand`), those alone at their last rank
      const forge = process.env.SV_FORGE ?? '';
      for (const f of FORGE) if (forge === 'max' || forge.split(',').includes(f.id)) g.character.progression.milestones[`survivals:forge:${f.id}`] = f.costs.length;
      const [r] = await playRuns(g, { runs: 1 });
      outs.push({
        outcome: r.outcome,
        seconds: Math.round(r.seconds),
        zone: r.zone,
        level: r.level,
        kills: r.kills,
        kills60: r.kills60 ?? 0,
        items: r.items,
        killer: r.killer ?? '',
        power: r.power ?? 0,
      });
    }
    const sec = outs.map((o) => o.seconds).sort((a, b) => a - b);
    console.log(
      JSON.stringify({
        cls,
        tier,
        runs: outs.length,
        wins: outs.filter((o) => o.outcome === 'victory').length,
        medianSec: sec[Math.floor(sec.length / 2)],
        meanSec: Math.round(sec.reduce((a, b) => a + b, 0) / sec.length),
        power: outs.map((o) => o.power).sort((a, b) => a - b)[Math.floor(outs.length / 2)],
        secs: sec.join(','),
        zones: outs.map((o) => o.zone).join(','),
        levels: outs.map((o) => o.level).join(','),
        killsPerSec: +(
          outs.reduce((a, o) => a + o.kills, 0) /
          Math.max(
            1,
            outs.reduce((a, o) => a + o.seconds, 0),
          )
        ).toFixed(2),
        // lot 303: past the gentle first minute (the runs that lived longer than it)
        killsPerSec60: +(
          outs.filter((o) => o.seconds > 70).reduce((a, o) => a + o.kills - o.kills60, 0) /
          Math.max(
            1,
            outs.filter((o) => o.seconds > 70).reduce((a, o) => a + o.seconds - 60, 0),
          )
        ).toFixed(2),
        items: outs.map((o) => o.items).join(','),
        killers: outs.map((o) => o.killer).join(','),
      }),
    );
  }
}
process.exit(0);
