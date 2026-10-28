// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/**
 * Classes de trésor (TreasureClassEx de Diablo II LoD 1.13c), dans le modèle du moteur (tools/vanilla/treasure.ts) : une TC =
 * { picks, noDrop, mods, entrées (objet, feuille du moteur ou TC, poids) }, résolue récursivement par sim/loot/drops.ts. Les TC d'équipement
 * D2 (weapN / armoN) sont générées à partir des bases (qlvl ∈ ]N−3, N], feuille `equip`). Le bloc généré est réécrit par
 * tools/vanilla/gen.ts (`npm run vanilla -- --write treasure`) depuis les MPQ du joueur ; valeurs Project Diablo 2 : patch du mod
 * (mods/pd2/data/treasure.patch.ts).
 */
import type { Difficulty } from './types';

export interface TcEntry {
  ref: string;
  weight: number;
}

export interface TreasureClass {
  id: string;
  /** > 0 : tirages indépendants ; < 0 : liste garantie (chaque entrée tirée `weight` fois) */
  picks: number;
  noDrop: number;
  mods?: { unique: number; set: number; rare: number; magic: number };
  entries: TcEntry[];
}

/* ---- généré par tools/vanilla/gen.ts (TreasureClassEx.txt, MonStats.txt, SuperUniques.txt) : ne pas modifier à la main ---- */
/** Poids de récursion des TC de runes (Runes N → Runes N−1), 1.13 */
export const RUNE_TC_RECURSION = [0, 2, 5, 7, 12, 22, 45, 90, 180, 360, 720, 1066, 1519, 2170, 2941, 3957];
export const RUNES17_ZOD = 1;
export const RUNES17_RECURSION = 5170;

/** Contenu du TC « Good » (Act 5 (H) Good : bijoux, gemmes, runes ; gemmes et runes détaillées par GOOD_GEMS et ZONE_RUNE_TC) */
export const GOOD_TC = { jewelry: 60, gems: 56, runes: 14 };
/** Contenu du TC « Jewelry » */
export const JEWELRY_TC: TcEntry[] = [
  { ref: 'ring', weight: 8 },
  { ref: 'amulet', weight: 4 },
  { ref: 'jewel', weight: 2 },
  { ref: 'small_charm', weight: 2 },
  { ref: 'large_charm', weight: 2 },
  { ref: 'grand_charm', weight: 2 },
];

/**
 * Classes de trésor par clé : rangs (structure de l'Enfer de l'Acte V), boss (clé + difficulté : TC propre de MonStats ou du super-unique),
 * TC partagées du moteur (junk, misc, magic, cpot). Objets D2 absents du jeu (entrées `d2:…`, sans objet) : Ammo, isc, tsc.
 */
export const MONSTER_TC: Record<string, TreasureClass> = {
  normal: {
    id: 'normal',
    picks: 1,
    noDrop: 100,
    entries: [
      { ref: 'gold', weight: 21 },
      { ref: 'equip', weight: 16 },
      { ref: 'junk', weight: 21 },
      { ref: 'good', weight: 2 },
    ],
  },
  caster: {
    id: 'caster',
    picks: 1,
    noDrop: 100,
    entries: [
      { ref: 'gold', weight: 18 },
      { ref: 'equip', weight: 15 },
      { ref: 'junk', weight: 18 },
      { ref: 'good', weight: 2 },
      { ref: 'magic', weight: 7 },
    ],
  },
  champion: {
    id: 'champion',
    picks: -2,
    noDrop: 0,
    entries: [
      { ref: 'citem', weight: 1 },
      { ref: 'cpot', weight: 1 },
    ],
  },
  citem: {
    id: 'citem',
    picks: 1,
    noDrop: 0,
    mods: { unique: 800, set: 800, rare: 800, magic: 1024 },
    entries: [
      { ref: 'gold125', weight: 60 },
      { ref: 'equip', weight: 37 },
      { ref: 'good', weight: 3 },
    ],
  },
  unique: {
    id: 'unique',
    picks: -3,
    noDrop: 0,
    entries: [
      { ref: 'uitem', weight: 1 },
      { ref: 'cpot', weight: 2 },
    ],
  },
  uitem: {
    id: 'uitem',
    picks: 1,
    noDrop: 0,
    mods: { unique: 800, set: 800, rare: 800, magic: 1024 },
    entries: [
      { ref: 'equip', weight: 58 },
      { ref: 'good', weight: 4 },
    ],
  },
  boss: {
    id: 'boss',
    picks: 7,
    noDrop: 15,
    mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'gold200', weight: 5 },
      { ref: 'equip', weight: 52 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
      { ref: 'essence_festering', weight: 1 },
    ],
  },
  countess_rune0: { id: 'countess_rune0', picks: 3, noDrop: 5, entries: [{ ref: 'runes:4', weight: 15 }] },
  countess_item0: {
    id: 'countess_item0',
    picks: 5,
    noDrop: 19,
    entries: [
      { ref: 'gold125', weight: 11 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 15 },
      { ref: 'good', weight: 3 },
    ],
  },
  countess0: {
    id: 'countess0',
    picks: -2,
    noDrop: 0,
    mods: { unique: 883, set: 883, rare: 883, magic: 1024 },
    entries: [
      { ref: 'countess_item0', weight: 1 },
      { ref: 'countess_rune0', weight: 1 },
    ],
  },
  andariel0: {
    id: 'andariel0',
    picks: 7,
    noDrop: 19,
    mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'gold125', weight: 11 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 15 },
      { ref: 'good', weight: 3 },
    ],
  },
  pindleskin0: {
    id: 'pindleskin0',
    picks: -4,
    noDrop: 0,
    mods: { unique: 512, set: 654, rare: 972, magic: 1024 },
    entries: [
      { ref: 'uitem', weight: 2 },
      { ref: 'cpot', weight: 2 },
    ],
  },
  eldritch0: {
    id: 'eldritch0',
    picks: -4,
    noDrop: 0,
    mods: { unique: 800, set: 800, rare: 972, magic: 1024 },
    entries: [
      { ref: 'uitem', weight: 2 },
      { ref: 'cpot', weight: 2 },
    ],
  },
  shenk0: {
    id: 'shenk0',
    picks: -4,
    noDrop: 0,
    mods: { unique: 800, set: 800, rare: 972, magic: 1024 },
    entries: [
      { ref: 'uitem', weight: 2 },
      { ref: 'cpot', weight: 2 },
    ],
  },
  nihlathak0: {
    id: 'nihlathak0',
    picks: 5,
    noDrop: 19,
    mods: { unique: 900, set: 900, rare: 900, magic: 1024 },
    entries: [
      { ref: 'gold125', weight: 14 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  ancient0: { id: 'ancient0', picks: 0, noDrop: 0, entries: [] },
  cow_king0: {
    id: 'cow_king0',
    picks: 5,
    noDrop: 0,
    mods: { unique: 850, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'uitem', weight: 1 },
      { ref: 'equip', weight: 2 },
    ],
  },
  mephisto0: {
    id: 'mephisto0',
    picks: 7,
    noDrop: 15,
    mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'gold125', weight: 5 },
      { ref: 'equip', weight: 52 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  griswold0: {
    id: 'griswold0',
    picks: -3,
    noDrop: 0,
    entries: [
      { ref: 'uitem', weight: 1 },
      { ref: 'equip', weight: 2 },
    ],
  },
  duriel_base0: {
    id: 'duriel_base0',
    picks: 7,
    noDrop: 19,
    mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'gold125', weight: 11 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 15 },
      { ref: 'good', weight: 3 },
    ],
  },
  duriel0: {
    id: 'duriel0',
    picks: 5,
    noDrop: 0,
    entries: [
      { ref: 'd2:tsc', weight: 1 },
      { ref: 'duriel_base0', weight: 2 },
    ],
  },
  radament0: {
    id: 'radament0',
    picks: 5,
    noDrop: 19,
    mods: { unique: 900, set: 900, rare: 900, magic: 1024 },
    entries: [
      { ref: 'gold125', weight: 11 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 15 },
      { ref: 'good', weight: 3 },
    ],
  },
  summoner0: {
    id: 'summoner0',
    picks: 5,
    noDrop: 19,
    mods: { unique: 900, set: 900, rare: 972, magic: 1024 },
    entries: [
      { ref: 'gold125', weight: 9 },
      { ref: 'equip', weight: 15 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
      { ref: 'magic', weight: 4 },
    ],
  },
  izual0: {
    id: 'izual0',
    picks: 5,
    noDrop: 19,
    mods: { unique: 800, set: 800, rare: 972, magic: 1024 },
    entries: [
      { ref: 'gold125', weight: 14 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  hephasto0: {
    id: 'hephasto0',
    picks: 5,
    noDrop: 19,
    mods: { unique: 800, set: 800, rare: 900, magic: 1024 },
    entries: [
      { ref: 'gold125', weight: 14 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  diablo0: {
    id: 'diablo0',
    picks: 7,
    noDrop: 15,
    mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'gold125', weight: 5 },
      { ref: 'equip', weight: 52 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  baal0: {
    id: 'baal0',
    picks: 7,
    noDrop: 15,
    mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'gold125', weight: 5 },
      { ref: 'equip', weight: 52 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  blood_raven0: {
    id: 'blood_raven0',
    picks: 5,
    noDrop: 19,
    mods: { unique: 800, set: 800, rare: 972, magic: 1024 },
    entries: [
      { ref: 'gold125', weight: 14 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  dclone0: { id: 'dclone0', picks: 1, noDrop: 0, mods: { unique: 1024, set: 0, rare: 0, magic: 0 }, entries: [{ ref: 'diablo0', weight: 1 }] },
  countess_rune1: { id: 'countess_rune1', picks: 3, noDrop: 5, entries: [{ ref: 'runes:8', weight: 15 }] },
  countess_item1: {
    id: 'countess_item1',
    picks: 5,
    noDrop: 19,
    entries: [
      { ref: 'gold150', weight: 11 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 15 },
      { ref: 'good', weight: 3 },
    ],
  },
  countess1: {
    id: 'countess1',
    picks: -2,
    noDrop: 0,
    mods: { unique: 883, set: 883, rare: 983, magic: 1024 },
    entries: [
      { ref: 'countess_item1', weight: 1 },
      { ref: 'countess_rune1', weight: 1 },
    ],
  },
  andariel1: {
    id: 'andariel1',
    picks: 7,
    noDrop: 19,
    mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'gold150', weight: 11 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 15 },
      { ref: 'good', weight: 3 },
    ],
  },
  pindleskin1: {
    id: 'pindleskin1',
    picks: -4,
    noDrop: 0,
    mods: { unique: 512, set: 654, rare: 972, magic: 1024 },
    entries: [
      { ref: 'uitem', weight: 2 },
      { ref: 'cpot', weight: 2 },
    ],
  },
  eldritch1: {
    id: 'eldritch1',
    picks: -4,
    noDrop: 0,
    mods: { unique: 800, set: 800, rare: 972, magic: 1024 },
    entries: [
      { ref: 'uitem', weight: 2 },
      { ref: 'cpot', weight: 2 },
    ],
  },
  shenk1: {
    id: 'shenk1',
    picks: -4,
    noDrop: 0,
    mods: { unique: 800, set: 800, rare: 972, magic: 1024 },
    entries: [
      { ref: 'uitem', weight: 2 },
      { ref: 'cpot', weight: 2 },
    ],
  },
  nihlathak1: {
    id: 'nihlathak1',
    picks: 5,
    noDrop: 19,
    mods: { unique: 900, set: 900, rare: 900, magic: 1024 },
    entries: [
      { ref: 'gold150', weight: 14 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  ancient1: { id: 'ancient1', picks: 0, noDrop: 0, entries: [] },
  cow_king1: {
    id: 'cow_king1',
    picks: 5,
    noDrop: 0,
    mods: { unique: 850, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'uitem', weight: 1 },
      { ref: 'equip', weight: 2 },
    ],
  },
  mephisto1: {
    id: 'mephisto1',
    picks: 7,
    noDrop: 15,
    mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'gold150', weight: 5 },
      { ref: 'equip', weight: 52 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  griswold1: {
    id: 'griswold1',
    picks: -3,
    noDrop: 0,
    entries: [
      { ref: 'uitem', weight: 1 },
      { ref: 'equip', weight: 2 },
    ],
  },
  duriel_base1: {
    id: 'duriel_base1',
    picks: 7,
    noDrop: 19,
    mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'gold150', weight: 11 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 15 },
      { ref: 'good', weight: 3 },
    ],
  },
  duriel1: {
    id: 'duriel1',
    picks: 5,
    noDrop: 0,
    entries: [
      { ref: 'd2:tsc', weight: 1 },
      { ref: 'duriel_base1', weight: 2 },
    ],
  },
  radament1: {
    id: 'radament1',
    picks: 5,
    noDrop: 19,
    mods: { unique: 900, set: 900, rare: 900, magic: 1024 },
    entries: [
      { ref: 'gold150', weight: 11 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 15 },
      { ref: 'good', weight: 3 },
    ],
  },
  summoner1: {
    id: 'summoner1',
    picks: 5,
    noDrop: 19,
    mods: { unique: 900, set: 900, rare: 972, magic: 1024 },
    entries: [
      { ref: 'gold150', weight: 9 },
      { ref: 'equip', weight: 15 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
      { ref: 'magic', weight: 4 },
    ],
  },
  izual1: {
    id: 'izual1',
    picks: 5,
    noDrop: 19,
    mods: { unique: 800, set: 800, rare: 972, magic: 1024 },
    entries: [
      { ref: 'gold150', weight: 14 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  hephasto1: {
    id: 'hephasto1',
    picks: 5,
    noDrop: 19,
    mods: { unique: 800, set: 800, rare: 900, magic: 1024 },
    entries: [
      { ref: 'gold150', weight: 14 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  diablo1: {
    id: 'diablo1',
    picks: 7,
    noDrop: 15,
    mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'gold150', weight: 5 },
      { ref: 'equip', weight: 52 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  baal1: {
    id: 'baal1',
    picks: 7,
    noDrop: 15,
    mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'gold150', weight: 5 },
      { ref: 'equip', weight: 52 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  blood_raven1: {
    id: 'blood_raven1',
    picks: 5,
    noDrop: 19,
    mods: { unique: 800, set: 800, rare: 972, magic: 1024 },
    entries: [
      { ref: 'gold150', weight: 14 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  dclone1: {
    id: 'dclone1',
    picks: 1,
    noDrop: 0,
    mods: { unique: 1024, set: 0, rare: 0, magic: 0 },
    entries: [
      { ref: 'diablo1', weight: 4 },
      { ref: 'unique:u_annihilus', weight: 1 },
    ],
  },
  countess_rune2: { id: 'countess_rune2', picks: 3, noDrop: 5, entries: [{ ref: 'runes:12', weight: 15 }] },
  countess_item2: {
    id: 'countess_item2',
    picks: 5,
    noDrop: 19,
    entries: [
      { ref: 'gold200', weight: 11 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 15 },
      { ref: 'good', weight: 3 },
      { ref: 'key_terror', weight: 1 },
    ],
  },
  countess2: {
    id: 'countess2',
    picks: -2,
    noDrop: 0,
    mods: { unique: 883, set: 883, rare: 983, magic: 1024 },
    entries: [
      { ref: 'countess_item2', weight: 1 },
      { ref: 'countess_rune2', weight: 1 },
    ],
  },
  andariel2: {
    id: 'andariel2',
    picks: 7,
    noDrop: 19,
    mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'gold200', weight: 11 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 15 },
      { ref: 'good', weight: 3 },
      { ref: 'essence_twisted', weight: 1 },
    ],
  },
  pindleskin2: {
    id: 'pindleskin2',
    picks: -4,
    noDrop: 0,
    mods: { unique: 512, set: 654, rare: 972, magic: 1024 },
    entries: [
      { ref: 'uitem', weight: 2 },
      { ref: 'cpot', weight: 2 },
    ],
  },
  eldritch2: {
    id: 'eldritch2',
    picks: -4,
    noDrop: 0,
    mods: { unique: 800, set: 800, rare: 972, magic: 1024 },
    entries: [
      { ref: 'uitem', weight: 2 },
      { ref: 'cpot', weight: 2 },
    ],
  },
  shenk2: {
    id: 'shenk2',
    picks: -4,
    noDrop: 0,
    mods: { unique: 800, set: 800, rare: 972, magic: 1024 },
    entries: [
      { ref: 'uitem', weight: 2 },
      { ref: 'cpot', weight: 2 },
    ],
  },
  nihlathak2: {
    id: 'nihlathak2',
    picks: 5,
    noDrop: 19,
    mods: { unique: 900, set: 900, rare: 900, magic: 1024 },
    entries: [
      { ref: 'gold200', weight: 14 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
      { ref: 'key_destruction', weight: 1 },
    ],
  },
  ancient2: { id: 'ancient2', picks: 0, noDrop: 0, entries: [] },
  cow_king2: {
    id: 'cow_king2',
    picks: 5,
    noDrop: 0,
    mods: { unique: 850, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'uitem', weight: 1 },
      { ref: 'equip', weight: 2 },
    ],
  },
  mephisto2: {
    id: 'mephisto2',
    picks: 7,
    noDrop: 15,
    mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'gold200', weight: 5 },
      { ref: 'equip', weight: 52 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
      { ref: 'essence_charged', weight: 1 },
    ],
  },
  griswold2: {
    id: 'griswold2',
    picks: -3,
    noDrop: 0,
    entries: [
      { ref: 'uitem', weight: 1 },
      { ref: 'equip', weight: 2 },
    ],
  },
  duriel_base2: {
    id: 'duriel_base2',
    picks: 7,
    noDrop: 19,
    mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'gold200', weight: 11 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 15 },
      { ref: 'good', weight: 3 },
      { ref: 'essence_twisted', weight: 2 },
    ],
  },
  duriel2: {
    id: 'duriel2',
    picks: 5,
    noDrop: 0,
    entries: [
      { ref: 'd2:tsc', weight: 1 },
      { ref: 'duriel_base2', weight: 2 },
    ],
  },
  radament2: {
    id: 'radament2',
    picks: 5,
    noDrop: 19,
    mods: { unique: 900, set: 900, rare: 900, magic: 1024 },
    entries: [
      { ref: 'gold200', weight: 11 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 15 },
      { ref: 'good', weight: 3 },
    ],
  },
  summoner2: {
    id: 'summoner2',
    picks: 5,
    noDrop: 19,
    mods: { unique: 900, set: 900, rare: 972, magic: 1024 },
    entries: [
      { ref: 'gold200', weight: 9 },
      { ref: 'equip', weight: 15 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
      { ref: 'magic', weight: 4 },
      { ref: 'key_hate', weight: 1 },
    ],
  },
  izual2: {
    id: 'izual2',
    picks: 5,
    noDrop: 19,
    mods: { unique: 800, set: 800, rare: 972, magic: 1024 },
    entries: [
      { ref: 'gold200', weight: 14 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  hephasto2: {
    id: 'hephasto2',
    picks: 5,
    noDrop: 19,
    mods: { unique: 800, set: 800, rare: 900, magic: 1024 },
    entries: [
      { ref: 'gold200', weight: 14 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  diablo2: {
    id: 'diablo2',
    picks: 7,
    noDrop: 15,
    mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'gold200', weight: 5 },
      { ref: 'equip', weight: 52 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
      { ref: 'essence_burning', weight: 1 },
    ],
  },
  baal2: {
    id: 'baal2',
    picks: 7,
    noDrop: 15,
    mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
    entries: [
      { ref: 'gold200', weight: 5 },
      { ref: 'equip', weight: 52 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
      { ref: 'essence_festering', weight: 1 },
    ],
  },
  blood_raven2: {
    id: 'blood_raven2',
    picks: 5,
    noDrop: 19,
    mods: { unique: 800, set: 800, rare: 972, magic: 1024 },
    entries: [
      { ref: 'gold200', weight: 14 },
      { ref: 'equip', weight: 19 },
      { ref: 'junk', weight: 5 },
      { ref: 'good', weight: 3 },
    ],
  },
  lilith2: { id: 'lilith2', picks: 1, noDrop: 0, mods: { unique: 1024, set: 0, rare: 0, magic: 0 }, entries: [{ ref: 'organ_horn', weight: 1 }] },
  uber_duriel2: { id: 'uber_duriel2', picks: 1, noDrop: 0, mods: { unique: 1024, set: 0, rare: 0, magic: 0 }, entries: [{ ref: 'organ_eye', weight: 1 }] },
  uber_izual2: { id: 'uber_izual2', picks: 1, noDrop: 0, mods: { unique: 1024, set: 0, rare: 0, magic: 0 }, entries: [{ ref: 'organ_brain', weight: 1 }] },
  dclone2: { id: 'dclone2', picks: 1, noDrop: 0, mods: { unique: 1024, set: 0, rare: 0, magic: 0 }, entries: [{ ref: 'unique:u_annihilus', weight: 1 }] },
  junk: {
    id: 'junk',
    picks: 1,
    noDrop: 0,
    entries: [
      { ref: 'potion', weight: 8 },
      { ref: 'misc', weight: 4 },
      { ref: 'd2:ammo', weight: 4 },
    ],
  },
  misc: {
    id: 'misc',
    picks: 1,
    noDrop: 0,
    entries: [
      { ref: 'key', weight: 3 },
      { ref: 'd2:tsc', weight: 3 },
      { ref: 'd2:isc', weight: 3 },
      { ref: 'oil_potion', weight: 2 },
      { ref: 'rancid_gas_potion', weight: 2 },
    ],
  },
  magic: {
    id: 'magic',
    picks: 1,
    noDrop: 0,
    entries: [
      { ref: 'd2:tsc', weight: 2 },
      { ref: 'd2:isc', weight: 4 },
      { ref: 'potion', weight: 6 },
    ],
  },
  cpot: { id: 'cpot', picks: 2, noDrop: 0, entries: [{ ref: 'potion', weight: 15 }] },
};

/* ---- fin du bloc généré ---- */

/** Nouveau NoDrop pour n joueurs (formule D2 ; n : règle `loot.noDropPlayers`, D2 solo : 1) */
export function noDropFor(noDrop: number, sumOthers: number, n: number): number {
  if (noDrop <= 0 || sumOthers <= 0) return noDrop;
  const ratio = Math.pow((noDrop + sumOthers) / noDrop, n) - 1;
  return Math.floor(sumOthers / ratio);
}

/** TC de runes « Good » par zone et difficulté (niveau du TC Runes N) : modèle du moteur (une table « Good » par zone, pas par acte) */
export const ZONE_RUNE_TC: Record<string, [number, number, number]> = {
  tristram: [1, 8, 13],
  tombs: [2, 9, 14],
  cows: [3, 10, 15],
  chaos: [6, 11, 16],
  countess: [1, 8, 13],
  andariel: [2, 9, 14],
  mephisto: [5, 11, 16],
  pindleskin: [4, 9, 13],
  eldritch: [4, 10, 14],
  nihlathak: [6, 11, 15],
  ancients: [7, 12, 16],
  pandemonium: [12, 14, 16],
  baal: [7, 12, 17],
  map: [17, 17, 17],
  town: [1, 1, 1],
};

/** Gemmes du TC « Good » par difficulté : poids [ébréchée, fêlée, normale, sans défaut, parfaite] (modèle du moteur) */
export const GOOD_GEMS: Record<Difficulty, number[]> = {
  0: [14, 8, 2, 0, 0],
  1: [4, 12, 14, 8, 0],
  2: [0, 4, 10, 28, 6],
};

export const MAX_DROPS_PER_EVENT = 6;
