// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Zone, monster and super-unique identifiers refer to the base's tables derived from Diablo II (Levels.txt, SuperUniques.txt): see LICENSE-DATA.md.
/**
 * Rounds of the Survivals mode, act by act, in the order of the act's zones (ACT1_STEPS). A round is a run `survivals:<id>`: a closed arena
 * cut from the real map of its first zone (synthetic arena when the map is absent), the monsters of its zones (Levels.txt, `levels`
 * registry, by difficulty), the super-unique of the zone as the checkpoint, or the act's boss for the last round. Hand-written: only
 * identifiers of the base's tables, no game asset.
 */
import type { GroundKind } from '../../../src/mods/sdk';

export interface ArenaLook {
  /** Ground of the synthetic arena */
  ground: GroundKind;
  theme: string;
  mood: string;
  ambient: { color: number; level: number };
  /** Decor of the synthetic arena: border, then obstacles */
  border: string[];
  obstacles: string[];
  /**
   * Lot 307 (owner: "the map's limits are invisible"): Diablo II décor (sheets imported from the player's files) set along the outside of
   * an arena cut from a map, its visible edge; `border` when absent
   */
  edge?: string[];
}

/** Elite of a round: a super-unique (key of SUPER_UNIQUE_DEFS) or a boss monster (`MonsterDef.boss`: Radament, Izual, Shenk…) */
export interface Elite {
  /** Super-unique key, or monster identifier */
  ref: string;
  /** Name shown when the table's is an internal one (SuperUniques.txt: "Siege Boss" is Shenk the Overseer) */
  name?: string;
  /** Escort: species and number, in place of the super-unique's own group */
  escort?: [string, number];
}

/** Boss round of an act: guards, elite waves, then the act's boss in its lair */
export interface BossDef {
  monster: string;
  /** Monster level of the guards by difficulty (the lair's zone level, Levels.txt); the boss keeps its own (`MonsterDef.bossLevel`) */
  level: [number, number, number];
  /** Bosses killed with it (the three Ancients): the round ends when the last one dies */
  with?: string[];
  /** Seconds before the boss arrives, when there is no elite wave (default 90) */
  at?: number;
  /** Share of the guards' population table (default 1; 0: the boss alone, Duriel in his chamber) */
  guards?: number;
  /**
   * Elite waves before the boss (Mephisto's Council, the seals of the Chaos Sanctuary, Baal's minions in the Throne of Destruction): the
   * first one at `wavesAt` seconds, each next one 4 s after the previous one is killed; the boss 5 s after the last one
   */
  waves?: Elite[][];
  wavesAt?: number;
  /** Side of the boss arena (default 40) */
  arena?: number;
  /** Line announcing the boss (French source text) */
  warn?: string;
}

export interface RoundDef {
  /** `a1r1`…: run identifier `survivals:<id>`, checkpoint key */
  id: string;
  act: 1 | 2 | 3 | 4 | 5;
  /** Name shown (French source text, translated by the dictionaries) */
  name: string;
  /** Zones of the `levels` registry (or the base's level plans for Act IV and the lairs): monster pools; the first one gives the monster level and the arena's map; the others mix in at 5:30 */
  zones: string[];
  /** D2 map cut for the arena (default: the first zone) */
  map?: string;
  /** Mini-boss(es), the checkpoint: all of them killed (the Council of Travincal); `boss`: the act's boss instead (last round) */
  miniboss?: Elite | Elite[];
  /**
   * Elite(s) met halfway through the round: the first in place of the random unique, the next ones every 45 s after it (`MIDBOSS_GAP`;
   * none of these after `MERCY.lateChampionsAfter` deaths in the round, nor the first after `MERCY.elitesAfter`)
   */
  midboss?: Elite | Elite[];
  boss?: BossDef;
  /** Recommended level by difficulty (menu) */
  recLevel: [number, number, number];
  /** First-clear reward (D2 quest of the zone: Den of Evil, Radament, Izual give skill points, Lam Esen stat points, Anya resistances) */
  firstClear?: { skillPoints?: number; statPoints?: number; resAll?: number };
  /** First-clear reward and quest of a base run (`RunDef.rewardAs`): the act's boss; Baal opens the next difficulty */
  rewardAs?: string;
  look: ArenaLook;
}

/** Super-unique or boss monster of a round */
const su = (ref: string, name?: string, escort?: [string, number]): Elite => ({ ref, ...(name ? { name } : {}), ...(escort ? { escort } : {}) });

const MOOR: ArenaLook = {
  ground: 'deadgrass',
  theme: 'village',
  mood: 'tristram',
  ambient: { color: 0x40382f, level: 0.35 },
  border: ['trees_small', 'tree_pine', 'tree_dead_l', 'rock_b'],
  obstacles: ['rock_b', 'tree_dead_l', 'ruin', 'tree_pine'],
  // Act I's rocks and dead trees (Objects.dt1, treegroups.dt1)
  edge: ['rock_a', 'rock_b', 'rock_c', 'rock_a', 'tree_dead_s', 'tree_dead_m'],
};
/** The Dark Wood: its edge a line of Act I's trees */
const WOOD: ArenaLook = { ...MOOR, edge: ['tree_dead_l', 'tree_dead_m', 'tree_dead_s', 'tree_dead_m', 'rock_b'] };
const MONASTERY: ArenaLook = {
  ground: 'flagstone',
  theme: 'keep',
  mood: 'tombs',
  ambient: { color: 0x302c34, level: 0.25 },
  border: ['candles', 'coffin'],
  obstacles: ['coffin', 'shrine_candles', 'candles'],
  // Act I's candles, skulls and bones (objects of Diablo II)
  edge: ['candles', 'skull', 'bones', 'skull'],
};
const CRYPT: ArenaLook = {
  ground: 'crypt',
  theme: 'tomb',
  mood: 'tombs',
  ambient: { color: 0x2a2c34, level: 0.2 },
  border: ['candles', 'coffin'],
  obstacles: ['coffin', 'shrine_candles', 'candles'],
  // Act I's candles, skulls and bones (objects of Diablo II)
  edge: ['candles', 'skull', 'bones', 'skull'],
};

/** Act I, Normal to Hell (the vertical slice plays Normal) */
export const ACT1_ROUNDS: RoundDef[] = [
  {
    id: 'a1r1',
    act: 1,
    name: 'Lande sanglante',
    zones: ['a1_bloodmoor', 'a1_den'],
    miniboss: su('corpsefire'),
    recLevel: [1, 36, 67],
    firstClear: { skillPoints: 1 },
    look: MOOR,
  },
  {
    id: 'a1r2',
    act: 1,
    name: 'Plaines glacées',
    zones: ['a1_coldplains', 'a1_burial'],
    // D2: Bishibosh in the Cold Plains, Coldcrow in the Cave, Bonebreak in the Crypt of the Burial Grounds
    midboss: [su('bishibosh'), su('coldcrow'), su('bonebreak')],
    miniboss: su('blood raven'),
    recLevel: [3, 37, 68],
    look: MOOR,
  },
  {
    id: 'a1r3',
    act: 1,
    name: 'Champ de pierres',
    zones: ['a1_stonyfield'],
    // D2: Griswold in Tristram, through the Stony Field's portal; the Cow King of the secret level with his hell bovines
    midboss: [su('griswold', undefined, ['skeleton', 3]), su('the cow king', undefined, ['hell_bovine', 4])],
    miniboss: su('rakanishu'),
    recLevel: [5, 38, 69],
    look: MOOR,
  },
  {
    id: 'a1r4',
    act: 1,
    name: 'Bois sombre',
    zones: ['a1_darkwood', 'a1_blackmarsh'],
    midboss: su('treehead woodfist'),
    miniboss: su('the countess'),
    recLevel: [7, 39, 70],
    look: WOOD,
  },
  {
    id: 'a1r5',
    act: 1,
    name: 'Hautes-terres de Tamoe',
    zones: ['a1_tamoe', 'a1_monastery', 'a1_barracks'],
    midboss: su('flamespike the crawler'),
    miniboss: su('the smith'),
    recLevel: [9, 40, 71],
    look: MOOR,
  },
  {
    id: 'a1r6',
    act: 1,
    name: 'Prison et cathédrale',
    zones: ['a1_jail1', 'a1_cathedral'],
    midboss: su('pitspawn fouldog'),
    miniboss: su('boneash'),
    recLevel: [11, 41, 72],
    look: MONASTERY,
  },
  {
    id: 'a1r7',
    act: 1,
    name: 'Repaire d’Andariel',
    zones: ['a1_cata3', 'a1_cata2'],
    map: 'andariel',
    boss: { monster: 'andariel', level: [12, 43, 73], warn: 'Andariel arrive…' },
    recLevel: [13, 43, 73],
    rewardAs: 'andariel',
    look: CRYPT,
  },
];

const DESERT: ArenaLook = {
  ground: 'sand',
  theme: 'village',
  mood: 'tristram',
  ambient: { color: 0x4a3c28, level: 0.4 },
  border: ['rock_a', 'rock_c', 'rock_b'],
  obstacles: ['rock_a', 'rock_c', 'tomb_urn', 'bones'],
};
const SEWER: ArenaLook = {
  ground: 'sandstone',
  theme: 'tomb',
  mood: 'tombs',
  ambient: { color: 0x2e2a24, level: 0.22 },
  border: ['tomb_urn', 'candles'],
  obstacles: ['tomb_urn', 'coffin', 'bones'],
};
const TOMB: ArenaLook = {
  ground: 'sandstone',
  theme: 'tomb',
  mood: 'tombs',
  ambient: { color: 0x3a3028, level: 0.22 },
  border: ['tomb_urn', 'candles'],
  obstacles: ['tomb_urn', 'coffin', 'shrine_candles'],
};
const JUNGLE: ArenaLook = {
  ground: 'grass',
  theme: 'village',
  mood: 'tristram',
  ambient: { color: 0x2c3a28, level: 0.3 },
  border: ['trees_small', 'tree_pine', 'rock_b'],
  obstacles: ['tree_pine', 'rock_b', 'ruin', 'trees_small'],
};
const KURAST: ArenaLook = {
  ground: 'cobble',
  theme: 'village',
  mood: 'tristram',
  ambient: { color: 0x34302a, level: 0.3 },
  border: ['ruin', 'tree_pine', 'rock_b'],
  obstacles: ['ruin', 'brazier', 'rock_b'],
};
const DURANCE: ArenaLook = {
  ground: 'flagstone',
  theme: 'keep',
  mood: 'tombs',
  ambient: { color: 0x2a2630, level: 0.2 },
  border: ['brazier', 'torch_wall'],
  obstacles: ['brazier', 'bones', 'skull'],
};
const HELL: ArenaLook = {
  ground: 'hellstone',
  theme: 'keep',
  mood: 'chaos',
  ambient: { color: 0x40201a, level: 0.24 },
  border: ['bones', 'skull', 'brazier'],
  obstacles: ['bones', 'skull', 'brazier'],
};
const SNOW: ArenaLook = {
  ground: 'snow',
  theme: 'keep',
  mood: 'frozen',
  ambient: { color: 0x40485a, level: 0.32 },
  border: ['tree_pine', 'rock_a', 'rock_b'],
  obstacles: ['tree_pine', 'rock_a', 'bones'],
};
const KEEP: ArenaLook = {
  ground: 'hellstone',
  theme: 'keep',
  mood: 'baal',
  ambient: { color: 0x3a2a30, level: 0.22 },
  border: ['brazier', 'banner_red'],
  obstacles: ['brazier', 'skull', 'bones'],
};

/** Act II (Lut Gholein), Normal to Hell: Radament, the Halls of the Dead, the Far Oasis, the Lost City, the Summoner, the Canyon, Duriel */
export const ACT2_ROUNDS: RoundDef[] = [
  {
    id: 'a2r1',
    act: 2,
    name: 'Égouts de Lut Gholein',
    zones: ['a2_sewer1', 'a2_sewer3'],
    miniboss: su('radament'),
    recLevel: [13, 43, 74],
    // D2: Radament's Lair, the Book of Skill
    firstClear: { skillPoints: 1 },
    look: SEWER,
  },
  {
    id: 'a2r2',
    act: 2,
    name: 'Collines arides',
    zones: ['a2_dryhills', 'a2_rocky', 'a2_halls1'],
    miniboss: su('bloodwitch the wild'),
    recLevel: [15, 44, 76],
    look: DESERT,
  },
  {
    id: 'a2r3',
    act: 2,
    name: 'Oasis lointaine',
    zones: ['a2_oasis', 'a2_maggot1'],
    midboss: su('beetleburst'),
    miniboss: su('coldworm the burrower', undefined, ['sand_maggot', 4]),
    recLevel: [16, 45, 76],
    look: DESERT,
  },
  {
    id: 'a2r4',
    act: 2,
    name: 'Cité perdue',
    zones: ['a2_lostcity', 'a2_valley', 'a2_viper1'],
    midboss: su('dark elder'),
    miniboss: su('fangskin'),
    recLevel: [17, 46, 77],
    look: DESERT,
  },
  {
    id: 'a2r5',
    act: 2,
    name: 'Sanctuaire des arcanes',
    zones: ['a2_arcane'],
    // D2: Fire Eye in the Palace Cellar, on the way to the Arcane Sanctuary
    midboss: su('fire eye'),
    miniboss: su('summoner'),
    recLevel: [17, 48, 79],
    look: TOMB,
  },
  {
    id: 'a2r6',
    act: 2,
    name: 'Canyon des Mages',
    zones: ['a2_canyon', 'a2_tunnels'],
    midboss: su('leatherarm'),
    miniboss: su('ancient kaa the soulless'),
    recLevel: [18, 48, 79],
    look: DESERT,
  },
  {
    id: 'a2r7',
    act: 2,
    name: 'Repaire de Duriel',
    zones: ['tombs'],
    map: 'duriel_lair',
    // D2: Duriel waits alone in his chamber, Holy Freeze around him
    boss: { monster: 'duriel', level: [17, 49, 80], guards: 0, at: 5, arena: 36, warn: 'Duriel se réveille…' },
    recLevel: [20, 50, 80],
    rewardAs: 'tombs',
    look: TOMB,
  },
];

/** Act III (Kurast Docks): the Spider Forest, the Flayer Jungle, Kurast, Travincal and its Council, Mephisto in the Durance of Hate */
export const ACT3_ROUNDS: RoundDef[] = [
  {
    id: 'a3r1',
    act: 3,
    name: 'Forêt des araignées',
    zones: ['a3_spider', 'a3_cave2'],
    miniboss: su('web mage the burning'),
    recLevel: [21, 49, 79],
    look: JUNGLE,
  },
  {
    id: 'a3r2',
    act: 3,
    name: 'Jungle des Flayers',
    zones: ['a3_jungle', 'a3_marsh', 'a3_flayer3'],
    midboss: su('stormtree'),
    miniboss: su('witch doctor endugu'),
    recLevel: [22, 50, 80],
    look: JUNGLE,
  },
  {
    id: 'a3r3',
    act: 3,
    name: 'Bazar de Kurast',
    zones: ['a3_bazaar', 'a3_lower', 'a3_temple1', 'a3_sewer1'],
    midboss: su('icehawk riftwing'),
    miniboss: su('sarina the battlemaid'),
    recLevel: [22, 52, 81],
    // D2: Lam Esen's Tome, in the Ruined Temple Sarina guards
    firstClear: { statPoints: 5 },
    look: KURAST,
  },
  {
    id: 'a3r4',
    act: 3,
    name: 'Travincal',
    // Upper Kurast's monsters first (zealots among the casters), Travincal's map and its priests from 5:30
    zones: ['a3_upper', 'a3_travincal', 'a3_causeway'],
    map: 'a3_travincal',
    // D2: the three Council members of Travincal, all of them
    miniboss: [su('ismail vilehand', undefined, ['council_member', 1]), su('geleb flamefinger', undefined, ['council_member', 1]), su('toorc icefist', undefined, ['council_member', 1])],
    recLevel: [24, 54, 82],
    look: KURAST,
  },
  {
    id: 'a3r5',
    act: 3,
    name: 'Durance de la Haine',
    zones: ['a3_durance2', 'a3_durance1'],
    map: 'mephisto',
    // D2: the other three Council members guard Mephisto's bridge
    boss: {
      monster: 'mephisto',
      level: [25, 55, 83],
      waves: [[su('bremm sparkfist', undefined, ['council_member', 2]), su('wyand voidfinger'), su('maffer dragonhand')]],
      wavesAt: 45,
      warn: 'Méphisto approche…',
    },
    recLevel: [26, 56, 83],
    rewardAs: 'mephisto',
    look: DURANCE,
  },
];

/** Act IV (Pandemonium Fortress): Izual, Hephasto at the River of Flame, then the seals of the Chaos Sanctuary and Diablo */
export const ACT4_ROUNDS: RoundDef[] = [
  {
    id: 'a4r1',
    act: 4,
    name: 'Plaines du désespoir',
    zones: ['a4_plains', 'a4_steppes'],
    // the super-uniques of Act IV in SuperUniques.txt (Taintbreeder, the Tormentor; Winged Death and Riftwraith at the River of Flame)
    midboss: [su('taintbreeder'), su('the tormentor')],
    miniboss: su('izual', undefined, ['vile_mother', 3]),
    recLevel: [26, 56, 83],
    // D2: the Fallen Angel, two skill points
    firstClear: { skillPoints: 2 },
    look: HELL,
  },
  {
    id: 'a4r2',
    act: 4,
    name: 'Fleuve de flammes',
    zones: ['a4_river', 'a4_city'],
    midboss: [su('winged death'), su('riftwraith the cannibal')],
    miniboss: su('hephasto', undefined, ['oblivion_knight', 4]),
    recLevel: [27, 57, 84],
    look: HELL,
  },
  {
    id: 'a4r3',
    act: 4,
    name: 'Sanctuaire du Chaos',
    zones: ['chaos'],
    map: 'chaos',
    // D2: the three seals' guardians, then Diablo
    boss: {
      monster: 'diablo',
      level: [28, 58, 85],
      waves: [
        [su('grand vizier of chaos', 'Grand Vizir du Chaos', ['storm_caster', 6])],
        [su('lord de seis', 'Seigneur De Seis', ['oblivion_knight', 4])],
        [su('infector of souls', 'Infecteur d’âmes', ['venom_lord', 3])],
      ],
      wavesAt: 40,
      arena: 48,
      warn: 'Diablo surgit du pentagramme…',
    },
    recLevel: [30, 60, 85],
    rewardAs: 'chaos',
    look: HELL,
  },
];

/** Act V (Harrogath): Shenk, Eldritch, Anya's Frozen River, Nihlathak, the Ancients, the Worldstone Keep, then the Throne and Baal */
export const ACT5_ROUNDS: RoundDef[] = [
  {
    id: 'a5r1',
    act: 5,
    name: 'Contreforts sanglants',
    zones: ['a5_foothills', 'a5_highlands'],
    midboss: su('dac farren'),
    miniboss: su('shenk', undefined, ['overseer', 4]),
    recLevel: [26, 58, 80],
    look: SNOW,
  },
  {
    id: 'a5r2',
    act: 5,
    name: 'Hautes terres rigides',
    zones: ['a5_highlands', 'a5_plateau'],
    midboss: [su('sharp tooth sayer', 'Sharptooth Slayer'), su('eyeback unleashed')],
    miniboss: su('megaflow rectifier', 'Eldritch the Rectifier'),
    recLevel: [27, 59, 81],
    look: SNOW,
  },
  {
    id: 'a5r3',
    act: 5,
    name: 'Rivière gelée',
    zones: ['a5_plateau', 'a5_river', 'a5_crystal1'],
    midboss: [su('threash socket', 'Thresh Socket'), su('snapchip shatter'), su('bonesaw breaker')],
    miniboss: su('frozenstein'),
    recLevel: [28, 60, 81],
    // D2: Anya rescued, the scroll of resistance
    firstClear: { resAll: 10 },
    look: SNOW,
  },
  {
    id: 'a5r4',
    act: 5,
    name: 'Temple de Nihlathak',
    zones: ['a5_anguish', 'a5_tundra', 'a5_death'],
    midboss: [su('pindleskin'), su('axe dweller')],
    miniboss: su('nihlathak', undefined, ['prowling_dead', 4]),
    recLevel: [33, 63, 83],
    look: SNOW,
  },
  {
    id: 'a5r5',
    act: 5,
    name: "Sommet d'Arreat",
    zones: ['a5_glacial1', 'a5_tundra'],
    map: 'ancients',
    // D2: the three Ancients together, on the summit
    boss: { monster: 'ancient_talic', with: ['ancient_madawc', 'ancient_korlic'], level: [37, 68, 87], at: 75, warn: 'Les Anciens vous mettent à l’épreuve…' },
    recLevel: [36, 66, 85],
    rewardAs: 'ancients',
    look: SNOW,
  },
  {
    id: 'a5r6',
    act: 5,
    name: 'Donjon de la Pierre-Monde',
    zones: ['a5_keep2', 'a5_keep1', 'a5_keep3'],
    // the other super-uniques of Act V in SuperUniques.txt
    midboss: [su('anodized elite'), su('vinvear molech', undefined, ['succubus', 3]), su('magma torquer'), su('blaze ripper')],
    recLevel: [39, 65, 85],
    look: KEEP,
  },
  {
    id: 'a5r7',
    act: 5,
    name: 'Trône de la Destruction',
    zones: ['baal'],
    map: 'baal',
    // D2: the five waves of Baal's minions in the Throne room, then Baal
    boss: {
      monster: 'baal',
      level: [43, 66, 85],
      waves: [
        [su('baal subject 1', 'Colenzo l’Annihilateur', ['warped_shaman', 5])],
        [su('baal subject 2', 'Achmel le Maudit', ['unraveler', 3])],
        [su('baal subject 3', 'Bartuc le Sanglant', ['council_member', 4])],
        [su('baal subject 4', 'Ventar le Déchaîné', ['venom_lord', 3])],
        [su('baal subject 5', 'Lister le Tourmenteur', ['minion_destruction', 4])],
      ],
      wavesAt: 30,
      guards: 0.6,
      warn: 'Baal descend de son trône…',
    },
    recLevel: [42, 66, 85],
    rewardAs: 'baal',
    look: KEEP,
  },
];

/** Every round, in play order: an act opens when the previous act's boss is killed */
export const ROUNDS: RoundDef[] = [...ACT1_ROUNDS, ...ACT2_ROUNDS, ...ACT3_ROUNDS, ...ACT4_ROUNDS, ...ACT5_ROUNDS];
export const ROUND_BY_ID: Record<string, RoundDef> = Object.fromEntries(ROUNDS.map((r) => [r.id, r]));
/** Rounds of an act */
export const roundsOfAct = (act: number): RoundDef[] => ROUNDS.filter((r) => r.act === act);

/** Run identifier of a round */
export const runIdOf = (r: RoundDef | string): string => `survivals:${typeof r === 'string' ? r : r.id}`;
/** Round of a run identifier (undefined: not a Survivals run) */
export const roundOfRun = (runId: string | undefined | null): RoundDef | undefined => (runId?.startsWith('survivals:') ? ROUND_BY_ID[runId.slice(10)] : undefined);
