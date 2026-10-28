/**
 * Lot 299 (owner's request): "Sign in" (the account and the save synchronisation) turned off by one build flag, the code kept: no
 * button, no settings section, and the engine never starts (no request at launch). The local saves are untouched.
 */
import { describe, expect, it, vi } from 'vitest';
import { SIGN_IN_OFFERED, SYNC_ENABLED } from '../../src/platform/build-flags';
import { SaveStore } from '../../src/platform/platform';
import { SyncEngine } from '../../src/platform/sync';
import { SETTINGS_ENTRIES } from '../../src/ui/settings-catalog';

describe('sign in turned off (SIGN_IN_OFFERED)', () => {
  it('the flag is off and the synchronisation unavailable', () => {
    expect(SIGN_IN_OFFERED).toBe(false);
    expect(SYNC_ENABLED).toBe(false);
  });
  it('no Synchronisation section in the settings', () => {
    expect(SETTINGS_ENTRIES.some((e) => e.id === 'sync')).toBe(false);
  });
  it('the engine never starts: no request, no save hook', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const before = SaveStore.onSaved;
    const eng = new SyncEngine();
    await eng.init();
    expect(fetch).not.toHaveBeenCalled();
    expect(SaveStore.onSaved).toBe(before);
    expect(eng.state.status).toBe('out');
    vi.unstubAllGlobals();
  });
});
