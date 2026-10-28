/**
 * Tables dérivées des registres, calculées au chargement de leur module (avant l'activation du jeu de règles, voir README.md) : elles
 * seraient figées avec le contenu de la base seule. Chacune se déclare ici et est recalculée APRÈS l'enregistrement des mods, avant le gel :
 * - `derivedList` : vue (filtre, liste) recalculée sur place, même tableau (les importeurs gardent leur référence) ;
 * - `afterRegister` : complément d'une table de la base qui doit suivre les ajouts d'un mod (bases des runes, recettes d'amélioration
 *   des runes, fidélité des monstres), avec l'API de la base.
 * Un module chargé après l'activation calcule directement sur les tables finales : rien n'est alors enregistré.
 * Module feuille (types seulement).
 */
import type { ModApi } from './api';

type Hook = { name: string; run: (base: ModApi) => void };
const hooks: Hook[] = [];
let registered = false;

/** Complète une table après l'enregistrement des mods (ignoré si l'activation a déjà eu lieu : les tables sont alors finales) */
export function afterRegister(name: string, run: (base: ModApi) => void): void {
  if (!registered) hooks.push({ name, run });
}

/** Tableau dérivé : calculé tout de suite, puis recalculé sur place après l'enregistrement des mods */
export function derivedList<T>(name: string, compute: () => T[]): T[] {
  const out = compute();
  afterRegister(name, () => {
    const v = compute();
    out.length = 0;
    out.push(...v);
  });
  return out;
}

/** Recalcule toutes les tables dérivées (activate.ts, une fois, entre l'enregistrement des mods et le gel) */
export function runDerived(base: ModApi): void {
  registered = true;
  for (const h of hooks) {
    try {
      h.run(base);
    } catch (e) {
      throw new Error(`Table dérivée « ${h.name} » : ${(e as Error).message}`);
    }
  }
}

/** Noms des tables dérivées déclarées (tests) */
export function derivedNames(): string[] {
  return hooks.map((h) => h.name);
}
