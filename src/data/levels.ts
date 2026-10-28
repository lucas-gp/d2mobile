// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Peuplement des zones de farm d'après Levels.txt de Diablo II (patch 1.13) : monstres de la zone d'origine par difficulté (colonnes mon / nmon),
 * densité (MonDen : monstres pour 100 000 sous-cases marchables) et nombre de monstres uniques (MonUMin / MonUMax par difficulté).
 * Les monstres que le jeu n'a pas sont remplacés par leur plus proche cousin (voir docs/internal/AUDIT-MONSTRES.md).
 * Tableau écrit à la main d'après tools/audit/level-monsters.ts.
 */
type Mix = [string, number][];

export interface LevelPlan {
  /** zone D2 d'origine (Levels.txt) */
  d2: string;
  /** monstres pour 100 000 sous-cases marchables */
  den: number;
  /** monstres uniques par difficulté : [min, max] */
  unique: [[number, number], [number, number], [number, number]];
  /** familles par difficulté (normal, cauchemar, enfer) : [monstre, poids] */
  mons: [Mix, Mix, Mix];
}

const same = (m: Mix): [Mix, Mix, Mix] => [m, m, m];

export const LEVEL_PLANS: Record<string, LevelPlan> = {
  // Tristram : Returned, Night Clan, Carver Shaman, Skeleton Archer
  // (Normal : première zone du jeu, jouable dès le niveau 1 — les Hommes-bouc de D2 sont remplacés par des Déchus et des Zombies ; Cauchemar et Enfer : la composition D2)
  tristram: {
    d2: 'Tristram',
    den: 520,
    unique: [
      [1, 2],
      [3, 4],
      [5, 6],
    ],
    mons: [
      [
        ['fallen', 2],
        ['fallen_shaman', 1],
        ['skeleton', 1],
        ['skeleton_archer', 1],
        ['zombie', 1],
      ],
      [
        ['skeleton', 1],
        ['goatman', 1],
        ['fallen_shaman', 1],
        ['skeleton_archer', 1],
      ],
      [
        ['skeleton', 1],
        ['goatman', 1],
        ['fallen_shaman', 1],
        ['skeleton_archer', 1],
      ],
    ],
  },
  // Tour oubliée, niveau 5 : Devilkin, Ghost, Blood Clan, Dark Archer
  countess: {
    d2: 'Tower Cellar Level 5',
    den: 1024,
    unique: [
      [1, 1],
      [2, 3],
      [3, 4],
    ],
    mons: same([
      ['fallen', 1],
      ['wraith', 1],
      ['goatman', 1],
      ['dark_stalker', 1],
    ]),
  },
  // Catacombes, niveau 4 : Ghoul, Afflicted
  andariel: {
    d2: 'Catacombs Level 4',
    den: 680,
    unique: [
      [1, 2],
      [4, 5],
      [6, 8],
    ],
    mons: same([
      ['ghoul', 1],
      ['afflicted', 1],
    ]),
  },
  // Tombeaux de Tal Rasha : Apparition, Steel Scarab, Preserved Dead, Unraveler (×2), Ghoul Lord, Gorebelly
  tombs: {
    d2: "Tal Rasha's Tomb",
    den: 2200,
    unique: [
      [0, 2],
      [4, 6],
      [7, 9],
    ],
    mons: same([
      ['wraith', 1],
      ['scarab', 1],
      ['mummy', 1],
      ['unraveler', 2],
      ['ghoul_lord', 1],
      ['blunderbore', 1],
    ]),
  },
  // Moo Moo Farm : Hell Bovine
  cows: {
    d2: 'Moo Moo Farm',
    den: 800,
    unique: [
      [0, 1],
      [3, 4],
      [6, 8],
    ],
    mons: same([['hell_bovine', 1]]),
  },
  // Durance de la haine, niveau 3 : Levels.txt donne vampire4 (« Blood Lord » de l'Acte III, le vampire à ailes de la famille du Seigneur goule), pas le
  // bloodlord de l'Acte V (« blood_lord » du jeu = Seigneur de la mort, guerrier cornu) qui peuplait la zone de Méphisto (uniques : vampire4 et Undead Stygian Doll)
  mephisto: {
    d2: 'Durance of Hate Level 3',
    den: 800,
    unique: [
      [1, 2],
      [3, 4],
      [5, 7],
    ],
    mons: same([['ghoul_lord', 1]]),
  },
  // Sanctuaire du Chaos : Storm Caster, Oblivion Knight, Venom Lord
  chaos: {
    d2: 'Chaos Sanctum',
    den: 800,
    unique: [
      [0, 1],
      [4, 5],
      [6, 7],
    ],
    mons: same([
      ['storm_caster', 1],
      ['oblivion_knight', 1],
      ['venom_lord', 1],
    ]),
  },
  // Temple de Nihlathak (entrée de Pindleskin) : groupes de morts rôdeurs (monpreset « place_reanimateddead »)
  pindleskin: {
    d2: 'Nihlathaks Temple',
    den: 600,
    unique: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
    mons: same([['prowling_dead', 1]]),
  },
  // Hautes-Terres (Eldritch) et Contreforts sanglants (Shenk) : Demon Imp, Crush Beast, Enslaved, Death Mauler, Overseer (+ Cauchemar / Enfer : Slayer, Vile Archer, Blunderbore, Lasher)
  eldritch: {
    d2: 'Rigid Highlands',
    den: 450,
    unique: [
      [1, 2],
      [6, 7],
      [9, 11],
    ],
    mons: [
      // Normal : Levels.txt (mon) = Demon Imp et Crush Beast seulement ; les Mutileurs, Surveillants et Sbires n'arrivent qu'en Cauchemar (nmon)
      [
        ['imp', 1],
        ['siege_beast', 1],
      ],
      [
        ['imp', 2],
        ['siege_beast', 1],
        ['minion', 2],
        ['death_mauler', 2],
        ['overseer', 1],
        ['dark_stalker', 1],
        ['blunderbore', 1],
        ['skeleton_archer', 1],
        ['slinger', 1],
      ],
      [
        ['imp', 2],
        ['siege_beast', 1],
        ['minion', 2],
        ['death_mauler', 2],
        ['overseer', 2],
        ['dark_stalker', 1],
        ['blunderbore', 1],
        ['skeleton_archer', 1],
        ['slinger', 1],
      ],
    ],
  },
  // Halls of Vaught : Ice Spawn, Hell Temptress, Wretched Defiler (+ Cauchemar / Enfer : morts rôdeurs, spectres, arachnides, archers, chamans fétiches, bêtes des dunes, vipères)
  nihlathak: {
    d2: 'Halls of Vaught',
    den: 700,
    unique: [
      [1, 2],
      [3, 4],
      [5, 6],
    ],
    mons: [
      [
        ['minion', 1],
        ['succubus', 1],
        ['putrid_defiler', 1],
      ],
      // Cauchemar / Enfer (nmon de Levels.txt) : morts rôdeurs, spectres, arachnides, archers, chamans fétiches, bêtes des dunes et vipères griffues
      [
        ['minion', 1],
        ['succubus', 1],
        ['putrid_defiler', 1],
        ['prowling_dead', 1],
        ['wraith', 1],
        ['arach', 1],
        ['skeleton_archer', 1],
        ['fetish_shaman', 1],
        ['baboon', 1],
        ['claw_viper', 1],
      ],
      [
        ['minion', 1],
        ['succubus', 1],
        ['putrid_defiler', 1],
        ['prowling_dead', 1],
        ['wraith', 1],
        ['arach', 1],
        ['skeleton_archer', 1],
        ['fetish_shaman', 1],
        ['baboon', 1],
        ['claw_viper', 1],
      ],
    ],
  },
  // Fleuve de flammes (Lava 1) : Gorebelly, Storm Caster, Oblivion Knight, Venom Lord (sandmaggot, vilemother, regurgitator : sans équivalent)
  river: {
    d2: 'Act 4 - Lava 1',
    den: 800,
    unique: [
      [0, 1],
      [4, 5],
      [6, 7],
    ],
    mons: same([
      ['blunderbore', 1],
      ['storm_caster', 1],
      ['oblivion_knight', 1],
      ['venom_lord', 1],
    ]),
  },
  // Acte IV (Levels 104-107) : Cliff Lurker, Flesh Spawner, Doom Caster, Corpulent, Doom Knight, Venom Lord ; Burning Soul ; Damned, Dark Familiar, Stygian Hag, Strangler, Corpse Spitter, Abyss Knight, Pit Lord
  a4_steppes: {
    d2: 'Outer Steppes',
    den: 800,
    unique: [
      [6, 7],
      [8, 10],
      [8, 10],
    ],
    mons: same([
      ['sand_leaper', 1],
      ['vile_mother', 1],
      ['storm_caster', 1],
      ['regurgitator', 1],
      ['oblivion_knight', 1],
      ['venom_lord', 1],
    ]),
  },
  a4_plains: {
    d2: 'Plains of Despair',
    den: 800,
    unique: [
      [6, 7],
      [8, 10],
      [8, 10],
    ],
    mons: same([
      ['willowisp', 1],
      ['vile_mother', 1],
      ['storm_caster', 1],
      ['regurgitator', 1],
      ['oblivion_knight', 1],
      ['venom_lord', 1],
    ]),
  },
  a4_city: {
    d2: 'City of the Damned',
    den: 800,
    unique: [
      [6, 7],
      [8, 10],
      [8, 10],
    ],
    mons: same([
      ['afflicted', 1],
      ['bat_demon', 1],
      ['vile_mother', 1],
      ['storm_caster', 1],
      ['regurgitator', 1],
      ['oblivion_knight', 1],
      ['venom_lord', 1],
    ]),
  },
  a4_river: {
    d2: 'River of Flame',
    den: 800,
    unique: [
      [4, 5],
      [6, 7],
      [6, 7],
    ],
    mons: same([
      ['sand_maggot', 1],
      ['blunderbore', 1],
      ['vile_mother', 1],
      ['storm_caster', 1],
      ['regurgitator', 1],
      ['oblivion_knight', 1],
      ['venom_lord', 1],
    ]),
  },
  // Trône de la destruction (gardiens de la salle avant les vagues) : Death Lord, Stygian Fury
  // Trône de la destruction : Normal = mon (Death Lord, Stygian Fury) ; Cauchemar et Enfer = nmon (liste élargie)
  baal: {
    d2: 'Throne of Destruction',
    den: 700,
    unique: [
      [0, 0],
      [1, 2],
      [4, 5],
    ],
    mons: [
      [
        ['blood_lord', 1],
        ['succubus_witch', 1],
      ],
      [
        ['blood_lord', 2],
        ['succubus_witch', 2],
        ['soul_killer', 1],
        ['willowisp', 1],
        ['ghoul_lord', 1],
        ['venom_lord', 1],
        ['oblivion_knight', 1],
        ['sand_raider', 1],
        ['unraveler', 1],
        ['claw_viper', 1],
      ],
      [
        ['blood_lord', 2],
        ['succubus_witch', 2],
        ['soul_killer', 1],
        ['willowisp', 1],
        ['ghoul_lord', 1],
        ['venom_lord', 1],
        ['oblivion_knight', 1],
        ['sand_raider', 1],
        ['unraveler', 1],
        ['claw_viper', 1],
      ],
    ],
  },
  // Pandémonium (Levels 133-135) : Antre de la Matrone, Sables oubliés, Fournaise
  uber_lilith: {
    d2: 'Pandemonium Run 1',
    den: 1056,
    unique: [
      [4, 5],
      [4, 5],
      [4, 5],
    ],
    mons: same([
      ['succubus', 1],
      ['succubus_witch', 1],
      ['dark_stalker', 3],
    ]),
  },
  uber_duriel: {
    d2: 'Pandemonium Run 2',
    den: 880,
    unique: [
      [7, 9],
      [7, 9],
      [7, 9],
    ],
    mons: same([
      ['locust', 1],
      ['sand_maggot', 1],
      ['arach', 1],
      ['scarab', 1],
    ]),
  },
  uber_dclone: {
    d2: 'Pandemonium Run 3',
    den: 800,
    unique: [
      [2, 3],
      [2, 3],
      [2, 3],
    ],
    mons: same([
      ['blood_lord', 1],
      ['oblivion_knight', 1],
      ['minion_destruction', 1],
    ]),
  },
  uber_ancients: {
    d2: 'Pandemonium Run 3',
    den: 800,
    unique: [
      [2, 3],
      [2, 3],
      [2, 3],
    ],
    mons: same([
      ['oblivion_knight', 1],
      ['minion_destruction', 1],
      ['venom_lord', 1],
    ]),
  },
  uber_rathma: {
    d2: 'Pandemonium Run 3',
    den: 800,
    unique: [
      [2, 3],
      [2, 3],
      [2, 3],
    ],
    mons: same([
      ['ghoul', 1],
      ['prowling_dead', 1],
      ['dark_stalker', 1],
    ]),
  },
  uber_lucion: {
    d2: 'Pandemonium Run 3',
    den: 800,
    unique: [
      [2, 3],
      [2, 3],
      [2, 3],
    ],
    mons: same([
      ['succubus', 1],
      ['succubus_witch', 1],
      ['blood_lord', 1],
    ]),
  },
  uber_izual: {
    d2: 'Pandemonium Run 3',
    den: 800,
    unique: [
      [3, 4],
      [3, 4],
      [3, 4],
    ],
    mons: same([
      ['overseer', 1],
      ['oblivion_knight', 1],
      ['venom_lord', 1],
      ['imp', 1],
    ]),
  },
};

/** Plafond de monstres par zone (performance) : au-delà, la densité D2 est ramenée à ce total */
export const MAX_ZONE_MONSTERS = 300;

// Acte I : plans générés d'après Levels.txt (levels-a1.ts)
import { A1_LEVELS } from './levels-a1';
for (const [id, l] of Object.entries(A1_LEVELS)) LEVEL_PLANS[id] = { d2: l.name, den: l.den, unique: l.unique, mons: l.mons };

// Acte II : plans générés d'après Levels.txt (levels-a2.ts)
import { A2_LEVELS } from './levels-a2';
for (const [id, l] of Object.entries(A2_LEVELS)) LEVEL_PLANS[id] = { d2: l.name, den: l.den, unique: l.unique, mons: l.mons };

// Acte III : plans générés d'après Levels.txt (levels-a3.ts)
import { A3_LEVELS } from './levels-a3';
for (const [id, l] of Object.entries(A3_LEVELS)) LEVEL_PLANS[id] = { d2: l.name, den: l.den, unique: l.unique, mons: l.mons };

// Acte V : plans générés d'après Levels.txt (levels-a5.ts)
import { A5_LEVELS } from './levels-a5';
for (const [id, l] of Object.entries(A5_LEVELS)) LEVEL_PLANS[id] = { d2: l.name, den: l.den, unique: l.unique, mons: l.mons };
