/**
 * Compétences de la Sorcière : une fonction par compétence (feu, froid, foudre), répartie par table.
 * Séparé de skill-cast.ts, qui garde l'attaque de base, les effets périodiques et l'aiguillage des classes.
 */
import { SKILL_BY_ID, lin, ramp, synergyPct } from '../data/skills';
import type {} from '../data/stats';
import { dist, distPointSegment, TAU } from '../core/math';
import { emptyPacket, type Monster } from './actors';
import { TICK_HZ } from './constants';
import { scalePacket, spawnArea, spawnMissile } from './missiles';
import type { World } from './world';
import { MONSTER_BY_ID } from '../data/monsters';
import { pickupGroundItem } from './inventory';
import { packetFor, tpPenalty, skillDamageRange, castFrames, addBuff, applyReduction, teleportPlayer, enchantDamage, makeSummon } from './skills';
import { RULES } from '../mods/rules';
import type { SorcSkill } from '../data/skills';

/** Contexte d'un lancer : monde, compétence, cible visée et angle de tir */
interface CastCtx {
  w: World;
  id: string;
  p: World['player'];
  ang: number;
  s: SorcSkill;
  L: number;
  tx: number;
  ty: number;
  targetId: number;
  range: number;
}

const buf: Monster[] = [];

function nearestTo(w: World, x: number, y: number, r: number): Monster | null {
  let best: Monster | null = null;
  let bd = r;
  for (const m of w.monstersNear(x, y, r, buf)) {
    const d = dist(x, y, m.x, m.y);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

function summonHydra(w: World, id: string, L: number, tx: number, ty: number): void {
  const p = w.player;
  const existing = w.monsters.filter((m) => m.isSummon && !m.dead);
  while (existing.length >= RULES['skills.sorceress']().maxHydras) {
    const oldest = existing.shift()!;
    oldest.dead = true;
    oldest.deathTick = w.tick;
  }
  const spot = w.grid.nearestFree(tx, ty, 3) ?? { x: p.x, y: p.y };
  const r = skillDamageRange(w, id, L);
  const ench = p.buffs.find((b) => b.id === 'enchant');
  const bonus = ench ? enchantDamage(w, 'enchant', ench.level) : [0, 0];
  const s = SKILL_BY_ID[id];
  const m: Monster = {
    ...makeSummon(w, MONSTER_BY_ID['fallen']),
    x: spot.x,
    y: spot.y,
    px: spot.x,
    py: spot.y,
    dmgMin: r.min + bonus[0],
    dmgMax: r.max + bonus[1],
    expireTick: w.tick + Math.round(lin(s.n.duration, L) * TICK_HZ),
    summonSkill: id,
    summonLevel: L,
    name: id === 'hydra' ? 'Hydre' : 'Hydre mineure',
    scale: id === 'hydra' ? 1.2 : 0.85,
  };
  w.monsters.push(m);
  w.events.push({ t: 'impact', kind: 'hydra_spawn', x: spot.x, y: spot.y, radius: 1, elem: 'fire' });
}

function castFireBolt(k: CastCtx): void {
  const { w, id, p, ang, s, L, range } = k;
  spawnMissile(w, { kind: 'fire_bolt', team: 0, owner: p.id, x: p.x, y: p.y, angle: ang, speed: s.n.speed ?? 15, radius: 0.3, range: range + 2, dmg: packetFor(w, id), elem: 'fire', level: L });
}

function castFireBall(k: CastCtx): void {
  const { w, id, p, ang, s, L, range } = k;
  spawnMissile(w, { kind: 'fireball', team: 0, owner: p.id, x: p.x, y: p.y, angle: ang, speed: s.n.speed ?? 14, radius: 0.35, range: range + 2, dmg: packetFor(w, id), elem: 'fire', level: L });
}

function castInferno(k: CastCtx): void {
  const { w, id, p, ang, s, L } = k;
  // cône canalisé : dégâts/s × durée de l'incantation, réduit la résistance au feu
  const secs = castFrames(w, id) / TICK_HZ;
  const pk = packetFor(w, id, secs);
  const r = lin(s.n.radius, L);
  // réduction de la résistance au feu pendant le jet (règle skills.sorceress ; D2 : aucune)
  const sorc = RULES['skills.sorceress']();
  const red = sorc.infernoFireRes(L);
  for (const m of w.monstersNear(p.x, p.y, r, buf)) {
    const a = Math.atan2(m.y - p.y, m.x - p.x);
    let da = Math.abs(a - ang) % TAU;
    if (da > Math.PI) da = TAU - da;
    if (da < 0.6) {
      if (red > 0) applyReduction(w, m, 'fire', red, Math.round((secs + sorc.infernoResLinger) * TICK_HZ));
      w.hurtMonster(m, { ...pk });
    }
  }
  w.events.push({ t: 'impact', kind: 'inferno', x: p.x + Math.cos(ang) * r * 0.5, y: p.y + Math.sin(ang) * r * 0.5, radius: r * 0.5, elem: 'fire' });
}

function castFireWall(k: CastCtx): void {
  const { w, id, p, ang, s, L, tx, ty } = k;
  const len = lin(s.n.radius, L);
  const perp = ang + Math.PI / 2;
  const dur = Math.round(lin(s.n.duration, L) * TICK_HZ);
  const pk = packetFor(w, id); // dégâts par seconde
  spawnArea(w, {
    kind: 'fire_wall',
    team: 0,
    owner: p.id,
    x: tx - Math.cos(perp) * len,
    y: ty - Math.sin(perp) * len,
    x2: tx + Math.cos(perp) * len,
    y2: ty + Math.sin(perp) * len,
    radius: 0.7,
    ticks: dur,
    every: 5,
    dmg: pk,
    elem: 'fire',
    level: L,
  });
}

function castMeteor(k: CastCtx): void {
  const { w, id, p, s, L, tx, ty } = k;
  const pk = packetFor(w, id);
  // sol brûlant : table « Burning Damage » de PD2 (par seconde, 1,6 s)
  const r2 = s.n.min2 && s.n.max2 ? (ramp(s.n.min2, L) + ramp(s.n.max2, L)) / 2 : 0;
  const burn = r2 * (1 + synergyPct(s, w.player.d.hardPoints) / 100) * (1 + (w.player.d.elemDmgPct.fire ?? 0) / 100) * tpPenalty(w);
  // durée du sol en feu : règle skills.sorceress (D2 : celle du missile meteorfire ; undefined : celle du moteur)
  const secs = RULES['skills.sorceress']().meteorBurnSeconds(s.n.duration, L);
  const a = spawnArea(w, { kind: 'meteor_fall', team: 0, owner: p.id, x: tx, y: ty, radius: lin(s.n.radius, L), ticks: 22, every: 1, dmg: pk, elem: 'fire', level: L, aux: burn });
  if (secs !== undefined) a.burn = Math.round(secs * TICK_HZ);
}

function castCombustion(k: CastCtx): void {
  const { w, id, p, ang, s, L, range } = k;
  // PD2 : anneau de boules de feu parties du lanceur dans toutes les directions (angles régulièrement répartis)
  const n = Math.max(1, Math.floor(lin(s.n.count, L)));
  const a0 = ang;
  const pk = packetFor(w, id);
  for (let i = 0; i < n; i++) {
    spawnMissile(w, {
      kind: 'fireball',
      team: 0,
      owner: p.id,
      x: p.x,
      y: p.y,
      angle: a0 + (i / n) * TAU,
      speed: s.n.speed ?? 12,
      radius: 0.35,
      range: range + 1,
      dmg: { ...pk },
      elem: 'fire',
      level: L,
    });
  }
}

function castLesserHydra(k: CastCtx): void {
  const { w, id, L, tx, ty } = k;
  summonHydra(w, id, L, tx, ty);
}

function castEnchant(k: CastCtx): void {
  const { w, id, s, L } = k;
  addBuff(w, id, L, lin(s.n.duration, L));
}

function castBlaze(k: CastCtx): void {
  const { w, id, p, s, L } = k;
  addBuff(w, id, L, lin(s.n.duration, L));
  // PD2 S13 : explosion de flammes autour de la Sorcière (3,33 yards, brûlure de 1,4 s)
  if (s.n.min2 && s.n.max2) {
    const pk = emptyPacket(true);
    pk.fire = ((ramp(s.n.min2, L) + ramp(s.n.max2, L)) / 2) * (1 + synergyPct(s, w.player.d.hardPoints) / 100) * (1 + (w.player.d.elemDmgPct.fire ?? 0) / 100);
    spawnArea(w, { kind: 'blaze', team: 0, owner: p.id, x: p.x, y: p.y, radius: 1.67, ticks: Math.round(1.4 * TICK_HZ), every: 5, dmg: pk, elem: 'fire', level: L });
  }
}

function castIceBolt(k: CastCtx): void {
  const { w, id, p, ang, s, L, range } = k;
  const pk = packetFor(w, id);
  pk.chill = Math.round(lin(s.n.chill, L) * TICK_HZ);
  pk.chillPct = 0.5;
  spawnMissile(w, { kind: 'ice_bolt', team: 0, owner: p.id, x: p.x, y: p.y, angle: ang, speed: s.n.speed ?? 14, radius: 0.3, range: range + 2, dmg: pk, elem: 'cold', level: L });
}

function castIceBlast(k: CastCtx): void {
  const { w, id, p, ang, s, L, range } = k;
  const pk = packetFor(w, id);
  // gel : durée de la compétence, synergies de durée (D2 : +10 % par niveau de Pointe glaciale)
  const bonus = 1 + synergyPct(s, w.player.d.hardPoints, 'duration') / 100;
  pk.freeze = Math.round(lin(s.n.chill, L) * TICK_HZ * bonus);
  pk.chill = pk.freeze * 2;
  pk.chillPct = 0.5;
  spawnMissile(w, {
    kind: 'ice_blast',
    team: 0,
    owner: p.id,
    x: p.x,
    y: p.y,
    angle: ang,
    speed: s.n.speed ?? 14,
    radius: 0.35,
    range: range + 2,
    dmg: pk,
    elem: 'cold',
    pierce: RULES['skills.sorceress']().iceBlastPierce,
    level: L,
  });
}

function castGlacialSpike(k: CastCtx): void {
  const { w, id, p, ang, s, L, range } = k;
  const pk = packetFor(w, id);
  const bonus = 1 + synergyPct(s, w.player.d.hardPoints, 'duration') / 100;
  pk.freeze = Math.round(lin(s.n.chill, L) * TICK_HZ * bonus);
  pk.chill = pk.freeze * 2;
  pk.chillPct = 0.5;
  spawnMissile(w, { kind: 'glacial_spike', team: 0, owner: p.id, x: p.x, y: p.y, angle: ang, speed: s.n.speed ?? 13, radius: 0.35, range: range + 2, dmg: pk, elem: 'cold', level: L });
}

function castIceBarrage(k: CastCtx): void {
  const { w, id, p, ang, s, L, range } = k;
  const blvl = w.player.d.hardPoints[id] ?? 0;
  const n = 3 + Math.min(Math.floor(blvl / 3), 2);
  for (let i = 0; i < n; i++) {
    const pk = packetFor(w, id);
    pk.chill = Math.round(lin(s.n.chill, L) * TICK_HZ);
    pk.chillPct = 0.5;
    const a = ang + (i - (n - 1) / 2) * 0.09;
    spawnMissile(w, {
      kind: 'ice_lance',
      team: 0,
      owner: p.id,
      x: p.x,
      y: p.y,
      angle: a,
      speed: (s.n.speed ?? 16) * (1 - i * 0.05),
      radius: 0.3,
      range: range + 2,
      dmg: pk,
      elem: 'cold',
      level: L,
    });
  }
}

function castFrostNova(k: CastCtx): void {
  const { w, id, p, s, L } = k;
  const pk = packetFor(w, id);
  pk.chill = Math.round(lin(s.n.chill, L) * TICK_HZ);
  pk.chillPct = 0.5;
  const r = lin(s.n.radius, L);
  w.events.push({ t: 'nova', kind: 'frost_nova', x: p.x, y: p.y, radius: r, elem: 'cold' });
  for (const m of w.monstersNear(p.x, p.y, r, buf)) w.hurtMonster(m, { ...pk });
}

function castBlizzard(k: CastCtx): void {
  const { w, id, p, s, L, tx, ty } = k;
  const pk = packetFor(w, id);
  // froid : durée de la compétence (D2 : ELen de Skills.txt), sinon 3 s
  pk.chill = Math.round((s.n.chill ? lin(s.n.chill, L) : 3) * TICK_HZ);
  pk.chillPct = 0.5;
  // D2 : les dégâts affichés sont ceux d'un éclat ; chaque éclat en inflige 60 % (0,5 en
  // phase 2 : à investissement égal, la zone du Froid restait moitié moindre que la Boule
  // de feu — bots d'endgame, BACKLOG n° 12). Le wiki PD2 dit 1 éclat / 0,08 s à 100 % : volontairement
  // non repris (étalonnage de l'équilibrage, mesuré : la médiane de morts du bot froid monte de ~0,1)
  spawnArea(w, {
    kind: 'blizzard',
    team: 0,
    owner: p.id,
    x: tx,
    y: ty,
    radius: lin(s.n.radius, L),
    ticks: Math.round(lin(s.n.duration, L) * TICK_HZ),
    every: 3,
    dmg: scalePacket(pk, 0.6),
    elem: 'cold',
    level: L,
  });
}

function castFrozenOrb(k: CastCtx): void {
  const { w, id, p, ang, s, L } = k;
  const pk = packetFor(w, id);
  pk.chill = Math.round(lin(s.n.chill, L) * TICK_HZ);
  pk.chillPct = 0.6;
  spawnMissile(w, {
    kind: 'frozen_orb',
    team: 0,
    owner: p.id,
    x: p.x,
    y: p.y,
    angle: ang,
    speed: s.n.speed ?? 5.5,
    radius: 0.4,
    range: 11,
    dmg: pk,
    elem: 'cold',
    pierce: true,
    level: L,
    aux: ang,
  });
}

function castShiverArmor(k: CastCtx): void {
  const { w, id, s, L } = k;
  addBuff(w, id, L, lin(s.n.duration, L));
}

function castChargedBolt(k: CastCtx): void {
  const { w, id, p, ang, s, L, range } = k;
  const n0 = Math.min(28, Math.floor(lin(s.n.count, L)));
  // a game mode's count (rule `skills.missileCount`, lot 309): fewer bolts, each heavier by as much; base: Diablo II's
  const n = Math.max(1, Math.min(n0, Math.round(RULES['skills.missileCount'](w, id, n0))));
  for (let i = 0; i < n; i++) {
    const a = ang + (n > 1 ? (i / (n - 1) - 0.5) * 1.3 : 0);
    spawnMissile(w, {
      kind: 'charged_bolt',
      team: 0,
      owner: p.id,
      x: p.x,
      y: p.y,
      angle: a,
      speed: s.n.speed ?? 7,
      radius: 0.3,
      range: range,
      dmg: n === n0 ? packetFor(w, id) : packetFor(w, id, n0 / n),
      elem: 'light',
      pierce: RULES['skills.sorceress']().chargedBoltPierce,
      level: L,
    });
  }
}

function castStaticField(k: CastCtx): void {
  const { w, p, s, L } = k;
  // rayon, plancher, réduction de résistance : règle skills.sorceress (D2 : aurarangecalc, StaticFieldMin, aucune réduction)
  const sorc = RULES['skills.sorceress']();
  const r = sorc.staticRadius(L, s.n.radius);
  const floor = sorc.staticFloor(w.difficulty);
  const red = sorc.staticLightRes(L);
  const part = lin(s.n.value, L) / 100;
  w.events.push({ t: 'nova', kind: 'static_field', x: p.x, y: p.y, radius: r, elem: 'light' });
  for (const m of w.monstersNear(p.x, p.y, r, buf)) {
    if (red > 0) applyReduction(w, m, 'light', red, Math.round(sorc.staticResSeconds(w.player.d.hardPoints['lightning_mastery'] ?? 0) * TICK_HZ));
    const limit = m.hpMax * floor;
    if (m.hp <= limit) continue;
    const want = sorc.staticStopsAtFloor ? Math.min(m.hp * part, m.hp - limit) : Math.min(m.hp * part, m.hp - 1);
    const pk = emptyPacket(true);
    pk.light = want;
    pk.skill = 'static_field';
    w.hurtMonster(m, pk);
  }
}

function castTelekinesis(k: CastCtx): void {
  const { w, id, p, tx, ty, targetId, range } = k;
  const item = w.items.find((g) => dist(g.x, g.y, tx, ty) < 1.3);
  if (item && dist(p.x, p.y, item.x, item.y) <= range + 1) {
    pickupGroundItem(w, item);
    w.events.push({ t: 'impact', kind: 'telekinesis', x: item.x, y: item.y, radius: 0.6, elem: 'light' });
    return;
  }
  const t = w.monsters.find((m) => m.id === targetId && !m.dead && !m.isSummon) ?? nearestTo(w, tx, ty, 2);
  if (t && dist(p.x, p.y, t.x, t.y) <= range + 1) {
    const pk = packetFor(w, id);
    if (w.rng.combat.chance(0.35)) pk.knockback = 1.5; // PD2 : 35 % de chances de repousser
    pk.stun = 10;
    pk.srcX = p.x;
    pk.srcY = p.y;
    w.hurtMonster(t, pk);
    w.events.push({ t: 'impact', kind: 'telekinesis', x: t.x, y: t.y, radius: 0.8, elem: 'light' });
  }
}

function castNova(k: CastCtx): void {
  const { w, id, p, s, L } = k;
  const r = lin(s.n.radius, L);
  w.events.push({ t: 'nova', kind: 'nova', x: p.x, y: p.y, radius: r, elem: 'light' });
  for (const m of w.monstersNear(p.x, p.y, r, buf)) w.hurtMonster(m, packetFor(w, id));
}

function castLightning(k: CastCtx): void {
  const { w, id, p, ang, range } = k;
  let lx = p.x + Math.cos(ang) * range;
  let ly = p.y + Math.sin(ang) * range;
  for (let t = 0.5; t <= range; t += 0.5) {
    const x = p.x + Math.cos(ang) * t;
    const y = p.y + Math.sin(ang) * t;
    if (w.grid.isOpaqueAt(x, y)) {
      lx = x;
      ly = y;
      break;
    }
  }
  w.events.push({ t: 'beam', kind: 'lightning', points: [p.x, p.y, lx, ly], elem: 'light' });
  for (const m of w.monstersNear((p.x + lx) / 2, (p.y + ly) / 2, range / 2 + 1, buf)) {
    if (distPointSegment(m.x, m.y, p.x, p.y, lx, ly) <= m.radius + 0.6) w.hurtMonster(m, packetFor(w, id));
  }
}

function castChainLightning(k: CastCtx): void {
  const { w, id, p, ang, s, L, tx, ty, targetId, range } = k;
  const hops = Math.min(14, s.n.count ? Math.floor(lin(s.n.count, L)) : Math.floor((25 + L) / 4));
  let cur: Monster | null = w.monsters.find((m) => m.id === targetId && !m.dead && !m.isSummon) ?? nearestTo(w, tx, ty, 4) ?? nearestTo(w, p.x, p.y, range);
  if (!cur || dist(p.x, p.y, cur.x, cur.y) > range + 2) {
    w.events.push({ t: 'beam', kind: 'chain', points: [p.x, p.y, p.x + Math.cos(ang) * range, p.y + Math.sin(ang) * range], elem: 'light' });
    return;
  }
  const pts = [p.x, p.y];
  const hit = new Set<number>();
  for (let i = 0; i < hops && cur; i++) {
    pts.push(cur.x, cur.y);
    hit.add(cur.id);
    const from: Monster = cur;
    w.hurtMonster(from, packetFor(w, id));
    let next: Monster | null = null;
    let bd = 7;
    for (const m of w.monstersNear(from.x, from.y, 7, buf)) {
      if (hit.has(m.id)) continue;
      const dd = dist(from.x, from.y, m.x, m.y);
      if (dd < bd) {
        bd = dd;
        next = m;
      }
    }
    cur = next;
  }
  w.events.push({ t: 'beam', kind: 'chain', points: pts, elem: 'light' });
}

function castTeleport(k: CastCtx): void {
  const { w, p, s, L, tx, ty, range } = k;
  // malus des sorts pendant 1 s après le saut : règle skills.sorceress (D2 : aucun)
  if (teleportPlayer(w, tx, ty, s.n.range ?? range)) {
    p.tpPenaltyPct = RULES['skills.sorceress']().teleportPenaltyPct(L);
    p.tpPenaltyUntil = w.tick + TICK_HZ;
  }
}

const SORCERESS_CASTS: Record<string, (k: CastCtx) => void> = {
  // Feu
  fire_bolt: castFireBolt,
  fire_ball: castFireBall,
  inferno: castInferno,
  fire_wall: castFireWall,
  meteor: castMeteor,
  combustion: castCombustion,
  lesser_hydra: castLesserHydra,
  hydra: castLesserHydra,
  enchant: castEnchant,
  cold_enchant: castEnchant,
  energy_shield: castEnchant,
  thunder_storm: castEnchant,
  blaze: castBlaze,
  // Froid
  ice_bolt: castIceBolt,
  ice_blast: castIceBlast,
  glacial_spike: castGlacialSpike,
  ice_barrage: castIceBarrage,
  frost_nova: castFrostNova,
  blizzard: castBlizzard,
  frozen_orb: castFrozenOrb,
  frozen_armor: castShiverArmor,
  shiver_armor: castShiverArmor,
  chilling_armor: castShiverArmor,
  // Foudre
  charged_bolt: castChargedBolt,
  static_field: castStaticField,
  telekinesis: castTelekinesis,
  nova: castNova,
  lightning: castLightning,
  chain_lightning: castChainLightning,
  teleport: castTeleport,
};

/** Lance la compétence de Sorcière `id` ; sans effet pour un identifiant d'une autre classe */
export function castSorceress(w: World, id: string, tx: number, ty: number, targetId: number, L: number, ang: number, s: SorcSkill): void {
  SORCERESS_CASTS[id]?.({ w, id, p: w.player, ang, s, L, tx, ty, targetId, range: s.range });
}
