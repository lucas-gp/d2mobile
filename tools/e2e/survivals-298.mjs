/**
 * Lot 298, the owner's tests of the Run (Survivals, Act I), in a browser on a phone in portrait (the dev server, the mode built in):
 *   C1. every learned skill on its own cooldown: a hero of level 12 with his skills learned casts several different skills within the same
 *       second (casts beside a running one), each spell on its own floor;
 *   C2. the cadence readable: no spell repeated quicker than its own floor (lot 301: no gap between two different spells any more);
 *   R1. the app closed in the middle of a run (page reloaded) then the character launched again: a NEW run (Blood Moor, level 1, the clock
 *       at 0:00, no kill), never the old run resumed;
 *   N1. the pause: "Choix du personnage" (confirmed, the run's rule told) → the character list opens directly;
 *   N2. the pause: "Écran d'accueil" (confirmed) → the home screen (the modes);
 *   N3. the hub (between runs): "Choix du personnage" and "Écran d'accueil" in its bottom bar, no confirmation; 0 page error.
 *   D2_SPRITES=0 D2_PUBLIC=1 D2_ALLOW_SKIP=1 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/survivals-298.mjs [--url=http://127.0.0.1:5233/] [--shots=<dir>]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HOME, pickMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? 'http://127.0.0.1:5233/';
const SHOTS = args.get('shots') ?? '/tmp/survivals-298';
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await page.addInitScript(() => {
  if (!sessionStorage.getItem('e2e.init')) {
    localStorage.clear();
    localStorage.setItem('d2m.testchar.v1', '1');
    localStorage.setItem('d2m.mode', 'd2+survivals');
    localStorage.setItem('d2m.lang', 'fr');
    sessionStorage.setItem('e2e.init', '1');
  }
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
});
const shot = (n) => page.screenshot({ path: join(SHOTS, `${n}.png`) }).catch(() => undefined);
const inRun = () => page.waitForFunction(() => window.__arpg?.game?.().mode === 'run' && !document.querySelector('.loading'), null, { timeout: 240000 });
const home = async () => {
  await page.waitForSelector('.d2c, .charselect', { timeout: 120000 });
  if (await page.$('.d2c')) await page.click('.d2c-skip');
};
/** The character launched from the home screen (the mode picked when the modes are shown) */
const launchChar = async () => {
  await home();
  await page.waitForSelector('.sel-slot, [data-act="modetype"], [data-act="mode"]', { timeout: 120000 });
  if (!(await page.$('.sel-slot'))) await pickMode(page, 'd2+survivals');
  await page.waitForSelector('.sel-slot', { timeout: 120000 });
  await page.click('.sel-slot');
  await page.click('[data-act="play"]');
  await inRun();
};
/** The level-up cards answered by the mode itself (no card screen over the run), the run held or let go */
const autoCards = () =>
  page.evaluate(() => {
    const g = window.__arpg.game();
    g.settings.mods = { ...(g.settings.mods ?? {}), survivals: { ...(g.settings.mods?.survivals ?? {}), cards: 'auto' } };
    for (const b of document.querySelectorAll('.mod-screen .sv-card')) b.click();
  });

await page.goto(URL);
await home();
await pickMode(page, 'd2+survivals', { timeout: 10000 }).catch(() => undefined);
await page.waitForSelector('.charselect input[type="text"], .d2input', { timeout: 120000 });
const d2ui = !!(await page.$('.d2input'));
await page.fill(d2ui ? '.d2input' : '.charselect input[type="text"]', 'Lot298');
await page.click(d2ui ? '.d2b.ok' : '.charselect .btn.primary.big');
await inRun();
await autoCards();

// C1-C2: a hero of level 12, every skill of his trees learned, 40 s of the act at 4× (the game's own step), god mode
const c = await page.evaluate(async () => {
  const H = window.__arpg;
  const g = H.game();
  const w = g.world;
  w.godMode = true;
  g.character.level = 12;
  H.learnAll(3);
  const casts = [];
  const off = g.onEvent((e) => {
    if (e.t === 'cast' && e.id === g.world.player.id) casts.push({ t: g.world.tick, skill: e.skill });
  });
  H.speed(4);
  const t0 = w.tick;
  await new Promise((r) => {
    const iv = setInterval(() => {
      for (const b of document.querySelectorAll('.mod-screen .sv-card')) b.click();
      if (g.world.tick - t0 >= 40 * 25) {
        clearInterval(iv);
        r();
      }
    }, 100);
  });
  H.speed(1);
  off();
  return { casts, learned: Object.keys(g.character.skills).length };
});
const skills = new Set(c.casts.map((x) => x.skill));
const bySec = new Map();
for (const x of c.casts) {
  const s = Math.floor(x.t / 25);
  if (!bySec.has(s)) bySec.set(s, new Set());
  bySec.get(s).add(x.skill);
}
const multi = [...bySec.values()].filter((s) => s.size >= 2).length / Math.max(1, bySec.size);
check(
  skills.size >= 5 && multi >= 0.4,
  'C1: several different skills cast within the same second (every skill on its own cooldown)',
  `${skills.size} skills, ${Math.round(multi * 100)} % of the seconds with 2+ skills: ${[...skills].join(',')}`,
);
const floors = await page.evaluate(async () => {
  const m = await import('/mods/survivals/sim/runmode.ts');
  const R = await import('/src/mods/sdk.ts');
  const ids = R.REGISTRIES.skills.all().map((s) => s.id);
  return { floor: Object.fromEntries(ids.map((id) => [id, m.minCastOf(id, false)])), melee: Object.fromEntries(R.REGISTRIES.skills.all().map((s) => [s.id, !!s.melee && s.kind !== 'ranged'])) };
});
const spells = c.casts.filter((x) => x.skill !== 'attack' && !floors.melee[x.skill]);
let sameTooQuick = 0;
const last = {};
for (let i = 0; i < spells.length; i++) {
  if (last[spells[i].skill] !== undefined && spells[i].t - last[spells[i].skill] < Math.ceil(floors.floor[spells[i].skill] * 25) - 1) sameTooQuick++;
  last[spells[i].skill] = spells[i].t;
}
check(sameTooQuick === 0, 'C2: no spell repeated quicker than its own floor (lot 301: different spells together)', `${(spells.length / 40).toFixed(2)} spells/s, ${sameTooQuick} repeated too soon`);
await shot('c1-run-skills');

// R1: the app closed in the middle of the run, then the character launched again: a new run from 0
const before = await page.evaluate(() => {
  const g = window.__arpg.game();
  return { level: g.character.level, tick: g.world.tick, zone: g.world.zone.id, runs: g.character.progression.milestones['survivals:runs'] };
});
await page.evaluate(() => window.__arpg.app.saveNow());
await page.reload();
await launchChar();
await page.waitForTimeout(1500);
const after = await page.evaluate(() => {
  const g = window.__arpg.game();
  const m = g.character.progression.milestones;
  return {
    level: g.character.level,
    zone: g.world.zone.id,
    sec: Math.round(g.world.tick / 25),
    kills: m['survivals:run:kills'] ?? 0,
    runs: m['survivals:runs'],
    time: document.querySelector('[data-sv="time"]')?.textContent ?? '',
  };
});
check(
  after.zone === 'survivals:a1r1' && after.level <= 2 && after.sec <= 5 && after.kills === 0 && after.runs === before.runs + 1,
  'R1: launched again after the app closed: a NEW run (first zone, level 1, 0:00), never resumed',
  JSON.stringify({ before, after }),
);
await shot('r1-new-run');
await autoCards();

// N1: the pause → "Choix du personnage" (confirmed) → the character list
await page.click('[data-sv="pause"]');
await page.waitForSelector('[data-sv="to-chars"]', { timeout: 10000 });
await shot('n1-pause');
await page.click('[data-sv="to-chars"]');
await page.waitForSelector('[data-sv="nav-confirm"]', { timeout: 5000 });
const rule = await page.textContent('[data-sv="nav-confirm"]');
await shot('n1-confirm');
check(/abandonnée/.test(rule ?? ''), 'N1: the pause asks first, telling the run will be abandoned', rule ?? '');
await page.click('[data-sv="nav-yes"]');
await page.waitForSelector('.sel-slot', { timeout: 120000 });
check(!(await page.$(HOME)) && !!(await page.$('.sel-slot')), 'N1: "Choix du personnage": the character list, directly');
await shot('n1-list');
// N2: the pause → "Écran d'accueil" → the home screen
await page.click('.sel-slot');
await page.click('[data-act="play"]');
await inRun();
await autoCards();
await page.click('[data-sv="pause"]');
await page.click('[data-sv="to-home"]');
await page.click('[data-sv="nav-yes"]');
await home();
await page.waitForSelector('[data-act="modetype"], [data-act="mode"]', { timeout: 120000 });
check(!!(await page.$(HOME)), 'N2: "Écran d’accueil": the home screen (the modes)');
await shot('n2-home');
// N3: the hub, between runs: both in its bottom bar, no confirmation
await launchChar();
await page.evaluate(() => window.__arpg.game().townPortal());
await page.waitForSelector('.svh-bar [data-sv="to-chars"]', { timeout: 30000 });
// the run-end screen first (a run left): closed by its own button when there
await page.waitForSelector('.sv-screen [data-sv="hub"]', { timeout: 10000 }).catch(() => undefined);
if (await page.$('.sv-screen [data-sv="hub"]')) await page.click('.sv-screen [data-sv="hub"]');
await page.waitForTimeout(500);
await shot('n3-hub');
const nav = await page.evaluate(() =>
  [...document.querySelectorAll('.svh-bar [data-sv="nav"] button')].map((b) => ({ t: b.textContent, h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) })),
);
check(nav.length === 2 && nav.every((b) => b.h >= 24), 'N3: the hub’s bottom bar: "Choix du personnage" and "Écran d’accueil"', JSON.stringify(nav));
await page.$eval('.svh-bar [data-sv="to-chars"]', (b) => b.click());
await page.waitForSelector('.sel-slot', { timeout: 120000 });
check(!!(await page.$('.sel-slot')), 'N3: from the hub, the character list at once (no confirmation)');
check(errs.length === 0, '0 page error', errs.join(' | '));
await browser.close();
console.log(fails ? `${fails} échec(s)` : 'OK');
process.exit(fails ? 1 : 0);
