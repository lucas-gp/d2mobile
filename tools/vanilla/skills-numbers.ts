/**
 * Chiffres par niveau des compétences de Diablo II LoD 1.13c (lots M9b à M9h) : pour chaque compétence, les champs de chiffres que lit la
 * simulation (`SkillNumbers`, src/data/skill-types.ts) et leur source dans Skills.txt / Missiles.txt, évaluée aux niveaux 1 à 60 puis
 * écrite sous la forme la plus courte qui reproduit tous les niveaux : linéaire `[base, par niveau]`, paliers de D2 `R(…)` (niveaux 2-8,
 * 9-16, 17-22, 23-28, 29 et plus), sinon table complète `T([…])`. Lu par tools/vanilla/skills.ts (table `skills` → src/data/skills-d2.ts).
 *
 * Unités du moteur : points de vie et de mana (D2 compte en 1/256 : décalage HitShift / manashift), secondes (D2 : 25 images par
 * seconde), unités de monde pour les rayons (1 unité = 3 sous-cases de D2 = 2 yards), pour cent. Les synergies (`skill('X'.blvl)`) valent 0
 * ici : elles sont appliquées par la simulation (champ `synergies`).
 *
 * Sources (formules : D2MOO, D2Common D2Skills.cpp, faits seulement) :
 * - `mana` : coût d'un lancer, (mana + (niveau − 1) × lvlmana) << manashift / 256 (SKILLS_GetManaCosts) ;
 * - `mps` : coût par seconde d'une compétence canalisée, ((25 × mana + (niveau − 1) × lvlmana) / 2) << manashift / 256 (paramètre de
 *   description 22 de SKILLS_GetSpecialParamValue, « Mana Cost: x per second ») ;
 * - `emin`, `emax`, `pmin`, `pmax` : dégâts élémentaires / physiques (EMin + EMinLev1-5 << HitShift, SKILLS_GetMinElemDamage) ;
 * - `elen` : durée élémentaire (ELen, ELevLen1-3 : SKILLS_GetElementalLength), en secondes ; `etotmin`, `etotmax` : dégâts de
 *   poison au total (par image × durée en images, comme le total affiché par SkillDesc) ;
 * - `tohit` : ToHitCalc, sinon ToHit + (niveau − 1) × LevToHit (%) ;
 * - `delay` : temps de recharge (colonne delay, images → secondes) ;
 * - `{ col }` : une colonne de formule de Skills.txt (calc1-4, auralencalc, aurarangecalc, aurastatcalc1-6, passivecalc1-5, perdelay,
 *   petmax), `{ expr }` : une formule écrite ici (celle d'une ligne de description de SkillDesc.txt) ; `{ mis, … }` : la même chose sur une
 *   ligne de Missiles.txt (dégâts, durée `Range` + `LevRange`).
 * `k` : facteur appliqué (images → secondes 1/25, sous-cases → unités 1/3, dégâts par image → par seconde 25…).
 */
import { num, rows } from '../audit/common';
import type { Row } from '../d2import/formats/txt';
import { calc, elemDamage, elemLength, levelBonus } from './skills';

export type NumSrc =
  | { src: 'mana' | 'mps' | 'emin' | 'emax' | 'pmin' | 'pmax' | 'elen' | 'tohit' | 'delay' | 'etotmin' | 'etotmax'; k?: number }
  | { col: string; k?: number }
  | { expr: string; k?: number }
  | { mis: string; src: 'emin' | 'emax' | 'range' | 'sHitPar1' | 'cHitPar1' | 'SHitCalc1'; k?: number };

/** Valeur écrite : linéaire, paliers de D2 ou table */
export type NumVal = { lin: [number, number] } | { ramp: [number, number, number, number, number, number] } | { tab: number[] } | { scalar: number };

const LEVELS = 60;
const FPS = 25;
/** Sous-cases de D2 par unité de monde du moteur */
const SUBTILES = 3;

/** Facteurs usuels */
export const K = { sec: 1 / FPS, unit: 1 / SUBTILES, perSec: FPS, perSecHalf: FPS / 2 };

const round = (v: number): number => Math.round(v * 1e6) / 1e6;
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

/** Forme la plus courte qui reproduit les valeurs des niveaux 1 à 60 */
export function fit(v: number[]): NumVal {
  const d = v[1] - v[0];
  if (v.every((x, i) => near(x, v[0] + d * i))) return { lin: [round(v[0]), round(d)] };
  // paliers : incréments constants sur 2-8, 9-16, 17-22, 23-28, 29+
  const brackets: [number, number][] = [
    [2, 8],
    [9, 16],
    [17, 22],
    [23, 28],
    [29, LEVELS],
  ];
  const inc = brackets.map(([a]) => v[a - 1] - v[a - 2]);
  let ok = true;
  let x = v[0];
  for (let L = 2; L <= LEVELS && ok; L++) {
    const k = brackets.findIndex(([a, b]) => L >= a && L <= b);
    x += inc[k];
    ok = near(x, v[L - 1]);
  }
  if (ok) return { ramp: [round(v[0]), ...inc.map(round)] as [number, number, number, number, number, number] };
  return { tab: v.map(round) };
}

let missiles: Map<string, Row> | null = null;
const missile = (name: string): Row => {
  missiles ??= new Map(rows('Missiles').map((r) => [r.Missile!, r]));
  const r = missiles.get(name);
  if (!r) throw new Error(`Missiles.txt : ${name} absent`);
  return r;
};

/** Valeur d'une source au niveau `lvl` (avant le facteur `k`) */
function value(s: NumSrc, r: Row, byName: Map<string, Row>, lvl: number): number {
  if ('mis' in s) {
    const m = missile(s.mis);
    const shift = 2 ** num(m.HitShift) / 256;
    if (s.src === 'emin') return (num(m.EMin) + levelBonus(m, 'MinELev', lvl)) * shift;
    if (s.src === 'emax') return (num(m.Emax) + levelBonus(m, 'MaxELev', lvl)) * shift;
    if (s.src === 'sHitPar1') return num(m.sHitPar1);
    if (s.src === 'cHitPar1') return num(m.cHitPar1);
    if (s.src === 'SHitCalc1') return calc(m.SHitCalc1 ?? '0', { row: r, lvl, byName });
    return num(m.Range) + lvl * num(m.LevRange);
  }
  if ('col' in s || 'expr' in s) {
    const e = 'col' in s ? r[s.col] : s.expr;
    if (!e) throw new Error(`${r.skill} : colonne ${'col' in s ? s.col : ''} vide`);
    return calc(e, { row: r, lvl, byName });
  }
  const shift = 2 ** num(r.manashift) / 256;
  switch (s.src) {
    case 'mana':
      return (num(r.mana) + (lvl - 1) * num(r.lvlmana)) * shift;
    case 'mps':
      return ((25 * num(r.mana) + (lvl - 1) * num(r.lvlmana)) / 2) * shift;
    case 'emin':
      return elemDamage(r, 'EMin', 'EMinLev', lvl) / 256;
    case 'emax':
      return elemDamage(r, 'EMax', 'EMaxLev', lvl) / 256;
    case 'pmin':
      return elemDamage(r, 'MinDam', 'MinLevDam', lvl) / 256;
    case 'pmax':
      return elemDamage(r, 'MaxDam', 'MaxLevDam', lvl) / 256;
    case 'elen':
      return elemLength(r, lvl) / FPS;
    // poison : dégâts par image × durée (images), total affiché par SkillDesc (« x-y over z seconds »)
    case 'etotmin':
      return (elemDamage(r, 'EMin', 'EMinLev', lvl) / 256) * elemLength(r, lvl);
    case 'etotmax':
      return (elemDamage(r, 'EMax', 'EMaxLev', lvl) / 256) * elemLength(r, lvl);
    // ToHitCalc quand la colonne est remplie (SKILLS_GetSpecialParamValue, paramètre 20), sinon ToHit + (niveau − 1) × LevToHit
    case 'tohit':
      return r.ToHitCalc ? calc(r.ToHitCalc, { row: r, lvl, byName }) : num(r.ToHit) + (lvl - 1) * num(r.LevToHit);
    case 'delay':
      return num(r.delay) / FPS;
  }
}

/** Champs de type `Ramp` (courbe seulement, jamais `[base, par niveau]`) */
const RAMP_FIELDS = new Set(['min', 'max', 'min2', 'max2', 'min3', 'max3', 'ar', 'wdmg', 'flat']);
/** Champs scalaires (une seule valeur, niveau 1) */
const SCALAR_FIELDS = new Set(['cooldown', 'range', 'speed']);

/** Chiffres d'une compétence selon sa spécification (champ → source) */
export function skillNumbers(spec: Record<string, NumSrc>, r: Row, byName: Map<string, Row>): Record<string, NumVal> {
  const out: Record<string, NumVal> = {};
  for (const [field, s] of Object.entries(spec)) {
    const k = s.k ?? 1;
    if (SCALAR_FIELDS.has(field)) {
      out[field] = { scalar: round(value(s, r, byName, 1) * k) };
      continue;
    }
    const v = fit(Array.from({ length: LEVELS }, (_, i) => value(s, r, byName, i + 1) * k));
    // une droite écrite en paliers égaux pour un champ de type Ramp
    out[field] = RAMP_FIELDS.has(field) && 'lin' in v ? { ramp: [v.lin[0], v.lin[1], v.lin[1], v.lin[1], v.lin[1], v.lin[1]] } : v;
  }
  return out;
}

/* ------------------------------ spécifications par classe ------------------------------ */

const mana: NumSrc = { src: 'mana' };
const emin: NumSrc = { src: 'emin' };
const emax: NumSrc = { src: 'emax' };
const elen: NumSrc = { src: 'elen' };
const delay: NumSrc = { src: 'delay' };
/** Durée d'un buff ou d'une aura (auralencalc, images) en secondes */
const auraLen: NumSrc = { col: 'auralencalc', k: K.sec };
/** Rayon (aurarangecalc, sous-cases) en unités */
const auraRange: NumSrc = { col: 'aurarangecalc', k: K.unit };

/**
 * Sorcière (lot M9b). Champs de la simulation (src/sim/skill-cast-sorc.ts, skills.ts, derive-calc.ts) : `value` = statistique principale
 * (régénération du mana de Chaleur, bonus de défense des armures, part des PV retirée par le Champ statique, absorption du Bouclier
 * d'énergie, bonus des maîtrises, secondes entre deux éclairs de la Tempête de foudre), `value2` = pénétration de la Maîtrise du froid,
 * `v3` = durée de la traînée de l'Embrasement (s), `min2` / `max2` = dégâts par seconde du sol en feu du Météore,
 * `chill` = durée du froid ou du gel (s), `count` = projectiles ou cibles, `duration` = durée du buff (s), `radius` = rayon (unités).
 */
export const SORCERESS_NUMBERS: Record<string, Record<string, NumSrc>> = {
  fire_bolt: { mana, min: emin, max: emax },
  warmth: { mana, value: { col: 'passivecalc1' } },
  charged_bolt: { mana, min: emin, max: emax, count: { col: 'calc1' } },
  ice_bolt: { mana, min: emin, max: emax, chill: elen },
  // Armure gelée : défense (%), durée, gel des attaquants au corps à corps (calc1, images)
  frozen_armor: { mana, value: { col: 'aurastatcalc1' }, duration: auraLen, chill: { col: 'calc1', k: K.sec } },
  // Inferno : coût et dégâts par seconde (jet continu : une image sur deux, « per second » de SkillDesc), portée ln12/4 sous-cases
  inferno: { mana: { src: 'mps' }, min: { src: 'emin', k: K.perSecHalf }, max: { src: 'emax', k: K.perSecHalf }, radius: { expr: 'ln12/4', k: K.unit } },
  static_field: { mana, radius: auraRange, value: { col: 'calc1' } },
  telekinesis: { mana, min: emin, max: emax },
  frost_nova: { mana, min: emin, max: emax, chill: elen },
  ice_blast: { mana, min: emin, max: emax, chill: elen },
  // Embrasement : dégâts par seconde de la traînée (missile blaze), durée (auralencalc)
  blaze: { mana, min: { src: 'emin', k: K.perSec }, max: { src: 'emax', k: K.perSec }, duration: auraLen, v3: { mis: 'blaze', src: 'range', k: K.sec } },
  // Boule de feu : rayon de l'explosion (sHitPar1 du missile fireball, sous-cases)
  fire_ball: { mana, min: emin, max: emax, radius: { mis: 'fireball', src: 'sHitPar1', k: K.unit } },
  nova: { mana, min: emin, max: emax },
  lightning: { mana, min: emin, max: emax },
  shiver_armor: { mana, min: emin, max: emax, value: { col: 'aurastatcalc1' }, duration: auraLen, chill: elen },
  // Mur de feu : dégâts par seconde, durée de la flamme (missile firewall), délai de lancer
  fire_wall: { mana, min: { src: 'emin', k: K.perSec }, max: { src: 'emax', k: K.perSec }, duration: { mis: 'firewall', src: 'range', k: K.sec }, cooldown: delay },
  enchant: { mana, min: emin, max: emax, duration: auraLen, ar: { src: 'tohit' } },
  chain_lightning: { mana, min: emin, max: emax, count: { col: 'calc1' } },
  teleport: { mana },
  glacial_spike: { mana, min: emin, max: emax, chill: { expr: 'ln34', k: K.sec }, radius: { col: 'aurarangecalc', k: K.unit } },
  // Météore : impact, rayon, sol en feu (missile meteorfire : dégâts par seconde, durée), délai de lancer
  meteor: {
    mana,
    min: emin,
    max: emax,
    radius: auraRange,
    min2: { mis: 'meteorfire', src: 'emin', k: K.perSec },
    max2: { mis: 'meteorfire', src: 'emax', k: K.perSec },
    duration: { mis: 'meteorfire', src: 'range', k: K.sec },
    cooldown: delay,
  },
  thunder_storm: { mana, min: emin, max: emax, duration: auraLen, value: { col: 'perdelay', k: K.sec } },
  energy_shield: { mana, duration: auraLen, value: { col: 'calc1' } },
  blizzard: { mana, min: emin, max: emax, chill: elen, cooldown: delay },
  chilling_armor: { mana, min: emin, max: emax, value: { col: 'aurastatcalc1' }, duration: auraLen, chill: elen },
  fire_mastery: { value: { col: 'passivecalc1' } },
  hydra: { mana, min: emin, max: emax, duration: { expr: 'ln12', k: K.sec }, cooldown: delay },
  lightning_mastery: { value: { col: 'passivecalc1' } },
  frozen_orb: { mana, min: emin, max: emax, chill: elen, cooldown: delay },
  cold_mastery: { value2: { col: 'passivecalc1' } },
};

const tohit: NumSrc = { src: 'tohit' };
const pmin: NumSrc = { src: 'pmin' };
const pmax: NumSrc = { src: 'pmax' };
const pas = (col = 'passivecalc1'): NumSrc => ({ col });

/**
 * Amazone (lot M9c). Champs de la simulation (src/sim/amazon.ts, minions.ts, weapons.ts, derive-calc.ts) : `ar` = bonus de score
 * d'attaque (%), `wdmg` = bonus de dégâts de l'arme (%), `flat` = dégâts physiques ajoutés (Flèche magique), `value` = part convertie en
 * l'élément (%, DmgCalc1 des missiles), réduction de défense de la Vision intérieure, chance des passifs (Coup critique, Esquive,
 * Évitement, Dérobade, Perforation, %), score d'attaque de la Pénétration (%), chance de perte de durabilité d'Empaler (%), vie du Leurre
 * (%), défense de la Valkyrie (%) ; `value2` = ralentissement des projectiles (Ralentir les missiles : 100 − part restante),
 * résistances du Leurre et de la Valkyrie ; `count` = flèches, cibles, éclairs ; `chill` = froid ou gel (s) ; `min` / `max` du poison :
 * dégâts au total sur `duration` (s).
 */
export const AMAZON_NUMBERS: Record<string, Record<string, NumSrc>> = {
  magic_arrow: { mana, flat: pmin, ar: tohit, value: { expr: '1+(lvl-1)*1' } },
  fire_arrow: { mana, min: emin, max: emax, ar: tohit, value: { expr: '3+(lvl-1)*2' } },
  inner_sight: { mana, radius: auraRange, value: { expr: 'edmn' }, duration: auraLen },
  critical_strike: { value: pas() },
  jab: { mana, wdmg: { col: 'calc1' }, ar: tohit },
  cold_arrow: { mana, min: emin, max: emax, chill: elen, ar: tohit, value: { expr: '3+(lvl-1)*2' } },
  multiple_shot: { mana, count: { col: 'calc1' } },
  dodge: { value: pas() },
  power_strike: { mana, min: emin, max: emax, ar: tohit },
  poison_javelin: { mana, min: { src: 'etotmin' }, max: { src: 'etotmax' }, duration: elen, cooldown: delay },
  // Flèche explosive : rayon de l'explosion (cHitPar1 du missile explodingarrow, sous-cases)
  exploding_arrow: { mana, min: emin, max: emax, ar: tohit, radius: { mis: 'explodingarrow', src: 'cHitPar1', k: K.unit } },
  slow_movement: { mana, radius: auraRange, value2: { expr: '100-ln12' }, duration: auraLen },
  avoid: { value: pas() },
  impale: { mana, wdmg: { col: 'calc1' }, ar: tohit, value: { col: 'calc2' } },
  lightning_bolt: { mana, min: emin, max: emax },
  ice_arrow: { mana, min: emin, max: emax, chill: elen, ar: tohit },
  guided_arrow: { mana, wdmg: { col: 'calc1' } },
  penetrate: { value: pas() },
  charged_strike: { mana, min: emin, max: emax, count: { col: 'calc1' } },
  plague_javelin: { mana, min: { src: 'etotmin' }, max: { src: 'etotmax' }, duration: elen, ar: tohit, cooldown: delay },
  strafe: { mana, count: { col: 'calc1' }, wdmg: { col: 'calc2' } },
  // Flèche d'immolation : explosion, sol en feu (missile immolationfire : dégâts par seconde ; rayon calc1, durée SHitCalc1)
  immolation_arrow: {
    mana,
    min: emin,
    max: emax,
    ar: tohit,
    min2: { mis: 'immolationfire', src: 'emin', k: K.perSec },
    max2: { mis: 'immolationfire', src: 'emax', k: K.perSec },
    radius: { col: 'calc1', k: K.unit },
    duration: { mis: 'immolationarrow', src: 'SHitCalc1', k: K.sec },
    cooldown: delay,
  },
  decoy: { mana, duration: { col: 'calc2', k: K.sec }, value: { col: 'calc1' }, value2: { col: 'aurastatcalc1' } },
  evade: { value: pas() },
  fend: { mana, wdmg: { col: 'calc2' }, ar: tohit, count: { col: 'calc1' } },
  freezing_arrow: { mana, min: emin, max: emax, chill: elen, ar: tohit, radius: { col: 'calc1', k: K.unit } },
  valkyrie: { mana, wdmg: { expr: 'par2*(lvl-1)' }, ar: tohit, value: { expr: '(lvl-1)*par3' }, value2: { col: 'aurastatcalc3' }, cooldown: delay },
  pierce: { value: pas() },
  lightning_strike: { mana, min: emin, max: emax, count: { col: 'calc2' }, radius: auraRange },
  lightning_fury: { mana, min: emin, max: emax, count: { col: 'calc1' } },
};

/** Maîtrise d'armes du Barbare : score d'attaque (ln12), dégâts (ln34), coup critique (dm56) */
const mastery: Record<string, NumSrc> = { ar: pas('passivecalc1'), wdmg: pas('passivecalc2'), value: pas('passivecalc3') };

/**
 * Barbare (lot M9d). Champs de la simulation (src/sim/barbarian.ts, weapons.ts, derive-calc.ts) : `wdmg` = bonus de dégâts (calc1 :
 * synergies exclues, appliquées par `synergies`), `flat` = dégâts ajoutés du Coup violent (calc2), `ar` = précision (%), `value` =
 * chance de coup critique des maîtrises, chance de trouver une potion ou un objet, bonus de défense (Cri, Concentration, Peau de fer),
 * vitesse de déplacement (Vitesse accrue), résistances (Résistance naturelle), dégâts et précision ôtés par la Provocation, défense ôtée
 * par le Cri de bataille, vie des Ordres de bataille (%), endurance (Endurance accrue, sans effet : le moteur n'a pas d'endurance) ;
 * `value2` = précision ôtée par la Provocation, mana des Ordres de bataille (%) ; `v3` = dégâts ôtés par le Cri de bataille (%),
 * vitesse d'attaque de la Frénésie ; `v4` = vitesse de déplacement de la Frénésie ; `stun` = étourdissement (s) ; `radius` = distance
 * du Bond, rayon du Fétiche sinistre (unités) ; `duration` = durée (s).
 */
export const BARBARIAN_NUMBERS: Record<string, Record<string, NumSrc>> = {
  bash: { mana, wdmg: { expr: 'ln12' }, flat: { col: 'calc2' }, ar: tohit },
  sword_mastery: mastery,
  axe_mastery: mastery,
  mace_mastery: mastery,
  howl: { mana, duration: { expr: 'ln56', k: K.sec } },
  find_potion: { mana, value: { col: 'calc1' } },
  leap: { mana, radius: auraRange },
  double_swing: { mana, ar: tohit },
  pole_arm_mastery: mastery,
  throwing_mastery: mastery,
  spear_mastery: mastery,
  taunt: { mana, value: { expr: '-ln34' }, value2: { expr: '-ln12' } },
  shout: { mana, value: { expr: 'ln12' }, duration: { expr: 'ln34', k: K.sec } },
  stun: { mana, stun: { expr: 'min(250,edln)', k: K.sec }, ar: tohit },
  double_throw: { mana, ar: tohit },
  increased_stamina: { value: pas() },
  find_item: { mana, value: { col: 'calc1' } },
  leap_attack: { mana, wdmg: { expr: 'ln34' }, ar: tohit },
  concentrate: { mana, wdmg: { expr: 'ln12' }, ar: tohit, value: { col: 'aurastatcalc1' } },
  iron_skin: { value: pas() },
  battle_cry: { mana, value: { expr: '-ln34' }, v3: { expr: '-ln56' }, duration: auraLen },
  frenzy: { mana, wdmg: { expr: 'ln12' }, ar: tohit, duration: auraLen, v3: { col: 'aurastatcalc2' }, v4: { col: 'aurastatcalc1' } },
  increased_speed: { value: pas() },
  battle_orders: { mana, value: { col: 'aurastatcalc2' }, value2: { col: 'aurastatcalc1' }, duration: { expr: 'ln12', k: K.sec } },
  grim_ward: { mana, radius: { expr: 'ln12', k: K.unit }, duration: { expr: 'ln34', k: K.sec } },
  whirlwind: { mana, wdmg: { col: 'calc1' }, ar: tohit },
  berserk: { mana, wdmg: { expr: 'ln12' }, ar: tohit, duration: { col: 'calc2', k: K.sec } },
  natural_resistance: { value: pas() },
  war_cry: { mana, min: pmin, max: { src: 'pmax' }, stun: { expr: 'min(250,ln12)', k: K.sec } },
  battle_command: { mana, duration: { expr: 'ln12', k: K.sec } },
};

/** Rayon d'une aura (aurarangecalc, sous-cases) en unités */
const auraR: NumSrc = auraRange;

/**
 * Paladin (lot M9e). Champs de la simulation (src/sim/paladin.ts, derive-calc.ts) : attaques — `wdmg`, `ar`, `value` = dégâts subis par
 * le Sacrifice (%), `value` de la Vengeance = dégâts ajoutés dans chaque élément (% de l'arme), chance de la Conversion (%), `count` =
 * coups du Zèle, Éclairs sacrés du Poing des cieux, `stun` = étourdissement du Châtiment (s), `min2` / `max2` = soin de l'Éclair sacré,
 * dégâts des Éclairs sacrés du Poing des cieux (missile fistoftheheavensbolt) ; Bouclier sacré — `value` = blocage (%), `value2` = défense
 * (%), `min` / `max` = dégâts du Châtiment ; auras — `value` = effet pour le Paladin, `value2` = pour les alliés (Fanatisme : la moitié),
 * réduction de résistance de la Conviction, `min` / `max` = dégâts de l'aura (Feu, Gel et Choc sacrés, Sanctuaire), `min2` / `max2` =
 * dégâts ajoutés aux attaques, `v3` = vitesse d'attaque du Fanatisme, vie de la Rédemption, `radius` = rayon (unités).
 */
export const PALADIN_NUMBERS: Record<string, Record<string, NumSrc>> = {
  sacrifice: { mana, wdmg: { expr: 'ln12' }, ar: tohit, value: { col: 'calc2' } },
  smite: { mana, wdmg: { col: 'calc1' }, stun: { col: 'calc2', k: K.sec } },
  might: { radius: auraR, value: { col: 'aurastatcalc1' }, value2: { col: 'aurastatcalc1' } },
  prayer: { mana, radius: auraR, value: { expr: 'edmn' } },
  resist_fire: { radius: auraR, value: { col: 'aurastatcalc1' } },
  holy_bolt: { mana, min: emin, max: emax, min2: { expr: 'ln12' }, max2: { expr: 'ln34' } },
  holy_fire: { radius: auraR, min: emin, max: emax, min2: { expr: 'edns*par5', k: 1 / 256 }, max2: { expr: 'edxs*par5', k: 1 / 256 } },
  thorns: { radius: auraR, value: { col: 'aurastatcalc1' } },
  defiance: { radius: auraR, value: { col: 'aurastatcalc1' } },
  resist_cold: { radius: auraR, value: { col: 'aurastatcalc1' } },
  zeal: { mana, ar: tohit, count: { col: 'calc1' }, wdmg: { expr: '(lvl < 5) ? 0 : ((lvl-4) * par4)' } },
  charge: { mana, wdmg: { expr: 'ln34' }, ar: tohit },
  blessed_aim: { radius: auraR, value: { col: 'aurastatcalc1' } },
  cleansing: { radius: auraR, value: { expr: 'dm34' } },
  resist_lightning: { radius: auraR, value: { col: 'aurastatcalc1' } },
  vengeance: { mana, ar: tohit, value: { expr: 'ln12' }, chill: elen },
  blessed_hammer: { mana, min: emin, max: emax },
  concentration: { radius: auraR, value: { col: 'aurastatcalc1' }, value2: { col: 'aurastatcalc1' } },
  holy_freeze: { radius: auraR, min: emin, max: emax, min2: { expr: 'edns*par5', k: 1 / 256 }, max2: { expr: 'edxs*par5', k: 1 / 256 }, value: { expr: 'dm34' } },
  vigor: { radius: auraR, value: { col: 'aurastatcalc3' } },
  conversion: { mana, value: { col: 'calc1' }, duration: auraLen },
  holy_shield: { mana, value: { col: 'aurastatcalc1' }, value2: { expr: 'ln34' }, min: pmin, max: { src: 'pmax' }, duration: auraLen },
  holy_shock: { radius: auraR, min: emin, max: emax, min2: { expr: '1' }, max2: { expr: 'edxs*par5', k: 1 / 256 } },
  sanctuary: { mana, radius: auraR, min: emin, max: emax },
  meditation: { radius: auraR, value: { col: 'aurastatcalc1' } },
  // Poing des cieux : foudre sur la cible, Éclairs sacrés (missile fistoftheheavensbolt) sur calc4 cibles au plus dans aurarangecalc
  fist_of_the_heavens: {
    mana,
    min: emin,
    max: emax,
    min2: { mis: 'fistoftheheavensbolt', src: 'emin' },
    max2: { mis: 'fistoftheheavensbolt', src: 'emax' },
    radius: auraR,
    count: { col: 'calc4' },
    cooldown: delay,
  },
  fanaticism: { radius: auraR, value: { expr: 'ln56' }, value2: { col: 'aurastatcalc3' }, v3: { col: 'aurastatcalc1' }, ar: tohit },
  conviction: { radius: auraR, value: { expr: 'dm56' }, value2: { expr: 'min(ln34,150)' } },
  redemption: { radius: auraR, value: { col: 'calc1' }, v3: { col: 'calc2' }, value2: { col: 'calc3' } },
  salvation: { radius: auraR, value: { col: 'aurastatcalc1' } },
};

/** Malédiction : durée (auralencalc) et rayon (aurarangecalc) */
const curse = (extra: Record<string, NumSrc> = {}): Record<string, NumSrc> => ({ mana, duration: auraLen, radius: auraRange, ...extra });
const poisonTotal: Record<string, NumSrc> = { min: { src: 'etotmin' }, max: { src: 'etotmax' }, duration: elen };

/**
 * Nécromancien (lot M9f). Champs de la simulation (src/sim/necromancer.ts, minions.ts, ai.ts, combat.ts) : malédictions — `duration`,
 * `radius`, `value` = dégâts subis en plus (Amplification : résistance physique ôtée), dégâts ôtés (Affaiblissement), dégâts renvoyés
 * (Vierge de fer, %), vol de vie (Connexion vitale, %), résistances ôtées (Résistance amoindrie) ; Décrépitude : `value` (résistance
 * physique), `value2` (déplacement), `v3` (cadence) ; `value` / `value2` = absorption de l'Armure d'os, part de la vie du cadavre (Explosion
 * de cadavre, %), vie et dégâts ajoutés par la Maîtrise des squelettes, vie (%) et vitesse (%) de la Maîtrise des golems (`v3` : score
 * d'attaque), résistances de la Résistance des invocations ; poison : `min` / `max` au total sur `duration` ; `count` = dents, squelettes,
 * mages, morts ressuscités (petmax).
 */
export const NECROMANCER_NUMBERS: Record<string, Record<string, NumSrc>> = {
  amplify_damage: curse({ value: { expr: 'par5' } }),
  teeth: { mana, min: emin, max: emax, count: { col: 'calc1' } },
  bone_armor: { mana, value: { expr: 'ln12' } },
  skeleton_mastery: { value: { expr: 'lvl*par1' }, value2: { expr: 'lvl*par2' } },
  raise_skeleton: { mana, count: { col: 'petmax' } },
  dim_vision: curse(),
  weaken: curse({ value: { expr: 'par5' } }),
  poison_dagger: { mana, ...poisonTotal, ar: tohit },
  corpse_explosion: { mana, radius: auraRange, value: { col: 'calc1' }, value2: { col: 'calc2' } },
  clay_golem: { mana },
  iron_maiden: curse({ value: { col: 'calc1' } }),
  terror: curse(),
  bone_wall: { mana, duration: { expr: 'par2', k: K.sec } },
  golem_mastery: { value: { expr: 'lvl*par1' }, value2: { expr: 'dm34' }, v3: { expr: 'ln56' } },
  skeletal_mage: { mana, count: { col: 'petmax' } },
  confuse: curse(),
  life_tap: curse({ value: { col: 'calc1' } }),
  poison_explosion: { mana, ...poisonTotal },
  bone_spear: { mana, min: emin, max: emax },
  blood_golem: { mana },
  attract: curse(),
  decrepify: curse({ value: { expr: '-par5' }, value2: { expr: '-par5' }, v3: { expr: '-par5' } }),
  bone_prison: { mana, duration: { expr: 'par2', k: K.sec } },
  summon_resist: { value: pas() },
  iron_golem: { mana },
  lower_resist: curse({ value: { expr: 'dm56' } }),
  poison_nova: { mana, ...poisonTotal },
  bone_spirit: { mana, min: emin, max: emax },
  fire_golem: { mana },
  revive: { mana, count: { col: 'petmax' }, duration: { col: 'calc2', k: K.sec } },
};

/**
 * Druide (lot M9g). Champs de la simulation (src/sim/druid.ts, derive-calc.ts) : élémentaire — `min` / `max` (et `min2` / `max2` : second
 * élément du Rocher en fusion, du Volcan et de l'Armageddon), Tempête de feu et Souffle arctique par seconde dans les flammes / le jet,
 * `count` = langues de feu, trombes, `radius`, `duration`, `chill`, `stun` ; Armure cyclone : `value` = absorption ; Rocher en fusion :
 * `value` = chances de repousser (%) ; métamorphose — loup-garou : `value` = vie (%), `value2` = vitesse d'attaque, `v3` = score
 * d'attaque (%) ; ours-garou : `value` = dégâts (%), `value2` = défense (%), `v3` = vie (%) ; Lycanthropie : `value` = vie des formes
 * (%) ; Rage sauvage, Mutilation, Furie : `value` = dégâts (%), `count` = charges / coups, `value2` = vol de vie par charge ; Faim :
 * `value` = dégâts (%), `value2` / `v3` = vol de vie / de mana (%) ; invocations — `count` = petmax, `value` = coups des corbeaux, score
 * d'attaque des loups spirituels, vie des loups redoutables (%), vie (%) du Sage du chêne, dégâts (%) du Cœur du glouton (`value2` :
 * score d'attaque), dégâts renvoyés (%) des Ronces, part de la vie / du mana rendue par cadavre (lianes).
 */
export const DRUID_NUMBERS: Record<string, Record<string, NumSrc>> = {
  raven: { mana, min: pmin, max: pmax, count: { col: 'petmax' }, value: { expr: 'ln56' } },
  plague_poppy: { mana, ...poisonTotal },
  werewolf: { mana, value: { expr: 'par2' }, value2: { expr: 'dm34' }, v3: tohit },
  shape_shifting: { value: { expr: 'ln34' } },
  firestorm: { mana, min: { src: 'emin', k: K.perSec }, max: { src: 'emax', k: K.perSec }, count: { col: 'calc1' }, cooldown: delay },
  oak_sage: { mana, value: { expr: 'ln12' } },
  spirit_wolf: { mana, min: pmin, max: pmax, count: { col: 'petmax' }, value: { expr: 'ln12' } },
  werebear: { mana, value: { expr: 'ln12' }, value2: { expr: 'ln34' }, v3: { expr: 'par5' } },
  molten_boulder: { mana, min: pmin, max: pmax, min2: emin, max2: emax, radius: auraRange, value: { expr: '100' }, cooldown: delay },
  arctic_blast: { mana: { src: 'mps' }, min: { src: 'emin', k: K.perSec }, max: { src: 'emax', k: K.perSec }, chill: elen, radius: { expr: 'ln12/4', k: K.unit } },
  cycle_of_life: { mana, value: { expr: 'dm56' } },
  feral_rage: { mana, value: { expr: 'ln56' }, value2: { expr: '(par2*lvl+8)/(lvl/par7+par8)' }, count: { col: 'calc2' }, duration: auraLen, ar: tohit },
  maul: { mana, value: { expr: 'par3' }, count: { col: 'calc2' }, duration: { expr: 'par4', k: K.sec }, stun: { expr: 'dm56', k: K.sec }, ar: tohit },
  eruption: { mana, min: emin, max: emax, cooldown: delay },
  cyclone_armor: { mana, value: { expr: 'ln12' } },
  heart_wolverine: { mana, value: { expr: 'ln56' }, value2: { expr: 'ln34' } },
  summon_fenris: { mana, min: pmin, max: pmax, count: { col: 'petmax' }, value: { expr: 'ln12' } },
  rabies: { mana, ...poisonTotal, ar: tohit },
  fire_claws: { mana, min: emin, max: emax, ar: tohit },
  twister: { mana, min: pmin, max: pmax, count: { col: 'calc1' }, stun: { expr: 'par2', k: K.sec } },
  vines: { mana, value: { expr: 'dm56' } },
  hunger: { mana, value: { expr: 'par5' }, value2: { expr: 'dm12' }, v3: { expr: 'dm34' }, ar: tohit },
  shock_wave: { mana, min: pmin, max: pmax, stun: { expr: 'ln12', k: K.sec } },
  volcano: { mana, min: pmin, max: pmax, min2: emin, max2: emax, radius: auraRange, cooldown: delay },
  tornado: { mana, min: pmin, max: pmax },
  spirit_barbs: { mana, value: { expr: 'ln34' } },
  grizzly: { mana, min: pmin, max: pmax },
  fury: { mana, value: { expr: 'ln34' }, count: { col: 'calc1' }, ar: tohit },
  armageddon: { mana, min: emin, max: emax, min2: pmin, max2: { src: 'pmax' }, radius: auraRange, duration: auraLen, cooldown: delay },
  hurricane: { mana, min: emin, max: emax, radius: auraRange, duration: auraLen, chill: elen, cooldown: delay },
};

/**
 * Assassin (lot M9h). Champs de la simulation (src/sim/assassin.ts, derive-calc.ts, minions.ts) : attaques à charges — `ar`, `wdmg`
 * (Frappe du tigre : bonus par charge), `min` / `max` (élément de la première charge ; les charges 2 et 3, `min2` à `max3`, viennent des
 * projectiles et restent ceux du fichier de classe), `value` = vol de vie et de mana (Frappe du cobra), `duration` = durée des charges ;
 * finitions — `wdmg`, `ar`, `count` = coups de pied (Serre du dragon), `value` = dégâts de feu de l'explosion (Queue du dragon, %),
 * `radius` ; disciplines — Rapidité : `value` = vitesse d'attaque, `value2` = de déplacement ; Évanescence : `value` = résistances,
 * `v3` = résistance aux malédictions, `value2` = réduction des dégâts ; Cape d'ombre : `value` = défense, `value2` = défense ôtée,
 * `radius`, `duration` ; Souffle mental : `radius`, `stun` ; guerrières de l'ombre : `ar` (score fixe par niveau), `value` = défense
 * (%), résistances (Maître) ; pièges — `min` / `max` (Sentinelle d'enfer par seconde), `count` = pointes du Champ de choc, `duration`.
 */
export const ASSASSIN_NUMBERS: Record<string, Record<string, NumSrc>> = {
  fire_blast: { mana, min: emin, max: emax },
  claw_mastery: { ar: pas('passivecalc1'), wdmg: pas('passivecalc2'), value: pas('passivecalc3') },
  psychic_hammer: { mana, min: emin, max: emax },
  tiger_strike: { mana, ar: tohit, wdmg: { col: 'calc1' }, duration: auraLen },
  dragon_talon: { mana, count: { col: 'calc1' }, wdmg: { expr: 'ln12' }, ar: tohit },
  shock_web: { mana, min: emin, max: emax, count: { expr: 'par1+lvl/par2' } },
  blade_sentinel: { mana, min: pmin, max: pmax, duration: { col: 'calc4', k: K.sec }, cooldown: delay },
  burst_of_speed: { mana, value: { expr: 'dm34' }, value2: { expr: 'dm12' }, duration: auraLen },
  fists_of_fire: { mana, ar: tohit, min: emin, max: emax, min3: emin, max3: emax, duration: auraLen },
  dragon_claw: { mana, wdmg: { expr: 'ln12' }, ar: tohit },
  charged_bolt_sentry: { mana, min: emin, max: emax },
  wake_of_fire: { mana, min: emin, max: emax },
  weapon_block: { value: pas() },
  cloak_of_shadows: { mana, duration: { expr: 'ln34', k: K.sec }, radius: { expr: 'dm12', k: K.unit }, value: { col: 'passivecalc1' }, value2: { expr: 'min(ln56,95)' } },
  cobra_strike: { mana, ar: tohit, value: { expr: 'ln12' }, duration: auraLen },
  blade_fury: { mana, min: pmin, max: pmax },
  fade: { mana, value: { expr: 'dm12' }, v3: { expr: 'dm34' }, value2: { expr: 'ln78' }, duration: auraLen },
  shadow_warrior: { mana, ar: { expr: 'lvl*par2' }, value: { expr: 'lvl*par3' }, cooldown: delay },
  claws_of_thunder: { mana, ar: tohit, min: emin, max: emax, duration: auraLen },
  dragon_tail: { mana, value: { col: 'calc1' }, ar: tohit, radius: auraRange },
  lightning_sentry: { mana, min: emin, max: emax },
  wake_of_inferno: { mana, min: { src: 'emin', k: K.perSec }, max: { src: 'emax', k: K.perSec } },
  mind_blast: { mana, min: pmin, max: pmax, stun: elen, radius: auraRange },
  blades_of_ice: { mana, ar: tohit, min: emin, max: emax, min2: emin, max2: emax, min3: emin, max3: emax, chill: elen, duration: auraLen },
  dragon_flight: { mana, wdmg: { expr: 'ln12' }, ar: tohit, cooldown: delay },
  death_sentry: { mana, min: emin, max: emax },
  blade_shield: { mana, min: pmin, max: pmax, duration: auraLen, radius: auraRange },
  venom: { mana, min: { src: 'etotmin' }, max: { src: 'etotmax' }, duration: auraLen },
  shadow_master: { mana, ar: { expr: 'lvl*par2' }, value: { col: 'passivecalc1' }, cooldown: delay },
  phoenix_strike: { mana, ar: tohit, duration: auraLen },
};

/** Spécifications de toutes les classes faites (les autres gardent les chiffres de leur fichier de classe) */
export const VANILLA_NUMBERS: Record<string, Record<string, NumSrc>> = {
  ...SORCERESS_NUMBERS,
  ...AMAZON_NUMBERS,
  ...BARBARIAN_NUMBERS,
  ...PALADIN_NUMBERS,
  ...NECROMANCER_NUMBERS,
  ...DRUID_NUMBERS,
  ...ASSASSIN_NUMBERS,
};
