/**
 * Paladin : attaques de Combat (Sacrifice, Châtiment, Zèle, Charge, Vengeance, Conversion,
 * Marteau béni, Poing des cieux), Bouclier sacré et les vingt auras. Les auras (une seule active à
 * la fois, comme D2) se règlent dans character.ts ; leurs effets périodiques (Feu sacré, Gel sacré,
 * Choc sacré, Sanctuaire, Prière, Rédemption) sont appliqués ici, à chaque tick.
 */
import type { Player } from './actors';
import type { SorcSkill } from '../data/skills';
import { playsStrike } from './rhythm';
import { SKILL_BY_ID, lin, skillHard, ramp, skillWdmg, synergyPct } from '../data/skills';
import type { Element } from '../data/stats';
import { clamp, dist, TAU } from '../core/math';
import { emptyPacket, type Monster } from './actors';
import { TICK_HZ } from './constants';
import { attackReach, dashTo, meleeTarget, strike, strikePacket } from './melee';
import { addBuff } from './skills';
import { spawnMissile } from './missiles';
import { corpseNear, reduceRes } from './barbarian';
import type { World } from './world';
import { RULES } from '../mods/rules';

const buf: Monster[] = [];
/** Comportements du jeu de règles (règle skills.paladin : D2, src/mods/d2/skills.ts ; un mod peut les remplacer) */
const pal = (): ReturnType<(typeof RULES)['skills.paladin']> => RULES['skills.paladin']();
const PERMANENT = 1e8;

const AURAS = [
  'prayer',
  'resist_fire',
  'defiance',
  'resist_cold',
  'cleansing',
  'resist_lightning',
  'vigor',
  'meditation',
  'redemption',
  'salvation',
  'might',
  'holy_fire',
  'thorns',
  'blessed_aim',
  'concentration',
  'holy_freeze',
  'holy_shock',
  'sanctuary',
  'fanaticism',
  'conviction',
];

function isUndead(m: Monster): boolean {
  return m.def.family === 'undead' || m.def.family === 'skeleton';
}

/** Active une aura (elle remplace la précédente) */
export function setAura(w: World, id: string, level: number): void {
  const p = w.player;
  p.buffs = p.buffs.filter((b) => !b.id.startsWith('aura_'));
  p.buffs.push({ id: `aura_${id}`, level, until: w.tick + PERMANENT });
  w.events.push({ t: 'impact', kind: 'aura_on', x: p.x, y: p.y, radius: 1.6, elem: SKILL_BY_ID[id]?.element ?? 'magic' });
  w.refreshPlayer();
}

function lvlOf(w: World, id: string): number {
  return w.player.d.skillLevels[id] ?? 0;
}

const nv = (id: string, key: 'min' | 'max' | 'min2' | 'max2', L: number): number => {
  const r = SKILL_BY_ID[id].n[key];
  return r ? ramp(r, L) : 0;
};

function hit(w: World, t: Monster, id: string, L: number, extra: Parameters<typeof strike>[2] = {}): number {
  const n = SKILL_BY_ID[id].n;
  return strike(w, t, {
    wdmg: skillWdmg(SKILL_BY_ID[id], L, w.player.d.hardPoints),
    ar: n.ar ? ramp(n.ar, L) : 0,
    skill: id,
    ...extra,
  });
}

/** Rayon (yards) de l'explosion du Sacrifice par niveau (wiki PD2) : 2,66 / 3,33 / 4 / 4,66 / 5,33 / 6 puis 6,66 */
const SACRIFICE_RADIUS = [2.66, 2.66, 3.33, 3.33, 3.33, 4, 4, 4, 4, 4.66, 4.66, 4.66, 5.33, 5.33, 5.33, 6, 6, 6, 6.66];
const sacBuf: Monster[] = [];
/** Rayon (unités) de l'explosion de la Vengeance : 4,66 yards */
const VENGEANCE_RADIUS = 2.33;

function reachOf(w: World, id: string): number {
  return Math.max(SKILL_BY_ID[id].range, attackReach(w));
}

/** Attaque au bouclier : touche toujours, dégâts d'arme réduits + bonus du Bouclier sacré */
function shieldBash(w: World, t: Monster, id: string, L: number, extra: Parameters<typeof strike>[2] = {}): void {
  const hs = w.player.buffs.find((b) => b.id === 'holy_shield');
  let flat = 0;
  if (hs) flat = (nv('holy_shield', 'min', hs.level) + nv('holy_shield', 'max', hs.level)) / 2;
  strike(w, t, { wdmg: skillWdmg(SKILL_BY_ID[id], L, w.player.d.hardPoints) - 40, sure: true, flat, mult: 0.8, skill: id, ...extra });
}

/** Paramètres d'un lancement de compétence du Paladin (arguments de `castPaladin` et valeurs communes calculées une fois) */
interface PaladinCast {
  w: World;
  id: string;
  tx: number;
  ty: number;
  targetId: number;
  L: number;
  s: SorcSkill;
  p: Player;
  n: SorcSkill['n'];
  ang: number;
}

/** Exécute une compétence du Paladin. Renvoie false si l'identifiant n'en est pas une. */
export function castPaladin(w: World, id: string, tx: number, ty: number, targetId: number, L: number): boolean {
  const s = SKILL_BY_ID[id];
  if (AURAS.includes(id)) {
    setAura(w, id, L);
    return true;
  }
  const p = w.player;
  const n = s.n;
  const ang = Math.atan2(ty - p.y, tx - p.x);
  const cast = Object.prototype.hasOwnProperty.call(PALADIN_CASTS, id) ? PALADIN_CASTS[id] : undefined;
  if (cast) {
    cast({ w, id, tx, ty, targetId, L, s, p, n, ang });
    return true;
  }
  return false;
}

function castSacrifice(ctx: PaladinCast): void {
  const { w, id, targetId, L, p, n } = ctx;
  const t = meleeTarget(w, targetId, reachOf(w, id));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  // le Paladin subit une part des dégâts infligés (`value` % ; D2 : 8 %, calc2 ; jamais la mort)
  const hp0 = t.hp;
  const dealt = hit(w, t, id, L);
  p.hp = Math.max(1, p.hp - (dealt * lin(n.value, L)) / 100);
  // règle skills.paladin (D2 : non) : le monstre tué explose : 125 % des dégâts en excès + 5 % de sa vie maximum, en physique, dans un rayon de la table du niveau
  if (t.dead && dealt > 0 && pal().sacrificeExplodes) {
    const radius = SACRIFICE_RADIUS[Math.min(SACRIFICE_RADIUS.length, Math.max(1, L)) - 1] / 2;
    const boom = Math.max(0, dealt - hp0) * 1.25 + t.hpMax * 0.05;
    for (const m of [...w.monstersNear(t.x, t.y, radius, sacBuf)]) {
      if (m === t || m.dead || m.isSummon || m.team === 0) continue;
      const pk = emptyPacket(false);
      pk.phys = boom;
      w.hurtMonster(m, pk);
    }
    w.events.push({ t: 'impact', kind: 'sacrifice', x: t.x, y: t.y, radius, elem: 'phys' });
  }
}

function castSmite(ctx: PaladinCast): void {
  const { w, id, targetId, L, p, n } = ctx;
  const t = meleeTarget(w, targetId, reachOf(w, id));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  // recul : règle skills.paladin (D2 : oui) ; coup écrasant d'un mod (table par points durs), efficacité de sa table du niveau
  const hardSmite = p.d.hardPoints.smite ?? 0;
  const kb = pal().smiteKnockback ? { knockback: 1.2 } : {};
  shieldBash(w, t, id, L, { stun: Math.round(lin(n.stun, L) * TICK_HZ), crush: skillHard('smite', 'Crushing Blow +%', Math.max(0, hardSmite - 1)), crushEff: n.v3 ? lin(n.v3, L) : 0, ...kb });
}

function castZeal(ctx: PaladinCast): void {
  const { w, id, targetId, L, p, n } = ctx;
  // nombre de coups : règle skills.paladin (D2 : 2 à 5, calc1) ; la zone des dégâts de mêlée grandit de 20 % par coup (zone d'un mod)
  // Rythme (rhythm.ts) : une frappe par instant de la séquence ; sans séquence, toutes d'un coup
  const hits = pal().zealHits(n.count, L);
  for (let i = 1; i <= hits; i++) {
    if (!playsStrike(i - 1)) continue;
    const t = meleeTarget(w, targetId, reachOf(w, id)) ?? meleeTarget(w, 0, reachOf(w, id));
    if (!t) break;
    p.facing = Math.atan2(t.y - p.y, t.x - p.x);
    hit(w, t, id, L, { splash: 20 * i });
  }
}

function castCharge(ctx: PaladinCast): void {
  const { w, id, targetId, L, p } = ctx;
  const t = w.monsters.find((m) => m.id === targetId && !m.dead && !m.isSummon) ?? meleeTarget(w, 0, 8);
  if (!t) return;
  // PD2 : la zone de mêlée du coup grandit avec la distance parcourue : +20 % à 2,66 yards, +40 % à 5,33, +60 % à 8
  const d0 = dist(p.x, p.y, t.x, t.y);
  const splash = d0 >= 4 ? 60 : d0 >= 2.67 ? 40 : d0 >= 1.33 ? 20 : 0;
  if (d0 > 1.6) dashTo(w, t.x, t.y, 9, 1.0);
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  if (dist(p.x, p.y, t.x, t.y) <= attackReach(w) + t.radius + p.radius + 0.8) hit(w, t, id, L, { knockback: 1.2, splash });
}

function castVengeance(ctx: PaladinCast): void {
  const { w, id, targetId, L, s, p, n } = ctx;
  const t = meleeTarget(w, targetId, reachOf(w, id));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  // règle skills.paladin : D2, un coup qui ajoute `value` % (synergies comprises) des dégâts physiques en feu, froid et foudre, avec froid
  if (!pal().vengeanceChain) {
    const pct = lin(n.value, L) + synergyPct(s, p.d.hardPoints);
    hit(w, t, id, L, { addPct: { fire: pct, cold: pct, light: pct } });
    return;
  }
  // coup d'arme normal, puis une explosion de feu, de froid et de foudre autour de la cible qui se propage
  // d'ennemi en ennemi (chance de rebond 22 % + 2 %/niveau, plafond 95 % ; saut de 4,66 yards, 16 yards au plus de la cible)
  if (strike(w, t, { ar: lin(n.ar, L), skill: id }) <= 0) return;
  // dégâts : l'arme (100 % de la part physique convertie en chaque élément) + éléments des objets + table de la compétence,
  // × « dégâts élémentaires + % » et synergies (communs aux trois éléments)
  const base = strikePacket(w, { skill: id });
  const mul = 1 + (lin(n.value, L) + synergyPct(s, p.d.hardPoints)) / 100;
  const chain = Math.min(95, 22 + 2 * L) / 100;
  const centers: Monster[] = [t];
  const chained = new Set<number>([t.id]);
  let hits = 0;
  for (let i = 0; i < centers.length && hits < 40; i++) {
    const c = centers[i];
    w.events.push({ t: 'impact', kind: 'vengeance', x: c.x, y: c.y, radius: VENGEANCE_RADIUS, elem: 'fire' });
    for (const m of [...w.monstersNear(c.x, c.y, VENGEANCE_RADIUS, sacBuf)]) {
      if (m.dead || m.isSummon || m.team === 0) continue;
      const pk = emptyPacket(false);
      for (const e of ['fire', 'cold', 'light'] as const) {
        const lo = ramp(n.min!, L);
        pk[e] = (base.phys + base[e] + w.rng.combat.float(lo, Math.max(lo, ramp(n.max!, L)))) * mul;
      }
      pk.chill = Math.round(3.2 * TICK_HZ);
      pk.chillPct = 0.4;
      pk.skill = id;
      w.hurtMonster(m, pk);
      hits++;
      if (!chained.has(m.id) && dist(t.x, t.y, m.x, m.y) <= 8 && w.rng.combat.chance(chain)) {
        chained.add(m.id);
        centers.push(m);
      }
    }
  }
}

function castHolyBolt(ctx: PaladinCast): void {
  const { w, id, L, s, p, n, ang } = ctx;
  // projectiles : règle skills.paladin (D2 : un seul)
  const bolts = pal().holyBolts(L);
  for (let i = 0; i < bolts; i++) {
    const pk = emptyPacket(true);
    pk.magic = w.rng.combat.float(nv(id, 'min', L), Math.max(nv(id, 'min', L), nv(id, 'max', L))) * (1 + synergyPct(s, p.d.hardPoints) / 100);
    pk.skill = id;
    spawnMissile(w, {
      kind: 'holy_bolt',
      team: 0,
      owner: p.id,
      x: p.x,
      y: p.y,
      angle: ang + (i - (bolts - 1) / 2) * 0.16,
      speed: n.mana ? (s.n.speed ?? 14) : 14,
      radius: 0.35,
      range: s.range + 2,
      dmg: pk,
      elem: 'magic',
      level: L,
      pierce: true,
    });
  }
}

function castHolyLight(ctx: PaladinCast): void {
  const { w, id, targetId, L, s, p, n } = ctx;
  // PD2 : gerbe de 4 yards autour de la cible. Lancée sur un allié (ou sans cible) : soin entier, dégâts ÷ 2 ;
  // lancée sur un ennemi : dégâts entiers, soin ÷ 2
  const tg = targetId ? w.monsters.find((m) => m.id === targetId && !m.dead) : undefined;
  const foe = !!tg && !tg.pet && !tg.isSummon && tg.team !== 0;
  const cx = tg ? tg.x : p.x;
  const cy = tg ? tg.y : p.y;
  const r = lin(n.radius, L) || 2;
  const syn = 1 + synergyPct(s, p.d.hardPoints) / 100;
  healAllies(w, cx, cy, r, w.rng.combat.float(nv(id, 'min2', L), Math.max(nv(id, 'min2', L), nv(id, 'max2', L))) * (foe ? 0.5 : 1));
  for (const m of w.monstersNear(cx, cy, r, buf)) {
    if (m.dead || m.isSummon || m.team === 0) continue;
    const pk = emptyPacket(true);
    pk.magic = w.rng.combat.float(nv(id, 'min', L), Math.max(nv(id, 'min', L), nv(id, 'max', L))) * syn * (isUndead(m) ? 1.5 : 1) * (foe ? 1 : 0.5);
    pk.skill = id;
    w.hurtMonster(m, pk);
  }
  w.events.push({ t: 'nova', kind: id, x: cx, y: cy, radius: Math.min(r, 8), elem: 'magic' });
}

function castHolyNova(ctx: PaladinCast): void {
  const { w, id, L, s, p, n } = ctx;
  // gerbe / onde sacrée autour du Paladin : dégâts magiques, aux morts-vivants +50 % ; PD2 : soigne
  // aussi le Paladin et ses alliés (Lumière sacrée lancée sur un ennemi : soin ÷ 2)
  const syn = 1 + synergyPct(s, p.d.hardPoints) / 100;
  const r = lin(n.radius, L) || 4;
  const heal = id === 'holy_nova' ? lin(n.value, L) : w.rng.combat.float(nv(id, 'min2', L), Math.max(nv(id, 'min2', L), nv(id, 'max2', L))) * 0.5;
  healAllies(w, p.x, p.y, r, heal);
  for (const m of w.monstersNear(p.x, p.y, r, buf)) {
    if (m.dead || m.isSummon) continue;
    const pk = emptyPacket(true);
    pk.magic = w.rng.combat.float(nv(id, 'min', L), Math.max(nv(id, 'min', L), nv(id, 'max', L))) * syn * (isUndead(m) ? 1.5 : 1);
    pk.skill = id;
    w.hurtMonster(m, pk);
  }
  w.events.push({ t: 'nova', kind: id, x: p.x, y: p.y, radius: Math.min(r, 8), elem: 'magic' });
}

function castJoust(ctx: PaladinCast): void {
  const { w, id, targetId, L, p, n } = ctx;
  // charge : bond vers l'ennemi, coup avec chance de critique, accès de vitesse bref
  const t = w.monsters.find((m) => m.id === targetId && !m.dead && !m.isSummon) ?? meleeTarget(w, 0, 9);
  if (!t) return;
  if (dist(p.x, p.y, t.x, t.y) > 1.6) dashTo(w, t.x, t.y, 9, 1.0);
  // PD2 : recharge de la table (4 s au niveau 1, 1,5 s dès le niveau 25) et vitesse de déplacement pendant 2 s
  if (n.v4) p.cooldowns[id] = Math.max(p.cooldowns[id] ?? 0, w.tick + Math.round(lin(n.v4, L) * (1 - clamp(p.d.all.get('cooldownRed') ?? 0, 0, 75) / 100) * TICK_HZ));
  if (n.v3) addBuff(w, 'joust_run', L, 2);
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  if (dist(p.x, p.y, t.x, t.y) <= attackReach(w) + t.radius + p.radius + 0.8) hit(w, t, id, L, { knockback: 1, mult: w.rng.combat.chance(lin(n.value, L) / 100) ? 2 : 1 });
}

function castHolySword(ctx: PaladinCast): void {
  const { w, id, L, n } = ctx;
  addBuff(w, id, L, lin(n.duration, L));
}

function castBlessedHammer(ctx: PaladinCast): void {
  const { w, id, L, s, p, ang } = ctx;
  const pk = emptyPacket(true);
  const a = nv(id, 'min', L);
  pk.magic = w.rng.combat.float(a, Math.max(a, nv(id, 'max', L))) * (1 + synergyPct(s, p.d.hardPoints) / 100) * (1 + p.d.concDmgPct / 100);
  pk.skill = id;
  // marteau spirituel : spirale qui s'écarte du Paladin (aux morts-vivants +150 %)
  spawnMissile(w, {
    kind: 'hammer',
    team: 0,
    owner: p.id,
    x: p.x,
    y: p.y,
    angle: ang,
    speed: 6,
    radius: 0.6,
    range: 12,
    dmg: pk,
    elem: 'magic',
    pierce: true,
    level: L,
    aux: ang,
    tx: p.x,
    ty: p.y,
    z: 0.6,
  });
}

function castHolyShield(ctx: PaladinCast): void {
  const { w, id, L, n } = ctx;
  addBuff(w, id, L, lin(n.duration, L));
}

function castFistOfTheHeavens(ctx: PaladinCast): void {
  const { w, id, tx, ty, targetId, L, s, p, n } = ctx;
  const t = w.monsters.find((m) => m.id === targetId && !m.dead && !m.isSummon);
  const x = t ? t.x : tx;
  const y = t ? t.y : ty;
  const syn = 1 + synergyPct(s, p.d.hardPoints) / 100;
  w.events.push({ t: 'beam', kind: 'thunder', points: [x, y - 0.01, x, y], elem: 'light' });
  w.events.push({ t: 'impact', kind: 'fist', x, y, radius: 2, elem: 'light' });
  // foudre sur la cible, puis Éclairs sacrés sur chaque monstre alentour
  const pk = emptyPacket(true);
  pk.light = w.rng.combat.float(nv(id, 'min', L), nv(id, 'max', L)) * syn;
  pk.skill = id;
  let bolts = 0;
  // Éclairs sacrés au plus et cibles : règle skills.paladin (D2 : calc4, morts-vivants seulement)
  const fr = pal();
  const maxBolts = fr.fohMaxBolts(n.count, L);
  for (const m of w.monstersNear(x, y, lin(n.radius, L) || 6, buf)) {
    if (m === t && bolts === 0) w.hurtMonster(m, { ...pk });
    if (fr.holyUndeadOnly && !isUndead(m)) continue;
    const b = emptyPacket(true);
    b.magic = w.rng.combat.float(nv(id, 'min2', L), nv(id, 'max2', L)) * syn * (isUndead(m) ? 1.5 : 1);
    b.skill = id;
    if (bolts < maxBolts && m !== t) {
      w.hurtMonster(m, b);
      w.events.push({ t: 'beam', kind: 'holybolt', points: [x, y, m.x, m.y], elem: 'magic' });
      bolts++;
    }
  }
  if (t && !t.dead && (!fr.holyUndeadOnly || isUndead(t))) {
    const b = emptyPacket(true);
    b.magic = w.rng.combat.float(nv(id, 'min2', L), nv(id, 'max2', L)) * syn * (isUndead(t) ? 1.5 : 1);
    w.hurtMonster(t, b);
  }
}

/** Conversion (D2) : un coup ; sur un monstre qui n'est pas un boss, `value` % de chances qu'il combatte pour le Paladin pendant `duration` s */
function castConversion(ctx: PaladinCast): void {
  const { w, id, targetId, L, p, n } = ctx;
  const t = meleeTarget(w, targetId, reachOf(w, id));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  if (hit(w, t, id, L) <= 0 || t.dead || t.rank === 'boss') return;
  if (!w.rng.combat.chance(lin(n.value, L) / 100)) return;
  t.convertedUntil = w.tick + Math.round(lin(n.duration, L) * TICK_HZ);
  w.events.push({ t: 'impact', kind: 'conversion', x: t.x, y: t.y, radius: 0.9, elem: 'magic' });
}

/** Compétences du Paladin : identifiant → effet */
const PALADIN_CASTS: Record<string, (c: PaladinCast) => void> = {
  sacrifice: castSacrifice,
  smite: castSmite,
  zeal: castZeal,
  charge: castCharge,
  vengeance: castVengeance,
  conversion: castConversion,
  holy_bolt: castHolyBolt,
  holy_light: castHolyLight,
  holy_nova: castHolyNova,
  joust: castJoust,
  holy_sword: castHolySword,
  blessed_hammer: castBlessedHammer,
  holy_shield: castHolyShield,
  fist_of_the_heavens: castFistOfTheHeavens,
};

/** Soin de zone (Lumière et Nova sacrées) : le Paladin, son mercenaire et ses créatures */
/** Soin d'un Éclair sacré qui touche un allié (créature, mercenaire) : min2–max2 du niveau, synergies comprises */
export function holyBoltHeal(w: World, L: number): number {
  const s = SKILL_BY_ID.holy_bolt;
  return w.rng.combat.float(nv('holy_bolt', 'min2', L), Math.max(nv('holy_bolt', 'min2', L), nv('holy_bolt', 'max2', L))) * (1 + synergyPct(s, w.player.d.hardPoints) / 100);
}

function healAllies(w: World, x: number, y: number, r: number, amount: number): void {
  if (amount <= 0) return;
  const p = w.player;
  if (dist(p.x, p.y, x, y) <= r + 0.5) p.hp = Math.min(p.hpMax, p.hp + amount);
  for (const m of w.monstersNear(x, y, r, buf)) if (m.pet && !m.dead) m.hp = Math.min(m.hpMax, m.hp + amount);
}

/** Trajectoire du Marteau béni : spirale autour du point de lancement */
export function hammerStep(w: World, m: { x: number; y: number; tx: number; ty: number; t0: number; aux: number; vx: number; vy: number }): void {
  const age = (w.tick - m.t0) / TICK_HZ;
  const r = 0.9 + age * 4.4;
  const a = m.aux + age * 7;
  const nx = m.tx + Math.cos(a) * r;
  const ny = m.ty + Math.sin(a) * r;
  m.vx = (nx - m.x) * TICK_HZ;
  m.vy = (ny - m.y) * TICK_HZ;
}

/** Effets périodiques des auras du Paladin (règle skills.paladin : D2, toutes les 2 s ; PD2, toutes les 0,4 s) */
export function paladinTick(w: World): void {
  const p = w.player;
  const aura = p.d.aura;
  const rules = RULES['skills.paladin']();
  const pulse = rules.auraPulse;
  if (!aura || p.dead || w.tick % pulse.every !== 0) return;
  const id = aura.id;
  const L = lvlOf(w, id) || aura.level;
  const s = SKILL_BY_ID[id];
  if (!s) return;
  const r = lin(s.n.radius, L);
  // Purification, Méditation (D2) : soignent aussi, au niveau de la Prière
  if (rules.prayerLikeAuras.includes(id) && SKILL_BY_ID.prayer) {
    const pl = lvlOf(w, 'prayer');
    if (pl > 0) p.hp = Math.min(p.hpMax, p.hp + rules.prayerHeal(lin(SKILL_BY_ID.prayer.n.value, pl), p.hpMax));
  }
  switch (id) {
    case 'prayer': {
      // soin d'une impulsion (D2 : la table ; PD2 : par seconde, 0,4 s par impulsion)
      p.hp = Math.min(p.hpMax, p.hp + rules.prayerHeal(lin(s.n.value, L), p.hpMax));
      break;
    }
    case 'redemption': {
      const c = corpseNear(w, p.x, p.y, r);
      if (c && w.rng.combat.chance(lin(s.n.value, L) / 100)) {
        c.eaten = true;
        c.deathTick = Math.min(c.deathTick, w.tick - TICK_HZ * 11);
        p.hp = Math.min(p.hpMax, p.hp + lin(s.n.v3, L));
        p.mana = Math.min(p.manaMax, p.mana + lin(s.n.value2, L));
        w.events.push({ t: 'impact', kind: 'redeem', x: c.x, y: c.y, radius: 0.8, elem: 'magic' });
      }
      break;
    }
    case 'holy_fire':
    case 'holy_freeze':
    case 'holy_shock':
    case 'sanctuary': {
      const e: Element = id === 'holy_fire' ? 'fire' : id === 'holy_freeze' ? 'cold' : id === 'holy_shock' ? 'light' : 'magic';
      const syn = 1 + synergyPct(s, p.d.hardPoints) / 100;
      for (const m of w.monstersNear(p.x, p.y, r, buf)) {
        if (m.dead || m.isSummon) continue;
        // Sanctuaire : les morts-vivants seulement (D2) ou tous les monstres (règle skills.paladin)
        if (id === 'sanctuary' && !rules.sanctuaryAllMonsters && !isUndead(m)) continue;
        const pk = emptyPacket(true);
        // dégâts d'une impulsion (D2 : la table ; PD2 : valeurs par seconde × 0,4)
        pk[e] = w.rng.combat.float(nv(id, 'min', L), Math.max(nv(id, 'min', L), nv(id, 'max', L))) * syn * pulse.mul;
        if (id === 'sanctuary') {
          // PD2 : résistance magique réduite (chiffre `value` du mod) ; recul des morts-vivants
          if (rules.sanctuaryAllMonsters) reduceRes(w, m, 'magic', lin(s.n.value, L), 12);
          if (isUndead(m)) {
            pk.knockback = 0.9;
            pk.srcX = p.x;
            pk.srcY = p.y;
          }
        }
        if (id === 'holy_freeze') {
          pk.chill = 2 * TICK_HZ;
          pk.chillPct = lin(s.n.value, L) / 100;
        }
        pk.skill = id;
        w.hurtMonster(m, pk);
      }
      break;
    }
  }
  void TAU;
}
