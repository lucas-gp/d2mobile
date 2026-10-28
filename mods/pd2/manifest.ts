/**
 * Mod Project Diablo 2 (saison 13) : refonte de Diablo II, jeu de règles `pd2` (celui de tous les personnages actuels). Manifest seul, chargé
 * au démarrage ; le contenu (index.ts) est un chunk séparé, chargé à l'activation du jeu de règles. Voir README.md.
 */
import { defineManifest } from '../../src/mods/api';

export default defineManifest({
  id: 'pd2',
  name: 'Project Diablo 2',
  version: '13.4.0',
  kind: 'overhaul',
  defaultOn: true,
  description: 'Règles de Project Diablo 2, saison 13 (mod de fans non officiel) : cartes d’endgame, corruption, compétences et objets revus.',
  tagline: 'Saison 13 : endgame, corruption, objets revus',
  i18n: {
    'Règles de Project Diablo 2, saison 13 (mod de fans non officiel) : cartes d’endgame, corruption, compétences et objets revus.':
      'Project Diablo 2 rules, season 13 (unofficial fan mod): endgame maps, corruption, reworked skills and items.',
    'Saison 13 : endgame, corruption, objets revus': 'Season 13: endgame, corruption, reworked items',
  },
  license: { data: 'CC-BY-SA-4.0', code: 'MIT', attribution: 'Project Diablo 2 Wiki contributors, https://wiki.projectdiablo2.com, CC BY-SA 4.0' },
  load: () => import('./index'),
});
