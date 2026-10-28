/** Inventaire des charmes (PD2) : grille 10 × 4, charmes actifs sans prendre de place dans le sac. */
import { describe, expect, it } from 'vitest';
import { Game } from '../../src/sim/game';
import { generateItem } from '../../src/sim/loot/itemgen';
import { Rng } from '../../src/core/rng';
import { computeDerived, activeItems, CHARM_COLS, CHARM_ROWS } from '../../src/sim/character';
import { addToCharacter, moveItem, placeInCharmInv, placeInInventory, sortInventory, stowCharm } from '../../src/sim/inventory';
import { migrate, SAVE_VERSION } from '../../src/sim/save';
import type { Item } from '../../src/sim/item';

const charm = (base: string, life = 0, seed = 1): Item => {
  const it = generateItem(new Rng(seed), base, 30, { forceQuality: 'normal' });
  if (life) it.craftMods = [{ stat: 'life', value: life }];
  return it;
};
const life = (g: Game) => computeDerived(g.character, 0).lifeMax;

describe('Inventaire des charmes', () => {
  it('un charme de la grille est actif, une seule fois', () => {
    const g = new Game();
    const c = g.character;
    const base = life(g);
    const ch = charm('small_charm', 40);
    expect(placeInCharmInv(c, ch)).toBe(0);
    expect(life(g)).toBeGreaterThan(base);
    expect(activeItems(c).filter((x) => x === ch)).toHaveLength(1);
  });

  it('un charme resté dans le sac ordinaire est inactif (règle PD2)', () => {
    const g = new Game();
    const c = g.character;
    const base = life(g);
    placeInInventory(c, charm('small_charm', 40));
    expect(life(g)).toBe(base);
    expect(stowCharm(c, c.inventory.findIndex(Boolean))).toBe(true);
    expect(life(g)).toBeGreaterThan(base);
    expect(c.inventory.some(Boolean)).toBe(false);
  });

  it('refuse les non-charmes, y compris par glisser-déposer et échange', () => {
    const g = new Game();
    const c = g.character;
    const ring = generateItem(new Rng(2), 'ring', 20, { forceQuality: 'normal' });
    expect(placeInCharmInv(c, ring)).toBe(-1);
    placeInInventory(c, ring);
    const at = c.inventory.findIndex(Boolean);
    expect(moveItem(c, { grid: 'inv' }, at, { grid: 'charm' }, 0)).toBe(false);
    expect(c.inventory[at]).toBe(ring);
    // échange : un charme du coffre de la grille ne peut pas être échangé contre un anneau du sac
    const ch = charm('small_charm');
    placeInCharmInv(c, ch);
    expect(moveItem(c, { grid: 'charm' }, 0, { grid: 'inv' }, at)).toBe(false);
    expect(c.charmInv[0]).toBe(ch);
    expect(c.inventory[at]).toBe(ring);
  });

  it('ramassage : la grille d’abord, puis le sac quand elle est pleine', () => {
    const g = new Game();
    const c = g.character;
    for (let i = 0; i < CHARM_COLS * CHARM_ROWS; i++) expect(addToCharacter(c, charm('small_charm', 1, i + 1))).toBe(true);
    expect(c.charmInv.filter(Boolean)).toHaveLength(40);
    expect(c.inventory.some(Boolean)).toBe(false);
    const extra = charm('small_charm', 1, 99);
    expect(addToCharacter(c, extra)).toBe(true);
    expect(c.inventory.includes(extra)).toBe(true);
    expect(activeItems(c).includes(extra)).toBe(false);
  });

  it('tailles : un grand charme couvre 1 × 3 cases, glisser sac ↔ grille', () => {
    const g = new Game();
    const c = g.character;
    const big = charm('grand_charm');
    placeInInventory(c, big);
    const at = c.inventory.indexOf(big);
    expect(g.moveItem({ grid: 'inv' }, at, { grid: 'charm' }, 5)).toBe(true);
    expect(c.charmInv[5]).toBe(big);
    expect(c.inventory.includes(big)).toBe(false);
    expect(g.moveItem({ grid: 'charm' }, 5, { grid: 'inv' }, 0)).toBe(true);
    expect(c.inventory[0]).toBe(big);
  });

  it('tri : la grille des charmes se tasse, gros charmes d’abord, rien de perdu', () => {
    const g = new Game();
    const c = g.character;
    const s = charm('small_charm', 0, 1);
    const b = charm('grand_charm', 0, 2);
    c.charmInv[7] = s;
    c.charmInv[33] = b;
    sortInventory(c);
    expect(c.charmInv[0]).toBe(b);
    expect(c.charmInv.filter(Boolean)).toHaveLength(2);
  });

  it('migration d’une ancienne sauvegarde : les charmes du sac passent dans la grille, dans l’ordre, sans perte', () => {
    const g = new Game();
    const c = g.character;
    const a = charm('small_charm', 10, 1);
    const b = charm('large_charm', 10, 2);
    const ring = generateItem(new Rng(3), 'ring', 20, { forceQuality: 'normal' });
    c.inventory[0] = a;
    c.inventory[2] = ring;
    c.inventory[4] = b;
    const save = JSON.parse(JSON.stringify(g.toSave()));
    delete save.character.charmInv;
    save.version = 5;
    save.character.inventory = JSON.parse(JSON.stringify(c.inventory));
    const m = migrate(save);
    expect(m.version).toBe(SAVE_VERSION);
    const ch = m.character.charmInv.filter(Boolean) as Item[];
    expect(ch.map((x) => x.uid)).toEqual([a.uid, b.uid]);
    expect(m.character.inventory.filter(Boolean).map((x) => x!.uid)).toEqual([ring.uid]);
  });

  it('aller-retour de sauvegarde', () => {
    const g = new Game();
    const ch = charm('small_charm', 25);
    addToCharacter(g.character, ch);
    const back = new Game(migrate(JSON.parse(JSON.stringify(g.toSave()))));
    expect(back.character.charmInv[0]?.uid).toBe(ch.uid);
    expect(life(back)).toBe(life(g));
  });
});
