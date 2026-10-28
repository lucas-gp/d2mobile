/**
 * Écran de choix des graphismes D2 (version publique) avec de vrais MPQ ($D2_PRIVATE_DIR/in, jamais dans git).
 *   D2_SPRITES=0 D2_PUBLIC=1 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/d2-onboard.mjs [--in=…] [--shots=<dossier>]
 * Scénarios : A (900×800, bureau) visiteur sans rien → écran à une carte → import incomplet (erreur claire) → dossier → ville jouable →
 * rechargement : direct dans le jeu ; B (390×844 tactile) : sélection multiple, progression, ville ; C : aucun lien « remplacement »,
 * l'écran revient tant que les fichiers ne sont pas fournis.
 */
import { chromium } from 'playwright-core';
import { readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const IN = args.get('in') ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
const SHOTS = args.get('shots');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const mpqs = readdirSync(IN)
  .filter((f) => f.toLowerCase().endsWith('.mpq'))
  .map((f) => join(IN, f));
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open({ w, h, mobile, lang }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  if (lang) await ctx.addInitScript((l) => !localStorage.getItem('d2m.lang') && localStorage.setItem('d2m.lang', l), lang);
  const page = await ctx.newPage();
  const st = { d2req: 0, errs: [] };
  // ressources D2 servies sous /d2/ seulement : pas les modules du serveur de développement (src/mods/d2/…)
  page.on('request', (r) => new globalThis.URL(r.url()).pathname.startsWith('/d2/') && st.d2req++);
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|GPU stall|swiftshader|WebGL|GroupMarker/i.test(m.text()) && st.errs.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => st.errs.push(`[pageerror] ${e.message.slice(0, 200)}`));
  return { ctx, page, st };
}
const shot = (page, n) => SHOTS && page.screenshot({ path: join(SHOTS, `${n}.png`) });
const gameReady = async (page) => {
  await page.waitForFunction(() => window.__arpg, null, { timeout: 240000 });
  if (await page.$('.charselect input')) {
    await page.fill('.charselect input', 'Onb');
    await page.click('.charselect .card.barbarian');
    await page.click('.charselect .btn.primary');
  } else if (await page.$('.charselect .btn.primary')) await page.click('.charselect .btn.primary');
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 240000 });
  await page.evaluate(() => document.querySelectorAll('button').forEach((b) => /compris|got it/i.test(b.textContent ?? '') && b.click()));
};
const pick = async (page, selector, files) => {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(selector)]);
  await fc.setFiles(files);
};
const status = (page) =>
  page.evaluate(() => {
    const s = window.__d2local?.status;
    return s ? { phase: s.phase, source: s.source, persistent: s.persistent, ready: s.readyCount, generated: s.generated, failed: s.failed, queued: s.queued, active: s.active } : null;
  });
const idle = async (page, t = 120000) => {
  const t0 = Date.now();
  let calm = 0;
  while (Date.now() - t0 < t) {
    const s = await status(page);
    if (s && s.queued + s.active === 0) {
      if (++calm >= 3) return Date.now() - t0;
    } else calm = 0;
    await page.waitForTimeout(300);
  }
  return -1;
};
const sample = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? c.width + 'x' + c.height : '';
  });

/* ------------------------------- A : bureau ------------------------------- */
{
  const { ctx, page, st } = await open({ w: 900, h: 800, lang: 'fr' });
  await page.goto(URL);
  await page.waitForSelector('.d2c', { timeout: 60000 });
  const cards = await page.locator('.d2c .d2c-card').count();
  check(cards === 1, 'A : visiteur sans rien → écran de choix, une seule carte (pas de mot de passe)', `${cards} carte(s)`);
  const txt = await page.locator('.d2c').innerText();
  check(
    /d2data\.mpq/.test(txt) &&
      /d2char\.mpq/.test(txt) &&
      /d2exp\.mpq/.test(txt) &&
      /Nothing is uploaded/.test(txt) &&
      /must own a copy of Diablo II/.test(txt) &&
      !/password/i.test(txt.replace(/I actually have the password/g, '')),
    'A : texte EN : fichiers, confidentialité, mention de possession, aucune mention de mot de passe',
    '',
  );
  check((await page.locator('.d2c-skip').count()) === 0, 'A : aucun lien « graphismes de remplacement » (pas de jeu sans les fichiers)');
  await shot(page, 'A1-choix-fr-900x800');
  const overflow = await page.evaluate(() => {
    const s = document.querySelector('.d2c');
    return s.scrollWidth > s.clientWidth + 1;
  });
  check(!overflow, 'A : pas de débordement horizontal');
  // import incomplet : seulement d2data.mpq
  await pick(page, '.d2c-card .btn.primary', [mpqs.find((f) => /d2data/i.test(f))]);
  await page.waitForSelector('.d2c-card .err', { timeout: 30000 });
  const err = await page.locator('.d2c-card .err').allInnerTexts();
  check(err.some((e) => /d2char\.mpq/.test(e)) && err.some((e) => /d2exp\.mpq/.test(e)), 'A : fichiers manquants nommés clairement', err.join(' | ').slice(0, 160));
  await shot(page, 'A2-erreur-manquant');
  // un fichier à la fois : le précédent est mémorisé (d2char s'ajoute à d2data, il ne manque plus que d2exp)
  await pick(page, '.d2c-card .btn.primary', [mpqs.find((f) => /d2char/i.test(f))]);
  await page.waitForFunction(
    () => {
      const t = document.querySelector('.d2c-card')?.textContent ?? '';
      return /d2exp\.mpq/i.test(t) && !/Missing file: d2char/i.test(t);
    },
    null,
    { timeout: 30000 },
  );
  const err2 = await page.locator('.d2c-card .err').allInnerTexts();
  check(
    !err2.some((e) => /Missing file: d2char|Missing file: d2data/i.test(e)) && err2.some((e) => /d2exp/.test(e)),
    'A : import un fichier à la fois : les précédents sont mémorisés',
    err2.join(' | ').slice(0, 160),
  );
  const t0 = Date.now();
  await pick(page, '.d2c-card .btn.primary', [mpqs.find((f) => /d2exp/i.test(f))]);
  await page.waitForTimeout(1500);
  await shot(page, 'A3-copie-en-cours');
  await page.waitForSelector('.d2c', { state: 'detached', timeout: 180000 });
  const tIn = Date.now() - t0;
  await gameReady(page);
  const t1 = Date.now() - t0;
  const s1 = await status(page);
  check(
    s1 && s1.phase === 'ready',
    'A : import par dossier accepté, jeu lancé',
    `écran fermé ${(tIn / 1000).toFixed(1)} s, jeu prêt ${(t1 / 1000).toFixed(1)} s, phase=${s1?.phase} source=${s1?.source}`,
  );
  const q = await idle(page);
  const s2 = await status(page);
  check(q >= 0 && s2.generated > 0, 'A : génération paresseuse en ville', `${s2.generated} assets, file vide après ${(q / 1000).toFixed(1)} s, échecs ${s2.failed}`);
  await shot(page, 'A4-ville-generee');
  check(st.d2req === 0, 'A : 0 requête /d2/', `${st.d2req}`);
  // rechargement : direct dans le jeu
  const r0 = Date.now();
  await page.reload();
  const sawChoice = await page
    .waitForSelector('.d2c', { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  await gameReady(page);
  const s3 = await status(page);
  check(!sawChoice, 'A : rechargement → direct dans le jeu, sans écran de choix', `prêt en ${((Date.now() - r0) / 1000).toFixed(1)} s, phase=${s3?.phase}, source=${s3?.source}`);
  check(st.errs.length === 0, 'A : aucune erreur console', st.errs.slice(0, 3).join(' | '));
  await ctx.close();
}

/* ------------------------------ B : téléphone ------------------------------ */
{
  const { ctx, page, st } = await open({ w: 390, h: 844, mobile: true, lang: 'en' });
  await page.goto(URL);
  await page.waitForSelector('.d2c', { timeout: 60000 });
  await page.waitForFunction(() => /Choose my files/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
  check((await page.locator('.d2c-card').count()) === 1, 'B : une carte, EN');
  const btnH = await page.evaluate(() => Math.round(document.querySelector('.d2c-card .btn.primary').getBoundingClientRect().height));
  check(btnH >= 44, 'B : bouton principal ≥ 44 px', `${btnH} px`);
  const folder = await page.locator('.d2c-card .btn:not(.primary)').count();
  check(folder === 0, 'B : pas de bouton « dossier » sur écran tactile', `${folder}`);
  await shot(page, 'B1-choose-en-390x844');
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.querySelector('.d2c').scrollWidth > document.querySelector('.d2c').clientWidth + 1);
  check(!ov, 'B : pas de débordement horizontal');
  await page.evaluate(() => document.querySelector('.d2c').scrollTo(0, 99999));
  await shot(page, 'B2-choose-bas');
  await pick(page, '.d2c-card .btn.primary', mpqs);
  await page.waitForSelector('.d2c-status', { timeout: 30000 }).catch(() => {});
  await shot(page, 'B3-progression');
  await page.waitForSelector('.d2c', { state: 'detached', timeout: 240000 });
  await gameReady(page);
  const s = await status(page);
  check(s && s.phase === 'ready', 'B : import par sélection multiple, jeu lancé', `phase=${s?.phase} source=${s?.source}`);
  await idle(page);
  await shot(page, 'B4-ville-390x844');
  check(st.errs.length === 0, 'B : aucune erreur console', st.errs.slice(0, 3).join(' | '));
  await ctx.close();
}

/* ------------------- C : pas de jeu sans les fichiers Diablo II ------------------- */
{
  const { ctx, page, st } = await open({ w: 900, h: 800, lang: 'fr' });
  await page.goto(URL);
  await page.waitForSelector('.d2c', { timeout: 60000 });
  check((await page.locator('.d2c-skip').count()) === 0, 'C : aucun lien pour jouer avec les graphismes de remplacement');
  await page.reload();
  const again = await page
    .waitForSelector('.d2c', { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  check(again, 'C : rechargement sans fichiers : l’écran de choix revient, le jeu ne démarre pas');
  check(st.errs.length === 0, 'C : aucune erreur console', st.errs.slice(0, 3).join(' | '));
  await ctx.close();
}

/* ------------------------ D : archives sonores facultatives ------------------------ */
{
  const AIN = join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'audio-in');
  const aud = readdirSync(AIN)
    .filter((f) => /^(d2sfx|d2speech|d2xtalk|d2music)\.mpq$/i.test(f))
    .map((f) => join(AIN, f));
  const { ctx, page, st } = await open({ w: 900, h: 800, lang: 'en' });
  await page.goto(URL);
  await page.waitForSelector('.d2c', { timeout: 60000 });
  await page.waitForFunction(() => /Choose my files/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
  const txt = await page.locator('.d2c').innerText();
  check(/d2sfx\.mpq/.test(txt) && /d2music\.mpq/.test(txt) && /Optional but recommended/.test(txt), 'D : écran EN : archives sonores listées comme facultatives', '');
  check(/sound effects/.test(txt) && /music/i.test(txt) && /voices/.test(txt), 'D : ce que chaque archive apporte (effets, voix, musique)');
  check(/Also copy the sounds and music/.test(txt), 'D : choix de copier ou non les sons (taille supplémentaire annoncée)', (txt.match(/Also copy the sounds[^\n]*/) ?? [''])[0]);
  await shot(page, 'D1-audio-en');
  await pick(page, '.d2c-card .btn.primary', [...mpqs.filter((f) => !/obj\.txt/.test(f)), ...aud]);
  await page.waitForSelector('.d2c', { state: 'detached', timeout: 240000 });
  await gameReady(page);
  const a = await page.evaluate(() => window.__d2local.status.audio);
  check(a.names.length === aud.length, 'D : archives sonores prises en compte avec les graphismes', a.names.join(','));
  await page.waitForFunction(() => window.__d2audio?.d2?.ready === true, null, { timeout: 60000 }).catch(() => {});
  const ready = await page.evaluate(() => window.__d2audio?.d2?.ready === true);
  check(ready, 'D : index sonore prêt (sons D2 branchés après l’import)');
  check(st.d2req === 0, 'D : 0 requête /d2/', `${st.d2req}`);
  check(st.errs.length === 0, 'D : aucune erreur console', st.errs.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(fails ? `D2-ONBOARD : ${fails} ÉCHEC(S)` : 'D2-ONBOARD OK');
process.exit(fails ? 1 : 0);
