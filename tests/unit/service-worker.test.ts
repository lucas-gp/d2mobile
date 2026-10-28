/** Service worker (modèle sw-template.js) : cache-first des fichiers D2 chiffrés, purge des anciennes empreintes, quota */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { LEGACY_PREFIX } from '../../src/platform/legacy-names';

type Handler = (e: { request?: unknown; respondWith?(p: Promise<Response>): void; waitUntil?(p: Promise<unknown>): void; data?: unknown }) => void;

class FakeCache {
  map = new Map<string, Response>();
  failPut = false;
  async match(req: { url: string } | string, opts?: { ignoreSearch?: boolean }): Promise<Response | undefined> {
    const u = typeof req === 'string' ? req : req.url;
    if (opts?.ignoreSearch) {
      for (const [k, v] of this.map) if (k.split('?')[0] === u.split('?')[0]) return v.clone();
      return undefined;
    }
    return this.map.get(u)?.clone();
  }
  async put(req: { url: string } | string, res: Response): Promise<void> {
    if (this.failPut) {
      const e = new Error('quota');
      e.name = 'QuotaExceededError';
      throw e;
    }
    this.map.set(typeof req === 'string' ? req : req.url, res);
  }
  async delete(req: { url: string }): Promise<boolean> {
    return this.map.delete(req.url);
  }
  async keys(req?: { url: string } | string, opts?: { ignoreSearch?: boolean }): Promise<{ url: string }[]> {
    const all = [...this.map.keys()].map((url) => ({ url }));
    if (!req || !opts?.ignoreSearch) return all;
    const base = (typeof req === 'string' ? req : req.url).split('?')[0];
    return all.filter((k) => k.url.split('?')[0] === base);
  }
}

function boot(network: (url: string) => Response | null, core: string[] = []) {
  const stores = new Map<string, FakeCache>();
  const handlers: Record<string, Handler> = {};
  const told: unknown[] = [];
  const caches = {
    open: async (n: string) => stores.get(n) ?? (stores.set(n, new FakeCache()), stores.get(n)!),
    keys: async () => [...stores.keys()],
    has: async (n: string) => stores.has(n),
    delete: async (n: string) => stores.delete(n),
  };
  const self = {
    addEventListener: (t: string, h: Handler) => (handlers[t] = h),
    clients: { matchAll: async () => [{ postMessage: (m: unknown) => told.push(m) }], claim: async () => undefined },
    skipWaiting: () => undefined,
  };
  let netCalls = 0;
  const ctx = vm.createContext({
    self,
    caches,
    location: { origin: 'http://h' },
    URL,
    Response,
    Request: class {
      url: string;
      cache: string;
      constructor(u: string, i: { cache?: string } = {}) {
        this.url = u;
        this.cache = i.cache ?? 'default';
      }
    },
    fetch: async (req: { url: string }) => {
      netCalls++;
      const r = network(req.url);
      if (!r) throw new Error('offline');
      return r;
    },
  });
  vm.runInContext(
    readFileSync('src/platform/sw-template.js', 'utf8')
      .replace("'__CORE__'", JSON.stringify(core))
      .replace("'__SPRITES__'", '[]')
      .replace("'__VERSION__'", "'t'")
      .replace("'__LEGACY_PREFIX__'", JSON.stringify(LEGACY_PREFIX)),
    ctx,
  );
  const waits: Promise<unknown>[] = [];
  const fetchEvt = async (url: string) => {
    let p: Promise<Response> | undefined;
    handlers.fetch({ request: { url, method: 'GET', mode: 'cors', headers: new Headers() }, respondWith: (x) => (p = x), waitUntil: (x) => void waits.push(x) });
    return p ? await p : null;
  };
  const activate = async () => {
    const ps: Promise<unknown>[] = [];
    handlers.activate({ waitUntil: (x) => void ps.push(x) });
    await Promise.all(ps);
  };
  const install = async () => {
    const ps: Promise<unknown>[] = [];
    handlers.install({ waitUntil: (x) => void ps.push(x) });
    return Promise.all(ps).then(
      () => true,
      () => false,
    );
  };
  const message = (data: unknown, ports: unknown[] = []) => handlers.message({ data, ports } as never);
  return { fetchEvt, stores, told, calls: () => netCalls, waits, activate, install, message };
}

const ok = (body = 'x', type = 'application/octet-stream') => new Response(body, { status: 200, headers: { 'Content-Type': type } });

describe('service worker : fichiers D2 chiffrés', () => {
  it('cache-first : le deuxième accès ne touche pas le réseau (hors ligne possible)', async () => {
    let online = true;
    const sw = boot(() => (online ? ok('data') : null));
    const u = 'http://h/d2/lo/a.png.enc?v=111';
    expect(await (await sw.fetchEvt(u))!.text()).toBe('data');
    expect(sw.calls()).toBe(1);
    online = false;
    expect(await (await sw.fetchEvt(u))!.text()).toBe('data');
    expect(sw.calls()).toBe(1);
    expect(sw.stores.has('d2m-d2')).toBe(true);
  });

  it('une nouvelle empreinte remplace l’ancienne entrée du même chemin', async () => {
    const sw = boot(() => ok('n'));
    await sw.fetchEvt('http://h/d2/lo/a.png.enc?v=old');
    await sw.fetchEvt('http://h/d2/lo/b.png.enc?v=old');
    await sw.fetchEvt('http://h/d2/lo/a.png.enc?v=new');
    const keys = [...sw.stores.get('d2m-d2')!.map.keys()].sort();
    expect(keys).toEqual(['http://h/d2/lo/a.png.enc?v=new', 'http://h/d2/lo/b.png.enc?v=old']);
  });

  it('index.json : réseau d’abord, purge des autres empreintes, repli sur la copie hors ligne', async () => {
    let online = true;
    let ver = 'v1';
    const sw = boot((url) => (!online ? null : url.endsWith('index.json') ? ok(JSON.stringify({ ver }), 'application/json') : ok('f')));
    await sw.fetchEvt('http://h/d2/index.json');
    await sw.fetchEvt('http://h/d2/lo/a.png.enc?v=v1');
    ver = 'v2';
    await sw.fetchEvt('http://h/d2/index.json');
    const keys = [...sw.stores.get('d2m-d2')!.map.keys()];
    expect(keys).toEqual(['http://h/d2/index.json']); // l'entrée v1 est purgée
    online = false;
    expect(await (await sw.fetchEvt('http://h/d2/index.json'))!.json()).toEqual({ ver: 'v2' });
  });

  it('quota plein : le fichier est servi, le jeu est prévenu une seule fois', async () => {
    const sw = boot(() => ok('big'));
    // première requête pour créer le cache, puis le rendre plein
    await sw.fetchEvt('http://h/d2/lo/seed.png.enc?v=1');
    sw.stores.get('d2m-d2')!.failPut = true;
    expect(await (await sw.fetchEvt('http://h/d2/lo/a.png.enc?v=1'))!.text()).toBe('big');
    await sw.fetchEvt('http://h/d2/lo/b.png.enc?v=1');
    await vi.waitFor(() => expect(sw.told).toEqual([{ type: 'D2_QUOTA' }]));
  });

  it('planches et modules de l’application : mise en cache gardée active (waitUntil), quota plein sans rejet non géré', async () => {
    const sw = boot(() => ok('png', 'image/png'));
    expect(await (await sw.fetchEvt('http://h/sprites/a.png'))!.text()).toBe('png');
    expect(sw.waits).toHaveLength(1);
    await Promise.all(sw.waits);
    expect([...sw.stores.values()].some((c) => c.map.has('http://h/sprites/a.png'))).toBe(true);
    for (const c of sw.stores.values()) c.failPut = true;
    expect(await (await sw.fetchEvt('http://h/assets/b.js'))!.text()).toBe('png');
    // l'échec de l'écriture est attrapé (la promesse confiée à waitUntil se résout) et signalé une fois
    await expect(Promise.all(sw.waits)).resolves.toBeDefined();
    await vi.waitFor(() => expect(sw.told).toEqual([{ type: 'D2_QUOTA' }]));
  });

  it('jamais de page HTML mise en cache à la place d’un fichier chiffré', async () => {
    const sw = boot(() => ok('<html>', 'text/html'));
    await sw.fetchEvt('http://h/d2/lo/a.png.enc?v=1');
    expect(sw.stores.get('d2m-d2')!.map.size).toBe(0);
  });

  it('activation: purges other versions of the app files (current and former names), never the D2 data caches', async () => {
    const sw = boot(() => ok());
    const L = (x: string) => `${LEGACY_PREFIX}-${x}`;
    const names = ['d2m-app-t', 'd2m-app-old', 'd2m-d2', 'd2m-d2-local', 'd2m-d2-audio', L('0123456789ab'), L('d2'), L('d2-local'), L('d2-audio')];
    for (const n of names) sw.stores.set(n, new FakeCache());
    await sw.activate();
    expect([...sw.stores.keys()].sort()).toEqual(['d2m-app-t', 'd2m-d2', 'd2m-d2-audio', 'd2m-d2-local', L('d2'), L('d2-audio'), L('d2-local')].sort());
  });

  it('an encrypted-files cache from an earlier version keeps being used under its former name (no re-download)', async () => {
    let online = false;
    const sw = boot(() => (online ? ok('net') : null));
    const old = new FakeCache();
    const u = 'http://h/d2/lo/a.png.enc?v=1';
    old.map.set(u, ok('cached'));
    sw.stores.set(`${LEGACY_PREFIX}-d2`, old);
    expect(await (await sw.fetchEvt(u))!.text()).toBe('cached');
    online = true;
    await sw.fetchEvt('http://h/d2/lo/b.png.enc?v=1');
    expect(old.map.has('http://h/d2/lo/b.png.enc?v=1')).toBe(true);
    expect(sw.stores.has('d2m-d2')).toBe(false);
  });
});

describe('service worker : API de synchronisation', () => {
  it('n’intercepte jamais /api/ (aucune réponse du service worker, rien en cache)', async () => {
    const sw = boot(() => ok('{"ok":true}', 'application/json'));
    expect(await sw.fetchEvt('http://h/api/sync')).toBeNull();
    expect(await sw.fetchEvt('http://h/api/sync?x=1')).toBeNull();
    expect(await sw.fetchEvt('http://h/game/api/sync')).toBeNull();
    expect(sw.calls()).toBe(0);
    expect([...sw.stores.values()].every((c) => c.map.size === 0)).toBe(true);
  });
});

describe('service worker : mises à jour (lot 297)', () => {
  it('version.json is never answered by the service worker (always the network, never a cached copy)', async () => {
    const sw = boot(() => ok('{"version":"x"}', 'application/json'));
    expect(await sw.fetchEvt('http://h/version.json?t=1')).toBeNull();
    expect(await sw.fetchEvt('http://h/game/version.json')).toBeNull();
    expect([...sw.stores.values()].every((c) => c.map.size === 0)).toBe(true);
  });

  it('tells its version on a port (the page compares it with the server’s)', () => {
    const sw = boot(() => null);
    const got: unknown[] = [];
    sw.message({ type: 'VERSION' }, [{ postMessage: (m: unknown) => got.push(m) }]);
    expect(got).toEqual([{ version: 't' }]);
  });

  it('install: every file cached, the progress told to the pages up to the last file', async () => {
    const core = Array.from({ length: 120 }, (_, i) => `assets/f${i}.js`);
    const sw = boot(() => ok('js', 'text/javascript'), core);
    expect(await sw.install()).toBe(true);
    expect(sw.stores.get('d2m-app-t')!.map.size).toBe(121);
    const prog = sw.told.filter((m) => (m as { type: string }).type === 'INSTALL_PROGRESS') as { done: number; total: number; version: string }[];
    expect(prog[0]).toMatchObject({ done: 0, total: 121, version: 't' });
    expect(prog.at(-1)).toMatchObject({ done: 121, total: 121 });
    // at most a message every 2 % (and the first, the last)
    expect(prog.length).toBeLessThanOrEqual(53);
    expect(prog.map((m) => m.done)).toEqual([...prog.map((m) => m.done)].sort((a, b) => a - b));
  });

  it('install: a file failing once is tried again; failing twice fails the install (the page offers to retry); a retry resumes', async () => {
    let flaky = 1;
    let dead = true;
    const sw = boot(
      (url) => {
        if (url.endsWith('b.js') && flaky-- > 0) return null;
        if (url.endsWith('c.js') && dead) return new Response('x', { status: 503 });
        return ok('js', 'text/javascript');
      },
      ['assets/a.js', 'assets/b.js', 'assets/c.js'],
    );
    expect(await sw.install()).toBe(false);
    const cache = sw.stores.get('d2m-app-t')!;
    expect(cache.map.has('assets/b.js')).toBe(true);
    dead = false;
    const before = sw.calls();
    expect(await sw.install()).toBe(true);
    // a.js and b.js kept (hashed), './' and c.js asked again
    expect(sw.calls() - before).toBe(2);
    expect(cache.map.size).toBe(4);
  });
});
