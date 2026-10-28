/**
 * Rename to D2 Mobile: storage of earlier versions (former key prefix, IndexedDB databases, Cache API / OPFS stores) is found again,
 * intact, by this version. The former names come from src/platform/legacy-names.ts only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { migrate, serialize } from '../../src/sim/save';
import { SaveStore } from '../../src/platform/platform';
import { LEGACY_KEY_PREFIX, LEGACY_PREFIX, legacyStoreName } from '../../src/platform/legacy-names';
import { freeLegacyCopies, legacyKeys, migrateAllStorage, migrateStorage, MIGRATED_MARKER, newKeyOf } from '../../src/platform/storage-migrate';
import { migrateDb, resetDbMigrations } from '../../src/platform/idb-migrate';
import { D2_AUDIO_CACHE, D2_CACHE, D2_LOCAL_CACHE, deleteCache, opfsDirName, OPFS_DIR, primeStoreNames, removeOpfsDir, resetStoreNames, storeName } from '../../src/platform/storage-names';
import { FakeIDB } from '../fake-idb';

/** Map-backed Storage; `quota`: maximum total length of keys + values (QuotaExceededError beyond) */
function memStorage(quota = Infinity) {
  const m = new Map<string, string>();
  const size = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    m,
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem(k: string, v: string) {
      const next = size() - (m.has(k) ? k.length + m.get(k)!.length : 0) + k.length + v.length;
      if (next > quota) {
        const e = new Error('quota');
        e.name = 'QuotaExceededError';
        throw e;
      }
      m.set(k, v);
    },
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}
type Mem = ReturnType<typeof memStorage>;

const L = (k: string) => LEGACY_KEY_PREFIX + k;
const fixture = (v: number): Record<string, unknown> => JSON.parse(readFileSync(new URL(`./fixtures/saves/v${v}.json`, import.meta.url), 'utf8'));
/** A version 7 save (current format), as an earlier version wrote it */
const V7 = serialize({ ...migrate(fixture(6)), savedAt: 1_700_000_000_000 });
const SLOT = 'save.5b0c3f0e-1d2a-4c8e-9f00-123456789abc';

/** Profile of an earlier version: character, its backup, shared stash, active slot, anonymous id, settings */
function oldProfile(st: Mem) {
  st.setItem(L(SLOT), V7);
  st.setItem(L(`${SLOT}.backup`), V7);
  st.setItem(L('shared'), '{"tabs":[]}');
  st.setItem(L('active'), L(SLOT));
  st.setItem(L('stats.id'), 'f3b1c2d4e5f60718293a4b5c6d7e8f90');
  st.setItem(L('stats.idAt'), '1700000000000');
  st.setItem(L('lang'), 'fr');
  st.setItem(L('settings.cat'), 'audio');
  st.setItem('unrelated', 'x');
}

describe('localStorage keys of the former name', () => {
  it('first launch: every key copied under d2m., the v7 save byte for byte, the former keys kept', () => {
    const st = memStorage();
    oldProfile(st);
    const before = new Map(st.m);
    const r = migrateStorage(() => st as unknown as Storage);
    expect(r).toMatchObject({ state: 'done', copied: 8, moved: 0, kept: 0, failed: 0 });
    expect(st.getItem(`d2m.${SLOT}`)).toBe(V7);
    expect(st.getItem(`d2m.${SLOT}.backup`)).toBe(V7);
    expect(st.getItem('d2m.stats.id')).toBe('f3b1c2d4e5f60718293a4b5c6d7e8f90');
    expect(st.getItem('d2m.stats.idAt')).toBe('1700000000000');
    expect(st.getItem('d2m.lang')).toBe('fr');
    // the active slot is itself a key: renamed with it
    expect(st.getItem('d2m.active')).toBe(`d2m.${SLOT}`);
    // fallback: the former keys are untouched
    for (const [k, v] of before) expect(st.getItem(k)).toBe(v);
    expect(st.getItem(MIGRATED_MARKER)).toBe('1');
    expect(legacyKeys(st as unknown as Storage)).toHaveLength(8);
  });

  it('the game finds the character again under its new key, intact', () => {
    const st = memStorage();
    oldProfile(st);
    migrateStorage(() => st as unknown as Storage);
    vi.stubGlobal('localStorage', st);
    try {
      expect(SaveStore.active()).toBe(`d2m.${SLOT}`);
      const list = SaveStore.list();
      expect(list.map((c) => [c.slot, c.name, c.level])).toEqual([[`d2m.${SLOT}`, 'Fixture', 24]]);
      expect(serialize(SaveStore.load(`d2m.${SLOT}`)!)).toBe(V7);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('an active slot still under the former name (not rewritten) points to the new key', () => {
    const st = memStorage();
    st.setItem(`d2m.${SLOT}`, V7);
    st.setItem('d2m.active', L(SLOT));
    vi.stubGlobal('localStorage', st);
    try {
      expect(SaveStore.active()).toBe(`d2m.${SLOT}`);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('runs once: a key deleted under its new name does not come back; a new key is never overwritten', () => {
    const st = memStorage();
    oldProfile(st);
    st.setItem('d2m.lang', 'en');
    const r1 = migrateStorage(() => st as unknown as Storage);
    expect(r1).toMatchObject({ state: 'done', kept: 1 });
    expect(st.getItem('d2m.lang')).toBe('en');
    st.removeItem(`d2m.${SLOT}`);
    expect(migrateStorage(() => st as unknown as Storage).state).toBe('already');
    expect(st.getItem(`d2m.${SLOT}`)).toBeNull();
  });

  it('no former key (new install): nothing copied, marker written', () => {
    const st = memStorage();
    expect(migrateStorage(() => st as unknown as Storage)).toMatchObject({ state: 'done', copied: 0 });
    expect(st.getItem(MIGRATED_MARKER)).toBe('1');
  });

  it('storage unavailable or throwing: no exception, tried again next launch', () => {
    expect(migrateStorage(() => null).state).toBe('unavailable');
    expect(
      migrateStorage(() => {
        throw new Error('SecurityError');
      }).state,
    ).toBe('unavailable');
    const st = memStorage();
    oldProfile(st);
    const broken = { ...st, get length() { return st.length; }, key: () => { throw new Error('denied'); }, getItem: st.getItem }; // prettier-ignore
    expect(migrateStorage(() => broken as unknown as Storage).state).toBe('unavailable');
    expect(st.getItem(MIGRATED_MARKER)).toBeNull();
  });

  it('no room for a second copy: the key is moved (never lost), the save stays byte for byte', () => {
    const st = memStorage();
    st.setItem(L(SLOT), V7);
    st.setItem(L('stats.id'), 'abc');
    // room for the existing keys plus a little: the big save cannot be duplicated
    const used = [...st.m].reduce((n, [k, v]) => n + k.length + v.length, 0);
    const tight = memStorage(used + 200);
    for (const [k, v] of st.m) tight.setItem(k, v);
    const r = migrateStorage(() => tight as unknown as Storage);
    expect(r.state).toBe('done');
    expect(r.moved).toBe(1);
    expect(tight.getItem(`d2m.${SLOT}`)).toBe(V7);
    expect(tight.getItem(L(SLOT))).toBeNull();
    expect(tight.getItem('d2m.stats.id')).toBe('abc');
  });

  it('a key that cannot be written at all stays under its former name; no marker, retried next launch', () => {
    const st = memStorage();
    st.setItem(L('stats.id'), 'abc');
    const ro = { ...st, get length() { return st.length; }, setItem: () => { throw new Error('read-only'); } }; // prettier-ignore
    const r = migrateStorage(() => ro as unknown as Storage);
    expect(r).toMatchObject({ state: 'partial', failed: 1 });
    expect(st.getItem(L('stats.id'))).toBe('abc');
    expect(st.getItem(MIGRATED_MARKER)).toBeNull();
  });

  it('sessionStorage too (both areas at startup)', () => {
    const ls = memStorage();
    const ss = memStorage();
    ss.setItem(L('d2skip'), '1');
    vi.stubGlobal('localStorage', ls);
    vi.stubGlobal('sessionStorage', ss);
    try {
      const r = migrateAllStorage();
      expect(r.session.copied).toBe(1);
      expect(ss.getItem('d2m.d2skip')).toBe('1');
      expect(r.local.state).toBe('done');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('storage full while saving: the fallback copies are freed first, then the save goes through', () => {
    const st = memStorage();
    oldProfile(st);
    migrateStorage(() => st as unknown as Storage);
    const used = [...st.m].reduce((n, [k, v]) => n + k.length + v.length, 0);
    const full = memStorage(used + 2);
    for (const [k, v] of st.m) full.setItem(k, v);
    vi.stubGlobal('localStorage', full);
    try {
      const s = SaveStore.load(`d2m.${SLOT}`)!;
      // a few characters longer than the save on disk: does not fit any more without freeing space
      s.character.gold = 123_456_789;
      expect(SaveStore.save(s, `d2m.${SLOT}`)).toBe(true);
      expect(legacyKeys(full as unknown as Storage)).toEqual([]);
      expect(SaveStore.load(`d2m.${SLOT}`)!.character.gold).toBe(s.character.gold);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('freeLegacyCopies only removes former keys whose new key exists', () => {
    const st = memStorage();
    st.setItem(L('a'), '1');
    st.setItem('d2m.a', '1');
    st.setItem(L('b'), '2');
    expect(freeLegacyCopies(st as unknown as Storage)).toBe(1);
    expect(st.getItem(L('b'))).toBe('2');
    expect(newKeyOf(L('x.y'))).toBe('d2m.x.y');
  });
});

describe('IndexedDB databases of the former name', () => {
  let idb: FakeIDB;
  beforeEach(() => {
    resetDbMigrations();
  });
  afterEach(() => vi.unstubAllGlobals());

  for (const withList of [true, false])
    it(`copied once into the new database, the former one kept (${withList ? 'with' : 'without'} indexedDB.databases)`, async () => {
      idb = new FakeIDB(withList);
      vi.stubGlobal('indexedDB', idb);
      const session = { name: 'alice', key: { opaque: true } };
      idb.seed(legacyStoreName('sync'), 'session', { v1: session });
      await migrateDb('d2m-sync', legacyStoreName('sync'), 'session');
      expect(idb.entries('d2m-sync', 'session')).toEqual({ v1: session });
      expect(idb.entries(legacyStoreName('sync'), 'session')).toEqual({ v1: session });
      // signed out under the new name: the session does not come back (the new database exists)
      idb.dbs.get('d2m-sync')!.stores.get('session')!.clear();
      resetDbMigrations();
      await migrateDb('d2m-sync', legacyStoreName('sync'), 'session');
      expect(idb.entries('d2m-sync', 'session')).toEqual({});
    });

  it('nothing under the former name: no database created, either name', async () => {
    idb = new FakeIDB(false);
    vi.stubGlobal('indexedDB', idb);
    await migrateDb('d2m-d2s', legacyStoreName('d2s'), 'handles');
    expect([...idb.dbs.keys()]).toEqual([]);
  });

  it('without IndexedDB: no-op', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(migrateDb('d2m-d2local', legacyStoreName('d2local'), 'handles')).resolves.toBeUndefined();
  });
});

describe('Cache API / OPFS stores of the former name (kept in place)', () => {
  beforeEach(() => resetStoreNames());
  afterEach(() => {
    vi.unstubAllGlobals();
    resetStoreNames();
  });

  function fakeCaches(names: string[]) {
    const set = new Set(names);
    return {
      set,
      has: async (n: string) => set.has(n),
      delete: async (n: string) => set.delete(n),
      open: async (n: string) => (set.add(n), {}),
    };
  }

  it('a cache that exists under its former name keeps being used under it; a new install uses the new names', async () => {
    const c = fakeCaches([legacyStoreName('d2-local')]);
    vi.stubGlobal('caches', c);
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => ({ getDirectoryHandle: async () => Promise.reject(new Error('NotFoundError')) }) } });
    expect(storeName(D2_LOCAL_CACHE)).toBe(D2_LOCAL_CACHE);
    await primeStoreNames();
    expect(storeName(D2_LOCAL_CACHE)).toBe(legacyStoreName('d2-local'));
    expect(storeName(D2_CACHE)).toBe(D2_CACHE);
    expect(storeName(D2_AUDIO_CACHE)).toBe(D2_AUDIO_CACHE);
    expect(opfsDirName()).toBe(OPFS_DIR);
    // cleared by the player: both names deleted, the new name from now on
    await deleteCache(D2_LOCAL_CACHE);
    expect(c.set.has(legacyStoreName('d2-local'))).toBe(false);
    expect(storeName(D2_LOCAL_CACHE)).toBe(D2_LOCAL_CACHE);
  });

  it('OPFS directory of the former name: used in place, removed under both names', async () => {
    vi.stubGlobal('caches', undefined);
    const removed: string[] = [];
    const root = {
      getDirectoryHandle: async (n: string) => (n === legacyStoreName('d2') ? {} : Promise.reject(new Error('NotFoundError'))),
      removeEntry: async (n: string) => void removed.push(n),
    };
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
    await primeStoreNames();
    expect(opfsDirName()).toBe(legacyStoreName('d2'));
    await removeOpfsDir();
    expect(removed.sort()).toEqual([OPFS_DIR, legacyStoreName('d2')].sort());
    expect(opfsDirName()).toBe(OPFS_DIR);
  });

  it('the former prefix is the only spelling of the former name (legacy-names.ts)', () => {
    expect(LEGACY_KEY_PREFIX).toBe(`${LEGACY_PREFIX}.`);
    expect(legacyStoreName('d2')).toBe(`${LEGACY_PREFIX}-d2`);
  });
});
