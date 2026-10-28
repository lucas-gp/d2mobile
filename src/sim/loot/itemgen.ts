/**
 * Génération d'objets fidèle à D2 : rareté par la formule d'ItemRatio avec rendements
 * décroissants du magic find, niveau d'affixe (alvl) dérivé du niveau d'objet (ilvl) et
 * du niveau de qualité de la base (qlvl), groupes d'exclusion, châsses selon l'ilvl.
 */
import type { Rng } from '../../core/rng';
import { classSkills, type SorcSkill } from '../../data/skills';
import { STAT_CLASS, TREE_STAT, classCanUse, mercCanUse, type ClassId } from '../../data/classes';
import type { RolledMod } from '../item';
import { BASE_BY_ID } from '../../data/items/bases';
import '../../data/items/index';
import { AFFIXES, AFFIX_BY_ID, AFFIX_SUBTYPES, affixAllowed, affixTypeMatches } from '../../data/items/affixes';
import { RARE_PREFIXES, RARE_SUFFIXES } from '../../data/items/rare-names';
import { UNIQUES } from '../../data/items/uniques';
import { SET_ITEMS } from '../../data/items/sets';
import type { AffixDef, ItemBase, StatRoll } from '../../data/types';
import { RATES } from '../../data/rates';
import { makeUid, type Item, type Quality } from '../item';

/* ------------------------------------------------------------------ */
/* Formule de rareté (ItemRatio.txt)                                    */
/* ------------------------------------------------------------------ */

interface RatioRow {
  ratio: number;
  divisor: number;
  min: number;
}

/** Lignes d'ItemRatio pour les objets normaux / exceptionnels-élites (« uber ») */
const ITEM_RATIO: Record<'unique' | 'set' | 'rare' | 'magic' | 'superior' | 'normal', { base: RatioRow; uber: RatioRow }> = {
  unique: { base: { ratio: 400, divisor: 1, min: 6400 }, uber: { ratio: 400, divisor: 1, min: 6400 } },
  set: { base: { ratio: 160, divisor: 2, min: 5600 }, uber: { ratio: 160, divisor: 2, min: 5600 } },
  rare: { base: { ratio: 100, divisor: 2, min: 3200 }, uber: { ratio: 100, divisor: 2, min: 3200 } },
  magic: { base: { ratio: 34, divisor: 3, min: 192 }, uber: { ratio: 34, divisor: 3, min: 192 } },
  superior: { base: { ratio: 12, divisor: 8, min: 0 }, uber: { ratio: 12, divisor: 8, min: 0 } },
  normal: { base: { ratio: 2, divisor: 2, min: 0 }, uber: { ratio: 2, divisor: 2, min: 0 } },
};

/** Facteurs des rendements décroissants du MF (D2) */
const MF_FACTOR = { unique: 250, set: 500, rare: 600 } as const;

export function effectiveMf(mf: number, kind: 'unique' | 'set' | 'rare' | 'magic'): number {
  if (kind === 'magic' || mf <= 0) return Math.max(0, mf);
  const f = MF_FACTOR[kind];
  return (mf * f) / (mf + f);
}

/** Bonus de qualité de la classe de trésor (sur 1024), par rang de monstre */
export interface QualityBonus {
  unique: number;
  set: number;
  rare: number;
  magic: number;
}

export const NO_BONUS: QualityBonus = { unique: 0, set: 0, rare: 0, magic: 0 };

/**
 * Probabilité (0..1) de réussir le test d'une rareté, d'après D2 :
 *   chance = (ratio − (ilvl − qlvl) / divisor) × 128
 *   chance = chance × 100 / (100 + MF effectif)
 *   chance = max(chance, min) ; chance −= chance × bonus/1024
 *   succès si rand(chance) < 128  → p = 128 / chance
 * puis multiplication par le réglage de rates.ts (jeu solo).
 */
export function qualityChance(kind: 'unique' | 'set' | 'rare' | 'magic', ilvl: number, qlvl: number, mf: number, bonus: number, uber: boolean): number {
  const row = uber ? ITEM_RATIO[kind].uber : ITEM_RATIO[kind].base;
  let chance = (row.ratio - (ilvl - qlvl) / row.divisor) * 128;
  const emf = effectiveMf(mf, kind);
  chance = (chance * 100) / (100 + emf);
  chance = Math.max(chance, row.min);
  chance = chance - (chance * bonus) / 1024;
  const p = chance <= 128 ? 1 : 128 / chance;
  return Math.min(1, p * RATES.quality[kind]);
}

function superiorChance(ilvl: number, qlvl: number): number {
  const row = ITEM_RATIO.superior.base;
  const chance = Math.max(128, (row.ratio - (ilvl - qlvl) / row.divisor) * 128);
  return Math.min(1, 128 / chance);
}

/* ------------------------------------------------------------------ */
/* Niveau d'affixe                                                     */
/* ------------------------------------------------------------------ */

/** alvl D2 : dépend de l'ilvl, du qlvl de la base et d'un éventuel magic_lvl. */
export function affixLevel(ilvl: number, qlvl: number, magicLvl = 0): number {
  let i = Math.min(ilvl, 99);
  if (qlvl > i) i = qlvl;
  let alvl: number;
  if (magicLvl > 0) alvl = i + magicLvl;
  else if (i < 99 - qlvl / 2) alvl = i - Math.floor(qlvl / 2);
  else alvl = 2 * i - 99;
  return Math.max(1, Math.min(alvl, 99));
}

/** Niveau magique de la base (colonne magic lvl de D2) : diadèmes 3/8/13/18, baguettes, bâtons et orbes non élites 1 */
const MAGIC_LVL: Record<string, number> = { circlet: 3, coronet: 8, tiara: 13, diadem: 18 };
export function magicLevel(b: ItemBase): number {
  if (MAGIC_LVL[b.id]) return MAGIC_LVL[b.id];
  return (b.type === 'wand' || b.type === 'staff' || b.type === 'orb') && b.tier < 2 ? 1 : 0;
}

/** alvl d'une base à un ilvl donné (niveau magique compris) */
export function baseAffixLevel(b: ItemBase, ilvl: number): number {
  return affixLevel(ilvl, b.qlvl, magicLevel(b));
}

/* ------------------------------------------------------------------ */
/* Nombre d'affixes (PD2, page Item_Affixes)                           */
/* ------------------------------------------------------------------ */

/** Rares : 3 à 6 affixes selon l'ilvl (1-44 : 12,5/37,5/37,5/12,5 % ; 45-64 : 25/50/25 % de 4/5/6 ; 65-84 : 5 ou 6 ; 85+ : 6). Joyaux rares : toujours 4. */
export function rareAffixCount(rng: Rng, b: ItemBase, ilvl: number): number {
  if (b.type === 'jewel') return 4;
  const r = rng.next();
  if (ilvl >= 85) return 6;
  if (ilvl >= 65) return r < 0.5 ? 5 : 6;
  if (ilvl >= 45) return r < 0.25 ? 4 : r < 0.75 ? 5 : 6;
  return r < 0.125 ? 3 : r < 0.5 ? 4 : r < 0.875 ? 5 : 6;
}

/** Magiques : préfixe et suffixe garantis à partir de cet ilvl (armes et armures 65, joyaux et bijoux 85, charmes 90) */
export function magicTwoAffixIlvl(b: ItemBase): number {
  if (b.type === 'smallcharm' || b.type === 'largecharm' || b.type === 'grandcharm') return 90;
  if (b.type === 'jewel' || b.type === 'amulet' || b.type === 'ring') return 85;
  return 65;
}

/* ------------------------------------------------------------------ */
/* Bonus de compétences des objets de classe (« staffmods » / pointmods) */
/* ------------------------------------------------------------------ */

/**
 * Compétences tirables en bonus sur la base (itemtypes.txt, colonne StaffMods, + PD2 : toutes les griffes, gourdins → Druide,
 * dagues → compétences de dague : Frappe empoisonnée et arts martiaux). PD2 : plus de groupes de staffmods, une compétence est
 * admise dès ilvl ≥ niveau requis + 7 (niveau requis 1 : dès l'ilvl 1).
 */
export function staffmodPool(b: ItemBase, ilvl: number): SorcSkill[] {
  let pool: SorcSkill[] = [];
  if (b.type === 'orb' || b.type === 'staff') pool = classSkills('sorceress');
  else if (b.type === 'wand' || b.type === 'head') pool = classSkills('necromancer');
  else if (b.type === 'scepter') pool = classSkills('paladin');
  else if (b.type === 'primal') pool = classSkills('barbarian');
  else if (b.type === 'pelt' || AFFIX_SUBTYPES.club.includes(b.id)) pool = classSkills('druid');
  else if (b.type === 'claw') pool = classSkills('assassin');
  else if (b.type === 'dagger') pool = [...classSkills('assassin').filter((s) => s.tree === 'asn_martial'), ...classSkills('necromancer').filter((s) => s.id === 'poison_dagger')];
  return pool.filter((s) => s.reqLvl <= 1 || ilvl >= s.reqLvl + 7);
}

/** Staffmods PD2 : 10/40/30/20 % pour 0/1/2/3 compétences distinctes ; chacune +1/+2/+3 à 40/35/25 % */
export function rollStaffmods(rng: Rng, b: ItemBase, ilvl: number): RolledMod[] {
  const pool = staffmodPool(b, ilvl);
  if (!pool.length) return [];
  const r = rng.next();
  const n = Math.min(pool.length, r < 0.1 ? 0 : r < 0.5 ? 1 : r < 0.8 ? 2 : 3);
  const left = [...pool];
  const out: RolledMod[] = [];
  for (let i = 0; i < n; i++) {
    const s = left.splice(rng.int(left.length), 1)[0];
    const l = rng.next();
    out.push({ stat: 'classSkill', value: l < 0.4 ? 1 : l < 0.75 ? 2 : 3, param: s.id });
  }
  return out;
}

/**
 * Classe du personnage en jeu : les affixes « +compétences » d'une autre classe ne sont pas tirés.
 * Choix solo à deux classes (D2 les tire pour toutes les classes) : un objet de Druide serait un
 * déchet pour la Sorcière, et la part des « +compétences » de chaque classe reste celle d'avant.
 */
let lootClass: ClassId = 'sorceress';
export function setLootClass(c: ClassId): void {
  lootClass = c;
}

/** Base utilisable par la classe en jeu (orbes : Sorcière, peaux : Druide) */
export function lootBaseAllowed(b: ItemBase): boolean {
  // objets du mercenaire (arcs, armes d'hast) : tombent pour toutes les classes
  return classCanUse(b, lootClass) || mercCanUse(b);
}

/** Affixe réservé à une autre classe que celle en jeu */
export function otherClassAffix(a: AffixDef): boolean {
  return a.mods.some((m) => STAT_CLASS[m.stat] !== undefined && STAT_CLASS[m.stat] !== lootClass);
}

/**
 * Part des charmes majeurs (grand charme D2) dont le préfixe est un « +1 à un arbre de compétences » (skiller) de la classe en jeu.
 * Sans cela ils ne sortaient que sur ~1 charme majeur sur 90 (3 arbres seulement admis, noyés parmi les dégâts élémentaires et
 * autres préfixes) ; le joueur en voulait « considérablement » plus : ≈ 30 %, soit un skiller toutes les ~1,5 cartes à Abondant.
 */
const GRAND_CHARM_SKILLER_CHANCE = 0.3;

/** Affixes « +1-3 à un arbre de compétences » des grands charmes (« skillers ») */
export function isSkillerAffix(a: AffixDef): boolean {
  const trees = new Set(Object.values(TREE_STAT));
  return a.types.includes('Grand Charm') && a.mods.length === 1 && trees.has(a.mods[0].stat);
}

/** Affixes admis par base (types, rareté) : la table fait ~1 100 lignes, le filtre par type est mis en cache */
const allowedCache = new Map<string, AffixDef[]>();
function allowedAffixes(base: ItemBase, kind: 'prefix' | 'suffix', rare: boolean): AffixDef[] {
  const key = `${base.id}|${kind}|${rare ? 1 : 0}`;
  let list = allowedCache.get(key);
  if (!list) {
    list = AFFIXES.filter((a) => a.kind === kind && affixAllowed(a, base, rare));
    allowedCache.set(key, list);
  }
  return list;
}

export function eligibleAffixes(base: ItemBase, alvl: number, kind: 'prefix' | 'suffix', rare: boolean, usedGroups: Set<string>): AffixDef[] {
  return allowedAffixes(base, kind, rare).filter((a) => a.level <= alvl && (a.maxLevel === undefined || a.maxLevel >= alvl) && !usedGroups.has(a.group) && !otherClassAffix(a));
}

/** Châsses ajoutées par les affixes (« Socketed (n) ») : bornées par le maximum de la base */
function affixSockets(item: Item, base: ItemBase): number {
  let n = 0;
  for (const a of item.affixes ?? []) {
    const def = AFFIX_BY_ID[a.id];
    if (def) n = Math.max(n, addedSockets(def.mods, a.values, base));
  }
  return n;
}

/** Châsses d'un unique / set : la propriété « châsses » de la table, bornée par le maximum de la base */
function addedSockets(mods: StatRoll[], rolls: number[], base: ItemBase): number {
  const i = mods.findIndex((m) => m.stat === 'socketsAdded');
  if (i < 0) return 0;
  return Math.max(0, Math.min(Math.round(rolls[i]), base.maxSockets ?? 6));
}

export function rollValues(rng: Rng, mods: StatRoll[]): number[] {
  return mods.map((m) => {
    if (Number.isInteger(m.min) && Number.isInteger(m.max)) return rng.range(m.min, m.max);
    return Math.round(rng.float(m.min, m.max) * 8) / 8;
  });
}

/* ------------------------------------------------------------------ */
/* Châsses                                                             */
/* ------------------------------------------------------------------ */

/** Nombre maximal de châsses selon l'ilvl (D2/PD2 : paliers 1-25, 26-40, 41+ ; table PD2 par base quand elle existe). */
export function maxSocketsForIlvl(base: ItemBase, ilvl: number): number {
  const m = base.maxSockets;
  if (m <= 0) return 0;
  if (base.socketTiers) return base.socketTiers[ilvl <= 25 ? 0 : ilvl <= 40 ? 1 : 2];
  if (ilvl <= 25) return Math.min(m, base.type === 'staff' || base.type === 'armor' ? 3 : 2);
  if (ilvl <= 40) return Math.min(m, 4);
  return m;
}

/* ------------------------------------------------------------------ */
/* Génération                                                          */
/* ------------------------------------------------------------------ */

/** Suffixes de nom de rare admis par base (RareSuffix.txt : types acceptés / exclus) */
const rareSuffixCache = new Map<string, (typeof RARE_SUFFIXES)[number][]>();
/** Nom de rare D2 : préfixe de RarePrefix + suffixe de RareSuffix propre au type (« Morsure de la Bête ») */
export function rareName(rng: Rng, base: ItemBase): string {
  let pool = rareSuffixCache.get(base.id);
  if (!pool) {
    pool = RARE_SUFFIXES.filter(([, , t, ex]) => affixTypeMatches(base, t.split('|')) && !(ex && affixTypeMatches(base, ex.split('|'))));
    rareSuffixCache.set(base.id, pool);
  }
  const [m, f] = rng.pick(RARE_PREFIXES);
  const s = pool.length ? rng.pick(pool) : base.type === 'quiver' ? (['Carquois', 0] as const) : (['Talisman', 0] as const);
  return `${s[0]} ${s[1] ? (f ?? m) : m}`;
}

export interface GenOptions {
  mf?: number;
  bonus?: QualityBonus;
  /** Force une qualité (hook de debug, recettes) */
  forceQuality?: Quality;
  /** Force un unique/set précis */
  forceUniqueId?: string;
  forceSetId?: string;
  /** Butin de monstre : l'objet peut être éthéré (ETHEREAL_CHANCE) ; marchands, Cube et récompenses n'en tirent pas */
  rollEthereal?: boolean;
}

/** D2/PD2 : 1 objet sur 20 des armes et armures lâchées est éthéré (toutes qualités ; PD2 : sets compris) */
const ETHEREAL_CHANCE = 0.05;

/** Bases pouvant être éthérées : armes et armures, sauf celles marquées « nodurability » dans Weapons.txt (arcs, arbalètes, Lame de phase) */
export function canBeEthereal(base: ItemBase): boolean {
  if (!base.slot || base.slot === 'amulet' || base.slot === 'ring' || base.type === 'jewel') return false;
  if (!base.dmg && !base.defense) return false;
  return base.type !== 'bow' && base.type !== 'crossbow' && base.id !== 'phase_blade';
}

/**
 * Compensation de couverture du catalogue : D2 a un unique (et souvent un set) pour presque
 * chaque base ; notre catalogue en couvre moins, et un test d'unique réussi sur une base sans
 * unique se dégrade en rare. Pour garder le rythme PD2, la chance est multipliée, sur les bases
 * couvertes, par (bases lâchables / bases couvertes) au niveau d'objet — plafonné. Le facteur
 * tend vers 1 à mesure que le catalogue s'étoffe (BACKLOG : couvrir toutes les bases).
 */
const COVERAGE_CAP = 8;
const coverageCache = new Map<string, number>();
export function coverageFactor(kind: 'unique' | 'set', ilvl: number): number {
  const key = `${kind}:${ilvl}:${lootClass}`;
  const hit = coverageCache.get(key);
  if (hit !== undefined) return hit;
  const list = kind === 'unique' ? UNIQUES : SET_ITEMS;
  let droppable = 0;
  let covered = 0;
  for (const b of Object.values(BASE_BY_ID)) {
    if (!b.slot || b.qlvl > ilvl || !lootBaseAllowed(b)) continue;
    // D2 n'a presque aucun set sur arcs et armes d'hast (Vidala, Hwanin) : les bases du mercenaire
    // ne diluent pas la compensation des sets
    if (kind === 'set' && !classCanUse(b, lootClass)) continue;
    const has = list.some((u) => u.base === b.id && u.lvl <= ilvl);
    // les bases générées sans unique ni set dédié ne diluent pas la compensation (catalogue d'objets à refaire d'après PD2)
    if (b.generated && !has) continue;
    droppable++;
    if (has) covered++;
  }
  const f = covered === 0 ? 1 : Math.min(COVERAGE_CAP, droppable / covered);
  coverageCache.set(key, f);
  return f;
}

function hasPool(kind: 'unique' | 'set', base: ItemBase, ilvl: number): boolean {
  const list = kind === 'unique' ? UNIQUES : SET_ITEMS;
  return list.some((u) => u.base === base.id && u.lvl <= ilvl);
}

/** Détermine la qualité par les tests successifs unique → set → rare → magique → supérieur → normal. */
export function rollQuality(rng: Rng, base: ItemBase, ilvl: number, mf: number, bonus: QualityBonus): Quality {
  const uber = base.tier > 0;
  const jewelry = base.type === 'amulet' || base.type === 'ring';
  const charm = base.type === 'smallcharm' || base.type === 'largecharm' || base.type === 'grandcharm';
  if (charm) return 'magic';
  // pas de qualité supérieure pour les flèches et carreaux (rien à améliorer)
  const noSuperior = base.type === 'quiver';
  const cu = hasPool('unique', base, ilvl) ? coverageFactor('unique', ilvl) : 1;
  if (rng.chance(Math.min(1, qualityChance('unique', ilvl, base.qlvl, mf, bonus.unique, uber) * cu))) return 'unique';
  const cs = hasPool('set', base, ilvl) ? coverageFactor('set', ilvl) : 1;
  if (rng.chance(Math.min(1, qualityChance('set', ilvl, base.qlvl, mf, bonus.set, uber) * cs))) return 'set';
  if (rng.chance(qualityChance('rare', ilvl, base.qlvl, mf, bonus.rare, uber))) return 'rare';
  if (jewelry || base.type === 'jewel') return 'magic';
  if (rng.chance(qualityChance('magic', ilvl, base.qlvl, mf, bonus.magic, uber))) return 'magic';
  if (!noSuperior && rng.chance(superiorChance(ilvl, base.qlvl))) return 'superior';
  return 'normal';
}

export function generateItem(rng: Rng, baseId: string, ilvl: number, opts: GenOptions = {}): Item {
  const base = BASE_BY_ID[baseId];
  if (!base) throw new Error(`Base inconnue : ${baseId}`);
  const seed = rng.nextU32();
  const item: Item = { uid: makeUid(seed), base: base.id, quality: 'normal', ilvl, sockets: 0, socketed: [] };
  // tirage dérivé de la graine de l'objet : n'avance pas le générateur (les autres tirages restent identiques)
  if (opts.rollEthereal && !base.stack && canBeEthereal(base) && (Math.imul(seed ^ 0x5bd1e995, 0x9e3779b1) >>> 0) / 0x100000000 < ETHEREAL_CHANCE) item.ethereal = true;
  if (base.stack) {
    item.qty = 1;
    return item;
  }
  if (!base.slot && !['smallcharm', 'largecharm', 'grandcharm', 'jewel'].includes(base.type)) return item;
  let q = opts.forceQuality ?? rollQuality(rng, base, ilvl, opts.mf ?? 0, opts.bonus ?? NO_BONUS);
  if (opts.forceUniqueId) q = 'unique';
  if (opts.forceSetId) q = 'set';

  // défense de base tirée
  if (base.defense) item.defRoll = rng.range(base.defense[0], base.defense[1]);

  if (q === 'unique') {
    if (rollUnique(rng, item, base, ilvl, opts)) return item;
    q = 'rare'; // D2 : un unique impossible devient rare
  }
  if (q === 'set') {
    if (rollSet(rng, item, base, ilvl, opts)) return item;
    q = 'magic'; // D2 : un set impossible devient magique
  }
  // bonus de compétences des objets de classe (normaux, supérieurs, magiques et rares)
  const staffmods = rollStaffmods(rng, base, ilvl);
  if (staffmods.length) item.automod = staffmods;
  const alvl = baseAffixLevel(base, ilvl);
  // un rare sans aucun affixe possible n'est pas retenté en magique : il finit normal (ci-dessous)
  if (q === 'rare' && rollRare(rng, item, base, ilvl, alvl)) return item;
  if (q === 'magic') {
    rollMagic(rng, item, base, ilvl, alvl);
    return item;
  }
  rollPlain(rng, item, base, ilvl, q);
  return item;
}

/** Unique de la base (ou celui demandé) tiré selon la rareté, valeurs et châsses ajoutées ; faux si aucun n'est possible */
function rollUnique(rng: Rng, item: Item, base: ItemBase, ilvl: number, opts: GenOptions): boolean {
  const pool = opts.forceUniqueId ? UNIQUES.filter((u) => u.id === opts.forceUniqueId) : UNIQUES.filter((u) => u.base === base.id && u.lvl <= ilvl && !u.noRandomDrop);
  const u = rng.weighted(pool, (x) => x.rarity);
  if (u) {
    item.quality = 'unique';
    item.uniqueId = u.id;
    item.rolls = rollValues(rng, u.mods);
    item.sockets = addedSockets(u.mods, item.rolls, base);
    return true;
  }
  return false;
}

/** Objet de set de la base (ou celui demandé), bonus partiels ; faux si aucun n'est possible */
function rollSet(rng: Rng, item: Item, base: ItemBase, ilvl: number, opts: GenOptions): boolean {
  const pool = opts.forceSetId ? SET_ITEMS.filter((s) => s.id === opts.forceSetId) : SET_ITEMS.filter((s) => s.base === base.id && s.lvl <= ilvl);
  const s = rng.weighted(pool, (x) => x.rarity);
  if (s) {
    item.quality = 'set';
    item.setId = s.id;
    item.rolls = rollValues(rng, s.mods);
    item.setRolls = rollValues(
      rng,
      (s.partial ?? []).flatMap((p) => p.mods),
    );
    item.sockets = addedSockets(s.mods, item.rolls, base);
    return true;
  }
  return false;
}

/** Rare PD2 : nombre d'affixes selon l'ilvl, au plus 3 préfixes et 3 suffixes, au moins un de chaque si possible ; faux sans aucun affixe */
function rollRare(rng: Rng, item: Item, base: ItemBase, ilvl: number, alvl: number): boolean {
  item.quality = 'rare';
  item.rareName = rareName(rng, base);
  // PD2 : nombre d'affixes selon l'ilvl, au plus 3 préfixes et 3 suffixes, au moins un de chaque si possible
  const n = rareAffixCount(rng, base, ilvl);
  item.affixes = [];
  const used = new Set<string>();
  let pre = 0;
  let suf = 0;
  for (let i = 0; i < n; i++) {
    let kind: 'prefix' | 'suffix';
    if (i === 0) kind = 'prefix';
    else if (i === 1) kind = 'suffix';
    else if (pre >= 3) kind = 'suffix';
    else if (suf >= 3) kind = 'prefix';
    else kind = rng.chance(0.5) ? 'prefix' : 'suffix';
    const pool = eligibleAffixes(base, alvl, kind, true, used);
    const a = rng.weighted(pool, (x) => x.freq);
    if (!a) continue;
    used.add(a.group);
    item.affixes.push({ id: a.id, values: rollValues(rng, a.mods) });
    if (kind === 'prefix') pre++;
    else suf++;
  }
  if (item.affixes.length === 0) {
    item.quality = 'magic';
    return false;
  }
  item.sockets = affixSockets(item, base);
  return true;
}

/** Magique : D2 1/4 préfixe seul, 1/4 suffixe seul, 1/2 les deux (PD2 : les deux au-delà d'un seuil d'ilvl) ; grands charmes « skiller » */
function rollMagic(rng: Rng, item: Item, base: ItemBase, ilvl: number, alvl: number): void {
  item.quality = 'magic';
  item.affixes = [];
  const used = new Set<string>();
  // D2 : 1/4 préfixe seul, 1/4 suffixe seul, 1/2 les deux ; PD2 : les deux garantis au-delà d'un seuil d'ilvl
  const roll = ilvl >= magicTwoAffixIlvl(base) ? 0.5 : rng.next();
  // sans affixe « skiller » dans la table (D2 : types d'ItemTypes.txt, pas de confort), aucun tirage
  const skiller = base.type === 'grandcharm' && allowedAffixes(base, 'prefix', false).some(isSkillerAffix) && rng.chance(GRAND_CHARM_SKILLER_CHANCE);
  const wantPre = skiller || roll < 0.75;
  const wantSuf = roll >= 0.25;
  for (const kind of ['prefix', 'suffix'] as const) {
    if ((kind === 'prefix' && !wantPre) || (kind === 'suffix' && !wantSuf)) continue;
    let pool = eligibleAffixes(base, alvl, kind, false, used);
    if (skiller && kind === 'prefix') {
      const sk = pool.filter(isSkillerAffix);
      if (sk.length) pool = sk;
    }
    const a = rng.weighted(pool, (x) => x.freq);
    if (!a) continue;
    used.add(a.group);
    item.affixes.push({ id: a.id, values: rollValues(rng, a.mods) });
  }
  if (item.affixes.length === 0) {
    // aucun affixe possible : on retente l'autre type
    const pool = eligibleAffixes(base, alvl, wantPre ? 'suffix' : 'prefix', false, used);
    const a = rng.weighted(pool, (x) => x.freq);
    if (a) item.affixes.push({ id: a.id, values: rollValues(rng, a.mods) });
    else item.quality = 'normal';
  }
  item.sockets = affixSockets(item, base);
}

/** Normal ou supérieur (5-15 %) : châsses possibles (bases de mots runiques) */
function rollPlain(rng: Rng, item: Item, base: ItemBase, ilvl: number, q: Quality): void {
  item.quality = q === 'superior' ? 'superior' : 'normal';
  if (item.quality === 'superior') item.superiorPct = rng.range(5, 15);
  const maxS = maxSocketsForIlvl(base, ilvl);
  if (maxS > 0 && rng.chance(0.3)) item.sockets = rng.range(1, maxS);
}

/** Objet empilable (rune, gemme, potion, orbe) */
export function makeStack(rng: Rng, baseId: string, qty = 1): Item {
  if (!BASE_BY_ID[baseId]) throw new Error(`Base inconnue : ${baseId}`);
  return { uid: makeUid(rng.nextU32()), base: baseId, quality: 'normal', ilvl: 1, sockets: 0, socketed: [], qty };
}
