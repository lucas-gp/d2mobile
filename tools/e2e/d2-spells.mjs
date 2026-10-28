/**
 * Captures des sorts en jeu avec les effets de Diablo II (usage privé) : le personnage lance chaque sort demandé sur un groupe de monstres.
 *   node tools/e2e/d2-spells.mjs <dossier de sortie> --class=sorceress --skills=fire_bolt,fire_ball [--url=…] [--wait=350] [--shots=2]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const OUT = process.argv[2];
const args = new Map(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const cls = args.get('class') ?? 'sorceress';
const skills = (args.get('skills') ?? 'fire_bolt').split(',');
const wait = Number(args.get('wait') ?? 350);
const shots = Number(args.get('shots') ?? 2);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.goto(URL);
await page.waitForSelector('.charselect input, .charselect [data-act="modetype"], .charselect [data-act="mode"]', { timeout: 60000 });
// choice of the mode first (lot 271): the first one, the session's default ruleset
if (await page.$('.charselect [data-act="modetype"], .charselect [data-act="mode"]')) await pickFirstMode(page);
await page.waitForSelector('.charselect input', { timeout: 60000 });
await page.fill('.charselect input', 'Sp');
await page.click(`.charselect .card.${cls}`);
await page.click('.charselect .btn.primary');
await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__arpg;
  g.setLevel(90, true);
  g.learnAll(8);
  g.startRun('tristram', 0, 7);
  g.god(true);
  document.querySelectorAll('button').forEach((b) => /compris/i.test(b.textContent ?? '') && b.click());
});
await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(2500);
// réveille le groupe de monstres le plus proche du point de départ
await page.evaluate(() => {
  const a = window.__arpg;
  const w = a.game().world;
  const sp = w.pendingSpawns.map((x) => ({ ...x, def: w.zone.spawns[x.idx] })).sort((p, q) => Math.hypot(p.x - w.player.x, p.y - w.player.y) - Math.hypot(q.x - w.player.x, q.y - w.player.y));
  const t = sp[Math.min(2, sp.length - 1)];
  a.teleport(t.x - 8, t.y);
  a.step(80);
});
await page.waitForTimeout(1500);
for (const sk of skills) {
  const info = await page.evaluate((skill) => {
    const a = window.__arpg;
    const w = a.game().world;
    a.god(true);
    w.player.hp = w.player.hpMax;
    w.player.mana = w.player.manaMax = 9999;
    const ms = w.monsters.filter((m) => !m.dead && !m.isSummon);
    let target = ms.sort((p, q) => Math.hypot(p.x - w.player.x, p.y - w.player.y) - Math.hypot(q.x - w.player.x, q.y - w.player.y))[0];
    if (!target) return { skill, error: 'aucun monstre' };
    // se placer à 6 unités du monstre le plus proche
    const dx = target.x - w.player.x,
      dy = target.y - w.player.y,
      d = Math.hypot(dx, dy) || 1;
    a.teleport(target.x - (dx / d) * 6, target.y - (dy / d) * 6);
    for (const m of w.monsters)
      if (!m.dead && m !== target && Math.hypot(m.x - target.x, m.y - target.y) > 8) {
        m.dead = false;
      }
    w.player.cooldowns = {};
    const ok = w.startCast(skill, target.x, target.y, target.id);
    return { skill, ok, target: target.def.id };
  }, sk);
  for (let i = 0; i < shots; i++) {
    await page.waitForTimeout(i === 0 ? wait : 300);
    await page.screenshot({ path: join(OUT, `${cls}-${sk}-${i}.png`) });
  }
  console.log(JSON.stringify(info));
  await page.waitForTimeout(600);
}
console.log('erreurs', [...new Set(errors)].slice(0, 6));
await browser.close();
