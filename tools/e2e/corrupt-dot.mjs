/**
 * Point rouge devant les lignes modifiées par la corruption : un anneau rare corrompu (propriété) affiche au moins un « ● ».
 *   node tools/e2e/corrupt-dot.mjs [--url=http://127.0.0.1:5233/]
 */
import { chromium } from 'playwright-core';
const URL = (process.argv.find((a) => a.startsWith('--url=')) ?? `--url=${process.env.E2E_URL ?? 'http://127.0.0.1:5233/'}`).slice(6);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 900, height: 800 }, locale: 'fr-FR' })).newPage();
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('d2m.lang', 'fr');
});
await page.goto(URL);
const ready = () => page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 120000 });
await ready();
await page.evaluate(() => {
  window.__arpg.setLevel(40);
  window.__arpg.town();
});
await ready();
const res = await page.evaluate(() => {
  const g = window.__arpg.game();
  window.__arpg.giveItem('ring', { forceQuality: 'rare', ilvl: 60 });
  const c = g.character;
  const idx = c.inventory.findIndex((x) => x?.base === 'ring');
  const it = c.inventory[idx];
  // corruption fabriquée : ajoute une propriété et en fusionne une existante
  const first = it.affixes?.length ? null : null;
  it.corrupted = { outcome: 'property', mods: [{ stat: 'resFire', value: 20 }] };
  window.__arpg.app.panels.show('inventory');
  window.__arpg.app.panels.sel = { from: 'inv', idx };
  window.__arpg.app.panels.refresh();
  return idx;
});
await page.waitForTimeout(400);
const n = await page.evaluate(() => document.querySelectorAll('.tip .corrupt-dot').length);
const legend = await page.evaluate(() => [...document.querySelectorAll('.tip .corrupt')].map((e) => e.textContent).join('|'));
console.log(`${n >= 1 ? '✓' : '✗'} ${n} point(s) rouge(s) ; légende « ${legend} »`);
await browser.close();
process.exit(n >= 1 ? 0 : 1);
