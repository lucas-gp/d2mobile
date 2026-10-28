/**
 * Runes et gemmes : objets réels (une case d'inventaire chacun) ou stock de l'onglet de runes du coffre (`c.materials`, quantités empilées).
 * Les sertissages et le Cube puisent dans les deux : cases du Cube, inventaire, onglet de runes.
 */
import { BASE_BY_ID } from '../data/items/bases';
import type { CharacterState } from './character-state';
import type { Item } from './item';
import { findSlotIn, fitsAt, INV_COLS, INV_ROWS, placeIn, placeInInventory } from './inventory';

/** Grille du Cube horadrique : 3 colonnes × 4 lignes comme dans D2R (12 cases dans `c.cube`) */
export const CUBE_COLS = 3;
export const CUBE_ROWS = 4;

/** Rune ou gemme (les clés et monnaies restent des quantités dans l'onglet) */
export function isLooseKind(item: Item): boolean {
  const t = BASE_BY_ID[item.base]?.type;
  return t === 'rune' || t === 'gem';
}

let seq = 0;
const unitItem = (id: string, _n: number): Item => ({ uid: `${id}-m${++seq}`, base: id, quality: 'normal', ilvl: 1, sockets: 0, socketed: [], qty: 1 });

function physical(c: CharacterState, id: string): number {
  let n = 0;
  for (const it of c.cube ?? []) if (it && it.base === id) n += it.qty ?? 1;
  for (const it of c.inventory) if (it && it.base === id) n += it.qty ?? 1;
  return n;
}

/** Quantité disponible d'un matériau : onglet de runes + cases du Cube + inventaire */
export function matCount(c: CharacterState, id: string): number {
  return (c.materials[id] ?? 0) + physical(c, id);
}

/**
 * Retire `n` unités ; renvoie faux sans rien modifier s'il n'y en a pas assez. Ordre « visible » : Cube, inventaire, onglet de runes ;
 * ordre « onglet » : onglet d'abord (le Cube a déposé ses ingrédients dans l'onglet pour la durée de la recette).
 */
export function matTake(c: CharacterState, id: string, n: number, order: 'visible' | 'tab' = 'visible'): boolean {
  if (matCount(c, id) < n) return false;
  let left = n;
  const fromTab = () => {
    const t = Math.min(c.materials[id] ?? 0, left);
    if (t > 0) {
      c.materials[id] -= t;
      if (c.materials[id] === 0) delete c.materials[id];
      left -= t;
    }
  };
  const fromGrid = (cells: (Item | null)[]) => {
    for (let i = 0; i < cells.length && left > 0; i++) {
      const it = cells[i];
      if (!it || it.base !== id) continue;
      const q = it.qty ?? 1;
      if (q <= left) {
        cells[i] = null;
        left -= q;
      } else {
        it.qty = q - left;
        left = 0;
      }
    }
  };
  if (order === 'tab') fromTab();
  if (left > 0) fromGrid(c.cube ?? []);
  if (left > 0) fromGrid(c.inventory);
  if (left > 0) fromTab();
  return left === 0;
}

/** Pose une rune ou une gemme dans l'inventaire ; à défaut de place, elle va dans l'onglet de runes (jamais perdue) */
export function addLoose(c: CharacterState, item: Item): void {
  const qty = item.qty ?? 1;
  for (let k = 0; k < qty; k++) {
    const u = qty === 1 ? { ...item, qty: 1 } : unitItem(item.base, k);
    if (placeInInventory(c, u) < 0) c.materials[item.base] = (c.materials[item.base] ?? 0) + 1;
  }
}

/** Range une rune/gemme de l'inventaire (ou du Cube) dans l'onglet de runes */
export function depositToTab(c: CharacterState, from: 'inv' | 'cube', idx: number): boolean {
  const cells = from === 'inv' ? c.inventory : c.cube;
  const it = cells[idx];
  if (!it || !isLooseKind(it)) return false;
  cells[idx] = null;
  c.materials[it.base] = (c.materials[it.base] ?? 0) + (it.qty ?? 1);
  return true;
}

/** Range toutes les runes et gemmes de l'inventaire dans l'onglet de runes ; renvoie le nombre rangé */
export function depositAll(c: CharacterState): number {
  let n = 0;
  for (let i = 0; i < c.inventory.length; i++) if (depositToTab(c, 'inv', i)) n++;
  return n;
}

/** Sort `qty` unités de l'onglet de runes vers l'inventaire (une case chacune) ; renvoie le nombre sorti */
export function withdrawFromTab(c: CharacterState, id: string, qty = 1): number {
  let n = 0;
  while (n < qty && (c.materials[id] ?? 0) > 0) {
    if (placeInInventory(c, unitItem(id, n)) < 0) break;
    c.materials[id]--;
    if (c.materials[id] === 0) delete c.materials[id];
    n++;
  }
  return n;
}

/** Sort une unité de l'onglet de runes vers une case précise de l'inventaire (celle visée au glisser) ; à défaut, première place libre */
export function withdrawToCell(c: CharacterState, id: string, cell: number): boolean {
  if ((c.materials[id] ?? 0) <= 0) return false;
  const u = unitItem(id, 0);
  if (cell >= 0 && fitsAt(c.inventory, INV_COLS, INV_ROWS, u, cell)) c.inventory[cell] = u;
  else if (placeInInventory(c, u) < 0) return false;
  c.materials[id]--;
  if (c.materials[id] === 0) delete c.materials[id];
  return true;
}

/** Cases du Cube (objets) */
export function cubeItems(c: CharacterState): Item[] {
  return (c.cube ?? []).filter((x): x is Item => !!x);
}

/** Pose un objet de l'inventaire dans le Cube (première place libre) ; renvoie faux s'il n'y a pas de place */
export function cubeAdd(c: CharacterState, invIdx: number): boolean {
  const it = c.inventory[invIdx];
  if (!it) return false;
  if (findSlotIn(c.cube, CUBE_COLS, CUBE_ROWS, it) < 0) return false;
  c.inventory[invIdx] = null;
  placeIn(c.cube, CUBE_COLS, CUBE_ROWS, it);
  return true;
}

/** Reprend un objet du Cube : une rune, une gemme ou un matériau retourne dans son onglet du coffre, le reste dans l'inventaire (à défaut de place, il reste dans le Cube) */
export function cubeRemove(c: CharacterState, slot: number): boolean {
  const it = c.cube[slot];
  if (!it) return false;
  if (isLooseKind(it) || BASE_BY_ID[it.base]?.type === 'currency') {
    c.cube[slot] = null;
    c.materials[it.base] = (c.materials[it.base] ?? 0) + (it.qty ?? 1);
    return true;
  }
  if (placeInInventory(c, it) < 0) return false;
  c.cube[slot] = null;
  return true;
}

/** Pose une unité d'un matériau du coffre (rune, gemme, clé…) dans le Cube ; faux s'il n'y en a plus ou plus de place */
export function cubeFromTab(c: CharacterState, id: string): boolean {
  if ((c.materials[id] ?? 0) <= 0) return false;
  const u = unitItem(id, 0);
  if (findSlotIn(c.cube, CUBE_COLS, CUBE_ROWS, u) < 0) return false;
  c.materials[id]--;
  if (c.materials[id] === 0) delete c.materials[id];
  placeIn(c.cube, CUBE_COLS, CUBE_ROWS, u);
  return true;
}

/** Anciennes sauvegardes : les runes et gemmes physiques (inventaire, coffre) rejoignent les onglets du coffre */
export function stashLooseItems(c: CharacterState): number {
  let n = 0;
  const sweep = (cells: (Item | null)[]) => {
    for (let i = 0; i < cells.length; i++) {
      const it = cells[i];
      if (!it || !isLooseKind(it)) continue;
      cells[i] = null;
      c.materials[it.base] = (c.materials[it.base] ?? 0) + (it.qty ?? 1);
      n++;
    }
  };
  sweep(c.inventory);
  for (const t of c.stash ?? []) sweep(t);
  return n;
}
