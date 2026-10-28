/**
 * Lot 317 (owner: "regenerate the imported maps to correct the waypoints"): the maps regenerated with Diablo II's waypoint rooms. For a
 * character of the base (d2, pd2), in each zone that had no waypoint room (Jail 1, Halls of the Dead 2, the Arcane Sanctuary, Lower and
 * Upper Kurast, Durance 2, the City of the Damned, the River of Flame, the Halls of Pain, Worldstone Keep 2): the waypoint stands on its
 * map's DS1 object (its room's pad under it), drawn by D2's sprite, reached on foot from the entry, touched (tap or click): the travel menu,
 * active; a close screenshot of each. The Blood Moor, the Tamoe Highland, the Rocky Waste and Worldstone Keep 1: no waypoint, and the
 * Blood Moor's former waypoint room's place shot (field now). Screenshots in test-results/e2e/campaign-waypoint-rooms-317.
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort      (D2 maps and sheets: $D2_PRIVATE_DIR/out/game)
 *   node tools/e2e/campaign-waypoint-rooms-317.mjs [--modes=d2,pd2] [--touch] [--only=a1_jail1,…] [--url=…]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { kindOf, openKind, pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const MODES = (args.get('modes') ?? 'd2,pd2').split(',');
const TOUCH = args.has('touch');
const SHOTS = join(process.cwd(), 'test-results', 'e2e', 'campaign-waypoint-rooms-317');
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

  const ROOMS = ['a1_jail1', 'a2_halls2', 'a2_arcane', 'a3_lower', 'a3_upper', 'a3_durance2', 'a4_city', 'a4_river', 'a5_death', 'a5_keep2'];
  const ONLY = args.get('only')?.split(',');
  /** a close shot around the waypoint (or a point) */
  const shotAt = async (name, p) => {
    const clip = await g((q) => {
      const a = window.__arpg;
      const w = a.game().world;
      const wp = q ?? w.objects.find((o) => o.kind === 'waypoint' && !o.mirror);
      if (!wp) return null;
      const r = a.renderer();
      const cv = document.querySelector('canvas').getBoundingClientRect();
      const s = r.worldToScreen(wp.x, wp.y);
      const x = cv.left + s.x * (cv.width / r.app.screen.width);
      const y = cv.top + s.y * (cv.height / r.app.screen.height);
      return { x: Math.max(0, x - 200), y: Math.max(0, y - 190), width: 400, height: 280 };
    }, p ?? null);
    if (clip) await page.screenshot({ path: join(SHOTS, `${mode}-${name}.png`), clip });
  };
  for (const id of ROOMS) {
    if (ONLY && !ONLY.includes(id)) continue;
    // the act's maps first (the travel menu does it; startRun alone would build the zone without its map)
    await g((a) => window.__arpg.loadCampaign(a), id.slice(0, 2));
    await g((z) => window.__arpg.game().startRun(z, 0), id);
    await shown(id);
    await page.waitForTimeout(1500);
    let s = await state();
    const on = await g(() => {
      const w = window.__arpg.game().world;
      const wp = w.objects.find((o) => o.kind === 'waypoint' && !o.mirror);
      return { hasMap: !!w.zone.d2Map, free: wp ? !w.grid.circleBlocked(wp.x, wp.y, 0.3) : false };
    });
    check(!!s.wp && /^obj_wp_/.test(s.wp.variant ?? '') && s.drawn, `${mode} ${id}: its waypoint drawn by D2's sprite`, `${s.wp?.variant} ${JSON.stringify(s.sheetIds)}`);
    check(on.hasMap && on.free, `${mode} ${id}: on the D2 map, free to stand by`);
    check(s.portals === 0, `${mode} ${id}: no town portal on arrival`);
    if (!s.wp) continue;
    await g(() => {
      const w = window.__arpg.game().world;
      const wp = w.objects.find((o) => o.kind === 'waypoint' && !o.mirror);
      w.monsters = w.monsters.filter((m) => m.pet);
      w.pendingSpawns = [];
      const f = w.grid.nearestFree(wp.x + 3, wp.y + 3, 4);
      Object.assign(w.player, { x: f.x, y: f.y, px: f.x, py: f.y, hp: w.player.hpMax });
    });
    await page.waitForTimeout(900);
    await shotAt(`${id}-waypoint`);
    check(await touchWp(), `${mode} ${id}: touched, the travel menu opens`);
    s = await state();
    check(s.active, `${mode} ${id}: active once touched`);
    await close();
    await page.waitForTimeout(500);
  }
  // no waypoint where Diablo II has none; the Blood Moor's former waypoint room (the field's piece at column 1, row 6 of its grid)
  for (const id of ['a1_bloodmoor', 'a1_tamoe', 'a2_rocky', 'a5_keep1']) {
    if (ONLY && !ONLY.includes(id)) continue;
    // the act's maps first (the travel menu does it; startRun alone would build the zone without its map)
    await g((a) => window.__arpg.loadCampaign(a), id.slice(0, 2));
    await g((z) => window.__arpg.game().startRun(z, 0), id);
    await shown(id);
    await page.waitForTimeout(1500);
    const s = await state();
    check(!s.wp, `${mode} ${id}: no waypoint (none in Diablo II)`);
    if (id === 'a1_bloodmoor') {
      const p = { x: (16 + 4) * 2.5, y: (56 + 4) * 2.5 };
      await g((q) => {
        const w = window.__arpg.game().world;
        w.monsters = w.monsters.filter((m) => m.pet);
        w.pendingSpawns = [];
        const f = w.grid.nearestFree(q.x, q.y, 8);
        Object.assign(w.player, { x: f.x, y: f.y, px: f.x, py: f.y, hp: w.player.hpMax });
      }, p);
      await page.waitForTimeout(1200);
      await shotAt('a1_bloodmoor-former-room', p);
    }
  }
  check(!errs.length, `${mode}: no page error`, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

for (const m of MODES) await play(m);
await browser.close();
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
