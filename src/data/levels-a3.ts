// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/** Zones de l'Acte III d'après Levels.txt (patch 1.13) : monstres [Normal, Cauchemar, Enfer], densité, niveaux, uniques. Généré par tools/audit/gen-levels-a3.ts. Niveaux Project Diablo 2 : patch du mod (mods/pd2/data/levels.patch.ts). */
export interface A3Level {
  name: string;
  den: number;
  lvl: [number, number, number];
  unique: [[number, number], [number, number], [number, number]];
  mons: [[string, number][], [string, number][], [string, number][]];
}

export const A3_LEVELS: Record<string, A3Level> = {
  a3_spider: {
    name: 'Spider Forest',
    den: 650,
    lvl: [21, 49, 79],
    unique: [
      [1, 2],
      [4, 6],
      [10, 15],
    ],
    mons: [
      [
        ['baboon', 1],
        ['mosquito', 1],
        ['thornhulk', 1],
        ['fetish', 1],
        ['fetish_blow', 1],
        ['foul_crow', 1],
      ],
      [
        ['baboon', 1],
        ['mosquito', 1],
        ['thornhulk', 1],
        ['fetish', 1],
        ['fetish_blow', 1],
        ['foul_crow', 1],
      ],
      [
        ['baboon', 1],
        ['mosquito', 1],
        ['thornhulk', 1],
        ['fetish', 1],
        ['fetish_blow', 1],
        ['foul_crow', 1],
      ],
    ],
  },
  a3_marsh: {
    name: 'Great Marsh',
    den: 650,
    lvl: [21, 50, 80],
    unique: [
      [1, 2],
      [4, 6],
      [10, 15],
    ],
    mons: [
      [
        ['frog_demon', 2],
        ['thornhulk', 1],
        ['zombie', 1],
        ['fetish_shaman', 1],
        ['willowisp', 1],
      ],
      [
        ['frog_demon', 2],
        ['thornhulk', 1],
        ['zombie', 1],
        ['fetish_shaman', 1],
        ['willowisp', 1],
      ],
      [
        ['frog_demon', 2],
        ['thornhulk', 1],
        ['zombie', 1],
        ['fetish_shaman', 1],
        ['willowisp', 1],
      ],
    ],
  },
  a3_jungle: {
    name: 'Flayer Jungle',
    den: 650,
    lvl: [22, 50, 80],
    unique: [
      [1, 2],
      [4, 6],
      [10, 15],
    ],
    mons: [
      [
        ['fetish', 2],
        ['fetish_shaman', 2],
        ['vulture', 1],
        ['frog_demon', 1],
        ['fetish_blow', 1],
      ],
      [
        ['fetish', 2],
        ['fetish_shaman', 2],
        ['vulture', 1],
        ['frog_demon', 1],
        ['fetish_blow', 1],
      ],
      [
        ['fetish', 2],
        ['fetish_shaman', 2],
        ['vulture', 1],
        ['frog_demon', 1],
        ['fetish_blow', 1],
      ],
    ],
  },
  a3_lower: {
    name: 'Lower Kurast',
    den: 325,
    lvl: [22, 52, 80],
    unique: [
      [1, 2],
      [4, 6],
      [7, 9],
    ],
    mons: [
      [
        ['baboon', 1],
        ['sand_leaper', 1],
        ['vulture', 1],
        ['zealot', 1],
      ],
      [
        ['baboon', 1],
        ['sand_leaper', 1],
        ['vulture', 1],
        ['zealot', 1],
      ],
      [
        ['baboon', 1],
        ['sand_leaper', 1],
        ['vulture', 1],
        ['zealot', 1],
      ],
    ],
  },
  a3_bazaar: {
    name: 'Kurast Bazaar',
    den: 325,
    lvl: [22, 52, 81],
    unique: [
      [1, 2],
      [4, 6],
      [7, 9],
    ],
    mons: [
      [
        ['thornhulk', 1],
        ['locust', 1],
        ['zealot', 1],
        ['cantor', 1],
      ],
      [
        ['thornhulk', 1],
        ['locust', 1],
        ['zealot', 1],
        ['cantor', 1],
      ],
      [
        ['thornhulk', 1],
        ['locust', 1],
        ['zealot', 1],
        ['cantor', 1],
      ],
    ],
  },
  a3_upper: {
    name: 'Upper Kurast',
    den: 325,
    lvl: [23, 52, 81],
    unique: [
      [1, 2],
      [4, 6],
      [7, 9],
    ],
    mons: [
      [
        ['vulture', 1],
        ['zealot', 1],
        ['cantor', 1],
        ['thornhulk', 1],
      ],
      [
        ['vulture', 1],
        ['zealot', 1],
        ['cantor', 1],
        ['thornhulk', 1],
      ],
      [
        ['vulture', 1],
        ['zealot', 1],
        ['cantor', 1],
        ['thornhulk', 1],
      ],
    ],
  },
  a3_causeway: {
    name: 'Kurast Causeway',
    den: 325,
    lvl: [24, 53, 81],
    unique: [
      [1, 2],
      [4, 6],
      [7, 9],
    ],
    mons: [
      [
        ['sand_raider', 1],
        ['baboon', 1],
        ['cantor', 1],
      ],
      [
        ['sand_raider', 1],
        ['baboon', 1],
        ['cantor', 1],
      ],
      [
        ['sand_raider', 1],
        ['baboon', 1],
        ['cantor', 1],
      ],
    ],
  },
  a3_travincal: {
    name: 'Travincal',
    den: 325,
    lvl: [24, 54, 82],
    unique: [
      [0, 1],
      [3, 5],
      [6, 8],
    ],
    mons: [
      [
        ['cantor', 2],
        ['ghoul_lord', 1],
      ],
      [
        ['cantor', 2],
        ['ghoul_lord', 1],
      ],
      [
        ['cantor', 2],
        ['ghoul_lord', 1],
      ],
    ],
  },
  a3_cave1: {
    name: 'Spider Cave',
    den: 700,
    lvl: [21, 50, 79],
    unique: [
      [0, 1],
      [3, 4],
      [4, 5],
    ],
    mons: [
      [
        ['arach', 3],
        ['bat_demon', 1],
        ['sand_maggot', 1],
      ],
      [
        ['arach', 3],
        ['bat_demon', 1],
        ['sand_maggot', 1],
      ],
      [
        ['arach', 3],
        ['bat_demon', 1],
        ['sand_maggot', 1],
      ],
    ],
  },
  a3_cave2: {
    name: 'Spider Cavern',
    den: 700,
    lvl: [21, 50, 79],
    unique: [
      [0, 1],
      [3, 4],
      [4, 5],
    ],
    mons: [
      [
        ['arach', 3],
        ['bat_demon', 1],
        ['sand_maggot', 1],
      ],
      [
        ['arach', 3],
        ['bat_demon', 1],
        ['sand_maggot', 1],
      ],
      [
        ['arach', 3],
        ['bat_demon', 1],
        ['sand_maggot', 1],
      ],
    ],
  },
  a3_pit1: {
    name: 'Swampy Pit Level 1',
    den: 700,
    lvl: [21, 51, 80],
    unique: [
      [0, 1],
      [3, 4],
      [5, 6],
    ],
    mons: [
      [
        ['mummy', 1],
        ['bone_fetish', 2],
        ['bat_demon', 1],
        ['willowisp', 1],
      ],
      [
        ['mummy', 1],
        ['bone_fetish', 2],
        ['bat_demon', 1],
        ['willowisp', 1],
      ],
      [
        ['mummy', 1],
        ['bone_fetish', 2],
        ['bat_demon', 1],
        ['willowisp', 1],
      ],
    ],
  },
  a3_pit2: {
    name: 'Swampy Pit Level 2',
    den: 700,
    lvl: [21, 51, 81],
    unique: [
      [0, 1],
      [3, 4],
      [5, 5],
    ],
    mons: [
      [
        ['bone_fetish', 2],
        ['zombie', 1],
        ['bat_demon', 1],
        ['willowisp', 1],
      ],
      [
        ['bone_fetish', 2],
        ['zombie', 1],
        ['bat_demon', 1],
        ['willowisp', 1],
      ],
      [
        ['bone_fetish', 2],
        ['zombie', 1],
        ['bat_demon', 1],
        ['willowisp', 1],
      ],
    ],
  },
  a3_flayer1: {
    name: 'Flayer Dungeon Level 1',
    den: 700,
    lvl: [22, 51, 81],
    unique: [
      [0, 1],
      [3, 4],
      [5, 6],
    ],
    mons: [
      [
        ['fetish', 2],
        ['fetish_shaman', 2],
        ['bat_demon', 1],
        ['wraith', 1],
        ['fetish_blow', 1],
        ['bone_fetish', 1],
      ],
      [
        ['fetish', 2],
        ['fetish_shaman', 2],
        ['bat_demon', 1],
        ['wraith', 1],
        ['fetish_blow', 1],
        ['bone_fetish', 1],
      ],
      [
        ['fetish', 2],
        ['fetish_shaman', 2],
        ['bat_demon', 1],
        ['wraith', 1],
        ['fetish_blow', 1],
        ['bone_fetish', 1],
      ],
    ],
  },
  a3_flayer2: {
    name: 'Flayer Dungeon Level 2',
    den: 700,
    lvl: [22, 51, 82],
    unique: [
      [0, 1],
      [3, 4],
      [5, 5],
    ],
    mons: [
      [
        ['fetish', 2],
        ['fetish_shaman', 2],
        ['bat_demon', 1],
        ['wraith', 1],
        ['fetish_blow', 1],
        ['bone_fetish', 1],
      ],
      [
        ['fetish', 2],
        ['fetish_shaman', 2],
        ['bat_demon', 1],
        ['wraith', 1],
        ['fetish_blow', 1],
        ['bone_fetish', 1],
      ],
      [
        ['fetish', 2],
        ['fetish_shaman', 2],
        ['bat_demon', 1],
        ['wraith', 1],
        ['fetish_blow', 1],
        ['bone_fetish', 1],
      ],
    ],
  },
  a3_pit3: {
    name: 'Swampy Pit Level 3',
    den: 700,
    lvl: [21, 51, 82],
    unique: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    mons: [
      [
        ['bone_fetish', 2],
        ['bat_demon', 1],
        ['willowisp', 1],
      ],
      [
        ['bone_fetish', 2],
        ['bat_demon', 1],
        ['willowisp', 1],
      ],
      [
        ['bone_fetish', 2],
        ['bat_demon', 1],
        ['willowisp', 1],
      ],
    ],
  },
  a3_flayer3: {
    name: 'Flayer Dungeon Level 3',
    den: 700,
    lvl: [22, 51, 83],
    unique: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    mons: [
      [
        ['fetish', 2],
        ['fetish_shaman', 2],
        ['bat_demon', 1],
        ['wraith', 1],
        ['fetish_blow', 1],
        ['bone_fetish', 1],
      ],
      [
        ['fetish', 2],
        ['fetish_shaman', 2],
        ['bat_demon', 1],
        ['wraith', 1],
        ['fetish_blow', 1],
        ['bone_fetish', 1],
      ],
      [
        ['fetish', 2],
        ['fetish_shaman', 2],
        ['bat_demon', 1],
        ['wraith', 1],
        ['fetish_blow', 1],
        ['bone_fetish', 1],
      ],
    ],
  },
  a3_sewer1: {
    name: 'Sewers Level 1',
    den: 650,
    lvl: [23, 52, 84],
    unique: [
      [1, 2],
      [3, 4],
      [6, 7],
    ],
    mons: [
      [
        ['mummy', 1],
        ['mosquito', 1],
        ['bat_demon', 1],
        ['unraveler', 1],
        ['bone_fetish', 1],
      ],
      [
        ['mummy', 1],
        ['mosquito', 1],
        ['bat_demon', 1],
        ['unraveler', 1],
        ['bone_fetish', 1],
      ],
      [
        ['mummy', 1],
        ['mosquito', 1],
        ['bat_demon', 1],
        ['unraveler', 1],
        ['bone_fetish', 1],
      ],
    ],
  },
  a3_sewer2: {
    name: 'Sewers Level 2',
    den: 650,
    lvl: [24, 53, 85],
    unique: [
      [1, 2],
      [3, 4],
      [6, 7],
    ],
    mons: [
      [
        ['mummy', 1],
        ['unraveler', 1],
        ['mosquito', 1],
        ['frog_demon', 1],
        ['bone_fetish', 1],
      ],
      [
        ['mummy', 1],
        ['unraveler', 1],
        ['mosquito', 1],
        ['frog_demon', 1],
        ['bone_fetish', 1],
      ],
      [
        ['mummy', 1],
        ['unraveler', 1],
        ['mosquito', 1],
        ['frog_demon', 1],
        ['bone_fetish', 1],
      ],
    ],
  },
  a3_temple1: {
    name: 'Ruined Temple',
    den: 990,
    lvl: [23, 53, 84],
    unique: [
      [1, 2],
      [1, 2],
      [2, 2],
    ],
    mons: [
      [
        ['brute', 1],
        ['dark_stalker', 1],
        ['arach', 1],
        ['ghoul_lord', 1],
      ],
      [
        ['brute', 1],
        ['dark_stalker', 1],
        ['arach', 1],
        ['ghoul_lord', 1],
      ],
      [
        ['brute', 1],
        ['dark_stalker', 1],
        ['arach', 1],
        ['ghoul_lord', 1],
      ],
    ],
  },
  a3_temple2: {
    name: 'Disused Fane',
    den: 990,
    lvl: [23, 53, 84],
    unique: [
      [1, 2],
      [1, 2],
      [2, 2],
    ],
    mons: [
      [
        ['brute', 1],
        ['dark_stalker', 1],
        ['arach', 1],
        ['ghoul_lord', 1],
      ],
      [
        ['brute', 1],
        ['dark_stalker', 1],
        ['arach', 1],
        ['ghoul_lord', 1],
      ],
      [
        ['brute', 1],
        ['dark_stalker', 1],
        ['arach', 1],
        ['ghoul_lord', 1],
      ],
    ],
  },
  a3_temple3: {
    name: 'Forgotten Reliquary',
    den: 990,
    lvl: [23, 53, 84],
    unique: [
      [1, 2],
      [1, 2],
      [2, 2],
    ],
    mons: [
      [
        ['brute', 1],
        ['dark_stalker', 1],
        ['arach', 1],
        ['ghoul_lord', 1],
      ],
      [
        ['brute', 1],
        ['dark_stalker', 1],
        ['arach', 1],
        ['ghoul_lord', 1],
      ],
      [
        ['brute', 1],
        ['dark_stalker', 1],
        ['arach', 1],
        ['ghoul_lord', 1],
      ],
    ],
  },
  a3_temple4: {
    name: 'Forgotten Temple',
    den: 990,
    lvl: [24, 54, 85],
    unique: [
      [1, 2],
      [1, 2],
      [2, 2],
    ],
    mons: [
      [
        ['claw_viper', 1],
        ['scarab', 1],
        ['bat_demon', 1],
        ['dark_stalker', 1],
      ],
      [
        ['claw_viper', 1],
        ['scarab', 1],
        ['bat_demon', 1],
        ['dark_stalker', 1],
      ],
      [
        ['claw_viper', 1],
        ['scarab', 1],
        ['bat_demon', 1],
        ['dark_stalker', 1],
      ],
    ],
  },
  a3_temple5: {
    name: 'Ruined Fane',
    den: 990,
    lvl: [24, 54, 85],
    unique: [
      [1, 2],
      [1, 2],
      [2, 2],
    ],
    mons: [
      [
        ['claw_viper', 1],
        ['scarab', 1],
        ['bat_demon', 1],
        ['dark_stalker', 1],
      ],
      [
        ['claw_viper', 1],
        ['scarab', 1],
        ['bat_demon', 1],
        ['dark_stalker', 1],
      ],
      [
        ['claw_viper', 1],
        ['scarab', 1],
        ['bat_demon', 1],
        ['dark_stalker', 1],
      ],
    ],
  },
  a3_temple6: {
    name: 'Disused Reliquary',
    den: 990,
    lvl: [24, 54, 85],
    unique: [
      [1, 2],
      [1, 2],
      [2, 2],
    ],
    mons: [
      [
        ['claw_viper', 1],
        ['scarab', 1],
        ['bat_demon', 1],
        ['dark_stalker', 1],
      ],
      [
        ['claw_viper', 1],
        ['scarab', 1],
        ['bat_demon', 1],
        ['dark_stalker', 1],
      ],
      [
        ['claw_viper', 1],
        ['scarab', 1],
        ['bat_demon', 1],
        ['dark_stalker', 1],
      ],
    ],
  },
  a3_durance1: {
    name: 'Durance of Hate Level 1',
    den: 800,
    lvl: [25, 55, 83],
    unique: [
      [1, 2],
      [3, 4],
      [5, 7],
    ],
    mons: [
      [
        ['mummy', 1],
        ['ghoul_lord', 1],
        ['blunderbore', 1],
        ['bone_fetish', 1],
      ],
      [
        ['mummy', 1],
        ['ghoul_lord', 1],
        ['blunderbore', 1],
        ['bone_fetish', 1],
      ],
      [
        ['mummy', 1],
        ['ghoul_lord', 1],
        ['blunderbore', 1],
        ['bone_fetish', 1],
      ],
    ],
  },
  a3_durance2: {
    name: 'Durance of Hate Level 2',
    den: 800,
    lvl: [25, 55, 83],
    unique: [
      [1, 2],
      [3, 4],
      [5, 7],
    ],
    mons: [
      [
        ['mummy', 1],
        ['ghoul_lord', 1],
        ['blunderbore', 1],
        ['bone_fetish', 1],
      ],
      [
        ['mummy', 1],
        ['ghoul_lord', 1],
        ['blunderbore', 1],
        ['bone_fetish', 1],
      ],
      [
        ['mummy', 1],
        ['ghoul_lord', 1],
        ['blunderbore', 1],
        ['bone_fetish', 1],
      ],
    ],
  },
};
