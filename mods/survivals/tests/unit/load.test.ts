/**
 * Loading and unloading the Survivals mode (lot 274, S1): a game mode on `d2` (and `pd2` from lot 284), inert in `d2` and `pd2` (no rule replaced, no screen,
 * landscape only), active in `d2+survivals` (portrait allowed, wider camera, settings, menu button, starting state); translations
 * complete, none overriding the base's.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { extractStrings } from '../../../../tools/i18n/extract-lib';
import base from '../../../../src/i18n/en.json';
import EN from '../../i18n/en.json';
import manifestDef from '../../manifest';
import { survivalsZoom } from '../../index';
import { activate } from './activate';

describe('Survivals: manifest and rulesets', () => {
  it('game mode on Diablo II and, from lot 284, on Project Diablo 2 (tests/unit/pd2.test.ts)', async () => {
    expect(manifestDef).toMatchObject({ id: 'survivals', kind: 'gamemode', rulesets: ['d2', 'pd2'] });
    const { A } = await activate('d2');
    expect(A.gameModesFor('d2').map((m) => m.id)).toEqual(['survivals']);
    expect(A.rulesetProblem('d2+survivals')).toBeNull();
    // the overhaul is not given to this module graph (manifest of the mode only): a pd2 character is refused for its missing mod
    expect(A.rulesetProblem('pd2+survivals')).toMatch(/pd2/);
    vi.resetModules();
  });

  it('inert without the mode: d2 alone replaces no hook, shows no screen', async () => {
    const { R, U } = await activate('d2');
    for (const r of ['game.autopilot', 'skills.offer', 'skills.manualLearn', 'death.xpPenalty', 'ui.orientation', 'render.zoom'] as const) expect(R.ruleOwner(r)).toBeUndefined();
    for (const s of U.UI_SLOT_NAMES) expect(U.contributions(s)).toEqual([]);
    vi.resetModules();
  });

  it('active in d2+survivals: portrait allowed, wider camera, settings, menu button, new characters in the Rogue Encampment', async () => {
    const { R, U, S, G, A } = await activate();
    expect(A.activeModIds()).toEqual(['survivals']);
    const g = new G.Game(undefined, 'sorceress');
    expect(R.RULES['ui.orientation'](g)).toBe('any');
    expect(R.ruleOwner('ui.orientation')).toBe('survivals');
    expect(R.RULES['render.zoom'](g, 1.1, { width: 390, height: 844 })).toBeCloseTo(390 / (45.25 * 16), 5);
    expect(S.modSettingOwner('control')).toBe('survivals');
    expect(S.modSettingDefaults()).toMatchObject({ control: 'semi', density: 90, stats: 'balanced', cards: 'choose' });
    expect(U.contributions('menu.buttons').map((b) => b.label)).toEqual(['Survivals : comment jouer']);
    g.lastTown = 'act5';
    for (const f of U.contributions('create.character')) f({ game: g });
    expect(g.lastTown).toBe('act1');
    // lot 289: Run by default
    expect(g.character.progression.milestones['survivals:mode']).toBe(1);
    // the content rules stay those of Diablo II; the death penalty is the mode's (none in a run, Diablo II's in the Campaign, lot 289)
    for (const r of ['loot.rates', 'xp.levelFactor', 'world.tick'] as const) expect(R.ruleOwner(r)).toBeUndefined();
    expect(R.ruleOwner('death.xpPenalty')).toBe('survivals');
    vi.resetModules();
  });
});

describe('Survivals: camera', () => {
  it('at least 16 units across the shorter side (lot 287), never below 0.5, never closer than the base', () => {
    expect(survivalsZoom(1.1, { width: 390, height: 844 })).toBeCloseTo(0.539, 2);
    expect(survivalsZoom(0.93, { width: 844, height: 390 })).toBeCloseTo(0.539, 2);
    expect(survivalsZoom(0.8, { width: 882, height: 344 })).toBe(0.5);
    expect(survivalsZoom(1.1, { width: 884, height: 1104 })).toBe(1.1);
    expect(survivalsZoom(1.1, { width: 300, height: 300 })).toBe(0.5);
    // the unfolded Fold in landscape: 1104 × 884, wide enough already (17.8 units at the base's 1.1)
    expect(survivalsZoom(1.1, { width: 1104, height: 884 })).toBe(1.1);
  });
});

describe('Survivals: translations', () => {
  it('every French text of the mod has its English translation (base or mod), and the mod never overrides the base', () => {
    const have = new Set([...Object.keys(base), ...Object.keys(EN), ...Object.keys(manifestDef.i18n ?? {})]);
    const missing = [...extractStrings('.', ['mods/survivals']).keys()].filter(
      (k) => /[àâçéèêëîïôùûœ’]|\b(le|la|les|des|du|de|une?|et|vous|votre)\b/i.test(k) && !have.has(k) && !/^Survivals: /.test(k),
    );
    expect(missing).toEqual([]);
    expect(Object.keys(EN).filter((k) => Object.hasOwn(base, k))).toEqual([]);
    expect(existsSync('mods/survivals/i18n/en.json')).toBe(true);
    expect(JSON.parse(readFileSync('mods/survivals/i18n/en.json', 'utf8'))).toEqual(EN);
  });
});
