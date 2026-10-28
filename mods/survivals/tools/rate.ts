/**
 * The hero's whole cadence in Act I's flow of the Run (lot 298, owner: "not every skill is cast" and "the skills still go off very fast"):
 * a hero of each class at level `level` with every active skill of his trees open at that level learned (`points` points each), plays
 * `seconds` of the act's first zones in god mode with the mode's control (`control`: semi standing still, walk: semi with the joystick on a circle, or auto), and tells the casts a
 * second (all skills, each skill, beside a running cast), the hero's missiles a second, the most casts of one skill in a second, the
 * share of the seconds where two skills or more went off, the longest streak of one skill, and the learned skills never cast
 * (`sim/cadence.ts` `playRate`). One JSON line a class:
 *   npx tsx mods/survivals/tools/rate.ts [classes=all] [level=12] [points=3] [seconds=60] [control=semi|walk|auto]
 * `SV_FLOW` overrides the tuning (sim/runmode.ts), e.g. SV_FLOW='{"parallel":false}' for lot 297's one cast at a time.
 */
import { activateForTools } from '../../../tools/mods/node';

await activateForTools('d2+survivals');
const { Game } = await import('../../../src/sim/game');
const { withDefaultSettings } = await import('../../../src/sim/save');
const { setDurabilityEnabled } = await import('../../../src/sim/durability');
const RM = await import('../sim/runmode');
const { playRate } = await import('../sim/cadence');
const { rotationSkills } = await import('../sim/autopilot');
const { learnForRate } = await import('../sim/cadence');
if (process.env.SV_FLOW) Object.assign(RM.FLOW, JSON.parse(process.env.SV_FLOW) as object);

const ALL = ['amazon', 'assassin', 'barbarian', 'druid', 'necromancer', 'paladin', 'sorceress'];
const [clsS = 'all', levelS = '12', pointsS = '3', secS = '60', control = 'semi'] = process.argv.slice(2);
setDurabilityEnabled(false);

for (const cls of clsS === 'all' ? ALL : clsS.split(',')) {
  const g = new Game(undefined, cls as never, true);
  RM.setVariant(g.character, 'run');
  g.settings = withDefaultSettings({ ...g.settings, mods: { survivals: { control: control === 'walk' ? 'semi' : control, density: 90 } } } as never, true);
  RM.startRunMode(g, 1, 0);
  g.takeOffer(null);
  learnForRate(g, Number(levelS), Number(pointsS));
  const r = playRate(g, Number(secS), rotationSkills(g), control === 'walk');
  console.log(JSON.stringify({ cls, control, level: Number(levelS), skills: rotationSkills(g).length, ...r }));
}
process.exit(0);
