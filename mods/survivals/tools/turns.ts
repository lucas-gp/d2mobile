/**
 * Monsters turning back (lot 301, owner: "the monsters often come at the hero then turn back"): a hero of `cls` plays `seconds` of the
 * act's first zone in god mode (the joystick on a slow circle, the mode's control), and every chasing monster's heading is followed: a
 * U-turn is a monster walking towards its target (heading within 60° of it) that walks away from it (more than 120°) within 1 s, counted by
 * cause (fleeing, a shooter keeping its distance, its target changed, not aggressive, other). One JSON line a class:
 *   npx tsx mods/survivals/tools/turns.ts [classes=druid,necromancer,barbarian] [seconds=60] [level=12]
 */
import { activateForTools } from '../../../tools/mods/node';

await activateForTools('d2+survivals');
const { Game } = await import('../../../src/sim/game');
const { withDefaultSettings } = await import('../../../src/sim/save');
const RM = await import('../sim/runmode');
const { learnForRate } = await import('../sim/cadence');
const { countTurns } = await import('../sim/turns');
if (process.env.SV_FLOW) Object.assign(RM.FLOW, JSON.parse(process.env.SV_FLOW) as object);
const [clsS = 'druid,necromancer,barbarian', secS = '60', levelS = '12'] = process.argv.slice(2);
for (const cls of clsS.split(',')) {
  const g = new Game(undefined, cls as never, true);
  RM.setVariant(g.character, 'run');
  g.settings = withDefaultSettings({ ...g.settings, mods: { survivals: { control: 'semi', density: 90 } } } as never, true);
  RM.startRunMode(g, 1, 0);
  g.takeOffer(null);
  learnForRate(g, Number(levelS), 3);
  console.log(JSON.stringify({ cls, ...countTurns(g, Number(secS)) }));
}
process.exit(0);
