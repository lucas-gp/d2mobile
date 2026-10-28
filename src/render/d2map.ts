/**
 * Rendu d'une carte de ville de Diablo II (tools/d2import/export-map.ts) : le sol en morceaux de 512 px, puis les murs, toits et arbres en
 * sprites posés case par case et triés en profondeur avec les personnages. Les images sont lues (et déchiffrées) par la banque de sprites.
 */
import { Container, Sprite, Texture, Rectangle } from 'pixi.js';
import type { D2MapData } from '../data/d2map';
import { depthKey, isoX, isoY } from './iso';

interface Raw {
  canvas: { w: number; h: number; originX: number; originY: number };
  ground: { chunks: { file: string; lo: string; x: number; y: number; w: number; h: number }[] };
  tiles: { hi: { file: string; w: number; h: number }[]; lo: { file: string; w: number; h: number }[]; hiRects: number[][]; loRects: number[][] };
  places: number[][];
}

export interface MapStructure {
  s: Sprite;
  key: number;
  roof: boolean;
  /** index in the map's `places`; position and depth key without the view's offset */
  i: number;
  x: number;
  y: number;
  key0: number;
}

/** Mémoire de textures (octets) de la carte au palier demandé */
export function mapBytes(map: D2MapData, low: boolean, view?: readonly [number, number, number, number]): number {
  const raw = map.raw as Raw;
  const k = low ? 4 : 1;
  // lot 301: only the chunks of the part seen (`d2Map.view`)
  const r = viewRect(view);
  const { originX, originY } = raw.canvas;
  const chunks = r ? raw.ground.chunks.filter((c) => inRect(r, c.x - originX, c.y - originY, c.w, c.h)) : raw.ground.chunks;
  return chunks.reduce((n, c) => n + (c.w * c.h * 4) / k, 0) + raw.tiles.hi.reduce((n, p) => n + (p.w * p.h * 4) / k, 0);
}

/** Pixels around a map's seen part (`d2Map.view`) still loaded: half the widest screen at the lowest zoom, and a tall structure */
export const VIEW_MARGIN_PX = 1200;

/** The map's canvas rectangle (px, relative to its origin: the world's isometric projection) seen from `view` (world units), with the margin */
export function viewRect(view: readonly [number, number, number, number] | undefined): [number, number, number, number] | null {
  if (!view) return null;
  const [x0, y0, x1, y1] = view;
  // isoX = (x − y) × 32, isoY = (x + y) × 16 (src/render/iso.ts)
  return [(x0 - y1) * 32 - VIEW_MARGIN_PX, (x0 + y0) * 16 - VIEW_MARGIN_PX, (x1 - y0) * 32 + VIEW_MARGIN_PX, (x1 + y1) * 16 + VIEW_MARGIN_PX];
}

/** The files a map's view needs (ground chunks within the rectangle, the structures' atlas pages), at `low` or full resolution */
export function mapFiles(map: D2MapData, low: boolean, view?: readonly [number, number, number, number]): string[] {
  const raw = map.raw as Raw;
  const r = viewRect(view);
  const { originX, originY } = raw.canvas;
  const ground = raw.ground.chunks.filter((c) => !r || inRect(r, c.x - originX, c.y - originY, c.w, c.h)).map((c) => (low ? c.lo : c.file));
  return [...ground, ...(low ? raw.tiles.lo : raw.tiles.hi).map((p) => p.file)];
}

function inRect(r: readonly number[], x: number, y: number, w: number, h: number): boolean {
  return x + w > r[0] && x < r[2] && y + h > r[1] && y < r[3];
}

/**
 * Textures of the next zone's map decoded ahead (lot 301: the zone change of a game mode that names its next zone, rule `game.nextZone`):
 * taken by the next `build` that asks for them; those left are dropped when another map is prefetched
 */
const AHEAD = new Map<string, Promise<Texture | null>>();
let aheadKey = '';

async function decode(read: (path: string) => Promise<Uint8Array | null>, file: string): Promise<Texture | null> {
  // une lecture ratée (réseau mobile) est retentée : sinon la carte entière retombe silencieusement sur le sol d'origine
  let bytes: Uint8Array | null = null;
  for (let attempt = 0; attempt < 4 && !bytes; attempt++) {
    bytes = await read(`maps/${file}`);
    if (!bytes) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  if (!bytes) {
    console.warn(`Carte D2 : fichier introuvable (${file})`);
    return null;
  }
  const t = Texture.from(await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' })));
  t.source.scaleMode = 'nearest';
  return t;
}

/** Decodes the files of a map's view ahead, one at a time (the zone being played keeps the main thread) */
export function prefetchMap(read: (path: string) => Promise<Uint8Array | null>, map: D2MapData, low: boolean, view?: readonly [number, number, number, number]): void {
  const files = mapFiles(map, low, view);
  const key = `${map.id}|${low}|${view?.join(',') ?? ''}`;
  if (key === aheadKey) return;
  dropAhead();
  aheadKey = key;
  let chain: Promise<unknown> = Promise.resolve();
  for (const f of files) {
    const p = chain.then(() => (aheadKey === key ? decode(read, f) : null));
    chain = p.catch(() => null);
    AHEAD.set(f, p);
  }
}

/** Textures decoded ahead and never taken (another map, the run left) */
export function dropAhead(): void {
  for (const p of AHEAD.values()) void p.then((t) => t?.destroy(true)).catch(() => undefined);
  AHEAD.clear();
  aheadKey = '';
}

/** Files decoded ahead or under way (measures) */
export function aheadFiles(): number {
  return AHEAD.size;
}

/** Lot 312: the next image (a background job's turn ends) */
const nextFrame = (): Promise<void> => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));

export class D2MapView {
  /** ground chunks by file (the part of the map loaded: all, or `view`'s) */
  private chunks = new Map<string, Sprite>();
  private chunkTex = new Map<string, Texture>();
  /** the structures' atlas pages and frames (once per view) */
  private pages: Texture[] = [];
  private frames: Texture[] | null = null;
  structures: MapStructure[] = [];
  private placed = new Set<number>();
  /** lot 311: the view's own ground (child of the renderer's ground layer), moved as a whole by `setOffset` */
  readonly ground = new Container();
  private entities: Container | null = null;
  map: D2MapData | null = null;
  low = false;
  private hidden: Set<number> | null = null;
  /** Lot 314: the list of structures left out it was built with (a neighbour's view is kept as the zone's own only with the same) */
  hiddenList: readonly number[] | undefined;
  /** lot 311: where the map's origin stands in the zone's coordinates (a neighbour joined edge to edge; 0 for the zone's own map) */
  offset = { x: 0, y: 0 };
  /** a neighbour culls its structures itself (they are not the renderer's props) */
  cullStructures = false;
  private dead = false;

  constructor(private readonly read: (path: string) => Promise<Uint8Array | null>) {}

  private async tex(file: string): Promise<Texture | null> {
    // decoded ahead (lot 301, `prefetchMap`): taken, else read now
    const ahead = AHEAD.get(file);
    if (ahead) AHEAD.delete(file);
    return (ahead ? await ahead.catch(() => null) : null) ?? (await decode(this.read, file));
  }

  /**
   * Charge la carte ; faux si un fichier manque (la zone garde alors son rendu d'origine). `onFile(done, total)` after each file, weighed
   * as `mapBytes` and `mapFiles` count them (lot 305: the loading bar follows the map's files). Lot 311: `offset`, the map drawn at that
   * place of the zone (a neighbour joined edge to edge, src/data/zones/seams.ts)
   */
  async build(
    map: D2MapData,
    low: boolean,
    ground: Container,
    entities: Container,
    hidden?: readonly number[],
    view?: readonly [number, number, number, number],
    onFile?: (done: number, total: number) => void,
    offset?: { x: number; y: number },
    chunked = false,
  ): Promise<boolean> {
    this.map = map;
    this.low = low;
    this.entities = entities;
    // structures a game mode leaves out (zone's `d2Map.hidden`: the trees thinned out of an arena); none in the base
    this.hidden = hidden?.length ? new Set(hidden) : null;
    this.hiddenList = hidden?.length ? hidden : undefined;
    if (offset) this.offset = { ...offset };
    this.placeGround();
    if (!this.ground.parent) ground.addChild(this.ground);
    try {
      if (!(await this.load(view, onFile, chunked))) throw new Error('fichier manquant');
      return true;
    } catch {
      this.clear();
      return false;
    }
  }

  /** Lot 311: the part of the map the view keeps (a neighbour's, `trim`); null: the whole (or the build's `view`) */
  private limit: readonly [number, number, number, number] | null = null;

  /**
   * Loads (and places) what `view` (the whole map if absent) shows that is not loaded yet; the structures added. Lot 311. Lot 312:
   * `chunked`, the structures placed a few hundred at a time between images (the zone being played keeps its frames)
   */
  async extend(view?: readonly [number, number, number, number], chunked = false): Promise<MapStructure[]> {
    this.limit = view ?? null;
    const before = this.structures.length;
    try {
      await this.load(view, undefined, chunked);
    } catch {
      /* the part already shown stays */
    }
    return this.structures.slice(before);
  }

  /** Loads under way (lot 311: a view still loading is not kept across a change of zone) */
  busy = 0;

  private async load(view?: readonly [number, number, number, number], onFile?: (done: number, total: number) => void, chunked = false): Promise<boolean> {
    this.busy++;
    try {
      return await this.loadPart(view, onFile, chunked);
    } finally {
      this.busy--;
    }
  }

  private async loadPart(view?: readonly [number, number, number, number], onFile?: (done: number, total: number) => void, chunked = false): Promise<boolean> {
    const map = this.map!;
    const raw = map.raw as Raw;
    const low = this.low;
    const k = low ? 2 : 1;
    const q = low ? 4 : 1;
    const { originX, originY } = raw.canvas;
    // lot 301: only the part that can be seen (`d2Map.view`, a game mode's arena), the ground and the structures within a screen of it
    const r = viewRect(view);
    // sol
    const chunks = (r ? raw.ground.chunks.filter((c) => inRect(r, c.x - originX, c.y - originY, c.w, c.h)) : raw.ground.chunks).filter((c) => !this.chunks.has(c.file));
    const pageList = this.frames ? [] : low ? raw.tiles.lo : raw.tiles.hi;
    const wOf = (w: number, h: number) => 1 + (w * h * 4) / q / 65536;
    // the ground chunks' sizes are given at full resolution, the atlas pages' at their own
    const pageOf = (p: { w: number; h: number }) => 1 + (p.w * p.h * 4) / 65536;
    const total = chunks.reduce((n, c) => n + wOf(c.w, c.h), 0) + pageList.reduce((n, p) => n + pageOf(p), 0);
    let done = 0;
    const step = (w: number) => {
      done += w;
      onFile?.(Math.min(done, total), total);
    };
    let grounds: (Texture | null)[];
    if (!chunked) grounds = await Promise.all(chunks.map((c) => this.tex(low ? c.lo : c.file).then((t) => (step(wOf(c.w, c.h)), t))));
    else {
      // lot 312: behind the play, a few files at a time (their reading and decoding started a few per image)
      grounds = [];
      for (let i = 0; i < chunks.length; i += 3) {
        grounds.push(...(await Promise.all(chunks.slice(i, i + 3).map((c) => this.tex(low ? c.lo : c.file)))));
        if (this.dead) break;
        await nextFrame();
      }
    }
    if (this.dead) {
      for (const t of grounds) t?.destroy(true);
      return false;
    }
    let ok = true;
    // the part the view is limited to now (a load begun for the whole map, the view cut down meanwhile: `trim`)
    const lim = viewRect(this.limit ?? undefined);
    let made = 0;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const t = grounds[i];
      if (!t) {
        ok = false;
        continue;
      }
      if (this.chunks.has(c.file) || (lim && !inRect(lim, c.x - originX, c.y - originY, c.w, c.h))) {
        t.destroy(true);
        continue;
      }
      const s = new Sprite(t);
      s.position.set(c.x - originX, c.y - originY);
      s.scale.set(k);
      this.ground.addChild(s);
      this.chunks.set(c.file, s);
      this.chunkTex.set(c.file, t);
      // lot 312: a few at a time behind the play (the texture's first upload is the cost)
      if (chunked && ++made % 4 === 0) {
        await nextFrame();
        if (this.dead) return false;
      }
    }
    if (!ok) return false;
    // structures
    if (!this.frames) {
      const pages = await Promise.all(pageList.map((p) => this.tex(p.file).then((t) => (step(pageOf(p)), t))));
      if (this.dead) {
        for (const t of pages) t?.destroy(true);
        return false;
      }
      if (pages.some((p) => !p)) {
        for (const t of pages) t?.destroy(true);
        return false;
      }
      if (!this.frames) {
        this.pages = pages as Texture[];
        const rects = low ? raw.tiles.loRects : raw.tiles.hiRects;
        this.frames = rects.map(([pg, x, y, w, h]) => new Texture({ source: this.pages[pg].source, frame: new Rectangle(x, y, w, h) }));
      } else for (const t of pages) t?.destroy(true);
    }
    const frames = this.frames;
    const rects = low ? raw.tiles.loRects : raw.tiles.hiRects;
    const ox = isoX(this.offset.x, this.offset.y);
    const oy = isoY(this.offset.x, this.offset.y);
    const ok0 = depthKey(this.offset.x, this.offset.y);
    let placedNow = 0;
    for (let i = 0; i < raw.places.length; i++) {
      if (this.hidden?.has(i) || this.placed.has(i)) continue;
      if (chunked && placedNow > 0 && placedNow % 300 === 0) {
        placedNow++;
        await nextFrame();
        if (this.dead) return false;
        if (this.placed.has(i)) continue;
      }
      const [ti, x, y, tx, ty, roof, o] = raw.places[i];
      if (r && !inRect(r, x - originX, y - originY, rects[ti][3] * k, rects[ti][4] * k)) continue;
      const lim2 = viewRect(this.limit ?? undefined);
      if (lim2 && !inRect(lim2, x - originX, y - originY, rects[ti][3] * k, rects[ti][4] * k)) continue;
      const s = new Sprite(frames[ti]);
      s.position.set(x - originX + ox, y - originY + oy);
      s.scale.set(k);
      // tri : la case (tx, ty) occupe [2,5 tx .. 2,5 (tx + 1)] ; un personnage devant elle a une somme x + y plus grande
      const key0 = depthKey((tx + 0.5) * 2.5, (ty + 0.5) * 2.5) + (roof ? 40 : o === 14 ? 6 : 0);
      s.zIndex = key0 + ok0;
      // out of the scene (kept across a change of zone while loading): added by `attach`
      if (this.attached) this.entities?.addChild(s);
      this.placed.add(i);
      placedNow++;
      this.structures.push({ s, key: key0 + ok0, roof: !!roof, i, x: x - originX, y: y - originY, key0 });
    }
    return true;
  }

  private placeGround(): void {
    this.ground.position.set(isoX(this.offset.x, this.offset.y), isoY(this.offset.x, this.offset.y));
  }

  /** Lot 311: the map's origin moved to (x, y) of the zone (the zone changed: the neighbour becomes the zone, the zone a neighbour) */
  setOffset(x: number, y: number, near?: readonly [number, number, number, number]): void {
    this.offset = { x, y };
    this.placeGround();
    const ox = isoX(x, y);
    const oy = isoY(x, y);
    const k0 = depthKey(x, y);
    this.pendingOffset.clear();
    for (const st of this.structures) {
      st.key = st.key0 + k0;
      // lot 312: `near` (scene px): the structures within it placed now, the others hidden and placed a few hundred an image (`flushOffset`)
      const px = st.x + ox;
      const py = st.y + oy;
      if (near && (px < near[0] || px > near[2] || py < near[1] || py > near[3])) {
        this.pendingOffset.add(st);
        st.s.visible = false;
        continue;
      }
      st.s.position.set(px, py);
      st.s.zIndex = st.key;
    }
  }

  /** Lot 312: structures still to be moved to the view's offset (`setOffset` with `near`) */
  private pendingOffset = new Set<MapStructure>();

  /** Lot 312: up to `n` of the structures left by `setOffset` moved to the offset; true while some are left */
  flushOffset(n: number): boolean {
    if (!this.pendingOffset.size) return false;
    const ox = isoX(this.offset.x, this.offset.y);
    const oy = isoY(this.offset.x, this.offset.y);
    for (const st of this.pendingOffset) {
      if (n-- <= 0) break;
      this.pendingOffset.delete(st);
      if (st.s.destroyed) continue;
      st.s.position.set(st.x + ox, st.y + oy);
      st.s.zIndex = st.key;
    }
    return this.pendingOffset.size > 0;
  }

  /** Lot 311: only what `view` shows is kept (the textures of the ground chunks out of it freed; the atlas pages stay) */
  trim(view: readonly [number, number, number, number]): void {
    this.limit = view;
    const raw = this.map?.raw as Raw | undefined;
    const r = viewRect(view);
    if (!raw || !r) return;
    const { originX, originY } = raw.canvas;
    for (const c of raw.ground.chunks) {
      if (inRect(r, c.x - originX, c.y - originY, c.w, c.h)) continue;
      for (const f of [c.file]) {
        const s = this.chunks.get(f);
        if (!s) continue;
        s.destroy();
        this.chunkTex.get(f)?.destroy(true);
        this.chunks.delete(f);
        this.chunkTex.delete(f);
      }
    }
    const k = this.low ? 2 : 1;
    const rects = this.low ? raw.tiles.loRects : raw.tiles.hiRects;
    this.structures = this.structures.filter((st) => {
      const ti = raw.places[st.i][0];
      if (inRect(r, st.x, st.y, rects[ti][3] * k, rects[ti][4] * k)) return true;
      this.pendingOffset.delete(st);
      st.s.destroy();
      this.placed.delete(st.i);
      return false;
    });
  }

  /** The structures are in the scene (false between `detach` and `attach`) */
  private attached = true;

  /** Lot 311: taken out of the scene without being freed (kept across a change of zone, even while loading) */
  detach(): void {
    this.attached = false;
    this.ground.removeFromParent();
    for (const st of this.structures) st.s.removeFromParent();
  }

  /** Lot 311: put back in the scene; `below`: under the ground already there (a neighbour under the zone's own map) */
  attach(ground: Container, entities: Container, below: boolean): void {
    if (below) ground.addChildAt(this.ground, 0);
    else ground.addChild(this.ground);
    this.entities = entities;
    this.attached = true;
    for (const st of this.structures) entities.addChild(st.s);
  }

  /** Masque les morceaux de sol hors de l'écran (rectangle visible en px du repère de la zone) */
  cull(x0: number, y0: number, x1: number, y1: number): void {
    const gx = this.ground.position.x;
    const gy = this.ground.position.y;
    for (const s of this.chunks.values()) s.visible = s.x + gx + s.width > x0 && s.x + gx < x1 && s.y + gy + s.height > y0 && s.y + gy < y1;
    if (this.cullStructures)
      for (const st of this.structures) {
        if (this.pendingOffset.size && this.pendingOffset.has(st)) continue;
        const p = st.s.position;
        st.s.visible = p.x > x0 - 300 && p.x < x1 + 300 && p.y > y0 - 200 && p.y < y1 + 400;
      }
  }

  /** Files of the ground loaded (measures, tests) */
  get chunkCount(): number {
    return this.chunks.size;
  }

  /** Freed for good: a build or an extension still under way drops what it gets */
  dispose(): void {
    this.dead = true;
    this.clear();
  }

  clear(): void {
    for (const s of this.chunks.values()) s.destroy();
    for (const p of this.structures) p.s.destroy();
    this.pendingOffset.clear();
    for (const t of this.chunkTex.values()) t.destroy(true);
    for (const t of this.pages) t.destroy(true);
    this.ground.removeFromParent();
    this.chunks.clear();
    this.chunkTex.clear();
    this.pages = [];
    this.frames = null;
    this.structures = [];
    this.placed.clear();
  }
}
