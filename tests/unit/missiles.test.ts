/** Projectiles : trajectoire, durée de vie, portée, murs, collisions, perforation, explosion, projectiles ennemis. */
import { describe, expect, it } from 'vitest';
import { arena, at, run } from './arena-helper';
import { spawnMissile, scalePacket } from '../../src/sim/missiles';
import { explode } from '../../src/sim/explosion';
import { emptyPacket } from '../../src/sim/actors';
import type { DamagePacket } from '../../src/sim/actors';
import type { World } from '../../src/sim/world';
import { TICK_HZ } from '../../src/sim/constants';

const pkt = (phys = 10, extra: Partial<DamagePacket> = {}): DamagePacket => ({ ...emptyPacket(false), phys, ...extra });
const shot = (w: World, o: { x?: number; y?: number; angle?: number; speed?: number; range?: number; radius?: number; dmg?: DamagePacket; pierce?: boolean; kind?: string; team?: 0 | 1 }) =>
  spawnMissile(w, {
    kind: o.kind ?? 'arrow',
    team: o.team ?? 0,
    owner: w.player.id,
    x: o.x ?? 10,
    y: o.y ?? 15,
    angle: o.angle ?? 0,
    speed: o.speed ?? 15,
    radius: o.radius ?? 0.3,
    range: o.range ?? 20,
    dmg: o.dmg ?? pkt(),
    elem: 'phys',
    pierce: o.pierce,
  });

describe('Projectiles : vol', () => {
  it('avance en ligne droite à la vitesse donnée et meurt à bout de portée (durée de vie = portée / vitesse)', () => {
    const { g, w } = arena([{ x: 38, y: 2 }]);
    const m = shot(w, { speed: 15, range: 6 });
    const life = m.maxLife;
    expect(life).toBe(Math.ceil((6 / 15) * TICK_HZ));
    run(g, 5);
    expect(m.x).toBeCloseTo(10 + (15 * 5) / TICK_HZ, 1);
    expect(m.y).toBeCloseTo(15, 3);
    run(g, life);
    expect(m.dead).toBe(true);
    expect(m.x - 10).toBeLessThan(6.8); // jamais plus loin que la portée (à un pas près)
    expect(m.x - 10).toBeGreaterThan(5.2);
  });
  it("l'angle oriente la trajectoire (vers le bas : y croît, x constant)", () => {
    const { g, w } = arena([{ x: 38, y: 2 }]);
    const m = shot(w, { angle: Math.PI / 2 });
    run(g, 6);
    expect(m.y).toBeGreaterThan(15.5);
    expect(m.x).toBeCloseTo(10, 3);
  });
  it('une vitesse nulle ne produit pas de durée de vie infinie ni nulle', () => {
    const { w } = arena([{ x: 38, y: 2 }]);
    const m = shot(w, { speed: 0, range: 3 });
    expect(Number.isFinite(m.maxLife)).toBe(true);
    expect(m.maxLife).toBeGreaterThanOrEqual(1);
  });
  it('un mur arrête le projectile avant la portée maximale', () => {
    const { g, w } = arena([{ x: 38, y: 2 }], { walls: [[16, 10, 18, 20]] });
    const m = shot(w, { speed: 20, range: 30, y: 15 });
    run(g, 40);
    expect(m.dead).toBe(true);
    expect(m.x).toBeLessThan(18);
  });
});

describe('Projectiles : collisions', () => {
  it('touche le premier monstre rencontré, lui inflige les dégâts puis disparaît', () => {
    const { g, w, ms } = arena([
      { x: 14, y: 15 },
      { x: 20, y: 15 },
    ]);
    const a = at(ms, 14, 15);
    const b = at(ms, 20, 15);
    shot(w, { dmg: pkt(500) });
    run(g, 30);
    expect(a.hp).toBeLessThan(a.hpMax);
    expect(b.hp).toBe(b.hpMax);
    expect(w.missiles.filter((m) => !m.dead)).toHaveLength(0);
  });
  it('un projectile perforant traverse et touche chaque cible une seule fois', () => {
    const { g, w, ms } = arena([
      { x: 14, y: 15 },
      { x: 18, y: 15 },
      { x: 24, y: 15 },
    ]);
    const m = shot(w, { dmg: pkt(500), pierce: true, range: 30 });
    run(g, 40);
    for (const x of ms) expect(x.hp).toBeLessThan(x.hpMax);
    expect(m.hits).toHaveLength(3);
    // une seule fois chacun : dégâts identiques (cibles identiques, pas de résistance)
    const lost = ms.map((x) => x.hpMax - x.hp);
    expect(new Set(lost).size).toBe(1);
  });
  it('pierceMax plafonne le nombre de cibles traversées', () => {
    const { g, w, ms } = arena([
      { x: 13, y: 15 },
      { x: 16, y: 15 },
      { x: 19, y: 15 },
      { x: 22, y: 15 },
    ]);
    shot(w, { dmg: pkt(500, { pierceMax: 1 }), pierce: true, range: 30 });
    run(g, 40);
    const touched = ms.filter((x) => x.hp < x.hpMax).length;
    expect(touched).toBe(2); // la cible qui dépasse le plafond est touchée puis le projectile s'arrête
  });
  it('la chance de perforation à 100 % équivaut à un projectile perforant ; à 0 % le projectile s’arrête', () => {
    const run1 = (chance: number) => {
      const { g, w, ms } = arena([
        { x: 14, y: 15 },
        { x: 18, y: 15 },
      ]);
      shot(w, { dmg: pkt(500, { pierceChance: chance }), range: 30 });
      run(g, 40);
      return ms.filter((x) => x.hp < x.hpMax).length;
    };
    expect(run1(100)).toBe(2);
    expect(run1(0)).toBe(1);
  });
  it('Tir multiple : la perforation perd des dégâts à chaque ennemi traversé', () => {
    const { g, w, ms } = arena([
      { x: 14, y: 15 },
      { x: 18, y: 15 },
      { x: 22, y: 15 },
    ]);
    shot(w, { dmg: pkt(1000, { pierceDecay: 0.2 }), pierce: true, range: 30 });
    run(g, 40);
    const [a, b, c] = [14, 18, 22].map((x) => {
      const m = at(ms, x, 15);
      return m.hpMax - m.hp;
    });
    expect(b).toBeLessThan(a);
    expect(c).toBeLessThan(b);
  });
  it('un projectile à portée trop courte ne touche pas une cible lointaine', () => {
    const { g, w, ms } = arena([{ x: 30, y: 15 }]);
    shot(w, { range: 5, dmg: pkt(500) });
    run(g, 60);
    expect(ms[0].hp).toBe(ms[0].hpMax);
  });
  it('manque la cible hors de la ligne de tir (écart > rayon)', () => {
    const { g, w, ms } = arena([{ x: 16, y: 17 }]);
    shot(w, { dmg: pkt(500) });
    run(g, 30);
    expect(ms[0].hp).toBe(ms[0].hpMax);
  });
});

describe('Projectiles : explosions et ennemis', () => {
  it('une boule de feu explose à l’impact et blesse aussi les voisins dans le rayon, pas les lointains', () => {
    const { g, w, ms } = arena([
      { x: 15, y: 15 },
      { x: 15.8, y: 16.2 },
      { x: 25, y: 15 },
    ]);
    shot(w, { kind: 'fireball', dmg: pkt(0, { fire: 400 }) });
    run(g, 30);
    expect(at(ms, 15, 15).hp).toBeLessThan(1e9);
    expect(at(ms, 15.8, 16.2).hp).toBeLessThan(1e9);
    expect(at(ms, 25, 15).hp).toBe(at(ms, 25, 15).hpMax);
  });
  it('explode() renvoie le nombre de cibles du camp opposé dans le rayon et respecte la portée', () => {
    const { g, w, ms } = arena([
      { x: 12, y: 15 },
      { x: 13, y: 15 },
      { x: 30, y: 15 },
    ]);
    run(g, 1);
    expect(ms).toHaveLength(3);
    expect(explode(w, 0, 12.5, 15, 2, pkt(5), 'x', 'phys')).toBe(2);
    expect(explode(w, 0, 22, 15, 2, pkt(5), 'x', 'phys')).toBe(0);
  });
  it('une flèche ennemie blesse le joueur (et pas les monstres) puis disparaît', () => {
    const { g, w, ms } = arena([{ x: 25, y: 15 }]);
    const p = w.player;
    p.hp = p.hpMax = 100000;
    const before = p.hp;
    shot(w, { team: 1, x: 18, y: 15, angle: Math.PI, dmg: pkt(50) });
    run(g, 30);
    expect(p.hp).toBeLessThan(before);
    expect(ms[0].hp).toBe(ms[0].hpMax);
    expect(w.missiles.filter((m) => !m.dead)).toHaveLength(0);
  });
});

describe('scalePacket', () => {
  it('multiplie chaque élément et conserve les autres champs', () => {
    const p = pkt(10, { fire: 4, cold: 2, ar: 123, pierceChance: 30 });
    const s = scalePacket(p, 0.5);
    expect(s.phys).toBe(5);
    expect(s.fire).toBe(2);
    expect(s.cold).toBe(1);
    expect(s.ar).toBe(123);
    expect(s.pierceChance).toBe(30);
    expect(p.phys).toBe(10); // l'original n'est pas modifié
  });
});
