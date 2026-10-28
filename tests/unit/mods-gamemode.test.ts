/**
 * Game-mode hooks of the base (lot 273, S0): run director (`RunDef.director`), rules `game.autopilot`, `skills.offer`,
 * `skills.manualLearn`, `death.xpPenalty`, `ui.orientation`, `render.zoom`, `render.limits`, UI slot `run.complete` and the level-up gate. Each hook is
 * inert in the base (checked in the active ruleset of the suite), and works once a demo game mode replaces it (fresh module graph).
 */
import { describe, expect, it, vi } from 'vitest';
import type { ModApi, ModManifest } from '../../src/mods/api';
import { RULES } from '../../src/mods/rules';
import { Game } from '../../src/sim/game';
import { deathPenalty, gainXp, xpToReach } from '../../src/sim/progression';
import { LevelUpGate } from '../../src/mods/ui';
import { deathXpLoss } from '../../src/mods/d2/progression';

/** Fresh module graph with the base and a demo game mode `demo` on `d2`, registered by `register`; the ruleset `d2+demo` is active */
async function withMode(register: (api: ModApi) => void) {
  vi.resetModules();
  const D = await import('../../src/mods/discover');
  const manifest: ModManifest = { id: 'demo', name: 'Demo', version: '1.0.0', kind: 'gamemode', rulesets: ['d2'], load: () => Promise.resolve({ default: { register } }) };
  D.provideManifests([manifest]);
  const A = await import('../../src/mods/activate');
  await A.activateRuleset('d2+demo');
  const G = await import('../../src/sim/game');
  const P = await import('../../src/sim/progression');
  const R = await import('../../src/mods/rules');
  G.Game.resetIds();
  return { G, P, R, A };
}

describe('Game-mode hooks: inert in the base', () => {
  it('no offer, no autopilot effect, free tree, D2 death penalty, landscape, zoom unchanged', () => {
    const g = new Game(undefined, 'sorceress');
    g.startRun('tristram', 0, 1);
    gainXp(g.world, xpToReach(4));
    g.step(2);
    expect(g.character.level).toBe(4);
    expect(g.offers).toEqual([]);
    expect(g.currentOffer()).toBeNull();
    expect(g.takeOffer(null)).toBe(false);
    expect(g.rerollOffer()).toBe(false);
    expect(RULES['skills.manualLearn'](g)).toBeNull();
    expect(g.canLearnManually('ice_bolt')).toEqual(g.canLearn('ice_bolt'));
    expect(RULES['ui.orientation'](g)).toBe('landscape');
    expect(RULES['render.zoom'](g, 1.25, { width: 390, height: 844 })).toBe(1.25);
    expect(RULES['render.limits'](g)).toEqual({ corpses: Infinity, missiles: Infinity, floaters: 40, particles: 1 });
    expect(g.world.run?.director).toBeNull();
    expect(() => RULES['game.autopilot'](g)).not.toThrow();
  });

  it('death penalty of D2: 0 % in Normal, 5 % in Nightmare, 10 % in Hell of the level span, never below the level', () => {
    const c = { level: 10, xp: xpToReach(10) + 3000 };
    const span = xpToReach(11) - xpToReach(10);
    expect(deathXpLoss(c, 0)).toBe(0);
    expect(deathXpLoss(c, 1)).toBe(Math.floor(Math.min(3000, span * 0.05)));
    expect(deathXpLoss(c, 2)).toBe(Math.floor(Math.min(3000, span * 0.1)));
    expect(deathXpLoss({ level: 10, xp: xpToReach(10) }, 2)).toBe(0);
    const g = new Game(undefined, 'sorceress');
    g.character.level = 30;
    g.character.xp = xpToReach(31) - 1;
    const before = g.character.xp;
    const lost = deathPenalty(g.character, 2);
    expect(lost).toBe(Math.floor((xpToReach(31) - xpToReach(30)) * 0.1));
    expect(g.character.xp).toBe(before - lost);
  });
});

describe('Game-mode hooks: a mode replaces them', () => {
  it('run director: created once at the first step, ticked every step, told of each kill', async () => {
    const calls = { made: 0, ticks: 0, kills: [] as string[] };
    const { G } = await withMode((api) => {
      const base = api.runs.get('tristram')!;
      api.runs.add({
        ...base,
        id: 'demo:arena',
        hidden: true,
        director: () => {
          calls.made++;
          return { tick: () => void calls.ticks++, onKill: (_w, m) => void calls.kills.push(m.def.id) };
        },
      });
    });
    const g = new G.Game(undefined, 'sorceress');
    expect(g.startRun('demo:arena', 0, 1)).toBe(true);
    g.step(10);
    expect(calls.made).toBe(1);
    expect(calls.ticks).toBe(10);
    const m = g.world.monsters.find((x) => !x.dead && x.team === 1);
    if (m) {
      g.world.run!.onKill(g.world, m);
      expect(calls.kills).toEqual([m.def.id]);
    }
    vi.resetModules();
  });

  it('a run that abandons on death: back in town without a portal to it (a base run keeps it)', async () => {
    const { G } = await withMode((api) => {
      const base = api.runs.get('tristram')!;
      api.runs.add({ ...base, id: 'demo:arena', hidden: true, abandonOnDeath: true });
    });
    const g = new G.Game(undefined, 'sorceress');
    g.startRun('demo:arena', 0, 1);
    g.step(5);
    g.world.killPlayer();
    g.step(25 * 4);
    expect(g.mode).toBe('town');
    expect(g.hasSuspendedRun).toBe(false);
    g.startRun('tristram', 0, 1);
    g.step(5);
    g.world.killPlayer();
    g.step(25 * 4);
    expect(g.hasSuspendedRun).toBe(true);
    vi.resetModules();
  });

  it('a run that resumes on load: back in the same run after a reload, with its director state (`SaveData.run.modState`)', async () => {
    const made: { restored: unknown }[] = [];
    const { G } = await withMode((api) => {
      const base = api.runs.get('tristram')!;
      api.runs.add({
        ...base,
        id: 'demo:arena',
        hidden: true,
        resumeOnLoad: true,
        director: () => {
          const d = { n: 0, restored: undefined as unknown, tick: () => void d.n++, snapshot: () => ({ n: d.n }), restore: (s: unknown) => void (d.restored = s) };
          made.push(d);
          return d;
        },
      });
    });
    const S = await import('../../src/sim/save');
    const g = new G.Game(undefined, 'sorceress');
    g.startRun('demo:arena', 0, 1);
    g.step(30);
    const save = g.toSave();
    expect(save.run).toMatchObject({ runId: 'demo:arena', modState: { n: 30 } });
    const text = S.serialize(save);
    const h = new G.Game(S.deserialize(text), 'sorceress');
    expect(h.mode).toBe('run');
    expect(h.runDef?.id).toBe('demo:arena');
    expect(h.world.tick).toBe(g.world.tick);
    expect(made).toHaveLength(2);
    expect(made[1].restored).toEqual({ n: 30 });
    expect(h.world.run?.director).toBe(made[1]);
    // rebuilt once from the same save (the application, once the act's maps are loaded), never after the first step
    expect(h.rebuildResumedRun()).toBe(true);
    expect(made).toHaveLength(3);
    expect(made[2].restored).toEqual({ n: 30 });
    expect(h.world.tick).toBe(g.world.tick);
    expect(h.rebuildResumedRun()).toBe(false);
    // left behind a portal: resumed, then back in town with the portal to it
    g.enterTown();
    const t = new G.Game(S.deserialize(S.serialize(g.toSave())), 'sorceress');
    expect(t.mode).toBe('town');
    expect(t.hasSuspendedRun).toBe(true);
    vi.resetModules();
  });

  it('save format of the base unchanged: no `modState`, a base run is not resumed on load (D2), the text read back is written back identical', async () => {
    const S = await import('../../src/sim/save');
    const g = new Game(undefined, 'sorceress');
    g.startRun('tristram', 0, 1);
    g.step(30);
    const save = g.toSave();
    expect(save.run).not.toBeNull();
    expect('modState' in save.run!).toBe(false);
    const text = S.serialize(save);
    const h = new Game(S.deserialize(text), 'sorceress');
    expect(h.mode).toBe('town');
    expect(h.rebuildResumedRun()).toBe(false);
    // a save already in town: written back byte for byte
    const town = S.serialize(h.toSave());
    expect(S.serialize(new Game(S.deserialize(town), 'sorceress').toSave())).toBe(town);
  });

  it('autopilot: called before every simulation step, may drive the input', async () => {
    let n = 0;
    const { G } = await withMode((api) =>
      api.rules.set('game.autopilot', () => (g) => {
        n++;
        g.world.input.moveX = 1;
        g.world.input.moveY = 0;
      }),
    );
    const g = new G.Game(undefined, 'sorceress');
    g.startRun('tristram', 0, 1);
    const x0 = g.world.player.x;
    g.step(25);
    expect(n).toBe(25);
    expect(g.world.player.x).toBeGreaterThan(x0);
    vi.resetModules();
  });

  it('skill offers: one per level gained (queued), taken, kept or rerolled; the tree can be reserved to the offers', async () => {
    const { G, P } = await withMode((api) => {
      api.rules.set('skills.offer', () => (g, level, reroll) => (reroll > 0 ? ['charged_bolt'] : level >= 2 ? ['ice_bolt', 'fire_bolt', 'charged_bolt'] : null));
      api.rules.set('skills.manualLearn', () => (g) => (g.mode === 'run' ? 'Choose at level-up' : null));
    });
    const g = new G.Game(undefined, 'sorceress');
    g.startRun('tristram', 0, 1);
    P.gainXp(g.world, P.xpToReach(4));
    g.step(1);
    expect(g.offers.map((o) => o.level)).toEqual([2, 3, 4]);
    expect(g.character.skillPoints).toBe(3);
    // the tree is reserved to the offers during a run
    expect(g.canLearnManually('ice_bolt')).toEqual({ ok: false, reason: 'Choose at level-up' });
    // a skill outside the offer is refused, the offer stays
    expect(g.takeOffer('teleport')).toBe(false);
    expect(g.offers.length).toBe(3);
    expect(g.takeOffer('ice_bolt')).toBe(true);
    expect(g.character.skills.ice_bolt).toBe(1);
    expect(g.character.skillPoints).toBe(2);
    // keep the point
    expect(g.takeOffer(null)).toBe(true);
    expect(g.character.skillPoints).toBe(2);
    expect(g.currentOffer()?.level).toBe(4);
    expect(g.rerollOffer()).toBe(true);
    expect(g.currentOffer()).toEqual({ level: 4, ids: ['charged_bolt'], rerolls: 1 });
    expect(g.takeOffer('charged_bolt')).toBe(true);
    expect(g.offers).toEqual([]);
    expect(g.character.skillPoints).toBe(1);
    g.enterTown();
    expect(g.canLearnManually('ice_bolt').ok).toBe(true);
    vi.resetModules();
  });

  it('bots answer the offers with their skill plan, and keep their points while the tree is reserved', async () => {
    const { G, P } = await withMode((api) => {
      api.rules.set('skills.offer', () => () => ['fire_bolt', 'ice_bolt', 'charged_bolt']);
      api.rules.set('skills.manualLearn', () => () => 'reserved');
    });
    const { BotBrain } = await import('../../src/sim/bot/brain');
    const g = new G.Game(undefined, 'sorceress');
    g.startRun('tristram', 0, 1);
    P.gainXp(g.world, P.xpToReach(3));
    g.step(1);
    g.character.skillPoints += 1; // a quest point, without an offer
    new BotBrain(g, { build: 'cold' }).spendSkillPoints();
    expect(g.offers).toEqual([]);
    expect(g.character.skills.ice_bolt).toBe(2);
    expect(g.character.skillPoints).toBe(1);
    vi.resetModules();
  });

  it('death penalty, orientation and zoom rules', async () => {
    const { G, R } = await withMode((api) => {
      api.rules.set('death.xpPenalty', () => () => 0);
      api.rules.set('ui.orientation', () => () => 'any');
      api.rules.set('render.zoom', () => (_g, base, view) => (view.height > view.width ? base * 0.5 : base));
    });
    const g = new G.Game(undefined, 'sorceress');
    g.character.level = 30;
    g.character.xp = 5_000_000;
    expect((await import('../../src/sim/progression')).deathPenalty(g.character, 2)).toBe(0);
    expect(g.character.xp).toBe(5_000_000);
    expect(R.RULES['ui.orientation'](g)).toBe('any');
    expect(R.RULES['render.zoom'](g, 1, { width: 390, height: 844 })).toBe(0.5);
    expect(R.RULES['render.zoom'](g, 1, { width: 844, height: 390 })).toBe(1);
    vi.resetModules();
  });

  it('UI slot `run.complete` accepts a game mode contribution', async () => {
    const seen: string[] = [];
    await withMode((api) => api.ui.add('run.complete', ({ summary }) => void seen.push(summary.runId)));
    const U = await import('../../src/mods/ui');
    expect(U.uiOwners('run.complete')).toEqual(['demo']);
    for (const f of U.contributions('run.complete'))
      f({ game: {} as never, host: {} as never, screen: { open: () => ({ close: () => undefined }) }, summary: { runId: 'demo:arena', seconds: 1, kills: 0, difficulty: 0 } });
    expect(seen).toEqual(['demo:arena']);
    vi.resetModules();
  });
});

describe('Level-up gate (one mod screen at a time)', () => {
  it('runs a level at once when no screen is open, queues the others until the screen closes', () => {
    const shown: number[] = [];
    const gate = new LevelUpGate((l) => {
      shown.push(l);
      gate.screenOpened();
    });
    gate.push(2);
    gate.push(3);
    gate.push(4);
    expect(shown).toEqual([2]);
    expect(gate.waiting).toEqual([3, 4]);
    gate.screenClosed();
    expect(shown).toEqual([2, 3]);
    gate.screenClosed();
    expect(shown).toEqual([2, 3, 4]);
    expect(gate.screensOpen).toBe(1);
    gate.screenClosed();
    gate.screenClosed();
    expect(gate.screensOpen).toBe(0);
  });

  it('without a screen, every level runs in order', () => {
    const shown: number[] = [];
    const gate = new LevelUpGate((l) => void shown.push(l));
    gate.push(5);
    gate.push(6);
    expect(shown).toEqual([5, 6]);
    expect(gate.waiting).toEqual([]);
  });
});
