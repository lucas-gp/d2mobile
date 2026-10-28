/**
 * Arena of a round: a closed rectangle of about 90 × 90 units (56 × 56 for a boss by default; lot 307: 64 and 40 before), cut from the real map of the round's zone when the
 * player's Diablo II map is present (the window of the map with the most open ground, closed by invisible walls), otherwise built from
 * scratch with the zone's look (ground, border, a few obstacles). The cut is made on the device from the player's files: nothing of the
 * map is in the repository.
 */
import { d2Map, Rng, ZoneBuilder, type ZoneDef } from '../../../src/mods/sdk';
import type { RoundDef } from '../data/chapters';
import { addPois, placePois, POI } from './poi';

/**
 * Arena side (units), boss arena side (default: some lairs are smaller, Duriel's chamber; or larger, the Chaos Sanctuary). Lot 307 (owner:
 * "the maps are too small, they should be twice as big"): 64 → 90 and 40 → 56, ×1.4 a side, about twice the area; a map whose window of
 * that size is too closed (a narrow dungeon) keeps the former size (`SMALL`) before the synthetic arena
 */
export const ARENA = 90;
export const BOSS_ARENA = 56;
/**
 * Lot 307: units the map's part loaded (`d2Map.view`) is set inside the arena: the base loads a screen's margin around it (1,200 px), more
 * than a hero at the edge sees once the darkness beyond it is drawn; measured on the Blood Moor's 90-unit window: 29.7 → 25.8 MB of files
 */
export const VIEW_INSET = 8;
/** Lot 306's sides, tried when the larger window does not fit the map */
export const SMALL = { arena: 64, boss: 40 };
/** Sub-tile of the collision grid (units) */
const CELL = 0.5;
/** Least share of the window that must be open and reachable for a map cut (else the synthetic arena) */
const MIN_OPEN = 0.35;

/** Playable rectangle of an arena (units), for the director (spawns, recycling) */
export interface ArenaBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const BOXES = new WeakMap<ZoneDef, ArenaBox>();

/** Playable rectangle of an arena zone built here (undefined for any other zone) */
export function boxOf(zone: ZoneDef): ArenaBox | undefined {
  return BOXES.get(zone);
}

/** Arena zone of a round; `box` is the playable rectangle */
export function buildArena(round: RoundDef, seed: number): { zone: ZoneDef; box: ArenaBox; cut: boolean } {
  const size = round.boss ? (round.boss.arena ?? BOSS_ARENA) : ARENA;
  const small = round.boss ? (round.boss.arena ?? SMALL.boss) : SMALL.arena;
  const cut = cutFromMap(round, size) ?? (small < size ? cutFromMap(round, small) : null);
  const out = cut ? { ...cut, cut: true } : { ...syntheticArena(round, seed, size), cut: false };
  BOXES.set(out.zone, out.box);
  // lot 307: the points of interest (sim/poi.ts), the same for every play of a round's seed
  addPois(out.zone, placePois(new Rng(`survivals:poi:${round.id}:${seed}`), out.box, out.zone.start, cut?.open ?? openOf(out.zone, out.box), round.boss ? POI.boss : POI.plan));
  return out;
}

/** Open ground of a synthetic arena: inside its box and away from its obstacles (the blockers inside it) */
function openOf(zone: ZoneDef, box: ArenaBox): (x: number, y: number) => boolean {
  const inner = zone.blockers.filter((b) => b.rect && b.rect[0] > box.x0 && b.rect[1] > box.y0 && b.rect[2] < box.x1 && b.rect[3] < box.y1).map((b) => b.rect!);
  return (x, y) => x > box.x0 && y > box.y0 && x < box.x1 && y < box.y1 && !inner.some(([a, b, c, d]) => x > a - 1.5 && x < c + 1.5 && y > b - 1.5 && y < d + 1.5);
}

/**
 * Lot 307 (owner: "the map's limits are invisible, put suitable assets"): Diablo II décor of the zone's look (`ArenaLook.edge`: Act I's
 * rocks and dead trees, its crypts' candles and bones) along the outside of an arena cut from a map, every `EDGE_STEP` units, 0.6 to 1.8
 * units beyond its invisible wall (they block nothing inside), the same for every play of the round; the darkness beyond is the HUD's
 * (ui/bounds.ts)
 */
export const EDGE_STEP = 2.6;
export function edgeProps(round: RoundDef, box: ArenaBox): { prop: string; x: number; y: number; scale?: number }[] {
  const kinds = round.look.edge ?? round.look.border;
  if (!kinds.length) return [];
  const rng = new Rng(`survivals:edge:${round.id}`);
  const out: { prop: string; x: number; y: number; scale?: number }[] = [];
  const off = () => rng.float(0.6, 1.8);
  const along = (a: number, b: number, put: (t: number) => void) => {
    for (let t = a + rng.float(0, EDGE_STEP); t < b; t += EDGE_STEP * rng.float(0.8, 1.2)) put(t);
  };
  const scale = () => rng.float(0.85, 1.15);
  along(box.x0 - 1, box.x1 + 1, (t) => out.push({ prop: rng.pick(kinds), x: t, y: box.y0 - off(), scale: scale() }));
  along(box.x0 - 1, box.x1 + 1, (t) => out.push({ prop: rng.pick(kinds), x: t, y: box.y1 + off(), scale: scale() }));
  along(box.y0, box.y1, (t) => out.push({ prop: rng.pick(kinds), x: box.x0 - off(), y: t, scale: scale() }));
  along(box.y0, box.y1, (t) => out.push({ prop: rng.pick(kinds), x: box.x1 + off(), y: t, scale: scale() }));
  return out;
}

/** Zone identifier of a round's arena (run `survivals:<id>`) */
/**
 * Ambient light of an arena: the zone's, never darker than `MIN_AMBIENT` (lot 285: the monsters of the caves and the night zones read at a
 * glance anywhere on the screen, not only in the character's light)
 */
export const MIN_AMBIENT = 0.5;
export function arenaAmbient(a: { color: number; level: number }): { color: number; level: number } {
  return { color: a.color, level: Math.max(MIN_AMBIENT, a.level) };
}

export const arenaZoneId = (round: RoundDef): string => `survivals:${round.id}`;

/**
 * Window of `size` units of the real map with the most open ground reachable from its middle; null without the map, or when no window is
 * open enough (narrow dungeon corridors).
 */
function cutFromMap(round: RoundDef, size: number): { zone: ZoneDef; box: ArenaBox; open: (x: number, y: number) => boolean } | null {
  const m = d2Map(round.map ?? round.zones[0]);
  if (!m) return null;
  const { cols, rows, blocked } = m.grid;
  const n = Math.round(size / CELL);
  if (cols < n || rows < n) return null;
  // summed-area table of open cells
  const sat = new Int32Array((cols + 1) * (rows + 1));
  for (let y = 0; y < rows; y++) {
    let line = 0;
    for (let x = 0; x < cols; x++) {
      line += blocked[y * cols + x] ? 0 : 1;
      sat[(y + 1) * (cols + 1) + x + 1] = sat[y * (cols + 1) + x + 1] + line;
    }
  }
  const open = (x0: number, y0: number) => sat[(y0 + n) * (cols + 1) + x0 + n] - sat[y0 * (cols + 1) + x0 + n] - sat[(y0 + n) * (cols + 1) + x0] + sat[y0 * (cols + 1) + x0];
  const step = 8;
  const cands: { x0: number; y0: number; open: number }[] = [];
  for (let y0 = 0; y0 + n <= rows; y0 += step) for (let x0 = 0; x0 + n <= cols; x0 += step) cands.push({ x0, y0, open: open(x0, y0) });
  cands.sort((a, b) => b.open - a.open || a.y0 - b.y0 || a.x0 - b.x0);
  for (const c of cands.slice(0, 6)) {
    if (c.open < n * n * MIN_OPEN) break;
    const reach = reachable(blocked, cols, c.x0, c.y0, n);
    if (!reach || reach.count < n * n * MIN_OPEN) continue;
    const x0 = c.x0 * CELL;
    const y0 = c.y0 * CELL;
    const x1 = x0 + size;
    const y1 = y0 + size;
    const [W, H] = m.units;
    // the forest thinned (lot 287, owner's test: "too many trees"): the arena's trees out but a few along its border, their trunks freed
    const thin = thinTrees(m, { x0, y0, x1, y1 }, round.id);
    const zone: ZoneDef = {
      id: arenaZoneId(round),
      name: round.name,
      width: W,
      height: H,
      ambient: arenaAmbient(round.look.ambient),
      ground: round.look.ground,
      patches: [],
      walls: [],
      // lot 307: the arena's edge drawn with the zone's Diablo II décor (beyond its invisible walls)
      props: edgeProps(round, { x0, y0, x1, y1 }),
      // invisible walls around the window: the rest of the map is drawn but out of reach
      blockers: [{ rect: [0, 0, W, y0] }, { rect: [0, y1, W, H] }, { rect: [0, y0, x0, y1] }, { rect: [x1, y0, W, y1] }],
      spawns: [],
      lights: [],
      exits: [],
      objects: [],
      start: { x: (reach.start % cols) * CELL + CELL / 2, y: Math.floor(reach.start / cols) * CELL + CELL / 2 },
      theme: round.look.theme,
      mood: round.look.mood,
      // lot 301: the window only is drawn (and loaded, with a screen around it): the rest of the map was decoded for nothing
      // lot 307: the part loaded set `VIEW_INSET` units inside the arena (the base adds a screen around it): beyond the arena's edge the ground
      // is darkened (ui/bounds.ts), a larger arena's files kept near lot 306's
      d2Map: {
        id: m.id,
        cols,
        rows,
        blocked: thin.blocked,
        opaque: thin.opaque,
        ...(thin.hidden.length ? { hidden: thin.hidden } : {}),
        view: [x0 + VIEW_INSET, y0 + VIEW_INSET, x1 - VIEW_INSET, y1 - VIEW_INSET],
      },
    };
    // open ground reachable from the start (the points of interest: sim/poi.ts), on the thinned grid
    const seen = reach.seen;
    const open = (x: number, y: number) => {
      const cx = Math.floor(x / CELL) - c.x0;
      const cy = Math.floor(y / CELL) - c.y0;
      return cx >= 0 && cy >= 0 && cx < n && cy < n && seen[cy * n + cx] === 1;
    };
    return { zone, box: { x0, y0, x1, y1 }, open };
  }
  return null;
}

/** Orientation of a tree among a D2 map's structures (`places`: [tile, x, y, case x, case y, roof, orientation]); 13: a shadow */
const TREE = 14;
const SHADOW = 13;
/** Width of the border ring where a few trees stay (units), and the share of them kept there; none inside the ring */
export const TREE_RING = 5;
export const TREE_KEEP = 1 / 3;
/** Most blocked sub-tiles in a tree's case for its trunk to be freed (more: water, a cliff, something else that blocks) */
const TRUNK_CELLS = 8;
/** Side of a D2 case in collision cells (2.5 units / 0.5) */
const CASE_CELLS = 5;

/**
 * Trees of a map's window thinned out (lot 287): the owner's arenas of the Blood Moor, the Cold Plains or the Dark Wood had a tree on
 * nearly every other case, hiding the monsters and the ground. Inside the window the trees are left undrawn (`hidden`) except about one
 * in three in a ring of `TREE_RING` units along its border (atmosphere; chosen by a hash of the case, the same for every play of the
 * round), and the collision of a case that only held trees is freed (its trunk; at most `TRUNK_CELLS` blocked sub-tiles, never a case with
 * a wall, a fence or a cliff). Trees outside the window (beyond the arena's invisible walls) stay. The map's own grid is never changed:
 * the arena gets copies.
 */
export function thinTrees(
  m: { grid: { cols: number; rows: number; blocked: Uint8Array; opaque: Uint8Array }; raw: unknown },
  box: ArenaBox,
  key: string,
): { blocked: Uint8Array; opaque: Uint8Array; hidden: number[]; kept: number } {
  const places = (m.raw as { places?: number[][] } | undefined)?.places;
  const { cols, rows } = m.grid;
  if (!places?.length) return { blocked: m.grid.blocked, opaque: m.grid.opaque, hidden: [], kept: 0 };
  const inside = (tx: number, ty: number) => {
    const u = (tx + 0.5) * 2.5;
    const v = (ty + 0.5) * 2.5;
    return u >= box.x0 && u < box.x1 && v >= box.y0 && v < box.y1;
  };
  const ring = (tx: number, ty: number) => {
    const u = (tx + 0.5) * 2.5;
    const v = (ty + 0.5) * 2.5;
    return Math.min(u - box.x0, box.x1 - u, v - box.y0, box.y1 - v) < TREE_RING;
  };
  // cases holding anything else than trees and shadows (walls, fences, cliffs, roofs…): their collision is never touched
  const other = new Set<number>();
  for (const p of places) if (p[6] !== TREE && p[6] !== SHADOW) other.add(p[4] * 4096 + p[3]);
  const hash = (tx: number, ty: number) => {
    let h = 2166136261;
    for (const c of `${key}:${tx}:${ty}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return (h >>> 0) / 4294967296;
  };
  const hidden: number[] = [];
  const freed = new Set<number>();
  const keptCases = new Set<number>();
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    if (p[6] !== TREE || !inside(p[3], p[4])) continue;
    const k = p[4] * 4096 + p[3];
    if (ring(p[3], p[4]) && hash(p[3], p[4]) < TREE_KEEP) {
      keptCases.add(k);
      continue;
    }
    if (other.has(k) || blockedIn(m.grid, p[3], p[4]) > TRUNK_CELLS) continue;
    hidden.push(i);
    freed.add(k);
  }
  // a tree's shadow goes with it
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    const k = p[4] * 4096 + p[3];
    if (p[6] === SHADOW && inside(p[3], p[4]) && freed.has(k) && !keptCases.has(k)) hidden.push(i);
  }
  hidden.sort((a, b) => a - b);
  const blocked = m.grid.blocked.slice();
  const opaque = m.grid.opaque.slice();
  for (const k of freed) {
    if (keptCases.has(k)) continue;
    const tx = k % 4096;
    const ty = Math.floor(k / 4096);
    const cx0 = tx * CASE_CELLS;
    const cy0 = ty * CASE_CELLS;
    if (cx0 + CASE_CELLS > cols || cy0 + CASE_CELLS > rows) continue;
    for (let y = cy0; y < cy0 + CASE_CELLS; y++)
      for (let x = cx0; x < cx0 + CASE_CELLS; x++) {
        blocked[y * cols + x] = 0;
        opaque[y * cols + x] = 0;
      }
  }
  // trunks reaching over a neighbouring case: small blocked clusters left with nothing drawn around them but a tree taken away
  const hid = new Set(hidden);
  const drawn = new Set<number>();
  for (let i = 0; i < places.length; i++) if (!hid.has(i) && places[i][6] !== SHADOW) drawn.add(places[i][4] * 4096 + places[i][3]);
  const near = (set: Set<number>, cell: number) => {
    const tx = Math.floor((cell % cols) / CASE_CELLS);
    const ty = Math.floor(Math.floor(cell / cols) / CASE_CELLS);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (set.has((ty + oy) * 4096 + tx + ox)) return true;
    return false;
  };
  const gx0 = Math.ceil(box.x0 / CELL);
  const gy0 = Math.ceil(box.y0 / CELL);
  const gx1 = Math.floor(box.x1 / CELL);
  const gy1 = Math.floor(box.y1 / CELL);
  const seen = new Uint8Array(blocked.length);
  for (let y = gy0; y < gy1; y++)
    for (let x = gx0; x < gx1; x++) {
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
            if (nx < gx0 || ny < gy0 || nx >= gx1 || ny >= gy1) continue;
            const q = ny * cols + nx;
            if (blocked[q] && !seen[q]) {
              seen[q] = 1;
              st.push(q);
            }
          }
      }
      if (cells.length > TRUNK_CELLS || cells.some((c) => near(drawn, c)) || !cells.some((c) => near(freed, c))) continue;
      for (const c of cells) {
        blocked[c] = 0;
        opaque[c] = 0;
      }
    }
  return { blocked, opaque, hidden, kept: keptCases.size };
}

/** Blocked sub-tiles of a D2 case */
function blockedIn(grid: { cols: number; rows: number; blocked: Uint8Array }, tx: number, ty: number): number {
  let n = 0;
  for (let y = ty * CASE_CELLS; y < Math.min(grid.rows, (ty + 1) * CASE_CELLS); y++)
    for (let x = tx * CASE_CELLS; x < Math.min(grid.cols, (tx + 1) * CASE_CELLS); x++) n += grid.blocked[y * grid.cols + x] ? 1 : 0;
  return n;
}

/** Open cells reachable (4-connected) inside the window from the open cell nearest its middle */
function reachable(blocked: Uint8Array, cols: number, x0: number, y0: number, n: number): { count: number; start: number; seen: Uint8Array } | null {
  const mid = { x: x0 + n / 2, y: y0 + n / 2 };
  let start = -1;
  let best = Infinity;
  for (let y = y0; y < y0 + n; y++)
    for (let x = x0; x < x0 + n; x++) {
      if (blocked[y * cols + x]) continue;
      const d = (x - mid.x) ** 2 + (y - mid.y) ** 2;
      if (d < best) {
        best = d;
        start = y * cols + x;
      }
    }
  if (start < 0) return null;
  const seen = new Uint8Array(n * n);
  const queue = [start];
  seen[(Math.floor(start / cols) - y0) * n + (start % cols) - x0] = 1;
  let count = 0;
  while (queue.length) {
    const c = queue.pop()!;
    count++;
    const cx = c % cols;
    const cy = Math.floor(c / cols);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < x0 || y < y0 || x >= x0 + n || y >= y0 + n) continue;
      const k = (y - y0) * n + x - x0;
      if (seen[k] || blocked[y * cols + x]) continue;
      seen[k] = 1;
      queue.push(y * cols + x);
    }
  }
  return { count, start, seen };
}

/** Built arena: the zone's ground and border, 6 to 10 obstacles of 2 to 4 units, no dead end near the border */
function syntheticArena(round: RoundDef, seed: number, size: number): { zone: ZoneDef; box: ArenaBox } {
  const margin = 3;
  const W = size + margin * 2;
  const rng = new Rng(`survivals:arena:${round.id}:${seed}`);
  const b = new ZoneBuilder(arenaZoneId(round), round.name, W, W, round.look.ground, { theme: round.look.theme, mood: round.look.mood, ambient: arenaAmbient(round.look.ambient) });
  b.start(W / 2, W / 2);
  b.border(rng, round.look.border, margin);
  const mid = W / 2;
  // lot 307: as many obstacles for the area as before (64 × 64: 6 to 10)
  const count = Math.round((round.boss ? 4 : rng.int(5) + 6) * Math.max(1, (size / 64) ** 2));
  const placed: [number, number][] = [];
  for (let tries = 0; placed.length < count && tries < 400; tries++) {
    // obstacles at least 6 units from the border (no dead end along it) and 8 from the middle (arrival)
    const x = rng.float(margin + 7, W - margin - 7);
    const y = rng.float(margin + 7, W - margin - 7);
    if (Math.hypot(x - mid, y - mid) < 8 || placed.some(([px, py]) => Math.hypot(px - x, py - y) < 9)) continue;
    placed.push([x, y]);
    b.prop(rng.pick(round.look.obstacles), x, y);
    const s = rng.float(1, 2);
    b.block(x - s, y - s, x + s, y + s, false);
  }
  return { zone: b.build(), box: { x0: margin, y0: margin, x1: W - margin, y1: W - margin } };
}
