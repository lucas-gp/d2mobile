/** A* sur la grille de marche (utilisé par les bots, en lecture seule). */
import { CELL, type WalkGrid } from '../grid';

export function findPath(g: WalkGrid, sx: number, sy: number, tx: number, ty: number, maxNodes = 150000): { x: number; y: number }[] | null {
  const scx = Math.floor(sx / CELL);
  const scy = Math.floor(sy / CELL);
  let tcx = Math.floor(tx / CELL);
  let tcy = Math.floor(ty / CELL);
  if (g.isBlockedCell(tcx, tcy)) {
    const f = g.nearestFree(tx, ty, 4);
    if (!f) return null;
    tcx = Math.floor(f.x / CELL);
    tcy = Math.floor(f.y / CELL);
  }
  const cols = g.cols;
  const start = scy * cols + scx;
  const goal = tcy * cols + tcx;
  const gScore = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const open: [number, number][] = [[0, start]];
  const h = (i: number) => {
    const x = i % cols;
    const y = (i - x) / cols;
    const dx = Math.abs(x - tcx);
    const dy = Math.abs(y - tcy);
    return Math.max(dx, dy) + 0.41 * Math.min(dx, dy);
  };
  let expanded = 0;
  // file de priorité binaire
  const push = (f: number, i: number) => {
    open.push([f, i]);
    let k = open.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (open[p][0] <= open[k][0]) break;
      [open[p], open[k]] = [open[k], open[p]];
      k = p;
    }
  };
  const pop = (): number => {
    const top = open[0][1];
    const last = open.pop()!;
    if (open.length) {
      open[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < open.length && open[l][0] < open[m][0]) m = l;
        if (r < open.length && open[r][0] < open[m][0]) m = r;
        if (m === k) break;
        [open[m], open[k]] = [open[k], open[m]];
        k = m;
      }
    }
    return top;
  };
  while (open.length && expanded < maxNodes) {
    const cur = pop();
    if (cur === goal) break;
    expanded++;
    const cx = cur % cols;
    const cy = (cur - cx) / cols;
    const gc = gScore.get(cur)!;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = cx + ox;
        const ny = cy + oy;
        if (g.isBlockedCell(nx, ny)) continue;
        if (ox && oy && (g.isBlockedCell(cx + ox, cy) || g.isBlockedCell(cx, cy + oy))) continue;
        // éviter de frôler les murs : coût supplémentaire près d'un obstacle
        const n = ny * cols + nx;
        let cost = ox && oy ? 1.41 : 1;
        if (g.isBlockedCell(nx + 1, ny) || g.isBlockedCell(nx - 1, ny) || g.isBlockedCell(nx, ny + 1) || g.isBlockedCell(nx, ny - 1)) cost += 0.6;
        const ng = gc + cost;
        if (ng < (gScore.get(n) ?? Infinity)) {
          gScore.set(n, ng);
          came.set(n, cur);
          push(ng + h(n), n);
        }
      }
    }
  }
  if (!came.has(goal) && goal !== start) return null;
  const path: { x: number; y: number }[] = [];
  let c = goal;
  while (c !== start) {
    const x = c % cols;
    const y = (c - x) / cols;
    path.push({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL });
    c = came.get(c)!;
    if (c === undefined) break;
  }
  path.reverse();
  // simplification : on saute les points visibles en ligne droite
  const out: { x: number; y: number }[] = [];
  let ax = sx;
  let ay = sy;
  for (let i = 0; i < path.length; i++) {
    const next = path[i + 1];
    if (next && clearLine(g, ax, ay, next.x, next.y)) continue;
    out.push(path[i]);
    ax = path[i].x;
    ay = path[i].y;
  }
  return out;
}

function clearLine(g: WalkGrid, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(d / (CELL * 0.5));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (g.circleBlocked(ax + (bx - ax) * t, ay + (by - ay) * t, 0.4)) return false;
  }
  return true;
}
