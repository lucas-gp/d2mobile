/**
 * Test helper: a fresh module graph where the ruleset `d2+survivals` (or another one) is active, the Survivals manifest provided as the
 * command-line tools do. The suite activates the default ruleset (pd2) before each file: the mode needs its own graph.
 */
import { vi } from 'vitest';
import type { ModManifest } from '../../../../src/mods/api';

export async function activate(ruleset = 'd2+survivals', extra: ModManifest[] | 'all' = []) {
  vi.resetModules();
  const D = await import('../../../../src/mods/discover');
  const manifest = (await import('../../manifest')).default;
  // 'all': every mod of mods/ (the overhauls too, as the command-line tools see them)
  if (extra === 'all') await (await import('../../../../tools/mods/node')).provideNodeMods();
  else D.provideManifests([manifest, ...extra]);
  const A = await import('../../../../src/mods/activate');
  await A.activateRuleset(ruleset);
  const G = await import('../../../../src/sim/game');
  G.Game.resetIds();
  return {
    A,
    G,
    manifest,
    R: await import('../../../../src/mods/rules'),
    U: await import('../../../../src/mods/ui'),
    S: await import('../../../../src/mods/settings'),
    P: await import('../../../../src/sim/progression'),
  };
}
