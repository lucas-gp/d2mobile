/**
 * Barre d'invocations du HUD avec une Nécromancienne : squelettes, golems, ressuscités ; captures tactile 740x360 et PC 1280x720.
 *   PLAYWRIGHT_BROWSERS_PATH=... node tools/e2e/summon-bar.mjs [--url=http://127.0.0.1:5233/]
 * Captures : test-results/e2e/summon-bar/*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = join(process.cwd(), 'test-results', 'e2e', 'summon-bar');
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'OK ' : 'KO '} ${msg}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

for (const [name, opts] of [
  ['tactile', { viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true }],
  ['pc', { viewport: { width: 1280, height: 720 } }],
]) {
  const ctx = await browser.newContext({ ...opts, locale: 'fr-FR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('d2m.lang', 'fr');
  });
  await page.goto(`${URL}?class=necromancer`);
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 120000 });
  await page.evaluate(() => {
    const a = window.__arpg;
    a.setLevel(40, true);
    a.learnAll(8);
    a.god(true);
    a.startRun('tristram', 0, 7);
  });
  await page.waitForFunction(() => window.__arpg.state().zone === 'tristram' && !document.querySelector('.loading:not(.hidden)'), null, { timeout: 90000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Compris/i.test(b.textContent.trim()))?.click());
  if (name === 'pc') await page.mouse.move(600, 300);
  const shown0 = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=summons]')).display);
  check(shown0 === 'none', `${name} : barre masquée sans invocation`);
  await page.evaluate(() => {
    const a = window.__arpg;
    const w = a.game().world;
    const cast = (skill) => {
      w.player.mana = w.player.manaMax;
      w.input.cast = { skill, tx: w.player.x + 2, ty: w.player.y, targetId: 0 };
      a.step(30);
    };
    if (w.monsters.filter((m) => !m.pet && !m.dead).length < 8) {
      w.spawnGroup(0);
      w.spawnGroup(0);
    }
    const dead = w.monsters.filter((m) => !m.pet && !m.dead);
    // cadavres frais près du joueur
    for (const m of dead.slice(0, 8)) {
      m.x = w.player.x + 3;
      m.y = w.player.y + 1;
      m.dead = true;
      m.hp = 0;
      m.deathTick = w.tick;
    }
    for (let i = 0; i < 4; i++) cast('raise_skeleton');
    for (let i = 0; i < 2; i++) cast('raise_skeleton_archer');
    cast('clay_golem');
    cast('blood_golem');
  });
  await page.waitForTimeout(1500);
  const chips = await page.evaluate(() => [...document.querySelectorAll('.sumchip')].map((c) => `${c.dataset.testid}=${c.querySelector('.n').textContent} [${c.title}]`));
  console.log(name, JSON.stringify(chips));
  check(chips.length >= 3 && chips.some((c) => c.includes('raise_skeleton')), `${name} : pastilles par type affichées`);
  // aucune superposition avec les autres éléments du HUD
  const overlaps = await page.evaluate(() => {
    const r = document.querySelector('[data-testid=summons]').getBoundingClientRect();
    const hit = [];
    for (const sel of ['.minimap', '.joy-zone .joy-base', '.sbtn', '.tbtn', '.pcbar', '.pcorb', '.target']) {
      for (const e of document.querySelectorAll(sel)) {
        const b = e.getBoundingClientRect();
        if (b.width && b.height && getComputedStyle(e).display !== 'none' && b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top) hit.push(sel);
      }
    }
    return { rect: [r.left, r.top, r.right, r.bottom].map(Math.round), hit };
  });
  console.log(name, JSON.stringify(overlaps));
  check(overlaps.hit.length === 0, `${name} : pas de chevauchement`);
  await page.click('.sumchip');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  await page.evaluate(() => {
    const w = window.__arpg.game().world;
    for (const m of w.monsters) if (m.pet && m.pet !== 'merc') w.killMonster(m, null);
  });
  await page.waitForTimeout(1200);
  const shown1 = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=summons]')).display);
  check(shown1 === 'none', `${name} : barre masquée quand tout est mort`);
  check(errors.length === 0, `${name} : aucune erreur JS ${errors.slice(0, 2).join('|')}`);
  await ctx.close();
}
await browser.close();
process.exit(fails ? 1 : 0);
