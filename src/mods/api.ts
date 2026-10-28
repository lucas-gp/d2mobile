/**
 * API publique des mods : avec le moteur exposé (sdk.ts, pour le code d'un mod, jamais pour son manifest), la seule chose qu'un mod
 * importe du jeu (règle ESLint de frontière, eslint.config.js). Un mod est un dossier
 * `mods/<id>/` : un manifest (`manifest.ts`, petit, découvert au démarrage, voir discover.ts) et un contenu chargé à la demande
 * (`load`, chunk séparé) dont `register` reçoit l'API, liée à l'identifiant du mod : chaque registre y est vu à travers `ModRegistry`
 * (ajout, patch, retrait) ; les règles nommées remplaçables, y compris les points d'accroche du monde, du combat et du butin (cartes
 * d'endgame, lot M5b), passent par `api.rules` (rules.ts).
 */
import type { EntryOf, RegistryName } from './registries';
import type { RuleName, RuleTypes } from './rules';

export type { AffixDef, GemDef, ItemBase, RuneDef, RunewordDef, SetDef, SetItemDef, SkillDef, StatRoll, UniqueDef } from '../data/types';
export type { SkillNumbers, SorcSkill as SkillEntry } from '../data/skill-types';
export type { JoystickPlace, MapLaunch, MapRecipeResult, ModSettingRow, RenderLimits, RuleName, RuleTypes, SettingsLayout, WorldMod } from './rules';
/** Courbes de niveau des compétences (paliers de Skills.txt, table complète) pour les chiffres d'un mod */
export { R, T } from '../data/ramp';
export type { CraftFamily, CubeCost, CubeRecipe } from '../data/cube';
export type { CorruptionTable } from '../data/corruption';
export type { RunDef, RunDirector } from '../data/runs';
export type { ModSettingSpec, ModSettingValue } from './settings';
import type { ModSettingSpec } from './settings';
import type { UiSlotName, UiSlots } from './ui';
export type {
  CharCardCtx,
  GameUiCtx,
  HudCtx,
  HudWidget,
  ItemActCtx,
  LevelUpCtx,
  MenuButton,
  MenuCtx,
  ModActEntry,
  ModPanel,
  RunCompleteCtx,
  RunCompleteSummary,
  TownCtx,
  UiHost,
  UiScreen,
  UiSlotName,
  UiSlots,
} from './ui';
export type { TcEntry, TreasureClass } from '../data/treasure';
export type { MonsterFidelityEntry, ZoneLevel } from './registries';
export type { ClassDef } from '../data/classes';
export type { Rates } from '../data/rates';
export type { MercBaseStats, MercModel } from './d2/mercs';
export type { MercType } from '../data/mercs';
export type { BotChecks, BotRules, BotTown, RunPlan, SkillPlan, WantedMerc } from './d2/bots';
export type { AmazonRules, AssassinRules, BarbarianRules, DruidFormBonus, DruidRules, NecromancerRules, PaladinRules, SorceressRules } from './d2/skills';
export { lin } from '../data/ramp';
export type { MapAffixDef, MapZoneDef } from '../data/maps';
export type { Element } from '../data/stats';
export type { MapBossArchetype, MapBossAuraFx } from '../sim/map-boss-state';

/**
 * Nature d'un mod : la base (unique, obligatoire) ; une refonte (`overhaul` : un jeu de règles de contenu, au plus une par jeu de règles,
 * ex. `pd2`) ; un ajout de contenu (`addon`) ; un mode de jeu (`gamemode` : empilable sur un jeu de règles de contenu, `d2` ou `pd2`,
 * choisi à la création du personnage, ex. un mode « Survivals »). Identifiant de jeu de règles d'un personnage avec des modes de jeu :
 * `<jeu de règles>+<mode>[+<mode>…]` (modes triés, voir activate.ts `rulesetId`).
 */
export type ModKind = 'base' | 'overhaul' | 'addon' | 'gamemode';

/** Contenu d'un mod (module chargé à la demande) */
export interface ModContent {
  /** Identifiants historiques admis sans espace de noms (contenu ajouté avant les mods, déjà présent dans les sauvegardes) */
  legacyIds?: readonly string[];
  /** Enregistre le contenu du mod : appelé une fois, dans l'ordre du jeu de règles, avant le gel */
  register(api: ModApi): void;
}

export interface ModDef extends ModContent {
  /** `[a-z0-9-]`, unique : sert d'espace de noms aux entrées ajoutées (`<id>:<entrée>`) */
  id: string;
  name: string;
  /** Version du contenu (semver) */
  version: string;
  kind: ModKind;
}

/** Manifest d'un mod (`mods/<id>/manifest.ts`, export par défaut) : chargé tout de suite, le contenu (`load`) seulement à l'activation */
export interface ModManifest {
  id: string;
  name: string;
  version: string;
  kind: Exclude<ModKind, 'base'>;
  /** Refonte proposée par défaut à la création d'un personnage (jeu de règles portant l'identifiant du mod) */
  defaultOn?: boolean;
  /** Une phrase affichée à la création du personnage (texte source en français, traduit par src/i18n : sa traduction anglaise va dans le dictionnaire de la base ou dans `i18n` ci-dessous) */
  description?: string;
  /** Lot 318: a few words under the mode's button on the home screen (French source text, translated like `description`) */
  tagline?: string;
  /** Traductions anglaises des textes du manifest (`name`, `description`), disponibles avant le chargement du contenu (écran de création) */
  i18n?: Readonly<Record<string, string>>;
  /** Mode de jeu : jeux de règles de contenu sur lesquels il se pose (`['d2', 'pd2']`) ; absent : tous */
  rulesets?: readonly string[];
  /**
   * Game mode: variants offered when a character is created (lot 289: Survivals' "Run" and "Campaign"), the first being the default; the
   * one picked is given to the `create.character` slot (`variant`). Texts translated by `i18n` below
   */
  variants?: readonly ModeVariant[];
  /** Licence des données et du code du mod, attribution */
  license?: { data: string; code: string; attribution?: string };
  /** Contenu du mod, en chunk séparé (`() => import('./index')`) */
  load(): Promise<{ default: ModContent }>;
}

/** A variant of a game mode offered at creation (`ModManifest.variants`) */
export interface ModeVariant {
  id: string;
  name: string;
  description?: string;
}

/** Déclare un manifest (contrôle de forme au chargement) */
export function defineManifest(m: ModManifest): ModManifest {
  if (!/^[a-z0-9-]+$/.test(m.id)) throw new Error(`Manifest de mod : identifiant « ${m.id} » invalide ([a-z0-9-])`);
  return m;
}

/** Position d'un ajout dans la table (ordre de tirage, d'affichage) : à la fin par défaut, ou juste après / juste avant une entrée existante */
export interface AddAt {
  after?: string;
  before?: string;
}

/**
 * Patch d'une table de la base, généré par diff (lot M6 : valeurs d'un mod sur les tables vanilla) : champs remplacés par entrée (un champ
 * à `undefined` est retiré), entrées retirées, entrées ajoutées à leur position. S'applique par `applyTablePatch`.
 */
export interface TablePatch<T extends { id: string }> {
  patch: Record<string, Partial<T>>;
  /** Ordre final des champs d'une entrée patchée, quand un champ ajouté prend place au milieu de l'objet */
  keyOrder?: Record<string, readonly string[]>;
  add?: { entry: T; after?: string; before?: string }[];
  remove?: string[];
}

/** Applique un patch de table : retraits, puis champs, puis ajouts (chacun à sa position, dans l'ordre) */
export function applyTablePatch<T extends { id: string }>(reg: ModRegistry<T>, p: TablePatch<T>): void {
  for (const id of p.remove ?? []) reg.remove(id);
  for (const [id, fields] of Object.entries(p.patch)) reg.patch(id, fields, { keyOrder: p.keyOrder?.[id] });
  for (const a of p.add ?? []) reg.add(a.entry, a.after !== undefined ? { after: a.after } : { before: a.before });
}

/** Vue d'un registre pour un mod */
export interface ModRegistry<T extends { id: string }> {
  has(id: string): boolean;
  get(id: string): T | undefined;
  all(): readonly T[];
  /** Nouvelle entrée (en fin de table, ou à la position `at`) ; identifiant `<mod>:…` (ou historique déclaré) ; erreur si l'identifiant existe */
  add(entry: T, at?: AddAt): void;
  /** Champs remplacés sur place (un champ à `undefined` est retiré) ; erreur si l'entrée est absente, ou si un autre mod a déjà patché ce champ (sauf `override`) */
  patch(id: string, fields: Partial<T>, opts?: { override?: boolean; keyOrder?: readonly string[] }): void;
  /** Retrait ; erreur si l'entrée est absente */
  remove(id: string): void;
}

/** Patchs propres aux compétences (en plus du registre) : chiffres et synergies par identifiant de compétence */
export interface SkillPatches {
  /** Champs de chiffres remplacés (`n`, ex. `{ min, max, mana }`) ; les autres champs de `n` restent ceux de la base */
  patchNumbers(table: Readonly<Record<string, Partial<EntryOf<'skills'>['n']>>>): void;
  /** Synergies : celles du mod remplacent celles du même type (`what`) de la base ; les autres types restent */
  patchSynergies(table: Readonly<Record<string, EntryOf<'skills'>['synergies']>>): void;
}

/** Remplacement des règles nommées (rules.ts) : `make` reçoit l'implémentation précédente (base ou mod précédent) */
export interface ModRules {
  set<K extends RuleName>(name: K, make: (prev: RuleTypes[K]) => RuleTypes[K], opts?: { override?: boolean }): void;
}

export type ModApi = { readonly [K in Exclude<RegistryName, 'skills'>]: ModRegistry<EntryOf<K>> } & {
  readonly skills: ModRegistry<EntryOf<'skills'>> & SkillPatches;
  readonly rules: ModRules;
  /** Identifiant du mod en cours d'enregistrement */
  readonly modId: string;
  /** Réglages du mod (sous `Settings.mods.<mod>`, src/mods/settings.ts) */
  readonly settings: { declare(specs: Readonly<Record<string, ModSettingSpec>>): void };
  /** Traductions anglaises du mod (phrase française → anglais, comme src/i18n/en.json), ajoutées au dictionnaire du jeu */
  readonly i18n: { add(entries: Readonly<Record<string, string>>): void };
  /** Points d'insertion d'interface (src/mods/ui.ts, docs/MODS.md) : contributions ajoutées à celles des autres mods, affichées par la base */
  readonly ui: { add<K extends UiSlotName>(slot: K, contribution: UiSlots[K]): void };
};

/** Jeu de règles : la base puis une liste ordonnée de mods ; identifiant stable écrit dans la sauvegarde (SaveData.ruleset) */
export interface RulesetDef {
  id: string;
  name: string;
  /** Identifiants des mods, dans l'ordre d'enregistrement (après la base) */
  mods: readonly string[];
  /** Non proposé aux joueurs à la création (développement) */
  hidden?: boolean;
  /** Une phrase affichée à la création du personnage (texte source en français) */
  description?: string;
  /** Lot 318: a few words under its button on the home screen (French source text) */
  tagline?: string;
}
