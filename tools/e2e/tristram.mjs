/**
 * Tristram de bout en bout dans le vrai client (critère de fin de phase 1) :
 * ville → menu du point de passage (tap) → Tristram Normal → le bot de jeu nettoie et tue
 * Griswold → portail → retour à Harrogath ; puis fermeture/réouverture de l'onglet en pleine
 * run (reprise à l'identique).
 *   node tools/e2e/tristram.mjs [--url=http://127.0.0.1:5233/]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = join(process.cwd(), 'test-results', 'e2e', 'tristram');
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  if (!sessionStorage.getItem('e2e-init')) {
    localStorage.clear();
    sessionStorage.setItem('e2e-init', '1');
  }
});
await page.goto(URL);
const ready = () => page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 90000 });
await ready();
await page.evaluate(() => window.__arpg.setLevel(10, false));

// menu du point de passage ouvert comme par le joueur, puis tap sur « Tristram — Normal »
await page.evaluate(() => window.__arpg.app.openPanel('waypoint'));
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, '1-point-de-passage.png') });
const btn = await page.evaluate(() => {
  const b = [...document.querySelectorAll('#panels button')].find((x) => /Normal/.test(x.textContent) && !x.disabled);
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
});
check(!!btn, 'menu du point de passage : Tristram Normal disponible');
if (btn) await page.touchscreen.tap(btn[0], btn[1]);
await page.waitForFunction(() => window.__arpg.state().zone === 'tristram', null, { timeout: 30000 }).catch(() => {});
await ready();
check((await page.evaluate(() => window.__arpg.state().zone)) === 'tristram', 'entrée dans Tristram');

// reprise après fermeture de l'onglet en pleine run
await page.evaluate(() => {
  // on marche vers le centre du village : des groupes apparaissent et s'animent
  const g = window.__arpg.game();
  window.__arpg.god(true);
  for (let i = 0; i < 120; i++) {
    g.world.input.moveX = -0.7;
    g.world.input.moveY = -0.7;
    g.step(1);
  }
  g.world.input.moveX = 0;
  g.world.input.moveY = 0;
  g.step(30);
  window.__arpg.god(false);
});
// simulation figée : l'état sauvegardé (y compris par pagehide) est exactement celui mesuré
const before = await page.evaluate(() => {
  window.__arpg.speed(0);
  window.__arpg.app.saveNow();
  return window.__arpg.state();
});
await page.goto(`${URL}${URL.includes('?') ? '&' : '?'}freeze`);
await ready();
const after = await page.evaluate(() => window.__arpg.state());
check(
  after.zone === 'tristram' && before.monsters > 0 && Math.abs(after.x - before.x) < 0.01 && after.monsters === before.monsters && after.tick === before.tick,
  'onglet fermé puis rouvert : la run reprend à l’identique',
  `pos ${before.x.toFixed(2)}→${after.x.toFixed(2)}, monstres ${before.monsters}→${after.monsters}`,
);

// le bot joue la run en accéléré jusqu'au retour en ville
await page.evaluate(() => {
  window.__arpg.bot(true);
  window.__arpg.speed(8);
});
let shots = 0;
const t0 = Date.now();
let done = false;
while (Date.now() - t0 < 6 * 60 * 1000) {
  await page.waitForTimeout(4000);
  const st = await page.evaluate(() => ({ ...window.__arpg.state(), done: window.__arpg.game().character.progression.completions['tristram:0'] ?? 0 }));
  if (shots < 3 && st.zone === 'tristram') await page.screenshot({ path: join(OUT, `2-combat-${shots++}.png`) });
  if (st.done > 0) {
    done = true;
    break;
  }
}
check(done, 'Griswold tué, run terminée');
await page
  .waitForFunction(() => window.__arpg.state().zone === 'harrogath', null, { timeout: 120000 })
  .catch(async () => {
    // diagnostic : pourquoi le personnage n'est pas rentré
    console.log(
      'diag',
      JSON.stringify(
        await page.evaluate(() => {
          const a = window.__arpg.app;
          const g = window.__arpg.game();
          return {
            st: window.__arpg.state(),
            panel: a.panels?.current ?? null,
            paused: a.paused,
            loading: a.loadingZone,
            scale: a.timeScale,
            completeTick: g.world.run?.completeTick,
            tick: g.world.tick,
            dead: g.world.player.dead,
            mode: g.mode,
          };
        }),
      ),
    );
  });
const end = await page.evaluate(() => window.__arpg.state());
await page.screenshot({ path: join(OUT, '3-retour-ville.png') });
check(end.zone === 'harrogath', 'retour à Harrogath par le portail', `niveau ${end.level}, tués ${end.kills}`);
check(errors.length === 0, 'aucune erreur JavaScript', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `${fails} ÉCHEC(S)` : 'TRISTRAM DE BOUT EN BOUT OK');
process.exit(fails ? 1 : 0);
