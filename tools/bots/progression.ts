/**
 * Bot de progression en ligne de commande :
 *   npx tsx tools/bots/progression.ts --build=cold --level=30 --hours=3 --seed=1
 * Écrit le rapport complet dans test-results/bots/progression-<build>-<seed>.json.
 */
import '../mods/auto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { progressionSession } from '../../src/sim/bot/runner';
import type { BuildId } from '../../src/sim/bot/brain';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const build = (args.get('build') ?? 'cold') as BuildId;
const seed = Number(args.get('seed') ?? 1);
const level = Number(args.get('level') ?? 30);
const hours = Number(args.get('hours') ?? 3);
const verbose = args.has('verbose');

const t0 = Date.now();
const rep = progressionSession({
  bot: { build, seed },
  targetLevel: level,
  maxSeconds: hours * 3600,
  // --maps : arrêt au prérequis des maps (Enfer débloqué et niveau 75)
  until: args.has('maps') ? (g) => g.character.progression.highestDifficulty >= 2 && g.character.level >= 75 : undefined,
  onRun: (r, g) => {
    if (!verbose) return;
    const m = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
    console.log(
      `${r.runId}/${r.difficulty} niv ${r.levelStart}→${r.levelEnd} ${m(r.seconds)} tués ${r.kills}${r.completed ? ' ✓' : ''}${r.died ? ' ✗ MORT' : ''}${r.timedOut ? ' ⌛' : ''}${r.stuck ? ' bloqué' : ''} or ${g.character.gold} pots ${r.potions}`,
    );
    if (r.death) console.log('   mort :', JSON.stringify(r.death));
    const tt = Object.entries(r.ttk)
      .map(([k, v]) => `${k} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}s×${v.length}`)
      .join(' ');
    console.log(
      `   TTK ${tt} | temps ${Object.entries(r.time)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${Math.round(v)}s`)
        .join(' ')}`,
    );
  },
});
const dir = join(process.cwd(), 'test-results', 'bots');
mkdirSync(dir, { recursive: true });
const file = join(dir, `progression-${build}-${seed}.json`);
writeFileSync(file, JSON.stringify(rep, null, 1));
const mm = (s: number) => `${(s / 60).toFixed(1)} min`;
console.log(
  `\nBuild ${build} seed ${seed} : niveau ${rep.finalLevel} en ${mm(rep.totalSeconds)} de jeu (${rep.runs.length} runs, ${rep.deaths.length} morts) — calcul ${((Date.now() - t0) / 1000).toFixed(1)} s`,
);
console.log(
  'Niveaux :',
  Object.entries(rep.levelTimes)
    .map(([l, t]) => `${l}@${mm(t)}`)
    .join(' '),
);
console.log('Premières fois :', JSON.stringify(rep.firsts));
console.log('Équipement :', rep.equipped.join(', '));
console.log(`Rapport : ${file}`);
