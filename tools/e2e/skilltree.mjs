/**
 * Arbres de compétences des sept classes dans le client : ouverture du panneau, capture de chaque
 * onglet d'arbre, absence d'erreur.   node tools/e2e/skilltree.mjs [--url=http://127.0.0.1:5233/] [--only=paladin]
 * Captures : test-results/e2e/skilltree/<classe>-<n>.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const CLASSES = (args.get('only') ?? 'sorceress,druid,barbarian,paladin,amazon,assassin,necromancer').split(',');
const OUT = join(process.cwd(), 'test-results', 'e2e', 'skilltree');
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const cls of CLASSES) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(`HTTP ${res.status()} ${res.url()}`);
  });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForSelector('.charselect input, .charselect [data-act="modetype"], .charselect [data-act="mode"]', { timeout: 60000 });
  // choice of the mode first (lot 271): the first one, the session's default ruleset
  if (await page.$('.charselect [data-act="modetype"], .charselect [data-act="mode"]')) await pickFirstMode(page);
  await page.waitForSelector('.charselect input', { timeout: 60000 });
  await page.fill('.charselect input', `Arbre-${cls}`);
  await page.click(`.charselect .card.${cls}`);
  await page.click('.charselect .btn.primary');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 120000 });
  await page.evaluate(() => window.__arpg.setLevel(30));
  await page.waitForTimeout(500);
  await page.click('[data-testid="skills"]');
  await page.waitForTimeout(600);
  const tabs = page.locator('button', { hasText: /\(\d+\)$/ });
  const n = await tabs.count();
  check(n === 3, `${cls} : panneau ouvert, trois arbres`, `${n} onglets`);
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `${cls}-${i}.png`) });
  }
  check(errors.length === 0, `${cls} : aucune erreur`, [...new Set(errors)].slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
console.log(fails ? `ARBRES : ${fails} ÉCHEC(S)` : 'ARBRES OK');
process.exit(fails ? 1 : 0);
