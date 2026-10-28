/** Aide commune aux scripts « Qualité d'image » : navigateur headless (swiftshader), partie d'essai figée, rendu manuel déterministe. */
import { chromium } from 'playwright-core';

export async function launch({ url, w, h, dpr = 1, run = 'tristram', seed = 3, mobile = false }) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile, locale: 'fr-FR' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' || /webgl|shader/i.test(m.text())) errors.push('console ' + m.text().slice(0, 200));
    });
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('d2m.lang', 'fr');
    });
    await page.goto(url);
    const ready = () => page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 180000 });
    await ready();
    await page.evaluate(async () => {
      window.__arpg.setLevel(99);
      const { equipTestMerc } = await import('/src/sim/testchar.ts');
      window.__arpg.game().character.gold = 1e7;
      equipTestMerc(window.__arpg.game());
    });
    await page.evaluate(
      ([r, s]) => {
        window.__arpg.god(true);
        window.__arpg.startRun(r, 0, s);
      },
      [run, seed],
    );
    await ready();
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Compris/i.test(b.textContent.trim()))?.click());
    return { browser, page, errors };
  } catch (e) {
    await browser.close();
    throw e;
  }
}

/** Laisse la partie jouer `ms` (bot actif) puis fige la boucle : le rendu se fait ensuite à la main, identique d'une image à l'autre */
export async function playThenFreeze(page, ms) {
  await page.evaluate(() => window.__arpg.bot(true));
  await page.waitForTimeout(ms);
  await page.evaluate(() => {
    window.__arpg.bot(false);
    window.__arpg.app.paused = true;
  });
}

/** Scène calme pour les captures : le joueur se place à côté du monstre le plus proche (rien ne lance de sort), la caméra est recalée puis la boucle figée */
export async function calmSceneNearMonster(page) {
  await page.evaluate(() => {
    const a = window.__arpg.app,
      w = a.game.world;
    // les groupes n'apparaissent qu'à portée : on va près d'un groupe de la zone et on laisse la simulation les créer
    const sp = w.zone.spawns.filter((s) => !s.runBoss && !s.seal && (s.count ?? 1) >= 3)[1] ?? w.zone.spawns[1] ?? w.zone.spawns[0];
    if (sp) {
      window.__arpg.teleport(sp.x - 3, sp.y - 3);
      window.__arpg.step(20);
    }
  });
  await page.waitForTimeout(2500); // chargement des planches de la zone, la boucle tourne
  return page.evaluate(() => {
    const a = window.__arpg.app,
      w = a.game.world,
      p = w.player;
    const ms = w.aliveMonsters().filter((m) => m.def && !m.def.boss);
    ms.sort((m, n) => Math.hypot(m.x - p.x, m.y - p.y) - Math.hypot(n.x - p.x, n.y - p.y));
    const m = ms[0];
    if (m) {
      p.x = p.px = m.x - 1.6;
      p.y = p.py = m.y - 1.6;
    }
    a.paused = true;
    for (let i = 0; i < 40; i++) a.renderer.render(w, 0, 0.05, [], { shake: 0, damageNumbers: true });
    return { monster: m?.def?.id ?? null, n: ms.length };
  });
}

/** Applique des réglages de qualité d'image comme le panneau Réglages (via applySettings) */
export function setImage(page, o) {
  return page.evaluate((o) => {
    const a = window.__arpg.app;
    const s = a.game.settings;
    s.imageSharpen = o.sharp ?? 0;
    s.imageSmooth = !!o.smooth;
    s.imageMood = o.mood ?? 'normal';
    s.imageScale = o.scale ?? 'normal';
    a.applySettings(s);
  }, o);
}

/** Rend une image synchrone (alpha 0, dt 0), la garde sous `name` dans la page (pixels) et renvoie le PNG du canvas (data URL) */
export function renderFrame(page, name = 'last') {
  return page.evaluate((name) => {
    const a = window.__arpg.app;
    const r = a.renderer,
      st = { ...r.rng };
    Object.assign(r.rng, st);
    r.render(a.game.world, 0, 0, [], { shake: 0, damageNumbers: true });
    Object.assign(r.rng, st);
    const cv = a.renderer.app.canvas;
    const c2 = document.createElement('canvas');
    c2.width = cv.width;
    c2.height = cv.height;
    const g = c2.getContext('2d');
    g.drawImage(cv, 0, 0);
    (window.__snaps ??= {})[name] = g.getImageData(0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png');
  }, name);
}

/** Compare deux images gardées : pixels différents et écart maximal (0..255) */
export function diffSnaps(page, a, b) {
  return page.evaluate(
    ([a, b]) => {
      const x = window.__snaps[a].data,
        y = window.__snaps[b].data;
      let n = 0,
        max = 0,
        sum = 0;
      for (let i = 0; i < x.length; i += 4) {
        const d = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2]));
        if (d) {
          n++;
          sum += d;
          if (d > max) max = d;
        }
      }
      return { diffPx: n, maxDelta: max, meanDelta: n ? +(sum / n).toFixed(2) : 0, total: x.length / 4 };
    },
    [a, b],
  );
}
