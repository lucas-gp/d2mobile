/**
 * Opérations de carte hors du Cube (menu d'une carte, fusion en lot du coffre de cartes) : mêmes recettes, mêmes coûts, mêmes issues que le
 * Cube (lot M5c ; autrefois dans src/sim/cube.ts), branchées sur les règles `maps.ops`, `maps.opCheck`, `maps.upgrade`, `maps.mergePreview`,
 * `maps.merge` (sim/endgame.ts). Types partagés avec l'interface : src/sim/cube.ts.
 */
import {
  addMapToStash,
  BASE_BY_ID,
  canPay,
  CUBE_BY_ID,
  itemAccepted,
  matCount,
  pay,
  Rng,
  type CharacterState,
  type CubeResult,
  type Item,
  type MapOpCheck,
  type MapRef,
  type MergeOpts,
  type MergePreview,
  type MergeResult,
} from '../../../src/mods/sdk';
import { applyMapRecipe, corruptMap } from './maps';

/** Opérations d'une carte : chacune est une recette du Cube (`recipe`) appliquée à une carte */
export const MAP_OPS = [
  { id: 'arcane', recipe: 'map_arcane', label: 'Améliorer en magique', irreversible: false },
  { id: 'zakarum', recipe: 'map_zakarum', label: 'Améliorer en rare', irreversible: false },
  { id: 'angelic', recipe: 'map_angelic', label: 'Magique → rare', irreversible: false },
  { id: 'horadrim', recipe: 'map_horadrim', label: 'Relancer les affixes', irreversible: true },
  { id: 'destruction', recipe: 'map_destruction', label: 'Retirer les affixes', irreversible: true },
  { id: 'fortification', recipe: 'map_fortification', label: 'Fortifier', irreversible: false },
  { id: 'catalyst', recipe: 'map_catalyst', label: 'Infuser (catalyseur)', irreversible: false },
  { id: 'heroes', recipe: 'map_heroes', label: 'Rendre héroïque', irreversible: false },
  { id: 'scarab', recipe: 'map_scarab', label: 'Donjon (scarabée)', irreversible: true },
  { id: 'corrupt', recipe: 'corrupt', label: 'Corrompre', irreversible: true },
] as const;
export type MapOpId = (typeof MAP_OPS)[number]['id'];

function mapRefItem(c: CharacterState, ref: MapRef): Item | null {
  const it = ref.from === 'inv' ? c.inventory[ref.idx] : ref.from === 'stash' ? c.stash[ref.tab]?.[ref.idx] : c.mapStash?.[ref.idx];
  return it?.map ? it : null;
}

/** Réécrit la carte à sa place (le scarabée la remplace par un donjon) */
function mapRefSet(c: CharacterState, ref: MapRef, it: Item): void {
  if (ref.from === 'inv') c.inventory[ref.idx] = it;
  else if (ref.from === 'stash') c.stash[ref.tab][ref.idx] = it;
  else c.mapStash![ref.idx] = it;
}

const MAP_OP_NEEDS: Record<MapOpId, string> = {
  arcane: 'Carte normale ou magique requise',
  zakarum: 'Carte normale requise',
  angelic: 'Carte magique requise',
  horadrim: 'Carte rare requise',
  destruction: 'Carte magique ou rare requise',
  fortification: 'Carte magique ou rare requise',
  catalyst: 'Carte magique ou rare requise',
  heroes: 'Carte magique, rare ou unique requise',
  scarab: 'Palier 3 requis',
  corrupt: 'Impossible',
};
const MAP_OP_MISSING: Partial<Record<MapOpId, string>> = { corrupt: 'Aucun éclat', catalyst: 'Aucun éclat', heroes: 'Aucun étendard', scarab: 'Aucun scarabée' };

/** Vérification sans effet de bord : mêmes règles que la recette (essai de `applyMapRecipe` sur une copie de la carte) */
export function mapOpCheck(c: CharacterState, it: Item | null, opId: MapOpId): MapOpCheck {
  const op = MAP_OPS.find((o) => o.id === opId)!;
  const rec = CUBE_BY_ID[op.recipe];
  const mat = rec.cost[0].ids[0];
  const base = { mat, matName: BASE_BY_ID[mat]?.name ?? mat, have: matCount(c, mat) };
  if (!it?.map) return { ok: false, reason: 'Une carte est nécessaire', ...base };
  if (it.corrupted) return { ok: false, reason: 'Déjà corrompue', ...base };
  if (rec.effect.kind !== 'corrupt') {
    if (!itemAccepted(it, rec.items!.accept)) return { ok: false, reason: MAP_OP_NEEDS[opId], ...base };
    const trial = applyMapRecipe(new Rng('essai'), rec.effect, [structuredClone(it)], c.level);
    if (!trial.ok) return { ok: false, reason: /déjà/.test(trial.reason ?? '') ? trial.reason : `${trial.reason} requise`, ...base };
  }
  if (!canPay(c, rec.cost)) return { ok: false, reason: MAP_OP_MISSING[opId] ?? 'Aucun orbe', ...base };
  return { ok: true, ...base };
}

/**
 * Applique une opération à la carte désignée : mêmes fonctions que le Cube (`applyMapRecipe` / `corruptMap`) et même coût (recette du Cube).
 * Refus sans rien consommer ; la carte est modifiée sur place.
 */
export function upgradeMapWith(c: CharacterState, ref: MapRef, opId: MapOpId, rng: Rng): CubeResult {
  const op = MAP_OPS.find((o) => o.id === opId);
  if (!op) return { ok: false, reason: 'Opération inconnue' };
  const it = mapRefItem(c, ref);
  const chk = mapOpCheck(c, it, opId);
  if (!chk.ok || !it) return { ok: false, reason: chk.reason };
  const rec = CUBE_BY_ID[op.recipe];
  if (rec.effect.kind === 'corrupt') {
    pay(c, rec.cost);
    return { ok: true, item: it, note: corruptMap(rng, it) };
  }
  const r = applyMapRecipe(rng, rec.effect, [it], c.level);
  if (!r.ok || !r.item) return { ok: false, reason: r.reason };
  pay(c, rec.cost);
  if (r.item !== it) mapRefSet(c, ref, r.item);
  return { ok: true, item: r.item, note: r.note };
}

/* ------------------------------------------------------------------ */
/* Fusion en lot des cartes du coffre de cartes (3 cartes → 1)          */
/* ------------------------------------------------------------------ */

/** Cartes éligibles du coffre de cartes, les moins précieuses d'abord (normales avant magiques, moins d'affixes d'abord) */
function mergeCandidates(c: CharacterState, o: MergeOpts): number[] {
  const q = o.quality ?? 'normal';
  const out: number[] = [];
  (c.mapStash ?? []).forEach((it, i) => {
    const m = it.map;
    if (!m || m.tier !== o.tier || it.corrupted || m.corruptMod) return;
    if (it.quality !== 'normal' && !(it.quality === 'magic' && q !== 'normal')) return;
    if ((m.fortified || m.heroic || m.catalyst) && q !== 'notrare') return;
    out.push(i);
  });
  const stash = c.mapStash ?? [];
  const flags = (i: number) => (stash[i].map!.fortified ? 1 : 0) + (stash[i].map!.heroic ? 1 : 0) + (stash[i].map!.catalyst ? 1 : 0);
  const rank = (i: number) => (stash[i].quality === 'normal' ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || flags(a) - flags(b) || stash[a].map!.mods.length - stash[b].map!.mods.length || a - b);
}

function mergePlan(c: CharacterState, o: MergeOpts): MergePreview & { picked: number[] } {
  const rec = CUBE_BY_ID[o.mode === 'upgrade' ? 'map_cartographer' : 'map_three'];
  const orbsHave = matCount(c, 'orb_cartographer');
  const toTier = o.mode === 'upgrade' ? o.tier + 1 : o.tier;
  const base = { ok: false, lots: 0, eligible: 0, consumed: 0, byQuality: { normal: 0, magic: 0 }, orbsNeeded: 0, orbsHave, toTier, picked: [] as number[] };
  if (!rec.items!.accept.mapTiers!.includes(o.tier)) return { ...base, reason: o.mode === 'upgrade' ? 'Paliers 1 et 2 seulement' : 'Paliers 1 à 3 seulement' };
  const cand = mergeCandidates(c, o);
  base.eligible = cand.length;
  let lots = Math.floor(cand.length / 3);
  if (lots === 0) return { ...base, reason: 'Moins de 3 cartes éligibles' };
  if (o.maxLots !== undefined) lots = Math.min(lots, Math.max(0, Math.floor(o.maxLots)));
  if (o.mode === 'upgrade') {
    if (orbsHave === 0) return { ...base, reason: 'Aucun orbe' };
    lots = Math.min(lots, orbsHave);
  }
  if (lots === 0) return { ...base, reason: 'Aucun lot demandé' };
  const picked = cand.slice(0, lots * 3);
  const byQuality = { normal: 0, magic: 0 };
  for (const i of picked) byQuality[c.mapStash![i].quality === 'normal' ? 'normal' : 'magic']++;
  return { ok: true, lots, eligible: cand.length, consumed: picked.length, byQuality, orbsNeeded: o.mode === 'upgrade' ? lots : 0, orbsHave, toTier, picked };
}

/** Aperçu sans effet de bord (interface) */
export function mergeMapsPreview(c: CharacterState, o: MergeOpts): MergePreview {
  const { picked: _p, ...r } = mergePlan(c, o);
  return r;
}

/**
 * Fusionne en lot les cartes du coffre de cartes : par lots complets de 3, les moins précieuses d'abord ; chaque lot passe par
 * `applyMapRecipe` (la recette du Cube) et coûte son orbe du cartographe en mode 'upgrade'. Refus sans rien consommer.
 */
export function mergeMapsFromStash(c: CharacterState, o: MergeOpts, rng: Rng): MergeResult {
  const plan = mergePlan(c, o);
  const fail = (reason?: string): MergeResult => ({ ok: false, reason, lots: 0, consumed: 0, produced: 0, orbsUsed: 0, toTier: plan.toTier });
  if (!plan.ok) return fail(plan.reason);
  const rec = CUBE_BY_ID[o.mode === 'upgrade' ? 'map_cartographer' : 'map_three'];
  const stash = c.mapStash!;
  // résultats d'abord (aucune mutation tant que tout n'est pas calculé)
  const made: Item[] = [];
  for (let l = 0; l < plan.lots; l++) {
    const trio = plan.picked.slice(l * 3, l * 3 + 3).map((i) => stash[i]);
    const r = applyMapRecipe(rng, rec.effect, trio, c.level);
    if (!r.ok || !r.item) return fail(r.reason);
    made.push(r.item);
  }
  const gone = new Set(plan.picked);
  c.mapStash = stash.filter((_, i) => !gone.has(i));
  for (const it of made) addMapToStash(c, it);
  if (o.mode === 'upgrade') for (let l = 0; l < plan.lots; l++) pay(c, rec.cost);
  return { ok: true, lots: plan.lots, consumed: plan.consumed, produced: made.length, orbsUsed: plan.orbsNeeded, toTier: plan.toTier };
}
