/**
 * Liste des cartes DS1 exportées (identifiant, DS1 ou pièces assemblées, ancrages). Données pures : lues aussi par le Worker du navigateur
 * (catalogue des cartes générables, `browser.ts`).
 */
import { ACT1_SPECS } from './act1-maps';
import { ACT2_SPECS } from './act2-maps';
import { ACT3_SPECS } from './act3-maps';
import { ACT5_SPECS } from './act5-maps';
import type { MapSpec } from './map-build';

/** Salles des Tombeaux : colonne, ligne, fichier (variantes 2 et 3 choisies de façon déterministe) */
const TOMB_LAYOUT: [number, number, string][] = (
  [
    [0, 0, 'tombse'],
    [1, 0, 'tombew'],
    [2, 0, 'tombsew'],
    [3, 0, 'tombw'],
    [0, 1, 'tombnse'],
    [1, 1, 'tombsew'],
    [2, 1, 'tombnsew'],
    [3, 1, 'talrasha'],
    [0, 2, 'tombne'],
    [1, 2, 'tombnw'],
    [2, 2, 'tombne'],
    [3, 2, 'tombw'],
  ] as [number, number, string][]
).map(([i, j, n]) => [i, j, n === 'talrasha' ? n : `${n}${['', '2', '3'][(i * 3 + j * 2) % 3]}`]);

/** Niveau des Vaches : ferme de l'Acte 1 faite de pièces de 9 × 9 cases (8 de pas) : vergers clôturés, chaumières, enclos, rochers, prairies */
const COW_LAYOUT: string[][] = [
  ['wild5', '6rock', 'wild5', 'xrock', 'wild5', '6rock'],
  ['4rock', 'cott2', 'clover', 'circle', 'cott5', 'wild5'],
  ['wild5', 'clover', 'corral1', 'corral2', 'circle', 'xrock'],
  ['xrock', 'circle', 'funktree', 'camp', 'clover', 'wild5'],
  ['wild5', 'cott6', 'clover', 'puddle1', 'cott1', '4rock'],
  ['6rock', 'wild5', 'xrock', 'wild5', '6rock', 'wild5'],
];

/**
 * Zone de plein air de l'Acte IV : neuf salles Mesa 24 × 24 au centre et, autour, un anneau de pièces de bordure 8 × 8 (Border1-12, falaises sur le côté du vide).
 * Chaque pièce n'a qu'un dessin : on la place là où son vide fait face à l'extérieur (côté du vide mesuré sur l'image : x, y en cases, + = est / sud).
 */
const BORDERS: Record<string, number[]> = {
  N: [3],
  S: [1],
  W: [2],
  E: [4],
  NW: [6, 10],
  NE: [11, 7],
  SE: [8],
  SW: [5, 9],
};

/**
 * Lot 320: the ways between Act IV's outdoor levels: a border cell left as the mesa's own ground (its 8 × 8 piece in place of the cliff:
 * the next level begins beyond it, walked into), and `FortMesa` (9 × 25 cases), the mesa under the Pandemonium Fortress whose ramp meets
 * the fortress's gate (west). Keyed by the border cell "row,column" of the 11 × 11 ring. (Diablo II's opened cliffs `Border<1-4>o` leave a
 * winding gap two to four units wide: two of them facing across a seam leave less than a unit to walk through.)
 */
type MesaGaps = Record<string, string>;
const CITY_GAPS: MesaGaps = { '0,3': 'chaos08x08_2' };

function mesaZone(id: string, prefix: string, picks: number[], gaps: MesaGaps = {}): MapSpec {
  const parts: { ds1: string; cx: number; cy: number }[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) parts.push({ ds1: `act4/mesa/${prefix}24x24_${picks[r * 3 + c]}.ds1`, cx: 8 + c * 24, cy: 8 + r * 24 });
  const N = 11;
  // FortMesa covers three border cells of the west side; each gap's place on the edge (`gateN`…: the seam joins the level there)
  const skip = new Set<string>();
  const anchors: Record<string, [number, number]> = {};
  for (const [k, v] of Object.entries(gaps)) {
    const [r, c] = k.split(',').map(Number);
    // FortMesa's ramp meets the Fortress's gate 17.4 cases down its west side (the gate's opening, 42.5-44.5 units)
    const h = v === 'fortmesa' ? 34.8 : 9;
    if (v === 'fortmesa') skip.add(`${r + 1},${c}`).add(`${r + 2},${c}`);
    const side = r === 0 ? 'N' : r === N - 1 ? 'S' : c === 0 ? 'W' : 'E';
    anchors[`gate${side}`] = side === 'N' || side === 'S' ? [c * 8 + 4.5, side === 'N' ? 1 : N * 8 - 1] : [side === 'W' ? 1 : N * 8 - 1, r * 8 + h / 2];
  }
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (r > 0 && r < N - 1 && c > 0 && c < N - 1) continue;
      if (skip.has(`${r},${c}`)) continue;
      const gap = gaps[`${r},${c}`];
      if (gap) {
        parts.push({ ds1: `act4/mesa/${gap}.ds1`, cx: c * 8, cy: r * 8 });
        continue;
      }
      const side = `${r === 0 ? 'N' : r === N - 1 ? 'S' : ''}${c === 0 ? 'W' : c === N - 1 ? 'E' : ''}`;
      const list = BORDERS[side];
      const n = list[(r * 7 + c * 3) % list.length];
      // les pièces 1 et 4 ont une variante « a » presque pleine : b ou c pour un vrai bord
      const v = n === 1 || n === 4 ? 'bc'[(r + c) % 2] : 'abc'[(r * 5 + c) % 3];
      parts.push({ ds1: `act4/mesa/border${n}${v}.ds1`, cx: c * 8, cy: r * 8 });
    }
  }
  return { id, size: [88, 88], parts, ...(Object.keys(anchors).length ? { anchors } : {}) };
}

export const MAPS: MapSpec[] = [
  ...ACT1_SPECS,
  ...ACT2_SPECS,
  ...ACT3_SPECS,
  ...ACT5_SPECS,
  { id: 'harrogath', ds1: 'expansion/town/townwest.ds1', town: true },
  { id: 'tristram', ds1: 'act1/tristram/tri_town4.ds1' },
  // salles de boss des runs de farm : Tour oubliée (Comtesse), Catacombes (Andariel), complexe de Méphisto
  // Sanctuaire du Chaos : cœur au centre, quatre bras (N, E, S, O) et l'entrée au sud ; les pièces se recouvrent d'une case
  {
    id: 'chaos',
    lava: true,
    size: [73, 97],
    parts: [
      { ds1: 'act4/diab/heart.ds1', cx: 24, cy: 24 },
      { ds1: 'act4/diab/wingn1.ds1', cx: 24, cy: 0 },
      { ds1: 'act4/diab/winge1.ds1', cx: 48, cy: 24 },
      { ds1: 'act4/diab/wings1.ds1', cx: 24, cy: 48 },
      { ds1: 'act4/diab/wingw1.ds1', cx: 0, cy: 24 },
      { ds1: 'act4/diab/entry1.ds1', cx: 24, cy: 72 },
    ],
  },
  // lot 320: the Campaign's Chaos Sanctuary, the same map whose entry walk reaches its south edge (the last case row, a rim of lava, cut off):
  // the River of Flame's bridge comes in there, walked from one zone into the other as in Diablo II. The Rush's Chaos Sanctuary keeps `chaos`
  {
    id: 'a4_chaos',
    lava: true,
    size: [73, 96],
    parts: [
      { ds1: 'act4/diab/heart.ds1', cx: 24, cy: 24 },
      { ds1: 'act4/diab/wingn1.ds1', cx: 24, cy: 0 },
      { ds1: 'act4/diab/winge1.ds1', cx: 48, cy: 24 },
      { ds1: 'act4/diab/wings1.ds1', cx: 24, cy: 48 },
      { ds1: 'act4/diab/wingw1.ds1', cx: 0, cy: 24 },
      { ds1: 'act4/diab/entry1.ds1', cx: 24, cy: 72 },
    ],
  },
  // Trône de Baal : couloirs de lave menant à la salle du trône
  // Fleuve de flammes (Levels 107 : labyrinthe de 6 salles de 24 × 24 cases ; chaque dessin Lava<NSEW> annonce ses ouvertures : E = +x, S = +y) — chemin en serpent,
  // dernière salle sans issue (Héphasto)
  {
    id: 'river',
    lava: true,
    size: [72, 72],
    parts: [
      { ds1: 'act4/lava/lavae.ds1', cx: 0, cy: 0 },
      { ds1: 'act4/lava/lavaew.ds1', cx: 24, cy: 0 },
      { ds1: 'act4/lava/lavasw.ds1', cx: 48, cy: 0 },
      { ds1: 'act4/lava/lavanw.ds1', cx: 48, cy: 24 },
      { ds1: 'act4/lava/lavaew.ds1', cx: 24, cy: 24 },
      { ds1: 'act4/lava/forgee.ds1', cx: 0, cy: 24 },
    ],
  },
  // lot 320: Act IV walked as in Diablo II: the Fortress's gate (west of the Outer Steppes, on its FortMesa), the Steppes' south into the
  // Plains of Despair's north, the Plains' south into the City of the Damned's north
  mesaZone('a4_steppes', 'outer', [0, 1, 2, 3, 4, 1, 3, 0, 2], { '4,0': 'fortmesa', '10,7': 'outer08x08_0' }),
  mesaZone('a4_plains', 'mid', [1, 0, 3, 2, 4, 2, 0, 4, 1], { '0,3': 'mid08x08_0', '10,7': 'mid08x08_0' }),
  // lot 317: the City of the Damned's way down to the River of Flame (Act4/Mesa/WarpLava: the warp and Diablo II's waypoint beside it), laid
  // over the far corner of the SE mesa room, where the zone's way on is (anchors: arrival in the NW room, way on at the warp)
  {
    ...mesaZone('a4_city', 'chaos', [2, 0, 1, 3, 1, 2, 3, 0, 2], CITY_GAPS),
    ...((z) => ({ parts: [...z.parts!, { ds1: 'act4/mesa/warplava.ds1', cx: 68, cy: 68, over: true }] }))(mesaZone('a4_city', 'chaos', [2, 0, 1, 3, 1, 2, 3, 0, 2], CITY_GAPS)),
    anchors: { ...mesaZone('a4_city', 'chaos', [2, 0, 1, 3, 1, 2, 3, 0, 2], CITY_GAPS).anchors, prev: [20, 20], next: [72, 72] },
  },
  { id: 'a4_fortress', ds1: 'act4/fort/fortress.ds1' },
  // lot 317: the River's bridge to the Chaos Sanctuary (Act4/Diab/BridgeLava: Diablo II's waypoint of the River stands on it); `chaos`: the
  // way on at the bridge's far end. Lot 320: the bridge leads north (the map's north edge), where the Chaos Sanctuary's entry walk comes
  // down from its south (Diablo II: the Chaos Sanctuary lies beyond the bridge). The arrival (`prev`) in the south-east room, a dead end (LavaN);
  // the bridge's room above it, the forge's branch to the west (Hephasto at the walk's far end). (Lava rooms in
  // the map's lower-left cells come out unwalkable from the importer's lava test: none there; Diablo II's WarpMesa room of the way up to
  // the City has no ground the lava map lets one walk, the way back is a portal.)
  {
    id: 'a4_river',
    size: [72, 72],
    parts: [
      { ds1: 'act4/diab/bridgelava.ds1', cx: 48, cy: 0 },
      { ds1: 'act4/lava/forgee.ds1', cx: 0, cy: 24 },
      { ds1: 'act4/lava/lavaew.ds1', cx: 24, cy: 24 },
      { ds1: 'act4/lava/lavansw.ds1', cx: 48, cy: 24 },
      { ds1: 'act4/lava/lavan.ds1', cx: 48, cy: 48 },
    ],
    anchors: { chaos: [60, 2], prev: [60, 60] },
    lava: true,
  },
  { id: 'baal', ds1: 'expansion/baallair/wthrone.ds1' },
  // Chambre de la Pierre-Monde : où Baal attend après les cinq vagues du Trône
  { id: 'baal_chamber', ds1: 'expansion/baallair/wstone01.ds1' },
  { id: 'countess', ds1: 'act1/crypt/cryptcountess1.ds1' },
  { id: 'andariel', ds1: 'act1/catacomb/andy3.ds1' },
  { id: 'mephisto', ds1: 'act3/travincal/mephcomp.ds1' },
  { id: 'cows', size: [49, 49], parts: COW_LAYOUT.flatMap((row, r) => row.map((n, c) => ({ ds1: `act1/outdoors/${n}.ds1`, cx: c * 8, cy: r * 8 }))) },
  // zones de farm de l'Acte V et Tristram pandémoniaque (cartes d'origine)
  { id: 'pindleskin', ds1: 'expansion/wildtemple/tempenter.ds1' },
  { id: 'eldritch', ds1: 'expansion/siege/siege_32x32sboss.ds1' },
  { id: 'nihlathak', ds1: 'expansion/wildtemple/temple01.ds1' },
  { id: 'ancients', ds1: 'expansion/mountaintop/mtntop.ds1' },
  { id: 'uber_duriel', ds1: 'act2/tomb/duriel.ds1' },
  // repaire de Duriel des Tombeaux de Tal Rasha (même salle que celle de l'Uber Duriel)
  { id: 'duriel_lair', ds1: 'act2/tomb/duriel.ds1' },
  { id: 'uber_lilith', ds1: 'act1/cathedrl/cathy3.ds1' },
  { id: 'uber_izual', ds1: 'act4/lava/forgee.ds1', lava: true },
  { id: 'uber_tristram', ds1: 'act1/tristram/tri_town4.ds1' },
  // Tombeaux de Tal Rasha : 4 × 3 salles de 16 cases (17 avec le recouvrement), choisies d'après leurs sorties (N = bord y = 0, E = bord x max, S = bord y max,
  // W = bord x = 0 ; nom du fichier = sorties dans l'ordre N E S W), et la chambre de Tal Rasha au bout
  {
    id: 'tombs',
    size: [65, 49],
    parts: TOMB_LAYOUT.map(([i, j, name]) => ({ ds1: `act2/tomb/${name}.ds1`, cx: i * 16, cy: j * 16 })),
  },
];
