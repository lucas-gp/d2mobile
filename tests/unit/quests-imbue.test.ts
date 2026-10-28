/** Imprégnation de Charsi (Outils du métier), plateformes et points de passage de campagne. */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { Game } from '../../src/sim/game';
import { generateItem } from '../../src/sim/loot/itemgen';
import { matCount } from '../../src/sim/materials';

describe('Charsi : imprégnation', () => {
  it('indisponible avant le retour du Malus (Outils du métier), puis une fois par difficulté', () => {
    const g = new Game();
    const c = g.character;
    const it = generateItem(new Rng('imbue'), 'short_sword', 10, { forceQuality: 'normal' });
    c.inventory[0] = it;
    expect(g.imbueAvailable()).toBe(false);
    expect(g.imbue(0).ok).toBe(false);
    c.progression.milestones['quest:malus:0'] = 1;
    expect(g.imbueAvailable()).toBe(true);
    const r = g.imbue(0);
    expect(r.ok).toBe(true);
    expect(c.inventory[0]?.quality).toBe('rare');
    expect(g.imbueAvailable()).toBe(false);
  });

  it('refuse un objet déjà rare', () => {
    const g = new Game();
    const c = g.character;
    c.progression.milestones['quest:malus:0'] = 1;
    c.inventory[0] = generateItem(new Rng('imbue2'), 'short_sword', 10, { forceQuality: 'rare' });
    expect(g.imbue(0).ok).toBe(false);
    expect(g.imbueAvailable()).toBe(true);
  });
});

describe('Points de passage de campagne', () => {
  it('la ville est toujours une destination ; les autres zones après avoir touché leur point de passage', () => {
    const g = new Game();
    const zones = g.campaignZones('act1');
    expect(zones[0].visited).toBe(true);
    expect(zones.slice(1).every((z) => !z.visited)).toBe(true);
    expect(zones.every((z) => z.run.waypoint || z === zones[0])).toBe(true);
    g.character.progression.milestones['wp:a1_coldplains'] = 1;
    expect(g.campaignZones('act1').find((z) => z.run.id === 'a1_coldplains')?.visited).toBe(true);
  });
});

describe('Matériaux et quêtes', () => {
  it('une rune de quête va dans l’inventaire (joueur)', () => {
    const g = new Game();
    const c = g.character;
    c.looseRunes = true;
    expect(matCount(c, 'r12')).toBe(0);
  });
});
