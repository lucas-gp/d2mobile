/**
 * Catalogue de la chaîne de pré-rendu : pour chaque planche, le modèle source, ses
 * adaptations (teintes, accessoires, échelle), le nombre de directions et les animations.
 * Les familles de monstres de Diablo sont associées aux modèles libres (ASSETS.md §4).
 * Les tailles de jeu (hitbox, portée) restent dans src/data : ici, seulement l'apparence.
 */
import { PROPS } from '../../src/data/props';
import { MONSTERS } from '../../src/data/monsters';

export interface AnimSpec {
  clip: string;
  frames: number;
  loop?: boolean;
  /** portion du clip utilisée (0..1) */
  start?: number;
  span?: number;
  /** vitesse de lecture en jeu (images/s) */
  fps: number;
  /** image d'action (coup, sort) */
  action?: number;
  /** directions propres (ex. mort sur 8 directions pour la Sorcière) */
  dirs?: number;
}

export interface SheetSpec {
  id: string;
  kind: 'actor' | 'prop';
  model: string;
  dirs: number;
  cell: [number, number];
  anchor: [number, number];
  height?: number;
  footprint?: [number, number];
  rot?: number;
  static?: boolean;
  centerXZ?: boolean;
  tint?: number;
  meshTints?: Record<string, number>;
  /** Recoloration qui conserve la luminance : [couleur, force 0..1] */
  meshColorize?: Record<string, [number, number]>;
  matColorize?: Record<string, [number, number]>;
  /** Recoloration de tous les matériaux (décor) */
  colorizeAll?: [number, number];
  /** Écrasement vertical du modèle (murs bas) */
  heightScale?: number;
  /** Remplacement de la couleur de base d'un matériau (modèles à couleurs unies) */
  matColor?: Record<string, number>;
  /** Matériaux masqués (maillage unique : chapeau, accessoire intégré…) */
  hideMats?: string[];
  /** Atlas de couleurs de remplacement (dérivé CC0 du modèle) pour les matériaux texturés */
  textureOverride?: string;
  /** Mise à l'échelle d'os (proportions moins « chibi ») */
  boneScale?: Record<string, [number, number, number]>;
  matTints?: Record<string, number>;
  hide?: string[];
  accessories?: { model: string; bone: string; pos?: [number, number, number]; rot?: [number, number, number]; scale?: number; size?: number; tint?: number; metal?: boolean }[];
  anims: Record<string, AnimSpec>;
  yawOffset?: number;
  chroma?: number;
  /** Créature procédurale (page/procedural.js) : remplace le modèle glTF */
  procedural?: string;
  grime?: number;
  shadow?: boolean;
  /** Échelle de la texture (1 = pixel pour pixel ; < 1 = texture réduite, agrandie en jeu) */
  texScale?: number;
  /** groupe de chargement (planches regroupées pour le décor) */
  group?: string;
}

const A = 'characters/kaykit-adventurers/';
const UAC = 'monsters/quaternius-ultimate-animated-character/';

/** Cellules (px à l'échelle 1) et ancre du pied */
const CELL = {
  small: { cell: [112, 112] as [number, number], anchor: [56, 88] as [number, number] },
  medium: { cell: [144, 144] as [number, number], anchor: [72, 112] as [number, number] },
  // échelle de texture réduite pour les grands monstres (budget mémoire de la zone de Baal,
  // où toutes les vagues sont chargées ensemble ; docs/ARCHITECTURE.md, budget 128 Mo)
  large: { cell: [208, 208] as [number, number], anchor: [104, 160] as [number, number], texScale: 0.65 },
  boss: { cell: [320, 320] as [number, number], anchor: [160, 250] as [number, number], texScale: 0.5 },
};

/* ---------------- Jeux d'animations par famille de rig ---------------- */

/** Animations des créatures procédurales (clips Idle, Walk, Attack, Cast, Hit, Death de procedural.js) */
const procAnims = (attack = 'Attack'): Record<string, AnimSpec> => ({
  idle: { clip: 'Idle', frames: 8, loop: true, fps: 8 },
  walk: { clip: 'Walk', frames: 8, loop: true, fps: 12 },
  attack: { clip: attack, frames: 13, fps: 16, action: 6 },
  cast: { clip: 'Cast', frames: 10, fps: 13, action: 5 },
  hit: { clip: 'Hit', frames: 4, fps: 13 },
  death: { clip: 'Death', frames: 13, fps: 11 },
});

const NPC_IDLE: Record<string, AnimSpec> = { idle: { clip: 'Idle', frames: 8, loop: true, fps: 8 } };

/** Créature procédurale (page/procedural*.js) : remplace le modèle glTF */
const proc = (name: string, cell: { cell: [number, number]; anchor: [number, number]; texScale?: number }, height: number, extra: Partial<SheetSpec> = {}) => ({
  model: `procedural:${name}`,
  procedural: name,
  ...cell,
  height,
  chroma: 0.95,
  grime: 0.1,
  anims: procAnims(),
  ...extra,
});

/* ---------------- Personnages ---------------- */

export const SORCERESS: SheetSpec = {
  id: 'sorceress',
  kind: 'actor',
  // Sorcière façon Diablo II (image de référence fournie : style seulement, rien n'en est repris) :
  // modèle CC0 Quaternius « Witch » (cheveux longs, robe) sans chapeau, couleurs de matériau
  // (cheveux noirs, robe émeraude, ceinture brun-rouge, or), tête réduite et jambes allongées pour
  // une silhouette fine ; bâton de bois sombre à orbe violet (tools/prerender/paint-sorceress.py)
  model: `${UAC}Witch.glb`,
  dirs: 16,
  ...CELL.medium,
  height: 2.02,
  hideMats: ['Hat'],
  matColor: { Skin: 0xd8aa8c, Hair: 0x0a080a, Clothes: 0x1f8a62, Belt: 0x6a2620, Gold: 0xd2a444 },
  boneScale: {
    Head: [0.8, 0.8, 0.8],
    Torso: [0.88, 1.04, 0.88],
    Abdomen: [0.86, 1.06, 0.86],
    UpperLegL: [0.88, 1.16, 0.88],
    UpperLegR: [0.88, 1.16, 0.88],
    LowerLegL: [0.9, 1.12, 0.9],
    LowerLegR: [0.9, 1.12, 0.9],
  },
  accessories: [{ model: `${A}accessories/sorceress_staff.gltf`, bone: 'Fist.R', size: 1.15, rot: [180, 0, 0] }],
  anims: {
    idle: { clip: 'Idle', frames: 8, loop: true, fps: 10 },
    walk: { clip: 'Run', frames: 8, loop: true, fps: 16 },
    attack: { clip: 'SwordSlash', frames: 12, fps: 25, action: 6 },
    cast: { clip: 'Shoot_OneHanded', frames: 12, fps: 25, action: 6 },
    hit: { clip: 'RecieveHit', frames: 6, fps: 20 },
    death: { clip: 'Death', frames: 16, fps: 16, dirs: 8 },
  },
};

// Druide façon Diablo II : modèle CC0 Quaternius « Viking » (barbu, bras nus, cuir vert mousse et
// fourrure), tête réduite et jambes allongées comme la Sorcière ; bâton de bois clair à orbe vert
// (tools/prerender/paint-sorceress.py)
export const DRUID: SheetSpec = {
  id: 'druid',
  kind: 'actor',
  model: `${UAC}Viking_Male.glb`,
  dirs: 16,
  ...CELL.medium,
  height: 2.1,
  matColor: { Skin: 0xc8946c, Light: 0x7a6446, Main: 0x3e5226, Pants: 0x3a2a1c, Hair: 0x4a2e18 },
  boneScale: {
    Head: [0.78, 0.78, 0.78],
    Torso: [0.94, 1.04, 0.94],
    Abdomen: [0.92, 1.06, 0.92],
    UpperLegL: [0.92, 1.16, 0.92],
    UpperLegR: [0.92, 1.16, 0.92],
    LowerLegL: [0.92, 1.12, 0.92],
    LowerLegR: [0.92, 1.12, 0.92],
  },
  accessories: [{ model: `${A}accessories/druid_staff.gltf`, bone: 'Fist.R', size: 1.2, rot: [180, 0, 0] }],
  anims: {
    idle: { clip: 'Idle', frames: 8, loop: true, fps: 10 },
    walk: { clip: 'Run', frames: 8, loop: true, fps: 16 },
    attack: { clip: 'SwordSlash', frames: 12, fps: 25, action: 6 },
    cast: { clip: 'Shoot_OneHanded', frames: 12, fps: 25, action: 6 },
    hit: { clip: 'RecieveHit', frames: 6, fps: 20 },
    death: { clip: 'Death', frames: 16, fps: 16, dirs: 8 },
  },
};

/** Personnages jouables procéduraux (page/procedural-heroes.js) : 16 directions comme la Sorcière */
export const HEROES: SheetSpec[] = [
  { id: 'barbarian', kind: 'actor', dirs: 16, ...proc('hero_barbarian', CELL.medium, 2.1) },
  { id: 'paladin', kind: 'actor', dirs: 16, ...proc('hero_paladin', CELL.medium, 2.1, { anims: procAnims('Attack') }) },
  { id: 'amazon', kind: 'actor', dirs: 16, ...proc('hero_amazon', CELL.medium, 2.0) },
  { id: 'assassin', kind: 'actor', dirs: 16, ...proc('hero_assassin', CELL.medium, 2.0) },
  { id: 'necromancer', kind: 'actor', dirs: 16, ...proc('hero_necromancer', CELL.medium, 2.0) },
  // créatures invoquées par les classes (golems et Valkyrie du Nécromancien et de l'Amazone, mur d'os)
  { id: 'clay_golem', kind: 'actor', dirs: 8, ...proc('clay_golem', CELL.large, 2.5) },
  { id: 'blood_golem', kind: 'actor', dirs: 8, ...proc('blood_golem', CELL.large, 2.5) },
  { id: 'iron_golem', kind: 'actor', dirs: 8, ...proc('iron_golem', CELL.large, 2.7) },
  { id: 'fire_golem', kind: 'actor', dirs: 8, ...proc('fire_golem', CELL.large, 2.7) },
  { id: 'valkyrie', kind: 'actor', dirs: 8, ...proc('valkyrie', CELL.medium, 2.1) },
  { id: 'bone_wall', kind: 'actor', dirs: 8, ...proc('bone_wall', CELL.small, 1.4) },
];

/** Formes du Druide : loup-garou (loup CC0 Quaternius, pelage gris-brun) et ours-garou (Yeti CC0
 *  brun) ; 8 directions comme les monstres (budget mémoire : une forme ≈ 10 Mo au lieu de 20) */
export const DRUID_FORMS: SheetSpec[] = [
  // D2 : loup-garou gris à museau long, ours-garou brun massif — procéduraux (page/procedural-druid.js)
  { id: 'werewolf', kind: 'actor', dirs: 8, ...proc('werewolf', CELL.medium, 2.0) },
  { id: 'werebear', kind: 'actor', dirs: 8, ...proc('werebear', CELL.large, 2.6) },
];

/** Créatures du Druide (teinte par espèce appliquée en jeu : loup spirituel bleuté, loup redoutable
 *  sombre) ; lianes et esprits sont dessinés par le rendu (Graphics), sans planche */
const DRUID_PETS: SheetSpec[] = [
  {
    id: 'wolf',
    kind: 'actor',
    dirs: 8,
    ...proc('wolf', CELL.small, 1.15, {
      anims: {
        idle: { clip: 'Idle', frames: 8, loop: true, fps: 10 },
        walk: { clip: 'Walk', frames: 8, loop: true, fps: 16 },
        attack: { clip: 'Attack', frames: 10, fps: 20, action: 5 },
        hit: { clip: 'Hit', frames: 4, fps: 13 },
        death: { clip: 'Death', frames: 10, fps: 11 },
      },
    }),
  },
  {
    id: 'raven',
    kind: 'actor',
    dirs: 8,
    ...proc('raven', CELL.small, 0.75, {
      anims: {
        idle: { clip: 'Idle', frames: 6, loop: true, fps: 8 },
        walk: { clip: 'Walk', frames: 6, loop: true, fps: 14 },
        attack: { clip: 'Attack', frames: 8, fps: 16, action: 4 },
        death: { clip: 'Death', frames: 8, fps: 11 },
      },
    }),
  },
];

// PNJ de Harrogath (proportions humaines, comme la Sorcière) : modèles CC0 Quaternius repeints
const NPCS: SheetSpec[] = [
  // PNJ de Harrogath : créatures procédurales d'après les images D2 (Larzuk torse nu à tablier de cuir,
  // Malah en robe blanche à ceinture rouge-brun, Anya en tenue orange et noire)
  { id: 'npc_larzuk', kind: 'actor', dirs: 8, ...proc('npc_larzuk', CELL.medium, 1.95, { anims: NPC_IDLE }) },
  { id: 'npc_malah', kind: 'actor', dirs: 8, ...proc('npc_malah', CELL.medium, 1.7, { anims: NPC_IDLE }) },
  { id: 'npc_anya', kind: 'actor', dirs: 8, ...proc('npc_anya', CELL.medium, 1.8, { anims: NPC_IDLE }) },
  { id: 'npc_qual_kehk', kind: 'actor', dirs: 8, ...proc('npc_qual_kehk', CELL.medium, 2.0, { anims: NPC_IDLE }) },
];

const MERC_SHEETS: SheetSpec[] = [
  // Mercenaires : créatures procédurales d'après D2 / PD2 (l'Ascendant, créé par PD2, n'a pas d'image D2 :
  // à valider). Éclaireuse et Loup de fer, lanceurs, utilisent l'animation de tir pour attaquer.
  { id: 'merc_rogue', kind: 'actor', dirs: 8, ...proc('merc_rogue', CELL.medium, 1.95, { anims: procAnims('Cast') }) },
  { id: 'merc_desert', kind: 'actor', dirs: 8, ...proc('merc_desert', CELL.medium, 2.0) },
  { id: 'merc_ironwolf', kind: 'actor', dirs: 8, ...proc('merc_ironwolf', CELL.medium, 1.95, { anims: procAnims('Cast') }) },
  { id: 'merc_ascendant', kind: 'actor', dirs: 8, ...proc('merc_ascendant', CELL.medium, 2.05, { anims: procAnims('Cast') }) },
  { id: 'merc_barbarian', kind: 'actor', dirs: 8, ...proc('merc_barbarian', CELL.medium, 2.05) },
];

/* ---------------- Monstres ---------------- */

const MONSTER_SHEETS: Record<string, Omit<SheetSpec, 'id' | 'kind' | 'dirs'>> = {
  fallen: proc('fallen', CELL.small, 1.05),
  fallen_shaman: proc('fallen_shaman', CELL.small, 1.15, { anims: procAnims('Cast') }),
  zombie: proc('zombie', CELL.medium, 1.8),
  griswold: proc('griswold', CELL.large, 2.3),
  skeleton_warrior: proc('skeleton_warrior', CELL.medium, 1.85),
  skeleton_archer: proc('skeleton_archer', CELL.medium, 1.85, { anims: procAnims('Cast') }),
  skeleton_mage: proc('skeleton_mage', CELL.medium, 1.85, { anims: procAnims('Cast') }),
  oblivion_knight: proc('oblivion_knight', CELL.medium, 2.25),
  mummy: proc('mummy', CELL.medium, 1.95),
  greater_mummy: proc('greater_mummy', CELL.medium, 2.2),
  scarab: proc('scarab', CELL.large, 1.0),
  duriel: {
    // D2 : insecte-crabe brun-rouge à défenses et pinces — modèle procédural (page/procedural.js)
    model: 'procedural:duriel',
    procedural: 'duriel',
    ...CELL.boss,
    height: 3.4,
    chroma: 0.95,
    grime: 0.12,
    anims: procAnims(),
  },
  // boss de farm PD2 (page/procedural-bosses.js)
  countess: proc('countess', CELL.large, 2.5, { anims: procAnims('Attack') }),
  dark_stalker: proc('countess', CELL.medium, 2.0),
  andariel: { model: 'procedural:andariel', procedural: 'andariel', ...CELL.boss, height: 3.0, chroma: 0.95, grime: 0.1, anims: procAnims() },
  mephisto: { model: 'procedural:mephisto', procedural: 'mephisto', ...CELL.boss, height: 3.4, chroma: 0.95, grime: 0.06, anims: procAnims('Cast') },
  hell_bovine: proc('hell_bovine', CELL.large, 2.9),
  cow_king: proc('cow_king', CELL.boss, 3.6),
  minion_destruction: proc('minion_destruction', CELL.large, 3.2),
  venom_lord: proc('venom_lord', CELL.large, 2.6),
  soul_killer: proc('soul_killer', CELL.small, 1.2),
  blood_lord: {
    // D2 : brute rouge en armure sombre, casque à cornes, deux masses — modèle procédural
    model: 'procedural:blood_lord',
    procedural: 'blood_lord',
    ...CELL.large,
    height: 2.7,
    chroma: 0.95,
    grime: 0.12,
    anims: procAnims(),
  },
  baal: {
    // D2 : spectre argenté à couronne de longues épines — modèle procédural
    model: 'procedural:baal',
    procedural: 'baal',
    ...CELL.boss,
    height: 5.2,
    chroma: 0.9,
    grime: 0.1,
    anims: procAnims(),
  },
  diablo: {
    // D2 : démon rouge vif musclé, grandes cornes, plastron d'os épineux — modèle procédural
    model: 'procedural:diablo',
    procedural: 'diablo',
    ...CELL.boss,
    height: 4.6,
    chroma: 1.0,
    grime: 0.1,
    anims: procAnims(),
  },
  // Hydre de la Sorcière : trois têtes de serpent de feu (D2), procédurale
  hydra: proc('hydra', CELL.small, 1.5, {
    anims: { idle: { clip: 'Idle', frames: 8, loop: true, fps: 10 }, attack: { clip: 'Attack', frames: 8, fps: 16, action: 4 }, death: { clip: 'Death', frames: 8, fps: 11 } },
  }),
};

export function monsterSheets(): SheetSpec[] {
  const needed = new Set(MONSTERS.map((m) => m.sprite));
  needed.add('hydra');
  const out: SheetSpec[] = [];
  for (const id of needed) {
    const spec = MONSTER_SHEETS[id];
    if (!spec) throw new Error(`Aucune planche pour le sprite de monstre « ${id} »`);
    out.push({ id, kind: 'actor', dirs: 8, ...spec });
  }
  return out;
}

/* ---------------- Décor ---------------- */

export function propSheets(): SheetSpec[] {
  return PROPS.map((p) => {
    const big = Math.max(p.w, p.h);
    const hgt = typeof p.fit === 'number' ? p.fit : big;
    const cw = Math.ceil((p.w + p.h) * 32 + 24);
    const topPad = Math.ceil(hgt * 39.2 + 40);
    const ch = Math.ceil(topPad + (p.w + p.h) * 16 + 16);
    return {
      id: `prop_${p.id}`,
      kind: 'prop' as const,
      model: p.model,
      dirs: 1,
      cell: [cw + (cw % 2), ch] as [number, number],
      anchor: [Math.round((cw + (cw % 2)) / 2), Math.round(topPad + ((p.w + p.h) * 16) / 2)] as [number, number],
      footprint: typeof p.fit === 'number' ? undefined : ([p.w, p.h] as [number, number]),
      height: typeof p.fit === 'number' ? p.fit : undefined,
      rot: p.rot,
      static: true,
      centerXZ: true,
      tint: p.tint,
      colorizeAll: p.colorize,
      heightScale: p.heightScale,
      anims: { idle: { clip: '', frames: 1, fps: 1 } },
      group: p.id,
      grime: 0.3,
    };
  });
}

/* ---------------- Sols ---------------- */

export interface TileSpec {
  kind: string;
  texture: string;
  tint?: number;
  repeat?: number;
  chroma?: number;
}

const PH = 'textures/polyhaven/';
export const TILE_SPECS: TileSpec[] = [
  { kind: 'grass', texture: `${PH}forrest_ground_01_diff_1k.jpg`, tint: 0x8a9a70 },
  { kind: 'deadgrass', texture: `${PH}forrest_ground_01_diff_1k.jpg`, tint: 0x9a8a6a, chroma: 0.45 },
  { kind: 'dirt', texture: `${PH}brown_mud_leaves_01_diff_1k.jpg`, tint: 0xa08a70 },
  { kind: 'mud', texture: `${PH}brown_mud_leaves_01_diff_1k.jpg`, tint: 0x6a5a4a },
  { kind: 'cobble', texture: `${PH}cobblestone_floor_04_diff_1k.jpg`, tint: 0x9a9088 },
  { kind: 'flagstone', texture: `${PH}monastery_stone_floor_diff_1k.jpg`, tint: 0xa8a098 },
  { kind: 'sand', texture: `${PH}large_sandstone_blocks_01_diff_1k.jpg`, tint: 0xc0a070 },
  { kind: 'sandstone', texture: `${PH}large_sandstone_blocks_01_diff_1k.jpg`, tint: 0x9a8058 },
  { kind: 'crypt', texture: `${PH}castle_brick_07_diff_1k.jpg`, tint: 0x7a7068 },
  { kind: 'snow', texture: `${PH}snow_02_diff_1k.jpg`, tint: 0xc8d0dc },
  { kind: 'hellstone', texture: `${PH}burned_ground_01_diff_1k.jpg`, tint: 0x9a5a4a },
  { kind: 'lava', texture: `${PH}burned_ground_01_diff_1k.jpg`, tint: 0xd06030, chroma: 0.9 },
];

export const TILE_SIZE = 4;
export const TILE_VARIANTS = 4;

export function allSheets(): SheetSpec[] {
  return [SORCERESS, DRUID, ...HEROES, ...DRUID_FORMS, ...DRUID_PETS, ...NPCS, ...MERC_SHEETS, ...monsterSheets(), ...propSheets()];
}
