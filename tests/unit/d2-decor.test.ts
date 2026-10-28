/** Décor posé des cartes D2 : table des jetons cohérente (planches uniques, une par jeton et par acte) */
import { describe, expect, it } from 'vitest';
import { DECOR_SHEETS, decorId } from '../../tools/d2import/decor';

describe('décor posé des cartes D2', () => {
  it('une planche par couple (jeton, acte), nommée dec_<jeton>_a<acte>', () => {
    const ids = DECOR_SHEETS.map((d) => decorId(d.token, d.act));
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of DECOR_SHEETS) {
      expect(d.act).toBeGreaterThanOrEqual(1);
      expect(d.act).toBeLessThanOrEqual(5);
      expect(decorId(d.token, d.act)).toMatch(/^dec_[0-9a-z]{2}_a[1-5]$/);
    }
  });

  it('les objets interactifs (coffres, sceaux, points de passage, portes) ne sont jamais posés comme décor', () => {
    const forbidden = new Set(['l2', 'cy', 'xc', 'xb', 'xd', 'xe', 'xj', 'yy', '30', '31', '32', '33', '34', 'tl', 'tr', 'ts', 'tu', '4u', '4b', '4a', '4x', 'sh', 'hw']);
    for (const d of DECOR_SHEETS) expect(forbidden.has(d.token), d.token).toBe(false);
  });
});
