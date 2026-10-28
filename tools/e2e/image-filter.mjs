/**
 * Qualité d'image : chaque réglage du panneau Réglages monte/démonte le filtre, aucune erreur console/WebGL, retour à « Aucune »
 * = rendu identique à la référence (aux particules près : bruit mesuré sur deux images de référence), « Comparer » retire le filtre,
 * le filtre survit à une perte de contexte WebGL.
 *   PLAYWRIGHT_BROWSERS_PATH=... node tools/e2e/image-filter.mjs [--url=http://127.0.0.1:5233/]
 */
import { launch, calmSceneNearMonster, renderFrame, diffSnaps } from './image-filter-lib.mjs';
const URL = (process.argv.find((a) => a.startsWith('--url=')) ?? `--url=${process.env.E2E_URL ?? 'http://127.0.0.1:5233/'}`).slice(6);
let bad = 0;
const check = (ok, msg, extra = '') => {
  console.log(ok ? 'ok  ' : 'FAIL', msg, extra);
  if (!ok) bad++;
};
const { browser, page, errors } = await launch({ url: URL, w: 844, h: 390, dpr: 1, mobile: true });
try {
  await calmSceneNearMonster(page);
  const mounted = () => page.evaluate(() => window.__arpg.app.renderer.imageFilterMounted);
  const stored = () =>
    page.evaluate(() => {
      const s = window.__arpg.app.game.settings;
      return [s.imageSharpen, s.imageSmooth, s.imageMood].join('|');
    });
  await page.evaluate(() => {
    localStorage.setItem('d2m.settings.cat', 'display');
    window.__arpg.app.panels.show('settings');
  });
  await page.waitForSelector('.panel .statrow');
  const click = async (label, value) => {
    const row = page.locator('.panel .statrow', { hasText: label }).first();
    await row.locator('button', { hasText: new RegExp(`^${value}$`) }).click();
  };
  check(!(await mounted()), 'par défaut : aucun filtre monté');
  await renderFrame(page, 'ref1');
  await renderFrame(page, 'ref2');
  const noise = await diffSnaps(page, 'ref1', 'ref2');
  for (const [label, value, key] of [
    ['Netteté', 'Moyenne', '2||'],
    ['Lissage des bords', 'Oui', ''],
    ['Ambiance', 'Sombre', ''],
    ['Ambiance', 'Chaude', ''],
    ['Ambiance', 'Froide', ''],
    ['Ambiance', 'Vive', ''],
  ]) {
    await click(label, value);
    check(await mounted(), `${label} = ${value} : filtre monté`, await stored());
    await renderFrame(page, 'x');
    const d = await diffSnaps(page, 'ref1', 'x');
    check(d.diffPx > 1000, `${label} = ${value} : l'image change`, `${d.diffPx} px`);
    // on revient à neutre pour isoler le réglage suivant
    if (label === 'Netteté') await click(label, 'Aucune');
    if (label === 'Lissage des bords') await click(label, 'Non');
  }
  for (const v of ['Douce', 'Pixel-art']) {
    await click('Mise à l’échelle', v);
    check(await mounted(), `Mise à l'échelle = ${v} : filtre monté`, await stored());
    await renderFrame(page, 'x');
    const d = await diffSnaps(page, 'ref1', 'x');
    check(d.diffPx > 1000, `Mise à l'échelle = ${v} : l'image change`, `${d.diffPx} px`);
  }
  await click('Mise à l’échelle', 'Normale');
  await click('Ambiance', 'Normale');
  check(!(await mounted()), 'tout neutre : filtre démonté', await stored());
  await renderFrame(page, 'back');
  const back = await diffSnaps(page, 'ref1', 'back');
  check(
    back.diffPx <= Math.max(noise.diffPx * 3, 400),
    'retour à Off : image identique à la référence (bruit des particules compris)',
    `retour ${back.diffPx} px, bruit de référence ${noise.diffPx} px`,
  );
  // Comparer
  await click('Netteté', 'Forte');
  check(await mounted(), 'Netteté forte montée');
  await page.evaluate(() => window.__arpg.app.setImageCompare(true));
  check(!(await mounted()), 'Comparer : filtre retiré pendant l’appui');
  await page.evaluate(() => window.__arpg.app.setImageCompare(false));
  check(await mounted(), 'Comparer relâché : filtre remonté');
  await click('Netteté', 'Aucune');
  // bouton en jeu : tap = préréglage suivant, appui long = comparer, touche V
  await page.evaluate(() => {
    window.__arpg.app.panels.hide();
    window.__arpg.app.paused = false;
  });
  await page.waitForTimeout(600);
  const preset = () =>
    page.evaluate(() => {
      const s = window.__arpg.app.game.settings;
      return [s.imageSharpen, s.imageSmooth, s.imageMood, s.imageScale].join('|');
    });
  const label = () => page.evaluate(() => document.querySelector('.imgbtn').textContent);
  check((await label()) === 'Image', 'bouton visible, Off par défaut', await label());
  const seen = [];
  for (let i = 0; i < 4; i++) {
    await page.locator('.imgbtn').click();
    await page.waitForTimeout(400);
    seen.push(`${await label()}:${await mounted()}`);
  }
  check(seen.join(',') === 'Doux:true,Net:true,Cinéma:true,Image:false', 'le tap fait défiler Doux, Net, Cinéma, Off (filtre monté / démonté)', seen.join(','));
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(300);
  check((await label()) === 'Doux' && (await mounted()), 'touche V = préréglage suivant', await label());
  const box = await page.locator('.imgbtn').boundingBox();
  await page.mouse.move(box.x + 20, box.y + 15);
  await page.mouse.down();
  await page.waitForTimeout(700);
  check(!(await mounted()), 'appui long : rendu d’origine pendant l’appui');
  await page.mouse.up();
  await page.waitForTimeout(300);
  check((await mounted()) && (await label()) === 'Doux', 'relâché : filtre remonté, préréglage inchangé', await label());
  // chaque préréglage donne une image différente, retour à Off identique
  await page.evaluate(() => {
    window.__arpg.app.paused = true;
  });
  const snaps = [];
  for (const [id, o] of [
    ['off', {}],
    ['soft', { scale: 'soft' }],
    ['sharp', { sharp: 2, scale: 'pixel', mood: 'vivid' }],
    ['cinema', { sharp: 1, scale: 'pixel', mood: 'warm' }],
  ]) {
    await page.evaluate((o) => {
      const a = window.__arpg.app,
        s = a.game.settings;
      s.imageSharpen = o.sharp ?? 0;
      s.imageSmooth = false;
      s.imageMood = o.mood ?? 'normal';
      s.imageScale = o.scale ?? 'normal';
      a.applySettings(s);
    }, o);
    await renderFrame(page, 'p_' + id);
    snaps.push(id);
  }
  for (const id of snaps.slice(1)) {
    const d = await diffSnaps(page, 'p_off', 'p_' + id);
    check(d.diffPx > 300, `préréglage ${id} : capture différente de Off`, JSON.stringify(d));
  }
  check((await diffSnaps(page, 'p_soft', 'p_sharp')).diffPx > 1000 && (await diffSnaps(page, 'p_sharp', 'p_cinema')).diffPx > 1000, 'Doux, Net et Cinéma sont distincts');
  await page.evaluate(() => {
    const a = window.__arpg.app,
      s = a.game.settings;
    s.imageSharpen = 3;
    s.imageScale = 'pixel';
    a.applySettings(s);
  });
  // perte et restauration du contexte WebGL
  await page.evaluate(() => {
    const gl = window.__arpg.app.renderer.app.renderer.gl;
    window.__ext = gl.getExtension('WEBGL_lose_context');
    window.__ext.loseContext();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__ext.restoreContext());
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.__arpg.app.paused = true;
  });
  await renderFrame(page, 'ctx');
  const lit = await page.evaluate(() => {
    const d = window.__snaps.ctx.data;
    let n = 0;
    for (let i = 0; i < d.length; i += 400) if (d[i] + d[i + 1] + d[i + 2] > 30) n++;
    return n;
  });
  check(lit > 100 && (await mounted()), 'après perte de contexte : scène et filtre rétablis', `${lit} échantillons non noirs`);
  await page.evaluate(() => {
    const a = window.__arpg.app,
      s = a.game.settings;
    s.imageSharpen = 0;
    s.imageScale = 'normal';
    s.imageMood = 'normal';
    a.applySettings(s);
  });
  check(
    !(await mounted()),
    'retour à Off démonte le filtre',
    (await stored()) + ' ' + (await page.evaluate(() => JSON.stringify(window.__arpg.app.renderer.scene.filters?.length) + JSON.stringify(window.__arpg.app.imageWanted))),
  );
  check(errors.length === 0, 'aucune erreur console / WebGL', errors.join(' | '));
} finally {
  await browser.close();
}
console.log(bad ? `ECHEC (${bad})` : 'OK');
process.exit(bad ? 1 : 0);
