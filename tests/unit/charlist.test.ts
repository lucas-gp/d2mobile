// @vitest-environment happy-dom
/**
 * Character selection laid out as in Diablo II (charlist.ts, select-core.ts): eight slots in two columns, scrolling by rows, double tap,
 * confirmation before deleting, keyboard; the Diablo II screens (d2charselect.ts) with interface art: mode buttons on the main menu, list
 * of the session's mode, logo anchored as in the game, the old logo shown still.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { charList, type CharListOptions } from '../../src/ui/charlist';
import { barColumns, clampTop, isDoubleTap, keepVisible, moveSelection, revealTop, scrollInfo, selectLayout, selectRows, visibleRange } from '../../src/ui/select-core';
import type { CharSummary } from '../../src/platform/platform';
import type { ScreenMods } from '../../src/ui/charselect-mods';
import { d2Logo, loadD2Ui } from '../../src/ui/d2ui';
import { d2CharacterScreen } from '../../src/ui/d2charselect';
import { CLASS_IDS } from '../../src/data/classes';
import { verbatim } from '../../src/i18n';

const char = (i: number, ruleset = 'ov', classId: CharSummary['classId'] = 'sorceress'): CharSummary => ({
  slot: `s${i}`,
  name: `C${i}`,
  classId,
  level: i + 1,
  difficulty: i % 3,
  savedAt: 100 - i,
  ruleset,
});
const chars = (n: number) => Array.from({ length: n }, (_, i) => char(i));

describe('select-core', () => {
  it('rows of two, first visible row kept inside the list, selection revealed', () => {
    expect(selectRows(0)).toBe(0);
    expect(selectRows(11)).toBe(6);
    expect(clampTop(5, 11)).toBe(2);
    expect(clampTop(-3, 11)).toBe(0);
    expect(clampTop(1, 8)).toBe(0);
    expect(revealTop(0, 10, 11)).toBe(2);
    expect(revealTop(2, 1, 11)).toBe(0);
    expect(revealTop(1, 4, 11)).toBe(1);
    expect(visibleRange(2, 11)).toEqual([4, 11]);
    expect(visibleRange(0, 3)).toEqual([0, 3]);
  });

  it('scroll buttons only past eight characters; the selection follows the scroll', () => {
    expect(scrollInfo(0, 8)).toBeNull();
    expect(scrollInfo(0, 11)).toEqual({ up: false, down: true, label: '1-8 / 11' });
    expect(scrollInfo(9, 11)).toEqual({ up: true, down: false, label: '5-11 / 11' });
    const list = chars(11);
    expect(keepVisible(list, 's5', 1)).toBe('s5');
    expect(keepVisible(list, 's0', 1)).toBe('s2');
    expect(keepVisible(list, 's10', 0)).toBe('s7');
    expect(keepVisible(list, null, 0)).toBe('s0');
  });

  it('arrow keys, double tap, layout', () => {
    expect(moveSelection(0, 'ArrowRight', 3)).toBe(1);
    expect(moveSelection(0, 'ArrowLeft', 3)).toBe(0);
    expect(moveSelection(1, 'ArrowDown', 4)).toBe(3);
    expect(moveSelection(1, 'ArrowDown', 3)).toBe(1);
    expect(moveSelection(2, 'ArrowUp', 3)).toBe(0);
    expect(moveSelection(2, 'x', 3)).toBe(2);
    expect(moveSelection(0, 'ArrowRight', 0)).toBe(-1);
    expect(isDoubleTap(null, 'a', 10)).toBe(false);
    expect(isDoubleTap({ slot: 'a', t: 0 }, 'a', 300)).toBe(true);
    expect(isDoubleTap({ slot: 'a', t: 0 }, 'b', 300)).toBe(false);
    expect(isDoubleTap({ slot: 'a', t: 0 }, 'a', 900)).toBe(false);
    // mouse on a large window: the game's screen; touch, or a small window: the whole-screen layout
    expect(selectLayout(1280, 800, false)).toBe('stage');
    expect(selectLayout(884, 1104, true)).toBe('compact');
    expect(selectLayout(700, 500, false)).toBe('compact');
    expect(barColumns(882, 344)).toBe(4);
    expect(barColumns(344, 882)).toBe(2);
  });
});

describe('charList view', () => {
  let on: { [K in keyof CharListOptions['on']]: ReturnType<typeof vi.fn> };
  const view = (over: Partial<CharListOptions> = {}): HTMLElement => {
    const v = charList({
      chars: chars(11),
      selected: 's0',
      top: 0,
      layout: 'compact',
      art: false,
      problem: (c) => (c.ruleset === 'gone' ? 'Mod absent' : null),
      exit: true,
      on: on as unknown as CharListOptions['on'],
      ...over,
    });
    document.body.replaceChildren(v);
    return v;
  };
  const q = (v: HTMLElement, sel: string) => {
    const e = v.querySelector<HTMLElement>(sel);
    if (!e) throw new Error(`absent: ${sel}`);
    return e;
  };
  beforeEach(() => {
    on = { select: vi.fn(), play: vi.fn(), create: vi.fn(), remove: vi.fn(), exit: vi.fn(), scroll: vi.fn() };
  });

  it('eight slots in the game order, the selected one framed, name at the top, level and class, difficulty', () => {
    const v = view({ mode: 'Refonte' });
    const slots = [...v.querySelectorAll<HTMLElement>('.sel-slot')];
    expect(slots.map((s) => s.dataset.slot)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7']);
    expect(slots[0].classList.contains('sel')).toBe(true);
    expect(q(v, '.sel-big').textContent).toBe('C0');
    expect(q(v, '.sel-mode').textContent).toBe('Refonte');
    expect(slots[1].querySelector('.sel-lvl')?.textContent).toBe('Niveau 2 Sorcière');
    expect(slots[1].querySelector('.sel-diff')?.textContent).toBe('Cauchemar');
    // without the Diablo II art: the class icon
    expect(slots[0].querySelector('.sel-fig.noart .icon')).toBeTruthy();
    expect([...v.querySelectorAll<HTMLElement>('.sel-btn')].map((b) => b.dataset.act)).toEqual(['create', 'delete', 'exit', 'play']);
    q(v, '[data-act="create"]').click();
    q(v, '[data-act="exit"]').click();
    q(v, '[data-act="play"]').click();
    slots[3].click();
    expect([on.create, on.exit].map((f) => f.mock.calls.length)).toEqual([1, 1]);
    expect(on.play).toHaveBeenCalledWith('s0');
    expect(on.select).toHaveBeenCalledWith('s3');
  });

  it('scrolling: arrows, label, wheel, swipe; the selected character is revealed', () => {
    const v = view({ selected: 's10' });
    expect(q(v, '.sel-count').textContent).toBe('5-11 / 11');
    expect((q(v, '[data-act="down"]') as HTMLButtonElement).disabled).toBe(true);
    q(v, '[data-act="up"]').click();
    expect(on.scroll).toHaveBeenLastCalledWith(1);
    q(v, '.sel-grid').dispatchEvent(new WheelEvent('wheel', { deltaY: -50, cancelable: true }));
    expect(on.scroll).toHaveBeenLastCalledWith(1);
    const grid = q(v, '.sel-grid');
    const touch = (type: string, y: number) => {
      const e = new Event(type) as Event & { touches: unknown; changedTouches: unknown };
      e.touches = [{ clientY: y }];
      e.changedTouches = [{ clientY: y }];
      grid.dispatchEvent(e);
    };
    touch('touchstart', 300);
    touch('touchend', 200);
    expect(on.scroll).toHaveBeenLastCalledWith(3);
    // eight or fewer: no scroll buttons
    expect(view({ chars: chars(8) }).querySelector('.sel-scroll')).toBeNull();
  });

  it('delete asks first ("No" keeps, "Yes" deletes); a greyed character cannot be played', () => {
    const v = view({ chars: [char(0), { ...char(1), ruleset: 'gone' }], selected: 's1' });
    expect((q(v, '[data-act="play"]') as HTMLButtonElement).disabled).toBe(true);
    expect(q(v, '.sel-title .err').textContent).toMatch(/Conservé tel quel/);
    expect(q(v, '.sel-slot.off .sel-off').textContent).toBe('Mod absent');
    q(v, '[data-act="delete"]').click();
    expect(q(v, '.sel-confirm p').textContent).toBe(`Êtes-vous sûr de vouloir supprimer ${verbatim('C1')} ?`);
    q(v, '[data-act="confirm-no"]').click();
    expect(v.querySelector('.sel-confirm')).toBeNull();
    expect(on.remove).not.toHaveBeenCalled();
    q(v, '[data-act="delete"]').click();
    q(v, '[data-act="confirm-yes"]').click();
    expect(on.remove).toHaveBeenCalledWith('s1');
  });

  it('keyboard: arrows select, Enter plays, Escape exits; ignored once the view is gone', () => {
    const v = view({ chars: chars(4), selected: 's1' });
    const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
    key('ArrowDown');
    expect(on.select).toHaveBeenLastCalledWith('s3');
    key('ArrowUp');
    expect(on.select).toHaveBeenCalledTimes(1);
    key('Enter');
    expect(on.play).toHaveBeenCalledWith('s1');
    key('Escape');
    expect(on.exit).toHaveBeenCalledOnce();
    v.remove();
    key('Enter');
    expect(on.play).toHaveBeenCalledOnce();
  });
});

describe('Diablo II screens with the interface art', () => {
  beforeAll(async () => {
    const files: Record<string, object> = {
      'menu-bg': { w: 800, h: 600 },
      'select-bg': { w: 800, h: 600 },
      'create-bg': { w: 800, h: 600 },
      'btn-wide': { w: 272, h: 35 },
      'btn-medium': { w: 128, h: 35 },
      logo: { w: 1800, h: 510, frames: 15, cols: 5, cw: 360, ch: 170, ax: 180, ay: 110 },
    };
    for (const c of CLASS_IDS) for (const a of ['nu1', 'fw', 'nu3', 'bw']) files[`hero-${c}-${a}`] = { w: 800, h: 200, frames: 8, cols: 8, cw: 100, ch: 200, ax: 50, ay: 140 };
    URL.createObjectURL ??= () => 'blob:x';
    const enc = new TextEncoder();
    await loadD2Ui(async (p) => (p === 'ui/ui.json' ? enc.encode(JSON.stringify({ rev: 2, files })) : new Uint8Array([1])));
  });
  afterEach(() => document.body.replaceChildren());

  const mods = (over: Partial<ScreenMods> = {}): ScreenMods => ({
    options: {
      contents: [
        { id: 'ov', name: 'Refonte' },
        { id: 'd2', name: 'Diablo II (original)' },
      ],
      modes: [],
    },
    problem: () => null,
    menu: [],
    mode: 'ov',
    ...over,
  });

  it('logo anchored as in the game; main menu: one button per mode, the session mode marked', () => {
    expect(d2Logo()?.ax).toBe(180);
    const root = document.createElement('div');
    document.body.append(root);
    const switchMode = vi.fn(() => true);
    void d2CharacterScreen(root, () => [char(0, 'ov'), char(1, 'd2')], vi.fn(), mods({ switchMode }));
    const modes = [...root.querySelectorAll<HTMLElement>('[data-act="mode"]')];
    expect(modes.map((b) => b.dataset.mode)).toEqual(['ov', 'd2']);
    expect(modes[0].classList.contains('cur')).toBe(true);
    // logo: anchor (400, 120) minus the anchor inside the cell
    const logo = root.querySelector<HTMLElement>('.d2-sprite');
    expect([logo?.style.left, logo?.style.top]).toEqual(['220px', '10px']);
    modes[1].click();
    expect(switchMode).toHaveBeenCalledWith('d2');
    // list of that mode only (the session runs it after the switch)
    expect([...root.querySelectorAll<HTMLElement>('.sel-slot')].map((s) => s.dataset.slot)).toEqual(['s0']);
  });

  it('lot 318: home screen in two steps (Normal / Survivals, then the game, with Back and Escape); the same ids; the remembered mode marked', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const switchMode = vi.fn(() => false);
    const options = {
      contents: [
        { id: 'pd2', name: 'Project Diablo 2', tagline: 'Saison 13' },
        { id: 'd2', name: 'Diablo II (original)', tagline: 'Le jeu d’origine' },
      ],
      modes: [{ id: 'survivals', name: 'Survivals', tagline: 'Des runs d’un acte', rulesets: ['d2', 'pd2'] }],
    };
    void d2CharacterScreen(root, () => [char(0, 'pd2'), char(1, 'd2+survivals')], vi.fn(), mods({ options, mode: 'd2+survivals', switchMode }));
    const box = root.querySelector<HTMLElement>('.charselect')!;
    const kinds = [...root.querySelectorAll<HTMLElement>('[data-act="modetype"]')];
    expect(kinds.map((b) => [b.dataset.type, b.textContent])).toEqual([
      ['normal', 'Normal'],
      ['survivals', 'Survivals'],
    ]);
    expect(root.querySelector('[data-act="mode"]')).toBeNull();
    expect(box.dataset.step).toBe('kind');
    expect(kinds[1].classList.contains('cur')).toBe(true);
    // the few words under each kind
    expect([...root.querySelectorAll('.d2t.mdesc')].map((t) => t.textContent)).toEqual(['Campagne et fin de jeu', 'Des runs d’un acte']);
    kinds[1].click();
    expect(box.dataset.step).toBe('game');
    const games = [...root.querySelectorAll<HTMLElement>('[data-act="mode"]')];
    expect(games.map((b) => [b.dataset.mode, b.textContent])).toEqual([
      ['pd2+survivals', 'Project Diablo 2'],
      ['d2+survivals', 'Diablo II (original)'],
    ]);
    expect(games[1].classList.contains('cur')).toBe(true);
    expect(root.textContent).toContain('Survivals — choisissez le jeu');
    // under each game its few words, laid under its button on the stage
    const tags = [...root.querySelectorAll<HTMLElement>('.d2t.mdesc')];
    expect(tags.map((t) => t.textContent)).toEqual(['Saison 13', 'Le jeu d’origine']);
    expect(parseFloat(tags[0].style.top)).toBeGreaterThan(parseFloat(games[0].style.top));
    expect(parseFloat(tags[0].style.top)).toBeLessThan(parseFloat(games[1].style.top));
    // Back, then Escape, to the kinds
    root.querySelector<HTMLElement>('[data-act="modeback"]')!.click();
    expect(box.dataset.step).toBe('kind');
    root.querySelector<HTMLElement>('[data-type="normal"]')!.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(box.dataset.step).toBe('kind');
    root.querySelector<HTMLElement>('[data-type="normal"]')!.click();
    root.querySelector<HTMLElement>('[data-mode="d2"]')!.click();
    expect(switchMode).toHaveBeenCalledWith('d2');
  });

  it('list after a reload for a mode; the game layout on a large window with a mouse; double click plays; Exit to the menu', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const p = d2CharacterScreen(root, () => [char(0, 'ov', 'amazon'), char(1, 'ov', 'druid')], vi.fn(), mods({ openList: true, options: { contents: [{ id: 'ov', name: 'Refonte' }], modes: [] } }));
    const box = root.querySelector<HTMLElement>('.charselect')!;
    expect(root.querySelector('.charlist.compact')).toBeTruthy();
    Object.defineProperty(box, 'clientWidth', { value: 1280, configurable: true });
    Object.defineProperty(box, 'clientHeight', { value: 800, configurable: true });
    root.querySelector<HTMLElement>('[data-slot="s1"]')!.click();
    const stage = root.querySelector('.d2stage .charlist.stage');
    expect(stage).toBeTruthy();
    // the selected character stands in its slot, scaled to the slot
    expect(stage!.querySelector('.sel-slot.sel .sel-sprite')).toBeTruthy();
    root.querySelector<HTMLElement>('[data-act="exit"]')!.click();
    expect(root.querySelector('.charlist')).toBeNull();
    root.querySelector<HTMLElement>('.d2b.main')!.click();
    // a single tap a long time after the previous one only selects; two taps in a row play
    const now = vi.spyOn(performance, 'now').mockReturnValue(1e9);
    root.querySelector<HTMLElement>('[data-slot="s1"]')!.click();
    expect(root.querySelector('[data-slot="s1"]')).toBeTruthy();
    now.mockReturnValue(1e9 + 200);
    root.querySelector<HTMLElement>('[data-slot="s1"]')!.click();
    now.mockRestore();
    expect(await p).toEqual({ play: 's1' });
  });

  it('art generated before revision 2: the old logo, still (its first frame), until the interface is generated again', async () => {
    vi.resetModules();
    const fresh = await import('../../src/ui/d2ui');
    await fresh.loadD2Ui(async (p) =>
      p === 'ui/ui.json' ? new TextEncoder().encode(JSON.stringify({ files: { 'logo-fire': { w: 1850, h: 510, frames: 15, cols: 5, cw: 370, ch: 170 } } })) : new Uint8Array([1]),
    );
    expect(fresh.d2Logo()).toMatchObject({ frames: 1, ax: 174, ay: 118, cw: 370 });
  });
});
