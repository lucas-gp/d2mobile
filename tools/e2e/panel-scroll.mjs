/**
 * Les panneaux gardent leur position de défilement quand ils se reconstruisent (clic sur une option, rafraîchissement).
 *   PLAYWRIGHT_BROWSERS_PATH=... node tools/e2e/panel-scroll.mjs [--url=http://127.0.0.1:5233/]
 */
import { launch } from './image-filter-lib.mjs';
const URL = (process.argv.find((a) => a.startsWith('--url=')) ?? `--url=${process.env.E2E_URL ?? 'http://127.0.0.1:5233/'}`).slice(6);
let bad = 0;
const check = (ok, msg, extra = '') => {
  console.log(ok ? 'ok  ' : 'FAIL', msg, extra);
  if (!ok) bad++;
};
const { browser, page, errors } = await launch({ url: URL, w: 740, h: 360, dpr: 1, mobile: true });
try {
  const scrollables = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#panels *')]
        .filter((e) => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY))
        .map((e) => ({ cls: e.className, max: e.scrollHeight - e.clientHeight })),
    );
  const tops = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#panels *')].filter((e) => e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY)).map((e) => Math.round(e.scrollTop)),
    );
  for (const name of ['settings', 'filter', 'skills', 'merc']) {
    await page.evaluate((n) => {
      localStorage.setItem('d2m.settings.cat', 'display');
      const p = window.__arpg.app.panels;
      if (p.open) p.hide();
      p.show(n);
    }, name);
    await page.waitForTimeout(300);
    const list = await scrollables();
    if (!list.length) {
      check(true, `${name} : rien à défiler à cette taille (ignoré)`);
      continue;
    }
    await page.evaluate(() => {
      for (const e of document.querySelectorAll('#panels *'))
        if (e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = Math.min(400, e.scrollHeight - e.clientHeight);
    });
    const before = await tops();
    if (name === 'settings')
      await page.evaluate(() =>
        [...[...document.querySelectorAll('.panel .statrow')].find((r) => r.textContent.startsWith('Netteté')).querySelectorAll('button')].find((b) => b.textContent === 'Moyenne').click(),
      );
    else await page.evaluate(() => window.__arpg.app.panels.refresh());
    await page.waitForTimeout(150);
    const after = await tops();
    check(before.length > 0 && before.every((v, i) => Math.abs(v - (after[i] ?? -999)) <= 2) && before.some((v) => v > 50), `${name} : défilement conservé`, `${before} -> ${after}`);
  }
  // changer de panneau repart en haut
  await page.evaluate(() => {
    const p = window.__arpg.app.panels;
    p.hide();
    p.show('settings');
  });
  check(
    (await tops()).every((v) => v === 0),
    'panneau rouvert : en haut',
  );
  check(errors.length === 0, 'aucune erreur', errors.join('|'));
} finally {
  await browser.close();
}
console.log(bad ? `ECHEC (${bad})` : 'OK');
process.exit(bad ? 1 : 0);
