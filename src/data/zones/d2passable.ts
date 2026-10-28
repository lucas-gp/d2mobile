/**
 * Garde-fou de décor sur les cartes D2 : un tonneau, une caisse ou un rocher posé contre un mur (ou devant un passage étroit comme le pied d'une arche) ne
 * doit jamais fermer un passage ni couper un coin de la carte du reste. Chaque prop plein est essayé tour à tour sur la grille de marche (le disque du
 * personnage), dans une fenêtre autour de lui : s'il isole des cases jusque-là reliées au bord de la fenêtre, il est retiré. Déterministe (ordre des props).
 */
import { PLAYER_RADIUS, TERRAIN_RADIUS } from '../../sim/constants';
import { CELL, WalkGrid } from '../../sim/grid';
import { PROP_BY_ID, propRect } from '../props';
import { buildGrid } from '../../sim/buildgrid';
import type { D2MapData } from '../d2map';
import type { PropPlacement, ZoneDef } from '../zone-types';
import { runSteps, type Steps } from './steps';

/** Emprise d'un prop plein (null : sans collision) */
function propBox(pl: PropPlacement): [number, number, number, number] | null {
  const def = PROP_BY_ID[pl.prop];
  if (!def || def.shape === 'none') return null;
  const sc = pl.scale ?? 1;
  if (def.shape === 'circle') {
    const r = (Math.min(def.w, def.h) * sc * (def.solid ?? 1)) / 2;
    return [pl.x - r, pl.y - r, pl.x + r, pl.y + r];
  }
  return propRect(def, pl.x, pl.y, sc);
}

function blockProp(g: WalkGrid, pl: PropPlacement, box: [number, number, number, number]): void {
  const def = PROP_BY_ID[pl.prop];
  if (def.shape === 'circle') g.blockCircle(pl.x, pl.y, (box[2] - box[0]) / 2, def.opaque);
  else g.blockRect(box[0], box[1], box[2], box[3], def.opaque);
}

/** Cases de la fenêtre [x0..x1] × [y0..y1] reliées (8-connexe sans couper les coins) à son bord par des cases où le disque du personnage tient */
function windowReach(free: (cx: number, cy: number) => boolean, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && free(x0 + x, y0 + y)) {
        seen[y * w + x] = 1;
        stack.push(y * w + x);
      }
    }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const cx = i % w;
    const cy = (i - cx) / w;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = cx + ox;
        const ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx] || !free(x0 + nx, y0 + ny)) continue;
        if (ox && oy && (!free(x0 + cx + ox, y0 + cy) || !free(x0 + cx, y0 + cy + oy))) continue;
        seen[ny * w + nx] = 1;
        stack.push(ny * w + nx);
      }
    }
  }
  return seen;
}

/** Case libre dont au plus deux des huit voisines le sont : un passage d'une case de large */
function narrow(freeB: Uint8Array, w: number, x: number, y: number, h: number): boolean {
  let n = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if ((ox || oy) && x + ox >= 0 && y + oy >= 0 && x + ox < w && y + oy < h && freeB[(y + oy) * w + x + ox]) n++;
  return n <= 2;
}

export function keepPassable(out: ZoneDef, m: D2MapData): void {
  runSteps(keepPassableSteps(out, m));
}

/** `keepPassable` in steps of 6 props (lot 312: built behind the play, src/data/zones/steps.ts) */
export function* keepPassableSteps(out: ZoneDef, m: D2MapData): Steps<void> {
  const g = new WalkGrid(out.width, out.height);
  if (m.grid.cols !== g.cols || m.grid.rows !== g.rows) return;
  g.blocked.set(m.grid.blocked);
  const { cols, rows } = g;
  const free = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < cols && cy < rows && !g.circleBlocked((cx + 0.5) * CELL, (cy + 0.5) * CELL, PLAYER_RADIUS);
  const margin = Math.ceil((PLAYER_RADIUS * 2) / CELL) + 8;
  const kept: PropPlacement[] = [];
  let tried = 0;
  for (const pl of out.props) {
    if (++tried % 6 === 0) yield;
    const box = propBox(pl);
    if (!box) {
      kept.push(pl);
      continue;
    }
    const x0 = Math.max(0, Math.floor(box[0] / CELL) - margin);
    const y0 = Math.max(0, Math.floor(box[1] / CELL) - margin);
    const x1 = Math.min(cols - 1, Math.floor(box[2] / CELL) + margin);
    const y1 = Math.min(rows - 1, Math.floor(box[3] / CELL) + margin);
    if (x1 <= x0 + 2 || y1 <= y0 + 2) {
      kept.push(pl);
      continue;
    }
    const w = x1 - x0 + 1;
    const before = windowReach(free, x0, y0, x1, y1);
    // cases libres avant le prop : un passage d'une case de large (pied d'arche, couloir) ne doit pas être bouché par un tonneau
    const freeB = new Uint8Array(w * (y1 - y0 + 1));
    for (let y = 0; y <= y1 - y0; y++) for (let x = 0; x < w; x++) freeB[y * w + x] = free(x0 + x, y0 + y) ? 1 : 0;
    // décor de bord dans le vide ou dans un mur : rien d'atteignable alentour
    if (!before.includes(1)) {
      blockProp(g, pl, box);
      kept.push(pl);
      continue;
    }
    const savedB: Uint8Array[] = [];
    const savedO: Uint8Array[] = [];
    for (let y = y0; y <= y1; y++) {
      savedB.push(g.blocked.slice(y * cols + x0, y * cols + x1 + 1));
      savedO.push(g.opaque.slice(y * cols + x0, y * cols + x1 + 1));
    }
    blockProp(g, pl, box);
    const after = windowReach(free, x0, y0, x1, y1);
    let cut = false;
    for (let y = 0; y <= y1 - y0 && !cut; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!freeB[i]) continue;
        if (before[i] && !after[i] && free(x0 + x, y0 + y)) {
          cut = true;
          break;
        }
        if (!free(x0 + x, y0 + y) && narrow(freeB, w, x, y, y1 - y0 + 1)) {
          cut = true;
          break;
        }
      }
    if (!cut) {
      kept.push(pl);
      continue;
    }
    for (let y = y0; y <= y1; y++) {
      g.blocked.set(savedB[y - y0], y * cols + x0);
      g.opaque.set(savedO[y - y0], y * cols + x0);
    }
  }
  out.props = kept;
}

/**
 * Garde-fou final des objets et sorties : tout ce que le personnage ne peut pas rejoindre à pied depuis le départ (îlot de la carte D2, case de décor
 * bouchée) est ramené à la case atteignable la plus proche s'il compte (quête, sortie), sinon retiré (tonneau, coffre décoratif).
 */
export function reachFix(z: ZoneDef): void {
  runSteps(reachFixSteps(z));
}

/** `reachFix` in steps (lot 312: built behind the play, src/data/zones/steps.ts) */
export function* reachFixSteps(z: ZoneDef): Steps<void> {
  if (!z.d2Map) return;
  const g = buildGrid(z);
  for (const b of z.blockers) if (b.gate && b.rect) g.unblockRect(...b.rect);
  yield;
  const { cols, rows } = g;
  // lot 312: each sub-tile's answer kept (the grid does not change here): the same answers, a few times fewer disc tests
  const memo = new Int8Array(cols * rows);
  const free = (cx: number, cy: number) => {
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return false;
    const i = cy * cols + cx;
    const v = memo[i];
    if (v) return v > 0;
    const f = !g.circleBlocked((cx + 0.5) * CELL, (cy + 0.5) * CELL, TERRAIN_RADIUS);
    memo[i] = f ? 1 : -1;
    return f;
  };
  const seen = new Uint8Array(cols * rows);
  let sx = Math.floor(z.start.x / CELL);
  let sy = Math.floor(z.start.y / CELL);
  for (let r = 0; r < 8 && !free(sx, sy); r++) {
    for (let oy = -r; oy <= r; oy++)
      for (let ox = -r; ox <= r; ox++)
        if (free(sx + ox, sy + oy)) {
          sx += ox;
          sy += oy;
          r = 99;
          oy = 99;
          break;
        }
  }
  if (!free(sx, sy)) return;
  const st = [sy * cols + sx];
  seen[st[0]] = 1;
  let popped = 0;
  while (st.length) {
    // lot 312: 20,000 sub-tiles a step (the same walk, paused)
    if (++popped % 20000 === 0) yield;
    const i = st.pop()!;
    const cx = i % cols;
    const cy = (i - cx) / cols;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const nx = cx + ox;
        const ny = cy + oy;
        if ((!ox && !oy) || !free(nx, ny) || seen[ny * cols + nx]) continue;
        if (ox && oy && (!free(cx + ox, cy) || !free(cx, cy + oy))) continue;
        seen[ny * cols + nx] = 1;
        st.push(ny * cols + nx);
      }
  }
  yield;
  const ok = (x: number, y: number) => seen[Math.floor(y / CELL) * cols + Math.floor(x / CELL)] === 1;
  /** Case atteignable la plus proche (anneaux croissants) */
  const nearest = (x: number, y: number): { x: number; y: number } | null => {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    for (let r = 1; r < Math.max(cols, rows); r++) {
      let best: { x: number; y: number } | null = null;
      let bd = Infinity;
      for (let oy = -r; oy <= r; oy++)
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const nx = cx + ox;
          const ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || !seen[ny * cols + nx]) continue;
          const d = ox * ox + oy * oy;
          if (d < bd) {
            bd = d;
            best = { x: (nx + 0.5) * CELL, y: (ny + 0.5) * CELL };
          }
        }
      if (best) return best;
    }
    return null;
  };
  z.objects = z.objects.filter((o) => {
    if (ok(o.x, o.y)) return true;
    if (o.kind !== 'quest') return false;
    let p = nearest(o.x, o.y);
    // case la plus proche trop loin (objet posé au fond d'un bloc plein) : près du chef de la zone, sinon du départ
    if (!p || Math.hypot(p.x - o.x, p.y - o.y) > 20) {
      const boss = z.spawns.find((q) => q.rank === 'boss' || q.runBoss);
      p = nearest((boss ?? z.start).x, (boss ?? z.start).y) ?? p;
    }
    if (p) {
      o.x = p.x;
      o.y = p.y;
    }
    return true;
  });
  for (const e of z.exits) {
    if (ok(e.x, e.y)) continue;
    const p = nearest(e.x, e.y);
    if (p) {
      e.x = p.x;
      e.y = p.y;
    }
  }
}
