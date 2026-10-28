/**
 * Découverte des mods : tout dossier `mods/<id>/` qui contient un `manifest.ts` est un mod, sans aucune ligne à changer ailleurs (un
 * dossier supprimé n'est plus découvert : « test de suppression », tools/ci/suppression.mjs).
 * - Vite et vitest : `import.meta.glob` ; le plugin `modsPlugin` (tools/build/mods-plugin.ts) restreint le motif à la liste `MODS`, de
 *   sorte qu'un mod exclu n'entre pas dans le bundle.
 * - En ligne de commande (tsx, sans Vite) : l'outil fournit les manifests (`provideManifests`, voir tools/mods/node.ts).
 */
import type { ModManifest } from './api';

// la ligne `import.meta.glob(...)` est réécrite par le plugin (liste MODS) : la garder sur une ligne, sous cette forme exacte
const globbed: Record<string, ModManifest> = import.meta.env ? import.meta.glob<ModManifest>('/mods/*/manifest.ts', { eager: true, import: 'default' }) : {};

let provided: ModManifest[] | null = null;

/** Manifests fournis par un outil en ligne de commande (remplace la découverte par Vite) */
export function provideManifests(list: readonly ModManifest[]): void {
  provided = [...list];
}

/** Mods présents dans cette version, triés par identifiant */
export function discoveredMods(): ModManifest[] {
  for (const [path, m] of Object.entries(globbed)) if (path !== `/mods/${m.id}/manifest.ts`) throw new Error(`Mod « ${m.id} » : le dossier doit porter son identifiant (${path})`);
  const list = provided ?? Object.values(globbed);
  const seen = new Set<string>();
  for (const m of list) {
    if (seen.has(m.id)) throw new Error(`Mod « ${m.id} » en double`);
    seen.add(m.id);
  }
  return [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
