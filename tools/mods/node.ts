/**
 * Mods pour les outils en ligne de commande (tsx, sans Vite : pas d'`import.meta.glob`) : découverte des dossiers `mods/<id>/` filtrés
 * par `MODS`, comme le build (tools/build/mods-plugin.ts), puis activation du jeu de règles.
 *
 *   import { activateForTools } from '../mods/node';
 *   await activateForTools();            // jeu de règles par défaut (pd2 si le mod est présent, sinon d2)
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { ModManifest } from '../../src/mods/api';
import { provideManifests } from '../../src/mods/discover';
import { includedMods } from '../build/mods-plugin';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Fournit à src/mods les manifests des mods inclus (à appeler avant toute activation) */
export async function provideNodeMods(root = ROOT): Promise<ModManifest[]> {
  const list: ModManifest[] = [];
  for (const id of includedMods(root)) {
    const m = (await import(pathToFileURL(join(root, 'mods', id, 'manifest.ts')).href)).default as ModManifest;
    if (m.id !== id) throw new Error(`Mod « ${m.id} » : le dossier doit porter son identifiant (mods/${id})`);
    list.push(m);
  }
  provideManifests(list);
  return list;
}

/** Fournit les mods puis active un jeu de règles (défaut : celui d'un nouveau personnage) ; renvoie son identifiant */
export async function activateForTools(id?: string, opts: { freezeTables?: boolean } = {}): Promise<string> {
  await provideNodeMods();
  const A = await import('../../src/mods/activate');
  const rs = id ?? A.defaultRuleset();
  await A.activateRuleset(rs, opts);
  return rs;
}
