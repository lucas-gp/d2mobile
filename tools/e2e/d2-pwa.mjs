/**
 * Installation PWA (version publique) : manifeste valide, service worker actif avec gestionnaire fetch, bouton « Install the app »
 * sur beforeinstallprompt simulé (et masqué une fois installée).
 *   D2_SPRITES=0 D2_PUBLIC=1 npx vite build --outDir /tmp/x && npx vite preview --outDir /tmp/x --port 5233
 *   node tools/e2e/d2-pwa.mjs [--url=http://127.0.0.1:5233/]
 */
import { chromium } from 'playwright-core';
const URL = process.argv.find((a) => a.startsWith('--url='))?.slice(6) ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
const page = await ctx.newPage();
await page.goto(URL);
const m = await page.evaluate(async () => {
  const href = document.querySelector('link[rel=manifest]')?.href;
  const man = await (await fetch(href)).json();
  return { man, href };
});
const mn = m.man;
check(!!mn.name && !!mn.short_name && !!mn.start_url && !!mn.scope, 'manifeste : name, short_name, start_url, scope');
check(['standalone', 'fullscreen', 'minimal-ui'].includes(mn.display), 'manifeste : display', mn.display);
const sizes = new Set(mn.icons.map((i) => i.sizes));
check(sizes.has('192x192') && sizes.has('512x512') && mn.icons.some((i) => /maskable/.test(i.purpose ?? '')), 'manifeste : icônes 192, 512, maskable');
check(!!mn.theme_color && !!mn.background_color, 'manifeste : theme_color et background_color');
for (const i of mn.icons) {
  const r = await page.evaluate((u) => fetch(u).then((x) => x.status + ' ' + x.headers.get('content-type')), new globalThis.URL(i.src, m.href).href);
  check(/^200 image\/png/.test(r), `icône ${i.src}`, r);
}
// service worker enregistré SANS avoir passé l'écran d'import
const sw = await page.evaluate(async () => {
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 30000))]);
  if (!reg) return null;
  const txt = await (await fetch(reg.active.scriptURL)).text();
  return { state: reg.active.state, scope: reg.scope, fetchHandler: /addEventListener\(\s*['"]fetch['"]/.test(txt), url: reg.active.scriptURL };
});
check(!!sw && sw.state === 'activated', "service worker actif (sur l'écran d'import, sans avoir rien chargé)", JSON.stringify(sw));
check(!!sw?.fetchHandler, 'le service worker a un gestionnaire fetch');
// bouton d'installation
await page.waitForSelector('.d2c', { timeout: 30000 });
check(!(await page.$('.pwa-install .btn')), 'pas de bouton avant beforeinstallprompt');
await page.evaluate(() => {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = async () => (window.__prompted = true);
  e.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(e);
});
await page.waitForSelector('.pwa-install .btn', { timeout: 5000 });
check(true, 'bouton « Install the app » affiché après beforeinstallprompt', await page.textContent('.pwa-install .btn'));
await page.click('.pwa-install .btn');
check(await page.evaluate(() => window.__prompted === true), 'le clic déclenche prompt()');
await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
await page.waitForTimeout(200);
check(!(await page.$('.pwa-install .btn')), 'bouton masqué après appinstalled');
await browser.close();
console.log(fails ? `${fails} échec(s)` : 'OK');
process.exit(fails ? 1 : 0);
