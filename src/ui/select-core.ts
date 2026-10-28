/**
 * Character selection screen laid out as Diablo II's (LoD 1.13c): pure logic (no DOM), shared by the screen with the Diablo II art and the
 * screen without it. Eight slots, two columns by four rows; more characters scroll by rows of two, as in the game.
 */

export const SELECT_COLS = 2;
export const SELECT_ROWS = 4;
export const SELECT_SLOTS = SELECT_COLS * SELECT_ROWS;

/** Number of rows holding `n` characters */
export function selectRows(n: number): number {
  return Math.ceil(Math.max(0, n) / SELECT_COLS);
}

/** First visible row, kept inside the list (never an empty row at the bottom when the list is long enough) */
export function clampTop(top: number, n: number): number {
  return Math.max(0, Math.min(Math.floor(top), selectRows(n) - SELECT_ROWS));
}

/** First visible row so that character `index` is visible (unchanged when it already is) */
export function revealTop(top: number, index: number, n: number): number {
  const row = Math.floor(Math.max(0, index) / SELECT_COLS);
  let t = clampTop(top, n);
  if (row < t) t = row;
  else if (row >= t + SELECT_ROWS) t = row - SELECT_ROWS + 1;
  return clampTop(t, n);
}

/** Indices of the visible characters: [start, end) */
export function visibleRange(top: number, n: number): [number, number] {
  const start = clampTop(top, n) * SELECT_COLS;
  return [start, Math.min(n, start + SELECT_SLOTS)];
}

/** After scrolling: the selection stays when it is still visible, otherwise the nearest visible character is selected */
export function keepVisible<T extends { slot: string }>(chars: readonly T[], selected: string | null, top: number): string | null {
  const [a, b] = visibleRange(top, chars.length);
  const i = chars.findIndex((c) => c.slot === selected);
  if (i >= a && i < b) return selected;
  return chars[i < a ? a : b - 1]?.slot ?? null;
}

/** Scroll position for the scroll buttons and their label ("1-8 / 11"); null when everything fits */
export function scrollInfo(top: number, n: number): { up: boolean; down: boolean; label: string } | null {
  if (n <= SELECT_SLOTS) return null;
  const t = clampTop(top, n);
  const [a, b] = visibleRange(t, n);
  return { up: t > 0, down: t < selectRows(n) - SELECT_ROWS, label: `${a + 1}-${b} / ${n}` };
}

/** Selection moved with the arrow keys (left/right: next slot, up/down: row above/below), kept inside the list */
export function moveSelection(index: number, key: string, n: number): number {
  if (n <= 0) return -1;
  const step = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : key === 'ArrowUp' ? -SELECT_COLS : key === 'ArrowDown' ? SELECT_COLS : 0;
  const next = index + step;
  return next < 0 || next >= n ? index : next;
}

/** Second tap (or click) on the same slot shortly after the first: play, like a double-click in the game */
export interface Tap {
  slot: string;
  t: number;
}
export const DOUBLE_TAP_MS = 450;
export function isDoubleTap(prev: Tap | null, slot: string, t: number, ms = DOUBLE_TAP_MS): boolean {
  return !!prev && prev.slot === slot && t - prev.t >= 0 && t - prev.t <= ms;
}

/**
 * Layout of the selection screen: the game's 800 × 600 screen (`stage`, scaled) for a mouse when it is shown at least at 90 % of its size;
 * otherwise (touch screens, small windows) the same organisation laid out on the whole screen (`compact`), every target at least 44 px
 */
export function selectLayout(w: number, h: number, coarse: boolean): 'stage' | 'compact' {
  return !coarse && Math.min(w / 800, h / 600) >= 0.9 ? 'stage' : 'compact';
}

/** Compact layout: buttons on one row when the screen is wider than tall (landscape), else two by two */
export function barColumns(w: number, h: number): 2 | 4 {
  return w > h ? 4 : 2;
}
