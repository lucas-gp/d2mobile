// @vitest-environment happy-dom
/**
 * Lot 305, the owner's returns on the Run: the acts and difficulties opened as in Diablo II (Andariel opens Act II, Baal the next
 * difficulty; a save opened through lot 292's shortcut loses nothing), 10 seconds between every two zones whatever ended the first (and no
 * portal cutting them short), the act's clock unchanged, the act boss's victory kept over its zone (no town), the hub's first zone
 * prepared, the town under the hub never loaded, the elites marked.
 */
import { describe, expect, it } from 'vitest';
import type { Game } from '../../../../src/sim/game';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const RM = await import('../../sim/runmode');
  const ST = await import('../../sim/state');
  const CP = await import('../../sim/checkpoints');
  const create = () => {
    const g = new env.G.Game(undefined, 'sorceress');
    g.character.name = 'Lot 305';
    for (const f of env.U.contributions('create.character')) f({ game: g });
    ST.stateOf(g).autoStart = false;
    return g;
  };
  const clearZone = (g: Game) => {
    const run = g.world.run!;
    const round = RM.actRounds(1).find((r) => `survivals:${r.id}` === g.runDef!.id)!;
    CP.markCheckpoint(g.character, g.difficulty, round.id);
    RM.noteZoneCleared(g.character, round);
    run.completed = true;
    run.completeTick = g.world.tick;
  };
  const steps = (g: Game, seconds: number) => {
    for (let t = 0; t < seconds * 25; t++) {
      g.world.godMode = true;
      g.step(1);
    }
  };
  /** The act's boss beaten in difficulty `d` (its last round's checkpoint, as the director marks it) */
  const beat = (g: Game, act: number, d: number) => {
    const rounds = RM.actRounds(act);
    CP.markCheckpoint(g.character, d, rounds[rounds.length - 1].id);
  };
  return { ...env, RM, ST, CP, create, clearZone, steps, beat };
}

describe('Survivals lot 305: the acts and difficulties opened as in Diablo II', () => {
  it('Andariel opens Act II only; Baal in Normal opens Nightmare, in Nightmare Hell; the locks tell why', async () => {
    const { RM, create, beat } = await setup();
    const g = create();
    const c = g.character;
    expect(RM.unlockedActs(c)).toEqual([{ act: 1, d: 0 }]);
    expect(RM.lockReason(c, 2, 0)).toBe('Vaincre Andariel (Normal)');
    expect(RM.lockReason(c, 1, 1)).toBe('Vaincre Baal en Normal');
    beat(g, 1, 0);
    expect(RM.actUnlocked(c, 2, 0)).toBe(true);
    expect(RM.actUnlocked(c, 1, 1)).toBe(false);
    expect(RM.lockReason(c, 2, 0)).toBeNull();
    expect(RM.lockReason(c, 3, 0)).toBe('Vaincre Duriel (Normal)');
    for (const act of [2, 3, 4]) beat(g, act, 0);
    expect(RM.actUnlocked(c, 5, 0)).toBe(true);
    expect(RM.actUnlocked(c, 1, 1)).toBe(false);
    beat(g, 5, 0);
    expect(RM.actUnlocked(c, 1, 1)).toBe(true);
    expect(RM.actUnlocked(c, 2, 1)).toBe(false);
    expect(RM.actUnlocked(c, 1, 2)).toBe(false);
    expect(RM.lockReason(c, 1, 2)).toBe('Vaincre Baal en Cauchemar');
  });

  it('a save that opened Nightmare through Andariel (lot 292): its records kept, Nightmare closed until Baal, the hub back on Act I', async () => {
    const { RM, create, beat } = await setup();
    const g = create();
    const c = g.character;
    const m = c.progression.milestones;
    beat(g, 1, 0);
    // what lot 292 wrote: the difficulty told opened, a Nightmare run played and chosen last
    m[RM.OPENED_KEY] = 1;
    m[RM.recKey(1, 1, 'runs')] = 3;
    m[RM.recKey(1, 1, 'wins')] = 1;
    m['survivals:last:act'] = 1;
    m['survivals:last:d'] = 1;
    const before = JSON.stringify(m);
    expect(RM.actUnlocked(c, 1, 1)).toBe(false);
    expect(RM.lastChoice(c)).toEqual({ act: 1, d: 0 });
    expect(RM.startRunMode(g, 1, 1)).toBe(false);
    // nothing rewritten: the records stay for when Baal opens it
    expect(JSON.stringify(m)).toBe(before);
    // a character that reached Nightmare in the base's own progression keeps it
    c.progression.highestDifficulty = 1;
    expect(RM.actUnlocked(c, 1, 1)).toBe(true);
  });
});

describe('Survivals lot 305: 10 seconds between every two zones', () => {
  it('the wait is 10 s after a mini-boss and after a zone ended on its time; the act’s clock keeps its 4 s a passage', async () => {
    const { RM } = await setup();
    expect(RM.RUN.bossWait).toBe(10);
    expect(RM.RUN.nextAfter).toBe(10);
    expect(RM.FLOW.clockGap).toBe(4);
    // the act's clock as measured before (lots 302-303): the zones' lengths and 4 s a passage
    expect(RM.actFlow(1, 0, 1)!.actSec0).toBe(RM.FLOW.zones[0][1] + 4);
    expect(RM.actFlow(1, 0, 4, true)!.actSec0).toBe(RM.FLOW.zones.slice(0, 4).reduce((n, z) => n + z[1] + 4, 0));
  });

  it('a cleared zone has no portal out (the automatic control walked into it 4-5 s after Blood Raven); the next zone after 10 s', async () => {
    const { RM, create, clearZone, steps } = await setup();
    const g = create();
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    g.takeOffer(null);
    clearZone(g);
    g.world.objects.push({ id: g.world.newId(), kind: 'portal', x: g.world.player.x, y: g.world.player.y, radius: 1, used: false, ref: 'town', label: 'Portail' });
    steps(g, 1);
    expect(g.world.objects.some((o) => o.kind === 'portal' && o.ref === 'town')).toBe(false);
    steps(g, 8);
    expect(g.runDef?.id).toBe('survivals:a1r1');
    expect(Math.ceil(RM.zoneWaitLeft(g)!)).toBe(1);
    steps(g, 2);
    expect(g.runDef?.id).toBe('survivals:a1r2');
    // a zone ended on its time waits as long
    const w = g.world;
    (w.run!.director as { endedByTime?: boolean }).endedByTime = true;
    w.run!.completed = true;
    w.run!.completeTick = w.tick;
    expect(RM.zoneWait(g)).toBe(10);
  });
});

describe('Survivals lot 305: the act boss’s victory over its zone, the hub’s first zone prepared', () => {
  it('Andariel slain: the end kept over her lair (no town), "Replay" and "Next act" start from there; the hub prepares the first zone', async () => {
    const { RM, ST, R, create, clearZone, steps } = await setup();
    const g = create();
    // in the hub: the first zone of the act offered is named (its graphics prepared), the town under it is never seen
    expect(g.mode).toBe('town');
    expect(R.RULES['render.zoneHidden'](g)).toBe(true);
    expect(R.RULES['game.nextZone'](g)?.id).toBe('survivals:a1r1');
    expect(RM.startRunMode(g, 1, 0)).toBe(true);
    g.takeOffer(null);
    expect(R.RULES['render.zoneHidden'](g)).toBe(false);
    expect(R.RULES['render.eliteMarks'](g.world)).toBe(true);
    for (let i = 0; i < RM.runZones(1, 0).length - 1; i++) {
      clearZone(g);
      steps(g, RM.RUN.bossWait + 1);
    }
    expect(g.runDef?.id).toBe('survivals:a1r7');
    const lair = g.world;
    clearZone(g);
    steps(g, RM.RUN.endAfter + 1);
    expect(g.mode).toBe('run');
    expect(g.world).toBe(lair);
    const st = ST.stateOf(g);
    expect(st.endHere?.outcome).toBe('victory');
    expect(st.endHere?.nextAct).toBe(2);
    expect(RM.runActive(g.character)).toBe(false);
    // the next act from the lair, at once (its maps are the app's: `UiHost.loadActMaps`)
    expect(RM.startRunMode(g, 2, 0)).toBe(true);
    expect(st.endHere).toBeNull();
    expect(g.runDef?.id).toBe(`survivals:${RM.runZones(2, 0)[0].id}`);
  });

  it('the elites are marked in the mode’s arenas only (rule `render.eliteMarks`; the base: none)', async () => {
    const { R, create, RM } = await setup();
    const g = create();
    expect(R.RULES['render.eliteMarks'](g.world)).toBe(false);
    RM.startRunMode(g, 1, 0);
    expect(R.RULES['render.eliteMarks'](g.world)).toBe(true);
  });
});
