/** Auto-visée : choix de cible (proche, élites, verrouillage, hystérésis, ligne de vue), sorts de zone, bouton contextuel. */
import { describe, expect, it } from 'vitest';
import { arena, at, run } from './arena-helper';
import { acquisitionRange, autoAim, contextTarget, pickGround, pickSingle, type AimContext } from '../../src/sim/targeting';

const ctx = (o: Partial<AimContext> = {}): AimContext => ({ joy: null, currentId: 0, lockedId: 0, ...o });

describe('Portée d’acquisition', () => {
  it('les sorts à distance ajoutent une marge à leur portée, avec un plancher', () => {
    expect(acquisitionRange('firestorm')).toBe(10); // portée 8 + 2
    expect(acquisitionRange('eruption')).toBe(13); // portée 11 + 2
    expect(acquisitionRange('cyclone_armor')).toBeGreaterThanOrEqual(5); // plancher 3 + 2
  });
  it('l’attaque de base a une portée d’au moins 4', () => {
    const { w } = arena([{ x: 30, y: 2 }]);
    expect(acquisitionRange('attack', w)).toBeGreaterThanOrEqual(4);
    expect(acquisitionRange('attack')).toBe(4);
  });
});

describe('pickSingle', () => {
  it('prend le plus proche quand rien d’autre ne les distingue', () => {
    const { g, w, ms } = arena([
      { x: 14, y: 15 },
      { x: 16, y: 15.5 },
    ]);
    run(g, 1);
    expect(pickSingle(w, 'firestorm', ctx())).toBe(at(ms, 14, 15));
  });
  it('ignore les monstres hors de la portée d’acquisition', () => {
    const { g, w } = arena([{ x: 30, y: 15 }]);
    run(g, 1);
    expect(pickSingle(w, 'firestorm', ctx())).toBeNull();
  });
  it('ignore un monstre derrière un mur (ligne de vue) mais pas un proche', () => {
    const { g, w } = arena([{ x: 17, y: 15 }], { walls: [[13, 12, 14, 18]] });
    run(g, 1);
    expect(pickSingle(w, 'firestorm', ctx())).toBeNull();
    const o = arena([{ x: 12, y: 15 }], { walls: [[11, 12, 11.5, 18]] });
    run(o.g, 1);
    expect(pickSingle(o.w, 'firestorm', ctx())).not.toBeNull(); // à moins de 3 : pas de test de ligne de vue
  });
  it('ignore un monstre converti (allié temporaire)', () => {
    const { g, w, ms } = arena([
      { x: 13, y: 15 },
      { x: 17, y: 15 },
    ]);
    run(g, 1);
    at(ms, 13, 15).convertedUntil = w.tick + 500;
    expect(pickSingle(w, 'firestorm', ctx())).toBe(at(ms, 17, 15));
  });
  it('un chef (unique) est préféré à un monstre normal un peu plus proche', () => {
    const { g, w, ms } = arena([
      { x: 14, y: 15 },
      { x: 14.6, y: 15 },
    ]);
    run(g, 1);
    at(ms, 14.6, 15).rank = 'unique';
    expect(pickSingle(w, 'firestorm', ctx())).toBe(at(ms, 14.6, 15));
  });
  it('un monstre blessé est un peu favorisé, à distance égale', () => {
    const { g, w, ms } = arena([
      { x: 14, y: 14 },
      { x: 14, y: 16 },
    ]);
    run(g, 1);
    at(ms, 14, 16).hp = at(ms, 14, 16).hpMax * 0.2;
    expect(pickSingle(w, 'firestorm', ctx())).toBe(at(ms, 14, 16));
  });
  it('le cône du joystick favorise la cible dans la direction poussée', () => {
    const { g, w, ms } = arena([
      { x: 14, y: 15 },
      { x: 10, y: 19 },
    ]);
    run(g, 1);
    expect(pickSingle(w, 'firestorm', ctx({ joy: { x: 0, y: 1 } }))).toBe(at(ms, 10, 19));
    expect(pickSingle(w, 'firestorm', ctx({ joy: { x: 1, y: 0 } }))).toBe(at(ms, 14, 15));
  });
  it('la cible verrouillée l’emporte même si elle est plus loin ; hors de 1,5× la portée, le verrou est abandonné', () => {
    const { g, w, ms } = arena([
      { x: 12, y: 15 },
      { x: 19, y: 15 },
      { x: 36, y: 15 },
    ]);
    run(g, 1);
    const far = at(ms, 19, 15);
    expect(pickSingle(w, 'firestorm', ctx({ lockedId: far.id }))).toBe(far);
    const veryFar = at(ms, 36, 15);
    expect(pickSingle(w, 'firestorm', ctx({ lockedId: veryFar.id }))).toBe(at(ms, 12, 15));
  });
  it('hystérésis : on garde la cible actuelle tant que l’autre ne la dépasse pas nettement', () => {
    const { g, w, ms } = arena([
      { x: 14, y: 14.5 },
      { x: 13.7, y: 15.5 },
    ]);
    run(g, 1);
    const a = at(ms, 14, 14.5);
    const b = at(ms, 13.7, 15.5);
    expect(pickSingle(w, 'firestorm', ctx())).toBe(b);
    expect(pickSingle(w, 'firestorm', ctx({ currentId: a.id }))).toBe(a);
  });
  it('hystérésis levée quand la cible actuelle est hors de portée', () => {
    const { g, w, ms } = arena([
      { x: 13, y: 15 },
      { x: 30, y: 15 },
    ]);
    run(g, 1);
    expect(pickSingle(w, 'firestorm', ctx({ currentId: at(ms, 30, 15).id }))).toBe(at(ms, 13, 15));
  });
});

describe('pickGround', () => {
  it('vise la grappe la plus dense plutôt que le monstre isolé le plus proche', () => {
    const { g, w } = arena([
      { x: 12, y: 13 },
      { x: 18, y: 17 },
      { x: 18.8, y: 17 },
      { x: 18, y: 17.8 },
      { x: 18.8, y: 17.8 },
    ]);
    run(g, 1);
    const r = pickGround(w, 'eruption', ctx())!;
    expect(r.x).toBeGreaterThan(17);
    expect(r.y).toBeGreaterThan(16.5);
    expect(r.targetId).toBeGreaterThan(0);
  });
  it('renvoie null sans ennemi à portée', () => {
    const { g, w } = arena([{ x: 38, y: 28 }]);
    run(g, 1);
    expect(pickGround(w, 'eruption', ctx())).toBeNull();
  });
  it('un boss pèse plus lourd qu’un groupe de deux normaux', () => {
    const { g, w, ms } = arena([
      { x: 16, y: 12 },
      { x: 18, y: 19 },
      { x: 18.4, y: 19 },
    ]);
    run(g, 1);
    at(ms, 16, 12).rank = 'boss';
    const r = pickGround(w, 'eruption', ctx())!;
    expect(r.y).toBeLessThan(15);
  });
});

describe('autoAim', () => {
  it('« self » : vise le joueur lui-même', () => {
    const { w } = arena([{ x: 14, y: 15 }]);
    const r = autoAim(w, 'cyclone_armor', ctx());
    expect(r).toEqual({ x: w.player.x, y: w.player.y, targetId: 0 });
  });
  it('« direction » : point devant selon le joystick, à 70 % de la portée', () => {
    const { w } = arena([{ x: 14, y: 15 }]);
    const r = autoAim(w, 'leap', ctx({ joy: { x: 0, y: 1 } }));
    expect(r.targetId).toBe(0);
    expect(r.x).toBeCloseTo(w.player.x, 5);
    expect(r.y - w.player.y).toBeCloseTo(8 * 0.7, 5);
  });
  it('« nearest » avec cible : renvoie ses coordonnées et son id ; sans cible : point devant le joueur', () => {
    const a = arena([{ x: 14, y: 15 }]);
    run(a.g, 1);
    const r = autoAim(a.w, 'firestorm', ctx());
    expect(r.targetId).toBe(a.ms[0].id);
    expect(r.x).toBeCloseTo(a.ms[0].x, 5);
    const b = arena([{ x: 38, y: 28 }]);
    run(b.g, 1);
    b.w.player.facing = 0;
    const e = autoAim(b.w, 'firestorm', ctx());
    expect(e.targetId).toBe(0);
    expect(e.x).toBeGreaterThan(b.w.player.x + 4);
  });
});

describe('contextTarget (bouton contextuel)', () => {
  it('ramasse l’objet au sol le plus proche dans le rayon, ignore les masqués', () => {
    const { w } = arena([{ x: 38, y: 2 }]);
    const mk = (x: number, y: number, show: number) => ({ id: w.newId(), item: {} as never, x, y, dropTick: 0, show });
    w.items.push(mk(11, 15, 0), mk(11.8, 15, 1), mk(10.5, 15.2, 1), mk(20, 15, 1));
    const r = contextTarget(w);
    expect(r).toMatchObject({ kind: 'item', label: 'Ramasser' });
    expect(r!.id).toBe(w.items[2].id);
  });
  it('renvoie null quand rien n’est à portée', () => {
    const { w } = arena([{ x: 38, y: 2 }]);
    expect(contextTarget(w)).toBeNull();
  });
});
