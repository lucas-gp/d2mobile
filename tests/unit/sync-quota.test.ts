/**
 * Économie du quota Vercel Blob (2 000 opérations « avancées » par mois : put, copy, list ; get/head sont « simples »).
 * Aucun appel réel : stockage en mémoire qui COMPTE les appels (CountingStore), horloge et minuteurs simulés.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handle, resetRateLimits, StoreConflict, type Deps, type Store } from '../../api/_lib/core';
import { SaveStore } from '../../src/platform/platform';
import { contentFingerprint, SyncEngine, SYNC_TUNING, UNAVAILABLE_MSG } from '../../src/platform/sync';
import { Game } from '../../src/sim/game';

// lot 299: the account is off in this build (`SIGN_IN_OFFERED`); the engine itself is measured here as when it is offered
vi.mock('../../src/platform/build-flags', async (orig) => ({ ...(await orig<typeof import('../../src/platform/build-flags')>()), SYNC_ENABLED: true }));

interface Counts {
  get: number;
  put: number;
  del: number;
  list: number;
}
/** Stockage mémoire qui compte les appels par type. Avancées = put + del + list ; simples = get. */
class CountingStore implements Store {
  files = new Map<string, { data: Uint8Array; etag: string }>();
  n = 0;
  c: Counts = { get: 0, put: 0, del: 0, list: 0 };
  failWrites = false;
  get advanced(): number {
    return this.c.put + this.c.del + this.c.list;
  }
  get simple(): number {
    return this.c.get;
  }
  snap(): { adv: number; simple: number } {
    return { adv: this.advanced, simple: this.simple };
  }
  async get(p: string) {
    this.c.get++;
    return this.files.get(p) ?? null;
  }
  async put(p: string, data: Uint8Array, o: { ifMatch?: string; createOnly?: boolean } = {}) {
    this.c.put++;
    if (this.failWrites) throw new Error('BlobError: store suspended');
    const cur = this.files.get(p);
    if ((o.createOnly && cur) || (o.ifMatch && cur?.etag !== o.ifMatch)) throw new StoreConflict();
    const etag = `e${++this.n}`;
    this.files.set(p, { data: new Uint8Array(data), etag });
    return { etag };
  }
  async del(ps: string[]) {
    this.c.del++;
    for (const p of ps) this.files.delete(p);
  }
  async list(prefix: string) {
    this.c.list++;
    return [...this.files.keys()].filter((k) => k.startsWith(prefix));
  }
}
class FakeStorage {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const g = globalThis as unknown as Record<string, unknown>;
const PW = 'un-mot-de-passe-solide';
let store: CountingStore;
let eng: SyncEngine;
let requests: string[];
let deps: Deps;
let handlers: Record<string, () => void>;
let doc: { visibilityState: string };

function setup(gcBatch?: number): void {
  store = new CountingStore();
  requests = [];
  handlers = {};
  doc = { visibilityState: 'visible' };
  resetRateLimits();
  deps = { store, pepper: 'p'.repeat(40), now: () => Date.now(), sleep: async () => undefined, gcBatch };
  g.localStorage = new FakeStorage();
  g.window = { setTimeout: (f: () => void, ms: number) => setTimeout(f, ms), clearTimeout: (t: number) => clearTimeout(t), addEventListener: (n: string, f: () => void) => (handlers[n] = f) };
  g.document = {
    addEventListener: (n: string, f: () => void) => (handlers[n] = f),
    get visibilityState() {
      return doc.visibilityState;
    },
  };
  g.fetch = async (_u: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    requests.push(body.action);
    let r;
    try {
      r = await handle(deps, { ip: '9.9.9.9', body });
    } catch {
      r = { status: 500, body: { error: 'server' } }; // comme api/sync.ts
    }
    return new Response(JSON.stringify(r.body), { status: r.status });
  };
  eng = new SyncEngine();
}
/** Attend la fin de l'envoi en cours (le chiffrement WebCrypto n'avance pas avec les minuteurs simulés) */
const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
  await (eng as unknown as { chain: Promise<unknown> }).chain;
};
const advance = async (ms: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
  await settle();
};
const base = new Game().toSave();
/** Sauvegarde locale du personnage (le niveau d'XP varie pour changer le contenu) */
const save = (slot: string, xp: number): void => {
  const s = structuredClone(base);
  s.character.xp = xp;
  vi.setSystemTime(Date.now() + 1); // deux sauvegardes n'ont jamais le même horodatage
  SaveStore.save(s, slot);
};
const count = (a: string) => requests.filter((x) => x === a).length;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(1_700_000_000_000);
});
afterEach(() => {
  vi.useRealTimers();
  SaveStore.onSaved = null;
  SaveStore.onCleared = null;
});

async function connect(slot = 'd2m.save.a'): Promise<string> {
  await eng.init();
  save(slot, 1);
  await eng.register('alice', PW, false);
  return slot;
}

describe('économie de quota : moteur de synchronisation', () => {
  beforeEach(() => setup());
  it('(i) 100 sauvegardes locales en 2 minutes : un seul envoi, 3 minutes après la dernière', async () => {
    const k = await connect();
    requests.length = 0;
    for (let i = 0; i < 100; i++) {
      await vi.advanceTimersByTimeAsync(1200);
      save(k, 10 + i);
    }
    await settle();
    expect(count('put')).toBe(0); // pas d'envoi pendant le jeu actif tant que l'inactivité n'atteint pas 3 min
    await advance(SYNC_TUNING.idleMs + 1000);
    expect(count('put')).toBe(1);
  }, 30000);

  it('envoi forcé au plus tard toutes les 10 minutes de jeu continu', async () => {
    const k = await connect();
    requests.length = 0;
    for (let i = 0; i < 125; i++) {
      await vi.advanceTimersByTimeAsync(5000);
      save(k, 10 + i);
      await settle();
    }
    // 125 × 5 s = 625 s de jeu continu : un envoi forcé à 10 min, jamais l'anti-rebond
    expect(count('put')).toBe(1);
  }, 30000);

  it('(ii) contenu inchangé (seul l’horodatage change) : aucune opération avancée', async () => {
    const k = await connect();
    const empreinte = contentFingerprint(JSON.stringify({ a: 1, savedAt: 1 }));
    expect(contentFingerprint(JSON.stringify({ a: 1, savedAt: 2 }))).toBe(empreinte);
    expect(contentFingerprint(JSON.stringify({ a: 2, savedAt: 1 }))).not.toBe(empreinte);
    const before = store.snap();
    requests.length = 0;
    await vi.advanceTimersByTimeAsync(5000);
    save(k, 1); // même contenu, nouveau savedAt
    await advance(SYNC_TUNING.idleMs + 1000);
    expect(count('put')).toBe(0);
    expect(store.snap().adv).toBe(before.adv);
    // une synchro complète ne renvoie rien non plus : un seul `list` (lecture simple côté stockage)
    await eng.syncAll();
    expect(requests).toEqual(['list']);
    expect(store.snap().adv).toBe(before.adv);
  }, 30000);

  it('(iii) fermeture (pagehide) et passage en arrière-plan : les modifications en attente partent tout de suite', async () => {
    const k = await connect();
    requests.length = 0;
    save(k, 50);
    handlers.pagehide();
    await settle();
    expect(count('put')).toBe(1);
    save(k, 51);
    doc.visibilityState = 'hidden';
    handlers.visibilitychange();
    await settle();
    expect(count('put')).toBe(2);
    // plusieurs emplacements modifiés : un seul passage
    save('d2m.save.b', 3);
    save(k, 52);
    handlers.pagehide();
    await settle();
    expect(count('put')).toBe(4);
  }, 30000);

  it('retour au premier plan : synchro complète seulement après plus de 15 minutes', async () => {
    await connect();
    requests.length = 0;
    doc.visibilityState = 'hidden';
    handlers.visibilitychange();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    doc.visibilityState = 'visible';
    handlers.visibilitychange();
    await settle();
    expect(requests).toEqual([]);
    doc.visibilityState = 'hidden';
    handlers.visibilitychange();
    await vi.advanceTimersByTimeAsync(16 * 60_000);
    doc.visibilityState = 'visible';
    handlers.visibilitychange();
    await settle();
    expect(requests).toEqual(['list']);
  }, 30000);

  it('(iv) erreur de quota/suspension : recul exponentiel, pas de boucle, sauvegarde locale intacte, reprise sur action explicite', async () => {
    const k = await connect();
    const local = () => (g.localStorage as FakeStorage).getItem(k);
    save(k, 77);
    const text = local();
    store.failWrites = true;
    requests.length = 0;
    await advance(SYNC_TUNING.idleMs + 1000); // 1re tentative
    expect(count('put')).toBe(1);
    expect(eng.state.status).toBe('error');
    expect(eng.state.message).toBe(UNAVAILABLE_MSG);
    // pas d'autre tentative avant 1 min, puis 2, 4, 8 min…
    await advance(59_000);
    expect(count('put')).toBe(1);
    await advance(2000);
    expect(count('put')).toBe(2);
    await advance(119_000);
    expect(count('put')).toBe(2);
    await advance(2000);
    expect(count('put')).toBe(3);
    // modifications locales pendant le recul : aucune requête de plus
    save(k, 78);
    await advance(SYNC_TUNING.idleMs);
    handlers.pagehide();
    await settle();
    const n = count('put');
    // 5 échecs au plus puis plus rien d'automatique, même après des heures
    for (let i = 0; i < 30; i++) await advance(10 * 60_000);
    expect(count('put')).toBe(5);
    const total = requests.length;
    for (let i = 0; i < 30; i++) await advance(10 * 60_000);
    expect(requests.length).toBe(total);
    expect(n).toBeLessThanOrEqual(5);
    expect(local()).not.toBe(text); // la sauvegarde locale (78) est intacte
    expect(SaveStore.load(k)!.character.xp).toBe(78);
    // action explicite une fois le stockage rétabli : tout repart
    store.failWrites = false;
    await eng.syncAll();
    expect(eng.state.status).toBe('idle');
    expect(eng.state.message).toBe('');
  }, 30000);
});

/** Simule `minutes` de jeu avec une sauvegarde toutes les 5 s ; renvoie les opérations Blob consommées */
async function simulate(minutes: number, tune: Partial<typeof SYNC_TUNING>, gcBatch?: number) {
  setup(gcBatch);
  Object.assign(eng.tuning, tune);
  const k = await connect();
  const b0 = store.snap();
  requests.length = 0;
  for (let t = 0; t < minutes * 12; t++) {
    await vi.advanceTimersByTimeAsync(5000);
    save(k, 10 + t);
    await settle();
  }
  handlers.pagehide();
  await settle();
  const b1 = store.snap();
  return { adv: b1.adv - b0.adv, simple: b1.simple - b0.simple, uploads: count('put'), counts: { ...store.c } };
}

describe('mesure avant / après (1 h de jeu, une sauvegarde toutes les 5 s)', () => {
  it('(vi) au moins 10 fois moins d’opérations avancées', async () => {
    // « avant » : envoi 10 s après la première sauvegarde (sans anti-rebond), pas de dédoublonnage, suppression immédiate des révisions
    const avant = await simulate(60, { idleMs: 10_000, maxMs: 10_000, dedupe: false }, 1);
    const apres = await simulate(60, {});
    console.log('1 h de jeu (720 sauvegardes)', { avant, apres, reduction: +(avant.adv / apres.adv).toFixed(1) });
    expect(avant.uploads).toBeGreaterThanOrEqual(300);
    expect(apres.uploads).toBeLessThanOrEqual(7); // 6 envois forcés + celui de fermeture
    expect(avant.adv / apres.adv).toBeGreaterThanOrEqual(10);
  }, 120000);
});

describe('audit : opérations Blob par action (avancées / simples)', () => {
  it('mesure par action, avant (suppression immédiate) et après (suppression groupée)', async () => {
    const rows: Record<string, unknown>[] = [];
    for (const [label, gc] of [
      ['avant', 1],
      ['après', undefined],
    ] as const) {
      setup(gc);
      await eng.init();
      const k = 'd2m.save.a';
      save(k, 1);
      SaveStore.saveShared({ tabs: [], gold: 1 } as never);
      const m = async (action: string, f: () => Promise<unknown>) => {
        const s = store.snap();
        const c0 = { ...store.c };
        await f();
        const s1 = store.snap();
        rows.push({
          version: label,
          action,
          avancées: s1.adv - s.adv,
          simples: s1.simple - s.simple,
          détail: `put ${store.c.put - c0.put} / del ${store.c.del - c0.del} / list ${store.c.list - c0.list} / get ${store.c.get - c0.get}`,
        });
      };
      await m('inscription + 1re synchro (2 emplacements)', () => eng.register('alice', PW, false));
      // 25 envois consécutifs : la suppression groupée s'amortit
      const s0 = store.snap();
      for (let i = 0; i < 25; i++) {
        save(k, 100 + i);
        await eng.flush(false, true);
      }
      const s1 = store.snap();
      rows.push({ version: label, action: 'envoi d’un personnage (moyenne sur 25)', avancées: +((s1.adv - s0.adv) / 25).toFixed(2), simples: +((s1.simple - s0.simple) / 25).toFixed(2) });
      await m('envoi du coffre partagé', async () => {
        SaveStore.saveShared({ tabs: [], gold: 999 } as never);
        await eng.flush(false, true);
      });
      await m('syncAll sans changement', () => eng.syncAll());
      await m('suppression d’un personnage (+ synchro)', async () => {
        (g.localStorage as FakeStorage).removeItem(k);
        SaveStore.onCleared?.(k);
        await eng.syncAll();
      });
      eng = new SyncEngine();
      await m('connexion (2e appareil, état vide)', async () => {
        g.localStorage = new FakeStorage();
        await eng.login('alice', PW, false);
      });
    }
    console.table(rows);
    const put = (v: string) => rows.find((r) => r.version === v && String(r.action).startsWith('envoi d’un personnage'))!.avancées as number;
    expect(put('avant')).toBe(3);
    expect(put('après')).toBeLessThan(2.1);
    const idle = rows.filter((r) => r.action === 'syncAll sans changement');
    for (const r of idle) expect(r.avancées).toBe(0);
  }, 120000);
});

describe('serveur : anciennes révisions supprimées par lots, sans jamais toucher la version courante', () => {
  it('lot de 25, dernière version toujours lisible, et nettoyage complet à la suppression du compte', async () => {
    setup(25);
    await eng.init();
    const k = 'd2m.save.a';
    save(k, 1);
    await eng.register('alice', PW, false);
    for (let i = 0; i < 60; i++) {
      save(k, 100 + i);
      await eng.flush(false, true);
    }
    const saves = [...store.files.keys()].filter((p) => p.startsWith('saves/'));
    expect(saves.length).toBeLessThanOrEqual(1 + 25); // révision courante + au plus un lot en attente
    expect(store.c.del).toBeLessThanOrEqual(3);
    // un autre appareil (stockage vide) récupère bien la dernière version
    g.localStorage = new FakeStorage();
    await new SyncEngine().login('alice', PW, false);
    expect(SaveStore.load(k)!.character.xp).toBe(159);
    await eng.deleteOnline();
    expect([...store.files.keys()]).toEqual(['meta/accounts.json']); // compteur global des comptes seulement
  }, 60000);
});

describe('appareil reconnu (lot 247) : le moteur envoie son jeton, un tiers ne le bloque pas', () => {
  beforeEach(() => setup());
  it('inscription → appareil reconnu ; compte verrouillé par un tiers → la synchronisation de cet appareil continue', async () => {
    const k = await connect();
    const tok = (globalThis.localStorage as Storage).getItem('d2m.sync.device');
    expect(tok).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    const bad = { action: 'login', name: 'alice', authHash: Buffer.alloc(32, 5).toString('base64') };
    for (let i = 0; i < 6; i++) await handle(deps, { ip: `7.7.7.${i}`, body: bad });
    const acct = () => JSON.parse(Buffer.from([...store.files.entries()].find(([p]) => p.startsWith('accounts/'))![1].data).toString());
    expect(acct().fails.lockedUntil).toBeGreaterThan(Date.now()); // bien verrouillé pour les autres
    expect(acct().devices).toHaveLength(1);
    save(k, 99);
    await eng.syncAll();
    expect(eng.state.status).not.toBe('error');
    expect(count('put')).toBeGreaterThan(0);
    expect((globalThis.localStorage as Storage).getItem('d2m.sync.device')).toBe(tok); // jeton stable
  }, 30000);
});
