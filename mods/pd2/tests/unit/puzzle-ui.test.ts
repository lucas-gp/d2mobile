// @vitest-environment happy-dom
/**
 * Énigme de Larzuk dans le mod (lot M12b) : fabrication directe de la boîte à énigme depuis le menu « Artisanat » (point d'insertion
 * `item.socketActions`), mêmes règles qu'avant le déplacement (10 pièces, ville seulement, puis utilisable sur un unique) ; plafond de
 * châsses des recettes de l'énigme (règle `cube.socketCap`).
 */
import { describe, expect, it, vi } from 'vitest';
import { Rng } from '../../../../src/core/rng';
import { Game } from '../../../../src/sim/game';
import { addSocketsCheck } from '../../../../src/sim/cube';
import { generateItem } from '../../../../src/sim/loot/itemgen';
import { BASE_BY_ID } from '../../../../src/data/items/bases';
import { RULES } from '../../../../src/mods/rules';
import { uiOwners } from '../../../../src/mods/ui';
import { Panels } from '../../../../src/ui/panels';
import type { PanelHost } from '../../../../src/ui/panels-shared';
import { craftPuzzleBox } from '../../ui/puzzle';

function unique(g: Game) {
  const c = g.character;
  c.inventory.fill(null);
  const item = generateItem(new Rng('pb'), 'plate_mail', 80, { forceQuality: 'unique' });
  item.sockets = 0;
  item.socketed = [];
  c.inventory[0] = item;
  return item;
}

describe('Boîte à énigme : fabrication directe', () => {
  it('10 pièces → 1 boîte, refus en dessous, ville seulement, puis utilisable sur un unique', () => {
    const g = new Game(undefined, 'sorceress');
    const c = g.character;
    c.materials.puzzlepiece = 9;
    expect(craftPuzzleBox(c, true).ok).toBe(false);
    expect(c.materials.puzzlepiece).toBe(9);
    c.materials.puzzlepiece = 12;
    const item = unique(g);
    expect(addSocketsCheck(c, item, 'sock_puzzlebox').ok).toBe(false);
    expect(craftPuzzleBox(c, false)).toEqual({ ok: false, reason: 'À faire en ville' });
    const r = craftPuzzleBox(c, true);
    expect(r.ok).toBe(true);
    expect(c.materials.puzzlepiece).toBe(2);
    expect(c.materials.puzzlebox).toBe(1);
    expect(addSocketsCheck(c, item, 'sock_puzzlebox').ok).toBe(true);
  });

  it('menu « Artisanat » : ligne du mod après Larzuk, grisée hors de la ville, fabrique en ville', () => {
    expect(uiOwners('item.socketActions')).toContain('pd2');
    Game.resetIds();
    const g = new Game(undefined, 'sorceress');
    g.enterTown();
    const item = unique(g);
    const host = { game: () => g, close: vi.fn(), haptic: vi.fn(), itemSound: vi.fn(), message: vi.fn() } as unknown as PanelHost;
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const p = new Panels(root, host);
    // sans pièce ni boîte : pas de ligne
    expect(p.socketEntries(g, item, { from: 'inv', idx: 0 }).some((e) => e.id === 'craft-puzzlebox')).toBe(false);
    g.character.materials.puzzlepiece = 10;
    let e = p.socketEntries(g, item, { from: 'inv', idx: 0 }).find((x) => x.id === 'craft-puzzlebox')!;
    expect(e).toMatchObject({ ok: true, right: '10/10', note: 'Coût : 10 × Pièce d’énigme de Larzuk' });
    const ids = p.socketEntries(g, item, { from: 'inv', idx: 0 }).map((x) => x.id);
    expect(ids.indexOf('craft-puzzlebox')).toBeLessThan(ids.indexOf('sock-sock_puzzlebox'));
    e.run();
    expect(g.character.materials.puzzlebox).toBe(1);
    expect(host.message).toHaveBeenCalledWith('Fabriqué : Boîte à énigme de Larzuk', '#e8b04a');
    g.character.materials.puzzlepiece = 10;
    g.mode = 'run';
    e = p.socketEntries(g, item, { from: 'inv', idx: 0 }).find((x) => x.id === 'craft-puzzlebox')!;
    expect(e).toMatchObject({ ok: false, reason: 'À faire en ville' });
    e.run();
    expect(host.haptic).toHaveBeenCalledWith('fail');
    expect(g.character.materials.puzzlebox).toBe(1);
  });

  it('plafond de châsses : maximum de la base pour l’énigme, niveau de l’objet sinon', () => {
    const b = BASE_BY_ID.plate_mail;
    expect(RULES['cube.socketCap']('sock_puzzlebox', b, 1)).toBe(b.maxSockets);
    expect(RULES['cube.socketCap']('sock_puzzlepiece', b, 2)).toBe(b.maxSockets);
    expect(RULES['cube.socketCap']('sock_armor', b, 2)).toBe(2);
  });
});
