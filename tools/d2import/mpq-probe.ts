/**
 * Contrôles rapides d'une archive MPQ fournie par le joueur (sans l'ouvrir) : signature et empreinte sur quelques morceaux.
 * Module minuscule, utilisable aussi sur le fil principal (le Worker embarque le reste des exporteurs).
 */
import { sha1Hex } from './sha1';

export interface ProbeSource {
  readonly size: number;
  read(pos: number, len: number): Uint8Array;
}

/** Archive MPQ plausible : signature « MPQ\x1A » (ou « MPQ\x1B » : en-tête utilisateur) au début, ou à un multiple de 512 octets */
export function looksLikeMpq(head: Uint8Array): boolean {
  for (let o = 0; o + 4 <= head.length; o += 512) {
    if (head[o] === 0x4d && head[o + 1] === 0x50 && head[o + 2] === 0x51 && (head[o + 3] === 0x1a || head[o + 3] === 0x1b)) return true;
  }
  return false;
}

/** Empreinte rapide d'un fichier : SHA-1 de trois morceaux de 64 Kio (début, milieu, fin) et de la taille */
export function quickFingerprint(src: ProbeSource): string {
  const n = Math.min(65536, src.size);
  const parts: Uint8Array[] = [];
  for (const pos of [0, Math.max(0, Math.floor(src.size / 2 - n / 2)), Math.max(0, src.size - n)]) parts.push(src.read(pos, Math.min(n, src.size - pos)));
  const all = new Uint8Array(parts.reduce((a, p) => a + p.length, 0) + 8);
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  new DataView(all.buffer).setFloat64(o, src.size, true);
  return sha1Hex(all);
}
