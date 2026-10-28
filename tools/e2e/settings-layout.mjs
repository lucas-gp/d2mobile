/**
 * Réglages : catégories repliables, recherche, conservation de la catégorie et du défilement, rétablir par catégorie.
 *   PLAYWRIGHT_BROWSERS_PATH=... node tools/e2e/settings-layout.mjs [--url=http://127.0.0.1:5233/] [--shots=dossier]
 */
import { launch } from './image-filter-lib.mjs';
const URL = (process.argv.find((a) => a.startsWith('--url=')) ?? `--url=${process.env.E2E_URL ?? 'http://127.0.0.1:5233/'}`).slice(6);
const shots = (process.argv.find((a) => a.startsWith('--shots=')) ?? '').slice(8);
let bad = 0;
const check = (ok, msg, extra = '') => {
  console.log(ok ? 'ok  ' : 'FAIL', msg, extra);
  if (!ok) bad++;
};
const CATS = ['game', 'display', 'controls', 'sound', 'pickup', 'confirm', 'account', 'advanced'];
for (const [w, h] of [
  [900, 800],
  [740, 360],
  [1920, 1080],
]) {
  const tag = `${w}x${h}`;
  const { browser, page, errors } = await launch({ url: URL, w, h, dpr: 1, mobile: w < 800 });
  try {
    const q = (f, a) => page.evaluate(f, a);
    await q(() => window.__arpg.app.panels.show('settings'));
    await page.waitForSelector('.panel .setpane');
    check((await q(() => document.querySelectorAll('.setcat').length)) === 8, `${tag} : 8 catégories`);
    for (const c of CATS) {
      if ((await q(() => document.querySelector('.setcat.sel')?.dataset.cat)) !== c) await page.locator(`.setcat[data-cat="${c}"]`).click();
      await page.waitForTimeout(80);
      const m = await q((cat) => {
        const pane = document.querySelector('.setpane');
        const opts = [...document.querySelectorAll('.setsec .setopt')];
        const small = [...document.querySelectorAll('.setsec button, .setcat')].filter((b) => b.getBoundingClientRect().height < 38 && !b.closest('.sync-box')).map((b) => b.textContent.slice(0, 20));
        return {
          open: document.querySelector('.setcat.sel')?.dataset.cat,
          n: opts.length,
          hscroll: pane.scrollWidth - pane.clientWidth,
          small,
          stored: localStorage.getItem('d2m.settings.cat'),
        };
      }, c);
      check(m.open === c && m.n > 0 && (m.stored === c || (c === 'game' && m.stored === null)), `${tag} : catégorie ${c} ouverte (${m.n} options)`, JSON.stringify(m));
      check(m.hscroll <= 1, `${tag} : ${c} sans défilement horizontal`, String(m.hscroll));
      check(m.small.length === 0, `${tag} : ${c} cibles ≥ 38 px`, m.small.join('|'));
      if (shots && (c === 'display' || c === 'pickup')) await page.screenshot({ path: `${shots}/settings-${tag}-${c}.png` });
    }
    // défilement conservé en changeant une option de « Affichage »
    await page.locator('.setcat[data-cat="display"]').click();
    await page.waitForTimeout(100);
    const scrolled = await q(() => {
      const p = document.querySelector('.setpane');
      p.scrollTop = Math.min(250, p.scrollHeight - p.clientHeight);
      return p.scrollTop;
    });
    // clic direct (Playwright ferait défiler l'élément avant de cliquer, ce qui fausserait la mesure)
    await q(() => [...document.querySelectorAll('.setopt[data-opt="imageSharpen"] button')].find((b) => b.textContent === 'Moyenne').click());
    await page.waitForTimeout(150);
    const after = await q(() => ({ top: document.querySelector('.setpane').scrollTop, open: document.querySelector('.setcat.sel')?.dataset.cat, v: window.__arpg.app.game.settings.imageSharpen }));
    check(after.v === 2 && after.open === 'display' && Math.abs(after.top - scrolled) <= 2, `${tag} : option changée sans perdre catégorie ni défilement`, `${scrolled} -> ${JSON.stringify(after)}`);
    // rétablir (avec confirmation)
    await page.locator('.setsec .setreset').click();
    await page.locator('.setsec .btn.danger').click();
    check((await q(() => window.__arpg.app.game.settings.imageSharpen)) === 0, `${tag} : rétablir « Affichage » remet la netteté à 0`);
    // recherche
    await page.locator('.set-search').fill('netteté');
    await page.waitForTimeout(100);
    const res = await q(() => ({
      opts: [...document.querySelectorAll('.setres')].map((r) => r.querySelector('.set-tag').textContent + '>' + r.querySelector('.statrow span').textContent),
      cats: document.querySelectorAll('.setcat').length,
    }));
    check(res.opts.length === 1 && res.opts[0] === 'Affichage>Netteté' && res.cats === 0, `${tag} : recherche « netteté »`, JSON.stringify(res));
    if (shots) await page.screenshot({ path: `${shots}/settings-${tag}-search.png` });
    await page.locator('.setopt[data-opt="imageSharpen"] button', { hasText: /^Forte$/ }).click();
    await page.waitForTimeout(150);
    const kept = await q(() => ({ v: document.querySelector('.set-search').value, n: document.querySelectorAll('.setres').length, s: window.__arpg.app.game.settings.imageSharpen }));
    check(kept.v === 'netteté' && kept.n === 1 && kept.s === 3, `${tag} : recherche conservée après changement`, JSON.stringify(kept));
    await page.locator('.set-search').fill('RAMASSAGE rune');
    check((await q(() => document.querySelectorAll('.setres').length)) === 1, `${tag} : « RAMASSAGE rune » (casse, multi-mots)`);
    await page.locator('.set-search').fill('zzzzz');
    check((await q(() => document.querySelectorAll('.setres').length)) === 0, `${tag} : aucun résultat`);
    await page.locator('.set-clear').click();
    check(await q(() => document.querySelector('.set-search').value === '' && document.querySelectorAll('.setcat').length === 8), `${tag} : effacer la recherche`);
    await q(() => {
      const s = window.__arpg.app.game.settings;
      s.imageSharpen = 0;
      window.__arpg.app.applySettings(s);
    });
    check(errors.length === 0, `${tag} : aucune erreur`, errors.join('|'));
  } finally {
    await browser.close();
  }
}
console.log(bad ? `ECHEC (${bad})` : 'OK');
process.exit(bad ? 1 : 0);
