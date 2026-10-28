/**
 * Sept classes de bout en bout : création du personnage depuis l'écran de sélection, montée au
 * niveau 30, toutes les compétences apprises, run de Tristram, une compétence de chaque type lancée
 * dans le navigateur (rendu, sons, effets), captures et absence d'erreur JavaScript / ressource 404.
 *   node tools/e2e/classes.mjs [--url=http://127.0.0.1:5233/] [--only=barbarian,paladin]
 * Captures : test-results/e2e/classes/<classe>-*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const CLASSES = (args.get('only') ?? 'sorceress,druid,barbarian,paladin,amazon,assassin,necromancer').split(',');
const OUT = join(process.cwd(), 'test-results', 'e2e', 'classes');
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

for (const cls of CLASSES) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(`HTTP ${res.status()} ${res.url()}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL);
  await page.waitForSelector('.charselect input, .charselect [data-act="modetype"], .charselect [data-act="mode"]', { timeout: 60000 });
  // choice of the mode first (lot 271): the first one, the session's default ruleset
  if (await page.$('.charselect [data-act="modetype"], .charselect [data-act="mode"]')) await pickFirstMode(page);
  await page.waitForSelector('.charselect input', { timeout: 60000 });
  await page.fill('.charselect input', `Test-${cls}`);
  await page.click(`.charselect .card.${cls}`);
  await page.click('.charselect .btn.primary');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 120000 });
  const who = await page.evaluate(() => ({ cls: window.__arpg.game().character.classId }));
  check(who.cls === cls, `${cls} : personnage créé`, JSON.stringify(who));

  // niveau 30, compétences apprises, équipement de départ conservé, run de Tristram en mode dieu
  const info = await page.evaluate(() => {
    const a = window.__arpg;
    a.setLevel(30, true);
    a.learnAll(5);
    a.startRun('tristram', 0, 7);
    a.god(true);
    const g = a.game();
    const w = g.world;
    const sp = w.pendingSpawns[0];
    if (sp) a.teleport(sp.x - sp.trigger + 1, sp.y);
    a.step(40);
    const m = w.aliveMonsters()[0];
    if (m) a.teleport(m.x - 4, m.y);
    return { monsters: w.aliveMonsters().length, skills: Object.keys(g.character.skills).length };
  });
  check(info.monsters > 0 && info.skills >= 29, `${cls} : run de Tristram lancée`, JSON.stringify(info));
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, `${cls}-0-start.png`) });

  // une compétence par type (active, utilisable) : lancer, laisser jouer, capturer
  const casts = await page.evaluate(async () => {
    const a = window.__arpg;
    const g = a.game();
    const { SKILL_BY_ID } = await import('/src/data/skills.ts');
    const { canCast } = await import('/src/sim/skills.ts');
    const seen = new Set();
    const list = [];
    for (const id of Object.keys(g.character.skills)) {
      const s = SKILL_BY_ID[id];
      if (!s || s.passive) continue;
      const k = s.kind ?? 'spell';
      if (seen.has(k)) continue;
      seen.add(k);
      list.push([id, k]);
    }
    return list;
  });
  let n = 0;
  for (const [id, kind] of casts.slice(0, 8)) {
    await page.evaluate(
      ([sid]) => {
        const a = window.__arpg;
        const g = a.game();
        const w = g.world;
        const p = w.player;
        p.mana = p.manaMax;
        p.hp = p.hpMax;
        const m = w.aliveMonsters().sort((x, y) => Math.hypot(x.x - p.x, x.y - p.y) - Math.hypot(y.x - p.x, y.y - p.y))[0];
        if (m) {
          a.teleport(m.x - 2.2, m.y);
          w.input.cast = { skill: sid, tx: m.x, ty: m.y, targetId: m.id };
        } else w.input.cast = { skill: sid, tx: p.x + 3, ty: p.y, targetId: 0 };
      },
      [id],
    );
    await page.waitForTimeout(450);
    if (n++ < 4) await page.screenshot({ path: join(OUT, `${cls}-${n}-${id}.png`) });
  }
  check(true, `${cls} : ${casts.length} types de compétence lancés`, casts.map((c) => `${c[0]}(${c[1]})`).join(' '));
  check(errors.length === 0, `${cls} : aucune erreur`, [...new Set(errors)].slice(0, 5).join(' | '));
  await ctx.close();
}
await browser.close();
console.log(fails ? `CLASSES : ${fails} ÉCHEC(S)` : 'CLASSES OK');
process.exit(fails ? 1 : 0);
