/**
 * Recherche de chemin du joueur pour les clics et les touchers (sol, objet, PNJ, portail) : A* sur la grille de marche, 8-connexe,
 * diagonales à coût 1,41 sans couper les coins (sauf passage de coin, voir WalkGrid.playerStep), chemin lissé par lignes droites sûres.
 * Les tableaux sont alloués une fois par grille (rien par image) ; le chemin n'est recalculé que si le but change ou si le joueur est bloqué,
 * et au plus toutes les REPLAN_TICKS ticks (0,3 s). Si le but est inatteignable (ou hors des MAX_NODES nœuds), on va au point le plus proche exploré.
 */
import { TERRAIN_RADIUS } from './constants';
import { CELL, type WalkGrid } from './grid';

export const NAV_MAX_NODES = 4000;
const NAV_REPLAN_TICKS = 8;
const MAX_WAYPOINTS = 512;
const HEAP = NAV_MAX_NODES * 9 + 64;
const SQRT2 = Math.SQRT2;
/** Rayon de sécurité des lignes droites du chemin : un peu plus que le rayon de terrain, pour ne pas raser les coins */
const LOS_R = TERRAIN_RADIUS + 0.17;
const LOS_STEP = 0.1;

export class Navigator {
  private readonly cost: Float32Array;
  private readonly came: Int32Array;
  private readonly stamp: Int32Array;
  private readonly closed: Int32Array;
  private gen = 0;
  private readonly heapN = new Int32Array(HEAP);
  private readonly heapF = new Float32Array(HEAP);
  private hn = 0;
  private readonly raw = new Int32Array(NAV_MAX_NODES + 8);
  private readonly wx = new Float32Array(MAX_WAYPOINTS);
  private readonly wy = new Float32Array(MAX_WAYPOINTS);
  private n = 0;
  private i = 0;
  private goalX = Number.NaN;
  private goalY = Number.NaN;
  private planned = -1e9;
  private direct = false;
  /** le chemin n'atteint pas le but (inatteignable ou trop loin) : il mène au point le plus proche */
  partial = false;
  private chkT = -1e9;
  private chkX = 0;
  private chkY = 0;
  private lastCall = -1e9;
  private reachedEnd = false;
  /** nombre de recherches lancées (mesures et tests) */
  plans = 0;
  /** Rayon des lignes droites du chemin (mesures : 0 = aiguille le long des coins) */
  margin = LOS_R;
  private readonly out = { x: 0, y: 0 };

  constructor(readonly grid: WalkGrid) {
    const size = grid.cols * grid.rows;
    this.cost = new Float32Array(size);
    this.came = new Int32Array(size);
    this.stamp = new Int32Array(size);
    this.closed = new Int32Array(size);
  }

  reset(): void {
    this.goalX = Number.NaN;
    this.n = 0;
    this.i = 0;
    this.direct = false;
    this.partial = false;
    this.reachedEnd = false;
  }

  /**
   * Direction unitaire (objet réutilisé, ne pas conserver) pour aller de (px,py) vers (tx,ty) ; null si on est arrivé
   * ou si le but est inatteignable et que le point le plus proche est atteint.
   */
  steer(px: number, py: number, tx: number, ty: number, tick: number): { x: number; y: number } | null {
    if (tick - this.lastCall > 3) {
      this.chkT = tick;
      this.chkX = px;
      this.chkY = py;
    }
    this.lastCall = tick;
    let stalled = false;
    if (tick - this.chkT >= 6) {
      stalled = Math.hypot(px - this.chkX, py - this.chkY) < 0.08 && !this.reachedEnd;
      this.chkT = tick;
      this.chkX = px;
      this.chkY = py;
    }
    const moved = !(this.goalX === this.goalX) || Math.hypot(tx - this.goalX, ty - this.goalY) > 0.6;
    if (((moved || stalled) && tick - this.planned >= NAV_REPLAN_TICKS) || !(this.goalX === this.goalX)) this.plan(px, py, tx, ty, tick);
    const o = this.out;
    if (this.direct) {
      const dx = tx - px;
      const dy = ty - py;
      const d = Math.hypot(dx, dy);
      if (d < 0.25) return null;
      o.x = dx / d;
      o.y = dy / d;
      return o;
    }
    if (this.n === 0) return null;
    const g = this.grid;
    // raccourcis : on saute les points de passage déjà visibles en ligne droite
    for (
      let k = 0;
      k < 4 && this.i < this.n - 1 && Math.hypot(this.wx[this.i] - px, this.wy[this.i] - py) < 1.6 && g.walkLine(px, py, this.wx[this.i + 1], this.wy[this.i + 1], this.margin, LOS_STEP);
      k++
    )
      this.i++;
    while (this.i < this.n - 1 && Math.hypot(this.wx[this.i] - px, this.wy[this.i] - py) < 0.3) this.i++;
    const last = this.i >= this.n - 1;
    const dx = this.wx[this.i] - px;
    const dy = this.wy[this.i] - py;
    const d = Math.hypot(dx, dy);
    if (last && d < 0.25) {
      // fin du chemin : chemin tronqué ou partiel (but hors des MAX_NODES nœuds) : on relance depuis ici tant qu'on se rapproche du but ;
      // bon but ou point le plus proche d'un but inatteignable : on s'arrête
      if ((this.partial || Math.hypot(tx - px, ty - py) > 0.5) && tick - this.planned >= NAV_REPLAN_TICKS) {
        this.plan(px, py, tx, ty, tick);
        return this.n > 0 || this.direct ? this.steer(px, py, tx, ty, tick) : null;
      }
      this.reachedEnd = true;
      return null;
    }
    o.x = dx / d;
    o.y = dy / d;
    return o;
  }

  private push(f: number, node: number): void {
    const hn = this.heapN;
    const hf = this.heapF;
    let k = this.hn++;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p] <= f) break;
      hn[k] = hn[p];
      hf[k] = hf[p];
      k = p;
    }
    hn[k] = node;
    hf[k] = f;
  }

  private pop(): number {
    const hn = this.heapN;
    const hf = this.heapF;
    const top = hn[0];
    const n = --this.hn;
    if (n > 0) {
      const f = hf[n];
      const node = hn[n];
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= n) break;
        if (c + 1 < n && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= f) break;
        hn[k] = hn[c];
        hf[k] = hf[c];
        k = c;
      }
      hn[k] = node;
      hf[k] = f;
    }
    return top;
  }

  private plan(px: number, py: number, tx: number, ty: number, tick: number): void {
    const g = this.grid;
    this.plans++;
    this.planned = tick;
    this.goalX = tx;
    this.goalY = ty;
    this.n = 0;
    this.i = 0;
    this.partial = false;
    this.reachedEnd = false;
    this.direct = false;
    if (g.walkLine(px, py, tx, ty, this.margin, LOS_STEP)) {
      this.direct = true;
      return;
    }
    const cols = g.cols;
    const start = g.nearestFree(px, py, 1.5);
    if (!start) return;
    const scx = Math.floor(start.x / CELL);
    const scy = Math.floor(start.y / CELL);
    let gc = Math.floor(tx / CELL);
    let gr = Math.floor(ty / CELL);
    let exact = true;
    if (g.isBlockedCell(gc, gr)) {
      exact = false;
      const f = g.nearestFree(tx, ty, 2);
      if (f) {
        gc = Math.floor(f.x / CELL);
        gr = Math.floor(f.y / CELL);
      }
    }
    const goal = gr * cols + gc;
    const s = scy * cols + scx;
    const gen = ++this.gen;
    const cost = this.cost;
    const came = this.came;
    const stamp = this.stamp;
    const closed = this.closed;
    const hh = (c: number, r: number): number => {
      const dx = Math.abs(c - gc);
      const dy = Math.abs(r - gr);
      return dx > dy ? dx + (SQRT2 - 1) * dy : dy + (SQRT2 - 1) * dx;
    };
    this.hn = 0;
    stamp[s] = gen;
    cost[s] = 0;
    came[s] = -1;
    this.push(hh(scx, scy), s);
    let expanded = 0;
    let best = s;
    let bestH = hh(scx, scy);
    let found = false;
    while (this.hn > 0 && expanded < NAV_MAX_NODES) {
      const cur = this.pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === goal) {
        found = true;
        break;
      }
      expanded++;
      const cx = cur % cols;
      const cy = (cur - cx) / cols;
      const h0 = hh(cx, cy);
      if (h0 < bestH) {
        bestH = h0;
        best = cur;
      }
      const base = cost[cur];
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          if (!g.playerStep(cx, cy, ox, oy)) continue;
          const nx = cx + ox;
          const ny = cy + oy;
          const nn = ny * cols + nx;
          if (closed[nn] === gen) continue;
          // un peu de marge le long des murs : on évite de frôler les coins
          const near = g.isBlockedCell(nx + 1, ny) || g.isBlockedCell(nx - 1, ny) || g.isBlockedCell(nx, ny + 1) || g.isBlockedCell(nx, ny - 1);
          const ng = base + (ox && oy ? SQRT2 : 1) + (near ? 0.5 : 0);
          if (stamp[nn] === gen && cost[nn] <= ng) continue;
          stamp[nn] = gen;
          cost[nn] = ng;
          came[nn] = cur;
          if (this.hn < HEAP) this.push(ng + hh(nx, ny), nn);
        }
      }
    }
    const end = found ? goal : best;
    if (!found) this.partial = true;
    if (end === s) return;
    // chemin brut (de l'arrivée vers le départ), puis lissage
    let m = 0;
    for (let c = end; c !== s && c >= 0 && m < this.raw.length; c = came[c]) this.raw[m++] = c;
    // raw[m-1] est la première case après le départ, raw[0] l'arrivée
    let ax = px;
    let ay = py;
    let cur = m - 1;
    let n = 0;
    while (cur >= 0 && n < MAX_WAYPOINTS) {
      let pick = cur;
      const lo = Math.max(0, cur - 40);
      for (let j = lo; j < cur; j++) {
        const c = this.raw[j];
        const x = ((c % cols) + 0.5) * CELL;
        const y = (Math.floor(c / cols) + 0.5) * CELL;
        if (g.walkLine(ax, ay, x, y, this.margin, LOS_STEP)) {
          pick = j;
          break;
        }
      }
      const c = this.raw[pick];
      ax = ((c % cols) + 0.5) * CELL;
      ay = (Math.floor(c / cols) + 0.5) * CELL;
      this.wx[n] = ax;
      this.wy[n] = ay;
      n++;
      cur = pick - 1;
    }
    if (cur >= 0) this.partial = true;
    // le dernier point est le but lui-même quand il est libre et visible depuis l'avant-dernier
    if (found && exact && !g.circleBlocked(tx, ty, TERRAIN_RADIUS) && n > 0) {
      const bx = n > 1 ? this.wx[n - 2] : px;
      const by = n > 1 ? this.wy[n - 2] : py;
      if (g.walkLine(bx, by, tx, ty, this.margin, LOS_STEP)) {
        this.wx[n - 1] = tx;
        this.wy[n - 1] = ty;
      }
    }
    this.n = n;
  }

  /** Nombre de points de passage restants (tests) */
  get waypoints(): number {
    return this.n;
  }
}
