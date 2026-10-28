/**
 * Cartes de villes de Diablo II importées (tools/d2import/export-map.ts) : collision et positions d'objets, lues par la simulation.
 * Enregistrées au lancement par l'application quand les fichiers importés sont présents ; sans elles, les zones d'origine servent.
 * La simulation reste déterministe : elle ne lit ce registre qu'au moment de construire la zone.
 */
export interface D2MapData {
  id: string;
  /** taille en cases D2 (une case = 5 × 5 sous-tuiles = 2,5 unités) */
  cases: [number, number];
  units: [number, number];
  grid: { cols: number; rows: number; blocked: Uint8Array; opaque: Uint8Array };
  /** [type (1 = monstre/PNJ, 2 = objet), identifiant, x, y] en cases */
  objects: number[][];
  /** cases où se trouvent les tuiles de fichiers repères (waypt, blacksmith, shrine, maingate) */
  landmarks: Record<string, [number, number][]>;
  /** contenu complet du JSON (chemins des images, placements des structures) pour le rendu */
  raw: unknown;
}

const maps = new Map<string, D2MapData>();

export function registerD2Map(m: D2MapData): void {
  maps.set(m.id, m);
}

export function d2Map(id: string): D2MapData | undefined {
  return maps.get(id);
}

export function clearD2Maps(): void {
  maps.clear();
}

const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Villes : leur collision est nettoyée des cases isolées sans dessin (voir dropStrayBlocks) */
export const TOWN_MAPS = ['a1_town', 'a2_town', 'a3_town', 'a4_fortress', 'harrogath'];

/**
 * « Murs invisibles » des villes : un amas de 1 ou 2 sous-tuiles bloquées, isolé au milieu du sol praticable et sans rien de dessiné autour
 * (ni structure autre que l'ombre sur la case D2 et ses voisines, ni décor posé à moins de 2 unités), est un reste de l'import (drapeau de
 * tuile ou sol noir sur un trou entre deux planches, bord d'une mosaïque…) : il arrête le personnage sans raison visible. On le libère.
 * Un amas isolé n'a que des voisines libres : le libérer n'ouvre aucun passage vers une zone fermée. Renvoie le nombre de sous-tuiles libérées.
 */
export function dropStrayBlocks(grid: { cols: number; rows: number; blocked: Uint8Array }, raw: unknown, maxCells = 2): number {
  const j = raw as { places?: number[][]; decor?: [string, number, number][] } | undefined;
  if (!j?.places) return 0;
  const { cols, rows, blocked } = grid;
  const drawn = new Set<number>();
  for (const p of j.places) if (p[6] !== 13) drawn.add(p[4] * 4096 + p[3]);
  const seen = new Uint8Array(cols * rows);
  let freed = 0;
  for (let s = 0; s < blocked.length; s++) {
    if (!blocked[s] || seen[s]) continue;
    const cells: number[] = [];
    const st = [s];
    seen[s] = 1;
    while (st.length) {
      const i = st.pop()!;
      cells.push(i);
      const x = i % cols;
      const y = (i - x) / cols;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const k = ny * cols + nx;
          if (blocked[k] && !seen[k]) {
            seen[k] = 1;
            st.push(k);
          }
        }
    }
    if (cells.length > maxCells) continue;
    const xs = cells.map((i) => i % cols);
    const ys = cells.map((i) => Math.floor(i / cols));
    const wx = (xs.reduce((a, b) => a + b, 0) / cells.length + 0.5) / 2;
    const wy = (ys.reduce((a, b) => a + b, 0) / cells.length + 0.5) / 2;
    if (j.decor?.some((d) => Math.abs(d[1] - wx) <= 2 && Math.abs(d[2] - wy) <= 2)) continue;
    const tx = Math.floor(xs[0] / 5);
    const ty = Math.floor(ys[0] / 5);
    let near = false;
    for (let oy = -1; oy <= 1 && !near; oy++)
      for (let ox = -1; ox <= 1; ox++)
        if (drawn.has((ty + oy) * 4096 + tx + ox)) {
          near = true;
          break;
        }
    if (near) continue;
    for (const i of cells) blocked[i] = 0;
    freed += cells.length;
  }
  return freed;
}

/**
 * « Dents de scie » : une sous-tuile bloquée isolée (ses quatre voisines orthogonales sont libres) qui touche en diagonale une autre sous-tuile
 * bloquée forme avec elle un damier de 1 sous-tuile (marche d'escalier ou de pont dessinée en diagonale) : le personnage s'y accroche.
 * On la libère, avec des garde-fous : jamais au milieu d'une chaîne en diagonale d'au moins 3 sous-tuiles (mur fin en diagonale), jamais si les voisines
 * libres appartiennent à des zones de marche différentes (on ne relie jamais deux zones séparées), jamais au bord de la carte.
 * Renvoie le nombre de sous-tuiles libérées.
 */
export function smoothStairs(grid: { cols: number; rows: number; blocked: Uint8Array }): number {
  const { cols, rows, blocked } = grid;
  const cand: number[] = [];
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x;
      if (!blocked[i] || blocked[i - 1] || blocked[i + 1] || blocked[i - cols] || blocked[i + cols]) continue;
      const d1 = blocked[i - cols - 1];
      const d2 = blocked[i + cols + 1];
      const d3 = blocked[i - cols + 1];
      const d4 = blocked[i + cols - 1];
      if (!(d1 || d2 || d3 || d4)) continue;
      if ((d1 && d2) || (d3 && d4)) continue;
      // la paire ne doit pas se prolonger : chaîne en diagonale de 3 sous-tuiles ou plus = mur fin, on n'y touche pas
      if ((d1 && x > 1 && y > 1 && blocked[i - 2 * cols - 2]) || (d2 && x < cols - 2 && y < rows - 2 && blocked[i + 2 * cols + 2])) continue;
      if ((d3 && x < cols - 2 && y > 1 && blocked[i - 2 * cols + 2]) || (d4 && x > 1 && y < rows - 2 && blocked[i + 2 * cols - 2])) continue;
      cand.push(i);
    }
  }
  if (!cand.length) return 0;
  // zones de marche (8-connexes sans couper les coins) avant tout changement
  const label = new Int32Array(cols * rows);
  let n = 0;
  const st: number[] = [];
  for (let s = 0; s < label.length; s++) {
    if (blocked[s] || label[s]) continue;
    label[s] = ++n;
    st.push(s);
    while (st.length) {
      const i = st.pop()!;
      const cx = i % cols;
      const cy = (i - cx) / cols;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox;
          const ny = cy + oy;
          if ((!ox && !oy) || nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const k = ny * cols + nx;
          if (blocked[k] || label[k]) continue;
          if (ox && oy && (blocked[cy * cols + nx] || blocked[ny * cols + cx])) continue;
          label[k] = n;
          st.push(k);
        }
      }
    }
  }
  let freed = 0;
  for (const i of cand) {
    // état courant : une dent déjà libérée juste à côté n'est plus une voisine bloquée
    if (!(blocked[i - cols - 1] || blocked[i + cols + 1] || blocked[i - cols + 1] || blocked[i + cols - 1])) continue;
    let lab = 0;
    let ok = true;
    for (const k of [i - 1, i + 1, i - cols, i + cols, i - cols - 1, i - cols + 1, i + cols - 1, i + cols + 1]) {
      if (blocked[k] || !label[k]) continue;
      if (!lab) lab = label[k];
      else if (label[k] !== lab) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    blocked[i] = 0;
    freed++;
  }
  return freed;
}

/** Décode le JSON exporté */
export function parseD2Map(json: {
  id: string;
  cases: [number, number];
  units: [number, number];
  grid: { cols: number; rows: number; blocked: string; opaque: string };
  objects: number[][];
  landmarks?: Record<string, [number, number][]>;
}): D2MapData {
  const grid = { cols: json.grid.cols, rows: json.grid.rows, blocked: unb64(json.grid.blocked), opaque: unb64(json.grid.opaque) };
  if (TOWN_MAPS.includes(json.id)) dropStrayBlocks(grid, json);
  smoothStairs(grid);
  return {
    id: json.id,
    cases: json.cases,
    units: json.units,
    grid,
    objects: json.objects,
    landmarks: json.landmarks ?? {},
    raw: json,
  };
}

/** Sous-tuile libre la plus proche d'un point (unités du monde) ; le point lui-même s'il est libre */
export function nearestOpen(m: D2MapData, x: number, y: number): { x: number; y: number } {
  const { cols, rows, blocked } = m.grid;
  const cx = Math.floor(x / 0.5);
  const cy = Math.floor(y / 0.5);
  for (let r = 0; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const px = cx + dx;
        const py = cy + dy;
        if (px < 1 || py < 1 || px >= cols - 1 || py >= rows - 1) continue;
        // marche libre sur la sous-tuile et ses quatre voisines : de la place pour un personnage
        if (!blocked[py * cols + px] && !blocked[py * cols + px + 1] && !blocked[py * cols + px - 1] && !blocked[(py + 1) * cols + px] && !blocked[(py - 1) * cols + px])
          return { x: (px + 0.5) * 0.5, y: (py + 0.5) * 0.5 };
      }
    }
  }
  return { x, y };
}
