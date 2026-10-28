/**
 * Import de personnages Diablo II (.d2s) depuis l'écran de sélection, sur mobile : fenêtre d'import, fichier choisi (input), rapport,
 * personnage ajouté à la liste (aucun écrasé), reprise du personnage importé en jeu.
 *   node tools/e2e/d2import.mjs [--url=http://127.0.0.1:5233/]
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = join(process.cwd(), 'test-results', 'e2e', 'd2import');
mkdirSync(OUT, { recursive: true });
const sample = join(mkdtempSync(join(tmpdir(), 'd2s-')), 'Zorg.d2s');
execFileSync('npx', ['tsx', 'tools/d2s/make-sample.ts', sample], { stdio: 'inherit' });

let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
// textes français : les vérifications cherchent les phrases d'origine
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('d2m.lang', 'fr');
  } catch {}
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const isD2 = () => page.evaluate(() => !!document.querySelector('.charselect.d2s'));

// lot 286: the import is hidden on the start screens for now (src/platform/build-flags.ts, D2_IMPORT_OFFERED); `?d2import=1` shows it
const IMPORT_URL = `${URL}${URL.includes('?') ? '&' : '?'}d2import=1`;
await page.goto(IMPORT_URL);
await page.evaluate(() => localStorage.clear());
await page.goto(IMPORT_URL);
await page.waitForSelector('.charselect', { timeout: 60000 });
const d2 = await isD2();
console.log(d2 ? 'écrans D2' : 'écran d’origine du jeu');
// bouton d'import : menu D2 (« Importer un personnage D2 ») ou écran de création sans personnage
if (d2) check(!!(await page.$('.d2b.imp')), 'menu : bouton « Importer un personnage D2 »');
await page.screenshot({ path: join(OUT, '0-ecran.png') });
await page.click(d2 ? '.d2b.imp' : '.charselect .btn:has-text("Importer un personnage D2")');
await page.waitForSelector('.d2imp');
check(!!(await page.$('.d2imp input[type=file][multiple]')), 'fenêtre d’import avec sélecteur de fichiers multiples');
const acc = await page.$eval('.d2imp input[type=file]', (i) => i.accept);
check(/\.d2s/.test(acc), 'filtre .d2s', acc);
await page.screenshot({ path: join(OUT, '1-fenetre.png') });
await page.setInputFiles('.d2imp input[type=file]', sample);
await page.waitForSelector('.d2imp-card.ok', { timeout: 30000 });
const card = await page.$eval('.d2imp-card', (c) => c.textContent);
check(/Zorg — Sorcière — niveau 80/.test(card), 'rapport : personnage importé', card.slice(0, 90));
check(/Objets importés : \d+/.test(card), 'rapport : objets importés');
await page.screenshot({ path: join(OUT, '2-rapport.png') });
// un fichier invalide donne une erreur lisible, sans rien ajouter
await page.setInputFiles('.d2imp input[type=file]', { name: 'bad.d2s', mimeType: 'application/octet-stream', buffer: Buffer.alloc(2000) });
await page.waitForSelector('.d2imp-card.bad', { timeout: 15000 });
check(true, 'fichier invalide : message d’erreur');
await page.click('.d2imp .btn.big');
await page.waitForSelector('.d2imp', { state: 'detached' });
if (d2) await page.waitForSelector('.d2plate');
const names = await page.evaluate(() => [...document.querySelectorAll('.d2plate, .charselect .char')].map((x) => x.textContent));
check(
  names.some((n) => /Zorg/.test(n)),
  'liste : « Zorg » ajouté',
  JSON.stringify(names),
);
await page.screenshot({ path: join(OUT, '3-liste.png') });
const saves = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^d2m\.save(\.|$)/.test(k) && !k.endsWith('.backup')).length);
check(saves === 1, 'un seul emplacement créé (le fichier invalide n’ajoute rien)', String(saves));
// reprise en jeu
if (d2) await page.click('.d2b.ok');
else await page.click('.charselect .btn.primary');
await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 120000 });
const w = await page.evaluate(() => {
  const c = window.__arpg.game().character;
  return { name: c.name, level: c.level, gold: c.gold, mh: c.equipment.mainhand?.runeword };
});
check(w.name === 'Zorg' && w.level === 80 && w.gold === 4321 && w.mh === 'rw_spirit', 'personnage importé jouable : niveau 80, or, Esprit', JSON.stringify(w));
check(errors.length === 0, 'aucune erreur JavaScript', errors.join(' | '));
await browser.close();
console.log(fails ? `${fails} échec(s)` : 'tout est vert');
process.exit(fails ? 1 : 0);
