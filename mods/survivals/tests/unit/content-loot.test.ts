// @vitest-environment happy-dom
/**
 * Lot 283 (S8): the assists of a round lost again and again (elite packs' life and resistances, late waves withdrawn, the act boss fought
 * alone, a round left counted as lost), Diablo II's loot of the mode (quest drops of the act bosses, the super-uniques' own treasure
 * classes, the "Ground loot" and "Pick up" settings, the loot told at an elite's death), the super-uniques of the base's tables met in
 * the rounds, Act IV in the `levels` registry, and the HUD (bars of the named elites, the next event's name and telegraph, the row kept
 * clear of the zone's title in landscape).
 */
import { describe, expect, it, vi } from 'vitest';
import { activate } from './activate';

const noop = () => undefined;
const host = { message: noop, haptic: noop, itemSound: noop };
const screen = { open: () => ({ close: noop }) };

async function setup() {
  const a = await activate();
  return {
    ...a,
    D: await import('../../sim/director'),
    CP: await import('../../sim/checkpoints'),
    L: await import('../../sim/loot'),
    DL: await import('../../data/loot'),
    CH: await import('../../data/chapters'),
    SDK: await import('../../../../src/mods/sdk'),
    HUD: await import('../../ui/hud'),
  };
}

describe('Assists of a round lost again and again (lot 283)', () => {
  it("weakens the elite packs' escorts as their leader, withdraws a late wave and the guards when the boss comes", async () => {
    const { G, D } = await setup();
    const play = (deaths: number, seconds: number) => {
      const g = new G.Game(undefined, 'barbarian');
      g.character.level = 40;
      g.character.progression.highestDifficulty = 2;
      if (deaths) g.character.progression.milestones['survivals:deaths:0:a5r7'] = deaths;
      g.startRun('survivals:a5r7', 0, 5);
      const marks: string[] = [];
      for (let t = 0; t < 25 * seconds; t++) {
        g.world.godMode = true;
        for (const e of g.step(1)) if (e.t === 'mapEvent') marks.push(e.text);
      }
      const d = g.world.run?.director instanceof D.Director ? g.world.run.director : null;
      return { g, d: d!, marks };
    };
    // Baal's first wave: its escort (warped shamans) has the leader's lowered life in a round lost 10 times
    const fresh = play(0, 40);
    const lost = play(10, 40);
    const escorts = (x: { g: InstanceType<typeof G.Game> }) => x.g.world.monsters.filter((m) => !m.dead && m.rank === 'minion').map((m) => m.hpMax);
    expect(escorts(fresh).length).toBeGreaterThan(0);
    expect(escorts(lost).length).toBeGreaterThan(0);
    expect(Math.max(...escorts(lost)) / Math.max(...escorts(fresh))).toBeLessThan(0.85 ** 10 * 1.5);
    // a wave not killed after 3 minutes withdraws in a round already lost (never on the first try), and the guards leave when Baal comes
    const late = play(10, 30 + D.WAVE_MAX + 5);
    expect(late.marks).toContain('La vague d’élite se retire');
    const first = play(0, 30 + D.WAVE_MAX + 5);
    expect(first.marks).not.toContain('La vague d’élite se retire');
    vi.resetModules();
  }, 120_000);

  it('the boss of a round already lost is fought alone', async () => {
    const { G, D } = await setup();
    const g = new G.Game(undefined, 'sorceress');
    g.character.level = 20;
    g.character.progression.milestones['survivals:deaths:0:a1r7'] = 3;
    g.startRun('survivals:a1r7', 0, 2);
    const marks: string[] = [];
    for (let t = 0; t < 25 * (D.EVENTS.boss + 2); t++) {
      g.world.godMode = true;
      for (const e of g.step(1)) if (e.t === 'mapEvent') marks.push(e.text);
    }
    expect(marks).toContain('Les gardes se retirent');
    const hostile = g.world.monsters.filter((m) => !m.dead && m.team === 1 && !m.isSummon && !m.pet);
    expect(hostile.map((m) => m.def.id)).toEqual(['andariel']);
    vi.resetModules();
  }, 60_000);

  it('a round left after 5 minutes without dying counts as lost at its next start; a resumed round does not', async () => {
    const { G, CP } = await setup();
    const g = new G.Game(undefined, 'sorceress');
    g.character.level = 5;
    g.startRun('survivals:a1r1', 0, 1);
    for (let t = 0; t < 25 * (CP.ABANDON_AFTER + 6); t++) {
      g.world.godMode = true;
      g.step(1);
    }
    expect(g.character.progression.milestones['survivals:open:0:a1r1']).toBeGreaterThanOrEqual(CP.ABANDON_AFTER);
    g.townPortal();
    g.startRun('survivals:a1r1', 0, 1);
    g.step(1);
    expect(CP.deathsIn(g.character, 0, 'a1r1')).toBe(1);
    // a short attempt left: not counted
    g.townPortal();
    g.startRun('survivals:a1r1', 0, 1);
    g.step(1);
    expect(CP.deathsIn(g.character, 0, 'a1r1')).toBe(1);
    // resumed from the save after 5 minutes: the same attempt
    for (let t = 0; t < 25 * (CP.ABANDON_AFTER + 6); t++) {
      g.world.godMode = true;
      g.step(1);
    }
    const back = new G.Game(g.toSave(), 'sorceress');
    back.rebuildResumedRun();
    back.step(1);
    expect(back.mode).toBe('run');
    expect(CP.deathsIn(back.character, 0, 'a1r1')).toBe(1);
    // cleared: nothing kept
    CP.markCheckpoint(back.character, 0, 'a1r1');
    expect(back.character.progression.milestones['survivals:open:0:a1r1']).toBeUndefined();
    expect(CP.takeAbandoned(back.character, 0, 'a1r1')).toBe(false);
    vi.resetModules();
  }, 120_000);
});

describe("Diablo II's loot of the mode (lot 283)", () => {
  it('registers the quest treasure classes of the act bosses and those of the super-uniques, from the D2 tables', async () => {
    const { SDK, DL } = await setup();
    const tcs = SDK.REGISTRIES.treasureClasses;
    for (const m of ['andariel', 'duriel', 'mephisto', 'diablo', 'baal']) for (const d of [0, 1, 2]) expect(tcs.get(DL.questTcId(m, d)!), `${m}${d}`).toBeDefined();
    // Andarielq (H): no gold, no junk, rare and magic guaranteed ratios, the Hell essence
    const aq = tcs.get('survivals:andarielq2')!;
    expect(aq.entries.map((e) => e.ref)).toEqual(['equip', 'good', 'essence_twisted']);
    expect(aq.mods).toEqual({ unique: 995, set: 995, rare: 1024, magic: 1024 });
    expect(DL.questTcId('izual', 0)).toBeUndefined();
    expect(DL.superUniqueTcId('pindleskin', 2)).toBe('survivals:superx');
    expect(DL.superUniqueTcId('bishibosh', 0)).toBe('survivals:super');
    expect(DL.superUniqueTcId('ismail vilehand', 1)).toBe('survivals:council1');
    expect(DL.superUniqueTcId('the countess', 2)).toBe('countess2');
    expect(DL.superUniqueTcId('baal subject 3', 2)).toBe('champion');
    expect(DL.superUniqueTcId('nobody', 2)).toBeUndefined();
    vi.resetModules();
  });

  it("the act boss's first kill in a difficulty drops its quest treasure class, the later ones its own; a super-unique its own", async () => {
    const { G, D, L, SDK } = await setup();
    const g = new G.Game(undefined, 'sorceress');
    g.character.level = 20;
    g.startRun('survivals:a1r7', 0, 4);
    for (let t = 0; t < 25 * (D.EVENTS.boss + 1); t++) {
      g.world.godMode = true;
      g.step(1);
    }
    const d = g.world.run!.director as InstanceType<typeof D.Director>;
    const andariel = d.boss as InstanceType<typeof D.Director>['boss'] & { svTc?: string };
    expect(andariel!.def.id).toBe('andariel');
    expect(andariel!.svTc).toBe('survivals:andarielq0');
    // the quest roll: no gold nor junk, magic or better equipment and "good" items
    const items: import('../../../../src/mods/sdk').Item[] = [];
    SDK.REGISTRIES.treasureClasses.get('survivals:andarielq0');
    const before = g.world.items.length;
    const events: string[] = [];
    g.world.killMonster(andariel!, g.world.player);
    for (const e of g.world.events.drain()) if (e.t === 'message') events.push(e.text);
    const dropped = g.world.items.slice(before).map((gi) => gi.item);
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped.some((it) => it.base === 'gold')).toBe(false);
    for (const it of dropped) if (SDK.BASE_BY_ID[it.base]?.type !== 'rune' && SDK.BASE_BY_ID[it.base]?.type !== 'gem') items.push(it);
    expect(items.every((it) => it.quality !== 'normal' && it.quality !== 'low')).toBe(true);
    // told: the boss's loot
    expect(events.some((t) => t.startsWith('Butin de '))).toBe(true);
    // cleared now: the next Andariel has no quest mark
    expect(g.character.progression.milestones['survivals:cp:0:a1r7']).toBeDefined();
    const g2 = new G.Game(g.toSave(), 'sorceress');
    g2.townPortal();
    g2.startRun('survivals:a1r7', 0, 9);
    for (let t = 0; t < 25 * (D.EVENTS.boss + 1); t++) {
      g2.world.godMode = true;
      g2.step(1);
    }
    expect(((g2.world.run!.director as InstanceType<typeof D.Director>).boss as { svTc?: string }).svTc).toBeUndefined();
    void L;
    vi.resetModules();
  }, 60_000);

  it('lot 285: no potion, key nor plain item dropped, a third of the gold; worn in an empty slot only, kept, or turned into gold', async () => {
    const { G, L, SDK, R } = await setup();
    const g = new G.Game(undefined, 'sorceress');
    g.startRun('survivals:a1r1', 0, 3);
    g.step(1);
    const w = g.world;
    const rng = new SDK.Rng('drops');
    const white = SDK.generateItem(rng, 'cap', 10, {});
    white.quality = 'normal';
    const blue = SDK.generateItem(rng, 'cap', 10, { forceQuality: 'magic' });
    const items = [SDK.makeStack(rng, 'hp_potion', 1), SDK.makeStack(rng, 'key', 1), SDK.makeStack(rng, 'gold', 300), white, blue, SDK.makeStack(rng, 'r01', 1)];
    // the mode's rule over a round's monster (the base's drops replaced by these)
    const m = { rank: 'normal' } as never;
    R.RULES['loot.monsterDrops'](w, m, items);
    expect(items.map((it) => it.base).sort()).toEqual(['cap', 'gold', 'r01']);
    expect(items.find((it) => it.base === 'gold')!.qty).toBe(100);
    expect(L.dropKept(white)).toBe(false);
    expect(L.noConsumable('fulminating_potion')).toBe(true);
    // no potion nor key sold
    expect(R.RULES['shop.consumable'](g, 'hp_potion')).toBe(false);
    expect(R.RULES['shop.consumable'](g, 'key')).toBe(false);
    g.character.gold = 10_000;
    expect(g.buyConsumable('hp_potion', 4).ok).toBe(false);
    expect(g.character.gold).toBe(10_000);
    g.character.level = 30;
    // worn in an empty slot; not in place of a worn item that is as good: a second one is turned into gold (magic) or kept (rare)
    delete g.character.equipment.head;
    expect(L.takeItem(g, blue)).toBe('equipped');
    expect(g.character.equipment.head).toBe(blue);
    const blue2 = SDK.generateItem(rng, 'cap', 10, { forceQuality: 'magic' });
    const gold0 = g.character.gold;
    expect(L.takeItem(g, blue2)).toBe('sold');
    expect(g.character.gold).toBe(gold0 + g.sellPrice(blue2));
    expect(g.character.equipment.head).toBe(blue);
    const rare = SDK.generateItem(rng, 'cap', 10, { forceQuality: 'rare' });
    // lot 290: a clearly better one (this rare cap) goes on in its place, the magic one to the bag
    expect(L.takeItem(g, rare)).toBe('equipped');
    expect(g.character.equipment.head).toBe(rare);
    expect(g.character.inventory).toContain(blue);
    // a rare no better than the worn one is kept in the bag
    const rare2 = SDK.generateItem(rng, 'cap', 1, { forceQuality: 'rare' });
    rare2.affixes = [];
    expect(L.takeItem(g, rare2)).toBe('kept');
    expect(g.character.inventory).toContain(rare2);
    // lot 290: no requirement in the mode, a level-60 helm is worn by a level-1 hero in an empty slot
    const heavy = SDK.generateItem(rng, 'great_helm', 60, { forceQuality: 'magic' });
    delete g.character.equipment.head;
    g.character.level = 1;
    expect(L.autoSlotFor(g, heavy)).toBe('head');
    // a kill gives back 1 % of life and mana
    w.player.hp = 10;
    L.killHeal(w);
    expect(w.player.hp).toBeCloseTo(10 + w.player.hpMax * 0.01);
    vi.resetModules();
  }, 60_000);
});

describe('Bosses and super-uniques of the rounds (lot 283)', () => {
  it("every super-unique of the base's table is met in a round (or is a round's boss species), each round's elites known", async () => {
    const { CH, D, SDK } = await setup();
    const met = new Set<string>();
    for (const r of CH.ROUNDS) {
      for (const e of [...D.minibossesOf(r), ...D.midbossesOf(r), ...(r.boss?.waves ?? []).flat()]) {
        expect(D.eliteSpec(e), `${r.id} ${e.ref}`).not.toBeNull();
        met.add(e.ref);
      }
      if (r.boss) for (const m of [r.boss.monster, ...(r.boss.with ?? [])]) met.add(m);
    }
    // the super-uniques whose species is a boss monster met under its own name (Shenk, Nihlathak, Hephasto, the Summoner, the Ancients)
    const bySpecies: Record<string, string> = {
      'siege boss': 'shenk',
      'nihlathak boss': 'nihlathak',
      'the feature creep': 'hephasto',
      'the summoner': 'summoner',
      'ancient barbarian 1': 'ancient_talic',
      'ancient barbarian 2': 'ancient_madawc',
      'ancient barbarian 3': 'ancient_korlic',
    };
    const missing = Object.keys(SDK.SUPER_UNIQUE_DEFS).filter((k) => !met.has(k) && !met.has(bySpecies[k] ?? ''));
    expect(missing).toEqual([]);
    // the act bosses and the mini-bosses the owner named
    for (const x of ['andariel', 'duriel', 'mephisto', 'diablo', 'baal', 'the countess', 'summoner', 'izual', 'radament', 'bishibosh', 'griswold', 'the cow king']) expect(met.has(x), x).toBe(true);
    vi.resetModules();
  });

  it('the elites met halfway come one after the other, announced, and none after the round is lost 6 times', async () => {
    const { G } = await setup();
    type Dir = import('../../sim/director').Director;
    const run = (deaths: number) => {
      const g = new G.Game(undefined, 'sorceress');
      g.character.level = 30;
      if (deaths) g.character.progression.milestones['survivals:deaths:0:a1r2'] = deaths;
      g.startRun('survivals:a1r2', 0, 6);
      const spawns: string[] = [];
      const marks: string[] = [];
      for (let t = 0; t < 25 * 380; t++) {
        g.world.godMode = true;
        for (const e of g.step(1)) {
          if (e.t === 'bossSpawn') spawns.push(e.name);
          if (e.t === 'mapEvent') marks.push(e.text);
        }
      }
      return { spawns, marks, d: g.world.run!.director as Dir };
    };
    const first = run(0);
    expect(first.spawns).toEqual(expect.arrayContaining(['Bishibosh', 'Coldcrow', 'Bonebreak']));
    expect(first.marks).toContain('Coldcrow approche…');
    const lost = run(6);
    expect(lost.spawns).not.toContain('Coldcrow');
    expect(lost.d.extraMidbosses()).toEqual([]);
    vi.resetModules();
  }, 120_000);

  it("Act IV's zones are in the `levels` registry while the mode is active (Levels.txt levels)", async () => {
    const { SDK } = await setup();
    const Z = await import('../../sim/zones');
    expect(SDK.REGISTRIES.levels.get('survivals:a4_plains')?.lvl).toEqual([26, 56, 83]);
    expect(SDK.REGISTRIES.levels.get('survivals:a4_river')?.lvl).toEqual([27, 57, 85]);
    expect(Z.zoneLevels('a4_steppes')).toEqual([26, 56, 82]);
    expect(Z.zonePool('a4_plains', 2).length).toBeGreaterThan(3);
    // the base's registry itself has no Act IV
    expect(SDK.REGISTRIES.levels.get('a4_plains')).toBeUndefined();
    vi.resetModules();
  });
});

describe('HUD of the named elites (lot 283)', () => {
  it("shows a bar for each named elite alive, the next elite's name with its time, pulsing in its last 10 s", async () => {
    const { G, U, HUD } = await setup();
    const g = new G.Game(undefined, 'sorceress');
    g.character.level = 20;
    const [w] = U.contributions('hud').map((f) => f({ game: g, host, screen })!);
    const now = vi.spyOn(performance, 'now');
    let t = 1000;
    now.mockImplementation(() => (t += 300));
    g.startRun('survivals:a1r2', 0, 6);
    for (let i = 0; i < 25 * 262; i++) {
      g.world.godMode = true;
      g.step(1);
    }
    w.update!(g);
    const next = w.el.querySelector('[data-sv="next"]')!;
    expect(next.textContent).toBe('Bishibosh 0:08');
    expect(next.classList.contains('soon')).toBe(true);
    for (let i = 0; i < 25 * 10; i++) {
      g.world.godMode = true;
      g.step(1);
    }
    w.update!(g);
    const bars = [...w.el.querySelectorAll<HTMLElement>('[data-sv-boss]')];
    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0].textContent).toBe('Bishibosh');
    expect(HUD.nextText({ what: 'miniboss', at: 70 }, 10)).toBe('Super-unique 1:00');
    now.mockRestore();
    vi.resetModules();
  }, 60_000);

  it('in landscape, the row goes under the zone title when they meet', async () => {
    const { HUD } = await setup();
    const mm = vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ matches: q.includes('landscape') }) as MediaQueryList);
    const title = document.createElement('div');
    title.className = 'lvl';
    document.body.append(title);
    const el = document.createElement('div');
    document.body.append(el);
    const rect = (x: number, y: number, w: number, h: number) => ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h }) as DOMRect;
    vi.spyOn(title, 'getBoundingClientRect').mockReturnValue(rect(120, 4, 140, 36));
    const r = vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(rect(220, 4, 400, 40));
    HUD.clearTitle(el);
    expect(el.style.top).toBe('44px');
    r.mockReturnValue(rect(300, 4, 300, 40));
    HUD.clearTitle(el);
    expect(el.style.top).toBe('');
    mm.mockRestore();
    title.remove();
    el.remove();
    vi.resetModules();
  });
});
