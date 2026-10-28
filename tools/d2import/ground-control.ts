/**
 * Planches de contrôle des sols et des murs (commande `floors` du CLI, Node uniquement) : une image PNG par DT1 et la légende
 * des indices, pour choisir les tuiles de ground-map.ts / prop-map.ts.
 */
import { join } from 'node:path';
import type { GameData } from './data';
import { encodePng } from './png';
import { writeFileEnsured } from './manifest';
import { renderDs1 } from './ds1-render';
import { loadFloors, loadTiles, TILE_H, TILE_W, type FloorTile } from './ground';

/** Planche de contrôle des sols d'un DT1 : une ligne par indice principal, demi-taille ; renvoie la légende */
export function floorContactSheet(data: GameData, dt1: string, act: number, file: string): string[] {
  const floors = loadFloors(data, dt1, act).sort((a, b) => a.main - b.main || a.sub - b.sub);
  const mains = [...new Set(floors.map((f) => f.main))];
  const cw = TILE_W / 2 + 2;
  const ch = TILE_H / 2 + 2;
  const perRow = 20;
  const rows: FloorTile[][] = [];
  const legend: string[] = [];
  for (const m of mains) {
    const list = floors.filter((f) => f.main === m);
    for (let i = 0; i < list.length; i += perRow) {
      legend.push(
        `ligne ${rows.length} : indice ${m}, sous-indices ${list
          .slice(i, i + perRow)
          .map((f) => `${f.sub}${f.opaque < 6000 ? '*' : ''}`)
          .join(' ')}`,
      );
      rows.push(list.slice(i, i + perRow));
    }
  }
  const W = cw * perRow;
  const H = Math.max(1, ch * rows.length);
  const img = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) img.set([40, 0, 60, 255], i * 4);
  rows.forEach((list, r) =>
    list.forEach((f, c) => {
      for (let y = 0; y < TILE_H / 2; y++) {
        for (let x = 0; x < TILE_W / 2; x++) {
          const s = (y * 2 * TILE_W + x * 2) * 4;
          if (!f.rgba[s + 3]) continue;
          img.set(f.rgba.subarray(s, s + 4), ((r * ch + y) * W + c * cw + x) * 4);
        }
      }
    }),
  );
  writeFileEnsured(file, encodePng(W, H, img));
  return legend;
}

/** Planche de contrôle des murs d'un DT1 : chaque tuile sur son losange (contour), demi-taille ; renvoie la légende */
export function wallContactSheet(data: GameData, dt1: string, act: number, orientations: number[], file: string): string[] {
  const tiles = loadTiles(data, dt1, act, orientations).sort((a, b) => a.orientation - b.orientation || a.main - b.main || a.sub - b.sub);
  if (!tiles.length) return ['aucune tuile'];
  const up = Math.max(...tiles.map((t) => -t.oy), 0);
  const down = Math.max(...tiles.map((t) => t.oy + t.h), TILE_H);
  const left = Math.max(...tiles.map((t) => -t.ox), 0);
  const right = Math.max(...tiles.map((t) => t.ox + t.w), TILE_W);
  const cw = left + right + 4;
  const ch = up + down + 4;
  const perRow = Math.max(1, Math.floor(3200 / cw));
  const rows = Math.ceil(tiles.length / perRow);
  const W = cw * perRow;
  const H = ch * rows;
  const img = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) img.set([40, 0, 60, 255], i * 4);
  const legend: string[] = [];
  tiles.forEach((t, k) => {
    const x0 = (k % perRow) * cw + left;
    const y0 = Math.floor(k / perRow) * ch + up;
    // contour du losange de la tuile
    for (let i = 0; i <= 80; i++) {
      for (const [x, y] of [
        [i, 40 - i / 2],
        [80 + i, i / 2],
        [i, 40 + i / 2],
        [80 + i, 80 - i / 2],
      ]) {
        const o = ((y0 + Math.min(79, Math.round(y))) * W + x0 + Math.min(159, Math.round(x))) * 4;
        img.set([255, 220, 0, 255], o);
      }
    }
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        const s = (y * t.w + x) * 4;
        if (!t.rgba[s + 3]) continue;
        img.set(t.rgba.subarray(s, s + 4), ((y0 + t.oy + y) * W + x0 + t.ox + x) * 4);
      }
    }
    if (k % perRow === 0)
      legend.push(
        `ligne ${k / perRow} : ${tiles
          .slice(k, k + perRow)
          .map((q) => `o${q.orientation}/${q.main}.${q.sub}`)
          .join(' ')}`,
      );
  });
  // demi-taille
  const hw = Math.floor(W / 2);
  const hh = Math.floor(H / 2);
  const small = new Uint8Array(hw * hh * 4);
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) small.set(img.subarray((y * 2 * W + x * 2) * 4, (y * 2 * W + x * 2) * 4 + 4), (y * hw + x) * 4);
  writeFileEnsured(file, encodePng(hw, hh, small));
  return legend;
}

/** `cli floors ds1:<chemin sous tiles>[:x0,y0,x1,y1]` : image d'une carte DS1 (contrôle du décodage) */
function runDs1(data: GameData, outDir: string, log: (s: string) => void, spec: string): void {
  const [, path, box] = spec.split(':');
  const b = box?.split(',').map(Number);
  const r = renderDs1(data, path, b && b.length === 4 ? { x0: b[0], y0: b[1], x1: b[2], y1: b[3] } : undefined);
  const file = join(outDir, 'control', `ds1-${path.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`);
  // réduction par deux pour garder un fichier lisible
  const w2 = Math.floor(r.w / 2);
  const h2 = Math.floor(r.h / 2);
  const small = new Uint8Array(w2 * h2 * 4);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) small.set(r.rgba.subarray((y * 2 * r.w + x * 2) * 4, (y * 2 * r.w + x * 2) * 4 + 4), (y * w2 + x) * 4);
  writeFileEnsured(file, encodePng(w2, h2, small));
  log(`  ${path} : ${r.ds1.width}×${r.ds1.height} cases, ${r.drawn} tuiles posées, ${r.missing} introuvables, ${r.ds1.objects.length} objets → ${file}`);
}

export function runFloors(data: GameData, outDir: string, log: (s: string) => void, args: string[]): void {
  // arguments : « <acte>:<chemin du DT1> » pour les sols, « <acte>:<chemin>:<orientations séparées par des virgules> » pour les murs
  for (const a of args) {
    if (a.startsWith('ds1:')) {
      runDs1(data, outDir, log, a);
      continue;
    }
    const [act, dt1, ori] = a.split(':');
    const name = dt1
      .replace(/\.dt1$/i, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase();
    const file = join(outDir, 'control', `${ori ? `murs-${name}-o${ori.replace(/,/g, '-')}` : `sols-${name}`}.png`);
    const legend = ori ? wallContactSheet(data, dt1, Number(act), ori.split(',').map(Number), file) : floorContactSheet(data, dt1, Number(act), file);
    log(`  ${dt1} → ${file}`);
    for (const l of legend) log(`    ${l}`);
  }
}
