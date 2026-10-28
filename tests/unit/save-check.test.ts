/** Import de sauvegarde : les sauvegardes valides passent, les sauvegardes forgées sont refusées avec un message */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { serialize } from '../../src/sim/save';
import { parseImportedSave, checkSave, MAX_IMPORT_BYTES } from '../../src/sim/save-check';
import { CLASS_IDS } from '../../src/data/classes';
import { BASES } from '../../src/data/items';
import { addXp, xpToReach } from '../../src/sim/progression';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { migrate } from '../../src/sim/save';
import type { SaveData } from '../../src/sim/save';

function fresh(classId: (typeof CLASS_IDS)[number], filled = false): SaveData {
  const g = new Game(undefined, classId);
  if (filled) {
    addXp(g.character, xpToReach(40));
    const rng = new Rng(5);
    let i = 0;
    for (const b of BASES) {
      if (i >= g.character.inventory.length) break;
      try {
        g.character.inventory[i++] = generateItem(rng, b.id, 60, { forceQuality: (['magic', 'rare', 'unique', 'set', 'normal'] as const)[i % 5] });
      } catch {
        /* base sans variante de cette qualité */
      }
    }
  }
  return g.toSave();
}
interface Forge {
  character: { gold: unknown; level: unknown; classId: unknown; inventory: unknown[] };
}
const forged = (mut: (s: Forge) => void): string => {
  const s = JSON.parse(serialize(fresh('paladin'))) as Forge;
  mut(s);
  return JSON.stringify(s);
};

describe('import de sauvegarde', () => {
  it('les sauvegardes valides de toutes les classes passent, vides ou remplies d’objets générés', () => {
    for (const c of CLASS_IDS) {
      for (const filled of [false, true]) {
        const text = serialize(fresh(c, filled));
        expect(checkSave(migrate(JSON.parse(text))), `${c}/${filled}`).toBeNull();
        expect(parseImportedSave(text).character.classId).toBe(c);
      }
    }
  });

  it('refus propre (message) des sauvegardes forgées', () => {
    const cases: [string, string][] = [
      ['pas du JSON', '{oups'],
      ['tableau', '[1,2]'],
      ['sans personnage', '{"version":1}'],
      ['nombre infini', serialize(fresh('paladin')).replace(/"gold":\d+/, '"gold":1e999')],
      ['niveau absurde', forged((s) => (s.character.level = 5000))],
      ['classe inconnue', forged((s) => (s.character.classId = 'dragon'))],
      ['or négatif', forged((s) => (s.character.gold = -5))],
      ['base d’objet inconnue', forged((s) => (s.character.inventory[0] = { uid: 'x', base: 'zzz', quality: 'normal', ilvl: 1, sockets: 0, socketed: [] }))],
      ['inventaire géant', forged((s) => (s.character.inventory = new Array(5000).fill(null)))],
      ['objet avec NaN→null', forged((s) => (s.character.inventory[0] = { uid: 'x', base: 'short_sword', quality: 'normal', ilvl: null, sockets: 0, socketed: [] }))],
    ];
    for (const [name, text] of cases) expect(() => parseImportedSave(text), name).toThrow();
    const err = (t: string) => {
      try {
        parseImportedSave(t);
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    };
    expect(err('{oups')).toMatch(/JSON/);
    expect(err(forged((s) => (s.character.classId = 'dragon')))).toMatch(/classe/);
    expect(() => parseImportedSave('x'.repeat(MAX_IMPORT_BYTES + 1))).toThrow(/volumineux/);
  });

  it('clé __proto__ imbriquée (JSON.parse la crée comme clé propre) : refusée', () => {
    const text = serialize(fresh('paladin')).replace('"skills":{', '"skills":{"__proto__":1,');
    expect(() => parseImportedSave(text)).toThrow(/interdite/);
  });
});
