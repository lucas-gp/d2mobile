/** Arène minimale pour les tests de simulation : zone plate 40×30, joueur en (10,15), monstres posés à la main. */
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import type { ClassId } from '../../src/data/classes';
import type { Monster } from '../../src/sim/actors';

export interface Spawn {
  monster?: string;
  x: number;
  y: number;
}
export interface ArenaOpts {
  cls?: ClassId;
  level?: number;
  /** Décors : murs (rectangles) construits avant la mise en place */
  walls?: [number, number, number, number][];
  /** Laisse les monstres tels quels (sinon : immobiles, inoffensifs, vie énorme) */
  live?: boolean;
}

export function arena(spawns: Spawn[], o: ArenaOpts = {}): { g: Game; w: World; ms: Monster[] } {
  const g = new Game(undefined, o.cls ?? 'sorceress');
  addXp(g.character, xpToReach(o.level ?? 40));
  g.enterTown();
  const b = new ZoneBuilder('arena', 'Arène', 40, 30, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
  b.start(10, 15);
  for (const wl of o.walls ?? []) b.block(wl[0], wl[1], wl[2], wl[3]);
  for (const s of spawns) b.spawn({ monster: s.monster ?? 'zombie', x: s.x, y: s.y, count: 1, r: 0 });
  g.mode = 'run';
  g.world = new World({ zone: b.build(), seed: 7, difficulty: 0, zoneLevel: 30, character: g.character });
  g.world.populate();
  const ms = g.world.monsters.filter((x) => !x.dead && !x.isSummon);
  if (!o.live) {
    for (const x of ms) {
      x.hp = x.hpMax = 1e9;
      x.dmgMin = x.dmgMax = 0;
      x.defense = 0;
      x.res = { phys: 0, fire: 0, cold: 0, light: 0, poison: 0, magic: 0 };
      x.speed = 0;
    }
  }
  const p = g.world.player;
  p.hp = p.hpMax = 1e9;
  g.world.refreshPlayer();
  return { g, w: g.world, ms };
}

export const run = (g: Game, n: number): void => {
  for (let i = 0; i < n; i++) g.step(1);
};
/** Monstre posé à (x, y) à 0,5 près */
export const at = (ms: Monster[], x: number, y: number): Monster => ms.reduce((a, b) => (Math.hypot(a.x - x, a.y - y) <= Math.hypot(b.x - x, b.y - y) ? a : b));
