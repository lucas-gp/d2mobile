// @vitest-environment happy-dom
/**
 * Nightmare and Hell in the Survivals mode (lot 282, S7), smoke tests of the normal suite (the campaigns played by bots in each difficulty
 * are the long tests of the nightly job and of `tools/campaign.ts`). Diablo II's progression: Baal in Normal opens Nightmare, Baal in
 * Nightmare opens Hell; the 29 rounds playable in each difficulty with its monster levels (Levels.txt), resistances and immunities, ranks
 * (uniques: one more random modifier a difficulty), experience and loot; checkpoints, deaths and quest rewards kept by difficulty; the
 * death penalty (0 / 5 / 10 %); no round left impossible for a single-element build (immunity.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import type { Game } from '../../../../src/sim/game';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const { directorOf } = await import('../../ui/hud');
  const CH = await import('../../data/chapters');
  const CP = await import('../../sim/checkpoints');
  const Z = await import('../../sim/zones');
  const IM = await import('../../sim/immunity');
  return { ...env, directorOf, CH, CP, Z, IM };
}

/** Plays up to `seconds` with a character that cannot die; elite packs (and the bosses) are killed 3 s after they appear */
function playKilling(g: Game, seconds: number): number {
  const seen = new Map<number, number>();
  let done = -1;
  for (let t = 0; t < seconds * 25 && g.mode === 'run' && done < 0; t++) {
    g.world.godMode = true;
    for (const e of g.step(1)) {
      if (e.t === 'bossSpawn') seen.set(e.id, t);
      if (e.t === 'runComplete') done = Math.round(t / 25);
    }
    if (t % 25 === 0)
      for (const m of g.world.monsters) {
        const at = seen.get(m.id) ?? seen.get(m.leader ?? -1);
        if (!m.dead && at !== undefined && t - at > 75) g.world.killMonster(m, g.world.player);
      }
  }
  return done;
}

const noop = () => undefined;

describe('Survivals: Nightmare and Hell', () => {
  it("every round at each difficulty: pools of the game's monsters, Levels.txt's levels rising from Normal to Hell", async () => {
    const { CH, Z } = await setup();
    for (const r of CH.ROUNDS) {
      const lv = Z.roundLevels(r);
      expect(lv[0], r.id).toBeLessThan(lv[1]);
      expect(lv[1], r.id).toBeLessThan(lv[2]);
      for (const d of [1, 2]) for (const z of r.zones) expect(Z.zonePool(z, d).length, `${r.id} ${z} ${d}`).toBeGreaterThan(0);
    }
    vi.resetModules();
  });

  it('checkpoints by difficulty: Nightmare starts at the Blood Moor, Baal in Nightmare opens Hell, Hell is the last difficulty', async () => {
    const { G, CH, CP } = await setup();
    const g = new G.Game(undefined, 'sorceress');
    g.character.level = 75;
    for (const r of CH.ROUNDS) CP.markCheckpoint(g.character, 0, r.id);
    g.character.progression.highestDifficulty = 1;
    expect(CP.resumeRound(g.character, 1).id).toBe('a1r1');
    expect(
      CP.roundStatus(g.character, 1)
        .filter((s) => s.unlocked)
        .map((s) => s.round.id),
    ).toEqual(['a1r1']);
    // the Throne of Destruction in Nightmare: Baal's death opens Hell
    for (const r of CH.ROUNDS) if (r.id !== 'a5r7') CP.markCheckpoint(g.character, 1, r.id);
    expect(g.startRun('survivals:a5r7', 1, 3)).toBe(true);
    expect(g.world.difficulty).toBe(1);
    expect(playKilling(g, 900)).toBeGreaterThan(0);
    expect(CP.checkpointDone(g.character, 1, 'a5r7')).toBe(true);
    expect(g.character.progression.highestDifficulty).toBe(2);
    expect(CP.resumeRound(g.character, 2).id).toBe('a1r1');
    expect(CP.checkpointDone(g.character, 2, 'a1r1')).toBe(false);
    vi.resetModules();
  }, 120_000);

  it("a Hell round: the zone's Hell level, D2's resistances of the difficulty, uniques with three random modifiers, Hell's experience", async () => {
    const { G, directorOf } = await setup();
    const SDK = await import('../../../../src/mods/sdk');
    const g = new G.Game(undefined, 'sorceress');
    g.character.level = 70;
    g.character.progression.highestDifficulty = 2;
    g.startRun('survivals:a1r1', 2, 4);
    g.step(1);
    directorOf(g)!.start -= 25 * 260;
    const uniques: number[] = [];
    for (let t = 0; t < 25 * 20; t++) {
      g.world.godMode = true;
      for (const e of g.step(1)) if (e.t === 'bossSpawn') uniques.push(e.id);
    }
    const lvl = SDK.REGISTRIES.levels.get('a1_bloodmoor')!.lvl[2];
    const normals = g.world.monsters.filter((m) => !m.dead && m.team === 1 && m.rank === 'normal');
    expect(normals.length).toBeGreaterThan(3);
    for (const m of normals) {
      expect(m.mlvl).toBeGreaterThanOrEqual(lvl);
      expect(m.mlvl).toBeLessThanOrEqual(lvl + 3);
      // each resistance is the species' Hell value (or one of its variants'), never a rule of the mode
      for (const [e, v] of Object.entries(m.res)) {
        const allowed = [0, m.def.res[e as 'fire']?.[2] ?? 0, ...(m.def.resVariants ?? []).map((r) => r[e as 'fire']?.[2] ?? 0)];
        if (!m.mods.length) expect(allowed, `${m.def.id} ${e}`).toContain(v);
      }
      expect(m.xp).toBeGreaterThan(0);
    }
    const u = g.world.monsters.find((m) => m.id === uniques[0])!;
    expect(u.rank).toBe('unique');
    expect(u.mods.length).toBeGreaterThanOrEqual(3);
    // the same species in Normal gives far less experience (D2's tables by difficulty)
    const n = new G.Game(undefined, 'sorceress');
    n.startRun('survivals:a1r1', 0, 4);
    n.step(25 * 10);
    const same = n.world.monsters.find((m) => m.team === 1 && m.rank === 'normal' && normals.some((h) => h.def.id === m.def.id));
    if (same) expect(normals.find((h) => h.def.id === same.def.id)!.xp).toBeGreaterThan(same.xp * 10);
    vi.resetModules();
  }, 60_000);

  it("quest rewards again in each difficulty (the Den of Evil's skill point in Nightmare), D2's death penalty 10 % in Hell", async () => {
    const { G, P, directorOf, CP } = await setup();
    const g = new G.Game(undefined, 'sorceress');
    g.character.level = 50;
    g.character.progression.highestDifficulty = 1;
    g.character.progression.rewards.push('reward:survivals:a1r1:0');
    g.startRun('survivals:a1r1', 1, 3);
    g.step(1);
    directorOf(g)!.start -= 25 * 470;
    const sp = g.character.skillPoints;
    expect(playKilling(g, 60)).toBeGreaterThan(0);
    expect(CP.checkpointDone(g.character, 1, 'a1r1')).toBe(true);
    expect(g.character.skillPoints).toBe(sp + 1);
    expect(g.character.progression.rewards).toContain('reward:survivals:a1r1:1');
    g.enterTown();
    // Hell: 10 % of the level's experience
    g.character.level = 70;
    g.character.xp = P.xpToReach(71) - 1;
    g.character.progression.highestDifficulty = 2;
    g.startRun('survivals:a1r2', 2, 3);
    g.step(10);
    const before = g.character.xp;
    g.world.killPlayer();
    g.step(1);
    expect(before - g.character.xp).toBe(Math.floor((P.xpToReach(71) - P.xpToReach(70)) * 0.1));
    vi.resetModules();
  }, 60_000);
});

describe('Rounds a build can solve (immunities)', () => {
  it("the character's attack elements: its damaging skills, physical for weapon attacks", async () => {
    const { G, IM } = await setup();
    const s = new G.Game(undefined, 'sorceress');
    s.character.skills = {};
    expect(IM.attackElements(s.character)).toEqual(['phys']);
    s.character.skills = { fire_bolt: 1, fire_ball: 12, warmth: 5, frozen_armor: 1, ice_bolt: 2 };
    expect(IM.attackElements(s.character)).toEqual(['fire']);
    s.character.skills = { charged_bolt: 8, lightning: 10, fire_ball: 1 };
    expect(IM.attackElements(s.character)).toEqual(['light']);
    const b = new G.Game(undefined, 'barbarian');
    b.character.skills = { whirlwind: 15, bash: 1, battle_orders: 10 };
    expect(IM.attackElements(b.character)).toEqual(['phys']);
    vi.resetModules();
  });

  it("a Hell round of a cold build keeps the cold immunes under 15 % of the target, the checkpoint boss's immunity broken", async () => {
    const { G, IM, directorOf } = await setup();
    /** Plays 2:40 of the Cold Plains in Hell from 5:30 (most species there may be cold immune): live cold immunes at most */
    const play = (limit: boolean) => {
      const g = new G.Game(undefined, 'sorceress');
      g.character.level = 90;
      g.character.skills = { ice_bolt: 5, ice_blast: 20 };
      g.character.progression.highestDifficulty = 2;
      g.startRun('survivals:a1r2', 2, 7);
      g.step(1);
      const d = directorOf(g)!;
      d.start -= 25 * 330;
      if (!limit) (d.opts as { elements?: string[] }).elements = [];
      let most = 0;
      for (let t = 0; t < 25 * 160; t++) {
        g.world.godMode = true;
        g.step(1);
        if (t % 25 === 0) {
          const imm = g.world.monsters.filter((m) => !m.dead && m.team === 1 && !m.isSummon && IM.monsterImmune(m, ['cold'])).length;
          most = Math.max(most, imm);
          // champion packs may bring a few more (their modifiers)
          if (limit) expect(imm, `at ${d.state(g.world).sec}`).toBeLessThanOrEqual(IM.immuneCapOf(d.state(g.world).target) + 6);
        }
      }
      return { g, most, alive: d.state(g.world).alive };
    };
    const free = play(false);
    const kept = play(true);
    expect(free.most).toBeGreaterThan(kept.most * 2);
    expect(kept.alive).toBeGreaterThan(20);
    const g = kept.g;
    // the mini-boss (Blood Raven, 8:00) is never immune to the build
    const boss = directorOf(g)!.boss;
    expect(boss).not.toBeNull();
    expect(boss!.res.cold).toBeLessThan(100);
    // a boss immune to every element of the build keeps 90 % (the seal guardians' cap of the base)
    const fake = { res: { phys: 0, fire: 120, cold: 0, light: 100, poison: 0, magic: 0 } } as never;
    expect(IM.breakBossImmunity(fake, ['fire', 'light'])).toBe(true);
    expect((fake as { res: Record<string, number> }).res).toMatchObject({ fire: 90, light: 90 });
    expect(IM.breakBossImmunity(fake, ['fire'])).toBe(false);
    vi.resetModules();
  }, 90_000);
});

describe('Waypoint and HUD by difficulty', () => {
  it('the highest difficulty first and unfolded, each with its rounds cleared; the HUD names Nightmare and Hell', async () => {
    const { G, U, CH, CP } = await setup();
    const g = new G.Game(undefined, 'sorceress');
    const ctx = { game: g, host: { message: noop, haptic: noop, itemSound: noop }, screen: { open: () => ({ close: noop }) }, render: noop, close: noop };
    const [one] = U.contributions('town.waypoint').map((f) => f(ctx)!);
    expect([...one.querySelectorAll<HTMLDetailsElement>('details[data-diff]')].map((x) => [x.dataset.diff, x.open])).toEqual([['0', true]]);
    expect(one.textContent).toContain('Manches terminées : 0 / 29');
    for (const r of CH.ROUNDS) CP.markCheckpoint(g.character, 0, r.id);
    CP.markCheckpoint(g.character, 1, 'a1r1');
    g.character.progression.highestDifficulty = 2;
    const [three] = U.contributions('town.waypoint').map((f) => f(ctx)!);
    expect([...three.querySelectorAll<HTMLDetailsElement>('details[data-diff]')].map((x) => [x.dataset.diff, x.open])).toEqual([
      ['2', true],
      ['1', false],
      ['0', false],
    ]);
    expect(three.querySelector('details[data-diff="1"]')!.textContent).toContain('Manches terminées : 1 / 29');
    expect(three.querySelector('details[data-diff="0"]')!.textContent).toContain('Manches terminées : 29 / 29');
    const hellPlay = three.querySelector('details[data-diff="2"] button[data-round="a1r1"]') as HTMLButtonElement;
    hellPlay.click();
    expect(g.mode).toBe('run');
    expect(g.world.difficulty).toBe(2);
    const now = vi.spyOn(performance, 'now');
    let t = 1000;
    now.mockImplementation(() => (t += 300));
    const [hud] = U.contributions('hud').map((f) => f({ game: g, host: ctx.host, screen: ctx.screen })!);
    g.step(30);
    hud.update!(g);
    expect(hud.el.querySelector('[data-sv="difficulty"]')!.textContent).toBe('Enfer');
    now.mockRestore();
    vi.resetModules();
  });
});

describe('Automatic choice of the cards', () => {
  it("follows the class's build plan: its next skill, else the free reroll, else the point kept and spent on the plan in town", async () => {
    const { G, directorOf } = await setup();
    const LU = await import('../../ui/levelup');
    const g = new G.Game(undefined, 'barbarian');
    g.settings.mods = { survivals: { cards: 'auto' } };
    g.startRun('survivals:a1r1', 0, 1);
    g.step(1);
    const c = g.character;
    c.skills = {};
    // the Whirlwind plan starts with Bash: offered, it is taken
    c.skillPoints = 1;
    g.offers.push({ level: 2, ids: ['howl', 'bash', 'axe_mastery'], rerolls: 0 });
    LU.autoAnswer(g);
    expect(c.skills.bash).toBe(1);
    expect(c.skillPoints).toBe(0);
    expect(directorOf(g)!.rerolls.free).toBe(true);
    // not offered: the round's free reroll, then the point kept (never a skill outside the plan's order)
    c.skillPoints = 1;
    g.offers.push({ level: 3, ids: ['howl', 'axe_mastery', 'mace_mastery'], rerolls: 0 });
    LU.autoAnswer(g);
    expect(g.offers).toEqual([]);
    expect(directorOf(g)!.rerolls.free).toBe(false);
    const next = Object.keys(c.skills).filter((k) => c.skills[k] > 0);
    expect(
      next.every((k) => ['bash', 'double_swing', 'sword_mastery'].includes(k)),
      next.join(),
    ).toBe(true);
    const kept = c.skillPoints;
    const total = () => Object.values(c.skills).reduce((a, b) => a + b, 0);
    // kept points: spent on the plan once in town (the tree is free there); level 1: Double Swing (level 6) waits, Sword Mastery comes next
    g.enterTown();
    c.skillPoints = kept + 2;
    const before = total();
    g.step(1);
    expect(c.skillPoints).toBe(0);
    expect(total()).toBe(before + kept + 2);
    expect(c.skills.sword_mastery).toBeGreaterThan(0);
    vi.resetModules();
  });
});

describe('A round lost again and again', () => {
  it('keeps fewer monsters born of others (flesh beasts, maggot young) above its target', async () => {
    await setup();
    const D = await import('../../sim/director');
    expect(D.bornSlackOf(0)).toBe(D.BORN_SLACK);
    expect(D.bornSlackOf(3)).toBe(5);
    expect(D.bornSlackOf(30)).toBe(D.BORN_SLACK_MIN);
    vi.resetModules();
  });

  it('after 6 deaths, no late champion packs; after 15, no champion pack nor unique (the mini-boss still comes)', async () => {
    const { G, directorOf } = await setup();
    /** Champion packs (their leaders) from 2:20 to 7:00 */
    const packs = (deaths: number) => {
      const g = new G.Game(undefined, 'sorceress');
      g.character.level = 20;
      if (deaths) g.character.progression.milestones['survivals:deaths:0:a1r2'] = deaths;
      g.startRun('survivals:a1r2', 0, 3);
      g.step(1);
      directorOf(g)!.start -= 25 * 140;
      const leaders = new Set<number>();
      for (let t = 0; t < 25 * 280; t++) {
        g.world.godMode = true;
        g.step(1);
        // before the checkpoint (the overtime has its own packs)
        if (t % 25 === 0 && !directorOf(g)!.checkpoint) for (const m of g.world.monsters) if (m.rank === 'champion' && !m.leader) leaders.add(m.id);
      }
      return leaders.size;
    };
    expect(packs(0)).toBe(3);
    expect(packs(6)).toBe(1);
    // after 15, none (nor the unique): the population, the encirclement and the mini-boss stay
    expect(packs(15)).toBe(0);
    vi.resetModules();
  }, 60_000);

  it('runs its timeline faster: the mini-boss at 8:00 the first time, 3:12 at the quickest (boss rounds keep theirs)', async () => {
    const { G, directorOf } = await setup();
    const D = await import('../../sim/director');
    expect(D.paceOf(0)).toBe(1);
    expect(D.paceOf(10)).toBeCloseTo(0.96 ** 10, 5);
    expect(D.paceOf(40)).toBe(D.PACE.floor);
    const next = (round: string, deaths: number) => {
      const g = new G.Game(undefined, 'sorceress');
      g.character.level = 30;
      if (deaths) g.character.progression.milestones[`survivals:deaths:0:${round}`] = deaths;
      g.startRun(`survivals:${round}`, 0, 3);
      g.step(1);
      const d = directorOf(g)!;
      return { mini: d.ev(D.EVENTS.miniboss), first: d.nextEvent(0) };
    };
    expect(next('a1r2', 0)).toEqual({ mini: 480, first: { what: 'champions', at: 150 } });
    // 40 deaths: no champion pack any more, the encirclement first
    expect(next('a1r2', 40)).toEqual({ mini: 192, first: { what: 'encircle', at: 72 } });
    expect(next('a2r7', 40).mini).toBe(480);
    vi.resetModules();
  }, 60_000);
});

describe('Automatic melee fighter', () => {
  it('strikes with the skill it has put the most points in, not with the first one learned', async () => {
    const { G } = await setup();
    const AP = await import('../../sim/autopilot');
    const g = new G.Game(undefined, 'barbarian');
    g.character.level = 40;
    g.character.skills = { bash: 1, double_swing: 8, whirlwind: 20 };
    g.character.hotbar.primary = 'bash';
    g.startRun('survivals:a1r1', 0, 1);
    g.step(1);
    g.world.player.mana = g.world.player.manaMax = 500;
    expect(AP.meleeSkill(g, g.world)).toBe('whirlwind');
    g.character.skills = { bash: 6, double_swing: 6 };
    expect(AP.meleeSkill(g, g.world)).toBe('bash');
    vi.resetModules();
  });
});
