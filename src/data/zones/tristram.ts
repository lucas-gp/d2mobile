/**
 * Tristram : petit village ouvert, combat en terrain dégagé. Construit à la main : la place
 * du puits au centre, les maisons en ruine et en feu autour, le cimetière de l'église au
 * nord-ouest, la forge de Griswold à l'ouest. La graine ne fait varier que les petits détails.
 */
import { Rng } from '../../core/rng';
import type { ZoneDef } from '../zone-types';
import { ZoneBuilder } from './builder';
import { d2Map, nearestOpen } from '../d2map';
import { withD2Farm } from './d2farm';
import type { SpawnDef } from '../zone-types';

/**
 * Objets et monstres de Tristram, en coordonnées du décor d'origine (72 × 72). `map` les place : identité pour le décor du jeu, mise à l'échelle
 * puis case libre la plus proche pour la carte de Diablo II.
 */
function spawnStuff(b: ZoneBuilder, map: (x: number, y: number) => { x: number; y: number }): void {
  const obj = (o: { kind: 'waypoint' | 'chest' | 'barrel' | 'shrine'; x: number; y: number }) => b.object({ ...o, ...map(o.x, o.y) });
  const pack = (monster: string, x: number, y: number, count: number, r: number, extra: Partial<SpawnDef> = {}) => b.pack(monster, map(x, y).x, map(x, y).y, count, r, extra);
  // objets
  obj({ kind: 'waypoint', x: 61, y: 64 });
  obj({ kind: 'chest', x: 17, y: 11 });
  obj({ kind: 'chest', x: 64, y: 12 });
  obj({ kind: 'chest', x: 18, y: 48 });
  obj({ kind: 'barrel', x: 50, y: 47 });
  obj({ kind: 'barrel', x: 30, y: 60 });
  obj({ kind: 'barrel', x: 44, y: 27 });
  obj({ kind: 'shrine', x: 40, y: 12 });

  // monstres : packs répartis, élites, Griswold à la forge
  // premier contact à l'écart de l'arrivée (58, 62) : petit groupe, chaman derrière
  pack('fallen', 48, 52, 4, 2.5);
  pack('fallen_shaman', 46, 50, 1, 1);
  pack('fallen', 44, 44, 4, 3);
  pack('fallen_shaman', 45, 46, 1, 1);
  pack('zombie', 40, 22, 4, 3);
  pack('zombie', 30, 18, 4, 3);
  pack('zombie', 12, 24, 5, 3);
  pack('zombie', 18, 30, 4, 3, { rank: 'champion' });
  pack('skeleton', 14, 16, 5, 3);
  pack('skeleton_archer', 20, 12, 3, 2);
  pack('skeleton', 28, 10, 4, 3, { rank: 'unique' });
  pack('fallen', 32, 44, 4, 3);
  pack('fallen_shaman', 36, 45, 1, 1, { rank: 'unique' });
  pack('skeleton', 58, 38, 4, 3);
  pack('skeleton_archer', 62, 32, 3, 2);
  pack('zombie', 56, 26, 4, 3);
  pack('fallen', 60, 14, 4, 3);
  pack('fallen', 50, 16, 4, 2, { rank: 'champion' });
  pack('zombie', 26, 64, 4, 3);
  pack('skeleton', 12, 56, 4, 3);
  pack('skeleton_archer', 30, 34, 2, 1);
  pack('fallen', 40, 62, 4, 3);
  pack('zombie', 64, 50, 3, 2);
  b.spawn({ monster: 'griswold', ...map(17, 49), count: 1, r: 0, rank: 'boss', trigger: 14 });
  pack('zombie', 14, 46, 4, 3);
}

/**
 * Tristram de Diablo II (Tri_Town4.ds1) : le sol et la collision de la carte, avec les monstres et Griswold répartis par withD2Farm (entrée du DS1 pour le
 * départ, Griswold à sa place d'origine, groupes étagés sur le chemin) ; le point de passage est à l'arrivée.
 */
function buildD2Tristram(seed: number, difficulty: number): ZoneDef | null {
  const m = d2Map('tristram');
  if (!m) return null;
  const base = new ZoneBuilder('tristram', 'Tristram', 72, 72, 'deadgrass', { theme: 'village', mood: 'tristram', ambient: { color: 0x54484f, level: 0.5 } });
  base.start(58, 62);
  spawnStuff(base, (x, y) => ({ x, y }));
  const z = withD2Farm(base.build(), seed, difficulty);
  if (!z.d2Map) return null;
  const wp = nearestOpen(m, z.start.x + 2.5, z.start.y + 1.5);
  z.objects.push({ kind: 'waypoint', x: wp.x, y: wp.y });
  return z;
}

export function buildTristram(seed: number, difficulty = 0): ZoneDef {
  const d2 = buildD2Tristram(seed, difficulty);
  if (d2) return d2;
  const rng = new Rng(`tristram:${seed}`);
  const b = new ZoneBuilder('tristram', 'Tristram', 72, 72, 'deadgrass', {
    theme: 'village',
    mood: 'tristram',
    ambient: { color: 0x4a3a3a, level: 0.3 },
  });
  b.start(58, 62);
  // sol : chemins de terre, place pavée, boue
  b.path('dirt', 3, [60, 66], [52, 52], [40, 40], [36, 36]);
  b.path('dirt', 2.5, [36, 36], [22, 44], [12, 50]);
  b.path('dirt', 2.5, [36, 36], [26, 24], [16, 16]);
  b.path('dirt', 2.5, [36, 36], [50, 40], [60, 34]);
  b.path('dirt', 2, [36, 36], [46, 22], [56, 14]);
  b.circle('cobble', 36, 36, 6.5);
  b.circle('mud', 20, 58, 5);
  b.circle('mud', 58, 26, 4);
  b.rect('dirt', 8, 8, 24, 26);

  b.border(rng, ['trees_small', 'tree_pine', 'tree_dead_l', 'rock_b'], 3, 3);

  // place centrale
  b.prop('well', 36, 36);
  b.prop('ruin', 41, 31);
  b.prop('bonfire', 32, 40);
  b.prop('cart_a', 30, 33);
  b.prop('market_b', 42, 40);
  // maisons
  b.prop('house1_a', 25, 27);
  b.prop('bonfire', 28, 30);
  b.prop('house2_b', 47, 23);
  b.prop('inn_a', 52, 42);
  b.prop('bonfire', 48, 46);
  b.prop('smithy_a', 20, 44);
  b.prop('cauldron', 24, 47);
  b.prop('stable_b', 38, 53);
  b.prop('hay', 42, 55);
  b.prop('hay', 34, 56);
  b.prop('house3_a', 27, 57);
  b.prop('house4_b', 57, 15);
  b.prop('bonfire', 60, 19);
  b.prop('house1_b', 62, 44);
  // église en ruine et cimetière
  b.prop('church_ruin_a', 13, 13);
  for (let i = 0; i < 12; i++) {
    const gx = 9 + (i % 4) * 3.2 + rng.float(-0.3, 0.3);
    const gy = 21 + Math.floor(i / 4) * 2.8 + rng.float(-0.2, 0.2);
    b.prop(rng.pick(['grave_a', 'grave_b', 'gravestone']), gx, gy);
  }
  b.prop('lantern', 22, 19);
  b.prop('post_skull', 23, 25);
  b.prop('fence_a', 15, 29.5);
  b.prop('fence_a', 9, 29.5);
  b.prop('fence_b', 24.5, 23);
  // clôtures et détails
  b.prop('fence_a', 44, 50);
  b.prop('fence_a', 47, 50);
  b.prop('fence_b', 32, 50);
  b.prop('cart_b', 55, 30);
  b.prop('bell_tower', 64, 58);
  b.prop('lantern', 55, 58);
  b.scatter(rng, ['tree_dead_m', 'tree_dead_s', 'rock_a', 'rock_c', 'bones', 'skull', 'tree_dead_l'], 34, 5, 5, 67, 67, [
    [36, 36, 8],
    [58, 62, 4],
    [20, 44, 5],
    [13, 13, 6],
    [52, 42, 6],
  ]);

  spawnStuff(b, (x, y) => ({ x, y }));

  return b.build();
}
