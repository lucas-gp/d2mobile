// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Tables de butin propres à Project Diablo 2, lues par les règles du mod (sim/pandemonium.ts : `loot.ref`, `loot.noDropPlayers`) ; autrefois
 * dans src/data/treasure.ts. Les valeurs PD2 des classes de trésor de la base (Diablo II) sont un patch (treasure.patch.ts).
 */
import type { TcEntry } from '../../../src/mods/api';

/** Nombre de joueurs équivalent pour le NoDrop (PD2 solo ≈ vanilla p5) */
export const NODROP_PLAYERS = 5;

/** Poids « junk » : potions (et objets divers PD2 : éclats de Pierre-Monde, pièces d'énigme) */
export const JUNK_TC: TcEntry[] = [
  { ref: 'potion', weight: 12 },
  { ref: 'misc', weight: 4 },
];

/** Objets divers PD2 (poids relatifs, dans « misc ») */
export const MISC_TC: TcEntry[] = [
  { ref: 'key', weight: 30 },
  { ref: 'worldstone_shard', weight: 6 },
  { ref: 'puzzlepiece', weight: 1 },
];
