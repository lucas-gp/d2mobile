/**
 * Lot 316 (audit of the Campaign against Diablo II, lots A, B and part of C; d2 and pd2):
 * A1. Duriel's Lair and the Worldstone Chamber reached from the Campaign's true tomb and Throne (the chamber's portal led nowhere): Duriel
 *     killed opens Act III, Baal killed opens Nightmare;
 * A2. the vendor's stall is stable (an item bought does not come back), renewed on a change of act or difficulty (act hopping);
 * A3. potions keep their item level and their tier is read from it (one table): no longer all Minor;
 * B.  life and mana kept from zone to zone and into town (Diablo II's healers heal), the zones of the Campaign kept for the session
 *     (monsters killed stay dead, items stay on the ground), at most `KEEP_MAX`, a new difficulty forgets them;
 * C.  a death in the Campaign costs Diablo II's share of the gold carried (no corpse), the portal back stays, the death screen names the
 *     act's town.
 * The D2 maps are private: the chambers' part is skipped without them.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearD2Maps, parseD2Map, registerD2Map } from '../../src/data/d2map';
import { Game, carryVitals, keepsVitals } from '../../src/sim/game';
import { RUN_BY_ID } from '../../src/data/runs';
import { TICK_HZ } from '../../src/sim/constants';
import { KEEP_MAX, ZoneKeep, freeIdBase, ID_STEP } from '../../src/sim/zone-keep';
import { deathGoldLoss } from '../../src/sim/progression';
import { POTION_LEVELS, potionLevelOf, potionTierAt } from '../../src/sim/potion-tier';
import { addToCharacter } from '../../src/sim/inventory';
import { makeStack } from '../../src/sim/loot/itemgen';
import { rollTc } from '../../src/sim/loot/drops';
import { Rng } from '../../src/core/rng';
import { deathLine } from '../../src/ui/hud';
import { ACT5_STEPS } from '../../src/data/zones/act5';
import { ACT1_STEPS } from '../../src/data/zones/act1';
import { spawnMonster } from '../../src/sim/spawn';
import type { World } from '../../src/sim/world';

const enter = (g: Game, id: string) => (g as unknown as { enterCampaignZone(id: string): boolean }).enterCampaignZone(id);
const interact = (g: Game, ref: string) => {
  const o = g.world.objects.find((x) => x.kind === 'portal' && x.ref === ref && !x.mirror);
  expect(o, ref).toBeTruthy();
  g.world.events.push({ t: 'interact', kind: 'portal', ref, objectId: o!.id });
  g.step(1);
};
const killAll = (w: World, pred: (m: World['monsters'][number]) => boolean = () => true) => {
  for (const m of [...w.monsters]) if (!m.dead && !m.pet && pred(m)) w.killMonster(m, w.player);
};

describe('lot 316 A2: a stable stall', () => {
  it('an item bought is gone at the next contact and visit; a change of act renews it (act hopping), so does a new difficulty', () => {
    const g = new Game(undefined, 'sorceress');
    g.enterTown('act1');
    g.visitVendor();
    const uids = () => g.vendor.map((v) => v.item.uid);
    const first = uids();
    expect(first.length).toBeGreaterThan(0);
    g.character.gold = 1e7;
    const bought = g.vendor[0].item.uid;
    expect(g.buy(0).ok).toBe(true);
    // the NPC touched again (every "Commercer"), the town entered again: the same stall, without the item bought
    g.visitVendor();
    g.visitVendor();
    expect(uids()).not.toContain(bought);
    expect(uids()).toEqual(first.slice(1));
    g.startRun('a1_coldplains', 0);
    g.enterTown('act1');
    expect(uids()).toEqual(first.slice(1));
    // another act, then back: renewed both times
    g.enterTown('act2');
    const act2 = uids();
    expect(act2).not.toEqual(first.slice(1));
    g.enterTown('act1');
    expect(uids()).not.toEqual(first.slice(1));
    expect(uids()).not.toEqual(act2);
  });

  it("the game's first stall keeps its seed (the stall of before the lot)", () => {
    const a = new Game(undefined, 'sorceress');
    const b = new Game(undefined, 'sorceress');
    expect(a.vendor.map((v) => v.item.base)).toEqual(b.vendor.map((v) => v.item.base));
  });
});

describe('lot 316 A3: potion tiers', () => {
  it('one table; the tier read from the item level; a drop and a purchase keep theirs', () => {
    expect([...POTION_LEVELS]).toEqual([1, 12, 24, 40, 60]);
    expect([0, 11, 12, 23, 24, 39, 40, 59, 60, 99].map(potionTierAt)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    for (let t = 0; t < 5; t++) expect(potionTierAt(potionLevelOf(t))).toBe(t);
    const g = new Game(undefined, 'sorceress');
    const c = g.character;
    const tierOf = (kind: 'heal' | 'mana') => c.belt.find((s) => s.kind === kind)!;
    for (const s of c.belt) {
      s.qty = 0;
      s.tier = 0;
    }
    // a potion of item level 45 (a Nightmare zone): Greater (tier 3), no longer Minor
    const it = makeStack(new Rng('p'), 'hp_potion', 1);
    it.ilvl = 45;
    expect(addToCharacter(c, it)).toBe(true);
    expect(tierOf('heal').tier).toBe(3);
    // dropped by the treasure class at item level 30: its item level kept
    const ctx = { rng: new Rng('drop'), ilvl: 30, mf: 0, difficulty: 0 as const, zoneKey: 'tristram', mapTier: 0, bonus: { unique: 0, set: 0, rare: 0, magic: 0 }, gf: 0, quantity: 1 };
    let pot = null;
    for (let i = 0; i < 40 && !pot; i++) pot = rollTc(ctx, 'potion').find((x) => x.base === 'mp_potion') ?? null;
    expect(pot?.ilvl).toBe(30);
    // bought at level 30: tier 2
    c.level = 30;
    c.gold = 1e6;
    expect(g.buyConsumable('mp_potion').ok).toBe(true);
    expect(tierOf('mana').tier).toBe(2);
    // without the setting, the potion heals by its own tier (Greater 70 %)
    const p = g.world.player;
    g.world.autoCfg = { potionUpgrade: false };
    p.hp = 1;
    expect(g.world.usePotion('heal')).toBe(true);
    expect((p.healPerTick * 25) / p.hpMax).toBeCloseTo(0.7, 5);
  });
});

describe('lot 316 B: life and mana kept, zones kept for the session', () => {
  it('who keeps them: the Campaign and its towns; a Rush run or a round starts whole', () => {
    const z = RUN_BY_ID.a1_coldplains;
    expect(keepsVitals(null, z)).toBe(true);
    expect(keepsVitals(z, null)).toBe(true);
    expect(keepsVitals(z, RUN_BY_ID.a1_stonyfield)).toBe(true);
    expect(keepsVitals(null, RUN_BY_ID.tristram)).toBe(false);
    expect(keepsVitals(RUN_BY_ID.tristram, null)).toBe(false);
    expect(keepsVitals({ ...z, hidden: true, director: () => ({}) as never }, null)).toBe(false);
  });

  it('a stair or exit, a waypoint, the town: no heal; a Rush run: whole; a healer heals the hero, his poison and his mercenary', () => {
    const g = new Game(undefined, 'sorceress');
    g.character.level = 30;
    g.enterTown('act1');
    g.startRun('a1_coldplains', 0);
    const set = () => {
      const p = g.world.player;
      p.hp = Math.round(p.hpMax * 0.4);
      p.mana = Math.round(p.manaMax * 0.3);
      return { hp: p.hp, mana: p.mana };
    };
    let v = set();
    enter(g, 'a1_cave1');
    expect(g.world.zone.id).toBe('a1_cave1');
    expect(g.world.player.hp).toBe(v.hp);
    expect(g.world.player.mana).toBe(v.mana);
    v = set();
    g.enterTown('act1');
    expect(g.world.player.hp).toBe(v.hp);
    g.refreshTown();
    expect(g.world.player.hp).toBe(v.hp);
    g.startRun('a1_stonyfield', 0);
    expect(g.world.player.hp).toBe(v.hp);
    g.enterTown('act1');
    g.heal();
    expect(g.world.player.hp).toBe(g.world.player.hpMax);
    set();
    g.startRun('tristram', 0, 3);
    expect(g.world.player.hp).toBe(g.world.player.hpMax);
    // carryVitals caps at the new maxima, never from a dead hero
    const a = new Game(undefined, 'sorceress').world;
    const b = new Game(undefined, 'sorceress').world;
    a.player.hp = 1e6;
    carryVitals(a, b);
    expect(b.player.hp).toBe(b.player.hpMax);
    a.player.dead = true;
    a.player.hp = 0;
    b.player.hp = 5;
    carryVitals(a, b);
    expect(b.player.hp).toBe(5);
  });

  it('a zone left and entered again is as it was: its monsters killed stay dead, its items on the ground, the hero at the way back', () => {
    const g = new Game(undefined, 'sorceress');
    g.enterTown('act1');
    g.startRun('a1_coldplains', 0);
    const w = g.world;
    // monsters there (its groups need Diablo II's maps), half of them killed
    for (let i = 0; i < 8; i++) spawnMonster(w, 'zombie', w.zone.start.x + 8 + i, w.zone.start.y + 8, { rank: 'normal' }, `lot316:${i}`);
    const alive = w.monsters.filter((m) => !m.dead && !m.pet);
    expect(alive.length).toBeGreaterThan(4);
    const dead = alive.slice(0, Math.floor(alive.length / 2));
    for (const m of dead) w.killMonster(m, w.player);
    const deadIds = new Set(dead.map((m) => m.id));
    const item = makeStack(new Rng('x'), 'hp_potion', 1);
    w.dropItem(item, w.zone.start.x, w.zone.start.y, 0.5);
    // stairs down, then up again
    enter(g, 'a1_cave1');
    expect(g.world).not.toBe(w);
    expect(g.kept.has('a1_coldplains', 0)).toBe(true);
    enter(g, 'a1_coldplains');
    expect(g.world).toBe(w);
    expect(g.kept.has('a1_coldplains', 0)).toBe(false);
    expect(w.monsters.filter((m) => deadIds.has(m.id)).every((m) => m.dead)).toBe(true);
    expect(w.monsters.filter((m) => !m.dead && !m.pet).length).toBe(alive.length - dead.length);
    expect(w.items.some((gi) => gi.item.uid === item.uid)).toBe(true);
    // the hero by the cave's entrance (the way he came back), alive, controls idle
    const cave = w.objects.find((o) => o.kind === 'portal' && o.ref === 'zone:a1_cave1')!;
    expect(Math.hypot(w.player.x - cave.x, w.player.y - cave.y)).toBeLessThan(5);
    expect(w.player.dead).toBe(false);
    expect(w.input.moveX).toBe(0);
    // by the waypoint from the camp: the same world (one plan per hero, no random seed)
    g.enterTown('act1');
    expect(g.startRun('a1_coldplains', 0)).toBe(true);
    expect(g.world).toBe(w);
    const wp = w.objects.find((o) => o.kind === 'waypoint');
    if (wp) expect(Math.hypot(w.player.x - wp.x, w.player.y - wp.y)).toBeLessThan(5);
    // its cave too
    enter(g, 'a1_cave1');
    const cave1 = g.world;
    g.enterTown('act1');
    enter(g, 'a1_bloodmoor');
    g.startRun('a1_coldplains', 0);
    enter(g, 'a1_cave1');
    expect(g.world).toBe(cave1);
  });

  it('not kept: a Rush run, another seed, another difficulty (a new game); identifiers apart; at most KEEP_MAX', () => {
    const g = new Game(undefined, 'sorceress');
    g.startRun('tristram', 0, 3);
    const t = g.world;
    g.enterTown('act1');
    g.startRun('tristram', 0, 3);
    expect(g.world).not.toBe(t);
    g.startRun('a1_coldplains', 0);
    const cp = g.world;
    g.enterTown('act1');
    g.startRun('a1_coldplains', 0, 7);
    expect(g.world).not.toBe(cp);
    g.startRun('a1_bloodmoor', 0);
    expect(g.kept.size).toBe(1);
    g.startRun('a1_stonyfield', 1);
    expect(g.kept.size).toBe(0);
    // many zones: the oldest given up first; every kept world numbers its entities apart from the others and from the zone
    const ids = ACT1_STEPS.map((s) => s.id).filter((id) => id !== 'a1_town');
    for (const id of ids) g.startRun(id, 1);
    expect(g.kept.size).toBe(Math.min(KEEP_MAX, ids.length - 1));
    const keep = g.kept as unknown as { kept: Map<string, { world: World }> };
    const worlds = [...keep.kept.values()].map((e) => e.world);
    const bases = new Set([...worlds, g.world].map((w) => w.idBase));
    expect(bases.size).toBe(worlds.length + 1);
    for (const w of worlds) for (const m of w.monsters) expect(m.id >= w.idBase && m.id < w.idBase + ID_STEP, w.zone.id).toBe(true);
    expect(g.kept.bytes).toBeGreaterThan(0);
    expect(g.kept.release(3)).toBe(3);
  });

  it('ZoneKeep: the lowest free identifier range, a seed mismatch builds anew, release', () => {
    expect(freeIdBase(new Set())).toBe(0);
    expect(freeIdBase(new Set([0, ID_STEP]))).toBe(2 * ID_STEP);
    const k = new ZoneKeep();
    const g = new Game(undefined, 'sorceress');
    g.startRun('a1_coldplains', 0, 5);
    k.put(g.world, 'a1_coldplains');
    expect(k.take('a1_coldplains', 0, 6)).toBeNull();
    expect(k.size).toBe(0);
    k.put(g.world, 'a1_coldplains');
    expect(k.take('a1_coldplains', 0, 5)).toBe(g.world);
  });
});

describe('lot 316 C: death', () => {
  it("Diablo II's gold penalty: the level in percent (at most 20 %), 500 gold per level exempt", () => {
    expect(deathGoldLoss(10, 5000)).toBe(0);
    expect(deathGoldLoss(10, 15000)).toBe(1000);
    expect(deathGoldLoss(1, 100)).toBe(0);
    expect(deathGoldLoss(1, 10500)).toBe(100);
    expect(deathGoldLoss(40, 100000)).toBe(16000);
    expect(deathGoldLoss(99, 1e6)).toBe(Math.floor((1e6 - 49500) * 0.2));
  });

  it("in the Campaign: the gold lost, no item lost, back in the act's town whole, the portal back to the zone kept as it was", () => {
    const g = new Game(undefined, 'sorceress');
    g.character.level = 30;
    g.character.gold = 100000;
    g.enterTown('act1');
    g.startRun('a1_coldplains', 0);
    const w = g.world;
    const inv = JSON.stringify([g.character.inventory, g.character.equipment]);
    const p = w.player;
    p.hp = 0;
    p.dead = true;
    w.events.push({ t: 'playerDeath' } as never);
    g.step(1);
    expect(g.character.gold).toBe(100000 - deathGoldLoss(30, 100000));
    expect(deathLine(g)).toBe('Retour dans le Camp des Rôdeuses — un portail vous ramènera ici');
    for (let i = 0; i < 4 * TICK_HZ && g.mode === 'run'; i++) g.step(1);
    expect(g.mode).toBe('town');
    expect(g.world.player.hp).toBe(g.world.player.hpMax);
    expect(JSON.stringify([g.character.inventory, g.character.equipment])).toBe(inv);
    interact(g, 'run');
    expect(g.world).toBe(w);
    expect(g.world.player.dead).toBe(false);
    expect(g.world.player.hp).toBe(g.world.player.hpMax);
    expect(g.kept.has('a1_coldplains', 0)).toBe(false);
  });

  it("a Rush run: no gold lost (outside this lot); the death screen names each act's town", () => {
    const g = new Game(undefined, 'sorceress');
    g.character.gold = 100000;
    g.character.level = 30;
    g.startRun('tristram', 0, 3);
    g.world.player.dead = true;
    g.world.events.push({ t: 'playerDeath' } as never);
    g.step(1);
    expect(g.character.gold).toBe(100000);
    const towns: Record<string, string> = { a2_rocky: 'Lut Gholein', a3_spider: 'le Port de Kurast', a4_plains: 'la Forteresse du Pandémonium', a5_highlands: 'Harrogath' };
    for (const [id, town] of Object.entries(towns)) {
      g.startRun(id, 0);
      expect(deathLine(g)).toBe(`Retour dans ${town} — un portail vous ramènera ici`);
    }
  });
});

const DIR = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps`;

describe.skipIf(!fs.existsSync(DIR))("lot 316 A1: Duriel and Baal in the Campaign (Diablo II's maps)", () => {
  beforeAll(() => {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && !/-g\d|-t|^tmp_|^index/.test(x))) {
      const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
      if (j.grid) registerD2Map(parseD2Map(j));
    }
  });
  afterAll(() => clearD2Maps());

  it("the true tomb's door leads to Duriel's Lair; Duriel killed: the quest, Act III open, the portal home", () => {
    const g = new Game(undefined, 'sorceress');
    g.character.level = 30;
    // Normal's true tomb (act2.ts TRUE_TOMB): the fourth
    g.startRun('a2_tomb4', 0);
    const tomb = g.world;
    expect(tomb.zone.chamberKind).toBe('lair');
    tomb.player.hp = Math.round(tomb.player.hpMax / 2);
    // lot 319: the door opens with the Horadric Staff in the orifice (Diablo II's lock, tests/unit/lot319-campaign-locks.test.ts)
    g.completeQuest('staff', 0);
    interact(g, 'chamber');
    const w = g.world;
    expect(w).not.toBe(tomb);
    expect(g.runDef?.id).toBe('a2_tomb4');
    expect(
      w.objects.filter((o) => o.kind === 'portal' && o.ref === 'town'),
      'no portal on arrival',
    ).toHaveLength(0);
    expect(w.player.hp, 'life kept').toBe(tomb.player.hp);
    expect(g.kept.has('a2_tomb4', 0), 'the tomb kept').toBe(true);
    expect(g.actLock('act3', 0)).not.toBeNull();
    w.pendingSpawns.splice(0).forEach((ps) => (w as unknown as { spawnGroup(i: number): void }).spawnGroup(ps.idx));
    const duriel = w.monsters.find((m) => m.def.id === 'duriel');
    expect(duriel).toBeTruthy();
    w.killMonster(duriel!, w.player);
    g.step(1);
    expect(g.questDone('duriel', 0)).toBe(true);
    expect(g.actLock('act3', 0)).toBeNull();
    expect(w.objects.some((o) => o.kind === 'portal' && o.ref === 'town')).toBe(true);
    // a false tomb has no door
    g.startRun('a2_tomb1', 0);
    expect(g.world.objects.some((o) => o.kind === 'portal' && o.ref === 'chamber')).toBe(false);
  }, 300000);

  it("the Throne's portal leads to the Worldstone Chamber; Baal killed: the quest, Nightmare open", () => {
    const g = new Game(undefined, 'sorceress');
    g.character.level = 45;
    expect(ACT5_STEPS.some((s) => s.id === 'a5_throne')).toBe(true);
    g.startRun('a5_throne', 0);
    const w0 = g.world;
    const run = w0.run!;
    expect(run.totalWaves).toBeGreaterThan(0);
    // the waves beaten
    w0.pendingSpawns = w0.pendingSpawns.filter((s) => !s.wave && !s.seal);
    w0.pendingSpawns.splice(0).forEach((ps) => (w0 as unknown as { spawnGroup(i: number): void }).spawnGroup(ps.idx));
    killAll(w0);
    run.wave = run.totalWaves;
    for (let i = 0; i < 3 && !run.gatesOpened; i++) g.step(1);
    expect(run.gatesOpened).toBe(true);
    interact(g, 'chamber');
    const w = g.world;
    expect(w).not.toBe(w0);
    expect(
      w.objects.filter((o) => o.kind === 'portal' && o.ref === 'town'),
      'no portal on arrival',
    ).toHaveLength(0);
    w.pendingSpawns.splice(0).forEach((ps) => (w as unknown as { spawnGroup(i: number): void }).spawnGroup(ps.idx));
    const baal = w.monsters.find((m) => m.def.id === 'baal');
    expect(baal).toBeTruthy();
    expect(g.character.progression.highestDifficulty).toBe(0);
    w.killMonster(baal!, w.player);
    g.step(1);
    expect(g.questDone('baal', 0)).toBe(true);
    expect(g.character.progression.highestDifficulty).toBe(1);
  }, 300000);

  it('the Rush runs still reach their chambers, with their portal home', () => {
    const g = new Game(undefined, 'sorceress');
    g.character.level = 60;
    g.startRun('tombs', 0, 11);
    if (g.world.objects.some((o) => o.kind === 'portal' && o.ref === 'chamber')) {
      interact(g, 'chamber');
      expect(g.world.zone.id).not.toBe('tombs');
      expect(g.world.objects.some((o) => o.kind === 'portal' && o.ref === 'town')).toBe(true);
    }
  }, 300000);

  it('Blood Moor and its joined neighbour: walked away by a waypoint, both found again as they were', () => {
    const g = new Game(undefined, 'sorceress');
    g.enterTown('act1');
    enter(g, 'a1_bloodmoor');
    const bm = g.world;
    // the neighbour built (the hero near its seam)
    const s = bm.zone.seams!.find((x) => x.to === 'a1_coldplains')!;
    // 15 units before the crossing (the neighbour built, not crossed)
    const c = { x: (s.cross[0] + s.cross[2]) / 2, y: (s.cross[1] + s.cross[3]) / 2 };
    const dl = Math.hypot(bm.zone.start.x - c.x, bm.zone.start.y - c.y) || 1;
    const f = bm.grid.nearestFree(c.x + ((bm.zone.start.x - c.x) / dl) * 15, c.y + ((bm.zone.start.y - c.y) / dl) * 15, 6)!;
    bm.pendingSpawns.splice(0).forEach((ps) => (bm as unknown as { spawnGroup(i: number): void }).spawnGroup(ps.idx));
    killAll(bm);
    const slain = bm.monsters.filter((m) => !m.pet).map((m) => m.id);
    bm.player.x = bm.player.px = f.x;
    bm.player.y = bm.player.py = f.y;
    g.step(2);
    const cp = g.seams.worldOf('a1_coldplains');
    expect(cp).toBeTruthy();
    expect(g.world).toBe(bm);
    g.enterTown('act1');
    g.step(1);
    // kept, or already a neighbour of the camp again (taken back from the store)
    const held = (id: string, w: World) => g.kept.peek(id, 0) === w || g.seams.worldOf(id) === w;
    expect(held('a1_bloodmoor', bm)).toBe(true);
    expect(held('a1_coldplains', cp!)).toBe(true);
    g.startRun('a1_coldplains', 0);
    expect(g.world).toBe(cp);
    expect(g.world.proxy).toBe(false);
    expect(g.world.monsters.filter((m) => m.pet).length).toBeLessThanOrEqual(1);
    // the Blood Moor taken back from the store when the hero walks toward it
    const back = g.world.zone.seams!.find((x) => x.to === 'a1_bloodmoor')!;
    const b = g.world.grid.nearestFree((back.cross[0] + back.cross[2]) / 2, (back.cross[1] + back.cross[3]) / 2, 6)!;
    g.world.player.x = g.world.player.px = b.x;
    g.world.player.y = g.world.player.py = b.y;
    g.step(2);
    expect(g.seams.worldOf('a1_bloodmoor')).toBe(bm);
    expect(slain.length).toBeGreaterThan(0);
    // dead (or their corpses gone), none risen, no group to come again
    for (const id of slain) expect(bm.monsters.find((m) => m.id === id && !m.dead)).toBeUndefined();
    expect(bm.monsters.filter((m) => !m.pet && !m.mirror && !m.dead)).toHaveLength(0);
    expect(bm.pendingSpawns).toHaveLength(0);
  }, 300000);
});
