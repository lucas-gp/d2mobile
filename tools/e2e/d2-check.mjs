/**
 * Contrôle des archives à l'import avec de vrais MPQ ($D2_PRIVATE_DIR/in, jamais dans git) :
 *  1. une copie de d2data.mpq dont 2 Mo sont mis à zéro à la position d'un fichier connu : l'écran d'import dit « d2data.mpq looks incomplete »,
 *     nomme la zone, AVANT toute fabrication (aucun asset généré, pas d'écran de sélection) ;
 *  2. « Choose the file again » avec le bon fichier : l'import aboutit, les trois archives sont contrôlées (MD5 compris) ;
 *  3. Réglages : colonne « Contrôle » et MD5 ; « Vérification complète » lit tout.
 * Les durées sont affichées. Usage :
 *   D2_SPRITES=0 D2_PUBLIC=1 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/d2-check.mjs
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { closeSync, copyFileSync, mkdtempSync, openSync, rmSync, writeSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const URL = process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const IN = join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};

// copie abîmée de d2data.mpq : 2 Mo de zéros à la position d'un fichier connu (écran de sélection du personnage)
const loc = JSON.parse(execFileSync('npx', ['tsx', 'tools/e2e/mpq-locate.ts', IN, 'data\\global\\ui\\charselect\\charselectbckg.dc6'], { encoding: 'utf8' }).trim().split('\n').pop());
const tmp = mkdtempSync(join(tmpdir(), 'd2chk-'));
const badFile = join(tmp, loc.archive);
copyFileSync(join(IN, loc.archive), badFile);
{
  const fd = openSync(badFile, 'r+');
  writeSync(fd, Buffer.alloc(2 * 1024 * 1024), 0, 2 * 1024 * 1024, loc.at);
  closeSync(fd);
}
console.log(`copie abîmée : ${loc.archive}, 2 Mo de zéros à l'octet ${loc.at} (${(loc.at / 1e6).toFixed(1)} Mo)`);
const good = ['d2data.mpq', 'd2char.mpq', 'd2exp.mpq'].map((n) => join(IN, n));
const withBad = ['d2data.mpq', 'd2char.mpq', 'd2exp.mpq'].map((n) => (n === loc.archive ? badFile : join(IN, n)));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 840, height: 360 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('d2m.lang', 'en');
  } catch {
    /* ignoré */
  }
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await page.goto(URL);
await page.evaluate(async () => {
  localStorage.clear();
  localStorage.setItem('d2m.lang', 'en');
  for (const k of await caches.keys()) await caches.delete(k);
  try {
    const r = await navigator.storage.getDirectory();
    for await (const [n] of r.entries()) await r.removeEntry(n, { recursive: true });
  } catch {
    /* ignoré */
  }
});
await page.goto(URL);
await page.waitForSelector('.d2c', { timeout: 60000 });

// 1. mauvais fichier
let t0 = Date.now();
let [fc] = await Promise.all([page.waitForEvent('filechooser'), page.tap('.d2c-card .btn.primary')]);
await fc.setFiles(withBad);
await page.waitForFunction(() => /looks incomplete/.test(document.querySelector('.d2c-card')?.innerText ?? ''), null, { timeout: 120000 });
const tBad = Date.now() - t0;
const txt = await page.evaluate(() => document.querySelector('.d2c-card').innerText);
console.log(
  `message affiché ${(tBad / 1000).toFixed(1)} s après la sélection :\n  ${txt
    .split('\n')
    .filter((l) => /incomplete|downloaded/.test(l))
    .join('\n  ')}`,
);
const m = /(d2\w+\.mpq) looks incomplete: its data is empty from (\d+(?:\.\d)?) MB to (\d+(?:\.\d)?) MB \((\d+) files? affected, e\.g\. ([^)]+)\)/.exec(txt);
check(!!m && m[1] === loc.archive, 'l’écran d’import dit que l’archive est incomplète', m?.[0]);
check(!!m && Number(m[2]) <= loc.at / 1e6 + 0.01 && Number(m[3]) >= (loc.at + 2 * 1024 * 1024) / 1e6 - 0.01, 'la zone couvre les 2 Mo abîmés', m ? `${m[2]}–${m[3]} Mo, ${m[4]} fichiers` : '');
check(/charselect/.test(m?.[5] ?? ''), 'un nom de fichier touché est cité', m?.[5]);
check(/download it again and add it again/.test(txt), 'conseil : télécharger de nouveau et ajouter de nouveau');
check((await page.locator('.d2c-card .d2c-again').first().textContent()) === 'Choose the file again', 'bouton « Choose the file again »');
// AVANT toute fabrication : aucun asset généré, pas d'écran de sélection du personnage
await page.waitForTimeout(3000);
const st = await page.evaluate(() => {
  const L = window.__d2local;
  return {
    gen: L.genLog.length,
    queued: L.status.queued,
    active: L.status.active,
    charselect: !!document.querySelector('.charselect'),
    blocked: L.blocked().map((c) => c.name),
    checks: Object.fromEntries(Object.entries(L.status.checks).map(([k, c]) => [k, `${c.status}/${c.mode}/${c.ms}ms`])),
  };
});
check(st.gen === 0 && st.active === 0 && !st.charselect, 'aucune fabrication ni écran de jeu pendant le blocage', JSON.stringify(st));
check(st.blocked.join() === loc.archive, 'le service bloque la fabrication (archive obligatoire incomplète)', JSON.stringify(st.checks));
await page.waitForFunction(() => !window.__d2local.status.copy, null, { timeout: 300000 });
const sBad = await page.evaluate(() => Object.fromEntries(Object.entries(window.__d2local.status.checks).map(([k, c]) => [k, { s: c.status, m: c.mode, md5: c.md5, ms: c.ms }])));
console.log('après la copie :', JSON.stringify(sBad));
check(sBad[loc.archive]?.s === 'incomplete' && sBad[loc.archive]?.m === 'full', 'la copie confirme par un contrôle complet (même lecture)');

// 2. le bon fichier
t0 = Date.now();
[fc] = await Promise.all([page.waitForEvent('filechooser'), page.tap('.d2c-card .d2c-again')]);
await fc.setFiles([join(IN, loc.archive)]);
await page.waitForFunction(() => Object.keys(window.__d2local.status.checks).length >= 3 && Object.values(window.__d2local.status.checks).every((c) => c.status === 'ok'), null, { timeout: 300000 });
const tChecked = Date.now() - t0;
await page.waitForFunction(() => !document.querySelector('.d2c'), null, { timeout: 600000 });
const tImport = Date.now() - t0;
check(true, 'bon fichier : trois archives contrôlées OK, import terminé', `contrôles OK après ${(tChecked / 1000).toFixed(1)} s, import terminé après ${(tImport / 1000).toFixed(1)} s`);
await page.waitForFunction(() => !window.__d2local.status.copy, null, { timeout: 300000 });
const ok = await page.evaluate(() => Object.fromEntries(Object.entries(window.__d2local.status.checks).map(([k, c]) => [k, { s: c.status, m: c.mode, md5: c.md5, ms: c.ms }])));
console.log('contrôles :', JSON.stringify(ok));
check(
  Object.values(ok).every((c) => c.m === 'full' && /^[0-9a-f]{32}$/.test(c.md5)),
  'MD5 calculé pour chaque archive pendant la copie',
);

// 3. Réglages : colonne « Contrôle », MD5, vérification complète
// l'écran de sélection s'affiche ; selon l'état du banc, la partie peut aussi démarrer directement
await page.waitForFunction(() => window.__arpg || document.querySelector('.charselect.d2s'), null, { timeout: 900000 });
if (!(await page.evaluate(() => !!window.__arpg))) {
  await pickFirstMode(page, { tap: true });
  await page.waitForTimeout(1200);
  await page.fill('.d2input', 'Chk');
  await page.tap('.d2b.ok');
}
await page.waitForFunction(() => window.__arpg, null, { timeout: 900000 });
await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 900000 });
await page.evaluate(() => {
  localStorage.setItem('d2m.settings.cat', 'advanced');
  window.__arpg.app.panels.hide();
  window.__arpg.app.panels.show('settings');
});
await page.waitForSelector('.d2l-files .d2l-row', { timeout: 60000 });
const rows = await page.evaluate(() =>
  Object.fromEntries([...document.querySelectorAll('.d2l-files .d2l-row')].map((r) => [r.querySelector('span')?.textContent?.replace(/ \(.*\)$/, '') ?? '', r.innerText.replace(/\n/g, ' | ')])),
);
const dr = rows['d2data.mpq'] ?? '';
check(/Check: OK \(full read\)/.test(dr), 'Réglages : colonne « Contrôle » (Check: OK, full read)', dr.slice(0, 260));
check(/MD5: [0-9a-f]{32}/.test(dr), 'Réglages : MD5 calculé affiché');
const isRef = ok['d2data.mpq']?.md5 === '68b2f1581d226663ff08bc65372d93cc';
check(
  isRef ? /Matches the reference distribution/.test(dr) : /Different version from the reference/.test(dr),
  'Réglages : verdict MD5 (référence / version différente)',
  isRef ? 'référence' : 'version différente',
);
check(/Reference MD5: [0-9a-f]{32}/.test(dr), 'Réglages : MD5 de référence attendu affiché');
const pr = rows['Patch_D2.mpq'] ?? '';
check(!/Check:/.test(pr), 'archive absente : pas de ligne de contrôle');
// vérification complète
t0 = Date.now();
await page.evaluate(() => [...document.querySelectorAll('.d2l-files .btn')].find((b) => /Full verification/.test(b.textContent)).click());
await page.waitForFunction(() => window.__d2local.status.checking !== null, null, { timeout: 30000 }).catch(() => undefined);
await page.waitForFunction(() => window.__d2local.status.checking === null && [...document.querySelectorAll('.d2l-files .btn')].some((b) => /Full verification/.test(b.textContent)), null, {
  timeout: 300000,
});
const tFull = Date.now() - t0;
const full = await page.evaluate(() => Object.fromEntries(Object.entries(window.__d2local.status.checks).map(([k, c]) => [k, `${c.status}/${c.mode}/${c.ms}ms`])));
check(
  Object.values(full).every((v) => v.startsWith('ok/full')),
  'vérification complète (3 archives, relecture de la copie OPFS)',
  `${(tFull / 1000).toFixed(1)} s ${JSON.stringify(full)}`,
);
check(errs.length === 0, 'aucune erreur de page', errs.join(' | '));
await browser.close();
rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `\n${fails} échec(s)` : '\nOK');
process.exit(fails ? 1 : 0);
