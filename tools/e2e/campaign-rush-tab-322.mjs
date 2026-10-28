/**
 * Lot 322 (owner: "keep a Rush tab when the waypoint opens, so the player may switch to the Rush at any time"): a character of the base
 * (d2, pd2) in the Campaign. Checked in the running game (the app's own loop, renderer, HUD and panels), by taps on a phone:
 *  1. the camp's waypoint: opened on its Campaign tab, the Rush tab beside it, whole on the screen (a tap target ≥ 28 px, the panels’ tab size), Act I only;
 *  2. in the Stony Field (its waypoint touched, its Tristram lock shut): the waypoint's Rush tab tapped shows the Rush's runs, the
 *     Countess tapped starts the Rush's run: a run apart (no Campaign, its portal home, no lock to pass), the Stony Field kept;
 *  3. its portal home: Harrogath, whose waypoint keeps both tabs (the Rush reachable as before); its Campaign tab, Act I, the Stony
 *     Field tapped: back in the Stony Field as it was left (same world), its waypoint and milestones kept, Tristram still locked.
 * Screenshots in test-results/e2e/campaign-rush-tab-322.
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort      (D2 maps and sheets: $D2_PRIVATE_DIR/out/game)
 *   node tools/e2e/campaign-rush-tab-322.mjs [--modes=d2,pd2] [--touch] [--portrait] [--url=…]
 *   (--portrait: also turned to 412 × 915 in the camp, the Stony Field and Harrogath: d2/pd2 are played in landscape, the "rotate your
 *    device" prompt covers the game there; turned back, the checks above)
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { kindOf, openKind, pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const MODES = (args.get('modes') ?? 'd2,pd2').split(',');
const TOUCH = args.has('touch') || args.has('portrait');
const PORTRAIT = args.has('portrait');
const SHOTS = join(process.cwd(), 'test-results', 'e2e', 'campaign-rush-tab-322');
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const VIEW = TOUCH ? { width: 915, height: 412 } : { width: 900, height: 600 };
const tag = PORTRAIT ? 'portrait' : TOUCH ? 'touch' : 'mouse';

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
  await page.fill('.d2input', 'Cursor');
  await page.click('.d2b.ok');
  /** the zone (or run) `id` shown: no loading screen */
  const shown = (id) =>
    page
      .waitForFunction(
        (z) => {
          const a = window.__arpg;
          const w = a?.game?.()?.world;
          if (!w || document.querySelector('.loading') || document.querySelector('.charselect')) return false;
          return !z || w.zone.id === z || (a.game().mode === 'run' && a.game().runDef?.id === z);
        },
        id,
        { timeout: 400000 },
      )
      .then(() => true)
      .catch(() => false);
  await page.waitForTimeout(2000);
  await shown(null);
  await page.waitForTimeout(2500);
  for (const b of await page.$$('.tip button, .hint button')) await b.click().catch(() => undefined);
  /**
   * --portrait: d2 and pd2 are played in landscape (rule `ui.orientation`): turned to 412 × 915 in game, the "rotate your device" prompt
   * covers the field and its waypoint; turned back, the waypoint and its tabs as in landscape (checked below, the phone held sideways)
   */
  const portraitCheck = async (step) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.waitForTimeout(1200);
    const rot = await page.evaluate(() => {
      const r = document.querySelector('.rotate');
      if (!r) return { shown: false };
      const cs = getComputedStyle(r);
      const b = r.getBoundingClientRect();
      return { shown: cs.display !== 'none' && cs.visibility !== 'hidden' && b.width >= innerWidth - 1 && b.height >= innerHeight - 1 };
    });
    check(rot.shown, `${mode}/portrait: ${step}: in portrait the "rotate your device" prompt covers the game (landscape only)`);
    await page.screenshot({ path: join(SHOTS, `${mode}-portrait-${step}.png`) });
    await page.setViewportSize(VIEW);
    await page.waitForTimeout(1200);
  };
  const g = (fn, a) => page.evaluate(fn, a);
  await g(() => {
    const gm = window.__arpg.game();
    gm.character.level = Math.max(gm.character.level, 40);
    gm.world.refreshPlayer();
  });
  const close = () => g(() => window.__arpg.app.openPanel('close'));
  const where = () =>
    g(() => {
      const gm = window.__arpg.game();
      return { zone: gm.world.zone.id, mode: gm.mode, run: gm.runDef?.id ?? null, camp: gm.campaignActive };
    });
  /** The waypoint menu: its tabs, the selected mode tab, whether the Rush tab is whole on the screen and big enough to tap */
  const menu = () =>
    g(() => {
      const p = document.querySelector('#panels');
      const btns = [...p.querySelectorAll('.tabs .btn')];
      const rush = btns.find((b) => /Rush/.test(b.textContent));
      const r = rush?.getBoundingClientRect();
      const onScreen = !!r && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 && r.width >= 28 && r.height >= 28;
      return {
        tabs: btns.map((b) => b.textContent),
        sel: p.querySelector('.tabs .btn.sel')?.textContent ?? null,
        rush: !!rush,
        onScreen,
        size: r ? `${Math.round(r.width)}×${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)}` : '',
        hscroll: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
  const openWp = async (step) => {
    await close();
    if (PORTRAIT && step) await portraitCheck(step);
    await g(() => window.__arpg.app.openPanel('waypoint'));
    await page.waitForFunction(() => window.__arpg.app.panels.open && window.__arpg.app.panels.current === 'waypoint', null, { timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(500);
  };
  /** Taps (or clicks) the element; scrolled into view first */
  const tap = async (loc) => {
    await loc.scrollIntoViewIfNeeded().catch(() => undefined);
    if (TOUCH) await loc.tap();
    else await loc.click();
    await page.waitForTimeout(500);
  };
  const tabLoc = (re) => page.locator('#panels .tabs .btn').filter({ hasText: re }).first();
  /** The card of run `id` (by its shown name), its first difficulty's button */
  const cardLoc = async (id) => {
    const name = await g((r) => {
      const card = [...document.querySelectorAll('#panels .runcard')];
      // the cards follow the menu's order: the Rush's runs (`runOptions`) or the act's zones (`campaignZones`)
      const gm = window.__arpg.game();
      const rush = [...new Set(gm.runOptions().map((o) => o.run.id))];
      const i = rush.indexOf(r);
      return i >= 0 && card[i] ? card[i].querySelector('h3')?.textContent : null;
    }, id);
    return name
      ? page
          .locator('#panels .runcard')
          .filter({ has: page.locator('h3', { hasText: name }) })
          .first()
          .locator('.diffs button')
          .first()
      : null;
  };

  // 1. the camp: its waypoint on the Campaign, the Rush tab beside it
  let at = await where();
  check(at.zone === 'a1_town' && at.camp === 'act1', `${mode}/${tag}: the hero in the Rogue Encampment`, JSON.stringify(at));
  await openWp('camp');
  let m = await menu();
  check(m.rush && m.onScreen, `${mode}/${tag}: the camp's waypoint shows the Rush tab, whole on the screen`, `${m.tabs.join(' | ')} — ${m.size}`);
  check(/Campaign|Campagne/.test(m.sel ?? ''), `${mode}/${tag}: opened on the Campaign tab`, m.sel);
  check(m.tabs.some((t) => /Act I\b/.test(t)) && !m.tabs.some((t) => /Act II\b/.test(t)), `${mode}/${tag}: Act I only (lot 319 kept)`, m.tabs.join(' | '));
  check(!m.hscroll, `${mode}/${tag}: no sideways scroll of the page`);
  await page.screenshot({ path: join(SHOTS, `${mode}-${tag}-1-camp-waypoint.png`) });
  await close();

  // 2. the Stony Field: its waypoint touched, its lock shut; the Rush tab → the Countess
  await g(() => window.__arpg.game().startRun('a1_stonyfield', 0));
  check(await shown('a1_stonyfield'), `${mode}/${tag}: in the Stony Field`);
  await page.waitForTimeout(1500);
  const before = await g(() => {
    const gm = window.__arpg.game();
    gm.touchWaypoint();
    window.__e2eStony = gm.world;
    const p = gm.character.progression;
    return { milestones: { ...p.milestones }, completions: { ...p.completions }, lock: gm.passageLock('a1_tristram'), gold: gm.character.gold };
  });
  check(!!before.lock, `${mode}/${tag}: Tristram locked from the Stony Field`, before.lock ?? '');
  await openWp('stony');
  m = await menu();
  check(
    m.rush && m.onScreen && /Campaign|Campagne/.test(m.sel ?? ''),
    `${mode}/${tag}: the Stony Field's waypoint: on the Campaign, the Rush tab beside it`,
    `${m.tabs.join(' | ')} [${m.sel}] ${m.size}`,
  );
  await tap(tabLoc(/Rush/));
  m = await menu();
  const countess = await cardLoc('countess');
  check(/Rush/.test(m.sel ?? '') && !!countess, `${mode}/${tag}: the Rush tab tapped: the Rush's runs (the Countess listed)`, m.sel);
  await page.screenshot({ path: join(SHOTS, `${mode}-${tag}-2-zone-rush-tab.png`) });
  if (countess) await tap(countess);
  check(await shown('countess'), `${mode}/${tag}: the Countess tapped: the Rush's run starts`);
  await page.waitForTimeout(1500);
  const rush = await g(() => {
    const gm = window.__arpg.game();
    const p = gm.character.progression;
    return {
      run: gm.runDef?.id,
      camp: gm.campaignActive,
      inCampaign: gm.inCampaignZone(),
      portal: gm.world.objects.some((o) => o.kind === 'portal' && o.ref === 'town'),
      lock: gm.passageLock('a1_tristram'),
      kept: gm.kept.peek('a1_stonyfield', 0) === window.__e2eStony,
      campaignMilestones: Object.keys(p.milestones).filter((k) => /^(zone|wp):/.test(k)),
    };
  });
  check(rush.run === 'countess' && rush.camp === null && !rush.inCampaign, `${mode}/${tag}: a Rush run apart (no Campaign)`, JSON.stringify(rush));
  check(rush.portal && rush.lock === null, `${mode}/${tag}: the Rush run has its portal home, no Campaign lock`);
  check(rush.kept, `${mode}/${tag}: the Stony Field left is kept for the session`);
  const newCamp = rush.campaignMilestones.filter((k) => !(k in before.milestones));
  check(newCamp.length === 0, `${mode}/${tag}: no Campaign milestone from the Rush`, newCamp.join(','));
  await page.screenshot({ path: join(SHOTS, `${mode}-${tag}-3-countess.png`) });

  // 3. home by its portal: Harrogath, both tabs; the Campaign tab → the Stony Field as it was left
  await g(() => {
    const w = window.__arpg.game().world;
    const o = w.objects.find((x) => x.kind === 'portal' && x.ref === 'town');
    if (o) w.events.push({ t: 'interact', kind: 'portal', ref: o.ref, objectId: o.id });
  });
  check(await shown('harrogath'), `${mode}/${tag}: the portal home leads to Harrogath`);
  await page.waitForTimeout(1500);
  at = await where();
  check(at.zone === 'harrogath' && at.mode === 'town' && at.camp === null, `${mode}/${tag}: in Harrogath (the Rush's hub)`, JSON.stringify(at));
  await openWp('harrogath');
  m = await menu();
  check(m.rush && m.onScreen && m.tabs.some((t) => /Campaign|Campagne/.test(t)), `${mode}/${tag}: Harrogath's waypoint keeps both tabs`, m.tabs.join(' | '));
  await tap(tabLoc(/Rush/));
  check(!!(await cardLoc('baal')), `${mode}/${tag}: Harrogath's Rush tab: the Rush's runs (Baal listed)`);
  await tap(tabLoc(/Campaign|Campagne/));
  await tap(tabLoc(/^Act I$/));
  const stonyName = await g(
    () =>
      window.__arpg
        .game()
        .campaignZones('act1')
        .find((z) => z.run.id === 'a1_stonyfield')?.run.name,
  );
  const idx = await g(() => {
    const gm = window.__arpg.game();
    return gm.campaignZones('act1').findIndex((z) => z.run.id === 'a1_stonyfield');
  });
  const btnStony = page
    .locator('#panels .runcard')
    .filter({ has: page.locator('.diffs button') })
    .nth(idx)
    .locator('.diffs button')
    .first();
  const ok = await btnStony.isEnabled().catch(() => false);
  check(ok, `${mode}/${tag}: Harrogath's Campaign tab: the Stony Field a destination`, stonyName ?? '');
  await page.screenshot({ path: join(SHOTS, `${mode}-${tag}-4-harrogath-campaign.png`) });
  if (ok) await tap(btnStony);
  check(await shown('a1_stonyfield'), `${mode}/${tag}: back in the Stony Field from Harrogath's waypoint`);
  await page.waitForTimeout(1500);
  const after = await g((b) => {
    const gm = window.__arpg.game();
    const p = gm.character.progression;
    const lost = Object.keys(b.milestones).filter((k) => p.milestones[k] !== b.milestones[k]);
    const lostC = Object.keys(b.completions).filter((k) => (p.completions[k] ?? 0) < b.completions[k]);
    return { same: gm.world === window.__e2eStony, camp: gm.campaignActive, lock: gm.passageLock('a1_tristram'), lost, lostC };
  }, before);
  check(after.same && after.camp === 'act1', `${mode}/${tag}: the Stony Field as it was left (same zone), in the Campaign`, JSON.stringify(after));
  check(after.lost.length === 0 && after.lostC.length === 0, `${mode}/${tag}: no progression lost`, [...after.lost, ...after.lostC].join(','));
  check(after.lock === before.lock, `${mode}/${tag}: Tristram still locked (the Rush passed no lock)`, after.lock ?? '');
  await openWp();
  m = await menu();
  check(m.rush && /Campaign|Campagne/.test(m.sel ?? ''), `${mode}/${tag}: its waypoint again on the Campaign, the Rush tab beside it`, `${m.tabs.join(' | ')} [${m.sel}]`);
  await page.screenshot({ path: join(SHOTS, `${mode}-${tag}-5-back-stony.png`) });
  await close();
  check(errs.length === 0, `${mode}/${tag}: no page error`, errs.join(' / '));
  await ctx.close();
}

try {
  for (const mode of MODES) await play(mode);
} finally {
  await browser.close();
}
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
