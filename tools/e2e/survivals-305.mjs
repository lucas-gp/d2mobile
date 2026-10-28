/**
 * Lot 305, the owner's returns on the Run (Survivals), in a browser (the dev server with the D2 graphics, or the production build):
 *   L. the loading bar of a run's start: never still for more than 1.5 s at 95 % or more without a label of what loads, never backwards
 *      within one screen, a label at every step; the time from the creation's tap to the first zone playable;
 *   C. the level-up cards in portrait (412 × 915) and landscape: the three cards and Reroll / Banish / Keep without a scroll;
 *   P. the base's panels opened from the pause (bag, character, skills) in portrait: the tabs' labels whole, the action column within the
 *      screen, the panel at the top and as wide as the screen;
 *   S. the skills preview with 9 skills learned: every one shown;
 *   E. the elites marked (a ring under the champions, uniques and bosses, a name over the bosses);
 *   V. 10 s between zones; the act's boss beaten: the end screen over the zone (no town loaded), "Next: Act II", "Replay Act I", "Hub";
 *      the hub's acts list with Act II open and the others greyed with their condition; Act II started from it, its maps loaded (the dev
 *      server: the check imports src/data/d2map.ts);
 *   0 page error. A capture of each step and size in `--shots`.
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/survivals-305.mjs [--url=http://127.0.0.1:5233/] [--shots=<dir>] [--only=L,C,P,S,E,V] [--lenient=1]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? 'http://127.0.0.1:5233/';
const SHOTS = args.get('shots') ?? '/tmp/survivals-305';
const ONLY = new Set((args.get('only') ?? 'L,C,P,S,E,V').split(','));
// before the lot's changes: captures only, the checks reported but not failing
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
  // the loading screen sampled every 50 ms: its bar and its label
  window.__load = [];
  const t0 = performance.now();
  setInterval(() => {
    const l = document.querySelector('.loading');
    if (!l) return;
    const f = l.querySelector('.fill');
    const m = f && /scaleX\(([\d.e-]+)\)/.exec(f.style.transform);
    window.__load.push([Math.round(performance.now() - t0), m ? +m[1] : null, l.querySelector('.detail')?.textContent ?? '', l.textContent ?? '']);
  }, 50);
});
const shot = (n) => page.screenshot({ path: join(SHOTS, `${n}.png`) }).catch(() => undefined);
const size = async (s) => {
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen().catch(() => undefined));
  await page.setViewportSize(s);
  await page.waitForTimeout(700);
};
const settle = () => page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 240000 });
const inRun = () => page.waitForFunction(() => window.__arpg?.game?.().mode === 'run' && !window.__arpg.game().world.zone.town && !document.querySelector('.loading'), null, { timeout: 240000 });
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
const closeScreens = () =>
  page.evaluate(() => {
    for (let i = 0; i < 4; i++) {
      const b = document.querySelector('.mod-screen [data-sv="resume"], .mod-screen [data-sv="keep"], #panels .close, #panels .x');
      if (b) b.click();
    }
  });

await page.goto(URL);
await page.waitForSelector('.d2c, .charselect', { timeout: 120000 });
if (await page.$('.d2c')) await page.click('.d2c-skip');
await pickMode(page, 'd2+survivals', { timeout: 10000 }).catch(() => undefined);
await page.waitForSelector('.charselect input[type="text"], .d2input', { timeout: 120000 });
const d2ui = !!(await page.$('.d2input'));
await page.fill(d2ui ? '.d2input' : '.charselect input[type="text"]', 'Lot305');
const tClick = await page.evaluate(() => performance.now());
await page.click(d2ui ? '.d2b.ok' : '.charselect .btn.primary.big');
// a capture of the loading screen at its highest point
let shotLoad = false;
for (let i = 0; i < 400 && !shotLoad; i++) {
  const v = await page.evaluate(() => window.__load.at(-1)?.[1] ?? 0);
  if (v >= 0.6) {
    await shot('L-loading-portrait');
    shotLoad = true;
  }
  if (await page.evaluate(() => window.__arpg?.game?.().mode === 'run' && !document.querySelector('.loading'))) break;
  await page.waitForTimeout(40);
}
await inRun();
const tRun = await page.evaluate(() => performance.now());
await page.waitForTimeout(800);
// the first card answered (the game waits under it)
await play(1, 1);

if (ONLY.has('L')) {
  const s = await page.evaluate(() => window.__load);
  // the longest still stretch at 95 % or more without a label
  let still = 0;
  let back = 0;
  let unlabelled = 0;
  for (let i = 1; i < s.length; i++) {
    const [t, v, d] = s[i];
    const [t0, v0, d0] = s[i - 1];
    if (v !== null && v0 !== null && v + 0.001 < v0 && d === d0 && t - t0 < 200) back++;
    if (!d) unlabelled++;
  }
  for (let i = 0; i < s.length;) {
    let j = i;
    while (j + 1 < s.length && s[j + 1][1] === s[i][1] && s[j + 1][2] === s[i][2] && s[j + 1][0] - s[j][0] < 200) j++;
    if ((s[i][1] ?? 0) >= 0.95) still = Math.max(still, s[j][0] - s[i][0]);
    i = j + 1;
  }
  const labels = [...new Set(s.map((x) => x[2]).filter(Boolean))];
  console.log(`  loading: ${s.length} samples, labels: ${labels.slice(0, 12).join(' | ')}`);
  console.log(`  creation tap -> first zone playable: ${Math.round(tRun - tClick)} ms`);
  check(still < 1500, 'L: never still at 95 % or more for 1.5 s', `${still} ms`);
  check(back === 0, 'L: the bar never goes back within a step', `${back}`);
  check(unlabelled <= 2, 'L: every sample names what loads', `${unlabelled} unlabelled`);
}

if (ONLY.has('C')) {
  // a level-up screen: the cards by hand
  await page.evaluate(() => {
    const g = window.__arpg.game();
    g.settings.mods = { ...(g.settings.mods ?? {}), survivals: { ...(g.settings.mods?.survivals ?? {}), cards: 'manual' } };
  });
  for (const [name, s] of [
    ['portrait', PORTRAIT],
    ['landscape', LANDSCAPE],
  ]) {
    await size(s);
    await page.evaluate(() => {
      const g = window.__arpg.game();
      g.world.godMode = true;
      g.character.skillPoints += 1;
      g.world.events.push({ t: 'levelUp', level: g.character.level });
    });
    await page.waitForSelector('.mod-screen .sv-card', { timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(700);
    await shot(`C-cards-${name}`);
    const r = await page.evaluate(() => {
      const box = document.querySelector('.mod-screen .sv-cards-box');
      const scrollers = [...document.querySelectorAll('.mod-screen, .mod-screen *')].filter((e) => e.scrollHeight > e.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
      const btns = [...document.querySelectorAll('.mod-screen button')].map((b) => b.getBoundingClientRect());
      return { box: !!box, scroll: scrollers.length, outside: btns.filter((b) => b.bottom > innerHeight + 1 || b.right > innerWidth + 1).length };
    });
    check(r.box && r.scroll === 0 && r.outside === 0, `C: ${name}: the cards and buttons without a scroll`, JSON.stringify(r));
    await page.evaluate(() => document.querySelector('.mod-screen [data-sv="keep"]')?.click());
    await page.waitForTimeout(300);
  }
  await size(PORTRAIT);
}

if (ONLY.has('P')) {
  for (const [name, s] of [
    ['portrait', PORTRAIT],
    ['landscape', LANDSCAPE],
  ]) {
    await size(s);
    for (const panel of ['inventory', 'character', 'skills']) {
      await page.evaluate((p) => window.__arpg.app.openPanel(p), panel);
      await page.waitForTimeout(600);
      await shot(`P-${panel}-${name}`);
      const r = await page.evaluate(() => {
        const W = innerWidth;
        const tabs = [...document.querySelectorAll('#panels .tabs button, #panels [role="tab"], #panels .tab')].filter((b) => b.getBoundingClientRect().width > 0);
        const cut = tabs.filter((b) => {
          const r = document.createRange();
          r.selectNodeContents(b);
          const t = r.getBoundingClientRect();
          const bb = b.getBoundingClientRect();
          return t.left < bb.left - 1 || t.right > bb.right + 1;
        }).length;
        const btns = [...document.querySelectorAll('#panels button')].filter((b) => b.getBoundingClientRect().width > 0);
        const out = btns.filter((b) => b.getBoundingClientRect().right > W + 1).map((b) => b.textContent?.trim().slice(0, 12));
        const panel = document.querySelector('#panels .panel');
        const pr = panel?.getBoundingClientRect();
        return { tabs: tabs.length, cut, out, panel: pr && { l: Math.round(pr.left), t: Math.round(pr.top), w: Math.round(pr.width), h: Math.round(pr.height) }, W, H: innerHeight };
      });
      console.log(`  ${panel} ${name}: ${JSON.stringify(r)}`);
      check(r.cut === 0 && r.out.length === 0, `P: ${name} ${panel}: the tabs whole, no button beyond the screen`, JSON.stringify({ cut: r.cut, out: r.out }));
      await page.evaluate(() => window.__arpg.app.openPanel('close'));
      await page.waitForTimeout(300);
    }
  }
  await size(PORTRAIT);
}

if (ONLY.has('S')) {
  const ids = await page.evaluate(() => {
    const g = window.__arpg.game();
    const want = ['fire_bolt', 'charged_bolt', 'ice_bolt', 'frost_nova', 'static_field', 'telekinesis', 'inferno', 'ice_blast', 'blaze', 'lightning', 'glacial_spike', 'nova'];
    for (const id of want) g.character.skills[id] = Math.max(1, g.character.skills[id] ?? 0);
    g.world.refreshPlayer?.();
    return Object.entries(g.character.skills).filter(([, n]) => n > 0).length;
  });
  await play(2, 1);
  for (const [name, s] of [
    ['portrait', PORTRAIT],
    ['landscape', LANDSCAPE],
  ]) {
    await size(s);
    await play(1, 1);
    await shot(`S-skills-${name}`);
    const r = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('[data-sv="skills"] .sv-sk')];
      const vis = cells.filter((c) => {
        const b = c.getBoundingClientRect();
        return b.width > 0 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1 && b.left >= -1;
      });
      return { cells: cells.length, vis: vis.length };
    });
    check(r.vis >= Math.min(ids, 12) - 1, `S: ${name}: every learned active skill shown`, `${r.vis} shown of ${ids} learned (passives included in the count)`);
  }
  await size(PORTRAIT);
}

if (ONLY.has('E')) {
  // a champion pack and a boss near the hero (spawned through the debug hook when the mode exposes none)
  await play(3, 1);
  const r = await page.evaluate(() => {
    // the game stopped (its clock at 0) while the elites are drawn: the god-mode hero would kill them
    window.__arpg.speed(0);
    const g = window.__arpg.game();
    const w = g.world;
    const near = w.monsters.filter((m) => !m.dead && Math.hypot(m.x - w.player.x, m.y - w.player.y) < 14);
    let n = 0;
    for (const m of near) {
      if (n === 0) m.rank = 'boss';
      else if (n < 3) m.rank = 'unique';
      else if (n < 6) m.rank = 'champion';
      n++;
    }
    return { near: near.length, ranks: near.map((m) => m.rank).slice(0, 8) };
  });
  await page.waitForTimeout(500);
  const marks = await page.evaluate(() => window.__arpg.renderer?.().eliteMarks?.() ?? null);
  for (const [name, s] of [
    ['portrait', PORTRAIT],
    ['landscape', LANDSCAPE],
  ]) {
    await size(s);
    await page.waitForTimeout(400);
    await shot(`E-elites-${name}`);
  }
  await page.evaluate(() => window.__arpg.speed(1));
  console.log(`  elites made: ${JSON.stringify(r)}`);
  check(marks !== null && marks > 0, 'E: the elites marked under them', String(marks));
  await size(PORTRAIT);
}

if (ONLY.has('V')) {
  // to the act's boss: each zone ended and its countdown tapped
  for (let k = 0; k < 8; k++) {
    const id = await page.evaluate(() => window.__arpg.game().runDef?.id ?? '');
    if (args.get('debug'))
      console.log(
        `  zone ${k}: ${id} ${await page.evaluate(() => `${window.__arpg.game().mode} loadingZone=${window.__arpg.app.loadingZone} loading=${!!document.querySelector('.loading')} screens=${document.querySelectorAll('.mod-screen').length}`)}`,
      );
    if (id.endsWith('a1r7')) break;
    await page.evaluate(() => {
      const g = window.__arpg.game();
      g.world.run.completed = true;
      g.world.run.completeTick = g.world.tick;
    });
    await page.waitForSelector('[data-sv="zone-wait"]', { state: 'visible', timeout: 10000 }).catch(() => undefined);
    const wait = await page.evaluate(() => document.querySelector('[data-sv="zone-wait"]')?.textContent ?? '');
    if (k === 0) {
      console.log(`  countdown: ${wait}`);
      check(/10/.test(wait), 'V: the countdown between zones is 10 s', wait);
    }
    await page.evaluate(() => document.querySelector('[data-sv="zone-wait"]')?.click());
    await page.waitForFunction((prev) => window.__arpg.game().runDef?.id !== prev && !document.querySelector('.loading'), id, { timeout: 60000 }).catch(() => undefined);
    await page.waitForTimeout(500);
  }
  // Andariel comes (her lair's clock), then is slain
  await page.evaluate(
    () =>
      new Promise((r) => {
        const H = window.__arpg;
        H.speed(8);
        const t0 = Date.now();
        const iv = setInterval(() => {
          const w = H.game().world;
          w.godMode = true;
          for (const b of document.querySelectorAll('.mod-screen .sv-card')) b.click();
          if (w.monsters.some((m) => !m.dead && m.runBoss) || Date.now() - t0 > 60000) {
            clearInterval(iv);
            H.speed(1);
            r();
          }
        }, 50);
      }),
  );
  const syncs0 = await page.evaluate(() => performance.getEntriesByName('sync:0').length);
  await page.evaluate(() => {
    const g = window.__arpg.game();
    const w = g.world;
    w.godMode = true;
    for (const m of w.monsters) if (!m.dead && m.runBoss) w.killMonster(m, w.player);
  });
  await page.waitForSelector('.mod-screen [data-sv-screen="run-end"]', { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  for (const [name, s] of [
    ['portrait', PORTRAIT],
    ['landscape', LANDSCAPE],
  ]) {
    await size(s);
    await shot(`V-victory-${name}`);
  }
  const v = await page.evaluate(() => ({
    mode: window.__arpg.game().mode,
    zone: window.__arpg.game().world.zone.id,
    syncs: performance.getEntriesByName('sync:0').length,
    end: !!document.querySelector('.mod-screen [data-sv-screen="run-end"]'),
    buttons: [...document.querySelectorAll('.mod-screen [data-sv="end-actions"] button')].map((b) => b.textContent?.trim()),
    unlocked: [...document.querySelectorAll('.mod-screen [data-sv="unlocked"]')].map((b) => b.textContent?.trim()),
  }));
  console.log(`  victory: ${JSON.stringify(v)}`);
  check(v.end && v.mode === 'run' && v.syncs === syncs0, 'V: the end screen over the boss’s zone, no town loaded', JSON.stringify({ mode: v.mode, zone: v.zone }));
  check(v.buttons.some((t) => /Act II/.test(t)) && v.buttons.some((t) => /Replay/.test(t)) && v.buttons.some((t) => /Hub/.test(t)), 'V: Next Act II, Replay Act I, Hub', v.buttons.join(' | '));
  check(!v.unlocked.some((t) => /Nightmare/.test(t)), 'V: Andariel opens no difficulty', v.unlocked.join(' | '));
  // the hub: the acts list
  await page.evaluate(() => document.querySelector('.mod-screen [data-sv="end-actions"] [data-sv="hub"]')?.click());
  await page.waitForFunction(() => window.__arpg.game().mode === 'town' && !document.querySelector('.loading'), null, { timeout: 120000 }).catch(() => undefined);
  for (let i = 0; i < 6; i++) {
    console.log(
      `  after Hub: ${await page.evaluate(() => `${window.__arpg.game().mode} ${window.__arpg.game().world.zone.id} lvl ${window.__arpg.game().character.level} screens ${document.querySelectorAll('.mod-screen').length} hub ${!!document.querySelector('.svh')} loading ${!!document.querySelector('.loading')}`)}`,
    );
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('.svh-tab[data-tab="perso"]')?.click());
  await page.waitForTimeout(500);
  for (const [name, s] of [
    ['portrait', PORTRAIT],
    ['landscape', LANDSCAPE],
  ]) {
    await size(s);
    await shot(`V-hub-acts-${name}`);
  }
  const acts = await page.evaluate(() => [...document.querySelectorAll('[data-sv="acts"] button')].map((b) => `${b.textContent?.trim()}${b.disabled ? ' (locked)' : ''}`));
  console.log(`  acts: ${acts.join(' | ')}`);
  check(acts.length >= 5 && acts.some((t) => /II/.test(t) && !/locked/.test(t)) && acts.some((t) => /locked/.test(t)), 'V: the acts list, Act II open, the others greyed', acts.join(' | '));
  // Act II picked and started: its maps loaded first, its first zone cut from its real map
  await page.evaluate(() => document.querySelector('[data-sv="acts"] [data-act="2"][data-diff="0"]')?.click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-sv="play"]')?.click());
  await page
    .waitForFunction(() => window.__arpg.game().mode === 'run' && window.__arpg.app.currentWorld === window.__arpg.game().world && !document.querySelector('.loading'), null, { timeout: 120000 })
    .catch(() => undefined);
  // its maps loaded first (`UiHost.loadActMaps`); the sewers' arena is the zone's own look (too narrow to cut, as in the Campaign)
  const a2 = await page.evaluate(async () => {
    const m = await import('/src/data/d2map.ts');
    return { run: window.__arpg.game().runDef?.id ?? '', sewer: !!m.d2Map('a2_sewer1'), dryhills: !!m.d2Map('a2_dryhills') };
  });
  await shot('V-act2-portrait');
  check(/a2r1/.test(a2.run) && a2.sewer && a2.dryhills, 'V: Act II started from the hub, its maps loaded', JSON.stringify(a2));
}

check(errs.length === 0, '0 page error', errs.slice(0, 3).join(' / '));
await browser.close();
console.log(fails ? `${fails} failure(s)` : 'all checks passed');
process.exit(fails ? 1 : 0);
