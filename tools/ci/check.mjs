/**
 * Lot 299 (owner: "the tests take too long while the game is being built; all of them again once it is well along"): two levels of checks.
 *
 *   npm run check:fast   the files changed since HEAD (and untracked ones): typecheck (whole project: types cross files), ESLint and
 *                        Prettier on the changed files only, and the unit tests that import them (`vitest related`) plus the changed tests
 *   npm run check:full   everything, as CI and the pre-deploy check: typecheck, ESLint, Prettier, the whole unit suite, `npm run vanilla`,
 *                        `npm run mods:suppression` (fingerprints and e2e stay their own commands: see CONTRIBUTING.md)
 *
 * `--base <ref>`: compare with another ref than HEAD (`--base origin/main` for a branch). Each step prints its duration.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const full = args.includes('--full');
const bi = args.indexOf('--base');
const base = bi >= 0 && args[bi + 1] ? args[bi + 1] : 'HEAD';
const times = [];
let failed = 0;

function step(name, cmd, argv) {
  const t0 = Date.now();
  // Windows: Node refuses to spawn a .cmd without a shell (EINVAL since Node 20.12 / 18.20)
  const r = spawnSync(cmd, argv, { stdio: 'inherit', shell: process.platform === 'win32' });
  const s = (Date.now() - t0) / 1000;
  times.push([name, s, r.status === 0]);
  if (r.status !== 0) failed++;
  console.log(`${r.status === 0 ? '✓' : '✗'} ${name} (${s.toFixed(1)} s)`);
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).split('\n').filter(Boolean);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (full) {
  step('typecheck', npm, ['run', '-s', 'typecheck']);
  step('eslint', npx, ['eslint', '.']);
  step('prettier', npm, ['run', '-s', 'format:check']);
  step('unit (whole suite)', npx, ['vitest', 'run', '--project', 'unit']);
  step('vanilla', npm, ['run', '-s', 'vanilla']);
  step('mods:suppression', npm, ['run', '-s', 'mods:suppression']);
} else {
  const changed = [...new Set([...git('diff', '--name-only', base), ...git('ls-files', '--others', '--exclude-standard')])].filter((f) => existsSync(f));
  const code = changed.filter((f) => /\.(ts|mjs|js)$/.test(f) && /^(src|api|server|tests|tools|mods)\//.test(f));
  console.log(`${changed.length} changed file(s), ${code.length} of code (since ${base})`);
  step('typecheck', npm, ['run', '-s', 'typecheck']);
  if (code.length) {
    step('eslint (changed)', npx, ['eslint', ...code]);
    step('prettier (changed)', npx, ['prettier', '--check', ...code]);
    const tests = code.filter((f) => /\.test\.ts$/.test(f) && !/\/tests\/(bots|build)\//.test(f));
    const sources = code.filter((f) => !/\.test\.ts$/.test(f));
    // the tests importing a changed source (vitest's module graph), and the changed tests themselves
    if (sources.length) step('unit (related)', npx, ['vitest', 'related', '--run', '--project', 'unit', '--passWithNoTests', ...sources, ...tests]);
    else if (tests.length) step('unit (changed tests)', npx, ['vitest', 'run', '--project', 'unit', ...tests]);
  }
}
const total = times.reduce((a, [, s]) => a + s, 0);
console.log(`\n${full ? 'check:full' : 'check:fast'}: ${times.map(([n, s]) => `${n} ${s.toFixed(0)} s`).join(' · ')} — ${total.toFixed(0)} s${failed ? `, ${failed} failed` : ''}`);
process.exit(failed ? 1 : 0);
