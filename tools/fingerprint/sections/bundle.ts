/**
 * Bundle (informatif, jamais compté comme un écart) : `vite build` complet puis public (`D2_PUBLIC=1`), tous deux avec `D2_SPRITES=0`
 * (aucun asset D2 copié), dans un dossier temporaire ; taille de chaque fichier émis (nom sans hachage) et empreinte de l'ensemble.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { sha1, type SectionResult } from '../lib';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

export async function run(): Promise<SectionResult> {
  const out: SectionResult = {};
  for (const [name, env] of [
    ['owner', {}],
    ['public', { D2_PUBLIC: '1' }],
  ] as const) {
    const dir = mkdtempSync(join(process.env.FP_TMP ?? tmpdir(), `fp-bundle-${name}-`));
    try {
      execFileSync('npx', ['vite', 'build', '--outDir', dir, '--emptyOutDir', '--logLevel', 'error'], {
        cwd: ROOT,
        env: { ...process.env, D2_SPRITES: '0', ...env },
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      const all = sha1(
        walk(dir)
          .map((f) => relative(dir, f) + ':' + sha1(readFileSync(f)))
          .join('\n'),
      );
      let total = 0;
      const sizes = new Map<string, number>();
      for (const f of walk(dir)) {
        const sz = statSync(f).size;
        total += sz;
        // nom stable : le hachage de contenu de Vite (`-AbC123xy`) retiré
        const k = relative(dir, f).replace(/-[A-Za-z0-9_-]{8}(\.[a-z0-9]+)$/, '$1');
        sizes.set(k, (sizes.get(k) ?? 0) + sz);
      }
      out[`${name}/total`] = String(total);
      out[`${name}/sha1`] = all;
      for (const [k, sz] of [...sizes].sort()) if (k.endsWith('.js') || k.endsWith('.css')) out[`${name}/${k}`] = String(sz);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return out;
}
