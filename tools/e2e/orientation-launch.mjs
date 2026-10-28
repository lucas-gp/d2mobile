/**
 * Orientation at the launch of a Survivals game (lot 290, owner's Galaxy Z Fold: "the screen still flips between landscape and portrait
 * when I start a game"). A phone held upright (then on its side) goes from the home screen to a run as the owner does: the first touch of
 * the menu, the mode chosen (another ruleset's session: the page reloads into Survivals), the character created, the run started; then
 * the app launched again straight into Survivals and the character resumed. Recorded all along (init script): the orientation locks and
 * unlocks asked of the screen, the fullscreen requests, the window's resizes, the "rotate" prompt shown, the renderer's canvas size.
 * Checks: in Survivals the screen is never locked (nor unlocked: nothing to undo), no resize and no "rotate" prompt from the menu's
 * last touch to the run nor at the game's first touch, the fullscreen asked on the menus (never as the run begins), the canvas the window's size
 * at once. The base game (d2) still locks landscape, once its game is on screen (never on the menus).
 *   npx vite --host 127.0.0.1 --port 5234 --strictPort
 *   node tools/e2e/orientation-launch.mjs [--url=http://127.0.0.1:5234/] [--shots=…]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5234/';
const SHOTS = args.get('shots') ?? join(process.cwd(), 'test-results', 'e2e', 'orientation');
mkdirSync(SHOTS, { recursive: true });

let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

/** The journal of a page (kept in sessionStorage across the reloads of a ruleset switch) */
const journal = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('e2e.journal') ?? '[]'));
const mark = (page, what) => page.evaluate((w) => window.__note?.(w), what);

async function flow(viewport, tag, firstMode) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await page.addInitScript((mode) => {
    if (!sessionStorage.getItem('e2e.init')) {
      localStorage.clear();
      localStorage.setItem('d2m.testchar.v1', '1');
      // the session the owner comes from: another ruleset's (the mode switch reloads the page) or Survivals already
      if (mode) localStorage.setItem('d2m.mode', mode);
      sessionStorage.setItem('e2e.init', '1');
    }
    localStorage.setItem('d2m.lang', 'fr');
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    const log = JSON.parse(sessionStorage.getItem('e2e.journal') ?? '[]');
    const note = (kind, extra = {}) => {
      log.push({ t: Math.round(performance.now()), kind, w: innerWidth, h: innerHeight, inGame: !!document.documentElement?.classList.contains('in-game'), ...extra });
      sessionStorage.setItem('e2e.journal', JSON.stringify(log));
    };
    window.__note = note;
    note('page');
    Element.prototype.requestFullscreen = () => (note('fullscreen'), Promise.resolve());
    if (screen.orientation) {
      screen.orientation.lock = (o) => (note(`lock:${o}`), Promise.resolve());
      screen.orientation.unlock = () => note('unlock');
    }
    addEventListener('resize', () => note('resize'));
    addEventListener('orientationchange', () => note('orientationchange'));
    const seen = { rotate: false };
    const watch = () => {
      const r = document.querySelector('.rotate');
      const shown = !!r && getComputedStyle(r).display !== 'none';
      if (shown !== seen.rotate) {
        seen.rotate = shown;
        note(shown ? 'rotate-shown' : 'rotate-hidden');
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }, firstMode);
  await page.goto(URL);
  await page.waitForSelector('.d2c, .charselect', { timeout: 120000 });
  if (await page.$('.d2c')) await page.click('.d2c-skip');
  await page.waitForSelector('[data-act="modetype"], [data-act="mode"]', { timeout: 90000 });
  // the owner's first touch on the menu (the fullscreen is asked then)
  await page.touchscreen.tap(viewport.width / 2, 8);
  await page.waitForTimeout(300);
  await mark(page, 'menu-touched');
  await pickMode(page, 'd2+survivals');
  await page.waitForSelector('.sel-slot, .d2input', { timeout: 120000 });
  await page.waitForTimeout(400);
  // after a reload (ruleset switch), the first touch again
  await page.touchscreen.tap(viewport.width / 2, 8);
  await page.waitForTimeout(300);
  if (await page.$('.sel-slot')) await page.click('[data-act="create"]');
  await page.waitForSelector('.d2input');
  await page.fill('.d2input', `Ori${tag.slice(0, 4)}`);
  await mark(page, 'create');
  await page.click('.d2b.ok');
  await page.waitForFunction(() => window.__arpg && window.__arpg.game().world.zone.id === 'survivals:a1r1' && !document.querySelector('.loading'), null, { timeout: 240000 });
  await page.waitForTimeout(2500);
  // the first touch of the game (the joystick): the fullscreen was asked on the menus already, nothing happens to the screen now
  await page.touchscreen.tap(viewport.width / 2, viewport.height * 0.7);
  await page.waitForTimeout(1500);
  await mark(page, 'run');
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), iw: innerWidth, ih: innerHeight };
  });
  await page.screenshot({ path: join(SHOTS, `${tag}-run.png`) });
  const j = await journal(page);
  const from = j.findIndex((e) => e.kind === 'create');
  const launch = j.slice(from);
  const all = j.map((e) => e.kind);
  check(!all.some((k) => k.startsWith('lock:')) && !all.includes('unlock'), `${tag}: the screen never locked nor unlocked (menu, mode, creation, run)`, all.join(' '));
  check(!launch.some((e) => e.kind === 'resize' || e.kind === 'orientationchange'), `${tag}: no resize from the creation to the run`, JSON.stringify(launch.filter((e) => e.kind !== 'page')));
  check(!all.includes('rotate-shown'), `${tag}: the "rotate" prompt never shown`);
  check(all.includes('fullscreen') && !launch.some((e) => e.kind === 'fullscreen'), `${tag}: fullscreen asked on the menus, never at the launch nor at the game's first touch`, all.join(' '));
  check(Math.abs(canvas.w - canvas.iw) <= 1 && Math.abs(canvas.h - canvas.ih) <= 1, `${tag}: the canvas the window's size`, JSON.stringify(canvas));
  // the app launched again (Survivals remembered), the character resumed from the list
  await page.evaluate(() => sessionStorage.setItem('e2e.journal', '[]'));
  await page.reload();
  await page.waitForSelector('.d2c, .charselect', { timeout: 120000 });
  if (await page.$('.d2c')) await page.click('.d2c-skip');
  await page.waitForSelector('[data-act="modetype"], [data-act="mode"], .sel-slot', { timeout: 90000 });
  await page.touchscreen.tap(viewport.width / 2, 8);
  await page.waitForTimeout(300);
  if (!(await page.$('.sel-slot'))) await pickMode(page, 'd2+survivals');
  await page.waitForSelector('.sel-slot', { timeout: 120000 });
  await page.waitForTimeout(400);
  await page.dblclick('.sel-slot');
  await page
    .waitForFunction(() => window.__arpg && !document.querySelector('.loading') && !!document.documentElement?.classList.contains('in-game'), null, { timeout: 120000 })
    .catch(async () => {
      await page.screenshot({ path: join(SHOTS, `${tag}-resume-stuck.png`) });
      console.log(
        'resume stuck',
        await page.evaluate(() => ({ cls: document.documentElement.className, loading: !!document.querySelector('.loading'), arpg: !!window.__arpg, body: document.body.innerText.slice(0, 300) })),
      );
    });
  await page.touchscreen.tap(viewport.width / 2, viewport.height * 0.7);
  await page.waitForTimeout(2500);
  await mark(page, 'resumed');
  const jj = await journal(page);
  check(
    jj.some((e) => e.inGame),
    `${tag}: the character resumed`,
  );
  const j2 = jj.map((e) => e.kind);
  // (a resize before the game, as the page boots, is the browser's own: none once the game is on screen)
  check(
    !j2.some((k) => k.startsWith('lock:')) && !j2.includes('unlock') && !jj.some((e) => e.kind === 'resize' && e.inGame) && !j2.includes('rotate-shown'),
    `${tag}: relaunched and resumed, no lock, resize nor prompt`,
    j2.join(' '),
  );
  await page.screenshot({ path: join(SHOTS, `${tag}-resumed.png`) });
  check(errs.length === 0, `${tag}: 0 page error`, errs.join(' | '));
  await ctx.close();
}

/** The base game still locks landscape, once its game is on screen (never on the menus) */
async function base() {
  const viewport = { width: 390, height: 844 };
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e.init')) {
      localStorage.clear();
      localStorage.setItem('d2m.testchar.v1', '1');
      localStorage.setItem('d2m.mode', 'd2');
      sessionStorage.setItem('e2e.init', '1');
    }
    localStorage.setItem('d2m.lang', 'fr');
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.__locks = JSON.parse(sessionStorage.getItem('e2e.locks') ?? '[]');
    const keep = (k) => (
      window.__locks.push(`${k}${document.documentElement?.classList.contains('in-game') ? '@game' : '@menu'}`),
      sessionStorage.setItem('e2e.locks', JSON.stringify(window.__locks))
    );
    Element.prototype.requestFullscreen = () => Promise.resolve();
    screen.orientation.lock = (o) => (keep(o), Promise.resolve());
    screen.orientation.unlock = () => keep('unlock');
  });
  await page.goto(URL);
  await page.waitForSelector('.d2c, .charselect', { timeout: 120000 });
  if (await page.$('.d2c')) await page.click('.d2c-skip');
  await page.waitForSelector('[data-act="modetype"], [data-act="mode"]', { timeout: 90000 });
  await page.touchscreen.tap(viewport.width / 2, 8);
  await page.waitForTimeout(300);
  const menu = await page.evaluate(() => [...window.__locks]);
  check(menu.length === 0, 'd2: the menu never locks the screen (read upright)', menu.join(' '));
  await pickMode(page, 'd2');
  await page.waitForSelector('.sel-slot, .d2input', { timeout: 120000 });
  await page.touchscreen.tap(viewport.width / 2, 8);
  if (await page.$('.sel-slot')) await page.click('[data-act="create"]');
  await page.waitForSelector('.d2input');
  await page.fill('.d2input', 'Base');
  await page.click('.d2b.ok');
  await page.waitForFunction(() => window.__arpg && window.__arpg.game?.() && !document.querySelector('.loading'), null, { timeout: 240000 });
  await page.waitForTimeout(1500);
  const game = await page.evaluate(() => [...window.__locks]);
  check(game.includes('landscape@game'), 'd2: its game locks landscape once on screen', game.join(' '));
  await ctx.close();
}

try {
  for (const [vp, tag] of process.env.ONLY
    ? [[{ width: 390, height: 844 }, 'portrait-from-pd2']]
    : [
        [{ width: 390, height: 844 }, 'portrait-from-pd2'],
        [{ width: 844, height: 390 }, 'landscape-from-pd2'],
        [{ width: 344, height: 882 }, 'fold-folded-from-d2'],
        [{ width: 884, height: 1104 }, 'fold-open-survivals'],
      ])
    await flow(vp, tag, tag.endsWith('pd2') ? 'pd2' : tag.endsWith('d2') ? 'd2' : 'd2+survivals');
  await base();
} finally {
  await browser.close();
}
console.log(fails ? `${fails} échec(s)` : 'OK');
process.exit(fails ? 1 : 0);
