/**
 * Plugin Vite (build, serveur de développement, vitest) : restreint la découverte des mods (src/mods/discover.ts, `import.meta.glob`) à
 * la liste `MODS` (src/mods/mods-env.ts). Un mod exclu n'est importé par rien : il n'entre pas dans le bundle. `MODS` absente : tous les
 * mods présents dans `mods/`.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { modIncluded, parseModsEnv } from '../../src/mods/mods-env.ts';

const GLOB = /import\.meta\.glob<ModManifest>\('\/mods\/\*\/manifest\.ts', \{ eager: true, import: 'default' \}\)/;

/** Mods présents dans `<root>/mods/` (dossiers avec un manifest), filtrés par `MODS` */
export function includedMods(root: string, env = process.env.MODS): string[] {
  const dir = join(root, 'mods');
  const wanted = parseModsEnv(env);
  const present = existsSync(dir)
    ? readdirSync(dir)
        .filter((d) => existsSync(join(dir, d, 'manifest.ts')))
        .sort()
    : [];
  for (const w of wanted ?? []) if (!present.includes(w)) throw new Error(`MODS : mod « ${w} » absent de mods/ (présents : ${present.join(', ') || 'aucun'})`);
  return present.filter((d) => modIncluded(d, wanted));
}

export function modsPlugin(root = process.cwd()): Plugin {
  return {
    name: 'd2m-mods',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/mods/discover.ts')) return null;
      if (!GLOB.test(code)) throw new Error('mods-plugin : découverte des mods introuvable dans src/mods/discover.ts (forme de la ligne import.meta.glob changée ?)');
      const mods = includedMods(root);
      const repl = mods.length ? `import.meta.glob<ModManifest>(${JSON.stringify(mods.map((m) => `/mods/${m}/manifest.ts`))}, { eager: true, import: 'default' })` : '{}';
      return { code: code.replace(GLOB, repl), map: null };
    },
  };
}
