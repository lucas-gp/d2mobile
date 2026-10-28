/** Paliers d'affichage du butin (module feuille partagé par filter.ts, highlight.ts et tiers.ts). */

export const SHOW_HIDDEN = 0;
export const SHOW_NORMAL = 1;
export const SHOW_GOOD = 2;
export const SHOW_VALUABLE = 3;
export const SHOW_EXCEPTIONAL = 4;
/** Haute rune (rang >= HIGH_RUNE_RANK) : le plus haut palier d'affichage et d'annonce */
export const SHOW_HIGH_RUNE = 5;
export const HIGH_RUNE_RANK = 26; // Vex et au-dessus
export const EXCEPTIONAL_RUNE_RANK = 22; // Um, Mal, Ist, Gul : exceptionnelles sans être des HR
