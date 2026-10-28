/**
 * Lot 309 (owner: "I feel we cut the monsters too much, check against the other game; it seems to bring them in small packs rather than
 * at random all over"): the field as a player sees it. A new hero of each class runs Act I with no gear in god mode under the automatic
 * control, the app's window and zoom told to the mode (`setView`: portrait 412 × 915, landscape 915 × 412 or a desktop 1280 × 800, the
 * zoom `survivalsZoom` gives), and at 0:15, 0:30, 1:00, 2:00, 3:00 and 5:00 of the act tells: monsters alive, inside the window (any
 * part of their sprite, `onScreen`), inside a window 1.5 times as large, within 150 px of the hero on the screen, and the run's kills.
 * The spawns are grouped as they come (monsters born in the same step within 3 units of one another): the pack sizes, packs a minute,
 * their distance from the hero in units and in shares of the window's half-diagonal. One JSON line a run, then the means:
 *   npx tsx mods/survivals/tools/field.ts [classes=all] [runs=1] [view=portrait|landscape|desktop] [seconds=300]
 * `SV_FLOW` overrides the tuning (sim/runmode.ts), e.g. SV_FLOW='{"packs":null}' for the trickle of lot 308.
 */
import { activateForTools } from '../../../tools/mods/node';

await activateForTools('d2+survivals');
const { Game } = await import('../../../src/sim/game');
const { withDefaultSettings } = await import('../../../src/sim/save');
const { setDurabilityEnabled } = await import('../../../src/sim/durability');
const { TICK_HZ } = await import('../../../src/sim/constants');
const RM = await import('../sim/runmode');
const RH = await import('../ui/runhub');
const LU = await import('../ui/levelup');
const V = await import('../sim/view');
const { survivalsZoom } = await import('../index');
if (process.env.SV_FLOW) Object.assign(RM.FLOW, JSON.parse(process.env.SV_FLOW) as object);

const ALL = ['amazon', 'assassin', 'barbarian', 'druid', 'necromancer', 'paladin', 'sorceress'];
const [clsS = 'all', runsS = '1', viewS = 'landscape', secS = '300'] = process.argv.slice(2);
const SIZES: Record<string, [number, number, number]> = { portrait: [412, 915, 1.1], landscape: [915, 412, 412 / 420], desktop: [1280, 800, 1.1] };
const [vw, vh, base] = SIZES[viewS];
const view = { width: vw, height: vh, zoom: survivalsZoom(base, { width: vw, height: vh }) };
const wide = { ...view, width: vw * 1.5, height: vh * 1.5 };
setDurabilityEnabled(false);
const AT = [15, 30, 60, 120, 180, 300];

/** Screen pixels between the hero and a point (dx, dy) world units away (the base's 2:1 projection, src/render/iso.ts) */
const px = (dx: number, dy: number) => Math.hypot((dx - dy) * 32 * view.zoom, (dx + dy) * 16 * view.zoom);

const sums: Record<number, { alive: number; view: number; wide: number; near: number; kills: number; n: number }> = {};
const sizes: number[] = [];
const dists: number[] = [];
let packMinutes = 0;
for (const cls of clsS === 'all' ? ALL : clsS.split(',')) {
  for (let n = 0; n < Number(runsS); n++) {
    V.setView(view);
    const g = new Game(undefined, cls as never, true);
    g.character.name = `Field ${cls} ${n}`;
    RM.setVariant(g.character, 'run');
    g.settings = withDefaultSettings({ ...g.settings, mods: { survivals: { control: 'auto', density: 90 } } } as never, true);
    RM.ensureStarterKit(g.character);
    if (!RH.playRun(g, 1, 0)) throw new Error('run refused');
    const out: Record<string, unknown> = { cls, view: viewS, zoom: +view.zoom.toFixed(3) };
    const seen = new Set<number>();
    let next = 0;
    const runSizes: number[] = [];
    for (let t = 0; t < Number(secS) * TICK_HZ * 1.2 && RM.runActive(g.character) && next < AT.length; t++) {
      if (g.offers.length) LU.autoAnswer(g);
      const w = g.world;
      w.godMode = true;
      g.step(1);
      if (g.mode !== 'run') continue;
      const p = w.player;
      // the spawns of this step, grouped by distance (3 units)
      const born = w.monsters.filter((m) => !seen.has(m.id) && m.team === 1 && !m.pet && !m.isSummon);
      for (const m of w.monsters) seen.add(m.id);
      if (t > 0 && born.length) {
        const left = [...born];
        while (left.length) {
          const g0 = [left.shift()!];
          for (let i = 0; i < g0.length; i++) for (let k = left.length - 1; k >= 0; k--) if (Math.hypot(left[k].x - g0[i].x, left[k].y - g0[i].y) < 3) g0.push(...left.splice(k, 1));
          runSizes.push(g0.length);
          const cx = g0.reduce((a, m) => a + m.x, 0) / g0.length;
          const cy = g0.reduce((a, m) => a + m.y, 0) / g0.length;
          dists.push(Math.hypot(cx - p.x, cy - p.y) / V.halfDiagonal(view));
        }
      }
      const sec = RM.flowActSec(w);
      if (sec >= AT[next]) {
        const live = w.monsters.filter((m) => !m.dead && m.team === 1 && !m.pet && !m.isSummon);
        const row = {
          alive: live.length,
          view: live.filter((m) => V.onScreen(m.x - p.x, m.y - p.y, view)).length,
          wide: live.filter((m) => V.onScreen(m.x - p.x, m.y - p.y, wide)).length,
          near: live.filter((m) => px(m.x - p.x, m.y - p.y) < 150).length,
          kills: (RM.runInfo(g.character)?.kills ?? 0) + w.stats.kills,
        };
        out[`t${AT[next]}`] = row;
        const s = (sums[AT[next]] ??= { alive: 0, view: 0, wide: 0, near: 0, kills: 0, n: 0 });
        s.alive += row.alive;
        s.view += row.view;
        s.wide += row.wide;
        s.near += row.near;
        s.kills += row.kills;
        s.n++;
        next++;
      }
    }
    packMinutes += RM.flowActSec(g.world) / 60;
    sizes.push(...runSizes);
    const hist: Record<number, number> = {};
    for (const s of runSizes) hist[Math.min(s, 10)] = (hist[Math.min(s, 10)] ?? 0) + 1;
    out.packs = hist;
    console.log(JSON.stringify(out));
    if (g.mode === 'run') g.townPortal();
  }
}
const mean: Record<string, unknown> = {};
for (const [t, s] of Object.entries(sums))
  mean[`t${t}`] = { alive: +(s.alive / s.n).toFixed(1), view: +(s.view / s.n).toFixed(1), wide: +(s.wide / s.n).toFixed(1), near: +(s.near / s.n).toFixed(1), kills: Math.round(s.kills / s.n) };
const multi = sizes.filter((s) => s >= 2);
const hist: Record<number, number> = {};
for (const s of sizes) hist[Math.min(s, 10)] = (hist[Math.min(s, 10)] ?? 0) + 1;
dists.sort((a, b) => a - b);
console.log(
  JSON.stringify({
    mean,
    view: viewS,
    groups: sizes.length,
    hist,
    packsPerMin: +(multi.length / Math.max(1e-9, packMinutes)).toFixed(1),
    meanPack: +(multi.reduce((a, b) => a + b, 0) / Math.max(1, multi.length)).toFixed(1),
    spawnDist: { p10: +dists[Math.floor(dists.length * 0.1)]?.toFixed(2), p50: +dists[Math.floor(dists.length * 0.5)]?.toFixed(2), p90: +dists[Math.floor(dists.length * 0.9)]?.toFixed(2) },
  }),
);
process.exit(0);
