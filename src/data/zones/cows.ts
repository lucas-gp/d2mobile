/**
 * Niveau des Vaches : grande prairie ouverte, troupeaux très denses de Bovins infernaux, le
 * Roi des Vaches au fond du pré. Terrain dégagé (pas de couloirs) : c'est la zone de test de
 * densité et de performance.
 */
import { Rng } from '../../core/rng';
import type { Difficulty } from '../types';
import type { SpawnDef, ZoneDef } from '../zone-types';
import { ZoneBuilder } from './builder';
import { withD2Farm } from './d2farm';

export function buildCows(seed: number, difficulty: Difficulty): ZoneDef {
  const rng = new Rng(`cows:${seed}`);
  const W = 84;
  const H = 84;
  const b = new ZoneBuilder('cows', 'Niveau des Vaches', W, H, 'grass', {
    theme: 'field',
    mood: 'cows',
    ambient: { color: 0x4a4a3a, level: 0.34 },
  });
  // départ dans un coin, le roi dans le coin opposé (la graine inverse les axes)
  const flip = rng.chance(0.5);
  const at = (x: number, y: number): [number, number] => (flip ? [y, x] : [x, y]);
  const [sx, sy] = at(10, 10);
  b.start(sx, sy);
  b.border(rng, ['trees_small', 'tree_pine', 'tree_dead_l', 'rock_b'], 3, 3);

  // sol : herbe, boue et terre battue en taches
  for (let k = 0; k < 14; k++) b.circle(rng.pick(['mud', 'dirt', 'deadgrass']), rng.float(8, W - 8), rng.float(8, H - 8), rng.float(3, 7));
  b.path('dirt', 3, at(10, 10), at(30, 26), at(50, 44), at(72, 72));

  // décor : arbres morts, rochers, foin, charrettes renversées, os
  const reserved: [number, number, number][] = [[sx, sy, 6], [...at(72, 72), 8] as [number, number, number]];
  b.scatter(rng, ['tree_dead_m', 'tree_dead_s', 'rock_a', 'rock_c', 'hay', 'bones', 'skull', 'tree_dead_l', 'cart_a', 'cart_b'], 46, 6, 6, W - 6, H - 6, reserved);

  // troupeaux : denses, répartis sur tout le pré, plus nombreux vers le roi
  const herds: SpawnDef[] = [];
  for (let k = 0; k < 34; k++) {
    let x = 0;
    let y = 0;
    for (let t = 0; t < 30; t++) {
      x = rng.float(10, W - 10);
      y = rng.float(10, H - 10);
      if (Math.hypot(x - sx, y - sy) > 14 && herds.every((h) => Math.hypot(h.x - x, h.y - y) > 7)) break;
    }
    const roll = rng.next();
    const rank: SpawnDef['rank'] = roll < 0.06 ? 'unique' : roll < 0.2 ? 'champion' : 'normal';
    const count = rank === 'unique' ? 6 : rank === 'champion' ? 4 : rng.range(7, 10);
    herds.push({ monster: 'hell_bovine', x, y, count, r: 3, rank, trigger: 12 });
  }
  for (const h of herds) b.spawn(h);

  // le Roi et sa garde
  const [kx, ky] = at(72, 72);
  b.spawn({ monster: 'cow_king', x: kx, y: ky, count: 1, r: 0, rank: 'boss', trigger: 12, runBoss: true });
  b.spawn({ monster: 'hell_bovine', x: kx - 3, y: ky - 2, count: 8, r: 3, rank: 'normal', trigger: 12 });
  b.object({ kind: 'chest', x: kx + 3, y: ky + 4 });
  b.object({ kind: 'shrine', x: rng.float(30, 54), y: rng.float(30, 54) });
  // la ferme de Diablo II remplace la prairie quand sa carte est chargée
  return withD2Farm(b.build(), seed, difficulty);
}
