/**
 * (Mercenaire d'essai équipé via le module testchar : les navigateurs pilotés sautent l'écran de sélection.)
 * Aura du mercenaire (Infini : Conviction) : animation D2 sous lui, halo sur les monstres à portée, onglet Mercenaire.
 *   PLAYWRIGHT_BROWSERS_PATH=... node tools/e2e/merc-aura.mjs [--url=http://127.0.0.1:5233/]
 * Captures : test-results/e2e/merc-aura/*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = join(process.cwd(), 'test-results', 'e2e', 'merc-aura');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('d2m.lang', 'fr');
});
await page.goto(URL);
const ready = () => page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 120000 });
await ready();
await page.evaluate(async () => {
  window.__arpg.setLevel(99);
  const { equipTestMerc } = await import('/src/sim/testchar.ts');
  window.__arpg.game().character.gold = 1e7;
  equipTestMerc(window.__arpg.game());
});
await page.evaluate(() => {
  window.__arpg.god(true);
  window.__arpg.startRun('tristram', 0, 3);
});
await ready();
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const w = window.__arpg.game().world;
  const merc = w.monsters.find((m) => m.pet === 'merc');
  const hostile = w.monsters.filter((m) => !m.pet && !m.dead).slice(0, 5);
  hostile.forEach((m, i) => {
    m.x = merc.x + 2.5 + (i % 3) * 1.1;
    m.y = merc.y - 1.5 + i * 0.8;
    m.aiOff = true;
  });
  return { merc: !!merc, n: hostile.length, buffs: w.player.buffs.map((b) => b.id) };
});
console.log(JSON.stringify(info));
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Compris/i.test(b.textContent.trim()))?.click());
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const w = window.__arpg.game().world;
    const merc = w.monsters.find((m) => m.pet === 'merc');
    w.monsters
      .filter((m) => !m.pet && !m.dead)
      .slice(0, 5)
      .forEach((m, k) => {
        m.x = merc.x + 2.5 + (k % 3) * 1.1;
        m.y = merc.y - 1.5 + k * 0.8;
        m.hp = m.hpMax;
      });
    window.__arpg.teleport(merc.x - 2, merc.y + 1);
  });
  await page.screenshot({ path: join(OUT, `zone${i}.png`) });
}
console.log(
  'mercFx :',
  await page.evaluate(() => {
    const a = window.__arpg.app;
    const r = a.renderer ?? a.view ?? Object.values(a).find((v) => v && v.mercFx);
    return r?.mercFx ? [...r.mercFx.keys()].join(',') : 'inaccessible';
  }),
);
await page.evaluate(() => window.__arpg.app.panels.show('merc'));
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, 'onglet.png') });
console.log(await page.evaluate(() => document.querySelector('.mercauras')?.textContent ?? 'absent'));
console.log('erreurs :', errors.length ? errors.join(' | ') : 'aucune');
await browser.close();
