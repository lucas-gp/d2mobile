/**
 * Bouton « Corrompre » de l'objet : visible sans défiler, confirmation, corruption, réglage « sans confirmation ».
 *   node tools/e2e/corrupt-bouton.mjs [--url=http://127.0.0.1:5233/]
 * Captures : test-results/e2e/corrupt/*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = join(process.cwd(), 'test-results', 'e2e', 'corrupt');
mkdirSync(OUT, { recursive: true });
const DEVS = { 'android-petit': [740, 360, true], pc: [1920, 1080, false] };
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [name, [width, height, mobile]] of Object.entries(DEVS)) {
  if (args.get('dev') && name !== args.get('dev')) continue;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: 'fr-FR' });
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
  await page.evaluate(() => {
    window.__arpg.setLevel(40);
    window.__arpg.town();
  });
  await ready();
  await page.evaluate(() => {
    const g = window.__arpg.game();
    g.character.materials.worldstone_shard = 3;
    g.settings.confirmCorrupt = true;
    window.__arpg.giveItem('ring', { forceQuality: 'rare', ilvl: 60 });
    window.__arpg.giveItem('ring', { forceQuality: 'rare', ilvl: 60 });
    window.__arpg.app.panels.show('inventory');
  });
  await page.waitForTimeout(300);
  const select = (n) =>
    page.evaluate((n) => {
      const c = window.__arpg.game().character;
      const idx = c.inventory.map((x, i) => (x?.base === 'ring' ? i : -1)).filter((i) => i >= 0)[n];
      window.__arpg.app.panels.sel = { from: 'inv', idx };
      window.__arpg.app.panels.refresh();
      return idx;
    }, n);
  const inView = (sel) =>
    page.evaluate((s) => {
      const b = document.querySelector(s);
      if (!b) return 'absent';
      const r = b.getBoundingClientRect();
      const body = document.querySelector('.panel .body').getBoundingClientRect();
      return r.top >= body.top - 1 && r.bottom <= body.bottom + 1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1
        ? 'ok'
        : `hors zone y ${Math.round(r.top)}-${Math.round(r.bottom)} / ${Math.round(body.top)}-${Math.round(body.bottom)}`;
    }, sel);
  const idx = await select(0);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, `${name}-bouton.png`) });
  // « Corrompre » a sa place fixe dans la colonne d'actions (plus de menu à déplier)
  const openCraft = async () => {
    await page.waitForTimeout(120);
  };
  check((await inView('[data-act="craft-menu"]')) === 'ok', `${name} : bouton « Artisanat » visible sans défiler`, await inView('[data-act="craft-menu"]'));
  await openCraft();
  await page.screenshot({ path: join(OUT, `${name}-menu.png`) });
  check((await inView('[data-act="corrupt"]')) === 'ok', `${name} : bouton « Corrompre » visible sans défiler`, await inView('[data-act="corrupt"]'));
  await page.click('[data-act="corrupt"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, `${name}-confirmation.png`) });
  check((await inView('[data-act="corrupt-ok"]')) === 'ok', `${name} : « Confirmer » visible sans défiler`, await inView('[data-act="corrupt-ok"]'));
  check(await page.evaluate((i) => !window.__arpg.game().character.inventory[i].corrupted, idx), `${name} : pas encore corrompu avant confirmation`);
  await page.click('[data-act="corrupt-ok"]');
  await page.waitForTimeout(300);
  const st = await page.evaluate((i) => ({ c: !!window.__arpg.game().character.inventory[i].corrupted, s: window.__arpg.game().character.materials.worldstone_shard }), idx);
  check(st.c && st.s === 2, `${name} : corrompu après confirmation, 1 éclat consommé`, JSON.stringify(st));
  await page.screenshot({ path: join(OUT, `${name}-apres.png`) });
  await openCraft();
  check((await page.getAttribute('[data-act="corrupt"]', 'title')).includes('Déjà corrompu'), `${name} : bouton grisé, raison « Déjà corrompu » en infobulle`);
  // sans confirmation : un seul geste
  const idx2 = await select(1);
  await page.evaluate(() => {
    window.__arpg.game().settings.confirmCorrupt = false;
    window.__arpg.app.panels.refresh();
  });
  await page.waitForTimeout(150);
  await openCraft();
  await page.click('[data-act="corrupt"]');
  await page.waitForTimeout(300);
  check(
    await page.evaluate((i) => !!window.__arpg.game().character.inventory[i].corrupted && window.__arpg.game().character.materials.worldstone_shard === 1, idx2),
    `${name} : réglage sans confirmation : un clic suffit`,
  );
  check(errors.length === 0, `${name} : aucune erreur de page`, errors.join(' | '));
  await ctx.close();
}
await browser.close();
process.exit(fails ? 1 : 0);
