/**
 * First launch after the rename to "D2 Mobile": copies every localStorage / sessionStorage key of the former prefix
 * (legacy-names.ts: saves, shared stashes, guild, sync metadata, anonymous stats id, settings…) to the same key under `d2m.`.
 *
 * - Copy, not move: the former key stays as a fallback (a later version may delete them, see docs/STORAGE.md). If the copy does not
 *   fit in the storage quota, that key is moved instead (copy then delete, the value never leaves memory before it is written).
 * - A key that already exists under `d2m.` is never overwritten.
 * - Runs once: the `d2m.migrated` marker is written when every key was handled. Without it, a key deleted on purpose under its new name
 *   (a deleted character) would come back from its former copy on the next launch.
 * - Storage unavailable (private mode, blocked cookies): nothing happens, nothing throws; it is tried again on the next launch.
 *
 * Imported first by main.ts, before any module reads the storage.
 */
import { LEGACY_KEY_PREFIX } from './legacy-names';
import { isQuotaError } from './d2cache';

export const KEY_PREFIX = 'd2m.';
/** Written once the migration of a storage area is complete (value: format version of the migration) */
export const MIGRATED_MARKER = 'd2m.migrated';

export interface MigrationReport {
  state: 'unavailable' | 'already' | 'done' | 'partial';
  /** keys copied (former key kept) */
  copied: number;
  /** keys moved because the copy did not fit */
  moved: number;
  /** keys left untouched because the new key already existed */
  kept: number;
  /** keys that could not be written under the new name (former key intact) */
  failed: number;
}

/** New key of a key of the former prefix */
export const newKeyOf = (legacyKey: string): string => KEY_PREFIX + legacyKey.slice(LEGACY_KEY_PREFIX.length);

/** Keys whose VALUE is itself a storage key (the active character's save slot): the value is renamed too */
const VALUE_IS_KEY = new Set(['active']);
/** Value to write under the new key */
function newValueOf(legacyKey: string, v: string): string {
  return VALUE_IS_KEY.has(legacyKey.slice(LEGACY_KEY_PREFIX.length)) && v.startsWith(LEGACY_KEY_PREFIX) ? newKeyOf(v) : v;
}

/** Migrates one storage area (localStorage or sessionStorage); never throws */
export function migrateStorage(get: () => Storage | null | undefined): MigrationReport {
  const r: MigrationReport = { state: 'unavailable', copied: 0, moved: 0, kept: 0, failed: 0 };
  let st: Storage | null | undefined;
  try {
    st = get();
    if (!st) return r;
    if (st.getItem(MIGRATED_MARKER) !== null) return { ...r, state: 'already' };
  } catch {
    return r;
  }
  let legacyKeys: string[];
  try {
    legacyKeys = [];
    for (let i = 0; i < st.length; i++) {
      const k = st.key(i);
      if (k !== null && k.startsWith(LEGACY_KEY_PREFIX)) legacyKeys.push(k);
    }
  } catch {
    return r;
  }
  for (const k of legacyKeys) {
    const nk = newKeyOf(k);
    try {
      const legacyValue = st.getItem(k);
      if (legacyValue === null) continue;
      const v = newValueOf(k, legacyValue);
      if (st.getItem(nk) !== null) {
        r.kept++;
        continue;
      }
      try {
        st.setItem(nk, v);
        r.copied++;
      } catch (e) {
        if (!isQuotaError(e)) throw e;
        // quota: no room for two copies, the key is moved (written back under its former name if even that fails)
        st.removeItem(k);
        try {
          st.setItem(nk, v);
          r.moved++;
        } catch {
          st.setItem(k, legacyValue);
          r.failed++;
        }
      }
    } catch {
      r.failed++;
    }
  }
  if (r.failed) return { ...r, state: 'partial' };
  try {
    st.setItem(MIGRATED_MARKER, '1');
  } catch {
    // marker not written (full storage): the next launch runs again, which only adds keys still missing under the new name
    return { ...r, state: 'partial' };
  }
  return { ...r, state: 'done' };
}

/** Former keys still present (fallback copies), for diagnostics and the later clean-up */
export function legacyKeys(st: Storage): string[] {
  const out: string[] = [];
  for (let i = 0; i < st.length; i++) {
    const k = st.key(i);
    if (k !== null && k.startsWith(LEGACY_KEY_PREFIX)) out.push(k);
  }
  return out;
}

/**
 * Frees the fallback copies (former keys whose new key exists): called when a save does not fit in the quota, progress beats the
 * fallback. Returns the number of keys removed.
 */
export function freeLegacyCopies(st: Storage): number {
  let n = 0;
  try {
    for (const k of legacyKeys(st)) {
      if (st.getItem(newKeyOf(k)) === null) continue;
      st.removeItem(k);
      n++;
    }
  } catch {
    /* storage unavailable */
  }
  return n;
}

/** Both storage areas, as main.ts does at startup */
export function migrateAllStorage(): { local: MigrationReport; session: MigrationReport } {
  return {
    local: migrateStorage(() => (typeof localStorage === 'undefined' ? null : localStorage)),
    session: migrateStorage(() => (typeof sessionStorage === 'undefined' ? null : sessionStorage)),
  };
}
