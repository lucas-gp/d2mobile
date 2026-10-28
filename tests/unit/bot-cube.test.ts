/** Bot en ville : Cube et sertissage de l'équipement (BACKLOG n° 16). */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { BotBrain } from '../../src/sim/bot/brain';
import { Game } from '../../src/sim/game';
import { generateItem } from '../../src/sim/loot/itemgen';
import { validateItem } from '../../src/sim/loot/validate';
import { withoutPd2 } from '../needs-pd2';

describe('Bot : Cube et gemmes', () => {
  it.skipIf(withoutPd2)('monte une boîte à énigme, ajoute des châsses à son unique porté et y sertit des gemmes', () => {
    const g = new Game();
    const c = g.character;
    c.level = 80;
    c.base.str = 150;
    const shako = generateItem(new Rng('shako'), 'shako', 99, { forceUniqueId: 'u_harlequin_crest' });
    shako.sockets = 0;
    c.equipment.head = shako;
    c.materials.puzzlepiece = 12;
    c.materials.gem_ruby_4 = 3;
    const br = new BotBrain(g, { build: 'cold', seed: 1 });
    br.cubeGear();
    const head = c.equipment.head!;
    expect(head.uniqueId).toBe('u_harlequin_crest');
    expect(head.sockets).toBeGreaterThan(0);
    expect(head.socketed.length).toBe(head.sockets);
    expect(head.socketed.every((s) => s.base === 'gem_ruby_4')).toBe(true);
    expect(c.materials.puzzlepiece).toBe(2);
    expect(validateItem(head)).toEqual([]);
  });

  it('combine les gemmes et garde les runes des mots runiques', () => {
    const g = new Game();
    const c = g.character;
    c.materials = { gem_topaz_0: 9, gem_ruby_3: 3, key: 2, r30: 1 };
    new BotBrain(g, { build: 'fire', seed: 1 }).combineGems();
    expect(c.materials.gem_topaz_2).toBe(1); // 9 ébréchées → 3 fêlées → 1 normale
    // parfaite : PD2, seulement quand les clés abondent (une clé par gemme parfaite) ; D2 : sans clé
    expect(c.materials.gem_ruby_3 ?? 0).toBe(withoutPd2 ? 0 : 3);
    expect(c.materials.r30).toBe(1);
  });

  it('garde des joyaux pour l’artisanat', () => {
    const g = new Game();
    const br = new BotBrain(g, { build: 'cold', seed: 1 });
    expect(br.worthKeeping(generateItem(new Rng('j'), 'jewel', 60, { forceQuality: 'magic' }))).toBe(true);
  });
});
