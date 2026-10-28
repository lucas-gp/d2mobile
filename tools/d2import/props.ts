/**
 * Décor au format du jeu depuis les tuiles de Diablo II : planches `prop_<id>` (une image, ancre au centre de
 * l'empreinte au sol, ombre synthétique) en deux paliers. Voir prop-map.ts.
 */
import type { GameData } from './data';
import { loadTiles, TILE_H, TILE_W, type RawTile } from './ground';
import { half, shadow, trim, type Img } from './actor-build';
import { writePages } from './sheets';
import type { Sink } from './sink';
import { TILE_PROPS, WALLS, type WallSpec } from './prop-map';

/** cellule D2 en unités du jeu, et pas d'une unité à l'écran */
const CELL = 2.5;
const UX = 32;
const UY = 16;
/** le corps du mur est en retrait du bord de la cellule (épaisseur) */
const THICK = 0.35;

function pickTile(tiles: RawTile[], orientation: number, main: number, sub: number, k: number): RawTile | null {
  const list = tiles.filter((t) => t.orientation === orientation && t.main === main && t.sub === sub);
  return list.length ? list[k % list.length] : null;
}

function buildWall(data: GameData, spec: WallSpec): { rgba: Uint8Array; w: number; h: number; ax: number; ay: number } {
  const orientation = spec.axis === 'x' ? 2 : 1;
  const all = loadTiles(data, spec.dt1, spec.act, [orientation]);
  const n = spec.tiles.length;
  const placed: { t: RawTile; x: number; y: number }[] = [];
  spec.tiles.forEach(([main, sub], k) => {
    const t = pickTile(all, orientation, main, sub, k);
    if (!t) throw new Error(`tuile o${orientation}/${main}.${sub} absente de ${spec.dt1}`);
    // cellule k le long de l'axe : origine du losange à l'écran
    const ox = (spec.axis === 'x' ? k : -k) * (TILE_W / 2);
    const oy = k * (TILE_H / 2);
    placed.push({ t, x: ox + t.ox, y: oy + t.oy });
  });
  const x0 = Math.min(...placed.map((p) => p.x));
  const y0 = Math.min(...placed.map((p) => p.y));
  const W = Math.max(...placed.map((p) => p.x + p.t.w)) - x0;
  const H = Math.max(...placed.map((p) => p.y + p.t.h)) - y0;
  const img = new Uint8Array(W * H * 4);
  for (const p of placed) {
    for (let y = 0; y < p.t.h; y++) {
      for (let x = 0; x < p.t.w; x++) {
        const s = (y * p.t.w + x) * 4;
        if (!p.t.rgba[s + 3]) continue;
        img.set(p.t.rgba.subarray(s, s + 4), ((p.y - y0 + y) * W + p.x - x0 + x) * 4);
      }
    }
  }
  // centre de l'empreinte : milieu du mur, en retrait de son épaisseur (sommet haut du losange 0 = (80, 0))
  const along = (n * CELL) / 2;
  const [X, Y] = spec.axis === 'x' ? [along, THICK] : [THICK, along];
  const ax = TILE_W / 2 + (X - Y) * UX - x0;
  const ay = (X + Y) * UY - y0;
  // coupe verticale aux deux bouts (longueur gardée) et, pour les murets, coupe horizontale
  const halfLen = (spec.length / 2) * UX;
  const margin = THICK * UX + 4;
  const left = ax - halfLen - (spec.axis === 'x' ? margin : 0);
  const right = ax + halfLen + (spec.axis === 'y' ? margin : 0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x >= left && x < right) {
        if (!spec.maxHeight) continue;
        // hauteur au-dessus de la ligne de base du mur à cette colonne
        const base = ay + (spec.axis === 'x' ? (x - ax) / 2 : (ax - x) / 2);
        if (y >= base - spec.maxHeight) continue;
      }
      img[(y * W + x) * 4 + 3] = 0;
    }
  }
  return { rgba: img, w: W, h: H, ax, ay };
}

export interface PropEntry {
  hash?: string;
  hi: { bytes: number; gpu: number };
  lo: { bytes: number; gpu: number };
  kind: string;
}

async function writeProp(out: Sink, id: string, im: { rgba: Uint8Array; w: number; h: number; ax: number; ay: number }, only: readonly ('hi' | 'lo')[] = ['hi', 'lo']): Promise<PropEntry> {
  const entry = { kind: 'prop' } as PropEntry;
  for (const [tier, scale] of [
    ['hi', 1],
    ['lo', 0.5],
  ] as const) {
    if (!only.includes(tier)) {
      entry[tier] = { bytes: 0, gpu: 0 };
      continue;
    }
    const src = scale === 1 ? im : half(im.rgba, im.w, im.h, im.ax, im.ay);
    const frames = new Map<string, Img>([['idle/0/0', trim(src.rgba, src.w, src.h, src.ax, src.ay)]]);
    const shadows = new Map<string, Img>([['idle/0/0', shadow(src.rgba, src.w, src.h, src.ax, src.ay)]]);
    const fr = await writePages(out, tier, id, '', frames);
    const sh = await writePages(out, tier, id, 's-', shadows);
    const json = JSON.stringify({
      id,
      kind: 'prop',
      dirs: 1,
      anims: { idle: { frames: 1, fps: 1, loop: false, action: -1, dirs: 1 } },
      scale,
      pages: fr.pages,
      frames: fr.rects,
      shadowPages: sh.pages,
      shadows: sh.rects,
      shadowScale: scale / 2,
    });
    await out.write(`${tier}/${id}.json`, json);
    entry[tier] = { bytes: fr.bytes + sh.bytes + json.length, gpu: fr.gpu + sh.gpu };
  }
  return entry;
}

/** Décor d'une seule tuile (colonne) : posée sur son losange, ancre au centre du losange */
function buildTile(data: GameData, spec: (typeof TILE_PROPS)[number]): { rgba: Uint8Array; w: number; h: number; ax: number; ay: number } {
  const list = loadTiles(data, spec.dt1, spec.act, [spec.orientation]).filter((t) => spec.variants.some(([m, sub]) => t.main === m && t.sub === sub));
  const t = list[Math.min(spec.pick ?? 0, list.length - 1)];
  if (!t) throw new Error(`aucune tuile o${spec.orientation} dans ${spec.dt1}`);
  return { rgba: t.rgba, w: t.w, h: t.h, ax: TILE_W / 2 - t.ox, ay: TILE_H / 2 - t.oy };
}

/** Tout le décor de prop-map.ts (ou seulement `only`) ; un décor en échec garde son sprite actuel */
export async function exportProps(data: GameData, out: Sink, log: (s: string) => void, only?: string[], tiers: readonly ('hi' | 'lo')[] = ['hi', 'lo']): Promise<Record<string, PropEntry>> {
  const res: Record<string, PropEntry> = {};
  for (const spec of WALLS) {
    if (only?.length && !only.includes(spec.id) && !only.includes('props')) continue;
    try {
      res[spec.id] = await writeProp(out, spec.id, buildWall(data, spec), tiers);
      log(`  ${spec.id.padEnd(34)} mur ${spec.dt1} ${spec.tiles.map((p) => `(${p.join(',')})`).join(' ')}`);
    } catch (e) {
      log(`  ${spec.id.padEnd(34)} ÉCHEC → décor actuel conservé : ${(e as Error).message}`);
    }
  }
  for (const spec of TILE_PROPS) {
    if (only?.length && !only.includes(spec.id) && !only.includes('props')) continue;
    try {
      res[spec.id] = await writeProp(out, spec.id, buildTile(data, spec), tiers);
      log(`  ${spec.id.padEnd(34)} tuile ${spec.dt1} o${spec.orientation}`);
    } catch (e) {
      log(`  ${spec.id.padEnd(34)} ÉCHEC → décor actuel conservé : ${(e as Error).message}`);
    }
  }
  return res;
}
