/**
 * La base du jeu, enregistrée comme un mod. Tout le contenu actuel (Diablo II LoD et les ajouts et valeurs Project Diablo 2 fondus
 * dedans) est encore celui des tables de `src/data`, chargées avant l'activation : les registres l'attribuent à la base dès leur création.
 * Les lots suivants du plan en sortent le contenu PD2 dans un mod, puis rendent la base vanilla.
 */
import type { ModDef } from './api';
import { BASE_MOD_ID } from './registry';

export const BASE_MOD: ModDef = {
  id: BASE_MOD_ID,
  name: 'Diablo II',
  version: '1.0.0',
  kind: 'base',
  register: () => {
    // contenu déjà présent dans les tables (voir l'en-tête) : rien à ajouter
  },
};
