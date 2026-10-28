/**
 * Planche-contact de vérification : assemble des images d'une planche (toutes les directions
 * d'une animation) sur un fond de sol sombre, avec l'ombre, agrandies ×2 en plus proche voisin.
 *   npx tsx tools/prerender/contact-sheet.ts sorceress walk 0 out.png [hi|lo]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
// @ts-expect-error module CommonJS sans types
import UPNG from 'upng-js';

const ROOT = resolve(import.meta.dirname, '../..');

export function loadPage(file: string): { w: number; h: number; px: Uint8Array } {
  const img = UPNG.decode(readFileSync(file));
  return { w: img.width, h: img.height, px: new Uint8Array(UPNG.toRGBA8(img)[0]) };
}

export function contactSheet(id: string, anim: string, frame: number | 'all', out: string, tier = 'hi', scale = 2): void {
  const dir = join(ROOT, 'public/sprites', tier);
  const meta = JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8'));
  const pages = meta.pages.map((p: { file: string }) => loadPage(join(dir, p.file)));
  const spages = meta.shadowPages.map((p: { file: string }) => loadPage(join(dir, p.file)));
  const a = meta.anims[anim];
  const dirs = a.dirs;
  const frames = frame === 'all' ? Array.from({ length: a.frames }, (_, i) => i) : [frame];
  const cellW = 90 * scale;
  const cellH = 100 * scale;
  const cols = frame === 'all' ? frames.length : Math.min(dirs, 8);
  const rows = frame === 'all' ? dirs : Math.ceil(dirs / cols);
  const W = cols * cellW;
  const H = rows * cellH;
  const img = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const x = i % W;
    const y = Math.floor(i / W);
    const chk = ((x >> 4) + (y >> 4)) & 1;
    img[i * 4] = 38 + chk * 6;
    img[i * 4 + 1] = 34 + chk * 6;
    img[i * 4 + 2] = 30 + chk * 6;
    img[i * 4 + 3] = 255;
  }
  const blit = (src: { w: number; h: number; px: Uint8Array }, r: number[], ox: number, oy: number, s: number, shadow: boolean) => {
    const [, sx, sy, w, h, ax, ay] = r;
    for (let y = 0; y < h * s; y++) {
      for (let x = 0; x < w * s; x++) {
        const px = sx + Math.floor(x / s);
        const py = sy + Math.floor(y / s);
        const si = (py * src.w + px) * 4;
        const a = src.px[si + 3] / 255;
        if (a <= 0) continue;
        const dx = Math.round(ox - ax * s + x);
        const dy = Math.round(oy - ay * s + y);
        if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
        const di = (dy * W + dx) * 4;
        if (shadow) {
          const k = 1 - 0.5 * a;
          img[di] *= k;
          img[di + 1] *= k;
          img[di + 2] *= k;
        } else {
          img[di] = src.px[si] * a + img[di] * (1 - a);
          img[di + 1] = src.px[si + 1] * a + img[di + 1] * (1 - a);
          img[di + 2] = src.px[si + 2] * a + img[di + 2] * (1 - a);
        }
      }
    }
  };
  let k = 0;
  for (let d = 0; d < dirs; d++) {
    for (const f of frames) {
      const col = frame === 'all' ? f : k % cols;
      const row = frame === 'all' ? d : Math.floor(k / cols);
      k++;
      const ox = col * cellW + cellW / 2;
      const oy = row * cellH + cellH * 0.86;
      const name = `${anim}/${d}/${f}`;
      const sr = meta.shadows[name];
      const sscale = meta.shadowScale / meta.scale;
      if (sr && sr[0] >= 0) blit(spages[sr[0]], sr, ox, oy, (scale * (1 / sscale)) / (1 / meta.scale) / meta.scale, true);
      const r = meta.frames[name];
      if (r && r[0] >= 0) blit(pages[r[0]], r, ox, oy, scale, false);
    }
  }
  writeFileSync(out, Buffer.from(UPNG.encode([img.buffer], W, H, 0)));
}

if (process.argv[1]?.endsWith('contact-sheet.ts')) {
  const [id, anim, frame, out, tier] = process.argv.slice(2);
  contactSheet(id, anim, frame === 'all' ? 'all' : Number(frame), out, tier ?? 'hi');
  console.log(out);
}
