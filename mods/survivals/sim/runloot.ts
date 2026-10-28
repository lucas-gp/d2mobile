/**
 * The loot of a run (lot 293, the owner's note: "an unlimited temporary storage during a run, moved to the inventory at its end; a full
 * inventory leaves the surplus in temporary pages; no new run until the surplus is emptied enough; selling straight from the inventory, with
 * no merchant"). During a run of the Run mode, an item walked over that is not worn at once (no clearly better slot) is kept apart, with
 * no limit, in the run's loot (`svLoot`, on the character: it is saved with it, so a resumed run keeps it); the class's magic items are
 * kept too (no longer turned into gold: the player sells what he does not want, a fifth of the shop's price). At the run's end, on a death
 * too, the loot goes to the bag; what does not fit stays in the temporary pages (`svPages`), shown by the hub's shop (its Bag tab: sell,
 * or move to the bag once there is room). A new run waits while more than `RUN_LOOT.pagesMax` items are left there.
 */
import { addToCharacter, BASE_BY_ID, classCanUse, type CharacterState, type Game, type Item } from '../../../src/mods/sdk';

export const RUN_LOOT = {
  /** Items the temporary pages may still hold when a new run starts */
  pagesMax: 10,
};

type Holder = CharacterState & { svLoot?: Item[]; svPages?: Item[] };

/** The loot of the run in progress (kept apart, no limit) */
export function runLoot(c: CharacterState): Item[] {
  const h = c as Holder;
  return (h.svLoot ??= []);
}

/** The temporary pages: what did not fit in the bag at a run's end */
export function lootPages(c: CharacterState): Item[] {
  const h = c as Holder;
  return (h.svPages ??= []);
}

/** May a new run start? (the temporary pages emptied enough) */
export function pagesBlockRun(c: CharacterState): boolean {
  return lootPages(c).length > RUN_LOOT.pagesMax;
}

/** Is an item of a run kept apart (worth a look), rather than turned into gold: the class's equipment, magic or better */
export function worthKeeping(c: CharacterState, item: Item): boolean {
  const b = BASE_BY_ID[item.base];
  if (!b?.slot || !classCanUse(b, c.classId)) return false;
  return item.quality === 'magic' || item.quality === 'rare' || item.quality === 'set' || item.quality === 'unique' || item.quality === 'crafted';
}

/**
 * An item of the run kept: in the bag at once while it has room (lot 300, owner: "the items picked up do not show in the inventory opened
 * during the run": they were all kept apart until the run's end), apart in the run's loot beyond (no limit, to the bag or the pages at the
 * run's end; the pause lists them). Returns where it went
 */
export function keepInRun(c: CharacterState, item: Item): 'bag' | 'apart' {
  if (addToCharacter(c, item)) return 'bag';
  runLoot(c).push(item);
  return 'apart';
}

/** The run's end: its loot to the bag, the surplus to the temporary pages. Returns how many went to the bag and to the pages */
export function settleRunLoot(c: CharacterState): { bag: number; pages: number } {
  const loot = runLoot(c);
  let bag = 0;
  let pages = 0;
  for (const it of loot) {
    if (addToCharacter(c, it)) bag++;
    else {
      lootPages(c).push(it);
      pages++;
    }
  }
  loot.length = 0;
  return { bag, pages };
}

/** Moves item `i` of the temporary pages to the bag (false: no room) */
export function pageToBag(c: CharacterState, i: number): boolean {
  const pages = lootPages(c);
  const it = pages[i];
  if (!it || !addToCharacter(c, it)) return false;
  pages.splice(i, 1);
  return true;
}

/** Sells item `i` of the temporary pages (the shop's sale price, to the base's buy-back) */
export function sellFromPages(g: Game, i: number): number {
  const pages = lootPages(g.character);
  const it = pages[i];
  if (!it) return 0;
  const price = g.sellPrice(it);
  pages.splice(i, 1);
  g.character.gold += price;
  g.buyback.unshift({ item: it, price });
  if (g.buyback.length > 24) g.buyback.length = 24;
  return price;
}
