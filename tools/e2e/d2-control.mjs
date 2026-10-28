/**
 * Planches de contrôle des sprites importés de Diablo II (usage privé, sorties hors dépôt) : pour chaque planche,
 * les 8 directions de l'attente puis une image de marche, d'attaque et de mort, posées sur un losange d'une unité
 * de monde (64 × 32 px) avec la flèche de la direction attendue, l'ombre et une toise de 72 px (taille de la Sorcière).
 *   node tools/e2e/d2-control.mjs <dossier de sortie> [--url=http://127.0.0.1:5233/] [--only=a,b] [--tier=hi]
 * Le serveur vite est lancé à part avec D2_OUTPUT_DIR (les fichiers sont lus sous /d2/).
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
if (!OUT) throw new Error('dossier de sortie manquant');
const args = new Map(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const TIER = args.get('tier') ?? 'hi';
const only = args.get('only')?.split(',');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`${URL}d2/manifest.json`);
const manifest = await page.evaluate(() => fetch('manifest.json').then((r) => r.json()));
const ids = Object.keys(manifest.sheets).filter((id) => !only || only.includes(id));

/** Dessine un lot de planches dans un canvas et renvoie ses mesures */
async function draw(batch, tier) {
  return page.evaluate(
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
        j.simg = await Promise.all((j.shadowPages ?? []).map((p) => load(`${tier}/${p.file}`)));
        sheets.push(j);
      }
      // cellule commune au lot : la plus grande image affichée
      let up = 80;
      let side = 40;
      const picks = (j) => {
        const n = j.dirs;
        const list = [];
        for (let i = 0; i < 8; i++) list.push({ anim: 'idle', dir: Math.round((i * (j.anims.idle?.dirs ?? n)) / 8) % (j.anims.idle?.dirs ?? n), frame: 0, arrow: i });
        const one = (anim, frame) => j.anims[anim] && list.push({ anim, dir: 0, frame: frame(j.anims[anim]), arrow: 0 });
        one('walk', (a) => Math.floor(a.frames / 4));
        one('attack', (a) => (a.action >= 0 ? a.action : Math.floor(a.frames / 2)));
        one('death', (a) => a.frames - 1);
        return list;
      };
      for (const j of sheets)
        for (const p of picks(j)) {
          const r = j.frames[`${p.anim}/${p.dir}/${p.frame}`];
          if (!r) continue;
          up = Math.max(up, r[6] / j.scale + 8);
          side = Math.max(side, r[5] / j.scale + 4, (r[3] - r[5]) / j.scale + 4);
        }
      const cw = Math.ceil(Math.max(side * 2, 72));
      const ch = Math.ceil(up + 50);
      const cv = document.createElement('canvas');
      cv.width = 150 + cw * 11;
      cv.height = ch * sheets.length;
      document.body.replaceChildren(cv);
      document.body.style.margin = '0';
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#5a5248';
      g.fillRect(0, 0, cv.width, cv.height);
      // direction du jeu i sur 8 (0 = +x monde) → vecteur écran
      const vec = (i) => {
        const a = (i * Math.PI) / 4;
        return [Math.cos(a) - Math.sin(a), (Math.cos(a) + Math.sin(a)) / 2];
      };
      const info = [];
      sheets.forEach((j, row) => {
        const y0 = row * ch + up + 8;
        g.fillStyle = '#fff';
        g.font = '13px sans-serif';
        g.fillText(j.id, 6, row * ch + 18);
        g.font = '11px sans-serif';
        const a = j.anims;
        const lines = [`${j.dirs} dir.`, ...Object.entries(a).map(([k, v]) => `${k} ${v.frames}×${v.dirs} @${v.fps}${v.stride ? ` foulée ${v.stride}` : ''}`)];
        lines.forEach((t, k) => g.fillText(t, 6, row * ch + 34 + k * 13));
        picks(j).forEach((p, col) => {
          const cx = 150 + col * cw + cw / 2;
          // losange d'une unité de monde et toise de 72 px
          g.strokeStyle = '#8a8070';
          g.beginPath();
          g.moveTo(cx - 32, y0);
          g.lineTo(cx, y0 - 16);
          g.lineTo(cx + 32, y0);
          g.lineTo(cx, y0 + 16);
          g.closePath();
          g.stroke();
          g.strokeStyle = '#d0c060';
          g.beginPath();
          g.moveTo(cx - cw / 2 + 3, y0);
          g.lineTo(cx - cw / 2 + 3, y0 - 72);
          g.stroke();
          const name = `${p.anim}/${p.dir}/${p.frame}`;
          const s = j.shadows?.[name];
          if (s && j.simg[s[0]]) {
            const k = 1 / (j.shadowScale ?? j.scale / 2);
            g.globalAlpha = 0.55;
            g.drawImage(j.simg[s[0]], s[1], s[2], s[3], s[4], cx - s[5] * k, y0 - s[6] * k, s[3] * k, s[4] * k);
            g.globalAlpha = 1;
          }
          const r = j.frames[name];
          if (r) {
            const k = 1 / j.scale;
            g.drawImage(j.img[r[0]], r[1], r[2], r[3], r[4], cx - r[5] * k, y0 - r[6] * k, r[3] * k, r[4] * k);
            if (col === 0) info.push({ id: j.id, hauteur: Math.round(r[6] * k), largeur: Math.round(r[3] * k) });
          } else {
            g.fillStyle = '#f44';
            g.fillText('absent', cx - 18, y0 - 30);
          }
          // flèche : direction attendue à l'écran
          const [vx, vy] = vec(p.arrow);
          const l = Math.hypot(vx, vy);
          g.strokeStyle = '#40e0ff';
          g.beginPath();
          g.moveTo(cx, y0 + 22);
          g.lineTo(cx + (vx / l) * 16, y0 + 22 + (vy / l) * 16);
          g.stroke();
          g.fillStyle = '#40e0ff';
          g.fillRect(cx - 2, y0 + 20, 4, 4);
          g.fillStyle = '#ddd';
          g.fillText(col < 8 ? `dir ${p.dir}` : p.anim, cx - 16, row * ch + ch - 4);
        });
      });
      return { w: cv.width, h: cv.height, info };
    },
    { batch, tier },
  );
}

const PER = 5;
const all = [];
for (let i = 0; i < ids.length; i += PER) {
  const batch = ids.slice(i, i + PER);
  const r = await draw(batch, TIER);
  await page.setViewportSize({ width: r.w, height: r.h });
  const file = join(OUT, `controle-${String(i / PER + 1).padStart(2, '0')}.png`);
  await page.locator('canvas').screenshot({ path: file });
  console.log(file, batch.join(', '));
  all.push(...r.info);
}
console.table(all);
await browser.close();
