/** Moteur de synchronisation : deux « appareils » (localStorage séparés) face au même serveur factice. Aucune perte, conflits explicites. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handle, resetRateLimits, StoreConflict, type Deps, type Store } from '../../api/_lib/core';
import { SaveStore } from '../../src/platform/platform';
import { SyncEngine, SYNC_TIMEOUT_MS, type ConflictChoice, type ConflictInfo } from '../../src/platform/sync';
import { Game } from '../../src/sim/game';
import { deserialize } from '../../src/sim/save';

class MemStore implements Store {
  files = new Map<string, { data: Uint8Array; etag: string }>();
  n = 0;
  async get(p: string) {
    return this.files.get(p) ?? null;
  }
  async put(p: string, data: Uint8Array, o: { ifMatch?: string; createOnly?: boolean } = {}) {
    const cur = this.files.get(p);
    if ((o.createOnly && cur) || (o.ifMatch && cur?.etag !== o.ifMatch)) throw new StoreConflict();
    const etag = `e${++this.n}`;
    this.files.set(p, { data: new Uint8Array(data), etag });
    return { etag };
  }
  async del(ps: string[]) {
    for (const p of ps) this.files.delete(p);
  }
  async list(prefix: string) {
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

interface Device {
  ls: FakeStorage;
  eng: SyncEngine;
}
const g = globalThis as unknown as Record<string, unknown>;
let store: MemStore;
let clock: number;
let online: boolean;
const device = (): Device => ({ ls: new FakeStorage(), eng: new SyncEngine() });
/** Agit « sur » un appareil : son stockage devient le localStorage courant */
const on = <T>(d: Device, f: () => T): T => {
  g.localStorage = d.ls;
  return f();
};
const PW = 'un-mot-de-passe-solide';

beforeEach(() => {
  store = new MemStore();
  clock = 1_700_000_000_000;
  online = true;
  resetRateLimits();
  const deps: Deps = { store, pepper: 'p'.repeat(40), now: () => (clock += 1000), sleep: async () => undefined };
  g.window = { setTimeout: () => 0, clearTimeout: () => undefined, addEventListener: () => undefined };
  g.fetch = async (_u: string, init: { body: string }) => {
    if (!online) throw new TypeError('offline');
    const r = await handle(deps, { ip: '9.9.9.9', body: JSON.parse(init.body) });
    return new Response(JSON.stringify(r.body), { status: r.status });
  };
});

/** Crée un personnage « nom/niveau » sur l'appareil (date de sauvegarde = horloge simulée) */
function makeChar(d: Device, name: string, level = 1, slot?: string): string {
  return on(d, () => {
    const s = new Game().toSave();
    s.character.name = name;
    s.character.level = level;
    const k = slot ?? SaveStore.newSlot();
    const text = JSON.stringify({ ...s, savedAt: (clock += 1000) });
    d.ls.setItem(k, text);
    return k;
  });
}
const nameOf = (d: Device, key: string): string | undefined => on(d, () => SaveStore.load(key)?.character.name as string | undefined);
const keys = (d: Device): string[] => on(d, () => SaveStore.slotKeys().sort());

describe('moteur de synchronisation (deux appareils)', () => {
  it('le nouvel appareil récupère les personnages, ainsi que le coffre partagé', async () => {
    const A = device();
    const B = device();
    const k1 = makeChar(A, 'Éloïse', 30);
    makeChar(A, 'Bob', 5);
    on(A, () => SaveStore.saveShared({ tabs: [], gold: 123 } as never));
    await on(A, () => A.eng.register('Alice_01', PW, false));
    expect(A.eng.state.count).toBe(2);
    await on(B, () => B.eng.login('alice_01', PW, false));
    expect(keys(B).length).toBe(2);
    expect(nameOf(B, k1)).toBe('Éloïse');
    expect(on(B, () => SaveStore.loadShared())).toMatchObject({ gold: 123 });
    // le serveur ne contient rien en clair
    for (const f of store.files.values()) expect(Buffer.from(f.data).toString('latin1')).not.toContain('Éloïse');
  }, 30000);

  it('un coffre partagé par jeu de règles : chacun voyage sous son identifiant, sans se mélanger ; le résumé porte le jeu de règles', async () => {
    const A = device();
    const B = device();
    makeChar(A, 'Éloïse', 30);
    on(A, () => SaveStore.saveShared({ tabs: [], gold: 1 } as never, 'pd2'));
    on(A, () => SaveStore.saveShared({ tabs: [], gold: 2 } as never, 'd2'));
    await on(A, () => A.eng.register('Alice_02', PW, false));
    // deux coffres en ligne, aucun n'est compté comme un personnage
    expect(A.eng.state.count).toBe(1);
    await on(B, () => B.eng.login('alice_02', PW, false));
    expect(on(B, () => SaveStore.loadShared('pd2'))).toMatchObject({ gold: 1 });
    expect(on(B, () => SaveStore.loadShared('d2'))).toMatchObject({ gold: 2 });
    expect(B.ls.getItem('d2m.shared.d2.at')).toBeTruthy();
    // conflit sur le coffre de d2 : la fenêtre reçoit le jeu de règles du coffre
    on(A, () => SaveStore.saveShared({ tabs: [], gold: 3 } as never, 'd2'));
    on(B, () => SaveStore.saveShared({ tabs: [], gold: 4 } as never, 'd2'));
    await on(A, () => A.eng.syncAll());
    const seen: ConflictInfo[] = [];
    B.eng.conflictHandler = async (c) => {
      seen.push(c);
      return 'remote';
    };
    await on(B, () => B.eng.syncAll());
    expect(seen.map((c) => [c.slot, c.shared, c.local.ruleset, c.remote.ruleset])).toEqual([['shared-d2', true, 'd2', 'd2']]);
    expect(on(B, () => SaveStore.loadShared('d2'))).toMatchObject({ gold: 3 });
    expect(on(B, () => SaveStore.loadShared('pd2'))).toMatchObject({ gold: 1 });
  }, 30000);

  it('(b) serveur plus récent et local inchangé : remplacement silencieux, copie de sécurité gardée', async () => {
    const A = device();
    const B = device();
    const k = makeChar(A, 'Hero', 10);
    await on(A, () => A.eng.register('alice', PW, false));
    await on(B, () => B.eng.login('alice', PW, false));
    // A progresse puis synchronise
    makeChar(A, 'Hero', 11, k);
    await on(A, () => A.eng.syncAll());
    await on(B, () => B.eng.syncAll());
    expect(on(B, () => SaveStore.load(k)!.character.level)).toBe(11);
    expect(B.ls.getItem(`${k}.presync`)).toBeTruthy();
    expect(deserialize(B.ls.getItem(`${k}.presync`)!).character.level).toBe(10);
  }, 30000);

  it('(c) local plus récent et serveur inchangé : envoi ; l’autre appareil le reçoit', async () => {
    const A = device();
    const B = device();
    const k = makeChar(A, 'Hero', 10);
    await on(A, () => A.eng.register('alice', PW, false));
    await on(B, () => B.eng.login('alice', PW, false));
    makeChar(B, 'Hero', 12, k);
    await on(B, () => B.eng.syncAll());
    await on(A, () => A.eng.syncAll());
    expect(on(A, () => SaveStore.load(k)!.character.level)).toBe(12);
  }, 30000);

  const conflictSetup = async () => {
    const A = device();
    const B = device();
    const k = makeChar(A, 'Hero', 10);
    await on(A, () => A.eng.register('alice', PW, false));
    await on(B, () => B.eng.login('alice', PW, false));
    makeChar(A, 'Hero', 20, k); // les deux appareils jouent hors ligne
    makeChar(B, 'Hero', 15, k);
    await on(A, () => A.eng.syncAll()); // A envoie
    return { A, B, k };
  };

  it('(d) conflit : la fenêtre reçoit les deux versions ; « garder cet appareil » envoie la locale', async () => {
    const { A, B, k } = await conflictSetup();
    let seen: ConflictInfo | null = null;
    B.eng.conflictHandler = async (c) => ((seen = c), 'local');
    await on(B, () => B.eng.syncAll());
    expect(seen!.local.level).toBe(15);
    expect(seen!.remote.level).toBe(20);
    expect(seen!.local.name).toBe('Hero');
    expect(on(B, () => SaveStore.load(k)!.character.level)).toBe(15);
    await on(A, () => A.eng.syncAll());
    expect(on(A, () => SaveStore.load(k)!.character.level)).toBe(15); // la version de B est devenue la version en ligne
  }, 40000);

  it('(d) conflit : « garder l’autre » remplace le local mais conserve une copie de sécurité', async () => {
    const { B, k } = await conflictSetup();
    B.eng.conflictHandler = async () => 'remote';
    await on(B, () => B.eng.syncAll());
    expect(on(B, () => SaveStore.load(k)!.character.level)).toBe(20);
    expect(deserialize(B.ls.getItem(`${k}.presync`)!).character.level).toBe(15);
  }, 40000);

  it('(d) conflit : « garder les deux » crée un nouveau personnage, aucun des deux n’est perdu', async () => {
    const { A, B, k } = await conflictSetup();
    B.eng.conflictHandler = async () => 'both';
    await on(B, () => B.eng.syncAll());
    await on(B, () => B.eng.syncAll()); // le nouveau personnage part à la passe suivante
    expect(keys(B).length).toBe(2);
    const levels = keys(B)
      .map((x) => on(B, () => SaveStore.load(x)!.character.level))
      .sort();
    expect(levels).toEqual([15, 20]);
    await on(A, () => A.eng.syncAll());
    expect(keys(A).length).toBe(2);
    expect(on(A, () => SaveStore.load(k)!.character.level)).toBe(15);
  }, 40000);

  it('conflit non résolu (« plus tard ») : rien n’est écrasé, l’état reste « conflit »', async () => {
    const { B, k } = await conflictSetup();
    B.eng.conflictHandler = async (): Promise<ConflictChoice> => 'skip';
    await on(B, () => B.eng.syncAll());
    expect(B.eng.state.status).toBe('conflict');
    expect(on(B, () => SaveStore.load(k)!.character.level)).toBe(15);
    expect(B.ls.getItem(`${k}.presync`)).toBeNull();
  }, 40000);

  it('le personnage en cours de partie n’est jamais remplacé en silence', async () => {
    const A = device();
    const B = device();
    const k = makeChar(A, 'Hero', 10);
    await on(A, () => A.eng.register('alice', PW, false));
    await on(B, () => B.eng.login('alice', PW, false));
    makeChar(A, 'Hero', 11, k);
    await on(A, () => A.eng.syncAll());
    B.eng.playing = k;
    await on(B, () => B.eng.syncAll());
    expect(on(B, () => SaveStore.load(k)!.character.level)).toBe(10);
    expect(B.eng.state.status).toBe('conflict');
  }, 30000);

  it('hors ligne : le jeu continue, la synchro reprend au retour du réseau', async () => {
    const A = device();
    const k = makeChar(A, 'Hero', 10);
    await on(A, () => A.eng.register('alice', PW, false));
    online = false;
    makeChar(A, 'Hero', 11, k);
    await expect(on(A, () => A.eng.syncAll())).rejects.toThrow();
    expect(A.eng.state.status).toBe('offline');
    online = true;
    await on(A, () => A.eng.syncAll());
    expect(A.eng.state.status).toBe('idle');
    const B = device();
    await on(B, () => B.eng.login('alice', PW, false));
    expect(on(B, () => SaveStore.load(k)!.character.level)).toBe(11);
  }, 30000);

  it('l’emplacement d’origine reçoit un identifiant unique (deux appareils ne se télescopent pas)', async () => {
    const A = device();
    const B = device();
    makeChar(A, 'DepuisA', 5, 'd2m.save');
    makeChar(B, 'DepuisB', 6, 'd2m.save');
    await on(A, () => A.eng.register('alice', PW, false));
    await on(B, () => B.eng.login('alice', PW, false));
    await on(A, () => A.eng.syncAll());
    expect(keys(A).length).toBe(2);
    expect(keys(B).length).toBe(2);
    expect(keys(A)).not.toContain('d2m.save');
    const names = keys(B)
      .map((x) => nameOf(B, x))
      .sort();
    expect(names).toEqual(['DepuisA', 'DepuisB']);
  }, 30000);

  it('suppression locale : la copie en ligne disparaît si personne ne l’a modifiée', async () => {
    const A = device();
    const B = device();
    const k = makeChar(A, 'Bye', 3);
    makeChar(A, 'Stay', 4);
    await on(A, () => A.eng.register('alice', PW, false));
    await on(A, () => A.eng.syncAll());
    on(A, () => SaveStore.clear(k));
    // le crochet de suppression n'est branché que par init() : on le simule comme le fait le jeu
    (A.eng as unknown as { cleared(k: string): void }).cleared(k);
    await on(A, () => A.eng.syncAll());
    await on(B, () => B.eng.login('alice', PW, false));
    expect(keys(B).map((x) => nameOf(B, x))).toEqual(['Stay']);
  }, 30000);

  it('changement de mot de passe : les sauvegardes restent lisibles avec le nouveau, l’ancien est refusé', async () => {
    const A = device();
    const B = device();
    const k = makeChar(A, 'Hero', 10);
    await on(A, () => A.eng.register('alice', PW, false));
    await expect(on(A, () => A.eng.changePassword('mauvais-ancien', 'nouveau-mot-de-passe'))).rejects.toThrow();
    await on(A, () => A.eng.changePassword(PW, 'nouveau-mot-de-passe'));
    await expect(on(B, () => B.eng.login('alice', PW, false))).rejects.toThrow();
    await on(B, () => B.eng.login('alice', 'nouveau-mot-de-passe', false));
    expect(nameOf(B, k)).toBe('Hero');
  }, 60000);
});

describe('appel réseau de la synchronisation', () => {
  type Caller = { call(body: Record<string, unknown>, keepalive?: boolean): Promise<Record<string, unknown>> };
  it('un serveur qui ne répond plus : abandon après le délai, erreur « hors ligne » (pas d’attente sans fin)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let aborted = false;
      g.fetch = (_u: string, init: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
      const p = (new SyncEngine() as unknown as Caller).call({ op: 'status' });
      const seen = expect(p).rejects.toMatchObject({ code: 'offline' });
      await vi.advanceTimersByTimeAsync(SYNC_TIMEOUT_MS - 1);
      expect(aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await seen;
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('envoi de fermeture de page (keepalive) : sans délai ni signal', async () => {
    let signal: unknown = 'non appelé';
    g.fetch = async (_u: string, init: { signal?: AbortSignal }) => {
      signal = init.signal;
      return new Response('{}', { status: 200 });
    };
    await (new SyncEngine() as unknown as Caller).call({ op: 'status' }, true);
    expect(signal).toBeUndefined();
  });
});
