/**
 * Types des compétences (module feuille : les fichiers `skills-<classe>.ts` (et les chiffres d'un mod, par src/mods/api) en dépendent sans importer `skills.ts`,
 * qui les rassemble). Réexportés par `skills.ts`.
 */
import type { SkillDef } from './types';
import type { Lin, Ramp } from './ramp';

export interface SkillNumbers {
  /** Coût en mana : base + parNiveau × (niveau − 1) */
  mana: [number, number];
  min?: Ramp;
  max?: Ramp;
  /** Durée en secondes (buffs, zones), base + par niveau ou table D2 */
  duration?: Lin;
  /** Rayon (unités), base + par niveau ou table D2 */
  radius?: Lin;
  /** Temps de recharge (s) */
  cooldown?: number;
  /** Nombre de projectiles, coups, cibles… */
  count?: Lin;
  /** Valeur de passif ou d'effet (%) */
  value?: Lin;
  /** Valeur secondaire */
  value2?: Lin;
  /** Valeurs supplémentaires (effets multiples des cris, auras, charges…) */
  v3?: Lin;
  v4?: Lin;
  v5?: Lin;
  /** Portée / distance (unités) */
  range?: number;
  /** Vitesse de projectile (unités/s) */
  speed?: number;
  /** Durée de gel/ralentissement (s) */
  chill?: Lin;
  /** Dégâts d'un deuxième et d'un troisième effet (second élément, charge 2 et 3…) */
  min2?: Ramp;
  max2?: Ramp;
  min3?: Ramp;
  max3?: Ramp;
  /** Étourdissement (s) */
  stun?: Lin;
  /** Bonus de score d'attaque (%) */
  ar?: Ramp;
  /** Bonus de dégâts de l'arme (%) */
  wdmg?: Ramp;
  /** Dégâts physiques fixes ajoutés */
  flat?: Ramp;
  /** Invocations : vie (points de vie D2) */
  life?: Lin;
  /** Invocations : vie et dégâts relatifs à un monstre standard du niveau du personnage */
  pet?: { life: number; lifePerLvl: number; max: [number, number] };
}

export interface SorcSkill extends SkillDef {
  n: SkillNumbers;
}

/**
 * Partie d'une compétence propre au jeu (fichiers de classe : nom affiché, description, cible, portée, chiffres) ; l'arbre, les prérequis,
 * les synergies et les chiffres par niveau de Diablo II (classes faites) viennent de skills-d2.ts, assemblés par skills.ts.
 */
export type SkillEngine = Omit<SorcSkill, 'tree' | 'row' | 'col' | 'reqLvl' | 'prereqs' | 'synergies' | 'n'> & {
  /** Chiffres propres au jeu (vitesse des projectiles, portée…) ; ceux de Diablo II viennent de skills-d2.ts (classes faites) */
  n: Partial<SkillNumbers>;
};
