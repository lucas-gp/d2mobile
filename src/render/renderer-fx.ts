/**
 * Effets visuels : particules, nombres flottants, rayons et éclairs, anneaux, effets d'amélioration et d'aura, réaction aux événements de la simulation.
 * Fonctions extraites de la classe GameRenderer (renderer.ts) : `this` y désigne l'instance.
 */
import { tr } from '../i18n';
import { BitmapText, Graphics, Sprite } from 'pixi.js';
import type { World } from '../sim/world';
import { MERC_AURA_RADIUS, mercAuras, mercOf } from '../sim/merc';
import type { SimEvent } from '../sim/events';
import type { Monster } from '../sim/actors';
import { lerp, clamp } from '../core/math';
import { SKILL_BY_ID } from '../data/skills';
import { BUFF_FX, castFx, impactFx, novaFx } from './fx';
import { K, depthKey, isoX, isoY } from './iso';
import { boltTex, ringTex, sparkTex } from './textures';
import type { GameRenderer } from './renderer';
import { ELEM_COLOR, AURA_COLOR, OFFENSIVE_AURA, auraFxId, CHARGE_COLOR, DMG_COLOR, SKILL_CAST_COLOR, type ActorView, type Particle, type Floater } from './renderer-shared';

/** Effets des buffs du Druide autour du joueur : Ouragan (neige tournoyante), Armure du cyclone */
export function updateBuffFxImpl(this: GameRenderer, w: World): void {
  const p = w.player;
  if (p.dead) return;
  const q = this.quality.particles;
  // Paladin : aura active (anneau de particules au sol, couleur de l'aura)
  const aura = p.buffs.find((b) => b.id.startsWith('aura_'));
  if (aura && !this.buffFx.has(aura.id) && this.rng.next() < 0.5 * q) {
    const a = this.rng.float(0, Math.PI * 2);
    const r = this.rng.float(0.7, 1.5);
    const col = AURA_COLOR[aura.id.slice(5)] ?? 0xe8d8a0;
    this.spawnParticle(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 0.05, 0, 0, 0.9, 0.7, col, 0.22, 0, true);
  }
  for (const b of p.buffs) {
    if (b.id.startsWith('charge_') && this.rng.next() < 0.35 * q * Math.min(3, b.stacks ?? 1)) {
      // Assassin : étincelles qui gravitent autour de lui, une couleur par charge
      const a = this.time * 5 + this.rng.float(0, 1.2);
      this.spawnParticle(
        p.x + Math.cos(a) * 0.55,
        p.y + Math.sin(a) * 0.55,
        this.rng.float(0.4, 1.5),
        -Math.sin(a) * 1.5,
        Math.cos(a) * 1.5,
        0.3,
        0.4,
        CHARGE_COLOR[b.id.slice(7)] ?? 0xffffff,
        0.2,
        0,
      );
    } else if ((b.id === 'holy_shield' || b.id === 'bone_armor') && !this.buffFx.has(b.id) && this.rng.next() < 0.25 * q) {
      const a = this.rng.float(0, Math.PI * 2);
      this.spawnParticle(p.x + Math.cos(a) * 0.6, p.y + Math.sin(a) * 0.6, this.rng.float(0.2, 1.6), 0, 0, 0.6, 0.5, b.id === 'holy_shield' ? 0xfff0a0 : 0xe8e4d0, 0.16, 0);
    } else if ((b.id === 'battle_orders' || b.id === 'battle_command' || b.id === 'shout') && !this.buffFx.has(b.id) && this.rng.next() < 0.12 * q) {
      this.spawnParticle(p.x + this.rng.float(-0.5, 0.5), p.y + this.rng.float(-0.5, 0.5), 0.2, 0, 0, 1.3, 0.6, b.id === 'battle_orders' ? 0x60a0ff : 0xe0c060, 0.2, 0);
    } else if ((b.id === 'burst_of_speed' || b.id === 'fade') && !this.buffFx.has(b.id) && this.rng.next() < 0.3 * q) {
      this.spawnParticle(p.x + this.rng.float(-0.4, 0.4), p.y + this.rng.float(-0.4, 0.4), this.rng.float(0.1, 1.4), 0, 0, 0.2, 0.35, b.id === 'fade' ? 0x8060c0 : 0xc8f0ff, 0.18, 0);
    }
    if (w.character.classId !== 'druid') continue;
    if (b.id === 'hurricane') {
      for (let i = 0; i < 3 * q; i++) {
        const a = this.rng.float(0, Math.PI * 2);
        const r = this.rng.float(1.5, 6);
        this.spawnParticle(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, this.rng.float(0.2, 2), -Math.sin(a) * 5, Math.cos(a) * 5, 0.5, 0.45, 0xd0e8ff, 0.22, 0);
      }
    } else if (b.id === 'cyclone_armor' && !this.buffFx.has(b.id) && this.rng.next() < 0.6 * q) {
      const a = this.time * 6 + this.rng.float(0, 0.6);
      this.spawnParticle(p.x + Math.cos(a) * 0.7, p.y + Math.sin(a) * 0.7, this.rng.float(0.3, 1.6), -Math.sin(a) * 2.5, Math.cos(a) * 2.5, 0.8, 0.35, 0xc8d8e8, 0.2, 0);
    } else if (b.id === 'armageddon' && this.rng.next() < 0.3 * q) {
      this.spawnParticle(p.x + this.rng.float(-4, 4), p.y + this.rng.float(-4, 4), 10, 0.6, 0.6, -8, 0.5, 0xff8a30, 0.35, 0);
    }
  }
}

/**
 * Lianes (tiges qui ondulent, couleur selon l'espèce) et esprits (feu follet flottant) du
 * Druide, dessinés sans planche.
 */
export function drawPetFxImpl(this: GameRenderer, w: World, v: ActorView, m: Monster, x: number, y: number): void {
  if (!v.fx) {
    v.fx = new Graphics();
    this.entityLayer.addChild(v.fx);
  }
  const g = v.fx;
  g.clear();
  g.position.set(isoX(x, y), isoY(x, y));
  g.zIndex = depthKey(x, y);
  const fade = m.dead ? clamp(1 - (w.tick - m.deathTick) / 30, 0, 1) : 1;
  g.alpha = fade;
  if (fade <= 0) return;
  const t = this.time + m.id * 0.7;
  const col = m.tint;
  if (m.def.sprite === 'vine') {
    // 5 tiges en arc, feuilles au bout ; attaque / repas : les tiges se dressent
    const reach = m.mode === 'attack' ? 1.35 : 1;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      const len = (18 + 6 * Math.sin(t * 1.3 + i)) * reach;
      const bx = Math.cos(a) * 8;
      const by = Math.sin(a) * 4;
      const tx = bx + Math.cos(a) * 6 + Math.sin(t * 2 + i) * 5;
      const ty = by - len;
      g.moveTo(bx * 0.3, by * 0.3)
        .quadraticCurveTo(bx + Math.sin(t + i) * 8, by - len * 0.5, tx, ty)
        .stroke({ width: 3, color: 0x1a2a10, alpha: 0.9 });
      g.moveTo(bx * 0.3, by * 0.3)
        .quadraticCurveTo(bx + Math.sin(t + i) * 8, by - len * 0.5, tx, ty)
        .stroke({ width: 1.8, color: col });
      g.circle(tx, ty, 2.6).fill({ color: col });
    }
    g.ellipse(0, 0, 11, 5).fill({ color: 0x1a140c, alpha: 0.55 });
  } else {
    // esprit : lueur flottante, cœur clair, halo au sol
    const bob = Math.sin(t * 2.2) * 3;
    g.ellipse(0, 0, 12, 5).fill({ color: col, alpha: 0.18 });
    g.circle(0, -34 + bob, 11).fill({ color: col, alpha: 0.25 });
    g.circle(0, -34 + bob, 7).fill({ color: col, alpha: 0.55 });
    g.circle(0, -34 + bob, 3.5).fill({ color: 0xffffff, alpha: 0.9 });
    if (this.rng.next() < 0.25 * this.quality.particles) this.spawnParticle(x + this.rng.float(-0.2, 0.2), y + this.rng.float(-0.2, 0.2), 1.2, 0, 0, 1.2, 0.6, col, 0.25, 0);
  }
}

/** Overlays de Diablo II des sorts persistants du joueur : posés à l'activation, suivent le joueur, s'arrêtent avec le sort */
export function updateD2BuffFxImpl(this: GameRenderer, w: World, dt: number): void {
  const p = w.player;
  const want = new Set<string>();
  for (const b of p.buffs) {
    const def = BUFF_FX[b.id];
    if (!def || b.until <= w.tick || p.dead || !this.fx.has(def.id)) continue;
    want.add(b.id);
    if (this.buffFx.has(b.id)) continue;
    this.buffFx.set(b.id, this.fx.spawn(def.id, p.x, p.y, { loop: true, z: def.z, scale: def.scale ?? 1, follow: () => ({ x: w.player.x, y: w.player.y }) }));
  }
  for (const [id, play] of this.buffFx) {
    if (!want.has(id)) {
      this.fx.end(play);
      this.buffFx.delete(id);
    }
  }
  this.updateMercAuraFx(w, dt);
}

export function updateMercAuraFxImpl(this: GameRenderer, w: World, dt: number): void {
  const m = mercOf(w);
  const list = m && !w.character.merc?.dead ? mercAuras(w) : null;
  const n = list ? Math.min(2, list.length) : 0;
  for (let i = 0; i < n; i++) {
    const a = list![i];
    const key = auraFxId(a.id);
    if (!key || !this.fx.has(key) || this.mercFx.has(key)) continue;
    const def = BUFF_FX[`aura_${a.id}`] ?? BUFF_FX[a.id];
    this.mercFx.set(
      key,
      this.fx.spawn(key, m!.x, m!.y, {
        loop: true,
        z: def?.z ?? 0,
        scale: (def?.scale ?? 1) * (i === 0 ? 1 : 0.8),
        follow: () => {
          const mm = mercOf(w);
          return mm ? { x: mm.x, y: mm.y } : null;
        },
      }),
    );
  }
  for (const [key, play] of this.mercFx) {
    let keep = false;
    for (let i = 0; i < n; i++) if (auraFxId(list![i].id) === key) keep = true;
    if (!keep) {
      this.fx.end(play);
      this.mercFx.delete(key);
    }
  }
  // monstres touchés par une aura offensive (Conviction, Feu/Gel/Choc sacré, Sanctuaire) : légère poussière colorée à leurs pieds
  this.mercHaloT -= dt;
  if (this.mercHaloT > 0 || w.zone.town) return;
  this.mercHaloT = 0.2;
  const q = this.quality.particles;
  const p = w.player;
  const halo = (cx: number, cy: number, radius: number, id: string): void => {
    this.haloBuf.length = 0;
    w.monstersNear(cx, cy, radius, this.haloBuf);
    const col = AURA_COLOR[id] ?? 0xd08a40;
    for (const o of this.haloBuf) {
      if (o.pet || o.hp <= 0 || this.rng.next() > 0.35 * q) continue;
      this.spawnParticle(o.x + this.rng.float(-0.35, 0.35), o.y + this.rng.float(-0.35, 0.35), 0.05, 0, 0, 0.7, 0.8, col, 0.2, 0, true);
    }
  };
  if (n > 0 && m) for (let i = 0; i < n; i++) if (OFFENSIVE_AURA.has(list![i].id)) halo(m.x, m.y, MERC_AURA_RADIUS, list![i].id);
  if (!p.dead && p.d.conviction > 0) halo(p.x, p.y, 9, 'conviction');
}

export function updateCurseFxImpl(this: GameRenderer, w: World): void {
  const seen = new Set<number>();
  for (const m of w.monsters) {
    const c = m.curse;
    if (m.dead || !c || c.until <= w.tick) continue;
    const fid = `curse_${c.id}`;
    if (!this.fx.has(fid)) continue;
    seen.add(m.id);
    const cur = this.curseFx.get(m.id);
    if (cur && cur.id === fid) continue;
    if (cur) this.fx.end(cur.play);
    this.curseFx.set(m.id, {
      id: fid,
      play: this.fx.spawn(fid, m.x, m.y, {
        loop: true,
        z: 0.2,
        scale: Math.max(0.7, Math.min(1.6, m.scale)),
        // le monstre lui-même (même objet tant qu'il est dans la zone) : plus de recherche dans tous les monstres à chaque image
        follow: () => ({ x: m.x, y: m.y }),
      }),
    });
  }
  for (const [id, v] of this.curseFx) {
    if (!seen.has(id)) {
      this.fx.end(v.play);
      this.curseFx.delete(id);
    }
  }
}

/** Effets D2 des zones : blizzard, mur de feu, foyers au sol, chute de météore ; s'arrêtent avec la zone */
export function updateAreaFxImpl(this: GameRenderer, w: World, dt: number): void {
  const seen = new Set<number>();
  for (const a of w.areas) {
    if (a.dead) continue;
    let v = this.areaFx.get(a.id);
    if (!v) {
      v = { plays: [], next: 0 };
      this.areaFx.set(a.id, v);
      const life = Math.max(0.3, a.life / 25);
      switch (a.kind) {
        case 'mon_firewall':
        case 'fire_wall': {
          if (!this.fx.has('groundfirebig')) break;
          const len = Math.hypot(a.x2 - a.x, a.y2 - a.y);
          const n = Math.max(2, Math.round(len / 1.1));
          const warn = a.kind === 'mon_firewall' ? a.aux / 25 : 0;
          for (let i = 0; i <= n; i++)
            v.plays.push(
              this.fx.spawn('groundfirebig', lerp(a.x, a.x2, i / n), lerp(a.y, a.y2, i / n), { loop: true, life: Math.max(0.3, life - warn), scale: 0.8, delay: warn + this.rng.float(0, 0.4) }),
            );
          break;
        }
        case 'fire_ground':
        case 'blaze': {
          const id = a.radius > 1.2 ? 'groundfire' : 'groundfiresmall';
          if (!this.fx.has(id)) break;
          const n = Math.max(1, Math.round(a.radius * a.radius * 0.9));
          for (let i = 0; i < n; i++) {
            const ang = this.rng.float(0, Math.PI * 2);
            const r = Math.sqrt(this.rng.next()) * a.radius * 0.8;
            v.plays.push(this.fx.spawn(id, a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r, { loop: true, life, scale: 0.8, delay: this.rng.float(0, 0.5) }));
          }
          break;
        }
        case 'meteor_fall': {
          // marque au sol puis météore qui tombe du ciel (l'explosion vient de l'impact)
          if (this.fx.has('meteorindicator')) v.plays.push(this.fx.spawn('meteorindicator', a.x, a.y, { loop: true, life, scale: Math.max(0.6, a.radius / 2.4) }));
          if (this.fx.has('meteor')) {
            v.plays.push(this.fx.spawn('meteor', a.x - 6, a.y - 6, { loop: true, life, z: 14, vx: 6 / life, vy: 6 / life, vz: -14 / life, scale: 1.2 }));
            if (this.fx.has('meteortail')) v.plays.push(this.fx.spawn('meteortail', a.x - 6, a.y - 6, { loop: true, life, z: 14, vx: 6 / life, vy: 6 / life, vz: -14 / life, scale: 1.2 }));
          }
          break;
        }
      }
    }
    seen.add(a.id);
    if ((a.kind === 'blizzard' || (a.kind === 'mon_blizzard' && a.maxLife - a.life >= a.aux)) && this.fx.has('blizzardfall')) {
      // glace qui tombe au hasard dans la zone, avec son impact
      v.next -= dt;
      while (v.next <= 0) {
        v.next += 0.11 / Math.max(0.3, this.quality.particles);
        const ang = this.rng.float(0, Math.PI * 2);
        const r = Math.sqrt(this.rng.next()) * a.radius;
        const x = a.x + Math.cos(ang) * r;
        const y = a.y + Math.sin(ang) * r;
        this.fx.spawn(this.rng.next() < 0.5 ? 'blizzardfall' : 'blizzardfall2', x, y, { scale: 1, next: { id: this.rng.next() < 0.5 ? 'stormimpact' : 'stormimpact2', scale: 1 } });
      }
    }
  }
  for (const [id, v] of this.areaFx) {
    if (!seen.has(id)) {
      for (const p of v.plays) this.fx.end(p);
      this.areaFx.delete(id);
    }
  }
}

export function spawnParticleImpl(
  this: GameRenderer,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  life: number,
  color: number,
  size: number,
  gravity: number,
  ground = false,
): void {
  if (this.particles.length > 900 * this.quality.particles * this.limits.particles + 100) return;
  const s = this.particlePool.pop() ?? new Sprite(sparkTex());
  s.anchor.set(0.5);
  s.tint = color;
  s.visible = true;
  if (!s.parent) this.fxLayer.addChild(s);
  this.particles.push({ s, x, y, z, vx, vy, vz, life, max: life, scale0: size, scale1: size * 0.3, alpha0: 1, gravity, rot: 0, vr: 0, ground });
}

export function burstImpl(this: GameRenderer, x: number, y: number, z: number, n: number, color: number, speed: number, life: number, size: number, up = 2): void {
  const cnt = Math.max(1, Math.round(n * this.quality.particles * this.limits.particles));
  for (let i = 0; i < cnt; i++) {
    const a = this.rng.float(0, Math.PI * 2);
    const sp = this.rng.float(0.3, 1) * speed;
    this.spawnParticle(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp, this.rng.float(0, up), life * this.rng.float(0.6, 1.2), color, size * this.rng.float(0.6, 1.2), 6);
  }
}

export function updateParticlesImpl(this: GameRenderer, dt: number): void {
  const out: Particle[] = [];
  for (const p of this.particles) {
    p.life -= dt;
    if (p.life <= 0) {
      p.s.visible = false;
      this.particlePool.push(p.s);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vz -= p.gravity * dt;
    if (p.ground && p.z <= 0) {
      p.life = Math.min(p.life, 0.12);
      p.z = 0;
    }
    if (p.z < 0) p.z = 0;
    const t = 1 - p.life / p.max;
    p.s.position.set(isoX(p.x, p.y), isoY(p.x, p.y, p.z));
    p.s.scale.set(lerp(p.scale0, p.scale1, t));
    p.s.alpha = p.alpha0 * (1 - t * t);
    out.push(p);
  }
  this.particles = out;
}

export function addFloaterImpl(this: GameRenderer, text: string, x: number, y: number, color: number, big = false): void {
  // on screen at most (rule `render.limits`; base: 40): the oldest one goes
  while (this.floaters.length > this.limits.floaters) releaseFloater(this, this.floaters.shift()!.t);
  const size = big ? 22 : 15;
  const t = this.floaterPool.take(
    () => {
      const nt = new BitmapText({ text: tr(text), style: { fontFamily: 'dmg', fontSize: size } });
      nt.anchor.set(0.5);
      this.textLayer.addChild(nt);
      return nt;
    },
    (pt) => {
      pt.text = tr(text);
      if (pt.style.fontSize !== size) pt.style.fontSize = size;
      pt.visible = true;
      pt.alpha = 1;
      if (!pt.parent) this.textLayer.addChild(pt);
    },
  );
  t.tint = color;
  this.floaters.push({ t, x: x + this.rng.float(-0.3, 0.3), y: y + this.rng.float(-0.3, 0.3), z: 2, life: 0.9 });
}

/** A damage number done: back to the pool (hidden) */
function releaseFloater(r: GameRenderer, t: BitmapText): void {
  r.floaterPool.give(t, (x) => {
    x.visible = false;
  });
}

export function updateFloatersImpl(this: GameRenderer, dt: number): void {
  const keep: Floater[] = [];
  for (const f of this.floaters) {
    f.life -= dt;
    if (f.life <= 0) {
      releaseFloater(this, f.t);
      continue;
    }
    f.z += dt * 1.6;
    const p = this.worldToScreen(f.x, f.y, f.z);
    f.t.position.set(Math.round(p.x), Math.round(p.y));
    f.t.alpha = Math.min(1, f.life * 2.5);
    keep.push(f);
  }
  this.floaters = keep;
}

export function addBeamImpl(this: GameRenderer, points: number[], color: number, life: number, width: number, z = 1): void {
  const sprites: Sprite[] = [];
  for (let i = 2; i < points.length; i += 2) {
    const ax = points[i - 2];
    const ay = points[i - 1];
    const bx = points[i];
    const by = points[i + 1];
    // éclair brisé : 3 sous-segments décalés
    const segs = 4;
    let px = ax;
    let py = ay;
    for (let k = 1; k <= segs; k++) {
      const t = k / segs;
      const jx = k === segs ? 0 : this.rng.float(-0.5, 0.5);
      const jy = k === segs ? 0 : this.rng.float(-0.5, 0.5);
      const nx = ax + (bx - ax) * t + jx;
      const ny = ay + (by - ay) * t + jy;
      const s = new Sprite(boltTex());
      s.anchor.set(0, 0.5);
      const x0 = isoX(px, py);
      const y0 = isoY(px, py, z);
      const x1 = isoX(nx, ny);
      const y1 = isoY(nx, ny, z);
      s.position.set(x0, y0);
      s.rotation = Math.atan2(y1 - y0, x1 - x0);
      s.scale.set(Math.hypot(x1 - x0, y1 - y0) / 64, width / 16);
      s.tint = color;
      this.fxLayer.addChild(s);
      sprites.push(s);
      px = nx;
      py = ny;
    }
  }
  this.beams.push({ sprites, life, max: life });
}

/**
 * Éclair / Éclair en chaîne : un tracé brisé par segment (4 variantes qui scintillent toutes les 50 ms), halo bleu + trait clair + cœur blanc,
 * additif, avec quelques branches. Chaque saut de la chaîne apparaît 70 ms après le précédent et frappe sa cible (éclair D2 `lightningbolt`).
 */
export function addLightningImpl(this: GameRenderer, points: number[], chain: boolean): void {
  const hopDelay = chain ? 0.07 : 0;
  const life = chain ? 0.34 : 0.3;
  for (let i = 2; i < points.length; i += 2) {
    const hop = (i - 2) / 2;
    const delay = hop * hopDelay;
    const x0 = isoX(points[i - 2], points[i - 1]);
    const y0 = isoY(points[i - 2], points[i - 1], 1);
    const x1 = isoX(points[i], points[i + 1]);
    const y1 = isoY(points[i], points[i + 1], 1);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = len > 0 ? -(y1 - y0) / len : 0;
    const ny = len > 0 ? (x1 - x0) / len : 1;
    const n = Math.max(3, Math.min(14, Math.round(len / 26)));
    const gs: Graphics[] = [];
    for (let v = 0; v < 4; v++) {
      const pts: number[] = [x0, y0];
      const branches: number[][] = [];
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const amp = Math.min(16, len * 0.14) * Math.sin(Math.PI * t) * this.rng.float(0.4, 1.2);
        const o = this.rng.float(-1, 1) * amp;
        const px = x0 + (x1 - x0) * t + nx * o;
        const py = y0 + (y1 - y0) * t + ny * o;
        pts.push(px, py);
        if (len > 80 && this.rng.next() < 0.28) {
          const a = Math.atan2(y1 - y0, x1 - x0) + this.rng.float(0.5, 1.1) * (this.rng.next() < 0.5 ? -1 : 1);
          const bl = this.rng.float(18, 44);
          branches.push([px, py, px + Math.cos(a) * bl * 0.5 + this.rng.float(-4, 4), py + Math.sin(a) * bl * 0.5 + this.rng.float(-4, 4), px + Math.cos(a) * bl, py + Math.sin(a) * bl]);
        }
      }
      pts.push(x1, y1);
      const g = new Graphics();
      g.blendMode = 'add';
      g.visible = false;
      for (const [w, col, al] of [
        [15, 0x4060ff, 0.3],
        [7, 0x8fb0ff, 0.75],
        [2.6, 0xffffff, 1],
      ] as [number, number, number][]) {
        for (const path of [pts, ...branches]) {
          g.moveTo(path[0], path[1]);
          for (let k = 2; k < path.length; k += 2) g.lineTo(path[k], path[k + 1]);
          g.stroke({ width: path === pts ? w : w * 0.55, color: col, alpha: al, join: 'round', cap: 'round' });
        }
      }
      this.fxLayer.addChild(g);
      gs.push(g);
    }
    this.bolts.push({ g: gs, delay, life, max: life, hx: points[i], hy: points[i + 1], lit: false });
    if (chain && this.fx.has('lightningbolt')) this.fx.spawn('lightningbolt', points[i], points[i + 1], { delay, scale: 1 });
    else this.burst(points[i], points[i + 1], 1, chain ? 10 : 6, 0xc8d8ff, 2.5, 0.3, 0.25, 0.4);
  }
}

export function updateBoltsImpl(this: GameRenderer, dt: number): void {
  this.bolts = this.bolts.filter((b) => {
    if (b.delay > 0) {
      b.delay -= dt;
      if (b.delay > 0) return true;
      dt = -b.delay;
    }
    if (!b.lit) {
      b.lit = true;
      this.flashLight(b.hx, b.hy, 3.5, 0xb0c0ff);
    }
    b.life -= dt;
    if (b.life <= 0) {
      for (const g of b.g) g.destroy();
      return false;
    }
    const k = Math.floor(((b.max - b.life) / 0.05) % b.g.length);
    const a = Math.min(1, (b.life / b.max) * 2.2);
    b.g.forEach((g, i) => {
      g.visible = i === k;
      g.alpha = a;
    });
    return true;
  });
}

export function addRingImpl(this: GameRenderer, x: number, y: number, r0: number, r1: number, color: number, life: number): void {
  const s = new Sprite(ringTex());
  s.anchor.set(0.5);
  s.tint = color;
  this.fxLayer.addChild(s);
  this.rings.push({ s, x, y, r0, r1, life, max: life });
}

export function updateBeamsAndRingsImpl(this: GameRenderer, dt: number): void {
  this.beams = this.beams.filter((b) => {
    b.life -= dt;
    const a = Math.max(0, b.life / b.max);
    for (const s of b.sprites) s.alpha = a;
    if (b.life <= 0) {
      for (const s of b.sprites) s.destroy();
      return false;
    }
    return true;
  });
  this.rings = this.rings.filter((r) => {
    r.life -= dt;
    if (r.life <= 0) {
      r.s.destroy();
      return false;
    }
    const t = 1 - r.life / r.max;
    const rad = lerp(r.r0, r.r1, Math.sqrt(t));
    r.s.position.set(isoX(r.x, r.y), isoY(r.x, r.y));
    r.s.scale.set((rad * 2 * K) / 256);
    r.s.alpha = 1 - t;
    return true;
  });
}

/** Options d'affichage des effets (réglages du joueur) */
type FxOpts = { shake: number; damageNumbers: boolean };

export function onEventImpl(this: GameRenderer, w: World, e: SimEvent, opts: FxOpts): void {
  switch (e.t) {
    case 'hit':
      fxHit(this, e, opts);
      break;
    case 'immune':
      fxImmune(this, w, e, opts);
      break;
    case 'playerHurt':
      fxPlayerHurt(this, e);
      break;
    case 'death':
      fxDeath(this, e);
      break;
    case 'impact':
      fxImpact(this, e);
      break;
    case 'nova':
      fxNova(this, e);
      break;
    case 'beam':
      fxBeam(this, e);
      break;
    case 'teleport':
      fxTeleport(this, w, e);
      break;
    case 'cast':
      fxCast(this, w, e);
      break;
    case 'baalCall':
      fxBaalCall(this, e);
      break;
    case 'itemDrop':
      fxItemDrop(this, e);
      break;
    case 'levelUp':
      fxLevelUp(this, w, e);
      break;
    case 'shrine':
      fxShrine(this, e);
      break;
    case 'monsterAttack':
      break;
  }
}

function fxHit(r: GameRenderer, e: Extract<SimEvent, { t: 'hit' }>, opts: FxOpts): void {
  if (opts.damageNumbers && e.amount > 0) {
    // même cible frappée il y a moins de 0,35 s : on cumule dans le même chiffre
    const recent = r.floaters.find((f) => f.target === e.target && f.life > 0.55);
    if (recent && recent.sum !== undefined) {
      recent.sum += e.amount;
      recent.t.text = String(Math.round(recent.sum));
      recent.life = Math.max(recent.life, 0.8);
    } else {
      r.addFloater(String(e.amount), e.x, e.y, e.toPlayer ? 0xff4a3a : (DMG_COLOR[e.elem] ?? 0xffffff), e.amount > 500);
      const f = r.floaters[r.floaters.length - 1];
      f.target = e.target;
      f.sum = e.amount;
    }
  }
  r.burst(e.x, e.y, 1, 3, ELEM_COLOR[e.elem] ?? 0xffffff, 2, 0.3, 0.25);
}

function fxImmune(r: GameRenderer, w: World, e: Extract<SimEvent, { t: 'immune' }>, opts: FxOpts): void {
  if (opts.damageNumbers && w.tick % 4 === 0) r.addFloater('Immunisé', e.x, e.y, 0xb0b0b0);
}

function fxPlayerHurt(r: GameRenderer, e: Extract<SimEvent, { t: 'playerHurt' }>): void {
  if (e.pctOfMax > 0.08) r.addShake(3 + e.pctOfMax * 20);
}

function fxDeath(r: GameRenderer, e: Extract<SimEvent, { t: 'death' }>): void {
  r.burst(e.x, e.y, 0.8, e.rank === 'boss' ? 40 : e.rank === 'unique' ? 16 : 6, e.family === 'skeleton' ? 0xd8ccb0 : 0x9a1a10, 3, 0.6, 0.35);
  if (e.rank === 'boss') r.addShake(8);
}

function fxImpact(r: GameRenderer, e: Extract<SimEvent, { t: 'impact' }>): void {
  const c = ELEM_COLOR[e.elem] ?? 0xffffff;
  const big = e.radius > 1;
  const d2 = impactFx((id) => r.fx.has(id), e.kind, e.elem, e.radius);
  if (d2) r.fx.spawn(d2.id, e.x, e.y, { scale: d2.scale });
  // avec l'explosion de D2, les étincelles du jeu ne restent qu'en petit nombre
  r.burst(e.x, e.y, 0.5, (big ? 14 + e.radius * 6 : 5) * (d2 ? 0.3 : 1), c, big ? e.radius * 3 : 2.5, big ? 0.55 : 0.3, big ? 0.6 : 0.3, big ? 4 : 2);
  if (big) {
    if (!d2) r.addRing(e.x, e.y, e.radius * 0.3, e.radius, c, 0.35);
    if (e.kind === 'meteor') r.addShake(5);
  }
  r.flashLight(e.x, e.y, Math.max(2.5, e.radius * 2), c);
}

function fxNova(r: GameRenderer, e: Extract<SimEvent, { t: 'nova' }>): void {
  const nid = novaFx((id) => r.fx.has(id), e.kind, e.elem);
  if (nid) {
    r.fx.ring(nid, e.x, e.y, e.radius);
    r.flashLight(e.x, e.y, e.radius * 1.5, ELEM_COLOR[e.elem] ?? 0xffffff);
    return;
  }
  r.addRing(e.x, e.y, 0.4, e.radius, ELEM_COLOR[e.elem] ?? 0xffffff, 0.45);
  if (e.kind === 'nova' || e.kind === 'static_field') r.burst(e.x, e.y, 0.8, 18, 0xc8d8ff, e.radius * 2.5, 0.3, 0.25, 0.5);
  if (e.kind === 'frost_nova') r.burst(e.x, e.y, 0.3, 24, 0xa8d0ff, e.radius * 2.2, 0.45, 0.3, 0.3);
  r.flashLight(e.x, e.y, e.radius * 1.5, ELEM_COLOR[e.elem] ?? 0xffffff);
}

function fxBeam(r: GameRenderer, e: Extract<SimEvent, { t: 'beam' }>): void {
  if (e.kind === 'red_lightning') {
    // éclair rouge de Diablo : halo large rouge + cœur clair, bien visible
    r.addBeam(e.points, 0xff2010, 0.35, 22, 1);
    r.addBeam(e.points, 0xffc0a0, 0.3, 8, 1);
    r.flashLight(e.points[e.points.length - 2], e.points[e.points.length - 1], 3, 0xff3020);
    return;
  }
  if (e.kind === 'lightning' || e.kind === 'chain') {
    r.addLightning(e.points, e.kind === 'chain');
    return;
  }
  r.addBeam(
    e.points,
    e.kind === 'thunder' ? 0xfff0a0 : e.kind === 'red_lightning' ? 0xff4030 : 0xc0d0ff,
    e.kind === 'lightning' ? 0.18 : 0.25,
    e.kind === 'lightning' ? 10 : 7,
    e.kind === 'thunder' ? 0 : 1,
  );
  if (e.kind === 'thunder') {
    const x = e.points[0];
    const y = e.points[1];
    r.addBeam([x, y, x, y], 0xfff0a0, 0.2, 9, 0);
    r.addShake(2);
  }
  for (let i = 2; i < e.points.length; i += 2) r.flashLight(e.points[i], e.points[i + 1], 3, 0xb0c0ff);
}

function fxTeleport(r: GameRenderer, w: World, e: Extract<SimEvent, { t: 'teleport' }>): void {
  if (r.fx.has('teleport')) {
    r.fx.spawn('teleport', e.fx, e.fy, {});
    r.fx.spawn('teleport', e.tx, e.ty, {});
  }
  r.burst(e.fx, e.fy, 1, 20, 0x9ab8ff, 3, 0.4, 0.35);
  r.burst(e.tx, e.ty, 1, 20, 0x9ab8ff, 3, 0.4, 0.35);
  r.addRing(e.tx, e.ty, 0.2, 1.4, 0x9ab8ff, 0.3);
  if (e.id === w.player.id) {
    r.camX = e.tx - (e.tx - r.camX) * 0.5;
    r.camY = e.ty - (e.ty - r.camY) * 0.5;
  }
}

function fxCast(r: GameRenderer, w: World, e: Extract<SimEvent, { t: 'cast' }>): void {
  // sort élémentaire lancé par le joueur : overlay de Diablo II au pied du lanceur
  const el = e.id === w.player.id ? (SKILL_BY_ID[e.skill]?.element as string | undefined) : undefined;
  const cid = el && e.skill !== 'attack' ? castFx((id) => r.fx.has(id), el) : null;
  if (cid) r.fx.spawn(cid, e.x, e.y, { scale: 0.9, follow: () => ({ x: w.player.x, y: w.player.y }) });
  const s = SKILL_CAST_COLOR[e.skill];
  if (s) r.burst(e.x, e.y, 1.4, 6, s, 1.5, 0.35, 0.3, 1);
}

function fxBaalCall(r: GameRenderer, _e: Extract<SimEvent, { t: 'baalCall' }>): void {
  // Baal, sur son trône, appelle la vague suivante : animation de sort, lueur et secousse
  if (r.herald) {
    r.herald.callUntil = r.time + 4;
    r.herald.born = r.time;
    r.addShake(3);
    r.addRing(r.herald.x, r.herald.y, 0.4, 5, 0xff4030, 1.2);
    r.burst(r.herald.x, r.herald.y, 1.5, 36, 0xff6040, 3, 1.2, 0.4, 3);
  }
}

function fxItemDrop(r: GameRenderer, e: Extract<SimEvent, { t: 'itemDrop' }>): void {
  if (e.tier >= 5) {
    r.addRing(e.x, e.y, 0.2, 3.4, 0xff6a20, 1);
    r.burst(e.x, e.y, 0.5, 34, 0xffa040, 3.5, 1.2, 0.4, 5);
  } else if (e.tier >= 3) {
    r.addRing(e.x, e.y, 0.2, 2.2, 0xffd070, 0.8);
    r.burst(e.x, e.y, 0.5, 20, 0xffe0a0, 2.5, 0.9, 0.35, 4);
  }
}

function fxLevelUp(r: GameRenderer, w: World, _e: Extract<SimEvent, { t: 'levelUp' }>): void {
  const p = w.player;
  if (r.fx.has('levelup')) r.fx.spawn('levelup', p.x, p.y, { scale: 1.6, follow: () => ({ x: w.player.x, y: w.player.y }) });
  r.addRing(p.x, p.y, 0.3, 3, 0xffd060, 0.9);
  for (let i = 0; i < 30 * r.quality.particles; i++) r.spawnParticle(p.x + r.rng.float(-0.6, 0.6), p.y + r.rng.float(-0.6, 0.6), 0, 0, 0, r.rng.float(3, 6), 1.1, 0xffd060, 0.35, 0);
}

function fxShrine(r: GameRenderer, e: Extract<SimEvent, { t: 'shrine' }>): void {
  r.addRing(e.x, e.y, 0.3, 2.5, 0x80ff80, 0.7);
}

export function flashLightImpl(this: GameRenderer, x: number, y: number, r: number, color: number): void {
  if (!this.quality.dynamicLights) return;
  if (this.flashes.length > 24) this.flashes.shift();
  this.flashes.push({ x, y, r, color, life: 0.18 });
}
