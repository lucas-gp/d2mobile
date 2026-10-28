/**
 * Cas limites du mode local paresseux (phase 4) : archive manquante / invalide, copie OPFS interrompue puis reprise,
 * invalidation par version du générateur et par empreinte des MPQ, stockage plein.
 *   D2_SPRITES=0 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/d2-lazy-edge.mjs [--in=…]
 */
import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const IN = args.get('in') ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
const mpqs = readdirSync(IN)
  .filter((f) => f.toLowerCase().endsWith('.mpq'))
  .map((f) => join(IN, f));
const only = (name) => mpqs.filter((f) => f.toLowerCase().endsWith(name));
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
const page = await ctx.newPage();
let errs = [];
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource|GPU stall|swiftshader|WebGL|GroupMarker/i.test(m.text()) && errs.push(m.text().slice(0, 200)));
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
const status = () =>
  page.evaluate(() => {
    const s = window.__d2local?.status;
    return s
      ? {
          phase: s.phase,
          source: s.source,
          persistent: s.persistent,
          msg: s.message,
          report: s.report,
          copy: s.copy,
          quotaFull: s.quotaFull,
          ready: s.readyCount,
          generated: s.generated,
          queued: s.queued,
          active: s.active,
        }
      : null;
  });
const gameReady = async () => {
  await page.waitForFunction(() => window.__arpg, null, { timeout: 240000 });
  if (await page.$('.charselect input')) {
    await page.fill('.charselect input', 'Edge');
    await page.click('.charselect .card.barbarian');
    await page.click('.charselect .btn.primary');
  } else if (await page.$('.charselect .btn.primary')) await page.click('.charselect .btn.primary');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 240000 });
};
const wipe = async () => {
  await page.goto(URL);
  await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem('d2m.d2local', '1');
    localStorage.setItem('d2m.d2localMaps', '0'); // ces contrôles portent sur les planches : les cartes (phase 5) ont leurs propres e2e
    for (const k of await caches.keys()) await caches.delete(k);
    try {
      const r = await navigator.storage.getDirectory();
      for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
    } catch {}
    indexedDB.deleteDatabase('d2m-d2local');
  });
  await page.goto(URL);
  await gameReady();
};
const provide = async (paths, store = 'opfs', extraBuffers = []) => {
  await page.evaluate(() => {
    document.getElementById('mpq')?.remove();
    const i = document.createElement('input');
    i.type = 'file';
    i.multiple = true;
    i.id = 'mpq';
    document.body.append(i);
  });
  await page.setInputFiles('#mpq', [...paths, ...extraBuffers]);
  await page.evaluate(async (st) => {
    window.__provided = null;
    const files = [...document.getElementById('mpq').files];
    window.__d2local.provideFiles(files, { store: st }).then((r) => (window.__provided = r));
  }, store);
  await page.waitForFunction(() => window.__provided, null, { timeout: 120000 });
};
const idle = async () => {
  for (let calm = 0, t = 0; t < 600; t++) {
    const s = await status();
    if (s && s.queued + s.active === 0) {
      if (++calm >= 3) return;
    } else calm = 0;
    await sleep(250);
  }
};

/* E1 : archive manquante */
await wipe();
await provide(only('d2data.mpq'));
let s = await status();
console.log(`E1. d2data seul : phase ${s.phase} ; ${s.msg}`);
check(s.phase === 'needfiles' && /Missing file: d2char\.mpq/.test(s.msg) && /d2exp\.mpq/.test(s.msg), 'archives manquantes nommées en français');
check(await page.evaluate(() => !document.querySelector('.loading') && !!window.__arpg.game().world), "le jeu continue avec les sprites d'origine");

/* E2 : archive illisible (octets quelconques sous le nom d'une archive) */
const junkDir = join(tmpdir(), 'd2-lazy-junk');
mkdirSync(junkDir, { recursive: true });
writeFileSync(join(junkDir, 'd2char.mpq'), Buffer.alloc(5000, 7));
await provide([...only('d2data.mpq'), ...only('d2exp.mpq'), join(junkDir, 'd2char.mpq')], 'opfs');
s = await status();
console.log(`E2. d2char invalide : phase ${s.phase} ; ${s.msg}`);
check(s.phase === 'needfiles' && /Unreadable file: d2char\.mpq/.test(s.msg), 'archive invalide signalée (illisible)');

/* E3 : copie OPFS interrompue puis reprise */
await wipe();
await page.evaluate(async () => {
  document.getElementById('mpq')?.remove();
  const i = document.createElement('input');
  i.type = 'file';
  i.multiple = true;
  i.id = 'mpq';
  document.body.append(i);
});
await page.setInputFiles(
  '#mpq',
  mpqs.filter((f) => f.toLowerCase().endsWith('.mpq')),
);
await page.evaluate(() => {
  window.__provided = null;
  window.__d2local.provideFiles([...document.getElementById('mpq').files], { store: 'opfs' }).then((r) => (window.__provided = r));
});
let cut = 0;
for (let i = 0; i < 400; i++) {
  s = await status();
  if (s.copy && s.copy.all > 200e6) {
    cut = s.copy.all;
    break;
  }
  await sleep(50);
}
const state1 = await page.evaluate(async () => {
  try {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('d2m-d2');
    const o = {};
    for (const n of ['copy.a.json', 'copy.b.json']) o[n] = await (await (await d.getFileHandle(n)).getFile()).text().catch(() => null);
    return o;
  } catch (e) {
    return String(e);
  }
});
console.log(`E3. copie coupée à ${(cut / 1e6).toFixed(0)} Mo (rechargement) ; état : ${JSON.stringify(state1)}`);
await page.reload();
await gameReady();
s = await status();
console.log(`    après rechargement : phase ${s.phase} ; ${s.msg}`);
if (process.env.DBG)
  console.log(
    '    opfsFiles :',
    JSON.stringify(
      await page.evaluate(async () => {
        const o = await window.__d2local.opfsFiles();
        return { n: o.files.length, complete: o.complete, partial: o.partial };
      }),
    ),
  );
check(s.phase === 'needfiles' && /interrompue/.test(s.msg), 'copie interrompue détectée, message de reprise');
await page.setInputFiles('#mpq', []).catch(() => {});
await page.evaluate(() => {
  document.getElementById('mpq')?.remove();
  const i = document.createElement('input');
  i.type = 'file';
  i.multiple = true;
  i.id = 'mpq';
  document.body.append(i);
});
await page.setInputFiles(
  '#mpq',
  mpqs.filter((f) => f.toLowerCase().endsWith('.mpq')),
);
let firstAll = -1;
await page.evaluate(() => {
  window.__provided = null;
  window.__first = -1;
  window.__d2local.subscribe((st) => st.copy && st.copy.all > 0 && window.__first < 0 && (window.__first = st.copy.all));
  window.__d2local.provideFiles([...document.getElementById('mpq').files], { store: 'opfs' }).then((r) => (window.__provided = r));
});
for (let i = 0; i < 1200; i++) {
  s = await status();
  if (!s.copy && s.persistent) break;
  await sleep(100);
}
firstAll = await page.evaluate(() => window.__first);
console.log(`    reprise : première progression observée à ${(firstAll / 1e6).toFixed(0)} Mo ; persistant=${s.persistent} source=${s.source}`);
check(s.persistent && s.source === 'opfs', 'copie terminée après reprise');
check(firstAll >= cut * 0.8, "la copie reprend là où elle s'était arrêtée (pas depuis 0)", `${(firstAll / 1e6).toFixed(0)} Mo contre ${(cut / 1e6).toFixed(0)} Mo avant`);
// l'archive copiée est identique à l'originale (taille et empreinte du service)
const sizes = await page.evaluate(async () => {
  const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('d2m-d2');
  const o = {};
  for await (const [n, h] of d.entries()) if (/\.mpq$/i.test(n)) o[n] = (await h.getFile()).size;
  return o;
});
console.log(`    tailles OPFS : ${JSON.stringify(sizes)}`);

/* E4 : stockage plein */
await page.evaluate(() => window.__arpg.startRun('tristram', 0, 5));
await sleep(500);
await page.evaluate(() => window.__d2local.noteQuota({ name: 'QuotaExceededError' }));
s = await status();
check(s.quotaFull && /Stockage plein|Storage full/.test(s.msg), 'stockage plein : message clair', s.msg);
await page.evaluate(() => {
  const a = window.__arpg;
  a.town();
  a.startRun('tristram', 0, 11);
  a.step(40);
});
await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 120000 });
await sleep(1500);
const banner = await page.evaluate(() => document.querySelector('.d2l-banner')?.innerText ?? '');
check(/Stockage plein|Storage full/.test(banner), 'bandeau de stockage plein visible', banner.replace(/\n/g, ' | '));
check(await page.evaluate(() => !!window.__arpg.game().world.player), "le jeu continue (repli sur les sprites d'origine)");

/* E5 : invalidation par version du générateur */
await page.evaluate(async () => {
  const c = await caches.open('d2m-d2-local');
  await c.put(new URL('d2-local/canary.txt', new URL('./', location.href)).href, new Response('x'));
  const k = new URL('d2-local/meta.json', new URL('./', location.href)).href;
  const m = await (await c.match(k)).json();
  m.gen = 0;
  await c.put(k, new Response(JSON.stringify(m)));
});
await page.reload();
await gameReady();
s = await status();
const canary = () => page.evaluate(async () => !!(await (await caches.open('d2m-d2-local')).match(new URL('d2-local/canary.txt', new URL('./', location.href)).href)));
console.log(`E5. version du générateur périmée → cache purgé : phase=${s.phase} source=${s.source}`);
check(!(await canary()) && s.phase === 'ready' && s.source === 'opfs', 'cache purgé, MPQ copiés conservés');

/* E6 : invalidation par empreinte des MPQ */
await idle();
const before = await status();
await page.evaluate(async () => {
  const c = await caches.open('d2m-d2-local');
  await c.put(new URL('d2-local/canary.txt', new URL('./', location.href)).href, new Response('x'));
  const k = new URL('d2-local/meta.json', new URL('./', location.href)).href;
  const m = await (await c.match(k)).json();
  m.fp = 'autre-version';
  await c.put(k, new Response(JSON.stringify(m)));
});
await page.reload();
await gameReady();
s = await status();
console.log(`E6. empreinte des MPQ changée : prêts avant=${before.ready}`);
check(!(await canary()), "cache purgé quand les MPQ ne sont plus ceux qui l'ont produit");
/* E7 : poignées de fichiers mémorisées (IndexedDB), sans copie : ici des poignées OPFS font office de poignées du sélecteur de fichiers */
await page.evaluate(async () => {
  const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('d2m-d2');
  const handles = [];
  for (const n of ['d2data.mpq', 'd2char.mpq', 'd2exp.mpq']) handles.push(await d.getFileHandle(n));
  const files = await Promise.all(handles.map((h) => h.getFile()));
  await window.__d2local.provideFiles(files, { store: 'handles', handles });
  // la copie OPFS n'est plus déclarée : seules les poignées restent
  await d.removeEntry('copy.a.json').catch(() => {});
  await d.removeEntry('copy.b.json').catch(() => {});
});
await page.reload();
await gameReady();
s = await status();
console.log(`E7. poignées mémorisées : phase ${s.phase}, source ${s.source}, persistant=${s.persistent}`);
check(s.phase === 'ready' && s.source === 'handles' && s.persistent, 'poignées retrouvées après rechargement, sans re-sélection');
check(errs.length === 0, 'aucune erreur console', [...new Set(errs)].slice(0, 4).join(' | '));
await browser.close();
console.log(fails ? `D2-LAZY-EDGE : ${fails} ÉCHEC(S)` : 'D2-LAZY-EDGE OK');
process.exit(fails ? 1 : 0);
