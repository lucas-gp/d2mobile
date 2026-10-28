/**
 * Coffre › Runes / Gemmes : détail au toucher, actions fixes visibles sans défiler, sertissage par bouton (liste flottante) et par glisser-déposer (900 × 800 : sac et coffre côte à côte ; en 740 × 360 le glisser entre volets n'existe pas, voir stash-layout.mjs).
 *   PLAYWRIGHT_BROWSERS_PATH=... node tools/e2e/stash-runes.mjs [--url=http://127.0.0.1:5233/]
 * Captures : test-results/e2e/stash-runes/*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = join(process.cwd(), 'test-results', 'e2e', 'stash-runes');
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await b.newContext({ viewport: { width: 900, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem('d2m.lang', 'fr');
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
});
await page.goto(URL + '?testchar=1');
await page.waitForSelector('.charselect.d2s', { timeout: 90000 });
await pickFirstMode(page);
await page.waitForSelector('.d2plate');
await page.click('.d2plate:has-text("99")');
await page.click('.d2b.ok');
await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 180000 });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const g = window.__arpg.game();
  const c = g.character;
  c.materials = { r01: 3, r02: 2, r08: 4, gem_ruby_2: 3, gem_diamond_0: 2 };
  c.inventory = c.inventory.map(() => null);
  window.__arpg.giveItem('short_sword', { forceQuality: 'normal', ilvl: 20 });
  const it = c.inventory.find((x) => x?.base === 'short_sword');
  it.sockets = 2;
  it.socketed = [];
  window.__arpg.app.openPanel('stash');
});
await page.waitForTimeout(600);
const inZone = (sel, text) =>
  page.evaluate(
    ([s, t]) => {
      const n = [...document.querySelectorAll(s)].find((x) => !t || x.textContent.trim().startsWith(t));
      if (!n) return 'absent';
      const r = n.getBoundingClientRect();
      const body = document.querySelector('.panel .body').getBoundingClientRect();
      return r.top >= body.top - 1 && r.bottom <= body.bottom + 1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1
        ? 'ok'
        : `hors zone y ${Math.round(r.top)}-${Math.round(r.bottom)} / ${Math.round(body.top)}-${Math.round(body.bottom)}`;
    },
    [sel, text],
  );
const tab = async (t) => {
  if (await page.$('[data-testid="pane-chest"]')) await page.click('[data-testid="pane-chest"]');
  await page.click(`[data-testid="stash-top-${t.toLowerCase()}"]`);
  await page.waitForTimeout(300);
};

await page.screenshot({ path: join(OUT, 'dbg0.png') });
await tab('Runes');
await page.click('.rescell[data-res="r08"]');
await page.waitForTimeout(300);
const tip = await page.evaluate(() => document.querySelector('.panel .tip')?.textContent ?? '');
check(/Rune Ral/.test(tip) && /Arme/.test(tip) && /Bouclier/.test(tip), 'info-bulle de la rune (nom, effets arme/armure/bouclier)', tip.slice(0, 120));
for (const t of ['Prendre', 'Sertir', 'Cube']) check((await inZone('.actcol button', t)) === 'ok', `« ${t} » visible sans défiler`, await inZone('.actcol button', t));
await page.screenshot({ path: join(OUT, 'runes-detail.png') });

// Sertir par bouton
await page.evaluate(() => [...document.querySelectorAll('.actcol button')].find((x) => x.textContent.startsWith('Sertir'))?.click());
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, 'runes-sertir.png') });
await page.evaluate(() => [...document.querySelectorAll('.actmenu button')].find((x) => /Épée courte|Short|sac/.test(x.textContent))?.click());
await page.waitForTimeout(300);
let st = await page.evaluate(() => {
  const c = window.__arpg.game().character;
  const it = c.inventory.find((x) => x?.base === 'short_sword');
  return { socketed: it.socketed.length, ral: c.materials.r08 };
});
check(st.socketed === 1 && st.ral === 3, 'sertissage par bouton', JSON.stringify(st));

// Glisser (souris) rune -> objet à châsses du sac
const pos = await page.evaluate(() => {
  const g = window.__arpg.game();
  const idx = g.character.inventory.findIndex((x) => x?.base === 'short_sword');
  const src = document.querySelector('.rescell[data-res="r02"]').getBoundingClientRect();
  const dst = document.querySelector(`[data-inv="${idx}"]`)?.getBoundingClientRect() ?? null;
  return { src: [src.x + src.width / 2, src.y + src.height / 2], dst: dst ? [dst.x + dst.width / 2, dst.y + dst.height / 2] : null };
});
check(!!pos.dst, 'case du sac visible pendant l’onglet Runes');
if (pos.dst) {
  await page.mouse.move(...pos.src);
  await page.mouse.down();
  await page.mouse.move(pos.src[0] + 20, pos.src[1] + 5, { steps: 3 });
  await page.mouse.move(...pos.dst, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  st = await page.evaluate(() => {
    const c = window.__arpg.game().character;
    const it = c.inventory.find((x) => x?.base === 'short_sword');
    return { socketed: it.socketed.map((s) => s.base), eld: c.materials.r02, rw: it.runeword };
  });
  check(st.socketed.length === 2 && st.eld === 1, 'glisser une rune sur un objet à châsses du sac', JSON.stringify(st));
}
// Glisser rune -> case vide du sac
const empty = await page.evaluate(() => {
  const c = window.__arpg.game().character;
  const cells = [...document.querySelectorAll('.panel .d2cell, .panel .grid .cell')];
  void cells;
  void c;
  const inner = document.querySelector('.panel .d2inner, .panel .d2wrap, .panel .d2')?.getBoundingClientRect();
  return inner ? [inner.x, inner.y, inner.width, inner.height] : null;
});
void empty;
await page.screenshot({ path: join(OUT, 'runes-apres-glisser.png') });

// Gemmes
await tab('Gemmes');
await page.click('.rescell[data-res="gem_ruby_2"]');
await page.waitForTimeout(300);
const gt = await page.evaluate(() => document.querySelector('.panel .tip')?.textContent ?? '');
check(/Rubis/.test(gt) && /Arme/.test(gt), 'info-bulle de la gemme', gt.slice(0, 100));
await page.screenshot({ path: join(OUT, 'gemmes-detail.png') });
await page.evaluate(() => [...document.querySelectorAll('.actcol button')].find((x) => x.textContent.startsWith('Prendre'))?.click());
await page.waitForTimeout(300);
st = await page.evaluate(() => {
  const c = window.__arpg.game().character;
  return { inv: c.inventory.filter((x) => x?.base === 'gem_ruby_2').length, tab: c.materials.gem_ruby_2 };
});
check(st.inv === 1 && st.tab === 2, 'prendre une gemme dans le sac', JSON.stringify(st));
check(errors.length === 0, 'aucune erreur de page', errors.join(' | '));
await b.close();
process.exit(fails ? 1 : 0);
