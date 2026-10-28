/**
 * Correspondance entre les sols du jeu (`ground_<type>`, src/data/zone-types.ts) et les tuiles de sol de Diablo II.
 * `pick` = groupes (indice principal, sous-indice) du DT1 : les tuiles d'un même groupe sont des variantes
 * interchangeables (D2 en tire une au hasard). Un identifiant `ground_<type>.<zone>` ne vaut que pour cette zone
 * (le Sanctuaire du Chaos et le Trône de Baal n'ont pas la même « pierre d'enfer ») ; sans lui, le sol générique.
 * Choix contrôlés sur `npx tsx tools/d2import/cli.ts floors <acte>:<dt1>` puis sur captures en jeu.
 */
export interface GroundSpec {
  id: string;
  act: number;
  dt1: string;
  pick: [number, number][];
  /** éclaircissement (1 = pixels d'origine) : les sols de D2 sont faits pour un écran sombre */
  gain?: number;
}

export const GROUNDS: GroundSpec[] = [
  // sols génériques (cartes de fin de jeu, zones sans sol propre)
  { id: 'ground_grass', act: 1, dt1: 'Act1/Town/Floor.dt1', pick: [[0, 0]] },
  { id: 'ground_dirt', act: 1, dt1: 'Act1/Town/Floor.dt1', pick: [[0, 1]] },
  { id: 'ground_deadgrass', act: 1, dt1: 'Act1/Town/Floor.dt1', pick: [[5, 0]] },
  { id: 'ground_mud', act: 3, dt1: 'Act3/Ground/DarkMud.dt1', pick: [[0, 0]] },
  { id: 'ground_cobble', act: 1, dt1: 'Act1/Court/Floor.dt1', pick: [[1, 0]] },
  { id: 'ground_flagstone', act: 1, dt1: 'Act1/Barracks/floor.dt1', pick: [[0, 0]] },
  { id: 'ground_sand', act: 2, dt1: 'Act2/Town/Ground.dt1', pick: [[0, 0]] },
  { id: 'ground_sandstone', act: 2, dt1: 'Act2/Tomb/Tomb.dt1', pick: [[0, 0]] },
  { id: 'ground_crypt', act: 1, dt1: 'Act1/Crypt/Floor.dt1', pick: [[0, 0]] },
  { id: 'ground_snow', act: 5, dt1: 'Expansion/siege/snow.dt1', pick: [[6, 0]] },
  {
    id: 'ground_lava',
    act: 4,
    dt1: 'Act4/Lava/Floor.dt1',
    pick: [
      [20, 1],
      [20, 3],
      [20, 5],
      [20, 7],
    ],
  },
  { id: 'ground_hellstone', act: 4, dt1: 'Act4/Diab/Floor.dt1', pick: [[40, 0]] },

  // Harrogath
  { id: 'ground_snow.harrogath', act: 5, dt1: 'Expansion/town/ground.dt1', pick: [[0, 0]] },
  // Tristram : terre battue (la terre brûlée (4,0) est presque noire)
  { id: 'ground_dirt.tristram', act: 1, dt1: 'Act1/Tristram/town.dt1', pick: [[1, 0]] },
  // Tombeaux de Tal Rasha
  { id: 'ground_crypt.tombs', act: 2, dt1: 'Act2/Tomb/Tomb.dt1', pick: [[1, 0]] },
  // Trône de Baal
  { id: 'ground_hellstone.baal', act: 5, dt1: 'Expansion/baallair/floor.dt1', pick: [[0, 0]] },
  {
    id: 'ground_flagstone.baal',
    act: 5,
    dt1: 'Expansion/baallair/floor.dt1',
    pick: [
      [3, 10],
      [3, 11],
      [3, 12],
    ],
  },
  // Tour oubliée (Comtesse), Catacombes (Andariel), Durance de la haine (Méphisto)
  { id: 'ground_flagstone.countess', act: 1, dt1: 'Act1/Crypt/Floor.dt1', pick: [[0, 0]] },
  { id: 'ground_crypt.andariel', act: 1, dt1: 'Act1/Catacomb/floor.dt1', pick: [[0, 0]] },
  { id: 'ground_hellstone.mephisto', act: 3, dt1: 'Act3/Kurast/Floors.dt1', pick: [[21, 0]] },
  {
    id: 'ground_flagstone.mephisto',
    act: 3,
    dt1: 'Act3/Kurast/Floors.dt1',
    pick: [
      [20, 0],
      [20, 1],
      [20, 2],
    ],
  },
];
