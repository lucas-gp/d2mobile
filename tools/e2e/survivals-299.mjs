/**
 * Lot 299, the owner's returns (Survivals) and the sign-in turned off, in a browser (the dev server, full build: not the public one, so
 * that the account would show if the flag let it):
 *   E1. the run-end screen: in the e2e's six sizes and a phone in landscape of 800 × 360, its three actions (shop, play again, hub) whole
 *       in the screen and the panel without scrolling, ≥ 44 px, on one row; the panel never scrolls (its body may);
 *   E2. a long run-end (filler lines in its body): the actions stay in view, only the body scrolls;
 *   K1. a Run character's card on the selection screen: its progress (the act and zone reached, runs, victories, the longest run), no
 *       "Niveau N"; a Campaign character keeps its level; in English too;
 *   M1. the characters apart by mode: made in "Project Diablo 2 — Survivals" and in "Diablo II (original) — Survivals", each list holds
 *       only its own, created and saved under its own ruleset;
 *   M2. the stash apart by mode: `pd2+survivals` gets its own (`d2m.shared.pd2+survivals`), pd2's left as it was;
 *   M3. a save of an unreadable Survivals ruleset (`survivals` alone) listed in "Diablo II (original) — Survivals";
 *   S1. no "Se connecter" / "Synchroniser" on the home screen, the lists and the settings (Compte), no request to /api/sync; 0 page error.
 *   D2_SPRITES=0 npx vite --host 127.0.0.1 --port 5234 --strictPort
 *   node tools/e2e/survivals-299.mjs [--url=http://127.0.0.1:5234/] [--shots=<dir>]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HOME, pickMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? 'http://127.0.0.1:5234/';
const SHOTS = args.get('shots') ?? '/tmp/survivals-299';
mkdirSync(SHOTS, { recursive: true });
const SIZES = {
  'phone-portrait': { width: 390, height: 844 },
  'phone-landscape': { width: 844, height: 390 },
  'phone-landscape-800x360': { width: 800, height: 360 },
  'fold-folded-portrait': { width: 344, height: 882 },
  'fold-folded-landscape': { width: 882, height: 344 },
  'fold-open-portrait': { width: 884, height: 1104 },
  'fold-open-landscape': { width: 1104, height: 884 },
};
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: SIZES['phone-portrait'], deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
const page = await ctx.newPage();
const errs = [];
const syncCalls = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
page.on('request', (r) => /\/api\/sync/.test(r.url()) && syncCalls.push(r.url()));
const PD2_STASH = JSON.stringify({ version: 1, tabs: [new Array(80).fill(null)] });
await page.addInitScript((pd2) => {
  if (!sessionStorage.getItem('e2e.init')) {
    localStorage.clear();
    localStorage.setItem('d2m.testchar.v1', '1');
    localStorage.setItem('d2m.lang', 'fr');
    // pd2's shared stash from before the lot (the mode shared it until now)
    localStorage.setItem('d2m.shared', pd2);
    sessionStorage.setItem('e2e.init', '1');
  }
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  // the window is resized by the test: no real fullscreen
  Element.prototype.requestFullscreen = () => Promise.resolve();
}, PD2_STASH);
const shot = (n) => page.screenshot({ path: join(SHOTS, `${n}.png`) }).catch(() => undefined);
const SYNC = /Se connecter|Synchroniser|Sign in|Log in/;
const home = async () => {
  await page.waitForSelector('.d2c, .charselect, .d2stage', { timeout: 120000 });
  if (await page.$('.d2c')) await page.click('.d2c-skip');
  await page.waitForSelector('[data-act="modetype"], [data-act="mode"], .sel-slot', { timeout: 120000 });
};
const inGame = () => page.waitForFunction(() => window.__arpg?.game?.() && !document.querySelector('.loading'), null, { timeout: 240000 });
/** The list of a mode, from the home screen */
const listOf = async (mode) => {
  await page.goto(URL);
  await home();
  if (!(await page.$(HOME))) await page.click('[data-act="modes"]');
  await pickMode(page, mode);
  await page.waitForSelector('.sel-slot, .charselect input[type="text"], .d2input', { timeout: 120000 });
  await page.waitForTimeout(600);
  return page.evaluate(() => ({
    title: document.querySelector('.sel-mode, .sel-title')?.textContent ?? '',
    slots: [...document.querySelectorAll('.sel-slot')].map((e) => ({
      name: e.querySelector('.sel-name')?.textContent?.replace(/[\u2068\u2069]/g, ''),
      lvl: e.querySelector('.sel-lvl')?.textContent,
      rest: [...e.querySelectorAll('.sel-diff')].map((x) => x.textContent),
    })),
    text: document.body.innerText,
  }));
};
/** A character created in a mode (the creation screen of that mode's list) */
const create = async (mode, name, variant = 'run') => {
  await listOf(mode);
  if (await page.$('.sel-slot')) await page.click('[data-act="create"]');
  await page.waitForSelector('.charselect input[type="text"], .d2input', { timeout: 120000 });
  if (variant !== 'run') await page.click(`[data-variant="${variant}"]`);
  const d2ui = !!(await page.$('.d2input'));
  await page.fill(d2ui ? '.d2input' : '.charselect input[type="text"]', name);
  await page.click(d2ui ? '.d2b.ok' : '.charselect .btn.primary.big');
  await inGame();
  await page.waitForTimeout(1500);
  return page.evaluate(() => window.__arpg.game().ruleset);
};

// S1 (the home screen): no sign-in
await page.goto(URL);
await home();
const homeText = await page.evaluate(() => document.body.innerText);
check(!SYNC.test(homeText) && !(await page.$('[data-act="sync"]')), 'S1: the home screen has no sign-in button', homeText.replace(/\s+/g, ' ').slice(0, 160));
await shot('s1-home');

// M1: a character in Project Diablo 2 — Survivals; E1: its first run ends by a death (the run-end screen)
const rP = await create('pd2+survivals', 'Peda');
await page.evaluate(() => {
  const g = window.__arpg.game();
  g.settings.mods = { ...(g.settings.mods ?? {}), survivals: { ...(g.settings.mods?.survivals ?? {}), cards: 'auto' } };
  for (const b of document.querySelectorAll('.mod-screen .sv-card')) b.click();
});
await page.waitForTimeout(3000);
// the death, again until the run-end screen shows (a level-up card opened meanwhile pauses the game: answered first)
for (let k = 0; k < 60 && !(await page.$('[data-sv-screen="run-end"]')); k++) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.mod-screen .sv-card')) b.click();
    const g = window.__arpg.game();
    if (g.mode !== 'run' || g.world.player.dead) return;
    g.world.godMode = false;
    g.world.player.hp = 0;
    g.world.player.dead = true;
    g.world.events.push({ t: 'playerDeath' });
  });
  await page.waitForTimeout(1000);
}
await page.waitForTimeout(1300);
for (const [sz, vp] of Object.entries(SIZES)) {
  await page.setViewportSize(vp);
  await page.waitForTimeout(500);
  const e = await page.evaluate(() => {
    const s = document.querySelector('[data-sv-screen="run-end"]');
    const boxEl = s?.querySelector('.sv-end');
    const box = boxEl?.getBoundingClientRect();
    const body = s?.querySelector('[data-sv="end-body"]');
    const btns = ['visit-shop', 'again', 'hub'].map((k) => s?.querySelector(`[data-sv="${k}"]`)?.getBoundingClientRect());
    const inside = (r) => !!r && !!box && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
    return {
      screen: !!s,
      ok: btns.every(inside),
      tall: btns.every((r) => r && r.height >= 44 && r.width >= 44),
      row: btns.every((r) => r && Math.abs(r.top - btns[0].top) < 2),
      boxScroll: boxEl ? boxEl.scrollHeight - boxEl.clientHeight : -1,
      bodyOverflow: body ? body.scrollHeight - body.clientHeight : -1,
      btns: btns.map((r) => r && `${Math.round(r.top)}-${Math.round(r.bottom)}`),
    };
  });
  check(e.screen && e.ok && e.tall && e.row && e.boxScroll <= 1, `E1 ${sz}: the run-end screen's actions visible without scrolling`, JSON.stringify(e));
  await shot(`e1-run-end-${sz}`);
}
// E2: a long run-end (many items kept, records, the bag full…: filler lines added to its body) keeps the actions in view, its body scrolls
await page.evaluate(() => {
  const body = document.querySelector('[data-sv-screen="run-end"] [data-sv="end-body"]');
  for (let i = 0; i < 25; i++) {
    const p = document.createElement('p');
    p.className = 'sv-sub sv-end-note';
    p.textContent = `Gardés : Objet ${i}, Objet ${i + 1}, Objet ${i + 2}`;
    body?.append(p);
  }
});
for (const sz of ['phone-landscape-800x360', 'fold-folded-landscape', 'fold-folded-portrait', 'phone-portrait']) {
  await page.setViewportSize(SIZES[sz]);
  await page.waitForTimeout(400);
  const e = await page.evaluate(() => {
    const s = document.querySelector('[data-sv-screen="run-end"]');
    const body = s.querySelector('[data-sv="end-body"]');
    const r = s.querySelector('[data-sv="hub"]').getBoundingClientRect();
    const before = body.scrollTop;
    body.scrollTop = 99999;
    const scrolled = body.scrollTop > before;
    const r2 = s.querySelector('[data-sv="hub"]').getBoundingClientRect();
    body.scrollTop = 0;
    return { inView: r.bottom <= innerHeight + 0.5 && r.top >= 0, fixed: Math.abs(r.top - r2.top) < 1, scrolled };
  });
  check(e.inView && e.fixed && e.scrolled, `E2 ${sz}: a long run-end: the actions stay in view, the body scrolls under them`, JSON.stringify(e));
  await shot(`e2-run-end-long-${sz}`);
}
await page.setViewportSize(SIZES['phone-portrait']);
await page.click('[data-sv-screen="run-end"] [data-sv="hub"]').catch(() => undefined);
await page.waitForTimeout(800);
const stashP = await page.evaluate(() => ({ mode: localStorage.getItem('d2m.shared.pd2+survivals'), pd2: localStorage.getItem('d2m.shared'), d2: localStorage.getItem('d2m.shared.d2') }));
check(
  !!stashP.mode && JSON.parse(stashP.mode).tabs.length > 0 && stashP.pd2 === PD2_STASH && stashP.d2 === null,
  'M2: Project Diablo 2 — Survivals has its own stash, pd2’s left as it was',
  JSON.stringify({ mode: !!stashP.mode, pd2same: stashP.pd2 === PD2_STASH, d2: stashP.d2 }),
);
// M1: two characters in Diablo II (original) — Survivals, a Run and a Campaign
const rD = await create('d2+survivals', 'Dede');
const camp = await create('d2+survivals', 'Campo', 'campaign');
const lp = await listOf('pd2+survivals');
await shot('m1-list-pd2-survivals');
const ld = await listOf('d2+survivals');
await shot('m1-list-d2-survivals');
const lpd2 = await listOf('pd2');
check(rP === 'pd2+survivals' && rD === 'd2+survivals' && camp === 'd2+survivals', 'M1: created and saved under the mode picked', `${rP}, ${rD}, ${camp}`);
check(
  lp.slots.map((s) => s.name).join() === 'Peda' &&
    ld.slots
      .map((s) => s.name)
      .sort()
      .join() === 'Campo,Dede' &&
    !lpd2.slots.some((s) => /Peda|Dede|Campo/.test(s.name)),
  'M1: each list holds only its mode’s characters',
  `pd2+survivals: ${lp.slots.map((s) => s.name)} | d2+survivals: ${ld.slots.map((s) => s.name)} | pd2: ${lpd2.slots.map((s) => s.name)}`,
);
const stashD = await page.evaluate(() => ({ d2s: localStorage.getItem('d2m.shared.d2+survivals'), pd2: localStorage.getItem('d2m.shared') }));
check(!!stashD.d2s && stashD.pd2 === PD2_STASH, 'M2: Diablo II (original) — Survivals has its own stash too', JSON.stringify({ d2s: !!stashD.d2s }));
// K1: the cards
const peda = lp.slots.find((s) => s.name === 'Peda');
const dede = ld.slots.find((s) => s.name === 'Dede');
const campo = ld.slots.find((s) => s.name === 'Campo');
check(
  /Run/.test(peda?.lvl ?? '') &&
    !/Niveau/.test(peda?.lvl ?? '') &&
    /Acte I — Normal · zone 1 \/ 5/.test(peda?.rest.join('|') ?? '') &&
    /Runs 1 · victoires 0 · survie \d+:\d\d/.test(peda?.rest.join('|') ?? ''),
  'K1: a Run character’s card tells its progress, not its level',
  JSON.stringify(peda),
);
check(/Run/.test(dede?.lvl ?? '') && !/Niveau/.test(dede?.lvl ?? '') && /Acte I — Normal|Aucune run/.test(dede?.rest.join('|') ?? ''), 'K1: a new Run character’s card', JSON.stringify(dede));
check(/^Niveau \d+/.test(campo?.lvl ?? ''), 'K1: a Campaign character keeps its level', JSON.stringify(campo));
// M3: a save of an unreadable Survivals ruleset (`survivals` alone): listed in "Diablo II (original) — Survivals"
await page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => /^d2m\.save\.[^.]+$/.test(x) && JSON.parse(localStorage[x]).character?.name === 'Dede');
  const d = JSON.parse(localStorage[k]);
  d.ruleset = 'survivals';
  d.character.name = 'Orphan';
  localStorage.setItem('d2m.save.orphan-299', JSON.stringify(d));
});
const lo = await listOf('d2+survivals');
const lo2 = await listOf('pd2+survivals');
check(
  lo.slots.some((s) => s.name === 'Orphan') && !lo2.slots.some((s) => s.name === 'Orphan'),
  'M3: a save of ruleset "survivals" listed in Diablo II (original) — Survivals only',
  lo.slots.map((s) => s.name).join(),
);
// S1: the lists and the settings have no sign-in
check(!SYNC.test(lp.text + ld.text + lpd2.text), 'S1: the lists have no sign-in button');
await create('pd2', 'Plain');
await page.evaluate(() => window.__arpg.app.panels.show('settings'));
await page.waitForSelector('.setpane', { timeout: 30000 });
await page.evaluate(() => document.querySelector('.setcat[data-cat="account"]')?.click());
await page.waitForTimeout(400);
const setText = await page.locator('.setpane').innerText();
check(
  !/Synchronisation|Se connecter/.test(setText) && /Exporter la sauvegarde/i.test(setText),
  'S1: Settings › Account: no Synchronisation (the export kept)',
  JSON.stringify({ sync: /Synchronisation|Se connecter/.test(setText), exp: /Exporter la sauvegarde/i.test(setText), tail: setText.replace(/\s+/g, ' ').slice(-200) }),
);
await shot('s1-settings-account');
// K1 in English
await page.evaluate(() => localStorage.setItem('d2m.lang', 'en'));
const le = await listOf('pd2+survivals');
await shot('k1-list-en');
const pe = le.slots.find((s) => s.name === 'Peda');
check(
  /Run/.test(pe?.lvl ?? '') && /Act I — Normal · zone 1 \/ 5/.test(pe?.rest.join('|') ?? '') && /Runs 1 · wins 0 · longest/.test(pe?.rest.join('|') ?? ''),
  'K1: the card in English',
  JSON.stringify(pe),
);
await page.waitForTimeout(2000);
check(syncCalls.length === 0, 'S1: no request to /api/sync', syncCalls.slice(0, 3).join());
check(errs.length === 0, '0 page error', errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `${fails} failure(s)` : 'all ✓');
process.exit(fails ? 1 : 0);
