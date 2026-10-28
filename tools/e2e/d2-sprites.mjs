/**
 * Sprites importés de Diablo II : vérifie le remplacement (dossier présent) ou le repli (absent / désactivé).
 *   node tools/e2e/d2-sprites.mjs <imported|fallback> [--url=http://127.0.0.1:5233/] [--shots=<dossier>]
 * `revert` : une planche importée est corrompue → le jeu doit charger la planche d'origine à la place.
 * Le serveur vite est lancé à part (D2_OUTPUT_DIR=… npx vite pour « imported », D2_SPRITES=0 npx vite pour « fallback »).
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const mode = process.argv[2] ?? 'imported';
const args = new Map(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const SHOTS = args.get('shots');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const cls of (args.get('only') ?? 'paladin,sorceress').split(',')) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const page = await ctx.newPage();
  const errors = [];
  const d2 = { ok: 0, bad: 0 };
  const std = new Set();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !(mode === 'revert' && /Failed to load resource|Impossible/.test(m.text())) && errors.push(m.text()));
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('/d2/')) res.status() < 400 ? d2.ok++ : d2.bad++;
    else if (u.includes('/sprites/hi/') || u.includes('/sprites/lo/'))
      std.add(
        u
          .split('/')
          .pop()
          .replace(/(-s)?(-\d+)?\.(json|png)$/, ''),
      );
    if (res.status() >= 400) errors.push(`HTTP ${res.status()} ${u}`);
  });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForSelector('.charselect input, .charselect [data-act="modetype"], .charselect [data-act="mode"]', { timeout: 60000 });
  // choice of the mode first (lot 271): the first one, the session's default ruleset
  if (await page.$('.charselect [data-act="modetype"], .charselect [data-act="mode"]')) await pickFirstMode(page);
  await page.waitForSelector('.charselect input', { timeout: 60000 });
  await page.fill('.charselect input', `D2-${cls}`);
  await page.click(`.charselect .card.${cls}`);
  await page.click('.charselect .btn.primary');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 180000 });
  await page.evaluate(() => {
    const a = window.__arpg;
    a.setLevel(30, true);
    a.startRun('tristram', 0, 7);
    a.god(true);
    const w = a.game().world;
    const sp = w.pendingSpawns[0];
    if (sp) a.teleport(sp.x - sp.trigger + 1, sp.y);
    a.step(40);
    const m = w.aliveMonsters()[0];
    if (m) a.teleport(m.x - 4, m.y);
  });
  await page.waitForTimeout(2500);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${mode}-${cls}.png`) });
  if (mode === 'imported') {
    check(d2.ok > 0, `${cls} : planches D2 chargées`, `${d2.ok} fichiers /d2/`);
    check(d2.bad === 0, `${cls} : aucun échec /d2/`);
    check(!std.has(cls), `${cls} : la planche d'origine du personnage n'est pas chargée`, [...std].slice(0, 6).join(','));
  } else if (mode === 'revert') {
    check(std.has(cls), `${cls} : planche d'origine chargée après échec de la planche D2`, [...std].slice(0, 6).join(','));
  } else {
    check(d2.ok === 0 && d2.bad === 0, `${cls} : aucune requête /d2/`);
    check(std.has(cls), `${cls} : planche d'origine chargée`, [...std].slice(0, 6).join(','));
  }
  check(errors.length === 0, `${cls} : aucune erreur`, [...new Set(errors)].slice(0, 4).join(' | '));
  await ctx.close();
}
await browser.close();
console.log(fails ? `D2-SPRITES ${mode} : ${fails} ÉCHEC(S)` : `D2-SPRITES ${mode} OK`);
process.exit(fails ? 1 : 0);
