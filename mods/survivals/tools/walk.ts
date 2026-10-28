/**
 * Semi-automatic control while walking (lot 288): a player who never lets go of the joystick (circling the arena's middle, as one
 * kites a horde with one thumb), against one who stands still, with the attack while walking (`WALK_ATTACK.gap` ticks between two
 * strikes) and without it (the stop-to-shoot of lots 274-287). Headless, the base's reference characters (bot kit and skill plan) at the
 * round's recommended level; kills, deaths, life lost a minute.
 *   npx tsx mods/survivals/tools/walk.ts [seconds=180] [rounds=a1r1,a1r3,a2r2,a3r2] [builds=fire,whirlwind,javazon,zealot]
 */
import { activateForTools } from '../../../tools/mods/node';

await activateForTools('d2+survivals');
const { referenceCharacter } = await import('../../../src/sim/bot/arena');
const { withDefaultSettings } = await import('../../../src/sim/save');
const { TICK_HZ } = await import('../../../src/sim/constants');
const { ROUND_BY_ID } = await import('../data/chapters');
const { WALK_ATTACK } = await import('../sim/autopilot');

const [secS = '180', roundsS = 'a1r1,a1r3,a2r2,a3r2', buildsS = 'fire,whirlwind,javazon,zealot'] = process.argv.slice(2);
type Build = Parameters<typeof referenceCharacter>[1];

function play(round: string, build: Build, pattern: 'circle' | 'stand', gap: number) {
  WALK_ATTACK.gap = gap;
  const r = ROUND_BY_ID[round];
  const level = Math.max(2, r.recLevel[0]);
  const g = referenceCharacter(level, build, 1);
  g.settings = withDefaultSettings({ ...g.settings, mods: { survivals: { control: 'semi', density: 90 } } }, true);
  if (!g.startRun(`survivals:${round}`, 0, 1)) throw new Error(`round ${round} not started`);
  const w0 = g.world;
  const cx = w0.player.x;
  const cy = w0.player.y;
  let deaths = 0;
  let lost = 0;
  let kills = 0;
  const ticks = Number(secS) * TICK_HZ;
  for (let t = 0; t < ticks; t++) {
    const w = g.world;
    if (g.mode !== 'run') break;
    const p = w.player;
    if (pattern === 'circle' && !p.dead) {
      // around the arrival point, 7 units out: the joystick never let go (tangent, pulled back to the circle)
      // (out of the arrival point first: the circle's tangent is not defined there)
      const dx = p.x - cx || 0.5;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const k = (d - 7) / 7;
      let mx = -dy / d - (dx / d) * k;
      let my = dx / d - (dy / d) * k;
      const n = Math.hypot(mx, my) || 1;
      mx /= n;
      my /= n;
      w.input.moveX = mx;
      w.input.moveY = my;
    } else {
      w.input.moveX = 0;
      w.input.moveY = 0;
    }
    const hp = p.hp;
    for (const e of g.step(1)) {
      if (e.t === 'death') kills++;
      if (e.t === 'playerDeath') deaths++;
    }
    if (g.world === w) lost += Math.max(0, hp - w.player.hp);
    if (w.player.dead || g.mode !== 'run') break;
  }
  const min = Math.max(1 / 60, g.world.tick / TICK_HZ / 60);
  return { kills, deaths, killsMin: +(kills / min).toFixed(1), lifeLostMin: Math.round(lost / min), survived: Math.round(min * 60) };
}

const rows: string[] = [];
for (const round of roundsS.split(','))
  for (const build of buildsS.split(',') as Build[]) {
    const stand = play(round, build, 'stand', 20);
    const old = play(round, build, 'circle', Infinity);
    const now = play(round, build, 'circle', 20);
    rows.push(
      `${round} ${build.padEnd(10)} stand ${stand.killsMin} kills/min (${stand.survived} s) | walking, stop-to-shoot ${old.killsMin} kills/min, ${old.lifeLostMin} life/min (${old.survived} s) | walking, attack every 0.8 s ${now.killsMin} kills/min, ${now.lifeLostMin} life/min (${now.survived} s)`,
    );
    console.log(rows[rows.length - 1]);
  }
