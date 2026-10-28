// @vitest-environment happy-dom
/**
 * The mode's settings page (lot 286, owner's screenshot: "far fewer settings"): the base's settings panel shows, on one flat page, the
 * mode's own rows first then the few options of the base it keeps (rule `ui.settings`); no search box, no folded category; a row changes
 * the mode's setting. The hub and the pause open this panel (no second settings screen of the mode).
 */
import { describe, expect, it, vi } from 'vitest';
import { activate } from './activate';
import { KEPT_SETTINGS } from '../../ui/menu';

const noop = () => undefined;

describe('Settings of the mode', () => {
  it('one flat page: the mode rows first, the base options kept, none of the others; a row writes the mode setting', async () => {
    const { G, R } = await activate();
    const { Panels } = await import('../../../../src/ui/panels');
    const g = new G.Game(undefined, 'sorceress');
    const layout = R.RULES['ui.settings'](g)!;
    expect(layout.keep).toEqual(KEPT_SETTINGS);
    expect(layout.rows!.map((r) => r.key)).toEqual(['control', 'joystick', 'cards', 'stats', 'density', 'adaptive']);
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const host = { game: () => g, close: noop, onSettingsChanged: vi.fn(), message: noop, haptic: noop, itemSound: noop, resetTips: noop, switchCharacter: noop };
    const p = new Panels(root, host as never);
    p.show('settings');
    expect(root.querySelector('.set-search')).toBeNull();
    expect(root.querySelector('.setcat')).toBeNull();
    const opts = [...root.querySelectorAll<HTMLElement>('.setopt')].map((o) => o.dataset.opt!);
    expect(opts.slice(0, 6)).toEqual(['control', 'joystick', 'cards', 'stats', 'density', 'adaptive']);
    for (const k of ['lang', 'sound', 'music', 'leftHanded', 'quality', 'damageNumbers', 'switchChar']) expect(opts).toContain(k);
    for (const k of ['lootRate', 'lootFilter', 'autoPickupRunes', 'beltRefill', 'durability', 'zoom', 'imageSharpen', 'exportSave', 'credits', 'confirmCorrupt']) expect(opts).not.toContain(k);
    expect(opts.length).toBeLessThanOrEqual(KEPT_SETTINGS.length + 6);
    // headings: the mode's title, then a category only over two options or more in a row (no heading over the language alone)
    const heads = [...root.querySelectorAll('.set-flat > .lvl')].map((h) => h.textContent);
    expect(heads[0]).toBe('Survivals');
    expect(heads).toContain('Son');
    expect(heads).not.toContain('Jeu');
    const auto = [...root.querySelectorAll<HTMLButtonElement>('[data-opt="control"] .btn')].find((b) => b.textContent === 'Automatique')!;
    auto.click();
    expect(g.settings.mods?.survivals?.control).toBe('auto');
    expect(host.onSettingsChanged).toHaveBeenCalled();
    expect(root.querySelector('[data-opt="control"] .btn.sel')!.textContent).toBe('Automatique');
    // the default value underlined, as in the base's panel
    expect(root.querySelector('[data-opt="control"] .btn.dflt')!.textContent).toBe('Semi-automatique');
    vi.resetModules();
  });

  it('the hub and the pause open the settings panel; the waypoint has no settings of its own', async () => {
    const { G, U } = await activate();
    const g = new G.Game(undefined, 'sorceress');
    const panels: string[] = [];
    const host = { message: noop, haptic: noop, itemSound: noop, openPanel: (n: string) => void panels.push(n) };
    const [w] = U.contributions('hud').map((f) => f({ game: g, host, screen: { open: () => ({ close: noop }) } })!);
    w.update!(g);
    const hub = w.el.querySelector<HTMLElement>('[data-sv="hub"]')!;
    expect(hub.querySelector('[data-sv="mode-settings"]')).toBeNull();
    hub.querySelector<HTMLButtonElement>('[data-panel="settings"]')!.click();
    expect(panels).toEqual(['settings']);
    const [section] = U.contributions('town.waypoint').map((f) => f({ game: g, host, screen: { open: () => ({ close: noop }) }, render: noop, close: noop })!);
    expect(section.querySelector('[data-setting]')).toBeNull();
    vi.resetModules();
  });
});
