// @vitest-environment happy-dom
/**
 * Generic hooks of lot 289 (Survivals' roguelite "Run" mode), inert without a game mode:
 * - rules `char.itemActive` (a worn item counted: always in the base) and `char.equipNeedsReqs` (the requirements block wearing: yes in the
 *   base), `canWear`;
 * - `RunDef.abandonOnLeave` (leaving a run for the town abandons it: never in the base, the run waits behind the town's portal);
 * - the game mode's variants offered on the creation screens (`ModManifest.variants`, `variantsOf`, `variantPicker`), the one picked
 *   given to the `create.character` slot.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ModApi, ModManifest } from '../../src/mods/api';
import { RULES } from '../../src/mods/rules';
import { Game } from '../../src/sim/game';
import { Rng } from '../../src/core/rng';
import { generateItem } from '../../src/sim/loot/itemgen';
import { requiredLevel } from '../../src/sim/itemstats';
import { canEquip, canWear } from '../../src/sim/character';
import type { Item } from '../../src/sim/item';
import { variantsOf } from '../../src/ui/charselect-core';
import { NO_MODS, variantPicker } from '../../src/ui/charselect-mods';

/** A rare ring the hero of level 1 cannot wear (its required level above 1) */
function highRing(): Item {
  const rng = new Rng('lot289');
  for (let i = 0; i < 200; i++) {
    const it = generateItem(rng, 'ring', 60, { forceQuality: 'rare' });
    if (requiredLevel(it) > 10) return it;
  }
  throw new Error('no ring');
}

describe('Gear above the level (lot 289): inert in the base', () => {
  it('every worn item counts, the requirements block wearing, the run waits behind the portal', () => {
    const g = new Game(undefined, 'sorceress');
    const ring = highRing();
    expect(RULES['char.itemActive'](g.character, ring)).toBe(true);
    expect(RULES['char.equipNeedsReqs'](g.character)).toBe(true);
    expect(canWear(g.character, ring)).toEqual(canEquip(g.character, ring));
    expect(canEquip(g.character, ring).ok).toBe(false);
    expect(canEquip(g.character, ring, undefined, false).ok).toBe(true);
    g.character.inventory[0] = ring;
    expect(g.equip(0).ok).toBe(false);
    // leaving a run: the portal back to it waits in town
    g.startRun('tristram', 0, 1);
    g.townPortal();
    expect(g.world.objects.some((o) => o.kind === 'portal' && o.ref === 'run')).toBe(true);
  });
});

/** Fresh module graph with a demo game mode `demo` on `d2` (ruleset `d2+demo` active) */
async function withMode(register: (api: ModApi) => void) {
  vi.resetModules();
  const D = await import('../../src/mods/discover');
  const manifest: ModManifest = {
    id: 'demo',
    name: 'Demo',
    version: '1.0.0',
    kind: 'gamemode',
    rulesets: ['d2'],
    variants: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', description: 'Bee' },
    ],
    load: () => Promise.resolve({ default: { register } }),
  };
  D.provideManifests([manifest]);
  const A = await import('../../src/mods/activate');
  await A.activateRuleset('d2+demo');
  const G = await import('../../src/sim/game');
  const C = await import('../../src/sim/character');
  const I = await import('../../src/sim/loot/itemgen');
  const R = await import('../../src/core/rng');
  const S = await import('../../src/sim/itemstats');
  G.Game.resetIds();
  return { G, C, I, R, S, A, manifest };
}

describe('Gear above the level (lot 289): a game mode', () => {
  it('wears it asleep (not counted) until the hero meets its requirements; leaving the run abandons it', async () => {
    const { G, C, I, R, S } = await withMode((api) => {
      api.rules.set('char.equipNeedsReqs', () => () => false);
      api.rules.set('char.itemActive', () => (c, it) => C.canEquip(c, it).ok);
      const tristram = api.runs.get('tristram')!;
      api.runs.add({ ...tristram, id: 'demo:arena', hidden: true, abandonOnLeave: () => true });
    });
    const g = new G.Game(undefined, 'sorceress');
    const rng = new R.Rng('lot289');
    let ring = I.generateItem(rng, 'ring', 60, { forceQuality: 'rare' });
    while (S.requiredLevel(ring) <= 10) ring = I.generateItem(rng, 'ring', 60, { forceQuality: 'rare' });
    g.character.inventory[0] = ring;
    expect(C.canWear(g.character, ring).ok).toBe(true);
    expect(g.equip(0).ok).toBe(true);
    const asleep = C.computeDerived(g.character, 0);
    expect(C.activeItems(g.character)).not.toContain(ring);
    g.character.level = S.requiredLevel(ring);
    expect(C.activeItems(g.character)).toContain(ring);
    const awake = C.computeDerived(g.character, 0);
    expect(awake).not.toEqual(asleep);
    // the run left for the town: no portal back
    expect(g.startRun('demo:arena', 0, 1)).toBe(true);
    g.townPortal();
    expect(g.mode).toBe('town');
    expect(g.world.objects.some((o) => o.kind === 'portal' && o.ref === 'run')).toBe(false);
  });

  it('variants of the session mode on the creation screen: the first picked, a tap picks another', async () => {
    const { manifest } = await withMode(() => undefined);
    const options = { contents: [{ id: 'd2', name: 'D2' }], modes: [{ id: 'demo', name: 'Demo', variants: manifest.variants }] };
    expect(variantsOf(options, 'd2+demo').map((v) => v.id)).toEqual(['a', 'b']);
    expect(variantsOf(options, 'd2')).toEqual([]);
    expect(variantPicker(NO_MODS, 'classic')).toBeNull();
    const p = variantPicker({ ...NO_MODS, options, mode: 'd2+demo' }, 'classic')!;
    expect(p.value()).toBe('a');
    const b = p.el.querySelector<HTMLButtonElement>('[data-variant="b"]')!;
    b.click();
    expect(p.value()).toBe('b');
    expect(p.el.textContent).toContain('Bee');
    expect(p.el.querySelector('[data-variant="b"]')!.getAttribute('aria-pressed')).toBe('true');
  });
});
