/**
 * Partie commune du rendu : constantes de couleur et de lumière, types des vues, qualité,
 * fonctions pures de choix de feuilles de sprites. Sans état d'instance.
 */
import { MONSTER_BY_ID } from '../data/monsters';
import { classOf } from '../data/classes';
import { BitmapText, Graphics, Sprite, type Text } from 'pixi.js';
import type { World } from '../sim/world';
import { mercAuras } from '../sim/merc';
import type { Monster } from '../sim/actors';
import { clamp } from '../core/math';
import { SpriteBank, type Sheet, type SheetAnim, type Tier } from './assets';
import { armorTier } from './armor-tier';
import { BOOT_LOOK, GLOVE_LOOK, HEAD_LOOK, SHIELD_LOOK } from './gear-look';
import { bodyVariantFor, weaponPartId } from './weapon-look';
import { BUFF_FX } from './fx';
import { K } from './iso';
import { BASE_BY_ID } from '../data/items/bases';
import { RUNE_BY_ID } from '../data/items/runes';

/** px par unité de monde le long d'un axe (pas horizontal d'une unité) */
export const C_STEP = K / Math.SQRT2;

export interface RenderQuality {
  tier: Tier;
  /** multiplicateur du nombre de particules */
  particles: number;
  /** lumières dynamiques (sorts, torches) */
  dynamicLights: boolean;
  /** résolution interne (facteur de l'écran CSS) */
  resolution: number;
}

export const QUALITY_PRESETS: Record<'low' | 'medium' | 'high', RenderQuality> = {
  low: { tier: 'lo', particles: 0.35, dynamicLights: false, resolution: 1 },
  medium: { tier: 'hi', particles: 0.7, dynamicLights: true, resolution: 1 },
  high: { tier: 'hi', particles: 1, dynamicLights: true, resolution: 2 },
};

export const ELEM_COLOR: Record<string, number> = { fire: 0xff7a2a, cold: 0x7ab8ff, light: 0xb8c8ff, poison: 0x6ad04a, magic: 0xd08aff, phys: 0xe8e0d0 };
export const AURA_COLOR: Record<string, number> = {
  might: 0xff9a40,
  holy_fire: 0xff4a20,
  thorns: 0x70c040,
  blessed_aim: 0xffe060,
  concentration: 0xffd040,
  holy_freeze: 0x80c8ff,
  holy_shock: 0x9080ff,
  sanctuary: 0xfff0c0,
  fanaticism: 0xff6030,
  conviction: 0xd08a40,
  prayer: 0xa0ff90,
  resist_fire: 0xff7040,
  resist_cold: 0x70b8ff,
  resist_lightning: 0xf0e060,
  defiance: 0xd0d8e0,
  cleansing: 0x70e070,
  vigor: 0xa0f0ff,
  meditation: 0x6090ff,
  redemption: 0xff90c0,
  salvation: 0xffffff,
};
/** Auras qui agissent sur les ennemis autour du porteur (halo sur les monstres touchés) */
export const OFFENSIVE_AURA = new Set(['conviction', 'holy_fire', 'holy_freeze', 'holy_shock', 'sanctuary']);
/** Effet D2 de l'aura d'un porteur (joueur ou mercenaire) */
export function auraFxId(aura: string): string | null {
  return (BUFF_FX[`aura_${aura}`] ?? BUFF_FX[aura])?.id ?? null;
}
export const CHARGE_COLOR: Record<string, number> = {
  tiger_strike: 0xffd040,
  fists_of_fire: 0xff7a2a,
  cobra_strike: 0x70e050,
  claws_of_thunder: 0xf0f070,
  blades_of_ice: 0x80d0ff,
  phoenix_strike: 0xff60c0,
};
export const DMG_COLOR: Record<string, number> = { fire: 0xff9a50, cold: 0x9ac8ff, light: 0xfff080, poison: 0x80e060, magic: 0xe0a0ff, phys: 0xf0e8d8 };
const RARITY_COLOR: Record<string, number> = {
  normal: 0xe8e8e8,
  superior: 0xe8e8e8,
  low: 0x696969,
  magic: 0x6969ff,
  rare: 0xffff64,
  set: 0x00ff00,
  unique: 0xc7b377,
  crafted: 0xffa800,
  runeword: 0xc7b377,
};

export interface ActorView {
  body: Sprite;
  shadow: Sprite;
  sheet: Sheet | null;
  /** Planche demandée (le Druide change de planche en changeant de forme) */
  sheetId?: string;
  aura?: Sprite;
  /** Lot 305 (rule `render.eliteMarks`): the ring under a champion, a unique or a boss, and the name over a unique's or boss's head */
  mark?: Sprite;
  label?: Text;
  lastAnim: string;
  /** Dernier nom d'image affiché (« anim/direction/image ») : les pièces d'équipement superposées le reprennent */
  lastName?: string;
  /** Pièces d'équipement superposées au corps (casque, bouclier) : identifiant de planche → sprite */
  parts?: Map<string, Sprite>;
  /** Lianes et esprits du Druide : dessinés en effets (pas de planche) */
  fx?: Graphics;
}

export interface Particle {
  s: Sprite;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  scale0: number;
  scale1: number;
  alpha0: number;
  gravity: number;
  rot: number;
  vr: number;
  ground?: boolean;
}

export interface Floater {
  t: BitmapText;
  x: number;
  y: number;
  z: number;
  life: number;
  /** Cible et cumul : les coups rapprochés sur une même cible fusionnent (zones, poisons) */
  target?: number;
  sum?: number;
}

/** Éclair de Sorcière : quelques tracés brisés (variantes) qui scintillent, un par saut de la chaîne */
export interface Bolt {
  g: Graphics[];
  /** délai avant l'apparition (s), puis durée restante */
  delay: number;
  life: number;
  max: number;
  /** point d'impact (monde) : lumière à l'apparition */
  hx: number;
  hy: number;
  lit: boolean;
}

export interface Beam {
  sprites: Sprite[];
  life: number;
  max: number;
}

export interface Ring {
  s: Sprite;
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
}

/** Lumière des décors posés qui brûlent : jeton → rayon (unités) et couleur des flammes */
export const DECOR_LIGHT: Record<string, { r: number; c: number; i?: number }> = {
  fx: { r: 3.5, c: 0xffb060 },
  fy: { r: 4.5, c: 0xffb060 },
  fz: { r: 5.5, c: 0xffa850 },
  '3m': { r: 5, c: 0xffb468 },
  '3n': { r: 5, c: 0xffb468 },
  '2x': { r: 5, c: 0xffb468 },
  '2p': { r: 5, c: 0xffb468 },
  '6e': { r: 5, c: 0xffb468 },
  '2w': { r: 5.5, c: 0xffa858 },
  '2z': { r: 4.5, c: 0xffc880 },
  qe: { r: 4.5, c: 0xffb060 },
  qd: { r: 4.5, c: 0xffb060 },
  to: { r: 4.5, c: 0xffb468 },
  br: { r: 4.5, c: 0xffb468 },
  fb: { r: 4.5, c: 0xffb468 },
  b3: { r: 4.5, c: 0xffb468 },
  bm: { r: 4.5, c: 0xffb468 },
  bi: { r: 4.5, c: 0xffb468 },
  he: { r: 5, c: 0xff8050 },
  a1: { r: 2.5, c: 0xffd890, i: 0.5 },
  a2: { r: 2.5, c: 0xffd890, i: 0.5 },
  e1: { r: 5, c: 0xff7048 },
  e2: { r: 5, c: 0xff7048 },
  e3: { r: 4.5, c: 0xff6440 },
  e4: { r: 4.5, c: 0xff6440 },
  e5: { r: 4.5, c: 0xff6440 },
  e8: { r: 4.5, c: 0xff6440 },
};

/** Marge de marche (unités) ajoutée à la portée d'écran pour les monstres chargés avant le départ */
export const CORE_MARGIN = 30;

export const SKILL_CAST_COLOR: Record<string, number> = {
  // Druide
  firestorm: 0xff7a2a,
  molten_boulder: 0xff7a2a,
  eruption: 0xff7a2a,
  volcano: 0xff5a1a,
  armageddon: 0xff5a1a,
  arctic_blast: 0x9ac8ff,
  hurricane: 0xc8e0ff,
  cyclone_armor: 0xd0d8e0,
  twister: 0xc8c0b0,
  tornado: 0xc8c0b0,
  werewolf: 0xc8a070,
  werebear: 0xc8a070,
  raven: 0x9ad060,
  plague_poppy: 0x9ad060,
  cycle_of_life: 0x9ad060,
  vines: 0x9ad060,
  spirit_wolf: 0x9ad060,
  summon_fenris: 0x9ad060,
  grizzly: 0x9ad060,
  oak_sage: 0x9ad060,
  heart_wolverine: 0x9ad060,
  spirit_barbs: 0x9ad060,
  fire_bolt: 0xff7a2a,
  fire_ball: 0xff7a2a,
  meteor: 0xff5a20,
  ice_bolt: 0x8ac0ff,
  frozen_orb: 0x8ac0ff,
  blizzard: 0x8ac0ff,
  charged_bolt: 0xc0d0ff,
  lightning: 0xc0d0ff,
  chain_lightning: 0xc0d0ff,
  teleport: 0x9ab8ff,
};

/** Réglages de luminosité (retour téléphone : la zone éclairée autour du personnage était trop petite) */
export const LIGHTING: Record<'clair' | 'penombre' | 'd2', { ambient: number; radius: number }> = {
  clair: { ambient: 0.72, radius: 1.8 },
  penombre: { ambient: 0.4, radius: 1.4 },
  d2: { ambient: 0, radius: 1 },
};

export function mixColor(a: number, b: number, t: number): number {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function scaleColor(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k * 2.2));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k * 2.2));
  const b = Math.min(255, Math.round((c & 255) * k * 2.2));
  return (r << 16) | (g << 8) | b;
}

export function itemColor(item: { base: string; quality: string }): number {
  const b = BASE_BY_ID[item.base];
  if (b?.type === 'rune') {
    const r = RUNE_BY_ID[b.id];
    return r && r.rank >= 20 ? 0xff9020 : 0xffa860;
  }
  if (b?.type === 'currency') return b.id === 'gold' ? 0xe8c060 : 0xff8040;
  if (b?.type === 'gem') return 0xd080ff;
  if (b?.type === 'potion') return b.id === 'hp_potion' ? 0xd03030 : b.id === 'mp_potion' ? 0x3050e0 : 0xa040c0;
  if (b?.type === 'map') return 0xffd060;
  return RARITY_COLOR[item.quality] ?? 0xffffff;
}

export interface MissileLook {
  color: number;
  size: number;
  shard?: boolean;
  trail: number;
  trailLife: number;
  /** Tourbillon de poussière (Trombe, Tornade) : intensité */
  swirl?: number;
}

export function missileLook(kind: string, elem: string): MissileLook {
  switch (kind) {
    case 'fire_bolt':
    case 'hydra_bolt':
    case 'firebolt_m':
      return { color: 0xff8a3a, size: 22, trail: 0.9, trailLife: 0.25 };
    case 'fireball':
      return { color: 0xff7020, size: 36, trail: 1, trailLife: 0.35 };
    case 'throw_potion':
      return elem === 'poison' ? { color: 0x70e050, size: 26, trail: 0.6, trailLife: 0.3 } : { color: 0xff8a3a, size: 26, trail: 0.8, trailLife: 0.3 };
    case 'ice_bolt':
    case 'coldbolt_m':
    case 'ice_lance':
      return { color: 0x9ac8ff, size: 26, shard: true, trail: 0.6, trailLife: 0.2 };
    case 'ice_blast':
    case 'glacial_spike':
      return { color: 0xb0d8ff, size: 34, shard: true, trail: 0.8, trailLife: 0.3 };
    case 'frozen_orb':
      return { color: 0x9ad0ff, size: 48, trail: 1, trailLife: 0.4 };
    case 'orb_shard':
      return { color: 0xb8e0ff, size: 18, shard: true, trail: 0.1, trailLife: 0.15 };
    case 'charged_bolt':
    case 'lightning_m':
      return { color: 0xd0e0ff, size: 18, trail: 0.7, trailLife: 0.12 };
    case 'arrow':
    case 'bone':
      return { color: 0xd8d0c0, size: 20, shard: true, trail: 0, trailLife: 0 };
    // flèches de l'Éclaireuse
    case 'fire_arrow':
      return { color: 0xff7a30, size: 22, shard: true, trail: 0.6, trailLife: 0.25 };
    case 'cold_arrow':
      return { color: 0x9ad0ff, size: 22, shard: true, trail: 0.6, trailLife: 0.25 };
    case 'spit':
      return { color: 0x70e050, size: 22, trail: 0.5, trailLife: 0.3 };
    case 'baal_wave':
      return { color: 0xa070ff, size: 40, trail: 1, trailLife: 0.4 };
    // Druide
    case 'firestorm':
      return { color: 0xff6a1a, size: 30, trail: 1, trailLife: 0.55 };
    case 'boulder':
      return { color: 0xc8581a, size: 46, trail: 1, trailLife: 0.7 };
    case 'twister':
      return { color: 0xc8bca8, size: 24, trail: 1, trailLife: 0.3, swirl: 1 };
    case 'tornado':
      return { color: 0xb8b0a0, size: 34, trail: 1, trailLife: 0.45, swirl: 3 };
    default:
      return { color: ELEM_COLOR[elem] ?? 0xffffff, size: 22, trail: 0.4, trailLife: 0.2 };
  }
}

/* Correspondances simulation → planches (lecture seule des données) */

/**
 * Planche du joueur : la classe, ou la forme animale du Druide. Avec l'import D2, l'armure portée (palier léger, moyen ou lourd) choisit la variante
 * `<classe>_med` / `<classe>_hvy` ; tant que celle-ci n'est pas chargée, la planche de base reste affichée.
 */
export function playerSheet(w: World, bank?: SpriteBank): string {
  if (w.character.classId === 'druid' && w.player.d.form) return w.player.d.form;
  const base = classOf(w.character.classId).sprite;
  const variant = wantedBody(w, bank);
  if (variant && bank?.get(variant)) return variant;
  const t = armorTier(w.character.equipment.body?.base);
  if (t !== 'lit' && bank?.has(`${base}_${t}`) && bank.get(`${base}_${t}`)) return `${base}_${t}`;
  return base;
}

/** Corps par classe d'arme voulu (arme à deux mains, lance, bâton…), ou null : le corps de la classe (palier d'armure) reste */
function wantedBody(w: World, bank: SpriteBank | undefined): string | null {
  const mh = w.character.equipment.mainhand;
  if (!bank || !mh || w.player.d.form) return null;
  return bodyVariantFor(w.character.classId, classOf(w.character.classId).sprite, mh.base, (id) => bank.has(id));
}

/** Planche de corps actuelle (variante d'arme si elle est chargée, sinon palier d'armure) : préfixe des pièces portées */
function bodyPrefix(w: World, bank: SpriteBank | undefined): string {
  const variant = wantedBody(w, bank);
  return variant && bank?.get(variant) ? variant : classOf(w.character.classId).sprite;
}

/** Planches des pièces d'équipement portées (casque, bouclier, arme) que l'import fournit pour le corps du joueur */
export function partSheetIds(w: World, bank: SpriteBank | undefined): string[] {
  if (!bank) return [];
  // corps d'armure moyenne ou lourde : les pièces (casque, bouclier, arme) sont celles du corps de base, seul le torse change
  const body = bodyPrefix(w, bank);
  const cls = classOf(w.character.classId).sprite;
  const base = body === `${cls}_med` || body === `${cls}_hvy` ? cls : body;
  const out: string[] = [];
  const head = w.character.equipment.head;
  const hc = head && HEAD_LOOK[head.base];
  if (hc && bank.has(`${base}_hd_${hc}`)) out.push(`${base}_hd_${hc}`);
  const isVariant = base !== classOf(w.character.classId).sprite;
  const off = w.character.equipment.offhand;
  const sc = (!isVariant || /_w1h[st]$/.test(base)) && off && SHIELD_LOOK[off.base];
  if (sc && bank.has(`${base}_sh_${sc}`)) out.push(`${base}_sh_${sc}`);
  // bottes (jambes) et gants (bras) : calques superposés au corps, au palier de l'objet porté
  {
    const bt = w.character.equipment.boots && BOOT_LOOK[w.character.equipment.boots.base];
    if (bt && bank.has(`${base}_lg_${bt}`)) out.push(`${base}_lg_${bt}`);
    const gl = w.character.equipment.gloves && GLOVE_LOOK[w.character.equipment.gloves.base];
    if (gl) for (const l of ['ra', 'la']) if (bank.has(`${base}_${l}_${gl}`)) out.push(`${base}_${l}_${gl}`);
  }
  const mh = w.character.equipment.mainhand;
  const wp = mh && !w.player.d.form ? weaponPartId(w.character.classId, base, mh.base, (id) => bank.has(id)) : null;
  if (wp && bank.has(wp)) out.push(wp);
  return out;
}

/** Variante d'armure voulue pour la classe (planche à charger), ou null */
function wantedTier(w: World, bank: SpriteBank | undefined): string | null {
  const body = wantedBody(w, bank);
  if (body) return body;
  const base = classOf(w.character.classId).sprite;
  const t = armorTier(w.character.equipment.body?.base);
  return t !== 'lit' && bank?.has(`${base}_${t}`) ? `${base}_${t}` : null;
}

/** Planches D2 des auras du mercenaire (les deux premières, comme celles dessinées sous lui) */
function mercAuraSheets(w: World, bank?: SpriteBank): string[] {
  const out: string[] = [];
  for (const a of mercAuras(w).slice(0, 2)) {
    const id = auraFxId(a.id);
    if (id && bank?.has(`fx_${id}`)) out.push(`fx_${id}`);
  }
  return out;
}

/** Planches de la classe (formes et créatures seulement si la compétence est apprise) */
export function classSheets(w: World, bank?: SpriteBank): string[] {
  // mercenaire recruté : sa planche suit le personnage
  const merc = w.character.merc ? [`merc_${w.character.merc.type}`, ...mercAuraSheets(w, bank)] : [];
  const L = w.player.d.skillLevels;
  if (w.character.classId !== 'druid') {
    const out = [classOf(w.character.classId).sprite, ...merc, ...partSheetIds(w, bank)];
    const tier = wantedTier(w, bank);
    if (tier) {
      out.push(tier);
      // variante chargée : la planche de base (même poids) est libérée
      if (bank?.get(tier)) out.shift();
    }
    // créatures invoquées apprises : planches chargées avec la classe
    if (L.raise_skeleton > 0 || L.revive > 0 || L.raise_skeleton_archer > 0) out.push('skeleton_warrior');
    if (L.skeletal_mage > 0) out.push('skeleton_mage');
    for (const g of ['clay_golem', 'blood_golem', 'iron_golem', 'fire_golem', 'valkyrie']) if (L[g] > 0) out.push(g);
    if (L.bone_wall > 0 || L.bone_prison > 0) out.push('bone_wall');
    return out;
  }
  const out = ['druid', ...merc, ...partSheetIds(w, bank)];
  const dtier = wantedTier(w, bank);
  if (dtier) {
    out.push(dtier);
    if (bank?.get(dtier)) out.shift();
  }
  if (L.werewolf > 0 || w.player.d.form === 'werewolf') out.push('werewolf');
  if (L.werebear > 0 || L.grizzly > 0 || w.player.d.form === 'werebear') out.push('werebear');
  if (L.spirit_wolf > 0 || L.summon_fenris > 0) out.push('wolf');
  if (L.raven > 0) out.push('raven');
  return out;
}

/** Lianes et esprits : dessinés (Graphics), sans planche */
export const PROCEDURAL_PETS = new Set(['vine', 'spirit']);

/**
 * Cadence de marche : les planches importées donnent la foulée (px par image), la cadence suit alors la vitesse
 * réelle de l'unité (pas de pieds qui glissent), bornée autour de la cadence d'origine ; sinon cadence fournie.
 */
export function walkFps(a: SheetAnim | undefined, speed: number, fallback: number): number {
  if (!a?.stride) return fallback;
  return clamp((speed * K) / a.stride, a.fps * 0.6, a.fps * 1.5);
}

export function actorSheet(m: Monster, bank: SpriteBank): string {
  if (m.pet) return m.def.sprite;
  return m.isSummon ? 'hydra' : bank.sheetOf(m.def.id, m.def.sprite);
}

export function monsterSprite(id: string, bank: SpriteBank): string | null {
  const def = MONSTER_BY_ID[id];
  return def ? bank.sheetOf(def.id, def.sprite) : null;
}

export function monsterAttacksSummon(id: string, bank: SpriteBank): string[] {
  const def = MONSTER_BY_ID[id];
  if (!def) return [];
  return def.attacks
    .filter((a) => a.kind === 'summon' && a.summon)
    .map((a) => monsterSprite(a.summon!, bank) ?? '')
    .filter(Boolean);
}

/** Run par étapes (vagues de Baal, sceaux du Chaos) : planches chargées au fil de la run */
export function stagedRun(w: World): boolean {
  return (w.run?.totalWaves ?? 0) > 0 || w.zone.spawns.some((s) => s.seal);
}

/**
 * Planches d'un objet pour le rendu : en mode local sans repli, seule la planche de Diablo II est retenue quand elle existe (le décor 3D
 * du jeu, en repli, n'est jamais dessiné à sa place pendant qu'elle se prépare) ; sinon (pas d'équivalent D2) la liste d'origine.
 */
export function objectSheetsFor(bank: SpriteBank, kind: string, ref?: string, variant?: string): string[] {
  const all = objectSheets(kind, ref, variant);
  if (!bank.strict) return all;
  const d2 = all.filter((id) => bank.isImported(id));
  return d2.length ? d2 : all;
}

/** Planches d'un objet interactif : celle de Diablo II (`obj_…`) d'abord, puis le décor 3D du jeu en repli */
export function objectSheets(kind: string, ref?: string, variant?: string): string[] {
  switch (kind) {
    case 'npc':
      return [`npc_${ref === 'cain2' || ref === 'cain1' || ref === 'cain3' || ref === 'cain5' ? 'cain' : ref}`];
    case 'chest':
      return ['obj_chest', 'prop_chest_prop'];
    case 'barrel':
      // urnes et jarres, dépouilles (cadavres, caisses, cachettes) : leur décor, le tonneau en repli
      return variant === 'urn' ? ['prop_tomb_urn', 'obj_barrel'] : variant === 'corpse' ? ['prop_bones', 'obj_barrel'] : ['obj_barrel', 'prop_barrel'];
    case 'weaponrack':
      return ['prop_weaponrack_prop'];
    case 'well':
      return ['obj_well', 'prop_tomb_urn'];
    case 'quest':
      // coffres dorés des quêtes, autels et objets (Malus, Grimoire, orifice, Forge…)
      return ref?.startsWith('qchest') ? ['obj_chest', 'prop_chest_prop'] : ['obj_shrine', 'prop_shrine_candles'];
    case 'sarcophagus':
      return ['obj_sarcophagus', 'prop_coffin'];
    case 'stash':
      return ['obj_chest', 'prop_chest_prop'];
    case 'cube':
      return ['prop_crates'];
    case 'shrine':
      return ['obj_shrine', 'prop_shrine_candles'];
    case 'waypoint':
      // lot 314: Diablo II's sprite of the DS1's waypoint (src/data/d2waypoints.ts), the game's pillar only off the D2 maps
      return variant?.startsWith('obj_wp_') ? [variant] : ['prop_pillar_deco'];
    case 'gate':
      return ['prop_gate_a'];
    case 'seal':
      return ['prop_shrine_candles'];
    case 'portal':
      // accès à la Chambre de la Pierre-Monde : portail rouge ; au repaire de Duriel : dalle de rocaille
      return variant === 'red' ? ['obj_portal_red', 'obj_portal'] : variant === 'lair' ? ['obj_lair_door'] : ['obj_portal'];
    default:
      return [];
  }
}
