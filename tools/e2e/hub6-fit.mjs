/**
 * Lot 299 (the owner's screenshots of the Run's six-tab hub in landscape: "zoom out a little, smaller buttons, no scrollbars"): the hub
 * measured in the e2e's sizes, a phone in landscape of 800 × 360 and a PC, each tab opened: the panels whose content overflows (a scroll
 * needed) and by how much, a visible scrollbar's width, the item sheet cut or not, the touch targets' heights (tabs, bar, pager, skills,
 * recipes); screenshots `<tag>-<size>-<tab>.png`.
 *   npx vite --host 127.0.0.1 --port 5234 --strictPort
 *   node tools/e2e/hub6-fit.mjs [--url=http://127.0.0.1:5234/] [--shots=<dir>] [--tag=after] [--strict=1]
 * `--strict=1`: fails when a panel still overflows where the lot says it must not (bag with its gold, stats, recipes, the item sheet), a
 * scrollbar is drawn thicker than 4 px, or a touch target is under 44 px.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HOME, pickMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? 'http://127.0.0.1:5234/';
const SHOTS = args.get('shots') ?? '/tmp/hub6-fit';
const TAG = args.get('tag') ?? 'after';
const STRICT = args.get('strict') === '1';
mkdirSync(SHOTS, { recursive: true });
const SIZES = {
  'phone-portrait': { width: 390, height: 844 },
  'phone-landscape': { width: 844, height: 390 },
  'phone-landscape-800x360': { width: 800, height: 360 },
  'fold-folded-portrait': { width: 344, height: 882 },
  'fold-folded-landscape': { width: 882, height: 344 },
  'fold-open-portrait': { width: 884, height: 1104 },
  'fold-open-landscape': { width: 1104, height: 884 },
  pc: { width: 1440, height: 900 },
};
const TABS = ['perso', 'coffre', 'skills', 'craft', 'cube', 'merco'];
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: SIZES['phone-landscape'], deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await page.addInitScript(() => {
  if (!sessionStorage.getItem('e2e.init')) {
    localStorage.clear();
    localStorage.setItem('d2m.testchar.v1', '1');
    localStorage.setItem('d2m.lang', 'fr');
    localStorage.setItem('d2m.mode', 'd2+survivals');
    sessionStorage.setItem('e2e.init', '1');
  }
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  Element.prototype.requestFullscreen = () => Promise.resolve();
});
await page.goto(URL);
await page.waitForSelector('.d2c, .charselect, .d2stage', { timeout: 120000 });
if (await page.$('.d2c')) await page.click('.d2c-skip');
await page.waitForSelector('[data-act="modetype"], [data-act="mode"], .sel-slot, .d2input, .charselect input', { timeout: 120000 });
if (await page.$(HOME)) await pickMode(page, 'd2+survivals');
await page.waitForSelector('.d2input, .charselect input[type="text"]', { timeout: 120000 });
const d2ui = !!(await page.$('.d2input'));
await page.fill(d2ui ? '.d2input' : '.charselect input[type="text"]', 'Hubby');
await page.click(d2ui ? '.d2b.ok' : '.charselect .btn.primary.big');
await page.waitForFunction(() => window.__arpg?.game?.()?.mode === 'run' && !document.querySelector('.loading'), null, { timeout: 240000 });
// a hero with things to show: gold, items in the bag, a few skills learned; then the run ends (death) and the hub opens
await page.evaluate(() => {
  const H = window.__arpg;
  const g = H.game();
  g.settings.mods = { ...(g.settings.mods ?? {}), survivals: { ...(g.settings.mods?.survivals ?? {}), cards: 'auto' } };
  g.character.gold += 4321;
  for (const id of ['great_helm', 'short_sword', 'ring', 'amulet', 'leather_gloves', 'sash', 'boots', 'small_shield', 'short_staff', 'cap']) {
    try {
      H.giveItem(id, { quality: 'magic' });
    } catch {
      /* a base absent from the ruleset */
    }
  }
});
for (let k = 0; k < 60 && !(await page.$('[data-sv-screen="run-end"]')); k++) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.mod-screen .sv-card')) b.click();
    const g = window.__arpg.game();
    if (g.mode !== 'run' || g.world.player.dead) return;
    g.world.player.hp = 0;
    g.world.player.dead = true;
    g.world.events.push({ t: 'playerDeath' });
  });
  await page.waitForTimeout(1000);
}
await page.click('[data-sv-screen="run-end"] [data-sv="hub"]');
await page.waitForSelector('[data-sv="run-hub"]', { timeout: 30000 });
const report = {};
for (const [sz, vp] of Object.entries(SIZES)) {
  await page.setViewportSize(vp);
  await page.waitForTimeout(500);
  for (const tab of TABS) {
    await page.evaluate((t) => document.querySelector(`[data-sv="run-hub"] [data-tab="${t}"]`)?.click(), tab);
    await page.waitForTimeout(350);
    if (tab === 'perso' || tab === 'craft') await page.waitForTimeout(200);
    const m = await page.evaluate(() => {
      const over = (e) => (e ? Math.max(0, e.scrollHeight - e.clientHeight) : 0);
      const panes = Object.fromEntries([...document.querySelectorAll('.svh-panel')].map((p) => [p.dataset.part, over(p.querySelector('.svh-pc'))]));
      const body = document.querySelector('.svh-body');
      const bar = (e) => (e ? e.offsetWidth - e.clientWidth : 0);
      const sbar = Math.max(bar(body), ...[...document.querySelectorAll('.svh-pc')].map(bar));
      const h = (sel) => [...document.querySelectorAll(sel)].map((b) => Math.round(b.getBoundingClientRect().height)).filter((x) => x > 0);
      const minOf = (a) => (a.length ? Math.min(...a) : null);
      const tabs = document.querySelector('.svh-tabs')?.getBoundingClientRect();
      const barR = document.querySelector('.svh-bar')?.getBoundingClientRect();
      return {
        body: over(body),
        panes,
        sbar,
        chrome: Math.round((tabs?.height ?? 0) + (barR?.height ?? 0)),
        tab: minOf(h('.svh-tab')),
        barBtn: minOf(h('.svh-bar .sv-btn')),
        seg: minOf(h('.svh-seg .sv-btn, .svh-pager .sv-btn')),
        sk: minOf(h('.svh-sk')),
        recipe: minOf(h('.svh-recipe')),
        hit: (() => {
          // the touch target: the element's box, or its ::before when it widens it (lot 299)
          const t = [...document.querySelectorAll('.svh-tab, .svh-bar .sv-btn, .svh-seg .sv-btn, .svh-pager .sv-btn, .svh-recipe')].map((b) => {
            const r = b.getBoundingClientRect();
            const be = getComputedStyle(b, '::before');
            const ext = be.content !== 'none' && be.position === 'absolute' ? Math.max(0, -parseFloat(be.top) || 0) + Math.max(0, -parseFloat(be.bottom) || 0) : 0;
            return Math.round(r.height + ext);
          });
          return t.length ? Math.min(...t) : null;
        })(),
      };
    });
    report[`${sz}/${tab}`] = m;
    await page.screenshot({ path: join(SHOTS, `${TAG}-${sz}-${tab}.png`) });
  }
  // the item sheet: a bag item tapped (Personnage)
  await page.evaluate(() => document.querySelector('[data-sv="run-hub"] [data-tab="perso"]')?.click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-pane="center"] .svh-it, .svh-grid[data-grid="bag"] .svh-it')?.click());
  await page.waitForTimeout(400);
  const d = await page.evaluate(() => {
    const e = document.querySelector('.svh-detail');
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { over: Math.max(0, e.scrollHeight - e.clientHeight), inside: r.top >= 0 && r.bottom <= innerHeight + 1, h: Math.round(r.height) };
  });
  report[`${sz}/detail`] = d;
  await page.screenshot({ path: join(SHOTS, `${TAG}-${sz}-detail.png`) });
  await page.evaluate(() => document.querySelector('.svh-detail .sv-btn:last-child, .svh-dhead .sv-btn')?.click());
}
for (const [k, m] of Object.entries(report)) console.log(`${k} ${JSON.stringify(m)}`);
if (STRICT) {
  for (const [k, m] of Object.entries(report)) {
    if (!m) continue;
    if (k.endsWith('/detail')) {
      check(m.over <= 2 && m.inside, `${k}: the item sheet whole, not cut`, JSON.stringify(m));
      continue;
    }
    const tab = k.split('/')[1];
    // the panels that must hold their content (the owner's examples): the bag with its gold, the stats, the recipes' list
    const must = { perso: ['bag'], skills: ['stats'], craft: ['craft'] }[tab] ?? [];
    const bad = must.filter((p) => (m.panes[p] ?? 0) > 2);
    check(!bad.length, `${k}: ${must.join(', ') || 'panels'} whole without scrolling`, JSON.stringify(m.panes));
    check(m.sbar <= 4, `${k}: no thick scrollbar`, String(m.sbar));
    check(m.hit === null || m.hit >= 44, `${k}: touch targets ≥ 44 px`, JSON.stringify({ tab: m.tab, bar: m.barBtn, seg: m.seg, hit: m.hit }));
  }
  check(errs.length === 0, '0 page error', errs.join(' | '));
}
await browser.close();
console.log(fails ? `${fails} failure(s)` : 'done');
process.exit(fails ? 1 : 0);
