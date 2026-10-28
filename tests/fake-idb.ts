/**
 * Minimal in-memory IndexedDB for unit tests (happy-dom has none): open with or without a version, upgrade transaction (and its abort,
 * which leaves no database behind), one-store transactions with get / put / delete / getAll / getAllKeys, databases().
 * Values are kept as given (no structured clone): enough to check what is copied where.
 */
type Rec = Map<IDBValidKey, unknown>;
interface Db {
  version: number;
  stores: Map<string, Rec>;
}

class Req<T> {
  result!: T;
  error: unknown = null;
  onsuccess: ((e: unknown) => void) | null = null;
  onerror: ((e: { preventDefault(): void }) => void) | null = null;
  onupgradeneeded: ((e: unknown) => void) | null = null;
  onblocked: (() => void) | null = null;
  transaction: { abort(): void; objectStore(n: string): Store } | null = null;
}

class Store {
  constructor(private rec: Rec) {}
  private req<T>(f: () => T): Req<T> {
    const r = new Req<T>();
    queueMicrotask(() => {
      r.result = f();
      r.onsuccess?.({});
    });
    return r;
  }
  get(k: IDBValidKey) {
    return this.req(() => this.rec.get(k));
  }
  put(v: unknown, k: IDBValidKey) {
    return this.req(() => (this.rec.set(k, v), k));
  }
  delete(k: IDBValidKey) {
    return this.req(() => void this.rec.delete(k));
  }
  clear() {
    return this.req(() => void this.rec.clear());
  }
  getAll() {
    return this.req(() => [...this.rec.values()]);
  }
  getAllKeys() {
    return this.req(() => [...this.rec.keys()]);
  }
}

class Conn {
  constructor(private db: Db) {}
  get objectStoreNames() {
    return { contains: (n: string) => this.db.stores.has(n) };
  }
  createObjectStore(n: string) {
    const rec: Rec = new Map();
    this.db.stores.set(n, rec);
    return new Store(rec);
  }
  transaction(n: string) {
    const rec = this.db.stores.get(n);
    if (!rec) throw new Error(`NotFoundError: ${n}`);
    const tx = { oncomplete: null as null | (() => void), onerror: null, objectStore: () => new Store(rec) };
    setTimeout(() => tx.oncomplete?.(), 0);
    return tx;
  }
  close() {
    /* nothing to release */
  }
}

export class FakeIDB {
  dbs = new Map<string, Db>();
  /** Number of open() calls (checks that no database is created by a mere existence test) */
  opens = 0;
  /** Without databases(): the existence test goes through an aborted upgrade */
  constructor(private withList = true) {}

  get databases() {
    return this.withList ? async () => [...this.dbs.entries()].map(([name, d]) => ({ name, version: d.version })) : undefined;
  }

  open(name: string, version?: number) {
    this.opens++;
    const r = new Req<Conn>();
    setTimeout(() => {
      const cur = this.dbs.get(name);
      const target = version ?? cur?.version ?? 1;
      if (cur && target <= cur.version) {
        r.result = new Conn(cur);
        return r.onsuccess?.({});
      }
      const draft: Db = { version: target, stores: new Map(cur?.stores ?? []) };
      let aborted = false;
      r.result = new Conn(draft);
      r.transaction = { abort: () => void (aborted = true), objectStore: (n: string) => new Store(draft.stores.get(n)!) };
      r.onupgradeneeded?.({ oldVersion: cur?.version ?? 0 });
      // the upgrade's own requests (puts) run as microtasks: settle them before committing
      setTimeout(() => {
        r.transaction = null;
        if (aborted) return r.onerror?.({ preventDefault: () => undefined });
        this.dbs.set(name, draft);
        r.onsuccess?.({});
      }, 0);
    }, 0);
    return r;
  }

  /** Puts entries in a database (creates it), as an earlier version of the game would have */
  seed(name: string, store: string, entries: Record<string, unknown>) {
    this.dbs.set(name, { version: 1, stores: new Map([[store, new Map(Object.entries(entries))]]) });
  }
  entries(name: string, store: string): Record<string, unknown> | null {
    const s = this.dbs.get(name)?.stores.get(store);
    return s ? Object.fromEntries([...s.entries()].map(([k, v]) => [String(k), v])) : null;
  }
}
