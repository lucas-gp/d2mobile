/** Coffre unique partagé : migration des pages personnelles, plafond, idempotence, partage entre personnages, fusion sans doublon */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { STASH_TABS } from '../../src/sim/character';
import { MAX_SHARED_TABS, SHARED_TABS, deserialize, mergeShared, serialize, type SharedStash } from '../../src/sim/save';
import { placeInStash } from '../../src/sim/inventory';
import { Rng } from '../../src/core/rng';
import { generateItem } from '../../src/sim/loot/itemgen';
import type { Item } from '../../src/sim/item';

const rng = new Rng('coffre-unique');
const mk = (n = 0): Item => generateItem(rng, n % 2 ? 'amulet' : 'ring', 40, { forceQuality: 'rare' });
const uidsOf = (tabs: (Item | null)[][]) =>
  tabs
    .flat()
    .filter((x): x is Item => !!x)
    .map((x) => x.uid);

function withPersonal(n: number): { g: Game; items: Item[] } {
  const g = new Game();
  const items: Item[] = [];
  for (let i = 0; i < n; i++) {
    const it = mk(i);
    items.push(it);
    expect(placeInStash(g.character.stash[i % STASH_TABS], it)).toBeGreaterThanOrEqual(0);
  }
  return { g, items };
}

describe('coffre unique partagé', () => {
  it('migration : les objets personnels passent dans le coffre partagé, une seule fois', () => {
    const { g, items } = withPersonal(12);
    g.attachShared(null);
    expect(g.stashMigration).toEqual({ moved: 12, left: 0, added: 0 });
    expect(uidsOf(g.character.stash.slice(0, STASH_TABS))).toEqual([]);
    expect(uidsOf(g.sharedStash()!.tabs).sort()).toEqual(items.map((x) => x.uid).sort());
    expect(g.personalLeftovers()).toBe(0);
    // la sauvegarde du personnage n'emporte plus aucun objet de coffre
    expect(uidsOf(g.toSave().character.stash)).toEqual([]);
  });

  it('idempotence : attacher de nouveau ne change rien et ne duplique rien', () => {
    const { g, items } = withPersonal(9);
    g.attachShared(null);
    const once = JSON.parse(JSON.stringify(g.sharedStash()));
    const g2 = new Game(deserialize(serialize(g.toSave())));
    g2.attachShared(JSON.parse(JSON.stringify(once)));
    expect(g2.stashMigration).toBeNull();
    expect(g2.sharedStash()).toEqual(once);
    expect(uidsOf(g2.sharedStash()!.tabs).sort()).toEqual(items.map((x) => x.uid).sort());
  });

  it('interruption entre les deux écritures : le doublon personnel est écarté', () => {
    const { g, items } = withPersonal(5);
    const oldSave = JSON.parse(serialize(g.toSave())); // personnage non encore réécrit
    g.attachShared(null);
    const shared = JSON.parse(JSON.stringify(g.sharedStash()));
    const g2 = new Game(deserialize(JSON.stringify(oldSave)));
    g2.attachShared(shared);
    const all = uidsOf(g2.character.stash);
    expect(all.length).toBe(items.length);
    expect(new Set(all).size).toBe(all.length);
  });

  it('plafond : les pages sont créées au besoin, le reste demeure en pages personnelles, rien n’est perdu', () => {
    const g = new Game();
    // 4 pages personnelles pleines d'objets 1x1 (anneaux) = 320 ; coffre partagé déjà plein au plafond
    const full: SharedStash = { version: 1, tabs: Array.from({ length: MAX_SHARED_TABS }, () => new Array(80).fill(null)) };
    for (const t of full.tabs) for (let i = 0; i < 80; i++) t[i] = mk(1);
    const mine: Item[] = [];
    for (let i = 0; i < 3; i++) {
      const it = mk(1);
      mine.push(it);
      placeInStash(g.character.stash[0], it);
    }
    g.attachShared(full);
    expect(g.stashMigration).toEqual({ moved: 0, left: 3, added: 0 });
    expect(g.personalLeftovers()).toBe(3);
    expect(g.sharedTabs).toBe(MAX_SHARED_TABS);
    expect(uidsOf(g.toSave().character.stash).sort()).toEqual(mine.map((x) => x.uid).sort());
    // libère de la place : la migration reprend toute seule au chargement suivant
    full.tabs[0][0] = null;
    const g2 = new Game(deserialize(serialize(g.toSave())));
    g2.attachShared(JSON.parse(JSON.stringify(full)));
    expect(g2.personalLeftovers()).toBe(2);
    expect(g2.stashMigration?.moved).toBe(1);
  });

  it('pages créées quand le coffre partagé par défaut est plein', () => {
    const g = new Game();
    const full: SharedStash = { version: 1, tabs: Array.from({ length: SHARED_TABS }, () => new Array(80).fill(null)) };
    for (const t of full.tabs) for (let i = 0; i < 80; i++) t[i] = mk(1);
    placeInStash(g.character.stash[0], mk(0));
    g.attachShared(full);
    expect(g.stashMigration).toEqual({ moved: 1, left: 0, added: 1 });
    expect(g.sharedTabs).toBe(SHARED_TABS + 1);
  });

  it('partage : A range, B retrouve ; le dépôt automatique va dans le coffre partagé', () => {
    const a = new Game();
    a.attachShared(null);
    const it = mk(0);
    a.character.inventory[0] = it;
    expect(a.stash(0, STASH_TABS)).toBe(true);
    const b = new Game(undefined, 'druid');
    b.attachShared(JSON.parse(JSON.stringify(a.sharedStash())));
    expect(uidsOf(b.sharedStash()!.tabs)).toContain(it.uid);
  });

  it('sans coffre partagé attaché (module, bots) : pages personnelles inchangées', () => {
    const g = new Game();
    expect(g.sharedTabs).toBe(0);
    expect(g.character.stash.length).toBe(STASH_TABS);
    expect(g.personalLeftovers()).toBe(0);
  });

  it('fusion de deux versions : union par uid sans doublon ni perte', () => {
    const shared = (): SharedStash => ({ version: 1, tabs: Array.from({ length: 2 }, () => new Array(80).fill(null)) });
    const common = mk(0),
      onlyA = mk(1),
      onlyB = mk(2);
    const a = shared(),
      b = shared();
    placeInStash(a.tabs[0], common);
    placeInStash(a.tabs[0], onlyA);
    placeInStash(b.tabs[0], common);
    placeInStash(b.tabs[1], onlyB);
    const { merged, lost } = mergeShared(a, b);
    expect(lost).toEqual([]);
    const u = uidsOf(merged.tabs);
    expect(new Set(u).size).toBe(u.length);
    expect(u.sort()).toEqual([common.uid, onlyA.uid, onlyB.uid].sort());
  });

  it('aller-retour de sauvegarde du coffre', () => {
    const { g, items } = withPersonal(6);
    g.attachShared(null);
    const text = JSON.stringify(g.sharedStash());
    const g2 = new Game();
    g2.attachShared(JSON.parse(text));
    expect(uidsOf(g2.sharedStash()!.tabs).sort()).toEqual(items.map((x) => x.uid).sort());
  });
});
