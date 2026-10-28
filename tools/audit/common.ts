/** Utilitaires communs des audits D2 (lecture seule). Usage : npx tsx tools/audit/<script>.ts */
import { existsSync } from 'node:fs';
import { Vfs } from '../d2import/vfs';
import { GameData } from '../d2import/data';
import type { Row } from '../d2import/formats/txt';

export const IN_DIR = process.env.D2_IN ?? `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/in`;
/** Patch_D2.mpq (1.1x) : sans lui, les MPQ seuls donnent les tables 1.00 (niveaux, runewords ladder absents…). */
export const PATCH = process.env.D2_PATCH ?? `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/patch/Patch_D2.mpq`;
let gd: GameData | null = null;
export function d2(): GameData {
  if (!gd) gd = new GameData(Vfs.open(IN_DIR, existsSync(PATCH) && !process.env.D2_NOPATCH ? [PATCH] : []), 'eng', IN_DIR);
  return gd;
}
export const rows = (name: string): Row[] => d2().needTable(name).rows;
export const num = (v: string | undefined): number => (v === undefined || v === '' ? 0 : Number(v) || 0);
/** Normalise un nom en identifiant (« Cap » -> « cap ») comme nos ids : minuscules, non-alphanum -> _ */
export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
export function stripName(s: string): string {
  return s.replace(/ÿc./g, '').trim();
}

export type Verdict = 'conforme' | 'écart PD2 connu' | 'écart à vérifier' | 'absent';
export interface Diff {
  subject: string;
  key: string;
  field: string;
  ours: unknown;
  d2: unknown;
  verdict: Verdict;
}
export function table(diffs: Diff[]): string {
  const out = ['| sujet | clé | champ | nous | D2 | verdict |', '|---|---|---|---|---|---|'];
  for (const d of diffs) out.push(`| ${d.subject} | ${d.key} | ${d.field} | ${d.ours} | ${d.d2} | ${d.verdict} |`);
  return out.join('\n');
}

/** En-tête des tables dérivées de Diablo II écrites dans src/data par les générateurs (voir LICENSE-DATA.md) */
export const D2_HEADER = `// SPDX-License-Identifier: LicenseRef-D2-Derived-Data
// Données dérivées des tables de données de Diablo II (valeurs, noms, structure), recréées par l'auteur : NON couvertes par la licence MIT du code.
// Noms et marques : propriété de Blizzard Entertainment, Inc. Voir LICENSE-DATA.md, DISCLAIMER.md et docs/DERIVED-DATA.md.
`;
