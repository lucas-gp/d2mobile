/**
 * Point d'entrée HTTP de la synchronisation (api/sync.ts) : origine, méthode, configuration, taille et forme du corps, adresse du client,
 * erreurs sans détail. Le stockage Vercel Blob est remplacé par un stockage en mémoire.
 */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Store } from '../../api/_lib/core';

const mem = new Map<string, { data: Uint8Array; etag: string }>();
let failGet = false;
vi.mock('../../api/_lib/blob-store.js', () => ({
  blobStore: (): Store => ({
    async get(p) {
      if (failGet) throw new Error('stockage indisponible : secret=abc');
      return mem.get(p) ?? null;
    },
    async put(p, data) {
      const etag = `e${mem.size + 1}`;
      mem.set(p, { data, etag });
      return { etag };
    },
    async del(ps) {
      for (const p of ps) mem.delete(p);
    },
    async list(prefix) {
      return [...mem.keys()].filter((k) => k.startsWith(prefix));
    },
  }),
}));

const { default: handler } = await import('../../api/sync');
const { resetRateLimits } = await import('../../api/_lib/core');

interface Reply {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

function request(opts: { method?: string; headers?: Record<string, string>; body?: string | Buffer; parsed?: unknown; remote?: string }): IncomingMessage {
  const chunks = opts.body === undefined ? [] : [Buffer.from(opts.body)];
  const req = Readable.from(chunks) as unknown as IncomingMessage & { body?: unknown };
  req.method = opts.method ?? 'POST';
  req.headers = { host: 'jeu.example', ...(opts.headers ?? {}) };
  (req as unknown as { socket: { remoteAddress?: string } }).socket = { remoteAddress: opts.remote ?? '10.0.0.9' };
  if (opts.parsed !== undefined) req.body = opts.parsed;
  return req;
}

async function call(opts: Parameters<typeof request>[0]): Promise<Reply> {
  const headers: Record<string, string> = {};
  const out: Reply = { status: 0, headers, body: undefined };
  const res = {
    statusCode: 0,
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = String(v);
    },
    end(b?: string) {
      out.status = res.statusCode;
      out.body = b === undefined ? undefined : JSON.parse(b);
    },
  };
  await handler(request(opts), res as unknown as ServerResponse);
  return out;
}

const ENV = { SYNC_PEPPER: 'p'.repeat(40), BLOB_READ_WRITE_TOKEN: 'jeton-de-test', VERCEL_ENV: 'production', SYNC_ALLOWED_ORIGINS: 'https://jeu.example, https://autre.example' };

describe('POST /api/sync (couche HTTP)', () => {
  beforeEach(() => {
    mem.clear();
    failGet = false;
    resetRateLimits();
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('refuse une origine inconnue, accepte le même hôte et les origines listées (en-têtes CORS)', async () => {
    expect((await call({ headers: { origin: 'https://pirate.example' }, body: '{}' })).status).toBe(403);
    const ok = await call({ headers: { origin: 'https://autre.example' }, body: JSON.stringify({ action: 'params', name: 'alice_1' }) });
    expect(ok.status).toBe(200);
    expect(ok.headers['access-control-allow-origin']).toBe('https://autre.example');
    expect(ok.headers['cache-control']).toContain('no-store');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
  });

  it('OPTIONS : 204 sans corps ; autre méthode que POST : 405', async () => {
    const pre = await call({ method: 'OPTIONS', headers: { origin: 'https://jeu.example' } });
    expect(pre.status).toBe(204);
    expect(pre.body).toBeUndefined();
    expect(pre.headers['access-control-allow-methods']).toBe('POST, OPTIONS');
    expect((await call({ method: 'GET' })).status).toBe(405);
  });

  it('503 si le secret serveur manque ou est trop court, ou sans jeton de stockage', async () => {
    vi.stubEnv('SYNC_PEPPER', 'court');
    expect((await call({ body: '{}' })).body).toEqual({ error: 'not_configured' });
    vi.stubEnv('SYNC_PEPPER', ENV.SYNC_PEPPER);
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    expect((await call({ body: '{}' })).status).toBe(503);
  });

  it('413 pour un corps annoncé ou réel trop gros, 400 pour un JSON invalide', async () => {
    expect((await call({ headers: { 'content-length': '5000000' }, body: '{}' })).status).toBe(413);
    const big = await call({ body: Buffer.alloc(3_900_000, 32) });
    expect(big).toMatchObject({ status: 413, body: { error: 'too_large' } });
    expect((await call({ body: '{pas du json' })).body).toEqual({ error: 'bad_request' });
  });

  it('accepte un corps déjà analysé par la plateforme', async () => {
    const r = await call({ parsed: { action: 'params', name: 'bob_22' } });
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('salt');
  });

  it('limite par adresse : la première entrée de X-Forwarded-For, sinon l’adresse de la connexion', async () => {
    const params = (remote: string, xff?: string) => call({ remote, headers: xff ? { 'x-forwarded-for': xff } : {}, body: JSON.stringify({ action: 'params', name: 'zed_9' }) });
    const statuses: number[] = [];
    for (let i = 0; i < 125; i++) statuses.push((await params('10.0.0.1', '203.0.113.5, 10.0.0.1')).status);
    expect(statuses.slice(0, 120).every((x) => x === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    // même connexion, autre client derrière le proxy : pas limité ; sans X-Forwarded-For, c'est l'adresse de la connexion qui compte
    expect((await params('10.0.0.1', '198.51.100.7')).status).toBe(200);
    expect((await params('10.0.0.1')).status).toBe(200);
  });

  it('une erreur du stockage donne 500 sans détail', async () => {
    failGet = true;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await call({ body: JSON.stringify({ action: 'params', name: 'carl_3' }) });
    expect(r).toMatchObject({ status: 500, body: { error: 'server' } });
    expect(JSON.stringify(r.body)).not.toContain('secret');
    expect(spy).toHaveBeenCalledWith('sync error', 'Error');
    spy.mockRestore();
  });
});
