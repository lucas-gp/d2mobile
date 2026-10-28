/** En-têtes de sécurité du déploiement : présents et identiques dans vercel.json et vercel.example.json (modèle du déploiement) */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

type Cfg = { headers: { source: string; headers: { key: string; value: string }[] }[] };
const load = (f: string): Cfg => JSON.parse(readFileSync(f, 'utf8')) as Cfg;
const all = (c: Cfg) => Object.fromEntries(c.headers.find((h) => h.source === '/(.*)')!.headers.map((h) => [h.key, h.value]));

describe('en-têtes de sécurité (Vercel)', () => {
  for (const f of ['vercel.json', 'vercel.example.json']) {
    it(`${f} : CSP stricte et en-têtes de durcissement`, () => {
      const h = all(load(f));
      const csp = h['Content-Security-Policy'];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("worker-src 'self' blob:");
      expect(csp).not.toMatch(/unsafe-eval/);
      expect(csp.match(/script-src[^;]*/)![0]).toBe("script-src 'self'");
      expect(h['X-Content-Type-Options']).toBe('nosniff');
      expect(h['X-Frame-Options']).toBe('DENY');
      expect(h['Referrer-Policy']).toBe('no-referrer');
      expect(h['Permissions-Policy']).toContain('camera=()');
    });
  }
  it('les deux fichiers portent exactement les mêmes en-têtes globaux', () => {
    expect(all(load('vercel.json'))).toEqual(all(load('vercel.example.json')));
  });
});
