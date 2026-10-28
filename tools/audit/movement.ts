/**
 * Audit du déplacement du joueur sur cartes D2 : (1) arêtes entre cases voisines franchissables avec la physique réelle (`moveActor`) par rapport
 * au point D2, classées par type de blocage ; (2) trajets de départ à sortie/objets au joystick (suit un chemin A*) et au clic (ligne droite avant,
 * `World.steer` après) : arrivée, durée, ticks sans déplacement.
 * Usage : npx tsx tools/audit/movement.ts [--edges] [--trips] [--all] [id ...]   (cartes privées : $D2_PRIVATE_DIR/out/game/maps)
 */
import '../mods/auto';
import fs from 'node:fs';
import { clearD2Maps, parseD2Map, registerD2Map } from '../../src/data/d2map';
import { RUNS } from '../../src/data/runs';
import { buildHarrogath } from '../../src/data/zones/harrogath';
import type { ZoneDef } from '../../src/data/zone-types';
import { Game } from '../../src/sim/game';
import { CELL } from '../../src/sim/grid';
import { World } from '../../src/sim/world';
import { findPath } from '../../src/sim/bot/pathfind';

const DIR = process.env.D2_MAPS ?? `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps`;
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const only = args.filter((a) => !a.startsWith('--'));
const DETAIL = ['chaos', 'a4_chaos', 'harrogath', 'tristram', 'a1_town', 'a2_town', 'a3_town', 'a4_fortress', 'a1_cathedral', 'a2_halls1', 'a3_durance2', 'a5_keep1', 'baal', 'a3_travincal'];

function mkWorld(z: ZoneDef): { g: Game; w: World } {
  const g = new Game(undefined, 'barbarian');
  g.mode = 'run';
  g.world = new World({ zone: z, seed: 7, difficulty: 0, zoneLevel: 30, character: g.character });
  const w = g.world;
  w.autoCfg = g.settings;
  w.monsters.length = 0;
  w.pendingSpawns = [];
  for (const b of z.blockers) if (b.gate && b.rect) w.grid.unblockRect(...b.rect);
  return { g, w };
}

function zones(): { id: string; z: ZoneDef }[] {
  const out: { id: string; z: ZoneDef }[] = [];
  const seen = new Set<string>();
  const add = (id: string, z: ZoneDef | null) => {
    if (!z || !z.d2Map || seen.has(id)) return;
    if (only.length ? !only.includes(id) : !flags.has('--all') && !DETAIL.includes(id)) return;
    seen.add(id);
    out.push({ id, z });
  };
  add('harrogath', buildHarrogath(1));
  for (const run of RUNS) {
    try {
      add(run.id, run.build(1, 0));
    } catch {
      /* ignoré */
    }
  }
  return out;
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Arêtes : point D2 (cases libres, diagonales sans couper les coins) contre mouvement réel (poussée droite vers le centre de la case voisine) */
function edges(id: string, z: ZoneDef): string {
  const { w } = mkWorld(z);
  const g = w.grid;
  const { cols, rows } = g;
  const free = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < cols && cy < rows && !g.blocked[cy * cols + cx];
  const p = w.player;
  const walk = (ax: number, ay: number, bx: number, by: number): boolean => {
    p.x = p.px = ax;
    p.y = p.py = ay;
    for (let t = 0; t < 10; t++) {
      const dx = bx - p.x;
      const dy = by - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.2) return true;
      const s = Math.min(0.2, d);
      w.moveActor(p, (dx / d) * s, (dy / d) * s, true);
    }
    return Math.hypot(bx - p.x, by - p.y) < 0.25;
  };
  // départ
  let sx = Math.floor(z.start.x / CELL);
  let sy = Math.floor(z.start.y / CELL);
  for (let r = 0; r < 10 && !free(sx, sy); r++)
    for (let oy = -r; oy <= r; oy++)
      for (let ox = -r; ox <= r; ox++)
        if (free(sx + ox, sy + oy) && !free(sx, sy)) {
          sx += ox;
          sy += oy;
        }
  const reachPt = new Uint8Array(cols * rows);
  const reachJoy = new Uint8Array(cols * rows);
  const bfs = (useJoy: boolean): number => {
    const seen = useJoy ? reachJoy : reachPt;
    const st = [sy * cols + sx];
    seen[st[0]] = 1;
    let n = 0;
    while (st.length) {
      const i = st.pop()!;
      n++;
      const cx = i % cols;
      const cy = (i - cx) / cols;
      for (const [ox, oy] of DIRS) {
        const nx = cx + ox;
        const ny = cy + oy;
        if (!free(nx, ny) || seen[ny * cols + nx]) continue;
        if (ox && oy && (!free(cx + ox, cy) || !free(cx, cy + oy))) continue;
        if (useJoy && !walk((cx + 0.5) * CELL, (cy + 0.5) * CELL, (nx + 0.5) * CELL, (ny + 0.5) * CELL)) continue;
        seen[ny * cols + nx] = 1;
        st.push(ny * cols + nx);
      }
    }
    return n;
  };
  const nPt = bfs(false);
  const nJoy = bfs(true);
  // causes des arêtes ratées entre cases atteignables par le point
  const cause = { stairs: 0, corner: 0, border: 0, small: 0, other: 0 };
  let legal = 0;
  let fail = 0;
  for (let i = 0; i < cols * rows; i++) {
    if (!reachPt[i]) continue;
    const cx = i % cols;
    const cy = (i - cx) / cols;
    for (const [ox, oy] of DIRS) {
      const nx = cx + ox;
      const ny = cy + oy;
      if (!free(nx, ny)) continue;
      if (ox && oy && (!free(cx + ox, cy) || !free(cx, cy + oy))) continue;
      legal++;
      if (walk((cx + 0.5) * CELL, (cy + 0.5) * CELL, (nx + 0.5) * CELL, (ny + 0.5) * CELL)) continue;
      fail++;
      // classification : nombre de voisines libres autour des deux cases
      let blockedAround = 0;
      for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) if (!free(Math.min(cx, nx) + dx, Math.min(cy, ny) + dy)) blockedAround++;
      const diagOnly = ox && oy;
      const o1 = free(cx + ox, cy) ? 1 : 0;
      const o2 = free(cx, cy + oy) ? 1 : 0;
      if (diagOnly && o1 + o2 === 1) cause.corner++;
      else if (diagOnly) cause.stairs++;
      else if (blockedAround <= 4) cause.small++;
      else if (blockedAround <= 7) cause.border++;
      else cause.other++;
    }
  }
  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(2) : '0');
  return `${id.padEnd(16)} point ${String(nPt).padStart(7)} joystick ${String(nJoy).padStart(7)} (${pct(nJoy, nPt)} %) | arêtes ${legal} ratées ${fail} (${pct(fail, legal)} %) : escalier/diag ${cause.stairs}, coin ${cause.corner}, petit ${cause.small}, bordure ${cause.border}, autre ${cause.other}`;
}

/** A* brut (cases voisines, sans lissage) : le chemin que suit « à peu près » un joueur au joystick */
function rawPath(g: World['grid'], sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] | null {
  const cols = g.cols;
  const s = Math.floor(sy / CELL) * cols + Math.floor(sx / CELL);
  const t = Math.floor(ty / CELL) * cols + Math.floor(tx / CELL);
  const cost = new Map<number, number>([[s, 0]]);
  const came = new Map<number, number>();
  const open: [number, number][] = [[0, s]];
  const hh = (i: number) => {
    const dx = Math.abs((i % cols) - (t % cols));
    const dy = Math.abs(Math.floor(i / cols) - Math.floor(t / cols));
    return Math.max(dx, dy) + 0.41 * Math.min(dx, dy);
  };
  let n = 0;
  while (open.length && n++ < 300000) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
    const [, cur] = open.splice(bi, 1)[0];
    if (cur === t) break;
    const cx = cur % cols;
    const cy = (cur - cx) / cols;
    for (const [ox, oy] of DIRS) {
      if (!g.playerStep(cx, cy, ox, oy)) continue;
      const nn = (cy + oy) * cols + cx + ox;
      const ng = cost.get(cur)! + (ox && oy ? 1.41 : 1);
      if (ng < (cost.get(nn) ?? Infinity)) {
        cost.set(nn, ng);
        came.set(nn, cur);
        open.push([ng + hh(nn), nn]);
      }
    }
  }
  if (!came.has(t)) return null;
  const out: { x: number; y: number }[] = [];
  for (let c = t; c !== s; c = came.get(c)!) out.push({ x: ((c % cols) + 0.5) * CELL, y: (Math.floor(c / cols) + 0.5) * CELL });
  return out.reverse();
}

/**
 * Poussées au joystick : depuis le centre de chaque case libre (échantillon), le stick tenu 12 ticks dans une des 16 directions ; une poussée est
 * « perdue » si le personnage avance de moins de 60 % de la distance alors que le POINT D2 (trajet droit sans case bloquée) aurait passé.
 */
function pushes(id: string, z: ZoneDef): string {
  const { w } = mkWorld(z);
  const g = w.grid;
  const p = w.player;
  let tests = 0;
  let lost = 0;
  let lostZero = 0;
  const stepLen = 0.2;
  const N = 12;
  let seed = 99;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const total = g.cols * g.rows;
  for (let k = 0; k < 60000; k++) {
    const i = Math.floor(rnd() * total);
    const cx = i % g.cols;
    const cy = (i - cx) / g.cols;
    if (g.blocked[i]) continue;
    // près d'un obstacle seulement (les grandes plaines libres ne disent rien)
    let near = false;
    for (let oy = -2; oy <= 2 && !near; oy++)
      for (let ox = -2; ox <= 2; ox++)
        if (g.isBlockedCell(cx + ox, cy + oy)) {
          near = true;
          break;
        }
    if (!near) continue;
    const ang = Math.floor(rnd() * 16) * (Math.PI / 8);
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const x0 = (cx + 0.5) * CELL + (rnd() - 0.5) * 0.3;
    const y0 = (cy + 0.5) * CELL + (rnd() - 0.5) * 0.3;
    if (g.isBlockedAt(x0, y0)) continue;
    if (!g.walkLine(x0, y0, x0 + ux * stepLen * N, y0 + uy * stepLen * N, 0, 0.05)) continue; // le point D2 ne passe pas : sans objet
    tests++;
    p.x = p.px = x0;
    p.y = p.py = y0;
    for (let t = 0; t < N; t++) w.moveActor(p, ux * stepLen, uy * stepLen, true);
    const adv = (p.x - x0) * ux + (p.y - y0) * uy;
    if (adv < stepLen * N * 0.6) lost++;
    if (Math.hypot(p.x - x0, p.y - y0) < 0.02) lostZero++;
  }
  // catégorie B : le trajet droit est bloqué (même pour un point) par un obstacle, mais un décalage latéral de 0,6 au plus ouvre un passage de 5 unités
  let bt = 0;
  let bLost = 0;
  const L = 5;
  for (let k = 0; k < 40000 && bt < 1500; k++) {
    const i = Math.floor(rnd() * total);
    const cx = i % g.cols;
    const cy = (i - cx) / g.cols;
    if (g.blocked[i]) continue;
    const ang = Math.floor(rnd() * 16) * (Math.PI / 8);
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const x0 = (cx + 0.5) * CELL + (rnd() - 0.5) * 0.3;
    const y0 = (cy + 0.5) * CELL + (rnd() - 0.5) * 0.3;
    if (g.isBlockedAt(x0, y0) || g.circleBlocked(x0, y0, 0.15)) continue;
    // premier obstacle sur la ligne à moins de 2 unités
    let hit = -1;
    for (let d = 0.3; d <= 2; d += 0.05)
      if (g.isBlockedAt(x0 + ux * d, y0 + uy * d)) {
        hit = d;
        break;
      }
    if (hit < 0) continue;
    let gap = false;
    for (let sgn = 1; sgn >= -1 && !gap; sgn -= 2)
      for (let sh = 0.1; sh <= 0.61 && !gap; sh += 0.05) {
        const sx = x0 - uy * sh * sgn;
        const sy = y0 + ux * sh * sgn;
        if (!g.circleBlocked(sx, sy, 0.17) && g.walkLine(sx, sy, sx + ux * L, sy + uy * L, 0.17, 0.05)) gap = true;
      }
    if (!gap) continue;
    bt++;
    p.x = p.px = x0;
    p.y = p.py = y0;
    w.input.moveX = ux;
    w.input.moveY = uy;
    w.step(40);
    const adv = (p.x - x0) * ux + (p.y - y0) * uy;
    if (adv < L * 0.6) {
      bLost++;
      if (process.env.DBGP && bLost <= 4)
        console.log(
          `  perdu ${id} (${x0.toFixed(2)},${y0.toFixed(2)}) dir ${(ang * 57.3).toFixed(0)}° hit ${hit.toFixed(2)} fini (${p.x.toFixed(2)},${p.y.toFixed(2)}) mode ${p.mode} hp ${p.hp.toFixed(0)} frz ${p.freezeT} dead ${p.dead}`,
        );
    }
  }
  w.input.moveX = w.input.moveY = 0;
  return `${id.padEnd(16)} obstacle à passage voisin (<=0,6) : ${bt} poussées, bloquées ${bLost} (${((100 * bLost) / Math.max(1, bt)).toFixed(1)} %) | poussées ${tests} : perdues (<60 %) ${lost} (${((100 * lost) / Math.max(1, tests)).toFixed(2)} %), immobiles ${lostZero} (${((100 * lostZero) / Math.max(1, tests)).toFixed(2)} %)`;
}

interface Trip {
  ok: boolean;
  ticks: number;
  zero: number;
}

function targetsOf(z: ZoneDef, w: World): { x: number; y: number }[] {
  const t: { x: number; y: number }[] = [];
  for (const e of z.exits ?? []) t.push({ x: e.x, y: e.y });
  const objs = z.objects
    .filter((o) => findPath(w.grid, z.start.x, z.start.y, o.x, o.y, 60000))
    .sort((a, b) => Math.hypot(a.x - z.start.x, a.y - z.start.y) - Math.hypot(b.x - z.start.x, b.y - z.start.y));
  for (const o of objs.slice(0, 6)) t.push({ x: o.x, y: o.y });
  // quelques points de sol à 8-20 unités à vol d'oiseau, atteignables
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let k = 0, n = 0; k < 200 && n < 8; k++) {
    const a = rnd() * Math.PI * 2;
    const d = 8 + rnd() * 12;
    const f = w.grid.nearestFree(z.start.x + Math.cos(a) * d, z.start.y + Math.sin(a) * d, 1);
    if (f && !w.grid.isBlockedAt(f.x, f.y) && findPath(w.grid, z.start.x, z.start.y, f.x, f.y, 60000)) {
      t.push(f);
      n++;
    }
  }
  return t;
}

function trip(z: ZoneDef, mode: 'joy' | 'click', tx: number, ty: number): Trip {
  const { w } = mkWorld(z);
  const p = w.player;
  p.x = p.px = z.start.x;
  p.y = p.py = z.start.y;
  const path = mode === 'joy' ? (rawPath(w.grid, p.x, p.y, tx, ty) ?? []) : (findPath(w.grid, p.x, p.y, tx, ty, 200000) ?? []);
  const len = path.reduce((a, q, i) => a + Math.hypot(q.x - (i ? path[i - 1].x : p.x), q.y - (i ? path[i - 1].y : p.y)), 0);
  const max = Math.ceil(((len || 10) / 5.2) * 25 * 3) + 150;
  let ticks = 0;
  let zero = 0;
  let stuck = 0;
  let lx = p.x;
  let ly = p.y;
  let wi = 0;
  const inp = w.input;
  const steer = (w as unknown as { steer?: (x: number, y: number) => { x: number; y: number } | null }).steer;
  for (; ticks < max; ticks++) {
    if (Math.hypot(tx - p.x, ty - p.y) < 1.6) return { ok: true, ticks, zero };
    let dx: number;
    let dy: number;
    if (mode === 'joy') {
      // pousse vers le point du chemin à ~1,5 unité devant
      for (let j = Math.min(path.length - 1, wi + 8); j > wi; j--)
        if (Math.hypot(path[j].x - p.x, path[j].y - p.y) < 0.45) {
          wi = j;
          break;
        }
      // vise le point le plus loin (moins de 2 unités) du chemin visible en ligne droite (au point), avec un léger bruit de pouce
      let k = wi;
      for (let j = wi + 1; j < path.length && j < wi + 5; j++) {
        if (Math.hypot(path[j].x - p.x, path[j].y - p.y) < 2 && w.grid.walkLine(p.x, p.y, path[j].x, path[j].y)) k = j;
      }
      const q = path[k] ?? { x: tx, y: ty };
      const noise = ((((ticks >> 3) * 2654435761) % 1000) / 1000 - 0.5) * 0.4;
      const a0 = Math.atan2(q.y - p.y, q.x - p.x) + noise;
      dx = Math.cos(a0);
      dy = Math.sin(a0);
    } else if (steer) {
      const d = steer.call(w, tx, ty);
      if (!d) {
        if (process.env.DBG) console.log(`  steer nul ${tx.toFixed(1)},${ty.toFixed(1)} en ${p.x.toFixed(2)},${p.y.toFixed(2)} dist ${Math.hypot(tx - p.x, ty - p.y).toFixed(1)} plans ${w.navPlans}`);
        return { ok: false, ticks, zero };
      }
      dx = d.x;
      dy = d.y;
    } else {
      dx = tx - p.x;
      dy = ty - p.y;
    }
    const d = Math.hypot(dx, dy) || 1;
    inp.moveX = dx / d;
    inp.moveY = dy / d;
    const bx = p.x;
    const by = p.y;
    w.step(1);
    if (Math.hypot(p.x - bx, p.y - by) < 0.01) zero++;
    if (mode === 'click' && ticks % 12 === 11) {
      // comme les commandes : à l'arrêt (moins de 0,12 en 0,5 s) on abandonne
      if (Math.hypot(p.x - lx, p.y - ly) < 0.12) stuck++;
      else stuck = 0;
      lx = p.x;
      ly = p.y;
      if (stuck >= 1) {
        if (process.env.DBG) console.log(`  calé ${tx.toFixed(1)},${ty.toFixed(1)} en ${p.x.toFixed(2)},${p.y.toFixed(2)} dist ${Math.hypot(tx - p.x, ty - p.y).toFixed(1)}`);
        return { ok: false, ticks, zero };
      }
    }
  }
  if (process.env.DBG)
    console.log(
      `  échec ${mode} -> (${tx.toFixed(1)},${ty.toFixed(1)}) bloqué en (${p.x.toFixed(2)},${p.y.toFixed(2)}) wi=${wi}/${path.length} poussée (${inp.moveX.toFixed(2)},${inp.moveY.toFixed(2)})`,
    );
  inp.moveX = inp.moveY = 0;
  return { ok: false, ticks, zero };
}

function trips(id: string, z: ZoneDef): string {
  const { w } = mkWorld(z);
  const ts = targetsOf(z, w);
  const res: Record<string, Trip[]> = { joy: [], click: [], near: [] };
  for (const t of ts) {
    for (const m of ['joy', 'click'] as const) res[m].push(trip(z, m, t.x, t.y));
    // clic « à l'écran » : but à moins de 20 unités à vol d'oiseau du départ
    if (Math.hypot(t.x - z.start.x, t.y - z.start.y) <= 20) res.near.push(res.click[res.click.length - 1]);
  }
  const fmt = (m: string) => {
    const r = res[m];
    const ok = r.filter((x) => x.ok);
    const avg = ok.length ? ok.reduce((a, x) => a + x.ticks, 0) / ok.length / 25 : 0;
    const zero = r.reduce((a, x) => a + x.zero, 0);
    return `${m} ${ok.length}/${r.length} arr., ${avg.toFixed(1)} s, ${zero} ticks nuls`;
  };
  return `${id.padEnd(16)} ${fmt('joy')} | ${fmt('click')} | ${fmt('near').replace('near', 'clic ≤20')}`;
}

function main(): void {
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && !x.startsWith('tmp_'))) {
    const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
    if (j.grid) registerD2Map(parseD2Map(j));
  }
  const both = !flags.has('--edges') && !flags.has('--trips') && !flags.has('--push');
  for (const { id, z } of zones()) {
    const t0 = Date.now();
    if (both || flags.has('--edges')) console.log(`E ${edges(id, z)}  [${Date.now() - t0} ms]`);
    if (both || flags.has('--push')) console.log(`P ${pushes(id, z)}  [${Date.now() - t0} ms]`);
    if (both || flags.has('--trips')) console.log(`T ${trips(id, z)}  [${Date.now() - t0} ms]`);
  }
  clearD2Maps();
}

main();
