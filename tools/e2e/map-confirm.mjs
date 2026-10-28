/**
 * Carte : bouton « Corrompre » actif (même vérification que le menu Améliorer) et confirmation modale visible sans défiler.
 *   node tools/e2e/map-confirm.mjs [--url=http://127.0.0.1:5233/] [--dev=nom]
 */
import { chromium } from 'playwright-core';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? 'http://127.0.0.1:5233/';
const DEVS = { pc: [900, 800, 1, false], 'fold-plie': [840, 360, 3, true], 'tel-etroit-paysage': [844, 390, 3, true] };
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [name, [width, height, dpr, mobile]] of Object.entries(DEVS)) {
  if (args.get('dev') && name !== args.get('dev')) continue;
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile, locale: 'fr-FR' });
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
    for (const k of ['worldstone_shard', 'orb_destruction', 'orb_horadrim']) g.character.materials[k] = 3;
    g.settings.confirmCorrupt = true;
    g.settings.confirmMapUpgrade = true;
    window.__arpg.giveMap(3, 'rare');
    window.__arpg.giveMap(3, 'rare');
    window.__arpg.app.panels.show('inventory');
  });
  await page.waitForTimeout(300);
  const select = (n) =>
    page.evaluate((n) => {
      const c = window.__arpg.game().character;
      const idx = c.inventory.map((x, i) => (x?.map ? i : -1)).filter((i) => i >= 0)[n];
      window.__arpg.app.panels.sel = { from: 'inv', idx };
      window.__arpg.app.panels.refresh();
      return idx;
    }, n);
  const corrupted = (i) => page.evaluate((i) => !!window.__arpg.game().character.inventory[i].corrupted, i);
  const modal = async (label) => {
    const m = await page.evaluate(() => {
      const r = (s) => {
        const e = document.querySelector(s);
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return { t: b.top, b: b.bottom, l: b.left, r: b.right, h: b.height };
      };
      return { box: r('.actmenu-ask'), yes: r('[data-act="mapop-ok"]'), no: r('[data-act="menu-cancel"]'), w: innerWidth, h: innerHeight };
    });
    const inside = (x) => !!x && x.t >= -1 && x.b <= m.h + 1 && x.l >= -1 && x.r <= m.w + 1;
    check(inside(m.box) && inside(m.yes) && inside(m.no), `${name} : ${label} : confirmation visible sans défiler`, JSON.stringify(m));
    check(!!m.yes && !!m.no && m.yes.h >= 44 && m.no.h >= 44, `${name} : ${label} : boutons ≥ 44 px`, `${m.yes?.h}/${m.no?.h}`);
  };
  const idx = await select(0);
  await page.waitForTimeout(200);
  const dis = await page.getAttribute('[data-act="corrupt"]', 'aria-disabled');
  check(dis === null, `${name} : bouton Corrompre actif pour une carte corruptible`);
  await page.click('[data-act="corrupt"]');
  await page.waitForTimeout(250);
  await modal('Corrompre (colonne)');
  await page.screenshot({ path: `test-results/e2e/map-confirm-${name}.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check((await page.$('.actmenu-ask')) === null, `${name} : Échap ferme la confirmation`);
  check(!(await corrupted(idx)), `${name} : rien appliqué après Échap`);
  // autre confirmation du même mécanisme : fortification
  const fort = await page.$('[data-act="mapop-destruction"]');
  if (fort && !(await fort.evaluate((e) => e.classList.contains('disabled')))) {
    await fort.click();
    await page.waitForTimeout(200);
    await modal('Retirer les affixes');
    await page.click('[data-act="menu-cancel"]');
    await page.waitForTimeout(150);
    check((await page.$('.actmenu-ask')) === null, `${name} : Annuler ferme la confirmation`);
  } else console.log(`- ${name} : option non disponible, ignorée`);
  // via le menu Améliorer, puis Confirmer
  await page.click('[data-act="mapop-corrupt"]');
  await page.waitForTimeout(200);
  await modal('Corrompre (menu)');
  await page.click('[data-act="mapop-ok"]');
  await page.waitForTimeout(300);
  check(await corrupted(idx), `${name} : Confirmer corrompt la carte`);
  const dis2 = await page.getAttribute('[data-act="corrupt"]', 'aria-disabled');
  check(dis2 === 'true', `${name} : bouton grisé une fois la carte corrompue`);
  check(errors.length === 0, `${name} : aucune erreur JS`, errors.join('|'));
  await ctx.close();
}
await browser.close();
process.exit(fails ? 1 : 0);
