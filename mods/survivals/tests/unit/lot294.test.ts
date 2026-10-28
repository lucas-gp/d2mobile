/**
 * Lot 294, the owner's requests for Act I's flow of the Run: no mana (cost 0, gauge hidden, kept full), the cadence's floors (no skill cast
 * quicker than `FLOW.minCast`), every learned skill cast in turn (Leap), the level curve and the chests, fewer and better drops, the
 * monsters' missiles aimed ahead of a walking hero, the hero's missiles through the fodder; the base's hooks inert without the mode.
 */
import { describe, expect, it } from 'vitest';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const RM = await import('../../sim/runmode');
  const ST = await import('../../sim/state');
  const SDK = await import('../../../../src/mods/sdk');
  const create = (cls = 'barbarian') => {
    const g = new env.G.Game(undefined, cls as never);
    for (const f of env.U.contributions('create.character')) f({ game: g });
    ST.stateOf(g).autoStart = false;
    return g;
  };
  const run = (cls = 'barbarian') => {
    const g = create(cls);
    RM.startRunMode(g, 1, 0);
    g.takeOffer(null);
    return g;
  };
  return { ...env, RM, ST, SDK, create, run };
}

describe('Survivals lot 294: no mana in Act I’s flow', () => {
  it('skills cost nothing, the mana stays full, the gauge is hidden; town and the base keep theirs', async () => {
    const { R, RM, SDK, create, run } = await setup();
    const town = create('sorceress');
    expect(R.RULES['skills.manaCost'](town.world, 'charged_bolt', 6)).toBe(6);
    const g = run('sorceress');
    const w = g.world;
    expect(RM.inFlow(w)).toBe(true);
    expect(R.RULES['skills.manaCost'](w, 'charged_bolt', 6)).toBe(0);
    g.character.skills = { charged_bolt: 5 };
    w.refreshPlayer();
    expect(SDK.skillManaCost(w, 'charged_bolt')).toBe(0);
    w.player.mana = 0;
    g.step(1);
    expect(w.player.mana).toBe(w.player.manaMax);
    const { hudHidden } = await import('../../ui/hud');
    expect(hudHidden(g)).toContain('mana');
    const { hudHiddenCss } = await import('../../../../src/ui/hud-parts');
    expect(hudHiddenCss(['mana'])).toContain('.orb.mana');
    expect(hudHidden(g)).toContain('pcbar');
    // the level-up cards tell no mana cost in the flow
    const { cardFigures } = await import('../../ui/levelup');
    expect(cardFigures(g, 'charged_bolt').some((f) => /mana/i.test(f.label))).toBe(false);
    expect(cardFigures(g, 'charged_bolt').length).toBeGreaterThan(0);
  });
});

describe('Survivals lot 294: cadence', () => {
  it('no attack nor skill of any class is cast quicker than its floor (`FLOW.minCast`)', async () => {
    const { RM, SDK, run } = await setup();
    const C = await import('../../sim/cadence');
    const rows: string[] = [];
    for (const cls of ['amazon', 'assassin', 'barbarian', 'druid', 'necromancer', 'paladin', 'sorceress']) {
      const g = run(cls);
      g.character.level = 15;
      for (const id of C.measuredSkills(cls, 15)) {
        const r = C.castEvery(g, id, 8, 4);
        if (!r || r.every === null) continue;
        const floor = RM.minCastOf(id, C.meleeAttack(cls, id));
        rows.push(`${cls}:${id}`);
        expect(r.every, `${cls} ${id}`).toBeGreaterThanOrEqual(floor - 1 / SDK.TICK_HZ - 1e-9);
      }
    }
    // the owner's examples: Charged Bolt every 0.6 s at most, Teeth 1.2 s
    expect(RM.minCastOf('charged_bolt', false)).toBeGreaterThanOrEqual(0.5);
    expect(RM.minCastOf('teeth', false)).toBeGreaterThanOrEqual(1.2);
    expect(rows.length).toBeGreaterThan(40);
  }, 120000);
});

describe('Survivals lot 294: every learned skill in turn', () => {
  it('a Barbarian who learned Leap and Howl leaps at a group and howls, walking or not', async () => {
    const { run } = await setup();
    for (const control of ['auto', 'semi']) {
      const g = run('barbarian');
      g.settings.mods = { ...g.settings.mods, survivals: { ...(g.settings.mods?.survivals ?? {}), control } };
      g.character.level = 10;
      g.character.skills = { bash: 3, leap: 1, howl: 1 };
      g.world.refreshPlayer();
      const casts: Record<string, number> = {};
      for (let t = 0; t < 40 * 25; t++) {
        g.world.godMode = true;
        if (control === 'semi') {
          g.world.input.moveX = Math.cos(t / 60);
          g.world.input.moveY = Math.sin(t / 60);
        }
        for (const e of g.step(1)) if (e.t === 'cast' && e.id === g.world.player.id) casts[e.skill] = (casts[e.skill] ?? 0) + 1;
        if (g.offers.length) g.takeOffer(null);
      }
      expect(casts.leap ?? 0, `${control} ${JSON.stringify(casts)}`).toBeGreaterThan(0);
      expect(casts.howl ?? 0, control).toBeGreaterThan(0);
      // lot 307: walking in circles in the 90-unit arena the hero meets fewer monsters in reach in 40 s (the 64-unit one pulled the
      // spawns in along its border, on the screen): he still strikes; standing (automatic) his Bash stays his main blow
      if (control === 'auto') expect(casts.bash ?? 0, control).toBeGreaterThan(casts.leap ?? 0);
      else expect(casts.bash ?? 0, control).toBeGreaterThan(0);
    }
  }, 60000);
});

describe('Survivals lot 294: levels', () => {
  it('the level curve of the other game, the chests 1 and 2 levels', async () => {
    const { RM } = await setup();
    // lot 296 (the other game measured again: level 5 at 1:00, 8 at 1:30, 10-11 at 2:10-2:30); lot 300: quicker, level 30 by 11:30
    expect(RM.flowLevel(0)).toBe(1);
    expect(RM.flowLevel(12)).toBeGreaterThanOrEqual(2);
    expect(RM.flowLevel(60)).toBeGreaterThanOrEqual(5);
    expect(RM.flowLevel(140)).toBeGreaterThanOrEqual(8);
    expect(RM.flowLevel(690)).toBe(30);
    // then one every 20 to 60 s
    const per = (690 - 240) / (RM.flowLevel(690) - RM.flowLevel(240));
    expect(per).toBeGreaterThanOrEqual(20);
    expect(per).toBeLessThanOrEqual(60);
    expect(RM.FLOW.chest.unique).toBeGreaterThanOrEqual(1);
    expect(RM.FLOW.chest.miniboss).toBeGreaterThanOrEqual(2);
  });

  it('a hero who kills nothing still reaches the curve’s level', async () => {
    const { RM, run } = await setup();
    const g = run('sorceress');
    for (let t = 0; t < 60 * 25; t++) {
      for (const m of g.world.monsters) if (m.team === 1) m.dead = true;
      g.world.godMode = true;
      g.step(1);
      if (g.offers.length) g.takeOffer(null);
    }
    expect(g.character.level).toBeGreaterThanOrEqual(RM.flowLevel(58));
  }, 30000);
});

describe('Survivals lot 294: drops (lot 300: by a budget of the act’s time, see lot300.test.ts)', () => {
  it('the fodder keeps its items within the budget, an elite one at most; a magic item kept is rare about a third of the time', async () => {
    const { run, SDK } = await setup();
    const L = await import('../../sim/loot');
    const g = run('barbarian');
    const w = g.world;
    const fodder = { rank: 'normal' } as never;
    const elite = { rank: 'champion' } as never;
    const mk = (n: number) => Array.from({ length: n }, (_, i) => SDK.generateItem(new SDK.Rng(`t${i}`), 'short_sword', 10, { forceQuality: 'magic' }));
    const a = mk(600);
    L.flowDrops(w, fodder, a);
    expect(a.length).toBeLessThanOrEqual(1);
    let rares = 0;
    let n = 0;
    for (let k = 0; k < 400; k++) {
      const one = mk(1);
      L.flowDrops(w, elite, one);
      n += one.length;
      rares += one.filter((it) => it.quality === 'rare').length;
      expect(one.length).toBeLessThanOrEqual(1);
    }
    expect(n / 400).toBeGreaterThan(L.FLOW_LOOT.eliteKeep * 0.8);
    expect(rares / n).toBeGreaterThan(L.FLOW_LOOT.rareShare * 0.7);
    expect(rares / n).toBeLessThan(L.FLOW_LOOT.rareShare * 1.3);
  });
});

describe('Survivals lot 294: missiles', () => {
  it('base: no lead nor piercing; the flow: the archers aim ahead, the hero’s bolts and arrows pass through the fodder', async () => {
    const { R, run, create } = await setup();
    const town = create();
    expect(R.RULES['ai.missileLead'](town.world, {} as never)).toBe(0);
    expect(R.RULES['combat.missilePierce'](town.world, 'arrow')).toBe(0);
    const g = run('barbarian');
    expect(R.RULES['ai.missileLead'](g.world, {} as never)).toBeGreaterThan(0);
    expect(R.RULES['combat.missilePierce'](g.world, 'fire_bolt')).toBe(2);
    expect(R.RULES['combat.missilePierce'](g.world, 'magic_arrow')).toBe(4);
  });

  it('an archer 7 units away hits a hero walking straight', async () => {
    const { run, SDK } = await setup();
    for (const lead of [false, true]) {
      const g = run('paladin');
      const RM = await import('../../sim/runmode');
      const keep = RM.FLOW.missileLead;
      if (!lead) RM.FLOW.missileLead = 0;
      const w = g.world;
      for (const m of w.monsters) m.dead = true;
      const p = w.player;
      const shooter = SDK.simHooks.spawnMonster(w, 'dark_ranger', p.x, p.y + 7, { rank: 'normal' }, `t-archer-${lead}`)!;
      shooter.hpMax = shooter.hp = 1e6;
      shooter.speed = 0;
      const hp0 = w.stats.damageTaken;
      let shots = 0;
      const seen = new Set<number>();
      for (let t = 0; t < 8 * 25; t++) {
        for (const m of w.monsters) if (m !== shooter && m.team === 1) m.dead = true;
        p.hp = p.hpMax;
        w.input.moveX = t % 100 < 50 ? 1 : -1;
        w.input.moveY = 0;
        w.step();
        for (const ms of w.missiles) if (ms.team === 1 && !seen.has(ms.id)) (seen.add(ms.id), shots++);
        shooter.x = p.x;
      }
      RM.FLOW.missileLead = keep;
      expect(shots, `lead ${lead}`).toBeGreaterThan(2);
      if (lead) expect(w.stats.damageTaken - hp0).toBeGreaterThan(0);
    }
  });
});
