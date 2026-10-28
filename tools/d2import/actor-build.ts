/**
 * Construction des planches d'une unité (images composées, rognage, ombres, réduction, mise en pages) : sans API
 * Node, partagée entre le CLI (export-game.ts) et le navigateur (browser.ts, Web Worker).
 */
import type { GameData } from './data';
import { parseCof } from './formats/cof';
import type { Dcc } from './formats/dcc';
import { compose } from './compose';
import { gearOptions, loadLayer } from './layers';
import { pack } from './atlas';
import { modeFor, type GameActor, type GameAnim } from './game-map';
import { directionOrder } from './directions';

export interface Img {
  w: number;
  h: number;
  ax: number;
  ay: number;
  rgba: Uint8Array;
  /** pièce dessinée derrière le corps à cette image (arme, bouclier) */
  behind?: boolean;
}

const ANIMS: GameAnim[] = ['idle', 'walk', 'attack', 'cast', 'hit', 'death'];
const LOOPS = new Set<GameAnim>(['idle', 'walk']);
const EMPTY: Img = { w: 1, h: 1, ax: 0, ay: 0, rgba: new Uint8Array(4) };

/** Rogne les bords transparents ; ancre relative à l'image rognée */
export function trim(rgba: Uint8Array, w: number, h: number, ax: number, ay: number): Img {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return EMPTY;
  const nw = x1 - x0 + 1;
  const nh = y1 - y0 + 1;
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) out.set(rgba.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + nw) * 4), y * nw * 4);
  return { w: nw, h: nh, ax: ax - x0, ay: ay - y0, rgba: out };
}

/** Étale la couleur des bords sous les pixels transparents (alpha inchangé) : le filtrage bilinéaire n'y mêle plus de noir, d'où plus de liserés sombres autour d'une lumière */
export function bleed(im: Img, passes = 4): Img {
  const { w, h, rgba } = im;
  const filled = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) filled[i] = rgba[i * 4 + 3] ? 1 : 0;
  for (let p = 0; p < passes; p++) {
    const next = filled.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (filled[i]) continue;
        let n = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h || !filled[yy * w + xx]) continue;
            const q = (yy * w + xx) * 4;
            n++;
            r += rgba[q];
            g += rgba[q + 1];
            b += rgba[q + 2];
          }
        }
        if (n) {
          rgba[i * 4] = r / n;
          rgba[i * 4 + 1] = g / n;
          rgba[i * 4 + 2] = b / n;
          next[i] = 1;
        }
      }
    }
    filled.set(next);
  }
  return im;
}

/** Réduction par deux (filtre en boîte ; un pixel est dessiné si au moins 2 pixels sur 4 le sont, lueurs comprises) */
export function half(src: Uint8Array, w: number, h: number, ax: number, ay: number): { rgba: Uint8Array; w: number; h: number; ax: number; ay: number } {
  const nw = Math.ceil(w / 2);
  const nh = Math.ceil(h / 2);
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let n = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let al = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = x * 2 + dx;
          const sy = y * 2 + dy;
          if (sx >= w || sy >= h) continue;
          const o = (sy * w + sx) * 4;
          const a = src[o + 3];
          if (!a) continue;
          n++;
          r += src[o] * a;
          g += src[o + 1] * a;
          b += src[o + 2] * a;
          al += a;
        }
      }
      if (n >= 2) {
        const o = (y * nw + x) * 4;
        out[o] = Math.round(r / al);
        out[o + 1] = Math.round(g / al);
        out[o + 2] = Math.round(b / al);
        // bord net : l'opacité est la moyenne des seuls pixels dessinés (255 pour un sprite opaque)
        out[o + 3] = Math.round(al / n);
      }
    }
  }
  return { rgba: out, w: nw, h: nh, ax: ax / 2, ay: ay / 2 };
}

/**
 * Ombre synthétique : silhouette aplatie et couchée vers la gauche et l'arrière (comme les ombres
 * actuelles du jeu), noire, à demi-résolution de l'image d'origine.
 */
export function shadow(src: Uint8Array, w: number, h: number, ax: number, ay: number): Img {
  const K_X = 0.55;
  const K_Y = 0.28;
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  const pts: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (src[(y * w + x) * 4 + 3] < 128) continue; // les lueurs ne projettent pas d'ombre
      const dy = y - ay;
      const sx = Math.floor((x - ax + dy * K_X) / 2);
      const sy = Math.floor((dy * K_Y) / 2);
      pts.push(sx, sy);
      if (sx < x0) x0 = sx;
      if (sx > x1) x1 = sx;
      if (sy < y0) y0 = sy;
      if (sy > y1) y1 = sy;
    }
  }
  if (!pts.length) return EMPTY;
  const nw = x1 - x0 + 1;
  const nh = y1 - y0 + 1;
  const out = new Uint8Array(nw * nh * 4);
  for (let i = 0; i < pts.length; i += 2) out[((pts[i + 1] - y0) * nw + (pts[i] - x0)) * 4 + 3] = 255;
  return { w: nw, h: nh, ax: -x0, ay: -y0, rgba: out };
}

/** px par sous-tuile de D2 pour un déplacement vers la droite de l'écran (une unité du jeu = 2 sous-tuiles = 45,25 px) */
const PX_PER_SUBTILE = 32 / Math.SQRT2;

/**
 * Foulée mesurée sur les images d'une marche vers la droite de l'écran : recul médian (px par image) du pied
 * d'appui, c'est-à-dire des trois rangées de pixels les plus basses. 0 si la mesure n'est pas exploitable
 * (créature flottante, pattes multiples).
 */
function measureStride(frames: Uint8Array[], w: number, h: number, ax: number): number {
  const xs: number[] = [];
  for (const rgba of frames) {
    let bottom = -1;
    for (let y = h - 1; y >= 0 && bottom < 0; y--)
      for (let x = 0; x < w; x++)
        if (rgba[(y * w + x) * 4 + 3]) {
          bottom = y;
          break;
        }
    if (bottom < 0) return 0;
    let sum = 0;
    let n = 0;
    for (let y = bottom; y > bottom - 3 && y >= 0; y--)
      for (let x = 0; x < w; x++)
        if (rgba[(y * w + x) * 4 + 3]) {
          sum += x - ax;
          n++;
        }
    xs.push(sum / n);
  }
  const back: number[] = [];
  for (let f = 0; f < xs.length; f++) {
    const d = xs[f] - xs[(f + 1) % xs.length];
    if (d > 0.5 && d < 20) back.push(d);
  }
  if (back.length < 3) return 0;
  back.sort((p, q) => p - q);
  return back[Math.floor(back.length / 2)];
}

export interface Tier {
  frames: Map<string, Img>;
  shadows: Map<string, Img>;
}

/** Met en pages (2048 max) : pixels RGBA de chaque page et rectangles des images ; l'encodage PNG est laissé à l'appelant */
export function layoutPages(items: Map<string, Img>): { pages: { w: number; h: number }[]; bufs: Uint8Array[]; rects: Record<string, number[]> } {
  const names = [...items.keys()];
  const list = names.map((n) => items.get(n)!);
  const { placements, pages } = pack(list, 2048, 2048);
  const bufs = pages.map((p) => new Uint8Array(p.w * p.h * 4));
  const rects: Record<string, number[]> = {};
  names.forEach((n, i) => {
    const im = list[i];
    const pl = placements[i];
    const page = pages[pl.page];
    for (let y = 0; y < im.h; y++) bufs[pl.page].set(im.rgba.subarray(y * im.w * 4, (y + 1) * im.w * 4), ((pl.y + y) * page.w + pl.x) * 4);
    rects[n] = im.behind === undefined ? [pl.page, pl.x, pl.y, im.w, im.h, im.ax, im.ay] : [pl.page, pl.x, pl.y, im.w, im.h, im.ax, im.ay, im.behind ? 1 : 0];
  });
  return { pages, bufs, rects };
}

export function buildActor(data: GameData, a: GameActor, warnings: string[], tiers: readonly ('hi' | 'lo')[] = ['hi', 'lo']) {
  const wantHi = tiers.includes('hi');
  const wantLo = tiers.includes('lo');
  const { vfs } = data;
  const root = `data\\global\\${a.kind}\\${a.code}`;
  const stats = a.kind === 'monsters' ? data.needTable('monstats').rows.find((r) => r.Code.toLowerCase() === a.code) : undefined;
  const baseW = (a.wclass ?? stats?.BaseW ?? 'hth').toLowerCase();
  const pal = data.palette(a.act);
  const hi: Tier = { frames: new Map(), shadows: new Map() };
  const lo: Tier = { frames: new Map(), shadows: new Map() };
  const anims: Record<string, { frames: number; fps: number; loop: boolean; action: number; dirs: number; stride?: number }> = {};
  let maxDirs = 1;
  /** Compose un mode D2 (calques du COF et équipement choisi) ; null si le mode n'existe pas */
  const composeMode = (mode: string, label: string) => {
    let cofBytes: Uint8Array | null = null;
    let wc = baseW;
    for (const w of [...new Set([baseW, 'hth'])]) {
      cofBytes = vfs.get(`${root}\\cof\\${a.code}${mode}${w}.cof`);
      if (cofBytes) {
        wc = w;
        break;
      }
    }
    if (!cofBytes) return null;
    const cof = parseCof(cofBytes);
    const layers = new Map<number, Dcc>();
    for (const l of cof.layers) {
      let gear = a.gear?.[l.dir];
      if (gear === null) continue;
      // quelques calques nomment le mode de marche « wk » au lieu de « wl » (ex. Valkyrie)
      let fileMode = mode;
      let opts = gearOptions(vfs, root, a.code, l.dir, fileMode, l.weaponClass);
      if (!opts.length && mode === 'wl') {
        fileMode = 'wk';
        opts = gearOptions(vfs, root, a.code, l.dir, fileMode, l.weaponClass);
      }
      if (gear === undefined) gear = opts.includes('lit') ? 'lit' : opts.sort()[0];
      // équipement demandé absent pour ce mode (ex. mort des personnages : tenue légère seulement) → tenue légère
      if (gear && !opts.includes(gear) && opts.includes('lit')) gear = 'lit';
      if (!gear || !opts.includes(gear)) {
        if (gear) warnings.push(`${a.id}/${label}: ${l.dir}=${gear} absent (${opts.join(',') || 'aucun'})`);
        continue;
      }
      const got = loadLayer(vfs, `${root}\\${l.dir}\\${a.code}${l.dir}${gear}${fileMode}${l.weaponClass}`);
      if (got) layers.set(l.composit, got.dcc);
    }
    if (!layers.size) {
      warnings.push(`${a.id}/${label}: aucun calque`);
      return null;
    }
    return { c: compose(cof, layers, pal, a.additive, a.partLayer ? ({ rh: 5, lh: 6, sh: 7 } as Record<string, number>)[a.partLayer] : -1), wc };
  };
  const blank = (rgba: Uint8Array) => {
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) return false;
    return true;
  };
  for (const anim of ANIMS) {
    const mode = modeFor(a, anim);
    if (!mode) continue;
    const got = composeMode(mode, anim);
    if (!got) continue;
    const { c, wc } = got;
    // mort dont la dernière image est vide : le cadavre (mode « dd ») sert de pose finale quand il existe
    let corpse: ReturnType<typeof composeMode> = null;
    if (anim === 'death' && mode === 'dt' && c.rgba.every((d) => blank(d[c.frames - 1]))) {
      corpse = composeMode('dd', 'corpse');
      if (corpse && (corpse.c.directions !== c.directions || corpse.c.rgba.every((d) => blank(d[0])))) corpse = null;
    }
    const n = c.directions;
    const gameDirs = n; // une direction du jeu par direction D2 de l'animation
    maxDirs = Math.max(maxDirs, gameDirs);
    const rec = data.animdata.get(`${a.code}${mode}${wc}`.toUpperCase());
    const trig = (rec?.flags ?? []).findIndex((f) => f === 1);
    const srcFps = rec?.fps ?? 12;
    // allègement : une image sur `step` (la dernière image d'origine reste la dernière : pose finale de la mort)
    const step = a.thin && a.thin > 1 && (srcFps >= 17 || anim === 'death') ? a.thin : 1;
    let picks = Array.from({ length: Math.ceil(c.frames / step) }, (_, i) => i * step);
    // décor posé des cartes (dec_…) : objects.txt dit si le mode neutre s'anime (FrameCnt0 / CycleAnim0 / FrameDelta0) ; sinon image fixe (les autres images sont des variantes)
    let fpsOverride = 0;
    if (a.id.startsWith('dec_')) {
      const row = data.table('objects')?.rows.find((r) => String(r.Token ?? '').toLowerCase() === a.code);
      const cnt = Number(row?.FrameCnt0 ?? 0);
      const cycles = String(row?.CycleAnim0 ?? '0') === '1';
      const fire = String(row?.Name ?? '').toLowerCase() === 'fire' && cnt === 0;
      if (fire || (cycles && cnt > 1)) picks = picks.slice(0, fire ? picks.length : cnt);
      else picks = [0];
      const delta = Number(row?.FrameDelta0 ?? 0);
      if (picks.length > 1 && delta > 0) fpsOverride = Math.round((delta / 256) * 25 * 100) / 100;
    }
    if (!LOOPS.has(anim)) picks[picks.length - 1] = c.frames - 1;
    // personnage dont la mort se termine par des images vides, sans cadavre : le corps reste sur sa dernière image dessinée
    if (anim === 'death' && a.kind === 'chars' && !corpse) while (picks.length > 1 && c.rgba.every((d) => blank(d[picks[picks.length - 1]]))) picks.pop();
    // direction du jeu i (0 = +x monde = bas-droite) → ligne D2 (0 = bas, sens horaire)
    const rows = gameDirs === 1 ? [0] : Array.from({ length: gameDirs }, (_, i) => (i + Math.round((7 * gameDirs) / 8)) % gameDirs);
    // ordre logique → indice interne du DCC
    const order = orderFor(gameDirs);
    anims[anim] = { frames: picks.length, fps: fpsOverride || Math.round((srcFps / step) * 100) / 100, loop: LOOPS.has(anim), action: trig < 0 ? trig : Math.floor(trig / step), dirs: gameDirs };
    if (anim === 'walk' && gameDirs >= 8) {
      // foulée (px par image, à l'échelle 1) : le jeu en déduit la cadence d'après la vitesse réelle de l'unité.
      // Mesurée sur les images quand elle est plausible, sinon déduite de la vitesse D2 (sous-tuiles/s) et d'animdata.
      const right = order[rows[Math.round((7 * gameDirs) / 8) % gameDirs]];
      const velocity = a.kind === 'chars' ? (mode === 'rn' ? 9 : 6) : Number((mode === 'rn' ? stats?.Run : stats?.Velocity) ?? 0);
      const derived = velocity > 0 ? (velocity * PX_PER_SUBTILE) / srcFps : 0;
      const measured = measureStride(c.rgba[right], c.w, c.h, c.ax);
      const ok = measured > 0 && (derived === 0 ? measured >= 2 && measured <= 14 : measured >= derived * 0.6 && measured <= derived * 1.7);
      const stride = ok ? measured : derived;
      if (stride > 0) anims[anim].stride = Math.round(stride * step * 100) / 100;
    }
    rows.forEach((row, gi) => {
      const src = order[row];
      picks.forEach((sf, f) => {
        const from = corpse && f === picks.length - 1 ? corpse.c : c;
        const rgba = from === c ? c.rgba[src][sf] : from.rgba[src][0];
        const name = `${anim}/${gi}/${f}`;
        const isBehind = from === c && c.behind ? c.behind[src][sf] : undefined;
        if (wantHi) {
          const hiImg = a.additive ? bleed(trim(rgba, from.w, from.h, from.ax, from.ay)) : trim(rgba, from.w, from.h, from.ax, from.ay);
          hi.frames.set(name, isBehind === undefined ? hiImg : { ...hiImg, behind: isBehind });
          hi.shadows.set(name, shadow(rgba, from.w, from.h, from.ax, from.ay));
        }
        if (wantLo) {
          const lw = half(rgba, from.w, from.h, from.ax, from.ay);
          const loImg = a.additive ? bleed(trim(lw.rgba, lw.w, lw.h, lw.ax, lw.ay)) : trim(lw.rgba, lw.w, lw.h, lw.ax, lw.ay);
          lo.frames.set(name, isBehind === undefined ? loImg : { ...loImg, behind: isBehind });
          lo.shadows.set(name, shadow(lw.rgba, lw.w, lw.h, lw.ax, lw.ay));
        }
      });
    });
  }
  return { anims, hi, lo, maxDirs };
}

function orderFor(n: number): number[] {
  return directionOrder(n).rows.map((r) => r.source);
}
