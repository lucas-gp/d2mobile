/**
 * Relance hors ligne de l'application installée, avant que toutes les planches soient en cache
 * (retour téléphone : « Erreur au démarrage : Unexpected token '<' » après réduction du jeu).
 * Le jeu doit démarrer : le manifeste fait partie du cœur, le service worker ne renvoie jamais
 * la page HTML pour un fichier de données, les planches manquantes sont ignorées.
 *   node tools/e2e/offline.mjs [--url=http://127.0.0.1:5233/]
 */
import { chromium } from 'playwright-core';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let ok = true;
const check = (cond, what, detail = '') => {
  if (!cond) ok = false;
  console.log(`${cond ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};

await page.goto(URL);
await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(() => undefined);
if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
}
await page.waitForFunction(() => window.__arpg && window.__arpg.state().mode, null, { timeout: 30000 });
// on retire du cache toutes les planches sauf le manifeste (préchargement pas encore terminé)
const kept = await page.evaluate(async () => {
  for (const k of await caches.keys()) {
    const c = await caches.open(k);
    for (const r of await c.keys()) if (r.url.includes('/sprites/') && !r.url.endsWith('manifest.json')) await c.delete(r);
  }
  const all = [];
  for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) all.push(r.url);
  return all.some((u) => u.endsWith('sprites/manifest.json'));
});
check(kept, 'manifeste des planches dans le cache du service worker');
await ctx.setOffline(true);
// hors ligne, une donnée absente du cache ne doit jamais être remplacée par la page HTML
const probe = await page.evaluate(async () => {
  const r = await fetch('sprites/lo/inexistant.json').catch(() => null);
  return r ? { status: r.status, type: r.headers.get('content-type') ?? '' } : { status: 0, type: 'erreur réseau' };
});
check(!probe.type.includes('text/html'), 'hors ligne : pas de page HTML pour un fichier de données absent du cache', `${probe.status} ${probe.type}`);
const core = await page.evaluate(async () => (await (await fetch('sw.js', { cache: 'reload' }).catch(() => null))?.text()) ?? '');
await page.reload();
const started = await page
  .waitForFunction(() => window.__arpg && window.__arpg.state().mode === 'town', null, { timeout: 30000 })
  .then(() => true)
  .catch(() => false);
const msg = await page.evaluate(() => document.querySelector('.loading')?.textContent ?? '');
check(started && !/Erreur/.test(msg), 'relance hors ligne : le jeu démarre en ville', msg.slice(0, 120));
check(!errors.some((e) => /Unexpected token/.test(e)), 'aucune page HTML lue comme des données', errors.slice(0, 2).join(' | '));
const coreList = (core.match(/const CORE = (\[.*?\]);/) ?? [])[1] ?? '';
check(coreList.includes('sprites/manifest.json'), 'le manifeste des planches est mis en cache dès l’installation', coreList ? '' : 'liste CORE absente de sw.js');
// l'activation ne doit rien télécharger : le navigateur y met en attente l'ouverture de la page
// (la PWA restait figée sur l'écran de démarrage pendant le préchargement des planches)
const activate = (core.match(/addEventListener\('activate'[\s\S]*?\n\}\);/) ?? [''])[0];
check(activate !== '' && !/SPRITES|fetch\(|\.add\(/.test(activate), 'activation du service worker instantanée (aucun téléchargement)', activate ? '' : 'gestionnaire activate introuvable');
await browser.close();
process.exit(ok ? 0 : 1);
