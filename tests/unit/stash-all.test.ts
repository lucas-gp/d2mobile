/** « Tout au coffre » : garde-fous (équipement, charmes actifs, ceinture, quête), options de conservation, coffre plein, onglets, persistance */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { Game } from '../../src/sim/game';
import { STASH_TABS } from '../../src/sim/character';
import { placeInCharmInv, placeInInventory, STASH_COLS, STASH_ROWS } from '../../src/sim/inventory';
import { generateItem } from '../../src/sim/loot/itemgen';
import { deserialize, serialize } from '../../src/sim/save';
import { countStashable, stashAllFromBag } from '../../src/sim/stash-all';
import { BASE_BY_ID } from '../../src/data/items/bases';
import type { Item, Quality } from '../../src/sim/item';
import { withoutPd2 } from '../needs-pd2';

import { RULES, type RuleTypes } from '../../src/mods/rules';

/** Carte (objet du mod qui fournit les cartes, règle `maps.make`) */
const makeMap: RuleTypes['maps.make'] = (...a) => RULES['maps.make'](...a);

const rng = new Rng('tout-au-coffre');
const mk = (base: string, q: Quality = 'normal'): Item => generateItem(rng, base, 30, { forceQuality: q });
const first = (ty: string): string => Object.values(BASE_BY_ID).find((x) => x.type === ty && !x.noRandomDrop)!.id;
const all = (g: Game): string[] =>
  [...g.character.inventory, ...g.character.charmInv, ...Object.values(g.character.equipment), ...g.character.stash.flat(), ...(g.character.mapStash ?? [])]
    .filter((x): x is Item => !!x)
    .map((x) => x.uid)
    .sort();

function setup(): { g: Game; bag: Item[]; worn: Item; charm: Item; quest: Item; key: Item; pot: Item; rune: Item; map: Item | null; gear: Item[] } {
  const g = new Game();
  g.attachShared(null);
  const c = g.character;
  const worn = mk(first('helm'), 'rare');
  c.equipment.head = worn;
  const charm = mk(first('smallcharm'), 'magic');
  expect(placeInCharmInv(c, charm)).toBeGreaterThanOrEqual(0);
  const gear = [mk(first('sword'), 'rare'), mk(first('armor'), 'magic'), mk(first('ring'), 'unique' as Quality), mk(first('amulet'), 'rare'), mk(first('boots'))];
  const quest = mk('horadric_malus');
  const key = mk('key');
  const pot = mk('hp_potion');
  const rune = mk('r08');
  rune.qty = 2;
  // carte : objet du mod pd2 (sans lui, le reste du test vaut pour la base)
  const map = withoutPd2 ? null : makeMap(rng, 2);
  const bag = [...gear, quest, key, pot, rune, ...(map ? [map] : [])];
  for (const it of bag) expect(placeInInventory(c, it)).toBeGreaterThanOrEqual(0);
  return { g, bag, worn, charm, quest, key, pot, rune, map, gear };
}
const inBag = (g: Game, it: Item) => g.character.inventory.includes(it);

describe('Tout au coffre', () => {
  it('envoie l’équipement du sac, jamais le porté / les charmes actifs / la quête ; aucun doublon ni perte', () => {
    const { g, worn, charm, quest, key, pot, rune, map, gear } = setup();
    const before = all(g);
    const r = g.stashAllBag();
    expect(all(g)).toEqual(before.filter((u) => u !== rune.uid)); // la rune devient une quantité (matériaux)
    expect(new Set(all(g)).size).toBe(all(g).length);
    expect(r.moved).toBe(gear.length + 1 + (map ? 1 : 0)); // + rune + carte
    expect(g.character.equipment.head).toBe(worn);
    expect(g.character.charmInv.includes(charm)).toBe(true);
    expect(inBag(g, quest)).toBe(true);
    expect(inBag(g, key)).toBe(true);
    expect(inBag(g, pot)).toBe(true);
    for (const it of gear) {
      expect(inBag(g, it)).toBe(false);
      expect(g.character.stash.slice(STASH_TABS).flat().includes(it)).toBe(true);
    }
    if (map) expect(g.character.mapStash).toContain(map);
    expect(g.character.materials.r08).toBe(2);
    expect(r.kept).toBe(3);
    expect(r.reasons).toEqual({ full: 0, potions: 1, utility: 1, quest: 1 });
  });

  it('ceinture : les potions de la ceinture ne bougent pas', () => {
    const { g } = setup();
    const belt = JSON.stringify(g.character.belt);
    g.stashAllBag({ keepPotions: false, keepUtility: false });
    expect(JSON.stringify(g.character.belt)).toBe(belt);
  });

  it('options de conservation : potions et clés partent si on le demande, jamais la quête', () => {
    const { g, quest, key, pot, map } = setup();
    expect(countStashable(g.character)).toBe(map ? 7 : 6);
    expect(countStashable(g.character, { keepPotions: false, keepUtility: false })).toBe(map ? 9 : 8);
    const r = g.stashAllBag({ keepPotions: false, keepUtility: true });
    expect(inBag(g, pot)).toBe(false);
    expect(inBag(g, key)).toBe(true);
    expect(inBag(g, quest)).toBe(true);
    expect(r.reasons).toMatchObject({ potions: 0, utility: 1, quest: 1 });
    const r2 = g.stashAllBag({ keepPotions: true, keepUtility: false });
    expect(inBag(g, key)).toBe(false);
    expect(g.character.materials.key).toBe(1);
    expect(inBag(g, quest)).toBe(true);
    expect(r2.moved).toBe(1);
  });

  it('coffre plein : ce qui ne tient pas reste dans le sac et est compté', () => {
    const { g, gear, rune, map } = setup();
    const c = g.character;
    // tout le coffre partagé est rempli d'objets 1 × 1
    for (const t of c.stash.slice(STASH_TABS)) {
      for (let i = 0; i < STASH_COLS * STASH_ROWS; i++) {
        const it = mk(first('ring'));
        t[i] = it;
      }
    }
    for (const t of c.stash.slice(0, STASH_TABS)) for (let i = 0; i < STASH_COLS * STASH_ROWS; i++) t[i] = mk(first('ring'));
    const before = all(g);
    const r = g.stashAllBag();
    expect(r.reasons.full).toBe(gear.length);
    expect(r.moved).toBe(map ? 2 : 1); // rune + carte, hors grille
    for (const it of gear) expect(inBag(g, it)).toBe(true);
    expect(all(g)).toEqual(before.filter((u) => u !== rune.uid));
    expect(r.kept).toBe(gear.length + 3);
    expect(g.canUndoStash()).toBe(true);
  });

  it('objets plus grands d’abord : un grand objet trouve sa place dans un coffre presque plein', () => {
    const g = new Game();
    g.attachShared(null);
    const c = g.character;
    const big = mk(first('armor'), 'rare');
    placeInInventory(c, big);
    // une page libre en tout : on remplit les autres de 1 × 1
    const pages = c.stash.slice(STASH_TABS);
    pages.slice(1).forEach((t) => {
      for (let i = 0; i < 80; i++) t[i] = mk(first('ring'));
    });
    c.stash.slice(0, STASH_TABS).forEach((t) => {
      for (let i = 0; i < 80; i++) t[i] = mk(first('ring'));
    });
    const r = g.stashAllBag();
    expect(r.moved).toBe(1);
    expect(pages[0].includes(big)).toBe(true);
  });

  it('annulation : sac, coffre, cartes et matériaux reviennent à l’état d’avant', () => {
    const { g } = setup();
    const c = g.character;
    const inv = c.inventory.map((x) => x?.uid ?? null);
    const stash = c.stash.map((p) => p.map((x) => x?.uid ?? null));
    const maps = c.mapStash?.length ?? 0;
    const mats = JSON.stringify(c.materials);
    g.stashAllBag();
    expect(g.undoStash()).toBe(true);
    expect(c.inventory.map((x) => x?.uid ?? null)).toEqual(inv);
    expect(c.stash.map((p) => p.map((x) => x?.uid ?? null))).toEqual(stash);
    expect(c.mapStash?.length ?? 0).toBe(maps);
    expect(JSON.stringify(c.materials)).toBe(mats);
    expect(g.undoStash()).toBe(false);
  });

  it('déclenche la sauvegarde (onStashOp) seulement si quelque chose a bougé', () => {
    const { g } = setup();
    let n = 0;
    g.onStashOp = () => n++;
    g.stashAllBag();
    expect(n).toBe(1);
    g.stashAllBag(); // il ne reste plus rien à envoyer
    expect(n).toBe(1);
  });

  it.skipIf(withoutPd2)('persistance : coffre partagé et personnage se rechargent sans perte ni doublon', () => {
    const { g, gear, map } = setup();
    g.stashAllBag();
    const shared = JSON.parse(JSON.stringify(g.sharedStash()));
    const save = deserialize(serialize(g.toSave()));
    const g2 = new Game(save);
    g2.attachShared(shared);
    expect(all(g2)).toEqual(all(g));
    expect(new Set(all(g2)).size).toBe(all(g2).length);
    const stashed = g2.character.stash
      .slice(STASH_TABS)
      .flat()
      .filter((x): x is Item => !!x)
      .map((x) => x.uid);
    for (const it of gear) expect(stashed).toContain(it.uid);
    expect(g2.character.mapStash?.map((x) => x.uid)).toContain(map!.uid);
    expect(g2.character.materials.r08).toBe(2);
  });

  it('sans coffre partagé (module, bots) : envoie dans les pages personnelles', () => {
    const g = new Game();
    const it = mk(first('sword'), 'rare');
    placeInInventory(g.character, it);
    const r = stashAllFromBag(g.character);
    expect(r.moved).toBe(1);
    expect(g.character.stash.flat().includes(it)).toBe(true);
  });
});
