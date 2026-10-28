/**
 * Règles des mercenaires de la base : Diablo II LoD 1.13c (lot M8b). Implémentations des règles `merc.*` (src/mods/rules.ts) quand
 * aucun mod ne les remplace. Sources : code du jeu 1.10f reconstitué par D2MOO (D2Game : SUnitDmg.cpp, MonsterAI.cpp, AiThink.cpp),
 * DifficultyLevels.txt (src/mods/d2/tables.ts) et Hireling.txt (src/data/mercs-d2.ts) des MPQ. Module feuille (types et tables seulement).
 */
import type { Monster } from '../../sim/actors';
import type { World } from '../../sim/world';
import { isD2Boss } from './combat';
import { D2_DIFFICULTY } from './tables';
import { D2_HIRELINGS, type D2HirelingRow } from '../../data/mercs-d2';
import { D2_SKILL_TREE } from '../../data/skills-d2';

/**
 * Les objets du mercenaire s'usent-ils ? D2 (SUNITDMG_DrainItemDurability) : seule l'arme d'un joueur qui frappe et l'armure d'un joueur
 * frappé perdent de la durabilité ; l'équipement d'un mercenaire ne s'use jamais.
 */
export const itemWear = (): boolean => false;

/**
 * Part des dégâts d'un mercenaire infligée à un monstre (%). D2 (SUNITDMG_CalculateTotalDamage) : contre un boss (drapeau de MonStats),
 * HireableBossDamagePercent de DifficultyLevels.txt (50 / 35 / 25 %) ; 100 % sinon.
 */
export function bossDamagePct(w: World, m: Monster): number {
  return isD2Boss(m) ? D2_DIFFICULTY.HireableBossDamagePercent[w.difficulty] : 100;
}

/* ------------------------------ modèle des mercenaires (lot M10d) ------------------------------ */

/** Statistiques de base d'un mercenaire à un niveau */
export interface MercBaseStats {
  hp: number;
  def: number;
  str: number;
  dex: number;
  ar: number;
  res: number;
  dmin: number;
  dmax: number;
}

/** Sous-type tel que le modèle le lit (src/data/mercs.ts) */
interface VariantLike {
  id: string;
  skills: readonly { id: string; pct: number }[];
  /** Difficultés d'embauche où ce sous-type est proposé (absent : toutes) */
  hire?: readonly number[];
}
/** Type tel que le modèle le lit (src/data/mercs.ts) */
interface TypeLike {
  id: string;
  act: number;
  weapons: readonly string[];
  shield: boolean;
  classItems: readonly string[];
  variants: readonly VariantLike[];
}
type Slot = 'mainhand' | 'offhand' | 'head' | 'body' | 'gloves' | 'boots' | 'belt';

/**
 * Modèle des mercenaires du jeu de règles (règle `merc.model`) : statistiques par niveau, niveaux et poids des compétences, sous-types
 * proposés, emplacements d'équipement. Base : Diablo II (Hireling.txt) ; un mod peut le remplacer.
 */
export interface MercModel {
  /** Niveau lu dans les tables (bornes du modèle) */
  statLevel(lvl: number): number;
  /** Statistiques de base (`hire` : difficulté d'embauche) */
  baseStats(t: TypeLike, variant: string, hire: number, lvl: number): MercBaseStats;
  /** Niveau « dur » d'une compétence ou d'une aura (0 : pas apprise) ; `t` absent : sans contexte (niveau 0 en D2) */
  skillLevel(skill: string, lvl: number, t: TypeLike | null, variant: string, hire: number): number;
  /** Valeur d'une table propre aux compétences de mercenaire ; undefined : pas de table (chiffres de la compétence de classe) */
  skillTable(skill: string, row: string, lvl: number): number | undefined;
  /** Compétences tirées au sort à chaque attaque et leurs poids (`attack` : attaque de base) */
  skillWeights(t: TypeLike, v: VariantLike, lvl: number, hire: number): readonly { id: string; pct: number }[];
  /** Sous-type d'une ancienne sauvegarde */
  variantAlias(typeId: string, id: string): string;
  /** Type d'une ancienne sauvegarde absent du jeu de règles (undefined : aucun remplaçant) */
  typeAlias(typeId: string): string | undefined;
  /** Sous-types proposés à l'embauche dans cette difficulté */
  variantsAt<V extends VariantLike>(variants: readonly V[], difficulty: number): readonly V[];
  /** Emplacements d'équipement ; emplacement d'une base (null : interdite) */
  slots(t: TypeLike): Slot[];
  slotFor(t: TypeLike, b: { id: string; type: string; classOnly?: string | string[]; twoHanded?: boolean }): Slot | null;
  /** Difficulté d'embauche à enregistrer dans la sauvegarde (undefined : rien) */
  hireOf(difficulty: number): number | undefined;
}

/** Ligne d'embauche de Hireling.txt pour ce sous-type, cette difficulté et ce niveau (DATATBLS_GetHirelingTxtRecordFromIdAndLevel) */
export function d2HireRow(t: TypeLike, variant: string, hire: number, lvl: number): D2HirelingRow | undefined {
  const v = t.variants.some((x) => x.id === variant) ? variant : t.variants[0]?.id;
  let rows = D2_HIRELINGS.filter((r) => r.act === t.act && r.variant === v && r.difficulty === hire);
  if (!rows.length) rows = D2_HIRELINGS.filter((r) => r.act === t.act && r.variant === v);
  if (!rows.length) return undefined;
  let best = rows[0];
  for (const r of rows) if (r.level <= lvl && r.level >= best.level) best = r;
  return best;
}

/** Niveau requis des compétences (Skills.txt) */
const REQ = new Map(D2_SKILL_TREE.map((s) => [s.id, s.reqLvl]));
/** Auras et Armure gelée : actives en permanence chez le mercenaire (le moteur ne les tire pas au sort) */
const PASSIVE = new Set(['prayer', 'defiance', 'blessed_aim', 'thorns', 'holy_freeze', 'might', 'frozen_armor']);
const lvlUps = (r: D2HirelingRow, lvl: number): number => Math.max(0, lvl - r.level);

/**
 * Mercenaires de D2 (MONSTERAI_UpdateMercStatsAndSkills de MonsterAI.cpp, AITHINK_Fn061_Hireable de AiThink.cpp, D2MOO ; Hireling.txt) : ligne d'embauche selon le sous-type,
 * la difficulté d'embauche et le palier de niveau ; caractéristiques de la ligne + gains par niveau au-delà de son niveau (force,
 * dextérité, dégâts en huitièmes, résistances en quarts) ; compétences apprises au niveau requis de Skills.txt, niveau Level +
 * LvlPerLvl / 32 par niveau (32 au plus) ; tirage : DefaultChance pour l'attaque, Chance + ChancePerLvl / 4 par niveau pour chaque
 * compétence ; casque, armure et arme seulement (bouclier du Loup de fer), sans objet de classe.
 */
export const D2_MERC_MODEL: MercModel = {
  statLevel: (lvl) => Math.max(1, Math.min(99, Math.floor(lvl))),
  baseStats: (t, variant, hire, lvl) => {
    const r = d2HireRow(t, variant, hire, lvl);
    if (!r) return { hp: 40, def: 0, str: 10, dex: 10, ar: 0, res: 0, dmin: 0, dmax: 1 };
    const u = lvlUps(r, lvl);
    return {
      hp: Math.max(40, r.hp + u * r.hpLvl),
      def: Math.max(0, r.def + u * r.defLvl),
      str: Math.max(10, r.str + Math.trunc((u * r.strLvl) / 8)),
      dex: Math.max(10, r.dex + Math.trunc((u * r.dexLvl) / 8)),
      ar: Math.max(0, r.ar + u * r.arLvl),
      res: Math.max(0, r.res + Math.trunc((u * r.resLvl) / 4)),
      dmin: Math.max(0, r.dmin + Math.trunc((u * r.dmgLvl) / 8)),
      dmax: Math.max(1, r.dmax + Math.trunc((u * r.dmgLvl) / 8)),
    };
  },
  skillLevel: (skill, lvl, t, variant, hire) => {
    if (skill === 'attack') return 1;
    if (!t) return 0;
    const r = d2HireRow(t, variant, hire, lvl);
    const s = r?.skills.find((x) => x.id === skill);
    if (!r || !s || lvl < (REQ.get(skill) ?? 1)) return 0;
    return Math.max(0, Math.min(32, s.level + ((lvlUps(r, lvl) * s.lvlPerLvl) >> 5)));
  },
  skillTable: () => undefined,
  skillWeights: (t, v, lvl, hire) => {
    const r = d2HireRow(t, v.id, hire, lvl);
    if (!r) return v.skills;
    const u = lvlUps(r, lvl);
    return [{ id: 'attack', pct: r.defaultChance }, ...r.skills.filter((s) => !PASSIVE.has(s.id)).map((s) => ({ id: s.id, pct: s.chance + Math.trunc((u * s.chancePerLvl) / 4) }))];
  },
  // sauvegardes de la base d'avant le lot M10d (sous-types de PD2) : Éclaireuse physique → feu, Barbares → Coup violent
  variantAlias: (t, id) => (t === 'barbarian' ? 'bash' : t === 'rogue' && id === 'phys' ? 'fire' : id),
  // l'Ascendant (acte IV, ajouté par PD2) devient un Loup de fer, lanceur de sorts lui aussi
  typeAlias: (t) => (t === 'ascendant' ? 'ironwolf' : undefined),
  variantsAt: (variants, d) => variants.filter((v) => !v.hire || v.hire.includes(d)),
  slots: (t) => (t.shield ? ['mainhand', 'offhand', 'head', 'body'] : ['mainhand', 'head', 'body']),
  slotFor: (t, b) => {
    const co = b.classOnly === undefined ? [] : Array.isArray(b.classOnly) ? b.classOnly : [b.classOnly];
    if (co.length && !co.some((c) => c === 'merc' || t.classItems.includes(c))) return null;
    if (b.type === 'helm' || b.type === 'circlet') return 'head';
    if (b.type === 'armor') return 'body';
    if (b.type === 'shield') return t.shield ? 'offhand' : null;
    if (!t.weapons.includes(b.type)) return null;
    // Loup de fer : épées à une main seulement (il porte un bouclier)
    if (t.shield && b.twoHanded) return null;
    return 'mainhand';
  },
  hireOf: (d) => d,
};
