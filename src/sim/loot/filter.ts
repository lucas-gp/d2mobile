/**
 * Filtre de butin (indispensable sur mobile). Décide pour chaque objet au sol :
 * - son niveau d'affichage (0 = masqué, 1 = étiquette simple, 2 = mis en valeur,
 *   3 = objet de valeur avec faisceau et son, 4 = exceptionnel : rune haute, unique élite…) ;
 * - s'il est ramassé automatiquement.
 */
import { modSetting, type ModSettingsMap } from '../../mods/settings';
import { BASE_BY_ID } from '../../data/items/bases';
import '../../data/items/index';
import { RUNE_BY_ID } from '../../data/items/runes';
import { classCanUse } from '../../data/classes';
import { requiredLevel } from '../itemstats';
import { beltCapacity, type CharacterState } from '../character';
import type { Item } from '../item';
import { applyHighlightForce } from './highlight';
import { catalogBaseSockets, catalogMaxTier, valueTier } from './value';
import { RULES } from '../../mods/rules';
import { matchTierOverride } from './tiers';
import { HIGH_RUNE_RANK, EXCEPTIONAL_RUNE_RANK, SHOW_EXCEPTIONAL, SHOW_GOOD, SHOW_HIDDEN, SHOW_HIGH_RUNE, SHOW_NORMAL, SHOW_VALUABLE } from './show';

export { SHOW_EXCEPTIONAL, SHOW_GOOD, SHOW_HIDDEN, SHOW_HIGH_RUNE, SHOW_NORMAL, SHOW_VALUABLE };

import { mapMeetsPickup, mapStashFull, type AutoPickupMaps } from '../mapstash-core';

/**
 * Palier intrinsèque d'un objet (indépendant du filtre du joueur) : règle unique de rareté d'affichage.
 * 0 = aucun (le filtre décide), 3 = de valeur (faisceau + son), 4 = exceptionnel (annonce, faisceau haut),
 * 5 = haute rune. Sert au rendu, à l'audio, aux annonces et à l'étiquette : une seule source de vérité.
 * - runes : rang >= 26 -> 5 ; >= 22 -> 4 ; >= 20 -> 3
 * - monnaies : valeur >= 20000 ou éclat de Pierre-Monde -> 4 ; autres (hors or/clé) -> 3
 * - cartes : unique -> 4 ; autres -> 3
 * - équipement, bijoux, charmes, bases : catalogue de valeur et règles de sim/loot/value.ts (objets recherchés seulement)
 */
export function lootTier(item: Item): number {
  const b = BASE_BY_ID[item.base];
  if (!b) return 0;
  switch (b.type) {
    case 'rune': {
      const r = RUNE_BY_ID[b.id];
      if (!r) return 0;
      return r.rank >= HIGH_RUNE_RANK ? SHOW_HIGH_RUNE : r.rank >= EXCEPTIONAL_RUNE_RANK ? SHOW_EXCEPTIONAL : r.rank >= 20 ? SHOW_VALUABLE : 0;
    }
    case 'currency':
      if (b.id === 'gold' || b.id === 'key') return 0;
      return currencyTier(b.id, b.price);
    case 'map':
      return item.quality === 'unique' ? SHOW_EXCEPTIONAL : SHOW_VALUABLE;
  }
  return valueTier(item);
}

/** Palier d'une monnaie : celui du catalogue (règle `loot.value` ; mod pd2 : éclat de Pierre-Monde), sinon exceptionnelle à partir de 20 000 d'or */
function currencyTier(id: string, price = 0): number {
  return (RULES['loot.value']('currency', id) as number | undefined) ?? (price >= 20000 ? SHOW_EXCEPTIONAL : SHOW_VALUABLE);
}

/** Palier d'affichage effectif : l'override du joueur (filtre.tierOverride) d'abord, sinon `lootTier`. Sans override : identique à `lootTier` */
export function lootTierFor(c: CharacterState, item: Item): number {
  return matchTierOverride(c.filter, item) ?? lootTier(item);
}

/** Palier par défaut (hors override) d'une entrée du catalogue (`unique:`, `set:`, `runeword:`, `base:`) : 0, 3, 4 ou 5 */
export function defaultTierOf(id: string): number {
  const i = id.indexOf(':');
  const kind = id.slice(0, i);
  const key = id.slice(i + 1);
  if (kind === 'unique' || kind === 'set' || kind === 'runeword') return catalogMaxTier(kind, key);
  const b = BASE_BY_ID[key];
  if (!b) return 0;
  switch (b.type) {
    case 'rune': {
      const r = RUNE_BY_ID[b.id];
      return r ? (r.rank >= HIGH_RUNE_RANK ? SHOW_HIGH_RUNE : r.rank >= EXCEPTIONAL_RUNE_RANK ? SHOW_EXCEPTIONAL : r.rank >= 20 ? SHOW_VALUABLE : 0) : 0;
    }
    case 'currency':
      if (b.id === 'gold' || b.id === 'key') return 0;
      return currencyTier(b.id, b.price);
    case 'map':
      return SHOW_VALUABLE;
  }
  return catalogBaseSockets(b.id) !== undefined ? SHOW_VALUABLE : 0;
}

/** Palier effectif d'une entrée du catalogue pour l'interface : override du joueur, sinon palier par défaut */
export function tierOf(c: Pick<CharacterState, 'filter'>, id: string): number {
  return c.filter.tierOverride?.find((x) => x.id === id)?.tier ?? defaultTierOf(id);
}

/** Visibilité (filtre du joueur : 0 = masqué) relevée au palier de rareté : le masquage ne change jamais */
export function lootFilterDecision(c: CharacterState, item: Item): number {
  const v = applyHighlightForce(c.filter, item, filterVisibility(c, item));
  return v > 0 ? Math.max(v, lootTierFor(c, item)) : v;
}

function filterVisibility(c: CharacterState, item: Item): number {
  const b = BASE_BY_ID[item.base];
  if (!b) return SHOW_NORMAL;
  const f = c.filter;
  switch (b.type) {
    case 'currency':
      if (b.id === 'gold') return f.hideGold ? SHOW_HIDDEN : SHOW_NORMAL;
      if (b.id === 'key') return f.hideKeys ? SHOW_HIDDEN : SHOW_NORMAL;
      return SHOW_VALUABLE;
    case 'potion':
    case 'tpot':
      return f.showPotions ? SHOW_NORMAL : SHOW_HIDDEN;
    case 'rune': {
      const r = RUNE_BY_ID[b.id];
      if (!r) return SHOW_NORMAL;
      if (r.rank < f.hideLowRunes) return SHOW_HIDDEN;
      if (r.rank >= f.beamRuneRank) return SHOW_VALUABLE;
      return SHOW_GOOD;
    }
    case 'gem': {
      const grade = Number(b.id.slice(-1));
      if (grade < f.minGemGrade) return SHOW_HIDDEN;
      return grade === 4 ? SHOW_GOOD : SHOW_NORMAL;
    }
    case 'map':
      return SHOW_VALUABLE;
    case 'smallcharm':
    case 'largecharm':
    case 'grandcharm':
    case 'jewel':
      return SHOW_GOOD;
  }
  // bases recherchées (mots runiques, éthérées) : affichées quel que soit le reste
  const plain = item.quality === 'normal' || item.quality === 'superior' || item.quality === 'low';
  const ordinary = plain || item.quality === 'magic' || item.quality === 'rare' || item.quality === 'crafted';
  // équipement réservé à une autre classe
  if (f.classLock && b.slot && !classCanUse(b, c.classId)) return SHOW_HIDDEN;
  // « chasse aux runes » : plus d'équipement ordinaire (les bases à châsses restent selon le réglage dédié)
  if (f.gearOff && ordinary && !(plain && item.sockets > 0 && f.showSocketedNormals) && b.type !== 'amulet' && b.type !== 'ring') return SHOW_HIDDEN;
  // « montée de niveau » : l'équipement ordinaire dépassé par mon niveau (bases à châsses des mots runiques exceptées)
  if (f.levelAware && ordinary && !(plain && item.sockets > 0 && f.showSocketedNormals) && b.type !== 'amulet' && b.type !== 'ring' && requiredLevel(item) < c.level - 14) return SHOW_HIDDEN;
  if (plain && item.sockets > 0 && f.showSocketedNormals) return SHOW_NORMAL;
  if (plain && item.ethereal && f.showEthereal) return SHOW_NORMAL;
  // palier des bases : normales, supérieures et magiques (pas les bijoux)
  if ((plain || item.quality === 'magic') && b.type !== 'amulet' && b.type !== 'ring' && b.tier < f.minBaseTier) return SHOW_HIDDEN;
  switch (item.quality) {
    case 'unique':
      return SHOW_VALUABLE;
    case 'set':
      return SHOW_VALUABLE;
    case 'rare':
    case 'crafted':
      return f.minQuality <= 2 ? SHOW_GOOD : SHOW_HIDDEN;
    case 'magic':
      if (b.type === 'amulet' || b.type === 'ring') return f.minQuality <= 2 ? SHOW_GOOD : SHOW_HIDDEN;
      return f.minQuality <= 1 ? SHOW_NORMAL : SHOW_HIDDEN;
    case 'superior':
      return f.showSuperior || f.minQuality <= 0 ? SHOW_NORMAL : SHOW_HIDDEN;
    default:
      return f.minQuality <= 0 ? SHOW_NORMAL : SHOW_HIDDEN;
  }
}

/** Ramassage automatique : l'or seulement (tout le reste se ramasse en le touchant, comme dans Diablo II) */
export function shouldAutoPickup(_c: CharacterState, item: Item): boolean {
  return item.base === 'gold';
}

/** Ramassage automatique des cartes (réglage du mod qui les apporte, `autoPickupMaps`) ; absent : aucune */
export const mapPickupOf = (cfg: AutoPickupCfg | null | undefined): AutoPickupMaps | undefined => modSetting(cfg, 'autoPickupMaps') as AutoPickupMaps | undefined;

/** Réglages de ramassage automatique lus par le monde (sous-ensemble de Settings) */
export interface AutoPickupCfg {
  autoPickupRunes?: 'none' | 'pul' | 'vex' | 'all';
  autoPickupGems?: 'none' | 'all' | 'normal' | 'flawless';
  autoPickupPotions?: boolean;
  /** Composants et monnaies d'artisanat (éclats de Pierre-Monde, orbes, clés, essences, scarabées, jetons…) */
  autoPickupMaterials?: boolean;
  /** Réglages des mods (Settings.mods) : cartes du mod pd2 (`autoPickupMaps` : aucune, toutes, rares et plus, magiques et plus ; absent = aucune) */
  mods?: ModSettingsMap;
  beltRefill?: boolean;
  /** Allure choisie (réglage local) : true = marche (D2 : 6 yards/s), absent ou false = course */
  walkMode?: boolean;
  /** Potions : montée en gamme automatique avec le niveau du personnage */
  potionUpgrade?: boolean;
}

const RUNE_LIMIT = { none: 0, pul: 21, vex: 26, all: 999 } as const;
const GEM_MIN = { none: 9, all: 0, normal: 2, flawless: 3 } as const;

/**
 * Ramassage automatique selon les réglages du joueur (runes de rang strictement inférieur au seuil, gemmes à partir
 * d'une qualité, potions si la ceinture a de la place). Le filtre de butin n'a PAS d'effet ici : un objet masqué à l'écran (potion, gemme, rune)
 * est quand même ramassé automatiquement, puisque le joueur a choisi de ramasser cette catégorie.
 */
export function shouldAutoPickupCfg(c: CharacterState, item: Item, cfg: AutoPickupCfg): boolean {
  // coffre de cartes plein : la carte reste au sol (le ramassage automatique ne remplit jamais le sac de cartes)
  if (item.map) return !mapStashFull(c) && mapMeetsPickup(item, mapPickupOf(cfg));
  const b = BASE_BY_ID[item.base];
  if (!b) return false;
  if (b.type === 'rune') {
    const r = RUNE_BY_ID[b.id];
    if (!r || r.rank >= RUNE_LIMIT[cfg.autoPickupRunes ?? 'none']) return false;
  } else if (b.type === 'gem') {
    if (Number(b.id.slice(-1)) < GEM_MIN[cfg.autoPickupGems ?? 'none']) return false;
  } else if (b.type === 'currency') {
    if (b.id === 'gold' || !cfg.autoPickupMaterials) return false;
  } else if (b.type === 'potion') {
    if (!cfg.autoPickupPotions) return false;
    const kind = b.id === 'hp_potion' ? 'heal' : b.id === 'mp_potion' ? 'mana' : 'rejuv';
    const slot = c.belt.find((s) => s.kind === kind);
    if (!slot || slot.qty >= beltCapacity(c)) return false;
  } else return false;
  return true;
}
