/**
 * Update check of the installed application (lot 297, owner's report: "Searching…" sometimes very long, sometimes failing oddly).
 * Causes found (lot 290's check was `registration.update()` alone): no timeout on it (a slow or half-dead network kept "Searching…" for
 * minutes), the whole new version's download (≈ 390 files, 6 MB) counted as "searching" then cut at 60 s and told "Up to date", a failed
 * download told "Up to date" too, a tap before the service worker's registration told "impossible", offline known by `navigator.onLine` only.
 * Now: the server's `version.json` (written by the build, never cached by the service worker, `no-store`) asked with a net timeout and one
 * retry, compared with the running version (asked of the service worker in control); only a different version downloads the new worker,
 * its progress told by the worker itself (`INSTALL_PROGRESS`), a download that stalls fails. Pure helpers here (unit tests), the flow in
 * `registerServiceWorker` (platform.ts).
 */

/** Why a check failed (the message told to the player) */
export type UpdateFailure = 'offline' | 'unreachable' | 'server' | 'download' | 'install';

/** One request's timeout (ms) */
export const CHECK_TIMEOUT_MS = 8000;
/** Retries after a first failed request (a timeout, a network error, a server error) */
export const CHECK_RETRIES = 1;
/** Pause before a retry (ms) */
export const CHECK_RETRY_DELAY_MS = 800;
/** A download with no progress for that long fails (ms): never "downloading" forever */
export const DOWNLOAD_STALL_MS = 30000;
/** `registration.update()` (the new worker's script) bounded too (ms) */
export const SW_UPDATE_TIMEOUT_MS = 15000;

export type VersionAnswer = { ok: true; version: string } | { ok: false; reason: UpdateFailure };

export interface VersionFetchOptions {
  url: string;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** `navigator.onLine` (false: offline for sure; true says nothing) */
  online: () => boolean;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Cache-busting query (tests: fixed) */
  now?: () => number;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One request for `version.json`: no HTTP cache, a query that no CDN nor cache matches, aborted after `timeoutMs` */
async function askOnce(o: VersionFetchOptions, timeoutMs: number): Promise<VersionAnswer> {
  if (!o.online()) return { ok: false, reason: 'offline' };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const sep = o.url.includes('?') ? '&' : '?';
    const res = await o.fetch(`${o.url}${sep}t=${(o.now ?? Date.now)()}`, { cache: 'no-store', signal: ctl.signal, credentials: 'same-origin' });
    // a page received in its place (a captive portal, a server's fallback) or an error: the server is not answering properly
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return { ok: false, reason: 'server' };
    const body = (await res.json().catch(() => null)) as { version?: unknown } | null;
    return typeof body?.version === 'string' && body.version ? { ok: true, version: body.version } : { ok: false, reason: 'server' };
  } catch {
    // a network error: offline when the browser says so, the server unreachable otherwise (a timeout included)
    return { ok: false, reason: o.online() ? 'unreachable' : 'offline' };
  } finally {
    clearTimeout(t);
  }
}

/** The server's version: `1 + retries` requests at most, each bounded; offline is told at once (no retry) */
export async function fetchServerVersion(o: VersionFetchOptions): Promise<VersionAnswer> {
  const retries = o.retries ?? CHECK_RETRIES;
  const sleep = o.sleep ?? wait;
  let last: VersionAnswer = { ok: false, reason: 'unreachable' };
  for (let i = 0; i <= retries; i++) {
    if (i) await sleep(o.retryDelayMs ?? CHECK_RETRY_DELAY_MS);
    last = await askOnce(o, o.timeoutMs ?? CHECK_TIMEOUT_MS);
    if (last.ok || last.reason === 'offline') return last;
  }
  return last;
}

/** `p` or `fallback` after `ms` (the timer cleared either way) */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p.finally(() => clearTimeout(t)), new Promise<T>((r) => (t = setTimeout(() => r(fallback), ms)))]);
}

/** Version of the service worker in control (`VERSION` message), null when none answers (no controller, or a worker older than lot 297) */
export function askWorkerVersion(sw: ServiceWorker | null | undefined, ms = 1500): Promise<string | null> {
  if (!sw || typeof MessageChannel === 'undefined') return Promise.resolve(null);
  const ch = new MessageChannel();
  const answer = new Promise<string | null>((res) => {
    ch.port1.onmessage = (e: MessageEvent) => res(typeof e.data?.version === 'string' ? e.data.version : null);
  });
  try {
    sw.postMessage({ type: 'VERSION' }, [ch.port2]);
  } catch {
    return Promise.resolve(null);
  }
  return withTimeout(answer, ms, null).finally(() => ch.port1.close());
}

/** What the new worker's download tells (`INSTALL_PROGRESS`): a fraction 0..1 */
export function progressOf(done: number, total: number): number {
  return total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
}

/**
 * Watches a new worker's download until it is installed (true) or fails (false: redundant, or no progress for `stallMs`). `onProgress`
 * is the page's `INSTALL_PROGRESS` listener's hook: each call pushes the stall timer back.
 */
export function watchInstall(sw: ServiceWorker, stallMs: number, hook: (onProgress: () => void) => () => void): Promise<boolean> {
  return new Promise<boolean>((res) => {
    let t: ReturnType<typeof setTimeout> | undefined;
    let unhook: () => void = () => undefined;
    const done = (v: boolean) => {
      clearTimeout(t);
      unhook();
      sw.removeEventListener('statechange', onState);
      res(v);
    };
    const arm = () => {
      clearTimeout(t);
      t = setTimeout(() => done(false), stallMs);
    };
    const onState = () => {
      if (sw.state === 'installed' || sw.state === 'activating' || sw.state === 'activated') done(true);
      else if (sw.state === 'redundant') done(false);
      else arm();
    };
    sw.addEventListener('statechange', onState);
    unhook = hook(arm);
    arm();
    // the state may have changed before the listener (a download already over)
    if (sw.state !== 'installing') onState();
  });
}
