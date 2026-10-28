import { describe, expect, it } from 'vitest';
import { withDefaultSettings } from '../../src/sim/save';

describe('ancien réglage d’apparence (supprimé)', () => {
  it('une sauvegarde qui l’avait retombe sur l’apparence normale : la clé est oubliée', () => {
    const s = withDefaultSettings({ playerSkin: 'ancien' } as never) as unknown as Record<string, unknown>;
    expect('playerSkin' in s).toBe(false);
    expect('playerSkin' in (withDefaultSettings(undefined, true) as unknown as Record<string, unknown>)).toBe(false);
  });
});
