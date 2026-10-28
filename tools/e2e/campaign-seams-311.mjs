/**
 * Lot 311 (owner: "I want no black zone between the Rogue Encampment and the next zone, to walk straight from one zone to the other as
 * if it were one zone"): a character of the base (d2, pd2) walks from the waypoint through the camp's gate into the Blood Moor and back,
 * with the touch joystick (`--touch`, Galaxy Z Fold sizes) or the held mouse. Checked: the Blood Moor's ground drawn beyond the gate
 * before crossing (screenshot: no black band), the zone changed without a loading screen, the image kept for `seamMs` (measured), the
 * hero still walking after the crossing, and back into the camp the same way.
 *
 * Lot 312 (owner: "as if it were a single zone as in the real game"): then the whole of Act I's outdoor chain walked through every seam,
 * there and back (camp, Blood Moor, Cold Plains, Stony Field, Dark Wood, Black Marsh, Tamoe Highland; the hero set down ~45 units from
 * each seam, walking the rest). At each seam, before the crossing: the neighbour simulated and drawn (its map, the copies of its monsters
 * and objects: a few of its own monsters set near the seam, and of the zone's own), no black beyond the edge (screenshot, near-black
 * pixels of the play area), the minimap going on across the seam (`hud.minimapLinkDots`); at the crossing: the scene kept
 * (`app.seamSwaps`, no loading screen), every monster seen just before still seen just after at the same place on the screen (no pop,
 * no teleport, the same identifiers), the longest frame around it and `seamMs`. `--cpu=4`: CPU slowed ×4 (CDP), for a production build
 * (`npm run build` then `npx vite preview --port 5234`, `--url=http://127.0.0.1:5234/`). Screenshots in test-results/e2e/campaign-seams-311.
 *
 * Lot 314: the camp's waypoint drawn by D2's sprite (no pillar), no town portal button in the campaign (camp and zones), each leg on the
 * side of Diablo II (camp N, Blood Moor E, Cold Plains N, Stony Field E, Dark Wood N, Black Marsh E, Tamoe N into the Monastery's gate),
 * the Blood Moor's trees thinned out (screenshot of its middle). The test's own walk made steady: over the last 5 units in front of the
 * crossing the stick held straight out (it was steered toward a point beyond the map, whose path could turn back: the last move, applied
 * after the crossing, walked the hero back over it), no monster killed by the test within 10 units of the edge (counted as a pop).
 * `E2E_WHY=1`: each crossing's hero state, the monsters gone and the input of the 90 images after it.
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort      (D2 maps: $D2_PRIVATE_DIR/out/game)
 *   node tools/e2e/campaign-seams-311.mjs [--modes=d2,pd2] [--touch] [--view=884x1104] [--url=…] [--cpu=4] [--no-chain] [--joints=3]
 */
import { chromium } from 'playwright-core';
import UPNG from 'upng-js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { kindOf, openKind } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const MODES = (args.get('modes') ?? 'd2').split(',');
const TOUCH = args.has('touch');
const [VW, VH] = (args.get('view') ?? (TOUCH ? '915x412' : '900x600')).split('x').map(Number);
const CPU = Number(args.get('cpu') ?? 1);
const CHAIN = !args.has('no-chain');
const JOINTS = Number(args.get('joints') ?? 99);
/** Walking distance (units) from each seam the hero is set down at (90+: the neighbour is built in idle time while he walks) */
const FAR = Number(args.get('far') ?? 45);
/** The chain's legs walked by goals set ahead (a click on the ground) rather than the held stick or click */
const GOAL = args.has('goal');
const SHOTS = join(process.cwd(), 'test-results', 'e2e', 'campaign-seams-311');
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const t00 = Date.now();
let tLast = t00;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  const now = Date.now();
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''} [+${((now - tLast) / 1000).toFixed(1)} s]`);
  tLast = now;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

/**
 * Black areas where a map lies (the zone's or a neighbour's drawn beyond the seam; the outside of every map, at the far corners of two
 * maps joined, left out): the share of the play area's 16-px squares (CSS px; HUD corners and bar left out) wholly pure black. `mask`:
 * per square, 1 if a map lies under its centre (computed in the page)
 */
function blackShare(png, mask) {
  const img = UPNG.decode(png);
  const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
  const { width: w } = img;
  const k = w / VW;
  let tiles = 0;
  let black = 0;
  for (const [cx, cy] of mask) {
    let b = 0;
    let n = 0;
    for (let y = Math.floor(cy * k); y < Math.floor((cy + 16) * k); y += 2)
      for (let x = Math.floor(cx * k); x < Math.floor((cx + 16) * k); x += 2) {
        const i = (y * w + x) * 4;
        n++;
        if (rgba[i] <= 3 && rgba[i + 1] <= 3 && rgba[i + 2] <= 3) b++;
      }
    tiles++;
    if (b >= n * 0.95) black++;
  }
  return black / Math.max(1, tiles);
}

/** The play area's 16-px squares (CSS px) under which a map lies: the zone's or one drawn beyond a seam */
const MASK = () => {
  const r = window.__arpg.renderer();
  const w = window.__arpg.game().world;
  const out = [];
  const maps = [{ x: 0, y: 0, w: w.zone.width, h: w.zone.height }, ...w.seamLinks.map((l) => ({ x: l.seam.at.x, y: l.seam.at.y, w: l.world.zone.width, h: l.world.zone.height, v: l.seam.view }))];
  for (let cy = Math.floor(r.height * 0.08); cy + 16 < r.height * 0.84; cy += 16)
    for (let cx = Math.floor(r.width * 0.06); cx + 16 < r.width * 0.7; cx += 16) {
      const p = r.screenToWorld(cx + 8, cy + 8);
      // inside a map, 2 units off its border (its outer ring of trees and the ground's edge), a neighbour within its part drawn
      const on = maps.some((m) => {
        const x = p.x - m.x;
        const y = p.y - m.y;
        if (x < 2 || y < 2 || x > m.w - 2 || y > m.h - 2) return false;
        return !m.v || (x >= m.v[0] && y >= m.v[1] && x <= m.v[2] && y <= m.v[3]);
      });
      if (on) out.push([cx, cy]);
    }
  return out;
};

async function play(mode) {
  const tag = `${mode}-${TOUCH ? 'touch' : 'mouse'}-${VW}x${VH}${CPU > 1 ? `-cpu${CPU}` : ''}`;
  const ctx = await browser.newContext(TOUCH ? { viewport: { width: VW, height: VH }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: VW, height: VH } });
  await ctx.addInitScript((m) => {
    if (!sessionStorage.getItem('e2e.init')) {
      localStorage.clear();
      localStorage.setItem('d2m.testchar.v1', '1');
      localStorage.setItem('d2m.mode', m);
      localStorage.setItem('d2m.lang', 'en');
      sessionStorage.setItem('e2e.init', '1');
    }
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  }, mode);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const errs = [];
  page.on('pageerror', (e) => errs.push(args.has('stack') ? String(e.stack).slice(0, 1200) : e.message.slice(0, 200)));
  await page.goto(URL);
  // lot 320: the ground items' labels let the thumb through to the stick (the loot of the monsters the test kills falls under it: a tap on a
  // label sends the hero to pick it up and the stick is ignored, a harness artefact of a thumb pressed at one fixed point)
  if (TOUCH) await page.addStyleTag({ content: '.label { pointer-events: none !important; }' }).catch(() => undefined);
  await page.waitForSelector('.charselect', { timeout: 180000 });
  await page.waitForTimeout(1500);
  await openKind(page, kindOf(mode));
  const btn = await page.$(`[data-act="mode"][data-mode="${mode}"]`);
  if (btn) await btn.click();
  await page.waitForTimeout(2500);
  if (!(await page.$('.d2input')) && (await page.$('[data-act="create"]'))) {
    await page.click('[data-act="create"]');
    await page.waitForTimeout(800);
  }
  const k = await page.evaluate(() => {
    const r = document.querySelector('.d2stage').getBoundingClientRect();
    return { l: r.left, t: r.top, k: r.width / 800 };
  });
  if (TOUCH) await page.touchscreen.tap(k.l + 300 * k.k, k.t + 470 * k.k);
  else await page.mouse.click(k.l + 300 * k.k, k.t + 470 * k.k);
  await page.waitForTimeout(400);
  await page.fill('.d2input', 'Seam');
  await page.click('.d2b.ok');
  await page.waitForTimeout(2000);
  await page.waitForFunction(() => window.__arpg?.game?.() && !document.querySelector('.loading') && !document.querySelector('.charselect'), null, { timeout: 400000 });
  await page.waitForTimeout(3000);
  for (const b of await page.$$('.tip button, .hint button')) await b.click().catch(() => undefined);
  // a watcher in the page: any loading screen shown, the zones seen; at each change of zone the monsters on the screen just before and
  // just after (identifier, screen place), and the frames' intervals around it
  await page.evaluate((why) => {
    const seen = () => {
      const g = window.__arpg.game();
      const r = window.__arpg.renderer();
      const out = new Map();
      const why = new Map();
      for (const m of g.world.monsters) {
        if (m.dead) continue;
        const v = r.actorViews.get(m.id);
        const p = r.worldToScreen(m.x, m.y);
        if (!v || !v.body.visible || !v.sheet) {
          why.set(m.id, `${!v ? 'no view' : !v.sheet ? 'no sheet' : 'hidden'} at ${Math.round(p.x)},${Math.round(p.y)}`);
          continue;
        }
        if (p.x < 40 || p.y < 40 || p.x > r.width - 40 || p.y > r.height - 40) {
          why.set(m.id, `off screen at ${Math.round(p.x)},${Math.round(p.y)}`);
          continue;
        }
        out.set(m.id, { x: p.x, y: p.y, mirror: !!m.mirror });
      }
      out.why = why;
      return out;
    };
    window.__seam = { loading: 0, zones: [], cross: [], frames: [], cost: [] };
    window.__E2E_WHY = why;
    // the costs (ms) of the parts of a crossing: the simulation's step that crosses, the renderer's swap, the first images after
    {
      const g = window.__arpg.game();
      const r = window.__arpg.renderer();
      const cost = window.__seam.cost;
      const wrap = (o, name, tag) => {
        const f = o[name].bind(o);
        o[name] = (...a) => {
          const t = performance.now();
          const v = f(...a);
          const d = performance.now() - t;
          if (d > 2) cost.push([tag, t, d]);
          if (cost.length > 600) cost.splice(0, 300);
          return v;
        };
      };
      wrap(g, 'step', 'step');
      wrap(g.seams, 'cross', 'cross');
      wrap(g.seams, 'prepareStep', 'prepare');
      wrap(r, 'swapAtSeam', 'swap');
      wrap(r, 'render', 'render');
      wrap(window.__arpg.app, 'saveNow', 'save');
    }
    let last = null;
    let lastZone = null;
    let pending = null;
    let lastAll = new Set();
    const tick = (t) => {
      const s = window.__seam;
      if (document.querySelector('.loading')) s.loading++;
      const z = window.__arpg.game().world.zone.id;
      s.frames.push(t);
      if (s.frames.length > 400) s.frames.splice(0, 200);
      const now = seen();
      if (pending) {
        // the image after the change: what vanished, appeared or jumped on the screen
        const before = pending.before;
        const gone = [];
        const jumped = [];
        // the camera's own motion between the two images (common to every monster on the screen: the median) left out
        const dxs = [];
        const dys = [];
        for (const [id, p] of before) {
          const q = now.get(id);
          if (q) {
            dxs.push(q.x - p.x);
            dys.push(q.y - p.y);
          }
        }
        const med = (v) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0);
        const cx = med(dxs);
        const cy = med(dys);
        for (const [id, p] of before) {
          const q = now.get(id);
          if (!q) {
            if (!now.why?.get(id)?.startsWith('off screen')) {
              // (why: dead, a copy dropped, no view…)
              const g = window.__arpg.game();
              const m = g.world.monsters.find((x) => x.id === id);
              gone.push(window.__E2E_WHY ? [id, m ? `${m.dead ? 'dead' : 'alive'} ${m.mirror ? 'copy' : 'own'} ${now.why?.get(id) ?? ''}` : 'absent'] : id);
            }
          } else if (Math.hypot(q.x - p.x - cx, q.y - p.y - cy) > 24) jumped.push([id, Math.round(q.x - p.x - cx), Math.round(q.y - p.y - cy)]);
        }
        // (a monster that only crossed the measured frame's margin as the camera moved is not a pop)
        const came = [...now.keys()]
          .filter((id) => !before.has(id) && !before.why?.get(id)?.startsWith('off screen'))
          .map((id) => {
            const g = window.__arpg.game();
            const m = g.world.monsters.find((x) => x.id === id);
            return m
              ? [
                  id,
                  m.def.id,
                  m.mirror ? 'copy' : 'own',
                  Math.round(Math.hypot(m.x - g.world.player.x, m.y - g.world.player.y)),
                  m.mode,
                  Math.round(m.modeT),
                  m.spawnKey,
                  pending.all.has(id) ? `before: ${pending.before.why?.get(id) ?? '?'}` : 'new',
                ]
              : [id];
          });
        pending.rec.gone = gone;
        pending.rec.came = came;
        pending.rec.jumped = jumped;
        pending.rec.before = before.size;
        pending.rec.after = now.size;
        pending = null;
      }
      if (lastZone !== null && z !== lastZone) {
        const pl = window.__arpg.game().world.player;
        const wi = window.__arpg.game().world.input;
        const rec = {
          from: lastZone,
          to: z,
          at: t,
          ms: window.__arpg.app.seamMs,
          swaps: window.__arpg.app.seamSwaps,
          hero: [+pl.x.toFixed(2), +pl.y.toFixed(2), pl.mode, pl.goal ? `${pl.goal.kind}:${pl.goal.ref}` : null, wi.moveX, wi.moveY, wi.pickup ?? null],
        };
        s.cross.push(rec);
        pending = { before: last ?? new Map(), rec, all: lastAll };
      }
      if (why && s.cross.length) {
        // (debug: the hero's input the 90 images after the last crossing)
        const c = s.cross[s.cross.length - 1];
        c.trail ??= [];
        if (c.trail.length < 90) {
          const g = window.__arpg.game();
          const ct = window.__arpg.app.controls;
          c.trail.push([
            z.slice(3, 7),
            +g.world.player.x.toFixed(1),
            +g.world.player.y.toFixed(1),
            +g.world.input.moveX.toFixed(2),
            +g.world.input.moveY.toFixed(2),
            ct?.joyId ?? '?',
            g.world.player.goal ? 1 : 0,
          ]);
        }
      }
      if (s.zones[s.zones.length - 1] !== z) s.zones.push(z);
      lastZone = z;
      last = now;
      lastAll = new Set(window.__arpg.game().world.monsters.map((m) => m.id));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, !!process.env.E2E_WHY);
  const joy = TOUCH
    ? await page.evaluate(() => {
        const r = document.querySelector('.joy-zone').getBoundingClientRect();
        return { x: r.left + r.width * 0.35, y: r.top + r.height * 0.6 };
      })
    : null;
  const st0 = await page.evaluate(() => {
    const g = window.__arpg.game();
    const s = g.world.zone.seams?.find((x) => x.to === 'a1_bloodmoor');
    return { zone: g.world.zone.id, seam: s ? { cross: s.cross, side: s.side } : null, neighbours: window.__arpg.renderer().neighbours.length };
  });
  check(st0.zone === 'a1_town' && !!st0.seam, `${tag}: the camp joined to the Blood Moor`, JSON.stringify(st0));
  if (!st0.seam) return ctx.close();
  // lot 314: the camp's waypoint drawn by D2's sprite (no pillar on it), no town portal button in a campaign, the gate on the north side
  await page
    .waitForFunction(
      () => {
        const w = window.__arpg.game().world;
        const o = w.objects.find((x) => x.kind === 'waypoint');
        return !!o && !!window.__arpg.renderer().objectViews.get(o.id)?.base;
      },
      null,
      { timeout: 30000 },
    )
    .catch(() => undefined);
  const wp0 = await page.evaluate(() => {
    const g = window.__arpg.game();
    const w = g.world;
    const o = w.objects.find((x) => x.kind === 'waypoint');
    const v = o ? window.__arpg.renderer().objectViews.get(o.id) : null;
    // the hero beside it, for the screenshot
    if (o) window.__arpg.teleport(o.x + 2.5, o.y + 3);
    const btn = document.querySelector('[data-testid="portal"]');
    return { variant: o?.variant ?? null, sheet: v?.base?.id ?? null, fx: !!v?.fx?.visible, portal: btn ? getComputedStyle(btn).display : 'none', allowed: g.portalAllowed() };
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(SHOTS, `${tag}-camp-waypoint.png`) });
  check(wp0.sheet !== 'prop_pillar_deco' && (!wp0.variant || wp0.sheet === wp0.variant), `${tag}: the camp's waypoint without the pillar, D2's sprite of it`, JSON.stringify(wp0));
  check(wp0.portal === 'none' && !wp0.allowed, `${tag}: no town portal button in the campaign's camp`, JSON.stringify(wp0));
  check(st0.seam.side === 'N', `${tag}: the camp's gate on the north side`, st0.seam.side);
  // the neighbour's edge loaded (background) before walking
  await page.waitForFunction(() => window.__arpg.renderer().neighbours.every((n) => n.view.chunkCount > 0), null, { timeout: 60000 }).catch(() => undefined);
  const mid = (st0.seam.cross[0] + st0.seam.cross[2]) / 2;
  let down = false;
  const release = async () => {
    if (!down) return;
    down = false;
    if (TOUCH) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await page.mouse.up();
  };
  async function walk(target, until, maxMs, shotAt, hold = false) {
    const t0 = Date.now();
    let res = null;
    let shot = null;
    while (Date.now() - t0 < maxMs) {
      const st = await page.evaluate((t) => {
        const w = window.__arpg.game().world;
        const r = window.__arpg.renderer();
        // the zone's own monsters that came at the hero cleared from his way (a held click on one strikes it instead of walking), the
        // monsters set near the seam for the checks left alone
        // lot 314: how far the hero is from the seam's edge (the leg's zone), or in another zone already (the walk is over: nothing more done)
        const toEdge = t.edge ? (t.side === 'N' ? w.player.y : t.side === 'S' ? t.edge.y - w.player.y : t.side === 'W' ? w.player.x : t.edge.x - w.player.x) : Infinity;
        const other = !!t.zone && w.zone.id !== t.zone;
        // (not within 10 units of the edge: a monster killed by the test as the hero crosses would be counted as a pop)
        if (window.__e2eHeld && !other && toEdge > 10)
          for (const m of w.monsters) if (!m.dead && !m.mirror && !m.pet && !window.__e2eHeld.has(m.id) && Math.hypot(m.x - w.player.x, m.y - w.player.y) < 9) w.killMonster(m, w.player);
        // a way point inside the map first (the opening), then the point beyond the edge
        const goal = t.via && t.via.zone === w.zone.id && Math.hypot(w.player.x - t.via.x, w.player.y - t.via.y) > 2.5 ? t.via : t;
        // lot 314: over the last units (and once over the edge) the stick straight out: steered toward a point beyond the map, the path
        // searched from the opening's side could turn back, and the last move sent (applied after the crossing) walked him back over it
        // (only in front of the crossing: beside it, steered to the opening as before)
        const lat = t.side === 'N' || t.side === 'S' ? w.player.x : w.player.y;
        const facing = !!t.cross && lat > (t.side === 'N' || t.side === 'S' ? t.cross[0] : t.cross[1]) + 0.6 && lat < (t.side === 'N' || t.side === 'S' ? t.cross[2] : t.cross[3]) - 0.6;
        const d = t.out && (other || (toEdge < 5 && facing)) ? (other ? { x: 0, y: 0 } : t.out) : (w.steer(goal.x, goal.y) ?? { x: goal.x - w.player.x, y: goal.y - w.player.y });
        const cv = document.querySelector('canvas').getBoundingClientRect();
        const a = r.worldToScreen(w.player.x, w.player.y);
        const b = r.worldToScreen(w.player.x + d.x, w.player.y + d.y);
        return {
          zone: w.zone.id,
          x: w.player.x,
          y: w.player.y,
          mode: w.player.mode,
          inp: [w.input.moveX, w.input.moveY, !!w.player.goal, window.__arpg.app.paused, window.__arpg.app.loadingZone, !!window.__arpg.app.panels?.open],
          a,
          sx: b.x - a.x,
          sy: b.y - a.y,
          dir: { x: d.x / (Math.hypot(d.x, d.y) || 1), y: d.y / (Math.hypot(d.x, d.y) || 1) },
          cv: [cv.left, cv.top, cv.width / r.app.screen.width, cv.height / r.app.screen.height],
        };
      }, target);
      if (shotAt && !shot && shotAt(st)) {
        const mask = await page.evaluate(MASK);
        const png = await page.screenshot({ path: join(SHOTS, `${tag}-${shotAt.name}.png`) });
        shot = {
          black: blackShare(png, mask),
          ...(await page.evaluate(() => {
            const w = window.__arpg.game().world;
            return {
              mirrors: w.monsters.filter((m) => m.mirror && !m.dead).length,
              objects: w.objects.filter((o) => o.mirror).length,
              links: w.seamLinks.filter((l) => l.active).map((l) => l.seam.to),
              dots: window.__arpg.app.hud.minimapLinkDots,
            };
          })),
        };
      }
      if (process.env.E2E_DEBUG) console.log('    st', JSON.stringify({ inp: st.inp, x: st.x, y: st.y, mode: st.mode, sx: st.sx, sy: st.sy, a: st.a, cv: st.cv, down }));
      if (until(st)) {
        res = { ...st, sec: (Date.now() - t0) / 1000 };
        // the stick or the mouse let go at once (the goal was in the zone left's coordinates), unless the walk goes on through it; the
        // click's walk toward its point dropped too (it would lead back over the seam)
        if (!hold) {
          await release();
          await page.evaluate(() => {
            window.__arpg.app.controls?.resetAll();
            window.__arpg.game().world.player.goal = null;
          });
        }
        break;
      }
      const n = Math.hypot(st.sx, st.sy) || 1;
      if (GOAL && !hold) {
        // (`--goal`: the hero sent a few units ahead along the way, as a click on the ground; under a slowed CPU the held click is not
        // reliable)
        await page.evaluate((t) => {
          const w = window.__arpg.game().world;
          const g = t.via && t.via.zone === w.zone.id && Math.hypot(w.player.x - t.via.x, w.player.y - t.via.y) > 2.5 ? t.via : t;
          if (!w.player.goal || Math.hypot(w.player.goal.x - g.x, w.player.goal.y - g.y) > 0.5) w.player.goal = { x: g.x, y: g.y, kind: 'move', ref: 0 };
        }, target);
        await page.waitForTimeout(150);
        continue;
      }
      if (TOUCH) {
        if (!down) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joy.x, y: joy.y, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: joy.x + (st.sx / n) * 60, y: joy.y + (st.sy / n) * 60, id: 1 }] });
      } else {
        await page.mouse.move(st.cv[0] + (st.a.x + (st.sx / n) * 140) * st.cv[2], st.cv[1] + (st.a.y + (st.sy / n) * 140) * st.cv[3]);
        if (!down) await page.mouse.down();
      }
      down = true;
      await page.waitForTimeout(150);
    }
    if (!res) {
      await page.screenshot({ path: join(SHOTS, `${tag}-walk-stuck-${Date.now() % 100000}.png`) });
      console.log(
        `  ${tag}: walk not done, now ${JSON.stringify(
          await page.evaluate(() => {
            const w = window.__arpg.game().world;
            return [w.zone.id, w.player.x, w.player.y, w.player.mode, w.player.goal];
          }),
        )}`,
      );
    }
    return { res, shot };
  }
  // out through the gate: a screenshot when 6 units from the edge (the Blood Moor drawn beyond it), the zone changed
  const nearGate = (st) => st.zone === 'a1_town' && st.y < 7 && Math.abs(st.x - mid) < 6;
  Object.defineProperty(nearGate, 'name', { value: 'gate' });
  const out = await walk({ x: mid, y: -3, via: { x: mid, y: 2.5, zone: 'a1_town' } }, (st) => st.zone !== 'a1_town', 40000, nearGate, true);
  check(out.res?.zone === 'a1_bloodmoor', `${tag}: into the Blood Moor through the gate, walking`, out.res ? `${out.res.sec.toFixed(1)} s` : 'still in the camp');
  check(!!out.shot && out.shot.black < 0.005, `${tag}: no black beyond the gate`, out.shot ? `${(out.shot.black * 100).toFixed(2)} % of the play area black` : '');
  // the hero goes on walking: a moment later he is farther in, with the stick or the mouse still held
  const after = await walk({ x: out.res ? out.res.x : 0, y: out.res ? out.res.y - 12 : 0 }, (st) => out.res && st.y < out.res.y - 4, 6000, null);
  const seam = await page.evaluate(() => ({
    ms: window.__arpg.app.seamMs,
    swaps: window.__arpg.app.seamSwaps,
    ...window.__seam,
    reused: window.__arpg.renderer().lastZoneMap.reused,
    nb: window.__arpg.renderer().neighbours.map((n) => n.id),
  }));
  await page.screenshot({ path: join(SHOTS, `${tag}-bloodmoor.png`) });
  check(!!after.res, `${tag}: still walking after the crossing (no stop, no new touch)`);
  check(seam.loading === 0, `${tag}: no loading screen`, `${seam.loading} frames with one`);
  check(seam.swaps >= 1, `${tag}: the scene kept at the crossing (the Blood Moor drawn before it)`, `${seam.swaps} kept`);
  check(seam.ms >= 0 && seam.ms < 1500, `${tag}: the image kept ${seam.ms.toFixed(0)} ms at the crossing`);
  if (process.env.E2E_DEBUG)
    console.log(
      await page.evaluate(() =>
        JSON.stringify(
          window.__arpg.renderer().neighbours.map((n) => ({
            id: n.id,
            chunks: n.view.chunkCount,
            parent: !!n.view.ground.parent,
            pos: [Math.round(n.view.ground.position.x), Math.round(n.view.ground.position.y)],
            vis: n.view.ground.children.filter((c) => c.visible).length,
            z: n.view.ground.zIndex,
            off: n.view.offset,
          })),
        ),
      ),
    );
  check(seam.nb.includes('a1_town'), `${tag}: the camp drawn beyond the edge from the Blood Moor`, seam.nb.join(','));
  await release();
  // back: south through the opening into the camp
  const back = await page.evaluate(() => {
    window.__arpg.god(true);
    const s = window.__arpg.game().world.zone.seams.find((x) => x.to === 'a1_town');
    return { mid: (s.cross[0] + s.cross[2]) / 2, y: s.cross[3] + 3 };
  });
  const nearEdge = (st) => st.zone === 'a1_bloodmoor' && st.y > back.y - 9;
  Object.defineProperty(nearEdge, 'name', { value: 'edge-back' });
  const home = await walk({ x: back.mid, y: back.y, via: { x: back.mid, y: back.y - 6, zone: 'a1_bloodmoor' } }, (st) => st.zone === 'a1_town', 30000, nearEdge);
  await release();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(SHOTS, `${tag}-camp-again.png`) });
  const end = await page.evaluate(() => ({ ms: window.__arpg.app.seamMs, reused: window.__arpg.renderer().lastZoneMap.reused, ...window.__seam }));
  check(home.res?.zone === 'a1_town', `${tag}: back into the camp by the gate`, home.res ? `${end.ms.toFixed(0)} ms kept, scene ${end.reused ? 'kept' : 'loaded again'}` : 'not reached');
  check(end.loading === 0, `${tag}: no loading screen on the way back`);
  check(!!home.shot && home.shot.black < 0.005, `${tag}: no black beyond the edge on the way back`, home.shot ? `${(home.shot.black * 100).toFixed(2)} %` : '');

  if (CHAIN) {
    // lot 312: the whole chain, there and back, through every seam
    // (the camp and the Blood Moor's seam was walked above, both ways: the chain starts in the Blood Moor, entered by its waypoint)
    // (lot 314: on to the Monastery's gate, joined north of the Tamoe Highland)
    // (lot 320: the Stony Field reaches the Dark Wood by the Underground Passage, no seam: the walk starts again in the Dark Wood; the
    // Burial Grounds walked into from the Cold Plains)
    const legs = [
      ['a1_bloodmoor', 'a1_coldplains'],
      ['a1_coldplains', 'a1_burial'],
      ['a1_coldplains', 'a1_stonyfield'],
      ['a1_darkwood', 'a1_blackmarsh'],
      ['a1_blackmarsh', 'a1_tamoe'],
      ['a1_tamoe', 'a1_monastery'],
    ];
    // lot 314: the side of Diablo II of each leg (sides of the maps: N least y, E most x)
    const SIDE = {
      'a1_bloodmoor>a1_coldplains': 'E',
      'a1_coldplains>a1_stonyfield': 'N',
      'a1_coldplains>a1_burial': 'S',
      'a1_darkwood>a1_blackmarsh': 'N',
      'a1_blackmarsh>a1_tamoe': 'E',
      'a1_tamoe>a1_monastery': 'N',
    };
    await page.evaluate(() => window.__arpg.game().startRun('a1_bloodmoor', 0));
    await page.waitForFunction(() => window.__arpg.game().world.zone.id === 'a1_bloodmoor' && !document.querySelector('.loading'), null, { timeout: 120000 });
    await page.waitForTimeout(2500);
    // the tips off (a tip card takes the held click)
    await page.evaluate(() => {
      window.__arpg.game().settings.tips = false;
      for (const e of document.querySelectorAll('.tip-card')) e.remove();
    });
    for (const b of await page.$$('.tip button, .hint button')) await b.click().catch(() => undefined);
    const all = [
      ...legs.slice(0, JOINTS),
      ...legs
        .slice(0, JOINTS)
        .reverse()
        .map(([a, b]) => [b, a]),
    ];
    const rows = [];
    for (const [from, to] of all) {
      // lot 320: a leg that does not start where the last one ended (the walk broken by the Underground Passage, the Burial Grounds'
      // branch): its zone entered by its waypoint
      if ((await page.evaluate(() => window.__arpg.game().world.zone.id)) !== from) {
        await page.evaluate((z) => window.__arpg.game().startRun(z, 0), from);
        await page.waitForFunction((z) => window.__arpg.game().world.zone.id === z && !document.querySelector('.loading'), from, { timeout: 120000 });
        await page.waitForTimeout(2500);
      }
      // set down ~45 units inside `from` on the way to its seam toward `to`, a few monsters of both zones held near the seam
      const prep = await page.evaluate(
        async ({ from, to, far }) => {
          const g = window.__arpg.game();
          window.__arpg.god(true);
          if (g.world.zone.id !== from) return { err: `in ${g.world.zone.id}, not ${from}` };
          const w = g.world;
          const s = w.zone.seams?.find((x) => x.to === to);
          if (!s) return { err: `no seam ${from} -> ${to}` };
          const mid = { x: (s.cross[0] + s.cross[2]) / 2, y: (s.cross[1] + s.cross[3]) / 2 };
          const n = s.side === 'N' ? [0, 1] : s.side === 'S' ? [0, -1] : s.side === 'W' ? [1, 0] : [-1, 0];
          const edge = s.side === 'N' ? { x: mid.x, y: 0 } : s.side === 'S' ? { x: mid.x, y: w.zone.height } : s.side === 'W' ? { x: 0, y: mid.y } : { x: w.zone.width, y: mid.y };
          // `far` units on foot from the opening (walking distances over the grid's free cells)
          const G = w.grid;
          const start = G.nearestFree(edge.x + n[0] * 3, edge.y + n[1] * 3, 4);
          let p = null;
          if (start) {
            const cell = G.width / G.cols;
            const dist = new Int32Array(G.cols * G.rows).fill(-1);
            const q = [Math.floor(start.y / cell) * G.cols + Math.floor(start.x / cell)];
            dist[q[0]] = 0;
            let best = -1;
            for (let h = 0; h < q.length; h++) {
              const i = q[h];
              const px = ((i % G.cols) + 0.5) * cell;
              const py = (Math.floor(i / G.cols) + 0.5) * cell;
              // away from the people and objects (a held click there would talk or open)
              if (dist[i] * cell >= far && !w.objects.some((o) => Math.hypot(o.x - px, o.y - py) < 6)) {
                best = i;
                break;
              }
              best = i;
              const cx = i % G.cols;
              for (const j of [i - 1, i + 1, i - G.cols, i + G.cols]) {
                if (j < 0 || j >= dist.length || dist[j] >= 0 || G.blocked[j]) continue;
                if ((j === i - 1 && cx === 0) || (j === i + 1 && cx === G.cols - 1)) continue;
                dist[j] = dist[i] + 1;
                q.push(j);
              }
            }
            if (best >= 0) p = G.nearestFree(((best % G.cols) + 0.5) * cell, (Math.floor(best / G.cols) + 0.5) * cell, 3);
          }
          if (!p) return { err: 'no way to the seam' };
          window.__arpg.teleport(p.x, p.y);
          window.__arpg.killAll();
          g.step(1);
          // lot 320: their loot taken off the ground (a label under the thumb on the stick is a tap that sends the hero to pick it up)
          w.items = w.items.filter((it) => it.mirror || Math.hypot(it.x - p.x, it.y - p.y) > 30);
          const N = g.seams.worldOf(to);
          window.__e2eHeld ??= new Set();
          const put = (W, species, x, y) => {
            const id = window.__arpg.spawnIn(W === w ? null : to, species, x, y, 25 * 30);
            if (id >= 0) window.__e2eHeld.add(id);
            return id >= 0;
          };
          const lat = [n[1], n[0]];
          const ownSp = w.zone.spawns.find((x) => x.monster)?.monster ?? 'zombie';
          const nbSp = N?.zone.spawns.find((x) => x.monster)?.monster ?? ownSp;
          let a = 0;
          let b = 0;
          for (const k of [-1, 1]) {
            // the zone's own, 7 units in from the edge, aside from the way; the neighbour's, 4 units beyond the edge
            if (put(w, ownSp, edge.x + n[0] * 7 + lat[0] * 4 * k, edge.y + n[1] * 7 + lat[1] * 4 * k)) a++;
            if (N && put(N, nbSp, edge.x - n[0] * 4 + lat[0] * 3 * k - s.at.x, edge.y - n[1] * 4 + lat[1] * 3 * k - s.at.y)) b++;
          }
          const via = G.nearestFree(edge.x + n[0] * 3, edge.y + n[1] * 3, 3);
          // (lot 314: `out`, the way across the edge, and `zone`: the stick held straight out over the last units, never steered toward a
          // point beyond the map from the zone left)
          return {
            p,
            beyond: { x: edge.x - n[0] * 6, y: edge.y - n[1] * 6, via: via ? { ...via, zone: from } : null, zone: from, out: { x: -n[0], y: -n[1] }, side: s.side, edge, cross: s.cross },
            edge,
            cross: s.cross,
            side: s.side,
            own: a,
            nb: b,
            built: !!N,
          };
        },
        // (the camps are small: 45 units at most there)
        { from, to, far: from.endsWith('_town') ? Math.min(FAR, 45) : FAR },
      );
      if (prep.err) {
        check(false, `${tag}: ${from} -> ${to} set down`, prep.err);
        break;
      }
      const want = SIDE[`${from}>${to}`] ?? { N: 'S', S: 'N', E: 'W', W: 'E' }[SIDE[`${to}>${from}`]];
      check(prep.side === want, `${tag}: ${from} -> ${to} on the side of Diablo II`, `${prep.side} (${want})`);
      // lot 314: no portal button in the campaign's zones; the trees thinned out (the zone's list of trees not drawn)
      const z314 = await page.evaluate(() => {
        const b = document.querySelector('[data-testid="portal"]');
        return { portal: b ? getComputedStyle(b).display : 'none', hidden: window.__arpg.game().world.zone.d2Map?.hidden?.length ?? 0 };
      });
      check(z314.portal === 'none', `${tag}: ${from}: no town portal button`, z314.portal);
      if (from === 'a1_bloodmoor' && to === 'a1_coldplains') {
        check(z314.hidden > 500, `${tag}: the Blood Moor's trees thinned out`, `${z314.hidden} structures not drawn`);
        // a look at the moor in the middle of the map (the owner's screenshot 3: a wall of trees)
        await page.evaluate(() => {
          const w = window.__arpg.game().world;
          const p = w.grid.nearestFree(w.zone.width / 2, w.zone.height / 2, 20);
          if (p) window.__arpg.teleport(p.x, p.y);
        });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: join(SHOTS, `${tag}-bloodmoor-middle.png`) });
        await page.evaluate((p) => window.__arpg.teleport(p.x, p.y), prep.p);
        await page.waitForTimeout(600);
      }
      await page.waitForTimeout(600);
      const near = (st) => st.zone === from && Math.hypot(Math.max(prep.cross[0] - st.x, 0, st.x - prep.cross[2]), Math.max(prep.cross[1] - st.y, 0, st.y - prep.cross[3])) < 6;
      Object.defineProperty(near, 'name', { value: `${from}-to-${to}` });
      const [swaps0, loading0] = await page.evaluate(() => [window.__arpg.app.seamSwaps, window.__seam.loading]);
      // a fresh press for the leg (the mouse let go first)
      if (!TOUCH) {
        await page.mouse.up();
        down = false;
      }
      // `--cpu`: the CPU slowed while the neighbour is prepared in idle time (the hero standing ~`far` units off) and over the last 14 units
      // and the crossing (the walk itself at full speed: a held click is not followed reliably under a slowed CPU)
      let prepWorst = -1;
      if (CPU > 1) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
        const t1 = Date.now();
        await page.waitForFunction((id) => !!window.__arpg.game().seams.worldOf(id), to, { timeout: 40000 }).catch(() => undefined);
        prepWorst = await page.evaluate((t) => {
          const fr = window.__seam.frames;
          let w = 0;
          for (let i = 1; i < fr.length; i++) if (fr[i] >= performance.now() - t) w = Math.max(w, fr[i] - fr[i - 1]);
          return Math.round(w);
        }, Date.now() - t1);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        const close = (st) => st.zone !== from || Math.hypot(Math.max(prep.cross[0] - st.x, 0, st.x - prep.cross[2]), Math.max(prep.cross[1] - st.y, 0, st.y - prep.cross[3])) < 14;
        await walk(prep.beyond, close, 60000, null, true);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
      }
      const r = await walk(prep.beyond, (st) => st.zone !== from, 60000, near);
      if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      if (!r.res) await page.screenshot({ path: join(SHOTS, `${tag}-${from}-to-${to}-stuck.png`) });
      if (!r.res)
        console.log(
          `  ${tag}: ${from} -> ${to} not reached: set down at ${JSON.stringify(prep.p)}, way ${JSON.stringify(prep.beyond)}, now ${JSON.stringify(
            await page.evaluate(() => {
              const w = window.__arpg.game().world;
              return [w.zone.id, w.player.x, w.player.y, w.player.mode];
            }),
          )}`,
        );
      // (the crossing's jobs behind the play done)
      await page.waitForTimeout(1200);
      const rec = await page.evaluate(() => {
        const s = window.__seam;
        const c = s.cross[s.cross.length - 1];
        // the longest frame within 0.5 s of the crossing
        const fr = s.frames;
        let worst = 0;
        for (let i = 1; i < fr.length; i++) if (Math.abs(fr[i] - c.at) < 500) worst = Math.max(worst, fr[i] - fr[i - 1]);
        // the walk's frames away from the crossing: median and 95th percentile, the yardstick of a hitch
        const away = [];
        for (let i = 1; i < fr.length; i++) if (Math.abs(fr[i] - c.at) >= 800) away.push(fr[i] - fr[i - 1]);
        away.sort((a, b) => a - b);
        const med = away[Math.floor(away.length / 2)] ?? 0;
        const p95 = away[Math.floor(away.length * 0.95)] ?? 0;
        // the longest of each part within 0.5 s of the crossing
        const parts = {};
        for (const [tag, t, d] of s.cost) if (Math.abs(t - c.at) < 500) parts[tag] = Math.max(parts[tag] ?? 0, Math.round(d));
        return { ...c, worst, med, p95, parts: { ...parts, ...window.__arpg.renderer().swapParts }, loading: s.loading, swaps: window.__arpg.app.seamSwaps };
      });
      const row = {
        prepWorst,
        prepMs: await page.evaluate(() => Math.round(window.__arpg.app.seamPrepMs)),
        parts: rec.parts,
        leg: `${from}>${to}`,
        sec: r.res?.sec ?? -1,
        ms: rec.ms,
        worst: Math.round(rec.worst),
        med: Math.round(rec.med),
        p95: Math.round(rec.p95),
        kept: rec.swaps > swaps0,
        black: r.shot?.black ?? -1,
        mirrors: r.shot?.mirrors ?? -1,
        dots: r.shot?.dots ?? -1,
        before: rec.before,
        gone: rec.gone ?? [],
        came: rec.came ?? [],
        jumped: rec.jumped ?? [],
      };
      rows.push(row);
      const pops = row.gone.length + row.came.length + row.jumped.length;
      check(
        r.res?.zone === to && row.kept && rec.loading === loading0,
        `${tag}: ${from} -> ${to} walked through, the scene kept`,
        `${row.sec.toFixed(1)} s, kept ${row.ms.toFixed(0)} ms, worst frame ${row.worst} ms (walk: median ${row.med}, p95 ${row.p95}) ${JSON.stringify(row.parts)}${row.prepWorst >= 0 ? `; while the neighbour was prepared in idle time: worst frame ${row.prepWorst} ms, longest slice ${row.prepMs} ms` : ''}`,
      );
      check(
        row.black >= 0 && row.black < 0.005 && row.mirrors >= prep.nb && row.dots > 0,
        `${tag}: ${from} -> ${to} before the crossing: the neighbour drawn and alive`,
        `black ${(row.black * 100).toFixed(2)} %, ${row.mirrors} of its monsters shown (${prep.nb} set), minimap ${row.dots} dots beyond`,
      );
      check(
        pops === 0,
        `${tag}: ${from} -> ${to} no monster popping at the crossing`,
        `${row.before} on screen; gone ${JSON.stringify(row.gone)}, came ${JSON.stringify(row.came)}, jumped ${JSON.stringify(row.jumped)}`,
      );
      await release();
      if (r.res?.zone !== to) break;
    }
    console.log(`  ${tag}: kept / worst frame at the crossing (ms): ${rows.map((x) => `${x.leg} ${x.ms.toFixed(0)}/${x.worst}`).join(', ')}`);
  }
  const fin = await page.evaluate(() => ({ prep: window.__arpg.app.seamPrepMs, ...window.__seam }));
  console.log(`  ${tag}: zones ${fin.zones.join(' > ')}; longest idle preparation ${fin.prep.toFixed(0)} ms`);
  if (process.env.E2E_WHY)
    for (const c of fin.cross)
      console.log(
        `    cross ${c.from} > ${c.to} hero ${JSON.stringify(c.hero)} gone ${JSON.stringify(c.gone)}\n      after ${JSON.stringify((c.trail ?? []).filter((a, i, l) => i === 0 || JSON.stringify(a.slice(3)) !== JSON.stringify(l[i - 1].slice(3)) || a[0] !== l[i - 1][0]))}`,
      );
  check(!errs.length, `${tag}: no page error`, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

for (const m of MODES) await play(m);
await browser.close();
console.log(fails ? `${fails} check(s) failed` : 'all checks passed', `[${((Date.now() - t00) / 1000).toFixed(0)} s]`);
process.exit(fails ? 1 : 0);
