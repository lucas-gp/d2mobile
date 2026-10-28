/**
 * Fichiers de personnages Diablo II (.d2s) : lecture de fichiers choisis à la main (fonctionne partout, mobile compris) et, sur les
 * navigateurs qui ont l'API File System Access (Chrome, Edge… sur ordinateur et Android récent), dossier de sauvegardes mémorisé :
 * la poignée du dossier est gardée dans IndexedDB, les fichiers sont lus à la demande après autorisation. Rien ne quitte l'appareil.
 */
import { migrateDb } from './idb-migrate';
import { legacyStoreName } from './legacy-names';

interface FileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}
interface DirHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<FileHandle | DirHandle>;
  queryPermission?(d: { mode: 'read' }): Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?(d: { mode: 'read' }): Promise<'granted' | 'denied' | 'prompt'>;
}

export interface D2File {
  name: string;
  size: number;
  modified: number;
  read(): Promise<Uint8Array>;
}

/** Le navigateur sait-il choisir un dossier ? */
export function canPickDirectory(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

/** Fichier choisi dans un <input type="file"> */
export function fromFile(f: File): D2File {
  return { name: f.name, size: f.size, modified: f.lastModified, read: async () => new Uint8Array(await f.arrayBuffer()) };
}

const DB = 'd2m-d2s';
const STORE = 'handles';
const KEY = 'savedir';

async function openDb(): Promise<IDBDatabase> {
  // folder remembered by an earlier version (former database name): copied once
  await migrateDb(DB, legacyStoreName('d2s'), STORE);
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T | undefined>((resolve) => {
      const tx = db.transaction(STORE, mode);
      const rq = fn(tx.objectStore(STORE));
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => resolve(undefined);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return undefined;
  }
}

/** Dossier de sauvegardes mémorisé (poignée seulement) */
export async function savedDirectory(): Promise<DirHandle | null> {
  const h = await idb<DirHandle>('readonly', (s) => s.get(KEY));
  return h && h.kind === 'directory' ? h : null;
}

export async function forgetDirectory(): Promise<void> {
  await idb('readwrite', (s) => s.delete(KEY));
}

/** Demande un dossier à l'utilisateur et le mémorise ; null si annulé */
export async function pickDirectory(): Promise<DirHandle | null> {
  try {
    const h = await (window as unknown as { showDirectoryPicker(o?: object): Promise<DirHandle> }).showDirectoryPicker({ id: 'd2m-d2s', mode: 'read' });
    await idb('readwrite', (s) => s.put(h, KEY));
    return h;
  } catch {
    return null;
  }
}

/** Permission de lecture : déjà accordée ? sinon la demande (à appeler depuis un geste de l'utilisateur) */
export async function ensureReadable(h: DirHandle, ask: boolean): Promise<boolean> {
  try {
    if (!h.queryPermission) return true;
    if ((await h.queryPermission({ mode: 'read' })) === 'granted') return true;
    if (!ask || !h.requestPermission) return false;
    return (await h.requestPermission({ mode: 'read' })) === 'granted';
  } catch {
    return false;
  }
}

/** Fichiers .d2s du dossier (premier niveau), du plus récent au plus ancien ; lus à la demande */
export async function listD2s(h: DirHandle): Promise<D2File[]> {
  const out: D2File[] = [];
  for await (const e of h.values()) {
    if (e.kind !== 'file' || !/\.d2s$/i.test(e.name)) continue;
    const f = await e.getFile();
    out.push({ name: e.name, size: f.size, modified: f.lastModified, read: async () => new Uint8Array(await (await e.getFile()).arrayBuffer()) });
  }
  return out.sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name));
}

const DONE = 'd2m.d2s.imported';

/** Fichiers déjà importés (nom + date de modification → emplacement) : « Réimporter » plutôt qu'« Importer » */
export function importedBefore(f: D2File): boolean {
  try {
    return !!(JSON.parse(localStorage.getItem(DONE) ?? '{}') as Record<string, string>)[`${f.name}|${f.modified}`];
  } catch {
    return false;
  }
}
export function rememberImport(f: D2File, slot: string): void {
  try {
    const m = JSON.parse(localStorage.getItem(DONE) ?? '{}') as Record<string, string>;
    m[`${f.name}|${f.modified}`] = slot;
    localStorage.setItem(DONE, JSON.stringify(m));
  } catch {
    /* stockage indisponible */
  }
}
