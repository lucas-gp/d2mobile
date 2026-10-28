/**
 * Audit des collisions du joueur sur toutes les zones à carte D2 : cases accessibles et composantes connexes avec l'ancien disque (0,38) et le rayon de
 * terrain actuel (0,15), comparés à la connexité « point » de D2 (une case libre est un point, 8-connexe sans couper les coins).
 * Signale les passages ouverts (composantes qui fusionnent) et, à l'inverse, les zones fermées que le point D2 sépare mais que le disque relie
 * (fusion « par erreur » : ne doit pas arriver, le rayon étant plus petit que une demi-case).
 * Usage : npx tsx tools/audit/collisions.ts [id ...]   (cartes privées : $D2_PRIVATE_DIR/out/game/maps)
 */
import '../mods/auto';
import fs from 'node:fs';
import { clearD2Maps, parseD2Map, registerD2Map } from '../../src/data/d2map';
import { RUNS } from '../../src/data/runs';
import { PLAYER_RADIUS, TERRAIN_RADIUS } from '../../src/sim/constants';
import { CELL, type WalkGrid } from '../../src/sim/grid';
import { buildGrid } from '../../src/sim/world';
import { buildHarrogath } from '../../src/data/zones/harrogath';
import type { ZoneDef } from '../../src/data/zone-types';

const DIR = process.env.D2_MAPS ?? `${process.env.D2_PRIVATE_DIR ?? `${process.env.HOME}/d2-private`}/out/game/maps`;

export interface Stat {
  cells: number;
  comps: number;
  main: number;
  fromStart: number;
}

/** Cases libres selon le rayon (0 : point D2), composantes 8-connexes sans couper les coins ; nombre de cases accessibles depuis le départ */
export function measure(g: WalkGrid, r: number, start: { x: number; y: number }, gaps = false): { stat: Stat; label: Int32Array } {
  const { cols, rows } = g;
  const free = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < cols && cy < rows && (r > 0 ? !g.circleBlocked((cx + 0.5) * CELL, (cy + 0.5) * CELL, r) : !g.blocked[cy * cols + cx]);
  const label = new Int32Array(cols * rows);
  const sizes: number[] = [0];
  let cells = 0;
  const st: number[] = [];
  for (let s = 0; s < cols * rows; s++) {
    const sx = s % cols;
    const sy = (s - sx) / cols;
    if (label[s] || !free(sx, sy)) continue;
    const id = sizes.length;
    sizes.push(0);
    label[s] = id;
    st.push(s);
    while (st.length) {
      const i = st.pop()!;
      sizes[id]++;
      cells++;
      const cx = i % cols;
      const cy = (i - cx) / cols;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = cx + ox;
          const ny = cy + oy;
          if (!free(nx, ny) || label[ny * cols + nx]) continue;
          if (ox && oy && (!free(cx + ox, cy) || !free(cx, cy + oy)) && !(gaps && r === 0 && g.cornerGap(cx, cy, ox, oy))) continue;
          label[ny * cols + nx] = id;
          st.push(ny * cols + nx);
        }
    }
  }
  // composante du départ : case libre la plus proche
  let from = 0;
  const scx = Math.floor(start.x / CELL);
  const scy = Math.floor(start.y / CELL);
  for (let rr = 0; rr < 12 && !from; rr++)
    for (let oy = -rr; oy <= rr && !from; oy++)
      for (let ox = -rr; ox <= rr; ox++) {
        const l = scx + ox >= 0 && scy + oy >= 0 && scx + ox < cols && scy + oy < rows ? label[(scy + oy) * cols + scx + ox] : 0;
        if (l) {
          from = l;
          break;
        }
      }
  return { stat: { cells, comps: sizes.length - 1, main: Math.max(0, ...sizes), fromStart: from ? sizes[from] : 0 }, label };
}

function zonesToAudit(only: string[]): { id: string; z: ZoneDef }[] {
  const out: { id: string; z: ZoneDef }[] = [];
  const seen = new Set<string>();
  const add = (id: string, z: ZoneDef | null) => {
    if (!z || !z.d2Map || seen.has(id) || (only.length && !only.includes(id))) return;
    seen.add(id);
    out.push({ id, z });
  };
  add('harrogath', buildHarrogath(1));
  for (const run of RUNS) {
    try {
      const z = run.build(1, 0);
      add(run.id, z);
    } catch (e) {
      console.error(`(ignoré ${run.id} : ${(e as Error).message})`);
    }
  }
  return out;
}

function loadMaps(raw: boolean): void {
  clearD2Maps();
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && !x.startsWith('tmp_'))) {
    const j = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
    if (!j.grid) continue;
    const m = parseD2Map(j);
    // version brute : sans lissage des dents de scie (comparaison de connexité avant / après)
    if (raw) m.grid.blocked = Uint8Array.from(atob(j.grid.blocked), (c) => c.charCodeAt(0));
    registerD2Map(m);
  }
}

function main(): void {
  if (!fs.existsSync(DIR)) {
    console.error(`cartes absentes : ${DIR}`);
    return;
  }
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const merges = process.argv.includes('--merges');
  const rows: string[] = [];
  let opened = 0;
  let bad = 0;
  let sigMerge = 0;
  let smallMerge = 0;
  const mrows: string[] = [];
  const grids0 = new Map<string, WalkGrid>();
  if (merges) {
    loadMaps(true);
    for (const { id, z } of zonesToAudit(only)) {
      const g = buildGrid(z);
      for (const b of z.blockers) if (b.gate && b.rect) g.unblockRect(...b.rect);
      grids0.set(id, g);
    }
  }
  loadMaps(false);
  for (const { id, z } of zonesToAudit(only)) {
    const g = buildGrid(z);
    for (const b of z.blockers) if (b.gate && b.rect) g.unblockRect(...b.rect);
    const old = measure(g, PLAYER_RADIUS, z.start);
    const neu = measure(g, TERRAIN_RADIUS, z.start);
    const pt = measure(g, 0, z.start);
    // fusion par erreur : deux cases dans des composantes « point » différentes mais dans la même composante au disque neuf
    const pairs = new Map<number, Set<number>>();
    for (let i = 0; i < neu.label.length; i++)
      if (neu.label[i] && pt.label[i]) {
        const s = pairs.get(neu.label[i]) ?? pairs.set(neu.label[i], new Set()).get(neu.label[i])!;
        s.add(pt.label[i]);
      }
    const wrong = [...pairs.values()].filter((s) => s.size > 1).length;
    if (wrong) bad++;
    if (neu.stat.fromStart > old.stat.fromStart * 1.005) opened++;
    rows.push(
      `${id.padEnd(22)} ancien ${String(old.stat.cells).padStart(6)} cases / ${String(old.stat.comps).padStart(4)} comp. / depuis départ ${String(old.stat.fromStart).padStart(6)} | nouveau ${String(neu.stat.cells).padStart(6)} / ${String(neu.stat.comps).padStart(4)} / ${String(neu.stat.fromStart).padStart(6)} | point D2 ${String(pt.stat.cells).padStart(6)} / ${String(pt.stat.comps).padStart(4)} / ${String(pt.stat.fromStart).padStart(6)}${wrong ? `  FUSION PAR ERREUR x${wrong}` : ''}`,
    );
    const g0 = grids0.get(id);
    if (g0) {
      // composantes « point » D2 brutes (carte non lissée, pas de passage de coin) contre composantes assouplies (lissage + passage de coin)
      const before = measure(g0, 0, z.start);
      const after = measure(g, 0, z.start, true);
      const sizeB = new Map<number, number>();
      for (const l of before.label) if (l) sizeB.set(l, (sizeB.get(l) ?? 0) + 1);
      const groups = new Map<number, Set<number>>();
      for (let i = 0; i < after.label.length; i++)
        if (after.label[i] && before.label[i]) {
          const s = groups.get(after.label[i]) ?? groups.set(after.label[i], new Set()).get(after.label[i])!;
          s.add(before.label[i]);
        }
      let sig = 0;
      let small = 0;
      for (const s of groups.values()) {
        if (s.size < 2) continue;
        const big = [...s].filter((l) => sizeB.get(l)! >= 50).length;
        if (big >= 2) sig++;
        else small++;
      }
      sigMerge += sig;
      smallMerge += small;
      mrows.push(
        `${id.padEnd(22)} comp. avant ${String(before.stat.comps).padStart(4)} après ${String(after.stat.comps).padStart(4)} | cases atteignables depuis départ ${String(before.stat.fromStart).padStart(6)} -> ${String(after.stat.fromStart).padStart(6)} | fusions de 2 zones >= 50 cases : ${sig}, avec de petits îlots : ${small}`,
      );
    }
  }
  console.log(rows.join('\n'));
  console.log(`\n${rows.length} zones ; zones où le départ atteint plus de 0,5 % de cases en plus : ${opened} ; zones avec fusion par erreur : ${bad}`);
  if (merges) {
    console.log('\nConnexité avant / après assouplissement (lissage des dents de scie + passage de coin) :\n' + mrows.join('\n'));
    console.log(`\nfusions significatives (deux zones d'au moins 50 cases reliées) : ${sigMerge} ; fusions avec de petits îlots : ${smallMerge}`);
  }
  clearD2Maps();
}

main();
