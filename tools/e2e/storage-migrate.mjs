/**
 * Rename to D2 Mobile: a player of an earlier version updates and finds everything again.
 *
 * Real mode (recommended): a build of the version BEFORE the rename creates the profile (character, preferences, anonymous id, sync
 * session in IndexedDB, on-device graphics cache, its own service worker), then the current build is served at the SAME origin and
 * launched in the same browser profile, through the service worker update, exactly like a player:
 *   git archive <old-commit> | tar -x -C /tmp/old && ln -s "$PWD/node_modules" /tmp/old/node_modules
 *   (cd /tmp/old && npx vite build --outDir /tmp/old-dist) && npx vite build --outDir /tmp/new-dist
 *   node tools/e2e/storage-migrate.mjs --old-dist=/tmp/old-dist --new-dist=/tmp/new-dist
 * Simulated mode (no old build): `--new-dist` only; the earlier profile is written directly under the former names.
 * The script starts and stops its own `vite preview` servers on port 5233 (`--port=`).
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const PORT = Number(args.get('port') ?? 5233);
const URL = `http://127.0.0.1:${PORT}/`;
const OLD = args.get('old-dist');
const NEW = args.get('new-dist') ?? 'dist';
// the former prefix is spelled in one file only (src/platform/legacy-names.ts)
const LEGACY = /LEGACY_PREFIX = '([a-z0-9]+)'/.exec(readFileSync('src/platform/legacy-names.ts', 'utf8'))[1];

let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};

/** `vite preview` of a build folder; resolves once it answers */
async function serve(dir) {
  const p = spawn('npx', ['vite', 'preview', '--outDir', dir, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(URL)).ok) return p;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server for ${dir} did not start`);
}
const stop = async (p) => {
  try {
    process.kill(-p.pid, 'SIGTERM');
  } catch {
    /* already stopped */
  }
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(URL);
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
};

const profile = mkdtempSync(join(tmpdir(), 'd2m-e2e-profile-'));
const ctx = await chromium.launchPersistentContext(profile, {
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const errors = [];
let page = ctx.pages()[0] ?? (await ctx.newPage());
page.on('pageerror', (e) => errors.push(e.message));
const ready = () => page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 180000 });
let server;
try {
  /* ---------------------------- earlier version ---------------------------- */
  server = await serve(OLD ?? NEW);
  await page.goto(URL);
  await ready();
  // a played character, French interface, a remembered sync session, generated graphics
  const before = await page.evaluate(async (L) => {
    const a = window.__arpg;
    a.setLevel(23);
    a.game().character.gold = 4321;
    a.app.saveNow();
    const p = `${L}.`;
    // simulated mode: the build is the current one, its keys are moved back under the former names
    if (!localStorage.getItem(`${p}active`)) {
      for (const k of Object.keys(localStorage)) if (k.startsWith('d2m.')) localStorage.setItem(p + k.slice(4), localStorage.getItem(k));
      for (const k of Object.keys(localStorage)) if (k.startsWith('d2m.')) localStorage.removeItem(k);
      localStorage.setItem(`${p}active`, `${p}${localStorage.getItem(`${p}active`).replace(/^d2m\./, '')}`);
    }
    localStorage.setItem(`${p}lang`, 'fr');
    // signed in to sync, session remembered (read from IndexedDB at the next launch)
    localStorage.setItem(`${p}sync.meta`, JSON.stringify({ account: 'e2e-account', remember: true, marks: {}, tombs: {}, lastSync: 0, count: 0 }));
    localStorage.setItem(`${p}stats.id`, 'e2e0123456789abcdef0123456789abcd');
    await new Promise((res, rej) => {
      const r = indexedDB.open(`${L}-sync`, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('session');
      r.onsuccess = () => {
        const tx = r.result.transaction('session', 'readwrite');
        tx.objectStore('session').put({ name: 'e2e-account', token: 't' }, 'v1');
        tx.oncomplete = () => (r.result.close(), res());
      };
      r.onerror = () => rej(r.error);
    });
    await (await caches.open(`${L}-d2-local`)).put(new URL('d2-local/manifest.json', location.href).href, new Response('{"sheets":{}}'));
    const slot = localStorage.getItem(`${p}active`);
    return { slot, text: localStorage.getItem(slot), char: JSON.parse(localStorage.getItem(slot)).character, keys: Object.keys(localStorage).filter((k) => k.startsWith(p)).length };
  }, LEGACY);
  check(!!before.text && before.char.level === 23 && before.char.gold === 4321, `earlier profile: ${before.keys} keys, character level 23 saved`, before.slot);
  // the earlier version saves once more when it is closed: the reference is read after that, from a page that does not run the game
  for (const p of ctx.pages()) await p.close();
  page = await ctx.newPage();
  await page.goto(`${URL}robots.txt`);
  before.text = await page.evaluate((slot) => localStorage.getItem(slot), before.slot);
  before.char = JSON.parse(before.text).character;
  await stop(server);

  /* ---------------------------- this version ---------------------------- */
  server = await serve(NEW);
  // the earlier service worker may serve its cached version once: the update is applied as a player would (relaunch / accept)
  let migration = null;
  for (let i = 0; i < 6 && !migration; i++) {
    for (const p of ctx.pages()) await p.close();
    page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.waitForTimeout(1500);
    migration = await page.evaluate(() => window.__d2mMigration ?? null);
    if (!migration) await page.evaluate(async () => (await navigator.serviceWorker?.getRegistration())?.waiting?.postMessage({ type: 'SKIP_WAITING' }));
  }
  check(!!migration && migration.local.state === 'done', 'first launch of D2 Mobile: storage migrated', JSON.stringify(migration?.local));
  await ready();
  const after = await page.evaluate(
    async ({ L, slot }) => {
      const p = `${L}.`;
      const nk = `d2m.${slot.slice(p.length)}`;
      const g = window.__arpg.game().character;
      const dbs = await new Promise((res) => {
        const r = indexedDB.open('d2m-sync');
        r.onsuccess = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains('session')) return res(null);
          const q = db.transaction('session').objectStore('session').get('v1');
          q.onsuccess = () => (db.close(), res(q.result ?? null));
        };
        r.onerror = () => res(null);
      });
      return {
        nk,
        active: localStorage.getItem('d2m.active'),
        legacyText: localStorage.getItem(slot),
        char: JSON.parse(localStorage.getItem(nk)).character,
        playing: { name: g.name, level: g.level, gold: g.gold },
        lang: localStorage.getItem('d2m.lang'),
        statsId: localStorage.getItem('d2m.stats.id'),
        legacyLeft: Object.keys(localStorage).filter((k) => k.startsWith(p)).length,
        session: dbs,
        caches: await caches.keys(),
        htmlLang: document.documentElement.lang,
      };
    },
    { L: LEGACY, slot: before.slot },
  );
  check(after.active === after.nk, 'active character points to its new key', after.active);
  check(JSON.stringify(after.char) === JSON.stringify(before.char), 'character intact under the new key (same JSON as before the update)');
  check(after.playing.name === before.char.name && after.playing.level === 23 && after.playing.gold === 4321, 'the same character is loaded and played', JSON.stringify(after.playing));
  check(after.legacyText === before.text, 'former key kept, byte for byte (fallback)');
  check(after.legacyLeft >= before.keys, 'all former keys kept', `${after.legacyLeft} / ${before.keys}`);
  check(after.lang === 'fr', 'language preference kept (French)', after.lang);
  check(after.statsId === 'e2e0123456789abcdef0123456789abcd', 'anonymous statistics id kept');
  check(after.session?.name === 'e2e-account', 'remembered sync session copied to the new IndexedDB database', JSON.stringify(after.session));
  check(after.caches.includes(`${LEGACY}-d2-local`), 'on-device graphics cache of the earlier version kept', after.caches.join(', '));
  check(!after.caches.some((k) => k.startsWith(`${LEGACY}-`) && !/-d2(-local|-audio)?$/.test(k)), 'application cache of the earlier version purged');

  await page.reload();
  await page.waitForTimeout(1500);
  const again = await page.evaluate(() => window.__d2mMigration);
  check(again?.local.state === 'already', 'second launch: nothing migrated again', JSON.stringify(again?.local));
  check(errors.length === 0, 'no JavaScript error', errors.join(' | '));
} finally {
  if (server) await stop(server);
  await ctx.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(fails ? `STORAGE MIGRATION: ${fails} FAILURE(S)` : 'STORAGE MIGRATION OK');
process.exit(fails ? 1 : 0);
