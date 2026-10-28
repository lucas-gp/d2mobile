/**
 * Lot 308, the Run's permanent training (Survivals), in a browser (the dev server with the D2 graphics), portrait (412 × 915) and landscape
 * (915 × 412):
 *   A. the hub's Skills tab: the "Training" panel (a row a rank: picture, name, ranks, effect now → next, price), greyed when the purse
 *      cannot pay; a tap buys (the gold taken, the rank lit); the reset gives every gold piece back; every row and button ≥ 44 px high,
 *      no horizontal overflow;
 *   B. a run started with the ranks: the first choice's four cards ("Opening hand"), "Reroll · 3 free", "Banish · 5"; the life bonus;
 *   0 page error. A capture of each step and size in `--shots`.
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/survivals-308.mjs [--url=http://127.0.0.1:5233/] [--shots=<dir>]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? 'http://127.0.0.1:5233/';
const SHOTS = args.get('shots') ?? '/tmp/survivals-308';
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const SIZES = [
  ['portrait', { width: 412, height: 915 }],
  ['landscape', { width: 915, height: 412 }],
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
const toHub = async () => {
  await page.evaluate(() => window.__arpg.game().townPortal());
  await page.waitForFunction(() => window.__arpg.game().mode === 'town' && !document.querySelector('.loading'), null, { timeout: 120000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('.mod-screen [data-sv="hub"]')?.click());
  await page.waitForTimeout(800);
};

await page.goto(URL);
await page.waitForSelector('.d2c, .charselect', { timeout: 120000 });
if (await page.$('.d2c')) await page.click('.d2c-skip');
await pickMode(page, 'd2+survivals', { timeout: 10000 }).catch(() => undefined);
await page.waitForSelector('.charselect input[type="text"], .d2input', { timeout: 120000 });
const d2ui = !!(await page.$('.d2input'));
await page.fill(d2ui ? '.d2input' : '.charselect input[type="text"]', 'Lot308');
await page.click(d2ui ? '.d2b.ok' : '.charselect .btn.primary.big');
await page.waitForFunction(() => window.__arpg?.game?.().mode === 'run' && !document.querySelector('.loading'), null, { timeout: 240000 });
await page.waitForTimeout(800);
await toHub();
// a purse of some runs, a few ranks already bought
await page.evaluate(() => {
  const c = window.__arpg.game().character;
  c.gold = 150;
  Object.assign(c.progression.milestones, { 'survivals:forge:gold': 2, 'survivals:forge:xp': 1, 'survivals:forge:reroll': 1 });
  document.querySelector('.svh-tab[data-tab="skills"]')?.click();
});
await page.waitForTimeout(400);

for (const [name, s] of SIZES) {
  await size(s);
  await page.evaluate(() => document.querySelector('.svh-tab[data-tab="skills"]')?.click());
  await page.waitForTimeout(300);
  // held upright the panels stack: the training first
  await page.evaluate(() => document.querySelector('[data-part="forge"]')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(200);
  await shot(`training-${name}`);
  const r = await page.evaluate(() => {
    const p = document.querySelector('[data-part="forge"]');
    const rows = [...(p?.querySelectorAll('[data-forge-row]') ?? [])];
    const btns = [...(p?.querySelectorAll('button') ?? [])];
    return {
      title: p?.querySelector('.svh-ph')?.textContent,
      rows: rows.length,
      poor: rows.filter((r) => r.classList.contains('poor')).map((r) => r.dataset.forgeRow),
      minRow: Math.min(...rows.map((r) => r.getBoundingClientRect().height)),
      minBtn: Math.min(...btns.map((b) => b.getBoundingClientRect().height)),
      overflow: rows.filter((r) => r.scrollWidth > r.clientWidth + 1).length,
      gold: rows.find((r) => r.dataset.forgeRow === 'gold')?.querySelector('.svh-ffx')?.textContent,
      lit: rows.find((r) => r.dataset.forgeRow === 'gold')?.querySelectorAll('.svh-pips i.on').length,
    };
  });
  check(r.title === 'Training' && r.rows === 8, `${name}: the Training panel, 8 rows`, `${r.title}, ${r.rows}`);
  check(r.poor.includes('hand') && !r.poor.includes('banish'), `${name}: a rank the purse cannot pay greyed`, r.poor.join(','));
  check(r.minRow >= 44 && r.minBtn >= 44, `${name}: rows and buttons ≥ 44 px`, `${r.minRow}, ${r.minBtn}`);
  check(r.overflow === 0, `${name}: no row overflows`);
  check(r.gold === '+10% gold → +15% gold' && r.lit === 2, `${name}: effect now → next, ranks lit`, `${r.gold}, ${r.lit}`);
}
// a tap buys; the reset gives back
const buy = await page.evaluate(() => {
  const g = window.__arpg.game();
  const before = g.character.gold;
  document.querySelector('[data-forge="banish"]')?.click();
  return { before, after: g.character.gold, rank: g.character.progression.milestones['survivals:forge:banish'] ?? 0 };
});
await page.waitForTimeout(300);
await shot('training-bought-landscape');
check(buy.rank === 1 && buy.after < buy.before, 'a tap buys a rank', JSON.stringify(buy));
const reset = await page.evaluate(() => {
  const g = window.__arpg.game();
  document.querySelector('[data-sv="forge-reset"]')?.click();
  const m = g.character.progression.milestones;
  return { gold: g.character.gold, ranks: Object.keys(m).filter((k) => k.startsWith('survivals:forge:')).length };
});
check(reset.ranks === 0 && reset.gold > buy.before, 'the reset gives every gold piece back', JSON.stringify(reset));

// B. a run with the ranks: four cards, three free rerolls, five banishes
await page.evaluate(() => {
  const g = window.__arpg.game();
  Object.assign(g.character.progression.milestones, { 'survivals:forge:hand': 1, 'survivals:forge:reroll': 2, 'survivals:forge:banish': 3, 'survivals:forge:life': 5 });
  g.settings.mods = { ...(g.settings.mods ?? {}), survivals: { ...(g.settings.mods?.survivals ?? {}), cards: 'manual' } };
});
for (const [name, s] of SIZES) {
  await size(s);
  await page.evaluate(() => document.querySelector('[data-sv="play"]')?.click());
  await page.waitForFunction(() => window.__arpg.game().mode === 'run' && !document.querySelector('.loading'), null, { timeout: 240000 });
  await page.waitForSelector('.mod-screen .sv-card', { timeout: 60000 });
  await page.waitForTimeout(900);
  await shot(`cards-${name}`);
  const c = await page.evaluate(() => ({
    cards: document.querySelectorAll('.mod-screen .sv-card').length,
    hand: document.querySelector('[data-sv="opening-hand"]')?.textContent,
    reroll: document.querySelector('[data-sv="reroll"]')?.textContent,
    banish: document.querySelector('[data-sv="banish"]')?.textContent,
    life: window.__arpg.game().character.bonuses.lifePct,
    fit: (() => {
      const b = document.querySelector('.mod-screen .sv-cards-box')?.getBoundingClientRect();
      return b ? b.right <= innerWidth + 1 && b.left >= -1 : false;
    })(),
  }));
  check(c.cards === 4 && /Opening hand/.test(c.hand ?? ''), `${name}: four cards at the first choice`, `${c.cards}, ${c.hand}`);
  check(c.reroll === 'Reroll · 3 free' && c.banish === 'Banish · 5', `${name}: the run's free rerolls and banishes`, `${c.reroll}, ${c.banish}`);
  check(c.life === 5 && c.fit, `${name}: life +5 % (lot 313; lot 308: +20 %), the cards in the width`, `${c.life}`);
  await page.evaluate(() => document.querySelector('.mod-screen .sv-card')?.click());
  await toHub();
}
check(errs.length === 0, '0 page error', errs.join(' | '));
await browser.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
