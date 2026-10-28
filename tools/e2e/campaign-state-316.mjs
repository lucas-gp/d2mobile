/**
 * Lot 316 (audit of the Campaign against Diablo II: lots A, B, part of C): a character of the base (d2, pd2) in the Campaign.
 * Checked in the running game (the app's own loop, renderer and HUD):
 *  1. the stall: an NPC's "trade" opened again shows the same stall, an item bought is not back on it (act hopping: unit test);
 *  2. a potion bought at level 45: Greater (tier 3) in the belt, no longer Minor;
 *  3. the Cold Plains: monsters killed, life at half, down the cave and back: the same zone (its dead monsters dead), life and mana kept,
 *     the hero by the cave's entrance; into the camp: life kept, Akara heals;
 *  4. a death in the Cold Plains: the death screen names the camp, the gold lost (Diablo II's share), no item lost, the portal back to the
 *     zone as it was;
 *  5. (`--bosses`, default on) Act II's true tomb: its door to Duriel's Lair, Duriel killed, Act III open; Act V's Throne: its portal to the
 *     Worldstone Chamber, Baal killed, Nightmare open.
 * Screenshots in test-results/e2e/campaign-state-316.
 *   npx vite --host 127.0.0.1 --port 5233 --strictPort      (D2 maps and sheets: $D2_PRIVATE_DIR/out/game)
 *   node tools/e2e/campaign-state-316.mjs [--modes=d2,pd2] [--touch] [--bosses=0] [--url=…]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { kindOf, openKind, pickFirstMode } from './pick-mode.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const MODES = (args.get('modes') ?? 'd2,pd2').split(',');
const TOUCH = args.has('touch');
const BOSSES = args.get('bosses') !== '0';
const SHOTS = join(process.cwd(), 'test-results', 'e2e', 'campaign-state-316');
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

  // 1. the stall: stable across contacts, the item bought gone
  await talk('charsi');
  const st1 = await g(() => window.__arpg.game().vendor.map((v) => v.item.uid));
  const bought = await g(() => {
    const gm = window.__arpg.game();
    gm.character.gold = 1e7;
    const uid = gm.vendor[0]?.item.uid;
    return gm.buy(0).ok ? uid : null;
  });
  await close();
  // lot 321: Akara has her own stall; Charsi's comes back as it was
  await talk('akara');
  await talk('charsi');
  const st2 = await g(() => window.__arpg.game().vendor.map((v) => v.item.uid));
  check(!!bought && !st2.includes(bought), `${mode}: the item bought is not back on the stall`, `${st1.length} → ${st2.length}`);
  check(JSON.stringify(st2) === JSON.stringify(st1.filter((u) => u !== bought)), `${mode}: the same stall at the next contacts`);
  await page.screenshot({ path: join(SHOTS, `${mode}-1-stall.png`) });
  await close();

  // 2. a potion bought at level 45: Greater
  const tier = await g(() => {
    const gm = window.__arpg.game();
    gm.character.level = 45;
    for (const s of gm.character.belt) if (s.kind === 'heal') s.qty = 0;
    gm.buyConsumable('hp_potion');
    const t = gm.character.belt.find((s) => s.kind === 'heal')?.tier;
    gm.character.level = 30;
    return t;
  });
  check(tier === 3, `${mode}: a potion bought at level 45 is Greater (tier 3)`, `${tier}`);

  // 3. the Cold Plains: killed, hurt, down the cave and back
  await g(() => window.__arpg.game().startRun('a1_coldplains', 0));
  await shown('a1_coldplains');
  await page.waitForTimeout(1500);
  const before = await g(() => {
    const w = window.__arpg.game().world;
    w.__lot316 = 'cold plains';
    w.pendingSpawns.splice(0).forEach((ps) => w.spawnGroup(ps.idx));
    const slain = w.monsters.filter((m) => !m.pet && !m.dead).slice(0, 6);
    for (const m of slain) w.killMonster(m, w.player);
    w.player.hp = Math.round(w.player.hpMax / 2);
    w.player.mana = Math.round(w.player.manaMax / 3);
    return { slain: slain.map((m) => m.id), hp: w.player.hp, mana: w.player.mana, alive: w.monsters.filter((m) => !m.pet && !m.dead).length };
  });
  await page.waitForTimeout(1500);
  const hurt = await g(() => {
    const w = window.__arpg.game().world;
    return { hp: w.player.hp, mana: w.player.mana };
  });
  await g(() => {
    const w = window.__arpg.game().world;
    const o = w.objects.find((x) => x.kind === 'portal' && x.ref === 'zone:a1_cave1');
    w.events.push({ t: 'interact', kind: 'portal', ref: o.ref, objectId: o.id });
  });
  await shown('a1_cave1');
  await page.waitForTimeout(1500);
  const cave = await g(() => {
    const w = window.__arpg.game().world;
    return { hp: w.player.hp, mana: w.player.mana, max: w.player.hpMax };
  });
  check(Math.abs(cave.hp - hurt.hp) < cave.max * 0.05 && cave.hp < cave.max * 0.7, `${mode}: life kept down the stairs (no heal)`, `${hurt.hp} → ${cave.hp} / ${cave.max}`);
  await g(() => {
    const w = window.__arpg.game().world;
    const o = w.objects.find((x) => x.kind === 'portal' && x.ref === 'zone:a1_coldplains');
    w.events.push({ t: 'interact', kind: 'portal', ref: o.ref, objectId: o.id });
  });
  await shown('a1_coldplains');
  await page.waitForTimeout(1500);
  const after = await g((slain) => {
    const w = window.__arpg.game().world;
    const back = w.objects.find((x) => x.kind === 'portal' && x.ref === 'zone:a1_cave1');
    return {
      same: w.__lot316 === 'cold plains',
      risen: slain.filter((id) => w.monsters.some((m) => m.id === id && !m.dead)).length,
      alive: w.monsters.filter((m) => !m.pet && !m.dead && !m.mirror).length,
      near: Math.hypot(w.player.x - back.x, w.player.y - back.y),
      hp: w.player.hp,
      max: w.player.hpMax,
    };
  }, before.slain);
  check(after.same && after.risen === 0, `${mode}: the Cold Plains found as they were (no monster risen)`, JSON.stringify(after));
  check(after.near < 5, `${mode}: the hero back by the cave's entrance`, `${after.near.toFixed(1)}`);
  check(after.hp < after.max * 0.7, `${mode}: still hurt back up (no heal)`, `${after.hp} / ${after.max}`);
  await page.screenshot({ path: join(SHOTS, `${mode}-2-coldplains-again.png`) });
  await g(() => window.__arpg.game().enterTown('act1'));
  await shown('a1_town');
  await page.waitForTimeout(1500);
  const town = await g(() => {
    const p = window.__arpg.game().world.player;
    return { hp: p.hp, max: p.hpMax };
  });
  check(town.hp < town.max * 0.7, `${mode}: no heal on entering the camp`, `${town.hp} / ${town.max}`);
  await talk('akara');
  const healed = await g(() => {
    const p = window.__arpg.game().world.player;
    return p.hp >= p.hpMax - 1;
  });
  check(healed, `${mode}: Akara heals`);
  await close();

  // 4. death in the Cold Plains: the camp named, the gold lost, nothing else, the portal back
  await g(() => window.__arpg.game().startRun('a1_coldplains', 0));
  await shown('a1_coldplains');
  await page.waitForTimeout(1000);
  const dying = await g(() => {
    const gm = window.__arpg.game();
    gm.character.gold = 100000;
    const w = gm.world;
    w.godMode = false;
    w.player.hp = 0;
    w.player.dead = true;
    w.player.deathTick = w.tick;
    w.events.push({ t: 'playerDeath' });
    return { same: w.__lot316 === 'cold plains', items: JSON.stringify([gm.character.inventory, gm.character.equipment]).length };
  });
  await page.waitForTimeout(700);
  const screen = await g(() => {
    const d = document.querySelector('.death');
    return d && getComputedStyle(d).display !== 'none' ? d.textContent : null;
  });
  check(!!screen && /Rogue Encampment/.test(screen) && !/Harrogath/.test(screen), `${mode}: the death screen names the camp`, `${screen}`);
  await page.screenshot({ path: join(SHOTS, `${mode}-3-death.png`) });
  await shown('a1_town');
  await page.waitForTimeout(1500);
  const dead = await g(() => {
    const gm = window.__arpg.game();
    return { gold: gm.character.gold, items: JSON.stringify([gm.character.inventory, gm.character.equipment]).length, hp: gm.world.player.hp, max: gm.world.player.hpMax };
  });
  // Diablo II: level 30 → 20 % (its cap) of what passes the 15 000 exempt: (100 000 − 15 000) × 0.2
  check(dead.gold === 100000 - Math.floor(85000 * 0.2), `${mode}: Diablo II's share of the gold lost`, `${dead.gold}`);
  check(dead.items === dying.items, `${mode}: no item lost`);
  check(dead.hp === dead.max, `${mode}: back in the camp whole`);
  await g(() => {
    const w = window.__arpg.game().world;
    const o = w.objects.find((x) => x.kind === 'portal' && x.ref === 'run');
    if (o) w.events.push({ t: 'interact', kind: 'portal', ref: 'run', objectId: o.id });
  });
  await shown('a1_coldplains');
  await page.waitForTimeout(1000);
  const ret = await g(() => window.__arpg.game().world.__lot316 === 'cold plains');
  check(dying.same && ret, `${mode}: the portal back leads to the zone as it was`);

  // 5. Duriel and Baal reached in the Campaign
  if (BOSSES) {
    const boss = async (act, zone, prep, bossId, after) => {
      await g((a) => window.__arpg.loadCampaign(a), act);
      await g((z) => window.__arpg.game().startRun(z, 0), zone);
      await shown(zone);
      await page.waitForTimeout(1500);
      await g(prep);
      await page.waitForFunction(() => window.__arpg.game().world.objects.some((o) => o.kind === 'portal' && o.ref === 'chamber'), null, { timeout: 30000 }).catch(() => undefined);
      const door = await g(() => {
        const w = window.__arpg.game().world;
        const o = w.objects.find((x) => x.kind === 'portal' && x.ref === 'chamber');
        if (o) w.events.push({ t: 'interact', kind: 'portal', ref: 'chamber', objectId: o.id });
        return o ? w.zone.id : null;
      });
      check(!!door, `${mode}: ${zone}: its chamber's portal`);
      if (!door) return;
      await page.waitForFunction((z) => window.__arpg.game().world.zone.id !== z && !document.querySelector('.loading'), door, { timeout: 400000 });
      await page.waitForTimeout(1500);
      const r = await g((b) => {
        const w = window.__arpg.game().world;
        const portals = w.objects.filter((o) => o.kind === 'portal' && o.ref === 'town').length;
        w.pendingSpawns.splice(0).forEach((ps) => w.spawnGroup(ps.idx));
        const m = w.monsters.find((x) => x.def.id === b);
        if (m) w.killMonster(m, w.player);
        return { zone: w.zone.id, portals, boss: !!m };
      }, bossId);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(SHOTS, `${mode}-4-${bossId}.png`) });
      const done = await g(after);
      check(r.boss && r.portals === 0 && done, `${mode}: ${bossId} in ${r.zone}, killed: ${done}`, JSON.stringify(r));
    };
    await boss(
      'a2',
      'a2_tomb4',
      // lot 319: the door opens with the Horadric Staff in the orifice (Diablo II's lock)
      () => window.__arpg.game().completeQuest('staff', 0),
      'duriel',
      () => window.__arpg.game().questDone('duriel', 0) && window.__arpg.game().actLock('act3', 0) === null,
    );
    await boss(
      'a5',
      'a5_throne',
      () => {
        const w = window.__arpg.game().world;
        w.pendingSpawns = w.pendingSpawns.filter((s) => !s.wave && !s.seal);
        w.pendingSpawns.splice(0).forEach((ps) => w.spawnGroup(ps.idx));
        for (const m of [...w.monsters]) if (!m.pet && !m.dead) w.killMonster(m, w.player);
        w.run.wave = w.run.totalWaves;
      },
      'baal',
      () => window.__arpg.game().questDone('baal', 0) && window.__arpg.game().character.progression.highestDifficulty >= 1,
    );
  }
  check(!errs.length, `${mode}: no page error`, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

for (const m of MODES) await play(m);
await browser.close();
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
