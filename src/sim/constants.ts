/** Constantes de simulation. La simulation tourne à pas fixe, comme Diablo 2 (25 images/s). */
export const TICK_HZ = 25;
export const DT = 1 / TICK_HZ;

/** Rayon de ramassage automatique (unités de monde) */
export const AUTO_PICKUP_RADIUS = 2.2;
/** Distance d'interaction avec un objet au sol ou un PNJ */
export const INTERACT_RADIUS = 1.6;
/** Rayon du joueur */
export const PLAYER_RADIUS = 0.38;
/**
 * Rayon de collision avec le TERRAIN du joueur, du mercenaire et des invocations amies. D2 teste le point du personnage contre la grille de sous-tuiles :
 * un disque de 0,38 (0,76 de large pour des cases de 0,5) rendait infranchissables les passages d'une ou deux sous-tuiles, les coins en diagonale et les
 * bords de passerelles. 0,15 laisse passer un couloir d'une case (0,5) avec 0,1 de jeu de chaque côté. Le rayon de CORPS (séparation, monstres) reste PLAYER_RADIUS.
 */
export const TERRAIN_RADIUS = 0.15;
/** Portée de vue des monstres pour la ligne de mire */
export const FLOW_RADIUS_CELLS = 70;
/** Nombre maximal d'objets au sol conservés dans une zone */
export const MAX_GROUND_ITEMS = 400;
/**
 * Plafond de monstres vivants simultanés (hors créatures du joueur) : au-delà, un groupe à déclencheur
 * atteint attend pour apparaître (il apparaît dès que des monstres meurent, ou au retour du joueur).
 * Les cartes comptent ~1 000 monstres : seule une course à travers la carte sans combattre l'atteint.
 */
export const MAX_LIVE_MONSTERS = 250;

/**
 * Compensation de la densité des cartes : ~3,5× plus de monstres par carte (surface ×2, un groupe pour 215 u²
 * au lieu de 330, groupes plus gros : ~650 au lieu de ~185 ; champions ×2,8, uniques ×2,2). Les chances par monstre
 * (hors boss de carte) des cartes, orbes, éclats de Pierre-Monde et sceaux sont divisées par l'espérance pondérée par
 * rang de ce rapport (×3,0), pour garder le même nombre de ces objets PAR CARTE jouée. Le butin ordinaire (objets,
 * runes, gemmes, or) et l'expérience par monstre ne changent pas. Vérifié par tests/unit/map-shapes.test.ts (±10 %).
 */
export const MAP_DENSITY_DROP_DIV = 3.0;
