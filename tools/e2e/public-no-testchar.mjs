/**
 * Version publique : aucun personnage préfabriqué (la Sorcière de niveau 99 d'essai n'est créée que dans la version complète, hors D2_PUBLIC).
 * Un navigateur « humain » (pas de HeadlessChrome) charge la page neuve ; on regarde les sauvegardes.
 *   D2_SPRITES=0 D2_PUBLIC=1 npx vite --host 127.0.0.1 --port 5233 --strictPort   (--expect=none)
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort                            (--expect=some, version complète)
 *   node tools/e2e/public-no-testchar.mjs --url=http://127.0.0.1:5233/ --expect=none
 */
import { chromium } from 'playwright-core';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const expect = args.get('expect') ?? 'none';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
const page = await ctx.newPage();
await page.goto(URL);
await page.evaluate(async () => {
  localStorage.clear();
  for (const k of await caches.keys()) await caches.delete(k);
});
await page.goto(URL);
await page.waitForTimeout(6000);
const r = await page.evaluate(() => ({
  flag: localStorage.getItem('d2m.testchar.v1'),
  saves: Object.keys(localStorage).filter((k) => /d2m\.(save|slot|char)/i.test(k)),
  all: Object.keys(localStorage)
    .filter((k) => !/lang|d2/.test(k))
    .slice(0, 12),
  text: document.body.innerText.slice(0, 300).replace(/\n/g, ' | '),
}));
console.log(JSON.stringify(r));
const some = !!r.flag || r.saves.length > 0 || /Sorcière 99/.test(r.text);
const ok = expect === 'none' ? !some : some;
console.log(ok ? `✓ attendu « ${expect} »` : `✗ attendu « ${expect} » mais ${some ? 'personnage présent' : 'aucun personnage'}`);
await browser.close();
process.exit(ok ? 0 : 1);
