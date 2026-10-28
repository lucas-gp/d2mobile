/**
 * Variable de build `MODS` : liste des mods inclus, séparés par des virgules. Absente : tous les mods présents dans `mods/` ; vide
 * (`MODS=`) : aucun (la base seule). Lue par le plugin Vite (tools/build/mods-plugin.ts), vitest et les outils en ligne de commande.
 * Module feuille, sans dépendance (chargé aussi par la configuration de Vite).
 */
export function parseModsEnv(v: string | undefined): string[] | null {
  if (v === undefined) return null;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Le mod est-il inclus par `MODS` (null : tous) ? */
export function modIncluded(id: string, wanted: string[] | null): boolean {
  return wanted === null || wanted.includes(id);
}
