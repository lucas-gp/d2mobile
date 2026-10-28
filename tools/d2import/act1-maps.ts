/**
 * Cartes de l'Acte I assemblées comme Levels.txt / LvlPrest.txt les décrivent : labyrinthes (grottes, cryptes, caves de la tour, casernes, prisons, catacombes) faits de
 * pièces dont le nom annonce les sorties (N S E W ; E = +x, S = +y), zones de plein air (plaines, marais) faites de pièces de remplissage 8 × 8 et 16 × 16, et zones à plan fixe.
 * Le tirage est fixé par l'identifiant (même carte à chaque export). `anchors` : points (en cases) de l'arrivée, de la sortie et des entrées vers d'autres zones.
 */
import type { MapSpec } from './map-build';

const rng = (seed: string): (() => number) => {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) ((h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)), (h = (h << 13) | (h >>> 19)));
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
};

/** Pièce spéciale d'un labyrinthe : suffixes de fichier essayés dans l'ordre (le premier présent est utilisé), formes de pièce admises (ouvertures), nombre */
interface Special {
  suffix: string[];
  /** point d'intérêt de la pièce (anchors[…]) ; « next » en fait la pièce de sortie (boss) */
  anchor?: string;
  /** préfixe de fichier à la place de celui du labyrinthe (« tombcube » + lettre) */
  pre?: string;
  /** fichier entier (« magqueen ») : pièce unique, sans lettre */
  name?: string;
  shapes?: RegExp;
  count?: number;
  /** lot 317: no free room of its shape → one is made (Diablo II's maze always holds it: the waypoint rooms) */
  make?: boolean;
}

interface MazeOpts {
  /** acte des fichiers (act1 par défaut) */
  act?: string;
  dir: string;
  prefix: string;
  /** côté d'une pièce, en cases */
  cell: [number, number];
  rooms: number;
  variants?: string[];
  /** pièces d'arrivée (escalier montant) et de sortie (escalier descendant) : elles portent la case de passage de Diablo II */
  ends?: { prev?: Special; next?: Special };
  /** pièces dédiées : point de passage, forge, salles de super-uniques, coffres… */
  specials?: Special[];
  /** part de pièces « thème » (décor particulier du jeu) */
  theme?: number;
}

/** Labyrinthe : arbre aléatoire de `rooms` pièces sur une grille ; arrivée et sortie = deux pièces à escalier, les plus éloignées possible */
export function maze(id: string, o: MazeOpts): MapSpec {
  const r = rng(id);
  const g = Math.max(2, Math.ceil(Math.sqrt(o.rooms * 1.8)));
  const key = (x: number, y: number) => y * g + x;
  const cells = new Map<number, Set<string>>();
  const start: [number, number] = [Math.floor(r() * g), Math.floor(r() * g)];
  cells.set(key(...start), new Set());
  const list: [number, number][] = [start];
  const D: [string, number, number, string][] = [
    ['N', 0, -1, 'S'],
    ['S', 0, 1, 'N'],
    ['E', 1, 0, 'W'],
    ['W', -1, 0, 'E'],
  ];
  while (list.length < o.rooms) {
    const [x, y] = list[Math.floor(r() * list.length)];
    const [l, dx, dy, back] = D[Math.floor(r() * 4)];
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= g || ny >= g) continue;
    if (!cells.has(key(nx, ny))) {
      cells.set(key(nx, ny), new Set());
      list.push([nx, ny]);
      cells.get(key(x, y))!.add(l);
      cells.get(key(nx, ny))!.add(back);
    }
  }
  // quelques boucles : deux pièces voisines non reliées le sont (le labyrinthe de D2 en a)
  for (const [x, y] of list)
    for (const [l, dx, dy, back] of D) {
      const nb = cells.get(key(x + dx, y + dy));
      if (nb && !cells.get(key(x, y))!.has(l) && r() < 0.12) {
        cells.get(key(x, y))!.add(l);
        nb.add(back);
      }
    }
  const letters = (c: [number, number]) => ['N', 'S', 'E', 'W'].filter((l) => cells.get(key(...c))!.has(l)).join('');
  const bfs = (from: [number, number]) => {
    const dist = new Map<number, number>([[key(...from), 0]]);
    const q = [from];
    for (let h = 0; h < q.length; h++) {
      const [x, y] = q[h];
      for (const [l, dx, dy] of D)
        if (cells.get(key(x, y))!.has(l) && !dist.has(key(x + dx, y + dy))) {
          dist.set(key(x + dx, y + dy), dist.get(key(x, y))! + 1);
          q.push([x + dx, y + dy]);
        }
    }
    return dist;
  };
  const fits = (c: [number, number], sp?: Special) => !sp?.shapes || sp.shapes.test(letters(c));
  const pickFar = (from: [number, number], sp: Special | undefined, not: string[]): [number, number] => {
    const d = bfs(from);
    const ok = list.filter((c) => !not.includes(String(key(...c))) && fits(c, sp));
    const pool = ok.length ? ok : list.filter((c) => !not.includes(String(key(...c))));
    return pool.reduce((b, c) => ((d.get(key(...c)) ?? 0) > (d.get(key(...b)) ?? 0) ? c : b), pool[0]);
  };
  // arrivée : pièce admise la plus éloignée d'un point quelconque, puis sortie : la plus éloignée de l'arrivée
  const A = pickFar(start, o.ends?.prev, []);
  const B = pickFar(A, o.ends?.next, [String(key(...A))]);
  const taken = new Map<number, Special | 'end'>([
    [key(...A), 'end'],
    [key(...B), 'end'],
  ]);
  const names = new Map<number, string[]>();
  const extra: Record<string, [number, number]> = {};
  const [cw, ch] = o.cell;
  const v = (o.variants ?? ['']).slice();
  const plain = (c: [number, number]) => {
    const pick = v[Math.floor(r() * v.length)];
    return [`${o.prefix}${letters(c)}${pick}`, `${o.prefix}${letters(c)}`];
  };
  const spec = (c: [number, number], sp: Special) => (sp.name ? [sp.name] : sp.suffix.map((x) => `${sp.pre ?? o.prefix}${letters(c)}${x}`));
  if (o.ends?.prev) names.set(key(...A), [...spec(A, o.ends.prev), ...plain(A)]);
  if (o.ends?.next) names.set(key(...B), [...spec(B, o.ends.next), ...plain(B)]);
  /**
   * Lot 317: no free room of the shape a dedicated room needs (a maze of few dead ends: Jail 1, Halls of the Dead 2, Durance 2…): one is
   * made when the room is flagged `make`, as Diablo II's maze always holds its waypoint room. A dead-end shape: a new room hung on a free
   * room by an empty cell of the grid; a four-way shape (the Arcane Sanctuary's centre): the free room with the most openings among those
   * whose four neighbours lie in the grid and are free, opened on every side (new rooms on the empty cells). Its own generator
   * (`<id>:fit`): the mazes that never needed it are drawn as before.
   */
  const fr = rng(`${id}:fit`);
  const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < g && y < g;
  const addRoom = (x: number, y: number) => {
    cells.set(key(x, y), new Set());
    list.push([x, y]);
  };
  const make = (sp: Special): [number, number] | null => {
    const one = D.filter(([, , , back]) => !sp.shapes || sp.shapes.test(back));
    if (one.length) {
      const cand: [[number, number], (typeof D)[number]][] = [];
      for (const c of list) {
        if (taken.has(key(...c))) continue;
        for (const d of one) if (inGrid(c[0] + d[1], c[1] + d[2]) && !cells.has(key(c[0] + d[1], c[1] + d[2]))) cand.push([c, d]);
      }
      if (!cand.length) return null;
      const [c, [l, dx, dy, back]] = cand[Math.floor(fr() * cand.length)];
      addRoom(c[0] + dx, c[1] + dy);
      cells.get(key(...c))!.add(l);
      cells.get(key(c[0] + dx, c[1] + dy))!.add(back);
      return [c[0] + dx, c[1] + dy];
    }
    const cand = list.filter(([x, y]) => !taken.has(key(x, y)) && D.every(([, dx, dy]) => inGrid(x + dx, y + dy) && !taken.has(key(x + dx, y + dy))));
    if (!cand.length) return null;
    const most = Math.max(...cand.map((c) => cells.get(key(...c))!.size));
    const best = cand.filter((c) => cells.get(key(...c))!.size === most);
    const c = best[Math.floor(fr() * best.length)];
    for (const [l, dx, dy, back] of D) {
      const nb: [number, number] = [c[0] + dx, c[1] + dy];
      if (!cells.has(key(...nb))) addRoom(...nb);
      cells.get(key(...c))!.add(l);
      cells.get(key(...nb))!.add(back);
    }
    return fits(c, sp) ? c : null;
  };
  // salles dédiées : pièces ordinaires libres dont la forme convient, au hasard
  for (const sp of o.specials ?? []) {
    for (let n = 0; n < (sp.count ?? 1); n++) {
      const free = list.filter((c) => !taken.has(key(...c)) && fits(c, sp));
      const made = !free.length && sp.make ? make(sp) : null;
      if (!free.length && !made) break;
      const c = made ?? free[Math.floor(r() * free.length)];
      taken.set(key(...c), sp);
      names.set(key(...c), [...spec(c, sp), ...plain(c)]);
      if (sp.anchor) extra[sp.anchor] = [c[0] * cw + cw / 2, c[1] * ch + ch / 2];
    }
  }
  const parts = list.map((c) => {
    let n = names.get(key(...c));
    if (!n) {
      n = plain(c);
      if (o.theme && r() < o.theme) n = [`${o.prefix}${letters(c)}theme1`, `${o.prefix}${letters(c)}theme`, ...n];
    }
    return { ds1: n.map((x) => `${o.act ?? 'act1'}/${o.dir}/${x}.ds1`).join('|'), cx: c[0] * cw, cy: c[1] * ch };
  });
  const mid = (c: [number, number]): [number, number] => [c[0] * cw + cw / 2, c[1] * ch + ch / 2];
  return { id, size: [g * cw, g * ch], parts, anchors: { prev: mid(A), next: mid(B), ...extra } };
}

interface OutOpts {
  act?: string;
  /** pièces de 8 × 8 (tirées au hasard) et de 16 × 16 */
  small: string[];
  big: string[];
  /** pièces posées à un endroit précis : nom, ancre, colonne, ligne (en pièces de 8 cases) */
  fixed: { ds1: string; anchor?: string; at: [number, number]; size?: number }[];
  cells?: number;
  /** anneau de pièces de bordure (nom sans extension, 8 × 8) posé autour de la zone */
  edge?: string[];
  /** bordure par côté (N S E W et coins NE NW SE SW) : pièces `dossier/nom` ; les côtés N = y minimal, W = x minimal */
  sideEdge?: Record<string, string[]>;
  /**
   * Lot 320: Diablo II's gates in the border (`sideEdge` only): the piece of the level's way into its neighbour (Kurast's `<kind>gaten` /
   * `<kind>gates`) in place of the border piece of side `side` at the interior column `at` (0-based); `cells`: its size in 8-case cells
   * (2: a 17 × 17 piece over the border and the first interior row)
   */
  gates?: { side: 'N' | 'S'; at: number; ds1: string; cells?: number }[];
}

/** Zone de plein air : grille de pièces de 8 cases ; les 16 × 16 occupent quatre cases ; arrivée à l'ouest, sortie à l'est */
export function outdoor(id: string, o: OutOpts): MapSpec {
  const r = rng(id);
  const n = o.cells ?? 10;
  const used = new Set<string>();
  const parts: { ds1: string; cx: number; cy: number }[] = [];
  const anchors: Record<string, [number, number]> = {};
  const act = o.act ?? 'act1';
  // lot 320: the interior cells under a gate of two cells are its own (marked before the fill)
  for (const g of o.gates ?? []) for (let a = 0; a < (g.cells ?? 1); a++) for (let b = 0; b < (g.cells ?? 1) - 1; b++) used.add(`${g.at + a},${g.side === 'N' ? b : n - 1 - b}`);
  const put = (ds1: string, c: number, rr: number, size: number) => {
    for (let a = 0; a < size / 8; a++) for (let b = 0; b < size / 8; b++) used.add(`${c + a},${rr + b}`);
    parts.push({ ds1: ds1.includes('/') ? `${act}/${ds1}.ds1` : `${act}/outdoors/${ds1}.ds1`, cx: c * 8, cy: rr * 8 });
  };
  for (const f of o.fixed) {
    const sz = f.size ?? 8;
    if (f.ds1) put(f.ds1, f.at[0], f.at[1], sz);
    else used.add(`${f.at[0]},${f.at[1]}`);
    if (f.anchor) anchors[f.anchor] = [f.at[0] * 8 + sz / 2, f.at[1] * 8 + sz / 2];
  }
  for (let rr = 0; rr < n; rr++)
    for (let c = 0; c < n; c++) {
      if (used.has(`${c},${rr}`)) continue;
      const bigOk = c + 1 < n && rr + 1 < n && !used.has(`${c + 1},${rr}`) && !used.has(`${c},${rr + 1}`) && !used.has(`${c + 1},${rr + 1}`);
      if (bigOk && o.big.length && r() < 0.28) put(o.big[Math.floor(r() * o.big.length)], c, rr, 16);
      else put(o.small[Math.floor(r() * o.small.length)], c, rr, 8);
    }
  anchors.prev ??= [4, Math.floor(n / 2) * 8 + 4];
  anchors.next ??= [n * 8 - 4, Math.floor(n / 2) * 8 + 4];
  if (o.sideEdge) {
    for (const p of parts) {
      p.cx += 8;
      p.cy += 8;
    }
    for (const k of Object.keys(anchors)) anchors[k] = [anchors[k][0] + 8, anchors[k][1] + 8];
    const pick = (side: string) => {
      const l = o.sideEdge![side] ?? o.sideEdge!.N;
      return l[Math.floor(r() * l.length)];
    };
    // lot 320: the border cells a gate stands on (its piece drawn there instead)
    const gate = new Map<string, { ds1: string; cx: number; cy: number } | null>();
    for (const g of o.gates ?? []) {
      const k = g.cells ?? 1;
      const row = g.side === 'N' ? 0 : n + 1;
      for (let a = 0; a < k; a++) gate.set(`${g.at + 1 + a},${row}`, null);
      gate.set(`${g.at + 1},${row}`, { ds1: `${act}/${g.ds1}.ds1`, cx: (g.at + 1) * 8, cy: g.side === 'N' ? 0 : (n + 2 - k) * 8 });
      // its place on the edge (`gateN`, `gateS`): the seam joins the level to its neighbour there (src/data/zones/seams.ts)
      anchors[`gate${g.side}`] = [(g.at + 1) * 8 + (k * 8 + 1) / 2, g.side === 'N' ? 1 : (n + 2) * 8 - 1];
    }
    for (let i = 0; i < n + 2; i++)
      for (const [c, rr] of [
        [i, 0],
        [i, n + 1],
        [0, i],
        [n + 1, i],
      ]) {
        const side = `${rr === 0 ? 'N' : rr === n + 1 ? 'S' : ''}${c === 0 ? 'W' : c === n + 1 ? 'E' : ''}`;
        const piece = pick(side);
        const g = gate.get(`${c},${rr}`);
        if (g) parts.push(g);
        if (g !== undefined) continue;
        parts.push({ ds1: `${act}/${piece}.ds1`, cx: c * 8, cy: rr * 8 });
      }
    return { id, size: [(n + 2) * 8, (n + 2) * 8], parts, anchors, fill: true };
  }
  if (o.edge?.length) {
    // anneau de bordure : une pièce de chaque côté, tirée au hasard (les cases de bordure bloquent le passage, les pièces centrales sont décalées d'une case)
    for (const p of parts) {
      p.cx += 8;
      p.cy += 8;
    }
    for (const k of Object.keys(anchors)) anchors[k] = [anchors[k][0] + 8, anchors[k][1] + 8];
    for (let i = 0; i < n + 2; i++)
      for (const [c, rr] of [
        [i, 0],
        [i, n + 1],
        [0, i],
        [n + 1, i],
      ])
        parts.push({ ds1: `${act}/outdoors/${o.edge[Math.floor(r() * o.edge.length)]}.ds1`, cx: c * 8, cy: rr * 8 });
    return { id, size: [(n + 2) * 8, (n + 2) * 8], parts, anchors, fill: true };
  }
  anchors.prev ??= [4, Math.floor(n / 2) * 8 + 4];
  anchors.next ??= [n * 8 - 4, Math.floor(n / 2) * 8 + 4];
  return { id, size: [n * 8, n * 8], parts, anchors, fill: true };
}

const EDGE1 = Array.from({ length: 12 }, (_, i) => `bord${i + 1}`);
const SMALL_FIELD = ['wild5', '6rock', 'xrock', '4rock', 'clover', 'circle', 'arrow', 'trees2', 'trees3'];
const BIG_FIELD = ['wild1', 'wild2', 'wild3', 'wild4', 'trees2', 'trees3'];

export const ACT1_SPECS: MapSpec[] = [
  { id: 'a1_town', ds1: 'act1/town/townn1.ds1', town: true },
  // plaines et marais
  outdoor('a1_bloodmoor', {
    edge: EDGE1,
    small: ['fallcmp', 'fallcmp2', 'fallcmp5', 'pond1', 'trees2', 'trees3', '6rock', 'xrock', 'clover'],
    big: ['trees2', 'trees3', 'wild1', 'wild3'],
    fixed: [
      { ds1: 'caves/denent', anchor: 'den', at: [5, 2] },
      // lot 317: Diablo II's Blood Moor has no waypoint (Levels.txt): a plain piece of the field where its waypoint room stood (same draw)
      { ds1: 'clover', at: [1, 6] },
    ],
  }),
  outdoor('a1_coldplains', {
    edge: EDGE1,
    small: SMALL_FIELD,
    big: BIG_FIELD,
    fixed: [
      { ds1: 'caves/cavedr1', anchor: 'cave', at: [8, 3] },
      { ds1: 'waypoint', anchor: 'waypoint', at: [1, 4] },
      { ds1: 'cott1', at: [4, 7] },
      { ds1: '', anchor: 'burial', at: [2, 8] },
    ],
  }),
  outdoor('a1_stonyfield', {
    edge: EDGE1,
    small: ['6rock', 'xrock', '4rock', 'circle', 'clover', 'wild5', 'cairn2'],
    big: ['ruin2', 'wild1', 'wild3'],
    fixed: [
      { ds1: 'cairn2', anchor: 'cairn', at: [5, 5] },
      { ds1: 'waypoint', anchor: 'waypoint', at: [1, 3] },
      { ds1: 'caves/cavedr2', anchor: 'cave', at: [8, 8] },
    ],
  }),
  outdoor('a1_darkwood', {
    edge: EDGE1,
    small: ['trees2', 'trees3', 'swamp3', 'swamp4', '6rock', 'xrock', 'fallcmp6'],
    big: ['trees2', 'trees3', 'swamp5'],
    fixed: [
      { ds1: 'funktree', anchor: 'inifuss', at: [5, 4] },
      { ds1: 'waypoint', anchor: 'waypoint', at: [1, 6] },
      { ds1: 'caves/cavedr1', anchor: 'cave', at: [8, 1] },
    ],
  }),
  outdoor('a1_blackmarsh', {
    edge: EDGE1,
    small: ['swamp3', 'swamp4', 'pond1', 'trees3', 'xrock', '6rock', 'fallcmp7'],
    big: ['swamp5', 'ruin2', 'trees2'],
    fixed: [
      { ds1: 'tower1', anchor: 'tower', at: [8, 7] },
      { ds1: 'waypoint', anchor: 'waypoint', at: [1, 2] },
      { ds1: 'caves/cavedr2', anchor: 'hole', at: [4, 8] },
    ],
  }),
  outdoor('a1_tamoe', {
    edge: EDGE1,
    small: ['cott1', 'cott2', 'cott3a', 'corral1', 'corral2', 'wild5', 'trees2', '4rock', 'clover'],
    big: ['wild3', 'wild1', 'trees3'],
    fixed: [
      { ds1: 'caves/cavedr1', anchor: 'pit', at: [3, 3] },
      // lot 317: no waypoint in Diablo II's Tamoe Highland: a plain piece where its waypoint room stood
      { ds1: 'clover', at: [1, 6] },
    ],
  }),
  // grottes (24 × 24 par pièce) et zones souterraines
  { id: 'a1_den', size: [24, 24], parts: [{ ds1: 'act1/caves/cavewspec.ds1|act1/caves/cavew.ds1', cx: 0, cy: 0 }], anchors: { prev: [12, 12], next: [12, 12] } },
  maze('a1_cave1', {
    dir: 'caves',
    prefix: 'cave',
    cell: [24, 24],
    rooms: 4,
    variants: ['', '2'],
    theme: 0.3,
    ends: { prev: { suffix: ['pre1', 'pre2'], shapes: /^.$/ }, next: { suffix: ['next1', 'next2'], shapes: /^.$/ } },
    specials: [{ suffix: ['crow'], shapes: /^.$/ }],
  }),
  // lot 320: Diablo II's Underground Passage joins the Stony Field (its entry, `prev`) to the Dark Wood (its far end, a way up as the entry:
  // `next`); its level 2 is a dead end down from it (`down`)
  maze('a1_underpass1', {
    dir: 'caves',
    prefix: 'cave',
    cell: [24, 24],
    rooms: 6,
    variants: ['', '2'],
    theme: 0.3,
    ends: { prev: { suffix: ['pre1', 'pre2'], shapes: /^.$/ }, next: { suffix: ['pre2', 'pre1'], shapes: /^.$/ } },
    specials: [{ suffix: ['next1', 'next2'], shapes: /^.$/, anchor: 'down', make: true }],
  }),
  maze('a1_hole1', {
    dir: 'caves',
    prefix: 'cave',
    cell: [24, 24],
    rooms: 4,
    variants: ['', '2'],
    theme: 0.3,
    ends: { prev: { suffix: ['pre1', 'pre2'], shapes: /^.$/ }, next: { suffix: ['next1', 'next2'], shapes: /^.$/ } },
  }),
  maze('a1_pit1', {
    dir: 'caves',
    prefix: 'cave',
    cell: [24, 24],
    rooms: 4,
    variants: ['', '2'],
    theme: 0.3,
    ends: { prev: { suffix: ['pre1', 'pre2'], shapes: /^.$/ }, next: { suffix: ['next1', 'next2'], shapes: /^.$/ } },
  }),
  { id: 'a1_cave2', ds1: 'act1/caves/caveroom2.ds1' },
  { id: 'a1_underpass2', ds1: 'act1/caves/caveroom3.ds1' },
  { id: 'a1_hole2', ds1: 'act1/caves/caveroom4.ds1' },
  { id: 'a1_pit2', ds1: 'act1/caves/caveroom5.ds1' },
  // cimetière, cryptes, tour
  { id: 'a1_burial', ds1: 'act1/graveyard/gravey.ds1' },
  maze('a1_crypt', {
    dir: 'crypt',
    prefix: 'crypt',
    cell: [8, 8],
    rooms: 18,
    variants: ['', '2'],
    theme: 0.25,
    ends: { prev: { suffix: ['warpprev'], shapes: /^.$/ }, next: { suffix: ['warpnext'], shapes: /^.$/ } },
    specials: [
      { suffix: ['bonebreak'], shapes: /^.$/ },
      { suffix: ['consol'], shapes: /^.$/, count: 2 },
    ],
  }),
  maze('a1_mausoleum', {
    dir: 'crypt',
    prefix: 'crypt',
    cell: [8, 8],
    rooms: 18,
    variants: ['', '2'],
    theme: 0.25,
    ends: { prev: { suffix: ['warpprev'], shapes: /^.$/ }, next: { suffix: ['warpnext'], shapes: /^.$/ } },
    specials: [
      { suffix: ['portal'], shapes: /^.$/ },
      { suffix: ['consol'], shapes: /^.$/, count: 2 },
    ],
  }),
  { id: 'a1_tower', ds1: 'act1/outdoors/tower2.ds1' },
  maze('a1_cellar1', {
    dir: 'crypt',
    prefix: 'crypt',
    cell: [8, 8],
    rooms: 10,
    variants: ['', '2'],
    theme: 0.25,
    ends: { prev: { suffix: ['warpprev'], shapes: /^.$/ }, next: { suffix: ['warpnext'], shapes: /^.$/ } },
    specials: [{ suffix: ['consol'], shapes: /^.$/ }],
  }),
  maze('a1_cellar2', {
    dir: 'crypt',
    prefix: 'crypt',
    cell: [8, 8],
    rooms: 10,
    variants: ['', '2'],
    theme: 0.25,
    ends: { prev: { suffix: ['warpprev'], shapes: /^.$/ }, next: { suffix: ['warpnext'], shapes: /^.$/ } },
    specials: [{ suffix: ['consol'], shapes: /^.$/ }],
  }),
  maze('a1_cellar3', {
    dir: 'crypt',
    prefix: 'crypt',
    cell: [8, 8],
    rooms: 10,
    variants: ['', '2'],
    theme: 0.25,
    ends: { prev: { suffix: ['warpprev'], shapes: /^.$/ }, next: { suffix: ['warpnext'], shapes: /^.$/ } },
    specials: [{ suffix: ['consol'], shapes: /^.$/ }],
  }),
  maze('a1_cellar4', {
    dir: 'crypt',
    prefix: 'crypt',
    cell: [8, 8],
    rooms: 10,
    variants: ['', '2'],
    theme: 0.25,
    ends: { prev: { suffix: ['warpprev'], shapes: /^.$/ }, next: { suffix: ['warpnext'], shapes: /^.$/ } },
    specials: [{ suffix: ['consol'], shapes: /^.$/ }],
  }),
  // monastère
  { id: 'a1_monastery', ds1: 'act1/monastry/facade1.ds1' },
  { id: 'a1_cloister', ds1: 'act1/court/courtw.ds1' },
  maze('a1_barracks', {
    dir: 'barracks',
    prefix: 'bar',
    cell: [10, 14],
    rooms: 10,
    variants: ['', '2', '3'],
    theme: 0.25,
    ends: { prev: { suffix: ['warp'], shapes: /^.$/ }, next: { suffix: ['warp'], shapes: /^.$/ } },
    specials: [{ suffix: ['forge'], shapes: /^.$/ }],
  }),
  maze('a1_jail1', {
    dir: 'barracks',
    prefix: 'jail',
    cell: [12, 12],
    rooms: 12,
    variants: ['', '2', '3'],
    ends: { prev: { suffix: ['warpprev'], shapes: /^.$/ }, next: { suffix: ['warpnext'], shapes: /^.$/ } },
    specials: [
      { suffix: ['way'], shapes: /^.$/, make: true },
      { suffix: ['pitspawn'], shapes: /^.$/ },
    ],
  }),
  maze('a1_jail2', {
    dir: 'barracks',
    prefix: 'jail',
    cell: [12, 12],
    rooms: 14,
    variants: ['', '2', '3'],
    ends: { prev: { suffix: ['warpprev'], shapes: /^.$/ }, next: { suffix: ['warpnext'], shapes: /^.$/ } },
    specials: [],
  }),
  maze('a1_jail3', {
    dir: 'barracks',
    prefix: 'jail',
    cell: [12, 12],
    rooms: 16,
    variants: ['', '2', '3'],
    ends: { prev: { suffix: ['warpprev'], shapes: /^.$/ }, next: { suffix: ['warpcath'], shapes: /^.$/ } },
    specials: [],
  }),
  { id: 'a1_inner', ds1: 'act1/court/cat_court.ds1' },
  { id: 'a1_cathedral', ds1: 'act1/cathedrl/cathy3.ds1' },
  maze('a1_cata1', {
    dir: 'catacomb',
    prefix: 'cat',
    cell: [12, 12],
    rooms: 12,
    variants: ['', '2', '3'],
    theme: 0.25,
    ends: { prev: { suffix: ['up', 'up2', 'up3', 'up4'], shapes: /^(EW|NS)$/ }, next: { suffix: ['down', 'down2'], shapes: /^.$/ } },
    specials: [],
  }),
  maze('a1_cata2', {
    dir: 'catacomb',
    prefix: 'cat',
    cell: [12, 12],
    rooms: 14,
    variants: ['', '2', '3'],
    theme: 0.25,
    ends: { prev: { suffix: ['up', 'up2', 'up3', 'up4'], shapes: /^(EW|NS)$/ }, next: { suffix: ['down', 'down2'], shapes: /^.$/ } },
    specials: [{ suffix: ['way'], shapes: /^.$/ }],
  }),
  maze('a1_cata3', {
    dir: 'catacomb',
    prefix: 'cat',
    cell: [12, 12],
    rooms: 16,
    variants: ['', '2', '3'],
    theme: 0.25,
    ends: { prev: { suffix: ['up', 'up2', 'up3', 'up4'], shapes: /^(EW|NS)$/ }, next: { suffix: ['down', 'down2'], shapes: /^.$/ } },
    specials: [],
  }),
];
