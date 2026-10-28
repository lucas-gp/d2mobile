/**
 * Effets de sorts (fx-map.ts) → planches `fx_<id>` au format du jeu : images rognées (chaque image porte sa propre ancre : l'origine du
 * DCC = le point où l'effet est posé), deux paliers hi/lo, `blend` dans le JSON. Un effet illisible est ignoré (le jeu garde ses particules).
 */
import { sha1Hex } from './sha1';
import type { GameData } from './data';
import { decodeDcc } from './formats/dcc';
import { directionOrder } from './directions';
import { pack } from './atlas';
import type { Sink } from './sink';
import { FX, type FxSpec } from './fx-map';

interface Img {
  w: number;
  h: number;
  ax: number;
  ay: number;
  rgba: Uint8Array;
}

function toImg(px: Uint8Array, w: number, h: number, ox: number, oy: number, pal: Uint8Array): Img {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const c = px[i];
    if (c) rgba.set([pal[c * 3], pal[c * 3 + 1], pal[c * 3 + 2], 255], i * 4);
  }
  fill(rgba, w, h);
  return { w, h, ax: -ox, ay: -oy, rgba };
}

/**
 * Trous noirs au milieu d'une zone lumineuse (index de palette « noir » que D2 fond avec sa table de transparence) : en fusion additive ils
 * laisseraient voir le décor à travers le halo. Un pixel sombre est rempli quand, dans au moins 7 des 8 directions, on trouve un pixel lumineux
 * à moins de 4 pixels ; il prend alors la moyenne de ces pixels lumineux.
 */
function fill(rgba: Uint8Array, w: number, h: number): void {
  const lum = (o: number): number => (rgba[o] + rgba[o + 1] + rgba[o + 2]) / 3;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ];
  const patches: [number, number[]][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (!rgba[o + 3] || lum(o) > 12) continue;
      let hit = 0;
      const c = [0, 0, 0];
      for (const [dx, dy] of dirs) {
        for (let k = 1; k <= 4; k++) {
          const xx = x + dx * k;
          const yy = y + dy * k;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) break;
          const q = (yy * w + xx) * 4;
          if (rgba[q + 3] && lum(q) > 90) {
            hit++;
            c[0] += rgba[q];
            c[1] += rgba[q + 1];
            c[2] += rgba[q + 2];
            break;
          }
        }
      }
      if (hit >= 7) patches.push([o, [c[0] / hit, c[1] / hit, c[2] / hit]]);
    }
  }
  for (const [o, c] of patches) rgba.set([c[0], c[1], c[2], 255], o);
}

function halve(im: Img): Img {
  const nw = Math.max(1, Math.ceil(im.w / 2));
  const nh = Math.max(1, Math.ceil(im.h / 2));
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let n = 0;
      const c = [0, 0, 0];
      for (let d = 0; d < 4; d++) {
        const sx = x * 2 + (d & 1);
        const sy = y * 2 + (d >> 1);
        if (sx >= im.w || sy >= im.h) continue;
        const s = (sy * im.w + sx) * 4;
        if (!im.rgba[s + 3]) continue;
        n++;
        c[0] += im.rgba[s];
        c[1] += im.rgba[s + 1];
        c[2] += im.rgba[s + 2];
      }
      // lumière : un pixel isolé sur quatre reste (le noir n'existe pas, il est transparent)
      if (n >= 1) out.set([c[0] / n, c[1] / n, c[2] / n, 255], (y * nw + x) * 4);
    }
  }
  return { w: nw, h: nh, ax: im.ax / 2, ay: im.ay / 2, rgba: out };
}

async function writeSheet(out: Sink, spec: FxSpec, tier: 'hi' | 'lo', frames: Map<string, Img>, dirs: number, count: number, fps: number): Promise<{ bytes: number; gpu: number }> {
  const names = [...frames.keys()];
  const list = names.map((n) => frames.get(n)!);
  const { placements, pages } = pack(list, 2048, 2048);
  const bufs = pages.map((p) => new Uint8Array(p.w * p.h * 4));
  const rects: Record<string, number[]> = {};
  names.forEach((n, i) => {
    const im = list[i];
    const pl = placements[i];
    const page = pages[pl.page];
    for (let y = 0; y < im.h; y++) bufs[pl.page].set(im.rgba.subarray(y * im.w * 4, (y + 1) * im.w * 4), ((pl.y + y) * page.w + pl.x) * 4);
    rects[n] = [pl.page, pl.x, pl.y, im.w, im.h, im.ax, im.ay];
  });
  let bytes = 0;
  let gpu = 0;
  const outPages: { file: string; w: number; h: number }[] = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const file = `fx_${spec.id}-${i}.png`;
    bytes += await out.png(`${tier}/${file}`, p.w, p.h, bufs[i]);
    gpu += p.w * p.h * 4;
    outPages.push({ file, w: p.w, h: p.h });
  }
  const json = JSON.stringify({
    id: `fx_${spec.id}`,
    kind: 'fx',
    blend: spec.blend,
    dirs,
    scale: tier === 'hi' ? 1 : 0.5,
    anims: { idle: { frames: count, fps, loop: !!spec.loop, action: -1, dirs } },
    pages: outPages,
    frames: rects,
  });
  await out.write(`${tier}/fx_${spec.id}.json`, json);
  return { bytes: bytes + json.length, gpu };
}

export async function exportFx(data: GameData, out: Sink, log: (s: string) => void, only?: string[], tiers: readonly ('hi' | 'lo')[] = ['hi', 'lo']): Promise<Record<string, unknown>> {
  const { vfs } = data;
  const pal = data.palette(1);
  const sheets: Record<string, unknown> = {};
  for (const spec of FX) {
    if (only?.length && !only.includes(`fx_${spec.id}`) && !only.includes('fx')) continue;
    try {
      const bytes = vfs.get(`data\\global\\${spec.file}.dcc`);
      if (!bytes) throw new Error('fichier absent');
      const dcc = decodeDcc(bytes);
      const n = dcc.directions.length;
      const order = directionOrder(n).rows.map((r) => r.source);
      const step = spec.thin && spec.thin > 1 ? spec.thin : 1;
      const total = dcc.framesPerDir;
      const picks = Array.from({ length: Math.ceil(total / step) }, (_, i) => i * step);
      // direction du jeu i (0 = +x monde = bas-droite) → ligne D2 (0 = bas, sens horaire)
      const rows = n === 1 ? [0] : Array.from({ length: n }, (_, i) => (i + Math.round((7 * n) / 8)) % n);
      const hi = new Map<string, Img>();
      const lo = new Map<string, Img>();
      rows.forEach((row, gi) => {
        const d = dcc.directions[order[row] ?? 0];
        picks.forEach((sf, f) => {
          const fr = d.frames[sf];
          if (!fr || !fr.w || !fr.h) {
            hi.set(`idle/${gi}/${f}`, { w: 1, h: 1, ax: 0, ay: 0, rgba: new Uint8Array(4) });
            lo.set(`idle/${gi}/${f}`, { w: 1, h: 1, ax: 0, ay: 0, rgba: new Uint8Array(4) });
            return;
          }
          const im = toImg(fr.px, fr.w, fr.h, fr.ox, fr.oy, pal);
          hi.set(`idle/${gi}/${f}`, im);
          lo.set(`idle/${gi}/${f}`, halve(im));
        });
      });
      const fps = Math.round(((spec.fps ?? 25) / step) * 100) / 100;
      const none = { bytes: 0, gpu: 0 };
      const h = tiers.includes('hi') ? await writeSheet(out, spec, 'hi', hi, n, picks.length, fps) : none;
      const l = tiers.includes('lo') ? await writeSheet(out, spec, 'lo', lo, n, picks.length, fps) : none;
      sheets[`fx_${spec.id}`] = { hash: sha1Hex(spec.file + total).slice(0, 16), hi: h, lo: l, kind: 'fx' };
      log(`  fx_${spec.id.padEnd(16)} ${spec.file.padEnd(38)} ${n} dir. × ${picks.length} i. — GPU hi ${(h.gpu / 1048576).toFixed(2)} Mo`);
    } catch (e) {
      log(`  fx_${spec.id.padEnd(16)} ÉCHEC → particules du jeu : ${(e as Error).message}`);
    }
  }
  return sheets;
}
