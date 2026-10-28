/**
 * Artisanat de Project Diablo 2 (lot M10c : autrefois en dur dans src/data/cube.ts et src/sim/cube.ts, déplacé tel quel), branché sur la
 * règle nommée `cube.craft` du jeu (src/mods/rules.ts) : toute base de l'emplacement, rune et propriétés fixes du tableau « Crafting
 * Comparison Chart » du wiki PD2 (mods/pd2/data/cube.ts) ; la base a celui de Diablo II LoD 1.13c (src/mods/d2/cube.ts).
 */
import type { CraftFamily, ModApi } from '../../../src/mods/api';
import { CRAFT_MODS, CRAFT_RUNES } from '../data/cube';

export function registerCubeRules(api: ModApi): void {
  api.rules.set('cube.craft', () => (family, slot) => {
    const rune = CRAFT_RUNES[family as CraftFamily]?.[slot];
    return rune ? { rune, mods: CRAFT_MODS[family as CraftFamily][slot] ?? [] } : null;
  });
}
