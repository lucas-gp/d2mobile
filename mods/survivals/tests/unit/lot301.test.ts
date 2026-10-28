// @vitest-environment happy-dom
/**
 * Lot 301, the owner's test of the Run (a screen recording: "when a spell is cast it seems to push the others' cooldown back, so they are
 * never cast together; every spell must be independent, its own cooldown, cast at the same time as another"): no global cap (lot 298's
 * `castGap` gone), no turn between the spells; every spell ready with a target goes off in the same tick (`castReady`), a cast sets only
 * its own cooldown, the skills preview shows each skill's own refresh, and over 60 s each spell is cast about every own cooldown.
 */
import { describe, expect, it } from 'vitest';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const RM = await import('../../sim/runmode');
  const ST = await import('../../sim/state');
  const SDK = await import('../../../../src/mods/sdk');
  const AP = await import('../../sim/autopilot');
  const SS = await import('../../ui/skillstrip');
  const run = (cls = 'sorceress') => {
    const g = new env.G.Game(undefined, cls as never);
    for (const f of env.U.contributions('create.character')) f({ game: g });
    ST.stateOf(g).autoStart = false;
    RM.startRunMode(g, 1, 0);
    g.takeOffer(null);
    return g;
  };
  return { ...env, RM, ST, SDK, AP, SS, run };
}

const SPELLS = ['fire_bolt', 'ice_bolt', 'charged_bolt', 'lightning', 'telekinesis', 'fire_ball'];

/** The hero alone with `skills`, a sandbag 3 units away that never dies nor moves (the arena's monsters gone), god mode */
function alone(g: { world: never } & Record<string, never>, SDK: typeof import('../../../../src/mods/sdk'), skills: string[]) {
  const w = (g as never as { world: import('../../../../src/sim/world').World }).world;
  const c = w.character;
  c.level = 12;
  c.skills = Object.fromEntries(skills.map((id) => [id, 3]));
  (g as never as { offers: unknown[] }).offers.length = 0;
  w.refreshPlayer();
  w.godMode = true;
  for (const m of w.monsters) m.dead = true;
  const p = w.player;
  const bag = SDK.simHooks.spawnMonster(w, 'zombie', p.x + 3, p.y, { rank: 'normal' }, `bag:${w.tick}`)!;
  bag.hpMax = bag.hp = 1e9;
  bag.speed = 0;
  bag.atkCd = bag.atkCd.map(() => 1e9);
  return { w, p, bag };
}

describe('Survivals lot 301: every spell independent', () => {
  it('N spells ready at once all go off in the same tick (no global gap, no turn), beside one another', async () => {
    const { SDK, run, RM } = await setup();
    expect('castGap' in RM.FLOW).toBe(false);
    const g = run('sorceress');
    const { w, p } = alone(g as never, SDK, SPELLS);
    for (const id of SPELLS) p.cooldowns[id] = 0;
    const at: Record<string, number> = {};
    g.onEvent((e) => {
      if (e.t === 'cast' && e.id === p.id && e.skill !== 'attack') at[e.skill] ??= w.tick;
    });
    // the first steps of a zone (its opening) aside: the spells all ready at the tick the hero can act
    let t0 = w.tick;
    for (let i = 0; i < 50 && !Object.keys(at).length; i++) {
      for (const id of SPELLS) p.cooldowns[id] = 0;
      t0 = w.tick;
      g.step(1);
    }
    expect(Object.keys(at).sort()).toEqual([...SPELLS].sort());
    // one and the same tick for all (the events are read after the step)
    for (const id of SPELLS) expect(at[id], id).toBe(at.fire_bolt);
    // each one on its own floor from that tick, none pushed further by the others
    for (const id of SPELLS) expect(p.cooldowns[id] - t0, id).toBe(Math.ceil(RM.minCastOf(id, false) * 25));
  });

  it("A's cast never changes B's next availability (main cast or beside, the rule `skills.onCast`)", async () => {
    const { SDK, run, R } = await setup();
    const g = run('sorceress');
    const { w, p, bag } = alone(g as never, SDK, SPELLS);
    for (const [i, id] of SPELLS.entries()) p.cooldowns[id] = w.tick + 3 + i * 7;
    const before = { ...p.cooldowns };
    // beside (World.sideCast), as the main cast (World.startCast), and the rule called directly
    p.cooldowns.fire_bolt = 0;
    expect(w.sideCast('fire_bolt', bag.x, bag.y, bag.id)).toBe('cast');
    p.cooldowns.ice_bolt = 0;
    expect(w.startCast('ice_bolt', bag.x, bag.y, bag.id)).toBe(true);
    R.RULES['skills.onCast'](w, 'charged_bolt', true);
    for (const id of ['lightning', 'telekinesis', 'fire_ball']) expect(p.cooldowns[id], id).toBe(before[id]);
  });

  it('the skills preview tells each skill its own refresh, never moved back by another cast', async () => {
    const { SDK, SS, run } = await setup();
    const g = run('sorceress');
    const { w, p } = alone(g as never, SDK, SPELLS);
    for (const id of SPELLS) p.cooldowns[id] = 0;
    const castAt: Record<string, number> = {};
    g.onEvent((e) => {
      if (e.t === 'cast' && e.id === p.id) castAt[e.skill] = w.tick;
    });
    const last: Record<string, number> = {};
    for (let t = 0; t < 25 * 10; t++) {
      g.step(1);
      for (const id of SPELLS) {
        const s = SS.refreshShare(castAt[id], p.cooldowns[id] ?? 0, w.tick);
        // the share only goes up between two casts of the skill itself (it starts again from 0 at its own cast)
        if (castAt[id] !== w.tick && last[id] !== undefined) expect(s, `${id} at ${t}`).toBeGreaterThanOrEqual(last[id]);
        last[id] = s;
      }
    }
  });

  it('over 60 s of the act, each spell is cast about every own cooldown (a sorceress with 6 spells, a druid, an assassin)', async () => {
    const { SDK, run, RM, AP } = await setup();
    const cases: [string, string[]][] = [
      ['sorceress', SPELLS],
      ['assassin', ['psychic_hammer', 'fire_blast', 'shock_web', 'charged_bolt_sentry', 'wake_of_fire']],
      ['necromancer', ['teeth', 'bone_spear', 'corpse_explosion']],
    ];
    for (const [cls, skills] of cases) {
      const g = run(cls);
      const { w, p, bag } = alone(g as never, SDK, skills);
      const casts: Record<string, number[]> = {};
      g.onEvent((e) => {
        if (e.t === 'cast' && e.id === p.id) (casts[e.skill] ??= []).push(w.tick);
      });
      for (let t = 0; t < 60 * 25; t++) {
        g.step(1);
        bag.hp = bag.hpMax;
        bag.dead = false;
        bag.x = p.x + 3;
        bag.y = p.y;
        // corpses for Corpse Explosion
        if (t % 50 === 0) {
          const c = SDK.simHooks.spawnMonster(w, 'zombie', p.x + 2, p.y + 1, { rank: 'normal' }, `corpse:${t}`);
          if (c) c.dead = true;
        }
      }
      for (const id of skills) {
        if (!SDK.canCast(w, id).ok && SDK.canCast(w, id).reason) continue;
        const at = casts[id] ?? [];
        // its own floor (the class's factor too, `FLOW.classSpell`)
        const floor = Math.ceil(Math.max(AP.rotationEvery(id) * (RM.FLOW.classSpell[cls] ?? 1), RM.minCastOf(id, false)) * 25);
        const gaps = at.slice(1).map((t, i) => t - at[i]);
        // lot 302: the traps on floors of their own (6.5 s for a Charged Bolt Sentry): as many casts as the floor lets in 60 s
        expect(at.length, `${cls} ${id}`).toBeGreaterThanOrEqual(Math.min(11, Math.floor((60 * 25) / floor) - 1));
        // never under its own floor; the median gap within 2 ticks of it (cast the very tick it is ready)
        expect(Math.min(...gaps), `${cls} ${id}`).toBeGreaterThanOrEqual(floor);
        const med = [...gaps].sort((a, b) => a - b)[gaps.length >> 1];
        expect(med, `${cls} ${id} median ${med} floor ${floor}`).toBeLessThanOrEqual(floor + 2);
      }
    }
  }, 60000);
});

describe('Survivals lot 301: the monsters come in from beyond the screen', () => {
  it('every monster brought (the field, the packs, the encirclement, the boss and its reinforcements) appears off the screen, portrait and landscape', async () => {
    const { run } = await setup();
    const V = await import('../../sim/view');
    const RM = await import('../../sim/runmode');
    const views = [
      { width: 412, height: 915 },
      { width: 960, height: 412 },
    ].map((v) => ({ ...v, zoom: Math.max(0.5, Math.min(1, Math.min(v.width, v.height) / (45.25 * 16))) }));
    for (const v of views) {
      V.setView(v);
      const g = run('barbarian');
      const seen = new Set<number>();
      let n = 0;
      let on = 0;
      let minD = Infinity;
      const kinds = new Set<string>();
      for (const m of g.world.monsters) seen.add(m.id);
      for (let t = 0; t < 25 * 200; t++) {
        const w = g.world;
        w.godMode = true;
        // a quick zone: the encirclement and the mini-boss come sooner
        g.step(1);
        const p = w.player;
        for (const m of w.monsters) {
          if (seen.has(m.id) || m.team !== 1 || m.pet || m.isSummon) continue;
          seen.add(m.id);
          // a monster's own summoning (Diablo II's: a shaman's, a boss's raised dead, next to it) is not the director's
          if (m.rank === 'minion' && m.noLoot) continue;
          seen.add(m.id);
          n++;
          kinds.add(m.rank ?? 'normal');
          minD = Math.min(minD, Math.hypot(m.x - p.x, m.y - p.y));
          if (V.onScreen(m.x - p.x, m.y - p.y, v)) {
            on++;
            kinds.add(`on:${m.rank}:${m.def?.id ?? ''}:${Math.round(w.tick / 25)}s`);
          }
        }
        if (g.world !== w) for (const m of g.world.monsters) seen.add(m.id);
        // a revived corpse (the Fallen's shaman) rises where it fell
        for (const m of w.monsters) if (m.dead) seen.add(m.id);
      }
      const label = `${v.width}x${v.height}: ${n} monsters, ${on} on screen, nearest ${minD.toFixed(1)} u (half diagonal ${V.halfDiagonal(v).toFixed(1)}) ${[...kinds].join(' ')}`;
      if (process.env.SV_LOG) console.log(label);
      expect(n, label).toBeGreaterThan(200);
      // a few drawn back by the arena's walls at most
      expect(on / n, label).toBeLessThanOrEqual(0.02);
      expect(kinds.has('boss') || kinds.has('unique'), label).toBe(true);
      void RM;
    }
    V.setView(V.DEFAULT_VIEW);
  }, 120000);
});

describe('Survivals lot 301: the monsters come straight at the hero', () => {
  it('60 s with 60 monsters: no U-turn without reason, the groups never stuck in one another', async () => {
    const env = await activate();
    const RM = await import('../../sim/runmode');
    const ST = await import('../../sim/state');
    const T = await import('../../sim/turns');
    const C = await import('../../sim/cadence');
    const { withDefaultSettings } = await import('../../../../src/sim/save');
    for (const cls of ['necromancer', 'druid', 'paladin']) {
      const g = new env.G.Game(undefined, cls as never);
      for (const f of env.U.contributions('create.character')) f({ game: g });
      ST.stateOf(g).autoStart = false;
      g.settings = withDefaultSettings({ ...g.settings, mods: { survivals: { control: 'semi', density: 60 } } } as never, true);
      RM.startRunMode(g, 1, 0);
      g.takeOffer(null);
      C.learnForRate(g, 12, 3);
      const r = T.countTurns(g, 60);
      const label = `${cls}: ${JSON.stringify(r)}`;
      expect(r.monsters, label).toBeGreaterThan(40);
      // a U-turn a monster every 10 minutes at most (fleeing a fear cast and the shooters' distance aside)
      expect(r.perMinute, label).toBeLessThanOrEqual(0.1);
      expect(r.causes.target ?? 0, label).toBe(0);
      expect(r.stuck, label).toBeLessThanOrEqual(0.02);
    }
  }, 120000);
});
