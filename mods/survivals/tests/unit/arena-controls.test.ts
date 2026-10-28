// @vitest-environment happy-dom
/**
 * Lot 287 (owner's test on his phone held upright, Blood Moor arena full of trees; comparison with another survivors game): the arena's
 * trees thinned (the map's trees left undrawn inside the arena but a few along its border, their trunks freed, never a wall's case), the
 * floating joystick's place (rule `ui.joystick`, setting "Joystick"), the cards' figures and keys.
 */
import { describe, expect, it, vi } from 'vitest';
import { activate } from './activate';

/** A D2 map of 40 × 40 cases (200 × 200 sub-tiles): a tree on every other case, a wall on one, water (fully blocked) under a tree */
function forest() {
  const cases = 40;
  const cols = cases * 5;
  const blocked = new Uint8Array(cols * cols);
  const opaque = new Uint8Array(cols * cols);
  const places: number[][] = [];
  const trunk = (tx: number, ty: number) => {
    const i = (ty * 5 + 2) * cols + tx * 5 + 2;
    blocked[i] = 1;
    opaque[i] = 1;
  };
  for (let ty = 0; ty < cases; ty++)
    for (let tx = 0; tx < cases; tx++) {
      if ((tx + ty) % 2) continue;
      places.push([0, 0, 0, tx, ty, 0, 14]);
      trunk(tx, ty);
    }
  // a wall on the case (10, 10) (it also holds a tree): kept blocked
  places.push([1, 0, 0, 10, 10, 0, 1]);
  for (let y = 50; y < 55; y++) for (let x = 50; x < 55; x++) blocked[y * cols + x] = 1;
  // water under the tree of (20, 20): the whole case blocked, the tree stays
  for (let y = 100; y < 105; y++) for (let x = 100; x < 105; x++) blocked[y * cols + x] = 1;
  return { id: 'a1_test', cases: [cases, cases] as [number, number], units: [100, 100] as [number, number], grid: { cols, rows: cols, blocked, opaque }, objects: [], landmarks: {}, raw: { places } };
}

describe('Survivals: the arena thinned (lot 287)', () => {
  it('trees inside the window undrawn but about a third of the border ring, trunks freed, walls and water kept, the map untouched', async () => {
    await activate();
    const { thinTrees, TREE_RING, TREE_KEEP } = await import('../../sim/arena');
    const m = forest();
    const before = m.grid.blocked.slice();
    const box = { x0: 10, y0: 10, x1: 90, y1: 90 };
    const t = thinTrees(m, box, 'a1r1');
    const places = (m.raw as { places: number[][] }).places;
    const centre = (p: number[]) => [(p[3] + 0.5) * 2.5, (p[4] + 0.5) * 2.5];
    const inside = places.map((p, i) => [p, i] as const).filter(([p]) => p[6] === 14 && centre(p)[0] >= box.x0 && centre(p)[0] < box.x1 && centre(p)[1] >= box.y0 && centre(p)[1] < box.y1);
    const hidden = new Set(t.hidden);
    const ring = inside.filter(([p]) => {
      const [u, v] = centre(p);
      return Math.min(u - box.x0, box.x1 - u, v - box.y0, box.y1 - v) < TREE_RING;
    });
    const middle = inside.filter((x) => !ring.includes(x));
    // the middle: every tree undrawn but the ones on a wall's case or in water
    expect(middle.filter(([, i]) => !hidden.has(i)).map(([p]) => `${p[3]},${p[4]}`)).toEqual(['10,10', '20,20']);
    // the ring: about TREE_KEEP of them kept
    const keptRing = ring.filter(([, i]) => !hidden.has(i)).length;
    expect(keptRing / ring.length).toBeGreaterThan(TREE_KEEP * 0.5);
    expect(keptRing / ring.length).toBeLessThan(TREE_KEEP * 1.6);
    expect(t.kept).toBe(keptRing);
    // outside the window: untouched
    expect(places.some((p, i) => p[6] === 14 && centre(p)[0] < box.x0 && hidden.has(i))).toBe(false);
    // trunks freed under the undrawn trees, never the wall's case nor the water
    const cell = (tx: number, ty: number) => (ty * 5 + 2) * m.grid.cols + tx * 5 + 2;
    expect(t.blocked[cell(16, 16)]).toBe(0);
    expect(t.opaque[cell(16, 16)]).toBe(0);
    expect(t.blocked[cell(10, 10)]).toBe(1);
    expect(t.blocked[cell(20, 20)]).toBe(1);
    // the map's own grid is never changed; same result each time (the round's key)
    expect(m.grid.blocked).toEqual(before);
    expect(thinTrees(m, box, 'a1r1').hidden).toEqual(t.hidden);
    // a map without its structures (raw absent): nothing changed
    const bare = { ...m, raw: {} };
    const n = thinTrees(bare, box, 'a1r1');
    expect(n.hidden).toEqual([]);
    expect(n.blocked).toBe(m.grid.blocked);
  });

  it('the arena cut from a map: hidden trees and a freed copy of the grid in its zone', async () => {
    await activate();
    const { registerD2Map } = await import('../../../../src/data/d2map');
    const m = forest();
    registerD2Map({ ...m, id: 'a1_bloodmoor' });
    const { buildArena } = await import('../../sim/arena');
    const { ROUND_BY_ID } = await import('../../data/chapters');
    const r = { ...ROUND_BY_ID.a1r1, boss: undefined };
    const a = buildArena(r, 1);
    expect(a.cut).toBe(true);
    expect(a.zone.d2Map!.hidden!.length).toBeGreaterThan(100);
    expect(a.zone.d2Map!.blocked).not.toBe(m.grid.blocked);
  });
});

describe('Survivals: the floating joystick (rule `ui.joystick`)', () => {
  it('automatic: the centre held upright, the thumb side in landscape (right for a left-handed player); the setting overrides', async () => {
    const { G, R } = await activate();
    const g = new G.Game(undefined, 'sorceress');
    const at = (width: number, height: number, leftHanded = false) => R.RULES['ui.joystick'](g, { width, height, leftHanded });
    expect(R.ruleOwner('ui.joystick')).toBe('survivals');
    expect(at(390, 844)).toBe('center');
    expect(at(344, 882, true)).toBe('center');
    expect(at(844, 390)).toBe('left');
    expect(at(844, 390, true)).toBe('right');
    for (const v of ['left', 'center', 'right'] as const) {
      g.settings.mods = { survivals: { joystick: v } };
      expect(at(390, 844)).toBe(v);
      expect(at(844, 390, true)).toBe(v);
    }
    g.settings.mods = { survivals: { joystick: 'nonsense' } };
    expect(at(390, 844)).toBe('center');
  });
});

describe('Survivals: the cards (lot 287)', () => {
  it('each card numbered (keys 1 to 3) with its figures, current → next; the key takes it, Escape keeps the point', async () => {
    vi.useFakeTimers();
    const { G, U, P } = await activate();
    const { cardFigures, CARD_FIGURES } = await import('../../ui/levelup');
    const g = new G.Game(undefined, 'sorceress');
    g.startRun('survivals:a1r1', 0, 1);
    const figs = cardFigures(g, 'fire_bolt');
    expect(figs.length).toBeGreaterThan(0);
    expect(figs.length).toBeLessThanOrEqual(CARD_FIGURES);
    expect(cardFigures(g, 'no_such_skill')).toEqual([]);
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const host = { message: () => undefined, haptic: () => undefined, itemSound: () => undefined };
    const gate = new U.LevelUpGate((level) => {
      for (const f of U.contributions('levelUp')) f({ game: g, host, screen, level });
    });
    const screen = {
      open: (node: HTMLElement) => {
        root.append(node);
        gate.screenOpened();
        return { close: () => node.isConnected && (node.remove(), gate.screenClosed()) };
      },
    };
    P.gainXp(g.world, P.xpToReach(3));
    for (const e of g.step(1)) if (e.t === 'levelUp') gate.push(e.level);
    expect(g.offers.length).toBe(2);
    let cards = [...root.querySelectorAll<HTMLElement>('.sv-card')];
    expect(cards.map((c) => c.querySelector('.sv-key')?.textContent)).toEqual(['1', '2', '3']);
    expect(root.querySelectorAll('.sv-fig').length).toBeGreaterThan(0);
    // a figure "now → next" once the skill is learned, the next level only before
    for (const c of cards) {
      const id = c.dataset.skill!;
      const f = cardFigures(g, id);
      if (f.length) expect(f[0].value.includes('→')).toBe((g.world.player.d.skillLevels[id] ?? 0) > 0);
    }
    const pick = cards[1].dataset.skill!;
    const lvl = g.character.skills[pick] ?? 0;
    // locked for 0.5 s: a key does nothing yet
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    expect(g.character.skills[pick] ?? 0).toBe(lvl);
    vi.advanceTimersByTime(600);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    expect(g.character.skills[pick]).toBe(lvl + 1);
    // the next level's screen: Escape keeps the point
    expect(g.offers.length).toBe(1);
    vi.advanceTimersByTime(600);
    cards = [...root.querySelectorAll<HTMLElement>('.sv-card')];
    expect(cards.length).toBe(3);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(g.offers).toEqual([]);
    expect(g.character.skillPoints).toBe(1);
    vi.useRealTimers();
  });
});
