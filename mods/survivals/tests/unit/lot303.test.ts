// @vitest-environment happy-dom
/**
 * Lot 303, Act I of the Run as a slope of gear tiers: the Paladin's Zeal always among the cards (`FLOW.signature`), Sacrifice swung only
 * while the hero is well (`SELF_HARM_ABOVE`), the Barbarian's Run plan (Axe Mastery, Concentrate), a zone's field filling up slowly
 * (`FLOW.entry`), the late damage curve climbing through the Dark Wood (`ramp.dmgAt`).
 */
import { describe, expect, it } from 'vitest';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const RM = await import('../../sim/runmode');
  const ST = await import('../../sim/state');
  const AP = await import('../../sim/autopilot');
  const OF = await import('../../sim/offer');
  const run = (cls = 'paladin') => {
    const g = new env.G.Game(undefined, cls as never);
    for (const f of env.U.contributions('create.character')) f({ game: g });
    ST.stateOf(g).autoStart = false;
    RM.startRunMode(g, 1, 0);
    g.takeOffer(null);
    return g;
  };
  return { ...env, RM, AP, OF, run };
}

describe('Survivals lot 303: the Paladin', () => {
  it('Zeal is among the cards of every level from 12 until its last rank, in a Run only', async () => {
    const { RM, OF, run } = await setup();
    expect(RM.FLOW.signature.paladin).toBe('zeal');
    const g = run('paladin');
    const c = g.character;
    c.level = 12;
    Object.assign(c.skills, { might: 5, smite: 1, sacrifice: 1, prayer: 2, defiance: 2 });
    for (let lvl = 12; lvl < 12 + RM.FLOW.skillRank; lvl++) {
      for (let r = 0; r < 4; r++) expect(OF.drawOffer(g, lvl, r), `level ${lvl} draw ${r}`).toContain('zeal');
      c.skills.zeal = (c.skills.zeal ?? 0) + 1;
      c.level++;
    }
    // its last rank reached: no more Zeal card
    expect(OF.drawOffer(g, c.level, 0)).not.toContain('zeal');
    // the Campaign's cards keep their draw
    RM.setVariant(c, 'campaign');
    delete c.skills.zeal;
    const seen = new Set<string>();
    for (let r = 0; r < 30; r++) for (const id of OF.drawOffer(g, 12, r) ?? []) seen.add(id);
    expect(seen.size).toBeGreaterThan(3);
  });

  it('the rotation never swings Sacrifice under 70 % of the hero’s life', async () => {
    const { AP, run } = await setup();
    const g = run('paladin');
    const c = g.character;
    c.level = 12;
    Object.assign(c.skills, { might: 5, smite: 1, sacrifice: 1, zeal: 1 });
    g.world.refreshPlayer();
    const p = g.world.player;
    let swung = 0;
    for (let t = 0; t < 25 * 40; t++) {
      p.hp = Math.min(p.hp, p.hpMax * 0.6);
      const before = p.hp;
      g.step(1);
      if (p.cast?.skill === 'sacrifice' || g.world.input.cast?.skill === 'sacrifice') swung++;
      // never killed by the field in this test: the life put back under the threshold each step
      if (p.dead || before <= 1) break;
    }
    expect(AP.SELF_HARM_ABOVE).toBe(0.7);
    expect(swung).toBe(0);
  }, 60000);
});

describe('Survivals lot 303: the Barbarian and the act’s curve', () => {
  it('the Run’s Barbarian raises Axe Mastery (his starter hand axe), Double Swing and Concentrate, never Sword Mastery', async () => {
    const { AP, RM, run } = await setup();
    const g = run('barbarian');
    const plan = AP.planOf(g);
    expect(RM.STARTER_KIT.barbarian.weapon).toBe('hand_axe');
    const ids = plan.map(([id]) => id);
    expect(ids).toContain('axe_mastery');
    expect(ids).toContain('concentrate');
    expect(ids).not.toContain('sword_mastery');
    expect(Math.max(...plan.filter(([id]) => id === 'double_swing').map(([, n]) => n))).toBe(RM.FLOW.skillRank);
  });

  it('a zone fills up over 40 s at least; the monsters’ damage keeps climbing through the Dark Wood and the lair', async () => {
    const { RM } = await setup();
    const [first, rate] = RM.FLOW.entry;
    const full = RM.flowDensity(400);
    expect((full - first) / rate).toBeGreaterThanOrEqual(40);
    const dmg = RM.FLOW.ramp.dmgAt!;
    const at = (t: number) => {
      for (let i = 1; i < dmg.length; i++) if (t <= dmg[i][0]) return dmg[i - 1][1] + ((dmg[i][1] - dmg[i - 1][1]) * (t - dmg[i - 1][0])) / (dmg[i][0] - dmg[i - 1][0]);
      return dmg[dmg.length - 1][1];
    };
    // the Dark Wood (6:12 to 9:16) and the lair each about a third harder by their end than at their entry
    expect(at(550) / at(380)).toBeGreaterThan(1.3);
    expect(at(740) / at(560)).toBeGreaterThan(1.3);
  });
});
