import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { APP_SETTINGS_DEFAULTS, withDefaultSettings } from '../../src/sim/save';

describe('Réinitialisation gratuite des points', () => {
  it('activée par défaut dans l’application, absente (désactivée) par défaut du module', () => {
    expect(withDefaultSettings(undefined).freeRespec).toBeUndefined();
    expect(APP_SETTINGS_DEFAULTS.freeRespec).toBe(true);
    expect(withDefaultSettings(undefined, true).freeRespec).toBe(true);
    expect(withDefaultSettings({ freeRespec: false }, true).freeRespec).toBe(false);
  });
  it('sans le réglage : limitée au nombre de réinitialisations gagnées', () => {
    const g = new Game(undefined, 'sorceress');
    g.character.respecs = 1;
    expect(g.respec()).toBe(true);
    expect(g.respec()).toBe(false);
    expect(g.character.respecs).toBe(0);
  });
  it('avec le réglage : illimitée, gratuite, et rend tous les points', () => {
    const g = new Game(undefined, 'sorceress');
    g.settings.freeRespec = true;
    g.character.respecs = 0;
    g.character.gold = 0;
    g.character.level = 20;
    g.character.statPoints = 0;
    g.character.base.str += 30;
    g.character.skills = { fire_bolt: 5 };
    g.character.skillPoints = 0;
    for (let i = 0; i < 3; i++) expect(g.respec()).toBe(true);
    expect(g.character.respecs).toBe(0);
    expect(g.character.gold).toBe(0);
    expect(g.character.statPoints).toBe((20 - 1) * 5 + g.character.progression.bonusStatPoints);
    expect(g.character.skillPoints).toBe(20 + g.character.progression.bonusSkillPoints);
    expect(Object.keys(g.character.skills)).toHaveLength(0);
  });
});

describe('Réinitialisation partielle', () => {
  const setup = () => {
    const g = new Game(undefined, 'sorceress');
    g.settings.freeRespec = true;
    g.character.level = 20;
    g.character.statPoints = 0;
    g.character.base.str += 30;
    g.character.skills = { fire_bolt: 5 };
    g.character.skillPoints = 0;
    return g;
  };
  it('stats seulement : rend les points de stats, garde les compétences', () => {
    const g = setup();
    expect(g.respec('stats')).toBe(true);
    expect(g.character.statPoints).toBe((20 - 1) * 5 + g.character.progression.bonusStatPoints);
    expect(g.character.skills.fire_bolt).toBe(5);
    expect(g.character.skillPoints).toBe(0);
  });
  it('compétences seulement : rend les points de compétence, garde les stats', () => {
    const g = setup();
    const str = g.character.base.str;
    expect(g.respec('skills')).toBe(true);
    expect(g.character.skillPoints).toBe(20 + g.character.progression.bonusSkillPoints);
    expect(Object.keys(g.character.skills)).toHaveLength(0);
    expect(g.character.base.str).toBe(str);
    expect(g.character.statPoints).toBe(0);
  });
  it('sans le réglage, une réinitialisation partielle consomme une charge', () => {
    const g = new Game(undefined, 'sorceress');
    g.character.respecs = 1;
    expect(g.respec('stats')).toBe(true);
    expect(g.respec('skills')).toBe(false);
  });
});
