/**
 * Audio local (phase 6) : le navigateur décode à la demande les sons des vraies archives du joueur (d2sfx, d2speech, d2xtalk, d2music).
 *   D2_SPRITES=0 npx vite --host 127.0.0.1 --port 5233 --strictPort
 *   node tools/e2e/d2-audio.mjs [--in=$D2_PRIVATE_DIR/in] [--audio=$D2_PRIVATE_DIR/audio-in] [--copy]
 * Vérifie : 0 requête /d2/, sons joués par le moteur (compteurs `__d2audio.d2Diag`), musique de zone décodée, voix de PNJ, 0 erreur ;
 * puis rechargement SANS archives : les sons déjà décodés restent lisibles depuis le cache. Mesure temps, stockage, mémoire.
 */
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const URL = args.get('url') ?? process.env.E2E_URL ?? 'http://127.0.0.1:5233/';
const IN = args.get('in') ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'in');
const AIN = args.get('audio') ?? join(process.env.D2_PRIVATE_DIR ?? join(homedir(), 'd2-private'), 'audio-in');
const COPY = args.has('copy');
const gfx = ['d2data.mpq', 'd2char.mpq', 'd2exp.mpq'].map((n) => join(IN, n));
const aud = readdirSync(AIN)
  .filter((f) => /^(d2sfx|d2speech|d2xtalk|d2music)\.mpq$/i.test(f))
  .map((f) => join(AIN, f));
let fails = 0;
const check = (ok, what, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${what}${detail ? ` — ${detail}` : ''}`);
};
function rssMB() {
  try {
    let sum = 0;
    for (const l of execSync('ps -eo rss,args --no-headers', { encoding: 'utf8' }).split('\n')) if (l.includes('chrom')) sum += Number(l.trim().split(/\s+/)[0]);
    return sum / 1024;
  } catch {
    return 0;
  }
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
const page = await ctx.newPage();
const errs = [];
const d2req = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource|GPU stall|swiftshader|WebGL|GroupMarker/i.test(m.text()) && errs.push(m.text().slice(0, 200)));
page.on('request', (rq) => rq.url().includes('/d2/') && d2req.push(rq.url().split('/d2/')[1]));

async function boot(fresh) {
  await page.goto(URL);
  if (fresh) {
    await page.evaluate(async () => {
      localStorage.clear();
      localStorage.setItem('d2m.d2local', '1');
      localStorage.setItem('d2m.d2localMaps', '0');
      for (const k of await caches.keys()) if (k.includes('d2-local') || k.includes('d2-audio')) await caches.delete(k);
      try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry('d2m-d2', { recursive: true });
      } catch {
        /* rien */
      }
    });
  }
  await page.goto(URL);
  await page.waitForFunction(() => window.__arpg, null, { timeout: 240000 });
  if (await page.$('.charselect input')) {
    await page.fill('.charselect input', 'D2-audio');
    await page.click('.charselect .card.paladin');
    await page.click('.charselect .btn.primary');
  }
  await page.waitForFunction(() => window.__arpg && !document.querySelector('.loading'), null, { timeout: 240000 });
}

const base = rssMB();
await boot(true);
// --- phase 1 : archives fournies
await page.evaluate(() => {
  const i = document.createElement('input');
  i.type = 'file';
  i.multiple = true;
  i.id = 'mpq';
  document.body.append(i);
});
await page.setInputFiles('#mpq', [...gfx, ...aud]);
const tProvide = Date.now();
const rep = await page.evaluate(async (copy) => {
  const files = [...document.getElementById('mpq').files];
  const r = await window.__d2local.provideFiles(files, { store: copy ? 'opfs' : 'session', copyAudio: copy });
  return { ok: r.ok, audio: window.__d2local.status.audio };
}, COPY);
check(rep.ok, 'graphismes valides', JSON.stringify(rep.audio.names));
check(rep.audio.names.length === aud.length, 'archives audio reconnues', rep.audio.names.join(','));
await page.waitForFunction(() => window.__d2audio?.d2?.ready === true, null, { timeout: 120000 });
const tReady = Date.now() - tProvide;
console.log(`index audio prêt ${tReady} ms après le choix des fichiers`);
const idx = await page.evaluate(() => {
  const d = window.__d2audio.d2;
  return { sounds: Object.keys(d.index).length, music: Object.keys(d.music).length, voices: Object.keys(d.voices).length, gossip: Object.keys(d.gossipIndex).length };
});
check(idx.sounds > 2000 && idx.music >= 20 && idx.voices >= 4, 'index audio complet', JSON.stringify(idx));

// partie : Tristram, puis événements de combat sur de vrais monstres
await page.evaluate(() => {
  const a = window.__arpg;
  a.setLevel(30, true);
  a.startRun('tristram', 0, 7);
  a.god(true);
  a.step(20);
});
await page.mouse.click(400, 200);
await page.keyboard.press('Space');
await page.waitForTimeout(4000);
const warm = await page.evaluate(() => {
  const s = window.__d2local.audio.stats;
  return { reads: s.reads, sfx: s.byKind.sfx, music: s.byKind.music, ready: window.__d2audio.d2.buffers.size };
});
console.log(`après l'arrivée en zone : ${warm.reads} lectures, ${warm.ready} tampons prêts, sfx ${JSON.stringify(warm.sfx)}, musique ${JSON.stringify(warm.music)}`);
check(warm.reads > 10, 'préchargement de la zone et de la classe', `${warm.reads} lectures`);

const t1 = Date.now();
const played = await page.evaluate(async () => {
  const a = window.__arpg;
  const au = window.__d2audio;
  const w = a.game().world;
  const ms = w.monsters.filter((m) => !m.dead).slice(0, 4);
  const sleep = (n) => new Promise((r) => setTimeout(r, n));
  for (let round = 0; round < 6; round++) {
    const evs = [
      { t: 'cast', id: w.player.id, skill: 'attack' },
      { t: 'zoneEnter', zone: 'tristram' },
    ];
    for (const m of ms) {
      evs.push({ t: 'hit', target: m.id, toPlayer: false, elem: 'phys', amount: 5 });
      evs.push({ t: 'monsterAttack', id: m.id });
      if (round === 3) evs.push({ t: 'death', id: m.id, rank: 'normal' });
    }
    evs.push({ t: 'impact', kind: 'bolt', elem: 'fire', radius: 2, x: 0, y: 0 }, { t: 'playerHurt' });
    au.onEvents(w, evs);
    await sleep(450);
  }
  return { groups: [...au.d2Diag.played.entries()], late: au.d2Diag.late, monsters: ms.map((m) => m.def.id) };
});
const total = played.groups.reduce((a, [, n]) => a + n, 0);
console.log(
  `sons D2 lancés par le moteur : ${total} (${played.groups.length} groupes : ${played.groups
    .map(([g, n]) => `${g}×${n}`)
    .slice(0, 12)
    .join(', ')}) ; demandes sans tampon prêt : ${played.late} ; monstres ${played.monsters.join(',')} ; ${Date.now() - t1} ms`,
);
check(total > 5 && played.groups.length >= 3, 'sons D2 joués par le moteur (compteurs)', `${total} lancés`);

// musique : le morceau de zone
await page.waitForFunction(() => window.__d2audio.player?.stats.decoded > 0 || window.__d2audio.player?.cached.length > 0, null, { timeout: 60000 }).catch(() => {});
const mus = await page.evaluate(() => ({
  cached: window.__d2audio.player?.cached ?? [],
  stats: window.__d2audio.player?.stats ?? null,
  key: window.__d2audio.player?.currentKey ?? null,
  byKind: window.__d2local.audio.stats.byKind.music ?? null,
}));
console.log(`musique : piste ${mus.key} ; décodées ${JSON.stringify(mus.stats)} ; lecture ${JSON.stringify(mus.byKind)}`);
check((mus.stats?.decoded ?? 0) > 0, 'musique de zone décodée et jouée', mus.cached.join(','));

// voix d'un PNJ (Harrogath) + bavardage
await page.waitForFunction(() => window.__d2local.status.extras.includes('text:npc'), null, { timeout: 120000 }).catch(() => {});
await page.waitForFunction(() => Object.keys(window.__d2audio.d2.gossipText).length > 0, null, { timeout: 20000 }).catch(() => {});
const voice = await page.evaluate(async () => {
  const d = window.__d2audio.d2;
  const t0 = performance.now();
  const b = await d.voice('larzuk');
  const lines = d.gossipLines('akara');
  const g = lines.find((l) => l.file);
  const t1 = performance.now();
  const gb = g ? await d.gossipVoice(g.file) : null;
  return {
    voice: b ? Math.round(b.duration * 100) / 100 : null,
    voiceMs: Math.round(t1 - t0),
    gossip: gb ? Math.round(gb.duration * 100) / 100 : null,
    gossipMs: Math.round(performance.now() - t1),
    lines: lines.length,
  };
});
console.log(`voix : ${JSON.stringify(voice)}`);
check(voice.voice > 0, 'voix de PNJ décodée (d2xtalk)');
check(voice.gossip > 0, 'bavardage décodé (d2speech)', `${voice.lines} lignes`);

const st = await page.evaluate(async () => {
  const a = window.__d2local.audio;
  return { stats: a.stats, cacheBytes: await a.cacheBytes(), opened: a.opened };
});
const rssPeak = rssMB();
console.log(
  `archives ouvertes : ${st.opened.join(',')} (${st.stats.openMs} ms) ; lectures ${st.stats.reads} (cache ${st.stats.cacheHits}, décodages ${st.stats.decodes}, vides ${st.stats.misses}) ; ${(st.stats.bytes / 1048576).toFixed(1)} Mo produits en ${st.stats.decodeMs} ms de Worker ; plus longue ${st.stats.slowest} ms`,
);
for (const [k, v] of Object.entries(st.stats.byKind))
  console.log(
    `   ${k.padEnd(6)} ${String(v.n).padStart(4)} lectures, ${(v.ms / Math.max(1, v.n)).toFixed(0).padStart(5)} ms de bout en bout, ${(v.dec / Math.max(1, v.n - v.cache)).toFixed(1).padStart(6)} ms de décodage, ${(v.bytes / 1048576).toFixed(1)} Mo, cache ${v.cache}`,
  );
console.log(`stockage des sons décodés : ${(st.cacheBytes / 1048576).toFixed(1)} Mo ; RSS navigateur ${base.toFixed(0)} → ${rssPeak.toFixed(0)} Mo`);
check(d2req.length === 0, '0 requête /d2/', d2req.slice(0, 4).join(','));

if (COPY) {
  // copie OPFS des archives (graphismes + sons) : attendue, puis rechargement qui doit retrouver les archives sonores
  const tc = Date.now();
  await page.waitForFunction(() => !window.__d2local.status.copy && window.__d2local.status.audio.source === 'opfs', null, { timeout: 600000 });
  console.log(`copie OPFS terminée ${(Date.now() - tc) / 1000} s après la fin des mesures`);
}
// --- phase 2 : sans les archives, les sons déjà décodés restent lisibles
const before = await page.evaluate(() => ({ played: window.__d2audio.d2Diag.played.size }));
await boot(false);
await page.evaluate(() => {
  const a = window.__arpg;
  a.startRun('tristram', 0, 7);
});
await page.mouse.click(400, 200);
await page.waitForFunction(() => window.__d2audio?.d2?.ready === true, null, { timeout: 60000 }).catch(() => {});
const again = await page.evaluate(async () => {
  const a = window.__d2audio;
  const w = window.__arpg.game().world;
  const sleep = (n) => new Promise((r) => setTimeout(r, n));
  const ms = w.monsters.filter((m) => !m.dead).slice(0, 3);
  for (let i = 0; i < 3; i++) {
    a.onEvents(w, [{ t: 'cast', id: w.player.id, skill: 'attack' }, ...ms.map((m) => ({ t: 'hit', target: m.id, toPlayer: false, elem: 'phys', amount: 5 })), { t: 'zoneEnter', zone: 'tristram' }]);
    await sleep(400);
  }
  const s = window.__d2local.audio.stats;
  return {
    ready: a.d2?.ready ?? false,
    hasFiles: window.__d2local.audio.hasFiles,
    hasCache: window.__d2local.audio.hasCache,
    played: [...a.d2Diag.played.entries()].reduce((n, [, c]) => n + c, 0),
    cacheHits: s.cacheHits,
    decodes: s.decodes,
    misses: s.misses,
  };
});
console.log(`rechargement sans archives : ${JSON.stringify(again)} (avant : ${before.played} groupes)`);
if (COPY) {
  check(again.hasFiles, 'copie OPFS : archives sonores retrouvées au lancement');
  check(again.ready && again.cacheHits > 0, 'copie OPFS : sons servis par le cache, le reste décodé', `${again.cacheHits} cache, ${again.decodes} décodages`);
} else {
  check(!again.hasFiles && again.hasCache, 'sans archives : sons décodés en cache détectés');
  check(again.ready && again.cacheHits > 0 && again.decodes === 0, 'sans archives : index et sons servis par le cache', `${again.cacheHits} lectures cache`);
}
check(again.played > 0, 'sans archives : sons joués depuis le cache', `${again.played}`);
check(d2req.length === 0, 'toujours 0 requête /d2/');
const uniq = [...new Set(errs)];
check(uniq.length === 0, '0 erreur', uniq.slice(0, 4).join(' | '));
await browser.close();
console.log(fails ? `D2-AUDIO : ${fails} ÉCHEC(S)` : 'D2-AUDIO OK');
process.exit(fails ? 1 : 0);
