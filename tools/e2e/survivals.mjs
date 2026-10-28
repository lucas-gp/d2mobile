/**
 * Survivals mode (lot 277, S4), in a browser, on the phone and Galaxy Z Fold sizes, portrait and landscape (full build with the mod):
 *  1. the mode "Diablo II (original) — Survivals" at launch, a character created in it (`d2+survivals`);
 *  2. in game in portrait: no "rotate your device" prompt (rule `ui.orientation`), a wider camera (rule `render.zoom`);
 *  3. a round started from the waypoint's Survivals section; the round's HUD (time, live monsters, next event, buttons ≥ 44 px);
 *  4. turning the device in the middle of the round (portrait ↔ landscape, folded ↔ unfolded) loses nothing: same round, the clock and the
 *     monsters go on, the game is not paused;
 *  5. level-up cards (three, stacked in portrait, side by side in landscape, ≥ 64 px high, buttons ≥ 44 px), a card taken;
 *  6. the mini-boss killed: the end-of-round screen;
 *  7. cost with about 90 live monsters (software rendering, relative: see the report);
 *  8. the app closed in the middle of a round (page reloaded): the character is back in the same round, at the same second (lot 279);
 *  9. a round of each of Acts II to V started from the waypoint of the act's town (acts opened by the previous act's boss), HUD shown,
 *     screenshots on the Galaxy Z Fold folded and unfolded, portrait and landscape (lot 280);
 * 9b. Nightmare and Hell (lot 282): the highest difficulty opened by Baal unfolded first in the waypoint with its rounds cleared, a round of
 *     each started from it, the HUD naming the difficulty, screenshots portrait and landscape on the phone and the Fold (folded, unfolded);
 * 9c. named elites and loot (lot 283): the next event's chip names the coming elite and pulses in its last 10 s, the elite's bar under the
 *     HUD while it lives, inside the screen in every size, the HUD never over the zone's title; the mode's loot settings; the loot told at
 *     the elite's death;
 * 10. a death: back in town, no portal back to the round; 0 console error.
 * Lot 285 (the owner's test on his Galaxy Z Fold and PC), each point checked:
 *  P1. creation: every hero chosen by a real tap on its figure, the Barbarian and the Necromancer too, in every size;
 *  P2. the monsters of a round drawn (every live monster with its sprite sheet, none invisible);
 *  P3. in a round only the joystick, the attack, the skills bound, the pause button and the HUD's gauges: no panel button, potion,
 *      skill page, empty slot nor context button;
 *  P4. level-up cards with the skill's icon, ≥ 96 px high, taken by a real tap;
 *  P5. loot walked over taken, worn in an empty slot; P6. no potion in the belt, none dropped nor sold; P7. gold from the loot, the
 *      vendor's prices against it;
 *  P8. a character just created starts its first round at once; back in town, the hub (next round, panels without walking): the vendor
 *      opened from it, the next round started from it; the end-of-round screen chains the next round.
 * Lot 286 (owner's screenshots): S1-S3. the settings panel in the mode: one flat page (no folded category nor search box), the mode's
 *      rows first then a dozen of the base's options, every size and PC, a mode's row changed from it; M1-M2. the main menu: the title
 *      under the logo, the modes then one row of links (sign in, the mode's "how to play", credits, Discord in a new tab), no D2 import.
 * Lot 287 (owner's test in portrait, trees, another survivors game, orientation): J1-J4. the floating joystick: anywhere in the lower two
 *      thirds of a screen held upright (a real touch in the centre moves the hero), the attack and skills in a column at the edge; on the
 *      thumb's side in landscape; the "Joystick" setting (left / centre / right) moves it and puts the buttons on the other side;
 *      A1. the arena's trees thinned (the map's trees left undrawn inside the arena but a few along its border); Z1. the wider camera
 *      (16 units across the shorter side); C1. the cards' figures (current → next level) and keys 1-3; O1. orientation: the menus never
 *      lock the screen, a round unlocks it (never landscape), the manifest asks none.
 * Lot 288 (study of the other game): H1. semi-automatic: no attack button, the skills' column in its place; W1. the joystick held among
 *      monsters, the character still strikes (walking); B1. the cards count the rerolls and banishes, a card banished leaves the draw;
 *      D1. a death names the killer in the round, then on the hub.
 * Lot 291 (Act I's flow): F1 the hero's speed, the gentle start, the zones of 60 s.
 * Lot 290 (owner: everything automatic): H1 no attack nor skill button, a preview of the skills taken (not a touch target) refreshed
 *      after each automatic cast; P3 the pause without the automatic-attack switch.
 * Lot 290 (owner's order): E1-E2. at the hub, a level-1 hero sees a Great Helm's requirements never in red, equips it, its defense
 *      counted at once (no requirement to wear gear in Survivals).
 * Lot 292 (the third study, Act I focus): G1 the run-end screen drives to the shop (the gold into the purse, the best buy, "Visit the
 *      shop"); G2-G6 the hub's shop by real taps: its tabs, rows compared green / red, a tap shows the tooltip, a long press buys, the bag
 *      (wear, sell), the buy-back, the gamble; G7 a long press on a bag cell of the base's panel wears it; G8 the character sheet's
 *      section (damage, speeds, damage reduction, the tier); G9 a hero without a weapon gets the starter weapon at the next run.
 * Lot 292b (the owner's tests): K1-K2 the pause of a round opens the bag (an item worn, the game paused) and the skill tree; K3 the
 *      hero walks while he strikes.
 * Lot 294 (the owner's tests): L1 no mana gauge in Act I's flow (the mana full, no skill bar), L2 the strike drawn while walking, L3 an
 *      archer's shots aimed ahead hit the walking hero and are drawn as arrows, L4 every learned skill cast in turn, L5 the hub tells the
 *      level back to 1 at each run.
 * Lot 295 (the owner's note: six tabs in three panels): R4 the Run's hub (tabs, the Character tab's panels, the bar), H1 each tab by a
 *      real tap in the six sizes (its three panels, stacked or side by side, inside the screen, Diablo II's stone, targets ≥ 44 px),
 *      H2 an item's sheet and "Equip", H3 the shared stash, H4 the Horadric Cube, H5 a crafting recipe, H6 a hireling hired and given a
 *      Great Helm at level 1.
 * Screenshots: `--shots=` (default test-results/e2e/survivals).
 *   npx vite --host 127.0.0.1 --port 5234 --strictPort
 *   node tools/e2e/survivals.mjs [--url=http://127.0.0.1:5234/] [--shots=…] [--perf=0]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listModes, pickMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5234/';
const SHOTS = args.get('shots') ?? join(process.cwd(), 'test-results', 'e2e', 'survivals');
/**
 * Lot 299 (owner: "the tests take too long while the game is being built"): `--quick=1` (or E2E_QUICK=1) plays every scenario in two
 * sizes (phone upright and folded Fold in landscape) instead of six, takes no screenshot and no perf measure; `--shots=0` takes none.
 * Each line tells the seconds since the previous one (where the time goes). The full run stays the default (and the pre-deploy check).
 */
const QUICK = args.get('quick') === '1' || process.env.E2E_QUICK === '1';
const NO_SHOTS = QUICK || args.get('shots') === '0';
const PERF = args.get('perf') !== '0' && !QUICK;
mkdirSync(SHOTS, { recursive: true });

/** CSS sizes (inside the window; to confirm on the device) */
const ALL_SIZES = {
  'phone-portrait': { width: 390, height: 844 },
  'phone-landscape': { width: 844, height: 390 },
  'fold-folded-portrait': { width: 344, height: 882 },
  'fold-folded-landscape': { width: 882, height: 344 },
  'fold-open-portrait': { width: 884, height: 1104 },
  'fold-open-landscape': { width: 1104, height: 884 },
};
const SIZES = QUICK ? Object.fromEntries(Object.entries(ALL_SIZES).filter(([k]) => k === 'phone-portrait' || k === 'fold-folded-landscape')) : ALL_SIZES;

/** A scenario's sizes: all of them, or in the quick mode those of `SIZES` (the first one at least) */
const sizesOf = (list) => (QUICK ? (list.filter((k) => k in SIZES).length ? list.filter((k) => k in SIZES) : list.slice(0, 1)) : list);

let fails = 0;
let lastAt = Date.now();
const T0 = Date.now();
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  const now = Date.now();
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''} [+${((now - lastAt) / 1000).toFixed(1)} s]`);
  lastAt = now;
};
process.on('exit', () => console.log(`total ${((Date.now() - T0) / 1000).toFixed(0)} s${QUICK ? ' (quick)' : ''}`));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = {};
try {
  const ctx = await browser.newContext({ viewport: SIZES['phone-portrait'], deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|GPU stall|swiftshader|WebGL|GroupMarker/i.test(m.text()) && errs.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message.slice(0, 200)}`));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e.init')) {
      localStorage.clear();
      localStorage.setItem('d2m.testchar.v1', '1');
      sessionStorage.setItem('e2e.init', '1');
    }
    localStorage.setItem('d2m.lang', 'fr');
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // the window is resized by the test (turning the device): no real fullscreen; the orientation asked is recorded
    Element.prototype.requestFullscreen = () => Promise.resolve();
    window.__locks = [];
    if (screen.orientation) {
      screen.orientation.lock = (o) => (window.__locks.push(o), Promise.resolve());
      screen.orientation.unlock = () => window.__locks.push('unlock');
    }
  });
  const shot = (name) => (NO_SHOTS ? Promise.resolve() : page.screenshot({ path: join(SHOTS, `${name}.png`) }));
  const size = async (name) => {
    await page.setViewportSize(ALL_SIZES[name]);
    await page.waitForTimeout(700);
  };

  // 1. the mode at launch, a character in it
  await page.goto(URL);
  await page.waitForSelector('.d2c, .charselect', { timeout: 120000 });
  if (await page.$('.d2c')) await page.click('.d2c-skip');
  await page.waitForSelector('[data-act="modetype"], [data-act="mode"]', { timeout: 90000 });
  // lot 318: the kind first (Normal, Survivals), then the game
  const modes = await listModes(page);
  check(
    modes.some((m) => /^d2\+survivals:Diablo II \(original\) — Survivals/.test(m)),
    'launch: the Survivals mode is offered',
    modes.join(' | '),
  );
  await shot('1-modes-portrait');
  // M1-M2 (lot 286): the main menu, the modes first then one row of links (sign in, the mods' buttons, credits, Discord in a new tab);
  // no D2 import; the title "Choose a game mode" never over the logo's "Lord of Destruction" (stage coordinates, every size)
  const menuCheck = async (tag) => {
    for (const [sz, vp] of Object.entries({ ...SIZES, pc: { width: 1440, height: 900 } })) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const st = document.querySelector('.d2stage');
        const k = st.getBoundingClientRect().height / 600;
        const sub = document.querySelector('.d2t.sub');
        const top = sub ? (sub.getBoundingClientRect().top - st.getBoundingClientRect().top) / k : null;
        const links = [...document.querySelectorAll('.d2b.link')];
        const d = document.querySelector('[data-act="discord"]');
        const mainBox = [...document.querySelectorAll('.d2b.main')].map((b) => b.getBoundingClientRect().bottom);
        return {
          subTop: top === null ? null : Math.round(top),
          links: links.map((l) => l.textContent),
          // lot 292d: the links small stone buttons, in the top-right corner of the stage (landscape) or in the dock under the modes
          // (portrait), never over a mode button
          linksBelow: links.every((l) => {
            const r = l.getBoundingClientRect();
            const top = Math.min(...[...document.querySelectorAll('.d2b.main')].map((b) => b.getBoundingClientRect().top));
            // portrait: the bar above the stage; landscape: the stage's top-right corner; never over a mode button
            return l.closest('.d2topbar') ? r.bottom <= top : r.bottom <= top && r.left >= innerWidth / 2;
          }),
          stone: links.every((l) => getComputedStyle(l).borderImageSource.includes('url')),
          linksInside: links.every((l) => {
            const r = l.getBoundingClientRect();
            return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
          }),
          discord: d ? [d.getAttribute('href'), d.target, d.rel] : null,
          imp: !!document.querySelector('.d2b.imp'),
        };
      });
      check(
        m.subTop >= 236 &&
          m.discord?.[0] === 'https://discord.gg/j6w8YVauR' &&
          m.discord[1] === '_blank' &&
          /noopener/.test(m.discord[2]) &&
          !m.imp &&
          m.linksBelow &&
          m.linksInside &&
          m.stone &&
          m.links.includes('Crédits'),
        `M1 ${tag} ${sz}: title under the logo, modes and small stone links (top right, or in the dock; Discord in a new tab, no D2 import)`,
        JSON.stringify(m),
      );
      await shot(`m1-menu-${tag}-${sz}`);
    }
    await page.setViewportSize(SIZES['phone-portrait']);
    await page.waitForTimeout(300);
  };
  await menuCheck('launch');
  await pickMode(page, 'd2+survivals');
  await page.waitForSelector('.sel-slot, .d2input, .charselect input', { timeout: 120000 });
  await page.waitForTimeout(400);
  if (await page.$('.sel-slot')) await page.click('[data-act="create"]');
  await page.waitForSelector('.d2input, .charselect input');
  // P1. every hero chosen by a real tap on its figure (the sprites' frames overlap: lot 285), in every size; the Sorceress kept
  const HERO_AT = { amazon: [174, 330], assassin: [241, 330], necromancer: [305, 300], barbarian: [393, 290], sorceress: [492, 300], paladin: [585, 320], druid: [697, 340] };
  const HERO_NAME = { amazon: 'Amazone', assassin: 'Assassin', necromancer: 'Nécromancien', barbarian: 'Barbare', sorceress: 'Sorcière', paladin: 'Paladin', druid: 'Druide' };
  for (const name of Object.keys(SIZES)) {
    await size(name);
    const got = [];
    for (const cls of [...Object.keys(HERO_AT), 'sorceress']) {
      const at = await page.evaluate(([x, y]) => {
        const b = document.querySelector('.d2stage').getBoundingClientRect();
        const k = b.width / 800;
        return { x: b.x + x * k, y: b.y + y * k };
      }, HERO_AT[cls]);
      await page.touchscreen.tap(at.x, at.y);
      await page.waitForTimeout(150);
      got.push([cls, await page.evaluate(() => document.querySelector('.d2t.title')?.textContent)]);
    }
    check(
      got.every(([c, t]) => t === HERO_NAME[c]),
      `P1 ${name}: each of the 7 heroes chosen by a tap on its figure`,
      JSON.stringify(got),
    );
    if (name === 'phone-portrait' || name === 'fold-folded-portrait') await shot(`p1-create-${name}`);
  }
  await size('phone-portrait');
  // V1 (lot 289): the mode's variants on the creation screen, Run picked by default; this part of the test plays the Campaign
  for (const name of sizesOf(['phone-portrait', 'phone-landscape', 'fold-folded-portrait', 'fold-open-landscape'])) {
    await size(name);
    const v = await page.evaluate(() => {
      const box = document.querySelector('[data-variants]');
      const btns = [...(box?.querySelectorAll('[data-variant]') ?? [])];
      const r = btns.map((b) => b.getBoundingClientRect());
      return {
        ids: box?.dataset.variants,
        picked: btns.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.variant,
        minH: Math.min(...r.map((x) => x.height)),
        inside: r.every((x) => x.left >= 0 && x.right <= innerWidth + 1 && x.top >= 0 && x.bottom <= innerHeight + 1),
      };
    });
    check(v.ids === 'run,campaign' && v.picked === 'run' && v.minH >= 40 && v.inside, `V1 ${name}: Run (default) / Campaign offered at creation`, JSON.stringify(v));
    await shot(`v1-create-variants-${name}`);
  }
  await size('phone-portrait');
  const camp = await page.evaluate(() => {
    const b = document.querySelector('[data-variant="campaign"]').getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.touchscreen.tap(camp.x, camp.y);
  await page.waitForTimeout(200);
  check((await page.evaluate(() => document.querySelector('[data-variant="campaign"]').getAttribute('aria-pressed'))) === 'true', 'V1: Campaign picked by a tap');
  await page.fill('.d2input', 'Survivor');
  await page.click('.d2b.ok');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 240000 });
  const g0 = await page.evaluate(() => ({ ruleset: window.__arpg.game().ruleset, name: window.__arpg.game().character.name }));
  check(g0.ruleset === 'd2+survivals', 'character created in d2+survivals', JSON.stringify(g0));
  check((await page.evaluate(() => window.__arpg.game().character.progression.milestones['survivals:mode'])) === 2, 'V1: the character plays the Campaign (mode kept in its milestones)');
  // P8. straight into the first round, no walk in town; P6. no potion in the belt
  await page.waitForFunction(() => window.__arpg.game().world.zone.id === 'survivals:a1r1' && !document.querySelector('.loading'), null, { timeout: 120000 });
  const first = await page.evaluate(() => ({ mode: window.__arpg.game().mode, zone: window.__arpg.game().world.zone.id, belt: window.__arpg.game().character.belt.map((b) => b.qty) }));
  check(
    first.mode === 'run' && first.zone === 'survivals:a1r1' && first.belt.every((q) => q === 0),
    'P8/P6: a new character starts its first round at once, no potion in its belt',
    JSON.stringify(first),
  );

  // 2. portrait allowed, wider camera
  const ori = await page.evaluate(() => ({
    any: document.documentElement.classList.contains('any-orientation'),
    rotate: getComputedStyle(document.querySelector('.rotate')).display,
    zoom: window.__arpg.renderer().zoom,
  }));
  check(ori.any && ori.rotate === 'none', 'portrait: no "rotate your device" prompt', JSON.stringify(ori));
  check(ori.zoom < 0.8, 'portrait: camera widened (zoom below the base 1.1)', String(ori.zoom));
  // Z1 (lot 287): 16 units across the shorter side (390 / (45.25 × 16) ≈ 0.539)
  check(Math.abs(ori.zoom - 390 / (45.25 * 16)) < 0.01, 'Z1: the camera shows 16 units across the phone held upright', String(ori.zoom));
  const locks0 = await page.evaluate(() => [...window.__locks]);
  await page.touchscreen.tap(195, 420);
  await page.waitForTimeout(300);
  const locks = await page.evaluate(() => window.__locks);
  check(
    !locks0.length && !locks.length,
    'O1: the screen never locked nor unlocked, on the menus as at the first touch of a round (lot 290: the device keeps its own orientation)',
    JSON.stringify({ before: locks0, after: locks }),
  );
  const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  check(!('orientation' in manifest), 'O1: the PWA manifest asks no orientation (the menus follow the device)', JSON.stringify(manifest.orientation ?? null));
  await shot('2-start-phone-portrait');

  // J1-J4 (lot 287): the floating joystick, anywhere in the lower two thirds of a phone held upright, the centre included
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 8, radiusY: 8, force: 1 })) });
  /** A long press by touch at the centre of `sel` (pointer events as a finger: down, held `ms`, up) */
  const holdOn = async (sel, ms = 650) => {
    const b = await page.evaluate((q) => {
      const r = document.querySelector(q)?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + Math.min(r.height / 2, 14) } : null;
    }, sel);
    if (!b) return false;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y }] });
    await page.waitForTimeout(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    return true;
  };
  /** A real tap at the centre of `sel` */
  const tapOn = async (sel) => {
    const b = await page.evaluate((q) => {
      // lot 295: the hub's panels scroll (stacked on a phone held upright): the target brought into view first
      document.querySelector(q)?.scrollIntoView({ block: 'center' });
      const r = document.querySelector(q)?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    }, sel);
    if (b) await page.touchscreen.tap(b.x, b.y);
    return !!b;
  };
  /** G2-G9 (lot 292): the hub's shop, the long press, the sheet, the starter weapon */
  const shopChecks = async () => {
    await size('phone-portrait');
    await page.evaluate(() => {
      const g = window.__arpg.game();
      const m = g.character.progression.milestones;
      // a run's end at level 18 (the shop's stock sized to it), 2,000 gold to spend
      m['survivals:last:level'] = 18;
      m['survivals:runs'] = (m['survivals:runs'] ?? 0) + 1;
      g.character.gold = 2000;
      g.refreshVendor();
    });
    await page.waitForTimeout(600);
    await tapOn('[data-sv="run-hub"] [data-sv="shop"]');
    await page.waitForSelector('[data-sv-screen="shop"]', { timeout: 10000 }).catch(() => undefined);
    const g2 = await page.evaluate(() => {
      const s = document.querySelector('[data-sv-screen="shop"]');
      const rows = [...(s?.querySelectorAll('[data-sv-item]') ?? [])];
      return {
        tabs: [...(s?.querySelectorAll('[data-tab]') ?? [])].map((b) => b.dataset.tab).join(),
        rows: rows.length,
        up: s?.querySelectorAll('.sv-up').length ?? 0,
        down: s?.querySelectorAll('.sv-down').length ?? 0,
        best: !!s?.querySelector('.sv-item.best .sv-badge'),
        prices: [...(s?.querySelectorAll('[data-sv="buy"]') ?? [])].map((b) => Number(/(\d+) or/.exec(b.textContent)?.[1])),
        minBtn: Math.min(...[...(s?.querySelectorAll('.sv-btn') ?? [])].map((b) => b.getBoundingClientRect().height)),
        wide: (s?.querySelector('.sv-box')?.getBoundingClientRect().right ?? 0) <= innerWidth,
      };
    });
    check(
      g2.tabs === 'buy,bag,back,gamble' && g2.rows >= 6 && g2.up + g2.down > 0 && g2.prices.every((p) => p >= 100 && p <= 500) && g2.minBtn >= 40 && g2.wide,
      'G2: the shop by a real tap from the hub: four tabs, 6+ items of the run’s level, compared green / red, priced 1 to 5 runs',
      JSON.stringify(g2),
    );
    for (const sz of sizesOf(['phone-portrait', 'phone-landscape', 'fold-folded-portrait', 'fold-open-landscape'])) {
      await size(sz);
      await shot(`g2-shop-buy-${sz}`);
    }
    await size('phone-portrait');
    // G3: a tap on a row: its tooltip; a long press on a row: bought (worn when it gains)
    await tapOn('[data-sv-screen="shop"] [data-sv-item] .sv-isub');
    await page.waitForTimeout(300);
    const g3a = await page.evaluate(() => !!document.querySelector('[data-sv-screen="shop"] .sv-item.open .sv-itip .tip'));
    await shot('g3-shop-tooltip-phone-portrait');
    const before = await page.evaluate(() => ({ gold: window.__arpg.game().character.gold, n: window.__arpg.game().vendor.length }));
    await holdOn('[data-sv-screen="shop"] [data-sv-item] .sv-isub');
    await page.waitForTimeout(400);
    const g3 = await page.evaluate(() => ({
      gold: window.__arpg.game().character.gold,
      n: window.__arpg.game().vendor.length,
      note: document.querySelector('[data-sv-screen="shop"] [data-sv="note"]')?.textContent ?? '',
    }));
    check(g3a && g3.gold < before.gold && g3.n === before.n - 1 && /^Acheté/.test(g3.note), 'G3: a tap shows the tooltip, a long press buys', JSON.stringify({ g3a, before, g3 }));
    await shot('g3-shop-bought-phone-portrait');
    // G4: the bag: an item worn by its button, another sold (gold up)
    await page.evaluate(() => {
      const a = window.__arpg;
      a.giveItem('ring', { forceQuality: 'rare', ilvl: 20 });
      a.giveItem('leather_boots', { forceQuality: 'magic', ilvl: 20 });
    });
    await tapOn('[data-sv-screen="shop"] [data-tab="bag"]');
    await page.waitForTimeout(300);
    await shot('g4-shop-bag-phone-portrait');
    const goldBag = await page.evaluate(() => window.__arpg.game().character.gold);
    await tapOn('[data-sv-screen="shop"] [data-sv="sell"]');
    await page.waitForTimeout(300);
    const g4 = await page.evaluate(() => ({
      gold: window.__arpg.game().character.gold,
      back: window.__arpg.game().buyback.length,
      note: document.querySelector('[data-sv-screen="shop"] [data-sv="note"]')?.textContent ?? '',
    }));
    await tapOn('[data-sv-screen="shop"] [data-sv="equip"]');
    await page.waitForTimeout(300);
    const g4b = await page.evaluate(() => document.querySelector('[data-sv-screen="shop"] [data-sv="note"]')?.textContent ?? '');
    check(g4.gold > goldBag && g4.back >= 1 && /^Vendu/.test(g4.note) && /^Équipé/.test(g4b), 'G4: the bag: an item sold (to the buy-back), another worn', JSON.stringify({ goldBag, g4, g4b }));
    // G5: the buy-back
    await tapOn('[data-sv-screen="shop"] [data-tab="back"]');
    await page.waitForTimeout(300);
    const g5 = await page.evaluate(() => document.querySelectorAll('[data-sv-screen="shop"] [data-sv-item]').length);
    await shot('g5-shop-buyback-phone-portrait');
    check(g5 >= 1, 'G5: the buy-back lists what was sold', String(g5));
    // G6: the gamble: an unknown item bought, revealed
    await tapOn('[data-sv-screen="shop"] [data-tab="gamble"]');
    await page.waitForTimeout(300);
    const g6a = await page.evaluate(() => [...document.querySelectorAll('[data-sv-screen="shop"] [data-sv="gamble"]')].map((b) => Number(/(\d+) or/.exec(b.textContent)?.[1])));
    await shot('g6-shop-gamble-phone-portrait');
    await tapOn('[data-sv-screen="shop"] [data-sv="gamble"]');
    await page.waitForTimeout(300);
    const g6 = await page.evaluate(() => document.querySelector('[data-sv-screen="shop"] [data-sv="note"]')?.textContent ?? '');
    check(
      g6a.length >= 5 && g6a.every((p) => p >= 500 && p <= 1000) && /^Révélé/.test(g6),
      'G6: the gamble: unknown items at 6 to 8 runs (at Nightmare’s level here), one revealed',
      JSON.stringify({ g6a, g6 }),
    );
    await shot('g6-shop-gambled-phone-portrait');
    await tapOn('[data-sv-screen="shop"] [data-sv="close"]');
    await page.waitForTimeout(300);
    // G7: the base's equipment panel: a long press on a bag cell wears the item
    const g7a = await page.evaluate(() => {
      const a = window.__arpg;
      const c = a.game().character;
      delete c.equipment.gloves;
      a.game().world.refreshPlayer();
      const it = a.giveItem('heavy_gloves', { forceQuality: 'magic', ilvl: 12 });
      a.app.openPanel('inventory');
      return c.inventory.indexOf(it);
    });
    await page.waitForTimeout(500);
    await holdOn(`.panel [data-inv="${g7a}"]`);
    await page.waitForTimeout(400);
    const g7 = await page.evaluate(() => window.__arpg.game().character.equipment.gloves?.base ?? null);
    check(g7 === 'heavy_gloves', 'G7: a long press on a bag cell of the equipment panel wears the item', String(g7));
    await shot('g7-hold-equipped-phone-portrait');
    await page.evaluate(() => window.__arpg.app.openPanel('close'));
    // G8: the character sheet's section
    await page.waitForTimeout(300);
    // (lot 295: the hub's Skills tab shows the stats; the base's character sheet opened over it as the pause does)
    await page.evaluate(() => window.__arpg.app.openPanel('character'));
    await page.waitForTimeout(600);
    const g8 = await page.evaluate(() => document.querySelector('[data-sv="sheet"]')?.textContent ?? '');
    check(
      /Dégâts de l'arme\d+-\d+/.test(g8) && /Vitesse d'attaque/.test(g8) && /Réduction des dégâts/.test(g8) && /Palier : Cauchemar/.test(g8),
      'G8: the character sheet: damage, speeds, damage reduction, the tier',
      g8.slice(0, 300),
    );
    await page.evaluate(() => document.querySelector('[data-sv="sheet"]')?.scrollIntoView());
    await shot('g8-sheet-phone-portrait');
    await page.evaluate(() => window.__arpg.app.openPanel('close'));
    // G9: a hero without a weapon: the starter weapon at the next run
    const g9 = await page.evaluate(() => {
      const a = window.__arpg;
      const g = a.game();
      const c = g.character;
      delete c.equipment.mainhand;
      g.world.refreshPlayer();
      return c.classId;
    });
    await page.waitForTimeout(400);
    await tapOn('[data-sv="run-hub"] [data-sv="acts"] [data-act="1"][data-diff="0"]');
    await page.waitForTimeout(300);
    await tapOn('[data-sv="run-hub"] [data-sv="play"]');
    await page.waitForFunction(() => window.__arpg.game().mode === 'run', null, { timeout: 60000 }).catch(() => undefined);
    const g9b = await page.evaluate(() => window.__arpg.game().character.equipment.mainhand?.base ?? null);
    check(!!g9b, 'G9: a hero without a weapon starts the run with the starter weapon', `${g9}: ${g9b}`);
    // K1-K3 (lot 292b, the owner's tests): in a round the pause opens the bag (an item worn, the game paused) and the skill tree; the
    // hero walks while he strikes
    // the run's first card comes a moment after its start: answered (and any other)
    await page.evaluate(() => (window.__arpg.game().world.godMode = true));
    for (let k = 0, calm = 0; k < 40 && calm < 3; k++) {
      await page.waitForTimeout(500);
      if (await page.$('[data-sv-screen="cards"]')) {
        calm = 0;
        await page.waitForTimeout(600);
        await page.click('[data-sv-screen="cards"] .sv-card').catch(() => undefined);
      } else calm++;
    }
    await tapOn('[data-sv="pause"]');
    await page.waitForSelector('[data-sv-screen="pause"]', { timeout: 10000 }).catch(() => undefined);
    const k1a = await page.evaluate(() => ({
      bag: !!document.querySelector('[data-sv-screen="pause"] [data-sv="inventory"]'),
      tree: !!document.querySelector('[data-sv-screen="pause"] [data-sv="skills"]'),
    }));
    for (const sz of sizesOf(['phone-portrait', 'phone-landscape', 'fold-folded-portrait', 'fold-open-landscape'])) {
      await size(sz);
      await shot(`k1-pause-${sz}`);
    }
    await size('phone-portrait');
    await tapOn('[data-sv-screen="pause"] [data-sv="inventory"]');
    await page.waitForTimeout(600);
    const k1 = await page.evaluate(() => {
      const a = window.__arpg;
      const g = a.game();
      const it = a.giveItem('chain_gloves', { forceQuality: 'rare', ilvl: 10 });
      const t0 = g.world.tick;
      return { open: !!document.querySelector('.panel'), mode: g.mode, idx: g.character.inventory.indexOf(it), t0 };
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__arpg.app.panels.refresh());
    await page.waitForTimeout(300);
    await holdOn(`.panel [data-inv="${k1.idx}"]`);
    await page.waitForTimeout(400);
    const k1b = await page.evaluate(() => ({ gloves: window.__arpg.game().character.equipment.gloves?.base ?? null, tick: window.__arpg.game().world.tick }));
    await shot('k1-run-inventory-phone-portrait');
    check(
      k1a.bag && k1a.tree && k1.open && k1.mode === 'run' && k1b.gloves === 'chain_gloves' && k1b.tick - k1.t0 <= 2,
      'K1: in a round the pause opens the bag, the game paused, an item worn by a long press',
      JSON.stringify({ k1a, k1, k1b }),
    );
    await page.evaluate(() => window.__arpg.app.openPanel('close'));
    await page.waitForTimeout(300);
    await tapOn('[data-sv="pause"]');
    await page.waitForSelector('[data-sv-screen="pause"]', { timeout: 10000 }).catch(() => undefined);
    await tapOn('[data-sv-screen="pause"] [data-sv="skills"]');
    await page.waitForTimeout(600);
    const k2 = await page.evaluate(() => ({ open: !!document.querySelector('.panel'), text: (document.querySelector('.panel')?.textContent ?? '').slice(0, 120), mode: window.__arpg.game().mode }));
    await shot('k2-run-skills-phone-portrait');
    check(k2.open && k2.mode === 'run', 'K2: in a round the pause opens the skill tree', JSON.stringify(k2));
    await page.evaluate(() => window.__arpg.app.openPanel('close'));
    await page.waitForTimeout(300);
    const k3 = await page.evaluate(async () => {
      const g = window.__arpg.game();
      const w = g.world;
      const p = w.player;
      const x0 = p.x;
      let attacking = 0;
      for (let t = 0; t < 25; t++) {
        if (p.mode !== 'attack') w.input.cast = { skill: 'attack', tx: p.x + 1, ty: p.y, targetId: 0 };
        w.input.moveX = 1;
        w.input.moveY = 0;
        w.step();
        if (p.mode === 'attack') attacking++;
      }
      return { moved: +(p.x - x0).toFixed(2), attacking };
    });
    check(k3.moved > 2 && k3.attacking > 10, 'K3: the hero walks while he strikes', JSON.stringify(k3));
  };
  const joyDrag = async (x, y, dx, dy) => {
    await page.evaluate(() => {
      window.__arpg.god(true);
      window.__arpg.killAll();
    });
    const p0 = await page.evaluate(() => [window.__arpg.game().world.player.x, window.__arpg.game().world.player.y]);
    await touch('touchStart', [[x, y]]);
    for (let k = 1; k <= 6; k++) {
      await touch('touchMove', [[x + (dx * k) / 6, y + (dy * k) / 6]]);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(500);
    const knob = await page.evaluate(() => {
      const z = document.querySelector('[data-testid="joystick"]');
      return { active: z.classList.contains('active'), base: z.querySelector('.joy-base').getBoundingClientRect().toJSON() };
    });
    await touch('touchEnd', []);
    await page.waitForTimeout(150);
    const p1 = await page.evaluate(() => [window.__arpg.game().world.player.x, window.__arpg.game().world.player.y]);
    return { moved: +Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(2), ...knob };
  };
  const joyLayout = () =>
    page.evaluate(() => {
      const z = document.querySelector('[data-testid="joystick"]').getBoundingClientRect();
      const btns = [...document.querySelectorAll('#hud .sbtn')].filter((b) => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0).map((b) => b.getBoundingClientRect());
      return {
        place: document.querySelector('[data-testid="joystick"]').dataset.place ?? null,
        zone: [z.left, z.top, z.right, z.bottom].map(Math.round),
        btnMinX: Math.round(Math.min(...btns.map((r) => r.left))),
        btnMaxX: Math.round(Math.max(...btns.map((r) => r.right))),
        n: btns.length,
        w: innerWidth,
        h: innerHeight,
      };
    });
  for (const name of sizesOf(['phone-portrait', 'fold-folded-portrait'])) {
    await size(name);
    const l = await joyLayout();
    const { width: W, height: H } = ALL_SIZES[name];
    const d = await joyDrag(W / 2, H * 0.72, 30, -50);
    check(
      l.place === 'center' && l.zone[0] <= 0 && l.zone[2] >= W - 1 && l.zone[1] <= H / 3 + 1 && l.btnMinX > W * 0.55 && d.moved > 1 && d.active,
      `J1 ${name}: the joystick anywhere in the lower two thirds (a touch in the centre moves the hero), the buttons in a column at the right edge`,
      JSON.stringify({ l, d }),
    );
    await shot(`j1-joystick-${name}`);
  }
  await size('phone-landscape');
  {
    const l = await joyLayout();
    const d = await joyDrag(200, 300, 40, -30);
    check(
      l.place === 'left' && l.zone[2] <= 844 / 2 + 1 && l.btnMinX > 844 / 2 && d.moved > 1,
      'J2 phone-landscape: the joystick on the left half (lower two thirds), the buttons on the right',
      JSON.stringify({ l, d }),
    );
  }
  // J3: the "Joystick" setting, from the mode's settings page: right in landscape, the buttons go left; then back to automatic
  await page.evaluate(() => window.__arpg.app.openPanel('settings'));
  await page.waitForSelector('.setopt[data-opt="joystick"]', { timeout: 10000 });
  const joyRow = await page.evaluate(() => {
    const row = document.querySelector('.setopt[data-opt="joystick"]');
    const b = [...row.querySelectorAll('button')].find((x) => /droite/i.test(x.textContent));
    b?.click();
    return { labels: [...row.querySelectorAll('button')].map((x) => x.textContent), saved: window.__arpg.game().settings.mods?.survivals?.joystick };
  });
  await shot('j3-settings-joystick-phone-landscape');
  await page.evaluate(() => window.__arpg.app.panels.hide());
  await page.waitForTimeout(500);
  {
    const l = await joyLayout();
    const d = await joyDrag(844 - 200, 300, -40, -30);
    check(
      joyRow.saved === 'right' && joyRow.labels.length === 4 && l.place === 'right' && l.zone[0] >= 844 / 2 - 1 && l.btnMaxX < 844 / 2 && d.moved > 1,
      'J3: "Joystick: right" in the settings: the joystick on the right half, the attack and skills on the left',
      JSON.stringify({ joyRow, l, d }),
    );
    await shot('j3-joystick-right-phone-landscape');
  }
  await page.evaluate(() => {
    const g = window.__arpg.game();
    g.settings.mods.survivals.joystick = 'auto';
  });
  await page.waitForTimeout(300);
  // J4: left-handed in landscape: the joystick on the right, the buttons on the left (the base's left-handed layout kept)
  await page.evaluate(() => {
    window.__arpg.game().settings.leftHanded = true;
    window.__arpg.app.applySettings(window.__arpg.game().settings);
  });
  await page.waitForTimeout(400);
  {
    const l = await joyLayout();
    check(l.place === 'right' && l.btnMaxX < 844 / 2, 'J4: left-handed in landscape: the joystick on the right, the buttons on the left', JSON.stringify(l));
  }
  await page.evaluate(() => {
    window.__arpg.game().settings.leftHanded = false;
    window.__arpg.app.applySettings(window.__arpg.game().settings);
    window.__arpg.god(false);
  });
  // H1 (lot 288; lot 290, owner: everything automatic): no attack nor skill button; the skills taken shown in a preview at the bottom,
  // never a touch target (a tap on it moves the hero: it reaches the joystick's zone), its icon refreshed after an automatic cast
  await size('phone-portrait');
  await page.waitForTimeout(400);
  {
    await page.evaluate(() => {
      const g = window.__arpg.game();
      g.character.skills.fire_bolt = Math.max(1, g.character.skills.fire_bolt ?? 0);
      g.world.refreshPlayer();
    });
    await page.waitForTimeout(600);
    const h1 = await page.evaluate(() => {
      const atk = document.querySelector('#hud [data-testid="attack"]');
      const skills = [...document.querySelectorAll('#hud .sbtn[data-skill]:not(.main):not(.small)')].filter((b) => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0);
      const strip = document.querySelector('[data-sv="skills"]');
      const r = strip?.getBoundingClientRect();
      const icons = [...(strip?.querySelectorAll('[data-skill]') ?? [])].map((x) => x.dataset.skill);
      const hit = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
      return {
        attack: getComputedStyle(atk).display,
        skillButtons: skills.length,
        icons,
        bottom: r ? Math.round(r.bottom) : 0,
        h: innerHeight,
        pe: strip ? getComputedStyle(strip).pointerEvents : null,
        hidden: strip?.getAttribute('aria-hidden'),
        hitStrip: !!hit && !!strip?.contains(hit),
      };
    });
    check(
      h1.attack === 'none' && h1.skillButtons === 0 && h1.icons.includes('fire_bolt') && h1.pe === 'none' && h1.hidden === 'true' && !h1.hitStrip && h1.bottom > h1.h - 60,
      'H1: no attack nor skill button; the skills taken in a preview at the bottom, not a touch target',
      JSON.stringify(h1),
    );
    // the semi-automatic control casts the skill on its own: its icon darkens and fills back
    await page.evaluate(() => window.__arpg.god(true));
    await page.waitForFunction(() => document.querySelector('[data-sv="skills"] [data-skill].cooling'), null, { timeout: 30000, polling: 16 }).catch(() => undefined);
    const cooling = await page.evaluate(() => !!document.querySelector('[data-sv="skills"] [data-skill].cooling'));
    await shot('h1-skills-preview-phone-portrait');
    check(cooling, 'H1: a skill cast on its own: its icon refreshes (cooldown fill)');
    await page.evaluate(() => window.__arpg.god(false));
  }
  // W1 (lot 288): the joystick held among monsters: the character still strikes while walking
  {
    await page.evaluate(() => window.__arpg.god(true));
    await page.waitForFunction(() => window.__arpg.game().world.aliveMonsters().length > 3, null, { timeout: 30000 }).catch(() => undefined);
    const c0 = await page.evaluate(() => window.__arpg.game().world.stats.casts);
    await touch('touchStart', [[195, 620]]);
    for (let i = 0; i < 40; i++) {
      // circling the thumb: the hero walks round, through the horde
      const a = (i / 40) * Math.PI * 4;
      await touch('touchMove', [[195 + Math.cos(a) * 50, 620 + Math.sin(a) * 50]]);
      await page.waitForTimeout(100);
      // a level's cards meanwhile (the game paused under them): answered by the automatic choice
      if (i % 10 === 9) await page.evaluate(() => document.querySelector('[data-sv-screen="cards"] .sv-card')?.click());
    }
    const w1 = await page.evaluate(() => ({ casts: window.__arpg.game().world.stats.casts, mode: window.__arpg.game().world.player.mode }));
    await touch('touchEnd', []);
    await page.evaluate(() => window.__arpg.god(false));
    check(w1.casts > c0, 'W1: the joystick held among monsters: the character still strikes while walking', JSON.stringify({ before: c0, ...w1 }));
  }
  // A1: the arena's trees thinned: the Blood Moor's trees left undrawn inside the arena but a few along its border
  {
    await page.waitForFunction(() => !window.__arpg.game().world.zone.d2Map || window.__arpg.renderer().mapView, null, { timeout: 60000 }).catch(() => undefined);
    const a = await page.evaluate(() => {
      const w = window.__arpg.game().world;
      const r = window.__arpg.renderer();
      return { map: w.zone.d2Map?.id ?? null, zone: w.zone.id, hidden: w.zone.d2Map?.hidden?.length ?? 0, drawn: r.mapView?.structures.length ?? null };
    });
    check(a.map === null || (a.hidden > 100 && a.drawn !== null), 'A1: the Blood Moor arena without its forest (trees inside the arena left undrawn)', JSON.stringify(a));
  }
  await size('phone-portrait');

  // 3. the round started on its own (P8); level 16 for the test: the round left by the pause (P3), the hub (P8), the round again
  await page.evaluate(() => window.__arpg.setLevel(16, true));
  // (lot 290: the levels gained while H1 waited for an automatic cast, their cards answered first)
  for (let k = 0; k < 30 && (await page.$('[data-sv-screen="cards"]')); k++) {
    await page.waitForTimeout(700);
    await page.click('[data-sv-screen="cards"] .sv-card').catch(() => undefined);
    await page.waitForTimeout(300);
  }
  await page.click('[data-sv="pause"]');
  await page.click('[data-sv-screen="pause"] [data-sv="leave"]');
  await page
    .waitForFunction(() => window.__arpg.game().mode === 'town' && !document.querySelector('.loading'), null, { timeout: 120000 })
    .catch(async (e) => {
      await shot('debug-leave-stuck');
      console.log(
        'stuck',
        await page.evaluate(() => ({
          mode: window.__arpg.game().mode,
          dead: window.__arpg.game().world.player.dead,
          screens: [...document.querySelectorAll('.sv-screen')].map((x) => x.dataset.svScreen),
          loading: !!document.querySelector('.loading'),
        })),
      );
      throw e;
    });
  await page.waitForSelector('[data-sv="hub"] [data-sv="play"]', { state: 'visible', timeout: 30000 });
  await shot('3-hub-phone-portrait');
  const play0 = await page.evaluate(() => {
    const b = document.querySelector('[data-sv="hub"] [data-sv="play"]').getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.touchscreen.tap(play0.x, play0.y);
  await page.waitForFunction(() => window.__arpg.game().world.zone.id === 'survivals:a1r1' && !document.querySelector('.loading'), null, { timeout: 120000 });
  // invulnerable for the test (the round itself is the subject, not the fight)
  await page.evaluate(() => {
    window.__svHeal = setInterval(() => {
      const p = window.__arpg.game().world.player;
      if (!p.dead) p.hp = p.hpMax;
    }, 50);
    window.__arpg.speed(6);
  });
  await page.waitForTimeout(9000);
  await page.evaluate(() => window.__arpg.speed(1));
  await page.waitForTimeout(1200);
  const roundState = () =>
    page.evaluate(() => {
      const g = window.__arpg.game();
      const d = g.world.run?.director;
      const alive = g.world.monsters.filter((m) => !m.dead && m.team === 1 && !m.pet && !m.isSummon).length;
      return { zone: g.world.zone.id, sec: d ? d.sec(g.world) : -1, alive, spawned: d?.spawned ?? -1, world: g.world.seed, mode: g.mode };
    });
  const hudTargets = () =>
    page.evaluate(() => {
      const hud = document.querySelector('[data-sv="hud"]');
      const vis = hud && getComputedStyle(hud).display !== 'none';
      const small = [...(hud?.querySelectorAll('.sv-btn') ?? [])]
        .filter((b) => getComputedStyle(b).display !== 'none')
        .map((b) => b.getBoundingClientRect())
        .filter((r) => r.width < 44 || r.height < 44)
        .map((r) => `${r.width.toFixed(0)}×${r.height.toFixed(0)}`);
      const time = hud?.querySelector('[data-sv="time"]')?.textContent;
      const pop = hud?.querySelector('[data-sv="pop"]')?.textContent;
      const r = hud?.getBoundingClientRect();
      // lot 283: the row never covers the zone's title (top left)
      const lvl = document.querySelector('#hud .lvl');
      const lr = lvl && getComputedStyle(lvl).display !== 'none' ? lvl.getBoundingClientRect() : null;
      const titleOverlap =
        lr && lr.width
          ? [...(hud?.querySelectorAll('.sv-chip, .sv-btn') ?? [])]
              .filter((e) => getComputedStyle(e).display !== 'none')
              .map((e) => e.getBoundingClientRect())
              .filter((q) => q.left < lr.right - 1 && q.right > lr.left + 1 && q.top < lr.bottom - 1 && q.bottom > lr.top + 1).length
          : 0;
      return { vis, small, time, pop, titleOverlap, box: r ? [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v)) : null, w: innerWidth, h: innerHeight };
    });
  let st = await roundState();
  check(st.zone === 'survivals:a1r1' && st.alive > 5, 'round of the Blood Moor under way', JSON.stringify(st));
  // P2. every live monster drawn with its sprite sheet (lot 285: the arena's monsters had none on a device with the Diablo II files)
  const drawnNow = () =>
    page.evaluate(() => {
      const a = window.__arpg;
      const w = a.game().world;
      const r = a.renderer();
      const live = w.monsters.filter((m) => !m.dead && m.team === 1);
      // in view (the renderer hides and does not animate those off screen): drawn with a frame of their sheet
      const shown = live.map((m) => r.actorViews.get(m.id)).filter((v) => v && v.body.visible);
      const blank = shown.filter((v) => !v.body.texture || v.body.texture.width <= 1).length;
      const v0 = live.map((m) => r.actorViews.get(m.id)).find(Boolean);
      return {
        live: live.length,
        views: live.filter((m) => r.actorViews.has(m.id)).length,
        shown: shown.length,
        blank,
        missing: r.missingSheetViews(w),
        pool: w.zone.monsterPool?.length ?? 0,
        rect: r.viewRect && Object.values(r.viewRect).map(Math.round),
        view: [r.width, r.height, +r.zoom.toFixed(3), Math.round(r.root.position.x), Math.round(r.root.position.y)],
        body0: v0 && [Math.round(v0.body.position.x), Math.round(v0.body.position.y), v0.body.visible, !!v0.body.parent],
        zone: [r.zoneId, w.zone.id, a.app.currentWorld === w],
      };
    });
  let drawn = await drawnNow();
  for (let i = 0; i < 20 && (drawn.shown === 0 || drawn.blank > 0 || drawn.missing > 0); i++) {
    await page.waitForTimeout(500);
    drawn = await drawnNow();
  }
  check(drawn.live > 5 && drawn.shown > 0 && drawn.blank === 0 && drawn.missing === 0 && drawn.pool > 0, 'P2: every live monster of the round drawn with its sprite sheet', JSON.stringify(drawn));
  // P3. the controls on screen in a round
  const controls = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#hud button, #hud [data-testid]')]
        .filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden')
        .filter((e) => e.closest('[data-sv="hub"]') === null)
        .map((e) => e.dataset.testid || e.dataset.sv || e.className),
    );
  const NOT_SHOWN = ['character', 'inventory', 'skills', 'portal', 'settings', 'potion-hp', 'potion-mp', 'page', 'context', 'image-quality', 'walk'];
  const ctl = await controls();
  check(
    ctl.includes('joystick') && !ctl.includes('attack') && ctl.includes('pause') && !ctl.some((c) => NOT_SHOWN.includes(c) || /sbtn/.test(c)),
    'P3: in a round, the joystick and the pause only (lot 290: no attack nor skill button, everything automatic)',
    JSON.stringify(ctl),
  );
  await shot('p3-round-controls-phone-portrait');

  // 4. every size; turning the device mid-round loses nothing
  for (const name of Object.keys(SIZES)) {
    const before = await roundState();
    await size(name);
    await page.waitForTimeout(800);
    const after = await roundState();
    const h = await hudTargets();
    check(
      after.zone === before.zone && after.world === before.world && after.sec > before.sec && after.spawned >= before.spawned,
      `${name}: same round after the turn, clock going`,
      `${before.sec.toFixed(1)} → ${after.sec.toFixed(1)} s`,
    );
    check(h.vis && !h.small.length && h.box && h.box[0] >= 0 && h.box[2] <= h.w && h.box[1] >= 0 && h.box[3] <= h.h, `${name}: round HUD shown inside the screen, buttons ≥ 44 px`, JSON.stringify(h));
    check(h.titleOverlap === 0, `${name}: the round's HUD clear of the zone's title`, JSON.stringify(h));
    const rot = await page.evaluate(() => getComputedStyle(document.querySelector('.rotate')).display);
    check(rot === 'none', `${name}: no rotate prompt`);
    await shot(`4-round-${name}`);
  }

  // 5. level-up cards
  await size('phone-portrait');
  await page.evaluate(() => {
    const g = window.__arpg.game();
    g.character.level += 1;
    g.character.skillPoints += 1;
    g.world.events.push({ t: 'levelUp', level: g.character.level });
  });
  await page.waitForSelector('[data-sv-screen="cards"] .sv-card', { timeout: 10000 });
  await page.waitForTimeout(900);
  for (const name of Object.keys(SIZES)) {
    await size(name);
    const cards = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[data-sv-screen="cards"] .sv-card')].map((c) => c.getBoundingClientRect());
      const btns = [...document.querySelectorAll('[data-sv-screen="cards"] .sv-btn')].map((b) => b.getBoundingClientRect());
      const row = els.length === 3 && Math.abs(els[0].top - els[2].top) < 4;
      const col = els.length === 3 && els[0].left === els[2].left && els[2].top > els[0].top;
      const inside = [...els, ...btns].every((r) => r.left >= 0 && r.right <= innerWidth + 1);
      const out = [...document.querySelectorAll('[data-sv-screen="cards"] .sv-card, [data-sv-screen="cards"] .sv-btn')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.left < 0 || r.right > innerWidth + 1;
        })
        .map((e) => {
          const r = e.getBoundingClientRect();
          return `${e.className}:${Math.round(r.left)}-${Math.round(r.right)}/${innerWidth}`;
        });
      return {
        out,
        n: els.length,
        row,
        col,
        minH: Math.min(...els.map((r) => r.height)),
        icons: document.querySelectorAll('[data-sv-screen="cards"] .sv-card .sv-art .icon').length,
        iconPx: Math.min(...[...document.querySelectorAll('[data-sv-screen="cards"] .sv-card .sv-art .icon')].map((i) => i.getBoundingClientRect().width)),
        minBtn: Math.min(...btns.map((r) => Math.min(r.width, r.height))),
        inside,
        scroll: document.querySelector('[data-sv-screen="cards"] .sv-box').scrollHeight,
      };
    });
    const portrait = ALL_SIZES[name].height > ALL_SIZES[name].width;
    check(
      cards.n === 3 && (portrait ? cards.col : cards.row) && cards.minH >= (portrait ? 96 : 64) && cards.minBtn >= 44 && cards.inside && cards.icons === 3 && cards.iconPx >= 40,
      `P4 ${name}: three cards ${portrait ? 'stacked, ≥ 96 px' : 'side by side, ≥ 64 px'}, each with its skill icon (≥ 40 px), buttons ≥ 44 px`,
      JSON.stringify(cards),
    );
    await shot(`5-cards-${name}`);
  }
  {
    const c1 = await page.evaluate(() => ({
      figs: [...document.querySelectorAll('[data-sv-screen="cards"] .sv-card')].map((c) => c.querySelectorAll('.sv-fig').length),
      keys: [...document.querySelectorAll('[data-sv-screen="cards"] .sv-key')].map((k) => k.textContent),
    }));
    check(c1.keys.join() === '1,2,3' && c1.figs.some((n) => n > 0), "C1: the cards number 1 to 3 (keys) and give their skill's figures (current → next level)", JSON.stringify(c1));
  }
  // B1 (lot 288): the counters on the buttons; "Banish" then a card: that skill leaves the draw for the round
  await size('phone-portrait');
  {
    const ids0 = await page.evaluate(() => [...document.querySelectorAll('[data-sv-screen="cards"] .sv-card')].map((c) => c.dataset.skill));
    const labels = await page.evaluate(() => ({
      reroll: document.querySelector('[data-sv-screen="cards"] [data-sv="reroll"]')?.textContent,
      banish: document.querySelector('[data-sv-screen="cards"] [data-sv="banish"]')?.textContent,
      links: document.querySelectorAll('[data-sv-screen="cards"] .sv-link').length,
    }));
    await page.click('[data-sv-screen="cards"] [data-sv="banish"]');
    await page.waitForTimeout(150);
    await page.click(`[data-sv-screen="cards"] .sv-card[data-skill="${ids0[0]}"]`);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
      ids: [...document.querySelectorAll('[data-sv-screen="cards"] .sv-card')].map((c) => c.dataset.skill),
      banish: document.querySelector('[data-sv-screen="cards"] [data-sv="banish"]')?.textContent,
      banished: window.__arpg.game().world.run?.director?.banished ?? null,
    }));
    check(
      labels.reroll === 'Relancer · 1 gratuite' &&
        labels.banish === 'Bannir · 2' &&
        after.banish === 'Bannir · 1' &&
        after.banished?.includes(ids0[0]) &&
        !after.ids.includes(ids0[0]) &&
        after.ids.length === 3,
      'B1: counters on the buttons (Reroll · 1 free, Banish · 2); a card banished leaves the draw, three new cards',
      JSON.stringify({ ids0, labels, after }),
    );
    await shot('b1-cards-banished-phone-portrait');
  }
  await size('phone-portrait');
  // P4. a real tap on the second card (not a DOM click)
  const card = await page.evaluate(() => {
    const c = document.querySelectorAll('[data-sv-screen="cards"] .sv-card')[1];
    const r = c.getBoundingClientRect();
    return { id: c.dataset.skill, x: r.x + r.width / 2, y: r.y + r.height / 2, lvl: window.__arpg.game().character.skills[c.dataset.skill] ?? 0 };
  });
  await page.touchscreen.tap(card.x, card.y);
  await page.waitForTimeout(300);
  const took = await page.evaluate(
    (card) => ({ id: card.id, lvl: window.__arpg.game().character.skills[card.id] ?? 0, before: card.lvl, open: !!document.querySelector('[data-sv-screen="cards"]') }),
    card,
  );
  check(took.lvl === took.before + 1 && !took.open, 'P4: a card taken by a real tap: the skill learned, the screen closed, the game resumes', JSON.stringify(took));

  // P5. loot walked over: the character's weapon put on the ground at its feet, its hand empty: picked up and worn again on its own
  const worn = await page.evaluate(async () => {
    const g = window.__arpg.game();
    const w = g.world;
    const it = g.character.equipment.mainhand;
    delete g.character.equipment.mainhand;
    w.refreshPlayer();
    w.items.push({ id: w.newId(), item: it, x: w.player.x, y: w.player.y, dropTick: w.tick - 20, show: 1 });
    await new Promise((r) => setTimeout(r, 1500));
    return { uid: it.uid, back: g.character.equipment.mainhand?.uid, ground: w.items.some((x) => x.item.uid === it.uid) };
  });
  check(worn.back === worn.uid && !worn.ground, 'P5: an item walked over is picked up and worn in its empty slot', JSON.stringify(worn));
  // P6. no potion, key nor plain item on the arena's ground; no potion in the belt
  const ground = await page.evaluate(() => {
    const g = window.__arpg.game();
    return {
      items: g.world.items.map((x) => `${x.item.base}:${x.item.quality}`),
      belt: g.character.belt.reduce((s, b) => s + b.qty, 0),
      gold: g.character.gold,
    };
  });
  check(
    ground.belt === 0 && !ground.items.some((x) => /potion|^key|tome_portal|:normal|:low/.test(x) && !/^gold|^r\d|^g/.test(x)),
    'P6: no potion, key nor plain item dropped in the round, the belt empty',
    JSON.stringify(ground),
  );

  // 6. the mini-boss, the end-of-round screen
  await page.evaluate(() => window.__arpg.speed(16));
  await page.waitForFunction(() => window.__arpg.game().world.monsters.some((m) => m.name === 'Corpsefire' && !m.dead), null, { timeout: 120000 });
  await page.evaluate(() => {
    window.__arpg.speed(1);
    const w = window.__arpg.game().world;
    w.killMonster(
      w.monsters.find((m) => m.name === 'Corpsefire'),
      w.player,
    );
  });
  await page.waitForSelector('[data-sv-screen="recap"]', { timeout: 10000 });
  const recap = await page.evaluate(() => ({
    text: document.querySelector('[data-sv-screen="recap"]').textContent.slice(0, 120),
    cp: window.__arpg.game().character.progression.milestones['survivals:cp:0:a1r1'],
  }));
  check(/point de reprise atteint/.test(recap.text) && recap.cp > 0, 'Corpsefire killed: end-of-round screen, checkpoint recorded', JSON.stringify(recap));
  // P8. the end-of-round screen chains the next round (no list of loot to sort: P5)
  const chain = await page.evaluate(() => ({
    next: document.querySelector('[data-sv-screen="recap"] [data-sv="next"]')?.textContent,
    list: !!document.querySelector('[data-sv-screen="recap"] .sv-loot'),
  }));
  check(chain.next === 'Manche suivante : Plaines glacées' && !chain.list, 'P8: the end-of-round screen offers the next round, no loot list', JSON.stringify(chain));
  await shot('6-recap-phone-portrait');
  await size('phone-landscape');
  await shot('6-recap-phone-landscape');
  await page.evaluate(() => [...document.querySelectorAll('[data-sv-screen="recap"] .sv-btn')].find((b) => b.textContent === 'Prolongation').click());

  // 7a. drawing caps and adaptive density (lot 284, checked in lot 285): during a round the renderer draws at most 12 corpses and 10
  // damage numbers; in software rendering the frames are slow, the density goes down a level ("Smoothness" chip shown)
  await size('phone-portrait');
  const caps = await page.evaluate(async () => {
    const r = window.__arpg.renderer();
    await new Promise((res) => setTimeout(res, 9000));
    const chip = document.querySelector('[data-sv="load"]');
    return { floaters: r.limits.floaters, corpses: r.limits.corpses, particles: r.limits.particles, smooth: !!chip && getComputedStyle(chip).display !== 'none' };
  });
  check(caps.floaters <= 10 && caps.corpses <= 12 && caps.particles <= 0.6, 'drawing caps of a round: ≤ 12 corpses, ≤ 10 damage numbers, ≤ 60 % of the particles', JSON.stringify(caps));
  console.log(`  adaptive density: ${caps.smooth ? 'lowered (slow software frames)' : 'not lowered'}`);
  await shot('7a-caps-phone-portrait');

  // 7. cost with about 90 live monsters (overtime of a strong character, density 90; adaptive density off to keep the population)
  if (PERF) {
    await page.evaluate(() => {
      const s = window.__arpg.game().settings;
      s.mods = { ...(s.mods ?? {}), survivals: { ...(s.mods?.survivals ?? {}), adaptive: 'off' } };
    });
    for (const name of sizesOf(['phone-landscape', 'phone-portrait', 'fold-open-portrait'])) {
      await size(name);
      await page.evaluate(() => window.__arpg.speed(8));
      const crowd = await page
        .waitForFunction(() => window.__arpg.game().world.monsters.filter((m) => !m.dead && m.team === 1 && !m.pet && !m.isSummon).length >= 80, null, { timeout: 180000 })
        .then(() => true)
        .catch(() => false);
      if (!crowd) {
        const why = await page.evaluate(() => {
          const g = window.__arpg.game();
          const d = g.world.run?.director;
          return { mode: g.mode, zone: g.world.zone.id, state: d?.state(g.world), settings: g.settings.mods?.survivals };
        });
        check(false, `${name}: about 80 live monsters reached in the overtime`, JSON.stringify(why));
      }
      await page.evaluate(() => {
        window.__arpg.speed(1);
        window.__arpg.metrics().frameIntervals.length = 0;
      });
      const t0 = Date.now();
      let aliveSum = 0;
      let n = 0;
      while (Date.now() - t0 < 15000) {
        await page.waitForTimeout(1000);
        aliveSum += (await roundState()).alive;
        n++;
      }
      const perf = await page.evaluate(() => {
        const a = [...window.__arpg.metrics().frameIntervals].sort((x, y) => x - y);
        const q = (p) => a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
        return { frames: a.length, median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), fps: +(1000 / q(0.5)).toFixed(1) };
      });
      report[name] = { ...perf, aliveAvg: +(aliveSum / n).toFixed(1) };
      check(perf.frames > 20, `${name}: ~${report[name].aliveAvg} live monsters, frame ${perf.median} ms median, ${perf.p95} ms p95 (software rendering)`);
      await shot(`7-perf-${name}`);
    }
  }

  await page.evaluate(() => {
    const s = window.__arpg.game().settings;
    if (s.mods?.survivals) s.mods.survivals.adaptive = 'on';
  });

  // 8. the app closed in the middle of the round: back in the same round at the same second
  await size('phone-portrait');
  const saved = await page.evaluate(() => {
    window.__arpg.speed(1);
    window.__arpg.app.saveNow();
    const g = window.__arpg.game();
    return { zone: g.world.zone.id, sec: g.world.run.director.sec(g.world), spawned: g.world.run.director.spawned, checkpoint: g.world.run.director.checkpoint };
  });
  await page.reload();
  await page.waitForSelector('.d2c, .charselect', { timeout: 120000 });
  if (await page.$('.d2c')) await page.click('.d2c-skip');
  await page.waitForSelector('[data-act="modetype"], [data-act="mode"]', { timeout: 90000 });
  await pickMode(page, 'd2+survivals');
  await page.waitForSelector('.sel-slot', { timeout: 120000 });
  await page.waitForTimeout(400);
  await page.dblclick('.sel-slot');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 240000 });
  const back = await page.evaluate(() => {
    const g = window.__arpg.game();
    const d = g.world.run?.director;
    return { mode: g.mode, zone: g.world.zone.id, sec: d ? d.sec(g.world) : -1, spawned: d?.spawned ?? -1, checkpoint: d?.checkpoint };
  });
  check(
    back.mode === 'run' && back.zone === saved.zone && back.sec >= saved.sec && back.sec < saved.sec + 15 && back.spawned >= saved.spawned && back.checkpoint === saved.checkpoint,
    'app closed mid-round: back in the same round, at the same second, after the reload',
    `${JSON.stringify(saved)} → ${JSON.stringify(back)}`,
  );
  await shot('9-resumed-phone-portrait');
  await page.evaluate(() => {
    // kept alive in the rounds that follow (Hell's monsters can kill between two heals on a loaded machine)
    window.__svHeal = setInterval(() => {
      const w = window.__arpg.game().world;
      if (!w.player.dead) w.player.hp = w.player.hpMax;
      w.godMode = true;
    }, 50);
  });

  // 9. a round of each of Acts II to V, from the waypoint of the act's town
  const FOLD = ['fold-folded-portrait', 'fold-folded-landscape', 'fold-open-portrait', 'fold-open-landscape'];
  for (const name of sizesOf(FOLD)) {
    await size(name);
    await shot(`10-act1-${name}`);
  }
  // the quick mode: Act IV only (its own levels registry, the one the others do not test)
  const LATER_ACTS = [
    [2, 'a2r1', 22],
    [3, 'a3r1', 30],
    [4, 'a4r1', 36],
    [5, 'a5r1', 36],
  ];
  for (const [act, round, level] of QUICK ? LATER_ACTS.filter(([a]) => a === 4) : LATER_ACTS) {
    await size('phone-portrait');
    await page.evaluate(
      ([act, level]) => {
        const a = window.__arpg;
        const g = a.game();
        const ms = g.character.progression.milestones;
        // the earlier acts cleared (their checkpoints, as the bots' campaign does)
        const ids = { 1: 7, 2: 7, 3: 5, 4: 3, 5: 7 };
        for (let x = 1; x < act; x++) for (let i = 1; i <= ids[x]; i++) ms[`survivals:cp:0:a${x}r${i}`] ??= 10;
        a.setLevel(level, true);
        g.enterTown(`act${act}`);
      },
      [act, level],
    );
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__arpg.app.openPanel('waypoint'));
    await page.waitForSelector(`[data-sv="waypoint"] button[data-round="${round}"]`, { timeout: 30000 });
    const wp = await page.evaluate((round) => {
      const b = document.querySelector(`[data-sv="waypoint"] button[data-round="${round}"]`);
      return {
        disabled: b.disabled,
        open: b.closest('details')?.open,
        town: window.__arpg.game().lastTown,
        acts: [...document.querySelectorAll('[data-sv="waypoint"] details[data-act]')].map((d) => d.dataset.act),
      };
    }, round);
    check(!wp.disabled && wp.open && wp.town === `act${act}`, `Act ${act}: in its town, its first round open in the waypoint (act unfolded)`, JSON.stringify(wp));
    await shot(`11-waypoint-act${act}-phone-portrait`);
    await page.click(`[data-sv="waypoint"] button[data-round="${round}"]`);
    await page.waitForFunction((round) => window.__arpg.game().world.zone.id === `survivals:${round}` && !document.querySelector('.loading'), round, { timeout: 120000 });
    await page.evaluate(() => window.__arpg.speed(6));
    await page.waitForTimeout(8000);
    await page.evaluate(() => window.__arpg.speed(1));
    await page.waitForTimeout(800);
    const rs = await roundState();
    check(rs.zone === `survivals:${round}` && rs.alive > 3, `Act ${act}: round ${round} under way`, JSON.stringify(rs));
    for (const name of sizesOf(FOLD)) {
      await size(name);
      await page.waitForTimeout(500);
      const h = await hudTargets();
      check(h.vis && !h.small.length && h.box && h.box[0] >= 0 && h.box[2] <= h.w && h.box[3] <= h.h, `Act ${act}, ${name}: HUD inside the screen, buttons ≥ 44 px`, JSON.stringify(h));
      await shot(`12-act${act}-${name}`);
    }
  }

  // 9b. Nightmare and Hell (lot 282): opened by Baal, the highest difficulty unfolded in the waypoint with its rounds cleared, a round of
  // each started from it, the HUD naming the difficulty, screenshots portrait and landscape, phone and Fold folded and unfolded
  // the quick mode: Hell only (Nightmare's checks are the same)
  for (const [d, name, round, level] of [
    [1, 'Cauchemar', 'a1r2', 50],
    [2, 'Enfer', 'a2r1', 76],
  ].filter(([d]) => !QUICK || d === 2)) {
    await size('phone-portrait');
    await page.evaluate(
      ([d, level]) => {
        const a = window.__arpg;
        const g = a.game();
        const ms = g.character.progression.milestones;
        // the campaign of the difficulties below cleared (Baal opened this one), and the first round of this one
        const ids = { 1: 7, 2: 7, 3: 5, 4: 3, 5: 7 };
        for (let dd = 0; dd < d; dd++) for (let x = 1; x <= 5; x++) for (let i = 1; i <= ids[x]; i++) ms[`survivals:cp:${dd}:a${x}r${i}`] ??= 10;
        ms[`survivals:cp:${d}:a1r1`] ??= 10;
        if (d === 2) for (let i = 1; i <= 7; i++) ms[`survivals:cp:2:a1r${i}`] ??= 10;
        g.character.progression.highestDifficulty = d;
        a.setLevel(level, true);
        g.enterTown(d === 2 ? 'act2' : 'act1');
      },
      [d, level],
    );
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__arpg.app.openPanel('waypoint'));
    const sel = `[data-sv="waypoint"] details[data-diff="${d}"] button[data-round="${round}"]`;
    await page.waitForSelector(sel, { timeout: 30000 });
    const wp = await page.evaluate((d) => {
      const diffs = [...document.querySelectorAll('[data-sv="waypoint"] details[data-diff]')];
      return { diffs: diffs.map((x) => `${x.dataset.diff}:${x.open}`), text: diffs[0]?.querySelector('summary')?.textContent ?? '', top: diffs[0]?.dataset.diff === String(d) };
    }, d);
    check(
      wp.top && wp.diffs[0] === `${d}:true` && wp.diffs.slice(1).every((x) => x.endsWith(':false')) && /Manches terminées : \d+ \/ 29/.test(wp.text),
      `${name}: unfolded first in the waypoint, the others folded, its rounds cleared`,
      JSON.stringify(wp),
    );
    await shot(`13-waypoint-${d === 1 ? 'nightmare' : 'hell'}-phone-portrait`);
    await page.click(sel);
    await page.waitForFunction((round) => window.__arpg.game().world.zone.id === `survivals:${round}` && !document.querySelector('.loading'), round, { timeout: 120000 });
    await page.evaluate(() => window.__arpg.speed(6));
    await page.waitForTimeout(10000);
    await page.evaluate(() => window.__arpg.speed(1));
    await page.waitForTimeout(800);
    const rs = await roundState();
    const diff = await page.evaluate(() => ({
      d: window.__arpg.game().world.difficulty,
      chip: document.querySelector('[data-sv="difficulty"]')?.textContent,
      mlvl: Math.min(
        ...window.__arpg
          .game()
          .world.monsters.filter((m) => m.team === 1 && !m.dead)
          .map((m) => m.mlvl),
      ),
    }));
    check(rs.zone === `survivals:${round}` && rs.alive > 3 && diff.d === d && diff.chip === name, `${name}: round ${round} under way, HUD "${name}"`, JSON.stringify({ ...rs, ...diff }));
    for (const sz of sizesOf(['phone-portrait', 'phone-landscape', ...FOLD])) {
      await size(sz);
      await page.waitForTimeout(500);
      const h = await hudTargets();
      check(h.vis && !h.small.length && h.box && h.box[0] >= 0 && h.box[2] <= h.w && h.box[3] <= h.h, `${name}, ${sz}: HUD inside the screen, buttons ≥ 44 px`, JSON.stringify(h));
      check(h.titleOverlap === 0, `${name}, ${sz}: HUD clear of the zone's title`, JSON.stringify(h));
      await shot(`14-${d === 1 ? 'nightmare' : 'hell'}-${sz}`);
    }
  }

  // 9c. Named elites and loot (lot 283), in the Hell round of the Sewers: the next event's chip names Radament and pulses before he
  // comes, his bar under the HUD while he lives (every size), the mode's loot settings, his loot told at his death
  await size('phone-portrait');
  await page.evaluate(() => {
    const g = window.__arpg.game();
    const d = g.world.run.director;
    d.start -= 25 * Math.max(0, 470 - d.sec(g.world));
  });
  await page.waitForTimeout(1500);
  const tele = await page.evaluate(() => {
    const n = document.querySelector('[data-sv="next"]');
    return { text: n?.textContent, soon: n?.classList.contains('soon') };
  });
  check(/^Radament \d:\d\d$/.test(tele.text ?? '') && tele.soon, 'Hell: the next event names Radament and pulses in its last 10 s', JSON.stringify(tele));
  await page.evaluate(() => window.__arpg.speed(4));
  await page.waitForFunction(() => [...document.querySelectorAll('[data-sv-boss]')].some((b) => b.textContent === 'Radament'), null, { timeout: 60000 });
  await page.evaluate(() => window.__arpg.speed(1));
  for (const sz of sizesOf(['phone-portrait', 'phone-landscape', ...FOLD])) {
    await size(sz);
    await page.waitForTimeout(500);
    const b = await page.evaluate(() => {
      const bar = document.querySelector('[data-sv-boss]');
      const r = bar?.getBoundingClientRect();
      return { name: bar?.textContent, box: r ? [r.left, r.top, r.right, r.bottom].map(Math.round) : null, w: innerWidth, h: innerHeight };
    });
    const h = await hudTargets();
    check(
      b.name === 'Radament' && b.box && b.box[0] >= 0 && b.box[2] <= b.w && b.box[3] <= b.h && h.titleOverlap === 0,
      `${sz}: Radament's bar first (the round's boss), inside the screen, HUD clear of the title`,
      JSON.stringify({ ...b, t: h.titleOverlap }),
    );
    await shot(`15-boss-bar-${sz}`);
  }
  await size('phone-portrait');
  // P3. the pause (the only button of the round's row): automatic attack, settings, leave (lot 286: the mode's settings are in the
  // settings panel, no loot setting: the loot is always picked up by walking over it)
  await page.click('[data-sv="pause"]');
  await page.waitForSelector('[data-sv-screen="pause"]');
  const pz = await page.evaluate(() => ({
    btns: [...document.querySelectorAll('[data-sv-screen="pause"] [data-sv]')].map((b) => b.dataset.sv),
    paused: window.__arpg.app.paused,
  }));
  check(
    ['resume', 'options', 'leave'].every((k) => pz.btns.includes(k)) && !pz.btns.includes('auto-attack') && pz.paused,
    'P3: the pause screen (game paused): resume, settings, leave (lot 290: no automatic-attack switch)',
    JSON.stringify(pz),
  );
  await shot('p3-pause-phone-portrait');
  // S1-S3 (lot 286, owner's screenshot: "far fewer settings"). The pause's "Settings" opens the base's panel with the mode's page: one
  // flat list (no folded category, no search box), the mode's rows first, a dozen of the base's options, none of the hidden ones
  await page.click('[data-sv-screen="pause"] [data-sv="options"]');
  await page.waitForSelector('#panels .setpane', { timeout: 10000 });
  const SET_SIZES = { ...SIZES, pc: { width: 1440, height: 900 } };
  for (const [sz, vp] of Object.entries(SET_SIZES)) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(500);
    const sp = await page.evaluate(() => {
      const pane = document.querySelector('#panels .setpane');
      const opts = [...pane.querySelectorAll('.setopt')].map((o) => o.dataset.opt);
      const r = pane.getBoundingClientRect();
      const small = [...pane.querySelectorAll('button')].filter((b) => {
        const x = b.getBoundingClientRect();
        return x.width > 0 && x.height < 28;
      }).length;
      return {
        opts,
        search: !!pane.querySelector('.set-search'),
        cats: pane.querySelectorAll('.setcat').length,
        heads: [...pane.querySelectorAll('.lvl')].map((h) => h.textContent),
        tabs: [...document.querySelectorAll('#panels header .tabs .btn')].map((b) => b.textContent),
        inside: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0,
        small,
        semi: pane.querySelector('[data-opt="control"] .btn.sel')?.textContent,
      };
    });
    const hiddenOk = !sp.opts.some((o) =>
      /^(lootRate|lootFilter|autoPickup|beltRefill|durability|freeRespec|potionUpgrade|zoom|lighting|image|showPerf|showCollisions|sync|exportSave|packs|credits|changelog|confirm)/.test(o),
    );
    check(
      !sp.search &&
        sp.cats === 0 &&
        sp.opts[0] === 'control' &&
        ['control', 'cards', 'stats', 'density', 'adaptive', 'lang', 'sound', 'music', 'leftHanded', 'damageNumbers', 'switchChar'].every((k) => sp.opts.includes(k)) &&
        hiddenOk &&
        sp.opts.length <= 18 &&
        sp.inside,
      `S1 ${sz}: settings on one page, the mode's rows first, ${sp.opts.length} options, no search box nor folded category`,
      JSON.stringify(sp),
    );
    check(sp.heads.every((h, i, a) => a.indexOf(h) === i) && sp.semi === 'Semi-automatique', `S2 ${sz}: headings only over groups, control semi-automatic`, JSON.stringify(sp.heads));
    await shot(`s1-settings-${sz}`);
    await page.evaluate(() => document.querySelector('#panels .setpane').scrollTo(0, 1e5));
    await page.waitForTimeout(150);
    await shot(`s1-settings-${sz}-end`);
  }
  await size('phone-portrait');
  // S3. a mode's row changed in the panel: the mode's setting (Settings.mods.survivals) follows, and back
  await page.click('#panels [data-opt="control"] .btn:text-is("Automatique")');
  const ctlA = await page.evaluate(() => window.__arpg.game().settings.mods?.survivals?.control);
  await page.click('#panels [data-opt="control"] .btn:text-is("Semi-automatique")');
  const ctl2 = await page.evaluate(() => window.__arpg.game().settings.mods?.survivals?.control);
  check(ctlA === 'auto' && ctl2 === 'semi', 'S3: the control changed from the settings panel (automatic, then semi-automatic again)', `${ctlA} → ${ctl2}`);
  await page.evaluate(() => window.__arpg.app.openPanel('close'));
  await page.waitForTimeout(300);
  const told = await page.evaluate(() => {
    const g = window.__arpg.game();
    const m = g.world.run.director.bossMonsters()[0];
    if (!m) return { err: 'no boss' };
    g.world.killMonster(m, g.world.player);
    return { name: m.name };
  });
  await page.waitForFunction(() => /Butin de Radament/.test(document.body.textContent ?? ''), null, { timeout: 10000 }).catch(() => undefined);
  const said = await page.evaluate(() => /Butin de Radament : \d+ objet/.test(document.body.textContent ?? ''));
  check(said, "Radament's loot told at his death", JSON.stringify(told));
  await shot('15-loot-told-phone-portrait');
  await page.waitForSelector('[data-sv-screen="recap"]', { timeout: 20000 });
  await page.evaluate(() => [...document.querySelectorAll('[data-sv-screen="recap"] .sv-btn')].find((b) => b.textContent === 'Prolongation')?.click());
  await page.waitForTimeout(500);

  // 10. death: the round is lost, no portal back to it
  await size('phone-portrait');
  await page.evaluate(() => {
    clearInterval(window.__svHeal);
    window.__arpg.speed(1);
    const w = window.__arpg.game().world;
    w.godMode = false;
    w.player.hp = 0;
    w.killPlayer();
  });
  // D1 (lot 288): the round lost, in place of the base's notice: the killer and the hit (or "slain in the round")
  await page.waitForSelector('[data-sv="death"]', { state: 'visible', timeout: 5000 }).catch(() => undefined);
  const d1 = await page.evaluate(() => ({
    own: document.querySelector('[data-sv="death"]')?.textContent ?? null,
    base: getComputedStyle(document.querySelector('#hud .death')).display,
  }));
  check(/Manche perdue/.test(d1.own ?? '') && /Tué/.test(d1.own ?? '') && d1.base === 'none', 'D1: a death: "Round lost" and its killer in place of the base\'s notice', JSON.stringify(d1));
  await shot('d1-round-lost-phone-portrait');
  await page.waitForFunction(() => window.__arpg.game().mode === 'town' && !document.querySelector('.loading'), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  {
    const lost = await page.evaluate(() => document.querySelector('[data-sv="hub"] [data-sv="lost"]')?.textContent ?? null);
    check(/Manche perdue : /.test(lost ?? '') && /monstres tués/.test(lost ?? ''), 'D1: back in town, the hub tells the round lost (killer, time, level, kills)', JSON.stringify(lost));
    await shot('d1-hub-lost-phone-portrait');
  }
  await page.waitForTimeout(1000);
  const town = await page.evaluate(() => ({ suspended: window.__arpg.game().hasSuspendedRun, portal: window.__arpg.game().world.objects.some((o) => o.kind === 'portal' && o.ref === 'run') }));
  check(!town.suspended && !town.portal, 'death: back in town, no portal back to the round', JSON.stringify(town));
  await shot('8-town-after-death-phone-portrait');
  // P8. the hub in town: the next round and the panels without walking; P6/P7: the vendor opened from it sells no potion, its prices
  // against the gold of the loot
  const hub = await page.evaluate(() => {
    const h = document.querySelector('[data-sv="hub"]');
    return {
      shown: !!h && getComputedStyle(h).display !== 'none',
      play: h?.querySelector('[data-sv="play"]')?.textContent,
      panels: [...(h?.querySelectorAll('[data-panel]') ?? [])].map((b) => b.dataset.panel),
    };
  });
  check(
    hub.shown && /^Jouer : /.test(hub.play ?? '') && ['character', 'inventory', 'skills', 'stash', 'vendor', 'settings', 'waypoint'].every((k) => hub.panels.includes(k)),
    'P8: in town, the hub: next round, character, bag, skills, stash, vendor, options, rounds',
    JSON.stringify(hub),
  );
  for (const sz of sizesOf(['phone-portrait', 'phone-landscape', 'fold-folded-portrait', 'fold-open-landscape'])) {
    await size(sz);
    await shot(`p8-hub-${sz}`);
  }
  await size('phone-portrait');
  const vb = await page.evaluate(() => {
    const b = document.querySelector('[data-sv="hub"] [data-panel="vendor"]').getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.touchscreen.tap(vb.x, vb.y);
  await page.waitForTimeout(1200);
  const shop = await page.evaluate(() => {
    const g = window.__arpg.game();
    const text = document.querySelector('#panels')?.textContent ?? '';
    const prices = g.vendor.map((v) => v.price).sort((a, b) => a - b);
    return {
      open: /Larzuk/.test(text),
      potions: /Potion de soins|Potion de mana|Clé \(50 or\)|Tome de portail/.test(text),
      gold: g.character.gold,
      cheapest: prices[0],
      median: prices[Math.floor(prices.length / 2)],
    };
  });
  check(shop.open && !shop.potions, 'P6/P7: the vendor opened from the hub, no potion, key nor tome for sale', JSON.stringify(shop));
  check(shop.gold > 0 && shop.cheapest > 0, `P7: gold of the loot ${shop.gold}, vendor's stall from ${shop.cheapest} (median ${shop.median}) gold`);
  await shot('p7-vendor-phone-portrait');
  await page.evaluate(() => window.__arpg.app.openPanel('close'));
  await page.waitForTimeout(500);
  const pb = await page.evaluate(() => {
    const b = document.querySelector('[data-sv="hub"] [data-sv="play"]').getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.touchscreen.tap(pb.x, pb.y);
  await page.waitForFunction(() => window.__arpg.game().mode === 'run' && /^survivals:/.test(window.__arpg.game().world.zone.id), null, { timeout: 60000 }).catch(() => undefined);
  const again = await page.evaluate(() => ({ mode: window.__arpg.game().mode, zone: window.__arpg.game().world.zone.id }));
  check(again.mode === 'run', 'P8: the hub\'s "Play" starts the next round at once', JSON.stringify(again));
  // M2. back on the main menu with the mode running: the mode's "how to play" among the links
  await page.goto(URL);
  await page.waitForSelector('.d2c, .charselect', { timeout: 120000 });
  if (await page.$('.d2c')) await page.click('.d2c-skip');
  await page.waitForSelector('[data-act="exit"], [data-act="modetype"], [data-act="mode"]', { timeout: 90000 });
  if (await page.$('[data-act="exit"]')) await page.click('[data-act="exit"]');
  await page.waitForSelector('[data-act="modetype"], [data-act="mode"]', { timeout: 30000 });
  const how = await page.evaluate(() => [...document.querySelectorAll('.d2b.link')].map((l) => l.textContent));
  check(how.includes('Survivals : comment jouer'), 'M2: the mode running, its "how to play" among the menu\'s links', JSON.stringify(how));
  await menuCheck('survivals');

  // R1-R6 (lot 289): the Run mode, the default. A new character created with the default variant runs Act I from level 1 at once; a zone
  // cleared leads to the next one without a town; a death ends the run (run-end screen: killer, zone, level, kills, gold, items), the hub
  // (act, records, gear panels), the gear kept and the level back to 1 at the next run; the act's boss wins the run and opens Act II
  await size('phone-portrait');
  await pickMode(page, 'd2+survivals');
  await page.waitForSelector('.sel-slot, .d2input', { timeout: 120000 });
  await page.waitForTimeout(400);
  if (await page.$('.sel-slot')) await page.click('[data-act="create"]');
  await page.waitForSelector('.d2input');
  await page.fill('.d2input', 'Runner');
  await page.click('.d2b.ok');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading') && window.__arpg.game().character.name === 'Runner', null, { timeout: 240000 });
  await page.waitForFunction(() => window.__arpg.game().world.zone.id === 'survivals:a1r1', null, { timeout: 120000 });
  const r1 = await page.evaluate(() => {
    const g = window.__arpg.game();
    const m = g.character.progression.milestones;
    return { mode: m['survivals:mode'], active: m['survivals:run:active'], level: g.character.level, zone: document.querySelector('[data-sv="zone"]')?.textContent, offers: g.offers.length };
  });
  check(r1.mode === 1 && r1.active === 1 && r1.level === 1, 'R1: a new character plays the Run by default: Act I from level 1 at once', JSON.stringify(r1));
  // the first card (the level's skill point)
  await page.waitForSelector('[data-sv-screen="cards"]', { timeout: 15000 }).catch(() => undefined);
  const firstCard = await page.$('[data-sv-screen="cards"]');
  check(!!firstCard, 'R1: the first card at the start of the run');
  await shot('r1-run-first-card-phone-portrait');
  if (firstCard) {
    await page.waitForTimeout(700);
    await page.click('[data-sv-screen="cards"] .sv-card');
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(1500);
  check(/^Zone 1 \/ 5$/.test((await page.evaluate(() => document.querySelector('[data-sv="zone"]')?.textContent)) ?? ''), 'R1: the HUD names the zone of the act');
  // F1 (lot 291): Act I's timed flow: the hero runs at about 4 units a second and walks while he casts, the field gentle at first
  const f1 = await page.evaluate(() => {
    const g = window.__arpg.game();
    const d = g.world.run.director;
    return { speed: +g.world.playerSpeed(false).toFixed(2), target: d.state(g.world).target, zoneEnd: d.opts.flow?.zoneEnd ?? null };
  });
  check(Math.abs(f1.speed - 4) < 0.3 && f1.target <= 25 && f1.zoneEnd === 90, 'F1: Act I flow: ~4 units/s, a gentle start, a first zone of 90 s (lot 292c)', JSON.stringify(f1));
  await shot('r1-run-zone1-phone-portrait');
  // L1-L5 (lot 294, the owner's tests): no mana in Act I's flow (gauge hidden, kept full, skills free), the attack drawn while the hero
  // walks, an archer's shots aimed ahead of a walking hero and drawn with their own effect, a learned Leap cast on its own, the hub telling
  // that each run starts again at level 1
  const l1 = await page.evaluate(() => {
    const g = window.__arpg.game();
    const p = g.world.player;
    const mana = [...document.querySelectorAll('#hud .orb.mana, #hud .bar.mana, #hud .pcorb.mana')];
    const life = [...document.querySelectorAll('#hud .orb.life, #hud .bar.life')];
    return {
      mana: mana.length,
      manaShown: mana.filter((e) => getComputedStyle(e).display !== 'none').length,
      lifeShown: life.filter((e) => getComputedStyle(e).display !== 'none').length,
      full: p.mana === p.manaMax,
      pcbar: [...document.querySelectorAll('#hud [data-testid="pcbar"]')].filter((e) => getComputedStyle(e).display !== 'none').length,
    };
  });
  check(l1.mana > 0 && l1.manaShown === 0 && l1.lifeShown > 0 && l1.full && l1.pcbar === 0, 'L1: Act I flow: no mana gauge (life kept), the mana full, no skill bar', JSON.stringify(l1));
  const l2 = await page.evaluate(() => {
    const a = window.__arpg;
    const w = a.game().world;
    const p = w.player;
    const R = a.renderer();
    w.godMode = true;
    const names = [];
    const x0 = p.x;
    for (let t = 0; t < 14; t++) {
      if (p.mode !== 'attack') w.input.cast = { skill: 'attack', tx: p.x + 1, ty: p.y, targetId: 0 };
      w.input.moveX = 1;
      w.input.moveY = 0;
      w.step();
      R.updateActors(w, 1);
      if (p.mode === 'attack') names.push(R.actorViews.get(p.id)?.lastName ?? '');
    }
    return { moved: +(p.x - x0).toFixed(2), names: names.slice(0, 6), all: names.length, attack: names.filter((n) => /^attack\//.test(n)).length };
  });
  check(l2.moved > 1 && l2.all > 3 && l2.attack === l2.all, 'L2: walking, the strike is drawn for its whole length (not the walk)', JSON.stringify(l2));
  const l3 = await page.evaluate(async () => {
    const a = window.__arpg;
    const g = a.game();
    const w = g.world;
    const p = w.player;
    const { simHooks } = await import('/src/sim/hooks.ts');
    const { MISSILE_FX } = await import('/src/render/fx.ts');
    const { MONSTER_BY_ID } = await import('/src/mods/sdk.ts');
    // a shooter of the zone's own species (its effects preloaded with the zone, lot 294), else an archer
    const species = (w.zone.monsterPool ?? []).find((id) => MONSTER_BY_ID[id]?.attacks.some((at) => at.kind === 'missile' && MISSILE_FX[at.missile])) ?? 'dark_ranger';
    const fxId = `fx_${MISSILE_FX[MONSTER_BY_ID[species].attacks.find((at) => at.kind === 'missile').missile]}`;
    for (const m of w.monsters) m.dead = true;
    w.godMode = false;
    const archer = simHooks.spawnMonster(w, species, p.x, p.y + 7, { rank: 'normal' }, 'e2e-archer');
    archer.hpMax = archer.hp = 1e6;
    archer.speed = 0;
    const taken0 = w.stats.damageTaken;
    const seen = new Set();
    for (let t = 0; t < 12 * 25; t++) {
      for (const m of w.monsters) if (m !== archer && m.team === 1) m.dead = true;
      p.hp = p.hpMax;
      w.input.moveX = t % 200 < 100 ? 1 : -1;
      w.input.moveY = 0;
      w.step();
      for (const ms of w.missiles) if (ms.team === 1) seen.add(ms.id);
      archer.x = p.x;
    }
    const R = a.renderer();
    await R.bank.setActive(R.sheetsFor(w)).catch(() => undefined);
    const fx = !!R.bank.get(fxId)?.anims?.idle;
    archer.dead = true;
    w.godMode = true;
    return { species, fxId, shots: seen.size, taken: Math.round(w.stats.damageTaken - taken0), fx, imported: R.bank.has(fxId) };
  });
  check(l3.shots > 2 && l3.taken > 0 && (l3.fx || !l3.imported), 'L3: a shooter 7 units away hits the walking hero, its missile drawn with its own effect', JSON.stringify(l3));
  const l4 = await page.evaluate(() => {
    const a = window.__arpg;
    const g = a.game();
    const w = g.world;
    const c = g.character;
    const keep = { level: c.level, skills: { ...c.skills }, points: c.skillPoints };
    a.learnAll(3);
    w.refreshPlayer();
    const learned = Object.keys(c.skills).filter((id) => c.skills[id] > 0);
    const casts = {};
    for (let t = 0; t < 30 * 25; t++) {
      w.godMode = true;
      w.input.moveX = Math.cos(t / 60);
      w.input.moveY = Math.sin(t / 60);
      for (const e of g.step(1)) if (e.t === 'cast' && e.id === w.player.id) casts[e.skill] = (casts[e.skill] ?? 0) + 1;
      if (g.offers.length) g.takeOffer(null);
    }
    c.level = keep.level;
    c.skills = keep.skills;
    c.skillPoints = keep.points;
    w.refreshPlayer();
    const strip = [...document.querySelectorAll('[data-sv="skills"] .sv-sk')].map((e) => e.dataset.skill);
    return { cls: c.classId, learned: learned.length, cast: Object.keys(casts).length, casts, strip: strip.length };
  });
  check(l4.cast >= 4 && l4.strip > 0, 'L4: every learned skill comes in turn, on its own, while the hero walks (lot 294)', JSON.stringify(l4).slice(0, 400));
  await shot('l4-skills-in-turn-phone-portrait');
  // R2: the zone cleared: the next zone a few seconds later, no town
  await page.evaluate(() => {
    const g = window.__arpg.game();
    g.world.godMode = true;
    g.character.progression.milestones['survivals:run:cleared'] = 1;
    g.world.run.completed = true;
    g.world.run.completeTick = g.world.tick;
  });
  // (lot 291: Act I's experience ×8, a level's cards may come meanwhile: answered; lot 296: the quicker levels bring more of them)
  // (the card of the screen on top, clicked in the page: Playwright's click waited 30 s on a card still locked or moving)
  const answerCard = () =>
    page.evaluate(() => {
      const s = [...document.querySelectorAll('[data-sv-screen="cards"]')];
      const top = s[s.length - 1];
      if (!top) return;
      // lot 299: a card whose offer went stale (L4 set the hero's skills back under an open offer) is refused: the point kept instead
      top.dataset.tries = String(Number(top.dataset.tries ?? 0) + 1);
      if (Number(top.dataset.tries) > 3) top.querySelector('[data-sv="keep"]')?.click();
      else top.querySelector('.sv-card')?.click();
    });
  for (let k = 0; k < 180 && (await page.evaluate(() => window.__arpg.game().world.zone.id)) !== 'survivals:a1r2'; k++) {
    if (await page.$('[data-sv-screen="cards"]')) await answerCard();
    await page.waitForTimeout(500);
  }
  const r2 = await page.evaluate(() => {
    const g = window.__arpg.game();
    // lot 299: what holds the zone when it does not go on (diagnosis)
    return {
      zone: g.world.zone.id,
      mode: g.mode,
      chip: document.querySelector('[data-sv="zone"]')?.textContent,
      tick: g.world.tick,
      completed: g.world.run?.completed,
      completeTick: g.world.run?.completeTick,
      screens: [...document.querySelectorAll('.mod-screen [data-sv-screen]')].map((e) => e.dataset.svScreen),
      dead: g.world.player.dead,
      runDef: g.runDef?.id,
    };
  });
  check(r2.zone === 'survivals:a1r2' && r2.mode === 'run', 'R2: a zone cleared, the next one without a town', JSON.stringify(r2));
  await page.waitForTimeout(1200);
  await shot('r2-run-zone2-phone-portrait');
  // lot 296: the quicker levels leave several cards waiting (each one shown after the last): all answered before the death
  for (let k = 0; k < 60 && ((await page.$('[data-sv-screen="cards"]')) || (await page.evaluate(() => window.__arpg.game().offers.length > 0))); k++) {
    await answerCard();
    await page.waitForTimeout(700);
  }
  // R3: the hero grown in the run, an item found kept (put in the bag as the pickup does), then killed: the run-end screen
  const kept = await page.evaluate(() => {
    const g = window.__arpg.game();
    const c = g.character;
    c.gold += 777;
    const it = c.stash.flat().find(Boolean) ?? Object.values(c.equipment)[0];
    return { gold: c.gold, worn: Object.keys(c.equipment).length, base: it?.base ?? null };
  });
  await page.evaluate(() => {
    const g = window.__arpg.game();
    g.world.godMode = false;
    g.world.player.hp = 0;
    g.world.player.dead = true;
    g.world.events.push({ t: 'playerDeath' });
  });
  await page.waitForSelector('[data-sv-screen="run-end"]', { timeout: 30000 }).catch(() => undefined);
  const r3 = await page.evaluate(() => {
    const s = document.querySelector('[data-sv-screen="run-end"]');
    const g = window.__arpg.game();
    return {
      outcome: s?.dataset.outcome,
      text: s?.textContent ?? '',
      again: !!s?.querySelector('[data-sv="again"]'),
      hub: !!s?.querySelector('[data-sv="hub"]'),
      level: g.character.level,
      mode: g.mode,
      gold: g.character.gold,
      worn: Object.keys(g.character.equipment).length,
    };
  });
  check(
    r3.outcome === 'death' && /Run terminée : Plaines glacées/.test(r3.text) && /Tué/.test(r3.text) && /Zone atteinte2 \/ 5/.test(r3.text) && r3.again && r3.hub,
    'R3: death ends the run: the run-end screen (killer, zone, level, kills, gold, items; play again, hub)',
    r3.text.slice(0, 300),
  );
  check(
    r3.mode === 'town' && r3.level === 1 && r3.gold >= kept.gold && r3.worn === kept.worn,
    'R3: back between runs: level 1, the gold and the gear kept',
    JSON.stringify({ r3: { ...r3, text: undefined }, kept }),
  );
  // G1 (lot 292): the run-end screen drives to the shop: the run's gold flowing into the purse, the best buy, "Visit the shop"
  await page.waitForTimeout(1300);
  const g1 = await page.evaluate(() => {
    const s = document.querySelector('[data-sv-screen="run-end"]');
    const r = (q) => s?.querySelector(q)?.getBoundingClientRect();
    const v = r('[data-sv="visit-shop"]');
    return {
      flow: s?.querySelector('[data-sv="gold-flow"]')?.textContent ?? '',
      purse: Number(s?.querySelector('[data-sv="gold-flow"] [data-sv="purse"]')?.textContent),
      gold: window.__arpg.game().character.gold,
      visit: v ? { w: v.width, h: v.height } : null,
      best: s?.querySelector('[data-sv="best-buy"]')?.textContent ?? null,
    };
  });
  check(
    /^Or\+\d+→bourse\d+$/.test(g1.flow.replace(/\s/g, '')) && g1.purse === g1.gold && g1.visit && g1.visit.h >= 44,
    'G1: the run-end screen: the gold into the purse, "Visit the shop"',
    JSON.stringify(g1),
  );
  // X1 (lot 299, owner: "at the end of a run I have to scroll to reach the buttons"): in the six sizes the three actions are whole in the
  // screen and in the panel without scrolling, each ≥ 44 px; the panel itself never scrolls (only its body, if it still overflows)
  for (const sz of Object.keys(SIZES)) {
    await size(sz);
    const x1 = await page.evaluate(() => {
      const s = document.querySelector('[data-sv-screen="run-end"]');
      const box = s?.querySelector('.sv-end')?.getBoundingClientRect();
      const body = s?.querySelector('[data-sv="end-body"]');
      const btns = ['visit-shop', 'again', 'hub'].map((k) => s?.querySelector(`[data-sv="${k}"]`)?.getBoundingClientRect());
      const vw = innerWidth;
      const vh = innerHeight;
      const inside = (r) => !!r && r.top >= 0 && r.left >= 0 && r.bottom <= vh + 0.5 && r.right <= vw + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
      return {
        ok: btns.every(inside),
        tall: btns.every((r) => r && r.height >= 44 && r.width >= 44),
        sameRow: btns.every((r) => r && Math.abs(r.top - btns[0].top) < 2),
        boxScroll: s?.querySelector('.sv-end') ? s.querySelector('.sv-end').scrollTop : -1,
        bodyOverflow: body ? body.scrollHeight - body.clientHeight : -1,
        btns: btns.map((r) => r && `${Math.round(r.top)}-${Math.round(r.bottom)}`),
        vh,
      };
    });
    check(x1.ok && x1.tall && x1.sameRow && x1.boxScroll === 0, `X1 ${sz}: the run-end screen's actions visible without scrolling`, JSON.stringify(x1));
    await shot(`r3-run-end-${sz}`);
  }
  await size('phone-portrait');
  // R4: the hub of the Run (lot 295: six tabs in three panels): the act, its records, the shop and the run in the bar
  await page.click('[data-sv-screen="run-end"] [data-sv="hub"]');
  await page.waitForTimeout(800);
  const r4 = await page.evaluate(() => {
    const h = document.querySelector('[data-sv="run-hub"]');
    return {
      shown: !!h && h.getBoundingClientRect().height > 0,
      play: h?.querySelector('[data-sv="play"]')?.textContent,
      // lot 305: every act of Normal listed, the closed ones greyed (disabled) with what opens them: the open ones counted
      acts: [...(h?.querySelectorAll('[data-sv="acts"] [data-act]:not([disabled])') ?? [])].map((b) => `${b.dataset.act}:${b.dataset.diff}`),
      locked: [...(h?.querySelectorAll('[data-sv="acts"] [data-act][disabled]') ?? [])].map((b) => `${b.dataset.act}:${b.dataset.diff}`).join(),
      records: h?.querySelector('[data-sv="records"]')?.textContent ?? '',
      tabs: [...(h?.querySelectorAll('[data-sv="tabs"] [data-tab]') ?? [])].map((b) => b.dataset.tab).join(),
      parts: [...(h?.querySelectorAll('.svh-panel') ?? [])].map((p) => p.dataset.part).join(),
      shop: !!h?.querySelector('[data-sv="shop"]'),
      settings: !!h?.querySelector('[data-panel="settings"]'),
      tier: h?.querySelector('[data-sv="tier"]')?.textContent ?? '',
    };
  });
  check(
    r4.shown &&
      /^Lancer la run\s*Acte I — Normal/.test(r4.play ?? '') &&
      r4.acts.join() === '1:0' &&
      r4.locked === '2:0,3:0,4:0,5:0,1:1,1:2' &&
      /1 runs/.test(r4.records) &&
      r4.tabs === 'perso,coffre,skills,craft,cube,merco' &&
      r4.parts === 'equipment,bag,runs' &&
      r4.shop &&
      r4.settings,
    'R4: the Run hub: six tabs, the Character tab’s equipment, bag and runs (the act, its records), the shop and the run in its bar',
    JSON.stringify(r4),
  );
  // H1-H6 (lot 295, the owner's note: a main menu of six tabs in three panels, Diablo II's art): each tab by a real tap, its three
  // panels, every size inside the screen, the touch targets ≥ 44 px; the item sheet by a tap and its actions (wear, the stash, the
  // Cube, the hireling)
  await page.evaluate(() => {
    const a = window.__arpg;
    const g = a.game();
    g.character.gold = Math.max(g.character.gold, 4000);
    g.character.progression.milestones['survivals:rec:level'] = Math.max(18, g.character.progression.milestones['survivals:rec:level'] ?? 0);
    a.giveItem('ring', { forceQuality: 'magic', ilvl: 12 });
    a.giveItem('great_helm', { forceQuality: 'rare', ilvl: 30 });
    a.giveItem('jewel', { forceQuality: 'magic', ilvl: 12 });
    a.giveStack('r01', 3);
    a.giveStack('gem_ruby_4', 1);
  });
  const HUB_PARTS = {
    perso: 'equipment,bag,runs',
    coffre: 'equipment,bag,stash',
    // lot 308: the training's permanent ranks in place of the equipment
    skills: 'forge,stats,trees',
    craft: 'bag,craft,stash',
    cube: 'bag,cube,stash',
    merco: 'merc,bag,stash',
  };
  for (const sz of sizesOf(['phone-portrait', 'phone-landscape', 'fold-folded-portrait', 'fold-folded-landscape', 'fold-open-portrait', 'fold-open-landscape'])) {
    await size(sz);
    const seen = [];
    for (const t of Object.keys(HUB_PARTS)) {
      // a real tap; once more if a redraw of the hub swallowed it
      for (let k = 0; k < 3; k++) {
        await tapOn(`[data-sv="run-hub"] [data-tab="${t}"]`);
        await page.waitForTimeout(250);
        if (await page.evaluate((tt) => document.querySelector('[data-sv="run-hub"]')?.dataset.tab === tt, t)) break;
      }
      const h = await page.evaluate(() => {
        const r = document.querySelector('[data-sv="run-hub"]');
        const ps = [...(r?.querySelectorAll('.svh-panel') ?? [])];
        const boxes = ps.map((p) => p.getBoundingClientRect());
        // lot 299: a button drawn smaller keeps its touch area through a transparent ::before (its overflow counted)
        // (lot 313: a target not drawn in this size, display: none — "Choisir l’acte" in landscape — is no target)
        const targets = [...(r?.querySelectorAll('.svh-tab, .svh-bar .sv-btn') ?? [])]
          .filter((b) => b.getClientRects().length > 0)
          .map((b) => {
            const x = b.getBoundingClientRect();
            const be = getComputedStyle(b, '::before');
            const ext = be.content !== 'none' && be.position === 'absolute' ? Math.max(0, -parseFloat(be.top) || 0) + Math.max(0, -parseFloat(be.bottom) || 0) : 0;
            return { height: x.height + ext, width: x.width, what: `${b.className}|${b.textContent?.slice(0, 20)}` };
          });
        const small = targets.filter((b) => Math.min(b.height, b.width) < 44).map((b) => `${b.what}:${Math.round(b.width)}x${Math.round(b.height)}`);
        return {
          tab: r?.dataset.tab,
          parts: ps.map((p) => p.dataset.part).join(),
          inside: boxes.every((b) => b.left >= -1 && b.right <= innerWidth + 1),
          side: boxes.length === 3 && boxes[0].top === boxes[1].top && boxes[1].top === boxes[2].top,
          minTarget: Math.round(Math.min(...targets.map((b) => Math.min(b.height, b.width)))),
          small,
          d2: getComputedStyle(ps[0]).backgroundImage.includes('url'),
        };
      });
      seen.push(`${t}:${h.tab === t && h.parts === HUB_PARTS[t] && h.inside && h.minTarget >= 44 && h.d2 ? 'ok' : JSON.stringify(h)}`);
      if (sz === 'phone-portrait' || sz === 'phone-landscape' || sz === 'fold-folded-portrait' || sz === 'fold-open-landscape') await shot(`h1-hub-${t}-${sz}`);
    }
    const wide = await page.evaluate(() => {
      const ps = [...document.querySelectorAll('[data-sv="run-hub"] .svh-panel')].map((p) => p.getBoundingClientRect().top);
      return ps.length === 3 && ps[0] === ps[1] && ps[1] === ps[2];
    });
    const wantWide = ALL_SIZES[sz].width > ALL_SIZES[sz].height || ALL_SIZES[sz].width >= 760;
    check(
      seen.every((x) => x.endsWith(':ok')) && wide === wantWide,
      `H1 ${sz}: six tabs, each with its three panels (${wantWide ? 'side by side' : 'stacked'}), inside the screen, Diablo II's stone, targets ≥ 44 px`,
      seen.filter((x) => !x.endsWith(':ok')).join(' ') || `wide ${wide}`,
    );
  }
  await size('phone-portrait');
  // H2: the Character tab: a tap on the bag's Great Helm opens its sheet (tooltip, actions); "Equip" worn at once (level 1, no requirement)
  await tapOn('[data-sv="run-hub"] [data-tab="perso"]');
  await page.waitForTimeout(250);
  await tapOn('[data-sv="run-hub"] [data-grid="bag"] [data-base="great_helm"]');
  await page.waitForTimeout(300);
  const h2a = await page.evaluate(() => ({
    tip: !!document.querySelector('[data-sv="detail"] .tip'),
    acts: [...document.querySelectorAll('[data-sv="detail"] [data-act]')].map((b) => b.dataset.act).join(),
  }));
  await shot('h2-sheet-phone-portrait');
  await tapOn('[data-sv="detail"] [data-act="equip"]');
  await page.waitForTimeout(300);
  const h2 = await page.evaluate(() => window.__arpg.game().character.equipment.head?.base ?? null);
  check(
    h2a.tip && /equip/.test(h2a.acts) && /sell/.test(h2a.acts) && h2 === 'great_helm',
    'H2: a tap on a bag item opens its sheet (tooltip, wear, sell without a merchant); worn at once',
    JSON.stringify({ ...h2a, h2 }),
  );
  // H3: the Stash tab: the ring to the shared stash's page by a tap, back to the bag
  await tapOn('[data-sv="run-hub"] [data-tab="coffre"]');
  await page.waitForTimeout(250);
  await tapOn('[data-sv="run-hub"] [data-grid="bag"] [data-base="ring"]');
  await page.waitForTimeout(250);
  await tapOn('[data-sv="detail"] [data-act="to-stash"]');
  await page.waitForTimeout(300);
  const h3a = await page.evaluate(() => !!document.querySelector('[data-sv="run-hub"] [data-grid="stash"] [data-base="ring"]'));
  await tapOn('[data-sv="run-hub"] [data-grid="stash"] [data-base="ring"]');
  await page.waitForTimeout(250);
  await tapOn('[data-sv="detail"] [data-act="unstash"]');
  await page.waitForTimeout(300);
  const h3b = await page.evaluate(() => !!document.querySelector('[data-sv="run-hub"] [data-grid="bag"] [data-base="ring"]'));
  check(h3a && h3b, 'H3: the Stash tab: an item to the shared stash and back to the bag by taps', JSON.stringify({ h3a, h3b }));
  // H4: the Cube tab: three El runes from the tab into the Cube by taps, transmuted (Diablo II's recipe) into an Eld rune
  await tapOn('[data-sv="run-hub"] [data-tab="cube"]');
  await page.waitForTimeout(250);
  for (let i = 0; i < 3; i++) {
    await tapOn('[data-sv="run-hub"] [data-sv="materials"] [data-mat="r01"]');
    await page.waitForTimeout(200);
  }
  await shot('h4-cube-phone-portrait');
  await tapOn('[data-sv="run-hub"] [data-sv="transmute"] [data-recipe="rune_r01"]');
  await page.waitForTimeout(300);
  const h4 = await page.evaluate(() => ({ r02: window.__arpg.game().character.materials.r02 ?? 0, cube: window.__arpg.game().character.cube.filter(Boolean).length }));
  check(h4.r02 >= 1 && h4.cube === 0, 'H4: the Cube tab: runes put in by taps, transmuted by the Horadric Cube’s recipe', JSON.stringify(h4));
  // H5: the Craft tab: a recipe picked lights the bag's items it takes
  await tapOn('[data-sv="run-hub"] [data-tab="craft"]');
  await page.waitForTimeout(250);
  await tapOn('[data-sv="run-hub"] [data-recipe="craft_blood"]');
  await page.waitForTimeout(300);
  const h5 = await page.evaluate(() => ({
    box: !!document.querySelector('[data-sv="run-hub"] [data-sv="recipe"]'),
    cost: document.querySelector('[data-sv="run-hub"] .svh-cost')?.textContent ?? '',
    make: !!document.querySelector('[data-sv="run-hub"] [data-sv="craft"]'),
  }));
  await shot('h5-craft-phone-portrait');
  check(h5.box && /Rubis parfait : 1 \/ 1/.test(h5.cost) && h5.make, 'H5: the Craft tab: Diablo II’s crafting recipe, its ingredients counted', JSON.stringify(h5));
  // H6: the Mercenary tab: a Rogue hired at the best level reached (the hero is level 1), the Great Helm given (no requirement)
  await tapOn('[data-sv="run-hub"] [data-tab="merco"]');
  await page.waitForTimeout(250);
  await tapOn('[data-sv="run-hub"] [data-merc^="rogue:"]');
  await page.waitForTimeout(400);
  await tapOn('[data-sv="run-hub"] [data-tab="perso"]');
  await page.waitForTimeout(250);
  await tapOn('[data-sv="run-hub"] [data-grid="equipment"] [data-slot="head"]');
  await page.waitForTimeout(250);
  await tapOn('[data-sv="detail"] [data-act="unequip"]');
  await page.waitForTimeout(250);
  await tapOn('[data-sv="run-hub"] [data-tab="merco"]');
  await page.waitForTimeout(250);
  await tapOn('[data-sv="run-hub"] [data-grid="bag"] [data-base="great_helm"]');
  await page.waitForTimeout(250);
  await tapOn('[data-sv="detail"] [data-act="to-merc"]');
  await page.waitForTimeout(300);
  const h6 = await page.evaluate(() => ({
    merc: window.__arpg.game().character.merc?.type ?? null,
    head: window.__arpg.game().character.merc?.equipment.head?.base ?? null,
    level: window.__arpg.game().character.level,
  }));
  await shot('h6-merc-phone-portrait');
  check(
    h6.merc === 'rogue' && h6.head === 'great_helm' && h6.level === 1,
    'H6: the Mercenary tab: a Rogue hired by a tap at the best level reached, a Great Helm given to her (no requirement)',
    JSON.stringify(h6),
  );
  await tapOn('[data-sv="run-hub"] [data-tab="perso"]');
  await page.waitForTimeout(250);
  for (const sz of sizesOf(['phone-portrait', 'phone-landscape', 'fold-folded-portrait', 'fold-open-landscape'])) {
    await size(sz);
    await shot(`r4-run-hub-${sz}`);
  }
  await size('phone-portrait');
  // R5: a new run from the hub: level 1 again, no skill, the gear kept
  const pr = await page.evaluate(() => {
    const b = document.querySelector('[data-sv="run-hub"] [data-sv="play"]').getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.touchscreen.tap(pr.x, pr.y);
  await page.waitForFunction(() => window.__arpg.game().world.zone.id === 'survivals:a1r1', null, { timeout: 60000 }).catch(() => undefined);
  const r5 = await page.evaluate(() => {
    const g = window.__arpg.game();
    return {
      zone: g.world.zone.id,
      level: g.character.level,
      skills: Object.keys(g.character.skills).length,
      worn: Object.keys(g.character.equipment).length,
      runs: g.character.progression.milestones['survivals:runs'],
    };
  });
  check(r5.zone === 'survivals:a1r1' && r5.level === 1 && r5.skills === 0 && r5.worn === kept.worn && r5.runs === 2, 'R5: a new run: level 1, no skill, the gear kept', JSON.stringify(r5));
  // R6: the act's boss killed wins the run and opens Act II
  if (await page.$('[data-sv-screen="cards"]')) {
    await page.waitForTimeout(700);
    await page.click('[data-sv-screen="cards"] .sv-card');
  }
  await page.evaluate(() => {
    const g = window.__arpg.game();
    const m = g.character.progression.milestones;
    // lot 292c: Andariel's lair is the fifth zone of Act I's flow
    m['survivals:run:zone'] = 4;
    g.startRun('survivals:a1r7', 0);
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const g = window.__arpg.game();
    const m = g.character.progression.milestones;
    g.world.godMode = true;
    m['survivals:cp:0:a1r7'] = 1;
    m['survivals:run:cleared'] = 5;
    m['survivals:run:won'] = 1;
    g.world.run.completed = true;
    g.world.run.completeTick = g.world.tick;
  });
  // (the cards a level brings meanwhile answered: the run-end screen comes after them)
  for (let k = 0; k < 60 && !(await page.$('[data-sv-screen="run-end"]')); k++) {
    if (await page.$('[data-sv-screen="cards"]')) await page.click('[data-sv-screen="cards"] .sv-card').catch(() => undefined);
    await page.waitForTimeout(500);
  }
  // lot 305: Nightmare is opened by Baal in Normal (no longer by Andariel, lot 292's shortcut)
  const r6 = await page.evaluate(() => ({
    text: document.querySelector('[data-sv-screen="run-end"]')?.textContent ?? '',
    unlocked: [...document.querySelectorAll('[data-sv-screen="run-end"] [data-sv="unlocked"]')].map((e) => e.textContent).join('|'),
  }));
  check(
    /Victoire : Acte I — Normal/.test(r6.text) && r6.unlocked === 'Acte II — Normal ouvert' && !/Cauchemar ouvert/.test(r6.text) && /Nouveau meilleur temps/.test(r6.text),
    "R6: the act's boss wins the run, Act II opened (Nightmare still closed: Baal opens it, lot 305), a new best time",
    JSON.stringify(r6).slice(0, 300),
  );
  await shot('r6-victory-phone-portrait');
  await page.click('[data-sv-screen="run-end"] [data-sv="hub"]');
  await page.waitForTimeout(800);
  const r6b = await page.evaluate(() => [...document.querySelectorAll('[data-sv="run-hub"] [data-sv="acts"] [data-act]:not([disabled])')].map((b) => `${b.dataset.act}:${b.dataset.diff}`).join());
  check(r6b === '1:0,2:0', 'R6: the hub offers Act I and Act II open, Nightmare greyed (lot 305)', r6b);
  await shot('r6-hub-acts-phone-portrait');
  const l5 = await page.evaluate(() => ({
    sub: [...document.querySelectorAll('[data-sv="run-hub"] .svh-line')].map((e) => e.textContent).find((t) => /repart du niveau/.test(t ?? '')) ?? '',
    reset: document.querySelector('[data-sv="run-hub"] [data-sv="reset"]')?.textContent ?? '',
  }));
  check(
    /^Chaque run repart du niveau 1, sans compétence/.test(l5.sub) && /les niveaux et les compétences se regagnent/.test(l5.reset),
    'L5: the hub tells that each run starts again at level 1 (the rule, not a bug)',
    JSON.stringify(l5),
  );
  // E1-E2 (lot 290, owner's order): no requirement to wear gear in Survivals. At the hub (level 1), a rare Great Helm of item level 70
  // (63 strength required, its affixes' level): its requirements shown, never in red, the cell not greyed, "Equip" open; worn, it counts at once
  const e1 = await page.evaluate(() => {
    const a = window.__arpg;
    const g = a.game();
    const c = g.character;
    delete c.equipment.head;
    g.world.refreshPlayer();
    const it = a.giveItem('great_helm', { forceQuality: 'rare', ilvl: 70 });
    const idx = c.inventory.indexOf(it);
    a.app.openPanel('inventory');
    a.app.panels.sel = { from: 'inv', idx };
    a.app.panels.refresh();
    return { idx, level: c.level, str: c.base.str, def: g.world.player.d.defense };
  });
  await page.waitForTimeout(500);
  const e1b = await page.evaluate((idx) => {
    const panel = document.querySelector('.panel');
    const cell = panel?.querySelector(`[data-inv="${idx}"]`);
    return {
      text: panel?.textContent ?? '',
      bad: [...(panel?.querySelectorAll('.req.bad') ?? [])].map((x) => x.textContent),
      cellBad: !!cell?.classList.contains('bad'),
      equip: [...(panel?.querySelectorAll('button') ?? [])].some((b) => /Équiper/.test(b.textContent ?? '') && !b.disabled && !b.classList.contains('off')),
    };
  }, e1.idx);
  check(
    e1.level === 1 && /Force requis\(e\) : 63/.test(e1b.text) && e1b.bad.length === 0 && !e1b.cellBad && /Aucun prérequis dans ce mode/.test(e1b.text) && e1b.equip,
    'E1: a level-1 hero sees a Great Helm (63 strength) with no red requirement, no grey cell, "Equip" open',
    JSON.stringify({ ...e1b, text: e1b.text.slice(0, 200) }),
  );
  await shot('e1-heavy-helm-tooltip-phone-portrait');
  const e2 = await page.evaluate((idx) => {
    const g = window.__arpg.game();
    const r = g.equip(idx);
    g.world.refreshPlayer();
    const c = g.character;
    window.__arpg.app.panels.refresh();
    return { ok: r.ok, head: c.equipment.head?.base, def: g.world.player.d.defense, level: c.level };
  }, e1.idx);
  check(e2.ok && e2.head === 'great_helm' && e2.level === 1 && e2.def > e1.def + 20, 'E2: worn at level 1, active at once (its defense counted)', JSON.stringify({ e1, e2 }));
  await page.waitForTimeout(400);
  await shot('e2-heavy-helm-worn-phone-portrait');
  await page.evaluate(() => window.__arpg.app.openPanel('close'));
  await shopChecks();
  check(errs.length === 0, '0 console error', errs.join(' | '));
} finally {
  await browser.close();
}
writeFileSync(join(SHOTS, 'perf.json'), JSON.stringify(report, null, 1));
console.log(fails ? `${fails} échec(s)` : 'OK');
process.exit(fails ? 1 : 0);
