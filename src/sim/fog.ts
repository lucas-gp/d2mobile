/**
 * Explored cells of a zone, as Diablo II's automap remembers them (lot 321; first written for the Survivals' arenas, lot 307, and moved
 * here so the Campaign's automap and the Survivals' share it): a rectangle cut in cells of `cell` units, a cell explored once the hero has
 * come within `r` units of its centre, kept as long as its world lives (the Campaign keeps a zone's world for the session, lot 316, so
 * its map is remembered until the game is left, as in Diablo II).
 */

/** A rectangle of the world (units) */
export interface FogBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Side of a cell (units) and units around the hero explored, by default */
export const FOG_CELL = 2;
export const FOG_REVEAL = 14;

export class Fog {
  readonly cols: number;
  readonly rows: number;
  readonly seen: Uint8Array;
  /** Cells explored so far */
  count = 0;
  /** Bumped at each reveal that explored a cell (an automap redraws its layer then) */
  epoch = 0;
  /** Cells explored by the last reveals, not yet drawn by an automap (taken by `takeNew`) */
  private fresh: number[] = [];

  constructor(
    readonly box: FogBox,
    readonly cell = FOG_CELL,
  ) {
    this.cols = Math.max(1, Math.ceil((box.x1 - box.x0) / cell));
    this.rows = Math.max(1, Math.ceil((box.y1 - box.y0) / cell));
    this.seen = new Uint8Array(this.cols * this.rows);
  }

  get total(): number {
    return this.cols * this.rows;
  }

  /** Cell index of a point (−1 outside the box) */
  cellOf(x: number, y: number): number {
    const cx = Math.floor((x - this.box.x0) / this.cell);
    const cy = Math.floor((y - this.box.y0) / this.cell);
    return cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows ? -1 : cy * this.cols + cx;
  }

  /** Is the point in an explored cell? */
  isSeen(x: number, y: number): boolean {
    const i = this.cellOf(x, y);
    return i >= 0 && this.seen[i] === 1;
  }

  /** The cells whose centre lies within `r` units of (x, y) explored; the number newly explored */
  reveal(x: number, y: number, r = FOG_REVEAL): number {
    const c = this.cell;
    const cx0 = Math.max(0, Math.floor((x - r - this.box.x0) / c));
    const cy0 = Math.max(0, Math.floor((y - r - this.box.y0) / c));
    const cx1 = Math.min(this.cols - 1, Math.floor((x + r - this.box.x0) / c));
    const cy1 = Math.min(this.rows - 1, Math.floor((y + r - this.box.y0) / c));
    let n = 0;
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const i = cy * this.cols + cx;
        if (this.seen[i]) continue;
        const mx = this.box.x0 + (cx + 0.5) * c;
        const my = this.box.y0 + (cy + 0.5) * c;
        if ((mx - x) ** 2 + (my - y) ** 2 > r * r) continue;
        this.seen[i] = 1;
        this.fresh.push(i);
        n++;
      }
    if (n) {
      this.count += n;
      this.epoch++;
    }
    return n;
  }

  /** The cells explored since the last call (an automap's layer draws them once) */
  takeNew(): number[] {
    const out = this.fresh;
    this.fresh = [];
    return out;
  }

  /** Share of the box explored (0 to 1) */
  get share(): number {
    return this.count / this.total;
  }
}

/** Lot 321: the Campaign's automap memory, one a world (the whole zone's grid), made at its first call */
const ZONE_FOGS = new WeakMap<object, Fog>();

/** The explored cells of a world's whole grid (`grid`: its collision grid, cells of `gridCell` units) */
export function zoneFogOf(w: { grid: { cols: number; rows: number } }, gridCell: number): Fog {
  let f = ZONE_FOGS.get(w);
  if (!f) ZONE_FOGS.set(w, (f = new Fog({ x0: 0, y0: 0, x1: w.grid.cols * gridCell, y1: w.grid.rows * gridCell })));
  return f;
}

/** The world's automap memory if it has one */
export function zoneFogIf(w: object): Fog | undefined {
  return ZONE_FOGS.get(w);
}
