/**
 * The screen the monsters are brought beyond (lot 301, owner: "the monsters pop too close to the hero; bring them in just off the visible
 * screen, from every side, in portrait as in landscape, as in the other survivors game"). The app tells the mode its window and camera zoom (rule
 * `render.zoom`, `setView`); the command-line tools and the tests keep a phone held in landscape (`DEFAULT_VIEW`). The projection is the
 * base renderer's (src/render/iso.ts: 2:1 isometric, 32 px across a unit on each axis at zoom 1), the camera on the hero.
 */

/** Pixels across one world unit's step on an axis at zoom 1 (src/render/iso.ts `C`) */
const C = 32;
/** A monster drawn around its feet (px at zoom 1): half its width, the head above the feet, a little below them */
export const SPRITE = { half: 40, up: 120, down: 16 };
/** Units beyond the screen's edge at least (the camera trails the hero a little) */
export const VIEW_MARGIN = 1;

export interface View {
  /** CSS pixels of the window */
  width: number;
  height: number;
  /** The renderer's zoom */
  zoom: number;
}

/** A phone held in landscape (the owner's Galaxy Z Fold, 960 × 412 CSS pixels, the mode's zoom: index.ts `survivalsZoom`) */
export const DEFAULT_VIEW: View = { width: 960, height: 412, zoom: 412 / (45.25 * 16) };

let current: View = { ...DEFAULT_VIEW };

export function setView(v: View): void {
  if (v.width > 0 && v.height > 0 && v.zoom > 0) current = { ...v };
}

export function viewOf(): View {
  return current;
}

/** Is a monster's sprite whose feet are at (dx, dy) world units from the hero on the screen (any part of it)? */
export function onScreen(dx: number, dy: number, v: View = current): boolean {
  const sx = (dx - dy) * C * v.zoom;
  const sy = (dx + dy) * C * 0.5 * v.zoom;
  const z = v.zoom;
  return Math.abs(sx) < v.width / 2 + SPRITE.half * z && sy < v.height / 2 + SPRITE.up * z && sy > -v.height / 2 - SPRITE.down * z;
}

/** Units from the hero, along the world angle `a`, at which a monster's sprite leaves the screen (then `VIEW_MARGIN` more) */
export function edgeAt(a: number, v: View = current): number {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const z = v.zoom;
  const ux = Math.abs((c - s) * C * z);
  const uy = (c + s) * C * 0.5 * z;
  let r = Infinity;
  if (ux > 1e-6) r = Math.min(r, (v.width / 2 + SPRITE.half * z) / ux);
  if (uy > 1e-6) r = Math.min(r, (v.height / 2 + SPRITE.up * z) / uy);
  if (uy < -1e-6) r = Math.min(r, (v.height / 2 + SPRITE.down * z) / -uy);
  return r + VIEW_MARGIN;
}

/** Half the screen's diagonal on the ground (units): the farthest visible ground point from the hero */
export function halfDiagonal(v: View = current): number {
  const a = v.width / 2 / (C * v.zoom);
  const b = v.height / (C * v.zoom);
  return Math.sqrt((a * a + b * b) / 2);
}
