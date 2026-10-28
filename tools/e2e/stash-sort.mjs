/**
 * Coffre : « Tout au coffre » (sac → coffre, garde-fous, confirmation, annulation) et « Trier » / « Tout trier » (catégories regroupées).
 * Vérifie aussi que les boutons sont visibles sans défiler et ≥ 36 px de haut, aux 3 tailles.
 *   node tools/e2e/stash-sort.mjs [--url=http://127.0.0.1:5233/] [--sizes=900x800,740x360,1920x1080]
 * Captures : test-results/e2e/stash-sort/*.png
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const SIZES = (args.get('sizes') ?? '900x800,740x360,1920x1080').split(',').map((z) => z.split('x').map(Number));
const OUT = join(process.cwd(), 'test-results', 'e2e', 'stash-sort');
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, what, d = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${d ? ` — ${d}` : ''}`);
};
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
      // 20 objets variés dans le sac, dans le désordre ; un porté, une potion, une clé
      const n = await page.evaluate(() => {
        const a = window.__arpg;
        const c = a.game().character;
        c.inventory.fill(null);
        c.stash.forEach((t) => t.fill(null));
        c.mapStash = [];
        const bases = ['ring', 'long_bow', 'amulet', 'short_sword', 'buckler', 'ring', 'amulet', 'short_sword', 'ring', 'light_belt'];
        const q = ['magic', 'rare', 'unique', 'normal', 'rare', 'rare', 'magic', 'magic', 'normal', 'rare'];
        bases.forEach((b, i) => a.giveItem(b, { forceQuality: q[i], ilvl: 30 + i }));
        // clé et potion dans le sac (le ramassage les rangerait ailleurs : on les pose à la main)
        for (const [b, id] of [
          ['key', 'e2e-key'],
          ['hp_potion', 'e2e-pot'],
        ]) {
          const at = c.inventory.findIndex((x, i) => !x && i < 40 && !c.inventory[i + 1]);
          c.inventory[at] = { uid: id, base: b, quality: 'normal', ilvl: 1, sockets: 0, socketed: [], qty: 1 };
        }
        a.giveMap(2, 'rare');
        a.giveMap(1, 'magic');
        return c.inventory.filter(Boolean).length;
      });
      check(n === 14, `${name} : sac rempli`, `${n} objets`);
      await page.evaluate(() => window.__arpg.app.openPanel('stash'));
      await page.waitForSelector('[data-testid="stash-all"]');
      await page.waitForTimeout(400);
      // boutons visibles, sans défiler, hauteur ≥ 36 px
      const geo = await page.evaluate(() =>
        ['stash-all', 'stash-keep', 'stash-sort-page', 'stash-sort-all'].map((t) => {
          const b = document.querySelector(`[data-testid="${t}"]`);
          if (!b) return [t, null];
          const r = b.getBoundingClientRect();
          return [t, { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), w: Math.round(r.width) }];
        }),
      );
      for (const [t, r] of geo) check(!!r && r.h >= 36 && r.top >= 0 && r.bottom <= height && r.left >= 0 && r.right <= width, `${name} : bouton ${t} visible, ≥ 36 px`, JSON.stringify(r));
      const fitBody = await page.evaluate(() => {
        const b = document.querySelector('.panel .body');
        return { sw: b.scrollWidth, cw: b.clientWidth, sh: b.scrollHeight, ch: b.clientHeight, pb: Math.round(document.querySelector('.panel').getBoundingClientRect().bottom), ih: innerHeight };
      });
      check(fitBody.sw <= fitBody.cw + 1 && fitBody.sh <= fitBody.ch + 1 && fitBody.pb <= fitBody.ih + 1, `${name} : pas de débordement du panneau`, JSON.stringify(fitBody));
      await page.screenshot({ path: join(OUT, `${name}-1-avant.png`) });
      // « Tout au coffre » : confirmation, puis envoi
      await page.click('[data-testid="stash-all"]');
      await page.waitForSelector('[data-testid="stash-all-ask"]');
      const ask = await page.textContent('[data-testid="stash-all-ask"]');
      check(/Envoyer \d+ objets? au coffre \?/.test(ask), `${name} : confirmation`, ask.trim().slice(0, 60));
      await page.screenshot({ path: join(OUT, `${name}-2-confirmation.png`) });
      await page.click('[data-testid="stash-all-yes"]');
      await page.waitForSelector('[data-testid="stash-note"]');
      const note = await page.textContent('[data-testid="stash-note"]');
      check(/envoyé/.test(note), `${name} : message d'issue`, note.trim().slice(0, 70));
      const after = await page.evaluate(() => {
        const c = window.__arpg.game().character;
        return { bag: c.inventory.filter(Boolean).map((x) => x.base), stash: c.stash.slice(4).flat().filter(Boolean).length, maps: c.mapStash.length };
      });
      check(after.bag.sort().join() === 'hp_potion,key', `${name} : sac vidé sauf potion et clé`, after.bag.join());
      check(after.stash === 10 && after.maps === 2, `${name} : coffre rempli`, `${after.stash} objets, ${after.maps} cartes`);
      await page.screenshot({ path: join(OUT, `${name}-3-envoye.png`) });
      // annulation
      await page.click('[data-testid="stash-undo"]');
      await page.waitForTimeout(200);
      const undone = await page.evaluate(() => {
        const c = window.__arpg.game().character;
        return { bag: c.inventory.filter(Boolean).length, stash: c.stash.slice(4).flat().filter(Boolean).length, maps: c.mapStash.length };
      });
      check(undone.bag === 14 && undone.stash === 0 && undone.maps === 0, `${name} : annulation restaure sac et coffre`, JSON.stringify(undone));
      // renvoi puis tri
      await page.click('[data-testid="stash-all"]');
      await page.waitForSelector('[data-testid="stash-all-ask"]');
      await page.click('[data-testid="stash-all-yes"]');
      await page.waitForTimeout(200);
      // désordre : on disperse les objets du coffre sur des pages différentes
      await page.evaluate(() => {
        const c = window.__arpg.game().character;
        const items = c.stash.slice(4).flat().filter(Boolean);
        c.stash.slice(4).forEach((t) => t.fill(null));
        items.forEach((it, i) => {
          c.stash[4 + (i % 5) * 2][((i * 11) % 6) * 10 + (i % 10)] = it;
        });
      });
      await page.click('[data-testid="stash-page-4"]');
      await page.waitForTimeout(300);
      await page.click('[data-testid="stash-sort-all"]');
      await page.waitForSelector('[data-testid="stash-note"]');
      const sorted = await page.evaluate(() => {
        const c = window.__arpg.game().character;
        const BT = window.__arpg.baseType ?? null;
        const pages = c.stash.slice(4).map((t) => t.filter(Boolean).map((x) => x.base));
        return { pages: pages.filter((p) => p.length).length, firstFilledOnly: pages.findIndex((p) => !p.length) >= pages.findLastIndex((p) => p.length), seq: pages[0], n: pages.flat().length, BT };
      });
      check(sorted.n === 10 && sorted.pages === 1 && sorted.firstFilledOnly, `${name} : tout trier replie sur la première page`, `${sorted.pages} page(s) ; ${sorted.seq.join(' ')}`);
      const grouped = sorted.seq.join(' ');
      check(/^(short_sword )+(long_bow )+(light_belt )+(buckler )+(amulet )+(ring )+$/.test(grouped + ' '), `${name} : catégories regroupées`, grouped);
      await page.screenshot({ path: join(OUT, `${name}-4-trie.png`) });
      await page.click('[data-testid="stash-sort-page"]');
      await page.waitForTimeout(200);
      const again = await page.evaluate(() =>
        window.__arpg
          .game()
          .character.stash.slice(4)[0]
          .filter(Boolean)
          .map((x) => x.base)
          .join(' '),
      );
      check(again === grouped, `${name} : « Trier » idempotent`);
      check(errors.length === 0, `${name} : aucune erreur de page`, errors.join(' ; '));
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon');
process.exit(fails ? 1 : 0);
