/**
 * Lot 315 (owner: "remove the town portal that opens by itself when travelling by waypoint to a zone of the campaign"; "add and activate
 * the waypoints in the zones that must have one, as in the real Diablo"): a character of the base (d2, pd2) in the Campaign's Act I.
 * Checked: the camp's waypoint drawn by Diablo II's sprite, touched (tap or click on it) it opens the travel menu on the Campaign, the
 * Cold Plains listed but not active; in the Cold Plains (arrived as by its exit) no town portal and no portal button, its waypoint drawn
 * by D2's sprite, touched: active, the menu opened; back to the camp by it, the Cold Plains now a destination, travelled to by the camp's
 * waypoint: arrived with no town portal. Then the Jail's first level (its waypoint room since lot 317's regenerated maps; lot 315: the
 * waypoint that room brings, on the walk from the entry, on older maps): its waypoint drawn (obj_wp_wn_a1), touched: active. Screenshots in test-results/e2e/campaign-waypoints-315.
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort      (D2 maps and sheets: $D2_PRIVATE_DIR/out/game)
 *   node tools/e2e/campaign-waypoints-315.mjs [--modes=d2,pd2] [--touch] [--url=…]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { kindOf, openKind, pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const MODES = (args.get('modes') ?? 'd2,pd2').split(',');
const TOUCH = args.has('touch');
const SHOTS = join(process.cwd(), 'test-results', 'e2e', 'campaign-waypoints-315');
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const VIEW = TOUCH ? { width: 915, height: 412 } : { width: 900, height: 600 };

async function play(mode) {
  const ctx = await browser.newContext(TOUCH ? { viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: VIEW });
  await ctx.addInitScript((m) => {
    if (!sessionStorage.getItem('e2e.init')) {
      localStorage.clear();
      localStorage.setItem('d2m.testchar.v1', '1');
      localStorage.setItem('d2m.mode', m);
      localStorage.setItem('d2m.lang', 'en');
      sessionStorage.setItem('e2e.init', '1');
    }
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  }, mode);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await page.goto(URL);
  await page.waitForSelector('.charselect', { timeout: 180000 });
  await page.waitForTimeout(1500);
  await openKind(page, kindOf(mode));
  const btn = await page.$(`[data-act="mode"][data-mode="${mode}"]`);
  if (btn) await btn.click();
  else await pickFirstMode(page);
  await page.waitForTimeout(2500);
  if (!(await page.$('.d2input')) && (await page.$('[data-act="create"]'))) {
    await page.click('[data-act="create"]');
    await page.waitForTimeout(800);
  }
  const k = await page.evaluate(() => {
    const r = document.querySelector('.d2stage').getBoundingClientRect();
    return { l: r.left, t: r.top, k: r.width / 800 };
  });
  if (TOUCH) await page.touchscreen.tap(k.l + 300 * k.k, k.t + 470 * k.k);
  else await page.mouse.click(k.l + 300 * k.k, k.t + 470 * k.k);
  await page.waitForTimeout(400);
  await page.fill('.d2input', 'Viator');
  await page.click('.d2b.ok');
  /** the zone `id` shown: no loading screen, its waypoint's view built */
  const shown = (id) =>
    page.waitForFunction(
      (z) => {
        const a = window.__arpg;
        const w = a?.game?.()?.world;
        if (!w || document.querySelector('.loading') || document.querySelector('.charselect')) return false;
        if (z && w.zone.id !== z) return false;
        const wp = w.objects.find((o) => o.kind === 'waypoint' && !o.mirror);
        return !wp || !!a.renderer().objectViews.get(wp.id);
      },
      id,
      { timeout: 400000 },
    );
  await page.waitForTimeout(2000);
  await shown(null);
  await page.waitForTimeout(2500);
  for (const b of await page.$$('.tip button, .hint button')) await b.click().catch(() => undefined);
  const g = (fn, a) => page.evaluate(fn, a);
  // the hero levelled for the zones' levels (the Jail's: 11); nothing else changed
  await g(() => {
    const gm = window.__arpg.game();
    gm.character.level = Math.max(gm.character.level, 20);
  });

  /** The zone's waypoint: its sheet, whether its view draws D2's sprite, the town portals and the portal button */
  const state = () =>
    g(() => {
      const a = window.__arpg;
      const gm = a.game();
      const w = gm.world;
      const wp = w.objects.find((o) => o.kind === 'waypoint' && !o.mirror);
      const v = wp ? a.renderer().objectViews.get(wp.id) : null;
      const pb = document.querySelector('[data-testid="portal"]');
      const portalBtn = !!pb && getComputedStyle(pb).display !== 'none';
      return {
        zone: w.zone.id,
        mode: gm.mode,
        wp: wp ? { id: wp.id, x: wp.x, y: wp.y, variant: wp.variant ?? null } : null,
        drawn: !!v?.sheet,
        sheetIds: v?.ids ?? null,
        portals: w.objects.filter((o) => o.kind === 'portal' && o.ref === 'town').length,
        portalAllowed: gm.portalAllowed(),
        portalBtn,
        active: wp ? gm.character.progression.milestones[`wp:${w.zone.id}`] !== undefined : false,
        panel: a.app.panels.open ? a.app.panels.current : null,
      };
    });
  /** Taps (or clicks) the waypoint where it is drawn, then waits for the travel menu */
  const touchWp = async () => {
    const at = await g(() => {
      const a = window.__arpg;
      const w = a.game().world;
      const wp = w.objects.find((o) => o.kind === 'waypoint' && !o.mirror);
      const r = a.renderer();
      const cv = document.querySelector('canvas').getBoundingClientRect();
      const s = r.worldToScreen(wp.x, wp.y);
      return { x: cv.left + s.x * (cv.width / r.app.screen.width), y: cv.top + s.y * (cv.height / r.app.screen.height) };
    });
    if (TOUCH) await page.touchscreen.tap(at.x, at.y);
    else await page.mouse.click(at.x, at.y);
    return page
      .waitForFunction(() => window.__arpg.app.panels.open && window.__arpg.app.panels.current === 'waypoint', null, { timeout: 30000 })
      .then(() => true)
      .catch(() => false);
  };
  /** The travel menu's Campaign card of the zone `id` (its act's list, in order): enabled? clicked if asked */
  const card = (id, click = false) =>
    g(
      ([z, c]) => {
        const a = window.__arpg;
        const gm = a.game();
        const list = gm.campaignZones('act1');
        const i = list.findIndex((x) => x.run.id === z);
        const cards = [...document.querySelectorAll('#panels .runcard')].filter((e) => e.querySelector('.diffs button'));
        const b = cards[i]?.querySelector('.diffs button');
        if (!b) return { found: false };
        const ok = !b.disabled;
        if (c && ok) b.click();
        return { found: true, ok };
      },
      [id, click],
    );
  const close = () => g(() => window.__arpg.app.openPanel('close'));
  const camp = async () => {
    // the travel menu on its Campaign tab (the camp's waypoint opens on it: `campaignActive`)
    const tab = await page.$('#panels .tabs button:has-text("Campaign")');
    if (tab) await tab.click();
    await page.waitForTimeout(300);
  };

  // 1. the camp: its waypoint D2's, touched: the menu, the Cold Plains not active yet
  let s = await state();
  check(s.zone === 'a1_town' && s.wp?.variant === 'obj_wp_wp_a1' && s.drawn, `${mode}: the camp's waypoint drawn by D2's sprite`, JSON.stringify(s.sheetIds));
  check(await touchWp(), `${mode}: the camp's waypoint touched opens the travel menu`);
  await camp();
  let c = await card('a1_coldplains');
  check(c.found && !c.ok, `${mode}: the Cold Plains listed, not active before its waypoint is touched`, JSON.stringify(c));
  await page.screenshot({ path: join(SHOTS, `${mode}-1-camp-menu.png`) });
  await close();

  // 2. the Cold Plains, arrived as by the Blood Moor's exit: no portal, its waypoint D2's, touched: active
  await g(() => window.__arpg.game().startRun('a1_coldplains', 0));
  await shown('a1_coldplains');
  await page.waitForTimeout(1500);
  s = await state();
  check(s.portals === 0, `${mode}: no town portal on arrival in the Cold Plains`, `${s.portals}`);
  check(!s.portalAllowed && !s.portalBtn, `${mode}: no portal button in the Campaign`);
  check(s.wp?.variant === 'obj_wp_wp_a1' && s.drawn, `${mode}: the Cold Plains' waypoint drawn by D2's sprite`, JSON.stringify(s.sheetIds));
  check(!s.active, `${mode}: not active before it is touched`);
  // the hero set 4 units off it, monsters away (the walk to it is the game's)
  await g(() => {
    const w = window.__arpg.game().world;
    const wp = w.objects.find((o) => o.kind === 'waypoint' && !o.mirror);
    // the zone's monsters (and those its triggers would wake) out of the way: the walk to the waypoint is the game's
    w.monsters = w.monsters.filter((m) => m.pet);
    w.pendingSpawns = [];
    const f = w.grid.nearestFree(wp.x + 3, wp.y + 3, 4);
    Object.assign(w.player, { x: f.x, y: f.y, px: f.x, py: f.y, hp: w.player.hpMax });
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOTS, `${mode}-2-coldplains-waypoint.png`) });
  check(await touchWp(), `${mode}: the Cold Plains' waypoint touched opens the travel menu`);
  s = await state();
  check(s.active, `${mode}: the Cold Plains' waypoint active once touched`);
  await camp();
  c = await card('a1_town', true);
  check(c.found && c.ok, `${mode}: the camp listed in the menu, travelled to`);
  await shown('a1_town');
  await page.waitForTimeout(1500);

  // 3. back in the camp: the Cold Plains a destination, travelled to by the camp's waypoint, no portal
  check(await touchWp(), `${mode}: the camp's waypoint touched again`);
  await camp();
  c = await card('a1_coldplains', true);
  check(c.found && c.ok, `${mode}: the Cold Plains now a destination of the camp's waypoint`, JSON.stringify(c));
  await shown('a1_coldplains');
  await page.waitForTimeout(1500);
  s = await state();
  check(s.zone === 'a1_coldplains' && s.portals === 0, `${mode}: arrived in the Cold Plains by waypoint with no town portal`, `${s.zone}, ${s.portals}`);
  await page.screenshot({ path: join(SHOTS, `${mode}-3-coldplains-arrival.png`) });

  // 4. the Jail's first level: its waypoint room (lot 317), D2's sprite, touched: active
  await g(() => window.__arpg.game().startRun('a1_jail1', 0));
  await shown('a1_jail1');
  await page.waitForTimeout(1500);
  s = await state();
  check(s.wp?.variant === 'obj_wp_wn_a1' && s.drawn, `${mode}: the Jail's waypoint drawn by D2's sprite`, JSON.stringify(s.sheetIds));
  check(s.portals === 0, `${mode}: no town portal on arrival in the Jail`);
  await g(() => {
    const w = window.__arpg.game().world;
    const wp = w.objects.find((o) => o.kind === 'waypoint' && !o.mirror);
    // the zone's monsters (and those its triggers would wake) out of the way: the walk to the waypoint is the game's
    w.monsters = w.monsters.filter((m) => m.pet);
    w.pendingSpawns = [];
    const f = w.grid.nearestFree(wp.x + 3, wp.y + 3, 4);
    Object.assign(w.player, { x: f.x, y: f.y, px: f.x, py: f.y, hp: w.player.hpMax });
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOTS, `${mode}-4-jail-waypoint.png`) });
  check(await touchWp(), `${mode}: the Jail's waypoint touched opens the travel menu`);
  s = await state();
  check(s.active, `${mode}: the Jail's waypoint active once touched`);
  await camp();
  c = await card('a1_jail1');
  check(c.found && c.ok, `${mode}: the Jail listed as a destination`);
  await page.screenshot({ path: join(SHOTS, `${mode}-5-menu.png`) });
  // the waypoint lit once touched (D2's "on" loop), seen up close
  await close();
  await page.waitForTimeout(800);
  const clip = await g(() => {
    const a = window.__arpg;
    const wp = a.game().world.objects.find((o) => o.kind === 'waypoint' && !o.mirror);
    const r = a.renderer();
    const cv = document.querySelector('canvas').getBoundingClientRect();
    const p = r.worldToScreen(wp.x, wp.y);
    const x = cv.left + p.x * (cv.width / r.app.screen.width);
    const y = cv.top + p.y * (cv.height / r.app.screen.height);
    return { x: Math.max(0, x - 120), y: Math.max(0, y - 160), width: 240, height: 200 };
  });
  await page.screenshot({ path: join(SHOTS, `${mode}-6-jail-waypoint-lit.png`), clip });
  check(!errs.length, `${mode}: no page error`, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

for (const m of MODES) await play(m);
await browser.close();
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
