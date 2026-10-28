/**
 * Catalogue de valeur du butin propre à Project Diablo 2 (lot M10f : autrefois dans src/data/items/loot-value.ts, déplacé tel quel) :
 * charmes de brisure, Anneau mortel de Bul-Kathos, mots runiques PD2 (variantes par type comprises), éclat de Pierre-Monde
 * (autrefois écrit dans sim/loot/filter.ts). Branché sur la règle `loot.value`
 * (mods/pd2/index.ts) ; le catalogue de la base garde les objets de Diablo II.
 */

/** Uniques : id -> palier (3, 4 ou 5) */
export const VALUE_UNIQUES: Readonly<Record<string, 3 | 4 | 5>> = {
  u_sunder_cold: 4,
  u_sunder_fire: 4,
  u_sunder_light: 4,
  u_sunder_phys: 4,
};

/** Objets de set : id -> palier */
export const VALUE_SET_ITEMS: Readonly<Record<string, 3 | 4 | 5>> = {
  s_bul_kathos_death_band: 3,
};

/** Mots runiques : id -> [palier sur base ordinaire, palier sur base élite ou éthérée] */
export const VALUE_RUNEWORDS: Readonly<Record<string, readonly [3 | 4, 3 | 4]>> = {
  rw_phoenix_weapon: [4, 4],
  rw_fortitude_armor: [3, 4],
  rw_dream_helm: [3, 4],
  rw_spirit_shield: [3, 3],
  rw_obsession: [3, 4],
  rw_rapture: [3, 4],
  rw_dragon_armor: [3, 4],
  rw_epiphany: [3, 4],
  rw_innocence: [3, 3],
  rw_asylum: [3, 4],
  rw_plague: [3, 3],
  rw_mist: [3, 4],
  rw_dominion: [3, 4],
  rw_zenith: [3, 4],
  rw_shattered_wall: [3, 3],
  rw_wisdom: [3, 3],
};

/** Monnaies : id -> palier (l'éclat de Pierre-Monde, peu cher, est mis en avant comme une monnaie exceptionnelle) */
export const VALUE_CURRENCY: Readonly<Record<string, number>> = {
  worldstone_shard: 4,
};
