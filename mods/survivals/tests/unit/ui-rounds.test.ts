// @vitest-environment happy-dom
/**
 * Waypoint section and HUD of the rounds (lot 275, S2): the rounds of the act (first open, the others locked until the previous
 * checkpoint), "Resume" on the first open round not cleared, a round started from the section; the HUD shows time, live monsters and the
 * next event during a round only.
 */
import { describe, expect, it, vi } from 'vitest';
import { activate } from './activate';

const noop = () => undefined;
const host = { message: noop, haptic: noop, itemSound: noop };
const screen = { open: () => ({ close: noop }) };

describe('Waypoint section', () => {
  it('lists the rounds act by act, opens them one by one, resumes at the last checkpoint', async () => {
    const { G, U } = await activate();
    const g = new G.Game(undefined, 'sorceress');
    let closed = 0;
    const ctx = { game: g, host, screen, render: noop, close: () => void closed++ };
    const [section] = U.contributions('town.waypoint').map((f) => f(ctx)!);
    const plays = [...section.querySelectorAll<HTMLButtonElement>('button[data-round]')];
    expect(plays.map((b) => b.dataset.round)).toEqual(['a1r1', 'a1r2', 'a1r3', 'a1r4', 'a1r5', 'a1r6', 'a1r7']);
    expect(plays.map((b) => b.disabled)).toEqual([false, true, true, true, true, true, true]);
    expect(section.textContent).toContain('Reprendre : Lande sanglante');
    g.character.progression.milestones['survivals:cp:0:a1r1'] = 10;
    const [again] = U.contributions('town.waypoint').map((f) => f(ctx)!);
    expect([...again.querySelectorAll<HTMLButtonElement>('button[data-round]')].map((b) => b.disabled).slice(0, 3)).toEqual([false, false, true]);
    expect(again.textContent).toContain('Reprendre : Plaines glacées');
    expect(again.textContent).toContain('Terminée');
    // one act listed (Act II not reached); Andariel killed: Act II listed and unfolded, Act I folded, "Resume" on its first round
    expect([...again.querySelectorAll<HTMLDetailsElement>('details[data-act]')].map((x) => [x.dataset.act, x.open])).toEqual([['1', true]]);
    for (let i = 1; i <= 7; i++) g.character.progression.milestones[`survivals:cp:0:a1r${i}`] ??= 10;
    const [act2] = U.contributions('town.waypoint').map((f) => f(ctx)!);
    expect([...act2.querySelectorAll<HTMLDetailsElement>('details[data-act]')].map((x) => [x.dataset.act, x.open])).toEqual([
      ['1', false],
      ['2', true],
    ]);
    expect(act2.textContent).toContain('Reprendre : Égouts de Lut Gholein');
    expect(act2.querySelector<HTMLButtonElement>('button[data-round="a2r1"]')!.disabled).toBe(false);
    expect(act2.querySelector<HTMLButtonElement>('button[data-round="a2r2"]')!.disabled).toBe(true);
    for (let i = 2; i <= 7; i++) delete g.character.progression.milestones[`survivals:cp:0:a1r${i}`];
    again.querySelector<HTMLButtonElement>('button[data-round="a1r2"]')!.click();
    expect(closed).toBe(1);
    expect(g.mode).toBe('run');
    expect(g.runDef?.id).toBe('survivals:a1r2');
    vi.resetModules();
  });
});

describe('HUD of a round', () => {
  it('in town the hub (next round, quick panels), in a round the row (time, live monsters, next event, pause); base controls hidden', async () => {
    const { G, U, R } = await activate();
    const g = new G.Game(undefined, 'sorceress');
    const panels: string[] = [];
    const opened: HTMLElement[] = [];
    const scr = { open: (n: HTMLElement) => (opened.push(n), document.body.append(n), { close: () => n.remove() }) };
    const [w] = U.contributions('hud').map((f) => f({ game: g, host: { ...host, openPanel: (n: string) => void panels.push(n) }, screen: scr })!);
    const now = vi.spyOn(performance, 'now');
    let t = 1000;
    now.mockImplementation(() => (t += 300));
    w.update!(g);
    const row = w.el.querySelector<HTMLElement>('[data-sv="hud"]')!;
    const hub = w.el.querySelector<HTMLElement>('[data-sv="hub"]')!;
    expect(g.mode).toBe('town');
    expect(row.style.display).toBe('none');
    expect(hub.style.display).toBe('');
    expect(hub.textContent).toContain('Jouer : Lande sanglante');
    // the base's controls hidden in town and in a round (rule `ui.hudHidden`), none before the mode's game
    expect(R.RULES['ui.hudHidden'](g)).toContain('potions');
    expect(R.RULES['ui.hudHidden'](g)).toContain('inventory');
    for (const name of ['character', 'inventory', 'skills', 'stash', 'vendor', 'settings', 'waypoint']) hub.querySelector<HTMLButtonElement>(`[data-panel="${name}"]`)!.click();
    expect(panels).toEqual(['character', 'inventory', 'skills', 'stash', 'vendor', 'settings', 'waypoint']);
    hub.querySelector<HTMLButtonElement>('[data-sv="play"]')!.click();
    expect(g.runDef?.id).toBe('survivals:a1r1');
    for (let i = 0; i <= 25 * 30; i++) {
      g.step(1);
      g.world.player.hp = g.world.player.hpMax;
    }
    w.update!(g);
    expect(row.style.display).toBe('');
    expect(hub.style.display).toBe('none');
    expect(R.RULES['ui.hudHidden'](g)).toEqual(expect.arrayContaining(['settings', 'empty-skills', 'page', 'context', 'tips']));
    expect(w.el.querySelector('[data-sv="time"]')!.textContent).toBe('0:30');
    expect(w.el.querySelector('[data-sv="pop"]')!.textContent).toMatch(/^\d+ \/ 5$/);
    expect(w.el.querySelector('[data-sv="next"]')!.textContent).toBe('Champions 2:00');
    // no other button in the row than the pause: the settings are in the pause
    expect([...row.querySelectorAll('button')].map((b) => b.dataset.sv)).toEqual(['pause']);
    row.querySelector<HTMLButtonElement>('[data-sv="pause"]')!.click();
    const pause = opened[opened.length - 1];
    expect(pause.dataset.svScreen).toBe('pause');
    // lot 290: no automatic attack switch (everything is automatic)
    expect(pause.querySelector('[data-sv="auto-attack"]')).toBeNull();
    pause.querySelector<HTMLButtonElement>('[data-sv="options"]')!.click();
    expect(panels[panels.length - 1]).toBe('settings');
    row.querySelector<HTMLButtonElement>('[data-sv="pause"]')!.click();
    opened[opened.length - 1].querySelector<HTMLButtonElement>('[data-sv="leave"]')!.click();
    expect(g.mode).toBe('town');
    now.mockRestore();
    vi.resetModules();
  });

  it('a character just created starts its first round at once, without potion nor key', async () => {
    const { G, U } = await activate();
    const g = new G.Game(undefined, 'sorceress');
    g.character.materials.key = 3;
    for (const f of U.contributions('create.character')) f({ game: g });
    expect(g.character.belt.every((b) => b.qty === 0)).toBe(true);
    expect(g.character.materials.key).toBeUndefined();
    const [w] = U.contributions('hud').map((f) => f({ game: g, host, screen })!);
    w.update!(g);
    expect(g.mode).toBe('run');
    expect(g.runDef?.id).toBe('survivals:a1r1');
    vi.resetModules();
  });
});
