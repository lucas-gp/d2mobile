/**
 * Lot 300, the owner's returns on the Run (Survivals, Act I), in a browser on a phone in portrait (the dev server, the mode built in):
 *   L1. the loot of the Blood Moor's first 70 s (god mode, the game at 6×): a few items on the fodder, the gold in few larger piles;
 *   B1. the zone's mini-boss killed: its loot on the ground (at least two items), the countdown "Zone terminée" with its figure (10 s);
 *   B2. a tap on the countdown: the next zone (the Cold Plains) at once, its species known (Blood Raven's sheet prepared with the zone);
 *   N1. rule `game.nextZone` in the Cold Plains: the Stony Field, its species (Rakanishu's Fallen);
 *   I1. an item walked over during the run: in the bag at once, the pause tells the run's loot, its "Inventaire" shows it;
 *   0 page error.
 *   D2_SPRITES=0 D2_PUBLIC=1 D2_ALLOW_SKIP=1 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/survivals-300.mjs [--url=http://127.0.0.1:5233/] [--shots=<dir>]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? 'http://127.0.0.1:5233/';
const SHOTS = args.get('shots') ?? '/tmp/survivals-300';
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
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

await page.goto(URL);
await home();
await pickMode(page, 'd2+survivals', { timeout: 10000 }).catch(() => undefined);
await page.waitForSelector('.charselect input[type="text"], .d2input', { timeout: 120000 });
const d2ui = !!(await page.$('.d2input'));
await page.fill(d2ui ? '.d2input' : '.charselect input[type="text"]', 'Lot300');
await page.click(d2ui ? '.d2b.ok' : '.charselect .btn.primary.big');
await inRun();

// L1, B1: the Blood Moor in god mode at 6× (cards automatic) until its mini-boss falls, the drops counted by the monster's rank
const l1 = await page.evaluate(async () => {
  const H = window.__arpg;
  const g = H.game();
  g.settings.mods = { ...(g.settings.mods ?? {}), survivals: { ...(g.settings.mods?.survivals ?? {}), cards: 'auto', control: 'auto' } };
  const out = { fodder: 0, piles: 0, gold: 0, mostPiles: 0, kills: 0, sec: 0, bossItems: 0 };
  const seen = new Set();
  H.speed(6);
  await new Promise((r) => {
    const iv = setInterval(() => {
      const w = g.world;
      w.godMode = true;
      for (const b of document.querySelectorAll('.mod-screen .sv-card')) b.click();
      // lot 301: the mini-boss comes from beyond the screen, the spells slower: weakened once it is in sight (the subject is its loot)
      for (const m of w.monsters) if (m.runBoss && !m.dead && Math.hypot(m.x - w.player.x, m.y - w.player.y) < 22) m.hp = Math.min(m.hp, 1);
      let piles = 0;
      for (const gi of w.items) {
        const gold = gi.item.base === 'gold';
        if (gold) piles++;
        if (seen.has(gi.id)) continue;
        seen.add(gi.id);
        if (gold) out.gold += gi.item.qty ?? 0;
        else out.fodder++;
      }
      out.mostPiles = Math.max(out.mostPiles, piles);
      if (w.run?.completed || g.runDef?.id !== 'survivals:a1r1' || w.tick > 100 * 25) {
        clearInterval(iv);
        r();
      }
    }, 50);
  });
  H.speed(1);
  const w = g.world;
  out.kills = w.stats.kills;
  out.sec = Math.round(w.tick / 25);
  out.bossItems = w.items.filter((gi) => gi.item.base !== 'gold' && gi.dropTick >= w.run.completeTick - 2).length;
  out.completed = !!w.run?.completed;
  return out;
});
check(l1.completed, 'B1: the Blood Moor’s mini-boss killed (god mode, 6×)', `${l1.sec} s, ${l1.kills} kills`);
check(l1.mostPiles <= 4, 'L1: the gold in few larger piles', `${l1.gold} gold dropped, at most ${l1.mostPiles} piles at once`);
const wait = await page.waitForSelector('[data-sv="zone-wait"]', { state: 'visible', timeout: 10000 }).catch(() => null);
const waitText = wait ? await wait.textContent() : '';
const waitNum = Number(await page.textContent('.sv-wait-n').catch(() => '0'));
check(!!wait && /Zone terminée/.test(waitText) && waitNum >= 7 && waitNum <= 10, 'B1: the countdown after the mini-boss (10 s)', `${waitText.replace(/\s+/g, ' ')} (${waitNum})`);
check(l1.bossItems >= 2, 'B1: the mini-boss’s loot on the ground', `${l1.bossItems} items by its body`);
const box = wait ? await wait.boundingBox() : null;
check(!!box && box.height >= 44, 'B1: the countdown is a touch target ≥ 44 px', box ? `${Math.round(box.width)} × ${Math.round(box.height)}` : '');
await shot('b1-boss-loot-countdown');

// B2: a tap on the countdown, the Cold Plains at once
const t0 = Date.now();
if (wait) await wait.tap();
await page.waitForFunction(() => window.__arpg.game().runDef?.id === 'survivals:a1r2', null, { timeout: 20000 }).catch(() => undefined);
await inRun();
const b2 = await page.evaluate(() => ({ id: window.__arpg.game().runDef?.id, pool: window.__arpg.game().world.zone.monsterPool ?? [] }));
check(b2.id === 'survivals:a1r2' && Date.now() - t0 < 9000, 'B2: a tap goes on to the next zone at once', `${b2.id} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
check(b2.pool.includes('blood_raven'), 'B2: the Cold Plains know Blood Raven before she comes (her sheet prepared with the zone)', b2.pool.join(','));
await page.waitForTimeout(800);
await shot('b2-next-zone');

// N1: the next zone named (rule `game.nextZone`)
const n1 = await page.evaluate(async () => {
  const R = await import('/src/mods/rules.ts');
  const z = R.RULES['game.nextZone'](window.__arpg.game());
  return { name: z?.name ?? null, pool: z?.monsterPool ?? [] };
});
check(!!n1.name && n1.pool.length > 0, 'N1: the run names its next zone with its species (prepared during this one)', `${n1.name}: ${n1.pool.length} species`);

// I1: an item walked over goes to the bag; the pause tells it, its "Inventaire" shows it
const i1 = await page.evaluate(async () => {
  const L = await import('/mods/survivals/sim/loot.ts');
  const SDK = await import('/src/mods/sdk.ts');
  const g = window.__arpg.game();
  const it = SDK.generateItem(new SDK.Rng('e2e300'), 'ring', 10, { forceQuality: 'rare' });
  // a better ring is worn at once: a far better one worn on both hands, so that this one is kept
  const before = g.character.inventory.filter(Boolean).length;
  g.character.equipment.ring1 = SDK.generateItem(new SDK.Rng('w1'), 'ring', 40, { forceQuality: 'unique' });
  g.character.equipment.ring2 = SDK.generateItem(new SDK.Rng('w2'), 'ring', 40, { forceQuality: 'unique' });
  const done = L.takeItem(g, it);
  return { done, inBag: g.character.inventory.includes(it), before, after: g.character.inventory.filter(Boolean).length };
});
check(i1.inBag, 'I1: an item picked up during the run is in the bag at once', JSON.stringify(i1));
await page.click('[data-sv="pause"]');
await page.waitForSelector('[data-sv-screen="pause"]', { timeout: 5000 });
const note = await page.textContent('[data-sv="run-loot"]').catch(() => '');
check(/Butin de la run : \d+ objet/.test(note ?? ''), 'I1: the pause tells the run’s loot', note ?? '');
await shot('i1-pause-run-loot');
await page.click('[data-sv="inventory"]');
await page.waitForTimeout(800);
const cells = await page.evaluate(() => document.querySelectorAll('[data-inv]').length);
check(cells >= i1.after, 'I1: the inventory opened from the pause shows the run’s items', `${cells} items drawn, ${i1.after} in the bag`);
await shot('i1-inventory');

check(errs.length === 0, '0 page error', errs.join(' | '));
await browser.close();
console.log(fails ? `${fails} failure(s)` : 'all passed');
process.exit(fails ? 1 : 0);
