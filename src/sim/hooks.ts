/**
 * Points d'extension à liaison tardive de la simulation. Chaque emplacement est rempli au chargement
 * du module qui possède l'implémentation (voir la fin de ce module) ; les appelants passent par ici
 * au lieu de l'importer, ce qui évite les cycles d'imports entre modules de la simulation.
 * Module feuille : n'importe que des types. world.ts charge tous les propriétaires.
 */
import type { World } from './world';
import type { Monster, SpawnOptions } from './actors';

const unset = (name: string) => (): never => {
  throw new Error(`Point d'extension « ${name} » non enregistré (module propriétaire non chargé)`);
};

export const simHooks = {
  /** Lance une compétence (propriétaire : skill-cast.ts) */
  castSkill: unset('castSkill') as (w: World, id: string, tx: number, ty: number, targetId: number, strike?: number) => void,
  /** Fait apparaître un monstre (propriétaire : spawn.ts) */
  spawnMonster: unset('spawnMonster') as (w: World, defId: string, x: number, y: number, opts: SpawnOptions, spawnKey: string) => Monster | null,
};
