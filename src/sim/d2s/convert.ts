/**
 * Conversion d'un personnage Diablo II lu par parse.ts vers une sauvegarde du jeu (SaveData) et un rapport d'import.
 * - Personnage : classe, niveau, expérience, points non dépensés, caractéristiques, compétences (par id du jeu), or, plus haute difficulté.
 * - Objets : base par code D2 ; uniques/sets/mots runiques par leur nom ; magiques/rares/artisanaux avec leurs propriétés converties en modificateurs
 *   du jeu (craftMods) ; châsses (gemmes, runes, joyaux) ; rangés à l'emplacement D2 (équipement, sac, coffre) ou, à défaut, à la première place libre.
 * - Mercenaire : type et sous-type D2 → mercenaire du jeu, équipement porté.
 * Ne touche jamais à un personnage existant : produit une nouvelle sauvegarde, que l'appelant range dans un nouvel emplacement.
 */
import { potionLevelOf } from '../potion-tier';
import { Rng } from '../../core/rng';
import { CLASSES, type ClassId } from '../../data/classes';
import { BASE_BY_ID } from '../../data/items/bases';
import { RARE_PREFIXES, RARE_SUFFIXES } from '../../data/items/rare-names';
import '../../data/items/index';
import { RUNEWORD_BY_ID, SET_ITEM_BY_ID, UNIQUE_BY_ID } from '../../data/items/index';
import { MERC_BY_ID, type MercId } from '../../data/mercs';
import { SKILL_BY_ID } from '../../data/skills';
import type { ItemBase, Slot, StatRoll } from '../../data/types';
import { xpToReach } from '../progression';
import { BASE_DURABILITY } from '../../data/items/durability';
import { newCharacter, type CharacterState } from '../character';
import { addToCharacter, isCharm, placeInCharmInv, isMaterial, fitsAt, INV_COLS, INV_ROWS, STASH_COLS, STASH_ROWS, placeInStash, canDualWield } from '../inventory';
import { makeUid, type Item, type Quality, type RolledMod } from '../item';
import { canMercEquip } from '../merc';
import { itemName } from '../itemstats';
import { DEFAULT_RULESET, SAVE_VERSION, withDefaultSettings, type SaveData } from '../save';
import { mapProps } from './props';
import { parseD2s, type D2sCharacter, type D2sItem, D2S_SKILL_BASE } from './parse';
import { D2S_TABLES, type D2sTables } from './tables';
import { activeRuleset } from '../../mods/activate';
import { RULES } from '../../mods/rules';

export interface ImportReport {
  name: string;
  classId: ClassId;
  level: number;
  /** Objets du personnage et du mercenaire importés */
  imported: number;
  /** Objets non importés : nom D2 (anglais) et raison */
  skipped: { name: string; reason: string }[];
  /** Objets importés de façon approximative (propriétés perdues ou mot runique inconnu) */
  approx: string[];
  /** Points de compétences remboursés (compétences D2 sans équivalent) */
  refundedSkillPoints: number;
  /** Remarques générales (codes, voir reportLines) */
  notes: string[];
  /** Mercenaire importé (nom) */
  merc?: string;
  /** Objets rangés dans le coffre faute de place dans le sac */
  toStash: number;
}

export interface ImportResult {
  save: SaveData;
  report: ImportReport;
}

export interface ConvertOptions {
  tables?: D2sTables;
  /** Date de sauvegarde (écran de sélection) ; absent : 1 (en fin de liste) */
  savedAt?: number;
}

/** Octets d'un .d2s → sauvegarde du jeu + rapport */
export function importD2s(bytes: Uint8Array, opts: ConvertOptions = {}): ImportResult {
  return convertD2s(parseD2s(bytes, { tables: opts.tables }), opts);
}

const EQ_SLOTS: Record<number, Slot> = { 1: 'head', 2: 'amulet', 3: 'body', 4: 'mainhand', 5: 'offhand', 6: 'ring1', 7: 'ring2', 8: 'belt', 9: 'boots', 10: 'gloves' };
const QUALITY: Record<number, Quality> = { 1: 'low', 2: 'normal', 3: 'superior', 4: 'magic', 5: 'set', 6: 'rare', 7: 'unique', 8: 'crafted' };
/** Objets divers sans intérêt dans le jeu : ignorés sans bruit dans le rapport */
const SILENT = new Set(['tbk', 'ibk', 'tsc', 'isc', 'aqv', 'cqv', 'gld', 'key']);

/** Nom de rare en français : même composition que la génération (suffixe + préfixe accordé) */
function rareNameOf(a: number, b: number): string | undefined {
  let pre = -1;
  let suf = -1;
  for (const id of [a, b]) {
    if (id >= 1 && id <= RARE_SUFFIXES.length) suf = id - 1;
    else if (id > RARE_SUFFIXES.length && id - RARE_SUFFIXES.length - 1 < RARE_PREFIXES.length) pre = id - RARE_SUFFIXES.length - 1;
  }
  if (pre < 0 || suf < 0) return undefined;
  const [m, f] = RARE_PREFIXES[pre];
  const s = RARE_SUFFIXES[suf];
  return `${s[0]} ${s[1] ? (f ?? m) : m}`;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** État partagé d'une conversion : fichier lu, tables, hasard (identifiants), rapport, personnage produit */
interface ConvertCtx {
  d: D2sCharacter;
  T: D2sTables;
  rng: Rng;
  report: ImportReport;
  c: CharacterState;
  /** Objets importés de façon approximative (noms listés à la fin du rapport) */
  approxItems: Set<Item>;
}

/** Objet du jeu produit d'après un objet D2 (null : non convertible, `why` renseigné) */
interface Built {
  item: Item | null;
  why?: string;
  approx?: boolean;
}

/** Emplacement D2 d'un objet rangé : sac ou page du coffre, case en haut à gauche */
type Where = { grid: 'inv' | 'stash'; x: number; y: number; tab?: number } | null;

/** Classes D2 dans l'ordre du fichier (D2S_SKILL_BASE est indexé ainsi) */
const D2_CLASS_ORDER: ClassId[] = ['amazon', 'sorceress', 'necromancer', 'paladin', 'barbarian', 'druid', 'assassin'];
/** Emplacements d'arme D2 : 4/5 = jeu d'armes I (main droite / gauche), 11/12 = jeu d'armes II */
const WEAPON_SET_I: [number, number] = [4, 5];
const WEAPON_SET_II: [number, number] = [11, 12];
/** Emplacements du mercenaire D2 → emplacements du jeu */
const MERC_SLOTS: Record<number, 'head' | 'body' | 'mainhand' | 'offhand'> = { 1: 'head', 3: 'body', 4: 'mainhand', 5: 'offhand' };
/** Emplacement D2 des objets (location) : 0 rangé, 1 équipé, 2 ceinture ; page : 1 sac, 4 Cube, 5 coffre */
const LOC_STORED = 0;
const LOC_EQUIPPED = 1;
const LOC_BELT = 2;
const PAGE_INV = 1;
const PAGE_CUBE = 4;
const PAGE_STASH = 5;

export function convertD2s(d: D2sCharacter, opts: ConvertOptions = {}): ImportResult {
  const T = opts.tables ?? D2S_TABLES;
  const rng = new Rng(`d2s:${d.name}:${d.level}`);
  const report: ImportReport = { name: d.name, classId: d.classId, level: d.level, imported: 0, skipped: [], approx: [], refundedSkillPoints: 0, notes: [], toStash: 0 };
  const c = newCharacter(d.name || CLASSES[d.classId].name, d.classId);
  c.respecs = 1;
  // la ceinture n'a que les potions du fichier
  for (const s of c.belt) s.qty = 0;
  importAttributes(c, d);
  importSkills(c, d, T, report);
  const ctx: ConvertCtx = { d, T, rng, report, c, approxItems: new Set<Item>() };
  importItems(ctx);
  if (d.truncated) addNote(report, 'truncated');
  if (d.corpseItems.length) addNote(report, 'corpse');
  if (d.golem) addNote(report, 'golem');
  importMerc(ctx);
  for (const it of ctx.approxItems) report.approx.push(itemName(it));
  const save: SaveData = { version: SAVE_VERSION, ruleset: activeRuleset() ?? DEFAULT_RULESET, character: c, settings: withDefaultSettings(), run: null, runCounter: 0, savedAt: opts.savedAt ?? 1 };
  return { save, report };
}

function addNote(report: ImportReport, n: string): void {
  if (!report.notes.includes(n)) report.notes.push(n);
}

/** Niveau (expérience gardée si cohérente avec le niveau), caractéristiques, points, or, plus haute difficulté atteinte */
function importAttributes(c: CharacterState, d: D2sCharacter): void {
  c.level = Math.max(1, Math.min(99, d.level));
  const lo = xpToReach(c.level);
  const hi = c.level >= 99 ? Infinity : xpToReach(c.level + 1) - 1;
  c.xp = d.attrs.experience >= lo && d.attrs.experience <= hi ? d.attrs.experience : lo;
  c.base = { str: d.attrs.strength, dex: d.attrs.dexterity, vit: d.attrs.vitality, ene: d.attrs.energy };
  c.statPoints = d.attrs.statPoints;
  c.skillPoints = d.attrs.skillPoints;
  c.gold = d.attrs.gold;
  c.stashGold = d.attrs.stashGold;
  // octet de progression (titre) : 5 = Normal fini, 10 = Cauchemar fini, 15 = Enfer fini
  const difficulty = Math.max(d.difficulty, d.baalDone[0] ? 1 : 0, d.baalDone[1] ? 2 : 0, d.progression >= 15 ? 2 : d.progression >= 10 ? 2 : d.progression >= 5 ? 1 : 0);
  c.progression.highestDifficulty = Math.min(2, Math.max(0, difficulty)) as 0 | 1 | 2;
}

/** Compétences par id du jeu (points remboursés pour celles sans équivalent) ; barre : les compétences actives les plus poussées */
function importSkills(c: CharacterState, d: D2sCharacter, T: D2sTables, report: ImportReport): void {
  const spent: [string, number][] = [];
  const base = D2S_SKILL_BASE[D2_CLASS_ORDER.indexOf(d.classId)];
  d.skills.forEach((pts, i) => {
    if (!pts) return;
    const gid = RULES['skills.d2sImport'](base + i, T.skills[String(base + i)]);
    if (gid && SKILL_BY_ID[gid]) {
      c.skills[gid] = (c.skills[gid] ?? 0) + pts;
      spent.push([gid, pts]);
    } else {
      c.skillPoints += pts;
      report.refundedSkillPoints += pts;
    }
  });
  const active = spent.filter(([id]) => !SKILL_BY_ID[id].passive && !SKILL_BY_ID[id].buff && SKILL_BY_ID[id].kind !== 'passive').sort((a, b) => b[1] - a[1]);
  if (active.length) c.hotbar.primary = active[0][0];
  c.hotbar.slots = Array.from({ length: 8 }, (_, i) => active[i + 1]?.[0] ?? null);
}

/**
 * Objets du personnage, armes d'abord (le jeu d'armes actif occupe les mains avant qu'un autre objet ne prenne la place) :
 * potions → ceinture, équipés → emplacement si compatible, coffre / Cube / sac → case D2 si libre, sinon première place libre.
 */
function importItems(ctx: ConvertCtx): void {
  const { d, T, c, rng } = ctx;
  const potions: Item[] = [];
  const isWeaponSlot = (it: D2sItem) => it.location === LOC_EQUIPPED && (it.equipped === WEAPON_SET_I[0] || it.equipped === WEAPON_SET_II[0]);
  const weaponsFirst = [...d.items].sort((a, b) => (isWeaponSlot(a) ? 0 : 1) - (isWeaponSlot(b) ? 0 : 1));
  const primary = d.activeWeaponSet ? WEAPON_SET_II : WEAPON_SET_I;
  for (const it of weaponsFirst) {
    const row = T.items[it.code];
    if (row?.[1].startsWith('pot:')) {
      const [, kind, tier] = row[1].split(':');
      const base = kind === 'heal' ? 'hp_potion' : kind === 'mana' ? 'mp_potion' : 'rejuv_potion';
      potions.push({ uid: makeUid(rng.nextU32()), base, quality: 'normal', ilvl: potionLevelOf(Number(tier) || 0), sockets: 0, socketed: [], qty: 1 });
      continue;
    }
    const item = handled(ctx, it, build(ctx, it));
    if (!item) continue;
    if (it.location === LOC_EQUIPPED) {
      equipOrPlace(ctx, it.equipped, item, primary);
      continue;
    }
    if (it.location === LOC_BELT) {
      if (item.qty !== undefined) addToCharacter(c, item);
      continue;
    }
    if (it.page === PAGE_STASH && it.location === LOC_STORED) place(ctx, item, { grid: 'stash', x: it.x, y: it.y, tab: 0 });
    else if (it.page === PAGE_CUBE && it.location === LOC_STORED) {
      addNote(ctx.report, 'cube');
      place(ctx, item, { grid: 'stash', x: 0, y: 0, tab: 1 });
    } else place(ctx, item, it.location === LOC_STORED && it.page === PAGE_INV ? { grid: 'inv', x: it.x, y: it.y } : null);
  }
  for (const p of potions) addToCharacter(c, p);
}

/** Objet équipé dans D2 : à son emplacement s'il est libre et compatible (arme du jeu d'armes inactif : rangée), sinon rangé */
function equipOrPlace(ctx: ConvertCtx, id: number, item: Item, primary: [number, number]): void {
  const c = ctx.c;
  let slot: Slot | null = null;
  if (id === primary[0]) slot = 'mainhand';
  else if (id === primary[1]) slot = 'offhand';
  else if (id === WEAPON_SET_I[0] || id === WEAPON_SET_I[1] || id === WEAPON_SET_II[0] || id === WEAPON_SET_II[1]) addNote(ctx.report, 'altweapons');
  else slot = EQ_SLOTS[id] ?? null;
  const b = BASE_BY_ID[item.base];
  const fits =
    slot !== null && !c.equipment[slot] && (b.slot === slot || (b.slot === 'ring' && (slot === 'ring1' || slot === 'ring2')) || (slot === 'offhand' && b.slot === 'mainhand' && canDualWield(c, item)));
  if (slot !== null && fits) c.equipment[slot] = item;
  else place(ctx, item, null);
}

/** Mercenaire D2 → mercenaire du jeu (type, variante, nom) et son équipement (rangé chez le personnage s'il ne peut pas le porter) */
function importMerc(ctx: ConvertCtx): void {
  const { d, c, report } = ctx;
  if (!d.merc) return;
  const m = mercOf(d.merc.type);
  if (!m) {
    addNote(report, 'merc');
    return;
  }
  const t = MERC_BY_ID[m.type];
  c.merc = { type: m.type, variant: m.variant, name: t.names[d.merc.nameId % t.names.length], dead: d.merc.dead, equipment: {} };
  report.merc = c.merc.name;
  for (const it of d.mercItems) {
    const item = handled(ctx, it, build(ctx, it));
    if (!item) continue;
    const slot = MERC_SLOTS[it.equipped];
    const ok = slot ? canMercEquip(c, item, slot) : { ok: false };
    if (ok.ok && slot && !c.merc.equipment[slot]) c.merc.equipment[slot] = item;
    else place(ctx, item, null);
  }
}

function modsOf(T: D2sTables, props: D2sItem['props'], b: ItemBase): { mods: RolledMod[]; lost: number } {
  const m = mapProps(props, T, { armor: !!b.defense });
  return { mods: m.mods, lost: m.lost.length };
}

/** Objet du jeu d'après un objet D2 (null : non convertible, `why` renseigné) */
function build(ctx: ConvertCtx, it: D2sItem, depth = 0): Built {
  const { d, T, rng } = ctx;
  const row = T.items[it.code];
  if (it.isEar) return { item: null, why: 'oreille' };
  if (!row || !row[1]) return { item: null, why: 'objet inconnu du jeu' };
  const gid = row[1];
  if (gid.startsWith('pot:')) return { item: null, why: 'potion' };
  const b = BASE_BY_ID[gid];
  if (!b) return { item: null, why: 'objet inconnu du jeu' };
  const uid = makeUid(hash(`${d.name}:${it.code}:${depth}:${rng.nextU32()}`));
  const item: Item = { uid, base: b.id, quality: QUALITY[it.quality] ?? 'normal', ilvl: Math.max(1, Math.min(120, it.ilvl || 1)), sockets: 0, socketed: [] };
  if (it.simple) return { item: { ...item, quality: 'normal', qty: 1 } };
  if (it.ethereal) item.ethereal = true;
  if (b.defense && it.defense !== undefined) {
    // la défense du fichier inclut le bonus éthéré (× 1,5)
    const raw = it.ethereal ? Math.ceil(it.defense / 1.5) : it.defense;
    item.defRoll = Math.max(b.defense[0], Math.min(b.defense[1], raw));
  }
  const gmax = BASE_DURABILITY[b.id] ?? 0;
  if (gmax > 0 && it.maxDur && it.dur !== undefined && it.dur < it.maxDur) item.dur = Math.max(0, Math.round((it.dur / it.maxDur) * gmax));
  item.sockets = it.sockets;
  const props = modsOf(T, it.props, b);
  socketChildren(ctx, it, item, depth);
  if (it.runeword && it.runewordId) return applyRuneword(ctx, it, item, b, props.mods);
  return applyQuality(ctx, it, item, b, props);
}

/** Châsses : gemmes, runes et joyaux (les joyaux gardent leurs propriétés) ; tout autre objet serti est signalé et ignoré */
function socketChildren(ctx: ConvertCtx, it: D2sItem, item: Item, depth: number): void {
  const { T, rng, report } = ctx;
  for (const ch of it.children) {
    const r = T.items[ch.code];
    const cb = r && BASE_BY_ID[r[1]];
    if (!cb || !(cb.type === 'rune' || cb.type === 'gem' || cb.type === 'jewel')) {
      report.skipped.push({ name: r?.[2] ?? ch.code, reason: 'serti dans un objet : non importé' });
      continue;
    }
    const sub = cb.type === 'jewel' ? build(ctx, ch, depth + 1).item : ({ uid: makeUid(rng.nextU32()), base: cb.id, quality: 'normal', ilvl: 1, sockets: 0, socketed: [], qty: 1 } as Item);
    if (sub) item.socketed.push(sub);
  }
  if (item.socketed.length > item.sockets) item.sockets = item.socketed.length;
}

/** Mot runique connu du jeu : définition du jeu, valeurs du fichier ; inconnu : objet rare portant ses propriétés */
function applyRuneword(ctx: ConvertCtx, it: D2sItem, item: Item, b: ItemBase, mods: RolledMod[]): Built {
  const T = ctx.T;
  const [rwName, rwId] = T.runewords[String(it.runewordId)] ?? ['', ''];
  const rw = rwId ? RUNEWORD_BY_ID[rwId] : undefined;
  const rws = modsOf(T, it.rwProps, b);
  if (rw) {
    item.quality = 'runeword';
    item.runeword = rw.id;
    item.rolls = rolls(rw.mods, rws.mods);
    return { item, approx: false };
  }
  item.quality = 'rare';
  item.rareName = rwName || 'Mot runique';
  item.craftMods = [...mods, ...rws.mods];
  return { item, approx: true };
}

/**
 * Selon la qualité : unique/set par leur identifiant (définition du jeu, valeurs du fichier ; inconnus : rare nommé), magique/rare/artisanal
 * avec leurs propriétés converties en `craftMods` (le jeu n'a pas les affixes de D2), normal/supérieur avec ses bonus éventuels.
 */
function applyQuality(ctx: ConvertCtx, it: D2sItem, item: Item, b: ItemBase, props: { mods: RolledMod[]; lost: number }): Built {
  const T = ctx.T;
  const q = item.quality;
  let approx = false;
  switch (q) {
    case 'unique': {
      const [, uid2] = T.uniques[it.uniqueId] ?? ['', ''];
      const u = uid2 ? UNIQUE_BY_ID[uid2] : undefined;
      if (!u) return unknownNamed(item, props.mods, T.uniques[it.uniqueId]?.[0]);
      item.uniqueId = u.id;
      item.rolls = rolls(u.mods, props.mods);
      break;
    }
    case 'set': {
      const [, sid] = T.sets[it.setId] ?? ['', ''];
      const s = sid ? SET_ITEM_BY_ID[sid] : undefined;
      if (!s) return unknownNamed(item, props.mods, T.sets[it.setId]?.[0]);
      item.setId = s.id;
      item.rolls = rolls(s.mods, props.mods);
      break;
    }
    case 'magic': {
      item.craftMods = props.mods;
      const pre = it.magicPrefix ? T.prefixes[it.magicPrefix - 1] : undefined;
      const suf = it.magicSuffix ? T.suffixes[it.magicSuffix - 1] : undefined;
      item.importedName = [b.name, pre?.[1] || pre?.[0], suf?.[1] || suf?.[0]].filter(Boolean).join(' ');
      if (props.lost) approx = true;
      break;
    }
    case 'rare':
    case 'crafted': {
      item.craftMods = props.mods;
      item.rareName = rareNameOf(it.rareName1, it.rareName2) ?? (q === 'crafted' ? 'Objet artisanal' : 'Objet rare');
      if (props.lost) approx = true;
      break;
    }
    default:
      // normal, supérieur, abîmé : les bonus de qualité supérieure sont dans les propriétés
      if (props.mods.length) item.craftMods = props.mods;
  }
  return { item, approx };
}

/** Unique/set sans équivalent dans le jeu : objet rare nommé, propriétés converties */
function unknownNamed(item: Item, mods: RolledMod[], name?: string): { item: Item; approx: boolean } {
  item.quality = 'rare';
  item.rareName = name || 'Objet unique';
  item.craftMods = mods;
  return { item, approx: true };
}

/** Valeurs tirées d'un unique/set/mot runique : celles de l'objet D2 quand la statistique existe, sinon le minimum */
function rolls(defs: StatRoll[], got: RolledMod[]): number[] {
  const pool = got.map((m) => ({ ...m, used: false }));
  return defs.map((m) => {
    const e = pool.find((x) => !x.used && x.stat === m.stat && (x.param ?? '') === (m.param ?? ''));
    if (e) {
      e.used = true;
      return e.value;
    }
    return m.min;
  });
}

/** Place un objet : emplacement D2 d'abord (sac / coffre), sinon première place libre, sinon coffre */
function place(ctx: ConvertCtx, item: Item, where: Where): void {
  const { c, report } = ctx;
  if (isMaterial(item)) {
    addToCharacter(c, item);
    return;
  }
  // PD2 : les charmes du sac importé vont dans l'inventaire des charmes (actifs), à défaut dans le sac
  if (where?.grid === 'inv' && isCharm(item) && placeInCharmInv(c, item) >= 0) return;
  if (where && placeAtD2Cell(c, item, where)) return;
  if (where?.grid === 'stash') {
    for (const tab of c.stash) if (placeInStash(tab, item) >= 0) return;
  }
  if (addToCharacter(c, item)) {
    if (where?.grid === 'stash') report.toStash++;
    return;
  }
  for (const tab of c.stash) {
    if (placeInStash(tab, item) >= 0) {
      report.toStash++;
      return;
    }
  }
  c.inventory.push(item);
}

/** Pose l'objet à sa case D2 si elle est dans la grille du jeu et libre */
function placeAtD2Cell(c: CharacterState, item: Item, where: NonNullable<Where>): boolean {
  if (where.grid === 'inv') {
    const at = where.y * INV_COLS + where.x;
    if (where.x < INV_COLS && where.y < INV_ROWS && fitsAt(c.inventory, INV_COLS, INV_ROWS, item, at)) {
      c.inventory[at] = item;
      return true;
    }
    return false;
  }
  const tab = c.stash[where.tab ?? 0];
  const at = where.y * STASH_COLS + where.x;
  if (tab && where.x < STASH_COLS && where.y < STASH_ROWS && fitsAt(tab, STASH_COLS, STASH_ROWS, item, at)) {
    tab[at] = item;
    return true;
  }
  return false;
}

/** Compte l'objet au rapport (importé, approximatif, ou ignoré avec sa raison) ; rend l'objet du jeu ou null */
function handled(ctx: ConvertCtx, it: D2sItem, r: Built): Item | null {
  const { T, report } = ctx;
  const name = T.items[it.code]?.[2] ?? it.code;
  if (!r.item) {
    if (!SILENT.has(it.code) && !(it.simple && it.code === 'ear')) report.skipped.push({ name, reason: r.why ?? '' });
    return null;
  }
  report.imported++;
  if (r.approx) ctx.approxItems.add(r.item);
  return r.item;
}

/** Mercenaire D2 (identifiant de Hireling.txt) → type et variante du jeu */
function mercOf(id: number): { type: MercId; variant: string } | null {
  if (id >= 0 && id <= 5) return { type: 'rogue', variant: id % 2 === 0 ? 'fire' : 'cold' };
  if (id >= 6 && id <= 14) return { type: 'desert', variant: (['thorns', 'defiance', 'blessed_aim'] as const)[(id - 6) % 3] };
  if (id >= 15 && id <= 23) return { type: 'ironwolf', variant: (['fire', 'cold', 'light'] as const)[(id - 15) % 3] };
  if (id >= 24 && id <= 29) return { type: 'barbarian', variant: 'combat' };
  return null;
}

/** Phrases du rapport d'import (français ; traduites par le dictionnaire de l'interface) */
export function reportLines(r: ImportReport): string[] {
  const lines: string[] = [];
  lines.push(`Objets importés : ${r.imported}`);
  if (r.merc) lines.push(`Mercenaire importé : ${r.merc}`);
  if (r.refundedSkillPoints) lines.push(`Compétences sans équivalent dans le jeu : ${r.refundedSkillPoints} points remboursés`);
  const list = (names: string[]): string => {
    const counts = new Map<string, number>();
    for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
    const parts = [...counts].map(([n, k]) => (k > 1 ? `${n} ×${k}` : n));
    return parts.length > 8 ? `${parts.slice(0, 8).join(', ')}…` : parts.join(', ');
  };
  if (r.skipped.length) lines.push(`Objets non importés (${r.skipped.length}) : ${list(r.skipped.map((s) => s.name))}`);
  if (r.approx.length) lines.push(`Objets importés de façon approximative (${r.approx.length}) : ${list(r.approx)}`);
  if (r.toStash) lines.push(`Objets rangés dans le coffre faute de place : ${r.toStash}`);
  if (r.notes.includes('truncated')) lines.push('Une partie des objets du fichier n’a pas pu être lue (fichier tronqué ou variante non prise en charge) : les suivants sont ignorés.');
  if (r.notes.includes('altweapons')) lines.push('Les armes de l’emplacement alternatif sont rangées dans l’inventaire ou le coffre.');
  if (r.notes.includes('cube')) lines.push('Le contenu du Cube est rangé dans le coffre (onglet 2).');
  if (r.notes.includes('corpse')) lines.push('Les objets du cadavre ne sont pas importés.');
  if (r.notes.includes('golem')) lines.push('Le golem du Nécromancien n’est pas importé.');
  if (r.notes.includes('merc')) lines.push('Le mercenaire n’a pas d’équivalent dans le jeu : non importé.');
  return lines;
}
