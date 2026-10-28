/**
 * Écran « Preparing the Diablo II interface… » qui ne finit jamais (bug signalé sur téléphone) : le lot « ui » est DÉCLARÉ prêt (marqueur
 * ui/ui.json en cache) mais ses images manquent ; l'ancien « Retry » ne faisait rien (requestExtras saute les lots prêts).
 *   A. images absentes du cache + rechargement : l'écran se répare seul (relecture puis refabrication) et affiche l'écran D2.
 *   B. idem avec échec de génération simulé : l'écran s'explique (état, dernière erreur, Copy error details, Verify / repair), « Retry »
 *      répond tout de suite (« Retrying… ») et, l'échec levé, l'écran D2 apparaît ; « Choose my Diablo II files… » rouvre l'import.
 *   D2_SPRITES=0 D2_PUBLIC=1 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/d2-ui-stuck.mjs [--shots=<dossier>] [--cpu=4]
 */
import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const IN = args.get('in') ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
const SHOTS = args.get('shots');
const CPU = Number(args.get('cpu') ?? 4);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const mpqs = readdirSync(IN)
  .filter((f) => /^d2(char|data|exp)\.mpq$/i.test(f))
  .map((f) => join(IN, f));
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  try {
    localStorage.setItem('d2m.lang', 'en');
  } catch {}
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
if (CPU > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: CPU });
const shot = (n) => SHOTS && page.screenshot({ path: join(SHOTS, `${n}.png`) });

// import frais, fichiers un par un
await page.goto(URL);
await page.evaluate(async () => {
  localStorage.clear();
  localStorage.setItem('d2m.lang', 'en');
  for (const k of await caches.keys()) await caches.delete(k);
  try {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
  } catch {}
});
await page.goto(URL);
await page.waitForSelector('.d2c', { timeout: 60000 });
for (const f of mpqs) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.tap('.d2c-card .btn.primary')]);
  await fc.setFiles([f]);
  await page.waitForTimeout(600);
}
await page.waitForSelector('.charselect.d2s', { timeout: 600000 });
check(true, 'import frais : écran D2 atteint');

const dropUiImages = () =>
  page.evaluate(async () => {
    const c = await caches.open('d2m-d2-local');
    let n = 0;
    for (const r of await c.keys())
      if (/\/ui\//.test(r.url) && !/ui\.json$/.test(r.url)) {
        await c.delete(r);
        n++;
      }
    return n;
  });

/* ---- A : marqueur prêt, images absentes, rechargement ---- */
console.log('\n== A : images de l’interface absentes du cache');
const n = await dropUiImages();
check(n > 3, 'images ui retirées du cache (marqueur ui.json conservé)', `${n}`);
await page.reload();
const t0 = Date.now();
await page.waitForSelector('.charselect', { timeout: 60000 });
await shot('A-1-attente');
const aWait = await page.evaluate(() => document.querySelector('.charselect')?.innerText ?? '');
console.log('   (écran vu) ' + aWait.replace(/\n/g, ' | ').slice(0, 220));
await page.waitForSelector('.charselect.d2s', { timeout: Number(args.get('atimeout') ?? 600000) });
check(true, 'A : l’écran se répare seul et affiche l’écran D2', `${Math.round((Date.now() - t0) / 1000)} s`);
await shot('A-2-ok');

if (args.get('only') === 'A') {
  await browser.close();
  console.log(fails ? `\n${fails} échec(s)` : '\nOK');
  process.exit(fails ? 1 : 0);
}
/* ---- B : refabrication impossible (échec simulé) ---- */
console.log('\n== B : échec de génération simulé');
await dropUiImages();
await page.evaluate(() => localStorage.setItem('d2m.d2testFail', 'ui'));
await page.reload();
// le démarrage lui-même peut présenter l'écran d'erreur de préparation : « Continue anyway »
const first = await Promise.race([page.waitForSelector('.loading .problem', { timeout: 120000 }).then(() => 'problem'), page.waitForSelector('.charselect', { timeout: 120000 }).then(() => 'wait')]);
if (first === 'problem') {
  check(true, 'B : écran d’erreur de préparation affiché (jamais bloquant)');
  await page.tap('.loading .problem .btn:has-text("Continue anyway")');
  await page.waitForSelector('.charselect', { timeout: 60000 });
}
// l'écran d'attente doit s'expliquer : dernière erreur + Copy error details + Verify / repair
await page.waitForFunction(() => /Last error: ui:/.test(document.querySelector('.charselect')?.innerText ?? ''), null, { timeout: 120000 });
const st = await page.evaluate(() => ({
  text: document.querySelector('.charselect').innerText,
  btns: [...document.querySelectorAll('.charselect button')].filter((b) => !b.hidden && b.offsetParent).map((b) => b.textContent),
}));
await shot('B-1-explique');
console.log('   ' + st.text.replace(/\n/g, ' | ').slice(0, 300));
check(/could not be built/.test(st.text), 'B : message explicite', '');
check(/Phase: ready/.test(st.text) && /Queue:/.test(st.text), 'B : état en direct (phase, file)');
check(/Last error: ui: .*(simulé|test)/.test(st.text), 'B : dernière erreur du lot « ui » affichée');
check(
  ['Retry', 'Choose my Diablo II files…', 'Copy error details', 'Verify / repair files'].every((b) => st.btns.includes(b)),
  'B : Retry, Choose, Copy error details, Verify / repair présents',
  st.btns.join(' | '),
);
// Retry : retour visuel immédiat
await page.evaluate(() => localStorage.removeItem('d2m.d2testFail'));
await page.evaluate(() => {
  window.__seen = [];
  new MutationObserver(() => window.__seen.push(document.querySelector('.charselect p')?.textContent)).observe(document.body, { subtree: true, childList: true, characterData: true });
});
await page.tap('.charselect button:has-text("Retry")');
const seen = await page.evaluate(() => document.querySelector('.charselect p')?.textContent ?? '');
check(/Retrying/.test(seen) || (await page.evaluate(() => window.__seen)).some((t) => /Retrying/.test(t ?? '')), 'B : Retry répond immédiatement (« Retrying… »)', seen);
await page.waitForSelector('.charselect.d2s', { timeout: 600000 });
check(true, 'B : après Retry (échec levé) l’écran D2 apparaît');
await shot('B-2-ok');

/* ---- D : interface partielle (clés indispensables absentes) + génération impossible : clés manquantes et attendu affichés ---- */
console.log('\n== D : interface partielle');
await page.evaluate(async () => {
  const c = await caches.open('d2m-d2-local');
  for (const r of await c.keys()) if (/\/ui\/(select-bg|hero-sorceress-nu1)\.png$/.test(r.url)) await c.delete(r);
  localStorage.setItem('d2m.d2testFail', 'ui');
});
await page.reload();
const f3 = await Promise.race([page.waitForSelector('.loading .problem', { timeout: 120000 }).then(() => 'problem'), page.waitForSelector('.charselect', { timeout: 120000 }).then(() => 'wait')]);
if (f3 === 'problem') {
  await page.tap('.loading .problem .btn:has-text("Continue anyway")');
  await page.waitForSelector('.charselect', { timeout: 60000 });
}
await page.waitForFunction(() => /Last error: ui:/.test(document.querySelector('.charselect')?.innerText ?? ''), null, { timeout: 120000 });
const dt = await page.evaluate(() => document.querySelector('.charselect').innerText);
console.log('   ' + dt.replace(/\n/g, ' | ').slice(0, 400));
check(/Missing: select-bg, hero-sorceress-nu1/.test(dt), 'D : clés indispensables manquantes listées');
check(/Interface: (INCOMPLETE|not prepared), \d+\/\d+ image/.test(dt) || /Interface: not prepared/.test(dt), 'D : jamais « prepared » pour une interface partielle', dt.match(/Interface:[^\n]*/)?.[0]);
await page.evaluate(() => localStorage.removeItem('d2m.d2testFail'));
await page.tap('.charselect button:has-text("Retry")');
await page.waitForSelector('.charselect.d2s', { timeout: 600000 });
check(true, 'D : après Retry l’écran D2 apparaît');

/* ---- E : le contenu d'un MPQ copié est abîmé (zones remplies de n'importe quoi, comme sur le téléphone) : l'échec dit quel fichier D2 et ce qui a été lu ---- */
console.log('\n== E : fichier D2 illisible dans la copie');
const loc = JSON.parse(execFileSync('npx', ['tsx', 'tools/e2e/mpq-locate.ts', IN, 'data\\global\\ui\\frontend\\gameselectscreenexp.dc6'], { encoding: 'utf8' }));
const cor = await page.evaluate(
  async ({ a, at }) => {
    const ok = await window.__d2local.testCorruptCopy(a, at, 4096);
    const c = await caches.open('d2m-d2-local');
    for (const r of await c.keys()) if (/\/ui\//.test(r.url)) await c.delete(r);
    window.__d2local.__e = 1;
    return ok;
  },
  { a: loc.archive, at: loc.at },
);
check(cor, 'E : 4 Ko de la copie abîmés au début des données de frontend/gameselectscreenexp', JSON.stringify(loc));
await page.reload();
const f4 = await Promise.race([page.waitForSelector('.loading .problem', { timeout: 180000 }).then(() => 'problem'), page.waitForSelector('.charselect', { timeout: 180000 }).then(() => 'wait')]);
let eText = '';
if (f4 === 'problem') eText = await page.evaluate(() => document.querySelector('.loading .problem')?.innerText ?? '');
else {
  await page.waitForFunction(() => /Last error: ui:/.test(document.querySelector('.charselect')?.innerText ?? ''), null, { timeout: 180000 });
  eText = await page.evaluate(() => document.querySelector('.charselect').innerText);
}
console.log('   ' + eText.replace(/\n/g, ' | ').slice(0, 700));
check(/Interface incomplete/.test(eText) && /menu-bg/.test(eText), 'E : « Interface incomplete » avec la clé manquante (menu-bg)');
check(/unreadable: frontend\/gameselectscreenexp/.test(eText), 'E : le fichier D2 en cause est nommé', '');
check(/head [0-9a-f]{2}/.test(eText) || /at \d+/.test(eText), 'E : octets lus / position / compression dans le diagnostic');
await shot('E-1');

/* ---- C : « Choose my Diablo II files… » rouvre l'import ---- */
console.log('\n== C : Choose my Diablo II files…');
await dropUiImages();
await page.evaluate(() => localStorage.setItem('d2m.d2testFail', 'ui'));
await page.reload();
const f2 = await Promise.race([page.waitForSelector('.loading .problem', { timeout: 120000 }).then(() => 'problem'), page.waitForSelector('.charselect', { timeout: 120000 }).then(() => 'wait')]);
if (f2 === 'problem') {
  await page.tap('.loading .problem .btn:has-text("Continue anyway")');
  await page.waitForSelector('.charselect', { timeout: 60000 });
}
await page.waitForFunction(() => /Last error: ui:/.test(document.querySelector('.charselect')?.innerText ?? ''), null, { timeout: 120000 });
await page.evaluate(() => localStorage.removeItem('d2m.d2testFail'));
await page.tap('.charselect button:has-text("Choose my Diablo II files")');
await page.waitForSelector('.d2c', { timeout: 30000 });
check(true, 'C : l’écran d’import se rouvre');
for (const f of mpqs) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.tap('.d2c-card .btn.primary')]);
  await fc.setFiles([f]);
  await page.waitForTimeout(600);
}
await page.waitForSelector('.charselect.d2s', { timeout: 600000 });
check(true, 'C : après le choix des fichiers, l’écran D2 apparaît');
check(errs.length === 0, 'aucune erreur de page', errs.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} échec(s)` : '\nOK');
process.exit(fails ? 1 : 0);
