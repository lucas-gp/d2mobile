/**
 * Runs de farm (Comtesse, Andariel, Méphisto) sur la vraie salle de Diablo II : la carte DS1 remplace le labyrinthe généré. Le départ est le point
 * marchable le plus au nord de la carte, le boss le point atteignable le plus éloigné (distance de marche) ; les groupes du labyrinthe d'origine sont
 * répartis sur le chemin, à des distances croissantes du départ, sans se marcher dessus. Déterministe : tout vient de la graine et de la carte.
 */
import { Rng } from '../../core/rng';
import { d2Map, nearestOpen, type D2MapData } from '../d2map';
import type { SpawnDef, ZoneDef } from '../zone-types';
import { edgeDecor, scatterDecor, scatterDecorSteps } from './d2decor';
import { keepPassable, keepPassableSteps } from './d2passable';
import { placeWorldObjectsSteps } from './d2objects';
import { d2Anchors } from './d2anchors';
import { LEVEL_PLANS, MAX_ZONE_MONSTERS, type LevelPlan } from '../levels';
import { runSteps, type Steps } from './steps';

const SUB = 0.5;

interface Reach {
  dist: Int32Array;
  max: number;
}

function bfs(m: D2MapData, from: number): Reach {
  return runSteps(bfsSteps(m, from));
}

/** `bfs` in steps of 32,768 sub-tiles (lot 312) */
function* bfsSteps(m: D2MapData, from: number): Steps<Reach> {
  const { cols, rows, blocked } = m.grid;
  const dist = new Int32Array(cols * rows).fill(-1);
  const queue = new Int32Array(cols * rows);
  let head = 0;
  let tail = 0;
  dist[from] = 0;
  queue[tail++] = from;
  let max = 0;
  while (head < tail) {
    if ((head & 0x7fff) === 0x7fff) yield;
    const i = queue[head++];
    const x = i % cols;
    const y = (i - x) / cols;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 1 || ny < 1 || nx >= cols - 1 || ny >= rows - 1) continue;
      const j = ny * cols + nx;
      if (blocked[j] || dist[j] >= 0) continue;
      // de la place pour un personnage : les quatre voisines aussi libres
      if (blocked[j + 1] || blocked[j - 1] || blocked[j + cols] || blocked[j - cols]) continue;
      dist[j] = dist[i] + 1;
      if (dist[j] > max) max = dist[j];
      queue[tail++] = j;
    }
  }
  return { dist, max };
}

/** Groupes d'une zone d'après son plan (Levels.txt) : nombre selon la densité et la surface atteignable, uniques selon MonUMin/Max, familles pondérées de la difficulté */
function levelGroups(plan: LevelPlan, difficulty: number, reachableCells: number, rng: Rng): SpawnDef[] {
  const d = Math.max(0, Math.min(2, difficulty));
  // zone sans monstres dans Levels.txt (Tour oubliée) : aucun groupe
  if (plan.den <= 0) return [];
  // une sous-case atteignable = 0,5 × 0,5 unité = une sous-case D2 ; MonDen = monstres pour 100 000 sous-cases
  const monsters = Math.min(MAX_ZONE_MONSTERS, (reachableCells * plan.den) / 100000);
  const n = Math.max(6, Math.round(monsters / 4.6));
  const [uMin, uMax] = plan.unique[d];
  // les uniques s'ajoutent aux groupes ordinaires dans D2 : ici ils en prennent la place, plafonnés à la moitié pour qu'une petite zone (Fleuve de flammes, Chaussée de Kurast…) garde des monstres ordinaires
  const uniques = Math.min(Math.ceil(n / 2), rng.range(uMin, uMax));
  const mix = plan.mons[d].length
    ? plan.mons[d]
    : ([
        ['fallen', 2],
        ['zombie', 1],
        ['skeleton', 1],
      ] as [string, number][]);
  const out: SpawnDef[] = [];
  for (let k = 0; k < n; k++) {
    const rank: SpawnDef['rank'] = k < uniques ? 'unique' : rng.chance(0.12) ? 'champion' : 'normal';
    const monster = rng.weighted(mix, (m) => m[1])![0];
    const count = rank === 'unique' ? 4 : rank === 'champion' ? 3 : rng.range(4, 6);
    out.push({ monster, x: 0, y: 0, count, r: 2.6, rank, trigger: 12 });
  }
  return out;
}

/** Grille d'une carte D2 et aides de case partagées par les étapes de `withD2Farm` */
interface FarmGrid {
  m: D2MapData;
  cols: number;
  rows: number;
  blocked: Uint8Array;
  /** Case où un personnage tient : elle et ses quatre voisines libres */
  open: (i: number) => boolean;
  /** 0 si la case est à 20 cases au moins du bord de la carte, 1 000 sinon (pénalité de tri) */
  margin: (i: number) => number;
  /** Centre de la case en unités de monde */
  pos: (i: number) => { x: number; y: number };
  reached: (r: Reach) => number;
}

/** Départ, chemin et emplacement du boss sur la carte */
interface FarmLayout {
  s0: number;
  far: number;
  reach: Reach;
  openCount: number;
}

/** Point de spawn d'un monstre de la zone, en unités de monde */
type Pt = { x: number; y: number };

/** Le départ ne se pose pas devant le vide du bord : 20 cases (10 unités) au moins */
const EDGE_MARGIN_CELLS = 20;
/** Part des cases ouvertes que la zone atteignable depuis le départ doit couvrir (sinon c'est un enclos) */
const START_COVERAGE = 0.6;
/** Départs essayés au plus pour trouver la grande zone atteignable */
const START_TRIES = 60;
/** Distances minimales (unités) d'un groupe au départ et au boss */
const MIN_FROM_START = 14;
const MIN_FROM_BOSS = 8;

/**
 * Remplace le décor et la disposition d'une zone de farm par la carte D2 `id` (ou `mapId` : zone sans carte propre qui reprend celle d'une autre,
 * comme les fosses rouges de l'Acte V sur la carte du Fleuve de flammes) ; renvoie la zone d'origine si la carte n'est pas chargée
 */
export function withD2Farm(z: ZoneDef, seed: number, difficulty = 0, mapId?: string, entry?: { x: number; y: number }): ZoneDef {
  return runSteps(withD2FarmSteps(z, seed, difficulty, mapId, entry));
}

/** `withD2Farm` in steps (lot 312: built behind the play, src/data/zones/steps.ts) */
export function* withD2FarmSteps(z: ZoneDef, seed: number, difficulty = 0, mapId?: string, entry?: { x: number; y: number }): Steps<ZoneDef> {
  const m = d2Map(mapId ?? z.id);
  if (!m) return z;
  const fg = farmGrid(m);
  const { cols, rows } = fg;
  const rng = new Rng(`d2farm:${z.id}:${seed}`);
  const { s0, far, reach } = yield* farmLayout(fg, entry);
  yield;
  const start = fg.pos(s0);
  const boss = fg.pos(far);
  const out: ZoneDef = { ...z, width: m.units[0], height: m.units[1], patches: [], walls: [], props: [], blockers: [], lights: [], exits: [], objects: [], spawns: [], start };
  out.d2Map = { id: m.id, cols, rows, blocked: m.grid.blocked, opaque: m.grid.opaque };
  out.farAt = { x: boss.x, y: boss.y };
  // longueur du chemin entre l'entrée et le boss : les anneaux de groupes s'étagent dessus
  const span = Math.max(8, reach.dist[far]);
  // groupes : anneaux de distance de marche croissante entre 25 % et 85 % du chemin, à 8 unités au moins les uns des autres
  const groups = z.spawns.filter((s) => s.rank !== 'boss' && !s.runBoss && Math.hypot(s.x - z.start.x, s.y - z.start.y) > 0);
  // (le gardien du tombeau est un unique de trigger 9 et chef de run : ce n'est pas une escorte, sinon il apparaît deux fois)
  const escorts = z.spawns.filter((s) => s.trigger === 9 && s.rank !== 'boss' && !s.runBoss);
  let rest = groups.filter((g) => !escorts.includes(g));
  const placed: Pt[] = [];
  // peuplement d'après Levels.txt (monstres de la zone d'origine, densité MonDen, nombre d'uniques) quand la zone a son plan
  const plan = LEVEL_PLANS[z.id];
  if (plan)
    rest = levelGroups(
      plan,
      difficulty,
      reach.dist.reduce((n, d) => n + (d >= 0 ? 1 : 0), 0),
      rng,
    );
  yield;
  const cells: number[] = [];
  for (let i = 0; i < reach.dist.length; i++) if (reach.dist[i] > span * 0.06 && reach.dist[i] < span * 0.97) cells.push(i);
  const place = { out, fg, rng, reach, cells, span, placed, start, boss };
  yield;
  if (plan) yield* placeFromPresets(place, plan, difficulty, rest);
  else placeAlongPath(place, rest);
  placeBoss(place, z, escorts);
  yield;
  // objets interactifs : ceux du DS1 à leur place, puis les groupes d'objets de Levels.txt (coffres, urnes, cadavres, sanctuaires, puits)
  const reachable: number[] = [];
  for (let i = 0; i < reach.dist.length; i++) if (reach.dist[i] >= 0) reachable.push(i);
  yield* placeWorldObjectsSteps(out, m, z.id, seed, reachable, fg.pos, start);
  yield;
  const glow = z.lights[0];
  if (glow) out.lights.push({ ...glow, x: boss.x, y: boss.y });
  out.ambient = { color: z.ambient.color, level: Math.min(0.5, z.ambient.level + 0.2) };
  if (z.id === 'ancients') ancientsSeals(out, m, start);
  yield* scatterDecorSteps(out, m, `${z.id}:${seed}`);
  yield;
  edgeDecor(out, m, `${z.id}:${seed}`);
  yield;
  yield* keepPassableSteps(out, m);
  return out;
}

function farmGrid(m: D2MapData): FarmGrid {
  const { cols, rows, blocked } = m.grid;
  return {
    m,
    cols,
    rows,
    blocked,
    open: (i) => i > cols && i < blocked.length - cols && !blocked[i] && !blocked[i + 1] && !blocked[i - 1] && !blocked[i + cols] && !blocked[i - cols],
    margin: (i) => (Math.min(i % cols, Math.floor(i / cols), cols - 1 - (i % cols), rows - 1 - Math.floor(i / cols)) >= EDGE_MARGIN_CELLS ? 0 : 1000),
    pos: (i) => ({ x: ((i % cols) + 0.5) * SUB, y: (Math.floor(i / cols) + 0.5) * SUB }),
    reached: (r) => r.dist.reduce((n, d) => n + (d >= 0 ? 1 : 0), 0),
  };
}

/**
 * Départ : la case libre au plus petit x + y (loin du bord) dont la zone atteignable couvre l'essentiel de la carte (pas un enclos fermé) ;
 * l'entrée et la place du boss du DS1 (tuiles spéciales, emplacements de monstres) l'emportent quand la carte les donne. Boss : sinon la case
 * atteignable la plus éloignée en distance de marche.
 */
function* farmLayout(fg: FarmGrid, entry?: { x: number; y: number }): Steps<FarmLayout> {
  const { m, cols, blocked, open, margin, pos, reached } = fg;
  let openCount = 0;
  const found: number[] = [];
  for (let i = 0; i < blocked.length; i++)
    if (open(i)) {
      openCount++;
      found.push(i);
    }
  yield;
  // by x + y + the edge's margin, the map's order kept between equal keys (lot 312: the stable sort by that key, counted: the same order
  // as `sort` with that comparator, a tenth of the time)
  const keys = new Int32Array(found.length);
  let maxKey = 0;
  for (let k = 0; k < found.length; k++) {
    const i = found[k];
    const key = (i % cols) + Math.floor(i / cols) + margin(i);
    keys[k] = key;
    if (key > maxKey) maxKey = key;
  }
  yield;
  const counts = new Int32Array(maxKey + 2);
  for (let k = 0; k < keys.length; k++) counts[keys[k] + 1]++;
  for (let k = 1; k < counts.length; k++) counts[k] += counts[k - 1];
  const cands: number[] = new Array(found.length);
  for (let k = 0; k < found.length; k++) cands[counts[keys[k]]++] = found[k];
  yield;
  let s0 = cands[0] ?? 0;
  let reach = yield* bfsSteps(m, s0);
  for (let k = 0; k < Math.min(cands.length, START_TRIES); k++) {
    yield;
    const i = cands[k * Math.max(1, Math.floor(cands.length / 400))] ?? cands[k];
    const r = yield* bfsSteps(m, i);
    if (reached(r) >= openCount * START_COVERAGE) {
      s0 = i;
      reach = r;
      break;
    }
    if (reached(r) > reached(reach)) {
      s0 = i;
      reach = r;
    }
  }
  yield;
  const anchors = d2Anchors(m);
  // case la plus proche (anneaux croissants) où un personnage tient : les quatre voisines libres, comme pour la marche
  const cellOf = (x: number, y: number) => {
    const cx = Math.floor(x / SUB);
    const cy = Math.floor(y / SUB);
    for (let r = 0; r < 40; r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const i = (cy + oy) * cols + cx + ox;
          if (i > 0 && i < blocked.length && open(i)) return i;
        }
      }
    }
    return s0;
  };
  let far = s0;
  if (anchors.boss && !entry) {
    // composante du boss : l'entrée y est cherchée (la case atteignable la plus proche de l'entrée du DS1), sinon on garde le départ trouvé plus haut s'il en fait partie
    const bossCell = cellOf(anchors.boss.x, anchors.boss.y);
    const fromBoss = yield* bfsSteps(m, bossCell);
    if (reached(fromBoss) >= openCount * 0.15) {
      const target = anchors.entry ?? pos(s0);
      let best = -1;
      let bd = 1e9;
      for (let i = 0; i < fromBoss.dist.length; i++) {
        if (fromBoss.dist[i] < 0) continue;
        const p = pos(i);
        const d = Math.hypot(p.x - target.x, p.y - target.y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (best >= 0) {
        s0 = best;
        reach = yield* bfsSteps(m, s0);
        far = bossCell;
      }
    }
  } else if (entry ?? anchors.entry) {
    // lot 311: a zone entered on foot from its neighbour (src/data/zones/seams.ts) starts where the hero comes in
    const e = (entry ?? anchors.entry)!;
    const i = cellOf(e.x, e.y);
    const r = yield* bfsSteps(m, i);
    if (reached(r) >= openCount * 0.3) {
      s0 = i;
      reach = r;
    }
  }
  if (!anchors.boss || entry || far === s0) {
    far = s0;
    for (let i = 0; i < reach.dist.length; i++) if (reach.dist[i] > reach.dist[far] && margin(i) === 0) far = i;
  }
  return { s0, far, reach, openCount };
}

/** État du placement des groupes de monstres */
interface Placement {
  out: ZoneDef;
  fg: FarmGrid;
  rng: Rng;
  reach: Reach;
  /** Cases candidates : atteignables, entre 6 % et 97 % du chemin */
  cells: number[];
  span: number;
  placed: Pt[];
  start: Pt;
  boss: Pt;
}

/** Espèces des emplacements de monstres du DS1 (monpreset) */
const PRESET_SPECIES: Record<string, string> = {
  place_fallen: 'fallen',
  place_fallenshaman: 'fallen_shaman',
  place_reanimateddead: 'zombie',
  place_impgroup: 'imp',
  place_imp: 'imp',
  place_miniongroup: 'minion',
};

/**
 * Zone avec plan de Levels.txt : camps aux emplacements d'origine du DS1 (regroupés par proximité, espèces de la zone seulement), groupes
 * d'élite aux emplacements d'élite, puis le reste tiré dans tout le terrain atteignable, espacé selon la densité (les uniques plus loin).
 */
function* placeFromPresets(pl: Placement, plan: LevelPlan, difficulty: number, rest: SpawnDef[]): Steps<void> {
  const { out, fg, rng, reach, cells, span, placed, start, boss } = pl;
  const m = fg.m;
  const presets = ((m.raw as { presets?: [string, number, number][] }).presets ?? []).filter(([n]) => n.startsWith('place_'));
  const clusters: { name: string; pts: Pt[] }[] = [];
  let looked = 0;
  for (const [n, x, y] of presets) {
    if (++looked % 300 === 0) yield;
    if (!PRESET_SPECIES[n]) continue;
    const c = clusters.find((q) => q.name === n && q.pts.some((pt) => Math.hypot(pt.x - x, pt.y - y) < 5));
    if (c) c.pts.push({ x, y });
    else clusters.push({ name: n, pts: [{ x, y }] });
  }
  // zones peu fournies en monstres de ces espèces dans Levels.txt : ne garder que celles qui y figurent (un camp de Déchus n'a rien à faire dans les Casernes)
  const allowed = new Set(plan.mons[Math.max(0, Math.min(2, difficulty))].map((e) => e[0]));
  const camps = clusters.filter((c) => allowed.has(PRESET_SPECIES[c.name]) && c.pts.length >= 2);
  let budget = Math.min(camps.length, Math.floor(rest.filter((g) => g.rank === 'normal').length * 0.6));
  for (const c of camps) {
    if (budget <= 0) break;
    const cx = c.pts.reduce((a, q) => a + q.x, 0) / c.pts.length;
    const cy = c.pts.reduce((a, q) => a + q.y, 0) / c.pts.length;
    const p0 = nearestOpen(m, cx, cy);
    if (Math.hypot(p0.x - start.x, p0.y - start.y) < MIN_FROM_START || Math.hypot(p0.x - boss.x, p0.y - boss.y) < MIN_FROM_BOSS) continue;
    if (placed.some((q) => Math.hypot(q.x - p0.x, q.y - p0.y) < 5)) continue;
    const idx = rest.findIndex((g) => g.rank === 'normal');
    if (idx < 0) break;
    rest.splice(idx, 1);
    budget--;
    placed.push(p0);
    out.spawns.push({ monster: PRESET_SPECIES[c.name], x: p0.x, y: p0.y, count: Math.max(4, Math.min(8, c.pts.length)), r: 2.6, rank: 'normal', trigger: 12 });
  }
  // groupes d'élite : à l'emplacement du jeu quand il y en a
  const elite = presets.filter(([n]) => n === 'place_unique_pack' || n === 'place_champion');
  for (const [, x, y] of elite) {
    const idx = rest.findIndex((g) => g.rank === 'unique' || g.rank === 'champion');
    if (idx < 0) break;
    const p0 = nearestOpen(m, x, y);
    if (Math.hypot(p0.x - start.x, p0.y - start.y) < 10) continue;
    const g = rest.splice(idx, 1)[0];
    placed.push(p0);
    out.spawns.push({ ...g, x: p0.x, y: p0.y });
  }
  const areaUnits = reach.dist.reduce((n, d) => n + (d >= 0 ? 0.25 : 0), 0);
  const baseSep = Math.max(4, Math.min(9, 0.9 * Math.sqrt(areaUnits / Math.max(1, rest.length))));
  let groups = 0;
  for (const g of rest) {
    // lot 312: a few groups a step
    if (++groups % 6 === 0) yield;
    let pick = -1;
    for (let t = 0; t < 300 && pick < 0; t++) {
      const i = cells[Math.floor(rng.next() * cells.length)];
      if (g.rank === 'unique' && reach.dist[i] < span * 0.35) continue;
      const p = fg.pos(i);
      if (Math.hypot(p.x - start.x, p.y - start.y) < MIN_FROM_START || Math.hypot(p.x - boss.x, p.y - boss.y) < MIN_FROM_BOSS) continue;
      if (placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < baseSep - t * 0.012)) continue;
      pick = i;
    }
    if (pick < 0) pick = cells[Math.floor(rng.next() * cells.length)];
    const p = fg.pos(pick);
    placed.push(p);
    out.spawns.push({ ...g, x: p.x, y: p.y });
  }
}

/** Zone sans plan : le groupe k à la distance de marche 25 % + 62 % × k / n du chemin (étagement régulier), espacés de 7 unités */
function placeAlongPath(pl: Placement, rest: SpawnDef[]): void {
  const { out, fg, rng, reach, cells, span, placed } = pl;
  rest.forEach((g, k) => {
    const want = span * (0.25 + (0.62 * k) / Math.max(1, rest.length - 1));
    let pick = -1;
    for (let t = 0; t < 400 && pick < 0; t++) {
      const i = cells[Math.floor(rng.next() * cells.length)];
      if (Math.abs(reach.dist[i] - want) > span * 0.12 + t * 0.03 * span) continue;
      const p = fg.pos(i);
      if (placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 7 - t * 0.01)) continue;
      pick = i;
    }
    if (pick < 0) pick = cells[Math.floor(rng.next() * cells.length)];
    const p = fg.pos(pick);
    placed.push(p);
    out.spawns.push({ ...g, x: p.x, y: p.y });
  });
}

/** Boss (et chefs de run) au bout du chemin, escorte sur la case atteignable la plus proche, légèrement décalée */
function placeBoss(pl: Placement, z: ZoneDef, escorts: SpawnDef[]): void {
  const { out, fg, reach, boss } = pl;
  const { cols, blocked } = fg;
  // case atteignable la plus proche du boss décalée de (dx, dy)
  const near = (dx: number, dy: number) => {
    const cx = Math.floor((boss.x + dx) / SUB);
    const cy = Math.floor((boss.y + dy) / SUB);
    for (let r = 0; r < 12; r++)
      for (let oy = -r; oy <= r; oy++)
        for (let ox = -r; ox <= r; ox++) {
          const i = (cy + oy) * cols + cx + ox;
          if (i > 0 && i < blocked.length && reach.dist[i] >= 0) return fg.pos(i);
        }
    return boss;
  };
  for (const s of z.spawns.filter((x) => x.rank === 'boss' || x.runBoss)) out.spawns.push({ ...s, x: boss.x, y: boss.y });
  for (const s of escorts) {
    const p = near(-2, -1.5);
    out.spawns.push({ ...s, x: p.x, y: p.y });
  }
}

/** Les Anciens : aucun autre monstre ; chaque Ancien s'éveille quand son sceau (la statue) est brisé, comme les gardiens du Chaos */
function ancientsSeals(out: ZoneDef, m: D2MapData, start: Pt): void {
  const presets = (m.raw as { presets?: [string, number, number][] }).presets ?? [];
  const statues = ['ancientstatue1', 'ancientstatue2', 'ancientstatue3'].map((n) => presets.find((p) => p[0] === n)).filter((p): p is [string, number, number] => !!p);
  const bosses = out.spawns.filter((x) => x.runBoss);
  if (statues.length === 3 && bosses.length === 3) {
    out.objects = out.objects.filter((o) => o.kind !== 'seal');
    out.spawns = bosses.map((b, i) => {
      // les trois sceaux partagent une référence : les Anciens s'éveillent ensemble quand le troisième est brisé
      const ref = 'ancients';
      const st = nearestOpen(m, statues[i][1], statues[i][2]);
      out.objects.push({ kind: 'seal', x: st.x, y: st.y, id: ref });
      out.lights.push({ x: st.x, y: st.y, radius: 6, color: 0xff4030, intensity: 0.7, z: 1.5 });
      const p = nearestOpen(m, st.x + (start.x - st.x) * 0.2, st.y + (start.y - st.y) * 0.2 - 1.5);
      return { ...b, x: p.x, y: p.y, seal: ref, sealGuard: true, trigger: undefined };
    });
  }
}

/**
 * Sanctuaire du Chaos sur la carte de Diablo II (cœur, quatre bras, entrée) : Diablo au centre du pentagramme, un sceau et son gardien au bout de trois bras
 * (Vizir à l'ouest, De Seis à l'est, Infecteur au nord), gardes dans le bras sud et l'entrée. Positions calculées sur la carte (distance de marche depuis le cœur).
 */
export function withD2Chaos(z: ZoneDef, seed: number, difficulty = 0, mapId = 'chaos'): ZoneDef {
  // lot 320: the Campaign's Chaos Sanctuary on its own map (`a4_chaos`, src/data/zones/act4.ts)
  const m = d2Map(mapId);
  if (!m) return z;
  const { cols, rows, blocked } = m.grid;
  const rng = new Rng(`d2chaos:${seed}`);
  const C = 2.5; // unités par case D2
  const pos = (i: number) => ({ x: ((i % cols) + 0.5) * SUB, y: (Math.floor(i / cols) + 0.5) * SUB });
  const open = (i: number) => !blocked[i] && !blocked[i + 1] && !blocked[i - 1] && !blocked[i + cols] && !blocked[i - cols];
  const cellAt = (cx: number, cy: number): number => {
    const p = nearestOpen(m, cx * C, cy * C);
    return Math.floor(p.y / SUB) * cols + Math.floor(p.x / SUB);
  };
  // repères du DS1 : point d'apparition de Diablo (cœur), cinq sceaux (un seul au nord, une paire à l'est, une paire à l'ouest), entrée au sud
  const marks = (m.raw as { marks?: [string, number, number][] }).marks ?? [];
  const mHeart = marks.find((k) => k[0] === 'start');
  const mSeals = marks.filter((k) => k[0] === 'seal');
  const roomy = (x: number, y: number): number => {
    const cx = Math.floor(x / SUB);
    const cy = Math.floor(y / SUB);
    for (let r = 0; r < 40; r++)
      for (let oy = -r; oy <= r; oy++)
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const i = (cy + oy) * cols + cx + ox;
          if (i > cols && i < blocked.length - cols && open(i)) return i;
        }
    return cellAt(36.5, 36.5);
  };
  const heart = mHeart ? roomy(mHeart[1], mHeart[2]) : cellAt(36.5, 36.5);
  const fromHeart = bfs(m, heart);
  const h = pos(heart);
  // entrée : les tuiles spéciales du bas de la carte (sinon la case atteignable la plus au sud)
  const e10 = (m.landmarks.special10 ?? []).map(([x, y]) => ({ x: (x + 0.5) * C, y: (y + 0.5) * C }));
  let startCell = -1;
  if (e10.length) startCell = roomy(e10.reduce((s, p) => s + p.x, 0) / e10.length, e10.reduce((s, p) => s + p.y, 0) / e10.length);
  if (startCell < 0 || fromHeart.dist[startCell] < 0) {
    for (let i = 0; i < fromHeart.dist.length; i++) if (fromHeart.dist[i] >= 0 && open(i) && (startCell < 0 || i > startCell)) startCell = i;
  }
  const start = pos(startCell);
  // ailes d'après la position des sceaux autour du cœur : nord = De Seis (1 sceau), est = Vizir (2), ouest = Infecteur (2)
  const armOf = (x: number, _y: number): 'seis' | 'vizier' | 'infector' => (x > h.x + 30 ? 'vizier' : x < h.x - 30 ? 'infector' : 'seis');
  const arms: Record<string, { x: number; y: number }[]> = { seis: [], vizier: [], infector: [] };
  if (mSeals.length >= 3) for (const [, x, y] of mSeals) arms[armOf(x, y)].push(pos(roomy(x, y)));
  else {
    const inBox = (i: number, x0: number, y0: number, x1: number, y1: number) => {
      const cx = (i % cols) / 5;
      const cy = Math.floor(i / cols) / 5;
      return cx >= x0 && cx < x1 && cy >= y0 && cy < y1;
    };
    const farthest = (x0: number, y0: number, x1: number, y1: number): number => {
      let best = -1;
      for (let i = 0; i < fromHeart.dist.length; i++) if (fromHeart.dist[i] >= 0 && open(i) && inBox(i, x0, y0, x1, y1) && (best < 0 || fromHeart.dist[i] > fromHeart.dist[best])) best = i;
      return best;
    };
    arms.seis.push(pos(farthest(48, 24, 73, 49)));
    arms.vizier.push(pos(farthest(0, 24, 25, 49)));
    arms.infector.push(pos(farthest(24, 0, 49, 25)));
  }
  const armMid = (a: string) => ({ x: arms[a].reduce((s, p) => s + p.x, 0) / arms[a].length, y: arms[a].reduce((s, p) => s + p.y, 0) / arms[a].length });
  const out: ZoneDef = { ...z, width: m.units[0], height: m.units[1], patches: [], walls: [], props: [], blockers: [], lights: [], exits: [], objects: [], spawns: [], start };
  out.d2Map = { id: m.id, cols, rows, blocked: m.grid.blocked, opaque: m.grid.opaque };
  out.ambient = { color: z.ambient.color, level: Math.min(0.5, z.ambient.level + 0.2) };
  const toward = (from: { x: number; y: number }, to: { x: number; y: number }, d: number) => {
    const l = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: from.x + ((to.x - from.x) / l) * d, y: from.y + ((to.y - from.y) / l) * d };
  };
  const spot = (p: { x: number; y: number }) => pos(roomy(p.x, p.y));
  for (const [ref, list] of Object.entries(arms)) {
    for (const seal of list) {
      out.objects.push({ kind: 'seal', x: seal.x, y: seal.y, id: ref });
      out.lights.push({ x: seal.x, y: seal.y, radius: 6, color: 0xff4030, intensity: 0.7, z: 1.5 });
    }
  }
  out.lights.push({ x: h.x, y: h.y, radius: 14, color: 0xff3020, intensity: 0.8, z: 2 });
  // gardiens : près de leur(s) sceau(x), du côté du cœur
  for (const s of z.spawns.filter((s) => s.seal && s.seal !== 'diablo')) {
    const p = spot(toward(armMid(s.seal as string), h, 6));
    out.spawns.push({ ...s, x: p.x, y: p.y });
  }
  for (const s of z.spawns.filter((s) => s.seal === 'diablo')) out.spawns.push({ ...s, x: h.x, y: h.y });
  // gardes : le sanctuaire est dense. Groupes sur le dallage atteignable, étagés entre l'entrée et le cœur et dans chaque aile, à bonne distance les uns des autres
  const taken: { x: number; y: number }[] = [start, h, ...Object.values(arms).flat()];
  const free: number[] = [];
  for (let i = 0; i < fromHeart.dist.length; i++) if (fromHeart.dist[i] >= 0 && open(i)) free.push(i);
  // gardes d'après Levels.txt (Storm Caster, Oblivion Knight, Venom Lord) : nombre selon la densité de la zone sur le dallage atteignable
  const guards = levelGroups(LEVEL_PLANS.chaos, difficulty, free.length, rng);
  const sep = Math.max(5, Math.min(9, 0.9 * Math.sqrt((free.length * 0.25) / Math.max(1, guards.length))));
  for (const g of guards) {
    for (let t = 0; t < 300; t++) {
      const p = pos(free[Math.floor(rng.next() * free.length)]);
      if (taken.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < (q === start ? 20 : q === h ? 11 : sep) - t * 0.012)) continue;
      taken.push(p);
      out.spawns.push({ ...g, x: p.x, y: p.y });
      break;
    }
  }
  const c1 = spot(toward(h, armMid('vizier'), 8));
  const c2 = spot(toward(h, armMid('infector'), 8));
  out.objects.push({ kind: 'chest', x: c1.x, y: c1.y }, { kind: 'chest', x: c2.x, y: c2.y });
  scatterDecor(out, m, `${z.id}:${seed}`);
  edgeDecor(out, m, `${z.id}:${seed}`);
  keepPassable(out, m);
  return out;
}

/**
 * Trône de Baal sur la carte de Diablo II (`wthrone.ds1`) : départ au nord, les vagues sur l'aire la plus dégagée vers 60 % du chemin, une herse
 * (ouverte par la fin des vagues) à 85 %, Baal au bout. Le chemin est mesuré à pied depuis le départ.
 */
export function withD2Baal(z: ZoneDef, seed: number, difficulty = 0): ZoneDef {
  const m = d2Map('baal');
  if (!m) return z;
  const { cols, rows, blocked } = m.grid;
  const rng = new Rng(`d2baal:${seed}`);
  const open = (i: number) => i > cols && i < blocked.length - cols && !blocked[i] && !blocked[i + 1] && !blocked[i - 1] && !blocked[i + cols] && !blocked[i - cols];
  let s0 = -1;
  let best = Infinity;
  for (let i = 0; i < blocked.length; i++)
    if (open(i) && (i % cols) + Math.floor(i / cols) < best) {
      best = (i % cols) + Math.floor(i / cols);
      s0 = i;
    }
  // entrée au sud et trône au nord d'après le DS1 (tuiles spéciales et emplacement « baalthrone »)
  const anchors = d2Anchors(m);
  const roomy = (x: number, y: number): number => {
    const cx = Math.floor(x / SUB);
    const cy = Math.floor(y / SUB);
    for (let r = 0; r < 40; r++)
      for (let oy = -r; oy <= r; oy++)
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const i = (cy + oy) * cols + cx + ox;
          if (open(i)) return i;
        }
    return s0;
  };
  if (anchors.entry) s0 = roomy(anchors.entry.x, anchors.entry.y);
  const reach = bfs(m, s0);
  let far = s0;
  for (let i = 0; i < reach.dist.length; i++) if (reach.dist[i] > reach.dist[far]) far = i;
  if (anchors.boss) {
    const bc = roomy(anchors.boss.x, anchors.boss.y);
    if (reach.dist[bc] >= 0) far = bc;
  }
  const pos = (i: number) => ({ x: ((i % cols) + 0.5) * SUB, y: (Math.floor(i / cols) + 0.5) * SUB });
  // chemin du boss vers le départ : à chaque pas, un voisin plus proche du départ
  const path: number[] = [far];
  while (reach.dist[path[path.length - 1]] > 0) {
    const i = path[path.length - 1];
    const next = [i + 1, i - 1, i + cols, i - cols].find((j) => reach.dist[j] >= 0 && reach.dist[j] < reach.dist[i]);
    if (next === undefined) break;
    path.push(next);
  }
  const at = (frac: number) => path[Math.max(0, Math.min(path.length - 1, Math.round(path.length * (1 - frac))))];
  // deux étapes (la Chambre de la Pierre-Monde est une autre carte) : les vagues se jouent dans la salle du trône, le portail s'ouvre au trône
  const twoStage = !!d2Map('baal_chamber');
  // aire des vagues : autour du point le plus dégagé entre 45 % et 70 % du chemin (salle du trône : au pied du trône)
  let arena = twoStage ? roomy(pos(far).x, pos(far).y + 12) : at(0.6);
  let room = -1;
  for (let f = 0.45; f <= 0.7 && !twoStage; f += 0.01) {
    const c = at(f);
    let free = 0;
    const cx = c % cols;
    const cy = Math.floor(c / cols);
    for (let dy = -12; dy <= 12; dy += 2) for (let dx = -12; dx <= 12; dx += 2) if (open((cy + dy) * cols + cx + dx)) free++;
    if (free > room) {
      room = free;
      arena = c;
    }
  }
  // herse : le passage le plus étroit entre l'aire des vagues et le trône (jamais au milieu de l'aire des vagues)
  const runAt = (c: number, dx: number, dy: number) => {
    const gx0 = c % cols;
    const gy0 = Math.floor(c / cols);
    let a = 0;
    while (open(gy0 * cols + gx0 + dx * (a + 1) + dy * cols * (a + 1)) && a < 40) a++;
    return a;
  };
  let gateCell = at(0.86);
  let narrow = 1e9;
  for (let f = 0.72; f <= 0.97; f += 0.005) {
    const c = at(f);
    const width = Math.min(runAt(c, 1, 0) + runAt(c, -1, 0), runAt(c, 0, 1) + runAt(c, 0, -1));
    if (width <= narrow) {
      narrow = width;
      gateCell = c;
    }
  }
  // herse : la course libre la plus courte du couloir (horizontale ou verticale) autour de la case
  const run = (dx: number, dy: number) => runAt(gateCell, dx, dy);
  const w = run(1, 0) + run(-1, 0);
  const h = run(0, 1) + run(0, -1);
  const gp = pos(gateCell);
  const rect: [number, number, number, number] =
    w <= h ? [gp.x - (run(-1, 0) + 1) * SUB, gp.y - SUB, gp.x + (run(1, 0) + 1) * SUB, gp.y + SUB] : [gp.x - SUB, gp.y - (run(0, -1) + 1) * SUB, gp.x + SUB, gp.y + (run(0, 1) + 1) * SUB];
  const start = pos(s0);
  const boss = pos(far);
  const a = pos(arena);
  const out: ZoneDef = {
    ...z,
    width: m.units[0],
    height: m.units[1],
    patches: [],
    walls: [],
    props: [],
    // deux étapes : pas de herse, un portail au trône (RunState) mène à la Chambre de la Pierre-Monde, où Baal attend
    blockers: twoStage ? [] : [{ rect, opaque: false, gate: 'pierre_monde' }],
    lights: [],
    exits: [],
    objects: twoStage ? [] : [{ kind: 'gate', x: gp.x, y: gp.y, id: 'pierre_monde' }],
    spawns: [],
    start,
    ...(twoStage ? { chamberAt: { x: boss.x, y: boss.y }, chamberKind: 'red' as const, waveArena: { x: pos(arena).x, y: pos(arena).y, r: 14 } } : {}),
  };
  out.d2Map = { id: m.id, cols, rows, blocked: m.grid.blocked, opaque: m.grid.opaque };
  out.ambient = { color: z.ambient.color, level: Math.min(0.5, z.ambient.level + 0.2) };
  const spot = (p: { x: number; y: number }) => nearestOpen(m, p.x, p.y);
  const guards = z.spawns.filter((s) => !s.wave && !s.runBoss);
  const throneMix = LEVEL_PLANS.baal.mons[Math.max(0, Math.min(2, difficulty))];
  guards.forEach((g, i) => {
    const p = spot(pos(at(0.14 + 0.1 * i)));
    out.spawns.push({ ...g, monster: throneMix[i % throneMix.length][0], x: p.x, y: p.y });
  });
  // salle des vagues : des gardiens l'occupent avant la première vague (elle ne vient qu'après leur mort)
  if (twoStage && guards.length) {
    // gardiens de la salle d'après Levels.txt (Death Lord, Stygian Fury)
    const mix = LEVEL_PLANS.baal.mons[Math.max(0, Math.min(2, difficulty))];
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2 + 0.4;
      const p = spot({ x: a.x + Math.cos(ang) * 6, y: a.y + Math.sin(ang) * 6 });
      out.spawns.push({ monster: mix[k % mix.length][0], x: p.x, y: p.y, count: 5, r: 2.5, rank: 'normal', trigger: 12 });
    }
  }
  for (const s of z.spawns.filter((x) => x.wave)) {
    const p = spot({ x: a.x + rng.float(-4, 4), y: a.y + rng.float(-4, 4) });
    out.spawns.push({ ...s, x: p.x, y: p.y });
  }
  // Baal : à la fin du trône (une seule zone) ou dans sa Chambre de la Pierre-Monde (deux étapes)
  if (!twoStage) for (const s of z.spawns.filter((x) => x.runBoss)) out.spawns.push({ ...s, x: boss.x, y: boss.y });
  if (!twoStage) {
    const c1 = spot({ x: boss.x - 4, y: boss.y + 3 });
    const c2 = spot({ x: boss.x + 4, y: boss.y + 3 });
    out.objects.push({ kind: 'chest', x: c1.x, y: c1.y }, { kind: 'chest', x: c2.x, y: c2.y });
  }
  out.lights.push({ x: boss.x, y: boss.y, radius: 12, color: 0xff3a3a, intensity: 0.9, z: 3 });
  scatterDecor(out, m, `${z.id}:${seed}`);
  edgeDecor(out, m, `${z.id}:${seed}`);
  keepPassable(out, m);
  return out;
}
