/**
 * Boss de carte dans le client : télégraphes au sol, grande barre de boss, phases, mort, butin au sol, sur mobile (740×360)
 * et PC (1920×1080), trois cartes (feu P1, foudre P2, mort P3). Personnage d'essai niveau 99 (?testchar=1), invulnérable.
 *   node tools/e2e/map-boss-shots.mjs <dossier> [url=http://127.0.0.1:5233/]
 *   (; serveur vite lancé à part)
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const OUT = process.argv[2] ?? 'test-results/map-boss';
const URL = process.argv[3] ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
mkdirSync(OUT, { recursive: true });
const MAPS = [
  ['phlegethon', 1],
  ['horazon_memory', 2],
  ['royal_crypts', 3],
];
const VIEWS = [
  ['mobile', { viewport: { width: 740, height: 360 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['pc', { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }],
];
const report = [];
const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const [view, opts] of VIEWS) {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${view}: ${e.message}`));
    await page.goto(URL);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${URL}?testchar=1`);
    await page.waitForSelector('.charselect', { timeout: 90000 });
    // menu façon D2 : « Un joueur », puis le personnage d'essai (seul de la liste) en double-clic
    await pickFirstMode(page);
    await page.locator('.charselect .d2plate').first().dblclick();
    await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading:not(.hidden)'), null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    // conseils coupés (ils couvrent le haut de l'écran)
    await page.evaluate(() => {
      window.__arpg.game().settings.tips = false;
      for (const e of document.querySelectorAll('.tip-card')) e.remove();
    });
    for (const [zone, tier] of MAPS) {
      const info = await page.evaluate(
        ([zone, tier]) => {
          const a = window.__arpg;
          const g = a.game();
          if (g.mode === 'run') g.enterTown();
          const it = a.giveMap(tier, 'normal', zone);
          const idx = g.character.inventory.findIndex((x) => x && x.uid === it.uid);
          const r = g.startMap({ invIndex: idx }, 77);
          if (!r.ok) return { err: r.reason };
          a.god(true);
          const w = g.world;
          const sp = w.pendingSpawns.find((p) => w.zone.spawns[p.idx]?.runBoss);
          // monstres ordinaires écartés de l'arène (lisibilité des captures)
          w.pendingSpawns = w.pendingSpawns.filter((p) => p === sp || Math.hypot(p.x - sp.x, p.y - sp.y) > 30 || w.zone.spawns[p.idx]?.escort);
          const spot = w.grid.nearestFree(sp.x - 9, sp.y, 6) ?? w.grid.nearestFree(sp.x + 9, sp.y, 6);
          a.teleport(spot.x, spot.y);
          return { ok: true, x: sp.x, y: sp.y };
        },
        [zone, tier],
      );
      if (info.err) {
        report.push(`${view} ${zone} : ${info.err}`);
        continue;
      }
      await page.waitForTimeout(1200);
      // télégraphe : capture dès qu'un marqueur de boss est au sol
      let marks = 0;
      for (let k = 0; k < 40 && !marks; k++) {
        await page.waitForTimeout(250);
        marks = await page.evaluate(() => {
          const w = window.__arpg.game().world;
          const b = w.monsters.find((m) => m.mapBoss && !m.dead);
          if (b) b.hp = b.hpMax;
          return w.areas.filter((a) => !a.dead && (a.kind === 'mb_mark' || a.kind === 'mb_pool' || a.kind === 'mon_firewall')).length;
        });
      }
      await page.screenshot({ path: join(OUT, `${view}-${zone}-1-telegraphe.png`) });
      const s1 = await page.evaluate(() => {
        const w = window.__arpg.game().world;
        const b = w.monsters.find((m) => m.mapBoss && !m.dead);
        const bar = document.querySelector('.target.boss');
        return { boss: b?.name, hp: b && Math.round(b.hpMax), engaged: b?.mapBoss.engaged, bar: !!bar && getComputedStyle(bar).display !== 'none', barText: bar?.textContent };
      });
      report.push(`${view} ${zone} : marqueurs ${marks}, boss ${s1.boss} (${s1.hp} PV), engagé ${s1.engaged}, barre ${s1.bar} « ${s1.barText} »`);
      // phase : passage sous 75 % puis 50 %
      await page.evaluate(() => {
        const b = window.__arpg.game().world.monsters.find((m) => m.mapBoss && !m.dead);
        if (b) b.hp = b.hpMax * 0.48;
      });
      // garde le boss en vie jusqu'à la capture de phase
      await page.waitForTimeout(700);
      await page.screenshot({ path: join(OUT, `${view}-${zone}-2-phase.png`) });
      const s2 = await page.evaluate(() => {
        const b = window.__arpg.game().world.monsters.find((m) => m.mapBoss && !m.dead);
        return { phase: b?.mapBoss.phase, adds: b?.mapBoss.adds.length, wards: b?.mapBoss.wards.length, bar: document.querySelector('.target.boss')?.textContent };
      });
      report.push(`${view} ${zone} : phase ${s2.phase}, renforts ${s2.adds}, gardiens ${s2.wards}, barre « ${s2.bar} »`);
      // combat en phase basse : le boss est maintenu en vie (le personnage d'essai le tuerait en quelques secondes), capture au prochain télégraphe
      let m2 = 0;
      for (let k = 0; k < 40 && !m2; k++) {
        await page.waitForTimeout(200);
        m2 = await page.evaluate(() => {
          const w = window.__arpg.game().world;
          const b = w.monsters.find((m) => m.mapBoss && !m.dead);
          if (b) b.hp = Math.max(b.hp, b.hpMax * 0.4);
          return w.areas.filter((a) => !a.dead && a.owner === b?.id && (a.kind === 'mb_mark' || a.kind === 'mb_pool' || a.kind === 'mon_firewall')).length;
        });
      }
      await page.screenshot({ path: join(OUT, `${view}-${zone}-3-combat.png`) });
      // mort du boss
      await page.evaluate(() => {
        const w = window.__arpg.game().world;
        const b = w.monsters.find((m) => m.mapBoss && !m.dead);
        if (!b) return;
        b.mapBoss.shieldUntil = 0;
        w.killMonster(b, w.player);
      });
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(OUT, `${view}-${zone}-4-mort.png`) });
      await page.waitForTimeout(1800);
      await page.screenshot({ path: join(OUT, `${view}-${zone}-5-butin.png`) });
      const s3 = await page.evaluate(() => {
        const w = window.__arpg.game().world;
        return { dead: !w.monsters.some((m) => m.mapBoss && !m.dead), items: w.items.length, done: w.run?.completed, portal: w.objects.some((o) => o.kind === 'portal' && o.ref === 'town') };
      });
      report.push(`${view} ${zone} : boss mort ${s3.dead}, objets au sol ${s3.items}, run terminée ${s3.done}, portail ${s3.portal}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(report.join('\n'));
console.log('erreurs', errors.slice(0, 8));
