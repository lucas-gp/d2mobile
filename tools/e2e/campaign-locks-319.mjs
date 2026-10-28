/**
 * Lot 319 (audit of the Campaign against Diablo II, lots D and F): a character of the base (d2, pd2) in the Campaign. Checked in the
 * running game (the app's own loop, renderer, HUD and panels):
 *  1. the waypoint of the Campaign: opened on its Campaign tab (lot 322: the Rush tab back beside it), only the acts open (Act I, then each act whose boss before is dead), no level asked (a
 *     waypoint touched at level 1 is a destination); Harrogath, the Rush's hub, keeps its Rush menu;
 *  2. the transporters: Warriv only talks before Andariel, then "Travel" takes the hero to Lut Gholein (not the waypoint menu); Meshif
 *     only talks before Duriel, then sails to Kurast; Meshif of Kurast and Warriv of Lut Gholein take him back;
 *  3. the quest locks on Diablo II's maps: each passage (Tristram, the palace, the Durance, the Worldstone Keep, Duriel's door) shut
 *     with its hint shown on screen, open once its quest is done; Tristram by the Tree of Inifuss, Akara and the key; lot 320: the
 *     Canyon of the Magi and Nihlathak's Temple by Diablo II's red portals (the Summoner's in the Arcane Sanctuary, Anya's in
 *     Harrogath): none before their quest, opened in front of the hero when it is done, leading on;
 *  4. Mephisto killed in the Durance: the red portal to the Pandemonium Fortress.
 * Screenshots in test-results/e2e/campaign-locks-319.
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort      (D2 maps and sheets: $D2_PRIVATE_DIR/out/game)
 *   node tools/e2e/campaign-locks-319.mjs [--modes=d2,pd2] [--touch] [--url=…]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { kindOf, openKind, pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const MODES = (args.get('modes') ?? 'd2,pd2').split(',');
const TOUCH = args.has('touch');
const SHOTS = join(process.cwd(), 'test-results', 'e2e', 'campaign-locks-319');
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
  await page.fill('.d2input', 'Custos');
  await page.click('.d2b.ok');
  /** the zone `id` shown (no loading screen, the app's view on it); on a timeout, what the game and the screen are doing */
  const shown = (id, timeout = Number(args.get('wait') ?? 400000)) =>
    page
      .waitForFunction(
        (z) => {
          const a = window.__arpg;
          const w = a?.game?.()?.world;
          if (!w || document.querySelector('.loading') || document.querySelector('.charselect')) return false;
          // a tomb's map is the "tombs" zone: its run's id
          return !z || w.zone.id === z || (a.game().mode === 'run' && a.game().runDef?.id === z);
        },
        id,
        { timeout },
      )
      .catch(async (e) => {
        const why = await page.evaluate(() => {
          const a = window.__arpg;
          const gm = a.game();
          return {
            zone: gm.world.zone.id,
            mode: gm.mode,
            paused: a.app.paused,
            panel: a.app.panels.open ? a.app.panels.current : null,
            loading: document.querySelector('.loading')?.textContent ?? null,
            dialog: !!document.querySelector('.npc-dialog'),
            tick: gm.world.tick,
            events: gm.world.events.length,
          };
        });
        console.log(`waiting for ${id}: ${JSON.stringify(why)}`);
        throw e;
      });
  await page.waitForTimeout(2000);
  await shown(null);
  await page.waitForTimeout(2500);
  for (const b of await page.$$('.tip button, .hint button')) await b.click().catch(() => undefined);
  const g = (fn, a) => page.evaluate(fn, a);
  await g(() => {
    const gm = window.__arpg.game();
    gm.character.level = Math.max(gm.character.level, 30);
    gm.world.refreshPlayer();
  });
  const close = async () => {
    await g(() => window.__arpg.app.openPanel('close'));
    // a dialog left open (its "goodbye")
    await g(() => {
      for (const b of document.querySelectorAll('.npc-dialog .nd-back')) b.click();
    });
    await page.waitForFunction(() => !window.__arpg.app.paused && !document.querySelector('.npc-dialog'), null, { timeout: 5000 }).catch(() => undefined);
  };
  /** An NPC of the camp "touched" (the simulation's interaction, the app's dialog and its action); the screen free first */
  const talk = async (ref) => {
    await close();
    await g((r) => {
      const w = window.__arpg.game().world;
      const o = w.objects.find((x) => x.kind === 'npc' && x.ref === r);
      w.events.push({ t: 'interact', kind: 'npc', ref: r, objectId: o?.id ?? -1 });
    }, ref);
    // its dialog (quest lines, voices) or its panel at once
    await page.waitForFunction(() => !!document.querySelector('.npc-dialog') || window.__arpg.app.panels.open, null, { timeout: 5000 }).catch(() => undefined);
    const act = await page.$('.npc-dialog button.primary');
    if (act) await act.click().catch(() => undefined);
    await page.waitForTimeout(600);
  };

  const hud = () => g(() => [...document.querySelectorAll('.msg')].map((m) => m.textContent).join(' | '));
  const runDone = (id) =>
    g((q) => {
      const gm = window.__arpg.game();
      const goal = { cain: 'a1_tristram', andariel: 'a1_andariel', duriel: 'a2_tomb4', mephisto: 'a3_durance3', diablo: 'a4_chaos', ancients: 'a5_summit' }[q];
      if (goal) gm.character.progression.completions[`${goal}:0`] = 1;
      else gm.completeQuest(q, 0);
    }, id);
  const where = () => g(() => ({ zone: window.__arpg.game().world.zone.id, mode: window.__arpg.game().mode, run: window.__arpg.game().runDef?.id ?? null }));
  /** The waypoint menu: its tabs, whether a "Level N required" shows */
  const menu = () =>
    g(() => {
      const p = document.querySelector('#panels');
      return {
        tabs: [...p.querySelectorAll('.tabs .btn')].map((b) => b.textContent),
        sel: p.querySelector('.tabs .btn.sel')?.textContent ?? null,
        level: /Level \d+ required|Niveau \d+ requis/.test(p.textContent),
      };
    });

  // 1. the waypoint of the camp at level 1: on the Campaign, Act I only (lot 322: the Rush tab beside it)
  await g(() => {
    const gm = window.__arpg.game();
    gm.character.level = 1;
    gm.world.refreshPlayer();
  });
  await g(() => window.__arpg.app.openPanel('waypoint'));
  await page.waitForTimeout(600);
  let m = await menu();
  check(
    m.tabs.some((t) => /Rush/.test(t)) && /Campaign|Campagne/.test(m.sel ?? ''),
    `${mode}: the camp's waypoint on its Campaign tab, the Rush tab beside it (lot 322)`,
    `${m.tabs.join(' | ')} [${m.sel}]`,
  );
  check(m.tabs.some((t) => /Act I\b|Acte I\b/.test(t)) && !m.tabs.some((t) => /Act II|Acte II/.test(t)), `${mode}: Act I only before Andariel`, m.tabs.join(' | '));
  await page.screenshot({ path: join(SHOTS, `${mode}-1-camp-waypoint.png`) });
  await close();
  // the Cold Plains' waypoint touched at level 1: a destination
  await g(() => {
    const gm = window.__arpg.game();
    gm.character.progression.milestones['wp:a1_coldplains'] = 1;
  });
  await g(() => window.__arpg.app.openPanel('waypoint'));
  await page.waitForTimeout(600);
  m = await menu();
  const cold = await g(() => {
    const cards = [...document.querySelectorAll('#panels .runcard')].filter((e) => e.querySelector('.diffs button'));
    const b = cards[1]?.querySelector('.diffs button');
    return b ? !b.disabled : null;
  });
  check(cold === true && !m.level, `${mode}: the Cold Plains a destination at level 1, no level asked`, `${cold} ${m.level}`);
  await close();
  await g(() => {
    const gm = window.__arpg.game();
    gm.character.level = 30;
    gm.world.refreshPlayer();
  });

  // 2. Warriv before and after Andariel
  await talk('warriv');
  let at = await where();
  const panel = await g(() => (window.__arpg.app.panels.open ? window.__arpg.app.panels.current : null));
  check(at.zone === 'a1_town' && panel !== 'waypoint', `${mode}: Warriv only talks before Andariel (no menu, no travel)`, `${at.zone} ${panel}`);
  await page.screenshot({ path: join(SHOTS, `${mode}-2-warriv-shut.png`) });
  await close();
  await runDone('andariel');
  await g(() => window.__arpg.loadCampaign('a2'));
  await talk('warriv');
  await shown('a2_town');
  at = await where();
  check(at.zone === 'a2_town' && at.mode === 'town', `${mode}: Warriv takes the hero to Lut Gholein once Andariel is dead`, JSON.stringify(at));
  await page.waitForTimeout(1000);
  await g(() => window.__arpg.app.openPanel('waypoint'));
  await page.waitForTimeout(600);
  m = await menu();
  check(
    m.tabs.some((t) => /Rush/.test(t)) && m.tabs.some((t) => /Act II|Acte II/.test(t)) && !m.tabs.some((t) => /Act III|Acte III/.test(t)),
    `${mode}: Lut Gholein's waypoint: Acts I and II, the Rush tab (lot 322)`,
    m.tabs.join(' | '),
  );
  await page.screenshot({ path: join(SHOTS, `${mode}-3-lut-waypoint.png`) });
  await close();
  await talk('meshif');
  at = await where();
  check(at.zone === 'a2_town', `${mode}: Meshif only talks before Duriel`, at.zone);
  await close();
  await runDone('duriel');
  await g(() => window.__arpg.loadCampaign('a3'));
  await talk('meshif');
  await shown('a3_town');
  at = await where();
  check(at.zone === 'a3_town', `${mode}: Meshif sails to Kurast once Duriel is dead`, at.zone);
  await page.waitForTimeout(1000);
  await talk('meshif3');
  await shown('a2_town');
  check((await where()).zone === 'a2_town', `${mode}: Meshif of Kurast takes the hero back to Lut Gholein`);
  await page.waitForTimeout(800);
  await talk('warriv2');
  await shown('a1_town');
  check((await where()).zone === 'a1_town', `${mode}: Warriv of Lut Gholein takes the hero back to the camp`);
  await close();

  // 3. the quest locks on Diablo II's maps
  const LOCKS = [
    ['cairn', 'a1', 'a1_stonyfield', 'a1_tristram', 'cain', /Cairn/],
    ['palace', 'a2', 'a2_town', 'a2_harem1', 'tainted', /palace/i],
    ['canyon', 'a2', 'a2_arcane', 'a2_canyon', 'summoner', /Horazon/],
    ['durance', 'a3', 'a3_travincal', 'a3_durance1', 'khalim', /Durance/],
    ['temple', 'a5', 'harrogath', 'a5_temple', 'anya', /Anya/],
    ['keep', 'a5', 'a5_summit', 'a5_keep1', 'ancients', /Worldstone|Pierre-Monde/],
  ];
  for (const [id, act, from, to, quest, hint] of LOCKS) {
    await g((a) => window.__arpg.loadCampaign(a), act);
    if (from.endsWith('_town') || from === 'harrogath') await g((a) => window.__arpg.game().enterTown(a), `act${act.slice(1)}`);
    else await g((z) => window.__arpg.game().startRun(z, 0), from);
    await shown(from);
    await page.waitForTimeout(1200);
    const touch = () =>
      g((z) => {
        const w = window.__arpg.game().world;
        const o = w.objects.find((x) => x.kind === 'portal' && x.ref === `zone:${z}`);
        if (o) w.events.push({ t: 'interact', kind: 'portal', ref: o.ref, objectId: o.id });
        return !!o;
      }, to);
    // lot 320: Diablo II's red portal of a quest (the Summoner's, Anya's): not there before it, opened in front of the hero when it is done
    if (id === 'canyon' || id === 'temple') {
      const before = await g((z) => window.__arpg.game().world.objects.some((x) => x.kind === 'portal' && x.ref === `zone:${z}`), to);
      check(!before, `${mode}: ${id}: no portal to ${to} in ${from} before ${quest}`);
      await runDone(quest);
      await page
        .waitForFunction((z) => window.__arpg.game().world.objects.some((x) => x.kind === 'portal' && x.ref === `zone:${z}` && x.variant === 'red'), to, { timeout: 10000 })
        .catch(() => undefined);
      await page.waitForTimeout(500);
      const said = await hud();
      const red = await g((z) => window.__arpg.game().world.objects.find((x) => x.kind === 'portal' && x.ref === `zone:${z}`)?.variant ?? null, to);
      check(red === 'red' && hint.test(said), `${mode}: ${id}: ${quest} done, the red portal to ${to} opens in ${from}`, `${red} « ${said} »`);
      await page.screenshot({ path: join(SHOTS, `${mode}-4-${id}-portal.png`) });
      await touch();
      await shown(to);
      at = await where();
      check(at.run === to, `${mode}: ${id}: the portal leads to ${to}`, JSON.stringify(at));
      await page.waitForTimeout(800);
      continue;
    }
    const found = await touch();
    await page.waitForTimeout(700);
    at = await where();
    const said = await hud();
    check(found && (at.run ?? at.zone) === from && hint.test(said), `${mode}: ${id}: ${from} → ${to} shut, its hint on screen`, `${found} ${at.run ?? at.zone} « ${said} »`);
    await page.screenshot({ path: join(SHOTS, `${mode}-4-${id}-shut.png`) });
    if (id === 'cairn') {
      // the Tree of Inifuss, Akara, the key
      await g(() => window.__arpg.game().startRun('a1_darkwood', 0));
      await shown('a1_darkwood');
      await page.waitForTimeout(1000);
      const tree = await g(() => {
        const gm = window.__arpg.game();
        const w = gm.world;
        const o = w.objects.find((x) => x.kind === 'quest' && x.ref === 'q_inifuss');
        if (o) w.events.push({ t: 'interact', kind: 'quest', ref: o.ref, objectId: o.id });
        return o ? o.label : null;
      });
      await page.waitForTimeout(500);
      const scroll = await g(() => window.__arpg.game().character.materials.inifuss_scroll ?? 0);
      check(!!tree && scroll === 1, `${mode}: the Tree of Inifuss in the Dark Wood gives the scroll`, `${tree} ${scroll}`);
      await g(() => window.__arpg.game().enterTown('act1'));
      await shown('a1_town');
      await page.waitForTimeout(800);
      await talk('akara');
      const key = await g(() => window.__arpg.game().character.materials.cairn_key ?? 0);
      check(key === 1, `${mode}: Akara deciphers it into the key`, `${key}`);
      await close();
      await g(() => window.__arpg.game().startRun('a1_stonyfield', 0));
      await shown('a1_stonyfield');
      await page.waitForTimeout(1000);
    } else await runDone(quest);
    await touch();
    await shown(to);
    at = await where();
    check(at.run === to, `${mode}: ${id}: open once ${id === 'cairn' ? 'the key is used' : `${quest} is done`}`, JSON.stringify(at));
    await page.waitForTimeout(800);
  }
  // Duriel's door
  await g(() => window.__arpg.loadCampaign('a2'));
  await g(() => window.__arpg.game().startRun('a2_tomb4', 0));
  await shown('a2_tomb4');
  await page.waitForTimeout(1200);
  const door = () =>
    g(() => {
      const w = window.__arpg.game().world;
      const o = w.objects.find((x) => x.kind === 'portal' && x.ref === 'chamber');
      if (o) w.events.push({ t: 'interact', kind: 'portal', ref: 'chamber', objectId: o.id });
      return o ? w.zone.id : null;
    });
  const tombZone = await door();
  await page.waitForTimeout(700);
  const said = await hud();
  const still = await g((z) => window.__arpg.game().world.zone.id === z, tombZone);
  check(!!tombZone && still && /Horadric|horadrique/.test(said), `${mode}: Duriel's door sealed without the Horadric Staff`, `« ${said} »`);
  await page.screenshot({ path: join(SHOTS, `${mode}-5-duriel-door.png`) });
  await g(() => window.__arpg.game().completeQuest('staff', 0));
  await door();
  await page.waitForFunction((z) => window.__arpg.game().world.zone.id !== z && !document.querySelector('.loading'), tombZone, { timeout: 400000 });
  check(true, `${mode}: Duriel's door open with the Staff in the orifice`);

  // 4. Mephisto's red portal
  await g(() => window.__arpg.loadCampaign('a3'));
  await g(() => window.__arpg.loadCampaign('a4'));
  await g(() => window.__arpg.game().startRun('a3_durance3', 0));
  await shown('a3_durance3');
  await page.waitForTimeout(1500);
  const red = await g(() => {
    const w = window.__arpg.game().world;
    w.pendingSpawns.splice(0).forEach((ps) => w.spawnGroup(ps.idx));
    const meph = w.monsters.find((x) => x.def.id === 'mephisto');
    if (meph) w.killMonster(meph, w.player);
    return !!meph;
  });
  await page.waitForFunction(() => window.__arpg.game().world.objects.some((o) => o.kind === 'portal' && o.ref === 'act:act4'), null, { timeout: 10000 }).catch(() => undefined);
  const portals = await g(() =>
    window.__arpg
      .game()
      .world.objects.filter((o) => o.kind === 'portal' && (o.ref === 'town' || o.ref === 'act:act4'))
      .map((o) => `${o.ref}:${o.variant ?? ''}`),
  );
  check(red && portals.length === 1 && portals[0] === 'act:act4:red', `${mode}: Mephisto dead: the red portal to the Fortress, no portal home`, portals.join(','));
  await page.screenshot({ path: join(SHOTS, `${mode}-6-mephisto-red-portal.png`) });
  await g(() => {
    const w = window.__arpg.game().world;
    const o = w.objects.find((x) => x.kind === 'portal' && x.ref === 'act:act4');
    if (o) w.events.push({ t: 'interact', kind: 'portal', ref: o.ref, objectId: o.id });
  });
  await shown('a4_fortress');
  check((await where()).zone === 'a4_fortress', `${mode}: the red portal leads to the Pandemonium Fortress`);
  await page.waitForTimeout(1000);

  // Harrogath (the Rush's hub): its Rush menu
  await g(() => window.__arpg.game().enterTown('act5'));
  await shown('harrogath');
  await page.waitForTimeout(1000);
  await g(() => window.__arpg.app.openPanel('waypoint'));
  await page.waitForTimeout(600);
  m = await menu();
  check(
    m.tabs.some((t) => /Rush/.test(t)),
    `${mode}: Harrogath keeps its Rush tab`,
    m.tabs.join(' | '),
  );
  await page.screenshot({ path: join(SHOTS, `${mode}-7-harrogath-waypoint.png`) });
  await close();

  check(!errs.length, `${mode}: no page error`, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

for (const m of MODES) await play(m);
await browser.close();
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
