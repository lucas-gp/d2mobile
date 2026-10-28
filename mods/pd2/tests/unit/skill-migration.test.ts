import { describe, expect, it } from 'vitest';
import { Game, migrateSkills } from '../../../../src/sim/game';
import { newCharacter } from '../../../../src/sim/character';

describe("Sauvegardes d'avant les arbres PD2 (règle skills.renames du mod)", () => {
  it('reporte les compétences renommées et rembourse celles qui ont disparu', () => {
    const c = newCharacter(undefined, 'druid');
    c.skills = { fissure: 7, lycanthropy: 3, firestorm: 4, summon_resist: 5, poison_explosion: 2 };
    c.skillPoints = 1;
    c.hotbar.primary = 'fissure';
    c.hotbar.slots = ['attack', 'poison_explosion', 'lycanthropy', null, null, null, null, null];
    migrateSkills(c);
    expect(c.skills).toEqual({ eruption: 7, shape_shifting: 3, firestorm: 4 });
    expect(c.skillPoints).toBe(1 + 5 + 2);
    expect(c.hotbar.primary).toBe('eruption');
    expect(c.hotbar.slots.slice(0, 3)).toEqual(['attack', null, 'shape_shifting']);
  });

  it('un jeu chargé depuis une sauvegarde ancienne démarre', () => {
    const g0 = new Game(undefined, 'druid');
    g0.character.skills.fissure = 3;
    const g = new Game(JSON.parse(JSON.stringify(g0.toSave())));
    expect(g.character.skills.fissure).toBeUndefined();
    expect(g.character.skills.eruption).toBe(3);
  });
});
