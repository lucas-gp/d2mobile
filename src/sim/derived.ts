/** Statistiques dérivées du personnage, recalculées à chaque changement d'équipement ou de points. */
import type { Element, StatMap } from '../data/stats';

export interface DerivedStats {
  str: number;
  dex: number;
  vit: number;
  ene: number;
  lifeMax: number;
  manaMax: number;
  /** Régénération de mana par seconde */
  manaRegen: number;
  lifeRegen: number;
  defense: number;
  block: number;
  /** Résistances finales (après pénalité de difficulté, plafonnées) */
  res: Record<Element, number>;
  maxRes: Record<Element, number>;
  absorb: Record<Element, number>;
  /** Absorption plate (points de dégâts retirés par coup) */
  absorbFlat: Record<Element, number>;
  fcr: number;
  fhr: number;
  frw: number;
  ias: number;
  /** IAS de compétence seul (Frénésie, Zèle, Rafale, loup-garou) : ajouté sans rendement décroissant */
  iasSkill: number;
  /** Animations d'attaque des armes équipées (images de base A, WSM) ; double maniement : la plus rapide compte */
  atkSets: { A: number; wsm: number }[];
  /** Type d'arme en main pour les tables de récupération FHR/FBR */
  recWeapon: '1h' | 'spearstaff' | 'other';
  mf: number;
  gf: number;
  xpPct: number;
  lightRadius: number;
  dr: number;
  drFlat: number;
  mdr: number;
  lifeLeech: number;
  manaLeech: number;
  lifePerKill: number;
  manaPerKill: number;
  cbf: boolean;
  /** Dégâts de l'arme (attaque de base) */
  weaponDmg: [number, number];
  attackRating: number;
  /** Bonus de dégâts élémentaires de sorts (%) */
  elemDmgPct: Record<Element, number>;
  /** Pénétration (-% résistance ennemie) */
  pierce: Record<Element, number>;
  /** Immunités brisées (charmes Sunder PD2) */
  sunder: Record<Element, boolean>;
  /** Niveau effectif de chaque compétence (points durs + bonus) */
  skillLevels: Record<string, number>;
  /** Points investis (durs) — base des synergies */
  hardPoints: Record<string, number>;
  /** Toutes les statistiques agrégées brutes */
  all: StatMap;
  addedDmg: Partial<Record<Element, [number, number]>>;
  /** Réduction de résistance ennemie par aura (Conviction) */
  conviction: number;
  /** Druide : forme animale active */
  form: 'werewolf' | 'werebear' | null;
  /** Bonus de dégâts des attaques de mêlée (%) : Ours-garou, Cœur du glouton */
  meleeDmgPct: number;
  /** Bonus de dégâts de Concentration (passif + moitié de l'aura active) : s'applique aussi au Marteau béni (D2) */
  concDmgPct: number;
  /** Créatures du Druide : bonus de dégâts, de score d'attaque et de vie (%) des esprits */
  petDmgPct: number;
  petArPct: number;
  petLifePct: number;
  /** Esprit des ronces : % des dégâts de mêlée renvoyés */
  thorns: number;
  /** Dégâts de l'arme de la main gauche (double maniement), null sinon */
  offDmg: [number, number] | null;
  /** Dégâts lancés de l'arme (javelots, armes de jet), null sinon */
  missileDmg: [number, number] | null;
  /** Amazone : chances (%) d'esquiver une attaque de mêlée / un projectile à l'arrêt, ou toute attaque en marchant */
  dodgeMelee: number;
  dodgeMissile: number;
  dodgeAny: number;
  /** Assassin : chance (%) de parer un coup avec deux griffes à l'arrêt */
  weaponBlock: number;
  /** Réduction (%) de la durée des malédictions et du poison subis (Purification, Évanescence) */
  curseReduce: number;
  poisonReduce: number;
  /** Conviction : réduction (%) de la défense des monstres */
  convictionDef: number;
  /** Rayon (unités) de la Conviction du joueur : seuls les monstres dans ce rayon sont affaiblis */
  convictionRadius: number;
  /** Attaque ininterrompable (%) : Concentration (aura), Attaque concentrée */
  uninterrupt: number;
  /** Aura active du joueur : identifiant de compétence et niveau */
  aura: { id: string; level: number } | null;
}
