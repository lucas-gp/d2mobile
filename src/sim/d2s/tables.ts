// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
/** Tables de correspondance générées d'après les données de Diablo II (tools/d2s/gen-tables.ts) */
import raw from '../../data/d2s-tables.gen.json';

/** [nom, bits de sauvegarde, ajout, bits de paramètre, encodage, descfunc] */
type StatRow = [name: string, bits: number, add: number, paramBits: number, encode: number, descFunc: number];
/** [nature (a armure, w arme, m divers), id de base du jeu (ou motif spécial), nom D2, drapeaux (1 empilable, 2 quête, 4 livre)] */
type ItemRow = [kind: 'a' | 'w' | 'm', game: string, name: string, flags: number];

export interface D2sTables {
  version: number;
  charBits: Record<string, number>;
  stats: Record<string, StatRow>;
  items: Record<string, ItemRow>;
  uniques: [string, string][];
  sets: [string, string][];
  runewords: Record<string, [string, string]>;
  prefixes: [string, string][];
  suffixes: [string, string][];
  skills: Record<string, string>;
}

export const D2S_TABLES = raw as unknown as D2sTables;
