/**
 * Grille de marche et champ de flux (flow field) pour le déplacement des monstres.
 * Tout est en coordonnées de monde ; la grille a une résolution de CELL unités.
 */

export const CELL = 0.5;

export class WalkGrid {
  readonly cols: number;
  readonly rows: number;
  /** 0 = libre, 1 = bloqué (mur, obstacle) */
  readonly blocked: Uint8Array;
  /** 1 = bloque aussi les projectiles (murs pleins) ; les obstacles bas (clôtures, tombes) ne bloquent pas les sorts. */
  readonly opaque: Uint8Array;
  /**
   * Lot 312: what stops sight and missiles beyond the grid (world units of this grid); null: everything (the map's outside). A zone joined
   * edge to edge to its neighbours (src/sim/seam-worlds.ts) sees and shoots into their maps where they lie
   */
  outside: ((x: number, y: number) => boolean) | null = null;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cols = Math.ceil(width / CELL);
    this.rows = Math.ceil(height / CELL);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.opaque = new Uint8Array(this.cols * this.rows);
  }

  idx(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows;
  }

  cellOf(x: number): number {
    return Math.floor(x / CELL);
  }

  isBlockedCell(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return true;
    return this.blocked[this.idx(cx, cy)] === 1;
  }

  isBlockedAt(x: number, y: number): boolean {
    return this.isBlockedCell(Math.floor(x / CELL), Math.floor(y / CELL));
  }

  isOpaqueAt(x: number, y: number): boolean {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    if (!this.inBounds(cx, cy)) return this.outside ? this.outside(x, y) : true;
    return this.opaque[this.idx(cx, cy)] === 1;
  }

  /** Bloque un rectangle monde [x0,x1]×[y0,y1]. */
  blockRect(x0: number, y0: number, x1: number, y1: number, opaque = true): void {
    const cx0 = Math.max(0, Math.floor(x0 / CELL));
    const cy0 = Math.max(0, Math.floor(y0 / CELL));
    const cx1 = Math.min(this.cols - 1, Math.ceil(x1 / CELL) - 1);
    const cy1 = Math.min(this.rows - 1, Math.ceil(y1 / CELL) - 1);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const i = this.idx(cx, cy);
        this.blocked[i] = 1;
        if (opaque) this.opaque[i] = 1;
      }
    }
  }

  blockCircle(x: number, y: number, r: number, opaque = true): void {
    const cx0 = Math.max(0, Math.floor((x - r) / CELL));
    const cy0 = Math.max(0, Math.floor((y - r) / CELL));
    const cx1 = Math.min(this.cols - 1, Math.floor((x + r) / CELL));
    const cy1 = Math.min(this.rows - 1, Math.floor((y + r) / CELL));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const px = (cx + 0.5) * CELL;
        const py = (cy + 0.5) * CELL;
        if ((px - x) ** 2 + (py - y) ** 2 <= r * r) {
          const i = this.idx(cx, cy);
          this.blocked[i] = 1;
          if (opaque) this.opaque[i] = 1;
        }
      }
    }
  }

  unblockRect(x0: number, y0: number, x1: number, y1: number): void {
    const cx0 = Math.max(0, Math.floor(x0 / CELL));
    const cy0 = Math.max(0, Math.floor(y0 / CELL));
    const cx1 = Math.min(this.cols - 1, Math.ceil(x1 / CELL) - 1);
    const cy1 = Math.min(this.rows - 1, Math.ceil(y1 / CELL) - 1);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const i = this.idx(cx, cy);
        this.blocked[i] = 0;
        this.opaque[i] = 0;
      }
    }
  }

  /** Un cercle de rayon r centré en (x,y) chevauche-t-il une cellule bloquée ? */
  circleBlocked(x: number, y: number, r: number): boolean {
    const cx0 = Math.floor((x - r) / CELL);
    const cy0 = Math.floor((y - r) / CELL);
    const cx1 = Math.floor((x + r) / CELL);
    const cy1 = Math.floor((y + r) / CELL);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (!this.isBlockedCell(cx, cy)) continue;
        // distance du centre au rectangle de la cellule
        const rx0 = cx * CELL;
        const ry0 = cy * CELL;
        const nx = x < rx0 ? rx0 : x > rx0 + CELL ? rx0 + CELL : x;
        const ny = y < ry0 ? ry0 : y > ry0 + CELL ? ry0 + CELL : y;
        if ((nx - x) ** 2 + (ny - y) ** 2 < r * r - 1e-6) return true;
      }
    }
    return false;
  }

  /**
   * Passage en diagonale entre deux sous-tuiles bloquées qui se touchent par un coin (la case d'arrivée est libre) : un POINT de D2 y passe.
   * Refusé quand les deux bloquées font partie d'un mur en diagonale plus long (au moins 3 sous-tuiles) : on n'ouvre jamais un mur.
   */
  cornerGap(cx: number, cy: number, ox: number, oy: number): boolean {
    if (!ox || !oy) return false;
    if (this.isBlockedCell(cx + ox, cy + oy) || this.isBlockedCell(cx, cy)) return false;
    if (!this.isBlockedCell(cx + ox, cy) || !this.isBlockedCell(cx, cy + oy)) return false;
    return !this.isBlockedCell(cx + 2 * ox, cy - oy) && !this.isBlockedCell(cx - ox, cy + 2 * oy);
  }

  /** Pas d'une sous-tuile (cx,cy) vers sa voisine (ox,oy) pour la recherche de chemin du joueur : diagonale sans couper les coins, sauf passage de coin (voir cornerGap) */
  playerStep(cx: number, cy: number, ox: number, oy: number): boolean {
    if (this.isBlockedCell(cx + ox, cy + oy)) return false;
    if (!ox || !oy) return true;
    const a = this.isBlockedCell(cx + ox, cy);
    const b = this.isBlockedCell(cx, cy + oy);
    if (!a && !b) return true;
    return a && b && this.cornerGap(cx, cy, ox, oy);
  }

  /** Ligne de vue (DDA) : faux si un mur opaque coupe le segment. */
  lineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const d = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(d / (CELL * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isOpaqueAt(ax + dx * t, ay + dy * t)) return false;
    }
    return true;
  }

  /** Trajet praticable en ligne droite (obstacles bas compris), avec un rayon de corps optionnel */
  walkLine(ax: number, ay: number, bx: number, by: number, r = 0, step = CELL * 0.5): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const d = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(d / step);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + dx * t;
      const y = ay + dy * t;
      if (r > 0 ? this.circleBlocked(x, y, r) : this.isBlockedAt(x, y)) return false;
    }
    return true;
  }

  /**
   * Le point b est-il atteignable à pied depuis a (même région libre, 8-connexe sans couper les coins) ?
   * Sert à la téléportation : on traverse les murs, mais pas vers l'extérieur de la zone (vide, plateaux isolés).
   */
  connected(ax: number, ay: number, bx: number, by: number): boolean {
    const from = this.nearestFree(ax, ay, 2);
    if (!from) return true;
    const sx = Math.floor(from.x / CELL);
    const sy = Math.floor(from.y / CELL);
    const tx = Math.floor(bx / CELL);
    const ty = Math.floor(by / CELL);
    if (!this.inBounds(tx, ty) || this.isBlockedCell(tx, ty)) return false;
    const seen = new Uint8Array(this.cols * this.rows);
    const queue = new Int32Array(this.cols * this.rows);
    let head = 0;
    let tail = 0;
    queue[tail++] = this.idx(sx, sy);
    seen[queue[0]] = 1;
    while (head < tail) {
      const i = queue[head++];
      const cx = i % this.cols;
      const cy = (i - cx) / this.cols;
      if (cx === tx && cy === ty) return true;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = cx + ox;
          const ny = cy + oy;
          if (!this.inBounds(nx, ny) || this.isBlockedCell(nx, ny)) continue;
          if (ox && oy && (this.isBlockedCell(cx + ox, cy) || this.isBlockedCell(cx, cy + oy))) continue;
          const j = this.idx(nx, ny);
          if (seen[j]) continue;
          seen[j] = 1;
          queue[tail++] = j;
        }
      }
    }
    return false;
  }

  /** Cherche la cellule libre la plus proche d'un point (pour placer un monstre ou un objet). */
  nearestFree(x: number, y: number, maxR = 8): { x: number; y: number } | null {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    if (!this.isBlockedCell(cx, cy)) return { x, y };
    const maxC = Math.ceil(maxR / CELL);
    for (let r = 1; r <= maxC; r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (Math.abs(ox) !== r && Math.abs(oy) !== r) continue;
          if (!this.isBlockedCell(cx + ox, cy + oy)) return { x: (cx + ox + 0.5) * CELL, y: (cy + oy + 0.5) * CELL };
        }
      }
    }
    return null;
  }
}

/**
 * Champ de flux : distance (en cellules) de chaque cellule vers une cible, calculée par
 * BFS 8-connexe borné. Les monstres descendent le gradient pour contourner les murs.
 */
export class FlowField {
  readonly dist: Uint16Array;
  targetCx = -1;
  targetCy = -1;
  private queue: Int32Array;
  /** Cellules visitées au dernier calcul (seules elles sont remises à l'infini au suivant) */
  private visited = 0;
  static readonly INF = 0xffff;

  constructor(readonly grid: WalkGrid) {
    this.dist = new Uint16Array(grid.cols * grid.rows).fill(FlowField.INF);
    this.queue = new Int32Array(grid.cols * grid.rows);
  }

  /** Recalcule à partir de (x,y) dans un rayon de maxCells cellules. */
  compute(x: number, y: number, maxCells: number): void {
    const g = this.grid;
    const tcx = Math.floor(x / CELL);
    const tcy = Math.floor(y / CELL);
    this.targetCx = tcx;
    this.targetCy = tcy;
    for (let i = 0; i < this.visited; i++) this.dist[this.queue[i]] = FlowField.INF;
    this.visited = 0;
    if (!g.inBounds(tcx, tcy)) return;
    let head = 0;
    let tail = 0;
    const start = g.idx(tcx, tcy);
    this.dist[start] = 0;
    this.queue[tail++] = start;
    const cols = g.cols;
    while (head < tail) {
      const cur = this.queue[head++];
      const d = this.dist[cur];
      if (d >= maxCells) continue;
      const cx = cur % cols;
      const cy = (cur - cx) / cols;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nx = cx + ox;
          const ny = cy + oy;
          if (!g.inBounds(nx, ny)) continue;
          const ni = ny * cols + nx;
          if (g.blocked[ni] === 1 || this.dist[ni] !== FlowField.INF) continue;
          // pas de coupe de coin en diagonale
          if (ox !== 0 && oy !== 0) {
            if (g.blocked[cy * cols + nx] === 1 || g.blocked[ny * cols + cx] === 1) continue;
          }
          this.dist[ni] = d + 1;
          this.queue[tail++] = ni;
        }
      }
    }
    this.visited = tail;
  }

  distAt(x: number, y: number): number {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    if (!this.grid.inBounds(cx, cy)) return FlowField.INF;
    return this.dist[this.grid.idx(cx, cy)];
  }

  /** Direction (unitaire) vers la cellule voisine de plus faible distance ; null si hors champ. */
  direction(x: number, y: number): { x: number; y: number } | null {
    const g = this.grid;
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    if (!g.inBounds(cx, cy)) return null;
    const here = this.dist[g.idx(cx, cy)];
    if (here === FlowField.INF) return null;
    let best = here;
    let bx = 0;
    let by = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        const nx = cx + ox;
        const ny = cy + oy;
        if (!g.inBounds(nx, ny)) continue;
        const d = this.dist[g.idx(nx, ny)];
        if (d < best) {
          best = d;
          bx = ox;
          by = oy;
        }
      }
    }
    if (bx === 0 && by === 0) return null;
    // vise le centre de la cellule voisine pour éviter de raboter les coins
    const tx = (cx + bx + 0.5) * CELL - x;
    const ty = (cy + by + 0.5) * CELL - y;
    const l = Math.sqrt(tx * tx + ty * ty) || 1;
    return { x: tx / l, y: ty / l };
  }
}
