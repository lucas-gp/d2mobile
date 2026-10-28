// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Décor des cartes D2 sans équivalent dans les DS1 : les tables d'objets des DS1 (obj.txt) ne sont pas dans les MPQ, donc on sème nous-mêmes des
 * objets D2 (tonneaux, caisses, os, crânes, bougies, urnes, râteliers) le long des murs, selon l'acte. Purement visuel (aucun obstacle), déterministe
 * (graine de la zone), et tenu à l'écart du départ, des groupes de monstres, des objets et du boss.
 */
import { runSteps, type Steps } from './steps';
import { Rng } from '../../core/rng';
import type { D2MapData } from '../d2map';
import type { PropPlacement, ZoneDef } from '../zone-types';

const SUB = 0.5;

/** Décors disponibles en planche D2 (tools/d2import/game-map.ts, propObj) par acte : [décor, poids] */
const THEME: Record<number, [string, number][]> = {
  1: [
    ['barrel', 3],
    ['crates', 2],
    ['bones', 3],
    ['skull', 2],
    ['candles', 1],
  ],
  2: [
    ['tomb_urn', 4],
    ['bones', 2],
    ['skull', 1],
    ['candles', 1],
  ],
  3: [
    ['bones', 3],
    ['skull', 2],
    ['candles', 1],
    ['barrel', 1],
  ],
  4: [
    ['bones', 4],
    ['skull', 4],
  ],
  5: [
    ['bones', 3],
    ['skull', 2],
    ['barrel', 2],
    ['crates', 2],
    ['weaponrack_prop', 1],
  ],
};

/** Une case de décor pour ~70 cases libres le long d'un mur, au plus `MAX` par carte */
const MAX = 90;

export function scatterDecor(out: ZoneDef, m: D2MapData, seed: string): void {
  runSteps(scatterDecorSteps(out, m, seed));
}

/** `scatterDecor` in steps of 500 tries (lot 312: built behind the play, src/data/zones/steps.ts) */
export function* scatterDecorSteps(out: ZoneDef, m: D2MapData, seed: string): Steps<void> {
  const theme = THEME[(m.raw as { act?: number }).act ?? 1] ?? THEME[1];
  const total = theme.reduce((s, [, w]) => s + w, 0);
  const { cols, rows, blocked } = m.grid;
  const rng = new Rng(`decor:${seed}`);
  // les endroits à garder dégagés : départ, groupes, objets, boss et sorties
  const keep = [out.start, ...out.spawns, ...out.objects, ...out.exits.map((e) => ({ x: e.x, y: e.y })), ...(out.chamberAt ? [out.chamberAt] : [])];
  const placed: PropPlacement[] = [];
  const tries = Math.min(4000, cols * rows);
  for (let t = 0; t < tries && placed.length < MAX; t++) {
    if (t % 500 === 499) yield;
    const x = 2 + Math.floor(rng.next() * (cols - 4));
    const y = 2 + Math.floor(rng.next() * (rows - 4));
    const i = y * cols + x;
    if (blocked[i]) continue;
    // contre un mur : un obstacle à deux cases dans une seule direction, et l'autre côté libre sur quatre cases (le passage reste large,
    // même pour un tonneau ou une caisse qui bloquent)
    const dirs: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const hit = dirs.filter(([dx, dy]) => blocked[i + 2 * dx + 2 * dy * cols]);
    if (hit.length !== 1) continue;
    const [wx, wy] = hit[0];
    let clear = true;
    for (let k = 1; k <= 4 && clear; k++) if (blocked[i - k * wx - k * wy * cols]) clear = false;
    for (let k = -2; k <= 2 && clear; k++) if (blocked[i + k * wy + k * wx * cols]) clear = false;
    if (!clear) continue;
    const px = (x + 0.5) * SUB;
    const py = (y + 0.5) * SUB;
    if (keep.some((k) => Math.hypot(k.x - px, k.y - py) < (k === out.chamberAt ? 9 : 5))) continue;
    if (placed.some((p) => Math.hypot(p.x - px, p.y - py) < 3.2)) continue;
    let r = rng.next() * total;
    let prop = theme[0][0];
    for (const [id, w] of theme) {
      if ((r -= w) < 0) {
        prop = id;
        break;
      }
    }
    placed.push({ prop, x: px, y: py, variant: 0, scale: 1 });
  }
  out.props.push(...placed);
}

/** Décors de bord par carte de plein air : les limites sont des arbres et des rochers, pas un vide noir */
const EDGE: Record<string, string[]> = {
  cows: ['tree_dead_l', 'trees_small', 'rock_b', 'tree_dead_m'],
  eldritch: ['tree_pine', 'rock_a', 'rock_b'],
  uber_izual: ['rock_a', 'rock_b', 'rock_c'],
  tristram: ['tree_dead_l', 'trees_small', 'rock_b'],
  uber_tristram: ['tree_dead_l', 'trees_small', 'rock_b'],
  ancients: ['rock_a', 'rock_b'],
};

/** Profondeur du décor de bord (sous-cases de 0,5 unité) : 8 unités de forêt ou d'éboulis au-delà de la lisière */
const EDGE_DEPTH = 16;

/** Plante le décor de bord au-delà de la lisière du terrain marchable (cases bloquées sans mur opaque, jusqu'à 8 unités) */
export function edgeDecor(out: ZoneDef, m: D2MapData, seed: string): void {
  const ids = EDGE[m.id];
  if (!ids) return;
  const { cols, rows, blocked, opaque } = m.grid;
  const rng = new Rng(`edge:${seed}`);
  // distance au terrain marchable par propagation depuis ses cases (4 voisins) à travers le vide
  const dist = new Uint8Array(cols * rows).fill(255);
  const queue: number[] = [];
  for (let i = 0; i < cols * rows; i++)
    if (!blocked[i]) {
      dist[i] = 0;
      queue.push(i);
    }
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h];
    if (dist[i] >= EDGE_DEPTH) continue;
    const x = i % cols;
    for (const j of [x < cols - 1 ? i + 1 : -1, x > 0 ? i - 1 : -1, i + cols, i - cols]) {
      if (j < 0 || j >= cols * rows || dist[j] !== 255 || !blocked[j] || opaque[j]) continue;
      dist[j] = dist[i] + 1;
      queue.push(j);
    }
  }
  const placed: PropPlacement[] = [];
  const spacing = 2.3;
  for (let y = 2; y < rows - 2; y += 2) {
    for (let x = 2; x < cols - 2; x += 2) {
      const d = dist[y * cols + x];
      if (d < 3 || d > EDGE_DEPTH || !rng.chance(0.55)) continue;
      const px = (x + 0.5) * 0.5 + rng.float(-0.5, 0.5);
      const py = (y + 0.5) * 0.5 + rng.float(-0.5, 0.5);
      if (placed.some((p) => Math.abs(p.x - px) < spacing && Math.abs(p.y - py) < spacing && Math.hypot(p.x - px, p.y - py) < spacing)) continue;
      placed.push({ prop: rng.pick(ids), x: px, y: py, variant: 0, scale: 0.9 + rng.float(0, 0.35) });
      if (placed.length >= 1400) break;
    }
  }
  // anneau au-delà du carré de la carte : sans lui le bord n'est qu'un vide noir de part et d'autre de la lisière
  const W = out.width;
  const H = out.height;
  const RING = 16;
  const cell = spacing;
  const taken = new Set<string>();
  for (let gy = Math.floor(-RING / cell); gy <= Math.ceil((H + RING) / cell); gy++) {
    for (let gx = Math.floor(-RING / cell); gx <= Math.ceil((W + RING) / cell); gx++) {
      const x = gx * cell + rng.float(-0.7, 0.7);
      const y = gy * cell + rng.float(-0.7, 0.7);
      if (x > -1.8 && x < W + 1.8 && y > -1.8 && y < H + 1.8) continue;
      if (x < -RING || x > W + RING || y < -RING || y > H + RING) continue;
      if (!rng.chance(0.9) || taken.has(`${gx},${gy}`)) continue;
      taken.add(`${gx},${gy}`);
      placed.push({ prop: rng.pick(ids), x, y, variant: 0, scale: 0.9 + rng.float(0, 0.4) });
    }
  }
  out.props.push(...placed);
}
