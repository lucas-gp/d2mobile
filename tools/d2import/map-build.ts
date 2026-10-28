/**
 * Construction d'une carte DS1 de Diablo II pour le jeu (sol en morceaux de 512 px, atlas des structures, collision, objets), commune au CLI Node
 * (`export-map.ts`, récepteur disque) et au Worker du navigateur (`browser.ts`, récepteur API Cache). Sortie, relative à `game/` :
 *   maps/<id>.json                  taille, grille de collision (sous-tuiles de 0,5 unité), objets, placements des structures
 *   maps/<id>-g<n>[-lo].png         sol : morceaux de 512 × 512 px (sols, ombres et tuiles de sol des couches de murs)
 *   maps/<id>-t[lo-]<n>.png         atlas des tuiles de structure (murs, toits, arbres) posées comme sprites triés en profondeur
 *
 * Le sol n'est JAMAIS peint en entier : une carte de 128 × 128 cases ferait un canevas de 900 Mo. Les passes qui ont besoin des pixels (lave au
 * pixel, « sol noir ») et la découpe en morceaux se font morceau par morceau : une liste ordonnée de commandes de peinture est rejouée dans un
 * tampon de 512 px (+ marge de 16 px pour les fenêtres d'échantillonnage). Le résultat est identique, pixel pour pixel, à la peinture du canevas
 * entier de l'ancien exporteur (vérifié par SHA-1 sur les cartes du CLI).
 *
 * Aucune API Node ici (pas de `fs`, pas de `Buffer`) : le même fichier tourne dans le Worker.
 */
import type { GameData } from './data';
import { decodeDs1, cell, mergeDs1, type Ds1 } from './formats/ds1';
import { loadDs1Tiles, pickTile, type DsTile } from './ds1-render';
import { pack } from './atlas';
import { decorId } from './decor-tokens';
import { putJson, type Sink } from './sink';

const TW = 160;
const TH = 80;
const CHUNK = 512;
/** marge du tampon de peinture : la fenêtre d'échantillonnage de la lave fait ±16 px, le test de sol noir lit 3 px plus haut */
const HALO = 16;
/** décalage vertical (pixels) du centre d'une sous-case par rapport au sommet de sa case dans le raster du sol */
const LAVA_DY = 0;

export interface MapSpec {
  id: string;
  ds1?: string;
  /** carte assemblée de plusieurs DS1 (Sanctuaire du Chaos) : pièce, position en cases ; taille totale en cases */
  parts?: { ds1: string; cx: number; cy: number; over?: boolean }[];
  size?: [number, number];
  /** villes : un sol presque noir (fosse sous un bâtiment dont le toit n'est pas dessiné) est remplacé par le sol voisin */
  town?: boolean;
  /** sol de lave (Sanctuaire du Chaos) : les tuiles de sol orange vif sont infranchissables, seul le dallage noir se parcourt */
  lava?: boolean;
  /** points d'intérêt (en cases) : arrivée, sortie, entrées vers d'autres zones — écrits dans la carte (`anchors`, en unités du jeu) */
  anchors?: Record<string, [number, number]>;
  /** zone de plein air assemblée de pièces : les cases sans sol entourées de sol (lignes de jonction entre pièces) reprennent le sol voisin au lieu de laisser du noir */
  fill?: boolean;
}

/** Tables qui viennent de fichiers hors MPQ de base (voir decor.ts) : absentes dans le navigateur, le décor posé est alors vide */
export interface MapTables {
  /** (acte, identifiant DS1) → jeton de décor (obj.txt), ou null */
  decorOf: ((act: number, id: number) => string | null) | null;
  /** (acte, identifiant DS1) → repère de gameplay (sceau, point d'apparition), ou null */
  markOf: ((act: number, id: number) => 'seal' | 'start' | null) | null;
  /** monpreset.txt : acte → noms des emplacements de monstres */
  monpreset: Map<number, string[]>;
}

export interface MapBuildOptions {
  /** paliers dont on écrit les PNG ; vide = données seules (JSON) : même calcul, sans encodage */
  tiers: readonly ('hi' | 'lo')[];
  tables: MapTables;
  /** chronomètre (ms) : décodage, drapeaux, raster, encodage */
  onPhase?: (phase: string, ms: number) => void;
  /** appelé entre deux morceaux : lève pour annuler */
  checkpoint?: () => void;
  /**
   * Part du travail d'encodage (k sur n) : tout est calculé (le résultat est identique) mais seuls les PNG dont le rang ≡ k (mod n) sont
   * encodés et écrits ; le JSON est écrit par chaque part (mêmes octets). Deux Workers se partagent ainsi les images d'une grande carte.
   */
  slice?: { k: number; n: number };
}

export interface MapBuildResult {
  id: string;
  /** cases (W, H) */
  cases: [number, number];
  chunks: number;
  atlasPages: { hi: number; lo: number };
  structures: number;
  uniqueTiles: number;
  walkable: number;
  files: number;
  bytes: number;
  /** pic de mémoire des tampons (octets) : tampon de peinture + page d'atlas */
  peakBuffer: number;
}

interface Img {
  w: number;
  h: number;
  rgba: Uint8Array;
}

function halve(im: Img): Img {
  const nw = Math.max(1, Math.ceil(im.w / 2));
  const nh = Math.max(1, Math.ceil(im.h / 2));
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let a = 0;
      const c = [0, 0, 0];
      for (let d = 0; d < 4; d++) {
        const sx = x * 2 + (d & 1);
        const sy = y * 2 + (d >> 1);
        if (sx >= im.w || sy >= im.h) continue;
        const s = (sy * im.w + sx) * 4;
        const al = im.rgba[s + 3];
        if (!al) continue;
        a += al;
        c[0] += im.rgba[s] * al;
        c[1] += im.rgba[s + 1] * al;
        c[2] += im.rgba[s + 2] * al;
      }
      if (a >= 255) out.set([c[0] / a, c[1] / a, c[2] / a, Math.min(255, a / 2)], (y * nw + x) * 4);
    }
  }
  return { w: nw, h: nh, rgba: out };
}

/** base64 d'octets (même texte que `Buffer.toString('base64')`), par tranches pour ne pas saturer la pile */
function b64(a: Uint8Array): string {
  let s = '';
  for (let i = 0; i < a.length; i += 0x6000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x6000) as unknown as number[]);
  return btoa(s);
}

/** Commande de peinture du sol : tuile posée en (x, y) du canevas ; `shadow` = ombre (assombrit le sol déjà posé) */
interface Paint {
  t: DsTile;
  x: number;
  y: number;
  shadow: boolean;
}

export async function buildMap(data: GameData, spec: MapSpec, out: Sink, log: (s: string) => void, opts: MapBuildOptions): Promise<MapBuildResult> {
  const clock = (phase: string, t0: number): void => opts.onPhase?.(phase, performance.now() - t0);
  let tPhase = performance.now();
  let ds1: Ds1;
  if (spec.parts && spec.size) {
    // « a|b » : premier fichier présent (les variantes 2 et 3 n'existent pas pour toutes les pièces)
    const load = (f: string): Ds1 => {
      for (const c of f.split('|')) {
        const b = data.vfs.get(`data\\global\\tiles\\${c.replace(/\//g, '\\')}`);
        if (b) return decodeDs1(b);
      }
      throw new Error(`DS1 absent : ${f}`);
    };
    ds1 = mergeDs1(
      spec.parts.map((p) => ({ ds1: load(p.ds1), cx: p.cx, cy: p.cy, over: p.over })),
      spec.size[0],
      spec.size[1],
    );
  } else {
    const bytes = data.vfs.get(`data\\global\\tiles\\${spec.ds1!.replace(/\//g, '\\')}`);
    if (!bytes) throw new Error(`DS1 absent : ${spec.ds1}`);
    ds1 = decodeDs1(bytes);
  }
  if (spec.fill) {
    const Wd = ds1.width;
    const Hd = ds1.height;
    for (let pass = 0; pass < 2; pass++) {
      for (const fl of ds1.floors) {
        const src = fl.slice();
        for (let y = 0; y < Hd; y++) {
          for (let x = 0; x < Wd; x++) {
            if (src[y * Wd + x]) continue;
            const nb = [x > 0 ? src[y * Wd + x - 1] : 0, x + 1 < Wd ? src[y * Wd + x + 1] : 0, y > 0 ? src[(y - 1) * Wd + x] : 0, y + 1 < Hd ? src[(y + 1) * Wd + x] : 0].filter(Boolean);
            if (nb.length >= 2) fl[y * Wd + x] = nb[0];
          }
        }
      }
    }
  }
  const tiles = loadDs1Tiles(data, ds1);
  clock('decode', tPhase);
  tPhase = performance.now();
  const { width: W, height: H } = ds1;
  const cw = (W + H) * (TW / 2) + 400;
  const chh = (W + H) * (TH / 2) + 700;
  const ox0 = H * (TW / 2) + 200; // abscisse de l'origine de la case (0, 0)
  const oy0 = 500;
  const caseXY = (x: number, y: number) => ({ X: ox0 + (x - y) * (TW / 2), Y: oy0 + (x + y) * (TH / 2) });
  /** commandes de peinture, dans l'ordre exact de l'ancien exporteur ; `lavaAt` = nombre de commandes posées quand la lave est échantillonnée */
  const cmds: Paint[] = [];
  const paint = (t: DsTile, x0: number, y0: number, shadow = false): void => {
    cmds.push({ t, x: x0, y: y0, shadow });
  };
  /** cases où se trouvent les tuiles de certains fichiers (point de passage, autel…) : repères pour placer les objets */
  const landmarks: Record<string, [number, number][]> = {};
  const land = (t: DsTile, x: number, y: number): void => {
    if (/^(waypt|shrine|blacksmith|maingate)\.dt1$/.test(t.file)) (landmarks[t.file.replace('.dt1', '')] ??= []).push([x, y]);
  };
  // ---- collision (sous-tuiles) ----
  const cols = W * 5;
  const rows = H * 5;
  const blocked = new Uint8Array(cols * rows).fill(1);
  const opaque = new Uint8Array(cols * rows);
  /** sous-tuiles affectées (dans un sens ou dans l'autre) par la boucle des murs : la lave n'y change rien (la dernière écriture décide) */
  const touchedByWalls = new Uint8Array(cols * rows);
  let inWalls = false;
  const hasFloor = new Uint8Array(W * H);
  // tuile de lave : plus de la moitié des pixels dessinés sont orange vif (le dallage de pierre et les pentagrammes ne le sont pas)
  const lavaCache = new WeakMap<DsTile, boolean>();
  const isLava = (t: DsTile): boolean => {
    let v = lavaCache.get(t);
    if (v === undefined) {
      let n = 0;
      let orange = 0;
      for (let i = 0; i < t.rgba.length; i += 4) {
        if (!t.rgba[i + 3]) continue;
        n++;
        if (t.rgba[i] > 150 && t.rgba[i + 1] > 70 && t.rgba[i + 2] < 100 && t.rgba[i] > t.rgba[i + 1]) orange++;
      }
      v = n > 200 && orange / n > 0.85;
      lavaCache.set(t, v);
    }
    return v;
  };
  // tuile de vide : un losange noir (aucun pixel plus clair que 6) est le bord de la carte, pas un sol — infranchissable
  const voidCache = new WeakMap<DsTile, boolean>();
  const isVoid = (t: DsTile): boolean => {
    let v = voidCache.get(t);
    if (v === undefined) {
      let n = 0;
      let bright = 0;
      for (let i = 0; i < t.rgba.length; i += 4) {
        if (!t.rgba[i + 3]) continue;
        n++;
        if (Math.max(t.rgba[i], t.rgba[i + 1], t.rgba[i + 2]) >= 12) bright++;
      }
      v = n > 200 && bright / n < 0.04;
      voidCache.set(t, v);
    }
    return v;
  };
  const mark = (t: DsTile, tx: number, ty: number, wallLike: boolean): void => {
    for (let sy = 0; sy < 5; sy++) {
      for (let sx = 0; sx < 5; sx++) {
        // les 25 drapeaux d'une tuile DT1 sont rangés avec l'axe y inversé (ligne 0 = bord bas) : un mur droit bloque la rangée du haut (constat de Riiablo, vérifié sur fence.dt1)
        const f = t.t.subFlags[(4 - sy) * 5 + sx];
        const i = (ty * 5 + sy) * cols + tx * 5 + sx;
        if (f & 1) {
          blocked[i] = 1;
          if (inWalls) touchedByWalls[i] = 1;
          if (wallLike) opaque[i] = 1;
        }
      }
    }
  };
  const openCase = (x: number, y: number): void => {
    for (let sy = 0; sy < 5; sy++) {
      for (let sx = 0; sx < 5; sx++) {
        const i = (y * 5 + sy) * cols + x * 5 + sx;
        blocked[i] = 0;
        if (inWalls) touchedByWalls[i] = 1;
      }
    }
  };
  // 0) murs inférieurs (orientations 16 à 19 : parois de falaise sous un plateau) : dessinés AVANT les sols, dans le raster du sol (ordre de dessin de D2),
  // sinon leurs grandes images blanches de neige recouvrent le plateau
  for (const wl of ds1.walls) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = wl.cells[y * W + x];
        const o = wl.orient[y * W + x] & 0xff;
        if (!v || o < 16 || o > 19) continue;
        const c = cell(v);
        const t = pickTile(tiles.get(`${o}/${c.main}/${c.sub}`), x * 7 + y * 13);
        if (!t || t.marker) continue;
        const { X, Y } = caseXY(x, y);
        paint(t, X - TW / 2 + t.t.image.ox, Y + t.t.image.oy + TH);
      }
    }
  }
  // 1) sols : une case avec un sol est marchable sauf sous-tuiles bloquées
  ds1.floors.forEach((fl) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = fl[y * W + x];
        if (!v) continue;
        const c = cell(v);
        const t = pickTile(tiles.get(`0/${c.main}/${c.sub}`), x * 7 + y * 13);
        if (!t) continue;
        const first = !hasFloor[y * W + x];
        hasFloor[y * W + x] = 1;
        if (first) openCase(x, y);
        mark(t, x, y, false);
        if (!spec.town && !t.marker && isVoid(t)) for (let sy = 0; sy < 5; sy++) for (let sx = 0; sx < 5; sx++) blocked[(y * 5 + sy) * cols + x * 5 + sx] = 1;
        if (spec.lava && isLava(t)) for (let sy = 0; sy < 5; sy++) for (let sx = 0; sx < 5; sx++) blocked[(y * 5 + sy) * cols + x * 5 + sx] = 1;
        land(t, x, y);
        let drawT = t;
        let dark = false;
        if (spec.town && !t.marker) {
          let sum = 0;
          let n = 0;
          for (let i = 0; i < t.rgba.length; i += 4)
            if (t.rgba[i + 3]) {
              sum += Math.max(t.rgba[i], t.rgba[i + 1], t.rgba[i + 2]);
              n++;
            }
          dark = n > 500 && sum / n < 14;
        }
        if (t.marker || dark) {
          // tuile d'éditeur ou fosse noire sans sol dessiné : le sol voisin la remplace (jamais un losange noir)
          if (/(collision|inviswal)\.dt1$/i.test(t.file)) continue;
          let alt: DsTile | null = null;
          for (const [dx, dy] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
            [-1, -1],
            [1, 1],
            [-1, 1],
            [1, -1],
          ]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const nv = fl[ny * W + nx];
            if (!nv) continue;
            const nc = cell(nv);
            const nt = pickTile(tiles.get(`0/${nc.main}/${nc.sub}`), nx * 7 + ny * 13);
            if (nt && !nt.marker) {
              alt = nt;
              break;
            }
          }
          if (!alt) continue;
          drawT = alt;
        }
        const { X, Y } = caseXY(x, y);
        paint(drawT, X - TW / 2 + drawT.t.image.ox, Y + drawT.t.image.oy);
      }
    }
  });
  /** instant de l'échantillonnage de la lave : après les sols, avant les ombres et les sols des couches de murs */
  const lavaAt = cmds.length;
  // ---- ombres de sol ----
  if (ds1.shadow) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = ds1.shadow[y * W + x];
        if (!v) continue;
        const c = cell(v);
        const t = pickTile(tiles.get(`13/${c.main}/${c.sub}`), x * 7 + y * 13);
        if (!t) continue;
        const { X, Y } = caseXY(x, y);
        paint(t, X - TW / 2 + t.t.image.ox, Y + t.t.image.oy, true);
      }
    }
  }
  // ---- murs, toits, arbres ----
  interface Place {
    tile: DsTile;
    x: number;
    y: number;
    tx: number;
    ty: number;
    roof: boolean;
    o: number;
  }
  const places: Place[] = [];
  inWalls = true;
  for (const wl of ds1.walls) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = wl.cells[y * W + x];
        if (!v) continue;
        const c = cell(v);
        const o = wl.orient[y * W + x] & 0xff;
        const t = pickTile(tiles.get(`${o}/${c.main}/${c.sub}`), x * 7 + y * 13);
        if (!t) continue;
        const { X, Y } = caseXY(x, y);
        if (o === 0) {
          // tuile de sol posée sur une couche de murs : dans le sol
          if (!hasFloor[y * W + x]) {
            hasFloor[y * W + x] = 1;
            openCase(x, y);
          }
          land(t, x, y);
          mark(t, x, y, false);
          if (!t.marker) paint(t, X - TW / 2 + t.t.image.ox, Y + t.t.image.oy);
          continue;
        }
        // orientations 10 et 11 : tuiles de repérage de l'éditeur (« Town Portal », zone verte…) — ni dessinées ni bloquantes, on garde la position
        if (o === 10 || o === 11) {
          (landmarks[o === 10 && /waypt/.test(t.file) ? 'townportal' : `special${o}`] ??= []).push([x, y]);
          continue;
        }
        if (t.marker) {
          mark(t, x, y, false);
          continue;
        }
        land(t, x, y);
        if (o === 13) continue; // ombres : gérées par la couche d'ombre
        const roof = o === 15;
        mark(t, x, y, !roof && o !== 14);
        if (o >= 16 && o <= 19) continue; // murs inférieurs : dessinés avec les sols (passe 0), jamais dans le tri des structures
        const oy = roof ? t.t.image.oy - t.t.roofHeight : t.t.image.oy + TH;
        places.push({ tile: t, x: X - TW / 2 + t.t.image.ox, y: Y + oy, tx: x, ty: y, roof, o });
      }
    }
  }
  inWalls = false;
  clock('flags', tPhase);
  tPhase = performance.now();

  // ---- passes qui lisent les pixels, et découpe du sol : morceau par morceau (tampon unique) ----
  const gdir = 'maps';
  const writeTier = { hi: opts.tiers.includes('hi'), lo: opts.tiers.includes('lo') };
  let files = 0;
  let bytes = 0;
  const putPng = async (path: string, w: number, h: number, rgba: Uint8Array): Promise<void> => {
    bytes += await out.png(path, w, h, rgba);
    files++;
  };
  // boîtes englobantes des commandes (rejeu rapide d'un morceau)
  const nC = cmds.length;
  const bx0 = new Int32Array(nC);
  const by0 = new Int32Array(nC);
  const bx1 = new Int32Array(nC);
  const by1 = new Int32Array(nC);
  for (let i = 0; i < nC; i++) {
    const c = cmds[i];
    bx0[i] = c.x;
    by0[i] = c.y;
    bx1[i] = c.x + c.t.t.image.w;
    by1[i] = c.y + c.t.t.image.h;
  }
  // sous-tuiles : leur centre dans le canevas, rangées par morceau pour les deux passes de lecture
  const nCx = Math.ceil(cw / CHUNK);
  const nCy = Math.ceil(chh / CHUNK);
  const darkSub = new Uint8Array(cols * rows);
  const subOfChunk: number[][] = Array.from({ length: nCx * nCy }, () => []);
  const subX = new Int32Array(cols * rows);
  const subY = new Int32Array(cols * rows);
  for (let sy = 0; sy < rows; sy++) {
    for (let sx = 0; sx < cols; sx++) {
      const tx = (sx + 0.5) / 5;
      const ty = (sy + 0.5) / 5;
      const X = ox0 + (tx - ty) * (TW / 2);
      const Y = oy0 + (tx + ty) * (TH / 2);
      // le test de sol noir lit (round X, round Y) puis 3 px plus haut ; la lave échantillonne autour de (round X, round(Y + LAVA_DY))
      const px = Math.round(X);
      const py = Math.round(Y);
      const i = sy * cols + sx;
      subX[i] = px;
      subY[i] = py;
      if (px < 0 || py < 0 || px >= cw || py >= chh || X >= cw || Y >= chh || X < 0 || Y < 0) {
        darkSub[i] = 1; // hors du canevas : comme du vide
        continue;
      }
      subOfChunk[Math.floor(py / CHUNK) * nCx + Math.floor(px / CHUNK)].push(i);
    }
  }
  const lavaSub = new Uint8Array(cols * rows);
  const BW = CHUNK + 2 * HALO;
  const buf = new Uint8Array(BW * BW * 4);
  const lavaPx = (r: number, g: number, b: number): boolean => r > 140 && g > 50 && b < 90 && r > g * 1.15;
  const chunks: { file: string; lo: string; x: number; y: number; w: number; h: number }[] = [];
  /** peinture de la commande i dans le tampon d'origine (ox, oy) */
  const blit = (i: number, ox: number, oy: number): void => {
    const c = cmds[i];
    const { image } = c.t.t;
    const rgba = c.t.rgba;
    // intersection avec le tampon et avec le canevas
    const xa = Math.max(c.x, ox, 0);
    const xb = Math.min(c.x + image.w, ox + BW, cw);
    const ya = Math.max(c.y, oy, 0);
    const yb = Math.min(c.y + image.h, oy + BW, chh);
    for (let yy = ya; yy < yb; yy++) {
      let s = ((yy - c.y) * image.w + (xa - c.x)) * 4;
      let d = ((yy - oy) * BW + (xa - ox)) * 4;
      for (let xx = xa; xx < xb; xx++, s += 4, d += 4) {
        if (!rgba[s + 3]) continue;
        if (c.shadow) {
          // ombre : noir semi-transparent par-dessus le sol déjà posé
          if (buf[d + 3]) {
            buf[d] = buf[d] * 0.55;
            buf[d + 1] = buf[d + 1] * 0.55;
            buf[d + 2] = buf[d + 2] * 0.55;
          }
        } else {
          buf[d] = rgba[s];
          buf[d + 1] = rgba[s + 1];
          buf[d + 2] = rgba[s + 2];
          buf[d + 3] = rgba[s + 3];
        }
      }
    }
  };
  let nChunk = 0;
  const im = new Uint8Array(CHUNK * CHUNK * 4);
  for (let cyI = 0; cyI < nCy; cyI++) {
    for (let cxI = 0; cxI < nCx; cxI++) {
      opts.checkpoint?.();
      const ox = cxI * CHUNK - HALO;
      const oy = cyI * CHUNK - HALO;
      const subs = subOfChunk[cyI * nCx + cxI];
      buf.fill(0);
      const hit: number[] = [];
      for (let i = 0; i < nC; i++) if (bx0[i] < ox + BW && bx1[i] > ox && by0[i] < oy + BW && by1[i] > oy) hit.push(i);
      // sols (et murs inférieurs) d'abord : c'est l'état où la lave est échantillonnée
      let k = 0;
      for (; k < hit.length && hit[k] < lavaAt; k++) blit(hit[k], ox, oy);
      if (spec.lava) {
        for (const i of subs) {
          const X = subX[i];
          const Y = subY[i] + LAVA_DY;
          let n = 0;
          let o = 0;
          for (let dy = -8; dy <= 8; dy++) {
            for (let dx = -16; dx <= 16; dx++) {
              const xx = X + dx;
              const yy = Y + dy;
              if (xx < 0 || yy < 0 || xx >= cw || yy >= chh) continue;
              const q = ((yy - oy) * BW + (xx - ox)) * 4;
              if (!buf[q + 3]) continue;
              n++;
              if (lavaPx(buf[q], buf[q + 1], buf[q + 2])) o++;
            }
          }
          if (n > 20 && o / n > 0.3) lavaSub[i] = 1;
        }
      }
      for (; k < hit.length; k++) blit(hit[k], ox, oy);
      // sol noir : une sous-tuile dont le sol dessiné est entièrement noir (ou absent) est du vide
      const dark = (px: number, py: number): boolean => {
        if (px < 0 || py < 0 || px >= cw || py >= chh) return true;
        const q = ((py - oy) * BW + (px - ox)) * 4;
        return !buf[q + 3] || Math.max(buf[q], buf[q + 1], buf[q + 2]) < 6;
      };
      for (const i of subs) if (dark(subX[i], subY[i]) && dark(subX[i], subY[i] - 3)) darkSub[i] = 1;
      // morceau de 512 × 512 (lignes et colonnes hors du canevas : zéros) ; rien ne le recouvre = vide, pas de fichier
      if (!hit.length) continue;
      let any = false;
      im.fill(0);
      const x0 = cxI * CHUNK;
      const y0 = cyI * CHUNK;
      const w2 = Math.min(CHUNK, cw - x0);
      for (let y = 0; y < CHUNK; y++) {
        const yy = y0 + y;
        if (yy >= chh) break;
        const sRow = ((yy - oy) * BW + (x0 - ox)) * 4;
        im.set(buf.subarray(sRow, sRow + w2 * 4), y * CHUNK * 4);
      }
      for (let i = 3; i < im.length; i += 4)
        if (im[i]) {
          any = true;
          break;
        }
      if (!any) continue;
      const file = `${spec.id}-g${nChunk}.png`;
      const lo = `${spec.id}-g${nChunk}-lo.png`;
      const mine = !opts.slice || nChunk % opts.slice.n === opts.slice.k;
      if (mine && writeTier.hi) await putPng(`${gdir}/${file}`, CHUNK, CHUNK, im);
      if (mine && writeTier.lo) {
        const h2 = halve({ w: CHUNK, h: CHUNK, rgba: im });
        await putPng(`${gdir}/${lo}`, h2.w, h2.h, h2.rgba);
      }
      chunks.push({ file, lo, x: cxI * CHUNK, y: cyI * CHUNK, w: CHUNK, h: CHUNK });
      nChunk++;
    }
  }
  clock('raster', tPhase);
  tPhase = performance.now();

  // ---- lave au pixel : lissage global puis marge de sécurité de trois sous-cases (1,5 unité) ----
  if (spec.lava) {
    let cur = lavaSub;
    // lisse (majorité 3 × 3, trois passes) : le grain du dessin ne doit pas trouer la lave ni semer de la lave sur la pierre
    for (let pass = 0; pass < 3; pass++) {
      const nxt = new Uint8Array(cols * rows);
      for (let cy = 1; cy < rows - 1; cy++) {
        for (let cx = 1; cx < cols - 1; cx++) {
          let c = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) c += cur[(cy + dy) * cols + cx + dx];
          nxt[cy * cols + cx] = c >= 5 ? 1 : 0;
        }
      }
      cur = nxt;
    }
    // marge : le bord de la lave n'est pas exact au pixel près et le personnage a de l'épaisseur. L'ancien exporteur posait la lave AVANT la boucle
    // des murs, qui réécrit certaines cases (ouverture sous un sol de couche de murs) : une case touchée par les murs garde la dernière écriture.
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (!cur[cy * cols + cx]) continue;
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !touchedByWalls[ny * cols + nx]) blocked[ny * cols + nx] = 1;
          }
        }
      }
    }
  }
  // sol noir
  for (let i = 0; i < blocked.length; i++) if (darkSub[i] && !blocked[i]) blocked[i] = 1;
  // bord de la carte : les deux dernières rangées de sous-tuiles sont infranchissables (on ne se tient pas sur la lisière, devant le vide)
  for (let x = 0; x < cols; x++) for (const y of [0, 1, rows - 2, rows - 1]) blocked[y * cols + x] = 1;
  for (let y = 0; y < rows; y++) for (const x of [0, 1, cols - 2, cols - 1]) blocked[y * cols + x] = 1;
  // ---- passages trop étroits : un personnage a un rayon (0,38 unité) et la sous-tuile fait 0,5 : il lui faut un bloc libre de 2 × 2 sous-tuiles.
  // Une sous-tuile qui n'appartient à aucun bloc 2 × 2 libre est fermée (un passage de deux sous-tuiles, comme un escalier, reste ouvert).
  {
    const src = blocked.slice();
    const free2 = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x + 1 < cols && y + 1 < rows && !src[y * cols + x] && !src[y * cols + x + 1] && !src[(y + 1) * cols + x] && !src[(y + 1) * cols + x + 1];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (src[y * cols + x]) continue;
        if (!(free2(x, y) || free2(x - 1, y) || free2(x, y - 1) || free2(x - 1, y - 1))) blocked[y * cols + x] = 1;
      }
    }
  }
  // ---- zones inatteignables (intérieurs fermés, toits) : seule la plus grande zone marchable reste libre ----
  {
    const comp = new Int32Array(cols * rows).fill(-1);
    const sizes: number[] = [];
    const stack: number[] = [];
    for (let i0 = 0; i0 < blocked.length; i0++) {
      if (blocked[i0] || comp[i0] >= 0) continue;
      const id = sizes.length;
      let n = 0;
      stack.push(i0);
      comp[i0] = id;
      while (stack.length) {
        const i = stack.pop()!;
        n++;
        const x = i % cols;
        const y = (i - x) / cols;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const j = ny * cols + nx;
          if (blocked[j] || comp[j] >= 0) continue;
          comp[j] = id;
          stack.push(j);
        }
      }
      sizes.push(n);
    }
    const best = sizes.indexOf(Math.max(...sizes));
    for (let i = 0; i < blocked.length; i++) if (!blocked[i] && comp[i] !== best) blocked[i] = 1;
  }
  // ---- structures : atlas des tuiles uniques ----
  const unique = [...new Set(places.map((p) => p.tile))];
  const dimsHi = unique.map((t) => ({ w: t.t.image.w, h: t.t.image.h }));
  const dimsLo = dimsHi.map((d) => ({ w: Math.max(1, Math.ceil(d.w / 2)), h: Math.max(1, Math.ceil(d.h / 2)) }));
  let peakBuffer = buf.length + im.length;
  const writeAtlas = async (dims: { w: number; h: number }[], suffix: string, tier: 'hi' | 'lo'): Promise<{ pages: { file: string; w: number; h: number }[]; rects: number[][] }> => {
    const { placements, pages } = pack(dims, 2048, 2048);
    const rects = dims.map((d, i) => [placements[i].page, placements[i].x, placements[i].y, d.w, d.h]);
    const outPages = pages.map((p, i) => ({ file: `${spec.id}-t${suffix}${i}.png`, w: p.w, h: p.h }));
    if (writeTier[tier]) {
      // une page à la fois (16 Mo au plus) : les tuiles sont rangées par page, puis la page est encodée
      for (let pgI = 0; pgI < pages.length; pgI++) {
        if (opts.slice && pgI % opts.slice.n !== opts.slice.k) continue;
        opts.checkpoint?.();
        const pg = pages[pgI];
        const pbuf = new Uint8Array(pg.w * pg.h * 4);
        peakBuffer = Math.max(peakBuffer, pbuf.length + buf.length);
        dims.forEach((d, i) => {
          const pl = placements[i];
          if (pl.page !== pgI) return;
          const src = tier === 'hi' ? unique[i].rgba : halve({ w: unique[i].t.image.w, h: unique[i].t.image.h, rgba: unique[i].rgba }).rgba;
          for (let y = 0; y < d.h; y++) pbuf.set(src.subarray(y * d.w * 4, (y + 1) * d.w * 4), ((pl.y + y) * pg.w + pl.x) * 4);
        });
        await putPng(`${gdir}/${outPages[pgI].file}`, pg.w, pg.h, pbuf);
      }
    }
    return { pages: outPages, rects };
  };
  const hi = await writeAtlas(dimsHi, '', 'hi');
  const lo = await writeAtlas(dimsLo, 'lo-', 'lo');
  const index = new Map(unique.map((t, i) => [t, i]));
  const { decorOf, markOf, monpreset } = opts.tables;
  const map = {
    id: spec.id,
    /** cases et taille en unités du jeu (une case = 2,5 unités) */
    cases: [W, H],
    units: [W * 2.5, H * 2.5],
    act: ds1.act,
    canvas: { w: cw, h: chh, originX: ox0, originY: oy0 },
    grid: { cols, rows, blocked: b64(blocked), opaque: b64(opaque) },
    ground: { chunks },
    tiles: { hi: hi.pages, lo: lo.pages, hiRects: hi.rects, loRects: lo.rects },
    // [tuile, x, y (px, repère du canevas), case x, case y, roof, orientation]
    places: places.map((p) => [index.get(p.tile)!, p.x, p.y, p.tx, p.ty, p.roof ? 1 : 0, p.o]),
    objects: ds1.objects.map((o) => [o.type, o.id, o.x / 5, o.y / 5]),
    // emplacements de monstres et de PNJ du DS1 : [nom de monpreset.txt, x, y] en unités du jeu (l'identifiant est l'indice de la ligne dans l'acte)
    // repères : [genre, x, y] en unités du jeu (sceaux du Chaos, point d'apparition de Diablo)
    marks: markOf
      ? ds1.objects.flatMap((o) => {
          const k = o.type === 2 ? markOf(ds1.act, o.id) : null;
          return k ? [[k, Math.round(o.x * 50) / 100, Math.round(o.y * 50) / 100]] : [];
        })
      : [],
    presets: ds1.objects.flatMap((o) => {
      const name = o.type === 1 ? monpreset.get(ds1.act)?.[o.id] : undefined;
      return name ? [[name.toLowerCase(), Math.round(o.x * 50) / 100, Math.round(o.y * 50) / 100]] : [];
    }),
    // décor posé : [planche, x, y] en unités du jeu (voir decor.ts) ; vide sans obj.txt
    decor: decorOf
      ? ds1.objects.flatMap((o) => {
          const t = o.type === 2 ? decorOf(ds1.act, o.id) : null;
          return t ? [[decorId(t, ds1.act), Math.round(o.x * 50) / 100, Math.round(o.y * 50) / 100]] : [];
        })
      : [],
    landmarks,
    anchors: Object.fromEntries(Object.entries(spec.anchors ?? {}).map(([k, v]) => [k, [v[0] * 2.5, v[1] * 2.5]])),
  };
  const jsonPath = `${gdir}/${spec.id}.json`;
  await putJson(out, jsonPath, map);
  files++;
  const blockedN = blocked.reduce((s, v) => s + v, 0);
  clock('encode', tPhase);
  log(
    `  carte ${spec.id.padEnd(10)} ${W}×${H} cases, ${chunks.length} morceaux de sol, ${unique.length} tuiles de structure (${places.length} posées), ${((1 - blockedN / blocked.length) * 100).toFixed(0)} % marchable`,
  );
  return {
    id: spec.id,
    cases: [W, H],
    chunks: chunks.length,
    atlasPages: { hi: hi.pages.length, lo: lo.pages.length },
    structures: places.length,
    uniqueTiles: unique.length,
    walkable: 1 - blockedN / blocked.length,
    files,
    bytes,
    peakBuffer,
  };
}
