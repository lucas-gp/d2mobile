/**
 * Calcul des statistiques dérivées du personnage, découpé en étapes : l'équipement, les compétences passives
 * et les effets actifs de chaque classe y ajoutent leur part dans un état cumulé (`DeriveState`) que
 * `computeDerived` (character.ts) assemble. L'ordre des étapes est celui du calcul d'origine : les cumuls
 * en virgule flottante doivent rester dans le même ordre.
 */
import type { Difficulty } from '../data/types';
import type { ItemBase } from '../data/types';
import { type Element, type StatMap, addStat, mergeStats } from '../data/stats';
import { TREE_CLASS, TREE_STAT, classOf, classOnlyList } from '../data/classes';
import { RES_PENALTY } from '../data/curves';
import { RULES } from '../mods/rules';
import { SKILLS, SKILL_BY_ID, lin, skillHard, ramp, synergyPct } from '../data/skills';
import { animA, animCat, WSM_BY_BASE } from '../data/attack-anim';
import { shrineStats } from '../data/shrines';
import type { DerivedStats } from './derived';
import type { Item } from './item';
import { baseOf, itemFinal, setBonuses } from './itemstats';
import type { PlayerBuff } from './actors';
import type { CharacterState } from './character-state';

/** Comportements du Druide du jeu de règles (règle skills.druid : D2, src/mods/d2/skills.ts ; un mod peut les remplacer) */
const druid = (): ReturnType<(typeof RULES)['skills.druid']> => RULES['skills.druid']();
/** Niveau effectif d'une compétence : points durs + bonus d'équipement (seulement si au moins 1 point dur, sauf oskills) */
export function effectiveSkillLevel(c: CharacterState, all: StatMap, id: string): number {
  const hard = c.skills[id] ?? 0;
  const s = SKILL_BY_ID[id];
  // « +X à une compétence (classe uniquement) » des objets (staffmods D2) : comme oskill, pour la classe de la compétence seulement
  const oskill = (all.get(`sk:${id}`) ?? 0) + (s && TREE_CLASS[s.tree] === c.classId ? (all.get(`csk:${id}`) ?? 0) : 0);
  if (!s) return hard + oskill;
  if (hard <= 0) return oskill;
  return hard + oskill + (all.get('allSkills') ?? 0) + (all.get(classOf(c.classId).classStat) ?? 0) + (all.get(TREE_STAT[s.tree]) ?? 0);
}

/** Valeurs cumulées pendant le calcul des statistiques dérivées (chaque étape y ajoute sa part) */
export interface DeriveState {
  manaRegenPct: number;
  arPct: number;
  elemDmgPct: Record<Element, number>;
  pierce: Record<Element, number>;
  conviction: number;
  convictionRadius: number;
  lifePctDruid: number;
  arPctDruid: number;
  iasDruid: number;
  iasAsItem: number;
  defPctDruid: number;
  meleeDmgPct: number;
  leechDruid: number;
  frwDruid: number;
  drDruid: number;
  fhrSkill: number;
  lifeSkill: number;
  uninterruptDruid: number;
  petDmgPct: number;
  petArPct: number;
  resExtra: Record<Element, number>;
  maxResExtra: Record<Element, number>;
  auraAdded: DerivedStats['addedDmg'];
  dodgeMelee: number;
  dodgeMissile: number;
  dodgeAny: number;
  weaponBlock: number;
  curseReduce: number;
  poisonReduce: number;
  convictionDef: number;
  uninterrupt: number;
  blockAdd: number;
  concDmgPct: number;
  arFlatSkill: number;
  salvation: number;
  meditation: number;
}

/** Données en lecture seule et aides communes aux étapes du calcul */
export interface DeriveCtx {
  c: CharacterState;
  buffs: PlayerBuff[];
  all: StatMap;
  str: number;
  dex: number;
  vit: number;
  ene: number;
  hard: Record<string, number>;
  skillLevels: Record<string, number>;
  mhBase: ItemBase | null;
  offClaws: boolean;
  block: number;
  form: DerivedStats['form'];
  formBuff: PlayerBuff | undefined;
  playerAura: PlayerBuff | undefined;
  buffLvl: (id: string) => number;
  auraLvl: (id: string) => number;
  ownAura: (id: string) => number;
  allyAura: (id: string) => number;
  nv: (id: string, key: 'value' | 'value2' | 'v3' | 'v4' | 'ar', lv: number) => number;
  sk: (id: string) => number;
  hp: (id: string) => number;
  offensive: (id: string) => { self: number; ally: number };
}

/** Objet porté et agrégats de l'équipement */
export interface EquipmentTotals {
  all: StatMap;
  weaponDmg: [number, number];
  offDmg: [number, number] | null;
  missileDmg: [number, number] | null;
  itemDefense: number;
  block: number;
}

/** Cumule les statistiques des objets actifs (arme en main, bouclier, défense, blocage) */
export function collectEquipment(c: CharacterState, equipped: Item[]): EquipmentTotals {
  const all: StatMap = new Map();
  let weaponDmg: [number, number] = [1, 2];
  let offDmg: [number, number] | null = null;
  let missileDmg: [number, number] | null = null;
  let itemDefense = 0;
  let block = 0;
  // Deux passes : les prérequis de force/dex dépendent des bonus des autres objets (D2 : on vérifie à l'équipement)
  for (const it of equipped) {
    const f = itemFinal(it, c.level);
    mergeStats(all, f.stats);
    if (f.defense) itemDefense += f.defense;
    if (f.block) block += f.block;
    const b = baseOf(it);
    if (b.dmg && f.dmg && c.equipment.mainhand === it) {
      weaponDmg = f.dmg;
      if (f.mdmg) missileDmg = f.mdmg;
    }
    if (b.dmg && f.dmg && c.equipment.offhand === it) offDmg = f.dmg;
  }
  return { all, weaponDmg, offDmg, missileDmg, itemDefense, block };
}

/** Animations d'attaque, type d'arme de récupération et arme en main des objets actifs */
export function attackProfile(c: CharacterState, equipped: Item[]): { atkSets: { A: number; wsm: number }[]; mhBase: ItemBase | null; recWeapon: '1h' | 'spearstaff' | 'other' } {
  // animation d'attaque : mêmes règles D2 (main droite, main gauche si arme ; mains nues = animation 1 main)
  const atkSets: { A: number; wsm: number }[] = [];
  for (const it of [c.equipment.mainhand, c.equipment.offhand]) {
    const b = it && equipped.includes(it) ? baseOf(it) : null;
    if (b?.dmg) atkSets.push({ A: animA(c.classId, animCat(b)), wsm: WSM_BY_BASE[b.id] ?? 0 });
  }
  if (!atkSets.length) atkSets.push({ A: animA(c.classId, 'swing1'), wsm: 0 });
  const mhBase = c.equipment.mainhand && equipped.includes(c.equipment.mainhand) ? baseOf(c.equipment.mainhand) : null;
  const recWeapon: '1h' | 'spearstaff' | 'other' = !mhBase?.dmg ? '1h' : mhBase.type === 'spear' || mhBase.type === 'staff' ? 'spearstaff' : animCat(mhBase) === 'swing1' ? '1h' : 'other';
  return { atkSets, mhBase, recWeapon };
}

/** Bonus de panoplie : statistiques globales, dégâts de l'arme et défense locaux */
export function applySetBonuses(c: CharacterState, equipped: Item[], all: StatMap, eq: EquipmentTotals): void {
  const sb = setBonuses(equipped, c.level);
  mergeStats(all, sb.stats);
  // bonus de set locaux : dégâts de l'arme en main et défense de l'équipement
  const sl = sb.local;
  // dégâts améliorés / min / max portés hors de l'arme (bijoux, charmes, joyaux d'armure : itemFinal les rend globaux)
  sl.edPct += all.get('edPct') ?? 0;
  sl.minDmg += all.get('minDmg') ?? 0;
  sl.maxDmg += all.get('maxDmg') ?? 0;
  if (sl.edPct || sl.minDmg || sl.maxDmg) eq.weaponDmg = [Math.floor(eq.weaponDmg[0] * (1 + sl.edPct / 100) + sl.minDmg), Math.floor(eq.weaponDmg[1] * (1 + sl.edPct / 100) + sl.maxDmg)];
  if (sl.defPct || sl.defFlat) eq.itemDefense = Math.floor(eq.itemDefense * (1 + sl.defPct / 100) + sl.defFlat);
}

/** Les deux mains tiennent une griffe (parade d'arme de l'Assassin) */
export function wieldsTwoClaws(c: CharacterState): boolean {
  return !!c.equipment.offhand && baseOf(c.equipment.offhand).type === 'claw' && !!c.equipment.mainhand && baseOf(c.equipment.mainhand).type === 'claw';
}

/** Bonus fixes du personnage et sanctuaires actifs */
export function applyBonusesAndShrines(c: CharacterState, buffs: PlayerBuff[], all: StatMap): void {
  for (const [k, v] of Object.entries(c.bonuses)) addStat(all, k, v);
  // sanctuaires actifs (shrines.txt) : résistances, compétences, expérience, toucher… ; défense et dégâts en % plus bas
  for (const [k, v] of shrineStats(buffs.map((b) => b.id))) addStat(all, k, v);
}

/** Caractéristiques finales : base + objets + « toutes les caractéristiques » */
export function attributesOf(c: CharacterState, all: StatMap): { str: number; dex: number; vit: number; ene: number } {
  const allAttr = all.get('allAttr') ?? 0;
  const str = c.base.str + (all.get('str') ?? 0) + allAttr;
  const dex = c.base.dex + (all.get('dex') ?? 0) + allAttr;
  const vit = c.base.vit + (all.get('vit') ?? 0) + allAttr;
  const ene = c.base.ene + (all.get('ene') ?? 0) + allAttr;
  return { str, dex, vit, ene };
}

/** Bonus de dégâts de l'arme selon la Force et la Dextérité (colonnes StrBonus / DexBonus de weapons.txt : arcs 100 % Dex, javelots et armes de jet 75 / 75, griffes 75 / 75…) */
export function weaponAttrBonus(it: Item | undefined, str: number, dex: number): number {
  const b = it ? baseOf(it) : null;
  const amazon = !!b && classOnlyList(b).includes('amazon');
  const [sb, db] = !b
    ? [100, 0]
    : b.type === 'bow' || b.type === 'crossbow'
      ? [0, 100]
      : b.type === 'javelin'
        ? amazon
          ? [80, 50]
          : [75, 75]
        : b.type === 'spear' && amazon
          ? [80, 50]
          : b.type === 'claw' || b.type === 'thrown'
            ? [75, 75]
            : [100, 0];
  return (Math.floor(str * sb) + Math.floor(dex * db)) / 10000;
}

/** Niveaux effectifs des compétences (points durs + objets + Commandement de bataille) */
export function effectiveSkillLevels(c: CharacterState, all: StatMap, buffs: PlayerBuff[]): { skillLevels: Record<string, number>; hard: Record<string, number> } {
  const skillLevels: Record<string, number> = {};
  for (const s of SKILLS) skillLevels[s.id] = effectiveSkillLevel(c, all, s.id);
  const hard = { ...c.skills };
  // Commandement de bataille : compétences en plus (règle skills.barbarian : D2 +1 ; mod : +1 de plus tous les 10 points investis)
  const bcBonus = buffs.some((b) => b.id === 'battle_command') ? RULES['skills.barbarian']().battleCommandSkills(hard.battle_command ?? 0) : 0;
  if (bcBonus > 0) for (const s2 of SKILLS) if ((hard[s2.id] ?? 0) > 0) skillLevels[s2.id] += bcBonus;
  return { skillLevels, hard };
}

/** État initial : régénération de mana, score d'attaque, dégâts élémentaires, pénétration et Conviction de l'équipement */
export function initialState(all: StatMap, buffs: PlayerBuff[], skillLevels: Record<string, number>, hard: Record<string, number>, pierceAll: number): DeriveState {
  // passifs de la Sorcière (valeurs PD2 S13)
  const manaRegenPct = (all.get('manaRegenPct') ?? 0) + (skillLevels['warmth'] > 0 ? lin(SKILL_BY_ID.warmth.n.value, skillLevels['warmth']) : 0);
  const arPct = skillLevels['warmth'] > 0 ? lin(SKILL_BY_ID.warmth.n.value2, skillLevels['warmth']) : 0;
  const elemDmgPct: Record<Element, number> = {
    phys: 0,
    fire: all.get('fireDmgPct') ?? 0,
    cold: all.get('coldDmgPct') ?? 0,
    light: all.get('lightDmgPct') ?? 0,
    poison: all.get('poisonDmgPct') ?? 0,
    magic: all.get('magicDmgPct') ?? 0,
  };
  const spell = all.get('spellDmgPct') ?? 0;
  elemDmgPct.fire += spell;
  elemDmgPct.cold += spell;
  elemDmgPct.light += spell;
  const pierce: Record<Element, number> = {
    // PD2 : Pénétration abaisse la résistance physique de l'ennemi (−1 % tous les 2 points investis, 10 % au plus)
    phys: (all.get('piercePhys') ?? 0) + Math.abs(skillHard('penetrate', 'Physical Resistance Pierce %', hard['penetrate'] ?? 0)),
    fire: (all.get('pierceFire') ?? 0) + pierceAll,
    cold: (all.get('pierceCold') ?? 0) + pierceAll,
    light: (all.get('pierceLight') ?? 0) + pierceAll,
    poison: pierceAll + (all.get('piercePoison') ?? 0),
    magic: 0,
  };
  // réduction des résistances par les Maîtrises : règle skills.sorceress (D2 : passive_cold_pierce de la Maîtrise du froid)
  const sorc = RULES['skills.sorceress']();
  const fm = skillLevels['fire_mastery'] ?? 0;
  if (fm > 0) {
    elemDmgPct.fire += lin(SKILL_BY_ID.fire_mastery.n.value, fm);
    pierce.fire += sorc.masteryPierce('fire', fm, SKILL_BY_ID.fire_mastery.n.value2);
  }
  const cm = skillLevels['cold_mastery'] ?? 0;
  if (cm > 0) {
    elemDmgPct.cold += lin(SKILL_BY_ID.cold_mastery.n.value, cm);
    pierce.cold += sorc.masteryPierce('cold', cm, SKILL_BY_ID.cold_mastery.n.value2);
  }
  const lm = skillLevels['lightning_mastery'] ?? 0;
  if (lm > 0) elemDmgPct.light += lin(SKILL_BY_ID.lightning_mastery.n.value, lm);
  /** Réductions de résistance (cassent les immunités à ½ en PD2) : Conviction */
  let conviction = 0;
  // Conviction (Infini) : -res ennemies
  const conv = Math.max(all.get('auraConviction') ?? 0, Math.max(all.get('itemAura:conviction') ?? 0, buffs.find((b) => b.id === 'aura_conviction')?.level ?? 0));
  if (conv > 0) conviction = Math.min(150, lin(SKILL_BY_ID.conviction.n.value2, conv));
  const convictionRadius = conv > 0 ? lin(SKILL_BY_ID.conviction.n.radius, conv) : 0;
  return {
    manaRegenPct,
    arPct,
    elemDmgPct,
    pierce,
    conviction,
    convictionRadius,
    lifePctDruid: 0,
    arPctDruid: 0,
    iasDruid: 0,
    iasAsItem: 0,
    defPctDruid: 0,
    meleeDmgPct: 0,
    leechDruid: 0,
    frwDruid: 0,
    drDruid: 0,
    fhrSkill: 0,
    lifeSkill: 0,
    uninterruptDruid: 0,
    petDmgPct: 0,
    petArPct: 0,
    resExtra: { phys: 0, fire: 0, cold: 0, light: 0, poison: 0, magic: 0 },
    maxResExtra: { phys: 0, fire: 0, cold: 0, light: 0, poison: 0, magic: 0 },
    auraAdded: {},
    dodgeMelee: 0,
    dodgeMissile: 0,
    dodgeAny: 0,
    weaponBlock: 0,
    // durée des malédictions réduite (artisanat Vampirique PD2) ; les auras Purification et Évanouissement s'y ajoutent
    curseReduce: all.get('curseLength') ?? 0,
    poisonReduce: 0,
    convictionDef: 0,
    uninterrupt: 0,
    blockAdd: 0,
    concDmgPct: 0,
    arFlatSkill: 0,
    salvation: 0,
    meditation: 0,
  };
}

/** Druide : formes animales, Embrasement, Faim, Sage du chêne, Cœur du glouton, Esprit des ronces */
export function applyDruidBuffs(x: DeriveCtx, st: DeriveState): void {
  const { c, buffs, all, hard, skillLevels, buffLvl, form, formBuff } = x;
  // Druide : formes animales (Lycanthropie), esprits (Sage du chêne, Cœur du glouton, Ronces), Rage sauvage
  if (formBuff && (form === 'werewolf' || form === 'werebear')) {
    // bonus de la forme et de la Lycanthropie : règle skills.druid (D2 : SkillDruid.cpp ; un mod peut les remplacer)
    const b = druid().form(form, formBuff.level, skillLevels['shape_shifting'] ?? 0, (id, f, L) => lin(SKILL_BY_ID[id]?.n[f as 'value'], L));
    st.lifePctDruid += b.lifePct;
    st.arPctDruid += b.arPct;
    st.meleeDmgPct += b.meleeDmgPct;
    st.iasDruid += b.ias;
    st.defPctDruid += b.defPct;
    if (form === 'werewolf') {
      all.set('drFlat', (all.get('drFlat') ?? 0) + b.drFlat);
      all.set('mdr', (all.get('mdr') ?? 0) + b.mdr);
    } else {
      st.uninterruptDruid += b.uninterrupt;
      all.set('splashRadius', (all.get('splashRadius') ?? 0) + b.splash);
    }
  }
  // Embrasement (PD2 S13) : vitesse de déplacement pendant l'effet
  const blazeB = buffs.find((b) => b.id === 'blaze');
  if (blazeB) st.frwDruid += lin(SKILL_BY_ID.blaze.n.value, blazeB.level);
  // Faim (PD2) : après avoir dévoré un cadavre, vitesse, vol de vie et blessures ouvertes
  const hungerB = buffs.find((b) => b.id === 'hunger');
  if (hungerB) {
    st.frwDruid += lin(SKILL_BY_ID.hunger.n.value2, hungerB.level);
    st.leechDruid += skillHard('hunger', 'Life Steal +%', c.skills.hunger ?? 0);
    all.set('openWounds', (all.get('openWounds') ?? 0) + lin(SKILL_BY_ID.hunger.n.value, hungerB.level));
    // dégâts des blessures ouvertes (table), +20 % par point dur de Mutilation
    all.set('openWoundsDps', (all.get('openWoundsDps') ?? 0) + lin(SKILL_BY_ID.hunger.n.v3, hungerB.level) * (1 + 0.2 * (hard.maul ?? 0)));
  }
  // Sage du chêne : vie maximale (D2 : %), vie fixe et régénération (mod) : règle skills.druid
  const oak = buffLvl('oak_sage');
  if (oak > 0) {
    const o = druid().oakSage(lin(SKILL_BY_ID.oak_sage.n.value, oak), lin(SKILL_BY_ID.oak_sage.n.value2, oak), hard);
    st.lifePctDruid += o.lifePct;
    st.lifeSkill += o.life;
    all.set('lifeRegen', (all.get('lifeRegen') ?? 0) + o.regen);
  }
  const how = buffLvl('heart_wolverine');
  st.petDmgPct = how > 0 ? lin(SKILL_BY_ID.heart_wolverine.n.value, how) : 0;
  st.petArPct = how > 0 ? lin(SKILL_BY_ID.heart_wolverine.n.value2, how) : 0;
  st.meleeDmgPct += st.petDmgPct;
  st.arPctDruid += st.petArPct;
  const barbs = buffLvl('spirit_barbs');
  // Esprit des ronces : dégâts renvoyés (D2 : % des coups reçus ; mod : fixes) et frappe mortelle : règle skills.druid
  if (barbs > 0) {
    const r = druid().barbs(lin(SKILL_BY_ID.spirit_barbs.n.value, barbs), lin(SKILL_BY_ID.spirit_barbs.n.value2, barbs), hard, hard.spirit_barbs ?? 0);
    if (r.thornsPct) all.set('thornsPct', (all.get('thornsPct') ?? 0) + r.thornsPct);
    else {
      all.set('thornsFlat', (all.get('thornsFlat') ?? 0) + r.thornsFlat);
      all.set('deadlyStrike', (all.get('deadlyStrike') ?? 0) + r.deadly);
      all.set('maxDeadly', (all.get('maxDeadly') ?? 0) + r.maxDeadly);
    }
  }
}

/** Aides de lecture des niveaux d'aura et de compétence (aura du joueur, de ses objets, du mercenaire) */
export function makeHelpers(buffs: PlayerBuff[], all: StatMap, hard: Record<string, number>, skillLevels: Record<string, number>) {
  const buffLvl = (id: string): number => buffs.find((b) => b.id === id)?.level ?? 0;
  // Auras : celle du mercenaire (maura_), celle du Paladin (aura_) et celles des objets du joueur
  // (D2 : elles profitent à tout le groupe). Valeurs : tables D2 des compétences de Paladin.
  const playerAura = buffs.find((b) => b.id.startsWith('aura_'));
  const auraLvl = (id: string): number =>
    Math.max(all.get(`itemAura:${id}`) ?? 0, buffLvl(`maura_${id}`), playerAura && playerAura.id === `aura_${id}` ? Math.max(1, skillLevels[id] ?? playerAura.level) : 0);
  const nv = (id: string, key: 'value' | 'value2' | 'v3' | 'v4' | 'ar', lv: number): number => lin(SKILL_BY_ID[id].n[key], lv);
  const sk = (id: string): number => skillLevels[id] ?? 0;
  // PD2 : une aura active donne au porteur (Paladin, ou objet du joueur) la valeur « Your Damage » et
  // aux alliés la valeur « Ally Damage » (environ la moitié) ; l'aura d'un mercenaire compte comme alliée.
  // Les auras défensives ont en plus un effet passif selon les points investis (tables « Hard Level »).
  const ownAura = (id: string): number => Math.max(all.get(`itemAura:${id}`) ?? 0, playerAura && playerAura.id === `aura_${id}` ? Math.max(1, skillLevels[id] ?? playerAura.level) : 0);
  const allyAura = (id: string): number => buffLvl(`maura_${id}`);
  const hp = (id: string): number => hard[id] ?? 0;
  const offensive = (id: string): { self: number; ally: number } => {
    const o = ownAura(id);
    const a = allyAura(id);
    return { self: o > 0 ? nv(id, 'value', o) : a > 0 ? nv(id, 'value2', a) : 0, ally: o > 0 ? nv(id, 'value2', o) : 0 };
  };
  return { buffLvl, playerAura, auraLvl, nv, sk, ownAura, allyAura, hp, offensive };
}

/** Auras de Paladin, d'objets et de mercenaire : dégâts, défense, résistances, vitesses, régénération */
export function applyAuras(x: DeriveCtx, st: DeriveState): void {
  const { c, all, auraLvl, ownAura, nv, hp, offensive } = x;
  st.uninterrupt = st.uninterruptDruid;
  const might = offensive('might');
  st.meleeDmgPct += might.self;
  st.petDmgPct += might.ally || might.self;
  const conc = Math.max(all.get('auraConcentration') ?? 0, auraLvl('concentration'));
  st.concDmgPct = 0;
  if (conc > 0) {
    const c2 = offensive('concentration');
    st.meleeDmgPct += c2.self || nv('concentration', 'value', conc);
    st.petDmgPct += c2.ally || nv('concentration', 'value2', conc);
    // Marteau béni : bonus propre de la Concentration (moitié de « Your Damage »)
    st.concDmgPct = nv('concentration', 'v3', conc);
    // PD2 : « Attack Rating +% » de la table de la Concentration
    st.arPctDruid += nv('concentration', 'ar', conc);
    st.uninterrupt += 20;
  }
  if (auraLvl('defiance') > 0) {
    st.defPctDruid += nv('defiance', 'value', auraLvl('defiance'));
    st.drDruid += nv('defiance', 'value2', auraLvl('defiance'));
  }
  if (auraLvl('blessed_aim') > 0) {
    st.arPctDruid += nv('blessed_aim', 'value', auraLvl('blessed_aim'));
    all.set('deadlyStrike', (all.get('deadlyStrike') ?? 0) + nv('blessed_aim', 'value2', auraLvl('blessed_aim')));
  }
  if (hp('blessed_aim') > 0) {
    all.set('reduceDef', (all.get('reduceDef') ?? 0) - skillHard('blessed_aim', 'Passive Enemy Defense %', hp('blessed_aim')));
    // score d'attaque passif : règle skills.paladin (D2 : +5 % par point dur)
    st.arPctDruid += RULES['skills.paladin']().blessedAimPassive(hp('blessed_aim'));
  }
  // PD2 : Prière rend de la vie à chaque coup porté (table « Life After Each Hit + »)
  if (ownAura('prayer') > 0) all.set('lifeAfterHit', (all.get('lifeAfterHit') ?? 0) + nv('prayer', 'value2', ownAura('prayer')));
  // Épines : dégâts renvoyés en pour cent des coups reçus (règle skills.paladin : D2, thorns_percent) ou fixes avec blessures ouvertes (mod)
  if (auraLvl('thorns') > 0) {
    if (RULES['skills.paladin']().thornsPct) all.set('thornsPct', (all.get('thornsPct') ?? 0) + nv('thorns', 'value', auraLvl('thorns')));
    else {
      all.set('thornsFlat', (all.get('thornsFlat') ?? 0) + nv('thorns', 'value', auraLvl('thorns')));
      all.set('openWounds', (all.get('openWounds') ?? 0) + nv('thorns', 'v3', auraLvl('thorns')));
    }
  }
  const fana = auraLvl('fanaticism');
  if (fana > 0) {
    const f2 = offensive('fanaticism');
    st.meleeDmgPct += f2.self || nv('fanaticism', 'value2', fana);
    st.petDmgPct += f2.ally;
    st.iasDruid += nv('fanaticism', 'v3', fana);
    st.arPctDruid += nv('fanaticism', 'ar', fana);
  }
  // dégâts élémentaires ajoutés aux coups tant que Feu sacré, Gel sacré, Choc sacré ou Sanctuaire est active
  const holy = (id: string, e: Element): void => {
    const L = auraLvl(id);
    if (L <= 0) return;
    const s2 = SKILL_BY_ID[id];
    // dégâts ajoutés aux attaques : seulement avec leurs chiffres (Sanctuaire de D2 : aucun)
    if (!s2.n.min2 || !s2.n.max2) return;
    const lo = ramp(s2.n.min2, L);
    const hi = ramp(s2.n.max2, L);
    const syn = 1 + synergyPct(s2, c.skills) / 100;
    const cur = st.auraAdded[e] ?? [0, 0];
    st.auraAdded[e] = [cur[0] + lo * syn, cur[1] + hi * syn];
    // PD2 : chaque aura « sacrée » ajoute aussi du score d'attaque (table « Attack Rating +% »)
    if (s2.n.ar) st.arPctDruid += ramp(s2.n.ar, L);
  };
  holy('sanctuary', 'magic');
  if (ownAura('sanctuary') > 0) all.set('sanctuaryAura', 1);
  // Sanctuaire : dégâts contre les morts-vivants (règle skills.paladin : D2, ln34 % ; mod : aucun)
  const sanc = auraLvl('sanctuary') > 0 ? RULES['skills.paladin']().sanctuaryUndeadDmgPct(auraLvl('sanctuary')) : 0;
  if (sanc > 0) all.set('dmgUndeadPct', (all.get('dmgUndeadPct') ?? 0) + sanc);
  holy('holy_fire', 'fire');
  holy('holy_freeze', 'cold');
  holy('holy_shock', 'light');
  // Résistances : résistance et dégâts élémentaires actifs ; résistance maximale passive (points investis)
  const resAura = (id: string, e: 'fire' | 'cold' | 'light'): void => {
    const L = auraLvl(id);
    if (L > 0) {
      st.resExtra[e] += nv(id, 'value', L);
      st.elemDmgPct[e] += nv(id, 'v3', L);
    }
    // résistance maximale : règle skills.paladin (D2 : points durs si l'aura est active, moitié en passif)
    if (hp(id) > 0) st.maxResExtra[e] += RULES['skills.paladin']().resistMax(id, hp(id), L > 0);
  };
  resAura('resist_fire', 'fire');
  resAura('resist_cold', 'cold');
  resAura('resist_lightning', 'light');
  st.salvation = auraLvl('salvation') > 0 ? nv('salvation', 'value', auraLvl('salvation')) : 0;
  if (st.salvation > 0) for (const e of ['fire', 'cold', 'light'] as Element[]) st.elemDmgPct[e] += nv('salvation', 'v3', auraLvl('salvation'));
  if (auraLvl('cleansing') > 0) {
    st.curseReduce += nv('cleansing', 'value', auraLvl('cleansing'));
    st.poisonReduce += nv('cleansing', 'value', auraLvl('cleansing'));
  }
  if (hp('cleansing') > 0) {
    st.curseReduce -= skillHard('cleansing', 'Passive Curse & Poison Duration %', hp('cleansing'));
    st.poisonReduce -= skillHard('cleansing', 'Passive Curse & Poison Duration %', hp('cleansing'));
  }
  if (auraLvl('vigor') > 0) st.frwDruid += nv('vigor', 'value', auraLvl('vigor'));
  if (hp('vigor') > 0) st.frwDruid += skillHard('vigor', 'Passive Faster Run/Walk %', hp('vigor'));
  if (hp('prayer') > 0) all.set('lifeRegen', (all.get('lifeRegen') ?? 0) + skillHard('prayer', 'Passive Life Replenish +', hp('prayer')));
  if (hp('meditation') > 0) all.set('manaPerKill', (all.get('manaPerKill') ?? 0) + skillHard('meditation', 'Passive Mana after Each Kill', hp('meditation')));
  // Méditation : régénération de mana
  st.meditation = Math.max(all.get('auraMeditation') ?? 0, auraLvl('meditation'));
  // l'aura Conviction d'un mercenaire (maura_) agit sur les monstres autour de LUI (voir mercAuraAt), pas autour du joueur
  if (st.conviction > 0 || ownAura('conviction') > 0) {
    const cl = Math.max(all.get('auraConviction') ?? 0, ownAura('conviction'));
    st.convictionDef = nv('conviction', 'value', cl);
  }
}

/** Rage sauvage (loup-garou) */
export function applyFeralRage(x: DeriveCtx, st: DeriveState): void {
  const { buffs, all, form } = x;
  const feral = buffs.find((b) => b.id === 'feral_rage');
  if (feral && form === 'werewolf') {
    // vol de vie, course et zone de mêlée selon les charges : règle skills.druid
    const r = druid().feralRage(feral.stacks ?? 0, lin(SKILL_BY_ID.feral_rage.n.value2, feral.level));
    st.leechDruid += r.leech;
    st.frwDruid += r.frw;
    all.set('splashRadius', (all.get('splashRadius') ?? 0) + r.splash);
  }
}

/** Barbare : Peau de fer, Résistance naturelle, Vitesse accrue, Réflexes, cris, Frénésie, Commandement, Fétiche (et Chaleur de la Sorcière) */
export function applyBarbarianSkills(x: DeriveCtx, st: DeriveState): void {
  const { buffs, hard, skillLevels, buffLvl, nv, sk } = x;
  // Barbare : peau de fer, résistance naturelle, vitesse accrue, cris et attaques à effet durable
  // PD2 : la réduction des dégâts physiques de Peau de fer, la vitesse d'attaque de Vitesse accrue et la
  // récupération de Réflexes de combat dépendent des points investis (tables « Hard Level »)
  if (sk('iron_skin') > 0) {
    st.defPctDruid += nv('iron_skin', 'value', sk('iron_skin'));
    st.drDruid += skillHard('iron_skin', 'Physical Damage Reduction %', hard.iron_skin ?? 0);
  }
  if (sk('natural_resistance') > 0) for (const e of ['fire', 'cold', 'light', 'poison'] as Element[]) st.resExtra[e] += nv('natural_resistance', 'value', sk('natural_resistance'));
  if (sk('increased_speed') > 0) {
    st.frwDruid += nv('increased_speed', 'value', sk('increased_speed'));
    // PD2 : la vitesse d'attaque de Vitesse accrue est de la vitesse « d'objet », pas « de compétence »
    const isIas = skillHard('increased_speed', 'Increased Attack Speed +%', hard.increased_speed ?? 0);
    st.iasDruid += isIas;
    st.iasAsItem += isIas;
  }
  if (sk('combat_reflexes') > 0) {
    st.fhrSkill += skillHard('combat_reflexes', 'Faster Hit Recovery +%', hard.combat_reflexes ?? 0);
    st.lifeSkill += nv('combat_reflexes', 'value2', sk('combat_reflexes'));
  }
  if (buffLvl('shout') > 0) st.defPctDruid += nv('shout', 'value', buffLvl('shout'));
  if (buffLvl('concentrate') > 0) {
    st.defPctDruid += nv('concentrate', 'value', buffLvl('concentrate'));
    st.uninterrupt += 100;
  }
  // Berserk : défense et réduction des dégâts physiques pendant l'effet (règle skills.barbarian : D2, défense à 0)
  const barb = RULES['skills.barbarian']();
  if (buffLvl('berserk') > 0) {
    st.defPctDruid += barb.berserkDefensePct;
    st.drDruid += barb.berserkDrPct;
  }
  // Frénésie : chaque charge donne sa part des bonus de vitesse du niveau (D2 : une seule charge)
  const fz = buffs.find((b) => b.id === 'frenzy');
  if (fz) {
    const mx = barb.frenzyMaxStacks;
    const f = Math.min(mx, fz.stacks ?? 1) / mx;
    st.iasDruid += nv('frenzy', 'v3', fz.level) * f;
    st.frwDruid += nv('frenzy', 'v4', fz.level) * f;
  }
  // Commandement de bataille : dégâts améliorés ; Fétiche sinistre : dégâts et score d'attaque dans son aura
  const bcl = buffLvl('battle_command');
  if (bcl > 0) st.meleeDmgPct += nv('battle_command', 'value', bcl);
  const gw = buffLvl('grim_ward');
  // Chaleur : score d'attaque fixe en plus du pourcentage, règle skills.sorceress (D2 : aucun ; PD2 S1 : 10 + 10 par niveau)
  if (skillLevels['warmth'] > 0) st.arFlatSkill += RULES['skills.sorceress']().warmthArFlat(skillLevels['warmth']);
  if (gw > 0) {
    st.meleeDmgPct += nv('grim_ward', 'value', gw);
    st.arFlatSkill += nv('grim_ward', 'value2', gw);
  }
}

/** Paladin : Épée sacrée, masses contre les morts-vivants, Bouclier sacré */
export function applyPaladinBuffs(x: DeriveCtx, st: DeriveState): void {
  const { buffs, all, nv, mhBase } = x;
  // Paladin : Épée sacrée (dégâts aux morts-vivants et démons, parade avec l'arme)
  const hsw = buffs.find((b) => b.id === 'holy_sword');
  if (hsw) {
    const hd = nv('holy_sword', 'value2', hsw.level);
    all.set('dmgUndeadPct', (all.get('dmgUndeadPct') ?? 0) + hd);
    all.set('dmgDemonPct', (all.get('dmgDemonPct') ?? 0) + hd);
    st.weaponBlock = Math.max(st.weaponBlock, nv('holy_sword', 'value', hsw.level));
  }
  // propriété de base D2 : masses, marteaux et sceptres infligent +50 % de dégâts aux morts-vivants
  if (mhBase && (mhBase.type === 'mace' || mhBase.type === 'scepter')) all.set('dmgUndeadPct', (all.get('dmgUndeadPct') ?? 0) + 50);
  // Paladin : Bouclier sacré
  const hs = buffs.find((b) => b.id === 'holy_shield');
  if (hs) {
    st.defPctDruid += nv('holy_shield', 'value', hs.level);
    st.blockAdd += nv('holy_shield', 'value2', hs.level);
  }
}

/** Sorcière : Armure de frisson et Armure glaçante */
export function applySorceressArmors(x: DeriveCtx, st: DeriveState): void {
  const { buffs, all, hp, block } = x;
  // Sorcière (PD2 S12, règle skills.sorceress : armorExtras ; D2 : aucun) : Armure de frisson +10 % de récupération au blocage (+2 % par
  // point investi) ; Armure glaçante +5 % de chances de blocage avec un bouclier (+1 % par point investi)
  if (!RULES['skills.sorceress']().armorExtras) return;
  const shiverB = buffs.find((b) => b.id === 'shiver_armor');
  if (shiverB) all.set('fbr', (all.get('fbr') ?? 0) + 10 + 2 * Math.min(20, hp('shiver_armor')));
  const chillB = buffs.find((b) => b.id === 'chilling_armor');
  if (chillB && block > 0) st.blockAdd += 5 + Math.min(20, hp('chilling_armor'));
}

/** Amazone : Esquive et Dérobade */
export function applyAmazonPassives(x: DeriveCtx, st: DeriveState): void {
  const { nv, sk } = x;
  // Amazone : esquive à l'arrêt, évitement des projectiles, dérobade en marchant
  if (sk('dodge') > 0) {
    st.dodgeMelee = nv('dodge', 'value', sk('dodge'));
    // l'Esquive évite aussi les projectiles : règle skills.amazon (D2 : non, c'est l'Évitement)
    if (RULES['skills.amazon']().dodgeMissiles) st.dodgeMissile = st.dodgeMelee;
    // PD2 : récupération après un coup accélérée (table du niveau)
    st.fhrSkill += nv('dodge', 'value2', sk('dodge'));
  }
  if (sk('avoid') > 0) st.dodgeMissile = nv('avoid', 'value', sk('avoid'));
  if (sk('evade') > 0) {
    st.dodgeAny = nv('evade', 'value', sk('evade'));
    // PD2 : vitesse de marche et de course accrue (table du niveau, sans plafond)
    st.frwDruid += nv('evade', 'value2', sk('evade'));
  }
}

/** Assassin : parade, Accès de vitesse, Joute, Évanescence, Cape d'ombre, Venin */
export function applyAssassinBuffs(x: DeriveCtx, st: DeriveState): void {
  const { buffs, hard, nv, sk, offClaws } = x;
  // Assassin : parade avec deux griffes, accès de vitesse, évanescence, cape d'ombre, venin
  if (sk('weapon_block') > 0 && offClaws) st.weaponBlock = nv('weapon_block', 'value', sk('weapon_block'));
  const bs = buffs.find((b) => b.id === 'burst_of_speed');
  if (bs) {
    // vitesse d'attaque : règle skills.assassin (D2 : dm34 de la table ; PD2 : selon les points investis)
    st.iasDruid += RULES['skills.assassin']().burstIas(hard.burst_of_speed ?? 0, nv('burst_of_speed', 'value', bs.level));
    st.frwDruid += nv('burst_of_speed', 'value2', bs.level);
  }
  // PD2 : la Joute donne de la vitesse de déplacement pendant 2 s
  const jr = buffs.find((b) => b.id === 'joust_run');
  if (jr) st.frwDruid += nv('joust', 'v3', jr.level);
  const fd = buffs.find((b) => b.id === 'fade');
  if (fd) {
    for (const e of ['fire', 'cold', 'light', 'poison'] as Element[]) st.resExtra[e] += nv('fade', 'value', fd.level);
    st.drDruid += Math.min(50, nv('fade', 'value2', fd.level));
    st.curseReduce += nv('fade', 'v3', fd.level);
  }
  const cs = buffs.find((b) => b.id === 'cloak_of_shadows');
  if (cs) st.defPctDruid += nv('cloak_of_shadows', 'value', cs.level);
  const ven = buffs.find((b) => b.id === 'venom');
  if (ven) {
    const s2 = SKILL_BY_ID.venom;
    st.auraAdded.poison = [ramp(s2.n.min!, ven.level), ramp(s2.n.max!, ven.level)];
  }
}

/** Méditation et sanctuaires d'armure et de combat */
export function applyShrinesAndMeditation(x: DeriveCtx, st: DeriveState): void {
  const { all, nv } = x;
  if (st.meditation > 0) st.manaRegenPct += nv('meditation', 'value', st.meditation);
  // sanctuaires d'armure (+100 % de défense) et de combat (+200 % de dégâts minimum et maximum)
  st.defPctDruid += all.get('shrineDefPct') ?? 0;
  st.meleeDmgPct += all.get('shrineDmgPct') ?? 0;
}

/** Vie et mana maximales (caractéristiques, objets, Ordres de bataille) */
export function vitalsOf(x: DeriveCtx, st: DeriveState): { lifeMax: number; manaMax: number } {
  const { c, all, buffLvl, nv, vit, ene } = x;
  // vie / mana
  const cls = classOf(c.classId);
  const lifeBase = cls.life + (c.level - 1) * cls.lifePerLevel + (vit - cls.base.vit) * cls.lifePerVit;
  const manaBase = cls.mana + (c.level - 1) * cls.manaPerLevel + (ene - cls.base.ene) * cls.manaPerEne;
  let lifeMax = (lifeBase + (all.get('life') ?? 0) + st.lifeSkill) * (1 + ((all.get('lifePct') ?? 0) + st.lifePctDruid) / 100);
  let manaMax = (manaBase + (all.get('mana') ?? 0)) * (1 + (all.get('manaPct') ?? 0) / 100);
  // Ordres de bataille (Appel aux armes) : on le considère actif en permanence (précast) ; règle skills.barbarian : D2, vie et mana
  // maximales en pour cent ; mod : vie et mana fixes
  const bo = Math.max(all.get('ctaBattleOrders') ?? 0, buffLvl('maura_battle_orders'), buffLvl('battle_orders'));
  if (bo > 0) {
    if (RULES['skills.barbarian']().battleOrdersPct) {
      lifeMax *= 1 + nv('battle_orders', 'value', bo) / 100;
      manaMax *= 1 + nv('battle_orders', 'value2', bo) / 100;
    } else {
      lifeMax += nv('battle_orders', 'value', bo);
      manaMax += nv('battle_orders', 'value2', bo);
    }
  }
  return { lifeMax, manaMax };
}

/** Défense : base de dextérité + objets, puis armures de froid et d'os */
export function defenseOf(x: DeriveCtx, st: DeriveState, itemDefense: number): number {
  const { buffs, all, hp, dex } = x;
  // défense : base de dextérité (dex/4) + objets + armures de froid
  let defense = Math.floor((Math.floor(dex / 4) + itemDefense + (all.get('defense') ?? 0)) * (1 + st.defPctDruid / 100));
  for (const b of buffs) {
    if (b.id === 'frozen_armor') defense = Math.floor(defense * (1 + lin(SKILL_BY_ID.frozen_armor.n.value, b.level) / 100));
    if (b.id === 'shiver_armor') defense = Math.floor(defense * (1 + lin(SKILL_BY_ID.shiver_armor.n.value, b.level) / 100));
    if (b.id === 'chilling_armor') defense = Math.floor(defense * (1 + lin(SKILL_BY_ID.chilling_armor.n.value, b.level) / 100));
    // PD2 (saison 10) : Armure d'os donne +10 % de défense par point investi
    if (b.id === 'bone_armor') defense = Math.floor(defense * (1 + skillHard('bone_armor', 'Defense +%', hp('bone_armor')) / 100));
  }
  return defense;
}

/** Résistances plafonnées (pénalité de difficulté), absorptions et immunités brisées */
export function resistancesOf(
  x: DeriveCtx,
  st: DeriveState,
  difficulty: Difficulty,
  resAll: number,
  maxResAll: number,
): { maxRes: Record<Element, number>; res: Record<Element, number>; absorb: Record<Element, number>; sunder: Record<Element, boolean> } {
  const { all } = x;
  // résistances
  const penalty = RES_PENALTY[difficulty];
  const maxRes: Record<Element, number> = { phys: 50, fire: 75, cold: 75, light: 75, poison: 75, magic: 0 };
  const res: Record<Element, number> = { phys: 0, fire: 0, cold: 0, light: 0, poison: 0, magic: 0 };
  const absorb: Record<Element, number> = { phys: 0, fire: all.get('absorbFire') ?? 0, cold: all.get('absorbCold') ?? 0, light: all.get('absorbLight') ?? 0, poison: 0, magic: 0 };
  for (const e of ['fire', 'cold', 'light', 'poison'] as Element[]) {
    const key = e === 'fire' ? 'Fire' : e === 'cold' ? 'Cold' : e === 'light' ? 'Light' : 'Poison';
    maxRes[e] = Math.min(RULES['char.maxResCap'](), 75 + (all.get(`maxRes${key}`) ?? 0) + maxResAll + st.maxResExtra[e]);
    res[e] = Math.min(maxRes[e], (all.get(`res${key}`) ?? 0) + resAll + penalty + st.resExtra[e] + (e === 'poison' ? 0 : st.salvation));
  }
  const sunder: Record<Element, boolean> = {
    phys: (all.get('sunderPhys') ?? 0) > 0,
    fire: (all.get('sunderFire') ?? 0) > 0,
    cold: (all.get('sunderCold') ?? 0) > 0,
    light: (all.get('sunderLight') ?? 0) > 0,
    poison: false,
    magic: false,
  };
  return { maxRes, res, absorb, sunder };
}

/** Dégâts ajoutés aux coups : objets et auras */
export function addedDamageOf(all: StatMap, st: DeriveState): DerivedStats['addedDmg'] {
  const addedDmg: DerivedStats['addedDmg'] = {};
  const af = [all.get('addFireMin') ?? 0, all.get('addFireMax') ?? 0];
  if (af[1] > 0) addedDmg.fire = [af[0], af[1]];
  const ac = [all.get('addColdMin') ?? 0, all.get('addColdMax') ?? 0];
  if (ac[1] > 0) addedDmg.cold = [ac[0], ac[1]];
  const al = [all.get('addLightMin') ?? 0, all.get('addLightMax') ?? 0];
  if (al[1] > 0) addedDmg.light = [al[0], al[1]];

  const am = [all.get('addMagicMin') ?? 0, all.get('addMagicMax') ?? 0];
  if (am[1] > 0) addedDmg.magic = [am[0], am[1]];

  for (const [e, r] of Object.entries(st.auraAdded)) {
    const cur = addedDmg[e as Element] ?? [0, 0];
    addedDmg[e as Element] = [cur[0] + r![0], cur[1] + r![1]];
  }
  return addedDmg;
}
