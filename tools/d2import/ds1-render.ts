/**
 * Rendu d'une carte DS1 de Diablo II en une image (sols, ombres, murs, toits) : sert à contrôler le décodage, puis à découper les bâtiments et
 * les zones des villes. Les cases sont des losanges de 160 × 80 px ; les tuiles viennent des DT1 que la carte déclare.
 */
import type { GameData } from './data';
import { decodeDt1, type Dt1Tile } from './formats/dt1';
import { decodeDs1, cell, type Ds1 } from './formats/ds1';

export interface DsTile {
  t: Dt1Tile;
  rgba: Uint8Array;
  /** tuile de repérage (collision.dt1) : compte pour la collision, jamais dessinée */
  marker?: boolean;
  /** fichier DT1 d'origine (nom seul, minuscules) */
  file: string;
}

export interface Ds1Render {
  ds1: Ds1;
  w: number;
  h: number;
  /** décalage horizontal de la case (0, 0) dans l'image */
  originX: number;
  originY: number;
  rgba: Uint8Array;
  missing: number;
  drawn: number;
}

const TW = 160;
const TH = 80;

export function pickTile(list: DsTile[] | undefined, seed: number): DsTile | null {
  return pick(list, seed);
}

export function loadDs1Tiles(data: GameData, ds1: Ds1): Map<string, DsTile[]> {
  const pal = data.palette(ds1.act);
  const map = new Map<string, DsTile[]>();
  for (const f of ds1.dt1) {
    const marker = /(collision|inviswal)\.dt1$/i.test(f);
    const bytes = data.vfs.get(`data\\global\\tiles\\${f}`);
    if (!bytes) continue;
    for (const t of decodeDt1(bytes)) {
      const { w, h, px } = t.image;
      if (!w || !h) continue;
      const rgba = new Uint8Array(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        const c = px[i];
        if (c) rgba.set([pal[c * 3], pal[c * 3 + 1], pal[c * 3 + 2], 255], i * 4);
      }
      const k = `${t.orientation}/${t.mainIndex}/${t.subIndex}`;
      // tuile d'une seule couleur unie (losange vert ou cyan de l'éditeur) : repère, jamais dessinée
      let flat = px.length > 300;
      let first = 0;
      for (let i = 0; i < w * h && flat; i++) {
        if (!px[i]) continue;
        if (!first) first = px[i];
        else if (px[i] !== first) flat = false;
      }
      const isMarker = marker || (flat && first !== 0);
      const l = map.get(k);
      if (l) l.push({ t, rgba, marker: isMarker, file: f.split('\\').pop()! });
      else map.set(k, [{ t, rgba, marker: isMarker, file: f.split('\\').pop()! }]);
    }
  }
  return map;
}

/** Pixels dessinés d'une tuile (mis en cache) */
const coverage = new WeakMap<DsTile, number>();
function covered(t: DsTile): number {
  let c = coverage.get(t);
  if (c === undefined) {
    c = 0;
    for (let i = 3; i < t.rgba.length; i += 4) if (t.rgba[i]) c++;
    coverage.set(t, c);
  }
  return c;
}

function pick(all: DsTile[] | undefined, seed: number): DsTile | null {
  if (!all?.length) return null;
  // un sol (losange de 160 × 80) dont une variante est incomplète (superposition de décor) : on ne tire que parmi les variantes qui couvrent le losange
  let list = all;
  if (all.length > 1 && all[0].t.orientation === 0) {
    const full = all.filter((t) => covered(t) >= 0.85 * 6400);
    if (full.length && full.length < all.length) list = full;
  }
  // les tuiles de repérage n'entrent en jeu que si elles sont seules (la collision les lit à part)
  const total = list.reduce((s, x) => s + Math.max(1, x.t.rarity), 0);
  let r = ((seed % 997) / 997) * total;
  for (const x of list) {
    r -= Math.max(1, x.t.rarity);
    if (r <= 0) return x;
  }
  return list[list.length - 1];
}

function blit(dst: Uint8Array, dw: number, dh: number, src: Uint8Array, sw: number, sh: number, x0: number, y0: number): void {
  for (let y = 0; y < sh; y++) {
    const yy = y0 + y;
    if (yy < 0 || yy >= dh) continue;
    for (let x = 0; x < sw; x++) {
      const xx = x0 + x;
      if (xx < 0 || xx >= dw) continue;
      const s = (y * sw + x) * 4;
      if (!src[s + 3]) continue;
      dst.set(src.subarray(s, s + 4), (yy * dw + xx) * 4);
    }
  }
}

export function renderDs1(data: GameData, path: string | Ds1, only?: { x0: number; y0: number; x1: number; y1: number }): Ds1Render {
  let ds1: Ds1;
  if (typeof path === 'string') {
    const bytes = data.vfs.get(`data\\global\\tiles\\${path}`);
    if (!bytes) throw new Error(`DS1 absent : ${path}`);
    ds1 = decodeDs1(bytes);
  } else ds1 = path;
  const tiles = loadDs1Tiles(data, ds1);
  const { width: W, height: H } = ds1;
  const c = only ?? { x0: 0, y0: 0, x1: W, y1: H };
  // image : losange de la zone, marge haute pour les murs et les toits
  const cw = c.x1 - c.x0;
  const ch = c.y1 - c.y0;
  const w = (cw + ch) * (TW / 2) + 400;
  const h = (cw + ch) * (TH / 2) + 700;
  const originX = ch * (TW / 2) + 200;
  const originY = 500;
  const rgba = new Uint8Array(w * h * 4);
  let missing = 0;
  let drawn = 0;
  const at = (x: number, y: number) => ({ X: originX + (x - c.x0 - (y - c.y0)) * (TW / 2) - TW / 2 + TW / 2, Y: originY + (x - c.x0 + (y - c.y0)) * (TH / 2) });
  const put = (tile: DsTile, x: number, y: number, wall: boolean, roof: boolean): void => {
    const { X, Y } = at(x, y);
    const { image, roofHeight } = tile.t;
    // origine de la tuile = sommet gauche du losange ; sols : image depuis le haut ; murs : décalage compté depuis le bas du losange
    const ox = X - TW / 2 + image.ox;
    const oy = Y + (wall ? image.oy + TH : roof ? image.oy - roofHeight : image.oy);
    blit(rgba, w, h, tile.rgba, image.w, image.h, ox, oy);
    drawn++;
  };
  // sols (toutes les couches), puis ombres
  for (const fl of ds1.floors) {
    for (let y = c.y0; y < c.y1; y++) {
      for (let x = c.x0; x < c.x1; x++) {
        const v = fl[y * W + x];
        if (!v) continue;
        const cl = cell(v);
        const t = pick(tiles.get(`0/${cl.main}/${cl.sub}`), x * 7 + y * 13);
        if (t) put(t, x, y, false, false);
        else missing++;
      }
    }
  }
  // murs par ordre de profondeur (x + y), puis toits
  const order: [number, number][] = [];
  for (let y = c.y0; y < c.y1; y++) for (let x = c.x0; x < c.x1; x++) order.push([x, y]);
  order.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[1] - b[1]);
  for (const roofPass of [false, true]) {
    for (const [x, y] of order) {
      for (const wl of ds1.walls) {
        const v = wl.cells[y * W + x];
        if (!v) continue;
        const cl = cell(v);
        if (cl.hidden) continue;
        const o = wl.orient[y * W + x] & 0xff;
        const isRoof = o === 15;
        if (isRoof !== roofPass) continue;
        const t = pick(tiles.get(`${o}/${cl.main}/${cl.sub}`), x * 7 + y * 13);
        if (t) put(t, x, y, !isRoof && o !== 0, isRoof);
        else missing++;
      }
    }
  }
  // marqueurs des objets (contrôle) : monstres/PNJ (type 1) en rouge, objets (type 2) en vert ; position en sous-tuiles / 5 = cases
  if (process.env.DS1_MARKS) {
    for (const o of ds1.objects) {
      const gx = o.x / 5;
      const gy = o.y / 5;
      const X = Math.round(originX + (gx - c.x0 - (gy - c.y0)) * (TW / 2));
      const Y = Math.round(originY + (gx - c.x0 + (gy - c.y0)) * (TH / 2));
      for (let dy = -6; dy <= 6; dy++)
        for (let dx = -6; dx <= 6; dx++) if (X + dx >= 0 && Y + dy >= 0 && X + dx < w && Y + dy < h) rgba.set(o.type === 1 ? [255, 40, 40, 255] : [40, 255, 40, 255], ((Y + dy) * w + X + dx) * 4);
    }
  }
  return { ds1, w, h, originX, originY, rgba, missing, drawn };
}
