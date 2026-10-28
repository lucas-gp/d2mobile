/**
 * Éclairage dynamique (Lot 144) : vérifie à 900x800 que le rendu n'est pas noir, que la luminosité moyenne baisse d'au plus le
 * seuil documenté, que « Désactivé » est identique à un réglage absent (et, avec --save/--compare, proche du rendu d'avant le lot, luminosite a 3 % pres : la scene vivante n'est pas reproductible au pixel), puis
 * mesure le coût (ms/image, rendu + synchronisation GPU) de chaque niveau.
 *   node tools/e2e/dynamic-light.mjs [--url=http://127.0.0.1:5233/] [--save=/chemin/off.json | --compare=/chemin/off.json] [--n=60]
 * Rendu logiciel (swiftshader) : les ms ne valent qu'en relatif.
 */
import fs from 'node:fs';
import { launch, calmSceneNearMonster } from './image-filter-lib.mjs';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const N = +(args.get('n') ?? 60);
// seuils documentés : baisse maximale de la luminosité moyenne par rapport à « Désactivé »
const MAX_DROP = { light: 0.12, normal: 0.2 };
const MIN_MEAN = 8; // sur 255 : « pas noir »

let fail = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'OK  ' : 'ECHEC'} ${msg}`);
  if (!ok) fail++;
};

const { browser, page, errors } = await launch({ url: URL, w: 900, h: 800, dpr: 1, mobile: false });
try {
  await page.evaluate(() => {
    const a = window.__arpg.app,
      s = a.game.settings;
    s.quality = 'high';
    a.applySettings(s);
  });
  await page.waitForTimeout(1500);
  const info = await calmSceneNearMonster(page);
  console.log('scene', info);
  const stats = await page.evaluate(() => {
    const a = window.__arpg.app;
    return { dyn: a.renderer.quality.dynamicLights, w: a.renderer.width, h: a.renderer.height };
  });
  check(stats.dyn, `lumieres dynamiques disponibles (qualite haute), ecran ${stats.w}x${stats.h}`);

  const shoot = (mode) =>
    page.evaluate((mode) => {
      const a = window.__arpg.app,
        rd = a.renderer,
        s = a.game.settings;
      if (mode === 'absent') delete s.dynamicLight;
      else s.dynamicLight = mode;
      a.applySettings(s);
      for (let i = 0; i < 3; i++) rd.render(a.game.world, 0, 0, [], { shake: 0, damageNumbers: true });
      const cv = rd.app.canvas;
      const c2 = document.createElement('canvas');
      c2.width = cv.width;
      c2.height = cv.height;
      const g = c2.getContext('2d');
      g.drawImage(cv, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let sum = 0,
        h = 2166136261 >>> 0;
      let cs = 0,
        cn = 0;
      const W = cv.width,
        H = cv.height;
      for (let i = 0; i < d.length; i += 4) {
        sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        h = Math.imul(h ^ d[i] ^ (d[i + 1] << 8) ^ (d[i + 2] << 16), 16777619) >>> 0;
        const p = i >> 2,
          x = p % W,
          y = (p / W) | 0;
        if (x < W * 0.15 || x > W * 0.85 || y < H * 0.15 || y > H * 0.85) {
          cs += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          cn++;
        }
      }
      return { mean: sum / (d.length / 4), edgeMean: cs / cn, hash: h, lights: rd.dynLightsUsed ?? 0, level: rd.dynLight ?? 'n/a' };
    }, mode);

  const R = {};
  for (const m of ['absent', 'off', 'light', 'normal']) R[m] = await shoot(m);
  for (const [m, r] of Object.entries(R))
    console.log(`  ${m.padEnd(7)} niveau=${r.level.padEnd(6)} lumieres=${String(r.lights).padStart(2)} luminosite=${r.mean.toFixed(2)} bords=${r.edgeMean.toFixed(2)} hash=${r.hash}`);
  check(R.off.hash === R.absent.hash, 'Desactive == reglage absent (pixel identique)');
  const again = await shoot('off');
  check(again.hash === R.off.hash, 'rendu deterministe (meme hash apres un cycle de reglages)');
  for (const m of ['off', 'light', 'normal']) check(R[m].mean > MIN_MEAN, `${m} : rendu non noir (${R[m].mean.toFixed(1)} > ${MIN_MEAN})`);
  for (const m of ['light', 'normal']) {
    const drop = (R.off.mean - R[m].mean) / R.off.mean;
    check(drop <= MAX_DROP[m], `${m} : baisse de luminosite moyenne ${(drop * 100).toFixed(1)} % <= ${MAX_DROP[m] * 100} %`);
    const edge = R[m].edgeMean / R.off.edgeMean;
    check(edge >= 0.7, `${m} : bords a ${(edge * 100).toFixed(0)} % du rendu desactive (>= 70 %)`);
  }
  const save = args.get('save'),
    cmp = args.get('compare');
  if (save) {
    fs.writeFileSync(save, JSON.stringify({ off: R.off.hash, mean: R.off.mean }));
    console.log('reference enregistree', save);
  }
  if (cmp) {
    const ref = JSON.parse(fs.readFileSync(cmp, 'utf8'));
    // la scène vivante (monstres en mouvement avant le gel) n'est pas reproductible au pixel d'une exécution à l'autre : on compare la luminosité moyenne (bruit observé < 1,5 %)
    const rel = Math.abs(R.off.mean - ref.mean) / ref.mean;
    check(rel <= 0.03, `Desactive ~ rendu d'avant le lot (luminosite ${R.off.mean.toFixed(2)} contre ${ref.mean.toFixed(2)}, ecart ${(rel * 100).toFixed(1)} %)`);
  }

  // coût : N images identiques, lecture d'un pixel pour synchroniser le GPU
  const bench = {};
  for (const m of ['off', 'light', 'normal']) {
    bench[m] = await page.evaluate(
      ([m, N]) => {
        const a = window.__arpg.app,
          rd = a.renderer,
          s = a.game.settings,
          gl = rd.app.renderer.gl,
          px = new Uint8Array(4);
        s.dynamicLight = m;
        a.applySettings(s);
        const one = () => {
          rd.render(a.game.world, 0, 0, [], { shake: 0, damageNumbers: true });
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        };
        for (let i = 0; i < 5; i++) one();
        const t = [];
        for (let i = 0; i < N; i++) {
          const t0 = performance.now();
          one();
          t.push(performance.now() - t0);
        }
        t.sort((x, y) => x - y);
        return { mean: t.reduce((x, y) => x + y, 0) / N, median: t[N >> 1] };
      },
      [m, N],
    );
  }
  const base = bench.off.median;
  for (const m of ['off', 'light', 'normal']) console.log(`  cout ${m.padEnd(7)} moy ${bench[m].mean.toFixed(1)} ms  med ${bench[m].median.toFixed(1)} ms  x${(bench[m].median / base).toFixed(2)}`);
  if (errors.length) {
    console.log('ERREURS', errors);
    fail++;
  }
} finally {
  await browser.close();
}
console.log(fail ? `\n${fail} verification(s) en echec` : '\ntout est bon');
process.exit(fail ? 1 : 0);
