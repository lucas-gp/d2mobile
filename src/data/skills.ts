// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Compétences des 7 classes de Diablo II LoD 1.13c (210) : les 30 de la Sorcière (Feu, Froid, Foudre) écrites ici, celles des autres
 * classes dans skills-<classe>.ts (partie propre au jeu : nom affiché, description, cible, portée, chiffres par niveau, progression par
 * paliers comme dans D2 : niveaux 2-8, 9-16, 17-22, 23-28, 29+) ; arbre, prérequis et synergies de Skills.txt et SkillDesc.txt
 * (skills-d2.ts, lot M9). Arbres PD2 S13 : patch du mod (mods/pd2/data/skills.patch.ts, mods/pd2/docs/ETUDE-PD2.md).
 */
import { DRUID_SKILLS } from './skills-druid';
import { BARBARIAN_SKILLS } from './skills-barbarian';
import { PALADIN_SKILLS } from './skills-paladin';
import { AMAZON_SKILLS } from './skills-amazon';
import { ASSASSIN_SKILLS } from './skills-assassin';
import { NECROMANCER_SKILLS } from './skills-necromancer';
import { TREE_CLASS, type ClassId } from './classes';
import { lin, ramp, type Lin, type Ramp } from './ramp';
import type { SkillEngine, SorcSkill } from './skill-types';
import { D2_SKILL_TREE } from './skills-d2';
import { RULES } from '../mods/rules';

export { lin, ramp };
export type { Lin, Ramp };

export type { SkillEngine, SkillNumbers, SorcSkill } from './skill-types';

const S = (d: Omit<SkillEngine, 'icon'> & { icon?: string }): SkillEngine => ({ icon: d.id, ...d });

const SORCERESS_SKILLS: SkillEngine[] = [
  /* ============================ FEU (10) ============================ */
  S({
    id: 'fire_bolt',
    name: 'Trait de feu',
    element: 'fire',
    target: 'nearest',
    range: 12,
    desc: 'Projette un trait de feu sur un ennemi.',
    n: { speed: 15 },
  }),
  S({
    id: 'warmth',
    name: 'Chaleur',
    element: 'fire',
    target: 'self',
    range: 0,
    passive: true,
    desc: 'Passif : augmente la régénération du mana.',
    n: {},
  }),
  S({
    id: 'inferno',
    name: 'Inferno',
    element: 'fire',
    target: 'nearest',
    range: 4.5,
    desc: 'Crache un cône de flammes (maintenir).',
    n: {},
  }),
  S({
    id: 'blaze',
    name: 'Embrasement',
    element: 'fire',
    target: 'self',
    range: 0,
    buff: true,
    desc: "Traînée de flammes derrière la Sorcière pendant l'effet.",
    n: {},
  }),
  S({
    id: 'fire_ball',
    name: 'Boule de feu',
    element: 'fire',
    target: 'densest',
    range: 13,
    desc: "Une boule de feu qui explose à l'impact.",
    n: { speed: 14 },
  }),
  S({
    id: 'fire_wall',
    name: 'Mur de feu',
    element: 'fire',
    target: 'densest',
    range: 10,
    desc: 'Dresse un mur de flammes perpendiculaire à la visée (dégâts par seconde).',
    n: { radius: [3.5, 0.15] },
  }),
  S({
    id: 'enchant',
    name: 'Enchantement',
    element: 'fire',
    target: 'self',
    range: 0,
    buff: true,
    desc: 'Ajoute des dégâts de feu aux attaques et aux hydres.',
    n: {},
  }),
  S({
    id: 'meteor',
    name: 'Météore',
    element: 'fire',
    target: 'densest',
    range: 13,
    desc: "Un météore s'écrase après un court délai et laisse le sol en feu.",
    n: {},
  }),
  S({
    id: 'fire_mastery',
    name: 'Maîtrise du Feu',
    element: 'fire',
    target: 'self',
    range: 0,
    passive: true,
    desc: 'Passif : +% dégâts de feu.',
    n: { mana: [0, 0] },
  }),
  S({
    id: 'hydra',
    name: 'Hydre',
    element: 'fire',
    target: 'densest',
    range: 10,
    desc: 'Invoque une hydre (10 s) qui crache des traits de feu sur les ennemis proches.',
    n: {},
  }),
  /* ============================ FROID (10) ============================ */
  S({
    id: 'ice_bolt',
    name: 'Trait de glace',
    element: 'cold',
    target: 'nearest',
    range: 12,
    desc: 'Un trait de glace qui ralentit la cible.',
    n: { speed: 14 },
  }),
  S({
    id: 'frozen_armor',
    name: 'Armure gelée',
    element: 'cold',
    target: 'self',
    range: 0,
    buff: true,
    desc: 'Armure de glace : défense accrue ; les attaquants au corps à corps sont gelés.',
    n: {},
  }),
  S({
    id: 'frost_nova',
    name: 'Nova de givre',
    element: 'cold',
    target: 'self',
    range: 6,
    desc: 'Une onde de froid autour de la Sorcière qui ralentit les ennemis.',
    n: { radius: [5.5, 0] },
  }),
  S({
    id: 'ice_blast',
    name: 'Explosion de glace',
    element: 'cold',
    target: 'strongest',
    range: 12,
    desc: 'Un projectile de glace qui gèle net sa cible.',
    n: { speed: 14 },
  }),
  S({
    id: 'shiver_armor',
    name: 'Armure de frisson',
    element: 'cold',
    target: 'self',
    range: 0,
    buff: true,
    desc: 'Défense accrue ; les attaquants au corps à corps subissent des dégâts de froid et sont ralentis.',
    n: {},
  }),
  S({
    id: 'glacial_spike',
    name: 'Pointe glaciale',
    element: 'cold',
    target: 'densest',
    range: 12,
    desc: 'Un pic de glace qui explose et gèle les ennemis proches.',
    n: { speed: 13 },
  }),
  S({
    id: 'blizzard',
    name: 'Blizzard',
    element: 'cold',
    target: 'densest',
    range: 12,
    desc: "Une tempête d'éclats de glace s'abat sur une zone pendant 4 secondes.",
    n: { radius: [4, 0], duration: [4, 0] },
  }),
  S({
    id: 'chilling_armor',
    name: 'Armure glaçante',
    element: 'cold',
    target: 'self',
    range: 0,
    buff: true,
    desc: 'Défense accrue ; riposte aux attaques à distance par un trait de glace.',
    n: {},
  }),
  S({
    id: 'frozen_orb',
    name: 'Orbe gelé',
    element: 'cold',
    target: 'densest',
    range: 12,
    desc: 'Un orbe qui traverse le champ de bataille en projetant des éclats de glace.',
    n: { speed: 5.5 },
  }),
  S({
    id: 'cold_mastery',
    name: 'Maîtrise du Froid',
    element: 'cold',
    target: 'self',
    range: 0,
    passive: true,
    desc: 'Passif : pénétration de la résistance au froid (pas contre les immunisés).',
    n: { mana: [0, 0] },
  }),
  /* ============================ FOUDRE (10) ============================ */
  S({
    id: 'charged_bolt',
    name: 'Charge électrique',
    element: 'light',
    target: 'nearest',
    range: 8,
    desc: 'Lance plusieurs éclairs erratiques.',
    n: { speed: 7 },
  }),
  S({
    id: 'static_field',
    name: 'Champ statique',
    element: 'light',
    target: 'self',
    range: 5,
    desc: 'Retire 25 % des PV actuels des ennemis proches (sans effet sous 33 % de leurs PV en Cauchemar, 50 % en Enfer).',
    n: {},
  }),
  S({
    id: 'telekinesis',
    name: 'Télékinésie',
    element: 'light',
    target: 'nearest',
    range: 11,
    desc: 'Frappe à distance et repousse (35 % de chances) ; ramasse aussi un objet au sol à distance.',
    n: {},
  }),
  S({
    id: 'nova',
    name: 'Nova',
    element: 'light',
    target: 'self',
    range: 6,
    desc: 'Un anneau de foudre qui frappe tous les ennemis autour.',
    n: { radius: [5.5, 0] },
  }),
  S({
    id: 'lightning',
    name: 'Foudre',
    element: 'light',
    target: 'densest',
    range: 14,
    desc: 'Un éclair qui traverse tous les ennemis alignés.',
    n: {},
  }),
  S({
    id: 'teleport',
    name: 'Téléportation',
    element: 'magic',
    target: 'direction',
    range: 11,
    desc: "Se téléporte à l'endroit visé.",
    n: { range: 11 },
  }),
  S({
    id: 'chain_lightning',
    name: 'Éclair en chaîne',
    element: 'light',
    target: 'nearest',
    range: 12,
    desc: "Un éclair qui rebondit d'ennemi en ennemi.",
    n: {},
  }),
  S({
    id: 'thunder_storm',
    name: 'Tempête de foudre',
    element: 'light',
    target: 'self',
    range: 0,
    buff: true,
    desc: 'Un orage frappe régulièrement un ennemi proche.',
    n: {},
  }),
  S({
    id: 'energy_shield',
    name: "Bouclier d'énergie",
    element: 'magic',
    target: 'self',
    range: 0,
    buff: true,
    desc: 'Le mana absorbe une partie des dégâts reçus ; chaque point de Télékinésie réduit le mana dépensé.',
    n: {},
  }),
  S({
    id: 'lightning_mastery',
    name: 'Maîtrise de la Foudre',
    element: 'light',
    target: 'self',
    range: 0,
    passive: true,
    desc: 'Passif : +% dégâts de foudre.',
    n: { mana: [0, 0] },
  }),
];

const TREE_BY_ID = new Map(D2_SKILL_TREE.map((t) => [t.id, t]));

/**
 * Compétence complète : partie du jeu (fichier de classe) et place dans l'arbre de Diablo II (skills-d2.ts), dans l'ordre des champs d'une
 * compétence ; chiffres : ceux du fichier de classe, remplacés par ceux de Diablo II quand la classe est faite (lots M9b à M9h)
 */
function withTree(e: SkillEngine): SorcSkill {
  const t = TREE_BY_ID.get(e.id);
  if (!t) throw new Error(`Compétence ${e.id} absente des arbres de Diablo II (skills-d2.ts)`);
  const { icon, id, name, desc, n, ...engine } = e;
  return {
    icon,
    id,
    name,
    tree: t.tree,
    row: t.row,
    col: t.col,
    reqLvl: t.reqLvl,
    prereqs: [...t.prereqs],
    ...engine,
    desc,
    synergies: t.synergies.map((x) => ({ ...x })),
    n: { mana: [0, 0], ...n, ...t.n },
  };
}

/** Les 210 compétences de Diablo II LoD 1.13c (arbres des 7 classes) ; arbres Project Diablo 2 S13 : patch du mod pd2 */
export const SKILLS: SorcSkill[] = [...SORCERESS_SKILLS, ...DRUID_SKILLS, ...BARBARIAN_SKILLS, ...PALADIN_SKILLS, ...AMAZON_SKILLS, ...ASSASSIN_SKILLS, ...NECROMANCER_SKILLS].map(withTree);

export const SKILL_BY_ID: Record<string, SorcSkill> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

/** Compétences d'une classe */
export function classSkills(cls: ClassId): SorcSkill[] {
  return SKILLS.filter((s) => TREE_CLASS[s.tree] === cls);
}

export { TREE_NAMES } from './classes';

export function manaCost(s: SorcSkill, lvl: number): number {
  // aucune compétence de D2 n'est gratuite sauf les auras et Sacrifice (0 mana) ; les autres coûtent au moins 1
  if (s.n.mana[0] === 0 && s.n.mana[1] === 0) return 0;
  return Math.max(1, s.n.mana[0] + s.n.mana[1] * Math.max(0, lvl - 1));
}

/** Somme des bonus de synergie en % (sur les points durs) */
export function synergyPct(s: SorcSkill, hard: Record<string, number>, what: 'dmg' | 'duration' | 'other' = 'dmg'): number {
  let pct = 0;
  for (const syn of s.synergies) if (syn.what === what) pct += syn.pct * (hard[syn.skill] ?? 0);
  return pct;
}

/**
 * % de dégâts d'arme d'une compétence au niveau L, synergies comprises : en PD2, « +X % de dégâts par
 * niveau » d'une attaque d'arme s'ajoute à son bonus de dégâts (Skills.txt : ln34 + skill(x).blvl × par5).
 */
export function skillWdmg(s: SorcSkill, L: number, hard: Record<string, number>): number {
  return (s.n.wdmg ? ramp(s.n.wdmg, L) : 0) + synergyPct(s, hard);
}

/**
 * Valeur d'une table de compétence indexée par points durs (points investis : 0 à 20, plafonnée au-delà) ; 0 si la compétence n'a pas
 * cette table. Règle nommée `skills.hardValue` (src/mods/rules.ts) : la base n'a aucune table, un mod les fournit (tables « Hard Level »).
 */
export function skillHard(id: string, table: string, hard: number): number {
  return RULES['skills.hardValue'](id, table, hard);
}
