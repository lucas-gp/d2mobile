import { describe, expect, it } from 'vitest';
import { buildTestSorceress } from '../../src/sim/testchar';

describe('Personnage d’essai', () => {
  it('le mercenaire de la Sorcière 99 est équipé (arme, armure, casque)', () => {
    const save = buildTestSorceress();
    const eq = save.character.merc?.equipment ?? {};
    expect(eq.mainhand).toBeTruthy();
    expect(eq.body).toBeTruthy();
    expect(save.character.merc?.type).toBe('desert');
    expect(eq.mainhand?.runeword).toBe('rw_infinity');
    expect(eq.head).toBeTruthy();
  });
});

describe('Mercenaire d’essai sur un personnage existant (?testmerc=1)', () => {
  it('remplace seulement le mercenaire : le reste du personnage est conservé', async () => {
    const { Game } = await import('../../src/sim/game');
    const { equipTestMerc } = await import('../../src/sim/testchar');
    const save = buildTestSorceress();
    const g = new Game(save);
    g.character.merc = undefined;
    const before = { lvl: g.character.level, eq: { ...g.character.equipment }, inv: g.character.inventory.filter(Boolean).length, mats: { ...g.character.materials } };
    equipTestMerc(g);
    const c = g.character;
    expect(c.merc?.type).toBe('desert');
    expect(c.merc?.equipment.mainhand?.runeword).toBe('rw_infinity');
    expect(c.level).toBe(before.lvl);
    expect(c.equipment).toEqual(before.eq);
    expect(c.inventory.filter(Boolean).length).toBe(before.inv);
    expect(c.materials).toEqual(before.mats);
    // relancé : l'ancien équipement revient dans le sac, rien n'est perdu
    equipTestMerc(g);
    const merc = () => g.character.merc;
    expect(merc()?.equipment.mainhand?.runeword).toBe('rw_infinity');
  });
});
