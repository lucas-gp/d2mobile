/**
 * Actions principales visibles sans défiler (grandes cases activées) : bouton « Ressusciter » chez
 * Qual-Kehk avec un mercenaire mort ; « Équiper », « Artisanat » et « Jeter » (colonne d'actions) d'un objet sélectionné.
 *   node tools/e2e/actions-visibles.mjs [--url=http://127.0.0.1:5233/]
 * Captures : test-results/e2e/actions/*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = join(process.cwd(), 'test-results', 'e2e', 'actions');
mkdirSync(OUT, { recursive: true });
const DEVS = { 'android-petit': [740, 360], iphone: [844, 390] };
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [name, [width, height]] of Object.entries(DEVS)) {
  if (args.get('dev') && name !== args.get('dev')) continue;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
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
    window.__arpg.setLevel(20);
    const g = window.__arpg.game();
    g.character.gold = 500000;
    g.settings.bigCells = true;
    window.__arpg.town();
  });
  await ready();
  // la zone visible d'un bouton : dans la fenêtre ET dans le cadre défilant du panneau
  const visible = (text) =>
    page.evaluate((t) => {
      const b = [...document.querySelectorAll('.panel button')].find((x) => x.textContent.startsWith(t));
      if (!b) return 'absent';
      const r = b.getBoundingClientRect();
      const body = document.querySelector('.panel .body').getBoundingClientRect();
      const ok = r.top >= body.top - 1 && r.bottom <= body.bottom + 1 && r.bottom <= innerHeight + 1 && r.width > 0 && r.left >= body.left - 1 && r.right <= Math.min(body.right, innerWidth) + 1;
      return ok
        ? 'ok'
        : `hors zone (x ${Math.round(r.left)}-${Math.round(r.right)} / ${Math.round(body.right)}; y ${Math.round(r.top)}-${Math.round(r.bottom)} / ${Math.round(body.top)}-${Math.round(body.bottom)})`;
    }, text);
  // 1. ressusciteur
  await page.evaluate(() => {
    const g = window.__arpg.game();
    const w = g.world;
    const o = w.objects.find((x) => x.ref === 'qual_kehk');
    window.__arpg.teleport(o.x - 1.2, o.y);
    w.input.interact = o.id;
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Merc/i.test(b.textContent.trim()))?.click());
  await page.waitForSelector('.panel .runcard', { timeout: 10000 }).catch(async () => {
    await page.screenshot({ path: join(OUT, 'dbg.png') });
    throw new Error('no panel');
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => [...document.querySelectorAll('.panel .runcard button')].find((b) => !b.disabled)?.click());
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const g = window.__arpg.game();
    g.character.merc.dead = true;
    window.__arpg.app.panels.refresh();
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${name}-ressusciter.png`) });
  check((await visible('Ressusciter')) === 'ok', `${name} : « Ressusciter » visible sans défiler`, await visible('Ressusciter'));
  // 2. objet : Équiper / Jeter
  await page.evaluate(() => {
    window.__arpg.game().character.merc.dead = false;
    window.__arpg.giveItem('short_sword', { forceQuality: 'magic', ilvl: 20 });
    document.querySelector('.panel .close')?.click();
    window.__arpg.app.panels.show('inventory');
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const c = window.__arpg.game().character;
    const idx = c.inventory.findIndex((x) => x?.base === 'short_sword');
    const cell = [...document.querySelectorAll('.panel .grid .cell')].find((x) => x.classList.contains('item') || x.querySelector('canvas,img,.glyph')) ?? null;
    window.__arpg.app.panels.sel = { from: 'inv', idx };
    window.__arpg.app.panels.refresh();
    void cell;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${name}-objet.png`) });
  // colonne d'actions fixe : Équiper, Artisanat… et Jeter sont toujours là, sans menu à déplier
  for (const t of ['Équiper', 'Artisanat', 'Jeter']) check((await visible(t)) === 'ok', `${name} : « ${t} » visible sans défiler`, await visible(t));
  check(errors.length === 0, `${name} : aucune erreur de page`, errors.join(' | '));
  await ctx.close();
}
await browser.close();
process.exit(fails ? 1 : 0);
