/**
 * zlib « inflate » synchrone, sans dépendance (navigateur : le Worker de génération lit les secteurs MPQ de façon
 * synchrone, `DecompressionStream` étant asynchrone). Algorithme classique de tiny-inflate (RFC 1950/1951).
 * `outSize` : taille décompressée connue (secteur MPQ) ; la sortie est tronquée/complétée à cette taille.
 *
 * Follows tiny-inflate, Copyright (c) 2015-present Devon Govett, MIT license (full notice: THIRD_PARTY_NOTICES.md §4; the build copies it
 * into THIRD_PARTY_LICENSES.txt).
 */
interface Tree {
  t: Uint16Array; // nombre de codes par longueur
  s: Uint16Array; // symboles triés
}

const mkTree = (): Tree => ({ t: new Uint16Array(16), s: new Uint16Array(288) });

const LBASE = new Uint16Array(30);
const LBITS = new Uint8Array(30);
const DBASE = new Uint16Array(30);
const DBITS = new Uint8Array(30);
const CLCIDX = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
const FIXED_LT = mkTree();
const FIXED_DT = mkTree();

function bits(b: Uint8Array, base: Uint16Array, delta: number, first: number): void {
  for (let i = 0; i < delta; i++) b[i] = 0;
  for (let i = 0; i < 30 - delta; i++) b[i + delta] = (i / delta) | 0;
  let sum = first;
  for (let i = 0; i < 30; i++) {
    base[i] = sum;
    sum += 1 << b[i];
  }
}

function buildTree(t: Tree, lengths: Uint8Array, off: number, num: number): void {
  const offs = new Uint16Array(16);
  t.t.fill(0);
  for (let i = 0; i < num; i++) t.t[lengths[off + i]]++;
  t.t[0] = 0;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    offs[i] = sum;
    sum += t.t[i];
  }
  for (let i = 0; i < num; i++) if (lengths[off + i]) t.s[offs[lengths[off + i]]++] = i;
}

(function init() {
  bits(LBITS, LBASE, 4, 3);
  bits(DBITS, DBASE, 2, 1);
  LBITS[28] = 0;
  LBASE[28] = 258;
  const l = new Uint8Array(288);
  for (let i = 0; i < 144; i++) l[i] = 8;
  for (let i = 144; i < 256; i++) l[i] = 9;
  for (let i = 256; i < 280; i++) l[i] = 7;
  for (let i = 280; i < 288; i++) l[i] = 8;
  buildTree(FIXED_LT, l, 0, 288);
  const d = new Uint8Array(30).fill(5);
  buildTree(FIXED_DT, d, 0, 30);
})();

export function inflateZlib(src: Uint8Array, outSize: number): Uint8Array {
  const out = new Uint8Array(outSize);
  let pos = 2; // en-tête zlib (CMF, FLG) ; somme Adler ignorée
  let tag = 0;
  let cnt = 0;
  let o = 0;
  const lt = mkTree();
  const dt = mkTree();
  const lengths = new Uint8Array(288 + 32);

  const getBit = (): number => {
    if (!cnt--) {
      tag = src[pos++];
      cnt = 7;
    }
    const b = tag & 1;
    tag >>>= 1;
    return b;
  };
  const readBits = (n: number, base: number): number => {
    if (!n) return base;
    while (cnt < 24) {
      tag |= src[pos++] << cnt;
      cnt += 8;
    }
    const v = tag & (0xffff >>> (16 - n));
    tag >>>= n;
    cnt -= n;
    return v + base;
  };
  const decodeSym = (t: Tree): number => {
    while (cnt < 24) {
      tag |= src[pos++] << cnt;
      cnt += 8;
    }
    let sum = 0;
    let cur = 0;
    let len = 0;
    let tg = tag;
    do {
      cur = 2 * cur + (tg & 1);
      tg >>>= 1;
      len++;
      sum += t.t[len];
      cur -= t.t[len];
    } while (cur >= 0);
    tag = tg;
    cnt -= len;
    return t.s[sum + cur];
  };

  let last: number;
  do {
    last = getBit();
    const type = readBits(2, 0);
    if (type === 0) {
      // bloc stocké : on réaligne sur l'octet
      while (cnt > 8) {
        pos--;
        cnt -= 8;
      }
      cnt = 0;
      tag = 0;
      const len = src[pos] | (src[pos + 1] << 8);
      pos += 4;
      for (let i = 0; i < len && o < outSize; i++) out[o++] = src[pos++];
      continue;
    }
    let ltree = FIXED_LT;
    let dtree = FIXED_DT;
    if (type === 2) {
      const hlit = readBits(5, 257);
      const hdist = readBits(5, 1);
      const hclen = readBits(4, 4);
      lengths.fill(0, 0, 19);
      for (let i = 0; i < hclen; i++) lengths[CLCIDX[i]] = readBits(3, 0);
      const cl = mkTree();
      buildTree(cl, lengths, 0, 19);
      let n = 0;
      while (n < hlit + hdist) {
        const sym = decodeSym(cl);
        if (sym < 16) lengths[n++] = sym;
        else {
          let prev = 0;
          let rep: number;
          if (sym === 16) {
            prev = lengths[n - 1];
            rep = readBits(2, 3);
          } else if (sym === 17) rep = readBits(3, 3);
          else rep = readBits(7, 11);
          while (rep--) lengths[n++] = prev;
        }
      }
      buildTree(lt, lengths, 0, hlit);
      buildTree(dt, lengths, hlit, hdist);
      ltree = lt;
      dtree = dt;
    } else if (type !== 1) throw new Error('inflate : type de bloc invalide');
    for (;;) {
      let sym = decodeSym(ltree);
      if (sym === 256) break;
      if (sym < 256) {
        if (o < outSize) out[o] = sym;
        o++;
      } else {
        sym -= 257;
        const length = readBits(LBITS[sym], LBASE[sym]);
        const dsym = decodeSym(dtree);
        const offs = o - readBits(DBITS[dsym], DBASE[dsym]);
        if (offs < 0) throw new Error('inflate : distance invalide');
        for (let i = 0; i < length; i++) {
          if (o < outSize) out[o] = out[offs + i];
          o++;
        }
      }
    }
  } while (!last);
  return out;
}
