/**
 * Trône de la Destruction puis Chambre de la Pierre-Monde.
 * Un couloir gardé mène à la salle du trône ; en y entrant, les cinq vagues des serviteurs de
 * Baal se succèdent (PD2 : délai entre vagues réduit). La dernière vaincue, la herse du fond
 * s'ouvre sur la Chambre de la Pierre-Monde où Baal attend ; sa mort termine la run.
 */
import { Rng } from '../../core/rng';
import type { Difficulty } from '../types';
import type { ZoneDef } from '../zone-types';
import { ZoneBuilder } from './builder';
import { d2Map } from '../d2map';
import { withD2Baal, withD2Farm } from './d2farm';

/** Vagues : [chef unique, nom, escorte, nombre d'escorte] (composition D2, familles du jeu) */
/**
 * Vagues du Trône (D2/PD2, SuperUniques « Baal Subject 1-5 ») : chef, nom, escortes [monstre, nombre].
 * Colenzo = Chaman déformé, Achmel = Démêleur, Bartuc = Membre du Conseil, Ventar = Seigneur venimeux,
 * Lister = Sbire de la destruction.
 */
const BAAL_WAVES: [string, string, [string, number][]][] = [
  [
    'warped_shaman',
    'Colenzo l’Annihilateur',
    [
      ['warped_shaman', 7],
      ['fallen', 4],
    ],
  ],
  [
    'unraveler',
    'Achmel le Maudit',
    [
      ['unraveler', 3],
      ['burning_dead', 6],
    ],
  ],
  ['council_member', 'Bartuc le Sanglant', [['council_member', 4]]],
  ['venom_lord', 'Ventar le Déchaîné', [['venom_lord', 3]]],
  ['minion_destruction', 'Lister le Tourmenteur', [['minion_destruction', 4]]],
];

export function buildBaal(seed: number, difficulty: Difficulty): ZoneDef {
  return withD2Baal(buildBaalBase(seed, difficulty), seed, difficulty);
}

/**
 * Chambre de la Pierre-Monde (wstone01.ds1) : Baal seul, à sa place d'origine ; l'entrée est le point le plus éloigné de lui. Absente sans la carte importée
 * (le Trône contient alors Baal derrière sa herse).
 */
export function buildBaalChamber(seed: number, _difficulty: Difficulty): ZoneDef | null {
  const m = d2Map('baal_chamber');
  if (!m) return null;
  const b = new ZoneBuilder('baal_chamber', 'Chambre de la Pierre-Monde', m.units[0], m.units[1], 'hellstone', {
    theme: 'keep',
    mood: 'baal',
    ambient: { color: 0x3a2a30, level: 0.22 },
  });
  b.start(m.units[0] / 2, m.units[1] / 2);
  b.spawn({ monster: 'baal', x: m.units[0] / 2, y: m.units[1] / 2, count: 1, r: 0, rank: 'boss', trigger: 12, runBoss: true });
  return withD2Farm(b.build(), seed);
}

/**
 * Repaire de Duriel (duriel.ds1) des Tombeaux de Tal Rasha : Duriel seul. Absent sans la carte importée (le tombeau contient alors Duriel au fond).
 */
export function buildDurielLair(seed: number, _difficulty: Difficulty): ZoneDef | null {
  const m = d2Map('duriel_lair');
  if (!m) return null;
  const b = new ZoneBuilder('duriel_lair', 'Repaire de Duriel', m.units[0], m.units[1], 'sandstone', {
    theme: 'tomb',
    mood: 'tombs',
    ambient: { color: 0x3a3028, level: 0.22 },
  });
  b.start(m.units[0] / 2, m.units[1] / 2);
  b.spawn({ monster: 'duriel', x: m.units[0] / 2, y: m.units[1] / 2, count: 1, r: 0, rank: 'boss', trigger: 9, runBoss: true });
  return withD2Farm(b.build(), seed);
}

function buildBaalBase(seed: number, _difficulty: Difficulty): ZoneDef {
  const rng = new Rng(`baal:${seed}`);
  const W = 64;
  const H = 96;
  const b = new ZoneBuilder('baal', 'Trône de la Destruction', W, H, 'hellstone', {
    theme: 'keep',
    mood: 'baal',
    ambient: { color: 0x3a2a30, level: 0.22 },
  });
  const wall = () => (rng.chance(0.25) ? 'throne_wall_arch' : 'throne_wall');

  // tout est roc plein, sauf les trois salles creusées ci-dessous
  b.block(0, 0, W, 4);
  b.block(0, 0, 16, H);
  b.block(48, 0, W, H);
  b.block(0, 92, W, H);
  // couloir d'entrée (x 26-38, y 64-92)
  b.block(16, 64, 26, 92);
  b.block(38, 64, 48, 92);
  b.rect('flagstone', 26, 64, 38, 92);
  b.wallRun(wall, 26, 64, 26, 92);
  b.wallRun(wall, 38, 64, 38, 92);
  b.start(32, 86);
  for (const y of [70, 78, 86]) {
    b.prop('torch_wall', 26.9, y);
    b.prop('torch_wall', 37.1, y);
  }

  // salle du trône (x 16-48, y 32-64), entrée au sud, herse au nord
  b.rect('flagstone', 17, 33, 47, 63);
  b.wallRun(wall, 16, 64, 48, 64, [[26, 38]]);
  b.wallRun(wall, 16, 32, 48, 32, [[30, 34]]);
  b.wallRun(wall, 16, 32, 16, 64);
  b.wallRun(wall, 48, 32, 48, 64);
  for (const [x, y] of [
    [22, 38],
    [42, 38],
    [22, 50],
    [42, 50],
    [22, 58],
    [42, 58],
  ])
    b.prop('throne_pillar', x, y);
  for (const [x, y] of [
    [26, 36],
    [38, 36],
    [19, 44],
    [45, 44],
  ])
    b.prop('brazier', x, y);
  b.prop('banner_red', 24, 32.8);
  b.prop('banner_red', 40, 32.8);
  b.gate('pierre_monde', 30, 31.5, 34, 32.5);

  // Chambre de la Pierre-Monde (x 16-48, y 4-32)
  b.rect('lava', 20, 6, 44, 10);
  b.wallRun(wall, 16, 4, 48, 4);
  b.wallRun(wall, 16, 4, 16, 32);
  b.wallRun(wall, 48, 4, 48, 32);
  for (const [x, y] of [
    [20, 12],
    [44, 12],
    [22, 24],
    [42, 24],
  ])
    b.prop('crystal_big', x, y);
  b.prop('crystal_red', 26, 16);
  b.prop('crystal_red', 38, 16);
  b.light({ x: 32, y: 14, radius: 12, color: 0xff3a3a, intensity: 0.9, z: 3 });

  // gardes avant les vagues
  b.spawn({ monster: 'oblivion_knight', x: 32, y: 72, count: 2, r: 2, rank: 'normal', trigger: 10 });
  b.spawn({ monster: 'soul_killer', x: 32, y: 66, count: 4, r: 2, rank: rng.chance(0.4) ? 'champion' : 'normal', trigger: 10 });
  // vagues : apparaissent devant le trône (nord de la salle)
  BAAL_WAVES.forEach(([boss, name, escorts], i) => {
    b.spawn({ monster: boss, x: 32, y: 40, count: 1, r: 0, rank: 'unique', uniqueName: name, wave: i + 1 });
    for (const [escort, n] of escorts) b.spawn({ monster: escort, x: 32 + rng.float(-3, 3), y: 42, count: n, r: 4, rank: 'normal', wave: i + 1 });
  });
  // Baal, au fond de la chambre
  b.spawn({ monster: 'baal', x: 32, y: 14, count: 1, r: 0, rank: 'boss', trigger: 12, runBoss: true });
  b.object({ kind: 'chest', x: 28, y: 20 });
  b.object({ kind: 'chest', x: 36, y: 20 });
  return b.build();
}
