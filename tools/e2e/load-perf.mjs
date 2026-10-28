/**
 * Chargement : octets JS et temps jusqu'à l'écran de sélection (CPU x4, réseau 4G simulé, cache vide).
 *   node tools/e2e/load-perf.mjs [--url=http://127.0.0.1:5233/] [--runs=3] [--cpu=4] [--down=1.6] [--lat=150]
 */
import { chromium } from 'playwright-core';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const RUNS = +(args.get('runs') ?? 3);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const res = [];
for (let i = 0; i < RUNS; i++) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: +(args.get('lat') ?? 150), downloadThroughput: (+(args.get('down') ?? 1.6) * 1e6) / 8, uploadThroughput: 750e3 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: +(args.get('cpu') ?? 4) });
  let jsBytes = 0,
    jsFiles = 0,
    atMenu = null;
  const sizes = new Map();
  cdp.on('Network.loadingFinished', (e) => sizes.set(e.requestId, e.encodedDataLength));
  const urls = new Map();
  cdp.on('Network.responseReceived', (e) => urls.set(e.requestId, e.response.url));
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'commit' });
  // écran de sélection visible
  await page.waitForSelector('.charselect', { timeout: 180000 });
  const tMenu = Date.now() - t0;
  const jsAtMenu = [...sizes].filter(([id]) => /\.js(\?|$)/.test(urls.get(id) ?? ''));
  jsBytes = jsAtMenu.reduce((a, [, b]) => a + b, 0);
  jsFiles = jsAtMenu.length;
  const allBytes = [...sizes].reduce((a, [, b]) => a + b, 0);
  // fin du chargement du cœur en arrière-plan (menu → jeu, personnage créé automatiquement non testé ici)
  if (args.has('top') && i === 0)
    console.log(
      [...sizes]
        .map(([id, b]) => [b, urls.get(id)])
        .sort((a, b) => b[0] - a[0])
        .slice(0, 12)
        .map(([b, u]) => `${Math.round(b / 1024)} KB ${u}`)
        .join('\n'),
    );
  res.push({ tMenu, jsBytes, jsFiles, allBytes });
  await ctx.close();
}
await browser.close();
const med = (k) => res.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(res.length / 2)];
console.log(JSON.stringify({ runs: res, median: { menuMs: med('tMenu'), jsKB: Math.round(med('jsBytes') / 1024), jsFiles: med('jsFiles'), totalKB: Math.round(med('allBytes') / 1024) } }));
