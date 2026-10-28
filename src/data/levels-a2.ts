// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/** Zones de l'Acte II d'après Levels.txt (patch 1.13) : monstres [Normal, Cauchemar, Enfer], densité, niveaux, uniques. Généré par tools/audit/gen-levels-a2.ts. Niveaux Project Diablo 2 : patch du mod (mods/pd2/data/levels.patch.ts). */
export interface A2Level {
  name: string;
  den: number;
  lvl: [number, number, number];
  unique: [[number, number], [number, number], [number, number]];
  mons: [[string, number][], [string, number][], [string, number][]];
}

export const A2_LEVELS: Record<string, A2Level> = {
  a2_rocky: {
    name: 'Rocky Waste',
    den: 880,
    lvl: [14, 43, 75],
    unique: [
      [1, 2],
      [4, 6],
      [7, 9],
    ],
    mons: [
      [
        ['sand_leaper', 1],
        ['panther_woman', 1],
        ['scarab', 1],
        ['vulture', 1],
        ['slinger', 1],
      ],
      [
        ['sand_leaper', 1],
        ['panther_woman', 1],
        ['scarab', 1],
        ['vulture', 1],
        ['slinger', 1],
      ],
      [
        ['sand_leaper', 1],
        ['panther_woman', 1],
        ['scarab', 1],
        ['vulture', 1],
        ['slinger', 1],
      ],
    ],
  },
  a2_dryhills: {
    name: 'Dry Hills',
    den: 880,
    lvl: [15, 44, 76],
    unique: [
      [1, 2],
      [4, 6],
      [7, 9],
    ],
    mons: [
      [
        ['sand_leaper', 1],
        ['panther_woman', 1],
        ['vulture', 1],
        ['slinger', 1],
      ],
      [
        ['sand_leaper', 1],
        ['panther_woman', 1],
        ['vulture', 1],
        ['slinger', 1],
      ],
      [
        ['sand_leaper', 1],
        ['panther_woman', 1],
        ['vulture', 1],
        ['slinger', 1],
      ],
    ],
  },
  a2_oasis: {
    name: 'Far Oasis',
    den: 880,
    lvl: [16, 45, 76],
    unique: [
      [1, 2],
      [4, 6],
      [7, 9],
    ],
    mons: [
      [
        ['foul_crow', 1],
        ['sand_maggot', 1],
        ['locust', 1],
        ['scarab', 1],
        ['vulture', 1],
      ],
      [
        ['foul_crow', 1],
        ['sand_maggot', 1],
        ['locust', 1],
        ['scarab', 1],
        ['vulture', 1],
      ],
      [
        ['foul_crow', 1],
        ['sand_maggot', 1],
        ['locust', 1],
        ['scarab', 1],
        ['vulture', 1],
      ],
    ],
  },
  a2_lostcity: {
    name: 'Lost City',
    den: 880,
    lvl: [17, 46, 77],
    unique: [
      [1, 2],
      [4, 6],
      [7, 9],
    ],
    mons: [
      [
        ['zombie', 1],
        ['sand_raider', 1],
        ['sand_leaper', 1],
        ['panther_woman', 1],
        ['slinger', 1],
      ],
      [
        ['zombie', 1],
        ['sand_raider', 1],
        ['sand_leaper', 1],
        ['panther_woman', 1],
        ['slinger', 1],
      ],
      [
        ['zombie', 1],
        ['sand_raider', 1],
        ['sand_leaper', 1],
        ['panther_woman', 1],
        ['slinger', 1],
      ],
    ],
  },
  a2_valley: {
    name: 'Valley of Snakes',
    den: 880,
    lvl: [18, 46, 77],
    unique: [
      [1, 2],
      [4, 6],
      [7, 9],
    ],
    mons: [
      [
        ['claw_viper', 4],
        ['mummy', 1],
        ['unraveler', 1],
      ],
      [
        ['claw_viper', 4],
        ['mummy', 1],
        ['unraveler', 1],
      ],
      [
        ['claw_viper', 4],
        ['mummy', 1],
        ['unraveler', 1],
      ],
    ],
  },
  a2_canyon: {
    name: 'Canyon of the Magi',
    den: 880,
    lvl: [16, 48, 79],
    unique: [
      [0, 0],
      [3, 4],
      [7, 9],
    ],
    mons: [
      [
        ['brute', 1],
        ['sand_maggot', 1],
        ['panther_woman', 1],
        ['scarab', 1],
        ['slinger', 1],
      ],
      [
        ['brute', 1],
        ['sand_maggot', 1],
        ['panther_woman', 1],
        ['scarab', 1],
        ['slinger', 1],
      ],
      [
        ['brute', 1],
        ['sand_maggot', 1],
        ['panther_woman', 1],
        ['scarab', 1],
        ['slinger', 1],
      ],
    ],
  },
  a2_sewer1: {
    name: 'Sewers Level 1',
    den: 680,
    lvl: [13, 43, 74],
    unique: [
      [0, 1],
      [3, 4],
      [6, 8],
    ],
    mons: [
      [
        ['burning_dead', 1],
        ['sand_raider', 1],
        ['mummy', 1],
        ['skeleton_archer', 1],
      ],
      [
        ['burning_dead', 1],
        ['sand_raider', 1],
        ['mummy', 1],
        ['skeleton_archer', 1],
      ],
      [
        ['burning_dead', 1],
        ['sand_raider', 1],
        ['mummy', 1],
        ['skeleton_archer', 1],
      ],
    ],
  },
  a2_sewer2: {
    name: 'Sewers Level 2',
    den: 680,
    lvl: [13, 43, 74],
    unique: [
      [0, 1],
      [3, 4],
      [6, 8],
    ],
    mons: [
      [
        ['burning_dead', 1],
        ['sand_raider', 1],
        ['mummy', 1],
        ['skeleton_archer', 1],
      ],
      [
        ['burning_dead', 1],
        ['sand_raider', 1],
        ['mummy', 1],
        ['skeleton_archer', 1],
      ],
      [
        ['burning_dead', 1],
        ['sand_raider', 1],
        ['mummy', 1],
        ['skeleton_archer', 1],
      ],
    ],
  },
  a2_sewer3: {
    name: 'Sewers Level 3',
    den: 680,
    lvl: [14, 44, 75],
    unique: [
      [0, 1],
      [3, 4],
      [6, 8],
    ],
    mons: [
      [
        ['burning_dead', 1],
        ['panther_woman', 1],
        ['mummy', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['burning_dead', 1],
        ['panther_woman', 1],
        ['mummy', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['burning_dead', 1],
        ['panther_woman', 1],
        ['mummy', 1],
        ['skeleton_mage', 1],
      ],
    ],
  },
  a2_harem2: {
    name: 'Harem Level 2',
    den: 2200,
    lvl: [13, 47, 78],
    unique: [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    mons: [
      [
        ['sand_raider', 1],
        ['baboon', 1],
        ['skeleton_archer', 1],
        ['blunderbore', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['sand_raider', 1],
        ['baboon', 1],
        ['skeleton_archer', 1],
        ['blunderbore', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['sand_raider', 1],
        ['baboon', 1],
        ['skeleton_archer', 1],
        ['blunderbore', 1],
        ['skeleton_mage', 1],
      ],
    ],
  },
  a2_cellar1: {
    name: 'Palace Cellar Level 1 ',
    den: 2200,
    lvl: [13, 47, 78],
    unique: [
      [0, 1],
      [3, 4],
      [5, 7],
    ],
    mons: [
      [
        ['sand_raider', 1],
        ['baboon', 1],
        ['skeleton_archer', 1],
        ['blunderbore', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['sand_raider', 1],
        ['baboon', 1],
        ['skeleton_archer', 1],
        ['blunderbore', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['sand_raider', 1],
        ['baboon', 1],
        ['skeleton_archer', 1],
        ['blunderbore', 1],
        ['skeleton_mage', 1],
      ],
    ],
  },
  a2_cellar2: {
    name: 'Palace Cellar Level 2',
    den: 2200,
    lvl: [13, 47, 78],
    unique: [
      [0, 1],
      [3, 4],
      [5, 7],
    ],
    mons: [
      [
        ['sand_raider', 1],
        ['baboon', 1],
        ['skeleton_archer', 1],
        ['blunderbore', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['sand_raider', 1],
        ['baboon', 1],
        ['skeleton_archer', 1],
        ['blunderbore', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['sand_raider', 1],
        ['baboon', 1],
        ['skeleton_archer', 1],
        ['blunderbore', 1],
        ['skeleton_mage', 1],
      ],
    ],
  },
  a2_cellar3: {
    name: 'Palace Cellar Level 3',
    den: 2200,
    lvl: [13, 48, 78],
    unique: [
      [0, 1],
      [3, 4],
      [5, 7],
    ],
    mons: [
      [
        ['sand_raider', 1],
        ['baboon', 1],
        ['skeleton_archer', 1],
        ['blunderbore', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['sand_raider', 1],
        ['baboon', 1],
        ['skeleton_archer', 1],
        ['blunderbore', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['sand_raider', 1],
        ['baboon', 1],
        ['skeleton_archer', 1],
        ['blunderbore', 1],
        ['skeleton_mage', 1],
      ],
    ],
  },
  a2_stony1: {
    name: 'Stony Tomb Level 1',
    den: 2200,
    lvl: [12, 44, 78],
    unique: [
      [0, 1],
      [3, 4],
      [6, 8],
    ],
    mons: [
      [
        ['skeleton', 1],
        ['scarab', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['skeleton', 1],
        ['scarab', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['skeleton', 1],
        ['scarab', 1],
        ['skeleton_mage', 1],
      ],
    ],
  },
  a2_halls1: {
    name: 'Halls of the Dead Level 1',
    den: 2200,
    lvl: [12, 44, 79],
    unique: [
      [0, 1],
      [3, 4],
      [6, 8],
    ],
    mons: [
      [
        ['mummy', 1],
        ['unraveler', 2],
        ['bat_demon', 1],
        ['slinger', 1],
      ],
      [
        ['mummy', 1],
        ['unraveler', 2],
        ['bat_demon', 1],
        ['slinger', 1],
      ],
      [
        ['mummy', 1],
        ['unraveler', 2],
        ['bat_demon', 1],
        ['slinger', 1],
      ],
    ],
  },
  a2_halls2: {
    name: 'Halls of the Dead Level 2',
    den: 2200,
    lvl: [13, 45, 81],
    unique: [
      [0, 1],
      [3, 4],
      [6, 8],
    ],
    mons: [
      [
        ['mummy', 1],
        ['unraveler', 2],
        ['bat_demon', 1],
        ['slinger', 1],
      ],
      [
        ['mummy', 1],
        ['unraveler', 2],
        ['bat_demon', 1],
        ['slinger', 1],
      ],
      [
        ['mummy', 1],
        ['unraveler', 2],
        ['bat_demon', 1],
        ['slinger', 1],
      ],
    ],
  },
  a2_viper1: {
    name: 'Claw Viper Temple Level 1',
    den: 2200,
    lvl: [14, 47, 82],
    unique: [
      [0, 1],
      [3, 4],
      [6, 8],
    ],
    mons: [
      [
        ['claw_viper', 4],
        ['mummy', 1],
        ['unraveler', 1],
      ],
      [
        ['claw_viper', 4],
        ['mummy', 1],
        ['unraveler', 1],
      ],
      [
        ['claw_viper', 4],
        ['mummy', 1],
        ['unraveler', 1],
      ],
    ],
  },
  a2_stony2: {
    name: 'Stony Tomb Level 2',
    den: 2200,
    lvl: [12, 44, 79],
    unique: [
      [0, 1],
      [0, 1],
      [1, 2],
    ],
    mons: [
      [
        ['skeleton', 1],
        ['scarab', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['skeleton', 1],
        ['scarab', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['skeleton', 1],
        ['scarab', 1],
        ['skeleton_mage', 1],
      ],
    ],
  },
  a2_halls3: {
    name: 'Halls of the Dead Level 3',
    den: 2200,
    lvl: [13, 45, 82],
    unique: [
      [0, 1],
      [0, 1],
      [1, 2],
    ],
    mons: [
      [
        ['mummy', 1],
        ['unraveler', 2],
        ['bat_demon', 1],
        ['slinger', 1],
      ],
      [
        ['mummy', 1],
        ['unraveler', 2],
        ['bat_demon', 1],
        ['slinger', 1],
      ],
      [
        ['mummy', 1],
        ['unraveler', 2],
        ['bat_demon', 1],
        ['slinger', 1],
      ],
    ],
  },
  a2_viper2: {
    name: 'Claw Viper Temple Level 2',
    den: 2200,
    lvl: [14, 47, 83],
    unique: [
      [0, 1],
      [0, 1],
      [1, 2],
    ],
    mons: [
      [
        ['claw_viper', 4],
        ['mummy', 1],
        ['unraveler', 1],
      ],
      [
        ['claw_viper', 4],
        ['mummy', 1],
        ['unraveler', 1],
      ],
      [
        ['claw_viper', 4],
        ['mummy', 1],
        ['unraveler', 1],
      ],
    ],
  },
  a2_maggot1: {
    name: 'Maggot Lair Level 1',
    den: 990,
    lvl: [17, 45, 84],
    unique: [
      [0, 2],
      [3, 4],
      [5, 6],
    ],
    mons: [
      [
        ['sand_maggot', 2],
        ['locust', 1],
        ['scarab', 2],
      ],
      [
        ['sand_maggot', 2],
        ['locust', 1],
        ['scarab', 2],
      ],
      [
        ['sand_maggot', 2],
        ['locust', 1],
        ['scarab', 2],
      ],
    ],
  },
  a2_maggot2: {
    name: 'Maggot Lair Level 2',
    den: 990,
    lvl: [17, 45, 84],
    unique: [
      [0, 2],
      [3, 4],
      [5, 6],
    ],
    mons: [
      [
        ['sand_maggot', 2],
        ['locust', 1],
        ['scarab', 2],
      ],
      [
        ['sand_maggot', 2],
        ['locust', 1],
        ['scarab', 2],
      ],
      [
        ['sand_maggot', 2],
        ['locust', 1],
        ['scarab', 2],
      ],
    ],
  },
  a2_maggot3: {
    name: 'Maggot Lair Level 3',
    den: 990,
    lvl: [17, 46, 85],
    unique: [
      [0, 2],
      [2, 3],
      [4, 5],
    ],
    mons: [
      [
        ['sand_maggot', 2],
        ['locust', 1],
        ['scarab', 2],
      ],
      [
        ['sand_maggot', 2],
        ['locust', 1],
        ['scarab', 2],
      ],
      [
        ['sand_maggot', 2],
        ['locust', 1],
        ['scarab', 2],
      ],
    ],
  },
  a2_tunnels: {
    name: 'Ancient Tunnels',
    den: 680,
    lvl: [17, 46, 85],
    unique: [
      [0, 2],
      [3, 4],
      [6, 8],
    ],
    mons: [
      [
        ['zombie', 1],
        ['sand_raider', 1],
        ['mummy', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['zombie', 1],
        ['sand_raider', 1],
        ['mummy', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['zombie', 1],
        ['sand_raider', 1],
        ['mummy', 1],
        ['skeleton_mage', 1],
      ],
    ],
  },
  a2_arcane: {
    name: 'Arcane Sanctuary',
    den: 990,
    lvl: [14, 48, 79],
    unique: [
      [0, 1],
      [4, 5],
      [7, 9],
    ],
    mons: [
      [
        ['wraith', 1],
        ['goatman', 1],
        ['ghoul_lord', 1],
      ],
      [
        ['wraith', 1],
        ['goatman', 1],
        ['ghoul_lord', 1],
      ],
      [
        ['wraith', 1],
        ['goatman', 1],
        ['ghoul_lord', 1],
      ],
    ],
  },
};
