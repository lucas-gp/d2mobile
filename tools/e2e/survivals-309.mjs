/**
 * Lot 309 (Survivals), in a browser (the dev server with the D2 graphics):
 *   C — Charged Bolt at 5 points (a Sorceress of level 15, god mode, the automatic control): eight frames 120 ms apart; the bolts alive on
 *       each, the hero's mode (the cast's gesture drawn), the bolts a cast (the rule `skills.missileCount`: 4 in the Run's Act I);
 *   F — the field at about 1:00 and 3:00 of the act, in portrait (412 × 915) and landscape (915 × 412): the monsters alive, those whose
 *       feet the renderer projects inside the window, and the monsters within 150 px of the hero. A capture of each in `--shots`.
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/survivals-309.mjs [--url=http://127.0.0.1:5233/] [--shots=<dir>] [--tag=after] [--lenient=1]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? 'http://127.0.0.1:5233/';
const SHOTS = args.get('shots') ?? '/tmp/survivals-309';
const TAG = args.get('tag') ?? 'after';
const LENIENT = args.get('lenient') === '1';
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok && !LENIENT) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const PORTRAIT = { width: 412, height: 915 };
const LANDSCAPE = { width: 915, height: 412 };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: PORTRAIT, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'en-US' });
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
const shot = (n) => page.screenshot({ path: join(SHOTS, `${TAG}-${n}.png`) }).catch(() => undefined);
const inRun = () => page.waitForFunction(() => window.__arpg?.game?.().mode === 'run' && !window.__arpg.game().world.zone.town && !document.querySelector('.loading'), null, { timeout: 240000 });
/** Plays until the act's clock reads `actSec` (or `sec` more seconds) at `speed`×, god mode, the automatic control, the cards answered */
const playTo = (actSec, speed = 2) =>
  page.evaluate(
    async ([actSec, speed]) => {
      const H = window.__arpg;
      const g = H.game();
      g.settings.mods = { ...(g.settings.mods ?? {}), survivals: { ...(g.settings.mods?.survivals ?? {}), cards: 'auto', control: 'auto' } };
      H.speed(speed);
      const clock = () => {
        const d = H.game().world.run?.director;
        return d?.actSec && d.sec ? d.actSec(d.sec(H.game().world)) : 0;
      };
      const t0 = performance.now();
      await new Promise((r) => {
        const iv = setInterval(() => {
          H.game().world.godMode = true;
          for (const b of document.querySelectorAll('.mod-screen .sv-card')) b.click();
          // the countdown between two zones: on at once
          for (const b of document.querySelectorAll('[data-sv="next"], .sv-next')) b.click();
          if (clock() >= actSec || performance.now() - t0 > 400000) {
            clearInterval(iv);
            r();
          }
        }, 50);
      });
      H.speed(1);
      return clock();
    },
    [actSec, speed],
  );
/** The monsters alive, inside the window by the renderer's projection of their feet, and within 150 px of the hero */
const field = () =>
  page.evaluate(() => {
    const H = window.__arpg;
    const R = H.renderer?.();
    const w = H.game().world;
    const p = w.player;
    const live = w.monsters.filter((m) => !m.dead && m.team === 1 && !m.pet && !m.isSummon);
    if (!R) return { alive: live.length };
    const ps = R.worldToScreen(p.x, p.y);
    let view = 0;
    let near = 0;
    for (const m of live) {
      const s = R.worldToScreen(m.x, m.y);
      if (s.x >= 0 && s.y >= 0 && s.x <= innerWidth && s.y <= innerHeight) view++;
      if (Math.hypot(s.x - ps.x, s.y - ps.y) < 150) near++;
    }
    return { alive: live.length, view, near, level: H.game().character.level };
  });

await page.goto(URL);
await page.waitForSelector('.d2c, .charselect', { timeout: 120000 });
if (await page.$('.d2c')) await page.click('.d2c-skip');
await pickMode(page, 'd2+survivals', { timeout: 10000 }).catch(() => undefined);
await page.waitForSelector('.charselect input[type="text"], .d2input', { timeout: 120000 });
const d2ui = !!(await page.$('.d2input'));
await page.fill(d2ui ? '.d2input' : '.charselect input[type="text"]', 'Lot309');
await page.click(d2ui ? '.d2b.ok' : '.charselect .btn.primary.big');
await inRun();
await page.waitForTimeout(800);

// C — Charged Bolt at 5 points: the frames, the bolts alive, the gesture
const cls = await page.evaluate(() => window.__arpg.game().character.classId);
if (cls === 'sorceress') {
  await page.evaluate(() => {
    const H = window.__arpg;
    const g = H.game();
    g.settings.mods = { ...(g.settings.mods ?? {}), survivals: { ...(g.settings.mods?.survivals ?? {}), cards: 'auto', control: 'auto' } };
    g.character.level = 15;
    g.character.skills = { charged_bolt: 5 };
    g.offers.length = 0;
    g.world.refreshPlayer();
    g.world.godMode = true;
    window.__cb = { casts: [], frames: [] };
    g.onEvent((e) => {
      if (e.t === 'cast' && e.id === H.game().world.player.id && e.skill === 'charged_bolt') {
        const w = H.game().world;
        window.__cb.casts.push({ tick: w.tick, before: w.missiles.filter((m) => m.kind === 'charged_bolt' && m.team === 0).map((m) => m.id) });
      }
    });
  });
  await page.waitForTimeout(4000);
  for (let i = 0; i < 8; i++) {
    const f = await page.evaluate(() => {
      const w = window.__arpg.game().world;
      return { bolts: w.missiles.filter((m) => m.kind === 'charged_bolt' && m.team === 0 && !m.dead).length, mode: w.player.mode, monsters: w.aliveMonsters().length };
    });
    console.log(`  C frame ${i}: bolts ${f.bolts}, hero ${f.mode}, monsters ${f.monsters}`);
    await shot(`cb-portrait-${i}`);
    await page.waitForTimeout(120);
  }
  const r = await page.evaluate(async () => {
    const w = window.__arpg.game().world;
    await new Promise((r) => setTimeout(r, 3000));
    const c = window.__cb.casts;
    // the bolts born at each cast: those alive the next frames that were not there before
    const seen = new Set();
    const per = [];
    for (const k of c) {
      const now = w.missiles.filter((m) => m.kind === 'charged_bolt' && m.team === 0).map((m) => m.id);
      per.push(now.filter((id) => !k.before.includes(id) && !seen.has(id)).length);
      for (const id of now) seen.add(id);
    }
    const gaps = c.slice(1).map((k, i) => (k.tick - c[i].tick) / 25);
    return { casts: c.length, gaps: gaps.map((x) => +x.toFixed(2)) };
  });
  console.log(`  C casts ${r.casts}, seconds between casts ${r.gaps.join(', ')}`);
  check(
    r.gaps.every((x) => x >= 1.95),
    'C: Charged Bolt never cast again within 2 s',
    r.gaps.join(','),
  );
}

// F — the field at 1:00 and 3:00, portrait and landscape
await page.evaluate(() => {
  const g = window.__arpg.game();
  g.character.skills = {};
  g.world.refreshPlayer();
});
for (const at of [60, 180]) {
  const sec = await playTo(at);
  for (const [o, s] of [
    ['portrait', PORTRAIT],
    ['landscape', LANDSCAPE],
  ]) {
    await page.setViewportSize(s);
    await page.waitForTimeout(900);
    const f = await field();
    console.log(`  F ${Math.round(sec)} s ${o}: alive ${f.alive}, in the window ${f.view}, within 150 px ${f.near}, level ${f.level}`);
    await shot(`field-${at}-${o}`);
  }
  await page.setViewportSize(PORTRAIT);
}
check(errs.length === 0, '0 page error', errs.join(' | '));
await browser.close();
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
