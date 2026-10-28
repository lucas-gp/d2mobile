/** IA des monstres : déclenchement, approche, attaque à portée, fuite, tireurs, états de contrôle, meutes. */
import { describe, expect, it } from 'vitest';
import { arena, at, run } from './arena-helper';
import { retreatDirection, rollMonsterDamage } from '../../src/sim/ai';
import { MONSTER_BY_ID } from '../../src/data/monsters';
import { WalkGrid } from '../../src/sim/grid';

const P = { x: 10, y: 15 };
const dP = (m: { x: number; y: number }) => Math.hypot(m.x - P.x, m.y - P.y);

describe('IA : éveil', () => {
  it('un monstre hors de portée d’éveil reste endormi près de son point d’apparition', () => {
    const { g, ms } = arena([{ monster: 'fallen', x: 35, y: 15 }], { live: true });
    run(g, 100);
    expect(ms[0].aggro).toBe(false);
    expect(Math.hypot(ms[0].x - ms[0].spawnX, ms[0].y - ms[0].spawnY)).toBeLessThan(3.5);
  });
  it('dans le rayon d’éveil, il s’éveille et s’approche du joueur', () => {
    const { g, ms } = arena([{ monster: 'fallen', x: 18, y: 15 }], { live: true });
    const d0 = dP(ms[0]);
    run(g, 40);
    expect(ms[0].aggro).toBe(true);
    expect(dP(ms[0])).toBeLessThan(d0 - 2);
  });
  it('l’éveil alerte la meute (même chef) mais pas un groupe lointain non lié', () => {
    const { g, ms } = arena(
      [
        { monster: 'fallen', x: 18, y: 15 },
        { monster: 'fallen', x: 19, y: 16 },
        { monster: 'fallen', x: 37, y: 27 },
      ],
      { live: true },
    );
    run(g, 5);
    expect(at(ms, 18, 15).aggro).toBe(true);
    expect(at(ms, 37, 27).aggro).toBe(false);
  });
  it('un monstre aveuglé ne voit pas le joueur au-delà de 2,2 unités : il n’approche pas', () => {
    const { g, w, ms } = arena([{ monster: 'fallen', x: 17, y: 15 }], { live: true });
    ms[0].aggro = true;
    ms[0].blindUntil = w.tick + 1000;
    const d0 = dP(ms[0]);
    run(g, 40);
    expect(dP(ms[0])).toBeGreaterThan(d0 - 1.5);
  });
});

describe('IA : combat de mêlée', () => {
  it('à portée, le monstre attaque et blesse le joueur ; le coup respecte l’intervalle de dégâts', () => {
    const { g, w, ms } = arena([{ monster: 'fallen', x: 11.2, y: 15 }], { live: true });
    const p = w.player;
    p.hp = p.hpMax = 1e6;
    ms[0].aggro = true;
    ms[0].dmgMin = ms[0].dmgMax = 50;
    run(g, 80);
    expect(p.hp).toBeLessThan(1e6);
    expect(ms[0].mode === 'attack' || ms[0].atkCd.some((c) => c > 0)).toBe(true);
  });
  it('le monstre n’attaque pas hors de portée de son arme', () => {
    const { g, w, ms } = arena([{ monster: 'fallen', x: 14, y: 15 }], { live: true });
    const p = w.player;
    ms[0].aggro = true;
    ms[0].speed = 0;
    run(g, 40);
    expect(p.hp).toBe(p.hpMax);
    expect(ms[0].mode).not.toBe('attack');
  });
  it('un monstre gelé ou étourdi ne bouge ni n’attaque', () => {
    for (const k of ['freezeT', 'stunT'] as const) {
      const { g, ms } = arena([{ monster: 'fallen', x: 16, y: 15 }], { live: true });
      ms[0].aggro = true;
      ms[0][k] = 1000;
      const d0 = dP(ms[0]);
      run(g, 30);
      expect(dP(ms[0])).toBeCloseTo(d0, 3);
    }
  });
  it('un monstre mort ne bouge plus', () => {
    const { g, w, ms } = arena([{ monster: 'fallen', x: 16, y: 15 }], { live: true });
    ms[0].aggro = true;
    w.killMonster(ms[0], null);
    const x0 = ms[0].x;
    run(g, 30);
    expect(ms[0].x).toBe(x0);
  });
  it('le ralentissement (gel) réduit la vitesse d’approche', () => {
    const dist = (chill: boolean) => {
      const { g, ms } = arena([{ monster: 'fallen', x: 19, y: 15 }], { live: true });
      ms[0].aggro = true;
      if (chill) {
        ms[0].chillT = 1000;
        ms[0].chillPct = 0.6;
      }
      run(g, 20);
      return 9 - dP(ms[0]);
    };
    expect(dist(true)).toBeLessThan(dist(false) * 0.7);
  });
});

describe('IA : fuite et distance', () => {
  it('fleeUntil (peur) : le monstre s’éloigne du joueur, puis revient une fois la peur finie', () => {
    const { g, w, ms } = arena([{ monster: 'fallen', x: 14, y: 15 }], { live: true });
    ms[0].aggro = true;
    ms[0].fleeUntil = w.tick + 40;
    const d0 = dP(ms[0]);
    run(g, 30);
    expect(dP(ms[0])).toBeGreaterThan(d0 + 1);
    const dFlee = dP(ms[0]);
    run(g, 80);
    expect(dP(ms[0])).toBeLessThan(dFlee);
  });
  it('le Déchu au trésor (lâche) fuit tant que le joueur est à moins de 9', () => {
    const { g, ms } = arena([{ monster: 'treasure_fallen', x: 14, y: 15 }], { live: true });
    expect(MONSTER_BY_ID.treasure_fallen.coward).toBe(true);
    ms[0].aggro = true;
    const d0 = dP(ms[0]);
    run(g, 30);
    expect(dP(ms[0])).toBeGreaterThan(d0 + 1.5);
  });
  it('un tireur (keepDistance) trop proche recule pour regagner sa distance', () => {
    const keep = MONSTER_BY_ID.fallen_shaman.keepDistance!;
    expect(keep).toBeGreaterThan(0);
    const { g, ms } = arena([{ monster: 'fallen_shaman', x: 12, y: 15 }], { live: true });
    ms[0].aggro = true;
    run(g, 40);
    expect(dP(ms[0])).toBeGreaterThan(2 + 1.5);
  });
});

describe('IA : recul des tireurs (retreatDirection)', () => {
  /** Grille 30×30 dont les rectangles [x0, y0, x1, y1] (unités monde) sont bloqués */
  const grid = (rects: [number, number, number, number][]) => {
    const g = new WalkGrid(30, 30);
    for (const [x0, y0, x1, y1] of rects) for (let cy = Math.floor(y0 / 0.5); cy < y1 / 0.5; cy++) for (let cx = Math.floor(x0 / 0.5); cx < x1 / 0.5; cx++) g.blocked[g.idx(cx, cy)] = 1;
    return g;
  };
  it('chemin libre : recule exactement à l’opposé', () => {
    const r = retreatDirection({ grid: grid([]) }, { x: 15, y: 15, radius: 0.4 }, 1, 0);
    expect(r).toEqual({ x: 1, y: 0 });
  });
  it('mur derrière : glisse sur le côté sans jamais se rapprocher du joueur', () => {
    const r = retreatDirection({ grid: grid([[17, 10, 18, 20]]) }, { x: 16, y: 15, radius: 0.4 }, 1, 0);
    expect(r).not.toBeNull();
    expect(r!.x).toBeLessThan(0.5);
    expect(Math.abs(r!.y)).toBeGreaterThan(0.8);
  });
  it('acculé de tous côtés : renvoie null (le tireur tient sa position)', () => {
    const cage: [number, number, number, number][] = [
      [12, 12, 19, 14],
      [12, 16, 19, 19],
      [12, 14, 14, 16],
      [16, 14, 19, 16],
    ];
    expect(retreatDirection({ grid: grid(cage) }, { x: 15, y: 15, radius: 0.4 }, 1, 0)).toBeNull();
  });
});

describe('IA : jet de dégâts', () => {
  it('reste dans [min, max] × multiplicateurs de l’attaque et du monstre', () => {
    const { w, ms } = arena([{ monster: 'fallen', x: 18, y: 15 }], { live: true });
    const m = ms[0];
    m.dmgMin = 10;
    m.dmgMax = 20;
    const atk = { ...m.def.attacks[0], dmgMul: 2 };
    for (let i = 0; i < 100; i++) {
      const d = rollMonsterDamage(w, m, atk);
      expect(d).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(d).toBeLessThanOrEqual(40 + 1e-6);
    }
    m.dmgMul = 0.5;
    for (let i = 0; i < 50; i++) expect(rollMonsterDamage(w, m, atk)).toBeLessThanOrEqual(20 + 1e-6);
  });
  it('un projectile de monstre subit le facteur de difficulté (Cauchemar > Normal)', () => {
    const { w, ms } = arena([{ monster: 'skeleton_archer', x: 18, y: 15 }], { live: true });
    const m = ms[0];
    m.dmgMin = m.dmgMax = 100;
    const miss = { ...m.def.attacks.find((a) => a.kind === 'missile')! };
    expect(miss).toBeDefined();
    (w as { difficulty: number }).difficulty = 0;
    const normal = rollMonsterDamage(w, m, miss);
    (w as { difficulty: number }).difficulty = 1;
    const nm = rollMonsterDamage(w, m, miss);
    expect(normal).toBeCloseTo(100 * miss.dmgMul, 5);
    expect(nm).toBeCloseTo(75 * miss.dmgMul, 5); // MISSILE_DMG : 1 / 0,75 / 0,4 selon la difficulté
  });
});
