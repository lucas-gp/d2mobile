/** Charmes : « skillers » plus fréquents sur les charmes majeurs, petits charmes intéressants mis en valeur */
import { describe, expect, it } from 'vitest';
import { generateItem, isSkillerAffix } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { AFFIX_BY_ID } from '../../src/data/items/affixes';
import { smallCharmScore, valueTier } from '../../src/sim/loot/value';
import { withoutPd2 } from '../needs-pd2';

describe('charmes', () => {
  // confort du jeu (GRAND_CHARM_SKILLER_CHANCE) sur les affixes « skillers » de la table PD2 (types du wiki) ; D2 : tirage naturel
  it.skipIf(withoutPd2)('charmes majeurs : 25 à 40 % portent un +compétences d’arbre (de la classe en jeu)', () => {
    const rng = new Rng('skillers');
    const N = 6000;
    let n = 0;
    for (let i = 0; i < N; i++) {
      const it = generateItem(rng, 'grand_charm', 85, {} as never);
      if (it.affixes?.some((a) => isSkillerAffix(AFFIX_BY_ID[a.id]))) n++;
    }
    expect(n / N).toBeGreaterThan(0.25);
    expect(n / N).toBeLessThan(0.4);
  });
  it('petits charmes : 1 à 8 % au moins utiles (palier 3+), jamais tous', () => {
    const rng = new Rng('small');
    const N = 8000;
    let t3 = 0;
    let t4 = 0;
    for (let i = 0; i < N; i++) {
      const it = generateItem(rng, 'small_charm', 85, {} as never);
      const v = valueTier(it);
      if (v === 3) t3++;
      if (v === 4) t4++;
    }
    expect((t3 + t4) / N).toBeGreaterThan(0.01);
    expect((t3 + t4) / N).toBeLessThan(0.08);
    expect(t4).toBeLessThan(t3 + 1);
  });
  it('un petit charme de Vita + résistance 10-11 est exceptionnel, un petit charme banal ne l’est pas', () => {
    const mk = (affixes: { id: string; values: number[] }[]) => ({ ...generateItem(new Rng('x'), 'small_charm', 85, {} as never), affixes });
    expect(
      valueTier(
        mk([
          { id: 'vita_s349', values: [20] },
          { id: 'sapphire_p349', values: [11] },
        ]),
      ),
    ).toBe(4);
    expect(valueTier(mk([{ id: 'life_s347', values: [6] }]))).toBe(0);
    expect(smallCharmScore(mk([{ id: 'vita_s349', values: [18] }]))).toBeGreaterThanOrEqual(3);
  });
});
