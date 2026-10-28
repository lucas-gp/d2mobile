// @vitest-environment happy-dom
/**
 * Generic hooks of lot 287 (Survivals tested on the owner's phone held upright), inert without a game mode:
 * - rule `ui.joystick` (the floating joystick's place: null in the base, the base's zone and buttons) and its layout (src/ui/joystick-layout.ts);
 * - the screen's orientation: the menus never lock it, `any` unlocks it (never `lock('any')`), the base's landscape is locked in a game;
 * - the structures of a D2 map a game mode leaves undrawn (`ZoneDef.d2Map.hidden`: none in the base).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RULES as BASE_RULES } from '../../src/mods/rules';
import { buttonsOnLeft, JOY_ZONE_TOP, joystickZoneStyle, skillColumn } from '../../src/ui/joystick-layout';
import type { Game } from '../../src/sim/game';

describe('floating joystick of a game mode (rule `ui.joystick`)', () => {
  it('null in the base: the style sheet keeps the zone, the left-handed setting the buttons, the arc the skills', () => {
    expect(BASE_RULES['ui.joystick']({} as Game, { width: 390, height: 844, leftHanded: false })).toBeNull();
    expect(joystickZoneStyle(null, 390, 844, 0)).toBeNull();
    expect(buttonsOnLeft(null, false)).toBe(false);
    expect(buttonsOnLeft(null, true)).toBe(true);
    expect(skillColumn(null, true, 300, 750, 1.25)).toBeNull();
  });

  it('centre: the whole width of the lower two thirds, the skills in a column over the attack in portrait only', () => {
    const z = joystickZoneStyle('center', 390, 844, 0)!;
    expect(z).toMatchObject({ left: '0', right: '0', width: 'auto' });
    expect(parseFloat(z.top)).toBeCloseTo(844 * JOY_ZONE_TOP, 0);
    // never above the HUD's top band on a short screen
    expect(parseFloat(joystickZoneStyle('center', 844, 150, 20)!.top)).toBe(84);
    const col = skillColumn('center', true, 300, 750, 1)!;
    expect(col).toHaveLength(4);
    expect(col.every((c) => c.x === 300 && c.y < 750)).toBe(true);
    expect(col[1].y).toBeLessThan(col[0].y);
    expect(skillColumn('center', false, 300, 750, 1)).toBeNull();
    expect(buttonsOnLeft('center', false)).toBe(false);
    expect(buttonsOnLeft('center', true)).toBe(true);
  });

  it('a side: half the width, the buttons on the other side whatever the left-handed setting', () => {
    expect(joystickZoneStyle('left', 844, 390, 0)).toMatchObject({ left: '0', right: 'auto', width: '422px' });
    expect(joystickZoneStyle('right', 844, 390, 0)).toMatchObject({ left: 'auto', right: '0', width: '422px' });
    expect(buttonsOnLeft('right', false)).toBe(true);
    expect(buttonsOnLeft('left', true)).toBe(false);
  });
});

describe('orientation of the screen (lot 287: the menus follow the device)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('nothing locked before a game (lot 290: not even on the menus after the fullscreen); landscape locked by the base once its game is on screen, `any` unlocks it', async () => {
    vi.resetModules();
    const calls: string[] = [];
    vi.stubGlobal('screen', { orientation: { lock: (o: string) => (calls.push(o), Promise.resolve()), unlock: () => calls.push('unlock') } });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const P = await import('../../src/platform/platform');
    // the first touch of the menus: fullscreen asked, the screen not locked (lot 290, owner's Fold: it turned twice at the launch)
    await P.enterFullscreenLandscape();
    expect(calls).toEqual([]);
    // the base's game on screen: landscape
    P.setOrientationPolicy('landscape');
    expect(calls).toEqual(['landscape']);
    P.setOrientationPolicy('any');
    expect(calls).toEqual(['landscape', 'unlock']);
    P.setOrientationPolicy('landscape');
    expect(calls).toEqual(['landscape', 'unlock', 'landscape']);
  });

  it('a game playable in any orientation (Survivals) never locks nor unlocks the screen (lot 290)', async () => {
    vi.resetModules();
    const calls: string[] = [];
    vi.stubGlobal('screen', { orientation: { lock: (o: string) => (calls.push(o), Promise.resolve()), unlock: () => calls.push('unlock') } });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const P = await import('../../src/platform/platform');
    await P.enterFullscreenLandscape();
    P.setOrientationPolicy('any');
    await P.enterFullscreenLandscape();
    P.setOrientationPolicy('any');
    expect(calls).toEqual([]);
  });
});
