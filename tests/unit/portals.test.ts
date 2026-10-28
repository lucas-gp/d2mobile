/** Portails : portail ouvert au départ d'une run, déplaçable sans consommable ; la run reste accessible après la mort ou un retour en ville */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';

Game.resumeOnLoad = true; // ces tests vérifient la reprise de run (le jeu, lui, revient toujours en ville)

const portals = (g: Game, ref: string) => g.world.objects.filter((o) => o.kind === 'portal' && o.ref === ref);

describe('portails de ville', () => {
  it("un portail vers Harrogath s'ouvre au départ de la run", () => {
    const g = new Game();
    g.startRun('tristram', 0, 7);
    expect(portals(g, 'town')).toHaveLength(1);
  });

  it("le bouton déplace le portail actuel là où l'on se trouve", () => {
    const g = new Game();
    g.startRun('tristram', 0, 7);
    const p = g.world.player;
    const before = { ...portals(g, 'town')[0] };
    const spot = g.world.grid.nearestFree(p.x + 12, p.y, 8) ?? { x: p.x, y: p.y };
    p.x = p.px = spot.x;
    p.y = p.py = spot.y;
    expect(g.openPortal()).toBe(true);
    const now = portals(g, 'town');
    expect(now).toHaveLength(1);
    expect(Math.hypot(now[0].x - p.x, now[0].y - p.y)).toBeLessThan(3);
    expect(now[0].x !== before.x || now[0].y !== before.y).toBe(true);
  });

  it("en ville, un portail ramène dans la run laissée derrière soi, butin et monstres en l'état", () => {
    const g = new Game();
    g.startRun('tristram', 0, 7);
    const world = g.world;
    const monsters = world.monsters.length;
    g.townPortal();
    expect(g.mode).toBe('town');
    expect(g.hasSuspendedRun).toBe(true);
    expect(portals(g, 'run')).toHaveLength(1);
    expect(g.returnToRun()).toBe(true);
    expect(g.mode).toBe('run');
    expect(g.world).toBe(world);
    expect(g.world.monsters.filter((m) => !m.pet).length).toBe(monsters);
    expect(g.world.player.dead).toBe(false);
    expect(g.hasSuspendedRun).toBe(false);
  });

  it('après une mort, on revient dans la zone soigné', () => {
    const g = new Game();
    g.startRun('tristram', 0, 7);
    const world = g.world;
    world.player.hp = 0;
    world.player.dead = true;
    g.enterTown();
    expect(g.hasSuspendedRun).toBe(true);
    g.returnToRun();
    expect(g.world).toBe(world);
    expect(g.world.player.dead).toBe(false);
    expect(g.world.player.hp).toBe(g.world.player.hpMax);
  });

  it("une run terminée n'est pas gardée ; une nouvelle run remplace la run en attente", () => {
    const g = new Game();
    g.startRun('tristram', 0, 7);
    g.world.run!.completed = true;
    g.townPortal();
    expect(g.hasSuspendedRun).toBe(false);
    g.startRun('tristram', 0, 8);
    g.townPortal();
    expect(g.hasSuspendedRun).toBe(true);
    g.startRun('tristram', 0, 9);
    expect(g.hasSuspendedRun).toBe(false);
  });

  it('la run en attente survit à la sauvegarde', () => {
    const g = new Game();
    g.startRun('tristram', 0, 7);
    g.townPortal();
    const save = JSON.parse(JSON.stringify(g.toSave()));
    expect(save.run?.suspended).toBe(true);
    const g2 = new Game(save);
    expect(g2.mode).toBe('town');
    expect(g2.hasSuspendedRun).toBe(true);
    expect(g2.returnToRun()).toBe(true);
  });
});
