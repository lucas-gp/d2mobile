/**
 * Formes des cartes d'endgame (inspirées des cartes de Project Diablo 2, chacune tirée d'une zone du jeu) :
 * chaque carte du catalogue reçoit un générateur de forme et ses paramètres (MAP_SHAPES), déterministe par
 * graine. La forme est une grille de cases (2 unités en extérieur, 4 en intérieur : les murs du décor mesurent
 * 4 unités) : roche/forêt (bordée de décor), praticable, danger (lave, boue, vide : infranchissable mais
 * transparent aux projectiles) ou bâtiment. Le bâtisseur (mapzone.ts) en tire collisions, sol, décor et
 * placements ; ce module ne fait que la géométrie et garantit la connexité de tout le praticable.
 */
import { Rng } from '../../../../src/mods/sdk';

export const ROCK = 0;
export const OPEN = 1;
export const HAZ = 2;
export const WALL = 3;

type ShapeKind =
  'caves' | 'crater' | 'islands' | 'river' | 'canyon' | 'road' | 'village' | 'halls' | 'spiral' | 'star' | 'hedges' | 'rings' | 'plateaus' | 'rifts' | 'crosses' | 'catacombs' | 'canals' | 'palace';

export interface ShapeSpec {
  kind: ShapeKind;
  /** Variante du générateur */
  v?: string;
  /** Sol des cases de danger : lave (lueurs), boue, ou vide noir */
  hazard?: 'lava' | 'mud' | 'void';
  /** Part praticable attendue de la boîte englobante (dimensionnement) */
  fill: number;
  /** Largeur / hauteur de la boîte */
  aspect?: number;
  /** Multiplicateur de surface (formes à longs trajets : un peu plus petites) */
  size?: number;
}

/** Bâtiment posé sur des cases WALL : décor unique (maison, ruine, tour…) choisi par le bâtisseur */
interface Structure {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  kind: 'house' | 'big' | 'tower' | 'ruin' | 'tent';
}

export type DecoRole = 'column' | 'grave' | 'fence_a' | 'fence_b' | 'rubble' | 'stall' | 'coffin' | 'spikes' | 'well' | 'brazier' | 'banner';
/** Décor imposé par la forme (unités) */
interface Deco {
  role: DecoRole;
  x: number;
  y: number;
}

export class ShapeGrid {
  readonly c: Uint8Array;
  /** 1 : sol secondaire (rues, salles, chemins) */
  readonly floor: Uint8Array;
  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly cell: number,
    fill = ROCK,
  ) {
    this.c = new Uint8Array(cols * rows).fill(fill);
    this.floor = new Uint8Array(cols * rows);
  }
  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }
  get(x: number, y: number): number {
    return this.inside(x, y) ? this.c[y * this.cols + x] : ROCK;
  }
  isOpen(x: number, y: number): boolean {
    return this.get(x, y) === OPEN;
  }
  set(x: number, y: number, v: number, floor?: number): void {
    if (!this.inside(x, y)) return;
    const i = y * this.cols + x;
    this.c[i] = v;
    if (floor !== undefined) this.floor[i] = floor;
  }
  /** Unités → cases */
  u(n: number): number {
    return n / this.cell;
  }
  rect(x0: number, y0: number, x1: number, y1: number, v: number, floor?: number): void {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.rows, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.cols, Math.ceil(x1)); x++) this.set(x, y, v, floor);
  }
  disk(cx: number, cy: number, r: number, v: number, floor?: number): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, v, floor);
  }
  /** Tache organique : rayon modulé par trois harmoniques */
  blob(rng: Rng, cx: number, cy: number, r: number, v: number, amp = 0.25, floor?: number): void {
    const p = [rng.float(0, 6.3), rng.float(0, 6.3), rng.float(0, 6.3)];
    const R = r * (1 + amp);
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const a = Math.atan2(dy, dx);
        const rr = r * (1 + amp * (0.5 * Math.sin(2 * a + p[0]) + 0.3 * Math.sin(3 * a + p[1]) + 0.2 * Math.sin(5 * a + p[2])));
        if (dx * dx + dy * dy <= rr * rr) this.set(x, y, v, floor);
      }
  }
  /** Segment épais (largeur w en cases) */
  line(ax: number, ay: number, bx: number, by: number, w: number, v: number, floor?: number): void {
    const r = w / 2;
    const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1e-9;
    for (let y = Math.floor(Math.min(ay, by) - r - 1); y <= Math.ceil(Math.max(ay, by) + r + 1); y++)
      for (let x = Math.floor(Math.min(ax, bx) - r - 1); x <= Math.ceil(Math.max(ax, bx) + r + 1); x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2));
        if ((px - ax - t * (bx - ax)) ** 2 + (py - ay - t * (by - ay)) ** 2 <= r * r) this.set(x, y, v, floor);
      }
  }
  path(pts: [number, number][], w: number, v: number, floor?: number): void {
    for (let k = 1; k < pts.length; k++) this.line(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], w, v, floor);
  }
  count(v: number): number {
    let n = 0;
    for (const x of this.c) if (x === v) n++;
    return n;
  }
}

export interface Shape {
  g: ShapeGrid;
  /** Départ souhaité (cases) */
  start: [number, number];
  /** Arène du boss souhaitée (cases) */
  boss?: [number, number];
  /** Poches (culs-de-sac, alcôves) proposées pour les événements */
  pockets: [number, number][];
  structures: Structure[];
  deco: Deco[];
}

/* ------------------------------------------------------------------ */
/* Outils                                                               */
/* ------------------------------------------------------------------ */

type Pt = [number, number];
interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Ligne brisée sinueuse (déplacement du point milieu) */
function meander(rng: Rng, a: Pt, b: Pt, amp: number, depth = 2): Pt[] {
  if (depth <= 0) return [a, b];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const off = rng.float(-amp, amp) * len;
  const nx = -(b[1] - a[1]) / (len || 1);
  const ny = (b[0] - a[0]) / (len || 1);
  const m: Pt = [(a[0] + b[0]) / 2 + nx * off, (a[1] + b[1]) / 2 + ny * off];
  return [...meander(rng, a, m, amp, depth - 1), ...meander(rng, m, b, amp, depth - 1).slice(1)];
}

/** Disques non chevauchants tirés au hasard (cases) */
function scatterCircles(rng: Rng, g: ShapeGrid, n: number, rMin: number, rMax: number, margin: number, gap: number, inside?: (x: number, y: number) => boolean): Circle[] {
  const out: Circle[] = [];
  for (let t = 0; t < n * 80 && out.length < n; t++) {
    const r = rng.float(rMin, rMax);
    if (g.cols - 2 * (margin + r) <= 0 || g.rows - 2 * (margin + r) <= 0) continue;
    const x = rng.float(margin + r, g.cols - margin - r);
    const y = rng.float(margin + r, g.rows - margin - r);
    if (inside && !inside(x, y)) continue;
    if (out.every((o) => Math.hypot(o.x - x, o.y - y) >= o.r + r + gap)) out.push({ x, y, r });
  }
  return out;
}

/** Arbre couvrant minimal (Prim) + `loops` arêtes courtes supplémentaires */
function mst(rng: Rng, pts: { x: number; y: number }[], loops: number): [number, number][] {
  const n = pts.length;
  if (n < 2) return [];
  const d = (i: number, j: number) => Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
  const inT = new Array(n).fill(false);
  inT[0] = true;
  const edges: [number, number][] = [];
  for (let k = 1; k < n; k++) {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let i = 0; i < n; i++) if (inT[i]) for (let j = 0; j < n; j++) if (!inT[j] && d(i, j) < bd) ((bd = d(i, j)), (best = [i, j]));
    if (!best) break;
    inT[best[1]] = true;
    edges.push(best);
  }
  const has = new Set(edges.map(([i, j]) => `${Math.min(i, j)},${Math.max(i, j)}`));
  const mean = edges.reduce((s, [i, j]) => s + d(i, j), 0) / edges.length;
  const extra: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!has.has(`${i},${j}`) && d(i, j) < mean * 1.7) extra.push([i, j]);
  extra.sort((a, b) => d(a[0], a[1]) - d(b[0], b[1]));
  const pool = extra.slice(0, Math.max(loops * 2, loops));
  for (let k = 0; k < loops && pool.length; k++) edges.push(pool.splice(rng.int(pool.length), 1)[0]);
  return edges;
}

/** Superellipse bruitée : enveloppe extérieure (vallée, ville) */
function envelope(rng: Rng, g: ShapeGrid, margin: number, v: number, power = 3, amp = 0.1, floor?: number, scale = 1): (x: number, y: number) => boolean {
  const cx = g.cols / 2;
  const cy = g.rows / 2;
  const rx = (g.cols / 2 - margin) * scale;
  const ry = (g.rows / 2 - margin) * scale;
  const p = [rng.float(0, 6.3), rng.float(0, 6.3), rng.float(0, 6.3)];
  const inside = (x: number, y: number) => {
    const dx = (x + 0.5 - cx) / rx;
    const dy = (y + 0.5 - cy) / ry;
    const a = Math.atan2(dy, dx);
    const lim = 1 + amp * (0.5 * Math.sin(3 * a + p[0]) + 0.3 * Math.sin(5 * a + p[1]) + 0.2 * Math.sin(7 * a + p[2]));
    return Math.abs(dx) ** power + Math.abs(dy) ** power <= lim ** power;
  };
  if (v >= 0) for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (inside(x, y)) g.set(x, y, v, floor);
  return inside;
}

const boxArea = (g: ShapeGrid) => g.cols * g.rows * g.cell * g.cell;
/**
 * Échelle linéaire de la boîte face à une boîte de référence (côté en unités) : les générateurs à éléments
 * linéaires (bras, gorges, galeries, couronnes) en tirent leurs largeurs ou leurs nombres, pour que la surface
 * praticable suive l'aire de la boîte (part praticable constante, proportions conservées)
 */
const lin = (g: ShapeGrid, ref: number) => Math.sqrt(boxArea(g)) / ref;

/** Automate cellulaire : lisse les bords roche/praticable */
function smooth(g: ShapeGrid, passes: number): void {
  for (let p = 0; p < passes; p++) {
    const next = g.c.slice();
    for (let y = 1; y < g.rows - 1; y++)
      for (let x = 1; x < g.cols - 1; x++) {
        const v = g.c[y * g.cols + x];
        if (v !== OPEN && v !== ROCK) continue;
        let n = 0;
        let haz = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const w = g.c[(y + dy) * g.cols + x + dx];
            if (w === OPEN) n++;
            else if (w !== ROCK) haz++;
          }
        if (haz) continue;
        if (v === ROCK && n >= 5) next[y * g.cols + x] = OPEN;
        else if (v === OPEN && n <= 2) next[y * g.cols + x] = ROCK;
      }
    g.c.set(next);
  }
}

/* ------------------------------------------------------------------ */
/* Générateurs                                                          */
/* ------------------------------------------------------------------ */

type Gen = (rng: Rng, g: ShapeGrid, v: string | undefined) => Omit<Shape, 'g'>;

const corner = (rng: Rng, g: ShapeGrid): Pt => {
  const k = rng.int(4);
  return [k & 1 ? g.cols - 1 : 0, k & 2 ? g.rows - 1 : 0];
};
const nearest = <T extends { x: number; y: number }>(arr: T[], p: Pt): T => arr.reduce((b, c) => (Math.hypot(c.x - p[0], c.y - p[1]) < Math.hypot(b.x - p[0], b.y - p[1]) ? c : b));
const farthest = <T extends { x: number; y: number }>(arr: T[], p: Pt): T => arr.reduce((b, c) => (Math.hypot(c.x - p[0], c.y - p[1]) > Math.hypot(b.x - p[0], b.y - p[1]) ? c : b));

/** Cavernes / clairières organiques reliées par des boyaux sinueux */
const caves: Gen = (rng, g, v) => {
  const lobes = v === 'lobes';
  const n = Math.max(5, Math.round(boxArea(g) / (lobes ? 3000 : 1300)));
  const ch = scatterCircles(rng, g, n, g.u(lobes ? 14 : 9), g.u(lobes ? 22 : 15), 2.5, g.u(lobes ? 7 : 5));
  for (const c of ch) g.blob(rng, c.x, c.y, c.r, OPEN, 0.3, rng.chance(0.4) ? 1 : 0);
  for (const [i, j] of mst(rng, ch, lobes ? 2 : 4)) g.path(meander(rng, [ch[i].x, ch[i].y], [ch[j].x, ch[j].y], 0.2, 2), g.u(lobes ? 11 : 7), OPEN);
  // îlots de roche/arbres dans les grandes clairières
  for (const c of ch) if (c.r > g.u(12) && rng.chance(0.6)) g.blob(rng, c.x + rng.float(-0.3, 0.3) * c.r, c.y + rng.float(-0.3, 0.3) * c.r, g.u(rng.float(2.5, 4)), ROCK, 0.3);
  smooth(g, 2);
  const s = nearest(ch, corner(rng, g));
  const b = farthest(ch, [s.x, s.y]);
  return { start: [s.x, s.y], boss: [b.x, b.y], pockets: ch.filter((c) => c !== s && c !== b).map((c) => [c.x, c.y] as Pt), structures: [], deco: [] };
};

/** Cratère : couronne extérieure, bassin central, rampes à l'opposé du départ, alcôves ; « abysse » : vide central, île et ponts */
const crater: Gen = (rng, g, v) => {
  const abyss = v === 'abyss';
  const cx = g.cols / 2;
  const cy = g.rows / 2;
  const Ro = Math.min(g.cols, g.rows) / 2 - 2.5;
  const L = lin(g, 170);
  const ring = g.u(abyss ? 16 : 14) * L;
  const ph = [rng.float(0, 6.3), rng.float(0, 6.3), rng.float(0, 6.3)];
  const edge = (a: number) => Ro * (1 + 0.06 * Math.sin(3 * a + ph[0]) + 0.04 * Math.sin(5 * a + ph[1]));
  const inner = (a: number) => edge(a) - ring * (1 + 0.2 * Math.sin(4 * a + ph[2]));
  const basin = (a: number) => Ro * (abyss ? 0.2 : 0.42) * (1 + 0.1 * Math.sin(3 * a + ph[1]));
  const rim = v === 'rock' ? ROCK : HAZ;
  for (let y = 0; y < g.rows; y++)
    for (let x = 0; x < g.cols; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      if (d > edge(a)) continue;
      if (d > inner(a)) g.set(x, y, OPEN);
      else if (d <= basin(a)) g.set(x, y, OPEN, 1);
      else g.set(x, y, abyss ? HAZ : rim);
    }
  const a0 = rng.float(0, Math.PI * 2);
  const at = (a: number, r: number): Pt => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  const nr = abyss ? 2 : 3;
  for (let k = 0; k < nr; k++) {
    const a = a0 + Math.PI + (k - (nr - 1) / 2) * (abyss ? 1.1 : 0.8) + rng.float(-0.15, 0.15);
    g.path(meander(rng, at(a, inner(a) + 1), at(a, basin(a) - 1), abyss ? 0.12 : 0.05, 2), g.u(abyss ? 6 : 8) * Math.min(L, 1.25), OPEN, 1);
  }
  const pockets: Pt[] = [];
  const np = Math.round(5 * L);
  for (let k = 0; k < np; k++) {
    const a = a0 + 0.9 + (k / np) * (Math.PI * 2 - 1.8) + rng.float(-0.2, 0.2);
    const r = g.u(rng.float(5, 7)) * Math.min(L, 1.2);
    const p = at(a, Math.min(edge(a) + r * 0.5, Math.min(cx, cy) - r - 1));
    g.blob(rng, p[0], p[1], r, OPEN, 0.25);
    pockets.push(p);
  }
  const deco: Deco[] = [];
  if (!abyss)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const p = at(a, basin(a) * 0.62);
      deco.push({ role: v === 'rock' ? 'grave' : 'brazier', x: p[0] * g.cell, y: p[1] * g.cell });
    }
  return { start: at(a0, (edge(a0) + inner(a0)) / 2), boss: [cx, cy], pockets, structures: [], deco };
};

/** Îlots dans une mer de danger (lave, vide) reliés par des ponts */
const islands: Gen = (rng, g, v) => {
  g.c.fill(HAZ);
  const shards = v === 'shards';
  const frag = v === 'fragments';
  const n = Math.max(5, Math.round(boxArea(g) / (shards ? 1500 : frag ? 2200 : 1700)));
  const isl = scatterCircles(rng, g, n, g.u(shards ? 9 : frag ? 11 : 9), g.u(shards ? 14 : frag ? 18 : 15), 1.5, g.u(shards ? 8 : 6));
  for (const c of isl) g.blob(rng, c.x, c.y, c.r, OPEN, frag ? 0.4 : 0.3);
  for (const [i, j] of mst(rng, isl, shards ? 2 : 4)) {
    const a: Pt = [isl[i].x, isl[i].y];
    const b: Pt = [isl[j].x, isl[j].y];
    g.path(shards ? [a, b] : meander(rng, a, b, 0.1, 1), g.u(shards ? 5 : 6), OPEN, 1);
  }
  // affleurements rocheux sur les grands fragments
  if (frag) for (const c of isl) if (c.r > g.u(12)) g.blob(rng, c.x + rng.float(-0.4, 0.4) * c.r, c.y + rng.float(-0.4, 0.4) * c.r, g.u(rng.float(2.5, 4)), ROCK, 0.3);
  const s = nearest(isl, corner(rng, g));
  const b = farthest(isl, [s.x, s.y]);
  return { start: [s.x, s.y], boss: [b.x, b.y], pockets: isl.filter((c) => c !== s && c !== b).map((c) => [c.x, c.y] as Pt), structures: [], deco: [] };
};

/** Vallée traversée par une rivière sinueuse (et un affluent), franchie à quelques gués */
const river: Gen = (rng, g) => {
  envelope(rng, g, 2, OPEN, 3, 0.12);
  const W = g.u(rng.float(9, 11));
  const A = g.rows * 0.16;
  const ph = rng.float(0, 6.3);
  const yAt = (x: number) => g.rows / 2 + A * Math.sin((x / g.cols) * Math.PI * 2.2 + ph) + A * 0.35 * Math.sin((x / g.cols) * Math.PI * 5 + ph * 2);
  const pts: Pt[] = [];
  for (let x = -2; x <= g.cols + 2; x += 2) pts.push([x, yAt(x)]);
  g.path(pts, W, HAZ);
  // affluent venu du nord
  const tx = g.cols * rng.float(0.3, 0.7);
  g.path(meander(rng, [tx + rng.float(-8, 8), -2], [tx, yAt(tx)], 0.15, 2), W * 0.7, HAZ);
  // gués (praticables, sol secondaire)
  const nf = Math.max(3, Math.round(3 * lin(g, 125)));
  const fx = Array.from({ length: nf }, (_, k) => g.cols * (0.18 + (0.64 * k) / (nf - 1) + rng.float(-0.04, 0.04)));
  for (const x of fx) if (Math.abs(x - tx) > g.u(14)) g.rect(x - g.u(4), yAt(x) - W, x + g.u(4), yAt(x) + W, OPEN, 1);
  g.rect(tx - W, g.rows * 0.18, tx + W, g.rows * 0.18 + g.u(8), OPEN, 1);
  // rochers épars
  for (let k = 0, nr = Math.round(boxArea(g) / 1700); k < nr; k++) {
    const x = rng.float(4, g.cols - 4);
    const y = rng.float(4, g.rows - 4);
    if (Math.abs(y - yAt(x)) > W + g.u(5)) g.blob(rng, x, y, g.u(rng.float(2, 3.5)), ROCK, 0.3);
  }
  const sx = g.cols * 0.12;
  const bx = g.cols * 0.88;
  return {
    start: [sx, Math.min(g.rows - 4, yAt(sx) + g.rows * 0.25)],
    boss: [bx, Math.max(4, yAt(bx) - g.rows * 0.25)],
    pockets: [
      [g.cols * 0.5, Math.max(4, yAt(g.cols * 0.5) - g.rows * 0.3)],
      [g.cols * 0.75, Math.min(g.rows - 4, yAt(g.cols * 0.75) + g.rows * 0.3)],
    ],
    structures: [],
    deco: [],
  };
};

/** Canyon sinueux d'un coin à l'autre, élargissements et culs-de-sac latéraux */
const canyon: Gen = (rng, g) => {
  const flip = rng.chance(0.5);
  const L = lin(g, 196);
  const P = (fx: number, fy: number): Pt => [fx * g.cols, (flip ? 1 - fy : fy) * g.rows];
  const n = 6;
  const ctrl: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const off = k === 0 || k === n - 1 ? 0 : (k % 2 ? 1 : -1) * rng.float(0.16, 0.26);
    ctrl.push(P(Math.min(0.9, Math.max(0.1, 0.1 + 0.8 * t + off)), Math.min(0.9, Math.max(0.1, 0.1 + 0.8 * t - off))));
  }
  const line: Pt[] = [];
  for (let k = 1; k < ctrl.length; k++) line.push(...meander(rng, ctrl[k - 1], ctrl[k], 0.12, 2).slice(k > 1 ? 1 : 0));
  for (let k = 1; k < line.length; k++) g.line(line[k - 1][0], line[k - 1][1], line[k][0], line[k][1], g.u(rng.float(15, 21)) * L, OPEN, k % 3 ? 0 : 1);
  for (let k = 0; k < 7; k++) {
    const p = line[1 + rng.int(line.length - 2)];
    g.blob(rng, p[0], p[1], g.u(rng.float(10, 14)) * L, OPEN, 0.3);
  }
  const pockets: Pt[] = [];
  for (let k = 0, np = Math.round(4 * L); k < np; k++) {
    const i = 2 + rng.int(Math.max(1, line.length - 4));
    const [a, b] = [line[i - 1], line[i]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const sgn = rng.chance(0.5) ? 1 : -1;
    const D = g.u(rng.float(16, 24)) * L;
    const e: Pt = [b[0] - ((b[1] - a[1]) / len) * D * sgn, b[1] + ((b[0] - a[0]) / len) * D * sgn];
    e[0] = Math.max(4, Math.min(g.cols - 4, e[0]));
    e[1] = Math.max(4, Math.min(g.rows - 4, e[1]));
    g.path(meander(rng, b, e, 0.2, 1), g.u(7), OPEN);
    g.blob(rng, e[0], e[1], g.u(rng.float(5, 7)) * Math.min(L, 1.25), OPEN, 0.25);
    pockets.push(e);
  }
  const end = line[line.length - 1];
  g.blob(rng, end[0], end[1], g.u(10) * Math.min(L, 1.25), OPEN, 0.2, 1);
  smooth(g, 1);
  return { start: line[0], boss: end, pockets, structures: [], deco: [] };
};

/** Route en lacets bordée de lave : quatre traversées reliées par des virages, placettes latérales */
const road: Gen = (rng, g) => {
  // une traversée par ~40 unités de hauteur : la route s'allonge avec la carte, sa largeur reste celle d'une route
  const legs = Math.max(4, Math.round((g.rows * g.cell) / 40));
  const m = 3 + g.u(8);
  const W = g.u(13);
  const pts: Pt[] = [];
  for (let k = 0; k < legs; k++) {
    const y = g.rows * ((k + 0.5) / legs);
    const xs: [number, number] = k % 2 ? [g.cols - m, m] : [m, g.cols - m];
    pts.push([xs[0], y + rng.float(-1, 1)], [xs[1], y + rng.float(-1, 1)]);
  }
  const line: Pt[] = [];
  for (let k = 1; k < pts.length; k++) line.push(...meander(rng, pts[k - 1], pts[k], k % 2 ? 0.06 : 0.02, 2).slice(k > 1 ? 1 : 0));
  g.path(line, W + g.u(14), HAZ);
  g.path(line, W, OPEN, 1);
  for (let k = 1; k < pts.length - 1; k++) g.disk(pts[k][0], pts[k][1], W * 0.85, OPEN, 0);
  // placettes latérales qui percent la lave
  const pockets: Pt[] = [];
  for (let k = 0; k < legs; k++) {
    const y = g.rows * ((k + 0.5) / legs);
    const x = g.cols * rng.float(0.3, 0.7);
    const side = k === 0 ? 1 : k === legs - 1 ? -1 : rng.chance(0.5) ? 1 : -1;
    const py = y + side * (W / 2 + g.u(9));
    g.line(x, y, x, py, g.u(6), OPEN);
    g.blob(rng, x, py, g.u(6.5), OPEN, 0.25);
    pockets.push([x, py]);
  }
  g.disk(pts[0][0], pts[0][1], W * 0.8, OPEN, 0);
  const end = pts[pts.length - 1];
  g.disk(end[0], end[1], W * 0.9, OPEN, 1);
  return { start: pts[0], boss: end, pockets, structures: [], deco: [] };
};

/** Village, ville en ruine, marché : îlots de bâtiments, rues irrégulières, places (et cimetière) */
const village: Gen = (rng, g, v) => {
  const indoor = g.cell >= 4;
  const town = envelope(rng, g, indoor ? 1 : 2, OPEN, 2.2, 0.24);
  const core = envelope(rng, g, indoor ? 1 : 2, -1, 2.2, 0.2, undefined, 0.82);
  for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (g.isOpen(x, y) && core(x, y)) g.floor[y * g.cols + x] = 1;
  const lot = indoor ? 4 : 9; // cases par lot (16 / 18 unités)
  const ox = rng.int(lot);
  const oy = rng.int(lot);
  const structures: Structure[] = [];
  const deco: Deco[] = [];
  const pockets: Pt[] = [];
  const cx = g.cols / 2;
  const cy = g.rows / 2;
  // cimetière (Westmarch) : un bloc de 2×2 lots au bord du bourg
  let cem: [number, number, number, number] | null = null;
  if (v === 'cemetery') {
    const a = rng.float(0, Math.PI * 2);
    const px = cx + Math.cos(a) * g.cols * 0.27;
    const py = cy + Math.sin(a) * g.rows * 0.27;
    cem = [px - lot, py - lot, px + lot, py + lot];
    for (let gy = cem[1] + 2; gy < cem[3] - 1; gy += 2) for (let gx = cem[0] + 2; gx < cem[2] - 1; gx += 1.5) if (rng.chance(0.75)) deco.push({ role: 'grave', x: gx * g.cell, y: gy * g.cell });
    for (let fx = cem[0] + 1; fx < cem[2] - 1; fx += 1.5) {
      if (Math.abs(fx - (cem[0] + cem[2]) / 2) > 2) deco.push({ role: 'fence_a', x: fx * g.cell, y: (cem[1] + 0.5) * g.cell });
      deco.push({ role: 'fence_a', x: fx * g.cell, y: (cem[3] - 0.5) * g.cell });
    }
    pockets.push([(cem[0] + cem[2]) / 2, (cem[1] + cem[3]) / 2]);
  }
  const plazaR = v === 'market' ? lot * 1.6 : 0;
  for (let ly = oy - lot; ly < g.rows; ly += lot)
    for (let lx = ox - lot; lx < g.cols; lx += lot) {
      const mx = lx + lot / 2;
      const my = ly + lot / 2;
      if (!core(Math.floor(mx), Math.floor(my))) continue;
      if (cem && mx > cem[0] && mx < cem[2] && my > cem[1] && my < cem[3]) continue;
      if (plazaR && Math.hypot(mx - cx, my - cy) < plazaR) continue;
      const r = rng.next();
      if (r < 0.13) {
        // placette : un puits, des étals, des colonnes
        pockets.push([mx, my]);
        if (rng.chance(0.5)) deco.push({ role: indoor ? 'column' : 'well', x: mx * g.cell, y: my * g.cell });
        continue;
      }
      if (r < 0.2) continue;
      // bâtiment : taille selon le style, aligné sur les cases paires (murs de 4 unités)
      let kind: Structure['kind'] = 'house';
      let s = indoor ? rng.range(2, 3) : 3;
      if (v === 'ruins') kind = rng.chance(0.2) ? 'big' : 'ruin';
      else if (v === 'market') kind = rng.chance(0.3) ? 'tent' : rng.chance(0.3) ? 'big' : 'ruin';
      else if (v === 'town') kind = rng.chance(0.15) ? 'tower' : rng.chance(0.15) ? 'big' : 'house';
      else kind = rng.chance(0.15) ? 'big' : 'house';
      if (!indoor) s = kind === 'big' ? 4 : kind === 'tower' || kind === 'tent' ? 2 : 3;
      const sw = indoor ? s + rng.int(2) : s;
      const sh = indoor ? s + rng.int(2) : s;
      const fx = Math.max(lx + 1, Math.min(lx + lot - 1 - sw, lx + Math.floor((lot - sw) / 2) + rng.range(-1, 1)));
      const fy = Math.max(ly + 1, Math.min(ly + lot - 1 - sh, ly + Math.floor((lot - sh) / 2) + rng.range(-1, 1)));
      const bx = indoor ? fx : fx - (fx & 1);
      const by = indoor ? fy : fy - (fy & 1);
      let ok = true;
      for (let y = by - 1; y <= by + sh && ok; y++) for (let x = bx - 1; x <= bx + sw && ok; x++) if (!g.isOpen(x, y)) ok = false;
      if (!ok) continue;
      g.rect(bx, by, bx + sw, by + sh, WALL, 0);
      // ruines : murs effondrés (intérieur seulement : les décors extérieurs restent entiers)
      if (indoor && v === 'ruins' && sw * sh >= 6 && rng.chance(0.5)) {
        g.set(bx + rng.int(sw), by + (rng.chance(0.5) ? 0 : sh - 1), OPEN);
        deco.push({ role: 'rubble', x: (bx + sw / 2) * g.cell, y: (by + sh + 0.6) * g.cell });
      }
      if (!indoor) structures.push({ x0: bx, y0: by, x1: bx + sw, y1: by + sh, kind });
    }
  // ville en ruine : pans effondrés (amas de décombres infranchissables)
  if (v === 'ruins' && !indoor)
    for (let k = 0, nr = Math.round(boxArea(g) / 3700); k < nr; k++) {
      const x = cx + rng.float(-0.3, 0.3) * g.cols;
      const y = cy + rng.float(-0.3, 0.3) * g.rows;
      g.blob(rng, x, y, g.u(rng.float(4, 6)), ROCK, 0.35);
    }
  if (plazaR) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + rng.float(-0.1, 0.1);
      const r = plazaR * rng.float(0.35, 0.7);
      deco.push({ role: 'stall', x: (cx + Math.cos(a) * r) * g.cell, y: (cy + Math.sin(a) * r) * g.cell });
    }
    deco.push({ role: 'well', x: cx * g.cell, y: cy * g.cell });
  }
  // départ aux faubourgs, boss sur une place à l'opposé
  const a0 = rng.float(0, Math.PI * 2);
  const at = (a: number, f: number): Pt => [cx + Math.cos(a) * g.cols * f, cy + Math.sin(a) * g.rows * f];
  const boss = at(a0 + Math.PI, 0.36);
  g.disk(boss[0], boss[1], g.u(9), OPEN, 1);
  for (let k = structures.length - 1; k >= 0; k--) {
    const s = structures[k];
    if (g.get(s.x0, s.y0) !== WALL || g.get(s.x1 - 1, s.y1 - 1) !== WALL || g.get(s.x0, s.y1 - 1) !== WALL || g.get(s.x1 - 1, s.y0) !== WALL) {
      g.rect(s.x0, s.y0, s.x1, s.y1, OPEN);
      structures.splice(k, 1);
    }
  }
  void town;
  return { start: at(a0, 0.42), boss, pockets, structures, deco };
};

/** Salles de tailles variées autour d'une grande salle, couloirs droits, coudés ou diagonaux (variantes : bassins, bibliothèque) */
const halls: Gen = (rng, g, v) => {
  const rooms: { x: number; y: number; w: number; h: number }[] = [];
  const bw = v === 'citadel' ? 9 : 7;
  const bh = v === 'citadel' ? 7 : 6;
  const cx0 = Math.floor(g.cols / 2 - bw / 2 + rng.range(-2, 2));
  const cy0 = Math.floor(g.rows / 2 - bh / 2 + rng.range(-2, 2));
  rooms.push({ x: cx0, y: cy0, w: bw, h: bh });
  const want = Math.round((g.cols * g.rows) / (v === 'library' ? 30 : 34));
  for (let t = 0; t < 900 && rooms.length < want; t++) {
    const w = rng.range(3, 7);
    const h = rng.range(3, 6);
    const x = rng.range(1, g.cols - w - 2);
    const y = rng.range(1, g.rows - h - 2);
    if (rooms.every((r) => x + w + 1 < r.x || r.x + r.w + 1 < x || y + h + 1 < r.y || r.y + r.h + 1 < y)) rooms.push({ x, y, w, h });
  }
  const ctr = rooms.map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 }));
  for (const r of rooms) g.rect(r.x, r.y, r.x + r.w, r.y + r.h, OPEN, 1);
  const deco: Deco[] = [];
  const edges = mst(rng, ctr, v === 'citadel' ? 5 : 3);
  for (const [i, j] of edges) {
    const a = ctr[i];
    const b = ctr[j];
    if (rng.chance(v === 'citadel' ? 0.5 : 0.25)) g.line(a.x, a.y, b.x, b.y, 1.7, OPEN);
    else {
      const w = rng.chance(0.3) ? 2 : 1;
      const ex = rng.chance(0.5);
      const mid: Pt = ex ? [b.x, a.y] : [a.x, b.y];
      g.rect(Math.min(a.x, mid[0]) - w / 2, Math.min(a.y, mid[1]) - w / 2, Math.max(a.x, mid[0]) + w / 2, Math.max(a.y, mid[1]) + w / 2, OPEN);
      g.rect(Math.min(b.x, mid[0]) - w / 2, Math.min(b.y, mid[1]) - w / 2, Math.max(b.x, mid[0]) + w / 2, Math.max(b.y, mid[1]) + w / 2, OPEN);
    }
  }
  for (const [k, r] of rooms.entries()) {
    // bassins : eau croupie au centre des grandes salles, margelle praticable
    if (v === 'pools' && r.w >= 5 && r.h >= 4) g.rect(r.x + 1, r.y + 1, r.x + r.w - 1, r.y + r.h - 1, HAZ);
    // bibliothèque : rayonnages (murs bas) en rangées dans les grandes salles
    if (v === 'library' && r.w >= 5 && r.h >= 5) for (let y = r.y + 1; y < r.y + r.h - 1; y += 2) g.rect(r.x + 1, y, r.x + r.w - 1 - ((y >> 1) & 1), y + 1, WALL);
    // grande salle : colonnade
    if (k === 0) for (let x = r.x + 1; x < r.x + r.w; x += 2) for (const y of [r.y + 0.75, r.y + r.h - 0.75]) deco.push({ role: 'column', x: x * g.cell, y: y * g.cell });
  }
  // les bassins ne coupent pas les couloirs : les couloirs retracés par-dessus restent praticables
  if (v === 'pools')
    for (const [i, j] of edges) {
      const a = ctr[i];
      const b = ctr[j];
      g.line(a.x, a.y, b.x, b.y, 1.2, OPEN);
    }
  const s = nearest(ctr, corner(rng, g));
  const deg = new Map<number, number>();
  for (const [i, j] of edges) (deg.set(i, (deg.get(i) ?? 0) + 1), deg.set(j, (deg.get(j) ?? 0) + 1));
  const b = farthest(ctr, [s.x, s.y]);
  const pockets = ctr.filter((c, i) => c !== s && c !== b && (deg.get(i) ?? 0) <= 1).map((c) => [c.x, c.y] as Pt);
  return { start: [s.x, s.y], boss: [b.x, b.y], pockets, structures: [], deco };
};

/** Spirale (escargot) vers l'arène centrale, deux brèches de raccourci */
const spiral: Gen = (rng, g) => {
  const cx = g.cols / 2;
  const cy = g.rows / 2;
  const corr = 3;
  const wall = 1.6;
  const p = corr + wall;
  const R0 = 3.6;
  const Rmax = Math.min(cx, cy) - 1.2;
  const dir = rng.chance(0.5) ? 1 : -1;
  const a0 = rng.float(0, Math.PI * 2);
  const band = (x: number, y: number) => {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    let a = dir * (Math.atan2(y + 0.5 - cy, x + 0.5 - cx) - a0);
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return { d, t: (((d - R0 - (a / (Math.PI * 2)) * p) % p) + p) % p, a };
  };
  for (let y = 0; y < g.rows; y++)
    for (let x = 0; x < g.cols; x++) {
      const { d, t } = band(x, y);
      if (d <= R0 + 0.5) g.set(x, y, OPEN, 1);
      else if (d <= Rmax) g.set(x, y, t < wall ? ROCK : OPEN, 0);
    }
  // brèches décalées : chaque tour de mur est percé une fois (raccourci d'un tour au suivant), à des angles
  // tournants — on suit la spirale sans devoir en faire tout le tour pour un monstre vu à travers le mur
  const pockets: Pt[] = [];
  const turns = Math.ceil((Rmax - R0) / p);
  for (let k = 0; k < turns; k++) {
    const a = a0 + Math.PI * (0.6 + k * 1.15) + rng.float(-0.25, 0.25);
    const runs: number[] = [];
    let inWall = false;
    let r0 = 0;
    for (let r = R0 + 0.5; r <= Rmax; r += 0.25) {
      const w = g.get(Math.floor(cx + Math.cos(a) * r), Math.floor(cy + Math.sin(a) * r)) !== OPEN;
      if (w && !inWall) r0 = r;
      if (!w && inWall) runs.push((r0 + r) / 2);
      inWall = w;
    }
    const r = runs[Math.min(k, runs.length - 1)];
    if (r !== undefined) g.disk(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.5, OPEN);
  }
  // alcôves dans le mur extérieur
  for (let k = 0; k < 4; k++) {
    const a = a0 + 0.8 + k * 1.4;
    const r = Rmax - 1;
    const pt: Pt = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    pockets.push(pt);
  }
  const deco: Deco[] = [];
  for (let k = 0; k < 4; k++) deco.push({ role: 'brazier', x: (cx + Math.cos(k * 1.57 + 0.78) * 2.6) * g.cell, y: (cy + Math.sin(k * 1.57 + 0.78) * 2.6) * g.cell });
  return { start: [cx + Math.cos(a0 + dir * 0.3) * (Rmax - 2), cy + Math.sin(a0 + dir * 0.3) * (Rmax - 2)], boss: [cx, cy], pockets, structures: [], deco };
};

/** Étoile : un moyeu (arène) et des bras sinueux terminés par des poches */
const star: Gen = (rng, g, v) => {
  const indoor = g.cell >= 4;
  const cx = g.cols / 2 + rng.float(-1, 1);
  const cy = g.rows / 2 + rng.float(-1, 1);
  const arms = v === 'oasis' ? 6 : 5;
  // moyeu, bras et poches à l'échelle de la boîte (une étoile plus grande, pas plus de bras)
  const L = lin(g, 184);
  const hubR = g.u(v === 'oasis' ? 16 : 14) * L;
  g.blob(rng, cx, cy, hubR, OPEN, indoor ? 0.05 : 0.25, 1);
  if (v === 'oasis') g.blob(rng, cx, cy, hubR * 0.4, HAZ, 0.2);
  const a0 = rng.float(0, Math.PI * 2);
  const ends: Pt[] = [];
  const pockets: Pt[] = [];
  const R = Math.min(g.cols, g.rows) / 2;
  for (let k = 0; k < arms; k++) {
    const a = a0 + (k / arms) * Math.PI * 2 + rng.float(-0.2, 0.2);
    const endR = g.u(rng.float(9, 12)) * L;
    const reach = R - endR - 1.5;
    const e: Pt = [g.cols / 2 + Math.cos(a) * reach, g.rows / 2 + Math.sin(a) * reach];
    const pts = meander(rng, [cx + Math.cos(a) * hubR * 0.7, cy + Math.sin(a) * hubR * 0.7], e, indoor ? 0.08 : 0.16, 2);
    g.path(pts, g.u(v === 'oasis' ? 15 : 12) * L, OPEN, indoor ? 1 : 0);
    if (indoor) g.rect(e[0] - endR, e[1] - endR * 0.8, e[0] + endR, e[1] + endR * 0.8, OPEN, 1);
    else g.blob(rng, e[0], e[1], endR, OPEN, 0.25, 1);
    ends.push(e);
    // poches latérales le long du bras
    for (const f of [0.4, 0.75]) {
      if (!rng.chance(0.7)) continue;
      const m = pts[Math.floor(pts.length * f)];
      const sgn = rng.chance(0.5) ? 1 : -1;
      const q: Pt = [m[0] - Math.sin(a) * g.u(14) * L * sgn, m[1] + Math.cos(a) * g.u(14) * L * sgn];
      g.line(m[0], m[1], q[0], q[1], g.u(8), OPEN);
      if (indoor) g.rect(q[0] - g.u(7) * L, q[1] - g.u(6) * L, q[0] + g.u(7) * L, q[1] + g.u(6) * L, OPEN);
      else g.blob(rng, q[0], q[1], g.u(7.5) * L, OPEN, 0.2);
      pockets.push(q);
    }
  }
  const deco: Deco[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    deco.push({ role: indoor ? 'column' : 'rubble', x: (cx + Math.cos(a) * hubR * 0.72) * g.cell, y: (cy + Math.sin(a) * hubR * 0.72) * g.cell });
  }
  const s = ends[0];
  const b = ends.reduce((best, e) => (Math.hypot(e[0] - s[0], e[1] - s[1]) > Math.hypot(best[0] - s[0], best[1] - s[1]) ? e : best));
  for (const e of ends) if (e !== s && e !== b) pockets.push(e);
  return { start: s, boss: b, pockets, structures: [], deco };
};

/** Labyrinthe de haies (forêt) avec clairières */
const hedges: Gen = (rng, g) => {
  const corr = 4;
  const hedge = 2;
  const k = corr + hedge;
  const MX = Math.floor((g.cols - hedge - 2) / k);
  const MY = Math.floor((g.rows - hedge - 2) / k);
  const offX = Math.floor((g.cols - MX * k - hedge) / 2);
  const offY = Math.floor((g.rows - MY * k - hedge) / 2);
  const ph = [rng.float(0, 6.3), rng.float(0, 6.3)];
  const inMask = (i: number, j: number) => {
    const dx = (i + 0.5) / MX - 0.5;
    const dy = (j + 0.5) / MY - 0.5;
    const a = Math.atan2(dy, dx);
    return Math.hypot(dx, dy) <= 0.5 * (1 + 0.12 * Math.sin(3 * a + ph[0]) + 0.08 * Math.sin(5 * a + ph[1]));
  };
  const cells: Pt[] = [];
  for (let j = 0; j < MY; j++) for (let i = 0; i < MX; i++) if (inMask(i, j)) cells.push([i, j]);
  const key = (i: number, j: number) => j * MX + i;
  const live = new Set(cells.map(([i, j]) => key(i, j)));
  const seen = new Set<number>();
  const st = cells.reduce((b, c) => (c[0] + c[1] < b[0] + b[1] ? c : b));
  const stack: Pt[] = [st];
  seen.add(key(st[0], st[1]));
  const carveCell = (i: number, j: number) => g.rect(offX + hedge + i * k, offY + hedge + j * k, offX + hedge + i * k + corr, offY + hedge + j * k + corr, OPEN);
  const link = (a: Pt, b: Pt) => {
    const x0 = offX + hedge + Math.min(a[0], b[0]) * k;
    const y0 = offY + hedge + Math.min(a[1], b[1]) * k;
    if (a[0] !== b[0]) g.rect(x0, y0, x0 + k + corr, y0 + corr, OPEN);
    else g.rect(x0, y0, x0 + corr, y0 + k + corr, OPEN);
  };
  carveCell(st[0], st[1]);
  const dirs: Pt[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (stack.length) {
    const c = stack[stack.length - 1];
    const free = dirs.map(([dx, dy]) => [c[0] + dx, c[1] + dy] as Pt).filter(([i, j]) => live.has(key(i, j)) && !seen.has(key(i, j)) && i >= 0 && j >= 0 && i < MX && j < MY);
    if (!free.length) {
      stack.pop();
      continue;
    }
    const n = rng.pick(free);
    seen.add(key(n[0], n[1]));
    carveCell(n[0], n[1]);
    link(c, n);
    stack.push(n);
  }
  // boucles
  for (let t = 0; t < cells.length * 0.22; t++) {
    const c = rng.pick(cells);
    const [dx, dy] = rng.pick(dirs);
    const n: Pt = [c[0] + dx, c[1] + dy];
    if (live.has(key(n[0], n[1])) && n[0] >= 0 && n[1] >= 0 && n[0] < MX && n[1] < MY) link(c, n);
  }
  const at = (c: Pt): Pt => [offX + hedge + c[0] * k + corr / 2, offY + hedge + c[1] * k + corr / 2];
  const s = at(st);
  const far = cells.reduce((b, c) => (Math.hypot(at(c)[0] - s[0], at(c)[1] - s[1]) > Math.hypot(at(b)[0] - s[0], at(b)[1] - s[1]) ? c : b));
  const pockets: Pt[] = [];
  const deco: Deco[] = [];
  // clairières (pelouses), dont l'arène du boss
  for (let t = 0, nc = Math.round(boxArea(g) / 4100); t < nc; t++) {
    const c = at(rng.pick(cells));
    if (Math.hypot(c[0] - s[0], c[1] - s[1]) < g.u(25)) continue;
    g.blob(rng, c[0], c[1], g.u(rng.float(7, 10)), OPEN, 0.2, 1);
    pockets.push(c);
    deco.push({ role: 'well', x: c[0] * g.cell, y: c[1] * g.cell });
  }
  const b = at(far);
  g.blob(rng, b[0], b[1], g.u(10), OPEN, 0.15, 1);
  return { start: s, boss: b, pockets, structures: [], deco };
};

/** Anneaux concentriques (arène, citadelle) : couloirs annulaires, portes alternées, cloisons radiales */
const rings: Gen = (rng, g, v) => {
  const square = v === 'square';
  const cx = g.cols / 2;
  const cy = g.rows / 2;
  const corr = 3;
  const wall = square ? 1 : 1.5;
  const p = corr + wall;
  const R0 = square ? 3 : 3.5;
  const Rmax = Math.min(cx, cy) - 1;
  const dist = (dx: number, dy: number) => (square ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy));
  const nb = Math.floor((Rmax - R0) / p);
  const gates: number[] = [];
  const divs: number[] = [];
  let ga = rng.float(0, Math.PI * 2);
  for (let k = 0; k <= nb; k++) {
    gates.push(ga);
    divs.push(ga + Math.PI * rng.float(0.55, 0.85) * (rng.chance(0.5) ? 1 : -1));
    ga += Math.PI * rng.float(0.6, 1.2) * (rng.chance(0.5) ? 1 : -1);
  }
  const angDiff = (a: number, b: number) => Math.abs(((((a - b) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  for (let y = 0; y < g.rows; y++)
    for (let x = 0; x < g.cols; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = dist(dx, dy);
      const a = Math.atan2(dy, dx);
      if (d <= R0) {
        g.set(x, y, OPEN, 1);
        continue;
      }
      if (d > R0 + nb * p) continue;
      const k = Math.floor((d - R0) / p);
      const t = d - R0 - k * p;
      const r = R0 + k * p;
      if (t < wall) {
        // mur de l'anneau k : une porte (deux sur les grands anneaux)
        const gw = 1.6 / Math.max(r, 1);
        const open = angDiff(a, gates[k]) < gw || (k >= 2 && angDiff(a, gates[k] + Math.PI) < gw);
        g.set(x, y, open ? OPEN : ROCK, 0);
      } else {
        // cloison radiale dans le couloir k (une sur deux) : oblige à faire le tour
        const div = k % 2 === 1 && angDiff(a, divs[k]) < 0.8 / Math.max(r, 1);
        g.set(x, y, div ? ROCK : OPEN, 0);
      }
    }
  const pockets: Pt[] = [];
  // tours d'angle (citadelle) ou niches extérieures (arène)
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + (square ? Math.PI / 4 : rng.float(0, 1.5));
    const r = R0 + nb * p - 1;
    const q: Pt = [cx + Math.cos(a) * r * (square ? 1.3 : 1), cy + Math.sin(a) * r * (square ? 1.3 : 1)];
    q[0] = Math.max(3, Math.min(g.cols - 4, q[0]));
    q[1] = Math.max(3, Math.min(g.rows - 4, q[1]));
    g.rect(q[0] - 2, q[1] - 2, q[0] + 2, q[1] + 2, OPEN, 1);
    pockets.push(q);
  }
  const deco: Deco[] = [];
  for (let k = 0; k < 6; k++) deco.push({ role: 'column', x: (cx + Math.cos((k / 6) * Math.PI * 2) * (R0 - 1)) * g.cell, y: (cy + Math.sin((k / 6) * Math.PI * 2) * (R0 - 1)) * g.cell });
  const ao = gates[nb] + Math.PI;
  const ro = R0 + nb * p - corr / 2 - 0.5;
  return { start: [cx + Math.cos(ao) * ro, cy + Math.sin(ao) * ro], boss: [cx, cy], pockets, structures: [], deco };
};

/** Plateaux séparés par des falaises, reliés par des rampes droites ; sols alternés par plateau */
const plateaus: Gen = (rng, g) => {
  const pl = scatterCircles(rng, g, Math.max(5, Math.round(boxArea(g) / 2600)), g.u(12), g.u(19), 2, g.u(7));
  pl.forEach((c, i) => g.blob(rng, c.x, c.y, c.r, OPEN, 0.22, i % 2));
  const deco: Deco[] = [];
  for (const [i, j] of mst(rng, pl, 3)) {
    const a = pl[i];
    const b = pl[j];
    g.line(a.x, a.y, b.x, b.y, g.u(7), OPEN);
    const m: Pt = [(a.x + b.x) / 2, (a.y + b.y) / 2];
    deco.push({ role: 'rubble', x: (m[0] + 1.5) * g.cell, y: (m[1] - 1.5) * g.cell });
  }
  const s = nearest(pl, corner(rng, g));
  const b = farthest(pl, [s.x, s.y]);
  return { start: [s.x, s.y], boss: [b.x, b.y], pockets: pl.filter((c) => c !== s && c !== b).map((c) => [c.x, c.y] as Pt), structures: [], deco };
};

/** Champ ouvert lacéré de failles parallèles (lave, vide, tranchées), franchies à quelques passages */
const rifts: Gen = (rng, g, v) => {
  envelope(rng, g, 2, OPEN, 2.4, 0.12);
  const cx = g.cols / 2;
  const cy = g.rows / 2;
  const R = Math.min(cx, cy);
  const al = Math.PI / 4 + rng.float(-0.35, 0.35) + (rng.chance(0.5) ? Math.PI / 2 : 0);
  const dir: Pt = [Math.cos(al), Math.sin(al)];
  const nrm: Pt = [-dir[1], dir[0]];
  // une faille par ~40 unités (tranchées : ~32) : plus de failles sur une plus grande plaine
  const n = Math.max(v === 'trenches' ? 4 : 3, Math.round((Math.min(g.cols, g.rows) * g.cell) / (v === 'trenches' ? 32 : 42)));
  const W = g.u(v === 'trenches' ? 4 : 6);
  for (let k = 0; k < n; k++) {
    const s = ((k + 1) / (n + 1) - 0.5) * 1.7 * R + rng.float(-1, 1);
    const a: Pt = [cx + nrm[0] * s - dir[0] * R * 1.6, cy + nrm[1] * s - dir[1] * R * 1.6];
    const b: Pt = [cx + nrm[0] * s + dir[0] * R * 1.6, cy + nrm[1] * s + dir[1] * R * 1.6];
    const pts = meander(rng, a, b, 0.05, 3);
    g.path(pts, W, v === 'trenches' ? ROCK : HAZ);
    // passages (un ou deux), alternés d'une faille à l'autre
    const nc = k % 2 ? 1 : 2;
    for (let c = 0; c < nc; c++) {
      const t = (k % 2 ? 0.35 : -0.35) * R + (nc === 2 ? (c ? 0.45 : -0.2) * R : 0) + rng.float(-3, 3);
      const p: Pt = [cx + nrm[0] * s + dir[0] * t, cy + nrm[1] * s + dir[1] * t];
      g.line(p[0] - nrm[0] * (W + 2), p[1] - nrm[1] * (W + 2), p[0] + nrm[0] * (W + 2), p[1] + nrm[1] * (W + 2), g.u(8), OPEN, 1);
    }
  }
  const pockets: Pt[] = [];
  for (let k = 0; k < 3; k++) pockets.push([cx + nrm[0] * (k - 1) * R * 0.6 + dir[0] * R * 0.6 * (k % 2 ? 1 : -1), cy + nrm[1] * (k - 1) * R * 0.6 + dir[1] * R * 0.6 * (k % 2 ? 1 : -1)]);
  return {
    start: [cx - nrm[0] * R * 0.78 + dir[0] * R * 0.3, cy - nrm[1] * R * 0.78 + dir[1] * R * 0.3],
    boss: [cx + nrm[0] * R * 0.78 - dir[0] * R * 0.3, cy + nrm[1] * R * 0.78 - dir[1] * R * 0.3],
    pockets,
    structures: [],
    deco: [],
  };
};

/** Salles en croix sur un treillis, reliées bras à bras (tombe) */
const crosses: Gen = (rng, g) => {
  const S = 9;
  const nx = Math.max(2, Math.floor((g.cols - 4) / S));
  const ny = Math.max(2, Math.floor((g.rows - 4) / S));
  const ox = (g.cols - nx * S) / 2 + S / 2;
  const oy = (g.rows - ny * S) / 2 + S / 2;
  const nodes: { i: number; j: number; x: number; y: number }[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) if (!rng.chance(0.15) || (i + j) % 3 === 0) nodes.push({ i, j, x: Math.round(ox + i * S + rng.range(-1, 1)), y: Math.round(oy + j * S + rng.range(-1, 1)) });
  const at = new Map(nodes.map((n) => [`${n.i},${n.j}`, n]));
  const deco: Deco[] = [];
  for (const n of nodes) {
    const a = rng.range(3, 4);
    const w = rng.chance(0.4) ? 3 : 2;
    g.rect(n.x - w / 2, n.y - a, n.x + w / 2, n.y + a, OPEN, 1);
    g.rect(n.x - a, n.y - w / 2, n.x + a, n.y + w / 2, OPEN, 1);
    g.rect(n.x - 1.5, n.y - 1.5, n.x + 1.5, n.y + 1.5, OPEN, 1);
    if (rng.chance(0.5)) deco.push({ role: 'coffin', x: n.x * g.cell, y: (n.y - a + 0.9) * g.cell });
  }
  // arbre couvrant sur les voisins du treillis + boucles
  const seen = new Set<string>();
  const order = [nodes[rng.int(nodes.length)]];
  seen.add(`${order[0].i},${order[0].j}`);
  const links: [(typeof nodes)[0], (typeof nodes)[0]][] = [];
  const near = (n: (typeof nodes)[0]) =>
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
      .map(([dx, dy]) => at.get(`${n.i + dx},${n.j + dy}`))
      .filter((m): m is (typeof nodes)[0] => !!m);
  while (order.length) {
    const c = order[order.length - 1];
    const free = near(c).filter((m) => !seen.has(`${m.i},${m.j}`));
    if (!free.length) {
      order.pop();
      continue;
    }
    const m = rng.pick(free);
    seen.add(`${m.i},${m.j}`);
    links.push([c, m]);
    order.push(m);
  }
  for (const n of nodes) for (const m of near(n)) if (rng.chance(0.12)) links.push([n, m]);
  for (const [a, b] of links) {
    const mid: Pt = rng.chance(0.5) ? [b.x, a.y] : [a.x, b.y];
    g.rect(Math.min(a.x, mid[0]) - 0.5, Math.min(a.y, mid[1]) - 0.5, Math.max(a.x, mid[0]) + 0.5, Math.max(a.y, mid[1]) + 0.5, OPEN);
    g.rect(Math.min(b.x, mid[0]) - 0.5, Math.min(b.y, mid[1]) - 0.5, Math.max(b.x, mid[0]) + 0.5, Math.max(b.y, mid[1]) + 0.5, OPEN);
  }
  const s = nearest(nodes, corner(rng, g));
  const b = farthest(nodes, [s.x, s.y]);
  // sanctuaire du boss : grande croix
  g.rect(b.x - 2, b.y - 5, b.x + 2, b.y + 5, OPEN, 1);
  g.rect(b.x - 5, b.y - 2, b.x + 5, b.y + 2, OPEN, 1);
  const deg = new Map<(typeof nodes)[0], number>();
  for (const [a, c] of links) (deg.set(a, (deg.get(a) ?? 0) + 1), deg.set(c, (deg.get(c) ?? 0) + 1));
  const pockets = nodes.filter((n) => n !== s && n !== b && (deg.get(n) ?? 0) <= 1).map((n) => [n.x, n.y] as Pt);
  return { start: [s.x, s.y], boss: [b.x, b.y], pockets, structures: [], deco };
};

/** Catacombes : longues galeries, niches funéraires (ou cellules) de part et d'autre, chambres au bout */
const catacombs: Gen = (rng, g, v) => {
  const wards = v === 'wards';
  // une galerie horizontale par ~16 cases de hauteur (trois sur les anciennes cartes), autant de verticales en largeur
  const nh = Math.max(3, Math.round(g.rows / (wards ? 15 : 13)));
  const nv = Math.max(3, Math.round(g.cols / 16));
  const ys: number[] = [];
  for (let k = 0; k < nh; k++) ys.push(Math.round(g.rows * ((k + 0.5) / nh) + rng.range(-1, 1)));
  const spans: [number, number][] = ys.map(() => [rng.range(2, 6), g.cols - rng.range(3, 7)]);
  const cw = wards ? 2 : rng.chance(0.5) ? 2 : 1;
  ys.forEach((y, k) => g.rect(spans[k][0], y, spans[k][1], y + cw, OPEN, 1));
  // galeries verticales qui relient les galeries horizontales
  const xs: number[] = [];
  for (let k = 0; k < nv; k++) xs.push(Math.round(g.cols * (0.2 + (0.6 * k) / (nv - 1)) + rng.range(-3, 3)));
  for (const [k, x] of xs.entries()) {
    // la galerie du milieu traverse tout ; les autres relient deux ou trois galeries voisines
    const i0 = k === nv >> 1 ? 0 : rng.int(nh - 1);
    const i1 = k === nv >> 1 ? nh - 1 : Math.min(nh - 1, i0 + 1 + (rng.chance(0.4) ? 1 : 0));
    g.rect(x, ys[i0], x + cw, ys[i1] + cw, OPEN, 1);
  }
  const deco: Deco[] = [];
  const pockets: Pt[] = [];
  const free = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0 - 1; y <= y1; y++) for (let x = x0 - 1; x <= x1; x++) if (!g.inside(x, y) || x < 1 || y < 1 || x >= g.cols - 1 || y >= g.rows - 1 || g.get(x, y) !== ROCK) return false;
    return true;
  };
  // niches le long des galeries (porte d'une case)
  ys.forEach((y, k) => {
    for (let x = spans[k][0] + 1; x < spans[k][1] - 3; x += wards ? 4 : rng.range(3, 5)) {
      for (const side of [-1, 1]) {
        if (!rng.chance(wards ? 0.85 : 0.55)) continue;
        const w = wards ? 3 : rng.range(2, 3);
        const d = wards ? 3 : rng.range(2, 3);
        const ny0 = side < 0 ? y - 1 - d : y + cw + 1;
        if (!free(x, ny0, x + w, ny0 + d)) continue;
        g.rect(x, ny0, x + w, ny0 + d, OPEN, 0);
        const door = x + rng.int(w);
        g.set(door, side < 0 ? y - 1 : y + cw, OPEN);
        const role: DecoRole = v === 'cells' ? 'spikes' : wards ? 'coffin' : 'coffin';
        if (rng.chance(0.6)) deco.push({ role, x: (x + w / 2) * g.cell, y: (ny0 + d / 2) * g.cell });
      }
    }
  });
  // chambres aux extrémités
  const ends: Pt[] = [];
  ys.forEach((y, k) => {
    for (const e of [0, 1]) {
      if (!rng.chance(0.6) && !(k === 0 && e === 0) && !(k === nh - 1 && e === 1)) continue;
      const w = rng.range(4, 6);
      const h = rng.range(4, 5);
      const x0 = e ? Math.min(g.cols - 2 - w, spans[k][1]) : Math.max(1, spans[k][0] - w);
      const y0 = Math.max(1, Math.min(g.rows - 2 - h, y - Math.floor(h / 2)));
      g.rect(x0, y0, x0 + w, y0 + h, OPEN, 1);
      g.rect(Math.min(x0 + w / 2, spans[k][e]), y, Math.max(x0 + w / 2, spans[k][e]) + 1, y + cw, OPEN, 1);
      ends.push([x0 + w / 2, y0 + h / 2]);
      deco.push({ role: 'column', x: (x0 + 0.8) * g.cell, y: (y0 + 0.8) * g.cell }, { role: 'column', x: (x0 + w - 0.8) * g.cell, y: (y0 + 0.8) * g.cell });
    }
  });
  const s = ends[0];
  const b = ends.reduce((best, e) => (Math.hypot(e[0] - s[0], e[1] - s[1]) > Math.hypot(best[0] - s[0], best[1] - s[1]) ? e : best));
  for (const e of ends) if (e !== s && e !== b) pockets.push(e);
  return { start: s, boss: b, pockets, structures: [], deco };
};

/** Égouts : tunnels à canal central bordé de quais, passerelles, salles latérales */
const canals: Gen = (rng, g) => {
  const tunnels: { h: boolean; at: number; a: number; b: number }[] = [];
  // un tunnel par ~16 cases (trois dans chaque sens sur les anciennes cartes)
  const nth = Math.max(3, Math.round(g.rows / 16));
  const ntv = Math.max(3, Math.round(g.cols / 16));
  for (let k = 0; k < nth; k++) tunnels.push({ h: true, at: Math.round(g.rows * (0.18 + (0.64 * k) / (nth - 1)) + rng.range(-1, 1)), a: rng.range(1, 6), b: g.cols - rng.range(2, 7) });
  for (let k = 0; k < ntv; k++) tunnels.push({ h: false, at: Math.round(g.cols * (0.18 + (0.64 * k) / (ntv - 1)) + rng.range(-1, 1)), a: rng.range(1, 6), b: g.rows - rng.range(2, 7) });
  // tunnel : quai (1) + canal (2) + quai (1)
  for (const t of tunnels) t.h ? g.rect(t.a, t.at - 2, t.b, t.at + 2, OPEN, 1) : g.rect(t.at - 2, t.a, t.at + 2, t.b, OPEN, 1);
  for (const t of tunnels) t.h ? g.rect(t.a + 1, t.at - 1, t.b - 1, t.at + 1, HAZ) : g.rect(t.at - 1, t.a + 1, t.at + 1, t.b - 1, HAZ);
  // passerelles
  for (const t of tunnels)
    for (let p = t.a + 2 + rng.int(3); p < t.b - 2; p += rng.range(4, 6)) {
      const cross = tunnels.some((o) => o.h !== t.h && Math.abs(o.at - p) < 4);
      if (cross) continue;
      if (t.h) g.rect(p, t.at - 1, p + 1, t.at + 1, OPEN, 1);
      else g.rect(t.at - 1, p, t.at + 1, p + 1, OPEN, 1);
    }
  // carrefours : dalle praticable au croisement
  for (const a of tunnels) for (const b of tunnels) if (a.h && !b.h) g.rect(b.at - 1, a.at - 1, b.at + 1, a.at + 1, OPEN, 1);
  // salles latérales
  const pockets: Pt[] = [];
  const rooms: Pt[] = [];
  const nRooms = Math.round((g.cols * g.rows) / 260);
  for (let t = 0; t < 40 * nRooms && rooms.length < nRooms; t++) {
    const tu = rng.pick(tunnels);
    const w = rng.range(3, 5);
    const h = rng.range(3, 4);
    const p = rng.range(tu.a + 1, tu.b - w - 1);
    const side = rng.chance(0.5) ? -1 : 1;
    const x0 = tu.h ? p : side < 0 ? tu.at - 3 - w : tu.at + 3;
    const y0 = tu.h ? (side < 0 ? tu.at - 3 - h : tu.at + 3) : p;
    const x1 = x0 + (tu.h ? w : w);
    const y1 = y0 + (tu.h ? h : h);
    let ok = x0 >= 1 && y0 >= 1 && x1 < g.cols - 1 && y1 < g.rows - 1;
    for (let y = y0 - 1; y <= y1 && ok; y++) for (let x = x0 - 1; x <= x1 && ok; x++) if (g.get(x, y) !== ROCK) ok = false;
    if (!ok) continue;
    g.rect(x0, y0, x1, y1, OPEN, 0);
    if (tu.h) g.set(x0 + Math.floor(w / 2), side < 0 ? tu.at - 3 : tu.at + 2, OPEN);
    else g.set(side < 0 ? tu.at - 3 : tu.at + 2, y0 + Math.floor(h / 2), OPEN);
    rooms.push([(x0 + x1) / 2, (y0 + y1) / 2]);
  }
  const t0 = tunnels[0];
  const s: Pt = [t0.a + 0.5, t0.at - 1.5];
  const b = rooms.length ? rooms.reduce((best, e) => (Math.hypot(e[0] - s[0], e[1] - s[1]) > Math.hypot(best[0] - s[0], best[1] - s[1]) ? e : best)) : ([g.cols - 3, g.rows - 3] as Pt);
  for (const r of rooms) if (r !== b) pockets.push(r);
  return { start: s, boss: b, pockets, structures: [], deco: [] };
};

/** Palais / temple / cathédrale : plan symétrique, nef à colonnade, ailes en miroir, salle du trône */
const palace: Gen = (rng, g, v) => {
  const mid = g.cols / 2;
  const deco: Deco[] = [];
  // nef, salle du trône et chapelles à l'échelle de la boîte ; chapelles plus nombreuses (référence : ~40×47 cases)
  const L = lin(g, 4 * 43);
  const aw = Math.round((v === 'palace' ? 5 : 4) * Math.min(L, 1.3));
  // nef
  g.rect(mid - aw / 2, 3, mid + aw / 2, g.rows - 2, OPEN, 1);
  // salle du trône (abside ronde pour la cathédrale)
  const tw = Math.round((v === 'palace' ? 12 : 10) * Math.min(L, 1.3));
  const th = Math.round(7 * Math.min(L, 1.3));
  if (v === 'cathedral') g.disk(mid, 1 + th / 2 + 2, th / 2 + 2, OPEN, 1);
  else g.rect(mid - tw / 2, 2, mid + tw / 2, 2 + th, OPEN, 1);
  const y0 = 3 + th;
  // transept (cathédrale) ou cour (palais)
  const ty = Math.round(g.rows * 0.38);
  if (v === 'cathedral') g.rect(3, ty, g.cols - 3, ty + Math.round(4 * Math.min(L, 1.3)), OPEN, 1);
  if (v === 'palace') g.rect(mid - 9 * Math.min(L, 1.3), Math.round(g.rows * 0.55), mid + 9 * Math.min(L, 1.3), Math.round(g.rows * 0.55) + Math.round(6 * Math.min(L, 1.3)), OPEN, 0);
  // ailes : salles de la moitié gauche, reliées à la nef, puis miroir
  const rooms: { x: number; y: number; w: number; h: number }[] = [];
  const n = Math.round((v === 'temple' ? 6 : 7) * L * L);
  for (let t = 0; t < 60 * n && rooms.length < n; t++) {
    const w = rng.range(3, 6);
    const h = rng.range(3, 5);
    const x = rng.range(1, Math.floor(mid - aw / 2) - w - 1);
    const y = rng.range(y0 + 1, g.rows - h - 2);
    if (x < 1) continue;
    if (rooms.every((r) => x + w + 1 < r.x || r.x + r.w + 1 < x || y + h + 1 < r.y || r.y + r.h + 1 < y)) rooms.push({ x, y, w, h });
  }
  for (const r of rooms) {
    g.rect(r.x, r.y, r.x + r.w, r.y + r.h, OPEN, 1);
    const cy = r.y + Math.floor(r.h / 2);
    g.rect(r.x + r.w - 1, cy, mid, cy + (rng.chance(0.4) ? 2 : 1), OPEN, 0);
    // temple : colonnes aux angles des chapelles
    if (v !== 'palace' && r.w >= 4 && r.h >= 4)
      deco.push({ role: 'column', x: (r.x + 1) * g.cell, y: (r.y + 1) * g.cell }, { role: 'column', x: (r.x + r.w - 1) * g.cell, y: (r.y + r.h - 1) * g.cell });
    if (v === 'palace') deco.push({ role: 'banner', x: (r.x + r.w / 2) * g.cell, y: (r.y + 0.6) * g.cell });
  }
  // liens verticaux entre salles voisines d'une aile
  const sorted = [...rooms].sort((a, b) => a.y - b.y);
  for (let k = 1; k < sorted.length; k++) {
    const a = sorted[k - 1];
    const b = sorted[k];
    if (rng.chance(0.5)) {
      const x = Math.max(a.x, b.x) + 1;
      if (x < Math.min(a.x + a.w, b.x + b.w)) g.rect(x, a.y + a.h, x + 1, b.y, OPEN, 0);
    }
  }
  // miroir
  for (let y = 0; y < g.rows; y++)
    for (let x = 0; x < Math.floor(g.cols / 2); x++) {
      const i = y * g.cols + x;
      const j = y * g.cols + (g.cols - 1 - x);
      const v2 = Math.max(g.c[i], g.c[j]) === OPEN || g.c[i] === OPEN || g.c[j] === OPEN ? OPEN : g.c[i];
      const f = g.floor[i] | g.floor[j];
      g.c[i] = g.c[j] = v2;
      g.floor[i] = g.floor[j] = f;
    }
  for (const d of [...deco]) deco.push({ ...d, x: g.cols * g.cell - d.x });
  // colonnade de la nef
  for (let y = y0 + 2; y < g.rows - 3; y += 2) for (const s of [-1, 1]) deco.push({ role: 'column', x: (mid + s * (aw / 2 - 0.7)) * g.cell, y: y * g.cell });
  deco.push({ role: 'brazier', x: (mid - 3) * g.cell, y: 4 * g.cell }, { role: 'brazier', x: (mid + 3) * g.cell, y: 4 * g.cell });
  const pockets = rooms.map((r) => [r.x + r.w / 2, r.y + r.h / 2] as Pt);
  return { start: [mid, g.rows - 3.5], boss: [mid, 2 + th / 2], pockets, structures: [], deco };
};

const GENERATORS: Record<ShapeKind, Gen> = { caves, crater, islands, river, canyon, road, village, halls, spiral, star, hedges, rings, plateaus, rifts, crosses, catacombs, canals, palace };

/* ------------------------------------------------------------------ */
/* Finition : épaisseur minimale, pincements, connexité                 */
/* ------------------------------------------------------------------ */

const N4: Pt[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Danger aligné sur les tuiles de sol de 4 unités (cases de 2) : pas de lave à moitié praticable */
function quantizeHazard(g: ShapeGrid): void {
  if (g.cell !== 2) return;
  for (let by = 0; by < g.rows; by += 2)
    for (let bx = 0; bx < g.cols; bx += 2) {
      let haz = 0;
      let open = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const v = g.get(bx + dx, by + dy);
          if (v === HAZ) haz++;
          else if (v === OPEN) open++;
        }
      if (!haz || haz === 4) continue;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const v = g.get(bx + dx, by + dy);
          if (haz >= 3) {
            if (g.inside(bx + dx, by + dy)) g.set(bx + dx, by + dy, HAZ);
          } else if (v === HAZ) g.set(bx + dx, by + dy, open ? OPEN : ROCK);
        }
    }
}

/** Retire les passages d'une case (2 unités) et élargit les pincements en diagonale */
function thin(g: ShapeGrid): void {
  if (g.cell === 2) {
    const keep = new Uint8Array(g.c.length);
    for (let y = 0; y < g.rows - 1; y++)
      for (let x = 0; x < g.cols - 1; x++)
        if (g.isOpen(x, y) && g.isOpen(x + 1, y) && g.isOpen(x, y + 1) && g.isOpen(x + 1, y + 1)) {
          keep[y * g.cols + x] = keep[y * g.cols + x + 1] = keep[(y + 1) * g.cols + x] = keep[(y + 1) * g.cols + x + 1] = 1;
        }
    for (let i = 0; i < g.c.length; i++)
      if (g.c[i] === OPEN && !keep[i]) {
        const x = i % g.cols;
        const y = (i - x) / g.cols;
        g.c[i] = N4.some(([dx, dy]) => g.get(x + dx, y + dy) === HAZ) ? HAZ : ROCK;
      }
  }
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let y = 0; y < g.rows - 1; y++)
      for (let x = 0; x < g.cols - 1; x++) {
        const a = g.isOpen(x, y);
        const b = g.isOpen(x + 1, y);
        const c = g.isOpen(x, y + 1);
        const d = g.isOpen(x + 1, y + 1);
        if ((a && d && !b && !c) || (b && c && !a && !d)) {
          changed = true;
          if (g.cell >= 4) {
            // intérieur : on referme le coin le moins relié (les murs restent continus ; la connexité est réparée ensuite)
            const pair: Pt[] =
              a && d
                ? [
                    [x, y],
                    [x + 1, y + 1],
                  ]
                : [
                    [x + 1, y],
                    [x, y + 1],
                  ];
            const deg = (p: Pt) => N4.filter(([dx, dy]) => g.isOpen(p[0] + dx, p[1] + dy)).length;
            const p = deg(pair[0]) <= deg(pair[1]) ? pair[0] : pair[1];
            g.set(p[0], p[1], ROCK);
            continue;
          }
          for (const [px, py] of [
            [x, y],
            [x + 1, y],
            [x, y + 1],
            [x + 1, y + 1],
          ])
            if (g.get(px, py) !== WALL) g.set(px, py, OPEN);
        }
      }
    if (!changed) break;
  }
}

/** Composantes 4-connexes du praticable */
function components(g: ShapeGrid): Int32Array {
  const lab = new Int32Array(g.c.length).fill(-1);
  let n = 0;
  const q: number[] = [];
  for (let i = 0; i < g.c.length; i++) {
    if (g.c[i] !== OPEN || lab[i] >= 0) continue;
    lab[i] = n;
    q.length = 0;
    q.push(i);
    for (let h = 0; h < q.length; h++) {
      const j = q[h];
      const x = j % g.cols;
      const y = (j - x) / g.cols;
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (!g.inside(nx, ny)) continue;
        const k = ny * g.cols + nx;
        if (g.c[k] === OPEN && lab[k] < 0) ((lab[k] = n), q.push(k));
      }
    }
    n++;
  }
  return lab;
}

/** Case praticable la plus proche (recherche en largeur) */
export function nearestOpen(g: ShapeGrid, x: number, y: number): Pt {
  const sx = Math.max(0, Math.min(g.cols - 1, Math.floor(x)));
  const sy = Math.max(0, Math.min(g.rows - 1, Math.floor(y)));
  if (g.isOpen(sx, sy)) return [sx, sy];
  let best: Pt | null = null;
  let bd = Infinity;
  for (let i = 0; i < g.c.length; i++) {
    if (g.c[i] !== OPEN) continue;
    const cx = i % g.cols;
    const cy = (i - cx) / g.cols;
    const d = (cx - sx) ** 2 + (cy - sy) ** 2;
    if (d < bd) ((bd = d), (best = [cx, cy]));
  }
  return best ?? [sx, sy];
}

/** Relie toute composante isolée à la principale par un couloir creusé (2 cases en extérieur) ; les miettes sont comblées */
function connect(g: ShapeGrid, start: Pt): void {
  const minKeep = g.cell === 2 ? 14 : 3;
  for (let guard = 0; guard < 60; guard++) {
    const lab = components(g);
    const s = nearestOpen(g, start[0], start[1]);
    const main = lab[s[1] * g.cols + s[0]];
    const sizes = new Map<number, number>();
    for (const l of lab) if (l >= 0) sizes.set(l, (sizes.get(l) ?? 0) + 1);
    const others = [...sizes.entries()].filter(([l]) => l !== main);
    if (!others.length) return;
    const small = others.filter(([, n]) => n < minKeep).map(([l]) => l);
    if (small.length) {
      const sm = new Set(small);
      for (let i = 0; i < lab.length; i++) if (sm.has(lab[i])) g.c[i] = ROCK;
      if (small.length === others.length) return;
      continue;
    }
    // largeur d'abord depuis la composante principale jusqu'à la plus proche des autres
    const prev = new Int32Array(g.c.length).fill(-2);
    const q: number[] = [];
    for (let i = 0; i < lab.length; i++) if (lab[i] === main) ((prev[i] = -1), q.push(i));
    let hit = -1;
    for (let h = 0; h < q.length && hit < 0; h++) {
      const j = q[h];
      const x = j % g.cols;
      const y = (j - x) / g.cols;
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= g.cols - 1 || ny >= g.rows - 1) continue;
        const k = ny * g.cols + nx;
        if (prev[k] !== -2) continue;
        prev[k] = j;
        if (lab[k] >= 0 && lab[k] !== main) {
          hit = k;
          break;
        }
        q.push(k);
      }
    }
    if (hit < 0) return;
    for (let k = prev[hit]; k >= 0 && lab[k] !== main; k = prev[k]) {
      const x = k % g.cols;
      const y = (k - x) / g.cols;
      if (g.cell === 2) {
        const bx = x - (x & 1);
        const by = y - (y & 1);
        g.rect(bx, by, bx + 2, by + 2, OPEN);
      } else g.set(x, y, OPEN);
    }
  }
}

/** Cadre de roche, danger aligné, épaisseur minimale, connexité */
function finalize(s: Shape): void {
  const g = s.g;
  quantizeHazard(g);
  for (let x = 0; x < g.cols; x++)
    for (const y of [0, g.rows - 1]) {
      if (g.get(x, y) === OPEN || g.get(x, y) === WALL) g.set(x, y, ROCK);
    }
  for (let y = 0; y < g.rows; y++)
    for (const x of [0, g.cols - 1]) {
      if (g.get(x, y) === OPEN || g.get(x, y) === WALL) g.set(x, y, ROCK);
    }
  thin(g);
  connect(g, s.start);
  thin(g);
  connect(g, s.start);
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                            */
/* ------------------------------------------------------------------ */

/** Forme de chaque carte (justification : docs/internal/audit/cartes-formes.md) */
export const MAP_SHAPES: Record<string, ShapeSpec> = {
  /* palier 1 */
  torajan_jungle: { kind: 'caves', fill: 0.37 },
  zoltun_kulle: { kind: 'crosses', fill: 0.36 },
  shadows_westmarch: { kind: 'village', v: 'cemetery', fill: 0.66, aspect: 1.15 },
  phlegethon: { kind: 'islands', hazard: 'lava', fill: 0.34 },
  lost_temple: { kind: 'palace', v: 'temple', fill: 0.28, aspect: 0.8 },
  fall_caldeum: { kind: 'village', v: 'ruins', fill: 0.64 },
  ancestral_trial: { kind: 'star', fill: 0.27, size: 0.9 },
  /* palier 2 */
  throne_insanity: { kind: 'spiral', fill: 0.45, size: 0.85 },
  sewers_harrogath: { kind: 'canals', hazard: 'mud', fill: 0.26, aspect: 1.1 },
  ashen_plains: { kind: 'rifts', hazard: 'lava', fill: 0.63 },
  sescheron: { kind: 'canyon', fill: 0.26 },
  sanatorium: { kind: 'catacombs', v: 'wards', fill: 0.4, aspect: 1.25 },
  ruined_cistern: { kind: 'halls', v: 'pools', hazard: 'mud', fill: 0.33 },
  pandemonium_citadel: { kind: 'halls', v: 'citadel', fill: 0.38 },
  horazon_memory: { kind: 'islands', v: 'fragments', hazard: 'void', fill: 0.35 },
  halls_torture: { kind: 'catacombs', v: 'cells', fill: 0.29, aspect: 1.2 },
  /* palier 3 */
  blood_moon: { kind: 'crater', v: 'rock', fill: 0.37 },
  royal_crypts: { kind: 'catacombs', fill: 0.29, aspect: 1.2 },
  river_blood: { kind: 'river', hazard: 'lava', fill: 0.68, aspect: 1.25 },
  kyovashad: { kind: 'village', v: 'town', fill: 0.64 },
  kehjistan_marketplace: { kind: 'village', v: 'market', fill: 0.65 },
  arreat_battlefield: { kind: 'plateaus', fill: 0.31 },
  bastion_keep: { kind: 'rings', v: 'square', fill: 0.66, size: 0.9 },
  demon_road: { kind: 'road', hazard: 'lava', fill: 0.42 },
  skovos_stronghold: { kind: 'halls', fill: 0.37 },
  /* donjons */
  plains_torment: { kind: 'crater', hazard: 'lava', fill: 0.38 },
  sanctuary_sin: { kind: 'palace', v: 'cathedral', fill: 0.32, aspect: 0.85 },
  steppes_daken: { kind: 'caves', v: 'lobes', fill: 0.35 },
  /* uniques */
  city_ureh: { kind: 'rings', fill: 0.39 },
  fallen_gardens: { kind: 'hedges', fill: 0.46 },
  imperial_palace: { kind: 'palace', v: 'palace', fill: 0.39, aspect: 0.85 },
  djinn_domain: { kind: 'star', v: 'oasis', hazard: 'mud', fill: 0.27 },
  zhar_sanctum: { kind: 'halls', v: 'library', fill: 0.35 },
  nakrul_abyss: { kind: 'crater', v: 'abyss', hazard: 'void', fill: 0.28 },
  warlord_blood: { kind: 'rifts', v: 'trenches', fill: 0.64 },
  ruins_vizjun: { kind: 'village', v: 'ruins', fill: 0.58 },
  outer_void: { kind: 'islands', v: 'shards', hazard: 'void', fill: 0.28 },
};

/** Surface praticable visée (unités²) par palier : ×1,3 à ×1,5 les anciennes cartes carrées (~7 300) */
export const MAP_AREA: Record<number, number> = { 1: 19000, 2: 20000, 3: 21000, 4: 22000 };

/** Côté maximal de la boîte englobante (unités) */
const MAX_BOX = 300;

export function mapShapeOf(id: string, layout: 'field' | 'labyrinth'): ShapeSpec {
  return MAP_SHAPES[id] ?? (layout === 'field' ? { kind: 'caves', fill: 0.42 } : { kind: 'halls', fill: 0.42 });
}

function generateOnce(spec: ShapeSpec, cell: number, rng: Rng, W: number, H: number): Shape {
  const g = new ShapeGrid(Math.max(12, Math.round(W / cell)), Math.max(12, Math.round(H / cell)), cell);
  const s: Shape = { g, ...GENERATORS[spec.kind](rng, g, spec.v) };
  finalize(s);
  return s;
}

/**
 * Forme d'une carte : dimensionnée pour la surface du palier (jusqu'à cinq essais : chacun corrige l'échelle
 * d'après la surface mesurée), finie (connexe, sans passage d'une case).
 */
export function generateShape(spec: ShapeSpec, indoor: boolean, tier: number, rng: Rng): Shape {
  const cell = indoor ? 4 : 2;
  const target = (MAP_AREA[tier] ?? MAP_AREA[1]) * (spec.size ?? 1);
  const aspect = spec.aspect ?? 1;
  let W = Math.sqrt((target / spec.fill) * aspect);
  let H = W / aspect;
  let best: Shape | null = null;
  let bestErr = Infinity;
  for (let t = 0; t < 5; t++) {
    W = Math.min(MAX_BOX, W);
    H = Math.min(MAX_BOX, H);
    const s = generateOnce(spec, cell, rng.fork(`try${t}`), W, H);
    const area = s.g.count(OPEN) * cell * cell;
    const err = Math.abs(area / target - 1);
    if (err < bestErr) ((best = s), (bestErr = err));
    if (err < 0.12) break;
    // correction amortie après le premier essai : les formes à treillis (croix, salles) varient par paliers
    const k = Math.sqrt(target / Math.max(area, 1)) ** (t ? 0.5 : 1);
    W *= k;
    H *= k;
  }
  return best!;
}
