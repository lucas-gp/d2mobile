/** Mort après le boss : le portail de retour reste disponible, sans nouvelle récompense ni nouveau boss */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { Rng } from '../../src/core/rng';
import { withoutPd2 } from '../needs-pd2';

import { RULES, type RuleTypes } from '../../src/mods/rules';

/** Carte (objet du mod qui fournit les cartes, règle `maps.make`) */
const makeMap: RuleTypes['maps.make'] = (...a) => RULES['maps.make'](...a);

const portals = (g: Game, ref: string) => g.world.objects.filter((o) => o.kind === 'portal' && o.ref === ref);
const die = (g: Game) => {
  g.world.killPlayer();
  g.step(250); // délai de mort : retour automatique en ville
};

describe('portail de retour après la mort', () => {
  it('boss tué puis mort : le portail ramène dans la même zone, butin conservé, rien ne se rejoue', () => {
    const g = new Game();
    g.startRun('tristram', 0, 7);
    const world = g.world;
    world.run!.completed = true;
    g.character.progression.completions['tristram:0'] = 1;
    const loot = world.items.length;
    const monsters = world.monsters.length;
    die(g);
    expect(g.mode).toBe('town');
    expect(g.hasSuspendedRun).toBe(true);
    expect(portals(g, 'run')).toHaveLength(1);
    expect(g.returnToRun()).toBe(true);
    expect(g.world).toBe(world);
    expect(g.world.items.length).toBe(loot);
    expect(g.world.monsters.length).toBe(monsters);
    expect(g.world.player.dead).toBe(false);
    g.step(60);
    expect(g.character.progression.completions['tristram:0']).toBe(1);
  });

  it('run non terminée : comportement inchangé', () => {
    const g = new Game();
    g.startRun('tristram', 0, 7);
    die(g);
    expect(g.hasSuspendedRun).toBe(true);
  });

  it('quitter volontairement une run de campagne terminée, ou lancer une autre run : plus de portail', () => {
    const g = new Game();
    g.startRun('tristram', 0, 7);
    g.world.run!.completed = true;
    g.townPortal();
    expect(g.hasSuspendedRun).toBe(false);
    g.startRun('tristram', 0, 8);
    g.world.run!.completed = true;
    die(g);
    expect(g.hasSuspendedRun).toBe(true);
    g.startRun('tristram', 0, 9);
    expect(g.hasSuspendedRun).toBe(false);
  });

  it.skipIf(withoutPd2)('carte : boss mort puis retour volontaire en ville : le portail reste, rien ne se rejoue ; une autre run le retire', () => {
    const g = new Game();
    g.character.level = 90;
    g.character.progression.highestDifficulty = 2;
    const item = makeMap(new Rng('pm'), 2, 'rare', 'torajan_jungle');
    g.character.inventory[0] = item;
    expect(g.startMap({ invIndex: 0 }, 5).ok).toBe(true);
    const world = g.world;
    world.run!.completed = true;
    g.townPortal();
    expect(g.mode).toBe('town');
    expect(g.hasSuspendedRun).toBe(true);
    expect(portals(g, 'run')).toHaveLength(1);
    expect(g.returnToRun()).toBe(true);
    expect(g.world).toBe(world);
    expect(g.world.run!.completed).toBe(true);
    g.townPortal();
    g.startRun('tristram', 0, 9);
    expect(g.hasSuspendedRun).toBe(false);
  });
});
