/**
 * Names from before the game was renamed "D2 Mobile" (D2M). This is the ONLY file of the app allowed to spell the former name
 * (tests/unit/no-legacy-name.test.ts enforces it); everything else imports these constants.
 *
 * Why they still exist:
 * - Data migration: players who installed an earlier version have their saves, settings and generated Diablo II graphics under the
 *   former prefix. storage-migrate.ts copies the localStorage / sessionStorage keys and the IndexedDB databases to the `d2m` names on
 *   first launch and keeps the originals as a fallback; the large Cache API / OPFS stores are kept in place under their former name
 *   (storage-names.ts) instead of being copied. The originals can be deleted by a later version (see docs/STORAGE.md).
 * - Cryptographic compatibility: LEGACY_D2_VERIFY_TEXT is the plaintext of the `verify` file of an encrypted folder made before the
 *   rename (d2crypto.ts). Changing it would make every correct password look wrong until the folder is encrypted again.
 *
 * None of these names is ever shown to the player.
 */

/** Former name, lowercase, as used in storage key prefixes */
export const LEGACY_PREFIX = 'sanctuaire';

/** Former localStorage / sessionStorage key prefix (`<prefix>.save`, `<prefix>.lang`…) */
export const LEGACY_KEY_PREFIX = `${LEGACY_PREFIX}.`;

/** Former name of a Cache API cache, IndexedDB database or OPFS directory (`<prefix>-d2-local`…) */
export const legacyStoreName = (suffix: string): string => `${LEGACY_PREFIX}-${suffix}`;

/** Plaintext of an encrypted folder's `verify` file (PBKDF2 / AES-GCM password check): compatibility, never shown */
export const LEGACY_D2_VERIFY_TEXT = `${LEGACY_PREFIX}-d2-ok`;
