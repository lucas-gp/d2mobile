/**
 * Cartes de l'Acte V : Bloody Foothills (bande de 15 morceaux de 16 × 48), hautes terres et plateau (pièces de barricade, de ferme et de lac), cavernes de glace (labyrinthes de 16 × 16),
 * Halls de l'Angoisse et de l'Appel de la Mort (carrés de 40 × 40), Donjon de la Pierre-Monde (pièces « baal »). Mêmes principes qu'act1-maps.ts.
 */
import type { MapSpec } from './map-build';
import { maze, outdoor } from './act1-maps';

const strips = (id: string): MapSpec => ({
  id,
  size: [240, 48],
  parts: [
    { ds1: 'expansion/siege/striptownsiege.ds1', cx: 0, cy: 0 },
    ...Array.from({ length: 13 }, (_, i) => ({ ds1: `expansion/siege/strip${String(i + 1).padStart(2, '0')}.ds1`, cx: (i + 1) * 16, cy: 0 })),
    { ds1: 'expansion/siege/stripseigebar.ds1', cx: 224, cy: 0 },
  ],
  anchors: { prev: [8, 24], next: [232, 24] },
});

const SMALL_DIRT = [
  'siege/farm3',
  'siege/farm4',
  'siege/farm5',
  'siege/lake1',
  'siege/lake2',
  'siege/lake3',
  'siege/lake5',
  'siege/lake6',
  'siege/lake7',
  'ruins/northhouse1',
  'ruins/westhouse1',
  'siege/farm1',
];
const BIG_DIRT = ['siege/newbarraa1', 'siege/newbarrbb1', 'siege/newbarrcc1', 'siege/newbarrdd1', 'siege/newbarrab1', 'siege/newbarrba1', 'siege/newbarrcd1', 'siege/newbarrdc1'];
const BIG_SNOW = ['siege/snowbarraa1', 'siege/snowbarrbb1', 'siege/snowbarrcc1', 'siege/snowbarrdd1', 'siege/snowbarrab1', 'siege/snowbarrba1', 'siege/snowbarrcd1', 'siege/snowbarrdc1'];

const ice = (id: string, rooms: number, specials: Parameters<typeof maze>[1]['specials'] = []): MapSpec =>
  maze(id, {
    act: 'expansion',
    dir: 'icecave',
    prefix: 'ice',
    cell: [16, 16],
    rooms,
    variants: ['01', '02', '03'],
    theme: 0.2,
    ends: { prev: { suffix: ['back01'], shapes: /^.$/ }, next: { suffix: ['ahead01', 'down01'], shapes: /^.$/ } },
    specials,
  });

/**
 * Lot 320: an ice cave of Diablo II's way up the mountain, with its dead end below: the way back (`prev`), the way ahead (`next`: the
 * Crystalline Passage to the Glacial Trail, the Glacial Trail out onto the Frozen Tundra, the Ancients' Way up to the Arreat Summit) and the
 * way down to its side cave (`down`: the Frozen River, the Drifter Cavern, the Icy Cellar)
 */
const way = { suffix: ['way'], shapes: /^.$/ };
const down = { suffix: ['down01'], shapes: /^.$/, anchor: 'down', make: true };

/**
 * Halls de l'Angoisse et de l'Appel de la Mort : quatre salles de 40 × 40 (SE montante, SW, NE, NW descendante) ; `way` (lot 317) : la salle SW
 * est celle du point de passage (tempSWWay de lvlprest.txt), comme dans les Halls of Pain de Diablo II
 */
function halls(id: string, v: string, way = false): MapSpec {
  const f = (n: string) => `expansion/wildtemple/${n}.ds1`;
  return {
    id,
    size: [80, 80],
    parts: [
      { ds1: [f(`tempse${v}`), f('tempse01')].join('|'), cx: 0, cy: 0 },
      { ds1: [...(way ? [f('tempswway')] : []), f(`tempsw${v}`), f('tempsw01')].join('|'), cx: 40, cy: 0 },
      { ds1: [f(`tempne${v}`), f('tempne01')].join('|'), cx: 0, cy: 40 },
      { ds1: [f('tempnwdown'), f(`tempnw${v}`)].join('|'), cx: 40, cy: 40 },
    ],
    anchors: { prev: [20, 20], next: [60, 60] },
  };
}

const keep = (id: string, rooms: number): MapSpec =>
  maze(id, {
    act: 'expansion',
    dir: 'baallair',
    prefix: 'baal',
    cell: [16, 16],
    rooms,
    variants: ['01', '02', '03'],
    ends: { prev: { suffix: ['up01', 'up02'], shapes: /^...$/ }, next: { suffix: ['down01', 'down02'], shapes: /^.$/ } },
    // lot 317: Diablo II's waypoint of the Worldstone Keep is on level 2 (Levels.txt), its room (baal<N|S|E|W>way) there, not on level 1
    specials: id === 'a5_keep2' ? [{ suffix: ['way'], shapes: /^.$/, make: true }] : [],
  });

export const ACT5_SPECS: MapSpec[] = [
  strips('a5_foothills'),
  outdoor('a5_highlands', {
    act: 'expansion',
    small: SMALL_DIRT,
    big: BIG_DIRT,
    fixed: [
      { ds1: 'siege/siegewaypoint1', anchor: 'waypoint', at: [1, 4] },
      { ds1: 'siege/hellwrpw', anchor: 'temple', at: [7, 6], size: 16 },
    ],
  }),
  outdoor('a5_plateau', {
    act: 'expansion',
    small: SMALL_DIRT.map((p) => p),
    big: BIG_SNOW,
    fixed: [
      { ds1: 'siege/snowwaypoint1', anchor: 'waypoint', at: [1, 4] },
      { ds1: 'icecave/northentrance_snow', anchor: 'cave', at: [7, 2], size: 32 },
    ],
  }),
  outdoor('a5_tundra', {
    act: 'expansion',
    small: SMALL_DIRT,
    big: BIG_SNOW,
    fixed: [
      { ds1: 'siege/snowwaypoint1', anchor: 'waypoint', at: [1, 4] },
      { ds1: 'icecave/westentrance_snow', anchor: 'cave', at: [6, 6], size: 32 },
      // lot 320: the Glacial Trail's way out onto the Frozen Tundra (Diablo II: the Tundra lies between it and the Ancients' Way)
      { ds1: 'icecave/northentrance_snow', anchor: 'cave2', at: [1, 0], size: 32 },
    ],
  }),
  ice('a5_crystal1', 10, [way, down]),
  { id: 'a5_river', ds1: 'expansion/icecave/riverice01.ds1' },
  ice('a5_crystal2', 10, [way, down]),
  { id: 'a5_echo', ds1: 'expansion/icecave/poolroom01.ds1' },
  ice('a5_glacial1', 15, [way, down]),
  { id: 'a5_glacial2', ds1: 'expansion/icecave/poolroom02.ds1' },
  halls('a5_anguish', '01'),
  halls('a5_death', '02', true),
  keep('a5_keep1', 9),
  keep('a5_keep2', 9),
  keep('a5_keep3', 9),
];
