/**
 * Recherche dans le coffre : texte libre (insensible aux accents et à la casse, tous les mots requis) sur le nom, la base, le type,
 * les modificateurs, les runes serties, les châsses et la qualité, plus filtres rapides (qualité, catégorie).
 * Index de recherche par objet mis en cache (uid + empreinte) : une frappe ne reconstruit rien.
 */
import { BASE_BY_ID } from '../data/items/bases';
import { TYPE_GROUPS } from '../data/types';
import { RUNEWORD_BY_ID } from '../data/items/runewords';
import { MAP_AFFIX_BY_ID } from '../data/maps';
import type { CharacterState } from './character-state';
import type { Item } from './item';
import { itemMods, itemName, modLabel } from './itemstats';

export type StashQuality = 'unique' | 'set' | 'rare' | 'magic' | 'runeword' | 'ethereal' | 'corrupted' | 'sockets';
export type StashCategory = 'weapons' | 'armor' | 'jewelry' | 'charms' | 'maps' | 'other';

/** Filtres rapides : au sein d'un groupe, un objet doit en vérifier au moins un (OU) ; les deux groupes se cumulent (ET) */
export interface StashFilters {
  quality?: readonly StashQuality[];
  category?: readonly StashCategory[];
}

/** Résultat : `tab` = page du coffre, ou -5 pour le coffre de cartes (`idx` = rang dans la liste) */
export interface StashHit {
  tab: number;
  idx: number;
  uid: string;
}

export const MAP_TAB = -5;

export const QUALITY_FILTERS: [StashQuality, string][] = [
  ['unique', 'Unique'],
  ['set', 'Set'],
  ['rare', 'Rare'],
  ['magic', 'Magique'],
  ['runeword', 'Runeword'],
  ['ethereal', 'Éthéré'],
  ['corrupted', 'Corrompu'],
  ['sockets', 'À châsses'],
];
export const CATEGORY_FILTERS: [StashCategory, string][] = [
  ['weapons', 'Armes'],
  ['armor', 'Armures'],
  ['jewelry', 'Bijoux'],
  ['charms', 'Charmes'],
  ['maps', 'Cartes'],
  ['other', 'Autres'],
];

// mêmes listes que les groupes de types des affixes et recettes (le carquois se range avec les armures)
const WEAPON_TYPES = new Set<string>(TYPE_GROUPS.weapon);
const ARMOR_TYPES = new Set<string>([...TYPE_GROUPS.armorAny, 'quiver']);
const JEWEL_TYPES = new Set(['amulet', 'ring', 'jewel']);
const CHARM_TYPES = new Set(['grandcharm', 'largecharm', 'smallcharm']);

/** Mots français (et anglais) du type d'objet, pour « épée », « casque », « sword »… */
const TYPE_WORDS: Record<string, string> = {
  staff: 'bâton baton staff',
  orb: 'orbe orb',
  wand: 'baguette wand',
  sword: 'épée epee sword',
  dagger: 'dague dagger',
  mace: 'masse mace',
  axe: 'hache axe',
  bow: 'arc bow',
  crossbow: 'arbalète arbalete crossbow',
  polearm: 'arme d’hast polearm',
  spear: 'lance spear',
  javelin: 'javelot javelin',
  claw: 'griffes griffe claw',
  scepter: 'sceptre scepter',
  thrown: 'arme de jet thrown',
  primal: 'casque primitif primal helm',
  head: 'tête réduite tete reduite head',
  circlet: 'diadème diademe circlet',
  helm: 'casque heaume helm',
  pelt: 'peau pelt',
  armor: 'armure plastron armor',
  shield: 'bouclier shield',
  gloves: 'gants gloves',
  boots: 'bottes boots',
  belt: 'ceinture belt',
  amulet: 'amulette amulet',
  ring: 'anneau bague ring',
  smallcharm: 'charme charm petit',
  largecharm: 'charme charm grand',
  grandcharm: 'charme charm grand',
  jewel: 'joyau jewel',
  rune: 'rune',
  gem: 'gemme gem',
  potion: 'potion',
  tpot: 'potion de jet',
  map: 'carte map',
  currency: 'objet',
  quiver: 'carquois quiver',
};

const QUALITY_WORDS: Record<string, string> = {
  unique: 'unique',
  set: 'set ensemble panoplie',
  rare: 'rare jaune',
  crafted: 'artisanal fabriqué fabrique crafted',
  magic: 'magique bleu magic',
  runeword: 'runeword mot runique',
  superior: 'supérieur superieur',
  low: 'abîmé abime',
};

/** Minuscules, sans accents, apostrophes typographiques unifiées */
export function normSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, "'").toLowerCase();
}

function categoryOf(it: Item): StashCategory {
  if (it.map) return 'maps';
  const t = BASE_BY_ID[it.base]?.type ?? '';
  if (WEAPON_TYPES.has(t)) return 'weapons';
  if (ARMOR_TYPES.has(t)) return 'armor';
  if (JEWEL_TYPES.has(t)) return 'jewelry';
  if (CHARM_TYPES.has(t)) return 'charms';
  return 'other';
}

const QUALITY_TESTS: Record<StashQuality, (it: Item) => boolean> = {
  unique: (it) => it.quality === 'unique',
  set: (it) => it.quality === 'set',
  rare: (it) => it.quality === 'rare' || it.quality === 'crafted',
  magic: (it) => it.quality === 'magic',
  runeword: (it) => !!it.runeword || it.quality === 'runeword',
  ethereal: (it) => !!it.ethereal,
  corrupted: (it) => !!it.corrupted,
  sockets: (it) => it.sockets > 0,
};

/** Étiquette de qualité pour la liste des résultats */
export function qualityLabel(it: Item): string {
  if (it.map) return 'Carte';
  if (it.runeword || it.quality === 'runeword') return 'Runeword';
  return (
    ({ unique: 'Unique', set: 'Set', rare: 'Rare', crafted: 'Artisanal', magic: 'Magique', superior: 'Supérieur', low: 'Abîmé', normal: 'Normal' } as Record<string, string>)[it.quality] ?? it.quality
  );
}

type Tr = (s: string) => string;
const same: Tr = (s) => s;

function fingerprint(it: Item): string {
  const m = it.map;
  return [
    it.base,
    it.quality,
    it.sockets,
    it.socketed.map((s) => s.base).join(','),
    it.ethereal ? 'e' : '',
    it.corrupted ? `c${it.corrupted.mods.length}${it.corrupted.outcome}` : '',
    it.runeword ?? '',
    it.uniqueId ?? '',
    it.setId ?? '',
    it.rareName ?? it.importedName ?? '',
    it.affixes?.map((a) => a.id + a.values.join('.')).join(',') ?? '',
    it.rolls?.join('.') ?? '',
    it.superiorPct ?? '',
    it.craftMods?.length ?? '',
    m ? `${m.zone}${m.tier}${m.mods.map((x) => x.id + x.value).join(',')}${m.fortified ? 'f' : ''}${m.heroic ? 'h' : ''}${m.corruptMod?.id ?? ''}` : '',
    it.qty ?? '',
  ].join('|');
}

/** Texte de recherche d'un objet (sans cache) */
export function buildSearchText(it: Item, tr: Tr = same): string {
  const parts: string[] = [];
  const add = (s: string): void => {
    if (!s) return;
    parts.push(s);
    const t = tr(s);
    if (t !== s) parts.push(t);
  };
  const b = BASE_BY_ID[it.base];
  add(itemName(it));
  if (b) {
    add(b.name);
    parts.push(TYPE_WORDS[b.type] ?? b.type);
    if (b.tier === 1) parts.push('exceptionnel exceptional');
    if (b.tier === 2) parts.push('élite elite');
  }
  parts.push(QUALITY_WORDS[it.quality] ?? it.quality);
  if (it.ethereal) parts.push('éthéré ethere ethereal');
  if (it.corrupted) parts.push('corrompu corrompue corrupted');
  if (it.sockets > 0) parts.push(`${it.sockets} châsse${it.sockets > 1 ? 's' : ''} chasse${it.sockets > 1 ? 's' : ''} socket${it.sockets > 1 ? 's' : ''} sockets châssé`);
  if (it.runeword) {
    const rw = RUNEWORD_BY_ID[it.runeword];
    if (rw) add(rw.name);
  }
  for (const s of it.socketed) {
    add(itemName(s));
    add(BASE_BY_ID[s.base]?.name ?? '');
  }
  if (it.map) {
    for (const mod of it.map.mods) {
      const a = MAP_AFFIX_BY_ID[mod.id];
      if (a) add(a.text.replace('{v}', String(mod.value)));
    }
    if (it.map.fortified) parts.push('fortifiée fortifiee');
    if (it.map.heroic) parts.push('héroïque heroique');
    if (it.map.catalyst) parts.push('infusée infusee');
    if (it.map.corruptMod) parts.push('corrompue');
  } else {
    try {
      for (const m of itemMods(it)) add(modLabel(m));
    } catch {
      /* objet incomplet : on garde le reste */
    }
  }
  return normSearch(parts.join(' \n '));
}

interface Cached {
  fp: string;
  lang: string;
  text: string;
}
const CACHE = new Map<string, Cached>();
const CACHE_MAX = 6000;

/** Index d'un objet, mis en cache par uid + empreinte (+ langue) */
function searchText(it: Item, opts: { tr?: Tr; lang?: string } = {}): string {
  const fp = fingerprint(it);
  const lang = opts.lang ?? '';
  const c = CACHE.get(it.uid);
  if (c && c.fp === fp && c.lang === lang) return c.text;
  const text = buildSearchText(it, opts.tr);
  if (CACHE.size >= CACHE_MAX) CACHE.clear();
  CACHE.set(it.uid, { fp, lang, text });
  return text;
}

export function clearSearchCache(): void {
  CACHE.clear();
}

export function searchCacheSize(): number {
  return CACHE.size;
}

export function hasStashSearch(query: string, filters?: StashFilters): boolean {
  return normSearch(query).trim().length > 0 || !!filters?.quality?.length || !!filters?.category?.length;
}

function passes(it: Item, filters?: StashFilters): boolean {
  const q = filters?.quality;
  if (q?.length && !q.some((k) => QUALITY_TESTS[k](it))) return false;
  const c = filters?.category;
  if (c?.length && !c.includes(categoryOf(it))) return false;
  return true;
}

/**
 * Objets du coffre (toutes les pages, puis le coffre de cartes) correspondant à la recherche. Sans texte ni filtre : liste vide.
 * Ordre : pages croissantes, puis cases dans la page, puis cartes.
 */
export function searchStash(c: Pick<CharacterState, 'stash' | 'mapStash'>, query: string, filters?: StashFilters, opts: { tr?: Tr; lang?: string } = {}): StashHit[] {
  if (!hasStashSearch(query, filters)) return [];
  const words = normSearch(query).split(/\s+/).filter(Boolean);
  const out: StashHit[] = [];
  const test = (it: Item): boolean => {
    if (!passes(it, filters)) return false;
    if (!words.length) return true;
    const text = searchText(it, opts);
    return words.every((w) => text.includes(w));
  };
  c.stash.forEach((page, tab) => {
    page.forEach((it, idx) => {
      if (it && test(it)) out.push({ tab, idx, uid: it.uid });
    });
  });
  (c.mapStash ?? []).forEach((it, idx) => {
    if (it && test(it)) out.push({ tab: MAP_TAB, idx, uid: it.uid });
  });
  return out;
}
