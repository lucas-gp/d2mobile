// @vitest-environment happy-dom
/**
 * Lot 319 (audit of the Campaign against Diablo II, lots D and F; d2 and pd2):
 * D. no Rush leaking into the Campaign: its waypoint lists only the waypoints touched in the acts open (no level asked; lot 322: its Rush tab back, opened on the Campaign);
 *    Warriv, Meshif and Tyrael take the hero only where Diablo II's do (the next act once its gate is open, or back); Mephisto's red portal
 *    leads to the Pandemonium Fortress; Harrogath (the Rush's hub) keeps its Rush menu;
 * F. Diablo II's quest locks: Tristram (Cairn Stones: Tree of Inifuss → Akara → key), the palace (Tainted Sun), the Canyon of the Magi
 *    (the Summoner), Duriel's door (the Horadric Staff), the Durance of Hate (Khalim's Will), Nihlathak's temple (Anya), the Worldstone
 *    Keep (the Ancients); each lifted by its quest; a save of before the locks keeps the passages it went through.
 * The D2 maps are private: the parts on them are skipped without them.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearD2Maps, parseD2Map, registerD2Map } from '../../src/data/d2map';
import { QUEST_BY_ID, QUEST_LOCKS, QUEST_PORTALS, TRAVELERS } from '../../src/data/quests';
import { RUN_BY_ID } from '../../src/data/runs';
import { CAMPAIGNS } from '../../src/data/campaigns';
import { act2Available } from '../../src/data/zones/act2';
import { act3Available } from '../../src/data/zones/act3';
import { Game } from '../../src/sim/game';
import { LOCKS_MIGRATED, migrateQuestLocks } from '../../src/sim/quests';
import { matCount } from '../../src/sim/materials';
import type { SaveData } from '../../src/sim/save';
import { Panels } from '../../src/ui/panels';
import type { PanelHost } from '../../src/ui/panels-shared';
import { d2Info } from '../../src/render/assets';

const enter = (g: Game, id: string) => (g as unknown as { enterCampaignZone(id: string): boolean }).enterCampaignZone(id);
const messages = (g: Game) =>
  g.world.events
    .drain()
    .filter((e) => e.t === 'message')
    .map((e) => (e as { text: string }).text);
/** Quest `id` done in Normal: a run's quest by its run completed (as killing its boss records it), the others granted */
const done = (g: Game, id: string) => {
  const goal = QUEST_BY_ID[id].goal;
  if (goal.kind === 'run') g.character.progression.completions[`${goal.runs[0]}:0`] = 1;
  else g.completeQuest(id, 0);
};
const interact = (g: Game, ref: string) => {
  const o = g.world.objects.find((x) => x.kind === 'portal' && x.ref === ref);
  expect(o, ref).toBeTruthy();
  g.world.events.push({ t: 'interact', kind: 'portal', ref, objectId: o!.id });
  g.step(1);
};

describe('lot 319 F: quest locks of Diablo II on the Campaign', () => {
  it('each lock: shut with its hint until its quest is done at that difficulty', () => {
    for (const l of QUEST_LOCKS.filter((x) => x.to !== 'chamber')) {
      const g = new Game(undefined, 'sorceress');
      if (l.from.endsWith('_town')) g.enterTown(RUN_BY_ID[l.to].campaign);
      else g.startRun(l.from, 0);
      // a town without its maps is Harrogath: the lock is checked from the zone's own name then
      const here = g.mode === 'town' ? g.world.zone.id : g.runDef?.id;
      if (here !== l.from) continue;
      g.world.events.drain();
      expect(enter(g, l.to), `${l.id}: shut`).toBe(false);
      expect(g.mode === 'town' ? g.world.zone.id : g.runDef?.id, `${l.id}: still in ${l.from}`).toBe(l.from);
      expect(messages(g), `${l.id}: its hint`).toContain(l.hint);
      expect(g.passageLock(l.to)).toBe(l.hint);
      done(g, l.quest);
      expect(g.passageLock(l.to), `${l.id}: open once ${l.quest} is done`).toBeNull();
      expect(enter(g, l.to), `${l.id}: open`).toBe(true);
      expect(g.runDef?.id).toBe(l.to);
    }
  });

  it('a lock binds its difficulty only: done in Normal, shut in Nightmare until done again; a difficulty beaten stays open', () => {
    const g = new Game(undefined, 'sorceress');
    g.startRun('a3_travincal', 0);
    done(g, 'khalim');
    expect(g.passageLock('a3_durance1')).toBeNull();
    g.character.progression.highestDifficulty = 1;
    g.startRun('a3_travincal', 1);
    expect(g.passageLock('a3_durance1')).not.toBeNull();
    g.character.progression.highestDifficulty = 2;
    expect(g.passageLock('a3_durance1'), 'Nightmare beaten').toBeNull();
  });

  it('only the passages of Diablo II are locked: the other exits of those zones stay open', () => {
    const g = new Game(undefined, 'sorceress');
    g.startRun('a1_stonyfield', 0);
    expect(g.passageLock('a1_darkwood')).toBeNull();
    expect(g.passageLock('a1_coldplains')).toBeNull();
    g.startRun('a2_valley', 0);
    expect(g.passageLock('a2_viper1')).toBeNull();
    g.startRun('a5_highlands', 0);
    expect(g.passageLock('a5_plateau')).toBeNull();
    expect(g.passageLock('a5_abaddon')).toBeNull();
  });

  it('the Rush and the game modes are not locked: Tristram, the Durance and the tombs as before', () => {
    const g = new Game(undefined, 'sorceress');
    g.character.level = 60;
    expect(g.startRun('tristram', 0, 3)).toBe(true);
    expect(g.passageLock('a1_tristram')).toBeNull();
    expect(g.startRun('mephisto', 0, 3)).toBe(true);
    expect(
      g.world.objects.some((o) => o.kind === 'portal' && o.ref === 'town'),
      'the Rush run keeps its portal home',
    ).toBe(true);
  });

  it('Tristram: the Tree of Inifuss gives the scroll, Akara deciphers it, the key opens the Cairn Stones (spent), then open for good', () => {
    const g = new Game(undefined, 'sorceress');
    g.startRun('a1_darkwood', 0, 9);
    const tree = g.world.objects.find((o) => o.kind === 'quest' && o.ref === 'q_inifuss');
    expect(tree, 'the Tree of Inifuss in the Dark Wood').toBeTruthy();
    expect(tree!.label).toBe('Arbre d’Inifuss');
    g.world.events.push({ t: 'interact', kind: 'quest', ref: 'q_inifuss', objectId: tree!.id });
    g.step(1);
    expect(matCount(g.character, 'inifuss_scroll')).toBe(1);
    // its key in hand, the tree gives nothing more
    g.talkTo('akara');
    expect(matCount(g.character, 'inifuss_scroll')).toBe(0);
    expect(matCount(g.character, 'cairn_key')).toBe(1);
    g.startRun('a1_darkwood', 0, 9);
    const again = g.world.objects.find((o) => o.kind === 'quest' && o.ref === 'q_inifuss')!;
    again.used = false;
    g.world.events.push({ t: 'interact', kind: 'quest', ref: 'q_inifuss', objectId: again.id });
    g.step(1);
    expect(matCount(g.character, 'inifuss_scroll'), 'no second scroll').toBe(0);
    g.startRun('a1_stonyfield', 0);
    g.world.events.drain();
    expect(enter(g, 'a1_tristram')).toBe(true);
    expect(g.runDef?.id).toBe('a1_tristram');
    expect(matCount(g.character, 'cairn_key'), 'the key spent').toBe(0);
    expect(g.character.progression.milestones['gate:cairn:0']).toBeDefined();
    g.startRun('a1_stonyfield', 0);
    expect(enter(g, 'a1_tristram'), 'open for good at this difficulty').toBe(true);
  });

  it('a save of before the locks keeps what it went through (marked once); a new character is marked and keeps every lock', () => {
    const fresh = new Game(undefined, 'sorceress');
    expect(fresh.character.progression.milestones[LOCKS_MIGRATED]).toBe(0);
    expect(Object.keys(fresh.character.progression.milestones).some((k) => k.startsWith('gate:'))).toBe(false);
    // an old save: Tristram and the Durance walked into, Duriel killed, in Normal (its highest difficulty)
    const old = new Game(undefined, 'barbarian');
    const ms = old.character.progression.milestones;
    delete ms[LOCKS_MIGRATED];
    ms['zone:a1_tristram'] = 10;
    ms['zone:a3_durance1'] = 20;
    old.character.progression.completions['a2_tomb4:0'] = 1;
    const save = JSON.parse(JSON.stringify(old.toSave())) as SaveData;
    const g = new Game(save, 'barbarian');
    const m2 = g.character.progression.milestones;
    expect(m2[LOCKS_MIGRATED]).toBe(0);
    expect(m2['gate:cairn:0']).toBe(0);
    expect(m2['gate:durance:0']).toBe(0);
    expect(m2['gate:chamber:0'], 'Duriel dead: his door was passed').toBe(0);
    expect(m2['gate:canyon:0'], 'never went there: still locked').toBeUndefined();
    g.startRun('a1_stonyfield', 0);
    expect(g.passageLock('a1_tristram')).toBeNull();
    // lot 320: the Canyon's lock is the Summoner's portal in the Arcane Sanctuary
    g.startRun('a2_arcane', 0);
    expect(g.passageLock('a2_canyon')).not.toBeNull();
    // marked: a zone walked into later is never opened by the migration again (a new difficulty keeps its locks)
    g.character.progression.highestDifficulty = 1;
    g.character.progression.milestones['zone:a2_canyon'] = 30;
    migrateQuestLocks(g.character);
    expect(g.character.progression.milestones['gate:canyon:1']).toBeUndefined();
  });
});

describe('lot 319 D: the transporters of Diablo II', () => {
  it('Warriv, Meshif and Tyrael: their act only, once its gate is open; the way back is open', () => {
    const g = new Game(undefined, 'sorceress');
    expect(Object.keys(TRAVELERS).sort()).toEqual(['meshif', 'meshif3', 'tyrael', 'warriv', 'warriv2']);
    expect(g.travelOffer('warriv')).toEqual({ to: 'act2', lock: TRAVELERS.warriv.line });
    expect(g.travelOffer('meshif')?.lock).toBe(TRAVELERS.meshif.line);
    expect(g.travelOffer('tyrael')?.lock).toBe(TRAVELERS.tyrael.line);
    expect(g.travelOffer('warriv2')).toEqual({ to: 'act1', lock: null });
    expect(g.travelOffer('akara')).toBeNull();
    expect(g.travel('warriv').ok, 'shut before Andariel').toBe(false);
    done(g, 'andariel');
    expect(g.travelOffer('warriv')?.lock).toBeNull();
    done(g, 'duriel');
    expect(g.travelOffer('meshif')?.lock).toBeNull();
    // Tyrael (Act IV → V): Harrogath is always on the device
    done(g, 'diablo');
    g.enterTown('act4');
    expect(g.travel('tyrael').ok).toBe(true);
    expect(g.world.zone.id).toBe('harrogath');
    expect(g.lastTown).toBe('act5');
  });

  it("a transporter whose act's maps are not on the device says so (the screen opens the waypoint on that act)", () => {
    if (act2Available()) return;
    const g = new Game(undefined, 'sorceress');
    done(g, 'andariel');
    const r = g.travel('warriv');
    expect(r.ok).toBe(false);
    expect(r.maps).toBe(true);
  });

  it('only from a town: no travel from a zone', () => {
    const g = new Game(undefined, 'sorceress');
    done(g, 'andariel');
    g.startRun('a1_coldplains', 0);
    expect(g.travel('warriv').ok).toBe(false);
    expect(g.runDef?.id).toBe('a1_coldplains');
  });

  it('the acts the waypoint lists: Act I, then each act whose gate is open, at the difficulty asked', () => {
    const g = new Game(undefined, 'sorceress');
    expect(g.openActs(0)).toEqual(['act1']);
    done(g, 'andariel');
    done(g, 'duriel');
    expect(g.openActs(0)).toEqual(['act1', 'act2', 'act3']);
    g.character.progression.highestDifficulty = 1;
    expect(g.openActs(1)).toEqual(['act1']);
    done(g, 'mephisto');
    done(g, 'diablo');
    expect(g.openActs(0)).toEqual(['act1', 'act2', 'act3', 'act4', 'act5']);
  });
});

describe('lot 319 D: the waypoint of the Campaign (DOM)', () => {
  beforeEach(() => localStorage.clear());
  const host = (g: Game) =>
    ({
      game: () => g,
      close: vi.fn(),
      onSettingsChanged: vi.fn(),
      haptic: vi.fn(),
      itemSound: vi.fn(),
      message: vi.fn(),
      loadCampaign: vi.fn(async () => undefined),
    }) as unknown as PanelHost;
  const tabs = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.tabs .btn')].map((b) => b.textContent ?? '');

  it('in a zone of the Campaign: the Rush tab (lot 322) beside the Campaign shown, only the open acts, no level asked; at Harrogath the Rush stays', () => {
    const was = { mode: d2Info.mode, local: d2Info.local, locked: d2Info.locked };
    Object.assign(d2Info, { mode: 'on', local: false, locked: false });
    try {
      Game.resetIds();
      const g = new Game(undefined, 'sorceress');
      g.character.level = 1;
      g.startRun('a1_coldplains', 0);
      g.touchWaypoint();
      done(g, 'andariel');
      const root = document.createElement('div');
      document.body.replaceChildren(root);
      const p = new Panels(root, host(g));
      p.show('waypoint');
      const t = tabs(root);
      // lot 322 (owner): the Rush tab is back, the waypoint opened on the Campaign
      expect(
        t.some((x) => /Rush/.test(x)),
        `a Rush tab: ${t.join(' | ')}`,
      ).toBe(true);
      expect(root.querySelector('.tabs .btn.sel')?.textContent).toBe('Campagne');
      expect(t).toContain('Acte I');
      expect(t).toContain('Acte II');
      expect(t).not.toContain('Acte III');
      expect(root.textContent).not.toMatch(/Niveau \d+ requis/);
      // the Cold Plains' waypoint, touched at level 1: a destination (Diablo II asks no level)
      const go = [...root.querySelectorAll<HTMLButtonElement>('.runcard')].find((c) => c.querySelector('h3')?.textContent === RUN_BY_ID.a1_coldplains.name)?.querySelector('button');
      // (without Act I's maps the tab offers their download instead of its cards)
      if (CAMPAIGNS[0].available()) expect(go?.disabled).toBe(false);
      else expect(root.textContent).toMatch(/cartes/);
      // Harrogath, the Rush's hub: both views
      g.enterTown('act5');
      expect(g.campaignActive).toBeNull();
      p.hide();
      p.show('waypoint');
      expect(tabs(root).some((x) => /Rush/.test(x))).toBe(true);
    } finally {
      Object.assign(d2Info, was);
    }
  });
});

const DIR = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps`;

describe.skipIf(!fs.existsSync(DIR))("lot 319 on Diablo II's maps: Duriel's door, Mephisto's red portal, the locked exits", () => {
  beforeAll(() => {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && !/-g\d|-t|^tmp_|^index/.test(x))) {
      const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
      if (j.grid) registerD2Map(parseD2Map(j));
    }
  });
  afterAll(() => clearD2Maps());

  it("the true tomb's door: sealed without the Horadric Staff, open once it is in the orifice", () => {
    const g = new Game(undefined, 'sorceress');
    g.character.level = 30;
    g.startRun('a2_tomb4', 0);
    const tomb = g.world;
    expect(tomb.zone.chamberKind).toBe('lair');
    tomb.events.drain();
    interact(g, 'chamber');
    expect(g.world, 'still in the tomb').toBe(tomb);
    expect(g.passageLock('chamber')).toBe(QUEST_LOCKS.find((l) => l.id === 'chamber')!.hint);
    done(g, 'staff');
    interact(g, 'chamber');
    expect(g.world).not.toBe(tomb);
    expect(g.world.monsters.some((m) => m.def.id === 'duriel') || g.world.pendingSpawns.length > 0).toBe(true);
  }, 300000);

  it('each locked exit is on its map, at the place Diablo II has it, and touched shut it leaves the hero where he is', () => {
    for (const l of QUEST_LOCKS.filter((x) => x.to !== 'chamber')) {
      const g = new Game(undefined, 'sorceress');
      if (l.from.endsWith('_town')) g.enterTown(RUN_BY_ID[l.to].campaign);
      else if (l.from === 'harrogath') g.enterTown('act5');
      else g.startRun(l.from, 0);
      const w = g.world;
      if ((g.mode === 'town' ? w.zone.id : g.runDef?.id) !== l.from) continue;
      // lot 320: a quest's red portal (the Summoner's, Anya's) is not there before its quest, opens when it is done, and leads on
      if (QUEST_PORTALS.some((p) => p.to === l.to)) {
        g.step(1);
        expect(
          w.objects.some((o) => o.kind === 'portal' && o.ref === `zone:${l.to}`),
          `${l.id}: no portal before ${l.quest}`,
        ).toBe(false);
        done(g, l.quest);
        g.step(1);
        const red = w.objects.find((o) => o.kind === 'portal' && o.ref === `zone:${l.to}`);
        expect(red?.variant, `${l.id}: its red portal once ${l.quest} is done`).toBe('red');
        w.events.push({ t: 'interact', kind: 'portal', ref: red!.ref, objectId: red!.id });
        g.step(1);
        expect(g.runDef?.id, `${l.id}: open`).toBe(l.to);
        continue;
      }
      const exit = w.objects.find((o) => o.kind === 'portal' && o.ref === `zone:${l.to}`);
      expect(exit, `${l.id}: the exit to ${l.to} in ${l.from}`).toBeTruthy();
      w.events.push({ t: 'interact', kind: 'portal', ref: exit!.ref, objectId: exit!.id });
      g.step(1);
      expect(g.world, `${l.id}: shut`).toBe(w);
      done(g, l.quest);
      w.events.push({ t: 'interact', kind: 'portal', ref: exit!.ref, objectId: exit!.id });
      g.step(1);
      expect(g.runDef?.id, `${l.id}: open`).toBe(l.to);
    }
  }, 600000);

  it("Mephisto killed in the Campaign's Durance: Diablo II's red portal to the Pandemonium Fortress (no portal home)", () => {
    if (!act3Available()) return;
    const g = new Game(undefined, 'sorceress');
    g.character.level = 30;
    g.startRun('a3_durance3', 0);
    const w = g.world;
    w.pendingSpawns.splice(0).forEach((ps) => (w as unknown as { spawnGroup(i: number): void }).spawnGroup(ps.idx));
    const meph = w.monsters.find((m) => m.def.id === 'mephisto');
    expect(meph).toBeTruthy();
    w.killMonster(meph!, w.player);
    g.step(1);
    expect(g.questDone('mephisto', 0)).toBe(true);
    expect(w.objects.some((o) => o.kind === 'portal' && o.ref === 'town')).toBe(false);
    const red = w.objects.find((o) => o.kind === 'portal' && o.ref === 'act:act4');
    expect(red?.variant).toBe('red');
    interact(g, 'act:act4');
    expect(g.mode).toBe('town');
    expect(g.campaignActive === 'act4' || g.world.zone.id === 'a3_town').toBe(true);
  }, 300000);
});
