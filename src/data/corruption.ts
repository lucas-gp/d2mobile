/**
 * Corruption (Pierre-Monde) : tables de propriétés par type d'objet. La base n'en a aucune (la corruption est un ajout de Project Diablo 2) :
 * un mod les enregistre (registre `corruption`, src/mods ; mods/pd2/data/corruption.ts). Chaque colonne (faible / moyenne / forte) est une
 * liste de lignes équiprobables ; une ligne peut porter plusieurs propriétés.
 */
import type { StatRoll } from './types';

type Line = StatRoll[];
export interface CorruptionTable {
  /** Type d'objet (`weapon` pour toutes les armes, `helm` aussi pour les diadèmes) */
  id: string;
  weak: Line[];
  medium: Line[];
  strong: Line[];
  /** Répartition des raretés (armes 50/30/20, sinon 48/32/20) */
  odds: [number, number, number];
}

/** Tables par type d'objet (vide sans mod) */
export const CORRUPTION_TABLES: Record<string, CorruptionTable> = {};

/** Table applicable à un type d'objet (null : non corruptible) */
export function corruptionTableFor(type: string, isWeapon: boolean): CorruptionTable | null {
  if (isWeapon) return CORRUPTION_TABLES.weapon ?? null;
  if (type === 'circlet') return CORRUPTION_TABLES.helm ?? null;
  return CORRUPTION_TABLES[type] ?? null;
}
