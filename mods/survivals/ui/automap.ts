/**
 * The round's automap (lot 307, owner: "the map at the top right is not great, maybe just the outline; the same when it is moved to the
 * centre: take what exists in Diablo II"), in place of the base's minimap during a round:
 * - top right under the zone's name, Diablo II's small automap: the walls' outlines only, thin and half transparent, no panel nor
 *   backdrop, centred on the hero (his cross); a tap opens the centred map;
 * - the centred map (Diablo II's Tab map): the whole arena's explored outlines over the field, no panel, the field still played under it
 *   (it takes no touch); a tap on the corner map or the Tab key closes it.
 * Only the explored cells are drawn (the fog, sim/fog.ts); the points of interest once found (sim/poi.ts), the zone's mini-boss or boss
 * always (the zone ends on it and it walks to the hero anyway: knowing where it is spoils nothing and tells where not to linger), the
 * monsters and items seen as dots. The outlines are drawn once into a layer as cells get explored (a few hundred segments a reveal), each
 * refresh only copies it: cheap with 100 monsters on a phone.
 */
import type { Game, World } from '../../../src/mods/sdk';
import type { ArenaBox } from '../sim/arena';
import { FOG, fogIf, type Fog } from '../sim/fog';
import type { Director } from '../sim/director';
import { h } from './dom';

/** Pixels a unit along the layer's iso axes (the layer is scaled when copied) */
const L = 4;
/** Corner map: CSS pixels a unit; refresh (ms) */
export const CORNER = { k: 1.6, size: 124, every: 100 };
/** Centred map: CSS pixels a unit at least (held upright the whole arena would be too small: centred on the hero then) */
export const BIG = { min: 3.4 };
/** Collision cell (units) */
const CELL = 0.5;

/** A world's outlines bucketed by fog cell: the walls (blocked cells beside open ones) and the arena's edge */
interface Outline {
  walls: Map<number, number[]>;
  edge: Map<number, number[]>;
}

/** Segments of a world's walls and of its arena's edge, by fog cell (made once a world) */
export function outlineOf(w: Pick<World, 'grid'>, box: ArenaBox, fog: Fog): Outline {
  const g = w.grid;
  const walls = new Map<number, number[]>();
  const edge = new Map<number, number[]>();
  const put = (m: Map<number, number[]>, x: number, y: number, seg: number[]) => {
    const i = fog.cellOf(x, y);
    if (i < 0) return;
    let a = m.get(i);
    if (!a) m.set(i, (a = []));
    a.push(...seg);
  };
  const cx0 = Math.ceil(box.x0 / CELL);
  const cy0 = Math.ceil(box.y0 / CELL);
  const cx1 = Math.floor(box.x1 / CELL);
  const cy1 = Math.floor(box.y1 / CELL);
  const open = (cx: number, cy: number) => cx >= cx0 && cy >= cy0 && cx < cx1 && cy < cy1 && !g.blocked[cy * g.cols + cx];
  for (let cy = cy0; cy < cy1; cy++)
    for (let cx = cx0; cx < cx1; cx++) {
      if (!g.blocked[cy * g.cols + cx]) continue;
      const x = cx * CELL;
      const y = cy * CELL;
      // each side of a blocked cell facing open ground, filed under the open cell's fog cell
      if (open(cx - 1, cy)) put(walls, x - 0.1, y + 0.25, [x, y, x, y + CELL]);
      if (open(cx + 1, cy)) put(walls, x + CELL + 0.1, y + 0.25, [x + CELL, y, x + CELL, y + CELL]);
      if (open(cx, cy - 1)) put(walls, x + 0.25, y - 0.1, [x, y, x + CELL, y]);
      if (open(cx, cy + 1)) put(walls, x + 0.25, y + CELL + 0.1, [x, y + CELL, x + CELL, y + CELL]);
    }
  const c = FOG.cell;
  for (let t = box.x0; t < box.x1; t += c) {
    const t1 = Math.min(box.x1, t + c);
    put(edge, t + 0.1, box.y0 + 0.1, [t, box.y0, t1, box.y0]);
    put(edge, t + 0.1, box.y1 - 0.1, [t, box.y1, t1, box.y1]);
  }
  for (let t = box.y0; t < box.y1; t += c) {
    const t1 = Math.min(box.y1, t + c);
    put(edge, box.x0 + 0.1, t + 0.1, [box.x0, t, box.x0, t1]);
    put(edge, box.x1 - 0.1, t + 0.1, [box.x1, t, box.x1, t1]);
  }
  return { walls, edge };
}

/** The layer of a world: its outlines drawn as their cells get explored */
interface Layer {
  w: World;
  box: ArenaBox;
  fog: Fog;
  outline: Outline;
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/** Layer coordinates of a world point (2:1 isometric, the arena's left corner at the left) */
function lx(box: ArenaBox, x: number, y: number): number {
  return (x - box.x0 - (y - box.y0) + (box.y1 - box.y0)) * L + 4;
}
function ly(box: ArenaBox, x: number, y: number): number {
  return ((x - box.x0 + (y - box.y0)) * L) / 2 + 4;
}

function makeLayer(w: World, box: ArenaBox, fog: Fog): Layer | null {
  const cv = document.createElement('canvas');
  const s = box.x1 - box.x0 + (box.y1 - box.y0);
  cv.width = Math.ceil(s * L + 8);
  cv.height = Math.ceil((s * L) / 2 + 8);
  // no 2D canvas (a test's DOM): no automap
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const layer = { w, box, fog, outline: outlineOf(w, box, fog), cv, ctx };
  const all: number[] = [];
  for (let i = 0; i < fog.seen.length; i++) if (fog.seen[i]) all.push(i);
  fog.takeNew();
  drawCells(layer, all);
  return layer;
}

/** Explored cells drawn into the layer: a faint ground, the walls' lines, the arena's edge */
function drawCells(l: Layer, cells: number[]): void {
  if (!cells.length) return;
  const { ctx, box, fog } = l;
  const c = FOG.cell;
  ctx.fillStyle = 'rgba(150,140,110,0.07)';
  ctx.beginPath();
  for (const i of cells) {
    const x = box.x0 + (i % fog.cols) * c;
    const y = box.y0 + Math.floor(i / fog.cols) * c;
    ctx.moveTo(lx(box, x, y), ly(box, x, y));
    ctx.lineTo(lx(box, x + c, y), ly(box, x + c, y));
    ctx.lineTo(lx(box, x + c, y + c), ly(box, x + c, y + c));
    ctx.lineTo(lx(box, x, y + c), ly(box, x, y + c));
    ctx.closePath();
  }
  ctx.fill();
  const stroke = (m: Map<number, number[]>, style: string, width: number) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const i of cells) {
      const a = m.get(i);
      if (!a) continue;
      for (let k = 0; k < a.length; k += 4) {
        ctx.moveTo(lx(box, a[k], a[k + 1]), ly(box, a[k], a[k + 1]));
        ctx.lineTo(lx(box, a[k + 2], a[k + 3]), ly(box, a[k + 2], a[k + 3]));
      }
    }
    ctx.stroke();
  };
  stroke(l.outline.walls, 'rgba(222,214,190,0.95)', 1.6);
  stroke(l.outline.edge, 'rgba(214,170,96,1)', 2.4);
}

const MARK: Record<string, string> = { shrine: '#70b0ff', chest: '#e8b04a', elite: '#e8b04a', cursed: '#c070ff', lair: '#e04a30' };

export interface Automap {
  corner: HTMLCanvasElement;
  big: HTMLCanvasElement;
  /** Every frame of a round (refreshed at most every `CORNER.every` ms) */
  update(g: Game, d: Director | null): void;
  /** Opens or closes the centred map */
  toggle(): void;
  readonly open: boolean;
}

export function automap(): Automap {
  const corner = h('canvas', { cls: 'sv-automap', data: { sv: 'automap' } });
  corner.title = 'Carte';
  corner.setAttribute('aria-label', 'Carte');
  const big = h('canvas', { cls: 'sv-automap-big', data: { sv: 'automap-big' } });
  big.style.display = 'none';
  let open = false;
  let layer: Layer | null = null;
  let at = 0;
  const api: Automap = {
    corner,
    big,
    get open() {
      return open;
    },
    toggle() {
      open = !open;
      big.style.display = open ? '' : 'none';
      at = 0;
    },
    update(g, d) {
      const now = performance.now();
      if (now - at < CORNER.every) return;
      at = now;
      const w = g.world;
      const fog = fogIf(w);
      if (!d || !fog) return;
      corner.dataset.seen = String(fog.count);
      corner.dataset.total = String(fog.total);
      corner.dataset.box = `${d.box.x0},${d.box.y0},${d.box.x1},${d.box.y1}`;
      if (!layer || layer.w !== w) layer = makeLayer(w, d.box, fog);
      else drawCells(layer, fog.takeNew());
      if (!layer) return;
      drawCorner(corner, layer, d);
      if (open) drawBig(big, layer, d);
    },
  };
  corner.addEventListener('click', (e) => {
    e.stopPropagation();
    api.toggle();
  });
  return api;
}

/** A canvas's backing size for its CSS size (2× at least for thin lines) */
function fit(cv: HTMLCanvasElement, cssW: number, cssH: number): number {
  const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
  const W = Math.round(cssW * dpr);
  const H = Math.round(cssH * dpr);
  if (cv.width !== W) cv.width = W;
  if (cv.height !== H) cv.height = H;
  return dpr;
}

/** The corner map centred on the hero: the layer, the markers, an arrow to the nearest point found beyond its edge */
function drawCorner(cv: HTMLCanvasElement, l: Layer, d: Director): void {
  const css = CORNER.size;
  const dpr = fit(cv, css, css);
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const p = l.w.player;
  const k = (CORNER.k * dpr) / L;
  const S = css * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, S, S);
  const ox = S / 2 - lx(l.box, p.x, p.y) * k;
  const oy = S / 2 - ly(l.box, p.x, p.y) * k;
  ctx.globalAlpha = 0.85;
  ctx.drawImage(l.cv, ox, oy, l.cv.width * k, l.cv.height * k);
  ctx.globalAlpha = 1;
  const at = (x: number, y: number): [number, number] => [ox + lx(l.box, x, y) * k, oy + ly(l.box, x, y) * k];
  markers(ctx, l, d, at, dpr, S, S);
  // the nearest point found and not used, beyond the map's edge: a small arrow on its border towards it
  const pois = d.pois?.shown() ?? [];
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (const q of pois) {
    const [sx, sy] = at(q.x, q.y);
    if (sx >= 4 && sy >= 4 && sx <= S - 4 && sy <= S - 4) continue;
    const dd = Math.hypot(q.x - p.x, q.y - p.y);
    if (dd < bd) [bd, best] = [dd, q];
  }
  if (best) {
    const [sx, sy] = at(best.x, best.y);
    const a = Math.atan2(sy - S / 2, sx - S / 2);
    const r = S / 2 - 7 * dpr;
    const cx = S / 2 + Math.cos(a) * r;
    const cy = S / 2 + Math.sin(a) * r;
    ctx.fillStyle = '#e8b04a';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 6 * dpr, cy + Math.sin(a) * 6 * dpr);
    ctx.lineTo(cx + Math.cos(a + 2.4) * 5 * dpr, cy + Math.sin(a + 2.4) * 5 * dpr);
    ctx.lineTo(cx + Math.cos(a - 2.4) * 5 * dpr, cy + Math.sin(a - 2.4) * 5 * dpr);
    ctx.closePath();
    ctx.fill();
  }
}

/** The centred map: the whole arena fitted to the screen (or centred on the hero held upright), over the field */
function drawBig(cv: HTMLCanvasElement, l: Layer, d: Director): void {
  const W = innerWidth;
  const H = innerHeight;
  const dpr = fit(cv, W, H);
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W * dpr, H * dpr);
  // the whole arena when it fits at `BIG.min` CSS px a unit at least (a wide screen), else Diablo II's: centred on the hero at that scale
  const fitK = Math.min(((W - 24) * dpr) / l.cv.width, ((H - 120) * dpr) / l.cv.height, (8 * dpr) / L);
  const k = Math.max(fitK, (BIG.min * dpr) / L);
  const p = l.w.player;
  const ox = k > fitK ? (W * dpr) / 2 - lx(l.box, p.x, p.y) * k : (W * dpr - l.cv.width * k) / 2;
  const oy = k > fitK ? (H * dpr) / 2 - ly(l.box, p.x, p.y) * k : (H * dpr - l.cv.height * k) / 2 + 20 * dpr;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(l.cv, ox, oy, l.cv.width * k, l.cv.height * k);
  ctx.globalAlpha = 1;
  markers(ctx, l, d, (x, y) => [ox + lx(l.box, x, y) * k, oy + ly(l.box, x, y) * k], dpr * 1.3, W * dpr, H * dpr);
}

/** Markers over a map: monsters and items seen (dots), the points found, the zone's boss (always), the hero's cross */
function markers(ctx: CanvasRenderingContext2D, l: Layer, d: Director, at: (x: number, y: number) => [number, number], u: number, W: number, H: number): void {
  const w = l.w;
  const inView = (x: number, y: number) => x >= 0 && y >= 0 && x <= W && y <= H;
  for (const gi of w.items) {
    if (!l.fog.isSeen(gi.x, gi.y)) continue;
    const [x, y] = at(gi.x, gi.y);
    if (!inView(x, y)) continue;
    ctx.fillStyle = 'rgba(240,230,200,0.9)';
    ctx.fillRect(x - u, y - u, 2 * u, 2 * u);
  }
  const bosses = new Set(d.bossIds);
  for (const m of w.monsters) {
    if (m.dead || m.isSummon || m.pet || bosses.has(m.id) || !l.fog.isSeen(m.x, m.y)) continue;
    const [x, y] = at(m.x, m.y);
    if (!inView(x, y)) continue;
    ctx.fillStyle = m.rank === 'unique' ? '#f0c040' : m.rank === 'champion' ? '#6a90ff' : 'rgba(220,50,40,0.9)';
    ctx.fillRect(x - 0.9 * u, y - 0.9 * u, 1.8 * u, 1.8 * u);
  }
  for (const q of d.pois?.shown() ?? []) {
    const [x, y] = at(q.x, q.y);
    if (!inView(x, y)) continue;
    ctx.fillStyle = MARK[q.kind] ?? '#e8b04a';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = u;
    ctx.beginPath();
    const r = 3.2 * u;
    if (q.kind === 'shrine') {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
    } else if (q.kind === 'lair') ctx.arc(x, y, r, 0, Math.PI * 2);
    else ctx.rect(x - r * 0.8, y - r * 0.6, r * 1.6, r * 1.2);
    ctx.stroke();
    ctx.fill();
  }
  // the zone's mini-boss or boss: always shown, a red ring
  for (const m of d.bossMonsters()) {
    if (m.dead) continue;
    const [x, y] = at(m.x, m.y);
    if (!inView(x, y)) continue;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.arc(x, y, 4 * u, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ff4030';
    ctx.lineWidth = 1.6 * u;
    ctx.stroke();
  }
  // the hero: Diablo II's cross
  const [px, py] = at(w.player.x, w.player.y);
  const r = 4 * u;
  ctx.lineCap = 'butt';
  for (const [style, width] of [
    ['rgba(0,0,0,0.85)', 3.2 * u],
    ['#f4f0e0', 1.6 * u],
  ] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(px - r, py - r / 2);
    ctx.lineTo(px + r, py + r / 2);
    ctx.moveTo(px + r, py - r / 2);
    ctx.lineTo(px - r, py + r / 2);
    ctx.stroke();
  }
}
