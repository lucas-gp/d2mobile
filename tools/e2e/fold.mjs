/**
 * Galaxy Z Fold (et pliables) : écran « tournez l'appareil » et cibles tactiles des panneaux, plié et déplié, en portrait et en paysage.
 *   node tools/e2e/fold.mjs [--url=http://127.0.0.1:5233/] [--sizes=fold-plie-portrait,...] [--shots=dossier]
 *
 * Tailles en px CSS (intérieur de la fenêtre, à confirmer sur l'appareil : elles dépendent du modèle, de la barre d'adresse et du mode
 * plein écran). Pour chaque taille, en partie (personnage de test) :
 *  1. l'écran « tournez l'appareil » ne s'affiche que sur un écran étroit et allongé en portrait (téléphone plié), jamais sur l'écran
 *     intérieur presque carré ni en paysage ;
 *  2. panneau d'inventaire ouvert : chaque onglet du haut et le bouton de fermeture reçoivent le toucher sur au moins 44 × 44 px
 *     (mesuré par `elementFromPoint`, donc après les règles de spécificité, le découpage `overflow` et les zones élargies) ;
 *  3. captures : en partie, panneau ouvert.
 *  4. (lot 272) écran de sélection des personnages façon Diablo II, avec 12 personnages (défilement) : chaque emplacement visible, les
 *     flèches de défilement et les boutons du bas (Créer, Supprimer, Quitter, OK) reçoivent le toucher sur au moins 44 × 44 px, les
 *     emplacements sont rangés en 2 colonnes × 4 rangées ; captures du menu (choix du mode) et de la sélection.
 * Code de sortie 1 si un contrôle échoue.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const SHOTS = args.get('shots') ?? join(process.cwd(), 'test-results', 'e2e', 'fold');

/** rotate : l'écran « tournez l'appareil » est attendu */
export const FOLD_SIZES = {
  'fold-plie-portrait': { width: 344, height: 882, dpr: 3, rotate: true },
  'fold-plie-paysage': { width: 882, height: 344, dpr: 3, rotate: false },
  'fold-ouvert-portrait': { width: 884, height: 1104, dpr: 2.4, rotate: false },
  'fold-ouvert-paysage': { width: 1104, height: 884, dpr: 2.4, rotate: false },
  // anciens Fold (écran intérieur plus étroit en px CSS) : presque carré, doit rester jouable
  'fold-ancien-ouvert-portrait': { width: 673, height: 841, dpr: 2.6, rotate: false },
};
const MIN_TARGET = 44;

const wanted = args.has('sizes') ? args.get('sizes').split(',') : Object.keys(FOLD_SIZES);
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failures = 0;
const check = (ok, name, what, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} [${name}] ${what}${detail ? ` — ${detail}` : ''}`);
};

for (const name of wanted) {
  const dev = FOLD_SIZES[name];
  const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('d2m.lang', 'fr');
    // personnages de liste (jamais lancés) : plus de 8, pour le défilement
    const cls = ['amazon', 'necromancer', 'barbarian', 'paladin', 'druid', 'assassin'];
    for (let i = 0; i < 11; i++) localStorage.setItem(`d2m.save.fold${i}`, JSON.stringify({ savedAt: 1 + i, ruleset: 'pd2', character: { name: `Fold${i}`, level: 10 + i, classId: cls[i % 6] } }));
    // écrans de départ réels (sélection de personnage) au lieu de l'entrée directe en partie des navigateurs automatisés
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  await page.goto(URL + '?testchar=1');
  await page.waitForSelector('.charselect.d2s', { timeout: 90000 });
  await page.screenshot({ path: join(SHOTS, `${name}-menu.png`) });
  await pickFirstMode(page);
  await page.waitForSelector('.d2plate');
  await page.waitForTimeout(500);
  const sel = await page.evaluate(() => {
    const out = [];
    const span = (el, cx, cy, horiz) => {
      let n = 0;
      for (let d = -40; d <= 40; d++) {
        const x = horiz ? cx + d : cx;
        const y = horiz ? cy : cy + d;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) n++;
      }
      return n;
    };
    for (const el of document.querySelectorAll('.charlist .sel-slot, .charlist .sel-btn, .charlist .sel-arrow')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      out.push({
        label: (el.dataset.act || el.dataset.slot || '').replace('d2m.save.', ''),
        box: `${Math.round(r.width)}×${Math.round(r.height)}`,
        w: span(el, cx, cy, true),
        h: span(el, cx, cy, false),
      });
    }
    const slots = [...document.querySelectorAll('.charlist .sel-slot')].map((e) => e.getBoundingClientRect());
    const cols = new Set(slots.map((r) => Math.round(r.left))).size;
    const rows = new Set(slots.map((r) => Math.round(r.top))).size;
    return { out, cols, rows, n: slots.length, layout: document.querySelector('.charlist')?.className };
  });
  check(sel.n === 8 && sel.cols === 2 && sel.rows === 4, name, 'sélection : 8 emplacements en 2 colonnes × 4 rangées', `${sel.n} (${sel.cols}×${sel.rows}), ${sel.layout}`);
  for (const t of sel.out) check(t.w >= MIN_TARGET && t.h >= MIN_TARGET, name, `sélection : cible « ${t.label} » ≥ ${MIN_TARGET} px`, `boîte ${t.box}, toucher ${t.w}×${t.h}`);
  await page.screenshot({ path: join(SHOTS, `${name}-selection.png`) });
  // the test character is the last of the list: scroll down to it (▼)
  for (let i = 0; i < 6 && !(await page.$('.d2plate:has-text("99")')); i++) await page.click('[data-act="down"]');
  await page.click('.d2plate:has-text("99")');
  await page.click('.d2b.ok');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 180000 });
  await page.waitForFunction(() => document.documentElement.classList.contains('in-game'));

  const rotateShown = await page.evaluate(() => getComputedStyle(document.querySelector('.rotate')).display !== 'none');
  check(rotateShown === dev.rotate, name, `écran « tournez l'appareil » ${dev.rotate ? 'affiché' : 'absent'}`, `${dev.width}×${dev.height}, affiché : ${rotateShown}`);
  await page.screenshot({ path: join(SHOTS, `${name}-jeu.png`) });
  if (dev.rotate) {
    await ctx.close();
    continue;
  }

  await page.evaluate(() => window.__arpg.app.openPanel('inventory'));
  await page.waitForSelector('.panel.d2 header .close');
  await page.waitForFunction(() => document.querySelectorAll('.panel.d2 header .tabs .btn').length > 0);
  // zone qui reçoit le toucher : balayage autour du centre de l'élément, horizontal et vertical
  const targets = await page.evaluate(() => {
    const out = [];
    const span = (el, cx, cy, horiz) => {
      let n = 0;
      for (let d = -40; d <= 40; d++) {
        const x = horiz ? cx + d : cx;
        const y = horiz ? cy : cy + d;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) n++;
      }
      return n;
    };
    for (const el of document.querySelectorAll('.panel.d2 header .tabs .btn, .panel.d2 header .close')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      out.push({ label: (el.textContent || 'fermer').trim().slice(0, 14), box: `${Math.round(r.width)}×${Math.round(r.height)}`, w: span(el, cx, cy, true), h: span(el, cx, cy, false) });
    }
    return out;
  });
  for (const t of targets) check(t.w >= MIN_TARGET && t.h >= MIN_TARGET, name, `cible « ${t.label} » ≥ ${MIN_TARGET} px`, `boîte ${t.box}, toucher ${t.w}×${t.h}`);
  await page.screenshot({ path: join(SHOTS, `${name}-inventaire.png`) });
  check(errors.length === 0, name, 'aucune erreur de page', errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} contrôle(s) en échec` : 'tout est bon');
process.exit(failures ? 1 : 0);
