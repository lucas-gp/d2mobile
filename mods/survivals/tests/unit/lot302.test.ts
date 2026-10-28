// @vitest-environment happy-dom
/**
 * Lot 302, Act I of the Run tightened: the threat carried by the act's clock to the end (late curves on the monsters' life, damage and
 * speed), the steps between zones smoothed (`zoneDmg`, `zoneLife`), the lasting skills (traps, Fissure) on floors of their own, the
 * Paladin's Run plan (Zeal, one point of Sacrifice).
 */
import { describe, expect, it } from 'vitest';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const RM = await import('../../sim/runmode');
  const ST = await import('../../sim/state');
  const AP = await import('../../sim/autopilot');
  const run = (cls = 'barbarian') => {
    const g = new env.G.Game(undefined, cls as never);
    for (const f of env.U.contributions('create.character')) f({ game: g });
    ST.stateOf(g).autoStart = false;
    RM.startRunMode(g, 1, 0);
    g.takeOffer(null);
    return g;
  };
  return { ...env, RM, AP, run };
}

type Flow = { actSec0: number };

describe('Survivals lot 302: the threat grows with the act to its end', () => {
  it('the late curves rise to the end, every zone carries its own life factor', async () => {
    const { RM } = await setup();
    const r = RM.FLOW.ramp;
    for (const pts of [r.lifeAt!, r.dmgAt!, r.speedAt!]) {
      for (let i = 1; i < pts.length; i++) expect(pts[i][1]).toBeGreaterThan(pts[i - 1][1]);
      expect(pts[pts.length - 1][0]).toBeGreaterThanOrEqual(700);
    }
    RM.FLOW.zones.forEach(([id], i) => expect(RM.actFlow(1, 0, i)!.ramp!.zoneLife).toBe(RM.FLOW.zoneLife[id] ?? 1));
  });

  it('a monster brought late in the act is quicker and tougher than one brought at its start', async () => {
    const { run } = await setup();
    const g = run('barbarian');
    const sample = (secs: number) => {
      const seen = new Set(g.world.monsters.map((m) => m.id));
      const out: { speed: number; hp: number; id: string }[] = [];
      for (let t = 0; t < 25 * secs; t++) {
        g.world.godMode = true;
        g.step(1);
        for (const m of g.world.monsters) {
          if (seen.has(m.id) || m.team !== 1 || m.rank !== 'normal') continue;
          seen.add(m.id);
          out.push({ speed: m.speed, hp: m.hpMax, id: m.def.id });
        }
      }
      return out;
    };
    const early = sample(20);
    // the same zone, its clock moved to late in the act (the Dark Wood's time, the curves' steep part)
    const dir = g.world.run!.director as unknown as { opts: { flow: Flow } };
    dir.opts.flow.actSec0 = 640;
    const late = sample(10);
    expect(early.length).toBeGreaterThan(5);
    expect(late.length).toBeGreaterThan(5);
    // by species: the speed and life of the same monster
    const ratio = (k: 'speed' | 'hp') => {
      const rs: number[] = [];
      for (const l of late) {
        const e = early.filter((x) => x.id === l.id);
        if (e.length) rs.push(l[k] / (e.reduce((a, x) => a + x[k], 0) / e.length));
      }
      return rs.sort((a, b) => a - b)[Math.floor(rs.length / 2)];
    };
    expect(ratio('speed')).toBeGreaterThan(1.5);
    expect(ratio('hp')).toBeGreaterThan(10);
  }, 60000);
});

describe('Survivals lot 302: lasting skills and the Paladin', () => {
  it('the traps and the Druid’s lasting fires wait longer than a bolt; Sacrifice swings slower than the other strikes', async () => {
    const { RM } = await setup();
    for (const id of ['wake_of_fire', 'wake_of_inferno', 'charged_bolt_sentry', 'lightning_sentry', 'eruption', 'molten_boulder']) {
      expect(RM.minCastOf(id, false), id).toBeGreaterThanOrEqual(2 * RM.minCastOf('fire_bolt', false));
    }
    // lot 303: Zeal's own floor raised (0.6 s): Sacrifice compared with the other strikes' (the weapon's attack)
    expect(RM.minCastOf('sacrifice', true)).toBeGreaterThan(2 * RM.minCastOf('attack', true));
  });

  it('the Run’s Paladin plan takes one point of Sacrifice, then Zeal; the cards avoid Sacrifice', async () => {
    const { AP, run } = await setup();
    const g = run('paladin');
    const plan = AP.planOf(g);
    const sac = plan.filter(([id]) => id === 'sacrifice');
    expect(sac.map(([, n]) => n)).toEqual([1]);
    expect(plan.findIndex(([id]) => id === 'zeal')).toBe(plan.findIndex(([id]) => id === 'sacrifice') + 1);
    expect(AP.RUN_AVOID.paladin).toContain('sacrifice');
  });
});
