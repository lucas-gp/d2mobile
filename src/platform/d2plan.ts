/**
 * Plan de préparation des graphismes Diablo II (mode local) : ordre de « leveling » des zones, catégories du récapitulatif des Réglages
 * (interface, icônes, personnages par classe, monstres / décors / cartes par acte, effets, sons) et calculs d'avancement, d'espace et de temps.
 * Fonctions pures (aucun accès au navigateur ni au rendu) : testées seules.
 */
import { COST, hasTier, isMapAsset, type Tier } from './d2local-core';
import type { LocalManifest } from './d2local-core';

export interface RunLite {
  id: string;
  name: string;
  recLevel: [number, number, number];
  /** « act1 »… « act5 » pour une zone de campagne */
  campaign?: string;
  hidden?: boolean;
}

/** Niveau conseillé (Normal) en dessous duquel une run hors campagne se joue avant l'Acte I complet (Comtesse, Andariel…) */
const EARLY_RUN_LEVEL = 12;

/**
 * Ordre dans lequel un nouveau personnage rencontre les zones : Tristram d'abord (zone de départ du jeu), les runs de bas niveau hors
 * campagne, puis la campagne acte par acte dans l'ordre des étapes, enfin le reste des runs par niveau conseillé. Les runs cachées
 * (portails du Cube) sont écartées.
 */
export function levelingOrder(runs: RunLite[], campaigns: { id: string; steps: { id: string }[] }[]): RunLite[] {
  const byId = new Map(runs.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const out: RunLite[] = [];
  const push = (r: RunLite | undefined): void => {
    if (!r || r.hidden || seen.has(r.id)) return;
    seen.add(r.id);
    out.push(r);
  };
  push(byId.get('tristram'));
  const free = runs.filter((r) => !r.campaign && !r.hidden).sort((a, b) => a.recLevel[0] - b.recLevel[0]);
  for (const r of free) if (r.recLevel[0] <= EARLY_RUN_LEVEL) push(r);
  for (const c of campaigns) for (const st of c.steps) push(byId.get(st.id));
  for (const r of free) push(r);
  return out;
}

/** Acte (1 à 5) d'une run ; 0 = hors campagne sans acte clair */
export function actOfRun(r: RunLite): number {
  const m = /^act(\d)$/.exec(r.campaign ?? '');
  if (m) return Number(m[1]);
  return ACT_OF_FREE_RUN[r.id] ?? 0;
}

/** Acte des runs et cartes hors campagne (lieux du jeu d'origine) */
const ACT_OF_FREE_RUN: Record<string, number> = {
  tristram: 1,
  countess: 1,
  andariel: 1,
  cows: 1,
  uber_tristram: 1,
  uber_lilith: 1,
  tombs: 2,
  duriel_lair: 2,
  uber_duriel: 2,
  mephisto: 3,
  river: 4,
  chaos: 4,
  a4_river: 4,
  uber_izual: 4,
  pindleskin: 5,
  nihlathak: 5,
  ancients: 5,
  baal: 5,
  baal_chamber: 5,
  eldritch: 5,
  harrogath: 5,
};

/** Acte d'une carte DS1 (identifiant de `catalog.maps`) ; 0 = sans acte */
export function actOfMap(id: string): number {
  const m = /^a(\d)_/.exec(id);
  if (m) return Number(m[1]);
  return ACT_OF_FREE_RUN[id] ?? 0;
}

type CatKind = 'ui' | 'icons' | 'class' | 'units' | 'decor' | 'maps' | 'fx' | 'sounds';

export interface CatalogLike {
  units: string[];
  parts: string[];
  props: string[];
  fx: string[];
  grounds: string[];
  extras: string[];
  maps: string[];
}

export interface Category {
  key: string;
  kind: CatKind;
  label: string;
  /** acte (1 à 5) ou classe, si pertinent */
  act?: number;
  classId?: string;
  /** identifiants d'assets (planches, sols, lots, cartes `map:<id>`) */
  ids: string[];
}

/** Zone du plan : ce que sa préparation demande (planches et carte) */
export interface PlanZone {
  runId: string;
  name: string;
  act: number;
  sheets: string[];
  map?: string;
  /** les données de sa carte sont chargées : sa distribution de monstres et ses décors sont connus */
  complete?: boolean;
}

export const ACT_LABELS = ['Hors campagne', 'Acte I', 'Acte II', 'Acte III', 'Acte IV', 'Acte V'] as const;

/** Classe (identifiant) à laquelle appartient une planche de personnage (`sorceress`, `sorceress_hd_xxx`…), ou null */
export function classOfSheet(id: string, classIds: readonly string[]): string | null {
  for (const c of classIds) if (id === c || id.startsWith(`${c}_`)) return c;
  return null;
}

/**
 * Catégories du récapitulatif. Un identifiant n'appartient qu'à une catégorie : les planches de personnage à leur classe, les autres à
 * l'acte de la première zone (dans l'ordre de leveling) qui les utilise, les sols, murs et décors idem ; sans zone connue : « Hors campagne ».
 */
export function buildCategories(cat: CatalogLike, plan: PlanZone[], classIds: readonly string[], classLabel: (c: string) => string): Category[] {
  const actOf = new Map<string, number>();
  for (const z of plan) if (z.complete !== false) for (const id of z.sheets) if (!actOf.has(id)) actOf.set(id, z.act);
  const out: Category[] = [];
  out.push({ key: 'ui', kind: 'ui', label: 'Interface', ids: cat.extras.filter((e) => e === 'ui') });
  out.push({ key: 'icons', kind: 'icons', label: 'Icônes et textes', ids: cat.extras.filter((e) => e !== 'ui') });
  const classes = new Map<string, string[]>(classIds.map((c) => [c, []]));
  const units = new Map<number, string[]>();
  const decor = new Map<number, string[]>();
  const put = (m: Map<number, string[]>, act: number, id: string): void => {
    const a = m.get(act) ?? [];
    a.push(id);
    m.set(act, a);
  };
  for (const id of [...cat.units, ...cat.parts]) {
    const c = classOfSheet(id, classIds);
    if (c) classes.get(c)!.push(id);
    else put(units, actOf.get(id) ?? 0, id);
  }
  for (const id of [...cat.grounds, ...cat.props]) put(decor, actOf.get(id) ?? 0, id);
  for (const c of classIds) out.push({ key: `class:${c}`, kind: 'class', label: classLabel(c), classId: c, ids: classes.get(c)! });
  const maps = new Map<number, string[]>();
  for (const id of cat.maps) put(maps, actOfMap(id), `map:${id}`);
  for (const act of [1, 2, 3, 4, 5, 0]) {
    const label = ACT_LABELS[act];
    if (units.get(act)?.length) out.push({ key: `units:${act}`, kind: 'units', label: `Monstres et personnages — ${label}`, act, ids: units.get(act)! });
    if (decor.get(act)?.length) out.push({ key: `decor:${act}`, kind: 'decor', label: `Sols, murs et décors — ${label}`, act, ids: decor.get(act)! });
    if (maps.get(act)?.length) out.push({ key: `maps:${act}`, kind: 'maps', label: `Cartes — ${label}`, act, ids: maps.get(act)! });
  }
  out.push({ key: 'fx', kind: 'fx', label: 'Effets', ids: cat.fx });
  return out;
}

export interface Row {
  key: string;
  label: string;
  kind: CatKind;
  done: number;
  total: number;
  /** octets déjà générés (mesurés dans le manifeste) */
  bytes: number;
  /** octets restant à générer (estimés) */
  bytesLeft: number;
  /** secondes restantes (estimées, appareil et palier donnés) */
  secondsLeft: number;
  /** identifiants restant à générer */
  todo: string[];
}

/** Coût estimé (secondes d'un PC, octets au palier `hi` + `lo` sommés) d'un identifiant, d'après sa famille */
function costOf(id: string, cat: CatalogLike, mapAvg: { sec: number; bytes: number }): { sec: number; bytes: number } {
  if (isMapAsset(id)) return mapAvg;
  if (cat.extras.includes(id)) return { sec: COST.extras.sec / Math.max(1, cat.extras.length), bytes: COST.extras.bytes / Math.max(1, cat.extras.length) };
  if (id.startsWith('fx_')) return COST.fx;
  if (cat.parts.includes(id)) return COST.part;
  if (cat.units.includes(id)) return COST.unit;
  if (cat.grounds.includes(id)) return COST.ground;
  return COST.prop;
}

/** Part des octets (hi + lo) du palier demandé, d'après les mesures de estimateAll */
const TIER_BYTES = { hi: 0.65, lo: 0.4 } as const;
const TIER_TIME = { hi: 0.97, lo: 0.92 } as const;

/** Moyenne mesurée des cartes déjà générées (octets), sinon une valeur par défaut prudente (PC, un Worker) */
function mapAverage(m: LocalManifest, tier: Tier): { sec: number; bytes: number } {
  const ready = Object.values(m.maps ?? {}).filter((e) => e.data && (e.hi || e.lo));
  const bytes = ready.length ? ready.reduce((a, e) => a + e.bytes, 0) / ready.length : tier === 'hi' ? 12e6 : 4e6;
  return { sec: 14, bytes };
}

/** Une catégorie est-elle prête pour cet identifiant et ce palier ? (fournie par le service : `isReady` ou carte prête) */
export type ReadyFn = (id: string) => boolean;
export type BytesFn = (id: string) => number;

export function buildRows(cats: Category[], cat: CatalogLike, ready: ReadyFn, bytesOf: BytesFn, manifest: LocalManifest, tier: Tier, speed: number): Row[] {
  const avg = mapAverage(manifest, tier);
  return cats.map((c) => {
    const todo = c.ids.filter((id) => !ready(id));
    let bytes = 0;
    for (const id of c.ids) if (ready(id)) bytes += bytesOf(id);
    let sec = 0;
    let left = 0;
    for (const id of todo) {
      const k = costOf(id, cat, avg);
      const mapLike = isMapAsset(id);
      sec += mapLike ? k.sec : k.sec * TIER_TIME[tier];
      left += mapLike ? k.bytes : k.bytes * TIER_BYTES[tier];
    }
    return { key: c.key, label: c.label, kind: c.kind, done: c.ids.length - todo.length, total: c.ids.length, bytes, bytesLeft: Math.round(left), secondsLeft: Math.round(sec * speed), todo };
  });
}

/** Planche ou lot présent au palier voulu, pour le manifeste fourni (sans passer par le service) */
export function sheetBytes(m: LocalManifest, id: string): number {
  const e = m.sheets[id] ?? m.tiles[id];
  if (!e) return 0;
  return (hasTier(e, 'hi') ? e.hi.bytes : 0) + (hasTier(e, 'lo') ? e.lo.bytes : 0);
}
