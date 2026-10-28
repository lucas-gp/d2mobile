/**
 * Lot 304 (owner's screenshot of the home screen in portrait: "the buttons are misplaced against the image, the image is not big enough"):
 *   H1. portrait: the background fills the screen's height (no black band above or below), the logo inside the screen, whole;
 *   H2. portrait: the mode buttons under the title "Choose a game mode", in the lower part of the image, on it, centred, ≥ 44 px;
 *   H3. portrait: the small link buttons in the top-right corner, on the image, ≥ 44 px, never over the logo nor a mode button;
 *   H4. landscape and PC: the 800 × 600 stage as before (the buttons on it, no dock), every control inside the screen;
 *   0 page error. Screenshots of each size.
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/home-portrait.mjs [--url=http://127.0.0.1:5233/] [--shots=<dir>] [--lang=en] [--checks=0]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? 'http://127.0.0.1:5233/';
const SHOTS = args.get('shots') ?? '/tmp/home-portrait';
const LANG = args.get('lang') ?? 'en';
const CHECKS = args.get('checks') !== '0';
mkdirSync(SHOTS, { recursive: true });
const SIZES = {
  'portrait-360x640': { width: 360, height: 640, portrait: true },
  'portrait-412x915': { width: 412, height: 915, portrait: true },
  'tablet-portrait-768x1024': { width: 768, height: 1024, portrait: true },
  'landscape-844x390': { width: 844, height: 390 },
  'fold-folded-344x882': { width: 344, height: 882, portrait: true },
  'fold-open-884x1104': { width: 884, height: 1104, portrait: true },
  'fold-open-landscape-1104x884': { width: 1104, height: 884 },
  'pc-1440x900': { width: 1440, height: 900 },
};
let fails = 0;
const check = (ok, what, d = '') => {
  if (!CHECKS) return;
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await page.addInitScript((lang) => {
    if (!sessionStorage.getItem('e2e.init')) {
      localStorage.clear();
      localStorage.setItem('d2m.testchar.v1', '1');
      sessionStorage.setItem('e2e.init', '1');
    }
    localStorage.setItem('d2m.lang', lang);
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  }, LANG);
  await page.goto(URL);
  await page.waitForSelector('.d2c, .charselect', { timeout: 120000 });
  if (await page.$('.d2c')) await page.click('.d2c-skip');
  await page.waitForSelector('[data-act="modetype"], [data-act="mode"]', { timeout: 90000 });
  for (const [name, vp] of Object.entries(SIZES)) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(700);
    const m = await page.evaluate(() => {
      const r = (e) => {
        const b = e.getBoundingClientRect();
        return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) };
      };
      const box = document.querySelector('.charselect.d2s');
      const bg = document.querySelector('.d2s .d2bg');
      const logo = document.querySelector('.d2s [data-sprite="logo"]');
      const sub = document.querySelector('.d2s .d2t.sub');
      // lot 318: the first step's kinds (Normal, Survivals)
      const modes = [...document.querySelectorAll('[data-act="modetype"], [data-act="mode"]')];
      const links = [...document.querySelectorAll('.d2s .d2b.link')];
      const hit = (e) => {
        const b = e.getBoundingClientRect();
        const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return !!top && (top === e || e.contains(top));
      };
      return {
        W: innerWidth,
        H: innerHeight,
        docked: box.classList.contains('docked'),
        portraitMenu: box.classList.contains('pmenu'),
        bg: r(bg),
        logo: logo ? r(logo) : null,
        sub: sub ? r(sub) : null,
        modes: modes.map(r),
        links: links.map(r),
        hits: [...modes, ...links].every(hit),
        // the bands above and below the image: the same image blurred (no black band)
        fill: getComputedStyle(box, '::before').backgroundImage.includes('url'),
      };
    });
    await page.screenshot({ path: join(SHOTS, `${name}.png`) });
    const inside = (b) => b.l >= -1 && b.t >= -1 && b.r <= m.W + 1 && b.b <= m.H + 1;
    const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    if (vp.portrait) {
      const firstMode = Math.min(...m.modes.map((b) => b.t));
      const lastMode = Math.max(...m.modes.map((b) => b.b));
      check(
        m.fill && m.bg.h >= 0.6 * m.H && m.bg.b >= m.modes.at(-1).b,
        `H1 ${name}: the image ≥ 60 % of the height (${Math.round((100 * m.bg.h) / m.H)} %), prolonged blurred, the modes on it`,
        JSON.stringify(m.bg),
      );
      check(!!m.logo && m.logo.t >= 0 && m.logo.l >= -2 && m.logo.r <= m.W + 2, `H1 ${name}: the logo whole inside the screen`, JSON.stringify(m.logo));
      check(
        !!m.sub && m.sub.b <= firstMode && firstMode - m.sub.b < 60 && m.sub.t >= m.logo.b - 4 && lastMode <= m.H && m.modes.every((b) => b.h >= 44 && Math.abs((b.l + b.r) / 2 - m.W / 2) <= 2),
        `H2 ${name}: the modes under the title, centred, ≥ 44 px, inside the screen`,
        JSON.stringify({ sub: m.sub, modes: m.modes }),
      );
      check(
        Math.max(...m.links.map((b) => b.r)) >= m.W - 12 && m.links.every((b) => b.h >= 44 && inside(b) && b.b <= m.logo.t + 12 && m.modes.every((x) => !overlap(b, x))),
        `H3 ${name}: the links top right, ≥ 44 px, above the logo, never over a mode`,
        JSON.stringify(m.links),
      );
    } else {
      check(
        !m.docked && !m.portraitMenu && [...m.modes, ...m.links].every(inside),
        `H4 ${name}: the stage as before, every control inside`,
        JSON.stringify({ docked: m.docked, modes: m.modes.length }),
      );
    }
    check(m.hits, `H ${name}: every button reachable by a tap`);
  }
  check(errs.length === 0, '0 page error', errs.join(' | '));
} finally {
  await browser.close();
}
console.log(fails ? `${fails} failure(s)` : 'all good');
process.exit(fails ? 1 : 0);
