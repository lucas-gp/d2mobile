import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { newCharacter } from '../../src/sim/character';
import type { Item } from '../../src/sim/item';
import { itemMods, itemName, modLabel } from '../../src/sim/itemstats';
import { generateItem, makeStack } from '../../src/sim/loot/itemgen';
import { MAP_TAB, buildSearchText, clearSearchCache, normSearch, searchCacheSize, searchStash } from '../../src/sim/stash-search';
import { withoutPd2 } from '../needs-pd2';

import { RULES, type RuleTypes } from '../../src/mods/rules';
import { perfMs } from '../perf';

/** Carte (objet du mod qui fournit les cartes, règle `maps.make`) */
const makeMap: RuleTypes['maps.make'] = (...a) => RULES['maps.make'](...a);

const rng = new Rng('stash-search');
function setup() {
  const c = newCharacter('T');
  const put = (tab: number, idx: number, it: Item) => (c.stash[tab][idx] = it);
  return { c, put };
}

describe('recherche dans le coffre', () => {
  it('sans texte ni filtre : aucun résultat', () => {
    const { c, put } = setup();
    put(0, 0, generateItem(rng, 'short_sword', 60, { forceQuality: 'magic' }));
    expect(searchStash(c, '')).toEqual([]);
    expect(searchStash(c, '   ', {})).toEqual([]);
  });

  it('nom (sans accents ni casse), base, type et qualité', () => {
    const { c, put } = setup();
    const sword = generateItem(rng, 'short_sword', 60, { forceQuality: 'magic' });
    const helm = generateItem(rng, 'cap', 60, { forceQuality: 'rare' });
    put(0, 0, sword);
    put(1, 5, helm);
    expect(searchStash(c, 'ÉPÉE').map((h) => [h.tab, h.idx, h.uid])).toEqual([[0, 0, sword.uid]]);
    expect(searchStash(c, 'epee')).toHaveLength(1);
    expect(searchStash(c, 'casque').map((h) => h.uid)).toEqual([helm.uid]);
    expect(searchStash(c, 'rare').map((h) => h.uid)).toEqual([helm.uid]);
    expect(searchStash(c, 'magique').map((h) => h.uid)).toEqual([sword.uid]);
    expect(searchStash(c, itemName(sword).slice(0, 6).toUpperCase())).not.toHaveLength(0);
  });

  it('plusieurs mots : tous doivent correspondre (ET)', () => {
    const { c, put } = setup();
    const a = generateItem(rng, 'short_sword', 60, { forceQuality: 'magic' });
    const b = generateItem(rng, 'long_sword', 60, { forceQuality: 'rare' });
    put(0, 0, a);
    put(0, 1, b);
    expect(searchStash(c, 'epee').length).toBe(2);
    expect(searchStash(c, 'epee rare').map((h) => h.uid)).toEqual([b.uid]);
    expect(searchStash(c, 'epee unique')).toEqual([]);
  });

  it('modificateurs : texte des lignes de l’objet', () => {
    const { c, put } = setup();
    let found: Item | null = null;
    for (let i = 0; i < 80 && !found; i++) {
      const it = generateItem(rng, 'ring', 85, { forceQuality: 'rare' });
      if (itemMods(it).some((m) => m.stat === 'resFire')) found = it;
    }
    expect(found).not.toBeNull();
    put(2, 7, found!);
    const line = modLabel(itemMods(found!).find((m) => m.stat === 'resFire')!);
    expect(searchStash(c, normSearch(line))).toHaveLength(1);
    expect(searchStash(c, 'résistance au feu').length).toBe(1);
    expect(searchStash(c, 'vol de vie zzz')).toEqual([]);
  });

  it('runes serties, mots runiques, châsses, éthéré, corrompu', () => {
    const { c, put } = setup();
    const it = generateItem(rng, 'short_sword', 60, { forceQuality: 'normal' });
    it.sockets = 2;
    it.socketed = [makeStack(rng, 'r03')];
    it.ethereal = true;
    put(0, 3, it);
    const plain = generateItem(rng, 'cap', 60, { forceQuality: 'normal' });
    put(0, 4, plain);
    const rune = itemName(it.socketed[0]).split(' ')[0];
    expect(searchStash(c, rune).map((h) => h.uid)).toContain(it.uid);
    expect(searchStash(c, '2 châsses').map((h) => h.uid)).toEqual([it.uid]);
    expect(searchStash(c, 'etheré').map((h) => h.uid)).toEqual([it.uid]);
    expect(searchStash(c, 'corrompu')).toEqual([]);
    plain.corrupted = { outcome: 'x', mods: [] };
    expect(searchStash(c, 'corrompu').map((h) => h.uid)).toEqual([plain.uid]);
  });

  it('filtres : qualité (OU) × catégorie (ET)', () => {
    const { c, put } = setup();
    const u = generateItem(rng, 'short_sword', 60, { forceQuality: 'unique' });
    const m = generateItem(rng, 'short_sword', 60, { forceQuality: 'magic' });
    const r = generateItem(rng, 'ring', 60, { forceQuality: 'rare' });
    put(0, 0, u);
    put(0, 1, m);
    put(1, 0, r);
    const uids = (h: ReturnType<typeof searchStash>) => h.map((x) => x.uid).sort();
    expect(uids(searchStash(c, '', { quality: ['unique'] }))).toEqual([u.uid].sort());
    expect(uids(searchStash(c, '', { quality: ['unique', 'rare'] }))).toEqual([u.uid, r.uid].sort());
    expect(uids(searchStash(c, '', { category: ['jewelry'] }))).toEqual([r.uid]);
    expect(uids(searchStash(c, '', { category: ['weapons'], quality: ['magic'] }))).toEqual([m.uid]);
    expect(searchStash(c, '', { category: ['armor'] })).toEqual([]);
  });

  it.skipIf(withoutPd2)('cartes : trouvées dans le coffre de cartes (onglet -5)', () => {
    const { c } = setup();
    const map = makeMap(rng, 2, 'rare');
    c.mapStash = [map];
    expect(buildSearchText(map).length).toBeGreaterThan(0);
    const word = normSearch(itemName(map).split(' ')[0]);
    expect(searchStash(c, word)).toEqual([{ tab: MAP_TAB, idx: 0, uid: map.uid }]);
    expect(searchStash(c, '', { category: ['maps'] })).toHaveLength(1);
    expect(searchStash(c, '', { category: ['weapons'] })).toEqual([]);
  });

  it('index en cache : réutilisé tant que l’empreinte ne change pas, rebâti sinon', () => {
    clearSearchCache();
    const { c, put } = setup();
    const it = generateItem(rng, 'short_sword', 60, { forceQuality: 'normal' });
    put(0, 0, it);
    searchStash(c, 'epee');
    expect(searchCacheSize()).toBe(1);
    expect(searchStash(c, 'chasse')).toEqual([]);
    it.sockets = 1;
    expect(searchStash(c, 'chasse')).toHaveLength(1);
    expect(searchCacheSize()).toBe(1);
  });

  it('performance : 40 pages pleines', () => {
    clearSearchCache();
    const { c } = setup();
    c.stash = Array.from({ length: 40 }, () => new Array(80).fill(null));
    for (let t = 0; t < 40; t++) for (let i = 0; i < 80; i += 2) c.stash[t][i] = generateItem(rng, i % 4 ? 'ring' : 'cap', 60, { forceQuality: 'magic' });
    searchStash(c, 'anneau');
    const t0 = performance.now();
    for (let k = 0; k < 20; k++) searchStash(c, 'anneau feu');
    expect((performance.now() - t0) / 20).toBeLessThan(perfMs(50));
  });
});
