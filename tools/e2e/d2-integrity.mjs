/**
 * Intégrité de la copie OPFS avec de vrais MPQ ($D2_PRIVATE_DIR/in, jamais dans git) :
 * import → copie vérifiée (indicateur `verified`) → corruption injectée dans la copie (API de test) → détection → réparation
 * (suppression, re-sélection guidée, recopie vérifiée) → copie à nouveau conforme.
 *   D2_SPRITES=0 D2_PUBLIC=1 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/d2-integrity.mjs
 */
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const IN = args.get('in') ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
const mpqs = readdirSync(IN)
  .filter((f) => /^(d2data|d2char|d2exp)\.mpq$/i.test(f))
  .map((f) => join(IN, f));
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
// le service n'est exposé (window.__d2local) qu'après coup : on observe les messages du Worker de copie (phase « verifying »)
await ctx.addInitScript(() => {
  const W = window.Worker;
  window.Worker = class extends W {
    constructor(...a) {
      super(...a);
      this.addEventListener('message', (e) => {
        if (e.data?.type === 'copy-progress' && e.data.verifying) sessionStorage.setItem('verifying', '1');
      });
    }
  };
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));

const importFiles = async () => {
  await page.waitForSelector('.d2c', { timeout: 60000 });
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.d2c-card .btn.primary')]);
  await fc.setFiles(mpqs);
  // copie + vérification
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    const s = await page.evaluate(() => {
      const s = window.__d2local?.status;
      return s ? { copy: !!s.copy, v: !!s.copy?.verifying, p: s.persistent, i: s.integrity.state, ph: s.phase } : null;
    });
    if (s && !s.copy && s.p && s.i === 'verified') return { sawVerifying: await page.evaluate(() => sessionStorage.getItem('verifying') === '1') };
    await page.waitForTimeout(200);
  }
  return { timeout: true };
};

await page.goto(URL);
const r1 = await importFiles();
check(!r1.timeout, 'copie terminée et marquée « verified »');
check(r1.sawVerifying, 'la phase « Verifying files… » est annoncée');
const v1 = await page.evaluate(() => window.__d2local.verifyFiles());
check(v1.ok && v1.files.every((f) => f.status === 'ok'), 'vérification sans fichier source : copie conforme', JSON.stringify(v1.files));

// corruption : 16 octets au milieu de d2data.mpq
const done = await page.evaluate(() => window.__d2local.testCorruptCopy('d2data.mpq', 100_000_000, 16));
check(done, 'corruption injectée');
const v2 = await page.evaluate(() => window.__d2local.verifyFiles());
const bad = v2.files.find((f) => f.status === 'damaged');
check(!v2.ok && bad?.name === 'd2data.mpq' && bad.chunk === Math.floor(100_000_000 / (8 * 1024 * 1024)), 'la vérification détecte le fichier et le morceau abîmés', JSON.stringify(v2.files));
const integ = await page.evaluate(() => window.__d2local.status.integrity.state);
check(integ === 'damaged', 'état d’intégrité « damaged »', integ);

// réparation
const rep = await page.evaluate(() => window.__d2local.repairFiles());
check(rep.action === 'reselect' && rep.dropped.join() === 'd2data.mpq', 'réparation : seul le fichier abîmé est supprimé', JSON.stringify(rep));
const afterRep = await page.evaluate(() => ({ ph: window.__d2local.status.phase, has: window.__d2local.hasFiles }));
check(afterRep.ph === 'needfiles' && !afterRep.has, 're-sélection demandée (phase needfiles)', JSON.stringify(afterRep));

// re-sélection guidée après rechargement
await page.reload();
const r2 = await importFiles();
check(!r2.timeout, 'recopie terminée et vérifiée après re-sélection');
const v3 = await page.evaluate(() => window.__d2local.verifyFiles());
check(v3.ok && v3.files.length >= 3, 'copie conforme après réparation', JSON.stringify(v3.files.map((f) => f.name + '=' + f.status)));
check(errs.length === 0, 'aucune erreur de page', errs.join(' | '));
await browser.close();
console.log(fails ? `${fails} échec(s)` : 'OK');
process.exit(fails ? 1 : 0);
