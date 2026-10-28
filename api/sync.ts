/**
 * POST /api/sync — synchronisation chiffrée des sauvegardes (compte sans e-mail, zéro connaissance).
 * Fonction serverless Vercel (Node). Logique : api/_lib/core.ts.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { blobStore } from './_lib/blob-store.js';
import { handle, type Res } from './_lib/core.js';

const MAX_BODY = 3_800_000; // 2 Mo de blob en base64 + enveloppe (limite Vercel : 4,5 Mo)
// Aucune origine publique par défaut : SYNC_ALLOWED_ORIGINS (liste séparée par des virgules) déclare les domaines du jeu ; le même hôte est toujours accepté.
const DEFAULT_ORIGINS: string[] = [];

function send(res: ServerResponse, status: number, body: unknown, origin?: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Vary', 'Origin');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

/** Origine autorisée : le site lui-même (même hôte), le domaine du jeu, et localhost hors production */
export function originAllowed(origin: string, host: string | undefined, env: Record<string, string | undefined>): boolean {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (host && u.host === host) return true;
  const list = (env.SYNC_ALLOWED_ORIGINS ? env.SYNC_ALLOWED_ORIGINS.split(',').map((s) => s.trim()) : DEFAULT_ORIGINS).filter(Boolean);
  if (list.includes(u.origin)) return true;
  return env.VERCEL_ENV !== 'production' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
}

/** Entier positif d'une variable d'environnement, sinon undefined (valeur par défaut de core.ts) */
export function envInt(v: string | undefined): number | undefined {
  const n = Number(v);
  return v && Number.isInteger(n) && n > 0 ? n : undefined;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const pre = (req as IncomingMessage & { body?: unknown }).body;
  if (pre && typeof pre === 'object' && !Buffer.isBuffer(pre)) return pre;
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > MAX_BODY) throw new Error('too_large');
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const origin = req.headers.origin;
  let allow: string | undefined;
  if (origin) {
    if (!originAllowed(origin, req.headers.host, process.env)) return send(res, 403, { error: 'origin' });
    allow = origin;
  }
  if (req.method === 'OPTIONS') return send(res, 204, undefined, allow);
  if (req.method !== 'POST') return send(res, 405, { error: 'method' }, allow);
  const pepper = process.env.SYNC_PEPPER;
  if (!pepper || pepper.length < 32 || !process.env.BLOB_READ_WRITE_TOKEN) return send(res, 503, { error: 'not_configured' }, allow);
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) return send(res, 413, { error: 'too_large' }, allow);
  let body: unknown;
  try {
    body = await readBody(req);
  } catch (e) {
    return send(res, (e as Error).message === 'too_large' ? 413 : 400, { error: (e as Error).message === 'too_large' ? 'too_large' : 'bad_request' }, allow);
  }
  const fwd = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')[0]
    .trim();
  const ip = fwd || req.socket?.remoteAddress || 'unknown';
  let out: Res;
  try {
    out = await handle(
      {
        store: blobStore(),
        pepper,
        now: Date.now,
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        maxAccounts: envInt(process.env.SYNC_MAX_ACCOUNTS),
        maxAccountBytes: envInt(process.env.SYNC_MAX_ACCOUNT_BYTES),
      },
      { ip, body },
    );
  } catch (e) {
    // jamais de détail (ni de secret) dans la réponse ; le journal ne garde que le type d'erreur
    console.error('sync error', (e as Error)?.name);
    out = { status: 500, body: { error: 'server' } };
  }
  send(res, out.status, out.body, allow);
}
