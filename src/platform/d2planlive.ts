/**
 * Pont entre l'application (qui sait construire les zones et lire le rendu) et les Réglages : ordre de leveling, plan des zones
 * (mis en cache, calculé par petits morceaux pour ne pas figer l'écran) et préparation en arrière-plan en cours.
 */
import type { PlanZone, RunLite } from './d2plan';
import type { Pregen } from './d2pregen';

let order: RunLite[] = [];
let planner: ((r: RunLite) => PlanZone | null) | null = null;
const cache = new Map<string, PlanZone | null>();
let pregen: Pregen | null = null;

export function installPlanner(o: RunLite[], p: (r: RunLite) => PlanZone | null, pg: Pregen): void {
  order = o;
  planner = p;
  pregen = pg;
  cache.clear();
  full = null;
}

export const livePregen = (): Pregen | null => pregen;
export const planReady = (): boolean => !!planner;

export function planFor(r: RunLite): PlanZone | null {
  if (cache.has(r.id)) return cache.get(r.id)!;
  let z: PlanZone | null = null;
  try {
    z = planner ? planner(r) : null;
  } catch {
    z = null;
  }
  // un plan dont la carte n'est pas encore chargée sera complété plus tard : pas mis en cache
  if (!z || z.complete !== false) cache.set(r.id, z);
  return z;
}

/** Plan de toutes les zones, dans l'ordre de leveling, quelques zones par tour de boucle (null : pas encore installé) */
let full: PlanZone[] | null = null;

export async function allPlan(onProgress?: (done: number, total: number) => void): Promise<PlanZone[] | null> {
  if (!planner) return null;
  if (full) return full;
  const out: PlanZone[] = [];
  for (let i = 0; i < order.length; i++) {
    const z = planFor(order[i]);
    if (z) out.push(z);
    if (i % 3 === 2) {
      onProgress?.(i + 1, order.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.(order.length, order.length);
  // le plan complet n'est gardé que si toutes les zones sont connues ; sinon il sera recalculé (les cartes arrivent au fil de la préparation)
  if (out.every((z) => z.complete !== false)) full = out;
  return out;
}
