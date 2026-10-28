/**
 * Liste de surbrillance du filtre de butin : des objets choisis dans toute la base de données s'affichent au sol dans
 * une couleur au choix (et peuvent être forcés visibles malgré le filtre). Absente ou vide : aucun effet.
 *
 * Espace d'identifiants (stable, sauvegardé tel quel) :
 * - `base:<id>`     une base d'objet (BASE_BY_ID) : armes, armures, bijoux, charmes, runes (`base:r15`), gemmes, joyaux, orbes, cartes…
 * - `unique:<id>`   un objet unique (UniqueDef.id = Item.uniqueId)
 * - `set:<id>`      une pièce de panoplie (SetItemDef.id = Item.setId)
 * - `runeword:<id>` un mot runique (RunewordDef.id = Item.runeword)
 * Un objet peut correspondre à plusieurs clés ; la plus précise l'emporte (unique, set, mot runique, puis base).
 */
import { BASE_BY_ID } from '../../data/items/bases';
import '../../data/items/index';
import { UNIQUE_BY_ID } from '../../data/items/uniques';
import { SET_ITEM_BY_ID } from '../../data/items/sets';
import { RUNEWORD_BY_ID } from '../../data/items/runewords';
import { UNIQUES } from '../../data/items/uniques';
import { SET_ITEMS } from '../../data/items/sets';
import { RUNEWORDS } from '../../data/items/runewords';
import { TYPE_GROUPS, type ItemType } from '../../data/types';
import type { Item } from '../item';
import type { HighlightEntry, LootFilterSettings } from '../lootfilter';
import { SHOW_GOOD } from './show';
import { catalogMaxTier } from './value';

/** Plafond d'entrées de la liste (sauvegarde et interface) : 300 entrées ≈ 12 Ko dans la sauvegarde du personnage */
export const MAX_HIGHLIGHTS = 300;

/** Palette (lisible sur sol sombre) : rouge, orange, jaune, citron vert, vert, cyan, bleu, violet, rose, blanc */
export const HIGHLIGHT_COLORS = [0xff4040, 0xff9028, 0xffe030, 0xa8ff30, 0x40e870, 0x30e0f0, 0x4a8cff, 0xb066ff, 0xff60d0, 0xffffff] as const;

/** Clés correspondant à un objet, de la plus précise à la plus générale */
export function highlightKeys(item: Item): string[] {
  const k: string[] = [];
  if (item.uniqueId && item.quality === 'unique') k.push(`unique:${item.uniqueId}`);
  if (item.setId) k.push(`set:${item.setId}`);
  if (item.runeword) k.push(`runeword:${item.runeword}`);
  k.push(`base:${item.base}`);
  return k;
}

/** Entrée de la liste qui s'applique à cet objet (la plus précise), ou undefined */
export function matchHighlight(f: Pick<LootFilterSettings, 'highlight'>, item: Item): HighlightEntry | undefined {
  const list = f.highlight;
  if (!list?.length) return undefined;
  for (const key of highlightKeys(item)) {
    const e = list.find((x) => x.id === key);
    if (e) return e;
  }
  return undefined;
}

/** Couleur de surbrillance d'un objet au sol (priorité sur la couleur de qualité), undefined hors liste */
export function highlightColor(f: Pick<LootFilterSettings, 'highlight'>, item: Item): number | undefined {
  return matchHighlight(f, item)?.color;
}

/** Palier d'affichage après surbrillance : un objet forcé est visible au moins « bon » même masqué par le filtre */
export function applyHighlightForce(f: Pick<LootFilterSettings, 'highlight'>, item: Item, show: number): number {
  if (show >= SHOW_GOOD || !f.highlight?.length) return show;
  return matchHighlight(f, item)?.force ? SHOW_GOOD : show;
}

/** Ajoute plusieurs objets d'un coup (même couleur ; ceux déjà présents gardent leur réglage), dans la limite du plafond. `added` : nombre ajouté */
export function withHighlights(list: HighlightEntry[] | undefined, ids: string[], color: number): { list: HighlightEntry[]; added: number } {
  const out = [...(list ?? [])];
  const have = new Set(out.map((x) => x.id));
  let added = 0;
  for (const id of ids) {
    if (have.has(id)) continue;
    if (out.length >= MAX_HIGHLIGHTS) break;
    have.add(id);
    out.push({ id, color });
    added++;
  }
  return { list: out, added };
}

/** Retire plusieurs objets de la liste */
export function withoutHighlights(list: HighlightEntry[] | undefined, ids: Iterable<string>): HighlightEntry[] {
  const rm = new Set(ids);
  return (list ?? []).filter((x) => !rm.has(x.id));
}

/** Applique une couleur à ceux des `ids` qui sont dans la liste */
export function recolorHighlights(list: HighlightEntry[] | undefined, ids: Iterable<string>, color: number): HighlightEntry[] {
  const set = new Set(ids);
  return (list ?? []).map((x) => (set.has(x.id) ? { ...x, color } : x));
}

/** Ajoute ou remplace une entrée (nouvelle liste ; plafonnée) */
export function withHighlight(list: HighlightEntry[] | undefined, e: HighlightEntry): HighlightEntry[] {
  const out = (list ?? []).filter((x) => x.id !== e.id);
  if (out.length >= MAX_HIGHLIGHTS) return list ?? [];
  return [...out, e];
}

/** Première couleur de la palette pas encore utilisée par la liste (sinon, on repart du début) */
export function nextHighlightColor(list: HighlightEntry[] | undefined): number {
  const used = new Set((list ?? []).map((x) => x.color));
  return HIGHLIGHT_COLORS.find((c) => !used.has(c)) ?? HIGHLIGHT_COLORS[(list?.length ?? 0) % HIGHLIGHT_COLORS.length];
}

/** Valide une liste lue d'une sauvegarde : entrées bien formées, sans doublon, plafonnée */
export function sanitizeHighlight(raw: unknown): HighlightEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: HighlightEntry[] = [];
  const seen = new Set<string>();
  for (const e of raw as Partial<HighlightEntry>[]) {
    if (!e || typeof e.id !== 'string' || !/^(base|unique|set|runeword):.+/.test(e.id) || seen.has(e.id)) continue;
    const color = typeof e.color === 'number' && e.color >= 0 && e.color <= 0xffffff ? Math.floor(e.color) : HIGHLIGHT_COLORS[0];
    seen.add(e.id);
    out.push(e.force ? { id: e.id, color, force: true } : { id: e.id, color });
    if (out.length >= MAX_HIGHLIGHTS) break;
  }
  return out;
}

/* ------------------------------ catalogue de recherche ------------------------------ */

export type HighlightCat = 'weapon' | 'armor' | 'helm' | 'shield' | 'gloves' | 'boots' | 'belt' | 'jewelry' | 'unique' | 'set' | 'runeword' | 'rune' | 'gem' | 'charm' | 'other';

/** Catégories de parcours, dans l'ordre d'affichage (chaque objet de la base appartient à exactement une) */
export const HIGHLIGHT_CATS: [HighlightCat, string][] = [
  ['weapon', 'Armes'],
  ['armor', 'Armures'],
  ['helm', 'Casques'],
  ['shield', 'Boucliers'],
  ['gloves', 'Gants'],
  ['boots', 'Bottes'],
  ['belt', 'Ceintures'],
  ['jewelry', 'Bijoux et joyaux'],
  ['unique', 'Uniques'],
  ['set', 'Sets'],
  ['runeword', 'Mots runiques'],
  ['rune', 'Runes'],
  ['gem', 'Gemmes'],
  ['charm', 'Charmes'],
  ['other', 'Divers'],
];

export interface CatalogEntry {
  id: string;
  name: string;
  cat: HighlightCat;
  /** Nom normalisé pour la recherche */
  norm: string;
  /** Niveau requis (équipement, uniques, sets, mots runiques) */
  lvl?: number;
  /** Palier de la base d'équipement : 0 normal, 1 exceptionnel, 2 élite */
  tier?: 0 | 1 | 2;
}

/** Minuscules sans accents */
export function normSearch(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/œ/g, 'oe');
}

let catalog: CatalogEntry[] | null = null;

/** Toute la base de données d'objets (construite une fois) */
export function highlightCatalog(): CatalogEntry[] {
  if (catalog) return catalog;
  const out: CatalogEntry[] = [];
  const add = (id: string, name: string, cat: HighlightCat, lvl?: number, tier?: 0 | 1 | 2) => out.push({ id, name, cat, norm: normSearch(name), lvl: lvl || undefined, tier });
  const catOf = (b: { type: string; slot?: string }): HighlightCat => {
    switch (b.type) {
      case 'rune':
        return 'rune';
      case 'gem':
        return 'gem';
      case 'smallcharm':
      case 'largecharm':
      case 'grandcharm':
        return 'charm';
      case 'jewel':
      case 'amulet':
      case 'ring':
        return 'jewelry';
      case 'armor':
        return 'armor';
      case 'helm':
      case 'circlet':
      case 'pelt':
      case 'primal':
        return 'helm';
      case 'shield':
      case 'head':
        return 'shield';
      case 'gloves':
        return 'gloves';
      case 'boots':
        return 'boots';
      case 'belt':
        return 'belt';
    }
    if (TYPE_GROUPS.weapon.includes(b.type as ItemType) || b.type === 'quiver') return 'weapon';
    return 'other';
  };
  for (const b of Object.values(BASE_BY_ID)) {
    if (!b.name || b.id === 'gold' || b.id === 'key') continue;
    add(`base:${b.id}`, b.name, catOf(b), b.reqLvl, b.tier);
  }
  for (const u of UNIQUES) if (UNIQUE_BY_ID[u.id] && !u.noRandomDrop) add(`unique:${u.id}`, u.name, /charm$/.test(BASE_BY_ID[u.base]?.type ?? '') ? 'charm' : 'unique', u.reqLvl);
  for (const s of SET_ITEMS) if (SET_ITEM_BY_ID[s.id]) add(`set:${s.id}`, s.name, 'set', s.reqLvl);
  for (const w of RUNEWORDS) if (RUNEWORD_BY_ID[w.id]) add(`runeword:${w.id}`, w.name, 'runeword', w.reqLvl);
  // ordre de parcours : catégorie, puis niveau requis, puis nom
  const order = new Map(HIGHLIGHT_CATS.map(([c], i) => [c, i] as const));
  out.sort((x, y) => order.get(x.cat)! - order.get(y.cat)! || (x.lvl ?? 0) - (y.lvl ?? 0) || x.name.localeCompare(y.name, 'fr'));
  catalog = out;
  return out;
}

/** Nom d'une entrée (pour la liste en cours) */
export function highlightName(id: string): string {
  const [kind, key] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)];
  switch (kind) {
    case 'base':
      return BASE_BY_ID[key]?.name ?? key;
    case 'unique':
      return UNIQUE_BY_ID[key]?.name ?? key;
    case 'set':
      return SET_ITEM_BY_ID[key]?.name ?? key;
    case 'runeword':
      return RUNEWORD_BY_ID[key]?.name ?? key;
  }
  return id;
}

/**
 * Recherche insensible aux accents et à la casse (tous les mots doivent figurer), `max` résultats.
 * `alt` : traduction du nom (anglais) ; un mot est trouvé s'il figure dans le nom français OU dans le nom traduit.
 */
export function searchCatalog(query: string, cat: HighlightCat | 'all', max = Infinity, alt?: (name: string) => string): CatalogEntry[] {
  const words = normSearch(query).split(/\s+/).filter(Boolean);
  const out: CatalogEntry[] = [];
  for (const e of highlightCatalog()) {
    if (cat !== 'all' && e.cat !== cat) continue;
    const other = alt && words.length ? normSearch(alt(e.name)) : '';
    if (words.every((w) => e.norm.includes(w) || (other !== '' && other.includes(w)))) {
      out.push(e);
      if (out.length >= max) break;
    }
  }
  return out;
}

/** Effectif de chaque catégorie (toute la base, sans filtre de texte) */
export function catalogCounts(): Record<HighlightCat | 'all', number> {
  const c = { all: 0 } as Record<HighlightCat | 'all', number>;
  for (const [k] of HIGHLIGHT_CATS) c[k] = 0;
  for (const e of highlightCatalog()) {
    c[e.cat]++;
    c.all++;
  }
  return c;
}

/** Liste recommandée : clés (`unique:…`, `set:…`, `runeword:…`) des objets exceptionnels du catalogue de valeur (palier >= 4), triées */
export function recommendedHighlights(): string[] {
  const out: string[] = [];
  for (const u of UNIQUES) if (catalogMaxTier('unique', u.id) >= 4) out.push(`unique:${u.id}`);
  for (const s of SET_ITEMS) if (catalogMaxTier('set', s.id) >= 4) out.push(`set:${s.id}`);
  for (const r of RUNEWORDS) if (catalogMaxTier('runeword', r.id) >= 4) out.push(`runeword:${r.id}`);
  return out.sort();
}
