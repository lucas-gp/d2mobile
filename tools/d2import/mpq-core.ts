/**
 * Lecteur d'archives MPQ (v1/v2, sans dépendance, sans API Node : partagé par le CLI et le navigateur) : tables de hachage et de blocs chiffrées, fichiers
 * compressés par secteurs (zlib, PKWARE DCL, Huffman, ADPCM mono et stéréo des sons), liste de fichiers interne « (listfile) ».
 * Ne sert qu'à LIRE les archives de l'utilisateur : rien n'est écrit dans les archives ni copié dans le dépôt.
 */
import { blast } from './blast';
import { latin1 } from './bytes';
import { adpcmDecode, huffmanDecode } from './mpq-audio';

const CRYPT = new Uint32Array(0x500);
{
  let seed = 0x00100001;
  for (let i = 0; i < 0x100; i++) {
    let idx = i;
    for (let j = 0; j < 5; j++) {
      seed = (seed * 125 + 3) % 0x2aaaab;
      const t1 = (seed & 0xffff) << 16;
      seed = (seed * 125 + 3) % 0x2aaaab;
      const t2 = seed & 0xffff;
      CRYPT[idx] = (t1 | t2) >>> 0;
      idx += 0x100;
    }
  }
}

/** Hachage MPQ d'un nom de fichier ; type 0 = position, 1/2 = vérification, 3 = clé de chiffrement */
export function mpqHash(name: string, type: 0 | 1 | 2 | 3): number {
  let s1 = 0x7fed7fed;
  let s2 = 0xeeeeeeee;
  for (let i = 0; i < name.length; i++) {
    let c = name.charCodeAt(i);
    if (c >= 97 && c <= 122) c -= 32;
    if (c === 47) c = 92;
    s1 = (CRYPT[type * 0x100 + c] ^ (s1 + s2)) >>> 0;
    s2 = (c + s1 + s2 + ((s2 << 5) >>> 0) + 3) >>> 0;
  }
  return s1 >>> 0;
}

function decrypt(data: Uint8Array, key: number): void {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let seed = 0xeeeeeeee;
  key = key >>> 0;
  for (let i = 0; i + 4 <= data.length; i += 4) {
    seed = (seed + CRYPT[0x400 + (key & 0xff)]) >>> 0;
    const ch = (v.getUint32(i, true) ^ (key + seed)) >>> 0;
    v.setUint32(i, ch, true);
    key = ((((~key << 21) >>> 0) + 0x11111111) | (key >>> 11)) >>> 0;
    seed = (ch + seed + ((seed << 5) >>> 0) + 3) >>> 0;
  }
}

/** Chiffrement MPQ (inverse de `decrypt`) : sert aux tests, qui fabriquent de petites archives synthétiques */
export function mpqEncrypt(data: Uint8Array, key: number): void {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let seed = 0xeeeeeeee;
  key = key >>> 0;
  for (let i = 0; i + 4 <= data.length; i += 4) {
    seed = (seed + CRYPT[0x400 + (key & 0xff)]) >>> 0;
    const plain = v.getUint32(i, true);
    v.setUint32(i, (plain ^ (key + seed)) >>> 0, true);
    key = ((((~key << 21) >>> 0) + 0x11111111) | (key >>> 11)) >>> 0;
    seed = (plain + seed + ((seed << 5) >>> 0) + 3) >>> 0;
  }
}

const F_IMPLODE = 0x100;
const F_COMPRESS = 0x200;
const F_ENCRYPTED = 0x10000;
const F_FIXKEY = 0x20000;
const F_SINGLE = 0x1000000;
const F_DELETE = 0x2000000;
const F_CRC = 0x4000000;
const F_EXISTS = 0x80000000;

interface Block {
  /** rang dans la table de blocs */
  index: number;
  pos: number;
  csize: number;
  size: number;
  flags: number;
}

/** Source d'octets à accès aléatoire et SYNCHRONE (fd Node, FileReaderSync d'un Worker : jamais de fichier chargé en entier) */
export interface ByteSource {
  readonly size: number;
  /** exactement `len` octets à partir de `pos` (erreur si tronqué) */
  read(pos: number, len: number): Uint8Array;
}

/** Décompression zlib synchrone (node:zlib côté CLI, inflate.ts dans le navigateur) */
export type Inflate = (data: Uint8Array, outSize: number) => Uint8Array;

export interface MpqBlockInfo {
  index: number;
  /** position absolue dans le fichier */
  pos: number;
  csize: number;
  size: number;
  flags: number;
  compressed: boolean;
  single: boolean;
  encrypted: boolean;
  crc: boolean;
}

export interface MpqInfo {
  base: number;
  sector: number;
  hashSize: number;
  hashUsed: number;
  hashInvalid: number;
  archiveSize: number;
  version: number;
  hashPos: number;
  blockPos: number;
  blockCount: number;
  blocks: MpqBlockInfo[];
}

export class MpqCore {
  readonly path: string;
  private base = 0;
  private sector = 4096;
  private hashes!: Uint32Array;
  private blocks: Block[] = [];
  private hashSize = 0;
  private hdr = { archiveSize: 0, version: 0, hashPos: 0, blockPos: 0, blockCount: 0 };

  constructor(
    path: string,
    private readonly src: ByteSource,
    private readonly inflate: Inflate,
  ) {
    this.path = path;
    this.open();
  }

  private read(pos: number, len: number): Uint8Array {
    return this.src.read(pos, len);
  }

  private open(): void {
    const size = this.src.size;
    let off = -1;
    for (let p = 0; p + 32 <= size && p < 0x1000000; p += 0x200) {
      const m = this.read(p, 4);
      if (m[0] === 0x4d && m[1] === 0x50 && m[2] === 0x51) {
        if (m[3] === 0x1a) {
          off = p;
          break;
        }
        if (m[3] === 0x1b) {
          const h = new DataView(this.read(p, 16).buffer);
          p += h.getUint32(8, true) - 0x200; // en-tête utilisateur : saute jusqu'à l'archive
        }
      }
    }
    if (off < 0) throw new Error(`${this.path} : signature MPQ introuvable`);
    this.base = off;
    const h = new DataView(this.read(off, 32).buffer);
    this.sector = 512 << h.getUint16(14, true);
    const hashPos = h.getUint32(16, true);
    const blockPos = h.getUint32(20, true);
    this.hashSize = h.getUint32(24, true);
    const blockCount = h.getUint32(28, true);
    this.hdr = { archiveSize: h.getUint32(8, true), version: h.getUint16(12, true), hashPos, blockPos, blockCount };
    const ht = this.read(off + hashPos, this.hashSize * 16);
    decrypt(ht, mpqHash('(hash table)', 3));
    this.hashes = new Uint32Array(ht.buffer, ht.byteOffset, this.hashSize * 4);
    const bt = this.read(off + blockPos, blockCount * 16);
    decrypt(bt, mpqHash('(block table)', 3));
    const bv = new DataView(bt.buffer, bt.byteOffset, bt.byteLength);
    for (let i = 0; i < blockCount; i++)
      this.blocks.push({ index: i, pos: bv.getUint32(i * 16, true), csize: bv.getUint32(i * 16 + 4, true), size: bv.getUint32(i * 16 + 8, true), flags: bv.getUint32(i * 16 + 12, true) });
  }

  /**
   * Disposition de l'archive pour le contrôle d'intégrité (mpq-check.ts) : en-tête, blocs existants (position ABSOLUE) et cohérence de la
   * table de hachage (entrées dont l'index de bloc sort de la table de blocs).
   */
  info(): MpqInfo {
    let hashUsed = 0;
    let hashInvalid = 0;
    for (let i = 0; i < this.hashSize; i++) {
      const blk = this.hashes[i * 4 + 3];
      if (blk === 0xffffffff || blk === 0xfffffffe) continue;
      hashUsed++;
      if (blk >= this.blocks.length) hashInvalid++;
    }
    const blocks: MpqBlockInfo[] = [];
    for (const b of this.blocks)
      if (b.flags & F_EXISTS && !(b.flags & F_DELETE))
        blocks.push({
          index: b.index,
          pos: this.base + b.pos,
          csize: b.csize,
          size: b.size,
          flags: b.flags,
          compressed: (b.flags & (F_IMPLODE | F_COMPRESS)) !== 0,
          single: (b.flags & F_SINGLE) !== 0,
          encrypted: (b.flags & F_ENCRYPTED) !== 0,
          crc: (b.flags & F_CRC) !== 0,
        });
    return { base: this.base, sector: this.sector, hashSize: this.hashSize, hashUsed, hashInvalid, ...this.hdr, blocks };
  }

  /** Rang du bloc d'un fichier de l'archive, ou -1 */
  blockIndexOf(name: string): number {
    return this.find(name)?.index ?? -1;
  }

  private find(name: string): Block | null {
    const a = mpqHash(name, 1);
    const b = mpqHash(name, 2);
    let idx = mpqHash(name, 0) & (this.hashSize - 1);
    let best: Block | null = null;
    for (let n = 0; n < this.hashSize; n++) {
      const e = idx * 4;
      const blk = this.hashes[e + 3];
      if (blk === 0xffffffff) break;
      if (blk !== 0xfffffffe && this.hashes[e] === a && this.hashes[e + 1] === b) {
        const locale = this.hashes[e + 2] & 0xffff;
        const bl = this.blocks[blk];
        if (bl && bl.flags & F_EXISTS && !(bl.flags & F_DELETE)) {
          // locale neutre (0) préféré ; sinon la première entrée trouvée
          if (locale === 0) return bl;
          best ??= bl;
        }
      }
      idx = (idx + 1) & (this.hashSize - 1);
    }
    return best;
  }

  has(name: string): boolean {
    return this.find(name) !== null;
  }

  /** Contenu d'un fichier, ou null s'il n'est pas dans cette archive */
  get(name: string): Uint8Array | null {
    const bl = this.find(name);
    if (!bl) return null;
    return this.extract(bl, name);
  }

  /** Description d'un fichier de l'archive pour le diagnostic : bloc, compression, secteurs, premiers octets stockés (tableau des secteurs inclus) */
  explain(name: string): string {
    const bl = this.find(name);
    if (!bl) return `${name}: not in ${this.path}`;
    const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');
    const parts = [`${this.path}`, `size ${bl.size}`, `stored ${bl.csize}`, `flags 0x${bl.flags.toString(16)}`, `sector ${this.sector}`, `at ${this.base + bl.pos}`];
    try {
      const nsec = Math.ceil(bl.size / this.sector);
      parts.push(`sectors ${nsec}`);
      const abs = this.base + bl.pos;
      const head = this.read(abs, Math.min(16, bl.csize));
      parts.push(`stored head ${hex(head)}`);
      const probe = this.read(abs, Math.min(bl.csize, 65536));
      let zeros = 0;
      for (const b of probe) if (b === 0) zeros++;
      parts.push(`zeros in first ${probe.length} stored bytes: ${zeros}`);
      if (bl.flags & F_COMPRESS && !(bl.flags & (F_SINGLE | F_ENCRYPTED))) {
        const tab = this.read(abs, Math.min((nsec + 1) * 4, 40));
        parts.push(`sector table head ${hex(tab)}`);
        const first = new DataView(tab.buffer, tab.byteOffset, tab.byteLength).getUint32(0, true);
        if (first + 16 <= bl.csize + 16) parts.push(`first sector head ${hex(this.read(abs + first, Math.min(16, bl.csize - first)))}`);
      }
    } catch (e) {
      parts.push(`read error: ${(e as Error).message}`);
    }
    return parts.join('; ');
  }

  /** Taille décompressée d'un fichier (sans le lire), ou null s'il n'est pas dans cette archive */
  size(name: string): number | null {
    const bl = this.find(name);
    return bl ? bl.size : null;
  }

  /**
   * Lit un fichier par tranches de secteurs consécutifs décodés (au plus `batchBytes` d'octets compressés lus à la fois) : un morceau
   * de musique de 50 Mo n'a ainsi jamais besoin d'exister en entier. `sink` reçoit les octets décodés dans l'ordre (le tableau n'est valable
   * que pendant l'appel) et peut renvoyer `false` pour s'arrêter (lecture de l'en-tête seule) ; la méthode renvoie faux si le fichier est absent.
   */
  stream(name: string, sink: (chunk: Uint8Array) => boolean | void, batchBytes = 1 << 20): boolean {
    const bl = this.find(name);
    if (!bl) return false;
    const compressed = (bl.flags & (F_IMPLODE | F_COMPRESS)) !== 0;
    if (bl.size === 0) return true;
    if (bl.flags & F_SINGLE || !compressed) {
      sink(this.extract(bl, name));
      return true;
    }
    let key = 0;
    if (bl.flags & F_ENCRYPTED) {
      key = mpqHash(name.split(/[\\/]/).pop()!, 3);
      if (bl.flags & F_FIXKEY) key = ((key + bl.pos) ^ bl.size) >>> 0;
    }
    const abs = this.base + bl.pos;
    const nsec = Math.ceil(bl.size / this.sector);
    const nEnt = nsec + 1 + (bl.flags & F_CRC ? 1 : 0);
    const tab = this.read(abs, nEnt * 4);
    if (key) decrypt(tab, key - 1);
    const tv = new DataView(tab.buffer, tab.byteOffset, tab.byteLength);
    let s = 0;
    while (s < nsec) {
      const a0 = tv.getUint32(s * 4, true);
      let e = s + 1;
      // premier lot d'un seul secteur : l'en-tête d'un son s'obtient sans lire plus
      while (s > 0 && e < nsec && tv.getUint32((e + 1) * 4, true) - a0 <= batchBytes) e++;
      const span = this.read(abs + a0, tv.getUint32(e * 4, true) - a0);
      for (let k = s; k < e; k++) {
        const a = tv.getUint32(k * 4, true) - a0;
        const b = tv.getUint32((k + 1) * 4, true) - a0;
        const want = Math.min(this.sector, bl.size - k * this.sector);
        let raw: Uint8Array = span.subarray(a, b);
        if (key) decrypt(raw, key + k);
        if (raw.length < want) raw = this.unpack(raw, want, bl.flags);
        if (sink(raw.length > want ? raw.subarray(0, want) : raw) === false) return true;
      }
      s = e;
    }
    return true;
  }

  private extract(bl: Block, name: string): Uint8Array {
    const compressed = (bl.flags & (F_IMPLODE | F_COMPRESS)) !== 0;
    let key = 0;
    if (bl.flags & F_ENCRYPTED) {
      const base = name.split(/[\\/]/).pop()!;
      key = mpqHash(base, 3);
      if (bl.flags & F_FIXKEY) key = ((key + bl.pos) ^ bl.size) >>> 0;
    }
    if (bl.size === 0) return new Uint8Array(0);
    const abs = this.base + bl.pos;
    if (bl.flags & F_SINGLE) {
      let raw: Uint8Array = this.read(abs, bl.csize);
      if (key) decrypt(raw, key);
      return compressed && bl.csize < bl.size ? this.unpack(raw, bl.size, bl.flags) : raw;
    }
    const nsec = Math.ceil(bl.size / this.sector);
    if (!compressed) {
      const raw = this.read(abs, bl.csize);
      if (key) for (let s = 0; s < nsec; s++) decrypt(raw.subarray(s * this.sector, Math.min(bl.size, (s + 1) * this.sector)), key + s);
      return raw;
    }
    const nEnt = nsec + 1 + (bl.flags & F_CRC ? 1 : 0);
    const tab = this.read(abs, nEnt * 4);
    if (key) decrypt(tab, key - 1);
    const tv = new DataView(tab.buffer, tab.byteOffset, tab.byteLength);
    const out = new Uint8Array(bl.size);
    // une seule lecture pour tous les secteurs (ils se suivent) : dans le navigateur chaque lecture d'un File est un aller-retour entre processus,
    // des milliers de lectures de 4 Ko ralentissaient d'un facteur 5 à 15 le décodage d'une carte. Au-delà de 48 Mo : secteur par secteur.
    const first = tv.getUint32(0, true);
    const last = tv.getUint32(nsec * 4, true);
    const span = last > first && last - first <= 48 * 1048576 ? this.read(abs + first, last - first) : null;
    for (let s = 0; s < nsec; s++) {
      const a = tv.getUint32(s * 4, true);
      const b = tv.getUint32((s + 1) * 4, true);
      const want = Math.min(this.sector, bl.size - s * this.sector);
      let raw: Uint8Array = span && a >= first && b <= last && b >= a ? span.slice(a - first, b - first) : this.read(abs + a, b - a);
      if (key) decrypt(raw, key + s);
      if (raw.length < want) raw = this.unpack(raw, want, bl.flags);
      out.set(raw.subarray(0, want), s * this.sector);
    }
    return out;
  }

  private unpack(raw: Uint8Array, size: number, flags: number): Uint8Array {
    const out = this.unpackRaw(raw, size, flags);
    // un secteur décodé trop court laissait des zéros dans le fichier (DC6 « version 0 ») : erreur explicite à la place
    const audio = flags & F_COMPRESS && raw[0] & 0xc1;
    if (out.length < size && !audio) {
      const head = Array.from(raw.subarray(0, 8), (x) => x.toString(16).padStart(2, '0')).join(' ');
      throw new Error(
        `${this.path} : secteur décodé trop court (${out.length} sur ${size} octets; ${raw.length} octets stockés${flags & F_COMPRESS ? `, masque ${raw[0].toString(16)}` : ', PKWARE'}; début ${head}${raw.every((x) => x === 0) ? '; secteur rempli de zéros' : ''})`,
      );
    }
    return out;
  }

  private unpackRaw(raw: Uint8Array, size: number, flags: number): Uint8Array {
    if (flags & F_COMPRESS) {
      const mask = raw[0];
      let data = raw.subarray(1);
      // ordre de décompression inverse de la compression : bzip2, pkware, zlib, huffman, adpcm
      if (mask & 0x10) throw new Error('bzip2 non géré');
      if (mask & 0x08) data = blast(data, size);
      if (mask & 0x02) data = this.inflate(data, size);
      // sons : Huffman puis ADPCM (chaque secteur est indépendant : arbre et prédicteurs repartent de zéro)
      if (mask & 0x01) data = huffmanDecode(data, size);
      if (mask & 0x80) data = adpcmDecode(data, size, 2);
      else if (mask & 0x40) data = adpcmDecode(data, size, 1);
      return data;
    }
    return blast(raw, size);
  }

  /** Noms de fichiers listés par « (listfile) » (vide s'il n'y en a pas) */
  listfile(): string[] {
    const d = this.get('(listfile)');
    if (!d) return [];
    return latin1(d).split(/\r?\n/).filter(Boolean);
  }
}
