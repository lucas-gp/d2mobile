/**
 * Éclair / Éclair en chaîne de la Sorcière : l'animation est bien posée et visible (capture + compteur d'éléments de rendu).
 *   node tools/e2e/lightning-fx.mjs [--url=http://127.0.0.1:5233/] [--size=844x390] [--out=/tmp/x] [--dpr=2]
 * Échoue (code 1) si un tir ne produit aucun élément d'éclair actif ou si la console signale une erreur.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const [W, H] = (args.get('size') ?? '844x390').split('x').map(Number);
const OUT = args.get('out');
if (OUT) mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(args.get('dpr') ?? 2), isMobile: W < 900, hasTouch: W < 900 });
await ctx.addInitScript(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'webdriver', { get: () => true });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
await page.goto(`${URL}?class=sorceress`);
await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 180000 });
await page.evaluate(() => {
  const a = window.__arpg;
  a.setLevel(90, true);
  a.learnAll(10);
  a.startRun('tristram', 0, 7);
  a.god(true);
  document.querySelectorAll('button').forEach((b) => /compris|got it/i.test(b.textContent ?? '') && b.click());
});
await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const a = window.__arpg;
  const w = a.game().world;
  const sp = w.pendingSpawns.map((x) => ({ ...x })).sort((p, q) => Math.hypot(p.x - w.player.x, p.y - w.player.y) - Math.hypot(q.x - w.player.x, q.y - w.player.y));
  const t = sp[Math.min(2, sp.length - 1)];
  a.teleport(t.x - 8, t.y);
  a.step(80);
});
await page.waitForTimeout(1200);
let fail = 0;
for (const sk of ['lightning', 'chain_lightning']) {
  const info = await page.evaluate((skill) => {
    const a = window.__arpg;
    const w = a.game().world;
    w.player.hp = w.player.hpMax;
    w.player.mana = w.player.manaMax = 9999;
    const ms = w.monsters.filter((m) => !m.dead && !m.isSummon).sort((p, q) => Math.hypot(p.x - w.player.x, p.y - w.player.y) - Math.hypot(q.x - w.player.x, q.y - w.player.y));
    const target = ms[0];
    if (!target) return { skill, error: 'aucun monstre' };
    const dx = target.x - w.player.x,
      dy = target.y - w.player.y,
      d = Math.hypot(dx, dy) || 1;
    a.teleport(target.x - (dx / d) * 5, target.y - (dy / d) * 5);
    w.player.cooldowns = {};
    window.__lmax = 0;
    const r = a.renderer();
    const iv = setInterval(() => {
      const n = r.lightningStats ? r.lightningStats() : r.beams.length;
      window.__lmax = Math.max(window.__lmax, n);
    }, 16);
    setTimeout(() => clearInterval(iv), 2500);
    return { skill, ok: w.startCast(skill, target.x, target.y, target.id), n: ms.length };
  }, sk);
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(i === 0 ? 380 : 100);
    if (OUT) await page.screenshot({ path: join(OUT, `${sk}-${i}.png`) });
  }
  await page.waitForTimeout(2200);
  const seen = await page.evaluate(() => window.__lmax);
  console.log(JSON.stringify({ ...info, seenElements: seen }));
  if (!info.ok || !(seen > 0)) fail++;
}
console.log('erreurs', [...new Set(errors)].slice(0, 6));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
