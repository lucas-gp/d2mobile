/**
 * Banc de mesure du déplacement (headless) : npx tsx tools/bench/movement-bench.ts [N=200] [cartes séparées par des virgules] [modes]
 * Sur des cartes D2 réelles, lance N trajets (A -> B atteignable, 5 à 25 unités) pour le joueur (joystick vers la cible, clic-pour-aller),
 * le mercenaire (suivi du maître) et un monstre (poursuite), et mesure :
 *  - arrêt : immobile (moins de 0,12 unité en 0,5 s) alors que la cible est encore loin ;
 *  - lent : temps de trajet > 1,5 x le chemin optimal sur la grille ; échec : pas arrivé dans le temps imparti ;
 *  - mur : pas dont le POINT se trouve dans une sous-tuile bloquée (étanchéité).
 * « bloqué » = arrêt OU lent OU échec. Nécessite les cartes locales ($D2_PRIVATE_DIR/out/game/maps).
 */
import '../mods/auto';
import fs from 'node:fs';
import { registerD2Map, parseD2Map } from '../../src/data/d2map';
import { RUN_BY_ID } from '../../src/data/runs';
import { buildHarrogath } from '../../src/data/zones/harrogath';
import { buildA1 } from '../../src/data/zones/act1';
import { buildA2 } from '../../src/data/zones/act2';
import { buildA3 } from '../../src/data/zones/act3';
import { buildA4 } from '../../src/data/zones/act4';
import type { ZoneDef } from '../../src/data/zone-types';
import { Game } from '../../src/sim/game';
import { CELL } from '../../src/sim/grid';
import { mercOf, spawnMerc } from '../../src/sim/merc';
import { spawnMonster } from '../../src/sim/spawn';
import { Navigator } from '../../src/sim/nav';
import { World } from '../../src/sim/world';
import { addXp, xpToReach } from '../../src/sim/progression';
import { TICK_HZ } from '../../src/sim/constants';

const DIR = `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps`;
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && !x.startsWith('tmp_'))) {
  const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
  if (j.grid) registerD2Map(parseD2Map(j));
}

const ZONES: Record<string, () => ZoneDef> = {
  a1_town: () => buildA1('a1_town', 1, 0),
  a2_town: () => buildA2('a2_town', 1, 0),
  a3_town: () => buildA3('a3_town', 1, 0),
  a4_fortress: () => buildA4('a4_fortress', 1, 0),
  harrogath: () => buildHarrogath(),
  tristram: () => RUN_BY_ID.tristram.build(1, 0),
  a4_chaos: () => RUN_BY_ID.a4_chaos.build(1, 0),
  a3_travincal: () => buildA3('a3_travincal', 1, 0),
  a2_arcane: () => buildA2('a2_arcane', 1, 0),
  a1_cathedral: () => buildA1('a1_cathedral', 1, 0),
};

const N = Number(process.argv[2] ?? 200);
const MAPS = (process.argv[3] ?? Object.keys(ZONES).join(',')).split(',');
const MODES = (process.argv[4] ?? 'joy,path,merc,mon').split(',');

let seed = 12345;
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

function makeWorld(zone: ZoneDef, merc: boolean): World {
  const g = new Game(undefined, 'sorceress');
  addXp(g.character, xpToReach(40));
  g.character.gold = 1e7;
  g.enterTown();
  if (merc) g.hireMerc('desert', 'blessed_aim');
  g.mode = zone.town ? 'town' : 'run';
  g.world = new World({ zone, seed: 7, difficulty: 0, zoneLevel: 30, character: g.character });
  const w = g.world;
  w.autoCfg = g.settings;
  w.monsters.length = 0;
  w.pendingSpawns = [];
  w.objects.length = 0;
  (w as unknown as { __g: Game }).__g = g;
  if (merc) spawnMerc(w);
  const p = w.player;
  p.hp = p.hpMax = 1e9;
  return w;
}

interface Trial {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  opt: number;
  straight: number;
}

/** Dijkstra sur les sous-tuiles depuis A (pas du joueur) : distances en unités */
function trials(w: World, n: number): Trial[] {
  const g = w.grid;
  const { cols, rows } = g;
  const z = w.zone;
  const sx = Math.floor(z.start.x / CELL);
  const sy = Math.floor(z.start.y / CELL);
  // composante de départ (la plus grande région marchable)
  const comp = new Int32Array(cols * rows).fill(-1);
  const free = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < cols && r < rows && !g.isBlockedCell(c, r) && !g.circleBlocked((c + 0.5) * CELL, (r + 0.5) * CELL, 0.15);
  let best: number[] = [];
  let ncomp = 0;
  const seeds: [number, number][] = [[sx, sy]];
  for (let k = 0; k < 40; k++) seeds.push([Math.floor(rnd() * cols), Math.floor(rnd() * rows)]);
  for (const [c0, r0] of seeds) {
    if (!free(c0, r0) || comp[r0 * cols + c0] >= 0) continue;
    const id = ncomp++;
    const q = [r0 * cols + c0];
    comp[q[0]] = id;
    for (let h = 0; h < q.length; h++) {
      const c = q[h] % cols;
      const r = (q[h] - c) / cols;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          if ((!ox && !oy) || !free(c + ox, r + oy) || !g.playerStep(c, r, ox, oy)) continue;
          const nn = (r + oy) * cols + c + ox;
          if (comp[nn] >= 0) continue;
          comp[nn] = id;
          q.push(nn);
        }
    }
    if (q.length > best.length) best = q;
  }
  const out: Trial[] = [];
  const dist = new Float32Array(cols * rows);
  let guard = 0;
  while (out.length < n && guard++ < n * 40 && best.length > 50) {
    const a = best[Math.floor(rnd() * best.length)];
    // Dijkstra borné (31 unités)
    dist.fill(1e9);
    dist[a] = 0;
    const open: number[] = [a];
    const reach: number[] = [];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (dist[cur] > 25) continue;
      reach.push(cur);
      const c = cur % cols;
      const r = (cur - c) / cols;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          if ((!ox && !oy) || !free(c + ox, r + oy) || !g.playerStep(c, r, ox, oy)) continue;
          const nn = (r + oy) * cols + c + ox;
          const nd = dist[cur] + (ox && oy ? Math.SQRT2 : 1) * CELL;
          if (nd < dist[nn]) {
            if (dist[nn] > 1e8) open.push(nn);
            dist[nn] = nd;
          }
        }
    }
    const cand = reach.filter((i) => dist[i] >= 5);
    if (!cand.length) continue;
    const b = cand[Math.floor(rnd() * cand.length)];
    const ac = a % cols;
    const ar = (a - ac) / cols;
    const bc = b % cols;
    const br = (b - bc) / cols;
    const t: Trial = { ax: (ac + 0.5) * CELL, ay: (ar + 0.5) * CELL, bx: (bc + 0.5) * CELL, by: (br + 0.5) * CELL, opt: dist[b], straight: 0 };
    t.straight = Math.hypot(t.bx - t.ax, t.by - t.ay);
    out.push(t);
  }
  return out;
}

function ascii(w: World, x: number, y: number, bx: number, by: number): void {
  const g = w.grid;
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  for (let r = cy - 8; r <= cy + 8; r++) {
    let line = '';
    for (let c = cx - 14; c <= cx + 14; c++) {
      if (c === cx && r === cy) line += '@';
      else if (c === Math.floor(bx / CELL) && r === Math.floor(by / CELL)) line += 'B';
      else line += g.isBlockedCell(c, r) ? '#' : '.';
    }
    console.log('    ' + line);
  }
}

interface Res {
  n: number;
  stop: number;
  slow: number;
  fail: number;
  wall: number;
  blocked: number;
  ratio: number;
}
const empty = (): Res => ({ n: 0, stop: 0, slow: 0, fail: 0, wall: 0, blocked: 0, ratio: 0 });

/** Exécute un trajet générique : `act` déplace/dirige ; `pos` donne la position suivie ; arrivée quand dist<=tol */
function runTrial(w: World, t: Trial, mode: string, speedRef: number, res: Res): void {
  const p = w.player;
  const g = w.grid;
  let ent: { x: number; y: number } = p;
  let tol = 0.5;
  let tx = t.bx;
  let ty = t.by;
  const stopTol = 0.12;
  if (mode === 'path') tol = 1.65;
  p.x = p.px = t.ax;
  p.y = p.py = t.ay;
  p.goal = null;
  w.input.moveX = w.input.moveY = 0;
  const nav = new Navigator(w.grid);
  nav.margin = 0.1;
  if (mode === 'merc') {
    const m = mercOf(w)!;
    m.x = m.px = t.ax;
    m.y = m.py = t.ay;
    m.mode = 'idle';
    p.x = p.px = t.bx;
    p.y = p.py = t.by;
    ent = m;
    tol = 3.0;
    tx = t.bx;
    ty = t.by;
  } else if (mode === 'mon') {
    const m = spawnMonster(w, 'fallen', t.ax, t.ay, { rank: 'normal', noLoot: true }, 'bench');
    if (!m) return;
    m.x = m.px = t.ax;
    m.y = m.py = t.ay;
    m.dmgMin = m.dmgMax = 0;
    m.aggro = true;
    m.hp = m.hpMax = 1e9;
    p.x = p.px = t.bx;
    p.y = p.py = t.by;
    ent = m;
    tol = 2.4;
  }
  const speed = mode === 'merc' || mode === 'mon' ? (ent as unknown as { speed: number }).speed : speedRef;
  const opt = Math.max(1, t.opt - tol) / speed; // secondes
  const limit = Math.ceil((opt * 4 + 6) * TICK_HZ);
  const win = Math.round(TICK_HZ * 0.5);
  const hist: number[] = [];
  let ticks = 0;
  let arrived = false;
  let stop = false;
  let wall = false;
  for (; ticks < limit; ticks++) {
    const dx = tx - ent.x;
    const dy = ty - ent.y;
    const d = Math.hypot(dx, dy);
    if (d <= tol) {
      arrived = true;
      break;
    }
    if (mode === 'joy') {
      // joystick « à la main » : on vise le prochain coin du chemin A* avec une marge de 0,1 seulement, moins que le rayon de terrain 0,15 (pire cas : le long des arêtes)
      const sd = nav.steer(p.x, p.y, tx, ty, w.tick);
      w.input.moveX = sd ? sd.x : dx / d;
      w.input.moveY = sd ? sd.y : dy / d;
    } else if (mode === 'path') {
      if (!p.goal) p.goal = { x: tx, y: ty, kind: 'move', ref: 0 };
    }
    if (process.env.TRACE && Math.abs(t.ax - Number(process.env.TRACE)) < 0.01)
      console.log(`   t${ticks} (${ent.x.toFixed(2)},${ent.y.toFixed(2)}) in=(${w.input.moveX.toFixed(2)},${w.input.moveY.toFixed(2)})`);
    w.step(1);
    if (mode === 'merc' || mode === 'mon') {
      p.x = p.px = t.bx;
      p.y = p.py = t.by;
    }
    if (g.isBlockedAt(ent.x, ent.y)) wall = true;
    hist.push(ent.x, ent.y);
    if (hist.length > win * 2) {
      const k = hist.length - win * 2;
      const mv = Math.hypot(ent.x - hist[k], ent.y - hist[k + 1]);
      if (mv < stopTol && d > tol + 0.8 && !(mode === 'path' && !p.goal)) {
        if (!stop && process.env.DBG)
          console.log(
            `  [${mode}] stop A(${t.ax},${t.ay}) B(${t.bx},${t.by}) at (${ent.x.toFixed(2)},${ent.y.toFixed(2)}) d=${d.toFixed(1)} opt=${t.opt.toFixed(1)} tick=${ticks}${mode === 'mon' ? ' mode=' + (ent as unknown as { mode: string }).mode : ''}`,
          );
        if (!stop && process.env.DBG === '2') ascii(w, ent.x, ent.y, t.bx, t.by);
        stop = true;
      }
    }
  }
  w.input.moveX = w.input.moveY = 0;
  p.goal = null;
  if (mode === 'mon') for (const m of w.monsters) m.dead = true;
  if (mode === 'mon') w.monsters.length = 0;
  const secs = ticks / TICK_HZ;
  const slow = arrived && secs > 1.5 * opt + 0.3;
  res.n++;
  if (stop) res.stop++;
  if (slow) res.slow++;
  if (!arrived) res.fail++;
  if (wall) res.wall++;
  if (stop || slow || !arrived) res.blocked++;
  if (arrived) res.ratio += secs / opt;
}

const rows: string[] = [];
const totals: Record<string, Res> = {};
for (const id of MAPS) {
  const mk = ZONES[id];
  if (!mk) continue;
  const zone = mk();
  const out: string[] = [];
  for (const mode of MODES) {
    const w = makeWorld(zone, mode === 'merc');
    const ts = trials(w, N);
    // joystick : seulement les cibles qui exigent de contourner un coin
    const sel = mode === 'joy' ? ts.filter((t) => !w.grid.walkLine(t.ax, t.ay, t.bx, t.by, 0.15)) : ts;
    const res = empty();
    const sp = w.playerSpeed();
    for (const t of sel) runTrial(w, t, mode, sp, res);
    const tt = (totals[mode] ??= empty());
    for (const k of Object.keys(res) as (keyof Res)[]) tt[k] += res[k];
    out.push(
      `${mode}: n=${res.n} bloqué=${((100 * res.blocked) / Math.max(1, res.n)).toFixed(1)}% (arrêt ${res.stop} lent ${res.slow} échec ${res.fail}) murs=${res.wall} ratio=${(res.ratio / Math.max(1, res.n - res.fail)).toFixed(2)}`,
    );
  }
  rows.push(`${id.padEnd(13)} ${out.join(' | ')}`);
  console.log(rows[rows.length - 1]);
}
for (const [m, r] of Object.entries(totals))
  console.log(`TOTAL ${m}: n=${r.n} bloqué=${((100 * r.blocked) / Math.max(1, r.n)).toFixed(1)}% (arrêt ${r.stop} lent ${r.slow} échec ${r.fail}) murs=${r.wall}`);
