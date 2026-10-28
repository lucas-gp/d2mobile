/** Lecteur de bits (ordre de Diablo II : poids faible d'abord, octet par octet). */
export class D2sFormatError extends Error {}

export class BitReader {
  /** Position en bits */
  pos = 0;
  constructor(readonly buf: Uint8Array) {}

  get bitLength(): number {
    return this.buf.length * 8;
  }

  /** Lit `n` bits (n ≤ 32) en entier non signé */
  bits(n: number): number {
    if (n === 0) return 0;
    if (this.pos + n > this.bitLength) throw new D2sFormatError('Fin de fichier inattendue');
    let v = 0;
    let got = 0;
    while (got < n) {
      const byte = this.buf[this.pos >> 3];
      const off = this.pos & 7;
      const take = Math.min(8 - off, n - got);
      v += ((byte >> off) & ((1 << take) - 1)) * 2 ** got;
      got += take;
      this.pos += take;
    }
    return v;
  }

  bit(): number {
    return this.bits(1);
  }

  align(): void {
    this.pos = (this.pos + 7) & ~7;
  }

  get bytePos(): number {
    return this.pos >> 3;
  }

  seekByte(b: number): void {
    this.pos = b * 8;
  }

  u8(): number {
    return this.bits(8);
  }
  u16(): number {
    return this.bits(16);
  }
  u32(): number {
    return this.bits(32);
  }

  /** Chaîne de `n` octets (latin-1), arrêtée au premier zéro */
  str(n: number): string {
    let s = '';
    let end = false;
    for (let i = 0; i < n; i++) {
      const c = this.u8();
      if (c === 0) end = true;
      if (!end) s += String.fromCharCode(c);
    }
    return s;
  }
}
