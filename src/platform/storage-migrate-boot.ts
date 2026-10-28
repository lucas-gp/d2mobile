/**
 * Side-effect module, imported FIRST by main.ts: ES modules run in import order, so the storage keys of the former name are copied
 * (storage-migrate.ts) before any other module reads the storage at load time (language, settings, saves).
 */
import { migrateAllStorage } from './storage-migrate';

/** Result of this launch's migration (diagnostics, end-to-end tests) */
export const bootMigration = migrateAllStorage();
if (typeof window !== 'undefined') (window as unknown as { __d2mMigration?: typeof bootMigration }).__d2mMigration = bootMigration;
