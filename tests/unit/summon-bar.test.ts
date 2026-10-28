/**
 * Barre d'invocations du HUD : compte par type (squelettes, golems, loups…), baisse à la mort, plafond, vide sans invocation.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import { summonEntries, summonKey } from '../../src/sim/summon-bar';
import { withoutPd2 } from '../needs-pd2';

function arena(): { g: Game; w: World } {
  const g = new Game(undefined, 'necromancer');
  addXp(g.character, xpToReach(60));
  g.character.skills = { raise_skeleton: 12, clay_golem: 6, golem_mastery: 5, spirit_wolf: 8 };
  const b = new ZoneBuilder('arena', 'Arène', 30, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  b.spawn({ monster: 'hell_bovine', x: 16, y: 15, count: 6, r: 2 });
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 3, difficulty: 0, zoneLevel: 20, character: g.character });
  g.world.populate();
  return { g, w: g.world };
}

function cast(g: Game, skill: string, tx: number, ty: number): void {
  const w = g.world;
  w.player.mana = w.player.manaMax;
  w.player.cooldowns = {};
  w.input.cast = { skill, tx, ty, targetId: 0 };
  g.step(30);
}

const countOf = (w: World, id: string): number => summonEntries(w).find((e) => e.id === id)?.count ?? 0;

describe("Barre d'invocations", () => {
  it('vide sans invocation', () => {
    const { w } = arena();
    expect(summonEntries(w)).toEqual([]);
    expect(summonKey(summonEntries(w))).toBe('');
  });

  it.skipIf(withoutPd2)('compte par type : 3 squelettes, 2 golems, 1 loup', () => {
    const { g, w } = arena();
    // trois cadavres pour trois squelettes
    for (const m of w.monsters.filter((x) => !x.pet).slice(0, 3)) {
      m.dead = true;
      m.hp = 0;
      m.deathTick = w.tick;
    }
    for (let i = 0; i < 3; i++) cast(g, 'raise_skeleton', w.player.x + 2, w.player.y);
    cast(g, 'clay_golem', w.player.x + 2, w.player.y);
    cast(g, 'clay_golem', w.player.x + 2, w.player.y);
    cast(g, 'spirit_wolf', w.player.x + 2, w.player.y);
    expect(countOf(w, 'raise_skeleton')).toBe(3);
    expect(countOf(w, 'clay_golem')).toBe(2);
    expect(countOf(w, 'spirit_wolf')).toBe(1);
    expect(summonEntries(w).length).toBe(3);
    // le mercenaire n'est pas une invocation
    expect(summonEntries(w).some((e) => e.id === 'merc')).toBe(false);
    // plafond affiché
    const sk = summonEntries(w).find((e) => e.id === 'raise_skeleton')!;
    expect(sk.cap).toBeGreaterThanOrEqual(3);
    expect(sk.name).toBeTruthy();
  });

  it('diminue à la mort et respecte le plafond', () => {
    const { g, w } = arena();
    g.character.skills.golem_mastery = 1;
    cast(g, 'clay_golem', w.player.x + 2, w.player.y);
    cast(g, 'blood_golem', w.player.x + 2, w.player.y);
    cast(g, 'clay_golem', w.player.x + 2, w.player.y);
    const cap = summonEntries(w)[0].cap;
    const total = summonEntries(w).reduce((n, e) => n + e.count, 0);
    expect(cap).toBeGreaterThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(cap);
    const key = summonKey(summonEntries(w));
    const g1 = w.monsters.find((m) => m.pet === 'clay_golem' && !m.dead) ?? w.monsters.find((m) => m.pet === 'blood_golem' && !m.dead)!;
    const before = total;
    w.killMonster(g1, null);
    expect(summonEntries(w).reduce((n, e) => n + e.count, 0)).toBe(before - 1);
    expect(summonKey(summonEntries(w))).not.toBe(key);
  });
});
