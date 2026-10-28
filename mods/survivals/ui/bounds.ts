/**
 * The arena's limits made visible (lot 307, owner: "the map's limits are invisible, put suitable assets"): beyond the arena's invisible
 * walls the field darkens (a gradient from the edge to near black within 5 units, `BOUNDS.steps`), over the Diablo II décor set along the edge
 * (sim/arena.ts `edgeProps`). Four planes, one an edge, laid on the screen by the base renderer's projection (2:1 isometric, 32 px a unit
 * at zoom 1, the camera following the hero as the base's: `CAM_RATE`); each frame only their `transform` changes (no repaint).
 */
import type { World } from '../../../src/mods/sdk';
import type { ArenaBox } from '../sim/arena';
import { viewOf } from '../sim/view';
import { h } from './dom';

export const BOUNDS = {
  /** The darkness's steps beyond the edge: [units, alpha] (the décor set 0.6 to 1.8 units out stays seen, the ground far out near black) */
  steps: [
    [0, 0],
    [1, 0.3],
    [2.5, 0.68],
    [5, 0.9],
  ] as readonly (readonly [number, number])[],
};
/** The base renderer's camera: it follows the hero at this rate (src/render/renderer.ts, `1 − e^(−14 dt)`) */
const CAM_RATE = 14;
/** Pixels a unit on an iso axis at zoom 1 (src/render/iso.ts) */
const C = 32;
/** Planes' size (px, `.sv-edge` in dom.ts): beyond any screen */
const PLANE = 6000;

/**
 * An edge's plane on the screen: the screen point of the edge's line nearest the camera, the angle of its outward normal on the screen,
 * the pixels a unit across it. `n`: the edge's outward normal in the world (an axis), `at`: a point of the edge, (cx, cy) the camera
 */
export function edgePlane(
  n: readonly [number, number],
  at: readonly [number, number],
  cam: readonly [number, number],
  zoom: number,
  screen: { width: number; height: number },
): { x: number; y: number; angle: number; unit: number } {
  // screen of a world offset: (32 (dx − dy), 16 (dx + dy)) × zoom
  const sx = (dx: number, dy: number) => C * (dx - dy) * zoom;
  const sy = (dx: number, dy: number) => (C / 2) * (dx + dy) * zoom;
  // the edge's tangent (the other axis) on the screen, and its normal turned outwards
  const tx = sx(n[1], n[0]);
  const ty = sy(n[1], n[0]);
  let nx = -ty;
  let ny = tx;
  const ox = sx(n[0], n[1]);
  const oy = sy(n[0], n[1]);
  if (nx * ox + ny * oy < 0) [nx, ny] = [-nx, -ny];
  const nl = Math.hypot(nx, ny) || 1;
  nx /= nl;
  ny /= nl;
  // the edge's point on the camera's line along the tangent: its offset from the camera, along the normal
  const dx = at[0] - cam[0];
  const dy = at[1] - cam[1];
  const along = n[0] !== 0 ? dx : dy;
  const px = screen.width / 2 + sx(n[0] !== 0 ? along : 0, n[1] !== 0 ? along : 0);
  const py = screen.height / 2 + sy(n[0] !== 0 ? along : 0, n[1] !== 0 ? along : 0);
  return { x: px, y: py, angle: Math.atan2(ny, nx), unit: Math.abs(ox * nx + oy * ny) };
}

export interface Bounds {
  el: HTMLElement;
  /** Every frame of a round (`box` null: hidden) */
  update(w: World | null, box: ArenaBox | null): void;
}

export function boundsLayer(): Bounds {
  const planes = [0, 1, 2, 3].map(() => h('div', { cls: 'sv-edge' }));
  const el = h('div', { cls: 'sv-bounds', data: { sv: 'bounds' } }, ...planes);
  el.style.display = 'none';
  let cam: [number, number] | null = null;
  let world: World | null = null;
  let last = 0;
  return {
    el,
    update(w, box) {
      if (!w || !box) {
        if (el.style.display !== 'none') el.style.display = 'none';
        world = null;
        return;
      }
      if (el.style.display === 'none') el.style.display = '';
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const p = w.player;
      if (!cam || world !== w || Math.hypot(p.x - cam[0], p.y - cam[1]) > 12) cam = [p.x, p.y];
      else {
        const k = 1 - Math.exp(-dt * CAM_RATE);
        cam = [cam[0] + (p.x - cam[0]) * k, cam[1] + (p.y - cam[1]) * k];
      }
      world = w;
      const v = viewOf();
      const screen = { width: innerWidth, height: innerHeight };
      const edges: [readonly [number, number], readonly [number, number]][] = [
        [
          [-1, 0],
          [box.x0, box.y0],
        ],
        [
          [1, 0],
          [box.x1, box.y0],
        ],
        [
          [0, -1],
          [box.x0, box.y0],
        ],
        [
          [0, 1],
          [box.x0, box.y1],
        ],
      ];
      let key = '';
      edges.forEach(([n, at], i) => {
        const pl = edgePlane(n, at, cam!, v.zoom, screen);
        key += Math.round(pl.unit);
        planes[i].style.transform = `translate(${pl.x.toFixed(1)}px, ${pl.y.toFixed(1)}px) rotate(${pl.angle.toFixed(4)}rad) translate(0px, -${PLANE / 2}px)`;
      });
      // the gradient's length follows the zoom (a unit's pixels): rewritten only when it changes
      if (el.dataset.unit !== key) {
        el.dataset.unit = key;
        edges.forEach(([n, at], i) => {
          const u = edgePlane(n, at, cam!, v.zoom, screen).unit;
          planes[i].style.background = `linear-gradient(to right, ${BOUNDS.steps.map(([d, a]) => `rgba(0,0,0,${a}) ${Math.round(u * d)}px`).join(', ')})`;
        });
      }
    },
  };
}
