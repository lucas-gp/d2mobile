/**
 * Cadence and damage of every attack and damaging skill in Act I's flow of the Run (lot 294, owner: "Charged Bolt is spammed"): a hero of
 * each class at level `level`, the skill at `points` points (no other), casts it again as soon as it can for `seconds` at a sandbag (a
 * zombie whose life is restored every step, 3 units away, 1 for a melee strike: `sim/cadence.ts`), and tells the seconds between two
 * casts (Diablo II's frames, the mode's frames, the floor `FLOW.minCast`, measured), the missiles of a cast and the damage a second on the
 * one target. One JSON line a skill:
 *   npx tsx mods/survivals/tools/cadence.ts [classes=all] [level=15] [points=8] [seconds=10]
 */
import { activateForTools } from '../../../tools/mods/node';

await activateForTools('d2+survivals');
const { Game } = await import('../../../src/sim/game');
const { withDefaultSettings } = await import('../../../src/sim/save');
const { setDurabilityEnabled } = await import('../../../src/sim/durability');
const { castFrames } = await import('../../../src/sim/skills');
const { RULES } = await import('../../../src/mods/rules');
const { TICK_HZ } = await import('../../../src/sim/constants');
const RM = await import('../sim/runmode');
const { castEvery, measuredSkills, meleeAttack } = await import('../sim/cadence');

const ALL = ['amazon', 'assassin', 'barbarian', 'druid', 'necromancer', 'paladin', 'sorceress'];
const [clsS = 'all', levelS = '15', pointsS = '8', secS = '10'] = process.argv.slice(2);
setDurabilityEnabled(false);

for (const cls of clsS === 'all' ? ALL : clsS.split(',')) {
  const g = new Game(undefined, cls as never, true);
  RM.setVariant(g.character, 'run');
  g.settings = withDefaultSettings({ ...g.settings, mods: { survivals: { control: 'semi', density: 90 } } } as never, true);
  RM.startRunMode(g, 1, 0);
  g.takeOffer(null);
  g.character.level = Number(levelS);
  for (const id of measuredSkills(cls, Number(levelS))) {
    const r = castEvery(g, id, Number(pointsS), Number(secS));
    if (!r) continue;
    const w = g.world;
    const d2 = castFrames(w, id) / TICK_HZ;
    const flow = Math.max(1, Math.round(RULES['skills.castFrames'](w, id, castFrames(w, id)))) / TICK_HZ;
    console.log(
      JSON.stringify({
        cls,
        skill: id,
        d2Sec: +d2.toFixed(2),
        flowSec: +flow.toFixed(2),
        floorSec: RM.minCastOf(id, meleeAttack(cls, id)),
        everySec: r.every === null ? null : +r.every.toFixed(2),
        missilesPerCast: +r.missiles.toFixed(1),
        dps: Math.round(r.dps),
      }),
    );
  }
}
process.exit(0);
