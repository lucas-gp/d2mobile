/**
 * Updates of the application (lot 290, owner's request; lot 297: the check made reliable, a progress bar), on a production build served
 * with its service worker (the dev server has none), by a small server of this script that can slow, break or cache its answers:
 *   L0. the launch's automatic check is discreet (the home button never shows "checking" nor a failure);
 *   U1. the home screen's button: "À jour" after a tap when nothing new, the "checking" state seen, quick;
 *   S1. a slow server (version.json held 25 s): never stuck, "Injoignable · Réessayer" after two bounded tries (< 20 s);
 *   S2. a first request cut, the retry answers: "À jour";
 *   S3. a server error (500): "Erreur serveur · Réessayer";
 *   U2. a new version published (sw.js's VERSION and version.json changed), the app launched again: found at launch on the home screen,
 *       installed and reloaded once (the new version's cache in place), then no other reload (no loop);
 *   U3. a new version published while the home screen is open, its files slowed and version.json sent cacheable for an hour (a CDN's or
 *       the browser's cache): the button finds it anyway, shows "Téléchargement x %" rising (aria-valuenow), installs it (one reload);
 *   D1. a new version whose one file fails: "Interrompu · Réessayer", no reload; the file back, the retry installs it (one reload);
 *   P1. Settings › Avancé / Aide in a run: the same control (checking bar, "À jour", a failure to retry), aria-busy;
 *   U4. a new version found during a Survivals run: never a reload in the run, the update card waits for its end (the hub);
 *   U5. offline: the app launches from its cache with no automatic install; the button installs a version already downloaded, then a
 *       check tells "Hors ligne · Réessayer" at once, no page error, no reload loop;
 *   EN: the button translated; storage keys: the same `localStorage` keys before and after the updates (the saves untouched).
 *   npm run build && cp -r dist <dir>
 *   node tools/e2e/update-check.mjs --dist=<dir> [--port=5233] [--shots=<dir>]
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { pickMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const PORT = Number(args.get('port') ?? 5233);
const URL = `http://127.0.0.1:${PORT}/`;
const DIST = args.get('dist');
if (!DIST) throw new Error('--dist=<a copy of dist/> is required (its sw.js and version.json are rewritten)');
const SHOTS = args.get('shots') ?? join(DIST, '..');
mkdirSync(SHOTS, { recursive: true });
const SW = join(DIST, 'sw.js');
const VJ = join(DIST, 'version.json');
const original = readFileSync(SW, 'utf8');
const originalVJ = existsSync(VJ) ? readFileSync(VJ, 'utf8') : null;
const base = /const VERSION = "([^"]+)"/.exec(original)?.[1];
if (!base) throw new Error('VERSION not found in sw.js');
/** Publishes a new version: the service worker's VERSION changed (its cache name with it), version.json with it */
const publish = (n) => {
  writeFileSync(SW, original.replace(`const VERSION = "${base}"`, `const VERSION = "${base}-u${n}"`));
  writeFileSync(VJ, `${JSON.stringify({ version: `${base}-u${n}` })}\n`);
};

/** The server's faults: a path's delay (ms), its status, a first connection cut, version.json cacheable */
const ctl = { delay: new Map(), status: new Map(), cutOnce: new Set(), cacheVersion: false, hits: new Map() };
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};
const match = (m, path) => [...m.entries()].find(([re]) => re.test(path))?.[1];
const server = createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  ctl.hits.set(path, (ctl.hits.get(path) ?? 0) + 1);
  const cut = [...ctl.cutOnce].find((re) => re.test(path));
  if (cut) {
    ctl.cutOnce.delete(cut);
    return req.socket.destroy();
  }
  const d = match(ctl.delay, path);
  if (d) await new Promise((r) => setTimeout(r, d));
  if (res.destroyed) return;
  const st = match(ctl.status, path);
  if (st) {
    res.writeHead(st, { 'Content-Type': 'text/plain' });
    return res.end('fault');
  }
  const file = normalize(join(DIST, path.endsWith('/') ? `${path}index.html` : path));
  if (!file.startsWith(normalize(DIST) + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('404');
  }
  // the deployment's headers (vercel.json), version.json cacheable when asked (a CDN's or a heuristic cache)
  const cache = path.endsWith('/sw.js')
    ? 'no-cache'
    : path.endsWith('/version.json')
      ? ctl.cacheVersion
        ? 'public, max-age=3600'
        : 'no-store, max-age=0'
      : path.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, must-revalidate';
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': cache });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  let loads = 0;
  page.on('load', () => loads++);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e.init')) {
      localStorage.clear();
      localStorage.setItem('d2m.testchar.v1', '1');
      localStorage.setItem('d2m.mode', 'd2+survivals');
      localStorage.setItem('d2m.lang', 'fr');
      sessionStorage.setItem('e2e.init', '1');
    }
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // every state the update buttons show (home and Settings), with the bar's value
    window.__upd = [];
    setInterval(() => {
      for (const b of document.querySelectorAll('[data-act="update"], [data-testid="settings-update"]')) {
        const bar = b.querySelector('.upd-bar');
        const s = `${b.dataset.state}|${bar && !bar.hidden ? (bar.getAttribute('aria-valuenow') ?? 'ind') : '-'}|${b.getAttribute('aria-busy')}`;
        if (window.__upd.at(-1) !== s) window.__upd.push(s);
      }
    }, 25);
  });
  const menu = async () => {
    await page.waitForSelector('.d2c, .charselect', { timeout: 120000 });
    if (await page.$('.d2c')) await page.click('.d2c-skip');
    await page.waitForSelector('[data-act="update"]', { timeout: 90000 });
  };
  const sel = '[data-act="update"]';
  const state = (s = sel) => page.evaluate((q) => document.querySelector(q)?.dataset.state ?? null, s);
  const text = (s = sel) => page.evaluate((q) => document.querySelector(q)?.textContent ?? null, s);
  const seen = () => page.evaluate(() => window.__upd);
  const clearSeen = () => page.evaluate(() => (window.__upd = []));
  const settle = (s = sel, ms = 60000) =>
    page.waitForFunction((q) => !['checking', 'downloading', 'installing', 'restarting'].includes(document.querySelector(q)?.dataset.state), s, { timeout: ms, polling: 50 }).catch(() => undefined);
  const appCaches = () => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('d2m-app-')));
  const shot = (name) => page.screenshot({ path: join(SHOTS, name) }).catch(() => undefined);
  const tap = async (s = sel) => {
    await clearSeen();
    const t0 = Date.now();
    // (in a run, a level's card may cover the panel: the button tapped itself)
    if (s === sel) await page.click(s);
    else await page.$eval(s, (b) => b.click());
    return t0;
  };

  // first visit: the service worker installed and in control (one reload: the page controlled from then on)
  publish(0);
  await page.goto(URL);
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 120000 });
  await page.reload();
  await menu();
  const keys0 = await page.evaluate(() => Object.keys(localStorage).sort());
  // L0: the launch's check, discreet (never "checking" nor a failure on the button)
  await page.waitForTimeout(4000);
  const l0 = await seen();
  check(l0.length > 0 && !l0.some((s) => /^(checking|error)/.test(s)), 'L0: the launch’s automatic check is discreet on the home button', JSON.stringify(l0));
  // U1 (version.json slowed a little: the "checking" state long enough to be seen)
  ctl.delay.set(/\/version\.json$/, 600);
  let t0 = await tap();
  await settle();
  let dt = Date.now() - t0;
  check((await state()) === 'uptodate' && (await text()) === 'À jour' && dt < 5000, 'U1: the home button: "À jour" after a check, nothing new, quick', `${await state()} ${dt} ms`);
  check(
    (await seen()).some((s) => s.startsWith('checking|ind|true')),
    'U1: "checking" shown with an indeterminate bar, aria-busy',
    JSON.stringify(await seen()),
  );
  await shot('u1-menu-uptodate.png');
  ctl.delay.clear();
  // S1: a slow server
  ctl.delay.set(/\/version\.json$/, 25000);
  t0 = await tap();
  await page.waitForTimeout(1500);
  await shot('s1-menu-checking.png');
  await settle(sel, 40000);
  dt = Date.now() - t0;
  check(
    (await state()) === 'error-unreachable' && (await text()) === 'Injoignable · Réessayer' && dt < 20000,
    'S1: a slow server: "Injoignable · Réessayer" after two bounded tries, never stuck',
    `${await state()} ${dt} ms`,
  );
  await shot('s1-menu-unreachable.png');
  ctl.delay.clear();
  // S2: the first request cut, the retry answers
  ctl.hits.clear();
  ctl.cutOnce.add(/\/version\.json$/);
  await tap();
  await settle();
  check(
    (await state()) === 'uptodate' && ctl.hits.get('/version.json') === 2,
    'S2: a first request cut, the retry: "À jour"',
    JSON.stringify({ s: await state(), hits: ctl.hits.get('/version.json') }),
  );
  // S3: a server error
  ctl.status.set(/\/version\.json$/, 500);
  await tap();
  await settle();
  check((await state()) === 'error-server' && (await text()) === 'Erreur serveur · Réessayer', 'S3: a server error: "Erreur serveur · Réessayer"', `${await state()}`);
  ctl.status.clear();
  // U2: a new version, the app launched again: installed at launch, one reload, no loop
  publish(1);
  loads = 0;
  await page.reload();
  await page.waitForFunction(async () => (await caches.keys()).some((k) => k.endsWith('-u1')), null, { timeout: 120000, polling: 500 }).catch(() => undefined);
  await page.waitForTimeout(15000);
  await menu();
  const c2 = await appCaches();
  check(
    loads === 2 && c2.some((k) => k.endsWith('-u1')) && !c2.some((k) => k.endsWith(base)),
    'U2: a new version found at launch: installed, reloaded once (2 loads), its cache in place',
    JSON.stringify({ loads, c2 }),
  );
  // U3: published while the home screen is open, its files slowed, version.json cacheable: found, the download's progress shown, one reload
  ctl.cacheVersion = true;
  await page.evaluate(() => fetch('./version.json')); // a copy in the HTTP cache, as a CDN or the browser would keep it
  publish(2);
  ctl.delay.set(/^\/(?!version\.json|sw\.js)/, 60);
  loads = 0;
  await tap();
  await page.waitForFunction(() => document.querySelector('[data-act="update"]')?.dataset.state === 'downloading', null, { timeout: 30000, polling: 50 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await shot('u3-menu-downloading.png');
  let u3seen = [];
  await page
    .waitForFunction(
      () => {
        window.__u3 = window.__upd;
        return ['installing', 'restarting', 'available'].some((s) => window.__upd.at(-1)?.startsWith(s));
      },
      null,
      { timeout: 180000, polling: 50 },
    )
    .catch(() => undefined);
  u3seen = await page.evaluate(() => window.__u3 ?? []).catch(() => []);
  await page.waitForFunction(async () => (await caches.keys()).some((k) => k.endsWith('-u2')), null, { timeout: 180000, polling: 500 }).catch(() => undefined);
  await page.waitForTimeout(12000);
  await menu();
  const pcts = u3seen.filter((s) => s.startsWith('downloading|')).map((s) => Number(s.split('|')[1]));
  check(
    pcts.length >= 3 && pcts.every((p, i) => i === 0 || p >= pcts[i - 1]) && pcts.at(-1) >= 90,
    'U3: "Téléchargement x %" shown, rising to the end (aria-valuenow)',
    `${JSON.stringify(pcts.slice(0, 6))}… ${pcts.at(-1)} (${pcts.length} values)`,
  );
  check(
    loads === 1 && (await appCaches()).some((k) => k.endsWith('-u2')),
    'U3: version.json cacheable, the button finds the new version anyway and installs it (one reload)',
    JSON.stringify({ loads, caches: await appCaches() }),
  );
  ctl.delay.clear();
  ctl.cacheVersion = false;
  // D1: a file of the new version fails: told, no reload; back, the retry installs it
  publish(3);
  ctl.status.set(/\/manifest\.webmanifest$/, 503);
  loads = 0;
  await tap();
  await settle(sel, 90000);
  check(
    (await state()) === 'error-download' && (await text()) === 'Interrompu · Réessayer' && loads === 0,
    'D1: a file failing: "Interrompu · Réessayer", no reload',
    JSON.stringify({ s: await state(), loads }),
  );
  await shot('d1-menu-download-failed.png');
  ctl.status.clear();
  await tap();
  await page.waitForFunction(async () => (await caches.keys()).some((k) => k.endsWith('-u3')), null, { timeout: 120000, polling: 500 }).catch(() => undefined);
  await page.waitForTimeout(12000);
  await menu();
  check(loads === 1 && (await appCaches()).some((k) => k.endsWith('-u3')), 'D1: the retry downloads and installs it (one reload)', JSON.stringify({ loads, caches: await appCaches() }));
  // U4: in a Survivals run, a new version found: no reload, the card waits for its end
  // (the production build without the Diablo II files: the classic creation screen)
  await pickMode(page, 'd2+survivals', { timeout: 10000 }).catch(() => undefined);
  await page.waitForSelector('.charselect input[type="text"], .d2input', { timeout: 120000 });
  const d2ui = !!(await page.$('.d2input'));
  await page.fill(d2ui ? '.d2input' : '.charselect input[type="text"]', 'Upd');
  await page.click(d2ui ? '.d2b.ok' : '.charselect .btn.primary.big');
  await page.waitForFunction(() => window.__arpg?.game?.().world.zone.id === 'survivals:a1r1' && !document.querySelector('.loading'), null, { timeout: 240000 });
  // P1: Settings › Avancé / Aide: the same control (the run held meanwhile: no level's card over the panel)
  await page.evaluate(() => window.__arpg.speed(0));
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    if (await page.$('.mod-screen .sv-card')) await page.click('.mod-screen .sv-card').catch(() => undefined);
  }
  const ps = '[data-testid="settings-update"]';
  await page.evaluate(() => window.__arpg.app.panels.show('settings'));
  // (a game mode's settings are one flat page; the base's are folded categories)
  if ((await page.$('.setcat')) && (await page.evaluate(() => document.querySelector('.setcat.sel')?.dataset.cat)) !== 'advanced') await page.locator('.setcat[data-cat="advanced"]').click();
  await page.waitForSelector(ps, { timeout: 10000 });
  await page.locator(ps).scrollIntoViewIfNeeded();
  ctl.delay.set(/\/version\.json$/, 1500);
  await tap(ps);
  await page.waitForTimeout(500);
  const p1busy = await page.evaluate((q) => ({ busy: document.querySelector(q).getAttribute('aria-busy'), bar: !document.querySelector(`${q} .upd-bar`).hidden }), ps);
  await shot('p1-settings-checking.png');
  await settle(ps);
  check(
    p1busy.busy === 'true' && p1busy.bar && (await state(ps)) === 'uptodate' && (await text(ps)) === 'À jour · rechercher de nouveau',
    'P1: Settings: checking (aria-busy, bar) then "À jour"',
    JSON.stringify({ p1busy, s: await state(ps) }),
  );
  await shot('p1-settings-uptodate.png');
  ctl.delay.clear();
  ctl.delay.set(/\/version\.json$/, 25000);
  await tap(ps);
  await settle(ps, 40000);
  check(
    (await state(ps)) === 'error-unreachable' && (await text(ps)) === 'Serveur injoignable · réessayer',
    'P1: Settings: a slow server told "Serveur injoignable · réessayer"',
    `${await state(ps)} ${JSON.stringify(await seen())}`,
  );
  await shot('p1-settings-unreachable.png');
  ctl.delay.clear();
  await page.evaluate(() => window.__arpg.app.panels.hide());
  await page.evaluate(() => window.__arpg.speed(1));
  publish(4);
  loads = 0;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  await page.waitForTimeout(20000);
  const u4 = await page.evaluate(() => ({ mode: window.__arpg.game().mode, card: !!document.querySelector('.update-card') }));
  check(loads === 0 && u4.mode === 'run' && !u4.card, 'U4: a new version found during a run: no reload, no card in the run', JSON.stringify({ loads, u4 }));
  await page.evaluate(() => window.__arpg.game().townPortal());
  await page.waitForSelector('.update-card', { timeout: 30000 }).catch(() => undefined);
  const u4b = await page.evaluate(() => ({ mode: window.__arpg.game().mode, card: !!document.querySelector('.update-card') }));
  check(loads === 0 && u4b.mode === 'town' && u4b.card, 'U4: the run over (hub), the update offered', JSON.stringify({ loads, u4b }));
  await shot('u4-hub-card.png');
  // the storage keys: the same (a character's save added by U4 aside)
  const keys1 = await page.evaluate(() => Object.keys(localStorage).sort());
  check(
    keys0.every((k) => keys1.includes(k)),
    'storage keys kept through the updates',
    JSON.stringify(keys0.filter((k) => !keys1.includes(k))),
  );
  // U5: offline: launched from the cache with no automatic install (the version found during the run waits); the button installs
  // that downloaded version (one reload); a check then tells offline at once, no reload
  await ctx.setOffline(true);
  loads = 0;
  await page.reload();
  await menu();
  await page.waitForTimeout(8000);
  const u5a = { loads, state: await state() };
  check(u5a.loads === 1 && u5a.state === 'available', 'U5: offline: launched from the cache, no automatic install, the downloaded version offered', JSON.stringify(u5a));
  await page.click(sel);
  await page.waitForTimeout(10000);
  await menu();
  check(
    loads === 2 && (await appCaches()).some((k) => k.endsWith('-u4')),
    'U5: offline, the button installs the downloaded version (one reload)',
    JSON.stringify({ loads, caches: await appCaches() }),
  );
  t0 = await tap();
  await settle(sel, 30000);
  dt = Date.now() - t0;
  await page.waitForTimeout(2000);
  check(
    loads === 2 && (await state()) === 'error-offline' && (await text()) === 'Hors ligne · Réessayer' && dt < 3000,
    'U5: offline, a check: "Hors ligne · Réessayer" at once, no reload',
    JSON.stringify({ loads, state: await state(), dt }),
  );
  await shot('u5-menu-offline.png');
  await ctx.setOffline(false);
  // EN: the same button translated
  await page.evaluate(() => localStorage.setItem('d2m.lang', 'en'));
  await page.reload();
  await menu();
  await page.waitForTimeout(3000);
  await tap();
  await settle();
  await page.waitForTimeout(500);
  check((await text()) === 'Up to date', 'EN: "Up to date"', `${await text()}`);
  await shot('en-menu-uptodate.png');
  check(errs.length === 0, '0 page error', errs.join(' | '));
} finally {
  writeFileSync(SW, original);
  if (originalVJ !== null) writeFileSync(VJ, originalVJ);
  await browser.close();
  server.close();
}
console.log(fails ? `${fails} échec(s)` : 'OK');
process.exit(fails ? 1 : 0);
