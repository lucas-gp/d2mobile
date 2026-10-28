/**
 * Sauvegarde versionnée avec migrations. Le format est du JSON pur :
 * personnage complet (équipement, coffre, compétences, progression), réglages, et
 * l'instantané de la run en cours (monstres, objets au sol, générateurs) pour reprendre
 * exactement où l'on en était, même si le navigateur a fermé l'onglet.
 */
import type { Difficulty } from '../data/types';
import { DEFAULT_FILTER, FILTER_PRESETS } from './lootfilter';
import type { CharacterState } from './character-state';
import type { Item } from './item';
import { BASE_BY_ID } from '../data/items/bases';
import { CHARM_COLS, CHARM_ROWS, isCharmType } from './character';
import { sanitizeHighlight } from './loot/highlight';
import { sanitizeTierOverride } from './loot/tiers';
import { placeIn, itemSize, hasRoomInStash, placeInStash } from './inventory';
import type { RngState } from '../core/rng';
import { normalizeModSettings, type ModSettingsMap } from '../mods/settings';
import type { Monster, PlayerBuff } from './actors';
import { quarantineSave, type OrphanItem } from './save-orphans';

export const SAVE_VERSION = 7;

/**
 * Jeu de règles (ruleset) d'un personnage : la base et les mods actifs, fixés à la création et jamais changés ensuite (les objets ne
 * stockent que des identifiants et des tirages positionnels, qui n'ont de sens que sous les règles qui les ont produits). Aujourd'hui un
 * seul ruleset existe : `pd2`, le contenu actuel du jeu. Une sauvegarde d'avant la version 7 n'en a pas : elle reçoit `pd2`.
 */
export const DEFAULT_RULESET = 'pd2';

/** Anciennes bases en double fusionnées (v5) : ancien id → id conservé. */
export const LEGACY_BASE_ALIAS: Record<string, string> = {
  kris: 'kriss',
  sash: 'sash_l',
  belt: 'belt_m',
  leather_gloves: 'gloves_l',
  gauntlets: 'gaunlets_h',
  boots: 'leather_boots',
};

/** Réécrit récursivement les `base` obsolètes (équipement, sac, coffres, butin au sol…). */
export function remapLegacyBases(node: unknown): void {
  if (Array.isArray(node)) {
    for (const x of node) remapLegacyBases(x);
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.base === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_BASE_ALIAS, o.base)) o.base = LEGACY_BASE_ALIAS[o.base];
    for (const k of Object.keys(o)) if (o[k] && typeof o[k] === 'object') remapLegacyBases(o[k]);
  }
}

export interface Settings {
  sound: number;
  music: number;
  haptics: 0 | 1 | 2;
  quality: 'auto' | 'low' | 'medium' | 'high';
  showPerf: boolean;
  /** Diagnostic : dessine les cases bloquées de la zone (murs invisibles) */
  showCollisions: boolean;
  /** Zoom de la caméra (plage limitée) */
  zoom: number;
  leftHanded: boolean;
  /** Commandes : auto (selon l'appareil et la dernière entrée), tactile, ou souris + clavier (mode PC) */
  controls: 'auto' | 'touch' | 'pc';
  /** Grandes cases d'inventaire (panneau défilant) : auto = écran tactile */
  bigCells: 'auto' | 'on' | 'off';
  /** Taux de butin (palier de src/data/rates.ts) */
  lootRate: 'normal' | 'fast' | 'veryfast' | 'abundant';
  damageNumbers: boolean;
  screenShake: number;
  instantCast: boolean;
  /** Obscurité hors du rayon de lumière : clair (tout l'écran visible), pénombre, Diablo 2 */
  lighting: 'clair' | 'penombre' | 'd2';
  /** Conseils de prise en main, et ceux déjà vus */
  tips: boolean;
  tipsSeen: string[];
  /** Ramassage automatique des runes : aucune, sous Pul, sous Vex, toutes */
  autoPickupRunes?: 'none' | 'pul' | 'vex' | 'all';
  /** Ramassage automatique des gemmes : aucune, toutes, normales et plus, sans défaut et plus */
  autoPickupGems?: 'none' | 'all' | 'normal' | 'flawless';
  /** Ramassage automatique des potions tant que la ceinture a de la place pour leur type */
  autoPickupPotions?: boolean;
  /** Ramassage automatique des composants (éclats de Pierre-Monde, orbes, clés, essences…) */
  autoPickupMaterials?: boolean;
  /** Remplissage automatique de la ceinture depuis le sac */
  beltRefill?: boolean;
  /** Durabilité des armes et armures : absent = activée (module, tests, bots) ; l'application la désactive par défaut (APP_SETTINGS_DEFAULTS) */
  durability?: boolean;
  /** Réinitialisation gratuite et illimitée des caractéristiques et compétences : absent = non (module, tests) ; activée par défaut dans l'application */
  freeRespec?: boolean;
  /** Potions de soin, de mana et de rajeunissement : montée en gamme automatique avec le niveau du personnage ; absent = non (module, tests, bots), activée par défaut dans l'application */
  potionUpgrade?: boolean;
  /** Allure : true = marche (touche R / bouton du HUD), absent = course. Réglage local. */
  walkMode?: boolean;
  /** Qualité d'image (filtre plein écran de la scène, réglage local) : netteté 0 = aucune … 3 = forte ; absent = neutre */
  imageSharpen?: ImageSharpen;
  /** Lissage léger des bords (anti-crénelage) : absent = non */
  imageSmooth?: boolean;
  /** Ambiance colorée façon Diablo II : absent = normale (aucun filtre) */
  imageMood?: ImageMood;
  /** Mise à l'échelle de l'image : absent = normale (rendu direct) */
  imageScale?: ImageScale;
  /** Bouton de qualité d'image dans le jeu (touche V toujours active) : absent = non */
  imageButton?: boolean;
  /** Moteur de rendu : absent = WebGL (module, tests, bots) ; WebGPU est expérimental, appliqué au prochain lancement, repli automatique sur WebGL */
  renderEngine?: 'webgl' | 'webgpu';
  /** Éclairage dynamique (couche de lumière du rendu, réglage local) : absent = désactivé (module, tests, bots) ; l'application met Léger par défaut */
  dynamicLight?: DynamicLight;
  /** Grand inventaire : 10 × 8 cases au lieu de 10 × 4 (rangées ajoutées en dessous) ; absent = non (module, tests, bots), activé par défaut dans l'application */
  bigInventory?: boolean;
  /** Bouton Marche / Course dans le jeu (touche R toujours active) : absent = non (masqué) */
  walkButton?: boolean;
  /**
   * Réglages propres aux mods, par mod (src/mods/settings.ts : `modSetting`) ; absent tant qu'aucun n'a de valeur. Mod pd2 : ramassage
   * des cartes, confirmations de corruption et d'opération de carte (autrefois à la racine, repris par `withDefaultSettings`).
   */
  mods?: ModSettingsMap;
}

export type DynamicLight = 'off' | 'light' | 'normal';
export type ImageSharpen = 0 | 1 | 2 | 3;
export type ImageScale = 'normal' | 'soft' | 'pixel';
export type ImageMood = 'normal' | 'dark' | 'warm' | 'cold' | 'vivid';

export const DEFAULT_SETTINGS: Settings = {
  sound: 0.8,
  music: 0.5,
  haptics: 1,
  quality: 'auto',
  showPerf: false,
  showCollisions: false,
  zoom: 1,
  leftHanded: false,
  controls: 'auto',
  bigCells: 'auto',
  lootRate: 'abundant',
  damageNumbers: true,
  screenShake: 1,
  instantCast: false,
  lighting: 'penombre',
  tips: true,
  tipsSeen: [],
  // ramassage automatique : champs absents = neutre (module, tests, bots et sauvegardes sans réglage gardent le comportement
  // historique) ; seule l'application les renseigne (APP_SETTINGS_DEFAULTS), ce qui permet de distinguer « jamais choisi » de « Aucune »
};

/** Défauts choisis pour le joueur : appliqués seulement par l'application (withDefaultSettings(s, true)), jamais par les tests */
export const APP_SETTINGS_DEFAULTS: Partial<Settings> = {
  autoPickupRunes: 'pul',
  autoPickupGems: 'all',
  autoPickupPotions: true,
  autoPickupMaterials: true,
  beltRefill: true,
  durability: false,
  freeRespec: true,
  potionUpgrade: true,
  dynamicLight: 'light',
  bigInventory: true,
};

/** Réglages complets à partir d'une sauvegarde (valeurs par défaut, tableaux jamais partagés) */
export function withDefaultSettings(s?: Partial<Settings> | null, app = false): Settings {
  const out = { ...DEFAULT_SETTINGS, ...(app ? APP_SETTINGS_DEFAULTS : {}), ...(s ?? {}) };
  if (out.autoPickupRunes !== undefined && !['none', 'pul', 'vex', 'all'].includes(out.autoPickupRunes)) out.autoPickupRunes = app ? 'pul' : 'none';
  if (out.autoPickupGems !== undefined && !['none', 'all', 'normal', 'flawless'].includes(out.autoPickupGems)) out.autoPickupGems = app ? 'all' : 'none';
  if (out.autoPickupPotions !== undefined) out.autoPickupPotions = !!out.autoPickupPotions;
  if (out.autoPickupMaterials !== undefined) out.autoPickupMaterials = !!out.autoPickupMaterials;
  if (out.beltRefill !== undefined) out.beltRefill = !!out.beltRefill;
  if (out.durability !== undefined) out.durability = !!out.durability;
  if (out.bigInventory !== undefined) out.bigInventory = !!out.bigInventory;
  if (out.freeRespec !== undefined) out.freeRespec = !!out.freeRespec;
  if (out.potionUpgrade !== undefined) out.potionUpgrade = !!out.potionUpgrade;
  // ancien réglage d'apparence (supprimé) : oublié, le personnage garde son apparence normale
  delete (out as Record<string, unknown>).playerSkin;
  if (out.imageSharpen !== undefined && ![0, 1, 2, 3].includes(out.imageSharpen)) out.imageSharpen = 0;
  if (out.imageSmooth !== undefined) out.imageSmooth = !!out.imageSmooth;
  if (out.imageMood !== undefined && !['normal', 'dark', 'warm', 'cold', 'vivid'].includes(out.imageMood)) out.imageMood = 'normal';
  if (out.imageScale !== undefined && !['normal', 'soft', 'pixel'].includes(out.imageScale)) out.imageScale = 'normal';
  if (out.renderEngine !== undefined && !['webgl', 'webgpu'].includes(out.renderEngine)) out.renderEngine = 'webgl';
  if (out.dynamicLight !== undefined && !['off', 'light', 'normal'].includes(out.dynamicLight)) out.dynamicLight = app ? 'light' : 'off';
  if (out.imageButton !== undefined) out.imageButton = !!out.imageButton;
  if (out.walkButton !== undefined) out.walkButton = !!out.walkButton;
  out.tipsSeen = [...(s?.tipsSeen ?? [])];
  if (!['auto', 'touch', 'pc'].includes(out.controls)) out.controls = 'auto';
  if (!['normal', 'fast', 'veryfast', 'abundant'].includes(out.lootRate)) out.lootRate = 'abundant';
  // réglages des mods actifs : reprise de ceux d'avant les mods, valeurs admises, défauts de l'application
  normalizeModSettings(out, app);
  return out;
}

/** Monstre sérialisé : tous ses champs, la fiche remplacée par son identifiant */
type MonsterSnapshot = Omit<Monster, 'def'> & { def: string };

export interface WorldSnapshot {
  tick: number;
  player: { x: number; y: number; hp: number; mana: number; buffs: PlayerBuff[]; facing: number; cooldowns: Record<string, number> };
  monsters: MonsterSnapshot[];
  pendingSpawns: number[];
  items: { item: Item; x: number; y: number }[];
  objects: { kind: string; x: number; y: number; used: boolean; ref?: string; label: string; variant?: string }[];
  rng: Record<string, RngState>;
  run: { wave: number; completed: boolean; startTick: number };
}

interface ActiveRunSave {
  runId: string;
  difficulty: Difficulty;
  seed: number;
  /** Niveau de zone figé au lancement (zones adaptatives) */
  zoneLevel?: number;
  mapItem?: Item;
  world: WorldSnapshot;
  /** Run laissée derrière un portail : le personnage est en ville et peut y retourner */
  suspended?: boolean;
  /** Zone corrompue (Enfer, niveau 85) */
  corrupt?: boolean;
  /**
   * Game mode (lot 279): state of the run's director (`RunDirector.snapshot`, plain JSON), read back when the run is resumed
   * (`RunDef.resumeOnLoad`). Written only when the director has one: absent from every save of the base, whose shape does not change; a
   * client that does not know the field ignores it (the version stays 7).
   */
  modState?: unknown;
}

export interface SaveData {
  version: number;
  /** Jeu de règles du personnage (voir DEFAULT_RULESET) : identifiant stable, immuable. Absent avant la version 7 : `pd2` */
  ruleset: string;
  character: CharacterState;
  settings: Settings;
  run: ActiveRunSave | null;
  /** Compteur de graines de runs (déterministe, sans horloge) */
  runCounter: number;
  /** Compteur de graines d'artisanat (Cube, sertissage, achats) : indépendant de l'or, pour qu'on ne puisse pas prévisualiser/relancer un résultat en changeant son or. Absent : 0 */
  craftSeq?: number;
  /** Dernière ville visitée (acte : « act1 »…« act5 ») : on y réapparaît après une reconnexion. Absent : Harrogath */
  town?: string;
  /** Date de la sauvegarde (écran de sélection : dernier personnage joué d'abord) */
  savedAt?: number;
  /** Objets illisibles mis de côté au chargement (base inconnue : voir save-orphans.ts), conservés intacts ; absent : aucun */
  orphans?: OrphanItem[];
}

type Migration = (d: Record<string, unknown>) => void;

/**
 * Migrations successives : MIGRATIONS[v] transforme une sauvegarde de version v en v+1.
 * v1 → v2 : ajout des points bonus de progression et de l'onglet matériaux.
 * v2 → v3 : filtre de butin complet.
 * v3 → v4 : luminosité « pénombre » par défaut.
 * v4 → v5 : bases en double fusionnées (kris/kriss, sash/sash_l…).
 * v5 → v6 : inventaire des charmes.
 * v6 → v7 : jeu de règles du personnage (`ruleset`, absent → `pd2`). Un client d'avant la v7 refuse ces sauvegardes (« version plus récente »).
 */
const MIGRATIONS: Record<number, Migration> = {
  1: (d) => {
    const c = d.character as Record<string, unknown>;
    const prog = (c.progression ?? {}) as Record<string, unknown>;
    prog.bonusSkillPoints ??= 0;
    prog.bonusStatPoints ??= 0;
    c.progression = prog;
    c.materials ??= {};
    d.runCounter ??= 0;
  },
  // v2 → v3 : filtre de butin complet (préréglages, paliers de bases, gemmes, potions, révélation)
  2: (d) => {
    const c = d.character as Record<string, unknown>;
    const f: Record<string, unknown> = { ...DEFAULT_FILTER, ...((c.filter as object) ?? {}) };
    const std = FILTER_PRESETS.standard as Record<string, unknown>;
    f.preset = Object.keys(std).every((k) => f[k] === std[k]) ? 'standard' : 'custom';
    c.filter = f;
  },
  // v3 → v4 : luminosité par défaut « pénombre » (« claire » n'a été le défaut qu'une heure)
  3: (d) => {
    const st = (d.settings ?? {}) as Record<string, unknown>;
    if (st.lighting === 'clair' || st.lighting === undefined) st.lighting = 'penombre';
    d.settings = st;
  },
  // v4 → v5 : fusion des bases en double
  4: (d) => {
    remapLegacyBases(d);
  },
  // v5 → v6 : inventaire des charmes (PD2). Les charmes du sac y sont déplacés, dans l'ordre, sans perte (ce qui ne tient pas reste dans le sac, inactif)
  5: (d) => {
    const c = d.character as { inventory?: (Item | null)[]; charmInv?: (Item | null)[] };
    const cells: (Item | null)[] = Array.isArray(c.charmInv) ? c.charmInv : new Array(CHARM_COLS * CHARM_ROWS).fill(null);
    const inv = c.inventory ?? [];
    inv.forEach((it, i) => {
      if (!it) return;
      const t = BASE_BY_ID[it.base]?.type;
      if (!t || !isCharmType(t)) return;
      if (placeIn(cells, CHARM_COLS, CHARM_ROWS, it) >= 0) inv[i] = null;
    });
    c.charmInv = cells;
  },
  // v6 → v7 : jeu de règles. Tous les personnages existants jouent le contenu actuel (PD2)
  6: (d) => {
    d.ruleset ??= DEFAULT_RULESET;
  },
};

export function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') throw new Error('Sauvegarde illisible');
  const d = raw as Record<string, unknown>;
  let v = typeof d.version === 'number' ? d.version : 1;
  if (v > SAVE_VERSION) throw new Error(`Sauvegarde d'une version plus récente (${v})`);
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`Migration manquante depuis la version ${v}`);
    m(d);
    v++;
  }
  // liste de surbrillance du filtre : entrées valides seulement (champ optionnel : absent = neutre)
  const flt = (d.character as { filter?: { highlight?: unknown } } | undefined)?.filter;
  if (flt && 'highlight' in flt) {
    const h = sanitizeHighlight(flt.highlight);
    if (h?.length) flt.highlight = h;
    else delete flt.highlight;
  }
  const fto = (d.character as { filter?: { tierOverride?: unknown } } | undefined)?.filter;
  if (fto && 'tierOverride' in fto) {
    const t = sanitizeTierOverride(fto.tierOverride);
    if (t?.length) fto.tierOverride = t;
    else delete fto.tierOverride;
  }
  d.version = SAVE_VERSION;
  // étiquette illisible (sauvegarde abîmée) : le ruleset par défaut ; un identifiant bien formé est gardé tel quel, même inconnu de ce client
  if (typeof d.ruleset !== 'string' || !/^[a-z0-9][a-z0-9+-]{0,63}$/.test(d.ruleset)) d.ruleset = DEFAULT_RULESET;
  d.settings = withDefaultSettings(d.settings as Partial<Settings> | undefined);
  d.run ??= null;
  return d as unknown as SaveData;
}

/**
 * Coffre partagé entre les personnages (PD2) : onglets communs, sauvegardés à part de chaque
 * personnage. En jeu, ils suivent les onglets personnels dans `character.stash`.
 */
export interface SharedStash {
  version: 1;
  tabs: (Item | null)[][];
  /** Objets illisibles mis de côté au chargement (save-orphans.ts), conservés intacts ; absent : aucun */
  orphans?: OrphanItem[];
}

/** Pages du coffre partagé par défaut (le coffre est unique : l'ancien coffre personnel de 4 pages y est fondu) */
export const SHARED_TABS = 12;
/** Plafond de pages partagées (la migration en crée au besoin jusqu'ici ; au-delà, le reste demeure dans les pages personnelles, jamais perdu) */
export const MAX_SHARED_TABS = 40;

export function emptyShared(): SharedStash {
  return { version: 1, tabs: Array.from({ length: SHARED_TABS }, () => new Array(80).fill(null)) };
}

export function serialize(s: SaveData): string {
  return JSON.stringify(s);
}

/** Lecture d'une sauvegarde locale : migration, puis quarantaine des objets illisibles (save-orphans.ts) au lieu d'un plantage plus loin */
export function deserialize(text: string): SaveData {
  const s = migrate(JSON.parse(text));
  quarantineSave(s);
  return s;
}

/**
 * Fusion de deux versions du coffre partagé (deux appareils ont écrit en même temps) : l'union des objets par `uid`,
 * sans doublon. Les positions de `local` sont conservées ; les objets de `remote` absents de `local` prennent la première
 * place libre (pages créées jusqu'à MAX_SHARED_TABS ; sinon `lost` les liste, l'appelant les garde ailleurs).
 */
export function mergeShared(local: SharedStash, remote: SharedStash): { merged: SharedStash; lost: Item[] } {
  const tabs = local.tabs.map((t) => t.slice());
  const seen = new Set<string>();
  for (const t of tabs) for (const it of t) if (it) seen.add(it.uid);
  const extra: Item[] = [];
  for (const t of remote.tabs)
    for (const it of t)
      if (it && !seen.has(it.uid)) {
        seen.add(it.uid);
        extra.push(it);
      }
  const lost = placeInSharedTabs(tabs, extra);
  // quarantaine : l'union des deux côtés (même objet mis de côté sur les deux appareils : gardé une fois)
  const orphans = [...(local.orphans ?? [])];
  const known = new Set(orphans.map((o) => JSON.stringify(o)));
  for (const o of remote.orphans ?? []) if (!known.has(JSON.stringify(o))) orphans.push(o);
  return { merged: orphans.length ? { version: 1, tabs, orphans } : { version: 1, tabs }, lost };
}

/** Range des objets dans les pages (crée des pages jusqu'au plafond) ; renvoie ceux qui n'ont pas trouvé de place */
export function placeInSharedTabs(tabs: (Item | null)[][], items: Item[]): Item[] {
  const left: Item[] = [];
  const sorted = items.slice().sort((a, b) => itemSize(b)[0] * itemSize(b)[1] - itemSize(a)[0] * itemSize(a)[1]);
  for (const it of sorted) {
    let t = tabs.find((x) => hasRoomInStash(x, it));
    if (!t && tabs.length < MAX_SHARED_TABS) {
      t = new Array(80).fill(null);
      tabs.push(t);
    }
    if (t) placeInStash(t, it);
    else left.push(it);
  }
  return left;
}
