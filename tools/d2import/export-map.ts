/**
 * Cartes de villes de Diablo II (DS1) pour le jeu : Harrogath (Expansion/Town/townWest.ds1) et Tristram (Act1/Tristram/Tri_Town4.ds1).
 * Sortie dans <sortie>/game/maps/ :
 *   index.json                 liste des cartes
 *   <id>.json                  taille, grille de collision (sous-tuiles de 0,5 unité), objets, placements des structures
 *   <id>-g<n>.png / lo-…       sol : morceaux de 512 × 512 px (sols, ombres et tuiles de sol des couches de murs)
 *   <id>-t<n>.png              atlas des tuiles de structure (murs, toits, arbres) posées comme sprites triés en profondeur
 * Le jeu (src/render/d2map.ts) dessine ces morceaux à la place du décor 3D et prend la collision de la carte ; sans ces fichiers il garde sa zone d'origine.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GameData } from './data';
import { decorResolver, markResolver, monPresets } from './decor';
import { writeJson } from './manifest';
import { buildMap, type MapSpec, type MapTables } from './map-build';
import { NodeSink } from './node-sink';

import { MAPS } from './map-specs';

export type { MapSpec };
export { MAPS };

/**
 * Une carte vers le disque (CLI). Le calcul est dans map-build.ts (commun au Worker du navigateur) ; ici : les tables hors MPQ de base
 * (obj.txt et patch lus depuis le dossier d'import) et l'écriture sous <sortie>/game/maps/.
 */
export async function exportMap(data: GameData, spec: MapSpec, outDir: string, log: (s: string) => void): Promise<void> {
  const tables: MapTables = { decorOf: decorResolver(data, data.inDir), markOf: markResolver(data, data.inDir), monpreset: monPresets(data) };
  await buildMap(data, spec, new NodeSink(join(outDir, 'game')), log, { tiers: ['hi', 'lo'], tables });
}

export async function exportMaps(data: GameData, outDir: string, log: (s: string) => void, only?: string[]): Promise<void> {
  const done: string[] = [];
  for (const m of MAPS) {
    if (only?.length && !only.includes(`map_${m.id}`) && !only.includes('maps')) continue;
    try {
      await exportMap(data, m, outDir, log);
      done.push(m.id);
    } catch (e) {
      log(`  carte ${m.id} ÉCHEC → zone d'origine conservée : ${(e as Error).message}`);
    }
  }
  // l'index liste toutes les cartes présentes (un export partiel ne doit pas effacer les autres)
  const present = MAPS.filter((m) => existsSync(join(outDir, 'game', 'maps', `${m.id}.json`))).map((m) => m.id);
  if (done.length || present.length) writeJson(join(outDir, 'game', 'maps', 'index.json'), { maps: present });
}
