/**
 * Mode asked at launch (lot 271, formerly the ruleset choice at creation of lot M12): full build (not D2_PUBLIC) with the pd2 mod, real player screens.
 * The start screen offers "Project Diablo 2" and "Diablo II (original)"; picking the mode that is not the session's reloads the page
 * (remembered in `d2m.mode`) and opens its list (or the creation screen when it is empty); a character is created in the mode; each list
 * shows only its mode's characters; Exit goes back to the choice; a character of a missing ruleset (`pd3`) is greyed in the first mode,
 * never launched, kept byte for byte; no console error. Works with and without the Diablo II art (same `data-act` / `data-mode`).
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/ruleset-choice.mjs [--url=http://127.0.0.1:5233/]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HOME, listModes, openKind, pickMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const SHOTS = args.get('shots') ?? join(process.cwd(), 'test-results', 'e2e', 'ruleset-choice');
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 }, locale: 'fr-FR' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|GPU stall|swiftshader|WebGL|GroupMarker/i.test(m.text()) && errs.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message.slice(0, 200)}`));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e.init')) {
      localStorage.clear();
      // pas de personnage d'essai ajouté d'office : la liste ne contient que ceux du test
      localStorage.setItem('d2m.testchar.v1', '1');
      sessionStorage.setItem('e2e.init', '1');
    }
    localStorage.setItem('d2m.lang', 'fr');
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const ready = () => page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 240000 });
  const game = () => page.evaluate(() => ({ ruleset: window.__arpg.game().ruleset, name: window.__arpg.game().character.name }));
  const start = async () => {
    await page.waitForSelector('.d2c, .charselect', { timeout: 90000 });
    if (await page.$('.d2c')) await page.click('.d2c-skip');
    await page.waitForSelector(HOME, { timeout: 90000 });
  };
  /** Picks a mode; waits for its list or its creation screen (after the reload when needed) */
  const pick = async (mode) => {
    await pickMode(page, mode);
    await page.waitForSelector('.sel-slot, .d2input, .charselect input', { timeout: 120000 });
    await page.waitForTimeout(400);
  };
  const create = async (name) => {
    if (await page.$('.sel-slot')) await page.click('[data-act="create"]');
    await page.waitForSelector('.d2input, .charselect input');
    check(!(await page.$('[data-act="ruleset"]')), 'creation: no ruleset button any more');
    if (await page.$('.d2input')) {
      await page.fill('.d2input', name);
      await page.click('.d2b.ok');
    } else {
      await page.fill('.charselect input', name);
      await page.click('.charselect .card.sorceress');
      await page.click('.charselect .btn.primary');
    }
  };
  const listed = () => page.evaluate(() => [...document.querySelectorAll('.sel-slot')].map((x) => ({ slot: x.dataset.slot, text: x.textContent, off: x.classList.contains('off') })));

  await page.goto(URL);
  await start();
  // lot 318: the kind first (Normal, Survivals), then the game
  const modes = await listModes(page);
  // the content rulesets first, then the game modes present (lot 277: "Diablo II (original) — Survivals")
  check(
    modes.length >= 2 && /^pd2:Project Diablo 2/.test(modes[0]) && /^d2:Diablo II \(original\)/.test(modes[1]) && modes.slice(2).every((m) => /^[a-z0-9-]+\+[a-z0-9-]+:.+ — /.test(m)),
    'start screen asks the mode',
    modes.join(' | '),
  );
  await page.screenshot({ path: `${SHOTS}/1-modes.png` });

  // Diablo II (original): not the default session ruleset → reload, then its (empty) list = creation
  await pick('d2');
  check((await page.evaluate(() => localStorage.getItem('d2m.mode'))) === 'd2', 'mode remembered (d2m.mode)');
  await create('Vanille');
  await ready();
  const g1 = await game();
  check(g1.ruleset === 'd2' && g1.name === 'Vanille', 'created and played in d2', JSON.stringify(g1));
  await page.evaluate(() => window.__arpg.app.saveNow());

  // next launch: d2 remembered (marked); Project Diablo 2 → reload, creation there
  await page.reload();
  await start();
  check(await page.evaluate(() => document.querySelector('[data-type="normal"]').classList.contains('cur')), 'remembered mode: its kind marked at launch');
  await openKind(page, 'normal');
  check(await page.evaluate(() => document.querySelector('[data-mode="d2"]').classList.contains('cur')), 'remembered mode marked at launch');
  await pick('pd2');
  await create('Refonte');
  await ready();
  const g2 = await game();
  check(g2.ruleset === 'pd2' && g2.name === 'Refonte', 'created and played in pd2', JSON.stringify(g2));
  await page.evaluate(() => window.__arpg.app.saveNow());

  // each list shows only its mode's characters; Exit returns to the choice
  await page.reload();
  await start();
  await pick('pd2');
  const l1 = await listed();
  check(l1.length === 1 && /Refonte/.test(l1[0].text), 'Project Diablo 2 list: its character only', JSON.stringify(l1));
  await page.screenshot({ path: `${SHOTS}/2-liste-pd2.png` });
  await page.click('[data-act="exit"]');
  await page.waitForSelector(HOME);
  await pick('d2');
  const l2 = await listed();
  check(l2.length === 1 && /Vanille/.test(l2[0].text), 'Diablo II (original) list after the reload: its character only', JSON.stringify(l2));

  // character of a ruleset missing from this version: greyed in the first mode, never launched, kept as is
  const ghost = JSON.stringify({ version: 7, ruleset: 'pd3', savedAt: 1, character: { name: 'Fantome', classId: 'druid', level: 9 } });
  await page.evaluate((t) => localStorage.setItem('d2m.save.fantome', t), ghost);
  await page.reload();
  await start();
  await pick('pd2');
  const items = await listed();
  check(items.length === 2, 'two characters listed in Project Diablo 2', JSON.stringify(items).slice(0, 300));
  check(!!items.find((x) => x.slot === 'd2m.save.fantome')?.off, 'pd3 character greyed');
  await page.click('[data-slot="d2m.save.fantome"]');
  const reason = await page.evaluate(() => document.querySelector('.charselect')?.textContent ?? '');
  check(/pd3/.test(reason), 'reason shown', reason.slice(0, 160));
  await page.dblclick('[data-slot="d2m.save.fantome"]').catch(() => undefined);
  await page.waitForTimeout(1500);
  check(!(await page.evaluate(() => !!window.__arpg)), 'it does not launch');
  check((await page.evaluate(() => localStorage.getItem('d2m.save.fantome'))) === ghost, 'save intact');
  check(errs.length === 0, '0 console error', errs.join(' | '));
} finally {
  await browser.close();
}
console.log(fails ? `${fails} échec(s)` : 'OK');
process.exit(fails ? 1 : 0);
