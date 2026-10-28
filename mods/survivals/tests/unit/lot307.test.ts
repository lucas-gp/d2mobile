// @vitest-environment happy-dom
/**
 * Lot 307, the owner's returns on the Run's maps: arenas about twice the area (90 and 56 units a side, the former size kept for a map too
 * closed), the fog of war (cells explored around the hero, kept for the zone), the points of interest (placed away from the start and
 * from each other on open ground; shrines' buffs and the Fire shrine's nova; a cursed chest's pack and its loot; a lair woken; the
 * champions' chest), the arena's visible edge (Diablo II décor beyond its walls, the darkness's planes on the renderer's projection), the
 * automap's outlines by fog cell.
 */
import { describe, expect, it } from 'vitest';
import type { Game } from '../../../../src/sim/game';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const RM = await import('../../sim/runmode');
  const ST = await import('../../sim/state');
  const POI = await import('../../sim/poi');
  const FOG = await import('../../sim/fog');
  const ARENA = await import('../../sim/arena');
  const create = () => {
    const g = new env.G.Game(undefined, 'sorceress');
    g.character.name = 'Lot 307';
    for (const f of env.U.contributions('create.character')) f({ game: g });
    ST.stateOf(g).autoStart = false;
    return g;
  };
  const steps = (g: Game, ticks: number) => {
    for (let t = 0; t < ticks; t++) {
      g.world.godMode = true;
      g.step(1);
    }
  };
  /** A Run's first zone started, its first card taken, its director made (first step) */
  const run = () => {
    const g = create();
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    g.takeOffer(null);
    steps(g, 1);
    const d = g.world.run!.director as import('../../sim/director').Director;
    return { g, d };
  };
  return { ...env, RM, ST, POI, FOG, ARENA, create, steps, run };
}

describe('Survivals lot 307: arenas about twice the area', () => {
  it('a zone 90 × 90 units, a boss 56 × 56 (×1.4 a side); the synthetic arena keeps its obstacles a unit of area', async () => {
    const { ARENA } = await setup();
    const { ROUND_BY_ID } = await import('../../data/chapters');
    const a = ARENA.buildArena(ROUND_BY_ID.a1r1, 7);
    expect(a.cut).toBe(false);
    expect(a.box.x1 - a.box.x0).toBe(90);
    expect(ARENA.buildArena(ROUND_BY_ID.a1r7, 7).box.x1 - ARENA.buildArena(ROUND_BY_ID.a1r7, 7).box.x0).toBe(56);
    const inner = a.zone.blockers.filter((b) => b.rect && b.rect[0] > a.box.x0 && b.rect[1] > a.box.y0 && b.rect[2] < a.box.x1 && b.rect[3] < a.box.y1);
    expect(inner.length).toBeGreaterThanOrEqual(12);
    expect(inner.length).toBeLessThanOrEqual(20);
  });

  it('cut from the map: the 90-unit window, the edge décor outside it, the part loaded set inside; a window too closed keeps 64', async () => {
    const { ARENA } = await setup();
    const { registerD2Map } = await import('../../../../src/data/d2map');
    const { ROUND_BY_ID } = await import('../../data/chapters');
    const cols = 400;
    const open = (x0: number, y0: number, side: number) => {
      const blocked = new Uint8Array(cols * cols).fill(1);
      for (let y = y0; y < y0 + side; y++) for (let x = x0; x < x0 + side; x++) blocked[y * cols + x] = 0;
      return blocked;
    };
    // an open square of 100 units: the 90 window fits
    registerD2Map({
      id: 'a1_bloodmoor',
      cases: [80, 80],
      units: [200, 200],
      grid: { cols, rows: cols, blocked: open(100, 100, 200), opaque: new Uint8Array(cols * cols) },
      objects: [],
      landmarks: {},
      raw: {},
    });
    const a = ARENA.buildArena(ROUND_BY_ID.a1r1, 1);
    expect(a.cut).toBe(true);
    expect(a.box.x1 - a.box.x0).toBe(90);
    const v = a.zone.d2Map!.view!;
    expect(v[0]).toBe(a.box.x0 + ARENA.VIEW_INSET);
    expect(v[2]).toBe(a.box.x1 - ARENA.VIEW_INSET);
    // the edge's Diablo II décor (Act I's rocks and trees), all just beyond the arena's walls, about every 2.6 units
    const props = a.zone.props.filter((p) => !['skull', 'bones'].includes(p.prop));
    expect(props.length).toBeGreaterThan((4 * 90) / 2.6 / 1.3);
    for (const p of props) {
      expect(['rock_a', 'rock_b', 'rock_c', 'tree_dead_s', 'tree_dead_m']).toContain(p.prop);
      const out = Math.max(a.box.x0 - p.x, p.x - a.box.x1, a.box.y0 - p.y, p.y - a.box.y1);
      expect(out).toBeGreaterThanOrEqual(0.6 - 1e-9);
      expect(out).toBeLessThanOrEqual(1.8 + 1e-9);
    }
    // an open square of 50 units: the 90 window is too closed (35 % at least, reachable), lot 306's 64 is cut instead
    registerD2Map({
      id: 'a1_coldplains',
      cases: [80, 80],
      units: [200, 200],
      grid: { cols, rows: cols, blocked: open(100, 100, 100), opaque: new Uint8Array(cols * cols) },
      objects: [],
      landmarks: {},
      raw: {},
    });
    const b = ARENA.buildArena(ROUND_BY_ID.a1r2, 1);
    expect(b.cut).toBe(true);
    expect(b.box.x1 - b.box.x0).toBe(64);
  });
});

describe('Survivals lot 307: the boss within reach of the larger lair', () => {
  it('Andariel comes 30 units from the hero at most (the base’s leash is 45) and hunts him, even with the hero in a corner', async () => {
    const { run, steps } = await setup();
    const { g } = run();
    g.startRun('survivals:a1r7', 0, 5);
    steps(g, 1);
    const d = g.world.run!.director as import('../../sim/director').Director;
    const p = g.world.player;
    p.x = d.box.x0 + 2;
    p.y = d.box.y1 - 2;
    // her arrival brought forward (the flow's: 3:00 into the lair)
    d.bossAt = 2;
    for (let t = 0; t < 30 * 25 && !d.bossMonsters().length; t++) {
      steps(g, 1);
      p.x = d.box.x0 + 2;
      p.y = d.box.y1 - 2;
    }
    const a = d.bossMonsters()[0];
    expect(a?.def.id).toBe('andariel');
    const d0 = Math.hypot(a.x - p.x, a.y - p.y);
    expect(d0).toBeLessThanOrEqual(30.5);
    steps(g, 5 * 25);
    expect(a.aggro).toBe(true);
    expect(Math.hypot(a.x - p.x, a.y - p.y)).toBeLessThan(d0 - 5);
  });
});

describe('Survivals lot 307: the fog of war', () => {
  it('cells of 2 units explored within 14 units of the hero, counted once, kept; the new ones handed once to the automap', async () => {
    const { FOG } = await setup();
    const f = new FOG.Fog({ x0: 10, y0: 10, x1: 100, y1: 100 });
    expect(f.total).toBe(45 * 45);
    expect(f.isSeen(50, 50)).toBe(false);
    const n = f.reveal(50, 50);
    // about π r² / cell²
    expect(n).toBeGreaterThan(0.85 * ((Math.PI * 14 * 14) / 4));
    expect(n).toBeLessThan(1.15 * ((Math.PI * 14 * 14) / 4));
    expect(f.isSeen(50, 50)).toBe(true);
    expect(f.isSeen(50 + 13, 50)).toBe(true);
    expect(f.isSeen(50 + 16, 50)).toBe(false);
    expect(f.reveal(50, 50)).toBe(0);
    expect(f.count).toBe(n);
    expect(f.takeNew()).toHaveLength(n);
    expect(f.takeNew()).toHaveLength(0);
    // at a corner: only the cells inside the arena
    const m = f.reveal(10, 10);
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(n / 3);
    expect(f.cellOf(9, 50)).toBe(-1);
  });

  it('in a round: the arena explored around the hero as he moves, the same world keeping it', async () => {
    const { run, steps, FOG } = await setup();
    const { g, d } = run();
    const f = FOG.fogIf(g.world)!;
    expect(f).toBeDefined();
    const first = f.count;
    expect(first).toBeGreaterThan(100);
    expect(f.share).toBeLessThan(0.3);
    g.world.player.x = d.box.x0 + 8;
    g.world.player.y = d.box.y0 + 8;
    steps(g, 6);
    expect(f.count).toBeGreaterThan(first);
    expect(f.isSeen(d.box.x0 + 3, d.box.y0 + 3)).toBe(true);
  });
});

describe('Survivals lot 307: the points of interest', () => {
  it('placed away from the start, from each other and from the edge, on open ground; the same for a seed; a lair 2 kinds', async () => {
    const { POI } = await setup();
    const { Rng } = await import('../../../../src/mods/sdk');
    const box = { x0: 0, y0: 0, x1: 90, y1: 90 };
    const wall = (x: number) => !(x > 40 && x < 50);
    const spots = POI.placePois(new Rng('t'), box, { x: 20, y: 20 }, wall, POI.POI.plan);
    expect(spots.map((s) => s.kind)).toEqual(['shrine', 'shrine', 'chest', 'cursed', 'lair']);
    for (const s of spots) {
      expect(Math.hypot(s.x - 20, s.y - 20)).toBeGreaterThanOrEqual(POI.POI.fromStart);
      expect(Math.min(s.x, s.y, 90 - s.x, 90 - s.y)).toBeGreaterThanOrEqual(POI.POI.margin);
      expect(s.x <= 39 || s.x >= 51).toBe(true);
      for (const o of spots) if (o !== s) expect(Math.hypot(o.x - s.x, o.y - s.y)).toBeGreaterThanOrEqual(POI.POI.apart);
    }
    // two different shrines of the run's list
    const shrines = spots.filter((s) => s.kind === 'shrine').map((s) => s.shrine!);
    expect(new Set(shrines).size).toBe(2);
    for (const id of shrines) expect(POI.RUN_SHRINES.map(([x]) => x)).toContain(id);
    expect(POI.placePois(new Rng('t'), box, { x: 20, y: 20 }, wall, POI.POI.plan)).toEqual(spots);
    // a small arena: the distances shortened, all placed
    expect(POI.placePois(new Rng('t'), { x0: 0, y0: 0, x1: 56, y1: 56 }, { x: 28, y: 28 }, () => true, POI.POI.boss)).toHaveLength(2);
  });

  it('the arena holds them as objects (a shrine, a chest, a cursed chest) and a lair of bones; the Campaign takes them out', async () => {
    const { ARENA, POI, create, steps } = await setup();
    const { ROUND_BY_ID } = await import('../../data/chapters');
    const a = ARENA.buildArena(ROUND_BY_ID.a1r1, 3);
    const objs = a.zone.objects.filter((o) => o.id?.startsWith(POI.POI_REF));
    expect(objs.map((o) => o.kind).sort()).toEqual(['chest', 'chest', 'shrine', 'shrine']);
    expect(objs.find((o) => o.variant === 'cursed')).toBeDefined();
    expect(a.zone.props.filter((p) => p.prop === 'skull' || p.prop === 'bones')).toHaveLength(5);
    // the Campaign's round: no point of interest in its world
    const g = create();
    g.character.progression.milestones['survivals:mode'] = 2;
    g.startRun('survivals:a1r1', 0, 3);
    steps(g, 1);
    expect(g.world.objects.some((o) => o.ref?.startsWith(POI.POI_REF))).toBe(false);
  });

  it('walking over a shrine: its buff for 40 s (Armor: the defence doubled), told; the Fire shrine burns the monsters around', async () => {
    const { run, steps, POI } = await setup();
    const { g, d } = run();
    const w = g.world;
    const before = w.player.d.defense;
    w.events.drain();
    POI.useShrine(w, 'armor', w.player.x, w.player.y);
    expect(w.player.buffs.find((b) => b.id === 'shrine_armor')!.until - w.tick).toBe(1000);
    expect(w.player.d.defense).toBeGreaterThan(before * 1.5);
    expect(w.events.drain().some((e) => e.t === 'mapEvent' && e.text === 'Sanctuaire d’armure')).toBe(true);
    // the Fire shrine: the ordinary monsters within 10 units die, a champion loses 35 % of its life, the hero is spared
    const sim = await import('../../../../src/sim/spawn');
    const p = w.player;
    const near = sim.spawnMonster(w, 'zombie', p.x + 3, p.y, { rank: 'normal' }, 't1')!;
    const champ = sim.spawnMonster(w, 'zombie', p.x - 3, p.y, { rank: 'champion' }, 't2')!;
    const far = sim.spawnMonster(w, 'zombie', p.x + 20, p.y, { rank: 'normal' }, 't3');
    const hp = p.hp;
    POI.useShrine(w, 'storm', p.x, p.y);
    expect(near.dead).toBe(true);
    expect(champ.dead).toBe(false);
    expect(champ.hp).toBeCloseTo(champ.hpMax * 0.65, 0);
    if (far) expect(far.dead).toBe(false);
    expect(p.hp).toBe(hp);
    // in play: walking over the zone's shrine uses it once
    const shrine = d.pois!.list.find((q) => q.kind === 'shrine')!;
    expect(shrine.found).toBe(false);
    p.x = shrine.x + 1;
    p.y = shrine.y;
    steps(g, 1);
    expect(shrine.used).toBe(true);
    expect(w.objects.find((o) => o.id === shrine.obj)!.used).toBe(true);
    expect(w.player.buffs.some((b) => b.id === `shrine_${shrine.shrine}`) || shrine.shrine === 'storm').toBe(true);
  });

  it('a cursed chest raises a champion pack, its rare item falls once they are dead; a lair wakes within 11 units with a banner', async () => {
    const { run, steps } = await setup();
    const { g, d } = run();
    const w = g.world;
    const p = w.player;
    const cursed = d.pois!.list.find((q) => q.kind === 'cursed')!;
    p.x = cursed.x;
    p.y = cursed.y + 1;
    const n0 = w.monsters.filter((m) => !m.dead && m.rank === 'champion').length;
    w.godMode = true;
    const told = g.step(1);
    expect(cursed.used).toBe(true);
    const pack = w.monsters.filter((m) => !m.dead && m.rank === 'champion');
    expect(pack.length - n0).toBeGreaterThanOrEqual(3);
    for (const m of pack) expect(Math.hypot(m.x - cursed.x, m.y - cursed.y)).toBeLessThan(5);
    expect(told.some((e) => e.t === 'mapEvent' && e.text.startsWith('Coffre maudit'))).toBe(true);
    const items0 = w.items.length;
    for (const m of pack) w.killMonster(m, p);
    steps(g, 5);
    const rare = w.items.slice(items0).filter((gi) => gi.item.quality === 'rare');
    expect(rare.length).toBeGreaterThanOrEqual(1);
    // the lair
    const lair = d.pois!.list.find((q) => q.kind === 'lair')!;
    p.x = lair.x + 10;
    p.y = lair.y;
    const woke = g.step(1);
    expect(lair.used).toBe(true);
    expect(woke.some((e) => e.t === 'mapEvent' && /approche/.test(e.text))).toBe(true);
  });

  it('a champion pack of the timeline killed: an elite chest where it fell (75 % of the time), opened by walking over it', async () => {
    const { run, steps, POI } = await setup();
    let chests = 0;
    for (let k = 0; k < 8; k++) {
      const { g, d } = run();
      const w = g.world;
      const p = w.player;
      const sim = await import('../../../../src/sim/spawn');
      const ms = [0, 1, 2].map((i) => sim.spawnMonster(w, 'zombie', p.x + 6 + i, p.y, { rank: 'champion' }, `c${i}`)!);
      d.pois!.watchPack(
        ms.map((m) => m.id),
        p.x + 6,
        p.y,
      );
      for (const m of ms) w.killMonster(m, p);
      steps(g, 5);
      const chest = d.pois!.list.find((q) => q.kind === 'elite');
      if (!chest) continue;
      chests++;
      expect(chest.found).toBe(true);
      expect(w.objects.find((o) => o.id === chest.obj)?.ref).toBe(`${POI.POI_REF}elite`);
      p.x = chest.x;
      p.y = chest.y;
      steps(g, 1);
      expect(chest.used).toBe(true);
    }
    expect(chests).toBeGreaterThanOrEqual(3);
    expect(chests).toBeLessThanOrEqual(8);
  });
});

describe('Survivals lot 307: the visible edge and the automap', () => {
  it('the darkness’s plane on the renderer’s projection: through the edge’s point, its normal outwards, 28.6 px a unit at zoom 1', async () => {
    await setup();
    const { edgePlane } = await import('../../ui/bounds');
    const screen = { width: 400, height: 800 };
    // the camera on the edge x = 10: the plane passes through the screen's centre, its normal up-left (−x on the screen: (−16, −32))
    const a = edgePlane([-1, 0], [10, 0], [10, 50], 1, screen);
    expect(a.x).toBeCloseTo(200);
    expect(a.y).toBeCloseTo(400);
    expect(Math.cos(a.angle)).toBeCloseTo(-16 / Math.hypot(16, 32));
    expect(Math.sin(a.angle)).toBeCloseTo(-32 / Math.hypot(16, 32));
    expect(a.unit).toBeCloseTo(1024 / Math.hypot(16, 32));
    // 5 units inside the arena: the edge 5 units out along the normal, at half the zoom
    const b = edgePlane([-1, 0], [10, 0], [15, 50], 0.5, screen);
    const dist = (b.x - 200) * Math.cos(b.angle) + (b.y - 400) * Math.sin(b.angle);
    expect(dist).toBeCloseTo(5 * b.unit);
    // the four edges' normals point away from each other
    const c = edgePlane([1, 0], [90, 0], [50, 50], 1, screen);
    expect(Math.cos(c.angle)).toBeCloseTo(-Math.cos(a.angle));
  });

  it('the automap’s outlines: each wall side facing open ground once, filed under the open side’s fog cell, the edge too', async () => {
    const { FOG } = await setup();
    const { outlineOf } = await import('../../ui/automap');
    const { WalkGrid } = await import('../../../../src/sim/grid');
    const grid = new WalkGrid(20, 20);
    // one blocked cell at (5, 5) units, in open ground
    grid.blocked[10 * grid.cols + 10] = 1;
    const box = { x0: 0, y0: 0, x1: 20, y1: 20 };
    const fog = new FOG.Fog(box);
    const o = outlineOf({ grid } as never, box, fog);
    const walls = [...o.walls.values()].flat();
    expect(walls.length).toBe(4 * 4);
    expect([...o.walls.keys()].every((k) => k >= 0 && k < fog.total)).toBe(true);
    const edge = [...o.edge.values()].flat();
    expect(edge.length).toBe(4 * 10 * 4);
  });
});
