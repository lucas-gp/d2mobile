/**
 * « Tout au coffre » : envoie le contenu du sac vers le coffre, avec des garde-fous.
 * Jamais déplacés : l'équipement porté, l'inventaire des charmes (actifs), la ceinture, les objets de quête.
 * Gardés par défaut dans le sac : potions, clés / tomes de portail. Ce qui ne tient pas reste dans le sac et est compté.
 */
import { BASE_BY_ID } from '../data/items/bases';
import { QUEST_ITEM_IDS } from '../data/quests';
import type { CharacterState } from './character-state';
import type { Item } from './item';
import { addMapToStash } from './mapstash';
import { hasRoomInStash, isMaterial, itemSize, placeInStash, stashOrder } from './inventory';
import { isThrowPotion } from './throwpotion';

export interface StashAllOptions {
  /** Garder les potions du sac (défaut : oui) */
  keepPotions?: boolean;
  /** Garder les clés, tomes de portail et parchemins (défaut : oui) */
  keepUtility?: boolean;
}

export interface StashAllResult {
  /** Objets (cases du sac) envoyés au coffre, cartes et matériaux compris */
  moved: number;
  /** Objets restés dans le sac */
  kept: number;
  /** Raisons de ce qui reste : full (coffre plein), potions, utility, quest */
  reasons: { full: number; potions: number; utility: number; quest: number };
}

const isUtility = (id: string): boolean => id === 'key' || id.startsWith('key_') || id === 'tome_portal' || id.includes('scroll');
const isPotion = (id: string): boolean => BASE_BY_ID[id]?.type === 'potion' || isThrowPotion(id);

type Verdict = 'stash' | 'potions' | 'utility' | 'quest';

function verdict(it: Item, o: Required<StashAllOptions>): Verdict {
  if (QUEST_ITEM_IDS.has(it.base)) return 'quest';
  if (isPotion(it.base)) return o.keepPotions ? 'potions' : 'stash';
  if (isUtility(it.base)) return o.keepUtility ? 'utility' : 'stash';
  return 'stash';
}

/** Nombre d'objets du sac que « Tout au coffre » enverrait (sans tenir compte de la place) */
export function countStashable(c: CharacterState, opts: StashAllOptions = {}): number {
  const o = { keepPotions: opts.keepPotions ?? true, keepUtility: opts.keepUtility ?? true };
  let n = 0;
  for (const it of c.inventory) if (it && verdict(it, o) === 'stash') n++;
  return n;
}

export function stashAllFromBag(c: CharacterState, opts: StashAllOptions = {}): StashAllResult {
  const o = { keepPotions: opts.keepPotions ?? true, keepUtility: opts.keepUtility ?? true };
  const res: StashAllResult = { moved: 0, kept: 0, reasons: { full: 0, potions: 0, utility: 0, quest: 0 } };
  const entries: { it: Item; i: number }[] = [];
  c.inventory.forEach((it, i) => {
    if (it) entries.push({ it, i });
  });
  // les plus grands d'abord : ils trouvent plus facilement leur place
  entries.sort((a, b) => itemSize(b.it)[0] * itemSize(b.it)[1] - itemSize(a.it)[0] * itemSize(a.it)[1] || a.i - b.i);
  const pages = stashOrder(c).map((i) => c.stash[i]);
  for (const { it, i } of entries) {
    const v = verdict(it, o);
    if (v !== 'stash') {
      res.kept++;
      res.reasons[v]++;
      continue;
    }
    let done = false;
    if (it.map) done = addMapToStash(c, it);
    else if (isMaterial(it)) {
      c.materials[it.base] = (c.materials[it.base] ?? 0) + (it.qty ?? 1);
      done = true;
    } else {
      const t = pages.find((p) => hasRoomInStash(p, it));
      if (t) done = placeInStash(t, it) >= 0;
    }
    if (done) {
      c.inventory[i] = null;
      res.moved++;
    } else {
      res.kept++;
      res.reasons.full++;
    }
  }
  return res;
}
