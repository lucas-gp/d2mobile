import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../../src/sim/game';
import { deserialize, mergeShared, migrate, serialize, type SaveData, type SharedStash } from '../../src/sim/save';
import { quarantineSave, quarantineShared, orphanReason } from '../../src/sim/save-orphans';
import { parseImportedSave } from '../../src/sim/save-check';
import { computeDerived } from '../../src/sim/character';
import { itemName } from '../../src/sim/itemstats';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import type { Item } from '../../src/sim/item';

/** Quarantaine `orphans[]` : une base inconnue ne fait plus planter le chargement (`baseOf` : « Base inconnue ») */
const v6 = (): SaveData => migrate(JSON.parse(readFileSync(new URL('./fixtures/saves/v6.json', import.meta.url), 'utf8')));
const rng = new Rng('orphans');
const unknown = (): Item => ({ ...generateItem(rng, 'cap', 20, { forceQuality: 'magic' }), base: 'pd9:casque_disparu' });
const reload = (s: SaveData): SaveData => deserialize(serialize(s));

describe('Quarantaine des objets illisibles', () => {
  it('sauvegarde valide : aucune quarantaine, forme inchangée', () => {
    const s = v6();
    const text = serialize(s);
    expect(quarantineSave(s)).toBe(0);
    expect('orphans' in s).toBe(false);
    expect(serialize(s)).toBe(text);
    expect('orphans' in new Game(reload(s)).toSave()).toBe(false);
  });

  it('avant : la base inconnue plantait le chargement ; maintenant : mise de côté, le personnage se joue', () => {
    const s = v6();
    const bad = unknown();
    s.character.equipment.head = bad;
    const raw = migrate(JSON.parse(serialize(s)));
    expect(() => computeDerived(new Game(raw).character, 0)).toThrow(/Base inconnue/);
    const loaded = reload(s);
    expect(loaded.character.equipment.head).toBeUndefined();
    expect(loaded.orphans).toEqual([{ where: 'equipment.head', reason: 'base inconnue : pd9:casque_disparu', item: bad }]);
    const g = new Game(loaded);
    expect(computeDerived(g.character, 0).lifeMax).toBeGreaterThan(0);
    for (const it of g.character.inventory) if (it) expect(itemName(it)).toBeTruthy();
  });

  it('chaque emplacement : sac, charmes, cube, coffre, coffre de cartes, mercenaire, châsse, sol, carte en cours', () => {
    const s = v6();
    const c = s.character;
    c.inventory[10] = unknown();
    c.charmInv[5] = unknown();
    c.cube[2] = unknown();
    c.stash[2][7] = unknown();
    c.mapStash = [generateItem(rng, 'cap', 5), unknown()];
    c.merc = { type: 'rogue', variant: 'fire', name: 'Aliza', dead: false, equipment: { head: unknown(), body: generateItem(rng, 'quilted_armor', 5) } };
    c.equipment.body = { ...generateItem(rng, 'quilted_armor', 30, { forceQuality: 'normal' }), sockets: 1, socketed: [unknown()] };
    const ground = { item: unknown(), x: 1, y: 2 };
    s.run = { runId: 'map', difficulty: 0, seed: 1, mapItem: unknown(), world: { items: [{ item: generateItem(rng, 'cap', 5), x: 0, y: 0 }, ground] } } as unknown as SaveData['run'];
    const loaded = reload(s);
    expect(loaded.orphans!.map((o) => o.where).sort()).toEqual(['charmInv', 'cube', 'equipment.body', 'inventory', 'mapStash', 'merc.head', 'run.ground', 'run.mapItem', 'stash.2'].sort());
    expect(loaded.orphans!.find((o) => o.where === 'equipment.body')!.reason).toBe('châsse : base inconnue : pd9:casque_disparu');
    expect(loaded.orphans!.find((o) => o.where === 'run.ground')!.item).toEqual(ground);
    expect(loaded.character.mapStash!.length).toBe(1);
    expect(loaded.character.merc!.equipment.body).toBeTruthy();
    expect(loaded.character.inventory[0]?.base).toBe('kriss');
    expect(new Game(loaded).character.name).toBe('Fixture');
  });

  it('la quarantaine est réécrite et rechargée sans doublon', () => {
    const s = v6();
    s.character.inventory[10] = unknown();
    const g = new Game(reload(s));
    expect(g.orphans.length).toBe(1);
    const again = reload(g.toSave());
    expect(again.orphans!.length).toBe(1);
    expect(new Game(again).orphans).toEqual(g.orphans);
  });

  it('coffre partagé : quarantaine, conservée par le jeu et par la fusion de synchronisation', () => {
    const tabs: (Item | null)[][] = Array.from({ length: 12 }, () => new Array(80).fill(null));
    tabs[0][0] = generateItem(rng, 'cap', 5);
    tabs[3][9] = unknown();
    const shared: SharedStash = { version: 1, tabs };
    expect(quarantineShared(shared)).toBe(1);
    expect(shared.orphans![0].where).toBe('shared.3');
    const g = new Game(v6());
    g.attachShared(shared);
    expect(g.sharedStash()!.orphans).toEqual(shared.orphans);
    const other = { version: 1 as const, tabs: [new Array(80).fill(null)], orphans: [{ where: 'shared.0', reason: 'base inconnue : x', item: { base: 'x' } }] };
    const { merged } = mergeShared(g.sharedStash()!, other);
    expect(merged.orphans!.length).toBe(2);
    expect(mergeShared(merged, merged).merged.orphans!.length).toBe(2);
    expect('orphans' in mergeShared({ version: 1, tabs: [] }, { version: 1, tabs: [] }).merged).toBe(false);
  });

  it('import de fichier : toujours refusé (pas de quarantaine pour une sauvegarde choisie par le joueur)', () => {
    const s = v6();
    delete s.savedAt; // comme un fichier exporté (Game.toSave n'a pas de date)
    s.character.inventory[10] = unknown();
    expect(() => parseImportedSave(serialize(s))).toThrow(/objet invalide/);
  });

  it('raisons', () => {
    expect(orphanReason(null)).toBe('pas un objet');
    expect(orphanReason({ base: 'cap', socketed: 3 })).toBe('châsses illisibles');
    const noSockets: Record<string, unknown> = { base: 'cap' };
    expect(orphanReason(noSockets)).toBeNull();
    expect(noSockets.socketed).toEqual([]);
  });
});
