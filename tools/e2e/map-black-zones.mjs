/**
 * Zones noires au bord des murs des cartes d'endgame : ouvre des cartes dans le client (personnage d'essai niveau 99),
 * place le joueur à 6 positions variées (départ, près d'un mur, couloir, grande salle, bord de la carte, arène du boss),
 * capture l'écran sans HUD et mesure les pixels (quasi) noirs proches du sol praticable (le noir au-delà de la carte, sous
 * le brouillard et dans le vide voulu est ignoré). Sans option : 3 cartes (rapide) ; --all : les 37.
 *   node tools/e2e/map-black-zones.mjs [url=http://127.0.0.1:5233/] [--all] [--maps=a,b] [--sizes=900x800,740x360] [--shots=dossier] [--debug]
 * `--debug` : dessine en plus la vue des cases (praticable / mur / sans tuile de sol) dans <dossier>/debug-*.png.
 * PLAYWRIGHT_BROWSERS_PATH=<dossier>, serveur vite lancé à part.
 */
import { chromium } from 'playwright-core';
import UPNG from 'upng-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pickFirstMode } from './pick-mode.mjs';

const argv = process.argv.slice(2);
const URL = argv.find((a) => a.startsWith('http')) ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const ALL = argv.includes('--all');
const SHOTS = argv.find((a) => a.startsWith('--shots='))?.slice(8);
const DEBUG = argv.includes('--debug');
const SIZES = (argv.find((a) => a.startsWith('--sizes='))?.slice(8) ?? '900x800').split(',').map((s) => s.split('x').map(Number));
const QUICK = ['zoltun_kulle', 'halls_torture', 'horazon_memory']; // intérieur ×2 (murs pleins et bas) et extérieur avec vide (tuiles de 5 unités)
const MAXBAD = +(argv.find((a) => a.startsWith('--max='))?.slice(6) ?? 0.005); // part de l'écran tolérée (rayon 4 u) : avant correction 5 à 28 %, après < 0,5 %
const BLACK = +(argv.find((a) => a.startsWith('--black='))?.slice(8) ?? 2); // canal max <= BLACK : noir
const TIER = {};
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const POS = ['depart', 'mur', 'couloir', 'salle', 'bord', 'boss'];

const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
let fail = 0;
const rows = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const [vw, vh] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const login = async () => {
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
    };
    await login();
    const catalog = await page.evaluate(async () => {
      const m = await import('/src/data/maps.ts');
      return m.MAP_ZONES.map((z) => [z.id, z.tier]);
    });
    const maps = (
      argv
        .find((a) => a.startsWith('--maps='))
        ?.slice(7)
        .split(',') ?? (ALL ? catalog.map((c) => c[0]) : QUICK)
    ).map((id) => [id, catalog.find((c) => c[0] === id)?.[1] ?? 1]);
    for (const [zone, tier] of maps) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const info = await page.evaluate(
            ([zone, tier]) => {
              const a = window.__arpg,
                g = a.game();
              if (g.mode === 'run') g.enterTown();
              const it = a.giveMap(+tier, 'normal', zone);
              const idx = g.character.inventory.findIndex((x) => x && x.uid === it.uid);
              const r = g.startMap({ invIndex: idx }, 77);
              if (!r.ok) return { err: r.reason };
              a.god(true);
              const w = g.world,
                gr = w.grid,
                C = gr.cols,
                R = gr.rows,
                CELL = 0.5;
              w.pendingSpawns = []; // aucun monstre dans les captures
              for (const m of w.monsters) m.dead = true;
              const free = (i) => gr.blocked[i] === 0;
              // cases atteignables depuis le départ + dégagement (distance à la case bloquée la plus proche, en cases)
              const s0 = gr.nearestFree(w.zone.start.x, w.zone.start.y, 2) ?? w.zone.start;
              const seen = new Uint8Array(C * R);
              const q = [Math.floor(s0.y / CELL) * C + Math.floor(s0.x / CELL)];
              seen[q[0]] = 1;
              for (let h = 0; h < q.length; h++) {
                const i = q[h],
                  x = i % C,
                  y = (i - x) / C;
                for (const [dx, dy] of [
                  [1, 0],
                  [-1, 0],
                  [0, 1],
                  [0, -1],
                ]) {
                  const nx = x + dx,
                    ny = y + dy;
                  if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
                  const j = ny * C + nx;
                  if (!seen[j] && free(j)) {
                    seen[j] = 1;
                    q.push(j);
                  }
                }
              }
              const clr = new Uint8Array(C * R).fill(255);
              const qq = [];
              for (let i = 0; i < C * R; i++)
                if (!free(i)) {
                  clr[i] = 0;
                  qq.push(i);
                }
              for (let h = 0; h < qq.length; h++) {
                const i = qq[h],
                  x = i % C,
                  y = (i - x) / C;
                for (let dy = -1; dy <= 1; dy++)
                  for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx,
                      ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
                    const j = ny * C + nx;
                    if (clr[j] === 255) {
                      clr[j] = Math.min(250, clr[i] + 1);
                      qq.push(j);
                    }
                  }
              }
              const reach = q.slice();
              const pick = (f, cmp) => {
                let best = -1,
                  bv = null;
                for (const i of reach) {
                  const v = f(i);
                  if (v === null) continue;
                  if (bv === null || cmp(v, bv)) {
                    bv = v;
                    best = i;
                  }
                }
                return best;
              };
              const xy = (i) => [((i % C) + 0.5) * CELL, (Math.floor(i / C) + 0.5) * CELL];
              const S = w.zone.start;
              const walls = reach.filter((i) => clr[i] === 2 && Math.hypot(xy(i)[0] - S.x, xy(i)[1] - S.y) > 25);
              const corr = reach.filter((i) => clr[i] >= 3 && clr[i] <= 5 && Math.hypot(xy(i)[0] - S.x, xy(i)[1] - S.y) > 25);
              const bigI = pick(
                (i) => clr[i],
                (a, b) => a > b,
              );
              const edgeI = pick(
                (i) => {
                  const [x, y] = xy(i);
                  return Math.min(x, y, w.zone.width - x, w.zone.height - y);
                },
                (a, b) => a < b,
              );
              const sp = w.zone.spawns.find((s) => s.runBoss);
              const bossP = sp ? (gr.nearestFree(sp.x - 9, sp.y, 6) ?? gr.nearestFree(sp.x + 9, sp.y, 6)) : S;
              const P = [
                [S.x, S.y],
                walls.length ? xy(walls[Math.floor(walls.length * 0.37)]) : [S.x, S.y],
                corr.length ? xy(corr[Math.floor(corr.length * 0.61)]) : [S.x, S.y],
                xy(bigI),
                xy(edgeI),
                [bossP.x, bossP.y],
              ];
              // champ de distance au sol praticable (en cases, plafonné) et cases de vide voulu (bloquées mais transparentes)
              const dist = new Uint8Array(C * R).fill(255);
              const dq = [];
              for (let i = 0; i < C * R; i++)
                if (free(i)) {
                  dist[i] = 0;
                  dq.push(i);
                }
              for (let h = 0; h < dq.length; h++) {
                const i = dq[h];
                if (dist[i] >= 40) continue;
                const x = i % C,
                  y = (i - x) / C;
                for (let dy = -1; dy <= 1; dy++)
                  for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx,
                      ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
                    const j = ny * C + nx;
                    if (dist[j] === 255) {
                      dist[j] = dist[i] + 1;
                      dq.push(j);
                    }
                  }
              }
              const voidc = new Uint8Array(C * R);
              for (let i = 0; i < C * R; i++) if (gr.blocked[i] && !gr.opaque[i]) voidc[i] = 1;
              const enc = (u) => {
                let s = '';
                for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
                return btoa(s);
              };
              const gt = w.zone.groundTiles;
              return {
                C,
                R,
                W: w.zone.width,
                H: w.zone.height,
                P,
                dist: enc(dist),
                voidc: enc(voidc),
                blocked: enc(gr.blocked),
                indoor: !!gt && gt.data.includes(255),
                gt: gt ? { cols: gt.cols, rows: gt.rows, size: gt.size, data: enc(gt.data) } : null,
              };
            },
            [zone, tier],
          );
          if (info.err) {
            console.log(zone, 'refus', info.err);
            fail++;
            continue;
          }
          const dist = b64(info.dist),
            voidc = b64(info.voidc);
          const stats = { depart: null };
          for (let k = 0; k < POS.length; k++) {
            await page.evaluate(([x, y]) => {
              window.__arpg.teleport(x, y);
            }, info.P[k]);
            await page.waitForTimeout(900);
            const cam = await page.evaluate(() => {
              const r = window.__arpg.renderer();
              r.camX = window.__arpg.game().world.player.x;
              r.camY = window.__arpg.game().world.player.y;
              document.getElementById('hud').style.visibility = 'hidden';
              for (const e of document.querySelectorAll('.panels,#panels,.loading')) e.style.visibility = 'hidden';
              return { x: r.camX, y: r.camY, zoom: r.zoom, w: r.width, h: r.height };
            });
            await page.waitForTimeout(250);
            const buf = await page.screenshot();
            await page.evaluate(() => {
              document.getElementById('hud').style.visibility = '';
            });
            const png = UPNG.decode(buf);
            const rgba = new Uint8Array(UPNG.toRGBA8(png)[0]);
            const Wp = png.width,
              Hp = png.height;
            const C2 = 32,
              ix = (x, y) => (x - y) * C2,
              iy = (x, y) => (x + y) * C2 * 0.5;
            const cx0 = ix(cam.x, cam.y),
              cy0 = iy(cam.x, cam.y);
            let n4 = 0,
              n8 = 0,
              nAll = 0,
              tot = 0;
            const mark = SHOTS ? new Uint8Array(rgba) : null;
            for (let py = 0; py < Hp; py++)
              for (let px = 0; px < Wp; px++) {
                const o = (py * Wp + px) * 4;
                tot++;
                if (Math.max(rgba[o], rgba[o + 1], rgba[o + 2]) > BLACK) continue;
                nAll++;
                const sx = (px - cam.w / 2) / cam.zoom + cx0,
                  sy = (py - cam.h / 2) / cam.zoom + cy0;
                const a = sx / C2,
                  b = (2 * sy) / C2,
                  wx = (a + b) / 2,
                  wy = (b - a) / 2;
                const cx = Math.floor(wx / 0.5),
                  cy = Math.floor(wy / 0.5);
                if (cx < 0 || cy < 0 || cx >= info.C || cy >= info.R) continue;
                const i = cy * info.C + cx;
                if (voidc[i]) continue;
                const d = dist[i];
                if (d <= 8) {
                  n4++;
                  if (mark) {
                    mark[o] = 255;
                    mark[o + 1] = 0;
                    mark[o + 2] = 255;
                  }
                }
                if (d <= 16) n8++;
              }
            const r = { zone, size: `${vw}x${vh}`, pos: POS[k], n4: n4 / tot, n8: n8 / tot, all: nAll / tot };
            rows.push(r);
            if (r.n4 > MAXBAD) {
              fail++;
              console.log(`  ECHEC ${zone} ${r.size} ${r.pos} : noir près du sol ${(r.n4 * 100).toFixed(2)} %`);
            }
            if (SHOTS) {
              const name = `${zone}-${vw}x${vh}-${POS[k]}`;
              writeFileSync(join(SHOTS, `${name}.png`), buf);
              if (r.n4 > 0.002) writeFileSync(join(SHOTS, `${name}-marque.png`), Buffer.from(UPNG.encode([mark.buffer], Wp, Hp, 0)));
            }
          }
          if (SHOTS) writeFileSync(join(SHOTS, 'resultats.json'), JSON.stringify(rows, null, 1));
          await page.waitForTimeout(2500);
          const late = await page.evaluate(() => {
            const w = window.__arpg.game().world,
              bank = window.__arpg.renderer().bank;
            return [...new Set(w.zone.props.map((p) => p.prop).filter((id) => !bank.get(`prop_${id}.${w.zone.id}`) && !bank.get(`prop_${id}`)))];
          });
          if (late.length) {
            fail++;
            console.log(`  ECHEC planches de décor jamais chargées : ${late.join(',')}`);
          }
          const mine = rows.filter((r) => r.zone === zone && r.size === `${vw}x${vh}`);
          console.log(
            `${zone.padEnd(22)} ${vw}x${vh} noir<4u ${mine.map((r) => `${r.pos}:${(r.n4 * 100).toFixed(1)}`).join(' ')}  | max<8u ${(Math.max(...mine.map((r) => r.n8)) * 100).toFixed(1)} %`,
          );
          if (DEBUG && SHOTS) {
            // vue des cases : gris = mur / hors carte, vert = praticable avec tuile de sol, rouge = praticable SANS tuile, bleu = sans tuile à moins de 1 tuile du praticable
            const { gt, C, R } = info;
            if (gt) {
              const data = b64(gt.data),
                blk = b64(info.blocked);
              const S = 3,
                Wd = C * S,
                Hd = R * S,
                im = new Uint8Array(Wd * Hd * 4);
              for (let y = 0; y < R; y++)
                for (let x = 0; x < C; x++) {
                  const i = y * C + x,
                    tx = Math.floor((x * 0.5) / gt.size),
                    ty = Math.floor((y * 0.5) / gt.size);
                  const has = data[ty * gt.cols + tx] !== 255,
                    fr = !blk[i];
                  let col = [40, 40, 40];
                  if (fr) col = has ? [60, 160, 60] : [230, 40, 40];
                  else if (!has) col = [20, 20, 20];
                  else col = [120, 120, 150];
                  for (let dy = 0; dy < S; dy++)
                    for (let dx = 0; dx < S; dx++) {
                      const o = ((y * S + dy) * Wd + x * S + dx) * 4;
                      im[o] = col[0];
                      im[o + 1] = col[1];
                      im[o + 2] = col[2];
                      im[o + 3] = 255;
                    }
                }
              writeFileSync(join(SHOTS, `debug-${zone}.png`), Buffer.from(UPNG.encode([im.buffer], Wd, Hd, 0)));
            }
          }
        } catch (e) {
          // rechargement de la page par le serveur de développement (fichiers modifiés par ailleurs) : on se reconnecte et on reprend la carte
          console.log(`  ${zone} : page rechargée (${String(e.message).split('\n')[0].slice(0, 60)}), nouvel essai`);
          rows.splice(0, rows.length, ...rows.filter((r) => !(r.zone === zone && r.size === `${vw}x${vh}`)));
          await login();
          continue;
        }
        break;
      }
    }
    if (errors.length) {
      console.log('erreurs page :', errors.slice(0, 3));
      fail++;
    }
    await ctx.close();
  }
  if (SHOTS) writeFileSync(join(SHOTS, 'resultats.json'), JSON.stringify(rows, null, 1));
  const worst = [...rows].sort((a, b) => b.n4 - a.n4).slice(0, 10);
  console.log('10 pires :', worst.map((r) => `${r.zone}/${r.size}/${r.pos} ${(r.n4 * 100).toFixed(2)} %`).join(' ; '));
} finally {
  await browser.close();
}
console.log(fail ? `ECHEC (${fail})` : 'OK');
process.exit(fail ? 1 : 0);
