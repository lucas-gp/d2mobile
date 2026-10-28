/**
 * Inventaire, ceinture, matériaux, équipement et coffre. Toutes les opérations sont atomiques :
 * un objet n'est jamais perdu ni dupliqué (déplacement = retrait puis ajout, avec retour
 * arrière si l'ajout échoue).
 */
import { potionTierAt } from './potion-tier';
import { BASE_BY_ID } from '../data/items/bases';
import { baseSize } from '../data/items/sizes';
import '../data/items/index';
import type { Slot } from '../data/types';
import { dist } from '../core/math';
import { AUTO_PICKUP_RADIUS } from './constants';
import type { GroundItem } from './actors';
import { STASH_TABS, beltCapacity, canWear, computeDerived, CHARM_COLS, CHARM_ROWS, isCharmType, type CharacterState } from './character';
import { addMapToStash, mapMeetsPickup, mapStashFull } from './mapstash-core';
import type { Item } from './item';
import { addThrowPotions, isThrowPotion } from './throwpotion';
import { baseOf, itemName } from './itemstats';
import { quiverFits } from '../data/items/quivers';
import { mapPickupOf, shouldAutoPickup, shouldAutoPickupCfg } from './loot/filter';
import type { World } from './world';

export function isMaterial(item: Item): boolean {
  const b = BASE_BY_ID[item.base];
  return !!b && (b.type === 'rune' || b.type === 'gem' || (b.type === 'currency' && b.id !== 'gold'));
}

/* ------------------------------------------------------------------ */
/* Grille de l'inventaire : 10 × 4 cases, un objet occupe w × h cases    */
/* (comme Diablo II). `c.inventory[i]` garde l'objet à l'indice de sa     */
/* case en haut à gauche ; les autres cases qu'il couvre restent à null.  */
/* ------------------------------------------------------------------ */

export const INV_COLS = 10;
/** Rangées de l'inventaire d'origine (module neutre, tests, bots) */
export const INV_BASE_ROWS = 4;
/** Rangées du « grand inventaire » (réglage bigInventory) : le double, ajouté en dessous */
export const INV_BIG_ROWS = 8;
/**
 * Rangées actuelles de la grille. Liaison modifiable (ES module : les importeurs la voient à jour) ; seule `setInventoryRows`
 * l'écrit, appelée par `Game` quand le réglage `bigInventory` est appliqué. Absent / faux = 4 rangées (comportement historique).
 */
export let INV_ROWS = INV_BASE_ROWS;

/** Fixe le nombre de rangées (4 ou 8) ; renvoie la valeur retenue */
export function setInventoryRows(rows: number): number {
  INV_ROWS = rows >= INV_BIG_ROWS ? INV_BIG_ROWS : INV_BASE_ROWS;
  return INV_ROWS;
}

/** Complète le tableau avec des cases vides jusqu'à la taille de la grille (jamais de rétrécissement) */
export function padInventory(c: CharacterState): void {
  const n = INV_COLS * INV_ROWS;
  for (let i = 0; i < n; i++) if (c.inventory[i] === undefined) c.inventory[i] = null;
}

/**
 * Passe le personnage à `rows` rangées. Agrandir ne déplace rien (les premières rangées gardent leurs indices). Réduire replie ce qui
 * occupe les rangées supprimées dans les cases libres, sinon dans le coffre ; si ça ne tient pas, rien ne change et la fonction renvoie faux
 * (jamais de perte). Les objets hors grille d'une ancienne taille sont aussi ramenés dans la grille par `repairInventory`.
 */
export function resizeInventory(c: CharacterState, rows: number): boolean {
  const target = rows >= INV_BIG_ROWS ? INV_BIG_ROWS : INV_BASE_ROWS;
  if (target >= INV_ROWS) {
    setInventoryRows(target);
    padInventory(c);
    repairInventory(c);
    return true;
  }
  // réduction transactionnelle : on essaie sur des copies, on valide seulement si tout est rangé
  const before = { rows: INV_ROWS, inv: c.inventory.slice(), stash: c.stash.map((t) => t.slice()), charm: c.charmInv?.slice() };
  setInventoryRows(target);
  repairInventory(c);
  const keep = target * INV_COLS;
  const spill = c.inventory.slice(keep).some((x) => !!x); // rien de rangé hors grille ne doit rester
  if (spill) {
    setInventoryRows(before.rows);
    c.inventory.splice(0, c.inventory.length, ...before.inv);
    c.stash.forEach((t, i) => t.splice(0, t.length, ...before.stash[i]));
    if (before.charm && c.charmInv) c.charmInv.splice(0, c.charmInv.length, ...before.charm);
    return false;
  }
  c.inventory.length = Math.max(keep, 0);
  return true;
}

/** Taille d'un objet en cases (largeur, hauteur) */
export function itemSize(item: Item): [number, number] {
  const b = BASE_BY_ID[item.base];
  return b ? baseSize(b) : [1, 1];
}

/** Cases couvertes par chaque objet d'une grille `cols × rows` (indice de l'objet, ou -1) */
export function occupancyOf(cells: (Item | null)[], cols: number, rows: number, ignore = -1): Int16Array {
  const occ = new Int16Array(cols * rows).fill(-1);
  cells.forEach((it, i) => {
    if (!it || i === ignore || i >= cols * rows) return;
    const [w, h] = itemSize(it);
    const x0 = i % cols;
    const y0 = Math.floor(i / cols);
    for (let y = y0; y < Math.min(rows, y0 + h); y++) for (let x = x0; x < Math.min(cols, x0 + w); x++) occ[y * cols + x] = i;
  });
  return occ;
}

function fitsIn(occ: Int16Array, cols: number, rows: number, w: number, h: number, idx: number): boolean {
  const x0 = idx % cols;
  const y0 = Math.floor(idx / cols);
  if (x0 + w > cols || y0 + h > rows) return false;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (occ[y * cols + x] >= 0) return false;
  return true;
}

/** Première position libre d'une grille (ligne par ligne) pour cet objet ; -1 si rien ne convient */
export function findSlotIn(cells: (Item | null)[], cols: number, rows: number, item: Item, ignore = -1): number {
  const [w, h] = itemSize(item);
  const occ = occupancyOf(cells, cols, rows, ignore);
  for (let i = 0; i < cols * rows; i++) if (fitsIn(occ, cols, rows, w, h, i)) return i;
  return -1;
}

/* Inventaire des charmes (PD2) : grille 10 × 4 réservée aux charmes, qui y sont actifs sans prendre de place dans le sac */
export { CHARM_COLS, CHARM_ROWS };
export const isCharm = (item: Item): boolean => isCharmType(baseOf(item).type);

function charmCells(c: CharacterState): (Item | null)[] {
  return (c.charmInv ??= new Array(CHARM_COLS * CHARM_ROWS).fill(null));
}

function hasRoomInCharmInv(c: CharacterState, item: Item): boolean {
  return isCharm(item) && findSlotIn(charmCells(c), CHARM_COLS, CHARM_ROWS, item) >= 0;
}

/** Range un charme dans la grille des charmes ; renvoie son indice, -1 si plein ou si ce n'est pas un charme */
export function placeInCharmInv(c: CharacterState, item: Item): number {
  if (!isCharm(item)) return -1;
  return placeIn(charmCells(c), CHARM_COLS, CHARM_ROWS, item);
}

/** Du sac vers la grille des charmes (« Ranger dans les charmes ») */
export function stowCharm(c: CharacterState, invIndex: number): boolean {
  const it = c.inventory[invIndex];
  if (!it || !isCharm(it) || !hasRoomInCharmInv(c, it)) return false;
  c.inventory[invIndex] = null;
  placeInCharmInv(c, it);
  return true;
}

/** De la grille des charmes vers le sac (le charme y devient inactif) */
export function unstowCharm(c: CharacterState, idx: number): boolean {
  const cells = charmCells(c);
  const it = cells[idx];
  if (!it || !hasRoomFor(c, it)) return false;
  cells[idx] = null;
  placeInInventory(c, it);
  return true;
}

/** Pose un objet dans une grille ; renvoie son indice, -1 si plein */
export function placeIn(cells: (Item | null)[], cols: number, rows: number, item: Item): number {
  const i = findSlotIn(cells, cols, rows, item);
  if (i >= 0) cells[i] = item;
  return i;
}

/** Étal du marchand : grille 10 × 10 du panneau d'échange */
export const VENDOR_COLS = 10;
export const VENDOR_ROWS = 10;

/** Position (case, largeur, hauteur) de chaque objet d'une liste rangée dans une grille, dans l'ordre ; null si l'objet ne rentre pas */
export function packList(items: Item[], cols: number, rows: number): ({ col: number; row: number; w: number; h: number } | null)[] {
  const cells: (Item | null)[] = new Array(cols * rows).fill(null);
  return items.map((it) => {
    const i = placeIn(cells, cols, rows, it);
    if (i < 0) return null;
    const [w, h] = itemSize(it);
    return { col: i % cols, row: Math.floor(i / cols), w, h };
  });
}

/** Onglet de coffre : grille 10 × 8, comme le panneau d'échange de Diablo II */
export const STASH_COLS = 10;
export const STASH_ROWS = 8;
export const placeInStash = (tab: (Item | null)[], item: Item): number => placeIn(tab, STASH_COLS, STASH_ROWS, item);
export const hasRoomInStash = (tab: (Item | null)[], item: Item): boolean => findSlotIn(tab, STASH_COLS, STASH_ROWS, item) >= 0;

/** Ordre de dépôt automatique dans le coffre : pages partagées d'abord (le coffre est unique), pages personnelles ensuite */
export function stashOrder(c: CharacterState): number[] {
  const all = c.stash.map((_, i) => i);
  return c.stash.length > STASH_TABS ? [...all.slice(STASH_TABS), ...all.slice(0, STASH_TABS)] : all;
}

/** Ancien coffre (cases de 1 × 1, 48 cases sur 8 colonnes) : objets replacés dans la grille 10 × 8 selon leur taille, les plus grands d'abord */
export function relayoutStash(tab: (Item | null)[]): (Item | null)[] {
  if (tab.length >= STASH_COLS * STASH_ROWS) return tab;
  const items = tab.filter((x): x is Item => !!x).sort((a, b) => itemSize(b)[0] * itemSize(b)[1] - itemSize(a)[0] * itemSize(a)[1]);
  const out: (Item | null)[] = new Array(STASH_COLS * STASH_ROWS).fill(null);
  const left: Item[] = [];
  for (const it of items) if (placeInStash(out, it) < 0) left.push(it);
  // rien ne doit se perdre : ce qui ne tient pas (en théorie jamais) reste en fin de tableau, hors grille
  for (const it of left) out.push(it);
  return out;
}

/** Pour chaque case : indice de l'objet qui la couvre, ou -1 */
export function occupancy(c: CharacterState, ignore = -1): Int16Array {
  const occ = new Int16Array(INV_COLS * INV_ROWS).fill(-1);
  c.inventory.forEach((it, i) => {
    if (!it || i === ignore) return;
    const [w, h] = itemSize(it);
    const x0 = i % INV_COLS;
    const y0 = Math.floor(i / INV_COLS);
    for (let y = y0; y < Math.min(INV_ROWS, y0 + h); y++) for (let x = x0; x < Math.min(INV_COLS, x0 + w); x++) occ[y * INV_COLS + x] = i;
  });
  return occ;
}

function fits(occ: Int16Array, w: number, h: number, idx: number): boolean {
  const x0 = idx % INV_COLS;
  const y0 = Math.floor(idx / INV_COLS);
  if (x0 + w > INV_COLS || y0 + h > INV_ROWS) return false;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (occ[y * INV_COLS + x] >= 0) return false;
  return true;
}

/** Première position libre (en lisant ligne par ligne) pour un objet de cette taille ; -1 si rien ne convient. `ignore` = objet à ne pas compter (déplacement) */
export function findSlot(c: CharacterState, item: Item, ignore = -1): number {
  const [w, h] = itemSize(item);
  const occ = occupancy(c, ignore);
  for (let i = 0; i < INV_COLS * INV_ROWS; i++) if (fits(occ, w, h, i)) return i;
  return -1;
}

/** Y a-t-il de la place pour cet objet ? */
export function hasRoomFor(c: CharacterState, item: Item): boolean {
  return findSlot(c, item) >= 0;
}

/** Y a-t-il de la place pour tous ces objets à la fois ? */
function hasRoomForAll(c: CharacterState, items: Item[]): boolean {
  const copy = c.inventory.slice();
  const probe = { inventory: copy } as CharacterState;
  for (const it of items) {
    const i = findSlot(probe, it);
    if (i < 0) return false;
    copy[i] = it;
  }
  return true;
}

/** Pose un objet à la première place libre ; renvoie son indice, -1 si plein */
export function placeInInventory(c: CharacterState, item: Item): number {
  const i = findSlot(c, item);
  if (i >= 0) {
    while (c.inventory.length < i) c.inventory.push(null);
    c.inventory[i] = item;
  }
  return i;
}

/**
 * Remet l'inventaire d'aplomb : objets qui se chevauchent ou dépassent la grille (anciennes sauvegardes en cases de 1 × 1, ajout oublié ailleurs)
 * sont replacés à la première place libre, à défaut dans le coffre.
 */
export function repairInventory(c: CharacterState): void {
  repairCharmInv(c);
  const items: Item[] = [];
  const occ = new Int16Array(INV_COLS * INV_ROWS).fill(-1);
  const keep: (Item | null)[] = new Array(c.inventory.length).fill(null);
  c.inventory.forEach((it, i) => {
    if (!it) return;
    const [w, h] = itemSize(it);
    if (i < INV_COLS * INV_ROWS && fits(occ, w, h, i)) {
      keep[i] = it;
      const x0 = i % INV_COLS;
      const y0 = Math.floor(i / INV_COLS);
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) occ[y * INV_COLS + x] = i;
    } else items.push(it);
  });
  if (!items.length) return; // rien ne chevauche
  c.inventory.splice(0, c.inventory.length, ...keep);
  // les plus grands d'abord pour qu'ils trouvent de la place
  items.sort((a, b) => itemSize(b)[0] * itemSize(b)[1] - itemSize(a)[0] * itemSize(a)[1]);
  for (const it of items) {
    if (placeInInventory(c, it) >= 0) continue;
    const t = stashOrder(c)
      .map((i) => c.stash[i])
      .find((tab) => hasRoomInStash(tab, it));
    if (t) placeInStash(t, it);
    else c.inventory.push(it); // dernier recours : hors grille, jamais perdu (visible dans le tri)
  }
}

/** Grille des charmes : ce qui n'est pas un charme, chevauche ou dépasse retourne dans le sac (jamais perdu) */
function repairCharmInv(c: CharacterState): void {
  const cells = charmCells(c);
  const stray: Item[] = [];
  const keep: (Item | null)[] = new Array(CHARM_COLS * CHARM_ROWS).fill(null);
  cells.forEach((it, i) => {
    if (!it) return;
    if (i < keep.length && isCharm(it) && fitsAt(keep, CHARM_COLS, CHARM_ROWS, it, i)) keep[i] = it;
    else stray.push(it);
  });
  if (!stray.length && cells.length === keep.length) return;
  c.charmInv = keep;
  for (const it of stray) if (!addToCharacter(c, it)) c.inventory.push(it);
}

/** Ajoute un objet au personnage (or, ceinture, matériaux ou inventaire). Renvoie faux si plein. */
export function addToCharacter(c: CharacterState, item: Item): boolean {
  const b = BASE_BY_ID[item.base];
  if (!b) return false;
  if (b.id === 'gold') {
    c.gold += item.qty ?? 1;
    return true;
  }
  if (b.type === 'potion') {
    const kind = b.id === 'hp_potion' ? 'heal' : b.id === 'mp_potion' ? 'mana' : 'rejuv';
    const slot = c.belt.find((s) => s.kind === kind);
    if (!slot) return false;
    const cap = beltCapacity(c);
    if (slot.qty >= cap) return false;
    // palier de la potion d'après son niveau d'objet (0 à 4, table unique src/sim/potion-tier.ts) ; la pile garde la moyenne de ses potions (un seul haut palier ne relève plus tout le tas)
    const t = potionTierAt(item.ilvl);
    slot.tier = Math.round((slot.tier * slot.qty + t) / (slot.qty + 1));
    slot.qty++;
    return true;
  }
  if (isThrowPotion(b.id)) {
    // potion de jet : réserve dédiée (25 par type) ; le surplus reste dans le sac
    const left = addThrowPotions(c, b.id, item.qty ?? 1);
    if (left <= 0) return true;
    item.qty = left;
    return placeInInventory(c, item) >= 0;
  }
  if (isMaterial(item)) {
    // runes, gemmes, clés et monnaies : rangées d'office dans les onglets du coffre (Runes, Gemmes, Matériaux), sans prendre de place
    c.materials[b.id] = (c.materials[b.id] ?? 0) + (item.qty ?? 1);
    return true;
  }
  // PD2 : un charme va d'abord dans l'inventaire des charmes (actif), puis dans le sac s'il n'y a plus de place
  if (isCharm(item) && placeInCharmInv(c, item) >= 0) return true;
  return placeInInventory(c, item) >= 0;
}

/** Nombre de cases libres de l'inventaire */
export function inventoryFree(c: CharacterState): number {
  return occupancy(c).filter((v) => v < 0).length;
}

export function pickupGroundItem(w: World, gi: GroundItem): boolean {
  const idx = w.items.indexOf(gi);
  if (idx < 0) return false;
  const c = w.character;
  // cartes : au coffre de cartes si le joueur a activé le ramassage automatique des cartes (même en les touchant), sinon au sac
  const maps = mapPickupOf(w.autoCfg);
  if (gi.item.map && maps && maps !== 'none' && addMapToStash(c, gi.item)) {
    w.items.splice(idx, 1);
    if (gi.mirror) w.seam?.pickedMirror?.(gi);
    w.events.push({ t: 'message', text: 'Carte ajoutée au coffre de cartes', color: '#9bd' });
    w.events.push({ t: 'pickup', uid: gi.item.uid, name: itemName(gi.item), kind: 'misc' });
    return true;
  }
  const b = BASE_BY_ID[gi.item.base];
  if (!addToCharacter(c, gi.item)) {
    // la potion reste au sol : on dit pourquoi (ceinture pleine), au lieu de ne rien afficher
    w.events.push({ t: 'message', text: b?.type === 'potion' ? 'Ceinture pleine' : 'Inventaire plein', color: '#d66' });
    return false;
  }
  w.items.splice(idx, 1);
  // lot 312: a neighbour's item shown here: taken out of its own zone too
  if (gi.mirror) w.seam?.pickedMirror?.(gi);
  if (b?.id === 'gold') w.events.push({ t: 'goldPickup', amount: gi.item.qty ?? 1 });
  else w.events.push({ t: 'pickup', uid: gi.item.uid, name: itemName(gi.item), kind: b?.type ?? 'misc' });
  // les charmes modifient les stats
  if (b && ['smallcharm', 'largecharm', 'grandcharm'].includes(b.type)) w.refreshPlayer();
  return true;
}

const mapFullMsgTick = new WeakMap<World, number>();

/** Ramassage automatique dans un petit rayon autour du joueur */
export function tryAutoPickup(w: World): void {
  if (w.items.length === 0) return;
  const p = w.player;
  const c = w.character;
  // runes, gemmes, potions : balayage toutes les 5 ticks, en zone de jeu seulement (pas en ville)
  const cfg = w.autoCfg && w.run && w.tick % 5 === 0 ? w.autoCfg : null;
  for (let i = w.items.length - 1; i >= 0; i--) {
    const gi = w.items[i];
    if (w.tick - gi.dropTick < 8) continue; // laisse le temps de voir tomber l'objet
    if (dist(p.x, p.y, gi.x, gi.y) > AUTO_PICKUP_RADIUS) continue;
    if (!shouldAutoPickup(c, gi.item) && !(cfg && shouldAutoPickupCfg(c, gi.item, cfg))) {
      // carte qui serait ramassée si le coffre de cartes n'était pas plein : on le dit (une fois toutes les ~10 s)
      if (cfg && gi.item.map && mapStashFull(c) && mapMeetsPickup(gi.item, mapPickupOf(cfg)) && w.tick - (mapFullMsgTick.get(w) ?? -1e9) > 200) {
        mapFullMsgTick.set(w, w.tick);
        w.events.push({ t: 'message', text: 'Coffre de cartes plein : carte laissée au sol', color: '#d66' });
      }
      continue;
    }
    pickupGroundItem(w, gi);
  }
}

const BELT_KIND_BASE = { heal: 'hp_potion', mana: 'mp_potion', rejuv: 'rejuv_potion' } as const;

/**
 * Remplissage automatique de la ceinture depuis les potions du sac (une potion à la fois, tier moyenné comme au
 * ramassage). Renvoie le nombre de potions transférées.
 */
export function refillBelt(c: CharacterState): number {
  const cap = beltCapacity(c);
  let moved = 0;
  for (const slot of c.belt) {
    for (let i = 0; i < c.inventory.length && slot.qty < cap; i++) {
      const it = c.inventory[i];
      if (!it || it.base !== BELT_KIND_BASE[slot.kind]) continue;
      if (!addToCharacter(c, it)) break;
      moved++;
      const left = (it.qty ?? 1) - 1;
      if (left > 0) {
        it.qty = left;
        i--; // même pile
      } else c.inventory[i] = null;
    }
  }
  return moved;
}

/* ------------------------------------------------------------------ */
/* Équipement                                                          */
/* ------------------------------------------------------------------ */

/** Emplacement cible pour un objet (anneau : premier libre, sinon anneau 1) */
export function targetSlot(c: CharacterState, item: Item): Slot | null {
  const b = baseOf(item);
  if (!b.slot) return null;
  if (b.slot === 'ring') return !c.equipment.ring1 ? 'ring1' : !c.equipment.ring2 ? 'ring2' : 'ring1';
  // double maniement : une deuxième arme à une main va dans la main gauche
  if (b.slot === 'mainhand' && canDualWield(c, item) && c.equipment.mainhand && !c.equipment.offhand) return 'offhand';
  return b.slot;
}

/**
 * Double maniement (D2) : le Barbare porte deux armes de mêlée à une main, l'Assassin deux
 * griffes. Ni deux mains, ni arc, ni orbe, ni bâton.
 */
export function canDualWield(c: CharacterState, item: Item): boolean {
  const b = baseOf(item);
  if (!b.dmg || b.twoHanded) return false;
  if (c.classId === 'assassin') return b.type === 'claw' && (!c.equipment.mainhand || baseOf(c.equipment.mainhand).type === 'claw');
  if (c.classId === 'barbarian') {
    const ok = (t: string) => ['sword', 'axe', 'mace', 'dagger', 'scepter', 'claw', 'thrown'].includes(t);
    return ok(b.type) && (!c.equipment.mainhand || (ok(baseOf(c.equipment.mainhand).type) && !baseOf(c.equipment.mainhand).twoHanded));
  }
  return false;
}

export interface EquipResult {
  ok: boolean;
  reason?: string;
}

/**
 * Équipe l'objet de l'inventaire `invIndex`. L'objet remplacé (et le bouclier si arme à deux
 * mains) retourne dans l'inventaire. Les prérequis de force/dextérité sont bloquants.
 */
export function equipFromInventory(c: CharacterState, invIndex: number, slotOverride?: Slot): EquipResult {
  const item = c.inventory[invIndex];
  if (!item) return { ok: false, reason: 'Aucun objet' };
  const slot = slotOverride ?? targetSlot(c, item);
  if (!slot) return { ok: false, reason: "Cet objet ne s'équipe pas" };
  const d = computeDerived(c, 0);
  const check = canWear(c, item, { str: d.str, dex: d.dex });
  if (!check.ok) return check;
  const b = baseOf(item);
  if (slot === 'offhand' && b.dmg && !canDualWield(c, item)) return { ok: false, reason: 'Une seule arme à la fois' };
  const isQuiver = b.type === 'quiver';
  if (isQuiver && !quiverFits(b, c.equipment.mainhand ? baseOf(c.equipment.mainhand) : null))
    return { ok: false, reason: b.id.endsWith('_bolts') ? 'Les carreaux demandent une arbalète en main' : 'Les flèches demandent un arc en main' };
  const returning: Item[] = [];
  const prev = c.equipment[slot];
  if (prev) returning.push(prev);
  const off = c.equipment.offhand;
  // le carquois reste en place si la nouvelle arme (arc ou arbalète à deux mains) est celle qu'il accompagne
  const keepQuiver = !!off && baseOf(off).type === 'quiver' && quiverFits(baseOf(off), b);
  if (b.twoHanded && off && !keepQuiver && !returning.includes(off)) returning.push(off);
  if (slot === 'mainhand' && off && baseOf(off).type === 'quiver' && !keepQuiver && !returning.includes(off)) returning.push(off);
  if (slot === 'offhand' && !isQuiver && c.equipment.mainhand && baseOf(c.equipment.mainhand).twoHanded) returning.push(c.equipment.mainhand);
  // place disponible une fois l'objet équipé retiré de la grille
  c.inventory[invIndex] = null;
  if (!hasRoomForAll(c, returning)) {
    c.inventory[invIndex] = item;
    return { ok: false, reason: 'Inventaire plein' };
  }
  for (const r of returning) {
    if (r === c.equipment.offhand) delete c.equipment.offhand;
    if (r === c.equipment.mainhand) delete c.equipment.mainhand;
  }
  c.equipment[slot] = item;
  for (const r of returning) placeInInventory(c, r);
  return { ok: true };
}

export function unequip(c: CharacterState, slot: Slot): EquipResult {
  const it = c.equipment[slot];
  if (!it) return { ok: false };
  if (!hasRoomFor(c, it)) return { ok: false, reason: 'Inventaire plein' };
  delete c.equipment[slot];
  placeInInventory(c, it);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Coffre                                                               */
/* ------------------------------------------------------------------ */

export function moveToStash(c: CharacterState, invIndex: number, tab: number): boolean {
  const it = c.inventory[invIndex];
  if (!it) return false;
  const t = c.stash[tab];
  if (!t) return false;
  if (!hasRoomInStash(t, it)) return false;
  c.inventory[invIndex] = null;
  placeInStash(t, it);
  return true;
}

export function moveFromStash(c: CharacterState, tab: number, stashIndex: number): boolean {
  const t = c.stash[tab];
  const it = t?.[stashIndex];
  if (!it) return false;
  if (!hasRoomFor(c, it)) return false;
  t[stashIndex] = null;
  placeInInventory(c, it);
  return true;
}

/** Emplacement d'une grille d'objets : sac du personnage ou onglet du coffre */
export type GridRef = { grid: 'inv' } | { grid: 'charm' } | { grid: 'stash'; tab: number };

function gridOf(c: CharacterState, r: GridRef): { cells: (Item | null)[]; cols: number; rows: number } | null {
  if (r.grid === 'inv') return { cells: c.inventory, cols: INV_COLS, rows: INV_ROWS };
  if (r.grid === 'charm') return { cells: charmCells(c), cols: CHARM_COLS, rows: CHARM_ROWS };
  const t = c.stash[r.tab];
  return t ? { cells: t, cols: STASH_COLS, rows: STASH_ROWS } : null;
}

/** L'objet tient-il à cette case (case de départ `at`) dans la grille, en ignorant la case `ignore` ? */
export function fitsAt(cells: (Item | null)[], cols: number, rows: number, item: Item, at: number, ignore = -1): boolean {
  const [w, h] = itemSize(item);
  return fitsIn(occupancyOf(cells, cols, rows, ignore), cols, rows, w, h, at);
}

/**
 * Glisser-déposer : déplace l'objet de la case `from` vers la case `to` (case en haut à gauche de l'objet), dans le sac ou le coffre.
 * Si la place est prise par un seul autre objet, les deux échangent leur place (si l'autre tient à l'ancienne place).
 */
export function moveItem(c: CharacterState, src: GridRef, from: number, dst: GridRef, to: number): boolean {
  const a = gridOf(c, src);
  const b = gridOf(c, dst);
  if (!a || !b || to < 0 || to >= b.cols * b.rows) return false;
  const item = a.cells[from];
  if (!item) return false;
  if (a.cells === b.cells && from === to) return true;
  // la grille des charmes n'accepte que des charmes (ni dépôt, ni échange avec autre chose)
  if (dst.grid === 'charm' && !isCharm(item)) return false;
  a.cells[from] = null;
  const place = (cells: (Item | null)[], at: number, it: Item) => {
    cells[at] = it;
  };
  if (fitsAt(b.cells, b.cols, b.rows, item, to)) {
    place(b.cells, to, item);
    return true;
  }
  // un seul objet gêne : échange
  const [w, h] = itemSize(item);
  const occ = occupancyOf(b.cells, b.cols, b.rows);
  const x0 = to % b.cols;
  const y0 = Math.floor(to / b.cols);
  const blockers = new Set<number>();
  if (x0 + w <= b.cols && y0 + h <= b.rows) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (occ[y * b.cols + x] >= 0) blockers.add(occ[y * b.cols + x]);
  if (blockers.size === 1) {
    const bi = [...blockers][0];
    const other = b.cells[bi]!;
    b.cells[bi] = null;
    if (src.grid === 'charm' && !isCharm(other)) {
      b.cells[bi] = other;
      a.cells[from] = item;
      return false;
    }
    if (fitsAt(b.cells, b.cols, b.rows, item, to) && (fitsAt(a.cells, a.cols, a.rows, other, from) || findSlotIn(a.cells, a.cols, a.rows, other) >= 0)) {
      place(b.cells, to, item);
      const back = fitsAt(a.cells, a.cols, a.rows, other, from) ? from : findSlotIn(a.cells, a.cols, a.rows, other);
      place(a.cells, back, other);
      return true;
    }
    b.cells[bi] = other;
  }
  a.cells[from] = item;
  return false;
}

/** Tri de la grille des charmes : gros charmes d'abord, puis rareté, tassés en haut à gauche */
function sortCharmInv(c: CharacterState): void {
  const order = ['unique', 'set', 'runeword', 'rare', 'crafted', 'magic', 'superior', 'normal', 'low'];
  const size = { grandcharm: 0, largecharm: 1, smallcharm: 2 } as Record<string, number>;
  const items = charmCells(c).filter((x): x is Item => !!x);
  const sorted = [...items].sort(
    (a, b) => (size[baseOf(a).type] ?? 3) - (size[baseOf(b).type] ?? 3) || order.indexOf(a.quality) - order.indexOf(b.quality) || baseOf(a).id.localeCompare(baseOf(b).id),
  );
  const cells: (Item | null)[] = new Array(CHARM_COLS * CHARM_ROWS).fill(null);
  if (sorted.every((it) => placeIn(cells, CHARM_COLS, CHARM_ROWS, it) >= 0)) c.charmInv = cells;
}

/** Tri de l'inventaire : équipement par emplacement puis rareté, puis tassé en haut à gauche (les plus grands d'abord si l'ordre ne tient pas) */
export function sortInventory(c: CharacterState): void {
  sortCharmInv(c);
  const order = ['unique', 'set', 'runeword', 'rare', 'crafted', 'magic', 'superior', 'normal', 'low'];
  const items = c.inventory.filter((x): x is Item => !!x);
  const bySlot = (a: Item, b: Item) => {
    const ba = baseOf(a);
    const bb = baseOf(b);
    return (ba.slot ?? 'z').localeCompare(bb.slot ?? 'z') || order.indexOf(a.quality) - order.indexOf(b.quality);
  };
  const area = (it: Item) => itemSize(it)[0] * itemSize(it)[1];
  const attempts: ((a: Item, b: Item) => number)[] = [bySlot, (a, b) => area(b) - area(a) || bySlot(a, b)];
  for (const cmp of attempts) {
    const sorted = [...items].sort(cmp);
    const probe = { inventory: new Array(c.inventory.length).fill(null) } as unknown as CharacterState;
    if (sorted.every((it) => placeInInventory(probe, it) >= 0)) {
      c.inventory = probe.inventory;
      padInventory(c);
      return;
    }
  }
}
