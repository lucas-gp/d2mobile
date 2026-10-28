/**
 * Lot 311 — seams between outdoor zones (owner: "I cannot leave the Rogue Encampment … I want no black zone between the town and the next
 * zone, to walk straight from one zone to the other as if it were one zone, as in the real game").
 *
 * In Diablo II the Rogue Encampment, the Blood Moor and the plains after it are separate levels laid side by side: the camp's palisade has
 * a gate on the level's edge and the Blood Moor's tiles go on beyond it. Our maps are one per zone (the town's DS1, the outdoor zones
 * assembled from Act I's pieces): each map's edge is blocked but for its openings, the walkable runs that reach the map's border (the
 * camp's gate; the gaps of the border pieces `bord*` of an outdoor zone). Two consecutive zones are joined edge to edge at a pair of
 * openings on facing sides (A's north to B's south…), the openings' middles aligned and the maps overlapping by `OVERLAP` units (the last
 * two rows of each map are walls: in the overlap both are walkable, so the hero changes zone while walking). This module finds the
 * openings and plans the chain of an act; `act1.ts` applies it (exits, entry, collision of the overlap) and the renderer draws the
 * neighbour's map beyond the edge (src/render/renderer.ts, `D2MapView` with an offset).
 */
import { d2Map, type D2MapData } from '../d2map';

export type Side = 'N' | 'S' | 'W' | 'E';

/** An opening of a map's edge: the side, the run along it (world units: x for N and S, y for W and E) */
export interface Opening {
  side: Side;
  lo: number;
  hi: number;
}

/** Overlap of two joined maps (world units): two D2 cases */
export const OVERLAP = 5;
/** The hero crosses into the neighbour when he is closer than this to his map's edge (in the overlap) */
export const CROSS_DEPTH = 2;
/** Part of the neighbour's map drawn and loaded (world units around the opening, each way) */
export const SEAM_VIEW = 44;

/** Seam of a zone toward a neighbour: where the neighbour's map lies and where the hero crosses */
export interface SeamDef {
  /** neighbour zone id (its D2 map id the same) */
  to: string;
  /** the neighbour's origin in this zone's coordinates: a point q of the neighbour is drawn at q + at */
  at: { x: number; y: number };
  /** where the hero crosses (this zone's coordinates, [x0, y0, x1, y1]) */
  cross: readonly [number, number, number, number];
  /** the neighbour's part drawn (its own coordinates) */
  view: readonly [number, number, number, number];
  /** Lot 314: the neighbour's structures not drawn (its trees thinned out, src/data/zones/thin.ts: the same as its own zone's) */
  hidden?: readonly number[];
  /** this map's opening */
  side: Side;
  lo: number;
  hi: number;
}

const OPP: Record<Side, Side> = { N: 'S', S: 'N', W: 'E', E: 'W' };
export const opposite = (s: Side): Side => OPP[s];

/** Wall orientations of a DS1 (left, upper, corners, …: 1 to 9); 0 is a floor, 10 and 11 special tiles, 12+ shadows, trees, roofs */
const WALL = (o: number) => o >= 1 && o <= 9;

/**
 * Openings of a map's edge: the runs (at least 2 units) where the first walkable row of sub-tiles inside the border (the importer blocks the
 * outer two) is free and no wall stands on the edge's case (a palisade drawn on the edge blocks only its outer row: the gate is the gap in it)
 */
export function openings(m: D2MapData, min = 2): Opening[] {
  const { cols, rows, blocked } = m.grid;
  const raw = m.raw as { places?: number[][] } | undefined;
  const W = m.cases[0];
  const H = m.cases[1];
  const wall = new Set<number>();
  for (const p of raw?.places ?? []) if (WALL(p[6])) wall.add(p[4] * 4096 + p[3]);
  const out: Opening[] = [];
  const scan = (side: Side, n: number, free: (i: number) => boolean) => {
    let a = -1;
    for (let i = 0; i <= n; i++) {
      const ok = i < n && free(i);
      if (ok && a < 0) a = i;
      if (!ok && a >= 0) {
        if ((i - a) * 0.5 >= min) out.push({ side, lo: a * 0.5, hi: i * 0.5 });
        a = -1;
      }
    }
  };
  scan('N', cols, (x) => !blocked[2 * cols + x] && !wall.has(Math.floor(x / 5)));
  scan('S', cols, (x) => !blocked[(rows - 3) * cols + x] && !wall.has((H - 1) * 4096 + Math.floor(x / 5)));
  scan('W', rows, (y) => !blocked[y * cols + 2] && !wall.has(Math.floor(y / 5) * 4096));
  scan('E', rows, (y) => !blocked[y * cols + cols - 3] && !wall.has(Math.floor(y / 5) * 4096 + W - 1));
  return out;
}

/** A point of an opening at `depth` units inside the map (its middle) */
export function openingPoint(m: D2MapData, o: Opening, depth = 1.5): { x: number; y: number } {
  const c = (o.lo + o.hi) / 2;
  const [w, h] = m.units;
  return o.side === 'N' ? { x: c, y: depth } : o.side === 'S' ? { x: c, y: h - depth } : o.side === 'W' ? { x: depth, y: c } : { x: w - depth, y: c };
}

/** Walking distances (4-connected sub-tiles) from a point of the map; -1 out of reach */
function walkFrom(m: D2MapData, x: number, y: number): Int32Array {
  const { cols, rows, blocked } = m.grid;
  const dist = new Int32Array(cols * rows).fill(-1);
  const q = new Int32Array(cols * rows);
  let s = Math.min(rows - 1, Math.max(0, Math.floor(y / 0.5))) * cols + Math.min(cols - 1, Math.max(0, Math.floor(x / 0.5)));
  // lot 312: an opening's point on a blocked sub-tile (a gap of the border one sub-tile aside): the nearest free one within 3 units
  if (blocked[s]) {
    const sx = s % cols;
    const sy = (s - sx) / cols;
    let found = -1;
    for (let r = 1; r <= 6 && found < 0; r++)
      for (let oy = -r; oy <= r && found < 0; oy++)
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const u = sx + ox;
          const v = sy + oy;
          if (u < 0 || v < 0 || u >= cols || v >= rows || blocked[v * cols + u]) continue;
          found = v * cols + u;
          break;
        }
    if (found < 0) return dist;
    s = found;
  }
  let h = 0;
  let t = 0;
  dist[s] = 0;
  q[t++] = s;
  while (h < t) {
    const i = q[h++];
    const cx = i % cols;
    for (const j of [i - 1, i + 1, i - cols, i + cols]) {
      if (j < 0 || j >= dist.length || blocked[j] || dist[j] >= 0) continue;
      if ((j === i - 1 && cx === 0) || (j === i + 1 && cx === cols - 1)) continue;
      dist[j] = dist[i] + 1;
      q[t++] = j;
    }
  }
  return dist;
}

const distAt = (m: D2MapData, d: Int32Array, p: { x: number; y: number }): number => {
  const i = Math.floor(p.y / 0.5) * m.grid.cols + Math.floor(p.x / 0.5);
  return d[i] ?? -1;
};

/** The joined pair: zone `a`'s opening toward `b`, `b`'s toward `a` */
export interface Joint {
  a: string;
  b: string;
  oa: Opening;
  ob: Opening;
}

/**
 * Lot 314 (owner: "I can walk between the zones, but I am not sure they are joined at the right place"): the side of a zone toward the next
 * one in Diablo II (sides of the maps as the DS1s name them: N = least y, E = most x; the Rogue Encampment's map is TownN1, its gate north):
 * the camp's gate north into the Blood Moor's south, the Cold Plains east of the Blood Moor, the Stony Field north of the Cold Plains, and on
 * the same way (east, north) to the Monastery's gate, north of the Tamoe Highland. A pair without an opening that side keeps the old choice
 */
export const D2_SIDES: Readonly<Record<string, Side>> = {
  'a1_town>a1_bloodmoor': 'N',
  'a1_bloodmoor>a1_coldplains': 'E',
  'a1_coldplains>a1_stonyfield': 'N',
  // lot 320: the Stony Field reaches the Dark Wood by the Underground Passage (the owner's choice, as Diablo II): no seam between them
  'a1_darkwood>a1_blackmarsh': 'N',
  'a1_blackmarsh>a1_tamoe': 'E',
  'a1_tamoe>a1_monastery': 'N',
  // lot 320: the Burial Grounds beside the Cold Plains, walked into (its map's north edge, the plains' south)
  'a1_coldplains>a1_burial': 'S',
  // lot 320: Kurast walked north through its gates (Lower Kurast, the Bazaar, Upper Kurast, the Causeway, Travincal)
  'a3_lower>a3_bazaar': 'N',
  'a3_bazaar>a3_upper': 'N',
  'a3_upper>a3_causeway': 'N',
  'a3_causeway>a3_travincal': 'N',
  // lot 320: Act IV walked: the Fortress's gate east onto the Outer Steppes, south to the Plains of Despair, south to the City of the
  // Damned; the River of Flame's bridge north into the Chaos Sanctuary
  'a4_fortress>a4_steppes': 'E',
  'a4_steppes>a4_plains': 'S',
  'a4_plains>a4_city': 'S',
  'a4_river>a4_chaos': 'N',
};

/** Lot 320: a map's gate on side `side` (the importer's `gate<side>` anchor: the level's way into its neighbour there), or null */
function gateOf(m: D2MapData, side: Side): { x: number; y: number } | null {
  const a = (m.raw as { anchors?: Record<string, [number, number]> } | undefined)?.anchors?.[`gate${side}`];
  return a ? { x: a[0], y: a[1] } : null;
}

/**
 * Lot 320: opening `o` is the one at the map's gate on its side, or the map has none there. The gate's anchor is the middle of its piece:
 * the opening over it (within 2 units), else, when none is, one within the piece (11 units: Act IV's open cliffs have their gap aside)
 */
function atGate(m: D2MapData, o: Opening): boolean {
  const g = gateOf(m, o.side);
  if (!g) return true;
  const v = o.side === 'N' || o.side === 'S' ? g.x : g.y;
  const near = (q: Opening, r: number) => v >= q.lo - r && v <= q.hi + r;
  if (near(o, 2)) return true;
  return near(o, 11) && !openings(m).some((q) => q.side === o.side && near(q, 2));
}

/** Two openings of the same side overlapping */
const overlaps = (a: Opening, b: Opening): boolean => a.side === b.side && a.lo < b.hi && b.lo < a.hi;

/** Free sub-tiles a walking-distance field reaches (the size of the open area a point stands in) */
function reached(d: Int32Array): number {
  let n = 0;
  for (let i = 0; i < d.length; i++) if (d[i] >= 0) n++;
  return n;
}

/** Free sub-tiles of a map */
function freeCount(m: D2MapData): number {
  let n = 0;
  for (let i = 0; i < m.grid.blocked.length; i++) if (!m.grid.blocked[i]) n++;
  return n;
}

/**
 * The seams of a chain of outdoor zones (town first): each zone leaves by the opening farthest on foot from where it was entered (the
 * town: its gate), the next one is entered by an opening on the facing side (the widest reached from the most of the map). A pair
 * without facing openings is not joined (its exits stay portals) and the chain starts again after it. Lot 314: on the side Diablo II
 * puts the next zone (`sides`, by "a>b") when there is one, and only by openings into the map's open land (not a pocket cut off by the
 * border's cliffs or trees: at least half the map's free ground reached from them)
 */
export function planChain(ids: readonly string[], map: (id: string) => D2MapData | undefined, sides: Readonly<Record<string, Side>> = D2_SIDES, taken: Map<string, Opening[]> = new Map()): Joint[] {
  const out: Joint[] = [];
  let entered: Opening | null = null;
  // lot 320: an opening another chain of the act already joins (a branch: the Burial Grounds off the Cold Plains) is not used again
  const free = (id: string, o: Opening) => !(taken.get(id) ?? []).some((t) => overlaps(t, o));
  for (let k = 0; k + 1 < ids.length; k++) {
    const ma = map(ids[k]);
    const mb = map(ids[k + 1]);
    if (!ma || !mb) {
      entered = null;
      continue;
    }
    const oa = openings(ma);
    // where the hero is when he sets off: the opening he came in by, else (the town, a zone entered otherwise) the map's middle
    const from = entered ? openingPoint(ma, entered, 3) : { x: ma.units[0] / 2, y: ma.units[1] / 2 };
    const d = walkFrom(ma, from.x, from.y);
    const ob = openings(mb);
    const freeB = freeCount(mb);
    const openB = new Map<Opening, boolean>();
    const landB = (b: Opening): boolean => {
      let v = openB.get(b);
      if (v === undefined) {
        const p = openingPoint(mb, b, 3);
        v = reached(walkFrom(mb, p.x, p.y)) * 2 >= freeB;
        openB.set(b, v);
      }
      return v;
    };
    const want = sides[`${ids[k]}>${ids[k + 1]}`];
    const pick = (strict: boolean): { oa: Opening; ob: Opening; score: number } | null => {
      let best: { oa: Opening; ob: Opening; score: number } | null = null;
      for (const a of oa) {
        if (entered && a.side === entered.side) continue;
        if (strict && want && a.side !== want) continue;
        // lot 320: at the level's gate when its map has one on that side (Kurast's gates, Act IV's open cliffs)
        if (strict && !atGate(ma, a)) continue;
        if (!free(ids[k], a)) continue;
        const da = distAt(ma, d, openingPoint(ma, a));
        if (entered && da < 0) continue;
        for (const b of ob) {
          if (b.side !== opposite(a.side)) continue;
          if (strict && (!landB(b) || !atGate(mb, b))) continue;
          if (!free(ids[k + 1], b)) continue;
          // the farthest exit from the entry; the widest pair when equal (the town: one gate, from its middle)
          const score: number = (entered ? da : 0) * 10 + Math.min(a.hi - a.lo, b.hi - b.lo);
          if (!best || score > best.score) best = { oa: a, ob: b, score };
        }
      }
      return best;
    };
    const best = pick(true) ?? pick(false);
    if (!best) {
      entered = null;
      continue;
    }
    out.push({ a: ids[k], b: ids[k + 1], oa: best.oa, ob: best.ob });
    taken.set(ids[k], [...(taken.get(ids[k]) ?? []), best.oa]);
    taken.set(ids[k + 1], [...(taken.get(ids[k + 1]) ?? []), best.ob]);
    entered = best.ob;
  }
  return out;
}

/**
 * Lot 320: the chains of an act: one walk (`string[]`) or several (`string[][]`: the act's walk cut where Diablo II goes underground or
 * through stairs, its branches: the Burial Grounds off the Cold Plains), planned in order, an opening joined once
 */
export type Chains = readonly string[] | readonly (readonly string[])[];
const chainsOf = (c: Chains): readonly (readonly string[])[] => (typeof c[0] === 'string' ? [c as readonly string[]] : (c as readonly (readonly string[])[]));

/** Lot 320: `planChain` over several chains of an act, an opening joined once */
export function planChains(chains: Chains, map: (id: string) => D2MapData | undefined, sides: Readonly<Record<string, Side>> = D2_SIDES): Joint[] {
  const taken = new Map<string, Opening[]>();
  return chainsOf(chains).flatMap((ids) => planChain(ids, map, sides, taken));
}

/** Chains planned on the maps registered now, by chain (planned again when one of their maps is registered or replaced) */
const planned = new Map<string, { maps: unknown[]; joints: Joint[] }>();

/** Lot 312: the joints of an outdoor chain (as `planChain`; lot 320: or an act's chains, `planChains`) on the maps registered now, kept while its maps stay the same */
export function chainJoints(chains: Chains): Joint[] {
  const list = chainsOf(chains);
  const ids = list.flat();
  const key = list.map((c) => c.join(',')).join('|');
  const ms = ids.map((id) => d2Map(id));
  const have = planned.get(key);
  if (have && have.maps.length === ms.length && ms.every((m, i) => m === have.maps[i])) return have.joints;
  const joints = planChains(list, d2Map);
  planned.set(key, { maps: ms, joints });
  return joints;
}

/** Lot 312: the seams of zone `id` of an outdoor chain (lot 320: or an act's chains) toward its neighbours (none without both maps; `skip`: neighbours left out) */
export function chainSeams(chains: Chains, id: string, skip?: ReadonlySet<string>): SeamDef[] {
  const out: SeamDef[] = [];
  for (const j of chainJoints(chains)) {
    const ma = d2Map(j.a);
    const mb = d2Map(j.b);
    if (!ma || !mb) continue;
    if (j.a === id && !skip?.has(j.b)) out.push(seamOf(j, ma, mb));
    else if (j.b === id && !skip?.has(j.a)) out.push(seamOf(j, ma, mb, true));
  }
  return out;
}

/** The seam of zone `a` toward `b` from their joint (`reverse`: `b`'s toward `a`) */
export function seamOf(j: Joint, ma: D2MapData, mb: D2MapData, reverse = false): SeamDef {
  const [m1, m2, o1, o2, to] = reverse ? [mb, ma, j.ob, j.oa, j.a] : [ma, mb, j.oa, j.ob, j.b];
  const c1 = (o1.lo + o1.hi) / 2;
  const c2 = (o2.lo + o2.hi) / 2;
  const [w1, h1] = m1.units;
  const [w2, h2] = m2.units;
  // the neighbour beyond the side `o1.side`, overlapping by OVERLAP, the openings' middles aligned; lot 312: on the sub-tiles' grid (0.5
  // unit), so that both maps' collision in the overlap is the same sub-tile for sub-tile (a quarter-unit shift had the hero nudged aside
  // as he crossed). The reverse is the exact opposite (rounding half away from zero on both sides)
  const snap = (v: number) => (Math.sign(v) * Math.round(Math.abs(v) * 2)) / 2;
  const at =
    o1.side === 'N'
      ? { x: snap(c1 - c2), y: -(h2 - OVERLAP) }
      : o1.side === 'S'
        ? { x: snap(c1 - c2), y: h1 - OVERLAP }
        : o1.side === 'W'
          ? { x: -(w2 - OVERLAP), y: snap(c1 - c2) }
          : { x: w1 - OVERLAP, y: snap(c1 - c2) };
  // crossing: the part of the opening facing the other's, closer than CROSS_DEPTH to the edge
  const lo = Math.max(o1.lo, o2.lo + (o1.side === 'N' || o1.side === 'S' ? at.x : at.y));
  const hi = Math.min(o1.hi, o2.hi + (o1.side === 'N' || o1.side === 'S' ? at.x : at.y));
  const cross: [number, number, number, number] =
    o1.side === 'N' ? [lo, -1, hi, CROSS_DEPTH] : o1.side === 'S' ? [lo, h1 - CROSS_DEPTH, hi, h1 + 1] : o1.side === 'W' ? [-1, lo, CROSS_DEPTH, hi] : [w1 - CROSS_DEPTH, lo, w1 + 1, hi];
  const p2 = openingPoint(m2, o2, 0);
  const view: [number, number, number, number] = [Math.max(0, p2.x - SEAM_VIEW), Math.max(0, p2.y - SEAM_VIEW), Math.min(w2, p2.x + SEAM_VIEW), Math.min(h2, p2.y + SEAM_VIEW)];
  return { to, at, cross, view, side: o1.side, lo, hi };
}

/**
 * The overlap's collision made one: a sub-tile of `own` within OVERLAP of the seam's edge is blocked where the neighbour's (at the same
 * place) is, so that the hero does not walk past the neighbour's palisade or trees in the overlap before he crosses. Returns a copy.
 */
export function mergeOverlap(own: D2MapData, nb: D2MapData, s: SeamDef, blocked: Uint8Array): Uint8Array {
  const { cols, rows } = own.grid;
  const out = blocked.slice();
  const nc = nb.grid.cols;
  const nr = nb.grid.rows;
  const band = Math.ceil(OVERLAP / 0.5);
  const [x0, x1, y0, y1] = s.side === 'N' ? [0, cols, 0, band] : s.side === 'S' ? [0, cols, rows - band, rows] : s.side === 'W' ? [0, band, 0, rows] : [cols - band, cols, 0, rows];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const wx = (x + 0.5) * 0.5 - s.at.x;
      const wy = (y + 0.5) * 0.5 - s.at.y;
      const u = Math.floor(wx / 0.5);
      const v = Math.floor(wy / 0.5);
      // the neighbour's own border (its outer two rows, walls the importer adds at every map's edge) is not a wall of the overlap
      if (u < 2 || v < 2 || u >= nc - 2 || v >= nr - 2) continue;
      if (nb.grid.blocked[v * nc + u]) out[y * cols + x] = 1;
    }
  return out;
}
