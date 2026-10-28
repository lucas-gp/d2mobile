# On-device storage and the rename to D2 Mobile

Everything the game keeps on the device lives under the `d2m` name (D2 Mobile). Versions released before the rename used another
prefix; that prefix is spelled in exactly one file, [`src/platform/legacy-names.ts`](../src/platform/legacy-names.ts), and nowhere else
(enforced by `tests/unit/no-legacy-name.test.ts`, which also lists the Diablo II content names that are not the former name).

## Names

| Store | Name | Content |
|---|---|---|
| `localStorage` | `d2m.save.<uuid>` (+ `.backup`, `.presync`) | characters (`SaveData` JSON, `src/sim/save.ts`) |
| `localStorage` | `d2m.shared`, `d2m.shared.<ruleset>` (+ `.at`, `.backup`) | shared stash of each ruleset |
| `localStorage` | `d2m.active`, `d2m.lang`, `d2m.settings.cat`, `d2m.stats.id`, `d2m.stats.idAt`, `d2m.stats.off`, `d2m.sync.meta`, `d2m.sync.device`, `d2m.guild[.<ruleset>]`, `d2m.d2local*`, `d2m.d2pass`, `d2m.errlog`, `d2m.changelogSeen`, … | last character played, preferences, anonymous statistics id, sync and guild state, on-device Diablo II graphics state |
| `localStorage` | `d2m.mode` | mode picked at launch (full ruleset id, e.g. `pd2`, `d2`): activated at boot, its characters listed |
| `localStorage` | `d2m.migrated` | marker: the migration below ran on this device |
| `sessionStorage` | `d2m.d2skip`, `d2m.openList`, … | per-session flags (`openList`: the page reloaded for the mode just picked, open its character list) |
| IndexedDB | `d2m-sync` (`session`), `d2m-d2s` (`handles`), `d2m-d2local` (`handles`) | remembered sync session, remembered `.d2s` folder, remembered archive handles |
| Cache API | `d2m-app-<version>` | application files of one version (service worker; older versions are purged on activation) |
| Cache API | `d2m-d2`, `d2m-d2-local`, `d2m-d2-audio` | downloaded encrypted Diablo II files, graphics and sounds generated on the device |
| OPFS | `d2m-d2/` | copy of the player's Diablo II archives |

## Migration from earlier versions

`src/platform/storage-migrate-boot.ts` is the first import of `src/main.ts`, so it runs before any module reads the storage.

- **localStorage / sessionStorage** (`storage-migrate.ts`): every key of the former prefix is copied to the same key under `d2m.`.
  A key that already exists under `d2m.` is never overwritten. The value of `active` (itself a key) is renamed too. The former keys are
  **kept** as a fallback. When a copy does not fit in the quota, that key is moved instead (written under the new name, then the former
  removed). The migration runs once (`d2m.migrated`): a character deleted under its new name never comes back from its former copy. If
  the storage cannot be read (private mode, blocked storage), nothing happens and it is tried again on the next launch.
- **IndexedDB** (`idb-migrate.ts`): each small database is copied to its new name the first time it is opened, inside the upgrade
  transaction that creates the new database (all entries or nothing). The former database is kept.
- **Cache API and OPFS** (`storage-names.ts`): these stores can hold hundreds of megabytes, so they are **not copied** (a copy could
  exceed the quota and get the whole origin evicted). A store that exists under its former name keeps being used under that name; new
  installs and stores the player clears use the new name. The service worker applies the same rule to `d2m-d2`.
- **Service worker**: on activation it deletes the application caches of other versions (`d2m-app-*` and those of the former name) and
  never the data caches, under either name. (The service worker of earlier versions also deleted the on-device graphics and sounds
  caches on every update; that is fixed.)

### Clean-up in a later version

The former keys and databases stay on the device as a fallback. A later version, once every active player has launched a renamed
version, may delete them: remove every `localStorage` key returned by `legacyKeys()` whose new key exists (`freeLegacyCopies()` already
does exactly this, and is called today only when a save does not fit in the storage quota), and delete the three former IndexedDB
databases. The former Cache API and OPFS stores must **not** be deleted: they are the live stores of those players until cleared.

## Save format

Characters are saved as `SaveData` JSON, version 7 (`SAVE_VERSION`, `src/sim/save.ts`), migrated from versions 1 to 6 on load
(`MIGRATIONS`). A client refuses a save of a later version ("version plus récente") and keeps its copies untouched.

- **Run in progress** (`run`): the world's snapshot (monsters, ground items, generators), so the run can be restored. The base does not
  resume it (a reconnection starts in town, as in Diablo II); a game mode's run that sets `RunDef.resumeOnLoad` is resumed (docs/MODS.md).
- **`run.modState`** (optional, lot 279): state of a game mode's run director (Survivals: the round's clock, events done, bosses, elite
  waves, rerolls). Written only for such a run, so every other save keeps exactly its former shape; no version change: a v7 client that
  does not know the field ignores it (and a character of a game mode it does not have is greyed out anyway). Imported files pass the same
  checks (`checkSave`: finite numbers, bounded size and depth).

## Exported files

Exported characters (`d2m-<name>-lvl<level>.json`) are plain `SaveData` JSON, with no header or name inside: a file exported before the
rename imports in this version, and a file exported by this version imports in an earlier version that knows its save version.

## What did not change

Server-side identifiers (sync API fields, guild and statistics protocols, rulesets `pd2` / `d2`, content ids) never contained the former
name. The only cryptographic constant that does, the plaintext of the `verify` file of an encrypted folder (optional `D2_REMOTE` loader), is kept as is
(`LEGACY_D2_VERIFY_TEXT`): changing it would reject every correct password until the folder is re-encrypted.
