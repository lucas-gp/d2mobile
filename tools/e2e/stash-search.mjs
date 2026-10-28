/**
 * Recherche dans le coffre : champ, estompage des objets sans correspondance, compteur, pastilles de page, liste cliquable (saut à la page + sélection),
 * résultat suivant/précédent, filtres rapides, recherche conservée en changeant de page/onglet, vidée à la fermeture ; tient aux 3 tailles.
 *   node tools/e2e/stash-search.mjs [--url=http://127.0.0.1:5233/] [--shots=dossier]
 */
import { launch } from './image-filter-lib.mjs';
const URL = (process.argv.find((a) => a.startsWith('--url=')) ?? `--url=${process.env.E2E_URL ?? 'http://127.0.0.1:5233/'}`).slice(6);
const shots = (process.argv.find((a) => a.startsWith('--shots=')) ?? '').slice(8);
let bad = 0;
const check = (ok, msg, extra = '') => {
  console.log(ok ? 'ok  ' : 'FAIL', msg, extra);
  if (!ok) bad++;
};
for (const [w, h] of [
  [900, 800],
  [740, 360],
  [1920, 1080],
]) {
  const tag = `${w}x${h}`;
  const { browser, page, errors } = await launch({ url: URL, w, h, dpr: 1, mobile: w < 800 });
  try {
    const q = (f, a) => page.evaluate(f, a);
    await q(() => {
      window.__arpg.setLevel(60);
      window.__arpg.town();
    });
    await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 120000 });
    const names = await q(async () => {
      const { generateItem } = await import('/src/sim/loot/itemgen.ts');
      const { Rng } = await import('/src/core/rng.ts');
      const { itemName } = await import('/src/sim/itemstats.ts');
      const g = window.__arpg.game(),
        c = g.character,
        rng = new Rng('e2e-stash-search');
      c.inventory.fill(null);
      c.stash.forEach((t) => t.fill(null));
      const B = g.sharedTabs > 0 ? 4 : 0; // coffre unique : pages partagées à partir de l'indice 4
      while (c.stash.length < B + 12) c.stash.push(new Array(80).fill(null));
      c.stash.forEach((p, i) => {
        if (i >= B + 4 && B) p.fill(null);
      });
      const put = (t, i, base, quality) => {
        const it = generateItem(rng, base, 60, { forceQuality: quality });
        c.stash[B + t][i] = it;
        return itemName(it);
      };
      const out = {
        u0: put(0, 0, 'short_sword', 'unique'),
        m0: put(0, 2, 'ring', 'magic'),
        r0: put(0, 4, 'cap', 'rare'),
        m1: put(1, 0, 'short_sword', 'magic'),
        u2: put(2, 0, 'cap', 'unique'),
        n3: put(3, 0, 'long_bow', 'normal'),
      };
      g.settings.confirmCorrupt = true;
      window.__arpg.app.openPanel('stash');
      return { ...out, B };
    });
    await page.waitForSelector('.stashsearch');
    await page.waitForTimeout(300);
    // la grille et le champ tiennent à l'écran
    const fit = await q(() => {
      const bad = [];
      for (const s of ['.stashsearch', '[data-testid^="stash-page-"]', '.sidegrid, .d2cell']) {
        const e = document.querySelector(s);
        if (!e) {
          bad.push('absent ' + s);
          continue;
        }
        const r = e.getBoundingClientRect();
        if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) bad.push(`${s} hors écran`);
      }
      const input = document.querySelector('.ssinput').getBoundingClientRect();
      return {
        bad,
        inputW: Math.round(input.width),
        inputH: Math.round(input.height),
        zones: ['char', 'chest', 'item', 'actions'].filter((z) => document.querySelector(`.panel [data-zone="${z}"]`)).length,
      };
    });
    check(fit.bad.length === 0 && fit.zones === 4, `${tag} : champ, pages et grille dans l'écran, 4 zones`, JSON.stringify(fit));
    const state = () =>
      q(() => ({
        count: document.querySelector('.stashcount')?.textContent ?? '',
        shown: document.querySelector('.stashcount')?.style.display !== 'none',
        hit: document.querySelectorAll('.scell.sr-hit').length,
        dim: document.querySelectorAll('.scell.sr-dim').length,
        pages: [...document.querySelectorAll('[data-testid^="stash-page-"].srhit')].map((b) => b.textContent),
        value: document.querySelector('.ssinput').value,
        tab: window.__arpg.app.panels.stashTab,
        sel: window.__arpg.app.panels.sel,
        focus: document.activeElement?.classList.contains('ssinput'),
      }));
    const s0 = await state();
    check(!s0.shown && s0.dim === 0 && s0.hit === 0, `${tag} : sans recherche, rien d'estompé`);
    await page.locator('.ssinput').click();
    await page.keyboard.type('UNIQUE');
    await page.waitForTimeout(150);
    let s = await state();
    check(
      s.hit === 1 && s.dim === 2 && /^2 résultats sur 2 pages/.test(s.count) && s.pages.join() === '1,3' && s.focus,
      `${tag} : « UNIQUE » : estompage, compteur, pastilles, focus conservé`,
      JSON.stringify(s),
    );
    if (shots) await page.screenshot({ path: `${shots}/stash-search-${tag}-unique.png` });
    // liste
    await page.locator('[data-testid="stash-search-list"]').click();
    const rows = await q(() => [...document.querySelectorAll('[data-testid="stash-res-row"]')].map((r) => r.textContent));
    check(rows.length === 2 && /p\. 1 · Unique/.test(rows[0]) && /p\. 3 · Unique/.test(rows[1]), `${tag} : liste de 2 résultats`, rows.join(' | '));
    if (shots) await page.screenshot({ path: `${shots}/stash-search-${tag}-list.png` });
    await page.locator('[data-testid="stash-res-row"]').nth(1).click();
    await page.waitForTimeout(250);
    s = await state();
    const tipName = await q(() => document.querySelector('.panel .tip .t')?.textContent);
    check(
      s.tab === names.B + 2 && s.sel?.from === 'stash' && s.sel.tab === names.B + 2 && s.sel.idx === 0 && tipName === names.u2 && s.value === 'UNIQUE',
      `${tag} : tap sur un résultat : saute à la page 3 et sélectionne`,
      `${JSON.stringify(s)} / ${tipName}`,
    );
    check(s.hit === 1 && s.dim === 0, `${tag} : page 3 : l'objet est surligné`);
    // suivant / précédent
    await page.locator('[data-testid="stash-search-next"]').click();
    await page.waitForTimeout(200);
    s = await state();
    check(s.tab === names.B && s.sel?.idx === 0, `${tag} : suivant revient à la page 1 (boucle)`, JSON.stringify(s.sel));
    await page.locator('[data-testid="stash-search-prev"]').click();
    await page.waitForTimeout(200);
    check((await state()).tab === names.B + 2, `${tag} : précédent`);
    // changement de page / d'onglet : la recherche reste
    await page.locator(`[data-testid="stash-page-${names.B + 1}"]`).click();
    await page.waitForTimeout(150);
    s = await state();
    check(s.value === 'UNIQUE' && s.hit === 0 && s.dim === 1, `${tag} : page 2 : recherche conservée, objet estompé`, JSON.stringify(s));
    await page.locator('[data-testid="stash-top-gemmes"]').click();
    await page.waitForTimeout(150);
    await page.locator('[data-testid="stash-top-coffre"]').click();
    await page.waitForTimeout(150);
    check((await state()).value === 'UNIQUE', `${tag} : recherche conservée après l'onglet Gemmes`);
    // texte sur un modificateur / type / nom, sans accents
    await page.locator('.ssinput').fill('anneau');
    await page.waitForTimeout(120);
    s = await state();
    check(/^1 résultat sur 1 page/.test(s.count), `${tag} : « anneau » (type)`, s.count);
    await page.locator('.ssinput').fill(names.m1.slice(0, 5).toUpperCase());
    await page.waitForTimeout(120);
    check(/résultat/.test((await state()).count) && !/Aucun/.test((await state()).count), `${tag} : début du nom en majuscules`, (await state()).count);
    await page.locator('.ssinput').fill('zzzzz');
    await page.waitForTimeout(120);
    check((await state()).count === 'Aucun résultat', `${tag} : aucun résultat`);
    // effacer, filtres rapides
    await page.locator('[data-testid="stash-search-clear"]').click();
    s = await state();
    check(s.value === '' && !s.shown && s.dim === 0, `${tag} : ✕ efface la recherche`);
    await page.locator('[data-testid="stash-search-filters"]').click();
    await page.locator('[data-testid="stash-chip-magic"]').click();
    s = await state();
    check(/^3 résultats sur 3 pages|^2 résultats sur 2 pages/.test(s.count), `${tag} : filtre Magique`, s.count);
    await page.locator('[data-testid="stash-chip-jewelry"]').click();
    s = await state();
    check(/^1 résultat sur 1 page/.test(s.count), `${tag} : Magique + Bijoux`, s.count);
    if (shots) await page.screenshot({ path: `${shots}/stash-search-${tag}-filters.png` });
    // fermeture : recherche vidée
    await q(() => {
      window.__arpg.app.panels.hide();
      window.__arpg.app.openPanel('stash');
    });
    await page.waitForSelector('.stashsearch');
    s = await state();
    check(s.value === '' && !s.shown && s.dim === 0, `${tag} : à la réouverture du coffre, recherche vide`);
    check(errors.length === 0, `${tag} : aucune erreur`, errors.join('|'));
  } finally {
    await browser.close();
  }
}
console.log(bad ? `ECHEC (${bad})` : 'OK');
process.exit(bad ? 1 : 0);
