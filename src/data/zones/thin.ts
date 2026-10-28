/**
 * Lot 314 (owner, the Campaign's Act I on his phone: "in this first zone (Blood Moor) the trees are far too dense"): our outdoor maps are
 * filled with Act I's 8 × 8 and 16 × 16 pieces, most of them groves (`trees2`, `trees3`, `wild1`, `wild3`: tools/d2import/act1-maps.ts), so
 * that nearly every other case of the Blood Moor held a tree, where Diablo II's moor is open grass with copses. The maps stay as they are
 * (generated on the player's device, the same for every play); a zone of the outdoor chain leaves part of its trees undrawn (`d2Map.hidden`,
 * as the Survivals' arenas, lot 287) and frees their trunks:
 *
 * - only inside the border's ring (its 8 cases of forest and cliffs stay: the zone's edge as in D2), and in the overlap of none;
 * - by a smooth noise of the case (about 15 units across): whole clearings and copses rather than a sprinkle, the share kept by zone;
 * - never a case holding something else than trees and shadows (a wall, a fence, a ruin), nor a tree whose case has more blocked sub-tiles
 *   than a trunk's (water, a cliff): the collision is only ever opened, never closed (no path, no seam blocked by it);
 * - its trunk's leftovers (a small blocked cluster with nothing drawn around it any more) freed too (no invisible obstacle);
 * - the way through the border at its seams (`passages`, the openings joined to the neighbours: the camp's gate opened onto a wall of
 *   treetops, the owner's screenshot 2): every tree that can go, from beyond the overlap to past the ring, a little wider than the opening.
 *
 * Deterministic from the map and its seams' openings (memoised): the zone and the neighbour drawn beyond a seam hide the same trees, so the
 * view of a neighbour is kept as the zone's own when the hero walks in (src/render/renderer.ts).
 */
import type { D2MapData } from '../d2map';
import { runSteps, type Steps } from './steps';

/** Share of the trees kept inside the border, by map (absent: no thinning) */
export const TREE_SHARE: Readonly<Record<string, number>> = {
  a1_bloodmoor: 0.3,
  a1_coldplains: 0.4,
  a1_stonyfield: 0.55,
  a1_darkwood: 0.6,
  a1_blackmarsh: 0.5,
  a1_tamoe: 0.5,
};

const TREE = 14;
const SHADOW = 13;
/** Cases of the border's ring left as they are */
const RING = 8;
/** Side of a D2 case in collision sub-tiles (2.5 units / 0.5) */
const CASE = 5;
/** Most blocked sub-tiles of a tree's case for its trunk to be freed */
const TRUNK = 8;
/** Cases between two knots of the noise */
const KNOT = 6;

export interface Thinned {
  blocked: Uint8Array;
  opaque: Uint8Array;
  hidden: readonly number[];
  /** trees inside the border, and those left drawn */
  trees: number;
  kept: number;
}

const memo = new WeakMap<D2MapData, Map<string, Thinned | null>>();

/** An opening of the map's edge joined to a neighbour (src/data/zones/seams.ts `Opening`) */
export interface Passage {
  side: 'N' | 'S' | 'W' | 'E';
  lo: number;
  hi: number;
}
/** The passage cleared: from beyond the overlap (OVERLAP, 5 units: both maps' collision made one there) to past the ring, wider by MARGIN */
const PASS_FROM = 5.5;
const PASS_TO = RING * 2.5 + 6;
const PASS_MARGIN = 4;

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

/** Smooth noise in [0, 1) of a case (bilinear between knots `KNOT` cases apart, a smoothstep between them) */
function noise(id: string, tx: number, ty: number): number {
  const gx = Math.floor(tx / KNOT);
  const gy = Math.floor(ty / KNOT);
  const fx = tx / KNOT - gx;
  const fy = ty / KNOT - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const k = (x: number, y: number) => hash(`${id}:${x}:${y}`);
  const a = k(gx, gy) + (k(gx + 1, gy) - k(gx, gy)) * sx;
  const b = k(gx, gy + 1) + (k(gx + 1, gy + 1) - k(gx, gy + 1)) * sx;
  return a + (b - a) * sy;
}

/** The trees of a map thinned out (null: a map not thinned, or without trees); the map's own grid untouched (copies) */
export function thinTrees(m: D2MapData | undefined, passages: readonly Passage[] = []): Thinned | null {
  return runSteps(thinTreesSteps(m, passages));
}

/** `thinTrees` in steps of a few milliseconds (a zone built behind the play, src/data/zones/steps.ts) */
export function* thinTreesSteps(m: D2MapData | undefined, passages: readonly Passage[] = []): Steps<Thinned | null> {
  if (!m) return null;
  const key = passages
    .map((p) => `${p.side}${p.lo}:${p.hi}`)
    .sort()
    .join(',');
  let byKey = memo.get(m);
  if (!byKey) memo.set(m, (byKey = new Map()));
  const have = byKey.get(key);
  if (have !== undefined) return have;
  const share = TREE_SHARE[m.id];
  const places = (m.raw as { places?: number[][] } | undefined)?.places;
  let out: Thinned | null = null;
  if (share !== undefined && places?.length) out = yield* thin(m, places, share, passages);
  byKey.set(key, out);
  return out;
}

function* thin(m: D2MapData, places: number[][], share: number, passages: readonly Passage[]): Steps<Thinned> {
  const { cols, rows } = m.grid;
  const [W, H] = m.cases;
  const [UW, UH] = m.units;
  const inside = (tx: number, ty: number) => tx >= RING && ty >= RING && tx < W - RING && ty < H - RING;
  // a case in the way through the border at a seam (its middle, world units)
  const passage = (tx: number, ty: number) => {
    const u = (tx + 0.5) * 2.5;
    const v = (ty + 0.5) * 2.5;
    return passages.some((p) => {
      const along = p.side === 'N' || p.side === 'S' ? u : v;
      const depth = p.side === 'N' ? v : p.side === 'S' ? UH - v : p.side === 'W' ? u : UW - u;
      return along >= p.lo - PASS_MARGIN && along <= p.hi + PASS_MARGIN && depth >= PASS_FROM && depth <= PASS_TO;
    });
  };
  const key = (tx: number, ty: number) => ty * 4096 + tx;
  const other = new Set<number>();
  for (const p of places) if (p[6] !== TREE && p[6] !== SHADOW) other.add(key(p[3], p[4]));
  const blockedIn = (tx: number, ty: number) => {
    let n = 0;
    for (let y = ty * CASE; y < Math.min(rows, (ty + 1) * CASE); y++) for (let x = tx * CASE; x < Math.min(cols, (tx + 1) * CASE); x++) n += m.grid.blocked[y * cols + x];
    return n;
  };
  // the noise's spread differs by map: the threshold is its quantile over the trees inside, so that `share` of them stays
  const cand: { i: number; n: number }[] = [];
  // the passages' trees: all of them that can go (the noise's lowest, before any other)
  const pass = new Set<number>();
  let trees = 0;
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    if (p[6] !== TREE) continue;
    const through = passages.length > 0 && passage(p[3], p[4]);
    if (!through && !inside(p[3], p[4])) continue;
    if (inside(p[3], p[4])) trees++;
    if (other.has(key(p[3], p[4])) || blockedIn(p[3], p[4]) > TRUNK) continue;
    if (through) pass.add(i);
    else cand.push({ i, n: noise(m.id, p[3], p[4]) });
  }
  yield;
  const sorted = cand.map((c) => c.n).sort((a, b) => a - b);
  // `1 - share` of the trees inside go, the lowest of the noise first (those that cannot go stay on top of the share)
  const goN = Math.max(0, Math.min(cand.length, Math.round(trees * (1 - share))));
  const cut = goN > 0 ? sorted[goN - 1] : -1;
  const hiddenSet = new Set<number>(pass);
  const freed = new Set<number>([...pass].map((i) => key(places[i][3], places[i][4])));
  for (const c of cand)
    if (c.n <= cut && hiddenSet.size < goN + pass.size) {
      hiddenSet.add(c.i);
      freed.add(key(places[c.i][3], places[c.i][4]));
    }
  // a case keeps its collision while some tree of it stays drawn
  const drawnTree = new Set<number>();
  for (let i = 0; i < places.length; i++) if (places[i][6] === TREE && !hiddenSet.has(i)) drawnTree.add(key(places[i][3], places[i][4]));
  for (const k of [...freed]) if (drawnTree.has(k)) freed.delete(k);
  // a tree's shadow goes with it
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    if (p[6] === SHADOW && freed.has(key(p[3], p[4]))) hiddenSet.add(i);
  }
  yield;
  const blocked = m.grid.blocked.slice();
  const opaque = m.grid.opaque.slice();
  for (const k of freed) {
    const tx = k % 4096;
    const ty = (k - tx) / 4096;
    for (let y = ty * CASE; y < (ty + 1) * CASE; y++)
      for (let x = tx * CASE; x < (tx + 1) * CASE; x++) {
        blocked[y * cols + x] = 0;
        opaque[y * cols + x] = 0;
      }
  }
  // trunks reaching over a neighbouring case: a small blocked cluster with nothing drawn within a case of it, next to a freed case
  const drawn = new Set<number>();
  for (let i = 0; i < places.length; i++) if (!hiddenSet.has(i) && places[i][6] !== SHADOW) drawn.add(key(places[i][3], places[i][4]));
  const near = (set: Set<number>, cell: number) => {
    const tx = Math.floor((cell % cols) / CASE);
    const ty = Math.floor(Math.floor(cell / cols) / CASE);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (set.has(key(tx + ox, ty + oy))) return true;
    return false;
  };
  // (the border's ring too where a passage crosses it: the map but its outer three cases, the overlap with the neighbours left alone)
  const edge = passages.length ? 3 : RING;
  const x0 = edge * CASE;
  const y0 = edge * CASE;
  const x1 = (W - edge) * CASE;
  const y1 = (H - edge) * CASE;
  const seen = new Uint8Array(blocked.length);
  yield;
  for (let y = y0; y < y1; y++) {
    if (y % 100 === 99) yield;
    for (let x = x0; x < x1; x++) {
      const s0 = y * cols + x;
      if (!blocked[s0] || seen[s0]) continue;
      const cells: number[] = [];
      const st = [s0];
      seen[s0] = 1;
      while (st.length) {
        const c = st.pop()!;
        cells.push(c);
        const cx = c % cols;
        const cy = (c - cx) / cols;
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const nx = cx + ox;
            const ny = cy + oy;
            if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
            const q = ny * cols + nx;
            if (blocked[q] && !seen[q]) {
              seen[q] = 1;
              st.push(q);
            }
          }
      }
      if (cells.length > TRUNK || cells.some((c) => near(drawn, c)) || !cells.some((c) => near(freed, c))) continue;
      for (const c of cells) {
        blocked[c] = 0;
        opaque[c] = 0;
      }
    }
  }
  const hidden = [...hiddenSet].sort((a, b) => a - b);
  let gone = 0;
  for (const i of hidden) if (places[i][6] === TREE && inside(places[i][3], places[i][4])) gone++;
  return { blocked, opaque, hidden, trees, kept: trees - gone };
}
