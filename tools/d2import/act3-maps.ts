/**
 * Cartes de l'Acte III : Port de Kurast, jungle (pièces « Riv » de 32 × 32 en réseau de clairières), Kurast (Taudis, Banlieue, Métropole, Chaussée), Travincal, grottes des araignées,
 * fosses et donjons des Flayers, égouts, temples, Durance de la Haine. Mêmes principes qu'act1-maps.ts.
 */
import type { MapSpec } from './map-build';
import { maze, outdoor } from './act1-maps';

/** Quatre pièces (SE, SW, NE, NW) en carré 2 × 2 : grottes des araignées ; `special` remplace une pièce par sa variante (coffre, mage) */
function quad(id: string, dir: string, pre: string, size: number, special: Partial<Record<'se' | 'sw' | 'ne' | 'nw', string>> = {}): MapSpec {
  const at: Record<string, [number, number]> = { se: [0, 0], sw: [size, 0], ne: [0, size], nw: [size, size] };
  const parts = Object.entries(at).map(([d, [cx, cy]]) => ({
    ds1: [special[d as 'se'] ? `act3/${dir}/${pre}${d}${special[d as 'se']}.ds1` : '', `act3/${dir}/${pre}${d}2.ds1`, `act3/${dir}/${pre}${d}.ds1`].filter(Boolean).join('|'),
    cx,
    cy,
  }));
  return { id, size: [size * 2, size * 2], parts, anchors: { prev: [size / 2, size / 2], next: [size * 1.5, size * 1.5] } };
}

const side = (kind: string): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  const K = kind;
  for (const d of ['N', 'S', 'E', 'W']) out[d] = [`kurast/border${K}${d.toLowerCase()}1`, `kurast/border${K}${d.toLowerCase()}2`];
  for (const d of ['NE', 'NW', 'SE', 'SW']) out[d] = [`kurast/border${K}${d.toLowerCase()}`];
  return out;
};

const jungle = (id: string, clearing: string): MapSpec =>
  maze(id, {
    act: 'act3',
    dir: 'jungle',
    prefix: 'riv',
    cell: [32, 32],
    rooms: 8,
    variants: ['', '2', '3'],
    specials: [
      { suffix: [''], pre: clearing, shapes: /^(.|EW|SW|SE|NW|NE|NS)$/, anchor: 'cave' },
      // lot 320: the second clearing holds the zone's other way down (Spider Forest: the Spider Cavern beside the Arachnid Lair; Flayer
      // Jungle: the Swampy Pit beside the Flayer Dungeon)
      { suffix: [''], pre: clearing, shapes: /^(.|EW|SW|SE|NW|NE|NS)$/, anchor: 'cave2' },
    ],
  });

const dung = (id: string, rooms: number): MapSpec =>
  maze(id, {
    act: 'act3',
    dir: 'jungle',
    prefix: 'dung',
    cell: [14, 14],
    rooms,
    variants: ['', '2', '3'],
    theme: 0.2,
    ends: { prev: { suffix: ['u1', 'u2', 'u3'], pre: 'dexit', shapes: /^.$/ }, next: { suffix: ['d1', 'd2', 'd3'], pre: 'dexit', shapes: /^.$/ } },
  });

const durance = (id: string, rooms: number): MapSpec =>
  maze(id, {
    act: 'act3',
    dir: 'travincal',
    prefix: 'meph',
    cell: [12, 12],
    rooms,
    variants: ['', '2'],
    theme: 0.2,
    ends: { prev: { suffix: ['warpu'], shapes: /^.$/ }, next: { suffix: ['warpd'], shapes: /^.$/ } },
    // lot 317: Diablo II's waypoint of the Durance is on level 2 (MephWarp: the waypoint room of lvlprest.txt), not on level 1
    specials: id === 'a3_durance2' ? [{ suffix: ['warp'], shapes: /^.$/, make: true }] : [],
  });

export const ACT3_SPECS: MapSpec[] = [
  { id: 'a3_town', ds1: 'act3/docktown/docktown3.ds1', town: true, anchors: { spider: [57, 30] } },
  // jungle : Spider Forest, Great Marsh, Flayer Jungle
  jungle('a3_spider', 'spid'),
  jungle('a3_marsh', 'bog'),
  jungle('a3_jungle', 'pyg'),
  // Kurast : Taudis (Lower), Banlieue (Bazaar), Métropole (Upper), Chaussée, Travincal
  outdoor('a3_lower', {
    act: 'act3',
    cells: 8,
    small: ['kurast/slums08x08_0', 'kurast/slums08x08_1', 'kurast/slums08x08_2'],
    big: ['kurast/slums16x16_0', 'kurast/slums16x16_1', 'kurast/slums16x16_2'],
    sideEdge: side('slums'),
    // lot 320: Diablo II's gate north into the Kurast Bazaar (SlumsGateN)
    gates: [{ side: 'N', at: 5, ds1: 'kurast/slumsgaten' }],
    // lot 317: the waypoint room of Kurast (lvlprest.txt's only one, Burbs08x08_Waypoint), by the entry like the Bazaar's
    fixed: [{ ds1: 'kurast/burbs08x08_waypoint', anchor: 'waypoint', at: [1, 4] }],
  }),
  outdoor('a3_bazaar', {
    act: 'act3',
    cells: 8,
    small: ['kurast/burbs08x08_0', 'kurast/burbs08x08_1', 'kurast/burbs08x08_2'],
    big: ['kurast/burbs16x16_0', 'kurast/burbs16x16_1', 'kurast/burbs16x16_2'],
    sideEdge: side('burbs'),
    // lot 320: Diablo II's gates: south from Lower Kurast (BurbsGateS), north into Upper Kurast (BurbsGateN)
    gates: [
      { side: 'S', at: 3, ds1: 'kurast/burbsgates' },
      { side: 'N', at: 5, ds1: 'kurast/burbsgaten' },
    ],
    fixed: [
      { ds1: 'kurast/burbs08x08_waypoint', anchor: 'waypoint', at: [1, 4] },
      { ds1: 'kurast/burbssewer0', anchor: 'sewer', at: [6, 1] },
      { ds1: 'kurast/burbstemple2', anchor: 'temple', at: [5, 5], size: 16 },
    ],
  }),
  outdoor('a3_upper', {
    act: 'act3',
    cells: 8,
    small: ['kurast/metro08x08_0', 'kurast/metro08x08_1', 'kurast/metro08x08_2'],
    big: ['kurast/metro16x16_0', 'kurast/metro16x16_1', 'kurast/metro16x16_2'],
    sideEdge: side('metro'),
    // lot 320: Diablo II's gates: south from the Bazaar (MetroGateS), north onto the Kurast Causeway (MetroGateN, 17 × 17)
    gates: [
      { side: 'S', at: 3, ds1: 'kurast/metrogates' },
      { side: 'N', at: 5, ds1: 'kurast/metrogaten', cells: 2 },
    ],
    fixed: [
      // lot 317: Kurast's waypoint room (as in the Lower Kurast and the Bazaar)
      { ds1: 'kurast/burbs08x08_waypoint', anchor: 'waypoint', at: [1, 4] },
      { ds1: 'kurast/metrosewer0', anchor: 'sewer', at: [6, 1] },
      { ds1: 'kurast/metrotemple2', anchor: 'temple', at: [4, 5], size: 16 },
    ],
  }),
  { id: 'a3_causeway', ds1: 'act3/kurast/bridge.ds1' },
  {
    id: 'a3_travincal',
    size: [64, 64],
    parts: [
      { ds1: 'act3/travincal/travnw.ds1', cx: 0, cy: 0 },
      { ds1: 'act3/travincal/travsw.ds1', cx: 0, cy: 32 },
      { ds1: 'act3/travincal/travn.ds1', cx: 16, cy: 0 },
      { ds1: 'act3/travincal/travs.ds1', cx: 16, cy: 32 },
      { ds1: 'act3/travincal/travne.ds1', cx: 48, cy: 0 },
      { ds1: 'act3/travincal/travse.ds1', cx: 48, cy: 32 },
    ],
    anchors: { prev: [8, 40], next: [56, 8] },
  },
  // grottes des araignées, fosses, donjons des Flayers
  quad('a3_cave1', 'spider', 'lair', 16),
  quad('a3_cave2', 'spider', 'lair', 16, { ne: 'con', nw: 'mage' }),
  dung('a3_pit1', 4),
  dung('a3_pit2', 4),
  { id: 'a3_pit3', ds1: 'act3/jungle/dungrm1a.ds1' },
  dung('a3_flayer1', 4),
  dung('a3_flayer2', 4),
  { id: 'a3_flayer3', ds1: 'act3/jungle/dungrm1b.ds1' },
  // égouts et temples
  maze('a3_sewer1', {
    act: 'act3',
    dir: 'sewer',
    prefix: 'sewer',
    cell: [12, 12],
    rooms: 32,
    variants: ['', '2'],
    theme: 0.2,
    ends: { prev: { suffix: ['_warp'], shapes: /^(NE|NW|SE|SW)$/ }, next: { suffix: ['_warp'], shapes: /^(NE|NW|SE|SW)$/ } },
    specials: [
      { suffix: ['drain'], shapes: /^.$/ },
      { suffix: ['treas'], shapes: /^.$/, count: 2 },
    ],
  }),
  { id: 'a3_sewer2', ds1: 'act3/sewer/sewertreasure1.ds1' },
  { id: 'a3_temple1', ds1: 'act3/temple/temple0.ds1' },
  { id: 'a3_temple2', ds1: 'act3/temple/temple3.ds1' },
  { id: 'a3_temple3', ds1: 'act3/temple/temple5.ds1' },
  { id: 'a3_temple4', ds1: 'act3/temple/temple7.ds1' },
  { id: 'a3_temple5', ds1: 'act3/temple/temple9.ds1' },
  { id: 'a3_temple6', ds1: 'act3/temple/temple11.ds1' },
  durance('a3_durance1', 10),
  durance('a3_durance2', 12),
];
