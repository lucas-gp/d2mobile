/**
 * Lot 321 (audit of the Campaign against Diablo II, lots I and J): a character of the base (d2, pd2) in the Campaign.
 * Checked in the running game (the app's own loop, dialogs, panels and HUD):
 *  1. the camp's traders, each by his dialog's action: Charsi's stall (her wares only, repair, no gambling, no key), Gheed's (gambling,
 *     keys, no repair), Akara's (staves, wands, her Minor potions at Diablo II's price, the Tome, no repair) — a heal by Akara;
 *  2. Kashya hires the Rogues only;
 *  3. the Blood Moor's automap: no monster marked, only waypoints, exits, portals, shrines and NPCs seen; the explored cells grow when the
 *     hero walks; the big map over the field, transparent, letting touches through;
 *  4. Harrogath: Anya gambles (and keeps her maps), Qual-Kehk hires the Barbarians and the mercenaries of the acts not open yet.
 * Screenshots in test-results/e2e/campaign-npcs-321.
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort      (D2 maps and sheets: $D2_PRIVATE_DIR/out/game)
 *   node tools/e2e/campaign-npcs-321.mjs [--modes=d2,pd2] [--touch] [--url=…]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { kindOf, openKind, pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const MODES = (args.get('modes') ?? 'd2,pd2').split(',');
const TOUCH = args.has('touch');
const SHOTS = join(process.cwd(), 'test-results', 'e2e', 'campaign-npcs-321');
mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const VIEW = TOUCH ? { width: 915, height: 412 } : { width: 900, height: 600 };

/** Diablo II's vendor table, as src/data/vendors.ts (the types the stall may hold, class items included) */
const WARES = {
  charsi: ['axe', 'sword', 'dagger', 'thrown', 'javelin', 'spear', 'polearm', 'bow', 'claw', 'helm', 'armor', 'shield', 'gloves', 'boots', 'belt', 'pelt', 'primal'],
  gheed: ['axe', 'mace', 'sword', 'dagger', 'thrown', 'javelin', 'spear', 'polearm', 'bow', 'claw', 'gloves', 'boots', 'belt'],
  akara: ['wand', 'scepter', 'staff', 'orb', 'head'],
};

async function play(mode) {
  const ctx = await browser.newContext(TOUCH ? { viewport: VIEW, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: VIEW });
  await ctx.addInitScript((m) => {
    if (!sessionStorage.getItem('e2e.init')) {
      localStorage.clear();
      localStorage.setItem('d2m.testchar.v1', '1');
      localStorage.setItem('d2m.mode', m);
      localStorage.setItem('d2m.lang', 'fr');
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
  await page.fill('.d2input', 'Mercator');
  await page.click('.d2b.ok');
  const shown = (id, timeout = Number(args.get('wait') ?? 400000)) =>
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
  const g = (fn, a) => page.evaluate(fn, a);
  await g(() => {
    const gm = window.__arpg.game();
    gm.character.level = Math.max(gm.character.level, 30);
    gm.character.gold = 1e6;
    gm.world.refreshPlayer();
  });
  const close = async () => {
    await g(() => window.__arpg.app.openPanel('close'));
    await g(() => {
      for (const b of document.querySelectorAll('.npc-dialog .nd-back')) b.click();
    });
    await page.waitForFunction(() => !window.__arpg.app.paused && !document.querySelector('.npc-dialog'), null, { timeout: 5000 }).catch(() => undefined);
  };
  /** An NPC touched (the simulation's interaction), then its dialog's action `label` (the main one by default) or its panel at once */
  const talk = async (ref, label) => {
    await close();
    await g((r) => {
      const w = window.__arpg.game().world;
      const o = w.objects.find((x) => x.kind === 'npc' && x.ref === r);
      w.events.push({ t: 'interact', kind: 'npc', ref: r, objectId: o?.id ?? -1 });
    }, ref);
    await page.waitForFunction(() => !!document.querySelector('.npc-dialog') || window.__arpg.app.panels.open, null, { timeout: 5000 }).catch(() => undefined);
    const buttons = await page.$$('.npc-dialog .nd-btn');
    let hit = null;
    for (const b of buttons) {
      const t = (await b.textContent())?.trim();
      if (label ? t === label : await b.evaluate((x) => x.classList.contains('primary'))) hit = b;
    }
    if (hit) await hit.click().catch(() => undefined);
    await page.waitForTimeout(600);
  };
  const panelText = () => g(() => document.querySelector('#panels .panel')?.textContent ?? '');
  const stall = () =>
    g(() => {
      const a = window.__arpg;
      const gm = a.game();
      return { npc: gm.vendorNpc, types: gm.vendor.map((v) => a.baseType(v.item.base)), n: gm.vendor.length, quals: gm.vendor.map((v) => v.item.quality) };
    });

  // 1. the camp's traders
  const town = await g(() => window.__arpg.game().world.zone.id);
  check(town === 'a1_town', `${mode}: the Rogue Encampment`, town);
  for (const npc of ['charsi', 'gheed', 'akara']) {
    if (npc === 'akara') await g(() => (window.__arpg.game().world.player.hp = 1));
    await talk(npc);
    const s = await stall();
    const txt = await panelText();
    check(s.npc === npc, `${mode}: ${npc}'s dialog opens her or his own stall`, `${s.npc}`);
    check(txt.includes(npc[0].toUpperCase() + npc.slice(1)), `${mode}: the stall is titled with ${npc}'s name`);
    check(
      s.quals.every((q) => q === 'normal' || q === 'magic'),
      `${mode}: ${npc} sells no rare item`,
      [...new Set(s.quals)].join(','),
    );
    const bad = s.types.filter((t) => !WARES[npc].includes(t));
    check(bad.length === 0, `${mode}: ${npc}'s stall holds only her or his wares`, bad.join(','));
    const repair = /Réparer l'équipement|Équipement intact/.test(txt);
    const gamble = txt.includes('Jeu d’argent');
    const key = txt.includes('Clé (50 or)');
    if (npc === 'charsi') check(repair && !gamble && !key && s.n > 0, `${mode}: Charsi repairs, sells equipment, no gambling nor key`);
    if (npc === 'gheed') check(gamble && key && !repair, `${mode}: Gheed gambles and sells keys, does not repair`);
    if (npc === 'akara') {
      check(txt.includes('Potion de soins mineure ×4 (120 or)') && txt.includes('Tome de portail') && !repair && !gamble, `${mode}: Akara sells her Minor potions at Diablo II's price and the Tome`);
      const hp = await g(() => window.__arpg.game().world.player);
      check(hp.hp === hp.hpMax, `${mode}: Akara heals`, `${Math.round(hp.hp)} / ${Math.round(hp.hpMax)}`);
    }
    await page.screenshot({ path: join(SHOTS, `${mode}-1-${npc}.png`) });
  }

  // 2. Kashya hires the Rogues only
  await talk('kashya');
  const cards = await g(() => [...document.querySelectorAll('#panels .panel .runcard h3')].map((h) => h.textContent));
  const rogue = await g(
    () =>
      window.__arpg
        .game()
        .mercOffers()
        .find((o) => o.type.act === 1)?.type.title,
  );
  check(cards.length === 1 && cards[0] === rogue, `${mode}: Kashya hires the Rogues only`, cards.join(' | '));
  await page.screenshot({ path: join(SHOTS, `${mode}-2-kashya.png`) });
  await close();

  // 3. the Blood Moor's automap
  await g(() => window.__arpg.game().startRun('a1_bloodmoor', 0));
  await shown('a1_bloodmoor');
  await page.waitForTimeout(2000);
  const at = await g(() => {
    const w = window.__arpg.game().world;
    w.pendingSpawns.splice(0).forEach((ps) => w.spawnGroup(ps.idx));
    return { x: w.player.x, y: w.player.y, near: w.monsters.filter((m) => !m.pet && !m.dead && Math.hypot(m.x - w.player.x, m.y - w.player.y) < 30).length };
  });
  await page.waitForTimeout(1200);
  const m1 = await g(() => ({ ...window.__arpg.app.hud.minimapMarks }));
  check(m1.monsters === 0, `${mode}: no monster on the automap`, `${at.near} monsters within 30 units, ${m1.monsters} marked`);
  check(m1.explored > 0, `${mode}: the cells around the hero explored`, `${m1.explored}`);
  const hidden = await g(() => {
    const w = window.__arpg.game().world;
    return w.objects.filter((o) => ['chest', 'barrel', 'sarcophagus', 'weaponrack'].includes(o.kind)).length;
  });
  const shownObjs = await g(() => {
    const w = window.__arpg.game().world;
    return w.objects.filter((o) => ['waypoint', 'portal', 'shrine', 'npc', 'stash'].includes(o.kind)).length;
  });
  check(m1.objects <= shownObjs, `${mode}: only waypoints, exits, portals, shrines and NPCs marked (${hidden} chests and barrels in the zone)`, `${m1.objects} ≤ ${shownObjs}`);
  // the hero walks (teleported 25 units away, a free spot): more cells explored
  await g(() => {
    const a = window.__arpg;
    const w = a.game().world;
    const p = w.grid.nearestFree(w.player.x + 25, w.player.y + 10, 12) ?? w.grid.nearestFree(w.player.x - 25, w.player.y - 10, 12);
    if (p) a.teleport(p.x, p.y);
  });
  await page.waitForTimeout(1500);
  const m2 = await g(() => ({ ...window.__arpg.app.hud.minimapMarks }));
  check(m2.explored > m1.explored, `${mode}: walking explores more of the zone`, `${m1.explored} → ${m2.explored}`);
  // the big map: over the field, transparent, letting touches through
  if (TOUCH) {
    const r = await g(() => document.querySelector('#hud .minimap').getBoundingClientRect().toJSON());
    await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
  } else await g(() => document.querySelector('#hud .minimap').click());
  await page.waitForTimeout(500);
  const big = await g(() => {
    const c = document.querySelector('#hud .minimap-big');
    const st = getComputedStyle(c);
    return { open: window.__arpg.app.hud.bigMapOpen, display: st.display, pe: st.pointerEvents, bg: st.backgroundColor, border: st.borderTopWidth };
  });
  check(
    big.open && big.display === 'block' && big.pe === 'none' && /rgba\(0, 0, 0, 0\)|transparent/.test(big.bg) && big.border === '0px',
    `${mode}: the big map lies over the field, transparent, touches through`,
    JSON.stringify(big),
  );
  await page.screenshot({ path: join(SHOTS, `${mode}-3-automap.png`) });
  if (TOUCH) {
    const r = await g(() => document.querySelector('#hud .minimap').getBoundingClientRect().toJSON());
    await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
  } else await g(() => document.querySelector('#hud .minimap').click());
  await page.waitForTimeout(300);
  check(!(await g(() => window.__arpg.app.hud.bigMapOpen)), `${mode}: the corner map closes it`);

  // 4. Harrogath: Anya gambles, Qual-Kehk hires the Barbarians (and the acts not open yet)
  await g(() => window.__arpg.game().enterTown('act5'));
  await shown('harrogath');
  await page.waitForTimeout(1500);
  await talk('anya');
  const anya = await panelText();
  check((await stall()).npc === 'anya' && anya.includes('Jeu d’argent') && anya.includes('Anya'), `${mode}: Anya gambles`);
  await page.screenshot({ path: join(SHOTS, `${mode}-4-anya.png`) });
  await talk('qual_kehk');
  const q = await g(() => [...document.querySelectorAll('#panels .panel .runcard h3')].map((h) => h.textContent));
  const barb = await g(
    () =>
      window.__arpg
        .game()
        .mercOffers()
        .find((o) => o.type.act === 5)?.type.title,
  );
  check(q.includes(barb) && q.length >= 2, `${mode}: Qual-Kehk hires the Barbarians and the mercenaries of the acts not open yet`, q.join(' | '));
  await page.screenshot({ path: join(SHOTS, `${mode}-5-qual-kehk.png`) });
  await close();
  check(!errs.length, `${mode}: no page error`, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

for (const m of MODES) await play(m);
await browser.close();
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
