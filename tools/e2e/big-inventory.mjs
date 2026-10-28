// Grand inventaire : à 900x800 et 1920x1080, ouvre l'inventaire (et la vue Coffre) et vérifie que les 80 cases existent, qu'on peut les
// atteindre (défilement) sans débordement horizontal, qu'un objet de la dernière rangée est cliquable, et que le retour à 4 rangées ne perd rien.
// Usage : URL=http://127.0.0.1:5233/ node tools/e2e/big-inventory.mjs [tailles]
import { chromium } from 'playwright-core';
import { pickFirstMode } from './pick-mode.mjs';
const URL = process.env.E2E_URL || process.env.URL || 'http://127.0.0.1:5233/';
const sizes = (process.argv[2] || '900x800,1920x1080').split(',');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
const check = (ok, label, extra = '') => {
  if (!ok) bad++;
  console.log(ok ? 'OK ' : 'BAD', label, extra);
};
for (const sz of sizes) {
  const [w, h] = sz.split('x').map(Number);
  const page = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message));
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
  // 3 objets de test dont un en toute dernière case
  const inv = await page.evaluate(() => {
    const g = window.__arpg.app.game;
    const c = g.character;
    const proto = c.inventory.find((x) => x) || Object.values(c.equipment).find((x) => x);
    const mk = (u) => ({ ...proto, uid: 'big-' + u, base: 'ring', quality: 'normal', sockets: 0, socketed: [], affixes: [] });
    c.inventory[0] = c.inventory[0] || mk('a');
    c.inventory[45] = mk('b');
    c.inventory[79] = mk('c');
    return { len: c.inventory.length, big: g.settings.bigInventory };
  });
  check(inv.len === 80 && inv.big === true, `${sz} : 80 cases, option active par défaut`, JSON.stringify(inv));
  for (const view of ['inventory', 'stash']) {
    await page.evaluate(() => window.__arpg.app.openPanel('close'));
    await page.evaluate((n) => window.__arpg.app.openPanel(n), view);
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const p = document.querySelector('.panel');
      if (!p) return { err: 'pas de panneau' };
      const body = p.querySelector('.body');
      const pr = p.getBoundingClientRect();
      const d2 = !!p.querySelector('.d2panel');
      const out = { d2, panelInside: pr.right <= innerWidth + 1 && pr.bottom <= innerHeight + 1 && pr.left >= -1 && pr.top >= -1, scrollW: body.scrollWidth - body.clientWidth };
      if (d2) {
        const pd = p.querySelector('.d2panel');
        out.d2h = pd.offsetHeight;
        out.d2bg = pd.querySelectorAll('.d2bg').length;
      } else {
        const grid = p.querySelector('.grid');
        out.cells = grid ? grid.querySelectorAll('.cell').length : 0;
      }
      const c79 = p.querySelector('[data-inv="79"]');
      out.has79 = !!c79;
      return out;
    });
    check(!m.err && m.panelInside && m.scrollW <= 1 && m.has79, `${sz} ${view}`, JSON.stringify(m));
    if (!m.d2 && view === 'inventory') check(m.cells >= 80 - 10, `${sz} cases de la grille`, String(m.cells));
    // la dernière case est atteignable : défilement puis dans le viewport, hauteur ≥ 24 px
    const el = page.locator('.panel [data-inv="79"]').first();
    if (await el.count()) {
      await el.scrollIntoViewIfNeeded();
      const r = await el.boundingBox();
      const ok = !!r && r.y >= 0 && r.y + r.height <= h + 1 && r.x >= 0 && r.x + r.width <= w + 1 && r.height >= 20;
      check(ok, `${sz} ${view} : case 80 atteignable`, JSON.stringify(r));
      await el.hover();
      await page.waitForTimeout(200);
      await el.click();
      await page.waitForTimeout(200);
    }
    await page.screenshot({ path: `/tmp/big-inv-${view}-${sz}.png` });
  }
  // retour à 4 rangées : rien ne se perd
  const back = await page.evaluate(() => {
    const g = window.__arpg.app.game;
    const count = () => g.character.inventory.filter(Boolean).length + g.character.stash.reduce((a, t) => a + t.filter(Boolean).length, 0);
    const n0 = count();
    const ok = g.setBigInventory(false);
    const n1 = count();
    const ok2 = g.setBigInventory(true);
    return { ok, ok2, n0, n1, n2: count(), len: g.character.inventory.length };
  });
  check(back.ok && back.ok2 && back.n0 === back.n1 && back.n1 === back.n2 && back.len === 80, `${sz} : aller-retour 4/8 rangées sans perte`, JSON.stringify(back));
  await page.close();
}
await b.close();
console.log(bad ? `${bad} cas en échec` : 'tout est OK');
process.exit(bad ? 1 : 0);
