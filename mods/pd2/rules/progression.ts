/**
 * Règles de progression du jeu pd2 (lot M8f : autrefois en dur dans src/sim/progression.ts, déplacées telles quelles), branchées sur les
 * règles nommées `xp.*` du jeu (src/mods/rules.ts) ; la base a celles de Diablo II LoD 1.13c (src/mods/d2/progression.ts).
 */
import type { ModApi } from '../../../src/mods/api';

/**
 * Pénalité selon l'écart entre niveau du monstre (mlvl) et du personnage (clvl) :
 * au-dessus de clvl+5, xp × clvl/mlvl ; en dessous de clvl−5, réduction progressive.
 */
function levelDiffMultiplier(clvl: number, mlvl: number): number {
  const diff = mlvl - clvl;
  if (diff > 5) return clvl / mlvl;
  if (diff < -5) {
    const table = [1, 0.81, 0.62, 0.43, 0.24, 0.05];
    const k = Math.min(5, -diff - 5);
    return table[k];
  }
  return 1;
}

export function registerProgressionRules(api: ModApi): void {
  api.rules.set('xp.levelFactor', () => levelDiffMultiplier);
}
