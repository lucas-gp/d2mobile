/**
 * Catalogue du décor. L'empreinte au sol (collision) est une donnée de jeu ; la chaîne de
 * pré-rendu met le modèle 3D à l'échelle pour qu'il remplisse cette empreinte (`fit`), ou à
 * une hauteur donnée. Le rendu n'influence jamais la collision.
 * Rotation : les modèles orientés existent en variantes pré-rendues (`rot` en degrés).
 */

export interface PropDef {
  id: string;
  /** Chemin du modèle dans assets-src/ */
  model: string;
  /** Empreinte au sol (unités) : largeur selon x, profondeur selon y (après rotation) */
  w: number;
  h: number;
  /** Forme de collision */
  shape: 'rect' | 'circle' | 'none';
  /** Bloque les projectiles et la ligne de vue */
  opaque: boolean;
  /** Rotation du modèle (degrés, autour de la verticale) */
  rot: number;
  /** Mise à l'échelle : remplir l'empreinte, ou atteindre une hauteur (unités) */
  fit: 'footprint' | number;
  /** Lumière émise (torches, feux) */
  light?: { radius: number; color: number; intensity: number; flicker: number; z: number };
  /** Grand décor qui devient transparent quand le joueur passe derrière */
  occluder?: boolean;
  /** Teinte de matériau appliquée par la chaîne (multiplication) */
  tint?: number;
  /** Recoloration qui conserve la luminance [couleur, force 0..1] (pierre grise → grès) */
  colorize?: [number, number];
  /** Écrasement vertical du modèle pré-rendu (murs bas) ; l'empreinte ne change pas */
  heightScale?: number;
  /** Proportion de l'empreinte réellement bloquante (bords de toits, feuillage) */
  solid?: number;
}

const P = (id: string, model: string, w: number, h: number, extra: Partial<PropDef> = {}): PropDef => ({
  id,
  model,
  w,
  h,
  shape: 'rect',
  opaque: true,
  rot: 0,
  fit: 'footprint',
  ...extra,
});

const VIL = 'environment/quaternius-medieval-village/';
const HEX = 'environment/kaykit-medieval-hexagon/';
const HAL = 'environment/kaykit-halloween-bits/';
const DUN = 'environment/kaykit-dungeon-remastered/';
const SUR = 'environment/quaternius-survival/';
const RPG = 'props/quaternius-ultimate-rpg/';

const FIRE_LIGHT = { radius: 6, color: 0xff9a4a, intensity: 1.1, flicker: 0.25, z: 1.2 };
const TORCH_LIGHT = { radius: 4.5, color: 0xffa860, intensity: 1, flicker: 0.2, z: 2 };
const CRYSTAL_LIGHT = { radius: 4, color: 0xff4a4a, intensity: 0.9, flicker: 0.05, z: 1.5 };

/** Déclinaisons en deux orientations (0° et 90°) avec empreinte permutée */
function both(id: string, model: string, w: number, h: number, extra: Partial<PropDef> = {}): PropDef[] {
  return [P(`${id}_a`, model, w, h, { ...extra, rot: 0 }), P(`${id}_b`, model, h, w, { ...extra, rot: 90 })];
}

export const PROPS: PropDef[] = [
  /* ---------- Village (Tristram) ---------- */
  ...both('house1', `${VIL}House_1.glb`, 6, 5, { occluder: true, solid: 0.85 }),
  ...both('house2', `${VIL}House_2.glb`, 6, 5, { occluder: true, solid: 0.85 }),
  ...both('house3', `${VIL}House_3.glb`, 5, 5, { occluder: true, solid: 0.85 }),
  ...both('house4', `${VIL}House_4.glb`, 6, 6, { occluder: true, solid: 0.85 }),
  ...both('inn', `${VIL}Inn.glb`, 8, 7, { occluder: true, solid: 0.85 }),
  ...both('smithy', `${VIL}Blacksmith.glb`, 7, 6, { occluder: true, solid: 0.85 }),
  ...both('stable', `${VIL}Stable.glb`, 6, 5, { occluder: true, solid: 0.85 }),
  P('bell_tower', `${VIL}Bell_Tower.glb`, 4, 4, { occluder: true }),
  P('well', `${VIL}Well.glb`, 2, 2, { shape: 'circle' }),
  ...both('cart', `${VIL}Cart.glb`, 2.6, 1.6, { opaque: false }),
  ...both('market', `${VIL}MarketStand_1.glb`, 3, 2, { opaque: false }),
  P('hay', `${VIL}Hay.glb`, 1.6, 1.6, { opaque: false }),
  P('cauldron', `${VIL}Cauldron.glb`, 1.2, 1.2, { shape: 'circle', opaque: false }),
  ...both('fence', `${VIL}Fence.glb`, 3, 0.4, { opaque: false }),
  P('bonfire', `${VIL}Bonfire_Lit.glb`, 1.6, 1.6, { shape: 'circle', opaque: false, light: FIRE_LIGHT }),
  ...both('church_ruin', `${HEX}buildings/building_church_red.gltf`, 8, 8, { occluder: true, solid: 0.8, tint: 0x8a8078 }),
  P('ruin', `${HEX}buildings/building_destroyed.gltf`, 5, 5, { solid: 0.7, tint: 0x8a8078 }),
  P('scaffold', `${HEX}buildings/building_scaffolding.gltf`, 4, 4, { opaque: false, solid: 0.6 }),
  P('tree_dead_l', `${HAL}tree_dead_large.gltf`, 2, 2, { shape: 'circle', opaque: false, fit: 6, occluder: true, solid: 0.35 }),
  P('tree_dead_m', `${HAL}tree_dead_medium.gltf`, 1.6, 1.6, { shape: 'circle', opaque: false, fit: 4.5, solid: 0.35 }),
  P('tree_dead_s', `${HAL}tree_dead_small.gltf`, 1.2, 1.2, { shape: 'circle', opaque: false, fit: 3, solid: 0.4 }),
  P('tree_pine', `${HEX}nature/tree_single_A.gltf`, 2.2, 2.2, { shape: 'circle', opaque: false, fit: 5.5, occluder: true, solid: 0.35, tint: 0x6a7a5a }),
  P('trees_small', `${HEX}nature/trees_A_small.gltf`, 3, 3, { shape: 'circle', opaque: true, fit: 'footprint', solid: 0.7, tint: 0x5a6a4a }),
  P('rock_a', `${HEX}nature/rock_single_A.gltf`, 1.6, 1.4, { shape: 'circle', opaque: false }),
  P('rock_b', `${HEX}nature/rock_single_C.gltf`, 2.2, 1.8, { shape: 'circle', opaque: false }),
  P('rock_c', `${HEX}nature/rock_single_E.gltf`, 1.2, 1.2, { shape: 'circle', opaque: false }),
  P('grave_a', `${HAL}grave_A.gltf`, 1, 2, { opaque: false }),
  P('grave_b', `${HAL}grave_B.gltf`, 1, 2, { opaque: false }),
  P('gravestone', `${HAL}gravestone.gltf`, 0.8, 0.5, { opaque: false }),
  P('crypt', `${HAL}crypt.gltf`, 4, 4, { occluder: true }),
  P('post_skull', `${HAL}post_skull.gltf`, 0.4, 0.4, { shape: 'circle', opaque: false, fit: 2 }),
  P('lantern', `${HAL}lantern_standing.gltf`, 0.6, 0.6, { shape: 'circle', opaque: false, fit: 2, light: TORCH_LIGHT }),
  P('bones', `${HAL}ribcage.gltf`, 1, 1, { shape: 'none', opaque: false }),
  P('skull', `${HAL}skull.gltf`, 0.4, 0.4, { shape: 'none', opaque: false }),
  /* ---------- Donjon (Tombeaux, Trône) ---------- */
  ...both('wall', `${DUN}wall.glb`, 4, 1, { fit: 'footprint', occluder: true }),
  ...both('wall_broken', `${DUN}wall_broken.glb`, 4, 1, { fit: 'footprint', occluder: true }),
  ...both('wall_arched', `${DUN}wall_arched.glb`, 4, 1, { fit: 'footprint', occluder: true }),
  ...both('wall_door', `${DUN}wall_doorway.glb`, 4, 1, { fit: 'footprint', occluder: true, shape: 'none' }),
  P('pillar', `${DUN}pillar.glb`, 1, 1, { fit: 'footprint' }),
  P('pillar_deco', `${DUN}pillar_decorated.glb`, 1.2, 1.2, { fit: 'footprint' }),
  P('column', `${DUN}column.glb`, 1, 1, { fit: 'footprint' }),
  P('torch', `${DUN}torch_lit.glb`, 0.5, 0.5, { shape: 'circle', opaque: false, fit: 2.2, light: TORCH_LIGHT }),
  P('torch_wall', `${DUN}torch_mounted.glb`, 0.5, 0.5, { shape: 'none', opaque: false, fit: 1.2, light: TORCH_LIGHT }),
  P('barrel', `${DUN}barrel_large.glb`, 1, 1, { shape: 'circle', opaque: false }),
  P('crates', `${DUN}crates_stacked.glb`, 1.6, 1.6, { opaque: false }),
  P('rubble', `${DUN}rubble_large.glb`, 2, 2, { opaque: false }),
  P('coffin', `${HAL}coffin_decorated.gltf`, 1.2, 2.4, { opaque: false }),
  P('coffin_b', `${HAL}coffin_decorated.gltf`, 2.4, 1.2, { opaque: false, rot: 90 }),
  P('banner_red', `${DUN}banner_patternA_red.glb`, 0.8, 0.3, { shape: 'none', opaque: false, fit: 2.6 }),
  P('candles', `${DUN}candle_triple.glb`, 0.4, 0.4, { shape: 'none', opaque: false, fit: 0.8, light: { radius: 2.5, color: 0xffc070, intensity: 0.7, flicker: 0.2, z: 0.8 } }),
  P('shrine_candles', `${HAL}shrine_candles.gltf`, 1.2, 1, { opaque: false, light: { radius: 3, color: 0xffc070, intensity: 0.8, flicker: 0.2, z: 1 } }),
  P('crystal_red', `${RPG}Crystal3.glb`, 1.2, 1.2, { shape: 'circle', opaque: false, fit: 3, light: CRYSTAL_LIGHT, tint: 0xff5050 }),
  P('crystal_big', `${RPG}Crystal1.glb`, 2, 2, { shape: 'circle', opaque: true, fit: 5, light: CRYSTAL_LIGHT, tint: 0xff4040 }),
  P('chest_prop', `${DUN}chest_gold.glb`, 1.2, 0.8, { opaque: false }),
  P('spikes', `${DUN}floor_tile_big_spikes.glb`, 2, 2, { shape: 'none', opaque: false }),
  /* ---------- Tombeaux de Tal Rasha (grès) ---------- */
  ...both('tombwall', `${DUN}wall.glb`, 4, 1, { fit: 'footprint', occluder: true, colorize: [0xc89a64, 0.75] }),
  ...both('tombwall_cracked', `${DUN}wall_cracked.glb`, 4, 1, { fit: 'footprint', occluder: true, colorize: [0xc89a64, 0.75] }),
  // murs intérieurs bas (comme D2) : la salle reste lisible derrière un mur de premier plan
  ...both('tombwall_half', `${DUN}wall.glb`, 4, 1, { fit: 'footprint', occluder: true, colorize: [0xc89a64, 0.75], heightScale: 0.42 }),
  P('tomb_pillar', `${DUN}pillar_decorated.glb`, 1.2, 1.2, { fit: 'footprint', colorize: [0xd0a070, 0.7] }),
  P('tomb_column', `${DUN}column.glb`, 1, 1, { fit: 'footprint', colorize: [0xd0a070, 0.7] }),
  P('tomb_rubble', `${DUN}rubble_half.glb`, 1.6, 1.6, { opaque: false, colorize: [0xc09060, 0.7] }),
  P('tomb_urn', `${DUN}keg_decorated.glb`, 0.8, 0.8, { shape: 'circle', opaque: false, tint: 0xb08858 }),
  P('tomb_banner', `${DUN}banner_patternC_white.glb`, 0.8, 0.3, { shape: 'none', opaque: false, fit: 2.6, tint: 0xd8c090 }),
  /* ---------- Trône de Baal ---------- */
  ...both('gate', `${DUN}wall_gated.glb`, 4, 1, { fit: 'footprint', occluder: true, shape: 'none', tint: 0x9a8a8a }),
  ...both('throne_wall', `${DUN}wall.glb`, 4, 1, { fit: 'footprint', occluder: true, tint: 0x8a7a7a }),
  ...both('throne_wall_arch', `${DUN}wall_arched.glb`, 4, 1, { fit: 'footprint', occluder: true, tint: 0x8a7a7a }),
  ...both('throne_wall_half', `${DUN}wall.glb`, 4, 1, { fit: 'footprint', occluder: true, tint: 0x8a7a7a, heightScale: 0.42 }),
  ...both('wall_half', `${DUN}wall.glb`, 4, 1, { fit: 'footprint', occluder: true, heightScale: 0.42 }),
  P('throne_pillar', `${DUN}pillar_decorated.glb`, 1.4, 1.4, { fit: 'footprint', tint: 0x9a8080 }),
  P('brazier', `${SUR}Bonfire_Fire.glb`, 1, 1, { shape: 'circle', opaque: false, light: { radius: 5, color: 0xff7040, intensity: 1, flicker: 0.25, z: 1.2 } }),
  /* ---------- Harrogath ---------- */
  ...both('stonewall', `${HEX}buildings/wall_straight.gltf`, 4, 1.2, { occluder: true, tint: 0xb8c0cc }),
  ...both('stonehouse', `${VIL}House_3.glb`, 6, 6, { occluder: true, solid: 0.85, tint: 0xb0b8c4 }),
  P('tower', `${HEX}buildings/building_tower_A_red.gltf`, 4, 4, { occluder: true, tint: 0xa0a8b4 }),
  P('tent', `${SUR}Tent.glb`, 3, 3, { opaque: false, solid: 0.8 }),
  P('campfire', `${SUR}Bonfire_Fire.glb`, 1.4, 1.4, { shape: 'circle', opaque: false, light: FIRE_LIGHT }),
  P('torch_post', `${SUR}WoodenTorch_Fire.glb`, 0.5, 0.5, { shape: 'circle', opaque: false, fit: 2.2, light: TORCH_LIGHT }),
  P('weaponrack_prop', `${HEX}props/weaponrack.gltf`, 1.6, 0.8, { opaque: false }),
  P('flag', `${HEX}props/flag_red.gltf`, 0.5, 0.5, { shape: 'circle', opaque: false, fit: 3.5 }),
];

export const PROP_BY_ID: Record<string, PropDef> = Object.fromEntries(PROPS.map((p) => [p.id, p]));

/** Rectangle de collision [x0, y0, x1, y1] d'un décor placé en (x, y) */
export function propRect(p: PropDef, x: number, y: number, scale = 1): [number, number, number, number] {
  const s = (p.solid ?? 1) * scale;
  const hw = (p.w * s) / 2;
  const hh = (p.h * s) / 2;
  return [x - hw, y - hh, x + hw, y + hh];
}
