// SPDX-License-Identifier: CC-BY-SA-4.0 AND MIT
// Données dérivées du wiki Project Diablo 2 (CC BY-SA 4.0, voir LICENSE-DATA.md et THIRD_PARTY_NOTICES.md) ; le reste du code est MIT.
/**
 * Patch Project Diablo 2 (saison 13) des tables vanilla de la base (Diablo II LoD 1.13c, régénérées depuis les MPQ : tools/vanilla/gen.ts).
 * Généré par diff (mods/pd2/tools/vanilla-diff.ts : tables du jeu pd2 d'avant le lot M6 − tables vanilla). Appliqué par mods/pd2/index.ts
 * avant les autres ajouts du mod ; mods/pd2/tests/unit/vanilla-patch.test.ts vérifie qu'il reproduit les tables pd2 à l'identique. Une
 * valeur PD2 changée volontairement : l'éditer ici, puis `npx tsx mods/pd2/tools/vanilla-diff.ts --no-vanilla --ref` (patch remis en
 * forme, empreintes de référence ré-enregistrées).
 */
import type { TablePatch, TreasureClass } from '../../../src/mods/api';

/** Registre `treasureClasses` : 22 entrée(s) patchée(s) (dont 3 avec ordre des champs), 3 ajoutée(s), 40 retirée(s) */
export const PD2_TREASURE_PATCH: TablePatch<TreasureClass> = {
  patch: {
    caster: {
      entries: [
        { ref: 'gold', weight: 18 },
        { ref: 'equip', weight: 15 },
        { ref: 'junk', weight: 18 },
        { ref: 'good', weight: 2 },
        { ref: 'equip_magic', weight: 7 },
      ],
    },
    champion: {
      entries: [
        { ref: 'citem', weight: 1 },
        { ref: 'potion', weight: 1 },
      ],
    },
    unique: {
      entries: [
        { ref: 'uitem', weight: 1 },
        { ref: 'potion', weight: 2 },
      ],
    },
    boss: {
      entries: [
        { ref: 'gold200', weight: 5 },
        { ref: 'equip', weight: 52 },
        { ref: 'junk', weight: 5 },
        { ref: 'good', weight: 3 },
      ],
    },
    pindleskin0: {
      picks: 6,
      noDrop: 15,
      mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
      entries: [
        { ref: 'gold125', weight: 8 },
        { ref: 'equip', weight: 30 },
        { ref: 'junk', weight: 8 },
        { ref: 'good', weight: 4 },
        { ref: 'runes:3', weight: 3 },
      ],
    },
    eldritch0: {
      picks: 6,
      noDrop: 15,
      mods: { unique: 950, set: 950, rare: 950, magic: 1024 },
      entries: [
        { ref: 'gold125', weight: 8 },
        { ref: 'equip', weight: 30 },
        { ref: 'junk', weight: 8 },
        { ref: 'good', weight: 4 },
        { ref: 'runes:3', weight: 3 },
      ],
    },
    shenk0: {
      picks: 6,
      noDrop: 15,
      mods: { unique: 950, set: 950, rare: 950, magic: 1024 },
      entries: [
        { ref: 'gold125', weight: 8 },
        { ref: 'equip', weight: 30 },
        { ref: 'junk', weight: 8 },
        { ref: 'good', weight: 4 },
        { ref: 'runes:3', weight: 3 },
      ],
    },
    nihlathak0: {
      picks: 7,
      noDrop: 15,
      mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
      entries: [
        { ref: 'gold125', weight: 5 },
        { ref: 'equip', weight: 48 },
        { ref: 'junk', weight: 5 },
        { ref: 'good', weight: 4 },
        { ref: 'runes:5', weight: 5 },
      ],
    },
    ancient0: {
      picks: 4,
      noDrop: 19,
      mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
      entries: [
        { ref: 'gold125', weight: 6 },
        { ref: 'equip', weight: 30 },
        { ref: 'junk', weight: 6 },
        { ref: 'good', weight: 4 },
        { ref: 'runes:6', weight: 4 },
      ],
    },
    pindleskin1: {
      picks: 6,
      noDrop: 15,
      mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
      entries: [
        { ref: 'gold150', weight: 8 },
        { ref: 'equip', weight: 30 },
        { ref: 'junk', weight: 8 },
        { ref: 'good', weight: 4 },
        { ref: 'runes:7', weight: 3 },
      ],
    },
    eldritch1: {
      picks: 6,
      noDrop: 15,
      mods: { unique: 950, set: 950, rare: 950, magic: 1024 },
      entries: [
        { ref: 'gold150', weight: 8 },
        { ref: 'equip', weight: 30 },
        { ref: 'junk', weight: 8 },
        { ref: 'good', weight: 4 },
        { ref: 'runes:8', weight: 3 },
      ],
    },
    shenk1: {
      picks: 6,
      noDrop: 15,
      mods: { unique: 950, set: 950, rare: 950, magic: 1024 },
      entries: [
        { ref: 'gold150', weight: 8 },
        { ref: 'equip', weight: 30 },
        { ref: 'junk', weight: 8 },
        { ref: 'good', weight: 4 },
        { ref: 'runes:8', weight: 3 },
      ],
    },
    nihlathak1: {
      picks: 7,
      noDrop: 15,
      mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
      entries: [
        { ref: 'gold150', weight: 5 },
        { ref: 'equip', weight: 48 },
        { ref: 'junk', weight: 5 },
        { ref: 'good', weight: 4 },
        { ref: 'runes:10', weight: 5 },
      ],
    },
    ancient1: {
      picks: 4,
      noDrop: 19,
      mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
      entries: [
        { ref: 'gold150', weight: 6 },
        { ref: 'equip', weight: 30 },
        { ref: 'junk', weight: 6 },
        { ref: 'good', weight: 4 },
        { ref: 'runes:11', weight: 4 },
      ],
    },
    countess_item2: {
      entries: [
        { ref: 'gold200', weight: 11 },
        { ref: 'equip', weight: 19 },
        { ref: 'junk', weight: 15 },
        { ref: 'good', weight: 3 },
      ],
    },
    andariel2: {
      entries: [
        { ref: 'gold200', weight: 11 },
        { ref: 'equip', weight: 19 },
        { ref: 'junk', weight: 15 },
        { ref: 'good', weight: 3 },
      ],
    },
    pindleskin2: {
      picks: 6,
      noDrop: 15,
      mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
      entries: [
        { ref: 'gold200', weight: 8 },
        { ref: 'equip', weight: 30 },
        { ref: 'junk', weight: 8 },
        { ref: 'good', weight: 4 },
        { ref: 'runes:11', weight: 3 },
      ],
    },
    eldritch2: {
      picks: 6,
      noDrop: 15,
      mods: { unique: 950, set: 950, rare: 950, magic: 1024 },
      entries: [
        { ref: 'gold200', weight: 8 },
        { ref: 'equip', weight: 30 },
        { ref: 'junk', weight: 8 },
        { ref: 'good', weight: 4 },
        { ref: 'runes:12', weight: 3 },
      ],
    },
    shenk2: {
      picks: 6,
      noDrop: 15,
      mods: { unique: 950, set: 950, rare: 950, magic: 1024 },
      entries: [
        { ref: 'gold200', weight: 8 },
        { ref: 'equip', weight: 30 },
        { ref: 'junk', weight: 8 },
        { ref: 'good', weight: 4 },
        { ref: 'runes:12', weight: 3 },
      ],
    },
    nihlathak2: {
      picks: 7,
      noDrop: 15,
      mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
      entries: [
        { ref: 'gold200', weight: 5 },
        { ref: 'equip', weight: 48 },
        { ref: 'junk', weight: 5 },
        { ref: 'good', weight: 4 },
        { ref: 'runes:14', weight: 5 },
      ],
    },
    ancient2: {
      picks: 4,
      noDrop: 19,
      mods: { unique: 983, set: 983, rare: 983, magic: 1024 },
      entries: [
        { ref: 'gold200', weight: 6 },
        { ref: 'equip', weight: 30 },
        { ref: 'junk', weight: 6 },
        { ref: 'good', weight: 4 },
        { ref: 'runes:15', weight: 4 },
      ],
    },
    mephisto2: {
      entries: [
        { ref: 'gold200', weight: 5 },
        { ref: 'equip', weight: 52 },
        { ref: 'junk', weight: 5 },
        { ref: 'good', weight: 3 },
      ],
    },
  },
  keyOrder: {
    ancient0: ['id', 'picks', 'noDrop', 'mods', 'entries'],
    ancient1: ['id', 'picks', 'noDrop', 'mods', 'entries'],
    ancient2: ['id', 'picks', 'noDrop', 'mods', 'entries'],
  },
  add: [
    {
      entry: {
        id: 'uber0',
        picks: 8,
        noDrop: 11,
        mods: { unique: 1100, set: 1100, rare: 1100, magic: 1024 },
        entries: [
          { ref: 'gold125', weight: 4 },
          { ref: 'equip', weight: 50 },
          { ref: 'good', weight: 6 },
          { ref: 'runes:12', weight: 8 },
        ],
      },
      after: 'cow_king0',
    },
    {
      entry: {
        id: 'uber1',
        picks: 8,
        noDrop: 11,
        mods: { unique: 1100, set: 1100, rare: 1100, magic: 1024 },
        entries: [
          { ref: 'gold150', weight: 4 },
          { ref: 'equip', weight: 50 },
          { ref: 'good', weight: 6 },
          { ref: 'runes:14', weight: 8 },
        ],
      },
      after: 'cow_king1',
    },
    {
      entry: {
        id: 'uber2',
        picks: 8,
        noDrop: 11,
        mods: { unique: 1100, set: 1100, rare: 1100, magic: 1024 },
        entries: [
          { ref: 'gold200', weight: 4 },
          { ref: 'equip', weight: 50 },
          { ref: 'good', weight: 6 },
          { ref: 'runes:16', weight: 8 },
        ],
      },
      after: 'cow_king2',
    },
  ],
  remove: [
    'griswold0',
    'duriel_base0',
    'duriel0',
    'radament0',
    'summoner0',
    'izual0',
    'hephasto0',
    'diablo0',
    'baal0',
    'blood_raven0',
    'dclone0',
    'griswold1',
    'duriel_base1',
    'duriel1',
    'radament1',
    'summoner1',
    'izual1',
    'hephasto1',
    'diablo1',
    'baal1',
    'blood_raven1',
    'dclone1',
    'griswold2',
    'duriel_base2',
    'duriel2',
    'radament2',
    'summoner2',
    'izual2',
    'hephasto2',
    'diablo2',
    'baal2',
    'blood_raven2',
    'lilith2',
    'uber_duriel2',
    'uber_izual2',
    'dclone2',
    'junk',
    'misc',
    'magic',
    'cpot',
  ],
};
