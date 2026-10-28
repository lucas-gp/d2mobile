/**
 * Test de suppression (plan des mods, lot M14) : le dépôt SANS `mods/` doit compiler, passer le lint et les tests de la base, et son build
 * public ne doit rien contenir du mod ; témoin : le build public AVEC le mod contient le chunk et les textes du mod (la recherche marche).
 * Ce qui n'est pas encore isolé est recensé par docs/internal/MODS-RESIDUEL.md (npm run mods:residual).
 *
 *   node tools/ci/suppression.mjs            copie du dépôt sans mods/ (fichiers suivis et non ignorés), contrôles, builds
 *   node tools/ci/suppression.mjs --e2e      en plus : jeu public lancé sans mod (serveur de développement 127.0.0.1:5233), personnage
 *                                            créé, run, sauvegarde, rechargement (tools/e2e/no-mods.mjs ; navigateur Playwright requis)
 *   node tools/ci/suppression.mjs --keep     garde le dossier temporaire (diagnostic)
 *
 * Une étape lourde à la fois. Dossier temporaire : $FP_TMP ou le dossier temporaire du système.
 */
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const args = new Set(process.argv.slice(2));
const env = { ...process.env, D2_SPRITES: '0', D2_PUBLIC: '1', TZ: 'UTC' };
delete env.MODS; // la copie n'a pas de mods/ : c'est la découverte seule qui doit les ignorer

let fails = 0;
const step = (what, fn) => {
  const t0 = Date.now();
  try {
    fn();
    console.log(`✓ ${what} (${Math.round((Date.now() - t0) / 1000)} s)`);
  } catch (e) {
    fails++;
    console.log(
      `✗ ${what} — ${String(e.message ?? e)
        .split('\n')
        .slice(0, 6)
        .join(' / ')}`,
    );
  }
};
const run = (cwd, cmd, a, extra = {}) =>
  execFileSync(cmd, a, { cwd, env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 << 20, shell: process.platform === 'win32' });

/** Textes propres aux mods : traductions (clé française et anglais) absentes de tout fichier de la base, au moins 8 caractères */
function sentinels() {
  const base = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|js|json|html|css)$/.test(f)) base.push(readFileSync(p, 'utf8'));
    }
  };
  walk(join(ROOT, 'src'));
  const all = base.join('\n');
  const out = new Set();
  for (const id of existsSync(join(ROOT, 'mods')) ? readdirSync(join(ROOT, 'mods')) : []) {
    const f = join(ROOT, 'mods', id, 'i18n/en.json');
    if (!existsSync(f)) continue;
    for (const [fr, en] of Object.entries(JSON.parse(readFileSync(f, 'utf8'))))
      for (const s of [fr, en]) if (s.length >= 8 && !/[{}]/.test(s) && !all.includes(s) && !all.includes(JSON.stringify(s).slice(1, -1))) out.add(s);
  }
  return [...out];
}

/** Fichiers texte d'un build */
function bundleText(dist) {
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(dist);
  return { names: files.map((f) => f.slice(dist.length + 1).replaceAll('\\', '/')), text: files.filter((f) => /\.(js|json|html|css)$/.test(f)).map((f) => readFileSync(f, 'utf8')) };
}
const found = (bundle, list) => list.filter((s) => bundle.text.some((t) => t.includes(s) || t.includes(JSON.stringify(s).slice(1, -1))));

const tmp = mkdtempSync(join(process.env.FP_TMP ?? tmpdir(), 'suppression-'));
const copy = join(tmp, 'repo');
console.log(`copie sans mods/ : ${copy}`);
const SENT = sentinels();
console.log(`${SENT.length} textes propres aux mods (sentinelles)`);
try {
  step('copie du dépôt sans mods/ (fichiers suivis et non ignorés)', () => {
    const list = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
    let n = 0;
    for (const f of list) {
      if (f === 'mods' || f.startsWith('mods/') || !existsSync(join(ROOT, f))) continue;
      mkdirSync(dirname(join(copy, f)), { recursive: true });
      cpSync(join(ROOT, f), join(copy, f));
      n++;
    }
    symlinkSync(join(ROOT, 'node_modules'), join(copy, 'node_modules'), 'junction'); // « junction » : sans droits spéciaux sous Windows, ignoré ailleurs
    if (existsSync(join(copy, 'mods'))) throw new Error('mods/ copié');
    console.log(`  ${n} fichiers`);
  });
  step('tsc --noEmit sans mods/', () => run(copy, 'npx', ['tsc', '--noEmit']));
  step('eslint sans mods/', () => run(copy, 'npx', ['eslint', '.']));
  step('tests de la base sans mods/ (vitest --project unit, 3 workers: the shared machine; vitest 5 has --maxWorkers, no --poolOptions)', () => {
    const out = run(copy, 'npx', ['vitest', 'run', '--project', 'unit', '--pool=forks', '--maxWorkers=3']);
    console.log(`  ${(/Test Files .*/.exec(out) ?? [''])[0].trim()} ; ${(/Tests .*/.exec(out) ?? [''])[0].trim()}`);
  });
  step('build public sans mods/ : aucun chunk ni texte du mod', () => {
    run(copy, 'npx', ['vite', 'build', '--outDir', join(tmp, 'dist-nomods')]);
    const b = bundleText(join(tmp, 'dist-nomods'));
    const chunks = b.names.filter((n) => /(^|\/)(pd2)-[^/]*\.js$/.test(n));
    const leak = found(b, SENT);
    if (chunks.length || leak.length) throw new Error(`chunks : ${chunks.join(', ') || 'aucun'} ; textes : ${leak.slice(0, 5).join(' | ')}${leak.length > 5 ? '…' : ''}`);
    console.log(`  ${b.names.length} fichiers, ${SENT.length} sentinelles absentes`);
  });
  step('témoin : build public avec les mods (dépôt) : chunk et textes du mod présents', () => {
    run(ROOT, 'npx', ['vite', 'build', '--outDir', join(tmp, 'dist-mods')]);
    const b = bundleText(join(tmp, 'dist-mods'));
    const chunks = b.names.filter((n) => /(^|\/)pd2-[^/]*\.js$/.test(n));
    const seen = found(b, SENT);
    if (existsSync(join(ROOT, 'mods/pd2')) && (!chunks.length || seen.length < SENT.length * 0.5))
      throw new Error(`chunk pd2 : ${chunks.length}, sentinelles trouvées : ${seen.length}/${SENT.length}`);
    console.log(`  chunk ${chunks.join(', ')} ; ${seen.length}/${SENT.length} sentinelles trouvées`);
  });
  if (args.has('--e2e'))
    step('e2e : jeu public sans mod (création, run, sauvegarde, rechargement)', () => {
      const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5233', '--strictPort'], { cwd: copy, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
      try {
        const t0 = Date.now();
        while (Date.now() - t0 < 60000) {
          try {
            execFileSync('curl', ['-sf', '-o', '/dev/null', 'http://127.0.0.1:5233/'], { stdio: 'ignore' });
            break;
          } catch {
            execFileSync('sleep', ['1']);
          }
        }
        const out = run(ROOT, 'node', [join(ROOT, 'tools/e2e/no-mods.mjs'), '--url=http://127.0.0.1:5233/']);
        console.log(out.replace(/^/gm, '  ').trimEnd());
      } finally {
        process.kill(-vite.pid, 'SIGTERM');
      }
    });
} finally {
  if (args.has('--keep')) console.log(`dossier gardé : ${tmp}`);
  else rmSync(tmp, { recursive: true, force: true });
}
console.log(fails ? `${fails} échec(s)` : 'test de suppression : OK');
process.exit(fails ? 1 : 0);
