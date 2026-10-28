/**
 * Potions de jet : bouton visible seulement avec une potion, lancer à la touche G (PC) ou au bouton (mobile), compteur, capture.
 *   node tools/e2e/throw-potion.mjs [--url=http://127.0.0.1:5233/] [--mobile]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const mobile = args.has('mobile');
const OUT = join(process.cwd(), 'test-results', 'e2e', 'throw');
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, what, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('d2m.lang', 'fr');
});
await page.goto(URL);
await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading:not(.hidden)'), null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  window.__arpg.setLevel(30, true);
  window.__arpg.god(true);
  window.__arpg.startRun('tristram', 0, 42);
});
await page.waitForFunction(() => window.__arpg.state().zone === 'tristram' && !document.querySelector('.loading:not(.hidden)'), null, { timeout: 90000 });
await page.waitForTimeout(1500);
const sel = mobile ? '[data-testid=throw-potion]' : '[data-testid=pc-throw]';
const vis = () =>
  page.evaluate((s) => {
    const e = document.querySelector(s);
    return !!e && e.style.display !== 'none' && e.offsetParent !== null;
  }, sel);
check(!(await vis()), 'bouton de lancer caché sans potion');
await page.evaluate(() => {
  const g = window.__arpg.game();
  window.__arpg.giveStack('oil_potion', 3);
  const w = g.world;
  w.spawnGroup(0);
  for (const m of w.monsters)
    if (!m.isSummon) {
      m.x = w.player.x + 4;
      m.y = w.player.y;
    }
});
await page.waitForTimeout(600);
check(await vis(), 'bouton visible avec une potion');
const qty = () => page.evaluate(() => window.__arpg.game().character.throwPots?.oil_potion ?? 0);
check((await qty()) === 3, 'réserve = 3');
if (mobile) await page.tap(sel);
else {
  await page.mouse.move(700, 360);
  await page.keyboard.press('g');
}
await page.waitForTimeout(250);
await page.screenshot({ path: join(OUT, `${mobile ? 'mobile' : 'pc'}-fly.png`) });
await page.waitForTimeout(700);
await page.screenshot({ path: join(OUT, `${mobile ? 'mobile' : 'pc'}-impact.png`) });
check((await qty()) === 2, 'lancer consomme 1', String(await qty()));
const label = await page.evaluate((s) => document.querySelector(s + ' .qty').textContent, sel);
check(label === '2', 'compteur du bouton', label);
check(errors.length === 0, 'aucune erreur de console', errors.join(' | '));
await browser.close();
process.exit(failures ? 1 : 0);
