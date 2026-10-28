// @vitest-environment happy-dom
/**
 * Lot 309, the owner's returns: "Charged Bolt seems to spam its spells too fast, check every spell" and "the other game brings the monsters
 * in small packs rather than at random a little everywhere". The cadence's principle (no spell cast again before twice its own gesture,
 * a several-missile skill's bolts counted: `FLOW.boltRate` a second at most, the others folded into their damage) and the field's packs
 * (sim/director.ts `drawPackSize`, `packPoints`, `fill`).
 */
import { describe, expect, it } from 'vitest';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const RM = await import('../../sim/runmode');
  const ST = await import('../../sim/state');
  const CA = await import('../../sim/cadence');
  const DI = await import('../../sim/director');
  const V = await import('../../sim/view');
  const SDK = await import('../../../../src/mods/sdk');
  const run = (cls: string) => {
    const g = new env.G.Game(undefined, cls as never);
    g.character.name = `Lot 309 ${cls}`;
    for (const f of env.U.contributions('create.character')) f({ game: g });
    ST.stateOf(g).autoStart = false;
    RM.startRunMode(g, 1, 0);
    g.takeOffer(null);
    return g;
  };
  return { ...env, RM, CA, DI, V, SDK, run };
}

const CLASSES = ['amazon', 'assassin', 'barbarian', 'druid', 'necromancer', 'paladin', 'sorceress'];

describe('Survivals lot 309: the cadence of every skill', () => {
  it('Charged Bolt: its bolts a second capped (4 a cast at 5 points, Diablo II 7), each heavier by as much; 1 point and the base unchanged', async () => {
    const { run, RM, R } = await setup();
    expect(RM.flowMissiles('sorceress', 'charged_bolt', 7)).toBe(4);
    expect(RM.flowMissiles('sorceress', 'charged_bolt', 3)).toBe(3);
    expect(RM.flowMissiles('necromancer', 'teeth', 6)).toBe(6);
    expect(RM.flowMissiles('necromancer', 'teeth', 9)).toBe(6);
    for (const [cls, id] of [
      ['sorceress', 'charged_bolt'],
      ['necromancer', 'teeth'],
    ])
      for (const n of [1, 3, 7, 12, 28]) {
        const k = RM.flowMissiles(cls, id, n);
        expect(k).toBeGreaterThanOrEqual(1);
        expect(k).toBeLessThanOrEqual(n);
        expect(k / RM.spellCooldown(id, cls)).toBeLessThanOrEqual(RM.FLOW.boltRate + 1e-9);
      }
    const g = run('sorceress');
    const w = g.world;
    for (const m of w.monsters) m.dead = true;
    g.character.level = 15;
    const cast = (points: number) => {
      g.character.skills = { charged_bolt: points };
      w.refreshPlayer();
      w.player.cooldowns.charged_bolt = 0;
      w.missiles.length = 0;
      expect(w.sideCast('charged_bolt', w.player.x + 3, w.player.y, 0)).toBe('cast');
      return w.missiles.filter((m) => m.kind === 'charged_bolt' && m.team === 0);
    };
    const five = cast(5);
    expect(five.length).toBe(4);
    // Diablo II's 7 bolts of 4 to 6 at 5 points (the packet's range) folded into 4: each 7/4 heavier
    const { skillDamageRange } = await import('../../../../src/sim/skills');
    const range = skillDamageRange(w, 'charged_bolt');
    for (const b of five) {
      expect(b.dmg.light).toBeGreaterThanOrEqual(range.min * 1.75 - 1e-6);
      expect(b.dmg.light).toBeLessThanOrEqual(range.max * 1.75 + 1e-6);
    }
    expect(cast(1).length).toBe(3);
    // out of Act I's flow (the town): Diablo II's count
    g.enterTown();
    expect(R.RULES['skills.missileCount'](g.world, 'charged_bolt', 7)).toBe(7);
  });

  it('no skill of the seven classes is cast again before twice its gesture (spells) or its swing (strikes); the stomp on its floor', async () => {
    const { run, RM, CA, SDK } = await setup();
    const { castFrames } = await import('../../../../src/sim/skills');
    for (const cls of CLASSES) {
      const g = run(cls);
      g.character.level = 30;
      for (const id of CA.auditedSkills(cls, 30)) {
        const r = CA.castPack(g, id, 5, 6);
        if (!r || r.every === null) continue;
        const melee = id === 'attack' || CA.meleeAttack(cls, id);
        const anim = castFrames(g.world, id) / SDK.TICK_HZ;
        if (melee) expect(r.every, `${cls} ${id}`).toBeGreaterThanOrEqual(RM.minCastOf(id, true) - 1 / SDK.TICK_HZ);
        else expect(r.every, `${cls} ${id}`).toBeGreaterThanOrEqual(Math.max(RM.FLOW.animK * anim, RM.spellCooldown(id, cls)) - 1 / SDK.TICK_HZ);
      }
    }
    expect(RM.minCastOf('shock_wave', true)).toBeGreaterThanOrEqual(1.2);
  });

  it('a cast sets a cooldown of twice its gesture at least, whatever its table', async () => {
    const { RM } = await setup();
    const w = { tick: 100, player: { cooldowns: {} as Record<string, number> } };
    // a spell whose gesture lasts 1.6 s (a slow cast rate) is held 3.2 s, longer than its floor
    RM.floorCast(w, 'fire_bolt', false, 0, 1.6);
    expect(w.player.cooldowns.fire_bolt).toBe(100 + Math.ceil(RM.FLOW.animK * 1.6 * 25));
    // a strike keeps its swing (no cooldown)
    RM.floorCast(w, 'bash', true, 0, 1.6);
    expect(w.player.cooldowns.bash).toBeUndefined();
  });
});

describe('Survivals lot 309: the field in packs', () => {
  it('a pack’s size is drawn by its weight; its points beyond its anchor, within its spread, apart', async () => {
    const { DI, SDK } = await setup();
    const rng = new SDK.Rng('lot309');
    const sizes = [
      [2, 1],
      [4, 3],
    ] as const;
    const n = { 2: 0, 4: 0 } as Record<number, number>;
    for (let i = 0; i < 4000; i++) n[DI.drawPackSize(rng, sizes)]++;
    expect(n[4] / 4000).toBeGreaterThan(0.7);
    expect(n[4] / 4000).toBeLessThan(0.8);
    const at = { x: 20, y: 10 };
    const pts = DI.packPoints(rng, 6, at, 10, 10, 1.6);
    expect(pts.length).toBe(6);
    const c = pts[0];
    expect(Math.hypot(c.x - 10, c.y - 10)).toBeCloseTo(10 + 1.6, 5);
    for (const p of pts) expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeLessThanOrEqual(1.6 + 1e-9);
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThan(0.3);
  });

  it('in Act I’s flow the field comes in packs of one species, together, beyond the screen; without packs one at a time', async () => {
    const { run, RM, V } = await setup();
    const g = run('barbarian');
    const w = () => g.world;
    const born: { id: number; sp: string; x: number; y: number; t: number; on: boolean }[] = [];
    const seen = new Set(w().monsters.map((m) => m.id));
    for (let t = 0; t < 25 * 60; t++) {
      w().godMode = true;
      if (g.offers.length) g.offers.length = 0;
      g.step(1);
      const p = w().player;
      for (const m of w().monsters) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        if (m.team !== 1 || m.rank !== 'normal' || m.pet || m.isSummon) continue;
        born.push({ id: m.id, sp: m.def.id, x: m.x, y: m.y, t: w().tick, on: V.onScreen(m.x - p.x, m.y - p.y) });
      }
    }
    const dir = w().run!.director as unknown as { packLog: number[] };
    const log = dir.packLog;
    expect(log.length).toBeGreaterThan(5);
    const mean = log.reduce((a, b) => a + b, 0) / log.length;
    expect(mean).toBeGreaterThanOrEqual(2.5);
    // the monsters born in the same step and within 4 units of one another: mostly of one species (one pack in `1 / lead` led by another)
    const steps = new Map<number, typeof born>();
    for (const b of born) steps.set(b.t, [...(steps.get(b.t) ?? []), b]);
    const groups: (typeof born)[] = [];
    for (const list of steps.values()) {
      const left = [...list];
      while (left.length) {
        const gr = [left.shift()!];
        for (let i = 0; i < gr.length; i++) for (let k = left.length - 1; k >= 0; k--) if (Math.hypot(left[k].x - gr[i].x, left[k].y - gr[i].y) < 4) gr.push(...left.splice(k, 1));
        groups.push(gr);
      }
    }
    let packs = 0;
    let mono = 0;
    for (const gr of groups) {
      if (gr.length < 3) continue;
      packs++;
      const sp = new Map<string, number>();
      for (const b of gr) sp.set(b.sp, (sp.get(b.sp) ?? 0) + 1);
      if (Math.max(...sp.values()) >= gr.length - 1) mono++;
    }
    expect(packs).toBeGreaterThan(3);
    expect(mono / packs).toBeGreaterThan(0.9);
    // brought beyond the screen (the arena's walls may pull a few in)
    expect(born.filter((b) => !b.on).length / born.length).toBeGreaterThan(0.9);

    // without packs: one at a time (lot 308's trickle)
    const keep = RM.FLOW.packs;
    RM.FLOW.packs = null;
    try {
      const h = run('barbarian');
      for (let t = 0; t < 25 * 20; t++) {
        h.world.godMode = true;
        h.step(1);
      }
      expect((h.world.run!.director as unknown as { packLog: number[] }).packLog.length).toBe(0);
    } finally {
      RM.FLOW.packs = keep;
    }
  });
});
