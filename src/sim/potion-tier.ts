/**
 * Lot 316 — a potion item's tier (0 Minor, 1 Light, 2 plain, 3 Greater, 4 Super), from ONE table (the drops', the vendor's, the belt's).
 *
 * A potion item keeps its item level in `ilvl` (the zone's level where it fell, the hero's level where it was bought); its tier is read
 * from it here, at pick-up into the belt (`addToCharacter`). Before lot 316 the drops and the vendor wrote the tier (0-4) into `ilvl` and
 * the belt read it as a level against other thresholds (15/30/50/70): every potion was Minor (25 %), hidden by the setting
 * `potionUpgrade`. That setting keeps its own table of the hero's level (`POTION_TIER_LEVELS`, world.ts: 1/10/20/35/50, unchanged: the
 * owner keeps the default settings, Survivals' balance is measured with it).
 *
 * Diablo II chooses the potion by the treasure class of the act and difficulty ("Potion 1" to "Potion 6": hp1-hp2 in Act I, hp4-hp5 in
 * Nightmare and Hell); the item level of the zone follows the same progression, so these thresholds stand for it.
 */
export const POTION_LEVELS = [1, 12, 24, 40, 60] as const;

/** The tier (0-4) of a potion of item level `level` (or reached by a hero of that level) */
export function potionTierAt(level: number): number {
  let t = 0;
  for (let i = 1; i < POTION_LEVELS.length; i++) if (level >= POTION_LEVELS[i]) t = i;
  return t;
}

/** The item level that stands for tier `tier` (a .d2s import's hp1-hp5) */
export function potionLevelOf(tier: number): number {
  return POTION_LEVELS[Math.max(0, Math.min(POTION_LEVELS.length - 1, Math.round(tier)))];
}
