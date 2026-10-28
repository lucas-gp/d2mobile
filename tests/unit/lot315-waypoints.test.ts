/**
 * Lot 315 (owner, Campaign, d2 and pd2):
 * 1. "remove the town portal that opens by itself on arrival by waypoint in a zone of the campaign": no portal opened on arrival in a
 *    zone of the Campaign (waypoint, stairs, exits); Rush runs and game modes' rounds (hidden, with a director) keep theirs;
 * 2. "add and activate the waypoints in the zones that must have one, as in the real Diablo": the zones with a waypoint are Diablo II's
 *    (Levels.txt `Waypoint`, 9 + 9 + 9 + 3 + 9), each holds one, drawn by D2's sprite (its DS1 object's, or on a map without the waypoint
 *    room the sprite that room brings, on the walk from the entry), reached on foot, activated when touched (by the simulation), listed in
 *    the travel menu then, also in a zone walked into at a seam; no waypoint where Diablo II has none (Tristram of the Campaign);
 *    the town's waypoint is active from the start.
 * The D2 maps are private: those parts are skipped without them.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearD2Maps, d2Map, parseD2Map, registerD2Map } from '../../src/data/d2map';
import { act1Seams } from '../../src/data/zones/act1';
import { d2Waypoint, WAYPOINT_ROOM, WAYPOINT_SHEETS, waypointSheet } from '../../src/data/d2waypoints';
import { WAYPOINT_ZONES } from '../../src/data/waypoints';
import { RUN_BY_ID, RUNS } from '../../src/data/runs';
import type { SeamDef } from '../../src/data/zone-types';
import { objectSheets } from '../../src/render/renderer-shared';
import { Game, isCampaignZone } from '../../src/sim/game';
import { TICK_HZ } from '../../src/sim/constants';
import type { World } from '../../src/sim/world';

/** Diablo II's waypoints (Levels.txt, LoD 1.13c: the levels whose `Waypoint` is set), our zone for each, act by act */
const D2_WAYPOINTS: Record<string, string> = {
  a1_town: 'Rogue Encampment',
  a1_coldplains: 'Cold Plains',
  a1_stonyfield: 'Stony Field',
  a1_darkwood: 'Dark Wood',
  a1_blackmarsh: 'Black Marsh',
  a1_cloister: 'Outer Cloister',
  a1_jail1: 'Jail Level 1',
  a1_inner: 'Inner Cloister',
  a1_cata2: 'Catacombs Level 2',
  a2_town: 'Lut Gholein',
  a2_sewer2: 'Sewers Level 2',
  a2_dryhills: 'Dry Hills',
  a2_halls2: 'Halls of the Dead Level 2',
  a2_oasis: 'Far Oasis',
  a2_lostcity: 'Lost City',
  a2_cellar1: 'Palace Cellar Level 1',
  a2_arcane: 'Arcane Sanctuary',
  a2_canyon: 'Canyon of the Magi',
  a3_town: 'Kurast Docks',
  a3_spider: 'Spider Forest',
  a3_marsh: 'Great Marsh',
  a3_jungle: 'Flayer Jungle',
  a3_lower: 'Lower Kurast',
  a3_bazaar: 'Kurast Bazaar',
  a3_upper: 'Upper Kurast',
  a3_travincal: 'Travincal',
  a3_durance2: 'Durance of Hate Level 2',
  a4_fortress: 'Pandemonium Fortress',
  a4_city: 'City of the Damned',
  a4_river: 'River of Flame',
  a5_town: 'Harrogath',
  a5_highlands: 'Frigid Highlands',
  a5_plateau: 'Arreat Plateau',
  a5_crystal1: 'Crystalline Passage',
  a5_crystal2: 'Glacial Trail',
  a5_death: 'Halls of Pain',
  a5_tundra: 'Frozen Tundra',
  a5_glacial1: "Ancients' Way",
  a5_keep2: 'Worldstone Keep Level 2',
};
const TOWNS = ['a1_town', 'a2_town', 'a3_town', 'a4_fortress', 'a5_town'];
const portalHome = (w: World) => w.objects.filter((o) => o.kind === 'portal' && o.ref === 'town');
const enter = (g: Game, id: string) => (g as unknown as { enterCampaignZone(id: string): boolean }).enterCampaignZone(id);

describe('lot 315: no town portal on arrival in the Campaign', () => {
  it('a zone of the Campaign entered by its waypoint or its exit: no portal; a Rush run: its portal', () => {
    const g = new Game(undefined, 'sorceress');
    g.startRun('tristram', 0, 7);
    expect(portalHome(g.world)).toHaveLength(1);
    g.startRun('a1_coldplains', 0, 7);
    expect(g.world.zone.id).toBe('a1_coldplains');
    expect(portalHome(g.world), 'by the waypoint').toHaveLength(0);
    enter(g, 'a1_stonyfield');
    expect(portalHome(g.world), 'by its exit').toHaveLength(0);
    g.startRun('a4_city', 0, 7);
    expect(portalHome(g.world), 'Act IV').toHaveLength(0);
    g.startRun('mephisto', 0, 7);
    expect(portalHome(g.world), 'Rush again').toHaveLength(1);
  });

  it("the Campaign's zones only: not a game mode's round (hidden, with a director), nor a Rush run", () => {
    for (const r of RUNS) if (r.campaign && !r.hidden) expect(isCampaignZone(r), r.id).toBe(true);
    expect(isCampaignZone(RUN_BY_ID.tristram)).toBe(false);
    const round = { ...RUN_BY_ID.a1_coldplains, hidden: true, director: () => ({}) as never };
    expect(isCampaignZone(round)).toBe(false);
  });
});

describe("lot 315: Diablo II's waypoints", () => {
  it("the zones with a waypoint are Diablo II's, 9 + 9 + 9 + 3 + 9, each a zone of the Campaign", () => {
    expect([...WAYPOINT_ZONES].sort()).toEqual(Object.keys(D2_WAYPOINTS).sort());
    const byAct = [1, 2, 3, 4, 5].map((a) => [...WAYPOINT_ZONES].filter((z) => z.startsWith(`a${a}_`)).length);
    expect(byAct).toEqual([9, 9, 9, 3, 9]);
    for (const id of WAYPOINT_ZONES) {
      expect(RUN_BY_ID[id]?.campaign, id).toBeTruthy();
      expect(RUN_BY_ID[id].waypoint, id).toBe(true);
    }
    for (const r of RUNS) if (r.campaign && !r.hidden && r.waypoint) expect(WAYPOINT_ZONES.has(r.id), r.id).toBe(true);
  });

  it("the waypoints of maps without their room: Diablo II's sprites (exported sheets), in zones with a waypoint", () => {
    for (const [id, r] of Object.entries(WAYPOINT_ROOM)) {
      expect(WAYPOINT_ZONES.has(id), id).toBe(true);
      expect(
        WAYPOINT_SHEETS.some((s) => s.token === r.token && s.act === r.act),
        id,
      ).toBe(true);
      expect(objectSheets('waypoint', undefined, waypointSheet(r.token, r.act))).toEqual([waypointSheet(r.token, r.act)]);
    }
  });

  it('touched: active (the first touch kept), the zone listed in the travel menu; the town active from the start', () => {
    const g = new Game(undefined, 'sorceress');
    g.enterTown('act1');
    const list = () => g.campaignZones('act1');
    expect(list()[0].run.id).toBe('a1_town');
    expect(list()[0].visited).toBe(true);
    expect(list().find((z) => z.run.id === 'a1_coldplains')?.visited).toBe(false);
    g.startRun('a1_coldplains', 0, 7);
    const wp = g.world.objects.find((o) => o.kind === 'waypoint');
    expect(wp).toBeTruthy();
    // the simulation's interaction (the screen only opens the menu)
    g.world.events.push({ t: 'interact', kind: 'waypoint', objectId: wp!.id });
    g.step(1);
    const t = g.character.progression.milestones['wp:a1_coldplains'];
    expect(t).toBeDefined();
    expect(list().find((z) => z.run.id === 'a1_coldplains')?.visited).toBe(true);
    g.character.progression.playTime += 100;
    g.world.events.push({ t: 'interact', kind: 'waypoint', objectId: wp!.id });
    g.step(1);
    expect(g.character.progression.milestones['wp:a1_coldplains']).toBe(t);
    // every town first in its act's list, active
    for (const [i, act] of ['act1', 'act2', 'act3', 'act4', 'act5'].entries()) {
      const z = g.campaignZones(act);
      expect(z[0].run.id).toBe(TOWNS[i]);
      expect(z[0].visited).toBe(true);
      expect(z.map((x) => x.run.id).sort()).toEqual([...WAYPOINT_ZONES].filter((id) => id.startsWith(`a${i + 1}_`)).sort());
    }
  });

  it("the Campaign's Tristram has no waypoint (Diablo II's none); the Rush run's keeps it", () => {
    const g = new Game(undefined, 'sorceress');
    g.startRun('a1_tristram', 0, 7);
    expect(g.world.objects.filter((o) => o.kind === 'waypoint')).toHaveLength(0);
    g.startRun('tristram', 0, 7);
    expect(g.world.objects.filter((o) => o.kind === 'waypoint')).toHaveLength(1);
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

/** Touches the zone's waypoint as a player does (the hero set 3 units off, the object asked for: he walks to it); the ticks, or -1 */
function touch(g: Game, wp: { id: number; x: number; y: number }, id: string): number {
  const w = g.world;
  w.monsters = w.monsters.filter((m) => m.pet);
  const f = w.grid.nearestFree(wp.x + 2, wp.y + 2, 4) ?? wp;
  w.player.x = w.player.px = f.x;
  w.player.y = w.player.py = f.y;
  w.input.interact = wp.id;
  for (let t = 0; t < 8 * TICK_HZ; t++) {
    g.step(1);
    if (g.character.progression.milestones[`wp:${id}`] !== undefined) return t;
  }
  return -1;
}

describe.skipIf(!fs.existsSync(DIR))("lot 315 on Diablo II's maps (Acts I to V)", () => {
  beforeAll(() => {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && !/-g\d|-t|^tmp_|^index/.test(x))) {
      const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
      if (j.grid) registerD2Map(parseD2Map(j));
    }
  });
  afterAll(() => clearD2Maps());

  it("every zone with a waypoint holds one, D2's sprite, reached on foot from the entry, activated when touched, listed; no portal", () => {
    const g = new Game(undefined, 'sorceress');
    g.character.level = 99;
    for (const id of WAYPOINT_ZONES) {
      const town = TOWNS.includes(id);
      if (town) g.enterTown(RUN_BY_ID[id].campaign);
      else g.startRun(id, 0, 7);
      const w = g.world;
      expect(w.zone.id === id || (id === 'a5_town' && w.zone.town), id).toBe(true);
      const wps = w.objects.filter((o) => o.kind === 'waypoint');
      expect(wps, id).toHaveLength(1);
      const wp = wps[0];
      // Harrogath's stone is in its map's tiles (lot 314): no sheet over it; every other one D2's sprite of it
      if (id !== 'a5_town') {
        expect(wp.variant, id).toMatch(/^obj_wp_/);
        expect(objectSheets('waypoint', undefined, wp.variant), id).not.toContain('prop_pillar_deco');
        const m = d2Map(w.zone.d2Map?.id ?? id);
        const ds = d2Waypoint(m);
        if (ds) expect(Math.hypot(wp.x - ds.x, wp.y - ds.y), `${id}: on its DS1 object`).toBeLessThan(0.01);
        else expect(WAYPOINT_ROOM[id], `${id}: a map without its waypoint room is listed`).toBeTruthy();
      }
      expect(w.grid.circleBlocked(wp.x, wp.y, 0.3), `${id}: free`).toBe(false);
      expect(walkable(w, w.zone.start, wp), `${id}: on foot from the entry`).toBeGreaterThanOrEqual(0);
      if (!town) {
        expect(portalHome(w), `${id}: no portal on arrival`).toHaveLength(0);
        expect(touch(g, wp, id), `${id}: activated when touched`).toBeGreaterThanOrEqual(0);
        expect(g.campaignZones(RUN_BY_ID[id].campaign!).find((z) => z.run.id === id)?.visited, `${id}: listed`).toBe(true);
      }
    }
  }, 600000);

  it("the roomless maps' waypoints where D2 puts their room: the Arcane Sanctuary's by the arrival, the City's by the way down", () => {
    const g = new Game(undefined, 'sorceress');
    const at = (id: string) => {
      g.startRun(id, 0, 7);
      const w = g.world;
      const wp = w.objects.find((o) => o.kind === 'waypoint')!;
      const next = w.objects.find((o) => o.kind === 'portal' && o.ref === `zone:${{ a4_city: 'a4_river', a4_river: 'a4_chaos' }[id] ?? ''}`);
      return { start: walkable(w, w.zone.start, wp), next: next ? walkable(w, next, wp) : -1 };
    };
    expect(at('a2_arcane').start).toBeLessThan(20);
    const city = at('a4_city');
    expect(city.next).toBeGreaterThanOrEqual(0);
    expect(city.next).toBeLessThan(city.start);
    // lot 317: the River's waypoint is its bridge's (BridgeLava), by the way on to the Chaos Sanctuary
    const river = at('a4_river');
    expect(river.next).toBeGreaterThanOrEqual(0);
    expect(river.next).toBeLessThan(river.start);
    // the dungeons' within them: not at the entry
    for (const id of ['a1_jail1', 'a2_halls2', 'a3_durance2', 'a5_death', 'a5_keep2']) expect(at(id).start, id).toBeGreaterThan(20);
  }, 300000);

  it('no waypoint in the zones of the Campaign where Diablo II has none', () => {
    for (const r of RUNS) {
      if (!r.campaign || r.hidden || WAYPOINT_ZONES.has(r.id)) continue;
      const z = r.build(7, 0);
      expect(
        z.objects.filter((o) => o.kind === 'waypoint'),
        r.id,
      ).toHaveLength(0);
    }
  }, 600000);

  it('a zone walked into at a seam: its waypoint activated when touched, listed, without a portal', () => {
    const g = new Game(undefined, 'sorceress');
    g.enterTown('act1');
    enter(g, 'a1_bloodmoor');
    const s = act1Seams('a1_bloodmoor').find((x: SeamDef) => x.to === 'a1_coldplains')!;
    const mid = { x: (s.cross[0] + s.cross[2]) / 2, y: (s.cross[1] + s.cross[3]) / 2 };
    const f = g.world.grid.nearestFree(mid.x, mid.y, 4)!;
    g.world.monsters = [];
    g.world.player.x = g.world.player.px = f.x;
    g.world.player.y = g.world.player.py = f.y;
    // walked on through the crossing (a held stick toward the neighbour)
    for (let t = 0; t < 10 * TICK_HZ && g.world.zone.id === 'a1_bloodmoor'; t++) {
      const w = g.world;
      const d = s.side === 'E' ? { x: 1, y: 0 } : s.side === 'W' ? { x: -1, y: 0 } : s.side === 'N' ? { x: 0, y: -1 } : { x: 0, y: 1 };
      w.input.moveX = d.x;
      w.input.moveY = d.y;
      g.step(1);
    }
    expect(g.world.zone.id).toBe('a1_coldplains');
    g.world.input.moveX = 0;
    g.world.input.moveY = 0;
    expect(portalHome(g.world)).toHaveLength(0);
    const wp = g.world.objects.find((o) => o.kind === 'waypoint' && !o.mirror)!;
    expect(wp.variant).toBe('obj_wp_wp_a1');
    expect(touch(g, wp, 'a1_coldplains')).toBeGreaterThanOrEqual(0);
    expect(g.campaignZones('act1').find((z) => z.run.id === 'a1_coldplains')?.visited).toBe(true);
    // and travelled to from the camp's: arrived by it, no portal
    g.enterTown('act1');
    expect(g.startRun('a1_coldplains', 0)).toBe(true);
    expect(g.world.zone.id).toBe('a1_coldplains');
    expect(portalHome(g.world)).toHaveLength(0);
  }, 300000);
});
