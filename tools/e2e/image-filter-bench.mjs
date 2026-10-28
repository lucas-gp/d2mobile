/**
 * Coût du filtre « Qualité d'image » : temps moyen d'une image (rendu + synchronisation GPU par lecture d'un pixel), N images
 * identiques rendues à la main, avec chaque réglage. Navigateur headless en rendu logiciel (swiftshader) : valeurs RELATIVES seulement.
 *   PLAYWRIGHT_BROWSERS_PATH=... node tools/e2e/image-filter-bench.mjs [--url=http://127.0.0.1:5233/] [--n=60]
 */
import { launch, calmSceneNearMonster, setImage } from './image-filter-lib.mjs';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const N = +(args.get('n') ?? 60);
const CONFIGS = [
  ['Off', {}],
  ['Leger', { sharp: 1 }],
  ['Fort+lissage', { sharp: 3, smooth: true }],
  ['Ambiance seule', { mood: 'dark' }],
  ['Tout', { sharp: 3, smooth: true, mood: 'dark' }],
  ['Doux', { scale: 'soft' }],
  ['Pixel-art', { scale: 'pixel' }],
  ['Net', { sharp: 2, scale: 'pixel', mood: 'vivid' }],
  ['Cinema', { sharp: 1, scale: 'pixel', mood: 'warm' }],
];
for (const [name, w, h, dpr, mobile] of [
  ['740x360 (x2)', 740, 360, 2, true],
  ['1920x1080', 1920, 1080, 1, false],
]) {
  const { browser, page, errors } = await launch({ url: URL, w, h, dpr, mobile });
  try {
    await calmSceneNearMonster(page);
    const res = [];
    for (const [k, c] of CONFIGS) {
      await setImage(page, c);
      const r = await page.evaluate((N) => {
        const a = window.__arpg.app,
          rd = a.renderer,
          gl = rd.app.renderer.gl,
          px = new Uint8Array(4);
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
        return { mean: t.reduce((s, x) => s + x, 0) / N, median: t[N >> 1], mounted: rd.imageFilterMounted };
      }, N);
      res.push({ cfg: k, mean: +r.mean.toFixed(1), median: +r.median.toFixed(1), mounted: r.mounted });
    }
    const base = res[0].median;
    console.log(`\n${name} (${w * dpr}x${h * dpr} px) -- ms/image, mediane`);
    for (const r of res) console.log(`  ${r.cfg.padEnd(16)} moy ${String(r.mean).padStart(6)}  med ${String(r.median).padStart(6)}  x${(r.median / base).toFixed(2)}  filtre monte: ${r.mounted}`);
    if (errors.length) console.log('ERREURS', errors);
  } finally {
    await browser.close();
  }
}
