/**
 * Cartes DS1 générées dans le navigateur (phase 5) avec de vrais MPQ ($D2_PRIVATE_DIR/in + Patch_D2.mpq de $D2_PRIVATE_DIR/patch), contre la sortie du CLI
 * ($D2_PRIVATE_DIR/out/game/maps, servie sous /__cli/ par ce script : même origine, aucun fichier Blizzard dans git).
 *   D2_SPRITES=0 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/d2-maps.mjs [--maps=a1_den,a2_town,…] [--hi] [--json=<sortie.json>]
 * Pour chaque carte : durée des données seules (JSON), de la carte complète lo (puis hi avec --hi), taille, pic de tampon ; contrôle des fichiers
 * générés : JSON (grille, structures, objets, monstres posés identiques ; `decor` et `marks` absents faute d'obj.txt), pixels de chaque PNG.
 */
import { chromium } from 'playwright-core';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const IN = join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
const PATCH = join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'patch', 'Patch_D2.mpq');
const CLI = args.get('ref') ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'out', 'game');
/** `--ref=<dossier>` : sortie du CLI de référence (<dossier>/maps/…) ; défaut : le dossier en clair produit par le CLI */
const MAPS = (args.get('maps') ?? 'a1_den,a1_cave1,a1_bloodmoor,a2_town,a2_sewer1,a2_viper1,a3_town,a3_spider,a5_crystal1,a4_fortress,harrogath,cows,andariel').split(',');
const WITH_HI = args.has('hi');
const mpqs = readdirSync(IN)
  .filter((f) => f.toLowerCase().endsWith('.mpq'))
  .map((f) => join(IN, f));
if (existsSync(PATCH)) mpqs.push(PATCH);
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|GPU stall|swiftshader|WebGL|GroupMarker/i.test(m.text()) && errs.push(m.text().slice(0, 200)));
// la sortie du CLI, servie sur la même origine
await page.route('**/__cli/**', (route) => {
  const f = join(CLI, decodeURIComponent(new globalThis.URL(route.request().url()).pathname.replace('/__cli/', '')));
  return existsSync(f) ? route.fulfill({ path: f }) : route.fulfill({ status: 404, body: '' });
});
await page.goto(URL);
await page.evaluate(async () => {
  localStorage.clear();
  localStorage.setItem('d2m.d2local', '1');
  for (const k of await caches.keys()) await caches.delete(k);
  try {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
  } catch {}
  indexedDB.deleteDatabase('d2m-d2local');
});
await page.goto(URL);
await page.waitForFunction(() => window.__d2local, null, { timeout: 60000 });
await page.evaluate(() => {
  const i = document.createElement('input');
  i.type = 'file';
  i.multiple = true;
  i.id = 'mpq';
  document.body.append(i);
});
await page.setInputFiles('#mpq', mpqs);
await page.evaluate(async () => {
  const files = [...document.getElementById('mpq').files];
  await window.__d2local.provideFiles(files, { store: 'session' });
});
await page.waitForFunction(() => window.__d2local.catalog?.maps?.length, null, { timeout: 120000 });
// mesures sans la préparation d'arrière-plan : la file doit être vide (ville comprise) avant chaque demande
await page.evaluate(() => (window.__d2local.prefetchPaused = true));
await page.waitForFunction(() => window.__d2local.mapReady('harrogath', 'lo') || window.__d2local.mapReady('harrogath', 'hi'), null, { timeout: 120000 });
const quiet = () => page.waitForFunction(() => window.__d2local.status.queued + window.__d2local.status.active === 0, null, { timeout: 300000 });
const cat = await page.evaluate(() => ({ maps: window.__d2local.catalog.maps.length, ids: window.__d2local.catalog.maps }));
console.log(`catalogue : ${cat.maps} cartes générables`);
for (const id of MAPS) check(cat.ids.includes(id), `catalogue : ${id}`);

/** durée d'une demande de carte (ms) et dernière ligne de `mapLog` */
const run = (id, tier, data) =>
  page.evaluate(
    async ({ id, tier, data }) => {
      const s = window.__d2local;
      const n0 = s.mapLog.length;
      const t0 = performance.now();
      const ok = await s.requestMap(id, { tier, prio: 1, data });
      const ms = Math.round(performance.now() - t0);
      const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null;
      const want = data ? `mapdata:${id}` : `map:${id}`;
      // les lignes de CE travail (d'autres générations, comme la ville, peuvent s'écrire en même temps) ; une carte hi est découpée en 2 parts
      const mine = s.mapLog.slice(n0).filter((e) => (e.id === want || e.id.startsWith(`${want}@`) || (data && e.id === `map:${id}`)) && (data || e.tier === tier));
      const log = mine.length
        ? [{ ...mine[0], bytes: mine.reduce((a, e) => a + (e.bytes ?? 0), 0), files: mine.reduce((a, e) => a + (e.files ?? 0), 0), ms: Math.max(...mine.map((e) => e.ms)), parts: mine.length }]
        : [];
      return { ok, ms, log, heapMo: mem };
    },
    { id, tier, data },
  );

const rows = [];
for (const id of MAPS) {
  if (!cat.ids.includes(id)) continue;
  const row = { id };
  await quiet();
  const d = await run(id, 'lo', true);
  row.data = d;
  await quiet();
  const l = await run(id, 'lo', false);
  row.lo = l;
  await quiet();
  if (WITH_HI) row.hi = await run(id, 'hi', false);
  rows.push(row);
  const lg = (r) => r.log[0] ?? {};
  console.log(
    `${id.padEnd(14)} données ${String(d.ms).padStart(6)} ms (décodage ${lg(d).decode ?? '-'}, drapeaux ${lg(d).flags ?? '-'}, raster ${lg(d).raster ?? '-'})  lo ${String(l.ms).padStart(6)} ms ${((lg(l).bytes ?? 0) / 1e6).toFixed(1)} Mo ${lg(l).chunks ?? '-'} morceaux, pic tampon ${((lg(l).peakBuffer ?? 0) / 1e6).toFixed(0)} Mo${WITH_HI ? `  hi ${row.hi.ms} ms ${((lg(row.hi).bytes ?? 0) / 1e6).toFixed(1)} Mo` : ''}`,
  );
  check(
    d.ok && l.ok && (!WITH_HI || row.hi.ok),
    `${id} : générée`,
    [d, l, row.hi]
      .filter((r) => r && !r.ok)
      .map((r) => JSON.stringify(r.log))
      .join(' '),
  );
}

/* ---- contrôle contre la sortie du CLI ---- */
const cmp = await page.evaluate(
  async ({ ids, hi }) => {
    const out = [];
    const cache = await caches.open('d2m-d2-local');
    const keyOf = (p) => new URL(`d2-local/${p}`, new URL('./', location.href)).href;
    const local = async (p) => {
      const r = await cache.match(keyOf(p));
      return r ? new Uint8Array(await r.arrayBuffer()) : null;
    };
    const cliBytes = async (p) => {
      const r = await fetch(`/__cli/${p}`);
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
    };
    const pixels = async (b) => {
      const bmp = await createImageBitmap(new Blob([b], { type: 'image/png' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(bmp, 0, 0);
      return { w: bmp.width, h: bmp.height, d: g.getImageData(0, 0, bmp.width, bmp.height).data };
    };
    for (const id of ids) {
      const r = { id, jsonDiff: [], png: { n: 0, same: 0, diff: 0, missing: 0, maxDiffPx: 0 } };
      const lj = await local(`maps/${id}.json`);
      const cj = await cliBytes(`maps/${id}.json`);
      if (!lj || !cj) {
        r.error = `json local=${!!lj} cli=${!!cj}`;
        out.push(r);
        continue;
      }
      const a = JSON.parse(new TextDecoder().decode(lj));
      const b = JSON.parse(new TextDecoder().decode(cj));
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) r.jsonDiff.push(k);
      r.decorCli = (b.decor ?? []).length;
      r.marksCli = (b.marks ?? []).length;
      r.presets = (a.presets ?? []).length;
      const files = [...a.ground.chunks.flatMap((c) => [c.lo, ...(hi ? [c.file] : [])]), ...a.tiles.lo.map((p) => p.file), ...(hi ? a.tiles.hi.map((p) => p.file) : [])];
      for (const f of files) {
        r.png.n++;
        const lb = await local(`maps/${f}`);
        const cb = await cliBytes(`maps/${f}`);
        if (!lb || !cb) {
          r.png.missing++;
          continue;
        }
        const pa = await pixels(lb);
        const pb = await pixels(cb);
        if (pa.w !== pb.w || pa.h !== pb.h) {
          r.png.diff++;
          continue;
        }
        let n = 0;
        for (let i = 0; i < pa.d.length; i += 4) if (pa.d[i] !== pb.d[i] || pa.d[i + 1] !== pb.d[i + 1] || pa.d[i + 2] !== pb.d[i + 2] || pa.d[i + 3] !== pb.d[i + 3]) n++;
        if (n) {
          r.png.diff++;
          r.png.maxDiffPx = Math.max(r.png.maxDiffPx, n);
        } else r.png.same++;
      }
      out.push(r);
    }
    return out;
  },
  { ids: rows.map((r) => r.id), hi: WITH_HI },
);
for (const r of cmp) {
  if (r.error) {
    check(false, `${r.id} : contrôle`, r.error);
    continue;
  }
  const allowed = new Set(['decor', 'marks']);
  const bad = r.jsonDiff.filter((k) => !allowed.has(k));
  check(
    bad.length === 0 && r.png.diff === 0 && r.png.missing === 0,
    `${r.id} : identique au CLI`,
    `JSON ≠ [${r.jsonDiff.join(',')}] (décor CLI ${r.decorCli}, repères ${r.marksCli}), PNG ${r.png.same}/${r.png.n} identiques, ${r.png.diff} différents, ${r.png.missing} manquants`,
  );
}
if (args.get('json')) writeFileSync(args.get('json'), JSON.stringify({ rows, cmp }, null, 1));
check(errs.length === 0, 'aucune erreur console', errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `D2-MAPS : ${fails} ÉCHEC(S)` : 'D2-MAPS OK');
process.exit(fails ? 1 : 0);
