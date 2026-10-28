/**
 * Death and controls of the Survivals mode (lot 276, S3): a death loses the round (no portal back to the horde, the round eased next
 * time), never the level, gear or checkpoints, with Diablo II's experience penalty; a base run still waits behind its portal. Controls:
 * manual does nothing, semi-automatic attacks when the character stands still (not while the joystick moves it), automatic plays alone and
 * leaves the pack when surrounded. Stat points by profile.
 */
import { describe, expect, it, vi } from 'vitest';
import { activate } from './activate';

async function inRound(level = 10, cls: 'sorceress' | 'paladin' = 'sorceress') {
  const env = await activate();
  const g = new env.G.Game(undefined, cls);
  g.character.level = level;
  g.character.xp = env.P.xpToReach(level) + 10;
  g.startRun('survivals:a1r1', 0, 5);
  return { ...env, g };
}

describe('Death', () => {
  it('loses the round: back in town after 3 s, no portal to it, level and checkpoints kept; the next attempt is easier', async () => {
    const { g } = await inRound(10);
    g.step(25 * 20);
    const xp = g.character.xp;
    g.world.player.hp = 0;
    g.world.killPlayer();
    const msgs: string[] = [];
    for (let i = 0; i < 25 * 4; i++) for (const e of g.step(1)) if (e.t === 'message') msgs.push(e.text);
    expect(g.mode).toBe('town');
    expect(g.hasSuspendedRun).toBe(false);
    expect(g.world.objects.some((o) => o.kind === 'portal' && o.ref === 'run')).toBe(false);
    expect(msgs.some((m) => m.startsWith('Manche perdue'))).toBe(true);
    expect(msgs.some((m) => m.includes('Votre corps'))).toBe(false);
    expect(g.character.level).toBe(10);
    // Normal: D2 takes nothing
    expect(g.character.xp).toBe(xp);
    expect(g.character.progression.milestones['survivals:deaths:0:a1r1']).toBe(1);
    vi.resetModules();
  });

  it('Diablo II penalty in Nightmare (5 % of the level), and a base run still waits behind the portal', async () => {
    const env = await activate();
    const g = new env.G.Game(undefined, 'sorceress');
    g.character.level = 40;
    g.character.xp = env.P.xpToReach(41) - 1;
    g.character.progression.highestDifficulty = 1;
    g.startRun('survivals:a1r1', 1, 5);
    g.step(10);
    const before = g.character.xp;
    g.world.killPlayer();
    g.step(1);
    expect(before - g.character.xp).toBe(Math.floor((env.P.xpToReach(41) - env.P.xpToReach(40)) * 0.05));
    g.step(25 * 4);
    g.startRun('tristram', 0, 1);
    g.step(5);
    g.world.killPlayer();
    g.step(25 * 4);
    expect(g.mode).toBe('town');
    expect(g.hasSuspendedRun).toBe(true);
    vi.resetModules();
  });
});

describe('Controls', () => {
  const near = (g: import('../../../../src/sim/game').Game) => {
    const p = g.world.player;
    return g.world.monsters.some((m) => !m.dead && m.team === 1 && Math.hypot(m.x - p.x, m.y - p.y) < 8);
  };

  it('a saved manual control (gone since lot 290: no button) plays the semi-automatic: the character attacks on its own', async () => {
    const { g } = await inRound(10);
    g.settings.mods = { survivals: { control: 'manual' } };
    let casts = 0;
    for (let i = 0; i < 25 * 20; i++) {
      for (const e of g.step(1)) if (e.t === 'cast' && e.id === g.world.player.id) casts++;
      g.world.player.hp = g.world.player.hpMax;
    }
    expect(near(g)).toBe(true);
    expect(casts).toBeGreaterThan(0);
    vi.resetModules();
  });

  it('semi-automatic: standing still the character attacks; walking, it strikes a target in reach at most every 0.8 s (lot 288)', async () => {
    const { g } = await inRound(10);
    const { WALK_ATTACK } = await import('../../sim/autopilot');
    g.settings.mods = { survivals: { control: 'semi' } };
    g.character.skills.ice_bolt = 3;
    g.character.hotbar.primary = 'ice_bolt';
    g.world.refreshPlayer();
    let moving = 0;
    let still = 0;
    for (let i = 0; i < 25 * 40; i++) {
      const move = i % 250 < 125;
      g.world.input.moveX = move ? 0.7 : 0;
      g.world.input.moveY = move ? 0.7 : 0;
      for (const e of g.step(1)) if (e.t === 'cast' && e.id === g.world.player.id) move ? moving++ : still++;
      g.world.player.hp = g.world.player.hpMax;
      g.world.player.mana = g.world.player.manaMax;
    }
    expect(still).toBeGreaterThan(10);
    // 500 ticks walking: at most one strike every WALK_ATTACK.gap ticks, some
    expect(moving).toBeGreaterThan(0);
    expect(moving).toBeLessThanOrEqual(Math.ceil(500 / WALK_ATTACK.gap) + 2);
    vi.resetModules();
  });

  it('semi-automatic without the attack while walking (gap Infinity): the stop-to-shoot of lots 274-287', async () => {
    const { g } = await inRound(10);
    const { WALK_ATTACK } = await import('../../sim/autopilot');
    const gap = WALK_ATTACK.gap;
    WALK_ATTACK.gap = Infinity;
    g.settings.mods = { survivals: { control: 'semi' } };
    g.character.skills.ice_bolt = 3;
    g.character.hotbar.primary = 'ice_bolt';
    g.world.refreshPlayer();
    let moving = 0;
    for (let i = 0; i < 25 * 20; i++) {
      g.world.input.moveX = 0.7;
      g.world.input.moveY = 0.7;
      for (const e of g.step(1)) if (e.t === 'cast' && e.id === g.world.player.id) moving++;
      g.world.player.hp = g.world.player.hpMax;
    }
    WALK_ATTACK.gap = gap;
    expect(moving).toBe(0);
    vi.resetModules();
  });

  it('semi-automatic: the HUD switch stops the automatic attack', async () => {
    const { g } = await inRound(10);
    const { stateOf } = await import('../../sim/state');
    g.settings.mods = { survivals: { control: 'semi' } };
    stateOf(g).autoAttack = false;
    let casts = 0;
    for (let i = 0; i < 25 * 30; i++) {
      for (const e of g.step(1)) if (e.t === 'cast' && e.id === g.world.player.id && e.skill !== 'frozen_armor') casts++;
      g.world.player.hp = g.world.player.hpMax;
    }
    expect(casts).toBe(0);
    vi.resetModules();
  });

  it('automatic: plays alone (attacks, moves) and walks out of a crowd', async () => {
    const { g } = await inRound(12);
    g.settings.mods = { survivals: { control: 'auto' } };
    g.character.skills.ice_bolt = 5;
    g.world.refreshPlayer();
    let casts = 0;
    let moved = 0;
    let last = { x: g.world.player.x, y: g.world.player.y };
    for (let i = 0; i < 25 * 60; i++) {
      for (const e of g.step(1)) if (e.t === 'cast' && e.id === g.world.player.id) casts++;
      const p = g.world.player;
      moved += Math.hypot(p.x - last.x, p.y - last.y);
      last = { x: p.x, y: p.y };
      p.hp = p.hpMax;
    }
    expect(casts).toBeGreaterThan(20);
    expect(moved).toBeGreaterThan(3); // lot 292b-c: cheaper, quicker casts: it stands more
    const { survivalMove } = await import('../../sim/autopilot');
    const w = g.world;
    const p = w.player;
    p.mode = 'idle';
    for (const m of w.monsters.filter((x) => !x.dead).slice(0, 6)) {
      m.x = p.x + 1;
      m.y = p.y;
    }
    w.input.moveX = 0;
    w.input.moveY = 0;
    survivalMove(w);
    expect(w.input.moveX).toBeLessThan(0);
    vi.resetModules();
  });

  it('automatic melee: strikes in reach, walks to a target out of reach, gives up one that keeps away, no Sacrifice when hurt', async () => {
    const { g } = await inRound(12, 'paladin');
    const { meleeFight } = await import('../../sim/autopilot');
    const { stateOf } = await import('../../sim/state');
    const w = g.world;
    const p = w.player;
    w.monsters = w.monsters.filter((m) => m.team !== 1);
    g.character.skills.sacrifice = 3;
    g.character.hotbar.primary = 'sacrifice';
    const { simHooks } = await import('../../../../src/sim/hooks');
    const m = simHooks.spawnMonster(w, 'zombie', p.x + 1.2, p.y, { rank: 'normal' }, 'near')!;
    const rehash = () => {
      w.monsterHash.clear();
      for (const x of w.monsters) if (!x.dead) w.monsterHash.insert(x);
    };
    rehash();
    p.mode = 'idle';
    // auras first (the brain keeps them up), then the strike
    for (let i = 0; i < 3 && w.input.cast?.skill !== 'sacrifice'; i++) {
      w.input.cast = null;
      p.mode = 'idle';
      p.buffs = [{ id: 'might', until: 1e9 } as never, ...p.buffs];
      meleeFight(g, w);
    }
    expect(w.input.cast).toMatchObject({ skill: 'sacrifice', targetId: m.id });
    w.input.cast = null;
    p.hp = p.hpMax * 0.3;
    meleeFight(g, w);
    expect((w.input.cast as { skill: string } | null)?.skill).not.toBe('sacrifice');
    w.input.cast = null;
    p.hp = p.hpMax;
    m.x = p.x + 8;
    m.px = m.x;
    rehash();
    meleeFight(g, w);
    expect(w.input.cast).toBeNull();
    expect(w.input.moveX).toBeGreaterThan(0.5);
    // it does not get nearer for 3 s: left alone 8 s
    const st = stateOf(g);
    st.chase = { id: m.id, best: 8, since: w.tick - 80 };
    meleeFight(g, w);
    expect(st.banned.get(m.id)).toBeGreaterThan(w.tick);
    vi.resetModules();
  });

  it('a new round resets the timers of the controls (ticks start again with each world)', async () => {
    const { g } = await inRound(10);
    const { stateOf } = await import('../../sim/state');
    const st = stateOf(g);
    st.fleeUntil = 99999;
    st.fleeBlock = 99999;
    st.banned.set(1, 99999);
    g.enterTown();
    g.startRun('survivals:a1r1', 0, 9);
    const st2 = stateOf(g);
    expect([st2.fleeUntil, st2.fleeBlock, st2.banned.size]).toEqual([0, 0, 0]);
    vi.resetModules();
  });

  it('stat points: balanced (bot spending), vitality, or kept for the player', async () => {
    const { g } = await inRound(10, 'paladin');
    const { spendStats } = await import('../../sim/autopilot');
    const c = g.character;
    c.statPoints = 10;
    g.settings.mods = { survivals: { stats: 'manual' } };
    spendStats(g);
    expect(c.statPoints).toBe(10);
    const vit = c.base.vit;
    g.settings.mods = { survivals: { stats: 'vitality' } };
    spendStats(g);
    expect(c.statPoints).toBe(0);
    expect(c.base.vit).toBe(vit + 10);
    c.statPoints = 10;
    g.settings.mods = { survivals: { stats: 'balanced' } };
    spendStats(g);
    expect(c.statPoints).toBe(0);
    vi.resetModules();
  });
});
