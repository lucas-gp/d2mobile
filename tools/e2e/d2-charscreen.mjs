/**
 * Écran de sélection de personnage en mode local (vrais MPQ, $D2_PRIVATE_DIR/in) : graphismes D2 générés présents, écran affiché seulement
 * une fois les éléments prêts, mise à l'échelle 800×600 sans coupure (900×800, 844×390 paysage, 390×844 portrait).
 *   D2_SPRITES=0 D2_PUBLIC=1 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/d2-charscreen.mjs [--shots=/tmp/cs] [--only=900x800]
 */
import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const IN = args.get('in') ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
const SHOTS = args.get('shots') ?? '/tmp/d2-charscreen';
mkdirSync(SHOTS, { recursive: true });
const mpqs = readdirSync(IN)
  .filter((f) => /^(d2data|d2char|d2exp)\.mpq$/i.test(f))
  .map((f) => join(IN, f));
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const VIEWS = [
  { name: '900x800', w: 900, h: 800, mobile: false },
  { name: '844x390', w: 844, h: 390, mobile: true },
  { name: '390x844', w: 390, h: 844, mobile: true },
].filter((v) => !args.get('only') || args.get('only') === v.name);

for (const v of VIEWS) {
  console.log(`\n== ${v.name} ==`);
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, ...(v.mobile ? { isMobile: true, hasTouch: true } : {}) });
  // sous navigateur piloté, le jeu saute l'écran de sélection : on le rend « humain »
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const page = await ctx.newPage();
  const errs = [];
  const reqD2 = [];
  page.on('request', (r) => /\/d2\//.test(r.url()) && reqD2.push(r.url()));
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await page.goto(URL);
  await page.waitForSelector('.d2c', { timeout: 60000 });
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.d2c-card .btn.primary')]);
  await fc.setFiles(mpqs);
  // l'écran D2 de sélection n'apparaît qu'une fois les éléments prêts : on attend `.charselect`, puis on vérifie qu'il est de type D2
  await page.waitForSelector('.charselect', { timeout: 400000 });
  const kind = await page.evaluate(() => ({ d2s: !!document.querySelector('.charselect.d2s'), html: document.documentElement.dataset.d2ui ?? null }));
  check(kind.d2s && kind.html === '1', 'l’écran affiché est l’écran D2 (pas le repli d’origine)', JSON.stringify(kind));
  await page.waitForTimeout(1200);
  const probe = () =>
    page.evaluate(async () => {
      const cs = document.querySelector('.charselect.d2s');
      const stage = cs.querySelector('.d2stage');
      const sr = stage.getBoundingClientRect();
      const vw = innerWidth,
        vh = innerHeight;
      // variables --u-* référencées par la feuille de style de l'écran et définies
      const used = new Set();
      for (const sh of document.styleSheets) {
        let rules;
        try {
          rules = sh.cssRules;
        } catch {
          continue;
        }
        for (const r of rules) if (r.selectorText?.includes('.d2s')) for (const m of r.cssText.matchAll(/var\(--u-([a-z0-9-]+)\)/g)) used.add(m[1]);
      }
      const root = getComputedStyle(document.documentElement);
      const missing = [...used].filter((n) => !root.getPropertyValue(`--u-${n}`).trim());
      // images réellement décodables
      const urls = [...new Set([...cs.querySelectorAll('*')].map((e) => getComputedStyle(e).backgroundImage).filter((b) => b.startsWith('url(')))];
      const broken = [];
      for (const u of urls) {
        const src = u.slice(5, -2);
        const ok = await new Promise((res) => {
          const i = new Image();
          i.onload = () => res(i.naturalWidth > 0);
          i.onerror = () => res(false);
          i.src = src;
        });
        if (!ok) broken.push(src.slice(-24));
      }
      const btns = [...cs.querySelectorAll('.d2b')].map((b) => ({ t: b.textContent.trim(), bg: getComputedStyle(b).backgroundImage !== 'none', r: b.getBoundingClientRect().toJSON() }));
      const off = btns.filter((b) => b.r.left < -1 || b.r.top < -1 || b.r.right > vw + 1 || b.r.bottom > vh + 1).map((b) => b.t);
      const sprites = [...cs.querySelectorAll('.d2-sprite')].map((s) => getComputedStyle(s).backgroundImage !== 'none');
      return {
        missingVars: missing,
        urls: urls.length,
        broken,
        buttons: btns.map((b) => b.t),
        buttonsNoImage: btns.filter((b) => !b.bg).map((b) => b.t),
        offscreen: off,
        sprites: sprites.length,
        spritesNoImage: sprites.filter((x) => !x).length,
        stage: { x: Math.round(sr.left), y: Math.round(sr.top), w: Math.round(sr.width), h: Math.round(sr.height) },
        vw,
        vh,
        rotate: [...document.querySelectorAll('.rotate')].some((e) => getComputedStyle(e).display !== 'none'),
        scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
      };
    });
  const shot = (n) => page.screenshot({ path: join(SHOTS, `${v.name}-${n}.png`) });
  let p = await probe();
  await shot('1-menu');
  check(p.missingVars.length === 0, 'menu : toutes les images D2 de la feuille de style sont définies', p.missingVars.join(','));
  check(p.broken.length === 0 && p.urls >= 1, 'menu : fonds décodables', `${p.urls} image(s), cassées: ${p.broken.join(',')}`);
  check(p.buttonsNoImage.length === 0 && p.buttons.length >= 3, 'menu : boutons avec image D2', p.buttons.join(' | '));
  check(p.stage.x >= -1 && p.stage.y >= -1 && p.stage.x + p.stage.w <= p.vw + 1 && p.stage.y + p.stage.h <= p.vh + 1, 'menu : scène 800×600 entièrement visible', JSON.stringify(p.stage));
  check(!p.rotate, 'menu : pas d’invite de rotation');
  // un joueur → création (aucun personnage)
  await pickFirstMode(page);
  await page.waitForTimeout(1500);
  p = await probe();
  await shot('2-create');
  check(p.sprites >= 8 && p.spritesNoImage === 0, 'création : sprites des 7 classes + feu avec image', `${p.sprites} sprites, sans image: ${p.spritesNoImage}`);
  check(p.broken.length === 0 && p.missingVars.length === 0, 'création : images décodables et définies', `${p.broken} ${p.missingVars}`);
  check(p.stage.x >= -1 && p.stage.y >= -1 && p.stage.x + p.stage.w <= p.vw + 1 && p.stage.y + p.stage.h <= p.vh + 1, 'création : scène entièrement visible', JSON.stringify(p.stage));
  check(p.offscreen.length === 0, 'création : boutons dans l’écran', p.offscreen.join(','));
  // nom + créer → jeu ; puis retour à la sélection par rechargement
  await page.fill('.d2input', 'Cs' + v.name.slice(0, 3));
  await page.click('.d2b.ok');
  await page.waitForFunction(() => window.__arpg, null, { timeout: 400000 });
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('.charselect.d2s', { timeout: 400000 });
  await page.waitForTimeout(1500);
  await pickFirstMode(page);
  await page.waitForTimeout(1500);
  p = await probe();
  await shot('3-list');
  check(p.buttons.includes('OK') || p.buttons.some((t) => /ok/i.test(t)), 'sélection : bouton OK présent', p.buttons.join(' | '));
  check(p.sprites >= 1 && p.spritesNoImage === 0 && p.broken.length === 0, 'sélection : personnage animé et fonds', `${p.sprites} sprites`);
  check(p.stage.x >= -1 && p.stage.y >= -1 && p.stage.x + p.stage.w <= p.vw + 1 && p.stage.y + p.stage.h <= p.vh + 1, 'sélection : scène entièrement visible', JSON.stringify(p.stage));
  check(p.offscreen.length === 0, 'sélection : boutons dans l’écran', p.offscreen.join(','));
  check(reqD2.length === 0, 'aucune requête /d2/ (tout vient des fichiers du joueur)', reqD2.slice(0, 3).join(' '));
  check(errs.length === 0, 'aucune erreur de page', errs.join(' | '));
  await ctx.close();
}
await browser.close();
console.log(fails ? `\n${fails} échec(s)` : '\nOK');
process.exit(fails ? 1 : 0);
