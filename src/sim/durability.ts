/**
 * Durabilité des armes et armures (D2 / PD2) : usure à l'usage, objet brisé (sans bonus ni défense) à 0, réparation chez les forgerons.
 * `Item.dur` = durabilité actuelle ; absent = intact. Maximum = durabilité de base (armor/weapons.txt). « Indestructible » : jamais d'usure.
 */
import { BASE_DURABILITY } from '../data/items/durability';
import type { Slot } from '../data/types';
import { baseOf, itemFinal, itemName } from './itemstats';
import type { Item } from './item';
import type { CharacterState } from './character-state';
import type { World } from './world';

const ARMOR_SLOTS: Slot[] = ['head', 'body', 'gloves', 'boots', 'belt', 'offhand'];

/**
 * Durabilité active ? Réglage du joueur (app.ts : `Settings.durability`, désactivée par défaut dans l'application) ; vrai par défaut du module,
 * donc pour les tests et les bots. Désactivée : aucune usure, plus d'objet brisé, plus de réparation à payer.
 */
let durabilityOn = true;
export function setDurabilityEnabled(v: boolean): void {
  durabilityOn = v;
}
export function durabilityEnabled(): boolean {
  return durabilityOn;
}

/** Durabilité maximale (0 : l'objet n'en a pas : bijoux, charmes…) */
export function maxDurability(item: Item): number {
  return BASE_DURABILITY[item.base] ?? 0;
}

export function isIndestructible(item: Item): boolean {
  return itemFinal(item, 1).mods.some((m) => m.stat === 'indestructible');
}

export function durabilityOf(item: Item): number {
  const m = maxDurability(item);
  return m > 0 ? Math.min(m, item.dur ?? m) : 0;
}

/** Objet brisé : plus aucun effet tant qu'il n'est pas réparé */
export function isBroken(item: Item): boolean {
  return durabilityOn && maxDurability(item) > 0 && durabilityOf(item) <= 0;
}

/** Use l'objet de `n` points (jamais sous 0) ; renvoie vrai si l'objet vient de se briser */
export function wear(item: Item, n = 1): boolean {
  if (!durabilityOn) return false;
  const m = maxDurability(item);
  if (m <= 0 || isIndestructible(item)) return false;
  const before = durabilityOf(item);
  item.dur = Math.max(0, before - n);
  return before > 0 && item.dur === 0;
}

/** Un coup physique reçu use une pièce d'armure (1 fois sur 4) ; renvoie l'objet brisé, le cas échéant */
export function wearOnHit(w: World): Item | null {
  if (w.rng.combat.float(0, 1) > 0.25) return null;
  const c = w.character;
  const pieces = ARMOR_SLOTS.map((s) => c.equipment[s]).filter((x): x is Item => !!x && maxDurability(x) > 0 && !isBroken(x));
  if (!pieces.length) return null;
  const it = pieces[w.rng.combat.int(pieces.length)];
  return wear(it) ? it : null;
}

/** Une attaque qui touche use l'arme (1 fois sur 12) */
export function wearWeapon(w: World): Item | null {
  const it = w.character.equipment.mainhand;
  if (!it || w.rng.combat.float(0, 1) > 1 / 12) return null;
  return wear(it) ? it : null;
}

/** Suite d'une usure : un objet brisé coupe ses bonus (recalcul) et prévient le joueur */
export function announceBroken(w: World, it: Item | null): void {
  if (!it) return;
  w.refreshPlayer();
  w.events.push({ t: 'message', text: `${itemName(it)} est brisé : à réparer chez un forgeron`, color: '#e8604a' });
}

/** Prix de réparation d'un objet : proportionnel à la durabilité perdue et à la valeur de l'objet */
export function repairCost(it: Item): number {
  if (!durabilityOn) return 0;
  const m = maxDurability(it);
  if (m <= 0) return 0;
  const lost = m - durabilityOf(it);
  if (lost <= 0) return 0;
  const b = baseOf(it);
  return Math.max(1, Math.round(((b.price + it.ilvl * 8) * lost) / m / 3));
}

/** Objets équipés (armes et armures), ceux du mercenaire compris (réparés avec ceux du joueur) */
function equippedGear(c: CharacterState): Item[] {
  const own = (['mainhand', 'offhand', 'head', 'body', 'gloves', 'boots', 'belt'] as Slot[]).map((s) => c.equipment[s]);
  return [...own, ...Object.values(c.merc?.equipment ?? {})].filter((x): x is Item => !!x && maxDurability(x) > 0);
}

export function repairAllCost(c: CharacterState): number {
  return equippedGear(c).reduce((s, it) => s + repairCost(it), 0);
}

/** Répare tout l'équipement porté contre de l'or ; renvoie le prix payé, ou null si l'or manque */
export function repairAll(c: CharacterState): number | null {
  const cost = repairAllCost(c);
  if (cost > c.gold) return null;
  c.gold -= cost;
  for (const it of equippedGear(c)) delete it.dur;
  return cost;
}
