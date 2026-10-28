/** Téléportation : jamais hors de la zone jouable (îlot isolé, vide au-delà d'un mur), et le mercenaire suit. */
import { describe, expect, it } from 'vitest';
import { WalkGrid } from '../../src/sim/grid';
import { Game } from '../../src/sim/game';
import { World } from '../../src/sim/world';
import { ZoneBuilder } from '../../src/data/zones/builder';
import { addXp, xpToReach } from '../../src/sim/progression';
import { mercOf } from '../../src/sim/merc';
import { deserialize, serialize } from '../../src/sim/save';

describe('WalkGrid.connected', () => {
  it('un îlot libre derrière un mur plein n’est pas atteignable', () => {
    const g = new WalkGrid(20, 10);
    g.blockRect(10, 0, 11, 10);
    expect(g.connected(2, 5, 8, 5)).toBe(true);
    expect(g.connected(2, 5, 15, 5)).toBe(false);
  });

  it('une ouverture dans le mur rend l’autre côté atteignable', () => {
    const g = new WalkGrid(20, 10);
    g.blockRect(10, 0, 11, 4);
    g.blockRect(10, 6, 11, 10);
    expect(g.connected(2, 5, 15, 5)).toBe(true);
  });
});

describe('Téléportation', () => {
  it('ne quitte pas la zone et emmène le mercenaire', () => {
    const g = new Game(undefined, 'sorceress');
    addXp(g.character, xpToReach(40));
    g.character.gold = 1e7;
    g.enterTown();
    expect(g.hireMerc('desert', 'blessed_aim').ok).toBe(true);
    const b = new ZoneBuilder('arena', 'Arène', 40, 20, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
    b.start(5, 10);
    g.mode = 'run';
    g.world = new World({ zone: b.build(), seed: 3, difficulty: 0, zoneLevel: 30, character: g.character });
    const w = g.world;
    w.player.d.skillLevels.teleport = 5;
    w.grid.blockRect(20, 0, 21, 20); // mur plein : l'autre moitié est hors zone
    const m = mercOf(w);
    if (m) {
      m.x = m.px = 3;
      m.y = m.py = 10;
    }
    w.player.mana = w.player.manaMax;
    w.input.cast = { skill: 'teleport', tx: 30, ty: 10, targetId: 0 };
    for (let t = 0; t < 60; t++) g.step(1);
    expect(w.player.x).toBeGreaterThan(8);
    expect(w.player.x).toBeLessThan(20);
    expect(w.grid.connected(5, 10, w.player.x, w.player.y)).toBe(true);
    if (m) expect(Math.hypot(m.x - w.player.x, m.y - w.player.y)).toBeLessThan(3);
  });

  it('un personnage coincé dans un mur est replacé sur une case libre', () => {
    const g = new Game(undefined, 'sorceress');
    const b = new ZoneBuilder('arena', 'Arène', 40, 20, 'flagstone', { theme: 'crypt', mood: 'tombs', ambient: { color: 0, level: 0.3 } });
    b.start(5, 10);
    g.mode = 'run';
    g.world = new World({ zone: b.build(), seed: 3, difficulty: 0, zoneLevel: 30, character: g.character });
    const w = g.world;
    w.grid.blockRect(18, 0, 24, 20);
    w.player.x = w.player.px = 21;
    w.player.y = w.player.py = 10;
    g.step(14);
    expect(w.grid.circleBlocked(w.player.x, w.player.y, w.player.radius)).toBe(false);
  });

  it('se reconnecter ramène en ville même si la sauvegarde était en pleine run', () => {
    const g = new Game(undefined, 'sorceress');
    g.startRun('tristram', 0);
    const again = new Game(deserialize(serialize(g.toSave())));
    expect(again.mode).toBe('town');
  });
});
