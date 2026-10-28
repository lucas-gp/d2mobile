import { describe, expect, it } from 'vitest';
import { itemName } from '../../src/sim/itemstats';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';

describe('Nom des objets : châsses et éthéré', () => {
  const mk = (q: 'normal' | 'superior' | 'magic') => {
    const it = generateItem(new Rng('nm'), 'flail', 40, { forceQuality: q });
    it.sockets = 0;
    it.socketed = [];
    it.ethereal = false;
    return it;
  };
  it('les châsses sont indiquées pour les objets normaux, supérieurs et magiques', () => {
    for (const q of ['normal', 'superior', 'magic'] as const) {
      const it = mk(q);
      expect(itemName(it)).not.toMatch(/\[\d\]/);
      it.sockets = 2;
      expect(itemName(it)).toMatch(/ \[2\]$/);
    }
  });
  it('préfixe « Éth. » pour un objet éthéré, jamais sinon', () => {
    const it = mk('superior');
    expect(itemName(it)).not.toMatch(/^Éth\./);
    it.ethereal = true;
    expect(itemName(it)).toMatch(/^Éth\. /);
  });
});

describe('Couleur de l’étiquette : éthéré grisé', () => {
  it('normal/supérieur éthéré = grisé comme les objets à châsses ; magique reste bleu', async () => {
    const { labelClass } = await import('../../src/ui/hud');
    expect(labelClass({ base: 'long_sword', quality: 'superior', sockets: 0, ethereal: true })).toBe('q-socket');
    expect(labelClass({ base: 'long_sword', quality: 'normal', sockets: 0, ethereal: true })).toBe('q-socket');
    expect(labelClass({ base: 'long_sword', quality: 'normal', sockets: 0 })).toBe('q-normal');
    expect(labelClass({ base: 'long_sword', quality: 'magic', sockets: 0, ethereal: true })).toBe('q-magic');
  });
});
