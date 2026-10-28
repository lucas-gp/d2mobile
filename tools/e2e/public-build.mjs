/**
 * Version publique (D2_PUBLIC=1, build de test D2_ALLOW_SKIP=1) : écran de choix → « graphismes de remplacement » → jeu ; ni Guilde, ni synchronisation
 * (menu, sélection de personnage, Réglages), et AUCUNE requête vers /api ou /guild-api, aucune erreur console.
 *   D2_SPRITES=0 D2_PUBLIC=1 D2_ALLOW_SKIP=1 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/public-build.mjs [--url=http://127.0.0.1:5233/]
 */
import { chromium } from 'playwright-core';
import { pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 }, locale: 'fr-FR' });
  const page = await ctx.newPage();
  const net = [];
  const errs = [];
  page.on('request', (r) => /\/(api|guild-api)(\/|$|\?)/.test(new globalThis.URL(r.url()).pathname) && net.push(r.url()));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|GPU stall|swiftshader|WebGL|GroupMarker/i.test(m.text()) && errs.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message.slice(0, 200)}`));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('d2m.lang', 'fr');
    // un vrai joueur : l'écran de sélection n'est pas sauté
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  await page.goto(URL);
  await page.waitForSelector('.d2c', { timeout: 90000 });
  check(true, 'écran de choix des graphismes affiché');
  await page.click('.d2c-skip');
  await page.waitForSelector('.charselect', { timeout: 90000 });
  const SYNC = /Se connecter|Synchroniser|Log in|Sign in|Synchroni[sz]/i;
  const menu = await page.locator('.charselect').innerText();
  check(!SYNC.test(menu) && (await page.locator('[data-act="sync"]').count()) === 0, 'sélection de personnage : aucun bouton de synchronisation', menu.replace(/\s+/g, ' ').slice(0, 80));
  // choice of the mode first (lot 271): the first one, the session's default ruleset
  if (await page.$('.charselect [data-act="modetype"], .charselect [data-act="mode"]')) await pickFirstMode(page);
  await page.waitForSelector('.charselect input', { timeout: 60000 });
  await page.fill('.charselect input', 'Pub');
  await page.click('.charselect .card.barbarian');
  await page.click('.charselect .btn.primary');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 240000 });
  check(true, 'le jeu démarre avec les graphismes de remplacement');
  await page.evaluate(() => window.__arpg.town());
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 120000 });
  await page.evaluate(() => window.__arpg.app.openPanel('stash'));
  await page.waitForSelector('.panel [data-zone="chest"]', { timeout: 30000 });
  const tabs = await page.locator('[data-testid^="stash-top-"]').allInnerTexts();
  check(tabs.length >= 4 && !tabs.some((t) => /Guilde/i.test(t)), 'coffre : pas d’onglet Guilde', tabs.join(' | '));
  await page.evaluate(() => window.__arpg.app.panels.show('settings'));
  await page.waitForSelector('.setpane', { timeout: 30000 });
  await page.click('.setcat[data-cat="account"]').catch(() => {});
  await page.waitForTimeout(300);
  const set = await page.locator('.setpane').innerText();
  check(!/Synchronisation/i.test(set) && /Exporter la sauvegarde/i.test(set), 'Réglages › Compte : pas de synchronisation (export présent)');
  await page.waitForTimeout(3000);
  check(net.length === 0, '0 requête /api ou /guild-api', net.join(' '));
  check(errs.length === 0, '0 erreur console', errs.join(' | '));
} finally {
  await browser.close();
}
console.log(fails ? `${fails} échec(s)` : 'OK');
process.exit(fails ? 1 : 0);
