/**
 * Cartes de l'Acte II (Levels.txt / LvlPrest.txt) : Lut Gholein, le désert (pièces de remplissage 8 × 8 et 16 × 16, entrées de donjons posées), égouts, harem et caves du palais,
 * tombeaux (Stony Tomb, Halls of the Dead, Claw Viper Temple), repaire des vers, tunnels antiques et Sanctuaire des arcanes. Mêmes principes que act1-maps.ts.
 */
import type { MapSpec } from './map-build';
import { maze, outdoor } from './act1-maps';

const SMALL_DESERT = [
  'desert1',
  'desert2',
  'desert3',
  'desert6',
  'desert7',
  'desert8',
  'burm1',
  'burm2',
  'burm3',
  'burm5',
  'burm6',
  'burm7',
  'bone1',
  'bone2',
  'head1',
  'head2',
  'wagon2',
  'mesarm',
  'ruin4',
  'ruin5',
  'ruin6',
];
const EDGE2 = Array.from({ length: 12 }, (_, i) => `edge${i + 1}`);
const BIG_DESERT = ['ruin1', 'oasis5', 'oasis6', 'oasis9', 'oasis10'];

/** Quatre pièces 16 × 16 (SE, SW, NE, NW) : harem corrompu (Sub) et caves du palais (Cel) ; `wp` : pièce de point de passage */
function quad(id: string, pre: 'sub' | 'cel', wp?: 'se' | 'sw' | 'ne' | 'nw'): MapSpec {
  const at: Record<string, [number, number]> = { se: [0, 0], sw: [16, 0], ne: [0, 16], nw: [16, 16] };
  const parts = Object.entries(at).map(([d, [cx, cy]]) => ({
    ds1: [wp === d ? `act2/palace/${pre}${d}waypoint.ds1` : '', `act2/palace/${pre}${d}2.ds1`, `act2/palace/${pre}${d}.ds1`].filter(Boolean).join('|'),
    cx,
    cy,
  }));
  return { id, size: [32, 32], parts, anchors: { prev: [8, 8], next: [24, 24] } };
}

const tomb = (id: string, rooms: number, specials: Parameters<typeof maze>[1]['specials'] = []): MapSpec =>
  maze(id, {
    act: 'act2',
    dir: 'tomb',
    prefix: 'tomb',
    cell: [16, 16],
    rooms,
    variants: ['', '2', '3'],
    theme: 0.25,
    ends: { prev: { suffix: ['warpprev', 'warpprev2'], shapes: /^...$/ }, next: { suffix: ['warpnext', 'warpnext2'], shapes: /^.$/ } },
    specials,
  });

const sewer = (id: string, rooms: number, specials: Parameters<typeof maze>[1]['specials'] = []): MapSpec =>
  maze(id, {
    act: 'act2',
    dir: 'sewer',
    prefix: 'sew',
    cell: [12, 12],
    rooms,
    variants: ['', '2'],
    theme: 0.25,
    ends: { prev: { suffix: ['up', 'dock', 'dock2'], shapes: /^(.|NS)$/ }, next: { suffix: ['down'], shapes: /^.$/ } },
    specials,
  });

const lair = (id: string, rooms: number, specials: Parameters<typeof maze>[1]['specials'] = []): MapSpec =>
  maze(id, {
    act: 'act2',
    dir: 'maggot',
    prefix: 'mag',
    cell: [10, 10],
    rooms,
    variants: ['', '4', '5', '6'],
    ends: { prev: { suffix: ['warpprev'], shapes: /^.$/ }, next: { suffix: ['warpnext'], shapes: /^.$/ } },
    specials,
  });

export const ACT2_SPECS: MapSpec[] = [
  // Lut Gholein : entrées des égouts (escaliers du port), du harem (palais) et sortie vers le désert (ouest), en cases de 5 sous-cases
  { id: 'a2_town', ds1: 'act2/town/lutw.ds1', town: true, anchors: { sewer: [44, 36], harem: [30, 9], rocky: [4, 28] } },
  // désert
  outdoor('a2_rocky', {
    act: 'act2',
    edge: EDGE2,
    small: SMALL_DESERT,
    big: BIG_DESERT,
    fixed: [
      // lot 317: Diablo II's Rocky Waste has no waypoint: a plain piece of the desert where its waypoint room stood (same draw; an Act II DS1: the first piece gives the map its act, its palette)
      { ds1: 'burm1', at: [1, 4] },
      { ds1: 'tombent1', anchor: 'stony', at: [8, 3] },
    ],
  }),
  outdoor('a2_dryhills', {
    act: 'act2',
    edge: EDGE2,
    small: SMALL_DESERT,
    big: BIG_DESERT,
    fixed: [
      { ds1: 'waypoint', anchor: 'waypoint', at: [1, 6] },
      { ds1: 'tombent2', anchor: 'halls', at: [8, 8] },
    ],
  }),
  outdoor('a2_oasis', {
    act: 'act2',
    edge: EDGE2,
    small: ['oasis1', 'oasis2', 'oasis3', ...SMALL_DESERT.slice(0, 8)],
    big: ['oasis5', 'oasis6', 'oasis9', 'oasis10', 'oasis11'],
    fixed: [
      { ds1: 'waypoint', anchor: 'waypoint', at: [1, 4] },
      { ds1: 'maggot/hole1', anchor: 'lair', at: [8, 1] },
    ],
  }),
  outdoor('a2_lostcity', {
    act: 'act2',
    edge: EDGE2,
    small: ['ruin4', 'ruin5', 'ruin6', 'ruin/ruin1', 'ruin/ruin7', ...SMALL_DESERT.slice(0, 8)],
    big: ['ruin1', 'ruin2', 'ruin3'],
    fixed: [
      { ds1: 'waypoint', anchor: 'waypoint', at: [1, 5] },
      { ds1: 'ruinsewr', anchor: 'tunnels', at: [8, 7] },
      { ds1: 'ruindarkelder', anchor: 'elder', at: [4, 3], size: 16 },
    ],
  }),
  outdoor('a2_valley', { act: 'act2', cells: 6, edge: EDGE2, small: SMALL_DESERT, big: BIG_DESERT, fixed: [{ ds1: 'viper1', anchor: 'viper', at: [3, 1], size: 16 }] }),
  outdoor('a2_canyon', {
    act: 'act2',
    edge: EDGE2,
    small: SMALL_DESERT,
    big: BIG_DESERT,
    fixed: [
      { ds1: 'waypoint', anchor: 'waypoint', at: [1, 5] },
      { ds1: 'tombent3', anchor: 'tombs', at: [8, 2] },
    ],
  }),
  // égouts, harem, palais
  sewer('a2_sewer1', 6),
  sewer('a2_sewer2', 12, [
    { suffix: ['waypoint'], shapes: /^.$/ },
    { suffix: ['con'], shapes: /^.$/ },
  ]),
  sewer('a2_sewer3', 14, [
    { suffix: ['rad'], shapes: /^.$/, anchor: 'next' },
    { suffix: ['con'], shapes: /^.$/ },
  ]),
  { id: 'a2_harem1', ds1: 'act2/palace/harem2.ds1' },
  quad('a2_harem2', 'sub'),
  quad('a2_cellar1', 'cel', 'ne'),
  quad('a2_cellar2', 'cel'),
  quad('a2_cellar3', 'cel'),
  // lot 317: the centre of the Arcane (SanctNSEW4: its waypoint, where the hero arrives), then the Summoner's room. Only the rooms' first
  // drawing: their numbered variants are broken walkways (SanctNS2 ends half-way, SanctNEW1 has no east path…: measured on their
  // collision), which cut the maze into islands, the map keeping the largest (2 % walkable before, the centre out of reach)
  maze('a2_arcane', {
    act: 'act2',
    dir: 'arcane',
    prefix: 'sanct',
    cell: [12, 12],
    rooms: 40,
    variants: [''],
    specials: [
      { suffix: ['4'], shapes: /^NSEW$/, make: true, anchor: 'prev' },
      { suffix: [''], pre: 'summ', shapes: /^.$/, anchor: 'next' },
    ],
  }),
  // tombeaux
  tomb('a2_stony1', 4),
  tomb('a2_stony2', 4, [{ suffix: ['leatherarm'], shapes: /^.$/ }]),
  tomb('a2_halls1', 6, [{ suffix: ['treasure'], shapes: /^.$/ }]),
  tomb('a2_halls2', 6, [
    { suffix: ['waypoint'], shapes: /^.$/, make: true },
    { suffix: ['kaa'], shapes: /^.$/ },
  ]),
  tomb('a2_halls3', 6, [{ suffix: [''], pre: 'tombcube', shapes: /^.$/ }]),
  // (no waypoint in Diablo II's Claw Viper Temple: its waypoint room, never placed in this maze, dropped in lot 317 — same map)
  tomb('a2_viper1', 12, [{ suffix: ['consol'], shapes: /^.$/ }]),
  tomb('a2_viper2', 6, [{ suffix: ['treasure'], shapes: /^.$/ }]),
  // repaire des vers, tunnels antiques (pièces d'égout)
  lair('a2_maggot1', 14),
  lair('a2_maggot2', 12),
  lair('a2_maggot3', 10, [{ suffix: [''], name: 'magqueen', shapes: /^.$/, anchor: 'next' }]),
  sewer('a2_tunnels', 10),
];
