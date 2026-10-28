/**
 * Formulaire de synchronisation sur téléphone paysage : le bouton « Créer le compte » doit rester atteignable
 * (visible, ou en faisant défiler la fenêtre par un vrai glissement tactile CDP), à 740×360 et 740×200 (clavier ouvert).
 *   npm run dev -- --port 5186 --host 127.0.0.1   puis   node tools/e2e/sync-form-scroll.mjs [--url=http://127.0.0.1:5233/]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = 'test-results/e2e/sync-scroll';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let ok = true;
const check = (c, w, d = '') => {
  if (!c) ok = false;
  console.log(`${c ? '✓' : '✗'} ${w}${d ? ` — ${d}` : ''}`);
};

const ctx = await browser.newContext({ viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto(`${URL}?sync-debug=1`);
await page.waitForSelector('.charselect', { timeout: 90000 });
await page
  .locator('[data-act="sync"], button.d2b')
  .filter({ hasText: /Se connecter|Sign in|Synchroniser|Sync/i })
  .first()
  .tap();
await page.locator('[data-act="tab-register"]').tap();
await page.waitForSelector('.sync-box input.sync-input');

const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 6, radiusY: 6, force: 1 })) });
const swipeUp = async (x, y0, y1) => {
  await touch('touchStart', [[x, y0]]);
  for (let i = 1; i <= 8; i++) {
    await touch('touchMove', [[x, y0 + ((y1 - y0) * i) / 8]]);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', []);
  await page.waitForTimeout(300);
};
const goInView = () =>
  page.evaluate(() => {
    const b = document.querySelector('[data-act="go"]');
    const r = b.getBoundingClientRect();
    const vv = window.visualViewport.height;
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { vis: r.top >= 0 && r.bottom <= vv + 1 && (top === b || b.contains(top)), top: r.top, bottom: r.bottom };
  });
for (const h of [360, 200]) {
  await page.setViewportSize({ width: 740, height: h });
  await page.waitForTimeout(300);
  let s = await goInView();
  let how = 'visible';
  for (let i = 0; i < 6 && !s.vis; i++) {
    how = 'après glissement tactile';
    await swipeUp(370, h - 20, 20);
    s = await goInView();
  }
  check(s.vis, `740×${h} : bouton « Créer le compte » atteignable`, how);
  await page.screenshot({ path: `${OUT}/form-${h}.png` });
  // un tap réel sur le bouton déclenche bien l'action (message de validation attendu : mots de passe vides/différents)
  await page.locator('.sync-box input.sync-input').nth(1).fill('abc');
  await page.locator('.sync-box input.sync-input').nth(2).fill('abd');
  await page.locator('[data-act="go"]').tap();
  await page.waitForSelector('.sync-notice', { timeout: 5000 });
  check(true, `740×${h} : tap sur le bouton pris en compte`);
  await page.locator('.sync-box input.sync-input').nth(1).fill('');
  await page.locator('.sync-box input.sync-input').nth(2).fill('');
}
// le champ ciblé est amené dans la vue
await page.setViewportSize({ width: 740, height: 200 });
await page.locator('.sync-box input.sync-input').nth(2).focus();
await page.waitForTimeout(500);
const fv = await page.evaluate(() => {
  const r = document.activeElement.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= window.visualViewport.height + 1;
});
check(fv, 'champ actif visible au focus (740×200)');
await browser.close();
console.log(ok ? 'OK' : 'ÉCHEC');
process.exit(ok ? 0 : 1);
