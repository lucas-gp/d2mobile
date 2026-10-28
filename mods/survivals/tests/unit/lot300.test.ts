// @vitest-environment happy-dom
/**
 * Lot 300, the owner's returns on the Run (Act I): the loot from the bosses (the fodder's within a budget, the bosses' guaranteed, runes
 * rare on the fodder), the gold in fewer and larger piles, every learned skill cast with 1 to 5 skills (the rotation's log by zone), the
 * run's items in the bag during the run, the countdown after a zone's mini-boss, the next zone prepared during the current one, stronger
 * bosses, quicker levels and fewer ranks a skill.
 */
import { describe, expect, it } from 'vitest';
import { activate } from './activate';

async function setup() {
  const env = await activate();
  const RM = await import('../../sim/runmode');
  const ST = await import('../../sim/state');
  const SDK = await import('../../../../src/mods/sdk');
  const C = await import('../../sim/cadence');
  const AP = await import('../../sim/autopilot');
  const L = await import('../../sim/loot');
  const RL = await import('../../sim/runloot');
  const create = (cls = 'sorceress') => {
    const g = new env.G.Game(undefined, cls as never);
    for (const f of env.U.contributions('create.character')) f({ game: g });
    ST.stateOf(g).autoStart = false;
    return g;
  };
  const run = (cls = 'sorceress') => {
    const g = create(cls);
    RM.startRunMode(g, 1, 0);
    g.takeOffer(null);
    return g;
  };
  return { ...env, RM, ST, SDK, C, AP, L, RL, create, run };
}

describe('Survivals lot 300: every learned skill is cast', () => {
  it('with 1, 2, 3, 4 and 5 skills learned, in the first zone and in the next one (the rotation’s log by zone)', async () => {
    const { RM, C, AP, SDK, run } = await setup();
    const sets = [
      ['fire_bolt'],
      ['fire_bolt', 'charged_bolt'],
      ['fire_bolt', 'charged_bolt', 'ice_bolt'],
      ['fire_bolt', 'charged_bolt', 'ice_bolt', 'frost_nova'],
      ['fire_bolt', 'charged_bolt', 'ice_bolt', 'frost_nova', 'inferno'],
    ];
    for (const set of sets) {
      const g = run('sorceress');
      g.character.level = 12;
      g.character.skills = Object.fromEntries(set.map((id, i) => [id, i === 1 ? 4 : 1]));
      g.offers.length = 0;
      g.world.refreshPlayer();
      // a late cast in the first zone: its tick is far above the next zone's (lot 299's log kept by character left it out for a zone)
      C.playRate(g, 30, AP.rotationSkills(g), true);
      const w1 = g.world;
      w1.run!.completed = true;
      w1.run!.completeTick = w1.tick - 60 * 25;
      g.step(1);
      expect(g.world).not.toBe(w1);
      expect(g.runDef?.id).toBe('survivals:a1r2');
      const r = C.playRate(g, 25, AP.rotationSkills(g), true);
      const usable = set.filter((id) => SDK.REGISTRIES.skills.get(id));
      expect(r.unused, `${set.length} skills: ${r.unused.join(',')} never cast`).toEqual([]);
      for (const id of usable) expect(r.bySkill[id] ?? 0, `${set.length} skills: ${id}`).toBeGreaterThan(0);
      void RM;
    }
  }, 60000);

  it('the cast log is the zone’s (a new world starts it again)', async () => {
    const { AP, run } = await setup();
    const g = run('sorceress');
    AP.noteCast(g.world, 'fire_bolt');
    expect(AP.castLog(g.world).at.fire_bolt).toBe(g.world.tick);
    const other = { ...g.world } as never;
    expect(AP.castLog(other).at.fire_bolt).toBeUndefined();
  });
});

describe('Survivals lot 300: loot from the bosses', () => {
  it('the fodder within its budget whatever it drops, runes and gems in their own; an elite one item at most', async () => {
    const { L, SDK, run } = await setup();
    const g = run('barbarian');
    const w = g.world;
    const fodder = { rank: 'normal', mlvl: 5 } as never;
    let items = 0;
    let runes = 0;
    // ten minutes of a pd2-like fodder: 6 items and a rune a kill, 3 kills a second
    for (let t = 0; t < 10 * 60 * 3; t++) {
      if (t % 3 === 0) w.tick += 25;
      const drop = [...Array.from({ length: 6 }, (_, i) => SDK.generateItem(new SDK.Rng(`f${t}:${i}`), 'ring', 5, { forceQuality: 'magic' })), SDK.generateItem(new SDK.Rng(`r${t}`), 'r01', 5)];
      L.flowDrops(w, fodder, drop);
      items += drop.filter((it) => it.base !== 'r01').length;
      runes += drop.filter((it) => it.base === 'r01').length;
    }
    expect(items).toBeLessThanOrEqual(Math.ceil(10 * L.FLOW_LOOT.fodderRate + L.FLOW_LOOT.fodderStart + 1));
    expect(items).toBeGreaterThanOrEqual(Math.floor(10 * L.FLOW_LOOT.fodderRate) - 1);
    expect(runes).toBeLessThanOrEqual(Math.ceil(10 * L.FLOW_LOOT.stoneRate) + 1);
  });

  it('a mini-boss and the act’s boss always drop items, a rare or better among them; the boss a rune', async () => {
    const { L, SDK, run } = await setup();
    const g = run('sorceress');
    const w = g.world;
    for (let k = 0; k < 20; k++) {
      const mini = { rank: 'unique', runBoss: true, mlvl: 12 } as never;
      const items: never[] = [];
      L.flowDrops(w, mini, items);
      const gear = (items as { base: string; quality: string }[]).filter((it) => SDK.BASE_BY_ID[it.base]?.slot);
      expect(gear.length).toBeGreaterThanOrEqual(L.FLOW_LOOT.bossItems.miniboss);
      expect(gear.some((it) => ['rare', 'set', 'unique'].includes(it.quality))).toBe(true);
    }
    // Andariel's lair: the act's boss
    g.startRun('survivals:a1r7', 0);
    const boss = { rank: 'boss', runBoss: true, mlvl: 15 } as never;
    const items: { base: string }[] = [];
    L.flowDrops(g.world, boss, items as never);
    expect(items.filter((it) => SDK.BASE_BY_ID[it.base]?.slot).length).toBeGreaterThanOrEqual(L.FLOW_LOOT.bossItems.boss);
    expect(items.some((it) => SDK.BASE_BY_ID[it.base]?.type === 'rune')).toBe(true);
  });

  it('the gold pooled into larger piles (the same gold), the piles lying close made one', async () => {
    const { L, SDK, run } = await setup();
    const g = run('barbarian');
    const w = g.world;
    const pile = (n: number) => ({ ...SDK.generateItem(new SDK.Rng(`g${n}`), 'gold', 1), qty: 2 });
    let piles = 0;
    let gold = 0;
    const pool0 = L.goldPool(w.character).gold;
    for (let k = 0; k < 50; k++) {
      const drop = [pile(k)];
      L.flowDrops(w, { rank: 'normal', mlvl: 5 } as never, drop);
      piles += drop.length;
      gold += drop.reduce((a, it) => a + (it.qty ?? 0), 0);
    }
    expect(piles).toBeLessThanOrEqual(Math.ceil(100 / L.FLOW_LOOT.goldPile));
    expect(gold + L.goldPool(w.character).gold).toBe(100 + pool0);
    // two piles a unit apart: one
    w.items.length = 0;
    w.items.push({ id: 1, item: pile(1), x: 10, y: 10, dropTick: 0, show: 1 } as never, { id: 2, item: pile(2), x: 11, y: 10, dropTick: 0, show: 1 } as never);
    L.mergeGold(w);
    expect(w.items.length).toBe(1);
    expect(w.items[0].item.qty).toBe(4);
  });
});

describe('Survivals lot 300: the run’s items in the inventory', () => {
  it('in the bag at once while it has room (the pause’s inventory shows them), apart beyond, listed by the pause', async () => {
    const { L, RL, SDK, run } = await setup();
    const g = run('sorceress');
    const c = g.character;
    const ring = SDK.generateItem(new SDK.Rng('inv'), 'ring', 5, { forceQuality: 'rare' });
    c.equipment.ring1 = SDK.generateItem(new SDK.Rng('w1'), 'ring', 30, { forceQuality: 'unique' });
    c.equipment.ring2 = SDK.generateItem(new SDK.Rng('w2'), 'ring', 30, { forceQuality: 'unique' });
    expect(L.takeItem(g, ring)).toBe('kept');
    expect(c.inventory.includes(ring)).toBe(true);
    expect(RL.runLoot(c).length).toBe(0);
    const { runLootNote } = await import('../../ui/menu');
    expect(runLootNote(g)!.textContent).toMatch(/dans l’inventaire/);
    // a full bag: kept apart, told by the pause
    let n = 0;
    while (RL.runLoot(c).length === 0 && n++ < 200) L.takeItem(g, SDK.generateItem(new SDK.Rng(`full${n}`), 'ring', 5, { forceQuality: 'rare' }));
    expect(RL.runLoot(c).length).toBe(1);
    expect(runLootNote(g)!.textContent).toMatch(/sac plein : 1 en attente/);
  });
});

describe('Survivals lot 300: the countdown after a zone’s mini-boss', () => {
  it('10 s after a mini-boss (4 s on the zone’s time), a tap goes on at once; the HUD shows it', async () => {
    const { RM, run } = await setup();
    const g = run('sorceress');
    const w = g.world;
    w.godMode = true;
    expect(RM.zoneWaitLeft(g)).toBeNull();
    w.run!.completed = true;
    w.run!.completeTick = w.tick;
    expect(RM.zoneWait(g)).toBe(RM.RUN.bossWait);
    expect(RM.RUN.bossWait).toBe(10);
    g.step(5 * 25);
    expect(g.world).toBe(w);
    expect(Math.ceil(RM.zoneWaitLeft(g)!)).toBe(5);
    // the HUD's countdown, tapped
    const { hudWidget } = await import('../../ui/hud');
    const hud = hudWidget({ game: g, host: { message() {}, haptic() {}, itemSound() {} }, screen: { open: (n: HTMLElement) => (document.body.append(n), { close: () => n.remove() }) } } as never);
    document.body.append(hud.el);
    hud.update!(g);
    const btn = hud.el.querySelector<HTMLButtonElement>('[data-sv="zone-wait"]')!;
    expect(btn.style.display).toBe('');
    expect(btn.textContent).toContain('5');
    btn.click();
    g.step(1);
    expect(g.world).not.toBe(w);
    expect(g.runDef?.id).toBe('survivals:a1r2');
    // a zone ended on its time: no loot to wait for
    const w2 = g.world;
    (w2.run!.director as { endedByTime?: boolean }).endedByTime = true;
    w2.run!.completed = true;
    w2.run!.completeTick = w2.tick;
    expect(RM.zoneWait(g)).toBe(RM.RUN.nextAfter);
  });
});

describe('Survivals lot 300: the next zone prepared', () => {
  it('every named elite, its escort and the boss are in a round’s species (their sheets prepared with the zone)', async () => {
    const { RM } = await setup();
    const { ROUNDS } = await import('../../data/chapters');
    const D = await import('../../sim/director');
    const { zonePool } = await import('../../sim/zones');
    const { zoneMonsterIds } = await import('../../../../src/render/roster');
    for (const r of ROUNDS) {
      const species = D.roundSpecies(
        r.zones.flatMap((z) => zonePool(z, 0)),
        r,
      );
      const ids = new Set(zoneMonsterIds({ spawns: [], monsterPool: species } as never));
      for (const e of [...D.minibossesOf(r), ...D.midbossesOf(r)]) {
        const spec = D.eliteSpec(e);
        if (spec) expect(ids.has(spec.monster), `${r.id} ${spec.monster}`).toBe(true);
      }
      if (r.boss) expect(ids.has(r.boss.monster), r.id).toBe(true);
    }
    void RM;
  });

  it('rule `game.nextZone`: the base none; a run names its next zone with its species, the act’s last zone none', async () => {
    const { R, RM, run, G } = await setup();
    const base = new G.Game(undefined, 'sorceress');
    expect(R.RULES['game.nextZone'](base)).toBeNull();
    const g = run('sorceress');
    const z = R.RULES['game.nextZone'](g)!;
    expect(z).toBeTruthy();
    // the Cold Plains: Blood Raven's sheets come with it
    expect(z.monsterPool).toContain('blood_raven');
    // the zone being played knows its species before its first step
    expect(g.world.zone.monsterPool?.length).toBeGreaterThan(0);
    g.startRun('survivals:a1r7', 0);
    g.character.progression.milestones['survivals:run:zone'] = 4;
    expect(RM.nextRunZone(g)).toBeNull();
  });
});

describe('Survivals lot 300: bosses, levels and ranks', () => {
  it('a mini-boss of the flow has more life and hits harder than before, calls its escort and falls into a fury', async () => {
    const { RM, run } = await setup();
    const measure = (boss: boolean) => {
      const keep = RM.FLOW.boss;
      if (!boss) (RM.FLOW as { boss: unknown }).boss = undefined;
      try {
        const g = run('barbarian');
        const w = g.world;
        w.godMode = true;
        g.step(1);
        const d = w.run!.director as unknown as { spawnMiniboss(w: unknown, sec: number): void; bossIds: number[] };
        d.spawnMiniboss(w, 0);
        const m = w.monsters.find((x) => x.id === d.bossIds[0])!;
        const out = { hp: m.hpMax, dmg: m.dmgMax, alive: 0, fury: false };
        const before = w.monsters.filter((x) => !x.dead).length;
        for (const x of w.monsters) if (x !== m && !x.dead) x.dead = true;
        // a boss the hero cannot kill in the time of the test, under its fury's threshold
        m.hpMax = 1e7;
        m.hp = m.hpMax * 0.3;
        const off = g.onEvent((e) => {
          if (e.t === 'mapEvent' && /renforts/.test(e.text)) out.alive++;
        });
        g.step(15 * 25);
        off();
        out.fury = m.dmgMax > out.dmg;
        void before;
        return out;
      } finally {
        (RM.FLOW as { boss: unknown }).boss = keep;
      }
    };
    const weak = measure(false);
    const strong = measure(true);
    expect(strong.hp).toBeGreaterThanOrEqual(weak.hp * 2);
    expect(strong.dmg).toBeGreaterThanOrEqual(weak.dmg * 2);
    expect(strong.fury).toBe(true);
    expect(strong.alive).toBeGreaterThan(0);
  }, 30000);

  it('levels to 30 by the act’s end, a skill at `skillRank` points at most in a run', async () => {
    const { RM, run } = await setup();
    expect(RM.flowLevel(690)).toBe(30);
    expect(RM.flowLevel(390)).toBeGreaterThanOrEqual(18);
    const g = run('sorceress');
    const O = await import('../../sim/offer');
    g.character.level = 30;
    g.character.skillPoints = 10;
    g.character.skills = { fire_bolt: RM.FLOW.skillRank };
    expect(O.candidates(g)).not.toContain('fire_bolt');
    g.character.skills = { fire_bolt: RM.FLOW.skillRank - 1 };
    expect(O.candidates(g)).toContain('fire_bolt');
  });
});
