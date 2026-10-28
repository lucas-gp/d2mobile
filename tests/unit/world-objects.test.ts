/** Objets interactifs placés comme D2 (DS1, objgroup.txt / Levels.txt), fosses rouges de l'Acte V, niveaux de zone PD2, point de passage A5. */
import { describe, expect, it } from 'vitest';
import { DS1_OBJECTS, OBJ_GROUPS, ZONE_OBJ_GROUPS } from '../../src/data/worldobjects';
import { objectFromKind, placeWorldObjects, addQuestObjects } from '../../src/data/zones/d2objects';
import { registerD2Map, type D2MapData } from '../../src/data/d2map';
import { ACT5_STEPS, A5_BY_ID } from '../../src/data/zones/act5';
import { A2_LEVELS } from '../../src/data/levels-a2';
import { A3_LEVELS } from '../../src/data/levels-a3';
import { A5_LEVELS } from '../../src/data/levels-a5';
import { RUN_BY_ID } from '../../src/data/runs';
import { WAYPOINT_ZONES } from '../../src/data/waypoints';
import { a1Level } from '../../src/data/zones/act1';
import { withoutPd2 } from '../needs-pd2';
import type { ZoneDef } from '../../src/data/zone-types';

/** Carte vide de 40 × 40 unités, toute praticable, avec des objets de DS1 */
function fakeMap(id: string, objects: [number, number, number, number][], act = 1): D2MapData {
  const cols = 80;
  const rows = 80;
  const m = { id, units: [40, 40], grid: { cols, rows, blocked: new Uint8Array(cols * rows), opaque: new Uint8Array(cols * rows) }, landmarks: {}, raw: { act, objects } } as unknown as D2MapData;
  registerD2Map(m);
  return m;
}
const emptyZone = (id: string): ZoneDef =>
  ({
    id,
    name: id,
    width: 40,
    height: 40,
    ambient: { color: 0, level: 0 },
    ground: 'dirt',
    patches: [],
    walls: [],
    props: [],
    blockers: [],
    spawns: [],
    lights: [],
    exits: [],
    objects: [],
    start: { x: 2, y: 2 },
  }) as unknown as ZoneDef;

describe('Données des objets (objects.txt, objgroup.txt, Levels.txt)', () => {
  it('genres des objets de DS1 : coffres, sarcophages, urnes, cadavres, sanctuaires, puits, objets de quête', () => {
    const kinds = new Set(Object.values(DS1_OBJECTS));
    for (const k of [
      'chest',
      'sarcophagus',
      'barrel',
      'urn',
      'corpse',
      'rack',
      'armor',
      'shrine',
      'shrine_health',
      'shrine_mana',
      'well',
      'q_malus',
      'q_lam_esen',
      'q_hellforge',
      'q_orifice',
      'qchest_eye',
    ])
      expect(kinds.has(k), k).toBe(true);
    for (const k of kinds) expect(k === 'q_inifuss' || !!objectFromKind(k, 0, 0), k).toBe(true);
  });

  it('groupes : chaque zone de campagne D2 en a d’après Levels.txt (Blood Moor : corps, objets de forêt, coffres)', () => {
    expect(ZONE_OBJ_GROUPS.a1_bloodmoor.map(([g]) => g).sort((a, b) => a - b)).toEqual([4, 33, 34, 38]);
    expect(ZONE_OBJ_GROUPS.a1_bloodmoor.find(([g]) => g === 33)![1]).toBe(17);
    expect(OBJ_GROUPS[3].ids.map(([k]) => k)).toEqual(['chest', 'chest']);
    expect(Object.keys(ZONE_OBJ_GROUPS).length).toBeGreaterThan(100);
    // Abaddon, Fosse d'Achéron, Fosse infernale : groupes de l'enfer (Levels 125-127)
    for (const z of ['a5_abaddon', 'a5_acheron', 'a5_infernal']) expect(ZONE_OBJ_GROUPS[z]?.length, z).toBeGreaterThan(0);
  });
});

describe('Placement', () => {
  it('objets du DS1 à leur place, groupes semés pièce par pièce, rien près du départ', () => {
    const m = fakeMap('t_place', [
      [2, 5, 10, 10], // coffre (acte 1)
      [2, 31, 4, 4], // sanctuaire de santé
      [1, 0, 6, 6], // emplacement de monstre : ignoré
    ]);
    const z = emptyZone('a1_bloodmoor');
    const cells: number[] = [];
    for (let i = 0; i < 80 * 80; i++) cells.push(i);
    const pos = (i: number) => ({ x: ((i % 80) + 0.5) * 0.5, y: (Math.floor(i / 80) + 0.5) * 0.5 });
    placeWorldObjects(z, m, 'a1_bloodmoor', 1, cells, pos, { x: 2, y: 2 });
    expect(z.objects.some((o) => o.kind === 'chest' && Math.abs(o.x - 25) < 1 && Math.abs(o.y - 25) < 1)).toBe(true);
    expect(z.objects.some((o) => o.kind === 'shrine' && o.variant === 'health')).toBe(true);
    for (const o of z.objects) expect(Math.hypot(o.x - 2, o.y - 2)).toBeGreaterThanOrEqual(5);
    // déterministe
    const z2 = emptyZone('a1_bloodmoor');
    placeWorldObjects(z2, m, 'a1_bloodmoor', 1, cells, pos, { x: 2, y: 2 });
    expect(z2.objects).toEqual(z.objects);
  });

  it('un objet de quête du DS1 n’apparaît que dans la zone de sa quête', () => {
    const m = fakeMap('t_forge', [[2, 42, 10, 10]], 4);
    const cells = [3000];
    const pos = () => ({ x: 30, y: 30 });
    const a = emptyZone('a4_river');
    placeWorldObjects(a, m, 'a4_river', 1, cells, pos, { x: 2, y: 2 });
    expect(a.objects.some((o) => o.kind === 'quest' && o.id === 'q_hellforge')).toBe(true);
    const b = emptyZone('a5_abaddon');
    placeWorldObjects(b, m, 'a5_abaddon', 1, cells, pos, { x: 2, y: 2 });
    expect(b.objects.some((o) => o.kind === 'quest')).toBe(false);
  });

  it('objets de quête : un par zone, cages des barbares aux emplacements des prisonniers', () => {
    const z = emptyZone('a5_highlands');
    const m = fakeMap('t_hl', []);
    (m.raw as { presets?: unknown }).presets = [
      ['act5barb1', 10, 10],
      ['act5barb1', 20, 30],
      ['act5barb1', 30, 12],
    ];
    z.d2Map = { id: 't_hl', cols: 80, rows: 80, blocked: m.grid.blocked, opaque: m.grid.opaque };
    addQuestObjects(z, 'a5_highlands');
    const cages = z.objects.filter((o) => o.kind === 'quest' && o.id === 'q_prison');
    expect(cages.length).toBe(3);
    expect(cages.some((o) => Math.abs(o.x - 20) < 1 && Math.abs(o.y - 30) < 1)).toBe(true);
  });
});

describe('Acte V : fosses rouges, point de passage', () => {
  it('Abaddon, Fosse d’Achéron et Fosse infernale : portails rouges des hautes terres, niveaux PD2 (Enfer 85 ; D2 1.13c : 81, 82, 83)', () => {
    expect(A5_BY_ID.a5_highlands.exits.some((e) => e.to === 'a5_abaddon')).toBe(true);
    expect(A5_BY_ID.a5_plateau.exits.some((e) => e.to === 'a5_acheron')).toBe(true);
    expect(A5_BY_ID.a5_tundra.exits.some((e) => e.to === 'a5_infernal')).toBe(true);
    for (const [id, lvl] of [
      ['a5_abaddon', withoutPd2 ? [39, 60, 81] : [39, 60, 85]],
      ['a5_acheron', withoutPd2 ? [39, 61, 82] : [39, 61, 85]],
      ['a5_infernal', withoutPd2 ? [39, 62, 83] : [39, 62, 85]],
    ] as const) {
      expect(ACT5_STEPS.some((s) => s.id === id)).toBe(true);
      expect(A5_LEVELS[id].lvl).toEqual(lvl);
      expect(RUN_BY_ID[id].zoneLevel).toEqual(lvl);
    }
  });

  it('point de passage dans les Halls de la Douleur (Levels 123), pas dans les Halls de l’Angoisse', () => {
    expect(WAYPOINT_ZONES.has('a5_death')).toBe(true);
    expect(WAYPOINT_ZONES.has('a5_anguish')).toBe(false);
    expect(A5_BY_ID.a5_death.name).toBe('Halls de la Douleur');
    expect([...WAYPOINT_ZONES].length).toBe(39);
  });
});

describe('Niveaux de zone PD2', () => {
  // niveaux PD2 du patch du mod (la base : Levels.txt 1.13c)
  it.skipIf(withoutPd2)('Tunnels antiques, temples de Kurast, égouts : plus de niveaux 1-2 hérités des tables annexes du wiki', () => {
    expect(A2_LEVELS.a2_tunnels.lvl).toEqual([17, 46, 85]);
    expect(A2_LEVELS.a2_sewer1.lvl).toEqual([13, 43, 74]);
    for (const t of ['a3_temple2', 'a3_temple3', 'a3_temple4', 'a3_temple5', 'a3_temple6']) expect(A3_LEVELS[t].lvl[2], t).toBe(85);
    expect(A3_LEVELS.a3_sewer1.lvl).toEqual([23, 52, 85]);
  });

  it('Comtesse, Andariel, Tristram de campagne en Enfer : 85, 85, 82 (PD2) ; 79, 73, 76 (Levels.txt)', () => {
    const [countess, andariel, tristram, plains] = withoutPd2 ? [79, 73, 76, 83] : [85, 85, 82, 85];
    expect(RUN_BY_ID.a1_countess.zoneLevel[2]).toBe(countess);
    expect(RUN_BY_ID.countess.zoneLevel[2]).toBe(countess);
    expect(RUN_BY_ID.a1_andariel.zoneLevel[2]).toBe(andariel);
    expect(RUN_BY_ID.andariel.zoneLevel[2]).toBe(andariel);
    expect(RUN_BY_ID.a1_tristram.zoneLevel[2]).toBe(tristram);
    expect(RUN_BY_ID.tristram.zoneLevel[2]).toBe(tristram);
    expect(RUN_BY_ID.river.zoneLevel).toEqual([27, 57, 85]);
    expect(RUN_BY_ID.a4_plains.zoneLevel[2]).toBe(plains);
    // fonction de la base : Levels.txt (la valeur PD2 est un patch des runs)
    expect(a1Level('a1_countess')).toEqual([7, 42, 79]);
  });
});
