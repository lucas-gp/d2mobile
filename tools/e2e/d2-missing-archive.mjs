/**
 * MPQ manquants un par un : on fournit d2data + d2exp seulement, l'écran d'import nomme l'archive manquante (d2char.mpq), on l'ajoute seule,
 * le jeu démarre et les classes se génèrent ; Réglages : « Archives requises » avec statut par ligne.
 *   D2_SPRITES=0 D2_PUBLIC=1 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/d2-missing-archive.mjs
 */
import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pickFirstMode } from './pick-mode.mjs';

const URL = process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const IN = join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 840, height: 360 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  try {
    localStorage.setItem('d2m.lang', 'en');
  } catch {}
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await page.goto(URL);
await page.evaluate(async () => {
  localStorage.clear();
  localStorage.setItem('d2m.lang', 'en');
  for (const k of await caches.keys()) await caches.delete(k);
  try {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
  } catch {}
});
await page.goto(URL);
await page.waitForSelector('.d2c', { timeout: 60000 });

// 1. d2char oublié : l'écran le nomme
let [fc] = await Promise.all([page.waitForEvent('filechooser'), page.tap('.d2c-card .btn.primary')]);
await fc.setFiles([join(IN, 'd2data.mpq'), join(IN, 'd2exp.mpq')]);
await page.waitForFunction(() => /d2char\.mpq/.test(document.querySelector('.d2c-card')?.innerText ?? ''), null, { timeout: 60000 });
const t1 = await page.evaluate(() => document.querySelector('.d2c-card').innerText);
check(/Missing file: d2char\.mpq/.test(t1), 'import sans d2char : « Missing file: d2char.mpq »');
check(!(await page.evaluate(() => !!document.querySelector('.charselect'))), 'le jeu ne démarre pas sans archive requise');

// 2. on ajoute SEULEMENT d2char (les deux autres sont mémorisés)
const btn = await page.evaluate(() => [...document.querySelectorAll('.d2c-card .btn')].map((b) => b.textContent));
check(btn.includes('Add the missing files…'), 'bouton « Add the missing files… »', btn.join(' | '));
[fc] = await Promise.all([page.waitForEvent('filechooser'), page.tap('.d2c-card .btn.primary')]);
await fc.setFiles([join(IN, 'd2char.mpq')]);
await page.waitForSelector('.charselect.d2s', { timeout: 600000 });
check(true, 'd2char ajouté seul : le jeu démarre (écran D2)');
await pickFirstMode(page, { tap: true });
await page.waitForTimeout(1200);
await page.fill('.d2input', 'Miss');
await page.tap('.d2b.ok');
await page.waitForFunction(() => window.__arpg, null, { timeout: 600000 });
await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 600000 });
const cls = await page.evaluate(() => {
  const L = window.__d2local;
  return { ready: L.assetReady('sorceress', 'hi') || L.assetReady('sorceress', 'lo'), files: L.fileInfo().map((f) => f.name) };
});
check(cls.ready, 'la classe se génère ensuite (planche sorceress prête)', cls.files.join(','));

// 3. Réglages : archives requises par ligne
await page.evaluate(() => {
  localStorage.setItem('d2m.settings.cat', 'advanced');
  window.__arpg.app.panels.hide();
  window.__arpg.app.panels.show('settings');
});
await page.waitForSelector('.d2l-recap', { timeout: 30000 });
await page.waitForFunction(() => !/Working out/.test(document.querySelector('.d2l-recap')?.innerText ?? ''), null, { timeout: 180000 });
const rows = await page.evaluate(() =>
  Object.fromEntries([...document.querySelectorAll('.d2l-recap .d2l-row')].map((r) => [r.querySelector('span')?.textContent ?? '', r.innerText.replace(/\n/g, ' | ')])),
);
const cl = rows['Character — Sorceress'] ?? '';
check(/Required archives: d2data\.mpq ✓ · d2char\.mpq ✓/.test(cl), 'classe : « Required archives: d2data ✓ · d2char ✓ »', cl.slice(0, 160));
const ui = rows['Interface'] ?? '';
check(/Required archives: d2data\.mpq ✓ · d2exp\.mpq ✓/.test(ui), 'interface : d2data ✓ · d2exp ✓');
const snd = rows['Sounds and music'] ?? '';
check(/d2sfx\.mpq ✗ — sound effects/.test(snd) && /d2music\.mpq ✗ — music/.test(snd), 'sons : archives facultatives non ajoutées, ce qu’elles apportent', snd.slice(0, 200));
const mp = Object.entries(rows).find(([k]) => /^Maps — Act I$/.test(k))?.[1] ?? '';
check(/Optional: Patch_D2\.mpq ✗ — monsters placed on maps/.test(mp), 'cartes : Patch_D2 facultatif, non ajouté');
check(errs.length === 0, 'aucune erreur de page', errs.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} échec(s)` : '\nOK');
process.exit(fails ? 1 : 0);
