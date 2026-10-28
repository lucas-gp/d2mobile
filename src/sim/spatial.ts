/** Hachage spatial uniforme pour les requêtes de voisinage (monstres, projectiles). */

export interface Spatial {
  id: number;
  x: number;
  y: number;
  radius: number;
}

export class SpatialHash<T extends Spatial> {
  private cells = new Map<number, T[]>();
  private pool: T[][] = [];

  constructor(readonly cellSize = 4) {}

  private key(cx: number, cy: number): number {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  clear(): void {
    for (const arr of this.cells.values()) {
      arr.length = 0;
      this.pool.push(arr);
    }
    this.cells.clear();
  }

  insert(e: T): void {
    const k = this.key(Math.floor(e.x / this.cellSize), Math.floor(e.y / this.cellSize));
    let arr = this.cells.get(k);
    if (!arr) {
      arr = this.pool.pop() ?? [];
      this.cells.set(k, arr);
    }
    arr.push(e);
  }

  /** Remplit `out` avec les éléments dont le centre est à moins de r (+ leur rayon) de (x,y). */
  query(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0;
    const cs = this.cellSize;
    const cx0 = Math.floor((x - r - 2) / cs);
    const cy0 = Math.floor((y - r - 2) / cs);
    const cx1 = Math.floor((x + r + 2) / cs);
    const cy1 = Math.floor((y + r + 2) / cs);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (const e of arr) {
          const rr = r + e.radius;
          const dx = e.x - x;
          const dy = e.y - y;
          if (dx * dx + dy * dy <= rr * rr) out.push(e);
        }
      }
    }
    return out;
  }
}
