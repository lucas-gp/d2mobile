/**
 * MD5 en JavaScript pur, en flux (morceaux de 8 Mo dans le Worker) : SHA-256 de `crypto.subtle` n'accepte que des tampons entiers, donc
 * inutilisable sur des archives de plusieurs centaines de Mo. Sans dépendance, identique à `node:crypto` (testé sur les vecteurs de la RFC 1321).
 * Ne sert qu'à RECONNAÎTRE une distribution de fichiers (indication affichée au joueur), jamais à bloquer ni à protéger quoi que ce soit.
 */

const K = new Int32Array(64);
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
const R = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

export class Md5 {
  private a = 0x67452301 | 0;
  private b = 0xefcdab89 | 0;
  private c = 0x98badcfe | 0;
  private d = 0x10325476 | 0;
  private tail = new Uint8Array(64);
  private tailLen = 0;
  private bytes = 0;
  private readonly m = new Int32Array(16);

  /** Ajoute des octets (le tampon peut être réutilisé par l'appelant dès le retour) */
  update(data: Uint8Array): this {
    this.bytes += data.length;
    let pos = 0;
    if (this.tailLen) {
      const take = Math.min(64 - this.tailLen, data.length);
      this.tail.set(data.subarray(0, take), this.tailLen);
      this.tailLen += take;
      pos = take;
      if (this.tailLen < 64) return this;
      this.block(this.tail, 0);
      this.tailLen = 0;
    }
    const end = data.length - 64;
    for (; pos <= end; pos += 64) this.block(data, pos);
    if (pos < data.length) {
      this.tail.set(data.subarray(pos), 0);
      this.tailLen = data.length - pos;
    }
    return this;
  }

  /** Empreinte finale en hexadécimal minuscule (l'objet ne doit plus servir ensuite) */
  hex(): string {
    const padLen = (this.tailLen < 56 ? 56 : 120) - this.tailLen;
    const pad = new Uint8Array(padLen + 8);
    pad[0] = 0x80;
    const dv = new DataView(pad.buffer);
    const bits = this.bytes * 8;
    dv.setUint32(padLen, bits >>> 0, true);
    dv.setUint32(padLen + 4, Math.floor(bits / 4294967296), true);
    const total = this.bytes;
    this.update(pad);
    this.bytes = total;
    const out = new Uint8Array(16);
    const ov = new DataView(out.buffer);
    ov.setInt32(0, this.a, true);
    ov.setInt32(4, this.b, true);
    ov.setInt32(8, this.c, true);
    ov.setInt32(12, this.d, true);
    return Array.from(out, (x) => x.toString(16).padStart(2, '0')).join('');
  }

  private block(buf: Uint8Array, off: number): void {
    const m = this.m;
    for (let i = 0, o = off; i < 16; i++, o += 4) m[i] = buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24);
    let a = this.a;
    let b = this.b;
    let c = this.c;
    let d = this.d;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) & 15;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) & 15;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) & 15;
      }
      const t = (a + f + K[i] + m[g]) | 0;
      const s = R[((i >> 4) << 2) | (i & 3)];
      a = d;
      d = c;
      c = b;
      b = (b + ((t << s) | (t >>> (32 - s)))) | 0;
    }
    this.a = (this.a + a) | 0;
    this.b = (this.b + b) | 0;
    this.c = (this.c + c) | 0;
    this.d = (this.d + d) | 0;
  }
}

export function md5Hex(data: Uint8Array | string): string {
  return new Md5().update(typeof data === 'string' ? new TextEncoder().encode(data) : data).hex();
}
