// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de Diablo II (hors licence MIT) : voir LICENSE-DATA.md et docs/DERIVED-DATA.md.
/**
 * Objets uniques de la base : ceux de Diablo II LoD 1.13c (uniques-d2.ts, régénéré depuis les MPQ par tools/vanilla/gen.ts). Les valeurs
 * Project Diablo 2 (patch) et les uniques propres à PD2 sont enregistrés par le mod (mods/pd2).
 */
import type { ItemBase, UniqueDef } from '../types';
import { D2_UNIQUES } from './uniques-d2';

/** Bases supplémentaires nécessaires aux uniques et sets (valeurs D2 1.13c réécrites depuis les MPQ par tools/vanilla/gen.ts, comme bases.ts) */
export const EXTRA_BASES: ItemBase[] = [
  {
    id: 'serpentskin_armor',
    name: 'Armure en peau de serpent',
    type: 'armor',
    tier: 1,
    qlvl: 36,
    reqLvl: 24,
    reqStr: 43,
    reqDex: 0,
    defense: [111, 126],
    maxSockets: 2,
    socketTiers: [2, 2, 2],
    icon: 'armor',
    rarity: 3,
    price: 2000,
    slot: 'body',
  },
  {
    id: 'lacquered_plate',
    name: 'Harnois laqué',
    type: 'armor',
    tier: 2,
    qlvl: 82,
    reqLvl: 62,
    reqStr: 208,
    reqDex: 0,
    defense: [433, 541],
    maxSockets: 4,
    socketTiers: [3, 4, 4],
    icon: 'armor',
    rarity: 2,
    price: 6000,
    slot: 'body',
  },
  {
    id: 'mesh_belt',
    name: 'Ceinture de mailles fines',
    type: 'belt',
    tier: 1,
    qlvl: 43,
    reqLvl: 25,
    reqStr: 58,
    reqDex: 0,
    defense: [35, 40],
    maxSockets: 0,
    icon: 'belt',
    rarity: 2,
    price: 3000,
    slot: 'belt',
  },
  {
    id: 'battle_boots',
    name: 'Bottes de bataille',
    type: 'boots',
    tier: 1,
    qlvl: 49,
    reqLvl: 25,
    reqStr: 95,
    reqDex: 0,
    defense: [39, 47],
    maxSockets: 0,
    icon: 'boots',
    rarity: 3,
    price: 2500,
    slot: 'boots',
  },
  {
    id: 'spired_helm',
    name: 'Heaume à flèche',
    type: 'helm',
    tier: 2,
    qlvl: 79,
    reqLvl: 59,
    reqStr: 192,
    reqDex: 0,
    defense: [114, 159],
    maxSockets: 3,
    socketTiers: [2, 2, 3],
    icon: 'helm',
    rarity: 2,
    price: 5000,
    slot: 'head',
  },
  {
    id: 'bone_knife',
    name: "Couteau d'os",
    type: 'dagger',
    tier: 2,
    qlvl: 58,
    reqLvl: 43,
    reqStr: 38,
    reqDex: 75,
    dmg: [23, 49],
    maxSockets: 1,
    socketTiers: [1, 1, 1],
    icon: 'dagger',
    rarity: 2,
    price: 3000,
    slot: 'mainhand',
  },
];

/** Uniques de la base ; ceux de Project Diablo 2 (dont charmes de brisure et carquois) sont ajoutés par le mod (mods/pd2) */
export const UNIQUES: UniqueDef[] = [...D2_UNIQUES];

export const UNIQUE_BY_ID: Record<string, UniqueDef> = Object.fromEntries(UNIQUES.map((u) => [u.id, u]));
