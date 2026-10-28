// @vitest-environment happy-dom
/**
 * Lot 322 (owner: "keep a Rush tab when the waypoint opens, so the player may switch to the Rush at any time"): the Campaign's waypoint
 * (its towns and zones, d2 and pd2) has its Rush tab back beside the Campaign's (lot 319 had removed it), opened on the Campaign.
 * Checked: a Rush run started from it is a run apart (the Campaign zone left kept for the session, no Campaign milestone, no quest lock
 * passed or lifted), its way home is Harrogath, whose waypoint leads back to the Campaign, the zone as it was left; lot 319's rest kept.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RUN_BY_ID } from '../../src/data/runs';
import { CAMPAIGNS } from '../../src/data/campaigns';
import { QUEST_LOCKS } from '../../src/data/quests';
import { Game } from '../../src/sim/game';
import { Panels } from '../../src/ui/panels';
import type { PanelHost } from '../../src/ui/panels-shared';
import { d2Info } from '../../src/render/assets';

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
const tabBtns = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('.tabs .btn')];
const tabs = (root: HTMLElement) => tabBtns(root).map((b) => b.textContent ?? '');
const sel = (root: HTMLElement) => root.querySelector('.tabs .btn.sel')?.textContent ?? null;
const tab = (root: HTMLElement, re: RegExp) => tabBtns(root).find((b) => re.test(b.textContent ?? ''));
/** The waypoint card of run `id` (its name), its first difficulty's button */
const cardBtn = (root: HTMLElement, id: string) =>
  [...root.querySelectorAll<HTMLElement>('.runcard')].find((c) => c.querySelector('h3')?.textContent === RUN_BY_ID[id].name)?.querySelector<HTMLButtonElement>('.diffs button') ?? null;

describe('lot 322: the Rush tab in the waypoint of the Campaign', () => {
  beforeEach(() => localStorage.clear());

  it('in a town and a zone of the Campaign: the Rush tab beside the Campaign, the Campaign shown first', () => {
    const was = { mode: d2Info.mode, local: d2Info.local, locked: d2Info.locked };
    Object.assign(d2Info, { mode: 'on', local: false, locked: false });
    try {
      Game.resetIds();
      const g = new Game(undefined, 'sorceress');
      const root = document.createElement('div');
      document.body.replaceChildren(root);
      const p = new Panels(root, host(g));
      for (const go of [() => g.startRun('a1_coldplains', 0), () => g.startRun('a1_stonyfield', 0)]) {
        go();
        expect(g.campaignActive).toBe('act1');
        p.hide();
        p.show('waypoint');
        expect(tabs(root).filter((t) => /Rush/.test(t))).toHaveLength(1);
        expect(tabs(root)).toContain('Campagne');
        expect(sel(root)).toBe('Campagne');
        // lot 319 kept: Act I only before Andariel, no level asked
        expect(tabs(root)).toContain('Acte I');
        expect(tabs(root)).not.toContain('Acte II');
        expect(root.textContent).not.toMatch(/Niveau \d+ requis/);
        // the Rush tab: the Rush's runs, its Campaign tab back
        tab(root, /Rush/)!.click();
        expect(sel(root)).toMatch(/Rush/);
        expect(cardBtn(root, 'countess')).toBeTruthy();
        expect(cardBtn(root, 'baal')).toBeTruthy();
        tab(root, /Campagne/)!.click();
        expect(sel(root)).toBe('Campagne');
        expect(cardBtn(root, 'countess')).toBeNull();
      }
      // the Rush view chosen, then the waypoint reopened in the Campaign: on the Campaign again (its act and difficulty)
      tab(root, /Rush/)!.click();
      p.hide();
      p.show('waypoint');
      expect(sel(root)).toBe('Campagne');
    } finally {
      Object.assign(d2Info, was);
    }
  });

  it('a Rush run from a zone of the Campaign: a run apart, Harrogath home, the Campaign back as it was, its locks kept', () => {
    const was = { mode: d2Info.mode, local: d2Info.local, locked: d2Info.locked };
    Object.assign(d2Info, { mode: 'on', local: false, locked: false });
    try {
      Game.resetIds();
      const g = new Game(undefined, 'sorceress');
      g.character.level = 40;
      g.world.refreshPlayer();
      g.startRun('a1_stonyfield', 0);
      g.touchWaypoint();
      const stony = g.world;
      const tristram = QUEST_LOCKS.find((l) => l.from === 'a1_stonyfield' && l.to === 'a1_tristram')!;
      expect(g.passageLock('a1_tristram')).toBe(tristram.hint);
      const prog = g.character.progression;
      const before = { milestones: { ...prog.milestones }, completions: { ...prog.completions }, gold: g.character.gold };
      const root = document.createElement('div');
      document.body.replaceChildren(root);
      const p = new Panels(root, host(g));
      p.show('waypoint');
      tab(root, /Rush/)!.click();
      const b = cardBtn(root, 'countess');
      expect(b?.disabled).toBe(false);
      b!.click();
      // the Rush's Countess: a run apart, its portal home, no Campaign
      expect(g.mode).toBe('run');
      expect(g.runDef?.id).toBe('countess');
      expect(g.campaignActive).toBeNull();
      expect(g.inCampaignZone()).toBe(false);
      expect(g.world.objects.some((o) => o.kind === 'portal' && o.ref === 'town')).toBe(true);
      expect(g.passageLock('a1_tristram')).toBeNull();
      // the Stony Field left is kept for the session
      expect(g.kept.peek('a1_stonyfield', 0)).toBe(stony);
      // no Campaign milestone from the Rush (no zone, no waypoint), nothing of the Campaign lost
      const added = Object.keys(prog.milestones).filter((k) => !(k in before.milestones));
      expect(added.filter((k) => /^(zone|wp):/.test(k))).toEqual([]);
      for (const [k, v] of Object.entries(before.milestones)) expect(prog.milestones[k], k).toBe(v);
      for (const [k, v] of Object.entries(before.completions)) expect(prog.completions[k], k).toBe(v);
      // home: Harrogath (the Rush's hub), its waypoint with both views, the Rush still there
      g.enterTown();
      expect(g.world.zone.id).toBe('harrogath');
      expect(g.campaignActive).toBeNull();
      p.hide();
      p.show('waypoint');
      expect(tabs(root).some((t) => /Rush/.test(t))).toBe(true);
      expect(tabs(root)).toContain('Campagne');
      tab(root, /Rush/)!.click();
      expect(cardBtn(root, 'countess')?.disabled).toBe(false);
      // back to the Campaign from Harrogath's waypoint: the Stony Field as it was left, its lock still shut
      tab(root, /Campagne/)!.click();
      const go = cardBtn(root, 'a1_stonyfield');
      if (CAMPAIGNS[0].available()) {
        expect(go?.disabled).toBe(false);
        go!.click();
      } else g.startRun('a1_stonyfield', 0);
      expect(g.runDef?.id).toBe('a1_stonyfield');
      expect(g.campaignActive).toBe('act1');
      expect(g.world).toBe(stony);
      expect(g.passageLock('a1_tristram')).toBe(tristram.hint);
      expect(prog.milestones['wp:a1_stonyfield']).toBe(before.milestones['wp:a1_stonyfield']);
    } finally {
      Object.assign(d2Info, was);
    }
  });
});
