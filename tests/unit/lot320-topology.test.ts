// @vitest-environment happy-dom
/**
 * Lot 320 (audit of the Campaign against Diablo II, lots E and G, points 3.12 and 3.14; d2 and pd2): the zones' graph and the ways between
 * them as Diablo II has them.
 * E. The Stony Field reaches the Dark Wood through the Underground Passage (the owner's choice: no seam between them); the Burial Grounds
 *    walked into from the Cold Plains; the Canyon of the Magi by the Summoner's portal only; the Arachnid Lair and the Spider Cavern both
 *    in the Spider Forest, the Swampy Pit in the Flayer Jungle; Act V's way up under the mountain (the Arreat Plateau → the Crystalline
 *    Passage → the Glacial Trail → the Frozen Tundra → the Ancients' Way → the Arreat Summit, the Frozen River, the Drifter Cavern and the
 *    Icy Cellar dead ends below); Nihlathak's Temple by Anya's portal in Harrogath.
 * G. Act IV walked (the Fortress to the City of the Damned, the River of Flame into the Chaos Sanctuary), Kurast walked north through its
 *    gates (the Bazaar, Upper Kurast, the Causeway); a zone entered by a way from another has the hero at its way back there.
 * 3.12: an act opens by difficulty only. 3.14: no Rush vocabulary in the Campaign.
 * The D2 maps are private: the parts on them are skipped without them.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearD2Maps, d2Map, parseD2Map, registerD2Map } from '../../src/data/d2map';
import { QUEST_LOCKS, QUEST_PORTALS } from '../../src/data/quests';
import { CAMPAIGNS } from '../../src/data/campaigns';
import { RUN_BY_ID } from '../../src/data/runs';
import { D2_SIDES, openings } from '../../src/data/zones/seams';
import { A1_CHAINS, act1Joints } from '../../src/data/zones/act1';
import { A4_CHAINS } from '../../src/data/zones/act4';
import { chainJoints } from '../../src/data/zones/seams';
import { MAP_REVISIONS } from '../../tools/d2import/map-revs';
import { MAPS } from '../../tools/d2import/map-specs';
import { Game } from '../../src/sim/game';
import { Tips } from '../../src/ui/tips';

/** The campaign's exits of zone `id`: "to@at" */
const exitsOf = (id: string): string[] => {
  for (const c of CAMPAIGNS) {
    const st = c.steps.find((s) => s.id === id) as { exits?: { to: string; at: string }[] } | undefined;
    if (st) return (st.exits ?? []).map((e) => `${e.to}@${e.at}`);
  }
  return [];
};
const goesTo = (from: string, to: string) => exitsOf(from).some((e) => e.startsWith(`${to}@`));
const enter = (g: Game, id: string) => (g as unknown as { enterCampaignZone(id: string): boolean }).enterCampaignZone(id);

describe("lot 320 E: the zones' graph of Diablo II", () => {
  it('Act I: the Underground Passage between the Stony Field and the Dark Wood, the Burial Grounds beside the Cold Plains', () => {
    expect(goesTo('a1_stonyfield', 'a1_darkwood')).toBe(false);
    expect(goesTo('a1_darkwood', 'a1_stonyfield')).toBe(false);
    expect(exitsOf('a1_stonyfield')).toContain('a1_underpass1@cave');
    expect(exitsOf('a1_darkwood')).toContain('a1_underpass1@cave');
    // the passage's entry from the Stony Field, its far end up to the Dark Wood, its level 2 below it
    expect(exitsOf('a1_underpass1')).toEqual(['a1_stonyfield@prev', 'a1_underpass2@down', 'a1_darkwood@ahead']);
    expect(exitsOf('a1_underpass2')).toEqual(['a1_underpass1@prev']);
    expect(D2_SIDES['a1_stonyfield>a1_darkwood']).toBeUndefined();
    expect(D2_SIDES['a1_coldplains>a1_burial']).toBe('S');
    expect(A1_CHAINS).toEqual([
      ['a1_town', 'a1_bloodmoor', 'a1_coldplains', 'a1_stonyfield'],
      ['a1_darkwood', 'a1_blackmarsh', 'a1_tamoe', 'a1_monastery'],
      ['a1_coldplains', 'a1_burial'],
    ]);
  });

  it('Act II: the Valley of Snakes a dead end, the Canyon of the Magi left by its waypoint, reached by the Summoner’s portal', () => {
    expect(goesTo('a2_valley', 'a2_canyon')).toBe(false);
    expect(exitsOf('a2_canyon').every((e) => e.startsWith('a2_tomb'))).toBe(true);
    expect(QUEST_PORTALS.find((p) => p.to === 'a2_canyon')).toMatchObject({ zone: 'a2_arcane', quest: 'summoner' });
    expect(QUEST_LOCKS.find((l) => l.id === 'canyon')).toMatchObject({ from: 'a2_arcane', to: 'a2_canyon' });
  });

  it("Act III: the Spider Forest's two caves, the Swampy Pit in the Flayer Jungle, none in the Great Marsh", () => {
    expect(exitsOf('a3_spider')).toEqual(expect.arrayContaining(['a3_cave1@cave', 'a3_cave2@cave2']));
    expect(exitsOf('a3_cave1')).toEqual(['a3_spider@prev']);
    expect(exitsOf('a3_cave2')).toEqual(['a3_spider@prev']);
    expect(exitsOf('a3_marsh').some((e) => !/^a3_(spider|jungle)@/.test(e))).toBe(false);
    expect(exitsOf('a3_jungle')).toEqual(expect.arrayContaining(['a3_flayer1@cave', 'a3_pit1@cave2']));
    expect(exitsOf('a3_pit1')[0]).toBe('a3_jungle@prev');
  });

  it("Act V: the way up under the mountain, the dead ends below it; Nihlathak's Temple by Anya's portal", () => {
    expect(goesTo('a5_plateau', 'a5_tundra')).toBe(false);
    expect(exitsOf('a5_plateau')).toContain('a5_crystal1@cave');
    expect(exitsOf('a5_crystal1')).toEqual(['a5_plateau@prev', 'a5_river@down', 'a5_crystal2@ahead']);
    expect(exitsOf('a5_river')).toEqual(['a5_crystal1@prev']);
    expect(exitsOf('a5_crystal2')).toEqual(['a5_crystal1@prev', 'a5_echo@down', 'a5_tundra@ahead']);
    expect(exitsOf('a5_echo')).toEqual(['a5_crystal2@prev']);
    expect(exitsOf('a5_tundra')).toEqual(expect.arrayContaining(['a5_crystal2@cave2', 'a5_glacial1@cave']));
    expect(goesTo('a5_tundra', 'a5_plateau')).toBe(false);
    expect(exitsOf('a5_glacial1')).toEqual(['a5_tundra@prev', 'a5_glacial2@down', 'a5_summit@ahead']);
    expect(exitsOf('a5_glacial2')).toEqual(['a5_glacial1@prev']);
    expect(exitsOf('a5_summit')[0]).toBe('a5_glacial1@prev');
    expect(goesTo('a5_highlands', 'a5_temple')).toBe(false);
    expect(QUEST_PORTALS.find((p) => p.to === 'a5_temple')).toMatchObject({ zone: 'harrogath', quest: 'anya' });
  });

  it('Act IV: one walk from the Fortress to the City of the Damned, the River of Flame and the Chaos Sanctuary joined, the City’s stairs between', () => {
    expect(A4_CHAINS).toEqual([
      ['a4_fortress', 'a4_steppes', 'a4_plains', 'a4_city'],
      ['a4_river', 'a4_chaos'],
    ]);
    expect(exitsOf('a4_city')).toContain('a4_river@ahead');
    expect(exitsOf('a4_river')).toEqual(['a4_city@prev', 'a4_chaos@chaos']);
    for (const k of ['a4_fortress>a4_steppes', 'a4_steppes>a4_plains', 'a4_plains>a4_city', 'a4_river>a4_chaos', 'a3_bazaar>a3_upper', 'a3_upper>a3_causeway']) expect(D2_SIDES[k], k).toBeTruthy();
  });

  it('the maps changed are generated again on the devices (revision 2), the new Chaos Sanctuary map listed', () => {
    for (const id of [
      'a1_underpass1',
      'a3_spider',
      'a3_jungle',
      'a3_lower',
      'a3_bazaar',
      'a3_upper',
      'a4_steppes',
      'a4_plains',
      'a4_city',
      'a4_river',
      'a5_crystal1',
      'a5_crystal2',
      'a5_glacial1',
      'a5_tundra',
    ])
      expect(MAP_REVISIONS[id], id).toBe(2);
    expect(MAPS.find((m) => m.id === 'a4_chaos')?.size).toEqual([73, 96]);
    expect(MAPS.find((m) => m.id === 'chaos')?.size, "the Rush's Chaos Sanctuary untouched").toEqual([73, 97]);
  });
});

describe('lot 320 3.12 and 3.14', () => {
  it('an act opens by difficulty: walked in Normal, shut in Nightmare until its gate dies in Nightmare', () => {
    const g = new Game(undefined, 'sorceress');
    const p = g.character.progression;
    p.milestones['zone:a2_rocky'] = 5;
    p.milestones['wp:a2_dryhills'] = 6;
    p.completions['andariel:0'] = 1;
    p.highestDifficulty = 1;
    expect(g.actLock('act2', 0)).toBeNull();
    expect(g.actLock('act2', 1), 'zones walked in Normal open nothing in Nightmare').not.toBeNull();
    expect(g.openActs(1)).toEqual(['act1']);
    p.highestDifficulty = 2;
    expect(g.actLock('act2', 1), 'a difficulty beaten opens nothing either').not.toBeNull();
    p.completions['a1_andariel:1'] = 1;
    expect(g.actLock('act2', 1)).toBeNull();
    expect(g.openActs(1)).toEqual(['act1', 'act2']);
    expect(g.actLock('act3', 1)).not.toBeNull();
  });

  it("the waypoint's tip in a Campaign town speaks of the act's waypoints, not of runs; no run's tip or banner in a zone of it", () => {
    const g = new Game(undefined, 'sorceress');
    g.enterTown('act1');
    expect(g.campaignActive).toBe('act1');
    const root = document.createElement('div');
    const b = () => document.createElement('button');
    const tips = new Tips(root, { atk: b(), skills: b(), char: b(), inv: b(), hp: b(), skill1: null });
    g.settings.tips = true;
    g.settings.tipsSeen = [];
    tips.trigger(g, 'waypoint');
    tips.update(g, 1, false);
    expect(root.textContent).toMatch(/points de passage déjà touchés/);
    expect(root.textContent).not.toMatch(/runs|Tristram/);
    tips.close();
    // Harrogath (the Rush's hub): the Rush's words
    g.enterTown('act5');
    g.settings.tipsSeen = [];
    tips.trigger(g, 'waypoint');
    tips.update(g, 2, false);
    expect(root.textContent).toMatch(/runs/);
    tips.close();
    // a boss of the Campaign killed: no "Run done" tip
    g.startRun('a1_andariel', 0);
    expect(g.inCampaignZone()).toBe(true);
    g.settings.tipsSeen = [];
    tips.onEvents(g, [{ t: 'runComplete', runId: 'a1_andariel', durationSec: 60 }]);
    tips.update(g, 3, false);
    expect(root.textContent).not.toMatch(/Run terminée/);
    g.startRun('andariel', 0);
    expect(g.inCampaignZone()).toBe(false);
  });
});

const DIR = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps`;

describe.skipIf(!fs.existsSync(DIR))("lot 320 on Diablo II's maps", () => {
  beforeAll(() => {
    for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && !/^index/.test(x))) {
      const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
      if (j.grid) registerD2Map(parseD2Map(j));
    }
  });
  afterAll(() => clearD2Maps());

  it('the joints on their side of Diablo II, at the maps’ gates; Act IV and Kurast walked', () => {
    const j1 = act1Joints().map((j) => `${j.a}>${j.b}:${j.oa.side}`);
    expect(j1).toContain('a1_coldplains>a1_burial:S');
    expect(j1.some((x) => x.startsWith('a1_stonyfield>'))).toBe(false);
    const j4 = chainJoints(A4_CHAINS);
    expect(j4.map((j) => `${j.a}>${j.b}`)).toEqual(['a4_fortress>a4_steppes', 'a4_steppes>a4_plains', 'a4_plains>a4_city', 'a4_river>a4_chaos']);
    for (const j of j4) expect(j.oa.side, `${j.a}>${j.b}`).toBe(D2_SIDES[`${j.a}>${j.b}`]);
    // Kurast's gates: the opening joined is over the gate the importer put in the border
    for (const [id, side] of [
      ['a3_lower', 'N'],
      ['a3_bazaar', 'S'],
      ['a3_bazaar', 'N'],
      ['a3_upper', 'S'],
      ['a3_upper', 'N'],
    ] as const) {
      const g = (d2Map(id)!.raw as { anchors: Record<string, [number, number]> }).anchors[`gate${side}`];
      expect(g, `${id} gate${side}`).toBeTruthy();
      expect(openings(d2Map(id)!).some((o) => o.side === side && g[0] >= o.lo - 2 && g[0] <= o.hi + 2)).toBe(true);
    }
  });

  it('a zone entered by a way from another: the hero at its way back (the Dark Wood by the Underground Passage, a dead end below)', () => {
    const g = new Game(undefined, 'sorceress');
    g.enterTown('act1');
    for (const [from, to] of [
      ['a1_underpass1', 'a1_darkwood'],
      ['a1_underpass1', 'a1_stonyfield'],
      ['a5_crystal1', 'a5_river'],
      ['a4_city', 'a4_river'],
      ['a3_spider', 'a3_cave2'],
    ]) {
      g.startRun(from, 0);
      expect(enter(g, to), `${from} -> ${to}`).toBe(true);
      const w = g.world;
      const back = w.objects.find((o) => o.kind === 'portal' && o.ref === `zone:${from}`)!;
      expect(back, `${to}: its way back to ${from}`).toBeTruthy();
      expect(Math.hypot(w.player.x - back.x, w.player.y - back.y), `${from} -> ${to}: by the way back`).toBeLessThan(5);
      // the ways out of the caves are their stairs (the Underground Passage's two ends, the Frozen River's way up; the spiders' lairs and
      // the River of Flame have no warp tile on their maps: a portal)
      if (from === 'a1_underpass1' || from === 'a5_crystal1') expect(back.variant, `${to} -> ${from}`).toBe('stairs');
    }
    // the passage: its exits are the map's stairs, three apart
    g.startRun('a1_underpass1', 0);
    const st = g.world.objects.filter((o) => o.kind === 'portal' && o.variant === 'stairs');
    expect(st.map((o) => o.ref).sort()).toEqual(['zone:a1_darkwood', 'zone:a1_stonyfield', 'zone:a1_underpass2']);
    expect(st.find((o) => o.ref === 'zone:a1_darkwood')!.label).toMatch(/^Monter/);
  }, 300000);

  it("the Summoner's portal opens by his platform and leads to the Canyon; Anya's opens in Harrogath; neither before", () => {
    const g = new Game(undefined, 'sorceress');
    g.character.level = 30;
    g.startRun('a2_arcane', 0);
    const w = g.world;
    g.step(1);
    expect(w.objects.some((o) => o.kind === 'portal' && o.ref === 'zone:a2_canyon')).toBe(false);
    w.pendingSpawns.splice(0).forEach((ps) => (w as unknown as { spawnGroup(i: number): void }).spawnGroup(ps.idx));
    const summoner = w.monsters.find((m) => m.def.id === 'summoner')!;
    expect(summoner).toBeTruthy();
    w.killMonster(summoner, w.player);
    g.step(2);
    const red = w.objects.find((o) => o.kind === 'portal' && o.ref === 'zone:a2_canyon')!;
    expect(red?.variant).toBe('red');
    expect(Math.hypot(red.x - summoner.x, red.y - summoner.y)).toBeLessThan(12);
    w.events.push({ t: 'interact', kind: 'portal', ref: red.ref, objectId: red.id });
    g.step(1);
    expect(g.runDef?.id).toBe('a2_canyon');
    // the Arcane Sanctuary entered again: its portal there at once
    g.startRun('a2_arcane', 0);
    g.step(1);
    expect(g.world.objects.some((o) => o.kind === 'portal' && o.ref === 'zone:a2_canyon')).toBe(true);
    // Harrogath: Anya's portal once she is freed (this difficulty)
    g.enterTown('act5');
    g.step(1);
    expect(g.world.objects.some((o) => o.kind === 'portal' && o.ref === 'zone:a5_temple')).toBe(false);
    g.completeQuest('anya', 0);
    g.step(1);
    const anya = g.world.objects.find((o) => o.kind === 'portal' && o.ref === 'zone:a5_temple')!;
    expect(anya?.variant).toBe('red');
    g.world.events.push({ t: 'interact', kind: 'portal', ref: anya.ref, objectId: anya.id });
    g.step(1);
    expect(g.runDef?.id).toBe('a5_temple');
    // the temple's red portal back to Harrogath, the act's town
    const home = g.world.objects.find((o) => o.kind === 'portal' && o.ref === 'town');
    expect(home?.variant).toBe('red');
    expect(RUN_BY_ID.a5_temple.campaign).toBe('act5');
  }, 300000);
});
