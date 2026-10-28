// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/** Zones de l'Acte I d'après Levels.txt (patch 1.13) : monstres [Normal, Cauchemar, Enfer], densité, niveaux, uniques. Généré par tools/audit/gen-levels-a1.ts. Niveaux Project Diablo 2 : patch du mod (mods/pd2/data/levels.patch.ts). */
export interface A1Level {
  name: string;
  den: number;
  lvl: [number, number, number];
  unique: [[number, number], [number, number], [number, number]];
  mons: [[string, number][], [string, number][], [string, number][]];
}

export const A1_LEVELS: Record<string, A1Level> = {
  a1_bloodmoor: {
    name: 'Blood Moor',
    den: 520,
    lvl: [1, 36, 67],
    unique: [
      [0, 0],
      [4, 5],
      [7, 9],
    ],
    mons: [
      [
        ['zombie', 1],
        ['fallen', 1],
        ['quill_rat', 1],
      ],
      [
        ['zombie', 1],
        ['fallen', 1],
        ['quill_rat', 1],
      ],
      [
        ['zombie', 1],
        ['fallen', 1],
        ['quill_rat', 1],
      ],
    ],
  },
  a1_coldplains: {
    name: 'Cold Plains',
    den: 520,
    lvl: [2, 36, 68],
    unique: [
      [1, 1],
      [4, 5],
      [7, 9],
    ],
    mons: [
      [
        ['brute', 1],
        ['dark_stalker', 2],
        ['fallen_shaman', 1],
      ],
      [
        ['brute', 1],
        ['dark_stalker', 2],
        ['fallen_shaman', 1],
      ],
      [
        ['brute', 1],
        ['dark_stalker', 2],
        ['fallen_shaman', 1],
      ],
    ],
  },
  a1_stonyfield: {
    name: 'Stony Field',
    den: 520,
    lvl: [4, 37, 68],
    unique: [
      [1, 2],
      [4, 6],
      [7, 9],
    ],
    mons: [
      [
        ['skeleton', 1],
        ['zombie', 1],
        ['foul_crow', 1],
        ['goatman', 1],
        ['dark_stalker', 1],
      ],
      [
        ['skeleton', 1],
        ['zombie', 1],
        ['foul_crow', 1],
        ['goatman', 1],
        ['dark_stalker', 1],
      ],
      [
        ['skeleton', 1],
        ['zombie', 1],
        ['foul_crow', 1],
        ['goatman', 1],
        ['dark_stalker', 1],
      ],
    ],
  },
  a1_darkwood: {
    name: 'Dark Wood',
    den: 520,
    lvl: [5, 38, 68],
    unique: [
      [1, 2],
      [4, 6],
      [7, 9],
    ],
    mons: [
      [
        ['fallen', 1],
        ['dark_stalker', 2],
        ['quill_rat', 1],
        ['skeleton_archer', 1],
      ],
      [
        ['fallen', 1],
        ['dark_stalker', 2],
        ['quill_rat', 1],
        ['skeleton_archer', 1],
      ],
      [
        ['fallen', 1],
        ['dark_stalker', 2],
        ['quill_rat', 1],
        ['skeleton_archer', 1],
      ],
    ],
  },
  a1_blackmarsh: {
    name: 'Black Marsh',
    den: 520,
    lvl: [6, 38, 69],
    unique: [
      [1, 2],
      [4, 6],
      [7, 9],
    ],
    mons: [
      [
        ['foul_crow', 1],
        ['skeleton', 1],
        ['brute', 1],
        ['goatman', 1],
        ['fallen_shaman', 1],
        ['dark_stalker', 1],
      ],
      [
        ['foul_crow', 1],
        ['skeleton', 1],
        ['brute', 1],
        ['goatman', 1],
        ['fallen_shaman', 1],
        ['dark_stalker', 1],
      ],
      [
        ['foul_crow', 1],
        ['skeleton', 1],
        ['brute', 1],
        ['goatman', 1],
        ['fallen_shaman', 1],
        ['dark_stalker', 1],
      ],
    ],
  },
  a1_tamoe: {
    name: 'Tamoe Highland',
    den: 520,
    lvl: [8, 39, 69],
    unique: [
      [1, 2],
      [4, 6],
      [7, 9],
    ],
    mons: [
      [
        ['dark_stalker', 2],
        ['quill_rat', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['dark_stalker', 2],
        ['quill_rat', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['dark_stalker', 2],
        ['quill_rat', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
    ],
  },
  a1_den: {
    name: 'Den of Evil',
    den: 600,
    lvl: [1, 36, 79],
    unique: [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    mons: [
      [
        ['zombie', 1],
        ['brute', 1],
        ['fallen_shaman', 1],
      ],
      [
        ['zombie', 1],
        ['brute', 1],
        ['fallen_shaman', 1],
      ],
      [
        ['zombie', 1],
        ['brute', 1],
        ['fallen_shaman', 1],
      ],
    ],
  },
  a1_cave1: {
    name: 'Cave Level 1',
    den: 600,
    lvl: [2, 36, 77],
    unique: [
      [1, 2],
      [4, 6],
      [6, 8],
    ],
    mons: [
      [
        ['skeleton', 1],
        ['zombie', 1],
        ['dark_stalker', 1],
      ],
      [
        ['skeleton', 1],
        ['zombie', 1],
        ['dark_stalker', 1],
      ],
      [
        ['skeleton', 1],
        ['zombie', 1],
        ['dark_stalker', 1],
      ],
    ],
  },
  a1_underpass1: {
    name: 'Underground Passage Level 1',
    den: 600,
    lvl: [4, 37, 69],
    unique: [
      [1, 2],
      [4, 6],
      [6, 8],
    ],
    mons: [
      [
        ['afflicted', 1],
        ['fallen', 1],
        ['dark_stalker', 1],
        ['skeleton_archer', 1],
      ],
      [
        ['afflicted', 1],
        ['fallen', 1],
        ['dark_stalker', 1],
        ['skeleton_archer', 1],
      ],
      [
        ['afflicted', 1],
        ['fallen', 1],
        ['dark_stalker', 1],
        ['skeleton_archer', 1],
      ],
    ],
  },
  a1_hole1: {
    name: 'Hole Level 1',
    den: 600,
    lvl: [5, 38, 80],
    unique: [
      [1, 2],
      [4, 6],
      [6, 8],
    ],
    mons: [
      [
        ['afflicted', 1],
        ['fallen', 1],
        ['brute', 1],
        ['dark_stalker', 1],
      ],
      [
        ['afflicted', 1],
        ['fallen', 1],
        ['brute', 1],
        ['dark_stalker', 1],
      ],
      [
        ['afflicted', 1],
        ['fallen', 1],
        ['brute', 1],
        ['dark_stalker', 1],
      ],
    ],
  },
  a1_pit1: {
    name: 'Pit Level 1',
    den: 600,
    lvl: [7, 39, 85],
    unique: [
      [1, 2],
      [4, 6],
      [6, 8],
    ],
    mons: [
      [
        ['skeleton', 1],
        ['fallen', 1],
        ['dark_stalker', 2],
      ],
      [
        ['skeleton', 1],
        ['fallen', 1],
        ['dark_stalker', 2],
      ],
      [
        ['skeleton', 1],
        ['fallen', 1],
        ['dark_stalker', 2],
      ],
    ],
  },
  a1_cave2: {
    name: 'Cave Level 2',
    den: 600,
    lvl: [2, 37, 78],
    unique: [
      [1, 2],
      [2, 3],
      [2, 3],
    ],
    mons: [
      [
        ['skeleton', 1],
        ['zombie', 1],
        ['dark_stalker', 1],
      ],
      [
        ['skeleton', 1],
        ['zombie', 1],
        ['dark_stalker', 1],
      ],
      [
        ['skeleton', 1],
        ['zombie', 1],
        ['dark_stalker', 1],
      ],
    ],
  },
  a1_underpass2: {
    name: 'Underground Passage Level 2',
    den: 600,
    lvl: [4, 38, 83],
    unique: [
      [1, 2],
      [2, 3],
      [2, 3],
    ],
    mons: [
      [
        ['afflicted', 1],
        ['fallen', 1],
        ['dark_stalker', 1],
        ['skeleton_archer', 1],
      ],
      [
        ['afflicted', 1],
        ['fallen', 1],
        ['dark_stalker', 1],
        ['skeleton_archer', 1],
      ],
      [
        ['afflicted', 1],
        ['fallen', 1],
        ['dark_stalker', 1],
        ['skeleton_archer', 1],
      ],
    ],
  },
  a1_hole2: {
    name: 'Hole Level 2',
    den: 600,
    lvl: [5, 39, 81],
    unique: [
      [1, 2],
      [2, 3],
      [2, 3],
    ],
    mons: [
      [
        ['afflicted', 1],
        ['fallen', 1],
        ['brute', 1],
        ['dark_stalker', 1],
      ],
      [
        ['afflicted', 1],
        ['fallen', 1],
        ['brute', 1],
        ['dark_stalker', 1],
      ],
      [
        ['afflicted', 1],
        ['fallen', 1],
        ['brute', 1],
        ['dark_stalker', 1],
      ],
    ],
  },
  a1_pit2: {
    name: 'Pit Level 2',
    den: 600,
    lvl: [7, 40, 85],
    unique: [
      [1, 2],
      [2, 3],
      [2, 3],
    ],
    mons: [
      [
        ['skeleton', 1],
        ['fallen', 1],
        ['dark_stalker', 2],
      ],
      [
        ['skeleton', 1],
        ['fallen', 1],
        ['dark_stalker', 2],
      ],
      [
        ['skeleton', 1],
        ['fallen', 1],
        ['dark_stalker', 2],
      ],
    ],
  },
  a1_burial: {
    name: 'Burial Grounds',
    den: 520,
    lvl: [3, 36, 80],
    unique: [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    mons: [
      [
        ['skeleton', 1],
        ['zombie', 1],
      ],
      [
        ['skeleton', 1],
        ['zombie', 1],
      ],
      [
        ['skeleton', 1],
        ['zombie', 1],
      ],
    ],
  },
  a1_crypt: {
    name: 'Crypt',
    den: 1056,
    lvl: [3, 37, 83],
    unique: [
      [1, 1],
      [3, 4],
      [4, 5],
    ],
    mons: [
      [
        ['skeleton', 1],
        ['zombie', 1],
      ],
      [
        ['skeleton', 1],
        ['zombie', 1],
      ],
      [
        ['skeleton', 1],
        ['zombie', 1],
      ],
    ],
  },
  a1_mausoleum: {
    name: 'Mausoleum',
    den: 1056,
    lvl: [3, 37, 85],
    unique: [
      [1, 1],
      [3, 4],
      [4, 5],
    ],
    mons: [
      [
        ['skeleton', 1],
        ['zombie', 1],
      ],
      [
        ['skeleton', 1],
        ['zombie', 1],
      ],
      [
        ['skeleton', 1],
        ['zombie', 1],
      ],
    ],
  },
  a1_tower: {
    name: 'Forgotten Tower',
    den: 0,
    lvl: [0, 0, 0],
    unique: [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    mons: [[], [], []],
  },
  a1_cellar1: {
    name: 'Tower Cellar Level 1',
    den: 1024,
    lvl: [7, 38, 75],
    unique: [
      [1, 1],
      [2, 3],
      [3, 4],
    ],
    mons: [
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['dark_stalker', 1],
      ],
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['dark_stalker', 1],
      ],
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['dark_stalker', 1],
      ],
    ],
  },
  a1_cellar2: {
    name: 'Tower Cellar Level 2',
    den: 1024,
    lvl: [7, 39, 76],
    unique: [
      [1, 1],
      [2, 3],
      [3, 4],
    ],
    mons: [
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['dark_stalker', 1],
      ],
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['dark_stalker', 1],
      ],
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['dark_stalker', 1],
      ],
    ],
  },
  a1_cellar3: {
    name: 'Tower Cellar Level 3',
    den: 1024,
    lvl: [7, 40, 77],
    unique: [
      [1, 1],
      [2, 3],
      [3, 4],
    ],
    mons: [
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['dark_stalker', 1],
      ],
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['dark_stalker', 1],
      ],
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['dark_stalker', 1],
      ],
    ],
  },
  a1_cellar4: {
    name: 'Tower Cellar Level 4',
    den: 1024,
    lvl: [7, 41, 78],
    unique: [
      [1, 1],
      [2, 3],
      [3, 4],
    ],
    mons: [
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['dark_stalker', 1],
      ],
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['dark_stalker', 1],
      ],
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['dark_stalker', 1],
      ],
    ],
  },
  a1_monastery: {
    name: 'Monastery Gate',
    den: 600,
    lvl: [8, 40, 70],
    unique: [
      [0, 1],
      [0, 1],
      [1, 2],
    ],
    mons: [
      [
        ['afflicted', 1],
        ['dark_stalker', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['afflicted', 1],
        ['dark_stalker', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['afflicted', 1],
        ['dark_stalker', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
    ],
  },
  a1_cloister: {
    name: 'Outer Cloister',
    den: 600,
    lvl: [9, 40, 70],
    unique: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    mons: [
      [
        ['brute', 1],
        ['dark_stalker', 1],
        ['fallen_shaman', 1],
        ['quill_rat', 1],
      ],
      [
        ['brute', 1],
        ['dark_stalker', 1],
        ['fallen_shaman', 1],
        ['quill_rat', 1],
      ],
      [
        ['brute', 1],
        ['dark_stalker', 1],
        ['fallen_shaman', 1],
        ['quill_rat', 1],
      ],
    ],
  },
  a1_barracks: {
    name: 'Barracks',
    den: 680,
    lvl: [9, 40, 70],
    unique: [
      [1, 2],
      [4, 5],
      [6, 8],
    ],
    mons: [
      [
        ['dark_stalker', 1],
        ['goatman', 1],
        ['fallen_shaman', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['dark_stalker', 1],
        ['goatman', 1],
        ['fallen_shaman', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['dark_stalker', 1],
        ['goatman', 1],
        ['fallen_shaman', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
    ],
  },
  a1_jail1: {
    name: 'Jail Level 1',
    den: 680,
    lvl: [10, 41, 71],
    unique: [
      [1, 2],
      [4, 5],
      [6, 8],
    ],
    mons: [
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
    ],
  },
  a1_jail2: {
    name: 'Jail Level 2',
    den: 680,
    lvl: [10, 41, 71],
    unique: [
      [1, 2],
      [4, 5],
      [6, 8],
    ],
    mons: [
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
    ],
  },
  a1_jail3: {
    name: 'Jail Level 3',
    den: 680,
    lvl: [10, 41, 71],
    unique: [
      [1, 2],
      [4, 5],
      [6, 8],
    ],
    mons: [
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['fallen', 1],
        ['wraith', 1],
        ['goatman', 1],
        ['skeleton_archer', 1],
        ['skeleton_mage', 1],
      ],
    ],
  },
  a1_inner: {
    name: 'Inner Cloister',
    den: 720,
    lvl: [10, 41, 72],
    unique: [
      [0, 1],
      [1, 2],
      [2, 2],
    ],
    mons: [
      [
        ['fallen', 1],
        ['dark_stalker', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['fallen', 1],
        ['dark_stalker', 1],
        ['skeleton_mage', 1],
      ],
      [
        ['fallen', 1],
        ['dark_stalker', 1],
        ['skeleton_mage', 1],
      ],
    ],
  },
  a1_cathedral: {
    name: 'Cathedral',
    den: 680,
    lvl: [11, 42, 72],
    unique: [
      [1, 2],
      [2, 3],
      [3, 3],
    ],
    mons: [
      [
        ['afflicted', 1],
        ['wraith', 1],
        ['fallen_shaman', 1],
      ],
      [
        ['afflicted', 1],
        ['wraith', 1],
        ['fallen_shaman', 1],
      ],
      [
        ['afflicted', 1],
        ['wraith', 1],
        ['fallen_shaman', 1],
      ],
    ],
  },
  a1_cata1: {
    name: 'Catacombs Level 1',
    den: 680,
    lvl: [11, 42, 72],
    unique: [
      [1, 2],
      [4, 5],
      [6, 8],
    ],
    mons: [
      [
        ['afflicted', 1],
        ['fallen_shaman', 1],
        ['soul_killer', 1],
      ],
      [
        ['afflicted', 1],
        ['fallen_shaman', 1],
        ['soul_killer', 1],
      ],
      [
        ['afflicted', 1],
        ['fallen_shaman', 1],
        ['soul_killer', 1],
      ],
    ],
  },
  a1_cata2: {
    name: 'Catacombs Level 2',
    den: 680,
    lvl: [11, 42, 73],
    unique: [
      [1, 2],
      [4, 5],
      [6, 8],
    ],
    mons: [
      [
        ['afflicted', 1],
        ['fallen_shaman', 1],
        ['arach', 1],
      ],
      [
        ['afflicted', 1],
        ['fallen_shaman', 1],
        ['arach', 1],
      ],
      [
        ['afflicted', 1],
        ['fallen_shaman', 1],
        ['arach', 1],
      ],
    ],
  },
  a1_cata3: {
    name: 'Catacombs Level 3',
    den: 680,
    lvl: [12, 43, 73],
    unique: [
      [1, 2],
      [4, 5],
      [6, 8],
    ],
    mons: [
      [
        ['zombie', 1],
        ['afflicted', 1],
        ['ghoul_lord', 1],
      ],
      [
        ['zombie', 1],
        ['afflicted', 1],
        ['ghoul_lord', 1],
      ],
      [
        ['zombie', 1],
        ['afflicted', 1],
        ['ghoul_lord', 1],
      ],
    ],
  },
};
