/**
 * Mode « local » (prototype) : le navigateur génère des planches depuis de vrais MPQ (setInputFiles), mesure le temps,
 * la mémoire (RSS du navigateur) et la taille de sortie, puis vérifie que le jeu lit ces planches (repli intact ailleurs).
 *   D2_SPRITES=0 npx vite --host 127.0.0.1 --port 5233   (serveur à part)
 *   node tools/e2e/d2-local.mjs [--in=$D2_PRIVATE_DIR/in] [--ids=paladin,fallen,andariel] [--json=<fichier>] [--game]
 *
 * Phase 2 (couverture graphique complète) :
 *   --full[=all|units,parts,props,fx,grounds,extras]  génère tout (par catégorie : temps, taille, échecs) puis joue une partie courte
 *        (ville, zone de monstres, inventaire) en mode local : 0 requête /d2/, 0 erreur ; --shots=<dossier> écrit les 3 captures
 *   --ref   (serveur vite avec D2_GAME_DIR=<dossier game sans maps/audio>, mode « plain ») : mêmes captures de référence, sans génération
 */
import { chromium } from 'playwright-core';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const FULL = args.has('full');
const REF = args.has('ref');
const IN = args.get('in') ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
let IDS = (args.get('ids') ?? 'paladin,fallen,andariel').split(',');
const mpqs = readdirSync(IN)
  .filter((f) => f.toLowerCase().endsWith('.mpq'))
  .map((f) => join(IN, f));
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};

/** RSS (Mo) cumulé des processus du navigateur de test (chemin PLAYWRIGHT_BROWSERS_PATH) : le Worker est dans le processus de rendu */
function rssMB() {
  try {
    const out = execSync('ps -eo rss,args --no-headers', { encoding: 'utf8' });
    let sum = 0;
    for (const l of out.split('\n')) if (l.includes('chrom')) sum += Number(l.trim().split(/\s+/)[0]);
    return sum / 1024;
  } catch {
    return 0;
  }
}

/** Scénario court : ville → zone avec monstres (seed fixe, joueur posé près d'un groupe) → inventaire ouvert ; captures optionnelles */
async function scenario(page, label, { local, shots }) {
  const std = new Set();
  const d2req = [];
  const errs = [];
  const on = (rq) => {
    const u = rq.url();
    if (u.includes('/d2/')) d2req.push(u.split('/d2/')[1]);
    else if (u.includes('/sprites/hi/') || u.includes('/sprites/lo/'))
      std.add(
        u
          .split('/')
          .pop()
          .replace(/(-s)?(-\d+)?\.(json|png)$/, ''),
      );
  };
  const onErr = (m) => (m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource|GPU stall|swiftshader|WebGL/i.test(m.text()) && errs.push(m.text().slice(0, 200));
  const onPage = (e) => errs.push(e.message.slice(0, 200));
  await page.goto(URL);
  await page.evaluate((f) => {
    const keep = localStorage.getItem('d2m.d2pass');
    localStorage.clear();
    if (keep) localStorage.setItem('d2m.d2pass', keep);
    if (f) localStorage.setItem('d2m.d2local', '1');
    localStorage.setItem('d2m.d2localMaps', '0');
  }, local);
  page.on('request', on);
  page.on('console', onErr);
  page.on('pageerror', onPage);
  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForFunction(() => window.__arpg, null, { timeout: 240000 });
  if (await page.$('.charselect input')) {
    await page.fill('.charselect input', 'D2-local');
    await page.click('.charselect .card.barbarian');
    await page.click('.charselect .btn.primary');
  }
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 240000 });
  const loadMs = Date.now() - t0;
  const hideTip = () => page.evaluate(() => document.querySelectorAll('button').forEach((b) => /compris|got it/i.test(b.textContent ?? '') && b.click()));
  await page.waitForTimeout(1500);
  await hideTip();
  await page.waitForTimeout(500);
  const shot = (n) => shots && page.screenshot({ path: join(shots, `${label}-${n}.png`) });
  await shot('1-ville');
  await page.evaluate(() => {
    const a = window.__arpg;
    a.setLevel(30, true);
    a.startRun('tristram', 0, 7);
    a.god(true);
    const w = a.game().world;
    const sp = w.pendingSpawns.map((x) => ({ ...x, def: w.zone.spawns[x.idx] })).sort((p, q) => Math.hypot(p.x - w.player.x, p.y - w.player.y) - Math.hypot(q.x - w.player.x, q.y - w.player.y));
    const t = sp[Math.min(3, sp.length - 1)];
    if (t) a.teleport(t.x - 3, t.y);
    a.giveItem('long_sword', { ilvl: 40 });
    a.step(60);
  });
  await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 240000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await hideTip();
  await page.waitForTimeout(300);
  await shot('2-zone');
  const monsters = await page.evaluate(() => [
    ...new Set(
      window.__arpg
        .game()
        .world.monsters.filter((m) => !m.dead)
        .map((m) => m.def.id),
    ),
  ]);
  await page.keyboard.press('i');
  await page.waitForTimeout(1200);
  await shot('3-inventaire');
  page.off('request', on);
  page.off('console', onErr);
  page.off('pageerror', onPage);
  return { std, d2req, errs: [...new Set(errs)], loadMs, monsters };
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
await page.goto(URL);
if (REF) {
  // référence : serveur « plain » sans maps ni audio ; on ne génère rien
  const r = await scenario(page, 'ref', { local: false, shots: args.get('shots') });
  console.log(
    `ref : chargement ${r.loadMs} ms ; ${r.d2req.length} requêtes /d2/ (${new Set(r.d2req.map((u) => u.split('/')[0])).size} dossiers) ; ${r.std.size} planches d'origine : ${[...r.std].join(',')}`,
  );
  console.log(`monstres : ${r.monsters.join(',')}`);
  check(r.errs.length === 0, 'aucune erreur', r.errs.slice(0, 4).join(' | '));
  await browser.close();
  process.exit(fails ? 1 : 0);
}
await page.evaluate(() => localStorage.clear());
await page.evaluate(async () => {
  const c = await caches.keys();
  for (const k of c) if (k.includes('d2-local')) await caches.delete(k);
});
await page.evaluate(() => {
  const i = document.createElement('input');
  i.type = 'file';
  i.multiple = true;
  i.id = 'mpq';
  document.body.append(i);
});
await page.setInputFiles('#mpq', mpqs);
if (FULL) IDS = (args.get('full') && args.get('full') !== 'true' ? args.get('full') : 'all').split(',');
else if (IDS[0] === 'all') IDS = await page.evaluate(async () => (await import('/tools/d2import/browser.ts')).SHEET_IDS);
let cat = null;
if (FULL) cat = await page.evaluate(async () => (await import('/src/platform/d2local.ts')).localCatalog([...document.getElementById('mpq').files]));
const base = rssMB();
let peak = base;
const timer = setInterval(() => (peak = Math.max(peak, rssMB())), 100);
const t0 = Date.now();
const res = await page.evaluate(async (ids) => {
  const { generateLocal } = await import('/src/platform/d2local.ts');
  const files = [...document.getElementById('mpq').files];
  return generateLocal(files, ids);
}, IDS);
const wall = Date.now() - t0;
clearInterval(timer);
peak = Math.max(peak, rssMB());
console.log(`ouverture des archives : ${res.openMs} ms ; total ${wall} ms ; RSS de base ${base.toFixed(0)} Mo, pic ${peak.toFixed(0)} Mo (+${(peak - base).toFixed(0)} Mo)`);
let totalBytes = 0;
const byCat = new Map();
const catOf = (id) => (cat ? (Object.entries(cat).find(([, l]) => l.includes(id))?.[0] ?? 'autre') : 'planches');
for (const r of res.reports) {
  totalBytes += r.bytes;
  if (FULL) {
    const c = byCat.get(catOf(r.id)) ?? { n: 0, ok: 0, ms: 0, bytes: 0, files: 0, failed: [] };
    c.n++;
    c.ms += r.ms;
    c.bytes += r.bytes;
    c.files += r.files;
    if (r.ok) c.ok++;
    else c.failed.push(`${r.id} (${r.error})`);
    byCat.set(catOf(r.id), c);
  } else check(r.ok, `${r.id}`, `${r.ms} ms, ${r.files} fichiers, ${(r.bytes / 1048576).toFixed(2)} Mo${r.error ? ` — ${r.error}` : ''}`);
}
if (FULL) {
  for (const [k, c] of byCat) {
    console.log(
      `  ${k.padEnd(8)} ${String(c.ok).padStart(4)}/${String(c.n).padEnd(4)} ${(c.ms / 1000).toFixed(1).padStart(7)} s ${(c.bytes / 1048576).toFixed(1).padStart(7)} Mo ${String(c.files).padStart(6)} fichiers`,
    );
    if (c.failed.length) console.log(`     échecs : ${c.failed.slice(0, 12).join(' ; ')}${c.failed.length > 12 ? ` … (+${c.failed.length - 12})` : ''}`);
  }
  const mf = await page.evaluate(async () => {
    const r = await (await caches.open('d2m-d2-local')).match(new URL('d2-local/manifest.json', new URL('./', location.href)).href);
    const m = await r.json();
    return { sheets: Object.keys(m.sheets).length, tiles: Object.keys(m.tiles).length };
  });
  console.log(`manifeste local : ${mf.sheets} planches, ${mf.tiles} sols`);
}
const quota = await page.evaluate(async () => (await navigator.storage.estimate()).usage);
console.log(`sortie : ${(totalBytes / 1048576).toFixed(2)} Mo ; usage stockage du navigateur ${(quota / 1048576).toFixed(1)} Mo`);
if (args.get('json')) writeFileSync(args.get('json'), JSON.stringify({ openMs: res.openMs, wall, base, peak, reports: res.reports, totalBytes }, null, 1));

if (FULL) {
  const r = await scenario(page, 'local', { local: true, shots: args.get('shots') });
  console.log(`local : chargement ${r.loadMs} ms ; ${r.d2req.length} requêtes /d2/ ; ${r.std.size} planches d'origine encore demandées : ${[...r.std].join(',')}`);
  console.log(`monstres : ${r.monsters.join(',')}`);
  check(r.d2req.length === 0, 'mode local : 0 requête /d2/', r.d2req.slice(0, 5).join(','));
  check(r.errs.length === 0, 'mode local : 0 erreur', r.errs.slice(0, 5).join(' | '));
}
if (args.has('game')) {
  // le jeu lit les planches générées quand le mode local est activé ; sans le réglage (défaut) ou pour les autres planches, sprites d'origine
  const play = async (flag) => {
    const std = new Set();
    let d2req = 0;
    const on = (rq) => {
      const u = rq.url();
      if (u.includes('/d2/')) d2req++;
      else if (u.includes('/sprites/hi/') || u.includes('/sprites/lo/'))
        std.add(
          u
            .split('/')
            .pop()
            .replace(/(-s)?(-\d+)?\.(json|png)$/, ''),
        );
    };
    await page.goto(URL);
    await page.evaluate((f) => {
      localStorage.clear();
      if (f) localStorage.setItem('d2m.d2local', '1');
      localStorage.setItem('d2m.d2localMaps', '0');
    }, flag);
    page.on('request', on);
    await page.goto(URL);
    await page.waitForFunction(() => window.__arpg, null, { timeout: 120000 }).catch(() => {});
    if (await page.$('.charselect input')) {
      await page.fill('.charselect input', 'D2-local');
      await page.click('.charselect .card.paladin');
      await page.click('.charselect .btn.primary');
    }
    await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 180000 });
    await page.evaluate(() => {
      const a = window.__arpg;
      a.setLevel(30, true);
      a.startRun('tristram', 0, 7);
      a.god(true);
      a.step(40);
    });
    await page.waitForTimeout(3000);
    page.off('request', on);
    return { std, d2req };
  };
  const off = await play(false);
  const on = await play(true);
  if (args.get('shot')) await page.screenshot({ path: args.get('shot') });
  const hit = IDS.filter((id) => off.std.has(id));
  const gone = hit.filter((id) => !on.std.has(id));
  console.log(`réglage absent : ${off.std.size} planches d'origine chargées (${[...off.std].join(',')})`);
  console.log(`mode local : ${on.std.size} planches d'origine (${[...on.std].join(',')})`);
  check(hit.length > 0, "défaut : le jeu charge des planches d'origine parmi celles générées", hit.join(','));
  check(gone.length === hit.length, 'local : ces planches ne sont plus chargées depuis /sprites/', `${gone.length}/${hit.length}`);
  check(on.std.size > 0, "local : les autres planches gardent leur sprite d'origine", `${on.std.size} planches`);
  check(on.d2req === 0 && off.d2req === 0, 'aucune requête /d2/');
}
check(errors.length === 0, 'aucune erreur', [...new Set(errors)].slice(0, 4).join(' | '));
await browser.close();
console.log(fails ? `D2-LOCAL : ${fails} ÉCHEC(S)` : 'D2-LOCAL OK');
process.exit(fails ? 1 : 0);
