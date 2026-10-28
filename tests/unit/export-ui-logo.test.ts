import { describe, expect, it } from 'vitest';
import { logoSheet } from '../../tools/d2import/export-ui';
import type { Dc6, IndexedImage } from '../../tools/d2import/formats/dc6';
import { uiCurrent } from '../../src/platform/d2local-core';
import { UI_REVISION } from '../../tools/d2import/ui-keys';

/** Solid frame of palette index `c` */
const frame = (w: number, h: number, ox: number, oy: number, c: number): IndexedImage => ({ w, h, ox, oy, px: new Uint8Array(w * h).fill(c) });
const dc6 = (frames: IndexedImage[]): Dc6 => ({ directions: 1, framesPerDir: frames.length, frames });
// palette: 1 = black letters, 2 = orange fire
const pal = new Uint8Array(768);
pal.set([4, 4, 4], 3);
pal.set([200, 100, 0], 6);

/** RGBA of a pixel in cell `i` (5 columns) */
function at(r: ReturnType<typeof logoSheet>, i: number, x: number, y: number): number[] {
  const { cw, ch, cols } = r.meta;
  const o = ((Math.floor(i / cols) * ch + y) * r.im.w + (i % cols) * cw + x) * 4;
  return [...r.im.px.subarray(o, o + 4)];
}

describe('Diablo II logo (export)', () => {
  // flames of different sizes and offsets from one frame to the next, as in D2LogoFireLeft/Right
  const left = dc6([frame(10, 6, -12, -6, 2), frame(1, 1, 0, 0, 2), frame(14, 9, -16, -9, 2), frame(1, 1, 0, 0, 2)]);
  const right = dc6([frame(9, 6, 0, -6, 2), frame(1, 1, 0, 0, 2), frame(12, 10, 3, -10, 2), frame(1, 1, 0, 0, 2)]);
  const letters = [frame(6, 3, -8, -4, 1), frame(6, 3, 1, -4, 1)];
  const r = logoSheet(left, right, letters, pal);

  it('one frame out of two, each half at its DC6 offsets around a common anchor', () => {
    expect(r.meta.frames).toBe(2);
    // bounding box of every frame: x from -16 to 15, y from -10 to 0
    expect([r.meta.cw, r.meta.ch, r.meta.ax, r.meta.ay]).toEqual([31, 10, 16, 10]);
  });

  it('the letters stay at the same place in every frame (they used to follow the size of the flames)', () => {
    for (const i of [0, 1]) {
      // left letter at anchor (-8, -4): fire added over opaque black
      expect(at(r, i, 16 - 8, 10 - 4)).toEqual([204, 104, 4, 255]);
      expect(at(r, i, 16 + 3, 10 - 4)).toEqual([204, 104, 4, 255]);
    }
  });

  it('fire alone: additive blend baked as opacity (brightest channel)', () => {
    // frame 1 only has fire at (-16, -9): no letters there
    expect(at(r, 1, 0, 1)).toEqual([255, 128, 0, 200]);
    // outside every layer: transparent
    expect(at(r, 0, 0, 0)[3]).toBe(0);
  });
});

describe('interface art revision', () => {
  it('ui.json of an earlier revision (or without one) is generated again', () => {
    expect(uiCurrent({ files: {} })).toBe(false);
    expect(uiCurrent({ rev: UI_REVISION - 1, files: {} })).toBe(false);
    expect(uiCurrent(null)).toBe(false);
    expect(uiCurrent({ rev: UI_REVISION, files: {} })).toBe(true);
  });
});

describe('the logo of revision 1 rebuilt at load (lot 298: a pack never generated again showed the fire still)', () => {
  it('each half goes where revision 2 puts it (the anchor, the DC6 offsets), within its cell', async () => {
    const { LEGACY_LOGO, legacyLogoRects } = await import('../../src/ui/d2ui');
    // revision 2's generator fed with the same halves (one frame out of two: the table's frames at even indices)
    const left = dc6(LEGACY_LOGO.flatMap((f) => [frame(f[0], f[1], f[2], f[3], 2), frame(f[0], f[1], f[2], f[3], 2)]));
    const right = dc6(LEGACY_LOGO.flatMap((f) => [frame(f[4], f[5], f[6], f[7], 2), frame(f[4], f[5], f[6], f[7], 2)]));
    const r = logoSheet(left, right, [], pal);
    expect(r.meta).toEqual({ frames: 15, cols: 5, cw: 360, ch: 170, ax: 180, ay: 110 });
    const rects = legacyLogoRects();
    expect(rects).toHaveLength(15);
    rects.forEach((halves, i) => {
      const nx = (i % 5) * 360;
      const ny = Math.floor(i / 5) * 170;
      const [wl, hl, oxl, oyl, wr, hr, oxr, oyr] = LEGACY_LOGO[i];
      expect(halves[0].slice(4)).toEqual([nx + oxl + r.meta.ax, ny + oyl + r.meta.ay]);
      expect(halves[1].slice(4)).toEqual([nx + oxr + r.meta.ax, ny + oyr + r.meta.ay]);
      for (const [sx, sy, w, h, dx, dy] of halves) {
        // the source inside revision 1's cell (370 × 170, the halves at its bottom), the destination inside revision 2's
        expect(sx).toBeGreaterThanOrEqual((i % 5) * 370);
        expect(sx + w).toBeLessThanOrEqual((i % 5) * 370 + 370);
        expect(sy + h).toBe(Math.floor(i / 5) * 170 + 170);
        expect(dx).toBeGreaterThanOrEqual(nx);
        expect(dx + w).toBeLessThanOrEqual(nx + 360);
        expect(dy).toBeGreaterThanOrEqual(ny);
        expect(dy + h).toBeLessThanOrEqual(ny + 170);
      }
      expect(halves[0][2]).toBe(wl - 2);
      expect([halves[0][3], halves[1][3], halves[1][2]]).toEqual([hl, hr, wr]);
    });
  });
});
