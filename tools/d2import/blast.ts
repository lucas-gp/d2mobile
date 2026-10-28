/**
 * Décompression PKWARE DCL (« implode ») des archives MPQ — portage de blast.c (zlib/contrib, Mark Adler).
 *
 * Altered source: TypeScript port of blast.c, not the original software. Original notice (zlib license):
 *
 *   blast.c  Copyright (C) 2003, 2012, 2013 Mark Adler
 *
 *   This software is provided 'as-is', without any express or implied warranty. In no event will the authors be held liable for any
 *   damages arising from the use of this software.
 *
 *   Permission is granted to anyone to use this software for any purpose, including commercial applications, and to alter it and
 *   redistribute it freely, subject to the following restrictions:
 *
 *   1. The origin of this software must not be misrepresented; you must not claim that you wrote the original software. If you use this
 *      software in a product, an acknowledgment in the product documentation would be appreciated but is not required.
 *   2. Altered source versions must be plainly marked as such, and must not be misrepresented as being the original software.
 *   3. This notice may not be removed or altered from any source distribution.
 */

const LITLEN = [
  11, 124, 8, 7, 28, 7, 188, 13, 76, 4, 10, 8, 12, 10, 12, 10, 8, 23, 8, 9, 7, 6, 7, 8, 7, 6, 55, 8, 23, 24, 12, 11, 7, 9, 11, 12, 6, 7, 22, 5, 7, 24, 6, 11, 9, 6, 7, 22, 7, 11, 38, 7, 9, 8, 25, 11,
  8, 11, 9, 12, 8, 12, 5, 38, 5, 38, 5, 11, 7, 5, 6, 21, 6, 10, 53, 8, 7, 24, 10, 27, 44, 253, 253, 253, 252, 252, 252, 13, 12, 45, 12, 45, 12, 61, 12, 45, 44, 173,
];
const LENLEN = [2, 35, 36, 53, 38, 23];
const DISTLEN = [2, 20, 53, 230, 247, 151, 248];
const BASE = [3, 2, 4, 5, 6, 7, 8, 9, 10, 12, 16, 24, 40, 72, 136, 264];
const EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8];
const MAXBITS = 13;

interface Huffman {
  count: number[];
  symbol: number[];
}

function construct(rep: number[]): Huffman {
  const length: number[] = [];
  for (const b of rep) {
    let left = (b >> 4) + 1;
    const len = b & 15;
    while (left--) length.push(len);
  }
  const count = new Array(MAXBITS + 1).fill(0);
  for (const l of length) count[l]++;
  const offs = new Array(MAXBITS + 1).fill(0);
  for (let l = 1; l < MAXBITS; l++) offs[l + 1] = offs[l] + count[l];
  const symbol: number[] = [];
  for (let s = 0; s < length.length; s++) if (length[s] !== 0) symbol[offs[length[s]]++] = s;
  return { count, symbol };
}

const LIT = construct(LITLEN);
const LEN = construct(LENLEN);
const DIST = construct(DISTLEN);

export function blast(input: Uint8Array, outSize?: number): Uint8Array {
  let pos = 0;
  let bitbuf = 0;
  let bitcnt = 0;
  const bits = (need: number): number => {
    let val = bitbuf;
    while (bitcnt < need) {
      if (pos >= input.length) throw new Error('PKWARE : flux tronqué');
      val |= input[pos++] << bitcnt;
      bitcnt += 8;
    }
    bitbuf = val >>> need;
    bitcnt -= need;
    return val & ((1 << need) - 1);
  };
  const decode = (h: Huffman): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len <= MAXBITS; len++) {
      code |= bits(1) ^ 1;
      const count = h.count[len];
      if (code < first + count) return h.symbol[index + (code - first)];
      index += count;
      first += count;
      first <<= 1;
      code <<= 1;
    }
    throw new Error('PKWARE : code invalide');
  };
  const lit = bits(8);
  if (lit > 1) throw new Error('PKWARE : mode de littéraux invalide');
  const dict = bits(8);
  if (dict < 4 || dict > 6) throw new Error('PKWARE : taille de dictionnaire invalide');
  let out = new Uint8Array(outSize ?? input.length * 4);
  let n = 0;
  const put = (b: number): void => {
    if (n >= out.length) {
      const bigger = new Uint8Array(out.length * 2);
      bigger.set(out);
      out = bigger;
    }
    out[n++] = b;
  };
  for (;;) {
    if (bits(1)) {
      const sym = decode(LEN);
      const len = BASE[sym] + bits(EXTRA[sym]);
      if (len === 519) break;
      const sh = len === 2 ? 2 : dict;
      let dist = decode(DIST) << sh;
      dist += bits(sh);
      dist++;
      if (dist > n) throw new Error('PKWARE : distance hors limites');
      for (let i = 0; i < len; i++) put(out[n - dist]);
    } else {
      put(lit ? decode(LIT) : bits(8));
    }
  }
  return out.subarray(0, n);
}
