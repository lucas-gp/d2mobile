/** Personnage d'essai : Sorcière 99 équipée, sauvegarde valide, équipement complet et mots runiques formés */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { deserialize, serialize } from '../../src/sim/save';
import { buildTestSorceress, TEST_CHAR_NAME } from '../../src/sim/testchar';
import { computeDerived } from '../../src/sim/character';
import { validateItem } from '../../src/sim/loot/validate';
import { withoutPd2 } from '../needs-pd2';

/** Esprit sur bouclier : une seule ligne de Runes.txt en D2 (épées et boucliers), deux variantes en PD2 */
const SPIRIT_SHIELD = withoutPd2 ? 'rw_spirit' : 'rw_spirit_shield';

describe("Sorcière 99 d'essai", () => {
  it('niveau 99, Enfer débloqué, équipée du build Froid, runewords formés, sauvegarde aller-retour', () => {
    const save = buildTestSorceress();
    const c = save.character;
    expect(c.name).toBe(TEST_CHAR_NAME);
    expect(c.level).toBe(99);
    expect(c.progression.highestDifficulty).toBe(2);
    for (const slot of ['mainhand', 'offhand', 'body', 'head', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2'] as const) expect(c.equipment[slot], slot).toBeTruthy();
    expect(c.equipment.offhand?.runeword).toBe(SPIRIT_SHIELD);
    expect(c.equipment.body?.runeword).toBe('rw_chains_of_honor');
    expect(c.equipment.mainhand?.uniqueId).toBe('u_fathom');
    for (const it of Object.values(c.equipment)) expect(validateItem(it!), it!.base).toEqual([]);
    const d = computeDerived(c, 2);
    expect(d.lifeMax).toBeGreaterThan(900);
    expect(d.fcr).toBeGreaterThanOrEqual(63);
    const text = serialize(save);
    const g = new Game(deserialize(text));
    expect(g.character.equipment.offhand?.runeword).toBe(SPIRIT_SHIELD);
    expect(g.character.name).toBe(TEST_CHAR_NAME);
  });

  it('peut lancer chaque run sans erreur', () => {
    const g = new Game(buildTestSorceress());
    for (const id of ['tristram', 'tombs', 'countess', 'andariel', 'mephisto', 'cows', 'chaos', 'baal', 'pindleskin', 'eldritch', 'nihlathak', 'ancients']) {
      expect(g.startRun(id, 2, 5), id).toBe(true);
      g.step(20);
      expect(g.world.player.dead, id).toBe(false);
      g.enterTown();
    }
  });
});
