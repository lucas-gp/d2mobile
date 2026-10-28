/** Objets de quête de Diablo II (Malus, Bâton des Rois, reliques de Khalim…) : une case, invendables (prix nul), jamais tirés au hasard. */
import type { ItemBase } from '../types';
import { QUEST_ITEMS } from '../quests';

export const QUEST_BASES: ItemBase[] = QUEST_ITEMS.map((q) => ({
  id: q.id,
  name: q.name,
  type: 'currency',
  tier: 0,
  qlvl: 1,
  reqLvl: 1,
  reqStr: 0,
  reqDex: 0,
  maxSockets: 0,
  icon: 'token',
  rarity: 1,
  stack: 1,
  price: 0,
  noRandomDrop: true,
}));
