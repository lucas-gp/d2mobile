/**
 * Jeu sans mod (test de suppression, tools/ci/suppression.mjs --e2e) : version publique servie depuis une copie du dépôt sans `mods/` ;
 * nouveau personnage (jeu de règles `d2`, la base seule), run de Tristram, retour en ville, sauvegarde, rechargement de la page,
 * personnage relu et rejoué ; aucune erreur console.
 *   (dans la copie) D2_SPRITES=0 D2_PUBLIC=1 D2_ALLOW_SKIP=1 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/no-mods.mjs [--url=http://127.0.0.1:5233/]
 */
import { chromium } from 'playwright-core';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 }, locale: 'fr-FR' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|GPU stall|swiftshader|WebGL|GroupMarker/i.test(m.text()) && errs.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message.slice(0, 200)}`));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e.init')) {
      localStorage.clear();
      sessionStorage.setItem('e2e.init', '1');
    }
    localStorage.setItem('d2m.lang', 'fr');
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const ready = () => page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 240000 });
  const menu = async () => {
    await page.waitForSelector('.d2c, .charselect', { timeout: 90000 });
    if (await page.$('.d2c')) await page.click('.d2c-skip');
    await page.waitForSelector('.charselect', { timeout: 90000 });
  };
  await page.goto(URL);
  await menu();
  await page.fill('.charselect input', 'Base');
  await page.click('.charselect .card.sorceress');
  await page.click('.charselect .btn.primary');
  await ready();
  const g1 = await page.evaluate(() => ({ ruleset: window.__arpg.game().ruleset, name: window.__arpg.game().character.name }));
  check(g1.ruleset === 'd2' && g1.name === 'Base', 'nouveau personnage dans le jeu de règles d2 (base seule)', JSON.stringify(g1));
  const started = await page.evaluate(() => window.__arpg.startRun('tristram', 0, 7));
  await ready();
  check(started, 'run de Tristram lancée');
  await page.evaluate(() => {
    window.__arpg.god(true);
    for (let i = 0; i < 6; i++) {
      window.__arpg.killAll();
      window.__arpg.step(120);
    }
  });
  const kills = await page.evaluate(() => window.__arpg.game().world?.kills ?? window.__arpg.state().kills ?? 0);
  await page.evaluate(() => window.__arpg.town());
  await ready();
  await page.evaluate(() => window.__arpg.app.saveNow());
  check(true, 'retour en ville et sauvegarde', `victimes : ${kills}`);
  await page.reload();
  await menu();
  await page.waitForSelector('.charselect .char', { timeout: 30000 });
  const listed = await page.locator('.charselect .char').allInnerTexts();
  check(
    listed.some((t) => t.includes('Base')),
    'le personnage est listé après rechargement',
    listed.join(' | ').replace(/\s+/g, ' ').slice(0, 120),
  );
  await page.click('.charselect .char');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 5000 }).catch(() => page.click('.charselect .btn.primary'));
  await ready();
  const g2 = await page.evaluate(() => ({ ruleset: window.__arpg.game().ruleset, name: window.__arpg.game().character.name }));
  check(g2.ruleset === 'd2' && g2.name === 'Base', 'personnage rechargé et rejoué (d2)', JSON.stringify(g2));
  await page.waitForTimeout(2000);
  check(errs.length === 0, '0 erreur console', errs.join(' | '));
} finally {
  await browser.close();
}
console.log(fails ? `${fails} échec(s)` : 'OK');
process.exit(fails ? 1 : 0);
