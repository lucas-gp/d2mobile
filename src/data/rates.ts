/**
 * TAUX DE BUTIN ET D'EXPÉRIENCE du jeu de règles actif : multiplicateurs appliqués aux formules de Diablo II (formule de rareté,
 * rendements décroissants du magic find, rareté relative des runes, classes de trésor) et vitesse du mana.
 * La base (Diablo II LoD 1.13c) n'a aucun multiplicateur (lot M8e) ; un jeu de règles donne les siens par la règle `loot.rates`
 * (mod pd2 : les conforts de D2 Mobile et les taux propres à PD2, mods/pd2/data/rates.ts). Les paliers de butin du joueur
 * (`lootRate`, LOOT_PRESETS) s'appliquent par-dessus (applyLootPreset).
 */
import { afterRegister } from '../mods/derived';
import { RULES } from '../mods/rules';

/** Taux d'un jeu de règles */
export interface Rates {
  /** Multiplicateur de la probabilité de réussite du test de rareté (formule D2) */
  quality: { unique: number; set: number; rare: number; magic: number };
  /** Multiplicateur du poids des runes dans le TC « good » (face aux gemmes et bijoux) */
  runes: number;
  /** Multiplicateur du poids de l'entrée « good » (runes, gemmes, bijoux) des TC de monstres */
  good: number;
  /** Biais des runes hautes (TC Runes 13 à 17) : multiplie la probabilité de monter d'un palier */
  highRuneBias: number;
  /** Poids des gemmes */
  gems: number;
  /** Chance qu'une carte lâche une carte (par monstre élite / boss) */
  maps: number;
  /** Multiplicateur global du NoDrop (plus petit = plus de drops) */
  noDrop: number;
  /** Or */
  gold: number;
  /** Expérience de base (multiplie la table L-XP de D2) */
  xp: number;
  /** Accélération de l'expérience selon le niveau du personnage : [niveau, facteur] interpolés linéairement, multipliés par `xp` */
  xpCurve: [number, number][];
  /** Charmes et joyaux */
  charms: number;
  /** Charmes de brisure : chance par boss de carte selon le palier (P1…donjon) */
  sunder: number[];
  /** Orbes (monnaie des cartes) */
  orbs: number;
  /** Pièces d'énigme de Larzuk : chance par boss de carte */
  puzzle: number;
  /** Pièces d'énigme : chance par monstre tué (hors boss) */
  puzzleMob: number;
  /** Secondes pour remplir la réserve de mana sans bonus */
  manaRefillSeconds: number;
}

/**
 * Diablo II LoD 1.13c : aucun multiplicateur ; mana rempli en 120 s (ManaRegen de CharStats.txt, toutes les classes : PlrModes.cpp de
 * D2MOO) ; ni cartes, ni orbes, ni énigme, ni charmes de brisure (contenu absent de D2).
 */
const D2_RATES: Rates = {
  quality: { unique: 1, set: 1, rare: 1, magic: 1 },
  runes: 1,
  good: 1,
  highRuneBias: 1,
  gems: 1,
  maps: 0,
  noDrop: 1,
  gold: 1,
  xp: 1,
  xpCurve: [[1, 1]],
  charms: 1,
  sunder: [0, 0, 0, 0, 0],
  orbs: 0,
  puzzle: 0,
  puzzleMob: 0,
  manaRefillSeconds: 120,
};

const copy = (r: Rates): Rates => JSON.parse(JSON.stringify(r)) as Rates;

/** Taux du palier « Normal » du jeu de règles actif : ceux que calibrent les tests et les bots */
export const BASE_RATES: Rates = copy(D2_RATES);

/** Taux effectifs, lus à chaque appel. Égaux à BASE_RATES tant que l'application n'applique pas de palier. */
export const RATES: Rates = copy(D2_RATES);

/** Taux du jeu de règles (règle `loot.rates`), recopiés sur place (mêmes objets pour les importeurs, ordre des clés gardé) */
function applyRulesetRates(): void {
  const base = copy(RULES['loot.rates'](D2_RATES));
  const cur = copy(base);
  for (const k of Object.keys(base) as (keyof Rates)[]) {
    (BASE_RATES as unknown as Record<string, unknown>)[k] = base[k];
    (RATES as unknown as Record<string, unknown>)[k] = cur[k];
  }
}
applyRulesetRates();
afterRegister('taux de butin et d’expérience', applyRulesetRates);

export type LootRateId = 'normal' | 'fast' | 'veryfast' | 'abundant';
export const LOOT_RATE_IDS: LootRateId[] = ['normal', 'fast', 'veryfast', 'abundant'];
type Preset = {
  quality?: Partial<Record<'unique' | 'set' | 'rare' | 'magic', number>>;
  runes?: number;
  good?: number;
  highRuneBias?: number;
  gems?: number;
  maps?: number;
  noDrop?: number;
  gold?: number;
  charms?: number;
  orbs?: number;
  puzzle?: number;
  puzzleMob?: number;
};

/** Paliers de butin (valeurs absolues) ; XP, charmes de brisure et mana inchangés. */
export const LOOT_PRESETS: Record<LootRateId, Preset> = {
  normal: {},
  fast: { puzzle: 0.16, puzzleMob: 0.003, quality: { unique: 5, set: 5, rare: 2.5 }, runes: 12, noDrop: 0.4, highRuneBias: 0.35, gems: 2.5, maps: 3.5, orbs: 1.5, gold: 2 },
  veryfast: {
    puzzle: 0.22,
    puzzleMob: 0.0045,
    quality: { unique: 8, set: 8, rare: 3.5, magic: 1.2 },
    noDrop: 0.3,
    runes: 14,
    good: 3,
    highRuneBias: 0.6,
    gems: 3.5,
    maps: 4.5,
    orbs: 2,
    gold: 3,
    charms: 2,
  },
  abundant: {
    puzzle: 0.35,
    puzzleMob: 0.006,
    quality: { unique: 12, set: 12, rare: 5, magic: 1.5 },
    noDrop: 0.2,
    runes: 20,
    good: 4,
    highRuneBias: 1.6,
    gems: 5,
    maps: 6,
    orbs: 3,
    gold: 5,
    charms: 3,
  },
};

/** Applique un palier : repart toujours de la base (idempotent, jamais composé). */
export function applyLootPreset(id: LootRateId): void {
  const p = LOOT_PRESETS[id] ?? LOOT_PRESETS.normal;
  const r = RATES as unknown as Record<string, unknown>;
  const b = BASE_RATES as unknown as Record<string, unknown>;
  for (const k of ['runes', 'good', 'highRuneBias', 'gems', 'maps', 'noDrop', 'gold', 'charms', 'orbs', 'puzzle', 'puzzleMob']) r[k] = b[k];
  Object.assign(RATES.quality, BASE_RATES.quality, p.quality ?? {});
  for (const [k, v] of Object.entries(p)) if (k !== 'quality') r[k] = v;
}
