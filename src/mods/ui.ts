/**
 * Points d'insertion d'interface des mods (plan, §2.4 (3), lot M12) : un endroit nommé de l'interface de la base où un mod AJOUTE quelque
 * chose (un bouton, une section, un écran, une ligne d'action). Contrairement aux règles nommées (rules.ts : un seul propriétaire, qui
 * remplace), un point d'insertion a plusieurs contributeurs : la base les affiche tous, dans l'ordre d'enregistrement (refonte du jeu de
 * règles, puis modes de jeu). Un mod les déclare à l'enregistrement (`api.ui.add('levelUp', …)`) ; après le gel (fin de l'activation),
 * plus aucun ajout. Sans mod, chaque point est vide : l'interface de la base reste celle d'avant.
 *
 * Les contextes ne donnent au mod que ce qu'il lui faut (partie, objet, messages, pause) : jamais l'objet `Panels` ni l'application.
 * Une contribution qui lève une erreur est journalisée et ignorée (`contributions` ne la retire pas ; l'appelant protège l'appel par
 * `safely`) : un mod défaillant ne casse pas l'écran de la base.
 * Module feuille (types seulement).
 */
import type { Game } from '../sim/game';
import type { Item } from '../sim/item';
import type { CorruptRef } from '../sim/cube';
import type { ActEntry } from '../ui/panels-shared';

/** Ligne d'un menu d'actions d'objet (menu « Artisanat ») : celle de la base */
export type ModActEntry = ActEntry;

/** Messages et retours de l'interface de la base, communs à tous les contextes en jeu */
export interface UiHost {
  /** Message discret du HUD */
  message(text: string, color?: string): void;
  /** Retour tactile et sonore : `tap` (réussite), `fail` (refus) */
  haptic(kind: 'tap' | 'fail'): void;
  /** Son d'un objet manipulé (type de base) */
  itemSound(type: string): void;
  /**
   * Opens a panel of the base over the game (lot 285: a game mode's hub between rounds, without walking in town): character, inventory,
   * skills, stash, the equipment vendor (Charsi / Larzuk), the settings, the waypoint. Absent where no panel can open (inside a panel)
   */
  openPanel?(name: ModPanel): void;
  /** Saves then opens the character list of the mode (lot 298: a game mode's pause and hub). Absent where it cannot (tests) */
  characterList?(): void;
  /** Saves then opens the game's home screen (the modes, the links; lot 298). Absent where it cannot (tests) */
  homeScreen?(): void;
  /**
   * Loads the D2 maps of an act's zones (1 to 5) if they are not yet, the loading screen over the game (lot 305: a game mode's run of
   * another act than the town's, its arenas cut from the real maps). Absent where it cannot (tests): the zones keep their own look
   */
  loadActMaps?(act: number): Promise<void>;
}

/** Panels a mod may open (`UiHost.openPanel`) */
export type ModPanel = 'character' | 'inventory' | 'skills' | 'stash' | 'vendor' | 'settings' | 'waypoint';

/** Contexte en jeu : la partie et les retours de l'interface */
export interface GameUiCtx {
  game: Game;
  host: UiHost;
}

/** Écran plein du mod (écran de choix au level-up, menu d'un mode de jeu…) : monté au-dessus du jeu, la simulation en pause */
export interface UiScreen {
  /** Monte `node` au-dessus du jeu et met la partie en pause ; `close` le retire et relance la partie */
  open(node: HTMLElement): { close(): void };
}

/** Menu principal et sélection des personnages (avant la partie : aucune partie chargée) */
export interface MenuCtx {
  /** Conteneur de l'écran de sélection (une fenêtre du mod s'y ajoute) */
  root: HTMLElement;
  /** Relit la liste des personnages et redessine l'écran */
  refresh(): void;
}

/** Bouton du menu principal (écran Diablo II : « Un joueur », « Crédits »… ; écran de base : rangée de boutons de la liste) */
export interface MenuButton {
  /** Libellé (texte source en français, traduit par src/i18n et le dictionnaire du mod) */
  label: string;
  run(ctx: MenuCtx): void | Promise<void>;
}

export interface LevelUpCtx extends GameUiCtx {
  /** Niveau atteint */
  level: number;
  screen: UiScreen;
}

/** Élément du HUD d'un mod : posé au démarrage de la partie, `update` à chaque image affichée (≈ 60 i/s : rester léger) */
export interface HudWidget {
  el: HTMLElement;
  update?(game: Game): void;
}

export interface HudCtx extends GameUiCtx {
  screen: UiScreen;
}

/** End of a run (its boss or objective done), as recorded by the game (`Game.lastRunSummary`) */
export interface RunCompleteSummary {
  runId: string;
  seconds: number;
  kills: number;
  difficulty: number;
}

export interface RunCompleteCtx extends GameUiCtx {
  screen: UiScreen;
  summary: RunCompleteSummary;
}

export interface ItemActCtx extends GameUiCtx {
  item: Item;
  /** Emplacement de l'objet (sac, coffre, équipement) pour les fonctions de la partie qui le modifient */
  ref: CorruptRef;
  /** En ville (l'artisanat ne se fait qu'en ville) */
  town: boolean;
  /** Redessine les panneaux (après une action) */
  render(): void;
  /** Ferme le menu d'actions ouvert */
  closeMenu(): void;
}

export interface TownCtx extends GameUiCtx {
  screen: UiScreen;
  /** Redessine les panneaux */
  render(): void;
  /** Ferme les panneaux (avant de lancer une run) */
  close(): void;
}

/**
 * Points d'insertion et forme de chaque contribution. Ajouter un point : une entrée ici, l'appel dans l'interface de la base
 * (`contributions(nom)`), une ligne dans docs/MODS.md et un test (tests/unit/mods-ui.test.ts).
 */
export interface UiSlots {
  /** Menu principal (écran Diablo II) et écran de sélection de base : boutons ajoutés après ceux de la base */
  'menu.buttons': MenuButton;
  /**
   * Nouveau personnage du jeu de règles de la session, juste après sa création (avant la première sauvegarde) : état de départ d'un mode de
   * jeu ; `variant`: the game mode's variant picked on the creation screen (`ModManifest.variants`, lot 289), absent without a choice
   */
  'create.character': (ctx: { game: Game; variant?: string }) => void;
  /** Fiche du personnage : section ajoutée sous les statistiques (null : rien pour ce personnage) */
  'character.sheet': (ctx: GameUiCtx) => HTMLElement | null;
  /** Montée de niveau (une fois par niveau gagné, après le bandeau « Niveau N ! ») : un écran de choix peut s'ouvrir (`ctx.screen`) */
  levelUp: (ctx: LevelUpCtx) => void;
  /** HUD : élément posé au démarrage de la partie (null : rien) */
  hud: (ctx: HudCtx) => HudWidget | null;
  /** Ville, point de passage (vue « Rush ») : section ajoutée sous les runs (un mode de jeu y propose son entrée) */
  'town.waypoint': (ctx: TownCtx) => HTMLElement | null;
  /** Menu « Artisanat » d'un objet sans châsse : lignes ajoutées après celles de Larzuk et avant les recettes d'ajout de châsses */
  'item.socketActions': (ctx: ItemActCtx) => ModActEntry[];
  /** End of a run (boss killed, portal open): a game mode's end-of-run screen (`ctx.screen`, recap, loot left on the ground) */
  'run.complete': (ctx: RunCompleteCtx) => void;
  /**
   * Lot 299: a character's card on the selection screen (the session's mode only): lines shown in place of "Level N Class" and the
   * difficulty (the first in place of the level line); null: the base's lines (a mode whose level means nothing between its runs)
   */
  'charselect.card': (ctx: CharCardCtx) => string[] | null;
}

/** What the selection screen knows of a character (its save is not loaded): the summary and the milestones of its progression */
export interface CharCardCtx {
  ruleset: string;
  classId: string;
  /** The class's display name */
  className: string;
  level: number;
  difficulty: number;
  milestones: Readonly<Record<string, number>>;
}

export type UiSlotName = keyof UiSlots;

/** Noms des points d'insertion (contrôle à l'exécution : un mod écrit en JavaScript ou d'une autre version) */
export const UI_SLOT_NAMES: readonly UiSlotName[] = ['menu.buttons', 'create.character', 'character.sheet', 'levelUp', 'hud', 'town.waypoint', 'item.socketActions', 'run.complete', 'charselect.card'];

const SLOTS = new Map<UiSlotName, { mod: string; c: unknown }[]>();
let frozen = false;

export function isUiSlot(name: string): name is UiSlotName {
  return (UI_SLOT_NAMES as readonly string[]).includes(name);
}

/** Ajoute une contribution du mod `mod` au point `slot` (activation : avant le gel) */
export function addUi<K extends UiSlotName>(mod: string, slot: K, c: UiSlots[K]): void {
  if (frozen) throw new Error(`Interface : ajout de « ${mod} » au point « ${slot} » refusé après l'activation`);
  if (!isUiSlot(slot)) throw new Error(`Interface : point d'insertion inconnu « ${String(slot)} » (mod « ${mod} »)`);
  if (slot === 'menu.buttons' ? !c || typeof (c as MenuButton).label !== 'string' || typeof (c as MenuButton).run !== 'function' : typeof c !== 'function')
    throw new Error(`Interface : contribution de « ${mod} » au point « ${slot} » mal formée`);
  const list = SLOTS.get(slot) ?? [];
  list.push({ mod, c });
  SLOTS.set(slot, list);
}

/** Contributions d'un point d'insertion, dans l'ordre d'enregistrement (vide sans mod) */
export function contributions<K extends UiSlotName>(slot: K): readonly UiSlots[K][] {
  return (SLOTS.get(slot) ?? []).map((x) => x.c as UiSlots[K]);
}

/** Mods qui contribuent à un point (tests, diagnostic) */
export function uiOwners(slot: UiSlotName): string[] {
  return (SLOTS.get(slot) ?? []).map((x) => x.mod);
}

/** Gel (fin de l'activation, activate.ts) */
export function freezeUi(): void {
  frozen = true;
}

/**
 * Appelle une contribution sans laisser son erreur casser l'écran de la base : l'erreur est rendue à `onError` (journal d'erreurs de
 * l'application), le résultat vaut alors `fallback`.
 */
export function safely<T>(f: () => T, fallback: T, onError: (e: unknown) => void = (e) => console.error(e)): T {
  try {
    return f();
  } catch (e) {
    onError(e);
    return fallback;
  }
}

/**
 * Level-up screens one at a time (lot 273): the `levelUp` contributions of a level run only while no mod screen is open; levels gained
 * meanwhile (several in one step, a boss, a quest) wait in order and run when the last screen closes.
 */
export class LevelUpGate {
  private open = 0;
  private readonly queue: number[] = [];

  constructor(private readonly run: (level: number) => void) {}

  /** Mod screens currently open */
  get screensOpen(): number {
    return this.open;
  }

  /** Levels still waiting for their screens */
  get waiting(): readonly number[] {
    return this.queue;
  }

  screenOpened(): void {
    this.open++;
  }

  screenClosed(): void {
    this.open = Math.max(0, this.open - 1);
    this.flush();
  }

  push(level: number): void {
    this.queue.push(level);
    this.flush();
  }

  private flush(): void {
    while (this.open === 0 && this.queue.length) this.run(this.queue.shift()!);
  }
}
