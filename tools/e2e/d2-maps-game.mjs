/**
 * Cartes DS1 en jeu, mode local contre mode `plain` (sortie du CLI servie par vite) : même zone, même graine, simulation figée, captures comparées.
 *   D2_SPRITES=0 npx vite --host 127.0.0.1 --port 5233 --strictPort          (mode local)
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort                        (mode plain : dossier $D2_PRIVATE_DIR/out/game)
 *   node tools/e2e/d2-maps-game.mjs --shots=<dossier> [--runs=cows,andariel,a1_bloodmoor,a2_sewer1,mephisto,a5_crystal1] [--w=900 --h=800]
 * Mesure : durée de l'écran de chargement à l'entrée de zone (images générées à la demande), repli si la carte manque, écart de pixels.
 */
import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const LOCAL = args.get('local') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const PLAIN = args.get('plain') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const SHOTS = args.get('shots');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const W = Number(args.get('w') ?? 900);
const H = Number(args.get('h') ?? 800);
const MOBILE = args.has('mobile');
const RUNS = (args.get('runs') ?? 'cows,andariel,a1_bloodmoor,a2_sewer1,mephisto,a5_crystal1').split(',');
const IN = join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
const mpqs = readdirSync(IN)
  .filter((f) => f.toLowerCase().endsWith('.mpq'))
  .map((f) => join(IN, f));
mpqs.push(join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'patch', 'Patch_D2.mpq'));
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const T0 = Date.now();
const log = (m) => console.log(`[+${((Date.now() - T0) / 1000).toFixed(1)} s] ${m}`);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(url, local) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, ...(MOBILE ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`[+${((Date.now() - T0) / 1000).toFixed(1)} s] ` + (process.env.STACK ? e.stack.slice(0, 600) : e.message.slice(0, 160))));
  page.on(
    'console',
    (m) =>
      m.type() === 'error' &&
      !/Failed to load resource|GPU stall|swiftshader|WebGL|GroupMarker/i.test(m.text()) &&
      errs.push(`[+${((Date.now() - T0) / 1000).toFixed(1)} s] ` + m.text().slice(0, 160)),
  );
  let scanned = false;
  page.on('pageerror', async (e) => {
    if (scanned || !/addressModeU/.test(e.message)) return;
    scanned = true;
    const info = await page
      .evaluate(() => {
        const out = [];
        const bad = [];
        const walk = (c, path) => {
          for (const ch of c.children ?? []) {
            if (ch.texture && (ch.texture.destroyed || ch.texture.source?.destroyed)) bad.push(ch);
            const t = ch.texture;
            const p = `${path}/${ch.label || ch.constructor.name}`;
            if (t && (t.destroyed || t.source?.destroyed || t.source?.style === null))
              out.push(`${p} tex.destroyed=${t.destroyed} src.destroyed=${t.source?.destroyed} lbl=${t.source?.label ?? ''} ${t.frame ? t.frame.width + 'x' + t.frame.height : ''}`);
            walk(ch, p);
          }
        };
        walk(window.__arpg.renderer().app.stage, 'stage');
        const g = window.__arpg.game();
        const marks = performance
          .getEntriesByType('mark')
          .slice(-10)
          .map((m) => `${m.name}@${(m.startTime / 1000).toFixed(1)}`);
        const bank = window.__arpg.renderer().bank;
        const owners = new Set();
        for (const b of bad.slice(0, 40)) {
          for (const [id, sh] of bank.sheets) for (const f of sh.frames.values()) if (f.tex === b.texture || f.tex?.source === b.texture.source) owners.add(`cur:${id}`);
          for (const d of bank.doomed ?? []) for (const f of d.s.frames.values()) if (f.tex === b.texture || f.tex?.source === b.texture.source) owners.add(`doomed`);
        }
        const cands = [];
        for (const [id, sh] of bank.sheets)
          for (const f of sh.frames.values())
            if (f.tex?.frame && Math.round(f.tex.frame.width) === 41 && Math.round(f.tex.frame.height) === 46) {
              cands.push(id);
              break;
            }
        owners.add(`cands:${cands.slice(0, 8).join(',')}`);
        const mv = window.__arpg.renderer().mapView;
        owners.add(
          `mv:${
            mv
              ? mv.textures
                  .map((t) => `${t.width}x${t.height}${t.destroyed ? 'D' : ''}`)
                  .slice(0, 40)
                  .join(',')
              : 'none'
          }`,
        );
        owners.add(`structs:${mv ? mv.structures.length : -1}`);
        owners.add(`destroyed:${JSON.stringify((window.__destroyed ?? []).filter((d) => d.fr === '41x46'))}`);
        const sp = bad[0];
        const lay = sp ? { z: sp.zIndex, x: Math.round(sp.x), y: Math.round(sp.y), vis: sp.visible, par: sp.parent?.label || sp.parent?.constructor.name, nSib: sp.parent?.children.length } : null;
        return {
          n: out.length,
          owners: [...owners],
          lay,
          first: out.slice(0, 1),
          mode: g.mode,
          zone: g.world.zone.id,
          hasMap: !!g.world.zone.d2Map,
          now: (performance.now() / 1000).toFixed(1),
          marks,
        };
      })
      .catch((x) => ['scan: ' + x.message]);
    errs.push(`[scan @${((Date.now() - T0) / 1000).toFixed(1)} s] ${JSON.stringify(info)}`);
  });
  await page.goto(url);
  await page.evaluate(async (l) => {
    localStorage.clear();
    localStorage.setItem('d2m.lang', 'fr');
    if (l) localStorage.setItem('d2m.d2local', '1');
    for (const k of await caches.keys()) await caches.delete(k);
    try {
      const r = await navigator.storage.getDirectory();
      for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
    } catch {}
    indexedDB.deleteDatabase('d2m-d2local');
  }, local);
  await page.goto(url);
  await page.waitForFunction(() => window.__arpg, null, { timeout: 120000 });
  if (await page.$('.charselect input')) {
    await page.fill('.charselect input', 'Maps');
    await page.click('.charselect .card.barbarian');
    await page.click('.charselect .btn.primary');
  } else if (await page.$('.charselect .btn.primary')) await page.click('.charselect .btn.primary');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 240000 });
  await page.evaluate(() => document.querySelectorAll('button').forEach((b) => /compris|got it/i.test(b.textContent ?? '') && b.click()));
  return { ctx, page, errs };
}

const local = await open(LOCAL, true);
await local.page.evaluate(() => {
  const i = document.createElement('input');
  i.type = 'file';
  i.multiple = true;
  i.id = 'mpq';
  document.body.append(i);
});
await local.page.setInputFiles('#mpq', mpqs);
await local.page.evaluate(async () => {
  await window.__d2local.provideFiles([...document.getElementById('mpq').files], { store: 'session' });
});
if (process.env.NOHOOK) await local.page.evaluate(() => (window.__d2local.onMapData = null));
await local.page.waitForFunction(() => window.__d2local.catalog?.maps?.length, null, { timeout: 120000 });
await local.page.evaluate(() => {
  const b = window.__arpg.renderer().bank;
  window.__destroyed = [];
  const orig = b.destroySheet.bind(b);
  b.destroySheet = (sh, sweep) => {
    const f = [...sh.frames.values()][0]?.tex;
    window.__destroyed.push({
      id: sh.id,
      sweep,
      fr: f ? `${Math.round(f.frame.width)}x${Math.round(f.frame.height)}` : '',
      t: Math.round(performance.now() / 100) / 10,
      st: new Error().stack
        .split('\n')
        .slice(2, 4)
        .map((x) => x.trim().replace(/\(.*\/(.*?)\)/, '($1)'))
        .join(' < '),
    });
    return orig(sh, sweep);
  };
});
const plain = await open(PLAIN, false);

/** attend la zone voulue, l'écran de chargement retiré, et la fin du chargement de la carte (ou son échec) */
const inZone = (page, id) =>
  page.waitForFunction((z) => window.__arpg && window.__arpg.game().world.zone.id === z && !document.querySelector('.loading') && window.__arpg.app.currentWorld === window.__arpg.game().world, id, {
    timeout: 300000,
  });
const settle = async (page, ms = 1500) => {
  await page.evaluate(() => (window.__arpg.speed(0), window.__arpg.god(true)));
  await page.waitForTimeout(ms);
};
const shot = async (page, name) => {
  const p = SHOTS ? join(SHOTS, `${name}.png`) : undefined;
  return page.screenshot({ path: p });
};
const diff = async (page, a, b) =>
  page.evaluate(
    async ([x, y]) => {
      const load = async (b64) => {
        const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(bmp, 0, 0);
        return g.getImageData(0, 0, bmp.width, bmp.height).data;
      };
      const A = await load(x);
      const B = await load(y);
      let n = 0;
      for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 30) n++;
      return { n, total: A.length / 4 };
    },
    [a.toString('base64'), b.toString('base64')],
  );

/* ---- ville : remplacement à chaud par la carte générée ---- */
{
  const t0 = Date.now();
  await local.page.waitForFunction(() => window.__d2local.mapReady('harrogath', 'lo') || window.__d2local.mapReady('harrogath', 'hi'), null, { timeout: 300000 });
  const gen = Date.now() - t0;
  await local.page.waitForTimeout(2500);
  const st = await local.page.evaluate(() => ({ mode: window.__arpg.game().mode, zone: window.__arpg.game().world.zone.id, hasMap: !!window.__arpg.game().world.zone.d2Map }));
  check(st.mode === 'town' && st.hasMap, 'ville : carte générée, ville d’origine remplacée à chaud', `${(gen / 1000).toFixed(1)} s après les fichiers, zone ${st.zone}`);
  await settle(local.page);
  await settle(plain.page);
  const a = await shot(local.page, 'town-local');
  const b = await shot(plain.page, 'town-plain');
  const d = await diff(local.page, a, b);
  check(d.n / d.total < 0.2, 'ville : rendu proche du mode plain', `${((d.n / d.total) * 100).toFixed(2)} % de pixels différents (HUD en cours de préparation, animation, décor posé absent)`);
}

/* ---- zones de farm et de campagne ---- */
// la file de génération d'assets se vide d'abord (entrer en zone pendant les remplacements à chaud est un autre sujet : phase 3)
await local.page.waitForFunction(() => window.__d2local.status.queued + window.__d2local.status.active === 0, null, { timeout: 300000 });
await local.page.waitForTimeout(2000);
await local.page.evaluate(() => window.__arpg.loadCampaign?.('a1').catch(() => 0));
for (const run of RUNS) {
  const campaign = /^a[1-5]_/.test(run);
  const act = campaign ? run.slice(0, 2) : '';
  log(`début ${run}`);
  const rec = { run };
  // plain : tout est déjà là
  if (campaign) await plain.page.evaluate((a) => window.__arpg.loadCampaign?.(a), act);
  await plain.page.evaluate((r) => window.__arpg.startRun(r, 0, 12345), run);
  await inZone(plain.page, run);
  await settle(plain.page);
  const pz = await plain.page.evaluate(() => ({ zone: window.__arpg.game().world.zone.id, hasMap: !!window.__arpg.game().world.zone.d2Map }));
  // local : données puis images à la demande
  const t0 = Date.now();
  if (campaign) await local.page.evaluate((a) => window.__arpg.loadCampaign?.(a), act);
  else {
    await local.page.evaluate(async (r) => {
      const t = window.__arpg.app.renderer.quality.tier;
      await window.__d2local.requestMap(r, { tier: t, prio: 1, data: true });
    }, run);
    await local.page.waitForTimeout(600);
  }
  log(`${run} : données prêtes`);
  const dataMs = Date.now() - t0;
  const t1 = Date.now();
  await local.page.evaluate((r) => window.__arpg.startRun(r, 0, 12345), run);
  await inZone(local.page, run);
  const loadMs = Date.now() - t1;
  log(`${run} : zone chargée`);
  await settle(local.page);
  const lz = await local.page.evaluate(() => ({ zone: window.__arpg.game().world.zone.id, hasMap: !!window.__arpg.game().world.zone.d2Map }));
  const a = await shot(local.page, `${run}-local`);
  const b = await shot(plain.page, `${run}-plain`);
  const d = await diff(local.page, a, b);
  rec.data = dataMs;
  rec.load = loadMs;
  rec.diff = d.n / d.total;
  check(lz.hasMap && pz.hasMap, `${run} : zone sur carte D2`, `données ${(dataMs / 1000).toFixed(1)} s, entrée en zone ${(loadMs / 1000).toFixed(1)} s, écart ${(rec.diff * 100).toFixed(2)} %`);
  await local.page.evaluate(() => window.__arpg.town());
  await plain.page.evaluate(() => window.__arpg.town());
  await local.page.waitForTimeout(500);
}
/* ---- rechargement sans fichiers : les cartes déjà générées viennent du cache, les autres gardent la zone d'origine ---- */
{
  const before = await local.page.evaluate(() => window.__d2local.mapCounts());
  await local.page.reload();
  await local.page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 240000 });
  await local.page.evaluate(() => document.querySelectorAll('button').forEach((b) => /compris|got it/i.test(b.textContent ?? '') && b.click()));
  const st = await local.page.evaluate(() => ({ files: window.__d2local.hasFiles, counts: window.__d2local.mapCounts(), ids: window.__d2local.mapIds().length, phase: window.__d2local.status.phase }));
  check(
    !st.files && st.counts.data === before.data && st.ids >= before.data,
    'rechargement sans fichiers : cartes retrouvées dans le cache',
    `${st.counts.data} cartes préparées (avant : ${before.data}), phase ${st.phase}`,
  );
  const g0 = await local.page.evaluate(() => window.__d2local.status.generated);
  await local.page.evaluate(() => window.__arpg.startRun('cows', 0, 12345));
  await inZone(local.page, 'cows');
  const c = await local.page.evaluate(() => ({ hasMap: !!window.__arpg.game().world.zone.d2Map, loaded: window.__arpg.app.renderer.mapLoaded(), gen: window.__d2local.status.generated }));
  check(c.hasMap && c.loaded && c.gen === g0, 'cows depuis le cache : carte et images affichées, rien régénéré', JSON.stringify(c));
  // effacement : tout disparaît ; la zone se joue alors avec son décor d'origine (images de carte indisponibles : repli, aucune erreur)
  await local.page.evaluate(() => window.__arpg.town());
  await local.page.evaluate(() => window.__d2local.clearGenerated());
  const cl = await local.page.evaluate(async () => ({ counts: window.__d2local.mapCounts(), json: !!(await window.__d2local.readMap('maps/cows.json', 'lo', false)) }));
  check(cl.counts.data === 0 && !cl.json, 'effacer les graphismes générés : cartes effacées', JSON.stringify(cl));
  await local.page.evaluate(() => window.__arpg.startRun('cows', 0, 12345));
  await inZone(local.page, 'cows');
  await local.page.waitForTimeout(1500);
  const fb = await local.page.evaluate(() => ({ mode: window.__arpg.game().mode, mapLoaded: window.__arpg.app.renderer.mapLoaded(), hp: Math.round(window.__arpg.state().hp) }));
  check(fb.mode === 'run' && !fb.mapLoaded && fb.hp > 0, 'carte indisponible (fichiers absents, cache effacé) : repli sur le sol d’origine, zone jouable', JSON.stringify(fb));
}
check(local.errs.length === 0, 'local : aucune erreur console', local.errs.slice(0, 3).join(' | '));
check(plain.errs.length === 0, 'plain : aucune erreur console', plain.errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `D2-MAPS-GAME : ${fails} ÉCHEC(S)` : 'D2-MAPS-GAME OK');
process.exit(fails ? 1 : 0);
