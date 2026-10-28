// Surbrillance du filtre de butin : objets de la liste au sol dans leur couleur + onglet de recherche (captures lues)
// Usage : URL=http://127.0.0.1:5233/ node tools/e2e/highlight.mjs [740x360,1920x1080] [dossier]
import { chromium } from 'playwright-core';
import { pickFirstMode } from './pick-mode.mjs';
const URL = process.env.E2E_URL || process.env.URL || 'http://127.0.0.1:5233/';
const sizes = (process.argv[2] || '740x360,1920x1080').split(',');
const out = process.argv[3] || 'test-results/e2e/shots';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const sz of sizes) {
  const [w, h] = sz.split('x').map(Number);
  const mobile = w < 500 || h < 400;
  const page = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })).newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message));
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
  // filtre strict (masque l'équipement ordinaire) + deux objets en liste : un forcé (anneau magique), une rune en rouge
  await page.evaluate(() => {
    const g = window.__arpg.game();
    g.setFilter({ preset: 'strict' });
    g.setFilter({
      highlight: [
        { id: 'base:ring', color: 0x30e0f0, force: true },
        { id: 'base:r05', color: 0xff4040 },
        { id: 'base:r06', color: 0x40e870 },
      ],
    });
    const w = g.world;
    const p = w.player;
    const mk = (base, q) => ({ uid: 'h' + base + q, base, quality: q, ilvl: 60, sockets: 0, socketed: [] });
    w.dropItem(mk('ring', 'magic'), p.x - 1.5, p.y + 0.5, 0.2);
    w.dropItem(mk('r05', 'normal'), p.x + 0.5, p.y + 1.5, 0.2);
    w.dropItem(mk('r06', 'normal'), p.x + 2, p.y, 0.2);
    w.dropItem(mk('ring', 'rare'), p.x, p.y - 2, 0.2);
  });
  await page.waitForTimeout(1500);
  const col = await page.evaluate(() => [...document.querySelectorAll('.label')].map((e) => `${e.textContent}|${getComputedStyle(e).color}`));
  console.log(sz, 'étiquettes', JSON.stringify(col));
  if (!col.some((c) => c.includes('rgb(48, 224, 240)'))) {
    bad++;
    console.log('FAIL couleur cyan absente');
  }
  await page.screenshot({ path: `${out}/hl-ground-${sz}.png` });
  await page.evaluate(() => window.__arpg.app.openPanel('filter'));
  await page.waitForTimeout(400);
  await page.click('[data-testid="filter-tab-hl"]');
  await page.fill('[data-testid="hl-search"]', 'epee');
  await page.selectOption('[data-testid="hl-cat"]', 'all');
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const s = document.querySelector('[data-testid="hl-search"]').getBoundingClientRect();
    return { searchVisible: s.top >= 0 && s.bottom <= innerHeight, results: document.querySelectorAll('[data-testid="hl-result"]').length, entries: document.querySelectorAll('.hlentry').length };
  });
  console.log(sz, JSON.stringify(info));
  if (!info.searchVisible || !info.results || info.entries < 3) {
    bad++;
    console.log('FAIL onglet');
  }
  await page.screenshot({ path: `${out}/hl-tab-${sz}.png` });
  await page.close();
}
await b.close();
process.exit(bad ? 1 : 0);
