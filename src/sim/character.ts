/**
 * État persistant du personnage (sauvegardé) et calcul des statistiques dérivées.
 * Caractéristiques et progression par classe (data/classes.ts) ; Sorcière D2 : For 10, Dex 25,
 * Vit 10, Éne 35 ; +1 vie/niveau, +2 vie/Vit ; +2 mana/niveau, +2 mana/Éne ; 5 points de
 * caractéristiques et 1 point de compétence par niveau.
 */
import type { Difficulty } from '../data/types';
import { SLOTS } from '../data/types';
import { RATES } from '../data/rates';
import { RULES } from '../mods/rules';
import { CLASSES, classCanUse, classOnlyList, isMercOnly, type ClassId } from '../data/classes';
import type { DerivedStats } from './derived';
import type { Item } from './item';
import { baseOf, itemFinal } from './itemstats';
import { quiverFits } from '../data/items/quivers';
import { isBroken } from './durability';
import type { PlayerBuff } from './actors';
import {
  applyAmazonPassives,
  applyAssassinBuffs,
  applyAuras,
  applyBarbarianSkills,
  applyBonusesAndShrines,
  applyDruidBuffs,
  applyFeralRage,
  applyPaladinBuffs,
  applySetBonuses,
  applyShrinesAndMeditation,
  applySorceressArmors,
  addedDamageOf,
  attackProfile,
  attributesOf,
  collectEquipment,
  defenseOf,
  effectiveSkillLevels,
  initialState,
  makeHelpers,
  resistancesOf,
  vitalsOf,
  weaponAttrBonus,
  wieldsTwoClaws,
  type DeriveCtx,
} from './derive-calc';
export { effectiveSkillLevel } from './derive-calc';

const INVENTORY_SIZE = 40;
export const STASH_TABS = 4;
/** Inventaire des charmes : 10 colonnes × 4 rangées */
export const CHARM_COLS = 10;
export const CHARM_ROWS = 4;
export const isCharmType = (t: string): boolean => t === 'smallcharm' || t === 'largecharm' || t === 'grandcharm';
/** Cases d'un onglet du coffre : grille 10 × 8 (voir sim/inventory.ts) */
export const STASH_TAB_SIZE = 80;

export { FILTER_PRESETS, FILTER_PRESET_IDS, type FilterPreset, type LootFilterSettings } from './lootfilter';
import { DEFAULT_FILTER } from './lootfilter';
export type { CharacterState } from './character-state';
import type { CharacterState } from './character-state';

export function newCharacter(name?: string, classId: ClassId = 'sorceress'): CharacterState {
  const cls = CLASSES[classId];
  return {
    name: name ?? cls.name,
    classId,
    level: 1,
    xp: 0,
    statPoints: 0,
    skillPoints: 1,
    base: { ...cls.base },
    skills: {},
    respecs: 1,
    hotbar: { primary: 'attack', secondary: 'attack', slots: [null, null, null, null, null, null, null, null] },
    equipment: {},
    inventory: new Array(INVENTORY_SIZE).fill(null),
    charmInv: new Array(CHARM_COLS * CHARM_ROWS).fill(null),
    belt: [
      { kind: 'heal', tier: 0, qty: 4 },
      { kind: 'mana', tier: 0, qty: 4 },
      { kind: 'rejuv', tier: 0, qty: 0 },
    ],
    gold: 0,
    stash: Array.from({ length: STASH_TABS }, () => new Array(STASH_TAB_SIZE).fill(null)),
    materials: {},
    stashGold: 0,
    cube: new Array(12).fill(null),
    filter: { ...DEFAULT_FILTER },
    progression: { completions: {}, rewards: [], highestDifficulty: 0, mapTierMax: 0, playTime: 0, milestones: {}, bonusSkillPoints: 0, bonusStatPoints: 0 },
    bonuses: {},
  };
}

/** Capacité de la ceinture par type de potion, selon la ceinture portée (rangées × 4 / 3 types) */
export function beltCapacity(c: CharacterState): number {
  const belt = c.equipment.belt;
  let rows = 1;
  if (belt) {
    const b = baseOf(belt);
    rows = b.tier === 2 ? 4 : ['sash_l', 'light_belt'].includes(b.id) ? 2 : 3;
  }
  return 2 + rows * 2;
}

/** Vérifie si un objet est portable (niveau, force, dextérité) : prérequis bloquants. */
export function canEquip(c: CharacterState, item: Item, d?: { str: number; dex: number }, reqs = true, cls = true): { ok: boolean; reason?: string } {
  const b = baseOf(item);
  if (!b.slot) return { ok: false, reason: "Cet objet ne s'équipe pas" };
  // without the class restriction (a game mode, lot 290) an item for the mercenary alone still does not go on the hero
  if (cls ? !classCanUse(b, c.classId) : isMercOnly(b))
    return {
      ok: false,
      reason: `Réservé : ${classOnlyList(b)
        .map((x) => (x === 'merc' ? 'mercenaire' : CLASSES[x].name))
        .join(', ')}`,
    };
  if (item.corrupted?.bricked || !reqs) return { ok: true };
  const f = itemFinal(item, c.level);
  const str = d?.str ?? c.base.str;
  const dex = d?.dex ?? c.base.dex;
  if (c.level < f.reqLvl) return { ok: false, reason: `Niveau ${f.reqLvl} requis` };
  if (str < f.reqStr) return { ok: false, reason: `Force ${f.reqStr} requise` };
  if (dex < f.reqDex) return { ok: false, reason: `Dextérité ${f.reqDex} requise` };
  return { ok: true };
}

/**
 * Can the character put the item on (the equip action): `canEquip`, without the level, strength and dexterity requirements when a game
 * mode lifts them (rules `char.equipNeedsReqs`, `char.itemActive`; lot 289), without the class restriction when it lifts that one (rule
 * `char.equipNeedsClass`, lot 290)
 */
export function canWear(c: CharacterState, item: Item, d?: { str: number; dex: number }): { ok: boolean; reason?: string } {
  return canEquip(c, item, d, RULES['char.equipNeedsReqs'](c), RULES['char.equipNeedsClass'](c));
}

/** Objets actifs : équipement + charmes rangés dans l'inventaire des charmes (PD2 : un charme resté dans le sac ordinaire est inactif) */
export function activeItems(c: CharacterState): Item[] {
  const out: Item[] = [];
  for (const s of SLOTS) {
    const it = c.equipment[s];
    if (it && !isBroken(it) && RULES['char.itemActive'](c, it)) {
      // un carquois ne sert qu'avec l'arc ou l'arbalète qui lui correspond
      if (s === 'offhand' && baseOf(it).type === 'quiver' && !quiverFits(baseOf(it), c.equipment.mainhand ? baseOf(c.equipment.mainhand) : null)) continue;
      out.push(it); // un objet brisé n'a plus aucun effet
    }
  }
  for (const it of c.charmInv ?? []) {
    if (it && isCharmType(baseOf(it).type) && RULES['char.itemActive'](c, it)) out.push(it);
  }
  return out;
}

export function computeDerived(c: CharacterState, difficulty: Difficulty, buffs: PlayerBuff[] = []): DerivedStats {
  const equipped = activeItems(c);
  const eq = collectEquipment(c, equipped);
  const { all } = eq;
  const { atkSets, mhBase, recWeapon } = attackProfile(c, equipped);
  applySetBonuses(c, equipped, all, eq);
  const offClaws = wieldsTwoClaws(c);
  applyBonusesAndShrines(c, buffs, all);

  // expansions
  const resAll = all.get('resAll') ?? 0;
  const maxResAll = all.get('maxResAll') ?? 0;
  const pierceAll = all.get('pierceAll') ?? 0;
  const { str, dex, vit, ene } = attributesOf(c, all);
  const { skillLevels, hard } = effectiveSkillLevels(c, all, buffs);
  const st = initialState(all, buffs, skillLevels, hard, pierceAll);
  const fcr = all.get('fcr') ?? 0;

  // Druide : formes animales
  const formBuff = buffs.find((b) => b.id === 'werewolf' || b.id === 'werebear');
  const form = (formBuff?.id as DerivedStats['form']) ?? null;
  const helpers = makeHelpers(buffs, all, hard, skillLevels);
  const { playerAura } = helpers;
  const x: DeriveCtx = { c, buffs, all, str, dex, vit, ene, hard, skillLevels, mhBase, offClaws, block: eq.block, form, formBuff, ...helpers };

  // effets passifs et actifs, dans l'ordre du calcul d'origine
  applyDruidBuffs(x, st);
  applyAuras(x, st);
  applyFeralRage(x, st);
  applyBarbarianSkills(x, st);
  applyPaladinBuffs(x, st);
  applySorceressArmors(x, st);
  applyAmazonPassives(x, st);
  applyAssassinBuffs(x, st);
  applyShrinesAndMeditation(x, st);

  const { lifeMax, manaMax } = vitalsOf(x, st);
  const defense = defenseOf(x, st, eq.itemDefense);
  const { maxRes, res, absorb, sunder } = resistancesOf(x, st, difficulty, resAll, maxResAll);
  const addedDmg = addedDamageOf(all, st);
  const mfRaw = all.get('mf') ?? 0;
  const mainBonus = weaponAttrBonus(c.equipment.mainhand, str, dex);
  return {
    str,
    dex,
    vit,
    ene,
    lifeMax: Math.max(1, Math.round(lifeMax)),
    manaMax: Math.max(1, Math.round(manaMax)),
    manaRegen: (manaMax / RATES.manaRefillSeconds) * (1 + st.manaRegenPct / 100),
    lifeRegen: all.get('lifeRegen') ?? 0,
    defense,
    // « +X % de chances de blocage » des objets : ne joue qu'avec un bouclier (ou un bonus de blocage de compétence)
    // part de la classe avec un bouclier (règle `char.blockFactor`)
    block: eq.block + st.blockAdd > 0 ? eq.block + st.blockAdd + (all.get('block') ?? 0) + (eq.block > 0 ? RULES['char.blockFactor'](c.classId) : 0) : 0,
    res,
    maxRes,
    absorb,
    absorbFlat: { phys: 0, fire: all.get('absorbFireFlat') ?? 0, cold: all.get('absorbColdFlat') ?? 0, light: all.get('absorbLightFlat') ?? 0, poison: 0, magic: all.get('absorbMagicFlat') ?? 0 },
    fcr,
    fhr: (all.get('fhr') ?? 0) + st.fhrSkill,
    frw: (all.get('frw') ?? 0) + st.frwDruid,
    ias: (all.get('ias') ?? 0) + st.iasDruid,
    iasSkill: st.iasDruid - st.iasAsItem,
    atkSets,
    recWeapon,
    mf: mfRaw,
    gf: all.get('gf') ?? 0,
    xpPct: all.get('xpPct') ?? 0,
    lightRadius: all.get('lightRadius') ?? 0,
    dr: (all.get('dr') ?? 0) + st.drDruid,
    drFlat: all.get('drFlat') ?? 0,
    mdr: all.get('mdr') ?? 0,
    lifeLeech: (all.get('lifeLeech') ?? 0) + st.leechDruid,
    manaLeech: all.get('manaLeech') ?? 0,
    lifePerKill: all.get('lifePerKill') ?? 0,
    manaPerKill: (all.get('manaPerKill') ?? 0) + (all.get('manaAfterKill') ?? 0),
    cbf: (all.get('cbf') ?? 0) > 0 || buffs.some((b) => b.id === 'blaze'),
    weaponDmg: [eq.weaponDmg[0] * (1 + mainBonus), eq.weaponDmg[1] * (1 + mainBonus)] as [number, number],
    // score d'attaque : 5 × (Dextérité − 7), part de la classe (règle `char.toHitFactor`), objets et compétences
    attackRating: Math.floor(
      (dex * 5 - 35 + RULES['char.toHitFactor'](c.classId) + (all.get('attackRating') ?? 0) + st.arFlatSkill) * (1 + (st.arPct + st.arPctDruid + (all.get('arPct') ?? 0)) / 100),
    ),
    conviction: st.conviction,
    form,
    meleeDmgPct: st.meleeDmgPct,
    concDmgPct: st.concDmgPct,
    petDmgPct: st.petDmgPct,
    petArPct: st.petArPct,
    petLifePct: 0,
    // Épines en pour cent des coups reçus (D2 : aura Épines, Esprit des ronces)
    thorns: all.get('thornsPct') ?? 0,
    offDmg: eq.offDmg ? [eq.offDmg[0] * (1 + weaponAttrBonus(c.equipment.offhand, str, dex)), eq.offDmg[1] * (1 + weaponAttrBonus(c.equipment.offhand, str, dex))] : null,
    missileDmg: eq.missileDmg ? [eq.missileDmg[0] * (1 + mainBonus), eq.missileDmg[1] * (1 + mainBonus)] : null,
    dodgeMelee: st.dodgeMelee,
    dodgeMissile: st.dodgeMissile,
    dodgeAny: st.dodgeAny,
    weaponBlock: st.weaponBlock,
    curseReduce: st.curseReduce,
    poisonReduce: st.poisonReduce + (all.get('poisonLength') ?? 0),
    convictionDef: st.convictionDef,
    convictionRadius: st.convictionRadius,
    uninterrupt: st.uninterrupt,
    aura: playerAura ? { id: playerAura.id.slice(5), level: Math.max(1, skillLevels[playerAura.id.slice(5)] ?? playerAura.level) } : null,
    elemDmgPct: st.elemDmgPct,
    pierce: st.pierce,
    sunder,
    skillLevels,
    hardPoints: hard,
    all,
    addedDmg,
  };
}

export {};
