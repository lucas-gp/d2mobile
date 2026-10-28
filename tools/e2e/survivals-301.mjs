/**
 * Lot 301, the owner's returns on the Run (Survivals, Act I), in a browser (the dev server or the production build, the mode built in):
 *   H1. the run's HUD in the six sizes (phone and Fold, portrait and landscape): the zone's name (and its act, its zone n / N) top right
 *       above the minimap, the clock and the next mini-boss small at the top's centre with the pause, the kills, the gold and the live
 *       monsters small under the life gauge; nothing of it in the middle of the field; the pause ≥ 44 px; one capture a size;
 *   C1. every spell independent: a hero with six spells all ready casts them in the same tick, and each skill's preview fills over its
 *       own cooldown, never moved back by another cast;
 *   S1. the monsters brought beyond the screen as the renderer draws it (its size and zoom): none appears on the screen;
 *   T1. a zone's end to the next zone playable (the countdown tapped): its time, under `--transition-max` ms (default 1000);
 *   0 page error.
 *   D2_PUBLIC=1 D2_ALLOW_SKIP=1 npx vite --host 127.0.0.1 --port 5233 --strictPort      (or: npx vite build && npx vite preview --port 5234)
 *   node tools/e2e/survivals-301.mjs [--url=http://127.0.0.1:5233/] [--shots=<dir>] [--only=H,C,S,T] [--cpu=1] [--transition-max=1000]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? 'http://127.0.0.1:5233/';
const SHOTS = args.get('shots') ?? '/tmp/survivals-301';
const ONLY = new Set((args.get('only') ?? 'H,C,S,T').split(','));
const CPU = Number(args.get('cpu') ?? 1);
const T_MAX = Number(args.get('transition-max') ?? 1000);
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const SIZES = {
  'phone-portrait': { width: 390, height: 844 },
  'phone-landscape': { width: 844, height: 390 },
  'fold-folded-portrait': { width: 344, height: 882 },
  'fold-folded-landscape': { width: 882, height: 344 },
  'fold-open-portrait': { width: 884, height: 1104 },
  'fold-open-landscape': { width: 1104, height: 884 },
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: SIZES['phone-portrait'], deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
if (CPU > 1) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
}
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
/** Plays `sec` seconds of the game at `speed`× in god mode, the cards answered */
const play = (sec, speed = 4) =>
  page.evaluate(
    async ([sec, speed]) => {
      const H = window.__arpg;
      const g = H.game();
      g.settings.mods = { ...(g.settings.mods ?? {}), survivals: { ...(g.settings.mods?.survivals ?? {}), cards: 'auto' } };
      H.speed(speed);
      const t0 = g.world.tick;
      await new Promise((r) => {
        const iv = setInterval(() => {
          g.world.godMode = true;
          for (const b of document.querySelectorAll('.mod-screen .sv-card')) b.click();
          if (g.world.tick - t0 >= sec * 25) {
            clearInterval(iv);
            r();
          }
        }, 50);
      });
      H.speed(1);
    },
    [sec, speed],
  );

await page.goto(URL);
await home();
await pickMode(page, 'd2+survivals', { timeout: 10000 }).catch(() => undefined);
await page.waitForSelector('.charselect input[type="text"], .d2input', { timeout: 120000 });
const d2ui = !!(await page.$('.d2input'));
await page.fill(d2ui ? '.d2input' : '.charselect input[type="text"]', 'Lot301');
await page.click(d2ui ? '.d2b.ok' : '.charselect .btn.primary.big');
await inRun();
await play(25);

if (ONLY.has('H')) {
  for (const [name, size] of Object.entries(SIZES)) {
    // the first touch asks for the full screen (lot 290): out of it, the window can be resized
    await page.evaluate(() => document.fullscreenElement && document.exitFullscreen().catch(() => undefined));
    await page.setViewportSize(size);
    await page.waitForTimeout(900);
    await play(2, 1);
    const r = await page.evaluate(() => {
      const rect = (s) => {
        const e = document.querySelector(s);
        if (!e || getComputedStyle(e).display === 'none') return null;
        const b = e.getBoundingClientRect();
        return b.width && b.height ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null;
      };
      const W = innerWidth;
      const H = innerHeight;
      const parts = [...document.querySelectorAll('[data-sv="hud"] [data-sv]')]
        .filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0)
        .map((e) => ({
          sv: e.dataset.sv,
          ...(() => {
            const b = e.getBoundingClientRect();
            return { l: b.left, t: b.top, r: b.right, b: b.bottom };
          })(),
        }));
      // the field's middle: the central half of the screen's width, from 25 % to 75 % of its height
      const mid = parts.filter((p) => p.r > W * 0.25 && p.l < W * 0.75 && p.b > H * 0.25 && p.t < H * 0.75).map((p) => p.sv);
      const pause = rect('[data-sv="pause"]');
      const zoneName = rect('[data-sv="zone-name"]');
      const map = rect('#hud .minimap');
      return {
        W,
        H,
        mid,
        zoneName,
        zoneText: document.querySelector('[data-sv="zone-name"]')?.textContent ?? '',
        zoneChip: document.querySelector('[data-sv="zone"]')?.textContent ?? '',
        map,
        pause: pause && { w: pause.r - pause.l, h: pause.b - pause.t },
        time: document.querySelector('[data-sv="time"]')?.textContent ?? '',
        pop: document.querySelector('[data-sv="pop"]')?.textContent ?? '',
        kills: document.querySelector('[data-sv="kills"]')?.textContent ?? '',
      };
    });
    await shot(`h1-${name}`);
    const topRight = !!r.zoneName && r.zoneName.r > r.W * 0.6 && r.zoneName.b < r.H * 0.12;
    const aboveMap = !r.map || (r.zoneName && r.zoneName.b <= r.map.t + 1);
    check(topRight && aboveMap && /\S/.test(r.zoneText) && /^Zone \d \/ \d$/.test(r.zoneChip), `H1 ${name}: the zone's name top right, above the minimap`, `${r.zoneText} · ${r.zoneChip}`);
    check(r.mid.length === 0, `H1 ${name}: nothing of the HUD in the middle of the field`, r.mid.join(','));
    check(
      !!r.pause && r.pause.w >= 44 && r.pause.h >= 44 && !!r.time && !!r.pop && !!r.kills,
      `H1 ${name}: the pause ≥ 44 px, the clock, the monsters, the kills`,
      `${r.time} · ${r.pop} · ${r.kills}`,
    );
  }
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen().catch(() => undefined));
  await page.setViewportSize(SIZES['phone-portrait']);
  await page.waitForTimeout(600);
}

if (ONLY.has('C')) {
  const c = await page.evaluate(async () => {
    const H = window.__arpg;
    const g = H.game();
    const w = g.world;
    const spells = ['fire_bolt', 'ice_bolt', 'charged_bolt', 'lightning', 'telekinesis', 'fire_ball'];
    const ok = g.character.classId === 'sorceress';
    if (!ok) return { ok, cls: g.character.classId };
    g.character.level = 12;
    g.character.skills = Object.fromEntries(spells.map((id) => [id, 3]));
    w.refreshPlayer();
    for (const id of spells) w.player.cooldowns[id] = 0;
    const at = {};
    const off = g.onEvent((e) => {
      if (e.t === 'cast' && e.id === g.world.player.id && e.skill !== 'attack') (at[e.skill] ??= []).push(g.world.tick);
    });
    // the preview read every frame for 8 s: each skill's share only goes up between two of its own casts
    let back = 0;
    const last = {};
    const t0 = performance.now();
    await new Promise((r) => {
      const f = () => {
        g.world.godMode = true;
        for (const cell of document.querySelectorAll('[data-sv="skills"] .sv-sk')) {
          const id = cell.dataset.skill;
          const v = parseFloat(cell.style.getPropertyValue('--sv-cd')) || 0;
          const lc = (at[id] ?? []).at(-1);
          if (last[id] && last[id].cast === lc && v + 1 < last[id].v) back++;
          last[id] = { v, cast: lc };
        }
        if (performance.now() - t0 < 8000) requestAnimationFrame(f);
        else r();
      };
      requestAnimationFrame(f);
    });
    off();
    const first = spells.map((id) => at[id]?.[0]).filter((t) => t !== undefined);
    return { ok, n: first.length, same: new Set(first).size === 1, back, counts: Object.fromEntries(spells.map((id) => [id, at[id]?.length ?? 0])) };
  });
  if (!c.ok) check(false, 'C1: the test character is a Sorceress', c.cls);
  else {
    check(c.n === 6 && c.same, 'C1: six spells ready go off in the same tick', JSON.stringify(c.counts));
    check(c.back === 0, 'C1: each skill’s preview fills over its own cooldown, never moved back', `${c.back} steps back`);
  }
  await shot('c1-six-spells');
}

if (ONLY.has('S')) {
  const s = await page.evaluate(async () => {
    const H = window.__arpg;
    const g = H.game();
    const r = H.renderer();
    const seen = new Set(g.world.monsters.map((m) => m.id));
    let n = 0;
    let on = 0;
    H.speed(4);
    const t0 = g.world.tick;
    await new Promise((res) => {
      const iv = setInterval(() => {
        const w = g.world;
        w.godMode = true;
        for (const b of document.querySelectorAll('.mod-screen .sv-card')) b.click();
        const p = w.player;
        for (const m of w.monsters) {
          if (seen.has(m.id) || m.team !== 1 || m.isSummon || m.dead) continue;
          seen.add(m.id);
          if (m.rank === 'minion' && m.noLoot) continue;
          n++;
          const q = r.worldToScreen(m.x, m.y, 0);
          const c = r.worldToScreen(p.x, p.y, 0);
          // the sprite around its feet: the head above (120 px at zoom 1), half its width aside
          const z = r.zoom;
          const x = q.x - c.x + r.width / 2;
          const y = q.y - c.y + r.height / 2;
          if (x > -40 * z && x < r.width + 40 * z && y > -16 * z && y < r.height + 120 * z) on++;
        }
        if (w.tick - t0 > 40 * 25) {
          clearInterval(iv);
          res();
        }
      }, 20);
    });
    H.speed(1);
    return { n, on, view: [r.width, r.height, +r.zoom.toFixed(3)] };
  });
  check(s.n > 30 && s.on / s.n <= 0.03, 'S1: the monsters brought beyond the screen as drawn', `${s.n} brought, ${s.on} on the screen, view ${s.view.join(' × ')}`);
}

if (ONLY.has('T')) {
  // the zone ended (its mini-boss), the countdown tapped: the time until the next zone is played (no loading screen, the hero drawn)
  const times = [];
  for (let k = 0; k < 2; k++) {
    // a zone lasts 90 to 180 s: 12 s of it here (the next zone prepared meanwhile, as in a real run)
    await play(12, 1);
    await page.evaluate(() => {
      const w = window.__arpg.game().world;
      w.run.completed = true;
      w.run.completeTick = w.tick;
    });
    const wait = await page.waitForSelector('[data-sv="zone-wait"]', { state: 'visible', timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(3000);
    const from = await page.evaluate(() => [window.__arpg.game().runDef?.id, performance.now()]);
    if (wait) await wait.tap().catch(() => undefined);
    const t = await page.evaluate(async (from) => {
      const H = window.__arpg;
      const t0 = from[1];
      for (;;) {
        await new Promise((r) => requestAnimationFrame(r));
        const g = H.game();
        const busy = !!document.querySelector('.loading:not([style*="display: none"])') || H.app?.loadingZone;
        if (g.runDef?.id !== from[0] && !busy && H.app?.currentWorld === g.world) {
          // the steps of the base's zone change (src/app.ts `syncZone` marks), from the tap
          const marks = Object.fromEntries(
            performance
              .getEntriesByType('mark')
              .filter((m) => (m.name.startsWith('sync:') || m.name.startsWith('set:')) && m.startTime >= t0)
              .map((m) => [m.name, Math.round(m.startTime - t0)]),
          );
          return { ms: performance.now() - t0, to: g.runDef?.id, marks };
        }
        if (performance.now() - t0 > 60000) return { ms: Infinity, to: g.runDef?.id };
      }
    }, from);
    times.push(t);
    await shot(`t1-next-zone-${k + 1}`);
  }
  const worst = Math.max(...times.map((t) => t.ms));
  check(worst <= T_MAX, `T1: a zone's end to the next one playable under ${T_MAX} ms (CPU ×${CPU})`, times.map((t) => `${t.to} ${Math.round(t.ms)} ms ${JSON.stringify(t.marks ?? {})}`).join(', '));
}

check(errs.length === 0, '0 page error', errs.join(' | '));
await browser.close();
console.log(fails ? `${fails} failure(s)` : 'all passed');
process.exit(fails ? 1 : 0);
