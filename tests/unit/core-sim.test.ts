/** Cœur de la simulation : IA des tireurs (recul), projectiles, auto-visée */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { spawnMonster } from '../../src/sim/spawn';
import { retreatDirection, updateMonster } from '../../src/sim/ai';
import { emptyPacket } from '../../src/sim/actors';
import { scalePacket, spawnMissile } from '../../src/sim/missiles';
import { explode } from '../../src/sim/explosion';
import { updateMissile } from '../../src/sim/missile-update';
import { acquisitionRange, autoAim, contextTarget, pickGround, pickSingle } from '../../src/sim/targeting';
import { DT } from '../../src/sim/constants';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import type { World } from '../../src/sim/world';

function arena(seed = 42): { g: Game; w: World } {
  const g = new Game();
  g.startRun('tristram', 0, seed);
  const w = g.world;
  w.monsters.length = 0;
  w.pendingSpawns.length = 0;
  w.items.length = 0;
  return { g, w };
}
const noJoy = { joy: null, currentId: 0, lockedId: 0 };

describe('IA : recul des tireurs (B1)', () => {
  it('retreatDirection : direction opposée si libre', () => {
    const grid = { walkLine: () => true };
    const d = retreatDirection({ grid } as never, { x: 5, y: 5, radius: 0.35 }, 1, 0);
    expect(d).toEqual({ x: 1, y: 0 });
  });

  it('retreatDirection : glisse le long du mur quand le recul direct est bloqué', () => {
    // mur à l'est : tout trajet dont le bout a x > 5.5 est bloqué
    const grid = { walkLine: (_ax: number, _ay: number, bx: number) => bx <= 5.5 };
    const d = retreatDirection({ grid } as never, { x: 5, y: 5, radius: 0.35 }, 1, 0)!;
    expect(d).not.toBeNull();
    expect(d.x * 1.5 + 5).toBeLessThanOrEqual(5.5);
    // jamais en se rapprochant du joueur (qui est à l'ouest, direction -x)
    expect(Math.abs(d.y)).toBeGreaterThan(0.9);
  });

  it('retreatDirection : acculé -> null (le tireur tient sa position)', () => {
    const grid = { walkLine: () => false };
    expect(retreatDirection({ grid } as never, { x: 5, y: 5, radius: 0.35 }, 1, 0)).toBeNull();
  });

  it('un tireur trop proche recule, et ne traverse jamais un mur', () => {
    const { w } = arena();
    const p = w.player;
    const m = spawnMonster(w, 'skeleton_archer', p.x + 2, p.y, { rank: 'normal' }, 't')!;
    m.aggro = true;
    const x0 = m.x;
    for (let i = 0; i < 40 && !m.dead; i++) {
      w.tick++;
      updateMonster(w, m);
      expect(w.grid.isBlockedAt(m.x, m.y)).toBe(false);
    }
    // soit il a reculé, soit il a tiré/est resté : jamais rapproché du joueur de plus de son corps
    expect(Math.hypot(m.x - p.x, m.y - p.y)).toBeGreaterThan(Math.hypot(x0 - p.x, 0) - 0.5);
  });
});

describe('Projectiles', () => {
  it('spawnMissile : durée de vie = portée / vitesse, vitesse selon l’angle', () => {
    const { w } = arena();
    const m = spawnMissile(w, { kind: 'test', team: 0, owner: 0, x: 3, y: 4, angle: Math.PI / 2, speed: 10, radius: 0.3, range: 20, dmg: emptyPacket(), elem: 'fire' });
    expect(w.missiles).toContain(m);
    expect(m.life).toBe(Math.ceil(20 / 10 / DT));
    expect(m.vx).toBeCloseTo(0, 6);
    expect(m.vy).toBeCloseTo(10, 6);
  });

  it('un projectile du joueur blesse le monstre touché puis disparaît', () => {
    const { w } = arena();
    const p = w.player;
    const t = spawnMonster(w, 'zombie', p.x + 3, p.y, { rank: 'normal' }, 't')!;
    w.monsterHash.clear();
    for (const o of w.monsters) w.monsterHash.insert(o);
    const hp0 = t.hp;
    const dmg = { ...emptyPacket(), phys: 30 };
    const m = spawnMissile(w, { kind: 'test', team: 0, owner: p.id, x: t.x - 0.5, y: t.y, angle: 0, speed: 12, radius: 0.3, range: 10, dmg, elem: 'phys' });
    for (let i = 0; i < 10 && !m.dead; i++) updateMissile(w, m);
    expect(m.dead).toBe(true);
    expect(t.hp).toBeLessThan(hp0);
  });

  it('un projectile ennemi blesse le joueur', () => {
    const { w } = arena();
    const p = w.player;
    const hp0 = p.hp;
    const dmg = { ...emptyPacket(), phys: 20 };
    const m = spawnMissile(w, { kind: 'test', team: 1, owner: 999, x: p.x - 0.4, y: p.y, angle: 0, speed: 12, radius: 0.3, range: 10, dmg, elem: 'phys' });
    for (let i = 0; i < 10 && !m.dead; i++) updateMissile(w, m);
    expect(m.dead).toBe(true);
    expect(p.hp).toBeLessThan(hp0);
  });

  it('un projectile expire en fin de portée sans rien toucher', () => {
    const { w } = arena();
    const p = w.player;
    const m = spawnMissile(w, { kind: 'test', team: 0, owner: p.id, x: p.x, y: p.y, angle: Math.PI, speed: 10, radius: 0.3, range: 1, dmg: emptyPacket(), elem: 'phys' });
    for (let i = 0; i < 100 && !m.dead; i++) updateMissile(w, m);
    expect(m.dead).toBe(true);
  });

  it('explode : touche tout le rayon et seulement lui', () => {
    const { w } = arena();
    const p = w.player;
    const a = spawnMonster(w, 'zombie', p.x + 5, p.y, { rank: 'normal' }, 'a')!;
    const b = spawnMonster(w, 'zombie', p.x + 5.8, p.y, { rank: 'normal' }, 'b')!;
    const far = spawnMonster(w, 'zombie', p.x + 12, p.y, { rank: 'normal' }, 'c')!;
    w.monsterHash.clear();
    for (const m of w.monsters) w.monsterHash.insert(m);
    const hp = [a.hp, b.hp, far.hp];
    const n = explode(w, 0, a.x, a.y, 2, { ...emptyPacket(), fire: 40 }, 'test', 'fire');
    expect(n).toBe(2);
    expect(a.hp).toBeLessThan(hp[0]);
    expect(b.hp).toBeLessThan(hp[1]);
    expect(far.hp).toBe(hp[2]);
  });

  it('scalePacket multiplie chaque élément sans toucher aux drapeaux', () => {
    const p = scalePacket({ ...emptyPacket(false), phys: 10, fire: 4, cold: 2 }, 2.5);
    expect(p.phys).toBe(25);
    expect(p.fire).toBe(10);
    expect(p.cold).toBe(5);
    expect(p.spell).toBe(false);
  });
});

describe('Auto-visée', () => {
  it('la portée d’acquisition est toujours >= 4 pour l’attaque et >= 5 pour un sort', () => {
    const { w } = arena();
    expect(acquisitionRange('attack', w)).toBeGreaterThanOrEqual(4);
    expect(acquisitionRange('fire_bolt')).toBeGreaterThanOrEqual(5);
  });

  it('pickSingle choisit le monstre le plus proche et ignore ceux hors de portée', () => {
    const { w } = arena();
    const p = w.player;
    const near = spawnMonster(w, 'zombie', p.x + 3, p.y, { rank: 'normal' }, 'n')!;
    spawnMonster(w, 'zombie', p.x + 7, p.y, { rank: 'normal' }, 'f')!;
    spawnMonster(w, 'zombie', p.x + 60, p.y, { rank: 'normal' }, 'x')!;
    w.monsterHash.clear();
    for (const m of w.monsters) w.monsterHash.insert(m);
    expect(pickSingle(w, 'fire_bolt', noJoy)?.id).toBe(near.id);
  });

  it('la cible verrouillée l’emporte, et rien à portée -> null', () => {
    const { w } = arena();
    const p = w.player;
    expect(pickSingle(w, 'fire_bolt', noJoy)).toBeNull();
    const a = spawnMonster(w, 'zombie', p.x + 2, p.y, { rank: 'normal' }, 'a')!;
    const b = spawnMonster(w, 'zombie', p.x + 6, p.y, { rank: 'normal' }, 'b')!;
    w.monsterHash.clear();
    for (const m of w.monsters) w.monsterHash.insert(m);
    expect(pickSingle(w, 'fire_bolt', { ...noJoy, lockedId: b.id })?.id).toBe(b.id);
    expect(pickSingle(w, 'fire_bolt', noJoy)?.id).toBe(a.id);
  });

  it('pickGround vise la grappe la plus dense', () => {
    const { w } = arena();
    const p = w.player;
    spawnMonster(w, 'zombie', p.x + 3, p.y - 3, { rank: 'normal' }, 'solo')!;
    for (let i = 0; i < 3; i++) spawnMonster(w, 'zombie', p.x + 6 + i * 0.4, p.y + 2, { rank: 'normal' }, `g${i}`)!;
    w.monsterHash.clear();
    for (const m of w.monsters) w.monsterHash.insert(m);
    const g = pickGround(w, 'fire_ball', noJoy)!;
    expect(g).not.toBeNull();
    expect(g.y).toBeGreaterThan(p.y);
  });

  it('autoAim : « self » vise le joueur ; sans monstre, un point devant lui', () => {
    const { w } = arena();
    const p = w.player;
    const self = autoAim(w, 'warmth', noJoy);
    expect(self).toEqual({ x: p.x, y: p.y, targetId: 0 });
    const none = autoAim(w, 'fire_bolt', { ...noJoy, joy: { x: 1, y: 0 } });
    expect(none.targetId).toBe(0);
    expect(none.x).toBeGreaterThan(p.x);
    expect(none.y).toBeCloseTo(p.y, 6);
  });

  it('contextTarget : l’objet au sol le plus proche dans le rayon', () => {
    const { w } = arena();
    const p = w.player;
    w.objects.length = 0;
    expect(contextTarget(w)).toBeNull();
    const it = generateItem(new Rng('t'), 'short_sword', 5);
    const gi = w.dropItem(it, p.x + 1, p.y, 0);
    gi.show = 1;
    const far = w.dropItem(generateItem(new Rng('u'), 'short_sword', 5), p.x + 1.8, p.y, 0);
    far.show = 1;
    const t = contextTarget(w, 2)!;
    expect(t.kind).toBe('item');
    expect(t.id).toBe(gi.id);
    gi.show = 0;
    expect(contextTarget(w, 2)!.id).toBe(far.id);
  });
});
