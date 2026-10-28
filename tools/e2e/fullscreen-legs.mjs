/**
 * Plein écran / redimensionnement : le personnage et le mercenaire gardent TOUTES leurs couches
 * (jambes comprises) à chaque image, pendant et après le changement de taille.
 *   PLAYWRIGHT_BROWSERS_PATH=... node tools/e2e/fullscreen-legs.mjs [--url=http://127.0.0.1:5233/]
 * Captures : test-results/e2e/fullscreen-legs/*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = join(process.cwd(), 'test-results', 'e2e', 'fullscreen-legs');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
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
await page.evaluate(async () => {
  window.__arpg.setLevel(99);
  const { equipTestMerc } = await import('/src/sim/testchar.ts');
  window.__arpg.game().character.gold = 1e7;
  equipTestMerc(window.__arpg.game());
});
await page.evaluate(() => {
  window.__arpg.god(true);
  window.__arpg.startRun('tristram', 0, 3);
});
await ready();
await page.waitForTimeout(1500);
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Compris/i.test(b.textContent.trim()))?.click());

// état des couches : sprites de l'acteur visibles avec une vraie texture
const probe = () =>
  page.evaluate(() => {
    const a = window.__arpg.app;
    const r = a.renderer;
    const w = window.__arpg.game().world;
    const out = { chargement: a.loadingZone === true, qualite: a.qualityName };
    const merc = w.monsters.find((m) => m.pet === 'merc');
    for (const [name, id] of [
      ['joueur', w.player.id],
      ['merc', merc?.id],
    ]) {
      const v = r.actorViews.get(id);
      const ok = (s) => !!s && s.visible && s.texture && s.texture.width > 1 && !s.texture.destroyed;
      out[name] = { corps: ok(v?.body), sheet: !!v?.sheet, parts: [...(v?.parts?.entries() ?? [])].map(([k, s]) => `${k}:${ok(s) ? 1 : 0}`) };
    }
    return out;
  });
const bad = [];
const check = async (label) => {
  const p = await probe();
  const flat = JSON.stringify(p);
  console.log(label, flat);
  if (p.chargement) return; // rechargement en cours : l'image affichée est la dernière complète
  for (const [k, v] of Object.entries(p).filter(([k]) => k === 'joueur' || k === 'merc')) {
    if (!v.corps || !v.sheet || v.parts.some((s) => s.endsWith(':0'))) bad.push(`${label} ${k}`);
  }
};
await check('avant');
await page.screenshot({ path: join(OUT, 'avant.png') });

const sizes = [
  [1280, 720],
  [844, 390],
  [1366, 768],
  [844, 390],
];
let n = 0;
for (const [w, h] of sizes) {
  await page.setViewportSize({ width: w, height: h });
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(150);
    await check(`resize${w}x${h}#${i}`);
    if (i % 3 === 0) await page.screenshot({ path: join(OUT, `r${n++}.png`) });
  }
}
// plein écran réel (peut être refusé sans geste utilisateur : alors ignoré)
const fs = await page.evaluate(() =>
  document.documentElement.requestFullscreen?.().then(
    () => true,
    () => false,
  ),
);
console.log('plein écran :', fs);
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(150);
  await check(`fs#${i}`);
}
await page.screenshot({ path: join(OUT, 'fs.png') });
console.log('erreurs :', errors.length ? errors.join(' | ') : 'aucune');
console.log(bad.length ? `ÉCHEC : ${bad.length} contrôles (${bad.slice(0, 5).join(' ; ')})` : 'OK : couches complètes partout');
await browser.close();
process.exit(bad.length || errors.length ? 1 : 0);
