/**
 * Plausibilité d'un objet venu de l'extérieur (coffre de guilde, fichier de sauvegarde importé) : base connue du jeu, qualité valide, nombres finis
 * et bornés, tailles limitées. Ne vérifie pas les règles fines du jeu : seulement que l'objet ne peut pas faire planter l'affichage ou le calcul.
 */
import type { Item } from './item';
import { BASE_BY_ID } from '../data/items/bases';

const QUALITIES = new Set(['low', 'normal', 'superior', 'magic', 'rare', 'set', 'unique', 'crafted', 'runeword']);
const BIG = 1e9;
const num = (v: unknown, min: number, max: number): boolean => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const optNum = (v: unknown, min: number, max: number): boolean => v === undefined || num(v, min, max);
const numArray = (v: unknown, maxLen: number): boolean => v === undefined || (Array.isArray(v) && v.length <= maxLen && v.every((x) => num(x, -BIG, BIG)));
const optStr = (v: unknown, max = 200): boolean => v === undefined || (typeof v === 'string' && v.length <= max);

export function isPlausibleItem(it: unknown, depth = 0): it is Item {
  if (!it || typeof it !== 'object' || Array.isArray(it) || depth > 2) return false;
  const x = it as Record<string, unknown>;
  if (typeof x.uid !== 'string' || x.uid.length > 100) return false;
  if (typeof x.base !== 'string' || !Object.hasOwn(BASE_BY_ID, x.base)) return false;
  if (typeof x.quality !== 'string' || !QUALITIES.has(x.quality)) return false;
  if (!num(x.ilvl, 0, 1000) || !num(x.sockets, 0, 12)) return false;
  if (!Array.isArray(x.socketed) || x.socketed.length > 12 || !x.socketed.every((s) => isPlausibleItem(s, depth + 1))) return false;
  if (!optNum(x.superiorPct, -BIG, BIG) || !optNum(x.defRoll, -BIG, BIG) || !optNum(x.dur, -BIG, BIG) || !optNum(x.qty, 0, BIG)) return false;
  if (!numArray(x.rolls, 100) || !numArray(x.setRolls, 100)) return false;
  if (!optStr(x.uniqueId) || !optStr(x.setId) || !optStr(x.rareName) || !optStr(x.importedName) || !optStr(x.runeword)) return false;
  if (x.affixes !== undefined) {
    if (!Array.isArray(x.affixes) || x.affixes.length > 32) return false;
    for (const a of x.affixes as Record<string, unknown>[]) if (!a || typeof a.id !== 'string' || a.id.length > 100 || !Array.isArray(a.values) || !numArray(a.values, 16)) return false;
  }
  for (const k of ['corrupted', 'map', 'craftMods', 'automod']) if (x[k] !== undefined && JSON.stringify(x[k]).length > 5000) return false;
  return true;
}
