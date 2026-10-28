/** Calcul des statistiques finales d'un objet (affixes, unique, set, runeword, châsses, corruption). */
import { BASE_BY_ID } from '../data/items/bases';
import '../data/items/index';
import { AFFIX_BY_ID } from '../data/items/affixes';
import { UNIQUE_BY_ID } from '../data/items/uniques';
import { SET_BY_ID, SET_ITEM_BY_ID } from '../data/items/sets';
import { GEM_BY_ID, RUNE_BY_ID } from '../data/items/runes';
import { RUNEWORD_BY_ID } from '../data/items/runewords';
import { TYPE_GROUPS, type ItemBase, type StatRoll } from '../data/types';
import { STATS, type StatMap, addStat } from '../data/stats';
import { SKILL_BY_ID } from '../data/skills';
import { CLASSES, TREE_CLASS } from '../data/classes';
import type { Item, RolledMod } from './item';
import { mapName } from './mapinfo';

export function baseOf(item: Item): ItemBase {
  const b = BASE_BY_ID[item.base];
  if (!b) throw new Error(`Base inconnue : ${item.base}`);
  return b;
}

/** Catégorie de châsse : arme, armure (casque/corps) ou bouclier */
function socketKind(b: ItemBase): 'weapon' | 'armor' | 'shield' {
  if (b.type === 'shield') return 'shield';
  if (b.type === 'head') return 'shield';
  // PD2 : les châsses d'un carquois comptent comme celles d'une arme
  if (TYPE_GROUPS.weapon.includes(b.type) || b.type === 'quiver') return 'weapon';
  return 'armor';
}

/** Liste des modificateurs « lisibles » de l'objet, dans l'ordre d'affichage. */
export function itemMods(item: Item): RolledMod[] {
  const b = baseOf(item);
  const out: RolledMod[] = [];
  const push = (stat: string, value: number, param?: string) => {
    if (value === 0) return;
    out.push({ stat, value, param });
  };
  if (b.implicit) for (const m of b.implicit) push(m.stat, Math.round((m.min + m.max) / 2), m.param);
  if (item.automod) for (const m of item.automod) push(m.stat, m.value, m.param);
  if (item.affixes) {
    for (const a of item.affixes) {
      const def = AFFIX_BY_ID[a.id];
      if (!def) continue;
      def.mods.forEach((m, i) => push(m.stat, a.values[i] ?? m.min, m.param));
    }
  }
  if (item.uniqueId) {
    const u = UNIQUE_BY_ID[item.uniqueId];
    if (u) u.mods.forEach((m, i) => push(m.stat, item.rolls?.[i] ?? m.min, m.param));
  }
  if (item.setId) {
    const s = SET_ITEM_BY_ID[item.setId];
    if (s) s.mods.forEach((m, i) => push(m.stat, item.rolls?.[i] ?? m.min, m.param));
  }
  if (item.runeword) {
    const rw = RUNEWORD_BY_ID[item.runeword];
    if (rw) rw.mods.forEach((m, i) => push(m.stat, item.rolls?.[i] ?? m.max, m.param));
  }
  if (item.superiorPct) push(b.dmg ? 'edPct' : 'defPct', item.superiorPct);
  if (item.craftMods) for (const m of item.craftMods) push(m.stat, m.value, m.param);
  // châsses (runes/gemmes/joyaux) — les runes d'un runeword comptent aussi
  const kind = socketKind(b);
  for (const s of item.socketed) {
    const rune = RUNE_BY_ID[s.base];
    const gem = GEM_BY_ID[s.base];
    const list = rune ? rune[kind] : gem ? gem[kind] : null;
    if (list) for (const m of list) push(m.stat, m.max, m.param);
    else if (s.base === 'jewel') for (const m of itemMods(s)) push(m.stat, m.value, m.param);
  }
  if (item.corrupted) for (const m of item.corrupted.mods) push(m.stat, m.value, m.param);
  return mergeMods(out);
}

/** Fusionne les modificateurs identiques (même stat, même paramètre). */
function mergeMods(mods: RolledMod[]): RolledMod[] {
  const map = new Map<string, RolledMod>();
  for (const m of mods) {
    const k = `${m.stat}|${m.param ?? ''}`;
    const e = map.get(k);
    if (e) e.value += m.value;
    else map.set(k, { ...m });
  }
  return [...map.values()].sort((a, b) => (STATS[a.stat]?.order ?? 999) - (STATS[b.stat]?.order ?? 999));
}

export interface ItemFinal {
  dmg?: [number, number];
  /** Dégâts de jet (javelots, armes de jet) */
  mdmg?: [number, number];
  defense?: number;
  block?: number;
  reqStr: number;
  reqDex: number;
  reqLvl: number;
  /** Stats globales (s'ajoutent au personnage) */
  stats: StatMap;
  mods: RolledMod[];
}

/** Applique les stats locales (dégâts/défense améliorés, prérequis) et renvoie les stats globales. */
export function itemFinal(item: Item, clvl = 99): ItemFinal {
  const b = baseOf(item);
  const mods = itemMods(item);
  const stats: StatMap = new Map();
  let ed = 0;
  let minAdd = 0;
  let maxAdd = 0;
  let defPct = 0;
  let defFlat = 0;
  let reqPct = 0;
  for (const m of mods) {
    const def = STATS[m.stat];
    const perLvl = PER_LVL_GLOBAL[m.stat];
    if (perLvl) {
      addStat(stats, perLvl, Math.floor(m.value * clvl));
      continue;
    }
    switch (m.stat) {
      case 'edPct':
        ed += m.value;
        continue;
      case 'minDmg':
        minAdd += m.value;
        continue;
      case 'maxDmg':
        maxAdd += m.value;
        continue;
      case 'defPct':
        defPct += m.value;
        continue;
      case 'defFlat':
        defFlat += m.value;
        continue;
      case 'reqPct':
        reqPct += m.value;
        continue;
      case 'lifePerLvl':
        addStat(stats, 'life', Math.floor(m.value * clvl));
        continue;
      case 'manaPerLvl':
        addStat(stats, 'mana', Math.floor(m.value * clvl));
        continue;
      case 'oskill':
        if (m.param) addStat(stats, `sk:${m.param}`, m.value);
        continue;
      case 'classSkill':
        // compté seulement pour la classe de la compétence (effectiveSkillLevel)
        if (m.param) addStat(stats, `csk:${m.param}`, m.value);
        continue;
      case 'defPerLvl':
        defFlat += Math.floor(m.value * clvl);
        continue;
      case 'maxDmgPerLvl':
        maxAdd += Math.floor(m.value * clvl);
        continue;
      case 'attackRatingPerLvl':
        addStat(stats, 'attackRating', Math.floor(m.value * clvl));
        continue;
      case 'mfPerLvl':
        addStat(stats, 'mf', Math.floor(m.value * clvl));
        continue;
      case 'strPerLvl':
      case 'dexPerLvl':
      case 'vitPerLvl':
        addStat(stats, m.stat.slice(0, 3), Math.floor(m.value * clvl));
        continue;
    }
    if ((m.stat.startsWith('proc') || m.stat === 'itemAura' || m.stat === 'extraSummon') && m.param) {
      addStat(stats, `${m.stat}:${m.param}`, m.value);
      continue;
    }
    if (def?.local) continue;
    addStat(stats, m.stat, m.value);
  }
  // éthéré (PD2) : dégâts et défense de base ×1,25, Force et Dextérité requises −10
  const eth = item.ethereal ? 1.25 : 1;
  const ethReq = item.ethereal ? 10 : 0;
  const out: ItemFinal = {
    reqStr: Math.max(0, Math.floor(b.reqStr * (1 - reqPct / 100)) - ethReq),
    reqDex: Math.max(0, Math.floor(b.reqDex * (1 - reqPct / 100)) - ethReq),
    reqLvl: requiredLevel(item),
    stats,
    mods,
  };
  if (b.dmg) {
    out.dmg = [Math.floor(b.dmg[0] * eth * (1 + ed / 100) + minAdd), Math.floor(b.dmg[1] * eth * (1 + ed / 100) + maxAdd)];
    if (out.dmg[1] < out.dmg[0]) out.dmg[1] = out.dmg[0];
    if (b.missileDmg) out.mdmg = [Math.floor(b.missileDmg[0] * eth * (1 + ed / 100) + minAdd), Math.floor(b.missileDmg[1] * eth * (1 + ed / 100) + maxAdd)];
  } else {
    // D2 : dégâts améliorés / minimum / maximum portés hors arme (bijoux, charmes, joyaux d'armure) : s'ajoutent à l'arme en main
    addStat(stats, 'edPct', ed);
    addStat(stats, 'minDmg', minAdd);
    addStat(stats, 'maxDmg', maxAdd);
  }
  if (b.defense) {
    const baseDef = (item.defRoll ?? b.defense[1]) * eth;
    out.defense = Math.floor(baseDef * (1 + defPct / 100) + defFlat);
  } else addStat(stats, 'defense', defFlat); // défense fixe d'un charme, d'un joyau ou d'un bijou : défense du personnage
  if (b.block) out.block = b.block;
  return out;
}

/** Niveau requis = max(base, affixes, unique/set, runeword, runes serties) */
export function requiredLevel(item: Item): number {
  const b = baseOf(item);
  let lvl = b.reqLvl;
  if (item.affixes) for (const a of item.affixes) lvl = Math.max(lvl, AFFIX_BY_ID[a.id]?.reqLvl ?? 1);
  if (item.uniqueId) lvl = Math.max(lvl, UNIQUE_BY_ID[item.uniqueId]?.reqLvl ?? 1);
  if (item.setId) lvl = Math.max(lvl, SET_ITEM_BY_ID[item.setId]?.reqLvl ?? 1);
  if (item.runeword) lvl = Math.max(lvl, RUNEWORD_BY_ID[item.runeword]?.reqLvl ?? 1);
  for (const s of item.socketed) lvl = Math.max(lvl, BASE_BY_ID[s.base]?.reqLvl ?? 1);
  return lvl;
}

/** Nom affiché de l'objet */
/** Nom d'un objet : préfixe « Éth. » s'il est éthéré ; châsses « [n] » pour les objets nommés d'après leur base (normal, supérieur, abîmé, magique) */
export function itemName(item: Item): string {
  const n = itemNameBase(item);
  return item.ethereal && !item.map ? `Éth. ${n}` : n;
}

function itemNameBase(item: Item): string {
  const b = baseOf(item);
  const sock = item.sockets > 0 ? ` [${item.sockets}]` : '';
  if (item.qty && item.qty > 1 && b.stack) return `${b.name} ×${item.qty}`;
  if (item.map) return mapName(item);
  switch (item.quality) {
    case 'unique':
      return UNIQUE_BY_ID[item.uniqueId ?? '']?.name ?? b.name;
    case 'set':
      return SET_ITEM_BY_ID[item.setId ?? '']?.name ?? b.name;
    case 'rare':
    case 'crafted':
      return item.rareName ?? b.name;
    case 'runeword':
      return RUNEWORD_BY_ID[item.runeword ?? '']?.name ?? b.name;
    case 'magic': {
      if (item.importedName) return item.importedName;
      let pre = '';
      let suf = '';
      for (const a of item.affixes ?? []) {
        const d = AFFIX_BY_ID[a.id];
        if (!d) continue;
        if (d.kind === 'prefix') pre = d.name;
        else suf = d.name;
      }
      return [b.name, pre, suf].filter(Boolean).join(' ') + sock;
    }
    case 'superior':
      return `${b.name} supérieur(e)${sock}`;
    case 'low':
      return `${b.name} abîmé(e)${sock}`;
    default:
      return `${b.name}${sock}`;
  }
}

/** Bonus de set « locaux » à l'objet (dégâts de l'arme, défense) : appliqués au total par le calcul du personnage */
export interface SetLocal {
  edPct: number;
  minDmg: number;
  maxDmg: number;
  defPct: number;
  defFlat: number;
}

const PER_LVL_GLOBAL: Record<string, string> = {
  lifePerLvl: 'life',
  manaPerLvl: 'mana',
  attackRatingPerLvl: 'attackRating',
  mfPerLvl: 'mf',
  strPerLvl: 'str',
  dexPerLvl: 'dex',
  vitPerLvl: 'vit',
  thornsPerLvl: 'thornsFlat',
  resFirePerLvl: 'resFire',
  resColdPerLvl: 'resCold',
  resLightPerLvl: 'resLight',
  addLightMaxPerLvl: 'addLightMax',
  maxLightDmgPerLvl: 'addLightMax',
  maxColdPerLvl: 'addColdMax',
  absorbColdPerLvl: 'absorbCold',
  arPctPerLvl: 'arPct',
};

function addSetMod(stats: StatMap, local: SetLocal, m: { stat: string; max: number; param?: string }, clvl: number): void {
  const v = m.max;
  if (m.stat === 'oskill' && m.param) addStat(stats, `sk:${m.param}`, v);
  else if (m.stat === 'classSkill' && m.param) addStat(stats, `csk:${m.param}`, v);
  else if ((m.stat.startsWith('proc') || m.stat === 'itemAura' || m.stat === 'extraSummon') && m.param) addStat(stats, `${m.stat}:${m.param}`, v);
  else if (PER_LVL_GLOBAL[m.stat]) addStat(stats, PER_LVL_GLOBAL[m.stat], Math.floor(v * clvl));
  else if (m.stat === 'defPerLvl') local.defFlat += Math.floor(v * clvl);
  else if (m.stat === 'maxDmgPerLvl') local.maxDmg += Math.floor(v * clvl);
  else if (m.stat === 'edMaxPctPerLvl') local.edPct += Math.floor(v * clvl);
  else if (m.stat === 'edPct' || m.stat === 'minDmg' || m.stat === 'maxDmg' || m.stat === 'defPct' || m.stat === 'defFlat') local[m.stat] += v;
  else addStat(stats, m.stat, v);
}

/** Pièces d'un set portées parmi l'équipement : identifiant de pièce → objet */
export function wornSetPieces(equipped: Item[], setId: string): Map<string, Item> {
  const worn = new Map<string, Item>();
  for (const it of equipped) {
    const s = it.setId ? SET_ITEM_BY_ID[it.setId] : undefined;
    if (s && s.set === setId) worn.set(s.id, it);
  }
  return worn;
}

/** Valeur d'un mod de bonus de pièce : tirée à la génération, sinon le maximum (anciens objets) */
export function partialValue(item: Item | undefined, def: { partial?: { mods: StatRoll[] }[] }, partialIdx: number, modIdx: number, m: StatRoll): number {
  let flat = 0;
  for (let i = 0; i < partialIdx; i++) flat += def.partial?.[i].mods.length ?? 0;
  return item?.setRolls?.[flat + modIdx] ?? m.max;
}

/** Un bonus de pièce est-il actif ? (assez de pièces portées, et les pièces exigées en font partie) */
export function partialActive(p: { count: number; with?: string[] }, worn: Map<string, Item>): boolean {
  return worn.size >= p.count && (p.with ?? []).every((id) => worn.has(id));
}

/** Bonus de set actifs : stats globales et ajustements locaux (arme, défense) */
export function setBonuses(equipped: Item[], clvl: number): { stats: StatMap; local: SetLocal } {
  const sets = new Set<string>();
  for (const it of equipped) {
    const s = it.setId ? SET_ITEM_BY_ID[it.setId] : undefined;
    if (s) sets.add(s.set);
  }
  const stats: StatMap = new Map();
  const local: SetLocal = { edPct: 0, minDmg: 0, maxDmg: 0, defPct: 0, defFlat: 0 };
  for (const setId of sets) {
    const worn = wornSetPieces(equipped, setId);
    for (const [id, it] of worn) {
      const def = SET_ITEM_BY_ID[id];
      (def.partial ?? []).forEach((p, pi) => {
        if (partialActive(p, worn)) p.mods.forEach((m, mi) => addSetMod(stats, local, { ...m, max: partialValue(it, def, pi, mi, m) }, clvl));
      });
    }
    const set = SET_BY_ID[setId];
    if (set) for (const bz of set.bonuses) if (worn.size >= bz.count) for (const m of bz.mods) addSetMod(stats, local, m, clvl);
  }
  return { stats, local };
}

/** Libellé lisible d'un modificateur */
export function modLabel(m: RolledMod): string {
  const def = STATS[m.stat];
  if (!def) return `${m.stat} ${m.value}`;
  if (!def.label) return '';
  let p = m.param ?? '';
  if ((m.stat === 'oskill' || m.stat === 'itemAura' || m.stat === 'extraSummon') && m.param) p = skillNameLookup(m.param);
  else if (m.stat === 'classSkill' && m.param) {
    const s = SKILL_BY_ID[m.param];
    p = s ? `${skillNameLookup(m.param)} (${CLASSES[TREE_CLASS[s.tree]].name} uniquement)` : m.param;
  } else if (m.stat.startsWith('proc') && m.param) {
    const [sk, lv] = m.param.split(':');
    p = `${skillNameLookup(sk)} niv. ${lv}`;
  }
  return def.label.replace('{v}', String(Math.round(m.value * 100) / 100)).replace('{p}', p);
}

const skillNameLookup = (id: string): string => id;
