/**
 * Attaques d'arme communes à toutes les classes : arme portée, allonge, cible de mêlée, maîtrises
 * (Barbare, Assassin), coup critique (Amazone), test de toucher et paquet de dégâts. Les
 * compétences de chaque classe (barbarian.ts, paladin.ts, amazon.ts, assassin.ts…) s'appuient
 * dessus, comme le Druide (druid.ts) pour ses attaques animales.
 */
import { fireProcs } from './procs';
import { SKILL_BY_ID, lin } from '../data/skills';
import { RULES } from '../mods/rules';
import type { Element } from '../data/stats';
import { TERRAIN_RADIUS, TICK_HZ } from './constants';
import { clamp, dist } from '../core/math';
import { emptyPacket, type DamagePacket, type Missile, type Monster } from './actors';
import { hitChance } from './combat';
import { convDefAt } from './merc-core';
import { spawnMissile } from './missiles';
import { baseOf } from './itemstats';
import { announceBroken, wearWeapon } from './durability';
import type { World } from './world';

import { isThrownKind, weaponKind, weaponMastery } from './weapons';

export * from './weapons';

const buf: Monster[] = [];

export function meleeTarget(w: World, targetId: number, reach: number): Monster | null {
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

const splashBuf: Monster[] = [];

export interface StrikeOpts {
  /** Bonus de dégâts de l'arme (%) de la compétence */
  wdmg?: number;
  /** Bonus de score d'attaque (%) de la compétence */
  ar?: number;
  /** Dégâts physiques fixes ajoutés */
  flat?: number;
  /** Dégâts élémentaires ajoutés [min, max] */
  add?: Partial<Record<Element, [number, number]>>;
  /** Étourdissement (ticks), recul (unités) */
  stun?: number;
  knockback?: number;
  /** Chances (%) de coup écrasant ajoutées, et efficacité du coup écrasant (+ %) : Châtiment */
  crush?: number;
  crushEff?: number;
  /** Touche toujours (Châtiment) */
  sure?: boolean;
  /** Multiplicateur final */
  mult?: number;
  /** Frappe avec l'arme de la main gauche (double maniement) */
  off?: boolean;
  /** Convertit les dégâts physiques en cet élément (Berserk : magique) */
  convert?: Element;
  /** Part convertie (0..1) ; toute la part physique sans cette option */
  convertPct?: number;
  /** Dégâts élémentaires ajoutés en pour cent des dégâts physiques de l'arme (Vengeance de D2 : calc1-3 % en feu, froid et foudre) */
  addPct?: Partial<Record<Element, number>>;
  /** Rayon des dégâts de zone de mêlée accru de ce % (PD2 : maîtrises, Frénésie, Concentration, Berserk…) */
  splash?: number;
  /** Utilise les dégâts de jet de l'arme (javelots, armes de jet) */
  thrown?: boolean;
  /** Nom de la compétence (journaux) */
  skill?: string;
  /** Pas de dégâts de zone (déjà un effet de zone) */
  noSplash?: boolean;
  /** Poison sur la durée de la compétence (remplace celui de l'équipement) */
  poison?: { dps: number; ticks: number };
}

/** Dégâts de base de l'arme (main droite, ou gauche) */
export function weaponRoll(w: World, off = false, thrown = false): number {
  const d = w.player.d;
  const r = off && d.offDmg ? d.offDmg : thrown && d.missileDmg ? d.missileDmg : d.weaponDmg;
  return w.rng.combat.float(r[0], Math.max(r[0], r[1]));
}

/** Test de toucher d'une attaque d'arme contre un monstre */
export function rollHit(w: World, t: Monster, arPct: number): boolean {
  const d = w.player.d;
  const fam = t.def.family;
  const vsAr = fam.startsWith('demon') ? (d.all.get('arDemon') ?? 0) : fam === 'undead' || fam === 'skeleton' ? (d.all.get('arUndead') ?? 0) : 0;
  return w.rng.combat.chance(
    clamp(
      hitChance(
        (d.attackRating + vsAr) * (1 + arPct / 100),
        d.all.get('ignoreDef') ? 0 : t.defense * (t.defMul ?? 1) * (1 - convDefAt(w, t.x, t.y) / 100) * (1 - (d.all.get('reduceDef') ?? 0) / 100),
        w.character.level,
        t.mlvl,
      ),
      0.05,
      0.95,
    ),
  );
}

/** Paquet de dégâts d'une attaque d'arme (sans test de toucher) */
export function strikePacket(w: World, o: StrikeOpts = {}): DamagePacket {
  const d = w.player.d;
  const k = weaponKind(w);
  const m = weaponMastery(w, k);
  const pk = emptyPacket(false);
  let phys = weaponRoll(w, o.off, o.thrown ?? isThrownKind(k)) * (1 + (d.meleeDmgPct + (o.wdmg ?? 0) + m.dmg) / 100) + (o.flat ?? 0);
  // coup critique (maîtrises) et frappe mortelle (objets), physique seulement : règle `combat.criticalMul`
  phys *= RULES['combat.criticalMul'](w, m.crit, m.critMult);
  phys *= o.mult ?? 1;
  const conv = o.convert ? (o.convertPct ?? 1) : 0;
  pk.phys += phys * (1 - conv);
  if (o.convert) pk[o.convert] += phys * conv;
  if (o.addPct) for (const [e, v] of Object.entries(o.addPct)) if (v) pk[e as Element] += (phys * v) / 100;
  for (const [e, r] of Object.entries(d.addedDmg)) if (r) pk[e as Element] += w.rng.combat.float(r[0], r[1]);
  if (o.add) for (const [e, r] of Object.entries(o.add)) if (r) pk[e as Element] += w.rng.combat.float(r[0], Math.max(r[0], r[1]));
  pk.crush = (d.all.get('crushingBlow') ?? 0) + m.crush;
  if (o.crush) pk.crush += o.crush;
  if (o.crushEff) pk.crushEff = o.crushEff;
  if (m.crushEff) pk.crushEff = (pk.crushEff ?? 0) + m.crushEff;
  if (o.stun) pk.stun = o.stun;
  // effets de coup des objets : étourdissement, gel, poison
  const stunChance = d.all.get('stunChance') ?? 0;
  if (!pk.stun && stunChance > 0 && w.rng.combat.chance(stunChance / 100)) pk.stun = Math.round(0.6 * TICK_HZ);
  const freeze = d.all.get('freezeTarget') ?? 0;
  if (freeze > 0) pk.freeze = Math.max(pk.freeze ?? 0, Math.round(freeze * 0.5 * TICK_HZ));
  const poison = d.all.get('poisonDmg') ?? 0;
  if (poison > 0) pk.poisonDot = { dps: poison / 3, ticks: 3 * TICK_HZ };
  if (o.poison) pk.poisonDot = o.poison;
  if (!o.knockback && d.all.get('knockback')) o = { ...o, knockback: 0.8 };
  if (o.knockback) {
    pk.knockback = o.knockback;
    pk.srcX = w.player.x;
    pk.srcY = w.player.y;
  }
  if (o.skill) pk.skill = o.skill;
  return pk;
}

/** PD2 : les blessures ouvertes durent 5 s et se cumulent jusqu'à 3 fois sur une même cible (le 4e remplace la moyenne) */
const BLEED_STACKS = 3;
export function addBleed(t: Monster, dps: number): void {
  const active = (t.bleedT ?? 0) > 0;
  const n = active ? Math.min(BLEED_STACKS, t.bleedStacks ?? 1) : 0;
  if (n < BLEED_STACKS) {
    t.bleedDps = (active ? (t.bleedDps ?? 0) : 0) + dps;
    t.bleedStacks = n + 1;
  } else {
    // pile pleine : la plus faible instance (approchée par la moyenne) est remplacée si la nouvelle est plus forte
    const avg = (t.bleedDps ?? 0) / BLEED_STACKS;
    if (dps > avg) t.bleedDps = (t.bleedDps ?? 0) + dps - avg;
  }
  t.bleedT = 5 * 25;
}

/** Rayon (unités) des dégâts de zone de mêlée : 1,33 (1,67 pour une arme exceptionnelle ou élite) + 0,33 par tranche de 20 % de bonus */
export function meleeSplashR(w: World, extraPct = 0): number {
  const d = w.player.d;
  const weapon = w.character.equipment.mainhand;
  const tier = weapon ? baseOf(weapon).tier : 0;
  return (tier >= 1 ? 1.67 : 1.33) + Math.floor(((d.all.get('splashRadius') ?? 0) + extraPct + weaponMastery(w).splash) / 20) * 0.33;
}

/** Attaque d'arme sur une cible : test de toucher puis dégâts. Renvoie les dégâts infligés (0 : raté). */
export function strike(w: World, t: Monster, o: StrikeOpts = {}): number {
  const m = weaponMastery(w);
  fireProcs(w, 'Att', t);
  if (!o.sure && !rollHit(w, t, (o.ar ?? 0) + m.ar)) return 0;
  const pk = strikePacket(w, o);
  const dealt = w.hurtMonster(t, pk);
  if (dealt > 0) {
    fireProcs(w, 'Hit', t);
    if (!w.actingAs) announceBroken(w, wearWeapon(w));
    // dégâts de zone de la mêlée (règle `combat.weaponSplash` ; PD2 : toutes les armes) : mêmes dégâts, tirés une fois, sur les monstres autour de la cible (sans elle) ; ni étourdissement, ni recul, ni effets de coup ;
    // vol de vie et de mana ÷ 2 ; coup écrasant et blessures ouvertes tirés pour chaque victime
    if (!o.noSplash && !o.thrown && RULES['combat.weaponSplash']()) {
      const r = meleeSplashR(w, o.splash ?? 0);
      const sp: DamagePacket = { ...pk, leechMul: 0.5, stun: undefined, knockback: undefined, freeze: undefined, chill: undefined, burn: undefined, poisonDot: undefined };
      for (const n of w.monstersNear(t.x, t.y, r, splashBuf)) {
        if (n === t || n.dead || n.isSummon || n.team === 0) continue;
        const dn = w.hurtMonster(n, { ...sp });
        if (dn > 0) RULES['combat.openWounds'](w, n, dn);
      }
    }
    RULES['combat.openWounds'](w, t, dealt);
  }
  return dealt;
}

/** Déplace le joueur jusqu'au point visé (Bond, Charge, Envol du dragon) : point libre le plus proche, distance bornée */
export function dashTo(w: World, tx: number, ty: number, maxDist: number, standOff = 0): boolean {
  const p = w.player;
  const d = dist(p.x, p.y, tx, ty);
  const ang = Math.atan2(ty - p.y, tx - p.x);
  const want = Math.max(0, Math.min(d - standOff, maxDist));
  for (let t = want; t >= 0.5; t -= 0.4) {
    const x = p.x + Math.cos(ang) * t;
    const y = p.y + Math.sin(ang) * t;
    if (!w.grid.circleBlocked(x, y, TERRAIN_RADIUS) && w.grid.walkLine(p.x, p.y, x, y)) {
      w.events.push({ t: 'teleport', id: p.id, fx: p.x, fy: p.y, tx: x, ty: y });
      p.x = x;
      p.y = y;
      p.px = x;
      p.py = y;
      p.facing = ang;
      return true;
    }
  }
  return false;
}

export interface MissileWeaponOpts extends StrikeOpts {
  /** Type de projectile (rendu) */
  kind?: string;
  speed?: number;
  /** Dégâts conservés à chaque perforation (Tir multiple) */
  pierceDecay?: number;
  range?: number;
  radius?: number;
  pierce?: boolean;
  elem?: Element;
  /** Écart angulaire (rad) */
  spread?: number;
  level?: number;
  /** Dégâts élémentaires/physiques remplaçant les dégâts d'arme (javelots de foudre, de poison…) */
  packet?: DamagePacket;
  /** Nombre maximal d'ennemis traversés */
  pierceMax?: number;
  /** Lancer fractionné : l'arme revient vers le lanceur à bout de portée */
  returns?: boolean;
}

/** Tire un projectile d'arme vers (tx, ty) : dégâts de l'arme, test de toucher à l'impact */
export function fireWeapon(w: World, tx: number, ty: number, o: MissileWeaponOpts = {}): Missile {
  const p = w.player;
  const k = weaponKind(w);
  const ang = Math.atan2(ty - p.y, tx - p.x) + (o.spread ?? 0);
  const pk = o.packet ?? strikePacket(w, o);
  const m = weaponMastery(w, k);
  const d = p.d;
  pk.ar = o.sure ? undefined : d.attackRating * (1 + ((o.ar ?? 0) + m.ar) / 100);
  if (o.pierceDecay) pk.pierceDecay = o.pierceDecay;
  if (o.pierceMax !== undefined) pk.pierceMax = o.pierceMax;
  const pierceLvl = d.skillLevels['pierce'] ?? 0;
  if (pierceLvl > 0) pk.pierceChance = lin(SKILL_BY_ID.pierce.n.value, pierceLvl);
  const itemPierce = (d.all.get('pierceChance') ?? 0) + m.pierce;
  if (itemPierce > 0) pk.pierceChance = Math.min(100, (pk.pierceChance ?? 0) + itemPierce);
  const kind = o.kind ?? (k === 'crossbow' ? 'bolt' : isThrownKind(k) ? 'javelin' : 'arrow');
  return spawnMissile(w, {
    kind,
    team: 0,
    owner: p.id,
    x: p.x,
    y: p.y,
    angle: ang,
    speed: o.speed ?? 16,
    radius: o.radius ?? 0.3,
    range: o.range ?? 13,
    dmg: pk,
    elem: o.elem ?? 'phys',
    pierce: o.pierce ?? false,
    returns: o.returns,
    level: o.level ?? 1,
    z: 0.9,
  });
}
