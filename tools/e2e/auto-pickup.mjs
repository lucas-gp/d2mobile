/** Ramassage automatique : rune El, gemme et potion posées près du joueur, ramassées sans appui. node tools/e2e/auto-pickup.mjs [--url=...] */
import { chromium } from 'playwright-core';
import { pickFirstMode } from './pick-mode.mjs';
const URL = (process.argv.find((a) => a.startsWith('--url=')) ?? `--url=${process.env.E2E_URL ?? 'http://127.0.0.1:5233/'}`).slice(6);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })).newPage();
let errs = 0;
page.on('pageerror', (e) => {
  errs++;
  console.log('ERR', e.message);
});
await page.addInitScript(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
});
await page.goto(URL + '?testchar=1');
await page.waitForSelector('.charselect.d2s', { timeout: 90000 });
await pickFirstMode(page);
await page.waitForSelector('.d2plate');
await page.click('.d2plate:has-text("99")');
await page.click('.d2b.ok');
await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 180000 });
await page.waitForTimeout(1000);
const r = await page.evaluate(async () => {
  const a = window.__arpg;
  const g = a.game();
  g.startRun('tristram', 0);
  await new Promise((r) => setTimeout(r, 500));
  const w = g.world,
    c = g.character,
    s = g.settings;
  const cfg = [s.autoPickupRunes, s.autoPickupGems, s.autoPickupPotions, s.beltRefill];
  const mk = (base) => ({ uid: 'e' + Math.random(), base, quality: 'normal', ilvl: 1, sockets: 0, qty: 1, affixes: [], ethereal: false });
  const heal = c.belt.find((x) => x.kind === 'heal');
  heal.qty = 0;
  const before = { r01: c.materials.r01 ?? 0, gem: c.materials.gem_ruby_0 ?? 0, heal: heal.qty };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const [base, dx] of [
    ['r01', 1.2],
    ['gem_ruby_0', 1.5],
    ['hp_potion', 1.8],
    ['r21', 1.4],
  ]) {
    if (typeof w.dropItem === 'function') w.dropItem(mk(base), w.player.x + dx, w.player.y);
  }
  await wait(2500);
  return { cfg, before, after: { r01: c.materials.r01 ?? 0, gem: c.materials.gem_ruby_0 ?? 0, heal: heal.qty }, left: w.items.map((i) => i.item.base) };
});
console.log(JSON.stringify(r));
await page.screenshot({ path: 'tmp/auto-pickup.png' });
const ok = r.after.r01 === r.before.r01 + 1 && r.after.gem === r.before.gem + 1 && r.after.heal === 1 && r.left.join() === 'r21' && !errs;
console.log(ok ? 'OK' : 'ECHEC');
await b.close();
process.exit(ok ? 0 : 1);
