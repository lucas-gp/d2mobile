/**
 * Générateur pseudo-aléatoire à graine (sfc32), seul source d'aléatoire du jeu.
 * Aucun appel à Math.random() n'est autorisé dans la simulation : tout passe
 * par une instance de Rng, ce qui rend chaque drop, chaque affixe et chaque
 * combat reproductible à partir de sa graine.
 */

/** Hache une chaîne ou un nombre en graine 32 bits (FNV-1a + mélange). */
export function hashSeed(input: string | number): number {
  const s = typeof input === 'number' ? `n${input}` : input;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // mélange final (murmur3 fmix32)
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number | string = 1) {
    const s = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
    // splitmix32 pour initialiser les 4 mots
    let x = s;
    const next = () => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next();
    for (let i = 0; i < 12; i++) this.nextU32();
  }

  static fromState(st: RngState): Rng {
    const r = new Rng(0);
    r.a = st.a >>> 0;
    r.b = st.b >>> 0;
    r.c = st.c >>> 0;
    r.d = st.d >>> 0;
    return r;
  }

  getState(): RngState {
    return { a: this.a >>> 0, b: this.b >>> 0, c: this.c >>> 0, d: this.d >>> 0 };
  }

  /** Entier non signé 32 bits. */
  nextU32(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) >>> 0;
    return t >>> 0;
  }

  /** Flottant dans [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Entier dans [0, n). */
  int(n: number): number {
    if (n <= 0) return 0;
    return Math.floor(this.next() * n);
  }

  /** Entier dans [min, max] inclus. */
  range(min: number, max: number): number {
    if (max <= min) return min;
    return min + this.int(max - min + 1);
  }

  /** Flottant dans [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Vrai avec la probabilité p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  /** Tirage pondéré : renvoie l'index choisi, ou -1 si le poids total est nul. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w > 0 ? w : 0;
    if (total <= 0) return -1;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] > 0 ? weights[i] : 0;
      if (r < w) return i;
      r -= w;
    }
    return weights.length - 1;
  }

  weighted<T>(items: readonly T[], weight: (t: T) => number): T | undefined {
    const i = this.weightedIndex(items.map(weight));
    return i < 0 ? undefined : items[i];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /** Crée un flux dérivé indépendant (ex. un flux par monstre ou par drop). */
  fork(label: string | number): Rng {
    return new Rng(hashSeed(`${label}:${this.nextU32()}`));
  }
}
