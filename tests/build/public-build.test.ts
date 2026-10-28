/**
 * Build public complet (`vite build`, une à deux minutes) : projet vitest `build`, hors de la suite unitaire ; lancé par le job
 * « suppression » de la CI (qui fait déjà des builds) et en fin de lot (`npm run test:build`).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { START_BUDGET_KB, startupSize } from '../../tools/ci/bundle-budget.mjs';

describe('build public : aucune adresse de serveur en dur', () => {
  const out = mkdtempSync(join(tmpdir(), 'pub-build-'));
  afterAll(() => rmSync(out, { recursive: true, force: true }));
  it('ni STATS_API_URL, ni adresse de service, ni hôte du modèle ; le client appelle un chemin relatif', () => {
    const SENTINEL = 'https://sentinel-stats.invalid';
    execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], {
      env: { ...process.env, D2_SPRITES: '0', D2_PUBLIC: '1', STATS_API_URL: SENTINEL, GUILD_API_URL: 'https://sentinel-guild.invalid' },
      stdio: 'pipe',
      shell: process.platform === 'win32', // npx est un .cmd sous Windows
      timeout: 170_000,
    });
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
    const text = walk(out).filter((f) => /\.(js|css|html|json|webmanifest)$/.test(f));
    const all = text.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(all).toContain('/stats-api');
    expect(all).not.toMatch(/sentinel-(stats|guild)/);
    expect(all).not.toMatch(/STATS_API_URL|STATS_ADMIN_TOKEN|stats\.example|guild\.example|remote\.example/);
    expect(all).not.toMatch(/127\.0\.0\.1|localhost|:5330|:5320/);
    // le chemin d’appel est relatif : pas de schéma devant /stats-api
    expect(all).not.toMatch(/https?:\/\/[^'"`\s]*stats-api/);
    // avis de licence des paquets embarqués (lot 252), hors du pré-cache du service worker
    const lic = readFileSync(join(out, 'THIRD_PARTY_LICENSES.txt'), 'utf8');
    expect(lic).toMatch(/^- pixi\.js \d+\.\d+\.\d+ \(MIT\)$/m);
    expect(lic).toContain('Copyright');
    expect(readFileSync(join(out, 'sw.js'), 'utf8')).not.toContain('THIRD_PARTY_LICENSES');
    // chargement de départ (module d'entrée et ses imports statiques) sous le budget : un import statique de trop se voit ici
    const start = startupSize(out);
    expect(start.gzip, `${start.chunks.length} fichiers, ${Math.round(start.gzip / 1024)} Ko gzip`).toBeLessThan(START_BUDGET_KB * 1024);
  }, 180_000);
});
