/**
 * Décor posé des cartes DS1 de Diablo II (torches, braziers, feux, bougies, tonneaux, étendards…). Un objet de DS1 (type 2, identifiant d'acte)
 * devient une ligne d'objects.txt par la table obj.txt (acte, id → ObjectId) ; son jeton donne les dessins de data\global\objects\<jeton>.
 * obj.txt n'est pas dans les MPQ : on la lit depuis le dossier d'import (`<entrée>/obj.txt`, jamais dans le dépôt). Sans elle, les cartes n'ont pas de décor posé.
 * Les planches sont `dec_<jeton>_a<acte>` (la palette change avec l'acte).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameData } from './data';
import { Vfs } from './vfs';

import { TOKENS, DECOR_SHEETS, decorId, parseMonPresets } from './decor-tokens';
export { DECOR_SHEETS, decorId };

/** Table de correspondance : (acte:id DS1) → jeton décoratif, ou null sans obj.txt */
export function decorResolver(data: GameData, inDir: string): ((act: number, id: number) => string | null) | null {
  const file = join(inDir, 'obj.txt');
  if (!existsSync(file)) return null;
  const toObjectId = new Map<string, number>();
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/).slice(1)) {
    const c = line.split('\t');
    if (c.length >= 4 && /^\d+$/.test(c[0])) toObjectId.set(`${c[0]}:${c[1]}`, Number(c[3]));
  }
  const tokenOf = new Map<number, string>();
  for (const r of data.table('objects')?.rows ?? []) if (/^\d+$/.test(String(r.Id ?? ''))) tokenOf.set(Number(r.Id), String(r.Token ?? '').toLowerCase());
  return (act, id) => {
    const oid = toObjectId.get(`${act}:${id}`);
    const tok = oid === undefined ? undefined : tokenOf.get(oid);
    return tok && TOKENS[act]?.includes(tok) ? tok : null;
  };
}

/**
 * monpreset.txt (acte → noms des emplacements de monstres et de PNJ, dans l'ordre des lignes : l'identifiant d'un monstre de DS1 est cet indice).
 * La table vient du patch 1.10+ (absente des MPQ de base) : `D2_PATCH`, sinon `<entrée>/../patch/Patch_D2.mpq`.
 */
export function monPresets(data: GameData): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const patch = process.env.D2_PATCH?.split(':')[0] ?? join(data.inDir, '..', 'patch', 'Patch_D2.mpq');
  let bytes = data.vfs.get('data\\global\\excel\\monpreset.txt');
  if (!bytes && existsSync(patch)) bytes = Vfs.open(data.inDir, [patch]).get('data\\global\\excel\\monpreset.txt');
  return bytes ? parseMonPresets(bytes) : out;
}

/** Repères de gameplay posés par un DS1 : sceaux du Sanctuaire du Chaos (« Seal »), point d'apparition de Diablo (« diablo start point ») */
export function markResolver(data: GameData, inDir: string): ((act: number, id: number) => 'seal' | 'start' | null) | null {
  const file = join(inDir, 'obj.txt');
  if (!existsSync(file)) return null;
  const toObjectId = new Map<string, number>();
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/).slice(1)) {
    const c = line.split('\t');
    if (c.length >= 4 && /^\d+$/.test(c[0])) toObjectId.set(`${c[0]}:${c[1]}`, Number(c[3]));
  }
  const rowOf = new Map<number, { name: string; desc: string }>();
  for (const r of data.table('objects')?.rows ?? []) {
    if (/^\d+$/.test(String(r.Id ?? ''))) rowOf.set(Number(r.Id), { name: String(r.Name ?? '').toLowerCase(), desc: String(r['description - not loaded'] ?? '').toLowerCase() });
  }
  return (act, id) => {
    const oid = toObjectId.get(`${act}:${id}`);
    const r = oid === undefined ? undefined : rowOf.get(oid);
    if (!r) return null;
    if (r.name === 'seal') return 'seal';
    if (r.desc.includes('diablo start point')) return 'start';
    return null;
  };
}
