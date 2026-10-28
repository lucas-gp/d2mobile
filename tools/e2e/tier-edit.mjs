// Onglet Paliers du filtre de butin : monter un objet, palier effectif, objet au sol mis à jour (captures lues)
// Usage : URL=http://127.0.0.1:5233/ node tools/e2e/tier-edit.mjs [740x360,1920x1080] [dossier]
import { chromium } from 'playwright-core';
import { pickFirstMode } from './pick-mode.mjs';
const URL = process.env.E2E_URL || process.env.URL || 'http://127.0.0.1:5233/';
const sizes = (process.argv[2] || '740x360,1920x1080').split(',');
const out = process.argv[3] || 'test-results/e2e/shots';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const sz of sizes) {
  const [w, h] = sz.split('x').map(Number);
  const mobile = w < 500 || h < 400;
  const page = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })).newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message));
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
    g.setFilter({ preset: 'all' });
    const p = g.world.player;
    g.world.dropItem({ uid: 'tsoj', base: 'amulet', quality: 'unique', uniqueId: 'u_the_stone_of_jordan', ilvl: 80, sockets: 0, socketed: [] }, p.x + 1.5, p.y + 1, 0.2);
  });
  const showOf = () => page.evaluate(() => window.__arpg.game().world.items.find((i) => i.item.uid === 'tsoj')?.show);
  const before = await showOf();
  await page.evaluate(() => window.__arpg.app.openPanel('filter'));
  await page.waitForTimeout(400);
  await page.click('[data-testid="filter-tab-tiers"]');
  await page.fill('[data-testid="td-search"]', 'jordan');
  await page.waitForTimeout(300);
  const rowTier = () =>
    page.evaluate(() => {
      const r = document.querySelector('[data-testid="td-row"]');
      return r ? { tier: r.dataset.tier, mod: r.classList.contains('mod'), id: r.dataset.id } : null;
    });
  const r0 = await rowTier();
  await page.screenshot({ path: `${out}/tiers-before-${sz}.png` });
  await page.click('[data-testid="td-row"] [data-testid="td-up"]');
  await page.waitForTimeout(300);
  const r1 = await rowTier();
  const after = await showOf();
  console.log(sz, 'avant', before, JSON.stringify(r0), 'après', after, JSON.stringify(r1));
  if (before !== 4 || r0?.tier !== '4' || r1?.tier !== '5' || !r1.mod || after !== 5) {
    bad++;
    console.log('FAIL montée de palier');
  }
  const geo = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: innerWidth,
    btn: Math.min(...[...document.querySelectorAll('[data-testid="td-up"]')].map((e) => e.getBoundingClientRect().height)),
  }));
  if (geo.sw > geo.iw + 1) {
    bad++;
    console.log('FAIL défilement horizontal', JSON.stringify(geo));
  }
  if (geo.btn < 40) {
    bad++;
    console.log('FAIL bouton < 40 px', geo.btn);
  }
  await page.screenshot({ path: `${out}/tiers-after-${sz}.png` });
  // déplacement groupé : sélection -> Aucun, puis tout remettre
  await page.click('[data-testid="td-row"] [data-testid="td-chk"]');
  await page.click('[data-testid="td-move-0"]');
  await page.waitForTimeout(200);
  const r2 = await rowTier();
  if (r2?.tier !== '0') {
    bad++;
    console.log('FAIL déplacement groupé', JSON.stringify(r2));
  }
  await page.click('[data-testid="td-reset-all"]');
  await page.click('[data-testid="td-reset-all"]');
  await page.waitForTimeout(200);
  const r3 = await rowTier();
  const n = await page.evaluate(() => window.__arpg.game().character.filter.tierOverride?.length ?? 0);
  if (r3?.tier !== '4' || n !== 0 || (await showOf()) !== 4) {
    bad++;
    console.log('FAIL remise à zéro', JSON.stringify(r3), n);
  }
  // liste sans recherche : groupes par palier
  await page.fill('[data-testid="td-search"]', '');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/tiers-list-${sz}.png` });
  await page.close();
}
await b.close();
console.log(bad ? `${bad} échec(s)` : 'OK');
process.exit(bad ? 1 : 0);
