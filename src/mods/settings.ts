/**
 * Réglages propres à un mod (plan, §2.7) : rangés sous `Settings.mods[<mod>]` (ex. `mods.pd2.confirmCorrupt`), déclarés par le mod à
 * l'enregistrement (`api.settings.declare`), lus par `modSetting` et écrits par `setModSetting`. Un réglage déclaré `legacy` existait
 * avant les mods à la racine de `Settings` : `normalizeModSettings` (appelé par `withDefaultSettings`) l'y reprend. Sans le mod, son
 * réglage n'existe pas (lecture : undefined, rien n'est migré ni effacé). Module feuille.
 */

export type ModSettingValue = string | number | boolean;
/** Réglages de chaque mod, par identifiant de mod */
export type ModSettingsMap = Record<string, Record<string, ModSettingValue>>;

export interface ModSettingSpec {
  /** Valeur par défaut choisie pour le joueur (appliquée par l'application seulement, comme APP_SETTINGS_DEFAULTS) */
  app?: ModSettingValue;
  /** Valeurs admises (une autre valeur est remplacée par le défaut de l'application, ou retirée) */
  values?: readonly ModSettingValue[];
  /** Réglage d'avant les mods, à la racine de `Settings` : repris sous `mods.<mod>` */
  legacy?: boolean;
}

const DECLARED = new Map<string, { mod: string; spec: ModSettingSpec }>();
let frozen = false;

/** Déclare des réglages d'un mod (activation : avant le gel) ; un nom déjà déclaré par un autre mod est une erreur */
export function declareModSettings(mod: string, specs: Readonly<Record<string, ModSettingSpec>>): void {
  if (frozen) throw new Error(`Réglages de « ${mod} » : déclaration refusée après l'activation`);
  for (const [key, spec] of Object.entries(specs)) {
    const by = DECLARED.get(key)?.mod;
    if (by && by !== mod) throw new Error(`Réglage « ${key} » déjà déclaré par « ${by} » (conflit avec « ${mod} »)`);
    DECLARED.set(key, { mod, spec });
  }
}

/** Gel (fin de l'activation, activate.ts) */
export function freezeModSettings(): void {
  frozen = true;
}

/** Mod propriétaire d'un réglage (undefined : réglage de la base ou d'un mod absent) */
export function modSettingOwner(key: string): string | undefined {
  return DECLARED.get(key)?.mod;
}

/** Défauts de l'application des réglages déclarés, par nom de réglage */
export function modSettingDefaults(): Record<string, ModSettingValue> {
  const out: Record<string, ModSettingValue> = {};
  for (const [k, d] of DECLARED) if (d.spec.app !== undefined) out[k] = d.spec.app;
  return out;
}

/** Valeur d'un réglage de mod (undefined : non réglé, ou mod absent) */
export function modSetting(s: { mods?: ModSettingsMap } | null | undefined, key: string): ModSettingValue | undefined {
  const d = DECLARED.get(key);
  return d ? s?.mods?.[d.mod]?.[key] : undefined;
}

/** Écrit un réglage de mod (sans effet si le réglage n'est pas déclaré) */
export function setModSetting(s: { mods?: ModSettingsMap }, key: string, v: ModSettingValue): void {
  const d = DECLARED.get(key);
  if (!d) return;
  s.mods ??= {};
  s.mods[d.mod] = { ...(s.mods[d.mod] ?? {}), [key]: v };
}

/**
 * Normalise les réglages des mods de `out` (copie de travail de `withDefaultSettings`) : copie des tables (jamais partagées avec la
 * sauvegarde), reprise des réglages historiques de la racine, valeurs admises, défauts de l'application (`app`). `mods` n'est créé que
 * si un réglage a une valeur : des réglages sans réglage de mod gardent exactement leur forme.
 */
export function normalizeModSettings(out: { mods?: ModSettingsMap }, app: boolean): void {
  const root = out as unknown as Record<string, unknown>;
  if (out.mods) out.mods = Object.fromEntries(Object.entries(out.mods).map(([m, v]) => [m, { ...v }]));
  for (const [key, { mod, spec }] of DECLARED) {
    let v: ModSettingValue | undefined = out.mods?.[mod]?.[key];
    if (spec.legacy && Object.hasOwn(root, key)) {
      if (v === undefined) v = root[key] as ModSettingValue;
      delete root[key];
    }
    if (v !== undefined && spec.values && !spec.values.includes(v)) v = app ? spec.app : undefined;
    if (v === undefined && app) v = spec.app;
    if (v === undefined) {
      if (out.mods?.[mod]) delete out.mods[mod][key];
      continue;
    }
    out.mods ??= {};
    out.mods[mod] = { ...(out.mods[mod] ?? {}), [key]: v };
  }
}
