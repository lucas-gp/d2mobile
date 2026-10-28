/**
 * Planches de contrôle des effets de sorts importés (usage privé, sorties hors dépôt) : pour chaque effet, huit directions à mi-animation
 * (ou six images consécutives pour un effet sans direction), en fusion additive sur fond sombre, avec le losange d'une unité de monde.
 *   node tools/e2e/d2-fx.mjs <dossier de sortie> [--url=http://127.0.0.1:5233/] [--only=a,b] [--tier=hi]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
const args = new Map(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const TIER = args.get('tier') ?? 'hi';
const only = args.get('only')?.split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`${URL}d2/manifest.json`);
const manifest = await page.evaluate(() => fetch('manifest.json').then((r) => r.json()));
const ids = Object.keys(manifest.sheets).filter((id) => id.startsWith('fx_') && (!only || only.includes(id.slice(3))));
const PER = 6;
for (let b = 0; b < ids.length; b += PER) {
  const batch = ids.slice(b, b + PER);
  const size = await page.evaluate(
    async ({ batch, tier }) => {
      const load = (src) =>
        new Promise((res, rej) =>
          Object.assign(new Image(), {
            onload() {
              res(this);
            },
            onerror: rej,
            src,
          }),
        );
      const sheets = [];
      for (const id of batch) {
        const j = await fetch(`${tier}/${id}.json`).then((r) => r.json());
        j.img = await Promise.all(j.pages.map((p) => load(`${tier}/${p.file}`)));
        sheets.push(j);
      }
      let R = 60;
      for (const j of sheets) for (const r of Object.values(j.frames)) R = Math.max(R, Math.max(r[5], r[6], r[3] - r[5], r[4] - r[6]) / j.scale + 4);
      R = Math.min(R, 200);
      const cell = Math.ceil(R * 2);
      const cols = 9;
      const cv = document.createElement('canvas');
      cv.width = 150 + cell * cols;
      cv.height = cell * sheets.length;
      document.body.replaceChildren(cv);
      document.body.style.margin = '0';
      const g = cv.getContext('2d');
      g.fillStyle = '#3a3630';
      g.fillRect(0, 0, cv.width, cv.height);
      sheets.forEach((j, row) => {
        const a = j.anims.idle;
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#fff';
        g.font = '12px sans-serif';
        g.fillText(j.id.slice(3) + ' ' + j.blend, 4, row * cell + 14);
        g.fillText(`${a.dirs} dir. × ${a.frames} i. @${a.fps}${a.loop ? ' boucle' : ''}`, 4, row * cell + 28);
        for (let c = 0; c < cols; c++) {
          const cx = 150 + c * cell + cell / 2;
          const cy = row * cell + cell / 2 + 10;
          g.globalCompositeOperation = 'source-over';
          g.strokeStyle = '#6a6458';
          g.beginPath();
          g.moveTo(cx - 32, cy);
          g.lineTo(cx, cy - 16);
          g.lineTo(cx + 32, cy);
          g.lineTo(cx, cy + 16);
          g.closePath();
          g.stroke();
          const dir = a.dirs > 1 && c < 8 ? Math.round((c * a.dirs) / 8) % a.dirs : 0;
          const f = a.dirs > 1 ? Math.floor(a.frames / 2) : Math.min(a.frames - 1, Math.floor((c * a.frames) / cols));
          const r = j.frames[`idle/${dir}/${f}`];
          if (!r) continue;
          g.globalCompositeOperation = j.blend === 'add' ? 'lighter' : 'source-over';
          const k = 1 / j.scale;
          g.drawImage(j.img[r[0]], r[1], r[2], r[3], r[4], cx - r[5] * k, cy - r[6] * k, r[3] * k, r[4] * k);
        }
      });
      return { w: cv.width, h: cv.height };
    },
    { batch, tier: TIER },
  );
  await page.setViewportSize({ width: size.w, height: size.h });
  const file = join(OUT, `fx-${String(b / PER + 1).padStart(2, '0')}.png`);
  await page.locator('canvas').screenshot({ path: file });
  console.log(file, batch.map((x) => x.slice(3)).join(', '));
}
await browser.close();
