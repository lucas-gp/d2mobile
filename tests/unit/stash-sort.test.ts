/** Tri du coffre : invariants (aucun objet perdu ni dupliqué), ordre des catégories, compaction, pages vides libérées, idempotence */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { Game } from '../../src/sim/game';
import { STASH_TABS } from '../../src/sim/character';
import { STASH_COLS, STASH_ROWS, itemSize, placeInStash } from '../../src/sim/inventory';
import { generateItem } from '../../src/sim/loot/itemgen';
import { SHARED_TABS } from '../../src/sim/save';
import { compareStash, sortAllStash, sortStashPage, stashCategory } from '../../src/sim/stash-sort';
import { BASE_BY_ID } from '../../src/data/items/bases';
import type { Item } from '../../src/sim/item';
import type { Quality } from '../../src/sim/item';
import { withoutPd2 } from '../needs-pd2';

import { RULES, type RuleTypes } from '../../src/mods/rules';

/** Carte (objet du mod qui fournit les cartes, règle `maps.make`) */
const makeMap: RuleTypes['maps.make'] = (...a) => RULES['maps.make'](...a);

const rng = new Rng('tri-coffre');
const mk = (base: string, q: Quality = 'normal', ilvl = 30): Item => generateItem(rng, base, ilvl, { forceQuality: q });
const uids = (tabs: (Item | null)[][]) =>
  tabs
    .flat()
    .filter((x): x is Item => !!x)
    .map((x) => x.uid)
    .sort();
const typeOf = (it: Item) => BASE_BY_ID[it.base].type;

/** Premier id de base d'un type */
const first = (ty: string): string => Object.values(BASE_BY_ID).find((x) => x.type === ty && !x.noRandomDrop)!.id;

/** Assortiment varié (armes, armures, bouclier, bijoux, charmes, carte) */
function assortment(): Item[] {
  return [
    mk(first('ring'), 'magic'),
    mk(first('amulet'), 'rare'),
    mk(first('smallcharm'), 'magic'),
    mk(first('largecharm'), 'rare'),
    mk(first('grandcharm'), 'unique' as Quality),
    mk(first('sword'), 'rare'),
    mk(first('bow'), 'magic'),
    mk(first('sword'), 'normal', 10),
    mk(first('axe'), 'unique' as Quality),
    mk(first('armor'), 'normal'),
    mk(first('helm'), 'magic'),
    mk(first('gloves'), 'rare'),
    mk(first('boots'), 'magic'),
    mk(first('belt'), 'normal'),
    mk(first('shield'), 'rare'),
    mk(first('jewel'), 'rare'),
    // carte : objet du mod pd2
    ...(withoutPd2 ? [] : [makeMap(rng, 2)]),
  ];
}

function game(shared = true): Game {
  const g = new Game();
  if (shared) g.attachShared(null);
  return g;
}

/** Cases occupées d'un onglet (objet à sa case de départ, w × h) ; chevauchement = faux */
function cellsUsed(t: (Item | null)[]): number | null {
  const occ = new Set<number>();
  for (let i = 0; i < STASH_COLS * STASH_ROWS; i++) {
    const it = t[i];
    if (!it) continue;
    const [w, h] = itemSize(it);
    const x = i % STASH_COLS;
    const y = Math.floor(i / STASH_COLS);
    if (x + w > STASH_COLS || y + h > STASH_ROWS) return null;
    for (let j = 0; j < h; j++)
      for (let k = 0; k < w; k++) {
        const c = (y + j) * STASH_COLS + x + k;
        if (occ.has(c)) return null;
        occ.add(c);
      }
  }
  return occ.size;
}

describe('tri du coffre', () => {
  it.skipIf(withoutPd2)('tri d’une page : mêmes objets (uid), aucun chevauchement, ordre des catégories', () => {
    const g = game();
    const t = STASH_TABS;
    const items = assortment();
    // on les range d'abord proprement (le placement manuel ne gère pas les chevauchements)
    for (const it of items) expect(placeInStash(g.character.stash[t], it)).toBeGreaterThanOrEqual(0);
    const before = uids(g.character.stash);
    expect(sortStashPage(g.character, t)).toBe(true);
    expect(uids(g.character.stash)).toEqual(before);
    expect(cellsUsed(g.character.stash[t])).not.toBeNull();
    const seq = g.character.stash[t].filter((x): x is Item => !!x);
    // dans l'ordre de lecture des objets triés, les catégories ne reviennent jamais en arrière
    const sorted = [...seq].sort(compareStash);
    const cats = sorted.map(stashCategory);
    expect(cats).toEqual([...cats].sort((a, b) => a - b));
    // armes < armures < boucliers < bijoux < charmes < cartes
    const idx = (ty: string[]) => Math.min(...sorted.map((x, i) => (ty.includes(typeOf(x)) ? i : 999)));
    expect(idx(['sword', 'axe', 'bow'])).toBeLessThan(idx(['armor', 'helm', 'gloves', 'boots', 'belt']));
    expect(idx(['armor', 'helm', 'gloves', 'boots', 'belt'])).toBeLessThan(idx(['shield']));
    expect(idx(['shield'])).toBeLessThan(idx(['amulet', 'ring', 'jewel']));
    expect(idx(['amulet', 'ring', 'jewel'])).toBeLessThan(idx(['smallcharm', 'largecharm', 'grandcharm']));
    expect(sorted[sorted.length - 1].map).toBeTruthy();
  });

  it('armures dans l’ordre casque, torse, gants, bottes, ceinture', () => {
    const order = ['helm', 'armor', 'gloves', 'boots', 'belt'].map((ty) => {
      const b = Object.values(BASE_BY_ID).find((x) => x.type === ty && !x.noRandomDrop)!;
      return mk(b.id);
    });
    const shuffled = [order[3], order[0], order[4], order[2], order[1]];
    expect([...shuffled].sort(compareStash).map((x) => x.uid)).toEqual(order.map((x) => x.uid));
  });

  it('qualité décroissante : uniques/sets/mots runiques, rares, magiques, normaux ; puis niveau décroissant', () => {
    const n = mk(first('sword'), 'normal', 50);
    const m = mk(first('sword'), 'magic', 20);
    const r = mk(first('sword'), 'rare', 10);
    const u = mk(first('sword'), 'unique' as Quality, 5);
    const lo = mk(first('sword'), 'rare', 40);
    expect([n, m, r, u, lo].sort(compareStash).map((x) => x.uid)).toEqual([u, lo, r, m, n].map((x) => x.uid));
  });

  it('idempotent : un second tri ne change rien (positions comprises)', () => {
    const g = game();
    const items = [...assortment(), ...assortment(), ...assortment()];
    for (const it of items) expect(g.character.stash.slice(STASH_TABS).some((p) => placeInStash(p, it) >= 0)).toBe(true);
    // des trous : un objet sur trois retiré
    g.character.stash.forEach((p) => p.forEach((it, i) => it && i % 3 === 0 && (p[i] = null)));
    expect(sortAllStash(g.character)).toBeGreaterThanOrEqual(0);
    const snap = g.character.stash.map((p) => p.map((x) => x?.uid ?? null));
    expect(sortAllStash(g.character)).toBeGreaterThanOrEqual(0);
    expect(g.character.stash.map((p) => p.map((x) => x?.uid ?? null))).toEqual(snap);
    const page = g.character.stash[STASH_TABS].map((x) => x?.uid ?? null);
    sortStashPage(g.character, STASH_TABS);
    expect(g.character.stash[STASH_TABS].map((x) => x?.uid ?? null)).toEqual(page);
  });

  it('tout trier : replie sur les premières pages, pas de page intermédiaire vide, sans perte', () => {
    const g = game();
    const c = g.character;
    const items = [...assortment(), ...assortment()];
    // éparpillés sur les pages 1, 4, 7, 11 du coffre partagé
    items.forEach((it, i) => {
      const t = c.stash[STASH_TABS + [0, 3, 6, 10][i % 4]];
      expect(placeInStash(t, it)).toBeGreaterThanOrEqual(0);
    });
    const before = uids(c.stash);
    expect(sortAllStash(c)).toBeGreaterThanOrEqual(0);
    expect(uids(c.stash)).toEqual(before);
    const filled = c.stash.slice(STASH_TABS).map((p) => p.some(Boolean));
    const lastFilled = filled.lastIndexOf(true);
    expect(filled.slice(0, lastFilled + 1).every(Boolean)).toBe(true);
    // pas de trou : tout tient sur la première page tant que la surface suffit
    const area = items.reduce((s, it) => s + itemSize(it)[0] * itemSize(it)[1], 0);
    if (area <= 70) expect(lastFilled).toBe(0);
    for (const p of c.stash) expect(cellsUsed(p)).not.toBeNull();
  });

  it('libère les pages vides en fin de coffre (jusqu’au minimum de pages partagées)', () => {
    const g = game();
    const c = g.character;
    // 18 pages partagées : on en crée 6 de plus, remplies d'un seul objet chacune
    for (let i = 0; i < 6; i++) {
      const p = new Array(80).fill(null);
      placeInStash(p, mk(first('ring'), 'magic'));
      c.stash.push(p);
    }
    g.sharedTabs = c.stash.length - STASH_TABS;
    expect(g.sharedTabs).toBe(SHARED_TABS + 6);
    const before = uids(c.stash);
    expect(g.sortStash('all')).toBe(true);
    expect(uids(c.stash)).toEqual(before);
    expect(c.stash.length).toBe(STASH_TABS + SHARED_TABS);
    expect(g.sharedTabs).toBe(SHARED_TABS);
    expect(g.sharedStash()!.tabs.length).toBe(SHARED_TABS);
    // jamais en dessous du minimum, même vide
    for (const p of c.stash) p.fill(null);
    sortAllStash(c);
    expect(c.stash.length).toBe(STASH_TABS + SHARED_TABS);
  });

  it('les pages personnelles (« À vider ») ne sont pas touchées par « tout trier »', () => {
    const g = game();
    const c = g.character;
    const ring = mk(first('ring'), 'magic');
    placeInStash(c.stash[0], ring);
    placeInStash(c.stash[STASH_TABS + 4], mk(first('amulet'), 'rare'));
    sortAllStash(c);
    expect(c.stash[0].includes(ring)).toBe(true);
    expect(c.stash[STASH_TABS].some(Boolean)).toBe(true);
  });

  it('annulation : le tri est défait, et refusée si autre chose a bougé depuis', () => {
    const g = game();
    const c = g.character;
    for (const it of assortment()) placeInStash(c.stash[STASH_TABS + 5], it);
    const before = c.stash.map((p) => p.map((x) => x?.uid ?? null));
    expect(g.sortStash('all')).toBe(true);
    expect(g.canUndoStash()).toBe(true);
    expect(g.undoStash()).toBe(true);
    expect(c.stash.map((p) => p.map((x) => x?.uid ?? null))).toEqual(before);
    // un changement entre-temps invalide l'annulation
    expect(g.sortStash('all')).toBe(true);
    c.materials.r01 = 3;
    expect(g.canUndoStash()).toBe(false);
    expect(g.undoStash()).toBe(false);
  });

  it('persistance : le coffre trié survit à la sauvegarde partagée (aller-retour JSON)', () => {
    const g = game();
    for (const it of assortment()) placeInStash(g.character.stash[STASH_TABS + 2], it);
    g.sortStash('all');
    const json = JSON.parse(JSON.stringify(g.sharedStash()));
    const g2 = game(false);
    g2.attachShared(json);
    expect(uids(g2.sharedStash()!.tabs)).toEqual(uids(g.sharedStash()!.tabs));
    expect(g2.character.stash.slice(STASH_TABS).map((p) => p.map((x) => x?.uid ?? null))).toEqual(g.character.stash.slice(STASH_TABS).map((p) => p.map((x) => x?.uid ?? null)));
  });
});
