import { describe, expect, it } from 'vitest';
import { seamGrow } from '../../src/render/ground';

describe('débord des tuiles de sol (coutures)', () => {
  it('une tuile déborde de 2 texels au total (1 par bord)', () => {
    expect(seamGrow(320) * 320).toBeCloseTo(322, 6);
    expect(seamGrow(160) * 160).toBeCloseTo(162, 6);
  });
  it('un très petit sprite n’est pas agrandi', () => {
    expect(seamGrow(4)).toBe(1);
  });
});
