/** Mise à jour des projectiles et des effets de zone : comportements par type, collisions, impacts. */
import { fireProcs } from './procs';
import { dist, distPointSegment, TAU } from '../core/math';
import type { AreaEffect, Missile, Monster } from './actors';
import { emptyPacket } from './actors';
import { DT, TICK_HZ } from './constants';
import { throwImpact } from './throwpotion';
import type { World } from './world';
import { hurtPet, armaLand, boulderEnd, boulderTick, creeperPatch, tornadoTick } from './druid';
import { damageMonster, hitChance } from './combat';
import { convDefAt } from './merc-core';
import { hammerStep, holyBoltHeal } from './paladin';
import { amazonImpact } from './amazon';
import { bladeFuryHit, bladeFuryWall, bladeSentinelStep, psychicBounce, updateTrap } from './assassin';
import { armorRetaliateRanged } from './skills';
import { RULES } from '../mods/rules';

import { scalePacket, spawnArea, spawnMissile } from './missiles';
import { explode } from './explosion';

const buf: Monster[] = [];

/** Comportements spécifiques par type de projectile */
interface Behavior {
  /** Rayon d'explosion à l'impact (0 = dégâts sur la cible seule) */
  explode?: number;
  /** Rayon d'explosion dépendant du projectile (Flèche de gel, Javelot de peste) */
  explodeDyn?: (m: Missile) => number;
  /** Appelé à chaque ennemi touché, perforé ou non (Furie de la foudre) */
  onHit?: (w: World, m: Missile, t: Monster) => void;
  /** Explose aussi en fin de course */
  explodeOnExpire?: boolean;
  onTick?: (w: World, m: Missile) => void;
  onImpact?: (w: World, m: Missile) => void;
}

/** Guidage : infléchit la trajectoire vers l'ennemi le plus proche (Flèche guidée, Esprit d'os) */
function guide(w: World, m: Missile, turn: number): void {
  let best: Monster | null = null;
  let bd = 9;
  for (const t of w.monstersNear(m.x, m.y, 9, buf)) {
    if (t.dead || t.isSummon) continue;
    const d = dist(m.x, m.y, t.x, t.y);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  if (!best) return;
  const sp = Math.hypot(m.vx, m.vy);
  const want = Math.atan2(best.y - m.y, best.x - m.x);
  let cur = Math.atan2(m.vy, m.vx);
  let da = want - cur;
  while (da > Math.PI) da -= TAU;
  while (da < -Math.PI) da += TAU;
  cur += Math.max(-turn, Math.min(turn, da));
  m.vx = Math.cos(cur) * sp;
  m.vy = Math.sin(cur) * sp;
}

/**
 * Comportements par type de projectile. Rayons d'explosion de Diablo II (Boule de feu : sHitPar1 du missile fireball, 4 sous-cases ;
 * Pointe glaciale : aurarangecalc, 4 sous-cases ; Trait de feu, Trait de glace et projectiles de l'Hydre n'explosent pas) ; un jeu de
 * règles les change par la règle `missiles.explode`.
 */
const BEHAVIORS: Record<string, Behavior> = {
  fireball: { explode: 4 / 3, explodeOnExpire: false },
  // potion de jet : arrive au point visé (ou touche le premier monstre) puis explose ou répand son gaz (throwpotion.ts)
  throw_potion: {
    explodeDyn: () => 0,
    explodeOnExpire: true,
    onTick: (_w, m) => {
      if (dist(m.x, m.y, m.tx, m.ty) <= Math.hypot(m.vx, m.vy) * DT * 1.2) {
        m.x = m.tx;
        m.y = m.ty;
        m.vx = m.vy = 0;
        m.life = 1;
      }
    },
    onImpact: (w, m) => throwImpact(w, m),
  },
  meteor_small: { explode: 1.2 },
  glacial_spike: { explode: 4 / 3 },
  fire_bolt: {},
  ice_bolt: {},
  ice_blast: {},
  hydra_bolt: {},
  hydra_ball: {},
  charged_bolt: {
    onTick(w, m) {
      // trajectoire erratique
      if ((w.tick + m.id) % 3 === 0) {
        const a = Math.atan2(m.vy, m.vx) + w.rng.combat.float(-0.9, 0.9);
        const s = Math.hypot(m.vx, m.vy);
        m.vx = Math.cos(a) * s;
        m.vy = Math.sin(a) * s;
      }
    },
  },
  frozen_orb: {
    onTick(w, m) {
      // émet des éclats de glace en spirale
      if ((w.tick - m.t0) % 2 === 0) {
        m.aux += 2.4;
        const shard = { ...m.dmg, cold: m.dmg.cold };
        spawnMissile(w, {
          kind: 'orb_shard',
          team: m.team,
          owner: m.owner,
          x: m.x,
          y: m.y,
          angle: m.aux,
          speed: 11,
          radius: 0.25,
          range: 5.5,
          dmg: shard,
          elem: 'cold',
          pierce: false,
          level: m.level,
        });
      }
    },
    onImpact(w, m) {
      // nova d'éclats finale
      for (let i = 0; i < 10; i++) {
        spawnMissile(w, { kind: 'orb_shard', team: m.team, owner: m.owner, x: m.x, y: m.y, angle: (i / 10) * TAU, speed: 11, radius: 0.25, range: 5.5, dmg: m.dmg, elem: 'cold', level: m.level });
      }
    },
  },
  orb_shard: {},
  // Druide
  firestorm: {},
  boulder: { onTick: boulderTick, onImpact: boulderEnd },
  shock_wave: {},
  twister: {
    onTick(w, m) {
      if ((w.tick + m.id) % 4 === 0) {
        const a = Math.atan2(m.vy, m.vx) + w.rng.combat.float(-0.7, 0.7);
        const sp = Math.hypot(m.vx, m.vy);
        m.vx = Math.cos(a) * sp;
        m.vy = Math.sin(a) * sp;
      }
    },
  },
  tornado: {
    onTick(w, m) {
      tornadoTick(w, m);
      // louvoie autour de sa direction initiale (D2 : trajectoire imprévisible)
      if ((w.tick + m.id) % 5 === 0) {
        if (m.aux === 0) m.aux = Math.atan2(m.vy, m.vx) + 10;
        const a = m.aux - 10 + w.rng.combat.float(-0.45, 0.45);
        const sp = Math.hypot(m.vx, m.vy);
        m.vx = Math.cos(a) * sp;
        m.vy = Math.sin(a) * sp;
      }
    },
  },
  // Amazone : flèches et javelots
  magic_arrow: {},
  // PD2 S13 : la flèche laisse un sol en feu (rayon 1,33 yard, 1,48 s) à l'endroit où elle s'arrête
  fire_arrow: {
    onImpact(w, m) {
      amazonImpact(w, 'fire_arrow', m.x, m.y, m.aux, m.dmg);
    },
  },
  // PD2 : explosion principale au rayon des points durs (m.aux), puis des explosions secondaires de 2 yards, une toutes les 2 images,
  // jusqu'à 6,66 yards du point d'impact (nombre selon le niveau)
  exploding_arrow: {
    explodeDyn: (m) => m.aux,
    onImpact(w, m) {
      amazonImpact(w, 'exploding_arrow', m.x, m.y, m.level, m.dmg);
    },
  },
  ice_arrow: {},
  guided_arrow: { onTick: (w, m) => guide(w, m, 0.22) },
  // PD2 : bombes de 2,66 yards de rayon, qui explosent aussi en fin de course
  fire_blast: { explode: 1.33, explodeOnExpire: true },
  blade_sentinel: { onTick: (w, m) => bladeSentinelStep(w, m) },
  blade_fury: { onHit: (w, m, t) => bladeFuryHit(w, m, t), onImpact: (w, m) => bladeFuryWall(w, m) },
  // PD2 : rebondit sur les ennemis voisins (−20 % à chaque rebond)
  psychic_hammer: { onHit: (w, m, t) => psychicBounce(w, m, t) },
  teeth: {},
  bone_spear: {},
  bone_spirit: { onTick: (w, m) => guide(w, m, 0.16) },
  // PD2 : explosion de 2,66 yards, sol brûlant de 2 yards pendant 2 s
  immolation_arrow: {
    explode: 1.33,
    onImpact(w, m) {
      amazonImpact(w, 'immolation_arrow', m.x, m.y, m.aux, m.dmg);
    },
  },
  freezing_arrow: { explodeDyn: (m) => m.aux },
  poison_javelin: {},
  plague_javelin: { explodeDyn: (m) => Math.max(0, m.aux) },
  lightning_bolt: {},
  // PD2 : les éclairs partent à CHAQUE ennemi touché, perforation comprise
  lightning_fury: {
    onHit(w, m, t) {
      amazonImpact(w, 'lightning_fury', t.x, t.y, m.aux, m.dmg);
    },
  },
  javelin: {},
  throw_axe: {},
  bolt: {},
  hammer: {
    onTick(w, m) {
      hammerStep(w, m);
    },
  },
  holy_bolt: {},
  // PD2 : les lances du Barrage de glace ne traversent pas mais explosent à l'impact (4,6 yards de rayon)
  ice_lance: { explode: 2.3 },
  arrow: {},
  bone: {},
  firebolt_m: {},
  coldbolt_m: {},
  lightning_m: {},
  spit: {},
  baal_wave: {},
};

/** Lancer fractionné PD2 : à bout de portée l'arme revient vers le Barbare (30 % des dégâts, perforant, peut toucher plusieurs fois) */
function splitReturnStep(w: World, m: Missile): void {
  const p = w.player;
  if (m.ret === 0) {
    if (m.life > 1) return;
    m.ret = 1;
    m.pierce = true;
    m.hits = [];
    m.life = m.maxLife + 20;
    for (const k of ['phys', 'fire', 'cold', 'light', 'poison', 'magic'] as const) m.dmg = { ...m.dmg, [k]: m.dmg[k] * 0.3 };
  }
  if (m.ret === 1) {
    if (dist(m.x, m.y, p.x, p.y) < 0.8) {
      m.dead = true;
      return;
    }
    const sp = Math.hypot(m.vx, m.vy);
    const a = Math.atan2(p.y - m.y, p.x - m.x);
    m.vx = Math.cos(a) * sp;
    m.vy = Math.sin(a) * sp;
  }
}

export function updateMissile(w: World, m: Missile): void {
  m.px = m.x;
  m.py = m.y;
  if (m.ret !== undefined) splitReturnStep(w, m);
  if (m.dead) return;
  const b = behaviorOf(m.kind);
  if (b.onTick) b.onTick(w, m);
  // guidage (Frozen Orb : aucun ; Charged bolt : errance)
  m.x += m.vx * DT;
  m.y += m.vy * DT;
  m.life--;
  // murs
  if (w.grid.isOpaqueAt(m.x, m.y)) {
    impact(w, m, b);
    return;
  }
  // collisions
  if (m.team === 0) {
    const near = w.monsterHash.query(m.x, m.y, m.radius + 0.2, buf);
    for (const t of near) {
      // Éclair sacré : soigne les alliés touchés (créatures, mercenaire) au lieu de les blesser
      if (m.kind === 'holy_bolt' && t.isSummon && t.pet && !t.dead && !m.hits.includes(t.id) && dist(m.x, m.y, t.x, t.y) <= m.radius + t.radius) {
        t.hp = Math.min(t.hpMax, t.hp + holyBoltHeal(w, m.level ?? 1));
        w.events.push({ t: 'impact', kind: m.kind, x: m.x, y: m.y, radius: 0.5, elem: m.elem });
        // PD2 : l'Éclair sacré traverse les alliés comme les ennemis
        m.hits.push(t.id);
        continue;
      }
      if (t.dead || t.isSummon) continue;
      // Éclair sacré : ne blesse que les morts-vivants selon la règle skills.paladin (D2) ; il traverse les autres monstres
      if (m.kind === 'holy_bolt' && t.def.family !== 'undead' && t.def.family !== 'skeleton' && RULES['skills.paladin']().holyUndeadOnly) continue;
      if (m.hits.includes(t.id)) continue;
      if (dist(m.x, m.y, t.x, t.y) > m.radius + t.radius) continue;
      m.hits.push(t.id);
      if (b.explode || b.explodeDyn) {
        if (m.pierce) {
          // projectile perforant à explosion (boules de l'Hydre) : explose sur chaque cible touchée et continue
          explode(w, m.team, t.x, t.y, b.explode ?? 1, m.dmg, m.kind, m.elem, m.owner);
          continue;
        }
        impact(w, m, b);
        return;
      }
      // projectiles du mercenaire : c'est lui l'attaquant (pas le perçage du joueur)
      const merc = m.owner !== w.player.id ? w.monsters.find((o) => o.id === m.owner && o.pet === 'merc') : undefined;
      // projectile d'arme : test de toucher (les sorts touchent toujours)
      const weaponShot = m.dmg.ar !== undefined && !merc;
      if (weaponShot) fireProcs(w, 'Att', t);
      const missed =
        m.dmg.ar !== undefined &&
        !w.rng.combat.chance(
          hitChance(
            m.dmg.ar,
            w.player.d.all.get('ignoreDef') && !merc ? 0 : t.defense * (t.defMul ?? 1) * (1 - convDefAt(w, t.x, t.y) / 100) * (merc ? 1 : 1 - (w.player.d.all.get('reduceDef') ?? 0) / 100),
            w.character.level,
            t.mlvl,
          ),
        );
      if (!missed) {
        // Marteau béni : dégâts accrus aux morts-vivants (règle skills.paladin : D2 +50 %)
        const dmg = m.kind === 'hammer' && (t.def.family === 'undead' || t.def.family === 'skeleton') ? scalePacket(m.dmg, RULES['skills.paladin']().hammerUndeadMul) : m.dmg;
        if (merc) damageMonster(w, t, dmg, merc);
        else if (w.hurtMonster(t, dmg) > 0 && weaponShot) fireProcs(w, 'Hit', t);
      }
      w.events.push({ t: 'impact', kind: m.kind, x: m.x, y: m.y, radius: 0.5, elem: m.elem });
      if (b.onHit) b.onHit(w, m, t);
      const capped = m.dmg.pierceMax !== undefined && m.hits.length > m.dmg.pierceMax;
      // a game mode's piercing of the hero's missiles (rule `combat.missilePierce`, base 0: never read further, no draw)
      const through = !capped && !m.pierce && !merc && m.hits.length <= RULES['combat.missilePierce'](w, m.kind);
      if (!through && (capped || (!m.pierce && !(m.dmg.pierceChance && w.rng.combat.chance(m.dmg.pierceChance / 100))))) {
        m.dead = true;
        if (b.onImpact) b.onImpact(w, m);
        return;
      }
      // le projectile a perforé sa cible : Tir multiple perd 20 % des dégâts d'origine par ennemi traversé (plancher 20 %)
      if (m.dmg.pierceDecay) {
        const n = m.hits.length;
        const before = Math.max(0.2, 1 - m.dmg.pierceDecay * (n - 1));
        m.dmg = scalePacket(m.dmg, Math.max(0.2, 1 - m.dmg.pierceDecay * n) / before);
      }
    }
  } else {
    const p = w.player;
    if (!p.dead && dist(m.x, m.y, p.x, p.y) <= m.radius + p.radius) {
      const src = w.monsters.find((mm) => mm.id === m.owner) ?? null;
      w.hurtPlayerPacket(src, { ...m.dmg, ranged: true });
      if (src && w.player.buffs.length) armorRetaliateRanged(w, src);
      w.events.push({ t: 'impact', kind: m.kind, x: m.x, y: m.y, radius: 0.5, elem: m.elem });
      m.dead = true;
      return;
    }
    // les créatures du Druide arrêtent aussi les projectiles
    for (const pet of w.pets) {
      if (pet.dead || dist(m.x, m.y, pet.x, pet.y) > m.radius + pet.radius) continue;
      hurtPet(w, pet, m.dmg, w.monsters.find((mm) => mm.id === m.owner) ?? null);
      w.events.push({ t: 'impact', kind: m.kind, x: m.x, y: m.y, radius: 0.5, elem: m.elem });
      m.dead = true;
      return;
    }
  }
  if (m.life <= 0) {
    if (b.explodeOnExpire || b.onImpact) impact(w, m, b);
    else m.dead = true;
  }
}

/** Comportements résolus pour la règle `missiles.explode` en vigueur (un jeu de règles par session : calculés une fois par type) */
let resolved = new Map<string, Behavior>();
let resolvedFor: unknown = null;

/** Comportement d'un type de projectile, rayon d'explosion du jeu de règles compris (règle `missiles.explode`) */
function behaviorOf(kind: string): Behavior {
  const rule = RULES['missiles.explode'];
  if (rule !== resolvedFor) {
    resolved = new Map();
    resolvedFor = rule;
  }
  let b = resolved.get(kind);
  if (!b) {
    const base = BEHAVIORS[kind] ?? {};
    const r = rule(kind);
    b = r === undefined ? base : { ...base, explode: r };
    resolved.set(kind, b);
  }
  return b;
}

function impact(w: World, m: Missile, b: Behavior): void {
  m.dead = true;
  const r = b.explodeDyn ? b.explodeDyn(m) : (b.explode ?? 0);
  if (r > 0) explode(w, m.team, m.x, m.y, r, m.dmg, m.kind, m.elem, m.owner);
  else w.events.push({ t: 'impact', kind: m.kind, x: m.x, y: m.y, radius: 0.4, elem: m.elem });
  if (b.onImpact) b.onImpact(w, m);
}

/* ------------------------------------------------------------------ */
/* Zones d'effet                                                        */
/* ------------------------------------------------------------------ */

export function updateArea(w: World, a: AreaEffect): void {
  a.life--;
  if (a.life < 0) {
    a.dead = true;
    return;
  }
  const age = a.maxLife - a.life;
  if (a.kind.startsWith('trap_')) {
    updateTrap(w, a);
    return;
  }
  const update = Object.prototype.hasOwnProperty.call(AREA_UPDATES, a.kind) ? AREA_UPDATES[a.kind] : undefined;
  if (update) update(w, a, age);
  else areaDefault(w, a, age);
}

function areaMeteorFall(w: World, a: AreaEffect): void {
  // chute du météore : impact à la fin du délai, puis sol en feu
  if (a.life === 0) {
    explode(w, a.team, a.x, a.y, a.radius, a.dmg, 'meteor', 'fire', a.owner);
    const burn = emptyPacket(true);
    burn.fire = a.aux; // dégâts/seconde du sol brûlant
    // durée du sol en feu : celle de la compétence (Météore de D2 : missile meteorfire), sinon 1,6 s
    spawnArea(w, { kind: 'fire_ground', team: a.team, owner: a.owner, x: a.x, y: a.y, radius: a.radius * 0.9, ticks: a.burn ?? 40, every: 5, dmg: burn, elem: 'fire', level: a.level });
  }
}

function areaBlizzard(w: World, a: AreaEffect, age: number): void {
  // éclats qui tombent au hasard dans le rayon
  if (age % a.every === 0) {
    for (let i = 0; i < 2; i++) {
      const ang = w.rng.combat.float(0, TAU);
      const r = Math.sqrt(w.rng.combat.next()) * a.radius;
      const x = a.x + Math.cos(ang) * r;
      const y = a.y + Math.sin(ang) * r;
      explode(w, a.team, x, y, 1.3, a.dmg, 'blizzard_shard', 'cold', a.owner);
    }
  }
}

function areaFireWall(w: World, a: AreaEffect, age: number): void {
  if (age % a.every === 0) {
    const pk = scalePacket(a.dmg, a.every * DT);
    for (const m of w.monstersNear((a.x + a.x2) / 2, (a.y + a.y2) / 2, dist(a.x, a.y, a.x2, a.y2) / 2 + 1, buf)) {
      if (distPointSegment(m.x, m.y, a.x, a.y, a.x2, a.y2) <= a.radius + m.radius) w.hurtMonster(m, pk);
    }
  }
}

function areaGasCloud(w: World, a: AreaEffect, age: number): void {
  // nuage de gaz : le poison ne se cumule pas, il est renouvelé à chaque passage
  if (age % a.every === 0) for (const m of w.monstersNear(a.x, a.y, a.radius, buf)) w.hurtMonster(m, a.dmg);
  if (age % TICK_HZ === 0 && age > 0) w.events.push({ t: 'impact', kind: 'poison_cloud', x: a.x, y: a.y, radius: a.radius, elem: 'poison' });
}

function areaFireGround(w: World, a: AreaEffect, age: number): void {
  if (age % a.every === 0) {
    const pk = scalePacket(a.dmg, a.every * DT);
    if (a.team === 0) for (const m of w.monstersNear(a.x, a.y, a.radius, buf)) w.hurtMonster(m, pk);
    else if (dist(a.x, a.y, w.player.x, w.player.y) <= a.radius) w.hurtPlayerPacket(null, pk);
  }
}

function areaExplodingSec(w: World, a: AreaEffect, age: number): void {
  // Flèche explosive : une petite explosion (2 yards) au hasard dans le rayon, toutes les 2 images
  if (age % a.every === 0 && age / a.every <= a.aux) {
    const ang = w.rng.combat.float(0, TAU);
    const r = Math.sqrt(w.rng.combat.next()) * a.radius;
    explode(w, a.team, a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r, 1.0, a.dmg, 'exploding_arrow_sec', 'fire', a.owner);
  }
}

function areaFissure(w: World, a: AreaEffect, age: number): void {
  // PD2 : un évent s'ouvre au hasard dans le rayon à chaque fréquence ; il dure 3,36 s (84 images) et frappe toutes les 0,2 s (rayon 2 yards)
  if (age % a.every === 0) {
    const ang = w.rng.combat.float(0, TAU);
    const r = Math.sqrt(w.rng.combat.next()) * a.radius;
    spawnArea(w, {
      kind: 'fissure_vent',
      team: a.team,
      owner: a.owner,
      x: a.x + Math.cos(ang) * r,
      y: a.y + Math.sin(ang) * r,
      radius: 1,
      ticks: 84,
      every: 5,
      dmg: a.dmg,
      elem: 'fire',
      level: a.level,
    });
  }
}

function areaVolcano(w: World, a: AreaEffect, age: number): void {
  // PD2 : le cône (2 yards) frappe toutes les 0,24 s ; pendant les 5 premières secondes, un débris toutes les 0,08 s retombe
  // jusqu'à 8 yards (rayon de dégâts 1,33 yard)
  if (age % 6 === 0) explode(w, a.team, a.x, a.y, 1, a.dmg, 'volcano', 'fire');
  if (age % a.every === 0 && age < 125) {
    const ang = w.rng.combat.float(0, TAU);
    const r = Math.sqrt(w.rng.combat.next()) * a.radius;
    spawnArea(w, {
      kind: 'arma_rock',
      team: a.team,
      owner: a.owner,
      x: a.x + Math.cos(ang) * r,
      y: a.y + Math.sin(ang) * r,
      radius: 0.67,
      ticks: 16,
      every: 1,
      dmg: a.dmg,
      elem: 'fire',
      level: a.level,
    });
  }
}

function areaArmaRock(w: World, a: AreaEffect): void {
  if (a.life === 0) armaLand(w, a);
}

function areaCreeperPatch(w: World, a: AreaEffect): void {
  creeperPatch(w, a);
}

function areaGrimWard(): void {
  // PD2 : le fétiche est une aura alliée (dégâts et précision), appliquée par barbarianTick
}

function areaGroundPulse(w: World, a: AreaEffect): void {
  // attaque de boss télégraphiée : cercle au sol puis impact ; aux > 0 : immobilise (ticks) au lieu de blesser (Prison d'os)
  if (a.life === 0) {
    if (a.aux > 0) {
      const p = w.player;
      w.events.push({ t: 'impact', kind: 'boss_pulse', x: a.x, y: a.y, radius: a.radius, elem: a.elem });
      if (!p.dead && dist(a.x, a.y, p.x, p.y) <= a.radius + p.radius) {
        p.mode = 'hit';
        p.modeT = 0;
        p.modeLen = a.aux;
        p.goal = null;
      }
    } else explode(w, a.team, a.x, a.y, a.radius, a.dmg, 'boss_pulse', a.elem);
  }
}

function areaMonFirewall(w: World, a: AreaEffect, age: number): void {
  // mur de feu de boss : brûle le joueur qui le traverse, après le délai de télégraphie (aux)
  if (age >= a.aux && age % a.every === 0) {
    const p = w.player;
    if (!p.dead && distPointSegment(p.x, p.y, a.x, a.y, a.x2, a.y2) <= a.radius + p.radius) w.hurtPlayerPacket(null, { ...a.dmg });
  }
}

function areaMbPool(w: World, a: AreaEffect, age: number): void {
  // zone persistante de boss de carte (poison, ténèbres, mur non enflammé) : rien pendant le télégraphe (aux), puis brûle qui s'y tient
  if (age >= a.aux && age % a.every === 0) {
    const p = w.player;
    if (!p.dead && dist(a.x, a.y, p.x, p.y) <= a.radius + p.radius) w.hurtPlayerPacket(null, { ...a.dmg });
  }
}

function areaMonBlizzard(w: World, a: AreaEffect, age: number): void {
  // Blizzard de boss : après le délai (aux), des éclats tombent au hasard dans le cercle
  if (age >= a.aux && age % a.every === 0) {
    for (let i = 0; i < 2; i++) {
      const ang = w.rng.combat.float(0, TAU);
      const r = Math.sqrt(w.rng.combat.next()) * a.radius;
      explode(w, 1, a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r, 1.3, a.dmg, 'blizzard_shard', 'cold', a.owner);
    }
  }
}

/** Zone d'effet ordinaire : frappe les monstres du rayon toutes les `every` images (zones du joueur seulement) */
function areaDefault(w: World, a: AreaEffect, age: number): void {
  if (age % a.every === 0) {
    if (a.team === 0) for (const m of w.monstersNear(a.x, a.y, a.radius, buf)) w.hurtMonster(m, a.dmg);
  }
}

/** Zones d'effet à comportement propre (les autres frappent les monstres du rayon toutes les `every` images) */
const AREA_UPDATES: Record<string, (w: World, a: AreaEffect, age: number) => void> = {
  meteor_fall: areaMeteorFall,
  blizzard: areaBlizzard,
  fire_wall: areaFireWall,
  gas_cloud: areaGasCloud,
  fire_ground: areaFireGround,
  blaze: areaFireGround,
  exploding_sec: areaExplodingSec,
  fissure: areaFissure,
  volcano: areaVolcano,
  arma_rock: areaArmaRock,
  creeper_patch: areaCreeperPatch,
  grim_ward: areaGrimWard,
  ground_pulse: areaGroundPulse,
  mon_firewall: areaMonFirewall,
  mb_pool: areaMbPool,
  mon_blizzard: areaMonBlizzard,
};
