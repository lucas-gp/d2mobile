/**
 * Balance of the Survivals mode measured with the base's bots (lot 282, S7): a new character of a class, automatic control, plays the
 * campaign of each difficulty in turn (Normal to Baal, then Nightmare, then Hell), as the bot tests do (tests/bots/harness.ts), and prints
 * one JSON line per difficulty (hours of play and deaths by act, level, the round where time ran out). The character after each difficulty
 * is written to `<out>/<class>-<name>-d<difficulty>.json` (save format), so that a later measure can start from Nightmare or Hell:
 *   npx tsx mods/survivals/tools/campaign.ts <class> [name=Bot] [hours=60,60,60] [from=save.json] [difficulties=0,1,2] [out=dir] [ruleset=d2]
 * `ruleset`: the content ruleset under the mode, `d2` (`d2+survivals`) or `pd2` (`pd2+survivals`, lot 284).
 *
 * Run mode (lot 289, the mode's default): `--run` plays runs instead (one act a run from its entry level, the gear kept from run to run)
 * and prints one JSON line a run (outcome, zone reached, level, kills, gold, items, killer) then a summary (victories, first victory):
 *   npx tsx mods/survivals/tools/campaign.ts --run <class> [name=Bot] [runs=10] [act=1] [difficulty=0] [ruleset=d2] [stopOnWin=0]
 * `SV_SHOP=1`: the bot buys the hub shop's best buy between runs (lot 292); `SV_LADDER=1`: each run in the highest difficulty whose act is
 * open (the endgame farm: Andariel opens Nightmare's Act I, lot 292); `SV_FORGE=1`: the bot buys the training's ranks with half its purse
 * before the shop (lot 308, sim/forge.ts).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { activateForTools } from '../../../tools/mods/node';

const RUN = process.argv[2] === '--run';
const argv = RUN ? process.argv.slice(3) : process.argv.slice(2);
const content = (RUN ? argv[5] : argv[6]) || 'd2';
await activateForTools(`${content}+survivals`);
if (RUN) await runMode();
const { Game } = await import('../../../src/sim/game');
const { withDefaultSettings, serialize, deserialize } = await import('../../../src/sim/save');
const { setDurabilityEnabled } = await import('../../../src/sim/durability');
const { playAct } = await import('../tests/bots/harness');

const [cls = 'sorceress', name = 'Bot', hoursS = '60,60,60', from = '', diffS = '0,1,2', out = ''] = argv;
const hours = hoursS.split(',').map(Number);
setDurabilityEnabled(false);
const g = from ? new Game(deserialize(readFileSync(from, 'utf8')), cls as never, true) : new Game(undefined, cls as never, true);
if (!from) g.character.name = `${name} ${cls}`;
g.settings = withDefaultSettings({ ...g.settings, mods: { survivals: { control: 'auto', density: 90 } } } as never, true);
for (const d of RUN ? [] : (diffS.split(',').map(Number) as (0 | 1 | 2)[])) {
  if (g.character.progression.highestDifficulty < d) break;
  const t0 = performance.now();
  const rep = await playAct(g, { maxSeconds: (hours[d] ?? 60) * 3600, difficulty: d, lastRound: 'a5r7' });
  const top = Object.entries(rep.roundDeaths)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([r, n]) => `${r}:${n}`)
    .join(' ');
  console.log(
    JSON.stringify({
      ruleset: content,
      cls,
      name,
      d,
      cleared: rep.cleared,
      hours: +(rep.seconds / 3600).toFixed(2),
      deaths: rep.deaths,
      level: rep.level,
      acts: rep.acts.map((a) => `A${a.act}@${a.hours}h/${a.deaths}d/L${a.level}`).join(' '),
      stuck: rep.stuck,
      top,
      farms: rep.farms,
      givenUp: rep.givenUp,
      maxAlive: rep.maxAlive,
      lowManaPct: rep.roundSeconds ? +((100 * rep.lowMana) / rep.roundSeconds).toFixed(1) : 0,
      cpuS: Math.round((performance.now() - t0) / 1000),
    }),
  );
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `${content}-${cls}-${name}-d${d}.json`), serialize(g.toSave()));
  }
  if (!rep.cleared) break;
}

/** `--run`: runs of the Run mode (see the header) */
async function runMode(): Promise<void> {
  const { Game } = await import('../../../src/sim/game');
  const { withDefaultSettings } = await import('../../../src/sim/save');
  const { setDurabilityEnabled } = await import('../../../src/sim/durability');
  const { RUN: TUNE, FLOW, setVariant } = await import('../sim/runmode');
  // tuning experiments: SV_RUN='{"pace":0.6}' overrides the Run mode's parameters (sim/runmode.ts, RUN), SV_FLOW Act I's flow's (FLOW)
  if (process.env.SV_RUN) Object.assign(TUNE, JSON.parse(process.env.SV_RUN) as object);
  if (process.env.SV_FLOW) Object.assign(FLOW, JSON.parse(process.env.SV_FLOW) as object);
  const { playRuns } = await import('../tests/bots/harness');
  const [cls = 'sorceress', name = 'Bot', runsS = '10', actS = '1', dS = '0', , stop = '0'] = argv;
  setDurabilityEnabled(false);
  const g = new Game(undefined, cls as never, true);
  g.character.name = `${name} ${cls}`;
  setVariant(g.character, 'run');
  g.settings = withDefaultSettings({ ...g.settings, mods: { survivals: { control: 'auto', density: 90 } } } as never, true);
  const t0 = performance.now();
  const reps = await playRuns(g, {
    runs: Number(runsS),
    act: Number(actS),
    difficulty: Number(dS) as 0 | 1 | 2,
    stopOnWin: stop === '1',
    shop: process.env.SV_SHOP === '1',
    ladder: process.env.SV_LADDER === '1',
    forge: process.env.SV_FORGE === '1',
  });
  for (const r of reps) console.log(JSON.stringify({ cls, name, ...r, minutes: +(r.seconds / 60).toFixed(1) }));
  const wins = reps.filter((r) => r.outcome === 'victory').length;
  const first = reps.findIndex((r) => r.outcome === 'victory');
  console.log(
    JSON.stringify({
      summary: true,
      ruleset: content,
      cls,
      name,
      runs: reps.length,
      wins,
      firstWin: first < 0 ? null : first + 1,
      deepest: Math.max(0, ...reps.map((r) => r.zone)),
      gold: g.character.gold,
      worn: Object.keys(g.character.equipment).length,
      cpuS: Math.round((performance.now() - t0) / 1000),
    }),
  );
  process.exit(0);
}
