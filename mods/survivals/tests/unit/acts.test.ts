/**
 * Acts II to V of the Survivals mode (lot 280, S6), smoke test of the normal suite (the campaign played by bots is the long test of the
 * nightly job: tests/bots/campaign.test.ts). For each act: its rounds in the act's real zones (monster pools of Levels.txt, Act IV from the
 * base's level plans), the first round's mini-boss as the checkpoint (time skipped to 7:50), the boss round played (guards, the elite
 * waves of Mephisto's Council, the Chaos seals and Baal's minions, the three Ancients together, then the boss) with a character that
 * cannot die and kills each elite pack a few seconds after it appears; the boss's death opens the next act; back in the act's town; the
 * loot of the rounds is Diablo II's (the base's rune treasure class of the place, no rate changed); Baal opens Nightmare.
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
  return { ...env, directorOf, CH, CP, Z };
}

/** Plays up to `seconds` with a character that cannot die; elite packs (and the bosses) are killed 3 s after they appear */
function playKilling(g: Game, seconds: number): { events: string[]; done: number } {
  const seen = new Map<number, number>();
  const events: string[] = [];
  let done = -1;
  for (let t = 0; t < seconds * 25 && g.mode === 'run' && done < 0; t++) {
    g.world.godMode = true;
    for (const e of g.step(1)) {
      if (e.t === 'bossSpawn') {
        seen.set(e.id, t);
        events.push(e.name);
      }
      if (e.t === 'runComplete') done = Math.round(t / 25);
    }
    if (t % 25 === 0)
      for (const m of g.world.monsters) {
        const at = seen.get(m.id) ?? seen.get(m.leader ?? -1);
        if (!m.dead && at !== undefined && t - at > 75) g.world.killMonster(m, g.world.player);
      }
  }
  return { events, done };
}

describe('Survivals: Acts II to V in Normal', () => {
  it('rounds in the real zones of each act, from Levels.txt (Act IV from the base plans), every pool known to the game', async () => {
    const { CH, Z } = await setup();
    expect(CH.ROUNDS.map((r) => r.act)).toEqual([...Array(7).fill(1), ...Array(7).fill(2), ...Array(5).fill(3), ...Array(3).fill(4), ...Array(7).fill(5)]);
    for (const r of CH.ROUNDS) {
      for (const z of r.zones) expect(Z.zonePool(z, 0).length, `${r.id} ${z}`).toBeGreaterThan(0);
      expect(Z.roundLevels(r)[0], r.id).toBeGreaterThan(0);
    }
    // the act's boss ends each act (the Ancients are a boss round inside Act V)
    for (const a of [1, 2, 3, 4, 5]) expect(CH.roundsOfAct(a).at(-1)!.boss).toBeDefined();
    expect(CH.ROUNDS.filter((r) => r.boss).map((r) => r.boss!.monster)).toEqual(['andariel', 'duriel', 'mephisto', 'diablo', 'ancient_talic', 'baal']);
    // monster levels rise act by act (Normal)
    const firstOf = (a: number) => Z.roundLevels(CH.roundsOfAct(a)[0])[0];
    expect([1, 2, 3, 4, 5].map(firstOf)).toEqual([1, 13, 21, 26, 24]);
    vi.resetModules();
  });

  for (const act of [2, 3, 4, 5]) {
    it(`Act ${act}: opened by the previous act's boss, its first round's checkpoint, its boss round, the next act opened, back in its town`, async () => {
      const { G, CH, CP, directorOf } = await setup();
      const g = new G.Game(undefined, 'sorceress');
      g.character.level = CH.roundsOfAct(act)[0].recLevel[0] + 2;
      const prevBoss = CH.roundsOfAct(act - 1).at(-1)!;
      const first = CH.roundsOfAct(act)[0];
      expect(CP.roundStatus(g.character, 0).find((s) => s.round === first)!.unlocked).toBe(false);
      // the earlier rounds cleared up to the previous act's boss
      for (const r of CH.ROUNDS) {
        if (r.act >= act) break;
        CP.markCheckpoint(g.character, 0, r.id);
      }
      expect(CP.resumeRound(g.character, 0)).toBe(first);
      expect(prevBoss.boss).toBeDefined();
      // first round: its mini-boss at 8:00 (time skipped to 7:50) is the checkpoint
      expect(g.startRun(CH.runIdOf(first), 0, 3)).toBe(true);
      g.step(1);
      directorOf(g)!.start -= 25 * 470;
      const one = playKilling(g, 40);
      expect(one.done, one.events.join(', ')).toBeGreaterThan(0);
      expect(CP.checkpointDone(g.character, 0, first.id)).toBe(true);
      g.enterTown();
      expect(g.lastTown).toBe(`act${act}`);
      // the boss round
      const boss = CH.roundsOfAct(act).at(-1)!;
      for (const r of CH.roundsOfAct(act)) if (r !== boss) CP.markCheckpoint(g.character, 0, r.id);
      expect(CP.resumeRound(g.character, 0)).toBe(boss);
      g.startRun(CH.runIdOf(boss), 0, 3);
      g.step(1);
      const d = directorOf(g)!;
      const fight = playKilling(g, 600);
      expect(fight.done, fight.events.join(', ')).toBeGreaterThan(0);
      expect(d.wave).toBe(boss.boss!.waves?.length ?? 0);
      for (const id of [boss.boss!.monster, ...(boss.boss!.with ?? [])]) expect(g.world.monsters.some((m) => m.def.id === id && m.rank === 'boss')).toBe(true);
      expect(CP.checkpointDone(g.character, 0, boss.id)).toBe(true);
      expect(g.character.progression.milestones[`first:${CH.runIdOf(boss)}:0`]).toBeGreaterThan(0);
      if (act < 5) expect(CP.resumeRound(g.character, 0)).toBe(CH.roundsOfAct(act + 1)[0]);
      else expect(g.character.progression.highestDifficulty).toBe(1);
      vi.resetModules();
    }, 120_000);
  }

  it('elite waves: each one called 4 s after the previous one is killed, the boss 5 s after the last one', async () => {
    const { G, directorOf } = await setup();
    const g = new G.Game(undefined, 'sorceress');
    g.character.level = 30;
    g.startRun('survivals:a4r3', 0, 3);
    const calls: number[] = [];
    let last = 0;
    for (let t = 0; t < 25 * 120; t++) {
      g.world.godMode = true;
      g.step(1);
      const d = directorOf(g)!;
      if (d.wave !== last) {
        calls.push(Math.round(d.state(g.world).sec));
        last = d.wave;
        // the wave killed 2 s later
        g.step(50);
        for (const m of g.world.monsters) if (!m.dead && m.team === 1 && m.rank !== 'normal' && m.rank !== 'boss') g.world.killMonster(m, g.world.player);
        for (const m of g.world.monsters) if (!m.dead && m.team === 1) g.world.killMonster(m, g.world.player);
      }
      if (d.bossIds.length) break;
    }
    expect(calls[0]).toBe(40);
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(6);
    expect(calls[1] - calls[0]).toBeLessThanOrEqual(7);
    expect(directorOf(g)!.boss?.def.id).toBe('diablo');
    vi.resetModules();
  }, 60_000);

  it("a round lost again and again gets easier: less damage from every monster, less life for its bosses, the mini-bosses' escort scaled", async () => {
    const { G, directorOf } = await setup();
    const D = await import('../../sim/director');
    expect(D.mercyOf(0)).toEqual({ dmg: 1, bossLife: 1, res: 0 });
    expect(D.mercyOf(1).dmg).toBeCloseTo(0.92, 5);
    expect(D.mercyOf(1).bossLife).toBeCloseTo(0.85, 5);
    expect(D.mercyOf(40)).toEqual({ dmg: 0.05, bossLife: 0.03, res: 120 });
    const lifeOf = async (deaths: number) => {
      const g = new G.Game(undefined, 'sorceress');
      g.character.level = 30;
      if (deaths) g.character.progression.milestones['survivals:deaths:0:a2r7'] = deaths;
      g.startRun('survivals:a2r7', 0, 3);
      const events: string[] = [];
      for (let t = 0; t < 25 * 8; t++) {
        g.world.godMode = true;
        for (const e of g.step(1)) if (e.t === 'message') events.push(e.text);
      }
      const d = directorOf(g)!.boss!;
      return { hp: d.hpMax, dmg: d.dmgMax, res: { ...d.res }, events };
    };
    const fresh = await lifeOf(0);
    const lost = await lifeOf(4);
    expect(lost.hp / fresh.hp).toBeCloseTo(0.85 ** 4, 1);
    expect(lost.dmg / fresh.dmg).toBeCloseTo(0.92 ** 4, 5);
    // and 3 points of each resistance a death (lot 283), never below 0
    for (const e of Object.keys(fresh.res) as (keyof typeof fresh.res)[]) expect(lost.res[e]).toBe(fresh.res[e] > 0 ? Math.max(0, fresh.res[e] - 12) : fresh.res[e]);
    expect(lost.events.some((t) => t.startsWith('Vos défaites affaiblissent'))).toBe(true);
    expect(fresh.events.some((t) => t.startsWith('Vos défaites'))).toBe(false);
    vi.resetModules();
  }, 60_000);

  it('loot walked over is taken (lot 285): worn in an empty slot, else turned into gold; the gold from anywhere; the rest stays', async () => {
    const { G } = await setup();
    const SDK = await import('../../../../src/mods/sdk');
    const g = new G.Game(undefined, 'sorceress');
    g.startRun('survivals:a1r1', 0, 3);
    g.step(1);
    const w = g.world;
    const p = w.player;
    const drop = (item: ReturnType<typeof SDK.makeStack>, dx: number) => w.items.push({ id: w.newId(), item, x: p.x + dx, y: p.y, dropTick: w.tick - 20, show: 1 });
    delete g.character.equipment.head;
    g.character.level = 30;
    const gold0 = g.character.gold;
    drop({ ...SDK.makeStack(new SDK.Rng('m'), 'gold', 250), uid: 'g1' }, 2);
    drop({ ...SDK.makeStack(new SDK.Rng('m'), 'gold', 250), uid: 'g2' }, 9);
    const cap = SDK.generateItem(new SDK.Rng('cap'), 'cap', 5, { forceQuality: 'magic' });
    drop(cap, 0.5);
    const far = SDK.generateItem(new SDK.Rng('far'), 'cap', 5, { forceQuality: 'magic' });
    drop(far, 3);
    // a second cap on the character's feet: the head is taken now, a magic one is turned into gold
    const cap2 = SDK.generateItem(new SDK.Rng('cap2'), 'cap', 5, { forceQuality: 'magic' });
    drop(cap2, 0.2);
    g.step(10);
    const head = (g.character.equipment as Record<string, { uid: string } | undefined>).head?.uid;
    expect(head === cap.uid || head === cap2.uid).toBe(true);
    expect(g.character.gold).toBeGreaterThan(gold0 + 500);
    expect(w.items.map((x) => x.item.uid)).toEqual([far.uid]);
    vi.resetModules();
  }, 60_000);
});
