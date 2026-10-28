/**
 * Names of the large on-device stores (Cache API caches and the OPFS directory holding the player's Diablo II files).
 *
 * They are NOT copied to their new `d2m-…` name: they can weigh hundreds of megabytes (a copy could exceed the storage quota and get
 * the whole origin evicted). Instead, a store that still exists under its former name keeps being used under that name; a new install,
 * or a store the player clears, uses the new name. The service worker applies the same rule to the encrypted-files cache
 * (sw-template.js), so both sides always agree. A store is never read under one name and written under the other.
 *
 * `primeStoreNames()` resolves the names once (async); `storeName()` then answers synchronously (Workers receive the name in a message).
 */
import { legacyStoreName } from './legacy-names';

/** Encrypted Diablo II files fetched from the encrypted folder (optional `D2_REMOTE` loader; shared with the service worker) */
export const D2_CACHE = 'd2m-d2';
/** Graphics generated on the device from the player's archives */
export const D2_LOCAL_CACHE = 'd2m-d2-local';
/** Sounds decoded on the device from the player's archives */
export const D2_AUDIO_CACHE = 'd2m-d2-audio';
/** OPFS directory: copy of the player's archives (same name as the encrypted-files cache, but a different kind of store) */
export const OPFS_DIR = 'd2m-d2';

const CACHES = [D2_CACHE, D2_LOCAL_CACHE, D2_AUDIO_CACHE] as const;
/** Former suffix of each store (legacy-names.ts) */
const LEGACY_SUFFIX: Record<string, string> = { [D2_CACHE]: 'd2', [D2_LOCAL_CACHE]: 'd2-local', [D2_AUDIO_CACHE]: 'd2-audio' };
const OPFS_KEY = 'opfs:' + OPFS_DIR;

/** Names resolved this session (absent: not resolved yet, the new name is used) */
const resolved = new Map<string, string>();
let priming: Promise<void> | null = null;

/** Former name of a cache (null: it did not exist before the rename) */
export function legacyCacheName(name: string): string | null {
  const s = LEGACY_SUFFIX[name];
  return s ? legacyStoreName(s) : null;
}
/** Former name of the OPFS directory */
export const legacyOpfsDir = (): string => legacyStoreName('d2');

/** Resolves, once per session, which name each large store uses (former name if that store still exists) */
export function primeStoreNames(): Promise<void> {
  priming ??= (async () => {
    if (typeof caches !== 'undefined') {
      await Promise.all(
        CACHES.map(async (n) => {
          const legacy = legacyCacheName(n)!;
          try {
            resolved.set(n, (await caches.has(legacy)) ? legacy : n);
          } catch {
            resolved.set(n, n);
          }
        }),
      );
    }
    try {
      const root = await navigator.storage.getDirectory();
      await root.getDirectoryHandle(legacyOpfsDir());
      resolved.set(OPFS_KEY, legacyOpfsDir());
    } catch {
      resolved.set(OPFS_KEY, OPFS_DIR);
    }
  })();
  return priming;
}

/** Name to use for a cache (after primeStoreNames; before, the new name) */
export const storeName = (name: string): string => resolved.get(name) ?? name;
/** Name to use for the OPFS directory (after primeStoreNames; before, the new name) */
export const opfsDirName = (): string => resolved.get(OPFS_KEY) ?? OPFS_DIR;

/** Deletes a cache under both names; from now on the new name is used */
export async function deleteCache(name: string): Promise<void> {
  resolved.set(name, name);
  if (typeof caches === 'undefined') return;
  const legacy = legacyCacheName(name);
  await caches.delete(name);
  if (legacy) await caches.delete(legacy);
}

/** Removes the OPFS directory under both names; from now on the new name is used */
export async function removeOpfsDir(): Promise<void> {
  resolved.set(OPFS_KEY, OPFS_DIR);
  const root = await navigator.storage.getDirectory();
  for (const n of [OPFS_DIR, legacyOpfsDir()]) {
    try {
      await root.removeEntry(n, { recursive: true });
    } catch {
      /* nothing to remove */
    }
  }
}

/** Tests: forgets the names resolved this session */
export function resetStoreNames(): void {
  resolved.clear();
  priming = null;
}
