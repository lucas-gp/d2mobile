/**
 * Écran de sélection des personnages (affiché à chaque lancement pour un vrai joueur ; les tests
 * pilotés le sautent, on le force ici) : création (classe + pseudo), liste, reprise, deux
 * personnages, reprise d'une ancienne sauvegarde à la clé historique.
 *   node tools/e2e/charselect.mjs [--url=http://127.0.0.1:5233/]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = join(process.cwd(), 'test-results', 'e2e', 'charselect');
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
// un vrai joueur : l'écran de sélection n'est pas sauté
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const ready = () => page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 120000 });
const who = () => page.evaluate(() => ({ name: window.__arpg.game().character.name, cls: window.__arpg.game().character.classId, level: window.__arpg.game().character.level }));

// l'écran D2 (menu → sélection → création) quand l'import est présent, sinon l'écran d'origine du jeu
const isD2 = () => page.evaluate(() => !!document.querySelector('.charselect.d2s'));
const stageK = () =>
  page.evaluate(() => {
    const r = document.querySelector('.d2stage').getBoundingClientRect();
    return { l: r.left, t: r.top, k: r.width / 800 };
  });
/** Crée un personnage depuis l'écran affiché (menu D2 : « Un joueur », puis « Nouveau personnage » s'il y a déjà une liste) */
async function createChar(name, cls) {
  if (await isD2()) {
    await pickFirstMode(page);
    await page.waitForTimeout(600);
    if (!(await page.$('.d2input'))) {
      await page.click('[data-act="create"]');
      await page.waitForTimeout(600);
    }
    // toucher le personnage de la classe : pieds approximatifs (scène 800 × 600)
    const feet = { sorceress: [300, 470], barbarian: [512, 470], paladin: [505, 380], druid: [603, 420], amazon: [405, 370], assassin: [205, 420], necromancer: [305, 380] }[cls];
    const k = await stageK();
    await page.mouse.click(k.l + feet[0] * k.k, k.t + feet[1] * k.k);
    await page.waitForTimeout(300);
    await page.fill('.d2input', name);
    await page.click('.d2b.ok');
  } else {
    // choice of the mode first (lot 271): the first one, the default ruleset of the session
    if (await page.$('[data-act="modetype"], [data-act="mode"]')) await pickFirstMode(page);
    if (await page.$('.charselect .char')) await page.click('[data-act="create"]');
    await page.fill('.charselect input', name);
    await page.click(`.charselect .card.${cls}`);
    await page.click('.charselect .btn.primary');
  }
}
async function openList() {
  await page.waitForSelector('.charselect');
  if (await isD2()) {
    await pickFirstMode(page);
    await page.waitForSelector('.d2plate');
  } else {
    if (await page.$('[data-act="modetype"], [data-act="mode"]')) await pickFirstMode(page);
    await page.waitForSelector('.charselect .char');
  }
}
const listed = () => page.evaluate(() => [...document.querySelectorAll('.d2plate, .charselect .char')].map((x) => x.textContent));

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.goto(URL);
await page.waitForSelector('.charselect', { timeout: 60000 });
const d2 = await isD2();
console.log(d2 ? 'écrans D2 (menu, sélection, création)' : 'écran d’origine du jeu (sans import D2)');
if (d2) {
  check(!!(await page.$('.d2b.main')), 'menu principal : « Un joueur » et « Crédits »');
  await page.screenshot({ path: join(OUT, '0-menu.png') });
}
await createChar('Aldric', 'druid');
await ready();
let w = await who();
check(w.name === 'Aldric' && w.cls === 'druid', 'Druide « Aldric » créé et chargé', JSON.stringify(w));

await page.goto(URL);
await page.waitForSelector('.charselect');
if (d2) {
  await pickFirstMode(page);
  await page.waitForSelector('.d2plate');
  await page.click('[data-act="create"]');
  await page.waitForSelector('.d2input');
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(OUT, '1-creation.png') });
  await page.goBack().catch(() => {});
}
await page.goto(URL);
await page.waitForSelector('.charselect');
await createChar('Morgane', 'sorceress');
await ready();
await page.evaluate(() => {
  window.__arpg.setLevel(20);
  window.__arpg.app.saveNow();
});
w = await who();
check(w.name === 'Morgane' && w.cls === 'sorceress', 'second personnage « Morgane » (Sorcière)', JSON.stringify(w));

await page.goto(URL);
await openList();
await page.waitForTimeout(2500);
const cards = await listed();
await page.screenshot({ path: join(OUT, '2-liste.png') });
check(cards.length === 2 && /Morgane/.test(cards[0]) && /(niveau|niv\.|level) ?20/i.test(cards[0]), 'liste : deux personnages, le dernier joué en premier', cards.join(' | '));
await page.click(d2 ? '.d2plate:has-text("Aldric")' : '.charselect .char.druid');
await page.click(d2 ? '.d2b.ok' : '.charselect .btn.primary');
await ready();
w = await who();
check(w.name === 'Aldric' && w.level === 1, 'reprise du Druide choisi', JSON.stringify(w));

// ancienne sauvegarde (une par classe, clé historique) : reprise dans la liste
await page.evaluate(() => {
  const t = localStorage.getItem(localStorage.getItem('d2m.active'));
  const d = JSON.parse(t);
  d.character.name = 'Ancienne';
  localStorage.setItem('d2m.save', JSON.stringify(d));
});
await page.goto(URL);
await openList();
const n = (await listed()).length;
check(n === 3, 'une sauvegarde à la clé historique apparaît dans la liste', `${n} personnages`);
check(errors.length === 0, 'aucune erreur JavaScript', errors.join(' | '));
await browser.close();
console.log(fails ? `ÉCRAN DE SÉLECTION : ${fails} ÉCHEC(S)` : 'ÉCRAN DE SÉLECTION OK');
process.exit(fails ? 1 : 0);
