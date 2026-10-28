/**
 * Couverture du sol des cartes d'endgame (retour joueur : « des zones noires au bord des murs ») : sans rendu, sur la structure
 * `groundTiles` de chaque carte du catalogue (2 graines). Toute tuile de 4 unités qui touche une case praticable, et toute tuile
 * voisine (8 voisines ; 2 tuiles de profondeur à l'intérieur, sous et derrière les murs) a un sol ; le noir ne reste qu'au-delà de la
 * carte et dans le vide voulu (extérieur : seules les tuiles praticables sont exigées, le vide au bord du sol est voulu). Les tuiles affichées (5 unités pour les sols importés de D2, 4 pour ceux du jeu) ne tombent pas sur
 * la grille de la forme : aucune tuile qui recouvre un sol de forme ne doit être sautée (groundKindAt).
 */
import { describe, expect, it } from 'vitest';
import { MAP_ZONES } from '../../../../src/data/maps';
import { buildMapZone } from '../../data/zones/mapzone';
import { groundKindAt, NO_TILE } from '../../../../src/render/groundcover';
import { CELL } from '../../../../src/sim/grid';
import { buildGrid } from '../../../../src/sim/world';

const SEEDS = [1, 2];

describe('couverture du sol des cartes', () => {
  for (const def of MAP_ZONES)
    for (const seed of SEEDS)
      it(`${def.id} (graine ${seed})`, () => {
        const z = buildMapZone(def, seed, { density: 0, rarity: 0 });
        const gt = z.groundTiles!;
        expect(gt).toBeTruthy();
        const g = buildGrid(z);
        const open = new Uint8Array(gt.cols * gt.rows);
        for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols; cx++) if (!g.isBlockedCell(cx, cy)) open[Math.floor((cy * CELL) / gt.size) * gt.cols + Math.floor((cx * CELL) / gt.size)] = 1;
        const indoor = def.layout === 'labyrinth';
        const ring = indoor ? 2 : 1;
        let openTiles = 0;
        const missing: string[] = [];
        for (let ty = 0; ty < gt.rows; ty++)
          for (let tx = 0; tx < gt.cols; tx++) {
            let near = false;
            for (let dy = -ring; dy <= ring && !near; dy++)
              for (let dx = -ring; dx <= ring; dx++) if (open[(ty + dy) * gt.cols + tx + dx] && ty + dy >= 0 && ty + dy < gt.rows && tx + dx >= 0 && tx + dx < gt.cols) near = true;
            if (open[ty * gt.cols + tx]) openTiles++;
            if (indoor || open[ty * gt.cols + tx]) {
              if (near && gt.data[ty * gt.cols + tx] === NO_TILE) missing.push(`${tx},${ty}`);
            }
          }
        expect(openTiles).toBeGreaterThan(500);
        expect(missing.slice(0, 5), `tuiles sans sol près du praticable : ${missing.length}`).toEqual([]);
        // tuiles affichées de 4 et 5 unités : toute tuile qui recouvre une case de sol de la forme est dessinée
        for (const T of [4, 5]) {
          const bad: string[] = [];
          for (let ty = 0; ty < gt.rows; ty++)
            for (let tx = 0; tx < gt.cols; tx++) {
              if (gt.data[ty * gt.cols + tx] === NO_TILE) continue;
              const i0 = Math.floor((tx * gt.size) / T);
              const i1 = Math.floor(((tx + 1) * gt.size - 1e-6) / T);
              const j0 = Math.floor((ty * gt.size) / T);
              const j1 = Math.floor(((ty + 1) * gt.size - 1e-6) / T);
              for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (groundKindAt(gt, i, j, T) === NO_TILE) bad.push(`${i},${j}`);
            }
          expect(bad.slice(0, 5), `T=${T} : tuiles affichées sautées ${bad.length}`).toEqual([]);
        }
      });
});

describe('groundKindAt', () => {
  it('prend la case sous le centre, sinon la case non vide la plus proche de l’emprise, rien au-delà de la carte', () => {
    const gt = { size: 4, cols: 3, rows: 1, data: new Uint8Array([NO_TILE, 1, NO_TILE]) };
    expect(groundKindAt(gt, 0, 0, 4)).toBe(NO_TILE);
    expect(groundKindAt(gt, 1, 0, 4)).toBe(1);
    // T=5 : la tuile 0 couvre [0,5[ (centre 2,5 sur la case vide, mais déborde sur la case 1)
    expect(groundKindAt(gt, 0, 0, 5)).toBe(1);
    expect(groundKindAt(gt, 2, 0, 5)).toBe(NO_TILE); // [10,15[ : seulement la case 2 (vide) et le hors-carte : rien
  });
});
