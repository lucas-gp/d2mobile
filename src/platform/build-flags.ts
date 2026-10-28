/**
 * Drapeaux de build communs. `PUBLIC_BUILD` : version publique (D2_PUBLIC=1 au build, `__D2_PUBLIC__` défini dans vite.config.ts) :
 * sans dossier de sprites chiffré, sans coffre de guilde ni synchronisation des sauvegardes (aucune requête /api ou /guild-api).
 */
declare const __D2_PUBLIC__: boolean | undefined;
export const PUBLIC_BUILD: boolean = typeof __D2_PUBLIC__ !== 'undefined' && __D2_PUBLIC__ === true;

/**
 * "Import a D2 character" (.d2s) offered on the start screens (lot 286: hidden for now at the owner's request; the import itself is kept).
 * `true` offers it again; `?d2import=1` in the address shows it for one visit (e2e `tools/e2e/d2import.mjs`).
 */
export const D2_IMPORT_OFFERED = false;

/**
 * "Sign in" (the online account and the save synchronisation, lot 299: turned off at the owner's request). `false`: no "Se connecter" /
 * "Synchroniser" button on the start screens, no Synchronisation section in the settings, and the sync engine never starts (no request
 * to /api/sync at launch or later); the local saves work as before and the code stays in place. `true` offers it again (outside the
 * public build, which never has it). The guild's stash is not an account and is not concerned.
 */
export const SIGN_IN_OFFERED = false;

/** Is the account and save synchronisation available in this build (button, settings section, engine)? */
export const SYNC_ENABLED: boolean = SIGN_IN_OFFERED && !PUBLIC_BUILD;

/** Is "Import a D2 character" shown on the start screens? */
export function d2ImportShown(search: string = typeof location === 'undefined' ? '' : location.search): boolean {
  return D2_IMPORT_OFFERED || new URLSearchParams(search).get('d2import') === '1';
}

/** The game's Discord server (main menu, lot 286), opened in a new tab */
export const DISCORD_URL = 'https://discord.gg/j6w8YVauR';
