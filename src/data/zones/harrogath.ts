/**
 * Harrogath simplifiée : la ville de base. Coffre, Cube horadrique, point de passage,
 * marchand (Larzuk), soigneuse (Malah), Anya (maps et orbes, endgame). Aucun monstre.
 */
import { Rng } from '../../core/rng';
import type { ZoneDef } from '../zone-types';
import { ZoneBuilder } from './builder';
import { d2Map, nearestOpen } from '../d2map';

/** Harrogath de Diablo II (townWest.ds1) : collision, PNJ et objets aux emplacements de la carte d'origine */
function buildD2Harrogath(): ZoneDef | null {
  const m = d2Map('harrogath');
  if (!m) return null;
  const b = new ZoneBuilder('harrogath', 'Harrogath', m.units[0], m.units[1], 'snow', { theme: 'town', mood: 'harrogath', ambient: { color: 0x59627a, level: 0.62 }, town: true });
  b.z.d2Map = { id: m.id, cols: m.grid.cols, rows: m.grid.rows, blocked: m.grid.blocked, opaque: m.grid.opaque };
  // positions en cases D2 (2,5 unités) relevées sur la carte : point de passage (tuiles waypt), forge de Larzuk, puits, cabane du sud-ouest, escalier de la forteresse
  const at = (cx: number, cy: number) => nearestOpen(m, cx * 2.5, cy * 2.5);
  const put = (kind: 'stash' | 'cube' | 'waypoint' | 'npc', cx: number, cy: number, id?: string) => {
    const p = at(cx, cy);
    b.object({ kind, x: p.x, y: p.y, id });
  };
  const wp = (m.landmarks.waypt ?? []).slice(0, 4);
  const wx = wp.length ? wp.reduce((s, p) => s + p[0], 0) / wp.length + 0.5 : 23;
  const wy = wp.length ? wp.reduce((s, p) => s + p[1], 0) / wp.length + 0.5 : 14;
  // départ au repère « Town Portal » de la carte d'origine (à défaut, près du point de passage)
  const tp = (m.landmarks.townportal ?? [])[0];
  const s = tp ? at(tp[0] + 0.5, tp[1] + 0.5) : at(wx - 2.5, wy + 2.5);
  b.start(s.x, s.y);
  put('waypoint', wx, wy);
  put('stash', 24.8, 11.4);
  put('cube', 27.2, 13.0);
  put('npc', 28.4, 6.6, 'larzuk');
  put('npc', 15.4, 17.6, 'malah');
  // PD2 : Deckard Cain erre en haut des marches, près de Malah
  put('npc', 17.8, 15.2, 'cain5');
  put('npc', 15.2, 25.0, 'anya');
  put('npc', 16.4, 6.6, 'qual_kehk');
  return b.build();
}

export function buildHarrogath(seed = 1): ZoneDef {
  const d2 = buildD2Harrogath();
  if (d2) return d2;
  const rng = new Rng(`harrogath:${seed}`);
  const b = new ZoneBuilder('harrogath', 'Harrogath', 36, 36, 'snow', {
    theme: 'town',
    mood: 'harrogath',
    ambient: { color: 0x3e4656, level: 0.42 },
    town: true,
  });
  b.start(18, 21);
  b.circle('flagstone', 18, 18, 7);
  b.path('flagstone', 3, [18, 18], [18, 32]);
  b.path('cobble', 2.5, [18, 18], [6, 10]);
  b.path('cobble', 2.5, [18, 18], [30, 10]);
  // remparts
  b.block(0, 0, 36, 3);
  b.block(0, 33, 36, 36);
  b.block(0, 0, 3, 36);
  b.block(33, 0, 36, 36);
  for (let t = 3; t < 33; t += 4) {
    b.prop('stonewall_a', t + 2, 2.2);
    if (t < 14 || t > 20) b.prop('stonewall_a', t + 2, 33.8);
    b.prop('stonewall_b', 2.2, t + 2);
    b.prop('stonewall_b', 33.8, t + 2);
  }
  b.prop('tower', 3, 3);
  b.prop('tower', 33, 3);
  b.prop('stonehouse_a', 8, 9);
  b.prop('stonehouse_b', 28, 9);
  b.prop('tent', 8, 26);
  b.prop('tent', 28, 26);
  b.prop('campfire', 18, 18);
  b.prop('torch_post', 14, 14);
  b.prop('torch_post', 22, 14);
  b.prop('torch_post', 14, 22);
  b.prop('torch_post', 22, 22);
  b.prop('torch_post', 16, 31);
  b.prop('torch_post', 20, 31);
  b.prop('weaponrack_prop', 25, 15);
  b.prop('flag', 11, 16);
  b.prop('flag', 25, 20);
  b.scatter(rng, ['rock_c', 'crates', 'barrel'], 6, 5, 5, 31, 31, [[18, 18, 9]]);

  b.object({ kind: 'stash', x: 13, y: 18 });
  b.object({ kind: 'cube', x: 23, y: 18 });
  b.object({ kind: 'waypoint', x: 18, y: 12 });
  b.object({ kind: 'npc', id: 'larzuk', x: 24, y: 12 });
  b.object({ kind: 'npc', id: 'malah', x: 12, y: 12 });
  b.object({ kind: 'npc', id: 'cain5', x: 15, y: 10 });
  b.object({ kind: 'npc', id: 'anya', x: 12, y: 24 });
  b.object({ kind: 'npc', id: 'qual_kehk', x: 25, y: 24 });
  return b.build();
}
