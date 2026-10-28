/**
 * Empreintes : sérialisation canonique et hachage communs aux sections (voir README.md).
 * Une section renvoie une table « clé → empreinte » ; deux exécutions sur le même code doivent rendre la même table.
 */
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';

/** Cartes Diablo II privées (hors dépôt) : l'empreinte des zones en dépend (voir README) */
export const D2_MAPS_DIR = `${process.env.D2_PRIVATE_DIR ?? homedir() + '/d2-private'}/out/game/maps`;

/** Champs d'acteurs qui pointent vers de gros graphes partagés (fiches, monde, grille) : remplacés par rien */
const SKIP = new Set(['def', 'world', 'zone', 'grid', 'nav', 'spatial', 'character', 'game', 'sprite']);

/**
 * Sérialisation bornée d'un état de simulation (profondeur limitée, cycles coupés, nombres à 12 chiffres, fonctions réduites à « f »).
 * Ordre des clés = ordre d'insertion : un changement d'ordre de construction d'un objet est donc visible (voulu).
 */
export function ser(v: unknown, depth: number, seen: WeakSet<object> = new WeakSet(), skip: Set<string> = SKIP): string {
  if (v === null || v === undefined) return String(v);
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v as number) ? (v as number).toPrecision(12) : String(v);
  if (t === 'string' || t === 'boolean') return JSON.stringify(v);
  if (t === 'function') return 'f';
  if (t !== 'object') return t;
  const o = v as object;
  if (seen.has(o)) return '@';
  if (depth <= 0) return '…';
  seen.add(o);
  let out: string;
  if (Array.isArray(o)) out = '[' + o.map((x) => ser(x, depth - 1, seen, skip)).join(',') + ']';
  else if (o instanceof Map) out = 'M{' + [...o].map(([k, x]) => ser(k, 1, seen, skip) + ':' + ser(x, depth - 1, seen, skip)).join(',') + '}';
  else if (o instanceof Set) out = 'S{' + [...o].map((x) => ser(x, depth - 1, seen, skip)).join(',') + '}';
  else if (ArrayBuffer.isView(o)) out = 'B' + sha1(new Uint8Array(o.buffer, o.byteOffset, o.byteLength));
  else
    out =
      '{' +
      Object.keys(o)
        .filter((k) => !skip.has(k))
        .map((k) => k + ':' + ser((o as Record<string, unknown>)[k], depth - 1, seen, skip))
        .join(',') +
      '}';
  seen.delete(o);
  return out;
}

const NO_SKIP = new Set<string>();

/** Sérialisation complète d'une donnée de table (aucun champ écarté, profondeur 64) : fonctions → « f », Map/Set/tableaux typés aplatis */
export function serData(v: unknown): string {
  return ser(v, 64, new WeakSet(), NO_SKIP);
}

export function sha1(data: string | Uint8Array): string {
  return createHash('sha1').update(data).digest('hex');
}

/** JSON d'une valeur quelconque : Map, Set et tableaux typés convertis (sauvegardes, zones construites) */
export function json(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x instanceof Uint8Array || x instanceof Uint16Array || x instanceof Int32Array || x instanceof Float32Array ? Array.from(x).join(',') : x instanceof Map ? [...x] : x instanceof Set ? [...x] : x,
  );
}

/** Résultat d'une section : clés triées à l'écriture (comparaison stable) */
export type SectionResult = Record<string, string>;

/** Graine textuelle → entier (graines des générateurs des sections) */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
