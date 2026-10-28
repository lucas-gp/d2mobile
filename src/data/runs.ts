// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Les runs de leveling (menu du point de passage). Niveaux de zone : Levels.txt de Diablo II LoD 1.13c (levels-a*.ts et bloc généré
 * ci-dessous ; niveaux Project Diablo 2 : patch du mod, mods/pd2/data/levels.patch.ts), niveaux conseillés = niveau de déblocage, gain
 * principal affiché au joueur.
 */
import type { Difficulty } from './types';
import type { ZoneDef } from './zone-types';
import type { World } from '../sim/world';
import type { Monster } from '../sim/actors';
import type { RunState } from '../sim/runs';
import type { CharacterState } from '../sim/character-state';
import { buildTristram } from './zones/tristram';
import { buildTombs } from './zones/tombs';
import { buildCows } from './zones/cows';
import { buildBaal } from './zones/baal';
import { buildChaos } from './zones/chaos';
import { buildUberAncients, buildUberDclone, buildUberLucion, buildUberRathma, buildUberDuriel, buildUberIzual, buildUberLilith, buildUberTristram } from './zones/farm';
import { buildA4, buildA4Steps } from './zones/act4';
import { WAYPOINT_ZONES } from './waypoints';
import { a1Level, ACT1_STEPS, buildA1, buildA1Steps } from './zones/act1';
import { A2_CHAIN, ACT2_STEPS, buildA2, buildA2Steps } from './zones/act2';
import { ACT3_STEPS, buildA3, buildA3Steps } from './zones/act3';
import { ACT5_STEPS, buildA5, buildA5Steps } from './zones/act5';
import type { Steps } from './zones/steps';
import { A5_LEVELS } from './levels-a5';
import { A3_LEVELS } from './levels-a3';
import { A2_LEVELS } from './levels-a2';
import { buildRiver, buildAncients, buildAndariel, buildCountess, buildEldritch, buildMephisto, buildNihlathak, buildPindleskin } from './zones/farm';

/* ---- généré par tools/vanilla/gen.ts (Levels.txt : tools/vanilla/levels.ts) : ne pas modifier à la main ---- */
/** Niveaux des monstres [Normal, Cauchemar, Enfer] des zones des runs et des étapes de campagne hors levels-a*.ts (Levels.txt, LoD 1.13c) */
const D2_ZONE_LVL: Record<string, [number, number, number]> = {
  tristram: [6, 39, 76],
  tombs: [17, 49, 80],
  river: [27, 57, 85],
  a4_steppes: [26, 56, 82],
  a4_plains: [26, 56, 83],
  a4_city: [27, 57, 84],
  a4_river: [27, 57, 85],
  a4_chaos: [28, 58, 85],
  countess: [7, 42, 79],
  andariel: [12, 43, 73],
  mephisto: [25, 55, 83],
  cows: [28, 64, 81],
  chaos: [28, 58, 85],
  pindleskin: [32, 63, 83],
  eldritch: [25, 59, 81],
  nihlathak: [36, 64, 84],
  ancients: [37, 68, 87],
  baal: [43, 66, 85],
  uber_lilith: [50, 75, 83],
  uber_duriel: [50, 75, 83],
  uber_izual: [50, 75, 83],
  uber_tristram: [50, 75, 83],
  a2_harem1: [13, 47, 78],
  a2_tomb1: [17, 49, 80],
  a2_tomb2: [17, 49, 80],
  a2_tomb3: [17, 49, 80],
  a2_tomb4: [17, 49, 80],
  a2_tomb5: [17, 49, 80],
  a2_tomb6: [17, 49, 80],
  a2_tomb7: [17, 49, 80],
  a3_durance3: [25, 55, 83],
  a5_summit: [37, 68, 87],
  a5_temple: [32, 63, 83],
  a5_vaught: [36, 64, 84],
  a5_throne: [43, 66, 85],
};
/* ---- fin du bloc généré ---- */
/** Niveaux d'une zone de D2_ZONE_LVL (copie) ; `normal` : niveau en Normal propre au jeu (plafond d'une zone adaptative) */
const zl = (id: string, normal?: number): [number, number, number] => {
  const l = D2_ZONE_LVL[id];
  return [normal ?? l[0], l[1], l[2]];
};

/**
 * Per-run director of a game mode (lot 273, S0): created once per run (first simulation step), then called every step after the world
 * (`RunState.update`) and on each monster killed (`RunState.onKill`, before the run's own end check). A run without one (every run of
 * the base) behaves as before.
 */
export interface RunDirector {
  tick(w: World): void;
  onKill?(w: World, m: Monster): void;
  /**
   * State of the director to keep with the run in the save (`SaveData.run.modState`, lot 279): plain JSON, read back by `restore` when the
   * run is resumed (`RunDef.resumeOnLoad`). Absent: nothing is written (the save keeps exactly its former shape).
   */
  snapshot?(): unknown;
  /** Called once, right after the director is made for a resumed run, with what `snapshot` returned */
  restore?(state: unknown): void;
}

export interface RunDef {
  id: string;
  name: string;
  /** Clé pour le TC de runes et l'ambiance */
  zoneKey: string;
  desc: string;
  /** Niveau des monstres par difficulté (maximum si la zone est adaptative) */
  zoneLevel: [number, number, number];
  /**
   * Zone d'entrée adaptative : niveau des monstres = niveau du personnage borné [min, max].
   * Seule Tristram Normal l'utilise : c'est la première zone du jeu, jouable dès le niveau 1.
   */
  adaptive?: [[number, number] | null, [number, number] | null, [number, number] | null];
  /** Niveau conseillé (= déblocage) par difficulté */
  recLevel: [number, number, number];
  /** Ce que la run rapporte en priorité */
  focus: 'xp' | 'items' | 'both';
  /** Monstre dont la mort termine la run */
  boss: string;
  build: (seed: number, difficulty: Difficulty) => ZoneDef;
  /**
   * Lot 312: the same build in steps (src/data/zones/steps.ts), for a zone of an outdoor chain joined edge to edge: its world is built behind
   * the play, a few milliseconds per idle period, while the hero walks toward it. Absent: `build`, at once
   */
  buildSteps?: (seed: number, difficulty: Difficulty) => Steps<ZoneDef>;
  /** Le bot de progression ne choisit pas cette run (farm de boss d'Acte V : le benchmark de progression reste sur les runs d'origine) */
  botSkip?: boolean;
  /** Zone d'une campagne (« act4 ») : absente de la liste Rush, atteinte par les portails de la campagne et son menu */
  campaign?: string;
  /** zone de campagne avec un point de passage (voir waypoints.ts) */
  waypoint?: boolean;
  /** zone de campagne qui reprend la récompense de premier passage d'une run d'origine */
  rewardAs?: string;
  /** Absente du menu du point de passage : on y entre par un portail du Cube (Pandémonium) */
  hidden?: boolean;
  /** Game mode: a death abandons the run (no portal back to it, no body waiting in it); base: the run waits behind the town's portal */
  abandonOnDeath?: boolean;
  /** Game mode (lot 289): leaving the run for the town abandons it too, for this character (a roguelite run ends there); base: never */
  abandonOnLeave?: (c: CharacterState) => boolean;
  /** Game mode: the run's director (waves, events, end), see `RunDirector` */
  director?: (w: World, run: RunState) => RunDirector;
  /**
   * Game mode: a run in progress (or left behind a portal) is resumed when the character is loaded again, with its director's state
   * (`RunDirector.snapshot`); base: absent, a reconnection always starts in town (D2) and the run is lost. A function: by character
   * (lot 298: a game mode whose runs always start again from the beginning in one of its variants)
   */
  resumeOnLoad?: boolean | ((c: CharacterState) => boolean);
  /** Récompense du premier passage par difficulté (vide : en D2 les points et résistances viennent des quêtes, voir data/quests.ts) */
  firstClear: { skillPoints?: number; statPoints?: number; resAll?: number; respec?: number };
}

export const RUNS: RunDef[] = [
  {
    id: 'tristram',
    name: 'Tristram',
    zoneKey: 'tristram',
    desc: 'Le village ravagé. Terrain ouvert, Griswold le Maudit hante sa forge.',
    zoneLevel: zl('tristram', 16),
    adaptive: [[1, 16], null, null],
    recLevel: [1, 36, 60],
    focus: 'xp',
    boss: 'griswold',
    build: (seed, d) => buildTristram(seed, d),
    firstClear: {},
  },
  {
    id: 'tombs',
    name: 'Tombeaux de Tal Rasha',
    zoneKey: 'tombs',
    desc: 'Un des sept tombeaux, labyrinthe de grès peuplé de momies et de scarabées. Un seul est le vrai : Duriel y attend.',
    zoneLevel: zl('tombs'),
    recLevel: [16, 42, 70],
    focus: 'xp',
    boss: 'duriel',
    build: (seed, d) => buildTombs(seed, d),
    firstClear: {},
  },
  {
    id: 'river',
    name: 'Fleuve de flammes',
    zoneKey: 'chaos',
    desc: "Le labyrinthe de lave de l'Acte IV : les gardes de Diablo et, au bout, Héphasto le Forgeron.",
    zoneLevel: zl('river'),
    recLevel: [22, 48, 75],
    focus: 'items',
    boss: 'hephasto',
    build: (seed, d) => buildRiver(seed, d),
    firstClear: {},
  },
  {
    id: 'a4_fortress',
    name: 'Forteresse du Pandémonium',
    zoneKey: 'tristram',
    desc: "Le bastion de l'Acte IV : calme avant la descente vers le Chaos.",
    zoneLevel: [1, 1, 1],
    recLevel: [1, 1, 1],
    focus: 'both',
    boss: '',
    build: (seed, d) => buildA4('a4_fortress', seed, d),
    buildSteps: (seed, d) => buildA4Steps('a4_fortress', seed, d),
    firstClear: {},
    botSkip: true,
    campaign: 'act4',
    waypoint: WAYPOINT_ZONES.has('a4_fortress'),
  },
  {
    id: 'a4_steppes',
    name: 'Marches extérieures',
    zoneKey: 'chaos',
    desc: 'Plateau désolé aux portes de la Forteresse.',
    zoneLevel: zl('a4_steppes'),
    recLevel: [24, 52, 78],
    focus: 'both',
    boss: '',
    build: (seed, d) => buildA4('a4_steppes', seed, d),
    buildSteps: (seed, d) => buildA4Steps('a4_steppes', seed, d),
    firstClear: {},
    botSkip: true,
    campaign: 'act4',
    waypoint: WAYPOINT_ZONES.has('a4_steppes'),
  },
  {
    id: 'a4_plains',
    name: 'Plaines du désespoir',
    zoneKey: 'chaos',
    desc: 'Les plaines où Izual est enchaîné.',
    zoneLevel: zl('a4_plains'),
    recLevel: [25, 53, 79],
    focus: 'both',
    boss: '',
    build: (seed, d) => buildA4('a4_plains', seed, d),
    buildSteps: (seed, d) => buildA4Steps('a4_plains', seed, d),
    firstClear: {},
    botSkip: true,
    campaign: 'act4',
    waypoint: WAYPOINT_ZONES.has('a4_plains'),
  },
  {
    id: 'a4_city',
    name: 'Cité des damnés',
    zoneKey: 'chaos',
    desc: 'Ruines grouillantes de damnés et de familiers.',
    zoneLevel: zl('a4_city'),
    recLevel: [26, 54, 80],
    focus: 'both',
    boss: '',
    build: (seed, d) => buildA4('a4_city', seed, d),
    buildSteps: (seed, d) => buildA4Steps('a4_city', seed, d),
    firstClear: {},
    botSkip: true,
    campaign: 'act4',
    waypoint: WAYPOINT_ZONES.has('a4_city'),
  },
  {
    id: 'a4_river',
    name: 'Fleuve de flammes',
    zoneKey: 'chaos',
    desc: 'Le labyrinthe de lave, Héphasto le Forgeron en son fond.',
    zoneLevel: zl('a4_river'),
    recLevel: [27, 55, 81],
    focus: 'both',
    boss: '',
    build: (seed, d) => buildA4('a4_river', seed, d),
    buildSteps: (seed, d) => buildA4Steps('a4_river', seed, d),
    firstClear: {},
    botSkip: true,
    campaign: 'act4',
    waypoint: WAYPOINT_ZONES.has('a4_river'),
  },
  {
    id: 'a4_chaos',
    name: 'Sanctuaire du Chaos',
    zoneKey: 'chaos',
    desc: 'Les cinq sceaux, puis Diablo.',
    zoneLevel: zl('a4_chaos'),
    recLevel: [28, 56, 82],
    focus: 'both',
    boss: 'diablo',
    build: (seed, d) => buildA4('a4_chaos', seed, d),
    buildSteps: (seed, d) => buildA4Steps('a4_chaos', seed, d),
    firstClear: {},
    botSkip: true,
    campaign: 'act4',
    waypoint: WAYPOINT_ZONES.has('a4_chaos'),
    rewardAs: 'chaos',
  },
  {
    id: 'countess',
    name: 'La Comtesse',
    zoneKey: 'countess',
    desc: "Les caves de la Tour oubliée : la Comtesse et ses Traqueurs sombres. Elle lâche toujours des runes (jusqu'à Runes 12 en Enfer).",
    zoneLevel: zl('countess'),
    recLevel: [5, 36, 68],
    focus: 'items',
    boss: 'countess',
    build: (seed, d) => buildCountess(seed, d),
    firstClear: {},
  },
  {
    id: 'andariel',
    name: 'Andariel',
    zoneKey: 'andariel',
    desc: "Les Catacombes : Andariel, la Vierge de l'angoisse, lance ses traits et son souffle de poison. Le feu la blesse (−50 % de résistance).",
    zoneLevel: zl('andariel'),
    recLevel: [14, 42, 70],
    focus: 'items',
    boss: 'andariel',
    build: (seed, d) => buildAndariel(seed, d),
    firstClear: {},
  },
  {
    id: 'mephisto',
    name: 'Méphisto',
    zoneKey: 'mephisto',
    desc: "La Durance de la haine : Méphisto, seigneur de la Haine, frappe d'éclairs, de glace et de poison.",
    zoneLevel: zl('mephisto'),
    recLevel: [26, 54, 78],
    focus: 'items',
    boss: 'mephisto',
    build: (seed, d) => buildMephisto(seed, d),
    firstClear: {},
  },
  {
    id: 'cows',
    name: 'Niveau des Vaches',
    zoneKey: 'cows',
    desc: 'Une prairie infestée de Bovins infernaux en troupeaux serrés. Le Roi des Vaches règne au fond du pré.',
    zoneLevel: zl('cows'),
    recLevel: [24, 56, 74],
    focus: 'both',
    boss: 'cow_king',
    // accès D2 par le Cube (Jambe de Wirt + Tome de portail), et aussi depuis le menu de farm (choix du joueur : pas besoin de la recette)
    build: (seed, d) => buildCows(seed, d),
    firstClear: {},
  },
  {
    id: 'chaos',
    name: 'Sanctuaire du Chaos',
    zoneKey: 'chaos',
    desc: 'Le pentagramme de Diablo : brisez les trois sceaux, tuez leurs gardiens (Vizir, De Seis, Infecteur), puis affrontez Diablo au centre.',
    zoneLevel: zl('chaos'),
    recLevel: [30, 56, 76],
    focus: 'both',
    boss: 'diablo',
    build: (seed, d) => buildChaos(seed, d),
    firstClear: {},
  },
  {
    id: 'pindleskin',
    botSkip: true,
    name: 'Pindleskin',
    zoneKey: 'pindleskin',
    desc: "L'entrée du Temple de Nihlathak : Pindleskin, le Guerrier souillé, et sa garde. Un classique du farm de runes et d'objets.",
    zoneLevel: zl('pindleskin'),
    recLevel: [34, 58, 78],
    focus: 'items',
    boss: 'pindleskin',
    build: (seed, d) => buildPindleskin(seed, d),
    firstClear: {},
  },
  {
    id: 'eldritch',
    botSkip: true,
    name: 'Eldritch et Shenk',
    zoneKey: 'eldritch',
    desc: "Les hauts plateaux glacés : Eldritch le Redresseur garde la route, Shenk le Contremaître attend au bout. Beaucoup d'objets pour peu de risque.",
    zoneLevel: zl('eldritch'),
    recLevel: [32, 56, 76],
    focus: 'items',
    boss: 'shenk',
    build: (seed, d) => buildEldritch(seed, d),
    firstClear: {},
  },
  {
    id: 'nihlathak',
    botSkip: true,
    name: 'Nihlathak',
    zoneKey: 'nihlathak',
    desc: 'Les Salles de la douleur : Nihlathak fait exploser les cadavres et lance poison et glace. Il lâche des runes élevées.',
    zoneLevel: zl('nihlathak'),
    recLevel: [40, 62, 80],
    focus: 'items',
    boss: 'nihlathak',
    build: (seed, d) => buildNihlathak(seed, d),
    firstClear: {},
  },
  {
    id: 'ancients',
    botSkip: true,
    name: 'Les Anciens',
    zoneKey: 'ancients',
    desc: "Le sommet du mont Arreat : Talic, Madawc et Korlic, les trois Anciens, doivent tous tomber. Récompenses de runes et d'objets rares.",
    zoneLevel: zl('ancients'),
    recLevel: [42, 64, 82],
    focus: 'items',
    boss: 'ancient_talic',
    build: (seed, d) => buildAncients(seed, d),
    firstClear: {},
  },
  {
    id: 'uber_lilith',
    botSkip: true,
    hidden: true,
    name: 'Antre de la Matrone',
    zoneKey: 'pandemonium',
    desc: 'Pandémonium : Lilith, mère des démons, ses succubes et ses rôdeuses corrompues. Elle lâche la corne de Diablo.',
    zoneLevel: zl('uber_lilith'),
    recLevel: [90, 90, 85],
    focus: 'items',
    boss: 'lilith',
    build: (seed, d) => buildUberLilith(seed, d),
    firstClear: {},
  },
  {
    id: 'uber_duriel',
    botSkip: true,
    hidden: true,
    name: 'Sables oubliés',
    zoneKey: 'pandemonium',
    desc: "Pandémonium : Duriel ultime, ses nuées et ses araignées. Il lâche l'œil de Baal.",
    zoneLevel: zl('uber_duriel'),
    recLevel: [90, 90, 85],
    focus: 'items',
    boss: 'uber_duriel',
    build: (seed, d) => buildUberDuriel(seed, d),
    firstClear: {},
  },
  {
    id: 'uber_izual',
    botSkip: true,
    hidden: true,
    name: 'Fournaise de la douleur',
    zoneKey: 'pandemonium',
    desc: 'Pandémonium : Izual ultime, ses surveillants, chevaliers et seigneurs démons. Il lâche la cervelle de Méphisto.',
    zoneLevel: zl('uber_izual'),
    recLevel: [90, 90, 85],
    focus: 'items',
    boss: 'uber_izual',
    build: (seed, d) => buildUberIzual(seed, d),
    firstClear: {},
  },
  {
    id: 'uber_tristram',
    botSkip: true,
    hidden: true,
    name: 'Tristram pandémoniaque',
    zoneKey: 'pandemonium',
    desc: "Pandémonium, finale : Méphisto, Diablo et Baal ultimes. Le dernier à tomber lâche la Torche du feu de l'enfer.",
    zoneLevel: zl('uber_tristram'),
    recLevel: [90, 90, 85],
    focus: 'items',
    boss: 'uber_diablo',
    build: (seed, d) => buildUberTristram(seed, d),
    firstClear: {},
  },
  {
    id: 'uber_dclone',
    botSkip: true,
    hidden: true,
    name: 'Arène du Clone',
    zoneKey: 'pandemonium',
    desc: 'Diablo marche sur la Terre : le Clone de Diablo et ses squelettes. Il lâche Annihilus.',
    zoneLevel: [50, 75, 85],
    recLevel: [90, 90, 85],
    focus: 'items',
    boss: 'dclone',
    build: (seed, d) => buildUberDclone(seed, d),
    firstClear: {},
  },
  {
    id: 'uber_ancients',
    botSkip: true,
    hidden: true,
    name: 'Sommet ultime du mont Arreat',
    zoneKey: 'pandemonium',
    desc: 'Relique des Anciens : Talic, Madawc et Korlic ultimes. Ils lâchent des Étendards des Héros.',
    zoneLevel: [50, 75, 85],
    recLevel: [90, 90, 85],
    focus: 'items',
    boss: 'uber_talic',
    build: (seed, d) => buildUberAncients(seed, d),
    firstClear: {},
  },
  {
    id: 'uber_rathma',
    botSkip: true,
    hidden: true,
    name: 'Arène de Rathma',
    zoneKey: 'pandemonium',
    desc: "Pierre du Vide : Mendeln et Rathma, maîtres des morts-vivants. Ils lâchent l'Éclat souillé, qui corrompt Annihilus.",
    zoneLevel: [50, 75, 85],
    recLevel: [90, 90, 85],
    focus: 'items',
    boss: 'rathma',
    build: (seed, d) => buildUberRathma(seed, d),
    firstClear: {},
  },
  {
    id: 'uber_lucion',
    botSkip: true,
    hidden: true,
    name: 'Antre de Lucion',
    zoneKey: 'pandemonium',
    desc: "Ombre de la haine : Lucion, mal primordial de niveau 110. Sa mort donne un Jeton de profanation (seconde corruption d'amulette).",
    zoneLevel: [50, 75, 85],
    recLevel: [90, 90, 85],
    focus: 'items',
    boss: 'lucion',
    build: (seed, d) => buildUberLucion(seed, d),
    firstClear: {},
  },
  {
    id: 'baal',
    name: 'Trône de Baal',
    zoneKey: 'baal',
    desc: 'Le Trône de la Destruction : cinq vagues de serviteurs, puis Baal dans la Chambre de la Pierre-Monde. Le vaincre ouvre la difficulté suivante.',
    zoneLevel: zl('baal'),
    // niveau minimal pour lancer la run (guides de montée en niveau, p. ex. maxroll.gg/d2/resources/general-leveling : Baal en Normal dès 25,
    // en Cauchemar dès 40, en Enfer dès 60) ; les monstres gardent leur niveau de zone. Les bots gardent leurs niveaux d'origine (BOT_BAAL_LEVEL).
    recLevel: [25, 40, 60],
    focus: 'both',
    boss: 'baal',
    build: (seed, d) => buildBaal(seed, d),
    firstClear: {},
  },
  // campagne de l'Acte V : une zone par étape (zones et niveaux de Levels.txt ; zones de farm d'origine reprises avec leur récompense)
  ...ACT5_STEPS.map((st): RunDef => {
    const fixed: Record<string, [number, number, number]> = { a5_town: [1, 1, 1], a5_summit: zl('a5_summit'), a5_temple: zl('a5_temple'), a5_vaught: zl('a5_vaught'), a5_throne: zl('a5_throne') };
    const l = fixed[st.id] ?? A5_LEVELS[st.id]?.lvl ?? [29, 61, 82];
    const alias: Record<string, string> = { a5_summit: 'ancients', a5_temple: 'pindleskin', a5_vaught: 'nihlathak', a5_throne: 'baal' };
    return {
      id: st.id,
      name: st.name,
      zoneKey: alias[st.id] ?? 'nihlathak',
      desc: `Acte V : ${st.name}.`,
      zoneLevel: [l[0], l[1], l[2]],
      recLevel: [Math.max(1, l[0] - 1), Math.max(2, l[1] - 3), Math.max(3, l[2] - 5)],
      focus: 'both',
      boss: '',
      build: (seed, d) => buildA5(st.id, seed, d),
      buildSteps: (seed, d) => buildA5Steps(st.id, seed, d),
      firstClear: {},
      botSkip: true,
      campaign: 'act5',
      waypoint: WAYPOINT_ZONES.has(st.id),
      rewardAs: alias[st.id],
    };
  }),
  // campagne de l'Acte III : une zone par étape (zones et niveaux de Levels.txt)
  ...ACT3_STEPS.map((st): RunDef => {
    const fixed: Record<string, [number, number, number]> = { a3_town: [1, 1, 1], a3_durance3: zl('a3_durance3') };
    const l = fixed[st.id] ?? A3_LEVELS[st.id]?.lvl ?? [21, 50, 80];
    return {
      id: st.id,
      name: st.name,
      zoneKey: st.id === 'a3_durance3' ? 'mephisto' : 'tristram',
      desc: `Acte III : ${st.name}.`,
      zoneLevel: [l[0], l[1], l[2]],
      recLevel: [Math.max(1, l[0] - 1), Math.max(2, l[1] - 3), Math.max(3, l[2] - 5)],
      focus: 'both',
      boss: '',
      build: (seed, d) => buildA3(st.id, seed, d),
      buildSteps: (seed, d) => buildA3Steps(st.id, seed, d),
      firstClear: {},
      botSkip: true,
      campaign: 'act3',
      waypoint: WAYPOINT_ZONES.has(st.id),
      rewardAs: st.id === 'a3_durance3' ? 'mephisto' : undefined,
    };
  }),
  // campagne de l'Acte II : une zone par étape (zones et niveaux de Levels.txt)
  ...ACT2_STEPS.map((st): RunDef => {
    const fixed: Record<string, [number, number, number]> = {
      a2_town: [1, 1, 1],
      a2_harem1: zl('a2_harem1'),
      a2_tomb1: zl('a2_tomb1'),
      a2_tomb2: zl('a2_tomb2'),
      a2_tomb3: zl('a2_tomb3'),
      a2_tomb4: zl('a2_tomb4'),
      a2_tomb5: zl('a2_tomb5'),
      a2_tomb6: zl('a2_tomb6'),
      a2_tomb7: zl('a2_tomb7'),
    };
    const l = fixed[st.id] ?? A2_LEVELS[st.id]?.lvl ?? [14, 44, 76];
    return {
      id: st.id,
      name: st.name,
      zoneKey: st.id.startsWith('a2_tomb') ? 'tombs' : 'tristram',
      desc: `Acte II : ${st.name}.`,
      zoneLevel: [l[0], l[1], l[2]],
      recLevel: [Math.max(1, l[0] - 1), Math.max(2, l[1] - 3), Math.max(3, l[2] - 5)],
      focus: 'both',
      boss: '',
      build: (seed, d) => buildA2(st.id, seed, d),
      ...(A2_CHAIN.includes(st.id) ? { buildSteps: (seed: number, d: Difficulty) => buildA2Steps(st.id, seed, d) } : {}),
      firstClear: {},
      botSkip: true,
      campaign: 'act2',
      waypoint: WAYPOINT_ZONES.has(st.id),
      rewardAs: st.id.startsWith('a2_tomb') ? 'tombs' : undefined,
    };
  }),
  // campagne de l'Acte I : une zone par étape (zones et niveaux de Levels.txt)
  ...ACT1_STEPS.map((st): RunDef => {
    const l = a1Level(st.id);
    return {
      id: st.id,
      name: st.name,
      zoneKey:
        st.id === 'a1_countess'
          ? 'countess'
          : st.id === 'a1_andariel'
            ? 'andariel'
            : st.id === 'a1_tristram'
              ? 'tristram'
              : /crypt|mausoleum|cellar|cata|jail|barracks|cave|pit|hole|underpass|den/.test(st.id)
                ? 'andariel'
                : 'tristram',
      desc: `Acte I : ${st.name}.`,
      zoneLevel: [l[0], l[1], l[2]],
      recLevel: [Math.max(1, l[0] - 1), Math.max(2, l[1] - 3), Math.max(3, l[2] - 5)],
      focus: 'both',
      boss: '',
      build: (seed, d) => buildA1(st.id, seed, d),
      buildSteps: (seed, d) => buildA1Steps(st.id, seed, d),
      firstClear: {},
      botSkip: true,
      campaign: 'act1',
      waypoint: WAYPOINT_ZONES.has(st.id),
      rewardAs: st.id === 'a1_tristram' ? 'tristram' : st.id === 'a1_countess' ? 'countess' : st.id === 'a1_andariel' ? 'andariel' : undefined,
    };
  }),
];

// ordre du menu : par niveau conseillé en Normal (Tristram, Comtesse, Andariel, Tombeaux, Vaches, Méphisto, Chaos, Baal)
RUNS.sort((a, b) => a.recLevel[0] - b.recLevel[0]);

/** Niveau des monstres d'une run pour un personnage donné */
/**
 * Niveau minimal d'une run du menu Rush (hors campagne) : en Cauchemar tout le contenu est disponible dès le niveau 40, en Enfer dès le
 * niveau 60 (niveaux des guides de montée en niveau) ; une run au niveau conseillé plus bas reste disponible plus tôt.
 */
const RUSH_LEVEL_CAP: [number, number, number] = [Infinity, 40, 60];
export function rushRecLevel(r: RunDef, d: Difficulty): number {
  return Math.min(r.recLevel[d], RUSH_LEVEL_CAP[d]);
}

export function runZoneLevel(r: RunDef, d: Difficulty, clvl: number): number {
  const a = r.adaptive?.[d];
  if (a) return Math.max(a[0], Math.min(a[1], clvl));
  return r.zoneLevel[d];
}

export const RUN_BY_ID: Record<string, RunDef> = Object.fromEntries(RUNS.map((r) => [r.id, r]));
/** Ville où mène le portail d'une zone : le Camp (Acte I), la Forteresse (Acte IV) ou Harrogath */
export const townNameOf = (campaign?: string): string =>
  campaign === 'act1' ? 'le Camp des Rôdeuses' : campaign === 'act2' ? 'Lut Gholein' : campaign === 'act3' ? 'le Port de Kurast' : campaign === 'act4' ? 'la Forteresse du Pandémonium' : 'Harrogath';
