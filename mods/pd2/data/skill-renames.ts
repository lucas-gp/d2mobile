/**
 * Compétences renommées lors du passage du jeu aux arbres PD2 S13 (anciens identifiants des sauvegardes → identifiants du mod), reportées
 * au chargement d'un personnage pd2 (règle `skills.renames`, src/sim/game.ts : migrateSkills). Lot M9 : sorti de la base.
 */
export const PD2_SKILL_RENAMES: Readonly<Record<string, string>> = {
  lycanthropy: 'shape_shifting',
  poison_creeper: 'plague_poppy',
  carrion_vine: 'cycle_of_life',
  solar_creeper: 'vines',
  dire_wolf: 'summon_fenris',
  fissure: 'eruption',
};
