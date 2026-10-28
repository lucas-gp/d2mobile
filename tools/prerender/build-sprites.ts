/**
 * Chaîne de pré-rendu : régénère toutes les planches de sprites en une commande.
 *   npm run sprites                 → reconstruit ce qui a changé (cache par empreinte)
 *   npm run sprites -- --force      → tout reconstruire
 *   npm run sprites -- --only=sorceress,zombie
 *
 * Entrée : modèles 3D de assets-src/ + catalog.ts. Sortie : public/sprites/{hi,lo}/*.png|json
 * (PNG-8 indexés, alpha binaire) et public/sprites/manifest.json (tailles, mémoire GPU).
 */
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync, rmSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
// @ts-expect-error module CommonJS sans types
import UPNG from 'upng-js';
import { allSheets, TILE_SIZE, TILE_SPECS, TILE_VARIANTS, type SheetSpec } from './catalog';

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = join(ROOT, 'public/sprites');
const CACHE_FILE = join(ROOT, 'tools/prerender/cache.json');
const PIPELINE_VERSION = 5;
const MAX_PAGE = 2048;

interface FrameOut {
  w: number;
  h: number;
  ax: number;
  ay: number;
  data: string;
  empty?: boolean;
  clipped?: boolean;
}
interface RenderedFrame {
  name: string;
  hi: FrameOut;
  lo: FrameOut;
  shHi?: FrameOut;
  shLo?: FrameOut;
}

const args = new Map(process.argv.slice(2).map((a) => (a.startsWith('--') ? (a.slice(2).split('=') as [string, string]) : [a, ''])));
const FORCE = args.has('force');
const ONLY = args.get('only')?.split(',').filter(Boolean);
const NO_TILES = args.has('no-tiles');
/** Aperçu rapide : 1 image par animation, 8 directions, planche-contact dans un dossier temporaire (`--preview=<dossier>`, défaut /tmp) */
const PREVIEW = args.get('preview');

/* ------------------------------------------------------------------ */
/* Serveur statique local                                              */
/* ------------------------------------------------------------------ */

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
};

function serve(): Promise<{ server: Server; port: number }> {
  return new Promise((res) => {
    const server = createServer((req, resp) => {
      const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
      let p = join(ROOT, url);
      if (url.startsWith('/assets/')) p = join(ROOT, 'assets-src', url.slice('/assets/'.length));
      if (!p.startsWith(ROOT) || !existsSync(p) || statSync(p).isDirectory()) {
        resp.writeHead(404);
        resp.end();
        return;
      }
      resp.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
      resp.end(readFileSync(p));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      res({ server, port: typeof addr === 'object' && addr ? addr.port : 0 });
    });
  });
}

/* ------------------------------------------------------------------ */
/* Cache                                                               */
/* ------------------------------------------------------------------ */

function sha(buf: string | Buffer): string {
  return createHash('sha1').update(buf).digest('hex').slice(0, 16);
}

const fileHashCache = new Map<string, string>();
function fileHash(rel: string): string {
  // créature procédurale : l'empreinte est celle du générateur (page/procedural.js)
  if (rel.startsWith('procedural:'))
    return sha(['proc-kit', 'procedural', 'procedural-crowd', 'procedural-druid', 'procedural-heroes'].map((f) => readFileSync(join(ROOT, `tools/prerender/page/${f}.js`), 'utf8')).join());
  if (!fileHashCache.has(rel)) {
    const p = join(ROOT, 'assets-src', rel);
    let h = sha(readFileSync(p));
    // glTF texte : inclure les fichiers .bin et textures voisins
    if (rel.endsWith('.gltf')) {
      const j = JSON.parse(readFileSync(p, 'utf8'));
      const dir = rel.slice(0, rel.lastIndexOf('/') + 1);
      for (const b of [...(j.buffers ?? []), ...(j.images ?? [])]) if (b.uri && !b.uri.startsWith('data:')) h += sha(readFileSync(join(ROOT, 'assets-src', dir, b.uri)));
    }
    fileHashCache.set(rel, sha(h));
  }
  return fileHashCache.get(rel)!;
}

/**
 * Versions explicites du moteur par type de planche : une retouche de prerender.js qui ne
 * change pas le rendu existant (ajout d'une option) n'invalide plus toutes les planches.
 * À INCRÉMENTER quand une modification change l'image produite pour ce type.
 * (La validation complète de lot force de toute façon une régénération totale.)
 */
const ENGINE_VERSIONS = { actor: 1, prop: 1, tile: 1 };
const PALETTE_HASH = sha(readFileSync(join(ROOT, 'tools/prerender/page/palette.js'), 'utf8'));
/** Ancienne empreinte (tout prerender.js) : sert uniquement à migrer le cache existant */
const LEGACY_ENGINE_HASH = sha(readFileSync(join(ROOT, 'tools/prerender/page/prerender.js')) + readFileSync(join(ROOT, 'tools/prerender/page/palette.js'), 'utf8') + PIPELINE_VERSION);
const ENGINE_HASH = sha(`${PALETTE_HASH}:${PIPELINE_VERSION}:tile${ENGINE_VERSIONS.tile}`);

function sheetHash(s: SheetSpec): string {
  const files = [s.model, ...(s.accessories ?? []).map((a) => a.model), ...(s.textureOverride ? [s.textureOverride] : [])];
  return sha(JSON.stringify(s) + files.map(fileHash).join() + `${PALETTE_HASH}:${PIPELINE_VERSION}:${s.kind}${ENGINE_VERSIONS[s.kind]}`);
}

function legacySheetHash(s: SheetSpec): string {
  const files = [s.model, ...(s.accessories ?? []).map((a) => a.model)];
  return sha(JSON.stringify(s) + files.map(fileHash).join() + LEGACY_ENGINE_HASH);
}

/* ------------------------------------------------------------------ */
/* Atlas                                                               */
/* ------------------------------------------------------------------ */

interface Packed {
  page: number;
  x: number;
  y: number;
}

/** Rangement en étagères (trié par hauteur), pages de 2048² au plus, pages recadrées */
function pack(frames: { w: number; h: number }[]): { pos: Packed[]; pages: { w: number; h: number }[] } {
  const order = frames.map((f, i) => i).sort((a, b) => frames[b].h - frames[a].h || frames[b].w - frames[a].w);
  const pos: Packed[] = new Array(frames.length);
  const pages: { w: number; h: number }[] = [];
  let page = -1;
  let x = 0;
  let y = 0;
  let rowH = 0;
  let pageW = 0;
  const pad = 1;
  const newPage = () => {
    page++;
    pages.push({ w: 0, h: 0 });
    x = 0;
    y = 0;
    rowH = 0;
    pageW = 0;
  };
  newPage();
  const totalArea = frames.reduce((s, f) => s + (f.w + pad) * (f.h + pad), 0);
  const targetW = Math.min(MAX_PAGE, Math.max(64, Math.pow(2, Math.ceil(Math.log2(Math.sqrt(totalArea * 1.15))))));
  for (const i of order) {
    const f = frames[i];
    if (x + f.w > targetW) {
      x = 0;
      y += rowH + pad;
      rowH = 0;
    }
    if (y + f.h > MAX_PAGE) {
      newPage();
    }
    pos[i] = { page, x, y };
    x += f.w + pad;
    rowH = Math.max(rowH, f.h);
    pageW = Math.max(pageW, x);
    pages[page].w = Math.max(pages[page].w, pageW);
    pages[page].h = Math.max(pages[page].h, y + f.h);
  }
  // dimensions multiples de 4 (compatibilité compression future)
  for (const p of pages) {
    p.w = Math.ceil(p.w / 4) * 4;
    p.h = Math.ceil(p.h / 4) * 4;
  }
  return { pos, pages };
}

function writeAtlas(
  dir: string,
  base: string,
  frames: { name: string; f: FrameOut }[],
  cnum: number,
): { files: { file: string; w: number; h: number }[]; rects: Record<string, number[]>; bytes: number; gpu: number } {
  const nonEmpty = frames.filter((x) => !x.f.empty);
  const { pos, pages } = pack(nonEmpty.map((x) => x.f));
  const bufs = pages.map((p) => new Uint8Array(p.w * p.h * 4));
  const rects: Record<string, number[]> = {};
  nonEmpty.forEach((x, i) => {
    const p = pos[i];
    const src = Buffer.from(x.f.data, 'base64');
    const pw = pages[p.page].w;
    for (let row = 0; row < x.f.h; row++) bufs[p.page].set(src.subarray(row * x.f.w * 4, (row + 1) * x.f.w * 4), ((p.y + row) * pw + p.x) * 4);
    rects[x.name] = [p.page, p.x, p.y, x.f.w, x.f.h, round2(x.f.ax), round2(x.f.ay)];
  });
  for (const x of frames) if (x.f.empty) rects[x.name] = [-1, 0, 0, 0, 0, 0, 0];
  const files: { file: string; w: number; h: number }[] = [];
  let bytes = 0;
  let gpu = 0;
  pages.forEach((p, i) => {
    const png = Buffer.from(UPNG.encode([bufs[i].buffer], p.w, p.h, cnum));
    const file = `${base}-${i}.png`;
    writeFileSync(join(dir, file), png);
    files.push({ file, w: p.w, h: p.h });
    bytes += png.length;
    gpu += p.w * p.h * 4;
  });
  return { files, rects, bytes, gpu };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Principal                                                           */
/* ------------------------------------------------------------------ */

interface ManifestEntry {
  hash: string;
  hi: { bytes: number; gpu: number };
  lo: { bytes: number; gpu: number };
  group?: string;
  kind: string;
}

async function main(): Promise<void> {
  const t0 = Date.now();
  for (const tier of ['hi', 'lo']) mkdirSync(join(OUT, tier), { recursive: true });
  const cache: Record<string, string> = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
  const manifestFile = join(OUT, 'manifest.json');
  const manifest: { version: number; sheets: Record<string, ManifestEntry>; tiles: Record<string, ManifestEntry> } = existsSync(manifestFile)
    ? JSON.parse(readFileSync(manifestFile, 'utf8'))
    : { version: PIPELINE_VERSION, sheets: {}, tiles: {} };
  manifest.version = PIPELINE_VERSION;

  // migration du cache vers les versions explicites (sans rien reconstruire)
  for (const s of allSheets()) if (cache[s.id] && cache[s.id] === legacySheetHash(s)) cache[s.id] = sheetHash(s);
  for (const t of TILE_SPECS) {
    const k = `ground_${t.kind}`;
    if (cache[k] === sha(JSON.stringify(t) + fileHash(t.texture) + LEGACY_ENGINE_HASH + TILE_SIZE + TILE_VARIANTS))
      cache[k] = sha(JSON.stringify(t) + fileHash(t.texture) + ENGINE_HASH + TILE_SIZE + TILE_VARIANTS);
  }
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1));
  const sheets = allSheets().filter((s) => !ONLY || ONLY.includes(s.id));
  const todo = sheets.filter((s) => FORCE || cache[s.id] !== sheetHash(s) || !existsSync(join(OUT, 'hi', `${s.id}.json`)));
  const tilesTodo =
    NO_TILES || ONLY
      ? []
      : TILE_SPECS.filter(
          (t) => FORCE || cache[`ground_${t.kind}`] !== sha(JSON.stringify(t) + fileHash(t.texture) + ENGINE_HASH + TILE_SIZE + TILE_VARIANTS) || !existsSync(join(OUT, 'hi', `ground_${t.kind}.json`)),
        );
  console.log(`Planches : ${sheets.length} au catalogue, ${todo.length} à reconstruire ; sols : ${tilesTodo.length} à reconstruire.`);

  if (todo.length || tilesTodo.length) {
    const { server, port } = await serve();
    const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const page = await browser.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') console.error('[page]', m.text());
    });
    page.on('pageerror', (e) => console.error('[page]', e.message));
    await page.goto(`http://127.0.0.1:${port}/tools/prerender/page/index.html`);
    await page.waitForFunction(() => (window as unknown as { prReady?: boolean }).prReady === true, null, { timeout: 30000 });
    const info = await page.evaluate(() => (window as unknown as { pr: { init: () => unknown } }).pr.init());
    console.log('Moteur :', JSON.stringify(info));

    if (PREVIEW !== undefined) {
      for (const s of todo) {
        const spec = {
          ...s,
          model: `/assets/${s.model}`,
          textureOverride: s.textureOverride && `/assets/${s.textureOverride}`,
          accessories: (s.accessories ?? []).map((a) => ({ ...a, model: `/assets/${a.model}` })),
        };
        await page.evaluate((cfg) => (window as unknown as { pr: { loadSheet: (c: unknown) => Promise<unknown> } }).pr.loadSheet(cfg), spec);
        const anims = Object.keys(s.anims);
        const tiles: { name: string; f: FrameOut }[] = [];
        for (const k of anims) {
          const a = s.anims[k];
          const nd = Math.min(8, a.dirs ?? s.dirs);
          const one = { ...spec, dirs: nd, anims: { [k]: { ...a, frames: Math.min(a.frames, 1) } } };
          const dirs = Array.from({ length: nd }, (_, i) => i);
          const out: RenderedFrame[] = await page.evaluate(
            ([c, kk, d]) => (window as unknown as { pr: { renderBatch: (a: unknown, b: unknown, c: unknown) => RenderedFrame[] } }).pr.renderBatch(c, kk, d),
            [one, k, dirs] as const,
          );
          for (const f of out) tiles.push({ name: f.name, f: f.hi });
        }
        const dir = PREVIEW || '/tmp';
        writeAtlas(dir, `preview_${s.id}`, tiles, 0);
        console.log(`aperçu ${dir}/preview_${s.id}-0.png`);
      }
      await browser.close();
      server.close();
      return;
    }
    for (const s of todo) {
      const ts = Date.now();
      const spec = {
        ...s,
        model: `/assets/${s.model}`,
        textureOverride: s.textureOverride && `/assets/${s.textureOverride}`,
        accessories: (s.accessories ?? []).map((a) => ({ ...a, model: `/assets/${a.model}` })),
      };
      const loaded = await page.evaluate((cfg) => (window as unknown as { pr: { loadSheet: (c: unknown) => Promise<{ clips: Record<string, unknown>; size: number[] }> } }).pr.loadSheet(cfg), spec);
      if (s.kind === 'prop') {
        // cellule calculée d'après la taille réelle du modèle mis à l'échelle
        const [sx, sy, sz] = loaded.size;
        const cw = Math.ceil((sx + sz) * 32 + 40);
        const ch = Math.ceil(sy * 39.2 + (sx + sz) * 16 + 60);
        spec.cell = [cw + (cw % 2), ch];
        spec.anchor = [(cw + (cw % 2)) / 2, ch - Math.ceil((sx + sz) * 8 + 20)];
      }
      if (s.kind === 'actor') {
        // cellule déduite de l'emprise mesurée (toutes animations, ombre comprise) + marge
        const e = await page.evaluate((cfg) => (window as unknown as { pr: { measure: (c: unknown) => { minX: number; maxX: number; minY: number; maxY: number } } }).pr.measure(cfg), spec);
        const pad = 6;
        const ax = Math.ceil(-e.minX) + pad;
        const ay = Math.ceil(-e.minY) + pad;
        let cw = ax + Math.ceil(e.maxX) + pad;
        cw += cw % 2;
        const ch = ay + Math.ceil(e.maxY) + pad;
        spec.cell = [cw, ch];
        spec.anchor = [ax, ay];
      }
      for (const [k, v] of Object.entries(loaded.clips)) {
        if (!v && s.kind === 'actor' && spec.anims[k].clip) throw new Error(`${s.id} : animation « ${spec.anims[k].clip} » introuvable (${k})`);
      }
      const frames: RenderedFrame[] = [];
      let clipped = 0;
      for (const [animKey, a] of Object.entries(s.anims)) {
        const nd = a.dirs ?? s.dirs;
        const dirs = Array.from({ length: nd }, (_, i) => i);
        const step = Math.max(1, Math.floor(64 / Math.max(1, a.frames)));
        for (let i = 0; i < dirs.length; i += step) {
          const batch = dirs.slice(i, i + step);
          const cfg = { ...spec, dirs: nd };
          const out: RenderedFrame[] = await page.evaluate(
            ([c, k, d]) => (window as unknown as { pr: { renderBatch: (a: unknown, b: unknown, c: unknown) => RenderedFrame[] } }).pr.renderBatch(c, k, d),
            [cfg, animKey, batch] as const,
          );
          for (const f of out) if (f.hi.clipped) clipped++;
          frames.push(...out);
        }
      }
      if (frames.every((f) => f.hi.empty)) throw new Error(`${s.id} : toutes les images sont vides (modèle hors cadre ou masqué)`);
      if (clipped) console.warn(`  ⚠ ${s.id} : ${clipped} image(s) touchent le bord de la cellule (agrandir « cell »)`);
      const ks = s.texScale ?? 1;
      const meta = {
        id: s.id,
        kind: s.kind,
        dirs: s.dirs,
        anims: Object.fromEntries(Object.entries(s.anims).map(([k, a]) => [k, { frames: a.frames, fps: a.fps, loop: !!a.loop, action: a.action ?? -1, dirs: a.dirs ?? s.dirs }])),
      };
      const entry: ManifestEntry = { hash: sheetHash(s), hi: { bytes: 0, gpu: 0 }, lo: { bytes: 0, gpu: 0 }, group: s.group, kind: s.kind };
      for (const tier of ['hi', 'lo'] as const) {
        const dir = join(OUT, tier);
        for (const f of readdirSync(dir)) if (f.startsWith(`${s.id}-`) && f.endsWith('.png')) rmSync(join(dir, f));
        const color = writeAtlas(
          dir,
          s.id,
          frames.map((f) => ({ name: f.name, f: f[tier] })),
          256,
        );
        const shadow =
          s.shadow === false
            ? null
            : writeAtlas(
                dir,
                `${s.id}-s`,
                frames.map((f) => ({ name: f.name, f: tier === 'hi' ? f.shHi! : f.shLo! })),
                256,
              );
        writeFileSync(
          join(dir, `${s.id}.json`),
          JSON.stringify({
            ...meta,
            scale: tier === 'hi' ? ks : ks / 2,
            pages: color.files,
            frames: color.rects,
            shadowPages: shadow?.files ?? [],
            shadows: shadow?.rects ?? {},
            shadowScale: tier === 'hi' ? ks / 2 : ks / 4,
          }),
        );
        entry[tier] = { bytes: color.bytes + (shadow?.bytes ?? 0), gpu: color.gpu + (shadow?.gpu ?? 0) };
      }
      manifest.sheets[s.id] = entry;
      cache[s.id] = entry.hash;
      writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1));
      writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
      console.log(`  ✓ ${s.id} : ${frames.length} images, hi ${(entry.hi.bytes / 1024).toFixed(0)} Ko (GPU ${(entry.hi.gpu / 1048576).toFixed(1)} Mo), ${((Date.now() - ts) / 1000).toFixed(1)} s`);
    }

    for (const t of tilesTodo) {
      const ts = Date.now();
      const tiles: { name: string; hi: FrameOut; lo: FrameOut }[] = [];
      for (let v = 0; v < TILE_VARIANTS; v++) {
        for (const splat of [false, true]) {
          if (splat && v >= 2) continue;
          const r = await page.evaluate((cfg) => (window as unknown as { pr: { renderTile: (c: unknown) => Promise<{ hi: FrameOut; lo: FrameOut }> } }).pr.renderTile(cfg), {
            ...t,
            texture: `/assets/${t.texture}`,
            size: splat ? 3 : TILE_SIZE,
            variant: v,
            splat,
          });
          tiles.push({ name: `${splat ? 'splat' : 'tile'}/${v}`, ...r });
        }
      }
      const id = `ground_${t.kind}`;
      const entry: ManifestEntry = { hash: '', hi: { bytes: 0, gpu: 0 }, lo: { bytes: 0, gpu: 0 }, kind: 'ground' };
      for (const tier of ['hi', 'lo'] as const) {
        const dir = join(OUT, tier);
        const atlas = writeAtlas(
          dir,
          id,
          tiles.map((x) => ({ name: x.name, f: x[tier] })),
          256,
        );
        writeFileSync(
          join(dir, `${id}.json`),
          JSON.stringify({ id, kind: 'ground', scale: tier === 'hi' ? 1 : 0.5, tileSize: TILE_SIZE, splatSize: 3, variants: TILE_VARIANTS, pages: atlas.files, frames: atlas.rects }),
        );
        entry[tier] = { bytes: atlas.bytes, gpu: atlas.gpu };
      }
      entry.hash = sha(JSON.stringify(t) + fileHash(t.texture) + ENGINE_HASH + TILE_SIZE + TILE_VARIANTS);
      manifest.tiles[id] = entry;
      cache[id] = entry.hash;
      writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1));
      writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
      console.log(`  ✓ ${id} : ${((Date.now() - ts) / 1000).toFixed(1)} s`);
    }
    await browser.close();
    server.close();
  }
  // retire du manifeste ce qui n'est plus au catalogue
  const known = new Set(allSheets().map((s) => s.id));
  for (const id of Object.keys(manifest.sheets)) if (!known.has(id) && !ONLY) delete manifest.sheets[id];
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));
  const tot = Object.values(manifest.sheets).concat(Object.values(manifest.tiles));
  const bytes = tot.reduce((s, e) => s + e.hi.bytes + e.lo.bytes, 0);
  console.log(`Terminé en ${((Date.now() - t0) / 1000).toFixed(0)} s. Poids total des planches : ${(bytes / 1048576).toFixed(1)} Mo.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
