/**
 * Entrées-sorties robustes (sans Node ni navigateur) : lecture/écriture « jusqu'au bout » et CRC32 par morceaux.
 * Utilisé par la copie des MPQ dans OPFS (src/platform/d2local.worker.ts), la lecture des archives (browser.ts) et leurs tests.
 * Sur Android (content://), `readAsArrayBuffer` et `write` peuvent renvoyer moins que demandé : on ne suppose jamais l'inverse.
 */

/** Taille d'un morceau de copie / d'empreinte */
export const COPY_CHUNK = 8 * 1024 * 1024;

let TABLE: Uint32Array | null = null;
/** CRC32 (IEEE) ; `crc` = valeur précédente pour enchaîner plusieurs tampons */
export function crc32(b: Uint8Array, crc = 0): number {
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c >>> 0;
    }
  }
  let c = ~crc >>> 0;
  for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

export interface WritableAt {
  write(b: ArrayBufferView, o: { at: number }): number;
}
export interface ReadableAt {
  read(b: ArrayBufferView, o: { at: number }): number;
}

/** Écrit tout le tampon (boucle sur les écritures partielles) ; erreur explicite si plus rien n'avance */
export function writeFully(h: WritableAt, buf: Uint8Array, at: number): void {
  let off = 0;
  let stalls = 0;
  while (off < buf.length) {
    const n = h.write(off ? buf.subarray(off) : buf, { at: at + off });
    if (!(n > 0)) {
      if (++stalls >= 3) throw new Error(`Write failed at offset ${at + off} (0 bytes written)`);
      continue;
    }
    stalls = 0;
    off += n;
  }
}

/** Remplit le tampon depuis une poignée synchrone (lectures partielles bouclées) ; renvoie le nombre d'octets lus (< length : fin du fichier) */
export function readFully(h: ReadableAt, buf: Uint8Array, at: number): number {
  let off = 0;
  let stalls = 0;
  while (off < buf.length) {
    const n = h.read(off ? buf.subarray(off) : buf, { at: at + off });
    if (!(n > 0)) {
      if (++stalls >= 2) break;
      continue;
    }
    stalls = 0;
    off += n;
  }
  return off;
}

/**
 * Lecture exacte d'une plage d'une source de taille connue : l'attendu est `min(len, size - pos)` ; une lecture courte est retentée
 * une fois, puis signalée (jamais de tampon tronqué rendu en silence : l'archive paraîtrait corrompue bien plus loin).
 */
export function readExact(read: (pos: number, len: number) => Uint8Array, size: number, pos: number, len: number): Uint8Array {
  const want = Math.max(0, Math.min(len, size - pos));
  let b = read(pos, len);
  if (b.length < want) b = read(pos, len);
  if (b.length < want) throw new Error(`Short read at offset ${pos}: got ${b.length} of ${want} bytes`);
  return b;
}

/* -------------------------------------------------------------------------- */
/* Copie vérifiée d'un fichier                                                  */
/* -------------------------------------------------------------------------- */

export interface SyncFile extends WritableAt, ReadableAt {
  getSize(): number;
  truncate(n: number): void;
  flush(): void;
}
export interface ChunkSource {
  size: number;
  read(pos: number, len: number): Uint8Array;
}

/** La copie ne correspond pas à la source malgré les réécritures */
export class CopyDamagedError extends Error {
  constructor(
    public chunk: number,
    public offset: number,
  ) {
    super(`copy differs from the source at offset ${offset}`);
    this.name = 'CopyDamagedError';
  }
}

export interface CopyOptions {
  /** reprise : octets déjà écrits (multiple de COPY_CHUNK) et CRC de ces morceaux */
  from?: number;
  crcs?: number[];
  chunk?: number;
  /** points de contrôle (tous les `flushEvery` octets) : tampon vidé sur disque, état à consigner */
  flushEvery?: number;
  onCheckpoint?: (done: number, crcs: number[]) => void;
  onProgress?: (done: number, verifying: boolean) => void;
  /**
   * Chaque morceau lu de la SOURCE pendant la copie (contigu, depuis `from`) : le contrôle d'intégrité (MD5, plages nulles) profite de cette
   * lecture au lieu d'en faire une autre. Appelé aussi par `verifyAgainstSource` quand on l'utilise seul (copie complète à revérifier).
   */
  onChunk?: (pos: number, buf: Uint8Array) => void;
}

/**
 * Copie `src` dans `dst` (écritures bouclées, CRC32 de chaque morceau de la source), puis RELIT la copie et la compare à la source
 * morceau par morceau ; un morceau différent est réécrit (2 essais), puis `CopyDamagedError`. Renvoie les CRC par morceau.
 */
export function copyVerified(src: ChunkSource, dst: SyncFile, o: CopyOptions = {}): { crcs: number[]; rewritten: number } {
  const CH = o.chunk ?? COPY_CHUNK;
  const flushEvery = o.flushEvery ?? 4 * CH;
  const crcs = (o.crcs ?? []).slice(0, Math.ceil((o.from ?? 0) / CH));
  let pos = o.from ?? 0;
  if (pos > 0) {
    if (crcs.length !== Math.ceil(pos / CH)) {
      pos = 0;
      crcs.length = 0;
    }
    if (pos > dst.getSize()) {
      pos = 0;
      crcs.length = 0;
    }
  }
  dst.truncate(pos);
  let since = 0;
  while (pos < src.size) {
    const len = Math.min(CH, src.size - pos);
    const buf = readExact(src.read, src.size, pos, len);
    if (buf.length !== len) throw new Error(`Short read at offset ${pos}: got ${buf.length} of ${len} bytes`);
    writeFully(dst, buf, pos);
    o.onChunk?.(pos, buf);
    crcs.push(crc32(buf));
    pos += len;
    since += len;
    if (since >= flushEvery || pos === src.size) {
      dst.flush();
      since = 0;
      o.onCheckpoint?.(pos, crcs);
    }
    o.onProgress?.(pos, false);
  }
  return { crcs, rewritten: verifyAgainstSource(src, dst, crcs, { ...o, onChunk: undefined }) };
}

/** Relit la copie et la compare à la source (voir `copyVerified`) ; renvoie le nombre de morceaux réécrits */
export function verifyAgainstSource(src: ChunkSource, dst: SyncFile, crcs: number[], o: CopyOptions = {}): number {
  const CH = o.chunk ?? COPY_CHUNK;
  let rewritten = 0;
  const copyCrc = (pos: number, len: number): number => {
    const b = new Uint8Array(len);
    return readFully(dst, b, pos) === len ? crc32(b) : -1;
  };
  for (let i = 0, pos = 0; pos < src.size; i++, pos += CH) {
    const len = Math.min(CH, src.size - pos);
    let s = readExact(src.read, src.size, pos, len);
    o.onChunk?.(pos, s);
    let cs = crc32(s);
    let good = copyCrc(pos, len) === cs && (crcs[i] === undefined || crcs[i] === cs);
    for (let attempt = 0; !good && attempt < 2; attempt++) {
      if (attempt > 0) {
        s = readExact(src.read, src.size, pos, len);
        cs = crc32(s);
      }
      writeFully(dst, s, pos);
      dst.flush();
      rewritten++;
      good = copyCrc(pos, len) === cs;
    }
    if (!good) throw new CopyDamagedError(i, pos);
    crcs[i] = cs;
    o.onProgress?.(pos + len, true);
  }
  if (dst.getSize() !== src.size) dst.truncate(src.size);
  return rewritten;
}

/** Relit la copie seule et la compare aux CRC enregistrés à la copie : indice du premier morceau différent, ou -1 */
export function verifyAgainstCrc(read: ChunkSource, crcs: number[], chunk = COPY_CHUNK, onProgress?: (done: number) => void): number {
  const n = Math.ceil(read.size / chunk);
  if (crcs.length !== n) return 0;
  for (let i = 0; i < n; i++) {
    const pos = i * chunk;
    const len = Math.min(chunk, read.size - pos);
    let ok = false;
    try {
      const b = readExact(read.read, read.size, pos, len);
      ok = b.length === len && crc32(b) === crcs[i];
    } catch {
      ok = false;
    }
    if (!ok) return i;
    onProgress?.(pos + len);
  }
  return -1;
}
