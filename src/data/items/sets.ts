// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de Diablo II (hors licence MIT) : voir LICENSE-DATA.md et docs/DERIVED-DATA.md.
/**
 * Sets de la base : ceux de Diablo II LoD 1.13c (sets-d2.ts, régénéré depuis les MPQ par tools/vanilla/gen.ts), bonus partiels et complets.
 * Les valeurs Project Diablo 2 (patch, dont l'Anneau mortel de Bul-Kathos) sont enregistrées par le mod (mods/pd2).
 */
import type { ItemBase, SetDef, SetItemDef } from '../types';
import { D2_SETS, D2_SET_ITEMS } from './sets-d2';

/** Bases nécessaires aux sets (valeurs D2 1.13c réécrites depuis les MPQ par tools/vanilla/gen.ts, comme bases.ts) */
export const SET_BASES: ItemBase[] = [
  {
    id: 'mesh_armor',
    name: 'Armure de mailles fines',
    type: 'armor',
    tier: 1,
    qlvl: 45,
    reqLvl: 25,
    reqStr: 92,
    reqDex: 0,
    defense: [198, 213],
    maxSockets: 3,
    socketTiers: [3, 3, 3],
    icon: 'armor',
    rarity: 2,
    price: 1500,
    slot: 'body',
  },
];

export const SETS: SetDef[] = D2_SETS;
export const SET_ITEMS: SetItemDef[] = D2_SET_ITEMS;

export const SET_BY_ID: Record<string, SetDef> = Object.fromEntries(SETS.map((s) => [s.id, s]));
export const SET_ITEM_BY_ID: Record<string, SetItemDef> = Object.fromEntries(SET_ITEMS.map((s) => [s.id, s]));
