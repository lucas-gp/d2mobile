/**
 * A round resumed after the app was closed (lot 279, S4b): the round in progress is kept in the save (`SaveData.run` with the world, and
 * `modState`: the director's state), and loading the character puts it back in the same round, at the same second, with the same events
 * done and to come, the same bosses, the rerolls of the round; then the round goes on to its checkpoint. The save stays version 7: the
 * field is optional, absent from every save of the base (checked in tests/unit/mods-gamemode.test.ts), and an imported save with it passes
 * the import checks. A save of a round without the field (written before this lot) resumes the round from its start.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Game } from '../../../../src/sim/game';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const S = await import('../../../../src/sim/save');
  const C = await import('../../../../src/sim/save-check');
  const { directorOf } = await import('../../ui/hud');
  const reload = (g: Game): Game => {
    const text = S.serialize(g.toSave());
    return new env.G.Game(C.parseImportedSave(text), g.character.classId);
  };
  return { ...env, S, directorOf, reload };
}

/** Steps with a character that cannot die (the rounds' content is not what is tested here) */
function play(g: Game, seconds: number): void {
  for (let t = 0; t < seconds * 25 && g.mode === 'run'; t++) {
    g.world.godMode = true;
    g.step(1);
  }
}

describe('Survivals: a round resumed after the app is closed', () => {
  it('same round, same second, same events, same rerolls; the save stays version 7 and passes the import checks', async () => {
    const { G, S, directorOf, reload } = await setup();
    const g = new G.Game(undefined, 'sorceress');
    g.settings.mods = { survivals: { control: 'auto', density: 60 } };
    g.startRun('survivals:a1r1', 0, 5);
    play(g, 200);
    const d = directorOf(g)!;
    d.rerolls.free = false;
    d.rerolls.paid = 2;
    const save = g.toSave();
    expect(save.version).toBe(7);
    expect(S.SAVE_VERSION).toBe(7);
    expect(save.run?.modState).toMatchObject({ v: 1, fired: expect.arrayContaining(['ch', 'ch-warn']), rerolls: { free: false, paid: 2 } });
    const h = reload(g);
    expect(h.mode).toBe('run');
    expect(h.runDef?.id).toBe('survivals:a1r1');
    expect(h.campaignActive).toBe('act1');
    const e = directorOf(h)!;
    expect(e).not.toBe(d);
    expect(e.state(h.world)).toMatchObject({ sec: d.state(g.world).sec, spawned: d.spawned, next: d.state(g.world).next, checkpoint: false });
    expect(e.rerolls).toEqual({ free: false, paid: 2 });
    expect(e.snapshot()).toEqual(d.snapshot());
    expect(h.settings.mods?.survivals).toMatchObject({ control: 'auto', density: 60 });
    // the round goes on: the encirclement at 3:00 already done is not done again, the unique comes at 4:30
    const before = h.world.monsters.filter((m) => m.rank === 'unique').length;
    play(h, 80);
    expect(e.state(h.world).sec).toBeGreaterThan(270);
    expect(h.world.monsters.filter((m) => m.rank === 'unique').length).toBeGreaterThan(before);
    vi.resetModules();
  }, 120_000);

  it('the mini-boss out when the app closed: still there after the reload, its death is the checkpoint', async () => {
    const { G, directorOf, reload } = await setup();
    const g = new G.Game(undefined, 'sorceress');
    g.startRun('survivals:a1r1', 0, 5);
    play(g, 482);
    const boss = directorOf(g)!.boss!;
    expect(boss.name).toBe('Corpsefire');
    const h = reload(g);
    const b = directorOf(h)!.boss!;
    expect(b.id).toBe(boss.id);
    expect(b.runBoss).toBe(true);
    h.world.killMonster(b, h.world.player);
    expect(h.step(1).some((ev) => ev.t === 'runComplete')).toBe(true);
    expect(h.character.progression.milestones['survivals:cp:0:a1r1']).toBeGreaterThan(0);
    // in the overtime: resumed in the overtime
    play(h, 30);
    const o = reload(h);
    expect(directorOf(o)!.state(o.world)).toMatchObject({ checkpoint: true, next: null });
    vi.resetModules();
  }, 120_000);

  it('a boss round between two elite waves: the waves go on from the next one, then the boss', async () => {
    const { G, directorOf, reload } = await setup();
    const g = new G.Game(undefined, 'sorceress');
    g.character.level = 40;
    g.startRun('survivals:a5r7', 0, 5);
    play(g, 31);
    const d = directorOf(g)!;
    expect(d.wave).toBe(1);
    for (const m of g.world.monsters) if (!m.dead && m.team === 1) g.world.killMonster(m, g.world.player);
    play(g, 1);
    const h = reload(g);
    const e = directorOf(h)!;
    expect(e.wave).toBe(1);
    const kills = () => {
      for (const m of h.world.monsters) if (!m.dead && m.team === 1 && !m.pet && !m.isSummon && m.rank !== 'boss') h.world.killMonster(m, h.world.player);
    };
    for (let i = 0; i < 60 && e.wave < 5; i++) {
      play(h, 5);
      kills();
    }
    expect(e.wave).toBe(5);
    for (let i = 0; i < 10 && !e.bossIds.length; i++) {
      play(h, 3);
      kills();
    }
    expect(e.boss?.def.id).toBe('baal');
    vi.resetModules();
  }, 180_000);

  it('a round saved without the director state (before lot 279): resumed, its clock starting again', async () => {
    const { G, S, directorOf } = await setup();
    const g = new G.Game(undefined, 'sorceress');
    g.startRun('survivals:a1r2', 0, 5);
    play(g, 60);
    const save = g.toSave();
    delete save.run!.modState;
    const h = new G.Game(S.deserialize(S.serialize(save)), 'sorceress');
    expect(h.mode).toBe('run');
    expect(directorOf(h)!.state(h.world).sec).toBe(0);
    vi.resetModules();
  }, 60_000);

  it('dead in the round: nothing to resume (the round is lost), back in town', async () => {
    const { G, reload } = await setup();
    const g = new G.Game(undefined, 'sorceress');
    g.startRun('survivals:a1r1', 0, 5);
    g.step(10);
    g.world.killPlayer();
    g.step(1);
    expect(g.toSave().run).toBeNull();
    expect(reload(g).mode).toBe('town');
    vi.resetModules();
  });
});
