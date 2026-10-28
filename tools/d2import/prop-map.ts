/**
 * Décor du jeu (src/data/props.ts) refait avec les tuiles de Diablo II. Première étape : les murs, assemblés
 * depuis les tuiles de mur d'un DT1 (orientation 2 = mur le long de l'axe x du jeu, orientation 1 = le long de y).
 * `tiles` = (indice principal, sous-indice) de chaque cellule consécutive (une cellule D2 = 2,5 unités).
 * Un identifiant `prop_<décor>.<zone>` ne vaut que pour cette zone ; sans lui, la planche commune.
 * Choix contrôlés sur `npx tsx tools/d2import/cli.ts floors <acte>:<dt1>:1,2` puis sur captures en jeu.
 */
export interface WallSpec {
  id: string;
  act: number;
  dt1: string;
  axis: 'x' | 'y';
  tiles: [number, number][];
  /** longueur gardée (unités du jeu), centrée : coupe verticale aux deux bouts */
  length: number;
  /** hauteur gardée au-dessus du sol (px) : murets intérieurs quand D2 n'a pas de mur bas */
  maxHeight?: number;
}

/** Les deux orientations d'un mur du jeu : `_a` le long de x, `_b` le long de y */
function wall(prop: string, zone: string | null, act: number, dt1: string, tiles: [number, number][], extra: Partial<WallSpec> = {}): WallSpec[] {
  const suffix = zone ? `.${zone}` : '';
  return [
    { id: `prop_${prop}_a${suffix}`, act, dt1, axis: 'x', tiles, length: 4, ...extra },
    { id: `prop_${prop}_b${suffix}`, act, dt1, axis: 'y', tiles, length: 4, ...extra },
  ];
}

const TOMB = 'Act2/Tomb/Tomb.dt1';
const BAAL = 'Expansion/baallair/walls.dt1';
const CHAOS = 'Act4/Diab/Walls.dt1';
const CRYPT = 'Act1/Crypt/Basewall.dt1';
const CATA = 'Act1/Catacomb/Basewalls.dt1';
const DURANCE = 'Act3/Kurast/Interior.dt1';
const LOW = 112;

export const WALLS: WallSpec[] = [
  // Harrogath : la ville est ceinte de falaises (rkwall.dt1) — le mur d'enceinte du jeu devient une paroi rocheuse
  ...wall(
    'stonewall',
    'harrogath',
    5,
    'Expansion/town/rkwall.dt1',
    [
      [0, 0],
      [0, 1],
    ],
    { length: 4, maxHeight: 118 },
  ),
  // Tombeaux de Tal Rasha (et bordures des cartes) : murs, murs fissurés, murets
  ...wall('tombwall', null, 2, TOMB, [
    [0, 0],
    [0, 1],
  ]),
  ...wall('tombwall_cracked', null, 2, TOMB, [
    [0, 2],
    [0, 3],
  ]),
  ...wall('tombwall_half', null, 2, TOMB, [
    [1, 0],
    [1, 0],
  ]),
  // Trône de Baal (planche commune des murs « throne_wall »)
  ...wall('throne_wall', null, 5, BAAL, [
    [0, 0],
    [0, 1],
  ]),
  ...wall('throne_wall_arch', null, 5, BAAL, [
    [1, 0],
    [1, 1],
  ]),
  ...wall(
    'throne_wall_half',
    null,
    5,
    BAAL,
    [
      [0, 2],
      [0, 3],
    ],
    { maxHeight: LOW },
  ),
  // Sanctuaire du Chaos
  ...wall('throne_wall', 'chaos', 4, CHAOS, [
    [30, 0],
    [30, 1],
  ]),
  ...wall('throne_wall_arch', 'chaos', 4, CHAOS, [
    [30, 2],
    [30, 3],
  ]),
  // Tour oubliée (Comtesse)
  ...wall('throne_wall', 'countess', 1, CRYPT, [
    [0, 0],
    [0, 0],
  ]),
  ...wall(
    'throne_wall_half',
    'countess',
    1,
    CRYPT,
    [
      [0, 0],
      [0, 0],
    ],
    { maxHeight: LOW },
  ),
  // Catacombes (Andariel)
  ...wall('throne_wall', 'andariel', 1, CATA, [
    [0, 0],
    [0, 0],
  ]),
  ...wall(
    'throne_wall_half',
    'andariel',
    1,
    CATA,
    [
      [0, 0],
      [0, 0],
    ],
    { maxHeight: LOW },
  ),
  // Durance de la haine (Méphisto)
  ...wall('throne_wall', 'mephisto', 3, DURANCE, [
    [24, 0],
    [24, 1],
  ]),
  ...wall(
    'throne_wall_half',
    'mephisto',
    3,
    DURANCE,
    [
      [24, 2],
      [24, 3],
    ],
    { maxHeight: LOW },
  ),
];

/** Décor isolé fait d'une seule tuile D2 (colonne, statue) : `variants` = (indice principal, sous-indice) des tuiles interchangeables */
export interface TileSpec {
  id: string;
  act: number;
  dt1: string;
  orientation: number;
  variants: [number, number][];
  /** tuile choisie parmi les variantes */
  pick?: number;
}

export const TILE_PROPS: TileSpec[] = [
  // colonnes libres des Tombeaux (orientation 12 : six modèles, sans indice distinct → la variante est l'ordre dans le fichier)
  { id: 'prop_tomb_column', act: 2, dt1: 'Act2/Tomb/Columns.dt1', orientation: 12, variants: [[0, 0]], pick: 3 },
  // arbres de l'Acte 1 (orientation 14 de treegroups.dt1) : grand, moyen, petit
  { id: 'prop_tree_dead_l', act: 1, dt1: 'Act1/Outdoors/treegroups.dt1', orientation: 14, variants: [[0, 2]] },
  { id: 'prop_tree_dead_m', act: 1, dt1: 'Act1/Outdoors/treegroups.dt1', orientation: 14, variants: [[0, 1]] },
  { id: 'prop_tree_dead_s', act: 1, dt1: 'Act1/Outdoors/treegroups.dt1', orientation: 14, variants: [[0, 5]] },
  // rochers de l'Acte 1 (objects.dt1, orientation 12, indice 5) : deux grosses roches sombres
  { id: 'prop_rock_a', act: 1, dt1: 'Act1/Outdoors/Objects.dt1', orientation: 12, variants: [[5, 0]] },
  { id: 'prop_rock_b', act: 1, dt1: 'Act1/Outdoors/Objects.dt1', orientation: 12, variants: [[5, 1]] },
  { id: 'prop_rock_c', act: 1, dt1: 'Act1/Outdoors/Objects.dt1', orientation: 12, variants: [[5, 1]] },
  // arbres enneigés d'Harrogath / de l'Acte V (siege/trees.dt1, orientation 14)
  { id: 'prop_tree_pine', act: 5, dt1: 'Expansion/siege/trees.dt1', orientation: 14, variants: [[10, 2]] },
  { id: 'prop_trees_small', act: 5, dt1: 'Expansion/siege/trees.dt1', orientation: 14, variants: [[10, 3]] },
  { id: 'prop_tomb_pillar', act: 2, dt1: 'Act2/Tomb/Columns.dt1', orientation: 12, variants: [[0, 0]], pick: 0 },
];
