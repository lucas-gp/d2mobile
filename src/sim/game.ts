/**
 * Façade de jeu : le profil du personnage, la ville, les runs, les récompenses, la mort,
 * l'allocation des points, la réinitialisation, le marchand. C'est l'unique point d'entrée
 * de l'interface, du hook de debug et des bots (qui n'appellent jamais le rendu).
 */
import { MERCS, mercHireCost, mercResurrectCost, mercUnlockLevel, mercVariantsAt, type MercId, type MercSlot, type MercType, type MercVariant } from '../data/mercs';
import { canMercEquip, mercOf, refreshMerc, spawnMerc, teleportMerc } from './merc';
import { hashSeed, Rng } from '../core/rng';
import type { Difficulty, Slot } from '../data/types';
import { DIFF_NAMES } from '../data/types';
import { RUN_BY_ID, RUNS, runZoneLevel, rushRecLevel, townNameOf, type RunDef } from '../data/runs';
import type { SeamDef, ZoneDef } from '../data/zone-types';
import { buildHarrogath } from '../data/zones/harrogath';
import { buildA1, buildA1Steps, act1Available } from '../data/zones/act1';
import { buildA4, act4Available } from '../data/zones/act4';
import { buildA2, buildA2Steps, act2Available } from '../data/zones/act2';
import { buildA3, buildA3Steps, act3Available } from '../data/zones/act3';
import { actLock, completeQuest, migrateQuestLocks, onMonsterDeath, onZoneEnter, questDone, questLock, talkTo, tryQuestLock, useQuestObject } from './quests';
import { QUEST_BY_ID, QUEST_PORTALS, TRAVELERS } from '../data/quests';
import { POTION_PRICES, VENDOR_CLASS_TYPES, VENDORS, vendorPotionTier, type VendorDef } from '../data/vendors';
import { POTION_LEVELS } from './potion-tier';
import { CAMPAIGNS } from '../data/campaigns';
import { SKILL_BY_ID } from '../data/skills';
import { classOf, TREE_CLASS, type ClassId } from '../data/classes';
import { BASES, BASE_BY_ID } from '../data/items/bases';
import '../data/items/index';
import type { SimEvent } from './events';
import { FILTER_PRESETS, STASH_TAB_SIZE, STASH_TABS, newCharacter, type CharacterState, type FilterPreset, type LootFilterSettings } from './character';
import { World } from './world';
import { SeamWorlds, stripMirrors, type SeamHost } from './seam-worlds';
import { freeIdBase, ZoneKeep } from './zone-keep';
import { runSteps, type Steps } from '../data/zones/steps';
import { shiftEvent } from './events';
import { RunState } from './runs';
import { sortAllStash, sortStashPage, takeSnapshot, restoreSnapshot, stashSignature, type StashSnapshot } from './stash-sort';
import { stashAllFromBag, type StashAllOptions, type StashAllResult } from './stash-all';
import type { OrphanItem } from './save-orphans';
import { DEFAULT_RULESET, SAVE_VERSION, SHARED_TABS, MAX_SHARED_TABS, placeInSharedTabs, emptyShared, withDefaultSettings, type SaveData, type Settings, type SharedStash } from './save';
import { deathGoldLoss, deathPenalty } from './progression';
import {
  VENDOR_COLS,
  VENDOR_ROWS,
  stashOrder,
  placeIn,
  equipFromInventory,
  unequip,
  addToCharacter,
  hasRoomInStash,
  placeInStash,
  relayoutStash,
  hasRoomFor,
  placeInInventory,
  repairInventory,
  moveToStash,
  moveFromStash,
  moveItem,
  type GridRef,
  sortInventory,
  stowCharm,
  unstowCharm,
  setInventoryRows,
  padInventory,
  resizeInventory,
  INV_BASE_ROWS,
  INV_BIG_ROWS,
} from './inventory';
import type { Item } from './item';
import { baseOf, itemFinal } from './itemstats';
import { isThrowPotion, addThrowPotions } from './throwpotion';
import { THROW_STACK_MAX } from '../data/throwpotions';
import { generateItem, lootBaseAllowed, makeStack, maxSocketsForIlvl } from './loot/itemgen';
import { TERRAIN_RADIUS, TICK_HZ } from './constants';
import { mapName } from './mapinfo';
import { RULES } from '../mods/rules';
import { MAP_ZONE_BY_ID, MAP_ZONES } from '../data/maps';
import { socketItem, type SocketResult } from './socket';
import { repairAll, repairAllCost } from './durability';
import {
  cubeMatches,
  cubeRunGrid,
  cubeTransmute,
  corruptWithShard,
  corruptRefItem,
  addSocketsWith,
  stashBagMaps,
  type MergeOpts,
  type MergeResult,
  type MapRef,
  type MapOpId,
  type CorruptRef,
  type CubeResult,
} from './cube';
import { cubeAdd, cubeFromTab, withdrawToCell, cubeItems, matCount, cubeRemove, depositAll, depositToTab, stashLooseItems, withdrawFromTab } from './materials';
import { resetUidCounter } from './item';
import { carryOver } from './druid';
import { buildBaalChamber, buildDurielLair } from '../data/zones/baal';
import { activeRuleset } from '../mods/activate';

export type GameMode = 'town' | 'run';

/** Niveau minimal pour ouvrir une carte */
export const MAP_MIN_LEVEL = 75;

export interface VendorEntry {
  item: Item;
  price: number;
}

/** An unknown item of the gamble stall: its base and price */
export interface GambleEntry {
  base: string;
  price: number;
}

/** Nombre d'objets gardés dans l'onglet « Racheter » du marchand */
export const BUYBACK_MAX = 24;

/**
 * Sauvegardes d'avant les arbres du jeu de règles : compétences renommées reportées sur leur équivalent (règle `skills.renames` : celles
 * d'un mod), compétences disparues remboursées en points à dépenser, barre de raccourcis nettoyée.
 */
export function migrateSkills(c: CharacterState): void {
  const renames = RULES['skills.renames']();
  for (const [old, now] of Object.entries(renames)) {
    if (c.skills[old] === undefined) continue;
    c.skills[now] = (c.skills[now] ?? 0) + c.skills[old];
    delete c.skills[old];
  }
  for (const id of Object.keys(c.skills)) {
    if (SKILL_BY_ID[id]) continue;
    c.skillPoints += c.skills[id] ?? 0;
    delete c.skills[id];
  }
  const known = (id: string | null): boolean => !id || id === 'attack' || !!SKILL_BY_ID[id];
  const ren = (id: string | null): string | null => (id && renames[id]) || id;
  c.hotbar.primary = ren(c.hotbar.primary) ?? 'attack';
  c.hotbar.slots = c.hotbar.slots.map(ren);
  if (!known(c.hotbar.primary)) c.hotbar.primary = 'attack';
  c.hotbar.secondary = ren(c.hotbar.secondary ?? 'attack') ?? 'attack';
  if (!known(c.hotbar.secondary)) c.hotbar.secondary = 'attack';
  c.hotbar.slots = c.hotbar.slots.map((id) => (known(id) ? id : null));
}

/**
 * Façade de la simulation : personnage, ville ou run en cours (`world`), marchand, coffre (personnel et partagé), Cube, cartes, mercenaire,
 * sauvegarde. L'interface et l'application n'agissent sur le jeu que par ses méthodes ; `step(n)` avance le monde de n ticks (1/25 s).
 */
export class Game implements SeamHost {
  character: CharacterState;
  settings: Settings;
  world!: World;
  mode: GameMode = 'town';
  runDef: RunDef | null = null;
  difficulty: Difficulty = 0;
  runSeed = 0;
  runCounter = 0;
  /** Jeu de règles du personnage (voir SaveData.ruleset) : repris de la sauvegarde ; pour un nouveau personnage, celui de la session (`pd2` sans activation) ; jamais changé ensuite */
  readonly ruleset: string;
  /** Objets illisibles mis de côté au chargement (SaveData.orphans, save-orphans.ts) : gardés tels quels et réécrits à chaque sauvegarde */
  orphans: OrphanItem[];
  /** Même chose pour le coffre partagé attaché (SharedStash.orphans) */
  sharedOrphans: OrphanItem[] = [];
  /** Zone corrompue (PD2) : la run en cours est une version de niveau 85 en Enfer, plus dure, qui lâche des éclats de Pierre-Monde */
  corrupt = false;
  /** Carte en cours (sauvegardée avec la run) */
  activeMap: Item | null = null;
  vendor: VendorEntry[] = [];
  /** Onglet « Racheter » du marchand : les derniers objets vendus (le plus récent d'abord), rachetables au prix de vente ; pas sauvegardé */
  buyback: VendorEntry[] = [];
  /** Compteur de graines d'artisanat : une valeur par tentative (voir SaveData.craftSeq) ; remplace l'or, qu'un joueur pouvait changer pour relancer le résultat */
  craftSeq = 0;
  /** Acte de la dernière ville visitée (« act1 »…« act5 ») : sauvegardée, on y réapparaît après une reconnexion ; un nouveau personnage commence dans le Camp (Acte I) */
  lastTown = 'act5';
  /** Run laissée derrière un portail (mort ou retour en ville) : on peut y retourner par le portail de Harrogath */
  /** Save a game mode's run was resumed from (`RunDef.resumeOnLoad`), until its first step: `rebuildResumedRun` */
  private resumedFrom: SaveData | null = null;
  /** Reprise de la run en cours au chargement (tests de sauvegarde seulement) */
  static resumeOnLoad = false;
  private suspended: { world: World; runDef: RunDef; activeMap: Item | null; difficulty: Difficulty; runSeed: number; corrupt: boolean } | null = null;
  /** Tick de mort du joueur (retour automatique en ville après délai) */
  private deathAt = -1;
  /** Écouteurs d'événements (rendu, audio, interface) */
  private listeners: ((e: SimEvent) => void)[] = [];
  /**
   * Skill offers waiting for a choice (rule `skills.offer`, lot 273): one per level gained while a game mode makes offers, oldest first;
   * `rerolls` counts the rerolls of that level. Empty in the base (free allocation). Not saved: a closed game keeps the skill point.
   */
  readonly offers: { level: number; ids: string[]; rerolls: number }[] = [];
  /**
   * Lot 312: the zones joined edge to edge alive together (src/sim/seam-worlds.ts): the neighbours near a seam built ahead, simulated beside
   * the zone, their entities shown in it; crossing swaps the roles (no new world, nothing rolled again)
   */
  readonly seams: SeamWorlds = new SeamWorlds(this);
  /**
   * Lot 316: the Campaign's zones kept for the session (src/sim/zone-keep.ts): a zone left is found again as it was (Diablo II keeps a
   * game's levels until the game is left); not saved, a reload builds them again
   */
  readonly kept = new ZoneKeep();
  /** Dernier temps de run terminé (pour l'écran de fin) */
  lastRunSummary: { runId: string; seconds: number; kills: number; difficulty: Difficulty } | null = null;

  constructor(save?: SaveData, classId: ClassId = 'sorceress', app = false) {
    this.character = save?.character ?? newCharacter(undefined, classId);
    this.ruleset = save?.ruleset ?? activeRuleset() ?? DEFAULT_RULESET;
    this.orphans = save?.orphans ?? [];
    // réglages d'abord : la taille de l'inventaire en dépend (`app` = défauts de l'application, dont le grand inventaire)
    this.settings = withDefaultSettings(save?.settings, app);
    setInventoryRows(this.settings.bigInventory === true ? INV_BIG_ROWS : INV_BASE_ROWS);
    padInventory(this.character);
    // lot 319: a save of before the quest locks keeps the passages it went through; a new character is marked (every lock of Diablo II)
    migrateQuestLocks(this.character);
    if (save) {
      migrateSkills(this.character);
      repairInventory(this.character);
      this.character.stash = this.character.stash.map(relayoutStash);
    }
    this.runCounter = save?.runCounter ?? 0;
    this.craftSeq = save?.craftSeq ?? 0;
    if (!save) {
      // équipement de départ : bâton court, premier sort de la classe appris (Trait de feu, Tempête de feu)
      const c = this.character;
      const start = classOf(c.classId).startSkill;
      // armes de départ D2 : bâton (Sorcière, Druide), hachette (Barbare), épée courte et bouclier (Paladin), arc (Amazone), katar (Assassin), baguette (Nécromancien)
      const START: Record<ClassId, [string, string?]> = {
        sorceress: ['short_staff'],
        druid: ['short_staff'],
        barbarian: ['hand_axe'],
        paladin: ['short_sword', 'buckler'],
        amazon: ['short_bow'],
        assassin: ['katar'],
        necromancer: ['wand'],
      };
      const [wep, off] = START[c.classId];
      c.equipment.mainhand = generateItem(new Rng('start'), wep, 1, { forceQuality: 'normal' });
      if (off) c.equipment.offhand = generateItem(new Rng('start-off'), off, 1, { forceQuality: 'normal' });
      c.skills[start] = 1;
      c.skillPoints = 0;
      c.hotbar.primary = start;
      c.hotbar.slots[0] = 'attack';
    }
    // comme dans Diablo II : se reconnecter ramène toujours en ville (Harrogath), jamais au milieu d'une run ni dans un mur ;
    // la reprise en pleine run n'existe que pour les tests de sauvegarde (`Game.resumeOnLoad`)
    // game mode (`RunDef.resumeOnLoad`, lot 279): its run is resumed, with its director's state, so closing the app never loses it
    const resumeRule = save?.run ? RUN_BY_ID[save.run.runId]?.resumeOnLoad : undefined;
    const resumable = !!save && (typeof resumeRule === 'function' ? resumeRule(save.character) : !!resumeRule);
    if ((Game.resumeOnLoad || resumable) && save?.run && (RUN_BY_ID[save.run.runId] || (save.run.runId === 'map' && save.run.mapItem))) {
      this.resumeRun(save);
      if (resumable && !save.run.suspended) this.resumedFrom = save;
      if (save.run.suspended) this.enterTown();
    } else {
      this.enterTown();
    }
    this.lastTown = save ? (save.town ?? 'act5') : 'act1';
    // the game's first stall, for the town the hero starts in (the seed of before lot 316)
    this.vendorKey = null;
    this.vendorSeq = 0;
    this.visitVendor();
  }

  /** Abonne `fn` aux événements de simulation traités par `step` ; rend la fonction de désabonnement */
  onEvent(fn: (e: SimEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  /* ------------------------------------------------------------------ */
  /* Zones                                                               */
  /* ------------------------------------------------------------------ */

  /** Ville du portail : le Camp (Acte I) ou la Forteresse (Acte IV) pour une zone de campagne, sinon Harrogath */
  townName(runDef: RunDef | null = this.runDef): string {
    return townNameOf(runDef?.campaign);
  }

  /** Reconstruit la ville où l'on se trouve (cartes de ville chargées en retard) sans changer d'acte */
  refreshTown(): void {
    if (this.mode === 'town') this.enterTown(this.lastTown);
  }

  /** `campaign` : ville d'un acte imposée (départ d'un nouveau personnage dans le Camp des Rôdeuses) ; Harrogath si les cartes de l'acte manquent */
  enterTown(campaign?: string): void {
    this.stashLoose();
    const fromDef = this.mode === 'run' ? this.runDef : null;
    const camp = campaign ?? this.runDef?.campaign;
    const hub = camp === 'act1' ? 'a1_town' : camp === 'act2' ? 'a2_town' : camp === 'act3' ? 'a3_town' : camp === 'act4' ? 'a4_fortress' : null;
    // une run inachevée reste derrière un portail (butin au sol, monstres, progression) ; une run terminée est oubliée,
    // sauf si l'on est mort (D2 : le corps et le butin attendent dans la zone, même boss tué) ; la run terminée garde `completed`
    // (pas de boss ni de récompense de première victoire en double). Rechargement de l'application : `resumeOnLoad` reste faux, la zone est perdue.
    const died = this.mode === 'run' && !!this.world?.player.dead;
    // cartes : le portail reste aussi après la mort du boss et un retour volontaire en ville (finir de ramasser le butin, vendre puis revenir)
    const mapRun = this.world?.run?.runId === 'map';
    // game mode (`RunDef.abandonOnDeath`): a death abandons the run, it starts again from the waypoint
    const abandon = (died && !!this.runDef?.abandonOnDeath) || (this.mode === 'run' && !!this.runDef?.abandonOnLeave?.(this.character));
    if (this.mode === 'run' && this.runDef && this.world && !abandon && (!this.world.run?.completed || died || mapRun)) {
      this.suspended = { world: this.world, runDef: this.runDef, activeMap: this.activeMap, difficulty: this.difficulty, runSeed: this.runSeed, corrupt: this.corrupt };
    } else if (this.mode === 'run') this.suspended = null;
    // lot 316: the zone of the Campaign left (dead or alive) kept for the session
    if (this.mode === 'run') this.keepZone(this.world);
    this.campaignActive = hub ? (camp ?? null) : null;
    this.lastTown = camp ?? 'act5';
    this.mode = 'town';
    this.runDef = null;
    this.activeMap = null;
    this.corrupt = false;
    this.grantAnyaMaps();
    const prev = this.world as World | undefined;
    const hubOk = hub === 'a1_town' ? act1Available() : hub === 'a2_town' ? act2Available() : hub === 'a3_town' ? act3Available() : hub === 'a4_fortress' ? act4Available() : false;
    const hubZone = hub && hubOk ? (hub === 'a1_town' ? buildA1(hub, 1, 0) : hub === 'a2_town' ? buildA2(hub, 1, 0) : hub === 'a3_town' ? buildA3(hub, 1, 0) : buildA4(hub, 1, 0)) : null;
    this.world = new World({ zone: hubZone ?? buildHarrogath(), seed: 1, difficulty: this.difficulty, zoneLevel: 1, character: this.character, idBase: this.idBase() });
    if (prev) {
      carryOver(prev, this.world);
      // lot 316: Diablo II heals in town by its healer (Akara, Fara, Ormus, Jamella, Malah), not on arrival; a death still comes back whole
      if (keepsVitals(fromDef, null)) carryVitals(prev, this.world);
    }
    if (this.suspended) {
      const at = this.world.grid.nearestFree(this.world.zone.start.x + 2.5, this.world.zone.start.y - 1.5, 6) ?? this.world.zone.start;
      this.world.objects.push({ id: this.world.newId(), kind: 'portal', x: at.x, y: at.y, radius: 1, used: false, ref: 'run', label: `Portail vers ${this.suspended.runDef.name}` });
    }
    this.world.events.push({ t: 'zoneEnter', zone: hubZone ? hubZone.id : 'harrogath' });
    this.deathAt = -1;
    // lot 316 (owner): no corpse; the portal brings him back to the zone of his death
    if (died && this.suspended) this.world.events.push({ t: 'message', text: `Un portail vous ramène dans ${this.suspended.runDef.name}.`, color: '#e8b04a' });
    // lot 316: the stall is renewed on a change of act (Diablo II's act hopping) or difficulty, not at every visit
    this.visitVendor();
  }

  /** Runs disponibles pour le menu du point de passage */
  runOptions(): { run: RunDef; difficulty: Difficulty; unlocked: boolean; reason?: string }[] {
    const out: { run: RunDef; difficulty: Difficulty; unlocked: boolean; reason?: string }[] = [];
    const c = this.character;
    for (const run of RUNS) {
      if (run.hidden || run.campaign) continue;
      for (const d of [0, 1, 2] as Difficulty[]) {
        const need = rushRecLevel(run, d);
        let unlocked = c.level >= need;
        let reason: string | undefined;
        if (!unlocked) reason = `Niveau ${need} requis`;
        if (d > c.progression.highestDifficulty) {
          unlocked = false;
          reason = `Tuez Baal en ${DIFF_NAMES[d - 1]}`;
        }
        const wait = unlocked ? this.runGate?.(run.id) : null;
        if (wait) {
          unlocked = false;
          reason = wait;
        }
        out.push({ run, difficulty: d, unlocked, reason });
      }
    }
    return out;
  }

  /** Campagne en cours (la zone ou la ville où l'on se trouve) : le point de passage s'ouvre sur son onglet */
  campaignActive: string | null = null;

  /** Point de passage touché : la zone devient une destination des autres points de passage */
  touchWaypoint(): void {
    const id = this.runDef?.campaign ? this.runDef.id : null;
    // lot 315: activated once (the first touch kept), by the simulation itself (`handle`), whatever the screen does with it
    if (id) this.character.progression.milestones[`wp:${id}`] ??= Math.round(this.character.progression.playTime);
  }

  /**
   * Zones d'une campagne ayant un point de passage : la ville (toujours) et celles dont on a touché le point de passage.
   * Lot 319: no level asked (Diablo II has none): a waypoint touched is a destination, its act open (`actLock`)
   */
  campaignZones(campaign: string): { run: RunDef; visited: boolean }[] {
    const c = this.character;
    const list = RUNS.filter((r) => r.campaign === campaign && (r.waypoint || r === RUNS.find((x) => x.campaign === campaign)));
    return list.map((run, i) => ({ run, visited: i === 0 || c.progression.milestones[`wp:${run.id}`] !== undefined }));
  }

  /**
   * Lot 319: the acts of the Campaign the waypoint lists at difficulty `d`: Act I and every act whose gate is open (Diablo II: the act's
   * boss killed before; `actLock`), in their order
   */
  openActs(d: Difficulty = this.difficulty): string[] {
    return ['act1', 'act2', 'act3', 'act4', 'act5'].filter((a) => !this.actLock(a, d));
  }

  /** Lot 320: the hero is in a zone of the Campaign (not a Rush run, a game mode's round or an endgame map) */
  inCampaignZone(): boolean {
    return this.mode === 'run' && !!this.runDef && isCampaignZone(this.runDef);
  }

  /** The zone (or campaign town) the hero is in, when it is the Campaign's (a quest lock applies there), else null */
  private campaignHere(): string | null {
    if (this.mode === 'run') return this.runDef && isCampaignZone(this.runDef) ? this.runDef.id : null;
    // lot 320: Harrogath, the Act V town (the Rush's hub too): Anya's portal to Nihlathak's Temple stands there
    return this.campaignActive || this.world.zone.id === 'harrogath' ? this.world.zone.id : null;
  }

  /** Lot 319: what keeps the passage from the zone the hero is in to `to` shut (Diablo II's quest locks), or null */
  passageLock(to: string): string | null {
    const from = this.campaignHere();
    return from ? questLock(this.character, from, to, this.difficulty) : null;
  }

  /** Portail de campagne : passe à la zone voisine (nouvelle génération, même difficulté) */
  private enterCampaignZone(id: string): boolean {
    const run = RUN_BY_ID[id];
    if (!run?.campaign) return false;
    const from = this.mode === 'run' ? this.runDef?.id : this.world.zone.id;
    // lot 319: Diablo II's quest locks (Tristram, the palace, the Canyon, the Durance, Nihlathak's temple, the Worldstone Keep): the hint, no way through
    const here = this.campaignHere();
    if (here && !tryQuestLock(this, here, id)) return false;
    this.character.progression.milestones[`zone:${id}`] = Math.round(this.character.progression.playTime);
    return this.startRun(id, this.difficulty, hashSeed(`${this.character.name}:${id}`), false, from);
  }

  /**
   * Porte de départ d'une run (mode graphismes locaux sans repli) : renvoie la raison d'attendre (cartes en préparation) ou null.
   * Posée par l'application ; la simulation n'en sait rien d'autre.
   */
  runGate: ((runId: string) => string | null) | null = null;

  /**
   * Lance la run `runId` (zone construite à la graine `seed`, corrompue si demandé) ; faux si elle est inconnue ou bloquée par `runGate`.
   * Lot 316: a zone of the Campaign has one plan per hero (`hashSeed(name:zone)` without a seed, as walking into it) and is kept for the
   * session: entered again, it is as it was left, the hero at the way back to `from` (the zone he comes from) or at its waypoint
   */
  startRun(runId: string, difficulty: Difficulty, seed?: number, corrupt = false, from?: string): boolean {
    const def = RUN_BY_ID[runId];
    if (!def) return false;
    const wait = def.campaign ? null : this.runGate?.(runId);
    if (wait) {
      this.world?.events.push({ t: 'message', text: wait, color: '#e8b04a' });
      return false;
    }
    // zone corrompue : Enfer seulement, runs de farm et d'histoire (pas les ubers)
    corrupt = corrupt && difficulty === 2 && !def.hidden;
    const fromDef = this.mode === 'run' ? this.runDef : null;
    const campaignZone = isCampaignZone(def) && !corrupt;
    if (this.mode === 'run') this.keepZone(this.world);
    // lot 316: a new difficulty is a new game (Diablo II): the zones kept are forgotten
    if (difficulty !== this.difficulty) this.kept.clear();
    this.corrupt = corrupt;
    this.runCounter++;
    this.suspended = null;
    this.runSeed = seed ?? (campaignZone ? hashSeed(`${this.character.name}:${def.id}`) : hashSeed(`${this.character.name}:${this.runCounter}`));
    const reuse = campaignZone ? this.takeZone(def.id, difficulty, this.runSeed) : null;
    this.runDef = def;
    this.campaignActive = def.campaign ?? null;
    if (def.campaign) this.character.progression.milestones[`zone:${def.id}`] ??= Math.round(this.character.progression.playTime);
    this.difficulty = difficulty;
    this.mode = 'run';
    const prev = this.world as World | undefined;
    if (reuse) {
      this.reenter(reuse, prev, from);
    } else {
      const run = new RunState(def.id, def.zoneKey, difficulty, def.boss);
      this.world = new World({
        zone: def.build(this.runSeed, difficulty),
        seed: this.runSeed,
        difficulty,
        zoneLevel: corrupt ? CORRUPT_LEVEL : runZoneLevel(def, difficulty, this.character.level),
        character: this.character,
        run,
        mapMods: corrupt ? CORRUPT_MODS : undefined,
        idBase: campaignZone ? this.idBase() : undefined,
      });
      run.totalWaves = Math.max(0, ...this.world.zone.spawns.map((s) => s.wave ?? 0));
      run.startTick = this.world.tick;
      // lot 320: a zone of the Campaign entered by a way from `from` (stairs, a cave's mouth, a portal) has the hero at its way back there,
      // as Diablo II, not at its start (the Dark Wood from the Underground Passage, the Cold Plains from the Cave…)
      const back = campaignZone && from ? this.wayBack(this.world, from) : null;
      if (back) {
        this.world.resetHero(back.x, back.y);
        this.world.refreshPlayer();
        this.world.player.hp = this.world.player.hpMax;
        this.world.player.mana = this.world.player.manaMax;
        teleportMerc(this.world, this.world.player);
      }
      if (prev) carryOver(prev, this.world);
      this.world.populate();
    }
    // lot 316: life and mana kept from zone to zone in the Campaign (Diablo II), as before elsewhere (a Rush run, a round: whole)
    if (prev && keepsVitals(fromDef, def)) carryVitals(prev, this.world);
    this.world.events.push({ t: 'zoneEnter', zone: def.id });
    onZoneEnter(this, def.id);
    // lot 315 (owner): no town portal opened on arrival in a zone of the Campaign (by a waypoint, stairs or an exit), as in Diablo II; Rush
    // runs, game modes' rounds (Survivals: hidden, with a director) and the endgame's maps keep theirs
    if (!isCampaignZone(def)) this.openPortal();
    this.deathAt = -1;
    return true;
  }

  /** Trône de Baal → Chambre de la Pierre-Monde : même run (état, difficulté, graine), nouvelle zone où Baal attend ; sa mort termine la run */
  /**
   * Lot 316: the Rush runs (`baal`, `tombs`) and the Campaign's zones that stand for them (`a5_throne`, the true one of `a2_tomb1-7`:
   * `rewardAs`) both lead there; before, the Campaign's portal led nowhere (Duriel and Baal out of reach: no Act III, no Nightmare)
   */
  private enterChamber(): boolean {
    const def = this.runDef;
    if (this.mode !== 'run' || !def) return false;
    const as = def.rewardAs ?? def.id;
    const kind = this.world.zone.chamberKind === 'lair' || as === 'tombs' ? 'lair' : as === 'baal' ? 'baal' : null;
    if (!kind || (as !== 'baal' && as !== 'tombs')) return false;
    const zone = kind === 'baal' ? buildBaalChamber(this.runSeed, this.difficulty) : buildDurielLair(this.runSeed, this.difficulty);
    const prev = this.world;
    const run = prev.run;
    if (!zone || !run) return false;
    run.totalWaves = 0;
    const campaign = isCampaignZone(def);
    // lot 319: the true tomb's door opens with the Horadric Staff in the orifice (Diablo II); the Rush's tomb as before
    if (campaign && !tryQuestLock(this, def.id, 'chamber')) return false;
    // the zone left (the Throne, the tomb) kept for the session
    this.keepZone(prev);
    this.world = new World({
      zone,
      seed: this.runSeed + 1,
      difficulty: this.difficulty,
      zoneLevel: prev.zoneLevel,
      character: this.character,
      run,
      mapMods: prev.mapMods,
      idBase: campaign ? this.idBase() : undefined,
    });
    this.chambers.add(this.world);
    carryOver(prev, this.world);
    if (campaign) carryVitals(prev, this.world);
    this.world.populate();
    this.world.events.push({ t: 'zoneEnter', zone: zone.id });
    // as on arrival anywhere in the Campaign (lot 315): no town portal of its own there
    if (!campaign) this.openPortal();
    this.deathAt = -1;
    return true;
  }

  /** Lot 320: the free spot by the way back from world `w` to zone `from` (its exit there), or null when it has none */
  private wayBack(w: World, from: string): { x: number; y: number } | null {
    const o = w.objects.find((x) => x.kind === 'portal' && !x.mirror && x.ref === `zone:${from}`);
    if (!o) return null;
    // a joined neighbour's exit is the opening itself: the hero walks in there (the zone's start), not at its point
    if (w.zone.seams?.some((s) => s.to === from)) return null;
    return w.grid.nearestFree(o.x + 1.2, o.y + 1.2, 4) ?? { x: o.x, y: o.y };
  }

  /** Lot 320: the worlds whose quest portal was looked at once (a portal found there then is not announced) */
  private portalSeen = new WeakSet<World>();

  /**
   * Lot 320: Diablo II's red portals a quest opens (`QUEST_PORTALS`: the Summoner's to the Canyon of the Magi, Anya's to Nihlathak's
   * Temple): in the zone where it stands once its quest is done at this difficulty and its act can be played; announced when it opens in
   * front of the hero (the quest just done), there without a word at a later visit
   */
  private questPortals(): void {
    const w = this.world;
    const def = QUEST_PORTALS.find((p) => p.zone === w.zone.id);
    if (!def) return;
    const first = !this.portalSeen.has(w);
    this.portalSeen.add(w);
    if (!questDone(this.character, def.quest, this.difficulty)) return;
    const ref = `zone:${def.to}`;
    if (w.objects.some((o) => o.kind === 'portal' && !o.mirror && o.ref === ref)) return;
    const camp = RUN_BY_ID[def.to]?.campaign;
    if (!camp || !CAMPAIGNS.find((c) => c.id === camp)?.available()) return;
    const near =
      'monster' in def.near
        ? w.zone.spawns.find((s) => s.monster === (def.near as { monster: string }).monster)
        : w.objects.find((o) => o.kind === 'npc' && o.ref === (def.near as { npc: string }).npc);
    const c = near ?? w.zone.start;
    const at = w.grid.nearestFree(c.x + 2.5, c.y + 2, 6) ?? { x: c.x, y: c.y };
    w.objects.push({ id: w.newId(), kind: 'portal', x: at.x, y: at.y, radius: 1, used: false, ref, variant: 'red', label: def.label });
    if (!first) {
      w.events.push({ t: 'portalOpen', x: at.x, y: at.y });
      w.events.push({ t: 'message', text: def.opened, color: '#e8b04a' });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Lot 316: zones kept for the session                                 */
  /* ------------------------------------------------------------------ */

  /** The chambers behind a zone (Duriel's Lair, the Worldstone Chamber): never kept apart (their run's zone is) */
  private chambers = new WeakSet<World>();

  /** The world `w` the hero leaves, kept when it is a zone of the Campaign (not a town, not the chamber behind a zone) */
  private keepZone(w: World | undefined): void {
    const def = this.runDef;
    if (!w || !def || this.mode !== 'run' || w.zone.town || !isCampaignZone(def) || this.corrupt || this.chambers.has(w)) return;
    this.kept.put(w, def.id);
  }

  /** The world of zone `id` built from `seed` this session: a neighbour of the chain joined edge to edge, else a kept zone */
  private takeZone(id: string, d: Difficulty, seed: number): World | null {
    const n = this.seams.worldOf(id);
    if (n && n !== this.world && n.difficulty === d && n.seed === seed >>> 0) {
      this.kept.drop(n);
      return n;
    }
    return this.kept.take(id, d, seed);
  }

  /** An identifier range no kept world nor joined neighbour uses (0 when nothing is kept: the worlds built as before) */
  private idBase(): number {
    const used = this.kept.bases();
    for (const l of this.seams.worlds()) if (l.world !== this.world) used.add(l.world.idBase);
    return freeIdBase(used);
  }

  /**
   * A kept zone entered again (lot 316): as it was left (monsters, chests, items on the ground, its run's state); the hero made anew there,
   * his companions following (`carryOver`), at the way back to `from`, else at its waypoint, else at its start
   */
  private reenter(w: World, prev: World | undefined, from?: string): void {
    stripMirrors(w);
    w.seamLinks = [];
    w.proxy = false;
    w.monsters = w.monsters.filter((m) => !m.pet);
    const back = from ? w.objects.find((o) => o.kind === 'portal' && !o.mirror && o.ref === `zone:${from}`) : undefined;
    const wp = back ? undefined : w.objects.find((o) => o.kind === 'waypoint' && !o.mirror);
    const near = back ?? wp;
    const at = (near && w.grid.nearestFree(near.x + 1.2, near.y + 1.2, 4)) ?? near ?? w.zone.start;
    w.resetHero(at.x, at.y);
    w.refreshPlayer();
    w.player.hp = w.player.hpMax;
    w.player.mana = w.player.manaMax;
    w.events.drain();
    if (prev) w.godMode = prev.godMode;
    spawnMerc(w);
    this.world = w;
    if (prev) carryOver(prev, w);
  }

  /* ------------------------------------------------------------------ */
  /* Cartes d'endgame                                                    */
  /* ------------------------------------------------------------------ */

  /** Condition d'ouverture des cartes : Enfer débloqué et niveau 75 (PD2 : 80, adapté au rythme mobile) */
  canOpenMaps(): { ok: boolean; reason?: string } {
    const c = this.character;
    if (c.progression.highestDifficulty < 2) return { ok: false, reason: 'Débloquez l’Enfer (tuez Baal en Cauchemar)' };
    if (c.level < MAP_MIN_LEVEL) return { ok: false, reason: `Niveau ${MAP_MIN_LEVEL} requis` };
    return { ok: true };
  }

  /** Ouvre une carte de l'inventaire ou du coffre (la carte est consommée) */
  startMap(from: { invIndex: number } | { tab: number; idx: number } | { mapIdx: number }, seed?: number): { ok: boolean; reason?: string } {
    const check = this.canOpenMaps();
    if (!check.ok) return check;
    const c = this.character;
    const it = 'invIndex' in from ? c.inventory[from.invIndex] : 'mapIdx' in from ? c.mapStash?.[from.mapIdx] : c.stash[from.tab]?.[from.idx];
    if (!it?.map) return { ok: false, reason: 'Ce n’est pas une carte' };
    if ('invIndex' in from) c.inventory[from.invIndex] = null;
    else if ('mapIdx' in from) c.mapStash!.splice(from.mapIdx, 1);
    else c.stash[from.tab][from.idx] = null;
    this.runCounter++;
    this.suspended = null;
    this.launchMap(it, seed ?? hashSeed(`${c.name}:map:${this.runCounter}`));
    return { ok: true };
  }

  private launchMap(it: Item, seed: number, restore?: SaveData['run']): void {
    // modificateurs, événement de carte et zone construite : règle du mod qui fournit les cartes
    const setup = RULES['maps.launch'](it, seed);
    const zdef = MAP_ZONE_BY_ID[it.map!.zone];
    const zone = setup.zone;
    const tier = it.map!.tier;
    this.runDef = {
      id: 'map',
      name: mapName(it),
      zoneKey: 'map',
      desc: '',
      zoneLevel: [setup.zoneLevel, setup.zoneLevel, setup.zoneLevel],
      recLevel: [MAP_MIN_LEVEL, MAP_MIN_LEVEL, MAP_MIN_LEVEL],
      focus: 'both',
      boss: zdef.boss.monster,
      build: () => zone,
      firstClear: {},
    };
    this.activeMap = it;
    this.difficulty = 2;
    this.runSeed = seed;
    this.mode = 'run';
    const run = new RunState('map', 'map', 2, zdef.boss.monster, tier, zdef.id);
    const prev = this.world as World | undefined;
    this.world = new World({ zone, seed, difficulty: 2, zoneLevel: restore?.zoneLevel ?? setup.zoneLevel, character: this.character, run, mapMods: setup.mods });
    performance.mark('map:world1');
    run.startTick = this.world.tick;
    if (restore) this.world.restore(restore.world);
    else {
      if (prev) carryOver(prev, this.world);
      // PD2 : les effets de sanctuaire sont retirés à l'entrée d'une carte
      const p = this.world.player;
      if (p.buffs.some((b) => b.id.startsWith('shrine_'))) {
        p.buffs = p.buffs.filter((b) => !b.id.startsWith('shrine_'));
        this.world.refreshPlayer();
      }
      this.world.populate();
      performance.mark('map:populate1');
      this.world.events.push({ t: 'zoneEnter', zone: 'map' });
      this.openPortal();
      if (setup.message) this.world.events.push({ t: 'mapEvent', text: setup.message });
    }
    this.deathAt = -1;
  }

  private resumeRun(save: SaveData): void {
    const r = save.run!;
    if (r.runId === 'map' && r.mapItem) {
      this.launchMap(r.mapItem, r.seed, r);
      return;
    }
    const def = RUN_BY_ID[r.runId];
    this.runDef = def;
    this.difficulty = r.difficulty;
    this.runSeed = r.seed;
    this.mode = 'run';
    this.corrupt = !!r.corrupt;
    const run = new RunState(def.id, def.zoneKey, r.difficulty, def.boss);
    this.world = new World({
      zone: def.build(r.seed, r.difficulty),
      seed: r.seed,
      difficulty: r.difficulty,
      zoneLevel: r.zoneLevel ?? runZoneLevel(def, r.difficulty, this.character.level),
      character: this.character,
      run,
      mapMods: this.corrupt ? CORRUPT_MODS : undefined,
    });
    run.totalWaves = Math.max(0, ...this.world.zone.spawns.map((s) => s.wave ?? 0));
    this.world.restore(r.world);
    // game mode: its director is made now (not at the first step) and given back its state; base runs have none
    if (def.director) {
      this.campaignActive = def.campaign ?? null;
      run.director = def.director(this.world, run);
      if (r.modState !== undefined) run.director.restore?.(r.modState);
    }
  }

  /**
   * A game mode's run resumed at load, built again from the same save before its first step: the application calls it once the maps of
   * the run's act are loaded (the zone may be cut from them). False if there is nothing to rebuild.
   */
  rebuildResumedRun(): boolean {
    const s = this.resumedFrom;
    this.resumedFrom = null;
    if (!s || this.mode !== 'run') return false;
    this.resumeRun(s);
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Boucle                                                              */
  /* ------------------------------------------------------------------ */

  /** Avance la simulation de n ticks et distribue les événements. */
  step(n = 1): SimEvent[] {
    const all: SimEvent[] = [];
    if (n > 0) this.resumedFrom = null;
    for (let i = 0; i < n; i++) {
      this.world.autoCfg = this.settings;
      // game mode: autopilot (automatic attack, buffs, movement), after the controls and before the step; base: nothing
      RULES['game.autopilot'](this);
      this.world.step(1);
      // lot 312: the neighbours joined edge to edge near a seam stepped beside the zone, their entities mirrored in it
      this.seams.step();
      if (this.mode === 'run') this.character.progression.playTime += 1 / TICK_HZ;
      const evs = this.world.events.drain();
      for (const e of evs) {
        this.handle(e);
        all.push(e);
      }
      // lot 320: a quest's red portal (the Summoner's, Anya's) where it is due
      this.questPortals();
      // their events (already handled for their own zone), in this zone's coordinates
      for (const e of this.seams.takeEvents()) all.push(e);
      const crossed = this.seamCrossed;
      this.autoWalk();
      // lot 312: walked into the neighbour: this step's events before the crossing are seen in the new zone's coordinates
      if (this.seamCrossed && this.seamCrossed !== crossed) for (let k = 0; k < all.length; k++) all[k] = shiftEvent(all[k], this.seamCrossed.dx, this.seamCrossed.dy);
      if (this.deathAt >= 0 && this.world.tick - this.deathAt > TICK_HZ * 3) {
        this.deathAt = -1;
        this.enterTown();
        all.push(...this.world.events.drain());
      }
    }
    for (const e of all) for (const l of this.listeners) l(e);
    return all;
  }

  /** Passages qu'on franchit en marchant (escaliers, bords de zone) : actifs une fois qu'on s'en est éloigné (on n'est pas renvoyé tout de suite à l'arrivée) */
  private armed = new Set<number>();
  private armedWorld: unknown = null;

  private autoWalk(): void {
    const w = this.world;
    if (this.armedWorld !== w) {
      this.armedWorld = w;
      this.armed.clear();
    }
    const p = w.player;
    if (p.dead) return;
    // lot 311: a zone joined edge to edge to its neighbour (src/data/zones/seams.ts): the hero walks into it where the maps overlap
    const seams = w.zone.seams?.length && RULES['world.seams'](this) ? w.zone.seams : null;
    if (seams)
      for (const s of seams) {
        const [x0, y0, x1, y1] = s.cross;
        // lot 312: where the neighbour has room for him (its own props in the overlap), else he walks on in the crossing
        if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && this.seams.canCross(s, p.x, p.y, Math.min(p.radius, TERRAIN_RADIUS))) {
          this.crossSeam(s);
          return;
        }
      }
    for (const o of w.objects) {
      if (o.kind !== 'portal' || !o.ref || (o.variant !== 'stairs' && o.variant !== 'edge')) continue;
      // the joined exit is crossed by walking through the opening, not at its point
      if (seams?.some((s) => o.ref === `zone:${s.to}`)) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d > o.radius + 1.5) this.armed.add(o.id);
      else if (d <= o.radius && this.armed.has(o.id)) {
        w.events.push({ t: 'interact', kind: 'portal', ref: o.ref, objectId: o.id });
        this.armed.delete(o.id);
        return;
      }
    }
  }

  /**
   * The last crossing of a seam (lot 311): the world's tick it happened at and the shift of the coordinates (new = old + d); the application
   * keeps the image and the controls going through it (no loading screen, the joystick held)
   */
  seamCrossed: { world: World; dx: number; dy: number } | null = null;

  /**
   * Lot 311: the zones joined to the current one at its seams, built as entering them would build them (same seed): the application
   * prepares their graphics during the current zone. Empty without seams or with the rule `world.seams` off
   */
  neighbourZones(): ZoneDef[] {
    const seams = this.world.zone.seams;
    if (!seams?.length || !RULES['world.seams'](this)) return [];
    const out: ZoneDef[] = [];
    for (const s of seams) {
      // lot 312: the neighbour's world already built (kept while the hero walks the chain): its zone as it is
      const built = this.seams.worldOf(s.to);
      if (built) {
        out.push(built.zone);
        continue;
      }
      // lot 316: a zone kept for the session, as it is
      const kept = this.kept.peek(s.to, this.difficulty);
      if (kept) {
        out.push(kept.zone);
        continue;
      }
      const run = RUN_BY_ID[s.to];
      if (run?.campaign) out.push(run.build(hashSeed(`${this.character.name}:${s.to}`), this.difficulty));
    }
    return out;
  }

  /** Lot 312 (`SeamHost`): the seams are on (rule `world.seams`) */
  seamsOn(): boolean {
    return RULES['world.seams'](this);
  }

  /**
   * Lot 312 (`SeamHost`): the world of the neighbour `id` as entering it would build it: a town as the waypoint's town (its hub zone),
   * a zone of the campaign with its seed and zone level, its run state; not populated (the seam manager does it)
   */
  buildSeamWorld(id: string, idBase: number): { world: World; def: RunDef | null; town: boolean } | null {
    return runSteps(this.seamWorldSteps(id, idBase));
  }

  /** Lot 312 (`SeamHost`): `buildSeamWorld` in steps (its zone built a few milliseconds at a time, behind the play) */
  *seamWorldSteps(id: string, idBase: number): Steps<{ world: World; def: RunDef | null; town: boolean } | null> {
    const hub = TOWN_HUB[id];
    if (hub) {
      // the camps of Acts I to III in steps (their zone is laid out on its map as a field's), the others at once
      const zone =
        id === 'a1_town' && act1Available()
          ? yield* buildA1Steps(id, 1, 0)
          : id === 'a2_town' && act2Available()
            ? yield* buildA2Steps(id, 1, 0)
            : id === 'a3_town' && act3Available()
              ? yield* buildA3Steps(id, 1, 0)
              : hubZoneOf(id);
      if (!zone) return null;
      yield;
      return { world: new World({ zone, seed: 1, difficulty: this.difficulty, zoneLevel: 1, character: this.character, idBase }), def: RUN_BY_ID[id] ?? null, town: true };
    }
    const def = RUN_BY_ID[id];
    if (!def?.campaign) return null;
    const seed = hashSeed(`${this.character.name}:${id}`);
    const zone = def.buildSteps ? yield* def.buildSteps(seed, this.difficulty) : def.build(seed, this.difficulty);
    if (!zone.d2Map) return null;
    yield;
    const run = new RunState(def.id, def.zoneKey, this.difficulty, def.boss);
    const world = new World({ zone, seed, difficulty: this.difficulty, zoneLevel: runZoneLevel(def, this.difficulty, this.character.level), character: this.character, run, idBase });
    run.totalWaves = Math.max(0, ...world.zone.spawns.map((s) => s.wave ?? 0));
    return { world, def, town: false };
  }

  /** Lot 316 (`SeamHost`): the zone `id` kept for the session, built from the seed walking into it uses */
  keptSeamWorld(id: string): { world: World; def: RunDef | null; town: boolean } | null {
    const def = RUN_BY_ID[id];
    if (!def || !isCampaignZone(def)) return null;
    const w = this.kept.take(id, this.difficulty, hashSeed(`${this.character.name}:${id}`));
    return w ? { world: w, def, town: false } : null;
  }

  /** Lot 316 (`SeamHost`): a world out of the chain kept for the session when it is a zone of the Campaign */
  keepSeamWorld(w: World, def0: RunDef | null): void {
    // the chain's first world (the zone entered otherwise) has no run of its own there: its zone's
    const def = def0 ?? RUN_BY_ID[w.zone.id] ?? null;
    if (def && isCampaignZone(def) && !w.zone.town && w !== this.world && !this.chambers.has(w)) this.kept.put(w, def.id);
  }

  /** Lot 316 (`SeamHost`): the identifier ranges of the kept zones */
  idBasesInUse(): Set<number> {
    return this.kept.bases();
  }

  /** Lot 312 (`SeamHost`): a neighbour's event that concerns the game: its monster killed (its zone's quests), a level gained */
  neighbourEvent(e: SimEvent, n: { world: World; def: RunDef | null }): void {
    if (e.t === 'death') onMonsterDeath({ character: this.character, world: n.world, difficulty: this.difficulty, runDef: n.def }, e);
    else if (e.t === 'levelUp') {
      // gained in the neighbour (a monster of it killed): the hero's stats in his zone, the level's full life and mana (D2)
      this.handle(e);
      const w = this.world;
      w.refreshPlayer();
      w.player.hp = w.player.hpMax;
      w.player.mana = w.player.manaMax;
    }
  }

  /**
   * Into the neighbour joined at the seam `s`, walking (lot 312: its world built ahead and simulated beside this one, src/sim/seam-worlds.ts):
   * the neighbour becomes the zone with the hero at the same place in its coordinates (`p − at`), walking as he was, his companions with
   * him; the zone left stays as it is (its monsters where they were, simulated while he is near). The game's state follows the zone (its
   * run, quests, waypoint, the town's own state when it is the camp). No town portal, nothing rolled again
   */
  private crossSeam(s: SeamDef): boolean {
    const w0 = this.world;
    const w = this.seams.cross(s);
    if (!w) return false;
    const p = w.player;
    if (w.grid.circleBlocked(p.x, p.y, Math.min(p.radius, TERRAIN_RADIUS))) {
      const f = w.grid.nearestFree(p.x, p.y, 3);
      if (f) {
        p.x = f.x;
        p.y = f.y;
      }
    }
    this.world = w;
    this.enterJoined(w);
    this.seamCrossed = { world: w, dx: -s.at.x, dy: -s.at.y };
    void w0;
    return true;
  }

  /** Lot 312: the game's state for a zone walked into at a seam (as entering it by its portal would set it, without building it) */
  private enterJoined(w: World): void {
    const id = w.zone.id;
    const def = RUN_BY_ID[id];
    if (w.zone.town) {
      // as `enterTown` sets it (Harrogath: no campaign tab of its own)
      const camp = TOWN_HUB[id] ?? def?.campaign ?? 'act5';
      this.mode = 'town';
      this.runDef = null;
      this.activeMap = null;
      this.corrupt = false;
      this.campaignActive = id === 'harrogath' ? null : camp;
      this.lastTown = camp;
      this.visitVendor();
    } else if (def) {
      this.mode = 'run';
      this.runDef = def;
      this.activeMap = null;
      this.corrupt = false;
      this.campaignActive = def.campaign ?? null;
      this.runSeed = hashSeed(`${this.character.name}:${id}`);
      this.character.progression.milestones[`zone:${id}`] ??= Math.round(this.character.progression.playTime);
    }
    this.deathAt = -1;
    w.events.push({ t: 'zoneEnter', zone: id });
    if (def && !w.zone.town) onZoneEnter(this, id);
  }

  private handle(e: SimEvent): void {
    const c = this.character;
    switch (e.t) {
      case 'runComplete': {
        if (!this.runDef) break;
        const key = `${this.runDef.id}:${this.difficulty}`;
        c.progression.completions[key] = (c.progression.completions[key] ?? 0) + 1;
        const mkey = `first:${key}`;
        if (!c.progression.milestones[mkey]) c.progression.milestones[mkey] = Math.round(c.progression.playTime);
        this.grantFirstClear(this.runDef, this.difficulty);
        // mode Rush : Wirt est à Tristram, la Jambe de Wirt revient à chaque Tristram terminé (une seule en poche)
        if (this.runDef.id === 'tristram' && !this.runDef.campaign && matCount(c, 'wirts_leg') === 0) {
          c.materials.wirts_leg = 1; // directement dans l'onglet du coffre (rien dans l'inventaire)
          this.world.events.push({ t: 'message', text: 'Vous récupérez la Jambe de Wirt.', color: '#e8b04a' });
        }
        // portail des Vaches (D2) : le Roi des Vaches tué le ferme dans cette difficulté ; un nouveau Baal le rouvre
        if (this.runDef.id === 'cows') c.progression.milestones[`cowsclosed:${this.difficulty}`] = Math.round(c.progression.playTime) || 1;
        if (this.runDef.id === 'baal' || this.runDef.rewardAs === 'baal') delete c.progression.milestones[`cowsclosed:${this.difficulty}`];
        if ((this.runDef.id === 'baal' || this.runDef.rewardAs === 'baal') && this.difficulty < 2 && c.progression.highestDifficulty <= this.difficulty) {
          c.progression.highestDifficulty = (this.difficulty + 1) as Difficulty;
          this.world.events.push({ t: 'message', text: `${DIFF_NAMES[this.difficulty + 1]} débloqué !`, color: '#e8b04a' });
        }
        this.lastRunSummary = { runId: this.runDef.id, seconds: e.durationSec, kills: this.world.stats.kills, difficulty: this.difficulty };
        if (this.runDef.id === 'map' && this.activeMap?.map) {
          const t = this.activeMap.map.tier;
          c.progression.completions[`map:${t}`] = (c.progression.completions[`map:${t}`] ?? 0) + 1;
          c.progression.mapTierMax = Math.max(c.progression.mapTierMax, t);
          if (!c.progression.milestones[`map:${t}`]) c.progression.milestones[`map:${t}`] = Math.round(c.progression.playTime);
        }
        break;
      }
      case 'death':
        // quêtes : monstre précis tué, zone nettoyée, objets de quête lâchés
        onMonsterDeath(this, e);
        break;
      case 'playerDeath':
        if (this.deathAt < 0) {
          this.deathAt = this.world.tick;
          const lost = deathPenalty(c, this.difficulty);
          if (lost > 0) this.world.events.push({ t: 'message', text: `Vous perdez ${lost.toLocaleString('fr-FR')} points d'expérience`, color: '#d66' });
          // lot 316 (owner: the gold, no corpse): Diablo II's share of the gold carried, in the Campaign
          if (this.runDef && isCampaignZone(this.runDef)) {
            const gold = deathGoldLoss(c.level, c.gold);
            c.gold -= gold;
            if (gold > 0) this.world.events.push({ t: 'message', text: `Vous perdez ${gold.toLocaleString('fr-FR')} pièces d'or`, color: '#d66' });
          }
        }
        break;
      case 'levelUp': {
        if (!c.progression.milestones[`lvl:${e.level}`]) c.progression.milestones[`lvl:${e.level}`] = Math.round(c.progression.playTime);
        // game mode: the level's skill point is spent through an offer (queued: several levels can come in one step)
        const ids = RULES['skills.offer'](this, e.level, 0);
        if (ids) this.offers.push({ level: e.level, ids: [...ids], rerolls: 0 });
        break;
      }
      case 'interact':
        if (e.kind === 'portal' && e.ref === 'town') this.enterTown();
        else if (e.kind === 'portal' && e.ref === 'run') this.returnToRun();
        else if (e.kind === 'portal' && e.ref === 'chamber') this.enterChamber();
        else if (e.kind === 'portal' && e.ref?.startsWith('zone:')) this.enterCampaignZone(e.ref.slice(5));
        else if (e.kind === 'portal' && e.ref?.startsWith('tp:')) this.teleportTo(e.ref);
        // lot 319: Mephisto's red portal to the Pandemonium Fortress (Diablo II)
        else if (e.kind === 'portal' && e.ref?.startsWith('act:')) this.travelTo(e.ref.slice(4));
        else if (e.kind === 'waypoint') this.touchWaypoint();
        else if (e.kind === 'quest' && e.objectId !== undefined) useQuestObject(this, e.objectId);
        break;
    }
  }

  /** Plateforme de téléportation (Sanctuaire des arcanes) : `tp:x,y` */
  private teleportTo(ref: string): void {
    const [x, y] = ref.slice(3).split(',').map(Number);
    const w = this.world;
    const spot = w.grid.nearestFree(x, y, 4) ?? { x, y };
    const p = w.player;
    w.events.push({ t: 'teleport', id: p.id, fx: p.x, fy: p.y, tx: spot.x, ty: spot.y });
    p.x = spot.x;
    p.y = spot.y;
    p.px = spot.x;
    p.py = spot.y;
    teleportMerc(w, p);
  }

  /** Quête accomplie à la difficulté courante (ou, pour une quête de run, run terminée) */
  questDone(id: string, d: Difficulty = this.difficulty): boolean {
    return questDone(this.character, id, d);
  }

  /** Accorde une quête (tests, débogage) */
  completeQuest(id: string, d: Difficulty = this.difficulty): void {
    const q = QUEST_BY_ID[id];
    if (q) completeQuest(this, q, d);
  }

  /** Parler à un PNJ : livraisons d'objets de quête (Malus à Charsi, Oiseau d'or à Alkor…) */
  talkTo(npc: string): void {
    talkTo(this, npc);
  }

  /** Verrou d'acte de la campagne (null = ouvert) */
  actLock(campaign: string, d: Difficulty = this.difficulty): string | null {
    return actLock(this.character, campaign, d);
  }

  /**
   * Lot 319: where NPC `npc` takes the hero (Diablo II's Warriv, Meshif, Tyrael: `TRAVELERS`) and, while that act is shut at the current
   * difficulty, what he says instead (`lock`); null for any other NPC
   */
  travelOffer(npc: string): { to: string; lock: string | null } | null {
    const t = TRAVELERS[npc];
    return t ? { to: t.to, lock: this.actLock(t.to) ? t.line : null } : null;
  }

  /** Lot 319: travel with NPC `npc` to his act's town (from a town only); `maps`: that act's maps are not on the device yet */
  travel(npc: string): { ok: boolean; reason?: string; maps?: boolean } {
    const o = this.travelOffer(npc);
    if (!o || this.mode !== 'town') return { ok: false };
    if (o.lock) return { ok: false, reason: o.lock };
    return this.travelTo(o.to);
  }

  /**
   * Lot 319: to the town of act `act` (a transporter, Mephisto's red portal). Its maps missing: a red portal leads to the current act's town
   * instead (never stuck in the zone), a transporter says so
   */
  private travelTo(act: string): { ok: boolean; reason?: string; maps?: boolean } {
    if (actTownAvailable(act)) {
      this.enterTown(act);
      return { ok: true };
    }
    const reason = `Les cartes de l’${CAMPAIGN_NAMES[act] ?? act} ne sont pas encore sur l’appareil : préparez-les depuis le point de passage.`;
    if (this.mode === 'run') {
      this.enterTown();
      this.world.events.push({ t: 'message', text: reason, color: '#e8b04a' });
      return { ok: true, reason, maps: true };
    }
    return { ok: false, reason, maps: true };
  }

  private grantFirstClear(run0: RunDef, d: Difficulty): void {
    // une zone de campagne partage la récompense de la run d'origine (une seule fois par difficulté)
    const run = (run0.rewardAs && RUN_BY_ID[run0.rewardAs]) || run0;
    const c = this.character;
    const key = `reward:${run.id}:${d}`;
    if (c.progression.rewards.includes(key)) return;
    c.progression.rewards.push(key);
    const r = run.firstClear;
    const parts: string[] = [];
    if (r.skillPoints) {
      c.skillPoints += r.skillPoints;
      c.progression.bonusSkillPoints += r.skillPoints;
      parts.push(`+${r.skillPoints} point(s) de compétence`);
    }
    if (r.statPoints) {
      c.statPoints += r.statPoints;
      c.progression.bonusStatPoints += r.statPoints;
      parts.push(`+${r.statPoints} points de caractéristiques`);
    }
    if (r.resAll) {
      c.bonuses.resAll = (c.bonuses.resAll ?? 0) + r.resAll;
      parts.push(`+${r.resAll} % à toutes les résistances`);
    }
    if (r.respec) {
      c.respecs += r.respec;
      parts.push(`+${r.respec} réinitialisation`);
    }
    if (parts.length) this.world.events.push({ t: 'message', text: `Premier passage ${DIFF_NAMES[d]} : ${parts.join(', ')}`, color: '#e8b04a' });
    this.world.refreshPlayer();
  }

  /** Anya : trois cartes de palier 1 la première fois que les cartes deviennent accessibles (PD2) */
  private grantAnyaMaps(): void {
    const c = this.character;
    if (c.progression.rewards.includes('anya:maps') || !this.canOpenMaps().ok || !MAP_ZONES.length) return;
    const rng = new Rng(`anya:${c.name}`);
    const make = RULES['maps.make'];
    const maps = [make(rng, 1, 'normal'), make(rng, 1, 'normal'), make(rng, 1, 'normal')];
    let given = 0;
    for (const m of maps) {
      if (placeInInventory(c, m) >= 0) {
        given++;
      } else {
        const tab = stashOrder(c).find((t) => hasRoomInStash(c.stash[t], m)) ?? -1;
        if (tab >= 0) {
          placeInStash(c.stash[tab], m);
          given++;
        }
      }
    }
    if (given) {
      c.progression.rewards.push('anya:maps');
      if (this.world) this.world.events.push({ t: 'message', text: 'Anya vous confie trois cartes. Parlez-lui pour les ouvrir.', color: '#e8b04a' });
    }
  }

  /** Retour en ville par le portail (bouton) */
  townPortal(): void {
    if (this.mode === 'run') this.enterTown();
  }

  /** Une run est en attente derrière un portail de Harrogath */
  /** Zone vers laquelle le portail ramène (ville), sans la créer pour de bon : préchargement des graphismes de la zone suivante */
  previewTownZone(): ZoneDef {
    const c = this.runDef?.campaign;
    const hub = c === 'act1' ? 'a1_town' : c === 'act2' ? 'a2_town' : c === 'act3' ? 'a3_town' : c === 'act4' ? 'a4_fortress' : null;
    const ok = hub === 'a1_town' ? act1Available() : hub === 'a2_town' ? act2Available() : hub === 'a3_town' ? act3Available() : hub === 'a4_fortress' ? act4Available() : false;
    if (hub && ok) return hub === 'a1_town' ? buildA1(hub, 1, 0) : hub === 'a2_town' ? buildA2(hub, 1, 0) : hub === 'a3_town' ? buildA3(hub, 1, 0) : buildA4(hub, 1, 0);
    return buildHarrogath();
  }

  /** Zone de la run laissée derrière un portail (préchargement des graphismes de la zone suivante) */
  get suspendedZone(): ZoneDef | null {
    return this.suspended?.world.zone ?? null;
  }

  /** Une run est en attente (portail vers la ville ouvert) */
  get hasSuspendedRun(): boolean {
    return this.suspended !== null;
  }

  /** Ouvre (ou déplace) le portail vers Harrogath à côté du joueur ; sans consommable, un seul à la fois */
  /**
   * Lot 314 (owner: "there is a button to go to the next or the previous zone, remove it"): the town portal opened at will (the HUD's button,
   * its key) is a run's way home (Rush, the endgame's maps); a campaign's zones are walked (joined edge to edge, their exits) and left by
   * their waypoints, as in Diablo II without a scroll: no portal at will there, nor in a campaign's town
   */
  portalAllowed(): boolean {
    return !this.campaignActive;
  }

  openPortal(): boolean {
    if (this.mode !== 'run' || this.world.player.dead || this.world.zone.town) return false;
    const w = this.world;
    const p = w.player;
    const spot = w.grid.nearestFree(p.x + Math.cos(p.facing - 0.8) * 1.6, p.y + Math.sin(p.facing - 0.8) * 1.6, 4) ?? { x: p.x, y: p.y };
    w.objects = w.objects.filter((o) => !(o.kind === 'portal' && o.ref === 'town'));
    w.objects.push({ id: w.newId(), kind: 'portal', x: spot.x, y: spot.y, radius: 1, used: false, ref: 'town', label: `Portail vers ${this.townName()}` });
    w.events.push({ t: 'portalOpen', x: spot.x, y: spot.y });
    return true;
  }

  /** Retour dans la run laissée derrière le portail : même monde, butin et monstres en l'état, joueur soigné devant le portail */
  returnToRun(): boolean {
    const s = this.suspended;
    if (!s || this.mode !== 'town') return false;
    const town = this.world;
    const w = s.world;
    w.monsters = w.monsters.filter((m) => !m.pet);
    const old = w.player;
    const portal = w.objects.find((o) => o.kind === 'portal' && o.ref === 'town');
    const at = portal ? { x: portal.x, y: portal.y } : { x: old.x, y: old.y };
    const spot = w.grid.nearestFree(at.x + 1.4, at.y + 1.4, 5) ?? at;
    // état du joueur neuf (soigné, sans malus), identité et monde de la run conservés
    Object.assign(old, structuredClone(town.player), { id: old.id, x: spot.x, y: spot.y, px: spot.x, py: spot.y });
    old.buffs = [];
    old.cooldowns = {};
    w.refreshPlayer();
    old.hp = old.hpMax;
    old.mana = old.manaMax;
    // lot 316: in the Campaign the hero comes back as he is in town (no heal on the way); the zone is no longer kept apart
    if (isCampaignZone(s.runDef)) {
      carryVitals(town, w);
      this.kept.drop(w);
    }
    spawnMerc(w);
    carryOver(town, w);
    this.world = w;
    this.mode = 'run';
    this.runDef = s.runDef;
    this.activeMap = s.activeMap;
    this.difficulty = s.difficulty;
    this.runSeed = s.runSeed;
    this.corrupt = s.corrupt;
    this.suspended = null;
    this.deathAt = -1;
    w.events.push({ t: 'zoneEnter', zone: s.runDef.id });
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Personnage                                                          */
  /* ------------------------------------------------------------------ */

  allocateStat(stat: 'str' | 'dex' | 'vit' | 'ene', n = 1): boolean {
    const c = this.character;
    const k = Math.min(n, c.statPoints);
    if (k <= 0) return false;
    c.base[stat] += k;
    c.statPoints -= k;
    this.world.refreshPlayer();
    return true;
  }

  /** La compétence peut-elle recevoir un point (classe, points, niveau requis, prérequis, plafond) ? `reason` sinon */
  canLearn(id: string): { ok: boolean; reason?: string } {
    const c = this.character;
    const s = SKILL_BY_ID[id];
    if (!s) return { ok: false, reason: 'Inconnue' };
    if (TREE_CLASS[s.tree] !== c.classId) return { ok: false, reason: `Compétence de ${classOf(TREE_CLASS[s.tree]).name}` };
    if (c.skillPoints <= 0) return { ok: false, reason: 'Aucun point disponible' };
    if (c.level < s.reqLvl) return { ok: false, reason: `Niveau ${s.reqLvl} requis` };
    if ((c.skills[id] ?? 0) >= 20) return { ok: false, reason: 'Niveau maximal (20)' };
    for (const p of s.prereqs) if (!(c.skills[p] > 0)) return { ok: false, reason: `Requiert ${SKILL_BY_ID[p].name}` };
    return { ok: true };
  }

  /** Can the skill tree take this point by hand now (rule `skills.manualLearn`: a game mode can reserve the points for its offers)? */
  canLearnManually(id: string): { ok: boolean; reason?: string } {
    const blocked = RULES['skills.manualLearn'](this);
    return blocked ? { ok: false, reason: blocked } : this.canLearn(id);
  }

  /** The oldest skill offer waiting for a choice (null: none) */
  currentOffer(): { level: number; ids: string[]; rerolls: number } | null {
    return this.offers[0] ?? null;
  }

  /**
   * Answers the oldest skill offer: `id` (one of the offered skills) receives the point, null keeps it for later. The offers still waiting
   * are drawn again (the choice can open new skills). False if there is no offer or the choice is refused (the offer stays).
   */
  takeOffer(id: string | null): boolean {
    const o = this.offers[0];
    if (!o) return false;
    if (id !== null && (!o.ids.includes(id) || !this.learnSkill(id))) return false;
    this.offers.shift();
    for (const next of this.offers) next.ids = [...(RULES['skills.offer'](this, next.level, next.rerolls) ?? [])];
    return true;
  }

  /** Draws the oldest offer again (reroll; its cost is the game mode's business); false without an offer */
  rerollOffer(): boolean {
    const o = this.offers[0];
    if (!o) return false;
    o.rerolls++;
    o.ids = [...(RULES['skills.offer'](this, o.level, o.rerolls) ?? [])];
    return true;
  }

  /** Investit un point dans la compétence (une compétence active est assignée à un emplacement libre à son premier point) */
  learnSkill(id: string): boolean {
    if (!this.canLearn(id).ok) return false;
    const c = this.character;
    const first = !(c.skills[id] > 0);
    c.skills[id] = (c.skills[id] ?? 0) + 1;
    c.skillPoints--;
    const s = SKILL_BY_ID[id];
    if (first && !s.passive) this.autoAssign(id);
    this.world.refreshPlayer();
    return true;
  }

  private autoAssign(id: string): void {
    const hb = this.character.hotbar;
    if (id === 'teleport') return; // bouton dédié
    // le premier sort appris devient le clic droit (mode PC) tant que celui-ci est l'attaque normale
    if (!hb.secondary || hb.secondary === 'attack') hb.secondary = id;
    if (hb.slots.includes(id) || hb.primary === id) return;
    const idx = hb.slots.findIndex((x) => x === null);
    if (idx >= 0) hb.slots[idx] = id;
  }

  /** Place une compétence sur l'attaque principale, le clic droit ou un des 8 emplacements (null : vide l'emplacement) */
  assignSkill(slot: number | 'primary' | 'secondary', id: string | null): void {
    const hb = this.character.hotbar;
    if (slot === 'secondary') {
      hb.secondary = id ?? 'attack';
      return;
    }
    if (slot === 'primary') {
      if (id) hb.primary = id;
      return;
    }
    // un sort n'occupe qu'un emplacement
    if (id) hb.slots = hb.slots.map((x) => (x === id ? null : x));
    hb.slots[slot] = id;
  }

  /**
   * Réinitialisation des points : `all` (stats et compétences), `stats` seulement ou `skills` seulement.
   * Gratuite si le réglage `freeRespec` est activé ; sinon chaque réinitialisation (même partielle) consomme une de celles gagnées en jouant.
   */
  respec(part: 'all' | 'stats' | 'skills' = 'all'): boolean {
    const c = this.character;
    // réinitialisation gratuite et illimitée si le joueur l'a activée (réglage `freeRespec`, activé par défaut dans l'application) ;
    // sinon le nombre de réinitialisations gagnées en jouant (D2 : une par difficulté + quêtes)
    const free = this.settings.freeRespec === true;
    if (!free && c.respecs <= 0) return false;
    if (!free) c.respecs--;
    if (part !== 'skills') {
      c.base = { ...classOf(c.classId).base };
      c.statPoints = (c.level - 1) * 5 + c.progression.bonusStatPoints;
    }
    if (part !== 'stats') {
      c.skills = {};
      c.skillPoints = c.level + c.progression.bonusSkillPoints;
      c.hotbar = { primary: 'attack', secondary: 'attack', slots: c.hotbar.slots.map(() => null) };
    }
    // l'équipement dont les prérequis ne sont plus remplis reste porté mais ne peut être rééquipé ; on le retire
    // (a game mode that lifts the requirements, rule `char.equipNeedsReqs`, keeps it on: lot 290)
    if (part !== 'skills' && RULES['char.equipNeedsReqs'](c)) {
      for (const slot of Object.keys(c.equipment) as Slot[]) {
        const it = c.equipment[slot]!;
        const f = itemFinal(it, c.level);
        if (f.reqStr > c.base.str || f.reqDex > c.base.dex) unequip(c, slot);
      }
    }
    this.world.refreshPlayer();
    return true;
  }

  /** Équipe l'objet de la case `invIndex` du sac (à l'emplacement donné ou au premier compatible) */
  equip(invIndex: number, slot?: Slot): { ok: boolean; reason?: string } {
    const r = equipFromInventory(this.character, invIndex, slot);
    if (r.ok) this.world.refreshPlayer();
    return r;
  }

  /** Retire l'objet porté et le range dans le sac */
  unequip(slot: Slot): { ok: boolean; reason?: string } {
    const r = unequip(this.character, slot);
    if (r.ok) this.world.refreshPlayer();
    return r;
  }

  /* ------------------------------------------------------------------ */
  /* Mercenaire (Qual-Kehk, Harrogath)                                    */
  /* ------------------------------------------------------------------ */

  /** Mercenaires proposés : type, sous-types proposés dans la difficulté choisie (modèle du jeu de règles), coût, débloqué ou non */
  mercOffers(): { type: MercType; variants: readonly MercVariant[]; unlocked: boolean; reason?: string; cost: number }[] {
    const c = this.character;
    // the level that opens and prices them (rule `merc.hireLevel`: the character's, a game mode's own)
    const at = RULES['merc.hireLevel'](c);
    return MERCS.map((t) => {
      const lvl = mercUnlockLevel(t);
      const unlocked = at >= lvl;
      // quêtes : Kashya (Cimetière des Sœurs) et Asheara (Gidbinn) offrent un mercenaire
      const free = c.progression.milestones[`freeMerc:act${t.act}`] === 0;
      return { type: t, variants: mercVariantsAt(t, this.difficulty), unlocked, reason: unlocked ? undefined : `Niveau ${lvl} requis`, cost: free ? 0 : mercHireCost(at, t.act) };
    });
  }

  /**
   * Lot 321 (audit 3.6): the acts whose mercenaries the town the hero stands in hires, as Diablo II's captains (Kashya the Rogues, Greiz the
   * Desert Guards, Asheara the Iron Wolves, Qual-Kehk the Barbarians; the Fortress the mod's Act IV mercenaries, if any). Harrogath, the
   * Rush's hub too, adds the acts whose town the hero cannot reach (its act not open at this difficulty, or its maps not on the device): a
   * hero who plays only the Rush still hires them all there. Null outside a town (every act: bots, game modes and tests use `mercOffers`).
   */
  mercActsHere(): number[] | null {
    if (this.mode !== 'town') return null;
    const act = TOWN_HUB[this.world.zone.id];
    if (!act) return null;
    const n = Number(act.slice(3));
    if (n !== 5) return [n];
    return [5, ...[1, 2, 3, 4].filter((a) => !actTownAvailable(`act${a}`) || !!this.actLock(`act${a}`))];
  }

  /**
   * Recrute un mercenaire. PD2 : l'ancien est congédié et laisse tomber son équipement au sol, aux
   * pieds du joueur.
   */
  hireMerc(typeId: MercId, variant: string): { ok: boolean; reason?: string } {
    const c = this.character;
    const offer = this.mercOffers().find((o) => o.type.id === typeId);
    if (!offer) return { ok: false, reason: 'Mercenaire inconnu' };
    if (!offer.unlocked) return { ok: false, reason: offer.reason };
    if (!offer.variants.some((v) => v.id === variant)) return { ok: false, reason: 'Variante inconnue' };
    if (c.gold < offer.cost) return { ok: false, reason: `${offer.cost} pièces d'or requises` };
    const old = c.merc ? Object.values(c.merc.equipment).filter((x): x is Item => !!x) : [];
    c.gold -= offer.cost;
    if (offer.cost === 0 && c.progression.milestones[`freeMerc:act${offer.type.act}`] === 0) c.progression.milestones[`freeMerc:act${offer.type.act}`] = Math.round(c.progression.playTime) || 1;
    const p = this.world.player;
    // en ville, l'équipement de l'ancien mercenaire revient dans le sac (il n'est jamais perdu au sol) ; en zone il tombe aux pieds du joueur
    for (const it of old) if (this.mode !== 'town' || !addToCharacter(c, it)) this.world.dropItem(it, p.x, p.y);
    const cur = mercOf(this.world);
    if (cur) {
      cur.dead = true;
      cur.deathTick = this.world.tick - 999;
    }
    const names = offer.type.names;
    c.merc = { type: typeId, variant, name: names[(this.runCounter + c.level + this.craftSeq++) % names.length], dead: false, equipment: {} };
    // difficulté d'embauche (D2 : ligne de Hireling.txt) : selon le modèle du jeu de règles
    const hire = RULES['merc.model']().hireOf(this.difficulty);
    if (hire !== undefined) c.merc.hire = hire;
    spawnMerc(this.world);
    return { ok: true };
  }

  /** Prix de la résurrection du mercenaire (selon le niveau du personnage) */
  resurrectCost(): number {
    return mercResurrectCost(this.character.level);
  }

  /** Ressuscite le mercenaire mort contre de l'or */
  resurrectMerc(): { ok: boolean; reason?: string } {
    const c = this.character;
    if (!c.merc) return { ok: false, reason: 'Aucun mercenaire' };
    if (!c.merc.dead) return { ok: false, reason: 'Le mercenaire est en vie' };
    const cost = this.resurrectCost();
    if (c.gold < cost) return { ok: false, reason: `${cost} pièces d'or requises` };
    c.gold -= cost;
    c.merc.dead = false;
    spawnMerc(this.world);
    return { ok: true };
  }

  /** Donne un objet de l'inventaire au mercenaire (l'objet qu'il portait revient dans l'inventaire) */
  mercEquip(invIndex: number): { ok: boolean; reason?: string } {
    const c = this.character;
    const it = c.inventory[invIndex];
    if (!it || !c.merc) return { ok: false, reason: 'Aucun mercenaire' };
    const r = canMercEquip(c, it);
    if (!r.ok || !r.slot) return r;
    const prev = c.merc.equipment[r.slot];
    c.inventory[invIndex] = null;
    if (prev && !hasRoomFor(c, prev)) {
      c.inventory[invIndex] = it;
      return { ok: false, reason: 'Inventaire plein' };
    }
    if (prev) placeInInventory(c, prev);
    c.merc.equipment[r.slot] = it;
    refreshMerc(this.world);
    return { ok: true };
  }

  /** Reprend un objet du mercenaire dans le sac */
  mercUnequip(slot: MercSlot): { ok: boolean; reason?: string } {
    const c = this.character;
    const it = c.merc?.equipment[slot];
    if (!it || !c.merc) return { ok: false, reason: 'Emplacement vide' };
    if (!hasRoomFor(c, it)) return { ok: false, reason: 'Inventaire plein' };
    delete c.merc.equipment[slot];
    addToCharacter(c, it);
    refreshMerc(this.world);
    return { ok: true };
  }

  /** Jette un objet de l'inventaire au sol */
  drop(invIndex: number): boolean {
    const c = this.character;
    const it = c.inventory[invIndex];
    if (!it) return false;
    c.inventory[invIndex] = null;
    const p = this.world.player;
    const gi = this.world.dropItem(it, p.x, p.y, 1);
    gi.dropTick = this.world.tick + 60; // pas de ramassage automatique immédiat
    this.world.refreshPlayer();
    return true;
  }

  /** Range un charme du sac dans l'inventaire des charmes (il y devient actif) */
  stowCharm(invIndex: number): boolean {
    const ok = stowCharm(this.character, invIndex);
    if (ok) this.world.refreshPlayer();
    return ok;
  }

  /** Sort un charme de l'inventaire des charmes vers le sac (il y devient inactif) */
  unstowCharm(idx: number): boolean {
    const ok = unstowCharm(this.character, idx);
    if (ok) this.world.refreshPlayer();
    return ok;
  }

  /** Jette un charme de l'inventaire des charmes au sol */
  dropCharm(idx: number): boolean {
    const c = this.character;
    const it = c.charmInv[idx];
    if (!it) return false;
    c.charmInv[idx] = null;
    const p = this.world.player;
    const gi = this.world.dropItem(it, p.x, p.y, 1);
    gi.dropTick = this.world.tick + 60;
    this.world.refreshPlayer();
    return true;
  }

  /** Vend un charme de l'inventaire des charmes */
  sellCharm(idx: number): boolean {
    const c = this.character;
    const it = c.charmInv[idx];
    if (!it) return false;
    c.charmInv[idx] = null;
    const price = this.sellPrice(it);
    c.gold += price;
    this.rememberSold(it, price);
    this.world.refreshPlayer();
    return true;
  }

  /** Trie le sac : équipement par emplacement puis rareté, tassé en haut à gauche */
  sortInventory(): void {
    sortInventory(this.character);
  }

  /** Glisser-déposer d'un objet entre cases du sac et du coffre */
  moveItem(src: GridRef, from: number, dst: GridRef, to: number): boolean {
    const ok = moveItem(this.character, src, from, dst, to);
    if (ok) this.world.refreshPlayer();
    return ok;
  }

  /** Dépose l'objet du sac dans la page `tab` du coffre */
  stash(invIndex: number, tab: number): boolean {
    const ok = moveToStash(this.character, invIndex, tab);
    if (ok) this.world.refreshPlayer();
    return ok;
  }

  /** Prend l'objet de la page `tab` du coffre dans le sac */
  unstash(tab: number, idx: number): boolean {
    const ok = moveFromStash(this.character, tab, idx);
    if (ok) this.world.refreshPlayer();
    return ok;
  }

  /** Sertit une rune/gemme (matériaux) ou un joyau (inventaire) dans un objet de l'inventaire ou équipé */
  socket(target: { invIndex: number } | { slot: Slot }, filler: { material: string; fromTab?: boolean } | { invIndex: number }): SocketResult {
    const c = this.character;
    const item = 'invIndex' in target ? c.inventory[target.invIndex] : c.equipment[target.slot];
    if (!item) return { ok: false, reason: 'Aucun objet' };
    const rng = new Rng(`socket:${item.uid}:${item.socketed.length}:${this.runCounter}`);
    const r = socketItem(c, rng, item, filler);
    if (r.ok) this.world.refreshPlayer();
    return r;
  }

  /**
   * Filtre de butin : applique un préréglage ou modifie un réglage (le préréglage devient
   * « personnalisé »), puis refiltre les objets au sol.
   */
  setFilter(change: { preset: Exclude<FilterPreset, 'custom'> } | Partial<Omit<LootFilterSettings, 'preset'>>): void {
    const f = this.character.filter;
    if ('preset' in change) Object.assign(f, FILTER_PRESETS[change.preset], { preset: change.preset });
    else {
      Object.assign(f, change);
      const keys = Object.keys(change);
      // la révélation et le ramassage automatique ne changent pas le préréglage
      if (keys.some((k) => !['revealHidden', 'autoPickupRunes', 'autoPickupGems', 'autoPickupCharms', 'highlight', 'tierOverride'].includes(k))) f.preset = 'custom';
    }
    this.world.refilter();
  }

  /** Cube horadrique : exécute une recette sur les objets d'inventaire choisis */
  transmute(recipeId: string, invIdx: number[]): CubeResult {
    const c = this.character;
    const rng = new Rng(`cube:${recipeId}:${invIdx.join(',')}:${c.level}:${this.runCounter}:${this.craftSeq++}:${Object.values(c.materials).reduce((a, b) => a + b, 0)}`);
    const r = cubeTransmute(c, rng, recipeId, invIdx);
    if (r.ok) this.world.refreshPlayer();
    return r;
  }

  /** Corruption directe par Éclat de Pierre-Monde (bouton de l'objet) : mêmes règles que la recette du Cube, en ville seulement comme le Cube */
  corruptItemWithShard(ref: CorruptRef): CubeResult {
    if (this.mode !== 'town') return { ok: false, reason: 'À faire en ville' };
    const c = this.character;
    const rng = new Rng(`corrupt:${c.level}:${this.runCounter}:${this.craftSeq++}:${JSON.stringify(ref)}`);
    const r = corruptWithShard(c, ref, rng);
    if (r.ok) this.world.refreshPlayer();
    return r;
  }

  /** Amélioration directe d'une carte (menu de la carte) : mêmes recettes et mêmes coûts que le Cube, en ville seulement */
  upgradeMap(ref: MapRef, opId: MapOpId): CubeResult {
    if (this.mode !== 'town') return { ok: false, reason: 'À faire en ville' };
    const c = this.character;
    const rng = new Rng(`mapup:${opId}:${c.level}:${this.runCounter}:${this.craftSeq++}:${JSON.stringify(ref)}`);
    const r = RULES['maps.upgrade'](c, ref, opId, rng);
    if (r.ok) this.world.refreshPlayer();
    return r;
  }

  /** Fusion en lot des cartes du coffre de cartes (3 → 1) : ville seulement */
  mergeMaps(opts: MergeOpts): MergeResult {
    if (this.mode !== 'town') return { ok: false, reason: 'À faire en ville', lots: 0, consumed: 0, produced: 0, orbsUsed: 0, toTier: opts.tier };
    const c = this.character;
    const rng = new Rng(`mapmerge:${opts.mode}:${opts.tier}:${c.level}:${this.runCounter}:${this.craftSeq++}:${c.mapStash?.length ?? 0}`);
    return RULES['maps.merge'](c, opts, rng);
  }

  /** Appelé après un tri ou un envoi en lot : l'application sauvegarde aussitôt le coffre partagé et le personnage */
  onStashOp: (() => void) | null = null;
  private lastStashOp: { snap: StashSnapshot; sig: string } | null = null;

  /** Une opération de coffre peut-elle être annulée (rien d'autre n'a bougé depuis) ? */
  canUndoStash(): boolean {
    return !!this.lastStashOp && this.lastStashOp.sig === stashSignature(this.character);
  }

  /** Annule le dernier tri / envoi en lot : sac, coffre, cartes et matériaux reviennent à l'état d'avant */
  undoStash(): boolean {
    if (!this.lastStashOp || !this.canUndoStash()) return false;
    restoreSnapshot(this.character, this.lastStashOp.snap);
    this.sharedTabs = this.sharedTabs ? this.character.stash.length - STASH_TABS : 0;
    this.lastStashOp = null;
    this.world.refreshPlayer();
    this.onStashOp?.();
    return true;
  }

  private stashOp<T>(run: () => T, changed: (r: T) => boolean): T {
    const c = this.character;
    const snap = takeSnapshot(c);
    const r = run();
    if (changed(r)) {
      this.lastStashOp = { snap, sig: stashSignature(c) };
      if (this.sharedTabs) this.sharedTabs = c.stash.length - STASH_TABS;
      this.world.refreshPlayer();
      this.onStashOp?.();
    }
    return r;
  }

  /** Trie une page du coffre (« page ») ou tout le coffre en repliant les pages (« all ») ; vrai si le rangement a eu lieu */
  sortStash(scope: 'page' | 'all', tab = 0): boolean {
    return this.stashOp(
      () => (scope === 'all' ? sortAllStash(this.character) >= 0 : sortStashPage(this.character, tab)),
      (ok) => ok,
    );
  }

  /** Envoie tout le sac vers le coffre (garde-fous : équipement, charmes actifs, ceinture, quête ; options de conservation) */
  stashAllBag(opts: StashAllOptions = {}): StashAllResult {
    return this.stashOp(
      () => stashAllFromBag(this.character, opts),
      (r) => r.moved > 0,
    );
  }

  /** Range toutes les cartes du sac dans le coffre de cartes */
  stashAllBagMaps(): number {
    return stashBagMaps(this.character);
  }

  /** Charsi : imprégnation (objet normal sans châsse → rare), une fois par difficulté, après les Outils du métier (Malus rapporté) */
  imbueAvailable(d: Difficulty = this.difficulty): boolean {
    const m = this.character.progression.milestones;
    return this.questDone('malus', d) && m[`imbue:${d}`] === undefined;
  }

  /** Imprégnation de Charsi (une fois par difficulté) : un objet normal sans châsse devient rare (niveau d'objet = niveau + 4) */
  imbue(invIdx: number): { ok: boolean; reason?: string } {
    const c = this.character;
    const it = c.inventory[invIdx];
    if (!it) return { ok: false, reason: 'Aucun objet' };
    if (!this.imbueAvailable()) return { ok: false, reason: 'Déjà utilisée à cette difficulté' };
    const b = baseOf(it);
    // PD2 : objet « normal » (bas de gamme, normal, supérieur) sans châsse ; niveau d'objet = niveau du personnage + 4 (99 au plus)
    if (!b.slot || !['low', 'normal', 'superior'].includes(it.quality) || it.sockets > 0) return { ok: false, reason: 'Seuls les objets normaux sans châsse peuvent être imprégnés' };
    const rng = new Rng(`imbue:${it.uid}:${c.level}:${this.runCounter}`);
    const out = generateItem(rng, it.base, Math.min(99, c.level + 4), { forceQuality: 'rare' });
    out.ethereal = it.ethereal;
    c.inventory[invIdx] = out;
    c.progression.milestones[`imbue:${this.difficulty}`] = Math.round(c.progression.playTime);
    this.world.refreshPlayer();
    return { ok: true };
  }

  /** Larzuk : percement (Siège d'Harrogath), une fois par difficulté */
  socketQuestAvailable(d: Difficulty = this.difficulty): boolean {
    return this.questDone('siege', d) && this.character.progression.milestones[`socketq:${d}`] === undefined;
  }

  /** Objet que Larzuk peut percer (sans tenir compte de la quête) : base à châsses, sans châsse, ni corrompu, ni mot runique */
  socketQuestEligible(it: Item | null): { ok: boolean; reason?: string; max: number } {
    if (!it) return { ok: false, reason: 'Aucun objet', max: 0 };
    const b = baseOf(it);
    const max = maxSocketsForIlvl(b, it.ilvl);
    if (it.corrupted) return { ok: false, reason: 'Déjà corrompu', max };
    if (!b.slot || b.maxSockets <= 0 || max <= 0 || it.sockets > 0 || it.quality === 'runeword') return { ok: false, reason: 'Cet objet ne peut pas recevoir de châsse', max };
    return { ok: true, max };
  }

  /**
   * Vérification sans effet de bord du bouton « Percer (Larzuk) » : quête, utilisation de la difficulté, objet, lieu (ville).
   * `preview` : résultat attendu (le magique tire 1 ou 2, plafonné par la base).
   */
  socketQuestCheck(ref: CorruptRef): { ok: boolean; reason?: string; preview?: string; sockets?: [number, number] } {
    const el = this.socketQuestEligible(corruptRefItem(this.character, ref));
    if (!el.ok) return { ok: false, reason: el.reason };
    if (!this.questDone('siege')) return { ok: false, reason: 'Quête non accomplie (Siège d’Harrogath)' };
    if (!this.socketQuestAvailable()) return { ok: false, reason: 'Déjà utilisée à cette difficulté' };
    if (this.mode !== 'town') return { ok: false, reason: 'À faire en ville, chez Larzuk' };
    const q = corruptRefItem(this.character, ref)!.quality;
    const r: [number, number] = ['low', 'normal', 'superior'].includes(q) ? [el.max, el.max] : q === 'magic' ? [1, Math.min(el.max, 2)] : [1, 1];
    return { ok: true, sockets: r, preview: r[0] === r[1] ? `${r[0]} châsse${r[0] > 1 ? 's' : ''}` : `${r[0]} ou ${r[1]} châsses` };
  }

  /** Larzuk depuis le menu de l'objet (sac, coffre, objet porté) : même règle que le PNJ, en ville */
  socketQuestItem(ref: CorruptRef): { ok: boolean; reason?: string; sockets?: number } {
    const chk = this.socketQuestCheck(ref);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    return this.socketQuestRef(ref);
  }

  /** Ajout de châsses direct par une recette du Cube (menu de l'objet), en ville seulement comme le Cube */
  addSocketsItem(ref: CorruptRef, recipeId: string): CubeResult {
    if (this.mode !== 'town') return { ok: false, reason: 'À faire en ville' };
    const c = this.character;
    const rng = new Rng(`socks:${recipeId}:${c.level}:${this.runCounter}:${this.craftSeq++}:${JSON.stringify(ref)}`);
    const r = addSocketsWith(c, ref, recipeId, rng);
    if (r.ok) this.world.refreshPlayer();
    return r;
  }

  /**
   * Larzuk perce un objet sans châsse (PD2) : objet normal → le maximum de sa base et de son niveau d'objet, magique → 1 ou 2,
   * rare, artisanal, d'ensemble ou unique → 1.
   */
  socketQuest(invIdx: number): { ok: boolean; reason?: string; sockets?: number } {
    return this.socketQuestRef({ from: 'inv', idx: invIdx });
  }

  private socketQuestRef(ref: CorruptRef): { ok: boolean; reason?: string; sockets?: number } {
    const c = this.character;
    const it = corruptRefItem(c, ref);
    if (!it) return { ok: false, reason: 'Aucun objet' };
    if (!this.socketQuestAvailable()) return { ok: false, reason: 'Déjà utilisé à cette difficulté' };
    const el = this.socketQuestEligible(it);
    if (!el.ok) return { ok: false, reason: el.reason };
    const max = el.max;
    const rng = new Rng(`larzuk:${it.uid}:${c.level}:${this.runCounter}`);
    const n = ['low', 'normal', 'superior'].includes(it.quality) ? max : it.quality === 'magic' ? Math.min(max, 1 + rng.int(2)) : 1;
    it.sockets = n;
    c.progression.milestones[`socketq:${this.difficulty}`] = Math.round(c.progression.playTime);
    this.world.refreshPlayer();
    return { ok: true, sockets: n };
  }

  /** Cube en grille : pose un objet de l'inventaire dans le Cube, le reprend, range les runes dans l'onglet, sort des runes de l'onglet */
  cubeAdd(invIdx: number): boolean {
    return cubeAdd(this.character, invIdx);
  }
  /** Met une unité de rune, gemme ou matériau de l'onglet dans le Cube */
  cubeFromTab(id: string): boolean {
    return cubeFromTab(this.character, id);
  }
  /** Anciennes sauvegardes : runes et gemmes physiques → onglets du coffre */
  stashLoose(): number {
    return stashLooseItems(this.character);
  }
  /** Sort l'objet de la case `slot` du Cube vers le sac */
  cubeRemove(slot: number): boolean {
    return cubeRemove(this.character, slot);
  }
  /** Recettes que le contenu actuel du Cube peut réaliser */
  cubeMatches() {
    return cubeMatches(this.character);
  }
  /** Transmute le contenu du Cube avec la recette qui lui correspond */
  transmuteGrid(recipeId: string): CubeResult {
    const c = this.character;
    const rng = new Rng(
      `cubegrid:${recipeId}:${c.level}:${this.runCounter}:${this.craftSeq++}:${cubeItems(c)
        .map((x) => x.uid)
        .join(',')}`,
    );
    const r = cubeRunGrid(c, rng, recipeId);
    if (r.ok) this.world.refreshPlayer();
    return r;
  }
  /** Range la rune ou gemme du sac dans l'onglet des runes */
  depositRune(invIdx: number): boolean {
    return depositToTab(this.character, 'inv', invIdx);
  }
  /** Range toutes les runes et gemmes du sac dans l'onglet ; rend le nombre rangé */
  depositAllRunes(): number {
    return depositAll(this.character);
  }
  /** Sort une unité de l'onglet des runes vers la case `cell` du sac */
  withdrawRuneTo(id: string, cell: number): boolean {
    return withdrawToCell(this.character, id, cell);
  }
  /** Sort jusqu'à `qty` unités de l'onglet des runes dans le sac ; rend le nombre sorti */
  withdrawRune(id: string, qty = 1): number {
    return withdrawFromTab(this.character, id, qty);
  }

  /** Ouvre la run du Pandémonium désignée par une recette du Cube (en Enfer) */
  enterPandemonium(runId: string): boolean {
    // le portail des Vaches s'ouvre dans la difficulté choisie par la recette ; les autres en Enfer
    return this.startRun(runId, runId === 'cows' ? ((this.character.progression.milestones['cows:open'] ?? 0) as Difficulty) : 2);
  }

  /* ------------------------------------------------------------------ */
  /* Marchand et soigneuse                                               */
  /* ------------------------------------------------------------------ */

  sellPrice(it: Item): number {
    const b = baseOf(it);
    const q = { unique: 6, set: 5, rare: 3, runeword: 4, crafted: 3, magic: 1.6, superior: 1.2, normal: 1, low: 0.5 }[it.quality] ?? 1;
    // a game mode's own economy (rule `shop.sellPrice`, lot 292); base: this price
    return RULES['shop.sellPrice'](this, it, Math.max(1, Math.floor((b.price * q) / 4 + it.ilvl * 3)));
  }

  /** Coût de la réparation de tout l'équipement porté (forgerons) */
  repairQuote(): number {
    return repairAllCost(this.character);
  }

  /** Répare tout l'équipement porté ; faux si l'or manque ou si rien n'est à réparer */
  repairEquipment(): boolean {
    const cost = repairAllCost(this.character);
    if (cost <= 0 || repairAll(this.character) === null) return false;
    this.world.refreshPlayer();
    return true;
  }

  /** Vend l'objet du sac (rachetable dans la liste de rachat) */
  sell(invIndex: number): boolean {
    const c = this.character;
    const it = c.inventory[invIndex];
    if (!it) return false;
    c.inventory[invIndex] = null;
    const price = this.sellPrice(it);
    c.gold += price;
    this.rememberSold(it, price);
    this.world.refreshPlayer();
    return true;
  }

  private rememberSold(item: Item, price: number): void {
    this.buyback.unshift({ item, price });
    if (this.buyback.length > BUYBACK_MAX) this.buyback.length = BUYBACK_MAX;
  }

  /** Rachète un objet vendu (même prix que la vente : aucun gain ni perte) */
  rebuy(idx: number): { ok: boolean; reason?: string } {
    const c = this.character;
    const e = this.buyback[idx];
    if (!e) return { ok: false };
    if (c.gold < e.price) return { ok: false, reason: "Pas assez d'or" };
    if (!addToCharacter(c, e.item)) return { ok: false, reason: 'Inventaire plein' };
    c.gold -= e.price;
    this.buyback.splice(idx, 1);
    this.world.refreshPlayer();
    return { ok: true };
  }

  /** Objets que `sellCommon` vendrait (pour demander confirmation avant) */
  sellCommonList(): { index: number; item: Item }[] {
    const out: { index: number; item: Item }[] = [];
    this.character.inventory.forEach((it, index) => {
      if (!it || it.map || it.sockets > 0 || it.runeword || it.corrupted) return;
      if (it.quality !== 'normal' && it.quality !== 'low') return;
      if (!baseOf(it).slot) return;
      out.push({ index, item: it });
    });
    return out;
  }

  /** Vend d'un coup les équipements ordinaires du sac (normaux, inférieurs, sans châsse) ; renvoie le nombre vendu et l'or gagné */
  sellCommon(): { count: number; gold: number } {
    const c = this.character;
    let count = 0;
    let gold = 0;
    for (const { index, item } of this.sellCommonList()) {
      const price = this.sellPrice(item);
      gold += price;
      c.inventory[index] = null;
      this.rememberSold(item, price);
      count++;
    }
    c.gold += gold;
    if (count) this.world.refreshPlayer();
    return { count, gold };
  }

  /** Jeu d'argent (Gheed) : neuf objets inconnus proposés à prix fixe ; l'objet n'est révélé qu'à l'achat */
  gambleStock: GambleEntry[] = [];

  /** Renouvelle l'étal du jeu d'argent (neuf types d'objets tirés à la graine des runs et du niveau) */
  refreshGamble(): void {
    const c = this.character;
    const rng = new Rng(`gamble:${this.runCounter}:${c.level}:${this.gambleRound++}`);
    const types = ['amulet', 'ring', 'circlet', 'gloves', 'belt', 'boots', 'helm', 'armor', 'shield', 'sword', 'axe', 'mace', 'bow', 'wand', 'staff', 'quiver'];
    // neuf types distincts tirés au sort (armes et carquois y compris, avant : toujours les neuf premiers)
    for (let i = types.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [types[i], types[j]] = [types[j], types[i]];
    }
    const stock: GambleEntry[] = [];
    for (let i = 0; i < 9; i++) {
      const t = types[i];
      const pool = BASES.filter(
        (b) => b.type === t && !b.noRandomDrop && b.qlvl <= c.level + 8 && (!b.classOnly || (Array.isArray(b.classOnly) ? b.classOnly : [b.classOnly]).includes(c.classId as never)),
      );
      if (!pool.length) continue;
      const b = pool[rng.int(pool.length)];
      stock.push({ base: b.id, price: Math.round(b.price * 2.2 + c.level * 90) });
    }
    this.gambleStock = RULES['shop.gambleStock'](this, stock);
  }

  private gambleRound = 0;

  /** Achète l'objet inconnu n° `i` : qualité tirée (règle `shop.gambleRoll` ; base : les chances de Diablo II, lot 321) ; renvoie l'objet révélé */
  gamble(i: number): { ok: boolean; item?: Item; reason?: string } {
    const c = this.character;
    const e = this.gambleStock[i];
    if (!e) return { ok: false, reason: 'Objet introuvable' };
    if (c.gold < e.price) return { ok: false, reason: 'Pas assez d’or' };
    const rng = new Rng(`gamble-buy:${this.runCounter}:${c.level}:${i}:${c.gold}:${this.gambleRound}`);
    // quality and item level (rule `shop.gambleRoll`; base since lot 321: Diablo II's odds, the level −5 to +4), drawn before the item
    const roll = RULES['shop.gambleRoll'](this, rng);
    const item = generateItem(rng, e.base, roll.ilvl, { forceQuality: roll.quality });
    if (!hasRoomFor(c, item)) return { ok: false, reason: 'Inventaire plein' };
    c.gold -= e.price;
    addToCharacter(c, item);
    this.gambleStock.splice(i, 1);
    return { ok: true, item };
  }

  /** Lot 316: the act and difficulty the stall was rolled for (null: not yet) */
  private vendorKey: string | null = null;
  /** Lot 316: stalls rolled this session (in the seed: an act left and come back to rolls a new one) */
  private vendorSeq = 0;

  /**
   * Lot 316: the stall as a visit finds it. Diablo II renews a vendor's stock with a new game and on a change of act (act hopping), never
   * at a visit: an item bought is gone until then (before, every contact rolled the same stall again, the item bought back on it)
   */
  visitVendor(): void {
    const key = `${this.lastTown}:${this.difficulty}`;
    if (key === this.vendorKey) return;
    this.vendorKey = key;
    // lot 321: each NPC's stall too, renewed with the act or the difficulty
    this.stalls.clear();
    this.refreshVendor();
  }

  /** Lot 321: the stalls of the NPCs already visited since the last change of act or difficulty (Diablo II: one stock a vendor) */
  private stalls = new Map<string, VendorEntry[]>();
  /** Lot 321: the stall of no NPC in particular (`refreshVendor`'s: bots, game modes, tests, a mod's vendor panel) */
  private genericStall: VendorEntry[] | null = null;
  /** Lot 321: the NPC whose stall `vendor` is (null: the generic stall) */
  vendorNpc: string | null = null;

  /** Lot 321: the trade of town NPC `npc` (Diablo II's vendor table, `VENDORS`), or undefined for the generic stall */
  vendorDef(npc: string | null = this.vendorNpc): VendorDef | undefined {
    return npc ? VENDORS[npc] : undefined;
  }

  /**
   * Lot 321 (audit 3.3): the stall of town NPC `npc` becomes `vendor` (his own wares, kept until a change of act or difficulty as the
   * generic one: an item bought is gone); an NPC who gambles shows a new gamble stock at each visit, as Diablo II's gamble screen does. An NPC
   * without a trade (or none) shows the generic stall.
   */
  openVendor(npc: string | null): void {
    this.visitVendor();
    const def = this.vendorDef(npc);
    this.vendorNpc = def ? npc : null;
    if (!def || !npc) {
      if (this.genericStall) this.vendor = this.genericStall;
      return;
    }
    let st = this.stalls.get(npc);
    if (!st) this.stalls.set(npc, (st = this.rollStall(npc, def)));
    this.vendor = st;
    if (def.gamble) this.refreshGamble();
  }

  /**
   * Lot 321: an NPC's stall: weapons and armour of his types (and the class items of the hero's class he sells), up to the hero's level
   * + 5, normal or magic (Diablo II's vendors sell no rare), a normal one sometimes socketed; the prices of the generic stall
   */
  private rollStall(npc: string, def: VendorDef): VendorEntry[] {
    const c = this.character;
    const rng = new Rng(`vendor:${this.runCounter}:${c.level}:${npc}:${this.vendorSeq}`);
    const ilvl = Math.max(1, c.level);
    const types = new Set([...def.types, ...(def.classItems ? VENDOR_CLASS_TYPES[def.classItems] : [])]);
    const pool = BASES.filter((b) => !!b.slot && types.has(b.type) && !b.noRandomDrop && b.qlvl <= ilvl + 5 && lootBaseAllowed(b));
    const stock: VendorEntry[] = [];
    if (pool.length) {
      const n = Math.min(18, 6 + types.size);
      for (let i = 0; i < n; i++) {
        // the bases of the hero's level more often than the oldest ones
        const b = rng.weighted(pool, (x) => (x.qlvl > ilvl - 12 ? 3 : 1))!;
        const magic = rng.chance(0.4);
        const it = generateItem(rng, b.id, ilvl, { forceQuality: magic ? 'magic' : 'normal' });
        const sockets = !magic && b.maxSockets > 0 && rng.chance(0.25) ? Math.min(maxSocketsForIlvl(b, ilvl), rng.range(2, 4)) : 0;
        if (sockets > 0) it.sockets = sockets;
        stock.push({ item: it, price: this.sellPrice(it) * (sockets > 0 ? 6 : magic ? 5 : 2) });
      }
    }
    const shelf: (Item | null)[] = new Array(VENDOR_COLS * VENDOR_ROWS).fill(null);
    return RULES['shop.vendorStock'](
      this,
      stock.filter((v) => placeIn(shelf, VENDOR_COLS, VENDOR_ROWS, v.item) >= 0),
    );
  }

  /** Renouvelle l'étal du marchand (graine des runs, du niveau et du nombre d'étals de la session) */
  refreshVendor(): void {
    if (!this.gambleStock.length) this.refreshGamble();
    const c = this.character;
    const rng = new Rng(`vendor:${this.runCounter}:${c.level}${this.vendorSeq++ ? `:${this.vendorSeq}` : ''}`);
    const stock: VendorEntry[] = [];
    const ilvl = Math.max(1, c.level);
    const bases = [
      'eagle_orb',
      'sacred_globe',
      'smoked_sphere',
      'arcane_orb',
      'swirling_crystal',
      'circlet',
      'coronet',
      'ring',
      'amulet',
      'gloves_l',
      'leather_boots',
      'sash_l',
      'light_belt',
      'quilted_armor',
      'studded_leather',
      'buckler',
      'small_shield',
      'short_staff',
      'long_staff',
      'gnarled_staff',
      'battle_staff',
      'wolf_head',
      'hawk_helm',
      'antlers',
      'alpha_helm',
    ].filter((b) => BASE_BY_ID[b].qlvl <= ilvl + 5 && lootBaseAllowed(BASE_BY_ID[b]));
    for (let i = 0; i < 8; i++) {
      const it = generateItem(rng, rng.pick(bases), ilvl, { forceQuality: rng.chance(0.25) ? 'rare' : 'magic' });
      stock.push({ item: it, price: this.sellPrice(it) * 5 });
    }
    // armes de la classe (D2 : les marchands vendent des armes de tous types) ; jamais de bâton
    // pour un Barbare, de javelot pour un Nécromancien : lootBaseAllowed filtre par classe
    const weapons = BASES.filter((b) => b.slot === 'mainhand' && b.qlvl <= ilvl + 3 && b.qlvl >= ilvl - 14 && lootBaseAllowed(b));
    // quatre types d'arme distincts (l'étal couvre des styles variés : épée, javelot, arc…)
    const kinds = [...new Set(weapons.map((b) => b.type))];
    for (let i = 0; i < 4 && kinds.length; i++) {
      const kind = kinds.splice(rng.range(0, kinds.length - 1), 1)[0];
      const it = generateItem(rng, rng.pick(weapons.filter((b) => b.type === kind)).id, ilvl, { forceQuality: rng.chance(0.25) ? 'rare' : rng.chance(0.5) ? 'magic' : 'normal' });
      // une arme blanche de base est bon marché (D2 : quelques dizaines d'or) ; les magiques et rares coûtent cher
      stock.push({ item: it, price: this.sellPrice(it) * (it.quality === 'normal' ? 2 : 5) });
    }
    // bases blanches à châsses (runewords)
    for (const b of ['short_staff', 'long_staff', 'gnarled_staff', 'quilted_armor', 'leather_armor', 'cap', 'skull_cap', 'buckler', 'small_shield', 'crystal_sword']) {
      if (BASE_BY_ID[b].qlvl > ilvl + 8) continue;
      const it = generateItem(rng, b, ilvl, { forceQuality: 'normal' });
      it.sockets = Math.min(BASE_BY_ID[b].maxSockets, rng.range(2, 4));
      stock.push({ item: it, price: this.sellPrice(it) * 6 });
    }
    // le stock tient dans la grille 10 × 10 du panneau d'échange (taille des objets) ; ce qui ne rentre pas n'est pas proposé
    const shelf: (Item | null)[] = new Array(VENDOR_COLS * VENDOR_ROWS).fill(null);
    // a game mode may keep its own stall (rule `shop.vendorStock`, lot 292); base: this one
    this.vendor = RULES['shop.vendorStock'](
      this,
      stock.filter((v) => placeIn(shelf, VENDOR_COLS, VENDOR_ROWS, v.item) >= 0),
    );
    this.genericStall = this.vendor;
    this.vendorNpc = null;
  }

  /** Achète l'objet `idx` de l'étal */
  buy(idx: number): { ok: boolean; reason?: string } {
    const c = this.character;
    const e = this.vendor[idx];
    if (!e) return { ok: false };
    if (c.gold < e.price) return { ok: false, reason: "Pas assez d'or" };
    if (!addToCharacter(c, e.item)) return { ok: false, reason: 'Inventaire plein' };
    c.gold -= e.price;
    this.vendor.splice(idx, 1);
    return { ok: true };
  }

  /** Achats de consommables : potions, clés */
  buyConsumable(baseId: 'hp_potion' | 'mp_potion' | 'key' | 'tome_portal' | (string & {}), qty = 1, npc?: string | null): { ok: boolean; reason?: string } {
    const c = this.character;
    // lot 321: from an NPC of Diablo II's table, the potions of his tier at the difficulty, at Diablo II's price (Misc.txt)
    const tier = baseId === 'hp_potion' || baseId === 'mp_potion' ? vendorPotionTier(this.vendorDef(npc ?? null), this.difficulty) : null;
    // a game mode may sell none (rule `shop.consumable`; base: all)
    if (!RULES['shop.consumable'](this, baseId)) return { ok: false, reason: 'Non vendu ici' };
    if (isThrowPotion(baseId)) {
      // potions de jet : prix de weapons.txt, un achat = un paquet de 5 (ou `qty`), niveau requis respecté
      const tb = BASE_BY_ID[baseId];
      if (c.level < tb.reqLvl) return { ok: false, reason: `Niveau ${tb.reqLvl} requis` };
      const n = Math.min(qty, THROW_STACK_MAX);
      if (c.gold < tb.price * n) return { ok: false, reason: "Pas assez d'or" };
      const left = addThrowPotions(c, baseId, n);
      if (left >= n) return { ok: false, reason: 'Réserve pleine' };
      c.gold -= tb.price * (n - left);
      return { ok: true };
    }
    const unit = baseId === 'key' ? 50 : baseId === 'tome_portal' ? 450 : tier !== null ? POTION_PRICES[baseId as 'hp_potion' | 'mp_potion'][tier] : Math.max(25, c.level * 6);
    const cost = unit * qty;
    if (c.gold < cost) return { ok: false, reason: "Pas assez d'or" };
    const rng = new Rng(`buy:${this.craftSeq++}:${qty}`);
    let bought = 0;
    for (let i = 0; i < qty; i++) {
      const it = makeStack(rng, baseId, 1);
      // lot 316: the hero's level as its item level (its tier read from it, src/sim/potion-tier.ts)
      if (baseId === 'hp_potion' || baseId === 'mp_potion') it.ilvl = tier !== null ? POTION_LEVELS[tier] : Math.max(1, c.level);
      if (!addToCharacter(c, it)) break;
      bought++;
    }
    if (bought === 0) return { ok: false, reason: 'Ceinture pleine' };
    c.gold -= unit * bought;
    return { ok: true };
  }

  /** Guérisseur (Akara, Fara, Ormus, Jamella, Malah) : soins complets du héros (vie, mana, poison) et du mercenaire, comme dans Diablo II */
  heal(): void {
    const p = this.world.player;
    p.hp = p.hpMax;
    p.mana = p.manaMax;
    p.poisonT = 0;
    p.poisonRate = 0;
    const m = this.world.monsters.find((x) => x.pet === 'merc' && !x.dead);
    if (m) m.hp = m.hpMax;
  }

  /* ------------------------------------------------------------------ */
  /* Sauvegarde                                                          */
  /* ------------------------------------------------------------------ */

  /** Onglets du coffre partagé attachés après les onglets personnels (0 : aucun, bots et tests) */
  sharedTabs = 0;

  /** Dernière migration des pages personnelles vers le coffre partagé (null : rien à migrer à ce chargement) */
  stashMigration: { moved: number; left: number; added: number } | null = null;

  /**
   * Attache le coffre partagé : ses pages suivent les pages personnelles dans `character.stash`.
   * Le coffre est UNIQUE : les objets des pages personnelles sont déplacés vers des pages partagées libres
   * (pages créées jusqu'à MAX_SHARED_TABS). Idempotent ; sans perte : ce qui ne tient pas reste dans les pages
   * personnelles ; un `uid` n'existe jamais deux fois (en cas d'interruption entre les deux sauvegardes, la
   * copie personnelle d'un objet déjà présent dans le partagé est écartée).
   */
  /**
   * Met la taille du sac en accord avec le réglage `bigInventory` (à appeler après avoir remplacé `settings`). Agrandir ajoute des rangées
   * en dessous sans rien déplacer ; réduire replie les objets des rangées du bas dans les cases libres, puis dans le coffre.
   * Renvoie faux (et laisse le réglage à « actif ») si ça ne tient pas : jamais de perte.
   */
  applyInventorySize(): boolean {
    const want = this.settings.bigInventory === true;
    const ok = resizeInventory(this.character, want ? INV_BIG_ROWS : INV_BASE_ROWS);
    if (!ok) this.settings.bigInventory = true;
    return ok;
  }

  /** Active ou désactive le grand inventaire ; renvoie faux si les objets des rangées du bas ne tiennent nulle part (réglage inchangé) */
  setBigInventory(on: boolean): boolean {
    const prev = this.settings.bigInventory;
    this.settings.bigInventory = on;
    if (this.applyInventorySize()) return true;
    this.settings.bigInventory = prev;
    return false;
  }

  /**
   * Attache le coffre partagé entre personnages (pages après les pages personnelles) ; les objets des anciennes pages personnelles y sont
   * fusionnés quand il y a la place (`stashMigration` signale qu'une sauvegarde du partagé est nécessaire)
   */
  attachShared(shared: SharedStash | null): void {
    const c = this.character;
    const personal = c.stash.slice(0, STASH_TABS);
    c.stash.length = STASH_TABS;
    const tabs = (shared ?? emptyShared()).tabs.slice(0, MAX_SHARED_TABS);
    while (tabs.length < SHARED_TABS) tabs.push(new Array(STASH_TAB_SIZE).fill(null));
    for (let k = 0; k < tabs.length; k++) {
      // coffre partagé d'avant la grille 10 × 8 : objets replacés selon leur taille
      const t = relayoutStash(tabs[k]);
      while (t.length < STASH_TAB_SIZE) t.push(null);
      tabs[k] = t;
    }
    // doublons : le coffre partagé fait foi
    const known = new Set<string>();
    for (const t of tabs)
      for (let i = 0; i < t.length; i++) {
        const it = t[i];
        if (!it) continue;
        if (known.has(it.uid)) t[i] = null;
        else known.add(it.uid);
      }
    const before = tabs.length;
    const todo: Item[] = [];
    for (const p of personal)
      for (let i = 0; i < p.length; i++) {
        const it = p[i];
        if (!it) continue;
        if (known.has(it.uid))
          p[i] = null; // déjà dans le partagé
        else todo.push(it);
      }
    let moved = 0;
    if (todo.length) {
      const left = new Set(placeInSharedTabs(tabs, todo).map((x) => x.uid));
      for (const p of personal)
        for (let i = 0; i < p.length; i++)
          if (p[i] && !left.has(p[i]!.uid)) {
            p[i] = null;
            moved++;
          }
      this.stashMigration = { moved, left: left.size, added: tabs.length - before };
    } else this.stashMigration = null;
    for (const t of tabs) c.stash.push(t);
    this.sharedTabs = tabs.length;
    this.sharedOrphans = shared?.orphans ?? [];
  }

  /** Objets restés dans les pages personnelles (plafond du coffre partagé atteint) */
  personalLeftovers(): number {
    if (!this.sharedTabs) return 0;
    let n = 0;
    for (let t = 0; t < STASH_TABS; t++) for (const it of this.character.stash[t] ?? []) if (it) n++;
    return n;
  }

  /** Coffre partagé à sauvegarder (null s'il n'est pas attaché) */
  sharedStash(): SharedStash | null {
    if (!this.sharedTabs) return null;
    const tabs = this.character.stash.slice(STASH_TABS, STASH_TABS + this.sharedTabs);
    return this.sharedOrphans.length ? { version: 1, tabs, orphans: this.sharedOrphans } : { version: 1, tabs };
  }

  /** Sauvegarde du personnage (sans le coffre partagé, qui a la sienne : `sharedStash()`) */
  toSave(): SaveData {
    return {
      version: SAVE_VERSION,
      ruleset: this.ruleset,
      // onglets personnels seulement : le coffre partagé a sa propre sauvegarde
      character: this.sharedTabs ? { ...this.character, stash: this.character.stash.slice(0, STASH_TABS) } : this.character,
      settings: this.settings,
      runCounter: this.runCounter,
      craftSeq: this.craftSeq,
      town: this.lastTown,
      run:
        this.mode === 'town' && this.suspended
          ? {
              runId: this.suspended.runDef.id,
              difficulty: this.suspended.difficulty,
              seed: this.suspended.runSeed,
              zoneLevel: this.suspended.world.zoneLevel,
              world: this.suspended.world.snapshot(),
              mapItem: this.suspended.runDef.id === 'map' ? (this.suspended.activeMap ?? undefined) : undefined,
              suspended: true,
              corrupt: this.suspended.corrupt || undefined,
              ...modStateOf(this.suspended.world),
            }
          : this.mode === 'run' && this.runDef && !this.world.player.dead
            ? {
                runId: this.runDef.id,
                difficulty: this.difficulty,
                seed: this.runSeed,
                zoneLevel: this.world.zoneLevel,
                world: this.world.snapshot(),
                mapItem: this.runDef.id === 'map' ? (this.activeMap ?? undefined) : undefined,
                corrupt: this.corrupt || undefined,
                ...modStateOf(this.world),
              }
            : null,
      // quarantaine : écrite seulement si elle existe (une sauvegarde valide garde exactement sa forme)
      ...(this.orphans.length ? { orphans: this.orphans } : {}),
    };
  }

  /** Remet à zéro le compteur d'identifiants d'objets (tests qui comparent des parties) */
  static resetIds(): void {
    resetUidCounter(0);
  }
}

/** State of a game mode's run director for the save (`SaveData.run.modState`); nothing for a run without one (every base run) */
function modStateOf(w: World): { modState?: unknown } {
  const st = w.run?.director?.snapshot?.();
  return st === undefined ? {} : { modState: st };
}

/** Lot 312: the towns a waypoint leads to, by zone (their act), and their zone as `enterTown` builds it */
/** Lot 315: a zone of the base's Campaign (not a Rush run, an endgame map, nor a game mode's round: hidden, with its director) */
export const isCampaignZone = (d: RunDef): boolean => !!d.campaign && !d.hidden && !d.director;

/**
 * Lot 316: life and mana go with the hero from `from` to `to` (null: a town) when neither is a Rush run, a game mode's round or an endgame
 * map: the Campaign's zones and towns, as Diablo II (a healer heals, a level gained heals); a Rush run or a round still starts whole
 */
export const keepsVitals = (from: RunDef | null, to: RunDef | null): boolean => (!from || isCampaignZone(from)) && (!to || isCampaignZone(to));

/** Lot 316: the hero's life, mana and potion still flowing from `from`'s world into `to`'s (capped at `to`'s maxima); none from a dead hero */
export function carryVitals(from: World, to: World): void {
  const a = from.player;
  const b = to.player;
  if (a.dead) return;
  b.hp = Math.max(1, Math.min(b.hpMax, a.hp));
  b.mana = Math.max(0, Math.min(b.manaMax, a.mana));
  b.healT = a.healT;
  b.healPerTick = a.healPerTick;
  b.manaHealT = a.manaHealT;
  b.manaHealPerTick = a.manaHealPerTick;
  b.poisonT = a.poisonT;
  b.poisonRate = a.poisonRate;
}

/** Lot 319: the town of act `act` can be built (its maps on the device; Harrogath always) */
function actTownAvailable(act: string): boolean {
  return act === 'act1' ? act1Available() : act === 'act2' ? act2Available() : act === 'act3' ? act3Available() : act === 'act4' ? act4Available() : act === 'act5';
}
const CAMPAIGN_NAMES: Record<string, string> = { act1: 'Acte I', act2: 'Acte II', act3: 'Acte III', act4: 'Acte IV', act5: 'Acte V' };

const TOWN_HUB: Record<string, string> = { a1_town: 'act1', a2_town: 'act2', a3_town: 'act3', a4_fortress: 'act4', harrogath: 'act5' };
function hubZoneOf(id: string): ZoneDef | null {
  if (id === 'a1_town') return act1Available() ? buildA1(id, 1, 0) : null;
  if (id === 'a2_town') return act2Available() ? buildA2(id, 1, 0) : null;
  if (id === 'a3_town') return act3Available() ? buildA3(id, 1, 0) : null;
  if (id === 'a4_fortress') return act4Available() ? buildA4(id, 1, 0) : null;
  return id === 'harrogath' ? buildHarrogath() : null;
}

/** Zone corrompue : niveau de zone et modificateurs (monstres plus durs, plus d'expérience et de butin) */
export const CORRUPT_LEVEL = 85;
const CORRUPT_MODS = [
  { id: 'corrupted', value: 1 },
  { id: 'monsterLife', value: 30 },
  { id: 'monsterDamage', value: 20 },
  { id: 'xpBonus', value: 40 },
  { id: 'itemQuantity', value: 20 },
];
