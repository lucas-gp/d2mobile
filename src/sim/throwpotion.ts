/** Potions de jet (D2) : réserve dédiée, lancer en arc, explosion de feu ou nuage de poison. Ne blesse jamais le joueur ni ses alliés. */
import { dist } from '../core/math';
import { BASE_BY_ID } from '../data/items';
import { GAS_HIT_SECS, THROW_POTIONS, THROW_STACK_MAX, gasDps, type ThrowDef } from '../data/throwpotions';
import type { CharacterState } from './character-state';
import type { DamagePacket } from './actors';
import { emptyPacket } from './actors';
import { TICK_HZ } from './constants';
import { spawnArea, spawnMissile } from './missiles';
import { explode } from './explosion';
import type { World } from './world';

/** Portée maximale d'un lancer (cases) et recharge (ticks, 1 s) */
const THROW_RANGE = 10;
const THROW_COOLDOWN = TICK_HZ;

export const isThrowPotion = (baseId: string): boolean => baseId in THROW_POTIONS;

function throwStock(c: CharacterState): Record<string, number> {
  return (c.throwPots ??= {});
}

/** Quantité totale de potions de jet portées */
export function throwTotal(c: CharacterState): number {
  return Object.values(c.throwPots ?? {}).reduce((n, q) => n + q, 0);
}

/** Type de potion qui sera lancé : la sélection si elle reste en stock, sinon la plus forte portée */
export function throwSelected(c: CharacterState): string | null {
  const s = c.throwPots ?? {};
  if (c.throwSel && (s[c.throwSel] ?? 0) > 0) return c.throwSel;
  let best: string | null = null;
  for (const id of Object.keys(THROW_POTIONS)) if ((s[id] ?? 0) > 0 && (!best || (BASE_BY_ID[id]?.qlvl ?? 0) > (BASE_BY_ID[best]?.qlvl ?? 0))) best = id;
  return best;
}

/** Range une pile de potions de jet dans la réserve (25 par type). Renvoie la quantité qui n'a pas pu entrer. */
export function addThrowPotions(c: CharacterState, baseId: string, qty: number): number {
  const s = throwStock(c);
  const room = Math.max(0, THROW_STACK_MAX - (s[baseId] ?? 0));
  const put = Math.min(room, qty);
  if (put > 0) {
    s[baseId] = (s[baseId] ?? 0) + put;
    c.throwSel = baseId;
  }
  return qty - put;
}

/** Complète la réserve avec les piles du même type rangées dans le sac (surplus ramassé quand la réserve était pleine) */
function refillFromBag(c: CharacterState, baseId: string): void {
  const s = throwStock(c);
  for (let i = 0; i < c.inventory.length; i++) {
    const it = c.inventory[i];
    if (!it || it.base !== baseId) continue;
    const room = THROW_STACK_MAX - (s[baseId] ?? 0);
    if (room <= 0) return;
    const take = Math.min(room, it.qty ?? 1);
    s[baseId] = (s[baseId] ?? 0) + take;
    if ((it.qty ?? 1) - take <= 0) c.inventory[i] = null;
    else it.qty = (it.qty ?? 1) - take;
  }
}

/** Dégâts d'un type de potion de feu (tirage des bornes de D2) */
function throwFirePacket(def: ThrowDef, rnd: () => number): DamagePacket {
  const pk = emptyPacket(false);
  const roll = (r: [number, number]) => r[0] + rnd() * (r[1] - r[0]);
  if (def.phys) pk.phys = roll(def.phys);
  if (def.fire) pk.fire = roll(def.fire);
  return pk;
}

/** Poison des gaz : à l'impact puis en nuage */
function gasPacket(dps: number, secs: number): DamagePacket {
  const pk = emptyPacket(false);
  pk.poisonDot = { dps, ticks: Math.round(secs * TICK_HZ) };
  return pk;
}

/** Détails d'info-bulle : texte des dégâts de la potion */
export function throwDescription(baseId: string): string[] {
  const d = THROW_POTIONS[baseId];
  if (!d) return [];
  if (d.kind === 'fire') {
    return [`Dégâts physiques : ${d.phys![0]}-${d.phys![1]}`, `Dégâts de feu : ${d.fire![0]}-${d.fire![1]}`, `Rayon : ${d.radius} cases`];
  }
  const hit = Math.round(gasDps(d.hitPoison!) * GAS_HIT_SECS);
  const cloud = Math.round(gasDps(d.cloudPoison!) * d.cloudSecs!);
  return [`Poison à l'impact : ${hit} sur ${GAS_HIT_SECS} s`, `Nuage : ${Math.round(gasDps(d.cloudPoison!))} poison par seconde pendant ${d.cloudSecs} s (${cloud})`, `Rayon : ${d.radius} cases`];
}

/** Lance la potion sélectionnée vers (tx, ty). Faux si impossible (ville, mort, recharge, stock vide). */
export function throwPotion(w: World, tx: number, ty: number): boolean {
  const p = w.player;
  const c = w.character;
  if (w.zone.town || p.dead || w.tick < (w.throwReadyTick ?? 0)) return false;
  const id = throwSelected(c);
  if (!id) return false;
  const def = THROW_POTIONS[id];
  const s = throwStock(c);
  s[id]--;
  if (s[id] <= 0) delete s[id];
  w.throwReadyTick = w.tick + THROW_COOLDOWN;
  refillFromBag(c, id);
  // portée limitée : le tir tombe au plus loin à THROW_RANGE
  const d = dist(p.x, p.y, tx, ty);
  if (d > THROW_RANGE) {
    tx = p.x + ((tx - p.x) / d) * THROW_RANGE;
    ty = p.y + ((ty - p.y) / d) * THROW_RANGE;
  }
  const ang = Math.atan2(ty - p.y, tx - p.x);
  p.facing = ang;
  const idx = Object.keys(THROW_POTIONS).indexOf(id);
  const pk = def.kind === 'fire' ? throwFirePacket(def, () => w.rng.combat.next()) : gasPacket(gasDps(def.hitPoison!), GAS_HIT_SECS);
  const m = spawnMissile(w, {
    kind: 'throw_potion',
    team: 0,
    owner: p.id,
    x: p.x,
    y: p.y,
    angle: ang,
    speed: 11,
    radius: 0.3,
    range: Math.max(1, d) + 1,
    dmg: pk,
    elem: def.kind === 'fire' ? 'fire' : 'poison',
    tx,
    ty,
    aux: idx,
    z: 1.2,
  });
  w.events.push({ t: 'potion', kind: 'throw' });
  return !!m;
}

/** Effet à l'arrivée de la potion (appelé par missiles.ts) */
export function throwImpact(w: World, m: { aux: number; x: number; y: number; dmg: DamagePacket; owner: number }): void {
  const def = THROW_POTIONS[Object.keys(THROW_POTIONS)[m.aux]];
  if (!def) return;
  if (def.kind === 'fire') {
    explode(w, 0, m.x, m.y, def.radius, m.dmg, 'throw_fire', 'fire', m.owner);
    return;
  }
  // gaz : poison de l'impact sur la zone, puis nuage persistant
  explode(w, 0, m.x, m.y, def.radius, m.dmg, 'poison_cloud', 'poison', m.owner);
  spawnArea(w, {
    kind: 'gas_cloud',
    team: 0,
    owner: m.owner,
    x: m.x,
    y: m.y,
    radius: def.radius,
    ticks: Math.round(def.cloudSecs! * TICK_HZ),
    every: 5,
    dmg: gasPacket(gasDps(def.cloudPoison!), 2),
    elem: 'poison',
  });
}
