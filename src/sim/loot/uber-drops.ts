/**
 * Butin de la base hors des classes de trésor : Diablo II LoD 1.13c (lot M10e), implémentation de la règle `runs.extraDrops`
 * (src/mods/rules.ts, `provideBaseRule`). La Torche du feu de l'enfer n'est dans aucune classe de trésor : le jeu la donne quand les trois
 * maux primordiaux de Tristram pandémoniaque sont morts (D2MOO, QuestsFX.cpp : un drapeau de mort par uber, puis un charme « cm2 » unique au
 * pied du dernier ; l'Étendard des Héros qui l'accompagne n'existe pas dans le jeu). Clés, organes et Annihilus viennent des classes de
 * trésor (src/data/treasure.ts). Le mod pd2 remplace la règle par son propre butin (mods/pd2/sim/pandemonium.ts).
 */
import { provideBaseRule } from '../../mods/rules';
import type { Monster } from '../actors';
import type { Item } from '../item';
import type { World } from '../world';
import { generateItem } from './itemgen';

/** Maux primordiaux de Tristram pandémoniaque */
const TRISTRAM_UBERS = ['uber_mephisto', 'uber_diablo', 'uber_baal'];

/** Torche du feu de l'enfer sur le dernier des trois maux primordiaux de Tristram pandémoniaque à tomber */
export function d2ExtraDrops(w: World, m: Monster): Item[] {
  if (m.rank !== 'boss' || !TRISTRAM_UBERS.includes(m.def.id)) return [];
  const others = w.monsters.some((o) => o !== m && !o.dead && TRISTRAM_UBERS.includes(o.def.id));
  const pending = w.pendingSpawns.some((p) => TRISTRAM_UBERS.includes(w.zone.spawns[p.idx]?.monster ?? ''));
  if (others || pending) return [];
  return [generateItem(w.rng.loot, 'large_charm', m.mlvl, { forceUniqueId: 'u_hellfire_torch' })];
}

provideBaseRule('runs.extraDrops', d2ExtraDrops);
