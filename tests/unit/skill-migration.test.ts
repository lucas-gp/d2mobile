import { describe, expect, it } from 'vitest';
import { migrateSkills } from '../../src/sim/game';
import { newCharacter } from '../../src/sim/character';

describe('Compétences inconnues des anciennes sauvegardes', () => {
  it('sont remboursées en points, et la barre de raccourcis est nettoyée', () => {
    const c = newCharacter(undefined, 'sorceress');
    c.skills = { fire_bolt: 4, ancienne_competence: 5 };
    c.skillPoints = 1;
    c.hotbar.primary = 'ancienne_competence';
    c.hotbar.slots = ['attack', 'ancienne_competence', 'fire_bolt', null, null, null, null, null];
    migrateSkills(c);
    expect(c.skills).toEqual({ fire_bolt: 4 });
    expect(c.skillPoints).toBe(1 + 5);
    expect(c.hotbar.primary).toBe('attack');
    expect(c.hotbar.slots.slice(0, 3)).toEqual(['attack', null, 'fire_bolt']);
  });
});
