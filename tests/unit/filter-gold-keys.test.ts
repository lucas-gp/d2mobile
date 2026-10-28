import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { lootFilterDecision, SHOW_HIDDEN, SHOW_NORMAL } from '../../src/sim/loot/filter';
import { makeStack } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';

describe('Filtre : or et clés', () => {
  it('visibles par défaut, masqués sur demande', () => {
    const g = new Game(undefined, 'sorceress');
    const rng = new Rng('gk');
    const gold = makeStack(rng, 'gold', 50);
    const key = makeStack(rng, 'key', 1);
    expect(lootFilterDecision(g.character, gold)).toBe(SHOW_NORMAL);
    expect(lootFilterDecision(g.character, key)).toBe(SHOW_NORMAL);
    g.setFilter({ hideGold: true });
    expect(lootFilterDecision(g.character, gold)).toBe(SHOW_HIDDEN);
    expect(lootFilterDecision(g.character, key)).toBe(SHOW_NORMAL);
    g.setFilter({ hideKeys: true });
    expect(lootFilterDecision(g.character, key)).toBe(SHOW_HIDDEN);
  });
});
