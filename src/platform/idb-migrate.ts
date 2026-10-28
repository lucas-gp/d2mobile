/**
 * IndexedDB databases renamed with the game (`d2m-…`). The small databases (sync session, remembered folder and file handles) are
 * COPIED from their former name on first use, in the single upgrade transaction that creates the new database: either the new
 * database exists with all the entries, or it does not exist at all and the copy is tried again next time. The former database is
 * kept untouched as a fallback (a later version may delete it, see docs/STORAGE.md).
 *
 * "Done" is the new database's existence, never its content: an entry deleted on purpose (sign-out, forgotten folder) does not come back.
 */

type Entry = { key: IDBValidKey; value: unknown };

const done = new Map<string, Promise<void>>();

/** Opens an existing database without creating it (null: it does not exist, or IndexedDB fails) */
function openExisting(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let rq: IDBOpenDBRequest;
    try {
      rq = indexedDB.open(name);
    } catch {
      return resolve(null);
    }
    // version 0 → 1: the database did not exist; aborting the upgrade transaction leaves nothing behind
    rq.onupgradeneeded = () => rq.transaction?.abort();
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = (e) => {
      e.preventDefault();
      resolve(null);
    };
    rq.onblocked = () => resolve(null);
  });
}

async function exists(name: string): Promise<boolean> {
  const list = (indexedDB as Partial<IDBFactory>).databases;
  if (typeof list === 'function') {
    try {
      return (await list.call(indexedDB)).some((d) => d.name === name);
    } catch {
      /* falls back to opening it */
    }
  }
  const db = await openExisting(name);
  db?.close();
  return !!db;
}

function readAll(db: IDBDatabase, store: string): Promise<Entry[]> {
  return new Promise((resolve) => {
    if (!db.objectStoreNames.contains(store)) return resolve([]);
    try {
      const s = db.transaction(store, 'readonly').objectStore(store);
      const kr = s.getAllKeys();
      const vr = s.getAll();
      vr.onsuccess = () => resolve((kr.result ?? []).map((key, i) => ({ key, value: (vr.result as unknown[])[i] })));
      vr.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/** Creates the new database (version 1, one store) holding `entries`, atomically */
function create(name: string, store: string, entries: Entry[]): Promise<void> {
  return new Promise((resolve) => {
    const rq = indexedDB.open(name, 1);
    rq.onupgradeneeded = () => {
      const s = rq.result.createObjectStore(store);
      for (const e of entries) s.put(e.value, e.key);
    };
    rq.onsuccess = () => {
      rq.result.close();
      resolve();
    };
    rq.onerror = (e) => {
      e.preventDefault();
      resolve();
    };
  });
}

async function migrate(name: string, legacy: string, store: string): Promise<void> {
  if (await exists(name)) return;
  const old = await openExisting(legacy);
  if (!old) return;
  const entries = await readAll(old, store);
  old.close();
  if (entries.length) await create(name, store, entries);
}

/** Copies database `legacy` to `name` once (no-op when `name` already exists, when `legacy` does not, or without IndexedDB) */
export function migrateDb(name: string, legacy: string, store: string): Promise<void> {
  let p = done.get(name);
  if (!p) {
    p = typeof indexedDB === 'undefined' ? Promise.resolve() : migrate(name, legacy, store).catch(() => undefined);
    done.set(name, p);
  }
  return p;
}

/** Tests: forgets the migrations done this session */
export function resetDbMigrations(): void {
  done.clear();
}
