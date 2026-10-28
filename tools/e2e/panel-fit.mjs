// Vérifie que chaque panneau D2 tient dans le viewport (pas de coupure, barre d'onglets du haut non recouverte, boutons visibles).
// Usage : node tools/e2e/panel-fit.mjs [tailles] [panneaux] [--shots=dossier]
// Exemple : node tools/e2e/panel-fit.mjs 900x800,1000x900 stash:Gemmes,vendor --shots=/tmp/fit
import { chromium } from 'playwright-core';
import { pickFirstMode } from './pick-mode.mjs';
const URL = process.env.E2E_URL || process.env.URL || 'http://127.0.0.1:5233/';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const shots = (process.argv.find((a) => a.startsWith('--shots=')) || '').slice(8);
const sizes = (args[0] || '900x800,1000x900,800x800,840x900,740x360,1280x720,1920x1080,390x844').split(',');
const CASES = (args[1] || 'inventory,character,skills,stash:Coffre,stash:Gemmes,stash:Runes,stash:Cartes,vendor,merc,cube,maps,settings').split(',');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const sz of sizes) {
  const [w, h] = sz.split('x').map(Number);
  const mobile = w < 500 || h < 400;
  const page = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })).newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('d2m.lang', 'fr');
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const boot = async () => {
    await page.goto(URL + '?testchar=1');
    await page.waitForSelector('.charselect.d2s', { timeout: 90000 });
    await pickFirstMode(page);
    await page.waitForSelector('.d2plate');
    await page.click('.d2plate:has-text("99")');
    await page.click('.d2b.ok');
    await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 180000 });
    await page.waitForTimeout(800);
  };
  await boot();
  for (const cs of CASES) {
    const [name, tab] = cs.split(':');
    // le serveur de dev peut recharger la page (HMR : fichiers modifiés pendant le test) : on repart de zéro
    if (!(await page.evaluate(() => !!window.__arpg).catch(() => false))) await boot();
    await page.evaluate(() => window.__arpg.app.openPanel('close'));
    await page.evaluate((n) => window.__arpg.app.openPanel(n, n === 'vendor' ? 'larzuk' : undefined), name);
    await page.waitForTimeout(400);
    if (tab) {
      await page
        .locator(name === 'stash' ? '.panel .tabs.stashtop .btn' : '.panel .btn', { hasText: tab })
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(300);
    }
    const m = await page.evaluate(() => {
      const p = document.querySelector('.panel');
      if (!p) return { err: 'pas de panneau' };
      const body = p.querySelector('.body');
      const head = p.querySelector('header').getBoundingClientRect();
      const vw = innerWidth;
      const vh = innerHeight;
      const issues = [];
      if (body.scrollWidth > body.clientWidth + 1) issues.push(`scrollW ${body.scrollWidth}>${body.clientWidth}`);
      const pr = p.getBoundingClientRect();
      if (pr.right > vw + 1 || pr.bottom > vh + 1 || pr.left < -1 || pr.top < -1) issues.push('panneau hors viewport');
      for (const e of body.querySelectorAll('button, input, select, .cell')) {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        // ignore ce qui est masqué par un conteneur défilant en hauteur (rangées hors vue)
        const sc = e.closest('.scroll');
        if (sc && !(sc === body)) {
          const s = sc.getBoundingClientRect();
          if (r.bottom > s.bottom + 1 || r.top < s.top - 1) continue;
        }
        const label = (e.textContent || e.className || e.tagName).toString().trim().slice(0, 18);
        if (r.right > vw + 1 || r.left < -1) issues.push(`hors écran: ${label} [${Math.round(r.left)}..${Math.round(r.right)}]`);
        else if (r.top < head.bottom - 1 && r.bottom > head.top + 1)
          issues.push(`sous la barre d'onglets: ${label} [${Math.round(r.top)}..${Math.round(r.bottom)}] barre ..${Math.round(head.bottom)}`);
      }
      const kids = [...body.children];
      const right = Math.max(0, ...kids.map((k) => k.getBoundingClientRect().right));
      const bottom = Math.max(0, ...kids.map((k) => k.getBoundingClientRect().bottom));
      const bb = body.getBoundingClientRect();
      return {
        issues: issues.slice(0, 6),
        n: issues.length,
        contentRight: Math.round(right),
        headBottom: Math.round(head.bottom),
        emptyBottom: Math.round(bb.bottom - bottom),
        panel: [Math.round(pr.left), Math.round(pr.top), Math.round(pr.right), Math.round(pr.bottom)],
      };
    });
    const ok = !m.err && m.n === 0;
    if (!ok) bad++;
    console.log(ok ? 'OK ' : 'BAD', sz, cs, JSON.stringify(m));
    if (shots) {
      const fs = await import('node:fs');
      fs.mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: `${shots}/${cs.replace(':', '-')}-${sz}.png` });
    }
  }
  await page.close();
}
await b.close();
console.log(bad ? `${bad} cas en échec` : 'tout est OK');
process.exit(bad ? 1 : 0);
