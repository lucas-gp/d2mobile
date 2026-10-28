/**
 * Mise en page du coffre (maquette du joueur) : onglets en haut, Personnage | Coffre | Objet | colonne d'actions, les 4 zones TOUJOURS côte à côte (échelle réduite au besoin), actions sur UNE colonne.
 * Vérifie : zones présentes, colonne d'actions complète et STABLE d'un objet à l'autre (arme, rune, carte), aucun débordement, boutons dans l'écran,
 * sélection par tap, action principale (Déposer / Prendre / Équiper), double-toucher.
 *   node tools/e2e/stash-layout.mjs [--url=http://127.0.0.1:5233/] [--sizes=900x800,740x360]
 * Captures : test-results/e2e/stash-layout/*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const SIZES = (args.get('sizes') ?? '840x800,880x780,900x800,960x860,1000x900,1100x900,740x360,800x360,844x390,1280x720,1920x1080,720x720').split(',').map((z) => z.split('x').map(Number));
const OUT = join(process.cwd(), 'test-results', 'e2e', 'stash-layout');
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
const SLOTS = ['use', 'move', 'cube', 'corrupt', 'craft', 'merc', 'hl', 'drop'];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const [width, height] of SIZES) {
    const name = `${width}x${height}`;
    const mobile = width < 500 || height < 500;
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: 'fr-FR' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
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
        c.inventory.fill(null);
        c.stash.forEach((t) => t.fill(null));
        c.materials.r08 = 3;
        g.settings.confirmCorrupt = true;
        window.__arpg.giveItem('short_sword', { forceQuality: 'magic', ilvl: 60 });
        window.__arpg.giveItem('long_bow', { forceQuality: 'rare', ilvl: 60 });
        window.__arpg.giveMap(2, 'rare');
        window.__arpg.app.openPanel('stash');
      });
      await page.waitForSelector('.panel [data-zone="actions"]');
      await page.waitForTimeout(400);
      const zones = await page.evaluate(() => ['char', 'chest', 'item', 'actions'].filter((z) => document.querySelector(`.panel [data-zone="${z}"]`)));
      const toggle = await page.$('[data-zone="pane-toggle"]');
      check(zones.includes('item') && zones.includes('actions'), `${name} : colonnes Objet et Actions présentes`, zones.join(','));
      check(!toggle && zones.length === 4, `${name} : 4 zones côte à côte (Personnage, Coffre, Objet, Actions), pas de volets`, zones.join(','));
      const lay = await page.evaluate(() => {
        const r = (z) => document.querySelector(`.panel [data-zone="${z}"]`).getBoundingClientRect();
        const [c, h, i, a] = ['char', 'chest', 'item', 'actions'].map(r);
        return { ordre: c.right <= h.left + 1 && h.right <= i.left + 1 && i.right <= a.left + 1, k: Math.round((c.width / 320) * 100) / 100, itemW: Math.round(i.width), actW: Math.round(a.width) };
      });
      check(lay.ordre, `${name} : ordre Personnage | Coffre | Objet | Actions, échelle ${lay.k}, objet ${lay.itemW} px, actions ${lay.actW} px`);
      const tabs = await page.evaluate(() => [...document.querySelectorAll('.panel header .tabs .btn')].map((b) => b.textContent.trim()));
      check(
        tabs.join('|') === 'Inventaire|Personnage|Compétences|Réglages' || tabs.join('|') === 'Inventaire|Personnage|Compétences|Mercenaire|Réglages',
        `${name} : barre d'onglets du haut`,
        tabs.join('|'),
      );
      const hdr = await page.evaluate(() => {
        const h = document.querySelector('.panel header').getBoundingClientRect();
        const t = document.querySelector('.panel header .tabs').getBoundingClientRect();
        return h.width > h.height * 4 && t.width > t.height * 4;
      });
      check(hdr, `${name} : barre d'onglets horizontale`);
      const pane = async () => {};
      const rects = () =>
        page.evaluate((slots) => {
          const out = {};
          for (const s of slots) {
            const b = document.querySelector(`.actcol [data-slot="${s}"]`);
            if (!b) {
              out[s] = null;
              continue;
            }
            const r = b.getBoundingClientRect();
            out[s] = [Math.round(r.left * 2) / 2, Math.round(r.top * 2) / 2, Math.round(r.width * 2) / 2, Math.round(r.height * 2) / 2];
          }
          return out;
        }, SLOTS);
      const snaps = {};
      const state = (s) =>
        page.evaluate(
          (s) => ({
            txt: Object.fromEntries(s.map((k) => [k, document.querySelector(`.actcol [data-slot="${k}"]`)?.textContent])),
            dis: Object.fromEntries(s.map((k) => [k, document.querySelector(`.actcol [data-slot="${k}"]`)?.classList.contains('disabled')])),
          }),
          SLOTS,
        );
      const fit = async (label) => {
        const m = await page.evaluate(() => {
          const body = document.querySelector('.panel .body');
          const pr = document.querySelector('.panel').getBoundingClientRect();
          const bad = [];
          if (body.scrollWidth > body.clientWidth + 1) bad.push(`défilement horizontal ${body.scrollWidth}>${body.clientWidth}`);
          if (pr.right > innerWidth + 1 || pr.bottom > innerHeight + 1) bad.push('panneau hors écran');
          for (const e of document.querySelectorAll('.panel .body button, .panel header button')) {
            const r = e.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            const sc = e.closest('.scroll');
            if (sc) {
              const s = sc.getBoundingClientRect();
              if (r.bottom > s.bottom + 1 || r.top < s.top - 1) continue;
            }
            if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1)
              bad.push(`hors écran : ${(e.textContent || e.className).trim().slice(0, 16)} [${Math.round(r.left)}..${Math.round(r.right)} / ${Math.round(r.top)}..${Math.round(r.bottom)}]`);
          }
          // les boutons d'action : dans la zone du corps, sans défilement
          const bb = body.getBoundingClientRect();
          for (const e of document.querySelectorAll('.actcol .actbtn')) {
            const r = e.getBoundingClientRect();
            if (r.top < bb.top - 1 || r.bottom > bb.bottom + 1 || r.height < 36)
              bad.push(`action ${e.dataset.slot} ${Math.round(r.top)}..${Math.round(r.bottom)} h${Math.round(r.height)} / corps ${Math.round(bb.top)}..${Math.round(bb.bottom)}`);
          }
          return bad.slice(0, 6);
        });
        check(m.length === 0, `${name} : ${label} : pas de débordement, actions ≥ 36 px dans le corps`, m.join(' ; '));
      };
      const selectInv = async (base) => {
        await pane('bag');
        const i = await page.evaluate((b) => window.__arpg.game().character.inventory.findIndex((x) => x?.base === b || (b === 'map' && x?.map)), base);
        await page.evaluate((i) => document.querySelector(`.cell[data-inv="${i}"]`).click(), i);
        await page.waitForTimeout(150);
        return i;
      };
      // aucun objet
      snaps.none = await rects();
      check(
        SLOTS.every((s) => snaps.none[s]),
        `${name} : les 8 boutons d'action sont là sans objet choisi`,
      );
      check(
        SLOTS.every((s) => snaps.none[s][0] === snaps.none.use[0] && snaps.none[s][2] === snaps.none.use[2]),
        `${name} : une seule colonne (même x et même largeur)`,
        JSON.stringify(snaps.none),
      );
      await fit('sans sélection');
      // arme du sac
      await selectInv('short_sword');
      snaps.weapon = await rects();
      const st = await state(SLOTS);
      check(/Déposer/.test(st.txt.move) && /Équiper/.test(st.txt.use), `${name} : arme du sac : « Équiper » et « Déposer au coffre »`, `${st.txt.use} / ${st.txt.move}`);
      await page.screenshot({ path: join(OUT, `${name}-arme.png`) });
      await fit('arme');
      // carte du sac
      await selectInv('map');
      snaps.map = await rects();
      const stm = await state(SLOTS);
      check(/Ouvrir/.test(stm.txt.use) && /Améliorer/.test(stm.txt.craft), `${name} : carte : « Ouvrir la carte » et « Améliorer »`, `${stm.txt.use} / ${stm.txt.craft}`);
      await fit('carte');
      // rune de l'onglet Runes
      await pane('chest');
      await page.click('[data-testid="stash-top-runes"]');
      await page.waitForTimeout(200);
      await page.evaluate(() => document.querySelector('[data-res="r08"]').click());
      await page.waitForTimeout(200);
      snaps.rune = await rects();
      const str = await state(SLOTS);
      check(/Prendre/.test(str.txt.move) && /Sertir/.test(str.txt.craft), `${name} : rune : « Prendre dans le sac » et « Sertir dans… »`, `${str.txt.move} / ${str.txt.craft}`);
      await page.screenshot({ path: join(OUT, `${name}-rune.png`) });
      await fit('rune');
      const same = (a, b) => SLOTS.every((s) => a[s] && b[s] && a[s].every((v, k) => Math.abs(v - b[s][k]) < 0.6));
      check(
        same(snaps.none, snaps.weapon) && same(snaps.weapon, snaps.map) && same(snaps.map, snaps.rune),
        `${name} : positions des 8 boutons identiques (aucun, arme, carte, rune)`,
        JSON.stringify(['none', 'weapon', 'map', 'rune'].filter((k) => !same(snaps.none, snaps[k]))),
      );
      // la rune sort dans le sac
      const before = await page.evaluate(() => window.__arpg.game().character.materials.r08);
      await page.click('.actcol [data-slot="move"]');
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => window.__arpg.game().character.materials.r08);
      check(after === before - 1, `${name} : « Prendre dans le sac » sort une rune`, `${before} → ${after}`);
      // onglet Coffre : déposer l'arme, la reprendre
      await page.click('[data-testid="stash-top-coffre"]');
      await page.waitForTimeout(200);
      const w = await selectInv('short_sword');
      await page.click('.actcol [data-slot="move"]');
      await page.waitForTimeout(250);
      let n = await page.evaluate(
        () =>
          window.__arpg
            .game()
            .character.stash.flat()
            .filter((x) => x?.base === 'short_sword').length,
      );
      check(n === 1 && (await page.evaluate((i) => window.__arpg.game().character.inventory[i]?.base !== 'short_sword', w)), `${name} : « Déposer au coffre » range l'arme`);
      await pane('chest');
      await page.evaluate(() => document.querySelector('.panel [data-zone="chest"] .cell[data-col]').click());
      await page.waitForTimeout(200);
      snaps.stash = await rects();
      const sts = await state(SLOTS);
      check(/Prendre/.test(sts.txt.move) && same(snaps.none, snaps.stash), `${name} : objet du coffre : « Prendre », mêmes positions`, sts.txt.move);
      await page.screenshot({ path: join(OUT, `${name}-coffre.png`) });
      await page.click('.actcol [data-slot="move"]');
      await page.waitForTimeout(250);
      n = await page.evaluate(() => window.__arpg.game().character.inventory.filter((x) => x?.base === 'short_sword').length);
      check(n === 1, `${name} : « Prendre » remet l'arme dans le sac`);
      // équiper (arme du sac)
      await selectInv('short_sword');
      await page.click('.actcol [data-slot="use"]');
      await page.waitForTimeout(250);
      check(await page.evaluate(() => window.__arpg.game().character.equipment.mainhand?.base === 'short_sword'), `${name} : « Équiper » équipe l'arme`);
      // double-toucher : arc du sac → coffre
      await pane('bag');
      const bow = await page.evaluate(() => window.__arpg.game().character.inventory.findIndex((x) => x?.base === 'long_bow'));
      await page.dblclick(`.cell[data-inv="${bow}"]`);
      await page.waitForTimeout(300);
      check(
        await page.evaluate(() =>
          window.__arpg
            .game()
            .character.stash.flat()
            .some((x) => x?.base === 'long_bow'),
        ),
        `${name} : double-toucher dépose l'objet au coffre`,
      );
      // Artisanat : liste flottante, contenue dans l'écran
      await selectInv('map');
      await page.click('.actcol [data-slot="craft"]');
      await page.waitForTimeout(200);
      const pop = await page.evaluate(() => {
        const m = document.querySelector('.actcol .actmenu');
        if (!m) return null;
        const r = m.getBoundingClientRect();
        return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      });
      check(pop === true, `${name} : liste « Améliorer » flottante et dans l'écran`);
      await page.screenshot({ path: join(OUT, `${name}-menu.png`) });
      await page.keyboard.press('Escape');
      check(errors.length === 0, `${name} : aucune erreur de page`, errors[0] ?? '');
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(fails ? `${fails} échec(s)` : 'tout est OK');
process.exit(fails ? 1 : 0);
