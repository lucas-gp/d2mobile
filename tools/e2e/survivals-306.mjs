/**
 * Lot 306, the Run's act screen (Survivals), in a browser (the dev server with the D2 graphics):
 *   A. the hub's "Choose the act" opens the act screen: one card an act, Act I expanded (its five zones, its monsters, the timeline of its
 *      timed bosses, the records), the closed acts greyed with their condition, a closed act previewed by a tap, the button "Enter Act I"
 *      always in sight; in portrait (412 × 915: one column, no horizontal scroll), landscape (915 × 412: two columns) and on a desktop
 *      (1280 × 720); the button starts the run;
 *   0 page error. A capture of each step and size in `--shots`.
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/survivals-306.mjs [--url=http://127.0.0.1:5233/] [--shots=<dir>] [--lenient=1]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? 'http://127.0.0.1:5233/';
const SHOTS = args.get('shots') ?? '/tmp/survivals-306';
// before the lot's changes: captures only, the checks reported but not failing
const LENIENT = args.get('lenient') === '1';
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok && !LENIENT) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const SIZES = [
  ['portrait', { width: 412, height: 915 }],
  ['landscape', { width: 915, height: 412 }],
  ['desktop', { width: 1280, height: 720 }],
];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: SIZES[0][1], deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'en-US' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await page.addInitScript(() => {
  if (!sessionStorage.getItem('e2e.init')) {
    localStorage.clear();
    localStorage.setItem('d2m.testchar.v1', '1');
    localStorage.setItem('d2m.mode', 'd2+survivals');
    localStorage.setItem('d2m.lang', 'en');
    sessionStorage.setItem('e2e.init', '1');
  }
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
});
const shot = (n) => page.screenshot({ path: join(SHOTS, `${n}.png`) }).catch(() => undefined);
const size = async (s) => {
  await page.setViewportSize(s);
  await page.waitForTimeout(600);
};

await page.goto(URL);
await page.waitForSelector('.d2c, .charselect', { timeout: 120000 });
if (await page.$('.d2c')) await page.click('.d2c-skip');
await pickMode(page, 'd2+survivals', { timeout: 10000 }).catch(() => undefined);
await page.waitForSelector('.charselect input[type="text"], .d2input', { timeout: 120000 });
const d2ui = !!(await page.$('.d2input'));
await page.fill(d2ui ? '.d2input' : '.charselect input[type="text"]', 'Lot306');
await page.click(d2ui ? '.d2b.ok' : '.charselect .btn.primary.big');
await page.waitForFunction(() => window.__arpg?.game?.().mode === 'run' && !document.querySelector('.loading'), null, { timeout: 240000 });
await page.waitForTimeout(800);
// back to the hub: the run left, its end screen closed; a few records written as after some runs
await page.evaluate(() => {
  const g = window.__arpg.game();
  g.townPortal();
});
await page.waitForFunction(() => window.__arpg.game().mode === 'town' && !document.querySelector('.loading'), null, { timeout: 120000 });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const m = window.__arpg.game().character.progression.milestones;
  Object.assign(m, { 'survivals:rec:0:1:runs': 6, 'survivals:rec:0:1:surv': 412, 'survivals:rec:0:1:deep': 3, 'survivals:rec:0:1:kills': 1480 });
  document.querySelector('.mod-screen [data-sv="hub"]')?.click();
});
await page.waitForTimeout(800);

for (const [name, s] of SIZES) {
  await size(s);
  await page.evaluate(() => document.querySelector('.svh-tab[data-tab="perso"]')?.click());
  await page.waitForTimeout(300);
  await shot(`hub-${name}`);
  await page.evaluate(() => document.querySelector('[data-sv="act-pick"]')?.click());
  await page.waitForTimeout(600);
  await shot(`acts-${name}`);
  const r = await page.evaluate(() => {
    const scr = document.querySelector('.mod-screen [data-sv-screen="acts"]');
    const box = scr?.querySelector('.sv-box') ?? scr;
    const cta = scr?.querySelector('[data-sv="enter"]');
    const cards = [...(scr?.querySelectorAll('[data-sv="act-card"]') ?? [])];
    const vis = (el) => {
      if (!el) return false;
      const b = el.getBoundingClientRect();
      return b.top >= 0 && b.bottom <= innerHeight + 1 && b.left >= 0 && b.right <= innerWidth + 1 && b.width > 0;
    };
    const scroller = scr?.querySelector('[data-sv="act-list"]');
    return {
      cards: cards.length,
      open: cards.filter((c) => !c.classList.contains('locked')).length,
      expanded: scr?.querySelectorAll('[data-sv="act-detail"]').length ?? 0,
      zones: scr?.querySelectorAll('[data-sv="act-detail"] [data-sv="zone-chip"]').length ?? 0,
      timeline: [...(scr?.querySelectorAll('[data-sv="act-detail"] [data-sv="timeline"] > span') ?? [])].map((x) => x.textContent?.trim()),
      roster: scr?.querySelector('[data-sv="act-detail"] [data-sv="roster"]')?.textContent?.trim().slice(0, 120) ?? '',
      cta: cta?.textContent?.trim() ?? '',
      ctaVisible: vis(cta),
      hscroll: Math.max(document.documentElement.scrollWidth, box?.scrollWidth ?? 0) - innerWidth,
      listScroll: scroller ? scroller.scrollHeight - scroller.clientHeight : -1,
      columns: scroller ? getComputedStyle(scroller).gridTemplateColumns.split(' ').length : 0,
      minFont: Math.min(
        ...[...(scr?.querySelectorAll('*') ?? [])]
          .filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
          .map((e) => parseFloat(getComputedStyle(e).fontSize)),
      ),
    };
  });
  console.log(`  ${name}: ${JSON.stringify(r)}`);
  check(r.cards >= 5 && r.expanded === 1 && r.zones === 5, `A ${name}: an act a card, Act I expanded with its five zones`, `${r.cards} cards, ${r.zones} zones`);
  check(r.timeline.length >= 4 && /Andariel/.test(r.timeline.at(-1) ?? ''), `A ${name}: the timeline of the timed bosses, Andariel last`, r.timeline.join(' | '));
  check(/Act I/.test(r.cta) && /Andariel/.test(r.cta) && r.ctaVisible, `A ${name}: "Enter Act I — Andariel …" in sight`, r.cta);
  check(r.hscroll <= 0, `A ${name}: no horizontal scroll`, String(r.hscroll));
  check(r.minFont >= 11, `A ${name}: text 11 px at least`, String(r.minFont));
  if (name === 'landscape' || name === 'desktop') check(r.columns >= 2, `A ${name}: two columns`, String(r.columns));
  if (name === 'portrait') check(r.columns === 1, 'A portrait: one column', String(r.columns));
  // a closed act previewed by a tap
  await page.evaluate(() => document.querySelector('.mod-screen [data-sv="act-card"][data-act="3"]')?.click());
  await page.waitForTimeout(400);
  await shot(`acts-locked-${name}`);
  const p = await page.evaluate(() => ({
    preview: !!document.querySelector('.mod-screen [data-sv="act-detail"][data-act="3"]'),
    text: document.querySelector('.mod-screen [data-sv="act-detail"]')?.textContent?.trim().slice(0, 400) ?? '',
    cta: document.querySelector('.mod-screen [data-sv="enter"]')?.textContent?.trim() ?? '',
    disabled: document.querySelector('.mod-screen [data-sv="enter"]')?.disabled ?? null,
  }));
  console.log(`  locked: ${JSON.stringify(p)}`);
  check(p.preview && /Mephisto|Méphisto/.test(p.text) && p.disabled === true, `A ${name}: a closed act previewed (its bosses), not playable`, p.cta);
  // back to Act I, the screen closed
  await page.evaluate(() => document.querySelector('.mod-screen [data-sv="act-card"][data-act="1"]')?.click());
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('.mod-screen [data-sv="acts-back"]')?.click());
  await page.waitForTimeout(300);
}
// the button starts the run
await size(SIZES[0][1]);
await page.evaluate(() => document.querySelector('[data-sv="act-pick"]')?.click());
await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('.mod-screen [data-sv="enter"]')?.click());
await page.waitForFunction(() => window.__arpg.game().mode === 'run' && !document.querySelector('.loading'), null, { timeout: 120000 }).catch(() => undefined);
const run = await page.evaluate(() => window.__arpg.game().runDef?.id ?? '');
check(/a1r1/.test(run), 'A: "Enter Act I" starts the run', run);
check(errs.length === 0, '0 page error', errs.slice(0, 3).join(' / '));
await browser.close();
console.log(fails ? `${fails} failure(s)` : 'all checks passed');
process.exit(fails ? 1 : 0);
