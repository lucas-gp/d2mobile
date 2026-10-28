/**
 * Temps de lancement d'une carte (génération, monde, planches, scène, barre de progression), personnage d'essai niveau 99.
 *   node tools/e2e/map-load-time.mjs [url=http://127.0.0.1:5233/] [--profile] [--shots=dossier]
 * PLAYWRIGHT_BROWSERS_PATH=<dossier>, serveur vite lancé à part. Rendu logiciel (swiftshader) : les temps GPU sont gonflés,
 * seuls les temps JS (marks) sont assertés, avec un seuil large (MAX_JS_MS) pour ne pas être fragile.
 * La barre doit avancer régulièrement : jamais figée plus de MAX_STALL_MS (hors phase « 100 % » déclarée plus courte que MAX_TAIL_MS).
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const argv = process.argv.slice(2);
const URL = argv.find((a) => a.startsWith('http')) ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const PROFILE = argv.includes('--profile');
const SHOTS = argv.find((a) => a.startsWith('--shots='))?.slice(8);
const MAX_JS_MS = 6000; // large : headless logiciel, machine chargée
const MAX_STALL_MS = 1500;
const MAPS = (
  argv
    .find((a) => a.startsWith('--maps='))
    ?.slice(7)
    .split(',') ?? ['torajan_jungle:1', 'sanatorium:2', 'kyovashad:3', 'bastion_keep:3', 'steppes_daken:4']
).map((m) => m.split(':'));
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let fail = 0;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 740, height: 360 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${URL}?testchar=1${argv.includes('--eager') ? '&eager=1' : ''}`);
  await page.waitForSelector('.charselect', { timeout: 90000 });
  await pickFirstMode(page);
  await page.locator('.charselect .d2plate').first().dblclick();
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading:not(.hidden)'), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.__arpg.game().settings.tips = false;
    for (const e of document.querySelectorAll('.tip-card')) e.remove();
  });
  const CPU = +(argv.find((a) => a.startsWith('--cpu='))?.slice(6) ?? 1);
  if (CPU > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const NET = +(argv.find((a) => a.startsWith('--net='))?.slice(6) ?? 0);
  if (NET) {
    const c = await ctx.newCDPSession(page);
    await c.send('Network.enable');
    await c.send('Network.emulateNetworkConditions', { offline: false, latency: +(argv.find((a) => a.startsWith('--lat='))?.slice(6) ?? 40), downloadThroughput: NET * 1e6, uploadThroughput: 1e6 });
  }
  const cdp = PROFILE ? await ctx.newCDPSession(page) : null;
  if (cdp) await cdp.send('Profiler.enable');
  for (const [zone, tier] of MAPS) {
    await page.evaluate(() => {
      performance.clearMarks();
      window.__lt = [];
      window.__ltObs?.disconnect();
      window.__ltObs = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]);
      });
      window.__ltObs.observe({ entryTypes: ['longtask'] });
      window.__bar = [];
      window.__sl = [];
      clearInterval(window.__barT);
      window.__barT = setInterval(() => {
        const f = document.querySelector('.loading .fill');
        window.__bar.push([Math.round(performance.now()), f ? +(f.style.transform.match(/scaleX\(([\d.e-]+)\)/)?.[1] ?? -1) : null]);
      }, 100);
    });
    if (cdp) await cdp.send('Profiler.start');
    const r = await page.evaluate(
      ([zone, tier]) => {
        const a = window.__arpg,
          g = a.game();
        if (g.mode === 'run') g.enterTown();
        const it = a.giveMap(+tier, 'normal', zone);
        const idx = g.character.inventory.findIndex((x) => x && x.uid === it.uid);
        performance.mark('call:0');
        const res = g.startMap({ invIndex: idx }, 77);
        performance.mark('call:1');
        if (res.ok) a.god(true);
        return res;
      },
      [zone, tier],
    );
    if (!r.ok) {
      console.log(zone, 'refus', r.reason);
      continue;
    }
    await page.waitForFunction(() => performance.getEntriesByName('sync:saved').length > 0, null, { timeout: 120000 });
    // première image jouable : deux rAF après la fin du chargement
    await page.evaluate(
      () =>
        new Promise((res) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              performance.mark('frame:2');
              res(0);
            }),
          ),
        ),
    );
    let top = [];
    if (cdp) {
      const { profile } = await cdp.send('Profiler.stop');
      const self = new Map();
      const byId = new Map(profile.nodes.map((n) => [n.id, n]));
      const dt = profile.timeDeltas;
      const tot = new Map();
      profile.samples.forEach((id, i) => tot.set(id, (tot.get(id) ?? 0) + (dt[i] ?? 0)));
      for (const [id, t] of tot) {
        const n = byId.get(id);
        const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
        self.set(k, (self.get(k) ?? 0) + t);
      }
      top = [...self]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([k, t]) => `${(t / 1000).toFixed(0)}ms ${k}`);
    }
    // planches de l'arrière-plan (monstres lointains, boss) : toutes chargées peu après, et ce que le départ exige l'était déjà
    const startOk = await page.evaluate(() => {
      const r = window.__arpg.renderer(),
        w = window.__arpg.game().world;
      return r.sheetsFor(w, true).every((id) => !r.bank.has(id) || !!r.bank.get(id));
    });
    const bgMs = await page.evaluate(
      () =>
        new Promise((res) => {
          const t0 = performance.now(),
            r = window.__arpg.renderer();
          const tick = () => {
            const w = window.__arpg.game().world;
            if (r.sheetsFor(w).every((id) => !r.bank.has(id) || !!r.bank.get(id))) res(Math.round(performance.now() - t0));
            else if (performance.now() - t0 > 30000) res(-1);
            else setTimeout(tick, 50);
          };
          tick();
        }),
    );
    if (!startOk || bgMs < 0) {
      console.log(`  ECHEC : planches du départ chargées ${startOk}, arrière-plan terminé en ${bgMs} ms`);
      fail++;
    } else console.log(`  planches d'arrière-plan prêtes ${bgMs} ms après la fin du chargement`);
    await page.waitForTimeout(1500);
    const d = await page.evaluate(() => {
      const m = Object.fromEntries(performance.getEntriesByType('mark').map((e) => [e.name, Math.round(e.startTime)]));
      const w = window.__arpg.game().world;
      return { lt: window.__lt, m, sl: window.__sl, bar: window.__bar, mons: w.monsters.length, pend: w.pendingSpawns.length, w: w.zone.width, h: w.zone.height };
    });
    const m = d.m,
      t0 = m['call:0'];
    const rel = (k) => (m[k] === undefined ? null : m[k] - t0);
    const phases = {
      zone: rel('map:zone1') - (rel('map:zone0') ?? 0),
      world: rel('map:world1') - rel('map:zone1'),
      populate: rel('map:populate1') - rel('map:world1'),
      wait: rel('sync:0') - rel('call:1'),
      ids: rel('set:ids') - rel('set:0'),
      sheets: rel('set:sheets') - rel('set:ids'),
      mapview: rel('set:mapview') - rel('set:sheets'),
      ground: rel('set:ground') - rel('set:mapview'),
      props: rel('set:props') - rel('set:ground'),
      rest: rel('set:end') - rel('set:props'),
      after: rel('sync:end') - rel('set:end'),
      mood: rel('sync:mood') - rel('sync:end'),
      save: rel('sync:saved') - rel('sync:mood'),
      frame: rel('frame:2') - rel('sync:saved'),
    };
    const jsTotal = rel('sync:end');
    const lastProg = d.bar.length ? null : null;
    // barre : plus long palier immobile (valeurs échantillonnées)
    let stall = 0,
      since = null,
      prev;
    for (const [t, v] of d.bar) {
      if (v === null) {
        prev = undefined;
        since = null;
        continue;
      }
      if (v !== prev) {
        prev = v;
        since = t;
      }
      stall = Math.max(stall, t - since);
    }
    const tail = rel('sync:end') - rel('sync:prog');
    console.log(
      `${zone} P${tier} ${d.w}x${d.h} monstres ${d.mons}+${d.pend} : total ${jsTotal} ms (barre à 100 % -> fin ${tail} ms), plus long palier de barre ${stall} ms, trame jouable +${phases.frame} ms`,
    );
    if (argv.includes('--sheets')) {
      const sl = d.sl;
      console.log(
        `  planches ${sl.length}, pages ${sl.reduce((a, x) => a + x[4], 0)}, gpu ${(sl.reduce((a, x) => a + x[5], 0) / 1e6).toFixed(0)} Mo, hi ${sl.filter((x) => x[1] === 'hi').length}`,
        'bar',
        JSON.stringify(d.bar.filter((b) => b[1] !== null).map((b) => b[1].toFixed(2))),
      );
      console.log(
        '  plus longues',
        sl
          .map((x) => [x[0], x[3] - x[2], (x[5] / 1e6) | 0])
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .join(' ; '),
      );
    }
    console.log('  longtasks (t rel, ms)', JSON.stringify(d.lt.map(([t, du]) => [t - t0, du]).filter(([t]) => t > -50)));
    console.log('  phases', JSON.stringify(phases));
    if (top.length) console.log('  top', top.join(' | '));
    if (jsTotal > MAX_JS_MS) {
      console.log('  ECHEC : trop long');
      fail++;
    }
    if (stall > MAX_STALL_MS) {
      console.log('  ECHEC : barre figée');
      fail++;
    }
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `${zone}.png`) });
  }
  if (errors.length) {
    console.log('erreurs page :', errors.slice(0, 3));
    fail++;
  }
} finally {
  await browser.close();
}
process.exit(fail ? 1 : 0);
