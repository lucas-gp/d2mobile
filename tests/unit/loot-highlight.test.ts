/** Liste de surbrillance du filtre de butin : correspondance par id, couleur, affichage forcé, neutralité sans liste, sauvegarde */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { Rng } from '../../src/core/rng';
import { generateItem } from '../../src/sim/loot/itemgen';
import { lootFilterDecision, SHOW_GOOD, SHOW_HIDDEN } from '../../src/sim/loot/filter';
import {
  HIGHLIGHT_CATS,
  catalogCounts,
  recolorHighlights,
  withHighlights,
  withoutHighlights,
  highlightCatalog,
  highlightColor,
  highlightKeys,
  highlightName,
  matchHighlight,
  normSearch,
  sanitizeHighlight,
  searchCatalog,
  withHighlight,
  MAX_HIGHLIGHTS,
} from '../../src/sim/loot/highlight';
import { deserialize, serialize } from '../../src/sim/save';
import { UNIQUES } from '../../src/data/items/uniques';
import type { Item } from '../../src/sim/item';

const rng = new Rng('surbrillance');
const magicRing = (): Item => generateItem(rng, 'ring', 40, { forceQuality: 'magic' });

describe('surbrillance du filtre', () => {
  it('absence de liste : comportement inchangé', () => {
    const g = new Game();
    const it = magicRing();
    const before = lootFilterDecision(g.character, it);
    expect(highlightColor(g.character.filter, it)).toBeUndefined();
    g.setFilter({ highlight: [] });
    expect(lootFilterDecision(g.character, it)).toBe(before);
    expect(g.character.filter.highlight).toEqual([]);
  });

  it('correspondance par base, la plus précise l’emporte', () => {
    const it = magicRing();
    expect(highlightKeys(it)).toEqual([`base:${it.base}`]);
    const f = { highlight: [{ id: `base:${it.base}`, color: 0x112233 }] };
    expect(highlightColor(f, it)).toBe(0x112233);
    const u = generateItem(rng, UNIQUES[0].base, 60, { forceQuality: 'unique' });
    const keys = highlightKeys(u);
    expect(keys[0].startsWith('unique:')).toBe(true);
    const both = {
      highlight: [
        { id: `base:${u.base}`, color: 1 },
        { id: keys[0], color: 2 },
      ],
    };
    expect(matchHighlight(both, u)?.color).toBe(2);
    expect(highlightColor({ highlight: [{ id: 'base:autre', color: 3 }] }, it)).toBeUndefined();
  });

  it('force : visible au moins « bon » malgré le filtre ; sans force : reste masqué', () => {
    const g = new Game();
    g.setFilter({ minQuality: 3 });
    const it = magicRing();
    expect(lootFilterDecision(g.character, it)).toBe(SHOW_HIDDEN);
    g.setFilter({ highlight: [{ id: `base:${it.base}`, color: 0xff0000 }] });
    expect(lootFilterDecision(g.character, it)).toBe(SHOW_HIDDEN);
    g.setFilter({ highlight: [{ id: `base:${it.base}`, color: 0xff0000, force: true }] });
    expect(lootFilterDecision(g.character, it)).toBe(SHOW_GOOD);
    // un palier plus haut n'est jamais abaissé
    const u = generateItem(rng, UNIQUES[0].base, 60, { forceQuality: 'unique' });
    g.setFilter({ highlight: [{ id: highlightKeys(u)[0], color: 1, force: true }] });
    expect(lootFilterDecision(g.character, u)).toBeGreaterThanOrEqual(3);
  });

  it('le préréglage reste inchangé en modifiant la liste ; changer de préréglage garde la liste', () => {
    const g = new Game();
    g.setFilter({ preset: 'strict' });
    g.setFilter({ highlight: [{ id: 'base:r15', color: 0xffe030 }] });
    expect(g.character.filter.preset).toBe('strict');
    g.setFilter({ preset: 'all' });
    expect(g.character.filter.highlight).toEqual([{ id: 'base:r15', color: 0xffe030 }]);
  });

  it('sauvegarde aller-retour ; entrées invalides écartées', () => {
    const g = new Game();
    g.setFilter({
      highlight: [
        { id: 'base:r15', color: 0x40e870, force: true },
        { id: 'unique:x', color: 0x4a8cff },
      ],
    });
    const back = deserialize(serialize(g.toSave()));
    expect(back.character.filter.highlight).toEqual([
      { id: 'base:r15', color: 0x40e870, force: true },
      { id: 'unique:x', color: 0x4a8cff },
    ]);
    const bad = JSON.parse(serialize(g.toSave()));
    bad.character.filter.highlight = [{ id: 'n’importe quoi', color: 5 }, { id: 'base:ok', color: 'rouge' }, { id: 'base:ok', color: 7 }, null];
    const fixed = deserialize(JSON.stringify(bad)).character.filter.highlight;
    expect(fixed?.map((x) => x.id)).toEqual(['base:ok']);
    bad.character.filter.highlight = 'oups';
    expect(deserialize(JSON.stringify(bad)).character.filter.highlight).toBeUndefined();
  });

  it('plafond de la liste', () => {
    let l = undefined as ReturnType<typeof withHighlight> | undefined;
    for (let i = 0; i < MAX_HIGHLIGHTS + 5; i++) l = withHighlight(l, { id: `base:b${i}`, color: 1 });
    expect(l!.length).toBe(MAX_HIGHLIGHTS);
    expect(MAX_HIGHLIGHTS).toBe(300);
    expect(sanitizeHighlight(Array.from({ length: 400 }, (_, i) => ({ id: `base:b${i}`, color: 1 })))!.length).toBe(300);
    // taille de sauvegarde raisonnable à pleine capacité (< 30 Ko, ids longs de 28 caractères)
    expect(JSON.stringify(Array.from({ length: 300 }, (_, i) => ({ id: `runeword:long_identifiant_${i}`, color: 0xffffff, force: true }))).length).toBeLessThan(30000);
  });

  it('recherche : toute la base, sans accents, par catégorie, 50 résultats au plus', () => {
    const cat = highlightCatalog();
    for (const kind of ['base:', 'unique:', 'set:', 'runeword:']) expect(cat.some((e) => e.id.startsWith(kind))).toBe(true);
    expect(new Set(cat.map((e) => e.id)).size).toBe(cat.length);
    expect(normSearch('Épée Œuvre')).toBe('epee oeuvre');
    const all = searchCatalog('', 'all', 50);
    expect(searchCatalog('', 'all').length).toBe(cat.length);
    expect(all.length).toBe(50);
    const sets = searchCatalog('', 'set', 500);
    expect(sets.length).toBeGreaterThan(5);
    expect(sets.every((e) => e.cat === 'set')).toBe(true);
    const u = cat.find((e) => e.id.startsWith('unique:') && /[éèêà]/.test(e.name));
    if (u) expect(searchCatalog(normSearch(u.name), 'unique').some((e) => e.id === u.id)).toBe(true);
    expect(highlightName(cat[0].id)).toBe(cat[0].name);
    expect(searchCatalog('r15', 'rune').length + searchCatalog('', 'rune', 100).length).toBeGreaterThan(0);
  });

  it('ajout par lot, retrait, recoloration, cochage', () => {
    const base = [{ id: 'base:r01', color: 1, force: true }];
    const r = withHighlights(base, ['base:r01', 'base:r02', 'base:r03'], 7);
    expect(r.added).toBe(2);
    expect(r.list).toEqual([
      { id: 'base:r01', color: 1, force: true },
      { id: 'base:r02', color: 7 },
      { id: 'base:r03', color: 7 },
    ]);
    const big = withHighlights(
      undefined,
      Array.from({ length: 350 }, (_, i) => `base:x${i}`),
      2,
    );
    expect(big.added).toBe(MAX_HIGHLIGHTS);
    expect(big.list.length).toBe(MAX_HIGHLIGHTS);
    expect(withHighlights(big.list, ['base:nouveau'], 2).added).toBe(0);
    expect(withoutHighlights(r.list, ['base:r02', 'base:inconnu']).map((x) => x.id)).toEqual(['base:r01', 'base:r03']);
    expect(recolorHighlights(r.list, ['base:r03'], 9).map((x) => x.color)).toEqual([1, 7, 9]);
    // cochage : une entrée est cochée si son id est dans la liste
    const have = new Set(r.list.map((x) => x.id));
    expect(searchCatalog('', 'rune').filter((e) => have.has(e.id)).length).toBeGreaterThanOrEqual(3);
  });

  it('catégories : chaque objet dans exactement une, aucune vide', () => {
    const cat = highlightCatalog();
    const keys = new Set(HIGHLIGHT_CATS.map(([k]) => k));
    expect(cat.every((e) => keys.has(e.cat))).toBe(true);
    const per = HIGHLIGHT_CATS.map(([k]) => searchCatalog('', k).length);
    expect(per.reduce((a, b) => a + b, 0)).toBe(cat.length);
    const ids = HIGHLIGHT_CATS.flatMap(([k]) => searchCatalog('', k).map((e) => e.id));
    expect(new Set(ids).size).toBe(cat.length);
    const counts = catalogCounts();
    expect(counts.all).toBe(cat.length);
    for (const [k, label] of HIGHLIGHT_CATS) {
      if (k === 'other') continue; // Divers : cartes, orbes, éclats… peut être vide si tout est classé ailleurs
      expect(counts[k], `catégorie ${label}`).toBeGreaterThan(0);
    }
    expect(counts.other).toBeGreaterThan(0);
  });
});

describe('recherche par nom traduit', () => {
  it('« frostwind » trouve « Vent de givre » avec une traduction, pas sans', async () => {
    const { searchCatalog } = await import('../../src/sim/loot/highlight');
    const alt = (s: string) => (s === 'Vent de givre' ? 'Frostwind' : s);
    expect(searchCatalog('frostwind', 'all', 50, alt).some((e) => e.id === 'unique:u_frostwind')).toBe(true);
    expect(searchCatalog('frostwind', 'all', 50).some((e) => e.id === 'unique:u_frostwind')).toBe(false);
    expect(searchCatalog('vent de givre', 'unique', 50, alt).some((e) => e.id === 'unique:u_frostwind')).toBe(true);
  });
});
