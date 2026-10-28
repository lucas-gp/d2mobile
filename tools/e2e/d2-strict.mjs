/**
 * Mode local SANS REPLI : le jeu n'affiche que des graphismes fabriqués depuis les MPQ du joueur et les ATTEND (écran de chargement bloquant).
 * Vrais MPQ ($D2_PRIVATE_DIR/in + Patch_D2.mpq, jamais dans git), version publique :
 *   D2_SPRITES=0 D2_PUBLIC=1 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/d2-strict.mjs [--shots=<dossier>] [--w=900 --h=800] [--mobile]
 * Scénario : import → écran de chargement (étapes, temps restant) → ville SANS requête /sprites/ d'unité ou de sol → Tristram → rechargement.
 * Sortie : liste des sprites d'origine encore demandés (planches sans équivalent D2), durées, captures.
 */
import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const IN = args.get('in') ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
const PATCH = join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'patch', 'Patch_D2.mpq');
const SHOTS = args.get('shots');
const W = Number(args.get('w') ?? 900);
const H = Number(args.get('h') ?? 800);
const MOBILE = args.has('mobile');
const OUT = args.get('out');
const CPU = Number(args.get('cpu') ?? 1);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const mpqs = readdirSync(IN)
  .filter((f) => f.toLowerCase().endsWith('.mpq'))
  .map((f) => join(IN, f));
if (existsSync(PATCH) && !args.has('nopatch')) mpqs.push(PATCH);
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { w: W, h: H, mobile: MOBILE };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, ...(MOBILE ? { isMobile: true, hasTouch: true } : {}) });
await ctx.addInitScript(() => {
  // journal de l'écran de chargement : (temps, texte)
  window.__loadLog = [];
  const t0 = performance.now();
  const seen = new Set();
  const tick = () => {
    const el = document.querySelector('.loading');
    const t = el ? el.innerText.replace(/\s+/g, ' ').trim() : '';
    if (t && !seen.has(t)) {
      seen.add(t);
      window.__loadLog.push([Math.round(performance.now() - t0), t]);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  localStorage.setItem('d2m.lang', 'fr');
});
const page = await ctx.newPage();
if (CPU > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: CPU });
const sprites = [];
let errs = [];
page.on('request', (r) => {
  const u = r.url();
  if (/\/sprites\/(hi|lo)\/.*\.(json|png)/.test(u)) sprites.push(u.replace(/^.*\/sprites\//, ''));
});
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|GPU stall|swiftshader|WebGL|GroupMarker/i.test(m.text()) && errs.push(m.text().slice(0, 240)));
page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message.slice(0, 240)}`));
const shot = (n) => SHOTS && page.screenshot({ path: join(SHOTS, `${n}.png`) });
const status = () =>
  page.evaluate(() => {
    const s = window.__d2local?.status;
    return s ? { phase: s.phase, queued: s.queued, active: s.active, generated: s.generated, failed: s.failed, ready: s.readyCount, quota: s.quotaFull, msg: s.message } : null;
  });
const sheetsOf = (list) =>
  [
    ...new Set(
      list.map((u) =>
        u
          .replace(/^(hi|lo)\//, '')
          .replace(/\.(json|png)$/, '')
          .replace(/-\d+$/, '')
          .replace(/-sh$/, ''),
      ),
    ),
  ].sort();

await page.goto(URL);
await page.evaluate(async () => {
  localStorage.clear();
  localStorage.setItem('d2m.lang', 'fr');
  for (const k of await caches.keys()) await caches.delete(k);
  try {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
  } catch {}
  indexedDB.deleteDatabase('d2m-d2local');
});
let t0 = Date.now();
await page.goto(URL);
await page.waitForSelector('.d2c', { timeout: 60000 });
const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.d2c-card .btn.primary')]);
await fc.setFiles(mpqs);
await page.waitForSelector('.d2c', { state: 'detached', timeout: 240000 });
const tImport = Date.now() - t0;
console.log(`import accepté en ${(tImport / 1000).toFixed(1)} s`);
// écran de chargement bloquant : la partie ne démarre qu'une fois tout prêt
await page.waitForFunction(() => !!document.querySelector('.loading') || !!window.__arpg, null, { timeout: 60000 });
const sawLoading = await page.evaluate(() => !!document.querySelector('.loading'));
check(sawLoading, "écran de chargement affiché après l'import");
await sleep(2500);
await shot('1-chargement-ui');
if (await page.$('.charselect')) {
  // navigator.webdriver : pas d'écran de sélection ; sinon on crée un personnage
}
await page.waitForFunction(() => window.__arpg, null, { timeout: 900000 });
await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 900000 });
const tTown = Date.now() - t0;
report.tTownMs = tTown;
console.log(`ville prête après import en ${(tTown / 1000).toFixed(1)} s`);
await page.evaluate(() => document.querySelectorAll('button').forEach((b) => /compris|got it/i.test(b.textContent ?? '') && b.click()));
await sleep(2500);
await shot('2-ville');
let log = await page.evaluate(() => window.__loadLog);
report.loadLog = log;
const labels = log.map((l) => l[1]).join(' | ');
// à l'import, interface et icônes se fabriquent pendant la copie : leurs étapes ne sont visibles que si l'appareil est lent (voir la régénération plus bas)
check(/Carte/.test(labels) && /Temps restant estimé/.test(labels), 'ville : étape Carte et temps restant affichés', '');
console.log(
  '  libellés :',
  log
    .map((l) => `${l[0]}ms ${l[1]}`)
    .slice(0, 40)
    .join('\n    '),
);
const townSprites = sheetsOf(sprites);
report.townSprites = townSprites;
console.log(`  requêtes /sprites/ (ville) : ${sprites.length} fichiers, ${townSprites.length} planches : ${townSprites.join(', ') || '(aucune)'}`);
const q0 = await status();
console.log('  service :', JSON.stringify(q0));

// ----- ce que le rendu utilise : jamais de sprite d'origine pour une unité / un sol que D2 sait produire
const orig = await page.evaluate(() => {
  const b = window.__arpg.renderer().bank;
  return { used: [...b.originalUsed.entries()], loaded: b.loadedIds(), imported: b.isImported ? true : false };
});
report.originalUsed = orig.used;
console.log("  sprites d'origine servis par la banque :", JSON.stringify(orig.used));
const bad = townSprites.filter((s) => /^(ground_|dec_)|^(barbarian|sorceress|paladin|necromancer|amazon|assassin|druid)/.test(s));
check(bad.length === 0, "ville : aucun sprite d'origine de joueur, de sol ou de décor D2 demandé", bad.join(', '));

// ----- Tristram : la run attend les cartes (porte de départ) puis l'écran de chargement bloquant
sprites.length = 0;
await page.evaluate(() => (window.__loadLog = []));
const tr0 = Date.now();
let started = false;
let waited = 0;
for (let i = 0; i < 400 && !started; i++) {
  started = await page.evaluate(() => window.__arpg.startRun('tristram', 0, 11));
  if (!started) {
    waited++;
    await sleep(1000);
  }
}
check(started, 'Tristram : la run démarre (porte de départ : cartes préparées)', `attente ${waited} s`);
report.runGateWaitS = waited;
await sleep(500);
await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 900000 });
const tTris = Date.now() - tr0;
report.tTristramMs = tTris;
console.log(`Tristram prête en ${(tTris / 1000).toFixed(1)} s (dont attente de porte ${waited} s)`);
await sleep(4000);
await shot('3-tristram');
log = await page.evaluate(() => window.__loadLog);
console.log(
  '  libellés Tristram :',
  log
    .map((l) => `${l[0]}ms ${l[1]}`)
    .slice(0, 30)
    .join('\n    '),
);
report.loadLogTristram = log;
const trSprites = sheetsOf(sprites);
report.tristramSprites = trSprites;
console.log(`  requêtes /sprites/ (Tristram) : ${trSprites.length} planches : ${trSprites.join(', ') || '(aucune)'}`);
const st = await page.evaluate(() => {
  const r = window.__arpg.renderer();
  const w = window.__arpg.game().world;
  const views = [...r.actorViews.values()];
  const noSheet = w.monsters.filter((m) => !m.dead && !m.isSummon && !r.bank.get(r.bank.sheetOf(m.def.id, m.def.sprite))).map((m) => m.def.id);
  return {
    zone: w.zone.id,
    monsters: w.aliveMonsters().length,
    views: views.length,
    withSheet: views.filter((v) => v.sheet).length,
    noSheet: [...new Set(noSheet)],
    used: [...r.bank.originalUsed.entries()],
  };
});
report.tristram = st;
console.log('  Tristram :', JSON.stringify(st));
check(st.zone === 'tristram' || /tristram/.test(st.zone), 'Tristram : zone atteinte', st.zone);
check(st.noSheet.length === 0, 'Tristram : tous les monstres vivants ont leur planche D2 au départ', st.noSheet.join(', '));
const badT = trSprites.filter((s) => /^(ground_|dec_)/.test(s));
check(badT.length === 0, "Tristram : aucun sol / décor d'origine demandé", badT.join(', '));

// ----- rechargement : tout vient du cache, pas de re-sélection, aucun sprite d'origine
sprites.length = 0;
await page.evaluate(() => (window.__loadLog = []));
const rl0 = Date.now();
await page.reload();
await page.waitForFunction(() => window.__arpg, null, { timeout: 900000 });
await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 900000 });
const tReload = Date.now() - rl0;
report.tReloadMs = tReload;
const sawChoice = await page.$('.d2c');
check(!sawChoice, 'rechargement : direct dans le jeu, sans écran de choix', `${(tReload / 1000).toFixed(1)} s`);
await sleep(2500);
await shot('4-rechargement');
const rsp = sheetsOf(sprites);
report.reloadSprites = rsp;
console.log(`  rechargement : ${rsp.length} planches d'origine demandées : ${rsp.join(', ') || '(aucune)'}`);
const q1 = await status();
console.log('  service :', JSON.stringify(q1));

// ----- graphismes générés perdus (stockage libéré par le navigateur) mais fichiers présents : tout repart, étapes affichées
await page.evaluate(async () => {
  for (const k of ['d2m-d2-local', 'd2m-d2-audio']) await caches.delete(k);
});
await page.evaluate(() => (window.__loadLog = []));
sprites.length = 0;
const rg0 = Date.now();
await page.reload();
await page.waitForFunction(() => window.__arpg, null, { timeout: 1200000 });
await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 1200000 });
report.tRegenMs = Date.now() - rg0;
const lg = await page.evaluate(() => window.__loadLog);
report.loadLogRegen = lg;
const lbl = lg.map((l) => l[1]).join(' | ');
console.log(`régénération complète sans re-sélection : ${((Date.now() - rg0) / 1000).toFixed(1)} s`);
console.log(
  '  libellés :',
  lg
    .map((l) => `${l[0]}ms ${l[1]}`)
    .slice(0, 60)
    .join('\n    '),
);
check(/Interface/.test(lbl) && /Ic[oô]nes/.test(lbl), 'régénération : étapes Interface et Icônes affichées');
check(/Carte/.test(lbl) && /Équipement/.test(lbl) && /Monstres|Personnages/.test(lbl), 'régénération : étapes Carte, Équipement, Personnages affichées');
check(!(await page.$('.d2c')), 'régénération : aucune re-sélection demandée');
check(sheetsOf(sprites).filter((x) => /^(ground_|dec_)/.test(x)).length === 0, "régénération : aucun sol / décor d'origine demandé");
await shot('5-regeneration');
check(errs.length === 0, 'aucune erreur console', errs.slice(0, 4).join(' | '));
if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(fails ? `\n${fails} échec(s)` : '\nTout est passé');
await browser.close();
process.exit(fails ? 1 : 0);
