import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildVercelConfig, VERCEL_CLI } from '../../tools/deploy-config.mjs';

const example = JSON.parse(readFileSync('vercel.example.json', 'utf8'));
const env = { GUILD_API_URL: 'https://g.test/', D2_REMOTE_ORIGIN: 'https://r.test', STATS_API_URL: 'https://s.test' };
const sources = (c: { rewrites?: { source: string }[] }) => (c.rewrites ?? []).map((r) => r.source);

describe('configuration de déploiement : /stats-api', () => {
  it('le modèle contient la réécriture et les en-têtes sans cache de /stats-api', () => {
    expect(sources(example)).toContain('/stats-api/:path*');
    expect(example.headers.some((h: { source: string }) => h.source === '/stats-api/(.*)')).toBe(true);
    // la CSP du site n’a pas besoin d’autre origine : le service est joint en même origine
    const csp = example.headers[0].headers[0].value as string;
    expect(csp).toMatch(/connect-src 'self' /);
    expect(csp).not.toMatch(/https?:/);
  });

  it('--code : /stats-api réécrit vers STATS_API_URL, avec guilde et /d2', () => {
    const c = buildVercelConfig(example, { isPublic: false, codeOnly: true, env });
    expect(c.rewrites).toContainEqual({ source: '/stats-api/:path*', destination: 'https://s.test/:path*' });
    expect(sources(c)).toEqual(expect.arrayContaining(['/guild-api/:path*', '/d2/:path*']));
  });

  it('build complet sans --code : même chose, sans /d2 si D2_REMOTE_ORIGIN est absent', () => {
    const c = buildVercelConfig(example, { isPublic: false, codeOnly: false, env: { STATS_API_URL: 'https://s.test' } });
    expect(sources(c)).toEqual(['/stats-api/:path*']);
  });

  it('--public : ni /guild-api ni /d2, mais /stats-api quand STATS_API_URL est défini', () => {
    const c = buildVercelConfig(example, { isPublic: true, codeOnly: false, env });
    expect(sources(c)).toEqual(['/stats-api/:path*']);
    expect(c.rewrites![0].destination).toBe('https://s.test/:path*');
    expect(c.functions).toBeUndefined();
    expect(c.headers!.map((h) => h.source)).not.toContain('/guild-api/(.*)');
    expect(c.headers!.map((h) => h.source)).toContain('/stats-api/(.*)');
  });

  it('--public sans STATS_API_URL : aucune réécriture du tout', () => {
    const c = buildVercelConfig(example, { isPublic: true, codeOnly: false, env: { GUILD_API_URL: 'https://g.test', D2_REMOTE_ORIGIN: 'https://r.test' } });
    expect(c.rewrites).toBeUndefined();
  });
});

describe('déploiement : CLI Vercel épinglée (lot 249)', () => {
  it('version exacte, jamais @latest ni une plage', () => {
    expect(VERCEL_CLI).toMatch(/^vercel@\d+\.\d+\.\d+$/);
    const src = readFileSync('tools/deploy.mjs', 'utf8');
    expect(src).not.toMatch(/vercel@latest/);
    expect(src).toMatch(/umask\(0o077\)/);
  });
});
