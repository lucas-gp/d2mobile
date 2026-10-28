/**
 * Sertissage : runes et gemmes (onglet matériaux) ou joyaux (inventaire) dans les châsses
 * libres d'un objet. Mots runiques (D2/PD2) : base normale ou supérieure, sans affixe,
 * châsses EXACTEMENT remplies par les bonnes runes DANS L'ORDRE, type d'objet autorisé ;
 * les valeurs à fourchette sont tirées à la formation.
 */
import type { Rng } from '../core/rng';
import { BASE_BY_ID } from '../data/items/bases';
import { RUNEWORDS, runewordFits } from '../data/items/index';
import type { CharacterState } from './character-state';
import { matTake } from './materials';
import type { Item } from './item';
import { baseOf } from './itemstats';
import { makeStack, rollValues } from './loot/itemgen';

export interface SocketResult {
  ok: boolean;
  reason?: string;
  /** Mot runique formé */
  runeword?: string;
}

export function freeSockets(item: Item): number {
  return Math.max(0, item.sockets - item.socketed.length);
}

/** Peut-on sertir ce matériau (id de base) ou ce joyau dans l'objet ? */
export function canSocket(item: Item, fillerBase: string): { ok: boolean; reason?: string } {
  const b = baseOf(item);
  if (!b.slot) return { ok: false, reason: 'Cet objet n’a pas de châsse' };
  if (freeSockets(item) <= 0) return { ok: false, reason: 'Aucune châsse libre' };
  if (item.runeword) return { ok: false, reason: 'Mot runique déjà formé' };
  const fb = BASE_BY_ID[fillerBase];
  if (!fb || !(fb.type === 'rune' || fb.type === 'gem' || fb.type === 'jewel')) return { ok: false, reason: 'Ne se sertit pas' };
  return { ok: true };
}

/** Mot runique correspondant exactement aux runes serties (ou rien) */
export function matchRuneword(item: Item): string | null {
  if (item.quality !== 'normal' && item.quality !== 'superior') return null;
  if (item.socketed.length !== item.sockets || item.sockets === 0) return null;
  const seq = item.socketed.map((s) => s.base);
  const b = baseOf(item);
  const rw = RUNEWORDS.find((r) => r.runes.length === seq.length && r.runes.every((id, i) => id === seq[i]) && runewordFits(r, b));
  return rw?.id ?? null;
}

/**
 * Sertit un matériau (rune/gemme de l'onglet matériaux) ou un joyau de l'inventaire.
 * Atomique : rien n'est consommé si le sertissage est refusé.
 */
export function socketItem(c: CharacterState, rng: Rng, item: Item, filler: { material: string; fromTab?: boolean } | { invIndex: number }): SocketResult {
  let gem: Item;
  if ('material' in filler) {
    const check = canSocket(item, filler.material);
    if (!check.ok) return check;
    if (!matTake(c, filler.material, 1, filler.fromTab ? 'tab' : 'visible')) return { ok: false, reason: 'Vous n’en avez pas' };
    gem = makeStack(rng, filler.material, 1);
  } else {
    const j = c.inventory[filler.invIndex];
    if (!j) return { ok: false, reason: 'Aucun objet' };
    const check = canSocket(item, j.base);
    if (!check.ok) return check;
    c.inventory[filler.invIndex] = null;
    gem = j;
  }
  item.socketed.push(gem);
  const rw = matchRuneword(item);
  if (rw) {
    const def = RUNEWORDS.find((r) => r.id === rw)!;
    item.quality = 'runeword';
    item.runeword = rw;
    item.rolls = rollValues(rng, def.mods);
    return { ok: true, runeword: rw };
  }
  return { ok: true };
}
