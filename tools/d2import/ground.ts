/**
 * Sols de Diablo II pour le jeu : les tuiles de sol (orientation 0, losange 160 × 80 px = 5 × 5 sous-tuiles =
 * 2,5 unités du jeu) d'un DT1 sont assemblées en tuiles du jeu (2 × 2 tuiles D2 = 5 unités) et en taches
 * organiques pour les chemins et parcelles. Sortie au format des planches de sol du jeu (public/sprites).
 */
import type { GameData } from './data';
import { decodeDt1, type Dt1Tile } from './formats/dt1';
import type { Sink } from './sink';

export const TILE_W = 160;
export const TILE_H = 80;

export interface FloorTile {
  main: number;
  sub: number;
  rarity: number;
  /** image RGBA 160 × 80 (losange plein pour un sol complet) */
  rgba: Uint8Array;
  /** nombre de pixels dessinés (6400 pour un losange plein) */
  opaque: number;
}

/** Tuiles de sol d'un DT1, recadrées sur le losange 160 × 80 */
export function loadFloors(data: GameData, dt1: string, act: number): FloorTile[] {
  const bytes = data.vfs.get(`data\\global\\tiles\\${dt1.replace(/\//g, '\\')}`);
  if (!bytes) throw new Error(`DT1 absent : ${dt1}`);
  const pal = data.palette(act);
  const out: FloorTile[] = [];
  for (const t of decodeDt1(bytes) as Dt1Tile[]) {
    if (t.orientation !== 0) continue;
    const rgba = new Uint8Array(TILE_W * TILE_H * 4);
    let opaque = 0;
    const { w, h, ox, oy, px } = t.image;
    for (let y = 0; y < h; y++) {
      const yy = y + oy;
      if (yy < 0 || yy >= TILE_H) continue;
      for (let x = 0; x < w; x++) {
        const xx = x + ox;
        const c = px[y * w + x];
        if (!c || xx < 0 || xx >= TILE_W) continue;
        const o = (yy * TILE_W + xx) * 4;
        rgba[o] = pal[c * 3];
        rgba[o + 1] = pal[c * 3 + 1];
        rgba[o + 2] = pal[c * 3 + 2];
        rgba[o + 3] = 255;
        opaque++;
      }
    }
    out.push({ main: t.mainIndex, sub: t.subIndex, rarity: t.rarity, rgba, opaque });
  }
  return out;
}

export interface RawTile {
  orientation: number;
  main: number;
  sub: number;
  rarity: number;
  w: number;
  h: number;
  /** décalage de l'image par rapport à l'origine de la tuile (coin haut-gauche du losange 160 × 80) ; murs : base en y = 80 */
  ox: number;
  oy: number;
  rgba: Uint8Array;
}

/** Tuiles d'un DT1 pour une liste d'orientations (murs 1-12, toits 15…), en RGBA, placées par rapport au losange */
export function loadTiles(data: GameData, dt1: string, act: number, orientations: number[]): RawTile[] {
  const bytes = data.vfs.get(`data\\global\\tiles\\${dt1.replace(/\//g, '\\')}`);
  if (!bytes) throw new Error(`DT1 absent : ${dt1}`);
  const pal = data.palette(act);
  const out: RawTile[] = [];
  for (const t of decodeDt1(bytes) as Dt1Tile[]) {
    if (!orientations.includes(t.orientation)) continue;
    const { w, h, ox, oy, px } = t.image;
    const rgba = new Uint8Array(w * h * 4);
    let n = 0;
    for (let i = 0; i < w * h; i++) {
      const c = px[i];
      if (!c) continue;
      n++;
      rgba[i * 4] = pal[c * 3];
      rgba[i * 4 + 1] = pal[c * 3 + 1];
      rgba[i * 4 + 2] = pal[c * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
    if (!n) continue;
    // sols et toits : y depuis le haut du losange ; murs : y négatifs depuis le bas du losange
    out.push({
      orientation: t.orientation,
      main: t.mainIndex,
      sub: t.subIndex,
      rarity: t.rarity,
      w,
      h,
      ox,
      oy: t.orientation === 0 || t.orientation === 15 ? oy - (t.orientation === 15 ? t.roofHeight : 0) : oy + TILE_H,
      rgba,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Planches de sol au format du jeu                                     */
/* ------------------------------------------------------------------ */
import { GROUNDS, type GroundSpec } from './ground-map';

const VARIANTS = 6;
const SPLATS = 4;
/** tuile du jeu = 2 × 2 tuiles D2 (5 unités) */
const GW = TILE_W * 2;
const GH = TILE_H * 2;
/** tache : 3 unités, comme celles du jeu */
const SW = 192;
const SH = 96;

function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Assemble n × n tuiles D2 tirées au hasard (pondérées par leur rareté) en un losange */
function assemble(tiles: FloorTile[], n: number, rand: () => number, gain: number): Uint8Array {
  const W = TILE_W * n;
  const H = TILE_H * n;
  const out = new Uint8Array(W * H * 4);
  const total = tiles.reduce((s, t) => s + Math.max(1, t.rarity), 0);
  const draw = () => {
    let r = rand() * total;
    for (const t of tiles) {
      r -= Math.max(1, t.rarity);
      if (r <= 0) return t;
    }
    return tiles[tiles.length - 1];
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const t = draw();
      const x0 = (i - j) * (TILE_W / 2) + (W - TILE_W) / 2;
      const y0 = (i + j) * (TILE_H / 2);
      for (let y = 0; y < TILE_H; y++) {
        for (let x = 0; x < TILE_W; x++) {
          const s = (y * TILE_W + x) * 4;
          if (!t.rgba[s + 3]) continue;
          const o = ((y0 + y) * W + x0 + x) * 4;
          out[o] = Math.min(255, t.rgba[s] * gain);
          out[o + 1] = Math.min(255, t.rgba[s + 1] * gain);
          out[o + 2] = Math.min(255, t.rgba[s + 2] * gain);
          out[o + 3] = 255;
        }
      }
    }
  }
  return out;
}

/** Tache organique : sol découpé par une ellipse isométrique au bord irrégulier (tramage, pas de demi-transparence) */
function splat(tiles: FloorTile[], rand: () => number, gain: number): Uint8Array {
  const src = assemble(tiles, 2, rand, gain);
  const out = new Uint8Array(SW * SH * 4);
  const lobes = Array.from({ length: 5 }, () => [rand() * Math.PI * 2, 0.04 + rand() * 0.07, 2 + Math.floor(rand() * 4)]);
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const dx = (x + 0.5 - SW / 2) / (SW / 2);
      const dy = (y + 0.5 - SH / 2) / (SH / 2);
      const ang = Math.atan2(dy, dx);
      let edge = 0.8;
      for (const [ph, amp, k] of lobes) edge += amp * Math.sin(ang * k + ph);
      const r = Math.hypot(dx, dy);
      // bord tramé sur 18 % du rayon
      const p = (edge - r) / 0.18;
      if (p <= 0 || (p < 1 && rand() > p)) continue;
      const s = ((y + (GH - SH) / 2) * GW + x + (GW - SW) / 2) * 4;
      if (!src[s + 3]) continue;
      out.set(src.subarray(s, s + 4), (y * SW + x) * 4);
    }
  }
  return out;
}

function halve(src: Uint8Array, w: number, h: number): Uint8Array {
  const nw = w / 2;
  const nh = h / 2;
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let n = 0;
      const c = [0, 0, 0];
      for (let d = 0; d < 4; d++) {
        const s = ((y * 2 + (d >> 1)) * w + x * 2 + (d & 1)) * 4;
        if (!src[s + 3]) continue;
        n++;
        c[0] += src[s];
        c[1] += src[s + 1];
        c[2] += src[s + 2];
      }
      if (n >= 2) out.set([c[0] / n, c[1] / n, c[2] / n, 255], (y * nw + x) * 4);
    }
  }
  return out;
}

export interface GroundEntry {
  hi: { bytes: number; gpu: number };
  lo: { bytes: number; gpu: number };
}

/** Écrit une planche de sol (deux paliers) et renvoie son entrée de manifeste */
async function buildGroundSheet(data: GameData, spec: GroundSpec, out: Sink, only: readonly ('hi' | 'lo')[] = ['hi', 'lo']): Promise<GroundEntry> {
  const all = loadFloors(data, spec.dt1, spec.act);
  const tiles = all.filter((t) => t.opaque >= TILE_W * TILE_H * 0.49 && spec.pick.some(([m, s]) => t.main === m && t.sub === s));
  if (!tiles.length) throw new Error(`aucune tuile pleine pour ${spec.pick.map((p) => p.join(',')).join(' ; ')} dans ${spec.dt1}`);
  const rand = rng(spec.id);
  const gain = spec.gain ?? 1;
  const images: { name: string; w: number; h: number; rgba: Uint8Array }[] = [];
  for (let v = 0; v < VARIANTS; v++) images.push({ name: `tile/${v}`, w: GW, h: GH, rgba: assemble(tiles, 2, rand, gain) });
  for (let v = 0; v < SPLATS; v++) images.push({ name: `splat/${v}`, w: SW, h: SH, rgba: splat(tiles, rand, gain) });
  const entry = { hi: { bytes: 0, gpu: 0 }, lo: { bytes: 0, gpu: 0 } } as GroundEntry;
  for (const [tier, scale] of [
    ['hi', 1],
    ['lo', 0.5],
  ] as const) {
    if (!only.includes(tier)) continue;
    const list = scale === 1 ? images : images.map((im) => ({ ...im, w: im.w / 2, h: im.h / 2, rgba: halve(im.rgba, im.w, im.h) }));
    // page : tuiles en colonne, taches à droite
    const tw = list[0].w;
    const th = list[0].h;
    const sw = list[VARIANTS].w;
    const sh = list[VARIANTS].h;
    const W = tw + 1 + sw;
    const H = Math.max(VARIANTS * (th + 1), SPLATS * (sh + 1));
    const page = new Uint8Array(W * H * 4);
    const frames: Record<string, number[]> = {};
    list.forEach((im, k) => {
      const isTile = k < VARIANTS;
      const x = isTile ? 0 : tw + 1;
      const y = isTile ? k * (th + 1) : (k - VARIANTS) * (sh + 1);
      for (let r = 0; r < im.h; r++) page.set(im.rgba.subarray(r * im.w * 4, (r + 1) * im.w * 4), ((y + r) * W + x) * 4);
      frames[im.name] = [0, x, y, im.w, im.h, im.w / 2, im.h / 2];
    });
    const file = `${spec.id}-0.png`;
    const pngBytes = await out.png(`${tier}/${file}`, W, H, page);
    const json = JSON.stringify({ id: spec.id, kind: 'ground', scale, tileSize: 5, splatSize: 3, variants: VARIANTS, pages: [{ file, w: W, h: H }], frames });
    await out.write(`${tier}/${spec.id}.json`, json);
    entry[tier] = { bytes: pngBytes + json.length, gpu: W * H * 4 };
  }
  return entry;
}

/** Tous les sols de ground-map.ts (ou seulement `only`) ; un sol en échec garde celui du jeu */
export async function exportGrounds(data: GameData, out: Sink, log: (s: string) => void, only?: string[], tiers: readonly ('hi' | 'lo')[] = ['hi', 'lo']): Promise<Record<string, GroundEntry>> {
  const res: Record<string, GroundEntry> = {};
  for (const spec of GROUNDS) {
    if (only?.length && !only.includes(spec.id)) continue;
    try {
      res[spec.id] = await buildGroundSheet(data, spec, out, tiers);
      log(`  ${spec.id.padEnd(28)} sol ${spec.dt1} ${spec.pick.map((p) => `(${p.join(',')})`).join(' ')}`);
    } catch (e) {
      log(`  ${spec.id.padEnd(28)} ÉCHEC → sol actuel conservé : ${(e as Error).message}`);
    }
  }
  return res;
}
