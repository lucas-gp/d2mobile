/**
 * Lot 311 (owner: "In the Campaign, D2 and pd2, I still cannot leave the Rogue Encampment … I want no black zone between the town and the
 * next zone, to walk straight from one to the other as if it were one zone"): the openings of a map's edge, the seams of two maps joined
 * edge to edge (synthetic maps), and on Act I's D2 maps (private, skipped without them): the town's exit in the palisade's gate, the hero
 * walking from the waypoint through the gate into the Blood Moor without a portal (same place in the Blood Moor's coordinates, still
 * walking), back into the camp, and on into the Cold Plains.
 */
import fs from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { clearD2Maps, parseD2Map, registerD2Map, type D2MapData } from '../../src/data/d2map';
import { mergeOverlap, openings, planChain, seamOf, OVERLAP } from '../../src/data/zones/seams';
import { act1Joints, act1Seams } from '../../src/data/zones/act1';
import { Game } from '../../src/sim/game';
import { TICK_HZ } from '../../src/sim/constants';
import { RULES } from '../../src/mods/rules';

/** A map of `w` × `h` cases, all walkable but its outer two rows of sub-tiles, with walls (orientation 2) on the cases listed */
function fake(id: string, w: number, h: number, walls: [number, number][] = [], open: (x: number, y: number) => boolean = () => true): D2MapData {
  const cols = w * 5;
  const rows = h * 5;
  const blocked = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (x < 2 || y < 2 || x >= cols - 2 || y >= rows - 2 || !open(x, y)) blocked[y * cols + x] = 1;
  return {
    id,
    cases: [w, h],
    units: [w * 2.5, h * 2.5],
    grid: { cols, rows, blocked, opaque: new Uint8Array(cols * rows) },
    objects: [],
    landmarks: {},
    raw: { places: walls.map(([x, y]) => [0, 0, 0, x, y, 0, 2]) },
  };
}

describe('openings of a map edge and seams', () => {
  it('a palisade along the north edge with a gate: one opening, the gate', () => {
    const walls: [number, number][] = [];
    for (let x = 0; x < 20; x++) if (x < 8 || x > 10) walls.push([x, 0]);
    // the other sides closed (blocked a row inside)
    const m = fake('t', 20, 12, walls, (x, y) => y < 55 && x > 3 && x < 96);
    const o = openings(m);
    expect(o).toEqual([{ side: 'N', lo: 20, hi: 27.5 }]);
  });

  it('two maps joined north to south: the overlap, the crossing, the collision made one', () => {
    const walls: [number, number][] = [];
    for (let x = 0; x < 20; x++) if (x < 8 || x > 10) walls.push([x, 0]);
    const a = fake('a', 20, 12, walls, (x, y) => y < 55 && x > 3 && x < 96);
    // b: open on its south side between x = 10 and 15 units only
    const b = fake('b', 16, 16, [], (x, y) => y < 60 || (x >= 20 && x < 30));
    const j = planChain(['a', 'b'], (id) => (id === 'a' ? a : id === 'b' ? b : undefined));
    expect(j).toHaveLength(1);
    expect(j[0].oa.side).toBe('N');
    expect(j[0].ob.side).toBe('S');
    const sa = seamOf(j[0], a, b);
    const sb = seamOf(j[0], a, b, true);
    // b beyond a's north edge, overlapping by OVERLAP, the openings' middles aligned (23.75 and 12.5; lot 312: on the sub-tiles' grid,
    // 11.25 -> 11.5)
    expect(sa.at).toEqual({ x: 11.5, y: -(40 - OVERLAP) });
    expect(sb.at).toEqual({ x: -sa.at.x, y: -sa.at.y });
    // a point of the crossing in a is in b's map, inside b's back crossing's reach (not crossed back at once)
    const pa = { x: 23.75, y: 1.6 };
    const pb = { x: pa.x - sa.at.x, y: pa.y - sa.at.y };
    expect(pb.y).toBeLessThan(sb.cross[1]);
    expect(pb.y).toBeGreaterThan(40 - OVERLAP);
    // b's corridor only in the overlap of a: a's sub-tiles facing b's blocked ones are blocked, a's gate stays open
    const merged = mergeOverlap(a, b, sa, a.grid.blocked);
    const cols = a.grid.cols;
    expect(merged[4 * cols + Math.floor(23.75 / 0.5)]).toBe(0);
    expect(merged[4 * cols + Math.floor(13 / 0.5)]).toBe(1);
    expect(a.grid.blocked[4 * cols + Math.floor(12 / 0.5)]).toBe(0);
  });

  it('no facing openings: not joined', () => {
    const a = fake('a', 10, 10, [], (x, y) => y > 6);
    const b = fake('b', 10, 10, [], (x, y) => y > 6);
    // both open on N, W, E (their south closed? no: open everywhere but the north rows) — a's north closed, b's south open
    const j = planChain(['a', 'b'], (id) => (id === 'a' ? a : b));
    expect(j.every((x) => x.oa.side !== 'N')).toBe(true);
  });
});

const DIR = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps`;

/** Walks the hero (steering as a held click) toward (x, y) of the zone `from` until the zone changes; the seconds, or -1 */
function walkOut(g: Game, tx: number, ty: number, maxSec: number): number {
  const from = g.world.zone.id;
  for (let t = 0; t < maxSec * TICK_HZ; t++) {
    const w = g.world;
    if (w.zone.id !== from) return t / TICK_HZ;
    const d = w.steer(tx, ty) ?? { x: tx - w.player.x, y: ty - w.player.y };
    const n = Math.hypot(d.x, d.y) || 1;
    w.input.moveX = d.x / n;
    w.input.moveY = d.y / n;
    g.step(1);
  }
  return -1;
}

describe.skipIf(!fs.existsSync(DIR))('Act I on the D2 maps: walking out of the camp into the Blood Moor and back', () => {
  afterAll(() => clearD2Maps());
  it('the gate, the crossing, the same place on both sides', () => {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && /^(a1_|tristram|countess|andariel)/.test(x))) {
      const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
      if (j.grid) registerD2Map(parseD2Map(j));
    }
    expect(RULES['world.seams']({} as Game)).toBe(true);
    const town = act1Seams('a1_town');
    expect(town.map((s) => [s.to, s.side])).toEqual([['a1_bloodmoor', 'N']]);
    const g = new Game(undefined, 'sorceress');
    g.enterTown('act1');
    const w0 = g.world;
    expect(w0.zone.id).toBe('a1_town');
    // the exit stands in the gate of the palisade (north edge, x 72.5 to 80), a few steps from the waypoint
    const exit = w0.objects.find((o) => o.kind === 'portal' && o.ref === 'zone:a1_bloodmoor')!;
    expect(exit.x).toBeGreaterThan(72);
    expect(exit.x).toBeLessThan(80.5);
    expect(exit.y).toBeLessThan(6);
    // from the waypoint, walking north through the gate (a point beyond the edge, as a click past the gate)
    const s = town[0];
    const mid = (s.cross[0] + s.cross[2]) / 2;
    const out = walkOut(g, mid, -3, 30);
    expect(out, 'the Blood Moor reached by walking through the gate').toBeGreaterThan(0);
    expect(out).toBeLessThan(15);
    const w1 = g.world;
    expect(w1.zone.id).toBe('a1_bloodmoor');
    expect(g.seamCrossed?.world).toBe(w1);
    // the same place: the hero stands where he was, in the Blood Moor's coordinates, still walking
    const p = w1.player;
    expect(Math.abs(p.x - (mid - s.at.x))).toBeLessThan(3);
    expect(p.y - -s.at.y).toBeLessThan(OVERLAP);
    expect(w1.grid.circleBlocked(p.x, p.y, 0.3)).toBe(false);
    // the Blood Moor's monsters are not at the entry
    const near = w1.monsters.filter((m) => !m.pet && !m.dead && Math.hypot(m.x - p.x, m.y - p.y) < 10);
    expect(near).toHaveLength(0);
    // a few steps on and back south: into the camp again, by the gate
    g.world.godMode = true;
    const back = act1Seams('a1_bloodmoor').find((x) => x.to === 'a1_town')!;
    walkOut(g, p.x, p.y - 4, 1);
    const inTown = walkOut(g, (back.cross[0] + back.cross[2]) / 2, back.cross[3] + 3, 20);
    expect(inTown, 'the camp reached again').toBeGreaterThan(0);
    expect(g.world.zone.id).toBe('a1_town');
    const pt = g.world.player;
    expect(pt.y).toBeLessThan(5);
    expect(Math.abs(pt.x - mid)).toBeLessThan(4);
    // out again, then across the Blood Moor to the Cold Plains' opening
    expect(walkOut(g, mid, -3, 10)).toBeGreaterThan(0);
    const toCp = act1Seams('a1_bloodmoor').find((x) => x.to === 'a1_coldplains');
    if (toCp) {
      g.world.godMode = true;
      const t = walkOut(g, (toCp.cross[0] + toCp.cross[2]) / 2, toCp.side === 'N' ? -3 : toCp.cross[3] + 3, 180);
      expect(t, 'the Cold Plains reached on foot').toBeGreaterThan(0);
      expect(g.world.zone.id).toBe('a1_coldplains');
    }
  }, 180000);

  it('every joint of the chain crossed both ways, from 6 units inside the opening', () => {
    const g = new Game(undefined, 'sorceress');
    g.enterTown('act1');
    const joints = act1Joints();
    // town, Blood Moor, Cold Plains, Stony Field; (lot 320: the Underground Passage between) Dark Wood, Black Marsh, Tamoe Highland and
    // (lot 314: the sides of Diablo II, Tamoe left by its north) the Monastery's gate; the Burial Grounds off the Cold Plains
    expect(joints.map((j) => `${j.a}>${j.b}`)).toEqual([
      'a1_town>a1_bloodmoor',
      'a1_bloodmoor>a1_coldplains',
      'a1_coldplains>a1_stonyfield',
      'a1_darkwood>a1_blackmarsh',
      'a1_blackmarsh>a1_tamoe',
      'a1_tamoe>a1_monastery',
      'a1_coldplains>a1_burial',
    ]);
    const enter = (id: string) => (g as unknown as { enterCampaignZone(id: string): boolean }).enterCampaignZone(id);
    for (const j of joints)
      for (const [from, to] of [
        [j.a, j.b],
        [j.b, j.a],
      ]) {
        enter(from);
        g.world.godMode = true;
        const s = act1Seams(from).find((x) => x.to === to)!;
        const mid = { x: (s.cross[0] + s.cross[2]) / 2, y: (s.cross[1] + s.cross[3]) / 2 };
        const inward = s.side === 'N' ? [0, 6] : s.side === 'S' ? [0, -6] : s.side === 'W' ? [6, 0] : [-6, 0];
        const st = g.world.grid.nearestFree(mid.x + inward[0], mid.y + inward[1], 4)!;
        const p = g.world.player;
        p.x = p.px = st.x;
        p.y = p.py = st.y;
        g.step(1);
        expect(walkOut(g, mid.x - inward[0], mid.y - inward[1], 10), `${from} -> ${to}`).toBeGreaterThan(0);
        expect(g.world.zone.id).toBe(to);
      }
  }, 120000);
});
