/**
 * Lot 320 (audit of the Campaign against Diablo II, lots E and G, points 3.12 and 3.14): a character of the base (d2, pd2) walks the
 * Campaign's ways as Diablo II has them, in the running game (the app's own loop, renderer, HUD and panels):
 *  1. Act I: the Stony Field has no seam toward the Dark Wood; its cave leads into the Underground Passage, whose far end goes up into
 *     the Dark Wood (the hero at the cave's mouth there); the Burial Grounds walked into from the Cold Plains (no loading screen);
 *  2. Act II: the Valley of Snakes has no way to the Canyon; the Summoner killed, his red portal opens in the Arcane Sanctuary (the HUD
 *     says so) and leads to the Canyon of the Magi, which has no way back to the Valley;
 *  3. Act III: the Spider Forest's two caves, the Swampy Pit in the Flayer Jungle; Kurast walked north from Lower Kurast to Travincal
 *     through the Bazaar, Upper Kurast and the Causeway (no loading screen);
 *  4. Act IV: the Fortress's gate to the Outer Steppes, the Plains of Despair and the City of the Damned walked; the City's stairs down to
 *     the River of Flame; the River's bridge walked into the Chaos Sanctuary;
 *  5. Act V: the Arreat Plateau has no way to the Frozen Tundra; its cave → the Crystalline Passage (the Frozen River below it) → the
 *     Glacial Trail (the Drifter Cavern below) → up onto the Frozen Tundra → the Ancients' Way → up onto the Arreat Summit; Anya's red
 *     portal in Harrogath once she is freed, to Nihlathak's Temple, and its red portal back;
 *  6. 3.12: an act walked in Normal not listed in Nightmare's waypoint before its boss dies there; 3.14: the camp's waypoint tip without
 *     the Rush's words.
 * Screenshots in test-results/e2e/campaign-topology-320.
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort      (D2 maps and sheets: $D2_PRIVATE_DIR/out/game)
 *   node tools/e2e/campaign-topology-320.mjs [--modes=d2,pd2] [--touch] [--url=…]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { kindOf, openKind, pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const MODES = (args.get('modes') ?? 'd2,pd2').split(',');
const TOUCH = args.has('touch');
const SHOTS = join(process.cwd(), 'test-results', 'e2e', 'campaign-topology-320');
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const VIEW = TOUCH ? { width: 915, height: 412 } : { width: 900, height: 600 };

async function play(mode) {
  const ctx = await browser.newContext(TOUCH ? { viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: VIEW });
  await ctx.addInitScript((m) => {
    if (!sessionStorage.getItem('e2e.init')) {
      localStorage.clear();
      localStorage.setItem('d2m.testchar.v1', '1');
      localStorage.setItem('d2m.mode', m);
      localStorage.setItem('d2m.lang', 'en');
      sessionStorage.setItem('e2e.init', '1');
    }
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // loading screens seen (a crossing at a seam has none)
    window.__loads = 0;
    new MutationObserver(() => {
      const on = !!document.querySelector('.loading');
      if (on && !window.__loadOn) window.__loads++;
      window.__loadOn = on;
    }).observe(document, { childList: true, subtree: true });
  }, mode);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
  await page.goto(URL);
  await page.waitForSelector('.charselect', { timeout: 180000 });
  await page.waitForTimeout(1500);
  await openKind(page, kindOf(mode));
  const btn = await page.$(`[data-act="mode"][data-mode="${mode}"]`);
  if (btn) await btn.click();
  else await pickFirstMode(page);
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
  await page.fill('.d2input', 'Viator');
  await page.click('.d2b.ok');
  const g = (fn, a) => page.evaluate(fn, a);
  /** the zone (or the run standing for it) `id` shown, no loading screen */
  const shown = (id, timeout = 400000) =>
    page.waitForFunction(
      (z) => {
        const a = window.__arpg;
        const w = a?.game?.()?.world;
        if (!w || document.querySelector('.loading') || document.querySelector('.charselect')) return false;
        return !z || w.zone.id === z || (a.game().mode === 'run' && a.game().runDef?.id === z);
      },
      id,
      { timeout },
    );
  await page.waitForTimeout(2000);
  await shown(null);
  await page.waitForTimeout(2500);
  for (const b of await page.$$('.tip button, .hint button')) await b.click().catch(() => undefined);
  await g(() => {
    const gm = window.__arpg.game();
    gm.character.level = 40;
    gm.world.refreshPlayer();
    gm.settings.tips = false;
  });
  const where = () => g(() => ({ zone: window.__arpg.game().world.zone.id, run: window.__arpg.game().runDef?.id ?? null }));
  const hud = () => g(() => [...document.querySelectorAll('.msg')].map((m) => m.textContent).join(' | '));
  /** The zone's exits: "to:variant" */
  const exits = () =>
    g(() =>
      window.__arpg
        .game()
        .world.objects.filter((o) => o.kind === 'portal' && !o.mirror)
        .map((o) => `${o.ref}:${o.variant ?? ''}`),
    );
  const seamsTo = () => g(() => (window.__arpg.game().world.zone.seams ?? []).map((s) => s.to));
  const go = async (id) => {
    await g((z) => window.__arpg.game().startRun(z, 0), id);
    await shown(id);
    await page.waitForTimeout(1200);
    await g(() => window.__arpg.god(true));
  };
  /** The hero through the zone's exit toward `to` (the simulation's interaction, as touching it); `to` shown */
  const take = async (to) => {
    const ok = await g(
      (z) => {
        const w = window.__arpg.game().world;
        const o = w.objects.find((x) => x.kind === 'portal' && !x.mirror && x.ref === z);
        if (o) w.events.push({ t: 'interact', kind: 'portal', ref: o.ref, objectId: o.id });
        return !!o;
      },
      to.startsWith('zone:') || to === 'town' ? to : `zone:${to}`,
    );
    if (!ok) return false;
    await shown(to.startsWith('zone:') ? to.slice(5) : to === 'town' ? null : to);
    await page.waitForTimeout(1200);
    await g(() => window.__arpg.god(true));
    return true;
  };
  /** The hero's distance to his way back to `from` (the exit toward it in the zone he is in) */
  const byWayBack = (from) =>
    g((z) => {
      const w = window.__arpg.game().world;
      const o = w.objects.find((x) => x.kind === 'portal' && !x.mirror && x.ref === `zone:${z}`);
      return o ? Math.hypot(o.x - w.player.x, o.y - w.player.y) : -1;
    }, from);
  /** Walks across the seam toward `to` (a goal beyond the edge, as a click on the ground): the zone changes without a loading screen */
  const cross = async (to) => {
    const set = await g((z) => {
      const w = window.__arpg.game().world;
      const s = (w.zone.seams ?? []).find((x) => x.to === z);
      if (!s) return null;
      const mid = { x: (s.cross[0] + s.cross[2]) / 2, y: (s.cross[1] + s.cross[3]) / 2 };
      const n = s.side === 'N' ? [0, 1] : s.side === 'S' ? [0, -1] : s.side === 'W' ? [1, 0] : [-1, 0];
      const p = w.grid.nearestFree(mid.x + n[0] * 7, mid.y + n[1] * 7, 4) ?? mid;
      window.__arpg.teleport(p.x, p.y);
      window.__arpg.killAll();
      return { goal: { x: mid.x - n[0] * 5, y: mid.y - n[1] * 5 }, side: s.side };
    }, to);
    if (!set) return { ok: false, why: `no seam toward ${to}` };
    const loads0 = await g(() => window.__loads);
    const swaps0 = await g(() => window.__arpg.app.seamSwaps);
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      const st = await g(
        ({ z, goal }) => {
          const w = window.__arpg.game().world;
          if (w.zone.id === z) return 'in';
          if (!w.player.goal || Math.hypot(w.player.goal.x - goal.x, w.player.goal.y - goal.y) > 0.5) w.player.goal = { x: goal.x, y: goal.y, kind: 'move', ref: 0 };
          return w.zone.id;
        },
        { z: to, goal: set.goal },
      );
      if (st === 'in') break;
      await page.waitForTimeout(150);
    }
    await g(() => {
      window.__arpg.game().world.player.goal = null;
      window.__arpg.app.controls?.resetAll();
    });
    await page.waitForTimeout(1500);
    const now = await g(() => ({ zone: window.__arpg.game().world.zone.id, loads: window.__loads, swaps: window.__arpg.app.seamSwaps }));
    return { ok: now.zone === to && now.loads === loads0 && now.swaps > swaps0, why: `${now.zone}, ${now.loads - loads0} loading screen(s), ${now.swaps - swaps0} swap(s), ${set.side}` };
  };

  // 1. Act I
  await g(() => window.__arpg.loadCampaign('a1'));
  await go('a1_stonyfield');
  let s = await seamsTo();
  let x = await exits();
  check(!s.includes('a1_darkwood') && !x.some((e) => e.startsWith('zone:a1_darkwood')), `${mode}: the Stony Field has no way to the Dark Wood`, `${s} | ${x}`);
  check(x.includes('zone:a1_underpass1:stairs'), `${mode}: the Stony Field's cave into the Underground Passage`, x.join(', '));
  await take('a1_underpass1');
  let d = await byWayBack('a1_stonyfield');
  check(d >= 0 && d < 5, `${mode}: in the Underground Passage at its way up to the Stony Field`, `${d.toFixed(1)} units`);
  x = await exits();
  check(x.includes('zone:a1_darkwood:stairs') && x.includes('zone:a1_underpass2:stairs'), `${mode}: the passage's far end up to the Dark Wood, its level 2 below`, x.join(', '));
  await take('a1_darkwood');
  d = await byWayBack('a1_underpass1');
  check(d >= 0 && d < 5, `${mode}: the Dark Wood entered at the passage's mouth`, `${d.toFixed(1)} units`);
  await page.screenshot({ path: join(SHOTS, `${mode}-1-darkwood-from-passage.png`) });
  await go('a1_coldplains');
  let c = await cross('a1_burial');
  check(c.ok, `${mode}: the Burial Grounds walked into from the Cold Plains`, c.why);
  await page.screenshot({ path: join(SHOTS, `${mode}-1-burial-walked.png`) });

  // 2. Act II
  await g(() => window.__arpg.loadCampaign('a2'));
  await go('a2_valley');
  x = await exits();
  check(!x.some((e) => e.startsWith('zone:a2_canyon')), `${mode}: the Valley of Snakes has no way to the Canyon`, x.join(', '));
  await go('a2_arcane');
  x = await exits();
  check(!x.some((e) => e.startsWith('zone:a2_canyon')), `${mode}: no portal to the Canyon before the Summoner dies`);
  await g(() => {
    const w = window.__arpg.game().world;
    w.pendingSpawns.splice(0).forEach((ps) => w.spawnGroup(ps.idx));
    const m = w.monsters.find((q) => q.def.id === 'summoner');
    if (m) {
      window.__arpg.teleport(m.x + 4, m.y + 4);
      w.killMonster(m, w.player);
    }
  });
  await page.waitForFunction(() => window.__arpg.game().world.objects.some((o) => o.kind === 'portal' && o.ref === 'zone:a2_canyon'), null, { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  x = await exits();
  const said = await hud();
  check(x.includes('zone:a2_canyon:red') && /Horazon/.test(said), `${mode}: the Summoner dead, his red portal to the Canyon opens`, `${x.join(', ')} « ${said} »`);
  await page.screenshot({ path: join(SHOTS, `${mode}-2-summoner-portal.png`) });
  await take('a2_canyon');
  x = await exits();
  const wp = await g(() => window.__arpg.game().world.objects.some((o) => o.kind === 'waypoint'));
  check((await where()).run === 'a2_canyon' && !x.some((e) => e.startsWith('zone:a2_valley')) && wp, `${mode}: in the Canyon of the Magi, no way to the Valley, its waypoint there`, x.join(', '));

  // 3. Act III
  await g(() => window.__arpg.loadCampaign('a3'));
  await go('a3_spider');
  x = await exits();
  check(x.some((e) => e.startsWith('zone:a3_cave1')) && x.some((e) => e.startsWith('zone:a3_cave2')), `${mode}: the Spider Forest's two caves`, x.join(', '));
  await go('a3_marsh');
  x = await exits();
  check(!x.some((e) => e.startsWith('zone:a3_pit1')), `${mode}: no Swampy Pit in the Great Marsh`, x.join(', '));
  await go('a3_jungle');
  x = await exits();
  check(x.some((e) => e.startsWith('zone:a3_pit1')) && x.some((e) => e.startsWith('zone:a3_flayer1')), `${mode}: the Swampy Pit beside the Flayer Dungeon in the Flayer Jungle`, x.join(', '));
  await go('a3_lower');
  for (const to of ['a3_bazaar', 'a3_upper', 'a3_causeway', 'a3_travincal']) {
    c = await cross(to);
    check(c.ok, `${mode}: Kurast walked north into ${to}`, c.why);
    if (to === 'a3_upper') await page.screenshot({ path: join(SHOTS, `${mode}-3-upper-kurast-walked.png`) });
    if (!c.ok) break;
  }

  // 4. Act IV
  await g(() => window.__arpg.loadCampaign('a4'));
  await g(() => window.__arpg.game().enterTown('act4'));
  await shown('a4_fortress');
  await page.waitForTimeout(1500);
  await g(() => window.__arpg.god(true));
  for (const to of ['a4_steppes', 'a4_plains', 'a4_city']) {
    c = await cross(to);
    check(c.ok, `${mode}: Act IV walked into ${to}`, c.why);
    await page.screenshot({ path: join(SHOTS, `${mode}-4-${to}.png`) });
    if (!c.ok) break;
  }
  x = await exits();
  check(x.includes('zone:a4_river:stairs'), `${mode}: the City's stairs down to the River of Flame`, x.join(', '));
  await take('a4_river');
  d = await byWayBack('a4_city');
  check(d >= 0 && d < 5, `${mode}: the River entered at its way back up`, `${d.toFixed(1)} units`);
  c = await cross('a4_chaos');
  check(c.ok, `${mode}: the River's bridge walked into the Chaos Sanctuary`, c.why);
  await page.screenshot({ path: join(SHOTS, `${mode}-4-chaos-walked.png`) });

  // 5. Act V
  await g(() => window.__arpg.loadCampaign('a5'));
  await go('a5_plateau');
  x = await exits();
  check(
    !x.some((e) => e.startsWith('zone:a5_tundra')) && x.some((e) => e.startsWith('zone:a5_crystal1')),
    `${mode}: the Arreat Plateau: no way to the Tundra, the Crystalline Passage's cave`,
    x.join(', '),
  );
  const path = [
    ['a5_crystal1', ['zone:a5_river', 'zone:a5_crystal2']],
    ['a5_crystal2', ['zone:a5_echo', 'zone:a5_tundra']],
    ['a5_tundra', ['zone:a5_glacial1', 'zone:a5_crystal2']],
    ['a5_glacial1', ['zone:a5_glacial2', 'zone:a5_summit']],
    ['a5_summit', []],
  ];
  let ok5 = true;
  let prev = 'a5_plateau';
  for (const [to, want] of path) {
    if (!(await take(to))) {
      check(false, `${mode}: ${prev} → ${to}`, 'no exit');
      ok5 = false;
      break;
    }
    x = await exits();
    d = await byWayBack(prev);
    const has = want.every((w) => x.some((e) => e.startsWith(w)));
    check((await where()).run === to && has && d >= 0 && d < 5, `${mode}: ${prev} → ${to} (by its way back), its ways on`, `${x.join(', ')}; ${d.toFixed(1)} units`);
    if (to === 'a5_tundra') await page.screenshot({ path: join(SHOTS, `${mode}-5-tundra-from-glacial-trail.png`) });
    prev = to;
  }
  check(ok5, `${mode}: the way up under the mountain, the Plateau to the Arreat Summit`);
  await g(() => window.__arpg.game().enterTown('act5'));
  await shown('harrogath');
  await page.waitForTimeout(1500);
  x = await exits();
  check(!x.some((e) => e.startsWith('zone:a5_temple')), `${mode}: no portal to Nihlathak's Temple before Anya is freed`, x.join(', '));
  await g(() => window.__arpg.game().completeQuest('anya', 0));
  await page.waitForFunction(() => window.__arpg.game().world.objects.some((o) => o.kind === 'portal' && o.ref === 'zone:a5_temple'), null, { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  x = await exits();
  const said5 = await hud();
  check(x.includes('zone:a5_temple:red') && /Anya/.test(said5), `${mode}: Anya freed, her red portal in Harrogath`, `${x.join(', ')} « ${said5} »`);
  await page.screenshot({ path: join(SHOTS, `${mode}-5-anya-portal.png`) });
  await take('a5_temple');
  x = await exits();
  check((await where()).run === 'a5_temple' && x.includes('town:red'), `${mode}: in Nihlathak's Temple, its red portal back to Harrogath`, x.join(', '));
  await take('town');
  check((await where()).zone === 'harrogath', `${mode}: back in Harrogath`);

  // 6. 3.12: an act walked in Normal, in Nightmare; 3.14: the camp's waypoint tip
  await g(() => window.__arpg.game().enterTown('act1'));
  await shown('a1_town');
  await page.waitForTimeout(1200);
  await g(() => {
    const gm = window.__arpg.game();
    const p = gm.character.progression;
    p.completions['a1_andariel:0'] = 1;
    p.milestones['zone:a2_rocky'] = 5;
    p.milestones['wp:a2_dryhills'] = 6;
    p.highestDifficulty = 1;
    gm.difficulty = 1;
  });
  await g(() => window.__arpg.app.openPanel('waypoint'));
  await page.waitForTimeout(700);
  const tabs = await g(() => [...document.querySelectorAll('#panels .tabs .btn')].map((b) => b.textContent));
  check(tabs.some((t) => /Act I\b/.test(t)) && !tabs.some((t) => /Act II/.test(t)), `${mode}: Nightmare's waypoint: Act I only (Act II walked in Normal)`, tabs.join(' | '));
  await page.screenshot({ path: join(SHOTS, `${mode}-6-nightmare-waypoint.png`) });
  await g(() => window.__arpg.app.openPanel('close'));
  await g(() => {
    const gm = window.__arpg.game();
    gm.difficulty = 0;
    gm.settings.tips = true;
    gm.settings.tipsSeen = [];
    window.__arpg.app.tips.trigger(gm, 'waypoint');
  });
  await page.waitForFunction(() => !!document.querySelector('.tip-card'), null, { timeout: 10000 }).catch(() => undefined);
  const tip = await g(() => document.querySelector('.tip-card')?.textContent ?? '');
  check(!!tip && !/runs|Tristram/.test(tip), `${mode}: the camp's waypoint tip without the Rush's words`, tip);
  await page.screenshot({ path: join(SHOTS, `${mode}-6-camp-tip.png`) });

  check(!errs.length, `${mode}: no page error`, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

for (const m of MODES) await play(m);
await browser.close();
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
