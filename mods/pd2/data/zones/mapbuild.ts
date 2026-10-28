/**
 * Bâtisseur des zones de cartes d'endgame à partir d'une forme (mapshapes.ts) : collisions (blocs fusionnés),
 * sol par tuile, décor de bordure ou murs, départ, arène du boss, poches d'événement, groupes de monstres.
 */
import type { MapZoneDef } from '../../../../src/mods/api';
import { PROP_BY_ID, ZoneBuilder, type GroundKind, type MapZoneOptions, type Rng, type ZoneDef } from '../../../../src/mods/sdk';
import { generateShape, HAZ, mapShapeOf, nearestOpen, OPEN, ROCK, WALL, type DecoRole, type Shape, type ShapeGrid } from './mapshapes';

type Pt = [number, number];
/**
 * Surface praticable par groupe de monstres (unités², zones calmes comprises) : ~90 groupes au palier 1, ~100 aux
 * paliers 3-4 (cartes de 19 000 à 22 000 u² ; avant : 330 u² sur ~9 500-11 000 u², ~30 groupes). Compromis mesuré au
 * bot d'endgame : à 160 u² (~125 groupes, ~970 monstres), cartes de 11-17 min et morts ×4 par heure.
 */
export const AREA_PER_PACK = 215;
/** Zones calmes voulues (aucun groupe) : une pour ~3 000 u², rayon 8 à 12 unités */
const AREA_PER_CALM = 3000;

const N8: Pt[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Distance de marche (en demi-cases : 2 en ligne droite, 3 en diagonale sans couper les coins) depuis une case ; -1 : inaccessible */
function walkDist(g: ShapeGrid, from: Pt): Int32Array {
  const d = new Int32Array(g.c.length).fill(-1);
  const s = from[1] * g.cols + from[0];
  if (g.c[s] !== OPEN) return d;
  const buckets: number[][] = [[s]];
  d[s] = 0;
  for (let cur = 0; cur < buckets.length; cur++) {
    const b = buckets[cur];
    if (!b) continue;
    for (const i of b) {
      if (d[i] !== cur) continue;
      const x = i % g.cols;
      const y = (i - x) / g.cols;
      for (const [dx, dy] of N8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!g.isOpen(nx, ny)) continue;
        if (dx && dy && (!g.isOpen(x + dx, y) || !g.isOpen(x, y + dy))) continue;
        const j = ny * g.cols + nx;
        const nd = cur + (dx && dy ? 3 : 2);
        if (d[j] >= 0 && d[j] <= nd) continue;
        d[j] = nd;
        (buckets[nd] ??= []).push(j);
      }
    }
  }
  return d;
}

/** Dégagement (cases, 8-connexe) : 1 au bord d'un obstacle */
function clearance(g: ShapeGrid): Uint8Array {
  const c = new Uint8Array(g.c.length);
  const q = new Int32Array(g.c.length);
  let t = 0;
  for (let i = 0; i < g.c.length; i++) {
    if (g.c[i] !== OPEN) continue;
    const x = i % g.cols;
    const y = (i - x) / g.cols;
    if (N8.some(([dx, dy]) => g.get(x + dx, y + dy) !== OPEN)) ((c[i] = 1), (q[t++] = i));
  }
  for (let h = 0; h < t; h++) {
    const i = q[h];
    const x = i % g.cols;
    const y = (i - x) / g.cols;
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!g.inside(nx, ny)) continue;
      const j = ny * g.cols + nx;
      if (g.c[j] === OPEN && !c[j]) ((c[j] = Math.min(255, c[i] + 1)), (q[t++] = j));
    }
  }
  return c;
}

/** Case praticable de dégagement ≥ minC la plus proche du point (cases) */
function snap(g: ShapeGrid, clr: Uint8Array, p: Pt, minC: number, reach?: Int32Array): Pt | null {
  let best: Pt | null = null;
  let bd = Infinity;
  for (let i = 0; i < g.c.length; i++) {
    if (clr[i] < minC || (reach && reach[i] < 0)) continue;
    const x = i % g.cols;
    const y = (i - x) / g.cols;
    const d = (x + 0.5 - p[0]) ** 2 + (y + 0.5 - p[1]) ** 2;
    if (d < bd) ((bd = d), (best = [x, y]));
  }
  return best;
}

interface MapLayout {
  shape: Shape;
  start: Pt;
  boss: Pt;
  /** Distance de marche du départ (cases) */
  dStart: Int32Array;
  dBoss: Int32Array;
  clr: Uint8Array;
  /** Diamètre de marche (cases, double balayage) */
  diameter: number;
  pockets: Pt[];
}

/** Départ, boss (≥ 60 % du diamètre de marche), poches classées par détour */
function layoutShape(shape: Shape): MapLayout {
  const g = shape.g;
  const clr = clearance(g);
  const cMin = g.cell === 2 ? 2 : 1;
  const cArena = g.cell === 2 ? 3 : 2;
  const argmax = (d: Int32Array, minC: number) => {
    let bi = -1;
    for (let i = 0; i < d.length; i++) if (clr[i] >= minC && d[i] >= 0 && (bi < 0 || d[i] > d[bi])) bi = i;
    return bi < 0 ? null : ([bi % g.cols, Math.floor(bi / g.cols)] as Pt);
  };
  let start = snap(g, clr, shape.start, cMin) ?? snap(g, clr, shape.start, 1)!;
  let dStart = walkDist(g, start);
  const far = argmax(dStart, 1)!;
  const diameter = walkDist(g, far).reduce((a, b) => Math.max(a, b), 0);
  let boss: Pt | null = null;
  if (shape.boss) {
    const b = snap(g, clr, shape.boss, cArena, dStart) ?? snap(g, clr, shape.boss, cMin, dStart);
    if (b && dStart[b[1] * g.cols + b[0]] >= 0.66 * diameter) boss = b;
  }
  // arène voulue par la forme : ≥ 66 % du diamètre ; sinon la case large la plus lointaine, avec plus de marge
  // (≥ 72 % : la grille de marche réelle, décor compris, rabote un peu les distances)
  const fromShape = !!boss;
  boss ??= argmax(dStart, cArena) ?? argmax(dStart, cMin) ?? far;
  if (dStart[boss[1] * g.cols + boss[0]] < (fromShape ? 0.66 : 0.72) * diameter) {
    // départ central : on repart d'une extrémité du diamètre
    start = snap(g, clr, far, cMin, dStart) ?? far;
    dStart = walkDist(g, start);
    boss = argmax(dStart, cArena) ?? argmax(dStart, cMin) ?? boss;
    if (dStart[boss[1] * g.cols + boss[0]] < 0.72 * diameter) boss = argmax(dStart, cMin) ?? boss;
  }
  const dBoss = walkDist(g, boss);
  const dSB = dStart[boss[1] * g.cols + boss[0]];
  const okPocket = (p: Pt) => {
    const i = p[1] * g.cols + p[0];
    return dStart[i] >= 0.25 * diameter && (dBoss[i] / 2) * g.cell >= 18 && clr[i] >= cMin;
  };
  const detour = (p: Pt) => dStart[p[1] * g.cols + p[0]] + dBoss[p[1] * g.cols + p[0]] - dSB;
  const pockets: Pt[] = [];
  for (const h of shape.pockets) {
    const p = snap(g, clr, h, cMin, dStart);
    if (p && okPocket(p) && pockets.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) * g.cell > 10)) pockets.push(p);
  }
  // poches calculées : les cases au plus grand détour du chemin principal
  const extra: Pt[] = [];
  for (let i = 0; i < g.c.length; i += 3) {
    const p: Pt = [i % g.cols, Math.floor(i / g.cols)];
    if (g.c[i] === OPEN && dStart[i] >= 0 && okPocket(p)) extra.push(p);
  }
  extra.sort((a, b) => detour(b) - detour(a));
  for (const p of extra) {
    if (pockets.length >= 8) break;
    if (pockets.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) * g.cell > 20)) pockets.push(p);
  }
  pockets.sort((a, b) => detour(b) - detour(a));
  return { shape, start, boss, dStart, dBoss, clr, diameter, pockets };
}

/** Choix de décor selon le rôle et le thème de la carte */
function decoProp(role: DecoRole, def: MapZoneDef, rng: Rng): string {
  const has = (id: string) => def.props.includes(id);
  switch (role) {
    case 'column':
      return has('throne_pillar') ? 'throne_pillar' : 'tomb_column';
    case 'grave':
      return rng.pick(['gravestone', 'grave_a', 'gravestone']);
    case 'rubble':
      return has('tomb_rubble') ? 'tomb_rubble' : rng.pick(['rubble', 'rock_c']);
    case 'stall':
      return rng.pick(['market_a', 'market_b', 'cart_a', 'crates', 'barrel']);
    case 'coffin':
      return 'coffin';
    case 'spikes':
      return 'spikes';
    case 'well':
      return def.ground === 'sand' ? 'rock_c' : 'well';
    case 'brazier':
      return 'brazier';
    case 'banner':
      return 'banner_red';
    default:
      return role;
  }
}

const HOUSES: Record<string, Record<string, string[]>> = {
  cemetery: { house: ['house1_a', 'house2_a', 'house3_a', 'house1_b', 'house2_b'], big: ['inn_a', 'house4_a', 'smithy_a'], tower: ['bell_tower'], ruin: ['ruin'], tent: ['tent'] },
  town: { house: ['stonehouse_a', 'stonehouse_b'], big: ['house4_a', 'inn_b'], tower: ['tower'], ruin: ['ruin'], tent: ['tent'] },
  ruins: { house: ['ruin'], big: ['church_ruin_a', 'church_ruin_b'], tower: ['tower'], ruin: ['ruin'], tent: ['tent'] },
  market: { house: ['ruin'], big: ['church_ruin_a'], tower: ['tower'], ruin: ['ruin'], tent: ['tent'] },
};

/** Fusion des cases bloquées en rectangles (une ligne de cases, puis extension vers le bas) */
function mergeBlocks(g: ShapeGrid, cls: (v: number, i: number) => number): { x0: number; y0: number; x1: number; y1: number; c: number }[] {
  const out: { x0: number; y0: number; x1: number; y1: number; c: number }[] = [];
  let open = new Map<string, (typeof out)[0]>();
  for (let y = 0; y < g.rows; y++) {
    const next = new Map<string, (typeof out)[0]>();
    let x = 0;
    while (x < g.cols) {
      const c = cls(g.c[y * g.cols + x], y * g.cols + x);
      if (c < 0) {
        x++;
        continue;
      }
      let e = x + 1;
      while (e < g.cols && cls(g.c[y * g.cols + e], y * g.cols + e) === c) e++;
      const k = `${x},${e},${c}`;
      const r = open.get(k);
      if (r) {
        r.y1 = y + 1;
        next.set(k, r);
      } else {
        const nr = { x0: x, y0: y, x1: e, y1: y + 1, c };
        out.push(nr);
        next.set(k, nr);
      }
      x = e;
    }
    open = next;
  }
  return out;
}

type PackAt = (b: ZoneBuilder, x: number, y: number, room?: number) => void;
type BossAt = (b: ZoneBuilder, x: number, y: number, chest: Pt, twin: Pt) => void;
type EventAt = (b: ZoneBuilder, x: number, y: number) => void;

/** Contexte de construction d'une zone de carte : forme, grille, bâtisseur et aides de conversion */
interface ShapeCtx {
  def: MapZoneDef;
  rng: Rng;
  opts: MapZoneOptions;
  spec: ReturnType<typeof mapShapeOf>;
  indoor: boolean;
  shape: Shape;
  L: ReturnType<typeof layoutShape>;
  g: ShapeGrid;
  /** Taille d'une case (unités) */
  U: number;
  W: number;
  H: number;
  b: ZoneBuilder;
  at: (p: Pt) => Pt;
  idx: (x: number, y: number) => number;
  cellOf: (x: number, y: number) => Pt;
  openAt: (x: number, y: number) => boolean;
  /** Surface praticable (unités²) */
  area: number;
  /** Cases occupées par un bâtiment-décor */
  structCell: Uint8Array;
  hazard: string;
}

/** Collisions : cases bloquées fusionnées en rectangles */
function blockCollisions(c: ShapeCtx): void {
  const { g, U, b, structCell } = c;
  for (const r of mergeBlocks(g, (v, i) => (v === OPEN || structCell[i] ? -1 : v === HAZ ? 1 : 0))) b.z.blockers.push({ rect: [r.x0 * U, r.y0 * U, r.x1 * U, r.y1 * U], opaque: r.c === 0 });
}

/** Sol par tuile de 4 unités : sol de fond, sol praticable, danger ; pied des murs et vide */
function paintGround(c: ShapeCtx): void {
  const { def, indoor, g, U, W, H, b, idx, hazard } = c;
  // un sol praticable ne ressemble jamais au danger : pas de « lave » sous les pas (route, ponts, salles)
  const floor = (def.floor === 'lava' || def.floor === hazard ? (def.ground === 'hellstone' ? 'dirt' : def.ground) : def.floor) as GroundKind;
  const kinds: GroundKind[] = [def.ground as GroundKind, floor, hazard === 'void' ? (def.ground as GroundKind) : (hazard as GroundKind)];
  const per = 4 / U;
  const tc = Math.ceil(W / 4);
  const tr = Math.ceil(H / 4);
  const tiles = new Uint8Array(tc * tr);
  for (let ty = 0; ty < tr; ty++)
    for (let tx = 0; tx < tc; tx++) {
      let open = 0;
      let haz = 0;
      let floor = 0;
      let n = 0;
      for (let dy = 0; dy < per; dy++)
        for (let dx = 0; dx < per; dx++) {
          const x = tx * per + dx;
          const y = ty * per + dy;
          if (!g.inside(x, y)) continue;
          n++;
          const v = g.c[idx(x, y)];
          if (v === OPEN) {
            open++;
            if (g.floor[idx(x, y)]) floor++;
          } else if (v === HAZ) haz++;
        }
      let k = floor * 2 > open && open ? 1 : 0;
      if (n && haz === n) k = hazard === 'void' ? 255 : 2;
      else if (indoor && !open) k = 255;
      else if (!open && hazard === 'void' && haz) k = 255;
      tiles[ty * tc + tx] = k;
    }
  // pied des murs : à l'intérieur, toute tuile à moins de 2 tuiles d'une tuile praticable reçoit le sol de fond, sinon le noir
  // apparaît dans les fentes entre murs, aux angles et derrière les murs bas (devant : murs bas, fond : pleins)
  if (indoor) {
    const hasOpen = new Uint8Array(tc * tr);
    for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (g.isOpen(x, y)) hasOpen[Math.floor((y * U) / 4) * tc + Math.floor((x * U) / 4)] = 1;
    const RING = 2;
    const src = tiles.slice();
    for (let ty = 0; ty < tr; ty++)
      for (let tx = 0; tx < tc; tx++) {
        if (src[ty * tc + tx] !== 255) continue;
        let near = false;
        for (let dy = -RING; dy <= RING && !near; dy++)
          for (let dx = -RING; dx <= RING; dx++) {
            const x = tx + dx;
            const y = ty + dy;
            if (x >= 0 && y >= 0 && x < tc && y < tr && hasOpen[y * tc + x]) {
              near = true;
              break;
            }
          }
        if (near) tiles[ty * tc + tx] = 0;
      }
  }
  // vide : un reste de roche dans la tuile (pied du décor de bordure) garde un sol, seul le vide pur reste noir
  if (hazard === 'void')
    for (let ty = 0; ty < tr; ty++)
      for (let tx = 0; tx < tc; tx++) {
        if (tiles[ty * tc + tx] !== 255) continue;
        let rock = false;
        for (let dy = 0; dy < per && !rock; dy++)
          for (let dx = 0; dx < per; dx++) {
            const x = tx * per + dx;
            const y = ty * per + dy;
            if (g.inside(x, y) && g.c[idx(x, y)] === ROCK) {
              rock = true;
              break;
            }
          }
        if (rock) tiles[ty * tc + tx] = 0;
      }
  b.z.groundTiles = { size: 4, cols: tc, rows: tr, kinds, data: tiles, fx: hazard === 'lava' ? { 2: { tint: 0xffa070, glow: 0xff3c08 } } : hazard === 'mud' ? { 2: { tint: 0x6a8a78 } } : undefined };
}

/** Bords intérieurs : murs pleins ou bas selon l'épaisseur de la masse, torches */
function placeIndoorWalls(c: ShapeCtx): void {
  const { def, g, U, b } = c;
  const base = def.border[0];
  const solid = (x: number, y: number) => {
    const v = g.get(x, y);
    return v === ROCK || v === WALL;
  };
  let torch = 0;
  for (let y = 0; y < g.rows; y++)
    for (let x = 0; x < g.cols; x++) {
      if (!g.isOpen(x, y)) continue;
      const x0 = x * U;
      const y0 = y * U;
      // fond (nord, ouest) devant une masse épaisse : murs pleins ; cloisons minces et devant (sud, est) : murs bas
      if (solid(x, y - 1)) {
        const full = solid(x, y - 2);
        b.prop(full ? `${base}_a` : `${base}_half_a`, x0 + 2, y0 - 0.5);
        if (full && (x * 7 + y * 3) % 4 === 0 && torch++ < 60) b.prop('torch_wall', x0 + 2, y0 + 0.35);
      }
      if (solid(x, y + 1)) b.prop(`${base}_half_a`, x0 + 2, y0 + U + 0.5);
      if (solid(x - 1, y)) b.prop(solid(x - 2, y) ? `${base}_b` : `${base}_half_b`, x0 - 0.5, y0 + 2);
      if (solid(x + 1, y)) b.prop(`${base}_half_b`, x0 + U + 0.5, y0 + 2);
    }
}

/** Bords extérieurs : décor dans la roche (probabilité décroissante avec la profondeur) et bâtiments */
function placeOutdoorBorder(c: ShapeCtx): void {
  const { def, rng, spec, shape, g, U, b, idx, structCell } = c;
  // profondeur dans la roche (8-connexe) depuis le praticable
  const depth = new Uint8Array(g.c.length);
  const q: number[] = [];
  for (let i = 0; i < g.c.length; i++) if (g.c[i] === OPEN) q.push(i);
  const seen = new Uint8Array(g.c.length);
  for (const i of q) seen[i] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % g.cols;
    const y = (i - x) / g.cols;
    if (g.c[i] !== OPEN && depth[i] >= 3) continue;
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!g.inside(nx, ny)) continue;
      const j = idx(nx, ny);
      if (seen[j] || g.c[j] !== ROCK || structCell[j]) continue;
      seen[j] = 1;
      depth[j] = g.c[i] === OPEN ? 1 : depth[i] + 1;
      q.push(j);
    }
  }
  const big = def.border.filter((p) => {
    const d = PROP_BY_ID[p];
    return d && Math.max(d.w, d.h) * (d.solid ?? 1) > 2.3;
  });
  const small = def.border.filter((p) => !big.includes(p));
  const prob = [0, 0.85, 0.5, 0.22];
  for (let i = 0; i < g.c.length; i++) {
    const d = depth[i];
    if (!d || !rng.chance(prob[d])) continue;
    const x = i % g.cols;
    const y = (i - x) / g.cols;
    // décalage loin du praticable : le décor reste dans sa case
    let ox = 0;
    let oy = 0;
    if (d === 1)
      for (const [dx, dy] of N8)
        if (g.get(x + dx, y + dy) === OPEN) {
          ox -= dx;
          oy -= dy;
        }
    const n = Math.hypot(ox, oy) || 1;
    const pool = d === 1 || !big.length ? (small.length ? small : def.border) : rng.chance(0.5) ? big : def.border;
    b.prop(rng.pick(pool), (x + 0.5 + (ox / n) * 0.3 + (d > 1 ? rng.float(-0.3, 0.3) : 0)) * U, (y + 0.5 + (oy / n) * 0.3 + (d > 1 ? rng.float(-0.3, 0.3) : 0)) * U);
  }
  // bâtiments
  const set = HOUSES[spec.v ?? ''] ?? HOUSES.ruins;
  for (const s of shape.structures) b.prop(rng.pick(set[s.kind] ?? set.house), ((s.x0 + s.x1) / 2) * U, ((s.y0 + s.y1) / 2) * U);
}

/** Rives : quelques pierres dans la lave ou la boue, lueurs sur la lave */
function placeShore(c: ShapeCtx): void {
  const { rng, indoor, g, U, b, hazard } = c;
  const lit = new Set<string>();
  for (let i = 0; i < g.c.length; i++) {
    if (g.c[i] !== HAZ) continue;
    const x = i % g.cols;
    const y = (i - x) / g.cols;
    if (!N8.some(([dx, dy]) => g.get(x + dx, y + dy) === OPEN)) continue;
    if (hazard === 'lava') {
      const k = `${Math.floor((x * U) / 8)},${Math.floor((y * U) / 8)}`;
      if (!lit.has(k)) {
        lit.add(k);
        b.light({ x: (x + 0.5) * U, y: (y + 0.5) * U, radius: 6, color: 0xff5a1e, intensity: 0.55, flicker: 0.2, z: 0.3 });
      }
    }
    if (hazard !== 'void' && !indoor && rng.chance(0.06)) b.prop('rock_c', (x + 0.5) * U, (y + 0.5) * U);
  }
}

/** Départ, arène du boss, poches d'événement et sanctuaire ; renvoie départ, boss et zones réservées (rayon de dégagement) */
function placeStartAndBoss(c: ShapeCtx, bossAt: BossAt, eventAt: EventAt): { start: Pt; boss: Pt; reserved: [number, number, number][] } {
  const { opts, L, b, at, openAt } = c;
  const start = at(L.start);
  b.start(start[0], start[1]);
  const boss = at(L.boss);
  // coffre et jumelle du boss : cases libres de l'arène, vers le départ
  const near = (p: Pt, dx: number, dy: number): Pt => {
    for (const k of [1, 0.75, 0.5, 0.25, 0]) {
      const x = p[0] + dx * k;
      const y = p[1] + dy * k;
      if (openAt(x, y) && openAt(x + 0.8, y) && openAt(x - 0.8, y) && openAt(x, y + 0.8) && openAt(x, y - 0.8)) return [x, y];
    }
    return p;
  };
  const toward = Math.atan2(start[1] - boss[1], start[0] - boss[0]);
  bossAt(b, boss[0], boss[1], near(boss, Math.cos(toward + 0.9) * 4.5, Math.sin(toward + 0.9) * 4.5), near(boss, Math.cos(toward - 0.9) * 3.5, Math.sin(toward - 0.9) * 3.5));
  const reserved: [number, number, number][] = [
    // départ calme : aucun groupe à moins de 24 unités (les premiers apparaissent hors de l’écran, à distance d’aggro)
    [start[0], start[1], 24],
    [boss[0], boss[1], 10],
  ];
  const pockets = L.pockets.map(at);
  const evAt = opts.event && pockets.length ? pockets[0] : null;
  if (evAt) {
    eventAt(b, evAt[0], evAt[1]);
    reserved.push([evAt[0], evAt[1], 7]);
  }
  const shrineAt = pockets[evAt ? 1 : 0] ?? pockets[0];
  if (shrineAt) {
    b.object({ kind: 'shrine', x: shrineAt[0], y: shrineAt[1] });
    reserved.push([shrineAt[0], shrineAt[1], 4]);
  }
  return { start, boss, reserved };
}

/** Groupes de monstres : densité constante sur la surface praticable */
function placePacks(c: ShapeCtx, reserved: [number, number, number][], pack: PackAt): void {
  const { rng, opts, L, g, U, b, at, openAt, area } = c;
  // un groupe pour AREA_PER_PACK u² (× densité des affixes), tirés de préférence dans les grandes salles et
  // clairières (poids croissant avec le dégagement : un couloir étroit en reçoit ~2× moins), jamais dans les
  // zones calmes (quelques respirations voulues entre les combats)
  const densityMul = (1 + opts.density / 100) * (opts.fortified ? 0.5 : 1);
  const n = Math.round((area / AREA_PER_PACK) * densityMul);
  const cPack = U === 2 ? 2 : 1;
  const cand: { p: Pt; room: number; key: number }[] = [];
  for (let i = 0; i < g.c.length; i++) {
    if (L.clr[i] < cPack || L.dStart[i] < 0) continue;
    const room = L.clr[i] * U;
    const w = 1 + Math.min(room, 12) / 3;
    // tirage pondéré sans remise (Efraimidis-Spirakis) : clé u^(1/w), les plus grandes d'abord
    cand.push({ p: at([i % g.cols, Math.floor(i / g.cols)]), room, key: rng.next() ** (1 / w) });
  }
  cand.sort((a, b) => b.key - a.key);
  const calm: [number, number, number][] = [];
  for (let k = 0, nc = Math.round(area / AREA_PER_CALM); k < nc * 6 && calm.length < nc; k++) {
    const c = cand[rng.int(cand.length)];
    if (!c) break;
    const r = rng.float(8, 12);
    if (reserved.some(([rx, ry, rr]) => Math.hypot(c.p[0] - rx, c.p[1] - ry) < rr + r) || calm.some(([x, y, rr]) => Math.hypot(c.p[0] - x, c.p[1] - y) < rr + r + 10)) continue;
    calm.push([c.p[0], c.p[1], r]);
  }
  const packs: [number, number, number][] = [];
  for (const spacing of [9, 6, 3.5]) {
    for (const {
      p: [x, y],
      room,
    } of cand) {
      if (packs.length >= n) break;
      const jx = x + rng.float(-0.3, 0.3) * U;
      const jy = y + rng.float(-0.3, 0.3) * U;
      if (!openAt(jx, jy)) continue;
      if (reserved.some(([rx, ry, rr]) => Math.hypot(jx - rx, jy - ry) < rr)) continue;
      if (calm.some(([cx, cy, rr]) => Math.hypot(jx - cx, jy - cy) < rr)) continue;
      if (packs.some(([px, py]) => Math.hypot(px - jx, py - jy) < spacing)) continue;
      packs.push([jx, jy, room]);
    }
    if (packs.length >= n) break;
  }
  for (const [x, y, room] of packs) pack(b, x, y, room);
}

/** Rien dans un mur : meutes et objets posés à décalage fixe reviennent sur la case praticable la plus proche */
function pullOutOfWalls(c: ShapeCtx): void {
  const { g, U, b, openAt } = c;
  const fix = (o: { x: number; y: number }) => {
    if (openAt(o.x, o.y)) return;
    const [cx, cy] = nearestOpen(g, o.x / U, o.y / U);
    o.x = (cx + 0.5) * U;
    o.y = (cy + 0.5) * U;
  };
  for (const s of b.z.spawns) fix(s);
  for (const o of b.z.objects) fix(o);
}

/** Décor : rôles imposés par la forme, puis décor du thème, sarcophages à l'intérieur */
function placeDecor(c: ShapeCtx, start: Pt, reserved: [number, number, number][]): void {
  const { def, rng, indoor, shape, L, g, U, b, openAt, area } = c;
  const occupied: [number, number, number][] = [
    ...reserved.map(([x, y]) => [x, y, 4] as [number, number, number]),
    ...b.z.spawns.map((s) => [s.x, s.y, 2.5] as [number, number, number]),
    ...b.z.objects.map((o) => [o.x, o.y, 1.5] as [number, number, number]),
  ];
  for (const d of shape.deco) {
    if (!openAt(d.x, d.y)) continue;
    if (occupied.some(([ox, oy, r]) => Math.hypot(ox - d.x, oy - d.y) < Math.min(r, 2.5))) continue;
    if (Math.hypot(d.x - start[0], d.y - start[1]) < 4) continue;
    b.prop(decoProp(d.role, def, rng), d.x, d.y);
  }
  const want = Math.round(area / (indoor ? 140 : 160));
  const spots: Pt[] = [];
  for (let i = 0; i < g.c.length; i++) {
    const x = i % g.cols;
    const y = (i - x) / g.cols;
    if (!g.isOpen(x, y)) continue;
    if (indoor) {
      // contre un mur, dans une salle assez large pour ne rien boucher
      for (const [dx, dy] of N8.slice(0, 4))
        if (!g.isOpen(x + dx, y + dy) && g.isOpen(x - dx, y - dy) && g.isOpen(x - 2 * dx, y - 2 * dy) && g.isOpen(x - dx + dy, y - dy + dx) && g.isOpen(x - dx - dy, y - dy - dx)) {
          spots.push([(x + 0.5 + dx * 0.22) * U, (y + 0.5 + dy * 0.22) * U]);
          break;
        }
    } else if (L.clr[i] >= 3) spots.push([(x + 0.5 + rng.float(-0.3, 0.3)) * U, (y + 0.5 + rng.float(-0.3, 0.3)) * U]);
  }
  rng.shuffle(spots);
  let placed = 0;
  let sarco = indoor ? Math.max(2, Math.round(area / 2500)) : 0;
  for (const [x, y] of spots) {
    if (placed >= want) break;
    if (occupied.some(([ox, oy, r]) => Math.hypot(ox - x, oy - y) < r + 1.5)) continue;
    if (b.z.props.length && b.z.props.some((p) => Math.abs(p.x - x) < 2.2 && Math.abs(p.y - y) < 2.2 && !p.prop.includes('wall'))) continue;
    if (sarco > 0) {
      b.object({ kind: 'sarcophagus', x, y });
      sarco--;
    } else b.prop(rng.pick(def.props), x, y);
    occupied.push([x, y, 2]);
    placed++;
  }
}

export function buildShaped(def: MapZoneDef, rng: Rng, opts: MapZoneOptions, pack: PackAt, bossAt: BossAt, eventAt: EventAt): ZoneDef {
  const spec = mapShapeOf(def.id, def.layout);
  const indoor = def.layout === 'labyrinth';
  const shape = generateShape(spec, indoor, def.tier, rng.fork('shape'));
  const L = layoutShape(shape);
  const g = shape.g;
  const U = g.cell;
  const W = g.cols * U;
  const H = g.rows * U;
  const b = new ZoneBuilder('map', def.name, W, H, def.ground as GroundKind, { theme: 'map', mood: def.mood, ambient: def.ambient });
  const at = (p: Pt): Pt => [(p[0] + 0.5) * U, (p[1] + 0.5) * U];
  const idx = (x: number, y: number) => y * g.cols + x;
  const cellOf = (x: number, y: number): Pt => [Math.floor(x / U), Math.floor(y / U)];
  const openAt = (x: number, y: number) => g.isOpen(...cellOf(x, y));
  const area = g.count(OPEN) * U * U;

  // cases occupées par un bâtiment-décor (collision du décor seulement)
  const structCell = new Uint8Array(g.c.length);
  for (const s of shape.structures) for (let y = s.y0; y < s.y1; y++) for (let x = s.x0; x < s.x1; x++) structCell[idx(x, y)] = 1;
  const hazard = spec.hazard ?? 'lava';
  const c: ShapeCtx = { def, rng, opts, spec, indoor, shape, L, g, U, W, H, b, at, idx, cellOf, openAt, area, structCell, hazard };

  blockCollisions(c);
  paintGround(c);
  if (indoor) placeIndoorWalls(c);
  else placeOutdoorBorder(c);
  placeShore(c);
  const { start, reserved } = placeStartAndBoss(c, bossAt, eventAt);
  placePacks(c, reserved, pack);
  pullOutOfWalls(c);
  placeDecor(c, start, reserved);
  return b.build();
}
