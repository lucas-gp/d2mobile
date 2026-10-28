/**
 * Colonne d'actions d'objet : liste flottante « Artisanat », « Jeter » fixe, châsses (Larzuk, recettes du Cube), un seul menu ouvert, Échap, clic extérieur.
 *   node tools/e2e/socket-menu.mjs [--url=http://127.0.0.1:5233/]
 * Captures : test-results/e2e/socket-menu/*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = join(process.cwd(), 'test-results', 'e2e', 'socket-menu');
mkdirSync(OUT, { recursive: true });
const DEVS = { 'android-petit': [740, 360, true], 'fold-carre': [900, 800, true], pc: [1920, 1080, false] };
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ONLY = args.get('dev');
  for (const [name, [width, height, mobile]] of Object.entries(DEVS)) {
    if (ONLY && name !== ONLY) continue;
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: 'fr-FR' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('d2m.lang', 'fr');
    });
    await page.goto(URL + '?testchar=1');
    const ready = () => page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 180000 });
    await page.waitForSelector('.charselect.d2s', { timeout: 90000 }).catch(() => {});
    if (await page.$('.charselect.d2s')) {
      await pickFirstMode(page);
      await page.waitForSelector('.d2plate');
      await page.click('.d2plate:has-text("99")');
      await page.click('.d2b.ok');
    }
    await ready();
    await page.evaluate(() => {
      window.__arpg.setLevel(60);
      window.__arpg.town();
    });
    await ready();
    await page.evaluate(() => {
      const g = window.__arpg.game();
      const c = g.character;
      c.progression.milestones[`quest:siege:${g.difficulty}`] = 1;
      delete c.progression.milestones[`socketq:${g.difficulty}`];
      for (const k of ['r08', 'r11', 'gem_amethyst_4']) c.materials[k] = 1;
      g.settings.confirmCorrupt = true;
      c.materials.worldstone_shard = 2;
      c.inventory.fill(null);
      for (let i = 0; i < 3; i++) window.__arpg.giveItem('long_sword', { forceQuality: 'normal', ilvl: 60 });
      window.__arpg.giveItem('ring', { forceQuality: 'rare', ilvl: 60 });
      for (const it of c.inventory)
        if (it && it.base === 'long_sword') {
          it.sockets = 0;
          it.socketed = [];
        }
      window.__arpg.app.panels.show('inventory');
    });
    await page.waitForTimeout(300);
    const swords = () =>
      page.evaluate(() =>
        window.__arpg
          .game()
          .character.inventory.map((x, i) => (x?.base === 'long_sword' ? i : -1))
          .filter((i) => i >= 0),
      );
    const sel = (ref) =>
      page.evaluate((r) => {
        window.__arpg.app.panels.sel = r;
        window.__arpg.app.panels.refresh();
      }, ref);
    const sockets = (i) => page.evaluate((i) => window.__arpg.game().character.inventory[i].sockets, i);
    const inView = (s) =>
      page.evaluate((s) => {
        const b = document.querySelector(s);
        if (!b) return 'absent';
        const r = b.getBoundingClientRect();
        const body = document.querySelector('.panel .body').getBoundingClientRect();
        return r.top >= body.top - 1 && r.bottom <= body.bottom + 1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1
          ? 'ok'
          : `hors zone y ${Math.round(r.top)}-${Math.round(r.bottom)} / ${Math.round(body.top)}-${Math.round(body.bottom)}`;
      }, s);
    const has = (a) => page.$(`[data-act="${a}"]`).then((x) => !!x);
    const [s0, s1, s2] = await swords();
    await sel({ from: 'inv', idx: s0 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(OUT, `${name}-1-barre.png`) });
    for (const a of ['craft-menu', 'drop']) check((await inView(`[data-act="${a}"]`)) === 'ok', `${name} : ${a} visible sans défiler`, await inView(`[data-act="${a}"]`));
    check((await page.textContent('.actcol [data-slot="use"]')).startsWith('Équiper'), `${name} : première action « Équiper » (grisée si Force insuffisante)`);
    // menu Artisanat
    await page.click('[data-act="craft-menu"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, `${name}-2-artisanat.png`) });
    check((await has('larzuk')) && (await has('sock-sock_weapon')) && (await has('sock-sock_puzzlebox')) && (await has('sock-sock_puzzlepiece')), `${name} : Larzuk + 3 recettes d'arme listées`);
    check(!(await has('sock-sock_armor')), `${name} : pas de recette d'armure pour une épée`);
    check(
      await page.evaluate(() => !!document.querySelector('.actcol > [data-act="corrupt"]') && !document.querySelector('.actmenu [data-act="corrupt"]')),
      `${name} : « Corrompre » : bouton fixe de la colonne, pas dans la liste`,
    );
    const m = await page.evaluate(() => {
      const l = document.querySelector('.actmenu');
      const rows = [...l.querySelectorAll('.actmenu-item')].map((r) => r.getBoundingClientRect().height);
      return { ov: getComputedStyle(l).overflowY, h: l.getBoundingClientRect().height, max: innerHeight * 0.34 + 2, minRow: Math.min(...rows), sh: l.scrollHeight, ch: l.clientHeight };
    });
    check(m.ov !== 'visible' && m.h <= height, `${name} : liste flottante bornée et défilante`, JSON.stringify(m));
    check(m.minRow >= 43.5, `${name} : lignes ≥ 44 px`, String(m.minRow));
    const lz = await page.textContent('[data-act="larzuk"]');
    check(lz.includes('Percer (Larzuk)') && lz.includes('1 utilisation restante'), `${name} : Larzuk disponible (« 1 utilisation restante »)`, lz.replace(/\s+/g, ' '));
    const sw = await page.textContent('[data-act="sock-sock_weapon"]');
    check(sw.includes('Améthyste') && sw.includes('1/1'), `${name} : recette d'arme : coût et stock`, sw.replace(/\s+/g, ' '));
    // un seul menu à la fois
    check((await page.$$('.actmenu')).length === 1 && (await has('drop')), `${name} : une seule liste dépliée, « Jeter » toujours en place`);
    await page.click('[data-act="craft-menu"]');
    await page.waitForTimeout(200);
    check((await page.$$('.actmenu')).length === 0, `${name} : rappuyer sur Artisanat referme la liste`);
    await page.click('[data-act="craft-menu"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(OUT, `${name}-3-liste.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    check((await page.$$('.actmenu')).length === 0 && (await page.$('.panel')) !== null, `${name} : Échap ferme le menu sans fermer le panneau`);
    await page.click('[data-act="craft-menu"]');
    await page.waitForTimeout(150);
    await page.mouse.click(width - 8, 8);
    await page.waitForTimeout(150);
    check((await page.$$('.actmenu')).length === 0, `${name} : clic extérieur ferme le menu`);
    // Larzuk
    await page.click('[data-act="craft-menu"]');
    await page.click('[data-act="larzuk"]');
    await page.waitForTimeout(200);
    const ask = await page.textContent('.actmenu-ask');
    check(ask.includes('Il n’y en a qu’une par difficulté') && ask.includes('Résultat attendu'), `${name} : confirmation légère avec résultat attendu`, ask.replace(/\s+/g, ' '));
    await page.screenshot({ path: join(OUT, `${name}-4-larzuk.png`) });
    check((await sockets(s0)) === 0, `${name} : rien avant confirmation`);
    await page.click('[data-act="larzuk-ok"]');
    await page.waitForTimeout(250);
    const n0 = await sockets(s0);
    check(n0 > 0, `${name} : Larzuk a percé l'épée`, `${n0} châsses`);
    // deuxième épée : Larzuk utilisé, recette du Cube
    await sel({ from: 'inv', idx: s1 });
    await page.waitForTimeout(200);
    await page.click('[data-act="craft-menu"]');
    await page.waitForTimeout(150);
    const lz2 = await page.textContent('[data-act="larzuk"]');
    check(lz2.includes('déjà utilisée') || lz2.includes('Déjà utilisée'), `${name} : Larzuk grisé « Déjà utilisée à cette difficulté »`, lz2.replace(/\s+/g, ' '));
    await page.click('[data-act="larzuk"]');
    check((await sockets(s1)) === 0, `${name} : clic sur ligne grisée : sans effet`);
    await page.click('[data-act="sock-sock_weapon"]');
    await page.waitForTimeout(150);
    await page.click('[data-act="sock-ok"]');
    await page.waitForTimeout(250);
    const n1 = await sockets(s1);
    const mats = await page.evaluate(() => ['r08', 'r11', 'gem_amethyst_4'].map((k) => window.__arpg.game().character.materials[k] ?? 0));
    check(n1 > 0 && mats.every((x) => x === 0), `${name} : recette du Cube appliquée sur place`, `${n1} châsses, stock ${mats}`);
    await page.screenshot({ path: join(OUT, `${name}-5-apres-cube.png`) });
    // troisième épée : recette grisée faute d'ingrédients
    await sel({ from: 'inv', idx: s2 });
    await page.waitForTimeout(200);
    await page.click('[data-act="craft-menu"]');
    await page.waitForTimeout(150);
    const sw3 = await page.textContent('[data-act="sock-sock_weapon"]');
    check(sw3.includes('Il manque'), `${name} : recette grisée « Il manque… »`, sw3.replace(/\s+/g, ' '));
    // coffre : même menu
    await page.evaluate((i) => {
      const c = window.__arpg.game().character;
      c.stash[0] ??= [];
      c.stash[0][0] = c.inventory[i];
      c.inventory[i] = null;
      window.__arpg.app.panels.sel = null;
      window.__arpg.app.panels.show('stash');
    }, s2);
    await page.waitForTimeout(300);
    await sel({ from: 'stash', tab: 0, idx: 0 });
    await page.waitForTimeout(250);
    check((await has('craft-menu')) && (await has('drop')), `${name} : coffre : même colonne d'actions`);
    if (!(await has('larzuk'))) await page.click('[data-act="craft-menu"]');
    await page.waitForTimeout(150);
    check(await has('larzuk'), `${name} : coffre : Larzuk dans Artisanat`);
    await page.screenshot({ path: join(OUT, `${name}-6-coffre.png`) });
    check(errors.length === 0, `${name} : aucune erreur de page`, errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
