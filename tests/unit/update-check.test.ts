// @vitest-environment happy-dom
/**
 * Update check (lot 297, owner's report: "Searching…" sometimes very long, sometimes failing oddly): the server's version asked with a
 * net timeout and one retry, its failures told precisely (offline, unreachable, server), a download that stalls fails, the buttons' view
 * of every state (labels FR, bar, busy), a discreet launch check, the menu's button sized for its longest label.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHECK_TIMEOUT_MS, fetchServerVersion, progressOf, watchInstall, withTimeout } from '../../src/platform/update-check';
import { MENU_UPDATE_LABELS, MENU_UPDATE_WIDEST, SETTINGS_UPDATE_LABELS, updateView } from '../../src/ui/update-link';
import { appUpdate, type UpdateStatus } from '../../src/platform/platform';

const json = (body: unknown, status = 200, type = 'application/json') => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': type } });
const noSleep = async () => undefined;

afterEach(() => vi.useRealTimers());

describe('fetchServerVersion', () => {
  it('asks version.json without cache, a query no cache matches, and reads its version', async () => {
    const calls: [string, RequestInit][] = [];
    const r = await fetchServerVersion({ url: '/version.json', fetch: async (u, i) => (calls.push([u, i]), json({ version: 'abc' })), online: () => true, now: () => 42 });
    expect(r).toEqual({ ok: true, version: 'abc' });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('/version.json?t=42');
    expect(calls[0][1].cache).toBe('no-store');
    expect(calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('offline: told at once, no request', async () => {
    const f = vi.fn();
    expect(await fetchServerVersion({ url: '/v', fetch: f, online: () => false })).toEqual({ ok: false, reason: 'offline' });
    expect(f).not.toHaveBeenCalled();
  });

  it('a network error then success: one retry', async () => {
    let n = 0;
    const r = await fetchServerVersion({ url: '/v', fetch: async () => (n++ ? json({ version: 'b' }) : Promise.reject(new TypeError('Failed to fetch'))), online: () => true, sleep: noSleep });
    expect(r).toEqual({ ok: true, version: 'b' });
    expect(n).toBe(2);
  });

  it('a slow server: each request aborted after the timeout, two at most, "unreachable"', async () => {
    vi.useFakeTimers();
    let n = 0;
    const hang = (_u: string, i: RequestInit) =>
      new Promise<Response>((_, rej) => {
        n++;
        i.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
      });
    const p = fetchServerVersion({ url: '/v', fetch: hang, online: () => true, sleep: noSleep });
    await vi.advanceTimersByTimeAsync(CHECK_TIMEOUT_MS * 2 + 10);
    expect(await p).toEqual({ ok: false, reason: 'unreachable' });
    expect(n).toBe(2);
  });

  it('a server error, a page instead of the file, a file without version: "server"', async () => {
    for (const res of [json({}, 500), new Response('<html>', { headers: { 'Content-Type': 'text/html' } }), json({ v: 1 }), new Response('nope')]) {
      const r = await fetchServerVersion({ url: '/v', fetch: async () => res.clone(), online: () => true, sleep: noSleep });
      expect(r).toEqual({ ok: false, reason: 'server' });
    }
  });

  it('the connection lost during the request: "offline", no retry', async () => {
    let on = true;
    let n = 0;
    const r = await fetchServerVersion({
      url: '/v',
      fetch: async () => {
        n++;
        on = false;
        throw new TypeError('Failed to fetch');
      },
      online: () => on,
      sleep: noSleep,
    });
    expect(r).toEqual({ ok: false, reason: 'offline' });
    expect(n).toBe(1);
  });
});

describe('bounded steps', () => {
  it('withTimeout: the value, or the fallback after the delay', async () => {
    vi.useFakeTimers();
    expect(await withTimeout(Promise.resolve(1), 100, 0)).toBe(1);
    const p = withTimeout(new Promise<number>(() => undefined), 100, 0);
    await vi.advanceTimersByTimeAsync(101);
    expect(await p).toBe(0);
  });

  it('progressOf: a fraction 0..1', () => {
    expect(progressOf(5, 10)).toBe(0.5);
    expect(progressOf(12, 10)).toBe(1);
    expect(progressOf(1, 0)).toBe(0);
  });

  class FakeWorker extends EventTarget {
    state: ServiceWorkerState = 'installing';
    to(s: ServiceWorkerState) {
      this.state = s;
      this.dispatchEvent(new Event('statechange'));
    }
  }

  it('watchInstall: installed → true; redundant (a file failed) → false', async () => {
    const a = new FakeWorker();
    const pa = watchInstall(a as unknown as ServiceWorker, 1000, () => () => undefined);
    a.to('installed');
    expect(await pa).toBe(true);
    const b = new FakeWorker();
    const pb = watchInstall(b as unknown as ServiceWorker, 1000, () => () => undefined);
    b.to('redundant');
    expect(await pb).toBe(false);
  });

  it('watchInstall: progress pushes the stall timer back, no progress for the delay fails', async () => {
    vi.useFakeTimers();
    const w = new FakeWorker();
    let tick = () => undefined as void;
    let unhooked = false;
    const p = watchInstall(w as unknown as ServiceWorker, 1000, (on) => {
      tick = on;
      return () => (unhooked = true);
    });
    let settled = false;
    void p.then(() => (settled = true));
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(800);
      tick();
    }
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toBe(false);
    expect(unhooked).toBe(true);
  });

  it('watchInstall: a worker already installed resolves at once', async () => {
    const w = new FakeWorker();
    w.state = 'installed';
    expect(await watchInstall(w as unknown as ServiceWorker, 1000, () => () => undefined)).toBe(true);
  });
});

describe('the buttons’ view', () => {
  const st = (status: UpdateStatus, o: Partial<{ failure: never; progress: number; quiet: boolean }> = {}) => ({ status, failure: null, progress: -1, quiet: false, ...o });

  it('every state: its text, busy and bar', () => {
    expect(updateView(MENU_UPDATE_LABELS, st('checking'))).toEqual({ text: 'Vérification…', busy: true, bar: -1, state: 'checking' });
    expect(updateView(MENU_UPDATE_LABELS, st('downloading', { progress: 0.456 }))).toEqual({ text: 'Téléchargement 46 %', busy: true, bar: 0.456, state: 'downloading' });
    expect(updateView(SETTINGS_UPDATE_LABELS, st('downloading', { progress: 1 })).text).toBe('Téléchargement de la mise à jour : 100 %');
    expect(updateView(MENU_UPDATE_LABELS, st('installing', { progress: 0.4 }))).toMatchObject({ text: 'Installation…', busy: true, bar: 0.4 });
    expect(updateView(MENU_UPDATE_LABELS, st('restarting', { progress: 1 }))).toMatchObject({ text: 'Redémarrage…', busy: true, bar: 1 });
    expect(updateView(MENU_UPDATE_LABELS, st('uptodate'))).toEqual({ text: 'À jour', busy: false, bar: null, state: 'uptodate' });
    expect(updateView(MENU_UPDATE_LABELS, st('available'))).toMatchObject({ busy: false, bar: null });
  });

  it('failures: a precise text by cause (offline, unreachable, server, download, install), a retry', () => {
    for (const f of ['offline', 'unreachable', 'server', 'download', 'install'] as const) {
      const v = updateView(MENU_UPDATE_LABELS, { status: 'error', failure: f, progress: -1, quiet: false });
      expect(v.state).toBe(`error-${f}`);
      expect(v.text).toMatch(/Réessayer$/);
      expect(v.busy).toBe(false);
      expect(updateView(SETTINGS_UPDATE_LABELS, { status: 'error', failure: f, progress: -1, quiet: false }).text).toMatch(/réessayer$/);
    }
    expect(updateView(MENU_UPDATE_LABELS, { status: 'error', failure: 'offline', progress: -1, quiet: false }).text).toBe('Hors ligne · Réessayer');
  });

  it('the launch’s check is discreet: the button at rest; a download found is shown', () => {
    expect(updateView(MENU_UPDATE_LABELS, st('checking', { quiet: true }))).toEqual({ text: 'Vérifier les mises à jour', busy: false, bar: null, state: 'idle' });
    expect(updateView(MENU_UPDATE_LABELS, st('downloading', { quiet: true, progress: 0.2 })).bar).toBe(0.2);
  });

  it('the menu’s button is sized for its longest label (no text cut when the state changes)', () => {
    for (const t of [...Object.values(MENU_UPDATE_LABELS.status), ...Object.values(MENU_UPDATE_LABELS.failure)]) expect(t.length).toBeLessThanOrEqual(MENU_UPDATE_WIDEST.length);
    expect(MENU_UPDATE_WIDEST.length).toBeLessThanOrEqual(26);
  });
});

describe('the bound button (DOM)', () => {
  it('follows appUpdate: label, aria-busy, progressbar value; one listener per button, gone once replaced', async () => {
    const { bindUpdateButton } = await import('../../src/ui/update-link');
    const b = bindUpdateButton(document.createElement('button'));
    document.body.appendChild(b);
    const n0 = appUpdate.listeners.size;
    appUpdate.set('downloading', { progress: 0.3 });
    const bar = b.querySelector('.upd-bar') as HTMLElement;
    expect(b.querySelector('.upd-lbl')!.textContent).toBe('Téléchargement 30 %');
    expect(b.getAttribute('aria-busy')).toBe('true');
    expect(bar.getAttribute('role')).toBe('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('30');
    expect(bar.hidden).toBe(false);
    appUpdate.set('checking');
    expect(bar.classList.contains('ind')).toBe(true);
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    appUpdate.set('error', { failure: 'unreachable' });
    expect(b.textContent).toBe('Injoignable · Réessayer');
    expect(b.getAttribute('aria-busy')).toBe('false');
    expect(bar.hidden).toBe(true);
    b.remove();
    appUpdate.set('idle');
    expect(appUpdate.listeners.size).toBe(n0 - 1);
  });

  it('a tap during the discreet launch check joins it (no second check)', async () => {
    const { tapUpdate } = await import('../../src/ui/update-link');
    const check = vi.fn(async () => undefined);
    const saved = appUpdate.check;
    appUpdate.check = check;
    appUpdate.status = 'checking';
    appUpdate.quiet = true;
    tapUpdate(true);
    expect(check).toHaveBeenCalledTimes(1);
    appUpdate.quiet = false;
    tapUpdate(true);
    expect(check).toHaveBeenCalledTimes(1);
    appUpdate.check = saved;
    appUpdate.set('idle');
  });
});
