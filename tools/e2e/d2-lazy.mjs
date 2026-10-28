/**
 * Génération PARESSEUSE des graphismes D2 dans le navigateur (phases 3 et 4) avec de vrais MPQ ($D2_PRIVATE_DIR/in, jamais dans git).
 *   D2_SPRITES=0 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/d2-lazy.mjs [--in=…] [--shots=<dossier>] [--tier=lo|hi|auto] [--w=900 --h=800] [--store=opfs|session]
 * Scénario : (A) démarrage à froid sans fichiers → jeu jouable avec le repli ; fichiers fournis → copie OPFS + enrichissement à chaud ;
 * zone de monstres ; (B) rechargement SANS re-sélection : tout vient du cache, aucun Worker de génération, 0 requête /d2/.
 */
import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const IN = args.get('in') ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
const SHOTS = args.get('shots');
const TIER = args.get('tier') ?? 'auto';
const STORE = args.get('store') ?? 'opfs';
const W = Number(args.get('w') ?? 900);
const H = Number(args.get('h') ?? 800);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const mpqs = readdirSync(IN)
  .filter((f) => f.toLowerCase().endsWith('.mpq'))
  .map((f) => join(IN, f));
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const MOBILE = args.has('mobile');
const ctx = await browser.newContext({ viewport: { width: W, height: H }, ...(MOBILE ? { isMobile: true, hasTouch: true } : {}) });
const page = await ctx.newPage();
let d2req = [];
let errs = [];
page.on('request', (rq) => rq.url().includes('/d2/') && d2req.push(rq.url()));
page.on(
  'console',
  (m) => (m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource|GPU stall|swiftshader|WebGL|GroupMarker/i.test(m.text()) && errs.push(`[${m.type()}] ${m.text().slice(0, 240)}`),
);
let scanned = false;
page.on('pageerror', async (e) => {
  if (scanned || !/addressModeU/.test(e.message)) return;
  scanned = true;
  const info = await page
    .evaluate(() => {
      const out = [];
      const r = window.__arpg.renderer();
      const walk = (c, path) => {
        for (const ch of c.children ?? []) {
          const t = ch.texture;
          const p = `${path}/${ch.label || ch.constructor.name}`;
          if (t && (t.destroyed || t.source?.destroyed || t.source?._style === null || t.source?.style === null))
            out.push(`${p} tex.destroyed=${t.destroyed} src.destroyed=${t.source?.destroyed} lbl=${t.source?.label ?? ''} ${t.frame ? t.frame.width + 'x' + t.frame.height : ''}`);
          walk(ch, p);
        }
      };
      walk(r.app.stage, 'stage');
      return out.slice(0, 12);
    })
    .catch((x) => ['scan: ' + x.message]);
  errs.push(`[scan] ${JSON.stringify(info)}`);
});
page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message.slice(0, 240)}${process.env.STACK ? '\n' + e.stack : ''}`));

const status = () =>
  page.evaluate(() => {
    const s = window.__d2local?.status;
    return s
      ? {
          phase: s.phase,
          source: s.source,
          persistent: s.persistent,
          queued: s.queued,
          active: s.active,
          generated: s.generated,
          failed: s.failed,
          genMs: s.genMs,
          ready: s.readyCount,
          extras: s.extras,
          copyMs: s.copyMs,
          quotaFull: s.quotaFull,
          copy: s.copy,
          msg: s.message,
          counts: s.counts,
        }
      : null;
  });
const gameReady = async () => {
  await page.waitForFunction(() => window.__arpg, null, { timeout: 240000 });
  if (await page.$('.charselect input')) {
    await page.fill('.charselect input', 'Lazy');
    await page.click('.charselect .card.barbarian');
    await page.click('.charselect .btn.primary');
  } else if (await page.$('.charselect .btn.primary')) await page.click('.charselect .btn.primary');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 240000 });
  await page.evaluate(() => document.querySelectorAll('button').forEach((b) => /compris|got it/i.test(b.textContent ?? '') && b.click()));
};
const shot = (n) => SHOTS && page.screenshot({ path: join(SHOTS, `${n}.png`) });
/** attend que la file de génération soit vide ; renvoie la durée */
const idle = async (timeout = 600000) => {
  const t0 = Date.now();
  let calm = 0;
  while (Date.now() - t0 < timeout) {
    const s = await status();
    if (s && s.queued + s.active === 0) {
      if (++calm >= 3) return Date.now() - t0;
    } else calm = 0;
    await sleep(300);
  }
  return -1;
};
/** moniteur de gel du fil principal : plus long écart entre deux images d'animation */
const startJank = () =>
  page.evaluate(() => {
    window.__jank = { max: 0, n: 0, over100: 0 };
    window.__long = [];
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true });
    } catch {}
    let last = performance.now();
    const f = (t) => {
      const d = t - last;
      last = t;
      window.__jank.n++;
      if (d > window.__jank.max) window.__jank.max = d;
      if (d > 100) window.__jank.over100++;
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
const jank = () => page.evaluate(() => ({ ...window.__jank }));

/* ----------------------------- A : démarrage à froid ----------------------------- */
await page.goto(URL);
await page.evaluate(async (tier) => {
  localStorage.clear();
  localStorage.setItem('d2m.d2local', '1');
  localStorage.setItem('d2m.d2localMaps', '0'); // ces contrôles portent sur les planches : les cartes (phase 5) ont leurs propres e2e
  if (tier !== 'auto') localStorage.setItem('d2m.d2localTier', tier);
  for (const k of await caches.keys()) await caches.delete(k);
  try {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
  } catch {}
  indexedDB.deleteDatabase('d2m-d2local');
}, TIER);
let t0 = Date.now();
await page.goto(URL);
await gameReady();
const coldNoFiles = Date.now() - t0;
console.log(`A1. démarrage sans fichiers : jeu prêt en ${coldNoFiles} ms (sprites d'origine)`);
let s = await status();
check(s && (s.phase === 'needfiles' || s.phase === 'init'), 'sans fichiers : phase needfiles', JSON.stringify(s?.phase));
await startJank();
await page.waitForTimeout(5000);
const jBase = await jank();
console.log(`    référence (sans génération) : ${jBase.n} images en 5 s, plus long écart ${Math.round(jBase.max)} ms, ${jBase.over100} écarts > 100 ms`);
await page.evaluate(() => (window.__jank = { max: 0, n: 0, over100: 0 }));
await shot('A1-sans-fichiers');

// fichiers fournis (<input type=file multiple>)
await page.evaluate(() => {
  const i = document.createElement('input');
  i.type = 'file';
  i.multiple = true;
  i.id = 'mpq';
  document.body.append(i);
});
await page.setInputFiles('#mpq', mpqs);
if (!MOBILE) await page.evaluate(() => (window.__arpg.game().settings.quality = 'high'));
let cdp = null;
if (args.get('profile')) {
  cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await cdp.send('Profiler.start');
}
t0 = Date.now();
await page.evaluate(async (store) => {
  const files = [...document.getElementById('mpq').files];
  window.__provide = window.__d2local.provideFiles(files, { store }).then((r) => (window.__provided = r));
}, STORE);
await page.waitForFunction(() => window.__provided, null, { timeout: 120000 });
const provideMs = Date.now() - t0;
s = await status();
console.log(`A2. fichiers acceptés en ${provideMs} ms ; phase ${s.phase}, source ${s.source}, catalogue ${JSON.stringify(s.counts)}`);
check(s.phase === 'ready' && !!s.counts, 'fichiers valides : prêt avec catalogue');
// enrichissement de la ville à chaud
const townIdle = await idle();
s = await status();
console.log(`A3. ville enrichie à chaud : file vide après ${townIdle} ms ; ${s.generated} assets générés (${s.genMs} ms cumulées), ${s.failed} échecs`);
await page.waitForTimeout(1500);
check(s.extras.length === 6, 'A : interface et icônes générées à la demande (6 lots)', (s.extras ?? []).join(','));
await shot('A3-ville-enrichie');

// section des Réglages (900 × 800)
await page.evaluate(() => window.__arpg.app.openPanel('settings'));
await page.waitForTimeout(600);
await page.evaluate(() => document.querySelector('.setcat[data-cat="advanced"]')?.click());
await page.waitForTimeout(600);
await page.evaluate(() => document.querySelector('[data-opt="d2local"]')?.scrollIntoView());
await page.waitForTimeout(400);
const sec = await page.evaluate(() => document.querySelector('[data-opt="d2local"]')?.innerText ?? '');
check(/Graphismes locaux|Local graphics|Tout générer|Generate everything/.test(sec), 'Réglages : section des graphismes locaux présente', sec.slice(0, 80).replace(/\n/g, ' | '));
await shot('A3b-reglages');
await page.evaluate(() => window.__arpg.app.openPanel('close'));
await page.waitForTimeout(300);

// zone de monstres : planches générées à la demande
t0 = Date.now();
await page.evaluate(() => {
  window.__loadSeen = 0;
  const mo = new MutationObserver(() => {
    if (document.querySelector('.loading') && !window.__loadSeen) window.__loadSeen = performance.now();
  });
  mo.observe(document.body, { childList: true, subtree: true });
  const a = window.__arpg;
  a.setLevel(30, true);
  a.startRun('tristram', 0, 7);
  a.god(true);
});
await page.waitForFunction(() => window.__loadSeen, null, { timeout: 60000 });
await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 240000 });
const zoneLoad = Date.now() - t0;
console.log(`A4. entrée en zone (Tristram) : écran de chargement ${zoneLoad} ms`);
await page.evaluate(() => {
  const a = window.__arpg;
  const w = a.game().world;
  const sp = w.pendingSpawns.map((x) => ({ ...x, def: w.zone.spawns[x.idx] })).sort((p, q) => Math.hypot(p.x - w.player.x, p.y - w.player.y) - Math.hypot(q.x - w.player.x, q.y - w.player.y));
  const t = sp[Math.min(3, sp.length - 1)];
  if (t) a.teleport(t.x - 3, t.y);
  a.giveItem('long_sword', { ilvl: 40 });
  a.step(60);
});
await page.waitForTimeout(800);
await shot('A4-zone-repli');
const zoneIdle = await idle();
s = await status();
console.log(`A5. zone enrichie : file vide ${zoneIdle} ms après l'entrée ; ${s.generated} assets, ${s.failed} échecs, ${s.genMs} ms de calcul`);
await page.waitForTimeout(1500);
await shot('A5-zone-enrichie');
if (cdp) {
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => {
    const n = byId.get(id);
    const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber}`;
    self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
  });
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  console.log('    profil fil principal (temps propre, ms) :');
  for (const [k, v] of top) console.log(`      ${Math.round(v).toString().padStart(6)}  ${k}`);
}
const jA = await jank();
const longs = await page.evaluate(() => ({ long: window.__long.filter((x) => x[1] >= 400), tl: window.__d2local.timeline }));
for (const [st, d] of longs.long) {
  const near = longs.tl
    .filter(([t]) => t >= st - 100 && t <= st + d + 100)
    .map((x) => x[1])
    .slice(0, 3);
  console.log(`    tâche longue ${d} ms à t=${st} ; événements proches : ${near.join(' ; ') || 'aucun'}`);
}
console.log(`    fil principal : ${jA.n} images, plus long écart ${Math.round(jA.max)} ms, ${jA.over100} écarts > 100 ms`);
const missing = await page.evaluate(() => {
  const r = window.__arpg.renderer();
  return r ? r.missingSheetViews(window.__arpg.game().world) : -1;
});
const stor = await page.evaluate(async () => {
  const e = await navigator.storage.estimate();
  return { usage: e.usage, quota: e.quota, persisted: await navigator.storage.persisted() };
});
console.log(`    stockage : ${(stor.usage / 1048576).toFixed(0)} Mo utilisés (copie MPQ + graphismes), quota ${(stor.quota / 1048576 / 1024).toFixed(0)} Go, persist=${stor.persisted}`);
// attendre la fin de la copie OPFS
if (STORE === 'opfs') {
  const c0 = Date.now();
  for (;;) {
    s = await status();
    if (!s.copy && s.persistent) break;
    if (Date.now() - c0 > 300000) break;
    await sleep(500);
  }
  console.log(`A6. copie OPFS : persistante=${s.persistent}, source=${s.source}, copie ${s.copyMs} ms (770 Mo)`);
  check(s.persistent && s.source === 'opfs', 'copie OPFS terminée et persistante', s.msg);
}
if (args.has('all')) {
  // « tout générer maintenant » (tâche de fond, palier du moment) : durée, stockage, échecs
  const tierAll = MOBILE || args.get('tier') === 'lo' ? 'lo' : 'hi';
  const u0 = await page.evaluate(async () => (await navigator.storage.estimate()).usage);
  const est = await page.evaluate((t) => window.__d2local.estimate(t), tierAll);
  const tA = Date.now();
  const n = await page.evaluate((t) => window.__d2local.generateAll(t), tierAll);
  console.log(`ALL. tout générer (${tierAll}) : ${n} assets demandés ; estimation affichée ≈ ${Math.round(est.seconds / 60)} min / ${Math.round(est.bytes / 1e6)} Mo`);
  let last = 0;
  for (;;) {
    const st = await page.evaluate(() => ({ all: window.__d2local.status.all, failed: window.__d2local.status.failed, q: window.__d2local.status.queued + window.__d2local.status.active }));
    if (!st.all.running && st.q === 0) break;
    if (args.get('allmax') && Date.now() - tA > Number(args.get('allmax')) * 1000) {
      await page.evaluate(() => window.__d2local.stopAll());
      await sleep(2000);
      break;
    }
    if (Date.now() - last > 30000) {
      last = Date.now();
      const pr = await page.evaluate(async () => {
        try {
          const o = await window.__d2local.opfsFiles();
          return `opfs ${o.files.length} fichiers complete=${o.complete} partial=${o.partial.length}`;
        } catch (e) {
          return 'opfs ERR ' + e.message;
        }
      });
      console.log(`    … ${st.all.done}/${st.all.total} (${Math.round((Date.now() - tA) / 1000)} s) ${pr}`);
    }
    await sleep(1000);
  }
  const u1 = await page.evaluate(async () => (await navigator.storage.estimate()).usage);
  const stA = await status();
  console.log(`ALL. terminé en ${Math.round((Date.now() - tA) / 1000)} s ; stockage +${((u1 - u0) / 1048576).toFixed(0)} Mo ; échecs ${stA.failed} ; prêts ${stA.ready}`);
  console.log(`    échecs : ${(await page.evaluate(() => [...window.__d2local.failedIds])).join(', ') || 'aucun'}`);
}
check(d2req.length === 0, 'A : 0 requête /d2/', d2req.slice(0, 3).join(','));
check(errs.length === 0, 'A : aucune erreur console', [...new Set(errs)].slice(0, 4).join(' | '));
check(s.failed === 0, 'A : aucune génération en échec', String(s.failed));
const generatedA = s.generated;
const logA = await page.evaluate(() => window.__d2local.genLog);
console.log(
  `    paliers générés en A : hi=${logA.filter((x) => x.includes(':hi:')).length} lo=${logA.filter((x) => x.includes(':lo:')).length} ; sols/décors : ${logA
    .filter((x) => /^(ground|prop)_/.test(x))
    .map((x) => x.split(':').slice(0, 2).join(':'))
    .join(' ')}`,
);
if (MOBILE)
  check(
    logA.every((x) => !x.includes(':hi:')),
    'mobile : palier lo seul généré',
    `hi=${logA.filter((x) => x.includes(':hi:')).length}`,
  );
const mfA = await page.evaluate(async () => {
  const r = await (await caches.open('d2m-d2-local')).match(new URL('d2-local/manifest.json', new URL('./', location.href)).href);
  const m = await r.json();
  return { sheets: Object.keys(m.sheets).length, tiles: Object.keys(m.tiles).length };
});
console.log(`    manifeste en cache : ${JSON.stringify(mfA)}`);
const gpuStats = await page.evaluate(async () => {
  const r = await (await caches.open('d2m-d2-local')).match(new URL('d2-local/manifest.json', new URL('./', location.href)).href);
  const m = await r.json();
  const cat = window.__d2local.catalog;
  const out = {};
  const add = (k, e) => {
    if (!e) return;
    const o = (out[k] ??= { n: 0, hiGpu: 0, hiN: 0, loGpu: 0, loN: 0, hiB: 0, loB: 0 });
    o.n++;
    const hasHi = !e.tiers || e.tiers.includes('hi');
    const hasLo = !e.tiers || e.tiers.includes('lo');
    if (hasHi) ((o.hiGpu += e.hi.gpu), (o.hiB += e.hi.bytes), o.hiN++);
    if (hasLo) ((o.loGpu += e.lo.gpu), (o.loB += e.lo.bytes), o.loN++);
  };
  for (const [id, e] of Object.entries(m.sheets)) add(cat.units.includes(id) ? 'unit' : cat.parts.includes(id) ? 'part' : cat.props.includes(id) ? 'prop' : cat.fx.includes(id) ? 'fx' : 'autre', e);
  for (const [id, e] of Object.entries(m.tiles)) add('ground', e);
  return Object.fromEntries(
    Object.entries(out).map(([k, o]) => [
      k,
      {
        n: o.n,
        hiMoGpu: o.hiN ? +(o.hiGpu / o.hiN / 1048576).toFixed(2) : null,
        loMoGpu: o.loN ? +(o.loGpu / o.loN / 1048576).toFixed(2) : null,
        hiKoPng: o.hiN ? Math.round(o.hiB / o.hiN / 1024) : null,
        loKoPng: o.loN ? Math.round(o.loB / o.loN / 1024) : null,
      },
    ]),
  );
});
console.log(`    coût moyen par asset (Mo GPU / Ko PNG) : ${JSON.stringify(gpuStats)}`);

/* ----------------------------- B : rechargement ----------------------------- */
d2req = [];
errs = [];
await page.evaluate(() => window.__arpg?.app?.saveNow?.());
t0 = Date.now();
await page.reload();
await gameReady();
const reloadMs = Date.now() - t0;
await startJank();
s = await status();
console.log(`B1. rechargement : jeu prêt en ${reloadMs} ms ; phase ${s.phase}, source ${s.source}, persistant=${s.persistent}, prêts en cache ${s.ready} ; ${s.msg}`);
if (s.phase !== 'ready') {
  const dg = await page.evaluate(async () => {
    const out = {};
    try {
      const r = await navigator.storage.getDirectory();
      out.root = [];
      for await (const [n] of r.entries()) out.root.push(n);
      const d = await r.getDirectoryHandle('d2m-d2');
      out.dir = [];
      for await (const [n, h] of d.entries()) out.dir.push(`${n}:${(await h.getFile()).size}`);
    } catch (e) {
      out.err = `${e.name}: ${e.message}`;
    }
    const o = await window.__d2local.opfsFiles().catch((e) => ({ err: e.message }));
    out.opfsFiles = { n: o.files?.length, complete: o.complete, partial: o.partial, err: o.err };
    out.est = await navigator.storage.estimate().then((e) => ({ usage: e.usage, quota: e.quota }));
    return out;
  });
  console.log('    diagnostic OPFS :', JSON.stringify(dg));
}
check(STORE !== 'opfs' || (s.phase === 'ready' && s.source === 'opfs'), 'B : fichiers retrouvés sans re-sélection (OPFS)', `${s.phase}/${s.source}`);
// mêmes zones : ville puis Tristram
await page.evaluate(() => {
  const a = window.__arpg;
  a.setLevel(30, true);
  a.startRun('tristram', 0, 7);
  a.god(true);
});
await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 240000 });
await page.evaluate(() => {
  const a = window.__arpg;
  const w = a.game().world;
  const sp = w.pendingSpawns.map((x) => ({ ...x, def: w.zone.spawns[x.idx] })).sort((p, q) => Math.hypot(p.x - w.player.x, p.y - w.player.y) - Math.hypot(q.x - w.player.x, q.y - w.player.y));
  const t = sp[Math.min(3, sp.length - 1)];
  if (t) a.teleport(t.x - 3, t.y);
  a.step(60);
});
await page.waitForTimeout(3000);
await shot('B2-zone-rechargee');
s = await status();
const jB = await jank();
console.log(`    générés après rechargement : ${(await page.evaluate(() => window.__d2local.genLog)).join(' ')}`);
console.log(`B2. après rechargement : ${s.generated} assets générés dans cette session, file ${s.queued}+${s.active}; écart max ${Math.round(jB.max)} ms`);
check(d2req.length === 0, 'B : 0 requête /d2/', d2req.slice(0, 3).join(','));
check(errs.length === 0, 'B : aucune erreur console', [...new Set(errs)].slice(0, 4).join(' | '));
check(s.generated <= Math.max(3, Math.round(generatedA * 0.05)), 'B : (presque) tout vient du cache', `${s.generated} générés contre ${generatedA} avant`);
check(missing === 0, 'A : aucun monstre sans planche', String(missing));
await browser.close();
console.log(fails ? `D2-LAZY : ${fails} ÉCHEC(S)` : 'D2-LAZY OK');
process.exit(fails ? 1 : 0);
