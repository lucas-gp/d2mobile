/**
 * Simulation cost of a Survivals round with about 90 live monsters (lot 277, S4; any act's round from lot 280), headless: a strong
 * character (15 levels above the round's recommended level: pressure 1) in the
 * overtime of a round (target up to the cap), kept alive (`World.godMode`), not fighting by default (`manual`: the population stays at the cap; `auto`: the
 * bot fights, kills and loot add their cost), `World.step` timed for 60 s of play.
 * Rendering is not measured here (tools/e2e/survivals.mjs measures frames in a software-rendered browser; the phone is the real test).
 *   npx tsx mods/survivals/tools/bench.ts [round=a1r1] [cap=90] [seconds=60] [control=manual|auto] [difficulty=0|1|2]
 */
import { activateForTools } from '../../../tools/mods/node';

await activateForTools('d2+survivals');
const { referenceCharacter } = await import('../../../src/sim/bot/arena');
const { withDefaultSettings } = await import('../../../src/sim/save');
const { TICK_HZ } = await import('../../../src/sim/constants');
const { directorOf } = await import('../ui/hud');
const { ROUND_BY_ID } = await import('../data/chapters');
const { stateOf } = await import('../sim/state');

const [round = 'a1r1', capS = '90', secS = '60', control = 'manual', diffS = '0'] = process.argv.slice(2);
const d = Number(diffS) as 0 | 1 | 2;
const g = referenceCharacter(Math.min(99, Math.max(30, (ROUND_BY_ID[round]?.recLevel[d] ?? 15) + 15)), 'cold', 1);
g.character.progression.highestDifficulty = d;
// `manual` (the mode has no manual control since lot 290): the semi-automatic one with its automatic attack off, nobody touching the joystick
g.settings = withDefaultSettings({ ...g.settings, mods: { survivals: { control: control === 'manual' ? 'semi' : control, density: Number(capS) } } }, true);
if (control === 'manual') stateOf(g).autoAttack = false;
if (!g.startRun(`survivals:${round}`, d, 1)) throw new Error(`round ${round} not started at difficulty ${d}`);
g.world.godMode = true;
const live = () => g.world.monsters.filter((m) => !m.dead && m.team === 1 && !m.pet && !m.isSummon).length;
// to the overtime: the mini-boss out, then killed
for (let t = 0; t < TICK_HZ * 485 && g.mode === 'run'; t++) {
  g.step(1);
  g.world.godMode = true;
}
for (const boss of directorOf(g)?.bossMonsters() ?? []) g.world.killMonster(boss, g.world.player);
for (let t = 0; t < TICK_HZ * 600 && live() < Number(capS) - 2; t++) {
  g.step(1);
  g.world.godMode = true;
}
const times: number[] = [];
let aliveSum = 0;
for (let t = 0; t < Number(secS) * TICK_HZ; t++) {
  const t0 = performance.now();
  g.step(1);
  times.push(performance.now() - t0);
  g.world.godMode = true;
  aliveSum += live();
}
times.sort((a, b) => a - b);
const avg = times.reduce((a, b) => a + b, 0) / times.length;
console.log(
  JSON.stringify({
    round,
    difficulty: d,
    control,
    cap: Number(capS),
    aliveAvg: +(aliveSum / times.length).toFixed(1),
    stepMs: { avg: +avg.toFixed(3), p95: +times[Math.floor(times.length * 0.95)].toFixed(3), max: +times[times.length - 1].toFixed(2) },
    corePct25Hz: +((avg * TICK_HZ) / 10).toFixed(1),
  }),
);
