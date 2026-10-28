/**
 * Lot 318 (owner: "two categories on the menu: Survivals or Normal, then Diablo II original or Project Diablo 2"): the home screen in two
 * steps, in portrait and landscape (Fold folded 344 × 882 and open 884 × 1104, phone 412 × 915 and 915 × 412, small 360 × 640, PC):
 *   K1. first step: the title, two buttons Normal and Survivals with their few words under each, no game button yet;
 *   K2. every button and its words inside the screen, on the image, ≥ 44 px in portrait, reachable by a tap, nothing over another, the
 *       words between their button and the next one; the links (Credits, update, Discord) still there and never over a button;
 *   K3. second step (Survivals, then Normal): "Project Diablo 2" and "Diablo II (original)" (the same `data-mode` ids as before:
 *       pd2+survivals, d2+survivals, pd2, d2), their words, a Back button; the same geometry checks; Back returns to the kinds;
 *   K4. keyboard and mouse (PC): Enter on a kind opens its games with the focus on one, Escape goes back;
 *   K5. a game picked: remembered (`d2m.mode`), the page reloads to its list or creation; on the next launch the menu shows again with
 *       the remembered mode's kind and game marked; 0 page error. Screenshots of each size and step.
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/home-two-steps-318.mjs [--url=http://127.0.0.1:5233/] [--shots=<dir>] [--lang=en]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HOME } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const SHOTS = args.get('shots') ?? join(process.cwd(), 'test-results', 'e2e', 'home-two-steps-318');
const LANG = args.get('lang') ?? 'en';
mkdirSync(SHOTS, { recursive: true });
const SIZES = {
  'fold-folded-344x882': { width: 344, height: 882, portrait: true },
  'fold-open-884x1104': { width: 884, height: 1104, portrait: true },
  'portrait-412x915': { width: 412, height: 915, portrait: true },
  'portrait-360x640': { width: 360, height: 640, portrait: true },
  'landscape-915x412': { width: 915, height: 412 },
  'fold-open-landscape-1104x884': { width: 1104, height: 884 },
};
const EN = LANG === 'en';
const T = {
  ask: EN ? 'Choose a game mode' : 'Choisissez un mode de jeu',
  normal: EN ? 'Campaign and endgame' : 'Campagne et fin de jeu',
  surv: EN ? 'One-act runs, wave after wave' : 'Des runs d’un acte, vague après vague',
  pd2: EN ? 'Season 13: endgame, corruption, reworked items' : 'Saison 13 : endgame, corruption, objets revus',
  d2: EN ? 'The original game, unmodified' : 'Le jeu d’origine, sans modification',
  game: (k) => (EN ? `${k} — choose the game` : `${k} — choisissez le jeu`),
  back: EN ? 'Back' : 'Retour',
};
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};

/** What the home screen shows: its step, title, buttons (kinds or games, Back), the words under them, the links */
const measure = (page) =>
  page.evaluate(() => {
    const r = (e) => {
      const b = e.getBoundingClientRect();
      return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) };
    };
    const box = document.querySelector('.charselect.d2s');
    const hit = (e) => {
      const b = e.getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!top && (top === e || e.contains(top));
    };
    const buttons = [...document.querySelectorAll('[data-act="modetype"], [data-act="mode"], [data-act="modeback"]')];
    const bg = document.querySelector('.d2s .d2bg');
    return {
      W: innerWidth,
      H: innerHeight,
      step: box?.dataset.step,
      pmenu: !!box?.classList.contains('pmenu'),
      title: document.querySelector('.d2s .d2t.sub')?.textContent ?? '',
      buttons: buttons.map((b) => ({ act: b.dataset.act, id: b.dataset.type ?? b.dataset.mode ?? '', text: b.textContent, cur: b.classList.contains('cur'), ...r(b) })),
      tags: [...document.querySelectorAll('.d2s .d2t.mdesc')].map((t) => ({ text: t.textContent, ...r(t) })),
      links: [...document.querySelectorAll('.d2s .d2b.link')].map(r),
      bg: bg ? r(bg) : null,
      hits: buttons.every(hit),
    };
  });

const inside = (b, m) => b.l >= -1 && b.t >= -1 && b.r <= m.W + 1 && b.b <= m.H + 1;
const overlap = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;

/** K2: geometry of a step at one size */
function geometry(m, name, portrait, step) {
  const all = [...m.buttons, ...m.tags];
  check(
    all.every((b) => inside(b, m)) && m.links.every((b) => inside(b, m)),
    `K2 ${name} ${step}: every button, its words and the links inside the screen`,
    JSON.stringify({ W: m.W, H: m.H, buttons: m.buttons.map((b) => [b.id || b.act, b.t, b.b]), tags: m.tags.map((t) => [t.t, t.b]) }),
  );
  check(!portrait || m.buttons.every((b) => b.h >= 44), `K2 ${name} ${step}: buttons ≥ 44 px in portrait`, m.buttons.map((b) => b.h).join(','));
  check(m.hits, `K2 ${name} ${step}: every button reachable by a tap`);
  const clash = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (overlap(all[i], all[j])) clash.push(`${all[i].text}/${all[j].text}`);
  for (const l of m.links) for (const b of all) if (overlap(l, b)) clash.push(`link/${b.text}`);
  check(!clash.length, `K2 ${name} ${step}: nothing over another`, clash.join(' | '));
  // each button's words right under it, above the next button
  const choices = m.buttons.filter((b) => b.act !== 'modeback');
  const placed = choices.every((b, i) => {
    const t = m.tags[i];
    const next = m.buttons[i + 1];
    return !!t && t.t >= b.b - 2 && t.t - b.b <= 24 && (!next || t.b <= next.t + 1) && Math.abs((t.l + t.r) / 2 - (b.l + b.r) / 2) <= 4;
  });
  check(placed && m.tags.length === choices.length, `K2 ${name} ${step}: the words under each button`, JSON.stringify(m.tags));
  if (portrait) check(m.pmenu && !!m.bg && m.bg.h >= 0.6 * m.H, `K2 ${name} ${step}: portrait home screen, the image ≥ 60 % of the height`, JSON.stringify(m.bg));
  else check(!m.pmenu, `K2 ${name} ${step}: landscape, the 800 × 600 stage`);
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 344, height: 882 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await page.addInitScript((lang) => {
    if (!sessionStorage.getItem('e2e.init')) {
      localStorage.clear();
      localStorage.setItem('d2m.testchar.v1', '1');
      sessionStorage.setItem('e2e.init', '1');
    }
    localStorage.setItem('d2m.lang', lang);
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  }, LANG);
  const home = async () => {
    await page.waitForSelector('.d2c, .charselect', { timeout: 120000 });
    if (await page.$('.d2c')) await page.click('.d2c-skip');
    await page.waitForSelector(HOME, { timeout: 90000 });
    // the English dictionary is a chunk of its own
    if (EN) await page.waitForFunction((ask) => document.querySelector('.d2s .d2t.sub')?.textContent === ask, T.ask, { timeout: 30000 }).catch(() => undefined);
  };
  await page.goto(URL);
  await home();
  check(!!(await page.$('.charselect.d2s')), 'the Diablo II home screen (art present)');

  for (const [name, vp] of Object.entries(SIZES)) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(600);
    // K1: the kinds
    if (await page.$('[data-act="modeback"]')) await page.tap('[data-act="modeback"]');
    const k = await measure(page);
    check(
      k.step === 'kind' &&
        k.title === T.ask &&
        JSON.stringify(k.buttons.map((b) => [b.act, b.id, b.text])) ===
          JSON.stringify([
            ['modetype', 'normal', 'Normal'],
            ['modetype', 'survivals', 'Survivals'],
          ]) &&
        JSON.stringify(k.tags.map((t) => t.text)) === JSON.stringify([T.normal, T.surv]),
      `K1 ${name}: "${T.ask}", Normal and Survivals with their words, no game yet`,
      JSON.stringify({ step: k.step, title: k.title, buttons: k.buttons.map((b) => b.text), tags: k.tags.map((t) => t.text) }),
    );
    check(k.links.length >= 3, `K2 ${name}: the links still there (Credits, update, Discord)`, String(k.links.length));
    geometry(k, name, vp.portrait, 'kinds');
    await page.screenshot({ path: join(SHOTS, `${name}-1-kinds.png`) });
    // K3: each kind's games, then Back
    for (const [kind, label, ids] of [
      ['survivals', 'Survivals', ['pd2+survivals', 'd2+survivals']],
      ['normal', 'Normal', ['pd2', 'd2']],
    ]) {
      await page.tap(`[data-act="modetype"][data-type="${kind}"]`);
      await page.waitForTimeout(300);
      const g = await measure(page);
      check(
        g.step === 'game' &&
          g.title === T.game(label) &&
          JSON.stringify(g.buttons.map((b) => [b.act, b.id, b.text])) ===
            JSON.stringify([
              ['mode', ids[0], 'Project Diablo 2'],
              ['mode', ids[1], 'Diablo II (original)'],
              ['modeback', '', T.back],
            ]) &&
          JSON.stringify(g.tags.map((t) => t.text)) === JSON.stringify([T.pd2, T.d2]),
        `K3 ${name} ${label}: Project Diablo 2 and Diablo II (original) (${ids.join(', ')}), their words, Back`,
        JSON.stringify({ step: g.step, title: g.title, buttons: g.buttons.map((b) => [b.id, b.text]), tags: g.tags.map((t) => t.text) }),
      );
      geometry(g, name, vp.portrait, label);
      await page.screenshot({ path: join(SHOTS, `${name}-2-${kind}.png`) });
      await page.tap('[data-act="modeback"]');
      await page.waitForTimeout(200);
      check((await measure(page)).step === 'kind', `K3 ${name} ${label}: Back returns to the kinds`);
    }
  }
  await ctx.close();

  // K4: keyboard and mouse on a PC window
  const pc = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p2 = await pc.newPage();
  p2.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await p2.addInitScript((lang) => {
    if (!sessionStorage.getItem('e2e.init')) {
      localStorage.clear();
      localStorage.setItem('d2m.testchar.v1', '1');
      sessionStorage.setItem('e2e.init', '1');
    }
    localStorage.setItem('d2m.lang', lang);
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  }, LANG);
  await p2.goto(URL);
  await p2.waitForSelector('.d2c, .charselect', { timeout: 120000 });
  if (await p2.$('.d2c')) await p2.click('.d2c-skip');
  await p2.waitForSelector('[data-act="modetype"]', { timeout: 90000 });
  const pm = await measure(p2);
  geometry(pm, 'pc-1440x900', false, 'kinds');
  await p2.focus('[data-act="modetype"][data-type="survivals"]');
  await p2.keyboard.press('Enter');
  await p2.waitForTimeout(200);
  const focused = await p2.evaluate(() => [document.querySelector('.charselect')?.dataset.step, document.activeElement?.dataset.act, document.activeElement?.dataset.mode]);
  check(focused[0] === 'game' && focused[1] === 'mode' && /\+survivals$/.test(focused[2] ?? ''), 'K4 pc: Enter on Survivals opens its games, the focus on one', JSON.stringify(focused));
  await p2.keyboard.press('Escape');
  await p2.waitForTimeout(200);
  const esc = await p2.evaluate(() => [document.querySelector('.charselect')?.dataset.step, document.activeElement?.dataset.act]);
  check(esc[0] === 'kind' && esc[1] === 'modetype', 'K4 pc: Escape goes back to the kinds (focus on a kind)', JSON.stringify(esc));
  await p2.hover('[data-act="modetype"][data-type="normal"]');
  await p2.mouse.down();
  await p2.mouse.up();
  await p2.waitForTimeout(200);
  check((await measure(p2)).step === 'game', 'K4 pc: a mouse click on Normal opens its games');
  await p2.screenshot({ path: join(SHOTS, 'pc-1440x900-2-normal.png') });
  await p2.click('[data-act="modeback"]');

  // K5: a game picked is remembered; the page reloads to its list / creation; the next launch marks it
  await p2.click('[data-act="modetype"][data-type="survivals"]');
  await p2.click('[data-act="mode"][data-mode="d2+survivals"]');
  await p2.waitForSelector('.sel-slot, .d2input, .charselect input', { timeout: 120000 });
  check((await p2.evaluate(() => localStorage.getItem('d2m.mode'))) === 'd2+survivals', 'K5: the game picked is remembered (d2m.mode = d2+survivals)');
  await p2.goto(URL);
  await p2.waitForSelector('.d2c, .charselect', { timeout: 120000 });
  if (await p2.$('.d2c')) await p2.click('.d2c-skip');
  await p2.waitForSelector('[data-act="modetype"]', { timeout: 90000 });
  const cur1 = (await measure(p2)).buttons.filter((b) => b.cur).map((b) => b.id);
  await p2.click('[data-act="modetype"][data-type="survivals"]');
  const cur2 = (await measure(p2)).buttons.filter((b) => b.cur).map((b) => b.id);
  check(
    JSON.stringify(cur1) === '["survivals"]' && JSON.stringify(cur2) === '["d2+survivals"]',
    'K5: next launch, the home screen with the remembered kind and game marked',
    JSON.stringify({ cur1, cur2 }),
  );
  check(errs.length === 0, '0 page error', errs.join(' | '));
} finally {
  await browser.close();
}
console.log(fails ? `${fails} failure(s)` : 'all good');
process.exit(fails ? 1 : 0);
