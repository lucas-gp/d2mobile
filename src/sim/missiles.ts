/** Projectiles et effets de zone (données + comportements par type). */
import { shadowOwner, shadowSpawn } from './shadow-owner';
import type { Element } from '../data/stats';
import type { AreaEffect, DamagePacket, Missile } from './actors';
import { DT } from './constants';
import type { World } from './world';

export interface MissileSpec {
  kind: string;
  team: 0 | 1;
  owner: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  radius: number;
  /** Portée maximale (unités) */
  range: number;
  dmg: DamagePacket;
  elem: Element;
  pierce?: boolean;
  tx?: number;
  ty?: number;
  level?: number;
  z?: number;
  aux?: number;
  /** Lancer fractionné : le projectile revient vers le lanceur à bout de portée */
  returns?: boolean;
}

export function spawnMissile(w: World, s: MissileSpec): Missile {
  const life = Math.max(1, Math.ceil(s.range / Math.max(0.1, s.speed) / DT));
  const m: Missile = {
    id: w.newId(),
    kind: s.kind,
    team: s.team,
    owner: shadowOwner(w, s.owner),
    shadow: shadowSpawn(w, s.owner),
    x: s.x,
    y: s.y,
    px: s.x,
    py: s.y,
    vx: Math.cos(s.angle) * s.speed,
    vy: Math.sin(s.angle) * s.speed,
    radius: s.radius,
    life,
    maxLife: life,
    dmg: s.dmg,
    pierce: s.pierce ?? false,
    hits: [],
    tx: s.tx ?? s.x,
    ty: s.ty ?? s.y,
    level: s.level ?? 1,
    t0: w.tick,
    aux: s.aux ?? 0,
    elem: s.elem,
    z: s.z ?? 1,
    ...(s.returns ? { ret: 0 } : {}),
    dead: false,
  };
  w.missiles.push(m);
  return m;
}

export interface AreaSpec {
  kind: string;
  team: 0 | 1;
  owner: number;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  radius: number;
  ticks: number;
  every: number;
  dmg: DamagePacket;
  elem: Element;
  level?: number;
  aux?: number;
}

export function spawnArea(w: World, s: AreaSpec): AreaEffect {
  const a: AreaEffect = {
    id: w.newId(),
    kind: s.kind,
    team: s.team,
    owner: shadowOwner(w, s.owner),
    shadow: shadowSpawn(w, s.owner),
    x: s.x,
    y: s.y,
    x2: s.x2 ?? s.x,
    y2: s.y2 ?? s.y,
    radius: s.radius,
    life: s.ticks,
    maxLife: s.ticks,
    every: Math.max(1, s.every),
    dmg: s.dmg,
    level: s.level ?? 1,
    elem: s.elem,
    aux: s.aux ?? 0,
    dead: false,
  };
  w.areas.push(a);
  return a;
}

export function scalePacket(p: DamagePacket, f: number): DamagePacket {
  return { ...p, phys: p.phys * f, fire: p.fire * f, cold: p.cold * f, light: p.light * f, poison: p.poison * f, magic: p.magic * f };
}
