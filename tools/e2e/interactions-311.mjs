/**
 * Lot 311 (owner: "after a first interaction, the other interactions with a chest or an NPC do not work"): in the Rogue Encampment, on a
 * touch screen (Galaxy Z Fold unfolded, 884 × 1104), the hero walks with the joystick to each NPC, the stash and the waypoint in turn and
 * uses the context button; the dialog is left by "Goodbye", the panel by its close button; then once more on the body of an NPC (a tap).
 * Before the fix the context button was never shown again once hidden (memoised style written around the memo).
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort      (D2 maps: $D2_PRIVATE_DIR/out/game)
 *   node tools/e2e/interactions-311.mjs [--modes=d2,pd2] [--url=…]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { kindOf, openKind } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const MODES = (args.get('modes') ?? 'd2').split(',');
const SHOTS = join(process.cwd(), 'test-results', 'e2e', 'interactions-311');
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function play(mode) {
  const ctx = await browser.newContext({ viewport: { width: 884, height: 1104 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
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
  await page.waitForSelector('.charselect', { timeout: 180000 });
  await page.waitForTimeout(1500);
  await openKind(page, kindOf(mode));
  const btn = await page.$(`[data-act="mode"][data-mode="${mode}"]`);
  if (btn) await btn.tap();
  await page.waitForTimeout(2500);
  if (!(await page.$('.d2input')) && (await page.$('[data-act="create"]'))) {
    await page.tap('[data-act="create"]');
    await page.waitForTimeout(800);
  }
  const k = await page.evaluate(() => {
    const r = document.querySelector('.d2stage').getBoundingClientRect();
    return { l: r.left, t: r.top, k: r.width / 800 };
  });
  await page.touchscreen.tap(k.l + 300 * k.k, k.t + 470 * k.k);
  await page.waitForTimeout(400);
  await page.fill('.d2input', 'Hello');
  await page.tap('.d2b.ok');
  await page.waitForTimeout(2000);
  await page.waitForFunction(() => window.__arpg?.game?.() && !document.querySelector('.loading') && !document.querySelector('.charselect'), null, { timeout: 400000 });
  await page.waitForTimeout(2500);
  const joy = await page.evaluate(() => {
    const r = document.querySelector('.joy-zone').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.6 };
  });
  const state = () =>
    page.evaluate(() => {
      const app = window.__arpg.app;
      const c = document.querySelector('.ctxbtn');
      return { ui: app.panels.open ? `panel:${app.panels.current}` : document.querySelector('.npc-dialog') ? 'dialog' : null, ctx: c && getComputedStyle(c).display !== 'none' ? c.textContent : null };
    });
  async function walkNear(o, within) {
    let down = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      const st = await page.evaluate(
        ([x, y]) => {
          const w = window.__arpg.game().world;
          const s = w.steer(x, y) ?? { x: x - w.player.x, y: y - w.player.y };
          const r = window.__arpg.renderer();
          const a = r.worldToScreen(w.player.x, w.player.y);
          const b = r.worldToScreen(w.player.x + s.x, w.player.y + s.y);
          return { d: Math.hypot(w.player.x - x, w.player.y - y), sx: b.x - a.x, sy: b.y - a.y };
        },
        [o.x, o.y],
      );
      if (st.d < within) break;
      const n = Math.hypot(st.sx, st.sy) || 1;
      if (!down) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joy.x, y: joy.y, id: 1 }] });
      down = true;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: joy.x + (st.sx / n) * 60, y: joy.y + (st.sy / n) * 60, id: 1 }] });
      await page.waitForTimeout(120);
    }
    if (down) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);
  }
  for (const ref of ['akara', 'charsi', 'stash', 'kashya', 'gheed', 'stash', 'waypoint', 'akara']) {
    const o = await page.evaluate((r) => {
      const ob = window.__arpg.game().world.objects.find((x) => x.ref === r || x.kind === r);
      return ob && { x: ob.x, y: ob.y };
    }, ref);
    if (!o) {
      check(false, `${mode}: ${ref} in the town`);
      continue;
    }
    await walkNear(o, 1.8);
    const before = await state();
    if (before.ctx) await page.tap('.ctxbtn');
    let st = before;
    for (let i = 0; i < 24 && !st.ui; i++) {
      await page.waitForTimeout(250);
      st = await state();
    }
    check(!!before.ctx && !!st.ui, `${mode}: ${ref} by the context button`, `button ${before.ctx ?? 'hidden'}, ${st.ui ?? 'nothing opened'}`);
    if (st.ui === 'dialog') {
      const bs = await page.$$('.npc-dialog .nd-btn');
      await bs[bs.length - 1].tap();
      await page.waitForTimeout(500);
    }
    if (await page.evaluate(() => window.__arpg.app.panels.open)) {
      await page.tap('#panels .close');
      await page.waitForTimeout(500);
    }
  }
  // a tap on Kashya's body (her chest, up the screen from her feet), from a few steps away (she stands on the right of the screen, away from the joystick's zone)
  const kas = await page.evaluate(() => {
    const w = window.__arpg.game().world;
    const o = w.objects.find((x) => x.ref === 'kashya');
    return { x: o.x, y: o.y };
  });
  await walkNear({ x: kas.x - 3, y: kas.y + 3 }, 1.2);
  const s = await page.evaluate(
    ([x, y]) => {
      const r = window.__arpg.renderer();
      const cv = document.querySelector('canvas').getBoundingClientRect();
      const p = r.worldToScreen(x - 1.2, y - 1.2);
      return { x: cv.left + (p.x * cv.width) / r.app.screen.width, y: cv.top + (p.y * cv.height) / r.app.screen.height };
    },
    [kas.x, kas.y],
  );
  await page.touchscreen.tap(s.x, s.y);
  let st = await state();
  for (let i = 0; i < 24 && !st.ui; i++) {
    await page.waitForTimeout(250);
    st = await state();
  }
  check(st.ui === 'dialog', `${mode}: Kashya by a tap on her body`, st.ui ?? 'nothing opened');
  await page.screenshot({ path: join(SHOTS, `${mode}-kashya.png`) });
  check(!errs.length, `${mode}: no page error`, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

for (const m of MODES) await play(m);
await browser.close();
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
