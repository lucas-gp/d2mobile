/**
 * Contrôle des villes : cases bloquées isolées (petits amas de sous-tuiles bloquées au milieu du sol praticable, souvent un « mur invisible »)
 * dans la grille de collision des cartes D2 des cinq villes. Sort la liste des amas et un PNG par ville (collision en rouge sur fond sombre).
 * Usage : npx tsx tools/audit/town-blockers.ts [dossierMaps=$D2_PRIVATE_DIR/out/game/maps] [dossierPng=tools/audit/out]
 */
import '../mods/auto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseD2Map } from '../../src/data/d2map';
import { encodePng } from '../d2import/png';

export const TOWNS = ['a1_town', 'a2_town', 'a3_town', 'a4_fortress', 'harrogath'];

export interface Cluster {
  cells: [number, number][];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Amas 8-connexes de sous-tuiles bloquées d'au plus `max` cases */
export function smallClusters(g: { cols: number; rows: number; blocked: Uint8Array }, max = 6): Cluster[] {
  const seen = new Uint8Array(g.cols * g.rows);
  const out: Cluster[] = [];
  for (let s = 0; s < seen.length; s++) {
    if (!g.blocked[s] || seen[s]) continue;
    const cells: [number, number][] = [];
    const st = [s];
    seen[s] = 1;
    while (st.length) {
      const i = st.pop()!;
      const cx = i % g.cols;
      const cy = (i - cx) / g.cols;
      cells.push([cx, cy]);
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox;
          const ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
          const j = ny * g.cols + nx;
          if (g.blocked[j] && !seen[j]) {
            seen[j] = 1;
            st.push(j);
          }
        }
    }
    if (cells.length <= max)
      out.push({ cells, x0: Math.min(...cells.map((c) => c[0])), y0: Math.min(...cells.map((c) => c[1])), x1: Math.max(...cells.map((c) => c[0])), y1: Math.max(...cells.map((c) => c[1])) });
  }
  return out;
}

if (process.argv[1]?.endsWith('town-blockers.ts')) {
  const dir = process.argv[2] ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'out/game/maps');
  const outDir = process.argv[3] ?? join(import.meta.dirname, 'out');
  mkdirSync(outDir, { recursive: true });
  for (const id of TOWNS) {
    const m = parseD2Map(JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')));
    const { cols, rows, blocked } = m.grid;
    const cl = smallClusters(m.grid);
    console.log(`${id} ${cols}x${rows} : ${cl.length} amas de <= 6 sous-tuiles`);
    for (const c of cl) console.log(`  [${c.cells.length}] sous-tuiles (${c.x0},${c.y0})-(${c.x1},${c.y1}) = monde (${c.x0 / 2},${c.y0 / 2})`);
    // PNG : 4 px par sous-tuile
    const S = 4;
    const W = cols * S;
    const rgba = new Uint8Array(W * rows * S * 4);
    const small = new Set(cl.flatMap((c) => c.cells.map(([x, y]) => y * cols + x)));
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const col = small.has(i) ? [255, 255, 0] : blocked[i] ? [200, 40, 40] : [30, 30, 40];
        for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) rgba.set([...col, 255], ((y * S + dy) * W + x * S + dx) * 4);
      }
    writeFileSync(join(outDir, `town-${id}.png`), encodePng(W, rows * S, rgba));
  }
}
