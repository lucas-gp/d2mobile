/**
 * Validation mobile de bout en bout (Chromium headless, rendu logiciel SwiftShader) :
 *   node tools/e2e/mobile.mjs [--url=http://127.0.0.1:5233/] [--devices=all|iphone,...] [--quick]
 *
 * Pour chaque appareil émulé (taille, densité, tactile, zones sûres) :
 *  1. chargement sans erreur, HUD dans l'écran, cibles tactiles assez grandes, sans chevauchement ;
 *  2. bot tactile (vrais événements tactiles CDP) : joystick, attaque, compétence maintenue,
 *     panneau d'inventaire ouvert/fermé au tap ;
 *  3. captures : ville, combat (bot de jeu actif), inventaire ;
 *  4. mesures : intervalle d'images (médiane, p95) et mémoire de textures pendant 20 s de combat,
 *     et un passage avec le processeur ralenti ×4 (milieu de gamme ancien).
 * Rapport : test-results/e2e/report.json ; captures : test-results/e2e/<appareil>/*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const QUICK = args.has('quick');
const OUT = join(process.cwd(), 'test-results', 'e2e');

/** Matrice d'appareils (paysage). Zones sûres simulées par variables CSS (encoche). */
export const DEVICES = {
  'android-petit': { width: 740, height: 360, dpr: 3, notch: 0 },
  iphone: { width: 844, height: 390, dpr: 3, notch: 47 },
  'grand-ecran': { width: 932, height: 430, dpr: 3, notch: 59 },
  'pliable-ouvert': { width: 841, height: 673, dpr: 2.6, notch: 0 },
  // Galaxy Z Fold récent (px CSS environ, à confirmer sur l'appareil) : plié et déplié, en paysage ; portrait : tools/e2e/fold.mjs
  'fold-plie': { width: 882, height: 344, dpr: 3, notch: 0 },
  'fold-ouvert': { width: 1104, height: 884, dpr: 2.4, notch: 0 },
  tablette: { width: 1180, height: 820, dpr: 2, notch: 0 },
};

const wanted = (args.get('devices') ?? 'all') === 'all' ? Object.keys(DEVICES) : args.get('devices').split(',');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = { url: URL, date: new Date().toISOString(), devices: {} };
let failures = 0;

for (const name of wanted) {
  const dev = DEVICES[name];
  const dir = join(OUT, name);
  mkdirSync(dir, { recursive: true });
  const r = { checks: [], errors: [], perf: {} };
  const check = (ok, what, detail) => {
    r.checks.push({ ok, what, detail });
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} [${name}] ${what}${detail ? ` — ${detail}` : ''}`);
  };
  const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => r.errors.push(`${e.message} @ ${(e.stack ?? '').split('\n').slice(1, 3).join(' ')}`));
  // toute ressource introuvable (icône, police, planche) est une erreur
  page.on('response', (res) => {
    if (res.status() >= 400) r.errors.push(`HTTP ${res.status()} ${res.url()}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') r.errors.push(m.text());
  });
  // zones sûres : l'encoche est simulée côté gauche en paysage
  await page.addInitScript((notch) => {
    localStorage.clear();
    localStorage.setItem('d2m.lang', 'fr'); // les assertions de ce test lisent les libellés français
    window.__E2E_SAFE_LEFT = notch;
    // <html> n'existe pas encore quand ce script s'exécute : on attend sa création
    const apply = () => document.documentElement.style.setProperty('--sal', `${notch}px`);
    if (document.documentElement) apply();
    else
      new MutationObserver((_, o) => {
        if (document.documentElement) {
          apply();
          o.disconnect();
        }
      }).observe(document, { childList: true });
  }, dev.notch);
  await page.goto(URL);
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading:not(.hidden)'), null, { timeout: 60000 });
  await page.evaluate(() => window.__arpg.setQuality('high'));
  await page.waitForTimeout(1500);
  const cdp = await ctx.newCDPSession(page);

  /* ---------- 1. HUD : dans l'écran, tailles, chevauchements ---------- */
  // le bouton de téléportation n'apparaît qu'avec le sort : on l'affiche pour mesurer sa place (il sortait de l'écran à droite)
  await page.evaluate(() => {
    const t = document.querySelector('[data-testid="teleport"]');
    if (t) t.style.display = 'grid';
  });
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid]')]
      .filter((e) => e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden')
      .map((e) => {
        const b = e.getBoundingClientRect();
        return {
          id: e.dataset.testid,
          x: b.x,
          y: b.y,
          w: b.width,
          h: b.height,
          round: ((r) => (r.endsWith('%') ? parseFloat(r) >= 50 : parseFloat(r) >= b.width / 2 - 1))(getComputedStyle(e).borderTopLeftRadius),
        };
      }),
  );
  const inside = boxes.filter((b) => b.id !== 'joystick').every((b) => b.x >= dev.notch - 1 && b.y >= 0 && b.x + b.w <= dev.width + 1 && b.y + b.h <= dev.height + 1);
  check(inside, 'contrôles dans l’écran et hors encoche', JSON.stringify(boxes.filter((b) => !(b.x >= dev.notch - 1 && b.x + b.w <= dev.width + 1 && b.y + b.h <= dev.height + 1)).map((b) => b.id)));
  const small = boxes.filter((b) => b.id !== 'joystick' && Math.min(b.w, b.h) < 40);
  check(small.length === 0, 'cibles tactiles ≥ 40 px CSS', small.map((b) => `${b.id} ${Math.round(b.w)}×${Math.round(b.h)}`).join(', '));
  const atk = boxes.find((b) => b.id === 'attack');
  check(!!atk && atk.w >= 70, 'bouton d’attaque ≥ 70 px', atk ? `${Math.round(atk.w)} px` : 'absent');
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.id === 'joystick' || b.id === 'joystick') continue;
      if (a.round && b.round) {
        // boutons ronds : test de disques (les boîtes carrées se touchent en diagonale)
        const d = Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2);
        if (d < a.w / 2 + b.w / 2 - 4) overlaps.push(`${a.id}/${b.id}`);
        continue;
      }
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix > 4 && iy > 4) overlaps.push(`${a.id}/${b.id}`);
    }
  check(overlaps.length === 0, 'aucun contrôle ne se chevauche', overlaps.join(', '));
  await page.screenshot({ path: join(dir, '1-ville.png') });
  // cadrage : le personnage au centre et l'éclairage plein écran dans chaque palier de qualité
  // (la qualité haute, résolution 2, décentrait tout sur téléphone réel)
  for (const qn of ['high', 'medium', 'low']) {
    await page.evaluate((q) => window.__arpg.setQuality(q), qn);
    await page.waitForTimeout(700);
    const fr = await page.evaluate(() => {
      const r = window.__arpg.renderer();
      const s = window.__arpg.state();
      const p = r.worldToScreen(s.x, s.y);
      return { px: p.x, py: p.y, w: window.innerWidth, h: window.innerHeight, rw: r.width, rh: r.height };
    });
    const off = Math.hypot(fr.px - fr.w / 2, fr.py - fr.h / 2);
    check(
      off < Math.min(fr.w, fr.h) * 0.08 && Math.abs(fr.rw - fr.w) <= 2 && Math.abs(fr.rh - fr.h) <= 2,
      `qualité ${qn} : personnage centré, rendu plein écran`,
      `écart ${Math.round(off)} px, rendu ${Math.round(fr.rw)}×${Math.round(fr.rh)} pour ${fr.w}×${fr.h}`,
    );
  }

  /* ---------- 2. Bot tactile ---------- */
  const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 8, radiusY: 8, force: 1 })) });
  const center = (id) => {
    const b = boxes.find((x) => x.id === id);
    return b ? [b.x + b.w / 2, b.y + b.h / 2] : null;
  };
  // joystick flottant : appui à gauche puis glissé vers la droite pendant 1,2 s
  const p0 = await page.evaluate(() => window.__arpg.state());
  const jx = dev.notch + dev.width * 0.14;
  const jy = dev.height * 0.68;
  await touch('touchStart', [[jx, jy]]);
  for (let k = 1; k <= 12; k++) {
    await touch('touchMove', [[jx + Math.min(70, k * 8), jy - Math.min(20, k * 2)]]);
    await page.waitForTimeout(100);
  }
  await touch('touchEnd', []);
  const p1 = await page.evaluate(() => window.__arpg.state());
  const moved = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  check(moved > 1.5, 'joystick : le personnage se déplace', `${moved.toFixed(2)} unités`);

  // run : niveau 12, compétences apprises, puis attaque au tap et compétence maintenue
  await page.evaluate(() => {
    window.__arpg.setLevel(12, true);
    window.__arpg.god(true);
    window.__arpg.startRun('tristram', 0, 42);
  });
  await page.waitForFunction(() => window.__arpg.state().zone === 'tristram' && !document.querySelector('.loading:not(.hidden)'), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const boxesRun = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid]')].map((e) => {
      const b = e.getBoundingClientRect();
      return { id: e.dataset.testid, x: b.x, y: b.y, w: b.width, h: b.height };
    }),
  );
  const c = (id) => {
    const b = boxesRun.find((x) => x.id === id);
    return b ? [b.x + b.w / 2, b.y + b.h / 2] : null;
  };
  // compté en lancements (le mana plein se régénère plus vite qu'un Trait de feu ne coûte)
  const m0 = await page.evaluate(() => window.__arpg.state().casts);
  const atkC = c('attack');
  for (let k = 0; k < 4; k++) {
    await touch('touchStart', [atkC]);
    await page.waitForTimeout(80);
    await touch('touchEnd', []);
    await page.waitForTimeout(450);
  }
  const m1 = await page.evaluate(() => window.__arpg.state().casts);
  check(m1 > m0, 'attaque principale au tap : le sort part', `${m1 - m0} lancement(s)`);
  // compétence 1 maintenue avec glissé (visée manuelle), puis relâchée
  const s0 = c('skill0');
  if (s0) {
    await touch('touchStart', [s0]);
    for (let k = 1; k <= 6; k++) {
      await touch('touchMove', [[s0[0] - k * 12, s0[1] - k * 6]]);
      await page.waitForTimeout(60);
    }
    await page.screenshot({ path: join(dir, '2-visee-manuelle.png') });
    const modeAtRelease = await page.evaluate(() => window.__arpg.state().playerMode);
    await touch('touchEnd', []);
    // le personnage peut être occupé (incantation, coup reçu) : l'intention part à sa libération
    await page.waitForTimeout(1200);
    const m2 = await page.evaluate(() => window.__arpg.state().casts);
    check(m2 > m1, 'compétence 1 : visée par glissé et lancement au relâcher', `${m2 - m1} lancement(s), personnage « ${modeAtRelease} » au relâcher`);
  }
  // inventaire au tap, puis fermeture au tap
  const invC = c('inventory');
  await touch('touchStart', [invC]);
  await touch('touchEnd', []);
  await page.waitForTimeout(500);
  const opened = await page.evaluate(() => document.querySelector('#panels .panel h2')?.textContent ?? '');
  await page.screenshot({ path: join(dir, '3-inventaire.png') });
  check(/inventaire/i.test(opened), 'inventaire : ouverture au tap (le bon onglet, pas de clic fantôme)', opened);
  // filtre de butin : Réglages → « Régler le filtre », préréglage au tap, aperçu mis à jour
  const tapText = async (sel, re) => {
    const pt = await page.evaluate(
      ([sel, src]) => {
        const b = [...document.querySelectorAll(sel)].find((x) => new RegExp(src, 'i').test(x.textContent ?? ''));
        if (!b) return null;
        b.scrollIntoView({ block: 'center' });
        const r = b.getBoundingClientRect();
        return [r.x + r.width / 2, r.y + r.height / 2];
      },
      [sel, re.source],
    );
    if (!pt) return false;
    await touch('touchStart', [pt]);
    await touch('touchEnd', []);
    await page.waitForTimeout(250);
    return true;
  };
  await tapText('#panels .tabs .btn', /réglages/);
  await tapText('#panels .btn', /filtre de butin/);
  const fTitle = await page.evaluate(() => document.querySelector('#panels .panel h2')?.textContent ?? '');
  const hidden0 = await page.evaluate(() => document.querySelectorAll('#panels .fprow.off').length);
  await tapText('#panels .btn', /^strict$/);
  const fState = await page.evaluate(() => {
    const panel = document.querySelector('#panels .panel');
    const chips = [...document.querySelectorAll('#panels .panel .tabs .btn')].map((b) => b.getBoundingClientRect());
    return {
      hidden: document.querySelectorAll('#panels .fprow.off').length,
      sel: document.querySelector('#panels .tabs .btn.sel')?.textContent,
      overflowX: panel ? panel.scrollWidth - panel.clientWidth : 0,
      minChip: Math.min(...chips.map((r) => Math.min(r.width, r.height))),
    };
  });
  await page.screenshot({ path: join(dir, '3b-filtre.png') });
  check(/filtre/i.test(fTitle) && fState.hidden > hidden0, 'filtre de butin : ouverture, préréglage « Strict » au tap, aperçu mis à jour', `${fTitle} : masqués ${hidden0} → ${fState.hidden}`);
  check(
    fState.overflowX <= 1 && fState.minChip >= 28,
    'filtre de butin : pas de débordement horizontal, puces touchables',
    `débord ${fState.overflowX}px, plus petite puce ${Math.round(fState.minChip)}px`,
  );
  await tapText('#panels .btn', /^standard$/);
  const close = await page.evaluate(() => {
    const b = document.querySelector('#panels .close');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  });
  if (close) {
    await touch('touchStart', [close]);
    await touch('touchEnd', []);
    await page.waitForTimeout(400);
  }
  const closed = await page.evaluate(() => !document.querySelector('#panels .panel'));
  check(closed, 'inventaire : fermeture au tap');

  /* ---------- 3-4. Combat avec le bot de jeu : captures et mesures ---------- */
  const measure = async (label, seconds) => {
    await page.evaluate(() => {
      const m = window.__arpg.metrics();
      m.frameIntervals.length = 0;
      m.worstFrame = 0;
    });
    await page.waitForTimeout(seconds * 1000);
    return page.evaluate((label) => {
      const m = window.__arpg.metrics();
      const a = [...m.frameIntervals].sort((x, y) => x - y);
      const q = (p) => a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
      const bank = window.__arpg.renderer().bank;
      return {
        label,
        frames: a.length,
        medianMs: +q(0.5).toFixed(1),
        p95Ms: +q(0.95).toFixed(1),
        worstMs: +(a[a.length - 1] ?? 0).toFixed(1),
        textureMo: +(bank.gpuBytes() / 1048576).toFixed(1),
        tier: bank.tier,
      };
    }, label);
  };
  await page.evaluate(() => {
    window.__arpg.god(false);
    window.__arpg.bot(true);
  });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: join(dir, '4-combat.png') });
  r.perf.normal = await measure('combat', QUICK ? 8 : 20);
  await page.screenshot({ path: join(dir, '5-combat-2.png') });
  if (!QUICK && name === 'iphone') {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    r.perf.throttled4x = await measure('combat CPU ×4', 20);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  console.log(`  [${name}] perf`, JSON.stringify(r.perf));
  const st = await page.evaluate(() => window.__arpg.state());
  check(st.kills > 0, 'le bot de jeu tue des monstres dans le client réel', `${st.kills} tués`);
  check(r.errors.length === 0, 'aucune erreur JavaScript', r.errors.slice(0, 3).join(' | '));
  report.devices[name] = { ...r, state: st };
  await ctx.close();
}

await browser.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(`\n${failures === 0 ? 'VALIDATION MOBILE OK' : `${failures} ÉCHEC(S)`} — rapport : ${join(OUT, 'report.json')}`);
process.exit(failures ? 1 : 0);
