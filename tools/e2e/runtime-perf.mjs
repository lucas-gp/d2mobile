/* global gc -- exposé par Chromium lancé avec --js-flags=--expose-gc */
/**
 * Profil d'exécution (30 s de jeu, Sorcière 99 d'essai avec le bot) : temps de frame, collectes de mémoire (GC), croissance du tas,
 * nombre d'objets de scène et de nœuds DOM en début et en fin. Serveur de développement requis (import du module testchar).
 *   PLAYWRIGHT_BROWSERS_PATH=... node tools/e2e/runtime-perf.mjs [--url=http://127.0.0.1:5233/] [--secs=30] [--cpu=1]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const SECS = +(args.get('secs') ?? 30);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
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
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Compris/i.test(b.textContent.trim()))?.click());
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
if (+(args.get('cpu') ?? 1) > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +args.get('cpu') });
await page.evaluate(() => window.__arpg.bot(true));
await page.waitForTimeout(3000);
const snap = () =>
  page.evaluate(async () => {
    gc();
    await new Promise((r) => setTimeout(r, 200));
    gc();
    const a = window.__arpg.app;
    const count = (o) => {
      let n = 0;
      const st = [o];
      while (st.length) {
        const c = st.pop();
        n++;
        if (c.children) st.push(...c.children);
      }
      return n;
    };
    const stage = a.renderer?.app?.stage;
    return {
      heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
      dom: document.getElementsByTagName('*').length,
      pixi: stage ? count(stage) : -1,
      monsters: a.game.world.monsters.length,
      drops: a.game.world.drops?.length ?? -1,
    };
  });
const before = await snap();
const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
await page.evaluate(() => {
  window.__fr = [];
  const f = (t) => {
    const L = window.__fr;
    if (L.last) L.push(t - L.last);
    L.last = t;
    window.__fh = requestAnimationFrame(f);
  };
  window.__fr.last = 0;
  requestAnimationFrame(f);
  window.__arpg.app.metrics.frames = 0;
  window.__arpg.app.metrics.renderMsSum = 0;
  window.__arpg.app.metrics.worstFrame = 0;
});
await browser.startTracing(page, { categories: ['devtools.timeline', 'v8', 'disabled-by-default-v8.gc'] });
const hs = [];
for (let s = 0; s < SECS; s += 5) {
  await page.waitForTimeout(5000);
  hs.push(await page.evaluate(() => +(performance.memory.usedJSHeapSize / 1048576).toFixed(1)));
}
const trace = JSON.parse((await browser.stopTracing()).toString());
const fr = await page.evaluate(() => {
  cancelAnimationFrame(window.__fh);
  const a = window.__fr.slice().sort((x, y) => x - y);
  const m = window.__arpg.app.metrics;
  return {
    n: a.length,
    mean: a.reduce((s, x) => s + x, 0) / a.length,
    p50: a[a.length >> 1],
    p95: a[Math.floor(a.length * 0.95)],
    max: a[a.length - 1],
    renderMsMean: m.renderMsSum / Math.max(1, m.frames),
    frames: m.frames,
  };
});
const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
await page.evaluate(() => window.__arpg.bot(false));
const after = await snap();
const ev = trace.traceEvents ?? trace;
const gcs = ev.filter((e) => /^(MinorGC|MajorGC)$/.test(e.name) && e.ph === 'X');
const sum = (f) => gcs.filter(f).reduce((s, e) => s + e.dur, 0) / 1000;
const minor = gcs.filter((e) => /Minor|Scaveng/i.test(e.name)),
  major = gcs.filter((e) => /Major|MarkCompact/i.test(e.name));
const names = {};
gcs.forEach((e) => (names[e.name] = (names[e.name] ?? 0) + 1));
console.log(
  JSON.stringify(
    {
      secs: SECS,
      frames: fr,
      heapMBsamples: hs,
      before,
      after,
      gc: { events: names, minorMs: +sum((e) => /Minor/.test(e.name)).toFixed(1), majorMs: +sum((e) => /Major/.test(e.name)).toFixed(1) },
      cpu: {
        scriptS: +(m1.ScriptDuration - m0.ScriptDuration).toFixed(2),
        taskS: +(m1.TaskDuration - m0.TaskDuration).toFixed(2),
        layoutS: +(m1.LayoutDuration - m0.LayoutDuration).toFixed(2),
        styleS: +(m1.RecalcStyleDuration - m0.RecalcStyleDuration).toFixed(2),
      },
      errors,
    },
    null,
    1,
  ),
);
await browser.close();
