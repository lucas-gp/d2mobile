/**
 * Validation de structure d'une sauvegarde IMPORTÉE (fichier choisi par le joueur) : une sauvegarde forgée ne doit pas pouvoir figer ou faire
 * planter le jeu (nombres non finis, tableaux géants, objets inconnus, clés `__proto__`). Appliquée après `migrate` ; les sauvegardes locales
 * valides produites par le jeu la passent (voir tests/unit/save-check.test.ts). Retourne un message en français, ou null si tout va bien.
 */
import type { SaveData } from './save';
import { migrate } from './save';
import { CLASS_IDS } from '../data/classes';
import { isPlausibleItem } from './item-check';

/** Taille maximale d'un fichier de sauvegarde importé (les sauvegardes réelles font quelques centaines de Ko) */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const MAX_NODES = 2_000_000;
const MAX_DEPTH = 40;
const BIG = 1e12;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Parcours général : nombres finis et raisonnables, pas de clé dangereuse, profondeur et nombre de valeurs bornés */
function scan(root: unknown): string | null {
  let nodes = 0;
  const walk = (v: unknown, depth: number): string | null => {
    if (++nodes > MAX_NODES) return 'fichier trop volumineux';
    if (depth > MAX_DEPTH) return 'structure trop imbriquée';
    if (typeof v === 'number') return Number.isFinite(v) && Math.abs(v) <= BIG ? null : 'nombre invalide';
    if (typeof v === 'string') return v.length > 100_000 ? 'texte trop long' : null;
    if (Array.isArray(v)) {
      for (const x of v) {
        const r = walk(x, depth + 1);
        if (r) return r;
      }
      return null;
    }
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') return 'clé interdite';
        const r = walk((v as Record<string, unknown>)[k], depth + 1);
        if (r) return r;
      }
    }
    return null;
  };
  return walk(root, 0);
}

function items(list: unknown, max: number, what: string): string | null {
  if (list === undefined) return null;
  if (!Array.isArray(list) || list.length > max) return `${what} invalide`;
  for (const it of list) if (it !== null && !isPlausibleItem(it)) return `objet invalide dans ${what}`;
  return null;
}

export function checkSave(d: SaveData): string | null {
  const bad = scan(d);
  if (bad) return bad;
  const c = d.character as unknown;
  if (!isObj(c)) return 'personnage absent';
  if (typeof c.name !== 'string' || !c.name || c.name.length > 60) return 'nom du personnage invalide';
  if (typeof c.classId !== 'string' || !(CLASS_IDS as string[]).includes(c.classId)) return 'classe inconnue';
  for (const k of ['level', 'xp', 'gold', 'statPoints', 'skillPoints', 'stashGold', 'respecs']) {
    const v = c[k];
    if (v === undefined && ['statPoints', 'skillPoints', 'stashGold', 'respecs'].includes(k)) continue; // absents de certaines anciennes sauvegardes
    if (typeof v !== 'number' || v < 0) return `valeur « ${k} » invalide`;
  }
  if ((c.level as number) < 1 || (c.level as number) > 1000) return 'niveau invalide';
  if (!isObj(c.base)) return 'caractéristiques invalides';
  for (const k of ['str', 'dex', 'vit', 'ene']) if (typeof c.base[k] !== 'number') return 'caractéristiques invalides';
  for (const k of ['skills', 'materials', 'bonuses']) {
    const m = c[k];
    if (m === undefined && k !== 'skills') continue; // « materials » et « bonuses » absents des anciennes sauvegardes
    if (!isObj(m) || Object.keys(m).length > 2000) return `« ${k} » invalide`;
    for (const v of Object.values(m)) if (typeof v !== 'number') return `« ${k} » invalide`;
  }
  const r = items(c.inventory, 400, 'l’inventaire') ?? items(c.charmInv, 200, 'l’inventaire des charmes') ?? items(c.cube, 100, 'le cube') ?? items(c.mapStash, 1000, 'le coffre de cartes');
  if (r) return r;
  if (!Array.isArray(c.stash) || c.stash.length > 200) return 'coffre invalide';
  for (const tab of c.stash) {
    const e = items(tab, 400, 'le coffre');
    if (e) return e;
  }
  if (!isObj(c.equipment) || Object.keys(c.equipment).length > 40) return 'équipement invalide';
  for (const it of Object.values(c.equipment)) if (!isPlausibleItem(it)) return 'objet invalide dans l’équipement';
  if (!Array.isArray(c.belt) || c.belt.length > 16) return 'ceinture invalide';
  if (!isObj(c.progression) || !isObj(c.filter) || !isObj(c.hotbar)) return 'progression invalide';
  if (c.merc !== undefined && c.merc !== null) {
    const m = c.merc as unknown;
    if (!isObj(m) || !isObj(m.equipment)) return 'mercenaire invalide';
    for (const it of Object.values(m.equipment)) if (!isPlausibleItem(it)) return 'objet invalide chez le mercenaire';
  }
  if (!isObj(d.settings)) return 'réglages invalides';
  if (d.run !== null && d.run !== undefined) {
    const run = d.run as unknown;
    if (!isObj(run) || !isObj(run.world)) return 'combat en cours invalide';
    const w = run.world;
    if (!Array.isArray(w.monsters) || w.monsters.length > 20_000 || !Array.isArray(w.items) || w.items.length > 5000) return 'combat en cours invalide';
    for (const e of w.items as unknown[]) if (!isObj(e) || !isPlausibleItem(e.item)) return 'objet invalide au sol';
  }
  return null;
}

/** Lit le texte d'un fichier de sauvegarde importé : taille, JSON, migration puis validation. Lève une erreur au message lisible. */
export function parseImportedSave(text: string): SaveData {
  if (text.length > MAX_IMPORT_BYTES) throw new Error('fichier trop volumineux');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('ce n’est pas un fichier JSON');
  }
  if (!isObj(raw) || !isObj(raw.character)) throw new Error('ce n’est pas une sauvegarde de D2 Mobile');
  const s = migrate(raw);
  const why = checkSave(s);
  if (why) throw new Error(why);
  return s;
}
