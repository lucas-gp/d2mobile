/** Accessibilité à pied dans une zone (8-connexe sans couper les coins, comme WalkGrid.connected) : un seul parcours par zone */
import type { ZoneDef } from '../../../../src/data/zone-types';
import { findPath } from '../../../../src/sim/bot/pathfind';
import { TICK_HZ } from '../../../../src/sim/constants';
import type { Game } from '../../../../src/sim/game';
import { CELL, type WalkGrid } from '../../../../src/sim/grid';
import { buildGrid } from '../../../../src/sim/world';

export function reachFrom(z: ZoneDef, g: WalkGrid = buildGrid(z)): { grid: WalkGrid; seen: Uint8Array; reach: (x: number, y: number) => boolean; free: number } {
  const seen = new Uint8Array(g.cols * g.rows);
  const q = new Int32Array(g.cols * g.rows);
  let t = 0;
  const s = g.nearestFree(z.start.x, z.start.y, 2) ?? z.start;
  q[t++] = g.idx(Math.floor(s.x / CELL), Math.floor(s.y / CELL));
  seen[q[0]] = 1;
  for (let h = 0; h < t; h++) {
    const i = q[h];
    const cx = i % g.cols;
    const cy = (i - cx) / g.cols;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const nx = cx + ox;
        const ny = cy + oy;
        if (g.isBlockedCell(nx, ny)) continue;
        if (ox && oy && (g.isBlockedCell(cx + ox, cy) || g.isBlockedCell(cx, cy + oy))) continue;
        const j = g.idx(nx, ny);
        if (!seen[j]) ((seen[j] = 1), (q[t++] = j));
      }
  }
  const reach = (x: number, y: number) => {
    const f = g.nearestFree(x, y, 2);
    return !!f && !!seen[g.idx(Math.floor(f.x / CELL), Math.floor(f.y / CELL))];
  };
  return { grid: g, seen, reach, free: t };
}

/** Distances de marche (sous-cases, 8-connexe sans couper les coins) depuis un point */
export function walkField(g: WalkGrid, x: number, y: number): Int32Array {
  const d = new Int32Array(g.cols * g.rows).fill(-1);
  const q = new Int32Array(g.cols * g.rows);
  let t = 0;
  const s = g.nearestFree(x, y, 2) ?? { x, y };
  const s0 = g.idx(Math.floor(s.x / CELL), Math.floor(s.y / CELL));
  d[s0] = 0;
  q[t++] = s0;
  for (let h = 0; h < t; h++) {
    const i = q[h];
    const cx = i % g.cols;
    const cy = (i - cx) / g.cols;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        if (g.isBlockedCell(cx + ox, cy + oy)) continue;
        if (ox && oy && (g.isBlockedCell(cx + ox, cy) || g.isBlockedCell(cx, cy + oy))) continue;
        const j = g.idx(cx + ox, cy + oy);
        if (d[j] < 0) ((d[j] = d[i] + 1), (q[t++] = j));
      }
  }
  return d;
}

/**
 * Parcours « à pied » d'une carte ouverte : le personnage (immortel) marche par A* vers le groupe le plus
 * proche (monstre vivant ou point d'apparition pas encore déclenché) et tue au contact. Vérifie qu'une run
 * se termine sans blocage ; renvoie le temps simulé (s), les tués et ce qui reste.
 */
export function walkClear(game: Game, maxSeconds = 900): { seconds: number; kills: number; left: number; completed: boolean; stuck: boolean } {
  const w = game.world;
  w.godMode = true;
  const p = w.player;
  let path: { x: number; y: number }[] = [];
  let goal: { x: number; y: number } | null = null;
  let target: { x: number; y: number; dead?: boolean } | null = null;
  let since = w.tick;
  let kills = 0;
  let stuck = false;
  let lastMove = { x: p.x, y: p.y, tick: w.tick };
  const t0 = w.tick;
  while (w.tick - t0 < maxSeconds * TICK_HZ) {
    const alive = w.monsters.filter((m) => !m.dead && !m.isSummon);
    for (const m of alive)
      if (Math.hypot(m.x - p.x, m.y - p.y) < 3.2) {
        w.killMonster(m, p);
        kills++;
      }
    const targets: { x: number; y: number; dead?: boolean }[] = [...alive.filter((m) => !m.dead), ...w.pendingSpawns.filter((s) => !s.wave && !s.seal)];
    if (!targets.length) break;
    // cible tenue jusqu'à sa mort (ou son apparition), 10 s au plus : pas d'hésitation entre deux détours
    if (!target || target.dead || !targets.includes(target) || w.tick - since > TICK_HZ * 10) {
      // la plus proche en distance de marche (le joueur suit les couloirs, il ne vise pas à travers les murs)
      const d = walkField(w.grid, p.x, p.y);
      const dist = (c: { x: number; y: number }) => {
        const f = w.grid.nearestFree(c.x, c.y, 3);
        const v = f ? d[w.grid.idx(Math.floor(f.x / CELL), Math.floor(f.y / CELL))] : -1;
        return v < 0 ? 1e9 : v;
      };
      target = targets.reduce((b, c) => (dist(c) < dist(b) ? c : b));
      since = w.tick;
      path = [];
    }
    const t = target;
    if (!goal || Math.hypot(goal.x - t.x, goal.y - t.y) > 2 || !path.length) {
      goal = { x: t.x, y: t.y };
      path = findPath(w.grid, p.x, p.y, t.x, t.y) ?? [];
    }
    while (path.length && Math.hypot(path[0].x - p.x, path[0].y - p.y) < 0.4) path.shift();
    const next = path[0] ?? t;
    const l = Math.hypot(next.x - p.x, next.y - p.y) || 1;
    w.input.moveX = (next.x - p.x) / l;
    w.input.moveY = (next.y - p.y) / l;
    game.step(1);
    if (Math.hypot(p.x - lastMove.x, p.y - lastMove.y) > 1) lastMove = { x: p.x, y: p.y, tick: w.tick };
    else if (w.tick - lastMove.tick > TICK_HZ * 20) {
      stuck = true;
      break;
    }
  }
  w.input.moveX = w.input.moveY = 0;
  const left = w.monsters.filter((m) => !m.dead && !m.isSummon).length + w.pendingSpawns.filter((s) => !s.wave && !s.seal).length;
  return { seconds: (w.tick - t0) / TICK_HZ, kills, left, completed: !!w.run?.completed, stuck };
}
