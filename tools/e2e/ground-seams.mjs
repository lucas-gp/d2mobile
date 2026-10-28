/**
 * Traits de couture au sol : déplace la caméra par petits pas fractionnaires sur des cartes de sol clair (neige…) et compte les
 * pixels « trait sombre fin » (un pixel beaucoup plus sombre que ses voisins à 2-3 px de chaque côté, sur sol clair) : le fond noir
 * qui filtre entre deux tuiles. Les entités, ombres et effets sont masqués : seul le sol compte. Seuil documenté : 0 pixel de
 * couture par image (tolérance --max, défaut 0).
 *   node tools/e2e/ground-seams.mjs [url=http://127.0.0.1:5233/] [--maps=a,b] [--zooms=1,1.4] [--dpr=2.625] [--size=900x800]
 *        [--scales=normal,soft,pixel] [--frames=8] [--shots=dossier] [--max=0]
 * PLAYWRIGHT_BROWSERS_PATH=<dossier>, serveur vite lancé à part (art D2 privé en dev local).
 */
import { chromium } from 'playwright-core';
import UPNG from 'upng-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const URL = argv.find((a) => a.startsWith('http')) ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const MAPS = opt('maps', 'arreat_battlefield,fall_caldeum').split(',');
const ZOOMS = opt('zooms', '1,1.1,1.4,1.7').split(',').map(Number);
const DPR = +opt('dpr', '2.625');
const [VW, VH] = opt('size', '900x800').split('x').map(Number);
const SCALES = opt('scales', 'normal,soft,pixel').split(',');
const FRAMES = +opt('frames', '8');
const SHOTS = opt('shots', '');
const MAX = +opt('max', '0');
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/** Pixels de couture : quasi noirs purs (le fond, canal max <= 12 : le grain du sol de neige reste au-dessus) et plus sombres que 45 % de leurs deux voisins (à 2 et 3 px, horizontal ou vertical), voisins clairs (luminance > 110) */
export function countSeams(rgba, W, H, skip) {
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = 0.3 * rgba[i * 4] + 0.59 * rgba[i * 4 + 1] + 0.11 * rgba[i * 4 + 2];
  let n = 0;
  const pts = [];
  for (let y = 4; y < H - 4; y++)
    for (let x = 4; x < W - 4; x++) {
      if (skip(x, y)) continue;
      const v = L[y * W + x];
      if (v > 12 || Math.max(rgba[(y * W + x) * 4], rgba[(y * W + x) * 4 + 1], rgba[(y * W + x) * 4 + 2]) > 12) continue;
      let hit = false;
      for (const d of [2, 3]) {
        const a = L[y * W + x - d],
          b = L[y * W + x + d],
          c = L[(y - d) * W + x],
          e = L[(y + d) * W + x];
        if ((Math.min(a, b) > 110 && v < 0.45 * Math.min(a, b)) || (Math.min(c, e) > 110 && v < 0.45 * Math.min(c, e))) hit = true;
      }
      if (hit) {
        n++;
        if (pts.length < 4000) pts.push(x, y);
      }
    }
  return { n, pts };
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fail = 0;
const jobs = MAPS.flatMap((zone) => SCALES.flatMap((scale) => ZOOMS.map((zoom) => ({ zone, scale, zoom }))));
const errors = [];
/** Une session : connexion, puis les tâches restantes ; un rechargement de page (serveur dev : un autre agent modifie des fichiers) interrompt, la suite relance */
async function session() {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  try {
    await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${URL}?testchar=1`);
    await page.waitForSelector('.charselect', { timeout: 90000 });
    await pickFirstMode(page);
    await page.locator('.charselect .d2plate').first().dblclick();
    await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading:not(.hidden)'), null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      window.__arpg.game().settings.tips = false;
      for (const e of document.querySelectorAll('.tip-card')) e.remove();
    });
    let curZone = '';
    let info = null;
    while (jobs.length) {
      const { zone, scale, zoom } = jobs[0];
      if (zone !== curZone) {
        info = await page.evaluate(
          ([zone]) => {
            const a = window.__arpg,
              g = a.game();
            if (g.mode === 'run') g.enterTown();
            const it = a.giveMap(3, 'normal', zone);
            const r = g.startMap({ invIndex: g.character.inventory.findIndex((x) => x && x.uid === it.uid) }, 77);
            if (!r.ok) return { err: r.reason };
            a.god(true);
            const w = g.world;
            w.pendingSpawns = [];
            for (const m of w.monsters) m.dead = true;
            return { x: w.zone.start.x, y: w.zone.start.y, ground: w.zone.ground };
          },
          [zone],
        );
        curZone = zone;
        if (info.err) {
          console.log(zone, 'refus', info.err);
          fail++;
          jobs.splice(0, jobs.length, ...jobs.filter((j) => j.zone !== zone));
          continue;
        }
        await page.waitForTimeout(1500);
      }
      await page.evaluate(
        ([scale, zoom]) => {
          const a = window.__arpg,
            s = a.game().settings;
          s.imageScale = scale;
          s.zoom = zoom;
          s.lighting = 'clair';
          a.app.applySettings(s);
          document.getElementById('hud').style.visibility = 'hidden';
          for (const e of document.querySelectorAll('.panels,#panels,.loading')) e.style.visibility = 'hidden';
          const r = a.renderer();
          for (const l of [r.entityLayer, r.shadowLayer, r.ghostLayer]) l.visible = false;
        },
        [scale, zoom],
      );
      let total = 0,
        worst = 0,
        px = 0;
      for (let f = 0; f < FRAMES; f++) {
        // pas fractionnaires incommensurables (multiples de 0,13 unité + dérive) : positions de caméra variées par rapport à la grille de pixels
        const dx = 0.13 * f * 1.7 + 0.037 * f * f,
          dy = 0.13 * f * 0.9 + 0.021 * f * f;
        await page.evaluate(
          ([x, y]) => {
            const a = window.__arpg;
            a.teleport(x, y);
            const r = a.renderer();
            r.camX = x;
            r.camY = y;
          },
          [info.x + dx, info.y + dy],
        );
        await page.waitForTimeout(160);
        const buf = await page.screenshot();
        const img = UPNG.decode(buf);
        const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
        px = img.width * img.height;
        const R = 40 * DPR * 1.5; // masque autour du joueur (entités masquées, par sécurité)
        const { n } = countSeams(rgba, img.width, img.height, (x, y) => Math.abs(x - img.width / 2) < R && Math.abs(y - img.height / 2) < R * 1.5);
        total += n;
        worst = Math.max(worst, n);
        if (SHOTS && f < 2) writeFileSync(join(SHOTS, `${zone}-${scale}-z${zoom}-${f}.png`), buf);
      }
      const ratio = worst / px;
      const ok = ratio <= MAX;
      if (!ok) fail++;
      console.log(
        `${ok ? 'ok  ' : 'FAIL'} ${zone} sol=${info.ground} échelle=${scale} zoom=${zoom} : couture max ${worst} px/image (moy ${(total / FRAMES).toFixed(1)}) = ${(ratio * 100).toFixed(4)} % de l'écran`,
      );
      jobs.shift();
    }
  } finally {
    await ctx.close();
  }
}
try {
  for (let essai = 0; jobs.length && essai < 6; essai++) {
    try {
      await session();
    } catch (e) {
      console.log('session interrompue (rechargement du serveur dev ?), reprise :', String(e.message).split('\n')[0].slice(0, 100));
    }
  }
  if (jobs.length) {
    console.log('tâches non faites', jobs.length);
    fail++;
  }
  if (errors.length) {
    console.log('erreurs page', errors.slice(0, 3));
    fail++;
  }
} finally {
  await browser.close();
}
process.exit(fail ? 1 : 0);
