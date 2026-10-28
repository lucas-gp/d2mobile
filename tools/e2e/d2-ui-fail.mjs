/**
 * Échec de l'étape « ui » (simulé) : l'écran d'erreur ne bloque jamais, « Continue anyway » démarre le jeu (clic TACTILE), « Retry » relance
 * seulement ce qui a échoué, un seul échec est absorbé par la nouvelle tentative automatique. Fichiers choisis UN PAR UN, 3 MPQ sans Patch_D2.
 *   D2_SPRITES=0 D2_PUBLIC=1 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/d2-ui-fail.mjs [--shots=<dossier>] [--cpu=4] [--w=900 --h=800]
 */
import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const IN = args.get('in') ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
const SHOTS = args.get('shots');
const W = Number(args.get('w') ?? 900);
const H = Number(args.get('h') ?? 800);
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
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...(args.has('heap') ? [`--js-flags=--max-old-space-size=${args.get('heap')}`] : [])],
});

async function scenario(name, failSpec, actions) {
  console.log(`\n== ${name} (testFail=${failSpec})`);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    localStorage.setItem('d2m.lang', 'en');
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const page = await ctx.newPage();
  if (CPU > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const shot = (n) => SHOTS && page.screenshot({ path: join(SHOTS, `${name}-${n}.png`) });
  await page.goto(URL);
  await page.evaluate(async (spec) => {
    localStorage.clear();
    localStorage.setItem('d2m.lang', 'en');
    if (spec) localStorage.setItem('d2m.d2testFail', spec);
    for (const k of await caches.keys()) await caches.delete(k);
    try {
      const r = await navigator.storage.getDirectory();
      for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
    } catch {}
  }, failSpec);
  await page.goto(URL);
  await page.waitForSelector('.d2c', { timeout: 60000 });
  // un fichier à la fois
  for (const f of mpqs) {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.tap('.d2c-card .btn.primary')]);
    await fc.setFiles([f]);
    await page.waitForTimeout(600);
  }
  await page.waitForSelector('.d2c', { state: 'detached', timeout: 240000 });
  await actions(page, shot);
  await ctx.close();
}

const problemUp = (page) => page.waitForSelector('.loading .problem', { timeout: 600000 });
const layout = async (page) =>
  page.evaluate(() => {
    const r = (s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
    };
    const btns = [...document.querySelectorAll('.loading .problem .btn')].map((b) => {
      const x = b.getBoundingClientRect();
      const hit = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2);
      return { t: b.textContent, inView: x.top >= 0 && x.bottom <= innerHeight && x.left >= 0 && x.right <= innerWidth, hit: b === hit || b.contains(hit) };
    });
    return { boot: !!document.querySelector('.d2-boot'), text: document.querySelector('.loading')?.innerText ?? '', btns, h: innerHeight };
  });

await scenario('continue', 'ui', async (page, shot) => {
  await problemUp(page);
  await page.waitForTimeout(500);
  await shot('1-erreur');
  const l = await layout(page);
  console.log('  texte :', l.text.replace(/\s+/g, ' ').slice(0, 300));
  check(!l.boot, "l'écran d'attente d'origine est retiré");
  check(!/loading…/i.test(l.text), 'pas de texte « loading… » superposé');
  check(l.btns.length === 3 && l.btns.every((b) => b.inView && b.hit), 'trois boutons visibles et atteignables', JSON.stringify(l.btns));
  check(/ui/i.test(l.text) && /simulé|simulated|échec/i.test(l.text), "l'erreur technique réelle est affichée");
  await page.tap('.loading .problem .btn:has-text("Continue anyway")');
  await page.waitForFunction(() => !!window.__arpg || !!document.querySelector('.charselect'), null, { timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector('.loading .problem'), null, { timeout: 60000 });
  check(true, 'Continue anyway : le démarrage reprend (clic tactile)');
  await shot('2-apres-continue');
});

await scenario('retry', 'ui:2', async (page, shot) => {
  // 2 échecs : la tentative automatique échoue aussi → erreur ; Retry réussit
  await problemUp(page);
  await shot('1-erreur');
  await page.tap('.loading .problem .btn:has-text("Retry")');
  await page.waitForFunction(() => !document.querySelector('.loading .problem'), null, { timeout: 300000 });
  await page.waitForFunction(() => document.documentElement.dataset.d2ui === '1', null, { timeout: 60000 }).catch(() => undefined);
  const ok = await page.evaluate(() => document.documentElement.dataset.d2ui === '1');
  check(ok, "Retry : l'interface Diablo II est générée");
});

await scenario('auto-retry', 'ui:1', async (page, shot) => {
  await page.waitForFunction(() => !!window.__arpg || document.documentElement.dataset.d2ui === '1', null, { timeout: 600000 });
  const prob = await page.$('.loading .problem');
  check(!prob, 'un seul échec est absorbé par la nouvelle tentative automatique (aucune erreur affichée)');
  await shot('1');
});

// l'écran de sélection n'est jamais celui d'origine : après « Continue anyway », attente de l'interface D2 puis écran D2 après « Retry »
await scenario('charselect-wait', 'ui', async (page, shot) => {
  await problemUp(page);
  await page.tap('.loading .problem .btn:has-text("Continue anyway")');
  await page.waitForSelector('.charselect', { timeout: 120000 });
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => ({
    d2s: !!document.querySelector('.charselect.d2s'),
    cards: document.querySelectorAll('.charselect .card, .charselect .chars').length,
    text: document.querySelector('.charselect')?.innerText ?? '',
  }));
  await shot('1-attente');
  check(!st.d2s && st.cards === 0, "interface absente : aucun écran d'origine (ni cartes ni liste)", JSON.stringify(st).slice(0, 200));
  check(/interface/i.test(st.text) && /Retry/.test(st.text), 'message clair et bouton Retry', st.text.replace(/\s+/g, ' ').slice(0, 160));
  await page.evaluate(() => localStorage.removeItem('d2m.d2testFail'));
  await page.tap('.charselect .btn:has-text("Retry")');
  await page.waitForSelector('.charselect.d2s', { timeout: 240000 });
  check(true, "Retry : l'écran D2 de sélection apparaît");
  await shot('2-d2');
});

await browser.close();
console.log(fails ? `\n${fails} échec(s)` : '\nOK');
process.exit(fails ? 1 : 0);
