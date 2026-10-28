// @vitest-environment happy-dom
/**
 * Generic hooks of lot 285 (Survivals tested on the owner's phone), inert without a game mode:
 * - rule `ui.hudHidden` (controls of the HUD hidden: none in the base) and its style sheet (src/ui/hud-parts.ts);
 * - rule `shop.consumable` (every consumable sold in the base);
 * - `ZoneDef.monsterPool`: the sprite sheets of a game mode's monsters without spawn entries (and of those alive) loaded with the zone;
 * Lot 286: rule `ui.settings` (a game mode's settings page: none in the base), the main menu's layout (the title under the logo, the
 * modes then one row of links), "Import a D2 character" hidden behind a flag, the Discord link.
 * - the tap zones of the seven heroes on the Diablo II creation screen (the sprites' frames overlap: the Barbarian and the Necromancer
 *   could not be chosen).
 */
import { describe, expect, it } from 'vitest';
import { RULES as BASE_RULES } from '../../src/mods/rules';
import { applyHudHidden, HUD_PARTS, hudHiddenCss } from '../../src/ui/hud-parts';
import { heroHitColumns, linkWidth, menuLayout } from '../../src/ui/d2charselect';
import { D2_IMPORT_OFFERED, DISCORD_URL, d2ImportShown } from '../../src/platform/build-flags';
import { sheetsForImpl } from '../../src/render/renderer-assets';
import type { Game } from '../../src/sim/game';

describe('HUD controls hidden by a game mode (rule `ui.hudHidden`)', () => {
  it('none in the base; a sheet hiding the parts named, rewritten only when the list changes', () => {
    expect(BASE_RULES['ui.hudHidden']({} as Game)).toEqual([]);
    expect(hudHiddenCss([])).toBe('');
    expect(hudHiddenCss(['nothing'])).toBe('');
    const css = hudHiddenCss(['potions', 'empty-skills']);
    expect(css).toContain('#hud [data-testid="potion-hp"]');
    expect(css).toContain('#hud .sbtn:not(.main):not(.small):not([data-skill])');
    expect(css).toMatch(/display: none !important;/);
    for (const sel of Object.values(HUD_PARTS)) expect(() => document.querySelectorAll(sel)).not.toThrow();
    applyHudHidden([]);
    expect(document.getElementById('hud-hidden')).toBeNull();
    applyHudHidden(['settings']);
    expect(document.getElementById('hud-hidden')!.textContent).toContain('[data-testid="settings"]');
    applyHudHidden([]);
    expect(document.getElementById('hud-hidden')!.textContent).toBe('');
  });

  it('every consumable is sold in the base (rule `shop.consumable`)', () => {
    for (const id of ['hp_potion', 'mp_potion', 'key', 'tome_portal', 'fulminating_potion']) expect(BASE_RULES['shop.consumable']({} as Game, id)).toBe(true);
  });
});

describe("A game mode's monsters without spawn entries (`ZoneDef.monsterPool`)", () => {
  const bank = { has: () => false, get: () => undefined, isImported: () => false, sheetOf: (id: string) => `m_${id}`, strict: false };
  const world = (pool: string[] | undefined, alive: string[]) =>
    ({
      character: { classId: 'sorceress', equipment: {}, skills: {} },
      player: { d: { skillLevels: {} } },
      zone: { id: 'z', ground: 'grass', patches: [], walls: [], spawns: [{ monster: 'zombie' }], props: [], objects: [], monsterPool: pool },
      monsters: alive.map((id) => ({ dead: false, def: { id } })),
      pendingSpawns: [],
      run: null,
    }) as never;
  const ids = (w: never) => sheetsForImpl.call({ bank } as never, w);

  it("the zone's spawns only without a pool (the base); the pool and the monsters alive with one", () => {
    const base = ids(world(undefined, ['fallen']));
    expect(base.filter((x) => x.startsWith('m_'))).toEqual(['m_zombie']);
    const mode = ids(world(['quill_rat'], ['fallen']));
    expect(mode.filter((x) => x.startsWith('m_')).sort()).toEqual(['m_fallen', 'm_quill_rat', 'm_zombie']);
  });
});

describe('Diablo II creation screen: tap zones of the heroes', () => {
  it('seven columns side by side, left to right, each wide enough, every hero under its own column', () => {
    const cols = heroHitColumns();
    expect(cols.map(([id]) => id)).toEqual(['amazon', 'assassin', 'necromancer', 'barbarian', 'sorceress', 'paladin', 'druid']);
    for (let i = 1; i < cols.length; i++) expect(cols[i][1]).toBe(cols[i - 1][2]);
    for (const [, l, r] of cols) expect(r - l).toBeGreaterThanOrEqual(50);
    // figures measured on the stage (the Necromancer at 305, the Barbarian at 393, behind the Assassin's and the Sorceress's frames)
    const at = (x: number) => cols.find(([, l, r]) => x >= l && x < r)?.[0];
    expect(at(305)).toBe('necromancer');
    expect(at(393)).toBe('barbarian');
    expect(at(241)).toBe('assassin');
  });
});

describe("A game mode's settings page (rule `ui.settings`)", () => {
  it("none in the base: the base's panel (categories, search) unchanged", () => {
    expect(BASE_RULES['ui.settings']({} as Game)).toBeNull();
  });
});

describe('Main menu (lot 286)', () => {
  it('the title under the logo band, the modes 44 px apart (never overlapping up to 6), the links as small stone buttons in the top-right corner (lot 292d)', () => {
    for (const n of [1, 2, 4, 5, 6]) {
      const widths = ['Se connecter', 'Survivals : comment jouer', 'Crédits', 'Discord'].map(linkWidth);
      const m = menuLayout(n, widths);
      expect(m.ask).toBeGreaterThanOrEqual(236);
      expect(m.play[0]).toBeGreaterThanOrEqual(m.ask + 20);
      for (let i = 1; i < n; i++) expect(m.play[i] - m.play[i - 1]).toBeGreaterThanOrEqual(n <= 5 ? 44 : 40);
      expect(m.play[n - 1] + 40).toBeLessThanOrEqual(556);
      // lot 292d: the links stacked in the top-right corner, beside the logo, never over each other nor out of the stage
      for (const [x, w, y] of m.links) {
        expect(x).toBeGreaterThanOrEqual(560);
        expect(x + w).toBeLessThanOrEqual(800);
        expect(y).toBeGreaterThanOrEqual(0);
      }
      for (let i = 1; i < m.links.length; i++) expect(m.links[i][2]).toBeGreaterThanOrEqual(m.links[i - 1][2] + 30);
    }
  });

  it('"Import a D2 character" hidden for now (flag), shown with ?d2import=1; the Discord server', () => {
    expect(D2_IMPORT_OFFERED).toBe(false);
    expect(d2ImportShown('')).toBe(false);
    expect(d2ImportShown('?d2import=1')).toBe(true);
    expect(DISCORD_URL).toBe('https://discord.gg/j6w8YVauR');
  });
});
