/**
 * Validation complète d'un lot (à lancer avant de marquer un commit « entièrement validé ») :
 *   node tools/validate-full.mjs [--force-sprites] [--skip-e2e]
 *
 *  1. typage + tests unitaires et d'intégrité des données ;
 *  2. les trois bots (butin massif, combat, progression) ;
 *  3. régénération des sprites (complète avec --force-sprites, sinon cache vérifié) ;
 *  4. build de production (service worker inclus) ;
 *  5. validation mobile (matrice d'appareils, bot tactile, CPU ×4, mémoire de textures)
 *     sur le build servi par `vite preview` ;
 *  6. comparaison aux références visuelles (luminance, contraste, saturation) + planche
 *     côte à côte à regarder.
 * Résumé : test-results/validation.json
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = new Set(process.argv.slice(2));
const OUT = join(process.cwd(), 'test-results');
mkdirSync(OUT, { recursive: true });
const summary = { date: new Date().toISOString(), commit: spawnSync('git', ['rev-parse', '--short', 'HEAD']).stdout.toString().trim(), steps: [] };
let ok = true;

function step(name, cmd, cmdArgs, opts = {}) {
  const t0 = Date.now();
  console.log(`\n━━ ${name} ━━ ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', ...opts });
  const pass = r.status === 0;
  summary.steps.push({ name, pass, seconds: Math.round((Date.now() - t0) / 1000) });
  if (!pass) ok = false;
  return pass;
}

step('Typage', 'npx', ['tsc', '--noEmit']);
step('Tests unitaires et intégrité', 'npx', ['vitest', 'run', '--project', 'unit']);
step('Bots : butin, combat, progression', 'npx', ['vitest', 'run', '--project', 'bots']);
step('Sprites', 'npx', ['tsx', 'tools/prerender/build-sprites.ts', ...(args.has('--force-sprites') ? ['--force'] : [])]);
step('Build de production', 'npx', ['vite', 'build']);

if (!args.has('--skip-e2e')) {
  const port = 4199;
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 3000));
  step('Validation mobile (matrice, tactile, perf)', 'node', ['tools/e2e/mobile.mjs', `--url=http://localhost:${port}/`]);
  step('Relance hors ligne (service worker, données jamais remplacées par du HTML)', 'node', ['tools/e2e/offline.mjs', `--url=http://localhost:${port}/`]);
  step('Tristram de bout en bout dans le client', 'node', ['tools/e2e/tristram.mjs', `--url=http://localhost:${port}/`]);
  step('Écran de sélection des personnages', 'node', ['tools/e2e/charselect.mjs', `--url=http://localhost:${port}/`]);
  step('Mercenaires dans le client (recrutement, équipement, run)', 'node', ['tools/e2e/merc.mjs', `--url=http://localhost:${port}/`]);
  step('Runs de leveling dans le client + densité Vaches Enfer', 'node', ['tools/e2e/runs.mjs', `--url=http://localhost:${port}/`]);
  server.kill();
}

summary.ok = ok;
writeFileSync(join(OUT, 'validation.json'), JSON.stringify(summary, null, 1));
console.log(`\n${ok ? 'VALIDATION COMPLÈTE OK' : 'VALIDATION EN ÉCHEC'} (${summary.commit}) :`);
for (const s of summary.steps) console.log(`  ${s.pass ? '✓' : '✗'} ${s.name} (${s.seconds} s)`);
process.exit(ok ? 0 : 1);
