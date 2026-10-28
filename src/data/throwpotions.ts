// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Potions de jet de Diablo II (weapons.txt type « tpot » + missiles.txt), valeurs brutes de D2.
 * Les potions de jet ignorent les caractéristiques du personnage : seuls la résistance et l'immunité du monstre comptent.
 * Feu : dégâts physiques (MinDamage-MaxDamage) + feu (EMin-Emax) dans la zone d'impact.
 * Gaz : poison de l'impact (EMin sur ELen = 50 images) puis nuage persistant (EMin du nuage), poison total = EMin × images ÷ 256.
 * La force suit le niveau de l'objet (4 / 16 / 28 pour le feu, 8 / 20 / 32 pour le gaz), comme dans weapons.txt.
 */
export interface ThrowDef {
  id: string;
  kind: 'fire' | 'gas';
  /** Rayon de la zone d'impact (cases) */
  radius: number;
  /** Feu : physique et feu (min-max) */
  phys?: [number, number];
  fire?: [number, number];
  /** Gaz : poison à l'impact et poison du nuage (par image de 1/25 s, unités de D2 ÷ 256) */
  hitPoison?: number;
  cloudPoison?: number;
  /** Durée du nuage en secondes */
  cloudSecs?: number;
}

/** Piles de 25 au plus (maxstack de weapons.txt) */
export const THROW_STACK_MAX = 25;
/** Quantité vendue par le marchand en un achat */
export const THROW_PACK = 5;

export const THROW_POTIONS: Record<string, ThrowDef> = {
  fulminating_potion: { id: 'fulminating_potion', kind: 'fire', radius: 2, phys: [2, 7], fire: [3, 8] },
  exploding_potion: { id: 'exploding_potion', kind: 'fire', radius: 2, phys: [8, 12], fire: [8, 18] },
  oil_potion: { id: 'oil_potion', kind: 'fire', radius: 2.2, phys: [13, 30], fire: [13, 34] },
  strangling_gas_potion: { id: 'strangling_gas_potion', kind: 'gas', radius: 2.5, hitPoison: 48, cloudPoison: 123, cloudSecs: 6 },
  choking_gas_potion: { id: 'choking_gas_potion', kind: 'gas', radius: 2.5, hitPoison: 144, cloudPoison: 246, cloudSecs: 6 },
  rancid_gas_potion: { id: 'rancid_gas_potion', kind: 'gas', radius: 2.5, hitPoison: 192, cloudPoison: 369, cloudSecs: 6 },
};

/** Durée du poison de l'impact (images D2 → secondes) */
export const GAS_HIT_SECS = 2;
/** Poison par seconde à partir de la valeur D2 (par image, ÷ 256, 25 images par seconde) */
export const gasDps = (v: number): number => (v * 25) / 256;
