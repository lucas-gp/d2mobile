/**
 * Activation du jeu de règles, une fois par session de page, AVANT le chargement du cœur du jeu (`game-core`) : la base puis chaque mod du
 * jeu de règles enregistrent leur contenu dans les registres, les tables dérivées sont recalculées (derived.ts), puis les registres sont
 * gelés. Changer de jeu de règles = recharger la page (`rulesetSwitch`) : les tables restent statiques, sans « contexte de règles » à
 * passer partout ni coût en jeu.
 * Les tests activent le jeu de règles par défaut avant chaque fichier (tests/setup-ruleset.ts), l'outil d'empreintes avant chaque
 * section ; les autres outils en ligne de commande passent par tools/mods/node.ts.
 */
import type { ModApi, ModDef, ModManifest, ModRegistry, RulesetDef, SkillPatches } from './api';
import { BASE_MOD } from './base';
import { runDerived } from './derived';
import { discoveredMods } from './discover';
import { REGISTRIES, type RegistryName } from './registries';
import type { Registry } from './registry';
import { freezeRules, setRule } from './rules';
import { declareModSettings, freezeModSettings } from './settings';
import { addUi, freezeUi, type UiSlotName, type UiSlots } from './ui';
import { addTranslations } from '../i18n';

/** La base seule (Diablo II LoD 1.13c) */
export const BASE_RULESET = 'd2';

/** Jeux de règles de contenu de cette version : `d2` (la base seule) et un par refonte présente (`pd2` : base + mod pd2) */
export function rulesets(): Record<string, RulesetDef> {
  const out: Record<string, RulesetDef> = {
    [BASE_RULESET]: { id: BASE_RULESET, name: 'Diablo II', mods: [], description: 'Diablo II : Lord of Destruction 1.13c, sans modification.', tagline: 'Le jeu d’origine, sans modification' },
  };
  for (const m of discoveredMods())
    if (m.kind === 'overhaul') out[m.id] = { id: m.id, name: m.name, mods: [m.id], ...(m.description ? { description: m.description } : {}), ...(m.tagline ? { tagline: m.tagline } : {}) };
  return out;
}

/** Modes de jeu de cette version (mods `gamemode`), triés par identifiant */
export function gameModes(): ModManifest[] {
  return discoveredMods().filter((m) => m.kind === 'gamemode');
}

/** Modes de jeu qui se posent sur un jeu de règles de contenu */
export function gameModesFor(content: string): ModManifest[] {
  return gameModes().filter((m) => !m.rulesets || m.rulesets.includes(content));
}

/** Identifiant complet d'un jeu de règles : contenu, puis modes de jeu triés (`pd2+survivals`) */
export function rulesetId(content: string, modes: readonly string[] = []): string {
  return [content, ...[...new Set(modes)].sort()].join('+');
}

/** Contenu et modes de jeu d'un identifiant complet (`pd2+survivals` → `pd2`, `['survivals']`) */
export function parseRuleset(id: string): { content: string; modes: string[] } {
  const [content, ...modes] = id.split('+');
  return { content, modes };
}

/** Jeu de règles de contenu (sans les modes de jeu) : il fixe la guilde (un mode de jeu la partage avec son contenu ; son coffre partagé est le sien depuis le lot 299) */
export function contentRuleset(id: string): string {
  return parseRuleset(id).content;
}

/**
 * Pourquoi un personnage de ce jeu de règles ne peut pas être joué dans cette version (null : jouable) : refonte ou mode de jeu absent,
 * mode posé sur un contenu qu'il n'accepte pas, identifiant mal formé. Le personnage reste dans la liste, grisé, jamais modifié.
 */
export function rulesetProblem(id: string): string | null {
  const { content, modes } = parseRuleset(id);
  if (!/^[a-z0-9-]+$/.test(content) || modes.some((m) => !/^[a-z0-9-]+$/.test(m))) return `Jeu de règles illisible (« ${id} »)`;
  if (!Object.hasOwn(rulesets(), content)) return `Ce personnage demande le mod « ${content} », absent de cette version`;
  if (rulesetId(content, modes) !== id) return `Jeu de règles illisible (« ${id} »)`;
  const known = new Map(gameModes().map((m) => [m.id, m]));
  const missing = modes.filter((m) => !known.has(m));
  if (missing.length) return `Ce personnage demande le mode de jeu « ${missing.join(', ')} », absent de cette version`;
  const bad = modes.filter((m) => !gameModesFor(content).some((x) => x.id === m));
  if (bad.length) return `Le mode de jeu « ${bad.join(', ')} » ne se joue pas avec ce jeu de règles`;
  return null;
}

/**
 * Lot 299: the ruleset a character's save is read under. A playable id is kept as it is; an id this version cannot read but whose game
 * modes it knows (modes out of order, a content missing or unknown, `survivals` alone) goes to its canonical id when that is playable:
 * its content when it names a known one, otherwise the base (`d2`, "Diablo II (original)") under its modes. Anything else is kept as it
 * is (greyed, never changed: a mod absent from this version).
 */
export function repairRuleset(id: string): string {
  if (rulesetProblem(id) === null) return id;
  const parts = id.split('+').filter(Boolean);
  const known = new Set(gameModes().map((m) => m.id));
  const modes = parts.filter((p) => known.has(p));
  if (!modes.length) return id;
  const contents = parts.filter((p) => Object.hasOwn(rulesets(), p));
  // a part neither content nor mode (a mod absent from this version), or two contents: kept as it is
  if (contents.length + modes.length !== parts.length || contents.length > 1) return id;
  const fixed = rulesetId(contents[0] ?? BASE_RULESET, modes);
  return rulesetProblem(fixed) === null ? fixed : id;
}

/** Jeux de règles de contenu proposés à la création d'un personnage (non cachés), la refonte par défaut d'abord */
export function playableRulesets(): RulesetDef[] {
  const def = defaultRuleset();
  return Object.values(rulesets())
    .filter((r) => !r.hidden)
    .sort((a, b) => Number(b.id === def) - Number(a.id === def) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Jeu de règles d'un nouveau personnage sans autre indication : la refonte par défaut si elle est présente, sinon la base */
export function defaultRuleset(): string {
  const m = discoveredMods().find((x) => x.kind === 'overhaul' && x.defaultOn);
  return m ? m.id : BASE_RULESET;
}

let active: string | null = null;
let activeMods: readonly string[] = [];

/** Jeu de règles actif, identifiant complet (null : aucun activé, outils en ligne de commande) */
export function activeRuleset(): string | null {
  return active;
}

/** Mods du jeu de règles actif, dans l'ordre (vide : base seule ou rien d'activé) */
export function activeModIds(): readonly string[] {
  return activeMods;
}

export function isKnownRuleset(id: string): boolean {
  return rulesetProblem(id) === null;
}

/** Que faire d'un personnage de ce jeu de règles dans la session en cours : le jouer, recharger la page pour activer le sien, ou le refuser */
export function rulesetSwitch(id: string): 'same' | 'reload' | 'unknown' {
  if (!isKnownRuleset(id)) return 'unknown';
  return active === null || active === id ? 'same' : 'reload';
}

/** Traductions des manifests (nom et description des jeux de règles et des modes, écran de création) : une fois, pour tous les mods présents */
let manifestDicts = false;
function addManifestTranslations(): void {
  if (manifestDicts) return;
  manifestDicts = true;
  for (const m of discoveredMods()) if (m.i18n) addTranslations(m.id, m.i18n);
}

function apiFor(mod: ModDef): ModApi {
  const legacy = new Set(mod.legacyIds ?? []);
  const view = <T extends { id: string }>(r: Registry<T>): ModRegistry<T> => ({
    has: (id) => r.has(id),
    get: (id) => r.get(id),
    all: () => r.all(),
    add: (e, at) => r.add(mod.id, e, legacy, at),
    patch: (id, fields, opts) => r.patch(mod.id, id, fields, opts),
    remove: (id) => r.remove(mod.id, id),
  });
  const rules: ModApi['rules'] = { set: (name, make, opts) => setRule(mod.id, name, make, opts) };
  const api: Record<string, unknown> = {
    modId: mod.id,
    rules,
    settings: { declare: (specs: Parameters<typeof declareModSettings>[1]) => declareModSettings(mod.id, specs) },
    i18n: { add: (entries: Readonly<Record<string, string>>) => addTranslations(mod.id, entries) },
    ui: { add: (slot: UiSlotName, c: UiSlots[UiSlotName]) => addUi(mod.id, slot, c) },
  };
  for (const k of Object.keys(REGISTRIES) as RegistryName[]) api[k] = view(REGISTRIES[k] as unknown as Registry<{ id: string }>);
  api.skills = { ...(api.skills as object), ...skillPatches(mod.id) };
  return api as ModApi;
}

/**
 * Chiffres et synergies des compétences : un patch du registre par compétence (champ `n` fusionné, `synergies` du même type remplacées).
 * Deux mods qui patchent les chiffres d'une même compétence sont donc en conflit (champ `n`), sauf `override`.
 */
function skillPatches(mod: string): SkillPatches {
  const reg = REGISTRIES.skills;
  const get = (id: string) => {
    const s = reg.get(id);
    if (!s) throw new Error(`Registre « ${reg.name} » : patch de « ${id} » par « ${mod} », entrée absente`);
    return s;
  };
  return {
    patchNumbers(table) {
      for (const [id, n] of Object.entries(table)) reg.patch(mod, id, { n: { ...get(id).n, ...n } });
    },
    patchSynergies(table) {
      for (const [id, syn] of Object.entries(table)) {
        const kinds = new Set(syn.map((x) => x.what));
        reg.patch(mod, id, { synergies: [...get(id).synergies.filter((x) => !kinds.has(x.what)), ...syn] });
      }
    },
  };
}

/**
 * Active une liste de mods par-dessus la base, recalcule les tables dérivées, puis gèle les registres. Bas niveau (tests) : le jeu passe
 * par `activateRuleset`. `freezeTables` : gèle aussi les tableaux et index eux-mêmes (Object.freeze), pour qu'une écriture directe hors
 * API échoue (développement, tests).
 */
export function activateMods(id: string, mods: readonly ModDef[], opts: { freezeTables?: boolean } = {}): void {
  if (active !== null) {
    if (active === id) return;
    throw new Error(`Jeu de règles « ${active} » déjà actif : changer de jeu de règles demande de recharger la page (« ${id} » demandé)`);
  }
  if (mods.filter((m) => m.kind === 'overhaul').length > 1) throw new Error(`Jeu de règles « ${id} » : une seule refonte possible`);
  const firstMode = mods.findIndex((m) => m.kind === 'gamemode');
  if (firstMode >= 0 && mods.slice(firstMode).some((m) => m.kind !== 'gamemode')) throw new Error(`Jeu de règles « ${id} » : les modes de jeu s'enregistrent après le contenu`);
  const ids = new Set<string>();
  for (const m of mods) {
    if (m.kind === 'base' || !/^[a-z0-9-]+$/.test(m.id) || ids.has(m.id)) throw new Error(`Jeu de règles « ${id} » : mod « ${m.id} » invalide ou en double`);
    ids.add(m.id);
  }
  for (const m of [BASE_MOD, ...mods]) m.register(apiFor(m));
  runDerived(apiFor(BASE_MOD));
  const bad = Object.values(REGISTRIES).flatMap((r) => r.problems());
  if (bad.length) throw new Error(`Jeu de règles « ${id} » incohérent : ${bad.slice(0, 5).join(' ; ')}`);
  for (const r of Object.values(REGISTRIES)) r.freeze(opts.freezeTables);
  freezeRules();
  freezeModSettings();
  freezeUi();
  active = id;
  activeMods = mods.map((m) => m.id);
}

/** Charge le contenu d'un mod (chunk séparé) et en fait une définition */
async function loadMod(m: ModManifest): Promise<ModDef> {
  const c = (await m.load()).default;
  return { id: m.id, name: m.name, version: m.version, kind: m.kind, legacyIds: c.legacyIds, register: (api) => c.register(api) };
}

/**
 * Active un jeu de règles de cette version, identifiant complet (`pd2`, `d2+survivals`) : la base, la refonte du contenu, puis les modes de
 * jeu (asynchrone : le contenu des mods se charge à la demande, en chunk séparé)
 */
export async function activateRuleset(id: string, opts: { freezeTables?: boolean } = {}): Promise<void> {
  const problem = rulesetProblem(id);
  if (problem) throw new Error(`Jeu de règles inconnu : « ${id} » (${problem})`);
  addManifestTranslations();
  if (active === id) return;
  const { content, modes } = parseRuleset(id);
  const byId = new Map(discoveredMods().map((m) => [m.id, m]));
  const mods = await Promise.all([...rulesets()[content].mods, ...modes].map((mid) => loadMod(byId.get(mid)!)));
  activateMods(id, mods, opts);
}
