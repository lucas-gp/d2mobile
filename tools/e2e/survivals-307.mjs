/**
 * Lot 307, the Run's maps (Survivals), in a browser (the dev server with the D2 graphics):
 *   for the Blood Moor, the Dark Wood and Andariel's lair (a dungeon), in portrait (412 × 915) and landscape (915 × 412): the field, the
 *   hero against the arena's edge (its visible limit), the corner automap and the centred automap (Tab map); the checks: the corner map
 *   draws no panel, the centred one opens and closes by a tap, only explored cells are drawn (fog), the points of interest are placed;
 *   0 page error. A capture of each step and size in `--shots`.
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/survivals-307.mjs [--url=http://127.0.0.1:5233/] [--shots=<dir>] [--tag=after] [--lenient=1] [--throttle=40] [--only-load=1]
 * `--throttle=<Mbit/s>`: the network at that rate and the CPU ×4 (lot 305's measure of a new character's first zone); `--only-load=1`: that
 * time only.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? 'http://127.0.0.1:5233/';
const SHOTS = args.get('shots') ?? '/tmp/survivals-307';
const TAG = args.get('tag') ?? 'after';
// before the lot's changes: captures only, the checks reported but not failing
const LENIENT = args.get('lenient') === '1';
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok && !LENIENT) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const SIZES = [
  ['portrait', { width: 412, height: 915 }],
  ['landscape', { width: 915, height: 412 }],
];
const ZONES = [
  ['a1r1', 'bloodmoor'],
  ['a1r4', 'darkwood'],
  ['a1r7', 'lair'],
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
const shot = (n) => page.screenshot({ path: join(SHOTS, `${TAG}-${n}.png`) }).catch(() => undefined);
const size = async (s) => {
  await page.setViewportSize(s);
  await page.waitForTimeout(700);
};
const inRun = () => page.waitForFunction(() => window.__arpg?.game?.().mode === 'run' && !window.__arpg.game().world.zone.town && !document.querySelector('.loading'), null, { timeout: 240000 });
/** Plays `sec` seconds of the game at `speed`× in god mode, the cards answered */
const play = (sec, speed = 2) =>
  page.evaluate(
    async ([sec, speed]) => {
      const H = window.__arpg;
      const g = H.game();
      g.settings.mods = { ...(g.settings.mods ?? {}), survivals: { ...(g.settings.mods?.survivals ?? {}), cards: 'auto' } };
      H.speed(speed);
      const t0 = g.world.tick;
      await new Promise((r) => {
        const iv = setInterval(() => {
          H.game().world.godMode = true;
          for (const b of document.querySelectorAll('.mod-screen .sv-card')) b.click();
          if (H.game().world.tick - t0 >= sec * 25 || H.game().mode !== 'run') {
            clearInterval(iv);
            r();
          }
        }, 50);
      });
      H.speed(1);
    },
    [sec, speed],
  );
/** The arena's playable rectangle (the window cut from the map, else the zone less its border) */
const box = () =>
  page.evaluate(() => {
    const z = window.__arpg.game().world.zone;
    // a window cut from the map: its four invisible walls; a synthetic arena: its 3-unit border
    const b = z.blockers.map((x) => x.rect);
    return b.length === 4 && b[0][1] === 0 && b[0][0] === 0 ? { x0: b[2][2], y0: b[0][3], x1: b[3][0], y1: b[1][1] } : { x0: 3, y0: 3, x1: z.width - 3, y1: z.height - 3 };
  });
const teleport = (x, y) => page.evaluate(([x, y]) => window.__arpg.teleport(x, y), [x, y]);
const mapToggle = () =>
  page.evaluate(() => {
    const m = document.querySelector('[data-sv="automap"]') ?? document.querySelector('#hud .minimap');
    m?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return !!m;
  });

const THROTTLE = Number(args.get('throttle') ?? 0);
if (THROTTLE > 0) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: (THROTTLE * 1e6) / 8, uploadThroughput: (THROTTLE * 1e6) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}
await page.goto(URL);
await page.waitForSelector('.d2c, .charselect', { timeout: 120000 });
if (await page.$('.d2c')) await page.click('.d2c-skip');
await pickMode(page, 'd2+survivals', { timeout: 10000 }).catch(() => undefined);
await page.waitForSelector('.charselect input[type="text"], .d2input', { timeout: 120000 });
const d2ui = !!(await page.$('.d2input'));
await page.fill(d2ui ? '.d2input' : '.charselect input[type="text"]', 'Lot307');
const t0 = Date.now();
await page.click(d2ui ? '.d2b.ok' : '.charselect .btn.primary.big');
await inRun();
console.log(`  creation tap -> first zone playable: ${Date.now() - t0} ms (dev server${THROTTLE ? `, ${THROTTLE} Mbit/s, CPU ×4` : ', no throttling'})`);
if (args.get('only-load') === '1') {
  await browser.close();
  process.exit(0);
}
await page.waitForTimeout(800);
await play(1, 1);

for (const [id, name] of ZONES) {
  if (id !== 'a1r1') {
    const t1 = Date.now();
    await page.evaluate((id) => window.__arpg.startRun(`survivals:${id}`, 0), id);
    await inRun();
    console.log(`  ${name}: zone playable in ${Date.now() - t1} ms`);
    await page.waitForTimeout(600);
  }
  const b = await box();
  console.log(`  ${name}: arena ${(b.x1 - b.x0).toFixed(0)} × ${(b.y1 - b.y0).toFixed(0)} units`);
  await play(8);
  const info = await page.evaluate(() => {
    const g = window.__arpg.game();
    const pois = g.world.objects.filter((o) => o.kind === 'chest' || o.kind === 'shrine').map((o) => ({ kind: o.kind, x: Math.round(o.x), y: Math.round(o.y) }));
    return { pois, props: g.world.zone.props.length };
  });
  console.log(`  ${name}: ${info.pois.length} points of interest, ${info.props} border props`);
  if (TAG !== 'before') {
    // a point of interest in sight (a shrine, else a chest), then walked over: used once
    await size(SIZES[0][1]);
    const poi = await page.evaluate(() => {
      const d = window.__arpg.game().world.run.director;
      const q = d.pois?.list.find((x) => x.kind === 'shrine') ?? d.pois?.list.find((x) => x.kind === 'chest');
      return q ? { kind: q.kind, x: q.x, y: q.y, shrine: q.shrine ?? '' } : null;
    });
    check(!!poi, `${name}: a point of interest placed`, JSON.stringify(poi));
    if (poi) {
      await teleport(poi.x + 2.5, poi.y + 2.5);
      await play(1);
      await shot(`${name}-portrait-poi`);
      await teleport(poi.x, poi.y + 0.5);
      await play(0.5);
      const used = await page.evaluate(() =>
        window.__arpg
          .game()
          .world.run.director.pois.list.filter((x) => x.used)
          .map((x) => x.kind),
      );
      check(used.includes(poi.kind), `${name}: the ${poi.kind} used by walking over it`, used.join(','));
      await page.waitForTimeout(400);
      await shot(`${name}-portrait-poi-used`);
    }
  }
  for (const [o, s] of SIZES) {
    await size(s);
    await play(1);
    await shot(`${name}-${o}-field`);
    // the corner map: no filled panel
    const corner = await page.evaluate(() => {
      const m = document.querySelector('[data-sv="automap"]');
      if (!m) return null;
      const r = m.getBoundingClientRect();
      return { w: r.width, h: r.height, bg: getComputedStyle(m).backgroundColor, border: getComputedStyle(m).borderTopWidth };
    });
    if (TAG !== 'before') check(!!corner && corner.w > 60 && /rgba\(0, 0, 0, 0\)|transparent/.test(corner.bg), `${name} ${o}: corner automap with no panel fill`, JSON.stringify(corner));
    // the hero against the arena's edge (upper left on the screen)
    await teleport(b.x0 + 2.5, (b.y0 + b.y1) / 2);
    await play(1.5);
    await shot(`${name}-${o}-edge`);
    if (TAG !== 'before') {
      // the darkness's edge on the renderer's own projection of the arena's edge (px off the line)
      const off = await page.evaluate((b) => {
        const R = window.__arpg.renderer?.();
        const pl = document.querySelector('[data-sv="bounds"] .sv-edge');
        if (!R || !pl) return null;
        const m = /translate\(([-\d.]+)px, ([-\d.]+)px\) rotate\(([-\d.]+)rad\)/.exec(pl.style.transform);
        if (!m) return null;
        const [tx, ty, a] = [+m[1], +m[2], +m[3]];
        const p = window.__arpg.game().world.player;
        const s = R.worldToScreen(b.x0, p.y);
        return Math.abs((s.x - tx) * Math.cos(a) + (s.y - ty) * Math.sin(a));
      }, b);
      check(off !== null && off < 6, `${name} ${o}: the darkness starts on the arena's edge`, `${off?.toFixed(1)} px off`);
    }
    // a walk across the arena, then the centred map (Tab map)
    for (const [fx, fy] of [
      [0.5, 0.5],
      [0.3, 0.3],
      [0.7, 0.4],
    ]) {
      await teleport(b.x0 + (b.x1 - b.x0) * fx, b.y0 + (b.y1 - b.y0) * fy);
      await play(0.6);
    }
    await mapToggle();
    await page.waitForTimeout(500);
    await shot(`${name}-${o}-map`);
    if (TAG !== 'before') {
      const big = await page.evaluate(() => {
        const m = document.querySelector('[data-sv="automap-big"]');
        return m ? { shown: getComputedStyle(m).display !== 'none', w: m.getBoundingClientRect().width } : null;
      });
      check(!!big?.shown && big.w > 200, `${name} ${o}: the centred automap opens`, JSON.stringify(big));
      const fog = await page.evaluate(() => {
        const m = document.querySelector('[data-sv="automap"]');
        return m ? { seen: +m.dataset.seen, total: +m.dataset.total } : null;
      });
      check(!!fog && fog.seen > 0 && fog.seen < fog.total, `${name} ${o}: fog of war (explored cells only)`, JSON.stringify(fog));
    }
    await mapToggle();
    await page.waitForTimeout(300);
    if (TAG !== 'before') {
      const closed = await page.evaluate(() => getComputedStyle(document.querySelector('[data-sv="automap-big"]')).display === 'none');
      check(closed, `${name} ${o}: the centred automap closes`);
    }
  }
}
check(errs.length === 0, '0 page error', errs.join(' | '));
await browser.close();
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
