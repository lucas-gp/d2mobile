/**
 * Compétences de Diablo II LoD 1.13c (lot M9) : arbres des 7 classes depuis Skills.txt et SkillDesc.txt (MPQ du joueur). Pour chaque
 * compétence de classe : identifiant du jeu, ligne `Id` de Skills.txt, arbre (SkillPage), rangée et colonne (SkillRow, SkillColumn),
 * niveau requis (reqlevel), prérequis (reqskill1-3) et synergies (lignes « dsc3 » de SkillDesc.txt : compétence, valeur par point
 * investi, nature). Lu par tools/vanilla/gen.ts (table `skills` → src/data/skills-d2.ts).
 *
 * Identifiant : celui du jeu pour la même ligne de Skills.txt (le jeu a gardé les identifiants de ses arbres d'avant les mods, y compris
 * pour une compétence que Project Diablo 2 a renommée : `plague_poppy` = Poison Creeper), sinon le nom interne de Skills.txt en
 * minuscules (`frozen_armor`, `sword_mastery`…).
 *
 * Synergies : seules celles que la simulation applique sont gardées (dégâts, absorption, durée du gel) ; les autres (secondes, vie,
 * défense, score d'attaque par niveau d'une autre compétence) sont comptées dans `skippedSynergies`.
 *
 * `calc` évalue une formule de Skills.txt (arithmétique entière de D2, `lnXY`, `dmXY`, `parN`, `skill('X'.y)`, `min`, `max`, `?:`),
 * d'après la description des colonnes de calcul (D2MOO : SKILLS_EvaluateSkillFormula, faits seulement).
 */
import { rows, num } from '../audit/common';
import type { Row } from '../d2import/formats/txt';
import { VANILLA_NUMBERS, skillNumbers, type NumVal } from './skills-numbers';

/** Classe de Skills.txt → identifiant de classe du jeu */
export const D2_CLASS_OF: Record<string, string> = {
  ama: 'amazon',
  sor: 'sorceress',
  nec: 'necromancer',
  pal: 'paladin',
  bar: 'barbarian',
  dru: 'druid',
  ass: 'assassin',
};

/** Page de SkillDesc.txt (1 à 3) → arbre du jeu, par classe */
const TREE_PAGES: Record<string, [string, string, string]> = {
  ama: ['amz_bow', 'amz_passive', 'amz_javelin'],
  sor: ['fire', 'light', 'cold'],
  nec: ['nec_curse', 'nec_poison', 'nec_summon'],
  pal: ['pal_combat', 'pal_offense', 'pal_defense'],
  bar: ['bar_combat', 'bar_mastery', 'bar_warcry'],
  dru: ['summon', 'shape', 'elemental'],
  ass: ['asn_traps', 'asn_shadow', 'asn_martial'],
};

/** Nom interne de Skills.txt → identifiant du jeu, quand il diffère du nom en minuscules */
const ID_FIX: Record<string, string> = {
  'Slow Missiles': 'slow_movement',
  Dopplezon: 'decoy',
  'Raise Skeletal Mage': 'skeletal_mage',
  BloodGolem: 'blood_golem',
  IronGolem: 'iron_golem',
  FireGolem: 'fire_golem',
  Wearwolf: 'werewolf',
  Wearbear: 'werebear',
  'Summon Spirit Wolf': 'spirit_wolf',
  'Heart of Wolverine': 'heart_wolverine',
  'Spirit of Barbs': 'spirit_barbs',
  'Summon Grizzly': 'grizzly',
  'Fire Trauma': 'fire_blast',
  'Shock Field': 'shock_web',
  Quickness: 'burst_of_speed',
  'Wake of Fire Sentry': 'wake_of_fire',
  'Inferno Sentry': 'wake_of_inferno',
  'Royal Strike': 'phoenix_strike',
};

const snake = (s: string): string =>
  s
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

/** Identifiant du jeu d'une ligne de Skills.txt (nom interne) */
export const skillIdOf = (name: string): string => ID_FIX[name] ?? snake(name);

/** Synergie (champ `synergies` d'une compétence) */
export interface D2Synergy {
  skill: string;
  pct: number;
  what: 'dmg' | 'duration' | 'other';
}

/** Compétence de classe de Diablo II : arbre et identité */
export interface VanillaSkill {
  id: string;
  /** Ligne `Id` de Skills.txt (aussi l'indice des compétences d'un fichier .d2s) */
  d2Id: number;
  cls: string;
  tree: string;
  row: number;
  col: number;
  reqLvl: number;
  prereqs: string[];
  synergies: D2Synergy[];
  /** Chiffres par niveau (classes faites : tools/vanilla/skills-numbers.ts) */
  n?: Record<string, NumVal>;
}

/** Nature des lignes de synergie de SkillDesc.txt (clé de texte de la colonne dsc3textb) que la simulation applique */
const SYN_KIND: Record<string, D2Synergy['what']> = {
  Firedplev: 'dmg',
  Colddplev: 'dmg',
  Ltngdplev: 'dmg',
  Magdplev: 'dmg',
  Poisdplev: 'dmg',
  Damplev: 'dmg',
  AFDImm: 'dmg',
  ElemDampLev: 'dmg',
  Hbdplev: 'dmg',
  Damabsplev: 'other',
  FrezLenplev: 'duration',
};

/** Synergies écartées (nature non appliquée par la simulation) : compétence → textes */
export const skippedSynergies = new Map<string, string[]>();

/* ------------------------------ formules ------------------------------ */

/** Contexte d'évaluation d'une formule : niveau de la compétence, points investis, lignes de Skills.txt par nom interne */
export interface CalcCtx {
  row: Row;
  lvl: number;
  blvl?: number;
  byName: Map<string, Row>;
  /** Points investis dans une autre compétence (synergies) ; 0 par défaut */
  hard?: (name: string) => number;
}

const par = (r: Row, i: number): number => num(r[`Param${i}`]);
const lnOf = (r: Row, a: number, b: number, lvl: number): number => par(r, a) + (lvl - 1) * par(r, b);
/** Rendements décroissants (dmXY) : X + (Y − X) × 110 × lvl / (lvl + 6) / 100 en entiers, plafonné à Y (D2MOO : D2Common_11033) */
const dmOf = (r: Row, a: number, b: number, lvl: number): number => Math.min(par(r, b), par(r, a) + Math.trunc(Math.trunc(((par(r, b) - par(r, a)) * 110 * lvl) / (lvl + 6)) / 100));

/** Bonus par niveau d'un dégât de Skills.txt : colonnes `<pre>1` à `<pre>5` pour les niveaux 2-8, 9-16, 17-22, 23-28, 29 et plus */
export function levelBonus(r: Row, pre: string, lvl: number): number {
  const b = [2, 9, 17, 23, 29, Infinity];
  let v = 0;
  for (let k = 0; k < 5; k++) v += num(r[`${pre}${k + 1}`]) * Math.max(0, Math.min(lvl, b[k + 1] - 1) - b[k] + 1);
  return v;
}

/** Dégâts élémentaires (ou physiques) d'une ligne au niveau `lvl`, en 1/256 de point (décalage HitShift) : SKILLS_GetMinElemDamage */
export function elemDamage(r: Row, base: string, pre: string, lvl: number): number {
  return (num(r[base]) + levelBonus(r, pre, lvl)) << num(r.HitShift);
}

/** Durée élémentaire (images) : ELen + ELevLen1 aux niveaux 2-8, ELevLen2 aux niveaux 9-16, ELevLen3 au-delà (SKILLS_GetElementalLength) */
export function elemLength(r: Row, lvl: number): number {
  const a = num(r.ELevLen1);
  const b = num(r.ELevLen2);
  const c = num(r.ELevLen3);
  const l = lvl <= 8 ? a * (lvl - 1) : lvl <= 16 ? 7 * a + (lvl - 8) * b : 7 * a + 8 * b + (lvl - 16) * c;
  return num(r.ELen) + l;
}

/** Évalue une formule de Skills.txt / SkillDesc.txt (entiers, division tronquée comme le jeu) */
export function calc(expr: string, ctx: CalcCtx): number {
  // espaces retirés hors des noms de compétence entre apostrophes
  const src = expr.replace(/'[^']*'|\s+/g, (x) => (x.startsWith("'") ? x : '')).replace(/^"(.*)"$/, '$1');
  let i = 0;
  const peek = (): string => src[i] ?? '';
  const fail = (m: string): never => {
    throw new Error(`formule « ${expr} » : ${m} (position ${i})`);
  };
  const ident = (): string => {
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (!m) fail('identifiant attendu');
    i += m![0].length;
    return m![0];
  };
  /** Valeur d'une référence (`lvl`, `par3`, `ln12`, `dm34`…) sur une ligne au niveau `lvl` */
  const ref = (name: string, r: Row, lvl: number, blvl: number): number => {
    if (name === 'lvl') return lvl;
    if (name === 'blvl') return blvl;
    let m = /^par(\d)$/.exec(name);
    if (m) return par(r, Number(m[1]));
    m = /^ln(\d)(\d)$/.exec(name);
    if (m) return lnOf(r, Number(m[1]), Number(m[2]), lvl);
    m = /^dm(\d)(\d)$/.exec(name);
    if (m) return dmOf(r, Number(m[1]), Number(m[2]), lvl);
    // dégâts élémentaires (points entiers), durée élémentaire (images), score d'attaque (%) : SKILLS_GetSpecialParamValue de D2MOO
    if (name === 'edmn') return elemDamage(r, 'EMin', 'EMinLev', lvl) >> 8;
    // dégâts élémentaires en 1/256 (edns, edxs : sans décalage final)
    if (name === 'edns') return elemDamage(r, 'EMin', 'EMinLev', lvl);
    if (name === 'edxs') return elemDamage(r, 'EMax', 'EMaxLev', lvl);
    if (name === 'edmx') return elemDamage(r, 'EMax', 'EMaxLev', lvl) >> 8;
    if (name === 'edln') return elemLength(r, lvl);
    if (name === 'toht') return r.ToHitCalc ? calc(r.ToHitCalc, { ...ctx, row: r, lvl }) : num(r.ToHit) + (lvl - 1) * num(r.LevToHit);
    return fail(`référence inconnue ${name}`);
  };
  const primary = (): number => {
    const c = peek();
    if (c === '(') {
      i++;
      const v = ternary();
      if (peek() !== ')') fail('« ) » attendue');
      i++;
      return v;
    }
    if (c === '-') {
      i++;
      return -primary();
    }
    if (/\d/.test(c)) {
      const m = /^\d+/.exec(src.slice(i))!;
      i += m[0].length;
      return Number(m[0]);
    }
    const id = ident();
    if (id === 'skill') {
      // skill('Nom'.champ)
      if (src.slice(i, i + 2) !== "('") fail("« ('» attendu");
      i += 2;
      const end = src.indexOf("'", i);
      const name = src.slice(i, end);
      i = end + 1;
      if (peek() !== '.') fail('« . » attendu');
      i++;
      const f = ident();
      if (peek() !== ')') fail('« ) » attendue');
      i++;
      const other = ctx.byName.get(name);
      if (!other) fail(`compétence inconnue ${name}`);
      const hard = ctx.hard?.(name) ?? 0;
      if (f === 'blvl' || f === 'lvl') return hard;
      return ref(f, other!, Math.max(1, hard), hard);
    }
    if (id === 'min' || id === 'max') {
      if (peek() !== '(') fail('« ( » attendue');
      i++;
      const a = ternary();
      if (peek() !== ',') fail('« , » attendue');
      i++;
      const b = ternary();
      if (peek() !== ')') fail('« ) » attendue');
      i++;
      return id === 'min' ? Math.min(a, b) : Math.max(a, b);
    }
    return ref(id, ctx.row, ctx.lvl, ctx.blvl ?? ctx.lvl);
  };
  const term = (): number => {
    let v = primary();
    for (;;) {
      const c = peek();
      if (c === '*') {
        i++;
        v *= primary();
      } else if (c === '/') {
        i++;
        const d = primary();
        v = d === 0 ? 0 : Math.trunc(v / d);
      } else return v;
    }
  };
  const sum = (): number => {
    let v = term();
    for (;;) {
      const c = peek();
      if (c === '+') {
        i++;
        v += term();
      } else if (c === '-') {
        i++;
        v -= term();
      } else return v;
    }
  };
  const cmp = (): number => {
    const a = sum();
    const m = /^(<=|>=|==|!=|<|>)/.exec(src.slice(i));
    if (!m) return a;
    i += m[0].length;
    const b = sum();
    const ok = m[0] === '<' ? a < b : m[0] === '>' ? a > b : m[0] === '<=' ? a <= b : m[0] === '>=' ? a >= b : m[0] === '==' ? a === b : a !== b;
    return ok ? 1 : 0;
  };
  const ternary = (): number => {
    const c = cmp();
    if (peek() !== '?') return c;
    i++;
    const a = ternary();
    if (peek() !== ':') fail('« : » attendu');
    i++;
    const b = ternary();
    return c ? a : b;
  };
  const v = ternary();
  if (i !== src.length) fail('fin attendue');
  return v;
}

/* ------------------------------ arbres ------------------------------ */

/** Compétences de classe de Skills.txt, dans l'ordre de la table, avec leur place dans l'arbre de SkillDesc.txt */
export function vanillaSkills(): VanillaSkill[] {
  const sk = rows('Skills').filter((r) => r.charclass && D2_CLASS_OF[r.charclass]);
  const byName = new Map(sk.map((r) => [r.skill!, r]));
  const desc = new Map(rows('SkillDesc').map((r) => [r.skilldesc!, r]));
  const idOfDescName = new Map<string, string>();
  for (const r of sk) {
    const d = desc.get(r.skilldesc!);
    if (d?.['str name']) idOfDescName.set(d['str name'].toLowerCase(), skillIdOf(r.skill!));
  }
  const out: VanillaSkill[] = [];
  for (const r of sk) {
    const id = skillIdOf(r.skill!);
    const d = desc.get(r.skilldesc!);
    if (!d) throw new Error(`SkillDesc.txt : ${r.skill} absente`);
    const page = num(d.SkillPage);
    const tree = TREE_PAGES[r.charclass!][page - 1];
    if (!tree) throw new Error(`${r.skill} : page ${page}`);
    const prereqs: string[] = [];
    for (let k = 1; k <= 3; k++) {
      const p = r[`reqskill${k}`];
      if (!p) continue;
      if (!byName.has(p)) throw new Error(`${r.skill} : prérequis ${p} inconnu`);
      prereqs.push(skillIdOf(p));
    }
    const synergies: D2Synergy[] = [];
    for (let k = 1; k <= 7; k++) {
      const a = d[`dsc3texta${k}`];
      if (!a || !/^skillname\d+$/i.test(a)) continue;
      const b = d[`dsc3textb${k}`] ?? '';
      const ca = d[`dsc3calca${k}`];
      if (!b || !ca) continue; // ligne de liste (compétences qui reçoivent un bonus), sans valeur
      const other = idOfDescName.get(a.toLowerCase());
      if (!other) throw new Error(`${r.skill} : synergie ${a} inconnue`);
      const what = SYN_KIND[b];
      if (!what) {
        skippedSynergies.set(id, [...(skippedSynergies.get(id) ?? []), `${other}:${b}`]);
        continue;
      }
      synergies.push({ skill: other, pct: calc(ca, { row: r, lvl: 1, byName }), what });
    }
    const spec = VANILLA_NUMBERS[id];
    const n = spec ? skillNumbers(spec, r, byName) : undefined;
    out.push({ id, d2Id: num(r.Id), cls: D2_CLASS_OF[r.charclass!], tree, row: num(d.SkillRow), col: num(d.SkillColumn) - 1, reqLvl: num(r.reqlevel), prereqs, synergies, ...(n ? { n } : {}) });
  }
  return out;
}
