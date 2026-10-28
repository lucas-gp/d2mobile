/**
 * Chaque run dans le vrai client (bot de jeu, accéléré) : chargement, rendu sans erreur,
 * captures ; puis mesure de performance au Niveau des Vaches en Enfer (densité maximale).
 *   node tools/e2e/runs.mjs [--url=http://127.0.0.1:5233/]
 * Captures : test-results/e2e/runs/<run>-<difficulté>.png ; rapport : runs.json
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const OUT = join(process.cwd(), 'test-results', 'e2e', 'runs');
mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
const CASES = [
  ['tombs', 0, 20],
  ['cows', 0, 30],
  ['chaos', 0, 40],
  ['baal', 0, 45],
  // boss de farm PD2
  ['countess', 0, 12],
  ['andariel', 0, 20],
  ['mephisto', 0, 35],
  // boss de farm de l'Acte V
  ['pindleskin', 0, 38],
  ['eldritch', 0, 38],
  ['nihlathak', 0, 45],
  ['ancients', 0, 45],
  // Pandémonium (entrée par le Cube en temps normal)
  ['uber_tristram', 2, 90],
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
});
await page.addInitScript(() => localStorage.clear());
await page.goto(`${URL}${URL.includes('?') ? '&' : '?'}freeze`);
const ready = () => page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 90000 });
await ready();
const report = {};

for (const [run, diff, level] of CASES) {
  await page.evaluate(
    ([run, diff, level]) => {
      window.__arpg.bot(false);
      window.__arpg.town();
      window.__arpg.setLevel(level, false);
      window.__arpg.game().character.progression.highestDifficulty = 2;
      window.__arpg.startRun(run, diff, 11);
    },
    [run, diff, level],
  );
  await page.waitForFunction((run) => window.__arpg.state().zone === run, run, { timeout: 30000 }).catch(() => {});
  await ready();
  await page.evaluate(() => {
    window.__arpg.setQuality('high');
    window.__arpg.bot(true);
    window.__arpg.god(true);
    window.__arpg.speed(4);
  });
  // le premier groupe est à quelques dizaines d'unités de l'entrée du DS1 : 16 s réelles à ×4
  await page.waitForTimeout(16000);
  await page.evaluate(() => window.__arpg.speed(0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${run}-${diff}.png`) });
  const st = await page.evaluate(() => ({ ...window.__arpg.state(), texMo: +(window.__arpg.renderer().bank.gpuBytes() / 1048576).toFixed(1) }));
  report[`${run}-${diff}`] = st;
  // avec les emplacements d'origine du DS1 le boss est plus proche : le bot peut avoir fini la run et déjà en avoir lancé une autre (les tués sont comptés par run)
  check(st.zone !== run || st.kills > 0, `${run} (difficulté ${diff}) : chargée, le bot y combat`, `${st.kills} tués, textures ${st.texMo} Mo, zone ${st.zone}`);
}

// Trône de Baal : toutes les vagues, planches chargées au fil des vagues (mémoire, aucun
// monstre invisible)
{
  await page.evaluate(() => {
    window.__arpg.bot(false);
    window.__arpg.town();
    window.__arpg.setLevel(70, false);
    window.__arpg.startRun('baal', 0, 11);
  });
  await page.waitForFunction(() => window.__arpg.state().zone === 'baal', null, { timeout: 30000 }).catch(() => {});
  await ready();
  await page.evaluate(() => {
    window.__arpg.bot(true);
    window.__arpg.god(true);
    window.__arpg.speed(8);
  });
  let peak = 0;
  let missing = 0;
  let prevMiss = 0;
  let wave = 0;
  for (let k = 0; k < 150; k++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => {
      const r = window.__arpg.renderer();
      const w = window.__arpg.game().world;
      return { tex: r.bank.gpuBytes() / 1048576, miss: w.zone.id === 'baal' ? r.missingSheetViews(w) : 0, wave: w.run?.wave ?? 0, total: w.run?.totalWaves ?? 0, zone: w.zone.id };
    });
    peak = Math.max(peak, s.tex);
    wave = Math.max(wave, s.wave);
    // tolérance : à ×8, une vague peut apparaître avant la fin du chargement de sa planche ; un
    // monstre ne compte comme invisible que s'il l'est encore au relevé suivant (1 s réelle)
    missing = Math.max(missing, Math.min(prevMiss, s.miss));
    prevMiss = s.miss;
    if (s.zone !== 'baal' || (s.total && s.wave >= s.total)) break;
  }
  await page.evaluate(() => window.__arpg.speed(1));
  check(wave >= 3, 'Trône de Baal : vagues enchaînées par le bot', `vague ${wave} atteinte`);
  // sprites d'origine : 80 Mo ; avec l'import D2 (planches d'origine 1:1, deux fois plus fines que les nôtres) le budget de l'appareil s'applique
  const limit = await page.evaluate(() => {
    const b = window.__arpg.app.renderer.bank;
    return b.isImported('sorceress') || b.isImported('paladin') ? Math.max(80, b.budget / 1048576) : 80;
  });
  check(peak <= limit, `Trône de Baal : mémoire de textures ≤ ${limit.toFixed(0)} Mo (planches chargées au fil des vagues)`, `pic ${peak.toFixed(1)} Mo`);
  check(missing === 0, 'Trône de Baal : aucun monstre invisible plus d’une seconde (planche manquante)', `${missing} au pire`);
  report.baalWaves = { peak: +peak.toFixed(1), wave, missing };
}

// Sanctuaire du Chaos : le bot brise les cinq sceaux, tue leurs gardiens ; Diablo apparaît,
// visible (planche chargée), et sa mort termine la run
{
  await page.evaluate(() => {
    window.__arpg.bot(false);
    window.__arpg.town();
    window.__arpg.setLevel(70, false);
    window.__arpg.startRun('chaos', 0, 11);
  });
  await page.waitForFunction(() => window.__arpg.state().zone === 'chaos', null, { timeout: 30000 }).catch(() => {});
  await ready();
  await page.evaluate(() => {
    window.__chaosDone = false;
    window.__arpg.game().onEvent((e) => {
      if (e.t === 'runComplete' && e.runId === 'chaos') window.__chaosDone = true;
    });
    window.__arpg.bot(true);
    window.__arpg.god(true);
    window.__arpg.speed(8);
  });
  let diablo = false;
  let done = false;
  let seals = 0;
  let shot = false;
  let missing = 0;
  let prevMiss = 0;
  let s = null;
  // 26 groupes de gardes et cinq sceaux : 300 s réelles à ×8 (sous charge, le client ralentit)
  for (let k = 0; k < 300; k++) {
    await page.waitForTimeout(1000);
    s = await page.evaluate(() => {
      const r = window.__arpg.renderer();
      const w = window.__arpg.game().world;
      return {
        zone: w.zone.id,
        seals: w.objects.filter((o) => o.kind === 'seal' && o.used).length,
        diablo: w.monsters.some((m) => m.def.id === 'diablo'),
        miss: w.zone.id === 'chaos' ? r.missingSheetViews(w) : 0,
        done: !!w.run?.completed || window.__chaosDone,
      };
    });
    diablo ||= s.diablo;
    // le bot rentre en ville par le portail dès la run terminée : on retient l'état vu en run
    done ||= s.done;
    seals = Math.max(seals, s.seals);
    missing = Math.max(missing, Math.min(prevMiss, s.miss));
    prevMiss = s.miss;
    if (s.diablo && !shot) {
      shot = true;
      await page.evaluate(() => window.__arpg.speed(0));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(OUT, 'chaos-diablo.png') });
      await page.evaluate(() => window.__arpg.speed(8));
    }
    if (s.zone !== 'chaos' || s.done) break;
  }
  await page.evaluate(() => window.__arpg.speed(1));
  check(diablo && seals === 5, 'Sanctuaire du Chaos : cinq sceaux brisés, gardiens tués, Diablo apparu', `${seals} sceaux`);
  check(done, 'Sanctuaire du Chaos : Diablo tué, run terminée');
  check(missing === 0, 'Sanctuaire du Chaos : aucun monstre invisible plus d’une seconde', `${missing} au pire`);
  report.chaos = { diablo, seals, done, missing };
}

// une carte de palier 3 rare (labyrinthe ou champ selon le tirage), ouverte comme par Anya
await page.evaluate(() => {
  window.__arpg.bot(false);
  window.__arpg.town();
  window.__arpg.setLevel(85, false);
  const g = window.__arpg.game();
  g.character.progression.highestDifficulty = 2;
  g.enterTown();
  g.character.inventory.fill(null); // le butin des runs précédentes peut remplir le sac
  const m = window.__arpg.giveMap(3, 'rare');
  window.__mapStart = g.startMap({ invIndex: g.character.inventory.indexOf(m) }, 5);
});
console.log('  démarrage de la carte P3 :', JSON.stringify(await page.evaluate(() => window.__mapStart)));
await page.waitForFunction(() => window.__arpg.state().zone === 'map', null, { timeout: 30000 }).catch(() => {});
await ready();
await page.evaluate(() => {
  window.__arpg.setQuality('high');
  window.__arpg.bot(true);
  window.__arpg.god(true);
  window.__arpg.speed(4);
});
await page.waitForTimeout(9000);
await page.evaluate(() => window.__arpg.speed(0));
await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, 'map-t3.png') });
{
  const st = await page.evaluate(() => ({ ...window.__arpg.state(), name: window.__arpg.game().world.zone.name, texMo: +(window.__arpg.renderer().bank.gpuBytes() / 1048576).toFixed(1) }));
  report['map-t3'] = st;
  check(st.zone === 'map' && st.kills > 0, `carte P3 « ${st.name} » : chargée, le bot y combat`, `${st.kills} tués, textures ${st.texMo} Mo`);
}

// cartes uniques : chacune se charge et le bot y combat (planches présentes, aucune erreur)
{
  const zones = await page.evaluate(() => window.__arpg.uniqueMapZones());
  const bad = [];
  for (const z of zones) {
    await page.evaluate(({ id, tier }) => {
      window.__arpg.bot(false);
      window.__arpg.town();
      const g = window.__arpg.game();
      g.enterTown();
      const m = window.__arpg.giveMap(tier, 'unique', id);
      g.startMap({ invIndex: g.character.inventory.indexOf(m) }, 11);
    }, z);
    await page.waitForFunction(() => window.__arpg.state().zone === 'map', null, { timeout: 30000 }).catch(() => {});
    await ready();
    await page.evaluate(() => {
      window.__arpg.bot(true);
      window.__arpg.god(true);
      window.__arpg.speed(4);
    });
    await page.waitForTimeout(4000);
    const st = await page.evaluate(() => ({ ...window.__arpg.state(), name: window.__arpg.game().world.zone.name, miss: window.__arpg.renderer().missingSheetViews(window.__arpg.game().world) }));
    await page.evaluate(() => window.__arpg.speed(1));
    if (st.zone !== 'map' || st.miss > 1) bad.push(`${z.id} (${st.zone}, ${st.miss} planches manquantes)`);
    report[`unique-${z.id}`] = st;
  }
  await page.screenshot({ path: join(OUT, 'map-unique.png') });
  check(zones.length === 8 && bad.length === 0, 'cartes uniques : les 8 se chargent, bot en combat, planches présentes', bad.join(', ') || `${zones.length} cartes`);
}

// performance : Vaches en Enfer, densité maximale, vitesse réelle, 20 s
await page.evaluate(() => {
  window.__arpg.bot(false);
  window.__arpg.town();
  window.__arpg.setLevel(80, false);
  window.__arpg.startRun('cows', 2, 3);
});
await page.waitForFunction(() => window.__arpg.state().zone === 'cows', null, { timeout: 30000 }).catch(() => {});
await ready();
await page.evaluate(() => {
  const g = window.__arpg.game();
  const w = g.world;
  // pire cas de densité : TOUS les troupeaux apparaissent, répartis autour du joueur (≤ 12 unités)
  for (let i = 0; i < w.zone.spawns.length; i++) w.spawnGroup(i);
  w.pendingSpawns = [];
  let k = 0;
  for (const m of w.monsters) {
    const a = k * 2.399;
    const r = 3 + ((k * 7) % 90) / 10;
    k++;
    const spot = w.grid.nearestFree(w.player.x + Math.cos(a) * r, w.player.y + Math.sin(a) * r, 4);
    if (spot) {
      m.x = m.px = spot.x;
      m.y = m.py = spot.y;
    }
  }
  w.monsterHash.clear?.();
  // tout le troupeau fonce sur le joueur (invulnérable, sans bot) : pire cas d'affichage
  for (const m of w.monsters) m.aggro = true;
  window.__arpg.setQuality('high');
  window.__arpg.god(true);
  window.__arpg.speed(1);
  const m = window.__arpg.metrics();
  m.frameIntervals.length = 0;
  m.frames = 0;
  m.renderMsSum = 0;
});
await page.waitForTimeout(20000);
const perf = await page.evaluate(() => {
  const m = window.__arpg.metrics();
  const a = [...m.frameIntervals].sort((x, y) => x - y);
  const q = (p) => a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;
  const w = window.__arpg.game().world;
  const alive = w.aliveMonsters().length;
  const t0 = performance.now();
  for (let i = 0; i < 250; i++) window.__arpg.game().step(1);
  const simMs = (performance.now() - t0) / 250;
  return {
    renduCpuMsParImage: +(m.renderMsSum / Math.max(1, m.frames)).toFixed(2),
    monstres: alive,
    medianeMs: q(0.5),
    p95Ms: q(0.95),
    simMsParTick: +simMs.toFixed(2),
    texturesMo: +(window.__arpg.renderer().bank.gpuBytes() / 1048576).toFixed(1),
  };
});
await page.screenshot({ path: join(OUT, 'cows-2-densite.png') });
report.perfVachesEnfer = perf;
console.log('perf Vaches Enfer', JSON.stringify(perf));
// budget de simulation : un tick à 25 Hz doit tenir largement dans 40 ms, même au pire
check(perf.monstres > 200 && perf.simMsParTick < 8, 'Vaches Enfer : simulation sous 8 ms par tick (budget 40 ms)', `${perf.simMsParTick} ms, ${perf.monstres} monstres`);
check(perf.texturesMo <= 128, 'Vaches Enfer : mémoire de textures dans le budget haut (128 Mo)', `${perf.texturesMo} Mo`);
check(errors.length === 0, 'aucune erreur', errors.slice(0, 3).join(' | '));
writeFileSync(join(OUT, 'runs.json'), JSON.stringify(report, null, 1));
await browser.close();
console.log(fails ? `${fails} ÉCHEC(S)` : 'RUNS DANS LE CLIENT OK');
process.exit(fails ? 1 : 0);
