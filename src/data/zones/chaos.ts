/**
 * Sanctuaire du Chaos. Un couloir gardé mène au pentagramme central ; trois ailes (ouest, est,
 * nord) abritent chacune un sceau. Briser un sceau libère son gardien (Grand Vizir du Chaos,
 * Seigneur De Seis, Infecteur d'âmes) et sa garde ; les trois gardiens tués, Diablo surgit au
 * centre du pentagramme. Sa mort termine la run.
 */
import { Rng } from '../../core/rng';
import type { Difficulty } from '../types';
import type { ZoneDef } from '../zone-types';
import { ZoneBuilder } from './builder';
import { withD2Chaos } from './d2farm';

/** Gardiens des sceaux : [aile, gardien, nom, escorte, nombre d'escorte] (composition D2) */
const CHAOS_SEALS: [string, string, string, string, number][] = [
  ['vizier', 'storm_caster', 'Grand Vizir du Chaos', 'storm_caster', 6],
  // De Seis = Doom Knight / Chevalier de l'oubli (D2 : doomknight3) ; jamais immunisé (les gardiens sont obligatoires)
  ['seis', 'oblivion_knight', 'Seigneur De Seis', 'oblivion_knight', 4],
  ['infector', 'venom_lord', 'Infecteur d’âmes', 'venom_lord', 3],
];

/** `map`: the D2 map it is laid out on (lot 320: the Campaign's `a4_chaos`; the Rush's `chaos`) */
export function buildChaos(seed: number, difficulty: Difficulty, map = 'chaos'): ZoneDef {
  return withD2Chaos(buildChaosBase(seed, difficulty), seed, difficulty, map);
}

function buildChaosBase(seed: number, _difficulty: Difficulty): ZoneDef {
  const rng = new Rng(`chaos:${seed}`);
  const W = 88;
  const H = 96;
  const b = new ZoneBuilder('chaos', 'Sanctuaire du Chaos', W, H, 'hellstone', {
    theme: 'keep',
    mood: 'chaos',
    ambient: { color: 0x40202a, level: 0.2 },
  });
  const wall = () => (rng.chance(0.25) ? 'throne_wall_arch' : 'throne_wall');
  const cx = 44;
  const cy = 46;

  // roc plein partout, sauf les salles creusées ci-dessous
  // pentagramme (x 28-60, y 30-62)
  b.block(0, 0, W, 4);
  b.block(0, 92, W, H);
  b.block(0, 0, 4, H);
  b.block(84, 0, W, H);
  // coins pleins entre les ailes
  b.block(4, 4, 36, 30);
  b.block(52, 4, 84, 30);
  b.block(4, 62, 36, 92);
  b.block(52, 62, 84, 92);
  // entre le couloir et les ailes latérales
  b.block(36, 62, 38, 92);
  b.block(50, 62, 52, 92);

  // couloir d'entrée (x 38-50, y 62-92)
  b.rect('flagstone', 38, 62, 50, 92);
  b.wallRun(wall, 38, 64, 38, 92);
  b.wallRun(wall, 50, 64, 50, 92);
  b.start(44, 86);
  for (const y of [70, 80]) {
    b.prop('torch_wall', 38.9, y);
    b.prop('torch_wall', 49.1, y);
  }

  // salle centrale (x 28-60, y 30-62) : pentagramme de lave, cinq braseros
  b.rect('flagstone', 29, 31, 59, 61);
  b.wallRun(wall, 28, 62, 60, 62, [[38, 50]]);
  b.wallRun(wall, 28, 30, 60, 30, [[38, 50]]);
  b.wallRun(wall, 28, 30, 28, 62, [[40, 52]]);
  b.wallRun(wall, 60, 30, 60, 62, [[40, 52]]);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const x = cx + Math.cos(a) * 9;
    const y = cy + Math.sin(a) * 9;
    b.circle('lava', x, y, 0.9);
    b.prop('brazier', x + Math.cos(a) * 2, y + Math.sin(a) * 2);
  }
  // branches de l'étoile : traits de lave entre les pointes (tous les deux sommets)
  for (let i = 0; i < 5; i++) {
    const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const a1 = -Math.PI / 2 + (((i + 2) % 5) * 2 * Math.PI) / 5;
    b.path('lava', 0.5, [cx + Math.cos(a0) * 9, cy + Math.sin(a0) * 9], [cx + Math.cos(a1) * 9, cy + Math.sin(a1) * 9]);
  }
  for (const [x, y] of [
    [32, 34],
    [56, 34],
    [32, 58],
    [56, 58],
  ])
    b.prop('throne_pillar', x, y);
  b.light({ x: cx, y: cy, radius: 14, color: 0xff3020, intensity: 0.8, z: 2 });

  // aile ouest (x 4-28, y 34-58) : Grand Vizir
  b.rect('flagstone', 5, 35, 28, 57);
  b.block(4, 30, 28, 34);
  b.block(4, 58, 28, 62);
  b.wallRun(wall, 4, 34, 28, 34);
  b.wallRun(wall, 4, 58, 28, 58);
  b.wallRun(wall, 4, 34, 4, 58);
  // aile est (x 60-84, y 34-58) : De Seis
  b.rect('flagstone', 60, 35, 83, 57);
  b.block(60, 30, 84, 34);
  b.block(60, 58, 84, 62);
  b.wallRun(wall, 60, 34, 84, 34);
  b.wallRun(wall, 60, 58, 84, 58);
  b.wallRun(wall, 84, 34, 84, 58);
  // aile nord (x 36-52, y 4-30) : Infecteur
  b.rect('flagstone', 37, 5, 51, 30);
  b.wallRun(wall, 36, 4, 52, 4);
  b.wallRun(wall, 36, 4, 36, 30);
  b.wallRun(wall, 52, 4, 52, 30);

  const wings: Record<string, [number, number]> = { vizier: [10, 46], seis: [78, 46], infector: [44, 10] };
  for (const [ref, [x, y]] of Object.entries(wings)) {
    b.object({ kind: 'seal', x, y, id: ref });
    // cristaux derrière le sceau (côté mur), jamais sur le chemin qui vient du pentagramme
    const d = Math.hypot(cx - x, cy - y);
    const [ux, uy] = [(cx - x) / d, (cy - y) / d];
    b.prop('crystal_red', x - ux * 2.5 - uy * 2.5, y - uy * 2.5 + ux * 2.5);
    b.prop('crystal_red', x - ux * 2.5 + uy * 2.5, y - uy * 2.5 - ux * 2.5);
    b.light({ x, y, radius: 6, color: 0xff4030, intensity: 0.7, z: 1.5 });
  }
  b.prop('brazier', 16, 38);
  b.prop('brazier', 16, 54);
  b.prop('brazier', 72, 38);
  b.prop('brazier', 72, 54);
  b.prop('brazier', 40, 20);
  b.prop('brazier', 48, 20);
  b.scatter(rng, ['bones', 'skull', 'rubble'], 10, 6, 36, 26, 56, [[10, 46, 4]]);
  b.scatter(rng, ['bones', 'skull', 'rubble'], 10, 62, 36, 82, 56, [[78, 46, 4]]);
  b.scatter(rng, ['bones', 'skull', 'spikes'], 8, 38, 6, 50, 28, [[44, 10, 4]]);

  // gardes du couloir et des ailes (apparaissent à l'approche)
  b.spawn({ monster: 'oblivion_knight', x: 44, y: 72, count: 2, r: 2, rank: 'normal', trigger: 10 });
  b.spawn({ monster: 'venom_lord', x: 44, y: 64, count: 3, r: 2, rank: rng.chance(0.4) ? 'champion' : 'normal', trigger: 10 });
  b.spawn({ monster: 'oblivion_knight', x: 20, y: 46, count: 3, r: 3, rank: 'normal', trigger: 10 });
  b.spawn({ monster: 'storm_caster', x: 68, y: 46, count: 5, r: 3, rank: rng.chance(0.4) ? 'champion' : 'normal', trigger: 10 });
  b.spawn({ monster: 'venom_lord', x: 44, y: 20, count: 2, r: 3, rank: 'normal', trigger: 10 });
  // gardiens : libérés par leur sceau, près de celui-ci
  for (const [ref, boss, name, escort, n] of CHAOS_SEALS) {
    const [x, y] = wings[ref];
    const gx = ref === 'infector' ? x : ref === 'vizier' ? x + 5 : x - 5;
    const gy = ref === 'infector' ? y + 5 : y;
    b.spawn({ monster: boss, x: gx, y: gy, count: 1, r: 0, rank: 'unique', uniqueName: name, seal: ref, sealGuard: true });
    b.spawn({ monster: escort, x: gx, y: gy, count: n, r: 3, rank: 'normal', seal: ref });
  }
  // Diablo, au centre du pentagramme
  b.spawn({ monster: 'diablo', x: cx, y: cy, count: 1, r: 0, rank: 'boss', seal: 'diablo', runBoss: true });
  b.object({ kind: 'chest', x: 34, y: 36 });
  b.object({ kind: 'chest', x: 54, y: 36 });
  return b.build();
}
