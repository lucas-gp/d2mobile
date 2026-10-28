/**
 * Description d'une carte en données pures : sol, murs, obstacles, décor, points
 * d'apparition, lumières, sorties. Les tuiles et sprites ne sont qu'une façon parmi
 * d'autres de l'afficher : un rendu 3D lirait exactement la même structure.
 */
import type { SeamDef } from './zones/seams';
export type { SeamDef };

export type GroundKind = 'grass' | 'deadgrass' | 'dirt' | 'mud' | 'cobble' | 'flagstone' | 'sand' | 'sandstone' | 'crypt' | 'snow' | 'hellstone' | 'lava' | 'void';

export interface GroundPatch {
  kind: GroundKind;
  /** Rectangle [x0,y0,x1,y1] en unités, ou cercle */
  rect?: [number, number, number, number];
  circle?: [number, number, number];
  /** Polyligne (chemin) avec largeur */
  path?: { points: [number, number][]; width: number };
}

export interface WallDef {
  /** Segment aligné sur les axes, en unités entières */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  style: string;
  /** Épaisseur (unités) */
  thick?: number;
  /** Hauteur visuelle (unités) */
  height?: number;
}

export interface PropPlacement {
  prop: string;
  x: number;
  y: number;
  /** Variante visuelle (0..n-1) : orientation ou modèle */
  variant?: number;
  scale?: number;
}

export interface SpawnDef {
  x: number;
  y: number;
  /** Rayon de dispersion */
  r: number;
  monster: string;
  count: number;
  rank?: 'normal' | 'champion' | 'unique' | 'boss';
  /** Nom du monstre unique */
  uniqueName?: string;
  /** Vague (Trône de Baal) : n'apparaît qu'au déclenchement de la vague */
  wave?: number;
  /** Déclencheur : n'apparaît que quand le joueur s'approche (économie de simulation) */
  trigger?: number;
  /** Chef du groupe = boss de la run (sa mort termine la run) */
  runBoss?: boolean;
  /** Sceau (Sanctuaire du Chaos) : n'apparaît qu'à l'ouverture du sceau de même identifiant */
  seal?: string;
  /** Gardien de sceau : Diablo n'apparaît qu'une fois tous les gardiens tués */
  sealGuard?: boolean;
  /** Escorte d'un unique de carte (groupe ordinaire posé à côté de lui : ne compte pas comme un groupe de plus) */
  escort?: boolean;
}

export interface LightDef {
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
  flicker?: number;
  /** Hauteur de la source (pour les normales) */
  z?: number;
}

export interface ExitDef {
  x: number;
  y: number;
  kind: 'waypoint' | 'portal' | 'door' | 'stairs';
  to?: string;
  label: string;
  /** Sortie active seulement quand la zone est vidée / boss tué */
  locked?: 'boss' | 'clear';
  /** Aspect de l'objet (planche) : « lair » pour la dalle du repaire de Duriel */
  variant?: string;
}

export interface ObjectDef {
  kind: 'chest' | 'shrine' | 'stash' | 'cube' | 'npc' | 'barrel' | 'sarcophagus' | 'waypoint' | 'weaponrack' | 'gate' | 'seal' | 'well' | 'quest';
  x: number;
  y: number;
  id?: string;
  variant?: string;
}

export interface ZoneDef {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Couleur et intensité de l'ambiance hors du rayon de lumière */
  ambient: { color: number; level: number };
  /** Sol de base */
  ground: GroundKind;
  patches: GroundPatch[];
  walls: WallDef[];
  props: PropPlacement[];
  /** Obstacles de collision additionnels (non affichés) */
  /** Obstacles invisibles ; `gate` : herse identifiée, ouverte par un événement de run */
  blockers: { rect?: [number, number, number, number]; circle?: [number, number, number]; opaque?: boolean; gate?: string }[];
  spawns: SpawnDef[];
  lights: LightDef[];
  exits: ExitDef[];
  /** Trône de Baal : où s'ouvre le portail vers la Chambre de la Pierre-Monde après la dernière vague (sans lui, la herse et Baal sont dans la même zone) */
  chamberAt?: { x: number; y: number };
  /** Point atteignable le plus éloigné du départ (carte D2) : l'issue d'une zone de campagne */
  farAt?: { x: number; y: number };
  /**
   * Lot 311: the zones joined to this one edge to edge (src/data/zones/seams.ts): the neighbour's map drawn beyond the edge, the hero
   * walking into it without a portal. Absent: none (portals only)
   */
  seams?: SeamDef[];
  /** Aspect de l'accès à la chambre : portail rouge de Baal ou dalle de rocaille du repaire de Duriel */
  chamberKind?: 'red' | 'lair';
  /** Trône de Baal : salle des vagues (centre, rayon) — une vague suit la mort des monstres de la salle seulement */
  waveArena?: { x: number; y: number; r: number };
  objects: ObjectDef[];
  start: { x: number; y: number };
  /** Zone de ville (pas de monstres, pas de perte) */
  town?: boolean;
  /** Famille visuelle des murs pour le choix des planches */
  theme: string;
  /** Musique/ambiance sonore */
  mood: string;
  /**
   * Sol par tuile (cartes d'endgame à forme générée) : indice dans `kinds` de chaque tuile carrée de `size`
   * unités (255 : aucune tuile, le noir du vide ou de la roche) ; remplace le sol de base uniforme.
   * `fx` : effet par indice, teinte (boue) et lueur additive (lave).
   */
  groundTiles?: { size: number; cols: number; rows: number; kinds: GroundKind[]; data: Uint8Array; fx?: Record<number, { tint?: number; glow?: number }> };
  /**
   * Monsters a game mode brings into the zone without a spawn entry (lot 285: Survivals' director): their sprite sheets are loaded with
   * the zone's, and those of the monsters alive are reloaded when one is missing. Absent in the base's zones (unchanged loading).
   */
  monsterPool?: string[];
  /** Carte de Diablo II importée : collision par sous-tuile (0,5 unité) qui remplace celle des murs et du décor, et rendu de la carte */
  d2Map?: {
    id: string;
    cols: number;
    rows: number;
    blocked: Uint8Array;
    opaque: Uint8Array;
    /** Structures of the map not drawn (indices in its `places`; lot 287: the trees a game mode thins out of an arena). Absent: all drawn */
    hidden?: readonly number[];
    /**
     * Lot 301: the only part of the map that can be seen (world units `[x0, y0, x1, y1]`: a game mode's arena, the rest out of reach): the
     * ground and the structures loaded within it and a screen's margin around. Absent: the whole map
     */
    view?: readonly [number, number, number, number];
  };
}

/** Options de construction d'une carte d'endgame (affixes de la carte : densité, rareté, famille ou boss en plus, fortification, événement) */
export interface MapZoneOptions {
  /** Densité supplémentaire (%) */
  density: number;
  /** Rareté des monstres supplémentaire (%) */
  rarity: number;
  /** Famille supplémentaire (affixe) */
  extraFamily?: string;
  /** Boss supplémentaire (affixe « Jumelle ») */
  extraBoss?: boolean;
  /** Carte fortifiée : ½ monstres (compensé ailleurs par ×2 butin et vie) */
  fortified?: boolean;
  /** Événement de carte (PD2 §6.5) : Déchu au trésor ou coffre d'Horazon */
  event?: MapEvent;
}

export type MapEvent = 'treasure' | 'horazon' | 'horde' | 'shrines' | 'rival' | 'ambush' | 'wanderer' | 'mendeln' | 'altar' | 'heroes';
