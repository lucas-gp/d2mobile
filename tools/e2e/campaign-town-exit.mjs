/**
 * Campaign, Act I (owner, lot 310: "in Campaign, Act I, in town, I cannot leave the town"): a character created in a mode starts in the
 * Rogue Encampment, walks (mouse held, or the touch joystick with `--touch`) to the town's edge toward the Blood Moor and is in the Blood
 * Moor within 40 s; the HUD names the town, not Harrogath. `--reload` plays it again with the character continued (list, reload).
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort      (D2 maps: $D2_PRIVATE_DIR/out/game; local build with the optional encrypted loader: E2E_URL + D2_PASSWORD)
 *   node tools/e2e/campaign-town-exit.mjs [--modes=d2,pd2] [--touch] [--reload] [--url=…]
 * The password (encrypted graphics) is read from the environment only, typed into the lock screen, never printed.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { kindOf, openKind, pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const MODES = (args.get('modes') ?? 'd2,pd2').split(',');
const TOUCH = args.has('touch');
const RELOAD = args.has('reload');
const SHOTS = args.get('shots') ?? join(process.cwd(), 'test-results', 'e2e', 'campaign-town-exit');
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const VIEW = TOUCH ? { width: 844, height: 390 } : { width: 900, height: 600 };

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
  const cdp = await ctx.newCDPSession(page);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await page.goto(URL);
  if (process.env.D2_PASSWORD) {
    const inp = await page.waitForSelector('input[name="d2pw"]', { timeout: 60000 }).catch(() => null);
    if (inp) {
      await inp.fill(process.env.D2_PASSWORD);
      await inp.press('Enter');
    }
  }
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
  // the Sorceress, touched at her feet on the 800 × 600 stage
  const k = await page.evaluate(() => {
    const r = document.querySelector('.d2stage').getBoundingClientRect();
    return { l: r.left, t: r.top, k: r.width / 800 };
  });
  if (TOUCH) await page.touchscreen.tap(k.l + 300 * k.k, k.t + 470 * k.k);
  else await page.mouse.click(k.l + 300 * k.k, k.t + 470 * k.k);
  await page.waitForTimeout(400);
  await page.fill('.d2input', 'Exitus');
  await page.click('.d2b.ok');
  const ready = () => page.waitForFunction(() => window.__arpg?.game?.() && !document.querySelector('.loading') && !document.querySelector('.charselect'), null, { timeout: 400000 });
  await page.waitForTimeout(2000);
  await ready();
  if (RELOAD) {
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.__arpg.app.switchCharacter());
    await page.waitForTimeout(2000);
    await page.waitForSelector('.d2plate', { timeout: 200000 });
    await page.click('.d2plate');
    await page.click('.d2b.ok');
    await page.waitForTimeout(2000);
    await ready();
  }
  await page.waitForTimeout(2500);
  for (const b of await page.$$('.tip button, .hint button')) await b.click().catch(() => undefined);
  const town = await page.evaluate(() => {
    const g = window.__arpg.game();
    const w = g.world;
    const exit = w.objects.find((o) => o.kind === 'portal' && o.ref === 'zone:a1_bloodmoor');
    // lot 311: the exit joined edge to edge to the Blood Moor is crossed by walking on through the gate, past the map's edge
    const s = w.zone.seams?.find((x) => x.to === 'a1_bloodmoor');
    const goal = s ? { x: (s.cross[0] + s.cross[2]) / 2, y: -3 } : exit ? { x: exit.x, y: exit.y } : null;
    return { mode: g.mode, zone: w.zone.id, map: !!w.zone.d2Map, exit: goal, hud: document.querySelector('.lvl')?.textContent ?? '' };
  });
  check(town.mode === 'town' && town.zone === 'a1_town', `${mode}: the character in the Rogue Encampment`, `${town.mode} ${town.zone}, D2 map ${town.map}`);
  check(!!town.exit, `${mode}: the town's exit toward the Blood Moor`);
  check(!/Harrogath/.test(town.hud), `${mode}: the HUD names the town`, town.hud);
  await page.screenshot({ path: join(SHOTS, `${mode}-town.png`) });
  if (!town.exit) return ctx.close();
  // walk: the pointer (or the joystick) held toward the exit, at most 150 px ahead of the hero
  const t0 = Date.now();
  let down = false;
  let reached = null;
  const jx = VIEW.width * 0.14;
  const jy = VIEW.height * 0.68;
  while (Date.now() - t0 < 40000) {
    const st = await page.evaluate((t) => {
      const w = window.__arpg.game().world;
      const r = window.__arpg.renderer();
      const cv = document.querySelector('canvas').getBoundingClientRect();
      // the way around the palisade (the path a player follows), not the straight line through it
      const d = w.steer(t.x, t.y) ?? { x: t.x - w.player.x, y: t.y - w.player.y };
      const n = Math.hypot(d.x, d.y) || 1;
      return {
        zone: w.zone.id,
        s: r.worldToScreen(w.player.x + (d.x / n) * 4, w.player.y + (d.y / n) * 4),
        c: r.worldToScreen(w.player.x, w.player.y),
        cv: [cv.left, cv.top, cv.width / r.app.screen.width, cv.height / r.app.screen.height],
      };
    }, town.exit);
    if (st.zone !== 'a1_town') {
      reached = { zone: st.zone, sec: (Date.now() - t0) / 1000 };
      break;
    }
    const dx = st.s.x - st.c.x;
    const dy = st.s.y - st.c.y;
    const n = Math.hypot(dx, dy) || 1;
    if (TOUCH) {
      if (!down) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx, y: jy, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: jx + (dx / n) * 60, y: jy + (dy / n) * 60, id: 1 }] });
    } else {
      const q = Math.min(1, 150 / n);
      await page.mouse.move(st.cv[0] + (st.c.x + dx * q) * st.cv[2], st.cv[1] + (st.c.y + dy * q) * st.cv[3]);
      if (!down) await page.mouse.down();
    }
    down = true;
    await page.waitForTimeout(250);
  }
  if (TOUCH) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else await page.mouse.up();
  check(reached?.zone === 'a1_bloodmoor', `${mode}: the Blood Moor reached by walking`, reached ? `${reached.sec.toFixed(1)} s` : 'still in town after 40 s');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SHOTS, `${mode}-bloodmoor.png`) });
  check(!errs.length, `${mode}: no page error`, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

for (const m of MODES) await play(m);
await browser.close();
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
