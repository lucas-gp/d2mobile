/** Filtre de butin : types et préréglages (module léger, utilisé par la sauvegarde sans tirer le moteur) */
export type FilterPreset = 'all' | 'leveling' | 'standard' | 'runewords' | 'endgame' | 'strict' | 'runehunt' | 'custom';

/** Entrée de la liste de surbrillance : clé `base:<id>`, `unique:<id>`, `set:<id>` ou `runeword:<id>` (voir loot/highlight.ts), couleur 0xRRGGBB, visibilité forcée */
export interface HighlightEntry {
  id: string;
  color: number;
  force?: boolean;
}

/** Palier de butin réaffecté par le joueur : id `base:`/`unique:`/`set:`/`runeword:`, palier 0 (aucun), 3, 4 ou 5 (voir loot/tiers.ts) */
export interface TierOverrideEntry {
  id: string;
  tier: 0 | 3 | 4 | 5;
}

export interface LootFilterSettings {
  /** Préréglage d'origine ('custom' dès qu'un réglage est modifié à la main) */
  preset: FilterPreset;
  /** Rareté minimale affichée pour l'équipement : 0 tout, 1 magique+, 2 rare+, 3 set/unique seulement */
  minQuality: number;
  /** Palier minimal des bases normales/supérieures/magiques : 0 toutes, 1 exceptionnelles+, 2 élites */
  minBaseTier: number;
  /** Bases normales à châsses (mots runiques) toujours affichées */
  showSocketedNormals: boolean;
  showSuperior: boolean;
  /** Bases éthérées toujours affichées */
  showEthereal: boolean;
  /** Ramasser automatiquement les runes, gemmes, charmes, joyaux, orbes */
  autoPickupRunes: boolean;
  autoPickupGems: boolean;
  autoPickupCharms: boolean;
  /** Rune minimale annoncée par un faisceau (rang) */
  beamRuneRank: number;
  /** Runes de rang inférieur masquées (0 : aucune) */
  hideLowRunes: number;
  /** Grade minimal des gemmes affichées (0 ébréchée … 4 parfaite) */
  minGemGrade: number;
  /** Étiquettes des potions (ramassées automatiquement de toute façon) */
  showPotions: boolean;
  /** Les objets masqués restent visibles, estompés et touchables */
  revealHidden: boolean;
  /** Masque l'équipement réservé à une autre classe */
  classLock?: boolean;
  /** Masque l'équipement ordinaire (normal, magique, rare) dépassé par le niveau du personnage */
  levelAware?: boolean;
  /** Masque tout l'équipement ordinaire (normal, magique, rare), hors bijoux : « chasse aux runes » */
  gearOff?: boolean;
  /** Masque l'or et/ou les clés au sol (ils sont ramassés automatiquement de toute façon) */
  hideGold?: boolean;
  hideKeys?: boolean;
  /** Liste de surbrillance : objets de la base de données affichés au sol dans une couleur choisie (absente : aucun effet) */
  highlight?: HighlightEntry[];
  /** Paliers de butin réaffectés (absent : paliers par défaut ; 400 entrées au plus) */
  tierOverride?: TierOverrideEntry[];
}

/** Préréglages du filtre (mobile : un choix en un geste, affinable ensuite) */
export const FILTER_PRESETS: Record<Exclude<FilterPreset, 'custom'>, Omit<LootFilterSettings, 'preset' | 'autoPickupRunes' | 'autoPickupGems' | 'autoPickupCharms' | 'revealHidden'>> = {
  /** Tout voir : rien n'est masqué */
  all: {
    minQuality: 0,
    minBaseTier: 0,
    showSocketedNormals: true,
    showSuperior: true,
    showEthereal: true,
    beamRuneRank: 12,
    hideLowRunes: 0,
    minGemGrade: 0,
    showPotions: true,
    classLock: false,
    levelAware: false,
    gearOff: false,
  },
  /** Montée de niveau : l'équipement utile à ma classe et à mon niveau (magique, rare, set, unique), les bases à châsses, les runes et gemmes */
  leveling: {
    minQuality: 1,
    minBaseTier: 0,
    showSocketedNormals: true,
    showSuperior: true,
    showEthereal: true,
    beamRuneRank: 12,
    hideLowRunes: 0,
    minGemGrade: 0,
    showPotions: true,
    classLock: true,
    levelAware: true,
    gearOff: false,
  },
  standard: {
    minQuality: 1,
    minBaseTier: 0,
    showSocketedNormals: true,
    showSuperior: false,
    showEthereal: true,
    beamRuneRank: 15,
    hideLowRunes: 0,
    minGemGrade: 0,
    showPotions: true,
    classLock: true,
    levelAware: false,
    gearOff: false,
  },
  /** Mots runiques : bases à châsses et éthérées, runes, gemmes, set et uniques ; plus de magique ni de rare */
  runewords: {
    minQuality: 3,
    minBaseTier: 0,
    showSocketedNormals: true,
    showSuperior: true,
    showEthereal: true,
    beamRuneRank: 12,
    hideLowRunes: 3,
    minGemGrade: 2,
    showPotions: false,
    classLock: true,
    levelAware: false,
    gearOff: false,
  },
  endgame: {
    minQuality: 2,
    minBaseTier: 1,
    showSocketedNormals: true,
    showSuperior: false,
    showEthereal: true,
    beamRuneRank: 15,
    hideLowRunes: 4,
    minGemGrade: 3,
    showPotions: false,
    classLock: true,
    levelAware: false,
    gearOff: false,
  },
  strict: {
    minQuality: 3,
    minBaseTier: 2,
    showSocketedNormals: true,
    showSuperior: false,
    showEthereal: false,
    beamRuneRank: 18,
    hideLowRunes: 9,
    minGemGrade: 4,
    showPotions: false,
    classLock: true,
    levelAware: false,
    gearOff: false,
  },
  /** Chasse aux runes : runes, gemmes parfaites, orbes, cartes ; set et uniques ; pas d'équipement ordinaire */
  runehunt: {
    minQuality: 3,
    minBaseTier: 2,
    showSocketedNormals: false,
    showSuperior: false,
    showEthereal: false,
    beamRuneRank: 15,
    hideLowRunes: 6,
    minGemGrade: 4,
    showPotions: false,
    classLock: true,
    levelAware: false,
    gearOff: true,
  },
};

export const DEFAULT_FILTER: LootFilterSettings = {
  preset: 'standard',
  ...FILTER_PRESETS.standard,
  autoPickupRunes: true,
  autoPickupGems: true,
  autoPickupCharms: true,
  revealHidden: false,
};
export const FILTER_PRESET_IDS = ['all', 'leveling', 'standard', 'runewords', 'endgame', 'strict', 'runehunt'] as const;
