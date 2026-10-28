/**
 * Décompressions « audio » des archives MPQ (partagées par le CLI Node et le navigateur, sans dépendance) :
 *   - Huffman adaptatif (masque 0x01, variante Fahler-Gallager-Knuth) ;
 *   - ADPCM mono (0x40) et stéréo (0x80), qui produisent des échantillons PCM 16 bits petit-boutiste.
 * Les fichiers WAV des archives de Diablo II sont stockés « ADPCM puis Huffman », secteur par secteur : chaque secteur est indépendant
 * (l'arbre et les prédicteurs repartent de zéro), ce qui permet de décoder un son — ou un morceau de musique — par tranches.
 * Algorithmes décrits publiquement (StormLib, Copyright (c) Ladislav Zezula, MIT license : THIRD_PARTY_NOTICES.md §4) ; les tables de
 * poids sont dans huffman-tables.ts.
 */
import { HUFFMAN_WEIGHTS } from './huffman-tables';

const ITEMS = 515;
const HEAD = ITEMS;
const NIL = -1;
const ERR = 0x1ff;

/** Arbre de Huffman adaptatif, réutilisé d'un secteur à l'autre (listes chaînées par indices, aucune allocation par octet) */
class HuffTree {
  private next = new Int32Array(ITEMS + 1);
  private prev = new Int32Array(ITEMS + 1);
  private value = new Int32Array(ITEMS + 1);
  private weight = new Int32Array(ITEMS + 1);
  private parent = new Int32Array(ITEMS + 1);
  private lo = new Int32Array(ITEMS + 1);
  private byByte = new Int32Array(258);
  private used = 0;
  // flux d'entrée
  private src!: Uint8Array;
  private pos = 0;
  private buf = 0;
  private cnt = 0;

  private reset(): void {
    this.next.fill(NIL);
    this.prev.fill(NIL);
    this.parent.fill(NIL);
    this.lo.fill(NIL);
    this.weight.fill(0);
    this.value.fill(0);
    this.byByte.fill(NIL);
    this.next[HEAD] = HEAD;
    this.prev[HEAD] = HEAD;
    this.used = 0;
  }

  private remove(i: number): void {
    const n = this.next[i];
    if (n !== NIL) {
      const p = this.prev[i];
      this.next[p] = n;
      this.prev[n] = p;
      this.next[i] = NIL;
      this.prev[i] = NIL;
    }
  }

  private link(a: number, b: number): void {
    const an = this.next[a];
    this.next[b] = an;
    this.prev[b] = this.prev[an];
    this.prev[an] = b;
    this.next[a] = b;
  }

  private create(value: number, weight: number, after: boolean): number {
    if (this.used >= ITEMS) return NIL;
    const n = this.used++;
    this.remove(n);
    if (after) this.link(HEAD, n);
    else this.link(this.prev[HEAD], n);
    this.value[n] = value;
    this.weight[n] = weight;
    this.parent[n] = NIL;
    this.lo[n] = NIL;
    return n;
  }

  private higherOrEqual(i: number, w: number): number {
    while (i !== HEAD) {
      if (this.weight[i] >= w) return i;
      i = this.prev[i];
    }
    return HEAD;
  }

  private fixup(n: number, maxW: number): number {
    if (this.weight[n] < maxW) {
      const h = this.higherOrEqual(this.prev[HEAD], this.weight[n]);
      this.remove(n);
      this.link(h, n);
      return maxW;
    }
    return this.weight[n];
  }

  private build(type: number): boolean {
    this.reset();
    if (type >= HUFFMAN_WEIGHTS.length) return false;
    const tab = HUFFMAN_WEIGHTS[type];
    let maxW = 0;
    for (let i = 0; i < 0x100; i++) {
      if (tab[i] !== 0) {
        const n = this.create(i, tab[i], true);
        this.byByte[i] = n;
        maxW = this.fixup(n, maxW);
      }
    }
    this.byByte[0x100] = this.create(0x100, 1, false);
    this.byByte[0x101] = this.create(0x101, 1, false);
    let cl = this.prev[HEAD];
    while (cl !== HEAD) {
      const ch = this.prev[cl];
      if (ch === HEAD) break;
      const n = this.create(0, this.weight[ch] + this.weight[cl], true);
      if (n === NIL) return false;
      this.parent[cl] = n;
      this.parent[ch] = n;
      this.lo[n] = cl;
      maxW = this.fixup(n, maxW);
      cl = this.prev[ch];
    }
    return true;
  }

  private incWeights(item: number): void {
    for (; item !== NIL; item = this.parent[item]) {
      this.weight[item]++;
      const higher = this.higherOrEqual(this.prev[item], this.weight[item]);
      const hi = this.next[higher];
      if (hi !== item) {
        this.remove(hi);
        this.link(item, hi);
        this.remove(item);
        this.link(higher, item);
        const childLo = this.lo[this.parent[hi]];
        let p = this.parent[item];
        if (this.lo[p] === item) this.lo[p] = hi;
        if (childLo === hi) this.lo[this.parent[hi]] = item;
        p = this.parent[item];
        this.parent[item] = this.parent[hi];
        this.parent[hi] = p;
      }
    }
  }

  private newBranch(v1: number, v2: number): boolean {
    const last = this.prev[HEAD];
    const hi = this.create(v1, this.weight[last], false);
    if (hi === NIL) return false;
    this.parent[hi] = last;
    this.byByte[v1] = hi;
    const lo = this.create(v2, 0, false);
    if (lo === NIL) return false;
    this.parent[lo] = last;
    this.lo[last] = lo;
    this.byByte[v2] = lo;
    this.incWeights(lo);
    return true;
  }

  private bit(): number {
    if (this.cnt === 0) {
      if (this.pos >= this.src.length) return -1;
      this.buf = this.src[this.pos++];
      this.cnt = 8;
    }
    const v = this.buf & 1;
    this.buf >>= 1;
    this.cnt--;
    return v;
  }

  private byte(): number {
    if (this.cnt < 8) {
      if (this.pos >= this.src.length) return -1;
      this.buf |= this.src[this.pos++] << this.cnt;
      this.cnt += 8;
    }
    const v = this.buf & 0xff;
    this.buf >>= 8;
    this.cnt -= 8;
    return v;
  }

  private decodeOne(): number {
    let item = this.next[HEAD];
    if (item === HEAD) return ERR;
    while (this.lo[item] !== NIL) {
      const b = this.bit();
      if (b < 0) return ERR;
      item = b ? this.prev[this.lo[item]] : this.lo[item];
    }
    return this.value[item];
  }

  /** Décompresse un flux Huffman MPQ (le premier octet est le type de données) ; `max` borne la sortie */
  decode(data: Uint8Array, max: number): Uint8Array {
    this.src = data;
    this.pos = 0;
    this.buf = 0;
    this.cnt = 0;
    const out = new Uint8Array(max);
    if (max === 0) return out;
    const type = this.byte();
    if (type < 0 || !this.build(type & 0x0f)) throw new Error('Huffman : flux invalide');
    const sparse = type === 0;
    let n = 0;
    for (;;) {
      let v = this.decodeOne();
      if (v === 0x100) break;
      if (v === ERR) throw new Error('Huffman : flux tronqué');
      if (v === 0x101) {
        v = this.byte();
        if (v < 0) throw new Error('Huffman : flux tronqué');
        if (!this.newBranch(this.value[this.prev[HEAD]], v)) throw new Error('Huffman : arbre plein');
        if (!sparse) this.incWeights(this.byByte[v]);
      }
      if (n >= max) break;
      out[n++] = v;
      if (sparse) this.incWeights(this.byByte[v]);
    }
    return out.subarray(0, n);
  }
}

let tree: HuffTree | null = null;

export function huffmanDecode(data: Uint8Array, max: number): Uint8Array {
  tree ??= new HuffTree();
  return tree.decode(data, max);
}

const NEXT_STEP = new Int32Array([-1, 0, -1, 4, -1, 2, -1, 6, -1, 1, -1, 5, -1, 3, -1, 7, -1, 1, -1, 5, -1, 3, -1, 7, -1, 2, -1, 4, -1, 6, -1, 8]);
const STEP_SIZE = new Int32Array([
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544,
  598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635,
  13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
]);

/** ADPCM Blizzard → PCM 16 bits petit-boutiste (`channels` 1 ou 2) ; `max` borne la sortie en octets */
export function adpcmDecode(data: Uint8Array, max: number, channels: number): Uint8Array {
  const out = new Uint8Array(max);
  const n = data.length;
  if (n < 2) return out.subarray(0, 0);
  const shift = data[1]; // 1er octet : zéro ; 2e : décalage de bits (niveau de compression - 1)
  const pred = new Int32Array(2);
  const step = new Int32Array([0x2c, 0x2c]);
  const limit = max - 2;
  let p = 2;
  let o = 0;
  for (let c = 0; c < channels; c++) {
    if (p + 2 > n || o > limit) return out.subarray(0, o);
    const s = ((data[p] | (data[p + 1] << 8)) << 16) >> 16;
    p += 2;
    pred[c] = s;
    out[o++] = s & 0xff;
    out[o++] = (s >> 8) & 0xff;
  }
  let ch = channels - 1;
  while (p < n) {
    const e = data[p++];
    ch = channels === 1 ? 0 : ch ^ 1;
    if (e === 0x80) {
      if (step[ch] !== 0) step[ch]--;
      if (o > limit) break;
      const v = pred[ch];
      out[o++] = v & 0xff;
      out[o++] = (v >> 8) & 0xff;
    } else if (e === 0x81) {
      let st = step[ch] + 8;
      if (st > 0x58) st = 0x58;
      step[ch] = st;
      // la voie suivante est la même : on la rend au prochain tour
      if (channels === 2) ch ^= 1;
    } else {
      const si = step[ch];
      const ss = STEP_SIZE[si];
      let diff = ss >> shift;
      if (e & 0x01) diff += ss;
      if (e & 0x02) diff += ss >> 1;
      if (e & 0x04) diff += ss >> 2;
      if (e & 0x08) diff += ss >> 3;
      if (e & 0x10) diff += ss >> 4;
      if (e & 0x20) diff += ss >> 5;
      let v = pred[ch];
      if (e & 0x40) {
        v -= diff;
        if (v <= -32768) v = -32768;
      } else {
        v += diff;
        if (v >= 32767) v = 32767;
      }
      pred[ch] = v;
      if (o > limit) break;
      out[o++] = v & 0xff;
      out[o++] = (v >> 8) & 0xff;
      let ni = si + NEXT_STEP[e & 0x1f];
      if (ni < 0) ni = 0;
      else if (ni > 88) ni = 88;
      step[ch] = ni;
    }
  }
  return out.subarray(0, o);
}
