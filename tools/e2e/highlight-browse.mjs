// Filtre de butin : parcours complet par catégories, sélection multiple, défilement réel (tactile via CDP (Input.dispatchTouchEvent) + molette), captures.
// Usage : URL=http://127.0.0.1:5233/ node tools/e2e/highlight-browse.mjs [900x800,740x360,844x390 (390x844 paysage),1920x1080] [dossier] [--scan]
//   --scan : teste aussi le défilement de tous les conteneurs défilants des autres panneaux (coffre, marchand, compétences, réglages…)
import { chromium } from 'playwright-core';
import { pickFirstMode } from './pick-mode.mjs';
const URL = process.env.E2E_URL || process.env.URL || 'http://127.0.0.1:5233/';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const scan = process.argv.includes('--scan');
const sizes = (args[0] || '900x800,740x360,1920x1080').split(',');
const out = args[1] || 'test-results/e2e/shots';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
const fail = (m) => {
  bad++;
  console.log('FAIL', m);
};
for (const sz of sizes) {
  const [w, h] = sz.split('x').map(Number);
  const touch = w < 1000;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('d2m.lang', 'fr');
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  await page.goto(URL + '?testchar=1');
  await page.waitForSelector('.charselect.d2s', { timeout: 90000 });
  await pickFirstMode(page);
  await page.waitForSelector('.d2plate');
  await page.click('.d2plate:has-text("99")');
  await page.click('.d2b.ok');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 180000 });
  await page.waitForTimeout(800);
  const cdp = await ctx.newCDPSession(page);
  // geste de défilement sur le centre d'un élément : tactile (vrais événements touch) ou molette
  const gesture = async (sel, nth = 0) => {
    const r = await page.evaluate(
      ([s, n]) => {
        const e = document.querySelectorAll(s)[n];
        if (!e) return null;
        const q = e.getBoundingClientRect();
        return { x: q.left + q.width / 2, y: q.top + Math.min(q.height / 2, innerHeight - q.top - 10), h: q.height };
      },
      [sel, nth],
    );
    if (!r) return false;
    if (touch) {
      // vrais événements tactiles (touchstart / touchmove / touchend) : le doigt monte, le contenu défile vers le bas
      const dy = -Math.min(150, r.h * 0.6);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] });
      for (let i = 1; i <= 12; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x, y: r.y + (dy * i) / 12 }] });
        await page.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(r.x, r.y);
      await page.mouse.wheel(0, 300);
    }
    await page.waitForTimeout(400);
    return true;
  };
  const top = (sel, nth = 0) => page.evaluate(([s, n]) => document.querySelectorAll(s)[n]?.scrollTop ?? -1, [sel, nth]);
  const open = async (name, arg) => {
    await page.evaluate(() => window.__arpg.app.openPanel('close'));
    await page.evaluate(([n, a]) => window.__arpg.app.openPanel(n, a), [name, arg]);
    await page.waitForTimeout(500);
  };

  await open('filter');
  // onglet Règles : colonnes défilantes (aperçu)
  for (let i = 0; i < 2; i++) {
    const info = await page.evaluate((n) => {
      const e = document.querySelectorAll('.panel .col.scroll')[n];
      return e ? { over: e.scrollHeight - e.clientHeight } : null;
    }, i);
    if (info && info.over > 8) {
      await gesture('.panel .col.scroll', i);
      const t = await top('.panel .col.scroll', i);
      console.log(sz, 'Règles colonne', i, 'débord', info.over, 'scrollTop', t);
      if (t <= 0) fail(`${sz} onglet Règles colonne ${i} ne défile pas`);
    }
  }
  await page.click('[data-testid="filter-tab-hl"]');
  await page.waitForTimeout(300);

  // liste complète, tous objets : défile (geste réel), pagination
  await page.selectOption('[data-testid="hl-cat"]', 'all');
  await page.waitForTimeout(300);
  const total = await page.evaluate(() => /(\d+) objet/.exec(document.querySelector('[data-testid="hl-summary"]').textContent)?.[1]);
  const rows0 = await page.locator('[data-testid="hl-result"]').count();
  console.log(sz, 'catalogue', total, 'objets ; lignes rendues', rows0);
  if (!(+total > 1000) || rows0 > 120) fail(`${sz} catalogue/pagination ${total}/${rows0}`);
  await gesture('[data-testid="hl-results"]');
  const t1 = await top('[data-testid="hl-results"]');
  console.log(sz, 'liste résultats scrollTop', t1);
  if (t1 <= 0) fail(`${sz} la liste des résultats ne défile pas`);
  await page.click('[data-testid="hl-more"]');
  if ((await page.locator('[data-testid="hl-result"]').count()) <= rows0) fail(`${sz} « Afficher plus » sans effet`);
  const pageScroll = await page.evaluate(() => [scrollX, scrollY, document.documentElement.scrollHeight - innerHeight]);
  if (pageScroll[1] !== 0) fail(`${sz} la page a défilé ${pageScroll}`);

  // catégorie entière : Runes
  await page.selectOption('[data-testid="hl-cat"]', 'rune');
  await page.waitForTimeout(200);
  await page.click('[data-testid="hl-pick"] >> nth=5');
  await page.click('[data-testid="hl-all"]');
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => {
    const f = window.__arpg.game().character.filter.highlight ?? [];
    return {
      n: f.length,
      runes: f.filter((x) => /^base:r\d+$/.test(x.id)).length,
      cyan: f.every((x) => x.color === 0x30e0f0),
      summary: document.querySelector('[data-testid="hl-summary"]').textContent,
      rows: document.querySelectorAll('.hlentry').length,
    };
  });
  console.log(sz, 'après « Tout sélectionner » Runes', JSON.stringify(st));
  if (st.n < 20 || st.runes !== st.n || !st.cyan || st.rows !== st.n) fail(`${sz} sélection de catégorie ${JSON.stringify(st)}`);
  await gesture('[data-testid="hl-list"]');
  console.log(sz, 'ma liste scrollTop', await top('[data-testid="hl-list"]'));
  await page.screenshot({ path: `${out}/hlb-tab-${sz}.png` });
  // visibilité des boutons sans défiler
  const vis = await page.evaluate(() =>
    ['hl-search', 'hl-cat', 'hl-all', 'hl-none', 'hl-recolor', 'hl-clear'].map((t) => {
      const r = document.querySelector(`[data-testid="${t}"]`).getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.width > 0;
    }),
  );
  if (vis.includes(false)) fail(`${sz} boutons hors écran ${vis}`);
  // désélection de la catégorie
  await page.click('[data-testid="hl-none"]');
  if ((await page.evaluate(() => (window.__arpg.game().character.filter.highlight ?? []).length)) !== 0) fail(`${sz} désélection`);
  // sélection puis objet coloré au sol
  await page.selectOption('[data-testid="hl-cat"]', 'rune');
  await page.click('[data-testid="hl-all"]');
  await page.evaluate(() => {
    const g = window.__arpg.game();
    g.setFilter({ preset: 'strict' });
    g.setFilter({ highlight: g.character.filter.highlight.map((x) => ({ ...x, force: true })) });
    const w = g.world;
    const p = w.player;
    w.dropItem({ uid: 'hb1', base: 'r05', quality: 'normal', ilvl: 60, sockets: 0, socketed: [] }, p.x + 0.5, p.y + 1.5, 0.2);
  });
  await page.evaluate(() => window.__arpg.app.openPanel('close'));
  await page.waitForTimeout(1500);
  const col = await page.evaluate(() => [...document.querySelectorAll('.label')].map((e) => `${e.textContent}|${getComputedStyle(e).color}`));
  console.log(sz, 'étiquettes', JSON.stringify(col));
  if (!col.some((c) => c.includes('rgb(48, 224, 240)'))) fail(`${sz} rune non colorée au sol`);
  await page.screenshot({ path: `${out}/hlb-ground-${sz}.png` });

  if (scan) {
    // tous les conteneurs défilants des autres panneaux : un geste doit les faire défiler
    for (const [name, arg] of [['stash'], ['vendor', 'larzuk'], ['skills'], ['settings'], ['inventory'], ['character'], ['cube'], ['maps']]) {
      await open(name, arg);
      const n = await page.evaluate(() =>
        [...document.querySelectorAll('.panel *')]
          .filter((e) => {
            const o = getComputedStyle(e).overflowY;
            return (o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 20 && e.clientHeight > 40;
          })
          .map((e) => (e.className || e.tagName).toString()),
      );
      for (let i = 0; i < n.length; i++) {
        await page.evaluate((k) => {
          const scrollers = [...document.querySelectorAll('.panel *')].filter((e) => {
            const o = getComputedStyle(e).overflowY;
            return (o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 20 && e.clientHeight > 40;
          });
          scrollers[k].setAttribute('data-scan', 'x');
        }, i);
        await gesture('[data-scan="x"]');
        const t = await top('[data-scan="x"]');
        await page.evaluate(() => document.querySelector('[data-scan="x"]')?.removeAttribute('data-scan'));
        console.log(sz, name, n[i], 'scrollTop', t);
        if (t <= 0) fail(`${sz} ${name} « ${n[i]} » ne défile pas`);
      }
    }
  }
  await ctx.close();
}
await b.close();
process.exit(bad ? 1 : 0);
