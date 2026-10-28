/**
 * Bot d'endgame en ligne de commande : farm des cartes et mesure du rythme de butin.
 *   npx tsx tools/bots/maps.ts --build=cold --seed=1 --hours=10
 * Part d'une sauvegarde au prérequis des cartes (Enfer débloqué, niveau 75), produite une
 * fois par le bot de progression puis mise en cache dans test-results/bots/premaps-<build>-<seed>.json.
 * Mesure : temps d'accès à chaque palier, runes par rang (/h), uniques et sets (/h), cartes et
 * orbes, morts par palier. Rapport : test-results/bots/maps-<build>-<seed>.json.
 */
import '../mods/auto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUNES } from '../../src/data/items/runes';
import { BUILD_CLASS, type BuildId } from '../../src/sim/bot/brain';
import { progressionSession } from '../../src/sim/bot/runner';
import { Game } from '../../src/sim/game';
import { migrate, serialize } from '../../src/sim/save';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const build = (args.get('build') ?? 'cold') as BuildId;
const seed = Number(args.get('seed') ?? 1);
const hours = Number(args.get('hours') ?? 10);
const verbose = args.has('verbose');

const dir = join(process.cwd(), 'test-results', 'bots');
mkdirSync(dir, { recursive: true });
const cache = join(dir, `premaps-${build}-${seed}.json`);
const t0 = Date.now();

let game: Game;
let preSeconds = 0;
if (existsSync(cache) && !args.has('fresh')) {
  const raw = JSON.parse(readFileSync(cache, 'utf8'));
  preSeconds = raw.seconds;
  game = new Game(migrate(raw.save));
} else {
  game = new Game(undefined, BUILD_CLASS[build]);
  const pre = progressionSession({ bot: { build, seed }, targetLevel: 99, maxSeconds: 10 * 3600, until: (g) => g.canOpenMaps().ok }, game);
  if (!game.canOpenMaps().ok) throw new Error(`prérequis des cartes non atteint en 10 h (niveau ${pre.finalLevel})`);
  preSeconds = pre.totalSeconds;
  if (game.mode === 'run') game.townPortal();
  writeFileSync(cache, JSON.stringify({ seconds: preSeconds, save: JSON.parse(serialize(game.toSave())) }));
  console.log(`Prérequis des cartes atteint en ${(preSeconds / 60).toFixed(0)} min (calcul ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
// relance le monde de la ville pour attribuer les cartes d'Anya
game.enterTown();

const RUNE_RANK: Record<string, number> = Object.fromEntries(RUNES.map((r) => [`Rune ${r.name}`, r.rank]));
const runeBands = { low: 0, mid: 0, high: 0 } as Record<string, number>;
const runeNames: Record<string, number> = {};
const firstRune: Record<string, number> = {};
let uniques = 0;
let sets = 0;
const tierFirst: Record<string, number> = {};
const tierRuns: Record<string, { n: number; deaths: number; seconds: number; completed: number }> = {};
const ttk: Record<string, number[]> = {};
const hourly: { hour: number; level: number; runes: Record<string, number>; uniques: number; sets: number; tierMax: number }[] = [];
let clock = 0;
let nextHour = 3600;

let mapsPicked = 0;
const off = game.onEvent((e) => {
  if (e.t !== 'pickup') return;
  if (e.kind === 'map') mapsPicked++;
  if (e.kind === 'rune') {
    const rank = RUNE_RANK[e.name] ?? 0;
    // bandes PD2 : basses El-Dol (1-14), moyennes Hel-Gul (15-25), hautes Vex-Zod (26-33)
    const band = rank >= 26 ? 'high' : rank >= 15 ? 'mid' : 'low';
    runeBands[band]++;
    runeNames[e.name] = (runeNames[e.name] ?? 0) + 1;
    if (firstRune[e.name] === undefined) firstRune[e.name] = Math.round(clock / 60);
  } else {
    const c = game.character;
    const it = [...c.inventory, ...c.stash.flat(), ...Object.values(c.equipment)].find((x) => x?.uid === e.uid);
    if (it?.quality === 'unique') uniques++;
    if (it?.quality === 'set') sets++;
  }
});

const rep = progressionSession(
  {
    bot: { build, seed },
    targetLevel: 100,
    maxSeconds: hours * 3600,
    onRun: (r, g) => {
      clock += r.seconds + 25;
      const key = r.map ? `P${r.map.tier}` : `${r.runId}/${r.difficulty}`;
      const s = (tierRuns[key] ??= { n: 0, deaths: 0, seconds: 0, completed: 0 });
      s.n++;
      s.seconds += r.seconds;
      if (r.died) s.deaths++;
      if (r.completed) s.completed++;
      for (const [rank, v] of Object.entries(r.ttk)) (ttk[`${key}:${rank}`] ??= []).push(...v);
      if (r.map && tierFirst[key] === undefined) tierFirst[key] = Math.round(clock / 60);
      if (verbose) {
        const m = r.map ? `P${r.map.tier} ${r.map.quality}${r.map.fortified ? ' fortifiée' : ''}` : `${r.runId}/${r.difficulty}`;
        const nMaps = g.character.inventory.filter((x) => x?.map).length;
        console.log(
          `${m} niv ${r.levelEnd} ${Math.round(r.seconds)} s tués ${r.kills}${r.completed ? ' ✓' : ''}${r.died ? ' ✗ MORT' : ''}${r.timedOut ? ' ⌛' : ''}${r.stuck ? ' bloqué' : ''} cartes ${nMaps}`,
        );
        if (r.death) console.log('   mort :', JSON.stringify(r.death));
      }
      while (clock >= nextHour) {
        hourly.push({ hour: nextHour / 3600, level: g.character.level, runes: { ...runeBands }, uniques, sets, tierMax: g.character.progression.mapTierMax });
        nextHour += 3600;
      }
    },
  },
  game,
);
off();

const h = rep.totalSeconds / 3600;
const out = {
  build,
  seed,
  preMapsMinutes: Math.round(preSeconds / 60),
  hours: Math.round(h * 100) / 100,
  finalLevel: rep.finalLevel,
  tierFirstMinutes: tierFirst,
  runsByKind: tierRuns,
  runesPerHour: Object.fromEntries(Object.entries(runeBands).map(([k, v]) => [k, Math.round((v / h) * 100) / 100])),
  runes: runeNames,
  firstRuneMinutes: firstRune,
  uniquesPerHour: Math.round((uniques / h) * 10) / 10,
  setsPerHour: Math.round((sets / h) * 10) / 10,
  materials: game.character.materials,
  mapsHeld: [...game.character.inventory, ...game.character.stash.flat()].filter((x) => x?.map).map((x) => `P${x!.map!.tier}:${x!.quality}`),
  hourly,
  deaths: rep.deaths.length,
  ttkMedian: Object.fromEntries(Object.entries(ttk).map(([k, v]) => [k, Math.round(v.sort((a, b) => a - b)[Math.floor(v.length / 2)] * 10) / 10])),
  equipped: rep.equipped,
};
if (game.mode === 'run') game.townPortal();
writeFileSync(join(dir, `endmaps-${build}-${seed}.json`), JSON.stringify({ seconds: rep.totalSeconds, save: JSON.parse(serialize(game.toSave())) }));
const file = join(dir, `maps-${build}-${seed}.json`);
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(
  `\nBuild ${build} seed ${seed} : ${out.hours} h de cartes, niveau ${rep.finalLevel}, ${rep.runs.length} runs, ${rep.deaths.length} morts — calcul ${((Date.now() - t0) / 1000).toFixed(0)} s`,
);
console.log('Accès aux paliers (min) :', JSON.stringify(tierFirst));
console.log('Runs :', JSON.stringify(tierRuns));
{
  const mapRuns = Object.entries(tierRuns).filter(([k]) => /^P\d/.test(k));
  const played = mapRuns.reduce((a, [, v]) => a + v.n, 0);
  const secs = mapRuns.reduce((a, [, v]) => a + v.seconds, 0);
  const all = Object.values(tierRuns).reduce((a, v) => a + v.seconds, 0);
  console.log(
    `Économie des cartes : ${mapsPicked} ramassées pour ${played} jouées (${(mapsPicked / Math.max(1, played)).toFixed(2)} par carte), ${Math.round((secs / Math.max(1, all)) * 100)} % du temps en cartes`,
  );
}
console.log('Runes /h :', JSON.stringify(out.runesPerHour), '| uniques /h', out.uniquesPerHour, '| sets /h', out.setsPerHour);
console.log('Premières runes (min) :', JSON.stringify(firstRune));
console.log('TTK médian (s) :', JSON.stringify(out.ttkMedian));
console.log('Matériaux :', JSON.stringify(out.materials));
console.log(`Rapport : ${file}`);
