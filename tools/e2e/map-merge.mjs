/**
 * Coffre › Cartes › bloc « Fusionner » : 14 cartes T1 + 3 orbes du cartographe → fusion en lot ; boutons visibles sans défiler.
 *   PLAYWRIGHT_BROWSERS_PATH=... node tools/e2e/map-merge.mjs [--url=http://127.0.0.1:5233/]
 * Captures : test-results/e2e/map-merge/*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = join(process.cwd(), 'test-results', 'e2e', 'map-merge');
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [w, h, mobile] of [
  [900, 800, false],
  [740, 360, true],
  [1920, 1080, false],
]) {
  const tag = `${w}x${h}`;
  const page = await (await b.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('d2m.lang', 'fr');
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  await page.goto(URL + '?testchar=1');
  await page.waitForSelector('.charselect.d2s', { timeout: 90000 });
  await pickFirstMode(page);
  await page.waitForSelector('.d2plate');
  await page.click('.d2plate:has-text("99")');
  await page.click('.d2b.ok');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 180000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const g = window.__arpg.game();
    const c = g.character;
    c.inventory = c.inventory.map(() => null);
    c.materials.orb_cartographer = 3;
    g.settings.confirmMapUpgrade = true;
    c.mapStash = [];
    for (let i = 0; i < 14; i++) {
      const m = window.__arpg.giveMap(1, 'normal');
      c.inventory[c.inventory.indexOf(m)] = null;
      c.mapStash.push(m);
    }
    window.__arpg.giveMap(1, 'normal');
    window.__arpg.app.openPanel('stash');
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => [...document.querySelectorAll('.panel .btn')].find((x) => x.textContent.trim().startsWith('Cartes ('))?.click());
  await page.waitForTimeout(400);
  const inZone = (sel) =>
    page.evaluate((s) => {
      const n = document.querySelector(s);
      if (!n) return 'absent';
      const r = n.getBoundingClientRect();
      const body = document.querySelector('.panel .body').getBoundingClientRect();
      return r.top >= body.top - 1 && r.bottom <= body.bottom + 1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1
        ? 'ok'
        : `hors zone y ${Math.round(r.top)}-${Math.round(r.bottom)} / ${Math.round(body.top)}-${Math.round(body.bottom)}`;
    }, sel);
  await page.screenshot({ path: join(OUT, `${tag}-1-bloc.png`) });
  for (const s of ['[data-act="merge-t1"]', '[data-act="merge-q"]', '[data-act="merge-up"]', '[data-act="merge-up-all"]', '[data-act="merge-same"]', '[data-act="merge-bag"]']) {
    const r = await inZone(s);
    check(r === 'ok', `${tag} : ${s} visible sans défiler`, r);
  }
  // ranger la carte du sac
  await page.click('[data-act="merge-bag"]');
  await page.waitForTimeout(250);
  check(await page.evaluate(() => window.__arpg.game().character.mapStash.length === 15), `${tag} : carte du sac rangée (15 au coffre)`);
  await page.click('[data-act="merge-up-all"]');
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, `${tag}-2-confirmation.png`) });
  check((await inZone('[data-act="merge-ok"]')) === 'ok', `${tag} : « Confirmer » visible`, await inZone('[data-act="merge-ok"]'));
  const txt = await page.textContent('.mergeblock');
  check(/Fusionner 9 cartes T1 en 3 cartes T2/.test(txt) && /3 orbes/.test(txt), `${tag} : texte de confirmation`, txt.slice(0, 160));
  await page.click('[data-act="merge-ok"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${tag}-3-apres.png`) });
  const st = await page.evaluate(() => {
    const c = window.__arpg.game().character;
    return { t1: c.mapStash.filter((m) => m.map.tier === 1).length, t2: c.mapStash.filter((m) => m.map.tier === 2).length, orbs: c.materials.orb_cartographer ?? 0 };
  });
  check(st.t2 === 3 && st.t1 === 6 && st.orbs === 0, `${tag} : 3 cartes T2, 6 T1 restantes, orbes épuisés`, JSON.stringify(st));
  check(
    (await page.textContent('.mergeblock')).includes('Aucun orbe') && (await page.getAttribute('[data-act="merge-up-all"]', 'title')) !== null,
    `${tag} : bouton grisé, raison « Aucun orbe » affichée`,
  );
  // compression gratuite
  await page.click('[data-act="merge-same"]');
  await page.waitForTimeout(200);
  await page.click('[data-act="merge-ok"]');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => window.__arpg.game().character.mapStash.filter((m) => m.map.tier === 1).length === 2), `${tag} : 3 → 1 même palier gratuit (6 → 2 T1)`);
  check(errors.length === 0, `${tag} : aucune erreur de page`, errors.join(' | '));
  await page.context().close();
}
await b.close();
process.exit(fails ? 1 : 0);
