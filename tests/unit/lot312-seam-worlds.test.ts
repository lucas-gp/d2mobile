/**
 * Lot 312 (owner: "move between zones directly as if it were a single zone as in the real game"): the zones joined edge to edge alive
 * together (src/sim/seam-worlds.ts) on Act I's D2 maps (private, skipped without them). Before the crossing the neighbour is built and
 * simulated beside the zone, its monsters see the hero across the seam, chase and strike him, his blows kill them in their own zone
 * (experience, loot there, shown here); crossing keeps every monster where it is on both sides (no new world, nothing rolled again), the
 * hero's companions follow with their identifiers; the save holds the zone's own entities only.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearD2Maps, parseD2Map, registerD2Map } from '../../src/data/d2map';
import { act1Seams } from '../../src/data/zones/act1';
import type { SeamDef } from '../../src/data/zone-types';
import { Game } from '../../src/sim/game';
import { spawnMonster } from '../../src/sim/spawn';
import { contextTarget } from '../../src/sim/targeting';
import { SEAM_ACTIVE } from '../../src/sim/seam-worlds';
import { TICK_HZ } from '../../src/sim/constants';
import type { World } from '../../src/sim/world';

const DIR = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps`;

const enter = (g: Game, id: string) => (g as unknown as { enterCampaignZone(id: string): boolean }).enterCampaignZone(id);

/** A point `depth` units inside zone's map from the seam's edge, in the middle of its crossing */
function inside(s: SeamDef, w: World, depth: number): { x: number; y: number } {
  const mid = { x: (s.cross[0] + s.cross[2]) / 2, y: (s.cross[1] + s.cross[3]) / 2 };
  const W = w.zone.width;
  const H = w.zone.height;
  return s.side === 'N' ? { x: mid.x, y: depth } : s.side === 'S' ? { x: mid.x, y: H - depth } : s.side === 'W' ? { x: depth, y: mid.y } : { x: W - depth, y: mid.y };
}

/** The same point `depth` units inside the neighbour, in the neighbour's coordinates */
function beyond(s: SeamDef, w: World, depth: number): { x: number; y: number } {
  const p = inside(s, w, -depth);
  return { x: p.x - s.at.x, y: p.y - s.at.y };
}

function place(w: World, p: { x: number; y: number }): void {
  const f = w.grid.nearestFree(p.x, p.y, 3) ?? p;
  w.player.x = w.player.px = f.x;
  w.player.y = w.player.py = f.y;
}

/** Walks the hero (as a held stick) toward (x, y) until the zone changes; the ticks, or -1 */
function walkOut(g: Game, tx: number, ty: number, maxSec: number): number {
  const from = g.world;
  for (let t = 0; t < maxSec * TICK_HZ; t++) {
    const w = g.world;
    if (w !== from) return t;
    const d = w.steer(tx, ty) ?? { x: tx - w.player.x, y: ty - w.player.y };
    const n = Math.hypot(d.x, d.y) || 1;
    w.input.moveX = d.x / n;
    w.input.moveY = d.y / n;
    g.step(1);
  }
  return -1;
}

describe.skipIf(!fs.existsSync(DIR))('zones joined edge to edge alive together (Act I, D2 maps)', () => {
  beforeAll(() => {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && /^(a1_|tristram|countess|andariel)/.test(x))) {
      const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
      if (j.grid) registerD2Map(parseD2Map(j));
    }
  });
  afterAll(() => clearD2Maps());

  it("the neighbour's monster sees the hero across the seam, strikes him, dies in its own zone; the crossing keeps it", () => {
    const g = new Game(undefined, 'sorceress');
    g.enterTown('act1');
    enter(g, 'a1_bloodmoor');
    const A = g.world;
    const s = act1Seams('a1_bloodmoor').find((x) => x.to === 'a1_coldplains')!;
    // 3.5 units inside the Blood Moor from its edge: in the overlap, short of the crossing
    place(A, inside(s, A, 3.5));
    g.step(1);
    const N = g.seams.worldOf('a1_coldplains')!;
    expect(N, 'the Cold Plains built before the crossing').toBeTruthy();
    expect(N.proxy).toBe(true);
    expect(g.seams.worlds().find((x) => x.id === 'a1_coldplains')?.active).toBe(true);
    // the proxy stands where the hero is, in the Cold Plains' coordinates
    expect(N.player.x).toBeCloseTo(A.player.x - s.at.x, 5);
    expect(N.player.y).toBeCloseTo(A.player.y - s.at.y, 5);
    // sight across the seam: the Cold Plains' open ground beyond the Blood Moor's edge is not a wall for it
    const far = inside(s, A, -6);
    expect(A.grid.isOpaqueAt(far.x, far.y)).toBe(false);
    // a zombie of the Cold Plains 4 units beyond the edge (its sight: 9 units)
    const q = beyond(s, A, 4);
    const o = spawnMonster(N, 'zombie', q.x, q.y, { rank: 'normal' }, 'lot312')!;
    expect(o).toBeTruthy();
    expect(o.id).toBeGreaterThanOrEqual(2 ** 24);
    g.step(1);
    const m = A.monsters.find((x) => x.id === o.id)!;
    expect(m, 'its copy in the Blood Moor').toBeTruthy();
    expect(m.mirror).toBe(true);
    expect(m.x).toBeCloseTo(o.x + s.at.x, 5);
    expect(m.y).toBeCloseTo(o.y + s.at.y, 5);
    // it wakes, comes to the edge and strikes the hero standing in the overlap
    const hp0 = A.player.hp;
    let hit = false;
    for (let t = 0; t < 20 * TICK_HZ && !hit; t++) {
      A.player.hp = Math.max(A.player.hp, A.player.hpMax * 0.9);
      const before = A.player.hp;
      g.step(1);
      if (A.player.hp < before - 0.01) hit = true;
    }
    expect(o.aggro, 'awake').toBe(true);
    expect(hit, 'the hero struck across the seam').toBe(true);
    void hp0;
    // the hero's blow at its copy kills it in the Cold Plains: experience, its death there, the copy dead too
    const xp0 = g.character.xp;
    const copy = A.monsters.find((x) => x.id === o.id)!;
    A.hurtMonster(copy, { phys: 0, fire: 99999, cold: 0, light: 0, poison: 0, magic: 0, spell: true });
    expect(o.dead, 'the original dead in its own zone').toBe(true);
    expect(g.character.xp).toBeGreaterThan(xp0);
    g.step(1);
    expect(A.monsters.find((x) => x.id === o.id)?.dead).toBe(true);
    // the save holds the Blood Moor's own entities only
    const save = g.toSave();
    expect(save.run?.runId).toBe('a1_bloodmoor');
    expect(save.run?.world.monsters.some((x) => x.id === o.id)).toBe(false);
    // a monster of the Blood Moor near the seam, then the crossing: both stay where they are, in their own zone
    const own = spawnMonster(A, 'zombie', A.player.x + 2, A.player.y + (s.side === 'N' ? 6 : -6), { rank: 'normal' }, 'lot312b')!;
    own.aggro = false;
    A.godMode = true;
    const tgt = inside(s, A, -6);
    expect(walkOut(g, tgt.x, tgt.y, 10)).toBeGreaterThan(0);
    expect(g.world).toBe(N);
    expect(N.proxy).toBe(false);
    expect(A.proxy).toBe(true);
    expect(N.monsters.includes(o), 'the Cold Plains keep their monster (the same, not rolled again)').toBe(true);
    expect(A.monsters.includes(own), 'the Blood Moor keeps its monster').toBe(true);
    // shown from the Cold Plains, with its identifier
    const ownCopy = N.monsters.find((x) => x.id === own.id);
    expect(ownCopy?.mirror).toBe(true);
    expect(ownCopy!.x).toBeCloseTo(own.x - s.at.x, 5);
    // and back: the same Blood Moor
    N.godMode = true;
    const back = act1Seams('a1_coldplains').find((x) => x.to === 'a1_bloodmoor')!;
    const t2 = inside(back, N, -6);
    expect(walkOut(g, t2.x, t2.y, 10)).toBeGreaterThan(0);
    expect(g.world).toBe(A);
    expect(A.monsters.includes(own)).toBe(true);
    expect(A.monsters.filter((x) => x.id === own.id)).toHaveLength(1);
  }, 120000);

  it("the camp's objects are drawn from the Blood Moor before the crossing, never used from there; the companions follow", () => {
    const g = new Game(undefined, 'sorceress');
    g.enterTown('act1');
    const town = g.world;
    const s = act1Seams('a1_town').find((x) => x.to === 'a1_bloodmoor')!;
    place(town, inside(s, town, 6));
    g.step(1);
    const bm = g.seams.worldOf('a1_bloodmoor')!;
    expect(bm).toBeTruthy();
    // a summon of the hero in the camp (a companion): it follows him into the Blood Moor with its identifier
    const pet = spawnMonster(town, 'zombie', town.player.x + 1, town.player.y + 1, { rank: 'normal' }, 'pet')!;
    pet.pet = 'summon' as never;
    pet.team = 0;
    town.godMode = true;
    const out = inside(s, town, -6);
    expect(walkOut(g, out.x, out.y, 10)).toBeGreaterThan(0);
    expect(g.world).toBe(bm);
    expect(g.mode).toBe('run');
    expect(bm.monsters.includes(pet)).toBe(true);
    expect(town.monsters.includes(pet)).toBe(false);
    g.step(1);
    // the camp is a neighbour now: its people and its stash drawn beyond the edge, as copies that cannot be used from here
    const npcs = bm.objects.filter((o) => o.mirror && o.kind === 'npc');
    expect(npcs.length).toBeGreaterThan(0);
    for (const o of npcs) {
      bm.player.x = o.x;
      bm.player.y = o.y;
      expect(contextTarget(bm, 3)?.id).not.toBe(o.id);
    }
    // back into the camp: the town's state (its mode), the same world
    const back = act1Seams('a1_bloodmoor').find((x) => x.to === 'a1_town')!;
    bm.godMode = true;
    place(bm, inside(back, bm, 6));
    g.step(1);
    const t2 = inside(back, bm, -6);
    expect(walkOut(g, t2.x, t2.y, 10)).toBeGreaterThan(0);
    expect(g.world).toBe(town);
    expect(g.mode).toBe('town');
    expect(town.objects.filter((o) => o.kind === 'npc').every((o) => !o.mirror)).toBe(true);
  }, 120000);

  it('far from every seam nothing is simulated beside the zone; a portal starts the chain again', () => {
    const g = new Game(undefined, 'sorceress');
    g.enterTown('act1');
    enter(g, 'a1_coldplains');
    const A = g.world;
    const seams = act1Seams('a1_coldplains');
    // the middle of the map, far from both seams
    place(A, { x: A.zone.width / 2, y: A.zone.height / 2 });
    for (let k = 0; k < 5; k++) g.step(1);
    const near = seams.some((s) => Math.hypot(Math.max(s.cross[0] - A.player.x, 0, A.player.x - s.cross[2]), Math.max(s.cross[1] - A.player.y, 0, A.player.y - s.cross[3])) <= SEAM_ACTIVE);
    if (!near) expect(g.seams.worlds().filter((x) => x.active)).toHaveLength(0);
    expect(A.monsters.some((m) => m.mirror)).toBe(false);
    // through the waypoint menu to another zone: the chain starts again from it
    g.startRun('a1_bloodmoor', 0);
    g.step(1);
    expect(g.seams.worlds().map((x) => x.world)).not.toContain(A);
  }, 60000);
});

describe.skipIf(!fs.existsSync(DIR))('Acts II, III, IV and V: their outdoor chains joined edge to edge where the game joins them (D2 maps)', () => {
  beforeAll(() => {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
      const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
      if (j.grid) registerD2Map(parseD2Map(j));
    }
  });
  afterAll(() => clearD2Maps());

  it('the joints found on our maps, every one crossed both ways on foot, the monsters of the zone left kept', async () => {
    const { chainJoints } = await import('../../src/data/zones/seams');
    const { A2_CHAIN } = await import('../../src/data/zones/act2');
    const { A3_CHAIN } = await import('../../src/data/zones/act3');
    const { A5_CHAIN } = await import('../../src/data/zones/act5');
    const { A4_CHAINS } = await import('../../src/data/zones/act4');
    const pairs = (ids: Parameters<typeof chainJoints>[0]) => chainJoints(ids).map((j) => `${j.a}>${j.b}`);
    // Act II: the whole desert (the Rocky Waste's exit found from its gate's nearest free sub-tile); Act III: the Docks to Travincal (lot
    // 320: Kurast through its gates, the Bazaar, Upper Kurast and the Causeway no longer by portals); Act IV (lot 320): the Fortress to the
    // City of the Damned, the River of Flame to the Chaos Sanctuary; Act V: Harrogath to the Arreat Plateau
    expect(pairs(A2_CHAIN)).toEqual(['a2_town>a2_rocky', 'a2_rocky>a2_dryhills', 'a2_dryhills>a2_oasis', 'a2_oasis>a2_lostcity', 'a2_lostcity>a2_valley']);
    expect(pairs(A3_CHAIN)).toEqual([
      'a3_town>a3_spider',
      'a3_spider>a3_marsh',
      'a3_marsh>a3_jungle',
      'a3_jungle>a3_lower',
      'a3_lower>a3_bazaar',
      'a3_bazaar>a3_upper',
      'a3_upper>a3_causeway',
      'a3_causeway>a3_travincal',
    ]);
    expect(pairs(A4_CHAINS)).toEqual(['a4_fortress>a4_steppes', 'a4_steppes>a4_plains', 'a4_plains>a4_city', 'a4_river>a4_chaos']);
    expect(pairs(A5_CHAIN)).toEqual(['harrogath>a5_foothills', 'a5_foothills>a5_highlands', 'a5_highlands>a5_plateau']);
    const g = new Game(undefined, 'sorceress');
    const legs: [string, string, string][] = [];
    for (const [act, ids] of [
      ['act2', A2_CHAIN],
      ['act3', A3_CHAIN],
      ['act4', A4_CHAINS],
      ['act5', A5_CHAIN],
    ] as const)
      for (const j of chainJoints(ids)) if (j.a !== 'harrogath') legs.push([act, j.a, j.b], [act, j.b, j.a]);
    for (const [act, from, to] of legs) {
      if (from.endsWith('_town') || from === 'a4_fortress') g.enterTown(act);
      else enter(g, from);
      expect(g.world.zone.id, from).toBe(from);
      const w = g.world;
      w.godMode = true;
      const s = w.zone.seams!.find((x) => x.to === to)!;
      expect(s, `${from} -> ${to}`).toBeTruthy();
      place(w, inside(s, w, 6));
      g.step(1);
      // a monster of the zone near the seam: still there, the same, after the crossing
      const back = inside(s, w, 11);
      const own = spawnMonster(w, 'zombie', back.x, back.y, { rank: 'normal' }, 'leg')!;
      own.stunT = 9999;
      const out = inside(s, w, -6);
      expect(walkOut(g, out.x, out.y, 12), `${from} -> ${to} on foot`).toBeGreaterThan(0);
      expect(g.world.zone.id).toBe(to);
      expect(g.seams.worldOf(from)).toBe(w);
      expect(w.monsters.includes(own)).toBe(true);
    }
  }, 300000);
});
