/**
 * Captures en jeu pour contrôler les sprites et les sols importés de Diablo II (usage privé, sorties hors dépôt) :
 * la ville, puis chaque run demandée (le joueur est posé près d'un groupe de monstres, ou du boss).
 *   node tools/e2e/d2-shots.mjs <dossier de sortie> [--url=http://127.0.0.1:5233/] [--class=barbarian] [--runs=tristram,tombs,…]
 * Le serveur vite est lancé à part avec D2_OUTPUT_DIR.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const OUT = process.argv[2];
if (!OUT) throw new Error('dossier de sortie manquant');
const args = new Map(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const runs = (args.get('runs') ?? 'tristram,tombs,countess,andariel,mephisto,cows,chaos,baal').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 160)));
await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.goto(URL);
await page.waitForSelector('.charselect input, .charselect [data-act="modetype"], .charselect [data-act="mode"]', { timeout: 60000 });
// choice of the mode first (lot 271): the first one, the session's default ruleset
if (await page.$('.charselect [data-act="modetype"], .charselect [data-act="mode"]')) await pickFirstMode(page);
await page.waitForSelector('.charselect input', { timeout: 60000 });
await page.fill('.charselect input', 'Ctl');
await page.click(`.charselect .card.${args.get('class') ?? 'barbarian'}`);
await page.click('.charselect .btn.primary');
await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 120000 });
await page.waitForTimeout(800);
const hideTip = () => page.evaluate(() => document.querySelectorAll('button').forEach((b) => /compris/i.test(b.textContent ?? '') && b.click()));
await hideTip();
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, 'ville.png') });
for (const run of runs) {
  const info = await page.evaluate((r) => {
    const a = window.__arpg;
    a.setLevel(90, true);
    const ok = a.startRun(r, 0, 7);
    a.god(true);
    const w = a.game().world;
    const sp = w.pendingSpawns.map((x) => ({ ...x, def: w.zone.spawns[x.idx] })).sort((p, q) => Math.hypot(p.x - w.player.x, p.y - w.player.y) - Math.hypot(q.x - w.player.x, q.y - w.player.y));
    const t = sp.find((x) => x.def.rank === 'boss') ?? sp[Math.min(3, sp.length - 1)];
    if (t) a.teleport(t.x - 3, t.y);
    a.step(60);
    return { ok, zone: w.zone.id, monstres: [...new Set(w.monsters.filter((m) => !m.dead).map((m) => m.def.id))] };
  }, run);
  await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await hideTip();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `run-${run}.png`) });
  console.log(run, JSON.stringify(info));
}
console.log('erreurs', [...new Set(errors)].filter((e) => !/prop_rock_a/.test(e)).slice(0, 8));
await browser.close();
