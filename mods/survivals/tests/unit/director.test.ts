/**
 * Director and arena of the Survivals rounds (lot 275, S2): population targets and spawn bursts (DESIGN formulas), arena built or cut
 * from a D2 map, a whole round of the Blood Moor played headless (no monster for 3 s, targets, events, Corpsefire as the checkpoint,
 * first-clear reward, live monster cap), monster levels of Levels.txt (+0 to +3), determinism.
 */
import { describe, expect, it, vi } from 'vitest';
import { BOSS_SEGMENTS, isRanged, overtimeTarget, pressureOf, ROUND_SEGMENTS, spawnBurst, targetAt } from '../../sim/director';
import { activate } from './activate';

describe('Director formulas', () => {
  it('targets by segment: 0 for 3 s, 12 → 30 to 1:00, 30 → 50, breather of 25 at 5:00, 50 → 80 from 5:30, 40 with the mini-boss', () => {
    expect(targetAt(ROUND_SEGMENTS, 0).target).toBe(0);
    expect(targetAt(ROUND_SEGMENTS, 2.9).target).toBe(0);
    expect(targetAt(ROUND_SEGMENTS, 3).target).toBe(12);
    expect(targetAt(ROUND_SEGMENTS, 59.99).target).toBe(30);
    expect(targetAt(ROUND_SEGMENTS, 105).target).toBe(40);
    expect(targetAt(ROUND_SEGMENTS, 310).target).toBe(25);
    expect(targetAt(ROUND_SEGMENTS, 330).seg).toMatchObject({ lvl: 1, mix: true });
    expect(targetAt(ROUND_SEGMENTS, 449.99).target).toBe(80);
    expect(targetAt(ROUND_SEGMENTS, 600).target).toBe(40);
    expect(targetAt(BOSS_SEGMENTS, 60).target).toBeGreaterThan(20);
    expect(targetAt(BOSS_SEGMENTS, 95).target).toBe(0);
  });

  it('bursts: the missing monsters at the rate per half second, doubled below half the target, 8 at most, 1 at least', () => {
    expect(spawnBurst(0, 3, 10, 10)).toBe(0);
    expect(spawnBurst(5, 0, 0, 5)).toBe(0);
    expect(spawnBurst(20, 3, 30, 50)).toBe(2);
    expect(spawnBurst(40, 3, 10, 50)).toBe(3);
    expect(spawnBurst(40, 20, 0, 80)).toBe(8);
    expect(spawnBurst(1, 5, 79, 80)).toBe(1);
  });

  it('pressure: 25 % of the table at the recommended level, all of it 15 levels above, eased by the deaths in the round (20 % each), 10 % at least', () => {
    expect(pressureOf(1, 1, 0)).toBe(0.25);
    expect(pressureOf(11, 1, 0)).toBeCloseTo(0.75, 5);
    expect(pressureOf(30, 1, 0)).toBe(1);
    expect(pressureOf(11, 1, 1)).toBeCloseTo(0.6, 5);
    expect(pressureOf(1, 1, 20)).toBe(0.1);
    expect(pressureOf(1, 10, 0)).toBe(0.1);
  });

  it('ranged monsters (archers, casters) are recognized for the arena pools', () => {
    expect(isRanged('skeleton_archer')).toBe(true);
    expect(isRanged('skeleton_mage')).toBe(true);
    expect(isRanged('zombie')).toBe(false);
  });

  it('overtime: ×(1 + 0.15 per minute), at most ×2', () => {
    expect(overtimeTarget(50, 0)).toBe(50);
    expect(overtimeTarget(50, 2)).toBe(65);
    expect(overtimeTarget(50, 30)).toBe(100);
  });
});

describe('Arena', () => {
  it('synthetic arena: 90 × 90 units closed by a border (lot 307: 64 before), the player in the middle, 12 to 20 obstacles away from the border', async () => {
    const { G } = await activate();
    const { buildArena, boxOf } = await import('../../sim/arena');
    const { ROUND_BY_ID } = await import('../../data/chapters');
    const { zone, box, cut } = buildArena(ROUND_BY_ID.a1r1, 7);
    expect(cut).toBe(false);
    expect(box.x1 - box.x0).toBe(90);
    expect(boxOf(zone)).toBe(box);
    expect(zone.start).toEqual({ x: 48, y: 48 });
    const obstacles = zone.blockers.filter((b) => b.rect && b.rect[0] > 0 && b.rect[1] > 0 && b.rect[2] < zone.width && b.rect[3] < zone.height);
    expect(obstacles.length).toBeGreaterThanOrEqual(12);
    expect(obstacles.length).toBeLessThanOrEqual(20);
    for (const o of obstacles) {
      expect(o.rect![0]).toBeGreaterThan(box.x0 + 5);
      expect(o.rect![2]).toBeLessThan(box.x1 - 5);
    }
    const g = new G.Game(undefined, 'sorceress');
    g.startRun('survivals:a1r1', 0, 7);
    expect(g.world.grid.isBlockedCell(2, 70)).toBe(true);
    expect(buildArena(ROUND_BY_ID.a1r7, 7).box.x1 - buildArena(ROUND_BY_ID.a1r7, 7).box.x0).toBe(56);
    vi.resetModules();
  });

  it('cut from the D2 map when present: the most open window, closed by invisible walls; too closed a map: synthetic arena', async () => {
    await activate();
    const { registerD2Map } = await import('../../../../src/data/d2map');
    const { buildArena } = await import('../../sim/arena');
    const { ROUND_BY_ID } = await import('../../data/chapters');
    // a 200 × 200 unit map, all walls but an open square of 80 units at (100, 60)
    const cols = 400;
    const blocked = new Uint8Array(cols * cols).fill(1);
    for (let y = 120; y < 280; y++) for (let x = 200; x < 360; x++) blocked[y * cols + x] = 0;
    registerD2Map({ id: 'a1_bloodmoor', cases: [80, 80], units: [200, 200], grid: { cols, rows: cols, blocked, opaque: new Uint8Array(cols * cols) }, objects: [], landmarks: {}, raw: {} });
    const { zone, box, cut } = buildArena(ROUND_BY_ID.a1r1, 1);
    expect(cut).toBe(true);
    expect(zone.d2Map?.id).toBe('a1_bloodmoor');
    // lot 307: the 90-unit window (the open square 80 units wide: 79 % of it open)
    expect(box.x1 - box.x0).toBe(90);
    expect(box.x0).toBeGreaterThanOrEqual(90);
    expect(box.x1).toBeLessThanOrEqual(190);
    expect(zone.start.x).toBeGreaterThan(box.x0);
    expect(zone.start.x).toBeLessThan(box.x1);
    expect(zone.blockers).toHaveLength(4);
    registerD2Map({
      id: 'a1_coldplains',
      cases: [80, 80],
      units: [200, 200],
      grid: { cols, rows: cols, blocked: new Uint8Array(cols * cols).fill(1), opaque: new Uint8Array(cols * cols) },
      objects: [],
      landmarks: {},
      raw: {},
    });
    expect(buildArena(ROUND_BY_ID.a1r2, 1).cut).toBe(false);
    vi.resetModules();
  });
});

/** Plays `seconds` of a round with an invulnerable character that does not fight; `each` after every step */
async function playRound(round: string, seconds: number, opts: { density?: number; seed?: number; level?: number; each?: (g: import('../../../../src/sim/game').Game, sec: number) => void } = {}) {
  const env = await activate();
  const g = new env.G.Game(undefined, 'sorceress');
  // 15 levels above the round's recommended level: the director keeps the whole target table (pressure 1)
  g.character.level = opts.level ?? 16;
  if (opts.density) g.settings.mods = { survivals: { density: opts.density } };
  expect(g.startRun(`survivals:${round}`, 0, opts.seed ?? 3)).toBe(true);
  const events: { sec: number; e: import('../../../../src/sim/events').SimEvent }[] = [];
  for (let t = 0; t < seconds * 25; t++) {
    const ev = g.step(1);
    for (const e of ev) events.push({ sec: t / 25, e });
    g.world.player.hp = g.world.player.hpMax;
    opts.each?.(g, t / 25);
  }
  return { ...env, g, events };
}

describe('A round of the Blood Moor', () => {
  it('no monster for 3 s, then the target; monsters of Levels.txt at the zone level, aggressive; events on time; Corpsefire as the checkpoint', async () => {
    let maxAlive = 0;
    const seen = new Map<number, number>();
    const { g, events } = await playRound('a1r1', 485, {
      each: (gg, sec) => {
        const live = gg.world.monsters.filter((m) => !m.dead && m.team === 1 && !m.pet && !m.isSummon);
        maxAlive = Math.max(maxAlive, live.length);
        if (sec === 2.96) expect(live.length).toBe(0);
        if (sec === 60) expect(live.length).toBeGreaterThanOrEqual(18); // lot 292b: cheaper mana, a straight chase: more kills
        if (sec < 300) for (const m of live) if (m.rank === 'normal') seen.set(m.mlvl, (seen.get(m.mlvl) ?? 0) + 1);
        if (sec === 100) for (const m of live) expect(m.aggro).toBe(true);
      },
    });
    expect(maxAlive).toBeLessThanOrEqual(90 + 6);
    expect([...seen.keys()]).toEqual([1]);
    const at = (pred: (e: (typeof events)[number]['e']) => boolean) => events.find((x) => pred(x.e))?.sec;
    expect(at((e) => e.t === 'mapEvent' && e.text === 'Des champions approchent !')).toBeCloseTo(148, 0);
    expect(at((e) => e.t === 'mapEvent' && e.text === 'Encerclement !')).toBeCloseTo(177, 0);
    expect(at((e) => e.t === 'bossSpawn')).toBeCloseTo(270, 0);
    const boss = events.filter((x) => x.e.t === 'bossSpawn').at(-1)!;
    expect(boss.sec).toBeCloseTo(480, 0);
    expect(boss.e.t === 'bossSpawn' && boss.e.name).toBe('Corpsefire');
    const cf = g.world.monsters.find((m) => m.name === 'Corpsefire')!;
    expect(cf.runBoss).toBe(true);
    expect(cf.rank).toBe('unique');
    // the checkpoint: the milestone, the run's end, the Den of Evil's skill point
    const points = g.character.skillPoints;
    g.world.killMonster(cf, g.world.player);
    const ev = g.step(1);
    expect(ev.some((e) => e.t === 'runComplete' && e.runId === 'survivals:a1r1')).toBe(true);
    expect(g.character.progression.milestones['survivals:cp:0:a1r1']).toBeGreaterThan(0);
    expect(g.character.skillPoints).toBe(points + 1);
    expect(g.world.objects.some((o) => o.kind === 'portal' && o.ref === 'town')).toBe(true);
    vi.resetModules();
  }, 60_000);

  it('the live monster cap of the mode is kept (density 60)', async () => {
    let maxAlive = 0;
    await playRound('a1r1', 200, {
      density: 60,
      each: (gg) => {
        maxAlive = Math.max(maxAlive, gg.world.monsters.filter((m) => !m.dead && m.team === 1 && !m.pet && !m.isSummon).length);
      },
    });
    expect(maxAlive).toBeLessThanOrEqual(60 + 4);
    expect(maxAlive).toBeGreaterThanOrEqual(50);
    vi.resetModules();
  }, 60_000);

  it('deterministic: the same seed gives the same monsters at the same places', async () => {
    const trace = async () => {
      const out: string[] = [];
      await playRound('a1r2', 40, { seed: 11, each: (gg, sec) => sec % 5 === 0 && out.push(gg.world.monsters.map((m) => `${m.def.id}@${m.x.toFixed(2)},${m.y.toFixed(2)}`).join(';')) });
      vi.resetModules();
      return out.join('|');
    };
    expect(await trace()).toBe(await trace());
  }, 60_000);
});

describe('Rounds in the runs registry', () => {
  it('rounds of the five acts, hidden from the base lists, back to the town of the act, resumed after a reload, zone levels of Levels.txt, the act boss last', async () => {
    const { G } = await activate();
    const { RUNS } = await import('../../../../src/data/runs');
    const rounds = RUNS.filter((r) => r.id.startsWith('survivals:'));
    const per = { 1: 7, 2: 7, 3: 5, 4: 3, 5: 7 };
    expect(rounds.map((r) => r.id)).toEqual(Object.entries(per).flatMap(([a, n]) => Array.from({ length: n }, (_, i) => `survivals:a${a}r${i + 1}`)));
    for (const r of rounds) expect(r).toMatchObject({ hidden: true, campaign: `act${r.id[11]}`, botSkip: true, abandonOnDeath: true });
    // lot 298: a Campaign round resumed when the app is opened again, a Run never (a new run from 0)
    const C = await import('../../../../src/sim/character');
    const camp = C.newCharacter(undefined, 'sorceress');
    const runC = C.newCharacter(undefined, 'sorceress');
    (await import('../../sim/runmode')).setVariant(runC, 'run');
    for (const r of rounds) {
      expect(typeof r.resumeOnLoad).toBe('function');
      expect((r.resumeOnLoad as (c: unknown) => boolean)(camp)).toBe(true);
      expect((r.resumeOnLoad as (c: unknown) => boolean)(runC)).toBe(false);
    }
    expect(rounds[0].zoneLevel).toEqual([1, 36, 67]);
    expect(rounds[0].firstClear).toEqual({ skillPoints: 1 });
    expect(rounds[6]).toMatchObject({ boss: 'andariel', rewardAs: 'andariel', zoneLevel: [12, 43, 73] });
    const byId = Object.fromEntries(rounds.map((r) => [r.id.slice(10), r]));
    expect(byId.a2r7).toMatchObject({ boss: 'duriel', rewardAs: 'tombs', zoneKey: 'tombs' });
    expect(byId.a3r5).toMatchObject({ boss: 'mephisto', rewardAs: 'mephisto' });
    expect(byId.a4r3).toMatchObject({ boss: 'diablo', rewardAs: 'chaos', zoneLevel: [28, 58, 85] });
    expect(byId.a5r7).toMatchObject({ boss: 'baal', rewardAs: 'baal', zoneLevel: [43, 66, 85] });
    // Act IV from the base's level plans and runs (the `levels` registry has no Act IV)
    expect(byId.a4r1.zoneLevel).toEqual([26, 56, 83]);
    expect(byId.a2r1.firstClear).toEqual({ skillPoints: 1 });
    expect(byId.a4r1.firstClear).toEqual({ skillPoints: 2 });
    expect(byId.a3r3.firstClear).toEqual({ statPoints: 5 });
    expect(byId.a5r3.firstClear).toEqual({ resAll: 10 });
    // Diablo II's rune treasure class of the place: the base's run of the same zone
    expect(byId.a1r1.zoneKey).toBe('tristram');
    expect(byId.a1r6.zoneKey).toBe('andariel');
    expect(byId.a5r1.zoneKey).toBe('nihlathak');
    const g = new G.Game(undefined, 'sorceress');
    expect(g.runOptions().some((o) => o.run.id.startsWith('survivals:'))).toBe(false);
    vi.resetModules();
  });

  it('the boss round: guards, then Andariel at 1:30, whose death ends the act', async () => {
    const { g, events } = await playRound('a1r7', 92);
    const b = events.find((x) => x.e.t === 'bossSpawn');
    expect(b?.sec).toBeCloseTo(90, 0);
    const andy = g.world.monsters.find((m) => m.def.id === 'andariel' && !m.dead)!;
    expect(andy.rank).toBe('boss');
    g.world.killMonster(andy, g.world.player);
    expect(g.step(1).some((e) => e.t === 'runComplete')).toBe(true);
    expect(g.character.progression.milestones['survivals:cp:0:a1r7']).toBeGreaterThan(0);
    vi.resetModules();
  }, 60_000);
});
