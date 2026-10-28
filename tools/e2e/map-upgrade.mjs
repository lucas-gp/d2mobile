/**
 * Menu « Améliorer » d'une carte : sac (normale → magique → rare → corrompre) et onglet Cartes du coffre.
 *   node tools/e2e/map-upgrade.mjs [--url=http://127.0.0.1:5233/]
 * Captures : test-results/e2e/map-upgrade/*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = join(process.cwd(), 'test-results', 'e2e', 'map-upgrade');
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
    for (const k of ['orb_arcane', 'orb_angelic', 'orb_destruction', 'worldstone_shard']) g.character.materials[k] = 2;
    g.settings.confirmCorrupt = true;
    g.settings.confirmMapUpgrade = true;
    window.__arpg.giveMap(1, 'normal');
    window.__arpg.giveMap(1, 'normal');
    window.__arpg.app.panels.show('inventory');
  });
  await page.waitForTimeout(300);
  const mapIdx = (n) =>
    page.evaluate(
      (n) =>
        window.__arpg
          .game()
          .character.inventory.map((x, i) => (x?.map ? i : -1))
          .filter((i) => i >= 0)[n],
      n,
    );
  const st = (i) => page.evaluate((i) => ({ q: window.__arpg.game().character.inventory[i].quality, c: !!window.__arpg.game().character.inventory[i].corrupted }), i);
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
  const idx = await mapIdx(0);
  await page.evaluate((i) => {
    window.__arpg.app.panels.sel = { from: 'inv', idx: i };
    window.__arpg.app.panels.refresh();
  }, idx);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, `${name}-1-bouton.png`) });
  check((await inView('[data-act="map-upgrade"]')) === 'ok', `${name} : bouton « Améliorer » visible sans défiler`, await inView('[data-act="map-upgrade"]'));
  await page.click('[data-act="map-upgrade"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, `${name}-2-liste.png`) });
  const sc = await page.evaluate(() => {
    const l = document.querySelector('.mapmenu');
    return l ? { sh: l.scrollHeight, ch: l.clientHeight, ov: getComputedStyle(l).overflowY } : null;
  });
  check(!!sc && sc.ov !== 'visible', `${name} : liste dépliée dans un conteneur défilant`, JSON.stringify(sc));
  check((await page.textContent('[data-act="mapop-zakarum"]')).includes('Aucun orbe'), `${name} : orbe de Zakarum grisé « Aucun orbe »`);
  check((await page.textContent('[data-act="mapop-angelic"]')).includes('Carte magique'), `${name} : angélique grisé (carte magique requise)`);
  await page.click('[data-act="mapop-arcane"]');
  await page.waitForTimeout(250);
  check((await st(idx)).q === 'magic', `${name} : normale → magique`);
  await page.screenshot({ path: join(OUT, `${name}-3-magique.png`) });
  await page.click('[data-act="mapop-angelic"]');
  await page.waitForTimeout(250);
  check((await st(idx)).q === 'rare', `${name} : magique → rare, carte toujours sélectionnée`);
  await page.click('[data-act="mapop-corrupt"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, `${name}-4-confirmation.png`) });
  check((await inView('[data-act="mapop-ok"]')) === 'ok', `${name} : « Confirmer » visible`, await inView('[data-act="mapop-ok"]'));
  check(!(await st(idx)).c, `${name} : pas corrompue avant confirmation`);
  await page.click('[data-act="mapop-ok"]');
  await page.waitForTimeout(250);
  check((await st(idx)).c, `${name} : corrompue après confirmation`);
  await page.screenshot({ path: join(OUT, `${name}-5-apres.png`) });
  check((await page.textContent('[data-act="mapop-corrupt"]')).includes('Déjà corrompue'), `${name} : opérations grisées « Déjà corrompue »`);
  // onglet Cartes du coffre
  await page.evaluate(() => {
    const g = window.__arpg.game();
    const c = g.character;
    const i = c.inventory.findIndex((x, k) => x?.map && !x.corrupted && k >= 0);
    c.mapStash = [c.inventory[i]];
    c.inventory[i] = null;
    c.materials.orb_arcane = 1;
    window.__arpg.app.panels.sel = null;
    window.__arpg.app.panels.show('stash');
  });
  await page.waitForTimeout(300);
  // écran étroit : un seul volet à la fois, on passe sur « Coffre »
  if (await page.$('[data-testid="pane-chest"]')) await page.click('[data-testid="pane-chest"]');
  await page.click('text=/^Cartes \\(/');
  await page.waitForTimeout(300);
  await page.click('[data-testid="map-row-0"]');
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, `${name}-6-coffre-cartes.png`) });
  await page.click('[data-act="map-upgrade"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, `${name}-7-coffre-liste.png`) });
  await page.click('[data-act="mapop-arcane"]');
  await page.waitForTimeout(250);
  check(await page.evaluate(() => window.__arpg.game().character.mapStash[0].quality === 'magic'), `${name} : carte du coffre de cartes améliorée en magique`);
  check(errors.length === 0, `${name} : aucune erreur de page`, errors.join(' | '));
  await ctx.close();
}
await browser.close();
process.exit(fails ? 1 : 0);
