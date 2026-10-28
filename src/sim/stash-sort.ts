/**
 * Tri du coffre : objets rangés par catégorie, puis qualité décroissante, puis niveau et nom, et tassés sans trous
 * (les plus grands ne bloquent pas les petits : premier emplacement libre, page par page). Ne perd ni ne duplique jamais un objet :
 * si le nouveau rangement ne tient pas dans les pages disponibles, rien ne change.
 */
import { BASE_BY_ID } from '../data/items/bases';
import { STASH_TABS, type CharacterState } from './character';
import type { Item } from './item';
import { STASH_COLS, STASH_ROWS, itemSize, placeInStash } from './inventory';
import { SHARED_TABS } from './save';

const PAGE = STASH_COLS * STASH_ROWS;

/** Ordre des types d'objet : armes, armures (casque, torse, gants, bottes, ceinture), boucliers, bijoux, charmes, runes/gemmes/divers, cartes */
const TYPE_ORDER: string[] = [
  'sword',
  'dagger',
  'axe',
  'mace',
  'scepter',
  'wand',
  'staff',
  'orb',
  'polearm',
  'spear',
  'javelin',
  'thrown',
  'bow',
  'crossbow',
  'claw',
  'helm',
  'circlet',
  'pelt',
  'primal',
  'armor',
  'gloves',
  'boots',
  'belt',
  'shield',
  'head',
  'quiver',
  'amulet',
  'ring',
  'jewel',
  'grandcharm',
  'largecharm',
  'smallcharm',
  'rune',
  'gem',
  'currency',
  'potion',
  'tpot',
  'map',
];
const QUALITY_ORDER: Record<string, number> = { unique: 0, set: 1, runeword: 2, crafted: 3, rare: 3, magic: 4, superior: 5, normal: 6, low: 7 };

/** Rang de catégorie d'un objet (les cartes en dernier, les types inconnus avant elles) */
export function stashCategory(it: Item): number {
  if (it.map) return TYPE_ORDER.length - 1;
  const t = BASE_BY_ID[it.base]?.type ?? '';
  const i = TYPE_ORDER.indexOf(t);
  return i < 0 ? TYPE_ORDER.length - 2 : i;
}

/** Comparaison : catégorie, qualité (uniques, sets, mots runiques, rares, magiques, normaux), niveau décroissant, nom, uid (ordre total : tri idempotent) */
export function compareStash(a: Item, b: Item): number {
  return (
    stashCategory(a) - stashCategory(b) ||
    (QUALITY_ORDER[a.quality] ?? 9) - (QUALITY_ORDER[b.quality] ?? 9) ||
    (a.map && b.map ? b.map.tier - a.map.tier : 0) ||
    b.ilvl - a.ilvl ||
    a.base.localeCompare(b.base) ||
    (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0)
  );
}

const area = (it: Item): number => itemSize(it)[0] * itemSize(it)[1];

/** Range les objets dans `pages` vides : le premier emplacement libre de la première page qui convient. Faux si l'un d'eux ne tient nulle part. */
function pack(items: Item[], pages: (Item | null)[][]): boolean {
  for (const it of items) {
    let ok = false;
    for (const p of pages)
      if (placeInStash(p, it) >= 0) {
        ok = true;
        break;
      }
    if (!ok) return false;
  }
  return true;
}

/** Essaie l'ordre trié, puis (si la grille est trop fragmentée) les plus grands d'abord ; null si rien ne tient */
function layout(items: Item[], nPages: number): (Item | null)[][] | null {
  const sorted = [...items].sort(compareStash);
  const orders = [sorted, [...sorted].sort((a, b) => area(b) - area(a) || compareStash(a, b))];
  for (const o of orders) {
    const pages = Array.from({ length: nPages }, () => new Array<Item | null>(PAGE).fill(null));
    if (pack(o, pages)) return pages;
  }
  return null;
}

/** Trie et tasse une page du coffre ; faux (page intacte) si elle est introuvable ou si le rangement ne tient pas */
export function sortStashPage(c: CharacterState, tab: number): boolean {
  const page = c.stash[tab];
  if (!page) return false;
  const items = page.slice(0, PAGE).filter((x): x is Item => !!x);
  const out = layout(items, 1);
  if (!out) return false;
  // les cases au-delà de la grille (anciens coffres, objets hors grille) restent en fin de tableau
  const extra = page.slice(PAGE);
  c.stash[tab] = [...out[0], ...extra];
  return true;
}

/** Pages concernées par « tout trier » : les pages partagées si le coffre partagé est attaché, sinon toutes */
function sortablePages(c: CharacterState): number[] {
  const all = c.stash.map((_, i) => i);
  return c.stash.length > STASH_TABS ? all.slice(STASH_TABS) : all;
}

/**
 * Trie toutes les pages du coffre en un seul ordre continu et replie les objets sur les premières pages ;
 * les pages vides en fin de coffre partagé sont libérées (jusqu'au minimum de pages partagées).
 * Renvoie le nombre de pages libérées, ou -1 (rien modifié) si le rangement ne tient pas.
 */
export function sortAllStash(c: CharacterState): number {
  const idx = sortablePages(c);
  if (!idx.length) return -1;
  const items: Item[] = [];
  for (const i of idx) for (const it of c.stash[i].slice(0, PAGE)) if (it) items.push(it);
  const out = layout(items, idx.length);
  if (!out) return -1;
  idx.forEach((i, k) => {
    c.stash[i] = [...out[k], ...c.stash[i].slice(PAGE)];
  });
  let freed = 0;
  if (c.stash.length > STASH_TABS) {
    while (c.stash.length > STASH_TABS + SHARED_TABS && !c.stash[c.stash.length - 1].some(Boolean)) {
      c.stash.pop();
      freed++;
    }
  }
  return freed;
}

/* ------------------------------------------------------------------ */
/* Annulation de la dernière opération (tri, « tout au coffre »)        */
/* ------------------------------------------------------------------ */

export interface StashSnapshot {
  inventory: (Item | null)[];
  stash: (Item | null)[][];
  mapStash: Item[] | undefined;
  materials: Record<string, number>;
}

export function takeSnapshot(c: CharacterState): StashSnapshot {
  return { inventory: c.inventory.slice(), stash: c.stash.map((p) => p.slice()), mapStash: c.mapStash?.slice(), materials: { ...c.materials } };
}

export function restoreSnapshot(c: CharacterState, s: StashSnapshot): void {
  c.inventory = s.inventory.slice();
  c.stash = s.stash.map((p) => p.slice());
  if (s.mapStash) c.mapStash = s.mapStash.slice();
  else delete c.mapStash;
  c.materials = { ...s.materials };
}

/** Empreinte du contenu (uid par case) du sac, des charmes, de la ceinture, de l'équipement, du coffre, des cartes et des matériaux : l'annulation n'est permise que si rien d'autre n'a bougé depuis */
export function stashSignature(c: CharacterState): string {
  const u = (a: (Item | null)[]): string => a.map((x) => x?.uid ?? '').join(',');
  return [
    u(c.inventory),
    u(c.charmInv),
    c.stash.map(u).join('|'),
    (c.mapStash ?? []).map((x) => x.uid).join(','),
    JSON.stringify(c.materials),
    Object.entries(c.equipment)
      .map(([k, v]) => `${k}:${v?.uid}`)
      .join(','),
    c.belt.map((b) => b.qty).join(','),
  ].join('#');
}
