/**
 * Assassin : arts martiaux (attaques à charges et coups de finition), disciplines de l'ombre
 * (Marteau psychique, Souffle mental, Cape d'ombre, Guerrière et Maître de l'ombre, buffs) et
 * pièges (Explosion de feu, Toile d'éclairs, Sentinelle et Furie des lames, tourelles, sillages,
 * Bouclier de lames). Chiffres PD2 dans mods/pd2/data/skills.ts ; les passifs (Maîtrise des griffes,
 * Parade d'arme) agissent dans melee.ts et character.ts.
 *
 * Charges (règle skills.assassin) — D2 : chaque coup au but d'une attaque à charges pose une charge (3 au plus) ; une finition les
 * consomme et joue leurs effets. PD2 S13 : chaque coup au but d'une compétence « à charges » produit aussitôt l'effet de
 * l'étage du cycle (1, 2 puis 3 ; le cycle est PARTAGÉ entre toutes les compétences à charges : une Frappe
 * du tigre suivie d'un Poing de feu donne l'étage 2 au Poing) et pose des charges de son type jusqu'à cet
 * étage ; au troisième coup les charges retombent à zéro. La Frappe du tigre garde ses charges (3 au plus,
 * 300 s) pour le prochain coup de finition ; ses propres coups reçoivent le bonus de dégâts de l'étage.
 * Un coup de finition (Serre, Griffe, Queue, Envol du dragon) consomme toutes les charges : bonus de
 * précision (+50 % par charge), dégâts du Tigre, conversion du physique en feu des Poings de feu, et il
 * déclenche d'un coup les étages des charges accumulées (« les trois étages à la fois »).
 */
import type { Player } from './actors';
import type { SorcSkill } from '../data/skills';
import { SKILL_BY_ID, lin, ramp, skillWdmg, synergyPct } from '../data/skills';
import type { Element } from '../data/stats';
import { monsterDmg } from '../data/curves';
import { clamp, dist, TAU } from '../core/math';
import { emptyPacket, type DamagePacket, type Missile, type Monster } from './actors';
import { TICK_HZ } from './constants';
import { addBuff } from './skills';
import { attackReach, dashTo, meleeTarget, offhandWeapon, rollHit, strike, weaponMastery, weaponRoll } from './melee';
import { scalePacket, spawnArea, spawnMissile } from './missiles';
import { explode } from './explosion';
import { corpseNear, debuff } from './barbarian';
import { summonMinion } from './minions';
import { chain } from './amazon';
import type { World } from './world';
import { RULES } from '../mods/rules';

const buf: Monster[] = [];
/** Comportements du jeu de règles (règle skills.assassin : D2, src/mods/d2/skills.ts ; un mod peut les remplacer) */
const asn = (): ReturnType<(typeof RULES)['skills.assassin']> => RULES['skills.assassin']();
const t25 = (s: number): number => Math.round(s * TICK_HZ);
/** Yards → unités (1 unité = 2 yards) */
const yd = (y: number): number => y / 2;

const CHARGE_UPS = ['tiger_strike', 'fists_of_fire', 'cobra_strike', 'claws_of_thunder', 'blades_of_ice', 'phoenix_strike'];
const TRAPS = [
  'fire_blast',
  'shock_web',
  'blade_sentinel',
  'charged_bolt_sentry',
  'wake_of_fire',
  'blade_fury',
  'lightning_sentry',
  'wake_of_inferno',
  'death_sentry',
  'blade_shield',
  'chain_lightning_sentry',
];
export const SENTRIES = ['charged_bolt_sentry', 'wake_of_fire', 'lightning_sentry', 'wake_of_inferno', 'death_sentry', 'chain_lightning_sentry'];
export const MAX_SENTRIES = 5;
/** Tourelles d'une ombre à la fois (supposé : le wiki ne le dit pas ; borne le nombre de zones) */
const SHADOW_MAX_SENTRIES = 2;

type NKey = 'min' | 'max' | 'min2' | 'max2' | 'min3' | 'max3' | 'wdmg' | 'ar';
const nv = (id: string, key: NKey, L: number): number => {
  const r = SKILL_BY_ID[id].n[key];
  return r ? ramp(r, L) : 0;
};
const roll = (w: World, id: string, L: number, a: NKey = 'min', b: NKey = 'max'): number => {
  const lo = nv(id, a, L);
  return w.rng.combat.float(lo, Math.max(lo, nv(id, b, L)));
};
const syn = (w: World, id: string): number => 1 + synergyPct(SKILL_BY_ID[id], w.player.d.hardPoints) / 100;
const elemMul = (w: World, e: Element): number => 1 + (w.player.d.elemDmgPct[e] ?? 0) / 100;

function pkt(e: Element, v: number, skill: string): DamagePacket {
  const pk = emptyPacket(true);
  pk[e] = v;
  pk.skill = skill;
  return pk;
}

/* ------------------------------------------------------------------ */
/* Charges                                                             */
/* ------------------------------------------------------------------ */

export function chargeCount(w: World, id: string): number {
  return w.player.buffs.find((b) => b.id === `charge_${id}`)?.stacks ?? 0;
}

/** Pose `n` charges (0 : retire la compétence) ; durée : règle skills.assassin (D2 : table, 15 s ; PD2 : 300 s) */
function setCharges(w: World, id: string, L: number, n: number): void {
  const p = w.player;
  p.buffs = p.buffs.filter((b) => b.id !== `charge_${id}`);
  if (n > 0) p.buffs.push({ id: `charge_${id}`, level: L, until: w.tick + t25(asn().chargeSeconds(SKILL_BY_ID[id]?.n.duration, L)), stacks: Math.min(3, n) });
  w.refreshPlayer();
}

function clearCharges(w: World): void {
  w.player.buffs = w.player.buffs.filter((b) => !b.id.startsWith('charge_') && b.id !== CYCLE);
  w.refreshPlayer();
}

/** Position dans le cycle de trois coups, partagée par toutes les compétences à charges */
const CYCLE = 'asn_cycle';
const cyclePos = (w: World): number => w.player.buffs.find((b) => b.id === CYCLE)?.stacks ?? 0;
function setCycle(w: World, n: number): void {
  const p = w.player;
  p.buffs = p.buffs.filter((b) => b.id !== CYCLE);
  if (n > 0) p.buffs.push({ id: CYCLE, level: 1, until: w.tick + t25(300), stacks: n });
}

/** Fin de cycle (troisième coup) : toutes les charges retombent, sauf celles du Tigre (gardées pour la finition) */
function endCycle(w: World): void {
  w.player.buffs = w.player.buffs.filter((b) => (!b.id.startsWith('charge_') || b.id === 'charge_tiger_strike') && b.id !== CYCLE);
  w.refreshPlayer();
}

/** Charges élémentaires accumulées (hors Tigre), à relâcher par un coup de finition */
function heldCharges(w: World): { id: string; level: number; stacks: number }[] {
  const out: { id: string; level: number; stacks: number }[] = [];
  for (const id of CHARGE_UPS) {
    const b = id === 'tiger_strike' ? undefined : w.player.buffs.find((x) => x.id === `charge_${id}`);
    if (b) out.push({ id, level: b.level, stacks: b.stacks ?? 1 });
  }
  return out;
}

/** Étages des charges accumulées, déclenchés d'un coup par chaque coup de finition qui touche `t` */
function releaseCharges(w: World, t: Monster, dealt: number, held: { id: string; level: number; stacks: number }[]): void {
  if (dealt <= 0 || t.dead) return;
  const r = asn();
  for (const h of held) for (let st = 1; st <= h.stacks; st++) chargeEffect(w, h.id, r.chargeStage(h.id, st), h.level, t, dealt);
}

/** Charge en cours d'application : compétence à charges, rang `c` de la charge (1 à 3), niveau, cible touchée, dégâts infligés */
interface ChargeCtx {
  w: World;
  id: string;
  c: number;
  L: number;
  t: Monster;
  dealt: number;
  p: Player;
  sy: number;
  s: SorcSkill;
}

/** Effet immédiat de la charge `c` (1 à 3) d'une compétence à charges, après un coup au but sur `t` */
function chargeEffect(w: World, id: string, c: number, L: number, t: Monster, dealt: number): void {
  const p = w.player;
  const sy = syn(w, id);
  const s = SKILL_BY_ID[id];
  const run = Object.prototype.hasOwnProperty.call(CHARGE_EFFECTS, id) ? CHARGE_EFFECTS[id] : undefined;
  if (run) {
    run({ w, id, c, L, t, dealt, p, sy, s });
    return;
  }
}

function chargeFistsOfFire({ w, id, c, L, t, p, sy, s }: ChargeCtx): void {
  const burn = ((lin(s.n.value, L) + lin(s.n.value2, L)) / 2) * sy * elemMul(w, 'fire');
  if (c === 1) {
    // explosion de feu (2,66 yards) et sol brûlant 2,56 s
    explode(w, 0, t.x, t.y, yd(2.66), pkt('fire', roll(w, id, L) * sy * elemMul(w, 'fire'), id), 'fists_of_fire', 'fire');
    if (burn > 0) spawnArea(w, { kind: 'fire_ground', team: 0, owner: p.id, x: t.x, y: t.y, radius: yd(2.66), ticks: t25(2.56), every: 5, dmg: pkt('fire', burn, id), elem: 'fire' });
  } else if (c === 2) {
    // nova de feu (7,33 yards)
    explode(w, 0, p.x, p.y, yd(7.33), pkt('fire', roll(w, id, L, 'min2', 'max2') * sy * elemMul(w, 'fire'), id), 'nova_fire', 'fire');
  } else {
    // trois météores en ligne depuis l'Assassin (physique et feu), sol brûlant
    const a = Math.atan2(t.y - p.y, t.x - p.x);
    for (let i = 0; i < 3; i++) {
      const x = p.x + Math.cos(a) * yd(2 * i);
      const y = p.y + Math.sin(a) * yd(2 * i);
      const v = roll(w, id, L, 'min3', 'max3') * sy;
      const pk = pkt('fire', v * elemMul(w, 'fire'), id);
      pk.phys = v;
      spawnArea(w, { kind: 'meteor_fall', team: 0, owner: p.id, x, y, radius: yd(2.33), ticks: 1 + 5 * i, every: 1, dmg: pk, elem: 'fire', level: L, aux: burn });
    }
  }
}

function chargeClawsOfThunder({ w, id, c, L, t, p, sy }: ChargeCtx): void {
  if (c === 1) w.hurtMonster(t, pkt('light', roll(w, id, L) * sy * elemMul(w, 'light'), id));
  else if (c === 2) explode(w, 0, p.x, p.y, yd(7.33), pkt('light', roll(w, id, L, 'min2', 'max2') * sy * elemMul(w, 'light'), id), 'nova_thunder', 'light');
  else {
    w.hurtMonster(t, pkt('light', roll(w, id, L, 'min3', 'max3') * sy * elemMul(w, 'light'), id));
    chain(w, t, 4, () => roll(w, id, L, 'min3', 'max3') * sy * elemMul(w, 'light'), id);
  }
}

function chargeBladesOfIce({ w, id, c, L, t, p, sy }: ChargeCtx): void {
  if (c === 1) {
    const pk = pkt('cold', roll(w, id, L) * sy * elemMul(w, 'cold'), id);
    pk.chill = t25(10);
    pk.chillPct = 0.5;
    w.hurtMonster(t, pk);
  } else if (c === 2) {
    // vague de froid devant l'Assassin (4 yards de large, 10,66 de long)
    const a = Math.atan2(t.y - p.y, t.x - p.x);
    for (const m of w.monstersNear(p.x + Math.cos(a) * yd(5.33), p.y + Math.sin(a) * yd(5.33), yd(5.33) + 0.6, buf)) {
      if (m.dead || m.isSummon) continue;
      // couloir de 4 yards de large sur 10,66 yards de long
      const fwd = (m.x - p.x) * Math.cos(a) + (m.y - p.y) * Math.sin(a);
      const side = Math.abs(-(m.x - p.x) * Math.sin(a) + (m.y - p.y) * Math.cos(a));
      if (fwd < -m.radius || fwd > yd(10.66) + m.radius || side > yd(2) + m.radius) continue;
      const pk = pkt('cold', roll(w, id, L, 'min2', 'max2') * sy * elemMul(w, 'cold'), id);
      pk.chill = t25(10);
      pk.chillPct = 0.5;
      if (w.rng.combat.chance(0.2)) {
        pk.knockback = 1;
        pk.srcX = p.x;
        pk.srcY = p.y;
      }
      w.hurtMonster(m, pk);
    }
    w.events.push({ t: 'impact', kind: 'cold_wave', x: t.x, y: t.y, radius: yd(4), elem: 'cold' });
  } else {
    // PD2 : dix lames de glace en éventail frontal (~16 yards de portée), froid de 10 s
    const a = Math.atan2(t.y - p.y, t.x - p.x);
    for (let i = 0; i < 10; i++) {
      const pk = pkt('cold', roll(w, id, L, 'min3', 'max3') * sy * elemMul(w, 'cold'), id);
      pk.chill = t25(10);
      pk.chillPct = 0.5;
      spawnMissile(w, {
        kind: 'coldbolt_m',
        team: 0,
        owner: p.id,
        x: p.x,
        y: p.y,
        angle: a + ((i - 4.5) / 4.5) * (TAU / 6),
        speed: 14,
        radius: 0.35,
        range: yd(16),
        dmg: pk,
        elem: 'cold',
        level: L,
      });
    }
    w.events.push({ t: 'impact', kind: 'cold_wave', x: p.x + Math.cos(a), y: p.y + Math.sin(a), radius: 1.2, elem: 'cold' });
  }
}

function chargePhoenixStrike({ w, id, c, L, t, p, sy, s }: ChargeCtx): void {
  if (c === 1) {
    explode(w, 0, t.x, t.y, yd(4), pkt('fire', roll(w, id, L) * sy * elemMul(w, 'fire'), id), 'meteor', 'fire');
    // sol brûlant de 1,48 s (table « Burning Damage », par seconde)
    const burn = ((lin(s.n.value, L) + lin(s.n.value2, L)) / 2) * sy * elemMul(w, 'fire');
    if (burn > 0) spawnArea(w, { kind: 'fire_ground', team: 0, owner: p.id, x: t.x, y: t.y, radius: yd(4) * 0.9, ticks: t25(1.48), every: 5, dmg: pkt('fire', burn, id), elem: 'fire' });
  } else if (c === 2) chain(w, t, 5, () => roll(w, id, L, 'min2', 'max2') * sy * elemMul(w, 'light'), id);
  else {
    const pk = pkt('cold', roll(w, id, L, 'min3', 'max3') * sy * elemMul(w, 'cold'), id);
    pk.chill = t25(4);
    pk.chillPct = 0.5;
    explode(w, 0, t.x, t.y, 2.2, pk, 'nova_ice', 'cold');
  }
}

function chargeCobraStrike({ w, id, c, L, t, dealt, p, sy, s }: ChargeCtx): void {
  if (c === 1) {
    // sept traits de poison en arc de 120° (poison sur 1 s)
    const a = Math.atan2(t.y - p.y, t.x - p.x);
    for (let i = 0; i < 7; i++) {
      const pk = emptyPacket(true);
      pk.poisonDot = { dps: roll(w, id, L) * sy * elemMul(w, 'poison'), ticks: TICK_HZ };
      pk.skill = id;
      spawnMissile(w, {
        kind: 'poison_bolt',
        team: 0,
        owner: p.id,
        x: p.x,
        y: p.y,
        angle: a + ((i - 3) / 3) * (TAU / 6),
        speed: 12,
        radius: 0.3,
        range: yd(12.25),
        dmg: pk,
        elem: 'poison',
        level: L,
      });
    }
  } else if (c === 2) {
    // vol de vie et de mana sur ce coup
    const pct = lin(s.n.value, L) / 100;
    p.hp = Math.min(p.hpMax, p.hp + dealt * pct);
    p.mana = Math.min(p.manaMax, p.mana + dealt * pct);
  } else {
    // nuage de poison de 6 yards de rayon autour de la cible
    for (const m of w.monstersNear(t.x, t.y, yd(6), buf)) {
      if (m.dead || m.isSummon) continue;
      const pk = emptyPacket(true);
      pk.poisonDot = { dps: roll(w, id, L, 'min3', 'max3') * sy * elemMul(w, 'poison'), ticks: TICK_HZ };
      pk.skill = id;
      w.hurtMonster(m, pk);
    }
    w.events.push({ t: 'impact', kind: 'poison_cloud', x: t.x, y: t.y, radius: yd(6), elem: 'poison' });
  }
}

/** Effet immédiat de chaque charge, par compétence à charges */
const CHARGE_EFFECTS: Record<string, (c: ChargeCtx) => void> = {
  fists_of_fire: chargeFistsOfFire,
  claws_of_thunder: chargeClawsOfThunder,
  blades_of_ice: chargeBladesOfIce,
  phoenix_strike: chargePhoenixStrike,
  cobra_strike: chargeCobraStrike,
};

/** Coup de finition : consomme toutes les charges (bonus de précision, dégâts du Tigre, conversion en feu des Poings de feu) */
function finisherBonus(w: World): { ar: number; wdmg: number; fire: number } {
  const p = w.player;
  let ar = 0;
  let wd = 0;
  let fire = 0;
  for (const id of CHARGE_UPS) {
    const b = p.buffs.find((x) => x.id === `charge_${id}`);
    if (!b) continue;
    const c = b.stacks ?? 1;
    ar += 50 * c;
    if (id === 'tiger_strike') wd += nv(id, 'wdmg', b.level) * c + synergyPct(SKILL_BY_ID[id], p.d.hardPoints);
    if (id === 'fists_of_fire') fire = Math.max(fire, lin(SKILL_BY_ID[id].n.v3, b.level) / 100);
  }
  return { ar, wdmg: wd, fire };
}

/* ------------------------------------------------------------------ */
/* Compétences                                                         */
/* ------------------------------------------------------------------ */

function reachOf(w: World, id: string): number {
  return Math.max(SKILL_BY_ID[id].range, attackReach(w));
}

/** % de dégâts d'arme d'un coup de finition, synergies PD2 additives comprises */
function wdOf(w: World, id: string, L: number): number {
  return skillWdmg(SKILL_BY_ID[id], L, w.player.d.hardPoints);
}

/** Conversion physique → feu des Poings de feu sur un coup de finition */
function fireConv(fb: { fire: number }): { convert?: Element; convertPct?: number } {
  return fb.fire > 0 ? { convert: 'fire', convertPct: Math.min(1, fb.fire) } : {};
}

/** Coup de pied : dégâts d'arme réduits (le pied ne dépend pas des griffes), bonus de la compétence */
function kick(w: World, t: Monster, wdmg: number, arPct: number, extra: Parameters<typeof strike>[2] = {}): number {
  return strike(w, t, { wdmg, ar: arPct, mult: 0.8, knockback: 1.6, flat: w.player.d.all.get('kickDmg') ?? 0, ...extra });
}

/** Paramètres d'un lancement de compétence de l’Assassin (arguments de `castAssassin` et valeurs communes calculées une fois) */
interface AssassinCast {
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

/** Exécute une compétence de l'Assassin. Renvoie false si l'identifiant n'en est pas une. */
export function castAssassin(w: World, id: string, tx: number, ty: number, targetId: number, L: number): boolean {
  const s = SKILL_BY_ID[id];
  const p = w.player;
  const n = s.n;
  const ang = Math.atan2(ty - p.y, tx - p.x);
  if (TRAPS.includes(id)) {
    castTrap(w, id, L, tx, ty, targetId);
    return true;
  }
  const cast = Object.prototype.hasOwnProperty.call(ASSASSIN_CASTS, id) ? ASSASSIN_CASTS[id] : undefined;
  if (cast) {
    cast({ w, id, tx, ty, targetId, L, s, p, n, ang });
    return true;
  }
  void rollHit;
  void weaponMastery;
  void monsterDmg;
  return false;
}

/* ---------------------- Arts martiaux : charges ---------------------- */
function castTigerStrike(ctx: AssassinCast): void {
  const { w, id, targetId, L, p, n } = ctx;
  const t = meleeTarget(w, targetId, reachOf(w, id));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  // étage du cycle partagé (1 à 3) ; la Frappe du tigre applique son bonus de dégâts (et de zone) à son propre coup,
  // le coup du cobra de l'étage 2 sa table « Damage +% »
  const opts: Parameters<typeof strike>[2] = { ar: ramp(n.ar!, L), skill: id };
  // D2 : le coup pose une charge de sa compétence, sans autre effet ; les finitions la libèrent
  if (!asn().chargesImmediate) {
    if (strike(w, t, opts) > 0) setCharges(w, id, L, chargeCount(w, id) + 1);
    return;
  }
  const stage = Math.min(3, cyclePos(w) + 1);
  if (id === 'tiger_strike') {
    opts.wdmg = nv(id, 'wdmg', L) * stage;
    opts.splash = 20 * (stage - 1);
  } else if (id === 'cobra_strike' && stage === 2) opts.wdmg = nv(id, 'wdmg', L);
  const dealt = strike(w, t, opts);
  if (dealt <= 0) return;
  if (id === 'tiger_strike') setCharges(w, id, L, chargeCount(w, id) + 1);
  else {
    chargeEffect(w, id, stage, L, t, dealt);
    setCharges(w, id, L, stage >= 3 ? 0 : stage);
  }
  if (stage >= 3) endCycle(w);
  else setCycle(w, stage);
}

/* ---------------------- Arts martiaux : finitions ---------------------- */
function castDragonTalon(ctx: AssassinCast): void {
  const { w, id, targetId, L, p, n } = ctx;
  const t = meleeTarget(w, targetId, reachOf(w, id));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  const kicks = Math.floor(lin(n.count, L));
  const fb = finisherBonus(w);
  const held = heldCharges(w);
  for (let i = 0; i < kicks && !t.dead; i++) {
    const dealt = kick(w, t, wdOf(w, id, L) + fb.wdmg, nv(id, 'ar', L) + fb.ar, { skill: id, ...fireConv(fb) });
    releaseCharges(w, t, dealt, held);
  }
  clearCharges(w);
}

function castDragonClaw(ctx: AssassinCast): void {
  const { w, id, targetId, L, p } = ctx;
  const t = meleeTarget(w, targetId, reachOf(w, id));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  // PD2 : synergies Maîtrise des griffes et Parade d'arme (+20 %/niv. chacune), additives ; chaque griffe déclenche les charges
  const fb = finisherBonus(w);
  const held = heldCharges(w);
  const wd = wdOf(w, id, L) + fb.wdmg;
  releaseCharges(w, t, strike(w, t, { wdmg: wd, ar: nv(id, 'ar', L) + fb.ar, skill: id, ...fireConv(fb) }), held);
  if (!t.dead) releaseCharges(w, t, strike(w, t, { wdmg: wd, ar: nv(id, 'ar', L) + fb.ar, off: !!offhandWeapon(w), skill: id, ...fireConv(fb) }), held);
  clearCharges(w);
}

function castDragonTail(ctx: AssassinCast): void {
  const { w, id, targetId, L, s, p, n } = ctx;
  const t = meleeTarget(w, targetId, reachOf(w, id));
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  const fb = finisherBonus(w);
  const held = heldCharges(w);
  // D2 : coup de pied, puis la cible explose (feu : `value` % des dégâts du coup, rayon de la table) ; règle skills.assassin
  if (asn().dragonTailExplodes) {
    const dealt = kick(w, t, wdOf(w, id, L) + fb.wdmg, nv(id, 'ar', L) + fb.ar, { skill: id, ...fireConv(fb) });
    if (dealt > 0) explode(w, 0, t.x, t.y, lin(n.radius, L), pkt('fire', (dealt * lin(n.value, L) * syn(w, id) * elemMul(w, 'fire')) / 100, id), 'fists_of_fire', 'fire');
    releaseCharges(w, t, dealt, held);
    clearCharges(w);
    return;
  }
  // mod : le coup de pied convertit 100 % du physique en feu (sans cumul avec les Poings de feu), « Kick Fire Damage +% »
  // de la table et des synergies, et blesse en zone (4 yards de rayon : 40 % de zone en plus du rayon de mêlée)
  const wd = lin(n.value, L) + synergyPct(s, p.d.hardPoints) + fb.wdmg;
  releaseCharges(w, t, kick(w, t, wd, nv(id, 'ar', L) + fb.ar, { skill: id, convert: 'fire', convertPct: 1, splash: 40 }), held);
  clearCharges(w);
}

function castDragonFlight(ctx: AssassinCast): void {
  const { w, id, targetId, L, p, n } = ctx;
  const t = w.monsters.find((m) => m.id === targetId && !m.dead && !m.isSummon) ?? meleeTarget(w, 0, 9);
  if (!t) return;
  if (dist(p.x, p.y, t.x, t.y) > 1.6) dashTo(w, t.x, t.y, 10, 1.0);
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  // recharge selon le niveau (mod : table `value`) ; D2 : recharge de la compétence (1 s, `cooldown`)
  if (n.value) p.cooldowns[id] = Math.max(p.cooldowns[id] ?? 0, w.tick + Math.round(lin(n.value, L) * (1 - clamp(p.d.all.get('cooldownRed') ?? 0, 0, 75) / 100) * TICK_HZ));
  if (dist(p.x, p.y, t.x, t.y) > attackReach(w) + t.radius + p.radius + 0.9) return;
  const fb = finisherBonus(w);
  const held = heldCharges(w);
  releaseCharges(w, t, kick(w, t, wdOf(w, id, L) + fb.wdmg, nv(id, 'ar', L) + fb.ar, { skill: id, ...fireConv(fb) }), held);
  clearCharges(w);
}

/* ---------------------- Disciplines de l'ombre ---------------------- */
function castPsychicHammer(ctx: AssassinCast): void {
  const { w, id, L, s, p, n, ang } = ctx;
  const pk = pkt('magic', roll(w, id, L) * syn(w, id), id);
  pk.knockback = 1.6;
  pk.srcX = p.x;
  pk.srcY = p.y;
  spawnMissile(w, { kind: 'psychic_hammer', team: 0, owner: p.id, x: p.x, y: p.y, angle: ang, speed: n.speed ?? 12, radius: 0.45, range: s.range + 2, dmg: pk, elem: 'magic', level: L });
}

function castBurstOfSpeed(ctx: AssassinCast): void {
  const { w, id, L, n } = ctx;
  addBuff(w, id, L, lin(n.duration, L));
}

function castCloakOfShadows(ctx: AssassinCast): void {
  const { w, id, L, p, n } = ctx;
  addBuff(w, id, L, lin(n.duration, L));
  const ticks = t25(lin(n.duration, L));
  // PD2 : portée de 20 yards, durée fixe de 5 s, recharge de 5 s
  const r = lin(n.radius, L);
  for (const m of w.monstersNear(p.x, p.y, r, buf)) {
    debuff(w, m, { def: 1 - lin(n.value2, L) / 100 }, ticks);
    if (m.rank !== 'boss') m.blindUntil = w.tick + ticks;
  }
  w.events.push({ t: 'nova', kind: 'cloak', x: p.x, y: p.y, radius: Math.min(r, 8), elem: 'magic' });
}

function castShadowWarrior(ctx: AssassinCast): void {
  const { w, id, tx, ty, L } = ctx;
  summonMinion(w, id, L, tx, ty);
}

function castMindBlast(ctx: AssassinCast): void {
  const { w, id, tx, ty, targetId, L, p, s } = ctx;
  const c = w.monsters.find((m) => m.id === targetId && !m.dead && !m.isSummon);
  const x = c ? c.x : tx;
  const y = c ? c.y : ty;
  // rayon et étourdissement : règle skills.assassin (D2 : table ; PD2 : selon les points INVESTIS, 4 à 6 yards, 4 s sans point, 2 s avec un seul)
  const mb = asn().mindBlast(p.d.hardPoints.mind_blast ?? 0, s.n.radius, s.n.stun, L);
  const r = mb.radius;
  const stun = mb.stun;
  w.events.push({ t: 'nova', kind: 'mind_blast', x, y, radius: Math.min(r, 6), elem: 'magic' });
  for (const m of w.monstersNear(x, y, r, buf)) {
    if (m.dead || m.isSummon) continue;
    // dégâts physiques (retour à 100 % physique en S13), plus de conversion des ennemis
    const pk = emptyPacket(true);
    pk.phys = roll(w, id, L) * syn(w, id);
    pk.skill = id;
    if (stun > 0) pk.stun = t25(stun);
    w.hurtMonster(m, pk);
  }
}

/** Compétences de l’Assassin : identifiant → effet */
const ASSASSIN_CASTS: Record<string, (c: AssassinCast) => void> = {
  tiger_strike: castTigerStrike,
  fists_of_fire: castTigerStrike,
  cobra_strike: castTigerStrike,
  claws_of_thunder: castTigerStrike,
  blades_of_ice: castTigerStrike,
  phoenix_strike: castTigerStrike,
  dragon_talon: castDragonTalon,
  dragon_claw: castDragonClaw,
  dragon_tail: castDragonTail,
  dragon_flight: castDragonFlight,
  psychic_hammer: castPsychicHammer,
  burst_of_speed: castBurstOfSpeed,
  fade: castBurstOfSpeed,
  venom: castBurstOfSpeed,
  cloak_of_shadows: castCloakOfShadows,
  shadow_warrior: castShadowWarrior,
  shadow_master: castShadowWarrior,
  mind_blast: castMindBlast,
};

/** Furie des lames : se divise en trois lames (3 divisions au plus, chacune raccourcit la vie restante de 2 images) */
function bladeFurySplit(w: World, m: Missile, x: number, y: number, base: number, hit?: Monster): void {
  const depth = m.aux;
  if (depth >= 3 || m.life < 3) return;
  for (let i = -1; i <= 1; i++) {
    const c = spawnMissile(w, {
      kind: 'blade_fury',
      team: 0,
      owner: m.owner,
      x,
      y,
      angle: base + i * 0.6,
      speed: Math.hypot(m.vx, m.vy),
      radius: m.radius,
      range: 20,
      dmg: { ...m.dmg },
      elem: 'phys',
      level: m.level,
    });
    c.life = Math.max(1, m.life - 2);
    c.maxLife = c.life;
    c.aux = depth + 1;
    if (hit) c.hits = [hit.id];
  }
}

/** Furie des lames : une fois sur deux sur un ennemi touché */
export function bladeFuryHit(w: World, m: Missile, t: Monster): void {
  if (w.rng.combat.chance(0.5)) bladeFurySplit(w, m, m.x, m.y, Math.atan2(m.vy, m.vx), t);
}

/** Furie des lames : toujours sur un mur (les lames repartent vers l'arrière) */
export function bladeFuryWall(w: World, m: Missile): void {
  if (!w.grid.isOpaqueAt(m.x, m.y)) return;
  bladeFurySplit(w, m, m.px, m.py, Math.atan2(m.vy, m.vx) + Math.PI);
}

/** Marteau psychique : rebondit sur les ennemis voisins (5,33 yards), −20 % de dégâts à chaque rebond, N coups au total (table) */
export function psychicBounce(w: World, m: Missile, t: Monster): void {
  const hits = Math.floor(lin(SKILL_BY_ID.psychic_hammer.n.count, m.level));
  const seen = new Set<number>([t.id]);
  let cur = t;
  for (let k = 1; k < hits; k++) {
    let next: Monster | null = null;
    let bd = yd(5.33);
    for (const o of w.monstersNear(cur.x, cur.y, yd(5.33), buf)) {
      if (o.dead || o.isSummon || seen.has(o.id)) continue;
      const d = dist(cur.x, cur.y, o.x, o.y);
      if (d < bd) {
        bd = d;
        next = o;
      }
    }
    if (!next) return;
    seen.add(next.id);
    const pk = scalePacket(m.dmg, Math.pow(0.8, k));
    pk.knockback = 1.6;
    pk.srcX = cur.x;
    pk.srcY = cur.y;
    w.events.push({ t: 'beam', kind: 'thunder', points: [cur.x, cur.y, next.x, next.y], elem: 'magic' });
    w.hurtMonster(next, pk);
    cur = next;
  }
}

/* ------------------------------------------------------------------ */
/* Pièges                                                              */
/* ------------------------------------------------------------------ */

function trapDamage(w: World, id: string, L: number): { e: Element; v: number } {
  const e = SKILL_BY_ID[id].element;
  return { e, v: roll(w, id, L) * syn(w, id) * elemMul(w, e) };
}

/** Dégâts d'arme (arme principale, dégâts % et maîtrise des griffes compris) ajoutés aux dégâts de compétence des lames : 100 % (Sentinelle), 75 % (Furie), 25 % (Bouclier) */
function weaponPart(w: World, frac: number): number {
  const m = weaponMastery(w);
  return weaponRoll(w) * (1 + (w.player.d.meleeDmgPct + m.dmg) / 100) * frac;
}

/** Point au hasard dans un disque de rayon `r` autour de (x, y) */
function scatter(w: World, x: number, y: number, r: number): { x: number; y: number } {
  const a = w.rng.combat.float(0, TAU);
  const d = Math.sqrt(w.rng.combat.next()) * r;
  return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d };
}

/** Tourelles PD2 : tirs avant de disparaître, cadence (images), portée de détection (unités) */
const SENTRY_SPEC: Record<string, { shots: number; every: number; range: number }> = {
  charged_bolt_sentry: { shots: 5, every: 22, range: 8 },
  lightning_sentry: { shots: 7, every: 14, range: 4.69 },
  chain_lightning_sentry: { shots: 7, every: 16, range: 8 },
  wake_of_fire: { shots: 5, every: 20, range: 8 },
  wake_of_inferno: { shots: 5, every: 25, range: 3.33 },
  death_sentry: { shots: 500, every: 12, range: 7 },
};

function castTrap(w: World, id: string, L: number, tx: number, ty: number, targetId: number): void {
  const s = SKILL_BY_ID[id];
  const p = w.player;
  const n = s.n;
  const ang = Math.atan2(ty - p.y, tx - p.x);
  const t = w.monsters.find((m) => m.id === targetId && !m.dead && !m.isSummon);
  const x = t ? t.x : tx;
  const y = t ? t.y : ty;
  switch (id) {
    case 'fire_blast': {
      // PD2 : N bombes (1 à 9 selon le niveau), qui atterrissent au hasard à moins de 3,33 yards de la cible ; explosion de 2,66 yards
      const bombs = Math.max(1, Math.floor(lin(n.count, L)));
      for (let i = 0; i < bombs; i++) {
        const d = trapDamage(w, id, L);
        const spot = i === 0 && !t ? { x, y } : scatter(w, x, y, yd(3.33));
        const dx = spot.x - p.x;
        const dy = spot.y - p.y;
        spawnMissile(w, {
          kind: 'fire_blast',
          team: 0,
          owner: p.id,
          x: p.x,
          y: p.y,
          angle: Math.atan2(dy, dx),
          speed: n.speed ?? 13,
          radius: 0.35,
          range: Math.hypot(dx, dy) + 0.2,
          dmg: pkt('fire', d.v, id),
          elem: 'fire',
          level: L,
        });
      }
      return;
    }
    case 'blade_sentinel': {
      // part des dégâts d'arme et durée : règle skills.assassin (D2 : 48/128, table ; PD2 : 100 %, 2 s) ; 24 yards/s, un coup toutes les 0,2 s
      const r = asn();
      const d = roll(w, id, L) * syn(w, id) + weaponPart(w, r.bladeSentinelWeapon);
      const pk = emptyPacket(true);
      pk.phys = d;
      pk.skill = id;
      const dur = r.bladeSentinelSeconds(n.duration, L);
      const m = spawnMissile(w, {
        kind: 'blade_sentinel',
        team: 0,
        owner: p.id,
        x: p.x,
        y: p.y,
        angle: ang,
        speed: yd(24),
        radius: 0.55,
        range: yd(24) * dur,
        dmg: pk,
        elem: 'phys',
        pierce: true,
        level: L,
      });
      m.aux = dist(p.x, p.y, x, y) + 2; // distance d'aller avant le retour
      m.life = m.maxLife = t25(dur);
      m.tx = p.x;
      m.ty = p.y;
      m.t0 = w.tick;
      return;
    }
    case 'blade_fury': {
      // PD2 : une lame (arme principale, 75 % des dégâts d'arme ajoutés), 1,12 s, qui se divise en trois sur un mur ou (une fois sur deux) un ennemi
      const pk = emptyPacket(true);
      pk.phys = roll(w, id, L) * syn(w, id) + weaponPart(w, 0.75);
      pk.skill = id;
      const mas = weaponMastery(w);
      pk.ar = p.d.attackRating * (1 + (nv(id, 'ar', L) + mas.ar) / 100);
      const pierceLvl = p.d.skillLevels['pierce'] ?? 0;
      const ch = Math.min(100, (pierceLvl > 0 ? lin(SKILL_BY_ID.pierce.n.value, pierceLvl) : 0) + (p.d.all.get('pierceChance') ?? 0));
      if (ch > 0) pk.pierceChance = ch;
      const m = spawnMissile(w, { kind: 'blade_fury', team: 0, owner: p.id, x: p.x, y: p.y, angle: ang, speed: 13, radius: 0.4, range: 13 * 1.12, dmg: pk, elem: 'phys', level: L });
      m.life = m.maxLife = t25(1.12);
      m.aux = 0;
      return;
    }
    case 'blade_shield':
      addBuff(w, id, L, lin(n.duration, L));
      return;
    case 'shock_web': {
      // PD2 : N pointes (4 à 24) qui retombent au hasard à moins de 3,33 yards de la cible, 1,33 yard de rayon chacune, 3,6 s
      const spikes = Math.max(1, Math.floor(lin(n.count, L)));
      for (let i = 0; i < spikes; i++) {
        const spot = scatter(w, x, y, yd(3.33));
        spawnArea(w, { kind: 'trap_shock_web', team: 0, owner: p.id, x: spot.x, y: spot.y, radius: yd(1.33), ticks: t25(3.6), every: 5, dmg: pkt('light', 0, id), elem: 'light', level: L });
      }
      return;
    }
    default: {
      // tourelles : au plus cinq à la fois, la plus ancienne disparaît ; elles tirent un nombre fixe de fois puis disparaissent
      // chaque poseur (joueur, ombre) a son propre plafond ; PD2 S13 : les pièges d'une ombre lui appartiennent
      const owner = w.actingAs?.id ?? p.id;
      const mine = w.areas.filter((a) => a.team === 0 && a.owner === owner && a.kind.startsWith('trap_') && SENTRIES.some((k) => a.kind === `trap_${k}`) && !a.dead);
      while (mine.length >= (w.actingAs ? SHADOW_MAX_SENTRIES : MAX_SENTRIES)) mine.shift()!.dead = true;
      const spot = w.grid.nearestFree(x, y, 2) ?? { x: p.x, y: p.y };
      const sp = SENTRY_SPEC[id];
      const a = spawnArea(w, {
        kind: `trap_${id}`,
        team: 0,
        owner: p.id,
        x: spot.x,
        y: spot.y,
        radius: sp.range,
        ticks: t25(45),
        every: 1,
        dmg: emptyPacket(true),
        elem: SKILL_BY_ID[id].element,
        level: L,
        aux: asn().sentryShots(id, sp.shots),
      });
      a.x2 = 0; // fin de la gerbe en cours (Sillage d'enfer)
      w.events.push({ t: 'impact', kind: 'trap_set', x: spot.x, y: spot.y, radius: 0.9, elem: SKILL_BY_ID[id].element });
    }
  }
}

/** Comportement des zones de piège (appelé par updateArea) */
export function updateTrap(
  w: World,
  a: { kind: string; x: number; y: number; x2: number; y2: number; radius: number; life: number; maxLife: number; level: number; elem: Element; dead: boolean; id: number; aux: number },
): void {
  const id = a.kind.slice(5);
  const L = a.level;
  const age = a.maxLife - a.life;
  const sp = SENTRY_SPEC[id];
  /** Un tir de moins ; la tourelle disparaît au dernier */
  const spent = (): void => {
    if (--a.aux <= 0) a.dead = true;
  };
  switch (id) {
    case 'shock_web': {
      if (age % 5 !== 0) return;
      for (const m of w.monstersNear(a.x, a.y, a.radius, buf)) {
        if (m.dead || m.isSummon) continue;
        // valeurs par seconde de la table, appliquées toutes les 0,2 s par chaque pointe
        w.hurtMonster(m, pkt('light', roll(w, id, L) * syn(w, id) * elemMul(w, 'light') * 0.2, id));
      }
      return;
    }
    case 'charged_bolt_sentry':
    case 'lightning_sentry': {
      if (age % sp.every !== 0) return;
      const targets = nearest(w, a.x, a.y, sp.range);
      if (!targets.length) return;
      // Tourelle à éclairs : N éclairs par tir (table des points investis), qui traversent toujours
      const bolts = id === 'charged_bolt_sentry' ? asn().chargedBolts(w.player.d.hardPoints[id] ?? 0) : 1;
      for (let i = 0; i < bolts; i++) {
        const m = targets[i % targets.length];
        w.events.push({ t: 'beam', kind: 'thunder', points: [a.x, a.y, m.x, m.y], elem: 'light' });
        w.hurtMonster(m, pkt('light', roll(w, id, L) * syn(w, id) * elemMul(w, 'light'), id));
      }
      spent();
      return;
    }
    case 'chain_lightning_sentry': {
      // PD2 : un éclair qui saute 8 fois entre ennemis (13,33 yards de distance de saut) ; −20 % par saut (supposé)
      if (age % sp.every !== 0) return;
      const first = nearest(w, a.x, a.y, sp.range)[0];
      if (!first) return;
      const hit = new Set<number>([first.id]);
      let cur = first;
      let amt = roll(w, id, L) * syn(w, id) * elemMul(w, 'light');
      let px = a.x;
      let py = a.y;
      for (let i = 0; i < 9 && cur; i++) {
        w.events.push({ t: 'beam', kind: 'thunder', points: [px, py, cur.x, cur.y], elem: 'light' });
        w.hurtMonster(cur, pkt('light', amt, id));
        amt *= 0.8;
        px = cur.x;
        py = cur.y;
        cur = nearest(w, cur.x, cur.y, yd(13.33)).find((m) => !hit.has(m.id)) as Monster;
        if (cur) hit.add(cur.id);
      }
      spent();
      return;
    }
    case 'wake_of_fire': {
      // PD2 : vague de feu de 16 yards de long sur 12 de large, vers la cible la plus proche
      if (age % sp.every !== 0) return;
      const t = nearest(w, a.x, a.y, sp.range)[0];
      if (!t) return;
      const ang = Math.atan2(t.y - a.y, t.x - a.x);
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      w.events.push({ t: 'impact', kind: 'wake', x: a.x + cs * 2, y: a.y + sn * 2, radius: 2.6, elem: 'fire' });
      for (const m of w.monstersNear(a.x + cs * yd(8), a.y + sn * yd(8), yd(10), buf)) {
        if (m.dead || m.isSummon) continue;
        const fwd = (m.x - a.x) * cs + (m.y - a.y) * sn;
        const side = Math.abs(-(m.x - a.x) * sn + (m.y - a.y) * cs);
        if (fwd < -m.radius || fwd > yd(16) + m.radius || side > yd(6) + m.radius) continue;
        w.hurtMonster(m, pkt('fire', roll(w, id, L) * syn(w, id) * elemMul(w, 'fire'), id));
      }
      spent();
      return;
    }
    case 'wake_of_inferno': {
      // PD2 : cinq gerbes d'une seconde (6,66 yards de portée) ; la table donne les dégâts par seconde, appliqués à chaque image
      if (w.tick >= a.x2) {
        if (a.aux <= 0) {
          a.dead = true;
          return;
        }
        if (!nearest(w, a.x, a.y, sp.range).length) return;
        a.x2 = w.tick + t25(1);
        a.y2 = age;
        a.aux--;
      }
      if ((age - a.y2) % 5 !== 0) return;
      if (age === a.y2) w.events.push({ t: 'impact', kind: 'inferno_spout', x: a.x, y: a.y, radius: 2.4, elem: 'fire' });
      for (const m of w.monstersNear(a.x, a.y, sp.range, buf)) if (!m.dead && !m.isSummon) w.hurtMonster(m, pkt('fire', roll(w, id, L) * syn(w, id) * elemMul(w, 'fire') * 0.2, id));
      return;
    }
    case 'death_sentry': {
      if (age % sp.every !== 0) return;
      const c = corpseNear(w, a.x, a.y, sp.range);
      if (!c) return;
      c.eaten = true;
      c.deathTick = Math.min(c.deathTick, w.tick - TICK_HZ * 11);
      // dégâts de la table + une part de la vie maximale du cadavre (moitié physique, moitié feu) dans un rayon : règle skills.assassin
      // (D2 : 40 à 80 %, 10 demi-cases + 1 par niveau ; PD2 : 3 à 5 %, 14 yards)
      const r = asn();
      const v = roll(w, id, L) * syn(w, id);
      const life = (c.hpMax ?? 0) * w.rng.combat.float(r.deathSentryCorpse[0], r.deathSentryCorpse[1]);
      const pk = emptyPacket(true);
      pk.phys = v + life / 2;
      pk.fire = v * elemMul(w, 'fire') + life / 2;
      pk.skill = id;
      w.events.push({ t: 'beam', kind: 'thunder', points: [a.x, a.y, c.x, c.y], elem: 'fire' });
      explode(w, 0, c.x, c.y, r.deathSentryRadius(L), pk, 'corpse_explosion', 'fire');
      return;
    }
  }
}

function nearest(w: World, x: number, y: number, r: number): Monster[] {
  const list = [...w.monstersNear(x, y, r, buf)].filter((m) => !m.dead && !m.isSummon && (m.convertedUntil ?? 0) <= w.tick);
  list.sort((u, v) => dist(x, y, u.x, u.y) - dist(x, y, v.x, v.y));
  return list;
}

/** Lames tournoyantes du Bouclier de lames : un coup (test de toucher) à la fréquence de la table des points investis (0,8 s à 0,4 s) */
export function assassinTick(w: World): void {
  const p = w.player;
  const bs = p.buffs.find((b) => b.id === 'blade_shield');
  if (!bs) return;
  const id = 'blade_shield';
  // cadence et rayon : règle skills.assassin (D2 : 0,4 s, table ; PD2 : selon les points investis, 2,66 yards)
  const sh = asn().bladeShield(p.d.hardPoints[id] ?? 0, SKILL_BY_ID[id].n.radius, bs.level);
  if (w.tick % sh.every !== 0) return;
  const mas = weaponMastery(w);
  const ar = nv(id, 'ar', bs.level) + mas.ar;
  // 25 % des dégâts d'arme ajoutés (SrcDam 32/128) ; test de toucher
  for (const m of w.monstersNear(p.x, p.y, sh.radius, buf)) {
    if (m.dead || m.isSummon) continue;
    if (dist(p.x, p.y, m.x, m.y) > sh.radius + m.radius) continue;
    if (!rollHit(w, m, ar)) continue;
    const pk = emptyPacket(true);
    pk.phys = roll(w, id, bs.level) * syn(w, id) + weaponPart(w, 0.25);
    pk.skill = id;
    w.hurtMonster(m, pk);
  }
}

/** Lames du Bouclier, de la Sentinelle : rotation ou allers-retours (missiles) */
export function bladeSentinelStep(w: World, m: Missile): void {
  // aller : jusqu'à la cible ; retour : vers le lanceur
  const p = w.player;
  // PD2 : un coup toutes les 0,2 s sur les ennemis dans la lame
  if (w.tick % 5 === 0) m.hits = [];
  const out = Math.hypot(m.x - m.tx, m.y - m.ty);
  const sp = Math.hypot(m.vx, m.vy) || 8;
  if (m.aux > 0 && out >= m.aux) m.aux = -1;
  if (m.aux < 0) {
    const a = Math.atan2(p.y - m.y, p.x - m.x);
    m.vx = Math.cos(a) * sp;
    m.vy = Math.sin(a) * sp;
    if (dist(m.x, m.y, p.x, p.y) < 0.8) {
      // arrivée : repart vers l'avant
      m.hits = [];
      m.tx = p.x;
      m.ty = p.y;
      const t = nearest(w, p.x, p.y, 9)[0];
      const b = t ? Math.atan2(t.y - p.y, t.x - p.x) : p.facing;
      m.vx = Math.cos(b) * sp;
      m.vy = Math.sin(b) * sp;
      m.aux = t ? dist(p.x, p.y, t.x, t.y) + 2 : 6;
    }
  }
}
