/**
 * Druide : sorts élémentaires (vent et feu), métamorphoses (loup-garou, ours-garou) et attaques
 * animales, créatures invoquées (corbeaux, loups, grizzly, lianes, esprits) et leur IA.
 * Les chiffres viennent de data/skills-druid.ts. Les créatures sont des Monster alliés
 * (isSummon + pet) : les monstres peuvent les prendre pour cible (ai.ts) sauf les corbeaux.
 */
import type { SorcSkill } from '../data/skills';
import { shadowAct } from './shadow-cast';
import { playsStrike } from './rhythm';
import { carryMerc } from './merc-core';
import { SKILL_BY_ID, lin, skillHard, ramp, synergyPct } from '../data/skills';
import type { Element } from '../data/stats';
import { PET_DEFS } from '../data/monsters';
import { monsterAr, monsterDmg, monsterHp } from '../data/curves';
import { clamp, dist, TAU } from '../core/math';
import { emptyPacket, type DamagePacket, type Monster, type Player } from './actors';
import { TICK_HZ, DT } from './constants';
import { damageMonster, hitChance } from './combat';
import { addBleed, strike } from './melee';
import { golemSynergy } from './minions';
import { valkyriePowerStrike } from './amazon';
import { spawnArea, spawnMissile } from './missiles';
import { explode } from './explosion';
import type { AreaEffect, Missile } from './actors';
import type { World } from './world';
import { addStack, addBuff, applyReduction, makeSummon, skillDamageRange, skillLevel, teleportPlayer } from './skills';
import { RULES } from '../mods/rules';

const buf: Monster[] = [];
/** Comportements du jeu de règles (règle skills.druid : D2, src/mods/d2/skills.ts ; un mod peut les remplacer) */
const druid = (): ReturnType<(typeof RULES)['skills.druid']> => RULES['skills.druid']();

export type Form = 'werewolf' | 'werebear';
export const SPIRITS = ['oak_sage', 'heart_wolverine', 'spirit_barbs'];
export const VINES = ['plague_poppy', 'cycle_of_life', 'vines'];
/** Durée « permanente » des formes et des auras d'esprit (ticks) */
const PERMANENT = 1e8;
/** Tornade PD2 : 3 s de vie, 16 yards au plus (1 unité = 2 yards) */
const TORNADO_SECONDS = 3;
const TORNADO_RANGE = 8;
/** Ouragan : dégâts toutes les 0,8 s (20 images) ; Armageddon : un météore toutes les 0,36 s (9 images), explosion de 4 yards ; sol brûlant 1,48 s */
const HURRICANE_EVERY = 20;
const ARMAGEDDON_EVERY = 9;
const METEOR_RADIUS = 2;
const BURN_TICKS = 37;

export function playerForm(w: World): Form | null {
  const b = w.player.buffs.find((x) => x.id === 'werewolf' || x.id === 'werebear');
  return b ? (b.id as Form) : null;
}

/* ------------------------------------------------------------------ */
/* Dégâts                                                              */
/* ------------------------------------------------------------------ */

/** Dégâts du second élément (Rocher en fusion, Volcan, Armageddon, Corbeau) */
export function skillDamageRange2(w: World, id: string, lvl?: number): { min: number; max: number; elem: Element } | null {
  const s = SKILL_BY_ID[id];
  const d = w.player.d;
  const L = lvl ?? skillLevel(w, id);
  if (!s || !s.element2 || !s.n.min2 || !s.n.max2 || L <= 0) return null;
  const mul = (1 + synergyPct(s, d.hardPoints) / 100) * (1 + (d.elemDmgPct[s.element2] ?? 0) / 100);
  return { min: ramp(s.n.min2, L) * mul, max: ramp(s.n.max2, L) * mul, elem: s.element2 };
}

/** Paquet de dégâts d'un sort du Druide (les deux éléments), × mul */
function spellPacket(w: World, id: string, mul = 1, lvl?: number): DamagePacket {
  const pk = emptyPacket(true);
  const r = skillDamageRange(w, id, lvl);
  pk[r.elem] += w.rng.combat.float(r.min, Math.max(r.min, r.max)) * mul;
  const r2 = skillDamageRange2(w, id, lvl);
  if (r2) pk[r2.elem] += w.rng.combat.float(r2.min, Math.max(r2.min, r2.max)) * mul;
  pk.skill = id;
  return pk;
}

/* ------------------------------------------------------------------ */
/* Règles d'incantation                                                */
/* ------------------------------------------------------------------ */

/** Avant l'incantation : changement de forme automatique (D2 : une attaque de loup-garou transforme le Druide) */
export function druidPreCast(w: World, id: string): void {
  if (w.character.classId !== 'druid' || id === 'attack') return;
  const s = SKILL_BY_ID[id];
  if (!s) return;
  const cur = playerForm(w);
  if (s.form) {
    const want: Form = s.form === 'any' ? (cur ?? (skillLevel(w, 'werebear') > 0 ? 'werebear' : 'werewolf')) : s.form;
    if (cur !== want) setForm(w, want);
  } else if (cur && s.tree !== 'shape') {
    // un sort hors métamorphose ramène à la forme humaine (choix mobile : pas de sort grisé)
    setForm(w, null);
  }
}

function setForm(w: World, form: Form | null): void {
  const p = w.player;
  p.buffs = p.buffs.filter((b) => b.id !== 'werewolf' && b.id !== 'werebear' && b.id !== 'feral_rage' && b.id !== 'maul');
  if (form) p.buffs.push({ id: form, level: Math.max(1, skillLevel(w, form)), until: w.tick + PERMANENT });
  w.events.push({ t: 'impact', kind: 'shapeshift', x: p.x, y: p.y, radius: 1.2, elem: 'magic' });
  w.refreshPlayer();
}

/* ------------------------------------------------------------------ */
/* Lancement                                                           */
/* ------------------------------------------------------------------ */

/** Paramètres d'un lancement de compétence du Druide (arguments de `castDruid` et valeurs communes calculées une fois) */
interface DruidCast {
  w: World;
  id: string;
  tx: number;
  ty: number;
  targetId: number;
  L: number;
  p: Player;
  s: SorcSkill;
  ang: number;
}

/** Exécute une compétence du Druide. Renvoie false si l'identifiant n'en est pas une. */
export function castDruid(w: World, id: string, tx: number, ty: number, targetId: number, L: number): boolean {
  const p = w.player;
  const s = SKILL_BY_ID[id];
  const ang = Math.atan2(ty - p.y, tx - p.x);
  const cast = Object.prototype.hasOwnProperty.call(DRUID_CASTS, id) ? DRUID_CASTS[id] : undefined;
  if (cast) {
    cast({ w, id, tx, ty, targetId, L, p, s, ang });
    return true;
  }
  return false;
}

/* --------------------------- Élémentaire --------------------------- */
function castFirestorm(ctx: DruidCast): void {
  const { w, id, L, p, s, ang } = ctx;
  // langues de feu : table de la compétence (D2 : calc1) ; mod : selon les POINTS DURS (table « Number of Tendrils »)
  const n = Math.max(1, skillHard('firestorm', 'Number of Tendrils', p.d.hardPoints.firestorm ?? 0) || Math.floor(lin(s.n.count, L)));
  for (let i = 0; i < n; i++) {
    const a = ang + (i - (n - 1) / 2) * 0.22;
    spawnMissile(w, {
      kind: 'firestorm',
      team: 0,
      owner: p.id,
      x: p.x,
      y: p.y,
      angle: a,
      speed: s.n.speed ?? 9,
      radius: 0.55,
      range: s.range + 1,
      dmg: spellPacket(w, id),
      elem: 'fire',
      pierce: true,
      level: L,
      z: 0.2,
    });
  }
}

function castArcticBlast(ctx: DruidCast): void {
  const { w, id, L, p, s, ang } = ctx;
  // cône canalisé comme l'Inferno : dégâts/s × durée de l'incantation
  const secs = meleeOrCastSeconds(w, id);
  const pk = spellPacket(w, id, secs);
  pk.chill = Math.round(lin(s.n.chill, L) * TICK_HZ);
  pk.chillPct = 0.5;
  // PD2 : longueur du jet = portée de la table (8 à 16 yards), résistance au froid de l'ennemi réduite pendant le jet et 0,4 s après,
  // les ennemis tués par le jet se brisent en une nova de givre (4,89 yards)
  const r = lin(s.n.radius, L);
  const red = lin(s.n.value, L);
  for (const m of w.monstersNear(p.x, p.y, r, buf)) {
    if (angleTo(p, m, ang) >= 0.6) continue;
    // réduction de la résistance au froid : chiffre `value` du mod (D2 : aucune)
    if (red > 0) applyReduction(w, m, 'cold', red, Math.round((secs + 0.4) * TICK_HZ));
    w.hurtMonster(m, { ...pk });
    if (m.dead) shatter(w, m.x, m.y, L);
  }
  w.events.push({ t: 'impact', kind: 'arctic_blast', x: p.x + Math.cos(ang) * r * 0.5, y: p.y + Math.sin(ang) * r * 0.5, radius: r * 0.5, elem: 'cold' });
}

function castMoltenBoulder(ctx: DruidCast): void {
  const { w, id, L, p, s, ang } = ctx;
  // PD2 : 50 % de chances de repousser (en chaîne), vitesse et distance selon le niveau, explose en fin de course (4,66 yards),
  // sol brûlant 1,48 s sur le trajet et à l'explosion
  const pk = spellPacket(w, id);
  pk.knockback = 1.2;
  pk.knockbackPct = lin(s.n.value, L);
  spawnMissile(w, {
    kind: 'boulder',
    team: 0,
    owner: p.id,
    x: p.x,
    y: p.y,
    angle: ang,
    // vitesse et distance selon le niveau (mod : `value2`, `v3`) ; D2 : celles du moteur
    speed: s.n.value2 ? lin(s.n.value2, L) : (s.n.speed ?? 7),
    radius: 0.7,
    range: s.n.v3 ? lin(s.n.v3, L) : s.range,
    dmg: pk,
    elem: 'fire',
    pierce: true,
    level: L,
    z: 0.4,
  });
}

function castCycloneArmor(ctx: DruidCast): void {
  const { w, id, L, p, s } = ctx;
  // absorption de la table et des synergies (règle skills.druid : D2, × (1 + 7 % par niveau de Trombe, Tornade, Ouragan) ; mod : +3 par point d'énergie, synergies en points)
  const pool = druid().cycloneAbsorb(lin(s.n.value, L), p.d.ene, synergyPct(s, p.d.hardPoints), synergyPct(s, p.d.hardPoints, 'other'));
  addBuff(w, id, L, lin(s.n.duration, L));
  p.absorbPool = pool;
}

function castEruption(ctx: DruidCast): void {
  const { w, id, tx, ty, L, p, s } = ctx;
  // PD2 : pendant 2,2 s, un évent s'ouvre au hasard dans le rayon (4,66 yards) à la fréquence de la table (0,24 s à 0,16 s selon les points durs) ;
  // chaque évent dure 3,36 s et frappe toutes les 0,2 s (voir missiles.ts)
  const dur = Math.round(lin(s.n.duration, L) * TICK_HZ);
  const freq = skillHard('eruption', 'Vent Frequency (seconds)', p.d.hardPoints.eruption ?? 0) || 0.24;
  spawnArea(w, {
    kind: 'fissure',
    team: 0,
    owner: p.id,
    x: tx,
    y: ty,
    radius: lin(s.n.radius, L),
    ticks: dur,
    every: Math.max(1, Math.round(freq * TICK_HZ)),
    dmg: spellPacket(w, id),
    elem: 'fire',
    level: L,
  });
}

function castGust(ctx: DruidCast): void {
  const { w, id, tx, ty, L, p, s } = ctx;
  // PD2 : saut instantané vers la destination ; les ennemis proches de l'arrivée sont refroidis 0,48 s (aucun dégât) ;
  // recharge de la table (6,32 s au niveau 1, −0,2 s par niveau, 0,52 s au plus bas)
  if (!teleportPlayer(w, tx, ty, s.range)) return;
  const r = lin(s.n.radius, L);
  w.events.push({ t: 'nova', kind: 'gust', x: p.x, y: p.y, radius: r, elem: 'cold' });
  for (const m of w.monstersNear(p.x, p.y, r, buf)) {
    if (m.dead || m.isSummon) continue;
    const pk = emptyPacket(true);
    pk.chill = Math.round(lin(s.n.chill, L) * TICK_HZ);
    pk.chillPct = 0.5;
    pk.skill = id;
    w.hurtMonster(m, pk);
  }
  // never sooner than a game mode's own floor already set at the cast (lot 301, rule `skills.onCast`)
  p.cooldowns[id] = Math.max(p.cooldowns[id] ?? 0, w.tick + Math.round(lin(s.n.value, L) * (1 - clamp(p.d.all.get('cooldownRed') ?? 0, 0, 75) / 100) * TICK_HZ));
}

function castTwister(ctx: DruidCast): void {
  const { w, id, L, p, s, ang } = ctx;
  const n = Math.floor(lin(s.n.count, L));
  for (let i = 0; i < n; i++) {
    const pk = spellPacket(w, id);
    pk.spell = false;
    pk.stun = Math.round(lin(s.n.stun, L) * TICK_HZ);
    spawnMissile(w, {
      kind: 'twister',
      team: 0,
      owner: p.id,
      x: p.x,
      y: p.y,
      angle: ang + (i - (n - 1) / 2) * 0.3,
      speed: s.n.speed ?? 9,
      radius: 0.4,
      range: s.range,
      dmg: pk,
      elem: 'phys',
      pierce: true,
      level: L,
      z: 0.3,
    });
  }
  shortenGust(w);
}

function castTornado(ctx: DruidCast): void {
  const { w, id, L, p, ang } = ctx;
  // PD2 : dure 3 s, parcourt 16 yards au plus en louvoyant, frappe au contact puis toutes les 0,6 s dans son rayon de 2,66 yards
  const pk = spellPacket(w, id);
  spawnMissile(w, {
    kind: 'tornado',
    team: 0,
    owner: p.id,
    x: p.x,
    y: p.y,
    angle: ang,
    speed: TORNADO_RANGE / TORNADO_SECONDS,
    radius: 0.65,
    range: TORNADO_RANGE,
    dmg: pk,
    elem: 'phys',
    pierce: true,
    level: L,
    z: 0.3,
  });
  shortenGust(w);
}

function castVolcano(ctx: DruidCast): void {
  const { w, id, tx, ty, L, p, s } = ctx;
  // un seul volcan à la fois
  for (const a of w.areas) if (a.kind === 'volcano' && a.team === 0) a.dead = true;
  const dur = Math.round(lin(s.n.duration, L) * TICK_HZ);
  // PD2 : cône de 2 yards qui frappe toutes les 0,24 s, débris toutes les 0,08 s pendant 5 s (jusqu'à 8 yards, 1,33 yard de rayon) : voir missiles.ts
  spawnArea(w, { kind: 'volcano', team: 0, owner: p.id, x: tx, y: ty, radius: lin(s.n.radius, L), ticks: dur, every: 2, dmg: spellPacket(w, id), elem: 'fire', level: L });
}

function castHurricane(ctx: DruidCast): void {
  const { w, id, L, s } = ctx;
  addBuff(w, id, L, lin(s.n.duration, L));
}

/* --------------------------- Métamorphose --------------------------- */
function castWerewolf(ctx: DruidCast): void {
  const { w, id } = ctx;
  // la table n'enregistre cette fonction que pour 'werewolf' et 'werebear'
  setForm(w, playerForm(w) === id ? null : (id as Form));
}

function castHunger(ctx: DruidCast): void {
  const { w, id, tx, ty, targetId, L, p, s } = ctx;
  // D2 : une morsure (dégâts `value` %) qui vole vie (`value2` %) et mana (`v3` %) ; règle skills.druid
  if (!druid().hungerEatsCorpse) {
    const t = meleeTarget(w, targetId, 1.6);
    if (!t) return;
    p.facing = Math.atan2(t.y - p.y, t.x - p.x);
    const dealt = strike(w, t, { wdmg: lin(s.n.value, L), ar: s.n.ar ? ramp(s.n.ar, L) : meleeArBonus(L), skill: id });
    if (dealt > 0) {
      p.hp = Math.min(p.hpMax, p.hp + (dealt * lin(s.n.value2, L)) / 100);
      p.mana = Math.min(p.manaMax, p.mana + (dealt * lin(s.n.v3, L)) / 100);
    }
    return;
  }
  // mod : l'ours-garou dévore un cadavre et gagne pour un temps vitesse, vol de vie et blessures ouvertes
  const c = corpseNearDruid(w, tx, ty, 4) ?? corpseNearDruid(w, p.x, p.y, 4);
  if (!c) {
    w.events.push({ t: 'message', text: 'Aucun cadavre à dévorer', color: '#9aa' });
    return;
  }
  c.eaten = true;
  c.deathTick = Math.min(c.deathTick, w.tick - TICK_HZ * 11);
  addBuff(w, 'hunger', L, lin(s.n.duration, L));
  w.events.push({ t: 'impact', kind: 'hunger', x: c.x, y: c.y, radius: 0.8, elem: 'poison' });
}

function castFeralRage(ctx: DruidCast): void {
  const { w, id, targetId, L } = ctx;
  strikeSkill(w, id, L, targetId);
}

function castShockWave(ctx: DruidCast): void {
  const { w, id, L, p, s } = ctx;
  // N ondes rayonnent du sol (rayon de la table), étourdissement ; part des dégâts d'arme : règle skills.druid (D2 : aucune)
  const d = p.d;
  const pk = spellPacket(w, id);
  pk.spell = false;
  const wpn = druid().shockWaveWeapon;
  if (wpn > 0) pk.phys += w.rng.combat.float(d.weaponDmg[0], d.weaponDmg[1]) * wpn * (1 + d.meleeDmgPct / 100);
  pk.stun = Math.round(lin(s.n.stun, L) * TICK_HZ);
  const n = Math.max(1, Math.floor(lin(s.n.count, L)));
  const a0 = w.rng.combat.float(0, TAU);
  for (let i = 0; i < n; i++) {
    spawnMissile(w, {
      kind: 'shock_wave',
      team: 0,
      owner: p.id,
      x: p.x,
      y: p.y,
      angle: a0 + (i / n) * TAU,
      speed: 12,
      radius: 1,
      range: lin(s.n.radius, L),
      dmg: { ...pk },
      elem: 'phys',
      pierce: true,
      level: L,
      z: 0.2,
    });
  }
  w.events.push({ t: 'impact', kind: 'shock_wave', x: p.x, y: p.y, radius: 1.2, elem: 'phys' });
}

/* --------------------------- Invocation --------------------------- */
function castRaven(ctx: DruidCast): void {
  const { w, L } = ctx;
  summonRavens(w, L);
}

function castPlaguePoppy(ctx: DruidCast): void {
  const { w, id, tx, ty, L } = ctx;
  summonPet(w, id, L, tx, ty);
}

/** Compétences du Druide : identifiant → effet */
const DRUID_CASTS: Record<string, (c: DruidCast) => void> = {
  firestorm: castFirestorm,
  arctic_blast: castArcticBlast,
  molten_boulder: castMoltenBoulder,
  cyclone_armor: castCycloneArmor,
  eruption: castEruption,
  gust: castGust,
  twister: castTwister,
  tornado: castTornado,
  volcano: castVolcano,
  hurricane: castHurricane,
  armageddon: castHurricane,
  werewolf: castWerewolf,
  werebear: castWerewolf,
  hunger: castHunger,
  feral_rage: castFeralRage,
  maul: castFeralRage,
  rabies: castFeralRage,
  fire_claws: castFeralRage,
  fury: castFeralRage,
  shock_wave: castShockWave,
  raven: castRaven,
  plague_poppy: castPlaguePoppy,
  cycle_of_life: castPlaguePoppy,
  vines: castPlaguePoppy,
  spirit_wolf: castPlaguePoppy,
  summon_fenris: castPlaguePoppy,
  grizzly: castPlaguePoppy,
  oak_sage: castPlaguePoppy,
  heart_wolverine: castPlaguePoppy,
  spirit_barbs: castPlaguePoppy,
};

function meleeOrCastSeconds(w: World, id: string): number {
  const p = w.player;
  return p.cast && p.cast.skill === id ? p.modeLen / TICK_HZ : 0.72;
}

function angleTo(p: Player, m: Monster, ang: number): number {
  const a = Math.atan2(m.y - p.y, m.x - p.x);
  let da = Math.abs(a - ang) % TAU;
  if (da > Math.PI) da = TAU - da;
  return da;
}

/* ------------------------------------------------------------------ */
/* Attaques animales                                                   */
/* ------------------------------------------------------------------ */

function meleeTarget(w: World, targetId: number, reach: number): Monster | null {
  const p = w.player;
  let t = w.monsters.find((m) => m.id === targetId && !m.dead && !m.isSummon) ?? null;
  if (!t || dist(p.x, p.y, t.x, t.y) > reach + t.radius + p.radius) {
    t = null;
    let bd = reach + 0.8;
    for (const m of w.monstersNear(p.x + Math.cos(p.facing) * 0.8, p.y + Math.sin(p.facing) * 0.8, reach + 0.8, buf)) {
      const dd = dist(p.x, p.y, m.x, m.y) - m.radius - p.radius;
      if (dd < bd) {
        bd = dd;
        t = m;
      }
    }
  }
  return t;
}

/** Bonus au score d'attaque des attaques animales (comme les attaques de D2 : +% par niveau) */
export function meleeArBonus(L: number): number {
  return 25 + 8 * L;
}

function strikeSkill(w: World, id: string, L: number, targetId: number): void {
  const p = w.player;
  const s = SKILL_BY_ID[id];
  const t = meleeTarget(w, targetId, s.range);
  if (!t) return;
  p.facing = Math.atan2(t.y - p.y, t.x - p.x);
  // PD2 : bonus de précision de la compétence (table), à défaut le bonus générique des attaques animales.
  // Les attaques animales sont des attaques d'arme : frappe mortelle, coup écrasant, blessures ouvertes et dégâts de zone de mêlée (strike)
  const ar = s.n.ar ? ramp(s.n.ar, L) : meleeArBonus(L);
  switch (id) {
    case 'feral_rage': {
      if (strike(w, t, { wdmg: lin(s.n.value, L), ar, skill: id }) > 0) addStack(w, 'feral_rage', L, Math.floor(lin(s.n.count, L)), lin(s.n.duration, L));
      return;
    }
    case 'maul': {
      const stacks = p.buffs.find((b) => b.id === 'maul')?.stacks ?? 0;
      // PD2 : durée de l'étourdissement selon les points durs (1,4 s sans point, 0,2 s au minimum)
      const stun = Math.round((skillHard('maul', 'Stun Length (seconds)', p.d.hardPoints.maul ?? 0) || lin(s.n.stun, L)) * TICK_HZ);
      if (strike(w, t, { wdmg: lin(s.n.value, L) * (1 + stacks), ar, stun, skill: id }) > 0) addStack(w, 'maul', L, Math.floor(lin(s.n.count, L)), lin(s.n.duration, L));
      return;
    }
    case 'rabies': {
      const r = skillDamageRange(w, id, L);
      const secs = lin(s.n.duration, L);
      const dot = { dps: w.rng.combat.float(r.min, r.max) / secs, ticks: Math.round(secs * TICK_HZ) };
      // la morsure empoisonne la cible (le poison de l'équipement est remplacé : un seul poison), puis se propage aux ennemis de la zone (4,66 yards)
      if (strike(w, t, { ar, skill: id, poison: dot }) <= 0) return;
      for (const m of w.monstersNear(t.x, t.y, lin(s.n.radius, L), buf)) if (m !== t && !m.dead && !m.isSummon && m.team !== 0) w.hurtMonster(m, { ...emptyPacket(false), poisonDot: dot });
      w.events.push({ t: 'impact', kind: 'rabies', x: t.x, y: t.y, radius: lin(s.n.radius, L), elem: 'poison' });
      return;
    }
    case 'fire_claws': {
      // dégâts de feu de la table ajoutés au coup (D2) ; mod : chaque attaque lance en plus une tempête de feu rapide (règle skills.druid)
      if (strike(w, t, { ar, skill: id }) <= 0) return;
      const n = druid().fireClawsTendrils(p.d.hardPoints.fire_claws ?? 0);
      if (n <= 0) return;
      const ang = Math.atan2(t.y - p.y, t.x - p.x);
      for (let i = 0; i < n; i++) {
        const pk = spellPacket(w, id);
        spawnMissile(w, {
          kind: 'firestorm',
          team: 0,
          owner: p.id,
          x: p.x,
          y: p.y,
          angle: ang + (i - (n - 1) / 2) * 0.22,
          speed: 13.5,
          radius: 0.55,
          range: 7,
          dmg: pk,
          elem: 'fire',
          pierce: true,
          level: L,
          z: 0.2,
        });
      }
      w.events.push({ t: 'impact', kind: 'fire_claws', x: t.x, y: t.y, radius: 0.8, elem: 'fire' });
      return;
    }
    case 'fury': {
      // `count` coups ; zone de mêlée de plus à chaque coup : règle skills.druid (D2 : aucune ; mod : +20 %, +40 %, +60 %)
      const n = Math.max(1, Math.floor(lin(s.n.count, L)));
      for (let i = 0; i < n && !t.dead; i++) {
        if (!playsStrike(i)) continue; // rythme (rhythm.ts) : une frappe par instant de la séquence
        strike(w, t, { wdmg: lin(s.n.value, L), ar, skill: id, splash: druid().furySplash(i) });
      }
      return;
    }
  }
}

/** Attaque normale du Druide sous forme animale (bonus de forme, sans compétence) */
export function druidBasicAttack(w: World, targetId: number): boolean {
  if (!w.player.d.form) return false;
  const t = meleeTarget(w, targetId, 1.5);
  if (!t) return true;
  strike(w, t, {});
  return true;
}

/* ------------------------------------------------------------------ */
/* Effets périodiques (Ouragan, Armageddon)                            */
/* ------------------------------------------------------------------ */

export function druidTick(w: World): void {
  const p = w.player;
  for (const b of p.buffs) {
    if (b.id === 'hurricane' && w.tick % HURRICANE_EVERY === 0) {
      // PD2 : dégâts périodiques (toutes les 0,8 s) à TOUS les ennemis dans 6 yards, refroidis 8 s
      const s = SKILL_BY_ID.hurricane;
      for (const m of [...w.monstersNear(p.x, p.y, lin(s.n.radius, b.level), buf)]) {
        if (m.dead || m.isSummon) continue;
        const pk = spellPacket(w, 'hurricane', 1, b.level);
        pk.chill = Math.round(lin(s.n.chill, b.level) * TICK_HZ);
        pk.chillPct = 0.4;
        w.hurtMonster(m, pk);
        w.events.push({ t: 'impact', kind: 'hurricane', x: m.x, y: m.y, radius: 0.6, elem: 'cold' });
      }
    }
    if (b.id === 'armageddon' && w.tick % ARMAGEDDON_EVERY === 0) {
      // PD2 : un météore toutes les 0,36 s à un point AU HASARD du rayon (6 yards), explosion de 4 yards puis sol brûlant 1,48 s
      const s = SKILL_BY_ID.armageddon;
      const ang = w.rng.combat.float(0, TAU);
      const r = Math.sqrt(w.rng.combat.next()) * lin(s.n.radius, b.level);
      spawnArea(w, {
        kind: 'arma_rock',
        team: 0,
        owner: p.id,
        x: p.x + Math.cos(ang) * r,
        y: p.y + Math.sin(ang) * r,
        radius: METEOR_RADIUS,
        ticks: 10,
        every: 1,
        dmg: spellPacket(w, 'armageddon', 1, b.level),
        elem: 'fire',
        level: b.level,
        aux: 1,
      });
    }
  }
}

/** Sol brûlant (« Burning Damage » du wiki, par seconde) : zone de feu de 1,48 s sous un météore, un rocher en fusion ou une explosion */
function burningGround(w: World, id: string, x: number, y: number, radius: number, L: number): void {
  const s = SKILL_BY_ID[id];
  if (!s?.n.min3 || !s.n.max3 || L <= 0) return;
  const mul = (1 + synergyPct(s, w.player.d.hardPoints) / 100) * (1 + (w.player.d.elemDmgPct.fire ?? 0) / 100);
  const pk = emptyPacket(true);
  pk.fire = w.rng.combat.float(ramp(s.n.min3, L), Math.max(ramp(s.n.min3, L), ramp(s.n.max3, L))) * mul;
  pk.skill = id;
  spawnArea(w, { kind: 'fire_ground', team: 0, owner: w.player.id, x, y, radius, ticks: BURN_TICKS, every: 5, dmg: pk, elem: 'fire', level: L });
}

/** Atterrissage d'un météore de l'Armageddon (aux = 1) : explosion puis sol brûlant */
export function armaLand(w: World, a: AreaEffect): void {
  explode(w, a.team, a.x, a.y, a.radius, a.dmg, 'arma_rock', 'fire');
  if (a.aux > 0) burningGround(w, 'armageddon', a.x, a.y, a.radius, a.level);
}

/** Rocher en fusion : sol brûlant sur le trajet (toutes les 0,24 s) */
export function boulderTick(w: World, m: Missile): void {
  if ((w.tick + m.id) % 6 === 0) burningGround(w, 'molten_boulder', m.x, m.y, 0.7, m.level);
}

/** Rocher en fusion : il explose en fin de course (portée ou collision) sur 4,66 yards, et laisse un sol brûlant */
export function boulderEnd(w: World, m: Missile): void {
  const r = lin(SKILL_BY_ID.molten_boulder.n.radius, m.level);
  explode(w, 0, m.x, m.y, r, m.dmg, 'boulder_end', 'fire', m.owner);
  burningGround(w, 'molten_boulder', m.x, m.y, r, m.level);
}

/** Tornade : dégâts périodiques (toutes les 0,6 s) à tous les ennemis dans son rayon de 2,66 yards, en plus du contact */
export function tornadoTick(w: World, m: Missile): void {
  if ((w.tick - m.t0) % 15 !== 0 || w.tick === m.t0) return;
  for (const t of [...w.monstersNear(m.x, m.y, 1.33, buf)]) if (!t.dead && !t.isSummon && t.team !== 0) w.hurtMonster(t, { ...m.dmg });
}

/** Rafale : Trombe et Tornade raccourcissent la recharge restante de 0,52 s */
function shortenGust(w: World): void {
  const c = w.player.cooldowns.gust;
  if (c && c > w.tick) w.player.cooldowns.gust = Math.max(w.tick, c - 13);
}

/** Souffle arctique : un ennemi tué par le jet se brise en une nova de givre de 4,89 yards (dégâts « Nova Damage » du wiki) */
function shatter(w: World, x: number, y: number, L: number): void {
  const s = SKILL_BY_ID.arctic_blast;
  if (!s.n.min2 || !s.n.max2) return;
  const mul = (1 + synergyPct(s, w.player.d.hardPoints) / 100) * (1 + (w.player.d.elemDmgPct.cold ?? 0) / 100);
  const pk = emptyPacket(true);
  pk.cold = w.rng.combat.float(ramp(s.n.min2, L), Math.max(ramp(s.n.min2, L), ramp(s.n.max2, L))) * mul;
  pk.skill = 'arctic_blast';
  explode(w, 0, x, y, 2.45, pk, 'frost_nova', 'cold', w.player.id);
}

/* ------------------------------------------------------------------ */
/* Créatures                                                           */
/* ------------------------------------------------------------------ */

function petDamage(w: World, id: string, L: number): [number, number] {
  const r = skillDamageRange(w, id, L);
  let mul = 1 + w.player.d.petDmgPct / 100;
  // Grizzly : +25 % de dégâts aux loups au niveau 1, +10 % par niveau suivant (D2 : passivecalc3 ; PD2 de même)
  const bear = w.player.d.skillLevels.grizzly ?? 0;
  if ((id === 'spirit_wolf' || id === 'summon_fenris') && bear > 0) mul *= 1 + (25 + 10 * (bear - 1)) / 100;
  return [r.min * mul, r.max * mul];
}

function makePet(w: World, id: string, L: number, x: number, y: number): Monster {
  const def = PET_DEFS[id];
  const s = SKILL_BY_ID[id];
  const d = w.player.d;
  const clvl = w.character.level;
  let lifeMul = (s.n.pet?.life ?? 1) * (1 + (s.n.pet?.lifePerLvl ?? 0) * (L - 1)) * (1 + d.petLifePct / 100);
  // Loup redoutable (passif) : +vie des loups ; Loup spirituel (passif) : +score d'attaque et défense
  const dire = d.skillLevels['summon_fenris'] ?? 0;
  if ((id === 'spirit_wolf' || id === 'summon_fenris' || id === 'grizzly') && dire > 0) lifeMul *= 1 + lin(SKILL_BY_ID.summon_fenris.n.value, dire) / 100;
  const sw = d.skillLevels['spirit_wolf'] ?? 0;
  // Loup spirituel (passif) : score d'attaque des loups, fixe (D2 : « tohit ») ou en pour cent selon la règle skills.druid
  const swAr = sw > 0 ? lin(SKILL_BY_ID.spirit_wolf.n.value, sw) : 0;
  const arFlat = druid().spiritWolfArFlat;
  const arPct = d.petArPct + (arFlat ? 0 : swAr);
  const hp = Math.max(10, monsterHp(clvl) * lifeMul);
  const [dmin, dmax] = s.n.min ? petDamage(w, id, L) : [0, 0];
  const spot = w.grid.nearestFree(x, y, 3) ?? { x: w.player.x, y: w.player.y };
  return {
    ...makeSummon(w, def),
    x: spot.x,
    y: spot.y,
    px: spot.x,
    py: spot.y,
    radius: def.radius,
    hp,
    hpMax: hp,
    dmgMin: dmin,
    dmgMax: dmax,
    ar: monsterAr(clvl) * (1 + arPct / 100) + (arFlat ? swAr : 0),
    defense: 20 + 10 * clvl,
    mlvl: clvl,
    speed: def.speed,
    scale: def.scale,
    tint: def.tint ?? 0xffffff,
    name: def.name,
    atkCd: [0],
    summonSkill: id,
    summonLevel: L,
    pet: id,
  };
}

/** Nombre maximal de créatures d'un type */
export function petMax(id: string, L: number, hard = 0): number {
  const s = SKILL_BY_ID[id];
  // PD2 : corbeaux (15 au plus), loups spirituels et redoutables selon la table du niveau ;
  // grizzly et liane empoisonnée : une créature de plus aux points investis 10 et 20
  if (id === 'raven' || id === 'spirit_wolf' || id === 'summon_fenris') return Math.max(1, Math.floor(lin(s.n.count, L)));
  if (id === 'grizzly') return Math.max(1, skillHard('grizzly', 'Number of Bears', hard));
  if (id === 'plague_poppy') return Math.max(1, skillHard('plague_poppy', 'Total Creepers', hard));
  const m = s.n.pet?.max ?? [1, 0];
  return Math.min(1, Math.floor(m[0] + m[1] * (L - 1)));
}

/** Cadavre le plus proche (Faim) */
function corpseNearDruid(w: World, x: number, y: number, r: number): Monster | null {
  let best: Monster | null = null;
  let bd = r;
  for (const m of w.monsters) {
    if (!m.dead || m.isSummon || m.eaten) continue;
    const d = dist(x, y, m.x, m.y);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

export function petsOf(w: World, id?: string): Monster[] {
  return w.monsters.filter((m) => m.pet && m.pet !== 'merc' && !m.dead && (!id || m.pet === id));
}

function killPet(w: World, m: Monster): void {
  if (m.dead) return;
  w.killMonster(m, null);
}

function summonPet(w: World, id: string, L: number, tx: number, ty: number): void {
  const p = w.player;
  // un seul esprit à la fois ; lianes : une seule à la fois (D2) ou une de chaque sorte (règle skills.druid)
  const group = SPIRITS.includes(id) ? SPIRITS : VINES.includes(id) && druid().vinesShareSlot ? VINES : [id];
  for (const m of w.monsters) if (m.pet && !m.dead && group.includes(m.pet) && m.pet !== id) killPet(w, m);
  const mine = petsOf(w, id);
  const max = petMax(id, L, p.d.hardPoints[id] ?? 0) + (p.d.all.get(`extraSummon:${id}`) ?? 0);
  // au maximum : on remplace la plus ancienne (D2 : on relance pour soigner/renouveler)
  while (mine.length >= max) killPet(w, mine.shift()!);
  const sx = SPIRITS.includes(id) ? p.x - Math.cos(p.facing) * 1.5 : (tx + p.x) / 2;
  const sy = SPIRITS.includes(id) ? p.y - Math.sin(p.facing) * 1.5 : (ty + p.y) / 2;
  const pet = makePet(w, id, L, sx, sy);
  w.monsters.push(pet);
  if (SPIRITS.includes(id)) {
    for (const s of SPIRITS) p.buffs = p.buffs.filter((b) => b.id !== s);
    p.buffs.push({ id, level: L, until: w.tick + PERMANENT });
    w.refreshPlayer();
  }
  w.events.push({ t: 'impact', kind: 'summon_pet', x: pet.x, y: pet.y, radius: 1, elem: 'magic' });
}

function summonRavens(w: World, L: number): void {
  const p = w.player;
  const s = SKILL_BY_ID.raven;
  const max = petMax('raven', L);
  const cur = petsOf(w, 'raven');
  // relancer renouvelle les corbeaux existants ; corbeaux par lancer : règle skills.druid (D2 : tous)
  for (const r of cur) r.hitsLeft = Math.floor(lin(s.n.value, L));
  const perCast = druid().ravensPerCast(p.d.hardPoints.raven ?? 0);
  for (let i = cur.length; i < Math.min(max, cur.length + perCast); i++) {
    const a = (i / max) * TAU;
    const pet = makePet(w, 'raven', L, p.x + Math.cos(a), p.y + Math.sin(a));
    pet.hitsLeft = Math.floor(lin(s.n.value, L));
    const r2 = skillDamageRange2(w, 'raven', L);
    if (r2) pet.phase = (r2.min + r2.max) / 2;
    w.monsters.push(pet);
  }
  w.events.push({ t: 'impact', kind: 'summon_pet', x: p.x, y: p.y, radius: 1, elem: 'magic' });
}

/** Corbeaux (et, selon la règle skills.druid, esprits et lianes : PD2) : ni visés ni blessés */
const UNTOUCHABLE_ALL = ['raven', ...SPIRITS, ...VINES];
const untouchable = (): readonly string[] => (druid().spiritsUntouchable ? UNTOUCHABLE_ALL : ['raven']);

/** Mort d'une créature : les esprits emportent leur aura */
export function onPetDeath(w: World, m: Monster): void {
  if (!m.pet || !SPIRITS.includes(m.pet)) return;
  const p = w.player;
  if (petsOf(w, m.pet).length > 0) return;
  p.buffs = p.buffs.filter((b) => b.id !== m.pet);
  w.refreshPlayer();
}

/** Dégâts reçus par une créature (monstres, projectiles ennemis) */
export function hurtPet(w: World, pet: Monster, pk: DamagePacket, src: Monster | null): number {
  if (pet.dead || untouchable().includes(pet.pet ?? '')) return 0;
  if (!pk.spell && src && !w.rng.combat.chance(hitChance(src.ar, pet.defense, src.mlvl, pet.mlvl))) return 0;
  let total = 0;
  for (const e of ['phys', 'fire', 'cold', 'light', 'poison', 'magic'] as Element[]) {
    let v = pk[e] * (1 - (pet.res[e] ?? 0) / 100);
    // Golem de feu : le feu le soigne
    if (e === 'fire' && pet.pet === 'fire_golem' && v > 0) {
      pet.hp = Math.min(pet.hpMax, pet.hp + (v * lin(SKILL_BY_ID.fire_golem.n.value, pet.summonLevel ?? 1)) / 100);
      v = 0;
    }
    total += v;
  }
  if (total <= 0) return 0;
  pet.hp -= total;
  pet.lastHitTick = w.tick;
  w.events.push({ t: 'hit', target: pet.id, amount: Math.round(total), elem: 'phys', x: pet.x, y: pet.y, toPlayer: false });
  // Esprit des ronces : renvoie une part des coups de mêlée
  if (src && !pk.spell && w.player.d.thorns > 0) damageMonster(w, src, { ...emptyPacket(false), phys: (total * w.player.d.thorns) / 100 }, pet);
  // PD2 : Mur et Prison d'os renvoient des dégâts fixes (table, synergies de Armure d'os et de l'autre) à qui les frappe au corps à corps
  if (src && !pk.spell && pet.pet === 'bone_wall') {
    const sk = SKILL_BY_ID[pet.summonSkill ?? 'bone_wall'];
    if (sk?.n.value) damageMonster(w, src, { ...emptyPacket(false), phys: lin(sk.n.value, pet.summonLevel ?? 1) * (1 + synergyPct(sk, w.player.d.hardPoints) / 100) }, pet);
  }
  // Golem de fer : épines
  if (src && !pk.spell && pet.pet === 'iron_golem') damageMonster(w, src, { ...emptyPacket(false), phys: (total * lin(SKILL_BY_ID.iron_golem.n.value, pet.summonLevel ?? 1)) / 100 }, pet);
  if (pet.hp <= 0) killPet(w, pet);
  return total;
}

/** Créature la plus proche qu'un monstre peut attaquer (pas les corbeaux, qui volent) */
export function petsTargetable(w: World): Monster[] {
  return w.monsters.filter((m) => m.pet && !m.dead && !untouchable().includes(m.pet));
}

/** IA des créatures : suivre le Druide, attaquer, dévorer les cadavres (lianes) */
export function updatePet(w: World, m: Monster): void {
  const p = w.player;
  if (p.dead) {
    killPet(w, m);
    return;
  }
  for (let i = 0; i < m.atkCd.length; i++) if (m.atkCd[i] > 0) m.atkCd[i]--;
  // créatures à durée limitée (mort ressuscité, Leurre, murs d'os)
  if (m.expireTick !== undefined && w.tick >= m.expireTick) {
    killPet(w, m);
    return;
  }
  if (m.stunT > 0) {
    m.stunT--;
    return;
  }
  const kind = m.pet!;
  // murs d'os : immobiles, ils n'attirent que les coups ; PD2 : le Leurre, immobile, attaque à sa portée
  if (kind === 'bone_wall' || (kind === 'decoy' && m.dmgMax <= 0)) return;
  if (kind === 'fire_golem' && w.tick % 30 === m.id % 30) fireGolemAura(w, m);
  const dp = dist(m.x, m.y, p.x, p.y);
  // trop loin (téléportation, zone) : la créature rejoint le Druide
  if (dp > 20) {
    const spot = w.grid.nearestFree(p.x - Math.cos(p.facing) * 1.5, p.y - Math.sin(p.facing) * 1.5, 3) ?? { x: p.x, y: p.y };
    m.x = m.px = spot.x;
    m.y = m.py = spot.y;
    m.tgt = 0;
    return;
  }
  // attaque en cours
  if (m.mode === 'attack') {
    m.modeT++;
    if (!m.atkApplied && m.modeT >= 6) {
      m.atkApplied = true;
      petStrike(w, m);
    }
    if (m.modeT >= m.modeLen) m.mode = 'idle';
    return;
  }
  if (SPIRITS.includes(kind)) {
    follow(w, m, 2);
    return;
  }
  if (kind === 'cycle_of_life' || kind === 'vines') {
    vineEat(w, m);
    return;
  }
  if (kind === 'plague_poppy') {
    creeperAct(w, m);
    return;
  }
  // choix de la cible (toutes les 0,4 s) : l'ennemi le plus proche autour du Druide
  let t = m.tgt ? w.monsters.find((x) => x.id === m.tgt && !x.dead && !x.isSummon) : undefined;
  if ((!t || w.tick % 10 === m.id % 10) && w.tick % 5 === m.id % 5) {
    t = undefined;
    let bd = Infinity;
    // le Leurre, immobile, vise les ennemis proches de LUI (portée de ses flèches), les autres créatures ceux proches du Druide
    for (const o of kind === 'decoy' ? w.monstersNear(m.x, m.y, 10.5, buf) : w.monstersNear(p.x, p.y, 10, buf)) {
      const dd = dist(m.x, m.y, o.x, o.y);
      if (dd < bd && (kind === 'raven' || w.grid.lineOfSight(m.x, m.y, o.x, o.y))) {
        bd = dd;
        t = o;
      }
    }
    m.tgt = t?.id ?? 0;
  }
  if (!t) {
    // PD2 : le Loup redoutable dévore les cadavres proches et devient enragé (+100 % de dégâts, 20 s)
    if (kind === 'summon_fenris' && direWolfEat(w, m)) return;
    follow(w, m, kind === 'raven' ? 1.5 : 3);
    return;
  }
  // ombres de l'Assassin : lancent les compétences du joueur (shadow-cast.ts), sinon frappent à l'arme
  if ((kind === 'shadow_warrior' || kind === 'shadow_master') && shadowAct(w, m, t)) return;
  const atk = m.def.attacks[0];
  const reach = dist(m.x, m.y, t.x, t.y) - m.radius - t.radius;
  m.facing = Math.atan2(t.y - m.y, t.x - m.x);
  if (reach <= atk.range) {
    if (m.atkCd[0] <= 0) {
      m.mode = 'attack';
      m.modeT = 0;
      m.modeLen = 12;
      m.atkApplied = false;
      m.atkCd[0] = atk.cooldown;
      m.atkTarget = { x: t.x, y: t.y };
    } else m.mode = 'idle';
    return;
  }
  if (kind === 'decoy') return;
  const dx = (t.x - m.x) / (reach + m.radius + t.radius || 1);
  const dy = (t.y - m.y) / (reach + m.radius + t.radius || 1);
  moveFree(w, m, dx, dy, kind === 'raven');
}

function follow(w: World, m: Monster, keep: number): void {
  const p = w.player;
  const d = dist(m.x, m.y, p.x, p.y);
  if (d <= keep) {
    m.mode = 'idle';
    return;
  }
  const flying = m.pet === 'raven';
  const f = flying ? { x: (p.x - m.x) / d, y: (p.y - m.y) / d } : w.dirToPlayer(m);
  const bx = m.x;
  const by = m.y;
  moveFree(w, m, f.x, f.y, flying);
  if (!flying) w.allyStuck(m, dist(bx, by, m.x, m.y), m.speed, d);
}

function moveFree(w: World, m: Monster, dx: number, dy: number, flying: boolean): void {
  const s = m.speed * (m.chillT > 0 ? 1 - m.chillPct : 1) * DT;
  m.facing = Math.atan2(dy, dx);
  if (flying) {
    m.x += dx * s;
    m.y += dy * s;
  } else if (!w.moveActor(m, dx * s, dy * s, false)) {
    // contourner : on glisse le long de l'obstacle
    w.moveActor(m, -dy * s, dx * s, false);
  }
  m.mode = 'walk';
}

/** Golem de feu : aura de feu sacré de 8 yards, une fois toutes les 1,2 s (chiffres PD2 de la compétence) */
function fireGolemAura(w: World, m: Monster): void {
  const L = m.summonLevel ?? 1;
  const s = SKILL_BY_ID.fire_golem;
  for (const t of w.monstersNear(m.x, m.y, 4, buf)) {
    if (t.dead || t.isSummon) continue;
    const pk = emptyPacket(true);
    pk.fire = w.rng.combat.float(ramp(s.n.min2!, L), ramp(s.n.max2!, L)) * (monsterDmg(w.character.level) / 40) * golemSynergy(w, 'fire_golem');
    damageMonster(w, t, pk, m);
  }
}

/** PD2 : rayon (unités) des dégâts de zone de mêlée des créatures du Nécromancien */
const SPLASH_R: Record<string, number> = { skeleton: 1.33, raise_skeleton: 1.33, clay_golem: 1.67, blood_golem: 1, iron_golem: 1, fire_golem: 1, revive: 1 };

function petStrike(w: World, m: Monster): void {
  const t = m.tgt ? w.monsters.find((x) => x.id === m.tgt && !x.dead) : undefined;
  if (!t || dist(m.x, m.y, t.x, t.y) - m.radius - t.radius > m.def.attacks[0].range + 0.6) return;
  const kind = m.pet!;
  // mages squelettes : projectile élémentaire (type tiré au sort à l'invocation) ; archers : flèche physique. PD2 : leurs projectiles traversent les ennemis
  if (m.def.attacks[0].kind === 'missile') {
    const decoy = kind === 'decoy';
    const archer = kind === 'raise_skeleton_archer' || decoy;
    const el: Element = archer ? 'phys' : ((m.aura as Element) ?? 'cold');
    const pk = emptyPacket(true);
    pk[el] = w.rng.combat.float(m.dmgMin, Math.max(m.dmgMin, m.dmgMax));
    if (decoy) {
      // PD2 : le Leurre reçoit vos points investis en Coup critique (×2) et en Perforation ; Pénétration agit par le joueur (résistance physique)
      const hp = w.player.d.hardPoints;
      if ((hp.critical_strike ?? 0) > 0 && w.rng.combat.chance(Math.min(75, lin(SKILL_BY_ID.critical_strike.n.value, hp.critical_strike)) / 100)) pk.phys *= 2;
      if ((hp.pierce ?? 0) > 0) pk.pierceChance = lin(SKILL_BY_ID.pierce.n.value, hp.pierce);
    }
    if (el === 'cold') {
      pk.chill = TICK_HZ;
      pk.chillPct = 0.4;
    }
    const mk = archer ? 'arrow' : el === 'fire' ? 'firebolt_m' : el === 'cold' ? 'coldbolt_m' : el === 'light' ? 'lightning_m' : 'spit';
    spawnMissile(w, {
      kind: mk,
      team: 0,
      owner: m.id,
      x: m.x,
      y: m.y,
      angle: Math.atan2(t.y - m.y, t.x - m.x),
      speed: 12,
      radius: 0.3,
      range: decoy ? 11 : archer ? 8 : 12,
      dmg: pk,
      elem: el,
      pierce: !decoy,
    });
    return;
  }
  const pk = emptyPacket(false);
  pk.phys = w.rng.combat.float(m.dmgMin, Math.max(m.dmgMin, m.dmgMax)) * (m.rageUntil !== undefined && m.rageUntil > w.tick ? 2 : 1);
  if (kind === 'raven') {
    pk.cold = m.phase * (1 + w.player.d.petDmgPct / 100);
    pk.chill = TICK_HZ;
    pk.chillPct = 0.3;
  }
  if (kind === 'grizzly') pk.stun = Math.round(lin(SKILL_BY_ID.grizzly.n.stun, m.summonLevel ?? 1) * TICK_HZ);
  if (kind === 'clay_golem') {
    pk.chill = Math.round(TICK_HZ * 1.5);
    pk.chillPct = lin(SKILL_BY_ID.clay_golem.n.value, m.summonLevel ?? 1) / 100;
    // PD2 (saison 10) : 20 % de chances de coup écrasant
    pk.crush = 20;
  }
  if (kind === 'fire_golem') {
    pk.fire = pk.phys;
    pk.phys = 0;
  }
  // règle skills.amazon (PD2 : la Valkyrie reçoit vos points investis en Coup critique ; D2 : non)
  const valkStrikes = kind === 'valkyrie' && RULES['skills.amazon']().valkyrieStrikes;
  if (valkStrikes) {
    const cs = w.player.d.hardPoints.critical_strike ?? 0;
    if (cs > 0 && w.rng.combat.chance(Math.min(75, lin(SKILL_BY_ID.critical_strike.n.value, cs)) / 100)) pk.phys *= 2;
  }
  if (!w.rng.combat.chance(hitChance(m.ar, t.defense, m.mlvl, t.mlvl))) return;
  const dealt = damageMonster(w, t, pk, m);
  if (valkStrikes && dealt > 0) valkyriePowerStrike(w, m, t);
  // PD2 : dégâts de zone de mêlée des guerriers squelettes, des golems et des ressuscités (plus large pour le Golem d'argile)
  const splash = SPLASH_R[kind];
  if (splash && dealt > 0) {
    const sp: DamagePacket = { ...pk, stun: undefined, knockback: undefined, freeze: undefined, chill: undefined, burn: undefined, poisonDot: undefined, crush: undefined };
    for (const o of w.monstersNear(t.x, t.y, splash, buf)) if (o !== t && !o.dead && !o.isSummon && o.team !== 0) damageMonster(w, o, { ...sp }, m);
  }
  if (kind === 'blood_golem' && dealt > 0) {
    // PD2 : le Golem de sang rend de la vie par coup, au golem et à son maître, et ouvre des blessures
    const sk = SKILL_BY_ID.blood_golem;
    const L = m.summonLevel ?? 1;
    const laeh = sk.n.value2 ? lin(sk.n.value2, L) : 0;
    m.hp = Math.min(m.hpMax, m.hp + laeh);
    w.player.hp = Math.min(w.player.hpMax, w.player.hp + laeh);
    if (sk.n.v3) addBleed(t, lin(sk.n.v3, L) / 5);
  }
  if (kind === 'raven' && m.hitsLeft !== undefined) {
    m.hitsLeft--;
    if (m.hitsLeft <= 0) killPet(w, m);
  }
}

/** Lianes charognardes et solaires : dévorent un cadavre proche et rendent vie / mana */
function vineEat(w: World, m: Monster): void {
  const p = w.player;
  let corpse = m.tgt ? w.monsters.find((x) => x.id === m.tgt && x.dead && !x.eaten && !x.isSummon) : undefined;
  if (!corpse && w.tick % 10 === m.id % 10) {
    let bd = 9;
    for (const o of w.monsters) {
      if (!o.dead || o.eaten || o.isSummon || w.tick - o.deathTick > TICK_HZ * 10) continue;
      const dd = dist(p.x, p.y, o.x, o.y);
      if (dd < bd) {
        bd = dd;
        corpse = o;
      }
    }
    m.tgt = corpse?.id ?? 0;
  }
  if (!corpse) {
    follow(w, m, 3);
    return;
  }
  const d = dist(m.x, m.y, corpse.x, corpse.y);
  if (d > 1) {
    // les lianes « rampent sous terre » : plus rapides que leur marche vers un cadavre éloigné
    moveFree(w, m, (corpse.x - m.x) / d, (corpse.y - m.y) / d, true);
    return;
  }
  if (m.atkCd[0] > 0) return;
  m.atkCd[0] = 25;
  corpse.eaten = true;
  // le cadavre disparaît (comme dans D2)
  corpse.deathTick = Math.min(corpse.deathTick, w.tick - TICK_HZ * 11);
  const L = m.summonLevel ?? 1;
  // quantité rendue : règle skills.druid (D2 : part de la vie / du mana maximum ; mod : quantité fixe et synergies)
  const hp = p.d.hardPoints;
  if (m.pet === 'cycle_of_life') {
    const n = SKILL_BY_ID.cycle_of_life.n;
    const [lo, hi] = druid().vineGain('cycle_of_life', lin(n.value, L), lin(n.value2, L), hp, p.hpMax);
    p.hp = Math.min(p.hpMax, p.hp + w.rng.combat.float(lo, Math.max(lo, hi)));
  } else {
    const n = SKILL_BY_ID.vines.n;
    const [lo, hi] = druid().vineGain('vines', lin(n.value, L), lin(n.value2, L), hp, p.manaMax);
    p.mana = Math.min(p.manaMax, p.mana + w.rng.combat.float(lo, Math.max(lo, hi)));
  }
  m.mode = 'attack';
  m.modeT = 0;
  m.modeLen = 12;
  m.atkApplied = true;
  w.events.push({ t: 'impact', kind: m.pet === 'cycle_of_life' ? 'vine_heal' : 'vine_mana', x: corpse.x, y: corpse.y, radius: 0.8, elem: 'magic' });
}

/** Loup redoutable : va dévorer un cadavre proche ; renvoie vrai s'il s'en occupe */
function direWolfEat(w: World, m: Monster): boolean {
  const p = w.player;
  let corpse = m.tgt ? w.monsters.find((x) => x.id === m.tgt && x.dead && !x.eaten && !x.isSummon) : undefined;
  if (!corpse && w.tick % 10 === m.id % 10) {
    let bd = 8;
    for (const o of w.monsters) {
      if (!o.dead || o.eaten || o.isSummon || w.tick - o.deathTick > TICK_HZ * 10) continue;
      const dd = dist(p.x, p.y, o.x, o.y);
      if (dd < bd) {
        bd = dd;
        corpse = o;
      }
    }
    m.tgt = corpse?.id ?? 0;
  }
  if (!corpse) return false;
  const d = dist(m.x, m.y, corpse.x, corpse.y);
  if (d > 1) {
    moveFree(w, m, (corpse.x - m.x) / d, (corpse.y - m.y) / d, false);
    return true;
  }
  corpse.eaten = true;
  corpse.deathTick = Math.min(corpse.deathTick, w.tick - TICK_HZ * 11);
  m.rageUntil = w.tick + 20 * TICK_HZ;
  m.tgt = 0;
  m.mode = 'idle';
  w.events.push({ t: 'impact', kind: 'summon_pet', x: corpse.x, y: corpse.y, radius: 0.8, elem: 'magic' });
  return true;
}

/**
 * Liane empoisonnée (PD2) : elle n'attaque pas, elle surgit sous sa cible et y crée une plaque de poison (2 yards, 4 s) qui s'étend :
 * toutes les 0,36 s une « pousse » ajoute deux plaques vers l'extérieur (3 à 8 pousses selon le niveau). Chaque plaque réduit la résistance au poison.
 */
function creeperAct(w: World, m: Monster): void {
  const p = w.player;
  follow(w, m, 3);
  if (m.atkCd[0] > 0 || w.tick % 5 !== m.id % 5) return;
  let t: Monster | null = null;
  let bd = Infinity;
  for (const o of w.monstersNear(p.x, p.y, 10, buf)) {
    if (o.dead || o.isSummon || !w.grid.lineOfSight(p.x, p.y, o.x, o.y)) continue;
    const dd = dist(p.x, p.y, o.x, o.y);
    if (dd < bd) {
      bd = dd;
      t = o;
    }
  }
  if (!t) return;
  m.atkCd[0] = 2 * TICK_HZ;
  const L = m.summonLevel ?? 1;
  const s = SKILL_BY_ID.plague_poppy;
  // PD2 : ni bonus de « +% dégâts de poison » ni maîtrise : seulement les synergies
  const mul = 1 + synergyPct(s, p.d.hardPoints) / 100;
  const lo = ramp(s.n.min!, L) * mul;
  const total = w.rng.combat.float(lo, Math.max(lo, ramp(s.n.max!, L) * mul));
  const secs = lin(s.n.duration, L);
  const dmg = { ...emptyPacket(true), poisonDot: { dps: total / secs, ticks: Math.round(secs * TICK_HZ) }, skill: 'plague_poppy' };
  const patch = (x: number, y: number, delay: number) =>
    spawnArea(w, { kind: 'creeper_patch', team: 0, owner: p.id, x, y, radius: 1, ticks: delay + Math.round(secs * TICK_HZ), every: 10, dmg, elem: 'poison', level: L, aux: delay });
  patch(t.x, t.y, 0);
  const growths = Math.floor(lin(s.n.count, L));
  for (let k = 1; k <= growths; k++) {
    for (let i = 0; i < 2; i++) {
      const a = w.rng.combat.float(0, TAU);
      const r = 0.9 + 0.5 * k;
      patch(t.x + Math.cos(a) * r, t.y + Math.sin(a) * r, 9 * k);
    }
  }
  w.events.push({ t: 'impact', kind: 'summon_pet', x: t.x, y: t.y, radius: 1, elem: 'poison' });
}

/** Plaque de la Liane empoisonnée : poison renouvelé toutes les 0,4 s sur les ennemis dedans, résistance au poison réduite 4 s */
export function creeperPatch(w: World, a: AreaEffect): void {
  const age = a.maxLife - a.life;
  const delay = a.aux;
  if (age < delay || (age - delay) % a.every !== 0) return;
  if (age === delay) w.events.push({ t: 'impact', kind: 'poison_cloud', x: a.x, y: a.y, radius: a.radius, elem: 'poison' });
  const red = lin(SKILL_BY_ID.plague_poppy.n.value, a.level);
  for (const m of w.monstersNear(a.x, a.y, a.radius, buf)) {
    if (m.dead || m.isSummon) continue;
    applyReduction(w, m, 'poison', red, 4 * TICK_HZ);
    w.hurtMonster(m, { ...a.dmg });
  }
}

/** Changement de zone : les créatures vivantes et les buffs suivent le Druide (D2 : points de passage) */
export function carryOver(from: World, to: World): void {
  const op = from.player;
  if (op.dead) return;
  const tp = to.player;
  // les auras du mercenaire sont déjà posées par le nouveau monde
  tp.buffs = [
    ...tp.buffs.filter((b) => b.id.startsWith('maura_')),
    ...op.buffs.filter((b) => b.until > from.tick && !b.id.startsWith('maura_')).map((b) => ({ ...b, until: b.until - from.tick + to.tick })),
  ];
  tp.absorbPool = op.absorbPool;
  tp.shieldActive = tp.buffs.some((b) => b.id === 'energy_shield');
  to.refreshPlayer();
  for (const m of from.monsters) {
    // le mercenaire est recréé par le nouveau monde (sim/merc.ts), sa vie suit via carryMerc
    if (!m.pet || m.pet === 'merc' || m.dead) continue;
    const spot = to.grid.nearestFree(tp.x + to.rng.misc.float(-1.5, 1.5), tp.y + to.rng.misc.float(-1.5, 1.5), 3) ?? { x: tp.x, y: tp.y };
    to.monsters.push({ ...m, id: to.newId(), x: spot.x, y: spot.y, px: spot.x, py: spot.y, tgt: 0, mode: 'idle', expireTick: undefined, spawnKey: `pet:${to.tick}:${m.id}` });
  }
  carryMerc(from, to);
}
