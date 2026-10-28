/**
 * Lot 292b, the owner's tests of lots 289-291: the hero walks while he strikes or casts and a hit never roots him; skills cost a small
 * share of their mana in a round; the monsters chase straight across the arena; a Shaman's fallen companions stay to be raised; the
 * encirclement is a whole ring of at least 28 monsters; the pause opens the bag and the skill tree.
 */
import { describe, expect, it } from 'vitest';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const RM = await import('../../sim/runmode');
  const ST = await import('../../sim/state');
  const D = await import('../../sim/director');
  const SDK = await import('../../../../src/mods/sdk');
  const create = (cls = 'barbarian') => {
    const g = new env.G.Game(undefined, cls as never);
    for (const f of env.U.contributions('create.character')) f({ game: g });
    ST.stateOf(g).autoStart = false;
    return g;
  };
  return { ...env, RM, ST, D, SDK, create };
}

describe('Survivals: the owner’s tests of lots 289-291 (lot 292b)', () => {
  it('in a round: walking while striking, no hit recovery, a fifth of the mana at most, a straight chase; in town the base’s', async () => {
    const { R, RM, create, SDK } = await setup();
    const g = create();
    expect(R.RULES['player.castWhileMoving'](g.world)).toBe(false);
    expect(R.RULES['ai.directChase'](g.world, {} as never)).toBe(false);
    expect(R.RULES['skills.manaCost'](g.world, 'whirlwind', 25)).toBe(25);
    RM.startRunMode(g, 1, 0);
    g.takeOffer(null);
    const w = g.world;
    expect(R.RULES['player.castWhileMoving'](w)).toBe(true);
    expect(R.RULES['ai.directChase'](w, {} as never)).toBe(true);
    expect(R.RULES['combat.playerHitRecovery'](500, 100)).toBe(false);
    // lot 294: no mana at all in Act I's flow of the Run (the Campaign's rounds keep `MANA.share`: survivals-294.test.ts)
    expect(R.RULES['skills.manaCost'](w, 'whirlwind', 25)).toBe(0);
    expect(SDK.skillManaCost(w, 'whirlwind')).toBe(0);
    // walking while striking: the hero still covers ground
    for (const m of w.monsters) m.dead = true;
    const p = w.player;
    const x0 = p.x;
    for (let t = 0; t < 25; t++) {
      if (p.mode !== 'attack') w.input.cast = { skill: 'attack', tx: p.x + 1, ty: p.y, targetId: 0 };
      w.input.moveX = 1;
      w.input.moveY = 0;
      w.step();
    }
    expect(p.x - x0).toBeGreaterThan(3);
  });

  it('a whole ring of at least 28 monsters around the hero in the act’s flow; a body a Shaman can raise stays 10 s', async () => {
    const { RM, create, D, SDK } = await setup();
    const g = create('sorceress');
    RM.startRunMode(g, 1, 0);
    g.takeOffer(null);
    const w = g.world;
    w.godMode = true;
    g.step(2);
    for (const m of w.monsters) m.dead = true;
    const dir = w.run!.director as unknown as { encircle(w: unknown, sec: number): void };
    const before = w.monsters.length;
    dir.encircle(w, 35);
    const ring = w.monsters.slice(before).filter((m) => !m.dead);
    expect(ring.length).toBeGreaterThanOrEqual(D.ENCIRCLE.min);
    const p = w.player;
    const sectors = new Set(ring.map((m) => Math.floor(((Math.atan2(m.y - p.y, m.x - p.x) + Math.PI) / (2 * Math.PI)) * 8) % 8));
    expect(sectors.size).toBe(8);
    for (const m of ring) m.dead = true;
    // a Shaman and a Fallen's body: the body stays (raisable), another species' goes after 3 s
    const sh = SDK.simHooks.spawnMonster(w, 'fallen_shaman', p.x + 6, p.y, { rank: 'normal' }, 't-sh')!;
    const fa = SDK.simHooks.spawnMonster(w, 'fallen', p.x + 5, p.y + 1, { rank: 'normal' }, 't-fa')!;
    const zo = SDK.simHooks.spawnMonster(w, 'zombie', p.x - 5, p.y, { rank: 'normal' }, 't-zo')!;
    for (const m of [fa, zo]) {
      m.dead = true;
      m.hp = 0;
      m.deathTick = w.tick;
    }
    sh.atkCd = sh.atkCd.map(() => 1e9);
    for (let t = 0; t < 5 * 25; t++) w.step();
    expect(w.monsters.includes(fa)).toBe(true);
    expect(w.monsters.includes(zo)).toBe(false);
  });
});
