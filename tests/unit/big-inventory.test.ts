/** Grand inventaire (réglage bigInventory) : 10 × 8 cases, défaut neutre 10 × 4, aller-retours sans perte */
import { afterEach, describe, expect, it } from 'vitest';
import { newCharacter } from '../../src/sim/character';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { Game } from '../../src/sim/game';
import { APP_SETTINGS_DEFAULTS, withDefaultSettings, migrate } from '../../src/sim/save';
import type { Item } from '../../src/sim/item';
import { INV_COLS, INV_ROWS, addToCharacter, findSlot, hasRoomFor, setInventoryRows, resizeInventory, sortInventory, occupancy } from '../../src/sim/inventory';

const make = (id: string, n = 0) => generateItem(new Rng(`big:${id}:${n}`), id, 30, { forceQuality: 'normal' });
const count = (g: Game) => g.character.inventory.filter(Boolean).length + g.character.stash.reduce((a, t) => a + t.filter(Boolean).length, 0);
const fillInv = (c: ReturnType<typeof newCharacter>, n: number, id = 'ring') => {
  let k = 0;
  for (; k < n; k++) if (!addToCharacter(c, make(id, k))) break;
  return k;
};

afterEach(() => {
  setInventoryRows(4);
});

describe('grand inventaire', () => {
  it('défaut neutre : module et tests gardent 10 × 4 = 40 cases ; l’application passe à 80', () => {
    expect(withDefaultSettings().bigInventory).toBeUndefined();
    expect(APP_SETTINGS_DEFAULTS.bigInventory).toBe(true);
    expect(withDefaultSettings(undefined, true).bigInventory).toBe(true);
    const g = new Game();
    expect(INV_ROWS).toBe(4);
    expect(g.character.inventory.length).toBe(40);
    const app = new Game(undefined, 'sorceress', true);
    expect(INV_ROWS).toBe(8);
    expect(app.character.inventory.length).toBe(INV_COLS * 8);
    const neutral = new Game();
    expect(INV_ROWS).toBe(4);
    expect(neutral.character.inventory.length).toBe(40);
  });

  it('placement dans les rangées 5 à 8, plein à 40 puis à 80', () => {
    const c = newCharacter(undefined, 'sorceress');
    expect(fillInv(c, 100)).toBe(40);
    expect(hasRoomFor(c, make('ring', 999))).toBe(false);
    setInventoryRows(8);
    expect(resizeInventory(c, 8)).toBe(true);
    expect(c.inventory.length).toBe(80);
    expect(findSlot(c, make('ring', 998))).toBe(40);
    expect(fillInv(c, 100)).toBe(40);
    expect(c.inventory.filter(Boolean).length).toBe(80);
    expect(addToCharacter(c, make('ring', 997))).toBe(false);
    // un objet haut (1 × 4) tient dans les rangées du bas
    const d = newCharacter(undefined, 'sorceress');
    setInventoryRows(8);
    resizeInventory(d, 8);
    for (let k = 0; k < INV_COLS * 4 - 0; k++) d.inventory[k] = make('ring', k + 500);
    expect(addToCharacter(d, make('long_staff'))).toBe(true);
    expect(d.inventory.findIndex((x) => x?.base === 'long_staff')).toBeGreaterThanOrEqual(40);
    const occ = occupancy(d);
    expect(occ.length).toBe(80);
  });

  it('ancienne sauvegarde de 40 cases : étendue à 80 par l’application, objets inchangés', () => {
    const g0 = new Game();
    fillInv(g0.character, 12, 'ring');
    const before = g0.character.inventory.slice();
    const save = JSON.parse(JSON.stringify(g0.toSave()));
    delete save.settings.bigInventory;
    const s = migrate(save);
    const app = new Game(s, 'sorceress', true);
    expect(app.character.inventory.length).toBe(80);
    app.character.inventory.slice(0, 40).forEach((it, i) => expect(it?.uid).toBe(before[i]?.uid));
    expect(app.character.inventory.slice(40).every((x) => x === null)).toBe(true);
  });

  it('désactivation : les objets des rangées 5 à 8 sont repliés sans perte, allers-retours', () => {
    const g = new Game(undefined, 'sorceress', true);
    expect(g.settings.bigInventory).toBe(true);
    // 10 objets en bas, 10 en haut
    for (let k = 0; k < 10; k++) {
      g.character.inventory[k] = make('ring', k);
      g.character.inventory[40 + k] = make('amulet', k);
    }
    const total = count(g);
    expect(g.setBigInventory(false)).toBe(true);
    expect(INV_ROWS).toBe(4);
    expect(g.character.inventory.length).toBe(40);
    expect(count(g)).toBe(total);
    expect(g.character.inventory.filter(Boolean).length).toBe(20);
    expect(g.setBigInventory(true)).toBe(true);
    expect(g.character.inventory.length).toBe(80);
    expect(count(g)).toBe(total);
  });

  it('désactivation avec sac plein : repli dans le coffre, sinon refus sans perte', () => {
    const g = new Game(undefined, 'sorceress', true);
    const c = g.character;
    // haut plein, bas : 5 objets
    for (let k = 0; k < 40; k++) c.inventory[k] = make('ring', k);
    for (let k = 0; k < 5; k++) c.inventory[40 + k] = make('amulet', k);
    const stashBefore = c.stash.reduce((a, t) => a + t.filter(Boolean).length, 0);
    expect(g.setBigInventory(false)).toBe(true);
    const stashAfter = c.stash.reduce((a, t) => a + t.filter(Boolean).length, 0);
    expect(stashAfter - stashBefore).toBe(5);
    expect(c.inventory.filter(Boolean).length).toBe(40);

    // refus : plus de place nulle part
    const h = new Game(undefined, 'sorceress', true);
    const d = h.character;
    for (let k = 0; k < 40; k++) d.inventory[k] = make('ring', k);
    for (let k = 0; k < 5; k++) d.inventory[40 + k] = make('amulet', k);
    for (const t of d.stash) for (let i = 0; i < t.length; i++) t[i] = make('ring', 1000 + i);
    const snap = d.inventory.slice();
    const total = count(h);
    expect(h.setBigInventory(false)).toBe(false);
    expect(h.settings.bigInventory).toBe(true);
    expect(INV_ROWS).toBe(8);
    expect(count(h)).toBe(total);
    expect(d.inventory.slice(0, 80).map((x) => x?.uid ?? null)).toEqual(snap.slice(0, 80).map((x) => x?.uid ?? null));
  });

  it('sauvegarde de 80 cases chargée sans l’option : aucun objet perdu', () => {
    const g = new Game(undefined, 'sorceress', true);
    for (let k = 0; k < 80; k++) g.character.inventory[k] = make('ring', k);
    const save = JSON.parse(JSON.stringify(g.toSave()));
    save.settings.bigInventory = false;
    const ids = new Set<string>(save.character.inventory.map((i: Item) => i.uid));
    const neutral = new Game(migrate(save));
    const c = neutral.character;
    const found = new Set<string>();
    for (const it of c.inventory) if (it) found.add(it.uid);
    for (const t of c.stash) for (const it of t) if (it) found.add(it.uid);
    expect(found.size).toBe(ids.size);
    // l'inventaire neutre s'agrandit de nouveau sans perte
    neutral.settings.bigInventory = true;
    expect(neutral.applyInventorySize()).toBe(true);
    const again = new Set<string>();
    for (const it of neutral.character.inventory) if (it) again.add(it.uid);
    for (const t of neutral.character.stash) for (const it of t) if (it) again.add(it.uid);
    expect(again.size).toBe(ids.size);
  });

  it('tri : le sac de 80 cases se compacte dans la grille de 80', () => {
    const g = new Game(undefined, 'sorceress', true);
    for (let k = 0; k < 60; k++) g.character.inventory[k + 10] = make('ring', k);
    g.sortInventory();
    expect(g.character.inventory.length).toBe(80);
    expect(g.character.inventory.filter(Boolean).length).toBe(60);
    sortInventory(g.character);
  });
});
