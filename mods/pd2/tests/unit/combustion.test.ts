/** Combustion (PD2) : anneau de boules de feu parties de la Sorcière dans toutes les directions. */
import { describe, expect, it } from 'vitest';
import { Game } from '../../../../src/sim/game';
import { World } from '../../../../src/sim/world';
import { ZoneBuilder } from '../../../../src/data/zones/builder';
import { addXp, xpToReach } from '../../../../src/sim/progression';
import { SKILL_BY_ID, lin, ramp } from '../../../../src/data/skills';
import type { Monster } from '../../../../src/sim/actors';

function arena(spawns: { x: number; y: number }[]): { g: Game; w: World; ms: Monster[] } {
  const g = new Game(undefined, 'sorceress');
  addXp(g.character, xpToReach(60));
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(20, 15);
  for (const s of spawns) b.spawn({ monster: 'zombie', x: s.x, y: s.y, count: 1, r: 0 });
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty: 0, zoneLevel: 30, character: g.character });
  g.world.populate();
  const ms = g.world.monsters.filter((x) => !x.dead && !x.isSummon);
  for (const x of ms) {
    x.hp = x.hpMax = 1e9;
    x.dmgMin = x.dmgMax = 0;
    x.defense = 0;
    x.res.fire = 0;
  }
  g.world.player.mana = g.world.player.manaMax = 1e6;
  return { g, w: g.world, ms };
}

const cast = (g: Game, w: World, tx: number, ty: number): void => {
  w.player.cooldowns = {};
  w.player.mode = 'idle';
  w.input.cast = { skill: 'combustion', tx, ty, targetId: 0 };
};

const balls = (w: World) => w.missiles.filter((m) => m.kind === 'fireball' && !m.dead);

describe('Combustion', () => {
  it('lance un anneau régulier de boules de feu depuis la position du joueur', () => {
    const { g, w } = arena([]);
    g.character.skills.combustion = 5;
    w.refreshPlayer();
    const n = Math.floor(lin(SKILL_BY_ID.combustion.n.count, 5));
    expect(n).toBeGreaterThanOrEqual(8);
    cast(g, w, 26, 15);
    for (let i = 0; i < 40 && balls(w).length === 0; i++) g.step(1);
    const bs = balls(w);
    expect(bs.length).toBe(n);
    const angs = bs.map((m) => Math.atan2(m.vy, m.vx)).sort((a, b) => a - b);
    for (let i = 0; i < n; i++) {
      const next = i + 1 < n ? angs[i + 1] : angs[0] + Math.PI * 2;
      expect(next - angs[i]).toBeCloseTo((Math.PI * 2) / n, 1);
    }
    for (const m of bs) {
      expect(Math.hypot(m.x - w.player.x, m.y - w.player.y)).toBeLessThan(2);
      expect(m.team).toBe(0);
      expect(m.elem).toBe('fire');
    }
  });

  it('blesse en feu les monstres touchés, sans toucher le joueur', () => {
    const { g, w, ms } = arena([
      { x: 26, y: 15 },
      { x: 14, y: 15 },
      { x: 20, y: 21 },
    ]);
    g.character.skills.combustion = 5;
    w.refreshPlayer();
    const hp0 = w.player.hp;
    cast(g, w, 26, 15);
    for (let i = 0; i < 80; i++) g.step(1);
    for (const m of ms) expect(m.hp).toBeLessThan(m.hpMax);
    expect(w.player.hp).toBeGreaterThanOrEqual(hp0);
  });

  it("applique la résistance au feu et respecte l'immunité", () => {
    const { g, w, ms } = arena([
      { x: 26, y: 15 },
      { x: 14, y: 15 },
    ]);
    g.character.skills.combustion = 5;
    w.refreshPlayer();
    ms[0].res.fire = 50;
    ms[1].res.fire = 100;
    cast(g, w, 26, 15);
    for (let i = 0; i < 80; i++) g.step(1);
    expect(ms[0].hp).toBeLessThan(ms[0].hpMax);
    expect(ms[1].hp).toBe(ms[1].hpMax);
  });

  it('coûte du mana selon la table PD2 (10 au niveau 1, +1 par niveau)', () => {
    const { g, w } = arena([]);
    g.character.skills.combustion = 1;
    w.refreshPlayer();
    const m0 = w.player.mana;
    cast(g, w, 26, 15);
    g.step(1);
    expect(m0 - w.player.mana).toBeGreaterThanOrEqual(10);
    expect(m0 - w.player.mana).toBeLessThan(12);
    expect(SKILL_BY_ID.combustion.n.mana[1]).toBe(1);
  });

  it('suit la table de dégâts PD2 : 12–28 au niveau 1, 24–42 au niveau 3', () => {
    const s = SKILL_BY_ID.combustion;
    const avg = (l: number) => {
      const t = [
        [12, 28],
        [18, 35],
        [24, 42],
      ][l - 1];
      return t;
    };
    expect(s.n.min && s.n.max).toBeTruthy();
    for (const l of [1, 2, 3]) {
      expect(ramp(s.n.min!, l)).toBe(avg(l)[0]);
      expect(ramp(s.n.max!, l)).toBe(avg(l)[1]);
    }
  });
});
