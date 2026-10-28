/**
 * Lot 310 (owner: "in Campaign, Act I, in town, I cannot leave the town"): a new character of the base starts in the Rogue Encampment
 * (Act I's D2 maps), walks from the start to the town's edge toward the Blood Moor with the click's steering and is in the Blood Moor,
 * then back by the Blood Moor's edge into the town (walked to from a few steps away) (private D2 maps required, skipped without them).
 */
import fs from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { clearD2Maps, parseD2Map, registerD2Map } from '../../src/data/d2map';
import { Game } from '../../src/sim/game';
import { TICK_HZ } from '../../src/sim/constants';

const DIR = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps`;

/** Walks the hero toward the portal `ref` (steering as a held click) until the zone changes; the seconds taken, or -1 */
function walkTo(g: Game, ref: string, maxSec: number): number {
  const from = g.world.zone.id;
  const exit = g.world.objects.find((o) => o.kind === 'portal' && o.ref === ref);
  if (!exit) return -1;
  // lot 311: an exit joined edge to edge to the next zone is crossed by walking on through the opening, past the edge
  const seam = g.world.zone.seams?.find((s) => `zone:${s.to}` === ref);
  const mid = seam ? { x: (seam.cross[0] + seam.cross[2]) / 2, y: (seam.cross[1] + seam.cross[3]) / 2 } : null;
  const goal =
    !seam || !mid
      ? exit
      : seam.side === 'N'
        ? { x: mid.x, y: -3 }
        : seam.side === 'S'
          ? { x: mid.x, y: seam.cross[3] + 3 }
          : seam.side === 'W'
            ? { x: -3, y: mid.y }
            : { x: seam.cross[2] + 3, y: mid.y };
  for (let t = 0; t < maxSec * TICK_HZ; t++) {
    const w = g.world;
    if (w.zone.id !== from) return t / TICK_HZ;
    const d = w.steer(goal.x, goal.y) ?? { x: goal.x - w.player.x, y: goal.y - w.player.y };
    const n = Math.hypot(d.x, d.y) || 1;
    w.input.moveX = d.x / n;
    w.input.moveY = d.y / n;
    g.step(1);
  }
  return g.world.zone.id !== from ? maxSec : -1;
}

describe.skipIf(!fs.existsSync(DIR))('Campaign, Act I: the town is left on foot', () => {
  afterAll(() => clearD2Maps());
  it('Rogue Encampment -> Blood Moor -> Rogue Encampment', () => {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && /^(a1_|tristram|countess|andariel)/.test(x))) {
      const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
      if (j.grid) registerD2Map(parseD2Map(j));
    }
    const g = new Game(undefined, 'sorceress');
    g.enterTown('act1');
    expect(g.world.zone.id).toBe('a1_town');
    expect(g.world.zone.name).toBe('Camp des Rôdeuses');
    const out = walkTo(g, 'zone:a1_bloodmoor', 40);
    expect(out, 'the Blood Moor reached from the town').toBeGreaterThan(0);
    expect(g.mode).toBe('run');
    expect(g.world.zone.id).toBe('a1_bloodmoor');
    g.world.godMode = true;
    // the edge back to town lies by the arrival (armed once the hero has left it: never sent back at once); a few steps away first
    const w = g.world;
    const edge = w.objects.find((o) => o.kind === 'portal' && o.ref === 'zone:a1_town')!;
    const away = w.grid.nearestFree(edge.x + 8, edge.y, 6)!;
    w.player.x = w.player.px = away.x;
    w.player.y = w.player.py = away.y;
    g.step(1);
    const back = walkTo(g, 'zone:a1_town', 60);
    expect(back, 'the town reached from the Blood Moor').toBeGreaterThan(0);
    expect(g.world.zone.id).toBe('a1_town');
    // and out again from the town reached on foot (a campaign zone then, not the town of `enterTown`)
    const again = walkTo(g, 'zone:a1_bloodmoor', 40);
    expect(again, 'the Blood Moor reached again').toBeGreaterThan(0);
    expect(g.world.zone.id).toBe('a1_bloodmoor');
  }, 120000);
});
