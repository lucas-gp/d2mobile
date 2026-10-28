/**
 * Moteur de rendu (Lot 145) : réglage WebGL / WebGPU, repli automatique, mémorisation de l'échec, persistance, absence de régression WebGL.
 * Chromium headless sans GPU : WebGPU ne peut pas réellement s'initialiser ici ; ce script vérifie le chemin de repli, pas WebGPU lui-même.
 *   node tools/e2e/render-engine.mjs [--url=http://127.0.0.1:5233/] [--webgpu-flag]
 */
import { chromium } from 'playwright-core';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
let fail = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${msg}`);
  if (!ok) fail++;
};
const flags = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
if (args.has('webgpu-flag')) flags.push('--enable-unsafe-webgpu', '--enable-features=Vulkan');
const browser = await chromium.launch({ args: flags });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 }, deviceScaleFactor: 1, locale: 'fr-FR' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  // le stockage n'est vidé qu'au premier chargement : les rechargements gardent personnage, réglages et mémoire de l'échec
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('re-init')) {
      localStorage.clear();
      localStorage.setItem('d2m.lang', 'fr');
      sessionStorage.setItem('re-init', '1');
    }
  });
  const ready = async () => {
    await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 180000 });
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Compris/i.test(b.textContent.trim()))?.click());
  };
  const state = () =>
    page.evaluate(() => {
      const a = window.__arpg.app,
        rd = a.renderer,
        cv = rd.app.canvas;
      // le tampon n'est lisible que dans la tâche qui vient de rendre
      rd.render(a.game.world, 0, 0, [], { shake: 0, damageNumbers: true });
      const c2 = document.createElement('canvas');
      c2.width = cv.width;
      c2.height = cv.height;
      const g = c2.getContext('2d');
      g.drawImage(cv, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
      return {
        engine: rd.engine,
        name: rd.app.renderer.name,
        failure: localStorage.getItem('d2m.renderEngineFailed'),
        hasGpuApi: !!navigator.gpu,
        setting: a.game.settings.renderEngine,
        mean: s / ((d.length / 4) * 3),
        filterMounted: rd.imageFilterMounted,
        info: a.renderEngineInfo(),
      };
    });

  await page.goto(URL);
  await ready();
  await page.evaluate(() => {
    window.__arpg.god(true);
    window.__arpg.startRun('tristram', 0, 3);
  });
  await ready();
  await page.waitForTimeout(1500);
  let st = await state();
  console.log('1) defaut', JSON.stringify({ ...st, info: undefined }));
  check(st.engine === 'webgl' && st.name === 'webgl', 'defaut : WebGL');
  check(st.setting === undefined || st.setting === 'webgl', 'reglage absent = webgl');
  check(st.mean > 2, `rendu WebGL non noir (${st.mean.toFixed(1)})`);
  check(st.failure === null, 'aucun echec memorise');

  // filtre d'image sous WebGL : toujours monte
  await page.evaluate(() => {
    const a = window.__arpg.app,
      s = a.game.settings;
    s.imageSharpen = 2;
    s.imageMood = 'warm';
    a.applySettings(s);
  });
  st = await state();
  check(st.filterMounted, 'WebGL : filtre Qualite d image monte (aucune regression)');
  await page.evaluate(() => {
    const a = window.__arpg.app,
      s = a.game.settings;
    s.imageSharpen = 0;
    s.imageMood = 'normal';
    a.applySettings(s);
  });

  // WebGPU demande puis rechargement
  await page.evaluate(() => {
    const a = window.__arpg.app,
      s = a.game.settings;
    s.renderEngine = 'webgpu';
    a.applySettings(s);
    a.saveNow();
  });
  st = await state();
  console.log('2) apres choix WebGPU (avant rechargement)', JSON.stringify(st.info));
  check(st.engine === 'webgl', 'le moteur actif ne change pas avant le rechargement');
  await page.reload();
  await ready();
  await page.waitForTimeout(1500);
  st = await state();
  console.log('3) apres rechargement', JSON.stringify({ ...st, info: st.info }));
  check(st.setting === 'webgpu', 'le reglage WebGPU persiste apres rechargement');
  if (st.engine === 'webgpu') {
    console.log('INFO : WebGPU reellement actif sur cette machine');
    // la capture d'un canvas WebGPU est blanche/noire sans GPU reel (meme un clear brut WebGPU n'est pas presente dans ce chromium) : non verifiable ici
    console.log(`INFO : luminosite lue sur le canvas WebGPU ${st.mean.toFixed(1)} (non concluant en headless logiciel)`);
    check(!st.filterMounted, 'WebGPU : filtre GLSL non monte');
  } else {
    check(st.engine === 'webgl', 'repli automatique sur WebGL');
    check(st.mean > 2, `rendu apres repli non noir (${st.mean.toFixed(1)})`);
    check(st.hasGpuApi ? st.failure !== null : true, st.hasGpuApi ? 'echec memorise (navigator.gpu present mais adaptateur indisponible)' : 'navigator.gpu absent : repli direct');
    check(st.info.status?.kind === 'warn' || !st.hasGpuApi, 'message affiche dans les reglages: ' + JSON.stringify(st.info.status));
    // pas de nouvel essai : on espionne Application.init via le memo (la memoire de l'echec force le choix WebGL)
    if (st.failure !== null) {
      await page.reload();
      await ready();
      await page.waitForTimeout(800);
      const st2 = await state();
      check(st2.engine === 'webgl' && st2.failure === st.failure, 'echec memorise : pas de nouvel essai au lancement suivant');
      // rechoisir WebGPU efface la memoire (un nouvel essai est autorise)
      await page.evaluate(() => {
        const a = window.__arpg.app,
          s = a.game.settings;
        s.renderEngine = 'webgl';
        a.applySettings(s);
        s.renderEngine = 'webgpu';
        a.applySettings(s);
      });
      const after = await page.evaluate(() => localStorage.getItem('d2m.renderEngineFailed'));
      check(after === null, 'rechoisir WebGPU efface l echec memorise');
    }
  }
  // retour a WebGL
  await page.evaluate(() => {
    const a = window.__arpg.app,
      s = a.game.settings;
    s.renderEngine = 'webgl';
    a.applySettings(s);
    a.saveNow();
  });
  await page.reload();
  await ready();
  await page.waitForTimeout(1000);
  st = await state();
  check(st.engine === 'webgl' && st.mean > 2, 'retour a WebGL : rendu normal');
  const bad = errors.filter((e) => !/WebGPU|GPU|adapter/i.test(e));
  if (bad.length) {
    console.log('ERREURS', bad);
    fail++;
  } else if (errors.length) console.log('erreurs attendues (WebGPU)', errors.slice(0, 3));
} finally {
  await browser.close();
}
console.log(fail ? `\n${fail} verification(s) en echec` : '\ntout est bon');
process.exit(fail ? 1 : 0);
