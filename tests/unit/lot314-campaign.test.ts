/**
 * Lot 314 (the owner's test of the Campaign's Act I on his phone, after lots 311-312):
 * 1. "remove the totem on the waypoint": the game's pillar no longer stands on Diablo II's waypoint; the waypoint is the DS1's object,
 *    where the DS1 put it, drawn by D2's sprite of it (src/data/d2waypoints.ts);
 * 2. "a button to go to the next or the previous zone, remove it": the town portal at will (HUD button, key) is not offered in a campaign,
 *    still in a Rush run;
 * 3. "not sure the zones are joined at the right place": the joints of Act I on the sides of Diablo II (the camp's gate north into the
 *    Blood Moor's south, the Cold Plains east of the Blood Moor, the Stony Field north of the Cold Plains, … the Monastery's gate north of
 *    the Tamoe Highland), by openings into the maps' open land, each crossing reached on foot from the zone's entry;
 * 4. "far too many trees in the Blood Moor": the trees inside the border thinned out (src/data/zones/thin.ts), the collision only opened.
 * The D2 maps are private: those parts are skipped without them.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearD2Maps, d2Map, parseD2Map, registerD2Map, type D2MapData } from '../../src/data/d2map';
import { D2_SIDES, openings, planChain } from '../../src/data/zones/seams';
import { A1_CHAIN, A1_CHAINS, act1Joints, act1Seams } from '../../src/data/zones/act1';
import { thinTrees, TREE_SHARE } from '../../src/data/zones/thin';
import { d2Waypoint, waypointSheet, WAYPOINT_SHEETS } from '../../src/data/d2waypoints';
import { WAYPOINT_ZONES } from '../../src/data/waypoints';
import { objectSheets } from '../../src/render/renderer-shared';
import { Game } from '../../src/sim/game';
import type { World } from '../../src/sim/world';

/** A map of `w` × `h` cases walkable but its outer two rows of sub-tiles; `open(x, y)` (sub-tiles) false: blocked; `places` as given */
function fake(id: string, w: number, h: number, open: (x: number, y: number) => boolean = () => true, places: number[][] = []): D2MapData {
  const cols = w * 5;
  const rows = h * 5;
  const blocked = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (x < 2 || y < 2 || x >= cols - 2 || y >= rows - 2 || !open(x, y)) blocked[y * cols + x] = 1;
  return { id, cases: [w, h], units: [w * 2.5, h * 2.5], grid: { cols, rows, blocked, opaque: new Uint8Array(cols * rows) }, objects: [], landmarks: {}, raw: { places } };
}

describe('lot 314: joints on the sides of Diablo II', () => {
  it('the side asked when the map has an opening there, the old choice otherwise', () => {
    // a: open on its north and its east; b: open on its south and its west
    const a = fake('a', 16, 16);
    const b = fake('b', 16, 16);
    const map = (id: string) => (id === 'a' ? a : b);
    expect(planChain(['a', 'b'], map, { 'a>b': 'E' })[0].oa.side).toBe('E');
    expect(planChain(['a', 'b'], map, { 'a>b': 'S' })[0].ob.side).toBe('N');
    // no opening on the side asked (a closed on its west): still joined, on another side
    const c = fake('c', 16, 16, (x) => x > 4);
    expect(planChain(['c', 'b'], (id) => (id === 'c' ? c : b), { 'c>b': 'W' })[0]?.oa.side).not.toBe('W');
  });

  it("an entry into a pocket of the neighbour's border is not taken when the open land has one", () => {
    const a = fake('a', 16, 16);
    // b's south: x 2 to 14 units a pocket, the wider (a wall row at y 70 sub-tiles cuts it off), x 25 to 30 the open land
    const b = fake('b', 16, 16, (x, y) => !(y === 70 && x < 30) && !(y >= 70 && x >= 30 && x < 50) && (y < 77 || (x >= 4 && x < 28) || (x >= 50 && x < 60)));
    const j = planChain(['a', 'b'], (id) => (id === 'a' ? a : b), { 'a>b': 'N' })[0];
    expect(j.ob.side).toBe('S');
    expect(j.ob.lo).toBeGreaterThanOrEqual(25);
  });
});

describe('lot 314: trees thinned out', () => {
  it('inside the border only, never a case with something else, the collision only opened, the same list every time', () => {
    const places: number[][] = [];
    // trees on every case (orientation 14), a wall (orientation 1) on case (20, 20)
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) places.push([0, 0, 0, x, y, 0, 14]);
    places.push([0, 0, 0, 20, 20, 0, 1]);
    const m = fake('a1_bloodmoor', 40, 40, (x, y) => !(x % 5 === 2 && y % 5 === 2), places);
    const t = thinTrees(m)!;
    expect(thinTrees(m)).toBe(t);
    const hidden = new Set(t.hidden);
    const inner = places.filter((p, i) => p[6] === 14 && p[3] >= 8 && p[4] >= 8 && p[3] < 32 && p[4] < 32 && i >= 0).length;
    expect(t.trees).toBe(inner);
    expect(t.kept / t.trees).toBeCloseTo(TREE_SHARE.a1_bloodmoor, 1);
    places.forEach((p, i) => {
      if (!hidden.has(i)) return;
      expect(p[3] >= 8 && p[4] >= 8 && p[3] < 32 && p[4] < 32, 'inside the ring').toBe(true);
      expect(p[3] === 20 && p[4] === 20, 'not the wall case').toBe(false);
    });
    for (let i = 0; i < t.blocked.length; i++) if (t.blocked[i]) expect(m.grid.blocked[i]).toBe(1);
    // a hidden tree's trunk freed
    const one = places.findIndex((p, i) => hidden.has(i) && p[6] === 14);
    const p = places[one];
    expect(t.blocked[(p[4] * 5 + 2) * m.grid.cols + p[3] * 5 + 2]).toBe(0);
    // a seam's opening (north, 40 to 50 units): the way through the ring cleared, beyond the overlap; the ring elsewhere kept
    const w = thinTrees(m, [{ side: 'N', lo: 40, hi: 50 }])!;
    expect(w).not.toBe(t);
    expect(thinTrees(m, [{ side: 'N', lo: 40, hi: 50 }])).toBe(w);
    const wh = new Set(w.hidden);
    const at = (x: number, y: number) => places.findIndex((q) => q[6] === 14 && q[3] === x && q[4] === y);
    expect(wh.has(at(18, 4)), 'in the passage, in the ring').toBe(true);
    expect(wh.has(at(18, 1)), 'in the overlap').toBe(false);
    expect(wh.has(at(4, 4)), 'the ring away from it').toBe(false);
    for (let i = 0; i < w.blocked.length; i++) if (w.blocked[i]) expect(m.grid.blocked[i]).toBe(1);
    // a map not listed: untouched
    expect(thinTrees(fake('a2_town', 40, 40, () => true, places))).toBeNull();
  });
});

describe('lot 314: no town portal at will in a campaign, the waypoint drawn as in Diablo II', () => {
  it('the portal button and key: off in a campaign zone and town, on in a Rush run', () => {
    const g = new Game(undefined, 'sorceress');
    g.startRun('tristram', 0, 7);
    expect(g.portalAllowed()).toBe(true);
    g.startRun('a1_coldplains', 0, 7);
    expect(g.portalAllowed()).toBe(false);
    g.enterTown('act1');
    expect(g.portalAllowed()).toBe(false);
  });

  it("the waypoint's sheet: D2's sprite of the DS1 object, the game's pillar only off the D2 maps", () => {
    expect(objectSheets('waypoint', undefined, 'obj_wp_wp_a1')).toEqual(['obj_wp_wp_a1']);
    expect(objectSheets('waypoint')).toEqual(['prop_pillar_deco']);
    expect(WAYPOINT_SHEETS.map((s) => waypointSheet(s.token, s.act))).toContain('obj_wp_wn_a1');
  });
});

const DIR = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps`;

/** Walking distance (4-connected sub-tiles) on a world's grid between two points; -1 out of reach */
function walkable(w: World, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const g = w.grid;
  const s = g.nearestFree(a.x, a.y, 3);
  const e = g.nearestFree(b.x, b.y, 3);
  if (!s || !e) return -1;
  const dist = new Int32Array(g.cols * g.rows).fill(-1);
  const q = new Int32Array(g.cols * g.rows);
  const si = g.idx(g.cellOf(s.x), g.cellOf(s.y));
  const ei = g.idx(g.cellOf(e.x), g.cellOf(e.y));
  let h = 0;
  let t = 0;
  dist[si] = 0;
  q[t++] = si;
  while (h < t) {
    const i = q[h++];
    if (i === ei) return dist[i] * 0.5;
    const cx = i % g.cols;
    for (const j of [i - 1, i + 1, i - g.cols, i + g.cols]) {
      if (j < 0 || j >= dist.length || g.blocked[j] || dist[j] >= 0) continue;
      if ((j === i - 1 && cx === 0) || (j === i + 1 && cx === g.cols - 1)) continue;
      dist[j] = dist[i] + 1;
      q[t++] = j;
    }
  }
  return -1;
}

describe.skipIf(!fs.existsSync(DIR))("lot 314 on Act I's D2 maps", () => {
  beforeAll(() => {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && /^(a1_|tristram|countess|andariel)/.test(x))) {
      const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
      if (j.grid) registerD2Map(parseD2Map(j));
    }
  });
  afterAll(() => clearD2Maps());
  const enter = (g: Game, id: string) => (g as unknown as { enterCampaignZone(id: string): boolean }).enterCampaignZone(id);

  it('every joint on the side of Diablo II, by openings into the open land, its crossing reached on foot from the entry', () => {
    const joints = act1Joints();
    // lot 320: the act's chains (the Underground Passage between the Stony Field and the Dark Wood, the Burial Grounds off the Cold Plains)
    expect(joints.map((j) => `${j.a}>${j.b}`)).toEqual(A1_CHAINS.flatMap((c) => c.slice(1).map((b, i) => `${c[i]}>${b}`)));
    for (const j of joints) expect(j.oa.side, `${j.a} -> ${j.b}`).toBe(D2_SIDES[`${j.a}>${j.b}`]);
    const g = new Game(undefined, 'sorceress');
    g.enterTown('act1');
    // the entry of each zone: the camp's waypoint, else the opening the hero walks in by; every seam of it reached from there
    for (const id of A1_CHAIN) {
      if (id === 'a1_town') g.enterTown('act1');
      else enter(g, id);
      const w = g.world;
      expect(w.zone.id).toBe(id);
      const from = id === 'a1_town' ? w.objects.find((o) => o.kind === 'waypoint')! : w.zone.start;
      for (const s of act1Seams(id)) {
        const mid = { x: (s.cross[0] + s.cross[2]) / 2, y: (s.cross[1] + s.cross[3]) / 2 };
        const d = walkable(w, from, mid);
        expect(d, `${id}: the seam toward ${s.to} on foot`).toBeGreaterThan(0);
        // the opening a real way through the border, not a gap between two trees: at least 5 units wide
        expect(s.hi - s.lo, `${id} -> ${s.to}: crossing width`).toBeGreaterThanOrEqual(5);
        // the exit toward it stands in it
        const exit = w.objects.find((o) => o.kind === 'portal' && o.ref === `zone:${s.to}`);
        expect(exit, `${id}: exit toward ${s.to}`).toBeTruthy();
      }
    }
    // the openings of each map on that side exist (none conjured)
    for (const j of joints) expect(openings(d2Map(j.a)!).some((o) => o.side === j.oa.side && o.lo === j.oa.lo)).toBe(true);
  }, 120000);

  it("the waypoints of Act I where their DS1 put them, with D2's sprite; no pillar", () => {
    const g = new Game(undefined, 'sorceress');
    g.enterTown('act1');
    for (const id of [...WAYPOINT_ZONES].filter((x) => x.startsWith('a1_'))) {
      if (id === 'a1_town') g.enterTown('act1');
      else g.startRun(id, 0, 7);
      const w = g.world;
      const wp = w.objects.filter((o) => o.kind === 'waypoint');
      expect(wp, id).toHaveLength(1);
      const d = d2Waypoint(d2Map(id), wp[0]);
      if (!d) continue;
      expect(Math.hypot(wp[0].x - d.x, wp[0].y - d.y), `${id}: at the DS1 object`).toBeLessThan(0.01);
      expect(wp[0].variant, id).toBe(d.sheet);
      expect(objectSheets('waypoint', undefined, wp[0].variant)).not.toContain('prop_pillar_deco');
      expect(w.grid.circleBlocked(wp[0].x, wp[0].y, 0.3), `${id}: the waypoint reachable`).toBe(false);
    }
  }, 120000);

  it('the Blood Moor keeps under a third of its trees inside the border; the neighbours drawn with the trees their zone hides', () => {
    const pass = (id: string) => act1Seams(id).map((s) => ({ side: s.side, lo: s.lo, hi: s.hi }));
    const t = thinTrees(d2Map('a1_bloodmoor'), pass('a1_bloodmoor'))!;
    expect(t.kept / t.trees).toBeLessThan(0.35);
    const g = new Game(undefined, 'sorceress');
    g.enterTown('act1');
    enter(g, 'a1_bloodmoor');
    const w = g.world;
    expect(w.zone.d2Map?.hidden).toBe(t.hidden);
    // the camp is not thinned; the Cold Plains drawn beyond the seam with the very list its zone uses
    const toCp = w.zone.seams!.find((s) => s.to === 'a1_coldplains')!;
    expect(toCp.hidden).toBe(thinTrees(d2Map('a1_coldplains'), pass('a1_coldplains'))!.hidden);
    expect(w.zone.seams!.find((s) => s.to === 'a1_town')!.hidden).toBeUndefined();
    enter(g, 'a1_coldplains');
    expect(g.world.zone.d2Map?.hidden).toBe(toCp.hidden);
    // the crossing from the camp still on foot, the hero standing free in the Blood Moor's opening
    enter(g, 'a1_bloodmoor');
    expect(g.world.grid.circleBlocked(g.world.zone.start.x, g.world.zone.start.y, 0.3)).toBe(false);
  }, 120000);
});
