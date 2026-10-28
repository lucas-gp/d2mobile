/**
 * Lot 317 (owner: "regenerate the imported maps to correct the waypoints"): the importer (tools/d2import) gives each zone of Diablo II with a
 * waypoint its waypoint room (lvlprest.txt's presets: the room's floor, its pad, and the waypoint object on it) and none to the zones
 * without one. Before: Jail 1, Halls of the Dead 2, the Arcane Sanctuary, Lower and Upper Kurast, Durance 2, the City of the Damned, the
 * River of Flame, the Halls of Pain and Worldstone Keep 2 had no such room (the sprite drawn without its pad, lot 315); the Blood Moor, the
 * Tamoe Highland, the Rocky Waste and Worldstone Keep 1 held one D2 does not give them. The maps of the player's device are generated again
 * (MAP_REVISIONS, that map alone).
 * The D2 maps are private: the part on them is skipped without them.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAPS } from '../../tools/d2import/map-specs';
import { maze } from '../../tools/d2import/act1-maps';
import { mergeDs1, type Ds1 } from '../../tools/d2import/formats/ds1';
import { MAP_REVISIONS, mapRevision } from '../../tools/d2import/map-revs';
import { staleMaps } from '../../src/platform/d2local-core';
import { clearD2Maps, d2Map, parseD2Map, registerD2Map } from '../../src/data/d2map';
import { d2Waypoint } from '../../src/data/d2waypoints';
import { WAYPOINT_ZONES } from '../../src/data/waypoints';
import { RUN_BY_ID } from '../../src/data/runs';
import { Game } from '../../src/sim/game';

const spec = (id: string) => MAPS.find((m) => m.id === id)!;
const files = (id: string) => [...(spec(id).parts ?? []).flatMap((p) => p.ds1.split('|')), ...(spec(id).ds1 ? [spec(id).ds1!] : [])].map((f) => f.toLowerCase());
/** the first file tried for each piece (the one present is used; the waypoint rooms exist in the archives: lvlprest.txt) */
const firsts = (id: string) => (spec(id).parts ?? []).map((p) => p.ds1.split('|')[0].toLowerCase());

/** lvlprest.txt's waypoint room of each zone (File1 of the `… Waypoint` preset, by the room's openings for a maze) */
const ROOM: Record<string, RegExp> = {
  a1_jail1: /^act1\/barracks\/jail[nsew]way\.ds1$/,
  a2_halls2: /^act2\/tomb\/tomb[nsew]waypoint\.ds1$/,
  a2_arcane: /^act2\/arcane\/sanctnsew4\.ds1$/,
  a3_lower: /^act3\/kurast\/burbs08x08_waypoint\.ds1$/,
  a3_upper: /^act3\/kurast\/burbs08x08_waypoint\.ds1$/,
  a3_durance2: /^act3\/travincal\/meph[nsew]warp\.ds1$/,
  a4_city: /^act4\/mesa\/warplava\.ds1$/,
  a4_river: /^act4\/diab\/bridgelava\.ds1$/,
  a5_death: /^expansion\/wildtemple\/tempswway\.ds1$/,
  a5_keep2: /^expansion\/baallair\/baal[nsew]way\.ds1$/,
};

describe('lot 317: the waypoint rooms of the map specs', () => {
  it("the ten zones without a waypoint room get Diablo II's", () => {
    for (const [id, re] of Object.entries(ROOM)) {
      expect(WAYPOINT_ZONES.has(id), id).toBe(true);
      expect(
        firsts(id).filter((f) => re.test(f)),
        id,
      ).toHaveLength(1);
    }
  });

  it('no waypoint room where Diablo II has no waypoint', () => {
    for (const id of ['a1_bloodmoor', 'a1_tamoe', 'a2_rocky', 'a5_keep1', 'a3_durance1', 'a2_viper1', 'a5_keep3', 'a5_anguish']) {
      expect(WAYPOINT_ZONES.has(id), id).toBe(false);
      expect(
        files(id).filter((f) => /waypoint|way\.ds1|warp\.ds1|warplava|bridgelava|sanctnsew4/.test(f)),
        id,
      ).toEqual([]);
    }
  });

  it('a maze makes the room it needs when it has none of its shape; the mazes that need none are drawn as before', () => {
    const o = { dir: 'barracks', prefix: 'jail', cell: [12, 12] as [number, number], rooms: 12, variants: ['', '2', '3'] };
    const ends = { prev: { suffix: ['warpprev'], shapes: /^.$/ }, next: { suffix: ['warpnext'], shapes: /^.$/ } };
    const without = maze('t_jail', { ...o, ends });
    const flagged = maze('t_jail', { ...o, ends, specials: [{ suffix: ['way'], shapes: /^.$/, make: true }] });
    const plain = maze('t_jail', { ...o, ends, specials: [{ suffix: ['way'], shapes: /^.$/ }] });
    // without `make`, a room of no fitting shape is not placed: the same map as without it
    if (!plain.parts!.some((p) => p.ds1.includes('way.ds1'))) expect(plain).toEqual(without);
    expect(flagged.parts!.filter((p) => /jail[NSEW]way\.ds1/.test(p.ds1.split('|')[0]))).toHaveLength(1);
    expect(flagged.size).toEqual(without.size);
    // the same draw every time
    expect(maze('t_jail', { ...o, ends, specials: [{ suffix: ['way'], shapes: /^.$/, make: true }] })).toEqual(flagged);
    // a four-way room (the Arcane Sanctuary's centre): its four openings
    const arc = spec('a2_arcane');
    const centre = arc.parts!.find((p) => p.ds1.startsWith('act2/arcane/sanctNSEW4'))!;
    expect(arc.anchors!.prev).toEqual([centre.cx + 6, centre.cy + 6]);
  });

  it('a piece laid `over` the others replaces what lay under it (layers and objects)', () => {
    const room = (w: number, v: number, objs: number): Ds1 => ({
      version: 18,
      width: w,
      height: w,
      act: 4,
      dt1: [],
      walls: [{ cells: new Uint32Array(w * w).fill(v), orient: new Uint32Array(w * w).fill(v) }],
      floors: [new Uint32Array(w * w).fill(v)],
      shadow: new Uint32Array(w * w),
      tags: null,
      objects: Array.from({ length: objs }, (_, i) => ({ type: 2, id: v, x: 1 + i, y: 1 + i, flags: 0 })),
    });
    const small = room(2, 0, 1);
    small.floors[0].fill(7);
    const m = mergeDs1(
      [
        { ds1: room(6, 3, 12), cx: 0, cy: 0 },
        { ds1: small, cx: 2, cy: 2, over: true },
      ],
      6,
      6,
    );
    expect(m.floors[0][2 * 6 + 2]).toBe(7);
    expect(m.walls[0].cells[2 * 6 + 2]).toBe(0);
    expect(m.walls[0].cells[0]).toBe(3);
    // the underlying room's objects within the piece are gone, the piece's kept
    expect(m.objects.filter((o) => o.x >= 10 && o.x < 20 && o.y >= 10 && o.y < 20).map((o) => o.id)).toEqual([0]);
  });

  it("the device's maps of an earlier export are generated again, those alone", () => {
    for (const id of [...Object.keys(ROOM), 'a1_bloodmoor', 'a1_tamoe', 'a2_rocky', 'a5_keep1']) expect(mapRevision(id), id).toBeGreaterThanOrEqual(1);
    expect(mapRevision('a1_coldplains')).toBe(0);
    for (const id of Object.keys(MAP_REVISIONS))
      expect(
        MAPS.some((m) => m.id === id),
        id,
      ).toBe(true);
    const e = { data: true, hi: true, lo: false, bytes: 1 };
    // lot 320: the City of the Damned at revision 2 (its open cliff): a map of revision 1 is stale too
    expect(staleMaps({ maps: { a1_jail1: e, a1_coldplains: e, a4_city: { ...e, rev: 1 }, a2_arcane: { ...e, rev: 1 } } }).sort()).toEqual(['a1_jail1', 'a4_city']);
    expect(staleMaps({})).toEqual([]);
  });
});

const DIR = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps`;

describe.skipIf(!fs.existsSync(DIR))("lot 317 on Diablo II's maps", () => {
  beforeAll(() => {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && !/-g\d|-t|^tmp_|^index/.test(x))) {
      const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
      if (j.grid) registerD2Map(parseD2Map(j));
    }
  });
  afterAll(() => clearD2Maps());

  it('every zone with a waypoint: its map holds the waypoint object of its room, the game stands it there; none elsewhere', () => {
    const g = new Game(undefined, 'sorceress');
    for (const id of WAYPOINT_ZONES) {
      if (['a1_town', 'a2_town', 'a3_town', 'a4_fortress', 'a5_town'].includes(id)) continue;
      const m = d2Map(id);
      expect(m, id).toBeTruthy();
      const ds = d2Waypoint(m);
      expect(ds?.sheet, `${id}: its map's waypoint object`).toMatch(/^obj_wp_/);
      g.startRun(id, 0, 7);
      const wp = g.world.objects.find((o) => o.kind === 'waypoint')!;
      expect(Math.hypot(wp.x - ds!.x, wp.y - ds!.y), id).toBeLessThan(0.01);
      // its room's floor under it: the pad drawn (the map's floor tiles, not a hole)
      expect(g.world.grid.circleBlocked(wp.x, wp.y, 0.3), id).toBe(false);
    }
    for (const id of ['a1_bloodmoor', 'a1_tamoe', 'a2_rocky', 'a5_keep1', 'a3_durance1']) expect(d2Waypoint(d2Map(id)), id).toBeNull();
  }, 300000);

  it('the River of Flame: its waypoint on the bridge, the way on to the Chaos Sanctuary at its far end, Hephasto at the forge', () => {
    const g = new Game(undefined, 'sorceress');
    g.startRun('a4_river', 0, 7);
    const w = g.world;
    const wp = w.objects.find((o) => o.kind === 'waypoint')!;
    const on = w.objects.find((o) => o.kind === 'portal' && o.ref === 'zone:a4_chaos')!;
    expect(on).toBeTruthy();
    // lot 320: the way on is the bridge's north end, walked into the Chaos Sanctuary (its seam); the waypoint on the bridge before it
    expect(Math.hypot(on.x - wp.x, on.y - wp.y)).toBeLessThan(45);
    expect(on.y).toBeLessThan(wp.y);
    const heph = RUN_BY_ID.a4_river && w.zone.spawns.find((s) => s.monster === 'hephasto');
    expect(heph).toBeTruthy();
    expect(Math.hypot(heph!.x - wp.x, heph!.y - wp.y)).toBeGreaterThan(40);
  }, 120000);
});
