/**
 * Coffre › onglet Cartes : visible, actions visibles sans défiler (740 × 360), prise dans le sac, ouverture.
 *   PLAYWRIGHT_BROWSERS_PATH=... node tools/e2e/map-stash.mjs [--url=http://127.0.0.1:5233/]
 * Captures : test-results/e2e/map-stash/*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = join(process.cwd(), 'test-results', 'e2e', 'map-stash');
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await b.newContext({ viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('d2m.lang', 'fr');
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
});
await page.goto(URL + '?testchar=1');
await page.waitForSelector('.charselect.d2s', { timeout: 90000 });
await pickFirstMode(page);
await page.waitForSelector('.d2plate');
await page.click('.d2plate:has-text("99")');
await page.click('.d2b.ok');
await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 180000 });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const g = window.__arpg.game();
  const c = g.character;
  c.inventory = c.inventory.map(() => null);
  for (const [t, q] of [
    [1, 'normal'],
    [2, 'magic'],
    [3, 'rare'],
  ]) {
    const m = window.__arpg.giveMap(t, q);
    c.inventory[c.inventory.indexOf(m)] = null;
    (c.mapStash ??= []).push(m);
  }
  window.__arpg.app.openPanel('stash');
});
await page.waitForTimeout(600);
const inZone = (sel, text) =>
  page.evaluate(
    ([s, t]) => {
      const n = [...document.querySelectorAll(s)].find((x) => !t || x.textContent.trim().startsWith(t));
      if (!n) return 'absent';
      const r = n.getBoundingClientRect();
      const body = document.querySelector('.panel .body').getBoundingClientRect();
      return r.top >= body.top - 1 && r.bottom <= body.bottom + 1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1
        ? 'ok'
        : `hors zone y ${Math.round(r.top)}-${Math.round(r.bottom)} / ${Math.round(body.top)}-${Math.round(body.bottom)}`;
    },
    [sel, text],
  );
await page.evaluate(() => [...document.querySelectorAll('.panel .btn')].find((x) => x.textContent.trim().startsWith('Cartes ('))?.click());
await page.waitForTimeout(400);
const label = await page.evaluate(() => [...document.querySelectorAll('.panel .btn')].find((x) => x.textContent.trim().startsWith('Cartes ('))?.textContent);
check(label === 'Cartes (3)', 'onglet « Cartes (3) » visible', label);
check((await inZone('.panel button', 'Tout trier')) === 'ok', '« Tout trier » visible sans défiler', await inZone('.panel button', 'Tout trier'));
// une carte se touche dans la liste : détail dans la colonne Objet, actions fixes à droite
await page.click('[data-testid="map-row-0"]');
await page.waitForTimeout(250);
check((await inZone('.actcol [data-slot="use"]', 'Ouvrir')) === 'ok', '« Ouvrir » visible sans défiler', await inZone('.actcol [data-slot="use"]', 'Ouvrir'));
await page.screenshot({ path: join(OUT, 'onglet-cartes.png') });
await page.evaluate(() => document.querySelector('[data-testid="map-sort"]')?.click());
await page.waitForTimeout(300);
let tiers = await page.evaluate(() => window.__arpg.game().character.mapStash.map((m) => m.map.tier));
check(tiers.join() === '3,2,1', 'tri par palier décroissant', tiers.join());
await page.click('[data-testid="map-row-0"]');
await page.waitForTimeout(200);
await page.evaluate(() => document.querySelector('.actcol [data-slot="move"]')?.click());
await page.waitForTimeout(300);
const st = await page.evaluate(() => {
  const c = window.__arpg.game().character;
  return { stash: c.mapStash.length, bag: c.inventory.filter((x) => x?.map).length };
});
check(st.stash === 2 && st.bag === 1, 'prise dans le sac', JSON.stringify(st));
check(errors.length === 0, 'aucune erreur de page', errors.join(' | '));
await b.close();
process.exit(fails ? 1 : 0);
